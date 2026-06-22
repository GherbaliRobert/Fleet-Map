// db.js — Strat de bază de date DUAL-MODE:
//  • dacă DATABASE_URL e setat → PostgreSQL real (Railway/managed, scalabil, TimescaleDB)
//  • altfel → PGlite embedded (local / DigitalOcean, 100% local, fără servicii externe)
// Restul codului folosește aceeași interfață (pool.query / pool.connect), deci e transparent.
const path = require('path');
const fs = require('fs');

const USE_PG = !!process.env.DATABASE_URL;
let pool, _pglite = null;
// Flag: există index UNIQUE pe positions(imei, timestamp)? Dacă da, insertPositions folosește ON CONFLICT DO NOTHING
// (previne duplicate la retry tracker când ACK-ul e pierdut). Setat în initDb; dacă crearea eșuează → false → INSERT simplu.
let positionsUniqueIdx = false;

if (USE_PG) {
  // ─── PostgreSQL real (pg.Pool are nativ .query și .connect → drop-in, fără mutex, concurență reală) ───
  const { Pool } = require('pg');
  // SSL auto: rețeaua internă Railway (postgres.railway.internal) și localhost NU acceptă SSL;
  // cloud public (Timescale Cloud, URL public *.rlwy.net) îl cere. Override explicit prin PGSSL.
  const _u = process.env.DATABASE_URL || '';
  const _m = (process.env.PGSSL || '').toLowerCase();
  let _ssl;
  if (_m === 'disable' || _m === 'false' || _m === 'off') _ssl = false;
  else if (_m === 'require' || _m === 'true' || _m === 'on') _ssl = { rejectUnauthorized: false };
  else if (/sslmode=disable/.test(_u) || /\.railway\.internal|@localhost|@127\.0\.0\.1|@postgres[:/]/.test(_u)) _ssl = false;
  else _ssl = { rejectUnauthorized: false };
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: _ssl,
    max: parseInt(process.env.PG_POOL_MAX) || 10
  });
  pool.raw = null;
  console.log(`[DB] PostgreSQL (DATABASE_URL) — mod scalabil (SSL: ${_ssl ? 'on' : 'off'})`);
} else {
  // ─── PGlite embedded — single-connection, serializat printr-un mutex simplu (FIFO) ───
  const { PGlite } = require('@electric-sql/pglite');
  const DATA_DIR = process.env.PGLITE_DIR || path.join(__dirname, 'data', 'pgdata');
  try { fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true }); } catch (e) { /* ignore */ }
  _pglite = new PGlite(DATA_DIR);
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
  pool = {
    raw: _pglite,
    async query(text, params) {
      await _pglite.waitReady;
      const release = await _mutex.acquire();
      try { return await _pglite.query(text, params || []); }
      finally { release(); }
    },
    async connect() {
      await _pglite.waitReady;
      const release = await _mutex.acquire();
      return {
        query: (text, params) => _pglite.query(text, params || []),
        release: () => release()
      };
    }
  };
  console.log('[DB] PGlite embedded (local)');
}

