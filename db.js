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
// Starea REALĂ a TimescaleDB. Fără extensie, `positions` rămâne un tabel Postgres obișnuit: fără compresie
// și fără retenție automată — adică promisiunea „180 zile istoric, storage sub control" nu se ține.
// Până acum asta se vedea doar într-un `console.warn` de la boot; acum e interogabilă (/api/admin/health).
let _timescale = { attempted: false, enabled: false, retentionDays: null, compressAfterDays: null, reason: USE_PG ? null : 'PGlite local — Timescale nu se aplică' };
function getTimescaleStatus() { return Object.assign({ usePg: USE_PG }, _timescale); }

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
    max: parseInt(process.env.PG_POOL_MAX) || 12,
    min: parseInt(process.env.PG_POOL_MIN) || 3,     // floor CALD de conexiuni → burst-ul panoului admin nu mai plătește connect+auth pe fiecare fetch
    idleTimeoutMillis: 60000, // păstrează conexiunile idle 60s (default 10s era prea scurt → primul query după pauză reconecta lent la Railway)
    connectionTimeoutMillis: 8000, // nu mai aștepta o conexiune la INFINIT (pool epuizat) → eroare clară în 8s în loc de „Se încarcă…" veșnic
    keepAlive: true           // TCP keepalive pe socketul PG (previne drop-uri silențioase)
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
    // Index pe timestamp SINGUR, pentru purjarea pe loturi: cel de mai sus începe cu `imei`, deci nu poate
    // servi un `WHERE timestamp < …`. Fără el, fiecare lot ar fi însemnat un seq scan pe toată arhiva.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posarch_ts ON positions_archive (timestamp)`);

    // ─── TimescaleDB (doar pe Postgres real): hypertable + compresie + retenție pe `positions` ───
    // La 4s × multe vehicule, asta ține storage-ul în frâu (compresie ~85-90% + ștergere automată a datelor vechi).
    if (USE_PG) {
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
        _timescale.attempted = true;
        await client.query('ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_pkey'); // hypertable cere ca PK să includă timestamp
        await client.query("SELECT create_hypertable('positions','timestamp', if_not_exists => TRUE, migrate_data => TRUE)");
        await client.query("ALTER TABLE positions SET (timescaledb.compress, timescaledb.compress_segmentby = 'imei')");
        await client.query("SELECT add_compression_policy('positions', INTERVAL '7 days', if_not_exists => TRUE)");
        const retDays = parseInt(process.env.POSITION_RETENTION_DAYS) || 180;
        await client.query("SELECT add_retention_policy('positions', INTERVAL '" + retDays + " days', if_not_exists => TRUE)");
        _timescale = { attempted: true, enabled: true, retentionDays: retDays, compressAfterDays: 7, reason: null };
        console.log('[DB] TimescaleDB activ: hypertable positions + compresie >7z + retenție ' + retDays + 'z');
      } catch (e) {
        // Degradare TĂCUTĂ până acum: fără Timescale nu există NICI compresie, NICI ștergere automată a
        // pozițiilor vechi → storage-ul crește la nesfârșit, iar „retenția 180 zile" promisă nu se aplică.
        // Reținem motivul ca să apară în /api/admin/health, nu doar într-o linie de log de la boot.
        _timescale = { attempted: true, enabled: false, retentionDays: null, compressAfterDays: null, reason: e.message };
        console.warn('[DB] ⚠ TimescaleDB indisponibil → Postgres simplu: FĂRĂ compresie și FĂRĂ retenție automată pe positions —', e.message);
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
        -- Inventar ECHIPAMENT GPS (nu vehicul): modelul trackerului (ex. FMB140) și numărul cartelei SIM.
        -- ATENȚIE: coloana "model" de mai sus e modelul VEHICULULUI (Logan, Transit) — lucruri diferite.
        -- Se completează manual la instalare (modelul NU vine în datele trimise de tracker).
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS gps_model VARCHAR(60);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim_number VARCHAR(30);
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
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS temp_min INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS temp_max INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS road_tax_category VARCHAR(30);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS cost_center VARCHAR(40);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS inventory_number VARCHAR(40);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ignition_source VARCHAR(10);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS show_transport BOOLEAN DEFAULT TRUE;
        -- „Km la bord" (index manual pt. mașini fără CAN): valoarea reală introdusă de operator la montare +
        -- snapshot-ul contorului GPS al device-ului (total_odometer, metri) și momentul → indexul se duce înainte.
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS odo_base_km NUMERIC(12,1);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS odo_base_dev_m NUMERIC(14,1);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS odo_base_at TIMESTAMPTZ;
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

    // Alimentări card combustibil (import CSV / manual) + reconciliere cu nivelul CAN al rezervorului (detecție furt)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fuel_transactions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        imei VARCHAR(20),
        driver_id INTEGER,
        ts BIGINT,
        station TEXT,
        country VARCHAR(8),
        liters DECIMAL(10,2),
        amount DECIMAL(10,2),
        currency VARCHAR(8) DEFAULT 'RON',
        card_number VARCHAR(40),
        source VARCHAR(20) DEFAULT 'manual',
        status VARCHAR(16) DEFAULT 'nou',
        tank_delta DECIMAL(10,2),
        note TEXT,
        created_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fuel_tx_company ON fuel_transactions(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fuel_tx_imei_ts ON fuel_transactions(imei, ts)`);

    // Istoric preț carburant național (media zilnică PretCarburant.ro) — pentru modulul „Preț combustibil" (trend în timp)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fuel_price_history (
        day VARCHAR(10) PRIMARY KEY,
        motorina DECIMAL(6,3),
        benzina DECIMAL(6,3),
        gpl DECIMAL(6,3),
        motorina_premium DECIMAL(6,3),
        benzina_premium DECIMAL(6,3),
        source VARCHAR(40),
        updated_at BIGINT
      )
    `);
    // Backfill: puncte REALE de referință (media națională RO, RON/L) — sursă GlobalPetrolPrices.com — ca graficul
    // să arate imediat trendul real din ultimul an. Non-distructiv (ON CONFLICT DO NOTHING → datele zilnice live
    // din PretCarburant.ro primează pe orice zi comună). Idempotent la fiecare boot.
    await client.query(
      `INSERT INTO fuel_price_history (day, motorina, benzina, gpl, source, updated_at) VALUES
        ('2025-06-29', 7.42, 7.08, 3.61, 'GlobalPetrolPrices.com', ${Date.now()}),
        ('2026-03-29', 10.07, 9.18, 4.15, 'GlobalPetrolPrices.com', ${Date.now()}),
        ('2026-05-29', 9.64, 9.65, 4.45, 'GlobalPetrolPrices.com', ${Date.now()}),
        ('2026-06-29', 9.41, 8.73, 4.56, 'GlobalPetrolPrices.com', ${Date.now()})
       ON CONFLICT (day) DO NOTHING`
    );
    // Medii LUNARE reale (arhivă publică de piață) pentru golul iul. 2025 – feb. 2026 — altfel graficul „1 an"
    // trăgea o linie dreaptă de 9 luni între referințele trimestriale. GPL: fără date lunare (NULL) — frontend-ul
    // (web+mobil) filtrează null per serie, deci linia GPL doar interpolează peste referințele existente.
    await client.query(
      `INSERT INTO fuel_price_history (day, motorina, benzina, gpl, source, updated_at) VALUES
        ('2025-07-15', 7.56, 7.08, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2025-08-15', 7.74, 7.37, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2025-09-15', 7.81, 7.52, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2025-10-15', 7.65, 7.33, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2025-11-15', 8.05, 7.57, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2025-12-15', 7.65, 7.37, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2026-01-15', 7.95, 7.68, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2026-02-15', 8.16, 7.79, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2026-03-15', 9.73, 8.96, NULL, 'arhivă piață (medie lunară)', ${Date.now()}),
        ('2026-04-15', 9.02, 8.07, NULL, 'arhivă piață (medie lunară)', ${Date.now()})
       ON CONFLICT (day) DO NOTHING`
    );

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
        ALTER TABLE users ADD COLUMN IF NOT EXISTS access_until BIGINT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_request_id INTEGER;
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
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_can JSONB`,
      `ALTER TABLE vehicle_documents ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2)`
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
        ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS work_schedule JSONB;   -- program de lucru (override pe grup)
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS work_schedule JSONB;         -- program de lucru (override pe vehicul)
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS install_issue JSONB;         -- semnalare „problemă la montaj" {note, at, by} / NULL
        ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS interval_km INTEGER;     -- recurență: următoarea scadență la +N km după „efectuat"
        ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS interval_months INTEGER; -- recurență: următoarea scadență la +N luni după „efectuat"
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
        ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS done_at TIMESTAMP;
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
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS cui VARCHAR(40);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS reg_com VARCHAR(40);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS address VARCHAR(255);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS iban VARCHAR(34);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]';
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_day INTEGER DEFAULT 1;         -- ziua lunii la care se emite factura (facturare automată)
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_term_days INTEGER DEFAULT 15;  -- termen de plată (zile) → scadența facturii
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_invoice BOOLEAN DEFAULT false;    -- intră în ciclul lunar automat de facturare
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_payer BOOLEAN DEFAULT true;        -- clientul e plătitor de TVA (informativ pe factură)
      END $$
    `);
    // Indecși pt. interogările REALE ale clopoțelului (listă + contor necitite, pollat de UI). Se creează AICI,
    // DUPĂ ALTER-ele care adaugă company_id/user_id — altfel ar eșua pe o bază nouă (coloane inexistente).
    // Fără ei, COUNT(*) cu `imei = ANY($2)` pe ~2000 IMEI făcea seq scan pe toată tabela.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_co_created ON notifications (company_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_imei_created ON notifications (imei, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications (user_id, created_at DESC)`);
    // Reparare: reguli de alertă rămase FĂRĂ companie. Se creau așa când le salva super-adminul (el n-are
    // companie proprie, iar formularul nu cerea una) — și atunci se declanșau pentru flotele TUTUROR
    // clienților, invizibile în lista fiecăruia. Unde regula are un vehicul, compania e neechivocă: e a
    // vehiculului. Regulile fără vehicul ȘI fără companie NU se ating (ar fi o ghicitoare) — interfața le
    // marchează acum vizibil cu „TOATE companiile", ca să fie o alegere, nu o scăpare.
    await client.query(`
      UPDATE alerts a SET company_id = d.company_id
        FROM devices d
       WHERE a.imei = d.imei AND a.company_id IS NULL AND d.company_id IS NOT NULL
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
    // ─── Facturi (fiscale) — emise către clienți; abonament lunar GPS. Serie persistentă + linii + defalcare TVA + stare e-Factura. ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        series VARCHAR(16) NOT NULL DEFAULT 'RAT',
        number INTEGER NOT NULL,
        year INTEGER NOT NULL,
        full_number VARCHAR(40),                    -- „RAT-2026-00042" (denormalizat pt. afișare/căutare)
        type VARCHAR(16) NOT NULL DEFAULT 'invoice', -- invoice | proforma | credit_note
        status VARCHAR(16) NOT NULL DEFAULT 'draft', -- draft | issued | sent | paid | overdue | canceled
        issue_date BIGINT, due_date BIGINT,
        period_start BIGINT, period_end BIGINT,
        currency VARCHAR(3) NOT NULL DEFAULT 'RON',
        subtotal NUMERIC(12,2) DEFAULT 0,           -- net (fără TVA)
        vat_amount NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) DEFAULT 0,              -- brut (cu TVA)
        lines JSONB DEFAULT '[]',                   -- [{desc, qty, unitPrice, vatRate, net, vat, gross}]
        issuer JSONB,                               -- snapshot emitent la emitere (imutabil)
        client JSONB,                               -- snapshot client la emitere (imutabil)
        efactura_status VARCHAR(24),                -- null | pending | uploaded | validated | error
        efactura_id VARCHAR(80),
        efactura_error TEXT,
        stripe_invoice_id VARCHAR(80),
        payment_id INTEGER,
        paid_at BIGINT,
        note TEXT,
        created_by INTEGER,
        created_at BIGINT,
        updated_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, due_date)`);
    // Contor serie de facturi (per serie+an) — sursă ATOMICĂ pt. numerotare secvențială fără găuri/duplicate.
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_counters (
        series VARCHAR(16) NOT NULL,
        year INTEGER NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (series, year)
      )
    `);
    // ─── Control costuri: cheltuielile NOASTRE de platformă (RoTLD, Railway, Cloudflare, Anthropic…) — NU sunt scopate pe companie ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_costs (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(80) NOT NULL,
        category VARCHAR(40),
        description VARCHAR(200),
        amount NUMERIC(12,2),
        currency VARCHAR(3) NOT NULL DEFAULT 'RON',
        cycle VARCHAR(12) NOT NULL DEFAULT 'monthly',
        next_due BIGINT,
        last_paid_at BIGINT,
        url VARCHAR(255),
        notes TEXT,
        active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at BIGINT,
        updated_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_platform_costs_due ON platform_costs(active, next_due)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS costs_payments (
        id SERIAL PRIMARY KEY,
        cost_id INTEGER NOT NULL,
        amount NUMERIC(12,2),
        currency VARCHAR(3),
        paid_at BIGINT,
        period_covered_to BIGINT,
        method VARCHAR(40) DEFAULT 'manual',
        note TEXT,
        created_by INTEGER,
        created_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_costs_payments_cost ON costs_payments(cost_id, paid_at DESC)`);
    // Seed: rânduri de start EDITABILE (doar dacă tabelul e gol) — utilizatorul le ajustează/șterge din UI.
    try {
      const _pcCount = await client.query('SELECT COUNT(*)::int AS n FROM platform_costs');
      if ((_pcCount.rows[0] && _pcCount.rows[0].n) === 0) {
        const _now = Date.now();
        const _seed = [
          ['RoTLD', 'domain', 'Domeniu ratrack.ro', 50, 'RON', 'yearly', 'https://rotld.ro'],
          ['Railway', 'hosting', 'Hosting aplicație + PostgreSQL/TimescaleDB', 20, 'USD', 'monthly', 'https://railway.app'],
          ['Cloudflare', 'cdn', 'DNS + CDN + proxy', 0, 'USD', 'monthly', 'https://cloudflare.com'],
          ['Anthropic', 'api', 'Claude API (Asistent AI + RA Insight)', 0, 'USD', 'monthly', 'https://console.anthropic.com']
        ];
        for (const s of _seed) {
          await client.query(
            `INSERT INTO platform_costs (provider,category,description,amount,currency,cycle,next_due,url,active,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$9)`,
            [s[0], s[1], s[2], s[3], s[4], s[5], _now, s[6], _now]
          );
        }
      }
    } catch (e) { /* seed best-effort */ }
    // Asigură rândurile Google Analytics + Search Console (gratuit, $0) în registru — IDEMPOTENT (rulează chiar dacă
    // tabelul nu mai e gol). Cardurile lor arată date LIVE când sunt setate GA4_PROPERTY_ID / GSC_SITE_URL + service-account.
    try {
      const _gnow = Date.now();
      const _google = [
        ['Google Analytics', 'analytics', 'Trafic web (GA4) — vizitatori, sesiuni, pagini', 'https://analytics.google.com'],
        ['Google Search Console', 'seo', 'Performanță căutare Google — clicuri, afișări, poziție', 'https://search.google.com/search-console'],
      ];
      for (const g of _google) {
        // verificare + INSERT VALUES simplu (același tipar ca seed-ul de mai sus). NU folosi
        // `INSERT … SELECT $1 … WHERE NOT EXISTS(… $1)` — inferența de tip a parametrilor eșuează.
        const _ex = await client.query('SELECT 1 FROM platform_costs WHERE provider = $1 LIMIT 1', [g[0]]);
        if (_ex.rows.length === 0) {
          await client.query(
            `INSERT INTO platform_costs (provider,category,description,amount,currency,cycle,next_due,url,active,created_at,updated_at)
             VALUES ($1,$2,$3,0,'USD','monthly',$4,$5,true,$6,$6)`,
            [g[0], g[1], g[2], _gnow, g[3], _gnow]
          );
        }
      }
    } catch (e) { if (typeof console !== 'undefined') console.warn('[costs] seed Google:', e && e.message); }
    // Cereri de cont demo trimise din formularul public de pe landing (lead-uri comerciale).
    // Datele personale stau DOAR aici; notificarea către super-admin nu conține niciun câmp PII.
    // NOTĂ: o instrucțiune per client.query() — protocolul extins nu acceptă două CREATE TABLE într-un apel.
    await client.query(`
      CREATE TABLE IF NOT EXISTS demo_requests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120), company VARCHAR(160), email VARCHAR(160) NOT NULL, phone VARCHAR(40),
        message TEXT, wants_demo BOOLEAN DEFAULT false, consent BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'new', ip VARCHAR(60), user_agent VARCHAR(300),
        user_id INTEGER, approved_by INTEGER, access_until BIGINT, notes TEXT,
        created_at BIGINT, updated_at BIGINT
      )
    `);
    // Ofertare Live: oferte salvate (configurator de preț cu istoric)
    await client.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(160),
        client_name VARCHAR(160),
        client_cui VARCHAR(40),
        client_contact VARCHAR(200),
        config JSONB,
        monthly_total NUMERIC(12,2),
        currency VARCHAR(3) DEFAULT 'RON',
        notes TEXT,
        created_by INTEGER,
        created_at BIGINT,
        updated_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_offers_created ON offers(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_demoreq_created ON demo_requests(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_demoreq_email ON demo_requests(email, created_at DESC)`);
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
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Migrare pentru bazele EXISTENTE (coloanele de mai sus acoperă doar bazele proaspete). ATENȚIE la
    // ordine: aceste ALTER-uri stăteau în blocul mare de migrări de la începutul funcției, care rulează
    // ÎNAINTE de CREATE TABLE — pe o bază goală (CI, instalare nouă, sandbox) serverul murea la pornire
    // cu „relation ai_usage does not exist". Migrarea unei tabele stă DUPĂ crearea ei.
    await client.query(`ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS user_id INTEGER`);
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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_findings_created ON agent_findings(created_at DESC)`); // pt. „Toate companiile" (ORDER BY created_at fără filtru pe companie)

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
    // Migrarea de mai jos e pentru date LEGACY (dinainte de multi-tenancy) și trebuie să ruleze O SINGURĂ
    // DATĂ. Fără marcaj, se reaprindea la fiecare pornire: era de ajuns un vehicul neasignat — un dispozitiv
    // nou adoptat, de pildă — ca să mature în „Compania mea" TOATE rândurile fără companie din șapte tabele,
    // inclusiv alertele și zonele definite pe toată platforma. Un vehicul nou schimba astfel, tăcut,
    // apartenența unor reguli care n-aveau nicio legătură cu el.
    // Vehiculele neasignate sunt de altfel o stare LEGITIMĂ a produsului (există lista „fără companie" din
    // Dispozitive, vezi getUnassignedDevices) — operatorul le repartizează, nu o bază de date la repornire.
    if (await getSetting('tenancy_migrated')) return;
    // Bază care are DEJA companii reale = platformă multi-tenant funcțională: nu mai există date „dinainte
    // de companii" de mutat. O marcăm ca migrată fără să atingem nimic — altfel prima pornire după acest
    // fix ar mai executa o dată exact măturarea pe care o oprim.
    const co = (await pool.query('SELECT COUNT(*)::int AS n FROM companies WHERE is_demo IS NOT TRUE')).rows[0].n;
    if (co > 0) { await setSetting('tenancy_migrated', String(Date.now())); return; }
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
    await setSetting('tenancy_migrated', String(Date.now()));
  } catch (e) { console.warn('[DB] ensureTenancy:', e.message); }
}

