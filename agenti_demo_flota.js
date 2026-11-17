'use strict';
// Flota de probă a telefonului cu agenți de pe prima pagină (17.11; Alin, la machete: „hai să facem varianta B să o testez").
// Opt mașini cu o zi întreagă de poziții, pe care rulează AGENȚII ADEVĂRAȚI (agents.runAll, aceleași praguri ca în aplicație).
// Ce scriu ei e ce scrie telefonul din public/js/agenti-demo.js: verify_agenti_demo.js rulează agenții pe flota asta și compară,
// rând cu rând. Schimbi un text în agents.js → proba pică până schimbi și telefonul (sau flota, dacă s-a schimbat regula).
// Doar pentru probe: nu-l cheamă serverul.
const insight = require('./insight');

const MIN = 60000;
// Mașinile: numele din aplicație = numărul (ca la multe firme), felul din fișă (camioanele intră sub Reg. 561).
const MASINI = [
  { imei: 'DEMO-AG-1', nr: 'B 204 RAT', tip: 'Dubă' },
  { imei: 'DEMO-AG-2', nr: 'B 77 TIR', tip: 'Autotractor' },
  { imei: 'DEMO-AG-3', nr: 'B 18 VAN', tip: 'Dubă' },
  { imei: 'DEMO-AG-4', nr: 'B 31 LOG', tip: 'Auto' },
  { imei: 'DEMO-AG-5', nr: 'B 90 CTR', tip: 'Camion' },
  { imei: 'DEMO-AG-6', nr: 'B 52 DUB', tip: 'Dubă' },
  { imei: 'DEMO-AG-7', nr: 'B 63 FRG', tip: 'Dubă' },
  { imei: 'DEMO-AG-8', nr: 'B 88 AUT', tip: 'Auto' }
];
// Km de azi și de ieri, până la aceeași oră (RA Client citește cursele, nu pozițiile).
const KM_AZI = { 'DEMO-AG-1': 61, 'DEMO-AG-2': 95, 'DEMO-AG-3': 30, 'DEMO-AG-4': 0, 'DEMO-AG-5': 412, 'DEMO-AG-6': 210, 'DEMO-AG-7': 250, 'DEMO-AG-8': 182 };
const KM_IERI = { 'DEMO-AG-1': 140, 'DEMO-AG-2': 310, 'DEMO-AG-3': 85, 'DEMO-AG-4': 22, 'DEMO-AG-5': 0, 'DEMO-AG-6': 190, 'DEMO-AG-7': 205, 'DEMO-AG-8': 155 };
// Ora la care „deschizi" pagina agenților în telefon: 14:30, pe ora României (RA Dispatch caută mașinile nefolosite de la 12:00).
const ORA_TELEFON = { h: 14, m: 30 };
const ZILE_ITP = 12, ZILE_RCA = 19;

// Un drum: pași { dt (secunde de la pasul dinainte), v (km/h), ign, fuel } → poziții spre est, cu distanța din viteză.
function drum(imei, t0, pasi, start) {
  let t = t0, lat = start[0], lng = start[1];
  const out = [];
  for (const p of pasi) {
    t += (p.dt || 0) * 1000;
    const km = ((p.v || 0) * (p.dt || 0)) / 3600; // ce a mers de la pasul dinainte
    lng += km / (111.32 * Math.cos(lat * Math.PI / 180));
    const io = { ignition: p.ign == null ? 1 : p.ign };
    if (p.fuel != null) io.fuel_level_liters = p.fuel;
    if (p.card) io.driver_card_id = p.card;
    out.push({ imei, timestamp: new Date(t).toISOString(), latitude: lat, longitude: lng, speed: p.v || 0, angle: 90, io_data: io });
  }
  return out;
}
const rep = (n, pas) => Array.from({ length: n }, () => Object.assign({}, pas));

