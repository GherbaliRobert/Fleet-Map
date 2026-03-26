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

async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count);
}

module.exports = {
  pool,
  initDb,
  upsertDevice,
  updateDeviceInfo,
  insertPositions,
  getDevices,
  getDeviceHistory,
  getLastPositions,
  getUserByUsername,
  createUser,
  getUsers,
  deleteUser,
  getUserCount
};
