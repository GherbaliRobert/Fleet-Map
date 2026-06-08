// server.js — Serverul principal: TCP (dispozitive) + HTTP (interfață web) + WebSocket (live)
// Forțează UTC pentru tot procesul: coloanele `timestamp` (fără fus) fac round-trip consistent,
// iar interogările pe interval (ISO/UTC) se potrivesc. Afișarea se face explicit pe ora locală.
process.env.TZ = 'UTC';
const net = require('net');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { parseAvlPacket, convertCanValue, expandCanFlags } = require('./codec8e');

// Cache pentru calibrare sonda combustibil per vehicul (voltage -> liters)
const tankCalibrationCache = new Map(); // imei -> calibration array
const tankCalibrationTimestamp = new Map(); // imei -> timestamp ultimei incarcari
const TANK_CAL_TTL = 60000; // 1 minut

async function getTankCalibration(imei) {
  const now = Date.now();
  const lastLoad = tankCalibrationTimestamp.get(imei) || 0;
  if (now - lastLoad < TANK_CAL_TTL && tankCalibrationCache.has(imei)) {
    return tankCalibrationCache.get(imei);
  }
  try {
    const result = await db.pool.query('SELECT tank_calibration FROM devices WHERE imei = $1', [imei]);
    if (result.rows.length > 0 && result.rows[0].tank_calibration) {
      const cal = typeof result.rows[0].tank_calibration === 'string'
        ? JSON.parse(result.rows[0].tank_calibration)
        : result.rows[0].tank_calibration;
      tankCalibrationCache.set(imei, cal);
      tankCalibrationTimestamp.set(imei, now);
      return cal;
    }
  } catch (e) { /* skip */ }
  tankCalibrationCache.set(imei, null);
  tankCalibrationTimestamp.set(imei, now);
  return null;
}

// Interpoleaza liniar voltaj -> litri folosind calibrare
function voltageToLiters(voltageMv, calibration) {
  if (!calibration || !Array.isArray(calibration) || calibration.length < 2) return null;
  const voltageV = voltageMv / 1000;
  // Sort calibration by voltage ascending
  const sorted = [...calibration].sort((a, b) => a.voltage - b.voltage);
  // Below first point
  if (voltageV <= sorted[0].voltage) return 0;
  // Above last point
  if (voltageV >= sorted[sorted.length - 1].voltage) return sorted[sorted.length - 1].liters;
  // Linear interpolation between two points
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    if (voltageV >= p1.voltage && voltageV <= p2.voltage) {
      const ratio = (voltageV - p1.voltage) / (p2.voltage - p1.voltage);
      return Math.round((p1.liters + ratio * (p2.liters - p1.liters)) * 10) / 10;
    }
  }
  return null;
}

// ─── Sonde combustibil configurabile (Escort / EuroSens Dominator LLS / EuroSens Degree BLE) ───
const fuelSensorsCache = new Map(); const fuelSensorsTs = new Map();
async function getFuelSensors(imei) {
  const now = Date.now();
  if (now - (fuelSensorsTs.get(imei) || 0) < TANK_CAL_TTL && fuelSensorsCache.has(imei)) return fuelSensorsCache.get(imei);
  let sensors = null;
  try { sensors = await dbRef().getFuelSensorsRow(imei); } catch (e) {}
  fuelSensorsCache.set(imei, sensors); fuelSensorsTs.set(imei, now);
  return sensors;
}
function invalidateFuelSensors(imei) { fuelSensorsCache.delete(imei); fuelSensorsTs.delete(imei); }
// db e definit mai jos; folosim un getter lazy ca să evităm ordinea de declarare
function dbRef() { return db; }

// Interpolare liniară raw -> litri pe baza unui tabel de calibrare [{raw, liters}, ...]
function interpolateCal(raw, cal) {
  if (!cal || !Array.isArray(cal) || cal.length < 2) return null;
  const pts = cal.map(p => ({ raw: Number(p.raw), liters: Number(p.liters) }))
                 .filter(p => !isNaN(p.raw) && !isNaN(p.liters)).sort((a, b) => a.raw - b.raw);
  if (pts.length < 2) return null;
  if (raw <= pts[0].raw) return pts[0].liters;
  if (raw >= pts[pts.length - 1].raw) return pts[pts.length - 1].liters;
  for (let i = 0; i < pts.length - 1; i++) {
    if (raw >= pts[i].raw && raw <= pts[i + 1].raw) {
      const r = (raw - pts[i].raw) / (pts[i + 1].raw - pts[i].raw);
      return Math.round((pts[i].liters + r * (pts[i + 1].liters - pts[i].liters)) * 10) / 10;
    }
  }
  return null;
}

// Calculează nivelul normalizat (litri) din sondele configurate; setează io.fuel_level_liters (+ per-sondă)
function computeFuelFromSensors(io, sensors) {
  if (!sensors || !sensors.length) return;
  let primary = null;
  sensors.forEach((s, idx) => {
    if (!s || !s.source) return;
    const raw = io[s.source];
    if (raw === undefined || raw === null) return;
    let liters = null;
    if (s.mode === 'calibration' && Array.isArray(s.calibration) && s.calibration.length >= 2) {
      liters = interpolateCal(Number(raw), s.calibration);
    } else {
      liters = Number(raw) * (s.scale ? Number(s.scale) : 1); // direct: valoarea e deja în litri
    }
    if (liters !== null && !isNaN(liters)) {
      liters = Math.round(liters * 10) / 10;
      io['fuel_sensor_' + (idx + 1) + '_liters'] = liters;
      if (primary === null) primary = liters;
    }
  });
  if (primary !== null) io.fuel_level_liters = primary;
}

const db = require('./db');
const reports = require('./reports');
const channels = require('./channels');
const webpush = require('web-push');
const https = require('https');
const httpMod = require('http');

// ─── Configurare ───
const HTTP_PORT = parseInt(process.env.PORT || '3000');
const TCP_PORT = parseInt(process.env.TCP_PORT || '5027');
// OpenRemote forward config (optional)
const OR_ENABLED = (process.env.OPENREMOTE_ENABLED || '').toLowerCase() === 'true' || process.env.OPENREMOTE_ENABLED === '1';
const OR_URL = process.env.OPENREMOTE_INGEST_URL || '';
const OR_TOKEN = process.env.OPENREMOTE_TOKEN || process.env.OPENREMOTE_API_KEY || '';
const OR_AUTH_HEADER = process.env.OPENREMOTE_AUTH_HEADER || 'Authorization';
const OR_TIMEOUT_MS = parseInt(process.env.OPENREMOTE_TIMEOUT_MS || '3000');
// Teltonika raw TCP mirror to Traccar/OpenRemote (optional)
const MIRROR_ENABLED = (process.env.MIRROR_TELTONIKA_ENABLED || '').toLowerCase() === 'true' || process.env.MIRROR_TELTONIKA_ENABLED === '1';
const MIRROR_HOST = process.env.MIRROR_TELTONIKA_HOST || '';
const MIRROR_PORT = parseInt(process.env.MIRROR_TELTONIKA_PORT || '0');
const MIRROR_CONNECT_TIMEOUT_MS = parseInt(process.env.MIRROR_TELTONIKA_CONNECT_TIMEOUT_MS || '3000');
const MIRROR_RECONNECT_MS = parseInt(process.env.MIRROR_TELTONIKA_RECONNECT_MS || '5000');
const MIRROR_QUEUE_MAX = parseInt(process.env.MIRROR_TELTONIKA_QUEUE_MAX || '200');

// Dacă TCP și HTTP ar folosi același port, mută HTTP pe altul (TCP are prioritate - proxy-ul GPS pointeaza acolo)
if (TCP_PORT === HTTP_PORT) {
  console.warn(`[WARN] TCP_PORT (${TCP_PORT}) == HTTP_PORT, mut HTTP pe ${HTTP_PORT + 1}`);
}
const ACTUAL_TCP_PORT = TCP_PORT;
const ACTUAL_HTTP_PORT = TCP_PORT === HTTP_PORT ? HTTP_PORT + 1 : HTTP_PORT;

// ─── Stare live (ultima poziție per IMEI, ținută în memorie) ───
const livePositions = new Map();
const activeConnections = new Map(); // IMEI -> socket info

// ─── Debug log (circular buffer) ───
const debugLog = [];
const DEBUG_MAX = 200;

function addDebugEntry(entry) {
  const item = { ...entry, time: new Date().toISOString() };
  debugLog.push(item);
  if (debugLog.length > DEBUG_MAX) debugLog.shift();
  broadcastWs({ type: 'debug', data: item });
}

// ─── OpenRemote Forwarder (HTTP) — optional, non-blocking ───
function forwardToOpenRemote(imei, records) {
  try {
    if (!OR_ENABLED || !OR_URL) return;
    if (!records || records.length === 0) return;

    const url = new URL(OR_URL);
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : httpMod;

    // Normalize Authorization header
    const headers = { 'Content-Type': 'application/json' };
    if (OR_TOKEN) {
      if (OR_AUTH_HEADER.toLowerCase() === 'authorization' && !/^bearer\s/i.test(OR_TOKEN)) {
        headers[OR_AUTH_HEADER] = `Bearer ${OR_TOKEN}`;
      } else {
        headers[OR_AUTH_HEADER] = OR_TOKEN;
      }
    }

    const payload = JSON.stringify({ imei, records });
    headers['Content-Length'] = Buffer.byteLength(payload);

    const req = mod.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      // Drain response to free sockets; log only errors
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          console.warn(`[OpenRemote] HTTP ${res.statusCode} for ${imei}`);
        }
      });
    });

    req.on('error', (err) => {
      console.warn(`[OpenRemote] Post error for ${imei}: ${err.message}`);
    });
    req.setTimeout(OR_TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  } catch (e) {
    console.warn(`[OpenRemote] Forward exception: ${e.message}`);
  }
}

// ─── Teltonika Raw TCP Mirror to Traccar/OpenRemote (optional) ───
const mirrorSessions = new Map(); // imei -> { socket, ready, queue, reconnectTimer }

function ensureMirrorConnection(imei) {
  try {
    if (!MIRROR_ENABLED || !MIRROR_HOST || !MIRROR_PORT) return null;
    let session = mirrorSessions.get(imei);
    if (session && session.socket && !session.socket.destroyed) return session;

    const queue = (session && session.queue) ? session.queue : [];
    const socket = net.createConnection({ host: MIRROR_HOST, port: MIRROR_PORT });
    const newSession = { socket, ready: false, queue, reconnectTimer: null };
    mirrorSessions.set(imei, newSession);

    socket.setKeepAlive(true, 10000);
    socket.setTimeout(MIRROR_CONNECT_TIMEOUT_MS);

    socket.on('connect', () => {
      // Send Teltonika handshake: 2 bytes length + IMEI ASCII
      const imeiBuf = Buffer.from(imei, 'ascii');
      const hs = Buffer.alloc(2 + imeiBuf.length);
      hs.writeUInt16BE(imeiBuf.length, 0);
      imeiBuf.copy(hs, 2);
      socket.write(hs);
      newSession.ready = false; // wait for handshake ACK before flushing
    });

    socket.on('data', () => {
      // First data should be handshake ACK (0x01). Mark ready and flush any queued packets.
      if (!newSession.ready) {
        newSession.ready = true;
        while (newSession.queue.length) {
          const pkt = newSession.queue.shift();
          socket.write(pkt);
        }
      }
      // Subsequent data (4-byte acks) are ignored.
    });

    socket.on('timeout', () => {
      socket.destroy(new Error('mirror-timeout'));
    });

    const scheduleReconnect = () => {
      if (newSession.reconnectTimer) return;
      newSession.ready = false;
      newSession.reconnectTimer = setTimeout(() => {
        newSession.reconnectTimer = null;
        try { if (newSession.socket && !newSession.socket.destroyed) newSession.socket.destroy(); } catch {}
        mirrorSessions.delete(imei);
        ensureMirrorConnection(imei);
      }, MIRROR_RECONNECT_MS);
    };

    socket.on('error', () => scheduleReconnect());
    socket.on('close', () => scheduleReconnect());

    return newSession;
  } catch (e) {
    console.warn(`[MIRROR] ensure error: ${e.message}`);
    return null;
  }
}

function mirrorSendPacket(imei, rawPacket) {
  try {
    if (!MIRROR_ENABLED || !MIRROR_HOST || !MIRROR_PORT) return;
    const session = ensureMirrorConnection(imei);
    if (!session) return;
    if (session.ready && session.socket && !session.socket.destroyed) {
      session.socket.write(rawPacket);
    } else {
      session.queue.push(Buffer.from(rawPacket));
      // Trim queue to max size (drop oldest)
      if (session.queue.length > MIRROR_QUEUE_MAX) session.queue.splice(0, session.queue.length - MIRROR_QUEUE_MAX);
    }
  } catch (e) {
    console.warn(`[MIRROR] send error for ${imei}: ${e.message}`);
  }
}