// ─── MULTI-TENANT: companii ───
async function getCompanies() {
  // 3 scanări GRUPATE (LEFT JOIN pe agregate) în loc de 4 sub-query-uri CORELATE per companie. Aceleași coloane
  // (device_count/user_count/payment_count/paid_total), dar costul nu mai crește cu nr. de companii (O(N) → plat).
  const r = await pool.query(`
    SELECT c.*,
      COALESCE(dev.device_count, 0) AS device_count,
      COALESCE(usr.user_count, 0) AS user_count,
      COALESCE(pay.payment_count, 0) AS payment_count,
      COALESCE(pay.paid_total, 0) AS paid_total
    FROM companies c
    LEFT JOIN (SELECT company_id, COUNT(*)::int AS device_count FROM devices WHERE COALESCE(status,'') <> 'archived' GROUP BY company_id) dev ON dev.company_id = c.id
    LEFT JOIN (SELECT company_id, COUNT(*)::int AS user_count FROM users GROUP BY company_id) usr ON usr.company_id = c.id
    LEFT JOIN (SELECT company_id, COUNT(*)::int AS payment_count, COALESCE(SUM(amount_ron), 0) AS paid_total FROM payments GROUP BY company_id) pay ON pay.company_id = c.id
    ORDER BY c.created_at`);
  return r.rows;
}

