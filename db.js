// db.js — Bază de date EMBEDDED (PGlite = PostgreSQL în proces, persistă local).
// Zero servicii externe: aplicația rulează 100% local doar cu `node server.js`.
const path = require('path');
const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');

// Folder de date local (configurabil). Implicit ./data/pgdata
const DATA_DIR = process.env.PGLITE_DIR || path.join(__dirname, 'data', 'pgdata');
try { fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true }); } catch (e) { /* ignore */ }

const pglite = new PGlite(DATA_DIR);

// PGlite e single-connection → serializăm accesul printr-un mutex simplu (FIFO).
class Mutex {
  constructor() { this._tail = Promise.resolve(); }
  acquire() {
    let release;
    const next = new Promise(res => { release = res; });
    const prev = this._tail;
    this._tail = this._tail.then(() => next);
    return prev.then(() => release);
  }
}
const _mutex = new Mutex();

// Adapter compatibil cu interfața pg.Pool folosită în rest (pool.query / pool.connect).
const pool = {
  raw: pglite,
  async query(text, params) {
    await pglite.waitReady;
    const release = await _mutex.acquire();
    try { return await pglite.query(text, params || []); }
    finally { release(); }
  },
  // „client" exclusiv pentru tranzacții (BEGIN/COMMIT) — ține lock-ul până la release()
  async connect() {
    await pglite.waitReady;
    const release = await _mutex.acquire();
    return {
      query: (text, params) => pglite.query(text, params || []),
      release: () => release()
    };
  }
};

