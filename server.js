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
// Module opționale (export PDF/Excel + programare rapoarte) — tolerante la lipsă, ca să nu pice serverul
let reportExport = null, reportSchedules = null, geocode = null;
try { reportExport = require('./report_export'); } catch (e) { console.warn('[REPORTS] export PDF/Excel indisponibil:', e.message); }
try { reportSchedules = require('./report_schedules'); } catch (e) { console.warn('[REPORTS] programare rapoarte indisponibilă:', e.message); }
try { geocode = require('./geocode'); } catch (e) { console.warn('[GEO] geocodare inversă indisponibilă:', e.message); }

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

// Interfața CAN per-device (FMS pt. FMC650 / standard-LVCAN) — cache scurt, ca să nu lovim DB la fiecare pachet.
const _ifaceCache = new Map(); // imei -> { ts, iface }
const IFACE_TTL = 60000;
async function getDeviceIface(imei) {
  const e = _ifaceCache.get(imei);
  if (e && (Date.now() - e.ts) < IFACE_TTL) return e.iface;
  let iface = null;
  try { iface = await db.getDeviceCanInterface(imei); } catch (err) { iface = null; }
  _ifaceCache.set(imei, { ts: Date.now(), iface });
  return iface;
}
function invalidateIfaceCache(imei) { _ifaceCache.delete(imei); }

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
const ai = require('./ai');
const demoSim = require('./demo-sim');
const tacho = require('./tacho');
let ioCatalog = null;
try { ioCatalog = require('./io_catalog'); } catch (e) { console.warn('[IO_CATALOG] indisponibil:', e.message); }
let agents = null;
try { agents = require('./agents'); } catch (e) { console.warn('[AGENTS] indisponibil:', e.message); }
let billing = null, plans = null;
try { billing = require('./billing'); plans = require('./plans'); } catch (e) { console.warn('[BILLING] indisponibil:', e.message); }
let fleetQuick = null;
try { fleetQuick = require('./fleet_quick'); } catch (e) { console.warn('[AI] euristici locale indisponibile:', e.message); }
const DEMO_SET = new Set(demoSim.DEMO_IMEIS); // vehiculele demo se văd DOAR în contul demo
let demoCompanyId = null;
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
// Ultimele valori CAN cunoscute per imei — pentru carry-forward când motorul e oprit (pachet fără date CAN).
const lastCanIo = new Map(); // imei -> { io: {can_*...}, ts }
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

        // Salvează conexiunea activă
        activeConnections.set(imei, {
          address: clientAddr,
          connectedAt: new Date()
        });

        // Răspunde cu 0x01 = accept IMEDIAT (înainte de orice operație DB)
        socket.write(Buffer.from([0x01]));

        // Înregistrează dispozitivul în DB — asincron, nu blochează handshake-ul
        db.upsertDevice(imei).catch(e => console.error(`[TCP] upsertDevice ${imei}: ${e.message}`));

        // Init mirror connection to Traccar/OpenRemote if enabled
        try { ensureMirrorConnection(imei); } catch(_) {}
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

      const _iface = await getDeviceIface(imei); // 'fms' (FMC650) sau null (standard/LV-CAN)
      const parsed = parseAvlPacket(packet, _iface);

      if (parsed.error) {
        console.error(`[TCP] Eroare parsare de la ${imei}: ${parsed.error}`);
        addDebugEntry({ event: 'error', imei, error: parsed.error });
        socket.write(Buffer.alloc(4, 0)); // răspunde cu 0
        return;
      }

      // ACK IMEDIAT cu numărul de recorduri acceptate — esențial pentru Teltonika.
      // Se trimite ÎNAINTE de scrierea în DB, ca dispozitivul să nu retrimită / piardă date.
      { const _ack = Buffer.alloc(4); _ack.writeUInt32BE(parsed.numberOfRecords); socket.write(_ack); }

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
          // FMS (FMC650): valorile vin DEJA finale → NU aplicăm convertCanValue (scalările LV-CAN ar strica valorile).
          // Excepție: litrii (fuel/AdBlue) vin în device ca ×10 (rezoluție 0,1 L) → /10. (Verificabil pe pachet real.)
          if (_iface === 'fms') {
            if (typeof record.io.can_fuel_level_liters === 'number') record.io.can_fuel_level_liters = record.io.can_fuel_level_liters / 10;
            if (typeof record.io.can_adblue_level_liters === 'number') record.io.can_adblue_level_liters = record.io.can_adblue_level_liters / 10;
          } else {
            for (const key of Object.keys(record.io)) {
              if (key.startsWith('can_')) {
                record.io[key] = convertCanValue(key, record.io[key]);
              }
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
        // ── Carry-forward CAN: când motorul e oprit, pachetul nu conține chei can_* → păstrăm ultimele valori ──
        const _freshCan = {};
        for (const k of Object.keys(liveData.io)) { if (k.startsWith('can_')) _freshCan[k] = liveData.io[k]; }
        if (Object.keys(_freshCan).length > 0) {
          lastCanIo.set(imei, { io: _freshCan, ts: lastRecord.timestamp }); // motor pornit → snapshot proaspăt
          liveData.can_stale = false;
        } else {
          const _snap = lastCanIo.get(imei);
          if (_snap) {
            liveData.io = { ...liveData.io, ..._snap.io }; // clonă + merge (doar can_*, nu atinge ignition/GPS)
            liveData.can_stale = true;
            liveData.can_snapshot_ts = _snap.ts; // marcaj: din ultimul pachet cu motorul pornit
          }
        }
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

      // (ACK-ul a fost deja trimis imediat după parsare, mai sus)
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
app.use(express.json({ limit: '6mb', verify: (req, res, buf) => { if (req.originalUrl === '/api/billing/webhook') req.rawBody = buf; } })); // limită mărită pt. upload .DDD; raw body pt. semnătura webhook Stripe

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
app.use(refreshAuth); // re-sincronizează rol/companie din DB (sesiuni vechi cu rol învechit)

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

// ─── Site public (landing) la "/" · aplicația la "/app" ───
// Fără cache pentru shell-ul aplicației + service worker, ca actualizările să apară imediat
// (altfel un CDN/edge ca Cloudflare poate servi versiuni vechi, iar SW-ul nu se mai actualizează).
const NO_CACHE = 'no-cache, no-store, must-revalidate';
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => { res.set('Cache-Control', NO_CACHE); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/sw.js', (req, res) => { res.set('Cache-Control', NO_CACHE); res.type('application/javascript'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });

// Healthcheck public (monitorizare/uptime + Railway) — verifică și conexiunea la DB
const _startedAt = Date.now();
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.pool.query('SELECT 1'); dbOk = true; } catch (e) {}
  res.set('Cache-Control', 'no-store');
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    mode: process.env.DATABASE_URL ? 'postgres' : 'pglite',
    uptime_s: Math.round((Date.now() - _startedAt) / 1000)
  });
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Model roluri & permisiuni (RBAC) ───
// superadmin = proprietar platformă (vede/administrează TOATE companiile)
// company_admin/admin = administrator al UNEI companii (acțiunile sale sunt scopate pe company_id)
const ROLE_PERMISSIONS = {
  superadmin:    { manageUsers: true,  manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: true,  manageCompanies: true },
  company_admin: { manageUsers: true,  manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: true  },
  admin:         { manageUsers: true,  manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: true  },
  manager:    { manageUsers: false, manageFleet: true,  sendCommands: true,  viewReports: true,  ackAlerts: true,  viewAll: true,  viewAudit: false },
  dispatcher: { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: true,  viewAll: false, viewAudit: false },
  client:     { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: false, viewAll: false, viewAudit: false },
  viewer:     { manageUsers: false, manageFleet: false, sendCommands: false, viewReports: true,  ackAlerts: false, viewAll: false, viewAudit: false }
};
const VALID_ROLES = Object.keys(ROLE_PERMISSIONS);
// roluri pe care un company_admin le poate atribui (NU poate crea superadmini/alți company_admin peste el)
const COMPANY_ASSIGNABLE_ROLES = ['manager', 'dispatcher', 'client', 'viewer']; // company_admin se acordă DOAR de super-admin (fără escaladare intra-tenant)
function permsFor(role) { return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer; }
function hasPerm(role, perm) { return !!permsFor(role)[perm]; }
function isSuper(role) { return role === 'superadmin'; }

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket ? req.socket.remoteAddress : null;
}

// Identitatea curentă: cheie API (req.apiAuth) SAU sesiune cookie (req.session).
// IMPORTANT: rolul + compania se iau din req._freshAuth (DB, prin refreshAuth) dacă există,
// ca sesiunile vechi (rol învechit după schimbarea rolului) să NU mai dea scope greșit.
function getAuth(req) {
  const f = req._freshAuth;
  if (req.apiAuth) return f ? Object.assign({}, req.apiAuth, { role: f.role, companyId: f.companyId }) : req.apiAuth;
  if (req.session && req.session.userId) {
    return {
      userId: req.session.userId, username: req.session.username,
      role: f ? f.role : req.session.role,
      companyId: f ? f.companyId : req.session.companyId,
      viaApiKey: false
    };
  }
  return null;
}

// Re-sincronizează rolul + compania din DB (cache 30s) → imun la sesiuni cu rol învechit
const roleCache = new Map(); // userId -> { ts, role, companyId }
function invalidateRoleCache(userId) { if (userId == null) roleCache.clear(); else roleCache.delete(userId); }
async function refreshAuth(req, res, next) {
  try {
    if (!req.path || req.path.indexOf('/api') !== 0) return next();
    const uid = req.apiAuth ? req.apiAuth.userId : (req.session && req.session.userId);
    if (uid) {
      let c = roleCache.get(uid);
      if (!c || Date.now() - c.ts > 30000) {
        const u = await db.getUserById(uid);
        if (u) { c = { ts: Date.now(), role: u.role, companyId: u.company_id }; roleCache.set(uid, c); }
      }
      if (c) req._freshAuth = { role: c.role, companyId: c.companyId };
    }
  } catch (e) { /* fallback la sesiune */ }
  next();
}

// Companie curentă a request-ului (din sesiune/cheie API, cu fallback la DB pentru sesiuni vechi)
async function resolveCompanyId(a) {
  if (!a || !a.userId) return null;
  if (a.companyId !== undefined && a.companyId !== null) return a.companyId;
  if (isSuper(a.role)) return null; // platformă
  try { const u = await db.getUserById(a.userId); return u ? u.company_id : null; } catch (e) { return null; }
}

function auditReq(req, action, entity, entityId, details) {
  const a = getAuth(req) || {};
  db.logAudit({
    userId: a.userId, username: a.username,
    action, entity, entityId, details, ip: clientIp(req),
    companyId: (req.companyId != null ? req.companyId : a.companyId)
  });
}