function flota(acum) {
  const zi = new Date(insight.perioada({ period: 'today' }, acum).from).getTime(); // miezul nopții, ora României
  const la = (h, m) => zi + (h * 60 + (m || 0)) * MIN;
  const now = la(ORA_TELEFON.h, ORA_TELEFON.m);
  const ist = {};
  // B 204 RAT: 10:30–11:25, ~61 km cu 6 frânări și 4 accelerări bruște; rezervorul scade de la 80 la 38 L; parcat la 14:10.
  {
    const pasi = [{ dt: 0, v: 60, fuel: 80 }];
    const franare = () => [{ dt: 5, v: 10, fuel: 80 }, { dt: 30, v: 30, fuel: 80 }, { dt: 30, v: 50, fuel: 80 }, { dt: 30, v: 60, fuel: 80 }];
    const accelerare = () => [{ dt: 30, v: 30, fuel: 80 }, { dt: 30, v: 10, fuel: 80 }, { dt: 5, v: 50, fuel: 80 }, { dt: 30, v: 60, fuel: 80 }];
    // ~61 km: cu 6 frânări și 4 accelerări pe atâta drum, scorul eco iese 54/100 (formula lui RA Optimize, din agents.js).
    for (let i = 0; i < 6; i++) { pasi.push(...rep(11, { dt: 30, v: 60, fuel: 80 })); pasi.push(...franare()); }
    for (let i = 0; i < 4; i++) { pasi.push(...rep(7, { dt: 30, v: 60, fuel: 80 })); pasi.push(...accelerare()); }
    pasi.push(...rep(3, { dt: 30, v: 60, fuel: 80 }));
    pasi.push({ dt: 30, v: 60, fuel: 38 }); // scăderea: 42 L între două citiri
    pasi.push(...rep(3, { dt: 30, v: 60, fuel: 38 }));
    ist['DEMO-AG-1'] = drum('DEMO-AG-1', la(10, 30), pasi, [44.43, 26.05]);
    const ult = ist['DEMO-AG-1'][ist['DEMO-AG-1'].length - 1];
    ist['DEMO-AG-1'].push(Object.assign({}, ult, { timestamp: new Date(now - 20 * MIN).toISOString(), speed: 0, io_data: { ignition: 0, fuel_level_liters: 38 } }));
  }
  // B 77 TIR: 06:00–07:30 pe drum, apoi parcat; ultima poziție la 11:20 (de atunci nu mai trimite).
  ist['DEMO-AG-2'] = drum('DEMO-AG-2', la(6, 0), [{ dt: 0, v: 63 }, ...rep(90, { dt: 60, v: 63 }), ...rep(5, { dt: 60 * 46, v: 0, ign: 0 })], [44.5, 26.1]);
  ist['DEMO-AG-2'].push(Object.assign({}, ist['DEMO-AG-2'][ist['DEMO-AG-2'].length - 1], { timestamp: new Date(now - 190 * MIN).toISOString() }));
  // B 18 VAN: 08:00–08:30 pe drum, parcat, apoi cu motorul pornit pe loc de la 12:15 până acum (135 de minute).
  ist['DEMO-AG-3'] = drum('DEMO-AG-3', la(8, 0), [{ dt: 0, v: 60 }, ...rep(30, { dt: 60, v: 60 }), ...rep(7, { dt: 30 * 60, v: 0, ign: 0 })], [44.4, 26.0]);
  { const u = ist['DEMO-AG-3'][ist['DEMO-AG-3'].length - 1]; const t0 = la(12, 15);
    for (let k = 0; k <= 45; k++) ist['DEMO-AG-3'].push(Object.assign({}, u, { timestamp: new Date(t0 + k * 3 * MIN).toISOString(), speed: 0, io_data: { ignition: 1 } })); }
  // B 31 LOG: parcat toată ziua.
  ist['DEMO-AG-4'] = [7, 10, 14].map((h) => ({ imei: 'DEMO-AG-4', timestamp: new Date(la(h, 0)).toISOString(), latitude: 44.45, longitude: 26.08, speed: 0, angle: 0, io_data: { ignition: 0 } }));
  // B 90 CTR: pe drum fără pauză de la 09:50 până acum (4h 40m), cu cardul în tahograf.
  ist['DEMO-AG-5'] = drum('DEMO-AG-5', la(9, 50), [{ dt: 0, v: 60, card: 'RO-DEMO' }, ...rep(280, { dt: 60, v: 60, card: 'RO-DEMO' })], [45.0, 25.0]);
  // B 52 DUB, B 63 FRG, B 88 AUT: pe drum acum; primele două au stat cu motorul pornit 30 și 25 de minute.
  ist['DEMO-AG-6'] = drum('DEMO-AG-6', la(7, 0), [{ dt: 0, v: 70 }, ...rep(150, { dt: 60, v: 70 }), ...rep(10, { dt: 180, v: 0 }), ...rep(180, { dt: 60, v: 50 })], [46.0, 24.0]);
  { const p = ist['DEMO-AG-6']; const dupa = now - Date.parse(p[p.length - 1].timestamp); p.forEach((x) => { x.timestamp = new Date(Date.parse(x.timestamp) + dupa).toISOString(); }); }
  ist['DEMO-AG-7'] = drum('DEMO-AG-7', la(8, 0), [{ dt: 0, v: 62 }, ...rep(240, { dt: 60, v: 62 }), ...rep(5, { dt: 300, v: 0 }), ...rep(5, { dt: 300, v: 0, ign: 0 }), ...rep(130, { dt: 60, v: 62 })], [46.5, 23.5]);
  { const p = ist['DEMO-AG-7']; const dupa = now - Date.parse(p[p.length - 1].timestamp); p.forEach((x) => { x.timestamp = new Date(Date.parse(x.timestamp) + dupa).toISOString(); }); }
  ist['DEMO-AG-8'] = drum('DEMO-AG-8', la(10, 0), [{ dt: 0, v: 40 }, ...rep(270, { dt: 60, v: 40 })], [47.0, 23.0]);

  const live = new Map(MASINI.map((m) => {
    const p = ist[m.imei][ist[m.imei].length - 1];
    return [m.imei, Object.assign({}, p, { name: m.nr, plate: m.nr, io: p.io_data })];
  }));
  const cu = (h) => new Date(now + h * 864e5 - 60 * MIN).toISOString(); // termenul, cu o oră înainte de ora de acum
  const acte = [{ id: 1, imei: 'DEMO-AG-4', doc_type: 'itp', expiry_date: cu(ZILE_ITP) }, { id: 2, imei: 'DEMO-AG-5', doc_type: 'rca', expiry_date: cu(ZILE_RCA) }];
  const db = {
    getDeviceHistory: async (imei, from, to) => (ist[imei] || []).filter((p) => p.timestamp >= from && p.timestamp <= to),
    getDeviceFull: async (imei) => { const m = MASINI.find((x) => x.imei === imei); return m ? { vehicle_type: m.tip } : null; },
    getVehicleDocuments: async () => acte,
    getMaintenance: async () => [],
    getTripsSummaryForImeis: async (imeis, from) => (Date.parse(from) < zi ? imeis.map((i) => ({ imei: i, km: KM_IERI[i] })) : imeis.map((i) => ({ imei: i, km: KM_AZI[i] })))
  };
  return { now, base: { db, imeis: MASINI.map((m) => m.imei), livePositions: live, companyId: 1, alertThresholds: {} } };
}

// Rulează cei șase agenți pe flota de probă, cu ceasul pus la ora din telefon. Întoarce { now, findings, meta }.
async function ruleaza(acum) {
  const agents = require('./agents');
  const { now, base } = flota(acum == null ? Date.now() : acum);
  const real = Date.now;
  Date.now = () => now;
  try { const r = await agents.runAll(base); return Object.assign({ now }, r); }
  finally { Date.now = real; }
}

module.exports = { MASINI, ORA_TELEFON, ZILE_ITP, ZILE_RCA, KM_AZI, KM_IERI, flota, ruleaza };

if (require.main === module) {
  ruleaza().then((r) => {
    for (const f of r.findings) console.log(f.agent.padEnd(10), f.severity.padEnd(8), f.title, '||', f.body);
    console.log('meta', JSON.stringify(r.meta));
  });
}