async function initDb() {
  const client = await pool.connect();
  try {
    // Tabela dispozitivelor — se creează automat la prima conectare
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        imei VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100),
        vehicle_type VARCHAR(50),
        plate VARCHAR(20),
        tare_weight INTEGER,
        max_weight_legal INTEGER,
        max_weight_construct INTEGER,
        max_axle_loads JSONB,
        tank_calibration JSONB,
        fuel_price NUMERIC(10,2),
        cost_per_ton_km NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP
      )
    `);

    // Tabela pozițiilor GPS
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id BIGSERIAL PRIMARY KEY,
        imei VARCHAR(20) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        altitude INTEGER,
        angle INTEGER,
        speed INTEGER,
        satellites INTEGER,
        priority INTEGER,
        io_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Index pe imei + timestamp pentru query-uri rapide
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_positions_imei_ts 
      ON positions (imei, timestamp DESC)
    `);

    // Index pe timestamp pentru curățare date vechi
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_positions_ts 
      ON positions (timestamp)
    `);

    // Tabela utilizatorilor
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela soferi
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100),
        license_number VARCHAR(30),
        license_expiry DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela grupe vehicule
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        description VARCHAR(200),
        color VARCHAR(7),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Extindere tabela devices cu campuri noi
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS brand VARCHAR(50);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS model VARCHAR(50);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS year INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS vin VARCHAR(17);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS tank_capacity INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES device_groups(id);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS icon VARCHAR(20) DEFAULT 'car';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS color VARCHAR(7);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes TEXT;
      END $$
    `);

    // Tabela geofences (zone geografice)
    await client.query(`
      CREATE TABLE IF NOT EXISTS geofences (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) DEFAULT 'polygon',
        coordinates JSONB NOT NULL,
        color VARCHAR(7) DEFAULT '#2563eb',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela alerte configurabile
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(30) NOT NULL,
        imei VARCHAR(20),
        condition JSONB NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela istoric alerte
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id BIGSERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(id),
        imei VARCHAR(20) NOT NULL,
        triggered_at TIMESTAMP DEFAULT NOW(),
        data JSONB,
        acknowledged BOOLEAN DEFAULT false
      )
    `);

    // Tabela calatorii (trips)
    await client.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id BIGSERIAL PRIMARY KEY,
        imei VARCHAR(20) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        start_lat DOUBLE PRECISION,
        start_lng DOUBLE PRECISION,
        end_lat DOUBLE PRECISION,
        end_lng DOUBLE PRECISION,
        start_address VARCHAR(200),
        end_address VARCHAR(200),
        distance_km DOUBLE PRECISION DEFAULT 0,
        max_speed INTEGER DEFAULT 0,
        avg_speed DOUBLE PRECISION DEFAULT 0,
        fuel_used DOUBLE PRECISION,
        duration_seconds INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela mentenanta
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance (
        id SERIAL PRIMARY KEY,
        imei VARCHAR(20) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        due_date DATE,
        due_km INTEGER,
        done_date DATE,
        done_km INTEGER,
        cost DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Indecsi noi
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_imei_start ON trips (imei, start_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alert_history_imei ON alert_history (imei, triggered_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_maintenance_imei ON maintenance (imei, status)`);

    // ─── RBAC: roluri extinse, acces per utilizator, audit ───
    // Coloane noi pe users (profil + status + ultima logare)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
      END $$
    `);

    // Acces pe vehicule individuale (user -> imei)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_device_access (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        imei VARCHAR(20) NOT NULL,
        PRIMARY KEY (user_id, imei)
      )
    `);

    // Acces pe grupe de vehicule (user -> grup)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_group_access (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, group_id)
      )
    `);

    // Jurnal audit (cine, ce, când)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER,
        username VARCHAR(50),
        action VARCHAR(40) NOT NULL,
        entity VARCHAR(40),
        entity_id VARCHAR(60),
        details JSONB,
        ip VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_uda_user ON user_device_access (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_uga_user ON user_group_access (user_id)`);

    // Chei API (acces programatic) — stocăm doar hash-ul cheii
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100),
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        prefix VARCHAR(16),
        last_used TIMESTAMP,
        revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys (user_id)`);

    // Notificări (centru in-app) — alerte, expirări documente, sistem
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        type VARCHAR(40) NOT NULL,
        severity VARCHAR(10) DEFAULT 'info',
        imei VARCHAR(20),
        title VARCHAR(200),
        body TEXT,
        data JSONB,
        acknowledged BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_ack ON notifications (acknowledged)`);
    await client.query(`DO $$ BEGIN ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INTEGER; END $$`);

    // Preferințe notificări per utilizator (abonamente la tipuri de evenimente + canale + praguri)
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_prefs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        prefs JSONB NOT NULL DEFAULT '{}'
      )
    `);

    // Abonamente Web Push (per dispozitiv/browser al utilizatorului)
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT UNIQUE NOT NULL,
        subscription JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id)`);

    // Migrari pentru coloane noi (devices) - adauga coloanele daca nu exista
    const migrateColumns = [
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tare_weight INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_legal INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_construct INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_axle_loads JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tank_calibration JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_price NUMERIC(10,2)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS cost_per_ton_km NUMERIC(10,2)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_sensors JSONB`
    ];
    for (const sql of migrateColumns) {
      try { await client.query(sql); } catch (e) { console.warn('[DB] Migration warning:', e.message); }
    }

    console.log('[DB] Tabele create / verificate');
  } finally {
    client.release();
  }
}

async function upsertDevice(imei) {
  await pool.query(`
    INSERT INTO devices (imei, last_seen) 
    VALUES ($1, NOW()) 
    ON CONFLICT (imei) 
    DO UPDATE SET last_seen = NOW()
  `, [imei]);
}

async function updateDeviceInfo(imei, name, vehicleType, plate) {
  await pool.query(`
    UPDATE devices
    SET name = $2, vehicle_type = $3, plate = $4
    WHERE imei = $1
  `, [imei, name, vehicleType, plate]);
}

async function assignDevice(imei, driverId, groupId) {
  await pool.query(
    'UPDATE devices SET driver_id = $2, group_id = $3 WHERE imei = $1',
    [imei, driverId || null, groupId || null]
  );
}