// ══════════════════════════════════════════════
// 1. SERVER TCP — primește date de la FMB140
// ══════════════════════════════════════════════
const tcpServer = net.createServer((socket) => {
  let imei = null;
  let buffer = Buffer.alloc(0);
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;

  console.log(`[TCP] Conexiune nouă de la ${clientAddr}`);
  addDebugEntry({ event: 'connect', address: clientAddr });

  socket.on('data', async (data) => {
    buffer = Buffer.concat([buffer, data]);

    try {
      // Pasul 1: Dispozitivul trimite IMEI-ul
      if (!imei) {
        // Primii 2 bytes = lungimea IMEI, restul = IMEI ca text ASCII
        if (buffer.length < 2) return;

        const imeiLength = buffer.readUInt16BE(0);
        if (buffer.length < 2 + imeiLength) return;

        imei = buffer.slice(2, 2 + imeiLength).toString('ascii');
        buffer = buffer.slice(2 + imeiLength);

        console.log(`[TCP] Dispozitiv identificat: IMEI ${imei} de la ${clientAddr}`);
        addDebugEntry({ event: 'imei', imei, address: clientAddr });

        // Înregistrează dispozitivul în DB
        await db.upsertDevice(imei);

        // Salvează conexiunea activă
        activeConnections.set(imei, {
          address: clientAddr,
          connectedAt: new Date()
        });

        // Init mirror connection to Traccar/OpenRemote if enabled
        try { ensureMirrorConnection(imei); } catch(_) {}

        // Răspunde cu 0x01 = accept
        socket.write(Buffer.from([0x01]));
        return;
      }

      // Pasul 2: Dispozitivul trimite pachete AVL
      // Verifică dacă avem destule date (minim 12 bytes: preamble + size + codec + count)
      if (buffer.length < 12) return;

      const dataFieldLength = buffer.readUInt32BE(4);
      const totalPacketLength = 8 + dataFieldLength + 4; // preamble(4) + size(4) + data + crc(4)

      if (buffer.length < totalPacketLength) return;

      const packet = buffer.slice(0, totalPacketLength);
      buffer = buffer.slice(totalPacketLength);

      // Duplicate raw Teltonika packet to mirror server (if configured)
      try { mirrorSendPacket(imei, packet); } catch (_) {}

      const parsed = parseAvlPacket(packet);

      if (parsed.error) {
        console.error(`[TCP] Eroare parsare de la ${imei}: ${parsed.error}`);
        addDebugEntry({ event: 'error', imei, error: parsed.error });
        socket.write(Buffer.alloc(4, 0)); // răspunde cu 0
        return;
      }

      console.log(`[TCP] ${imei}: ${parsed.numberOfRecords} recorduri primite`);
      addDebugEntry({
        event: 'data',
        imei,
        codecId: parsed.codecId,
        numberOfRecords: parsed.numberOfRecords,
        records: parsed.records
      });

      // Aplica conversii CAN (liters*10 -> liters, °C*10 -> °C, etc.)
      // si calculeaza nivelul de combustibil din sonda Escort (AIN1)
      const tankCal = await getTankCalibration(imei);
      const fuelSensors = await getFuelSensors(imei);
      for (const record of parsed.records) {
        if (record.io) {
          for (const key of Object.keys(record.io)) {
            if (key.startsWith('can_')) {
              record.io[key] = convertCanValue(key, record.io[key]);
            }
          }
          // Decodifica flag-urile CAN in parametri individuali
          expandCanFlags(record.io);

          // Nivel combustibil normalizat (fuel_level_liters) din sondele configurate
          if (fuelSensors && fuelSensors.length) {
            computeFuelFromSensors(record.io, fuelSensors);
          } else if (tankCal && record.io.analog_input_1 !== undefined) {
            // compat: calibrare Escort analogică (AIN1 voltaj -> litri)
            const liters = voltageToLiters(record.io.analog_input_1, tankCal);
            if (liters !== null) { record.io.tank_level_liters = liters; record.io.fuel_level_liters = liters; }
          }
          // Fallback dacă nu există configurare: folosește direct CAN / LLS / BLE
          if (record.io.fuel_level_liters === undefined) {
            const fb = (typeof record.io.can_fuel_level_liters === 'number') ? record.io.can_fuel_level_liters
              : (typeof record.io.lls_fuel_level_1 === 'number') ? record.io.lls_fuel_level_1
              : (typeof record.io.ble_fuel_level_1 === 'number') ? record.io.ble_fuel_level_1 : undefined;
            if (fb !== undefined) record.io.fuel_level_liters = fb;
          }
        }
      }

      // Salvează în baza de date
      await db.insertPositions(imei, parsed.records);

      // Trimite batch-ul și către OpenRemote (non-blocking)
      try { forwardToOpenRemote(imei, parsed.records); } catch (_) {}

      // Actualizează poziția live
      const lastRecord = parsed.records[parsed.records.length - 1];
      if (lastRecord && lastRecord.gps.latitude !== 0) {
        const existing = livePositions.get(imei) || {};
        const liveData = {
          imei,
          timestamp: lastRecord.timestamp,
          latitude: lastRecord.gps.latitude,
          longitude: lastRecord.gps.longitude,
          speed: lastRecord.gps.speed,
          angle: lastRecord.gps.angle,
          satellites: lastRecord.gps.satellites,
          io: lastRecord.io,
          name: existing.name || null,
          vehicle_type: existing.vehicle_type || null,
          plate: existing.plate || null
        };
        livePositions.set(imei, liveData);

        // Trimite update live prin WebSocket
        broadcastWs({ type: 'position', data: liveData });

        // Evaluare alerte automate
        evaluateAlerts(imei, liveData).catch(err => {
          console.error(`[ALERTS] Eroare evaluare alerte pentru ${imei}: ${err.message}`);
        });

        // Evenimente per-utilizator (abonamente + praguri proprii) — 'existing' = poziția anterioară
        evaluateUserEvents(imei, liveData, existing).catch(() => {});

        // Track tare automat pentru camioane
        trackTareCandidate(imei, lastRecord.io || {}).catch(() => {});
      }

      // Răspunde cu numărul de recorduri acceptate (4 bytes)
      const response = Buffer.alloc(4);
      response.writeUInt32BE(parsed.numberOfRecords);
      socket.write(response);
    } catch (err) {
      console.error(`[TCP] Eroare procesare de la ${imei || clientAddr}: ${err.message}`);
    }
  });

  socket.on('close', () => {
    console.log(`[TCP] Deconectat: ${imei || clientAddr}`);
    addDebugEntry({ event: 'disconnect', imei: imei || null, address: clientAddr });
    if (imei) {
      activeConnections.delete(imei);
      const lastPos = livePositions.get(imei);
      if (lastPos) {
        lastPos.speed = 0;
        livePositions.set(imei, lastPos);
      }
      broadcastWs({ type: 'disconnect', data: { imei } });
    }
  });

  socket.on('error', (err) => {
    console.error(`[TCP] Eroare socket ${imei || clientAddr}: ${err.message}`);
  });

  // Timeout — închide conexiunea dacă nu primim date 10 min
  socket.setTimeout(600000);
  socket.on('timeout', () => {
    console.log(`[TCP] Timeout: ${imei || clientAddr}`);
    socket.end();
  });
});

// ══════════════════════════════════════════════
// 2. SERVER HTTP — interfață web + API
// ══════════════════════════════════════════════
const app = express();
app.set('trust proxy', 1); // necesar pentru cookie secure în spatele proxy-ului (Railway)
app.use(express.json());

// ─── Session store pe PGlite embedded (înlocuiește connect-pg-simple) ───
class PgliteSessionStore extends session.Store {
  constructor() {
    super();
    this.ready = db.pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMPTZ NOT NULL
      )
    `).then(() => db.pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_expire ON user_sessions (expire)'))
      .catch(e => console.error('[SESSION] init:', e.message));
  }
  _expireOf(sess) {
    return (sess && sess.cookie && sess.cookie.expires)
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  async get(sid, cb) {
    try {
      await this.ready;
      const r = await db.pool.query('SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()', [sid]);
      if (!r.rows[0]) return cb(null, null);
      const s = r.rows[0].sess;
      cb(null, typeof s === 'string' ? JSON.parse(s) : s);
    } catch (e) { cb(e); }
  }
  async set(sid, sess, cb) {
    try {
      await this.ready;
      await db.pool.query(
        `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, JSON.stringify(sess), this._expireOf(sess)]
      );
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
  async destroy(sid, cb) {
    try { await this.ready; await db.pool.query('DELETE FROM user_sessions WHERE sid = $1', [sid]); cb && cb(null); }
    catch (e) { cb && cb(e); }
  }
  async touch(sid, sess, cb) {
    try { await this.ready; await db.pool.query('UPDATE user_sessions SET expire = $2 WHERE sid = $1', [sid, this._expireOf(sess)]); cb && cb(null); }
    catch (e) { cb && cb(e); }
  }
}

// Secret de sesiune: din env, altfel generat o singură dată și persistat local
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const p = path.join(__dirname, 'data', '.session_secret');
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(p, s, { mode: 0o600 });
    console.warn('[AUTH] SESSION_SECRET nesetat → generat persistent în data/.session_secret. Pentru producție setează SESSION_SECRET în .env.');
    return s;
  } catch (e) { return crypto.randomBytes(32).toString('hex'); }
}

// ─── Sesiuni ───
const sessionMiddleware = session({
  store: new PgliteSessionStore(),
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 ore
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true', // pune COOKIE_SECURE=true în producție (HTTPS)
    sameSite: 'lax'
  }
});
app.use(sessionMiddleware);
app.use(apiKeyAuth); // permite și autentificarea programatică prin cheie API

// CORS pentru API (activează prin API_CORS_ORIGIN, ex: "*" sau "https://site.ro")
const API_CORS_ORIGIN = process.env.API_CORS_ORIGIN;
if (API_CORS_ORIGIN) {
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', API_CORS_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));

// ─── Model roluri & permisiuni (RBAC) ───
const ROLE_PERMISSIONS = {
  admin:      { manageUsers: true,  manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: true  },
  manager:    { manageUsers: false, manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: false },
  dispatcher: { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: true,  viewAll: false, viewAudit: false },
  client:     { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: false, viewAll: false, viewAudit: false },
  viewer:     { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: false, viewAll: false, viewAudit: false }
};
const VALID_ROLES = Object.keys(ROLE_PERMISSIONS);
function permsFor(role) { return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer; }
function hasPerm(role, perm) { return !!permsFor(role)[perm]; }

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket ? req.socket.remoteAddress : null;
}

// Identitatea curentă: cheie API (req.apiAuth) SAU sesiune cookie (req.session)
function getAuth(req) {
  if (req.apiAuth) return req.apiAuth;
  if (req.session && req.session.userId) {
    return { userId: req.session.userId, username: req.session.username, role: req.session.role, viaApiKey: false };
  }
  return null;
}

function auditReq(req, action, entity, entityId, details) {
  const a = getAuth(req) || {};
  db.logAudit({
    userId: a.userId, username: a.username,
    action, entity, entityId, details, ip: clientIp(req)
  });
}

// Cache acces (IMEI-uri permise) per utilizator — TTL scurt, ca să nu lovim DB la fiecare poll
const accessCache = new Map(); // userId -> { ts, imeis: Set|null }
const ACCESS_TTL = 15000;
async function getAllowedImeiSet(userId, role) {
  if (hasPerm(role, 'viewAll')) return null; // null = acces la toate vehiculele
  const cached = accessCache.get(userId);
  if (cached && (Date.now() - cached.ts) < ACCESS_TTL) return cached.imeis;
  const list = await db.computeAllowedImeis(userId);
  const set = new Set(list);
  accessCache.set(userId, { ts: Date.now(), imeis: set });
  return set;
}
function invalidateAccessCache(userId) {
  if (userId === undefined || userId === null) accessCache.clear();
  else accessCache.delete(userId);
}

// ─── Autentificare prin cheie API (Authorization: Bearer <key> sau X-API-Key: <key>) ───
function hashApiKey(key) { return crypto.createHash('sha256').update(key).digest('hex'); }
async function apiKeyAuth(req, res, next) {
  try {
    let key = null;
    const auth = req.headers['authorization'];
    if (auth && /^Bearer\s+/i.test(auth)) key = auth.replace(/^Bearer\s+/i, '').trim();
    if (!key && req.headers['x-api-key']) key = String(req.headers['x-api-key']).trim();
    if (key) {
      const user = await db.getUserByApiKey(hashApiKey(key));
      if (user && user.active !== false) {
        req.apiAuth = { userId: user.id, username: user.username, role: user.role, viaApiKey: true };
      }
    }
  } catch (e) { /* cheie invalidă → tratat ca neautentificat */ }
  next();
}

// ─── Middleware autentificare & autorizare ───
function requireAuth(req, res, next) {
  const a = getAuth(req);
  if (a) { req.auth = a; return next(); }
  res.status(401).json({ error: 'Neautorizat' });
}

function requirePerm(perm) {
  return (req, res, next) => {
    const a = getAuth(req);
    if (a && hasPerm(a.role, perm)) { req.auth = a; return next(); }
    res.status(403).json({ error: 'Acces interzis' });
  };
}
const requireAdmin = requirePerm('manageUsers');
const requireFleet = requirePerm('manageFleet');