// ─── Slow-query logging (observabilitate la scară) ───
// Înregistrează în error_log query-urile care depășesc SLOW_QUERY_MS (default 1500ms).
// Guard anti-recursie: NU loghează insert-urile în error_log însuși. Folosește query-ul brut.
{
  const _origQuery = pool.query.bind(pool);
  const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS) || 1500;
  pool.query = async function (text, params) {
    const t0 = Date.now();
    try {
      return await _origQuery(text, params);
    } finally {
      const dt = Date.now() - t0;
      if (dt >= SLOW_QUERY_MS && typeof text === 'string' && text.indexOf('error_log') === -1) {
        _origQuery(
          'INSERT INTO error_log (level, message, context) VALUES ($1,$2,$3)',
          ['warn', 'SLOW QUERY ' + dt + 'ms', JSON.stringify({ ms: dt, sql: String(text).replace(/\s+/g, ' ').trim().slice(0, 300) })]
        ).catch(() => {});
      }
    }
  };
}

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

    // ─── Arhivă poziții: istoricul „înghețat" al dispozitivelor arhivate (contract încheiat) ───
    // La arhivare copiem aici pozițiile dispozitivului (archiveDevicePositions). `positions` rămâne pe retenția
    // scurtă (180z, active), iar `positions_archive` e păstrată mai mult (purgeArchivedPositions → 2 ani).
    // Astfel „memoria veche" NU se pierde chiar dacă tracker-ul nu mai trimite și pozițiile vii expiră din hypertable.
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions_archive (
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
        company_id INTEGER,
        archived_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_posarch_imei_ts ON positions_archive (imei, timestamp)`);

    // ─── TimescaleDB (doar pe Postgres real): hypertable + compresie + retenție pe `positions` ───
    // La 4s × multe vehicule, asta ține storage-ul în frâu (compresie ~85-90% + ștergere automată a datelor vechi).
    if (USE_PG) {
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
        await client.query('ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_pkey'); // hypertable cere ca PK să includă timestamp
        await client.query("SELECT create_hypertable('positions','timestamp', if_not_exists => TRUE, migrate_data => TRUE)");
        await client.query("ALTER TABLE positions SET (timescaledb.compress, timescaledb.compress_segmentby = 'imei')");
        await client.query("SELECT add_compression_policy('positions', INTERVAL '7 days', if_not_exists => TRUE)");
        const retDays = parseInt(process.env.POSITION_RETENTION_DAYS) || 180;
        await client.query("SELECT add_retention_policy('positions', INTERVAL '" + retDays + " days', if_not_exists => TRUE)");
        console.log('[DB] TimescaleDB activ: hypertable positions + compresie >7z + retenție ' + retDays + 'z');
      } catch (e) {
        console.warn('[DB] TimescaleDB indisponibil → rulez pe Postgres simplu:', e.message);
      }
    }

    // Index UNIQUE pe (imei, timestamp) — previne duplicate la retry tracker (ACK pierdut → retrimite batch-ul).
    // Guarded: dacă există deja duplicate, dedupe (păstrează id-ul minim) + retry o singură dată.
    // Dacă tot eșuează (ex: hypertable comprimat refuză), lăsăm flag-ul false → insertPositions face INSERT simplu (zero regresie).
    // Notă: inserturile vizează mereu timestamp-uri noi (chunk-ul curent, necomprimat), deci ON CONFLICT nu atinge date comprimate.
    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_imei_ts_uniq ON positions (imei, timestamp)`);
      positionsUniqueIdx = true;
    } catch (e1) {
      try {
        await client.query(`DELETE FROM positions a USING positions b WHERE a.id > b.id AND a.imei = b.imei AND a.timestamp = b.timestamp`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_imei_ts_uniq ON positions (imei, timestamp)`);
        positionsUniqueIdx = true;
        console.log('[DB] Dedupe pozitii + index UNIQUE (imei, timestamp) creat');
      } catch (e2) {
        console.warn('[DB] Index UNIQUE pe positions indisponibil → INSERT fără ON CONFLICT:', e2.message);
      }
    }

    // Observabilitate: jurnal de erori centralizat (persistent, înlocuiește log-ul circular in-memory).
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_log (
        id BIGSERIAL PRIMARY KEY,
        level VARCHAR(10) DEFAULT 'error',
        message TEXT,
        stack TEXT,
        route VARCHAR(255),
        method VARCHAR(10),
        status INTEGER,
        user_id INTEGER,
        company_id INTEGER,
        context JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC)`);

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
        photo_b64 TEXT,
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
        -- Fișă vehicul extinsă (paritate AROBS)
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS speed_limit INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS consumption_city NUMERIC(6,2);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS consumption_idle NUMERIC(6,2);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS consumption_road NUMERIC(6,2);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS lpg_volume INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS passenger_seats INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS emission_class VARCHAR(20);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS tire_size VARCHAR(30);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS engine_serial VARCHAR(40);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS displacement INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS power_kw INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS payload INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS road_tax_category VARCHAR(30);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS cost_center VARCHAR(40);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS inventory_number VARCHAR(40);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ignition_source VARCHAR(10);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS show_transport BOOLEAN DEFAULT TRUE;
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

    // Documente vehicul (ITP, RCA, CASCO, Rovinietă, licențe etc.) cu dată expirare
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_documents (
        id SERIAL PRIMARY KEY,
        imei VARCHAR(20) NOT NULL,
        doc_type VARCHAR(40) NOT NULL,
        number VARCHAR(60),
        issuer VARCHAR(100),
        issue_date DATE,
        expiry_date DATE,
        notes TEXT,
        company_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Indecsi noi
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_imei_start ON trips (imei, start_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alert_history_imei ON alert_history (imei, triggered_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_maintenance_imei ON maintenance (imei, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vehicle_documents_imei ON vehicle_documents (imei)`);

    // ─── RBAC: roluri extinse, acces per utilizator, audit ───
    // Coloane noi pe users (profil + status + ultima logare)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires BIGINT;
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

    // Webhooks outbound (integrare ERP/TMS) — livrare evenimente flotă către sisteme externe.
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        url VARCHAR(500) NOT NULL,
        secret VARCHAR(80),
        events JSONB,
        enabled BOOLEAN DEFAULT true,
        last_status INTEGER,
        last_error VARCHAR(300),
        last_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_webhooks_company ON webhooks (company_id)`);
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
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys (user_id)`);
    // Migrație additivă (DB existente): coloana de expirare a tokenului. NULL = fără expirare (chei vechi/integrări).
    await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`).catch(() => {});

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

    // Token-uri de notificări native pentru aplicația mobilă (FCM Android / APNs iOS)
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devtok_user ON device_tokens (user_id)`);

    // Migrari pentru coloane noi (devices) - adauga coloanele daca nu exista
    const migrateColumns = [
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tare_weight INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_legal INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_weight_construct INTEGER`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_axle_loads JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tank_calibration JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_price NUMERIC(10,2)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS cost_per_ton_km NUMERIC(10,2)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS fuel_sensors JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS io_mappings JSONB`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS can_interface VARCHAR(8)`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_can JSONB`
    ];
    for (const sql of migrateColumns) {
      try { await client.query(sql); } catch (e) { console.warn('[DB] Migration warning:', e.message); }
    }

    // ─── MULTI-TENANT: companii (fiecare companie își vede doar flota ei) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(80) UNIQUE,
        contact_email VARCHAR(160),
        phone VARCHAR(40),
        plan VARCHAR(40) DEFAULT 'standard',
        is_demo BOOLEAN DEFAULT false,
        active BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Coloana company_id pe toate entitățile scopabile (FK-less, enforce în cod pentru robustețe PGlite)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_b64 TEXT;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS description VARCHAR(255);
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS category VARCHAR(60);
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS group_id INTEGER;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS address VARCHAR(200);
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS is_region BOOLEAN DEFAULT false;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS center_lat DOUBLE PRECISION;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS center_lon DOUBLE PRECISION;
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE positions ADD COLUMN IF NOT EXISTS company_id INTEGER;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(64);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(64);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(24);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_period_end BIGINT;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS custom_plan JSONB;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_monthly_limit BIGINT;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS access_until BIGINT;
      END $$
    `);
    // ─── Plăți (gestionate manual de super-admin; schema pregătită și pentru Stripe) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        amount_ron NUMERIC(12,2),
        period_start BIGINT,
        period_end BIGINT,
        method VARCHAR(40) DEFAULT 'manual',
        note TEXT,
        paid_at BIGINT,
        created_by INTEGER,
        created_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_company ON devices(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_groups_company ON device_groups(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_drivers_company ON drivers(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_geofences_company ON geofences(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_company ON alerts(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_positions_company ON positions(company_id, timestamp DESC)`);
    // Indici suport pentru listele super-admin (ORDER BY last_seen, JOIN/lookup pe driver_id/group_id)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC NULLS LAST)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_driver ON devices(driver_id) WHERE driver_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id) WHERE group_id IS NOT NULL`);
    // Backfill o singură dată: pozițiile vechi moștenesc company_id din vehiculul lor (idempotent — doar rândurile NULL)
    await client.query(`
      UPDATE positions SET company_id = d.company_id
      FROM devices d
      WHERE positions.imei = d.imei AND positions.company_id IS NULL AND d.company_id IS NOT NULL
    `);

    // Rapoarte programate (trimise automat pe email)
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        user_id INTEGER,
        name VARCHAR(120),
        report_type VARCHAR(40) NOT NULL,
        imei VARCHAR(20),
        period VARCHAR(20) DEFAULT 'yesterday',
        frequency VARCHAR(20) DEFAULT 'daily',
        hour INTEGER DEFAULT 6,
        format VARCHAR(10) DEFAULT 'pdf',
        recipients TEXT,
        opts JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sched_company ON report_schedules(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sched_due ON report_schedules(enabled, next_run)`);

    // Tahograf: fișiere .DDD încărcate + analiza lor
    await client.query(`
      CREATE TABLE IF NOT EXISTS tacho_files (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        imei VARCHAR(20),
        driver_name VARCHAR(120),
        filename VARCHAR(200),
        kind VARCHAR(20),
        period_from DATE,
        period_to DATE,
        parsed JSONB,
        raw_b64 TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tacho_company ON tacho_files(company_id)`);

    // e-Transport (ANAF): coduri UIT per vehicul/transport
    await client.query(`
      CREATE TABLE IF NOT EXISTS etransport (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        uit VARCHAR(40),
        imei VARCHAR(20),
        plate VARCHAR(20),
        start_at TIMESTAMP,
        end_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'activ',
        last_sent_at TIMESTAMP,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_etransport_company ON etransport(company_id)`);

    // Setări globale (cheie-valoare) — ex. cheia API Anthropic configurată din UI
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(60) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Consum tokeni AI (per companie) — pentru dashboard-ul super-adminului
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id BIGSERIAL PRIMARY KEY,
        company_id INTEGER,
        kind VARCHAR(20),
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_company ON ai_usage (company_id, created_at)`);

    // Preferințe UI per user (toggle-uri: overspeed_heatmap, replay_marker, etc.) — separat de notification_prefs ca să nu interfere
    await client.query(`
      CREATE TABLE IF NOT EXISTS ui_prefs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        prefs JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Agenți AI — constatări/recomandări (RA Watch etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_findings (
        id BIGSERIAL PRIMARY KEY,
        company_id INTEGER,
        agent VARCHAR(30) NOT NULL,
        severity VARCHAR(12) DEFAULT 'info',
        fkey VARCHAR(120),
        imei VARCHAR(20),
        title VARCHAR(220),
        body TEXT,
        status VARCHAR(16) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_findings_company ON agent_findings(company_id, created_at DESC)`);

    // Raport săptămânal de activitate a flotei (generat automat lunea, per companie, analizat AI).
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id BIGSERIAL PRIMARY KEY,
        company_id INTEGER,
        period_from TIMESTAMP NOT NULL,
        period_to TIMESTAMP NOT NULL,
        generated_at TIMESTAMP DEFAULT NOW(),
        data JSONB DEFAULT '{}',
        ai_analysis TEXT,
        emailed BOOLEAN DEFAULT FALSE
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wreport_period ON weekly_reports(company_id, period_from)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_wreport_company ON weekly_reports(company_id, period_from DESC)`);

    // Istoric rapoarte generate la cerere (per user) — payload complet + expirare automată (7 zile)
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_history (
        id BIGSERIAL PRIMARY KEY,
        company_id INTEGER,
        user_id INTEGER,
        username VARCHAR(120),
        report_type VARCHAR(40) NOT NULL,
        label VARCHAR(120),
        imei VARCHAR(20),
        vehicle_count INTEGER DEFAULT 0,
        period_from TIMESTAMP,
        period_to TIMESTAMP,
        opts JSONB DEFAULT '{}',
        data JSONB DEFAULT '{}',
        signature VARCHAR(200),
        status VARCHAR(20) DEFAULT 'done',
        generated_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rhist_user ON report_history(user_id, generated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rhist_expires ON report_history(expires_at)`);

    console.log('[DB] Tabele create / verificate');
  } finally {
    client.release();
  }
  // Migrarea datelor (după eliberarea lock-ului — folosește pool.query)
  await ensureTenancy();
}

// Migrare idempotentă: promovează adminul platformă la superadmin, mută datele legacy într-o companie Default.
async function ensureTenancy() {
  try {
    const hasSuper = (await pool.query("SELECT 1 FROM users WHERE role='superadmin' LIMIT 1")).rows.length > 0;
    if (!hasSuper) {
      // primul admin (cel mai vechi) devine super-admin platformă, fără companie
      await pool.query("UPDATE users SET role='superadmin', company_id=NULL WHERE id=(SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)");
    }
    const nullDev = (await pool.query('SELECT COUNT(*)::int AS n FROM devices WHERE company_id IS NULL')).rows[0].n;
    const nullUsr = (await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE company_id IS NULL AND role<>'superadmin'")).rows[0].n;
    if (nullDev > 0 || nullUsr > 0) {
      let def = (await pool.query("SELECT id FROM companies WHERE slug='default' LIMIT 1")).rows[0];
      def = def ? def.id : (await pool.query("INSERT INTO companies (name, slug, plan) VALUES ('Compania mea','default','standard') RETURNING id")).rows[0].id;
      for (const t of ['users', 'devices', 'device_groups', 'drivers', 'geofences', 'alerts', 'maintenance']) {
        await pool.query(`UPDATE ${t} SET company_id=$1 WHERE company_id IS NULL`, [def]);
      }
      // super-adminul rămâne la nivel de platformă (fără companie)
      await pool.query("UPDATE users SET company_id=NULL WHERE role='superadmin'");
      console.log('[DB] Tenancy: date legacy migrate în compania Default (#' + def + ')');
    }
  } catch (e) { console.warn('[DB] ensureTenancy:', e.message); }
}

// ─── MULTI-TENANT: companii ───
async function getCompanies() {
  const r = await pool.query(`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id) AS device_count,
      (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS user_count
    FROM companies c ORDER BY c.created_at`);
  return r.rows;
}

// ─── Consum AI (tokeni) per companie ───
async function recordAiUsage(companyId, kind, usage) {
  if (!usage) return;
  const inp = parseInt(usage.input_tokens) || 0;
  const out = parseInt(usage.output_tokens) || 0;
  if (!inp && !out) return;
  await pool.query(
    'INSERT INTO ai_usage (company_id, kind, input_tokens, output_tokens) VALUES ($1, $2, $3, $4)',
    [companyId != null ? companyId : null, String(kind || 'ai').slice(0, 20), inp, out]
  );
}
async function getAiUsageByCompany(sinceDays) {
  const days = parseInt(sinceDays);
  let where = '', params = [];
  if (days > 0) { params.push(new Date(Date.now() - days * 86400000).toISOString()); where = 'WHERE created_at >= $1'; }
  const r = await pool.query(
    `SELECT company_id,
       COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COUNT(*)::int AS calls
     FROM ai_usage ${where} GROUP BY company_id`, params);
  return r.rows;
}
// Total tokeni (in+out) pentru o companie în ultimele N zile.
async function getAiTokensForCompany(companyId, days) {
  const since = new Date(Date.now() - (parseInt(days) || 30) * 86400000).toISOString();
  const r = await pool.query(
    'SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS total FROM ai_usage WHERE company_id IS NOT DISTINCT FROM $1 AND created_at >= $2',
    [companyId != null ? companyId : null, since]
  );
  return Number(r.rows[0] && r.rows[0].total) || 0;
}
// Număr de prompturi AI (apeluri) pentru o companie în ultimele N zile — pentru aplicarea limitei pe prompturi.
async function getAiCallsForCompany(companyId, days) {
  const since = new Date(Date.now() - (parseInt(days) || 30) * 86400000).toISOString();
  const r = await pool.query(
    'SELECT COUNT(*)::int AS n FROM ai_usage WHERE company_id IS NOT DISTINCT FROM $1 AND created_at >= $2',
    [companyId != null ? companyId : null, since]
  );
  return Number(r.rows[0] && r.rows[0].n) || 0;
}
async function setCompanyAiLimit(id, limit) {
  await pool.query('UPDATE companies SET ai_monthly_limit = $2 WHERE id = $1', [id, (limit == null || limit === '' || isNaN(limit)) ? null : parseInt(limit)]);
}
async function getCompanyById(id) {
  const r = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function setCompanyBilling(id, b) {
  await pool.query(
    'UPDATE companies SET plan = COALESCE($2, plan), subscription_status = $3, stripe_customer_id = COALESCE($4, stripe_customer_id), stripe_subscription_id = $5, current_period_end = $6 WHERE id = $1',
    [id, b.plan || null, b.status || null, b.customerId || null, b.subscriptionId || null, b.periodEnd || null]
  );
}
async function getCompanyByStripeCustomer(customerId) {
  if (!customerId) return null;
  const r = await pool.query('SELECT * FROM companies WHERE stripe_customer_id = $1 LIMIT 1', [customerId]);
  return r.rows[0] || null;
}
// Setează planul unei companii: cheie standard (start/pro/premium) sau plan custom (obiect).
async function setCompanyPlan(id, plan, customPlan) {
  await pool.query('UPDATE companies SET plan = $2, custom_plan = $3 WHERE id = $1',
    [id, plan || 'start', customPlan ? JSON.stringify(customPlan) : null]);
}
// ─── Acces & plăți (manual de super-admin; pregătit și pentru Stripe) ───
async function setCompanyAccessUntil(id, untilMs) {
  await pool.query('UPDATE companies SET access_until = $2 WHERE id = $1', [id, untilMs == null ? null : Math.round(untilMs)]);
}
async function recordPayment(p) {
  const now = Date.now();
  const r = await pool.query(
    `INSERT INTO payments (company_id, amount_ron, period_start, period_end, method, note, paid_at, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.companyId, (p.amountRon != null ? p.amountRon : null), p.periodStart || null, p.periodEnd || null, p.method || 'manual', p.note || null, p.paidAt || now, p.createdBy || null, now]
  );
  if (p.periodEnd) await setCompanyAccessUntil(p.companyId, p.periodEnd);
  return r.rows[0];
}
async function getPayments(companyId, limit) {
  const lim = Math.min(parseInt(limit) || 50, 500);
  if (companyId == null) {
    const r = await pool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT $1', [lim]);
    return r.rows;
  }
  const r = await pool.query('SELECT * FROM payments WHERE company_id = $1 ORDER BY created_at DESC LIMIT $2', [companyId, lim]);
  return r.rows;
}
async function getCompanyBySlug(slug) {
  const r = await pool.query('SELECT * FROM companies WHERE slug = $1', [slug]);
  return r.rows[0] || null;
}
async function createCompany(data) {
  const r = await pool.query(
    `INSERT INTO companies (name, slug, contact_email, phone, plan, is_demo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.name, data.slug || null, data.contact_email || null, data.phone || null, data.plan || 'standard', !!data.is_demo]
  );
  return r.rows[0];
}
async function updateCompany(id, data) {
  await pool.query(
    `UPDATE companies SET name=COALESCE($2,name), contact_email=$3, phone=$4, plan=COALESCE($5,plan), active=COALESCE($6,active) WHERE id=$1`,
    [id, data.name || null, data.contact_email || null, data.phone || null, data.plan || null, (data.active === undefined ? null : data.active)]
  );
}
async function deleteCompany(id) {
  // protejează: nu șterge dacă mai are device-uri/useri (decis în server); aici doar ștergem rândul
  await pool.query('DELETE FROM ai_usage WHERE company_id = $1', [id]); // altfel consumul orfan rămâne în totaluri, fără companie în tabel
  await pool.query('DELETE FROM companies WHERE id = $1', [id]);
}
// Toate IMEI-urile unei companii (pt. scoping viewAll pe companie)
async function getCompanyImeis(companyId) {
  const r = await pool.query('SELECT imei FROM devices WHERE company_id = $1', [companyId]);
  return r.rows.map(x => x.imei);
}
// La mutarea unui vehicul în altă companie, curăță feed-ul vechi legat de el (notificări + constatări
// agenți) — ca fosta companie să nu mai vadă reziduuri, iar noua companie să nu moștenească istoric străin.
// Best-effort: o eroare aici nu blochează mutarea.
async function _purgeDeviceFeed(imeis) {
  const list = (Array.isArray(imeis) ? imeis : [imeis]).filter(Boolean);
  if (!list.length) return;
  try { await pool.query('DELETE FROM notifications WHERE imei = ANY($1::varchar[])', [list]); } catch (e) {}
  try { await pool.query('DELETE FROM agent_findings WHERE imei = ANY($1::varchar[])', [list]); } catch (e) {}
}

async function setDeviceCompany(imei, companyId) {
  await pool.query('UPDATE devices SET company_id = $2 WHERE imei = $1', [imei, companyId || null]);
  await _purgeDeviceFeed([imei]);
}
// Interfața CAN a device-ului:
//  - 'fms'   = FMS Gateway (J1939, ex: FMC650 pe MAN TGS prin gateway)
//  - 'tacho' = cablu direct la tahograf (C5/C7) — semantică DSRC pe IDs 184-198, 222-235
//  - 'lvcan' = adaptor LV-CAN200/ALL-CAN300 (default)
//  - null    = autodetect (folosește harta standard cu aliasuri pe ID 88, 91-93)
async function setDeviceCanInterface(imei, iface) {
  const v = (iface === 'fms') ? 'fms' : (iface === 'tacho') ? 'tacho' : (iface === 'lvcan' ? 'lvcan' : null);
  await pool.query('UPDATE devices SET can_interface = $2 WHERE imei = $1', [imei, v]);
  return v;
}
async function getDeviceCanInterface(imei) {
  const r = await pool.query('SELECT can_interface FROM devices WHERE imei = $1', [imei]);
  return r.rows[0] ? (r.rows[0].can_interface || null) : null;
}
// Persistă ultimele valori CAN „sticky" (carburant/odometru/AdBlue/ore) per device. Supraviețuiește restartului
// serverului → rămân afișate cât vehiculul e parcat (motor oprit ⇒ nu mai trimite date CAN).
async function setDeviceLastCan(imei, obj) {
  try { await pool.query('UPDATE devices SET last_can = $2 WHERE imei = $1', [imei, JSON.stringify(obj || {})]); } catch (e) {}
}
// Backfill o singură dată la pornire: ultima poziție din istoricul recent care CHIAR are carburant/odometru,
// pentru devices fără last_can persistat încă. Best-effort (wrapped în try/catch de apelant).
async function getLastStickyCan() {
  const r = await pool.query(`
    SELECT DISTINCT ON (imei) imei, io_data, timestamp
    FROM positions
    WHERE timestamp > NOW() - INTERVAL '30 days'
      AND ( (io_data->>'can_fuel_level_liters') IS NOT NULL
         OR (io_data->>'can_total_mileage') IS NOT NULL
         OR (io_data->>'total_odometer') IS NOT NULL
         OR (io_data->>'can_fuel_level_pct') IS NOT NULL )
    ORDER BY imei, timestamp DESC
  `);
  return r.rows;
}
// Mutare utilizator între companii (super-admin). Curăță grant-urile per-vehicul/grup (deveneau inerte oricum,
// dar le ștergem ca să nu „reapară" dacă un vehicul ajunge ulterior în noua companie).
async function setUserCompany(id, companyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET company_id = $2 WHERE id = $1', [id, companyId || null]);
    await client.query('DELETE FROM user_device_access WHERE user_id = $1', [id]);
    await client.query('DELETE FROM user_group_access WHERE user_id = $1', [id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
// Mutare șofer între companii (super-admin). Rupe legătura cu vehiculele din vechea companie (driver_id),
// altfel un vehicul ar referi un șofer din altă companie.
async function setDriverCompany(id, companyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE devices SET driver_id = NULL WHERE driver_id = $1', [id]);
    await client.query('UPDATE drivers SET company_id = $2 WHERE id = $1', [id, companyId || null]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function getDriverById(id) {
  const r = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
  return r.rows[0] || null;
}
// ─── Tahograf ───
async function createTachoFile(rec) {
  const r = await pool.query(
    `INSERT INTO tacho_files (company_id, imei, driver_name, filename, kind, period_from, period_to, parsed, raw_b64)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, company_id, imei, driver_name, filename, kind, period_from, period_to, parsed, uploaded_at`,
    [rec.companyId || null, rec.imei || null, rec.driverName || null, rec.filename || null, rec.kind || null,
     rec.periodFrom || null, rec.periodTo || null, rec.parsed ? JSON.stringify(rec.parsed) : null, rec.rawB64 || null]
  );
  return r.rows[0];
}
async function getTachoFiles(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const r = await pool.query(`SELECT id, company_id, imei, driver_name, filename, kind, period_from, period_to, parsed, uploaded_at FROM tacho_files ${where} ORDER BY uploaded_at DESC`, params);
  return r.rows;
}
async function getTachoFile(id) { const r = await pool.query('SELECT * FROM tacho_files WHERE id = $1', [id]); return r.rows[0] || null; }
async function deleteTachoFile(id) { await pool.query('DELETE FROM tacho_files WHERE id = $1', [id]); }

// ─── e-Transport ───
async function getEtransports(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const r = await pool.query(`SELECT * FROM etransport ${where} ORDER BY created_at DESC`, params);
  return r.rows;
}
async function createEtransport(d, companyId) {
  const r = await pool.query(
    `INSERT INTO etransport (company_id, uit, imei, plate, start_at, end_at, status, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId || null, d.uit, d.imei || null, d.plate || null, d.start_at || null, d.end_at || null, d.status || 'activ', d.note || null]
  );
  return r.rows[0];
}
async function updateEtransport(id, d) {
  await pool.query(`UPDATE etransport SET status=COALESCE($2,status), end_at=COALESCE($3,end_at), last_sent_at=COALESCE($4,last_sent_at) WHERE id=$1`,
    [id, d.status || null, d.end_at || null, d.last_sent_at || null]);
}
async function deleteEtransport(id) { await pool.query('DELETE FROM etransport WHERE id = $1', [id]); }
async function getActiveEtransports() {
  const r = await pool.query("SELECT * FROM etransport WHERE status = 'activ' AND (end_at IS NULL OR end_at > NOW())");
  return r.rows;
}

// ─── Setări globale (cheie-valoare) ───
async function getSetting(key) {
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}
async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
    [key, value]
  );
}

// ─── Agenți AI: constatări ───
async function createAgentFinding(f) {
  if (f.fkey) {
    const ex = await pool.query(
      "SELECT 1 FROM agent_findings WHERE company_id IS NOT DISTINCT FROM $1 AND fkey = $2 AND created_at > NOW() - INTERVAL '12 hours' LIMIT 1",
      [f.companyId == null ? null : f.companyId, f.fkey]
    );
    if (ex.rows.length) return null; // deja semnalat recent
  }
  const r = await pool.query(
    'INSERT INTO agent_findings (company_id, agent, severity, fkey, imei, title, body) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [f.companyId == null ? null : f.companyId, f.agent, f.severity || 'info', f.fkey || null, f.imei || null, f.title, f.body || null]
  );
  return r.rows[0];
}
async function getAgentFindings(companyId, limit = 100) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId, limit] : [limit];
  const r = await pool.query(`SELECT * FROM agent_findings ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  return r.rows;
}
// Număr constatări noi ale agenților (pentru dashboard platformă). null = toate companiile.
async function countNewFindings() {
  const r = await pool.query("SELECT COUNT(*)::int AS n FROM agent_findings WHERE status = 'new'");
  return Number(r.rows[0] && r.rows[0].n) || 0;
}
async function updateAgentFinding(id, status, companyId) {
  const r = await pool.query(
    'UPDATE agent_findings SET status = $2 WHERE id = $1 AND ($3::int IS NULL OR company_id IS NOT DISTINCT FROM $3)',
    [parseInt(id), status, companyId == null ? null : companyId]
  );
  return (r.affectedRows || r.rowCount || 0) > 0;
}

// company_id al unei entități (pentru verificarea proprietății la update/delete pe id)
async function getRowCompany(table, id) {
  const allow = { device_groups: 1, drivers: 1, geofences: 1, alerts: 1, maintenance: 1, etransport: 1, report_schedules: 1, vehicle_documents: 1, webhooks: 1 };
  if (!allow[table]) return undefined;
  const r = await pool.query(`SELECT company_id FROM ${table} WHERE id = $1`, [parseInt(id)]);
  return r.rows[0] ? r.rows[0].company_id : undefined;
}
// Device-uri neasignate (vizibile doar super-adminului) + pentru asignare
async function getUnassignedDevices() {
  const r = await pool.query('SELECT imei, name, plate, last_seen FROM devices WHERE company_id IS NULL ORDER BY last_seen DESC NULLS LAST');
  return r.rows;
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
// Sursa stării de „contact": 'auto' (IO 239 calculat de device, implicit) sau 'din1' (folosește DIN1 — pentru
// trackere cu sursa de ignition configurată greșit). Override aplicat la ingest (live + stocat).
async function setDeviceIgnitionSource(imei, src) {
  const v = (src === 'din1') ? 'din1' : 'auto';
  await pool.query('UPDATE devices SET ignition_source = $2 WHERE imei = $1', [imei, v]);
  return v;
}
// IMEI-urile cu override 'din1' — pentru cache-ul de la ingest (doar excepțiile, nu toată flota).
async function getDin1Imeis() {
  const r = await pool.query("SELECT imei FROM devices WHERE ignition_source = 'din1'");
  return r.rows.map(x => x.imei);
}
// IMEI-urile arhivate (status='archived') — sursă de adevăr pentru reconcilierea periodică a setului în memorie.
async function getArchivedImeis() {
  const r = await pool.query("SELECT imei FROM devices WHERE status = 'archived'");
  return r.rows.map(x => x.imei);
}

// Coloane editabile din fișa vehiculului (whitelist — previne injection / scriere pe coloane interzise)
const VEHICLE_DETAIL_COLS = [
  'name', 'plate', 'vehicle_type', 'vin', 'brand', 'model', 'year', 'fuel_type',
  'tank_capacity', 'lpg_volume', 'icon', 'color', 'speed_limit',
  'consumption_city', 'consumption_idle', 'consumption_road', 'passenger_seats',
  'emission_class', 'tire_size', 'engine_serial', 'displacement', 'power_kw',
  'payload', 'road_tax_category', 'cost_center', 'inventory_number', 'notes',
  'tare_weight', 'max_weight_legal', 'max_weight_construct', 'ignition_source', 'show_transport'
];
const NUMERIC_COLS = new Set([
  'year', 'tank_capacity', 'lpg_volume', 'speed_limit', 'consumption_city', 'consumption_idle',
  'consumption_road', 'passenger_seats', 'displacement', 'power_kw', 'payload',
  'tare_weight', 'max_weight_legal', 'max_weight_construct'
]);
// Doar acestea sunt NUMERIC(6,2) (acceptă zecimale); restul din NUMERIC_COLS sunt INTEGER → rotunjim,
// altfel un decimal (ex. 90.5) e respins de Postgres/PGlite ("invalid input syntax for type integer") și pică tot UPDATE-ul.
const DECIMAL_COLS = new Set(['consumption_city', 'consumption_idle', 'consumption_road']);
// Update parțial: actualizează doar câmpurile trimise, din whitelist
async function updateVehicleDetails(imei, fields) {
  const sets = [], vals = [imei];
  for (const col of VEHICLE_DETAIL_COLS) {
    if (!Object.prototype.hasOwnProperty.call(fields, col)) continue;
    let v = fields[col];
    if (v === '' || v === undefined) v = null;
    if (v !== null && NUMERIC_COLS.has(col)) { const n = Number(v); v = isNaN(n) ? null : (DECIMAL_COLS.has(col) ? n : Math.round(n)); }
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) return;
  await pool.query(`UPDATE devices SET ${sets.join(', ')} WHERE imei = $1`, vals);
}

async function assignDevice(imei, driverId, groupId) {
  await pool.query(
    'UPDATE devices SET driver_id = $2, group_id = $3 WHERE imei = $1',
    [imei, driverId || null, groupId || null]
  );
}

// Adăugare manuală vehicul (pre-înregistrare IMEI înainte să se conecteze trackerul)
async function deviceExists(imei) {
  const r = await pool.query('SELECT 1 FROM devices WHERE imei = $1', [imei]);
  return !!(r.rows && r.rows.length > 0); // r.rowCount e undefined în PGlite → rows.length merge și pe pg, și pe PGlite
}
async function createDevice(imei, fields, companyId) {
  await pool.query(
    "INSERT INTO devices (imei, company_id, status, created_at) VALUES ($1, $2, 'active', NOW())",
    [imei, companyId != null ? companyId : null]
  );
  if (fields && Object.keys(fields).length) await updateVehicleDetails(imei, fields);
}
// Arhivare / restaurare vehicul (status = 'active' | 'archived')
async function setDeviceStatus(imei, status) {
  const s = status === 'archived' ? 'archived' : 'active';
  await pool.query('UPDATE devices SET status = $2 WHERE imei = $1', [imei, s]);
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
// ─── Mapări IO per vehicul (super-admin): cheia brută io_<id> → { name, type, unit, capacity, rawMin, rawMax, scale, offset } ───
async function getIoMappings(imei) {
  const r = await pool.query('SELECT io_mappings FROM devices WHERE imei = $1', [imei]);
  if (!r.rows[0] || !r.rows[0].io_mappings) return {};
  const m = r.rows[0].io_mappings;
  return (typeof m === 'string' ? JSON.parse(m) : m) || {};
}
async function setIoMapping(imei, ioId, mapping) {
  const cur = await getIoMappings(imei);
  if (mapping == null) delete cur[String(ioId)]; else cur[String(ioId)] = mapping;
  await pool.query('UPDATE devices SET io_mappings = $2 WHERE imei = $1', [imei, JSON.stringify(cur)]);
  return cur;
}
async function deleteIoMapping(imei, ioId) { return setIoMapping(imei, ioId, null); }

async function getDeviceFull(imei) {
  const result = await pool.query(
    'SELECT d.*, dr.name AS driver_name FROM devices d LEFT JOIN drivers dr ON dr.id = d.driver_id WHERE d.imei = $1',
    [imei]
  );
  return result.rows[0] || null;
}

// Curăță valori CAN clar imposibile (sentinele/garbage) ÎNAINTE de stocare. Bounds LARGI → nu atinge
// telemetria validă (rezervoare mari ~2000L, RPM ~8000). Shallow-copy (nu mutează obiectul live).
// Defensiv: nu aruncă niciodată; la orice eroare întoarce io-ul original.
function _sanitizeIo(io) {
  if (!io || typeof io !== 'object') return io;
  try {
    const o = Object.assign({}, io);
    const nullIf = (k, lo, hi) => { const v = o[k]; if (typeof v === 'number' && (v < lo || v > hi)) o[k] = null; };
    nullIf('can_engine_rpm', 0, 16383); nullIf('rpm', 0, 16383);
    nullIf('can_engine_temp', -60, 250); nullIf('can_coolant_temp', -60, 250); nullIf('engine_temp', -60, 250);
    nullIf('can_fuel_level_pct', 0, 100); nullIf('fuel_level_pct', 0, 100); nullIf('can_adblue_level_pct', 0, 100);
    nullIf('can_fuel_level_liters', 0, 5000); nullIf('fuel_level_liters', 0, 5000); nullIf('can_adblue_level_liters', 0, 1000);
    return o;
  } catch (e) { return io; }
}

async function insertPositions(imei, records) {
  if (records.length === 0) return;

  // company_id moștenit de la vehicul (izolare per-tenant + retenție per-companie)
  let companyId = null;
  try {
    const dr = await pool.query('SELECT company_id FROM devices WHERE imei = $1', [imei]);
    companyId = dr.rows[0] ? dr.rows[0].company_id : null;
  } catch (e) {}

  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const record of records) {
    const gps = record.gps;
    
    // Ignoră recordurile fără fix GPS valid
    if (gps.latitude === 0 && gps.longitude === 0) continue;

    values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`);
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
      JSON.stringify(_sanitizeIo(record.io)),
      companyId
    );
    paramIndex += 11;
  }

  if (values.length === 0) return;

  // ON CONFLICT DO NOTHING doar dacă există indexul UNIQUE (altfel Postgres aruncă „no unique constraint matching").
  const onConflict = positionsUniqueIdx ? ' ON CONFLICT (imei, timestamp) DO NOTHING' : '';
  const query = `
    INSERT INTO positions (imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, company_id)
    VALUES ${values.join(', ')}${onConflict}
  `;

  await pool.query(query, params);
}

// ─── Jurnal erori (observabilitate) — toate funcțiile best-effort, NU aruncă din logger ───
async function logError(e) {
  try {
    await pool.query(
      `INSERT INTO error_log (level, message, stack, route, method, status, user_id, company_id, context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        (e.level || 'error').slice(0, 10),
        (e.message || '').slice(0, 4000),
        (e.stack || '').slice(0, 8000) || null,
        (e.route || '').slice(0, 255) || null,
        (e.method || '').slice(0, 10) || null,
        e.status != null ? parseInt(e.status) : null,
        e.userId != null ? parseInt(e.userId) : null,
        e.companyId != null ? parseInt(e.companyId) : null,
        e.context != null ? JSON.stringify(e.context) : null,
      ]
    );
  } catch (_) { /* best-effort */ }
}
async function getErrors(limit, level) {
  const lim = Math.min(parseInt(limit) || 100, 500);
  const where = level ? 'WHERE level = $2' : '';
  const params = level ? [lim, level] : [lim];
  const r = await pool.query(`SELECT * FROM error_log ${where} ORDER BY created_at DESC LIMIT $1`, params);
  return r.rows;
}
async function clearErrors() { await pool.query('DELETE FROM error_log'); return true; }
// Păstrează doar ultimele `keep` rânduri (anti-creștere nelimitată). Rulat periodic din server.
async function pruneErrors(keep) {
  try {
    await pool.query(
      `DELETE FROM error_log WHERE id < (SELECT MIN(id) FROM (SELECT id FROM error_log ORDER BY id DESC LIMIT $1) t)`,
      [Math.max(100, parseInt(keep) || 2000)]
    );
  } catch (_) {}
}

async function getDevices(companyId) {
  // Filtru pe companie ÎN SQL (scalare): la 30+ companii evită încărcarea TUTUROR dispozitivelor
  // global + LATERAL pe positions la fiecare load de hartă. Fără arg (super-admin) → toate.
  const where = companyId != null ? 'WHERE d.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`
    SELECT d.*, c.name AS company_name,
      p.latitude, p.longitude, p.speed, p.timestamp as last_position_time,
      p.io_data
    FROM devices d
    LEFT JOIN companies c ON c.id = d.company_id
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, speed, timestamp, io_data
      FROM positions
      WHERE positions.imei = d.imei
      ORDER BY timestamp DESC
      LIMIT 1
    ) p ON true
    ${where}
    ORDER BY d.last_seen DESC
  `, params);
  return result.rows;
}

// Variantă slabă: doar coloane esențiale pentru liste de selecție/move (fără JSONB io_data, fără LATERAL pe positions).
// Folosită de panoul super-admin "Mută între companii" și alte selectoare unde nu ai nevoie de poziție live.
async function getDevicesLite() {
  const result = await pool.query(`
    SELECT imei, name, plate, vehicle_type, status, company_id, group_id, driver_id, last_seen, created_at
    FROM devices
    ORDER BY last_seen DESC NULLS LAST
  `);
  return result.rows;
}

// UPDATE bulk: mută mai multe vehicule pe aceeași companie într-un singur statement (atomic).
async function setDevicesCompanyBulk(imeis, companyId) {
  if (!Array.isArray(imeis) || !imeis.length) return 0;
  const r = await pool.query(
    'UPDATE devices SET company_id = $2 WHERE imei = ANY($1::varchar[])',
    [imeis, companyId || null]
  );
  await _purgeDeviceFeed(imeis); // curăță feed-ul vechi al vehiculelor mutate
  // Pattern PGlite-safe: PGlite expune affectedRows, pg expune rowCount (vezi db.js:957)
  return r.affectedRows || r.rowCount || 0;
}

async function getDeviceHistory(imei, from, to, limit) {
  const lim = Math.min(Math.max(parseInt(limit) || 50000, 1), 200000); // plafon dur anti-OOM
  // UNION cu positions_archive: dispozitivele arhivate își păstrează istoricul acolo chiar după ce pozițiile vii
  // expiră din hypertable (retenție 180z). DISTINCT ON (timestamp) elimină dublurile din fereastra de overlap
  // (imediat după arhivare datele sunt în ambele tabele). Activele normale: positions_archive e gol → doar positions.
  const result = await pool.query(`
    SELECT DISTINCT ON (timestamp) timestamp, latitude, longitude, altitude, angle, speed, satellites, io_data
    FROM (
      SELECT timestamp, latitude, longitude, altitude, angle, speed, satellites, io_data
        FROM positions WHERE imei = $1 AND timestamp BETWEEN $2 AND $3
      UNION ALL
      SELECT timestamp, latitude, longitude, altitude, angle, speed, satellites, io_data
        FROM positions_archive WHERE imei = $1 AND timestamp BETWEEN $2 AND $3
    ) u
    ORDER BY timestamp ASC
    LIMIT ${lim}
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
    'INSERT INTO users (username, password_hash, role, full_name, email, phone, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, role, full_name, email, phone, active, company_id, created_at',
    [username, passwordHash, role, extra.full_name || null, extra.email || null, extra.phone || null, extra.company_id || null]
  );
  return result.rows[0];
}

async function getUsers(companyId) {
  const where = companyId != null ? 'WHERE u.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.full_name, u.email, u.phone, u.active, u.last_login, u.created_at, u.company_id,
      (SELECT COUNT(*) FROM user_device_access WHERE user_id = u.id) AS device_count,
      (SELECT COUNT(*) FROM user_group_access WHERE user_id = u.id) AS group_count
    FROM users u ${where} ORDER BY u.created_at
  `, params);
  return result.rows;
}

// Variantă slabă pentru selectoarele de mutare (fără subquery-uri COUNT pe user_device_access/user_group_access).
async function getUsersLite(companyId) {
  const where = companyId != null ? 'WHERE u.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.full_name, u.email, u.active, u.company_id
    FROM users u ${where} ORDER BY u.username
  `, params);
  return result.rows;
}

// UPDATE bulk pentru utilizatori — single transaction cu cleanup pe user_device_access + user_group_access pt. fiecare.
async function setUsersCompanyBulk(ids, companyId) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('UPDATE users SET company_id = $2 WHERE id = ANY($1::int[])', [ids, companyId || null]);
    await client.query('DELETE FROM user_device_access WHERE user_id = ANY($1::int[])', [ids]);
    await client.query('DELETE FROM user_group_access WHERE user_id = ANY($1::int[])', [ids]);
    await client.query('COMMIT');
    return r.affectedRows || r.rowCount || 0;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// Helper: numără super-adminii dintr-o listă de ID-uri într-un singur SELECT (evită N round-trips în gate-ul de bulk).
async function countSuperadminsInIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users WHERE id = ANY($1::int[]) AND role = 'superadmin'`,
    [ids]
  );
  return r.rows[0] ? r.rows[0].c : 0;
}

async function getUserById(id) {
  const result = await pool.query(
    'SELECT id, username, role, full_name, email, phone, active, last_login, company_id, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function updateUserProfile(id, data) {
  await pool.query(
    `UPDATE users SET
       role = COALESCE($2, role),
       full_name = COALESCE($3, full_name),
       email = COALESCE($4, email),
       phone = COALESCE($5, phone),
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
  // doar device-urile din ACEEAȘI companie cu userul (defense-in-depth pe izolare)
  const result = await pool.query(`
    WITH me AS (SELECT company_id FROM users WHERE id = $1)
    SELECT uda.imei FROM user_device_access uda
      JOIN devices d ON d.imei = uda.imei
      WHERE uda.user_id = $1 AND d.company_id IS NOT DISTINCT FROM (SELECT company_id FROM me)
    UNION
    SELECT d.imei FROM devices d
      JOIN user_group_access uga ON uga.group_id = d.group_id
      WHERE uga.user_id = $1 AND d.company_id IS NOT DISTINCT FROM (SELECT company_id FROM me)
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
      'INSERT INTO audit_log (user_id, username, action, entity, entity_id, details, ip, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [entry.userId || null, entry.username || null, entry.action,
       entry.entity || null, entry.entityId != null ? String(entry.entityId) : null,
       entry.details ? JSON.stringify(entry.details) : null, entry.ip || null,
       entry.companyId != null ? entry.companyId : null]
    );
  } catch (e) { console.warn('[AUDIT]', e.message); }
}

async function getAuditLog(limit = 100, offset = 0, companyId) {
  const where = companyId != null ? 'WHERE company_id = $3' : '';
  const params = companyId != null ? [limit, offset, companyId] : [limit, offset];
  const result = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
  return result.rows;
}

// ─── Chei API ───

async function createApiKey(userId, name, keyHash, prefix, expiresAt) {
  // expiresAt: Date | ISO string | ms epoch | null. NULL = cheie fără expirare (integrări server).
  let exp = null;
  if (expiresAt != null) exp = (expiresAt instanceof Date) ? expiresAt.toISOString() : (typeof expiresAt === 'number' ? new Date(expiresAt).toISOString() : String(expiresAt));
  const result = await pool.query(
    'INSERT INTO api_keys (user_id, name, key_hash, prefix, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, user_id, name, prefix, expires_at, created_at',
    [userId, name || null, keyHash, prefix, exp]
  );
  return result.rows[0];
}

async function getApiKeys(companyId) {
  const where = companyId != null ? 'WHERE u.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`
    SELECT k.id, k.name, k.prefix, k.last_used, k.revoked, k.created_at,
           k.user_id, u.username, u.role, u.company_id, c.name AS company_name
    FROM api_keys k JOIN users u ON u.id = k.user_id
    LEFT JOIN companies c ON c.id = u.company_id
    ${where}
    ORDER BY k.created_at DESC
  `, params);
  return result.rows;
}
async function getApiKeyCompany(id) {
  const r = await pool.query('SELECT u.company_id FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.id = $1', [id]);
  return r.rows[0] ? r.rows[0].company_id : undefined;
}

async function getUserByApiKey(keyHash) {
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.active, u.company_id, k.id AS key_id
    FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.key_hash = $1 AND k.revoked = false
      AND (k.expires_at IS NULL OR k.expires_at > NOW())
  `, [keyHash]);
  const row = result.rows[0];
  if (row) { pool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [row.key_id]).catch(() => {}); }
  return row || null;
}

async function revokeApiKey(id) {
  await pool.query('UPDATE api_keys SET revoked = true WHERE id = $1', [id]);
}

// Ștergere DEFINITIVĂ a cheii (scoate înregistrarea complet). Revocarea (de mai sus) e soft — păstrează urma.
async function deleteApiKey(id) {
  const r = await pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
  return r.affectedRows || r.rowCount || 0;
}

// ─── Webhooks (integrare ERP/TMS) ───
function _parseEvents(e) { if (e == null) return null; if (Array.isArray(e)) return e; try { return JSON.parse(e); } catch (_) { return null; } }
async function getWebhooks(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const r = await pool.query(`SELECT id, company_id, url, secret, events, enabled, last_status, last_error, last_at, created_at FROM webhooks ${where} ORDER BY created_at DESC`, params);
  return r.rows.map(w => Object.assign(w, { events: _parseEvents(w.events) }));
}
// Doar webhook-urile active ale unei companii — pentru livrare (hot path).
async function getEnabledWebhooks(companyId) {
  if (companyId == null) return [];
  const r = await pool.query('SELECT id, url, secret, events FROM webhooks WHERE company_id = $1 AND enabled = true', [companyId]);
  return r.rows.map(w => Object.assign(w, { events: _parseEvents(w.events) }));
}
async function getWebhookById(id) { const r = await pool.query('SELECT * FROM webhooks WHERE id = $1', [parseInt(id)]); const w = r.rows[0]; if (w) w.events = _parseEvents(w.events); return w || null; }
async function createWebhook(d, companyId) {
  const r = await pool.query(
    'INSERT INTO webhooks (company_id, url, secret, events, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [companyId != null ? companyId : null, d.url, d.secret || null, d.events != null ? JSON.stringify(d.events) : null, d.enabled !== false]
  );
  const w = r.rows[0]; w.events = _parseEvents(w.events); return w;
}
async function deleteWebhook(id) { const r = await pool.query('DELETE FROM webhooks WHERE id = $1', [parseInt(id)]); return r.affectedRows || r.rowCount || 0; }
async function updateWebhookStatus(id, status, error) {
  await pool.query('UPDATE webhooks SET last_status = $2, last_error = $3, last_at = NOW() WHERE id = $1', [parseInt(id), status != null ? parseInt(status) : null, error ? String(error).slice(0, 300) : null]).catch(() => {});
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

// La arhivarea unui dispozitiv: copiază istoricul lui din `positions` în `positions_archive` (snapshot înghețat).
// ON CONFLICT (imei, timestamp) DO NOTHING → idempotent la re-arhivare (arhivează → restaurează → arhivează).
async function archiveDevicePositions(imei) {
  const r = await pool.query(`
    INSERT INTO positions_archive (imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, company_id)
    SELECT imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, company_id
    FROM positions WHERE imei = $1
    ON CONFLICT (imei, timestamp) DO NOTHING
  `, [imei]);
  return r.affectedRows || r.rowCount || 0;
}

// Purjează arhiva mai veche de N zile (politică aleasă: arhivate 2 ani = 730z).
async function purgeArchivedPositions(days) {
  const r = await pool.query(
    `DELETE FROM positions_archive WHERE timestamp < NOW() - ($1 || ' days')::interval`,
    [String(days)]
  );
  return r.affectedRows || (r.rowCount || 0);
}

// IMEI-urile dispozitivelor arhivate — pentru oprirea ingestului în memoria serverului (set verificat la fiecare pachet).
async function getArchivedImeis() {
  const r = await pool.query(`SELECT imei FROM devices WHERE status = 'archived'`);
  return r.rows.map(x => x.imei);
}

// Câte poziții arhivate are un dispozitiv (pentru UI: „X poziții păstrate").
async function countArchivedPositions(imei) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM positions_archive WHERE imei = $1`, [imei]);
  return r.rows[0] || { n: 0, first_ts: null, last_ts: null };
}

// Dispozitivele arhivate + numărul de poziții păstrate în arhivă (pentru pagina „Dispozitive arhivate").
async function getArchivedDevices() {
  const r = await pool.query(`
    SELECT d.imei, d.name, d.plate, d.vehicle_type, d.company_id, d.last_seen,
           c.name AS company_name,
           COALESCE(a.n, 0) AS archived_positions, a.first_ts, a.last_ts
    FROM devices d
    LEFT JOIN companies c ON c.id = d.company_id
    LEFT JOIN (
      SELECT imei, COUNT(*)::int AS n, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts
      FROM positions_archive GROUP BY imei
    ) a ON a.imei = d.imei
    WHERE d.status = 'archived'
    ORDER BY d.last_seen DESC NULLS LAST
  `);
  return r.rows;
}

// ─── Notificări ───

async function createNotification(n) {
  const r = await pool.query(
    'INSERT INTO notifications (type, severity, imei, title, body, data, user_id, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [n.type, n.severity || 'info', n.imei || null, n.title || null, n.body || null, n.data ? JSON.stringify(n.data) : null, n.userId || null, n.companyId != null ? n.companyId : null]
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
// Vizibilitate (izolare tenant): notificările personale (user_id = userId) + broadcast (user_id NULL).
// imeis === null => super-admin: vede toate broadcasturile. Non-super: broadcast vizibil DOAR dacă
//   - imei-ul aparține vehiculelor sale (imei = ANY), SAU
//   - notificarea e la nivel de companie (imei NULL) ȘI company_id == compania userului.
// Vechile broadcasturi imei-NULL + company-NULL NU mai sunt vizibile non-superului (erau scurgerea cross-tenant).
function _notifWhere(userId, imeis, companyId) {
  if (imeis === null) return { clause: '(user_id = $1 OR user_id IS NULL)', params: [userId] };
  // IZOLARE: o notificare LEGATĂ de un vehicul (imei) se arată DOAR dacă vehiculul e încă în accesul tău.
  // Astfel, un vehicul mutat în altă companie nu-ți mai apare în feed (nici măcar pe notificările vechi
  // adresate ție). Notificările fără vehicul (imei NULL) rămân: ale tale (user_id) sau ale companiei.
  return {
    clause: '((user_id = $1 AND (imei IS NULL OR imei = ANY($2))) OR (user_id IS NULL AND ((imei = ANY($2)) OR (imei IS NULL AND company_id = $3))))',
    params: [userId, imeis, companyId != null ? companyId : -1]
  };
}
async function getNotifications(userId, imeis, companyId, limit = 50) {
  const w = _notifWhere(userId, imeis, companyId);
  const r = await pool.query(`SELECT * FROM notifications WHERE ${w.clause} ORDER BY created_at DESC LIMIT $${w.params.length + 1}`, [...w.params, limit]);
  return r.rows;
}
async function unreadNotifications(userId, imeis, companyId) {
  const w = _notifWhere(userId, imeis, companyId);
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE acknowledged = false AND ${w.clause}`, w.params);
  return r.rows[0].n;
}
async function ackNotification(id, userId, imeis, companyId) {
  const w = _notifWhere(userId, imeis, companyId);
  const r = await pool.query(
    `UPDATE notifications SET acknowledged = true WHERE ${w.clause} AND id = $${w.params.length + 1}`,
    [...w.params, id]
  );
  return (r.affectedRows || r.rowCount || 0) > 0;
}
async function ackAllNotifications(userId, imeis, companyId) {
  const w = _notifWhere(userId, imeis, companyId);
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
// ─── Preferințe UI (per user) + settings companie (default-uri) ───
async function getUiPrefs(userId) {
  const r = await pool.query('SELECT prefs FROM ui_prefs WHERE user_id = $1', [userId]);
  const p = r.rows[0] ? r.rows[0].prefs : {};
  return typeof p === 'string' ? JSON.parse(p) : (p || {});
}
async function setUiPrefs(userId, patch) {
  // merge non-distructiv: citim, suprapunem, scriem (ca să nu pierdem chei la PUT-uri parțiale)
  const cur = await getUiPrefs(userId);
  const next = Object.assign({}, cur, patch || {});
  await pool.query(
    'INSERT INTO ui_prefs (user_id, prefs, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()',
    [userId, JSON.stringify(next)]
  );
  return next;
}
async function getCompanySettings(companyId) {
  if (companyId == null) return {};
  const r = await pool.query('SELECT settings FROM companies WHERE id = $1', [companyId]);
  const s = r.rows[0] ? r.rows[0].settings : {};
  return typeof s === 'string' ? JSON.parse(s) : (s || {});
}
async function setCompanySettings(companyId, patch) {
  if (companyId == null) return {};
  const cur = await getCompanySettings(companyId);
  const next = Object.assign({}, cur, patch || {});
  await pool.query('UPDATE companies SET settings = $2 WHERE id = $1', [companyId, JSON.stringify(next)]);
  return next;
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

// ─── Token-uri native (FCM/APNs) pentru aplicația mobilă ───
async function saveDeviceToken(userId, token, platform) {
  await pool.query(
    `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen = NOW()`,
    [userId, token, platform || 'android']
  );
}
async function getDeviceTokens(userId) {
  const r = await pool.query('SELECT token, platform FROM device_tokens WHERE user_id = $1', [userId]);
  return r.rows;
}
async function deleteDeviceToken(token) {
  await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]);
}

// Utilizatori care au acces la un vehicul (pentru livrarea per-user a evenimentelor)
async function getUsersForImei(imei) {
  // utilizatorii din compania device-ului (izolare la livrarea evenimentelor)
  // + superadminii (companie NULL, viewAll) — altfel proprietarul platformei nu primește niciun eveniment
  const r = await pool.query(`
    SELECT DISTINCT u.id, u.username, u.email, u.role FROM users u
    WHERE u.active IS NOT FALSE
      AND (
        u.role = 'superadmin'
        OR (
          u.company_id = (SELECT company_id FROM devices WHERE imei = $1)
          AND (
            u.role IN ('company_admin','admin','manager')
            OR EXISTS (SELECT 1 FROM user_device_access uda WHERE uda.user_id = u.id AND uda.imei = $1)
            OR EXISTS (SELECT 1 FROM user_group_access uga JOIN devices d ON d.group_id = uga.group_id WHERE uga.user_id = u.id AND d.imei = $1)
          )
        )
      )`, [imei]);
  return r.rows;
}
async function getAllActiveUsers() {
  const r = await pool.query("SELECT id, username, email, role FROM users WHERE active IS NOT FALSE");
  return r.rows;
}
// Tenant: utilizatorii activi ai unei companii (pt. livrarea notificărilor de companie). null => toți (super/global).
async function getActiveUsersForCompany(companyId) {
  if (companyId == null) return getAllActiveUsers();
  const r = await pool.query("SELECT id, username, email, role FROM users WHERE active IS NOT FALSE AND company_id = $1", [companyId]);
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
  try { if (USE_PG) { await pool.end(); } else if (_pglite) { await _pglite.close(); } } catch (e) { /* ignore */ }
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

async function updateUserPassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

// ─── Token de setare/resetare parolă (invitație + forgot-password) ───
async function setUserResetToken(id, token, expiresAt) {
  await pool.query('UPDATE users SET reset_token = $2, reset_expires = $3 WHERE id = $1', [id, token, expiresAt]);
}
async function getUserByResetToken(token) {
  if (!token) return null;
  const r = await pool.query('SELECT * FROM users WHERE reset_token = $1 AND reset_expires > $2 LIMIT 1', [token, Date.now()]);
  return r.rows[0] || null;
}
async function consumeUserResetToken(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $2, reset_token = NULL, reset_expires = NULL, active = true WHERE id = $1', [id, passwordHash]);
}
async function getUserByEmail(email) {
  if (!email) return null;
  const r = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  return r.rows[0] || null;
}

async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count);
}

// ─── Funcții soferi ───

async function getDrivers(companyId) {
  const where = companyId != null ? 'WHERE d.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  // JOIN companies → company_name (super-admin vede toți șoferii, grupați pe companie)
  const result = await pool.query(
    `SELECT d.*, c.name AS company_name
     FROM drivers d
     LEFT JOIN companies c ON c.id = d.company_id
     ${where}
     ORDER BY c.name, d.name`,
    params
  );
  return result.rows;
}

// Variantă slabă pentru selectoare (doar coloane necesare).
async function getDriversLite(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(
    `SELECT id, name, phone, license_number, company_id FROM drivers ${where} ORDER BY name`,
    params
  );
  return result.rows;
}

// UPDATE bulk pentru soferi — rupe întotdeauna devices.driver_id înainte de mutare, ca un vehicul să nu refere
// un șofer din altă companie (paritate cu setDriverCompany). Vehiculele rămân la compania veche.
async function setDriversCompanyBulk(ids, companyId) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE devices SET driver_id = NULL WHERE driver_id = ANY($1::int[])', [ids]);
    const r = await client.query('UPDATE drivers SET company_id = $2 WHERE id = ANY($1::int[])', [ids, companyId || null]);
    await client.query('COMMIT');
    return r.affectedRows || r.rowCount || 0;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function createDriver(data, companyId) {
  const result = await pool.query(
    'INSERT INTO drivers (name, phone, email, license_number, license_expiry, photo_b64, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [data.name, data.phone, data.email, data.license_number, data.license_expiry, data.photo_b64 || null, companyId || null]
  );
  return result.rows[0];
}

async function updateDriver(id, data) {
  await pool.query(
    'UPDATE drivers SET name=$2, phone=$3, email=$4, license_number=$5, license_expiry=$6, photo_b64=$7 WHERE id=$1',
    [id, data.name, data.phone, data.email, data.license_number, data.license_expiry, data.photo_b64 || null]
  );
}

async function deleteDriver(id) {
  await pool.query('UPDATE devices SET driver_id = NULL WHERE driver_id = $1', [id]);
  await pool.query('DELETE FROM drivers WHERE id = $1', [id]);
}

// ─── Funcții grupe ───

async function getGroups(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`SELECT * FROM device_groups ${where} ORDER BY name`, params);
  return result.rows;
}

async function createGroup(data, companyId) {
  const result = await pool.query(
    'INSERT INTO device_groups (name, description, color, company_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.name, data.description, data.color, companyId || null]
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

async function getGeofences(companyId) {
  const where = companyId != null ? 'WHERE g.company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(
    `SELECT g.*, dg.name AS group_name
       FROM geofences g
       LEFT JOIN device_groups dg ON dg.id = g.group_id
       ${where}
       ORDER BY g.name`, params);
  return result.rows;
}

async function createGeofence(data, companyId) {
  const result = await pool.query(
    `INSERT INTO geofences
       (name, type, coordinates, color, company_id, description, category, group_id, address, is_region, center_lat, center_lon, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [data.name, data.type, JSON.stringify(data.coordinates), data.color, companyId || null,
     data.description || null, data.category || null, data.group_id || null, data.address || null,
     !!data.is_region, (data.center_lat ?? null), (data.center_lon ?? null), data.source || 'manual']
  );
  return result.rows[0];
}

async function updateGeofence(id, data) {
  await pool.query(
    `UPDATE geofences SET name=$2, type=$3, coordinates=$4, color=$5,
       description=$6, category=$7, group_id=$8, address=$9, is_region=$10, center_lat=$11, center_lon=$12
     WHERE id=$1`,
    [id, data.name, data.type, JSON.stringify(data.coordinates), data.color,
     data.description || null, data.category || null, data.group_id || null, data.address || null,
     !!data.is_region, (data.center_lat ?? null), (data.center_lon ?? null)]
  );
}

async function deleteGeofence(id) {
  await pool.query('DELETE FROM geofences WHERE id = $1', [id]);
}

// ─── Funcții alerte ───

async function getAlerts(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const result = await pool.query(`SELECT * FROM alerts ${where} ORDER BY created_at DESC`, params);
  return result.rows;
}

async function createAlert(data, companyId) {
  const result = await pool.query(
    'INSERT INTO alerts (name, type, imei, condition, enabled, company_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [data.name, data.type, data.imei, JSON.stringify(data.condition), data.enabled !== false, companyId || null]
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

// Sumar curse pe mai multe vehicule (pentru contextul AI)
async function getTripsSummaryForImeis(imeis, from, to) {
  if (!imeis || !imeis.length) return [];
  const r = await pool.query(
    `SELECT imei, COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::numeric(10,1) AS km, COALESCE(MAX(max_speed),0) AS max_speed
     FROM trips WHERE imei = ANY($1) AND start_time >= $2 AND start_time <= $3 GROUP BY imei`,
    [imeis, from, to]
  );
  return r.rows;
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

async function getMaintenance(imei, companyId) {
  let query = 'SELECT * FROM maintenance WHERE 1=1';
  const params = [];
  if (imei) { params.push(imei); query += ` AND imei = $${params.length}`; }
  if (companyId != null) { params.push(companyId); query += ` AND company_id = $${params.length}`; }
  query += ' ORDER BY CASE WHEN status = \'pending\' THEN 0 WHEN status = \'overdue\' THEN 1 ELSE 2 END, due_date';
  const result = await pool.query(query, params);
  return result.rows;
}

async function createMaintenance(data, companyId) {
  const result = await pool.query(
    'INSERT INTO maintenance (imei, type, description, due_date, due_km, cost, status, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [data.imei, data.type, data.description, data.due_date, data.due_km, data.cost, data.status || 'pending', companyId || null]
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

// ─── Documente vehicul (ITP/RCA/CASCO/...) ───
async function getVehicleDocuments(imei, companyId) {
  let query = 'SELECT * FROM vehicle_documents WHERE 1=1';
  const params = [];
  if (imei) { params.push(imei); query += ` AND imei = $${params.length}`; }
  if (companyId != null) { params.push(companyId); query += ` AND company_id = $${params.length}`; }
  query += ' ORDER BY expiry_date ASC NULLS LAST, doc_type';
  const result = await pool.query(query, params);
  return result.rows;
}
async function createVehicleDocument(data, companyId) {
  const result = await pool.query(
    'INSERT INTO vehicle_documents (imei, doc_type, number, issuer, issue_date, expiry_date, notes, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [data.imei, data.doc_type, data.number || null, data.issuer || null, data.issue_date || null, data.expiry_date || null, data.notes || null, companyId != null ? companyId : null]
  );
  return result.rows[0];
}
async function deleteVehicleDocument(id) {
  await pool.query('DELETE FROM vehicle_documents WHERE id = $1', [id]);
}

// ─── Rapoarte programate ───
async function createReportSchedule(d) {
  const r = await pool.query(
    `INSERT INTO report_schedules (company_id, user_id, name, report_type, imei, period, frequency, hour, format, recipients, opts, enabled, next_run)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.company_id != null ? d.company_id : null, d.user_id != null ? d.user_id : null, d.name || null, d.report_type, d.imei || null,
     d.period || 'yesterday', d.frequency || 'daily', d.hour != null ? d.hour : 6, d.format || 'pdf',
     d.recipients || null, JSON.stringify(d.opts || {}), d.enabled !== false, d.next_run || null]
  );
  return r.rows[0];
}
async function getReportSchedules(companyId) {
  const where = companyId != null ? 'WHERE company_id = $1' : '';
  const params = companyId != null ? [companyId] : [];
  const r = await pool.query(`SELECT * FROM report_schedules ${where} ORDER BY created_at DESC`, params);
  return r.rows;
}
async function getReportScheduleById(id) {
  const r = await pool.query('SELECT * FROM report_schedules WHERE id = $1', [parseInt(id)]);
  return r.rows[0] || null;
}
async function updateReportSchedule(id, d) {
  await pool.query(
    `UPDATE report_schedules SET name=COALESCE($2,name), report_type=COALESCE($3,report_type), imei=$4,
       period=COALESCE($5,period), frequency=COALESCE($6,frequency), hour=COALESCE($7,hour),
       format=COALESCE($8,format), recipients=$9, opts=COALESCE($10,opts), enabled=COALESCE($11,enabled), next_run=COALESCE($12,next_run)
     WHERE id=$1`,
    [parseInt(id), d.name != null ? d.name : null, d.report_type != null ? d.report_type : null, d.imei || null,
     d.period != null ? d.period : null, d.frequency != null ? d.frequency : null, d.hour != null ? d.hour : null,
     d.format != null ? d.format : null, d.recipients || null, d.opts != null ? JSON.stringify(d.opts) : null,
     d.enabled != null ? d.enabled : null, d.next_run != null ? d.next_run : null]
  );
}
async function deleteReportSchedule(id) {
  await pool.query('DELETE FROM report_schedules WHERE id = $1', [parseInt(id)]);
}
async function getDueReportSchedules(nowIso) {
  const r = await pool.query('SELECT * FROM report_schedules WHERE enabled = true AND next_run IS NOT NULL AND next_run <= $1', [nowIso]);
  return r.rows;
}
async function setScheduleRun(id, lastRunIso, nextRunIso) {
  await pool.query('UPDATE report_schedules SET last_run = $2, next_run = $3 WHERE id = $1', [parseInt(id), lastRunIso, nextRunIso]);
}

// ─── Istoric rapoarte (per user, retenție 7 zile) ───
async function saveReportHistory(h) {
  // Fără dedup: fiecare generare din UI = un rând nou în istoric (se păstrează toate, până la expirarea de 7 zile).
  // Semnătura rămâne stocată (utilă pentru filtrări viitoare), dar NU mai înlocuiește rândurile anterioare.
  const r = await pool.query(
    `INSERT INTO report_history (company_id, user_id, username, report_type, label, imei, vehicle_count, period_from, period_to, opts, data, signature, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, generated_at, expires_at`,
    [h.company_id != null ? h.company_id : null, h.user_id != null ? h.user_id : null, h.username || null,
     h.report_type, h.label || null, h.imei || null, h.vehicle_count || 0,
     h.period_from || null, h.period_to || null, JSON.stringify(h.opts || {}), JSON.stringify(h.data || {}),
     h.signature || null, h.status || 'done', h.expires_at || null]
  );
  return r.rows[0];
}
async function getReportHistory(userId, limit) {
  try { await pool.query('DELETE FROM report_history WHERE expires_at IS NOT NULL AND expires_at < NOW()'); } catch (e) {}
  const r = await pool.query(
    `SELECT id, company_id, user_id, username, report_type, label, imei, vehicle_count, period_from, period_to, status, generated_at, expires_at
     FROM report_history WHERE user_id = $1 ORDER BY generated_at DESC LIMIT $2`,
    [userId, Math.min(parseInt(limit) || 100, 500)]
  );
  return r.rows;
}
async function getReportHistoryById(id, userId) {
  try { await pool.query('DELETE FROM report_history WHERE expires_at IS NOT NULL AND expires_at < NOW()'); } catch (e) {}
  const r = await pool.query('SELECT * FROM report_history WHERE id = $1 AND user_id = $2', [parseInt(id), userId]);
  return r.rows[0] || null;
}
async function deleteReportHistory(id, userId) {
  await pool.query('DELETE FROM report_history WHERE id = $1 AND user_id = $2', [parseInt(id), userId]);
}

// ─── Rapoarte săptămânale de activitate flotă ───
async function saveWeeklyReport(r) {
  const res = await pool.query(
    `INSERT INTO weekly_reports (company_id, period_from, period_to, data, ai_analysis, emailed)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, period_from) DO UPDATE SET
       period_to = EXCLUDED.period_to, data = EXCLUDED.data, ai_analysis = EXCLUDED.ai_analysis,
       emailed = EXCLUDED.emailed, generated_at = NOW()
     RETURNING *`,
    [r.company_id != null ? r.company_id : null, r.period_from, r.period_to,
     JSON.stringify(r.data || {}), r.ai_analysis || null, !!r.emailed]
  );
  return res.rows[0];
}
async function weeklyReportExists(companyId, periodFromIso) {
  const r = await pool.query('SELECT 1 FROM weekly_reports WHERE company_id IS NOT DISTINCT FROM $1 AND period_from = $2 LIMIT 1', [companyId != null ? companyId : null, periodFromIso]);
  return r.rows.length > 0;
}
async function getLatestWeeklyReport(companyId) {
  const r = await pool.query('SELECT * FROM weekly_reports WHERE company_id IS NOT DISTINCT FROM $1 ORDER BY period_from DESC LIMIT 1', [companyId != null ? companyId : null]);
  return r.rows[0] || null;
}
async function getWeeklyReports(companyId, limit) {
  const r = await pool.query(
    'SELECT id, company_id, period_from, period_to, generated_at, emailed FROM weekly_reports WHERE company_id IS NOT DISTINCT FROM $1 ORDER BY period_from DESC LIMIT $2',
    [companyId != null ? companyId : null, Math.min(parseInt(limit) || 26, 104)]
  );
  return r.rows;
}
async function getWeeklyReportById(id, companyId) {
  // companyId === undefined → fără filtru (super-admin); altfel scop pe companie (izolare tenant)
  let q = 'SELECT * FROM weekly_reports WHERE id = $1', params = [parseInt(id)];
  if (companyId !== undefined) { q += ' AND company_id IS NOT DISTINCT FROM $2'; params.push(companyId != null ? companyId : null); }
  const r = await pool.query(q, params);
  return r.rows[0] || null;
}
async function markWeeklyReportEmailed(id) {
  await pool.query('UPDATE weekly_reports SET emailed = TRUE WHERE id = $1', [parseInt(id)]);
}
async function getCompanyAdminEmails(companyId) {
  const r = await pool.query(
    "SELECT email FROM users WHERE company_id = $1 AND role IN ('company_admin','admin') AND email IS NOT NULL AND email <> ''",
    [companyId]
  );
  return r.rows.map(x => x.email);
}

module.exports = {
  saveWeeklyReport, weeklyReportExists, getLatestWeeklyReport, getWeeklyReports, getWeeklyReportById, markWeeklyReportEmailed, getCompanyAdminEmails,
  pool,
  initDb,
  ensureTenancy,
  createReportSchedule, getReportSchedules, getReportScheduleById, updateReportSchedule, deleteReportSchedule, getDueReportSchedules, setScheduleRun,
  saveReportHistory, getReportHistory, getReportHistoryById, deleteReportHistory,
  getCompanies, getCompanyById, getCompanyBySlug, createCompany, updateCompany, deleteCompany,
  recordAiUsage, getAiUsageByCompany, getAiTokensForCompany, getAiCallsForCompany, setCompanyAiLimit,
  setCompanyBilling, getCompanyByStripeCustomer, setCompanyPlan,
  setCompanyAccessUntil, recordPayment, getPayments,
  getCompanyImeis, setDeviceCompany, setUserCompany, setDriverCompany, getDriverById, getUnassignedDevices, getRowCompany,
  setDeviceCanInterface, getDeviceCanInterface, setDeviceLastCan, getLastStickyCan,
  createTachoFile, getTachoFiles, getTachoFile, deleteTachoFile,
  getEtransports, createEtransport, updateEtransport, deleteEtransport, getActiveEtransports,
  getWebhooks, getEnabledWebhooks, getWebhookById, createWebhook, deleteWebhook, updateWebhookStatus,
  getSetting, setSetting,
  logError, getErrors, clearErrors, pruneErrors,
  createAgentFinding, getAgentFindings, updateAgentFinding, countNewFindings,
  upsertDevice,
  updateDeviceInfo, setDeviceIgnitionSource, getDin1Imeis, getArchivedImeis,
  updateVehicleDetails,
  deviceExists,
  createDevice,
  setDeviceStatus,
  assignDevice,
  updateTruckConfig,
  updateTankCalibration,
  setFuelSensors,
  getFuelSensorsRow,
  getIoMappings, setIoMapping, deleteIoMapping,
  getDeviceFull,
  insertPositions,
  getDevices,
  getDevicesLite,
  setDevicesCompanyBulk,
  setUsersCompanyBulk,
  setDriversCompanyBulk,
  countSuperadminsInIds,
  getUsersLite,
  getDriversLite,
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
  setUserResetToken,
  getUserByResetToken,
  consumeUserResetToken,
  getUserByEmail,
  getUserCount,
  computeAllowedImeis,
  getUserAccess,
  setUserAccess,
  logAudit,
  getAuditLog,
  createApiKey,
  getApiKeys,
  getApiKeyCompany,
  getUserByApiKey,
  revokeApiKey,
  deleteApiKey,
  cleanupExpiredSessions,
  deleteOldPositions,
  archiveDevicePositions,
  purgeArchivedPositions,
  getArchivedImeis,
  countArchivedPositions,
  getArchivedDevices,
  createNotification,
  notificationKeyExists,
  getNotifications,
  unreadNotifications,
  ackNotification,
  ackAllNotifications,
  getNotificationPrefs,
  setNotificationPrefs,
  getUiPrefs, setUiPrefs,
  getCompanySettings, setCompanySettings,
  getAllNotificationPrefs,
  savePushSubscription,
  getPushSubscriptions,
  deletePushSubscription,
  saveDeviceToken,
  getDeviceTokens,
  deleteDeviceToken,
  getUsersForImei,
  getAllActiveUsers, getActiveUsersForCompany,
  saveTripsForRange,
  closeDb,
  getDrivers, createDriver, updateDriver, deleteDriver,
  getGroups, createGroup, updateGroup, deleteGroup,
  getGeofences, createGeofence, updateGeofence, deleteGeofence,
  getAlerts, createAlert, deleteAlert, getAlertHistory, insertAlertEvent,
  getTrips, getTripsSummaryForImeis, createTrip, endTrip,
  getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance,
  getVehicleDocuments, createVehicleDocument, deleteVehicleDocument
};