async function updateTruckConfig(imei, config) {
  await pool.query(`
    UPDATE devices
    SET tare_weight = $2,
        max_weight_legal = $3,
        max_weight_construct = $4,
        max_axle_loads = $5,
        fuel_price = $6,
        cost_per_ton_km = $7
    WHERE imei = $1
  `, [
    imei,
    config.tareWeight || null,
    config.maxWeightLegal || null,
    config.maxWeightConstruct || null,
    config.maxAxleLoads ? JSON.stringify(config.maxAxleLoads) : null,
    config.fuelPrice || null,
    config.costPerTonKm || null
  ]);
}

async function updateTankCalibration(imei, calibration) {
  await pool.query(
    'UPDATE devices SET tank_calibration = $2 WHERE imei = $1',
    [imei, JSON.stringify(calibration)]
  );
}

async function setFuelSensors(imei, sensors) {
  await pool.query(
    'UPDATE devices SET fuel_sensors = $2 WHERE imei = $1',
    [imei, sensors ? JSON.stringify(sensors) : null]
  );
}
async function getFuelSensorsRow(imei) {
  const r = await pool.query('SELECT fuel_sensors FROM devices WHERE imei = $1', [imei]);
  if (!r.rows[0] || !r.rows[0].fuel_sensors) return null;
  const s = r.rows[0].fuel_sensors;
  return typeof s === 'string' ? JSON.parse(s) : s;
}

async function getDeviceFull(imei) {
  const result = await pool.query('SELECT * FROM devices WHERE imei = $1', [imei]);
  return result.rows[0] || null;
}

async function insertPositions(imei, records) {
  if (records.length === 0) return;

  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const record of records) {
    const gps = record.gps;
    
    // Ignoră recordurile fără fix GPS valid
    if (gps.latitude === 0 && gps.longitude === 0) continue;

    values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9})`);
    params.push(
      imei,
      record.timestamp,
      gps.latitude,
      gps.longitude,
      gps.altitude,
      gps.angle,
      gps.speed,
      gps.satellites,
      record.priority,
      JSON.stringify(record.io)
    );
    paramIndex += 10;
  }

  if (values.length === 0) return;

  const query = `
    INSERT INTO positions (imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data)
    VALUES ${values.join(', ')}
  `;

  await pool.query(query, params);
}

async function getDevices() {
  const result = await pool.query(`
    SELECT d.*, 
      p.latitude, p.longitude, p.speed, p.timestamp as last_position_time,
      p.io_data
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, speed, timestamp, io_data
      FROM positions 
      WHERE positions.imei = d.imei 
      ORDER BY timestamp DESC 
      LIMIT 1
    ) p ON true
    ORDER BY d.last_seen DESC
  `);
  return result.rows;
}

async function getDeviceHistory(imei, from, to) {
  const result = await pool.query(`
    SELECT timestamp, latitude, longitude, altitude, angle, speed, satellites, io_data
    FROM positions
    WHERE imei = $1 AND timestamp BETWEEN $2 AND $3
    ORDER BY timestamp ASC
  `, [imei, from, to]);
  return result.rows;
}

async function getLastPositions() {
  const result = await pool.query(`
    SELECT DISTINCT ON (imei) 
      imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, io_data
    FROM positions
    ORDER BY imei, timestamp DESC
  `);
  return result.rows;
}

// ─── Funcții utilizatori ───

async function getUserByUsername(username) {
  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0] || null;
}

async function createUser(username, passwordHash, role = 'viewer', extra = {}) {
  const result = await pool.query(
    'INSERT INTO users (username, password_hash, role, full_name, email, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, role, full_name, email, phone, active, created_at',
    [username, passwordHash, role, extra.full_name || null, extra.email || null, extra.phone || null]
  );
  return result.rows[0];
}

async function getUsers() {
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.full_name, u.email, u.phone, u.active, u.last_login, u.created_at,
      (SELECT COUNT(*) FROM user_device_access WHERE user_id = u.id) AS device_count,
      (SELECT COUNT(*) FROM user_group_access WHERE user_id = u.id) AS group_count
    FROM users u ORDER BY u.created_at
  `);
  return result.rows;
}