// ─── Consum AI (tokeni) per companie ───
async function recordAiUsage(companyId, kind, usage, userId) {
  if (!usage) return;
  const inp = parseInt(usage.input_tokens) || 0;
  const out = parseInt(usage.output_tokens) || 0;
  const cr = parseInt(usage.cache_read_input_tokens) || 0;
  const cw = parseInt(usage.cache_creation_input_tokens) || 0;
  if (!inp && !out && !cr && !cw) return;
  // UN rând = O întrebare a userului (agentul RA Insight face mai multe apeluri pe întrebare, dar
  // consumul lor e însumat înainte de a ajunge aici) → COUNT(*) e chiar numărul de întrebări.
  await pool.query(
    'INSERT INTO ai_usage (company_id, kind, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [companyId != null ? companyId : null, String(kind || 'ai').slice(0, 20), inp, out, cr, cw, userId != null ? userId : null]
  );
}
// Consumul lunii CALENDARISTICE curente (nu 30 de zile rulante) — ca să se potrivească cu factura.
// `kinds` = tipurile care se numără drept „întrebare" a clientului (restul sunt automatisme interne).
const AI_BILLABLE_KINDS = ['insight', 'chat', 'report'];
// Utilizarea RA Insight pe LUNA CURENTĂ, grupată pe companie — pentru privirea de ansamblu
// a super-adminului: cine folosește, cât, și cât ne costă.
async function getAiMonthUsageByCompany(kinds) {
  const k = Array.isArray(kinds) && kinds.length ? kinds : AI_BILLABLE_KINDS;
  const r = await pool.query(
    `SELECT company_id,
            COUNT(*)::int AS questions,
            COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
            COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
            COALESCE(SUM(cache_read_tokens),0)::bigint AS cache_read_tokens,
            COALESCE(SUM(cache_write_tokens),0)::bigint AS cache_write_tokens,
            MAX(created_at) AS last_used
       FROM ai_usage
      WHERE kind = ANY($1) AND created_at >= date_trunc('month', NOW())
      GROUP BY company_id`, [k]);
  return r.rows;
}
async function getAiMonthUsage(companyId, kinds) {
  const k = Array.isArray(kinds) && kinds.length ? kinds : AI_BILLABLE_KINDS;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS questions,
            COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
            COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
            COALESCE(SUM(cache_read_tokens),0)::bigint AS cache_read_tokens,
            COALESCE(SUM(cache_write_tokens),0)::bigint AS cache_write_tokens
       FROM ai_usage
      WHERE company_id IS NOT DISTINCT FROM $1
        AND kind = ANY($2)
        AND created_at >= date_trunc('month', NOW())`,
    [companyId != null ? companyId : null, k]
  );
  const row = r.rows[0] || {};
  return {
    questions: Number(row.questions) || 0,
    input_tokens: Number(row.input_tokens) || 0,
    output_tokens: Number(row.output_tokens) || 0,
    cache_read_tokens: Number(row.cache_read_tokens) || 0,
    cache_write_tokens: Number(row.cache_write_tokens) || 0
  };
}
async function getAiUsageByCompany(sinceDays) {
  const days = parseInt(sinceDays);
  let where = '', params = [];
  if (days > 0) { params.push(new Date(Date.now() - days * 86400000).toISOString()); where = 'WHERE created_at >= $1'; }
  const r = await pool.query(
    `SELECT company_id,
       COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
       COALESCE(SUM(cache_write_tokens), 0)::bigint AS cache_write_tokens,
       COUNT(*)::int AS calls
     FROM ai_usage ${where} GROUP BY company_id`, params);
  return r.rows;
}
// Consum AI grupat pe tip de asistent (kind) — pentru panoul „Asistenți AI" din Analize statistice.
// companyId=null → toate companiile (super-admin fără filtru). sinceDays=0/null → tot istoricul.
async function getAiUsageByKind(companyId, sinceDays) {
  const params = [], conds = [];
  if (companyId != null) { params.push(companyId); conds.push('company_id = $' + params.length); }
  const days = parseInt(sinceDays);
  if (days > 0) { params.push(new Date(Date.now() - days * 86400000).toISOString()); conds.push('created_at >= $' + params.length); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const r = await pool.query(
    `SELECT kind,
       COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COUNT(*)::int AS calls,
       MAX(created_at)  AS last_used
     FROM ai_usage ${where} GROUP BY kind`, params);
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
// Toate plățile + numele companiei + total încasat — pentru tabelul de facturare (super-admin).
async function getAllPayments(limit) {
  const lim = Math.min(parseInt(limit) || 500, 2000);
  const r = await pool.query(`
    SELECT p.*, c.name AS company_name
    FROM payments p LEFT JOIN companies c ON c.id = p.company_id
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
    LIMIT $1`, [lim]);
  const total = r.rows.reduce((s, x) => s + (Number(x.amount_ron) || 0), 0);
  return { payments: r.rows, total: Math.round(total * 100) / 100 };
}
// ─── Facturi (invoices) ───
const _r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
// Contor ATOMIC per serie+an → următorul număr secvențial (fără duplicate/găuri chiar la emitere concurentă).
async function nextInvoiceNumber(series, year) {
  series = String(series || 'RAT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'RAT';
  year = parseInt(year) || new Date().getFullYear();
  const r = await pool.query(
    `INSERT INTO invoice_counters (series, year, last_number) VALUES ($1,$2,1)
     ON CONFLICT (series, year) DO UPDATE SET last_number = invoice_counters.last_number + 1
     RETURNING last_number`,
    [series, year]
  );
  const n = r.rows[0].last_number;
  return { series, year, number: n, full: series + '-' + year + '-' + String(n).padStart(5, '0') };
}
async function createInvoice(inv) {
  const now = Date.now();
  const r = await pool.query(
    `INSERT INTO invoices (company_id, series, number, year, full_number, type, status, issue_date, due_date, period_start, period_end, currency, subtotal, vat_amount, total, lines, issuer, client, note, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21) RETURNING *`,
    [inv.companyId, inv.series || 'RAT', inv.number, inv.year, inv.fullNumber || null, inv.type || 'invoice', inv.status || 'draft',
      inv.issueDate || now, inv.dueDate || null, inv.periodStart || null, inv.periodEnd || null, inv.currency || 'RON',
      _r2(inv.subtotal), _r2(inv.vatAmount), _r2(inv.total), JSON.stringify(inv.lines || []),
      inv.issuer ? JSON.stringify(inv.issuer) : null, inv.client ? JSON.stringify(inv.client) : null, inv.note || null, inv.createdBy || null, now]
  );
  return r.rows[0];
}
async function getInvoice(id) {
  const r = await pool.query('SELECT i.*, c.name AS company_name FROM invoices i LEFT JOIN companies c ON c.id = i.company_id WHERE i.id = $1', [id]);
  return r.rows[0] || null;
}
async function getInvoices(opts) {
  opts = opts || {};
  const cond = [], args = [];
  if (opts.companyId != null) { args.push(opts.companyId); cond.push('i.company_id = $' + args.length); }
  if (opts.status) { args.push(opts.status); cond.push('i.status = $' + args.length); }
  const where = cond.length ? ('WHERE ' + cond.join(' AND ')) : '';
  args.push(Math.min(parseInt(opts.limit) || 500, 2000));
  const r = await pool.query(
    `SELECT i.*, c.name AS company_name FROM invoices i LEFT JOIN companies c ON c.id = i.company_id
     ${where} ORDER BY i.year DESC, i.number DESC LIMIT $${args.length}`, args);
  return r.rows;
}
// Actualizare parțială controlată (stare / e-Factura / legătură plată). NU atinge liniile/emitentul o dată emise (imutabile).
async function updateInvoice(id, f) {
  const map = { status: 'status', efacturaStatus: 'efactura_status', efacturaId: 'efactura_id', efacturaError: 'efactura_error',
    stripeInvoiceId: 'stripe_invoice_id', paymentId: 'payment_id', paidAt: 'paid_at', dueDate: 'due_date', note: 'note' };
  const sets = [], args = [id];
  for (const k of Object.keys(map)) { if (f[k] !== undefined) { args.push(f[k]); sets.push(map[k] + ' = $' + args.length); } }
  if (!sets.length) return getInvoice(id);
  args.push(Date.now()); sets.push('updated_at = $' + args.length);
  const r = await pool.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, args);
  return r.rows[0] || null;
}
// ATOMIC: încasare + marcarea facturii ca plătită într-o SINGURĂ tranzacție.
// Înainte erau două await-uri separate: dacă al doilea eșua, rămâneai cu plată înregistrată și factură
// NEACHITATĂ (doar un console.warn) — inconsistență contabilă. Critic la plata cu cardul, la scară.
async function payInvoiceAtomic(invoiceId, payment, invoiceFields) {
  const client = await pool.connect();
  const now = Date.now();
  try {
    await client.query('BEGIN');
    const pr = await client.query(
      `INSERT INTO payments (company_id, amount_ron, period_start, period_end, method, note, paid_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [payment.companyId, (payment.amountRon != null ? payment.amountRon : null), payment.periodStart || null,
       payment.periodEnd || null, payment.method || 'manual', payment.note || null, payment.paidAt || now, payment.createdBy || null, now]
    );
    const pay = pr.rows[0];
    const f = Object.assign({ status: 'paid', paidAt: now, paymentId: pay.id }, invoiceFields || {});
    const map = { status: 'status', efacturaStatus: 'efactura_status', efacturaId: 'efactura_id', efacturaError: 'efactura_error',
      stripeInvoiceId: 'stripe_invoice_id', paymentId: 'payment_id', paidAt: 'paid_at', dueDate: 'due_date', note: 'note' };
    const sets = [], args = [invoiceId];
    for (const k of Object.keys(map)) { if (f[k] !== undefined) { args.push(f[k]); sets.push(map[k] + ' = $' + args.length); } }
    args.push(now); sets.push('updated_at = $' + args.length);
    const ir = await client.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, args);
    await client.query('COMMIT');
    // accesul companiei se prelungește DUPĂ commit (nu face parte din consistența contabilă)
    if (payment.periodEnd) { try { await setCompanyAccessUntil(payment.companyId, payment.periodEnd); } catch (e) {} }
    return { payment: pay, invoice: ir.rows[0] || null };
  } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { client.release(); }
}

