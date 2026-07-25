// demo_modules.js — 3 module strategice „DEMO-READY": e-Transport (ANAF), E-Toll/Roviniete, Tahograf.
// Filozofie: UI complet + simulare cu mock data; integrările reale se activează prin flag-uri de config
// (stocate în tabela `settings`, NU hardcodat). Când flag-ul devine adevărat + există credențialele,
// modulul trece pe ramura reală. Ramurile reale răspund 501 (onest) până la integrare.
// Reutilizează tabelele existente (etransport, vehicle_documents, tacho_files, drivers) — zero tabele noi.

const crypto = require('crypto');
let anaf = null; try { anaf = require('./anaf'); } catch (e) { /* opțional */ }

// ─────────────────────────────────────────────────────────────────────────────
// Flag-uri Demo/Real (per modul) — citite din settings
// ─────────────────────────────────────────────────────────────────────────────
async function getModuleConfig(db) {
  const get = async (k, def) => { try { const v = await db.getSetting(k); return v == null ? def : v; } catch (e) { return def; } };
  const anafConnected = (await get('anaf_token_connected', 'false')) === 'true';
  const etollProvider = await get('etoll_provider', '');
  const companyCardHost = await get('company_card_host', '');
  return {
    etransport: { mode: anafConnected ? 'real' : 'demo', anafConnected, tokenSet: !!(anaf && anaf.enabled()), test: !!(anaf && anaf.cfg().test) },
    // e-Toll: NU există (încă) integrare reală cu vreun furnizor — cifrele vin din simulator.
    // Selectarea unui furnizor din listă e doar o PREFERINȚĂ salvată, nu o conexiune; de aceea modul
    // rămâne 'demo' până când există API real + credențiale (altfel afișam badge „REAL" peste date inventate).
    etoll: { provider: etollProvider, mode: 'demo', providerSelected: !!etollProvider, integrationReady: false },
    tahograf: { mode: companyCardHost ? 'real' : 'demo', companyCardHost }
  };
}

// ═════════════════════════ MODUL 1: e-Transport ═════════════════════════
// Generator cod UIT DEMO (vizibil ca demo). UIT real ANAF = șir numeric lung emis de API.
function generateDemoUIT() {
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return 'UIT_DEMO_' + Date.now().toString().slice(-8) + '_' + rnd;
}

// Simulare flux GPS: buffer in-memory per transport. Push o coordonată „la fiecare minut" (accelerat în demo).
const _txSim = new Map(); // id -> { timer, buffer, lat, lng, startedAt }
function startTransportSim(id, opts) {
  opts = opts || {};
  stopTransportSim(id);
  const state = { buffer: [], lat: Number(opts.lat) || 44.4268, lng: Number(opts.lng) || 26.1025, startedAt: Date.now(), timer: null };
  const intervalMs = opts.intervalMs || 4000; // demo: 1 punct la ~4s (= „1 minut" comprimat); real: 60000
  state.timer = setInterval(function () {
    state.lat += (Math.random() - 0.3) * 0.004;
    state.lng += (Math.random() - 0.2) * 0.006;
    state.buffer.push({ lat: +state.lat.toFixed(6), lng: +state.lng.toFixed(6), ts: new Date().toISOString(), sent: true });
    if (state.buffer.length > 500) state.buffer.shift();
  }, intervalMs);
  _txSim.set(String(id), state);
  return { ok: true };
}
function stopTransportSim(id) { const s = _txSim.get(String(id)); if (s && s.timer) clearInterval(s.timer); _txSim.delete(String(id)); }
function getTransportSim(id) {
  const s = _txSim.get(String(id));
  if (!s) return { running: false, points: 0, buffer: [], lastPoint: null, elapsedSec: 0 };
  return {
    running: true,
    points: s.buffer.length,
    lastPoint: s.buffer[s.buffer.length - 1] || null,
    buffer: s.buffer.slice(-30),
    elapsedSec: Math.round((Date.now() - s.startedAt) / 1000)
  };
}

