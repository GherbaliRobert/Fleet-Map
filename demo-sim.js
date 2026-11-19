// demo-sim.js — mișcă flota de probă a COMPANIEI DEMO pe hartă și îi scrie istoricul.
// 19.11 (Alin: „varianta 2”): flota e cea din demo_flota.js — opt mașini cu numerele de pe site, cu zile întregi de mers
// (curse, opriri, alimentări, ralanti, motorul oprit noaptea). Simulatorul doar CITEȘTE planul: harta live = `stareaLa(acum)`,
// istoricul = pozițiile planului, scrise pe măsură ce trece timpul. Până pe 19.11 erau cinci camioane care se învârteau în cerc.
//
// Merge DOAR cât există un cont demo valabil (sau când îl pornim noi, pe termen scurt) — vezi syncDemoSim în server.js.
// La pornire „umple” istoricul lipsă (cel mult ultimele `zileIstoric` zile; o zi lipsă se reface identic, planul e același),
// socotește cursele zilelor și șterge ce e mai vechi de o lună. Apoi scrie din minut în minut și refăce cursele la 15 minute.
const flota = require('./demo_flota');

const DEMO_IMEIS = flota.IMEIS;
const PAS_LIVE_MS = 3000, PAS_SCRIERE_MS = 60000, PAS_CURSE_MS = 15 * 60000;
const LOT = 400;   // pozițiile se scriu în loturi (o cerere = un lot)

let started = false, _timer = null, _deps = null, _gata = false, _ultima = {}, _ultimeleCurse = 0, _scriu = false;
let _stare = { umplute: 0, zile: 0, curse: 0, eroare: null, gataLa: null };

function isRunning() { return started; }
function stare() { return Object.assign({ running: started, gata: _gata }, _stare); }
function stop() {
  if (!started) return false;
  clearInterval(_timer); _timer = null; started = false; _gata = false; _deps = null;
  console.log('[DEMO] Simulator oprit');
  return true;
}

// Ce trimite aparatul acum, pentru harta live (aceeași formă ca pozițiile reale din livePositions).
function pozitieLive(m, acum, azi) {
  const p = flota.stareaLa(m.imei, acum, azi);
  return { imei: m.imei, timestamp: new Date(acum).toISOString(), latitude: p.lat, longitude: p.lng, speed: p.v, angle: p.unghi,
    satellites: 12, io: p.io, name: m.nume, vehicle_type: m.tip, plate: m.nr };
}
function _record(x) {
  return { timestamp: new Date(x.t).toISOString(), gps: { latitude: x.lat, longitude: x.lng, altitude: 90, angle: x.unghi, speed: x.v, satellites: 12 }, priority: 0, io: x.io };
}
async function _scrie(db, imei, puncte) {
  for (let i = 0; i < puncte.length; i += LOT) await db.insertPositions(imei, puncte.slice(i, i + LOT).map(_record));
}
// Cursele unei zile, din pozițiile din bază — ca workerul de curse al flotelor adevărate (detectAndSaveTrips), care le sare pe
// mașinile demo.
async function _curseZi(db, reports, imei, deLa, pana) {
  const pts = await db.getDeviceHistory(imei, new Date(deLa).toISOString(), new Date(pana).toISOString());
  if (pts.length < 2) return 0;
  const { trips } = reports.segmentTrack(pts, 5 * 60);
  const mapped = trips.map(function (tr) {
    return { start: tr.start, end: tr.end, durationSec: tr.durationSec, distanceKm: tr.distanceKm, maxSpeed: tr.maxSpeed, avgSpeed: tr.avgSpeed,
      startLat: tr.startP.latitude, startLng: tr.startP.longitude, endLat: tr.endP.latitude, endLng: tr.endP.longitude };
  });
  await db.saveTripsForRange(imei, new Date(deLa).toISOString(), new Date(pana).toISOString(), mapped);
  return mapped.length;
}

