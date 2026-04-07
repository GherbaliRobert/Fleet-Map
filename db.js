// db.js — Conexiunea la PostgreSQL și operații cu baza de date
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

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

    // Migrari pentru coloane noi (devices) - adauga coloanele daca nu exista
    const migrateColumns = [
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tare_weight INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_legal INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_construct INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_axle_loads JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tank_calibration JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_price NUMERIC(10,2)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS cost_per_ton_km NUMERIC(10,2)`
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

async function createUser(username, passwordHash, role = 'viewer') {
  const result = await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
    [username, passwordHash, role]
  );
  return result.rows[0];
}

async function getUsers() {
  const result = await pool.query(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at'
  );
  return result.rows;
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
  updateTruckConfig,
  updateTankCalibration,
  getDeviceFull,
  insertPositions,
  getDevices,
  getDeviceHistory,
  getLastPositions,
  getUserByUsername,
  createUser,
  getUsers,
  deleteUser,
  updateUserPassword,
  getUserCount,
  getDrivers, createDriver, updateDriver, deleteDriver,
  getGroups, createGroup, updateGroup, deleteGroup,
  getGeofences, createGeofence, deleteGeofence,
  getAlerts, createAlert, deleteAlert, getAlertHistory, insertAlertEvent,
  getTrips, createTrip, endTrip,
  getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance
};