// Cache acces (IMEI-uri permise) per utilizator — TTL scurt, ca să nu lovim DB la fiecare poll
const accessCache = new Map(); // userId -> { ts, imeis: Set|null }
const ACCESS_TTL = 15000;
async function getAllowedImeiSet(userId, role, companyId) {
  if (isSuper(role)) return null; // super-admin: toate companiile
  const cached = accessCache.get(userId);
  if (cached && (Date.now() - cached.ts) < ACCESS_TTL) return cached.imeis;
  let set;
  if (hasPerm(role, 'viewAll')) {
    // viewAll = toate vehiculele COMPANIEI (nu globale)
    set = new Set(companyId != null ? await db.getCompanyImeis(companyId) : []);
  } else {
    set = new Set(await db.computeAllowedImeis(userId));
  }
  accessCache.set(userId, { ts: Date.now(), imeis: set });
  return set;
}
function invalidateAccessCache(userId) {
  if (userId === undefined || userId === null) { accessCache.clear(); invalidateRoleCache(); }
  else { accessCache.delete(userId); invalidateRoleCache(userId); }
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
        req.apiAuth = { userId: user.id, username: user.username, role: user.role, companyId: user.company_id, viaApiKey: true };
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
const requireSuperadmin = requirePerm('manageCompanies');

// Atașează compania curentă (req.companyId) — pentru endpoint-urile care nu folosesc withScope
async function withCompany(req, res, next) {
  try {
    const a = req.auth || getAuth(req) || {};
    req.companyId = await resolveCompanyId(a);
    req.isSuper = isSuper(a.role);
    if (await _accessBlocked(req, res)) return;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Calculează IMEI-urile permise pe request (req.allowedImeis == null => acces la toate)
async function withScope(req, res, next) {
  try {
    const a = req.auth || getAuth(req) || {};
    req.companyId = await resolveCompanyId(a);
    req.isSuper = isSuper(a.role);
    if (await _accessBlocked(req, res)) return;
    req.allowedImeis = await getAllowedImeiSet(a.userId, a.role, req.companyId);
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
function canAccessImei(req, imei) {
  // vehiculele demo sunt vizibile DOAR în contul demo (nu se amestecă în flota reală/super-admin)
  if (DEMO_SET.has(imei) && req.companyId !== demoCompanyId) return false;
  return req.allowedImeis == null || req.allowedImeis.has(imei);
}

// Verifică dacă un utilizator țintă aparține companiei celui care face cererea (super-adminul trece peste tot)
async function sameCompanyUser(req, targetId) {
  if (req.isSuper) return true;
  const u = await db.getUserById(targetId);
  return !!(u && u.company_id != null && u.company_id === req.companyId);
}
// Verifică proprietatea pe o entitate (driver/group/geofence/alert/maintenance) pentru update/delete
async function ownsRow(req, table, id) {
  if (req.isSuper) return true;
  const cid = await db.getRowCompany(table, id);
  return cid != null && cid === req.companyId;
}
// Gating pe funcții (module) controlate per-companie de super-admin (companies.settings.features).
// Necesită req.companyId + req.isSuper (rulează DUPĂ withCompany/withScope). Super-admin = toate funcțiile.
function requireFeature(key) {
  return async function (req, res, next) {
    try {
      if (req.isSuper || req.companyId == null) return next();
      const co = await db.getCompanyById(req.companyId);
      if (co && plans && plans.featuresFor(co)[key]) return next();
      return res.status(403).json({ error: 'feature_disabled', feature: key, message: 'Funcție indisponibilă pentru compania ta. Contactați administratorul platformei.' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}

// ─── Acces pe bază de plată (manual de super-admin; pregătit pentru Stripe) ───
const GRACE_BUSINESS_DAYS = 5;
// +n luni calendaristice (gestionează 30/31: 31 ian + 1 lună = 28/29 feb)
function _addMonthsMs(ms, n) {
  const d = new Date(ms); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}
// +n zile lucrătoare (sare peste sâmbătă/duminică)
function _addBusinessDaysMs(ms, n) {
  const d = new Date(ms); let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) added++; }
  return d.getTime();
}
// Starea de acces a unei companii: unlimited (fără dată) / active / grace / expired
function companyAccessStatus(company) {
  const until = (company && company.access_until != null) ? Number(company.access_until) : null;
  if (until == null || !Number.isFinite(until)) return { status: 'unlimited', access_until: null, grace_until: null };
  const now = Date.now();
  const graceUntil = _addBusinessDaysMs(until, GRACE_BUSINESS_DAYS);
  let status = 'active';
  if (now > graceUntil) status = 'expired';
  else if (now > until) status = 'grace';
  return { status, access_until: until, grace_until: graceUntil };
}
// Cache scurt al stării de acces — evită un getCompanyById pe FIECARE request. Invalidat la schimbarea accesului.
const _accessCache = new Map();
function _invalidateAccessCache(companyId) { _accessCache.delete(companyId); }
async function _accessStatusCached(companyId) {
  let e = _accessCache.get(companyId);
  if (!e || (Date.now() - e.ts) >= 20000) {
    let until = null;
    try { const co = await db.getCompanyById(companyId); until = co ? (co.access_until != null ? Number(co.access_until) : null) : null; } catch (err) { until = null; }
    e = { until: until, ts: Date.now() };
    _accessCache.set(companyId, e);
  }
  return companyAccessStatus({ access_until: e.until });
}
// Gate central: blochează (402) requesturile companiilor EXPIRATE (non-super) — sesiuni vechi, chei API, orice endpoint de date.
// Allowlist ca userul blocat să-și poată vedea starea / plăti: /api/me, /api/logout, /api/billing/*.
async function _accessBlocked(req, res) {
  if (req.isSuper || req.companyId == null) return false;
  const p = req.path || req.originalUrl || '';
  if (p === '/api/me' || p === '/api/logout' || p.indexOf('/api/billing') === 0) return false;
  try {
    if ((await _accessStatusCached(req.companyId)).status === 'expired') {
      res.status(402).json({ error: 'Abonament expirat — acces suspendat. Contactați furnizorul.', access_expired: true });
      return true;
    }
  } catch (e) { /* la eroare nu blocăm */ }
  return false;
}

// Rezolvă vehiculele țintă pentru rapoarte (respectă accesul). null => 403.
async function resolveReportImeis(req) {
  const imeiParam = req.query.imei || (req.body && req.body.imei);
  if (imeiParam) {
    const list = String(imeiParam).split(',').map(s => s.trim()).filter(Boolean);
    for (const im of list) if (!canAccessImei(req, im)) return null;
    return list;
  }
  if (req.allowedImeis == null) {
    let devs = await db.getDevices();
    if (req.companyId !== demoCompanyId) devs = devs.filter(d => !DEMO_SET.has(d.imei)); // exclude demo pt. flota reală
    return devs.map(d => d.imei);
  }
  return Array.from(req.allowedImeis).filter(im => canAccessImei(req, im));
}

// Filtru opțional pe companie pentru super-admin (dashboard + agenți): restrânge scope-ul la o companie.
// Ceilalți utilizatori sunt deja scopați și ignoră parametrul.
async function applyCompanyFilter(req) {
  if (!req.isSuper) return;
  const raw = (req.query && req.query.companyId) || (req.body && req.body.companyId);
  if (raw == null || raw === '') return;
  const cid = parseInt(raw, 10);
  if (isNaN(cid)) return;
  req.filterCompanyId = cid;
  try { req.allowedImeis = new Set(await db.getCompanyImeis(cid)); } catch (e) { req.allowedImeis = new Set(); }
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

    // Acces pe bază de plată: blochează login-ul dacă abonamentul companiei a expirat (super-adminul e exceptat).
    // Încărcăm compania o singură dată și reutilizăm pentru răspuns (features/access — ca să apară bannerul imediat).
    let company = null, features = null, access = null;
    if (user.company_id != null) {
      try {
        const co = await db.getCompanyById(user.company_id);
        if (co) {
          access = companyAccessStatus(co);
          if (!isSuper(user.role) && access.status === 'expired') {
            return res.status(402).json({ error: 'Abonament expirat — accesul este suspendat până la reînnoire. Contactați furnizorul.', access_expired: true });
          }
          company = { id: co.id, name: co.name, is_demo: !!co.is_demo };
          features = plans ? plans.featuresFor(co) : null;
        }
      } catch (e) { /* dacă verificarea eșuează, lăsăm login-ul să continue */ }
    }
    if (!features) features = { agents: true, ai_assistant: true, etransport: true, tahograf: true };

    clearLoginFails(ip);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.companyId = user.company_id != null ? user.company_id : null;

    db.setUserLastLogin(user.id).catch(() => {});
    db.logAudit({ userId: user.id, username: user.username, action: 'login', entity: 'session', ip });

    res.json({ username: user.username, role: user.role, permissions: permsFor(user.role), companyId: user.company_id != null ? user.company_id : null, isSuper: isSuper(user.role), company, features, access });
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

// ─── Setări sistem (cheie-valoare în settings) cu cache scurt ───
let _sysCache = null, _sysTs = 0;
async function getSystemSettings() {
  if (_sysCache && (Date.now() - _sysTs) < 15000) return _sysCache;
  let ann = '', auto = null, off = null, spd = null;
  try { [ann, auto, off, spd] = await Promise.all([db.getSetting('announcement'), db.getSetting('agents_auto'), db.getSetting('offline_minutes'), db.getSetting('default_speed_limit')]); } catch (e) {}
  _sysCache = { announcement: ann || '', agents_auto: auto !== 'off', offline_minutes: (Number(off) > 0 ? Number(off) : 65), default_speed_limit: (Number(spd) > 0 ? Number(spd) : 90) };
  _sysTs = Date.now();
  return _sysCache;
}
function invalidateSystemSettings() { _sysCache = null; }

// Utilizatorul curent (merge atât cu sesiune cât și cu cheie API)
app.get('/api/me', async (req, res) => {
  const a = getAuth(req);
  if (!a) return res.status(401).json({ error: 'Neautorizat' });
  let company = null, features = null, access = null;
  try {
    const cid = await resolveCompanyId(a);
    if (cid != null) { const c = await db.getCompanyById(cid); if (c) { company = { id: c.id, name: c.name, is_demo: !!c.is_demo }; features = plans ? plans.featuresFor(c) : null; access = companyAccessStatus(c); } }
  } catch (e) { /* ignore */ }
  // super-admin (fără companie) sau plan necunoscut → toate funcțiile disponibile
  if (!features) features = { agents: true, ai_assistant: true, etransport: true, tahograf: true };
  let sys = { announcement: '', offline_minutes: 65 };
  try { const s = await getSystemSettings(); sys = { announcement: s.announcement, offline_minutes: s.offline_minutes }; } catch (e) {}
  res.json({
    username: a.username, role: a.role, permissions: permsFor(a.role), viaApiKey: !!a.viaApiKey,
    isSuper: isSuper(a.role), companyId: company ? company.id : null, company, features, access,
    announcement: sys.announcement, offline_minutes: sys.offline_minutes
  });
});

// Demo: autentificare rapidă în contul demo (read-only, companie izolată) — pentru butonul de pe landing
app.post('/api/demo/login', async (req, res) => {
  try {
    if (process.env.DEMO_DISABLED === 'true') return res.status(404).json({ error: 'Demo dezactivat' });
    const u = await db.getUserByUsername('demo');
    if (!u) return res.status(404).json({ error: 'Demo indisponibil' });
    req.session.userId = u.id;
    req.session.username = u.username;
    req.session.role = u.role;
    req.session.companyId = u.company_id != null ? u.company_id : null;
    res.json({ ok: true, username: u.username, role: u.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Managementul utilizatorilor (doar admin) ───

app.get('/api/users', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    // company_admin vede doar userii companiei lui; super-admin vede tot (sau filtrat după ?company)
    const scope = req.isSuper ? (req.query.company ? parseInt(req.query.company) : null) : req.companyId;
    res.json(await db.getUsers(scope));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listă slabă (fără COUNT-uri pe acces) — pentru selectoarele de mutare.
app.get('/api/users/lite', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const scope = req.isSuper ? (req.query.company ? parseInt(req.query.company) : null) : req.companyId;
    res.json(await db.getUsersLite(scope));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, withCompany, async (req, res) => {
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
    // company_admin poate atribui doar roluri din companie (nu superadmin); super-admin poate orice
    const allowed = req.isSuper ? VALID_ROLES : COMPANY_ASSIGNABLE_ROLES;
    const finalRole = allowed.includes(role) ? role : 'viewer';
    // compania noului user: a adminului; super-adminul poate specifica ?company / body.company_id
    let companyId = req.companyId;
    if (req.isSuper) companyId = (req.body.company_id != null ? parseInt(req.body.company_id) : null);
    if (!isSuper(finalRole) && companyId == null) {
      return res.status(400).json({ error: 'Selectează compania pentru utilizator' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username-ul există deja' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash, finalRole, { full_name, email, phone, company_id: companyId });
    auditReq(req, 'create', 'user', user.id, { username, role: finalRole, company_id: companyId });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await sameCompanyUser(req, id))) return res.status(403).json({ error: 'Acces interzis' });
    const { role, full_name, email, phone, active } = req.body;
    const allowed = req.isSuper ? VALID_ROLES : COMPANY_ASSIGNABLE_ROLES;
    if (role !== undefined && role !== null && !allowed.includes(role)) {
      return res.status(400).json({ error: 'Rol invalid' });
    }
    // Protecție: nu te poți dezactiva sau retrograda pe tine dintr-un rol de administrare
    const adminRoles = ['superadmin', 'company_admin', 'admin'];
    if (id === req.auth.userId && (active === false || (role && !adminRoles.includes(role)))) {
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

app.post('/api/users/:id/password', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await sameCompanyUser(req, id))) return res.status(403).json({ error: 'Acces interzis' });
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

app.get('/api/users/:id/access', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await sameCompanyUser(req, id))) return res.status(403).json({ error: 'Acces interzis' });
    res.json(await db.getUserAccess(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/access', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await sameCompanyUser(req, id))) return res.status(403).json({ error: 'Acces interzis' });
    const { devices, groups } = req.body;
    await db.setUserAccess(id, devices, groups);
    invalidateAccessCache(id);
    auditReq(req, 'set_access', 'user', id, { devices: (devices || []).length, groups: (groups || []).length });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.auth.userId) {
      return res.status(400).json({ error: 'Nu te poți șterge pe tine' });
    }
    if (!(await sameCompanyUser(req, id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteUser(id);
    invalidateAccessCache(id);
    auditReq(req, 'delete', 'user', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit log (doar admin) — company_admin vede doar compania lui; super-admin vede tot
app.get('/api/audit', requireAuth, requirePerm('viewAudit'), withCompany, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    res.json(await db.getAuditLog(limit, offset, req.isSuper ? null : req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Chei API (doar admin) — pentru integrări programatice ───
app.get('/api/apikeys', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try { res.json(await db.getApiKeys(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/apikeys', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = parseInt(req.body.userId);
    if (!userId) return res.status(400).json({ error: 'userId este obligatoriu (cheia moștenește rolul și accesul acelui utilizator)' });
    if (!(await sameCompanyUser(req, userId))) return res.status(403).json({ error: 'Utilizatorul nu este din compania ta' });
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

app.delete('/api/apikeys/:id', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.isSuper) {
      const cid = await db.getApiKeyCompany(id);
      if (cid !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    }
    await db.revokeApiKey(id);
    auditReq(req, 'revoke', 'apikey', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI: asistent flotă + rezumate rapoarte (Claude) ───
function _fleetSnapshot(req) {
  // izolare strictă: doar vehiculele accesibile (companie + demo ascuns pt. flota reală/super-admin)
  let positions = Array.from(livePositions.values()).filter(p => canAccessImei(req, p.imei));
  return positions.slice(0, 80).map(p => {
    const io = p.io || {};
    return {
      imei: p.imei,
      nume: p.name || p.imei, nr: p.plate || '',
      viteza_kmh: Math.round(p.speed || 0),
      lat: Number(p.latitude) ? Number(p.latitude).toFixed(5) : null,
      lng: Number(p.longitude) ? Number(p.longitude).toFixed(5) : null,
      contact: io.ignition === 1 ? 'pornit' : (io.ignition === 0 ? 'oprit' : '?'),
      combustibil_l: io.can_fuel_level_liters,
      ultima_actualizare: p.timestamp
    };
  });
}

app.get('/api/ai/status', requireAuth, (req, res) => res.json({ enabled: ai.aiEnabled(), model: ai.AI_MODEL }));
// Super-admin: setează/șterge cheia Anthropic din UI (stocată în DB, fără editare .env)
app.post('/api/ai/config', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const key = (req.body.key || '').toString().trim();
    if (key && !/^sk-ant-/.test(key)) return res.status(400).json({ error: 'Cheie invalidă (trebuie să înceapă cu „sk-ant-")' });
    await db.setSetting('anthropic_api_key', key);
    ai.setKey(key);
    auditReq(req, 'update', 'ai_config', null, { configured: !!key });
    res.json({ ok: true, enabled: ai.aiEnabled() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Super-admin: limită lunară de tokeni AI per companie (0/gol = nelimitat)
app.put('/api/companies/:id/ai-limit', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await db.getCompanyById(id))) return res.status(404).json({ error: 'Companie inexistentă' });
    await db.setCompanyAiLimit(id, req.body.limit);
    auditReq(req, 'set_ai_limit', 'company', id, { limit: req.body.limit });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Limită AI lunară per companie = număr de PROMPTURI (apeluri AI) / 30 zile, gestionată de super-admin.
// 0/null = nelimitat; super-admin/platformă fără limită. Întrebările rapide (locale) NU consumă din limită.
async function aiLimitReached(companyId) {
  if (companyId == null) return false;
  try {
    const co = await db.getCompanyById(companyId);
    const lim = co && co.ai_monthly_limit;
    if (!lim || lim <= 0) return false;
    return (await db.getAiCallsForCompany(companyId, 30)) >= lim;
  } catch (e) { return false; }
}

app.post('/api/ai/chat', requireAuth, withScope, requireFeature('ai_assistant'), async (req, res) => {
  try {
    const message = (req.body.message || '').toString().slice(0, 2000).trim();
    if (!message) return res.status(400).json({ error: 'Mesaj gol' });
    const snapshot = _fleetSnapshot(req);
    // Clientul vrea LOCAȚIA (adresă), nu coordonate: îmbogățim cu adresă (geocodare inversă) și scoatem lat/lng.
    try {
      if (geocode) await geocode.warm(snapshot.map(v => ({ lat: Number(v.lat), lng: Number(v.lng) })));
      for (const v of snapshot) {
        const lbl = geocode ? geocode.peek(Number(v.lat), Number(v.lng)) : null;
        if (lbl) v.locatie = lbl;
        delete v.lat; delete v.lng;
      }
    } catch (e) { for (const v of snapshot) { delete v.lat; delete v.lng; } }
    let today = [];
    try {
      const allImeis = (await db.getDevices()).map(d => d.imei).filter(imei => canAccessImei(req, imei));
      const from = new Date(); from.setHours(0, 0, 0, 0);
      today = await db.getTripsSummaryForImeis(allImeis, from.toISOString(), new Date().toISOString());
    } catch (e) { /* fără sumar curse */ }

    // 1) Întâi euristici LOCALE (zero tokeni AI; merge chiar fără cheie configurată)
    if (fleetQuick) {
      const intent = fleetQuick.detectIntent(message);
      if (intent) {
        const a = fleetQuick.answer(intent, { snapshot, today, now: Date.now() });
        auditReq(req, 'ai_local', 'assistant', null, { intent });
        return res.json({ reply: a.reply, source: 'local' });
      }
    }
    // 2) Pentru întrebări libere → Claude (dacă e configurat)
    if (!ai.aiEnabled()) return res.json({ reply: 'Întrebările rapide (unde sunt vehiculele, km azi, oprite, cel mai rapid, status) merg instant, fără AI. Pentru întrebări libere, activează asistentul AI (cheie Anthropic).', disabled: true });
    if (await aiLimitReached(req.companyId)) return res.json({ reply: 'Compania ta a atins limita lunară de AI. Întrebările rapide rămân disponibile; pentru mai mult, contactează administratorul platformei.', limited: true });
    snapshot.forEach(v => { delete v.imei; }); // nu trimitem imei la Claude (folosește numele)

    const system = [
      'Ești asistentul AI al platformei RA Track (monitorizare GPS flote). Răspunzi în limba română, clar și concis, DOAR pe baza datelor furnizate. Dacă lipsește informația, spui sincer că nu o ai — nu inventezi.',
      'REGULĂ CHEIE: clientul vrea LOCAȚIA, nu coordonate. NU afișa NICIODATĂ coordonate GPS brute (lat/lng). Folosește adresa din câmpul „locatie"; dacă lipsește, scrie „locație indisponibilă".',
      'FORMAT (Markdown plăcut): un titlu scurt cu **bold**. Pentru fiecare vehicul, o linie „🚚 **Nume** (Nr)", apoi 2-4 sub-puncte cu „• ": 📍 Locație (adresa), 🚦 Stare (în mișcare X km/h / oprit / staționat), ⛽ Combustibil (doar dacă există), 🕒 Ultima actualizare (dată și oră prietenoasă). Fără tabele, fără coordonate, fără text de umplutură.',
      'Referă-te la vehicule prin nume/număr.'
    ].join('\n');
    const context = 'STARE FLOTĂ (live):\n' + JSON.stringify(snapshot) + '\n\nCURSE AZI (km/vehicul):\n' + JSON.stringify(today);
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-6).filter(m => m && m.role && m.content) : [];
    const messages = [...history, { role: 'user', content: context + '\n\nÎntrebarea utilizatorului: ' + message }];
    const reply = await ai.callClaude({ system, messages, maxTokens: 700, onUsage: u => db.recordAiUsage(req.companyId, 'chat', u).catch(() => {}) });
    auditReq(req, 'ai_chat', 'assistant', null, { len: message.length });
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'AI: ' + e.message });
  }
});

app.post('/api/ai/report-summary', requireAuth, requirePerm('viewReports'), withScope, requireFeature('ai_assistant'), async (req, res) => {
  try {
    if (!ai.aiEnabled()) return res.json({ summary: 'Asistentul AI nu este configurat (ANTHROPIC_API_KEY lipsă).', disabled: true });
    if (await aiLimitReached(req.companyId)) return res.json({ summary: 'Compania ta a atins limita lunară de AI. Contactează administratorul platformei.', limited: true });
    const report = req.body.report;
    if (!report) return res.status(400).json({ error: 'Lipsește raportul' });
    const compact = JSON.stringify(report).slice(0, 7000);
    const system = 'Ești analist de flotă. Rezumi un raport în limba română, în stil executiv: 4-6 puncte scurte, cu cifrele cheie (km, ore, opriri, consum, viteze). Doar pe baza datelor. Fără introduceri lungi.';
    const summary = await ai.callClaude({ system, messages: [{ role: 'user', content: 'Tip raport: ' + (req.body.type || '') + '\nDate (JSON):\n' + compact + '\n\nScrie rezumatul executiv:' }], maxTokens: 600, onUsage: u => db.recordAiUsage(req.companyId, 'report', u).catch(() => {}) });
    auditReq(req, 'ai_report', 'assistant', null, { type: req.body.type });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: 'AI: ' + e.message });
  }
});

// ─── Agenți AI (RA Watch etc.) ───
// Helper: lista agenților activi pentru compania userului (plan + override settings)
async function _getEnabledAgents(companyId) {
  if (!plans || !plans.enabledAgentsFor) return agents ? Object.keys(agents.AGENTS) : [];
  if (companyId == null) return agents ? Object.keys(agents.AGENTS) : []; // super-admin fără companie → vede tot
  try { const co = await db.getCompanyById(companyId); return plans.enabledAgentsFor(co); } catch (e) { return []; }
}
// SPECS canonice — sursă unică de adevăr pentru reader + writer (anti-divergență)
const ALERT_THRESHOLD_SPECS = [
  { k: 'offlineMin', min: 5, max: 1440, round: true },     // RA Watch — offline (min)
  { k: 'fuelDropL', min: 1, max: 1000, round: true },      // RA Watch — scădere combustibil (L)
  { k: 'idleMaxMin', min: 5, max: 1440, round: true },     // RA Watch — ralanti prelungit (min)
  { k: 'ecoScoreMin', min: 0, max: 100, round: true },     // RA Optimize — scor minim eco-driving
  { k: 'serviceSoonKm', min: 100, max: 50000, round: true } // RA Care — km până la scadență
];
// Praguri alertă (RA Watch + RA Optimize + RA Care) — citite din companies.settings.alert_thresholds; fallback la defaulturi (agents.js)
function _alertThresholdsFromSettings(settings) {
  const s = (settings && (typeof settings === 'string' ? (function () { try { return JSON.parse(settings); } catch (e) { return {}; } })() : settings)) || {};
  const t = s.alert_thresholds || {};
  const out = {};
  ALERT_THRESHOLD_SPECS.forEach(function (sp) {
    const n = Number(t[sp.k]);
    if (Number.isFinite(n) && n >= sp.min && n <= sp.max) out[sp.k] = sp.round ? Math.round(n) : n;
  });
  return out;
}
async function _getAlertThresholds(companyId) {
  if (companyId == null) return {};
  try { const co = await db.getCompanyById(companyId); return _alertThresholdsFromSettings(co && co.settings); } catch (e) { return {}; }
}
app.get('/api/agents', requireAuth, withCompany, async (req, res) => {
  if (!agents) return res.json({ agents: [] });
  const enabled = await _getEnabledAgents(req.companyId);
  res.json({ agents: enabled.filter(k => agents.AGENTS[k]).map(function (k) { return { key: k, name: agents.AGENTS[k].name, desc: agents.AGENTS[k].desc }; }), enabledKeys: enabled });
});
app.post('/api/agents/run', requireAuth, withScope, async (req, res) => {
  try {
    if (!agents) return res.status(503).json({ error: 'Agenții indisponibili' });
    await applyCompanyFilter(req);
    const imeis = await resolveReportImeis(req);
    if (!imeis) return res.status(403).json({ error: 'Acces interzis' });
    const which = (req.body && req.body.agent) || (req.query && req.query.agent) || 'all';
    if (which !== 'all' && !agents.AGENTS[which]) return res.status(400).json({ error: 'Agent necunoscut: ' + which });
    const storeCompany = (req.isSuper && req.filterCompanyId != null) ? req.filterCompanyId : req.companyId;
    // GATE: agentul cerut trebuie să fie activ pentru compania de stocare (plan + override)
    const enabled = await _getEnabledAgents(storeCompany);
    if (which !== 'all' && enabled.indexOf(which) < 0) return res.status(403).json({ error: 'Agentul „' + which + '" nu e inclus în planul/setările companiei' });
    if (which === 'all' && !enabled.length) return res.json({ findings: [], aiSummary: null, stored: 0, message: 'Niciun agent activ pe acest plan' });
    const alertThresholds = await _getAlertThresholds(storeCompany);
    const base = { db, imeis, livePositions, companyId: storeCompany, defaultSpeedLimit: (await getSystemSettings()).default_speed_limit, alertThresholds: alertThresholds };
    const findings = (which === 'all' ? await agents.runAll(base, enabled) : await agents.runAgent(which, base)).findings || [];
    let stored = 0;
    for (const f of findings) { const r = await db.createAgentFinding(Object.assign({}, f, { companyId: storeCompany })); if (r) stored++; }
    let aiSummary = null;
    if (ai && ai.aiEnabled() && findings.length) {
      try {
        const system = 'Ești coordonatorul agenților AI ai unei flote de transport (RA Watch, RA Care, RA Optimize, RA Compliance, RA Client). Primești constatările lor de azi. Scrie un rezumat scurt (2-4 propoziții) în limba română care prioritizează urgențele (furt combustibil, service depășit, încălcarea orelor de condus) și recomandă acțiuni concrete. Fără introduceri lungi.';
        aiSummary = await ai.callClaude({ system, messages: [{ role: 'user', content: 'Constatări:\n' + JSON.stringify(findings.map(f => ({ a: f.agent, sev: f.severity, t: f.title }))) }], maxTokens: 400, onUsage: u => db.recordAiUsage(storeCompany, 'agents', u).catch(() => {}) });
      } catch (e) { /* AI opțional */ }
    }
    auditReq(req, 'run', 'agent', which, { found: findings.length, stored });
    res.json({ findings, aiSummary, stored });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/agents/findings', requireAuth, withCompany, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    const cid = req.isSuper ? (req.filterCompanyId != null ? req.filterCompanyId : null) : req.companyId;
    res.json(await db.getAgentFindings(cid, 80));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/agents/findings/:id/:action', requireAuth, withCompany, async (req, res) => {
  try {
    const status = req.params.action === 'dismiss' ? 'dismissed' : 'acknowledged';
    const ok = await db.updateAgentFinding(req.params.id, status, req.isSuper ? null : req.companyId);
    if (!ok) return res.status(404).json({ error: 'Inexistent' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// RA Dispatch: vehicule disponibile aproape de o destinație (clasate după distanță + ETA estimativ)
app.get('/api/dispatch/suggest', requireAuth, withScope, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'Coordonate (lat/lon) necesare' });
    const now = Date.now();
    const list = [];
    for (const [imei, live] of livePositions) {
      if (!canAccessImei(req, imei)) continue;
      if (!live || live.latitude == null || live.longitude == null || !live.timestamp) continue;
      const ageMin = (now - new Date(live.timestamp).getTime()) / 60000;
      const online = ageMin < 65; // 1h + tampon: parcate care trimit o dată/oră rămân „online"/Oprit
      const stopped = (live.speed || 0) <= 3;
      const distKm = haversineDistance(lat, lon, live.latitude, live.longitude);
      list.push({
        imei, name: live.name || live.plate || imei, plate: live.plate || null,
        distanceKm: Math.round(distKm * 10) / 10, etaMin: Math.max(1, Math.round(distKm / 40 * 60)),
        online, available: online && stopped, ageMin: Math.round(ageMin),
        lat: live.latitude, lon: live.longitude
      });
    }
    // disponibile întâi, apoi după distanță
    list.sort((a, b) => (a.available === b.available ? a.distanceKm - b.distanceKm : (a.available ? -1 : 1)));
    res.json({ target: { lat, lon }, vehicles: list.slice(0, 12) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Worker: agenții rulează automat per companie (heuristici, fără AI ca să nu consume tokeni)
async function runAgentsWorker() {
  if (!agents) return;
  try {
    let _sysSpeed = 90;
    try { const _sys = await getSystemSettings(); if (!_sys.agents_auto) return; _sysSpeed = _sys.default_speed_limit; } catch (e) {} // toggle + viteză implicită din Setări sistem
    const companies = await db.getCompanies();
    for (const co of companies) {
      if (co.is_demo) continue;
      const enabled = plans ? plans.enabledAgentsFor(co) : Object.keys(agents.AGENTS);
      if (!enabled.length) continue; // planul „start" nu rulează niciun agent
      const imeis = await db.getCompanyImeis(co.id);
      if (!imeis.length) continue;
      const alertThresholds = _alertThresholdsFromSettings(co && co.settings);
      const result = await agents.runAll({ db, imeis, livePositions, companyId: co.id, defaultSpeedLimit: _sysSpeed, alertThresholds: alertThresholds }, enabled);
      for (const f of (result.findings || [])) await db.createAgentFinding(Object.assign({}, f, { companyId: co.id }));
    }
  } catch (e) { console.warn('[AGENTS] worker:', e.message); }
}

// ─── MULTI-TENANT: Companii (doar super-admin) ───
app.get('/api/companies', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const list = await db.getCompanies();
    res.json(list.map(function (c) { return Object.assign({}, c, { features: plans ? plans.featuresFor(c) : null, access: companyAccessStatus(c) }); }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard super-admin: stat per companie (vehicule, useri) + consum tokeni AI + totaluri
app.get('/api/admin/overview', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    let days = parseInt(req.query.days); if (!Number.isFinite(days) || days <= 0) days = 30; days = Math.min(days, 365);
    const [companies, usage, findingsNew] = await Promise.all([db.getCompanies(), db.getAiUsageByCompany(days), db.countNewFindings().catch(function () { return 0; })]);
    // Compania demo nu apare în dashboard-ul de business (nici tabel, nici totaluri/venituri/health).
    const demoIds = new Set(companies.filter(function (c) { return c.is_demo; }).map(function (c) { return c.id; }));
    const realCompanies = companies.filter(function (c) { return !c.is_demo; });
    const usageMap = {}; let totIn = 0, totOut = 0, totCalls = 0;
    usage.forEach(function (u) {
      usageMap[u.company_id == null ? 'null' : u.company_id] = u;
      if (u.company_id != null && demoIds.has(u.company_id)) return; // exclude demo din totalurile AI
      totIn += Number(u.input_tokens) || 0; totOut += Number(u.output_tokens) || 0; totCalls += Number(u.calls) || 0;
    });
    // ─── GPS + SIM health (din livePositions, real-time) per companie ───
    // Hartă imei → company_id (din devices)
    const devCompanyMap = {};
    try { const r = await db.pool.query('SELECT imei, company_id FROM devices'); r.rows.forEach(d => { devCompanyMap[d.imei] = d.company_id; }); } catch (e) {}
    const now = Date.now();
    // healthByCompany[companyId] = { online, offline30, weakSignal, roaming, gsmSum, gsmN, satSum, satN, healthyFix, totalLive }
    const hbc = {};
    function _bucket(cid) { const key = cid == null ? 'null' : cid; if (!hbc[key]) hbc[key] = { online: 0, offline30: 0, weakSignal: 0, roaming: 0, gsmSum: 0, gsmN: 0, satSum: 0, satN: 0, healthyFix: 0, totalLive: 0 }; return hbc[key]; }
    for (const [imei, live] of livePositions) {
      const cid = devCompanyMap[imei];
      if (cid != null && demoIds.has(cid)) continue; // exclude vehiculele demo din health
      const b = _bucket(cid);
      b.totalLive++;
      const ageMin = live.timestamp ? (now - new Date(live.timestamp).getTime()) / 60000 : 1e9;
      if (ageMin < 5) b.online++;
      if (ageMin > 60) b.offline30++; // „offline" = >1h fără date (aliniat cu statusul vehiculelor)
      const io = live.io || {};
      const gsm = Number(io.gsm_signal);
      if (Number.isFinite(gsm)) { b.gsmSum += gsm; b.gsmN++; if (gsm < 2) b.weakSignal++; }
      if (io.data_mode === 1) b.roaming++;
      const sats = Number(live.satellites != null ? live.satellites : io.satellites);
      if (Number.isFinite(sats)) { b.satSum += sats; b.satN++; }
      if ((io.gnss_status === 2 || io.gnss_status === undefined) && Number.isFinite(sats) && sats >= 4) b.healthyFix++;
    }
    function _healthSummary(b) {
      if (!b) return { live: 0, online: 0, offline30: 0, weak_signal: 0, roaming: 0, avg_gsm: null, avg_sats: null, healthy_fix_pct: null };
      return {
        live: b.totalLive, online: b.online, offline30: b.offline30,
        weak_signal: b.weakSignal, roaming: b.roaming,
        avg_gsm: b.gsmN ? Math.round((b.gsmSum / b.gsmN) * 10) / 10 : null,
        avg_sats: b.satN ? Math.round((b.satSum / b.satN) * 10) / 10 : null,
        healthy_fix_pct: b.totalLive ? Math.round((b.healthyFix / b.totalLive) * 100) : null
      };
    }
    const rows = realCompanies.map(function (c) {
      const u = usageMap[c.id] || {};
      return {
        id: c.id, name: c.name, is_demo: !!c.is_demo, plan: c.plan || null,
        vehicles: c.device_count || 0, users: c.user_count || 0,
        ai_input: Number(u.input_tokens) || 0, ai_output: Number(u.output_tokens) || 0, ai_calls: Number(u.calls) || 0,
        ai_limit: Number(c.ai_monthly_limit) || 0,
        mrr: plans ? Math.round(_companyMrr(c).mrr) : 0,
        health: _healthSummary(hbc[c.id])
      };
    });
    // Totaluri health (cumulate per companii — exclude null bucket, care e device fără companie)
    const allBuckets = Object.keys(hbc).filter(k => k !== 'null').map(k => hbc[k]);
    function _sumField(f) { return allBuckets.reduce((s, b) => s + (b[f] || 0), 0); }
    const totLive = _sumField('totalLive'); const totGsmN = _sumField('gsmN'); const totSatN = _sumField('satN');
    const totalsHealth = {
      live: totLive,
      online: _sumField('online'),
      offline30: _sumField('offline30'),
      weak_signal: _sumField('weakSignal'),
      roaming: _sumField('roaming'),
      avg_gsm: totGsmN ? Math.round((_sumField('gsmSum') / totGsmN) * 10) / 10 : null,
      avg_sats: totSatN ? Math.round((_sumField('satSum') / totSatN) * 10) / 10 : null,
      healthy_fix_pct: totLive ? Math.round((_sumField('healthyFix') / totLive) * 100) : null
    };
    const pf = usageMap['null'] || {};
    // ─── Venituri / MRR (estimat din pachetele atribuite, fără TVA) ───
    function _companyMrr(c) {
      if (c.is_demo || !plans) return { mrr: 0, key: 'start' };
      const eff = plans.effectivePlan(c);
      const key = eff ? eff.key : 'start';
      if (eff && eff.flatPriceRON != null) return { mrr: eff.flatPriceRON, key };
      const ppv = eff ? eff.pricePerVehicleRON : null;
      return { mrr: ppv != null ? ppv * (c.device_count || 0) : 0, key };
    }
    let mrrTotal = 0, activeSubs = 0; const mrrByPlan = {};
    realCompanies.forEach(function (c) {
      const r = _companyMrr(c); mrrTotal += r.mrr;
      mrrByPlan[r.key] = (mrrByPlan[r.key] || 0) + r.mrr;
      if (c.subscription_status === 'active' || c.subscription_status === 'trialing') activeSubs++;
    });
    res.json({
      days: days, model: ai.AI_MODEL, aiEnabled: ai.aiEnabled(),
      revenue: { currency: 'RON', mrr: Math.round(mrrTotal), arr: Math.round(mrrTotal * 12), by_plan: mrrByPlan, active_subs: activeSubs, paying_companies: realCompanies.length },
      companies: rows,
      platform: { ai_input: Number(pf.input_tokens) || 0, ai_output: Number(pf.output_tokens) || 0, ai_calls: Number(pf.calls) || 0, health: _healthSummary(hbc['null']) },
      totals: {
        companies: realCompanies.length,
        vehicles: realCompanies.reduce(function (s, c) { return s + (c.device_count || 0); }, 0),
        users: realCompanies.reduce(function (s, c) { return s + (c.user_count || 0); }, 0),
        ai_input: totIn, ai_output: totOut, ai_calls: totCalls,
        findings_new: findingsNew,
        health: totalsHealth
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/companies', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Numele companiei e obligatoriu' });
    let slug = (req.body.slug || name).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || null;
    if (slug && await db.getCompanyBySlug(slug)) slug = slug + '-' + Date.now().toString(36).slice(-4); // evită coliziune slug
    const c = await db.createCompany({ name, slug, contact_email: req.body.contact_email, phone: req.body.phone, plan: req.body.plan, is_demo: req.body.is_demo });
    auditReq(req, 'create', 'company', c.id, { name: c.name });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/companies/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try { await db.updateCompany(parseInt(req.params.id), req.body); auditReq(req, 'update', 'company', req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/companies/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const co = await db.getCompanyById(id);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const imeis = await db.getCompanyImeis(id);
    const users = await db.getUsers(id);
    if (imeis.length || users.length) return res.status(400).json({ error: 'Compania mai are vehicule/utilizatori. Mută-i sau șterge-i întâi.' });
    await db.deleteCompany(id);
    auditReq(req, 'delete', 'company', id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Creează adminul unei companii (super-admin)
// ─── Onboarding: invitație prin email + set/reset parolă cu token ───
function appBaseUrl(req) {
  const h = (req && req.get && req.get('host')) || 'ratrack.ro';
  return (process.env.BASE_URL || ('https://' + h)).replace(/\/$/, '');
}
async function sendSetPasswordEmail(req, user, opts) {
  opts = opts || {};
  if (!user || !user.email) return false;
  if (!(channels.emailConfigured && channels.emailConfigured())) return false;
  const token = crypto.randomBytes(32).toString('hex');
  const hours = opts.hours || (24 * 7);
  await db.setUserResetToken(user.id, token, Date.now() + hours * 3600 * 1000);
  const link = appBaseUrl(req) + '/set-password.html?token=' + token;
  let subject, text;
  if (opts.invite) {
    subject = 'Invitație RA Tracks' + (opts.company ? ' — ' + opts.company.name : '');
    text = 'Bună' + (user.full_name ? ' ' + user.full_name : '') + ',\n\n'
      + 'Ai fost invitat să administrezi ' + (opts.company ? '„' + opts.company.name + '"' : 'un cont') + ' în RA Tracks.\n'
      + 'Utilizator: ' + user.username + '\n\n'
      + 'Setează-ți parola (link valabil ' + Math.round(hours / 24) + ' zile):\n' + link + '\n\n'
      + 'După ce setezi parola, te autentifici la ' + appBaseUrl(req) + '/app\n\n— RA Tracks';
  } else {
    subject = 'Resetare parolă RA Tracks';
    text = 'Resetare parolă pentru contul „' + user.username + '".\n\nLink (valabil ' + hours + ' ore):\n' + link + '\n\nDacă nu ai cerut tu resetarea, ignoră acest email.\n\n— RA Tracks';
  }
  return await channels.sendEmailTo(user.email, subject, text);
}

app.post('/api/companies/:id/admin', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    const co = await db.getCompanyById(companyId);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const { username, password, full_name, email } = req.body;
    if (!username) return res.status(400).json({ error: 'Username obligatoriu' });
    if (await db.getUserByUsername(username)) return res.status(409).json({ error: 'Username-ul există deja' });
    const invite = !password; // fără parolă → invitație prin email
    if (invite && !email) return res.status(400).json({ error: 'Pune o parolă SAU un email pentru invitație' });
    if (!invite && password.length < 4) return res.status(400).json({ error: 'Parola: minim 4 caractere' });
    const hash = await bcrypt.hash(invite ? crypto.randomBytes(24).toString('hex') : password, 10);
    const u = await db.createUser(username, hash, 'company_admin', { full_name, email, company_id: companyId });
    let invited = false;
    if (invite) { try { invited = await sendSetPasswordEmail(req, u, { invite: true, company: co }); } catch (e) {} }
    auditReq(req, 'create', 'company_admin', u.id, { companyId, invited });
    res.json(Object.assign({}, u, { invited, inviteEmailConfigured: !!(channels.emailConfigured && channels.emailConfigured()) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set parolă cu token (invitație sau resetare) — public
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const token = (req.body && req.body.token) || '';
    const password = (req.body && req.body.password) || '';
    if (!token || String(password).length < 6) return res.status(400).json({ error: 'Token + parolă (minim 6 caractere) obligatorii' });
    const u = await db.getUserByResetToken(token);
    if (!u) return res.status(400).json({ error: 'Link invalid sau expirat. Cere o nouă invitație.' });
    const hash = await bcrypt.hash(String(password), 10);
    await db.consumeUserResetToken(u.id, hash);
    res.json({ ok: true, username: u.username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Forgot password — public (răspuns identic indiferent de existență, anti-enumerare)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = ((req.body && req.body.email) || '').trim();
    if (email) { const u = await db.getUserByEmail(email); if (u) { try { await sendSetPasswordEmail(req, u, { hours: 2 }); } catch (e) {} } }
  } catch (e) {}
  res.json({ ok: true, message: 'Dacă adresa există, vei primi un email cu instrucțiuni.' });
});

// ─── Facturare (Stripe) — se activează doar dacă STRIPE_SECRET_KEY e setat ───
app.get('/api/plans', (req, res) => {
  res.json({ plans: plans ? plans.publicPlans() : [], trialDays: plans ? plans.TRIAL_DAYS : 0, billingEnabled: !!(billing && billing.enabled()) });
});
app.get('/api/billing/status', requireAuth, withCompany, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    const cid = req.isSuper ? req.filterCompanyId : req.companyId;
    const co = cid ? await db.getCompanyById(cid) : null;
    const eff = (co && plans) ? plans.effectivePlan(co) : null;
    res.json({
      billingEnabled: !!(billing && billing.enabled()),
      plan: eff ? { key: eff.key, name: eff.name, custom: !!eff.custom, pricePerVehicleRON: eff.pricePerVehicleRON, flatPriceRON: eff.flatPriceRON || null, note: eff.note || '' } : null,
      status: (co && co.subscription_status) || 'inactiv',
      currentPeriodEnd: (co && co.current_period_end) || null,
      hasSubscription: !!(co && co.stripe_customer_id)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/billing/checkout', requireAuth, requirePerm('manageUsers'), withCompany, async (req, res) => {
  try {
    if (!(billing && billing.enabled())) return res.status(503).json({ error: 'Facturarea nu e configurată (STRIPE_SECRET_KEY)' });
    const cid = req.companyId;
    const co = cid ? await db.getCompanyById(cid) : null;
    if (!co) return res.status(400).json({ error: 'Companie inexistentă' });
    const reqPlan = (req.body && req.body.plan) || '';
    let priceId, planKey;
    if (reqPlan === 'custom') {
      const eff = plans.effectivePlan(co);
      if (!eff.custom || !eff.stripePriceId) return res.status(400).json({ error: 'Planul custom nu are un preț Stripe configurat — plata se face prin factură sau super-adminul pune un Stripe Price ID.' });
      priceId = eff.stripePriceId; planKey = 'custom';
    } else {
      const plan = plans.getPlan(reqPlan);
      if (!plan) return res.status(400).json({ error: 'Plan invalid' });
      if (plan.custom) return res.status(400).json({ error: 'Planul Enterprise se contractează direct (preț la cerere). Scrie-ne la contact@ratrack.ro.' });
      if (!plan.stripePriceId) return res.status(400).json({ error: 'Plan neconfigurat în Stripe (lipsește STRIPE_PRICE_' + plan.key.toUpperCase() + ')' });
      priceId = plan.stripePriceId; planKey = plan.key;
    }
    const imeis = await db.getCompanyImeis(cid);
    const base = appBaseUrl(req);
    const sess = await billing.createCheckout({
      priceId: priceId, quantity: Math.max(1, imeis.length),
      customerId: co.stripe_customer_id || null, customerEmail: co.contact_email || null,
      successUrl: base + '/app?billing=success', cancelUrl: base + '/app?billing=cancel',
      trialDays: plans.TRIAL_DAYS, companyId: cid
    });
    auditReq(req, 'checkout', 'billing', cid, { plan: planKey, quantity: imeis.length });
    res.json({ url: sess.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/billing/portal', requireAuth, requirePerm('manageUsers'), withCompany, async (req, res) => {
  try {
    if (!(billing && billing.enabled())) return res.status(503).json({ error: 'Facturarea nu e configurată' });
    const co = req.companyId ? await db.getCompanyById(req.companyId) : null;
    if (!co || !co.stripe_customer_id) return res.status(400).json({ error: 'Niciun abonament activ' });
    const s = await billing.createPortal({ customerId: co.stripe_customer_id, returnUrl: appBaseUrl(req) + '/app' });
    res.json({ url: s.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Super-admin: setează planul unei companii — standard (start/pro/premium) sau CUSTOM (preț negociat)
app.put('/api/companies/:id/plan', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const co = await db.getCompanyById(id);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const planKey = (req.body && req.body.plan) || 'start';
    if (planKey === 'custom') {
      const c = (req.body && req.body.custom) || {};
      const perVeh = c.pricePerVehicleRON != null && c.pricePerVehicleRON !== '' ? Number(c.pricePerVehicleRON) : null;
      const flat = c.flatPriceRON != null && c.flatPriceRON !== '' ? Number(c.flatPriceRON) : null;
      if ((perVeh == null || isNaN(perVeh)) && (flat == null || isNaN(flat))) return res.status(400).json({ error: 'Planul custom are nevoie de un preț (per vehicul SAU fix/lună)' });
      const custom = {
        name: (c.name || 'Custom').toString().slice(0, 60),
        pricePerVehicleRON: (perVeh != null && !isNaN(perVeh)) ? perVeh : null,
        flatPriceRON: (flat != null && !isNaN(flat)) ? flat : null,
        vehicleLimit: (c.vehicleLimit != null && c.vehicleLimit !== '') ? parseInt(c.vehicleLimit) : null,
        stripePriceId: (c.stripePriceId || '').toString().slice(0, 80),
        note: (c.note || '').toString().slice(0, 300)
      };
      await db.setCompanyPlan(id, 'custom', custom);
    } else {
      if (!(plans && plans.getPlan(planKey)) || planKey === 'enterprise') return res.status(400).json({ error: 'Plan invalid (folosește start/pro/premium sau custom)' });
      await db.setCompanyPlan(id, planKey, null);
    }
    auditReq(req, 'set_plan', 'company', id, { plan: planKey });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Webhook Stripe — public, semnătură verificată pe raw body
app.post('/api/billing/webhook', async (req, res) => {
  if (!(billing && billing.enabled())) return res.status(503).end();
  let event;
  try { event = billing.verifyWebhook(req.rawBody, req.get('stripe-signature')); }
  catch (e) { return res.status(400).send('Semnătură invalidă: ' + e.message); }
  try {
    const obj = (event.data && event.data.object) || {};
    if (event.type === 'checkout.session.completed') {
      const companyId = obj.client_reference_id ? parseInt(obj.client_reference_id) : null;
      if (companyId) await db.setCompanyBilling(companyId, { status: 'active', customerId: obj.customer, subscriptionId: obj.subscription });
    } else if (event.type.indexOf('customer.subscription.') === 0) {
      const co = await db.getCompanyByStripeCustomer(obj.customer);
      if (co) {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : (obj.status || 'active');
        const periodEnd = obj.current_period_end ? obj.current_period_end * 1000 : null;
        await db.setCompanyBilling(co.id, { status, customerId: obj.customer, subscriptionId: obj.id, periodEnd });
        // Stripe-ready: o plată reușită prelungește accesul până la finalul perioadei facturate
        if (periodEnd && (status === 'active' || status === 'trialing')) {
          try { await db.recordPayment({ companyId: co.id, amountRon: null, periodStart: Date.now(), periodEnd, method: 'stripe', note: 'Stripe ' + event.type, createdBy: null }); }
          catch (e) { await db.setCompanyAccessUntil(co.id, periodEnd); }
          _invalidateAccessCache(co.id);
        }
      }
    }
  } catch (e) { console.warn('[BILLING] webhook:', e.message); }
  res.json({ received: true });
});
// Device-uri neasignate (super-admin) + asignare la companie
app.get('/api/unassigned-devices', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await db.getUnassignedDevices()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/devices/:imei/company', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const companyId = req.body.company_id != null ? parseInt(req.body.company_id) : null;
    await db.setDeviceCompany(req.params.imei, companyId);
    invalidateAccessCache(); _devCompanyCache.delete(req.params.imei);
    auditReq(req, 'assign_company', 'device', req.params.imei, { companyId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Super-admin: setează interfața CAN a device-ului ('fms' pt. FMC650 / 'lvcan'/null pt. adaptor standard).
// Determină cum decodează codec8e AVL ID-urile CAN (FMS = altă mapare, valori finale, fără convertCanValue).
app.put('/api/devices/:imei/can-interface', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const raw = (req.body && req.body.can_interface) || null;
    if (raw != null && raw !== 'fms' && raw !== 'lvcan') return res.status(400).json({ error: 'Valoare invalidă (fms / lvcan / null)' });
    const v = await db.setDeviceCanInterface(req.params.imei, raw);
    invalidateIfaceCache(req.params.imei);
    auditReq(req, 'set_can_interface', 'device', req.params.imei, { can_interface: v });
    res.json({ ok: true, can_interface: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk move: super-admin mută N vehicule la aceeași companie într-un singur statement.
app.put('/api/devices/company/bulk', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const imeis = Array.isArray(req.body.imeis) ? req.body.imeis.map(String).filter(Boolean) : [];
    if (!imeis.length) return res.status(400).json({ error: 'Niciun IMEI furnizat' });
    if (imeis.length > 1000) return res.status(400).json({ error: 'Prea multe IMEI-uri (max 1000 per cerere)' });
    const companyId = req.body.company_id != null && req.body.company_id !== '' ? parseInt(req.body.company_id) : null;
    if (companyId != null && !(await db.getCompanyById(companyId))) return res.status(400).json({ error: 'Companie inexistentă' });
    const moved = await db.setDevicesCompanyBulk(imeis, companyId);
    invalidateAccessCache();
    imeis.forEach(im => _devCompanyCache.delete(im));
    auditReq(req, 'assign_company_bulk', 'device', null, { companyId, count: moved, imeis: imeis.slice(0, 50) });
    res.json({ ok: true, moved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Super-admin: mută un UTILIZATOR în altă companie. Curăță grant-urile per-vehicul/grup (db).
app.put('/api/users/:id/company', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const target = await db.getUserById(id);
    if (!target) return res.status(404).json({ error: 'Utilizator inexistent' });
    if (isSuper(target.role)) return res.status(400).json({ error: 'Super-adminul aparține platformei, nu unei companii' });
    const companyId = (req.body.company_id != null && req.body.company_id !== '') ? parseInt(req.body.company_id) : null;
    // company_id == null = „platformă/super" în restul codului (_accessBlocked, requireFeature). Un cont non-super NU poate
    // rămâne fără companie — altfel ar sări peste gating-ul de abonament + funcții. Oglindește crearea de user (400).
    if (companyId == null) return res.status(400).json({ error: 'Selectează compania pentru utilizator (un cont nu poate rămâne fără companie)' });
    if (!(await db.getCompanyById(companyId))) return res.status(400).json({ error: 'Companie inexistentă' });
    await db.setUserCompany(id, companyId);
    invalidateAccessCache(id);
    auditReq(req, 'assign_company', 'user', id, { companyId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk move: super-admin mută N utilizatori la aceeași companie. Curăță grant-urile în aceeași tranzacție.
app.put('/api/users/company/bulk', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(x => parseInt(x)).filter(x => !isNaN(x)) : [];
    if (!ids.length) return res.status(400).json({ error: 'Niciun id furnizat' });
    if (ids.length > 1000) return res.status(400).json({ error: 'Prea multe id-uri (max 1000 per cerere)' });
    const companyId = req.body.company_id != null && req.body.company_id !== '' ? parseInt(req.body.company_id) : null;
    if (companyId == null) return res.status(400).json({ error: 'Selectează compania pentru utilizatori' });
    if (!(await db.getCompanyById(companyId))) return res.status(400).json({ error: 'Companie inexistentă' });
    // Refuză super-adminii (același gard ca în PUT-ul single) — un singur SELECT, nu N round-trips.
    const superCount = await db.countSuperadminsInIds(ids);
    if (superCount > 0) return res.status(400).json({ error: 'Super-adminii nu pot fi mutați (' + superCount + ' detectați)' });
    const moved = await db.setUsersCompanyBulk(ids, companyId);
    ids.forEach(id => invalidateAccessCache(id));
    auditReq(req, 'assign_company_bulk', 'user', null, { companyId, count: moved, ids: ids.slice(0, 50) });
    res.json({ ok: true, moved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Tahograf (.DDD) — upload + analiză best-effort ───
app.get('/api/tacho', requireAuth, requirePerm('viewReports'), withCompany, requireFeature('tahograf'), async (req, res) => {
  try { res.json(await db.getTachoFiles(req.isSuper ? null : req.companyId)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/tacho/:id', requireAuth, requirePerm('viewReports'), withCompany, requireFeature('tahograf'), async (req, res) => {
  try {
    const f = await db.getTachoFile(parseInt(req.params.id));
    if (!f) return res.status(404).json({ error: 'Inexistent' });
    if (!req.isSuper && f.company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    res.json({ id: f.id, filename: f.filename, kind: f.kind, driver_name: f.driver_name, uploaded_at: f.uploaded_at, parsed: typeof f.parsed === 'string' ? JSON.parse(f.parsed) : f.parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/tacho/upload', requireAuth, requireFleet, withCompany, requireFeature('tahograf'), async (req, res) => {
  try {
    const { filename, b64, imei } = req.body;
    if (!b64) return res.status(400).json({ error: 'Lipsește fișierul' });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8) return res.status(400).json({ error: 'Fișier invalid' });
    if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Fișier prea mare (max 4MB)' });
    const parsed = tacho.parse(buf);
    const rec = await db.createTachoFile({ companyId: req.companyId, imei: imei || null, driverName: parsed.driverName, filename: (filename || 'tahograf.ddd').slice(0, 200), kind: parsed.kind, periodFrom: parsed.periodFrom || null, periodTo: parsed.periodTo || null, parsed, rawB64: b64.slice(0, 2 * 1024 * 1024) });
    auditReq(req, 'upload', 'tacho', rec.id, { filename, kind: parsed.kind });
    res.json({ id: rec.id, parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/tacho/:id', requireAuth, requireFleet, withCompany, requireFeature('tahograf'), async (req, res) => {
  try {
    const f = await db.getTachoFile(parseInt(req.params.id));
    if (f && !req.isSuper && f.company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteTachoFile(parseInt(req.params.id)); auditReq(req, 'delete', 'tacho', req.params.id); res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── e-Transport (ANAF) — gestionare UIT + (trimitere doar dacă e configurat tokenul) ───
function etransportEnabled() { return !!(process.env.ANAF_ETRANSPORT_TOKEN && process.env.ANAF_ETRANSPORT_URL); }
app.get('/api/etransport/status', requireAuth, (req, res) => res.json({ enabled: etransportEnabled() }));
app.get('/api/etransport', requireAuth, requirePerm('viewReports'), withCompany, requireFeature('etransport'), async (req, res) => {
  try { res.json(await db.getEtransports(req.isSuper ? null : req.companyId)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/etransport', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async (req, res) => {
  try { if (!req.body.uit) return res.status(400).json({ error: 'Cod UIT obligatoriu' }); const tr = await db.createEtransport(req.body, req.companyId); auditReq(req, 'create', 'etransport', tr.id, { uit: req.body.uit }); res.json(tr); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/etransport/:id', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async (req, res) => {
  try { if (!(await ownsRow(req, 'etransport', req.params.id))) return res.status(403).json({ error: 'Acces interzis' }); await db.updateEtransport(parseInt(req.params.id), req.body); auditReq(req, 'update', 'etransport', req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/etransport/:id', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async (req, res) => {
  try { if (!(await ownsRow(req, 'etransport', req.params.id))) return res.status(403).json({ error: 'Acces interzis' }); await db.deleteEtransport(parseInt(req.params.id)); auditReq(req, 'delete', 'etransport', req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Worker e-Transport: trimite pozițiile transporturilor active la ANAF (DOAR dacă e configurat tokenul)
async function sendEtransportPositions() {
  if (!etransportEnabled()) return;
  try {
    const active = await db.getActiveEtransports();
    for (const tr of active) {
      const pos = tr.imei ? livePositions.get(tr.imei) : null;
      if (!pos) continue;
      // NOTĂ: schema payload-ului trebuie aliniată la specificația reală a API-ului ANAF e-Transport.
      const payload = { uit: tr.uit, lat: pos.latitude, lng: pos.longitude, speed: pos.speed, timestamp: pos.timestamp };
      await fetch(process.env.ANAF_ETRANSPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.ANAF_ETRANSPORT_TOKEN }, body: JSON.stringify(payload) }).catch(() => {});
      await db.updateEtransport(tr.id, { last_sent_at: new Date().toISOString() }).catch(() => {});
    }
  } catch (e) { console.warn('[e-Transport]', e.message); }
}

// Catalog API (public) — pentru integratori
app.get('/api', (req, res) => {
  res.json({
    name: 'Fleet-Map API',
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
    if (req.companyId !== demoCompanyId) devices = devices.filter(d => !DEMO_SET.has(d.imei)); // demo doar în contul demo
    // Implicit ascunde vehiculele arhivate (de pe hartă/selectoare); ?includeArchived=1 le include (management)
    if (!req.query.includeArchived) devices = devices.filter(d => d.status !== 'archived');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listă slabă (fără poziție live + io_data) — folosită de selectoarele de mutare super-admin.
// Drop ~80-95% din payload-ul /api/devices la 1000+ vehicule.
app.get('/api/devices/lite', requireAuth, withScope, async (req, res) => {
  try {
    let devices = await db.getDevicesLite();
    if (req.allowedImeis != null) devices = devices.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) devices = devices.filter(d => !DEMO_SET.has(d.imei));
    if (!req.query.includeArchived) devices = devices.filter(d => d.status !== 'archived');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Adăugare manuală vehicul (pre-înregistrare IMEI). Trackerul cu acel IMEI se va lega automat.
app.post('/api/devices', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const imei = String(req.body.imei || '').trim();
    if (!/^\d{10,20}$/.test(imei)) return res.status(400).json({ error: 'IMEI invalid (10–20 cifre)' });
    if (await db.deviceExists(imei)) return res.status(409).json({ error: 'Există deja un vehicul cu acest IMEI' });
    // Companie: ne-super → compania proprie; super → opțional company_id din body, altfel neasignat
    const companyId = req.isSuper
      ? (req.body.company_id != null && req.body.company_id !== '' ? parseInt(req.body.company_id) : null)
      : req.companyId;
    const fields = {};
    ['name', 'plate', 'vehicle_type', 'vin', 'brand', 'model'].forEach(k => { if (req.body[k]) fields[k] = req.body[k]; });
    await db.createDevice(imei, fields, companyId);
    invalidateAccessCache(); // vehicul nou în companie → reîmprospătează accesul (altfel nu apare/nu se editează ~15s)
    auditReq(req, 'create', 'device', imei, { name: fields.name, plate: fields.plate });
    res.json({ ok: true, imei });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import / Export vehicule (CSV) ───
const VEHICLE_CSV_COLS = [
  { h: 'imei', f: 'imei' }, { h: 'nume', f: 'name' }, { h: 'nr_inmatriculare', f: 'plate' },
  { h: 'categorie', f: 'vehicle_type' }, { h: 'vin', f: 'vin' }, { h: 'marca', f: 'brand' },
  { h: 'model', f: 'model' }, { h: 'an', f: 'year' }, { h: 'combustibil', f: 'fuel_type' },
  { h: 'capacitate_rezervor', f: 'tank_capacity' }, { h: 'viteza_limita', f: 'speed_limit' },
  { h: 'putere_kw', f: 'power_kw' }, { h: 'cilindree', f: 'displacement' }, { h: 'sarcina_utila', f: 'payload' },
  { h: 'locuri', f: 'passenger_seats' }, { h: 'grad_poluare', f: 'emission_class' }, { h: 'anvelopa', f: 'tire_size' },
  { h: 'serie_motor', f: 'engine_serial' }, { h: 'centru_cost', f: 'cost_center' }, { h: 'nr_inventar', f: 'inventory_number' },
  { h: 'consum_oras', f: 'consumption_city' }, { h: 'consum_afara', f: 'consumption_road' }, { h: 'consum_stationar', f: 'consumption_idle' }
];
// Escapare CSV + anti-injection formule (prefix ' la valori care încep cu = + - @ — previne formula injection în Excel)
function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

app.get('/api/devices/export.csv', requireAuth, withScope, async (req, res) => {
  try {
    let devices = await db.getDevices();
    if (req.allowedImeis != null) devices = devices.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) devices = devices.filter(d => !DEMO_SET.has(d.imei));
    const header = VEHICLE_CSV_COLS.map(c => c.h).join(',');
    const lines = devices.map(d => VEHICLE_CSV_COLS.map(c => csvCell(d[c.f])).join(','));
    const csv = '﻿' + [header, ...lines].join('\r\n'); // BOM → Excel deschide UTF-8 cu diacritice
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vehicule.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices/template.csv', requireAuth, (req, res) => {
  const header = VEHICLE_CSV_COLS.map(c => c.h).join(',');
  const ex = { imei: '350612345678901', nume: 'Camion exemplu', nr_inmatriculare: 'B 123 ABC', categorie: 'Camion', marca: 'Volvo', model: 'FH16', an: '2019', combustibil: 'Motorina', capacitate_rezervor: '400', putere_kw: '397' };
  const example = VEHICLE_CSV_COLS.map(c => csvCell(ex[c.h] || '')).join(',');
  const csv = '﻿' + [header, example].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template_vehicule.csv"');
  res.send(csv);
});

// Import în masă: rânduri parsate din CSV (frontend) → create/update după IMEI, scoped pe companie
app.post('/api/devices/import', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'Niciun rând de importat' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Prea multe rânduri (max 5000)' });
    let created = 0, updated = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const imei = String(row.imei || '').trim();
      if (!/^\d{10,20}$/.test(imei)) { errors.push({ line: i + 2, imei, error: 'IMEI invalid' }); continue; }
      const fields = {};
      for (const c of VEHICLE_CSV_COLS) {
        if (c.f === 'imei') continue;
        if (row[c.h] !== undefined && row[c.h] !== '') fields[c.f] = row[c.h];
      }
      try {
        if (await db.deviceExists(imei)) {
          if (!canAccessImei(req, imei)) { errors.push({ line: i + 2, imei, error: 'Acces interzis (alt tenant)' }); continue; }
          await db.updateVehicleDetails(imei, fields);
          updated++;
        } else {
          await db.createDevice(imei, fields, req.isSuper ? null : req.companyId);
          created++;
        }
      } catch (e) { errors.push({ line: i + 2, imei, error: e.message }); }
    }
    invalidateAccessCache();
    auditReq(req, 'import', 'device', null, { created, updated, errors: errors.length });
    res.json({ created, updated, errors: errors.slice(0, 50) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Arhivare / restaurare vehicul
app.put('/api/devices/:imei/status', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const status = req.body.status === 'archived' ? 'archived' : 'active';
    await db.setDeviceStatus(imei, status);
    auditReq(req, 'update', 'device', imei, { status });
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Poziții live din memorie
app.get('/api/live', requireAuth, withScope, async (req, res) => {
  let positions = Array.from(livePositions.values());
  if (req.allowedImeis != null) positions = positions.filter(p => req.allowedImeis.has(p.imei));
  if (req.companyId !== demoCompanyId) positions = positions.filter(p => !DEMO_SET.has(p.imei)); // demo doar în contul demo
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
app.get('/api/connections', requireAuth, requireFleet, withScope, (req, res) => {
  // Tenant: super-admin (allowedImeis == null) vede toate conexiunile; restul doar ale vehiculelor proprii.
  if (req.allowedImeis == null) return res.json(Object.fromEntries(activeConnections));
  const out = {};
  for (const [imei, info] of activeConnections) { if (req.allowedImeis.has(imei)) out[imei] = info; }
  res.json(out);
});

// API: Istoric traseu pentru un dispozitiv
app.get('/api/history/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);
    // Format compatibil cu frontend-ul vechi (array) sau extins (?ext=1: include device.speed_limit + summary overspeed)
    if (!req.query.ext) return res.json(history);
    const dev = await db.getDeviceFull(imei).catch(() => null);
    const limit = dev && dev.speed_limit ? Number(dev.speed_limit) : null;
    let oc = 0, oMax = 0, oDur = 0;
    if (limit && history.length > 1) {
      for (let i = 1; i < history.length; i++) {
        const p = history[i], sp = Number(p.speed) || 0;
        if (sp > limit) {
          oc++;
          const over = sp - limit; if (over > oMax) oMax = over;
          const dt = (new Date(p.timestamp).getTime() - new Date(history[i - 1].timestamp).getTime()) / 1000;
          if (dt > 0 && dt < 300) oDur += dt; // ignoră salturi mari (offline)
        }
      }
    }
    res.json({
      points: history,
      device: dev ? { speed_limit: limit, name: dev.name, plate: dev.plate } : null,
      summary: { overspeedCount: oc, overspeedDurationSec: Math.round(oDur), maxOverKmh: oMax }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizare info dispozitiv (nume, tip, nr. înmatriculare)
app.put('/api/devices/:imei', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
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

// API: Actualizare fișă vehicul completă (toate câmpurile editabile — paritate AROBS)
app.put('/api/devices/:imei/details', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const b = req.body || {};
    await db.updateVehicleDetails(imei, b);
    auditReq(req, 'update', 'device', imei, { fields: Object.keys(b).length });
    // Reflectă imediat în live (WebSocket) pentru câmpurile vizibile pe hartă/listă
    const pos = livePositions.get(imei);
    if (pos) {
      if ('name' in b) pos.name = b.name || null;
      if ('plate' in b) pos.plate = b.plate || null;
      if ('vehicle_type' in b) pos.vehicle_type = b.vehicle_type || null;
      if ('icon' in b) pos.icon = b.icon || null;
      if ('color' in b) pos.color = b.color || null;
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
app.put('/api/devices/:imei/truck-config', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateTruckConfig(req.params.imei, req.body);
    auditReq(req, 'update', 'truck-config', req.params.imei);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atribuire grup + șofer pe vehicul (grupul afectează accesul multi-client)
app.put('/api/devices/:imei/assign', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    await db.assignDevice(req.params.imei, req.body.driver_id, req.body.group_id);
    invalidateAccessCache(); // grupul s-a schimbat → invalidează tot cache-ul de acces
    auditReq(req, 'assign', 'device', req.params.imei, { driver_id: req.body.driver_id, group_id: req.body.group_id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Update tank calibration (perechi voltage -> liters pentru sonda Escort)
app.put('/api/devices/:imei/tank-calibration', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
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
app.put('/api/devices/:imei/fuel-sensors', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const sensors = Array.isArray(req.body.sensors) ? req.body.sensors : [];
    await db.setFuelSensors(req.params.imei, sensors);
    invalidateFuelSensors(req.params.imei);
    auditReq(req, 'update', 'fuel-sensors', req.params.imei, { count: sensors.length });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Debug / mapare IO per vehicul (doar super-admin) ───
// Ultimul io live + cheile NEMAPATE (io_<id>) + maparile curente
app.get('/api/devices/:imei/io-debug', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const imei = req.params.imei;
    const live = livePositions.get(imei);
    const io = (live && live.io) ? live.io : {};
    const mappings = await db.getIoMappings(imei);
    const unmapped = [];
    const mapped = [];
    for (const [k, v] of Object.entries(io)) {
      const m = /^io_(\d+)$/.exec(k);
      if (m) { if (mappings[m[1]]) mapped.push({ id: m[1], key: k, value: v }); else unmapped.push({ id: m[1], key: k, value: v }); }
    }
    unmapped.sort((a, b) => Number(a.id) - Number(b.id));
    const can_interface = await db.getDeviceCanInterface(imei);
    res.json({ imei, hasLive: !!live, timestamp: live ? live.timestamp : null, can_interface, unmapped, mapped, mappings, ioKeyCount: Object.keys(io).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Citire mapari (pentru afisare in fisa — orice user cu acces la vehicul)
app.get('/api/devices/:imei/io-mappings', requireAuth, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    res.json(await db.getIoMappings(req.params.imei));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Setare mapare pentru un IO (doar super-admin)
app.put('/api/devices/:imei/io-mappings/:ioId', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const ioId = String(req.params.ioId).replace(/[^0-9]/g, '');
    if (!ioId) return res.status(400).json({ error: 'IO id invalid' });
    const b = req.body || {};
    const name = (b.name || '').toString().trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Numele e obligatoriu' });
    const type = ['raw', 'fuel', 'percent', 'temp'].includes(b.type) ? b.type : 'raw';
    const num = (x) => (x != null && x !== '' && Number.isFinite(Number(x))) ? Number(x) : null;
    const mapping = { name, type, unit: (b.unit || '').toString().slice(0, 12) || null, capacity: num(b.capacity), rawMin: num(b.rawMin), rawMax: num(b.rawMax), scale: num(b.scale), offset: num(b.offset) };
    const next = await db.setIoMapping(req.params.imei, ioId, mapping);
    auditReq(req, 'update', 'io-mapping', req.params.imei, { ioId, name, type });
    res.json({ ok: true, mappings: next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Stergere mapare (doar super-admin)
app.delete('/api/devices/:imei/io-mappings/:ioId', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const ioId = String(req.params.ioId).replace(/[^0-9]/g, '');
    const next = await db.deleteIoMapping(req.params.imei, ioId);
    auditReq(req, 'delete', 'io-mapping', req.params.imei, { ioId });
    res.json({ ok: true, mappings: next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Setări sistem (super-admin): banner anunț, agenți auto, praguri ───
app.get('/api/admin/system-settings', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await getSystemSettings()); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/admin/system-settings', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.announcement !== undefined) await db.setSetting('announcement', String(b.announcement || '').slice(0, 500));
    if (b.agents_auto !== undefined) await db.setSetting('agents_auto', b.agents_auto ? 'on' : 'off');
    if (b.offline_minutes !== undefined) { const n = parseInt(b.offline_minutes); if (Number.isFinite(n) && n >= 5 && n <= 1440) await db.setSetting('offline_minutes', String(n)); }
    if (b.default_speed_limit !== undefined) { const n = parseInt(b.default_speed_limit); if (Number.isFinite(n) && n >= 10 && n <= 200) await db.setSetting('default_speed_limit', String(n)); }
    invalidateSystemSettings();
    auditReq(req, 'update', 'system-settings', null, { keys: Object.keys(b) });
    res.json({ ok: true, settings: await getSystemSettings() });
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
    await applyCompanyFilter(req);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();
    const scopedSize = Array.from(livePositions.keys()).filter(i => canAccessImei(req, i)).length;

    // Collect stats per device
    const deviceStats = [];
    let totalKm = 0;
    let totalFuel = 0;
    let totalAlerts = 0;
    let onlineCount = 0;
    let movingCount = 0;
    let stationatCount = 0;
    let pornitCount = 0;
    let totalEngineTime = 0;

    for (const [imei, data] of livePositions) {
      if (!canAccessImei(req, imei)) continue;
      const isOnline = data.timestamp && (now - new Date(data.timestamp)) < 3900000; // 65 min
      const isMoving = isOnline && (data.speed || 0) > 3;
      const _io = data.io || data.io_data || {};
      const hasIgnition = _io.ignition === 1 || _io.ignition === true;
      const isStationat = isOnline && !isMoving && hasIgnition; // motor pornit, dar nemișcat
      const isPornit = isOnline && (isMoving || hasIgnition);    // motor pornit (= în mișcare + staționat)
      if (isOnline) onlineCount++;
      if (isMoving) movingCount++;
      if (isStationat) stationatCount++;
      if (isPornit) pornitCount++;

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
          isMoving,
          isStationat,
          isPornit
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
      pornitCount,
      stationatCount,
      opritCount: scopedSize - pornitCount,
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

app.get('/api/drivers', requireAuth, withCompany, async (req, res) => {
  try { res.json(await db.getDrivers(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Listă slabă șoferi — pentru selectoarele de mutare.
app.get('/api/drivers/lite', requireAuth, withCompany, async (req, res) => {
  try { res.json(await db.getDriversLite(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/drivers', requireAuth, requireFleet, withCompany, async (req, res) => {
  try { const d = await db.createDriver(req.body, req.companyId); auditReq(req, 'create', 'driver', d.id, { name: req.body.name }); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/drivers/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'drivers', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateDriver(req.params.id, req.body); auditReq(req, 'update', 'driver', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/drivers/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'drivers', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteDriver(req.params.id); auditReq(req, 'delete', 'driver', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Super-admin: mută un ȘOFER în altă companie (sau neasignat). Rupe legătura cu vehiculele (driver_id, în db).
app.put('/api/drivers/:id/company', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const target = await db.getDriverById(id);
    if (!target) return res.status(404).json({ error: 'Șofer inexistent' });
    const companyId = (req.body.company_id != null && req.body.company_id !== '') ? parseInt(req.body.company_id) : null;
    if (companyId != null && !(await db.getCompanyById(companyId))) return res.status(400).json({ error: 'Companie inexistentă' });
    await db.setDriverCompany(id, companyId);
    auditReq(req, 'assign_company', 'driver', id, { companyId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk move: super-admin mută N șoferi. company_id NULL = neasignat (permis).
app.put('/api/drivers/company/bulk', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(x => parseInt(x)).filter(x => !isNaN(x)) : [];
    if (!ids.length) return res.status(400).json({ error: 'Niciun id furnizat' });
    if (ids.length > 1000) return res.status(400).json({ error: 'Prea multe id-uri (max 1000 per cerere)' });
    const companyId = (req.body.company_id != null && req.body.company_id !== '') ? parseInt(req.body.company_id) : null;
    if (companyId != null && !(await db.getCompanyById(companyId))) return res.status(400).json({ error: 'Companie inexistentă' });
    const moved = await db.setDriversCompanyBulk(ids, companyId);
    auditReq(req, 'assign_company_bulk', 'driver', null, { companyId, count: moved, ids: ids.slice(0, 50) });
    res.json({ ok: true, moved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Grupe CRUD ───

app.get('/api/groups', requireAuth, withCompany, async (req, res) => {
  try { res.json(await db.getGroups(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/groups', requireAuth, requireFleet, withCompany, async (req, res) => {
  try { const g = await db.createGroup(req.body, req.companyId); auditReq(req, 'create', 'group', g.id, { name: req.body.name }); res.json(g); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/groups/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'device_groups', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateGroup(req.params.id, req.body); auditReq(req, 'update', 'group', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/groups/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'device_groups', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteGroup(req.params.id); invalidateAccessCache(); auditReq(req, 'delete', 'group', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Geofences CRUD ───

// Calculează centrul (centru cerc / centroid poligon) și completează adresa via geocodare inversă.
async function enrichGeofence(body) {
  const out = Object.assign({}, body);
  try {
    let lat = null, lon = null;
    if (body.type === 'circle' && body.coordinates && body.coordinates.center) {
      lat = Number(body.coordinates.center[0]); lon = Number(body.coordinates.center[1]);
    } else if (Array.isArray(body.coordinates) && body.coordinates.length) {
      let sLat = 0, sLon = 0, n = 0;
      for (const p of body.coordinates) {
        if (Array.isArray(p) && p.length >= 2) { sLat += Number(p[0]); sLon += Number(p[1]); n++; }
      }
      if (n) { lat = sLat / n; lon = sLon / n; }
    }
    if (lat != null && lon != null && isFinite(lat) && isFinite(lon)) {
      out.center_lat = lat; out.center_lon = lon;
      if (!out.address && geocode && geocode.reverseGeocode) {
        try { out.address = await geocode.reverseGeocode(lat, lon); } catch (e) {}
      }
    }
  } catch (e) {}
  return out;
}

app.get('/api/geofences', requireAuth, withCompany, async (req, res) => {
  try { res.json(await db.getGeofences(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/geofences', requireAuth, requireFleet, withCompany, async (req, res) => {
  try { const g = await db.createGeofence(await enrichGeofence(req.body), req.companyId); auditReq(req, 'create', 'geofence', g.id, { name: req.body.name }); res.json(g); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/geofences/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'geofences', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateGeofence(req.params.id, await enrichGeofence(req.body)); auditReq(req, 'update', 'geofence', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geofences/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'geofences', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteGeofence(req.params.id); auditReq(req, 'delete', 'geofence', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Alerte CRUD ───

app.get('/api/alerts', requireAuth, withScope, async (req, res) => {
  try {
    let alerts = await db.getAlerts(req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) alerts = alerts.filter(a => !a.imei || req.allowedImeis.has(a.imei));
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (req.body.imei && !canAccessImei(req, req.body.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const a = await db.createAlert(req.body, req.companyId); auditReq(req, 'create', 'alert', a.id, { type: req.body.type }); res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'alerts', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteAlert(req.params.id); auditReq(req, 'delete', 'alert', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    let rows = await db.getMaintenance(req.query.imei, req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) rows = rows.filter(m => req.allowedImeis.has(m.imei));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/maintenance', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (req.body.imei && !canAccessImei(req, req.body.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const m = await db.createMaintenance(req.body, req.companyId); auditReq(req, 'create', 'maintenance', m.id, { imei: req.body.imei, type: req.body.type }); res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'maintenance', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateMaintenance(req.params.id, req.body); auditReq(req, 'update', 'maintenance', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/maintenance/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'maintenance', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteMaintenance(req.params.id); auditReq(req, 'delete', 'maintenance', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Documente vehicul (ITP/RCA/CASCO/Rovinietă/...) ───
app.get('/api/documents', requireAuth, withScope, async (req, res) => {
  try {
    let rows = await db.getVehicleDocuments(req.query.imei, req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) rows = rows.filter(d => req.allowedImeis.has(d.imei));
    if (req.query.imei && !canAccessImei(req, req.query.imei)) return res.status(403).json({ error: 'Acces interzis' });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!req.body.imei || !canAccessImei(req, req.body.imei)) return res.status(403).json({ error: 'Acces interzis' });
    if (!req.body.doc_type) return res.status(400).json({ error: 'Tipul documentului e obligatoriu' });
    // company_id = al vehiculului (proprietarul real al documentului), nu al celui care-l adaugă
    const dev = await db.getDeviceFull(req.body.imei);
    const companyId = dev && dev.company_id != null ? dev.company_id : req.companyId;
    const doc = await db.createVehicleDocument(req.body, companyId);
    auditReq(req, 'create', 'document', doc.id, { imei: req.body.imei, type: req.body.doc_type });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/documents/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'vehicle_documents', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteVehicleDocument(req.params.id);
    auditReq(req, 'delete', 'document', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// Cache companie/device (pt. izolarea alertelor company-wide pe tenant)
const _devCompanyCache = new Map(); // imei -> { ts, companyId }
async function getDeviceCompanyCached(imei) {
  const c = _devCompanyCache.get(imei);
  if (c && (Date.now() - c.ts) < 60000) return c.companyId;
  try {
    const r = await db.pool.query('SELECT company_id FROM devices WHERE imei = $1', [imei]);
    const cid = r.rows[0] ? r.rows[0].company_id : null;
    _devCompanyCache.set(imei, { ts: Date.now(), companyId: cid });
    return cid;
  } catch (e) { return null; }
}

async function evaluateAlerts(imei, data) {
  try {
    const alerts = await db.getAlerts();
    if (!alerts || alerts.length === 0) return;
    const devCompany = await getDeviceCompanyCached(imei);

    const speed = data.speed || 0;
    const io = data.io || {};
    const lat = data.latitude;
    const lng = data.longitude;

    for (const alert of alerts) {
      if (!alert.enabled) continue;
      if (alert.imei) { if (alert.imei !== imei) continue; } // alertă pe device specific
      else if (alert.company_id != null && devCompany != null && alert.company_id !== devCompany) continue; // alertă company-wide doar pt. compania ei

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
              // Tenant: doar zonele companiei alertei — o alertă nu poate referi geofence-ul altei companii.
              const geofences = await db.getGeofences(alert.company_id);
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
        type: 'document_expiry', severity: days < 0 ? 'critical' : 'warning', companyId: dr.company_id,
        title: `Permis șofer ${days < 0 ? 'EXPIRAT' : 'expiră curând'}: ${dr.name}`,
        body: `Permisul ${dr.license_number || ''} ${days < 0 ? 'a expirat de ' + (-days) + ' zile' : 'expiră în ' + days + ' zile'} (${new Date(dr.license_expiry).toLocaleDateString('ro-RO')}).`,
        data: { key: 'drv-license-' + dr.id, driverId: dr.id, days }
      };
      await notify(nDrv);
      await deliverExpiryToSubscribers({ companyId: dr.company_id, title: nDrv.title, body: nDrv.body, key: nDrv.data.key });
    }
    for (const m of await db.getMaintenance()) {
      if (m.status === 'done' || !m.due_date) continue;
      const due = new Date(m.due_date).getTime();
      if (due > horizon) continue;
      const days = Math.ceil((due - now) / (24 * 3600 * 1000));
      const nMnt = {
        type: 'maintenance_due', severity: days < 0 ? 'critical' : 'warning', imei: m.imei, companyId: m.company_id,
        title: `Mentenanță ${days < 0 ? 'SCADENTĂ' : 'scadentă curând'}: ${m.type}`,
        body: `${m.type} ${days < 0 ? 'a depășit scadența cu ' + (-days) + ' zile' : 'scade în ' + days + ' zile'} (${new Date(m.due_date).toLocaleDateString('ro-RO')}).`,
        data: { key: 'maint-' + m.id, maintenanceId: m.id, days }
      };
      await notify(nMnt);
      await deliverExpiryToSubscribers({ imei: m.imei, companyId: m.company_id, title: nMnt.title, body: nMnt.body, key: nMnt.data.key });
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
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@fleet-map.local', VAPID.publicKey, VAPID.privateKey);
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
    // Tenant: cu imei → utilizatorii companiei vehiculului; fără imei (ex: permis șofer) → DOAR compania evenimentului.
    // Nu mai folosim getAllActiveUsers (difuza către toate companiile). Eveniment fără companie = nu se difuzează nimănui.
    const users = ev.imei
      ? await getEligibleUsers(ev.imei)
      : (ev.companyId != null ? await db.getActiveUsersForCompany(ev.companyId) : []);
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
    // Tenant: super → null (toate zonele, by design); non-super → compania sa. Orphan non-super (companyId null)
    // primește -1 ca să NU cadă pe „toate" (getGeofences(-1) → 0 zone), evitând scurgerea numelor de zone străine.
    const report = await reports.runReport(db, req.params.type, imeis, from, to, opts, req.isSuper ? null : (req.companyId != null ? req.companyId : -1));
    const fmt = (req.query.format || '').toLowerCase();
    if (fmt === 'xlsx' || fmt === 'pdf') {
      if (!reportExport) return res.status(503).json({ error: 'Export PDF/Excel indisponibil pe server' });
      return await reportExport.sendReport(res, report, fmt);
    }
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Rapoarte programate (trimise automat pe email) ───
app.get('/api/report-schedules', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try { res.json(await db.getReportSchedules(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/report-schedules', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.report_type) return res.status(400).json({ error: 'report_type obligatoriu' });
    if (b.imei && !canAccessImei(req, b.imei)) return res.status(403).json({ error: 'Acces interzis la vehicul' });
    const hour = Math.min(23, Math.max(0, parseInt(b.hour) || 6));
    const next = reportSchedules.computeNextRun(b.frequency || 'daily', hour, new Date());
    const s = await db.createReportSchedule({
      company_id: req.isSuper ? (b.company_id != null ? parseInt(b.company_id) : null) : req.companyId,
      user_id: req.auth.userId, name: b.name, report_type: b.report_type, imei: b.imei || null,
      period: b.period, frequency: b.frequency, hour, format: b.format, recipients: b.recipients,
      opts: b.opts || {}, enabled: b.enabled !== false, next_run: next.toISOString()
    });
    auditReq(req, 'create', 'report_schedule', s.id, { report_type: b.report_type });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/report-schedules/:id', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'report_schedules', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    const b = req.body || {};
    // Tenant: nu lăsa retargetarea programării către vehiculul altei companii (oglindă a verificării din POST).
    if (b.imei && !canAccessImei(req, b.imei)) return res.status(403).json({ error: 'Acces interzis la vehicul' });
    if (b.hour != null) b.hour = Math.min(23, Math.max(0, parseInt(b.hour) || 6));
    if (b.frequency || b.hour != null) b.next_run = reportSchedules.computeNextRun(b.frequency || 'daily', b.hour != null ? b.hour : 6, new Date()).toISOString();
    await db.updateReportSchedule(req.params.id, b);
    auditReq(req, 'update', 'report_schedule', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/report-schedules/:id', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'report_schedules', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteReportSchedule(req.params.id);
    auditReq(req, 'delete', 'report_schedule', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/report-schedules/:id/run', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'report_schedules', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    const s = await db.getReportScheduleById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Programare inexistentă' });
    const result = await reportSchedules.runSchedule(s, { db, reports, reportExport, channels }, new Date());
    res.json(result);
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
    res.json(await db.getNotifications(req.auth.userId, imeis, req.companyId, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/notifications/unread-count', requireAuth, withScope, async (req, res) => {
  try {
    const imeis = req.allowedImeis == null ? null : Array.from(req.allowedImeis);
    res.json({ count: await db.unreadNotifications(req.auth.userId, imeis, req.companyId) });
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

// ─── Preferințe UI (per user) cu cascadă: app default → companie → user ───
// Whitelist de chei UI permise (previne injection în JSONB cu chei arbitrare)
const UI_PREF_KEYS = ['overspeed_heatmap', 'replay_marker', 'geocoded_address', 'show_driver_names'];
const UI_PREF_DEFAULTS = { overspeed_heatmap: true, replay_marker: true, geocoded_address: true, show_driver_names: true };
function _filterUiKeys(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of UI_PREF_KEYS) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = !!obj[k];
  return out;
}
// Întoarce prefs efective după cascadă + sursa fiecărei chei (app/company/user) pentru UI
app.get('/api/me/ui-prefs', requireAuth, async (req, res) => {
  try {
    const a = getAuth(req);
    const userPrefs = _filterUiKeys(await db.getUiPrefs(a.userId));
    const compSettings = await db.getCompanySettings(a.companyId);
    const compDefaults = _filterUiKeys(compSettings.ui_defaults || {});
    const effective = Object.assign({}, UI_PREF_DEFAULTS, compDefaults, userPrefs);
    const source = {};
    for (const k of UI_PREF_KEYS) source[k] = Object.prototype.hasOwnProperty.call(userPrefs, k) ? 'user' : (Object.prototype.hasOwnProperty.call(compDefaults, k) ? 'company' : 'app');
    res.json({ effective, userPrefs, companyDefaults: compDefaults, source });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// User-ul setează propriile prefs (merge non-distructiv); trimite null pentru o cheie ca să o resetezi la cascadă
app.put('/api/me/ui-prefs', requireAuth, async (req, res) => {
  try {
    const a = getAuth(req);
    const patch = {};
    const body = req.body || {};
    // Permite și ștergere (null) ca să cadă pe default companiei
    const cur = await db.getUiPrefs(a.userId);
    for (const k of UI_PREF_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
      if (body[k] === null) delete cur[k]; else patch[k] = !!body[k];
    }
    // Aplicăm patch peste cur (pe care l-am eventual modificat prin delete pentru reset)
    const next = Object.assign({}, cur, patch);
    await db.pool.query(
      'INSERT INTO ui_prefs (user_id, prefs, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()',
      [a.userId, JSON.stringify(next)]
    );
    res.json({ ok: true, userPrefs: next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Admin companie: setează default-urile UI pentru întreaga companie (cascadă)
app.get('/api/companies/me/settings', requireAuth, requirePerm('manageUsers'), async (req, res) => {
  try {
    const a = getAuth(req);
    if (a.companyId == null) return res.json({ ui_defaults: {}, alert_thresholds: {} }); // super-admin fără companie
    const s = await db.getCompanySettings(a.companyId);
    res.json({ ui_defaults: _filterUiKeys(s.ui_defaults || {}), alert_thresholds: s.alert_thresholds || {}, enabled_agents: Array.isArray(s.enabled_agents) ? s.enabled_agents : null, features: s.features || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/companies/me/settings', requireAuth, requirePerm('manageUsers'), async (req, res) => {
  try {
    const a = getAuth(req);
    if (a.companyId == null) return res.status(400).json({ error: 'Super-adminul nu are companie proprie' });
    const next = await _applyCompanySettingsPatch(a.companyId, req.body || {});
    auditReq(req, 'update', 'company_settings', a.companyId, { keys: Object.keys(req.body || {}) });
    res.json({ ok: true, ui_defaults: next.ui_defaults, enabled_agents: next.enabled_agents, alert_thresholds: next.alert_thresholds || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Helper centralizat ca să gestionez și enabled_agents (whitelist pe cheia validă), nu doar ui_defaults
async function _applyCompanySettingsPatch(companyId, body) {
  const cur = await db.getCompanySettings(companyId);
  const next = Object.assign({}, cur);
  if (body.ui_defaults && typeof body.ui_defaults === 'object') {
    next.ui_defaults = Object.assign({}, cur.ui_defaults || {}, _filterUiKeys(body.ui_defaults));
  }
  if (Array.isArray(body.enabled_agents)) {
    const valid = (plans && plans.ALL_AGENT_KEYS) || [];
    next.enabled_agents = body.enabled_agents.filter(k => typeof k === 'string' && valid.indexOf(k) >= 0);
  } else if (body.enabled_agents === null) {
    delete next.enabled_agents; // null = revino la default-ul planului
  }
  if (body.features && typeof body.features === 'object') {
    const fvalid = (plans && plans.FEATURE_KEYS) || [];
    const f = Object.assign({}, cur.features || {});
    fvalid.forEach(function (k) { if (typeof body.features[k] === 'boolean') f[k] = body.features[k]; });
    next.features = f;
  }
  // Praguri alertă (RA Watch + RA Optimize + RA Care). Whitelist + clamping per cheie (SPECS canonice — vezi sus).
  if (body.alert_thresholds && typeof body.alert_thresholds === 'object') {
    const a = Object.assign({}, cur.alert_thresholds || {});
    ALERT_THRESHOLD_SPECS.forEach(function (sp) {
      if (Object.prototype.hasOwnProperty.call(body.alert_thresholds, sp.k)) {
        const v = body.alert_thresholds[sp.k];
        if (v === null) { delete a[sp.k]; return; }
        const n = Number(v);
        if (Number.isFinite(n) && n >= sp.min && n <= sp.max) a[sp.k] = sp.round ? Math.round(n) : n;
        // valori invalide → ignorate (nu suprascriu)
      }
    });
    next.alert_thresholds = a;
  } else if (body.alert_thresholds === null) {
    delete next.alert_thresholds;
  }
  // Scriere directă (NU prin db.setCompanySettings, care face încă un merge cu vechiul cur și readuce cheile șterse)
  await db.pool.query('UPDATE companies SET settings = $2 WHERE id = $1', [companyId, JSON.stringify(next)]);
  return next;
}
// Super-admin: setări per companie (ui_defaults + enabled_agents)
app.get('/api/companies/:id/settings', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const co = await db.getCompanyById(id); if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const s = await db.getCompanySettings(id);
    const planAgents = plans && plans.enabledAgentsFor(co);
    res.json({ ui_defaults: _filterUiKeys(s.ui_defaults || {}), enabled_agents: Array.isArray(s.enabled_agents) ? s.enabled_agents : null, plan_defaults: planAgents, plan: co.plan, alert_thresholds: s.alert_thresholds || {}, features: s.features || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/companies/:id/settings', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const next = await _applyCompanySettingsPatch(id, req.body || {});
    auditReq(req, 'update', 'company_settings', id, { keys: Object.keys(req.body || {}) });
    res.json({ ok: true, ui_defaults: next.ui_defaults, enabled_agents: next.enabled_agents, alert_thresholds: next.alert_thresholds || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── Catalog IO Teltonika (138 ID-uri din wiki + override-uri globale super-admin) ─────────
// GET catalog (orice user autentificat) → întoarce defaults din io_catalog.js, suprapus cu override-urile globale din settings('io_catalog_overrides')
app.get('/api/io-catalog', requireAuth, async (req, res) => {
  try {
    const defaults = ioCatalog ? ioCatalog.IO_CATALOG : [];
    let overrides = {};
    try { const raw = await db.getSetting('io_catalog_overrides'); overrides = raw ? JSON.parse(raw) : {}; } catch (e) { overrides = {}; }
    // Aplic overrides: înlocuiesc câmpurile din override-uri, păstrez restul
    const merged = defaults.map(function (e) {
      const ov = overrides[e.id];
      return ov ? Object.assign({}, e, ov, { id: e.id }) : e;
    });
    // Adaug intrările doar din override (ID-uri custom, nu sunt în catalog default)
    Object.keys(overrides).forEach(function (k) {
      const id = parseInt(k); if (!Number.isFinite(id)) return;
      if (!ioCatalog || !ioCatalog.IO_CATALOG_BY_ID[id]) {
        const ov = overrides[k];
        merged.push(Object.assign({ id: id, name: 'IO ' + id, name_ro: 'IO ' + id, unit: '-', multiplier: 1, category: 'Custom', desc_ro: '' }, ov, { id: id }));
      }
    });
    // Categoriile finale
    const categories = Array.from(new Set(merged.map(function (e) { return e.category || 'Altele'; }))).sort();
    res.json({ catalog: merged, categories: categories, overrideCount: Object.keys(overrides).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// PUT override pentru un ID (super-admin). Body: { name_ro, unit, multiplier, category, desc_ro } (toate opționale).
// Pentru reset complet la default folosește DELETE sau ?reset=1 în URL.
app.put('/api/io-catalog/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id) || id < 1 || id > 99999) return res.status(400).json({ error: 'ID invalid (1-99999)' });
    let overrides = {};
    try { const raw = await db.getSetting('io_catalog_overrides'); overrides = raw ? JSON.parse(raw) : {}; } catch (e) { overrides = {}; }
    if (req.query.reset === '1' || req.body === null) {
      delete overrides[id];
    } else {
      const b = req.body || {};
      const patch = {};
      ['name', 'name_ro', 'unit', 'category', 'desc_ro'].forEach(function (k) {
        if (b[k] != null && typeof b[k] === 'string') patch[k] = String(b[k]).slice(0, 200);
        else if (b[k] === null) patch[k] = null; // marker pentru „șterge câmpul"
      });
      if (b.multiplier != null) {
        const m = Number(b.multiplier);
        if (Number.isFinite(m) && m > 0 && m < 1e9) patch.multiplier = m;
      }
      // Curățare: dacă toate câmpurile sunt null, ștergem override-ul
      const anySet = Object.keys(patch).some(function (k) { return patch[k] != null; });
      if (!anySet) delete overrides[id];
      else overrides[id] = Object.assign({}, overrides[id] || {}, patch);
      // Elimin câmpurile cu valoare null (au fost „șterse" prin marker)
      if (overrides[id]) {
        Object.keys(overrides[id]).forEach(function (k) { if (overrides[id][k] === null) delete overrides[id][k]; });
        if (!Object.keys(overrides[id]).length) delete overrides[id];
      }
    }
    await db.setSetting('io_catalog_overrides', JSON.stringify(overrides));
    auditReq(req, 'update', 'io_catalog', String(id), { keys: Object.keys(req.body || {}) });
    res.json({ ok: true, override: overrides[id] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// DELETE override (super-admin) — alternativă convenabilă la PUT ?reset=1
app.delete('/api/io-catalog/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    let overrides = {};
    try { const raw = await db.getSetting('io_catalog_overrides'); overrides = raw ? JSON.parse(raw) : {}; } catch (e) { overrides = {}; }
    delete overrides[id];
    await db.setSetting('io_catalog_overrides', JSON.stringify(overrides));
    auditReq(req, 'delete', 'io_catalog', String(id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// IO necunoscute — scan livePositions + istoric persistent (settings 'io_unknown_seen')
// Identifică cheile io_NNN care apar în datele reale dar NU sunt în catalog default + override.
app.get('/api/io-catalog/unknown', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const known = new Set();
    if (ioCatalog) ioCatalog.IO_CATALOG.forEach(function (e) { known.add(e.id); });
    let overrides = {};
    try { const raw = await db.getSetting('io_catalog_overrides'); overrides = raw ? JSON.parse(raw) : {}; } catch (e) {}
    Object.keys(overrides).forEach(function (k) { known.add(parseInt(k)); });
    let seenHist = {};
    try { const raw = await db.getSetting('io_unknown_seen'); seenHist = raw ? JSON.parse(raw) : {}; } catch (e) {}
    // Scan live: identific cheile io_NNN nemapate din livePositions
    const liveMap = {};
    for (const [imei, live] of livePositions) {
      const io = (live && live.io) || {};
      Object.keys(io).forEach(function (k) {
        const m = /^io_(\d+)$/.exec(k); if (!m) return;
        const id = parseInt(m[1]);
        if (known.has(id)) return;
        const ts = live.timestamp || null;
        if (!liveMap[id]) liveMap[id] = { count: 0, lastValue: null, sampleImei: imei, lastSeen: ts };
        liveMap[id].count++;
        liveMap[id].lastValue = io[k];
        liveMap[id].lastSeen = ts;
      });
    }
    // Filtrez istoricul: scot ID-urile care între timp au fost catalogate (sunt acum în known)
    const filteredHist = {};
    Object.keys(seenHist || {}).forEach(function (k) {
      const id = parseInt(k); if (!known.has(id)) filteredHist[id] = seenHist[k];
    });
    // Merge: live actualizează istoricul (count cumulat dacă există)
    const merged = Object.assign({}, filteredHist);
    Object.keys(liveMap).forEach(function (k) {
      if (merged[k]) {
        merged[k] = Object.assign({}, merged[k], liveMap[k]);
        merged[k].count = (filteredHist[k].count || 0) + liveMap[k].count;
      } else {
        merged[k] = liveMap[k];
      }
    });
    // Salvez istoric (max 200 ID-uri ca să nu crească nelimitat)
    const ids = Object.keys(merged).slice(0, 200);
    const newHist = {}; ids.forEach(function (k) { newHist[k] = merged[k]; });
    try { await db.setSetting('io_unknown_seen', JSON.stringify(newHist)); } catch (e) {}
    const list = Object.keys(merged).map(function (k) {
      return Object.assign({ id: parseInt(k) }, merged[k]);
    }).sort(function (a, b) { return (b.count || 0) - (a.count || 0) || a.id - b.id; });
    res.json({ unknown: list, totalKnown: known.size });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Super-admin: funcții (module) per companie — checkbox-uri (agents / ai_assistant / etransport / tahograf)
app.put('/api/companies/:id/features', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const co = await db.getCompanyById(id); if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    await _applyCompanySettingsPatch(id, { features: (req.body && req.body.features) || {} });
    const co2 = await db.getCompanyById(id);
    auditReq(req, 'update', 'company_features', id, { features: req.body && req.body.features });
    res.json({ ok: true, features: plans.featuresFor(co2) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Super-admin: înregistrează o plată (manual) → prelungește accesul cu N luni (default 1, cumulativ)
app.post('/api/companies/:id/payment', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const co = await db.getCompanyById(id); if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const months = Math.max(1, Math.min(parseInt(req.body && req.body.months) || 1, 36));
    const now = Date.now();
    // Continuitate: dacă accesul e încă ACTIV sau în GRAȚIE, cumulăm peste access_until (fără a pierde zile); altfel pornim de acum.
    const st = companyAccessStatus(co);
    const base = ((st.status === 'active' || st.status === 'grace') && co.access_until != null) ? Number(co.access_until) : now;
    const periodEnd = _addMonthsMs(base, months);
    // Sumă opțională: normalizează separatorul zecimal RO (virgulă) + miile (punct), respinge gunoi/negativ.
    let amount = null;
    const rawAmt = (req.body && req.body.amount != null) ? String(req.body.amount).trim() : '';
    if (rawAmt !== '') {
      const norm = rawAmt.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
      amount = Number(norm);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Sumă invalidă (ex: 1500 sau 1.234,56)' });
    }
    const pay = await db.recordPayment({ companyId: id, amountRon: amount, periodStart: base, periodEnd, method: (req.body && req.body.method) || 'manual', note: (req.body && req.body.note) || null, createdBy: req.auth && req.auth.userId });
    _invalidateAccessCache(id);
    auditReq(req, 'payment', 'company', id, { months, amount, until: periodEnd });
    const co2 = await db.getCompanyById(id);
    res.json({ ok: true, payment: pay, access: companyAccessStatus(co2) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Super-admin: istoricul plăților unei companii
app.get('/api/companies/:id/payments', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    res.json(await db.getPayments(id, 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Super-admin: setează manual data de acces (trial / corecții). body: { until: epochMs | null }
app.put('/api/companies/:id/access', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const until = (req.body && req.body.until != null && req.body.until !== '') ? Number(req.body.until) : null;
    if (until != null && !Number.isFinite(until)) return res.status(400).json({ error: 'Dată invalidă' });
    await db.setCompanyAccessUntil(id, until);
    _invalidateAccessCache(id);
    auditReq(req, 'set_access', 'company', id, { until });
    const co2 = await db.getCompanyById(id);
    res.json({ ok: true, access: companyAccessStatus(co2) });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    await db.ackAllNotifications(req.auth.userId, imeis, req.companyId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/notifications/:id/ack', requireAuth, withScope, async (req, res) => {
  try {
    const imeis = req.allowedImeis == null ? null : Array.from(req.allowedImeis);
    const ok = await db.ackNotification(parseInt(req.params.id), req.auth.userId, imeis, req.companyId);
    if (!ok) return res.status(404).json({ error: 'Notificare inexistentă sau fără acces' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

app.get('/api/debug/raw/:imei', requireAuth, requireAdmin, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' }); // tenant: doar vehiculele proprii
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
    try {
      // rol + companie FRESH din DB (sesiunile vechi pot avea rol învechit)
      let role = req.session.role, companyId = req.session.companyId;
      try { const u = await db.getUserById(req.session.userId); if (u) { role = u.role; companyId = u.company_id; } } catch (e) {}
      ws._role = role;
      ws._isAdmin = hasPerm(role, 'manageUsers');
      const wsCompanyId = await resolveCompanyId({ userId: req.session.userId, role, companyId });
      ws._companyId = wsCompanyId;
      ws._allowedImeis = await getAllowedImeiSet(req.session.userId, role, wsCompanyId);
      // Acces pe bază de plată: nu transmite live feed companiilor expirate (super-adminul e exceptat)
      if (!isSuper(role) && wsCompanyId != null && (await _accessStatusCached(wsCompanyId)).status === 'expired') {
        try { ws.send(JSON.stringify({ type: 'error', data: { error: 'access_expired' } })); } catch (e) {}
        return ws.close();
      }
    } catch (e) {
      ws._allowedImeis = new Set();
    }
    ws._authed = true;
    console.log(`[WS] Client conectat la live feed (${req.session.username})`);

    // Trimite doar pozițiile la care utilizatorul are acces (demo doar în contul demo)
    const positions = Array.from(livePositions.values())
      .filter(p => ws._allowedImeis == null || ws._allowedImeis.has(p.imei))
      .filter(p => ws._companyId === demoCompanyId || !DEMO_SET.has(p.imei));
    try { ws.send(JSON.stringify({ type: 'init', data: positions })); } catch (e) {}
  });

  ws.on('close', () => {
    console.log('[WS] Client deconectat');
  });
});

function broadcastWs(message) {
  const imei = message && message.data && message.data.imei;
  const companyId = message && message.data && message.data.company_id; // notificări la nivel de companie (imei NULL)
  const isDebug = message && message.type === 'debug';
  const isNotif = message && message.type === 'notification';
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;       // doar conexiuni OPEN
    if (!client._authed) return;               // nu trimite înainte de autentificare
    if (isDebug && !client._isAdmin) return;   // debug doar pentru admini
    if (imei && client._allowedImeis instanceof Set && !client._allowedImeis.has(imei)) return; // filtrare pe acces
    if (imei && DEMO_SET.has(imei) && client._companyId !== demoCompanyId) return; // demo doar în contul demo
    // Tenant: NOTIFICARE imei-less (ex: expirare permis) → doar clienții companiei ei; super (allowedImeis null) o ia oricum.
    // Oglindă a regulii din _notifWhere: o notificare imei-less fără companie NU ajunge la niciun client non-super.
    if (isNotif && !imei && client._allowedImeis instanceof Set && client._companyId !== companyId) return;
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

  // Încarcă cheia AI salvată din UI (dacă nu e deja în env)
  try { if (!ai.aiEnabled()) { const k = await db.getSetting('anthropic_api_key'); if (k) { ai.setKey(k); console.log('[AI] Cheie Anthropic încărcată din setări'); } } } catch (e) {}

  // Creează sau actualizează userul admin
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminUser = await db.getUserByUsername('admin');
  if (!adminUser) {
    const hash = await bcrypt.hash(adminPass, 10);
    // proprietarul platformei = super-admin (vede/administrează toate companiile)
    await db.createUser('admin', hash, 'superadmin');
    console.log('[AUTH] Utilizator super-admin creat (admin)');
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

  // ─── DEMO mode: companie demo + vehicule sintetice + simulator ───
  if (process.env.DEMO_DISABLED !== 'true') {
    try {
      let demo = await db.getCompanyBySlug('demo');
      if (!demo) demo = await db.createCompany({ name: 'RA Track Demo', slug: 'demo', is_demo: true });
      demoCompanyId = demo.id;
      for (let i = 0; i < demoSim.DEMO_IMEIS.length; i++) {
        const imei = demoSim.DEMO_IMEIS[i];
        await db.pool.query(
          "INSERT INTO devices (imei, name, vehicle_type, plate, company_id, last_seen) VALUES ($1,$2,'truck',$3,$4,NOW()) ON CONFLICT (imei) DO UPDATE SET company_id = $4",
          [imei, demoSim.ROUTES[i % demoSim.ROUTES.length].city, 'DEMO-' + (i + 1), demo.id]
        );
      }
      let demoUser = await db.getUserByUsername('demo');
      if (!demoUser) {
        const hash = await bcrypt.hash(crypto.randomBytes(12).toString('hex'), 10);
        await db.createUser('demo', hash, 'viewer', { full_name: 'Cont Demo', company_id: demo.id });
        demoUser = await db.getUserByUsername('demo');
      } else if (demoUser.company_id !== demo.id) {
        await db.pool.query('UPDATE users SET company_id = $1, role = $2 WHERE id = $3', [demo.id, 'viewer', demoUser.id]);
      }
      // contul demo (viewer, read-only) primește acces la toate vehiculele demo
      if (demoUser) { try { await db.setUserAccess(demoUser.id, demoSim.DEMO_IMEIS, []); invalidateAccessCache(demoUser.id); } catch (e) {} }
      demoSim.start({ livePositions, broadcastWs, insertPositions: db.insertPositions });
    } catch (e) { console.warn('[DEMO] seed:', e.message); }
  }

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
    console.log(`  RA Tracks Server — PORNIT (${process.env.DATABASE_URL ? 'PostgreSQL — mod scalabil' : 'PGlite embedded, 100% local'})`);
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
  // Rapoarte programate — rulează scadențele la fiecare 5 min (doar dacă modulul e disponibil)
  if (reportSchedules) setInterval(() => reportSchedules.tickDue({ db, reports, reportExport, channels })
    .then(r => { if (r && r.length) console.log('[PROGRAMĂRI] ' + r.length + ' rapoarte rulate'); })
    .catch(e => console.error('[PROGRAMĂRI]', e.message)), 5 * 60 * 1000);

  // e-Transport: trimite pozițiile la ANAF la fiecare 3 min (no-op dacă nu e configurat)
  if (etransportEnabled()) { console.log('[e-Transport] Activ — trimitere poziții la ANAF'); setInterval(sendEtransportPositions, 3 * 60 * 1000); }

  // Agenți AI: RA Watch rulează automat la fiecare 30 min (prima dată după 1 min)
  if (agents) { setTimeout(runAgentsWorker, 60 * 1000); setInterval(runAgentsWorker, 30 * 60 * 1000); }
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