// ─── Control costuri (platform_costs) ───
async function listPlatformCosts(opts) {
  opts = opts || {};
  const where = opts.activeOnly ? 'WHERE active = true' : '';
  const r = await pool.query(`SELECT * FROM platform_costs ${where} ORDER BY active DESC, next_due ASC NULLS LAST, id DESC`);
  return r.rows;
}
async function getPlatformCostById(id) {
  const r = await pool.query('SELECT * FROM platform_costs WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function createPlatformCost(c) {
  const now = Date.now();
  const r = await pool.query(
    `INSERT INTO platform_costs (provider,category,description,amount,currency,cycle,next_due,url,notes,active,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
    [c.provider, c.category || null, c.description || null, (c.amount != null ? c.amount : null), c.currency || 'RON', c.cycle || 'monthly', (c.nextDue != null ? c.nextDue : null), c.url || null, c.notes || null, (c.active !== false), c.createdBy || null, now]
  );
  return r.rows[0];
}
async function updatePlatformCost(id, c) {
  // provider/currency/cycle/amount/active = COALESCE (un PUT parțial nu le șterge); description/url/notes = set direct (se pot goli).
  const r = await pool.query(
    `UPDATE platform_costs SET provider=COALESCE($2,provider), category=COALESCE($3,category), description=$4,
       amount=COALESCE($5,amount), currency=COALESCE($6,currency), cycle=COALESCE($7,cycle),
       next_due=$8, url=$9, notes=$10, active=COALESCE($11,active), updated_at=$12
     WHERE id=$1 RETURNING *`,
    [id, c.provider || null, c.category || null, (c.description !== undefined ? c.description : null), (c.amount != null ? c.amount : null), c.currency || null, c.cycle || null, (c.nextDue !== undefined ? c.nextDue : null), (c.url !== undefined ? c.url : null), (c.notes !== undefined ? c.notes : null), (c.active === undefined ? null : c.active), Date.now()]
  );
  return r.rows[0];
}
async function deletePlatformCost(id) {
  await pool.query('DELETE FROM costs_payments WHERE cost_id = $1', [id]);
  await pool.query('DELETE FROM platform_costs WHERE id = $1', [id]);
}
async function getCostPayments(costId, limit) {
  const lim = Math.min(parseInt(limit) || 50, 500);
  const r = await pool.query('SELECT * FROM costs_payments WHERE cost_id = $1 ORDER BY paid_at DESC LIMIT $2', [costId, lim]);
  return r.rows;
}
// Marchează un cost ca plătit: scrie în istoric + avansează scadența (nextDue calculat în server prin _addMonthsMs).
async function markCostPaid(id, o) {
  o = o || {};
  const now = Date.now();
  const r = await pool.query(
    `INSERT INTO costs_payments (cost_id, amount, currency, paid_at, period_covered_to, method, note, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, (o.amount != null ? o.amount : null), o.currency || null, o.paidAt || now, (o.nextDue != null ? o.nextDue : null), o.method || 'manual', o.note || null, o.createdBy || null, now]
  );
  const upd = await pool.query(
    `UPDATE platform_costs SET next_due=$2, last_paid_at=$3, active=COALESCE($4,active), updated_at=$5 WHERE id=$1 RETURNING *`,
    [id, (o.nextDue != null ? o.nextDue : null), o.paidAt || now, (o.active === undefined ? null : o.active), now]
  );
  return { cost: upd.rows[0], payment: r.rows[0] };
}
// Cash-flow platformă (super-admin): rânduri brute din fromMs pentru agregare lunară venituri vs cheltuieli.
//  - income: plăți încasate de la companiile-client (payments, amount_ron = RON)
//  - expenses: plăți efective pe costuri (costs_payments) + furnizor/categorie din platform_costs (moneda proprie)
//  - recurring: costuri active pentru estimarea burn-ului lunar (proiecție)
// Agregarea pe luni + conversia valutară se fac în server.js (o singură sursă de rate FX).
async function getFinanceSummary(fromMs) {
  const from = Number(fromMs) || 0;
  const inc = await pool.query(`
    SELECT COALESCE(p.paid_at, p.created_at) AS ts, p.amount_ron AS amount, p.company_id, c.name AS company_name
    FROM payments p LEFT JOIN companies c ON c.id = p.company_id
    WHERE COALESCE(p.paid_at, p.created_at) >= $1
    ORDER BY ts ASC`, [from]);
  const exp = await pool.query(`
    SELECT cp.paid_at AS ts, cp.amount, COALESCE(cp.currency, pc.currency, 'RON') AS currency, pc.provider, pc.category
    FROM costs_payments cp LEFT JOIN platform_costs pc ON pc.id = cp.cost_id
    WHERE cp.paid_at >= $1 AND cp.amount IS NOT NULL
    ORDER BY cp.paid_at ASC`, [from]);
  const recurring = await pool.query(
    `SELECT provider, category, amount, currency, cycle FROM platform_costs WHERE active = true AND amount IS NOT NULL`);
  return { income: inc.rows, expenses: exp.rows, recurring: recurring.rows };
}
// Capacitatea bazei de date din PostgreSQL-ul PROPRIU (fără token extern): mărime totală + defalcare pe tabel.
async function getDbCapacity() {
  let dbBytes = null, tables = [];
  try {
    const r = await pool.query('SELECT pg_database_size(current_database()) AS bytes');
    dbBytes = (r.rows[0] && r.rows[0].bytes != null) ? Number(r.rows[0].bytes) : null;
  } catch (e) { dbBytes = null; }
  try {
    const t = await pool.query(
      `SELECT n.nspname AS schema_name, c.relname AS tbl,
         pg_total_relation_size(c.oid) AS total_bytes,
         pg_relation_size(c.oid) AS table_bytes,
         pg_indexes_size(c.oid) AS index_bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r','p','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
       ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 25`
    );
    tables = t.rows.map(function (x) { return { schema: x.schema_name, table: x.tbl, total: Number(x.total_bytes) || 0, data: Number(x.table_bytes) || 0, idx: Number(x.index_bytes) || 0 }; });
  } catch (e) { tables = []; }
  return { dbBytes, tables };
}
// ─── Ofertare Live (oferte salvate) ───
async function listOffers() {
  const r = await pool.query('SELECT * FROM offers ORDER BY created_at DESC LIMIT 500');
  return r.rows;
}
async function getOfferById(id) {
  const r = await pool.query('SELECT * FROM offers WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function createOffer(o) {
  const now = Date.now();
  const r = await pool.query(
    `INSERT INTO offers (name, client_name, client_cui, client_contact, config, monthly_total, currency, notes, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
    [o.name || null, o.client_name || null, o.client_cui || null, o.client_contact || null, JSON.stringify(o.config || {}), o.monthly_total || 0, o.currency || 'RON', o.notes || null, o.created_by || null, now]
  );
  return r.rows[0];
}
async function updateOffer(id, o) {
  const now = Date.now();
  const r = await pool.query(
    `UPDATE offers SET name=$2, client_name=$3, client_cui=$4, client_contact=$5, config=$6, monthly_total=$7, currency=$8, notes=$9, updated_at=$10 WHERE id=$1 RETURNING *`,
    [id, o.name || null, o.client_name || null, o.client_cui || null, o.client_contact || null, JSON.stringify(o.config || {}), o.monthly_total || 0, o.currency || 'RON', o.notes || null, now]
  );
  return r.rows[0] || null;
}
async function deleteOffer(id) {
  await pool.query('DELETE FROM offers WHERE id = $1', [id]);
  return { ok: true };
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
    `UPDATE companies SET name=COALESCE($2,name), contact_email=$3, phone=$4, plan=COALESCE($5,plan), active=COALESCE($6,active), cui=$7, reg_com=$8, address=$9, iban=$10, bank_name=$11, contacts=COALESCE($12, contacts) WHERE id=$1`,
    [id, data.name || null, data.contact_email || null, data.phone || null, data.plan || null, (data.active === undefined ? null : data.active), data.cui || null, data.reg_com || null, data.address || null, data.iban || null, data.bank_name || null, (data.contacts !== undefined ? JSON.stringify(data.contacts) : null)]
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
// Ca getCompanyImeis, dar EXCLUDE vehiculele arhivate — pentru rapoarte/analitice (nu pentru scoping de acces).
async function getCompanyActiveImeis(companyId) {
  const r = await pool.query("SELECT imei FROM devices WHERE company_id = $1 AND status IS DISTINCT FROM 'archived'", [companyId]);
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
// Adopție ATOMICĂ: setează compania DOAR dacă device-ul e încă neasignat (company_id NULL). Întoarce true dacă
// CHIAR această cerere a făcut adopția → închide cursa a două companii care adoptă simultan același IMEI neasignat.
async function adoptDevice(imei, companyId) {
  if (companyId == null) return false;
  const r = await pool.query('UPDATE devices SET company_id = $2 WHERE imei = $1 AND company_id IS NULL RETURNING imei', [imei, companyId]);
  const ok = !!(r.rows && r.rows.length > 0);
  if (ok) await _purgeDeviceFeed([imei]);
  return ok;
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
// Fișiere tahograf. Implicit EXCLUDE rândurile kind='demo' (generate de modulul demonstrativ) — altfel
// apăreau în lista reală ca și cum ar fi descărcări legale. `includeDemo` doar pentru ecranul demo.
async function getTachoFiles(companyId, includeDemo) {
  const demoFilter = includeDemo ? '' : " kind IS DISTINCT FROM 'demo'";
  const where = companyId != null
    ? ('WHERE company_id = $1' + (demoFilter ? ' AND' + demoFilter : ''))
    : (demoFilter ? 'WHERE' + demoFilter : '');
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
// Dedup INTELIGENT (nu doar pe timp): (1) aceeași cheie în ultimele 12h → suprimat, DAR o ESCALADARE de
// severitate (warning→critical) trece mereu; (2) respectăm „Ignoră": o constatare respinsă nu reapare ~7 zile
// decât dacă escaladează. Altfel panoul devenea spam (aceeași constatare reînvia de 2×/zi timp de o lună).
async function createAgentFinding(f) {
  if (f.fkey) {
    const _rank = (s) => (s === 'critical' ? 2 : s === 'warning' ? 1 : 0);
    const ex = await pool.query(
      'SELECT severity, status, created_at FROM agent_findings WHERE company_id IS NOT DISTINCT FROM $1 AND fkey = $2 ORDER BY created_at DESC LIMIT 1',
      [f.companyId == null ? null : f.companyId, f.fkey]
    );
    if (ex.rows.length) {
      const prev = ex.rows[0];
      const ageH = (Date.now() - new Date(prev.created_at).getTime()) / 3600000;
      const escalated = _rank(f.severity || 'info') > _rank(prev.severity || 'info');
      if (!escalated) {
        if (ageH < 12) return null;                                          // deja semnalat recent
        if (prev.status === 'dismissed' && ageH < 7 * 24) return null;       // userul a respins-o → nu insista
      }
    }
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
// Retenție constatări: fără ea, agent_findings creștea la nesfârșit (panoul are limită de 80 → 
// constatările vechi împingeau afară pe cele noi, iar tabela nu se golea niciodată).
async function pruneAgentFindings(days) {
  const d = Math.max(7, parseInt(days) || 90);
  const r = await pool.query("DELETE FROM agent_findings WHERE created_at < NOW() - INTERVAL '" + d + " days'");
  return r.rowCount || 0;
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
// Device-uri neasignate (vizibile doar super-adminului) + pentru asignare.
// Excludem cele RESPINSE (status='archived') — ele au ieșit din coada de decizie.
async function getUnassignedDevices() {
  const r = await pool.query("SELECT imei, name, plate, last_seen FROM devices WHERE company_id IS NULL AND status IS DISTINCT FROM 'archived' ORDER BY last_seen DESC NULLS LAST");
  return r.rows;
}

// Întoarce { created:true } DOAR la prima apariție a IMEI-ului. Verificarea existenței ÎNAINTE de upsert
// e portabilă (PGlite + Postgres), spre deosebire de trucul cu xmax. Rulează o singură dată per CONEXIUNE
// (la handshake-ul IMEI), nu per pachet → costul SELECT-ului e neglijabil. Eventualul dublu „created" la
// două prime-conectări concurente e absorbit de dedup-ul notificării (notificationKeyExists).
async function upsertDevice(imei) {
  const ex = await pool.query('SELECT 1 FROM devices WHERE imei = $1', [imei]);
  const created = ex.rows.length === 0;
  await pool.query(`
    INSERT INTO devices (imei, last_seen)
    VALUES ($1, NOW())
    ON CONFLICT (imei)
    DO UPDATE SET last_seen = NOW()
  `, [imei]);
  return { created };
}

async function updateDeviceInfo(imei, name, vehicleType, plate) {
  await pool.query(`
    UPDATE devices
    SET name = $2, vehicle_type = $3, plate = $4
    WHERE imei = $1
  `, [imei, name, vehicleType, plate]);
}
// Inventar echipament GPS: modelul trackerului + numărul cartelei SIM. Trimite null ca să ștergi valoarea;
// undefined lasă câmpul neatins (ca să nu golim din greșeală la un update parțial).
async function setDeviceGpsInfo(imei, gpsModel, simNumber) {
  const sets = [], vals = [imei];
  if (gpsModel !== undefined) { vals.push(gpsModel === null ? null : String(gpsModel).trim().slice(0, 60) || null); sets.push('gps_model = $' + vals.length); }
  if (simNumber !== undefined) { vals.push(simNumber === null ? null : String(simNumber).trim().slice(0, 30) || null); sets.push('sim_number = $' + vals.length); }
  if (!sets.length) return;
  await pool.query('UPDATE devices SET ' + sets.join(', ') + ' WHERE imei = $1', vals);
}
// Inventarul de echipamente: un rând per dispozitiv, cu clientul, mașina, IMEI, model GPS, SIM și ultima
// transmisie. companyId = null → toate companiile (super-admin); altfel doar flota companiei.
async function getDeviceInventory(companyId) {
  const params = [];
  let where = "d.status IS DISTINCT FROM 'archived'";
  if (companyId != null) { params.push(companyId); where += ' AND d.company_id = $1'; }
  // „Ultima transmisie" = cea mai recentă poziție (LATERAL, ca în getDevices), cu `last_seen` ca rezervă
  // pentru dispozitivele care s-au conectat dar n-au trimis încă nicio poziție.
  const r = await pool.query(
    `SELECT d.imei, d.name, d.plate, d.gps_model, d.sim_number,
            d.company_id, c.name AS company_name,
            GREATEST(COALESCE(p.timestamp, to_timestamp(0)), COALESCE(d.last_seen, to_timestamp(0))) AS last_tx
       FROM devices d
       LEFT JOIN companies c ON c.id = d.company_id
       LEFT JOIN LATERAL (
         SELECT timestamp FROM positions WHERE positions.imei = d.imei ORDER BY timestamp DESC LIMIT 1
       ) p ON true
      WHERE ${where}
      ORDER BY c.name NULLS LAST, d.plate NULLS LAST, d.imei`, params);
  return r.rows.map(function (x) {
    const t = x.last_tx && new Date(x.last_tx).getTime() > 0 ? x.last_tx : null;
    return { imei: x.imei, name: x.name || null, plate: x.plate || null, gps_model: x.gps_model || null,
      sim_number: x.sim_number || null, company_id: x.company_id, company_name: x.company_name || null, last_tx: t };
  });
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
// Ștergere DEFINITIVĂ a unui vehicul + toate datele lui (ireversibil). Best-effort pe fiecare tabel
// (un tabel inexistent/fără coloană imei nu blochează restul); rândul `devices` cară JSONB-urile
// (io_mappings/fuel_sensors/last_can). Numele tabelelor sunt fixe în cod → fără injection.
async function deleteDeviceCompletely(imei) {
  // Pozițiile se șterg pe loturi: un vehicul cu ani de istoric înseamnă milioane de rânduri, iar aici
  // ștergerea e declanșată dintr-un click în interfață — adică exact în timpul unei zile de lucru.
  for (const t of ['positions', 'positions_archive']) {
    try {
      for (;;) {
        const r = await pool.query(`DELETE FROM ${t} WHERE ctid IN (SELECT ctid FROM ${t} WHERE imei = $1 LIMIT ${BATCH_ROWS})`, [imei]);
        const n = r.affectedRows || (r.rowCount || 0);
        if (n < BATCH_ROWS) break;
        if (BATCH_PAUSE_MS) await new Promise(res => setTimeout(res, BATCH_PAUSE_MS));
      }
    } catch (e) { /* tabel inexistent */ }
  }
  const tables = ['notifications', 'agent_findings', 'vehicle_documents',
    'alerts', 'alert_history', 'trips', 'maintenance', 'user_device_access', 'tacho_files', 'etransport', 'report_schedules'];
  for (const t of tables) {
    try { await pool.query(`DELETE FROM ${t} WHERE imei = $1`, [imei]); } catch (e) { /* tabel/coloană inexistentă */ }
  }
  const r = await pool.query('DELETE FROM devices WHERE imei = $1', [imei]);
  return r.rowCount || 0;
}

// Coloane editabile din fișa vehiculului (whitelist — previne injection / scriere pe coloane interzise)
const VEHICLE_DETAIL_COLS = [
  'name', 'plate', 'vehicle_type', 'vin', 'brand', 'model', 'year', 'fuel_type',
  'tank_capacity', 'lpg_volume', 'icon', 'color', 'speed_limit',
  'consumption_city', 'consumption_idle', 'consumption_road', 'passenger_seats',
  'emission_class', 'tire_size', 'engine_serial', 'displacement', 'power_kw',
  'payload', 'road_tax_category', 'cost_center', 'inventory_number', 'notes',
  'tare_weight', 'max_weight_legal', 'max_weight_construct', 'ignition_source', 'show_transport',
  'odo_base_km', 'temp_min', 'temp_max'
];
const NUMERIC_COLS = new Set([
  'year', 'tank_capacity', 'lpg_volume', 'speed_limit', 'consumption_city', 'consumption_idle',
  'consumption_road', 'passenger_seats', 'displacement', 'power_kw', 'payload',
  'tare_weight', 'max_weight_legal', 'max_weight_construct', 'odo_base_km', 'temp_min', 'temp_max'
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
  // Avarie simulată — comutatorul se poate aprinde DOAR prin ruta de test, care nu se înregistrează
  // decât cu NODE_ENV=test. Serverul trebuie să reacționeze exact ca la o pană reală: nu confirmă
  // batch-ul, iar trackerul îl retrimite.
  if (module.exports._simulateWriteFailure) throw new Error('avarie simulată de bază de date (test)');

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
    SELECT d.*, c.name AS company_name, g.name AS group_name,
      p.latitude, p.longitude, p.speed, p.angle, p.satellites, p.timestamp as last_position_time,
      p.io_data
    FROM devices d
    LEFT JOIN companies c ON c.id = d.company_id
    LEFT JOIN device_groups g ON g.id = d.group_id
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, speed, angle, satellites, timestamp, io_data
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
      c.name AS company_name,
      (SELECT COUNT(*) FROM user_device_access WHERE user_id = u.id) AS device_count,
      (SELECT COUNT(*) FROM user_group_access WHERE user_id = u.id) AS group_count
    FROM users u LEFT JOIN companies c ON c.id = u.company_id ${where} ORDER BY u.created_at
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
    'SELECT id, username, role, full_name, email, phone, active, last_login, company_id, created_at, access_until, demo_request_id FROM users WHERE id = $1',
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
    SELECT u.id, u.username, u.role, u.active, u.company_id, u.access_until, k.id AS key_id
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

// ─── Ștergere pe LOTURI ───
// Un singur `DELETE FROM positions WHERE timestamp < …` pe o tabelă de zeci de milioane de rânduri e o
// tranzacție uriașă: WAL pentru fiecare tuplu, cinci indexuri de actualizat și blocare lungă. Dacă în timpul
// ei pool-ul (max 12 conexiuni) se epuizează, ingestul nu doar întârzie — PIERDE date: `insertPositions`
// reîncearcă de câteva ori în ~1,2 s, apoi renunță, iar ACK-ul a plecat deja spre tracker.
// Loturile mici, cu pauză între ele și cu buget total de timp, transformă asta într-o sarcină de fundal.
//
// Batching-ul se face pe `ctid`, NU pe `id`: cheia primară `id` există doar când TimescaleDB N-a reușit să
// creeze hypertable-ul (`ALTER TABLE positions DROP CONSTRAINT positions_pkey` rulează doar pe calea Timescale).
// `timestamp` e indexat în ambele cazuri — indexul e creat explicit „pentru curățare date vechi".
const BATCH_ROWS = Math.max(500, Math.min(50000, parseInt(process.env.RETENTION_BATCH_ROWS) || 5000));
const BATCH_PAUSE_MS = Math.max(0, parseInt(process.env.RETENTION_BATCH_PAUSE_MS) || 200);
const BATCH_BUDGET_MS = Math.max(5000, parseInt(process.env.RETENTION_BUDGET_MS) || 10 * 60 * 1000);

async function _deleteOldBatched(table, days, opts) {
  const budgetMs = (opts && opts.budgetMs) || BATCH_BUDGET_MS;
  const batch = (opts && opts.batch) || BATCH_ROWS;
  const deadline = Date.now() + budgetMs;
  let total = 0, loturi = 0, epuizat = false;
  for (;;) {
    if (Date.now() >= deadline) { epuizat = true; break; }   // reluăm la rularea următoare, de unde am rămas
    const r = await pool.query(
      `DELETE FROM ${table} WHERE ctid IN (
         SELECT ctid FROM ${table} WHERE timestamp < NOW() - ($1 || ' days')::interval
         ORDER BY timestamp LIMIT ${batch})`,
      [String(days)]
    );
    const n = r.affectedRows || (r.rowCount || 0);
    total += n; loturi++;
    if (n < batch) break;                                     // s-a terminat ce era de șters
    if (BATCH_PAUSE_MS) await new Promise(res => setTimeout(res, BATCH_PAUSE_MS)); // lasă ingestul să respire
  }
  return { total, loturi, epuizat };
}

// Întoarce numărul de rânduri șterse (apelanții îl loghează). Detaliile lotizării, prin `deleteOldPositionsDetail`.
async function deleteOldPositions(days, opts) { return (await _deleteOldBatched('positions', days, opts)).total; }
async function deleteOldPositionsDetail(days, opts) { return await _deleteOldBatched('positions', days, opts); }

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
// Tot pe loturi. Aici indexul dedicat pe `timestamp` e obligatoriu: singurul index existent era
// (imei, timestamp), iar un index compus care începe cu `imei` NU ajută la `WHERE timestamp < …` —
// fără el, fiecare lot ar fi făcut seq scan și lotizarea ar fi ieșit mai rea decât ștergerea monolitică.
async function purgeArchivedPositions(days, opts) { return (await _deleteOldBatched('positions_archive', days, opts)).total; }

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
// Aceeași regulă ca la token-urile native: cu `userId` se șterge doar propria abonare;
// fără el e curățare de sistem (endpoint respins cu 404/410 de serviciul de push).
async function deletePushSubscription(endpoint, userId) {
  if (userId != null) await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, userId]);
  else await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// ─── Token-uri native (FCM/APNs) pentru aplicația mobilă ───
// Reatribuirea tokenului către alt utilizator e un flux LEGITIM: același telefon, alt cont care se
// autentifică (logout-ul din aplicație nu dezînregistrează tokenul). De aceea nu o blocăm — dar întoarcem
// proprietarul anterior, ca preluarea unui token care aparținea altcuiva să lase urmă în jurnalul de audit.
async function saveDeviceToken(userId, token, platform) {
  const prev = await pool.query('SELECT user_id FROM device_tokens WHERE token = $1', [token]);
  const prevUserId = prev.rows[0] ? prev.rows[0].user_id : null;
  await pool.query(
    `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen = NOW()`,
    [userId, token, platform || 'android']
  );
  return { prevUserId: prevUserId, takenOver: prevUserId != null && prevUserId !== userId };
}
async function getDeviceTokens(userId) {
  const r = await pool.query('SELECT token, platform FROM device_tokens WHERE user_id = $1', [userId]);
  return r.rows;
}
// `userId` dat → se șterge DOAR propria înregistrare (cerere venită de la un utilizator).
// `userId` omis → curățare de sistem (FCM a răspuns că tokenul e invalid/expirat), fără proprietar.
// Fără această distincție, orice utilizator autentificat care cunoaște tokenul altcuiva îi putea
// opri notificările — inclusiv alertele de furt — cu un singur apel.
async function deleteDeviceToken(token, userId) {
  if (userId != null) await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, userId]);
  else await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]);
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
  const result = await pool.query(
    `SELECT g.*, (SELECT COUNT(*)::int FROM devices d WHERE d.group_id = g.id) AS vehicle_count
       FROM device_groups g ${where} ORDER BY name`,
    params
  );
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

// Zonele vizibile unei REGULI de alertă: cele ale companiei + cele FĂRĂ companie.
// De ce și cele fără companie: o zonă desenată de super-admin se salvează cu company_id NULL (el n-are
// companie), exact ca alertele înainte de reparație. Cu un filtru strict pe companie, o alertă legată de
// o companie n-ar găsi NICIODATĂ acea zonă, iar regula ar tăcea la nesfârșit, fără nicio eroare.
async function getGeofencesForScope(companyId) {
  if (companyId == null) return getGeofences(null);
  const r = await pool.query('SELECT * FROM geofences WHERE company_id = $1 OR company_id IS NULL', [companyId]);
  return r.rows;
}

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
// Scopat pe fereastră de timp + vehicule (pentru rapoarte) — LIMIT-ul se aplică pe interval, nu pe ultimele N globale.
async function getAlertHistoryRange(imeis, from, to, limit = 5000) {
  if (!Array.isArray(imeis) || !imeis.length) return [];
  const result = await pool.query(
    'SELECT ah.*, a.name as alert_name, a.type as alert_type FROM alert_history ah LEFT JOIN alerts a ON a.id = ah.alert_id WHERE ah.imei = ANY($1) AND ah.triggered_at >= $2 AND ah.triggered_at <= $3 ORDER BY ah.triggered_at DESC LIMIT $4',
    [imeis, from, to, limit]
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
    'INSERT INTO maintenance (imei, type, description, due_date, due_km, cost, status, company_id, done_date, done_km, done_at, interval_km, interval_months) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
    [data.imei, data.type, data.description, data.due_date, data.due_km, data.cost, data.status || 'pending', companyId || null, data.done_date || null, data.done_km || null, data.done_at || null, data.interval_km || null, data.interval_months || null]
  );
  return result.rows[0];
}

async function updateMaintenance(id, data) {
  await pool.query(
    'UPDATE maintenance SET type=$2, description=$3, due_date=$4, due_km=$5, done_date=$6, done_km=$7, cost=$8, status=$9, done_at=$10, interval_km=$11, interval_months=$12 WHERE id=$1',
    [id, data.type, data.description, data.due_date, data.due_km, data.done_date, data.done_km, data.cost, data.status, data.done_at || null, data.interval_km || null, data.interval_months || null]
  );
}

async function deleteMaintenance(id) {
  await pool.query('DELETE FROM maintenance WHERE id = $1', [id]);
}

// ─── Card combustibil (alimentări + reconciliere cu nivelul CAN) ───
async function listFuelTransactions(companyId, opts = {}) {
  let q = 'SELECT ft.*, d.plate, d.name AS vehicle_name FROM fuel_transactions ft LEFT JOIN devices d ON d.imei = ft.imei WHERE ft.company_id IS NOT DISTINCT FROM $1';
  const p = [companyId || null];
  if (opts.imei) { p.push(opts.imei); q += ' AND ft.imei = $' + p.length; }
  if (opts.from) { p.push(parseInt(opts.from)); q += ' AND ft.ts >= $' + p.length; }
  if (opts.to) { p.push(parseInt(opts.to)); q += ' AND ft.ts <= $' + p.length; }
  p.push(Math.min(parseInt(opts.limit) || 2000, 5000));
  q += ' ORDER BY ft.ts DESC NULLS LAST LIMIT $' + p.length;
  const r = await pool.query(q, p);
  return r.rows;
}
async function createFuelTransaction(d, companyId) {
  const r = await pool.query(
    `INSERT INTO fuel_transactions (company_id, imei, driver_id, ts, station, country, liters, amount, currency, card_number, source, status, tank_delta, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [companyId || null, d.imei || null, d.driver_id || null, d.ts || null, d.station || null, d.country || null,
      d.liters != null ? d.liters : null, d.amount != null ? d.amount : null, d.currency || 'RON', d.card_number || null,
      d.source || 'manual', d.status || 'nou', d.tank_delta != null ? d.tank_delta : null, d.note || null, Date.now()]
  );
  return r.rows[0];
}
async function deleteFuelTransaction(id, companyId) {
  await pool.query('DELETE FROM fuel_transactions WHERE id = $1 AND company_id IS NOT DISTINCT FROM $2', [id, companyId || null]);
}
async function setFuelTxReconcile(id, status, tankDelta, companyId) {
  await pool.query('UPDATE fuel_transactions SET status = $2, tank_delta = $3 WHERE id = $1 AND company_id IS NOT DISTINCT FROM $4', [id, status, tankDelta, companyId || null]);
}
async function getDeviceImeiByPlate(plate, companyId) {
  if (!plate) return null;
  const r = await pool.query("SELECT imei FROM devices WHERE company_id IS NOT DISTINCT FROM $2 AND UPPER(REPLACE(plate,' ','')) = UPPER(REPLACE($1,' ','')) LIMIT 1", [String(plate), companyId || null]);
  return r.rows[0] ? r.rows[0].imei : null;
}

// ─── Istoric preț carburant (media națională zilnică) ───
// Snapshot upsert pe ZI (cheia = data prețului de la sursă, altfel azi). Rulat la fiecare refresh (2×/zi) → o linie/zi.
async function saveFuelPriceSnapshot(p) {
  if (!p) return;
  const day = (p.data && /^\d{4}-\d{2}-\d{2}/.test(String(p.data))) ? String(p.data).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  await pool.query(
    `INSERT INTO fuel_price_history (day, motorina, benzina, gpl, motorina_premium, benzina_premium, source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (day) DO UPDATE SET motorina=EXCLUDED.motorina, benzina=EXCLUDED.benzina, gpl=EXCLUDED.gpl,
       motorina_premium=EXCLUDED.motorina_premium, benzina_premium=EXCLUDED.benzina_premium, source=EXCLUDED.source, updated_at=EXCLUDED.updated_at`,
    [day, num(p.motorina), num(p.benzina), num(p.gpl), num(p.motorina_premium), num(p.benzina_premium), p.source || null, Date.now()]
  );
}
async function getFuelPriceHistory(days) {
  const lim = Math.min(Math.max(parseInt(days) || 90, 1), 365);
  const r = await pool.query(
    'SELECT day, motorina, benzina, gpl, motorina_premium, benzina_premium FROM fuel_price_history ORDER BY day DESC LIMIT $1', [lim]);
  const n = (v) => (v == null ? null : Number(v)); // DECIMAL vine ca string din pg
  return r.rows.reverse().map(row => ({ day: row.day, motorina: n(row.motorina), benzina: n(row.benzina), gpl: n(row.gpl), motorina_premium: n(row.motorina_premium), benzina_premium: n(row.benzina_premium) }));
}

// io_data de la ultima poziție a unui vehicul (pentru odometru CAN la finalizare/alerte km)
async function getLastIo(imei) {
  try {
    const r = await pool.query('SELECT io_data FROM positions WHERE imei = $1 ORDER BY timestamp DESC LIMIT 1', [imei]);
    return (r.rows[0] && r.rows[0].io_data) || null;
  } catch (e) { return null; }
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
    'INSERT INTO vehicle_documents (imei, doc_type, number, issuer, issue_date, expiry_date, notes, company_id, cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [data.imei, data.doc_type, data.number || null, data.issuer || null, data.issue_date || null, data.expiry_date || null, data.notes || null, companyId != null ? companyId : null, (data.cost != null && data.cost !== '') ? data.cost : null]
  );
  return result.rows[0];
}
async function deleteVehicleDocument(id) {
  await pool.query('DELETE FROM vehicle_documents WHERE id = $1', [id]);
}
// Reînnoire = înlocuire: scoate actele vechi de același tip ale vehiculului (cel nou rămâne singurul curent).
async function deleteVehicleDocumentsByType(imei, docType, companyId) {
  await pool.query(
    'DELETE FROM vehicle_documents WHERE imei = $1 AND doc_type = $2 AND company_id IS NOT DISTINCT FROM $3',
    [imei, docType, companyId != null ? companyId : null]
  );
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
// JSON.stringify rezistent la referințe circulare / valori non-serializabile — altfel un raport „problematic"
// făcea INSERT-ul să pice și nu ajungea în Istoric (mai ales rapoartele programate).
function _safeJson(o) {
  let s;
  try { s = JSON.stringify(o); } catch (e) {
    const seen = new WeakSet();
    try {
      s = JSON.stringify(o, function (k, v) {
        if (typeof v === 'bigint') return String(v);
        if (typeof v === 'object' && v !== null) { if (seen.has(v)) return undefined; seen.add(v); }
        return v;
      });
    } catch (e2) { return '{}'; }
  }
  // Postgres JSONB respinge  (null bytes) în stringuri → altfel INSERT-ul pică. Le eliminăm.
  return s ? s.replace(/\\u0000/g, '') : '{}';
}
async function saveReportHistory(h) {
  // Fără dedup: fiecare generare din UI = un rând nou în istoric (se păstrează toate, până la expirarea de 7 zile).
  const r = await pool.query(
    `INSERT INTO report_history (company_id, user_id, username, report_type, label, imei, vehicle_count, period_from, period_to, opts, data, signature, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, generated_at, expires_at`,
    [h.company_id != null ? h.company_id : null, h.user_id != null ? h.user_id : null, h.username || null,
     h.report_type, h.label || null, h.imei || null, h.vehicle_count || 0,
     h.period_from || null, h.period_to || null, _safeJson(h.opts || {}), _safeJson(h.data || {}),
     h.signature || null, h.status || 'done', h.expires_at || null]
  );
  return r.rows[0];
}
async function getReportHistory(userId, limit) {
  try { await pool.query('DELETE FROM report_history WHERE expires_at IS NOT NULL AND expires_at < NOW()'); } catch (e) {}
  const r = await pool.query(
    `SELECT id, company_id, user_id, username, report_type, label, imei, vehicle_count, period_from, period_to, status, signature, generated_at, expires_at
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


// ─── Cereri de cont demo (lead-uri din formularul public de pe landing) ─────────────────────────────
// Datele personale stau DOAR în tabela asta; notificarea către super-admin nu conține niciun câmp PII.
async function createDemoRequest(r) {
  const now = Date.now();
  const q = await pool.query(
    `INSERT INTO demo_requests (name, company, email, phone, message, wants_demo, consent, status, ip, user_agent, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$10) RETURNING *`,
    [r.name || null, r.company || null, String(r.email).toLowerCase(), r.phone || null, r.message || null, !!r.wants_demo, !!r.consent, r.ip || null, r.userAgent || null, now]
  );
  return q.rows[0];
}
async function listDemoRequests(opts) {
  opts = opts || {};
  const where = opts.status ? 'WHERE status = $1' : '';
  const params = opts.status ? [opts.status] : [];
  const lim = Math.min(parseInt(opts.limit) || 200, 500);
  const q = await pool.query(`SELECT * FROM demo_requests ${where} ORDER BY created_at DESC LIMIT ${lim}`, params);
  return q.rows;
}
async function getDemoRequestById(id) {
  const q = await pool.query('SELECT * FROM demo_requests WHERE id = $1', [parseInt(id)]);
  return q.rows[0] || null;
}
// Actualizare parțială — doar cheile din allow-list (nu se poate rescrie emailul/mesajul original).
async function updateDemoRequest(id, patch) {
  const allowed = ['status', 'user_id', 'approved_by', 'access_until', 'notes'];
  const sets = [], params = [parseInt(id)];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    params.push(patch[k]); sets.push(k + ' = $' + params.length);
  }
  if (!sets.length) return await getDemoRequestById(id);
  params.push(Date.now()); sets.push('updated_at = $' + params.length);
  const q = await pool.query('UPDATE demo_requests SET ' + sets.join(', ') + ' WHERE id = $1 RETURNING *', params);
  return q.rows[0] || null;
}
async function deleteDemoRequest(id) {
  await pool.query('DELETE FROM demo_requests WHERE id = $1', [parseInt(id)]);
}
// Anti-spam: câte cereri a trimis adresa asta după un anumit moment.
async function countDemoRequestsByEmail(email, sinceMs) {
  const q = await pool.query('SELECT COUNT(*)::int AS n FROM demo_requests WHERE email = $1 AND created_at > $2', [String(email || '').toLowerCase(), Math.round(sinceMs)]);
  return q.rows[0] ? q.rows[0].n : 0;
}
// Expirare PER UTILIZATOR (conturi demo temporare). null = fără limită. Epoch ms, ca la companies.access_until.
async function setUserAccessUntil(id, untilMs) {
  await pool.query('UPDATE users SET access_until = $2 WHERE id = $1', [id, untilMs == null ? null : Math.round(untilMs)]);
}
// Câte conturi demo sunt ACUM valabile — asta decide dacă simulatorul de poziții mai are pentru cine să meargă.
// `access_until IS NOT NULL` e esențial: contul partajat „demo" n-are termen și ar ține simulatorul pornit la
// nesfârșit; el e doar deținătorul istoric al ACL-ului, nu un client care se uită la hartă.
async function countActiveDemoUsers(companyId, nowMs) {
  if (companyId == null) return 0;
  const q = await pool.query(
    'SELECT COUNT(*) AS n FROM users WHERE company_id = $1 AND active IS NOT FALSE AND access_until IS NOT NULL AND access_until > $2',
    [companyId, Math.round(nowMs == null ? Date.now() : nowMs)]
  );
  return Number((q.rows[0] && q.rows[0].n) || 0);
}

// TOȚI utilizatorii unei companii, inclusiv cei inactivi (pentru curățarea completă a companiei demo).
async function listUsersByCompany(companyId) {
  const q = await pool.query('SELECT id, username, role, active, access_until FROM users WHERE company_id = $1', [companyId]);
  return q.rows;
}

module.exports = {
  saveWeeklyReport, weeklyReportExists, getLatestWeeklyReport, getWeeklyReports, getWeeklyReportById, markWeeklyReportEmailed, getCompanyAdminEmails,
  pool,
  getTimescaleStatus,
  initDb,
  ensureTenancy,
  createReportSchedule, getReportSchedules, getReportScheduleById, updateReportSchedule, deleteReportSchedule, getDueReportSchedules, setScheduleRun,
  saveReportHistory, getReportHistory, getReportHistoryById, deleteReportHistory,
  getCompanies, getCompanyById, getCompanyBySlug, createCompany, updateCompany, deleteCompany,
  recordAiUsage, getAiUsageByCompany, getAiUsageByKind, getAiTokensForCompany, getAiCallsForCompany, setCompanyAiLimit,
  getAiMonthUsage, getAiMonthUsageByCompany, AI_BILLABLE_KINDS,
  setCompanyBilling, getCompanyByStripeCustomer, setCompanyPlan,
  setCompanyAccessUntil, recordPayment, getPayments, getAllPayments,
  nextInvoiceNumber, createInvoice, getInvoice, getInvoices, updateInvoice, payInvoiceAtomic,
  pruneAgentFindings,
  listPlatformCosts, getPlatformCostById, createPlatformCost, updatePlatformCost, deletePlatformCost, getCostPayments, markCostPaid, getFinanceSummary, getDbCapacity,
  listOffers, getOfferById, createOffer, updateOffer, deleteOffer,
  createDemoRequest, listDemoRequests, getDemoRequestById, updateDemoRequest, deleteDemoRequest, countDemoRequestsByEmail,
  setUserAccessUntil, listUsersByCompany, countActiveDemoUsers,
  getCompanyImeis, getCompanyActiveImeis, setDeviceCompany, adoptDevice, setUserCompany, setDriverCompany, getDriverById, getUnassignedDevices, getRowCompany,
  setDeviceCanInterface, getDeviceCanInterface, setDeviceLastCan, getLastStickyCan,
  createTachoFile, getTachoFiles, getTachoFile, deleteTachoFile,
  getEtransports, createEtransport, updateEtransport, deleteEtransport, getActiveEtransports,
  getWebhooks, getEnabledWebhooks, getWebhookById, createWebhook, deleteWebhook, updateWebhookStatus,
  getSetting, setSetting,
  logError, getErrors, clearErrors, pruneErrors,
  createAgentFinding, getAgentFindings, updateAgentFinding, countNewFindings,
  upsertDevice,
  updateDeviceInfo, setDeviceGpsInfo, getDeviceInventory, setDeviceIgnitionSource, getDin1Imeis, getArchivedImeis, deleteDeviceCompletely,
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
  deleteOldPositions, deleteOldPositionsDetail,
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
  getGeofences, getGeofencesForScope, createGeofence, updateGeofence, deleteGeofence,
  getAlerts, createAlert, deleteAlert, getAlertHistory, getAlertHistoryRange, insertAlertEvent,
  getTrips, getTripsSummaryForImeis, createTrip, endTrip,
  getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance, getLastIo,
  listFuelTransactions, createFuelTransaction, deleteFuelTransaction, setFuelTxReconcile, getDeviceImeiByPlate,
  saveFuelPriceSnapshot, getFuelPriceHistory,
  getVehicleDocuments, createVehicleDocument, deleteVehicleDocument, deleteVehicleDocumentsByType
};
