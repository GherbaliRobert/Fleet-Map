// server.js — Serverul principal: TCP (dispozitive) + HTTP (interfață web) + WebSocket (live)
// Forțează UTC pentru tot procesul: coloanele `timestamp` (fără fus) fac round-trip consistent,
// iar interogările pe interval (ISO/UTC) se potrivesc. Afișarea se face explicit pe ora locală.
process.env.TZ = 'UTC';
const net = require('net');
const dnsp = require('dns').promises;
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { parseAvlPacket, convertCanValue, expandCanFlags, getIoName } = require('./codec8e');
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
const backup = require('./backup');
const errortrack = require('./errortrack');
errortrack.init();
let anaf = null; try { anaf = require('./anaf'); } catch (e) { /* opțional */ }
let efactura = null; try { efactura = require('./efactura'); } catch (e) { /* opțional */ }
let mailer = null; try { mailer = require('./mailer'); } catch (e) { /* opțional */ }
let workSched = null; try { workSched = require('./workschedule'); } catch (e) { /* opțional */ }
const fueltheft = require('./fueltheft');   // decizia "chiar a disparut combustibil?" - modul pur, verificabil
const tollro = require('./tollro');           // taxa rutiera pe km (TollRo) - grila + calcul, modul pur
const COMMIT_VER = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'dev').slice(0, 7);
// Regula alertei de viteză: prag MINIM (sub asta nu alertăm niciodată — fără absurdități în zone rezidențiale)
// + MARJĂ peste limită (toleranță). Alertă DOAR dacă speed > max(BASE, limita configurată) + MARGIN.
const SPEED_ALERT_BASE = Number(process.env.SPEED_ALERT_BASE) > 0 ? Number(process.env.SPEED_ALERT_BASE) : 50;
const SPEED_ALERT_MARGIN = Number(process.env.SPEED_ALERT_MARGIN) >= 0 ? Number(process.env.SPEED_ALERT_MARGIN) : 10;
// Histerezis „în mișcare": dacă vehiculul a avut viteză reală (>3) în ultimele MOVE_MEMORY_MS și are contactul pornit,
// rămâne „În mișcare" chiar dacă pachetul curent arată ~0 (trafic bară-la-bară). O mașină chiar parcată expiră → „Staționat/Oprit".
const MOVE_MEMORY_MS = Number(process.env.MOVE_MEMORY_MS) > 0 ? Number(process.env.MOVE_MEMORY_MS) : 150000; // 2.5 min
const reports = require('./reports');
const channels = require('./channels');
const ai = require('./ai');
const demoSim = require('./demo-sim');
const tacho = require('./tacho');
let ioCatalog = null;
try { ioCatalog = require('./io_catalog'); } catch (e) { console.warn('[IO_CATALOG] indisponibil:', e.message); }
let agents = null;
try { agents = require('./agents'); } catch (e) { console.warn('[AGENTS] indisponibil:', e.message); }
const licenseCats = require('./license_cats');   // categorii permis + încadrare șofer (sursă unică)
const maintTypes = require('./maint_types');     // tipuri de lucrări la service + granița față de Documente
let fuelprice = null;
try { fuelprice = require('./fuelprice'); } catch (e) { console.warn('[FUEL] modul preț carburant indisponibil:', e.message); }
let roadlimits = null;
try { roadlimits = require('./roadlimits'); } catch (e) { console.warn('[ROADLIMITS] modul limite OSM indisponibil:', e.message); }
// Preț carburant: media națională (auto, zilnic, PretCarburant.ro CC BY 4.0) + override per companie.
// Lanț în rapoarte: preț pe VEHICUL → preț COMPANIE (pe tipul lui) → AUTO național → 7.5.
let _fuelAuto = null;
function _applyFuelDefaults() { try { if (_fuelAuto) reports.setDefaultFuelPrices(_fuelAuto); } catch (e) {} } // propagă media națională în rapoarte
async function _loadFuelAuto() { try { const raw = await db.getSetting('fuel_prices_auto'); if (raw) { _fuelAuto = JSON.parse(raw); _applyFuelDefaults(); } } catch (e) {} }
async function refreshFuelPrices() {
  if (!fuelprice) return;
  try {
    const p = await fuelprice.fetchFuelPrices();
    if (p && (p.motorina || p.benzina)) { _fuelAuto = p; _applyFuelDefaults(); try { await db.setSetting('fuel_prices_auto', JSON.stringify(p)); } catch (e) {} try { await db.saveFuelPriceSnapshot(p); } catch (e) {} console.log('[FUEL] preț ' + p.data + ': motorină ' + p.motorina + ' / benzină ' + p.benzina + ' / GPL ' + p.gpl + ' lei/L'); }
  } catch (e) { console.warn('[FUEL] preluare preț eșuată:', e.message); }
}
function effectiveFuelPrices(companySettings) {
  const a = _fuelAuto || {}; const co = (companySettings && companySettings.fuel_prices) || {};
  const pick = function (x, y) { const v = parseFloat(x); return Number.isFinite(v) ? v : (Number.isFinite(y) ? y : null); };
  return { motorina: pick(co.motorina, a.motorina), benzina: pick(co.benzina, a.benzina), gpl: pick(co.gpl, a.gpl) };
}
let billing = null, plans = null;
try { billing = require('./billing'); plans = require('./plans'); } catch (e) { console.warn('[BILLING] indisponibil:', e.message); }
let fleetQuick = null;
try { fleetQuick = require('./fleet_quick'); } catch (e) { console.warn('[AI] euristici locale indisponibile:', e.message); }
const DEMO_SET = new Set(demoSim.DEMO_IMEIS); // vehiculele demo se văd DOAR în contul demo
let demoCompanyId = null;

// ─── Simulatorul demo merge DOAR când are pentru cine ───
// Înainte scria non-stop ~86.000 de poziții pe zi și 100 de actualizări pe minut pe WebSocket, chiar și când
// nu exista niciun cont demo — cost de bază pur, plătit ca să se învârtă cinci camioane inventate pe o hartă
// pe care n-o vedea nimeni. Acum starea lui e o funcție de „câte conturi demo sunt valabile acum".
// Excepția e deliberată: super-adminul poate forța pornirea pentru o demonstrație live, cu termen scurt.
let _demoSimForcedUntil = 0;
let _demoSimState = { running: false, active: 0, forced: false, reason: 'neinițializat', at: null };
async function syncDemoSim(reason) {
  const now = Date.now();
  const forced = now < _demoSimForcedUntil;
  let active = 0, why;
  if (process.env.DEMO_DISABLED === 'true') { why = 'DEMO_DISABLED=true'; }
  else if (demoCompanyId == null) { why = 'nu există companie demo'; }
  else {
    try { active = await db.countActiveDemoUsers(demoCompanyId, now); }
    catch (e) { active = 0; why = 'nu am putut număra conturile demo: ' + e.message; }
  }
  const shouldRun = !why && (active > 0 || forced);
  if (shouldRun && !demoSim.isRunning()) {
    demoSim.start({ livePositions, broadcastWs, insertPositions: db.insertPositions });
    console.log('[DEMO] Simulator PORNIT (' + (forced ? 'forțat de super-admin' : active + ' conturi demo active') + ') — ' + reason);
  } else if (!shouldRun && demoSim.isRunning()) {
    demoSim.stop();
    console.log('[DEMO] Simulator OPRIT (' + (why || 'niciun cont demo activ') + ') — ' + reason);
  }
  _demoSimState = {
    running: demoSim.isRunning(), active, forced,
    forcedUntil: forced ? _demoSimForcedUntil : null,
    // `blocked` = nici pornirea manuală nu are efect. Fără el, interfața ar arăta un buton care nu face nimic.
    blocked: !!why,
    reason: why || (active > 0 ? active + ' conturi demo active' : (forced ? 'pornit manual de super-admin' : 'niciun cont demo activ')),
    at: new Date(now).toISOString(),
  };
  return _demoSimState;
}
function demoSimStatus() { return Object.assign({}, _demoSimState, { running: demoSim.isRunning() }); }

// Rezultatul ULTIMEI rulări de retenție. „Variabila e setată" nu înseamnă „ștergerea chiar funcționează":
// până acum eroarea era înghițită tăcut, deci o retenție moartă arăta identic cu una sănătoasă.
let _retentionLast = null;
function _retentionSummary() {
  if (!_retentionLast) return 'încă nicio rulare de la pornire';
  if (_retentionLast.error) return 'ULTIMA RULARE A EȘUAT: ' + _retentionLast.error;
  const h = Math.round((Date.now() - _retentionLast.at) / 360000) / 10;
  if (!_retentionLast.rows) return 'ultima rulare acum ' + h + 'h: nimic de șters';
  return 'ultima rulare acum ' + h + 'h: ' + _retentionLast.rows + ' rânduri în ' + _retentionLast.batches + ' loturi'
    + (_retentionLast.exhausted ? ' (buget epuizat — continuă la următoarea)' : '');
}
// Agenți „live-only": stare de MOMENT, calculată la cerere (pagina agentului) — NU se persistă și NU se acumulează
// istoric. dispatch = disponibilitate acum; care = scadențe curente; optimize = scor eco de azi.
// (Alertele „reale" de mentenanță/documente merg oricum prin push/checkExpiries → clopoțel.)
const LIVE_AGENTS = new Set(['dispatch', 'care', 'optimize', 'compliance', 'client']);
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
// Dispozitive ARHIVATE (contract încheiat): pachetele lor primesc ACK dar NU se stochează / nu apar live.
// Set în memorie, populat la pornire + actualizat la arhivare/restaurare. Verificat la fiecare pachet (O(1)).
const archivedImeis = new Set();
// Ultimele valori CAN cunoscute per imei — pentru carry-forward când motorul e oprit (pachet fără date CAN).
const lastCanIo = new Map(); // imei -> { io: {sticky...}, ts }

// Override „contact din DIN1": IMEI-urile pentru care starea de contact se ia din DIN1 (IO 1), nu din
// IO 239 (calculat de device) — pentru trackere cu sursa de ignition configurată greșit. Doar excepțiile.
const _din1Set = new Set();
async function refreshDin1Set() {
  try { const list = await db.getDin1Imeis(); _din1Set.clear(); list.forEach((i) => _din1Set.add(i)); } catch (e) {}
}
// Aplică override-ul pe TOATE recordurile (înainte de stocare + live) → contactul e corect peste tot
// (status, hartă, alerte, „motor pornit/oprit de", rapoarte).
function _applyIgnitionSource(imei, records) {
  if (!_din1Set.has(imei) || !Array.isArray(records)) return;
  for (const r of records) {
    if (r && r.io) r.io.ignition = (r.io.digital_input_1 === 1 || r.io.digital_input_1 === true) ? 1 : 0;
  }
}

// Reconciliere periodică „arhivat": sursa de adevăr e DB (status='archived'). Re-sincronizează setul în
// memorie ȘI scoate orice vehicul arhivat care a rămas în harta live (din boot-seed sau drift) → nu mai
// poate apărea pe hartă. Auto-vindecare, independent de cum a ajuns acolo.
async function reconcileArchived() {
  try {
    const list = await db.getArchivedImeis();
    const dbSet = new Set(list);
    dbSet.forEach((i) => archivedImeis.add(i));               // adaugă arhivatele noi
    for (const i of Array.from(archivedImeis)) if (!dbSet.has(i)) archivedImeis.delete(i); // restaurate → scoate din set
    for (const i of dbSet) {                                   // purjează arhivatele din live + anunță sesiunile
      if (livePositions.has(i)) { livePositions.delete(i); broadcastWs({ type: 'removed', data: { imei: i } }); }
    }
  } catch (e) { /* best-effort */ }
}

// ── MOD STRICT de înregistrare device-uri (securitate, ca Traccar) ───────────────────────────────────────
// Acceptăm la handshake DOAR IMEI-uri PRE-ÎNREGISTRATE (allow-list) + neARHIVATE. Un tracker necunoscut sau
// RESPINS e refuzat FĂRĂ să se creeze rând sau să se stocheze poziții — doar reținut într-un jurnal de „încercări"
// (în memorie) ca super-adminul să-l poată aproba dacă e legitim. Dezactivabil cu STRICT_DEVICES=false. Implicit ACTIV.
const STRICT_DEVICES = process.env.STRICT_DEVICES !== 'false' && process.env.STRICT_DEVICES !== '0';
const registeredImeis = new Set(); // allow-list: IMEI-uri pre-înregistrate + neARHIVATE
let registeredLoaded = false;
async function loadRegisteredImeis() {
  try {
    const r = await db.pool.query("SELECT imei FROM devices WHERE status IS DISTINCT FROM 'archived'");
    registeredImeis.clear(); r.rows.forEach((x) => registeredImeis.add(x.imei)); registeredLoaded = true;
    console.log(`[STRICT] ${registeredImeis.size} IMEI-uri înregistrate (mod strict ${STRICT_DEVICES ? 'ACTIV' : 'oprit'})`);
  } catch (e) { console.error('[STRICT] loadRegisteredImeis:', e.message); }
}
// Jurnal (plafonat, în memorie) de încercări de conectare de la IMEI-uri neînregistrate — pentru descoperire/aprobare.
const deviceAttempts = new Map(); // imei -> { first, last, count, address }
const DEVICE_ATTEMPTS_MAX = 500;
function logDeviceAttempt(imei, address) {
  const now = Date.now(); const e = deviceAttempts.get(imei);
  if (e) { e.last = now; e.count++; e.address = address; return; }
  if (deviceAttempts.size >= DEVICE_ATTEMPTS_MAX) { let ok = null, ot = Infinity; for (const [k, v] of deviceAttempts) if (v.last < ot) { ot = v.last; ok = k; } if (ok) deviceAttempts.delete(ok); }
  deviceAttempts.set(imei, { first: now, last: now, count: 1, address });
}

// Valori CAN „sticky": rămân valabile când un pachet nu le include — carburant + kilometraj + RPM + limita de viteză (semn).
// RPM se cară pt. vehiculele care îl trimit INTERMITENT (ex. Dacia LV-CAN200) → nu mai apare „-" cu motorul pornit.
// speed_limit_sign (cameră ADAS, IO 1116): camera raportează semnul DOAR la schimbare → între semne pachetul nu-l include
// și badge-ul de limită dispărea. Îl cărăm ca „ultima limită văzută" (volatil, expiră ca RPM — e limita drumului CURENT, nu permanent).
// Sigur: RPM/limita sunt doar afișaj (ascunse cu contactul oprit / expirate) și NU intră în nicio logică de alertă.
// NU includem TEMP MOTORULUI — alimentează alertele de supraîncălzire (o temp „sticky" ar da alerte FALSE după răcire).
// NU includem viteza — aceea TREBUIE instantanee (o viteză „sticky" ar arăta mașina în mișcare deși stă).
const STICKY_CAN = ['fuel_level_liters', 'can_fuel_level_liters', 'can_fuel_level_pct', 'can_total_mileage', 'can_total_mileage_counted', 'total_odometer', 'can_engine_rpm', 'speed_limit_sign'];
// Valori „volatile" (live): NU le mai cărăm dacă snapshot-ul e mai vechi de X — altfel RPM-ul ultimei tură apare ca instant deși motorul e oprit/offline.
// (Carburant/odometru rămân sticky oricât — nu se schimbă cât stă mașina parcată. RPM + limita de viteză = volatile, expiră.)
const STICKY_VOLATILE = new Set(['can_engine_rpm', 'speed_limit_sign']);
const STICKY_VOLATILE_MAX_MS = 15 * 60 * 1000;
const lastCanPersistTs = new Map(); // imei -> ts ultimului snapshot persistat în DB (throttle scrieri)
// Doar valori REALE (> 0). Un camion fără date CAN reale trimite 0/lipsă → NU intră în snapshot (altfel apărea
// „0.0 km (ultima)" / „- (ultima)" fals). Carburant/odometru/AdBlue/ore = 0 înseamnă practic „fără citire".
function _stickyOf(io) { const o = {}; if (!io) return o; for (const k of STICKY_CAN) { const v = io[k]; if (v !== undefined && v !== null && Number(v) > 0) o[k] = v; } return o; }
// Completează în targetIo cheile sticky LIPSĂ cu ultima valoare reală din snapshot. Întoarce true dacă a completat ceva.
function _fillSticky(targetIo, snapIo, snapTs) { let c = false; const volStale = (Date.now() - (snapTs || 0)) > STICKY_VOLATILE_MAX_MS; for (const k of STICKY_CAN) { if (volStale && STICKY_VOLATILE.has(k)) continue; const sv = snapIo[k]; if (targetIo[k] === undefined && sv !== undefined && sv !== null && Number(sv) > 0) { targetIo[k] = sv; c = true; } } return c; }
function _persistLastCan(imei, io, ts) {
  const s = _stickyOf(io); if (!Object.keys(s).length) return;
  s._ts = ts || null; lastCanPersistTs.set(imei, ts || 0);
  db.setDeviceLastCan(imei, s).catch(function () {});
}
const activeConnections = new Map(); // IMEI -> socket info

// Contoare cumulative de ingest (de la boot, in-memory) — expuse în /api/debug/live-stats pentru consola de debug (/debug).
const ingestStats = { since: new Date().toISOString(), bytes: 0, connections: 0, rejects: 0, acks: 0, packets: 0, records: 0, parse_errors: 0, partial_parses: 0, archived_drops: 0, insert_fails: 0, live_skips_stale: 0 };

// ─── Debug log (circular buffer) ───
const debugLog = [];
const DEBUG_MAX = 200;

function addDebugEntry(entry) {
  const item = { ...entry, time: new Date().toISOString() };
  debugLog.push(item);
  if (debugLog.length > DEBUG_MAX) debugLog.shift();
  broadcastWs({ type: 'debug', data: item });
}

// ─── Observabilitate: capturare erori centralizată (best-effort, nu aruncă niciodată) ───
async function captureError(err, ctx) {
  ctx = ctx || {};
  const entry = {
    level: ctx.level || 'error',
    message: (err && err.message) ? err.message : String(err),
    stack: (err && err.stack) ? err.stack : null,
    route: ctx.route, method: ctx.method, status: ctx.status,
    userId: ctx.userId, companyId: ctx.companyId, context: ctx.context,
  };
  try { console.error('[ERROR]', entry.level, entry.route || '', '-', entry.message); } catch (_) {}
  try { await db.logError(entry); } catch (_) {}
  errortrack.toSentry(entry).catch(() => {}); // forward opțional la Sentry (dacă SENTRY_DSN setat) — best-effort
}

// Express error middleware — prinde throw-uri sincrone + next(err) din rute. Trebuie înregistrat ULTIMUL (în start()).
function errorMiddleware(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  captureError(err, {
    route: req.originalUrl, method: req.method, status,
    userId: req.session && req.session.userId, companyId: req.companyId,
  });
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status >= 500 ? 'Eroare internă' : (err.message || 'Eroare') });
}

// Handlere de proces — pe un server de tracking live NU oprim procesul, doar logăm (availability > strictețe).
process.on('unhandledRejection', (reason) => {
  captureError(reason instanceof Error ? reason : new Error('unhandledRejection: ' + reason), { level: 'error', context: { kind: 'unhandledRejection' } });
});
process.on('uncaughtException', (err) => {
  captureError(err, { level: 'critical', context: { kind: 'uncaughtException' } });
});

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
// Plafoane de siguranță pe ce acceptăm să ținem în memorie pentru O conexiune.
// Câmpul de lungime al unui pachet AVL e pe 32 de biți: un tracker desincronizat (sau oricine
// deschide un socket și trimite gunoi) putea cere serverului să adune până la 4 GB înainte de
// PRIMA verificare. Un singur dispozitiv defect oprea tot serverul — deci toate companiile.
// Referință: la Teltonika, un pachet AVL real stă în ordinul kilobyților (max 255 înregistrări);
// 128 KB e larg chiar și pentru codec8E cu multe IO-uri.
const MAX_AVL_DATA = 128 * 1024;
const MAX_TCP_BUFFER = 256 * 1024;
const tcpServer = net.createServer((socket) => {
  let imei = null;
  let buffer = Buffer.alloc(0);
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;

  // TCP keepalive: prima probă după 60s idle (default kernel = 7200s = 2h, prea mult).
  // Combinat cu socket.setTimeout de mai jos, detectează GSM-pierdut în ~90s in loc de 2h.
  socket.setKeepAlive(true, 60_000);
  socket.setNoDelay(true); // ACK rapid pe handshake/AVL, fără Nagle buffering

  console.log(`[TCP] Conexiune nouă de la ${clientAddr}`);
  ingestStats.connections++;
  addDebugEntry({ event: 'connect', address: clientAddr });

  socket.on('data', async (data) => {
    ingestStats.bytes += data.length;
    buffer = Buffer.concat([buffer, data]);

    // Plasa de siguranță a memoriei. Dacă am strâns atâta fără să putem încheia un pachet, celălalt
    // capăt nu vorbește protocolul nostru — nu are rost să adunăm mai departe.
    if (buffer.length > MAX_TCP_BUFFER) {
      console.warn(`[TCP] ${imei || clientAddr}: ${buffer.length} octeți nefolosiți în tampon — conexiune închisă`);
      ingestStats.rejects++;
      addDebugEntry({ event: 'reject', imei, address: clientAddr, reason: 'buffer_overflow' });
      buffer = Buffer.alloc(0);
      socket.destroy();
      return;
    }

    try {
      // Pasul 1: Dispozitivul trimite IMEI-ul
      if (!imei) {
        // Primii 2 bytes = lungimea IMEI, restul = IMEI ca text ASCII
        if (buffer.length < 2) return;

        const imeiLength = buffer.readUInt16BE(0);
        if (buffer.length < 2 + imeiLength) return;

        imei = buffer.slice(2, 2 + imeiLength).toString('ascii');
        buffer = buffer.slice(2 + imeiLength);

        // IMEI valid = DOAR cifre (Teltonika trimite 15; acceptăm 10–20). Un „IMEI" ne-numeric NU vine de la un
        // tracker real → îl respingem ÎNAINTE de orice scriere/ACK/notificare. Astfel un payload injectat prin
        // handshake (ex. „<img onerror=…>") nu mai ajunge în DB / în feed-ul de notificări al super-adminului.
        if (!/^\d{10,20}$/.test(imei)) {
          console.warn(`[TCP] IMEI invalid de la ${clientAddr}: „${imei.slice(0, 40)}" — conexiune respinsă`);
          ingestStats.rejects++;
          addDebugEntry({ event: 'reject', address: clientAddr, reason: 'imei_invalid' });
          socket.destroy();
          imei = null;
          return;
        }

        // MOD STRICT: doar IMEI-uri PRE-ÎNREGISTRATE (allow-list) + neRESPINSE. Necunoscut/respins → drop + jurnal,
        // fără creare de rând sau stocare de poziții. Guard: dacă lista încă nu s-a încărcat (fereastra de la boot),
        // NU bloca — evită să pici toate device-urile la pornire.
        if (STRICT_DEVICES && registeredLoaded && (!registeredImeis.has(imei) || archivedImeis.has(imei))) {
          console.warn(`[TCP] IMEI neînregistrat/respins ${imei} de la ${clientAddr} — respins (mod strict)`);
          ingestStats.rejects++;
          addDebugEntry({ event: 'reject', imei, address: clientAddr, reason: 'not_registered' });
          logDeviceAttempt(imei, clientAddr);
          socket.destroy();
          imei = null;
          return;
        }

        console.log(`[TCP] Dispozitiv identificat: IMEI ${imei} de la ${clientAddr}`);
        addDebugEntry({ event: 'imei', imei, address: clientAddr });

        // Salvează conexiunea activă (cu referință la socket pentru destroy() forțat la cleanup zombie).
        // ATENȚIE: când se serializează activeConnections în /api/debug/connections, EXCLUDE câmpul `socket`
        // ca să nu rupă JSON.stringify pe circular reference.
        // Reconectare: dacă există un socket vechi (zombie half-open) pentru același IMEI, închide-l ÎNTÂI, ca să
        // nu rămână în paralel și apoi, la close-ul lui, să șteargă/„deconecteze" din greșeală conexiunea nouă.
        { const _old = activeConnections.get(imei); if (_old && _old.socket && _old.socket !== socket) { try { _old.socket.destroy(); } catch (_) {} } }
        activeConnections.set(imei, {
          address: clientAddr,
          connectedAt: new Date(),
          socket
        });

        // Răspunde cu 0x01 = accept IMEDIAT (înainte de orice operație DB)
        socket.write(Buffer.from([0x01]));
        ingestStats.acks++;

        // Înregistrează dispozitivul în DB — asincron, nu blochează handshake-ul
        db.upsertDevice(imei)
          .then(r => { if (r && r.created) notifyNewDeviceConnected(imei, clientAddr); })
          .catch(e => console.error(`[TCP] upsertDevice ${imei}: ${e.message}`));

        // Init mirror connection to Traccar/OpenRemote if enabled
        try { ensureMirrorConnection(imei); } catch(_) {}
        return;
      }

      // Pasul 2: Dispozitivul trimite pachete AVL
      // Verifică dacă avem destule date (minim 12 bytes: preamble + size + codec + count)
      if (buffer.length < 12) return;

      // Antetul se verifică ÎNAINTE de a mai aștepta octeți, nu după. Altfel un antet aiurit ne
      // punea să acumulăm până la lungimea cerută de el — adică oricât.
      const preamble = buffer.readUInt32BE(0);
      const dataFieldLength = buffer.readUInt32BE(4);
      if (preamble !== 0 || dataFieldLength < 1 || dataFieldLength > MAX_AVL_DATA) {
        // Fluxul e desincronizat: nu putem ști de unde începe pachetul următor, iar a ghici ar
        // însemna să interpretăm gunoi ca poziții. Închidem; trackerul reconectează curat și
        // retrimite ce n-a fost confirmat (ACK-ul se dă doar după scriere).
        console.warn(`[TCP] ${imei}: antet AVL nevalid (preambul ${preamble}, lungime ${dataFieldLength}) — conexiune închisă`);
        ingestStats.parse_errors++;
        addDebugEntry({ event: 'reject', imei, address: clientAddr, reason: 'antet_nevalid' });
        buffer = Buffer.alloc(0);
        socket.destroy();
        return;
      }
      const totalPacketLength = 8 + dataFieldLength + 4; // preamble(4) + size(4) + data + crc(4)

      if (buffer.length < totalPacketLength) return;

      const packet = buffer.slice(0, totalPacketLength);
      buffer = buffer.slice(totalPacketLength);

      // Duplicate raw Teltonika packet to mirror server (if configured)
      try { mirrorSendPacket(imei, packet); } catch (_) {}

      const _iface = await getDeviceIface(imei); // 'fms' (FMC650) sau null (standard/LV-CAN)
      const parsed = parseAvlPacket(packet, _iface);

      if (parsed.error) {
        // Eroare de FRAMING (preamble/codec invalid) — pachet nevalid la nivel de plic, nu îl putem accepta.
        console.error(`[TCP] Eroare parsare de la ${imei}: ${parsed.error}`);
        ingestStats.parse_errors++;
        addDebugEntry({ event: 'error', imei, error: parsed.error });
        socket.write(Buffer.alloc(4, 0)); // răspunde cu 0
        return;
      }

      // ACK-ul NU e o formalitate de protocol: e confirmarea că am păstrat datele. Trackerul Teltonika
      // șterge batch-ul din memoria lui abia după ce îl primește. Trimis ÎNAINTE de scriere, transforma
      // orice pană de bază de date (restart Railway, pool epuizat într-un vârf) în pierdere DEFINITIVĂ,
      // fără urmă recuperabilă — exact plasa de siguranță pe care protocolul o oferă gratis.
      // Acum confirmăm DUPĂ ce scrierea a reușit. Dacă nu reușește, tăcem: trackerul retrimite mai
      // târziu, iar `ON CONFLICT DO NOTHING` face re-scrierea idempotentă, deci nu se duplică nimic.
      // Numărul rămâne cel din HEADER, nu cel al recordurilor valide — altfel un record corupt ar ține
      // trackerul într-o buclă de retrimitere la nesfârșit.
      let _acked = false;
      const _ack = () => {
        if (_acked) return;
        _acked = true;
        const b = Buffer.alloc(4); b.writeUInt32BE(parsed.numberOfRecords); socket.write(b);
        ingestStats.acks++;
      };
      ingestStats.packets++; ingestStats.records += parsed.numberOfRecords || 0;

      // Un record corupt → l-am sărit, dar batch-ul a fost ACK-uit integral (trackerul nu rămâne blocat în resend).
      if (parsed.parseError) {
        console.warn(`[TCP] ${imei}: record corupt sărit (${parsed.parseError}) — ${parsed.records.length}/${parsed.numberOfRecords} recorduri valide`);
        ingestStats.partial_parses++;
        addDebugEntry({ event: 'partial_parse', imei, error: parsed.parseError, valid: parsed.records.length, total: parsed.numberOfRecords });
      }

      console.log(`[TCP] ${imei}: ${parsed.numberOfRecords} recorduri primite`);

      // ── Dispozitiv ARHIVAT: contractul s-a încheiat. Aici confirmăm INTENȚIONAT fără să scriem —
      //    altfel un tracker rămas montat pe o mașină ieșită din contract ar retrimite la nesfârșit.
      //    NU procesăm / NU stocăm / NU actualizăm live. Istoricul vechi rămâne în positions_archive.
      if (archivedImeis.has(imei)) {
        _ack();
        ingestStats.archived_drops++;
        addDebugEntry({ event: 'archived_drop', imei, numberOfRecords: parsed.numberOfRecords });
        return;
      }

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
            if (typeof record.io.can_battery_temp === 'number') record.io.can_battery_temp = record.io.can_battery_temp / 10; // °C ×0.1 (FMS_NAMES id 141)
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

      // Override „contact din DIN1" (dacă e configurat pe vehicul) — ÎNAINTE de stocare + live, ca toate
      // consumatoarele (status, alerte, „motor pornit/oprit de", rapoarte) să vadă contactul corect.
      _applyIgnitionSource(imei, parsed.records);

      // Salvează în baza de date — cu re-încercări scurte. ACK-ul s-a trimis deja (rapid, pt. Teltonika), dar
      // dacă scrierea dă eroare TRANZITORIE (drop conexiune Railway, pool epuizat), reîncercăm în loc să pierdem
      // definitiv batch-ul. ON CONFLICT DO NOTHING face re-scrierile idempotente. La eșec definitiv NU aruncăm
      // (break) → poziția live tot se actualizează din memorie, doar rândul de istoric lipsește (logat).
      if (!parsed.records.length) {
        _ack();   // heartbeat / pachet fără poziții — n-avem ce scrie, dar trackerul așteaptă confirmare
      } else {
        let _scris = false;
        for (let _att = 0; ; _att++) {
          try { await db.insertPositions(imei, parsed.records); _scris = true; break; }
          catch (e) {
            if (_att >= 3) { console.error(`[TCP] insertPositions ${imei} eșuat după ${_att + 1} încercări: ${e.message}`); ingestStats.insert_fails++; addDebugEntry({ event: 'insert_fail', imei, error: e.message }); break; }
            await new Promise(r => setTimeout(r, 200 * (_att + 1)));
          }
        }
        if (_scris) _ack();
        else {
          // NU confirmăm. Trackerul păstrează batch-ul și îl retrimite — singura cale prin care datele
          // supraviețuiesc unei pene de bază. Poziția live se actualizează oricum, din memorie, mai jos:
          // harta rămâne corectă chiar dacă istoricul se scrie abia la retransmisie.
          console.error(`[TCP] ${imei}: batch NEconfirmat (${parsed.numberOfRecords} recorduri) — trackerul îl va retrimite`);
          addDebugEntry({ event: 'nack', imei, numberOfRecords: parsed.numberOfRecords });
        }
      }

      // Trimite batch-ul și către OpenRemote (non-blocking)
      try { forwardToOpenRemote(imei, parsed.records); } catch (_) {}

      // Actualizează poziția live — recordul cu FIX GPS valid și timestamp MAXIM din batch (NU „ultimul din
      // array": un tracker poate trimite recorduri OUT-OF-ORDER / buffer-uite vechi). Heartbeat fără fix
      // (lat=0) ignorat → nu blochează update-ul live (poziție + CAN + alerte).
      let liveRec = null;
      for (let _i = 0; _i < parsed.records.length; _i++) {
        const _r = parsed.records[_i];
        if (_r.gps && _r.gps.latitude !== 0 && (!liveRec || (_r.timestamp || 0) > (liveRec.timestamp || 0))) liveRec = _r;
      }
      if (liveRec) {
        const existing = livePositions.get(imei) || {};
        // GUARD monotonic: NU retrograda poziția LIVE cu un record OUT-OF-ORDER mai vechi decât ce avem deja
        // (buffer flush / ceas device defazat). E salvat în istoric (mai sus); live rămâne pe cel mai NOU —
        // altfel ora „ultimei transmisii" oscilează („ba acum 6 min, ba acum 10h"). Excepție: dacă live-ul
        // curent e în VIITOR (ceas defazat în față), permitem update-ul ca să ieșim din blocaj.
        const _toMs = t => (t == null ? 0 : (typeof t === 'number' ? t : new Date(t).getTime()));
        const _exTs = _toMs(existing.timestamp), _newTs = _toMs(liveRec.timestamp);
        if (_exTs && _newTs && _newTs < _exTs && _exTs <= Date.now() + 120000) {
          ingestStats.live_skips_stale++;
          addDebugEntry({ event: 'live_skip_stale', imei, recTs: _newTs, liveTs: _exTs });
        } else {
        // io: combină CAN-ul din TOT batch-ul (cea mai recentă valoare per cheie) — un record GPS-only la coadă
        // nu mai golește RPM/temp/etc. care au venit mai devreme în același batch.
        const mergedIo = {};
        for (const _r of parsed.records) if (_r.io) Object.assign(mergedIo, _r.io);
        // Identitatea (nume/nr/categorie) din registrul de vehicule (DB, cache 20s) — NU doar din snapshot-ul
        // anterior. Altfel, la un vehicul înregistrat după pornire, plăcuța rămânea null și „se reseta".
        const devInfo = (await getLiveEnrichMap()).get(imei) || {};
        const liveData = {
          imei,
          timestamp: liveRec.timestamp,
          latitude: liveRec.gps.latitude,
          longitude: liveRec.gps.longitude,
          speed: liveRec.gps.speed,
          angle: liveRec.gps.angle,
          satellites: liveRec.gps.satellites,
          io: mergedIo,
          name: devInfo.name || existing.name || null,
          vehicle_type: devInfo.vehicle_type || existing.vehicle_type || null,
          plate: devInfo.plate || existing.plate || null
        };
        // ── Carry-forward CAN „sticky": carburant/odometru + RPM rămân la ultima valoare REALĂ când lipsesc dintr-un pachet ──
        // (NU cărăm viteza, nici temp motorului — temp alimentează alertele de supraîncălzire). Persistăm în DB → supraviețuiește restartului. _stickyOf ignoră 0/spurious.
        const _freshSticky = _stickyOf(liveData.io);
        if (Object.keys(_freshSticky).length > 0) {
          const _prev = lastCanIo.get(imei);
          const _merged = Object.assign({}, _prev && _prev.io, _freshSticky); // acumulează (suportă update parțial)
          lastCanIo.set(imei, { io: _merged, ts: liveRec.timestamp });
          // checkpoint periodic în DB (max ~o scriere / 5 min / device) — ca să nu pierdem date la un crash pe traseu
          if (liveRec.timestamp - (lastCanPersistTs.get(imei) || 0) > 5 * 60 * 1000) _persistLastCan(imei, _merged, liveRec.timestamp);
        }
        // Completează cheile sticky LIPSĂ din pachetul curent (indiferent dacă pachetul are alte chei can_*).
        // can_stale = true DOAR dacă chiar am completat o valoare reală → fără „(ultima)" fals pe camioane fără CAN.
        const _snap = lastCanIo.get(imei);
        const _carried = _snap ? _fillSticky(liveData.io, _snap.io, _snap.ts) : false;
        liveData.can_stale = _carried;
        if (_carried) {
          liveData.can_snapshot_ts = _snap.ts;
          // capturează valoarea „de parcare" în DB o singură dată (prima dată când rămâne fără CAN proaspăt)
          if ((lastCanPersistTs.get(imei) || 0) < (_snap.ts || 0)) _persistLastCan(imei, _snap.io, _snap.ts);
        }
        // Memorie „s-a mișcat recent" (histerezis anti-fals-„staționat" în trafic): reține momentul ultimei viteze reale;
        // se propagă din intrarea live anterioară când viteza curentă e ≤3, ca să nu resetăm memoria la fiecare oprire scurtă.
        try { const _plp = livePositions.get(imei); liveData.moved_at = ((Number(liveData.speed) || 0) > 3) ? new Date(liveData.timestamp).getTime() : ((_plp && _plp.moved_at) || null); } catch (e) {}
        livePositions.set(imei, liveData);

        // Trimite update live prin WebSocket (coalescing opțional via WS_BATCH_MS, vezi broadcastPosition)
        broadcastPosition(liveData);

        // Evaluare alerte automate
        evaluateAlerts(imei, liveData).catch(err => {
          console.error(`[ALERTS] Eroare evaluare alerte pentru ${imei}: ${err.message}`);
        });

        // Evenimente per-utilizator (abonamente + praguri proprii) — 'existing' = poziția anterioară
        evaluateUserEvents(imei, liveData, existing).catch(() => {});

        // Alertă „furt combustibil" (prag per companie) — stare proprie (NU livePositions, care e deja actualizat)
        checkFuelTheft(imei, liveData, undefined).catch(() => {});

        // Alertă „mișcare în afara programului de lucru" (supraveghere flotă)
        checkAfterHoursMovement(imei, liveData).catch(() => {});

        // Track tare automat pentru camioane
        trackTareCandidate(imei, liveData.io || {}).catch(() => {});
        }
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
      // Doar dacă socketul care se închide e CHIAR cel curent — un zombie care moare nu mai dărâmă/„deconectează"
      // conexiunea nouă, validă, a aceluiași IMEI (evită un „disconnect" fals pe un vehicul de fapt online).
      const _e = activeConnections.get(imei);
      if (_e && _e.socket === socket) {
        activeConnections.delete(imei);
        const lastPos = livePositions.get(imei);
        if (lastPos) {
          lastPos.speed = 0;
          livePositions.set(imei, lastPos);
        }
        broadcastWs({ type: 'disconnect', data: { imei } });
      }
    }
  });

  socket.on('error', (err) => {
    console.error(`[TCP] Eroare socket ${imei || clientAddr}: ${err.message}`);
  });

  // Idle timeout aplicativ — închide conexiunea dacă nu primim date 3 min.
  // Coborât de la 10 min: combinat cu keepalive de 60s, dezbrăcăm zombie-i mult mai rapid.
  // Trackerele active raportează la 30-300s, deci 3 min e safe.
  socket.setTimeout(180_000);
  socket.on('timeout', () => {
    console.log(`[TCP] Timeout (3 min idle): ${imei || clientAddr}`);
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
app.use(accessGate);  // abonament expirat → 402 pe TOATE rutele /api (mai puțin cele din ACCESS_FREE)

// ─── Headere de securitate (toate răspunsurile) ───
const _hsts = (process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production');
// CSP permisiv (pas 1): permite inline (index.html are scripturi inline) + CDN-urile/tile-urile folosite.
// Activabil prin CSP_ENABLED!=='false'. Strângem ulterior. frame-ancestors protejează clickjacking.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  if (_hsts) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  if (process.env.CSP_ENABLED !== 'false') res.setHeader('Content-Security-Policy', CSP);
  next();
});

// ─── Rate limiting in-house (per utilizator/IP, fereastră 60s) pe /api ───
// Fără dependențe noi (model loginAttempts). Protejează costul AI + abuzul de date la scară.
const rlBuckets = new Map(); // key -> { count, resetAt }
const RL_GEN = parseInt(process.env.RATE_LIMIT_GEN) || 1200; // ~20 req/s/utilizator (generos, doar anti-abuz/DoS)
const RL_AI = parseInt(process.env.RATE_LIMIT_AI) || 40;     // cost AI (chat RA Insight; plafonul real de cost e limita lunară pe companie)
app.use((req, res, next) => {
  if (process.env.RATE_LIMIT_ENABLED === 'false') return next(); // kill-switch fără redeploy
  const p = req.path || '';
  if (p.indexOf('/api/') !== 0 || p.indexOf('/api/health') === 0) return next();
  const a = getAuth(req);
  const id = (a && a.userId) ? ('u' + a.userId) : ('ip' + clientIp(req));
  const isAi = p.indexOf('/api/ai/') === 0;
  const max = isAi ? RL_AI : RL_GEN;
  const key = id + (isAi ? ':ai' : ':gen');
  const now = Date.now();
  let b = rlBuckets.get(key);
  if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + 60000 }; rlBuckets.set(key, b); }
  b.count++;
  if (rlBuckets.size > 5000) { for (const [k, v] of rlBuckets) if (now > v.resetAt) rlBuckets.delete(k); } // prune oportunist
  if (b.count > max) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    res.setHeader('Retry-After', retry);
    return res.status(429).json({ error: isAi
      ? ('Prea multe întrebări AI într-un minut. Mai așteaptă ~' + retry + 's și reîncearcă. (Întrebările predefinite merg oricum — sunt fără AI.)')
      : 'Prea multe cereri. Reîncearcă în scurt timp.' });
  }
  next();
});

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
// ─── Indexare: robots.txt + sitemap.xml ───────────────────────────────────────────────────────────
// Generate de server, nu fișiere statice: o pagină nouă adăugată în listă intră automat în sitemap,
// iar `lastmod` nu rămâne mințind luni de zile. Adresa se ia din SITE_URL (sau din antetul cererii),
// ca sitemap-ul să nu trimită spre alt domeniu când rulăm pe alt mediu (probe, VPS nou).
const PAGINI_PUBLICE = [
  { cale: '/', prio: '1.0', freq: 'weekly' },
  { cale: '/intrebari-frecvente', prio: '0.8', freq: 'monthly' },
  { cale: '/termeni', prio: '0.3', freq: 'yearly' },
  { cale: '/confidentialitate', prio: '0.3', freq: 'yearly' },
];
function _adresaSite(req) {
  const dinEnv = String(process.env.SITE_URL || '').replace(/\/+$/, '');
  if (dinEnv) return dinEnv;
  return (req.headers['x-forwarded-proto'] || req.protocol || 'https') + '://' + req.get('host');
}
app.get('/robots.txt', (req, res) => {
  // Aplicația în sine n-are ce căuta în index: e în spatele autentificării, iar paginile ei n-ar
  // produce în rezultate decât drumuri care se termină la un ecran de login.
  const randuri = [
    'User-agent: *',
    'Disallow: /app',
    'Disallow: /api/',
    'Disallow: /debug',
    'Disallow: /set-password',
    'Allow: /',
    '',
    'Sitemap: ' + _adresaSite(req) + '/sitemap.xml',
    '',
  ];
  res.type('text/plain').send(randuri.join('\n'));
});
app.get('/sitemap.xml', (req, res) => {
  const baza = _adresaSite(req);
  const azi = new Date().toISOString().slice(0, 10);
  const bucati = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const p of PAGINI_PUBLICE) {
    bucati.push('  <url>');
    bucati.push('    <loc>' + baza + p.cale + '</loc>');
    bucati.push('    <lastmod>' + azi + '</lastmod>');
    bucati.push('    <changefreq>' + p.freq + '</changefreq>');
    bucati.push('    <priority>' + p.prio + '</priority>');
    bucati.push('  </url>');
  }
  bucati.push('</urlset>', '');
  res.type('application/xml').send(bucati.join('\n'));
});
// Adresele „frumoase" ale paginilor publice. Fără ele, un link din sitemap ar da 404, iar Google
// ar raporta erori exact pentru paginile pe care i le-am arătat noi.
app.get('/intrebari-frecvente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get('/termeni', (req, res) => res.sendFile(path.join(__dirname, 'public', 'termeni.html')));
app.get('/confidentialitate', (req, res) => res.sendFile(path.join(__dirname, 'public', 'confidentialitate.html')));

app.get('/app', (req, res) => { res.set('Cache-Control', NO_CACHE); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
// Documentație API pentru clienți (publică, fără secrete)
app.get(['/api-docs', '/docs'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'api-docs.html')));
app.get('/sw.js', (req, res) => { res.set('Cache-Control', NO_CACHE); res.type('application/javascript'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });
// Stylesheet extras: fără cache (la fel ca /app și /sw.js), altfel Cloudflare/edge servește CSS vechi după actualizări.
app.get('/css/app.css', (req, res) => { res.set('Cache-Control', NO_CACHE); res.type('text/css'); res.sendFile(path.join(__dirname, 'public', 'css', 'app.css')); });
// Categoriile de permis, generate din license_cats.js — interfața NU ține o listă proprie. Dacă adaugi
// o categorie sau muți una la „profesionist", se schimbă în același timp și în formular, și în raport.
const _LICENSE_JS = 'window.RA_LICENSE=' + JSON.stringify({
  categories: licenseCats.CATEGORIES, groups: licenseCats.GROUPS, pro: licenseCats.PRO
}) + ';';
app.get('/js/license-cats.js', (req, res) => { res.set('Cache-Control', NO_CACHE); res.type('application/javascript'); res.send(_LICENSE_JS); });

// Tipurile de lucrări la service + lista de acte, tot dintr-o sursă (maint_types.js). Înainte
// erau scrise de mână în două locuri din pagină, cu conținut diferit.
const _MAINT_JS = 'window.RA_MAINT=' + JSON.stringify({ work: maintTypes.WORK, docs: maintTypes.DOCS, classes: maintTypes.CLASSES, classMap: maintTypes.CLASS_MAP }) + ';';
app.get('/js/maint-types.js', (req, res) => { res.set('Cache-Control', NO_CACHE); res.type('application/javascript'); res.send(_MAINT_JS); });

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
    uptime_s: Math.round((Date.now() - _startedAt) / 1000),
    version: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'dev').slice(0, 7),
    fcm: !!_fcm, // push nativ (FCM) activ = FIREBASE_SA_JSON setat + init reușit
    fcm_status: _fcmStatus // 'active' | 'unset' | 'error: <mesaj>'
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

// IP-ul REAL al clientului. NU citim primul element din X-Forwarded-For — acela e scris de client și e
// spoofabil (rotindu-l, un atacator ocolea complet rate-limit-ul de login și polua jurnalul de audit).
// Ordine: CF-Connecting-IP (Cloudflare, în fața noastră) → req.ip (Express, cu `trust proxy` setat) → socket.
// Antetul CF-Connecting-IP e pus de Cloudflare, dar ORICINE îl poate trimite. Dacă aplicația nu stă
// chiar în spatele Cloudflare, oricine își alege singur „IP-ul" și scapă de TOATE limitările pe IP:
// forța brută la login, limita de cereri, capcana formularului de demo. Îl acceptăm doar când spunem
// explicit că suntem în spatele proxy-ului (TRUST_CF_IP=true).
const _TRUST_CF = String(process.env.TRUST_CF_IP || '').toLowerCase() === 'true';
function clientIp(req) {
  if (_TRUST_CF) {
    const cf = req.headers && req.headers['cf-connecting-ip'];
    if (cf) return String(cf).trim();
  }
  if (req.ip) return String(req.ip);
  return req.socket ? req.socket.remoteAddress : null;
}

// ─── Politica de parole — O SINGURĂ regulă, în toate cele patru locuri unde se pune o parolă ───
// Erau praguri diferite (4, 4, 4 și 6 caractere), fără nicio verificare de conținut: un client își
// putea face cont cu „1234". Contul deschide date de localizare ale angajaților și facturi.
const PAROLE_UZUALE = new Set(['parola', 'parola123', 'password', 'password1', '12345678', '123456789',
  '1234567890', 'qwerty123', 'admin123', 'administrator', 'ratracks', 'ratrack', 'welcome1', 'iloveyou',
  'qwertyuiop', 'abcd1234', 'p@ssw0rd', 'passw0rd', 'test1234', 'schimba123']);
const PAROLA_MIN = 10;
// Întoarce un mesaj de eroare, sau null dacă parola e acceptabilă.
function verificaParola(parola, username) {
  const p = String(parola == null ? '' : parola);
  if (p.length < PAROLA_MIN) return 'Parola trebuie să aibă minim ' + PAROLA_MIN + ' caractere.';
  if (p.length > 200) return 'Parola e prea lungă (maxim 200 de caractere).';
  const jos = p.toLowerCase();
  if (PAROLE_UZUALE.has(jos)) return 'Parola asta e prea cunoscută. Alege alta.';
  if (/^(.)\1+$/.test(p)) return 'Parola nu poate fi un singur caracter repetat.';
  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(jos)) return 'Parola nu poate fi o secvență de pe tastatură.';
  if (username) {
    const u = String(username).toLowerCase().split('@')[0];
    if (u.length >= 3 && jos.includes(u)) return 'Parola nu poate conține numele de utilizator.';
  }
  // Cel puțin două feluri de caractere — nu cerem simboluri obligatorii (fac parolele mai slabe, oamenii
  // le notează pe hârtie), dar nici zece litere mici la rând nu e o parolă.
  const feluri = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  if (feluri < 2) return 'Parola trebuie să combine cel puțin două feluri de caractere (litere și cifre, de exemplu).';
  return null;
}

// ─── Ingest erori de client (web + mobil) → error_log + Sentry. Public (erorile pot apărea pre-login), dar rate-limited (20/min/IP) + capat. ───
const _clientErrHits = new Map();
app.post('/api/client-error', (req, res) => {
  try {
    const ip = clientIp(req) || 'x';
    const now = Date.now(); let rec = _clientErrHits.get(ip);
    if (!rec || now - rec.ts > 60000) { rec = { n: 0, ts: now }; _clientErrHits.set(ip, rec); }
    rec.n++;
    if (rec.n > 20) return res.status(429).json({ ok: false });
    const b = req.body || {};
    const src = (b.source === 'mobile') ? 'mobile' : 'web';
    captureError(
      { message: String(b.message || 'client error').slice(0, 1000), stack: b.stack ? String(b.stack).slice(0, 4000) : null },
      {
        level: 'error', route: 'client:' + src,
        userId: (req.session && req.session.userId) || null, companyId: (req.session && req.session.companyId) || null,
        context: { source: src, url: String(b.url || '').slice(0, 300), ua: String((req.headers && req.headers['user-agent']) || '').slice(0, 200), line: b.line, col: b.col },
      }
    );
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

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
        if (u) { c = { ts: Date.now(), role: u.role, companyId: u.company_id, accessUntil: u.access_until }; roleCache.set(uid, c); }
      }
      if (c) {
        req._freshAuth = { role: c.role, companyId: c.companyId, accessUntil: c.accessUntil };
        // Sesiunea deschisă înainte de expirare nu se invalidează singură (cookie 24h) → o oprim aici.
        // Lăsăm doar /api/me și /api/logout, ca interfața să poată afișa motivul și să iasă curat.
        if (userAccessExpired({ access_until: c.accessUntil }) && req.path !== '/api/me' && req.path !== '/api/logout') {
          try { if (req.session) req.session.destroy(function () {}); } catch (e) {}
          roleCache.delete(uid);
          return res.status(403).json({ error: DEMO_EXPIRED_MSG, demo_expired: true });
        }
      }
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
      // Tokenul mobil trăiește 90 de zile — fără verificarea asta, un cont demo expirat ar rămâne logat pe telefon.
      if (user && user.active !== false && !userAccessExpired(user)) {
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
// ─── Identitatea contului: utilizatorul ESTE adresa de email ────────────────────────────────────────
// Regulă pentru conturile NOI: username = email (o singură identitate de reținut, iar recuperarea parolei
// și invitațiile au întotdeauna unde să ajungă). Conturile VECHI cu username clasic („admin") continuă să
// funcționeze neschimbat — nu forțăm o migrare care ar bloca oameni în afara aplicației.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
function normUsername(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
// Căutare tolerantă la MAJUSCULE: cineva care tastează „Ion@Firma.ro" trebuie să intre în contul
// „ion@firma.ro". Întâi potrivire exactă (comportamentul vechi, intact), apoi varianta cu litere mici.
async function findUserForLogin(username) {
  const raw = String(username == null ? '' : username).trim();
  let u = await db.getUserByUsername(raw);
  if (!u) { const lc = raw.toLowerCase(); if (lc !== raw) u = await db.getUserByUsername(lc); }
  return u;
}

// Expirare PER UTILIZATOR (conturi demo temporare). Deliberat SEPARAT de companyAccessStatus(), care
// acordă 15 zile de grație — pentru un demo de 7 zile ar însemna 22. Aici termenul e ferm.
function userAccessExpired(u) {
  return !!(u && u.access_until != null && Date.now() > Number(u.access_until));
}
// Durata unui acces demo. Unitatea internă e ORA (un demo de 2 ore e la fel de legitim ca unul de 30 de zile);
// `days` rămâne acceptat pentru compatibilitate. Plafon 90 de zile, prag minim 1 oră.
const DEMO_MAX_HOURS = 90 * 24;
function _demoDurationHours(body) {
  const b = body || {};
  let h = null;
  if (b.hours != null && Number.isFinite(Number(b.hours))) h = Number(b.hours);
  else if (b.days != null && Number.isFinite(Number(b.days))) h = Number(b.days) * 24;
  if (h == null || !(h > 0)) h = 24 * 7; // implicit: o săptămână
  return Math.min(Math.max(Math.round(h), 1), DEMO_MAX_HOURS);
}
// Text pentru om: „6 ore" / „7 zile" / „2 zile și 6 ore".
function _demoDurationLabel(h) {
  const d = Math.floor(h / 24), r = h % 24;
  if (!d) return h + (h === 1 ? ' oră' : ' ore');
  if (!r) return d + (d === 1 ? ' zi' : ' zile');
  return d + (d === 1 ? ' zi' : ' zile') + ' și ' + r + (r === 1 ? ' oră' : ' ore');
}
const DEMO_EXPIRED_MSG = 'Accesul demo a expirat. Scrie-ne dacă vrei o prelungire sau o ofertă.';

// Gardă anti-blocare: platforma trebuie să rămână MEREU cu cel puțin un super-admin activ.
// Fără asta, doi super-admini se pot „stinge" reciproc (protecția existentă acoperă doar propriul cont)
// și rămâi fără niciun cont care poate administra companiile — recuperabil doar din baza de date.
async function _isLastActiveSuperadmin(targetId) {
  try {
    const t = await db.getUserById(targetId);
    if (!t || t.role !== 'superadmin' || t.active === false) return false;
    const r = await db.pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'superadmin' AND active IS NOT FALSE");
    return (r.rows[0] ? r.rows[0].n : 0) <= 1;
  } catch (e) { return false; } // la eroare NU blocăm operația (fail-open: gardă de siguranță, nu regulă de securitate)
}
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
// Serviciul e ACTIV cât factura e plătită (access_until în viitor). După expirare → 15 zile calendaristice
// de GRAȚIE (încă activ, cu avertisment), apoi EXPIRAT → acces suspendat (poate doar să se logheze + plătească).
const GRACE_DAYS = 15;
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
  const graceUntil = until + GRACE_DAYS * 24 * 60 * 60 * 1000; // 15 zile calendaristice de grație
  let status = 'active';
  if (now > graceUntil) status = 'expired';
  else if (now > until) status = 'grace';
  return { status, access_until: until, grace_until: graceUntil };
}
// ─── Control costuri: status + KPI calculate în JS (nu stocate), pe modelul companyAccessStatus ───
const COST_DUE_SOON_MS = 14 * 86400000; // „scadent curând" = ≤14 zile
function costStatus(c) {
  if (c.active === false) return 'inactive';
  const due = (c.next_due != null) ? Number(c.next_due) : null;
  if (c.cycle === 'one_time' && due == null) return 'paid';
  if (due == null) return 'unknown';
  const now = Date.now();
  if (due < now) return 'overdue';
  if ((due - now) <= COST_DUE_SOON_MS) return 'upcoming';
  return 'active';
}
function computeCostKpis(costs) {
  const by = { RON: { monthly: 0, yearly: 0 }, USD: { monthly: 0, yearly: 0 }, EUR: { monthly: 0, yearly: 0 } };
  let nextDue = null, nextDueProvider = null, overdueCount = 0, upcomingCount = 0, activeCount = 0;
  for (const c of costs) {
    if (c.active === false) continue;
    activeCount++;
    const cur = by[c.currency] || (by[c.currency] = { monthly: 0, yearly: 0 });
    const amt = Number(c.amount) || 0;
    if (c.cycle === 'monthly') { cur.monthly += amt; cur.yearly += amt * 12; }
    else if (c.cycle === 'yearly') { cur.monthly += amt / 12; cur.yearly += amt; }
    // one_time exclus din run-rate
    if (c._status === 'overdue') overdueCount++;
    else if (c._status === 'upcoming') upcomingCount++;
    if (c.next_due != null && (nextDue == null || Number(c.next_due) < nextDue)) { nextDue = Number(c.next_due); nextDueProvider = c.provider; }
  }
  for (const k of Object.keys(by)) { by[k].monthly = Math.round(by[k].monthly * 100) / 100; by[k].yearly = Math.round(by[k].yearly * 100) / 100; }
  return { byCurrency: by, nextDue, nextDueProvider, overdueCount, upcomingCount, activeCount }; // NU se adună între monede
}
// ─── Cash-flow platformă (super-admin): agregare lunară venituri vs cheltuieli ───
// Rate FX identice cu KPI-ul aproximativ din frontend (RAX_FX). Doar pentru a exprima costurile în valută → RON.
const FINANCE_FX = { RON: 1, USD: 4.6, EUR: 5.0 };
const FINANCE_MON_RO = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'noi.', 'dec.'];
// Construiește N buckets lunari consecutivi (cel mai vechi → cel mai nou), terminând cu luna curentă.
function buildFinanceMonths(n) {
  const out = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    out.push({ ym, label: FINANCE_MON_RO[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), income: 0, expenses: 0, profit: 0 });
  }
  return out;
}
function _financeMonthStartMs(ym) { const p = String(ym).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, 1).getTime(); }
function _financeYmOf(ts) { const d = new Date(Number(ts)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function _fin2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
// Normalizează o sumă scrisă RO (virgulă zecimală, punct la mii) → number; { ok, val } (null = gol).
function _parseMoney(raw) {
  const s = (raw != null) ? String(raw).trim() : '';
  if (s === '') return { ok: true, val: null };
  const norm = s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, val: n };
}
// Clasifică sursa de date a unui vehicul: 'fms' (FMS gateway J1939) / 'can' (CAN/LV-CAN/tahograf) / 'none'
// (fără CAN). Folosit în drill-down-ul de companie (super-admin). Se uită la can_interface, la cheile din
// ultima poziție (io_data) și la snapshot-ul CAN persistat (last_can, pentru vehicule parcate).
function classifyDeviceCan(d) {
  const iface = String((d && d.can_interface) || '').toLowerCase();
  if (iface === 'fms') return 'fms';
  const io = (d && (d.io_data || d.io)) || {};
  const keys = Object.keys(io);
  if (keys.some(k => k.indexOf('fms_') === 0)) return 'fms';
  if (keys.some(k => k.indexOf('can_') === 0 || k.indexOf('tacho_') === 0)) return 'can';
  const lc = d && d.last_can;
  if (lc && typeof lc === 'object' && Object.keys(lc).length) return 'can';
  if (iface === 'tacho' || iface === 'lvcan') return 'can';
  return 'none';
}
// Notificare de facturare: când o companie intră în GRAȚIE (abonament tocmai expirat = factură emisă),
// anunță adminii ei o singură dată per ciclu (dedup pe cheia invoice_due:<co>:<access_until>). Au 15 zile.
async function billingReminderTick() {
  const report = { checked: 0, grace: [], notified: [] };
  let companies = [];
  try { companies = await db.getCompanies(); } catch (e) { return report; }
  report.checked = companies.length;
  for (const co of companies) {
    try {
      if (co.access_until == null) continue; // „nelimitat" → fără facturare
      const st = companyAccessStatus(co);
      if (st.status !== 'grace') continue; // notificăm exact la intrarea în grație (după expirarea celor 31 zile)
      report.grace.push(co.id);
      const key = 'invoice_due:' + co.id + ':' + co.access_until;
      if (await db.notificationKeyExists(key, 24 * 40)) continue; // deja notificat pentru acest ciclu (40z > 15 grație)
      const graceDate = new Date(Number(st.grace_until)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
      // Notificare la nivel de companie (user_id = null) → o văd toți utilizatorii ei, inclusiv adminul.
      await db.createNotification({
        type: 'invoice_due', severity: 'warning', companyId: co.id, userId: null,
        title: 'Factură emisă — 15 zile pentru plată',
        body: 'Abonamentul a expirat. Mai aveți 15 zile de grație (până la ' + graceDate + ') să înregistrați plata, altfel accesul se suspendă.',
        data: { key: key, grace_until: st.grace_until, access_until: co.access_until }
      });
      report.notified.push(co.id);
      // Email de reamintire (dacă SMTP e configurat + companie are email).
      if (mailer && mailer.enabled() && co.contact_email) {
        mailer.send({ to: co.contact_email, subject: 'RA Tracks — abonament de reînnoit (15 zile grație)', html: '<p>Bună ziua,</p><p>Abonamentul de monitorizare GPS a expirat. Mai aveți <b>15 zile</b> de grație (până la ' + _he(graceDate) + ') să achitați, altfel accesul se suspendă.</p><p>Vă mulțumim,<br>RA Tracks</p>' }).catch(function () {});
      }
    } catch (e) { /* per-company, best-effort */ }
  }
  return report;
}
// Escape HTML minimal pentru email-uri (valori dinamice companie/emitent).
function _he(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Corpul de email pentru o factură emisă (rezumat + instrucțiuni plată).
function _invoiceEmailHtml(inv, iss) {
  const money = function (n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const due = inv.due_date ? new Date(Number(inv.due_date)).toLocaleDateString('ro-RO') : '';
  iss = iss || {};
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2235;">' +
    '<div style="background:#16a34a;color:#fff;padding:18px 20px;border-radius:10px 10px 0 0;"><h2 style="margin:0;font-size:19px;">RA Tracks — Factura ' + _he(inv.full_number) + '</h2></div>' +
    '<div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px;">' +
      '<p>Bună ziua,</p><p>Am emis factura pentru abonamentul de monitorizare GPS:</p>' +
      '<table style="width:100%;font-size:14px;margin:12px 0;border-collapse:collapse;">' +
        '<tr><td style="padding:5px 0;color:#475569;">Serie / număr</td><td style="text-align:right;font-weight:700;">' + _he(inv.full_number) + '</td></tr>' +
        '<tr><td style="padding:5px 0;color:#475569;">Total de plată</td><td style="text-align:right;font-weight:800;color:#16a34a;font-size:18px;">' + money(inv.total) + ' lei</td></tr>' +
        (due ? '<tr><td style="padding:5px 0;color:#475569;">Scadență</td><td style="text-align:right;">' + _he(due) + '</td></tr>' : '') +
      '</table>' +
      (iss.iban ? '<p style="font-size:13px;color:#475569;">Plată prin transfer în contul <b>' + _he(iss.iban) + '</b>' + (iss.bank ? ' (' + _he(iss.bank) + ')' : '') + ', beneficiar <b>' + _he(iss.name || '') + '</b>.</p>' : '') +
      '<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Factura fiscală este disponibilă și în platformă. Vă mulțumim!</p>' +
    '</div></div>';
}
// ─── Facturare AUTOMATĂ lunară: pe ziua de facturare a companiei (auto_invoice=true) emite factura lunii, o notifică,
//     o trimite la ANAF (dacă e activ) și pe email (dacă SMTP e setat). IDEMPOTENT: o singură factură/companie/lună. ───
async function billingAutoInvoiceTick() {
  if (!plans) return { ran: false };
  const now = new Date(), day = now.getDate();
  let companies = [];
  try { companies = await db.getCompanies(); } catch (e) { return { ran: false, error: e.message }; }
  let iss = {}; try { iss = ((await getSystemSettings()).invoice_issuer) || {}; } catch (e) {}
  const canIssue = !!(iss.name && iss.cui);
  const out = { ran: true, issued: [], skipped: 0 };
  const ym = now.getFullYear() + '-' + (now.getMonth() + 1);
  for (const co of companies) {
    try {
      if (co.is_demo || co.auto_invoice !== true) { out.skipped++; continue; }
      const billDay = Math.max(1, Math.min(parseInt(co.billing_day) || 1, 28));
      if (day < billDay) continue;               // încă nu a venit ziua de facturare
      if (!canIssue) continue;                    // fără „Date emitent" (nume+CUI) nu putem emite
      const existing = await db.getInvoices({ companyId: co.id, limit: 24 });
      const already = (existing || []).some(function (v) { const d = new Date(Number(v.issue_date)); return v.type === 'invoice' && (d.getFullYear() + '-' + (d.getMonth() + 1)) === ym; });
      if (already) continue;                      // deja emisă luna asta
      const calc = buildInvoiceLines(co, await _companyBillCounts(co), plans.featuresFor(co), _issuerVatRate(iss));
      if (!calc.lines.length || calc.total <= 0) continue;
      const num = await db.nextInvoiceNumber(INV_SERIES, now.getFullYear());
      const ps = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const pe = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 0).getTime();
      const termDays = Math.max(0, parseInt(co.payment_term_days) || 15);
      const inv = await db.createInvoice({
        companyId: co.id, series: num.series, number: num.number, year: num.year, fullNumber: num.full,
        type: 'invoice', status: 'issued', issueDate: Date.now(), dueDate: Date.now() + termDays * 86400000, periodStart: ps, periodEnd: pe, currency: 'RON',
        subtotal: calc.subtotal, vatAmount: calc.vatAmount, total: calc.total, lines: calc.lines, issuer: iss, client: _clientSnapshot(co), note: 'Factură lunară automată', createdBy: null
      });
      await db.createNotification({ type: 'invoice_issued', severity: 'info', companyId: co.id, userId: null, title: 'Factură nouă: ' + num.full, body: 'Am emis factura lunară de ' + calc.total.toFixed(2) + ' lei. Scadență în ' + termDays + ' zile.', data: { invoiceFull: num.full, total: calc.total } }).catch(function () {});
      // e-Factura ANAF: eșecul era ÎNGHIȚIT (catch gol) → dacă ANAF respingea factura, nimeni nu afla.
      if (efactura && efactura.enabled()) {
        try {
          const r = await efactura.uploadInvoice(inv, {});
          if (r.ok) await db.updateInvoice(inv.id, { efacturaStatus: 'uploaded', efacturaId: r.index });
          else { console.error('[E-FACTURA] ANAF a respins factura ' + num.full + ':', r.error || 'eroare necunoscută'); await db.updateInvoice(inv.id, { efacturaStatus: 'error', efacturaError: String(r.error || 'respinsă de ANAF').slice(0, 300) }).catch(function () {}); }
        } catch (e) {
          console.error('[E-FACTURA] EȘEC la trimiterea facturii ' + num.full + ':', e.message);
          try { captureError(e, { route: 'efactura-auto-upload', context: { invoice: num.full } }); } catch (_) {}
          await db.updateInvoice(inv.id, { efacturaStatus: 'error', efacturaError: String(e.message).slice(0, 300) }).catch(function () {});
        }
      }
      if (mailer && mailer.enabled() && co.contact_email) { mailer.send({ to: co.contact_email, subject: 'Factură ' + num.full + ' — RA Tracks', html: _invoiceEmailHtml(inv, iss), text: 'Factura ' + num.full + ', total ' + calc.total.toFixed(2) + ' lei.' }).catch(function () {}); }
      out.issued.push(num.full);
      console.log('[BILLING] factură automată ' + num.full + ' → companie #' + co.id + ' (' + calc.total.toFixed(2) + ' lei)');
    } catch (e) { console.warn('[BILLING] auto-invoice co #' + co.id + ':', e.message); }
  }
  return out;
}
// ─── Program de lucru + alertă „mișcare în afara programului" (supraveghere flotă) ───
// Program per companie (settings.work_schedule) + override pe grup / vehicul. Detecție la ingest, cooldown per vehicul.
const WORK_SCHED_COOLDOWN_MS = Math.max(60000, (parseInt(process.env.WORK_SCHED_COOLDOWN_MIN) || 30) * 60000);
let _wsCompany = new Map(), _wsGroup = new Map(), _wsDevice = new Map(), _wsDevMeta = new Map();
const _wsCooldown = new Map();
async function loadWorkSchedules() {
  if (!workSched) return;
  try {
    const cMap = new Map();
    const cs = await db.pool.query('SELECT id, settings FROM companies');
    for (const r of cs.rows) { let s = r.settings; if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } } if (s && s.work_schedule) cMap.set(r.id, s.work_schedule); }
    const gMap = new Map();
    try { const gs = await db.pool.query('SELECT id, work_schedule FROM device_groups WHERE work_schedule IS NOT NULL'); for (const r of gs.rows) { if (r.work_schedule) gMap.set(r.id, r.work_schedule); } } catch (e) {}
    const dMap = new Map(), metaMap = new Map();
    const ds = await db.pool.query("SELECT imei, company_id, group_id, name, plate, work_schedule FROM devices WHERE status IS DISTINCT FROM 'archived'");
    for (const r of ds.rows) { metaMap.set(r.imei, { companyId: r.company_id, groupId: r.group_id, name: r.name, plate: r.plate }); if (r.work_schedule) dMap.set(r.imei, r.work_schedule); }
    _wsCompany = cMap; _wsGroup = gMap; _wsDevice = dMap; _wsDevMeta = metaMap;
  } catch (e) { console.warn('[WORKSCHED] load:', e.message); }
}
// Rezolvă programul unui vehicul: override vehicul → override grup → program companie.
function resolveWorkSchedule(imei) {
  if (_wsDevice.has(imei)) return _wsDevice.get(imei);
  const meta = _wsDevMeta.get(imei);
  if (meta) {
    if (meta.groupId != null && _wsGroup.has(meta.groupId)) return _wsGroup.get(meta.groupId);
    if (meta.companyId != null && _wsCompany.has(meta.companyId)) return _wsCompany.get(meta.companyId);
  }
  return null;
}
// La ingest: dacă vehiculul SE MIȘCĂ în afara programului → o alertă (cu cooldown per vehicul).
async function checkAfterHoursMovement(imei, liveData) {
  if (!workSched) return;
  if (!((Number(liveData.speed) || 0) > 3)) return;                 // DOAR mișcare (deplasare)
  const sched = resolveWorkSchedule(imei);
  if (!sched || !sched.enabled) return;
  const nowMs = new Date(liveData.timestamp).getTime() || Date.now();
  if (workSched.isWithin(sched, nowMs)) return;                     // e în program → ok
  if (Date.now() - (_wsCooldown.get(imei) || 0) < WORK_SCHED_COOLDOWN_MS) return; // o alertă / sesiune
  _wsCooldown.set(imei, Date.now());
  const meta = _wsDevMeta.get(imei) || {};
  const plate = meta.plate || meta.name || imei;
  const tz = sched.tz || 'Europe/Bucharest';
  const timeStr = new Date(nowMs).toLocaleString('ro-RO', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  try {
    await notify({ type: 'after_hours_move', severity: 'warning', imei: imei, companyId: (meta.companyId != null ? meta.companyId : null), userId: null,
      title: '⚠ Mișcare în afara programului', body: plate + ' s-a deplasat în afara programului de lucru (ora ' + timeStr + ').',
      data: { imei: imei, at: nowMs, lat: liveData.latitude, lng: liveData.longitude, speed: Math.round(Number(liveData.speed) || 0) } });
  } catch (e) { /* best-effort */ }
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
// Căi care rămân deschise unui cont cu abonamentul expirat — altfel omul e blocat ȘI din a-și rezolva
// situația. Include explicit `/api/invoices`: linkul de plată e `/api/invoices/:id/pay-link`, NU sub
// `/api/billing`, deci înainte era blocat exact endpointul prin care clientul ar fi putut plăti.
const ACCESS_FREE = [
  '/api/health', '/api/login', '/api/logout', '/api/me', '/api/mobile/login',
  '/api/auth/', '/api/public/', '/api/billing', '/api/invoices', '/api/client-error', '/api/demo/login'
];
function _accessFreePath(p) {
  for (let i = 0; i < ACCESS_FREE.length; i++) { const a = ACCESS_FREE[i]; if (p === a || p.indexOf(a) === 0) return true; }
  return false;
}
async function _accessBlocked(req, res) {
  if (req.isSuper || req.companyId == null) return false;
  if (_accessFreePath(req.path || req.originalUrl || '')) return false;
  try {
    if ((await _accessStatusCached(req.companyId)).status === 'expired') {
      res.status(402).json({ error: 'Abonament expirat — acces suspendat. Contactați furnizorul.', access_expired: true });
      return true;
    }
  } catch (e) { /* la eroare nu blocăm */ }
  return false;
}

// Aceeași verificare, dar ca middleware GLOBAL. `_accessBlocked` rula doar din withCompany/withScope, deci
// orice rută montată cu `requireAuth` simplu sau doar cu `requirePerm` o ocolea — printre ele catalogul de
// rapoarte, Istoricul rapoartelor ȘI descărcarea unui raport din istoric, raportul săptămânal, map-matching-ul
// și limitele de viteză. Adică un client cu abonamentul expirat își lua în continuare rapoartele.
// Montat o singură dată, imediat după refreshAuth: o singură regulă, valabilă pentru toate rutele viitoare.
async function accessGate(req, res, next) {
  try {
    const p = req.path || '';
    if (p.indexOf('/api') !== 0 || _accessFreePath(p)) return next();
    const a = getAuth(req);
    if (!a || !a.userId) return next();          // neautentificat → se ocupă requireAuth
    if (isSuper(a.role)) return next();
    const cid = (a.companyId !== undefined && a.companyId !== null) ? a.companyId : await resolveCompanyId(a);
    if (cid == null) return next();
    if ((await _accessStatusCached(cid)).status === 'expired') {
      return res.status(402).json({ error: 'Abonament expirat — acces suspendat. Contactați furnizorul.', access_expired: true });
    }
  } catch (e) { /* fail-open, ca și înainte: o eroare de interogare nu blochează platforma */ }
  next();
}

// Rezolvă vehiculele țintă pentru rapoarte (respectă accesul). null => 403.
// Filtru zile/ore pentru rapoarte (layoutul cascadă): days=mon,tue,... + hoursFrom/hoursTo (HH:MM; poate trece peste miezul nopții).
function parseReportTimeFilter(q) {
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  let days = null;
  if (q.days) { const l = String(q.days).toLowerCase().split(',').map(s => s.trim()).filter(d => DAYS.indexOf(d) >= 0); if (l.length && l.length < 7) days = l; }
  const hm = v => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) ? v.trim() : null;
  let from = hm(q.hoursFrom), to = hm(q.hoursTo);
  if (!(from && to) || (from === '00:00' && (to === '23:59' || to === '00:00'))) { from = null; to = null; }
  if (!days && !from) return null;
  return { days, from, to, tz: 'Europe/Bucharest' };
}
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
    return devs.filter(d => d.status !== 'archived').map(d => d.imei); // exclude vehiculele ARHIVATE din rapoarte/analitice
  }
  return Array.from(req.allowedImeis).filter(im => canAccessImei(req, im) && !archivedImeis.has(im)); // fără arhivate
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

// Rate-limit login: per IP (max 10 eșecuri / 15 min) ȘI per CONT (max 12 / 15 min).
// Cheia pe cont e esențială: e imună la spoofing de IP (X-Forwarded-For / IPv6 rotativ / botnet),
// deci un atac distribuit pe un singur user rămâne blocat chiar dacă fiecare cerere vine de pe alt IP.
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000, LOGIN_MAX_IP = 10, LOGIN_MAX_USER = 12;
function _lkUser(u) { return 'u:' + String(u || '').trim().toLowerCase(); }
function _lkIp(ip) { return 'i:' + (ip || 'x'); }
function _lBlocked(key, max) {
  const rec = loginAttempts.get(key);
  return !!(rec && (Date.now() - rec.ts) < LOGIN_WINDOW_MS && rec.count >= max);
}
function _lFail(key) {
  const now = Date.now();
  let rec = loginAttempts.get(key);
  if (!rec || (now - rec.ts) > LOGIN_WINDOW_MS) rec = { count: 0, ts: now };
  rec.count++; rec.ts = now;
  loginAttempts.set(key, rec);
  if (loginAttempts.size > 20000) { // plafon anti-OOM: curăță intrările expirate
    for (const [k, v] of loginAttempts) if ((now - v.ts) > LOGIN_WINDOW_MS) loginAttempts.delete(k);
  }
}
function loginBlocked(ip, username) { return _lBlocked(_lkIp(ip), LOGIN_MAX_IP) || (username ? _lBlocked(_lkUser(username), LOGIN_MAX_USER) : false); }
function recordLoginFail(ip, username) { _lFail(_lkIp(ip)); if (username) _lFail(_lkUser(username)); }
function clearLoginFails(ip, username) { loginAttempts.delete(_lkIp(ip)); if (username) loginAttempts.delete(_lkUser(username)); }

// ─── Rute autentificare ───

// Login
app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    }
    if (loginBlocked(ip, username)) {
      return res.status(429).json({ error: 'Prea multe încercări. Reîncearcă peste 15 minute.' });
    }

    const user = await findUserForLogin(username); // emailul se poate tasta cu MAJUSCULE
    if (!user) {
      recordLoginFail(ip, username);
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordLoginFail(ip, username);
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    if (user.active === false) {
      return res.status(403).json({ error: 'Cont dezactivat. Contactează administratorul.' });
    }
    // Cont demo cu termen depășit: refuzat la POARTĂ, nu doar ascuns după autentificare.
    if (userAccessExpired(user)) return res.status(403).json({ error: DEMO_EXPIRED_MSG, demo_expired: true });

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

    clearLoginFails(ip, username);
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

// Login mobil (nativ): emite un TOKEN (cheie API) în loc de cookie de sesiune — webview-ul Capacitor nu poate
// folosi cookie-uri cross-site. Tokenul se stochează în secure storage pe telefon și se trimite ca `Authorization: Bearer`.
// Cheia moștenește automat rolul + accesul la vehicule al userului (getUserByApiKey), deci e scopată corect.
app.post('/api/mobile/login', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { username, password, device } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    if (loginBlocked(ip, username)) return res.status(429).json({ error: 'Prea multe încercări. Reîncearcă peste 15 minute.' });
    const user = await findUserForLogin(username); // idem web: tastarea cu majuscule nu blochează accesul
    if (!user) { recordLoginFail(ip, username); return res.status(401).json({ error: 'Username sau parola greșită' }); }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { recordLoginFail(ip, username); return res.status(401).json({ error: 'Username sau parola greșită' }); }
    if (user.active === false) return res.status(403).json({ error: 'Cont dezactivat. Contactează administratorul.' });
    if (userAccessExpired(user)) return res.status(403).json({ error: DEMO_EXPIRED_MSG, demo_expired: true });
    let company = null, features = null, access = null;
    if (user.company_id != null) {
      try {
        const co = await db.getCompanyById(user.company_id);
        if (co) {
          access = companyAccessStatus(co);
          if (!isSuper(user.role) && access.status === 'expired') return res.status(402).json({ error: 'Abonament expirat — accesul este suspendat până la reînnoire. Contactați furnizorul.', access_expired: true });
          company = { id: co.id, name: co.name, is_demo: !!co.is_demo };
          features = plans ? plans.featuresFor(co) : null;
        }
      } catch (e) { /* lăsăm login-ul să continue */ }
    }
    if (!features) features = { agents: true, ai_assistant: true, etransport: true, tahograf: true };
    clearLoginFails(ip, username);
    const token = 'gpsk_' + crypto.randomBytes(24).toString('hex');
    // Token mobil cu expirare 90 zile (telefonul = vector de scurgere); clientul re-loghează la 401.
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await db.createApiKey(user.id, 'mobile:' + (String(device || 'app').slice(0, 40)), hashApiKey(token), token.slice(0, 12), expiresAt);
    db.setUserLastLogin(user.id).catch(() => {});
    db.logAudit({ userId: user.id, username: user.username, action: 'mobile_login', entity: 'session', ip });
    res.json({ token, expires_at: expiresAt.toISOString(), username: user.username, role: user.role, permissions: permsFor(user.role), companyId: user.company_id != null ? user.company_id : null, isSuper: isSuper(user.role), company, features, access });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  let ann = '', auto = null, off = null, spd = null, issuer = null;
  try { [ann, auto, off, spd, issuer] = await Promise.all([db.getSetting('announcement'), db.getSetting('agents_auto'), db.getSetting('offline_minutes'), db.getSetting('default_speed_limit'), db.getSetting('invoice_issuer')]); } catch (e) {}
  let issuerObj = {}; try { issuerObj = issuer ? JSON.parse(issuer) : {}; } catch (e) { issuerObj = {}; }
  _sysCache = { announcement: ann || '', agents_auto: auto !== 'off', offline_minutes: (Number(off) > 0 ? Number(off) : 65), default_speed_limit: (Number(spd) > 0 ? Number(spd) : 90), invoice_issuer: issuerObj };
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
  // Numele afișat: e ce vede omul în aplicație (bara de sus), în locul adresei de email cu care s-a logat.
  let fullName = null;
  try { if (a.userId) { const _u = await db.getUserById(a.userId); if (_u) fullName = _u.full_name || null; } } catch (e) {}
  res.json({
    username: a.username, full_name: fullName, role: a.role, permissions: permsFor(a.role), viaApiKey: !!a.viaApiKey,
    accessUntil: (req._freshAuth && req._freshAuth.accessUntil != null) ? Number(req._freshAuth.accessUntil) : null,
    isSuper: isSuper(a.role), companyId: company ? company.id : null, company, features, access,
    announcement: sys.announcement, offline_minutes: sys.offline_minutes
  });
});

// Demo: autentificare rapidă în contul demo (read-only, companie izolată) — pentru butonul de pe landing
// Demo-ul NU se mai ia singur de pe site. Ruta veche era login FĂRĂ parolă, fără limitare de rată și
// fără regenerarea sesiunii — adică oricine putea deschide o sesiune validă (și, prin CSRF, putea înlocui
// cookie-ul unui utilizator real). Acum accesul demo se cere din formularul public și îl aprobă un
// super-admin, cu durată limitată. Răspundem 410 (nu 404) ca să se vadă că ruta a existat și a fost retrasă.
app.post('/api/demo/login', (req, res) => {
  res.status(410).json({ error: 'Contul demo se acordă la cerere. Completează formularul de pe site și îl aprobăm noi.', requestUrl: '/#contact' });
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
    const { password, role, email, phone } = req.body;
    const username = normUsername(req.body.username);
    const full_name = String(req.body.full_name == null ? '' : req.body.full_name).trim();
    if (!username || !password) {
      return res.status(400).json({ error: 'Emailul și parola sunt obligatorii' });
    }
    // Conturile NOI se creează pe adresa de email (vezi normUsername/EMAIL_RE)
    if (!EMAIL_RE.test(username)) {
      return res.status(400).json({ error: 'Utilizatorul trebuie să fie o adresă de email validă (ex. ion.popescu@firma.ro)' });
    }
    { const e = verificaParola(password, username); if (e) return res.status(400).json({ error: e }); }
    if (full_name.length < 2) {
      return res.status(400).json({ error: 'Numele afișat este obligatoriu (așa apare persoana în aplicație)' });
    }
    // company_admin poate atribui doar roluri din companie (nu superadmin); super-admin poate orice
    const allowed = req.isSuper ? VALID_ROLES : COMPANY_ASSIGNABLE_ROLES;
    const finalRole = allowed.includes(role) ? role : 'viewer';
    // compania noului user: a adminului; super-adminul poate specifica ?company / body.company_id
    let companyId = req.companyId;
    if (req.isSuper) companyId = (req.body.company_id != null ? parseInt(req.body.company_id) : null);
    // Un super-admin e cont de PLATFORMĂ: nu aparține niciunei companii. Chiar dacă interfața trimite din
    // greșeală o companie, o ignorăm — altfel filtrele pe companie s-ar aplica peste un cont care trebuie să vadă tot.
    if (isSuper(finalRole)) companyId = null;
    if (!isSuper(finalRole) && companyId == null) {
      return res.status(400).json({ error: 'Selectează compania pentru utilizator' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username-ul există deja' });
    }

    const hash = await bcrypt.hash(password, 10);
    // Emailul contului = username-ul. Îl salvăm explicit ca recuperarea parolei și invitațiile să aibă
    // întotdeauna o adresă, fără să depindă de un al doilea câmp completat de mână.
    const user = await db.createUser(username, hash, finalRole, { full_name, email: (email && String(email).trim()) || username, phone, company_id: companyId });
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
    // Ultimul super-admin activ nu poate fi retrogradat sau dezactivat (rămâneai fără acces la platformă)
    if ((active === false || (role && role !== 'superadmin')) && await _isLastActiveSuperadmin(id)) {
      return res.status(400).json({ error: 'Acesta e ultimul super-admin activ — creează altul înainte de a-l retrograda sau dezactiva.' });
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
    { const e = verificaParola(password, null); if (e) return res.status(400).json({ error: e }); }
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
    if (await _isLastActiveSuperadmin(id)) {
      return res.status(400).json({ error: 'Acesta e ultimul super-admin activ — creează altul înainte de a-l șterge.' });
    }
    await db.deleteUser(id);
    invalidateAccessCache(id);
    await syncDemoSim('utilizator șters').catch(() => {}); // dacă era ultimul cont demo, simulatorul se oprește
    auditReq(req, 'delete', 'user', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit log (doar admin) — company_admin vede doar compania lui; super-admin vede tot
app.get('/api/audit', requireAuth, requireSuperadmin, withCompany, async (req, res) => { // DOAR super-admin (jurnalul e global, cross-tenant)
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
    if (req.query.hard === '1') {
      // Ștergere definitivă (scoate înregistrarea). Revocarea simplă (mai jos) doar dezactivează cheia.
      await db.deleteApiKey(id);
      auditReq(req, 'delete', 'apikey', req.params.id);
      return res.json({ ok: true, deleted: true });
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
// Utilizare AI per asistent (kind) — pentru panoul „Asistenți AI" (Analize statistice). Scope pe companie; super-adminul poate filtra.
app.get('/api/ai/usage-stats', requireAuth, withScope, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    const companyId = req.isSuper ? (req.filterCompanyId != null ? req.filterCompanyId : null) : req.companyId;
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 0), 3650);
    const usage = await db.getAiUsageByKind(companyId, days);
    res.json({ days, enabled: ai.aiEnabled(), model: ai.AI_MODEL, usage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
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
// UN SINGUR contor: cota pe lună calendaristică. Limita veche `ai_monthly_limit` nu mai blochează
// separat — e preluată ca valoare de cotă în aiQuotaState (vezi acolo), ca să nu mai existe două
// robinete cu reguli diferite care se contrazic în fața clientului.
async function aiLimitReached(companyId) {
  if (companyId == null) return false;
  try { return !!(await aiQuotaState(companyId)).blocked; } catch (e) { return false; }
}
// ─── Cotă AI per companie (negociată în ofertă), pe LUNĂ CALENDARISTICĂ ───
// settings.ai_quota = { questions: 50, overage: true, overagePriceEur: 0.20 }
//   questions      = câte întrebări sunt incluse în abonament (0/absent = nelimitat)
//   overage        = are voie să depășească (contra cost) sau se blochează la epuizare
//   overagePriceEur= cât costă clientul fiecare întrebare peste cotă
const AI_OVERAGE_PRICE_EUR = Number(process.env.AI_OVERAGE_PRICE_EUR) || 0.20;
function _aiQuotaFromSettings(settings) {
  const s = (settings && (typeof settings === 'string' ? (function () { try { return JSON.parse(settings); } catch (e) { return {}; } })() : settings)) || {};
  const q = s.ai_quota || {};
  const n = Number(q.questions);
  return {
    questions: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,   // 0 = nelimitat
    overage: q.overage !== false,                                  // implicit: poate depăși
    overagePriceEur: (Number.isFinite(Number(q.overagePriceEur)) && Number(q.overagePriceEur) >= 0) ? Number(q.overagePriceEur) : AI_OVERAGE_PRICE_EUR
  };
}
// Starea contorului pentru o companie: cât a folosit, cât mai are, dacă e pe cost suplimentar.
async function aiQuotaState(companyId) {
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const base = { questions: 0, used: 0, remaining: null, unlimited: true, overage: true, overagePriceEur: AI_OVERAGE_PRICE_EUR, overageCount: 0, overageCostEur: 0, blocked: false, periodEnd: periodEnd.toISOString() };
  if (companyId == null) return base; // super-admin: fără cotă
  let co = null; try { co = await db.getCompanyById(companyId); } catch (e) {}
  const q = _aiQuotaFromSettings(co && co.settings);
  // Compatibilitate: dacă un client are doar limita VECHE (`ai_monthly_limit`), o folosim ca număr de
  // apeluri incluse, fără drept de depășire (vechea limită bloca dur). Așa rămâne un singur contor,
  // iar clientul vede în sfârșit în interfață de ce s-a oprit.
  const legacy = Number(co && co.ai_monthly_limit) || 0;
  if (!q.questions && legacy > 0) { q.questions = Math.round(legacy); q.overage = false; }
  let used = 0;
  try { used = (await db.getAiMonthUsage(companyId)).questions; } catch (e) {}
  if (!q.questions) return Object.assign(base, { used: used, overage: q.overage, overagePriceEur: q.overagePriceEur });
  const overageCount = Math.max(0, used - q.questions);
  return {
    questions: q.questions, used: used,
    remaining: Math.max(0, q.questions - used),
    unlimited: false, overage: q.overage, overagePriceEur: q.overagePriceEur,
    overageCount: overageCount,
    overageCostEur: Math.round(overageCount * q.overagePriceEur * 100) / 100,
    blocked: overageCount > 0 && !q.overage,   // a depășit ȘI nu are voie pe cost suplimentar
    periodEnd: periodEnd.toISOString()
  };
}
// ─── Curs valutar EUR→RON (BNR, oficial) — pentru ofertare/facturare în ambele monede ───
// BNR publică o dată pe zi lucrătoare (~13:00). Cache în memorie; dacă interogarea eșuează,
// păstrăm ultima valoare bună, iar la pornire cădem pe EUR_RON_RATE (implicit 5.0).
const EUR_RON_FALLBACK = Number(process.env.EUR_RON_RATE) || 5.0;
let _fx = { eur: EUR_RON_FALLBACK, date: null, source: 'fallback', fetchedAt: 0 };
async function fxEurRon() {
  const DAY = 12 * 3600 * 1000; // reîncearcă de 2 ori pe zi, suficient pentru un curs zilnic
  if (_fx.fetchedAt && (Date.now() - _fx.fetchedAt) < DAY) return _fx;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const xml = await fetch('https://www.bnr.ro/nbrfxrates.xml', { signal: ctrl.signal }).then(r => r.ok ? r.text() : null);
    clearTimeout(t);
    if (xml) {
      const m = xml.match(/<Rate[^>]*currency="EUR"[^>]*>([\d.]+)<\/Rate>/i);
      const d = xml.match(/<Cube[^>]*date="([\d-]+)"/i);
      const v = m ? parseFloat(m[1]) : NaN;
      if (Number.isFinite(v) && v > 1 && v < 100) _fx = { eur: v, date: (d && d[1]) || null, source: 'BNR', fetchedAt: Date.now() };
    }
  } catch (e) { /* rețea/BNR indisponibil → păstrăm ultima valoare bună */ }
  if (!_fx.fetchedAt) _fx.fetchedAt = Date.now(); // nu insista la fiecare cerere dacă BNR e jos
  return _fx;
}
app.get('/api/fx', requireAuth, async (req, res) => {
  try { const f = await fxEurRon(); res.json({ eur: f.eur, date: f.date, source: f.source }); }
  catch (e) { res.json({ eur: EUR_RON_FALLBACK, date: null, source: 'fallback' }); }
});
// Privire de ansamblu (super-admin): cine folosește RA Insight, cât din cotă a consumat și cât ne costă.
// Răspunde la „ce procent din clienți folosesc efectiv asistentul" — nu doar cine îl are activat.
app.get('/api/admin/ai-usage', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const [companies, usage] = await Promise.all([db.getCompanies(), db.getAiMonthUsageByCompany()]);
    const byId = {}; usage.forEach(function (u) { byId[u.company_id] = u; });
    const rows = companies.filter(function (c) { return !c.is_demo; }).map(function (c) {
      const u = byId[c.id] || {};
      const feats = plans ? plans.featuresFor(c) : {};
      const q = _aiQuotaFromSettings(c.settings);
      const used = Number(u.questions) || 0;
      const cost = ai ? ai.costEur({ input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_tokens, cache_creation_input_tokens: u.cache_write_tokens }) : 0;
      return {
        id: c.id, name: c.name,
        enabled: !!feats.ai_assistant,          // are modulul activ (îl poate folosi)
        used: used,                              // apeluri luna asta
        quota: q.questions || 0,                 // 0 = nelimitat
        pct: q.questions ? Math.round((used / q.questions) * 100) : null,
        over: q.questions ? Math.max(0, used - q.questions) : 0,
        costEur: Math.round(cost * 100) / 100,
        lastUsed: u.last_used || null
      };
    });
    const withFeature = rows.filter(function (r) { return r.enabled; });
    const active = withFeature.filter(function (r) { return r.used > 0; });
    res.json({
      rows: rows.sort(function (a, b) { return b.used - a.used; }),
      summary: {
        companies: rows.length,
        withFeature: withFeature.length,
        active: active.length,
        // procentul cerut: dintre cei care AU modulul, câți chiar îl folosesc
        adoptionPct: withFeature.length ? Math.round((active.length / withFeature.length) * 100) : 0,
        totalCalls: rows.reduce(function (s, r) { return s + r.used; }, 0),
        totalCostEur: Math.round(rows.reduce(function (s, r) { return s + r.costEur; }, 0) * 100) / 100
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Contorul pe care-l vede clientul (ca la Claude): cât a consumat luna asta și ce-l costă peste cotă.
app.get('/api/ai/quota', requireAuth, async (req, res) => {
  try {
    const a = getAuth(req);
    const st = await aiQuotaState(a.companyId);
    res.json(Object.assign({ ok: true }, st));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// ─── RA Insight — agent analitic peste rapoarte (tool-use) ───
// Răspunde la întrebări în limbaj natural combinând mai multe rapoarte, ca clientul să nu genereze manual 5 rapoarte.
// Per user (scoping prin canAccessImei), pe modelul AI_AGENT_MODEL (default Haiku, urcabil pe Sonnet dintr-o variabilă).
app.post('/api/ai/reports-agent', requireAuth, requirePerm('viewReports'), withScope, requireFeature('ai_assistant'), async (req, res) => {
  try {
    const message = ((req.body && req.body.message) || '').toString().slice(0, 2000).trim();
    if (!message) return res.status(400).json({ error: 'Mesaj gol' });

    // Întrebări rapide (live) → răspuns LOCAL instant, GRATUIT (zero tokeni), înainte de agentul plătit.
    // Face din RA Insight un singur asistent: „unde/oprite/cel mai rapid/status" nu costă tokeni, restul merg pe agent.
    try {
      if (fleetQuick) {
        const intent = fleetQuick.detectIntent(message);
        if (intent) {
          const snap = _fleetSnapshot(req);
          try { if (geocode) await geocode.warm(snap.map(v => ({ lat: Number(v.lat), lng: Number(v.lng) }))); } catch (e) {}
          for (const v of snap) { try { const lbl = geocode ? geocode.peek(Number(v.lat), Number(v.lng)) : null; if (lbl) v.locatie = lbl; } catch (e) {} delete v.lat; delete v.lng; }
          let todayQ = [];
          try {
            const imeisQ = (await db.getDevices()).map(d => d.imei).filter(imei => canAccessImei(req, imei));
            const fq = new Date(); fq.setHours(0, 0, 0, 0);
            todayQ = await db.getTripsSummaryForImeis(imeisQ, fq.toISOString(), new Date().toISOString());
          } catch (e) { /* fără sumar curse */ }
          const aq = fleetQuick.answer(intent, { snapshot: snap, today: todayQ, now: Date.now() });
          auditReq(req, 'ai_local', 'assistant', null, { intent, via: 'insight' });
          return res.json({ reply: aq.reply, sources: [], source: 'local' });
        }
      }
    } catch (e) { /* dacă euristica pică, continuăm pe agentul AI */ }

    if (!ai.aiEnabled()) return res.json({ reply: 'RA Insight nu este activ (cheia Anthropic lipsește). Contactează administratorul platformei.', disabled: true });
    if (await aiLimitReached(req.companyId)) return res.json({ reply: 'Compania ta a atins limita lunară de AI. Contactează administratorul platformei.', limited: true });

    const companyScope = req.isSuper ? null : (req.companyId != null ? req.companyId : -1);

    // Vehiculele la care userul are acces (nume + tip pentru model; imei intern pentru rezolvare + deep-link).
    let devices = await db.getDevices(companyScope === -1 ? -1 : companyScope);
    devices = devices.filter(d => canAccessImei(req, d.imei));
    const vehList = devices.map(d => ({ name: (d.name || d.imei), type: d.vehicle_type || null, imei: d.imei }));
    const allImeis = vehList.map(v => v.imei);
    if (!allImeis.length) return res.json({ reply: 'Nu ai niciun vehicul în scope, deci nu am ce analiza.', sources: [] });

    // Zone (geofence) accesibile — pentru întrebări pe hotspot.
    let zones = [];
    try { zones = (await db.getGeofences(companyScope)).map(g => ({ id: g.id, name: g.name || ('Zonă ' + g.id) })); } catch (e) {}

    function resolveVehicle(nameOrNull) {
      if (!nameOrNull) return { imeis: allImeis, label: 'toată flota', imei: null };
      const q = String(nameOrNull).trim().toLowerCase();
      let v = vehList.find(x => x.name.toLowerCase() === q) || vehList.find(x => x.name.toLowerCase().includes(q));
      if (!v) return null;
      return { imeis: [v.imei], label: v.name, imei: v.imei };
    }
    function resolvePeriod(input) {
      const now = new Date();
      const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
      const p = ((input && input.period) || '').toString().toLowerCase();
      let from, to = new Date(now);
      if (input && input.from && input.to) { from = new Date(input.from); to = new Date(input.to); }
      else if (p === 'today') { from = startOfDay(now); }
      else if (p === 'yesterday') { from = startOfDay(now); from.setDate(from.getDate() - 1); to = startOfDay(now); }
      else if (p === 'this_week') { const dow = (startOfDay(now).getDay() + 6) % 7; from = startOfDay(now); from.setDate(from.getDate() - dow); }
      else if (p === 'last_week') { const dow = (startOfDay(now).getDay() + 6) % 7; to = startOfDay(now); to.setDate(to.getDate() - dow); from = new Date(to); from.setDate(from.getDate() - 7); }
      else if (p === 'this_month') { from = new Date(now.getFullYear(), now.getMonth(), 1); }
      else if (p === 'last_month') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); }
      else if (p === 'last_30_days' || p === 'month') { from = new Date(now); from.setDate(from.getDate() - 30); }
      else { from = new Date(now); from.setDate(from.getDate() - 7); } // default: last_7_days
      if (isNaN(from.getTime()) || isNaN(to.getTime())) { from = new Date(now); from.setDate(from.getDate() - 7); to = new Date(now); }
      return { from: from.toISOString(), to: to.toISOString() };
    }

    const PERIODS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'last_week', 'this_month', 'last_month'];
    const MAX_REPORTS = 5;
    let reportCalls = 0;
    const sources = [];

    const tools = [
      { name: 'list_vehicles', description: 'Listează vehiculele disponibile (nume și tip). Folosește numele EXACT când ceri un raport pe un vehicul anume.', input_schema: { type: 'object', properties: {} } },
      { name: 'list_zones', description: 'Listează zonele (hotspot/geofence) definite. Necesare pentru raportul de tip "hotspot".', input_schema: { type: 'object', properties: {} } },
      {
        name: 'run_report',
        description: 'Generează un raport și întoarce sumarul lui (totaluri + rânduri-cheie). Cheamă de mai multe ori și combină rezultatele pentru a răspunde complet la întrebare.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Tipul raportului (cheia exactă din lista din system prompt).', enum: Object.keys(reports.REPORTS) },
            vehicle: { type: 'string', description: 'Numele vehiculului (exact, din list_vehicles). Omite pentru toată flota.' },
            zone: { type: 'string', description: 'Numele zonei (obligatoriu doar pentru type="hotspot").' },
            period: { type: 'string', description: 'Scurtătură de perioadă.', enum: PERIODS },
            from: { type: 'string', description: 'Început interval ISO 8601 (alternativă la period).' },
            to: { type: 'string', description: 'Sfârșit interval ISO 8601 (alternativă la period).' }
          },
          required: ['type']
        }
      },
      { name: 'fleet_status', description: 'Starea LIVE a flotei ACUM: pentru fiecare vehicul — unde e (adresă), dacă e în mișcare/ralanti/oprit/offline, viteza, combustibilul (dacă există senzor) și ultima transmisie. Folosește pentru întrebări despre prezent („unde e X acum", „ce vehicule sunt oprite/offline", „cine se mișcă").', input_schema: { type: 'object', properties: {} } },
      { name: 'fleet_alerts', description: 'Înștiințările/alertele ACTIVE ale flotei (monitorizare): vehicule offline, service depășit sau apropiat, documente care expiră (ITP/RCA/asigurare), posibil furt de combustibil, ralanti excesiv, conducere continuă peste limita legală, scor eco slab, digest zilnic. Folosește pentru „ce probleme are flota", „ce trebuie să știu", „ce expiră", „ce e de făcut".', input_schema: { type: 'object', properties: {} } }
    ];

    const toolHandlers = {
      list_vehicles: async () => ({ vehicles: vehList.map(v => ({ name: v.name, type: v.type })) }),
      list_zones: async () => ({ zones: zones.map(z => z.name) }),
      run_report: async (input) => {
        if (reportCalls >= MAX_REPORTS) return { error: 'Ai atins limita de ' + MAX_REPORTS + ' rapoarte pe întrebare. Răspunde cu datele deja adunate.' };
        const type = String(input.type || '');
        if (!reports.REPORTS[type]) return { error: 'Tip necunoscut: ' + type + '. Valide: ' + Object.keys(reports.REPORTS).join(', ') };
        const veh = resolveVehicle(input.vehicle);
        if (veh === null) return { error: 'Vehicul negăsit: "' + input.vehicle + '". Cheamă list_vehicles pentru numele corecte.' };
        const opts = { stopMin: 5, limit: 90, refuelMin: 10, dropMin: 10, geofenceId: null };
        if (type === 'hotspot') {
          if (!input.zone) return { error: 'Pentru "hotspot" trebuie numele zonei (parametrul "zone"). Cheamă list_zones.' };
          const zq = String(input.zone).trim().toLowerCase();
          const z = zones.find(x => x.name.toLowerCase() === zq) || zones.find(x => x.name.toLowerCase().includes(zq));
          if (!z) return { error: 'Zonă negăsită: "' + input.zone + '". Cheamă list_zones.' };
          opts.geofenceId = z.id;
        }
        const { from, to } = resolvePeriod(input);
        reportCalls++;
        try {
          const report = await reports.runReport(db, type, veh.imeis, from, to, opts, companyScope);
          sources.push({ type, label: report.label || type, vehicle: input.vehicle ? veh.label : null, imei: veh.imei, from, to });
          const rows = Array.isArray(report.rows) ? report.rows : [];
          return {
            type, label: report.label, vehicle: veh.label, period: { from, to },
            summary: report.summary || {},
            columns: report.columns || [],
            rows: rows.slice(0, 25),
            rows_total: rows.length,
            truncated: rows.length > 25
          };
        } catch (e) { return { error: 'Eroare la generarea raportului: ' + ((e && e.message) || e) }; }
      },
      fleet_status: async () => {
        const snap = _fleetSnapshot(req); // doar vehiculele accesibile (izolare în _fleetSnapshot)
        try { if (geocode) await geocode.warm(snap.map(v => ({ lat: Number(v.lat), lng: Number(v.lng) }))); } catch (e) {}
        const now = Date.now();
        const vehicles = snap.map(v => {
          let loc = null;
          try { loc = (geocode && v.lat && v.lng) ? geocode.peek(Number(v.lat), Number(v.lng)) : null; } catch (e) {}
          const ageMin = v.ultima_actualizare ? (now - new Date(v.ultima_actualizare).getTime()) / 60000 : null;
          let stare;
          if (ageMin != null && ageMin > 60) stare = 'offline (fără semnal de ' + (ageMin >= 1440 ? (Math.round(ageMin / 1440) + ' zile') : (Math.round(ageMin / 60) + 'h')) + ')';
          else if ((v.viteza_kmh || 0) > 3) stare = 'în mișcare ' + v.viteza_kmh + ' km/h';
          else if (v.contact === 'pornit') stare = 'staționat cu motorul pornit (ralanti)';
          else stare = 'oprit';
          const r = { vehicul: v.nume, nr: v.nr || undefined, stare: stare, locatie: loc || 'indisponibilă' };
          if (v.combustibil_l != null) r.combustibil_l = v.combustibil_l;
          return r;
        });
        return { now: new Date().toISOString(), vehicles: vehicles };
      },
      fleet_alerts: async () => {
        let rows = [];
        try { rows = await db.getAgentFindings(companyScope, 100); } catch (e) {}
        const allow = new Set(allImeis);
        const nameByImei = {}; vehList.forEach(v => { nameByImei[v.imei] = v.name; });
        const fullAccess = req.isSuper || req.allowedImeis == null; // findings „pe flotă" (imei null) doar la acces complet
        const sevRank = { critical: 0, warning: 1, info: 2 };
        const alerts = rows
          .filter(f => (f.imei == null ? fullAccess : allow.has(f.imei)))
          .sort((a, b) => (sevRank[a.severity] != null ? sevRank[a.severity] : 3) - (sevRank[b.severity] != null ? sevRank[b.severity] : 3))
          .slice(0, 40)
          .map(f => ({ severitate: f.severity, categorie: f.agent, vehicul: f.imei ? (nameByImei[f.imei] || f.imei) : 'flotă', titlu: f.title, detalii: f.body }));
        return { count: alerts.length, alerts: alerts };
      }
    };

    const reportList = Object.entries(reports.REPORTS).map(([k, v]) => '- ' + k + ': ' + v.label).join('\n');
    const system = [
      'Ești „RA Insight", creierul AI al platformei RA Tracks (monitorizare GPS flote). Răspunzi în limba română.',
      'Rolul tău: ești punctul UNIC prin care clientul află orice despre flota lui — fără să genereze manual mai multe rapoarte. Aduni date din unelte și răspunzi clar și modern.',
      'Ai 5 unelte:\n• fleet_status — starea LIVE acum (unde e fiecare vehicul, mișcare/ralanti/oprit/offline, combustibil).\n• fleet_alerts — înștiințările active (offline, service/documente scadente, furt combustibil, ralanti, conducere continuă, scor eco, digest).\n• list_vehicles, list_zones — pentru nume exacte de vehicule/zone.\n• run_report — date istorice detaliate pe o perioadă (maxim ' + MAX_REPORTS + ' rapoarte/întrebare).',
      'Alege unealta potrivită: întrebări despre ACUM/poziție → fleet_status; „ce probleme are flota / ce trebuie să știu / ce expiră / ce e de făcut" → fleet_alerts; analize pe perioadă (km, ore, consum, opriri, viteze, hotspot, șoferi) → run_report. Poți combina mai multe într-un singur răspuns.',
      'Data și ora curentă: ' + new Date().toISOString() + '. Folosește-o pentru „azi", „ieri", „săptămâna trecută", „luna asta" etc.',
      'Tipuri de raport pentru run_report (folosește EXACT cheia din stânga):\n' + reportList,
      'REGULI: (1) Răspunde DOAR pe baza datelor întoarse de unelte — nu inventa cifre. (2) Dacă o valoare lipsește (ex: consum fără senzor de rezervor montat), spune sincer că nu e disponibilă, nu estima ca și cum ar fi măsurată. (3) Nu afișa coordonate GPS brute; folosește numele vehiculelor și adresele. (4) Fii concis și modern: titlu scurt cu **bold**, apoi puncte cu „• " și cifrele-cheie; dacă există alerte critice, pune-le primele. (5) Acoperă tot ce a cerut clientul. (6) Nu enumera la final uneltele apelate.'
    ].join('\n\n');

    const _agg = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const result = await ai.runAgent({
      system, messages: [{ role: 'user', content: message }], tools, toolHandlers,
      model: ai.AI_AGENT_MODEL, maxTokens: 1100, maxIters: 8,
      onUsage: u => { // agentul face mai multe apeluri pe ÎNTREBARE → însumăm și scriem UN rând (1 rând = 1 întrebare)
        _agg.input_tokens += Number(u.input_tokens) || 0;
        _agg.output_tokens += Number(u.output_tokens) || 0;
        _agg.cache_read_input_tokens += Number(u.cache_read_input_tokens) || 0;
        _agg.cache_creation_input_tokens += Number(u.cache_creation_input_tokens) || 0;
      }
    });
    db.recordAiUsage(req.companyId, 'insight', _agg, req.auth && req.auth.userId).catch(() => {});
    auditReq(req, 'ai_insight', 'assistant', null, { len: message.length, reports: reportCalls });

    // Surse unice (type+imei+perioadă) pentru chips-urile „Deschide raportul".
    const seen = new Set(); const uniqSources = [];
    for (const s of sources) { const k = s.type + '|' + (s.imei || '') + '|' + s.from + '|' + s.to; if (!seen.has(k)) { seen.add(k); uniqSources.push(s); } }
    res.json({ reply: result.text || 'Nu am putut formula un răspuns pe baza datelor disponibile.', sources: uniqSources });
  } catch (e) {
    res.status(500).json({ error: 'RA Insight: ' + e.message });
  }
});

// ─── RA Insight FĂRĂ AI — întrebări predefinite (zero tokeni): rulează un raport și întoarce sumarul lui ───
// Gated doar pe viewReports (NU pe ai_assistant) → disponibil oricărei companii. AI-ul (text liber) rămâne opțional.
const INSIGHT_PRESETS = {
  km:       { title: 'Km — săptămâna asta',            type: 'utilization',      period: 'this_week' },
  consum:   { title: 'Consum — ultimele 30 zile',      type: 'consumption',      period: 'last_30_days' },
  costuri:  { title: 'Costuri combustibil — luna asta', type: 'costs',           period: 'this_month' },
  viteza:   { title: 'Depășiri viteză — 7 zile',       type: 'speeding',         period: 'last_7_days' },
  ralanti:  { title: 'Ralanti (idle) — 7 zile',        type: 'idling',           period: 'last_7_days' },
  ecodrive: { title: 'EcoDrive — clasament șoferi (30 zile)', type: 'ecodrive_drivers', period: 'last_30_days', top: 3 },
};
function _insightPeriod(p) {
  const now = new Date(), sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  let from, to = new Date(now);
  if (p === 'today') from = sod(now);
  else if (p === 'this_week') { const dow = (sod(now).getDay() + 6) % 7; from = sod(now); from.setDate(from.getDate() - dow); }
  else if (p === 'this_month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (p === 'last_30_days') { from = new Date(now); from.setDate(from.getDate() - 30); }
  else { from = new Date(now); from.setDate(from.getDate() - 7); } // last_7_days
  return { from: from.toISOString(), to: to.toISOString() };
}
app.get('/api/insight/presets', requireAuth, requirePerm('viewReports'), (req, res) => {
  res.json(Object.entries(INSIGHT_PRESETS).map(([key, p]) => ({ key, title: p.title })));
});
app.post('/api/insight/run', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const preset = INSIGHT_PRESETS[String((req.body && req.body.key) || '')];
    if (!preset) return res.status(400).json({ error: 'Întrebare necunoscută' });
    const companyScope = req.isSuper ? null : (req.companyId != null ? req.companyId : -1);
    let devices = await db.getDevices(companyScope === -1 ? -1 : companyScope);
    devices = devices.filter(d => canAccessImei(req, d.imei));
    const imeis = devices.map(d => d.imei);
    if (!imeis.length) return res.json({ title: preset.title, summary: { 'Info': 'Niciun vehicul în scope.' }, rows: [], columns: [], period: null });
    const { from, to } = _insightPeriod(preset.period);
    const opts = { stopMin: 5, limit: 90, refuelMin: 10, dropMin: 10, geofenceId: null };
    const report = await reports.runReport(db, preset.type, imeis, from, to, opts, companyScope);
    const rows = (preset.top && Array.isArray(report.rows)) ? report.rows.slice(0, preset.top) : [];
    auditReq(req, 'insight_preset', 'report', preset.type, { key: req.body.key });
    res.json({ title: preset.title, label: report.label || preset.type, reportType: preset.type, period: { from, to }, summary: report.summary || {}, columns: report.columns || [], rows });
  } catch (e) { res.status(500).json({ error: 'RA Insight: ' + e.message }); }
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
  { k: 'fuelTheftL', min: 1, max: 1000, round: true },     // Furt combustibil — prag scădere (L): parcare + în mers (reverificat 1h)
  { k: 'idleMaxMin', min: 5, max: 1440, round: true },     // RA Watch — ralanti prelungit (min)
  { k: 'ecoScoreMin', min: 0, max: 100, round: true },     // RA Optimize — scor minim eco-driving
  { k: 'serviceSoonKm', min: 100, max: 50000, round: true }, // RA Care — km până la service-ul din BORD (CAN)
  { k: 'careDaysLead', min: 1, max: 365, round: true },    // RA Care + push + culoarea listei — zile înainte de scadența LUCRĂRII pe dată
  { k: 'careKmLead', min: 50, max: 50000, round: true },   // RA Care + push + culoarea listei — km înainte de scadența LUCRĂRII pe km
  // ACTELE au preavizul lor, separat de lucrări: un RCA sau un ITP nu se rezolvă într-o zi, un
  // schimb de ulei da. Înainte, documentele împrumutau careDaysLead cu un Math.max(7, …) — deci
  // pragul mentenanței muta, pe furiș, și alerta actelor.
  { k: 'docDaysLead', min: 1, max: 365, round: true },     // push + culoarea listei — zile înainte de expirarea ACTULUI
  { k: 'dispOnlineMin', min: 5, max: 240, round: true },   // RA Dispatch — „disponibil": ultimul semnal sub (min)
  { k: 'dispIdleHour', min: 0, max: 23, round: true },     // RA Dispatch — verifică „subutilizat" după ora (0-23)
  { k: 'dispIdleKm', min: 1, max: 100, round: true },      // RA Dispatch — „nefolosit azi": sub (km)
  { k: 'compContWarnMin', min: 60, max: 270, round: true },  // RA Compliance — avertisment timpuriu conducere continuă (min; 270 = 4h30 = doar la limită)
  { k: 'compDailyWarnMin', min: 120, max: 540, round: true } // RA Compliance — avertisment timpuriu conducere zilnică (min; 540 = 9h = doar la limită)
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
// Whitelist + clamping pentru praguri primite de la client (sursă unică de validare — SPECS canonice).
function _mergeAlertThresholds(cur, incoming) {
  const a = Object.assign({}, cur || {});
  if (incoming && typeof incoming === 'object') {
    ALERT_THRESHOLD_SPECS.forEach(function (sp) {
      if (Object.prototype.hasOwnProperty.call(incoming, sp.k)) {
        const v = incoming[sp.k];
        if (v === null) { delete a[sp.k]; return; }           // null = revino la default (agents.js)
        const n = Number(v);
        if (Number.isFinite(n) && n >= sp.min && n <= sp.max) a[sp.k] = sp.round ? Math.round(n) : n;
        // valori invalide → ignorate (nu suprascriu)
      }
    });
  }
  return a;
}
// Praguri GLOBALE (Setări sistem) — setate de super-admin (nu are companie proprie), aplicate ca BAZĂ tuturor companiilor.
async function _getGlobalAlertThresholds() {
  try {
    const raw = await db.getSetting('alert_thresholds_global');
    if (!raw) return {};
    const parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    return _alertThresholdsFromSettings({ alert_thresholds: parsed });
  } catch (e) { return {}; }
}
async function _getAlertThresholds(companyId) {
  const global = await _getGlobalAlertThresholds();
  if (companyId == null) return global; // super-admin: doar praguri globale
  try { const co = await db.getCompanyById(companyId); return Object.assign({}, global, _alertThresholdsFromSettings(co && co.settings)); } catch (e) { return global; }
}
app.get('/api/agents', requireAuth, withCompany, async (req, res) => {
  if (!agents) return res.json({ agents: [] });
  const enabled = await _getEnabledAgents(req.companyId);
  let lastRun = null, auto = true;
  try { lastRun = (req.companyId != null ? await db.getSetting('agents_lastrun_' + req.companyId) : null) || await db.getSetting('agents_lastrun') || null; } catch (e) {}
  try { auto = (await getSystemSettings()).agents_auto !== false; } catch (e) {}
  res.json({ agents: enabled.filter(k => agents.AGENTS[k]).map(function (k) { return { key: k, name: agents.AGENTS[k].name, role: agents.AGENTS[k].role || '', desc: agents.AGENTS[k].desc }; }), enabledKeys: enabled, lastRun: lastRun, auto: auto });
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
    const _coFP = await db.getCompanyById(storeCompany).then(function (c) { return effectiveFuelPrices(c && c.settings).motorina; }).catch(function () { return null; });
    const base = { db, imeis, livePositions, companyId: storeCompany, defaultSpeedLimit: (await getSystemSettings()).default_speed_limit, alertThresholds: alertThresholds, fuelPrice: _coFP || 7.5 };
    const findings = (which === 'all' ? await agents.runAll(base, enabled) : await agents.runAgent(which, base)).findings || [];
    let stored = 0;
    for (const f of findings) { if (LIVE_AGENTS.has(f.agent)) continue; const r = await db.createAgentFinding(Object.assign({}, f, { companyId: storeCompany })); if (r) stored++; } // agenții live (dispatch/care) nu se persistă (stare de moment, nu istoric)
    let aiSummary = null;
    // COST: rezumatul AI consumă tokeni plătiți → DOAR dacă modulul AI e activ pentru companie
    // ȘI limita lunară nu e atinsă. Euristicile (constatările) rămân gratuite și disponibile mereu.
    let _aiAllowed = !!(ai && ai.aiEnabled() && findings.length);
    if (_aiAllowed && storeCompany != null) {
      try {
        const _co = await db.getCompanyById(storeCompany);
        const _f = (plans && _co) ? plans.featuresFor(_co) : null;
        if (_f && _f.ai_assistant === false) _aiAllowed = false;
      } catch (e) {}
      if (_aiAllowed && await aiLimitReached(storeCompany)) _aiAllowed = false;
    }
    if (_aiAllowed) {
      try {
        const system = 'Ești coordonatorul agenților AI ai unei flote de transport (RA Watch, RA Care, RA Optimize, RA Compliance, RA Client). Primești constatările lor de azi. Scrie un rezumat scurt (2-4 propoziții) în limba română care prioritizează urgențele (furt combustibil, service depășit, încălcarea orelor de condus) și recomandă acțiuni concrete. Fără introduceri lungi.';
        aiSummary = await ai.callClaude({ system, messages: [{ role: 'user', content: 'Constatări:\n' + JSON.stringify(findings.map(f => ({ a: f.agent, sev: f.severity, t: f.title }))) }], maxTokens: 400, onUsage: u => db.recordAiUsage(storeCompany, 'agents', u).catch(() => {}) });
      } catch (e) { /* AI opțional */ }
    }
    auditReq(req, 'run', 'agent', which, { found: findings.length, stored });
    res.json({ findings, aiSummary, stored });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/agents/findings', requireAuth, withScope, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    const cid = req.isSuper ? (req.filterCompanyId != null ? req.filterCompanyId : null) : req.companyId;
    let list = await db.getAgentFindings(cid, 80);
    // Scope pe vehicule: un rol cu acces restrâns (dispatcher/client/viewer) nu vede constatări
    // ale vehiculelor la care nu are drept — până acum vedea numele ÎNTREGII flote a companiei.
    if (req.allowedImeis != null) list = list.filter(f => !f.imei || req.allowedImeis.has(f.imei));
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Agenți „live" (dispatch, care) — stare de MOMENT calculată la cerere, FĂRĂ persistență și FĂRĂ AI:
// e o stare curentă, nu un eveniment de istoric → nu acumulăm constatări care se repetă/expiră.
// (Alertele „reale" de mentenanță/documente merg oricum prin push/checkExpiries → clopoțel.)
app.get('/api/agents/:key/live', requireAuth, withScope, async (req, res) => {
  try {
    if (!agents) return res.status(503).json({ error: 'Agenții indisponibili' });
    const key = String(req.params.key || '');
    if (!agents.AGENTS[key] || !LIVE_AGENTS.has(key)) return res.status(404).json({ error: 'Agent live necunoscut' });
    await applyCompanyFilter(req);
    const imeis = await resolveReportImeis(req);
    if (!imeis) return res.status(403).json({ error: 'Acces interzis' });
    const storeCompany = (req.isSuper && req.filterCompanyId != null) ? req.filterCompanyId : req.companyId;
    // Live-only → curăță eventualele snapshot-uri vechi persistate ale agentului (migrare de la vechiul comportament).
    try { await db.pool.query('DELETE FROM agent_findings WHERE agent = $1 AND company_id IS NOT DISTINCT FROM $2', [key, storeCompany == null ? null : storeCompany]); } catch (e) {}
    const alertThresholds = await _getAlertThresholds(storeCompany);
    const base = { db, imeis, livePositions, companyId: storeCompany, defaultSpeedLimit: (await getSystemSettings()).default_speed_limit, alertThresholds: alertThresholds };
    let out;
    if (key === 'client') {
      // RA Client = sinteza zilei + concluziile CELORLALȚI agenți → are nevoie de o rulare completă (runAll îl pune ultimul).
      const enabledForAgg = await _getEnabledAgents(storeCompany);
      const r = await agents.runAll(base, enabledForAgg);
      out = Object.assign({ findings: (r.findings || []).filter(function (f) { return f.agent === 'client'; }) }, (r.meta && r.meta.client) || {});
    } else {
      out = await agents.runAgent(key, base);
    }
    res.json(Object.assign({}, out, { findings: (out && out.findings) || [], checkedAt: new Date().toISOString() })); // trece și meta agentului (ex. optimize.evaluated)
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/agents/findings/:id/:action', requireAuth, withScope, async (req, res) => {
  try {
    const status = req.params.action === 'dismiss' ? 'dismissed' : 'acknowledged';
    // Scope pe vehicul: un rol restrâns nu poate închide constatări ale vehiculelor din afara accesului său.
    if (req.allowedImeis != null) {
      try {
        const _f = (await db.pool.query('SELECT imei FROM agent_findings WHERE id = $1', [parseInt(req.params.id)])).rows[0];
        if (_f && _f.imei && !req.allowedImeis.has(_f.imei)) return res.status(403).json({ error: 'Acces interzis' });
      } catch (e) {}
    }
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
  return await _runWorker('agents', _runAgentsWorkerBody);
}
async function _runAgentsWorkerBody() {
  {
    let _sysSpeed = 90;
    try { const _sys = await getSystemSettings(); if (!_sys.agents_auto) return 'oprit din Setări'; _sysSpeed = _sys.default_speed_limit; } catch (e) {} // toggle + viteză implicită din Setări sistem
    const globalThresholds = await _getGlobalAlertThresholds(); // praguri platformă (super-admin) = bază pentru toate companiile
    const companies = await db.getCompanies();
    let _nCo = 0, _nFind = 0;
    for (const co of companies) {
      await _yield(); // o companie per tick → agenții nu monopolizează pool-ul de conexiuni
      if (co.is_demo) continue;
      const enabled = (plans ? plans.enabledAgentsFor(co) : Object.keys(agents.AGENTS)).filter(function (k) { return !LIVE_AGENTS.has(k); }); // agenții live (dispatch/care) se calculează la deschiderea paginii, nu în fundal
      if (!enabled.length) continue; // planul „start" nu rulează niciun agent
      const imeis = await db.getCompanyActiveImeis(co.id); // agenții nu rulează pe vehicule arhivate
      if (!imeis.length) continue;
      const alertThresholds = Object.assign({}, globalThresholds, _alertThresholdsFromSettings(co && co.settings)); // compania suprascrie global
      const _coFP = effectiveFuelPrices(co && co.settings).motorina || 7.5;
      const result = await agents.runAll({ db, imeis, livePositions, companyId: co.id, defaultSpeedLimit: _sysSpeed, alertThresholds: alertThresholds, fuelPrice: _coFP }, enabled);
      for (const f of (result.findings || [])) await db.createAgentFinding(Object.assign({}, f, { companyId: co.id }));
      _nCo++; _nFind += (result.findings || []).length;
      try { await db.setSetting('agents_lastrun_' + co.id, new Date().toISOString()); } catch (e) {} // „ultima rulare" per companie
    }
    try { await db.setSetting('agents_lastrun', new Date().toISOString()); } catch (e) {} // fallback global (super-admin)
    return _nCo + ' companii · ' + _nFind + ' constatări';
  }
}

// ─── MULTI-TENANT: Companii (doar super-admin) ───
app.get('/api/companies', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const list = await db.getCompanies();
    res.json(list.map(function (c) { return Object.assign({}, c, { features: plans ? plans.featuresFor(c) : null, access: companyAccessStatus(c) }); }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard super-admin: stat per companie (vehicule, useri) + consum tokeni AI + totaluri
// Numărătoare rapidă pentru cardurile din panou (COUNT-uri indexate; evită încărcarea listei complete de
// vehicule cu join LATERAL pe poziții — care era lentă pe baza mare de poziții din producție).
app.get('/api/admin/counts', requireAuth, withScope, async (req, res) => {
  try {
    if (req.isSuper) {
      // Exclude compania DEMO din numerele de platformă — consecvent cu restul aplicației (listele de vehicule și
      // dashboard-ul de business exclud deja demo-ul). Altfel cardul arăta umflat (ex. 6 „active" = 5 demo + 1 real).
      const r = await db.pool.query(`SELECT
        (SELECT COUNT(*)::int FROM companies WHERE COALESCE(is_demo, false) = false) AS companies,
        (SELECT COUNT(*)::int FROM users WHERE company_id IS NULL OR company_id NOT IN (SELECT id FROM companies WHERE is_demo)) AS users,
        (SELECT COUNT(*)::int FROM devices WHERE status IS DISTINCT FROM 'archived' AND (company_id IS NULL OR company_id NOT IN (SELECT id FROM companies WHERE is_demo))) AS active_devices,
        (SELECT COUNT(*)::int FROM devices WHERE status = 'archived' AND (company_id IS NULL OR company_id NOT IN (SELECT id FROM companies WHERE is_demo))) AS archived_devices`);
      return res.json(r.rows[0]);
    }
    const r = await db.pool.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE company_id = $1) AS users,
      (SELECT COUNT(*)::int FROM devices WHERE company_id = $1 AND status IS DISTINCT FROM 'archived') AS active_devices,
      (SELECT COUNT(*)::int FROM devices WHERE company_id = $1 AND status = 'archived') AS archived_devices`, [req.companyId]);
    res.json(Object.assign({ companies: null }, r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/overview', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    let days = parseInt(req.query.days); if (!Number.isFinite(days) || days <= 0) days = 30; days = Math.min(days, 365);
    const [companies, usage, findingsNew] = await Promise.all([db.getCompanies(), db.getAiUsageByCompany(days), db.countNewFindings().catch(function () { return 0; })]);
    // Compania demo nu apare în dashboard-ul de business (nici tabel, nici totaluri/venituri/health).
    const demoIds = new Set(companies.filter(function (c) { return c.is_demo; }).map(function (c) { return c.id; }));
    const realCompanies = companies.filter(function (c) { return !c.is_demo; });
    const usageMap = {}; let totIn = 0, totOut = 0, totCalls = 0, totCr = 0, totCw = 0;
    usage.forEach(function (u) {
      usageMap[u.company_id == null ? 'null' : u.company_id] = u;
      if (u.company_id != null && demoIds.has(u.company_id)) return; // exclude demo din totalurile AI
      totIn += Number(u.input_tokens) || 0; totOut += Number(u.output_tokens) || 0; totCalls += Number(u.calls) || 0;
      totCr += Number(u.cache_read_tokens) || 0; totCw += Number(u.cache_write_tokens) || 0;
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
        // Cât ne COSTĂ efectiv clientul ăsta, în euro (nu doar tokeni) — baza pentru preț în ofertă.
        ai_cost_eur: ai ? Math.round(ai.costEur({ input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_tokens, cache_creation_input_tokens: u.cache_write_tokens }) * 10000) / 10000 : 0,
        ai_quota: _aiQuotaFromSettings(c.settings).questions || 0,
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
      // Estimare la scară de dashboard: toate vehiculele numărate pe nivelul de bază (ca „none") → fără query CAN
      // per companie (clasificarea CAN rulează doar în /overview). Pt. presetări/flat e EXACT; pt. oferte tiered e
      // o estimare-minim (cardurile au deja eticheta „estimat"). Add-on-urile AI se numără ca „list price".
      const price = plans.computeCompanyPrice(c, { none: (c.device_count || 0), can: 0, fms: 0 });
      return { mrr: price.monthlyTotal, key };
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
        ai_cache_read: totCr, ai_cache_write: totCw,
        // Costul se calculează O SINGURĂ DATĂ, pe server, cu prețurile din config și cu tokenii din
        // cache taxați corect — interfața nu mai are formulă proprie care să divergă.
        ai_cost_usd: ai ? Math.round(ai.costUsd({ input_tokens: totIn, output_tokens: totOut, cache_read_input_tokens: totCr, cache_creation_input_tokens: totCw }) * 100) / 100 : 0,
        ai_cost_eur: ai ? Math.round(ai.costEur({ input_tokens: totIn, output_tokens: totOut, cache_read_input_tokens: totCr, cache_creation_input_tokens: totCw }) * 100) / 100 : 0,
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
// Drill-down companie (super-admin): detalii companie + stare acces + utilizatori (cu roluri) +
// vehicule (clasificate CAN/FMS/fără) + facturi (plăți). Agregat într-un singur apel pentru panoul de detaliu.
app.get('/api/companies/:id/overview', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const company = await db.getCompanyById(id);
    if (!company) return res.status(404).json({ error: 'Compania nu există' });
    const [users, devices, payments] = await Promise.all([
      db.getUsers(id), db.getDevices(id), db.getPayments(id, 500)
    ]);
    // Oferta efectivă întâi — ne dă lista IMEI „cu CAN" setată manual (canImeis); altfel cădem pe auto-detect.
    const offer = plans ? plans.effectivePlan(company) : null;
    const canSet = (offer && Array.isArray(offer.canImeis)) ? new Set(offer.canImeis) : null;
    const vehicles = (devices || [])
      .filter(d => d.status !== 'archived')
      .map(d => {
        const ct = classifyDeviceCan(d);
        return {
          imei: d.imei, name: d.name || null, plate: d.plate || null, vehicle_type: d.vehicle_type || null,
          can_type: ct, can_interface: d.can_interface || null,
          bill_can: canSet ? canSet.has(d.imei) : (ct !== 'none'), // „cu CAN" pt. facturare: override manual sau auto
          last_position_time: d.last_position_time || d.last_seen || null
        };
      });
    const counts = {
      users: users.length, vehicles: vehicles.length, payments: payments.length,
      fms: vehicles.filter(v => v.can_type === 'fms').length,
      can: vehicles.filter(v => v.can_type === 'can').length,
      none: vehicles.filter(v => v.can_type === 'none').length
    };
    // Counts pentru FACTURARE (model direct, 2 trepte): „cu CAN" = bill_can, restul „fără CAN".
    const billCounts = { can: vehicles.filter(v => v.bill_can).length, none: vehicles.filter(v => !v.bill_can).length, fms: 0 };
    const features = plans ? plans.featuresFor(company) : {};
    const price = plans ? plans.computeCompanyPrice(company, billCounts, { features }) : null;
    res.json({ company, access: companyAccessStatus(company), counts, billCounts, users, vehicles, payments, offer, price, features, ai_quota: _aiQuotaFromSettings(company.settings) });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
// ─── GDPR: dreptul de acces și dreptul la ștergere ───────────────────────────────────────────────
// Urmărim poziția unor persoane fizice (șoferii). Clientul e operatorul de date, noi împuternicitul —
// deci clientul trebuie să poată scoate tot ce ținem despre flota lui și să ceară ștergerea. Vezi
// `gdpr.js` pentru de ce tabelele se descoperă la rulare în loc să fie scrise într-o listă.
const gdpr = require('./gdpr');

// Exportul: administratorul își ia propria companie; super-adminul trebuie să spună pe care.
app.get('/api/gdpr/export', requireAuth, requirePerm('manageUsers'), withCompany, async (req, res) => {
  try {
    const cid = req.isSuper ? parseInt(req.query.company_id) : req.companyId;
    if (!Number.isFinite(cid)) return res.status(400).json({ error: 'Alege compania (company_id).' });
    if (!req.isSuper && cid !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    const co = await db.getCompanyById(cid);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });

    const pachet = await gdpr.exportaCompanie(db.pool, cid);
    // Cererea de acces se consemnează: e o dovadă că am răspuns, dacă cineva întreabă mai târziu.
    auditReq(req, 'export', 'gdpr', cid, { company: co.name, tabele: pachet.rezumat.length });
    const nume = String(co.name || 'companie').replace(/[^\w\-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="RA-Tracks - Date ${nume} - ${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(pachet, null, 2));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pasul 1 al ștergerii: NU șterge nimic, doar arată exact ce ar dispărea.
app.get('/api/gdpr/erase-preview/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const co = await db.getCompanyById(cid);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const r = await gdpr.stergeCompanie(db.pool, cid, { uscat: true });
    res.json(Object.assign({ companie: co.name, confirmareCeruta: co.name }, r));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pasul 2: ștergerea propriu-zisă. Ireversibilă, deci cere numele companiei tastat exact — o
// confirmare de tip „da/nu" se apasă din greșeală, un nume tastat nu.
app.post('/api/gdpr/erase/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const co = await db.getCompanyById(cid);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const confirm = String((req.body && req.body.confirm) || '');
    if (confirm !== co.name) {
      return res.status(400).json({ error: `Scrie exact numele companiei ca să confirmi: „${co.name}"` });
    }
    // Consemnăm ÎNAINTE: jurnalul de audit al companiei dispare odată cu ea, iar urma trebuie să rămână.
    auditReq(req, 'erase', 'gdpr', cid, { company: co.name });
    const r = await gdpr.stergeCompanie(db.pool, cid, { uscat: false });
    console.warn(`[GDPR] Compania „${co.name}" (${cid}) ȘTEARSĂ definitiv de ${req.auth && req.auth.username}: ${r.total} rânduri`);
    try { invalidateAccessCache(); invalidateReguliCache(); await refreshWsScope(); } catch (_) {}
    res.json(r);
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
    const { password } = req.body;
    const username = normUsername(req.body.username);
    const full_name = String(req.body.full_name == null ? '' : req.body.full_name).trim();
    if (!username) return res.status(400).json({ error: 'Emailul administratorului e obligatoriu' });
    if (!EMAIL_RE.test(username)) return res.status(400).json({ error: 'Utilizatorul trebuie să fie o adresă de email validă (pe ea pleacă și invitația)' });
    if (await db.getUserByUsername(username)) return res.status(409).json({ error: 'Există deja un cont cu acest email' });
    const email = (req.body.email && String(req.body.email).trim()) || username; // emailul = username-ul
    const invite = !password; // fără parolă → invitație prin email
    if (!invite) { const e = verificaParola(password, username); if (e) return res.status(400).json({ error: e }); }
    const hash = await bcrypt.hash(invite ? crypto.randomBytes(24).toString('hex') : password, 10);
    const u = await db.createUser(username, hash, 'company_admin', { full_name, email, company_id: companyId });
    let invited = false, inviteError = null;
    if (invite) {
      try { invited = await sendSetPasswordEmail(req, u, { invite: true, company: co }); }
      catch (e) { inviteError = e.message; }
      // Eșecul era TĂCUT: contul rămânea cu parolă random, fără email și fără cale de recuperare
      // → cont inaccesibil, iar cel care l-a creat nu afla niciodată. Acum se vede în log + în răspuns.
      if (!invited) console.warn('[INVITE] Emailul de invitație NU a plecat pentru „' + username + '" (companie ' + companyId + '): ' + (inviteError || (channels.emailConfigured && channels.emailConfigured() ? 'trimitere eșuată' : 'SMTP neconfigurat')));
    }
    auditReq(req, 'create', 'company_admin', u.id, { companyId, invited });
    res.json(Object.assign({}, u, {
      invited,
      inviteEmailConfigured: !!(channels.emailConfigured && channels.emailConfigured()),
      warning: (invite && !invited)
        ? 'Contul a fost creat, dar emailul de invitație NU a putut fi trimis (SMTP neconfigurat sau eroare). Utilizatorul NU își poate seta parola — setează-i una manual sau configurează SMTP.'
        : undefined
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set parolă cu token (invitație sau resetare) — public
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const token = (req.body && req.body.token) || '';
    const password = (req.body && req.body.password) || '';
    if (!token) return res.status(400).json({ error: 'Token lipsă.' });
    { const e = verificaParola(password, null); if (e) return res.status(400).json({ error: e }); }
    const u = await db.getUserByResetToken(token);
    if (!u) return res.status(400).json({ error: 'Link invalid sau expirat. Cere o nouă invitație.' });
    // Un cont dezactivat sau cu accesul expirat (demo) nu-și poate seta parola. Răspundem cu ACELAȘI
    // mesaj ca la un token greșit: altfel am confirma cuiva că adresa există, doar că e blocată.
    if (u.active === false || (u.access_until != null && Number(u.access_until) < Date.now())) {
      console.warn(`[AUTH] set-password refuzat pentru contul inactiv/expirat ${u.username}`);
      return res.status(400).json({ error: 'Link invalid sau expirat. Cere o nouă invitație.' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    await db.consumeUserResetToken(u.id, hash);
    res.json({ ok: true, username: u.username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Forgot password — public (răspuns identic indiferent de existență, anti-enumerare)
// ─── Formular public: contact + cerere de cont demo ────────────────────────────────────────────────
// E singurul mod în care un vizitator mai poate ajunge la demo (ruta de auto-login a fost retrasă).
// Fiind PUBLIC, are nevoie de apărare proprie: limitatorul global e 1200 req/min/IP, adică inexistent aici.
const _demoReqHits = new Map(); // ip -> { n, ts }
const DEMO_REQ_MAX = 3, DEMO_REQ_WINDOW_MS = 60 * 60 * 1000;
function _demoReqThrottled(ip) {
  const now = Date.now();
  const cur = _demoReqHits.get(ip);
  if (!cur || now - cur.ts > DEMO_REQ_WINDOW_MS) { _demoReqHits.set(ip, { n: 1, ts: now }); return false; }
  cur.n++;
  return cur.n > DEMO_REQ_MAX;
}
app.post('/api/public/demo-request', async (req, res) => {
  const ip = clientIp(req);
  try {
    const b = req.body || {};
    // Capcană pentru roboți: câmp ascuns care nu trebuie completat NICIODATĂ de un om.
    // Răspundem 200, ca botul să creadă că a reușit și să nu reîncerce cu altă tactică.
    if (String(b.website || '').trim()) return res.json({ ok: true });
    // Formular completat în mai puțin de 3 secunde = automat.
    const ts = parseInt(b.ts);
    if (Number.isFinite(ts) && Date.now() - ts < 3000) return res.json({ ok: true });
    if (_demoReqThrottled(ip)) return res.status(429).json({ error: 'Prea multe cereri. Încearcă din nou peste o oră.' });

    const email = normUsername(b.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Completează o adresă de email validă.' });
    const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n) || null;
    // Aceeași adresă nu poate inunda panoul: o cerere la 24h.
    try { if (await db.countDemoRequestsByEmail(email, Date.now() - 24 * 3600 * 1000) >= 1) return res.json({ ok: true }); } catch (e) {}

    const row = await db.createDemoRequest({
      name: cut(b.name, 120), company: cut(b.company, 160), email: email, phone: cut(b.phone, 40),
      message: cut(b.message, 4000), wants_demo: !!b.wants_demo, consent: !!b.consent,
      ip: cut(ip, 60), userAgent: cut(req.headers['user-agent'], 300)
    });
    notifyDemoRequest(row).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[DEMO-REQ]', e.message);
    res.status(500).json({ error: 'Nu am putut înregistra cererea. Încearcă din nou.' });
  }
});
// Anunțarea super-adminilor. NU folosim notify(): acela difuzează pe email/Telegram/webhook, iar aici
// ar căra date personale. Datele solicitantului rămân EXCLUSIV în demo_requests; notificarea trimite doar id-ul.
async function notifyDemoRequest(row) {
  if (!row) return;
  try {
    const n = await db.createNotification({
      type: 'demo_request', severity: 'info', imei: null,
      title: row.wants_demo ? 'Cerere de cont demo' : 'Mesaj nou din formularul de contact',
      body: 'Deschide Administrare → Cereri demo pentru detalii și aprobare.',
      data: { key: 'demoreq:' + row.id, requestId: row.id },
      userId: null, companyId: null
    });
    const all = await db.getAllActiveUsers();
    for (const u of all) {
      if (u.role !== 'superadmin') continue;
      try { broadcastWsToUser(u.id, { type: 'notification', data: n }); } catch (e) {}
      try { await sendPushToUser(u.id, n.title, n.body, { notifId: n.id }); } catch (e) {}
    }
  } catch (e) { console.warn('[DEMO-REQ] notificare:', e.message); }
  // Email de alertă către noi — best-effort, doar dacă SMTP e configurat.
  try {
    const to = process.env.DEMO_REQUEST_EMAIL || process.env.SUPPORT_EMAIL || (await db.getSetting('support_email').catch(() => null));
    if (to && channels.emailConfigured && channels.emailConfigured()) {
      await channels.sendEmailTo(to, 'RA Tracks — cerere nouă din formular',
        [row.wants_demo ? 'CERERE DE CONT DEMO' : 'Mesaj de contact', 'Nume: ' + (row.name || '—'), 'Firmă: ' + (row.company || '—'),
         'Email: ' + row.email, 'Telefon: ' + (row.phone || '—'), '', (row.message || '')].join('\n'));
    }
  } catch (e) { /* best-effort */ }
}

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = ((req.body && req.body.email) || '').trim();
    // Conturile dezactivate sau expirate nu primesc link de resetare — nu are ce debloca, iar
    // trimiterea lui era primul pas al reactivării accidentale. Răspunsul de mai jos rămâne identic
    // în toate cazurile, ca nimeni să nu poată afla ce adrese există.
    if (email) {
      const u = await db.getUserByEmail(email);
      const potrivit = u && u.active !== false && !(u.access_until != null && Number(u.access_until) < Date.now());
      if (potrivit) { try { await sendSetPasswordEmail(req, u, { hours: 2 }); } catch (e) {} }
    }
  } catch (e) {}
  res.json({ ok: true, message: 'Dacă adresa există, vei primi un email cu instrucțiuni.' });
});

// ─── Facturare (Stripe) — se activează doar dacă STRIPE_SECRET_KEY e setat ───
// Grila internă de planuri = default-uri de configurare, NU ofertă publică (RA Tracks vinde oferte
// personalizate, stabilite de fondatori per companie). Endpointul era PUBLIC și expunea prețurile
// oricui (inclusiv concurenței) → acum cere autentificare.
app.get('/api/plans', requireAuth, (req, res) => {
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
      const numOrNull = function (v) { if (v == null || v === '') return null; const n = Number(v); return (isNaN(n) || n < 0) ? null : n; };
      const perVeh = numOrNull(c.pricePerVehicleRON);
      const flat = numOrNull(c.flatPriceRON);
      const base = numOrNull(c.basePerVehicleRON);
      const priceNone = numOrNull(c.priceNoneRON);
      // Oferta are nevoie de CEL PUȚIN un preț de pornire: fără CAN (direct), bază/vehicul (tiered), per-vehicul sau fix.
      if (priceNone == null && perVeh == null && flat == null && base == null) return res.status(400).json({ error: 'Oferta custom are nevoie de un preț (fără CAN, bază/vehicul, per vehicul SAU fix/lună)' });
      // IMEI-urile marcate manual „cu CAN" (din checklist-ul de vehicule).
      const canImeis = Array.isArray(c.canImeis) ? c.canImeis.filter(function (x) { return typeof x === 'string' && /^\d{6,20}$/.test(x); }).slice(0, 5000) : null;
      const custom = {
        name: (c.name || 'Custom').toString().slice(0, 60),
        priceNoneRON: priceNone,
        priceCanRON: numOrNull(c.priceCanRON),
        priceFmsRON: numOrNull(c.priceFmsRON),
        canImeis: canImeis,
        basePerVehicleRON: base,
        canAddonRON: numOrNull(c.canAddonRON),
        fmsAddonRON: numOrNull(c.fmsAddonRON),
        aiAssistantRON: numOrNull(c.aiAssistantRON),
        aiAgentsRON: numOrNull(c.aiAgentsRON),
        pricePerVehicleRON: perVeh,
        flatPriceRON: flat,
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
      const invoiceId = (obj.metadata && obj.metadata.invoiceId) ? parseInt(obj.metadata.invoiceId) : null;
      if (invoiceId && (obj.payment_status === 'paid' || obj.mode === 'payment')) {
        // Plată ONE-TIME a unei facturi cu cardul → marchează factura plătită + înregistrează încasarea + extinde accesul.
        try {
          const inv = await db.getInvoice(invoiceId);
          if (inv && inv.status !== 'paid') {
            // ATOMIC: plata și marcarea facturii într-o singură tranzacție (înainte: două await-uri →
            // eșecul celui de-al doilea lăsa plata înregistrată cu factura NEACHITATĂ).
            await db.payInvoiceAtomic(inv.id, { companyId: inv.company_id, amountRon: Number(inv.total) || null, periodStart: inv.period_start, periodEnd: inv.period_end, method: 'card', note: 'Stripe card · Factură ' + inv.full_number, createdBy: null }, { stripeInvoiceId: obj.payment_intent || obj.id });
            _invalidateAccessCache(inv.company_id);
          }
        } catch (e) { console.error('[BILLING] EȘEC la înregistrarea plății cu cardul (factura ' + invoiceId + '):', e.message); try { captureError(e, { route: 'stripe-webhook', context: { invoiceId: invoiceId } }); } catch (_) {} }
      } else {
        const companyId = obj.client_reference_id ? parseInt(obj.client_reference_id) : null;
        if (companyId) await db.setCompanyBilling(companyId, { status: 'active', customerId: obj.customer, subscriptionId: obj.subscription });
      }
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
    invalidateAccessCache(); _devCompanyCache.delete(req.params.imei); refreshWsScope();
    auditReq(req, 'assign_company', 'device', req.params.imei, { companyId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Super-admin: setează interfața CAN a device-ului.
//  - 'fms'   = FMC650 cu sursă CAN = FMS Gateway (semantică J1939)
//  - 'tacho' = FMC650 cablat DIRECT la tahograf (C5/C7) - semantică DSRC pe IDs 184-198, 222-235
//  - 'lvcan' = adaptor LV-CAN200/ALL-CAN300 (default), maparea standard
//  - null    = autodetect (folosește harta standard cu aliasuri pe ID 88, 91-93)
app.put('/api/devices/:imei/can-interface', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const raw = (req.body && req.body.can_interface) || null;
    if (raw != null && !['fms', 'lvcan', 'tacho'].includes(raw)) return res.status(400).json({ error: 'Valoare invalidă (fms / lvcan / tacho / null)' });
    const v = await db.setDeviceCanInterface(req.params.imei, raw);
    invalidateIfaceCache(req.params.imei);
    auditReq(req, 'set_can_interface', 'device', req.params.imei, { can_interface: v });
    res.json({ ok: true, can_interface: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Super-admin: TOATE dispozitivele (toate companiile) — sursa modulului „Dispozitive". Lean (fără io_data brut),
// cu tipul de date clasificat (FMS/CAN/fără), starea (active/neasignat/archived) și compania.
app.get('/api/admin/devices', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const devs = await db.getDevices(null);
    const out = (devs || [])
      .filter(d => !DEMO_SET.has(d.imei))
      .map(d => ({
        imei: d.imei, name: d.name || null, plate: d.plate || null, vehicle_type: d.vehicle_type || null,
        company_id: (d.company_id != null ? d.company_id : null), company_name: d.company_name || null,
        status: d.status || 'active',
        can_type: classifyDeviceCan(d), can_interface: d.can_interface || null,
        last_position_time: d.last_position_time || d.last_seen || null,
        created_at: d.created_at || null,
        install_issue: d.install_issue || null
      }));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Inventar echipamente GPS ───
// Super-admin → toate companiile; admin de companie (manageFleet) → doar flota lui.
// Coloane: client, mașină, IMEI, model GPS, cartelă SIM, ultima transmisie.
function _invScope(req) {
  // null = toate companiile (doar super-admin). Altfel, compania utilizatorului.
  return req.isSuper ? null : req.companyId;
}
async function _deviceInventory(req) {
  const rows = await db.getDeviceInventory(_invScope(req));
  // Demo NU intră în inventarul flotei reale (regula din CLAUDE.md), exceptând chiar compania demo.
  return rows.filter(function (r) {
    if (req.companyId === demoCompanyId) return true;
    return !DEMO_SET.has(r.imei);
  });
}
app.get('/api/device-inventory', requireAuth, requireFleet, async (req, res) => {
  try { res.json(await _deviceInventory(req)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Export brandat: trece prin sendReport → nume „RA-Tracks - Raport ... - data" + logo (regula din CLAUDE.md).
app.get('/api/device-inventory/export', requireAuth, requireFleet, async (req, res) => {
  try {
    if (!reportExport) return res.status(503).json({ error: 'Exportul nu e disponibil pe acest server' });
    const rows = await _deviceInventory(req);
    const fmt = (req.query.format === 'pdf') ? 'pdf' : 'xlsx';
    const fmtTs = function (t) { return t ? new Date(t).toLocaleString('ro-RO') : '—'; };
    const report = {
      type: 'device_inventory',
      label: 'Inventar dispozitive',
      periodLabel: 'Generat: ' + new Date().toLocaleString('ro-RO') + ' · ' + rows.length + ' dispozitive',
      columns: ['Client', 'Nr. înmatriculare', 'IMEI', 'Model dispozitiv', 'Cartelă SIM', 'Ultima transmisie'],
      rows: rows.map(function (r) {
        return [r.company_name || '—', r.plate || r.name || '—', r.imei, r.gps_model || '—', r.sim_number || '—', fmtTs(r.last_tx)];
      })
    };
    auditReq(req, 'export', 'device_inventory', null, { count: rows.length, format: fmt });
    return reportExport.sendReport(res, report, fmt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Debug super-admin: vezi io_data brut + can_interface pentru un IMEI (troubleshoot tracker fără date CAN) ───
// GET /api/debug/last-io/:imei → ultimele 5 io_data parsate din DB
// GET /api/debug/iface/:imei   → can_interface DB + cache + cheile CAN din ultima poziție
// ─── Observabilitate: jurnal erori (super-admin) ───
app.get('/api/admin/errors', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await db.getErrors(req.query.limit, req.query.level)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/errors', requireAuth, requireSuperadmin, async (req, res) => {
  try { await db.clearErrors(); auditReq(req, 'clear', 'error_log', null); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/debug/last-io/:imei', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const r = await db.pool.query(
      'SELECT timestamp, io_data FROM positions WHERE imei = $1 ORDER BY timestamp DESC LIMIT 5',
      [req.params.imei]
    );
    res.json({ imei: req.params.imei, rows: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stare memorie live (monitorizare scalare): dimensiune livePositions + memoria procesului + contoare ingest.
// ─── Avarie simulată, DOAR pentru teste ───────────────────────────────────────────────────────────
// Rutele astea NU se înregistrează decât cu NODE_ENV=test. În producție nu există deloc — nu e o
// poartă de protejat, e cod care nu ajunge în aplicație. Servesc la un singur lucru: să dovedim că
// o pană de bază de date NU pierde poziții (vezi verify_ack_durabil.js).
if (process.env.NODE_ENV === 'test') {
  app.get('/api/debug/break-db', requireAuth, requireSuperadmin, (req, res) => {
    db._simulateWriteFailure = true; res.json({ ok: true, scrierile: 'vor eșua' });
  });
  app.get('/api/debug/fix-db', requireAuth, requireSuperadmin, (req, res) => {
    db._simulateWriteFailure = false; res.json({ ok: true, scrierile: 'funcționează' });
  });
  // Pune un token de resetare fără să trimită email — ca testul să poată verifica CHIAR că un cont
  // dezactivat nu-și poate seta parola, în loc să sară peste verificarea aia.
  app.get('/api/debug/set-reset-token', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      await db.setUserResetToken(parseInt(req.query.user), String(req.query.token), Date.now() + 3600 * 1000);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

app.get('/api/debug/live-stats', requireAuth, requireSuperadmin, (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    livePositions: livePositions.size,
    activeConnections: (typeof activeConnections !== 'undefined') ? activeConnections.size : null,
    liveMax: parseInt(process.env.LIVE_MAX) || 5000,
    purgeMs: parseInt(process.env.LIVE_PURGE_MS) || 24 * 60 * 60 * 1000,
    rss_mb: Math.round(mem.rss / 1048576),
    heapUsed_mb: Math.round(mem.heapUsed / 1048576),
    uptime_s: Math.round(process.uptime()),
    ingest: ingestStats,                       // contoare cumulative de la boot (bytes/pachete/recorduri/ACK/erori)
    wsClients: (typeof wss !== 'undefined' && wss && wss.clients) ? wss.clients.size : null,
    strict: STRICT_DEVICES,
    registeredImeis: registeredImeis.size,
    archivedImeis: archivedImeis.size,
    stickyCanEntries: lastCanIo.size,
  });
});

// Intrarea BRUTĂ din livePositions + snapshot-ul CAN sticky pentru un IMEI — pentru IO Inspector din consola /debug.
// (/api/live e filtrat+enriched; aici vrem exact ce ține serverul în memorie: can_stale, moved_at, stale, io complet.)
app.get('/api/debug/live/:imei', requireAuth, requireSuperadmin, (req, res) => {
  const imei = req.params.imei;
  const sticky = lastCanIo.get(imei) || null;
  res.json({
    imei,
    live: livePositions.get(imei) || null,
    connected: activeConnections.has(imei),
    connection: (() => { const c = activeConnections.get(imei); return c ? { address: c.address, connectedAt: c.connectedAt } : null; })(),
    sticky: sticky ? { io: sticky.io, ts: sticky.ts } : null,
    sticky_persist_ts: lastCanPersistTs.get(imei) || null,
  });
});

// Clienții WebSocket conectați (cine ascultă live feed-ul) — pentru consola /debug.
app.get('/api/debug/ws-clients', requireAuth, requireSuperadmin, (req, res) => {
  const list = [];
  try {
    wss.clients.forEach(c => list.push({
      userId: c._userId || null, role: c._role || null, companyId: c._companyId || null,
      authed: !!c._authed, isSuper: !!c._isSuper, open: c.readyState === 1,
      scope: c._allowedImeis == null ? 'toate' : (c._allowedImeis.size + ' imei'),
    }));
  } catch (e) {}
  res.json({ count: list.length, clients: list });
});

// Referința IO generată din SURSA reală (codec8e getIoName, per interfață) — înlocuiește tabelele hardcodate din UI.
// Un AVL ID are sensuri diferite pe standard(LV-CAN) / FMS / tacho; consola le arată alături.
app.get('/api/debug/io-reference', requireAuth, requireSuperadmin, (req, res) => {
  const ref = {};
  for (let id = 0; id <= 1200; id++) {
    const std = getIoName(id, null), fms = getIoName(id, 'fms'), tacho = getIoName(id, 'tacho');
    const raw = 'io_' + id;
    if (std === raw && fms === raw && tacho === raw) continue; // necunoscut peste tot → nu-l listăm
    ref[id] = { standard: std !== raw ? std : null, fms: fms !== raw ? fms : null, tacho: tacho !== raw ? tacho : null };
  }
  res.json({ ids: ref, count: Object.keys(ref).length });
});

// Audit „de ce apare X pe hartă": pentru fiecare vehicul — status DB vs set arhivat în memorie vs prezent în live.
// Evidențiază „leaks" (arhivat în DB dar încă pe hartă). Cu ?fix=1 forțează reconcilierea pe loc.
// Forțează verificarea de facturare (trimite notificările „factură emisă" pt. companiile în grație). Util + debug.
app.post('/api/debug/billing-run', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await billingReminderTick()); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Facturare AUTOMATĂ — rulare manuală (super-admin): emite facturile lunii pt. companiile cu auto_invoice.
app.post('/api/admin/billing/run-auto', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await billingAutoInvoiceTick()); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Stare integrări facturare (email SMTP / e-Factura / Stripe) — pentru panoul de automatizare.
app.get('/api/admin/billing/config', requireAuth, requireSuperadmin, (req, res) => {
  const ef = efactura ? efactura.cfg() : {};
  res.json({
    email: !!(mailer && mailer.enabled()), emailFrom: (mailer && mailer.enabled()) ? mailer.fromAddr() : null,
    efactura: !!(efactura && efactura.enabled()), efacturaTest: ef.test !== false,
    stripe: !!(billing && billing.enabled())
  });
});
// Config facturare per companie: auto_invoice + ziua de facturare + termen de plată (actualizare parțială).
app.put('/api/companies/:id/billing-config', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); const b = req.body || {};
    const sets = [], args = [id];
    if (b.auto_invoice !== undefined) { args.push(b.auto_invoice === true || b.auto_invoice === 'true'); sets.push('auto_invoice=$' + args.length); }
    if (b.billing_day !== undefined) { args.push(Math.max(1, Math.min(parseInt(b.billing_day) || 1, 28))); sets.push('billing_day=$' + args.length); }
    if (b.payment_term_days !== undefined) { args.push(Math.max(0, Math.min(parseInt(b.payment_term_days) || 15, 120))); sets.push('payment_term_days=$' + args.length); }
    if (!sets.length) return res.json({ ok: true });
    await db.pool.query('UPDATE companies SET ' + sets.join(', ') + ' WHERE id=$1', args);
    auditReq(req, 'billing-config', 'company', id, b);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/debug/live-audit', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    if (req.query.fix) await reconcileArchived();
    const r = await db.pool.query('SELECT imei, name, plate, status FROM devices ORDER BY name');
    const devs = r.rows.map((d) => {
      const lp = livePositions.get(d.imei);
      return {
        imei: d.imei, name: d.name, plate: d.plate, db_status: d.status || null,
        inArchivedSet: archivedImeis.has(d.imei),
        inLivePositions: !!lp,
        live_ts: lp ? lp.timestamp : null,
      };
    });
    const leaks = devs.filter((d) => d.db_status === 'archived' && d.inLivePositions).map((d) => d.name || d.imei);
    res.json({ fixed: !!req.query.fix, archivedSetSize: archivedImeis.size, livePositionsSize: livePositions.size, leaks, devices: devs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/debug/iface/:imei', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const imei = req.params.imei;
    const dbVal = await db.getDeviceCanInterface(imei).catch(() => null);
    const cached = await getDeviceIface(imei).catch(() => null);
    const lastRow = await db.pool.query(
      'SELECT timestamp, io_data FROM positions WHERE imei = $1 ORDER BY timestamp DESC LIMIT 1',
      [imei]
    );
    const live = livePositions.get(imei);
    const lastIo = lastRow.rows[0] ? lastRow.rows[0].io_data : null;
    const canKeysHist = lastIo ? Object.keys(lastIo).filter(k => k.startsWith('can_') || k.startsWith('tacho_') || k.startsWith('fms_') || k.startsWith('io_')) : [];
    const canKeysLive = live && live.io ? Object.keys(live.io).filter(k => k.startsWith('can_') || k.startsWith('tacho_') || k.startsWith('fms_') || k.startsWith('io_')) : [];
    res.json({
      imei,
      can_interface_db: dbVal,
      can_interface_cached: cached,
      lastHistoricalTimestamp: lastRow.rows[0] ? lastRow.rows[0].timestamp : null,
      canKeysInLastHistorical: canKeysHist,
      liveStale: live ? !!live.stale : null,
      canKeysInLive: canKeysLive,
      hint: dbVal == null && (canKeysHist.includes('io_88') || canKeysLive.includes('io_88'))
        ? 'Trackerul emite RPM pe ID 88 (profil truck LV-CAN200). Patch-ul curent îl mapează automat ca can_engine_rpm. Dacă vezi io_88 brut, redeploy-ul nu a prins codec8e — verifică Railway.'
        : (dbVal == null ? 'can_interface=null → maparea standard (cu aliasuri 88/91-93). Pentru FMC650 cu FMS Gateway recomandat: PUT /api/devices/' + imei + '/can-interface { can_interface: "fms" }.' : 'OK')
    });
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
    refreshWsScope();
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
function etransportEnabled() { return !!(anaf && anaf.enabled()); }
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

// ─── Card combustibil: alimentări + reconciliere cu nivelul CAN (detecție furt) — manageFleet ───
// Reconciliază o alimentare: compară litrii cumpărați cu CREȘTEREA reală a nivelului CAN din rezervor,
// în fereastra ±3h (absoarbe fusul orar al bonului + decalajul moment-bon vs moment-alimentare). Status:
//   reconciliat = rezervorul a crescut ~cât scrie pe bon · suspect = NU a crescut (posibil furt) · partial = a crescut mai puțin · fara_can = fără citiri CAN.
async function reconcileFuelTx(tx) {
  if (!tx.imei || !tx.ts || !(Number(tx.liters) > 0)) return { status: tx.imei ? 'nou' : 'fara_can', tankDelta: null };
  const from = Number(tx.ts) - 3 * 3600 * 1000, to = Number(tx.ts) + 3 * 3600 * 1000;
  let rows;
  try { rows = await db.getDeviceHistory(tx.imei, from, to, 5000); } catch (e) { return { status: 'fara_can', tankDelta: null }; }
  const fuelOf = (io) => { if (!io) return null; const v = (typeof io.fuel_level_liters === 'number') ? io.fuel_level_liters : io.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; };
  const reads = [];
  for (const r of rows) { const f = fuelOf(r.io_data); if (f != null) reads.push(f); }
  if (reads.length < 2) return { status: 'fara_can', tankDelta: null };
  let minF = Infinity, minIdx = 0;
  for (let i = 0; i < reads.length; i++) if (reads[i] < minF) { minF = reads[i]; minIdx = i; }
  let maxAfter = -Infinity;
  for (let i = minIdx; i < reads.length; i++) if (reads[i] > maxAfter) maxAfter = reads[i];
  const rise = Math.max(0, maxAfter - minF), L = Number(tx.liters);
  let status = (rise >= L * 0.6) ? 'reconciliat' : (rise < L * 0.3 ? 'suspect' : 'partial');
  return { status, tankDelta: Math.round(rise * 10) / 10 };
}
function _fcNum(s) { if (s == null) return null; const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; }
function _fcDate(s) {
  if (!s) return null; s = String(s).trim();
  let m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0)); }
  m = /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
  const t = Date.parse(s); return Number.isFinite(t) ? t : null;
}
// Parser CSV generic: delimiter ; , sau tab; antet RO/EN auto-detectat.
function parseFuelCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const semis = (lines[0].match(/;/g) || []).length, commas = (lines[0].match(/,/g) || []).length, tabs = (lines[0].match(/\t/g) || []).length;
  const delim = tabs > semis && tabs > commas ? '\t' : (semis >= commas ? ';' : ',');
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...names) => { for (const n of names) { const i = head.findIndex((h) => h.indexOf(n) >= 0); if (i >= 0) return i; } return -1; };
  const ci = {
    date: find('data', 'date', 'dată', 'datum'), liters: find('litri', 'liter', 'cantitate', 'quantity', 'qty', 'volum'),
    amount: find('suma', 'sumă', 'valoare', 'amount', 'total', 'pret', 'preț'), station: find('statie', 'stație', 'station', 'locat', 'denumire'),
    plate: find('inmatricul', 'înmatricul', 'plate', 'nr', 'numar', 'număr', 'vehicul', 'reg'), card: find('card'), country: find('tara', 'țară', 'country', 'tară'),
  };
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const liters = ci.liters >= 0 ? _fcNum(c[ci.liters]) : null, ts = ci.date >= 0 ? _fcDate(c[ci.date]) : null;
    if (!liters && !ts) continue;
    out.push({ ts, liters, amount: ci.amount >= 0 ? _fcNum(c[ci.amount]) : null, station: ci.station >= 0 ? c[ci.station] : null, plate: ci.plate >= 0 ? c[ci.plate] : null, card_number: ci.card >= 0 ? c[ci.card] : null, country: ci.country >= 0 ? c[ci.country] : null });
  }
  return out;
}

app.get('/api/fuel-transactions', requireAuth, requireFleet, withCompany, async (req, res) => {
  try { res.json(await db.listFuelTransactions(req.companyId, { imei: req.query.imei, from: req.query.from, to: req.query.to })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/fuel-transactions', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    const b = req.body || {};
    let imei = b.imei || null;
    if (!imei && b.plate) imei = await db.getDeviceImeiByPlate(b.plate, req.companyId);
    const tx = { imei, driver_id: b.driver_id || null, ts: b.ts ? Number(b.ts) : (b.date ? _fcDate(b.date) : null), station: b.station || null, country: b.country || null, liters: b.liters != null ? Number(b.liters) : null, amount: b.amount != null ? Number(b.amount) : null, currency: b.currency || 'RON', card_number: b.card_number || null, source: 'manual', note: b.note || null };
    const rec = await reconcileFuelTx(tx); tx.status = rec.status; tx.tank_delta = rec.tankDelta;
    const row = await db.createFuelTransaction(tx, req.companyId);
    auditReq(req, 'create', 'fuel-tx', row.id);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/fuel-transactions/import', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    const parsed = parseFuelCsv((req.body && req.body.csv) || '');
    if (!parsed.length) return res.status(400).json({ error: 'CSV gol sau format necunoscut (antet așteptat: data, litri, sumă, înmatriculare, stație…)' });
    let imported = 0, noVeh = 0;
    for (const p of parsed.slice(0, 5000)) {
      const imei = p.plate ? await db.getDeviceImeiByPlate(p.plate, req.companyId) : null;
      if (p.plate && !imei) noVeh++;
      await db.createFuelTransaction({ imei, ts: p.ts, station: p.station, country: p.country, liters: p.liters, amount: p.amount, card_number: p.card_number, source: 'csv', status: 'nou' }, req.companyId);
      imported++;
    }
    auditReq(req, 'import', 'fuel-tx', null, { count: imported });
    res.json({ ok: true, imported, unmatchedPlate: noVeh });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/fuel-transactions/reconcile', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    const rows = await db.listFuelTransactions(req.companyId, { limit: 1500 });
    let reconciled = 0, suspect = 0;
    for (const tx of rows) {
      const rec = await reconcileFuelTx(tx);
      await db.setFuelTxReconcile(tx.id, rec.status, rec.tankDelta, req.companyId);
      reconciled++; if (rec.status === 'suspect') suspect++;
    }
    res.json({ ok: true, reconciled, suspect });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/fuel-transactions/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try { await db.deleteFuelTransaction(parseInt(req.params.id), req.companyId); auditReq(req, 'delete', 'fuel-tx', req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Webhooks (integrare ERP/TMS) — CRUD per companie (admin) ───
app.get('/api/webhooks', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const rows = await db.getWebhooks(req.isSuper ? null : req.companyId);
    // Maschează secretul (nu-l returnăm în clar; arătăm doar dacă există).
    res.json(rows.map(w => ({ id: w.id, url: w.url, events: w.events, enabled: w.enabled, hasSecret: !!w.secret, last_status: w.last_status, last_error: w.last_error, last_at: w.last_at, created_at: w.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/webhooks', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    const url = (req.body.url || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ error: 'URL invalid (http/https)' });
    const urlErr = webhookUrlError(url); // anti-SSRF: refuză gazde interne/IP private
    if (urlErr) return res.status(400).json({ error: urlErr });
    const events = Array.isArray(req.body.events) && req.body.events.length ? req.body.events.slice(0, 30) : null; // null = toate
    const secret = req.body.secret ? String(req.body.secret).slice(0, 80) : ('whsec_' + crypto.randomBytes(16).toString('hex'));
    const w = await db.createWebhook({ url, events, secret, enabled: req.body.enabled !== false }, req.companyId);
    invalidateWebhookCache(req.companyId);
    auditReq(req, 'create', 'webhook', w.id, { url });
    res.json({ id: w.id, url: w.url, events: w.events, enabled: w.enabled, secret }); // secretul se arată O SINGURĂ DATĂ la creare
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/webhooks/:id', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'webhooks', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteWebhook(req.params.id); invalidateWebhookCache(req.companyId);
    auditReq(req, 'delete', 'webhook', req.params.id); res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Trimite un eveniment de test la webhook (verifică URL + semnătură la integrator).
app.post('/api/webhooks/:id/test', requireAuth, requireAdmin, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'webhooks', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    const w = await db.getWebhookById(req.params.id);
    if (!w) return res.status(404).json({ error: 'Inexistent' });
    // Doar acest webhook (nu fan-out) — buton „testează acest webhook".
    const body = JSON.stringify({ company_id: w.company_id, ts: new Date().toISOString(), event: 'test', imei: null, vehicle: null, severity: 'info', message: 'Eveniment de test RA Tracks' });
    _deliverWebhook(w, body);
    auditReq(req, 'test', 'webhook', w.id);
    res.json({ ok: true, message: 'Eveniment de test trimis. Verifică starea în listă.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Worker e-Transport: trimite pozițiile transporturilor active la ANAF (DOAR dacă e configurat tokenul)
async function sendEtransportPositions() {
  if (!etransportEnabled()) return;
  try {
    const active = await db.getActiveEtransports();
    for (const tr of active) {
      const pos = tr.imei ? livePositions.get(tr.imei) : null;
      if (!pos || !tr.uit) continue;
      const ok = await anaf.sendPosition(tr.uit, pos.latitude, pos.longitude);
      if (ok) await db.updateEtransport(tr.id, { last_sent_at: new Date().toISOString() }).catch(() => {});
    }
  } catch (e) { console.warn('[e-Transport]', e.message); }
}

// ─── Module strategice DEMO-READY (e-Transport demo, E-Toll/Roviniete, Tahograf) ───
// Endpoint-uri de simulare + flag-uri Demo/Real (settings). Montate aici (toate middleware-urile sunt definite).
try {
  require('./demo_modules').register(app, {
    db, requireAuth, requireFleet, requireSuperadmin, withCompany, requireFeature, auditReq, ownsRow, livePositions
  });
  console.log('[DEMO-MODULES] e-Transport / E-Toll / Tahograf — endpoint-uri demo montate');
} catch (e) { console.warn('[DEMO-MODULES] nu s-au putut monta:', e.message); }

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  TollRo — taxa rutieră pe kilometru pentru marfă peste 3,5 t
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Deosebirea față de calculatoarele publice: acolo tastezi numărul și VIN-ul oricărui camion.
// Aici vehiculul se ALEGE DIN FLOTĂ — profilul (masă, axe, normă Euro) vine din fișa lui, iar
// `canAccessImei` se asigură că nu poți calcula pentru mașina altei companii. Nu există cale prin
// care un client să afle ceva despre un vehicul care nu e al lui.
const TOLLRO_GRID_KEY = 'tollro_grid';

async function _tollroGrila() {
  let raw = null;
  try { raw = await db.getSetting(TOLLRO_GRID_KEY); } catch (e) { raw = null; }
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
  return tollro.grilaValida(raw);
}

// Catalogul (trepte de masă, norme Euro, clase de drum) + grila în vigoare.
app.get('/api/tollro/config', requireAuth, withScope, async (req, res) => {
  try {
    res.json({
      categorii: tollro.CATEGORII, euro: tollro.EURO, claseDrum: tollro.CLASE_DRUM,
      grila: await _tollroGrila(), implicit: tollro.GRILA_IMPLICITA, editabil: !!req.isSuper,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Grila se schimbă prin ordonanță, deci o poate corecta DOAR super-adminul — e prețul pe care îl
// plătesc toți clienții, nu o preferință de companie.
app.put('/api/tollro/config', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const g = tollro.grilaValida(req.body && req.body.grila);
    await db.setSetting(TOLLRO_GRID_KEY, JSON.stringify(g));
    auditReq(req, 'update', 'tollro_grid', null, { aplicabilDin: g.aplicabilDin });
    res.json({ ok: true, grila: g });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profilul de taxare al unui vehicul DIN FLOTĂ, citit din fișa lui.
async function _tollroProfil(imei) {
  const d = await db.getDeviceFull(imei);
  if (!d) return null;
  const axe = (function () {
    try {
      const a = typeof d.max_axle_loads === 'string' ? JSON.parse(d.max_axle_loads) : (d.max_axle_loads || {});
      const n = Object.keys(a || {}).filter(function (k) { return Number(a[k]) > 0; }).length;
      return n > 0 ? n : null;
    } catch (e) { return null; }
  })();
  return {
    imei: d.imei, nume: d.name || null, numar: d.plate || null, vin: d.vin || null,
    masaKg: d.max_weight_legal != null ? Number(d.max_weight_legal) : null,
    euro: d.emission_class || null, axe: axe, tip: d.vehicle_type || null,
  };
}

// Profilul de taxare al unui vehicul, ca sa se vada pe ecran EXACT ce sta la baza calculului.
// Daca ecranul l-ar citi din lista incarcata in browser, cele doua ar putea sa se desparta tacut —
// iar aici se afiseaza bani.
app.get('/api/tollro/profil/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const imei = String(req.params.imei || '');
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const prof = await _tollroProfil(imei);
    if (!prof) return res.status(404).json({ error: 'Vehicul negasit' });
    const g = await _tollroGrila();
    const cat = tollro.categorieDupaMasa(prof.masaKg);
    const euro = tollro.euroNormalizat(prof.euro);
    res.json({
      vehicul: prof,
      incadrare: cat ? {
        categorie: cat, euro: euro || 'euro3', euroCunoscut: !!euro,
        leiPerKm: g.tarife[cat][euro || 'euro3'],
      } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Estimare din kilometri DAȚI (introduși de om sau veniți din altă parte).
app.post('/api/tollro/estimate', requireAuth, withScope, async (req, res) => {
  try {
    const imei = String((req.body && req.body.imei) || '');
    if (!imei || !canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const prof = await _tollroProfil(imei);
    if (!prof) return res.status(404).json({ error: 'Vehicul negăsit' });
    const km = (req.body && req.body.km) || {};
    const rez = tollro.estimeaza({ masaKg: prof.masaKg, euro: prof.euro }, km, await _tollroGrila());
    res.json({ vehicul: prof, rezultat: rez });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Estimare din TRASEUL DEJA PARCURS — asta nu poate face niciun calculator public: are nevoie de
// istoricul GPS al mașinii. Punctele se rărește la un eșantion la ~250 m (destul ca să prindem
// schimbarea tipului de drum, fără să inundăm OpenStreetMap), fiecare eșantion primește clasa
// drumului, iar distanța dintre eșantioane se pune în dreptul clasei de la care pleacă.
app.post('/api/tollro/din-istoric', requireAuth, withScope, async (req, res) => {
  try {
    const imei = String((req.body && req.body.imei) || '');
    if (!imei || !canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const prof = await _tollroProfil(imei);
    if (!prof) return res.status(404).json({ error: 'Vehicul negăsit' });

    const from = req.body.from, to = req.body.to;
    if (!from || !to) return res.status(400).json({ error: 'Alege intervalul' });
    if (Date.parse(to) - Date.parse(from) > 8 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'Interval prea lung — maxim 8 zile odată (datele despre drumuri se iau de la OpenStreetMap, care are limite de uz).' });
    }

    let hist = [];
    try { hist = await db.getDeviceHistory(imei, from, to, 20000); } catch (e) { hist = []; }
    const pts = hist.filter(function (p) { return p.latitude != null && p.longitude != null; })
      .map(function (p) { return [Number(p.latitude), Number(p.longitude)]; });
    if (pts.length < 2) return res.json({ vehicul: prof, rezultat: null, error: 'Nu există traseu în intervalul ales.' });

    // Rărire la ~250 m: păstrăm primul punct, apoi doar cele care s-au depărtat destul.
    const PAS_M = 250;
    const esant = [pts[0]];
    let ultim = pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (haversineDistance(ultim[0], ultim[1], pts[i][0], pts[i][1]) * 1000 >= PAS_M) { esant.push(pts[i]); ultim = pts[i]; }
    }
    if (esant.length < 2) return res.json({ vehicul: prof, rezultat: null, error: 'Vehiculul aproape nu s-a deplasat în intervalul ales.' });

    // Modulul de drumuri e optional la pornire (require intr-un try) — daca lipseste, spunem clar
    // ca functia e indisponibila, nu cadem cu 500 pe „classesForPoints of null".
    if (!roadlimits || typeof roadlimits.classesForPoints !== 'function') {
      return res.status(503).json({ error: 'Datele despre tipul drumurilor nu sunt disponibile pe acest server.' });
    }
    let cls;
    try { cls = await roadlimits.classesForPoints(esant); }
    catch (e) { return res.status(e.code === 'AREA' ? 400 : 502).json({ error: e.message }); }

    // Distanța fiecărui segment merge la clasa punctului de la care pleacă. Segmentele fără drum
    // identificat (off-road, zonă fără date OSM) se raportează separat — nu le împingem în „netaxat"
    // ca și cum am ști că nu se taxează.
    const km = { autostrada: 0, national: 0, alte: 0 };
    let kmNecunoscut = 0;
    for (let i = 1; i < esant.length; i++) {
      const d = haversineDistance(esant[i - 1][0], esant[i - 1][1], esant[i][0], esant[i][1]);
      const hw = cls.classes[i - 1];
      if (hw == null) { kmNecunoscut += d; continue; }
      km[tollro.clasaDinOsm(hw)] += d;
    }
    for (const k of Object.keys(km)) km[k] = Math.round(km[k] * 10) / 10;
    kmNecunoscut = Math.round(kmNecunoscut * 10) / 10;

    const rez = tollro.estimeaza({ masaKg: prof.masaKg, euro: prof.euro }, km, await _tollroGrila());
    if (kmNecunoscut > 0) rez.avertismente.push(kmNecunoscut.toString().replace('.', ',') + ' km nu s-au putut încadra pe un drum cunoscut (zonă fără date OSM sau în afara carosabilului) — nu sunt taxați în estimarea de mai sus.');
    res.json({
      vehicul: prof, rezultat: rez, km, kmNecunoscut,
      esantioane: esant.length, zone: cls.tiles, traseu: esant,
      atribuire: cls.attribution, sursa: 'traseul real al vehiculului + tipul drumului din OpenStreetMap',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Suport clienți — mesaje din butonul headset (UI). Persistate (vizibile super-admin) + email best-effort. ───
app.post('/api/support', requireAuth, withCompany, async (req, res) => {
  if (_demoBlocked(req, res)) return;
  try {
    const msg = String((req.body && req.body.message) || '').slice(0, 4000).trim();
    if (!msg) return res.status(400).json({ error: 'Mesaj gol' });
    const a = req.auth || getAuth(req) || {};
    const who = a.username || ('utilizator#' + (a.userId || '?'));
    try { await db.logError({ level: 'info', message: 'SUPORT — ' + who + ': ' + msg, route: '/api/support', userId: a.userId || null, companyId: a.companyId || null, context: { kind: 'support' } }); } catch (e) {}
    try {
      const to = process.env.SUPPORT_EMAIL || (await db.getSetting('support_email').catch(() => null));
      if (to && channels && channels.sendEmailTo) channels.sendEmailTo(to, 'Mesaj suport — ' + who, msg).catch(() => {});
    } catch (e) {}
    auditReq(req, 'create', 'support', null, { len: msg.length });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    // Scalare: filtrează pe companie în SQL (non-super) → la 30+ companii nu mai încărcăm global.
    let devices = await db.getDevices(req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) devices = devices.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) devices = devices.filter(d => !DEMO_SET.has(d.imei)); // demo doar în contul demo
    // Implicit ascunde vehiculele arhivate (de pe hartă/selectoare); ?includeArchived=1 le include (management)
    if (!req.query.includeArchived) devices = devices.filter(d => d.status !== 'archived');
    // Overlay „moved_at" (memoria de mișcare) din snapshot-ul live → statusul are histerezis chiar de la prima încărcare.
    for (const d of devices) { const lp = livePositions.get(d.imei); if (lp && lp.moved_at) d.moved_at = lp.moved_at; }
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dispozitive arhivate (contracte încheiate) + nr. poziții păstrate în arhivă. Pagina „Dispozitive arhivate".
app.get('/api/archived-devices', requireAuth, withScope, async (req, res) => {
  try {
    let rows = await db.getArchivedDevices();
    if (req.allowedImeis != null) rows = rows.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) rows = rows.filter(d => !DEMO_SET.has(d.imei)); // demo doar în contul demo
    res.json(rows);
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
    // Companie: ne-super → compania proprie; super → opțional company_id din body, altfel neasignat
    const companyId = req.isSuper
      ? (req.body.company_id != null && req.body.company_id !== '' ? parseInt(req.body.company_id) : null)
      : req.companyId;
    const fields = {};
    ['name', 'plate', 'vehicle_type', 'vin', 'brand', 'model'].forEach(k => { if (req.body[k]) fields[k] = req.body[k]; });
    // Semnalare „problemă la montaj" direct de la adăugare (anulabilă ulterior din listă)
    const instIssue = req.body.install_issue
      ? { note: (typeof req.body.install_issue_note === 'string' && req.body.install_issue_note.trim()) ? req.body.install_issue_note.trim().slice(0, 300) : null, at: Date.now(), by: (req.session && req.session.username) || null }
      : null;

    // Dacă IMEI-ul există DEJA: ADOPȚIE dacă e neasignat (company_id NULL) — tipic un tracker care a transmis ÎNAINTE
    // de a fi înregistrat. Îl revendică compania care îl adaugă (ne-super: doar compania proprie). Dacă aparține deja
    // ALTEI companii → 409 (nu se poate „fura").
    const _existing = await db.getDeviceFull(imei);
    if (_existing) {
      if (_existing.company_id != null) return res.status(409).json({ error: 'Există deja un vehicul cu acest IMEI' });
      const adoptCompany = req.isSuper ? companyId : req.companyId;
      if (adoptCompany == null) return res.status(400).json({ error: 'Cont fără companie — nu poate adopta vehicule. Contactează administratorul.' });
      const adopted = await db.adoptDevice(imei, adoptCompany); // atomic: doar dacă încă e NULL (cursă închisă)
      if (!adopted) return res.status(409).json({ error: 'Există deja un vehicul cu acest IMEI' }); // altă companie l-a adoptat între timp
      if (Object.keys(fields).length) await db.updateVehicleDetails(imei, fields);
      if (instIssue) await db.pool.query('UPDATE devices SET install_issue = $2::jsonb WHERE imei = $1', [imei, JSON.stringify(instIssue)]);
      if (_existing.status === 'archived') await db.setDeviceStatus(imei, 'active');
      registeredImeis.add(imei); deviceAttempts.delete(imei); // adoptat → intră în allow-list (mod strict)
      invalidateAccessCache(); invalidateLiveEnrichCache(); _devCompanyCache.delete(imei); await refreshWsScope();
      const _pa = livePositions.get(imei);
      if (_pa) { _pa.name = fields.name || _pa.name || null; _pa.plate = fields.plate || _pa.plate || null; _pa.vehicle_type = fields.vehicle_type || _pa.vehicle_type || null; livePositions.set(imei, _pa); try { broadcastPosition(_pa); } catch (_) {} }
      auditReq(req, 'adopt', 'device', imei, { companyId: adoptCompany });
      return res.json({ ok: true, adopted: true, imei });
    }

    await db.createDevice(imei, fields, companyId);
    if (instIssue) await db.pool.query('UPDATE devices SET install_issue = $2::jsonb WHERE imei = $1', [imei, JSON.stringify(instIssue)]);
    registeredImeis.add(imei); deviceAttempts.delete(imei); // pre-înregistrat → intră în allow-list (mod strict)
    invalidateAccessCache(); // vehicul nou în companie → reîmprospătează accesul (altfel nu apare/nu se editează ~15s)
    invalidateLiveEnrichCache(); // identitatea nouă (nume/nr) să apară imediat pe /api/live, nu după 20s
    // Dacă vehiculul transmitea deja (era în memoria live ca IMEI „gol"), pune-i numele/nr ACUM + anunță WS,
    // ca să nu aștepte un pachet GPS nou și să nu i se „reseteze" plăcuța peste rosterul din DB.
    const _pos = livePositions.get(imei);
    if (_pos) {
      _pos.name = fields.name || null;
      _pos.plate = fields.plate || null;
      _pos.vehicle_type = fields.vehicle_type || null;
      livePositions.set(imei, _pos);
      broadcastWs({ type: 'position', data: _pos });
    }
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

// ─── Export brandat: „Situația flotei" (Excel/PDF) ──────────────────────────────────────────────
// Butonul „Exportă" din Vehicule. CSV-ul de mai sus rămâne, dar pentru altceva: e formatul pe care
// îl reînghite importul (export → editezi → reimporți). Documentul ăsta e pentru citit și trimis.
app.get('/api/devices/export', requireAuth, withScope, async (req, res) => {
  try {
    if (!reportExport) return res.status(503).json({ error: 'Exportul nu e disponibil pe acest server' });
    let devices = await db.getDevices();
    if (req.allowedImeis != null) devices = devices.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) devices = devices.filter(d => !DEMO_SET.has(d.imei));
    const archived = String(req.query.scope || '') === 'archived';
    devices = devices.filter(d => archived ? d.status === 'archived' : d.status !== 'archived');
    // Numele șoferilor, ca documentul să nu arate un id de bază de date
    const drvName = {};
    try { for (const d of await db.getDrivers(req.isSuper ? null : req.companyId)) drvName[d.id] = d.name; } catch (e) {}
    devices.sort((a, b) => String(a.plate || a.name || '').localeCompare(String(b.plate || b.name || '')));
    const fmtTs = t => t ? new Date(t).toLocaleString('ro-RO') : '—';
    const cols = ['Nr. înmatriculare', 'Nume', 'Categorie', 'Marcă', 'Model', 'An', 'Combustibil', 'Grup', 'Șofer', 'Ultima transmisie', 'IMEI'];
    const rows = devices.map(d => [
      d.plate || '—', d.name || d.imei, d.vehicle_type || '—', d.brand || '—', d.model || '—',
      d.year || '—', d.fuel_type || '—', d.group_name || '—',
      d.driver_id ? (drvName[d.driver_id] || '—') : '—',
      fmtTs(d.last_position_time || d.last_seen), d.imei
    ]);
    if (req.isSuper) { cols.push('Companie'); devices.forEach((d, i) => rows[i].push(d.company_name || '—')); }
    const fmt = (req.query.format === 'pdf') ? 'pdf' : 'xlsx';
    const report = {
      type: 'fleet_inventory',
      label: archived ? 'Vehicule arhivate' : 'Situația flotei',
      periodLabel: 'Generat: ' + new Date().toLocaleString('ro-RO') + ' · ' + devices.length + ' vehicule',
      columns: cols, rows
    };
    auditReq(req, 'export', 'devices', null, { count: devices.length, format: fmt, scope: archived ? 'archived' : 'active' });
    return reportExport.sendReport(res, report, fmt);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
          registeredImeis.add(imei); deviceAttempts.delete(imei); // import → în allow-list (mod strict)
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
    if (status === 'archived') {
      // Întâi PĂSTRĂM istoricul (snapshot în positions_archive), abia apoi marcăm arhivat + oprim ingestul.
      // Ordinea contează: dacă am opri ingestul înainte de copiere, n-am pierde nimic, dar așa garantăm snapshot complet.
      let archived = 0;
      try { archived = await db.archiveDevicePositions(imei); } catch (e) { console.error('[ARHIVĂ] copiere istoric ' + imei + ':', e.message); }
      await db.setDeviceStatus(imei, status);
      archivedImeis.add(imei);
      registeredImeis.delete(imei); // scoate din allow-list → respins la următorul handshake (mod strict)
      { const _c = activeConnections.get(imei); if (_c && _c.socket) { try { _c.socket.destroy(); } catch (_) {} } } // taie conexiunea activă acum
      // scoate-l din harta live imediat (nu mai primește date)
      livePositions.delete(imei);
      broadcastWs({ type: 'removed', data: { imei } }); // scoate marker-ul din sesiunile web/mobil deschise
      auditReq(req, 'update', 'device', imei, { status, archived_positions: archived });
      return res.json({ ok: true, status, archived_positions: archived });
    }
    // Restaurare: reia ingestul. Istoricul rămâne în positions_archive (getDeviceHistory face UNION → fără pierderi).
    await db.setDeviceStatus(imei, status);
    archivedImeis.delete(imei);
    registeredImeis.add(imei); // reintră în allow-list (mod strict)
    auditReq(req, 'update', 'device', imei, { status });
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: ȘTERGERE DEFINITIVĂ vehicul (super-admin). DOAR vehicule ARHIVATE — garanție că nu se șterge
// din greșeală un vehicul activ. Ireversibil: rândul + toate datele (poziții, istoric, notificări etc.).
app.delete('/api/devices/:imei', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const { imei } = req.params;
    const dev = await db.getDeviceFull(imei);
    if (!dev) return res.status(404).json({ error: 'Vehicul inexistent' });
    if (dev.status !== 'archived') return res.status(400).json({ error: 'Doar vehiculele ARHIVATE pot fi șterse definitiv. Arhivează-l întâi.' });
    const deleted = await db.deleteDeviceCompletely(imei);
    archivedImeis.delete(imei);
    registeredImeis.delete(imei);
    livePositions.delete(imei);
    broadcastWs({ type: 'removed', data: { imei } });
    auditReq(req, 'delete', 'device', imei, { name: dev.name, plate: dev.plate, hard: true });
    console.log(`[ȘTERGERE] Vehicul ${imei} (${dev.plate || dev.name || '-'}) șters definitiv de ${(getAuth(req) || {}).username || '?'}`);
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mod strict: încercări de conectare de la IMEI-uri NEÎNREGISTRATE (super-admin) — descoperire + aprobare ──
app.get('/api/admin/device-attempts', requireAuth, requireSuperadmin, (req, res) => {
  const attempts = [...deviceAttempts.entries()]
    .map(([imei, v]) => ({ imei, first: new Date(v.first).toISOString(), last: new Date(v.last).toISOString(), count: v.count, address: v.address }))
    .sort((a, b) => new Date(b.last) - new Date(a.last));
  res.json({ strict: STRICT_DEVICES, registered: registeredImeis.size, attempts });
});
app.delete('/api/admin/device-attempts/:imei', requireAuth, requireSuperadmin, (req, res) => {
  deviceAttempts.delete(String(req.params.imei || ''));
  res.json({ ok: true });
});

// Cache enrichment device pentru /api/live (truck config + calibrare combustibil) — date care se schimbă rar.
// Fără cache, fiecare poll /api/live (frontend cheamă la ~0.5-2s) interoga TOATE device-urile = O(n) inutil.
// TTL 20s + invalidare explicită la update-uri de config (vezi invalidateLiveEnrichCache).
let _liveEnrichCache = { ts: 0, map: null };
async function getLiveEnrichMap() {
  const now = Date.now();
  if (_liveEnrichCache.map && (now - _liveEnrichCache.ts) < 20000) return _liveEnrichCache.map;
  const result = await db.pool.query('SELECT imei, name, plate, vehicle_type, tare_weight, max_weight_legal, max_weight_construct, max_axle_loads, tank_calibration, fuel_price, cost_per_ton_km FROM devices');
  const map = new Map(result.rows.map(r => [r.imei, r]));
  _liveEnrichCache = { ts: now, map };
  return map;
}
function invalidateLiveEnrichCache() { _liveEnrichCache = { ts: 0, map: null }; }

// API: Poziții live din memorie
app.get('/api/live', requireAuth, withScope, async (req, res) => {
  let positions = Array.from(livePositions.values());
  if (req.allowedImeis != null) positions = positions.filter(p => req.allowedImeis.has(p.imei));
  if (archivedImeis.size) positions = positions.filter(p => !archivedImeis.has(p.imei)); // arhivatele nu apar live
  if (req.companyId !== demoCompanyId) positions = positions.filter(p => !DEMO_SET.has(p.imei)); // demo doar în contul demo
  try {
    // Enrich with full device info (truck config, tank calibration, etc.) — din cache TTL 20s
    const devMap = await getLiveEnrichMap();
    for (const pos of positions) {
      const dev = devMap.get(pos.imei);
      if (dev) {
        // Nume + nr. înmatriculare mereu din DB (proaspăt) — vehiculele noi / cele fără seed la boot nu mai apar cu IMEI.
        if (dev.name != null) pos.name = dev.name;
        if (dev.plate != null) pos.plate = dev.plate;
        if (dev.vehicle_type != null) pos.vehicle_type = dev.vehicle_type;
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

// ─── Geocodare inversă, PRIN SERVERUL NOSTRU ───
// Până acum browserul și APK-ul loveau `nominatim.openstreetmap.org` DIRECT: fără throttle (politica lor
// cere ≤1 cerere/s pe aplicație), fără User-Agent identificabil (browserele nu-l pot seta), cu un cache
// separat per filă. Cu zeci de operatori × sute de vehicule, asta e exact „heavy use"-ul pentru care
// Nominatim blochează IP-uri — și `GEOCODE_URL` de pe server nu acoperea nimic din traficul ăla.
// Acum totul trece pe aici: o singură coadă, un singur cache, o singură identitate, un singur furnizor
// de schimbat printr-o variabilă de mediu.
const GEO_MAX_POINTS = 200;   // plafon per cerere: o listă de curse nu trebuie să devină o rafală
app.post('/api/geocode/reverse', requireAuth, async (req, res) => {
  if (!geocode) return res.json({ labels: [], reason: 'geocodare indisponibilă' });
  try {
    let pts = Array.isArray(req.body && req.body.points) ? req.body.points : [];
    pts = pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).slice(0, GEO_MAX_POINTS);
    if (!pts.length) return res.json({ labels: [] });
    const coords = pts.map(p => ({ lat: Number(p[0]), lng: Number(p[1]) }));
    // `detail:'full'` → adresa completă (stradă nr, cartier, localitate, comună, județ), pentru fișa
    // vehiculului. Implicit rămâne forma scurtă, potrivită într-un tabel de raport.
    const detail = (req.body && req.body.detail === 'full') ? 'full' : undefined;
    // `warm` are buget de timp: ce nu apucă rămâne null, iar clientul reîncearcă la următoarea randare.
    // Preferăm un răspuns parțial rapid unei așteptări lungi cu tot.
    await geocode.warm(coords, { maxUnique: GEO_MAX_POINTS, budgetMs: Number(req.body && req.body.budgetMs) || undefined });
    res.json({ labels: coords.map(c => { const v = geocode.peek(c.lat, c.lng, detail); return v === undefined ? null : v; }) });
  } catch (e) { res.json({ labels: [], error: e.message }); }
});

// ─── Map-matching: lipește traseul GPS de drumuri (OSRM) ───
// FĂRĂ implicit public. `router.project-osrm.org` e serverul de DEMONSTRAȚIE al FOSSGIS, pe care scrie
// explicit că nu e pentru uz în producție — iar noi îl loveam la fiecare deschidere de traseu, din toate
// conturile. Acum, fără OSRM_URL, map-matching-ul e pur și simplu OPRIT: traseul rămâne cel brut (degradarea
// era deja gestionată în interfață), în loc să folosim tăcut infrastructura altcuiva contra regulilor ei.
const OSRM_URL = (process.env.OSRM_URL || '').replace(/\/+$/, '');
const OSRM_ON = !!OSRM_URL;
if (!OSRM_ON) console.log('[OSRM] OSRM_URL nesetat → map-matching OPRIT (traseele rămân brute). Setează OSRM_URL ca să-l activezi.');
// Serializare + buget total: până acum un traseu lung însemna 16 bucăți × 9 s, secvențial, fără nicio
// limită globală — până la ~2,5 minute de cerere Express ținută deschisă.
const OSRM_BUDGET_MS = parseInt(process.env.OSRM_BUDGET_MS) || 20000;
let _osrmChain = Promise.resolve();
function _osrmSlot() {
  const p = _osrmChain.then(() => new Promise(r => setTimeout(r, parseInt(process.env.OSRM_MIN_INTERVAL_MS) || 100)));
  _osrmChain = p.catch(() => {});
  return p;
}
const _matchCache = new Map(); // key cursă -> geometrie lipită [[lat,lng]...]
function _matchKey(pts) {
  let s = pts.length + ':'; const step = Math.max(1, Math.floor(pts.length / 8));
  for (let i = 0; i < pts.length; i += step) s += pts[i][0].toFixed(4) + ',' + pts[i][1].toFixed(4) + ';';
  return s;
}
async function _osrmMatchChunk(coords) { // coords [[lng,lat]...] (≤100) -> [[lat,lng]...] sau null
  const coordStr = coords.map(c => c[0].toFixed(6) + ',' + c[1].toFixed(6)).join(';');
  const rad = coords.map(() => '40').join(';');
  const url = OSRM_URL + '/match/v1/driving/' + coordStr + '?geometries=geojson&overview=full&tidy=true&radiuses=' + rad;
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'RA-Tracks/1.0' } });
    clearTimeout(to);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.code !== 'Ok' || !Array.isArray(d.matchings)) return null;
    const out = [];
    d.matchings.forEach(m => { const g = m.geometry && m.geometry.coordinates; if (g) g.forEach(c => out.push([c[1], c[0]])); });
    return out.length ? out : null;
  } catch (e) { clearTimeout(to); return null; }
}
async function osrmMatch(pts) { // pts [[lat,lng]...] -> [[lat,lng]...] sau null (chunk ≤95, concat)
  if (!OSRM_ON || !pts || pts.length < 2) return null;
  let coords = pts.map(p => [p[1], p[0]]);                       // [lng,lat]
  if (coords.length > 1500) { const st = Math.ceil(coords.length / 1500); coords = coords.filter((_, i) => i % st === 0); }
  const CHUNK = 95, OVERLAP = 1; let out = [];
  const deadline = Date.now() + OSRM_BUDGET_MS;
  for (let start = 0; start < coords.length - 1; start += (CHUNK - OVERLAP)) {
    if (Date.now() > deadline) break;                            // răspundem cu ce avem, nu ținem cererea deschisă
    const slice = coords.slice(start, start + CHUNK);
    if (slice.length < 2) break;
    await _osrmSlot();
    const m = await _osrmMatchChunk(slice);
    if (m) { if (out.length) m.shift(); out = out.concat(m); }   // evită dublarea punctului de overlap
  }
  return out.length > 1 ? out : null;
}
// Alinierea traseului pe drumuri. DOUĂ metode, în ordinea calității:
//   1. OSRM (dacă OSRM_URL e setat) — map-matching adevărat: reconstruiește drumul DINTRE puncte, ține cont
//      de topologie (sensuri, pasaje, intersecții).
//   2. Proiecția pe cel mai apropiat drum din OpenStreetMap, folosind datele pe care modulul de limite de
//      viteză le descarcă oricum de la Overpass, cu același cache de 7 zile. Nu e map-matching: mută punctele
//      existente pe carosabil, dar nu umple golurile dintre ele. Gratuită și fără infrastructură proprie.
// Răspunsul spune care metodă a răspuns (`source`), ca interfața să nu promită mai mult decât s-a făcut.
app.post('/api/match', requireAuth, async (req, res) => {
  try {
    let pts = Array.isArray(req.body && req.body.points) ? req.body.points : [];
    pts = pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
    if (pts.length < 2) return res.json({ matched: null });
    const key = (OSRM_ON ? 'r:' : 'o:') + _matchKey(pts);
    if (_matchCache.has(key)) { const c = _matchCache.get(key); return res.json({ matched: c.pts, source: c.src, attribution: c.attr || undefined }); }

    // `auto:true` = apel automat la deschiderea unui traseu. Acolo folosim DOAR OSRM: metoda gratuită trece
    // prin Overpass, iar o interogare la fiecare deschidere de traseu ar fi exact utilizarea pe care politica
    // lor o interzice. Pentru ea există butonul „Aliniază pe drumuri", care apelează fără flagul ăsta.
    const auto = !!(req.body && req.body.auto);
    let matched = null, source = null, attribution;
    if (OSRM_ON) { matched = await osrmMatch(pts); if (matched) source = 'osrm'; }
    if (auto && !matched) return res.json({ matched: null, reason: OSRM_ON ? 'fara_potrivire' : 'osrm_neconfigurat' });
    if (!matched && roadlimits && roadlimits.snapPoints) {
      try {
        const sn = await roadlimits.snapPoints(pts);
        if (sn) { matched = sn.points; source = 'osm'; attribution = sn.attribution; }
      } catch (e) {
        // Traseu prea întins pentru o singură interogare Overpass — e o limită reală, nu o defecțiune.
        if (e && e.code === 'AREA') return res.json({ matched: null, reason: 'zona_prea_mare' });
        // Serviciul OSM a picat (504 / timeout). NU e același lucru cu „nu există drumuri pe acolo", iar
        // instanțele publice Overpass chiar cad des — dacă spunem greșit, operatorul caută vina în date.
        return res.json({ matched: null, reason: 'osm_indisponibil' });
      }
    }
    if (matched) {
      if (_matchCache.size > 300) _matchCache.clear();
      _matchCache.set(key, { pts: matched, src: source, attr: attribution });
    }
    res.json({ matched: matched || null, source: source || undefined, attribution: attribution, reason: matched ? undefined : 'fara_drumuri' });
  } catch (e) { res.json({ matched: null }); }
});

// Limite de viteză reale (OpenStreetMap, via Overpass) pentru punctele unui traseu — la cerere, în replay.
// Body: { points: [[lat,lng], …] }. Întoarce { limits:[km/h|null per punct], attribution, ways }. Date ODbL → atribuire OBLIGATORIE.
app.post('/api/road-limits', requireAuth, async (req, res) => {
  try {
    if (!roadlimits) return res.status(503).json({ error: 'Modul limite indisponibil' });
    let pts = Array.isArray(req.body && req.body.points) ? req.body.points : [];
    pts = pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(p => [+p[0], +p[1]]);
    if (pts.length < 2) return res.json({ limits: pts.map(() => null), attribution: roadlimits.ATTRIBUTION, ways: 0 });
    const r = await roadlimits.limitsForPoints(pts);
    res.json(r);
  } catch (e) {
    res.status(e && e.code === 'AREA' ? 413 : 502).json({ error: (e && e.message) || 'Eroare limite OSM' });
  }
});

// API: Conexiuni active
app.get('/api/connections', requireAuth, requireFleet, withScope, (req, res) => {
  // Tenant: super-admin (allowedImeis == null) vede toate conexiunile; restul doar ale vehiculelor proprii.
  // ATENȚIE: excludem câmpul `socket` la serializare — Object are circular references și ar rupe JSON.stringify.
  const safe = (info) => ({ address: info.address, connectedAt: info.connectedAt });
  if (req.allowedImeis == null) {
    const out = {};
    for (const [imei, info] of activeConnections) out[imei] = safe(info);
    return res.json(out);
  }
  const out = {};
  for (const [imei, info] of activeConnections) { if (req.allowedImeis.has(imei)) out[imei] = safe(info); }
  res.json(out);
});

// API: Istoric traseu pentru un dispozitiv
app.get('/api/history/:imei', requireAuth, withScope, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!canAccessImei(req, imei)) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    // Plafon fereastră anti-OOM la scară (2000 vehicule): max 92 zile/cerere. (getDeviceHistory aplică și LIMIT dur.)
    const spanMs = new Date(to).getTime() - new Date(from).getTime();
    if (!Number.isFinite(spanMs) || spanMs < 0) return res.status(400).json({ error: 'Interval invalid' });
    if (spanMs > 92 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Interval prea mare (max 92 de zile per cerere). Restrânge perioada.' });
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
    // Sumar traseu: distanță + combustibil din reports.fuelStats (identic cu „Statistici consum"),
    // timp în deplasare/staționar calculat direct din poziții (IDLE_SPEED = 3 km/h, ca în reports.js).
    let distanceKm = null, fuelLiters = null, fuelEstimated = false;
    try {
      const fs = await reports.fuelStats(db, [imei], from, to, {});
      const pv = fs && fs.perVehicle && fs.perVehicle[0];
      if (pv) { distanceKm = pv.km; fuelLiters = pv.liters; fuelEstimated = !!pv.estimated; }
    } catch (e) { /* sumarul de combustibil e best-effort, nu blochează traseul */ }
    let movingSec = 0, stationarySec = 0;
    for (let i = 1; i < history.length; i++) {
      const dt = (new Date(history[i].timestamp).getTime() - new Date(history[i - 1].timestamp).getTime()) / 1000;
      if (!(dt > 0) || dt > 3600) continue; // ignoră salturile mari (offline)
      if ((Number(history[i].speed) || 0) > 3) movingSec += dt; else stationarySec += dt;
    }
    res.json({
      points: history,
      device: dev ? { speed_limit: limit, name: dev.name, plate: dev.plate } : null,
      summary: {
        overspeedCount: oc, overspeedDurationSec: Math.round(oDur), maxOverKmh: oMax,
        distanceKm, movingSec: Math.round(movingSec), stationarySec: Math.round(stationarySec),
        fuelLiters, fuelEstimated
      }
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
    invalidateLiveEnrichCache(); // /api/live ia identitatea din acest cache → invalidează ca să nu servească nr. vechi
    // Inventar echipament GPS (model tracker + cartelă SIM) — se completează la instalare.
    if (req.body.gps_model !== undefined || req.body.sim_number !== undefined) {
      await db.setDeviceGpsInfo(imei, req.body.gps_model, req.body.sim_number);
    }
    // Sursa stării de contact (auto = IO 239 / din1 = DIN1) — DOAR super-admin (nu admin/user companie).
    if (req.body.ignition_source !== undefined && req.isSuper) {
      await db.setDeviceIgnitionSource(imei, req.body.ignition_source);
      refreshDin1Set(); // actualizează cache-ul de la ingest imediat
    }
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
    // Câmpuri rezervate SUPER-ADMIN (admin/user companie nu le pot seta) — eliminate din body dacă nu e super.
    if (!req.isSuper) { delete b.ignition_source; delete b.show_transport; }
    if (b.show_transport !== undefined) b.show_transport = (b.show_transport === true || b.show_transport === 'true'); // normalizează boolean
    // „Km la bord" (index manual pt. mașini fără CAN): reținem valoarea veche ÎNAINTE de update, ca să (re)facem snapshot-ul
    // contorului GPS DOAR când operatorul chiar schimbă valoarea — altfel orice resalvare a fișei ar rebaza contorul și
    // ar pierde km-ii deja parcurși de la montare. Fișa trimite mereu câmpul, deci comparăm explicit vechi vs nou.
    let odoPrev;
    if (Object.prototype.hasOwnProperty.call(b, 'odo_base_km')) { try { const c = await db.pool.query('SELECT odo_base_km FROM devices WHERE imei = $1', [imei]); odoPrev = c.rows[0] ? c.rows[0].odo_base_km : null; } catch (e) { odoPrev = undefined; } }
    await db.updateVehicleDetails(imei, b);
    if (Object.prototype.hasOwnProperty.call(b, 'odo_base_km') && odoPrev !== undefined) {
      try {
        const newVal = (b.odo_base_km === '' || b.odo_base_km == null) ? null : Math.round(Number(b.odo_base_km));
        const prevVal = (odoPrev == null || odoPrev === '') ? null : Math.round(Number(odoPrev));
        if (newVal !== prevVal) { // valoarea s-a schimbat → (re)snapshot al contorului GPS (total_odometer, IO 16, metri) + momentul; la ștergere, curățăm
          if (newVal == null) {
            await db.pool.query('UPDATE devices SET odo_base_dev_m = NULL, odo_base_at = NULL WHERE imei = $1', [imei]);
          } else {
            const r = await db.pool.query("SELECT io_data FROM positions WHERE imei = $1 AND io_data->>'total_odometer' IS NOT NULL ORDER BY timestamp DESC LIMIT 1", [imei]);
            const pio = (r.rows[0] && r.rows[0].io_data) || {};
            const devM = (typeof pio.total_odometer === 'number') ? pio.total_odometer : null;
            await db.pool.query('UPDATE devices SET odo_base_dev_m = $2, odo_base_at = NOW() WHERE imei = $1', [imei, devM]);
          }
        }
      } catch (e) { /* nu bloca salvarea fișei dacă snapshot-ul eșuează */ }
    }
    if (b.ignition_source !== undefined) refreshDin1Set(); // override „contact din DIN1" → actualizează cache ingest
    invalidateLiveEnrichCache(); // fișa poate conține fuel_price/cost_per_ton_km/greutăți din enrichment
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
    // Momente de referință pentru „în staționare de" / „motor pornit/oprit de".
    // FERESTRE SEPARATE (intenționat):
    //  • last_moved_at (de când nu s-a mai deplasat) — fereastră LUNGĂ (STAT_DAYS, implicit 180z) ca să
    //    arate durata REALĂ a staționării chiar dacă vehiculul stă de luni de zile.
    //  • ignition_on_at/off_at (sesiunea curentă a contactului) — fereastră SCURTĂ (IGN_DAYS, implicit 30z)
    //    ca „motor pornit/oprit de" să reflecte sesiunea recentă, nu o tranziție veche → fără valori absurde.
    const STAT_DAYS = Math.min(Math.max(parseInt(process.env.STAT_LOOKBACK_DAYS) || 180, 1), 730);
    const IGN_DAYS = Math.min(Math.max(parseInt(process.env.IGN_LOOKBACK_DAYS) || 30, 1), STAT_DAYS);
    try {
      const sd = await db.pool.query(
        "SELECT MAX(CASE WHEN speed > 3 THEN timestamp END) AS last_moved_at, " +
        "MAX(CASE WHEN (io_data->>'ignition') IN ('1','true') AND timestamp > NOW() - INTERVAL '" + IGN_DAYS + " days' THEN timestamp END) AS ignition_on_at, " +
        "MAX(CASE WHEN (io_data->>'ignition') IN ('0','false') AND timestamp > NOW() - INTERVAL '" + IGN_DAYS + " days' THEN timestamp END) AS ignition_off_at " +
        "FROM positions WHERE imei = $1 AND timestamp > NOW() - INTERVAL '" + STAT_DAYS + " days'",
        [req.params.imei]
      );
      if (sd.rows && sd.rows[0]) { device.last_moved_at = sd.rows[0].last_moved_at; device.ignition_on_at = sd.rows[0].ignition_on_at; device.ignition_off_at = sd.rows[0].ignition_off_at; }
    } catch (e) { /* fără durate dacă interogarea eșuează */ }
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
    invalidateLiveEnrichCache(); // truck config s-a schimbat → reîncarcă enrichment-ul live
    auditReq(req, 'update', 'truck-config', req.params.imei);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mută un vehicul într-o grupă (sau îl scoate, cu group_id null) — folosit din ecranul „Grupe".
// Separat de /assign fiindcă acela scrie ȘI driver_id: mutarea între grupe ar rămâne fără șofer.
app.put('/api/devices/:imei/group', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!canAccessImei(req, req.params.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const gid = (req.body.group_id === null || req.body.group_id === '' || req.body.group_id === undefined)
      ? null : parseInt(req.body.group_id);
    if (gid !== null) {
      if (!Number.isFinite(gid)) return res.status(400).json({ error: 'Grupă invalidă' });
      // Grupa trebuie să fie a companiei celui care cere — altfel s-ar putea muta vehicule în grupa altcuiva.
      if (!(await ownsRow(req, 'device_groups', gid))) return res.status(403).json({ error: 'Acces interzis' });
    }
    await db.setDeviceGroup(req.params.imei, gid);
    invalidateAccessCache(); // grupa dă acces → cine vede ce se schimbă pe loc
    auditReq(req, 'assign', 'device', req.params.imei, { group_id: gid });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    invalidateLiveEnrichCache(); // calibrarea apare în enrichment-ul /api/live
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
    if (b.railway_volume_gb !== undefined) { const n = parseFloat(b.railway_volume_gb); if (Number.isFinite(n) && n > 0 && n <= 4096) await db.setSetting('railway_volume_gb', String(n)); } // plafon volum Railway pt. panoul de capacitate DB
    if (b.anthropic_monthly_budget !== undefined) { const n = parseFloat(b.anthropic_monthly_budget); if (Number.isFinite(n) && n >= 0 && n <= 1000000) await db.setSetting('anthropic_monthly_budget', String(n)); } // buget lunar Anthropic (USD) pt. „disponibil = buget − cheltuit"
    if (b.anthropic_credit_usd !== undefined) { const n = parseFloat(b.anthropic_credit_usd); if (Number.isFinite(n) && n >= 0 && n <= 1000000) await db.setSetting('anthropic_credit_usd', String(n)); } // sold credite Anthropic la data baseline (USD)
    if (b.anthropic_credit_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(b.anthropic_credit_date))) await db.setSetting('anthropic_credit_date', String(b.anthropic_credit_date)); // data la care soldul de credite era cel de mai sus
    if (b.invoice_issuer !== undefined && b.invoice_issuer && typeof b.invoice_issuer === 'object') {
      const i = b.invoice_issuer; const S = (v, n) => String(v == null ? '' : v).slice(0, n);
      const _vr = parseFloat(i.vat_rate); const vatRate = (Number.isFinite(_vr) && _vr >= 0 && _vr <= 100) ? _vr : 19;
      const clean = { name: S(i.name, 160), cui: S(i.cui, 40), reg_com: S(i.reg_com, 40), address: S(i.address, 255), city: S(i.city, 80), county: S(i.county, 12), iban: S(i.iban, 40), bank: S(i.bank, 80), email: S(i.email, 160), phone: S(i.phone, 40), vat_rate: vatRate, vat_payer: (i.vat_payer !== false && i.vat_payer !== 'false') };
      await db.setSetting('invoice_issuer', JSON.stringify(clean));
    }
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
    // Total vehicule = flota ÎNREGISTRATĂ (non-arhivată) din scope, NU doar cele care transmit live.
    // Altfel un vehicul offline (ex. nu a transmis azi) dispărea din dashboard → totul pe 0. Acum apare ca „oprit".
    let scopedSize;
    try {
      const _scopeCompany = req.isSuper ? (req.filterCompanyId || null) : req.companyId;
      let regDevices = await db.getDevices(_scopeCompany);
      regDevices = regDevices.filter(d => d.status !== 'archived' && canAccessImei(req, d.imei));
      scopedSize = regDevices.length;
    } catch (e) {
      scopedSize = Array.from(livePositions.keys()).filter(i => canAccessImei(req, i)).length; // fallback
    }

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

    // Config consum per vehicul (o singură interogare) — pentru ESTIMARE la cele fără senzor fiabil (ex. Logan, CAN plat).
    let _consumCfg = {};
    try { (await db.pool.query('SELECT imei, vehicle_type, consumption_road, consumption_city, consumption_idle FROM devices')).rows.forEach(d => { _consumCfg[d.imei] = d; }); } catch (e) {}

    for (const [imei, data] of livePositions) {
      if (!canAccessImei(req, imei)) continue;
      const isOnline = data.timestamp && (now - new Date(data.timestamp)) < 3900000; // 65 min
      const _io = data.io || data.io_data || {};
      const hasIgnition = _io.ignition === 1 || _io.ignition === true;
      // Histerezis: crawl în trafic (viteză ~0 dar s-a mișcat recent + contact pornit) → tot „în mișcare", nu „staționat".
      const _movedRecently = data.moved_at && (now - data.moved_at) < MOVE_MEMORY_MS;
      const isMoving = isOnline && ((data.speed || 0) > 3 || (_movedRecently && hasIgnition));
      const isStationat = isOnline && !isMoving && hasIgnition; // motor pornit, dar nemișcat (parcat cu contactul pornit)
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

            // Engine time = contact pornit SAU în mișcare (mișcarea implică motor pornit) — robust la ignition nefiabil.
            const prevIo = prev.io_data || {};
            if (prevIo.ignition === 1 || io.ignition === 1 || (row.speed || 0) > 3) {
              const dt = (new Date(row.timestamp) - new Date(prev.timestamp)) / 1000;
              if (dt > 0 && dt < 3600) engineTime += dt;
            }
          }

          if ((row.speed || 0) > maxSpeed) maxSpeed = row.speed;

          // Fuel tracking — câmpul REZOLVAT (orice senzor), nu doar CAN
          const fl = (typeof io.fuel_level_liters === 'number') ? io.fuel_level_liters : io.can_fuel_level_liters;
          if (typeof fl === 'number' && fl > 0) {
            if (firstFuelLevel === null) firstFuelLevel = fl;
            lastFuelLevel = fl;
          }
        }

        // Consum = (primul − ultimul nivel) + alimentări, din câmpul REZOLVAT (fuel_level_liters), ca în rapoarte.
        // Înainte folosea doar can_fuel_level_liters + prag per-segment 0.5L → rata senzorii non-CAN și consumul mic gradual.
        let deviceFuel = 0;
        {
          // Consum din nivel = SUMA scăderilor reale (≥0.4 L/pas, <40 L/pas); creșterile (alimentări/zgomot) sunt ignorate.
          // Mai robust decât (start−final)+alimentări: nu se strică pe zilele cu alimentare și prinde scăderile graduale.
          let dropSum = 0, prevFL = null;
          for (const row of history) {
            const rio = row.io_data || {};
            const fl = (typeof rio.fuel_level_liters === 'number') ? rio.fuel_level_liters : rio.can_fuel_level_liters;
            if (typeof fl === 'number' && fl > 0) {
              if (prevFL !== null) { const d = prevFL - fl; if (d >= 0.4 && d < 40) dropSum += d; }
              prevFL = fl;
            }
          }
          if (dropSum > 0 && km > 1) { const p = dropSum / km * 100; if (p >= 1.5 && p <= 200) deviceFuel = Math.round(dropSum * 10) / 10; }
        }
        // Contor cumulativ CAN (consum EXACT, merge și pe drumuri scurte) — preferat dacă vehiculul îl raportează plauzibil.
        // (La vehiculele cu nivel grosier/contor stricat, ex. unele VW, nu se aplică → rămâne estimarea.)
        {
          let cumulSum = 0, prevCum = null;
          for (const row of history) {
            const rio = row.io_data || {};
            const cum = (typeof rio.can_fuel_consumed === 'number') ? rio.can_fuel_consumed : (typeof rio.can_fuel_consumed_counted === 'number' ? rio.can_fuel_consumed_counted : (typeof rio.can_engine_total_fuel_used === 'number' ? rio.can_engine_total_fuel_used : null));
            if (cum != null && cum > 0) { if (prevCum != null) { const dc = cum - prevCum; if (dc > 0 && dc < 100) cumulSum += dc; } prevCum = cum; }
          }
          if (cumulSum > 0 && km > 0.5) { const p100 = cumulSum / km * 100; if (p100 >= 1 && p100 <= 200) deviceFuel = Math.round(cumulSum * 10) / 10; }
        }

        km = Math.round(km * 100) / 100;
        deviceFuel = Math.round(deviceFuel * 10) / 10;
        // Fallback ESTIMARE pentru vehicule fără senzor fiabil (au rulat dar consum 0, ex. Logan cu CAN plat): km × consum(config/tip).
        let fuelEstimated = false;
        if (deviceFuel <= 0 && km > 0.2) {
          const dc = _consumCfg[imei] || {};
          const vt = String(dc.vehicle_type || '').toLowerCase();
          const cDef = /truck|camion|tir|lorry|tractor|autotractor/.test(vt) ? 30 : /bus|autobuz|autocar/.test(vt) ? 28 : /van|dub|autoutil|furgon|utilitar/.test(vt) ? 12 : 9;
          const cRoad = parseFloat(dc.consumption_road) || parseFloat(dc.consumption_city) || cDef;
          const est = km * cRoad / 100;
          if (est > 0.05) { deviceFuel = Math.round(est * 10) / 10; fuelEstimated = true; }
        }
        totalKm += km;
        totalFuel += deviceFuel;
        totalEngineTime += engineTime;

        deviceStats.push({
          imei,
          name: data.name || imei,
          plate: data.plate || '',
          km,
          fuel: deviceFuel,
          fuelEstimated,
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

          // Motor pornit = contact pornit SAU în mișcare (mișcarea implică motor pornit). Robust la vehicule
          // unde io.ignition din istoric nu e fiabil (ex. Caddy) → orele de funcționare nu mai ies 0 când a rulat.
          if (prevIgnition || ignitionOn || isMoving) {
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

    // Fallback ESTIMARE pentru vehicule FĂRĂ senzor de combustibil fiabil (ex. Dacia Logan): km × consum (config) + ralanti.
    // Cazuri: (a) fără senzor → fuelConsumed=null; (b) senzor CAN care raportează un nivel PLAT/nesigur pe o cursă reală →
    // consumed iese 0 deși mașina a mers zeci de km (imposibil). În ambele → estimăm onest (marcat fuelEstimated), altfel
    // „carburant/consum" apărea 0.0 / — pe traseu chiar dacă vehiculul a rulat.
    let fuelEstimated = false;
    if ((fuelConsumed === null || (fuelConsumed === 0 && globalTotalKm > 2)) && (globalTotalKm > 0.2 || globalEngineIdleTime > 60)) {
      try {
        const dc = (await db.pool.query('SELECT vehicle_type, consumption_road, consumption_city, consumption_idle FROM devices WHERE imei = $1', [imei])).rows[0] || {};
        const vt = String(dc.vehicle_type || '').toLowerCase();
        const cDef = /truck|camion|tir|lorry|tractor|autotractor/.test(vt) ? 30 : /bus|autobuz|autocar/.test(vt) ? 28 : /van|dub|autoutil|furgon|utilitar/.test(vt) ? 12 : 9;
        const cRoad = parseFloat(dc.consumption_road) || parseFloat(dc.consumption_city) || cDef; // L/100km
        const cIdle = parseFloat(dc.consumption_idle) || 1.0;                                     // L/h ralanti
        const est = (globalTotalKm * cRoad / 100) + ((globalEngineIdleTime || 0) / 3600 * cIdle);
        if (est > 0.05) { fuelConsumed = Math.round(est * 10) / 10; fuelEstimated = true; }
      } catch (e) {}
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
      fuelEstimated,
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

    // Răspuns PLAT (consumatorii web + mobil citesc câmpurile direct: s.totalKm, s.fuelConsumed…) + `summary` păstrat pt. compat.
    res.json({ imei, from, to, routes, summary, ...summary });
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
  try {
    if (req.body && req.body.photo_b64 && String(req.body.photo_b64).length > 1.5 * 1024 * 1024) return res.status(413).json({ error: 'Poza e prea mare' });
    // super-admin poate adăuga șoferul direct într-o companie aleasă; company_admin = STRICT compania proprie (ignoră body.company_id)
    let targetCompany = req.companyId;
    if (req.isSuper && req.body && req.body.company_id != null && req.body.company_id !== '') {
      targetCompany = parseInt(req.body.company_id);
      if (!Number.isFinite(targetCompany) || !(await db.getCompanyById(targetCompany))) return res.status(400).json({ error: 'Companie invalidă' });
    }
    // Categoriile vin de la client → NU le credem pe cuvânt: păstrăm doar codurile care există
    // pe un permis, normalizate și în ordinea de pe act.
    req.body.license_categories = licenseCats.format(req.body.license_categories);
    const d = await db.createDriver(req.body, targetCompany);
    auditReq(req, 'create', 'driver', d.id, { name: req.body.name, company_id: targetCompany });
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/drivers/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (req.body && req.body.photo_b64 && String(req.body.photo_b64).length > 1.5 * 1024 * 1024) return res.status(413).json({ error: 'Poza e prea mare' });
    if (!(await ownsRow(req, 'drivers', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    req.body.license_categories = licenseCats.format(req.body.license_categories);
    await db.updateDriver(req.params.id, req.body); auditReq(req, 'update', 'driver', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export brandat: „Situația șoferilor" (Excel/PDF) ───────────────────────────────────────────
// Trece prin sendReport → nume „RA-Tracks - Raport ... - data" + logo, ca ORICE document descărcat
// din aplicație (regula din CLAUDE.md). Nu e o cale paralelă de export.
function _drvLicRow(d, vehByDriver) {
  const cats = licenseCats.parse(d.license_categories);
  const cls = licenseCats.classify(cats);
  const n0 = new Date(); const ref = new Date(n0.getFullYear(), n0.getMonth(), n0.getDate());
  let exp = '—', stare;
  if (d.license_expiry) {
    // Comparăm pe zile calendaristice: un permis care expiră azi NU e „expirat".
    const e = new Date(d.license_expiry);
    const days = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())
      - Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate())) / 86400000);
    exp = e.toLocaleDateString('ro-RO');
    stare = days < 0 ? 'Expirat de ' + (-days) + ' zile' : (days === 0 ? 'Expiră azi' : (days <= 30 ? 'Expiră în ' + days + ' zile' : 'Valabil'));
    // „Fără dată de expirare" nu încape în coloana din PDF și se tăia cu „…". Lângă coloana
    // „Expiră", care arată „—", forma scurtă spune exact același lucru.
  } else { stare = (d.license_number || cats.length) ? 'Fără dată' : 'Fără permis în fișă'; }
  const vh = (vehByDriver[d.id] || []).slice().sort((a, b) => a.localeCompare(b));
  return { cls: cls.key,
    row: [d.name || '—', cls.short, cats.length ? cats.join(', ') : '—', d.license_number || '—',
          exp, stare, vh.length ? vh.join(', ') : '—', d.phone || '—', d.email || '—'] };
}
async function _driversExportData(req) {
  const companyId = req.isSuper ? null : req.companyId;
  let drivers = await db.getDrivers(companyId);
  // Șoferii companiei demo nu intră în situația unei flote reale (aceeași regulă ca la vehicule).
  if (req.companyId !== demoCompanyId) drivers = drivers.filter(d => d.company_id !== demoCompanyId);
  // Vehiculele fiecărui șofer — doar cele pe care cel care cere raportul are voie să le vadă.
  const vehByDriver = {};
  try {
    let devs = await db.getDevices();
    if (req.allowedImeis != null) devs = devs.filter(d => req.allowedImeis.has(d.imei));
    if (req.companyId !== demoCompanyId) devs = devs.filter(d => !DEMO_SET.has(d.imei));
    for (const d of devs) {
      if (d.driver_id == null || d.status === 'archived') continue;
      (vehByDriver[d.driver_id] = vehByDriver[d.driver_id] || []).push(d.plate || d.name || d.imei);
    }
  } catch (e) { /* fără vehicule, situația șoferilor rămâne validă */ }
  const RANK = { pro: 0, basic: 1, none: 2 };
  const items = drivers.map(d => Object.assign(_drvLicRow(d, vehByDriver), { co: d.company_name || '', nm: d.name || '' }));
  items.sort((a, b) => (RANK[a.cls] - RANK[b.cls]) || a.nm.localeCompare(b.nm));
  return items;
}
// Aceeași poartă ca lista de șoferi: cine vede lista poate scoate și documentul. `withScope` face
// și ce face `withCompany`, plus IMEI-urile permise — nu le punem pe amândouă.
// CSV brut — aceleași date, fără antet și logo. Pentru cine vrea să le prelucreze mai departe.
// ─── CSV șoferi: ACELEAȘI coloane la ieșire și la intrare ───────────────────────────────────────
// Ca la vehicule: CSV-ul e formatul de lucru (scoți → editezi → reimporți), iar Excel/PDF sunt
// documentele de citit. De aceea aici NU apar câmpurile calculate (încadrare, stare, vehicule):
// nu ai ce face cu ele la import, iar un fișier care nu se poate întoarce nu e un CSV de lucru.
const DRIVER_CSV_COLS = [
  { h: 'nume', f: 'name' }, { h: 'telefon', f: 'phone' }, { h: 'email', f: 'email' },
  { h: 'nr_permis', f: 'license_number' }, { h: 'expirare_permis', f: 'license_expiry' },
  { h: 'categorii', f: 'license_categories' }
];
// Acceptă 2026-09-12, 12.09.2026 și 12/09/2026. Orice altceva → null (rândul nu e respins pentru atât).
function _parseDateLoose(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return null;
}
function _driverCsvCell(d, f) {
  if (f === 'license_expiry') return d.license_expiry ? new Date(d.license_expiry).toISOString().slice(0, 10) : '';
  return d[f];
}
app.get('/api/drivers/export.csv', requireAuth, withScope, async (req, res) => {
  try {
    let drivers = await db.getDrivers(req.isSuper ? null : req.companyId);
    if (req.companyId !== demoCompanyId) drivers = drivers.filter(d => d.company_id !== demoCompanyId);
    const header = DRIVER_CSV_COLS.map(c => c.h).join(',');
    const lines = drivers.map(d => DRIVER_CSV_COLS.map(c => csvCell(_driverCsvCell(d, c.f))).join(','));
    const csv = '﻿' + [header, ...lines].join('\r\n'); // BOM → Excel deschide UTF-8 cu diacritice
    auditReq(req, 'export', 'drivers', null, { count: drivers.length, format: 'csv' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="soferi.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/drivers/template.csv', requireAuth, (req, res) => {
  const ex = { nume: 'Popescu Ion', telefon: '0722145890', email: 'ion.popescu@firma.ro', nr_permis: 'B 1938472', expirare_permis: '2028-09-12', categorii: 'B,C,CE' };
  const csv = '﻿' + [DRIVER_CSV_COLS.map(c => c.h).join(','), DRIVER_CSV_COLS.map(c => csvCell(ex[c.h])).join(',')].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template_soferi.csv"');
  res.send(csv);
});
// Import șoferi. Spre deosebire de vehicule, aici NU există o cheie naturală ca IMEI-ul, așa că
// potrivim în ordine: numărul de permis → email → nume. Dacă numele nimerește în două persoane,
// rândul e SĂRIT cu explicație — mai bine îl rezolvi tu decât să suprascriem omul greșit.
app.post('/api/drivers/import', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'Niciun rând de importat' });
    if (rows.length > 2000) return res.status(400).json({ error: 'Prea multe rânduri (max 2000)' });
    // Super-adminul n-are companie proprie → trebuie să spună UNDE intră șoferii, altfel ar rămâne orfani.
    let target = req.companyId;
    if (req.isSuper) {
      target = parseInt(req.body.company_id);
      if (!target || !(await db.getCompanyById(target))) return res.status(400).json({ error: 'Alege întâi compania din filtrul de sus, apoi importă.' });
    }
    const existing = await db.getDrivers(target);
    const byLic = new Map(), byMail = new Map(), byName = new Map();
    for (const d of existing) {
      const l = (d.license_number || '').trim().toUpperCase(); if (l) byLic.set(l, d);
      const m = (d.email || '').trim().toLowerCase(); if (m) byMail.set(m, d);
      const n = (d.name || '').trim().toLowerCase();
      if (n) byName.set(n, byName.has(n) ? 'AMBIGUU' : d);
    }
    let created = 0, updated = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {}, line = i + 2;
      const name = String(row.nume || '').trim();
      if (!name) { errors.push({ line, error: 'Lipsește numele' }); continue; }
      const data = {
        name,
        phone: String(row.telefon || '').trim() || null,
        email: String(row.email || '').trim() || null,
        license_number: String(row.nr_permis || '').trim() || null,
        license_expiry: _parseDateLoose(row.expirare_permis),
        license_categories: licenseCats.format(row.categorii),
        photo_b64: null
      };
      try {
        const lic = (data.license_number || '').toUpperCase();
        const mail = (data.email || '').toLowerCase();
        let match = (lic && byLic.get(lic)) || (mail && byMail.get(mail)) || byName.get(name.toLowerCase()) || null;
        if (match === 'AMBIGUU') { errors.push({ line, error: 'Există doi șoferi cu numele „' + name + '" — completează numărul de permis ca să știm care e' }); continue; }
        if (match) {
          // Poza rămâne a lui: CSV-ul n-o conține, iar updateDriver ar șterge-o cu null.
          data.photo_b64 = match.photo_b64 || null;
          await db.updateDriver(match.id, data);
          updated++;
        } else {
          const nd = await db.createDriver(data, target);
          if (lic) byLic.set(lic, nd); if (mail) byMail.set(mail, nd);
          byName.set(name.toLowerCase(), byName.has(name.toLowerCase()) ? 'AMBIGUU' : nd);
          created++;
        }
      } catch (e) { errors.push({ line, error: e.message }); }
    }
    auditReq(req, 'import', 'driver', null, { created, updated, errors: errors.length, company_id: target });
    res.json({ created, updated, errors: errors.slice(0, 50) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/drivers/export', requireAuth, withScope, async (req, res) => {
  try {
    if (!reportExport) return res.status(503).json({ error: 'Exportul nu e disponibil pe acest server' });
    const items = await _driversExportData(req);
    const fmt = (req.query.format === 'pdf') ? 'pdf' : 'xlsx';
    const nPro = items.filter(x => x.cls === 'pro').length;
    const nBas = items.filter(x => x.cls === 'basic').length;
    const nNone = items.filter(x => x.cls === 'none').length;
    const nExp = items.filter(x => /^Expirat/.test(x.row[5])).length;
    const cols = ['Șofer', 'Încadrare', 'Categorii permis', 'Nr. permis', 'Expiră', 'Stare', 'Vehicul(e)', 'Telefon', 'Email'];
    const rows = items.map(x => x.row);
    if (req.isSuper) { cols.push('Companie'); items.forEach((x, i) => rows[i].push(x.co || '—')); }
    const report = {
      type: 'drivers_licenses',
      label: 'Situația șoferilor',
      periodLabel: 'Generat: ' + new Date().toLocaleString('ro-RO') + ' · ' + items.length + ' șoferi'
        + ' · ' + nPro + ' profesioniști, ' + nBas + ' șoferi, ' + nNone + ' neîncadrați'
        + (nExp ? ' · ' + nExp + ' permise expirate' : ''),
      columns: cols, rows
    };
    auditReq(req, 'export', 'drivers', null, { count: items.length, format: fmt });
    return reportExport.sendReport(res, report, fmt);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    } else if (body.coordinates && Array.isArray(body.coordinates.line) && body.coordinates.line.length) {
      let sLat = 0, sLon = 0, n = 0;
      for (const p of body.coordinates.line) {
        if (Array.isArray(p) && p.length >= 2) { sLat += Number(p[0]); sLon += Number(p[1]); n++; }
      }
      if (n) { lat = sLat / n; lon = sLon / n; }
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
  try { const g = await db.createGeofence(await enrichGeofence(req.body), req.companyId); invalidateReguliCache(); auditReq(req, 'create', 'geofence', g.id, { name: req.body.name }); res.json(g); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/geofences/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'geofences', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.updateGeofence(req.params.id, await enrichGeofence(req.body)); invalidateReguliCache(); auditReq(req, 'update', 'geofence', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geofences/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'geofences', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteGeofence(req.params.id); invalidateReguliCache(); auditReq(req, 'delete', 'geofence', req.params.id); res.json({ ok: true });
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
    // Compania regulii: pentru super-admin vine din formular (compania nu se poate deduce — el n-are una).
    // Înainte se folosea `req.companyId`, care pentru super-admin e NULL: regula ieșea „fără companie", iar
    // motorul o aplica ATUNCI vehiculelor TUTUROR companiilor (vezi evaluateAlerts), fără ca administratorii
    // lor s-o vadă în listă (getAlerts filtrează pe company_id). `null` explicit rămâne posibil, dar acum e
    // o alegere conștientă („toată platforma"), nu un efect secundar.
    let coId = req.companyId;
    if (req.isSuper && Object.prototype.hasOwnProperty.call(req.body, 'company_id')) {
      coId = (req.body.company_id === null || req.body.company_id === '') ? null : Number(req.body.company_id);
      if (coId != null && !Number.isFinite(coId)) return res.status(400).json({ error: 'Companie invalidă' });
    }
    // Vehicul + companie: dacă sunt date amândouă, trebuie să se potrivească — altfel regula n-ar porni
    // niciodată (motorul cere `alert.imei === imei`, iar lista o arată sub compania greșită).
    if (req.body.imei && coId != null) {
      const devCo = await getDeviceCompanyCached(req.body.imei);
      if (devCo != null && Number(devCo) !== Number(coId)) {
        return res.status(400).json({ error: 'Vehiculul nu aparține companiei alese.' });
      }
    }
    const a = await db.createAlert(req.body, coId); invalidateReguliCache();
    auditReq(req, 'create', 'alert', a.id, { type: req.body.type, company_id: coId });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Modificarea unei reguli. Până acum NU exista: ca să schimbi un prag de la 90 la 80 ștergeai regula
// și o făceai din nou. Acceptă și schimbări parțiale — comutatorul din listă trimite doar `enabled`.
app.put('/api/alerts/:id', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'alerts', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    const b = req.body || {};
    if (b.imei && !canAccessImei(req, b.imei)) return res.status(403).json({ error: 'Acces interzis' });
    const patch = {};
    for (const k of ['name', 'type', 'imei', 'condition', 'enabled']) if (b[k] !== undefined) patch[k] = b[k];
    // Doar super-adminul poate muta o regulă în altă companie; pentru ceilalți câmpul e ignorat.
    if (req.isSuper && Object.prototype.hasOwnProperty.call(b, 'company_id')) {
      patch.company_id = (b.company_id === null || b.company_id === '') ? null : Number(b.company_id);
      if (patch.company_id != null && !Number.isFinite(patch.company_id)) return res.status(400).json({ error: 'Companie invalidă' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nimic de modificat' });
    // Vehicul + companie trebuie să se potrivească, ca la creare — altfel regula n-ar porni niciodată.
    // Verificăm valorile FINALE (ce rămâne după modificare), nu doar ce s-a trimis acum.
    const cur = (await db.pool.query('SELECT imei, company_id FROM alerts WHERE id = $1', [parseInt(req.params.id)])).rows[0] || {};
    const fImei = patch.imei !== undefined ? patch.imei : cur.imei;
    const fCo = patch.company_id !== undefined ? patch.company_id : cur.company_id;
    if (fImei && fCo != null) {
      const devCo = await getDeviceCompanyCached(fImei);
      if (devCo != null && Number(devCo) !== Number(fCo)) return res.status(400).json({ error: 'Vehiculul nu aparține companiei alese.' });
    }
    const a = await db.updateAlert(req.params.id, patch);
    invalidateReguliCache();   // motorul de alerte ține regulile în memorie
    auditReq(req, 'update', 'alert', req.params.id, { fields: Object.keys(patch) });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'alerts', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteAlert(req.params.id); invalidateReguliCache(); auditReq(req, 'delete', 'alert', req.params.id); res.json({ ok: true });
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
    // Îmbogățire pt. UI: odometru live + starea de scadență (roșu în listă, sincron cu alertele).
    // _due/_odo/_kmLeft sunt DOAR pt. afișare — updateMaintenance scrie pe coloane explicite, deci se ignoră la PUT.
    const odoMap = {};
    try { for (const d of await db.getDevices()) { const km = _odoFromIo(d.io_data); if (km) odoMap[d.imei] = km; } } catch (e) {}
    // Preavizul companiei decide culoarea din listă, exact ca la alerte — o singură cifră, două locuri.
    const leads = await _leadsByCompany();
    rows = rows.map(m => {
      const odo = odoMap[m.imei] || null;
      const L = leads.of(m.company_id);
      return { ...m, _odo: odo, _kmLeft: (m.due_km && odo) ? (m.due_km - odo) : null, _due: maintenanceDueState(m, odo, L), _lead: L.days, _leadKm: L.km };
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Odometru (km) din io_data CAN — încearcă câmpurile uzuale.
// IMPORTANT unități: can_total_mileage / _counted sunt DEJA în km (convertite în codec8e),
// dar total_odometer e RAW în METRI (nu trece prin convertCanValue) → /1000. (identic cu reports.js odo / agents.js odoKm)
function _odoFromIo(io) {
  if (!io) return null;
  let km = null;
  if (io.can_total_mileage != null)              km = parseFloat(io.can_total_mileage);            // deja km
  else if (io.can_total_mileage_counted != null) km = parseFloat(io.can_total_mileage_counted);     // deja km
  else if (io.total_odometer != null)            km = parseFloat(io.total_odometer) / 1000;         // metri → km
  return (km != null && isFinite(km) && km > 0) ? Math.round(km) : null;
}

// Preavizul — CÂT DE DEVREME spunem că ceva „vine curând". O singură cifră pentru fiecare fel de
// scadență, folosită în AMBELE locuri: culoarea din listă ȘI alerta la clopoțel/telefon.
//
// Înainte erau șase numere diferite pentru aceeași idee: lista de acte se colora la 30 de zile, dar
// alerta suna la 7 (trei săptămâni în care ecranul striga și telefonul tăcea), iar dacă schimbai
// preavizul din Administrare se muta DOAR alerta — culorile rămâneau bătute în cod, deci setarea
// părea că nu face nimic.
//
// Valorile de aici sunt doar punctul de plecare; fiecare companie și le poate schimba
// (careDaysLead / careKmLead / docDaysLead în alert_thresholds).
const MAINT_DAYS_LEAD = 14;  // LUCRĂRI, pe dată — un schimb de ulei se face într-o oră
const MAINT_KM_LEAD = 500;   // LUCRĂRI, pe km
const DOC_DAYS_LEAD = 30;    // ACTE — un RCA sau un ITP vrea o lună de preaviz, nu o săptămână

// Preavizul fiecărei companii, într-o singură interogare. Ordinea: setarea companiei → setarea
// globală (super-admin) → constantele de mai sus.
async function _leadsByCompany() {
  const g = await _getGlobalAlertThresholds();
  const base = {
    days: parseInt(g && g.careDaysLead) || MAINT_DAYS_LEAD,
    km: parseInt(g && g.careKmLead) || MAINT_KM_LEAD,
    docDays: parseInt(g && g.docDaysLead) || DOC_DAYS_LEAD
  };
  const m = new Map();
  try {
    for (const co of await db.getCompanies()) {
      const t = _alertThresholdsFromSettings(co.settings) || {};
      m.set(co.id, {
        days: parseInt(t.careDaysLead) || base.days,
        km: parseInt(t.careKmLead) || base.km,
        docDays: parseInt(t.docDaysLead) || base.docDays
      });
    }
  } catch (e) {}
  return { base: base, of: function (cid) { return (cid != null && m.get(cid)) || base; } };
}
// Închisă? — REGULĂ UNICĂ (RA Care + checkExpiries + colorarea listei): status done/completed SAU done_date setat.
function _maintClosed(m) { if (!m) return true; const st = String(m.status || '').toLowerCase(); return st === 'done' || st === 'completed' || !!m.done_date; }
// Starea de scadență pt. UI: 'overdue' (depășit) | 'due_soon' (în fereastra de alertă) | 'ok'.
// `leads` = preavizul companiei (vezi _leadsByCompany); lipsă → constantele implicite.
function maintenanceDueState(m, odo, leads) {
  if (!m || _maintClosed(m)) return 'ok';
  const dLead = (leads && leads.days) || MAINT_DAYS_LEAD;
  const kLead = (leads && leads.km) || MAINT_KM_LEAD;
  let soon = false;
  if (m.due_date) {
    const days = Math.ceil((new Date(m.due_date).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= dLead) soon = true;
  }
  if (m.due_km && odo) {
    const left = m.due_km - odo;
    if (left <= 0) return 'overdue';
    if (left <= kLead) soon = true;
  }
  return soon ? 'due_soon' : 'ok';
}
// Aceeași poveste pentru ACTE, ca ecranele să nu mai calculeze fiecare pe cont propriu.
// 'expired' | 'soon' | 'ok' | 'none' (fără dată de expirare).
function documentDueState(d, leadDays) {
  if (!d || !d.expiry_date) return 'none';
  const days = Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  return days <= ((leadDays) || DOC_DAYS_LEAD) ? 'soon' : 'ok';
}
// La marcarea „efectuat": înregistrează momentul EXACT (done_at) + data + km-ul curent (best-effort).
async function stampMaintenanceDone(body) {
  if (!body || body.status !== 'done') return;
  if (!body.done_at) body.done_at = new Date().toISOString();
  if (!body.done_date) body.done_date = new Date().toISOString().slice(0, 10);
  if (body.done_km == null && body.imei) {
    try { const km = _odoFromIo(await db.getLastIo(body.imei)); if (km) body.done_km = km; } catch (e) {}
  }
}
// RECURENȚĂ: la bifarea „efectuat" a unei mentenanțe cu interval setat, creează AUTOMAT următoarea scadență
// (due_km = done_km + interval_km; due_date = done_date + interval_months) — altfel acoperirea expiră în tăcere.
async function maybeCreateNextMaintenance(oldRow, body, companyId) {
  try {
    if (!body || body.status !== 'done') return;
    if (oldRow && String(oldRow.status || '') === 'done') return; // era deja închisă → nu re-crea
    const ikm = parseInt(body.interval_km != null ? body.interval_km : (oldRow && oldRow.interval_km)) || 0;
    const imo = parseInt(body.interval_months != null ? body.interval_months : (oldRow && oldRow.interval_months)) || 0;
    if (!ikm && !imo) return;
    const next = {
      imei: body.imei || (oldRow && oldRow.imei), type: body.type || (oldRow && oldRow.type) || 'Mentenanță',
      description: (body.description != null ? body.description : (oldRow && oldRow.description)) || null,
      status: 'pending', interval_km: ikm || null, interval_months: imo || null, due_date: null, due_km: null,
    };
    if (!next.imei) return;
    if (imo) { const base = new Date(body.done_date || Date.now()); base.setMonth(base.getMonth() + imo); next.due_date = base.toISOString().slice(0, 10); }
    if (ikm) { const baseKm = Number(body.done_km) || Number(oldRow && oldRow.due_km) || 0; if (baseKm) next.due_km = baseKm + ikm; }
    if (!next.due_date && !next.due_km) return;
    const created = await db.createMaintenance(next, companyId != null ? companyId : ((oldRow && oldRow.company_id) != null ? oldRow.company_id : null));
    console.log('[MAINT] recurență: creată următoarea scadență #' + (created && created.id) + ' (' + next.type + (next.due_km ? ' la ' + next.due_km + ' km' : '') + (next.due_date ? ' la ' + next.due_date : '') + ')');
  } catch (e) { console.warn('[MAINT] recurență:', e.message); }
}

app.post('/api/maintenance', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    if (req.body.imei && !canAccessImei(req, req.body.imei)) return res.status(403).json({ error: 'Acces interzis' });
    await stampMaintenanceDone(req.body);
    const m = await db.createMaintenance(req.body, req.companyId); auditReq(req, 'create', 'maintenance', m.id, { imei: req.body.imei, type: req.body.type });
    maybeCreateNextMaintenance(null, req.body, req.companyId).catch(() => {}); // creată direct „efectuată" cu interval → programează următoarea
    res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'maintenance', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    let _oldM = null; try { _oldM = (await db.pool.query('SELECT * FROM maintenance WHERE id = $1', [req.params.id])).rows[0] || null; } catch (e) {}
    await stampMaintenanceDone(req.body);
    await db.updateMaintenance(req.params.id, req.body); auditReq(req, 'update', 'maintenance', req.params.id);
    maybeCreateNextMaintenance(_oldM, req.body, req.companyId).catch(() => {}); // pending→done cu interval → programează următoarea
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/maintenance/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'maintenance', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteMaintenance(req.params.id); auditReq(req, 'delete', 'maintenance', req.params.id); res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Intervale de service: la cât se repetă fiecare lucrare ───
// Implicitul stă în maint_types.js; ce schimbă compania stă în settings.maint_intervals și îl bate.
// Super-adminul (fără companie proprie) scrie GLOBAL — baza pentru toate companiile, ca la praguri.
async function _maintOverrides(companyId) {
  try {
    if (companyId == null) {
      const raw = await db.getSetting('maint_intervals_global');
      return maintTypes.sanitizeOverrides(raw ? JSON.parse(raw) : {});
    }
    const s = await db.getCompanySettings(companyId);
    const glob = await db.getSetting('maint_intervals_global');
    // Compania pornește de la ce a stabilit platforma, apoi pune peste ce a schimbat ea.
    return Object.assign(
      maintTypes.sanitizeOverrides(glob ? JSON.parse(glob) : {}),
      maintTypes.sanitizeOverrides((s && s.maint_intervals) || {})
    );
  } catch (e) { return {}; }
}
// Tabelul întreg, gata calculat. Se trimite AȘA, ca să nu existe două logici de îmbinare (una pe
// server, una în pagină) care să se depărteze — exact greșeala din care veneau listele duble.
function _maintIntervalTable(ov) {
  return maintTypes.WORK.map(w => {
    const row = { type: w.type, icon: w.icon, fam: w.fam, def: {}, custom: {} };
    maintTypes.CLASSES.forEach(c => {
      row[c.key] = maintTypes.intervalFor(w.type, c.key, ov);
      row.def[c.key] = maintTypes.intervalFor(w.type, c.key, null);
      const o = ov[maintTypes.norm(w.type)];
      row.custom[c.key] = !!(o && Object.prototype.hasOwnProperty.call(o, c.key));
    });
    return row;
  });
}
app.get('/api/maint-intervals', requireAuth, withCompany, async (req, res) => {
  try {
    const ov = await _maintOverrides(req.companyId);
    res.json({ classes: maintTypes.CLASSES, rows: _maintIntervalTable(ov) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/maint-intervals', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    const clean = maintTypes.sanitizeOverrides((req.body && req.body.overrides) || {});
    if (req.companyId == null) await db.setSetting('maint_intervals_global', JSON.stringify(clean));
    else await db.setCompanySettings(req.companyId, { maint_intervals: clean });
    auditReq(req, 'update', 'maint_intervals', req.companyId, { lucrari: Object.keys(clean).length });
    const ov = await _maintOverrides(req.companyId);
    res.json({ ok: true, classes: maintTypes.CLASSES, rows: _maintIntervalTable(ov) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MUTĂ un act scris din greșeală în Mentenanță (ITP, RCA, rovinietă…) acolo unde îi e locul: Documente.
// Vezi maint_types.js pentru graniță. Nu suprascrie niciodată un act existent: dacă vehiculul are deja
// acel tip, răspunde 409 și lasă omul să decidă — altfel mutarea ar înlocui un act complet, cu scan,
// cu unul sărac, refăcut dintr-o linie de mentenanță.
app.post('/api/maintenance/:id/to-document', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'maintenance', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    const m = (await db.pool.query('SELECT * FROM maintenance WHERE id = $1', [req.params.id])).rows[0];
    if (!m) return res.status(404).json({ error: 'Intrarea nu mai există' });
    if (!maintTypes.isDocType(m.type)) return res.status(400).json({ error: '„' + m.type + '" e o lucrare la service, nu un act.' });
    const docType = maintTypes.canonDocType(m.type);
    const dev = await db.getDeviceFull(m.imei);
    const companyId = (dev && dev.company_id != null) ? dev.company_id : m.company_id;
    const existing = (await db.getVehicleDocuments(m.imei, companyId) || []).find(d => d.doc_type === docType);
    if (existing) return res.status(409).json({ error: 'Vehiculul are deja un act „' + docType + '".', existing: { id: existing.id, expiry_date: existing.expiry_date } });
    const doc = await db.createVehicleDocument({
      imei: m.imei, doc_type: docType,
      expiry_date: m.due_date || null,          // scadența lucrării = valabilitatea actului
      issue_date: m.done_date || null,          // data efectuării = data emiterii
      cost: m.cost, notes: m.description || null
    }, companyId);
    await db.deleteMaintenance(m.id);
    auditReq(req, 'update', 'maintenance', m.id, { mutat_la_document: doc.id, tip: m.type });
    res.json({ ok: true, document: doc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Documente vehicul (ITP/RCA/CASCO/Rovinietă/...) ───
app.get('/api/documents', requireAuth, withScope, async (req, res) => {
  try {
    if (req.query.imei && !canAccessImei(req, req.query.imei)) return res.status(403).json({ error: 'Acces interzis' });
    let rows = await db.getVehicleDocuments(req.query.imei, req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) rows = rows.filter(d => req.allowedImeis.has(d.imei)); // scope per-vehicul (deja aplicat)
    // Starea („expirat / expiră curând / valabil") se calculează AICI, ca la mentenanță. Înainte o
    // socotea fiecare ecran pe cont propriu, cu 30 de zile bătute în cod în două locuri — iar alerta
    // suna după alt prag. Acum ecranul și telefonul folosesc aceeași cifră.
    const leads = await _leadsByCompany();
    rows = rows.map(d => {
      const L = leads.of(d.company_id);
      return { ...d, _due: documentDueState(d, L.docDays), _lead: L.docDays,
               _days: d.expiry_date ? Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) : null };
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Istoricul actelor unei mașini: ce a fost înlocuit, cu ce dată de expirare avea și cât a costat.
// Până la 2026-08-20 actul vechi se ștergea la reînnoire, deci istoricul ăsta pur și simplu nu exista.
app.get('/api/documents/history', requireAuth, withScope, async (req, res) => {
  try {
    if (req.query.imei && !canAccessImei(req, req.query.imei)) return res.status(403).json({ error: 'Acces interzis' });
    let rows = await db.getVehicleDocumentHistory(req.query.imei, req.isSuper ? null : req.companyId);
    if (req.allowedImeis != null) rows = rows.filter(d => req.allowedImeis.has(d.imei));
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
    // Reînnoire = actul vechi de același tip iese din uz — dar NU se mai șterge, trece în ISTORICUL
    // mașinii (decizie 2026-08-20). Așa vezi ce RCA aveai anul trecut, la ce firmă și cât ai dat.
    // Excepție „Altul" → poate exista în mai multe exemplare, deci nu înlocuiește nimic.
    if (req.body.doc_type !== 'Altul') {
      try { await db.archiveVehicleDocumentsByType(req.body.imei, req.body.doc_type, companyId); } catch (e) {}
    }
    const doc = await db.createVehicleDocument(req.body, companyId);
    auditReq(req, 'create', 'document', doc.id, { imei: req.body.imei, type: req.body.doc_type });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Modificarea unui act existent. Până acum se putea doar șterge și re-adăuga — iar la re-adăugare
// se pierdea fișierul atașat, dacă nu-l încărcai din nou. O greșeală de tastare la data expirării
// costa astfel actul scanat.
// Fișierul NU se atinge dacă nu se trimite unul nou: câmpurile se corectează fără să pierzi scanul.
app.put('/api/documents/:id', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (!(await ownsRow(req, 'vehicle_documents', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
    if (req.body && req.body.doc_type === '') return res.status(400).json({ error: 'Tipul documentului e obligatoriu' });
    const doc = await db.updateVehicleDocument(parseInt(req.params.id), req.body || {});
    if (!doc) return res.status(404).json({ error: 'Document inexistent' });
    auditReq(req, 'update', 'document', req.params.id, { type: doc.doc_type });
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

// ─── Citirea actelor: fișierul completează fișa ───────────────────────────────────────────────────
// POST /api/documents/scan — primește actul (poză sau PDF), întoarce PROPUNERI de câmpuri.
// NU scrie nimic în baza de date: regula de aur e că omul confirmă în interfață, apoi salvarea
// merge pe căile existente (POST /api/documents + PUT /api/devices/:imei/details).
// PDF cu strat de text = gratuit (extras local); poză = un apel de model, contorizat în ai_usage.
const docscan = require('./docscan');
app.post('/api/documents/scan', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const { b64, mime, tip } = req.body || {};
    const r = await docscan.scan({
      b64, mime, tip: tip || 'auto',
      // 'docscan': fel separat în ai_usage → costul citirii de acte se vede singur în Control costuri,
      // nu amestecat cu întrebările RA Insight. Se măsoară ÎNAINTE să-i punem preț.
      onUsage: (u) => db.recordAiUsage(req.companyId, 'docscan', u, req.auth && req.auth.userId).catch(() => {}),
    });
    auditReq(req, 'scan', 'document', null, { sursa: r.sursa, tip: r.tipDetectat, campuri: Object.keys(r.campuri).length });
    res.json(r);
  } catch (err) {
    // Mesajele din docscan sunt scrise pentru oameni („PDF-ul e o scanare fără text...") — le dăm mai departe.
    res.status(400).json({ error: err.message });
  }
});

// Imaginea actului, doar la cerere (listarea nu o cară — vezi getVehicleDocuments).
app.get('/api/documents/:id/file', requireAuth, withScope, async (req, res) => {
  try {
    const row = await db.getVehicleDocumentFile(parseInt(req.params.id), req.isSuper ? null : req.companyId);
    if (!row || !row.file_b64) return res.status(404).json({ error: 'Actul nu are fișier atașat' });
    const buf = Buffer.from(row.file_b64, 'base64');
    res.setHeader('Content-Type', row.file_mime || 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename="' + String(row.file_name || 'act').replace(/[^\w.\-]+/g, '_') + '"');
    res.send(buf);
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

// Coridor: punctul e „în zonă" dacă e la cel mult halfMeters de oricare segment al liniei centrale.
// Proiecție planară locală (echirectangulară) — exactă pentru lățimi de coridor (zeci de metri).
function isPointNearPolyline(lat, lng, line, halfMeters) {
  if (!Array.isArray(line) || line.length < 2 || !(halfMeters > 0)) return false;
  const mLat = 111320, mLon = 111320 * Math.cos(lat * Math.PI / 180);
  const px = lng * mLon, py = lat * mLat;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const ax = a[1] * mLon, ay = a[0] * mLat;
    const bx = b[1] * mLon, by = b[0] * mLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    if (Math.hypot(px - cx, py - cy) <= halfMeters) return true;
  }
  return false;
}

// Track geofence state per device for enter/exit detection
const geofenceStates = new Map(); // key: imei_geofenceId, value: boolean (inside)
const _alertIdleStart = new Map(); // imei -> { start, last, alerted } — sesiunea de ralanti (regula idle_engine)

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

// ── Alertă „furt combustibil" (per companie, prag self-service fuelTheftL) ───────────────────────────
// Două moduri: (1) PARCARE — scădere între ultima oprire (ign OFF) și următoarea pornire (ign ON);
// (2) ÎN MERS — scădere bruscă în deplasare, dar NU alertăm imediat: ținem o „suspiciune" și o confirmăm
// doar dacă nivelul NU revine în ~1h (clătinarea/înclinarea pe pantă readuce temporar citirea CAN în jos).
const _fuelTheft = new Map();          // imei -> { ign, lastFuel, parkFuel, parkAt, susp:{baseline,low,at}|null }
const _fuelTheftCooldown = new Map();  // imei -> ts ultima alertă (anti-spam)
const _companyThreshCache = new Map(); // companyId -> { ts, thresholds } (evită un SELECT/poziție)
async function _companyThresholds(companyId) {
  if (companyId == null) return {};
  const c = _companyThreshCache.get(companyId);
  if (c && (Date.now() - c.ts) < 60000) return c.thresholds;
  const t = await _getAlertThresholds(companyId);
  _companyThreshCache.set(companyId, { ts: Date.now(), thresholds: t });
  return t;
}
async function _emitFuelTheft(imei, data, info) {
  const now = Date.now();
  if ((now - (_fuelTheftCooldown.get(imei) || 0)) < 30 * 60 * 1000) return; // o alerta / 30 min / vehicul
  _fuelTheftCooldown.set(imei, now);
  const where = info.mode === 'parked' ? 'cat a stat oprit' : 'in mers (nerevenit in 1h)';
  const body = `Scadere ${info.drop.toFixed(1)} L ${where} - de la ${info.from.toFixed(1)} L la ${info.to.toFixed(1)} L`;
  const payload = { imei, vehicleName: (data && data.name) || imei, lat: data && data.latitude, lng: data && data.longitude, drop: Math.round(info.drop * 10) / 10, fromL: Math.round(info.from * 10) / 10, toL: Math.round(info.to * 10) / 10, mode: info.mode, timestamp: new Date().toISOString() };
  broadcastWs({ type: 'alert', data: { alertType: 'fuel_theft', alertName: 'Posibil furt combustibil', ...payload } });
  notify({ type: 'alert', severity: 'warning', imei, title: 'Posibil furt combustibil', body, dedupHours: 1, data: { alertType: 'fuel_theft', key: 'fueltheft:' + imei + ':' + Math.round(now / 1800000), ...payload } });
  console.log(`[FUEL-THEFT] ${imei}: -${info.drop.toFixed(1)}L (${info.mode})`);
}
// Decizia propriu-zisa sta in fueltheft.js (modul pur, verificabil). Aici raman doar accesul la
// praguri, emiterea si matura periodica.
async function checkFuelTheft(imei, data, devCompany) {
  try {
    const companyId = (devCompany !== undefined) ? devCompany : await getDeviceCompanyCached(imei);
    const th = await _companyThresholds(companyId);
    const X = Number(th.fuelTheftL);
    if (!Number.isFinite(X) || X <= 0) { if (_fuelTheft.has(imei)) _fuelTheft.delete(imei); return; } // dezactivat pt. companie
    const r = fueltheft.pas(_fuelTheft.get(imei) || fueltheft.stareNoua(), data.io || {}, X, Date.now());
    _fuelTheft.set(imei, r.st);
    if (r.alerta) await _emitFuelTheft(imei, data, r.alerta);
  } catch (e) { /* nu bloca ingestul */ }
}
// Confirma suspiciunile "in mers" mai vechi de 1h chiar daca vehiculul a incetat sa raporteze intre
// timp, si uita suspiciunile de parcare neconfirmate. Reverifica pragul LIVE (firma poate fi
// dezactivat alerta) + curata cooldown-urile si intrarile inactive.
setInterval(async () => {
  const wall = Date.now();
  for (const [imei, st] of _fuelTheft) {
    const cd = _fuelTheftCooldown.get(imei);
    if (cd && (wall - cd) > 24 * 60 * 60 * 1000) _fuelTheftCooldown.delete(imei);
    if (st.susp || st.pend) {
      const X = Number((await _companyThresholds(await getDeviceCompanyCached(imei))).fuelTheftL);
      if (!Number.isFinite(X) || X <= 0) { _fuelTheft.delete(imei); continue; } // firma a dezactivat alerta
      const r = fueltheft.expira(st, X, wall);
      _fuelTheft.set(imei, r.st);
      if (r.alerta) _emitFuelTheft(imei, livePositions.get(imei) || { name: imei }, r.alerta).catch(() => {});
    } else if (st.seen && (wall - st.seen) > 7 * 24 * 60 * 60 * 1000) {
      _fuelTheft.delete(imei); // vehicul inactiv de mult, fara suspiciune -> elibereaza memoria
    }
  }
}, 5 * 60 * 1000);

// Regulile de alertă și zonele se citeau din baza de date la FIECARE poziție primită. Cum
// `getAlerts()` aduce regulile TUTUROR companiilor, costul creștea cu clienți × poziții — produs,
// nu sumă. La 1000 de vehicule ajungeam la peste 100 de interogări pe secundă printr-un pool de 12
// conexiuni: se epuiza, iar ingestul se oprea. Aceeași soluție ca la `_devCompanyCache`: memorie
// scurtă, golită explicit la orice modificare, deci o regulă nouă intră în vigoare imediat.
let _alertsCache = null;                 // { ts, rows }
const _geoScopeCache = new Map();        // companyId -> { ts, rows }
const REGULI_CACHE_MS = 30000;
async function getAlertsCached() {
  if (_alertsCache && (Date.now() - _alertsCache.ts) < REGULI_CACHE_MS) return _alertsCache.rows;
  const rows = await db.getAlerts();
  _alertsCache = { ts: Date.now(), rows };
  return rows;
}
async function getGeofencesForScopeCached(companyId) {
  const k = companyId == null ? '_' : String(companyId);
  const c = _geoScopeCache.get(k);
  if (c && (Date.now() - c.ts) < REGULI_CACHE_MS) return c.rows;
  const rows = await db.getGeofencesForScope(companyId);
  _geoScopeCache.set(k, { ts: Date.now(), rows });
  return rows;
}
function invalidateReguliCache() { _alertsCache = null; _geoScopeCache.clear(); }

async function evaluateAlerts(imei, data) {
  try {
    const alerts = await getAlertsCached();
    if (!alerts || alerts.length === 0) return;
    const devCompany = await getDeviceCompanyCached(imei);

    const speed = data.speed || 0;
    const io = data.io || {};
    const lat = data.latitude;
    const lng = data.longitude;

    // Ralanti (regula idle_engine): de când stă pe loc cu motorul pornit. Resetăm la mișcare / contact oprit /
    // gap mare în transmisie. Calculat o singură dată per poziție (refolosit de regulile idle_engine).
    const _ignOn = io.ignition === 1 || io.ignition === true;
    const _idling = _ignOn && speed <= 3;
    const _posT = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
    let _idleMin = 0;
    if (_idling) {
      const st = _alertIdleStart.get(imei);
      if (!st || (_posT - st.last) > 6 * 60 * 1000) _alertIdleStart.set(imei, { start: _posT, last: _posT, alerted: false });
      else st.last = _posT;
      const s2 = _alertIdleStart.get(imei);
      _idleMin = (s2.last - s2.start) / 60000;
    } else {
      _alertIdleStart.delete(imei);
    }

    // Starea „era în zonă" se avansează O SINGURĂ DATĂ per poziție, nu per alertă. Altfel, când există
    // DOUĂ reguli pe aceeași zonă + același vehicul (intrare + ieșire), prima regulă evaluată suprascria
    // starea, iar a doua citea deja starea nouă → tranziția era „consumată" și alerta a doua NU se
    // declanșa niciodată. Practic: mergea doar intrarea, ieșirea niciodată (sau invers, după ordinea lor).
    const _gfPending = new Map(); // stateKey -> isInside, aplicat DUPĂ ce toate alertele au citit starea veche

    for (const alert of alerts) {
      if (!alert.enabled) continue;
      if (alert.type === 'document_expiry') continue; // bazat pe dată, nu pe poziție → tratat în checkExpiries()
      if (alert.imei) { if (alert.imei !== imei) continue; } // alertă pe device specific
      else if (alert.company_id != null && devCompany != null && alert.company_id !== devCompany) continue; // alertă company-wide doar pt. compania ei

      const cond = alert.condition || {};
      const cooldownKey = alert.id + '_' + imei;
      // Alertele de zonă își au răcirea PER ZONĂ (mai jos, la emitere): o regulă poate urmări mai multe
      // zone, iar o răcire comună ar fi înghițit a doua trecere dintr-o oră. Restul tipurilor: ca înainte.
      const _isGeo = alert.type === 'geofence_enter' || alert.type === 'geofence_exit';
      if (!_isGeo) {
        const lastTriggered = alertCooldowns.get(cooldownKey);
        if (lastTriggered && (Date.now() - lastTriggered) < 300000) continue; // 5 min cooldown
      }

      let triggered = false;
      let alertData = {};
      const events = []; // { zone?, data } — tipurile de zonă pot produce mai multe evenimente odată

      switch (alert.type) {
        case 'overspeed': {
          // Prag efectiv = max(prag minim 50, limita configurată) + marjă 10. Nu alertăm sub 60 km/h →
          // fără alarme absurde în zone rezidențiale (ex. limită 5, mers cu 20). Respectă o limită mai mare dacă e setată.
          const _base = Math.max(SPEED_ALERT_BASE, Number(cond.maxSpeed) || 0);
          if (speed > _base + SPEED_ALERT_MARGIN) {
            triggered = true;
            alertData = { speed, limit: _base, margin: SPEED_ALERT_MARGIN, lat, lng };
          }
          break;
        }

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
          // O regulă poate urmări MAI MULTE zone (`geofenceIds`). `geofenceId` la singular rămâne citit
          // pentru regulile create înainte. Fiecare zonă e evaluată separat și raportată separat: dacă
          // mașina trece prin trei zone urmărite într-o zi, primești trei anunțuri, nu unul.
          if (lat && lng) {
            try {
              const ids = (Array.isArray(cond.geofenceIds) && cond.geofenceIds.length)
                ? cond.geofenceIds
                : (cond.geofenceId ? [cond.geofenceId] : []);
              if (!ids.length) break;
              // Tenant: doar zonele companiei alertei — o alertă nu poate referi geofence-ul altei companii.
              const geofences = await getGeofencesForScopeCached(alert.company_id);
              for (const gid of ids) {
                const gf = geofences.find(g => Number(g.id) === Number(gid));
                if (!gf || !gf.coordinates) continue;
                const coords = typeof gf.coordinates === 'string' ? JSON.parse(gf.coordinates) : gf.coordinates;
                let isInside = false;

                if (gf.type === 'circle' && coords.center && coords.radius) {
                  isInside = isPointInCircle(lat, lng, coords.center[0], coords.center[1], coords.radius / 1000);
                } else if (coords && Array.isArray(coords.line) && coords.width) {
                  isInside = isPointNearPolyline(lat, lng, coords.line, coords.width / 2);
                } else if (Array.isArray(coords)) {
                  isInside = isPointInPolygon([lat, lng], coords);
                }

                const stateKey = imei + '_' + gf.id;
                const wasInside = geofenceStates.get(stateKey);

                if (alert.type === 'geofence_exit' && wasInside === true && !isInside) {
                  events.push({ zone: gf.id, data: { geofence: gf.name || gf.id, geofenceId: gf.id, event: 'Ieșire din zonă' } });
                } else if (alert.type === 'geofence_enter' && wasInside === false && isInside) {
                  events.push({ zone: gf.id, data: { geofence: gf.name || gf.id, geofenceId: gf.id, event: 'Intrare în zonă' } });
                }

                _gfPending.set(stateKey, isInside); // NU direct în geofenceStates: vezi nota de la _gfPending
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

        case 'idle_engine': {
          // Staționare cu motorul pornit peste pragul de minute consecutive (o singură alertă per sesiune de ralanti).
          const thr = cond.idleMinutes || 15;
          const st = _alertIdleStart.get(imei);
          if (_idling && st && !st.alerted && _idleMin >= thr) {
            st.alerted = true;
            triggered = true;
            alertData = { idleMinutes: Math.round(_idleMin), threshold: thr, idleStart: st.start }; // startul REAL al sesiunii → detaliu „De la … până la …"
          }
          break;
        }
      }

      if (triggered) events.push({ data: alertData });

      for (const ev of events) {
        // Răcire proprie pentru fiecare zonă → două zone traversate în aceeași oră dau două anunțuri.
        const ck = ev.zone != null ? cooldownKey + '_z' + ev.zone : cooldownKey;
        const last = alertCooldowns.get(ck);
        if (last && (Date.now() - last) < 300000) continue;
        alertCooldowns.set(ck, Date.now());

        const d = ev.data;
        d.imei = imei;
        d.vehicleName = data.name || imei;
        d.lat = lat;
        d.lng = lng;
        d.timestamp = new Date().toISOString();

        // Save to DB
        try {
          await db.insertAlertEvent(alert.id, imei, d);
        } catch (e) { /* DB error */ }

        // Broadcast alert via WebSocket
        broadcastWs({
          type: 'alert',
          data: {
            alertId: alert.id,
            alertName: alert.name,
            alertType: alert.type,
            ...d
          }
        });

        // Centru de notificări + canale externe (Faza 4)
        notify({
          type: 'alert', severity: 'warning', imei,
          title: alert.name,
          body: alertSummary(alert.type, d),
          data: { alertId: alert.id, alertType: alert.type, ...d }
        });

        console.log(`[ALERT] ${alert.name} triggered for ${imei}: ${JSON.stringify(d)}`);
      }
    }

    // Abia acum avansăm starea zonelor: toate regulile au citit deja starea DE DINAINTE de poziția asta.
    _gfPending.forEach(function (isInside, stateKey) { geofenceStates.set(stateKey, isInside); });
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
    case 'idle_engine': return `Ralanti ${d.idleMinutes} min (prag ${d.threshold} min)`;
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
    _notifyPush(n).catch(() => {}); // push NATIV (FCM) către utilizatorii eligibili, respectând preferințele
  } catch (e) { console.error('[NOTIFY]', e.message); }
}
// Fan-out push nativ pentru notify(): rezolvă utilizatorii țintă (userId / imei / companie) și trimite DOAR
// celor care au push activat pentru acest tip. No-op dacă FCM nu e configurat (sendPushToUser iese devreme).
// O regulă din secțiunea „Alerte" ajunge la notificare cu type='alert', iar tipul ei REAL (viteză,
// combustibil, ralanti…) călătorește doar în data.alertType — unde nimeni nu se uita la filtrare.
// Efectul: stingeai „Depășire viteză" din Preferințe notificări, opreai evenimentele automate, dar
// regulile din „Alerte" continuau să sune, pentru că se verifica alt rând din aceeași listă.
// Câteva tipuri de regulă nu se numesc la fel ca rândul din preferințe — de aici echivalențele.
const ALERT_TIP_EVENIMENT = {
  idle_engine: 'idling',
  overload_legal: 'overload', overload_construct: 'overload', axle_overload: 'overload',
};
// true = utilizatorul a stins EXPLICIT tipul concret al regulii. Dacă n-a atins rândul, întoarce
// false și rămâne comportamentul de dinainte (regula sună) — nu presupunem tăcere din tăcere.
function tipulReguliiStins(prefsMap, userId, data) {
  const brut = data && data.alertType ? String(data.alertType) : null;
  if (!brut) return false;
  const cheie = ALERT_TIP_EVENIMENT[brut] || brut;
  const up = prefsMap[userId];
  const p = (up && up.types) ? up.types[cheie] : null;
  if (!p) return false;
  return p.push === false || p.enabled === false;
}

async function _notifyPush(n) {
  if (!_fcm) return;
  let users = [];
  try {
    if (n.userId) users = [{ id: n.userId }];
    else if (n.imei) users = await getEligibleUsers(n.imei);
    else if (n.companyId != null) users = await db.getActiveUsersForCompany(n.companyId);
  } catch (_) { return; }
  if (!users || !users.length) return;
  const prefsMap = await getPrefsMap();
  const payload = { title: n.title || 'RA Track', body: n.body || '', imei: n.imei || null, data: Object.assign({ type: n.type || '' }, n.data || {}) };
  for (const u of users) {
    const up = userTypePref(prefsMap, u.id, n.type);
    // Regulă din „Alerte" pe un tip pe care utilizatorul l-a stins explicit → tăcem, oricât de
    // pornit ar fi rândul general „Reguli de alertă". Comutatorul stins trebuie să stingă.
    if (n.type === 'alert' && tipulReguliiStins(prefsMap, u.id, n.data)) continue;
    // Comutatorul PRINCIPAL al tipului, stins → tăcere totală. Lipsea de aici, deși cealaltă cale îl
    // verifica (`if (!up || !up.enabled) continue`). Se vedea mai ales pe telefon: acolo, stingând
    // comutatorul principal, bifele de canal DISPAR din ecran — dar valoarea `push:true` rămâne
    // salvată dedesubt. Arăta stins și suna mai departe.
    if (up && up.enabled === false) continue;
    // push explicit activat SAU (fără preferință explicită + notificare CRITICĂ) → criticele ajung mereu pe telefon
    if (up && (up.push || (up.push == null && n.severity === 'critical'))) sendPushToUser(u.id, payload).catch(() => {});
  }
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
// ─── Workere globale: stare + gardă anti-suprapunere ───────────────────────────────────────────────
// La 30 de companii / ~2000 vehicule, o rulare de detecție curse poate depăși intervalul de 15 min. Fără
// gardă, rulările s-ar suprapune și ar consuma același pool de conexiuni ca ingestul de poziții (care e
// prioritar — pierderea de telemetrie nu se recuperează). Ținem și durata/ultima rulare, ca să fie
// vizibile în /api/admin/health în loc să se ghicească din loguri.
const WORKERS = {
  trips:     { label: 'Detecție curse',        running: false, startedAt: null, lastAt: null, lastMs: null, lastResult: null, lastError: null, skipped: 0, runs: 0 },
  agents:    { label: 'Agenți AI (fundal)',    running: false, startedAt: null, lastAt: null, lastMs: null, lastResult: null, lastError: null, skipped: 0, runs: 0 },
  expiries:  { label: 'Scadențe & expirări',   running: false, startedAt: null, lastAt: null, lastMs: null, lastResult: null, lastError: null, skipped: 0, runs: 0 }
};
async function _runWorker(key, fn) {
  const w = WORKERS[key]; if (!w) return null;
  if (w.running) { // rulare anterioară încă în desfășurare → SĂRIM tura asta (nu ne suprapunem peste ea)
    w.skipped++;
    const forMin = w.startedAt ? Math.round((Date.now() - w.startedAt) / 60000) : '?';
    console.warn('[WORKER] „' + w.label + '" rulează de ' + forMin + ' min — sar peste tura curentă (total sărite: ' + w.skipped + ')');
    return null;
  }
  w.running = true; w.startedAt = Date.now();
  try {
    const out = await fn();
    w.lastResult = out; w.lastError = null;
    return out;
  } catch (e) {
    w.lastError = e.message; w.lastResult = null;
    console.error('[WORKER] „' + w.label + '" a eșuat:', e.message);
    return null;
  } finally {
    w.lastMs = Date.now() - w.startedAt; w.lastAt = new Date().toISOString(); w.runs++;
    w.running = false; w.startedAt = null;
  }
}
// Cedează bucla de evenimente ca ingestul TCP (poziții în timp real) să nu aștepte după worker.
const _yield = () => new Promise((r) => setImmediate(r));

async function runTripDetection() {
  return await _runWorker('trips', async () => {
    // Vehiculele demo sunt excluse ca peste tot (vezi DEMO_SET): altfel workerul făcea la fiecare 15 minute
    // DELETE+INSERT pe `trips` pentru cinci camioane inventate — a doua sursă de scrieri fără destinatar,
    // independentă de simulator, care rula chiar și cu simulatorul oprit.
    const devs = (await db.getDevices()).filter(d => !DEMO_SET.has(d.imei));
    let total = 0, i = 0;
    for (const d of devs) {
      total += await detectAndSaveTrips(d.imei);
      if (++i % 25 === 0) await _yield(); // porții de 25 de vehicule → ingestul nu rămâne blocat pe flote mari
    }
    return total;
  }) || 0;
}

// Curățare unică: notificările VECHI (dinainte de fixul cu _vehLabel) au IMEI-ul brut în titlu —
// le rescriem cu nr. înmatriculare/numele vehiculului. Idempotent: după rescriere, query-ul nu mai găsește nimic.
async function fixOldNotifTitles() {
  try {
    const bad = await db.pool.query("SELECT id, imei, title FROM notifications WHERE imei IS NOT NULL AND title LIKE ('%' || imei || '%') LIMIT 1000");
    if (!bad.rows.length) return;
    const ident = new Map();
    try { const vr = await db.pool.query('SELECT imei, name, plate FROM devices'); for (const v of vr.rows) ident.set(v.imei, String(v.plate || v.name || '').trim()); } catch (e) {}
    let n = 0;
    for (const r of bad.rows) {
      const label = ident.get(r.imei);
      if (!label || label === r.imei) continue; // vehicul fără nume/nr → nu avem cu ce înlocui
      await db.pool.query('UPDATE notifications SET title = $2 WHERE id = $1', [r.id, String(r.title).split(r.imei).join(label)]);
      n++;
    }
    if (n) console.log('[NOTIF] ' + n + ' titluri vechi curățate (IMEI → nr/nume vehicul)');
  } catch (e) { /* best-effort */ }
}

// Worker: alerte expirare documente (permis șofer) + mentenanță scadentă
async function checkExpiries() { return await _runWorker('expiries', _checkExpiriesBody); }
async function _checkExpiriesBody() {
  const warnDays = parseInt(process.env.NOTIFY_EXPIRY_DAYS) || 30;
  const now = Date.now(), horizon = now + warnDays * 24 * 3600 * 1000;
  try {
    for (const dr of await db.getDrivers()) {
      if (!dr.license_expiry) continue;
      const exp = new Date(dr.license_expiry).getTime();
      if (exp > horizon) continue;
      const days = Math.ceil((exp - now) / (24 * 3600 * 1000));
      // Cheia era fără prag și fără durată de dedup → o notificare PE ZI, toate cele 30 de zile de
      // preaviz, plus la nesfârșit după expirare. Aceleași bucket-uri ca la documente: o alertă per
      // prag, memento săptămânal după expirare.
      let bDrv, dedupDrv;
      if (days < 0) { bDrv = 'exp'; dedupDrv = 7 * 24; }
      else if (days <= 1) { bDrv = '1'; dedupDrv = 24; }
      else if (days <= 3) { bDrv = '3'; dedupDrv = 2 * 24; }
      else { bDrv = 'lead'; dedupDrv = Math.max(24, (warnDays - 3) * 24); }
      const nDrv = {
        type: 'document_expiry', severity: days < 0 ? 'critical' : 'warning', companyId: dr.company_id,
        dedupHours: dedupDrv,
        title: `Permis șofer ${days < 0 ? 'EXPIRAT' : 'expiră curând'}: ${dr.name}`,
        body: `Permisul ${dr.license_number || ''} ${days < 0 ? 'a expirat de ' + (-days) + ' zile' : 'expiră în ' + days + ' zile'} (${new Date(dr.license_expiry).toLocaleDateString('ro-RO')}).`,
        data: { key: 'drv-license-' + dr.id + '-' + bDrv, driverId: dr.id, days }
      };
      await notify(nDrv);
      await deliverExpiryToSubscribers({ companyId: dr.company_id, title: nDrv.title, body: nDrv.body, key: nDrv.data.key });
    }
    const _mntList = await db.getMaintenance();
    // Preavizul: companie → global (super-admin) → constante. ACEEAȘI funcție care colorează listele
    // în /api/maintenance și /api/documents — o singură cifră, nu una pentru ecran și alta pentru push.
    const _allLeads = await _leadsByCompany();
    const _leadsOf = (cid) => _allLeads.of(cid);
    // a) Scadență pe DATĂ — praguri lead / 3 / 1 zile + DEPĂȘIT (fiecare se declanșează ~o dată)
    const _mntDateDedup = { '14': 11 * 24, '3': 2 * 24, '1': 24, 'exp': 24 };
    for (const m of _mntList) {
      if (_maintClosed(m) || !m.due_date) continue;
      const days = Math.ceil((new Date(m.due_date).getTime() - now) / (24 * 3600 * 1000));
      let bucket = null;
      if (days < 0) bucket = 'exp';
      else if (days <= 1) bucket = '1';
      else if (days <= 3) bucket = '3';
      else if (days <= _leadsOf(m.company_id).days) bucket = '14';
      if (bucket === null) continue;
      const nMnt = {
        type: 'maintenance_due', severity: (days < 0 || days <= 3) ? 'critical' : 'warning', imei: m.imei, companyId: m.company_id,
        dedupHours: _mntDateDedup[bucket],
        title: `Mentenanță ${days < 0 ? 'SCADENTĂ' : 'scadentă curând'}: ${m.type}`,
        body: `${m.type} ${days < 0 ? 'a depășit scadența cu ' + (-days) + ' zile' : 'scade în ' + days + (days === 1 ? ' zi' : ' zile')} (${new Date(m.due_date).toLocaleDateString('ro-RO')}).`,
        data: { key: 'maint-' + m.id + '-' + bucket, maintenanceId: m.id, days }
      };
      await notify(nMnt);
      await deliverExpiryToSubscribers({ imei: m.imei, companyId: m.company_id, title: nMnt.title, body: nMnt.body, key: nMnt.data.key });
    }
    // b) Scadență pe KM — alertă cu ~500 km înainte + DEPĂȘIT (odometru CAN; vehiculele fără CAN → doar pe dată)
    try {
      const _odo = {};
      for (const d of await db.getDevices()) { const km = _odoFromIo(d.io_data); if (km) _odo[d.imei] = km; }
      for (const m of _mntList) {
        if (_maintClosed(m) || !m.due_km) continue;
        const odo = _odo[m.imei]; if (!odo) continue;
        const remaining = m.due_km - odo;
        let bucket = null;
        if (remaining <= 0) bucket = 'exp';
        else if (remaining <= _leadsOf(m.company_id).km) bucket = 'warn';
        if (bucket === null) continue;
        const nKm = {
          type: 'maintenance_due', severity: remaining <= 0 ? 'critical' : 'warning', imei: m.imei, companyId: m.company_id,
          dedupHours: remaining <= 0 ? 24 : 7 * 24,
          title: `Mentenanță ${remaining <= 0 ? 'SCADENTĂ (km)' : 'scadentă curând (km)'}: ${m.type}`,
          body: `${m.type} ${remaining <= 0 ? 'a depășit scadența cu ' + (-remaining) + ' km' : 'mai are ~' + remaining + ' km'} (prag ${m.due_km} km; acum ${odo} km).`,
          data: { key: 'maint-km-' + m.id + '-' + bucket, maintenanceId: m.id, remaining }
        };
        await notify(nKm);
        await deliverExpiryToSubscribers({ imei: m.imei, companyId: m.company_id, title: nKm.title, body: nKm.body, key: nKm.data.key });
      }
    } catch (e) { console.warn('[checkExpiries] km mentenanță:', e.message); }
    // Etichetă vehicul pentru titluri: nr. înmatriculare / nume, NU IMEI-ul (ilizibil pentru client).
    const _vehIdent = new Map();
    try { const vr = await db.pool.query('SELECT imei, name, plate FROM devices'); for (const v of vr.rows) _vehIdent.set(v.imei, String(v.plate || v.name || '').trim() || v.imei); } catch (e) {}
    const _vehLabel = (im) => _vehIdent.get(im) || im;
    // Documente vehicul (ITP / RCA / ROVINIETĂ) — alerte la lead / 3 / 1 zile + EXPIRAT.
    //
    // Pragul „lead" e ACELAȘI careDaysLead per companie ca la mentenanță — interfața promitea asta
    // în trei locuri (setări web, mobil, RA Care), dar bucla de aici era bătută în cuie pe 7 zile.
    // Nesetat, rămâne 7: comportamentul vechi nu se schimbă pentru nimeni care n-a atins setarea.
    //
    // Dedup pe DURATA bucketului, ca la mentenanță (_mntDateDedup) — nu pe implicitul de 20h, care
    // făcea ca fiecare bucket să sune zilnic cât timp era activ, iar „EXPIRAT" să sune zilnic LA
    // NESFÂRȘIT. Acum: o alertă per prag, iar pentru actul expirat un memento pe săptămână — un act
    // uitat nu trebuie să devină zgomot pe care înveți să-l ignori.
    // Preavizul actelor are acum cheia LUI (docDaysLead, implicit 30) și e ACELAȘI număr care
    // colorează lista în /api/documents. Înainte împrumuta careDaysLead cu un Math.max(7, …): lista
    // se colora la 30 de zile, iar telefonul suna abia la 7 — trei săptămâni de tăcere.
    const _docLeadOf = (cid) => _allLeads.of(cid).docDays;
    const _faraData = [];
    for (const d of await db.getVehicleDocuments(null, null)) {
      if (!d.expiry_date) { _faraData.push(d); continue; }   // colectat, nu sărit tăcut — vezi mai jos
      const exp = new Date(d.expiry_date).getTime();
      const days = Math.ceil((exp - now) / (24 * 3600 * 1000));
      const lead = _docLeadOf(d.company_id);
      let bucket = null, dedupH = null;
      if (days < 0) { bucket = 'exp'; dedupH = 7 * 24; }               // memento săptămânal, nu zilnic
      else if (days <= 1) { bucket = '1'; dedupH = 24; }
      else if (days <= 3) { bucket = '3'; dedupH = 2 * 24; }
      else if (days <= lead) { bucket = 'lead'; dedupH = Math.max(24, (lead - 3) * 24); }  // o dată pe toată banda 4..lead
      if (bucket === null) continue; // peste prag → nu alertăm încă
      const label = String(d.doc_type || 'Document').toUpperCase();
      const nDoc = {
        type: 'document_expiry', severity: (days < 0 || days <= 3) ? 'critical' : 'warning',
        imei: d.imei || null, companyId: d.company_id,
        dedupHours: dedupH,
        title: label + (days < 0 ? ' EXPIRAT' : ' expiră în ' + days + (days === 1 ? ' zi' : ' zile')) + (d.imei ? ' · ' + _vehLabel(d.imei) : ''),
        body: label + (d.number ? ' (' + d.number + ')' : '') + (days < 0 ? ' a expirat de ' + (-days) + ' zile' : ' expiră în ' + days + (days === 1 ? ' zi' : ' zile')) + ' — ' + new Date(d.expiry_date).toLocaleDateString('ro-RO') + '.',
        // Cheia bucketului vechi „7" devine „lead" — cheile vechi din tabelă nu se mai potrivesc,
        // deci la primul deploy alertele active pot suna o dată în plus. Acceptat: o notificare
        // dublă o singură dată e mai ieftină decât o schemă de migrare pe chei de dedup.
        data: { key: 'vdoc-' + d.id + '-' + bucket, docId: d.id, days: days, docType: d.doc_type }
      };
      await notify(nDoc);
      await deliverExpiryToSubscribers({ imei: d.imei, companyId: d.company_id, title: nDoc.title, body: nDoc.body, key: nDoc.data.key });
    }

    // Actele FĂRĂ dată de expirare — până acum, sărite tăcut. Un act fără dată e invizibil pentru
    // tot sistemul de alerte, iar proprietarul crede că e acoperit tocmai pentru că actul „e în
    // aplicație". O dată pe săptămână, compania primește UN rezumat — nu câte o notificare per act.
    try {
      const peCompanie = new Map();
      for (const d of _faraData) {
        if (d.company_id == null) continue;
        if (!peCompanie.has(d.company_id)) peCompanie.set(d.company_id, []);
        peCompanie.get(d.company_id).push(String(d.doc_type || 'act') + (d.imei ? ' · ' + _vehLabel(d.imei) : ''));
      }
      for (const [cid, lista] of peCompanie) {
        await notify({
          type: 'document_expiry', severity: 'warning', companyId: cid,
          dedupHours: 7 * 24,
          title: lista.length === 1 ? 'Un act fără dată de expirare' : lista.length + ' acte fără dată de expirare',
          body: 'Nu ești alertat pentru ele — aplicația nu are de unde ști când expiră: ' +
                lista.slice(0, 5).join(', ') + (lista.length > 5 ? ' și încă ' + (lista.length - 5) : '') +
                '. Completează data din fișa vehiculului → Documente.',
          data: { key: 'vdoc-nodate-' + cid, count: lista.length }
        });
      }
    } catch (e) { console.warn('[checkExpiries] acte fără dată:', e.message); }

    // Reguli „Expirare documente" (Management → Alerte): avertizare TIMPURIE la pragul warnDays per regulă
    // (un vehicul sau toată compania). Pragurile urgente 7/3/1/EXPIRAT de mai sus rămân pentru toate documentele.
    try {
      const docRules = (await db.getAlerts()).filter(a => a.enabled && a.type === 'document_expiry');
      if (docRules.length) {
        const allDocs = await db.getVehicleDocuments(null, null);
        for (const a of docRules) {
          const wd = (a.condition && a.condition.warnDays) || 30;
          if (wd <= 7) continue; // sub 8 zile = deja acoperit de pragurile urgente globale
          for (const d of allDocs) {
            if (!d.expiry_date) continue;
            if (a.imei) { if (d.imei !== a.imei) continue; }                          // regulă pe un vehicul
            else if (a.company_id != null && d.company_id !== a.company_id) continue;  // regulă pe compania ei
            const days = Math.ceil((new Date(d.expiry_date).getTime() - now) / (24 * 3600 * 1000));
            if (days <= 7 || days > wd) continue; // în afara benzii (8 .. warnDays) → nu acum
            const label = String(d.doc_type || 'Document').toUpperCase();
            const nEarly = {
              type: 'document_expiry', severity: 'warning', imei: d.imei || null, companyId: d.company_id,
              dedupHours: wd * 24, // o singură avertizare timpurie pe toată banda warnDays
              title: label + ' expiră în ' + days + ' zile' + (d.imei ? ' · ' + _vehLabel(d.imei) : ''),
              body: label + (d.number ? ' (' + d.number + ')' : '') + ' expiră în ' + days + ' zile — ' + new Date(d.expiry_date).toLocaleDateString('ro-RO') + ' (regula „' + a.name + '").',
              data: { key: 'vdoc-rule-' + a.id + '-' + d.id, alertId: a.id, docId: d.id, days }
            };
            await notify(nEarly);
            await deliverExpiryToSubscribers({ imei: d.imei, companyId: d.company_id, title: nEarly.title, body: nEarly.body, key: nEarly.data.key });
          }
        }
      }
    } catch (e) { console.error('[EXPIRY-RULE]', e.message); }
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
  { key: 'document_expiry',  label: 'Expirare documente',         threshold: false },
  // Regulile definite manual în „Alerte" (viteză, zone, ralanti…) trimit notificări cu type='alert'.
  // Tipul LIPSEA din catalog, deci nu exista nicio bifă pentru el — iar push-ul se trimite doar pentru
  // tipuri bifate. Rezultatul: o regulă de alertă nu putea ajunge NICIODATĂ pe telefon, indiferent ce
  // configurai. Push implicit PORNIT: regula a fost creată tocmai ca să fii anunțat.
  { key: 'alert',            label: 'Reguli de alertă (secțiunea Alerte)', threshold: false, pushDefault: true }
];
const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map(e => [e.key, e]));
const PUSH_DEFAULT_TYPES = new Set(EVENT_TYPES.filter(e => e.pushDefault).map(e => e.key));

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
  let subs; try { subs = await db.getPushSubscriptions(userId); } catch (e) { subs = []; }
  for (const s of subs) {
    try { await webpush.sendNotification(s.subscription, JSON.stringify(payload)); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.deletePushSubscription(s.endpoint).catch(() => {}); }
  }
  sendFcmToUser(userId, payload).catch(() => {}); // push nativ (FCM/APNs) în paralel cu Web Push
}

// ─── Push nativ (FCM Android / APNs iOS) pentru aplicația mobilă ───
// No-op dacă FIREBASE_SA_JSON nu e setat → nu afectează deploy-urile fără mobil.
let _fcm = null, _fcmStatus = 'unset';
function initFcm() {
  try {
    const raw = process.env.FIREBASE_SA_JSON;
    if (!raw) { _fcmStatus = 'unset'; console.log('[FCM] inactiv (FIREBASE_SA_JSON nesetat)'); return; }
    let cred;
    try { cred = JSON.parse(raw); } catch (pe) { _fcmStatus = 'error: JSON invalid — ' + pe.message; console.warn('[FCM]', _fcmStatus); return; }
    const missing = ['type', 'project_id', 'private_key', 'client_email'].filter(k => !cred || !cred[k]);
    if (missing.length) { _fcmStatus = 'error: lipsesc câmpuri [' + missing.join(', ') + ']' + ((cred && cred.project_info) ? ' — pare google-services.json (fișier greșit); folosește cheia de service account' : ''); console.warn('[FCM]', _fcmStatus); return; }
    // firebase-admin v14 — API modular (namespace-ul vechi admin.apps/credential/messaging a fost eliminat)
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    if (!getApps().length) initializeApp({ credential: cert(cred) });
    _fcm = getMessaging(); _fcmStatus = 'active';
    console.log('[FCM] Push nativ activ');
  } catch (e) { _fcmStatus = 'error: ' + e.message; console.warn('[FCM] init eșuat (mobilul nu va primi push):', e.message); _fcm = null; }
}
async function sendFcmToUser(userId, payload) {
  if (!_fcm) return;
  let tokens; try { tokens = await db.getDeviceTokens(userId); } catch (e) { return; }
  if (!tokens || !tokens.length) return;
  const data = {};
  if (payload && payload.data) for (const k in payload.data) data[k] = String(payload.data[k] == null ? '' : payload.data[k]);
  if (payload && payload.imei && !data.imei) data.imei = String(payload.imei);
  try {
    const resp = await _fcm.sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: { title: (payload && payload.title) || 'RA Track', body: (payload && payload.body) || '' },
      data,
      android: { priority: 'high', notification: { channelId: 'ra_alerts', sound: 'notif' } }
    });
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument' || code === 'messaging/invalid-registration-token')
          db.deleteDeviceToken(tokens[i].token).catch(() => {});
      }
    });
  } catch (e) { /* nu blochează restul livrării */ }
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
const _noIgnMoveStart = new Map(); // imei -> ts de când e „mișcare cu contactul oprit" continuă (filtrează glitch-uri tranzitorii de ignition)

// Preferința unui user pentru un tip: dacă nu are nicio preferință salvată → implicit doar in-app
function userTypePref(prefsMap, userId, type) {
  // Tipurile din PUSH_DEFAULT_TYPES pornesc cu push ACTIV cât timp utilizatorul n-a atins setarea.
  // Altfel, cine avea deja preferințe salvate (fără cheia nouă) ar fi rămas fără push pe alerte — exact
  // tăcerea pe care o reparăm. O debifare explicită se respectă: atunci cheia EXISTĂ, cu push=false.
  const dflt = PUSH_DEFAULT_TYPES.has(type) ? { enabled: true, push: true } : { enabled: true };
  const up = prefsMap[userId];
  if (!up || !up.types) return dflt;                        // fără preferințe → in-app implicit pornit
  return up.types[type] || (PUSH_DEFAULT_TYPES.has(type) ? dflt : null); // bifă lipsă → implicit / null
}
async function deliverUserEvent(user, ev, p) {
  try {
    // data completă: locul evenimentului (lat/lng) + extra per tip (ex. idling: alertType/idleStart → detaliu „De la…Până la")
    const nd = Object.assign({ eventType: ev.type }, (ev.lat != null && ev.lng != null) ? { lat: ev.lat, lng: ev.lng } : {}, ev.extra || {});
    const saved = await db.createNotification({ type: ev.type, severity: ev.severity || 'warning', imei: ev.imei || null, title: ev.title, body: ev.body, data: nd, userId: user.id });
    broadcastWsToUser(user.id, { type: 'notification', data: saved });
  } catch (e) {}
  if (p && p.email && user.email) channels.sendEmailTo(user.email, ev.title, ev.body).catch(() => {});
  // push explicit SAU (fără preferință explicită + eveniment CRITIC) → criticele ajung mereu pe telefon
  if (p && (p.push || (p.push == null && ev.severity === 'critical'))) sendPushToUser(user.id, { title: ev.title, body: ev.body, imei: ev.imei || null, data: { type: ev.type, imei: ev.imei || '' } }).catch(() => {});
}

// ─── Dispozitiv NOU conectat → anunță super-adminul ───
// La prima conectare a unui tracker neînregistrat, super-adminul primește o notificare (in-app + push)
// de unde poate ADOPTA dispozitivul (îl asignează unei companii = îl transformă în vehicul și stochează
// datele) sau îl poate RESPINGE (arhivare → se oprește stocarea). O singură dată per IMEI (dedup 24h).
async function notifyNewDeviceConnected(imei, address) {
  try {
    const key = 'newdev:' + imei;
    if (await db.notificationKeyExists(key, 24)) return; // deja anunțat în ultimele 24h
    const title = 'Dispozitiv nou conectat';
    const body = 'IMEI ' + imei + ' transmite date dar nu e asociat niciunui vehicul. Adoptă-l (creează vehicul) sau respinge-l din „Companii → Vehicule neasignate".';
    const saved = await db.createNotification({ type: 'device_new', severity: 'info', imei, title, body, data: { key, imei, address: address || null }, userId: null, companyId: null });
    // Pentru un device orfan (companie NULL), getUsersForImei întoarce DOAR superadminii.
    let supers = [];
    try { supers = await db.getUsersForImei(imei); } catch (_) {}
    for (const u of supers) {
      if (u.role !== 'superadmin') continue; // strict: doar platforma află de orfani
      try { broadcastWsToUser(u.id, { type: 'notification', data: saved }); } catch (_) {}
      sendPushToUser(u.id, { title, body, imei, data: { type: 'device_new', imei } }).catch(() => {});
    }
    console.log('[TCP] Dispozitiv nou ' + imei + ' (' + (address || '?') + ') → notificat super-admin');
  } catch (e) { console.error('[TCP] notifyNewDeviceConnected ' + imei + ': ' + e.message); }
}

// ─── Webhooks outbound (integrare ERP/TMS) ───
// Fast-path: dacă NICIO companie nu are webhook activ, evaluateUserEvents nu plătește nimic.
let _anyWebhooks = false;
async function refreshAnyWebhooks() {
  try { const r = await db.pool.query('SELECT COUNT(*)::int AS n FROM webhooks WHERE enabled = true'); _anyWebhooks = (Number(r.rows[0] && r.rows[0].n) || 0) > 0; } catch (e) { /* tabela poate lipsi la prima rulare */ }
}
const _whCache = new Map();      // companyId -> { ts, hooks }
const _whCooldown = new Map();   // companyId:type:imei -> ts
const _devCoCache = new Map();   // imei -> { ts, cid }
function invalidateWebhookCache(companyId) { _anyWebhooks = true; if (companyId == null) _whCache.clear(); else _whCache.delete(companyId); refreshAnyWebhooks(); }
async function _deviceCompanyId(imei) {
  const c = _devCoCache.get(imei);
  if (c && Date.now() - c.ts < 300000) return c.cid;
  let cid = null;
  try { const d = await db.getDeviceFull(imei); cid = d ? d.company_id : null; } catch (e) {}
  _devCoCache.set(imei, { ts: Date.now(), cid });
  return cid;
}
async function _webhooksFor(companyId) {
  let e = _whCache.get(companyId);
  if (!e || Date.now() - e.ts > 30000) {
    let hooks = []; try { hooks = await db.getEnabledWebhooks(companyId); } catch (_) {}
    e = { ts: Date.now(), hooks }; _whCache.set(companyId, e);
  }
  return e.hooks;
}
function _whCooldownOk(companyId, type, imei) {
  const key = companyId + ':' + type + ':' + (imei || '-');
  const now = Date.now(); const last = _whCooldown.get(key);
  if (last && now - last < 120000) return false; // 2 min/eveniment/vehicul
  _whCooldown.set(key, now);
  if (_whCooldown.size > 10000) { for (const [k, t] of _whCooldown) if (now - t > 600000) _whCooldown.delete(k); }
  return true;
}
// ─── Anti-SSRF pentru webhooks: blochează URL-urile către infrastructură internă ───
// (loopback, IP-uri private/link-local, metadata cloud 169.254.x, gazde interne). Altfel un admin ar putea
// folosi serverul ca proxy spre rețeaua internă, iar last_status/last_error ca oracol. WEBHOOK_ALLOW_PRIVATE=true
// dezactivează blocarea (doar pt. instalări on-prem unde ținta e intenționat internă).
function _isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 169 && p[1] === 254) ||              // link-local + metadata cloud
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127);   // CGNAT
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80')) return true; // ULA + link-local
    const m = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return _isPrivateIp(m[1]); // IPv4-mapped
    return false;
  }
  return false;
}
function _hostBlocked(host) {
  const h = (host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  return false;
}
// Validare sincronă la CREARE (hostname/IP-literal).
function webhookUrlError(raw) {
  let u; try { u = new URL(raw); } catch (e) { return 'URL invalid'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Doar http/https';
  if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return null;
  if (_hostBlocked(u.hostname)) return 'Gazdă internă interzisă';
  if (net.isIP(u.hostname) && _isPrivateIp(u.hostname)) return 'Adresă IP privată/internă interzisă';
  return null;
}
// Verificare la LIVRARE: rezolvă DNS → respinge dacă orice IP e privat (anti DNS-rebinding).
async function webhookHostAllowed(raw) {
  let u; try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return true;
  if (_hostBlocked(u.hostname)) return false;
  if (net.isIP(u.hostname)) return !_isPrivateIp(u.hostname);
  try { const addrs = await dnsp.lookup(u.hostname, { all: true }); return addrs.length > 0 && addrs.every((a) => !_isPrivateIp(a.address)); }
  catch (e) { return false; }
}
// Livrează un corp deja serializat la UN webhook (fire-and-forget, semnat HMAC, timeout 5s, anti-SSRF).
async function _deliverWebhook(h, body) {
  if (!(await webhookHostAllowed(h.url))) { db.updateWebhookStatus(h.id, 0, 'URL blocat (gazdă internă/privată)'); return; }
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'RA-Tracks-Webhook/1.0' };
  if (h.secret) headers['X-RaTracks-Signature'] = 'sha256=' + crypto.createHmac('sha256', h.secret).update(body).digest('hex');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 5000);
  // redirect:'error' → fără SSRF prin redirect public→intern.
  fetch(h.url, { method: 'POST', headers, body, signal: ctrl.signal, redirect: 'error' })
    .then((r) => { clearTimeout(timer); db.updateWebhookStatus(h.id, r.status, r.ok ? null : ('HTTP ' + r.status)); })
    .catch((e) => { clearTimeout(timer); db.updateWebhookStatus(h.id, 0, (e && e.message || 'eroare').slice(0, 120)); });
}
// Livrează un eveniment către TOATE webhook-urile companiei abonate (fire-and-forget).
async function fireWebhooks(companyId, payload, opts) {
  try {
    if (companyId == null) return;
    const hooks = await _webhooksFor(companyId);
    if (!hooks.length) return;
    if (!(opts && opts.skipCooldown) && !_whCooldownOk(companyId, payload.event, payload.imei)) return;
    const body = JSON.stringify(Object.assign({ company_id: companyId, ts: new Date().toISOString() }, payload));
    for (const h of hooks) {
      const sub = !h.events || (Array.isArray(h.events) && (h.events.length === 0 || h.events.includes(payload.event)));
      if (sub) _deliverWebhook(h, body);
    }
  } catch (e) { /* niciodată nu blocăm fluxul de evenimente */ }
}

// Titlul notificării: „<eveniment> — <NR ÎNMATRICULARE> · <denumire>". Numărul de înmatriculare primează;
// denumirea se adaugă DOAR dacă mai încape (titlurile push se trunchiază pe telefon). Fără plăcuță → denumirea.
function eventVehTitle(label, data, imei) {
  const plate = (data && data.plate) ? String(data.plate).trim() : '';
  const name = (data && data.name) ? String(data.name).trim() : '';
  let veh = plate || name || imei;
  if (plate && name && name !== plate) {
    const withName = plate + ' · ' + name;
    if ((label + ' — ' + withName).length <= 46) veh = withName; // ține titlul scurt pt. push
  }
  return label + ' — ' + veh;
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
      if (drop >= 2) cand.push({ type: 'fuel_drop', mag: drop, body: `Scădere ${drop.toFixed(1)} L (${pf} → ${cf} L)`,
        extra: { alertType: 'fuel_drop', fromL: Math.round(pf * 10) / 10, toL: Math.round(cf * 10) / 10, drop: Math.round(drop * 10) / 10 } }); // → detaliul arată de la cât la cât + cantitatea
    }
    if (speed >= 50) cand.push({ type: 'overspeed', mag: speed, body: `Viteză ${speed} km/h` });
    if (typeof io.can_engine_temp === 'number' && io.can_engine_temp >= 80) cand.push({ type: 'engine_temp', mag: io.can_engine_temp, body: `Temperatură motor ${io.can_engine_temp}°C` });
    if (io.ignition === 1 && speed <= 3) {
      if (!_idlingStart.has(imei)) _idlingStart.set(imei, Date.now());
      const min = (Date.now() - _idlingStart.get(imei)) / 60000;
      if (min >= 3) cand.push({ type: 'idling', mag: Math.round(min), body: `Motor pornit, staționat de ~${Math.round(min)} min`,
        extra: { alertType: 'idle_engine', idleStart: _idlingStart.get(imei), idleMinutes: Math.round(min) } }); // → detaliul arată intervalul real
    } else { _idlingStart.delete(imei); }
    // „Mișcare fără contact" (tractare/împingere): doar dacă PERSISTĂ ≥ 60s. Un singur pachet cu ignition=0 e adesea
    // un glitch tranzitoriu (ex. LV-CAN200 raportează contactul intermitent) → nu mai dă alertă falsă la fiecare flicker.
    if (io.ignition === 0 && speed > 5) {
      if (!_noIgnMoveStart.has(imei)) _noIgnMoveStart.set(imei, Date.now());
      const sec = (Date.now() - _noIgnMoveStart.get(imei)) / 1000;
      if (sec >= 60) cand.push({ type: 'no_ignition_move', mag: speed, body: `Mișcare ${speed} km/h cu contactul OPRIT (de ~${Math.round(sec)}s)` });
    } else { _noIgnMoveStart.delete(imei); }
    if (typeof io.external_voltage === 'number' && io.external_voltage > 0) {
      const v = io.external_voltage / 1000;
      if (v < 13) cand.push({ type: 'low_voltage', mag: v, body: `Tensiune alimentare ${v.toFixed(1)} V` });
    }
    const totalKg = (io.can_axle1_load || 0) + (io.can_axle2_load || 0) + (io.can_axle3_load || 0) + (io.can_axle4_load || 0) + (io.can_axle5_load || 0) || io.can_load_weight || 0;
    if (totalKg >= 20000) cand.push({ type: 'overload', mag: totalKg, body: `Greutate totală ${totalKg} kg` });
    if (io.can_dtc_errors > 0) cand.push({ type: 'dtc_error', mag: io.can_dtc_errors, body: `${io.can_dtc_errors} erori motor (DTC)` });

    if (!cand.length) return;
    const vname = data.name || imei;
    // Webhooks ERP/TMS (fire-and-forget): doar dacă există webhook-uri active (fast-path).
    if (_anyWebhooks) {
      const coId = await _deviceCompanyId(imei);
      for (const c of cand) fireWebhooks(coId, { event: c.type, imei, vehicle: vname, severity: c.type === 'no_ignition_move' ? 'critical' : 'warning', message: c.body, value: c.mag });
    }
    const users = await getEligibleUsers(imei);
    if (!users.length) return;
    const prefsMap = await getPrefsMap();
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
        await deliverUserEvent(u, { type: c.type, imei, severity: c.type === 'no_ignition_move' ? 'critical' : 'warning', title: eventVehTitle(def.label, data, imei), body: c.body, lat: data.latitude, lng: data.longitude, extra: c.extra }, up);
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
    reports: Object.entries(reports.REPORTS).map(([k, v]) => ({ type: k, label: v.label, cat: v.cat, desc: v.desc || '' }))
  });
});

// ─── Istoric rapoarte (per user, generate la cerere — retenție 7 zile) ───
// NB: declarate ÎNAINTE de /api/reports/:type ca să nu fie capturate de ruta parametrizată.
app.get('/api/reports/history', requireAuth, requirePerm('viewReports'), async (req, res) => {
  try {
    const uid = req.auth && req.auth.userId;
    if (!uid) return res.json([]);
    res.json(await db.getReportHistory(uid, parseInt(req.query.limit) || 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/reports/history/:id', requireAuth, requirePerm('viewReports'), async (req, res) => {
  try {
    const uid = req.auth && req.auth.userId;
    const row = uid ? await db.getReportHistoryById(req.params.id, uid) : null;
    if (!row) return res.status(404).json({ error: 'Raport inexistent sau expirat' });
    let report = row.data || {};
    if (typeof report === 'string') { try { report = JSON.parse(report); } catch (e) { report = {}; } }
    const fmt = (req.query.format || '').toLowerCase();
    if (fmt === 'xlsx' || fmt === 'pdf') {
      if (!reportExport) return res.status(503).json({ error: 'Export PDF/Excel indisponibil pe server' });
      return await reportExport.sendReport(res, report, fmt);
    }
    res.json({ id: row.id, report_type: row.report_type, label: row.label, generated_at: row.generated_at, report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/reports/history/:id', requireAuth, requirePerm('viewReports'), async (req, res) => {
  try {
    const uid = req.auth && req.auth.userId;
    if (!uid) return res.status(403).json({ error: 'Acces interzis' });
    await db.deleteReportHistory(req.params.id, uid);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:type', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    const imeis = await resolveReportImeis(req);
    if (imeis === null) return res.status(403).json({ error: 'Acces interzis' });
    const from = req.query.from || new Date(Date.now() - 7*24*3600*1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const _cs = req.companyId != null ? await db.getCompanySettings(req.companyId).catch(function () { return null; }) : null;
    const opts = {
      stopMin: parseInt(req.query.stopMin) || 5,
      limit: parseInt(req.query.limit) || 90,
      refuelMin: parseInt(req.query.refuelMin) || 10,
      dropMin: parseInt(req.query.dropMin) || 10,
      zoneMin: req.query.zoneMin != null ? (parseFloat(req.query.zoneMin) || 0) : 2, // Vizite în zone: ignoră vizitele mai scurte de atât (min); lipsă (client vechi în cache) → default 2
      harshAccel: parseFloat(req.query.harshAccel) || 7, // EcoDrive: prag accelerare bruscă (km/h/s)
      harshBrake: parseFloat(req.query.harshBrake) || 9, // EcoDrive: prag frânare bruscă (km/h/s)
      harshTurn: parseFloat(req.query.harshTurn) || 25,  // EcoDrive: prag viraj brusc (°/s)
      geo: req.query.geo !== '0',                        // EcoDrive: geocodare adrese la Locație (implicit da); geo=0 → doar coordonate (rapid)
      geofenceId: parseInt(req.query.geofenceId) || null,
      osm: req.query.osm === '1', // Depășiri viteză: compară cu limita reală a drumului (OpenStreetMap) în loc de pragul fix
      osmOver: req.query.osmOver != null ? (parseInt(req.query.osmOver) || 0) : 20, // OSM: prag relativ (km/h peste limita drumului). Lipsă (client vechi în cache) → default recomandat +20, nu „tot"
      sampleSec: parseInt(req.query.sampleSec) || 0, // Analitic: eșantionare (1 poziție la N sec; 0 = toate)
      all: req.query.all === '1', // Scadențe: „Tot" (arată toate scadențele, fără orizont de lună)
      geoBudgetMs: 30000, // buget geocodare adrese (Analitic); mărit pe calea în fundal mai jos (job async)
      timeFilter: parseReportTimeFilter(req.query), // filtru zile/ore (cascadă) — null dacă nu e cerut
      priceByType: effectiveFuelPrices(_cs)
    };
    const _scope = req.isSuper ? null : (req.companyId != null ? req.companyId : -1);
    // ─── Generare în FUNDAL (background=1): răspundem imediat, generăm async, apoi notificăm userul ───
    // Notificarea „report_ready" ajunge în clopoțel (WS) pe web + push FCM pe APK + în lista de notificări.
    const _fmt = (req.query.format || '').toLowerCase();
    if (_fmt === 'xlsx' || _fmt === 'pdf') opts.geoBudgetMs = 60000; // export de fișier (deliberat) → buget de geocodare mai mare, ca să nu iasă coordonate amestecate cu adrese
    if (req.query.background === '1' && req.query.log === '1' && _fmt !== 'xlsx' && _fmt !== 'pdf' && req.auth && req.auth.userId) {
      res.json({ queued: true });
      opts.geoBudgetMs = 90000; // job în fundal (userul e notificat la final) → geocodăm mai multe adrese fără să blocăm o cerere sincronă
      const _type = req.params.type, _uid = req.auth.userId, _uname = req.auth.username, _cid = req.companyId != null ? req.companyId : null, _imei = req.query.imei || null;
      const _jobId = req.query.jobId ? String(req.query.jobId).slice(0, 64) : null; // corelează badge-ul din client cu notificarea de finalizare
      setImmediate(async () => {
        try {
          const report = await reports.runReport(db, _type, imeis, from, to, opts, _scope);
          const label = (req.query.label ? String(req.query.label).slice(0, 120) : null) || (reports.REPORTS[_type] && reports.REPORTS[_type].label) || _type;
          const sig = [_type, _imei || 'all', from, to, JSON.stringify({ l: opts.limit, s: opts.stopMin, r: opts.refuelMin, d: opts.dropMin, g: opts.geofenceId, sm: opts.sampleSec, o: opts.osm, oo: opts.osmOver, zm: opts.zoneMin, ha: opts.harshAccel, hb: opts.harshBrake, ht: opts.harshTurn, ge: opts.geo, tf: opts.timeFilter })].join('|').slice(0, 200);
          const saved = await db.saveReportHistory({
            company_id: _cid, user_id: _uid, username: _uname, report_type: _type, label, imei: (_imei && _imei.indexOf(',') < 0) ? _imei : null,
            vehicle_count: imeis.length, period_from: from, period_to: to, opts, data: report, signature: sig,
            expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
          });
          await notify({ type: 'report_ready', severity: 'info', title: 'Raport generat', body: '„' + label + '" e disponibil în Istoric rapoarte.', data: { historyId: saved && saved.id, reportType: _type, jobId: _jobId, key: 'report_' + (saved && saved.id) }, userId: _uid, companyId: _cid });
          // push report_ready gestionat central de notify() → _notifyPush (respectă preferințele, fără dublură)
        } catch (e) {
          try { await notify({ type: 'report_error', severity: 'warning', title: 'Raport eșuat', body: 'Generarea raportului a eșuat: ' + ((e && e.message) || e), data: { reportType: _type, jobId: _jobId }, userId: _uid, companyId: _cid }); } catch (_) {}
        }
      });
      return;
    }
    // Tenant: super → null (toate zonele, by design); non-super → compania sa. Orphan non-super (companyId null)
    // primește -1 ca să NU cadă pe „toate" (getGeofences(-1) → 0 zone), evitând scurgerea numelor de zone străine.
    const report = await reports.runReport(db, req.params.type, imeis, from, to, opts, _scope);
    const fmt = (req.query.format || '').toLowerCase();
    if (fmt === 'xlsx' || fmt === 'pdf') {
      if (!reportExport) return res.status(503).json({ error: 'Export PDF/Excel indisponibil pe server' });
      return await reportExport.sendReport(res, report, fmt);
    }
    // Istoric: salvează DOAR generările reale din UI (log=1), nu apelurile automate/agent.
    if (req.query.log === '1' && req.auth && req.auth.userId) {
      try {
        const type = req.params.type;
        const label = (req.query.label ? String(req.query.label).slice(0, 120) : null) || (reports.REPORTS[type] && reports.REPORTS[type].label) || type;
        const sig = [type, req.query.imei || 'all', from, to,
          JSON.stringify({ l: opts.limit, s: opts.stopMin, r: opts.refuelMin, d: opts.dropMin, g: opts.geofenceId, tf: opts.timeFilter })].join('|').slice(0, 200);
        await db.saveReportHistory({
          company_id: req.companyId != null ? req.companyId : null,
          user_id: req.auth.userId, username: req.auth.username,
          report_type: type, label, imei: (req.query.imei && String(req.query.imei).indexOf(',') < 0) ? req.query.imei : null,
          vehicle_count: imeis.length, period_from: from, period_to: to,
          opts, data: report, signature: sig,
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        });
      } catch (e) { /* logarea în istoric nu trebuie să rupă răspunsul raportului */ }
    }
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Statistici consum (agregat flotă + per vehicul + trend) — pentru pagina „Statistici consum".
app.get('/api/fuel-stats', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try {
    await applyCompanyFilter(req);
    let imeis = await resolveReportImeis(req);
    if (imeis === null) return res.status(403).json({ error: 'Acces interzis' });
    const gid = parseInt(req.query.groupId);
    if (Number.isFinite(gid)) {
      try { const gr = await db.pool.query('SELECT imei FROM devices WHERE group_id = $1', [gid]); const set = new Set(gr.rows.map(r => r.imei)); imeis = imeis.filter(im => set.has(im)); } catch (e) {}
    }
    const from = req.query.from || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const _cs = req.companyId != null ? await db.getCompanySettings(req.companyId).catch(function () { return null; }) : null;
    const opts = { refuelMin: parseInt(req.query.refuelMin) || 10, bucket: req.query.bucket === 'month' ? 'month' : 'day', priceByType: effectiveFuelPrices(_cs) };
    res.json(await reports.fuelStats(db, imeis, from, to, opts));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── Preț carburant: media națională auto (PretCarburant.ro) + override per companie ───
app.get('/api/fuel-prices', requireAuth, withScope, async (req, res) => {
  try {
    const cs = req.companyId != null ? await db.getCompanySettings(req.companyId).catch(function () { return null; }) : null;
    res.json({ auto: _fuelAuto || null, company: (cs && cs.fuel_prices) || {}, effective: effectiveFuelPrices(cs), source: fuelprice ? fuelprice.SOURCE : 'PretCarburant.ro' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Istoric preț carburant național (media zilnică) — pentru modulul „Preț combustibil" (trend). Date publice → doar requireAuth.
app.get('/api/fuel-price-history', requireAuth, async (req, res) => {
  try { res.json({ history: await db.getFuelPriceHistory(req.query.days || 90), source: fuelprice ? fuelprice.SOURCE : 'PretCarburant.ro' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/company/fuel-prices', requireAuth, requireFleet, withCompany, async (req, res) => {
  try {
    if (req.companyId == null) return res.status(400).json({ error: 'Super-adminul nu are companie proprie; setează prețul din fișa companiei.' });
    const b = req.body || {}, clean = {};
    ['motorina', 'benzina', 'gpl'].forEach(function (k) { if (b[k] === '' || b[k] == null) return; const v = parseFloat(b[k]); if (Number.isFinite(v) && v > 0 && v < 100) clean[k] = Math.round(v * 100) / 100; });
    await db.setCompanySettings(req.companyId, { fuel_prices: clean });
    auditReq(req, 'update', 'company-fuel-prices', req.companyId, clean);
    res.json({ ok: true, company: clean, effective: effectiveFuelPrices(await db.getCompanySettings(req.companyId)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/fuel-prices/refresh', requireAuth, requireSuperadmin, async (req, res) => {
  try { await refreshFuelPrices(); res.json({ ok: true, auto: _fuelAuto || null }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// Raportul săptămânal de flotă a fost RETRAS (2026-08-13). Nu mai există modul, rute, pagină sau
// generare automată. Rapoartele obișnuite (secțiunea Rapoarte) și cele programate acoperă nevoia.

// ─── Rapoarte programate (trimise automat pe email) ───
app.get('/api/report-schedules', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  try { res.json(await db.getReportSchedules(req.isSuper ? null : req.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
// Conturile demo nu pot programa rapoarte: câmpul „destinatari" e liber, iar trimiterea pleacă de pe SMTP-ul
// nostru — ar transforma demo-ul în releu de spam, cu reputația domeniului ratrack.ro drept garanție.
function _demoBlocked(req, res) {
  if (demoCompanyId != null && req.companyId === demoCompanyId) {
    res.status(403).json({ error: 'Indisponibil în contul demo. Scrie-ne dacă vrei o demonstrație completă.' });
    return true;
  }
  return false;
}
app.post('/api/report-schedules', requireAuth, requirePerm('viewReports'), withScope, async (req, res) => {
  if (_demoBlocked(req, res)) return;
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
    const result = await reportSchedules.runSchedule(s, { db, reports, reportExport, channels, notify }, new Date());
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
// Context eveniment: segmentul de drum + poziția + adresa unde s-a întâmplat notificarea (pt. modalul de detaliu).
app.get('/api/notifications/:id/context', requireAuth, withScope, async (req, res) => {
  try {
    const r = await db.pool.query('SELECT * FROM notifications WHERE id = $1', [parseInt(req.params.id)]);
    const n = r.rows[0];
    if (!n) return res.status(404).json({ error: 'Notificare negăsită' });
    // Poarta pe VEHICUL nu e suficientă: notificările FĂRĂ vehicul (expirare permis șofer — cu nume și
    // serie —, facturi emise, scadențe de abonament) treceau nefiltrate. Orice cont autentificat putea
    // cere /api/notifications/1/context, /2/context, … și aduna datele tuturor companiilor de pe platformă.
    // Regula de mai jos oglindește `_notifWhere` din db.js, care filtrează corect LISTA; ruta asta o ocolea.
    if (n.imei) {
      if (!canAccessImei(req, n.imei)) return res.status(403).json({ error: 'Acces interzis' });
    } else if (!req.isSuper) {
      const aMea = (n.user_id != null && Number(n.user_id) === Number(req.auth.userId));
      const aCompaniei = (n.user_id == null && n.company_id != null && Number(n.company_id) === Number(req.companyId));
      // 404, nu 403: un 403 ar confirma că notificarea EXISTĂ, deci s-ar putea număra clienții și facturile.
      if (!aMea && !aCompaniei) return res.status(404).json({ error: 'Notificare negăsită' });
    }
    const at = new Date(n.created_at).getTime();
    const out = { id: n.id, type: n.type, severity: n.severity, title: n.title, body: n.body, at: n.created_at, imei: n.imei, acknowledged: !!n.acknowledged, vehicle: null, event: null, segment: [], maxSpeed: 0, data: n.data || {} };
    if (n.imei) {
      try { const dr = await db.pool.query('SELECT name, plate FROM devices WHERE imei = $1', [n.imei]); if (dr.rows[0]) out.vehicle = dr.rows[0].name || dr.rows[0].plate || n.imei; } catch (e) {}
      const from = new Date(at - 12 * 60000).toISOString(), to = new Date(at + 12 * 60000).toISOString();
      let hist = []; try { hist = await db.getDeviceHistory(n.imei, from, to, 2000); } catch (e) {}
      let best = null, bestDt = Infinity;
      for (const p of hist) {
        if (p.latitude == null) continue;
        out.segment.push({ lat: p.latitude, lng: p.longitude, speed: Math.round(p.speed || 0), ts: p.timestamp });
        if ((p.speed || 0) > out.maxSpeed) out.maxSpeed = p.speed || 0;
        const dt = Math.abs(new Date(p.timestamp).getTime() - at);
        if (dt < bestDt) { bestDt = dt; best = p; }
      }
      out.maxSpeed = Math.round(out.maxSpeed);
      const d = n.data || {};
      let ev = null;
      if (typeof d.lat === 'number' && typeof d.lng === 'number') ev = { lat: d.lat, lng: d.lng };
      else if (typeof d.latitude === 'number' && typeof d.longitude === 'number') ev = { lat: d.latitude, lng: d.longitude };
      else if (best) ev = { lat: best.latitude, lng: best.longitude, speed: Math.round(best.speed || 0) };
      if (ev) {
        if (ev.speed == null && best) ev.speed = Math.round(best.speed || 0);
        // Adresă: din cache INSTANT (peek); altfel reverse-geocode cu plafon 2s — NU blocăm dacă coada Nominatim e plină.
        try {
          const cached = (geocode && geocode.peek) ? geocode.peek(ev.lat, ev.lng) : undefined;
          if (cached !== undefined) ev.address = cached;
          else if (geocode && geocode.reverseGeocode) ev.address = await Promise.race([geocode.reverseGeocode(ev.lat, ev.lng).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2000))]);
        } catch (e) {}
        out.event = ev;
      }
      // Ralanti: intervalul REAL al sesiunii — start din alertData (sau dedus la notificările vechi),
      // end = primul punct în mișcare DUPĂ eveniment (un query LIMIT 1, plafon +24h), altfel „încă în staționare".
      // Gate ALINIAT cu clientul: alertType SAU titlu/body cu „idl"/„ralanti" (notificările vechi n-au alertType).
      if ((n.data || {}).alertType === 'idle_engine' || /ralanti|idl/i.test((n.title || '') + ' ' + (n.body || ''))) {
        const dd = n.data || {};
        const _bodyMin = parseInt((String(n.body || '').match(/(\d+)\s*min/) || [])[1]) || 0; // vechi: minutele doar în text („staționat de ~32 min")
        const start = Number(dd.idleStart) || (at - (Number(dd.idleMinutes) || _bodyMin) * 60000);
        let end = null;
        try {
          const cap = new Date(at + 24 * 3600 * 1000).toISOString();
          const q = await db.pool.query(
            `SELECT timestamp FROM (
               SELECT timestamp FROM positions WHERE imei = $1 AND timestamp > $2 AND timestamp < $3 AND speed > 3
               UNION ALL
               SELECT timestamp FROM positions_archive WHERE imei = $1 AND timestamp > $2 AND timestamp < $3 AND speed > 3
             ) u ORDER BY timestamp ASC LIMIT 1`,
            [n.imei, new Date(at).toISOString(), cap]);
          if (q.rows[0]) end = new Date(q.rows[0].timestamp).getTime();
        } catch (e) {}
        let ongoing = false;
        if (!end) {
          const st = _alertIdleStart.get(n.imei); // sesiunea live încă activă cu (aprox.) același start
          const st2 = _idlingStart.get(n.imei);   // sesiunea RA Watch (evenimente user) — aceeași logică, alt tracker
          if (st && Math.abs(st.start - start) < 6 * 60000) ongoing = true;
          else if (st2 && Math.abs(st2 - start) < 6 * 60000) ongoing = true;
          else { // fallback după restart server: poziție proaspătă, contact pornit, pe loc
            const lp = livePositions.get(n.imei);
            const fresh = lp && lp.timestamp && (Date.now() - new Date(lp.timestamp).getTime()) < 10 * 60000;
            const ignOn = lp && lp.io && (lp.io.ignition === 1 || lp.io.ignition === true);
            if (fresh && ignOn && (Number(lp.speed) || 0) <= 3) ongoing = true;
          }
        }
        const _mins = end ? Math.max(1, Math.round((end - start) / 60000))
          : ongoing ? Math.max(1, Math.round((Date.now() - start) / 60000))
          : (Number(dd.idleMinutes) || null); // end necunoscut & nu e live → „cel puțin X min"
        // Carburant consumat pe staționare: contorul CAN cumulativ (exact) → nivelul rezervorului (aprox) → estimare ~1.5 L/h (ca în raportul Ralanti)
        let _fuelL = null, _fuelEst = false;
        try {
          const h2 = await db.getDeviceHistory(n.imei, new Date(start).toISOString(), new Date(end || Date.now()).toISOString(), 3000);
          const _io2 = (p) => { let d2 = p.io_data; if (typeof d2 === 'string') { try { d2 = JSON.parse(d2); } catch (e) { d2 = null; } } return d2 || {}; };
          const _lvl = (p) => { const i = _io2(p); const v = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; };
          const _cum = (p) => { const i = _io2(p); const v = i.can_fuel_consumed; return (typeof v === 'number' && v > 0) ? v : null; };
          const cums = h2.map(_cum).filter(v => v != null);
          if (cums.length >= 2 && cums[cums.length - 1] >= cums[0]) _fuelL = cums[cums.length - 1] - cums[0];
          else {
            const lvls = h2.map(_lvl).filter(v => v != null);
            if (lvls.length >= 2 && lvls[0] - lvls[lvls.length - 1] >= 0.2) _fuelL = lvls[0] - lvls[lvls.length - 1];
          }
        } catch (e) {}
        if (_fuelL == null && _mins) { _fuelL = _mins / 60 * 1.5; _fuelEst = true; }
        out.idle = {
          start: new Date(start).toISOString(),
          end: end ? new Date(end).toISOString() : null,
          ongoing: ongoing,
          minutes: _mins,
          fuelL: _fuelL != null ? Math.round(_fuelL * 10) / 10 : null,
          fuelEstimated: _fuelEst,
        };
      }
      // Scădere/furt combustibil: de la X L → la Y L + cantitatea (din alertData; la notificările vechi, parsat din text)
      if ((n.data || {}).alertType === 'fuel_theft' || (n.data || {}).alertType === 'fuel_drop'
        || /scădere\s*(?:combustibil\s*)?[\d.,]+\s*l\b/i.test(String(n.body || ''))) {
        const dd = n.data || {};
        let fromL = Number(dd.fromL), toL = Number(dd.toL), drop = Number(dd.drop);
        // Alerta configurabilă „fuel_drop" (evaluateAlerts) salvează nivelurile ca previousLevel/currentLevel, nu fromL/toL.
        if (!Number.isFinite(fromL) && Number.isFinite(Number(dd.previousLevel))) fromL = Number(dd.previousLevel);
        if (!Number.isFinite(toL) && Number.isFinite(Number(dd.currentLevel))) toL = Number(dd.currentLevel);
        const _b = String(n.body || '');
        if (!Number.isFinite(fromL) || !Number.isFinite(toL)) {
          const m = _b.match(/de la\s*([\d.,]+)\s*l\s*la\s*([\d.,]+)\s*l/i) || _b.match(/\(\s*([\d.,]+)\s*→\s*([\d.,]+)\s*l\s*\)/i);
          if (m) { fromL = parseFloat(m[1].replace(',', '.')); toL = parseFloat(m[2].replace(',', '.')); }
        }
        if (!Number.isFinite(drop)) { const m = _b.match(/scădere\s*(?:combustibil\s*)?([\d.,]+)\s*l/i); if (m) drop = parseFloat(m[1].replace(',', '.')); }
        if (!Number.isFinite(drop) && Number.isFinite(fromL) && Number.isFinite(toL)) drop = fromL - toL;
        if (Number.isFinite(drop) || Number.isFinite(fromL)) {
          out.fuel = {
            fromL: Number.isFinite(fromL) ? Math.round(fromL * 10) / 10 : null,
            toL: Number.isFinite(toL) ? Math.round(toL * 10) / 10 : null,
            drop: Number.isFinite(drop) ? Math.round(drop * 10) / 10 : null,
            mode: dd.mode || null,
          };
        }
      }
    }

    // Zona (geofence) la care se referă alerta. Fără geometria ei, harta arăta un traseu oarecare,
    // iar întrebarea firească — „unde e zona și pe unde a intrat?" — rămânea fără răspuns.
    // Motorul de alerte pune deja `geofenceId` în notificare; aici aducem forma propriu-zisă.
    try {
      const gid = (n.data || {}).geofenceId;
      if (gid != null) {
        const gr = await db.pool.query('SELECT id, name, type, coordinates, color FROM geofences WHERE id = $1', [gid]);
        const g = gr.rows[0];
        if (g) {
          const coord = typeof g.coordinates === 'string' ? (function () { try { return JSON.parse(g.coordinates); } catch (e) { return null; } })() : g.coordinates;
          out.geofence = { id: g.id, name: g.name, type: g.type, color: g.color || null, coordinates: coord };
        }
      }
    } catch (e) { /* zona ștearsă între timp → harta cade elegant pe punctul evenimentului */ }

    // Scadențe: notificarea spune „ITP expiră în 5 zile", dar modalul nu spunea CARE act, cu ce număr,
    // de la cine și dacă avem scanul lui. Aici aducem rândul propriu-zis — și îl recalculăm la ZIUA DE
    // AZI, nu la ziua în care s-a trimis notificarea (o notificare de acum două săptămâni spunea „mai
    // ai 30 de zile" când, de fapt, mai erau 16).
    try {
      const dd = n.data || {};
      const _zile = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
      if (dd.docId != null) {
        const q = await db.pool.query('SELECT * FROM vehicle_documents WHERE id = $1', [dd.docId]);
        const doc = q.rows[0];
        // Actul poate fi al altei companii doar dacă notificarea a fost greșit legată; verificăm oricum.
        const vizibil = doc && (req.isSuper || req.companyId == null || doc.company_id == null || Number(doc.company_id) === Number(req.companyId));
        if (vizibil) {
          let veh = null;
          if (doc.imei) { try { const vr = await db.pool.query('SELECT name, plate FROM devices WHERE imei = $1', [doc.imei]); if (vr.rows[0]) veh = [vr.rows[0].name, vr.rows[0].plate].filter(Boolean).join(' · '); } catch (e) {} }
          out.document = {
            id: doc.id, docType: doc.doc_type, number: doc.number || null, issuer: doc.issuer || null,
            issueDate: doc.issue_date || null, expiryDate: doc.expiry_date || null,
            cost: doc.cost != null ? Number(doc.cost) : null,
            days: doc.expiry_date ? _zile(doc.expiry_date) : null,
            imei: doc.imei || null, vehicle: veh,
            // Scanul actului: îl anunțăm, nu-l trimitem — poate avea sute de KB, iar modalul îl cere
            // separat doar dacă omul apasă „Vezi actul".
            hasFile: !!doc.file_b64, fileName: doc.file_name || null, fileMime: doc.file_mime || null,
          };
        }
      } else if (dd.driverId != null) {
        const q = await db.pool.query('SELECT id, name, license_number, license_expiry, phone, company_id FROM drivers WHERE id = $1', [dd.driverId]);
        const dr2 = q.rows[0];
        if (dr2 && (req.isSuper || req.companyId == null || dr2.company_id == null || Number(dr2.company_id) === Number(req.companyId))) {
          out.driverDoc = {
            id: dr2.id, name: dr2.name, number: dr2.license_number || null, phone: dr2.phone || null,
            expiryDate: dr2.license_expiry || null,
            days: dr2.license_expiry ? _zile(dr2.license_expiry) : null,
          };
        }
      } else if (String(dd.key || '').startsWith('vdoc-nodate-')) {
        // Rezumatul săptămânal „acte fără dată de expirare": lista efectivă, ca omul să știe pe care
        // să le completeze. Fără ea, notificarea spunea un număr și trimitea la căutat prin flotă.
        const cid = Number(String(dd.key).replace('vdoc-nodate-', ''));
        if (req.isSuper || req.companyId == null || Number(req.companyId) === cid) {
          const q = await db.pool.query(
            `SELECT vd.id, vd.doc_type, vd.imei, vd.number, d.name, d.plate
               FROM vehicle_documents vd LEFT JOIN devices d ON d.imei = vd.imei
              WHERE vd.company_id = $1 AND vd.expiry_date IS NULL AND vd.replaced_at IS NULL
              ORDER BY vd.doc_type LIMIT 60`, [cid]);
          out.documentsFaraData = q.rows.map(r => ({
            id: r.id, docType: r.doc_type, number: r.number || null, imei: r.imei || null,
            vehicle: [r.name, r.plate].filter(Boolean).join(' · ') || null,
          }));
        }
      }
    } catch (e) { /* act șters între timp → modalul rămâne pe text, fără detalii */ }

    // Tensiune scăzută: valoarea măsurată, ca să nu fie nevoie s-o citească din titlu.
    if ((n.data || {}).alertType === 'low_voltage' || /tensiune/i.test(String(n.title || ''))) {
      const dd = n.data || {};
      let v = Number(dd.voltage);
      if (!Number.isFinite(v)) { const m = String(n.body || n.title || '').match(/([\d.,]+)\s*V\b/i); if (m) v = parseFloat(m[1].replace(',', '.')); }
      if (Number.isFinite(v)) out.voltage = Math.round(v * 10) / 10;
    }
    res.json(out);
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
// Ultimele două nu sunt preferințe de afișare, ci „compania asta folosește funcția X": ascund file
// întregi din fișa vehiculului pentru clienții care nu au sonde de combustibil sau nu au camioane.
const UI_PREF_KEYS = ['overspeed_heatmap', 'replay_marker', 'geocoded_address', 'show_driver_names', 'tab_camion', 'tab_sonde'];
const UI_PREF_DEFAULTS = { overspeed_heatmap: true, replay_marker: true, geocoded_address: true, show_driver_names: true, tab_camion: true, tab_sonde: true };
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
    if (a.companyId == null) return res.json({ ui_defaults: {}, alert_thresholds: await _getGlobalAlertThresholds() }); // super-admin fără companie → praguri globale (platformă)
    const s = await db.getCompanySettings(a.companyId);
    res.json({ ui_defaults: _filterUiKeys(s.ui_defaults || {}), alert_thresholds: s.alert_thresholds || {}, enabled_agents: Array.isArray(s.enabled_agents) ? s.enabled_agents : null, features: s.features || {}, work_schedule: s.work_schedule || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/companies/me/settings', requireAuth, requirePerm('manageUsers'), async (req, res) => {
  try {
    const a = getAuth(req);
    if (a.companyId == null) {
      // Super-adminul nu are companie proprie → pragurile agenților se salvează GLOBAL (bază pentru toate companiile).
      if (req.body && req.body.alert_thresholds && typeof req.body.alert_thresholds === 'object') {
        const merged = _mergeAlertThresholds(await _getGlobalAlertThresholds(), req.body.alert_thresholds);
        await db.setSetting('alert_thresholds_global', JSON.stringify(merged));
        auditReq(req, 'update', 'alert_thresholds_global', null, { keys: Object.keys(req.body.alert_thresholds) });
        return res.json({ ok: true, alert_thresholds: merged });
      }
      return res.status(400).json({ error: 'Super-adminul nu are companie proprie' });
    }
    const next = await _applyCompanySettingsPatch(a.companyId, req.body || {});
    if (req.body && req.body.work_schedule !== undefined) loadWorkSchedules().catch(() => {}); // refresh cache detecție
    auditReq(req, 'update', 'company_settings', a.companyId, { keys: Object.keys(req.body || {}) });
    res.json({ ok: true, ui_defaults: next.ui_defaults, enabled_agents: next.enabled_agents, alert_thresholds: next.alert_thresholds || {}, work_schedule: next.work_schedule || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Program de lucru — override pe VEHICUL (admin companie / super). null = revine la programul grupului/companiei.
app.put('/api/devices/:imei/work-schedule', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const imei = String(req.params.imei);
    const dev = await db.getDeviceFull(imei); if (!dev) return res.status(404).json({ error: 'Vehicul inexistent' });
    if (!req.isSuper && dev.company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    const w = (req.body && req.body.work_schedule === null) ? null : (workSched ? workSched.sanitize(req.body && req.body.work_schedule) : null);
    await db.pool.query('UPDATE devices SET work_schedule = $2::jsonb WHERE imei = $1', [imei, w ? JSON.stringify(w) : null]);
    loadWorkSchedules().catch(() => {});
    auditReq(req, 'work-schedule', 'device', imei, {});
    res.json({ ok: true, work_schedule: w });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Semnalare „problemă la montaj" pe vehicul — set / anulare (reversibilă).
app.put('/api/devices/:imei/install-issue', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const imei = String(req.params.imei);
    const dev = await db.getDeviceFull(imei); if (!dev) return res.status(404).json({ error: 'Vehicul inexistent' });
    if (!req.isSuper && dev.company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    const flagged = !!(req.body && req.body.flagged);
    const issue = flagged
      ? { note: (typeof req.body.note === 'string' && req.body.note.trim()) ? req.body.note.trim().slice(0, 300) : null, at: Date.now(), by: (req.session && req.session.username) || null }
      : null;
    await db.pool.query('UPDATE devices SET install_issue = $2::jsonb WHERE imei = $1', [imei, issue ? JSON.stringify(issue) : null]);
    auditReq(req, flagged ? 'install-issue-flag' : 'install-issue-clear', 'device', imei, {});
    res.json({ ok: true, install_issue: issue });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Program de lucru — override pe GRUP.
app.put('/api/device-groups/:id/work-schedule', requireAuth, requireFleet, withScope, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.isSuper) { const g = await db.pool.query('SELECT company_id FROM device_groups WHERE id=$1', [id]); if (!g.rows[0] || g.rows[0].company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' }); }
    const w = (req.body && req.body.work_schedule === null) ? null : (workSched ? workSched.sanitize(req.body && req.body.work_schedule) : null);
    await db.pool.query('UPDATE device_groups SET work_schedule = $2::jsonb WHERE id = $1', [id, w ? JSON.stringify(w) : null]);
    loadWorkSchedules().catch(() => {});
    auditReq(req, 'work-schedule', 'device_group', id, {});
    res.json({ ok: true, work_schedule: w });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Helper centralizat ca să gestionez și enabled_agents (whitelist pe cheia validă), nu doar ui_defaults
async function _applyCompanySettingsPatch(companyId, body, opts) {
  const cur = await db.getCompanySettings(companyId);
  const next = Object.assign({}, cur);
  if (body.ui_defaults && typeof body.ui_defaults === 'object') {
    next.ui_defaults = Object.assign({}, cur.ui_defaults || {}, _filterUiKeys(body.ui_defaults));
  }
  if (opts && opts.allowAgents) { // enabled_agents = funcție cu PLATĂ → DOAR super-admin; company_admin NU-și poate auto-activa agenții
    if (Array.isArray(body.enabled_agents)) {
      const valid = (plans && plans.ALL_AGENT_KEYS) || [];
      next.enabled_agents = body.enabled_agents.filter(k => typeof k === 'string' && valid.indexOf(k) >= 0);
    } else if (body.enabled_agents === null) {
      delete next.enabled_agents; // null = revino la default-ul planului
    }
  }
  if (body.features && typeof body.features === 'object' && opts && opts.allowFeatures) { // features (plan/billing) = STRICT super-admin; company_admin nu și le poate auto-activa
    const fvalid = (plans && plans.FEATURE_KEYS) || [];
    const f = Object.assign({}, cur.features || {});
    fvalid.forEach(function (k) { if (typeof body.features[k] === 'boolean') f[k] = body.features[k]; });
    next.features = f;
  }
  // Cota AI (comercial: se negociază în ofertă) → STRICT super-admin, ca și `features`.
  if (body.ai_quota && typeof body.ai_quota === 'object' && opts && opts.allowFeatures) {
    const q = Object.assign({}, cur.ai_quota || {});
    const n = Number(body.ai_quota.questions);
    if (Number.isFinite(n) && n >= 0 && n <= 100000) q.questions = Math.round(n);
    if (typeof body.ai_quota.overage === 'boolean') q.overage = body.ai_quota.overage;
    const p = Number(body.ai_quota.overagePriceEur);
    if (Number.isFinite(p) && p >= 0 && p <= 100) q.overagePriceEur = Math.round(p * 100) / 100;
    next.ai_quota = q;
  } else if (body.ai_quota === null && opts && opts.allowFeatures) {
    delete next.ai_quota; // fără cotă = nelimitat
  }
  // Praguri alertă (RA Watch + RA Optimize + RA Care). Whitelist + clamping per cheie (SPECS canonice — vezi sus).
  if (body.alert_thresholds && typeof body.alert_thresholds === 'object') {
    next.alert_thresholds = _mergeAlertThresholds(cur.alert_thresholds, body.alert_thresholds);
  } else if (body.alert_thresholds === null) {
    delete next.alert_thresholds;
  }
  // Program de lucru (supraveghere „mișcare în afara programului"). Admin-ul companiei îl setează pentru flota lui.
  if (body.work_schedule !== undefined) {
    if (body.work_schedule === null) delete next.work_schedule;
    else if (workSched) { const w = workSched.sanitize(body.work_schedule); if (w) next.work_schedule = w; }
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
    res.json({ ui_defaults: _filterUiKeys(s.ui_defaults || {}), enabled_agents: Array.isArray(s.enabled_agents) ? s.enabled_agents : null, plan_defaults: planAgents, plan: co.plan, alert_thresholds: s.alert_thresholds || {}, features: plans ? plans.featuresFor(co) : (s.features || {}), name: co.name, is_demo: !!co.is_demo, ai_monthly_limit: (co.ai_monthly_limit != null ? Number(co.ai_monthly_limit) : null), ai_quota: _aiQuotaFromSettings(co.settings) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/companies/:id/settings', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const next = await _applyCompanySettingsPatch(id, req.body || {}, { allowFeatures: true, allowAgents: true }); // super-admin poate seta features (plan/billing) + agenți (funcție cu plată)
    auditReq(req, 'update', 'company_settings', id, { keys: Object.keys(req.body || {}) });
    res.json({ ok: true, ui_defaults: next.ui_defaults, enabled_agents: next.enabled_agents, alert_thresholds: next.alert_thresholds || {}, ai_quota: next.ai_quota || null });
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
    await _applyCompanySettingsPatch(id, { features: (req.body && req.body.features) || {} }, { allowFeatures: true });
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
// Facturare (super-admin): toate plățile + numele companiei + total încasat.
app.get('/api/payments', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    res.json(await db.getAllPayments(parseInt(req.query.limit) || 500));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── Facturi FISCALE (super-admin): generare din abonament (linii + TVA), emitere numerotată, plată/anulare ───
const INV_SERIES = (process.env.INVOICE_SERIES || 'RAT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'RAT';
function _issuerVatRate(iss) { const v = parseFloat(iss && iss.vat_rate); return (Number.isFinite(v) && v >= 0 && v <= 100) ? v : 19; }
// Clasifică vehiculele companiei în {none, can, fms} pentru facturare (aceeași logică ca /overview: bill_can/override).
async function _companyBillCounts(company) {
  const devices = await db.getDevices(company.id);
  const offer = plans ? plans.effectivePlan(company) : null;
  const canSet = (offer && Array.isArray(offer.canImeis)) ? new Set(offer.canImeis) : null;
  let none = 0, can = 0, fms = 0;
  (devices || []).filter(d => d.status !== 'archived').forEach(d => {
    const ct = classifyDeviceCan(d);
    if (ct === 'fms') fms++;
    else if (canSet ? canSet.has(d.imei) : (ct !== 'none')) can++;
    else none++;
  });
  return { none, can, fms };
}
// Construiește liniile de factură din motorul de preț (plans.computeCompanyPrice → breakdown) + TVA per linie.
function buildInvoiceLines(company, billCounts, features, vatRatePct) {
  const p = plans ? plans.computeCompanyPrice(company, billCounts, { features }) : { model: 'preset', monthlyTotal: 0, breakdown: { counts: billCounts } };
  const bd = p.breakdown || {}; const cnt = bd.counts || billCounts || {};
  const vr = Number(vatRatePct) || 0; const lines = [];
  const add = (desc, qty, total) => {
    total = Math.round((Number(total) || 0) * 100) / 100;
    if (!(total > 0)) return;
    const q = qty > 0 ? qty : 1;
    const unit = Math.round((total / q) * 100) / 100;
    const vat = Math.round(total * vr) / 100;
    lines.push({ desc, qty: q, unitPrice: unit, vatRate: vr, net: total, vat, gross: Math.round((total + vat) * 100) / 100 });
  };
  if (p.model === 'direct') {
    add('Abonament monitorizare GPS (fără CAN)', cnt.none, bd.base);
    add('Abonament monitorizare GPS cu CAN', cnt.can, bd.canAddon);
    add('Abonament monitorizare GPS + FMS/tahograf', cnt.fms, bd.fmsAddon);
  } else if (p.model === 'tiered') {
    add('Abonament monitorizare GPS — bază/vehicul', cnt.total, bd.base);
    add('Supliment CAN', cnt.can, bd.canAddon);
    add('Supliment FMS/tahograf', cnt.fms, bd.fmsAddon);
  } else if (p.model === 'flat') {
    add('Abonament monitorizare flotă GPS', 1, bd.base);
  } else {
    add('Abonament monitorizare GPS', cnt.total, bd.base);
  }
  add('Asistent AI', 1, bd.aiAssistant);
  add('Agenți AI (monitorizare inteligentă)', 1, bd.aiAgents);
  if (!lines.length && (p.monthlyTotal > 0)) add('Abonament monitorizare GPS', 1, p.monthlyTotal);
  const subtotal = Math.round(lines.reduce((s, l) => s + l.net, 0) * 100) / 100;
  const vatAmount = Math.round(lines.reduce((s, l) => s + l.vat, 0) * 100) / 100;
  return { lines, subtotal, vatAmount, total: Math.round((subtotal + vatAmount) * 100) / 100, model: p.model };
}
function _clientSnapshot(co) {
  return { name: co.name || null, cui: co.cui || null, reg_com: co.reg_com || null, address: co.address || null, iban: co.iban || null, email: co.contact_email || null, phone: co.phone || null, vat_payer: co.vat_payer !== false };
}
app.get('/api/invoices', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const rows = await db.getInvoices({ companyId: req.query.company_id ? parseInt(req.query.company_id) : null, status: req.query.status || null, limit: parseInt(req.query.limit) || 500 });
    res.json({ invoices: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/invoices/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try { const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' }); res.json(inv); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
// Draft: calculează liniile pt. companie + perioadă FĂRĂ a salva/numerota (admin revizuiește, apoi emite).
app.post('/api/invoices/draft', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.body && req.body.companyId); if (!Number.isFinite(id)) return res.status(400).json({ error: 'companyId invalid' });
    const co = await db.getCompanyById(id); if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const iss = ((await getSystemSettings()).invoice_issuer) || {};
    const vatRate = _issuerVatRate(iss);
    const billCounts = await _companyBillCounts(co);
    const calc = buildInvoiceLines(co, billCounts, plans ? plans.featuresFor(co) : {}, vatRate);
    res.json({ company: { id: co.id, name: co.name }, client: _clientSnapshot(co), issuer: iss, vatRate, billCounts, model: calc.model, lines: calc.lines, subtotal: calc.subtotal, vatAmount: calc.vatAmount, total: calc.total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Emite factura (numerotare ATOMICĂ + snapshot emitent/client). Body: { companyId, periodStart, periodEnd, lines[], note }
app.post('/api/invoices', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = req.body || {};
    const id = parseInt(b.companyId); if (!Number.isFinite(id)) return res.status(400).json({ error: 'companyId invalid' });
    const co = await db.getCompanyById(id); if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const iss = ((await getSystemSettings()).invoice_issuer) || {};
    if (!iss.name || !iss.cui) return res.status(400).json({ error: 'Completează întâi „Date emitent" (nume + CUI) — sunt obligatorii pe factură.' });
    const vr = _issuerVatRate(iss);
    let calc;
    if (Array.isArray(b.lines) && b.lines.length) { // linii revizuite de admin
      const norm = b.lines.map(l => {
        const qty = Math.max(0, Number(l.qty) || 0), unit = Math.round((Number(l.unitPrice) || 0) * 100) / 100;
        const net = Math.round(qty * unit * 100) / 100;
        const vrate = (l.vatRate != null ? Number(l.vatRate) : vr);
        const vat = Math.round(net * vrate) / 100;
        return { desc: String(l.desc || '').slice(0, 200), qty, unitPrice: unit, vatRate: vrate, net, vat, gross: Math.round((net + vat) * 100) / 100 };
      }).filter(l => l.desc && l.qty > 0);
      const subtotal = Math.round(norm.reduce((s, l) => s + l.net, 0) * 100) / 100;
      const vatAmount = Math.round(norm.reduce((s, l) => s + l.vat, 0) * 100) / 100;
      calc = { lines: norm, subtotal, vatAmount, total: Math.round((subtotal + vatAmount) * 100) / 100 };
    } else {
      calc = buildInvoiceLines(co, await _companyBillCounts(co), plans ? plans.featuresFor(co) : {}, vr);
    }
    if (!calc.lines.length || calc.total <= 0) return res.status(400).json({ error: 'Factura nu are linii/valoare — verifică abonamentul companiei.' });
    const now = Date.now(); const year = new Date(now).getFullYear();
    const num = await db.nextInvoiceNumber(INV_SERIES, year);
    const periodStart = b.periodStart ? Number(b.periodStart) : now;
    const periodEnd = b.periodEnd ? Number(b.periodEnd) : _addMonthsMs(periodStart, 1);
    const termDays = Math.max(0, parseInt(co.payment_term_days) || 15);
    const inv = await db.createInvoice({
      companyId: id, series: num.series, number: num.number, year: num.year, fullNumber: num.full,
      type: 'invoice', status: 'issued', issueDate: now, dueDate: now + termDays * 86400000, periodStart, periodEnd, currency: 'RON',
      subtotal: calc.subtotal, vatAmount: calc.vatAmount, total: calc.total, lines: calc.lines,
      issuer: iss, client: _clientSnapshot(co), note: (b.note || null), createdBy: req.auth && req.auth.userId
    });
    auditReq(req, 'issue', 'invoice', inv.id, { full: num.full, company: id, total: calc.total });
    res.json({ ok: true, invoice: inv });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Stare factură: 'paid' (înregistrează plata + extinde accesul) | 'canceled'
app.put('/api/invoices/:id/status', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' });
    const status = String((req.body && req.body.status) || '').toLowerCase();
    if (status === 'canceled') {
      if (inv.status === 'paid') return res.status(400).json({ error: 'Factura e plătită — folosește storno, nu anulare.' });
      await db.updateInvoice(inv.id, { status: 'canceled' });
      auditReq(req, 'cancel', 'invoice', inv.id, {}); return res.json({ ok: true });
    }
    if (status === 'paid') {
      if (inv.status === 'paid') return res.json({ ok: true, already: true });
      const method = (req.body && req.body.method) || 'transfer';
      const pay = await db.recordPayment({ companyId: inv.company_id, amountRon: Number(inv.total) || null, periodStart: inv.period_start, periodEnd: inv.period_end, method, note: 'Factură ' + inv.full_number, createdBy: req.auth && req.auth.userId });
      await db.updateInvoice(inv.id, { status: 'paid', paidAt: Date.now(), paymentId: pay.id });
      _invalidateAccessCache(inv.company_id);
      auditReq(req, 'paid', 'invoice', inv.id, { paymentId: pay.id }); return res.json({ ok: true, payment: pay });
    }
    return res.status(400).json({ error: 'Stare necunoscută (paid|canceled)' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── e-Factura ANAF (super-admin): config + preview UBL + trimitere SPV + status. Dormant fără ANAF_EFACTURA_TOKEN. ───
app.get('/api/efactura/config', requireAuth, requireSuperadmin, (req, res) => {
  try { const c = efactura ? efactura.cfg() : { cif: null, test: true }; res.json({ enabled: !!(efactura && efactura.enabled()), test: c.test, cif: c.cif || null }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/invoices/:id/efactura/xml', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    if (!efactura) return res.status(503).json({ error: 'Modul e-Factura indisponibil' });
    const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="' + (inv.full_number || 'factura') + '.xml"');
    res.send(efactura.buildUBL(inv));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/invoices/:id/efactura', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    if (!efactura) return res.status(503).json({ error: 'Modul e-Factura indisponibil' });
    const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' });
    if (inv.status === 'canceled') return res.status(400).json({ error: 'Factură anulată' });
    if (!efactura.enabled()) return res.status(400).json({ error: 'e-Factura e dormantă — setează ANAF_EFACTURA_TOKEN + ANAF_CIF pe server.' });
    const r = await efactura.uploadInvoice(inv, {});
    if (!r.ok) { await db.updateInvoice(inv.id, { efacturaStatus: 'error', efacturaError: String(r.error || '').slice(0, 500) }); return res.status(400).json({ error: r.error || 'Trimitere eșuată', raw: r.raw }); }
    await db.updateInvoice(inv.id, { efacturaStatus: 'uploaded', efacturaId: r.index, efacturaError: null });
    auditReq(req, 'efactura-send', 'invoice', inv.id, { index: r.index });
    res.json({ ok: true, index: r.index });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/invoices/:id/efactura/status', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    if (!efactura) return res.status(503).json({ error: 'Modul e-Factura indisponibil' });
    const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' });
    if (!inv.efactura_id) return res.json({ ok: true, status: inv.efactura_status || null, note: 'Nu a fost trimisă încă.' });
    const r = await efactura.checkStatus(inv.efactura_id, {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    let st = 'uploaded';
    if (/^ok$/i.test(r.stare || '')) st = 'validated';
    else if (/nok/i.test(r.stare || '')) st = 'error';
    await db.updateInvoice(inv.id, { efacturaStatus: st, efacturaError: (st === 'error' ? (r.stare || 'nok') : null) });
    res.json({ ok: true, stare: r.stare, status: st, idDescarcare: r.idDescarcare });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Link de plată cu CARDUL (Stripe, one-time) pentru o factură. Super-admin (generează link de trimis) SAU client (propria factură).
// requirePerm: doar administratorii companiei — un `viewer` nu are ce căuta în fluxul de plată.
app.post('/api/invoices/:id/pay-link', requireAuth, requirePerm('manageUsers'), withCompany, async (req, res) => {
  try {
    if (!(billing && billing.enabled())) return res.status(503).json({ error: 'Plata cu cardul nu e configurată (STRIPE_SECRET_KEY).' });
    const inv = await db.getInvoice(parseInt(req.params.id)); if (!inv) return res.status(404).json({ error: 'Factură inexistentă' });
    if (!req.isSuper && inv.company_id !== req.companyId) return res.status(403).json({ error: 'Acces interzis' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Factura e deja plătită' });
    if (inv.status === 'canceled') return res.status(400).json({ error: 'Factură anulată' });
    const co = await db.getCompanyById(inv.company_id);
    const base = appBaseUrl(req);
    const sess = await billing.createInvoiceCheckout({ invoice: inv, customerEmail: (co && co.contact_email) || null, successUrl: base + '/app?pay=success', cancelUrl: base + '/app?pay=cancel' });
    auditReq(req, 'pay-link', 'invoice', inv.id, { total: inv.total });
    res.json({ url: sess.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ─── Control costuri (cheltuielile NOASTRE de platformă) — STRICT super-admin ───
// ─── Backup date business (super-admin) — vezi backup.js + restore-backup.js ───
app.get('/api/admin/backup/status', requireAuth, requireSuperadmin, (req, res) => { res.json(backup.getStatus()); });

// ─── Stare producție (super-admin) ────────────────────────────────────────────────────────────────
// Multe lucruri critice depind de variabile de mediu setate în Railway și, până acum, singurul mod de a
// ști dacă sunt puse era să te uiți în panoul Railway (invizibil din aplicație). Aici răspundem la
// întrebarea „ce e configurat ACUM pe serverul care rulează", cu verdicte, nu cu valori:
// NU întoarcem NICIODATĂ conținutul variabilelor (chei, parole, DSN) — doar dacă sunt setate.
app.get('/api/admin/health', requireAuth, requireSuperadmin, async (req, res) => {
  const isSet = (v) => !!(v && String(v).trim());
  let dbOk = false, poolStats = null, demoLeft = null;
  try { await db.pool.query('SELECT 1'); dbOk = true; } catch (e) {}
  try { poolStats = { total: db.pool.totalCount, idle: db.pool.idleCount, waiting: db.pool.waitingCount }; } catch (e) {}
  try { demoLeft = (await db.pool.query("SELECT COUNT(*)::int AS n FROM companies WHERE slug = 'demo' OR is_demo = TRUE")).rows[0].n; } catch (e) {}
  const ts = (typeof db.getTimescaleStatus === 'function') ? db.getTimescaleStatus() : null;
  const bk = backup.getStatus();

  // „checks" = lista care înlocuiește verificarea manuală din Railway. level: ok | warn | crit | info
  const checks = [];
  const add = (key, label, level, detail) => checks.push({ key, label, level, detail });

  // PGlite scrie în directorul containerului. Pe Railway acel disc e EFEMER: la fiecare redeploy se pierd
  // companiile, utilizatorii, vehiculele, plățile. Verdictul „ok" pe PGlite era cel mai periculos verde
  // posibil — arăta bine exact în scenariul în care pierzi tot. Local (dev) rămâne normal.
  const _onPlatform = !!(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_PROJECT_ID || process.env.NODE_ENV === 'production');
  if (!dbOk) add('db', 'Bază de date', 'crit', 'inaccesibilă');
  else if (process.env.DATABASE_URL) add('db', 'Bază de date', 'ok', 'PostgreSQL (persistent)');
  else if (_onPlatform) add('db', 'Bază de date', 'crit', 'rulează pe PGlite, în containerul aplicației: discul e EFEMER, deci TOATE datele (companii, utilizatori, vehicule, plăți) se pierd la următorul redeploy. Setează DATABASE_URL în Railway.');
  else add('db', 'Bază de date', 'info', 'PGlite local (dezvoltare) — normal pe calculatorul tău, inacceptabil pe server');

  // Cea mai scumpă pană posibilă e tăcută: trackerele nu mai trimit, dar aplicația arată perfect.
  // Ne uităm la cea mai recentă poziție din memoria live — dacă flota are vehicule dar nimeni n-a transmis
  // de mult, e o problemă de ingest (port TCP, SIM, alimentare), nu de interfață.
  try {
    let newest = 0, live = 0;
    for (const [, p] of livePositions) { const t = new Date(p.timestamp).getTime(); if (Number.isFinite(t)) { live++; if (t > newest) newest = t; } }
    const totalDev = (await db.pool.query("SELECT COUNT(*)::int AS n FROM devices WHERE status IS DISTINCT FROM 'archived'")).rows[0].n;
    if (!totalDev) add('ingest', 'Recepție poziții GPS', 'info', 'niciun vehicul înregistrat încă');
    else if (!newest) add('ingest', 'Recepție poziții GPS', 'crit', totalDev + ' vehicule înregistrate, dar NICIO poziție primită de la pornirea serverului. Verifică portul TCP (' + TCP_PORT + ') și configurarea trackerelor.');
    else {
      const minutes = Math.round((Date.now() - newest) / 60000);
      const lvl = minutes > 60 ? 'crit' : (minutes > 15 ? 'warn' : 'ok');
      add('ingest', 'Recepție poziții GPS', lvl, live + ' din ' + totalDev + ' vehicule transmit · ultima poziție acum ' + (minutes < 1 ? 'sub un minut' : minutes + ' min')
        + (lvl === 'ok' ? '' : ' → verifică portul TCP, SIM-urile sau alimentarea'));
    }
  } catch (e) {}

  // Contul „admin" se creează la primul boot cu parola din ADMIN_PASSWORD, altfel cu una IMPLICITĂ, publică.
  // Verificăm efectiv hash-ul din DB — nu prezența variabilei (care poate fi adăugată după ce contul există).
  try {
    const _a = await db.getUserByUsername('admin');
    if (_a && _a.password_hash) {
      const _weak = await bcrypt.compare('admin123', _a.password_hash);
      // NU scriem parola în răspuns: ecranul ăsta ajunge în capturi de ecran și în bug reports.
      add('admin_password', 'Parola contului „admin"', _weak ? 'crit' : 'ok',
        _weak ? 'este ÎNCĂ parola implicită de instalare, cunoscută public (vezi DEPLOY_RAILWAY.md). Schimb-o acum: setează ADMIN_PASSWORD, redeploy, apoi ȘTERGE variabila — altfel parola se resetează din ea la fiecare pornire.'
              : 'schimbată față de cea implicită');
    }
  } catch (e) {}

  // Retenția pozițiilor are DOUĂ căi: politica TimescaleDB (dacă extensia există) SAU ștergerea de rezervă
  // din server.js — dar aceasta din urmă rulează NUMAI dacă POSITION_RETENTION_DAYS e setat explicit
  // (nu are valoare implicită). Fără niciuna, `positions` crește la nesfârșit. Raportăm separat de compresie.
  const _posRet = parseInt(process.env.POSITION_RETENTION_DAYS);
  const _fallbackArmed = Number.isFinite(_posRet) && _posRet > 0;
  if (ts && ts.usePg) {
    add('timescale', 'TimescaleDB (compresie poziții)', ts.enabled ? 'ok' : 'warn',
      ts.enabled ? ('activ · compresie după ' + ts.compressAfterDays + ' zile')
                 : ('INACTIV → pozițiile se stochează NECOMPRIMAT (Timescale comprimă ~85-90%): costul de storage crește pe măsură ce adaugi vehicule. Motiv: ' + (ts.reason || 'necunoscut') + '. Remediu: mută baza pe un Postgres cu TimescaleDB (ex. Timescale Cloud).'));
    const retOk = ts.enabled || _fallbackArmed;
    add('retention', 'Ștergerea automată a pozițiilor vechi', retOk ? 'ok' : 'crit',
      ts.enabled ? ('politică TimescaleDB · ' + ts.retentionDays + ' zile')
        : (_fallbackArmed ? ('ștergere de rezervă activă · ' + _posRet + ' zile, pe loturi, la 6 ore · ' + _retentionSummary())
          : 'NIMIC nu șterge pozițiile vechi: Timescale e inactiv, iar POSITION_RETENTION_DAYS nu e setat → tabela `positions` crește la nesfârșit, iar „180 zile istoric" din materiale nu se respectă. Remediu imediat: setează POSITION_RETENTION_DAYS=180.'));
  }
  add('backup_offsite', 'Backup off-site (S3/R2)', bk.s3Configured ? (bk.protected ? 'ok' : 'warn') : 'crit',
    bk.s3Configured ? (bk.protected ? ('ultima copie: ' + (bk.at || '—')) : 'configurat, dar ultima rulare nu a urcat nimic')
                    : 'BACKUP_S3_* nesetat → datele de business NU sunt salvate nicăieri în afara containerului');
  // Telemetria NU intră în dump-ul logic (e prea mare) — se arhivează separat, zi cu zi. Fără ea, retenția
  // de 180 de zile ar fi însemnat pierdere definitivă dacă fereastra de snapshot-uri a bazei e mai scurtă.
  const bp = backup.positionsStatus();
  add('backup_positions', 'Arhivă poziții (telemetrie)', !bp.enabled ? 'warn' : (bp.error ? 'crit' : (bp.at ? 'ok' : 'info')),
    !bp.enabled ? 'BACKUP_S3_* nesetat → pozițiile șterse de retenție NU au nicio copie; verifică separat ce fereastră de snapshot-uri are baza'
      : bp.error ? ('ultimul export a eșuat: ' + bp.error)
        : bp.at ? ('ultimul export acum ' + bp.ageHours + 'h · ' + bp.days + ' zile, ' + bp.rows + ' rânduri' + (bp.lastDay ? ' (până la ' + bp.lastDay + ')' : ''))
          : 'programat, dar încă nicio rulare (prima pornește la 8 minute după boot)');
  add('backup_crypt', 'Criptare backup', bk.passphraseSet ? 'ok' : (bk.s3Configured ? 'crit' : 'warn'),
    bk.passphraseSet ? 'BACKUP_PASSPHRASE setat (AES-256-GCM)' : 'BACKUP_PASSPHRASE nesetat → dump-ul (hash-uri de parole, chei API) ar pleca necriptat');
  // Distingem cele trei stări care înainte arătau la fel: proaspăt · vechi de zile (pană reală) · niciodată.
  // Marca de timp e persistată, deci „niciodată" chiar înseamnă niciodată, nu „serverul s-a repornit".
  add('backup_fresh', 'Prospețime backup', bk.never ? 'info' : (bk.dead ? 'crit' : (bk.stale ? 'warn' : 'ok')),
    bk.never ? 'nicio rulare înregistrată încă (prima pornește la 5 minute după boot)'
      : (bk.dead ? ('ULTIMA COPIE ARE ' + bk.ageHours + 'h — workerul de backup nu mai rulează' + (bk.error ? ': ' + bk.error : ''))
        : ('acum ' + bk.ageHours + 'h')));
  add('cookie_secure', 'Cookie sesiune „secure"', process.env.COOKIE_SECURE === 'true' ? 'ok' : 'crit',
    process.env.COOKIE_SECURE === 'true' ? 'da (+ HSTS)' : 'COOKIE_SECURE≠true → cookie-ul de sesiune poate pleca și pe HTTP');
  add('session_secret', 'SESSION_SECRET', isSet(process.env.SESSION_SECRET) ? 'ok' : 'warn',
    isSet(process.env.SESSION_SECRET) ? 'setat din mediu' : 'negenerat din mediu → se folosește fișierul local; la reconstruirea containerului toate sesiunile pică');
  add('smtp', 'Email (SMTP)', (mailer && mailer.enabled()) ? 'ok' : 'crit',
    (mailer && mailer.enabled()) ? 'activ' : 'neconfigurat → invitațiile de cont, resetarea parolei și rapoartele programate NU pleacă');
  add('push', 'Push nativ (FCM)', _fcm ? 'ok' : 'warn', _fcmStatus || (_fcm ? 'activ' : 'FIREBASE_SA_JSON nesetat'));
  add('sentry', 'Raportare erori (Sentry)', errortrack.enabled() ? 'ok' : 'warn', errortrack.enabled() ? 'activ' : 'SENTRY_DSN nesetat → erorile rămân doar în jurnalul intern');
  add('strict_devices', 'Înregistrare strictă dispozitive', STRICT_DEVICES ? 'ok' : 'warn', STRICT_DEVICES ? 'doar IMEI-uri pre-înregistrate' : 'STRICT_DEVICES=false → orice tracker se poate conecta');

  // Servicii de hartă externe. Un deploy care rulează pe serverele PUBLICE de demonstrație arăta până acum
  // complet verde, deși folosea infrastructură pe care scrie explicit că nu e pentru producție.
  try {
    const gs = geocode && geocode.getStats ? geocode.getStats() : null;
    if (gs) {
      const eșecuri = gs.err429 + gs.errHttp + gs.errNet + gs.timeouts;
      const rată = gs.misses ? Math.round(eșecuri / gs.misses * 100) : 0;
      add('geocode', 'Geocodare (adrese)', gs.public ? 'warn' : (rată > 30 ? 'crit' : 'ok'),
        (gs.public
          ? 'Nominatim PUBLIC — politica lui permite ~1 cerere/s și interzice utilizarea intensivă; la creșterea flotei riști blocarea adresei IP. Setează GEOCODE_URL (furnizor propriu sau plătit).'
          : 'furnizor propriu: ' + gs.provider)
        + ' · ' + gs.ok + ' reușite, ' + eșecuri + ' eșecuri (' + rată + '%)'
        + (gs.err429 ? ', din care ' + gs.err429 + ' refuzate pentru depășirea limitei' : '')
        + ' · cache ' + gs.cacheSize + (gs.hitRate != null ? ' (potriviri ' + gs.hitRate + '%)' : ''));
    }
    add('osrm', 'Lipirea traseului de drumuri (OSRM)', OSRM_ON ? 'ok' : 'info',
      OSRM_ON ? ('server propriu: ' + OSRM_URL)
        : 'OSRM_URL nesetat → funcția e OPRITĂ, traseele se afișează brute. Implicitul public era serverul de demonstrație FOSSGIS, interzis în producție — l-am scos deliberat, nu e o defecțiune.');
  } catch (e) {}
  // Informativ, NU avertisment: de când demo-ul se acordă la cerere, compania demo e parte din produs.
  // Cât timp rămânea „warn", ecranul nu putea ajunge niciodată pe verde, iar un semnal veșnic portocaliu
  // e un semnal pe care nu-l mai citește nimeni.
  const _ds = demoSimStatus();
  add('demo', 'Companie DEMO', 'info', demoLeft
    ? 'prezentă — aici se creează conturile demo aprobate' + (process.env.DEMO_DISABLED === 'true' ? '; simulatorul de poziții e OPRIT (DEMO_DISABLED=true)' : '')
    : 'absentă — aprobarea unei cereri demo va eșua până o recreezi (scoate DEMO_DISABLED și repornește)');
  // Simulatorul e cost de bază: ~86.000 de poziții scrise pe zi. Arătăm explicit dacă merge și pentru cine.
  add('demo_sim', 'Simulator demo', 'info', _ds.running
    ? 'PORNIT · ' + _ds.reason + (_ds.forced ? ' (expiră singur)' : '')
    : 'oprit · ' + _ds.reason + ' — nu se mai scriu poziții sintetice în bază');
  add('webpush', 'Notificări în browser (VAPID)', (isSet(process.env.VAPID_PUBLIC_KEY) && isSet(process.env.VAPID_PRIVATE_KEY)) ? 'ok' : 'warn',
    (isSet(process.env.VAPID_PUBLIC_KEY) && isSet(process.env.VAPID_PRIVATE_KEY)) ? 'configurat' : 'VAPID_* lipsă → notificările în browser nu funcționează (pe Android merg oricum prin FCM)');
  // Modul ANAF: implicit e TEST, deci se poate crede că trimiți declarații reale când de fapt nu trimiți.
  const _anafTok = isSet(process.env.ANAF_EFACTURA_TOKEN) || isSet(process.env.ANAF_ETRANSPORT_TOKEN);
  const _anafTest = String(process.env.ANAF_EFACTURA_TEST || 'true') === 'true' || String(process.env.ANAF_ETRANSPORT_TEST || 'true') === 'true';
  add('anaf', 'ANAF (e-Factura / e-Transport)', _anafTok ? (_anafTest ? 'warn' : 'ok') : 'info',
    _anafTok ? (_anafTest ? 'token setat, dar rulează în mediul de TEST (implicit) → pune ANAF_EFACTURA_TEST=false / ANAF_ETRANSPORT_TEST=false pentru trimiteri reale' : 'mediu de PRODUCȚIE')
      : 'fără token SPV → modulele ANAF rămân demonstrative');
  add('ai', 'Cheie AI (Anthropic)', isSet(process.env.ANTHROPIC_API_KEY) ? 'ok' : 'info', isSet(process.env.ANTHROPIC_API_KEY) ? 'setată' : 'nesetată → asistentul liber și rezumatele AI sunt oprite');
  add('stripe', 'Plăți card (Stripe)', isSet(process.env.STRIPE_SECRET_KEY) ? (isSet(process.env.STRIPE_WEBHOOK_SECRET) ? 'ok' : 'warn') : 'info',
    isSet(process.env.STRIPE_SECRET_KEY) ? (isSet(process.env.STRIPE_WEBHOOK_SECRET) ? 'activ' : 'cheie setată dar STRIPE_WEBHOOK_SECRET lipsește → facturile nu se marchează plătite automat') : 'nesetat → încasare doar prin transfer bancar');

  // Nivelul „info" e context, nu problemă: nu împiedică ecranul să ajungă pe verde.
  const worst = checks.some(c => c.level === 'crit') ? 'crit' : (checks.some(c => c.level === 'warn') ? 'warn' : 'ok');
  const counts = { crit: checks.filter(c => c.level === 'crit').length, warn: checks.filter(c => c.level === 'warn').length, ok: checks.filter(c => c.level === 'ok').length };
  res.set('Cache-Control', 'no-store');
  res.json({
    overall: worst, counts: counts,
    server: { version: COMMIT_VER, uptime_s: Math.round((Date.now() - _startedAt) / 1000), node: process.version, mode: process.env.DATABASE_URL ? 'postgres' : 'pglite' },
    db: { ok: dbOk, pool: poolStats, timescale: ts },
    backup: bk,
    workers: Object.keys(WORKERS).map((k) => Object.assign({ key: k }, WORKERS[k])),
    checks: checks
  });
});
app.post('/api/admin/backup/run', requireAuth, requireSuperadmin, async (req, res) => {
  const st = await backup.runScheduledBackup(db, COMMIT_VER);
  auditReq(req, 'run', 'backup', null, { target: st.target, ok: st.ok });
  res.json(st);
});
app.get('/api/admin/backup/download', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = await backup.makeBackup(db, COMMIT_VER);
    const fname = 'ratracks-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + b.ext;
    auditReq(req, 'download', 'backup', null, { rows: b.rows, encrypted: b.encrypted });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(b.buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/costs', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const costs = await db.listPlatformCosts({});
    for (const c of costs) c._status = costStatus(c);
    res.json({ costs, kpis: computeCostKpis(costs) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/costs', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = req.body || {};
    const provider = String(b.provider || '').trim(); if (!provider) return res.status(400).json({ error: 'Furnizor obligatoriu' });
    const currency = ['RON', 'USD', 'EUR'].includes(b.currency) ? b.currency : 'RON';
    const cycle = ['monthly', 'yearly', 'one_time'].includes(b.cycle) ? b.cycle : 'monthly';
    const m = _parseMoney(b.amount); if (!m.ok) return res.status(400).json({ error: 'Sumă invalidă' });
    const nextDue = (b.nextDue != null && b.nextDue !== '') ? Number(b.nextDue) : null;
    const row = await db.createPlatformCost({ provider, category: b.category || null, description: b.description || null, amount: m.val, currency, cycle, nextDue, url: b.url || null, notes: b.notes || null, active: (b.active !== false), createdBy: req.auth && req.auth.userId });
    auditReq(req, 'create', 'platform_cost', row.id, { provider, amount: m.val, currency });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/admin/costs/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const cur = await db.getPlatformCostById(id); if (!cur) return res.status(404).json({ error: 'Cost inexistent' });
    const b = req.body || {};
    const currency = (b.currency != null) ? (['RON', 'USD', 'EUR'].includes(b.currency) ? b.currency : 'RON') : null;
    const cycle = (b.cycle != null) ? (['monthly', 'yearly', 'one_time'].includes(b.cycle) ? b.cycle : 'monthly') : null;
    let amount; if (b.amount !== undefined) { const m = _parseMoney(b.amount); if (!m.ok) return res.status(400).json({ error: 'Sumă invalidă' }); amount = m.val; }
    const nextDue = (b.nextDue !== undefined) ? ((b.nextDue === '' || b.nextDue == null) ? null : Number(b.nextDue)) : undefined;
    const row = await db.updatePlatformCost(id, { provider: b.provider, category: b.category, description: b.description, amount, currency, cycle, nextDue, url: b.url, notes: b.notes, active: (b.active === undefined ? undefined : b.active) });
    auditReq(req, 'update', 'platform_cost', id, { provider: b.provider });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/costs/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const cur = await db.getPlatformCostById(id); if (!cur) return res.status(404).json({ error: 'Cost inexistent' });
    await db.deletePlatformCost(id);
    auditReq(req, 'delete', 'platform_cost', id, { provider: cur.provider });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/costs/:id/paid', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const cost = await db.getPlatformCostById(id); if (!cost) return res.status(404).json({ error: 'Cost inexistent' });
    const now = Date.now();
    let nextDue, active;
    if (cost.cycle === 'one_time') { nextDue = null; active = false; }
    else {
      const base = (cost.next_due != null && Number(cost.next_due) > now) ? Number(cost.next_due) : now; // evită driftul pe restanțe
      nextDue = _addMonthsMs(base, cost.cycle === 'yearly' ? 12 : 1);
      active = undefined; // rămâne activ
    }
    const m = _parseMoney(req.body && req.body.amount);
    const result = await db.markCostPaid(id, { paidAt: now, amount: (m.ok ? (m.val != null ? m.val : cost.amount) : cost.amount), currency: cost.currency, nextDue, active, note: (req.body && req.body.note) || null, createdBy: req.auth && req.auth.userId });
    auditReq(req, 'payment', 'platform_cost', id, { currency: cost.currency, until: nextDue });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/costs/:id/payments', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    res.json(await db.getCostPayments(id, 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Cash-flow platformă: venituri (payments) vs cheltuieli reale (costs_payments) agregate pe lună → profit + marjă.
// Super-admin only. Toate sumele în RON (costurile în valută convertite cu FINANCE_FX). NU expune nicio dată per-tenant altcuiva.
app.get('/api/admin/finance', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    let months = parseInt(req.query.months); if (!Number.isFinite(months)) months = 12;
    months = Math.max(1, Math.min(36, months));
    const buckets = buildFinanceMonths(months);
    const byYm = {}; buckets.forEach(function (b) { byYm[b.ym] = b; });
    const fromMs = _financeMonthStartMs(buckets[0].ym);
    const data = await db.getFinanceSummary(fromMs);
    // Venituri (RON)
    const incomeByCompany = {};
    for (const r of data.income) {
      const amt = Number(r.amount) || 0;
      const b = byYm[_financeYmOf(r.ts)]; if (b) b.income += amt;
      const nm = r.company_name || 'Necunoscut'; incomeByCompany[nm] = (incomeByCompany[nm] || 0) + amt;
    }
    // Cheltuieli reale (valută → RON)
    const expenseByProvider = {};
    for (const r of data.expenses) {
      const fx = FINANCE_FX[r.currency] || 1; const amt = (Number(r.amount) || 0) * fx;
      const b = byYm[_financeYmOf(r.ts)]; if (b) b.expenses += amt;
      const nm = r.provider || 'Altele'; expenseByProvider[nm] = (expenseByProvider[nm] || 0) + amt;
    }
    // Burn recurent estimat (proiecție lunară din costurile active) — reper, nu cash-flow real
    let recurringMonthlyRON = 0;
    for (const r of data.recurring) {
      const fx = FINANCE_FX[r.currency] || 1; const amt = (Number(r.amount) || 0) * fx;
      if (r.cycle === 'monthly') recurringMonthlyRON += amt;
      else if (r.cycle === 'yearly') recurringMonthlyRON += amt / 12;
    }
    let tIncome = 0, tExpense = 0;
    buckets.forEach(function (b) { b.income = _fin2(b.income); b.expenses = _fin2(b.expenses); b.profit = _fin2(b.income - b.expenses); tIncome += b.income; tExpense += b.expenses; });
    const profit = tIncome - tExpense;
    const top = function (obj) { return Object.keys(obj).map(function (k) { return { name: k, amount: _fin2(obj[k]) }; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 8); };
    res.json({
      currency: 'RON', rates: FINANCE_FX, months: buckets,
      totals: { income: _fin2(tIncome), expenses: _fin2(tExpense), profit: _fin2(profit), marginPct: tIncome > 0 ? Math.round(profit / tIncome * 1000) / 10 : 0, monthsCount: months },
      recurringMonthlyRON: _fin2(recurringMonthlyRON),
      incomeByCompany: top(incomeByCompany), expenseByProvider: top(expenseByProvider),
      counts: { payments: data.income.length, costPayments: data.expenses.length }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Railway: usage/cost ESTIMAT din API (doar dacă RAILWAY_API_TOKEN + RAILWAY_WORKSPACE_ID sunt setate în env). Prețuri unitare publice.
const RAILWAY_UNIT_PRICE_USD = { MEMORY_USAGE_GB: 0.000231, CPU_USAGE: 0.000463, NETWORK_TX_GB: 0.05, DISK_USAGE_GB: 0.000003472, BACKUP_USAGE_GB: 0.000003472 };
async function fetchRailwayUsage() {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) return { configured: false };
  const envProjectId = process.env.RAILWAY_PROJECT_ID;   // auto-injectat de Railway
  const envWsId = process.env.RAILWAY_WORKSPACE_ID;      // auto-injectat de Railway
  const planFee = parseFloat(process.env.RAILWAY_PLAN_FEE_USD) || 0;
  const ENDPOINT = 'https://backboard.railway.com/graphql/v2';
  const MEASURES = ['CPU_USAGE', 'MEMORY_USAGE_GB', 'DISK_USAGE_GB', 'NETWORK_TX_GB', 'BACKUP_USAGE_GB'];

  async function gql(query, variables) {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ query, variables: variables || {} }) });
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    return j;
  }
  function firstErr(j) { return (j && j.errors && j.errors[0] && j.errors[0].message) || null; }
  function isAuthz(msg) { return !!msg && /not authoriz/i.test(msg); }

  // estimatedUsage pe un scope dat: { projectId } SAU { workspaceId }
  async function estUsage(scope) {
    const argName = scope.projectId ? 'projectId' : 'workspaceId';
    const q = 'query($id:String!){ estimatedUsage(' + argName + ':$id, measurements:[' + MEASURES.join(',') + ']){ measurement estimatedValue } }';
    const j = await gql(q, { id: scope.projectId || scope.workspaceId });
    const err = firstErr(j);
    if (err) return { err: err };
    return { rows: (j.data && j.data.estimatedUsage) || [] };
  }

  // Self-discovery: află workspace-ul care DEȚINE proiectul (necesită account token valid)
  async function discoverWorkspaceId() {
    const j = await gql('query{ me { id workspaces { id name projects { edges { node { id name } } } } } }');
    if (firstErr(j)) return null; // me cere account token; dacă pică, token-ul nu e de cont
    const wss = (j.data && j.data.me && j.data.me.workspaces) || [];
    if (envProjectId) {
      for (const ws of wss) {
        const edges = (ws.projects && ws.projects.edges) || [];
        if (edges.some(function (e) { return e && e.node && e.node.id === envProjectId; })) return ws.id;
      }
    }
    return wss.length === 1 ? wss[0].id : null; // un singur workspace → fără ambiguitate
  }

  try {
    let rows = null, lastErr = null;
    if (envProjectId) { const r1 = await estUsage({ projectId: envProjectId }); if (r1.rows) rows = r1.rows; else lastErr = r1.err; }
    if (!rows && envWsId && (!lastErr || isAuthz(lastErr))) { const r2 = await estUsage({ workspaceId: envWsId }); if (r2.rows) rows = r2.rows; else lastErr = r2.err; }
    if (!rows && (!lastErr || isAuthz(lastErr))) {
      const wsId = await discoverWorkspaceId();
      if (wsId) { const r3 = await estUsage({ workspaceId: wsId }); if (r3.rows) rows = r3.rows; else lastErr = r3.err; }
    }
    if (!rows) {
      let error = lastErr || 'Eroare GraphQL Railway';
      if (isAuthz(error)) error = 'Railway „Not Authorized": RAILWAY_API_TOKEN trebuie să fie un ACCOUNT token (creat la railway.com/account/tokens cu dropdown-ul de workspace pe „No workspace"), iar contul lui să fie membru al workspace-ului care deține acest proiect.';
      return { configured: true, error: error };
    }
    const byMeasure = {}; let estUsd = planFee;
    for (const row of rows) {
      const v = Number(row.estimatedValue) || 0;
      byMeasure[row.measurement] = (byMeasure[row.measurement] || 0) + v;
      estUsd += v * (RAILWAY_UNIT_PRICE_USD[row.measurement] || 0);
    }
    return { configured: true, byMeasure, planFee, estimatedUsd: Math.round(estUsd * 100) / 100 };
  } catch (e) { return { configured: true, error: e.message }; }
}
app.get('/api/admin/costs/railway', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const dbCap = await db.getDbCapacity();
    let capGb = 5; try { const v = parseFloat(await db.getSetting('railway_volume_gb')); if (Number.isFinite(v) && v > 0) capGb = v; } catch (e) {}
    const usage = await fetchRailwayUsage();
    res.json({ db: dbCap, capGb, usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Cloudflare: usage analytics ultimele 30 zile (plan gratuit — cost 0, dar arătăm ce a făcut). DOAR dacă CLOUDFLARE_ANALYTICS_TOKEN + CLOUDFLARE_ZONE_ID sunt în env.
async function fetchCloudflareUsage() {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) return { configured: false };
  const fmt = function (d) { return d.toISOString().slice(0, 10); };
  const now = new Date();
  const end = fmt(now), start = fmt(new Date(now.getTime() - 29 * 86400000));
  const query = 'query($zone:String!,$start:Date!,$end:Date!){ viewer { zones(filter:{zoneTag:$zone}) { httpRequests1dGroups(limit:31, filter:{date_geq:$start, date_leq:$end}) { sum { requests bytes cachedRequests cachedBytes threats encryptedRequests } uniq { uniques } } } } }';
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ query, variables: { zone: zoneId, start: start, end: end } }) });
    const j = await r.json().catch(function () { return {}; });
    if (j.errors && j.errors.length) return { configured: true, error: (j.errors[0] && j.errors[0].message) || 'Eroare GraphQL Cloudflare' };
    const data = j.data || {};
    const zones = (data.viewer && data.viewer.zones) || [];
    const groups = (zones[0] && zones[0].httpRequests1dGroups) || [];
    const t = { requests: 0, bytes: 0, cachedRequests: 0, cachedBytes: 0, threats: 0, encrypted: 0, uniques: 0 };
    for (const g of groups) { const s = g.sum || {}; t.requests += s.requests || 0; t.bytes += s.bytes || 0; t.cachedRequests += s.cachedRequests || 0; t.cachedBytes += s.cachedBytes || 0; t.threats += s.threats || 0; t.encrypted += s.encryptedRequests || 0; t.uniques += (g.uniq && g.uniq.uniques) || 0; }
    return { configured: true, days: groups.length, start: start, end: end, totals: t };
  } catch (e) { return { configured: true, error: e.message }; }
}
app.get('/api/admin/costs/cloudflare', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await fetchCloudflareUsage()); } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── Google (Analytics GA4 + Search Console): date LIVE, cost 0 (gratuit). Token OAuth via service-account (JWT RS256).
// Reutilizează FIREBASE_SA_JSON (sau GOOGLE_SA_JSON dedicat). Acel service-account trebuie să aibă acces în proprietatea
// GA4 (rol Viewer) + în Search Console (utilizator). ID-uri necesare: GA4_PROPERTY_ID (numeric), GSC_SITE_URL. Env-only.
let _gTokCache = null; // { scope, token, exp(sec) }
async function getGoogleAccessToken(scopes) {
  const raw = process.env.GOOGLE_SA_JSON || process.env.FIREBASE_SA_JSON;
  if (!raw) return null;
  let sa; try { sa = JSON.parse(raw); } catch (e) { return null; }
  if (!sa.client_email || !sa.private_key) return null;
  const scope = scopes.join(' ');
  const nowSec = Math.floor(Date.now() / 1000);
  if (_gTokCache && _gTokCache.scope === scope && _gTokCache.exp - 60 > nowSec) return _gTokCache.token;
  const crypto = require('crypto');
  const b64u = (s) => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(head + '.' + claim); signer.end();
  const sig = signer.sign((sa.private_key || '').replace(/\\n/g, '\n')).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = head + '.' + claim + '.' + sig;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(assertion) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(j.error_description || j.error || 'Autentificare Google eșuată');
  _gTokCache = { scope, token: j.access_token, exp: nowSec + (j.expires_in || 3600) };
  return j.access_token;
}
// Google Analytics (GA4 Data API): utilizatori activi / sesiuni / afișări / utilizatori noi (30 zile) + top pagini.
const _gaCache = { at: 0, data: null };
async function fetchGaUsage() {
  const prop = process.env.GA4_PROPERTY_ID;
  if (!prop || !(process.env.GOOGLE_SA_JSON || process.env.FIREBASE_SA_JSON)) return { configured: false };
  if (_gaCache.data && (Date.now() - _gaCache.at) < 300000) return _gaCache.data; // cache 5 min (anti rate-limit)
  try {
    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
    if (!token) return { configured: false };
    const propId = String(prop).replace(/^properties\//, '');
    const url = 'https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(propId) + ':runReport';
    const hdr = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    const r = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify({ dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'newUsers' }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { configured: true, error: (j.error && j.error.message) || ('HTTP ' + r.status) };
    const row = (j.rows && j.rows[0]) || null;
    const mv = (i) => (row && row.metricValues && row.metricValues[i]) ? (Number(row.metricValues[i].value) || 0) : 0;
    let topPages = [];
    try {
      const r2 = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify({ dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 6 }) });
      const j2 = await r2.json().catch(() => ({}));
      topPages = ((j2 && j2.rows) || []).map((x) => ({ path: (x.dimensionValues && x.dimensionValues[0] && x.dimensionValues[0].value) || '', views: Number(x.metricValues && x.metricValues[0] && x.metricValues[0].value) || 0 }));
    } catch (e) {}
    const out = { configured: true, activeUsers: mv(0), sessions: mv(1), pageViews: mv(2), newUsers: mv(3), topPages };
    _gaCache.at = Date.now(); _gaCache.data = out;
    return out;
  } catch (e) { return { configured: true, error: e.message }; }
}
app.get('/api/admin/costs/ga', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await fetchGaUsage()); } catch (err) { res.status(500).json({ error: err.message }); }
});
// Google Search Console (Search Analytics API): clicuri / afișări / CTR / poziție medie (30 zile, cu decalajul ~2 zile) + top căutări.
const _gscCache = { at: 0, data: null };
async function fetchGscUsage() {
  const site = process.env.GSC_SITE_URL;
  if (!site || !(process.env.GOOGLE_SA_JSON || process.env.FIREBASE_SA_JSON)) return { configured: false };
  if (_gscCache.data && (Date.now() - _gscCache.at) < 300000) return _gscCache.data;
  try {
    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
    if (!token) return { configured: false };
    const fmt = (d) => d.toISOString().slice(0, 10);
    const now = Date.now();
    const endDate = fmt(new Date(now - 2 * 86400000));    // datele SC întârzie ~2-3 zile
    const startDate = fmt(new Date(now - 31 * 86400000));
    const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query';
    const hdr = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    const tot = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify({ startDate, endDate }) }).then((r) => r.json()).catch(() => ({}));
    if (tot.error) return { configured: true, error: (tot.error && tot.error.message) || 'Eroare Search Console' };
    const row = (tot.rows && tot.rows[0]) || {};
    let topQueries = [];
    try {
      const q = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 6 }) }).then((r) => r.json()).catch(() => ({}));
      topQueries = ((q && q.rows) || []).map((x) => ({ query: (x.keys && x.keys[0]) || '', clicks: x.clicks || 0, impressions: x.impressions || 0 }));
    } catch (e) {}
    const out = { configured: true, start: startDate, end: endDate, clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0, topQueries };
    _gscCache.at = Date.now(); _gscCache.data = out;
    return out;
  } catch (e) { return { configured: true, error: e.message }; }
}
app.get('/api/admin/costs/gsc', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await fetchGscUsage()); } catch (err) { res.status(500).json({ error: err.message }); }
});
// Anthropic: cheltuiala lunii curente (USD) din Admin API cost_report. DOAR cu ANTHROPIC_ADMIN_KEY (cheie ADMIN sk-ant-admin01, separată de cea runtime din ai.js).
const _anthSpendCache = new Map(); // startingAt -> { at, data } — TTL 60s, ca panoul + cardul să nu lovească de 2x cost_report (anti rate-limit 429)
async function fetchAnthropicSpend(startingAtISO) {
  const ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
  if (!ADMIN_KEY) return { configured: false };
  // `amount` e documentat în CENȚI (string zecimal): USD = cenți / 100. Override prin env dacă verificarea cu Consola arată altfel.
  const CENTS_PER_USD = parseFloat(process.env.ANTHROPIC_AMOUNT_DIVISOR) || 100;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const startingAt = startingAtISO || startOfMonth.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endingAt = endExclusive.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (Date.parse(startingAt) >= Date.parse(endingAt)) return { configured: true, spentUsd: 0 }; // interval invalid (dată în viitor) → 0 cheltuit, fără apel API
  const _ck = startingAt; const _cc = _anthSpendCache.get(_ck);
  if (_cc && (Date.now() - _cc.at) < 60000) return _cc.data; // rezultat proaspăt din cache
  const BASE = 'https://api.anthropic.com/v1/organizations/cost_report';
  const headers = { 'x-api-key': ADMIN_KEY, 'anthropic-version': '2023-06-01' };
  try {
    let totalCents = 0; const byWorkspace = {}; let page = null; let sawNonUsd = false; let guard = 0;
    do {
      const url = new URL(BASE);
      url.searchParams.set('starting_at', startingAt);
      url.searchParams.set('ending_at', endingAt);
      url.searchParams.set('bucket_width', '1d');     // cost report acceptă DOAR „1d"
      url.searchParams.set('limit', '31');            // default e 7 → ar trunchia luna la ultimele 7 zile
      url.searchParams.append('group_by[]', 'workspace_id');
      if (page) url.searchParams.set('page', page);
      const res = await fetch(url, { headers: headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return { configured: true, spentUsd: 0, error: 'Cheia Anthropic nu e acceptată de Admin API. Folosește o cheie ADMIN (prefix „sk-ant-admin01-…") în ANTHROPIC_ADMIN_KEY, nu una standard „sk-ant-api03-…". (HTTP ' + res.status + ')' };
        if (res.status === 429) return { configured: true, spentUsd: 0, error: 'Anthropic Admin API: prea multe cereri (429). Reîncearcă peste un minut.' };
        let detail = ''; try { detail = (await res.text()).slice(0, 200); } catch (e) {}
        return { configured: true, spentUsd: 0, error: 'Anthropic Admin API a răspuns ' + res.status + '. ' + detail };
      }
      const body = await res.json();
      const data = Array.isArray(body && body.data) ? body.data : [];
      for (const bucket of data) {
        const results = Array.isArray(bucket && bucket.results) ? bucket.results : [];
        for (const item of results) {
          if (!item) continue;
          if (item.currency && item.currency !== 'USD') { sawNonUsd = true; continue; }
          const raw = item.amount != null ? item.amount : (item.cost != null ? item.cost : (item.amount_cents != null ? item.amount_cents : null));
          if (raw == null) continue;
          const cents = parseFloat(raw);
          if (!Number.isFinite(cents)) continue;
          totalCents += cents;
          const wsKey = item.workspace_id || 'default';
          byWorkspace[wsKey] = (byWorkspace[wsKey] || 0) + cents;
        }
      }
      page = body && body.has_more === true ? body.next_page : null;
      guard += 1;
    } while (page && guard < 50);
    const round2 = function (c) { return Math.round((c / CENTS_PER_USD) * 100) / 100; };
    const byWorkspaceUsd = {}; for (const k of Object.keys(byWorkspace)) byWorkspaceUsd[k] = round2(byWorkspace[k]);
    const out = { configured: true, spentUsd: round2(totalCents), byWorkspace: byWorkspaceUsd };
    if (sawNonUsd) out.error = 'Atenție: unele costuri nu sunt în USD și au fost ignorate.';
    if (!out.error) _anthSpendCache.set(_ck, { at: Date.now(), data: out }); // cache doar rezultate reușite
    return out;
  } catch (err) {
    return { configured: true, spentUsd: 0, error: 'Nu am putut citi cheltuielile Anthropic: ' + (err && err.message ? err.message : String(err)) };
  }
}
app.get('/api/admin/costs/anthropic', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const spend = await fetchAnthropicSpend();
    let budget = 0; try { const v = parseFloat(await db.getSetting('anthropic_monthly_budget')); if (Number.isFinite(v) && v >= 0) budget = v; } catch (e) {}
    let available = null;
    if (spend.configured && !spend.error && budget > 0) available = Math.max(0, Math.round((budget - spend.spentUsd) * 100) / 100);
    // SOLD credite (Anthropic n-are API de sold): credite setate la o dată − cheltuit de la acea dată → sold rămas care scade singur.
    let creditUsd = 0, creditDate = null, spentSince = null, soldRemaining = null, soldError = null;
    try { const c = parseFloat(await db.getSetting('anthropic_credit_usd')); if (Number.isFinite(c) && c >= 0) creditUsd = c; } catch (e) {}
    try { creditDate = (await db.getSetting('anthropic_credit_date')) || null; } catch (e) {}
    const creditConfigured = creditUsd > 0 && !!creditDate;
    if (creditConfigured) {
      if (!spend.configured) soldError = 'Cheia Admin Anthropic lipsește.';
      else if (spend.error) soldError = spend.error;
      else {
        const since = await fetchAnthropicSpend(creditDate + 'T00:00:00Z');
        if (since.configured && !since.error) { spentSince = since.spentUsd; soldRemaining = Math.max(0, Math.round((creditUsd - since.spentUsd) * 100) / 100); }
        else soldError = since.error || 'Nu am putut citi cheltuiala de la data setată.';
      }
    }
    res.json(Object.assign({}, spend, { budget: budget, available: available, creditUsd: creditUsd, creditDate: creditDate, creditConfigured: creditConfigured, spentSince: spentSince, soldRemaining: soldRemaining, soldError: soldError }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── Cereri de cont demo (super-admin) ─────────────────────────────────────────────────────────────
app.get('/api/admin/demo-requests', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await db.listDemoRequests({ status: req.query.status || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Aprobare = se creează un cont propriu pentru solicitant, în compania demo, cu termen ales de super-admin.
app.post('/api/admin/demo-requests/:id/approve', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const r = await db.getDemoRequestById(id); if (!r) return res.status(404).json({ error: 'Cerere inexistentă' });
    if (demoCompanyId == null) return res.status(409).json({ error: 'Compania demo nu există pe acest server — nu am unde crea contul.' });
    const hours = _demoDurationHours(req.body);
    const until = Date.now() + hours * 3600 * 1000;
    const uname = normUsername(r.email);
    if (!EMAIL_RE.test(uname)) return res.status(400).json({ error: 'Cererea nu are o adresă de email validă.' });

    let u = await db.getUserByUsername(uname);
    let created = false;
    if (u) {
      // Există deja un cont pe adresa asta: NU-l atingem dacă e un client real — doar prelungim un demo.
      if (u.company_id !== demoCompanyId) return res.status(409).json({ error: 'Există deja un cont real pe această adresă. Prelungește-i accesul din Utilizatori.' });
    } else {
      const tmp = await bcrypt.hash(crypto.randomBytes(18).toString('hex'), 10); // parolă imposibil de ghicit; se setează prin link
      u = await db.createUser(uname, tmp, 'viewer', { full_name: r.name || 'Cont demo', email: uname, phone: r.phone || null, company_id: demoCompanyId });
      created = true;
    }
    // Viewer NU are viewAll → fără ACL explicit n-ar vedea niciun vehicul.
    try { await db.setUserAccess(u.id, demoSim.DEMO_IMEIS, []); } catch (e) {}
    await db.setUserAccessUntil(u.id, until);
    try { await db.pool.query('UPDATE users SET demo_request_id = $2 WHERE id = $1', [u.id, id]); } catch (e) {}
    invalidateAccessCache(u.id); roleCache.delete(u.id); // altfel cache-ul de 30s ar întârzia accesul

    let invited = false;
    try { invited = await sendSetPasswordEmail(req, Object.assign({}, u, { email: uname }), { invite: true }); } catch (e) {}
    await db.updateDemoRequest(id, { status: 'approved', user_id: u.id, approved_by: getAuth(req).userId, access_until: until });
    await syncDemoSim('cerere demo aprobată').catch(() => {}); // contul nou → vehiculele demo trebuie să se miște
    auditReq(req, 'approve', 'demo_request', id, { user: uname, hours: hours });
    res.json({ ok: true, username: uname, hours: hours, days: Math.round(hours / 24 * 10) / 10, duration: _demoDurationLabel(hours), accessUntil: until, created: created, invited: invited,
      warning: invited ? null : 'Contul e activ, dar emailul cu linkul de setare a parolei NU a putut fi trimis (SMTP neconfigurat). Trimite-i manual linkul de resetare.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/demo-requests/:id/reject', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const r = await db.updateDemoRequest(id, { status: 'rejected', notes: (req.body && String(req.body.notes || '').slice(0, 500)) || null });
    if (!r) return res.status(404).json({ error: 'Cerere inexistentă' });
    auditReq(req, 'reject', 'demo_request', id, {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/demo-requests/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    await db.deleteDemoRequest(id);
    auditReq(req, 'delete', 'demo_request', id, {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Prelungire / revocare a TERMENULUI unui cont (conturi demo). Calea e 'access-until', NU 'access':
// '/api/users/:id/access' înseamnă deja ALTCEVA (acces la vehicule/grupe) și, fiind definită mai sus,
// ar fi câștigat ea — ștergând ACL-ul utilizatorului în loc să-i schimbe termenul.
app.put('/api/users/:id/access-until', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const b = req.body || {};
    const relative = (b.hours != null || b.days != null);
    const until = relative ? (Date.now() + _demoDurationHours(b) * 3600 * 1000)
      : (b.until != null ? parseInt(b.until) : null); // until=null → acces nelimitat (revocarea limitei)
    await db.setUserAccessUntil(id, until);
    invalidateAccessCache(id); roleCache.delete(id);
    await syncDemoSim('termen de acces modificat').catch(() => {}); // prelungire → pornește; revocare → poate opri
    auditReq(req, 'set_access', 'user', id, { until: until });
    res.json({ ok: true, accessUntil: until });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Starea simulatorului demo + pornire manuală pe termen scurt.
// De ce butonul: de când simulatorul merge doar pentru conturi demo active, super-adminul care vrea să arate
// aplicația „vie" unui prospect, fără să creeze cont, ar fi găsit cinci camioane înghețate. Termenul e scurt
// și ține în memorie: la un redeploy pornirea forțată dispare, ceea ce e exact comportamentul dorit.
app.get('/api/admin/demo-sim', requireAuth, requireSuperadmin, (req, res) => res.json(demoSimStatus()));
app.post('/api/admin/demo-sim', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.on === false) { _demoSimForcedUntil = 0; }
    else {
      const h = Math.max(0.25, Math.min(24, Number(b.hours) || 2)); // între 15 minute și 24 de ore
      _demoSimForcedUntil = Date.now() + h * 3600 * 1000;
    }
    const st = await syncDemoSim(b.on === false ? 'oprire manuală (super-admin)' : 'pornire manuală (super-admin)');
    auditReq(req, 'update', 'demo_sim', 0, { on: b.on !== false, running: st.running });
    res.json(st);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Ofertare Live: CRUD oferte salvate (super-admin) ───
app.get('/api/admin/offers', requireAuth, requireSuperadmin, async (req, res) => {
  try { res.json(await db.listOffers()); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/offers', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const b = req.body || {};
    const o = await db.createOffer({ name: b.name, client_name: b.client_name, client_cui: b.client_cui, client_contact: b.client_contact, config: b.config, monthly_total: b.monthly_total, currency: b.currency, notes: b.notes, created_by: req.auth && req.auth.userId });
    auditReq(req, 'create', 'offer', o.id, { name: o.name });
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/admin/offers/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    const b = req.body || {};
    const o = await db.updateOffer(id, { name: b.name, client_name: b.client_name, client_cui: b.client_cui, client_contact: b.client_contact, config: b.config, monthly_total: b.monthly_total, currency: b.currency, notes: b.notes });
    if (!o) return res.status(404).json({ error: 'Oferta nu există' });
    auditReq(req, 'update', 'offer', id, { name: o.name });
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/offers/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalid' });
    await db.deleteOffer(id);
    auditReq(req, 'delete', 'offer', id, {});
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Aplică pachetul RA Insight dintr-o ofertă direct pe o companie (după semnare). Așa cota vândută
// în ofertă NU mai trebuie recopiată manual în fișa clientului — se activează modulul + se scrie cota.
app.post('/api/admin/offers/:id/apply-to-company', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID ofertă invalid' });
    const companyId = parseInt((req.body || {}).company_id); if (!Number.isFinite(companyId)) return res.status(400).json({ error: 'Alege o companie' });
    const offer = await db.getOfferById(id); if (!offer) return res.status(404).json({ error: 'Oferta nu există' });
    const company = await db.getCompanyById(companyId); if (!company) return res.status(404).json({ error: 'Compania nu există' });
    const cfg = (offer.config && offer.config.cfg) || {};
    if (!cfg.aiA) return res.status(400).json({ error: 'Oferta nu include RA Insight — nu e nimic de aplicat.' });
    // aiqN = 0 în ofertă înseamnă „nelimitat" → cotă absentă (fără plafon). altfel = numărul de apeluri/lună.
    const n = Math.max(0, Math.round(Number(cfg.aiqN) || 0));
    const priceEur = Math.max(0, Math.round((Number(cfg.aiqP) || 0.20) * 100) / 100);
    const patch = {
      features: { ai_assistant: true },                 // modulul devine activ
      ai_quota: n > 0 ? { questions: n, overage: true, overagePriceEur: priceEur } : null  // null = nelimitat
    };
    await _applyCompanySettingsPatch(companyId, patch, { allowFeatures: true });
    auditReq(req, 'apply_offer', 'company', companyId, { offer_id: id, quota: n, priceEur: priceEur });
    res.json({ ok: true, company: company.name, quota: n, overagePriceEur: priceEur, unlimited: n === 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Facturile companiei CURENTE — pentru ADMINUL firmei (manageUsers). Userii fără manageUsers primesc 403 (nu văd facturi).
// Super-adminul (fără companie proprie) folosește în continuare Facturarea completă; aici primește listă goală.
app.get('/api/billing/my-invoices', requireAuth, requirePerm('manageUsers'), withCompany, async (req, res) => {
  try {
    const cid = req.companyId;
    if (cid == null) return res.json({ company: null, access: null, invoices: [], issuer: {} });
    const co = await db.getCompanyById(cid);
    if (!co) return res.status(404).json({ error: 'Companie inexistentă' });
    const invoices = await db.getPayments(cid, 200);
    let issuer = {}; try { issuer = (await getSystemSettings()).invoice_issuer || {}; } catch (e) {}
    // Prima factură FISCALĂ neachitată + starea Stripe → clientul primește un buton de plată REAL
    // (nu unul decorativ). Fără Stripe configurat, UI-ul afișează datele pentru transfer bancar.
    let unpaid = null;
    try {
      const fis = await db.getInvoices({ companyId: cid, limit: 50 });
      const u = (fis || []).filter(f => f.status !== 'paid' && f.status !== 'canceled')[0];
      if (u) unpaid = { id: u.id, series: u.series || null, number: u.number || null, total: u.total, due_date: u.due_date || null };
    } catch (e) {}
    res.json({
      company: { id: co.id, name: co.name, cui: co.cui || null, reg_com: co.reg_com || null, address: co.address || null, contact_email: co.contact_email || null, phone: co.phone || null, plan: co.plan || null },
      access: companyAccessStatus(co),
      invoices,
      issuer,
      unpaidInvoice: unpaid,
      billingEnabled: !!(billing && billing.enabled())
    });
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
// Test push: trimite o notificare de probă către PROPRIILE dispozitive ale userului (FCM + web push).
// Ocolește preferințele (testează TRANSPORTUL, nu regulile). Întoarce câte tokenuri/abonamente a găsit.
app.post('/api/push/test', requireAuth, async (req, res) => {
  const uid = req.auth && req.auth.userId;
  if (!uid) return res.status(401).json({ error: 'Neautentificat' });
  let deviceTokens = 0, webSubs = 0;
  try { deviceTokens = (await db.getDeviceTokens(uid) || []).length; } catch (_) {}
  try { webSubs = (await db.getPushSubscriptions(uid) || []).length; } catch (_) {}
  sendPushToUser(uid, { title: 'RA Track — test', body: 'Notificare de test — dacă o vezi, push-ul funcționează! ✅', data: { type: 'test' } }).catch(() => {});
  res.json({ ok: true, fcm: !!_fcm, deviceTokens, webSubs });
});
app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Subscription invalidă' });
    await db.savePushSubscription(req.auth.userId, sub);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try { if (req.body && req.body.endpoint) await db.deletePushSubscription(req.body.endpoint, req.auth.userId); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
// Token-uri native (FCM Android / APNs iOS) pentru aplicația mobilă.
app.post('/api/push/device', requireAuth, async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token lipsă' });
    const _st = await db.saveDeviceToken(req.auth.userId, String(token), (platform === 'ios' ? 'ios' : 'android'));
    // Preluarea e normală când alt cont se loghează pe același telefon; devine semnal de abuz doar dacă se repetă.
    if (_st && _st.takenOver) auditReq(req, 'takeover', 'push_token', _st.prevUserId, { note: 'token mutat de la alt utilizator' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Diagnostic push (super-admin): e FCM configurat pe server (FIREBASE_SA_JSON) + a înregistrat telefonul meu un token?
app.get('/api/admin/push-status', requireAuth, requireSuperadmin, async (req, res) => {
  let myDeviceTokens = 0;
  try { myDeviceTokens = ((await db.getDeviceTokens(req.auth.userId)) || []).length; } catch (e) {}
  res.json({ fcmConfigured: !!_fcm, myDeviceTokens: myDeviceTokens, hint: !_fcm ? 'Setează FIREBASE_SA_JSON pe server' : (myDeviceTokens === 0 ? 'Niciun token de pe telefonul tău — instalează APK-ul cu push + loghează-te' : 'OK — server + telefon pregătite') });
});
// Diagnostic CONTACT (super-admin): analizează semnalul de contact (IO 239 / DIN1) vs viteză pe ultimele 48h, pentru un vehicul (q = nume / nr / imei).
// Diagnostic ODOMETRU/IO (super-admin): ce câmpuri de mileage/odometru trimite un vehicul + valorile lor (pt. ex. Logan citit greșit).
app.get('/api/admin/io-peek', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    if (!q) return res.status(400).json({ error: 'Adaugă ?q=nume/imei (ex. ?q=logan)' });
    const devs = await db.getDevicesLite();
    const dev = devs.find(function (d) { return (d.imei && String(d.imei).toLowerCase().includes(q)) || (d.name && String(d.name).toLowerCase().includes(q)) || (d.plate && String(d.plate).toLowerCase().includes(q)); });
    if (!dev) return res.status(404).json({ error: 'Vehicul negăsit pentru „' + q + '"' });
    let canIface = null; try { const dr = await db.pool.query('SELECT can_interface FROM devices WHERE imei = $1', [dev.imei]); canIface = dr.rows[0] && dr.rows[0].can_interface; } catch (e) {}
    const to = new Date(), from = new Date(to.getTime() - 24 * 3600 * 1000);
    const hist = await db.getDeviceHistory(dev.imei, from.toISOString(), to.toISOString(), 5000);
    const last = hist.length ? hist[hist.length - 1] : null;
    const io = (last && last.io_data) || {};
    const odometer_fields = {};
    for (const k of Object.keys(io)) if (/mileage|odometer|odo|distance/i.test(k)) odometer_fields[k] = io[k];
    // Debug „Ore funcționare azi": de ce engineOnTime = 0? Arată valorile reale de ignition + calculul.
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayH = await db.getDeviceHistory(dev.imei, dayStart.toISOString(), to.toISOString(), 10000);
    let ignOn = 0, engineOnSec = 0, kmToday = 0; const ignitionValues = {};
    for (let i = 0; i < todayH.length; i++) {
      const rio = todayH[i].io_data || {}, iv = rio.ignition, key = JSON.stringify(iv) + ' (' + typeof iv + ')';
      ignitionValues[key] = (ignitionValues[key] || 0) + 1;
      const on = iv === 1 || iv === true; if (on) ignOn++;
      if (i > 0) {
        const pr = todayH[i - 1], prio = pr.io_data || {}, dt = (new Date(todayH[i].timestamp) - new Date(pr.timestamp)) / 1000;
        if (dt > 0 && dt < 3600 && ((prio.ignition === 1 || prio.ignition === true) || on)) engineOnSec += dt;
        const dd = haversineDistance(pr.latitude, pr.longitude, todayH[i].latitude, todayH[i].longitude); if (dd < 10) kmToday += dd;
      }
    }
    const today_debug = { points: todayH.length, ignition_on_samples: ignOn, ignition_values_seen: ignitionValues, engine_on_sec: Math.round(engineOnSec), engine_on_fmt: Math.floor(engineOnSec / 3600) + 'h ' + Math.floor((engineOnSec % 3600) / 60) + 'm', km_today: +kmToday.toFixed(1) };
    // Diagnostic combustibil: are CONTOR cumulativ (consum exact) sau doar NIVEL (consum mic = „est.")?
    let fCumFirst = null, fCumLast = null, fLvlFirst = null, fLvlLast = null, cumSum = 0, prevCum = null, prevLvl = null, lvlMaxJump = 0, lvlDropSum = 0;
    for (const r of todayH) {
      const rio = r.io_data || {};
      const cum = (typeof rio.can_fuel_consumed === 'number') ? rio.can_fuel_consumed : (typeof rio.can_fuel_consumed_counted === 'number' ? rio.can_fuel_consumed_counted : (typeof rio.can_engine_total_fuel_used === 'number' ? rio.can_engine_total_fuel_used : null));
      if (cum != null && cum > 0) { if (prevCum != null) { const dc = cum - prevCum; if (dc > 0 && dc < 100) cumSum += dc; } prevCum = cum; if (fCumFirst == null) fCumFirst = cum; fCumLast = cum; }
      const lvl = (typeof rio.fuel_level_liters === 'number') ? rio.fuel_level_liters : (typeof rio.can_fuel_level_liters === 'number' ? rio.can_fuel_level_liters : null);
      if (lvl != null && lvl > 0) { if (prevLvl != null) { const dL = lvl - prevLvl; if (dL > lvlMaxJump) lvlMaxJump = dL; if (dL < 0 && -dL >= 0.4 && -dL < 40) lvlDropSum += -dL; } prevLvl = lvl; if (fLvlFirst == null) fLvlFirst = lvl; fLvlLast = lvl; }
    }
    const _counter = fCumFirst != null;
    const _km = today_debug.km_today || 0;
    const _sumPer100 = (cumSum > 0 && _km > 1) ? +(cumSum / _km * 100).toFixed(1) : null;
    const _ok = cumSum > 0 && _sumPer100 != null && _sumPer100 >= 1 && _sumPer100 <= 200;
    // Consum din NIVEL = suma scăderilor reale (metoda nouă, gestionează alimentări/scăderi graduale).
    const _dropPer100 = (lvlDropSum > 0 && _km > 1) ? +(lvlDropSum / _km * 100).toFixed(1) : null;
    const _levelOk = _dropPer100 != null && _dropPer100 >= 1.5 && _dropPer100 <= 200;
    const fuel_diag = {
      contor_cumulativ_prezent: _counter,
      contor_chei: ['can_fuel_consumed', 'can_fuel_consumed_counted', 'can_engine_total_fuel_used'].filter(function (k) { return io[k] !== undefined; }),
      contor_valoare_curenta_L: _counter ? fCumLast : null,
      contor_consum_azi_ultima_minus_prima_L: (fCumFirst != null && fCumLast != null) ? +(fCumLast - fCumFirst).toFixed(2) : null,
      contor_consum_azi_suma_incremente_L: +cumSum.toFixed(2),
      contor_L_per_100km: _sumPer100,
      nivel_prezent: fLvlFirst != null,
      nivel_curent_L: fLvlLast,
      nivel_scadere_azi_L: (fLvlFirst != null && fLvlLast != null) ? +(fLvlFirst - fLvlLast).toFixed(2) : null,
      nivel_cel_mai_mare_salt_L: +lvlMaxJump.toFixed(1),
      nivel_suma_scaderi_azi_L: +lvlDropSum.toFixed(2),
      consum_din_nivel_L_per_100km: _dropPer100,
      toate_cheile_combustibil: Object.keys(io).filter(function (k) { return /fuel|carbur|consum/i.test(k); }).sort(),
      verdict: _ok
        ? ('MĂSURAT din contor: ' + cumSum.toFixed(1) + ' L azi (' + _sumPer100 + ' L/100km) → NU mai e „est.".')
        : (_levelOk
          ? ('MĂSURAT din scăderile de nivel: ' + lvlDropSum.toFixed(1) + ' L azi (' + _dropPer100 + ' L/100km) → NU mai e „est.".')
          : (fLvlFirst != null
            ? ('Nivelul NU arată scăderi reale azi (suma scăderi ' + lvlDropSum.toFixed(2) + ' L pe ' + _km + ' km) — senzor amortizat/grosier sau drum prea scurt → estimat. Pe drumuri mai lungi se măsoară.')
            : 'Niciun semnal de combustibil.')),
    };
    res.json({ vehicul: dev.name || dev.imei, imei: dev.imei, can_interface: canIface, ts: last && last.timestamp, last_ignition: io.ignition, fuel_diag: fuel_diag, odometer_fields: odometer_fields, today_debug: today_debug, all_io_keys: Object.keys(io).sort() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/ignition-check', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    if (!q) return res.status(400).json({ error: 'Adaugă ?q=nume/nr/imei (ex. ?q=caddy)' });
    const devs = await db.getDevicesLite();
    const dev = devs.find(function (d) { return (d.imei && String(d.imei).toLowerCase().includes(q)) || (d.name && String(d.name).toLowerCase().includes(q)) || (d.plate && String(d.plate).toLowerCase().includes(q)); });
    if (!dev) return res.status(404).json({ error: 'Vehicul negăsit pentru „' + q + '"' });
    const imei = dev.imei;
    const to = new Date(), from = new Date(to.getTime() - 48 * 3600 * 1000);
    const hist = await db.getDeviceHistory(imei, from.toISOString(), to.toISOString(), 100000);
    const SP = 3;
    let ign1 = 0, ign0 = 0, ignU = 0, din1Present = 0, din1On = 0, idle = 0, driving = 0, moveNoIgn = 0, stopNoIgn = 0;
    for (const p of hist) {
      const io = p.io_data || {}; const spd = p.speed || 0;
      const ign = io.ignition; const ignOn = (ign === 1 || ign === true); const moving = spd > SP;
      if (ignOn) ign1++; else if (ign === 0 || ign === false) ign0++; else ignU++;
      if (io.digital_input_1 != null) { din1Present++; if (io.digital_input_1 === 1 || io.digital_input_1 === true) din1On++; }
      if (ignOn && !moving) idle++; else if (ignOn && moving) driving++; else if (!ignOn && moving) moveNoIgn++; else stopNoIgn++;
    }
    const source = _din1Set.has(imei) ? 'din1 (override)' : 'auto (IO 239 device)';
    const recent = hist.slice(-15).map(function (p) { return { ts: p.timestamp, speed: p.speed, ignition: (p.io_data || {}).ignition, din1: (p.io_data || {}).digital_input_1 }; });
    res.json({ vehicul: dev.name || imei, imei, source, samples: hist.length, ign_on: ign1, ign_off: ign0, ign_undef: ignU, din1_present: din1Present, din1_on: din1On, idle_samples: idle, driving_samples: driving, moving_fara_contact: moveNoIgn, oprit_fara_contact: stopNoIgn, recent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/push/device/unregister', requireAuth, async (req, res) => {
  try { if (req.body && req.body.token) await db.deleteDeviceToken(String(req.body.token), req.auth.userId); res.json({ ok: true }); }
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

app.get('/api/debug/log', requireAuth, requireSuperadmin, (req, res) => { // STRICT super-admin: debugLog e buffer global cross-tenant (IMEI/GPS/IO ale tuturor companiilor)
  // Filtre opționale pentru consola de debug: ?imei=…&event=…&limit=N
  let rows = debugLog;
  const fImei = (req.query.imei || '').trim(), fEvent = (req.query.event || '').trim();
  if (fImei) rows = rows.filter(r => r.imei === fImei);
  if (fEvent) rows = rows.filter(r => r.event === fEvent);
  const lim = Math.min(parseInt(req.query.limit) || DEBUG_MAX, DEBUG_MAX);
  res.json(rows.slice(-lim));
});

// Pagina consolei de debug (RA DevConsole) — gated server-side: DOAR super-admin (HTML-ul static /debug.html rămâne
// doar un shell; toate datele vin din API-urile de mai jos, fiecare gardat individual).
app.get('/debug', requireAuth, requireSuperadmin, (req, res) => {
  res.set('Cache-Control', NO_CACHE);
  res.sendFile(path.join(__dirname, 'public', 'debug.html'));
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

// Setează contextul de acces pe socket + trimite init. Comun pt. cookie și token.
async function _wsAuthContext(ws, userId, role, companyId, label) {
  ws._userId = userId;
  ws._role = role;
  ws._isAdmin = hasPerm(role, 'manageUsers');
  ws._isSuper = isSuper(role); // frame-urile type:'debug' (buffer cross-tenant) merg DOAR la super-admin
  const wsCompanyId = await resolveCompanyId({ userId, role, companyId });
  ws._companyId = wsCompanyId;
  ws._allowedImeis = await getAllowedImeiSet(userId, role, wsCompanyId);
  if (!isSuper(role) && wsCompanyId != null && (await _accessStatusCached(wsCompanyId)).status === 'expired') {
    try { ws.send(JSON.stringify({ type: 'error', data: { error: 'access_expired' } })); } catch (e) {}
    ws.close(); return false;
  }
  ws._authed = true;
  const positions = Array.from(livePositions.values())
    .filter(p => ws._allowedImeis == null || ws._allowedImeis.has(p.imei))
    .filter(p => ws._companyId === demoCompanyId || !DEMO_SET.has(p.imei));
  try { ws.send(JSON.stringify({ type: 'init', data: positions })); } catch (e) {}
  console.log(`[WS] Client conectat la live feed (${label})`);
  return true;
}

// Reîmprospătează ws._allowedImeis pe socket-urile WS DESCHISE după reasignarea unui device la o companie/grup,
// ca un vehicul nou alocat să primească frame-urile live IMEDIAT (nu doar după reconectare / poll-ul de siguranță).
// Se apelează DUPĂ invalidateAccessCache(), ca getAllowedImeiSet să recompute fresh. Super-adminii au _allowedImeis
// null (văd tot) → îi sărim. Nu aruncă (un client problematic nu blochează restul).
async function refreshWsScope() {
  for (const ws of wss.clients) {
    try {
      if (ws.readyState !== 1 || !ws._authed || isSuper(ws._role)) continue;
      ws._allowedImeis = await getAllowedImeiSet(ws._userId, ws._role, ws._companyId);
    } catch (_) { /* ignore per-client */ }
  }
}

wss.on('connection', (ws, req) => {
  // ── Autentificare prin TOKEN (mobil): ?token=gpsk_... în URL handshake. Webview-ul Capacitor
  // nu trimite cookie cross-site, deci folosim tokenul (peste wss:// → criptat pe fir). ──
  const tokenMatch = /[?&]token=([^&\s]+)/.exec(req.url || '');
  if (tokenMatch) {
    (async () => {
      try {
        const key = decodeURIComponent(tokenMatch[1]);
        const user = await db.getUserByApiKey(hashApiKey(key));
        if (!user || user.active === false || userAccessExpired(user)) {
          try { ws.send(JSON.stringify({ type: 'error', data: { error: userAccessExpired(user) ? DEMO_EXPIRED_MSG : 'Neautorizat' } })); } catch (e) {}
          return ws.close();
        }
        await _wsAuthContext(ws, user.id, user.role, user.company_id, 'token:' + user.username);
      } catch (e) { try { ws.close(); } catch (_) {} }
    })();
    ws.on('close', () => { console.log('[WS] Client deconectat'); });
    return;
  }

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
      ws._isSuper = isSuper(role); // frame-urile type:'debug' (buffer cross-tenant) merg DOAR la super-admin
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
    if (isDebug && !client._isSuper) return;   // debug DOAR super-admin (buffer global cross-tenant, aliniat cu GET /api/debug/log)
    if (imei && client._allowedImeis instanceof Set && !client._allowedImeis.has(imei)) return; // filtrare pe acces
    if (imei && DEMO_SET.has(imei) && client._companyId !== demoCompanyId) return; // demo doar în contul demo
    // Tenant: NOTIFICARE imei-less (ex: expirare permis) → doar clienții companiei ei; super (allowedImeis null) o ia oricum.
    // Oglindă a regulii din _notifWhere: o notificare imei-less fără companie NU ajunge la niciun client non-super.
    if (isNotif && !imei && client._allowedImeis instanceof Set && client._companyId !== companyId) return;
    client.send(data);
  });
}

// ─── Broadcast poziții live cu coalescing OPȚIONAL (P2.3) ───
// WS_BATCH_MS=0 (implicit) → trimitere imediată per poziție (comportament istoric, zero risc).
// WS_BATCH_MS>0 (ex: 250) → coalescează pe IMEI (ultima poziție câștigă) și trimite UN frame
// {type:'positions'} per interval, filtrat per-client. La 2000 vehicule reduce frame-urile WS
// de la ~67/sec la ~1000/WS_BATCH_MS/sec. Frontend-ul tratează ambele formate.
const WS_BATCH_MS = parseInt(process.env.WS_BATCH_MS) || 0;
const _wsPosBuffer = new Map(); // imei -> liveData
let _wsFlushTimer = null;
function broadcastPosition(liveData) {
  if (WS_BATCH_MS <= 0) { broadcastWs({ type: 'position', data: liveData }); return; }
  _wsPosBuffer.set(liveData.imei, liveData);
  if (!_wsFlushTimer) _wsFlushTimer = setTimeout(flushPositions, WS_BATCH_MS);
}
function flushPositions() {
  _wsFlushTimer = null;
  if (!_wsPosBuffer.size) return;
  const batch = Array.from(_wsPosBuffer.values());
  _wsPosBuffer.clear();
  wss.clients.forEach((client) => {
    if (client.readyState !== 1 || !client._authed) return;
    let arr = batch;
    if (client._allowedImeis instanceof Set) arr = arr.filter(d => client._allowedImeis.has(d.imei));
    if (client._companyId !== demoCompanyId) arr = arr.filter(d => !DEMO_SET.has(d.imei));
    if (!arr.length) return;
    try { client.send(JSON.stringify({ type: 'positions', data: arr })); } catch (_) {}
  });
}

// ══════════════════════════════════════════════
// 4. PORNIRE
// ══════════════════════════════════════════════
async function start() {
  // Inițializează baza de date
  await db.initDb();
  await loadRegisteredImeis(); // allow-list mod strict — ÎNAINTE de a porni serverul TCP (altfel s-ar bloca la boot)
  initVapid();
  initFcm();
  await _loadFuelAuto(); refreshFuelPrices(); setInterval(refreshFuelPrices, 12 * 60 * 60 * 1000); // preț carburant: la boot + de 2x/zi

  // Încarcă cheia AI salvată din UI (dacă nu e deja în env)
  try { if (!ai.aiEnabled()) { const k = await db.getSetting('anthropic_api_key'); if (k) { ai.setKey(k); console.log('[AI] Cheie Anthropic încărcată din setări'); } } } catch (e) {}

  // Creează sau actualizează userul admin.
  // NU mai există parolă implicită. `admin123` era publică (scrisă în DEPLOY_RAILWAY.md), iar contul
  // e super-admin peste TOATE companiile — cea mai ieftină breșă cu putință. Dacă ADMIN_PASSWORD nu e
  // setată la primul boot, generăm una aleatoare și o tipărim O SINGURĂ DATĂ în log.
  // Excepție: rularea testelor (NODE_ENV=test), unde parola fixă e necesară și baza e efemeră.
  const _test = process.env.NODE_ENV === 'test';
  let adminPass = process.env.ADMIN_PASSWORD || (_test ? 'admin123' : null);
  let _generata = false;
  if (!adminPass) {
    adminPass = require('crypto').randomBytes(18).toString('base64url'); // ~24 caractere
    _generata = true;
  }
  // ── Contul de instalare „admin" se RETRAGE ─────────────────────────────────────────────────────
  // Decizie 2026-08-11: nu mai trebuie să funcționeze. E un cont cu nume previzibil, cunoscut public
  // din documentația de deploy, care administrează TOATE companiile — prima țintă a oricui.
  // Singura condiție care oprește retragerea: să existe ALT super-admin activ. Altfel v-ar închide
  // pe dinafara propriei platforme, iar asta nu e o decizie pe care o poate lua o pornire de server.
  // Recuperare (break-glass): setezi ADMIN_PASSWORD în Railway și redeploy — contul revine activ, cu
  // parola aia. Accesul la variabilele de mediu e, practic, dovada că ești proprietarul platformei.
  const _alti = await db.altiSuperadminiActivi().catch(() => 0);
  if (_alti > 0 && !process.env.ADMIN_PASSWORD) {
    const retras = await db.dezactiveazaContulDeInstalare().catch(() => false);
    if (retras) console.log('[AUTH] Contul de instalare „admin" a fost DEZACTIVAT (există ' + _alti + ' super-admin activ). Autentificarea se face cu conturile personale.');
  }
  // Avertismentul pentru cazul „e singurul super-admin" se dă mai jos, DUPĂ crearea contului —
  // aici, pe o instalare nouă, el încă nu există.

  const adminUser = await db.getUserByUsername('admin');
  if (!adminUser && _alti > 0) {
    // Cineva l-a șters, dar platforma are deja super-admini. NU-l readucem la viață: ar fi exact contul
    // previzibil pe care tocmai l-am retras.
    console.log('[AUTH] Contul „admin" nu există și NU se recreează — platforma are ' + _alti + ' super-admin activ.');
  } else if (!adminUser) {
    const hash = await bcrypt.hash(adminPass, 10);
    // proprietarul platformei = super-admin (vede/administrează toate companiile)
    await db.createUser('admin', hash, 'superadmin');
    console.log('[AUTH] Utilizator super-admin creat (admin)');
    if (_generata) {
      console.log('\n══════════════════════════════════════════════════════════════');
      console.log('  PAROLA CONTULUI „admin" (generată acum, se afișează O SINGURĂ DATĂ):');
      console.log('  ' + adminPass);
      console.log('  Notează-o ACUM și schimb-o din aplicație după prima autentificare.');
      console.log('══════════════════════════════════════════════════════════════\n');
    }
  } else if (process.env.ADMIN_PASSWORD) {
    // Calea de avarie. Resetează parola ȘI reactivează contul — altfel schimbarea parolei n-ar folosi
    // la nimic: autentificarea respinge contul dezactivat înainte să se uite la parolă.
    const hash = await bcrypt.hash(adminPass, 10);
    await db.updateUserPassword(adminUser.id, hash);
    const reactivat = await db.reactiveazaContulDeInstalare().catch(() => false);
    console.log('[AUTH] Parola contului „admin" actualizată din ADMIN_PASSWORD' + (reactivat ? ' + cont REACTIVAT (cale de avarie)' : ''));
    if (reactivat) console.warn('[AUTH] ⚠ Contul de instalare e activ din nou. Șterge ADMIN_PASSWORD din mediu după ce-ți recapeți accesul — altfel se reactivează la fiecare pornire.');
  }

  // Avertismentul se dă AICI, după ce știm sigur că respectivul cont există: pe o instalare nouă,
  // verificarea de mai sus rulează înainte ca „admin" să fie creat.
  if (_alti === 0) {
    const _a = await db.getUserByUsername('admin');
    if (_a && _a.active !== false) console.warn('[AUTH] ⚠ Contul „admin" e ÎNCĂ activ fiindcă e singurul super-admin. Creează-ți un cont personal de super-admin — „admin" se va retrage singur la următoarea pornire.');
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
  // Backfill o singură dată: ultima valoare CAN sticky din istoric, pentru devices fără last_can persistat încă.
  const stickyBackfill = {};
  try { (await db.getLastStickyCan()).forEach(function (r) { stickyBackfill[r.imei] = r.io_data; }); } catch (e) { console.warn('[CAN] backfill skip:', e.message); }
  const deviceInfoMap = {};
  for (const dev of allDevices) {
    deviceInfoMap[dev.imei] = { name: dev.name, vehicle_type: dev.vehicle_type, plate: dev.plate };
    if (dev.status === 'archived') archivedImeis.add(dev.imei); // oprește ingestul pentru arhivate de la pornire

    // Restaurează snapshot-ul CAN sticky (carburant/odometru) → supraviețuiește restartului serverului
    let _seedIo = null, _seedTs = null;
    if (dev.last_can && typeof dev.last_can === 'object') { _seedTs = dev.last_can._ts || null; _seedIo = _stickyOf(dev.last_can); }
    else if (stickyBackfill[dev.imei]) { _seedIo = _stickyOf(stickyBackfill[dev.imei]); }
    if (_seedIo && Object.keys(_seedIo).length) { lastCanIo.set(dev.imei, { io: _seedIo, ts: _seedTs }); lastCanPersistTs.set(dev.imei, _seedTs || 0); }
  }
  for (const pos of lastPositions) {
    if (archivedImeis.has(pos.imei)) continue; // NU încărca vehiculele arhivate în harta live la pornire
    const info = deviceInfoMap[pos.imei] || {};
    let _io = pos.io_data || {};
    let _stale = false;
    // dacă ultimul pachet (probabil cu motorul oprit) n-are carburant/odometru, completează din snapshot-ul restaurat
    const _snap = lastCanIo.get(pos.imei);
    if (_snap) { const _f = Object.assign({}, _io); if (_fillSticky(_f, _snap.io)) { _io = _f; _stale = true; } }
    livePositions.set(pos.imei, {
      imei: pos.imei,
      timestamp: pos.timestamp,
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      angle: pos.angle,
      satellites: pos.satellites,
      io: _io,
      can_stale: _stale,
      // seed histerezis „s-a mișcat recent" din ultima poziție (dacă mergea) → status corect imediat după restart, până la primul pachet
      moved_at: ((pos.speed || 0) > 3) ? new Date(pos.timestamp).getTime() : null,
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
    } catch (e) { console.warn('[DEMO] seed:', e.message); }
  } else {
    // DEMO_DISABLED=true NU mai șterge compania demo. De când demo-ul se acordă la cerere, compania e parte
    // din produs (acolo trăiesc conturile temporare aprobate) — ștergerea ar rupe fluxul de vânzare.
    // Comutatorul oprește acum DOAR simulatorul de poziții: flota demo îngheață, nimic nu se pierde.
    // Ștergerea completă rămâne o operație DELIBERATĂ, din panoul de super-admin, nu un efect al unei variabile.
    try {
      const dc = await db.getCompanyBySlug('demo');
      demoCompanyId = dc ? dc.id : null;
      console.log('[DEMO] DEMO_DISABLED=true → simulatorul e OPRIT' + (dc ? ' (compania demo rămâne, pentru conturile acordate la cerere)' : ' (nu există companie demo)'));
    } catch (e) { console.warn('[DEMO] stare:', e.message); demoCompanyId = null; }
  }
  // Evaluarea stării se face pe AMBELE ramuri, altfel „Stare producție" ar arăta „neinițializat" până la
  // prima acțiune administrativă. Verificarea periodică e singurul lucru care observă EXPIRAREA unui termen:
  // `userAccessExpired` e verificat leneș, per cerere, deci fără ea simulatorul ar merge până la următorul login.
  await syncDemoSim('pornire server').catch((e) => console.warn('[DEMO] sync:', e.message));
  setInterval(() => syncDemoSim('verificare periodică').catch(() => {}), 10 * 60 * 1000);

  // Error middleware — înregistrat ULTIMUL, după toate rutele (definite la încărcarea modulului).
  app.use(errorMiddleware);

  // Prune jurnal erori: la pornire + zilnic (păstrează ultimele 2000).
  db.pruneErrors(2000).catch(() => {});
  setInterval(() => db.pruneErrors(2000).catch(() => {}), 24 * 60 * 60 * 1000);

  // Backup zilnic al datelor de business (off-site dacă BACKUP_S3_* e configurat; altfel doar status + download manual). Vezi backup.js.
  // Starea ULTIMEI rulări se încarcă din bază: pe Railway procesul reporneşte des, iar fără asta ecranul
  // spunea „nicio rulare de la pornirea serverului" chiar cu bucket-ul plin de copii.
  await backup.loadState(db).catch(() => {});
  setTimeout(() => backup.runScheduledBackup(db, COMMIT_VER).catch(() => {}), 5 * 60 * 1000);
  setInterval(() => backup.runScheduledBackup(db, COMMIT_VER).catch(() => {}), 24 * 60 * 60 * 1000);

  // Arhivarea POZIȚIILOR pe S3, zi cu zi. Rulează doar dacă bucket-ul e configurat și e independentă de
  // retenție: exportă mereu zilele complete rămase, deci până când ștergerea ajunge la ele (180 de zile
  // implicit) copia există de mult. Fără ea, retenția ar fi fost o pierdere definitivă de date.
  if (backup.s3Configured()) {
    setTimeout(() => backup.runPositionsExport(db).catch(() => {}), 8 * 60 * 1000);
    setInterval(() => backup.runPositionsExport(db).catch(() => {}), 24 * 60 * 60 * 1000);
  }

  // Pornește serverul TCP — reîncarcă allow-list-ul (mod strict) chiar ÎNAINTE, ca să includă orice device creat/seed-uit la pornire
  await loadRegisteredImeis();
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
  // Întreținere memorie + retenție constatări (rulează la 6h; mapele in-memory creșteau NELIMITAT —
  // cea mai expusă e _clientErrHits, cheiată pe IP pe un endpoint PUBLIC = creștere provocabilă din exterior).
  setInterval(() => {
    const now = Date.now();
    try { for (const [k, v] of _clientErrHits) if (now - v.ts > 5 * 60000) _clientErrHits.delete(k); } catch (e) {}
    try { for (const [k, v] of _demoReqHits) if (now - v.ts > DEMO_REQ_WINDOW_MS) _demoReqHits.delete(k); } catch (e) {}
    try { for (const [k, v] of alertCooldowns) if (now - v > 24 * 3600000) alertCooldowns.delete(k); } catch (e) {}
    try { for (const [k, v] of _userEvtCooldown) if (now - v > 24 * 3600000) _userEvtCooldown.delete(k); } catch (e) {}
    try { for (const [k, v] of _wsCooldown) if (now - v > 24 * 3600000) _wsCooldown.delete(k); } catch (e) {}
    db.pruneAgentFindings(parseInt(process.env.FINDINGS_RETENTION_DAYS) || 90)
      .then(n => { if (n) console.log(`[RETENȚIE] Șterse ${n} constatări de agenți mai vechi de 90 zile`); })
      .catch(() => {});
  }, 6 * 60 * 60 * 1000);

  // ─── Retenție poziții (opțională: setează POSITION_RETENTION_DAYS) ───
  // Rulează la 6 ore, nu zilnic: fiecare rulare are atunci puțin de șters, iar bugetul de timp per rulare
  // (RETENTION_BUDGET_MS) e suficient. Prima rulare e amânată — la pornire serverul are deja de încărcat
  // istoricul în memorie și de acceptat conexiunile trackerelor.
  const retentionDays = parseInt(process.env.POSITION_RETENTION_DAYS);
  if (retentionDays > 0) {
    const runRetention = () => db.deleteOldPositionsDetail(retentionDays)
      .then(r => {
        _retentionLast = { at: Date.now(), rows: r.total, batches: r.loturi, exhausted: r.epuizat, error: null };
        if (r.total) console.log('[RETENȚIE] Șterse ' + r.total + ' poziții mai vechi de ' + retentionDays + ' zile, în ' + r.loturi + ' loturi' + (r.epuizat ? ' (buget de timp epuizat — se continuă la rularea următoare)' : ''));
      })
      // Înghițirea tăcută de până acum era exact greșeala care face ca „nu se șterge nimic" să treacă
      // neobservat luni de zile: singurul semn ar fi fost creșterea bazei.
      .catch(e => { _retentionLast = { at: Date.now(), rows: 0, batches: 0, exhausted: false, error: e.message }; console.warn('[RETENȚIE] eșuat:', e.message); });
    setTimeout(runRetention, 60 * 1000);
    setInterval(runRetention, 6 * 60 * 60 * 1000);
  }

  // Retenție ARHIVĂ (positions_archive): dispozitivele arhivate se păstrează 2 ani (730z), apoi se purjează.
  // Rulează mereu (PG + PGlite). Configurabil prin ARCHIVE_RETENTION_DAYS.
  const archiveRetentionDays = parseInt(process.env.ARCHIVE_RETENTION_DAYS) || 730;
  const runArchivePurge = () => db.purgeArchivedPositions(archiveRetentionDays)
    .then(n => { if (n) console.log(`[ARHIVĂ] Purjate ${n} poziții arhivate mai vechi de ${archiveRetentionDays} zile`); })
    .catch(e => console.warn('[ARHIVĂ] purge skip:', e.message));
  setTimeout(runArchivePurge, 10000);
  setInterval(runArchivePurge, 24 * 60 * 60 * 1000);

  // Workere Faza 4: detecție automată curse + alerte expirare documente
  setTimeout(() => runTripDetection().then(n => { if (n) console.log('[TRIPS] ' + n + ' curse detectate'); }), 3000);
  setInterval(() => runTripDetection(), 15 * 60 * 1000);
  setTimeout(() => checkExpiries(), 5000);
  setInterval(() => checkExpiries(), 12 * 60 * 60 * 1000);
  setTimeout(() => fixOldNotifTitles(), 7000); // curățare unică a titlurilor vechi cu IMEI (idempotent, best-effort)

  // #12: camioane care transmit CAN dar au can_interface NESETAT → maparea standard poate greși ID-urile FMS.
  // Surfacem (notificare deduplicată, vizibilă super-admin + companie) ca super-adminul să seteze interfața.
  async function checkUnconfiguredTruckInterfaces() {
    try {
      const r = await db.pool.query(
        "SELECT imei, vehicle_type, company_id FROM devices WHERE can_interface IS NULL AND status IS DISTINCT FROM 'archived' AND LOWER(COALESCE(vehicle_type,'')) IN ('camion','tir','autobuz','autocar')"
      );
      for (const d of r.rows) {
        const pos = livePositions.get(d.imei);
        if (!pos || !pos.io) continue;
        if (!Object.keys(pos.io).some(k => k.startsWith('can_'))) continue; // doar dacă chiar transmite CAN
        await notify({
          type: 'config', severity: 'warning', imei: d.imei, companyId: d.company_id, dedupHours: 24 * 7,
          title: 'Interfață CAN nesetată · ' + d.imei,
          body: 'Vehicul „' + (d.vehicle_type || 'camion') + '" transmite date CAN, dar interfața nu e configurată — unele valori pot fi interpretate greșit. Super-admin: setează „FMS" pe vehicul (fișă → interfață CAN).',
          data: { key: 'iface-unset-' + d.imei, imei: d.imei }
        });
      }
    } catch (e) { console.error('[IFACE-CHECK]', e.message); }
  }
  setTimeout(() => checkUnconfiguredTruckInterfaces(), 60000);
  setInterval(() => checkUnconfiguredTruckInterfaces(), 6 * 60 * 60 * 1000);
  // Rapoarte programate — rulează scadențele la fiecare 5 min (doar dacă modulul e disponibil)
  if (reportSchedules) setInterval(() => reportSchedules.tickDue({ db, reports, reportExport, channels, notify })
    .then(r => { if (r && r.length) console.log('[PROGRAMĂRI] ' + r.length + ' rapoarte rulate'); })
    .catch(e => console.error('[PROGRAMĂRI]', e.message)), 5 * 60 * 1000);

  // e-Transport: trimite pozițiile la ANAF la fiecare 3 min (no-op dacă nu e configurat)
  if (etransportEnabled()) { console.log('[e-Transport] Activ — trimitere poziții la ANAF'); setInterval(sendEtransportPositions, 3 * 60 * 1000); }

  // Agenți AI: agenții rulează automat din oră în oră (prima dată la 1 min după pornire) — o oră e realist și pentru flote mari
  if (agents) { setTimeout(runAgentsWorker, 60 * 1000); setInterval(runAgentsWorker, 60 * 60 * 1000); }

  // Webhooks: reîmprospătează flag-ul „există webhook-uri active" (fast-path pentru evaluateUserEvents).
  setTimeout(refreshAnyWebhooks, 8000);
  setInterval(refreshAnyWebhooks, 60 * 1000);

  // Override „contact din DIN1": încarcă lista IMEI-urilor cu override (la pornire + periodic).
  setTimeout(refreshDin1Set, 5000);
  setInterval(refreshDin1Set, 60 * 1000);

  // Reconciliere „arhivat": scoate din harta live orice vehicul arhivat (boot-seed/drift) + re-sincronizează
  // setul cu DB. Rulează curând după pornire (după ce s-a încărcat livePositions) + la fiecare 2 min.
  setTimeout(reconcileArchived, 6000);
  setInterval(reconcileArchived, 2 * 60 * 1000);
  setInterval(loadRegisteredImeis, 2 * 60 * 1000); // backstop: re-sincronizează allow-list-ul (mod strict) cu DB

  // Notificare facturare: la intrarea în grație anunță adminii companiei (verificare la pornire + orar).
  setTimeout(billingReminderTick, 30000);
  setInterval(billingReminderTick, 60 * 60 * 1000);
  // Facturare automată lunară: la scurt timp după boot + de ~4x/zi (idempotent — o factură/companie/lună, pe billing_day).
  setTimeout(() => billingAutoInvoiceTick().then(r => { if (r && r.issued && r.issued.length) console.log('[BILLING] auto-facturare: ' + r.issued.length + ' facturi emise'); }).catch(() => {}), 90 * 1000);
  setInterval(() => billingAutoInvoiceTick().catch(() => {}), 6 * 60 * 60 * 1000);
  // Program de lucru (supraveghere): încarcă programele la boot + re-sincronizează la 3 min.
  loadWorkSchedules().catch(() => {});
  setInterval(() => loadWorkSchedules().catch(() => {}), 3 * 60 * 1000);

  // Keepalive DB: ping ușor la 45s ca pool-ul PG să rămână CALD (/api/live e in-memory și nu atinge DB-ul →
  // primul query din panou reconecta lent la Railway; acum prima deschidere e instant).
  setInterval(function () { try { db.pool.query('SELECT 1').catch(function () {}); } catch (e) {} }, 45000);

  // ───────────────────────────────────────────────────────────────
  // Cleanup periodic peste livePositions — fără el, vehiculele care își pierd semnalul GSM
  // rămân „online" în UI cu timestamp tot mai vechi („acum 24 min", „acum 2h", etc.) până
  // la restart de proces. Înainte de fix, Map-ul nu era niciodată șters (grep livePositions.delete = 0).
  //
  //  - LIVE_STALE_MS = 5 min  → marchez vehiculul stale (speed=0) + broadcast WS „stale"
  //  - LIVE_PURGE_MS = 24h   → șterg complet din Map (evită memory leak la nesfârșit)
  //  - Bonus: dacă mai există socket activ asociat unui IMEI stale → e clar zombie → socket.destroy()
  // ───────────────────────────────────────────────────────────────
  const LIVE_STALE_MS = 5 * 60 * 1000;
  const LIVE_PURGE_MS = parseInt(process.env.LIVE_PURGE_MS) || 24 * 60 * 60 * 1000; // configurabil în prod
  // Plafon dur de memorie: la creștere anormală (IMEI-uri garbage din TCP malformat, atac) evict cele mai vechi.
  // O flotă sănătoasă de 2000 vehicule NU atinge plafonul → fără impact pe UX normal.
  const LIVE_MAX = parseInt(process.env.LIVE_MAX) || 5000;
  setInterval(() => {
    const now = Date.now();
    let staled = 0, purged = 0;
    for (const [imei, live] of livePositions) {
      const ts = new Date(live.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      const age = now - ts;

      if (age > LIVE_PURGE_MS) {
        livePositions.delete(imei);
        if (typeof lastCanIo !== 'undefined' && lastCanIo.delete) lastCanIo.delete(imei);
        broadcastWs({ type: 'disconnect', data: { imei, reason: 'purged' } });
        purged++;
        continue;
      }

      if (age > LIVE_STALE_MS && !live.stale) {
        live.stale = true;
        live.speed = 0;
        livePositions.set(imei, live);
        // Socket zombie? Distruge-l ca să elibereze handle-ul kernel.
        const conn = activeConnections.get(imei);
        if (conn && conn.socket && !conn.socket.destroyed) {
          try { conn.socket.destroy(); } catch (e) {}
        }
        broadcastWs({ type: 'stale', data: { imei, lastSeen: live.timestamp } });
        staled++;
      }
    }
    // Plafon dur: dacă tot depășim LIVE_MAX după purjare, evict cele mai vechi (anti-OOM la creștere anormală).
    let evicted = 0;
    if (livePositions.size > LIVE_MAX) {
      const sorted = Array.from(livePositions.entries())
        .sort((a, b) => (new Date(a[1].timestamp).getTime() || 0) - (new Date(b[1].timestamp).getTime() || 0));
      const toEvict = livePositions.size - LIVE_MAX;
      for (let i = 0; i < toEvict; i++) {
        const imei = sorted[i][0];
        livePositions.delete(imei);
        if (typeof lastCanIo !== 'undefined' && lastCanIo.delete) lastCanIo.delete(imei);
        evicted++;
      }
      console.warn(`[LIVE-CLEANUP] PLAFON: evicted ${evicted} cele mai vechi (size depășea ${LIVE_MAX}). Verifică sursa de creștere.`);
    }
    if (staled || purged || evicted) console.log(`[LIVE-CLEANUP] stale=${staled}, purged=${purged}, evicted=${evicted}, size=${livePositions.size}`);
  }, 30 * 1000); // sweep la 30s
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