// Calculează IMEI-urile permise pe request (req.allowedImeis == null => acces la toate)
async function withScope(req, res, next) {
  try {
    const a = req.auth || getAuth(req) || {};
    req.allowedImeis = await getAllowedImeiSet(a.userId, a.role);
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
function canAccessImei(req, imei) {
  return req.allowedImeis == null || req.allowedImeis.has(imei);
}

// Rezolvă vehiculele țintă pentru rapoarte (respectă accesul). null => 403.
async function resolveReportImeis(req) {
  const imeiParam = req.query.imei || (req.body && req.body.imei);
  if (imeiParam) {
    const list = String(imeiParam).split(',').map(s => s.trim()).filter(Boolean);
    for (const im of list) if (!canAccessImei(req, im)) return null;
    return list;
  }
  if (req.allowedImeis == null) { const devs = await db.getDevices(); return devs.map(d => d.imei); }
  return Array.from(req.allowedImeis);
}

// Rate-limit simplu pentru login (per IP): max 10 eșecuri / 15 min
const loginAttempts = new Map();
function loginBlocked(ip) {
  const rec = loginAttempts.get(ip);
  return !!(rec && (Date.now() - rec.ts) < 15 * 60 * 1000 && rec.count >= 10);
}
function recordLoginFail(ip) {
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || (now - rec.ts) > 15 * 60 * 1000) rec = { count: 0, ts: now };
  rec.count++; rec.ts = now;
  loginAttempts.set(ip, rec);
}
function clearLoginFails(ip) { loginAttempts.delete(ip); }

// ─── Rute autentificare ───

// Login
app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    }
    if (loginBlocked(ip)) {
      return res.status(429).json({ error: 'Prea multe încercări. Reîncearcă peste 15 minute.' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      recordLoginFail(ip);
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordLoginFail(ip);
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    if (user.active === false) {
      return res.status(403).json({ error: 'Cont dezactivat. Contactează administratorul.' });
    }

    clearLoginFails(ip);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    db.setUserLastLogin(user.id).catch(() => {});
    db.logAudit({ userId: user.id, username: user.username, action: 'login', entity: 'session', ip });

    res.json({ username: user.username, role: user.role, permissions: permsFor(user.role) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  const u = req.session ? { userId: req.session.userId, username: req.session.username } : {};
  const ip = clientIp(req);
  req.session.destroy(() => {
    if (u.userId) db.logAudit({ userId: u.userId, username: u.username, action: 'logout', entity: 'session', ip });
    res.json({ ok: true });
  });
});

// Utilizatorul curent (merge atât cu sesiune cât și cu cheie API)
app.get('/api/me', (req, res) => {
  const a = getAuth(req);
  if (a) {
    return res.json({ username: a.username, role: a.role, permissions: permsFor(a.role), viaApiKey: !!a.viaApiKey });
  }
  res.status(401).json({ error: 'Neautorizat' });
});

// ─── Managementul utilizatorilor (doar admin) ───

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await db.getUsers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, full_name, email, phone } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username-ul trebuie să aibă minim 3 caractere' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 4 caractere' });
    }
    const finalRole = VALID_ROLES.includes(role) ? role : 'viewer';

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username-ul există deja' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash, finalRole, { full_name, email, phone });
    auditReq(req, 'create', 'user', user.id, { username, role: finalRole });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, full_name, email, phone, active } = req.body;
    if (role !== undefined && role !== null && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol invalid' });
    }
    // Protecție: nu te poți dezactiva sau retrograda pe tine (ca să nu rămână platforma fără admin)
    if (id === req.auth.userId && (active === false || (role && role !== 'admin'))) {
      return res.status(400).json({ error: 'Nu te poți dezactiva sau retrograda pe tine' });
    }
    await db.updateUserProfile(id, { role, full_name, email, phone, active });
    invalidateAccessCache(id);
    auditReq(req, 'update', 'user', id, { role, active });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 4 caractere' });
    }
    const hash = await bcrypt.hash(password, 10);
    await db.updateUserPassword(id, hash);
    auditReq(req, 'reset_password', 'user', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/access', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await db.getUserAccess(parseInt(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/access', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { devices, groups } = req.body;
    await db.setUserAccess(id, devices, groups);
    invalidateAccessCache(id);
    auditReq(req, 'set_access', 'user', id, { devices: (devices || []).length, groups: (groups || []).length });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.auth.userId) {
      return res.status(400).json({ error: 'Nu te poți șterge pe tine' });
    }
    await db.deleteUser(id);
    invalidateAccessCache(id);
    auditReq(req, 'delete', 'user', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit log (doar admin)
app.get('/api/audit', requireAuth, requirePerm('viewAudit'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    res.json(await db.getAuditLog(limit, offset));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Chei API (doar admin) — pentru integrări programatice ───
app.get('/api/apikeys', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getApiKeys()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/apikeys', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = parseInt(req.body.userId);
    if (!userId) return res.status(400).json({ error: 'userId este obligatoriu (cheia moștenește rolul și accesul acelui utilizator)' });
    const target = await db.getUserById(userId);
    if (!target) return res.status(404).json({ error: 'Utilizator inexistent' });
    const key = 'gpsk_' + crypto.randomBytes(24).toString('hex');
    const prefix = key.slice(0, 12);
    const rec = await db.createApiKey(userId, name, hashApiKey(key), prefix);
    auditReq(req, 'create', 'apikey', rec.id, { userId, name });
    // ATENȚIE: cheia în clar se returnează O SINGURĂ DATĂ (nu se mai poate recupera)
    res.json({ id: rec.id, name: rec.name, prefix, key, user: target.username, role: target.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/apikeys/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.revokeApiKey(parseInt(req.params.id));
    auditReq(req, 'revoke', 'apikey', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Catalog API (public) — pentru integratori
app.get('/api', (req, res) => {
  res.json({
    name: 'GPS Unitip API',
    version: '1.0',
    auth: 'Trimite cheia în header: "Authorization: Bearer <key>" sau "X-API-Key: <key>". Cheile se creează din interfață (Utilizatori → Chei API) și moștenesc rolul + accesul pe vehicule al utilizatorului asociat.',
    endpoints: {
      'GET /api/me': 'Identitatea și permisiunile curente',
      'GET /api/devices': 'Vehiculele accesibile (cu ultima poziție)',
      'GET /api/live': 'Pozițiile live (din memorie)',
      'GET /api/history/:imei?from=&to=': 'Istoric poziții (date ISO 8601)',
      'GET /api/report/:imei?from=&to=': 'Raport detaliat (km, opriri, consum, rute)',
      'GET /api/stats/:imei': 'Statistici zilnice (km, viteze, opriri)',
      'GET /api/trips/:imei?from=&to=': 'Curse',
      'GET /api/geofences': 'Zone geografice',
      'GET /api/alerts/history?limit=': 'Istoric alerte',
      'GET /api/export/:imei?from=&to=': 'Export CSV traseu',
      'GET /api/reports': 'Tipurile de rapoarte disponibile',
      'GET /api/reports/:type?from=&to=&imei=': 'Raport (trips, stops, speeding, fuel, geofence, driver, utilization)',
      'GET /api/hotspot?from=&to=&imei=&mode=': 'Puncte heatmap (stops/positions)',
      'POST /api/zone-report': 'Analiză activitate într-o zonă desenată'
    }
  });
});

// ─── API-uri protejate ───

// API: Lista dispozitivelor cu ultima poziție
app.get('/api/devices', requireAuth, withScope, async (req, res) => {
  try {
    let devices = await db.getDevices();
    if (req.allowedImeis != null) devices = devices.filter(d => req.allowedImeis.has(d.imei));
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Poziții live din memorie
app.get('/api/live', requireAuth, withScope, async (req, res) => {
  let positions = Array.from(livePositions.values());
  if (req.allowedImeis != null) positions = positions.filter(p => req.allowedImeis.has(p.imei));
  try {
    // Enrich with full device info (truck config, tank calibration, etc.)
    const result = await db.pool.query('SELECT imei, tare_weight, max_weight_legal, max_weight_construct, max_axle_loads, tank_calibration, fuel_price, cost_per_ton_km FROM devices');
    const devMap = new Map(result.rows.map(r => [r.imei, r]));
    for (const pos of positions) {
      const dev = devMap.get(pos.imei);
      if (dev) {
        pos.tare_weight = dev.tare_weight;
        pos.max_weight_legal = dev.max_weight_legal;
        pos.max_weight_construct = dev.max_weight_construct;
        pos.max_axle_loads = dev.max_axle_loads;
        pos.tank_calibration = dev.tank_calibration;
        pos.fuel_price = dev.fuel_price;
        pos.cost_per_ton_km = dev.cost_per_ton_km;
      }
    }
  } catch (e) { /* skip enrichment */ }
  res.json(positions);
});

// API: Conexiuni active
app.get('/api/connections', requireAuth, requireFleet, (req, res) => {
  const connections = Object.fromEntries(activeConnections);
  res.json(connections);
});

// API: Istoric traseu pentru un dispozitiv
app.get('/api/history/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizare info dispozitiv (nume, tip, nr. înmatriculare)
app.put('/api/devices/:imei', requireAuth, requireFleet, async (req, res) => {
  try {
    const { imei } = req.params;
    const { name, vehicle_type, plate } = req.body;
    await db.updateDeviceInfo(imei, name, vehicle_type, plate);
    auditReq(req, 'update', 'device', imei, { name, plate });
    // Update in-memory livePositions so WebSocket clients get the new name
    const pos = livePositions.get(imei);
    if (pos) {
      pos.name = name || null;
      pos.vehicle_type = vehicle_type || null;
      pos.plate = plate || null;
      livePositions.set(imei, pos);
      broadcastWs({ type: 'position', data: pos });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get full device info (cu config camion)
app.get('/api/devices/:imei/full', requireAuth, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const device = await db.getDeviceFull(req.params.imei);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update truck configuration (tara, limite, costuri)
app.put('/api/devices/:imei/truck-config', requireAuth, requireFleet, async (req, res) => {
  try {
    await db.updateTruckConfig(req.params.imei, req.body);
    auditReq(req, 'update', 'truck-config', req.params.imei);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atribuire grup + șofer pe vehicul (grupul afectează accesul multi-client)
app.put('/api/devices/:imei/assign', requireAuth, requireFleet, async (req, res) => {
  try {
    await db.assignDevice(req.params.imei, req.body.driver_id, req.body.group_id);
    invalidateAccessCache(); // grupul s-a schimbat → invalidează tot cache-ul de acces
    auditReq(req, 'assign', 'device', req.params.imei, { driver_id: req.body.driver_id, group_id: req.body.group_id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Update tank calibration (perechi voltage -> liters pentru sonda Escort)
app.put('/api/devices/:imei/tank-calibration', requireAuth, requireFleet, async (req, res) => {
  try {
    await db.updateTankCalibration(req.params.imei, req.body.calibration);
    auditReq(req, 'update', 'tank-calibration', req.params.imei);
    // Invalida cache-ul ca sa se reincarce imediat
    tankCalibrationCache.delete(req.params.imei);
    tankCalibrationTimestamp.delete(req.params.imei);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sonde combustibil configurabile (Escort / EuroSens Dominator / EuroSens Degree) ───
app.get('/api/devices/:imei/fuel-sensors', requireAuth, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    res.json(await db.getFuelSensorsRow(req.params.imei) || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/devices/:imei/fuel-sensors', requireAuth, requireFleet, async (req, res) => {
  try {
    const sensors = Array.isArray(req.body.sensors) ? req.body.sensors : [];
    await db.setFuelSensors(req.params.imei, sensors);
    invalidateFuelSensors(req.params.imei);
    auditReq(req, 'update', 'fuel-sensors', req.params.imei, { count: sensors.length });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Raport transport (detectie automata curse incarcare/descarcare + tone-km)
app.get('/api/transport-report/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();

    const device = await db.getDeviceFull(imei);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const history = await db.getDeviceHistory(imei, from, to);
    if (history.length === 0) {
      return res.json({
        imei, from, to,
        trips: [],
        summary: { tripCount: 0, totalTons: 0, totalTonKm: 0, emptyKm: 0, loadedKm: 0, fuelCost: 0, estimatedRevenue: 0 }
      });
    }

    const tare = device.tare_weight || 0;
    const LOAD_THRESHOLD = 1000; // kg - diferenta minima sa fie considerata incarcatura
    const LOAD_CHANGE_THRESHOLD = 2000; // kg - schimbare brusca = eveniment
    const STABILITY_WINDOW = 60; // secunde - cat trebuie sa fie stabila o greutate
    const fuelPrice = parseFloat(device.fuel_price) || 0;
    const costPerTonKm = parseFloat(device.cost_per_ton_km) || 0;

    // Trips detected: fiecare ciclu gol->plin->gol sau segment cu incarcatura stabila
    const trips = [];
    let currentTrip = null;
    let prevWeight = null;
    let prevPos = null;
    let totalLoadedKm = 0;
    let totalEmptyKm = 0;
    let totalFuelConsumed = 0;
    let firstFuelLevel = null;
    let lastFuelLevel = null;

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const io = row.io_data || {};
      const ts = new Date(row.timestamp);

      // Calculate total weight from axles
      const a1 = io.can_axle1_load || 0;
      const a2 = io.can_axle2_load || 0;
      const a3 = io.can_axle3_load || 0;
      const a4 = io.can_axle4_load || 0;
      const a5 = io.can_axle5_load || 0;
      const totalWeight = a1 + a2 + a3 + a4 + a5 || io.can_load_weight || 0;

      // Distance from previous point
      let segmentDist = 0;
      if (prevPos) {
        segmentDist = haversineDistance(prevPos.latitude, prevPos.longitude, row.latitude, row.longitude);
        if (segmentDist > 10) segmentDist = 0; // filter GPS jumps
      }

      // Classify km as loaded vs empty based on current load
      if (totalWeight > 0 && tare > 0) {
        const load = totalWeight - tare;
        if (load > LOAD_THRESHOLD) {
          totalLoadedKm += segmentDist;
        } else {
          totalEmptyKm += segmentDist;
        }
      }

      // Fuel tracking
      const fuelLevel = io.can_fuel_level_liters;
      if (fuelLevel !== undefined && fuelLevel > 0) {
        if (firstFuelLevel === null) firstFuelLevel = fuelLevel;
        lastFuelLevel = fuelLevel;
      }

      // Detect load events (incarcare/descarcare)
      if (prevWeight !== null && totalWeight > 0) {
        const change = totalWeight - prevWeight;

        // Incarcare detectata (greutate creste brusc cu > 2t)
        if (change > LOAD_CHANGE_THRESHOLD && !currentTrip) {
          currentTrip = {
            loadStartTime: row.timestamp,
            loadStartLat: row.latitude,
            loadStartLng: row.longitude,
            loadedWeight: totalWeight - tare,
            totalWeight: totalWeight,
            distance: 0,
            unloadTime: null,
            unloadLat: null,
            unloadLng: null
          };
        }

        // Descarcare detectata (greutate scade brusc cu > 2t)
        if (change < -LOAD_CHANGE_THRESHOLD && currentTrip) {
          currentTrip.unloadTime = row.timestamp;
          currentTrip.unloadLat = row.latitude;
          currentTrip.unloadLng = row.longitude;
          currentTrip.durationSec = Math.round((new Date(row.timestamp) - new Date(currentTrip.loadStartTime)) / 1000);
          currentTrip.tonKm = Math.round((currentTrip.loadedWeight / 1000) * currentTrip.distance * 100) / 100;
          currentTrip.loadedTons = Math.round((currentTrip.loadedWeight / 1000) * 100) / 100;
          trips.push(currentTrip);
          currentTrip = null;
        }

        // Add distance to current trip (while loaded)
        if (currentTrip && segmentDist > 0) {
          currentTrip.distance += segmentDist;
        }
      }

      prevWeight = totalWeight;
      prevPos = row;
    }

    // Close any open trip
    if (currentTrip) {
      currentTrip.durationSec = Math.round((new Date(prevPos.timestamp) - new Date(currentTrip.loadStartTime)) / 1000);
      currentTrip.tonKm = Math.round((currentTrip.loadedWeight / 1000) * currentTrip.distance * 100) / 100;
      currentTrip.loadedTons = Math.round((currentTrip.loadedWeight / 1000) * 100) / 100;
      trips.push(currentTrip);
    }

    // Fuel consumption total
    if (firstFuelLevel !== null && lastFuelLevel !== null) {
      totalFuelConsumed = Math.max(0, firstFuelLevel - lastFuelLevel);
    }

    // Summary
    const totalTons = trips.reduce((sum, t) => sum + (t.loadedTons || 0), 0);
    const totalTonKm = trips.reduce((sum, t) => sum + (t.tonKm || 0), 0);
    const fuelCost = totalFuelConsumed * fuelPrice;
    const estimatedRevenue = totalTonKm * costPerTonKm;

    res.json({
      imei,
      from,
      to,
      tareWeight: tare,
      trips: trips.map(t => ({
        ...t,
        distance: Math.round(t.distance * 100) / 100
      })),
      summary: {
        tripCount: trips.length,
        totalTons: Math.round(totalTons * 100) / 100,
        totalTonKm: Math.round(totalTonKm * 100) / 100,
        loadedKm: Math.round(totalLoadedKm * 100) / 100,
        emptyKm: Math.round(totalEmptyKm * 100) / 100,
        totalKm: Math.round((totalLoadedKm + totalEmptyKm) * 100) / 100,
        fuelConsumed: Math.round(totalFuelConsumed * 10) / 10,
        fuelCost: Math.round(fuelCost * 100) / 100,
        estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
        profit: Math.round((estimatedRevenue - fuelCost) * 100) / 100
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Statistici
app.get('/api/stats', requireAuth, withScope, async (req, res) => {
  try {
    const scoped = req.allowedImeis == null
      ? livePositions.size
      : Array.from(livePositions.keys()).filter(i => req.allowedImeis.has(i)).length;
    res.json({
      totalDevices: scoped,
      activeConnections: req.allowedImeis == null ? activeConnections.size : undefined,
      livePositions: scoped
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Dashboard KPI-uri fleet
app.get('/api/dashboard', requireAuth, withScope, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();
    const scopedSize = req.allowedImeis == null
      ? livePositions.size
      : Array.from(livePositions.keys()).filter(i => req.allowedImeis.has(i)).length;

    // Collect stats per device
    const deviceStats = [];
    let totalKm = 0;
    let totalFuel = 0;
    let totalAlerts = 0;
    let onlineCount = 0;
    let movingCount = 0;
    let totalEngineTime = 0;

    for (const [imei, data] of livePositions) {
      if (req.allowedImeis != null && !req.allowedImeis.has(imei)) continue;
      const isOnline = data.timestamp && (now - new Date(data.timestamp)) < 300000;
      const isMoving = isOnline && (data.speed || 0) > 3;
      if (isOnline) onlineCount++;
      if (isMoving) movingCount++;

      // Get today's history for this device
      try {
        const history = await db.getDeviceHistory(imei, todayStart.toISOString(), now.toISOString());
        let km = 0;
        let fuel = 0;
        let maxSpeed = 0;
        let engineTime = 0;
        let firstFuelLevel = null;
        let lastFuelLevel = null;

        for (let i = 0; i < history.length; i++) {
          const row = history[i];
          const io = row.io_data || {};

          if (i > 0) {
            const prev = history[i - 1];
            const dist = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
            if (dist < 10) km += dist;

            // Engine time
            const prevIo = prev.io_data || {};
            if (prevIo.ignition === 1 || io.ignition === 1) {
              const dt = (new Date(row.timestamp) - new Date(prev.timestamp)) / 1000;
              if (dt > 0 && dt < 3600) engineTime += dt;
            }
          }

          if ((row.speed || 0) > maxSpeed) maxSpeed = row.speed;

          // Fuel tracking
          const fl = io.can_fuel_level_liters;
          if (fl !== undefined && fl > 0) {
            if (firstFuelLevel === null) firstFuelLevel = fl;
            lastFuelLevel = fl;
          }
        }

        // Fuel consumed = drops only
        let deviceFuel = 0;
        let prevFL = null;
        for (const row of history) {
          const fl = (row.io_data || {}).can_fuel_level_liters;
          if (fl !== undefined && fl > 0) {
            if (prevFL !== null) {
              const diff = prevFL - fl;
              if (diff > 0.5) deviceFuel += diff;
            }
            prevFL = fl;
          }
        }

        km = Math.round(km * 100) / 100;
        deviceFuel = Math.round(deviceFuel * 10) / 10;
        totalKm += km;
        totalFuel += deviceFuel;
        totalEngineTime += engineTime;

        deviceStats.push({
          imei,
          name: data.name || imei,
          plate: data.plate || '',
          km,
          fuel: deviceFuel,
          maxSpeed,
          engineTime: Math.round(engineTime),
          fuelLevel: lastFuelLevel ? Math.round(lastFuelLevel * 10) / 10 : null,
          isOnline,
          isMoving
        });
      } catch (e) {
        // Skip device on error
      }
    }

    // Sort by km descending for top drivers
    const topKm = [...deviceStats].sort((a, b) => b.km - a.km).slice(0, 5);
    const topFuel = [...deviceStats].sort((a, b) => b.fuel - a.fuel).slice(0, 5);

    // Get recent alerts
    try {
      const alertRows = await db.getAlertHistory(20);
      totalAlerts = alertRows ? alertRows.length : 0;
    } catch (e) { /* no alerts table yet */ }

    res.json({
      totalDevices: scopedSize,
      onlineCount,
      movingCount,
      offlineCount: scopedSize - onlineCount,
      totalKm: Math.round(totalKm * 10) / 10,
      totalFuel: Math.round(totalFuel * 10) / 10,
      totalEngineTime: Math.round(totalEngineTime),
      totalAlerts,
      topKm,
      topFuel,
      devices: deviceStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Statistici zilnice per dispozitiv (km, viteza medie/max, opriri, timp mers/stationat, consum)
app.get('/api/stats/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const history = await db.getDeviceHistory(imei, todayStart.toISOString(), now.toISOString());

    if (history.length === 0) {
      return res.json({
        imei,
        date: todayStart.toISOString().slice(0, 10),
        totalKm: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        movingTime: 0,
        stoppedTime: 0,
        stops: 0,
        lastIgnitionOn: null,
        lastIgnitionOff: null,
        fuelConsumed: null,
        engineHours: null,
        recordCount: 0
      });
    }

    let totalDistance = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedCount = 0;
    let movingTime = 0;
    let stoppedTime = 0;
    let stops = 0;
    let wasMoving = false;
    let lastIgnitionOn = null;
    let lastIgnitionOff = null;
    let firstFuel = null;
    let lastFuel = null;

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const spd = row.speed || 0;

      // Distance
      if (i > 0) {
        const prev = history[i - 1];
        const d = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
        if (d < 10) totalDistance += d; // filtreaza salturi GPS > 10km

        // Time
        const dt = (new Date(row.timestamp) - new Date(prev.timestamp)) / 1000;
        if (dt > 0 && dt < 3600) { // ignora gap-uri > 1h
          if (spd > 3) {
            movingTime += dt;
          } else {
            stoppedTime += dt;
          }
        }
      }

      // Speed
      if (spd > 3) {
        speedSum += spd;
        speedCount++;
        if (spd > maxSpeed) maxSpeed = spd;
        if (!wasMoving) wasMoving = true;
      } else {
        if (wasMoving) {
          stops++;
          wasMoving = false;
        }
      }

      // Ignition tracking
      const io = row.io_data || {};
      if (io.ignition === 1 || io.ignition === true) {
        if (!lastIgnitionOn) lastIgnitionOn = row.timestamp;
        lastIgnitionOn = row.timestamp;
      } else if (io.ignition === 0 || io.ignition === false) {
        lastIgnitionOff = row.timestamp;
      }

      // Fuel tracking (CAN)
      if (io.can_fuel_consumed !== undefined) {
        if (firstFuel === null) firstFuel = io.can_fuel_consumed;
        lastFuel = io.can_fuel_consumed;
      }
    }

    res.json({
      imei,
      date: todayStart.toISOString().slice(0, 10),
      totalKm: Math.round(totalDistance * 100) / 100,
      avgSpeed: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
      maxSpeed,
      movingTime: Math.round(movingTime),
      stoppedTime: Math.round(stoppedTime),
      stops,
      lastIgnitionOn,
      lastIgnitionOff,
      fuelConsumed: (firstFuel !== null && lastFuel !== null) ? Math.round((lastFuel - firstFuel) / 10 * 100) / 100 : null,
      engineHours: null,
      recordCount: history.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Raport detaliat cu detectie automata rute
app.get('/api/report/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(new Date().setHours(0,0,0,0)).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);

    if (history.length === 0) {
      return res.json({ imei, from, to, routes: [], summary: { totalKm: 0, totalTime: 0, movingTime: 0, stoppedTime: 0, avgSpeed: 0, maxSpeed: 0, stops: 0, fuelConsumed: null, routeCount: 0 } });
    }

    // Detectie automata rute bazat pe ignition ON/OFF si miscare
    const routes = [];
    let currentRoute = null;
    const STOP_THRESHOLD = 180; // 3 minute fara miscare = oprire
    const SPEED_THRESHOLD = 3; // km/h

    let lastMovingTime = null;
    let globalMaxSpeed = 0;
    let globalSpeedSum = 0;
    let globalSpeedCount = 0;
    let globalTotalKm = 0;
    let globalMovingTime = 0;
    let globalStoppedTime = 0;
    let globalStops = 0;
    let globalEngineOnTime = 0;
    let globalEngineIdleTime = 0;
    let firstIgnitionOnTime = null;
    let lastIgnitionOffTime = null;

    // Daily engine hours tracking
    const dailyEngine = {};
    const dailyActivity = {}; // track first ignition on and last ignition off per day

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const spd = row.speed || 0;
      const ts = new Date(row.timestamp);
      const io = row.io_data || {};
      const isMoving = spd > SPEED_THRESHOLD;
      const ignitionOn = io.ignition === 1 || io.ignition === true;

      // Track first/last ignition times
      if (ignitionOn) {
        if (!firstIgnitionOnTime) firstIgnitionOnTime = ts;
        lastIgnitionOffTime = ts;

        const dayKey = ts.toISOString().slice(0, 10);
        if (!dailyActivity[dayKey]) dailyActivity[dayKey] = { firstOn: ts, lastOff: ts };
        if (!dailyActivity[dayKey].firstOn || ts < dailyActivity[dayKey].firstOn) dailyActivity[dayKey].firstOn = ts;
        if (ts > dailyActivity[dayKey].lastOff) dailyActivity[dayKey].lastOff = ts;
      }

      // Track global stats
      if (spd > globalMaxSpeed) globalMaxSpeed = spd;
      if (isMoving) { globalSpeedSum += spd; globalSpeedCount++; }

      // Distance from previous point
      let segmentDist = 0;
      if (i > 0) {
        const prev = history[i - 1];
        const prevIo = prev.io_data || {};
        const prevIgnition = prevIo.ignition === 1 || prevIo.ignition === true;
        segmentDist = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
        if (segmentDist > 10) segmentDist = 0; // filter GPS jumps

        // Acumulare dailyKm per zi (cheia pentru ziua in care s-a facut segmentul)
        if (segmentDist > 0) {
          const kmDayKey = new Date(prev.timestamp).toISOString().slice(0, 10);
          if (!dailyEngine[kmDayKey]) dailyEngine[kmDayKey] = { engineOn: 0, driving: 0, idle: 0, dailyKm: 0 };
          dailyEngine[kmDayKey].dailyKm = (dailyEngine[kmDayKey].dailyKm || 0) + segmentDist;
        }

        const dt = (ts - new Date(prev.timestamp)) / 1000;
        if (dt > 0 && dt < 3600) {
          if (isMoving) globalMovingTime += dt;
          else globalStoppedTime += dt;

          // Engine hours tracking (ignition ON = motor pornit)
          if (prevIgnition || ignitionOn) {
            globalEngineOnTime += dt;
            const dayKey = new Date(prev.timestamp).toISOString().slice(0, 10);
            if (!dailyEngine[dayKey]) dailyEngine[dayKey] = { engineOn: 0, driving: 0, idle: 0, dailyKm: 0 };
            dailyEngine[dayKey].engineOn += dt;
            if (isMoving) {
              dailyEngine[dayKey].driving += dt;
            } else {
              globalEngineIdleTime += dt;
              dailyEngine[dayKey].idle += dt;
            }
          }
        }
      }
      globalTotalKm += segmentDist;

      if (isMoving || (io.ignition === 1 && spd > 0)) {
        lastMovingTime = ts;

        if (!currentRoute) {
          // Start new route
          currentRoute = {
            startTime: row.timestamp,
            startLat: row.latitude,
            startLng: row.longitude,
            endTime: row.timestamp,
            endLat: row.latitude,
            endLng: row.longitude,
            distance: 0,
            maxSpeed: spd,
            speedSum: spd,
            speedCount: 1,
            points: 1,
            stops: 0
          };
        } else {
          // Continue route
          currentRoute.endTime = row.timestamp;
          currentRoute.endLat = row.latitude;
          currentRoute.endLng = row.longitude;
          currentRoute.distance += segmentDist;
          if (spd > currentRoute.maxSpeed) currentRoute.maxSpeed = spd;
          currentRoute.speedSum += spd;
          currentRoute.speedCount++;
          currentRoute.points++;
        }
      } else {
        // Vehicle stopped
        if (currentRoute && lastMovingTime) {
          const stopDuration = (ts - lastMovingTime) / 1000;
          if (stopDuration > STOP_THRESHOLD) {
            // End route
            currentRoute.duration = Math.round((new Date(currentRoute.endTime) - new Date(currentRoute.startTime)) / 1000);
            currentRoute.avgSpeed = currentRoute.speedCount > 0 ? Math.round(currentRoute.speedSum / currentRoute.speedCount) : 0;
            currentRoute.distance = Math.round(currentRoute.distance * 100) / 100;
            delete currentRoute.speedSum;
            delete currentRoute.speedCount;
            delete currentRoute.points;

            if (currentRoute.distance > 0.05 || currentRoute.duration > 60) {
              routes.push(currentRoute);
              globalStops++;
            }
            currentRoute = null;
            lastMovingTime = null;
          } else if (currentRoute) {
            // Short stop - keep in current route
            currentRoute.endTime = row.timestamp;
            currentRoute.endLat = row.latitude;
            currentRoute.endLng = row.longitude;
          }
        }
      }
    }

    // Close any open route
    if (currentRoute) {
      currentRoute.duration = Math.round((new Date(currentRoute.endTime) - new Date(currentRoute.startTime)) / 1000);
      currentRoute.avgSpeed = currentRoute.speedCount > 0 ? Math.round(currentRoute.speedSum / currentRoute.speedCount) : 0;
      currentRoute.distance = Math.round(currentRoute.distance * 100) / 100;
      delete currentRoute.speedSum;
      delete currentRoute.speedCount;
      delete currentRoute.points;
      if (currentRoute.distance > 0.05 || currentRoute.duration > 60) {
        routes.push(currentRoute);
      }
    }

    // Fuel consumption: folosim formula simpla (start - end + alimentari)
    // pentru a evita zgomotul senzorului CAN (care oscileaza +/- 0.5L)
    let fuelConsumed = null;
    let totalRefueled = 0;
    let hasFuelData = false;
    let firstFuelLevel = null;
    let lastFuelLevel = null;

    // Daily fuel breakdown (per day)
    const dailyFuel = {};
    const REFUEL_THRESHOLD = 5; // L - orice crestere brusca >5L e considerata alimentare

    // Helper: smooth readings by taking a rolling window minimum to filter noise
    // But pentru calcul corect folosim direct primele/ultimele citiri + detectare alimentari
    let prevLevel = null;

    for (const row of history) {
      const io = row.io_data || {};
      // Prefer sonda Escort daca e calibrata, altfel CAN fuel level
      const fuelLevel = (io.tank_level_liters !== undefined && io.tank_level_liters > 0)
        ? io.tank_level_liters
        : io.can_fuel_level_liters;

      if (fuelLevel !== undefined && fuelLevel !== null && fuelLevel > 0) {
        hasFuelData = true;
        if (firstFuelLevel === null) firstFuelLevel = fuelLevel;
        lastFuelLevel = fuelLevel;

        const dayKey = new Date(row.timestamp).toISOString().slice(0, 10);
        if (!dailyFuel[dayKey]) {
          dailyFuel[dayKey] = { first: fuelLevel, last: fuelLevel, refueled: 0 };
        }
        dailyFuel[dayKey].last = fuelLevel;

        // Detect refuel events (fuel level jump > threshold)
        if (prevLevel !== null) {
          const increase = fuelLevel - prevLevel;
          if (increase > REFUEL_THRESHOLD) {
            totalRefueled += increase;
            dailyFuel[dayKey].refueled += increase;
          }
        }
        prevLevel = fuelLevel;
      }
    }

    if (hasFuelData && firstFuelLevel !== null && lastFuelLevel !== null) {
      // Consum total = start - end + alimentari (daca nu s-a alimentat, e direct diferenta)
      const consumed = firstFuelLevel - lastFuelLevel + totalRefueled;
      fuelConsumed = Math.max(0, Math.round(consumed * 10) / 10);
    }

    // Calcul consum per zi folosind aceeasi formula (first - last + refueled)
    for (const dayKey of Object.keys(dailyFuel)) {
      const d = dailyFuel[dayKey];
      d.consumed = Math.max(0, Math.round((d.first - d.last + d.refueled) * 10) / 10);
    }

    // Build daily fuel summary with engine hours
    const allDays = new Set([...Object.keys(dailyFuel), ...Object.keys(dailyEngine), ...Object.keys(dailyActivity)]);
    const dailySummary = Array.from(allDays).sort().map(date => {
      const fuel = dailyFuel[date] || {};
      const engine = dailyEngine[date] || {};
      const activity = dailyActivity[date] || {};
      // Work window = first ignition ON to last ignition OFF
      const workWindow = (activity.firstOn && activity.lastOff) ? Math.round((activity.lastOff - activity.firstOn) / 1000) : 0;
      // Stationare reala = work window - driving time
      const realIdle = workWindow > 0 ? Math.max(0, workWindow - Math.round(engine.driving || 0)) : 0;
      return {
        date,
        startLevel: fuel.first ? Math.round(fuel.first * 10) / 10 : null,
        endLevel: fuel.last ? Math.round(fuel.last * 10) / 10 : null,
        consumed: fuel.consumed || 0,
        refueled: fuel.refueled ? Math.round(fuel.refueled * 10) / 10 : 0,
        engineOn: Math.round(engine.engineOn || 0),
        driving: Math.round(engine.driving || 0),
        idle: Math.round(engine.idle || 0),
        dailyKm: Math.round((engine.dailyKm || 0) * 100) / 100,
        workWindow,
        realIdle,
        firstOn: activity.firstOn ? activity.firstOn.toISOString() : null,
        lastOff: activity.lastOff ? activity.lastOff.toISOString() : null
      };
    });

    // Average fuel consumption (L/100km)
    const avgConsumption = (fuelConsumed && globalTotalKm > 1) ? Math.round((fuelConsumed / globalTotalKm) * 100 * 10) / 10 : null;

    const summary = {
      totalKm: Math.round(globalTotalKm * 100) / 100,
      totalTime: Math.round(globalMovingTime + globalStoppedTime),
      movingTime: Math.round(globalMovingTime),
      stoppedTime: Math.round(globalStoppedTime),
      avgSpeed: globalSpeedCount > 0 ? Math.round(globalSpeedSum / globalSpeedCount) : 0,
      maxSpeed: globalMaxSpeed,
      stops: globalStops,
      fuelConsumed,
      avgConsumption,
      fuelStartLevel: firstFuelLevel !== null ? Math.round(firstFuelLevel * 10) / 10 : null,
      fuelEndLevel: lastFuelLevel !== null ? Math.round(lastFuelLevel * 10) / 10 : null,
      totalRefueled: totalRefueled > 0 ? Math.round(totalRefueled * 10) / 10 : null,
      engineOnTime: Math.round(globalEngineOnTime),
      engineIdleTime: Math.round(globalEngineIdleTime),
      workWindow: (firstIgnitionOnTime && lastIgnitionOffTime) ? Math.round((lastIgnitionOffTime - firstIgnitionOnTime) / 1000) : 0,
      realStoppedTime: (firstIgnitionOnTime && lastIgnitionOffTime) ? Math.max(0, Math.round((lastIgnitionOffTime - firstIgnitionOnTime) / 1000) - Math.round(globalMovingTime)) : 0,
      dailyFuel: dailySummary,
      routeCount: routes.length
    };

    res.json({ imei, from, to, routes, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Soferi CRUD ───

app.get('/api/drivers', requireAuth, async (req, res) => {
  try { res.json(await db.getDrivers()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/drivers', requireAuth, requireFleet, async (req, res) => {
  try { const d = await db.createDriver(req.body); auditReq(req, 'create', 'driver', d.id, { name: req.body.name }); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/drivers/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.updateDriver(req.params.id, req.body); auditReq(req, 'update', 'driver', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/drivers/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.deleteDriver(req.params.id); auditReq(req, 'delete', 'driver', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Grupe CRUD ───

app.get('/api/groups', requireAuth, async (req, res) => {
  try { res.json(await db.getGroups()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/groups', requireAuth, requireFleet, async (req, res) => {
  try { const g = await db.createGroup(req.body); auditReq(req, 'create', 'group', g.id, { name: req.body.name }); res.json(g); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/groups/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.updateGroup(req.params.id, req.body); auditReq(req, 'update', 'group', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/groups/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.deleteGroup(req.params.id); auditReq(req, 'delete', 'group', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Geofences CRUD ───

app.get('/api/geofences', requireAuth, async (req, res) => {
  try { res.json(await db.getGeofences()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/geofences', requireAuth, requireFleet, async (req, res) => {
  try { const g = await db.createGeofence(req.body); auditReq(req, 'create', 'geofence', g.id, { name: req.body.name }); res.json(g); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/geofences/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.updateGeofence(req.params.id, req.body); auditReq(req, 'update', 'geofence', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geofences/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.deleteGeofence(req.params.id); auditReq(req, 'delete', 'geofence', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Alerte CRUD ───

app.get('/api/alerts', requireAuth, withScope, async (req, res) => {
  try {
    let alerts = await db.getAlerts();
    if (req.allowedImeis != null) alerts = alerts.filter(a => !a.imei || req.allowedImeis.has(a.imei));
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts', requireAuth, requireFleet, async (req, res) => {
  try { const a = await db.createAlert(req.body); auditReq(req, 'create', 'alert', a.id, { type: req.body.type }); res.json(a); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.deleteAlert(req.params.id); auditReq(req, 'delete', 'alert', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/history', requireAuth, withScope, async (req, res) => {
  try {
    let rows = await db.getAlertHistory(parseInt(req.query.limit) || 50);
    if (req.allowedImeis != null) rows = rows.filter(r => req.allowedImeis.has(r.imei));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Trips ───

app.get('/api/trips/:imei', requireAuth, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    res.json(await db.getTrips(req.params.imei, from, to));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Mentenanta CRUD ───

app.get('/api/maintenance', requireAuth, withScope, async (req, res) => {
  try {
    let rows = await db.getMaintenance(req.query.imei);
    if (req.allowedImeis != null) rows = rows.filter(m => req.allowedImeis.has(m.imei));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/maintenance', requireAuth, requireFleet, async (req, res) => {
  try { const m = await db.createMaintenance(req.body); auditReq(req, 'create', 'maintenance', m.id, { imei: req.body.imei, type: req.body.type }); res.json(m); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.updateMaintenance(req.params.id, req.body); auditReq(req, 'update', 'maintenance', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/maintenance/:id', requireAuth, requireFleet, async (req, res) => {
  try { await db.deleteMaintenance(req.params.id); auditReq(req, 'delete', 'maintenance', req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export CSV ───

// ─── Detectie automata tara camion ───
// Tracking ultimele N citiri ale sarcinii totale per vehicul
const tareSamples = new Map(); // imei -> [{weight, timestamp}, ...]
const TARE_SAMPLE_LIMIT = 100;

async function trackTareCandidate(imei, ioData) {
  const a1 = ioData.can_axle1_load || 0;
  const a2 = ioData.can_axle2_load || 0;
  const a3 = ioData.can_axle3_load || 0;
  const a4 = ioData.can_axle4_load || 0;
  const a5 = ioData.can_axle5_load || 0;
  const total = a1 + a2 + a3 + a4 + a5 || ioData.can_load_weight || 0;
  if (total <= 0) return;

  let samples = tareSamples.get(imei) || [];
  samples.push({ weight: total, timestamp: Date.now() });
  if (samples.length > TARE_SAMPLE_LIMIT) samples = samples.slice(-TARE_SAMPLE_LIMIT);
  tareSamples.set(imei, samples);

  // Detectie tara: cea mai mica valoare aparuta de minim 10 ori in ultimele 100 citiri
  // (vehiculul a fost gol de cel putin 10 ori)
  if (samples.length >= 30) {
    const minWeight = Math.min(...samples.map(s => s.weight));
    const closeToMin = samples.filter(s => Math.abs(s.weight - minWeight) < 200).length;

    if (closeToMin >= 10) {
      // Update tara automata daca nu e setata sau valoarea noua e mai mica
      try {
        const device = await db.getDeviceFull(imei);
        if (device && (!device.tare_weight || minWeight < device.tare_weight - 500)) {
          await db.pool.query(
            'UPDATE devices SET tare_weight = $2 WHERE imei = $1 AND (tare_weight IS NULL OR tare_weight > $2)',
            [imei, Math.round(minWeight)]
          );
          console.log(`[TARE] Auto-detected tare for ${imei}: ${minWeight} kg`);
        }
      } catch (e) { /* skip */ }
    }
  }
}

// ─── Evaluare Alerte Automate ───
const alertCooldowns = new Map(); // key: alertId_imei, value: timestamp

function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInCircle(lat, lng, centerLat, centerLng, radiusKm) {
  return haversineDistance(lat, lng, centerLat, centerLng) <= radiusKm;
}

// Track geofence state per device for enter/exit detection
const geofenceStates = new Map(); // key: imei_geofenceId, value: boolean (inside)

async function evaluateAlerts(imei, data) {
  try {
    const alerts = await db.getAlerts();
    if (!alerts || alerts.length === 0) return;

    const speed = data.speed || 0;
    const io = data.io || {};
    const lat = data.latitude;
    const lng = data.longitude;

    for (const alert of alerts) {
      if (!alert.enabled) continue;
      if (alert.imei && alert.imei !== imei) continue; // Device-specific alert

      const cond = alert.condition || {};
      const cooldownKey = alert.id + '_' + imei;
      const lastTriggered = alertCooldowns.get(cooldownKey);
      if (lastTriggered && (Date.now() - lastTriggered) < 300000) continue; // 5 min cooldown

      let triggered = false;
      let alertData = {};

      switch (alert.type) {
        case 'overspeed':
          if (cond.maxSpeed && speed > cond.maxSpeed) {
            triggered = true;
            alertData = { speed, limit: cond.maxSpeed };
          }
          break;

        case 'fuel_drop':
          if (cond.dropLiters && io.can_fuel_level_liters !== undefined) {
            // Compare with previous reading stored in livePositions
            const prev = livePositions.get(imei);
            if (prev && prev.io && prev.io.can_fuel_level_liters !== undefined) {
              const drop = prev.io.can_fuel_level_liters - io.can_fuel_level_liters;
              if (drop > cond.dropLiters) {
                triggered = true;
                alertData = { previousLevel: prev.io.can_fuel_level_liters, currentLevel: io.can_fuel_level_liters, drop };
              }
            }
          }
          break;

        case 'ignition_on':
          if (io.ignition === 1) {
            triggered = true;
            alertData = { event: 'Motor pornit' };
          }
          break;

        case 'ignition_off':
          if (io.ignition === 0) {
            const prev = livePositions.get(imei);
            if (prev && prev.io && prev.io.ignition === 1) {
              triggered = true;
              alertData = { event: 'Motor oprit' };
            }
          }
          break;

        case 'dtc_error':
          if (io.can_dtc_errors && io.can_dtc_errors > 0) {
            triggered = true;
            alertData = { dtcCount: io.can_dtc_errors };
          }
          break;

        case 'geofence_exit':
        case 'geofence_enter':
          if (cond.geofenceId && lat && lng) {
            try {
              const geofences = await db.getGeofences();
              const gf = geofences.find(g => g.id === cond.geofenceId);
              if (gf && gf.coordinates) {
                const coords = typeof gf.coordinates === 'string' ? JSON.parse(gf.coordinates) : gf.coordinates;
                let isInside = false;

                if (gf.type === 'circle' && coords.center && coords.radius) {
                  isInside = isPointInCircle(lat, lng, coords.center[0], coords.center[1], coords.radius / 1000);
                } else if (Array.isArray(coords)) {
                  isInside = isPointInPolygon([lat, lng], coords);
                }

                const stateKey = imei + '_' + gf.id;
                const wasInside = geofenceStates.get(stateKey);

                if (alert.type === 'geofence_exit' && wasInside === true && !isInside) {
                  triggered = true;
                  alertData = { geofence: gf.name || gf.id, event: 'Iesire din zona' };
                } else if (alert.type === 'geofence_enter' && wasInside === false && isInside) {
                  triggered = true;
                  alertData = { geofence: gf.name || gf.id, event: 'Intrare in zona' };
                }

                geofenceStates.set(stateKey, isInside);
              }
            } catch (e) { /* geofence check failed */ }
          }
          break;

        case 'engine_temp':
          if (cond.maxTemp && io.can_engine_temp && io.can_engine_temp > cond.maxTemp) {
            triggered = true;
            alertData = { temp: io.can_engine_temp, limit: cond.maxTemp };
          }
          break;

        case 'overload_legal':
        case 'overload_construct': {
          // Calculate total weight from axles
          const a1 = io.can_axle1_load || 0;
          const a2 = io.can_axle2_load || 0;
          const a3 = io.can_axle3_load || 0;
          const a4 = io.can_axle4_load || 0;
          const a5 = io.can_axle5_load || 0;
          const totalKg = a1 + a2 + a3 + a4 + a5 || io.can_load_weight || 0;
          if (totalKg > 0 && cond.maxKg && totalKg > cond.maxKg) {
            triggered = true;
            alertData = { totalKg, limit: cond.maxKg, axles: [a1, a2, a3, a4, a5] };
          }
          break;
        }

        case 'axle_overload': {
          // Per-axle limit check
          const axleLimits = cond.axleLimits || {};
          for (const axleNum of [1, 2, 3, 4, 5]) {
            const load = io['can_axle' + axleNum + '_load'];
            const limit = axleLimits['axle' + axleNum];
            if (load && limit && load > limit) {
              triggered = true;
              alertData = { axle: axleNum, load, limit };
              break;
            }
          }
          break;
        }

        case 'pto_active':
          if (io.can_pto_active === 1 || io.can_pto_active === true) {
            triggered = true;
            alertData = { event: 'PTO activat' };
          }
          break;

        case 'brake_pad_wear': {
          const minWear = cond.minPercent || 20;
          for (const axleNum of [1, 2, 3, 4]) {
            const wear = io['can_brake_pad_axle' + axleNum];
            if (wear !== undefined && wear < minWear) {
              triggered = true;
              alertData = { axle: axleNum, wear, threshold: minWear };
              break;
            }
          }
          break;
        }

        case 'service_due':
          if (io.can_distance_to_service !== undefined && io.can_distance_to_service < (cond.warnKm || 1000)) {
            triggered = true;
            alertData = { distanceToService: io.can_distance_to_service, threshold: cond.warnKm || 1000 };
          }
          break;
      }

      if (triggered) {
        alertCooldowns.set(cooldownKey, Date.now());
        alertData.imei = imei;
        alertData.vehicleName = data.name || imei;
        alertData.lat = lat;
        alertData.lng = lng;
        alertData.timestamp = new Date().toISOString();

        // Save to DB
        try {
          await db.insertAlertEvent(alert.id, imei, alertData);
        } catch (e) { /* DB error */ }

        // Broadcast alert via WebSocket
        broadcastWs({
          type: 'alert',
          data: {
            alertId: alert.id,
            alertName: alert.name,
            alertType: alert.type,
            ...alertData
          }
        });

        // Centru de notificări + canale externe (Faza 4)
        notify({
          type: 'alert', severity: 'warning', imei,
          title: alert.name,
          body: alertSummary(alert.type, alertData),
          data: { alertId: alert.id, alertType: alert.type, ...alertData }
        });

        console.log(`[ALERT] ${alert.name} triggered for ${imei}: ${JSON.stringify(alertData)}`);
      }
    }
  } catch (err) {
    console.error(`[ALERTS] Error: ${err.message}`);
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ══════════════════════════════════════════════
//  NOTIFICĂRI (Faza 4) — centru in-app + canale externe + workere
// ══════════════════════════════════════════════
{
  const cfg = channels.channelsConfigured();
  const active = Object.entries(cfg).filter(([, v]) => v).map(([k]) => k);
  console.log(active.length ? '[NOTIFY] Canale externe active: ' + active.join(', ') : '[NOTIFY] Doar centrul in-app (niciun canal extern configurat)');
}

function alertSummary(type, d) {
  switch (type) {
    case 'overspeed': return `Viteză ${d.speed} km/h (limită ${d.limit})`;
    case 'fuel_drop': return `Scădere combustibil ${d.drop != null ? d.drop.toFixed(1) : '?'} L`;
    case 'engine_temp': return `Temperatură ${d.temp}°C (limită ${d.limit})`;
    case 'geofence_enter': case 'geofence_exit': return (d.event || '') + (d.geofence ? ': ' + d.geofence : '');
    case 'overload_legal': case 'overload_construct': return `Greutate ${d.totalKg} kg (limită ${d.limit})`;
    case 'dtc_error': return `${d.dtcCount} erori motor`;
    default: return d.event || type;
  }
}

// Creează o notificare: stochează + WS (scopat pe imei) + canale externe (opțional)
async function notify(n) {
  try {
    if (n.data && n.data.key) {
      if (await db.notificationKeyExists(n.data.key, n.dedupHours || 20)) return;
    }
    const saved = await db.createNotification(n);
    broadcastWs({ type: 'notification', data: saved });
    const cfg = channels.channelsConfigured();
    if (cfg.email || cfg.telegram || cfg.webhook) channels.dispatchChannels({ ...n, id: saved.id }).catch(() => {});
  } catch (e) { console.error('[NOTIFY]', e.message); }
}

// Worker: detecție automată curse → populează tabela trips
async function detectAndSaveTrips(imei) {
  try {
    const to = new Date(), from = new Date(Date.now() - 36 * 3600 * 1000);
    const pts = await db.getDeviceHistory(imei, from.toISOString(), to.toISOString());
    if (pts.length < 2) return 0;
    const { trips } = reports.segmentTrack(pts, 5 * 60);
    const mapped = trips.map(tr => ({
      start: tr.start, end: tr.end, durationSec: tr.durationSec, distanceKm: tr.distanceKm,
      maxSpeed: tr.maxSpeed, avgSpeed: tr.avgSpeed,
      startLat: tr.startP.latitude, startLng: tr.startP.longitude, endLat: tr.endP.latitude, endLng: tr.endP.longitude
    }));
    await db.saveTripsForRange(imei, from.toISOString(), to.toISOString(), mapped);
    return mapped.length;
  } catch (e) { return 0; }
}
async function runTripDetection() {
  try {
    const devs = await db.getDevices();
    let total = 0;
    for (const d of devs) total += await detectAndSaveTrips(d.imei);
    return total;
  } catch (e) { console.error('[TRIPS]', e.message); return 0; }
}

// Worker: alerte expirare documente (permis șofer) + mentenanță scadentă
async function checkExpiries() {
  const warnDays = parseInt(process.env.NOTIFY_EXPIRY_DAYS) || 30;
  const now = Date.now(), horizon = now + warnDays * 24 * 3600 * 1000;
  try {
    for (const dr of await db.getDrivers()) {
      if (!dr.license_expiry) continue;
      const exp = new Date(dr.license_expiry).getTime();
      if (exp > horizon) continue;
      const days = Math.ceil((exp - now) / (24 * 3600 * 1000));
      const nDrv = {
        type: 'document_expiry', severity: days < 0 ? 'critical' : 'warning',
        title: `Permis șofer ${days < 0 ? 'EXPIRAT' : 'expiră curând'}: ${dr.name}`,
        body: `Permisul ${dr.license_number || ''} ${days < 0 ? 'a expirat de ' + (-days) + ' zile' : 'expiră în ' + days + ' zile'} (${new Date(dr.license_expiry).toLocaleDateString('ro-RO')}).`,
        data: { key: 'drv-license-' + dr.id, driverId: dr.id, days }
      };
      await notify(nDrv);
      await deliverExpiryToSubscribers({ title: nDrv.title, body: nDrv.body, key: nDrv.data.key });
    }
    for (const m of await db.getMaintenance()) {
      if (m.status === 'done' || !m.due_date) continue;
      const due = new Date(m.due_date).getTime();
      if (due > horizon) continue;
      const days = Math.ceil((due - now) / (24 * 3600 * 1000));
      const nMnt = {
        type: 'maintenance_due', severity: days < 0 ? 'critical' : 'warning', imei: m.imei,
        title: `Mentenanță ${days < 0 ? 'SCADENTĂ' : 'scadentă curând'}: ${m.type}`,
        body: `${m.type} ${days < 0 ? 'a depășit scadența cu ' + (-days) + ' zile' : 'scade în ' + days + ' zile'} (${new Date(m.due_date).toLocaleDateString('ro-RO')}).`,
        data: { key: 'maint-' + m.id, maintenanceId: m.id, days }
      };
      await notify(nMnt);
      await deliverExpiryToSubscribers({ imei: m.imei, title: nMnt.title, body: nMnt.body, key: nMnt.data.key });
    }
  } catch (e) { console.error('[EXPIRY]', e.message); }
}

// ══════════════════════════════════════════════
//  EVENIMENTE PER-UTILIZATOR — abonamente + praguri proprii + email/Web Push
// ══════════════════════════════════════════════
const EVENT_TYPES = [
  { key: 'fuel_drop',        label: 'Scădere bruscă combustibil', unit: 'L',     def: 15,    threshold: true },
  { key: 'overspeed',        label: 'Depășire viteză',            unit: 'km/h',  def: 90,    threshold: true },
  { key: 'engine_temp',      label: 'Temperatură motor mare',     unit: '°C',    def: 105,   threshold: true },
  { key: 'idling',           label: 'Idling prelungit',           unit: 'min',   def: 10,    threshold: true },
  { key: 'overload',         label: 'Supraîncărcare',             unit: 'kg',    def: 40000, threshold: true },
  { key: 'low_voltage',      label: 'Tensiune scăzută',           unit: 'V',     def: 11.8,  threshold: true, below: true },
  { key: 'no_ignition_move', label: 'Mișcare fără contact',       threshold: false },
  { key: 'dtc_error',        label: 'Erori motor (DTC)',          threshold: false },
  { key: 'document_expiry',  label: 'Expirare documente',         threshold: false }
];
const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map(e => [e.key, e]));

// ─── Web Push (VAPID generat o singură dată și persistat local) ───
let VAPID = null;
function initVapid() {
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      VAPID = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    } else {
      const p = path.join(__dirname, 'data', '.vapid.json');
      if (fs.existsSync(p)) { try { VAPID = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {} }
      if (!VAPID || !VAPID.publicKey) {
        VAPID = webpush.generateVAPIDKeys();
        try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(VAPID)); } catch (e) {}
      }
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@gps-unitip.local', VAPID.publicKey, VAPID.privateKey);
    console.log('[PUSH] Web Push activ (VAPID configurat)');
  } catch (e) { console.error('[PUSH] init:', e.message); }
}
async function sendPushToUser(userId, payload) {
  let subs; try { subs = await db.getPushSubscriptions(userId); } catch (e) { return; }
  for (const s of subs) {
    try { await webpush.sendNotification(s.subscription, JSON.stringify(payload)); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.deletePushSubscription(s.endpoint).catch(() => {}); }
  }
}
function broadcastWsToUser(userId, message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(c => { if (c.readyState === 1 && c._authed && c._userId === userId) c.send(data); });
}

// ─── Cache-uri + cooldown per-user ───
let _prefsCache = null, _prefsTs = 0;
async function getPrefsMap() { if (_prefsCache && Date.now() - _prefsTs < 30000) return _prefsCache; _prefsCache = await db.getAllNotificationPrefs(); _prefsTs = Date.now(); return _prefsCache; }
function invalidatePrefsCache() { _prefsCache = null; }
const _eligibleCache = new Map();
async function getEligibleUsers(imei) { const c = _eligibleCache.get(imei); if (c && Date.now() - c.ts < 60000) return c.users; const users = await db.getUsersForImei(imei); _eligibleCache.set(imei, { ts: Date.now(), users }); return users; }
const _userEvtCooldown = new Map();
function userCooldownOk(userId, type, key, ms) { const k = userId + '_' + type + '_' + key; const last = _userEvtCooldown.get(k); if (last && Date.now() - last < (ms || 300000)) return false; _userEvtCooldown.set(k, Date.now()); return true; }
const _idlingStart = new Map();

// Preferința unui user pentru un tip: dacă nu are nicio preferință salvată → implicit doar in-app
function userTypePref(prefsMap, userId, type) {
  const up = prefsMap[userId];
  if (!up || !up.types) return { enabled: true };           // fără preferințe → in-app implicit pornit
  return up.types[type] || null;                            // are preferințe dar nu a bifat acest tip → null
}
async function deliverUserEvent(user, ev, p) {
  try {
    const saved = await db.createNotification({ type: ev.type, severity: ev.severity || 'warning', imei: ev.imei || null, title: ev.title, body: ev.body, data: { eventType: ev.type }, userId: user.id });
    broadcastWsToUser(user.id, { type: 'notification', data: saved });
  } catch (e) {}
  if (p && p.email && user.email) channels.sendEmailTo(user.email, ev.title, ev.body).catch(() => {});
  if (p && p.push) sendPushToUser(user.id, { title: ev.title, body: ev.body }).catch(() => {});
}

// Detector evenimente per-poziție (prev = poziția anterioară a vehiculului)
async function evaluateUserEvents(imei, data, prev) {
  try {
    const io = data.io || {}, pio = (prev && prev.io) || {};
    const speed = data.speed || 0;
    const cand = [];
    const pf = (typeof pio.fuel_level_liters === 'number') ? pio.fuel_level_liters : pio.can_fuel_level_liters;
    const cf = (typeof io.fuel_level_liters === 'number') ? io.fuel_level_liters : io.can_fuel_level_liters;
    if (typeof pf === 'number' && typeof cf === 'number') {
      const drop = pf - cf;
      if (drop >= 2) cand.push({ type: 'fuel_drop', mag: drop, body: `Scădere ${drop.toFixed(1)} L (${pf} → ${cf} L)` });
    }
    if (speed >= 50) cand.push({ type: 'overspeed', mag: speed, body: `Viteză ${speed} km/h` });
    if (typeof io.can_engine_temp === 'number' && io.can_engine_temp >= 80) cand.push({ type: 'engine_temp', mag: io.can_engine_temp, body: `Temperatură motor ${io.can_engine_temp}°C` });
    if (io.ignition === 1 && speed <= 3) {
      if (!_idlingStart.has(imei)) _idlingStart.set(imei, Date.now());
      const min = (Date.now() - _idlingStart.get(imei)) / 60000;
      if (min >= 3) cand.push({ type: 'idling', mag: Math.round(min), body: `Motor pornit, staționat de ~${Math.round(min)} min` });
    } else { _idlingStart.delete(imei); }
    if (io.ignition === 0 && speed > 5) cand.push({ type: 'no_ignition_move', mag: speed, body: `Mișcare ${speed} km/h cu contactul OPRIT` });
    if (typeof io.external_voltage === 'number' && io.external_voltage > 0) {
      const v = io.external_voltage / 1000;
      if (v < 13) cand.push({ type: 'low_voltage', mag: v, body: `Tensiune alimentare ${v.toFixed(1)} V` });
    }
    const totalKg = (io.can_axle1_load || 0) + (io.can_axle2_load || 0) + (io.can_axle3_load || 0) + (io.can_axle4_load || 0) + (io.can_axle5_load || 0) || io.can_load_weight || 0;
    if (totalKg >= 20000) cand.push({ type: 'overload', mag: totalKg, body: `Greutate totală ${totalKg} kg` });
    if (io.can_dtc_errors > 0) cand.push({ type: 'dtc_error', mag: io.can_dtc_errors, body: `${io.can_dtc_errors} erori motor (DTC)` });

    if (!cand.length) return;
    const users = await getEligibleUsers(imei);
    if (!users.length) return;
    const prefsMap = await getPrefsMap();
    const vname = data.name || imei;
    for (const c of cand) {
      const def = EVENT_TYPE_MAP[c.type];
      for (const u of users) {
        const up = userTypePref(prefsMap, u.id, c.type);
        if (!up || !up.enabled) continue;
        if (def.threshold) {
          const thr = (up.threshold != null && up.threshold !== '') ? Number(up.threshold) : def.def;
          if (def.below) { if (c.mag >= thr) continue; } else { if (c.mag < thr) continue; }
        }
        if (!userCooldownOk(u.id, c.type, imei)) continue;
        await deliverUserEvent(u, { type: c.type, imei, severity: c.type === 'no_ignition_move' ? 'critical' : 'warning', title: def.label + ' — ' + vname, body: c.body }, up);
      }
    }
  } catch (e) { console.error('[UEVENTS]', e.message); }
}

// Livrare expirări documente către utilizatorii abonați (email/push; in-app vine din broadcast)
async function deliverExpiryToSubscribers(ev) {
  try {
    const users = ev.imei ? await getEligibleUsers(ev.imei) : await db.getAllActiveUsers();
    const prefsMap = await getPrefsMap();
    for (const u of users) {
      const up = userTypePref(prefsMap, u.id, 'document_expiry');
      if (!up || !up.enabled) continue;
      if (!userCooldownOk(u.id, 'document_expiry', ev.key, 20 * 3600 * 1000)) continue;
      if (up.email && u.email) channels.sendEmailTo(u.email, ev.title, ev.body).catch(() => {});
      if (up.push) sendPushToUser(u.id, { title: ev.title, body: ev.body }).catch(() => {});
    }
  } catch (e) {}
}

app.get('/api/export/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);

    if (history.length === 0) {
      return res.status(404).json({ error: 'Nu sunt date pentru perioada selectata' });
    }

    // Collect all IO keys from all records
    const allIoKeys = new Set();
    for (const row of history) {
      if (row.io_data) {
        Object.keys(row.io_data).forEach(k => allIoKeys.add(k));
      }
    }
    const ioKeys = Array.from(allIoKeys).sort();

    // CSV header
    const baseHeaders = ['Data/Ora', 'Latitudine', 'Longitudine', 'Viteza (km/h)', 'Altitudine (m)', 'Unghi', 'Sateliti'];
    const headers = [...baseHeaders, ...ioKeys, 'Distanta parcursa (km)'];

    // Calculate stats
    let totalDistance = 0;
    let maxSpeed = 0;
    let movingTime = 0;
    let stoppedTime = 0;
    let stops = 0;
    let wasMoving = false;

    const rows = history.map((row, i) => {
      // Distance
      let dist = 0;
      if (i > 0) {
        dist = haversineDistance(
          history[i - 1].latitude, history[i - 1].longitude,
          row.latitude, row.longitude
        );
        totalDistance += dist;

        // Time calculation
        const timeDiff = (new Date(row.timestamp) - new Date(history[i - 1].timestamp)) / 1000;
        if (row.speed > 3) {
          movingTime += timeDiff;
          if (!wasMoving) wasMoving = true;
        } else {
          stoppedTime += timeDiff;
          if (wasMoving) { stops++; wasMoving = false; }
        }
      }

      if (row.speed > maxSpeed) maxSpeed = row.speed;

      const baseCols = [
        new Date(row.timestamp).toLocaleString('ro-RO', { timeZone: process.env.DISPLAY_TZ || 'Europe/Bucharest' }),
        row.latitude,
        row.longitude,
        row.speed,
        row.altitude,
        row.angle,
        row.satellites
      ];

      // IO data columns
      const ioCols = ioKeys.map(key => {
        const val = row.io_data?.[key];
        return val !== undefined ? val : '';
      });

      return [...baseCols, ...ioCols, totalDistance.toFixed(3)];
    });

    // Summary rows
    const avgSpeed = history.length > 0
      ? (history.reduce((sum, r) => sum + r.speed, 0) / history.length).toFixed(1)
      : 0;

    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    };

    const emptyIoCols = ioKeys.map(() => '');

    rows.push([]);
    rows.push(['=== SUMAR ===', '', '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Total distanta (km)', totalDistance.toFixed(2), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Viteza medie (km/h)', avgSpeed, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Viteza maxima (km/h)', maxSpeed, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Timp in miscare', formatTime(movingTime), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Timp oprit', formatTime(stoppedTime), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Numar opriri', stops, '', '', '', '', '', ...emptyIoCols, '']);
    const _tz = { timeZone: process.env.DISPLAY_TZ || 'Europe/Bucharest' };
    rows.push(['Perioada', `${new Date(from).toLocaleString('ro-RO', _tz)} - ${new Date(to).toLocaleString('ro-RO', _tz)}`, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Puncte GPS', history.length, '', '', '', '', '', ...emptyIoCols, '']);

    // Build CSV
    const escapeCsv = (val) => {
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    const filename = `traseu_${imei}_${new Date(from).toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rapoarte (Faza 3) ───
app.get('/api/reports', requireAuth, (req, res) => {
  res.json({
    categories: reports.REPORT_CATEGORIES,
    reports: Object.entries(reports.REPORTS).map(([k, v]) => ({ type: k, label: v.label, cat: v.cat }))
  });
});

app.get('/api/reports/:type', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const imeis = await resolveReportImeis(req);
    if (imeis === null) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 7*24*3600*1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const opts = {
      stopMin: parseInt(req.query.stopMin) || 5,
      limit: parseInt(req.query.limit) || 90,
      refuelMin: parseInt(req.query.refuelMin) || 10,
      dropMin: parseInt(req.query.dropMin) || 10
    };
    res.json(await reports.runReport(db, req.params.type, imeis, from, to, opts));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Hotspot — puncte pentru heatmap
app.get('/api/hotspot', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const imeis = await resolveReportImeis(req);
    if (imeis === null) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 7*24*3600*1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    res.json(await reports.hotspot(db, imeis, from, to, { mode: req.query.mode || 'stops', stopMin: parseInt(req.query.stopMin) || 5 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Analiză zonă desenată ad-hoc (cerc/poligon)
app.post('/api/zone-report', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const imeis = await resolveReportImeis(req);
    if (imeis === null) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.body.from || new Date(Date.now() - 7*24*3600*1000).toISOString();
    const to = req.body.to || new Date().toISOString();
    const z = req.body.zone || {};
    let zone;
    if (z.type === 'circle' && z.center && z.radius) zone = { type: 'circle', center: z.center, radius: z.radius };
    else if (Array.isArray(z.coordinates) && z.coordinates.length >= 3) zone = { type: 'polygon', coords: z.coordinates };
    else return res.status(400).json({ error: 'Zonă invalidă' });
    res.json(await reports.analyzeZone(db, imeis, from, to, zone));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Notificări (Faza 4) ───
app.get('/api/notifications', requireAuth, withScope, async (req, res) => {
  try {
    const imeis = req.allowedImeis == null ? null : Array.from(req.allowedImeis);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    res.json(await db.getNotifications(req.auth.userId, imeis, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/notifications/unread-count', requireAuth, withScope, async (req, res) => {
  try {
    const imeis = req.allowedImeis == null ? null : Array.from(req.allowedImeis);
    res.json({ count: await db.unreadNotifications(req.auth.userId, imeis) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/notifications/channels', requireAuth, requireAdmin, (req, res) => {
  res.json(channels.channelsConfigured());
});

// Tipuri de evenimente abonabile (catalog)
app.get('/api/event-types', requireAuth, (req, res) => res.json(EVENT_TYPES));

// Preferințe notificări ale utilizatorului curent
app.get('/api/notification-prefs', requireAuth, async (req, res) => {
  try { res.json(await db.getNotificationPrefs(req.auth.userId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/notification-prefs', requireAuth, async (req, res) => {
  try { await db.setNotificationPrefs(req.auth.userId, req.body || {}); invalidatePrefsCache(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Web Push: cheie publică VAPID + abonare/dezabonare dispozitiv
app.get('/api/push/vapid', requireAuth, (req, res) => res.json({ publicKey: VAPID ? VAPID.publicKey : null }));
app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Subscription invalidă' });
    await db.savePushSubscription(req.auth.userId, sub);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try { if (req.body && req.body.endpoint) await db.deletePushSubscription(req.body.endpoint); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint de test (DOAR cu SEED_TEST=1) — simulează o poziție live pentru a declanșa evenimente
if (process.env.SEED_TEST === '1') {
  app.post('/api/test/simulate', requireAuth, async (req, res) => {
    try {
      const { imei, io, speed, name } = req.body;
      const data = { imei, io: io || {}, speed: speed || 0, name: name || imei, timestamp: new Date().toISOString() };
      // aplică maparea de sonde (ca în ingestul TCP)
      try { const fsensors = await getFuelSensors(imei); if (fsensors && fsensors.length) computeFuelFromSensors(data.io, fsensors); } catch (e) {}
      const prev = livePositions.get(imei) || {};
      livePositions.set(imei, data);
      await evaluateUserEvents(imei, data, prev);
      res.json({ ok: true, io: data.io });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
app.post('/api/notifications/ack-all', requireAuth, withScope, async (req, res) => {
  try {
    const imeis = req.allowedImeis == null ? null : Array.from(req.allowedImeis);
    await db.ackAllNotifications(req.auth.userId, imeis);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/notifications/:id/ack', requireAuth, async (req, res) => {
  try { await db.ackNotification(parseInt(req.params.id)); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Declanșează manual verificarea expirărilor documente/mentenanță (admin)
app.post('/api/notifications/check-expiries', requireAuth, requireAdmin, async (req, res) => {
  try { await checkExpiries(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Declanșează manual detecția de curse (admin/manager) — utilă și pentru recalcul
app.post('/api/trips/detect', requireAuth, requireFleet, async (req, res) => {
  try { res.json({ ok: true, trips: await runTripDetection() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Debug API (doar admin) ───

app.get('/api/debug/log', requireAuth, requireAdmin, (req, res) => {
  res.json(debugLog);
});

app.get('/api/debug/raw/:imei', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { imei } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const result = await db.pool.query(
      'SELECT timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, created_at FROM positions WHERE imei = $1 ORDER BY timestamp DESC LIMIT $2',
      [imei, limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// 3. WEBSOCKET — actualizări live către browser
// ══════════════════════════════════════════════
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Răspuns fictiv pentru a putea rula sessionMiddleware pe handshake-ul WebSocket
const wsDummyRes = {
  setHeader() {}, getHeader() {}, removeHeader() {}, writeHead() {}, end() {},
  on() {}, once() {}, emit() {}, getHeaderNames() { return []; }
};

wss.on('connection', (ws, req) => {
  // Autentificare prin sesiunea HTTP (cookie) și calculul accesului pe vehicule
  sessionMiddleware(req, wsDummyRes, async () => {
    if (!req.session || !req.session.userId) {
      try { ws.send(JSON.stringify({ type: 'error', data: { error: 'Neautorizat' } })); } catch (e) {}
      return ws.close();
    }
    ws._userId = req.session.userId;
    ws._role = req.session.role;
    ws._isAdmin = hasPerm(req.session.role, 'manageUsers');
    try {
      ws._allowedImeis = await getAllowedImeiSet(req.session.userId, req.session.role);
    } catch (e) {
      ws._allowedImeis = new Set();
    }
    ws._authed = true;
    console.log(`[WS] Client conectat la live feed (${req.session.username})`);

    // Trimite doar pozițiile la care utilizatorul are acces
    const positions = Array.from(livePositions.values())
      .filter(p => ws._allowedImeis == null || ws._allowedImeis.has(p.imei));
    try { ws.send(JSON.stringify({ type: 'init', data: positions })); } catch (e) {}
  });

  ws.on('close', () => {
    console.log('[WS] Client deconectat');
  });
});

function broadcastWs(message) {
  const imei = message && message.data && message.data.imei;
  const isDebug = message && message.type === 'debug';
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;       // doar conexiuni OPEN
    if (!client._authed) return;               // nu trimite înainte de autentificare
    if (isDebug && !client._isAdmin) return;   // debug doar pentru admini
    if (imei && client._allowedImeis instanceof Set && !client._allowedImeis.has(imei)) return; // filtrare pe acces
    client.send(data);
  });
}

// ══════════════════════════════════════════════
// 4. PORNIRE
// ══════════════════════════════════════════════
async function start() {
  // Inițializează baza de date
  await db.initDb();
  initVapid();

  // Creează sau actualizează userul admin
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminUser = await db.getUserByUsername('admin');
  if (!adminUser) {
    const hash = await bcrypt.hash(adminPass, 10);
    await db.createUser('admin', hash, 'admin');
    console.log('[AUTH] Utilizator admin creat');
  } else if (process.env.ADMIN_PASSWORD) {
    // Reseteaza parola admin la cea din env var
    const hash = await bcrypt.hash(adminPass, 10);
    await db.updateUserPassword(adminUser.id, hash);
    console.log('[AUTH] Parola admin actualizata din ADMIN_PASSWORD');
  }

  // Seed de test (doar pentru rularea testelor): SEED_TEST=1
  if (process.env.SEED_TEST === '1') {
    await db.pool.query(
      "INSERT INTO devices (imei, name, plate, last_seen) VALUES ('TEST111','Camion A','B-111-AAA',NOW()),('TEST222','Camion B','B-222-BBB',NOW()) ON CONFLICT (imei) DO NOTHING"
    );
    const cnt = await db.pool.query("SELECT COUNT(*)::int AS n FROM positions WHERE imei = 'TEST111'");
    if (cnt.rows[0].n === 0) {
      const recs = []; let lat = 44.4268, lng = 26.1025, fuel = 300; const start = Date.now() - 2*3600*1000;
      for (let i = 0; i < 60; i++) {
        const ts = new Date(start + i*120*1000);
        let speed;
        if (i >= 20 && i < 25) speed = 0;        // oprire ~8 min
        else if (i >= 30 && i < 35) speed = 100; // depășire viteză
        else speed = 40 + ((i*7) % 50);
        if (speed > 0) { lat += 0.004; lng += 0.006; }
        if (i === 40) fuel += 50;                // alimentare
        else if (i === 50) fuel -= 30;           // scădere/furt
        else if (speed > 0) fuel -= 0.5;
        recs.push({ timestamp: ts, priority: 1, gps: { latitude: lat, longitude: lng, altitude: 80, angle: 45, speed, satellites: 10 }, io: { ignition: speed > 0 ? 1 : 0, can_fuel_level_liters: Math.round(fuel) } });
      }
      await db.insertPositions('TEST111', recs);
      console.log('[SEED] ' + recs.length + ' poziții de test pentru TEST111');
    }
    console.log('[SEED] Vehicule de test inserate (SEED_TEST=1)');
  }

  // Încarcă ultimele poziții din DB în memorie
  const lastPositions = await db.getLastPositions();
  const allDevices = await db.getDevices();
  const deviceInfoMap = {};
  for (const dev of allDevices) {
    deviceInfoMap[dev.imei] = { name: dev.name, vehicle_type: dev.vehicle_type, plate: dev.plate };
  }
  for (const pos of lastPositions) {
    const info = deviceInfoMap[pos.imei] || {};
    livePositions.set(pos.imei, {
      imei: pos.imei,
      timestamp: pos.timestamp,
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      angle: pos.angle,
      satellites: pos.satellites,
      io: pos.io_data,
      name: info.name || null,
      vehicle_type: info.vehicle_type || null,
      plate: info.plate || null
    });
  }
  console.log(`[DB] ${lastPositions.length} dispozitive încărcate din istoric`);

  // Pornește serverul TCP
  tcpServer.listen(ACTUAL_TCP_PORT, () => {
    console.log(`[TCP] Server activ pe portul ${ACTUAL_TCP_PORT} — aștept dispozitive Teltonika`);
  });

  // Pornește serverul HTTP + WebSocket
  httpServer.listen(ACTUAL_HTTP_PORT, () => {
    console.log(`[HTTP] Interfață web pe portul ${ACTUAL_HTTP_PORT}`);
    console.log(`[WS] WebSocket activ`);
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  GPS Unitip Server — PORNIT (DB embedded, 100% local)');
    console.log(`  TCP (dispozitive): port ${ACTUAL_TCP_PORT}`);
    console.log(`  HTTP (hartă/API):  port ${ACTUAL_HTTP_PORT}`);
    console.log('═══════════════════════════════════════');
  });

  // Întreținere: curăță sesiunile expirate din oră în oră
  setInterval(() => { db.cleanupExpiredSessions().catch(() => {}); }, 60 * 60 * 1000);

  // Retenție opțională pentru poziții (setează POSITION_RETENTION_DAYS în .env ca să o activezi)
  const retentionDays = parseInt(process.env.POSITION_RETENTION_DAYS);
  if (retentionDays > 0) {
    const runRetention = () => db.deleteOldPositions(retentionDays)
      .then(n => { if (n) console.log(`[RETENȚIE] Șterse ${n} poziții mai vechi de ${retentionDays} zile`); })
      .catch(() => {});
    runRetention();
    setInterval(runRetention, 24 * 60 * 60 * 1000);
  }

  // Workere Faza 4: detecție automată curse + alerte expirare documente
  setTimeout(() => runTripDetection().then(n => { if (n) console.log('[TRIPS] ' + n + ' curse detectate'); }), 3000);
  setInterval(() => runTripDetection(), 15 * 60 * 1000);
  setTimeout(() => checkExpiries(), 5000);
  setInterval(() => checkExpiries(), 12 * 60 * 60 * 1000);
}

// Oprire grațioasă (Ctrl+C / kill)
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SHUTDOWN] Semnal ${signal} — închidere...`);
  setTimeout(() => process.exit(0), 4000); // siguranță dacă închiderea se blochează
  try { wss.clients.forEach(c => { try { c.close(); } catch (e) {} }); } catch (e) {}
  try { httpServer.close(); } catch (e) {}
  try { tcpServer.close(); } catch (e) {}
  try { await db.closeDb(); } catch (e) {} // flush PGlite pe disc înainte de exit
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Eroare la pornire:', err);
  process.exit(1);
});