async function umple(deps) {
  const db = deps.db, reports = deps.reports;
  const acum = Date.now(), azi = flota.ziuaLa(acum);
  const zile = Math.max(1, Math.min(flota.ZILE_ISTORIC, Number(deps.zileIstoric) || flota.ZILE_ISTORIC));
  const prima = azi - zile + 1, deLa0 = flota.inceputZi(prima);
  let umplute = 0, curse = 0;
  for (const m of flota.MASINI) {
    if (!started) return;
    let ultima = 0;
    try { const r = await db.pool.query('SELECT MAX(timestamp) AS t FROM positions WHERE imei = $1', [m.imei]); ultima = r.rows[0] && r.rows[0].t ? new Date(r.rows[0].t).getTime() : 0; } catch (e) { ultima = 0; }
    const deLa = Math.max(ultima, deLa0 - 1);
    const puncte = flota.puncteIntre(m.imei, deLa, acum, azi);
    await _scrie(db, m.imei, puncte);
    umplute += puncte.length;
    _ultima[m.imei] = acum;
    // cursele: din ziua primei poziții scrise acum (sau de azi) până azi
    for (let i = Math.max(prima, flota.ziuaLa(Math.max(deLa, deLa0))); i <= azi; i++) {
      if (!started) return;
      curse += await _curseZi(db, reports, m.imei, flota.inceputZi(i), Math.min(acum, flota.inceputZi(i + 1) - 1));
    }
    // ce e mai vechi de o lună pleacă (planul îl poate reface oricând)
    try { if (db.stergeIstoricMaiVechiDe) await db.stergeIstoricMaiVechiDe(m.imei, 1); } catch (e) {}
  }
  try { await db.pool.query('UPDATE devices SET last_seen = NOW() WHERE imei = ANY($1)', [DEMO_IMEIS]); } catch (e) {}
  _ultimeleCurse = acum;
  _stare = { umplute: umplute, zile: zile, curse: curse, eroare: null, gataLa: new Date().toISOString() };
  console.log('[DEMO] Istoricul flotei demo e la zi: ' + umplute + ' poziții noi, ' + curse + ' curse, ultimele ' + zile + ' zile');
}

async function _scrieMinutul(acum) {
  const deps = _deps; if (!deps || _scriu) return;
  _scriu = true;
  try {
    const azi = flota.ziuaLa(acum);
    for (const m of flota.MASINI) {
      const de = _ultima[m.imei] || (acum - PAS_SCRIERE_MS);
      const puncte = flota.puncteIntre(m.imei, de, acum, azi);
      if (puncte.length) await _scrie(deps.db, m.imei, puncte);
      _ultima[m.imei] = acum;
    }
    try { await deps.db.pool.query('UPDATE devices SET last_seen = NOW() WHERE imei = ANY($1)', [DEMO_IMEIS]); } catch (e) {}
    if (acum - _ultimeleCurse >= PAS_CURSE_MS) {
      _ultimeleCurse = acum;
      const z0 = flota.inceputZi(azi);
      for (const m of flota.MASINI) {
        await _curseZi(deps.db, deps.reports, m.imei, z0, acum);
        if (acum - z0 < 2 * 3600000) await _curseZi(deps.db, deps.reports, m.imei, flota.inceputZi(azi - 1), z0 - 1);   // după miezul nopții, și ieri întreg
      }
    }
  } catch (e) { _stare.eroare = e.message; }
  finally { _scriu = false; }
}

function start(deps) {
  if (started) return false;
  started = true; _deps = deps; _gata = false; _ultima = {};
  let ultimaScriere = Date.now();
  const tick = function () {
    const acum = Date.now(), azi = flota.ziuaLa(acum);
    for (const m of flota.MASINI) {
      const pos = pozitieLive(m, acum, azi);
      deps.livePositions.set(m.imei, pos);
      try { deps.broadcastWs({ type: 'position', data: pos }); } catch (e) { /* un client căzut nu oprește harta */ }
    }
    if (_gata && acum - ultimaScriere >= PAS_SCRIERE_MS) { ultimaScriere = acum; _scrieMinutul(acum); }
  };
  _timer = setInterval(tick, PAS_LIVE_MS);
  tick();
  umple(deps).then(function () {
    if (!started) return;
    _gata = true; ultimaScriere = Date.now();
    if (typeof deps.laGata === 'function') { try { deps.laGata(); } catch (e) {} }
  }).catch(function (e) { _stare.eroare = e.message; _gata = true; console.warn('[DEMO] istoricul flotei demo:', e.message); });
  console.log('[DEMO] Simulator pornit (' + DEMO_IMEIS.length + ' mașini de probă, la ' + (PAS_LIVE_MS / 1000) + ' s)');
  return true;
}

module.exports = { start, stop, isRunning, stare, umple, pozitieLive, DEMO_IMEIS };