async function getUserById(id) {
  const result = await pool.query(
    'SELECT id, username, role, full_name, email, phone, active, last_login, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function updateUserProfile(id, data) {
  await pool.query(
    `UPDATE users SET
       role = COALESCE($2, role),
       full_name = $3,
       email = $4,
       phone = $5,
       active = COALESCE($6, active)
     WHERE id = $1`,
    [id, data.role || null, data.full_name || null, data.email || null, data.phone || null,
     (data.active === undefined ? null : data.active)]
  );
}

async function setUserLastLogin(id) {
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]);
}

// ─── Acces utilizatori (multi-client) ───

// Lista IMEI-urilor la care userul are acces: direct + prin grupele atribuite
async function computeAllowedImeis(userId) {
  const result = await pool.query(`
    SELECT imei FROM user_device_access WHERE user_id = $1
    UNION
    SELECT d.imei FROM devices d
      JOIN user_group_access uga ON uga.group_id = d.group_id
      WHERE uga.user_id = $1
  `, [userId]);
  return result.rows.map(r => r.imei);
}

async function getUserAccess(userId) {
  const dev = await pool.query('SELECT imei FROM user_device_access WHERE user_id = $1', [userId]);
  const grp = await pool.query('SELECT group_id FROM user_group_access WHERE user_id = $1', [userId]);
  return { devices: dev.rows.map(r => r.imei), groups: grp.rows.map(r => r.group_id) };
}

async function setUserAccess(userId, devices, groups) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_device_access WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_group_access WHERE user_id = $1', [userId]);
    for (const imei of (devices || [])) {
      await client.query('INSERT INTO user_device_access (user_id, imei) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, String(imei)]);
    }
    for (const gid of (groups || [])) {
      await client.query('INSERT INTO user_group_access (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, parseInt(gid)]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Audit ───

async function logAudit(entry) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, username, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [entry.userId || null, entry.username || null, entry.action,
       entry.entity || null, entry.entityId != null ? String(entry.entityId) : null,
       entry.details ? JSON.stringify(entry.details) : null, entry.ip || null]
    );
  } catch (e) { console.warn('[AUDIT]', e.message); }
}

async function getAuditLog(limit = 100, offset = 0) {
  const result = await pool.query(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}

// ─── Chei API ───

async function createApiKey(userId, name, keyHash, prefix) {
  const result = await pool.query(
    'INSERT INTO api_keys (user_id, name, key_hash, prefix) VALUES ($1,$2,$3,$4) RETURNING id, user_id, name, prefix, created_at',
    [userId, name || null, keyHash, prefix]
  );
  return result.rows[0];
}

async function getApiKeys() {
  const result = await pool.query(`
    SELECT k.id, k.name, k.prefix, k.last_used, k.revoked, k.created_at,
           k.user_id, u.username, u.role
    FROM api_keys k JOIN users u ON u.id = k.user_id
    ORDER BY k.created_at DESC
  `);
  return result.rows;
}

async function getUserByApiKey(keyHash) {
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.active, k.id AS key_id
    FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.key_hash = $1 AND k.revoked = false
  `, [keyHash]);
  const row = result.rows[0];
  if (row) { pool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [row.key_id]).catch(() => {}); }
  return row || null;
}

async function revokeApiKey(id) {
  await pool.query('UPDATE api_keys SET revoked = true WHERE id = $1', [id]);
}

async function cleanupExpiredSessions() {
  try { await pool.query('DELETE FROM user_sessions WHERE expire < NOW()'); } catch (e) { /* tabela poate lipsi încă */ }
}

async function deleteOldPositions(days) {
  const result = await pool.query(
    `DELETE FROM positions WHERE timestamp < NOW() - ($1 || ' days')::interval`,
    [String(days)]
  );
  return result.affectedRows || (result.rowCount || 0);
}

// ─── Notificări ───

async function createNotification(n) {
  const r = await pool.query(
    'INSERT INTO notifications (type, severity, imei, title, body, data, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [n.type, n.severity || 'info', n.imei || null, n.title || null, n.body || null, n.data ? JSON.stringify(n.data) : null, n.userId || null]
  );
  return r.rows[0];
}
async function notificationKeyExists(key, hours) {
  const r = await pool.query(
    "SELECT 1 FROM notifications WHERE data->>'key' = $1 AND created_at > NOW() - ($2 || ' hours')::interval LIMIT 1",
    [key, String(hours)]
  );
  return r.rows.length > 0;
}
// Vizibilitate: notificările personale (user_id = userId) + cele broadcast (user_id NULL) pentru vehiculele accesibile
function _notifWhere(userId, imeis) {
  if (imeis === null) return { clause: '(user_id = $1 OR user_id IS NULL)', params: [userId] };
  return { clause: '(user_id = $1 OR (user_id IS NULL AND (imei = ANY($2) OR imei IS NULL)))', params: [userId, imeis] };
}
async function getNotifications(userId, imeis, limit = 50) {
  const w = _notifWhere(userId, imeis);
  const r = await pool.query(`SELECT * FROM notifications WHERE ${w.clause} ORDER BY created_at DESC LIMIT $${w.params.length + 1}`, [...w.params, limit]);
  return r.rows;
}
async function unreadNotifications(userId, imeis) {
  const w = _notifWhere(userId, imeis);
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE acknowledged = false AND ${w.clause}`, w.params);
  return r.rows[0].n;
}
async function ackNotification(id) { await pool.query('UPDATE notifications SET acknowledged = true WHERE id = $1', [id]); }
async function ackAllNotifications(userId, imeis) {
  const w = _notifWhere(userId, imeis);
  await pool.query(`UPDATE notifications SET acknowledged = true WHERE acknowledged = false AND ${w.clause}`, w.params);
}