// ═════════════════════════ MODUL 2: E-Toll Europa ═════════════════════════
const ETOLL_PROVIDERS = ['DKV', 'Shell', 'AS24', 'Eurowag', 'Telepass'];
const ETOLL_COUNTRIES = [
  { code: 'RO', name: 'România', ratePerKm: 0.00 },  // rovinietă forfetar (nu per km)
  { code: 'HU', name: 'Ungaria', ratePerKm: 0.12 },  // HU-GO
  { code: 'AT', name: 'Austria', ratePerKm: 0.40 },  // GO-Box
  { code: 'SK', name: 'Slovacia', ratePerKm: 0.21 },
  { code: 'DE', name: 'Germania', ratePerKm: 0.19 }   // Toll Collect
];
// Deterministic per seed (imei) → demo stabil între reîncărcări.
function simulateEtollCosts(seed, days) {
  days = days || 30;
  let h = 0; const s = String(seed || 'demo'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  function rng() { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; }
  const perCountry = ETOLL_COUNTRIES.map(function (c) {
    const km = Math.round(rng() * 1800 + (c.code === 'RO' ? 1200 : 0));
    return { code: c.code, country: c.name, km: km, ratePerKm: c.ratePerKm, costEur: +(km * c.ratePerKm).toFixed(2) };
  });
  return {
    periodDays: days,
    totalKm: perCountry.reduce(function (a, x) { return a + x.km; }, 0),
    totalEur: +perCountry.reduce(function (a, x) { return a + x.costEur; }, 0).toFixed(2),
    perCountry: perCountry,
    source: 'km din CAN-bus (Total Mileage io_36/87) — SIMULAT în demo'
  };
}

// ═════════════════════════ MODUL 3: Tahograf ═════════════════════════
const TACHO_DOWNLOAD_CYCLE_DAYS = 28; // card șofer: max 28 zile între descărcări (legal UE)
function driverDownloadStatus(driver, lastDownloadIso) {
  const cycle = TACHO_DOWNLOAD_CYCLE_DAYS;
  let daysSince = null, daysLeft = -1;
  if (lastDownloadIso) {
    daysSince = Math.floor((Date.now() - new Date(lastDownloadIso).getTime()) / 86400000);
    daysLeft = cycle - daysSince;
  }
  const status = daysLeft < 0 ? 'overdue' : (daysLeft <= 3 ? 'due_soon' : 'ok');
  const usedDays = daysSince == null ? cycle : Math.min(daysSince, cycle);
  return {
    driverId: driver.id, driver: driver.name || ('#' + driver.id),
    lastDownload: lastDownloadIso || null,
    daysSinceDownload: daysSince, daysLeft: daysLeft, cycle: cycle,
    status: status,
    progressPct: Math.max(0, Math.min(100, Math.round((usedDays / cycle) * 100)))
  };
}
// Mock .DDD: o zi de activitate cu o încălcare (condus continuu > 4h30 fără pauză de 45 min — Reg. 561/2006).
function mockTachoAnalysis(driverName) {
  const segments = [
    { from: '05:30', to: '10:15', activity: 'DRIVING', min: 285 }, // 4h45 continuu → ÎNCĂLCARE
    { from: '10:15', to: '10:30', activity: 'REST', min: 15 },
    { from: '10:30', to: '13:00', activity: 'DRIVING', min: 150 },
    { from: '13:00', to: '13:45', activity: 'REST', min: 45 },
    { from: '13:45', to: '17:00', activity: 'DRIVING', min: 195 },
    { from: '17:00', to: '17:30', activity: 'WORK', min: 30 }
  ];
  const sum = function (act) { return segments.filter(function (s) { return s.activity === act; }).reduce(function (a, s) { return a + s.min; }, 0); };
  const violations = [];
  let cont = 0;
  for (const s of segments) {
    if (s.activity === 'DRIVING') { cont += s.min; if (cont > 270 && !violations.length) violations.push({ rule: 'Condus continuu > 4h30 fără pauză', detail: 'Segment ' + s.from + '–' + s.to + ' (' + cont + ' min neîntrerupt)', severity: 'critical' }); }
    else if (s.activity === 'REST' && s.min >= 45) cont = 0;
  }
  const driveMin = sum('DRIVING');
  return {
    driver: driverName || 'Șofer Demo',
    date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    totals: { drivingMin: driveMin, restMin: sum('REST'), workMin: sum('WORK'), drivingH: +(driveMin / 60).toFixed(1) },
    segments: segments,
    violations: violations,
    source: 'Fișier .DDD SIMULAT (demo) — analiză Reg. (CE) 561/2006'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// register(app, deps) — montează endpoint-urile. deps vine din server.js (middleware + db).
// ─────────────────────────────────────────────────────────────────────────────
function register(app, deps) {
  const db = deps.db;
  const requireAuth = deps.requireAuth, requireFleet = deps.requireFleet, requireSuperadmin = deps.requireSuperadmin;
  const withCompany = deps.withCompany, requireFeature = deps.requireFeature, auditReq = deps.auditReq || function () {};
  const livePositions = deps.livePositions;
  const ownsRow = deps.ownsRow || (async function () { return true; });
  // Scope tenant robust: super-admin / companyId lipsă sau NaN → null (toate); altfel compania userului.
  function scopeOf(req) { return (req.isSuper || !Number.isInteger(req.companyId)) ? null : req.companyId; }

  // ─── Config Demo/Real (citire: orice user autenticat; scriere: super-admin) ───
  app.get('/api/demo-modules/config', requireAuth, async function (req, res) {
    try { res.json(await getModuleConfig(db)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/demo-modules/config', requireAuth, requireSuperadmin, async function (req, res) {
    try {
      const b = req.body || {};
      if ('anaf_token_connected' in b) await db.setSetting('anaf_token_connected', b.anaf_token_connected ? 'true' : 'false');
      if ('etoll_provider' in b) await db.setSetting('etoll_provider', String(b.etoll_provider || ''));
      if ('company_card_host' in b) await db.setSetting('company_card_host', String(b.company_card_host || ''));
      auditReq(req, 'update', 'demo_config', null, b);
      res.json(await getModuleConfig(db));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══ MODUL 1: e-Transport ═══
  app.post('/api/etransport/uit', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async function (req, res) {
    try {
      const cfg = await getModuleConfig(db);
      if (cfg.etransport.mode === 'real') {
        if (!anaf || !anaf.enabled()) return res.status(400).json({ error: 'Mod real activ, dar tokenul ANAF lipsește. Setează ANAF_ETRANSPORT_TOKEN + ANAF_CIF în variabilele de mediu (vezi ANAF.md).' });
        try {
          const b = req.body || {};
          const r = await anaf.emitUIT({ plate: b.plate || b.nrVehicul, note: b.marfa || b.note }, b);
          if (r.uit) { auditReq(req, 'emit', 'uit-real', null, { uit: r.uit, test: anaf.cfg().test }); return res.json({ uit: r.uit, mode: 'real', index: r.index, test: anaf.cfg().test }); }
          return res.json({ uit: null, pending: true, index: r.index, mode: 'real', test: anaf.cfg().test, note: 'Declarație depusă la ANAF; UIT în prelucrare. Reverifică folosind index ' + r.index + '.' });
        } catch (e) { return res.status(502).json({ error: 'ANAF: ' + e.message }); }
      }
      res.json({ uit: generateDemoUIT(), mode: 'demo', note: 'Cod UIT DEMO. Activare reală: anaf_token_connected=true + ANAF_ETRANSPORT_TOKEN + ANAF_CIF (vezi ANAF.md).' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/etransport/:id/start', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async function (req, res) {
    try {
      if (!(await ownsRow(req, 'etransport', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
      let lat, lng;
      try {
        const list = await db.getEtransports(scopeOf(req));
        const tr = list.find(function (t) { return String(t.id) === String(req.params.id); });
        if (tr && livePositions) { const lp = livePositions.get(tr.imei); if (lp) { lat = lp.latitude; lng = lp.longitude; } }
      } catch (e) {}
      startTransportSim(req.params.id, { lat: lat, lng: lng });
      await db.updateEtransport(parseInt(req.params.id), { status: 'activ' });
      auditReq(req, 'start', 'etransport', req.params.id);
      res.json({ ok: true, mode: (await getModuleConfig(db)).etransport.mode });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/etransport/:id/stop', requireAuth, requireFleet, withCompany, requireFeature('etransport'), async function (req, res) {
    try {
      if (!(await ownsRow(req, 'etransport', req.params.id))) return res.status(403).json({ error: 'Acces interzis' });
      stopTransportSim(req.params.id);
      await db.updateEtransport(parseInt(req.params.id), { status: 'finalizat', end_at: new Date().toISOString() });
      auditReq(req, 'stop', 'etransport', req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/etransport/:id/sim', requireAuth, withCompany, requireFeature('etransport'), function (req, res) {
    res.json(getTransportSim(req.params.id));
  });

  // ═══ MODUL 2: E-Toll / Roviniete ═══
  app.get('/api/etoll/providers', requireAuth, async function (req, res) {
    try { const cfg = await getModuleConfig(db); res.json({ providers: ETOLL_PROVIDERS, selected: cfg.etoll.provider }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/etoll/provider', requireAuth, requireSuperadmin, async function (req, res) {
    try {
      const p = String((req.body && req.body.provider) || '');
      if (p && ETOLL_PROVIDERS.indexOf(p) < 0) return res.status(400).json({ error: 'Furnizor necunoscut' });
      await db.setSetting('etoll_provider', p);
      auditReq(req, 'update', 'etoll_provider', null, { provider: p });
      res.json({ ok: true, selected: p });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Cifrele sunt SIMULATE (generator pseudo-aleator semănat din IMEI) → modulul primește o poartă, ca
  // e-Transport și tahograf. Fără ea, orice client plătitor vedea costuri inventate fără să știe.
  app.get('/api/etoll/costs', requireAuth, withCompany, requireFeature('etoll'), async function (req, res) {
    try {
      const seed = req.query.imei || ('co' + (req.companyId != null ? req.companyId : 'demo'));
      // `simulated: true` = marcaj EXPLICIT pentru clienți: datele sunt generate, nu preluate de la un furnizor.
      res.json(Object.assign({ simulated: true }, simulateEtollCosts(seed, parseInt(req.query.days) || 30)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══ MODUL 3: Tahograf ═══
  // NOTĂ: /api/tacho-status (NU /api/tacho/drivers) — altfel ar fi prins de ruta existentă /api/tacho/:id.
  app.get('/api/tacho-status', requireAuth, withCompany, requireFeature('tahograf'), async function (req, res) {
    try {
      const drivers = await db.getDrivers(scopeOf(req));
      const files = await db.getTachoFiles(scopeOf(req), true); // include fișierele demo — ecranul demonstrativ
      const lastByDriver = {};
      files.forEach(function (f) {
        const k = (f.driver_name || '').trim(); if (!k) return;
        if (!lastByDriver[k] || new Date(f.uploaded_at) > new Date(lastByDriver[k])) lastByDriver[k] = f.uploaded_at;
      });
      res.json(drivers.map(function (d) { return driverDownloadStatus(d, lastByDriver[(d.name || '').trim()] || null); }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/tacho-download/:driverId', requireAuth, requireFleet, withCompany, requireFeature('tahograf'), async function (req, res) {
    try {
      const cfg = await getModuleConfig(db);
      if (cfg.tahograf.mode === 'real') {
        // TODO real: deschide sesiune DDD prin tracker (K-Line/CAN) → fișier real spre Company Card Host.
        return res.status(501).json({ error: 'Descărcare reală neimplementată (mod real). Configurează company_card_host + cablu tahograf.' });
      }
      const drivers = await db.getDrivers(scopeOf(req));
      const drv = drivers.find(function (d) { return String(d.id) === String(req.params.driverId); });
      const analysis = mockTachoAnalysis(drv ? drv.name : 'Șofer Demo');
      // Înregistrează o „descărcare" demo în tacho_files → resetează indicatorul de 28 zile.
      try {
        await db.createTachoFile({
          companyId: req.companyId, imei: null, driverName: drv ? drv.name : 'Demo',
          filename: 'DEMO_' + Date.now() + '.ddd', kind: 'demo', // kind=demo → exclus din lista reală de fișiere tahograf
          periodFrom: analysis.date, periodTo: analysis.date, parsed: analysis, rawB64: ''
        });
      } catch (e) {}
      auditReq(req, 'download', 'tacho', req.params.driverId, { mode: 'demo' });
      res.json({ mode: 'demo', analysis: analysis });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = {
  getModuleConfig,
  generateDemoUIT, startTransportSim, stopTransportSim, getTransportSim,
  ETOLL_PROVIDERS, ETOLL_COUNTRIES, simulateEtollCosts,
  TACHO_DOWNLOAD_CYCLE_DAYS, driverDownloadStatus, mockTachoAnalysis,
  register
};