// ─── Preferințe notificări per utilizator ───
async function getNotificationPrefs(userId) {
  const r = await pool.query('SELECT prefs FROM notification_prefs WHERE user_id = $1', [userId]);
  const p = r.rows[0] ? r.rows[0].prefs : {};
  return typeof p === 'string' ? JSON.parse(p) : (p || {});
}
async function setNotificationPrefs(userId, prefs) {
  await pool.query('INSERT INTO notification_prefs (user_id, prefs) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs', [userId, JSON.stringify(prefs)]);
}
async function getAllNotificationPrefs() {
  const r = await pool.query('SELECT user_id, prefs FROM notification_prefs');
  const map = {};
  for (const row of r.rows) map[row.user_id] = typeof row.prefs === 'string' ? JSON.parse(row.prefs) : row.prefs;
  return map;
}

// ─── Web Push ───
async function savePushSubscription(userId, sub) {
  await pool.query(
    'INSERT INTO push_subscriptions (user_id, endpoint, subscription) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, subscription = EXCLUDED.subscription',
    [userId, sub.endpoint, JSON.stringify(sub)]
  );
}
async function getPushSubscriptions(userId) {
  const r = await pool.query('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1', [userId]);
  return r.rows.map(x => ({ endpoint: x.endpoint, subscription: typeof x.subscription === 'string' ? JSON.parse(x.subscription) : x.subscription }));
}
async function deletePushSubscription(endpoint) {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// Utilizatori care au acces la un vehicul (pentru livrarea per-user a evenimentelor)
async function getUsersForImei(imei) {
  const r = await pool.query(`
    SELECT DISTINCT u.id, u.username, u.email, u.role FROM users u
    WHERE u.active IS NOT FALSE AND (
      u.role IN ('admin','manager')
      OR EXISTS (SELECT 1 FROM user_device_access uda WHERE uda.user_id = u.id AND uda.imei = $1)
      OR EXISTS (SELECT 1 FROM user_group_access uga JOIN devices d ON d.group_id = uga.group_id WHERE uga.user_id = u.id AND d.imei = $1)
    )`, [imei]);
  return r.rows;
}
async function getAllActiveUsers() {
  const r = await pool.query("SELECT id, username, email, role FROM users WHERE active IS NOT FALSE");
  return r.rows;
}

// ─── Curse detectate automat ───
async function saveTripsForRange(imei, from, to, trips) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM trips WHERE imei = $1 AND start_time >= $2 AND start_time <= $3', [imei, from, to]);
    for (const tr of trips) {
      await client.query(
        `INSERT INTO trips (imei, start_time, end_time, start_lat, start_lng, end_lat, end_lng, distance_km, max_speed, avg_speed, duration_seconds)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [imei, tr.start, tr.end, tr.startLat, tr.startLng, tr.endLat, tr.endLng, tr.distanceKm, tr.maxSpeed, tr.avgSpeed, Math.round(tr.durationSec)]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Închidere curată: flush PGlite pe disc (apelat la shutdown — important pentru durabilitate)
async function closeDb() {
  try { await pglite.close(); } catch (e) { /* ignore */ }
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

async function updateUserPassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count);
}

// ─── Funcții soferi ───

async function getDrivers() {
  const result = await pool.query('SELECT * FROM drivers ORDER BY name');
  return result.rows;
}

async function createDriver(data) {
  const result = await pool.query(
    'INSERT INTO drivers (name, phone, email, license_number, license_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [data.name, data.phone, data.email, data.license_number, data.license_expiry]
  );
  return result.rows[0];
}

async function updateDriver(id, data) {
  await pool.query(
    'UPDATE drivers SET name=$2, phone=$3, email=$4, license_number=$5, license_expiry=$6 WHERE id=$1',
    [id, data.name, data.phone, data.email, data.license_number, data.license_expiry]
  );
}

async function deleteDriver(id) {
  await pool.query('UPDATE devices SET driver_id = NULL WHERE driver_id = $1', [id]);
  await pool.query('DELETE FROM drivers WHERE id = $1', [id]);
}

// ─── Funcții grupe ───

async function getGroups() {
  const result = await pool.query('SELECT * FROM device_groups ORDER BY name');
  return result.rows;
}

async function createGroup(data) {
  const result = await pool.query(
    'INSERT INTO device_groups (name, description, color) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.description, data.color]
  );
  return result.rows[0];
}

async function updateGroup(id, data) {
  await pool.query(
    'UPDATE device_groups SET name=$2, description=$3, color=$4 WHERE id=$1',
    [id, data.name, data.description, data.color]
  );
}

async function deleteGroup(id) {
  await pool.query('UPDATE devices SET group_id = NULL WHERE group_id = $1', [id]);
  await pool.query('DELETE FROM device_groups WHERE id = $1', [id]);
}

// ─── Funcții geofences ───

async function getGeofences() {
  const result = await pool.query('SELECT * FROM geofences ORDER BY name');
  return result.rows;
}

async function createGeofence(data) {
  const result = await pool.query(
    'INSERT INTO geofences (name, type, coordinates, color) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.name, data.type, JSON.stringify(data.coordinates), data.color]
  );
  return result.rows[0];
}

async function updateGeofence(id, data) {
  await pool.query(
    'UPDATE geofences SET name=$2, type=$3, coordinates=$4, color=$5 WHERE id=$1',
    [id, data.name, data.type, JSON.stringify(data.coordinates), data.color]
  );
}

async function deleteGeofence(id) {
  await pool.query('DELETE FROM geofences WHERE id = $1', [id]);
}

// ─── Funcții alerte ───

async function getAlerts() {
  const result = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC');
  return result.rows;
}

async function createAlert(data) {
  const result = await pool.query(
    'INSERT INTO alerts (name, type, imei, condition, enabled) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [data.name, data.type, data.imei, JSON.stringify(data.condition), data.enabled !== false]
  );
  return result.rows[0];
}

async function deleteAlert(id) {
  await pool.query('DELETE FROM alert_history WHERE alert_id = $1', [id]);
  await pool.query('DELETE FROM alerts WHERE id = $1', [id]);
}

async function getAlertHistory(limit = 50) {
  const result = await pool.query(
    'SELECT ah.*, a.name as alert_name, a.type as alert_type FROM alert_history ah LEFT JOIN alerts a ON a.id = ah.alert_id ORDER BY ah.triggered_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

async function insertAlertEvent(alertId, imei, data) {
  await pool.query(
    'INSERT INTO alert_history (alert_id, imei, data) VALUES ($1, $2, $3)',
    [alertId, imei, JSON.stringify(data)]
  );
}

// ─── Funcții trips ───

async function getTrips(imei, from, to) {
  const result = await pool.query(
    'SELECT * FROM trips WHERE imei = $1 AND start_time >= $2 AND start_time <= $3 ORDER BY start_time DESC',
    [imei, from, to]
  );
  return result.rows;
}

async function createTrip(data) {
  const result = await pool.query(
    'INSERT INTO trips (imei, start_time, start_lat, start_lng) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.imei, data.start_time, data.start_lat, data.start_lng]
  );
  return result.rows[0];
}

async function endTrip(id, data) {
  await pool.query(
    'UPDATE trips SET end_time=$2, end_lat=$3, end_lng=$4, distance_km=$5, max_speed=$6, avg_speed=$7, duration_seconds=$8 WHERE id=$1',
    [id, data.end_time, data.end_lat, data.end_lng, data.distance_km, data.max_speed, data.avg_speed, data.duration_seconds]
  );
}

// ─── Funcții mentenanta ───

async function getMaintenance(imei) {
  let query = 'SELECT * FROM maintenance';
  const params = [];
  if (imei) {
    query += ' WHERE imei = $1';
    params.push(imei);
  }
  query += ' ORDER BY CASE WHEN status = \'pending\' THEN 0 WHEN status = \'overdue\' THEN 1 ELSE 2 END, due_date';
  const result = await pool.query(query, params);
  return result.rows;
}

async function createMaintenance(data) {
  const result = await pool.query(
    'INSERT INTO maintenance (imei, type, description, due_date, due_km, cost, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [data.imei, data.type, data.description, data.due_date, data.due_km, data.cost, data.status || 'pending']
  );
  return result.rows[0];
}

async function updateMaintenance(id, data) {
  await pool.query(
    'UPDATE maintenance SET type=$2, description=$3, due_date=$4, due_km=$5, done_date=$6, done_km=$7, cost=$8, status=$9 WHERE id=$1',
    [id, data.type, data.description, data.due_date, data.due_km, data.done_date, data.done_km, data.cost, data.status]
  );
}

async function deleteMaintenance(id) {
  await pool.query('DELETE FROM maintenance WHERE id = $1', [id]);
}

module.exports = {
  pool,
  initDb,
  upsertDevice,
  updateDeviceInfo,
  assignDevice,
  updateTruckConfig,
  updateTankCalibration,
  setFuelSensors,
  getFuelSensorsRow,
  getDeviceFull,
  insertPositions,
  getDevices,
  getDeviceHistory,
  getLastPositions,
  getUserByUsername,
  createUser,
  getUsers,
  getUserById,
  updateUserProfile,
  setUserLastLogin,
  deleteUser,
  updateUserPassword,
  getUserCount,
  computeAllowedImeis,
  getUserAccess,
  setUserAccess,
  logAudit,
  getAuditLog,
  createApiKey,
  getApiKeys,
  getUserByApiKey,
  revokeApiKey,
  cleanupExpiredSessions,
  deleteOldPositions,
  createNotification,
  notificationKeyExists,
  getNotifications,
  unreadNotifications,
  ackNotification,
  ackAllNotifications,
  getNotificationPrefs,
  setNotificationPrefs,
  getAllNotificationPrefs,
  savePushSubscription,
  getPushSubscriptions,
  deletePushSubscription,
  getUsersForImei,
  getAllActiveUsers,
  saveTripsForRange,
  closeDb,
  getDrivers, createDriver, updateDriver, deleteDriver,
  getGroups, createGroup, updateGroup, deleteGroup,
  getGeofences, createGeofence, updateGeofence, deleteGeofence,
  getAlerts, createAlert, deleteAlert, getAlertHistory, insertAlertEvent,
  getTrips, createTrip, endTrip,
  getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance
};
