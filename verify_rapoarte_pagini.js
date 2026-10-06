// verify_rapoarte_pagini.js — rapoartele citesc TOATĂ perioada, nu primele 50.000 de poziții (Alin, 05.10).
//
//   node verify_rapoarte_pagini.js
//
// De ce: rapoartele citeau cel mult 50.000 de poziții pe mașină, cele mai vechi, fără să spună. O lună a unei mașini care
// merge zilnic are cam atât; „km luna trecută" număra doar primele ~2 săptămâni, iar „Ultima locație" pe o perioadă lungă
// ieșea de la mijlocul ei. Proba păzește:
//   1. pe o bază de probă cu ~3.500 de poziții pe mașină, plafonul coborât la 1.000 și pagini de 300: rapoartele citite pe
//      pagini dau EXACT cifrele citirii dintr-o bucată (fără plafon) — km, consum, costuri, emisii, ralanti, viteză,
//      EcoDrive, clasamentul șoferilor, ore motor, alimentări, ultima locație, statisticile de consum; și cu filtrul zile/ore;
//   2. martorul: citirea veche (oprită la plafon) chiar număra mai puțini km — reparația are ce repara;
//   3. rapoartele care au nevoie de tot traseul deodată (staționări, curse) o SPUN când se opresc: `trunchiat` pe raport,
//      cu ziua până la care s-a citit, plus rândul „Atenție" în legendă (ecran, Excel, PDF), în AI Raport și la RA Insight;
//   4. pe server pornit (plafon 300, pagini de 100, 700 de poziții adevărate în bază): km-ii întregi, ultima locație
//      adevărată, avertismentul la staționări, AI Raport cu cifra întreagă.
'use strict';
// Fără adrese: pe GitHub serviciul de hărți răspunde, iar o adresă găsită în buget la prima rulare și nu la a doua face
// două rapoarte „diferite" (06.10: așa a picat proba acolo, de 5 ori). Proba urmărește CE poziții se citesc, nu adresele,
// deci le cere unui port închis — ca aici, unde rețeaua spre hărți e oprită. Serverul pornit de probă moștenește setarea.
process.env.GEOCODE_URL = 'http://127.0.0.1:9/reverse';
process.env.GEOCODE_MIN_INTERVAL_MS = '0';
process.env.GEOCODE_TIMEOUT_MS = '300';
process.env.RAPOARTE_PLAFON = '1000';
process.env.RAPOARTE_PAGINA = '300';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const reports = require('./reports');
const A = require('./ai_raport');
const I = require('./insight');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── O lună de date, pe două mașini ─────────────────────────────────────────────────────────────────
// În fiecare zi: două drumuri (40 de puncte la 10 s, cu accelerări și frânări bruște, un viraj, o depășire), un ralanti de
// 5 minute, nopți parcate (un punct pe oră). Odometrul CAN și contorul de motorină cresc; nivelul scade, cu o alimentare
// și o scădere suspectă. Cam 3.500 de poziții pe mașină — de 3,5 ori plafonul coborât al probei.
function luna(imei, lat0, lng0) {
  const pts = [];
  let km = 120000, cumul = 5000, nivel = 60, lat = lat0, lng = lng0;
  const t0 = Date.parse('2026-09-01T00:00:00Z');
  for (let zi = 0; zi < 30; zi++) {
    const z0 = t0 + zi * 86400000;
    for (let h = 0; h < 6; h++) pts.push({ ts: z0 + h * 3600000, lat, lng, speed: 0, io: { ignition: 0, can_total_mileage: Math.round(km), fuel_level_liters: Math.round(nivel * 10) / 10, can_fuel_consumed: Math.round(cumul * 10) / 10 } });
    for (let drum = 0; drum < 2; drum++) {
      const s0 = z0 + (7 + drum * 8) * 3600000;
      for (let k = 0; k < 40; k++) {
        // viteze: urcă lin, o accelerare bruscă (+14 km/h în 10 s… nu: 1,4 km/h/s), apoi bruscă reală la k=10 (+80 km/h/10 s)
        let sp = 50 + (k % 7) * 3;
        if (k === 10) sp = 125;            // depășire (limită 90) + accelerare bruscă (≥ 7 km/h/s față de pasul anterior)
        if (k === 11) sp = 30;             // frânare bruscă
        const step = sp / 3600 * 10;       // km în 10 s
        lat += step / 111; km += step; cumul += step * 0.07; nivel -= step * 0.07;
        const ang = k === 20 ? 270 : 0;    // un viraj brusc
        pts.push({ ts: s0 + k * 10000, lat, lng, speed: sp, angle: ang, io: { ignition: 1, can_total_mileage: Math.round(km), fuel_level_liters: Math.round(nivel * 10) / 10, can_fuel_consumed: Math.round(cumul * 10) / 10, can_rpm: 1800 } });
      }
      // ralanti: 5 minute pe loc, cu motorul pornit
      for (let k = 1; k <= 10; k++) { cumul += 0.02; nivel -= 0.02; pts.push({ ts: s0 + 400000 + k * 30000, lat, lng, speed: 0, io: { ignition: 1, can_total_mileage: Math.round(km), fuel_level_liters: Math.round(nivel * 10) / 10, can_fuel_consumed: Math.round(cumul * 10) / 10, can_rpm: 800 } }); }
    }
    if (zi === 12) nivel = Math.min(nivel + 40, 70);   // alimentare
    if (zi === 20) nivel -= 25;                        // scădere suspectă (peste noapte, motor oprit)
    for (let h = 18; h < 24; h++) pts.push({ ts: z0 + h * 3600000 + 1800000, lat, lng, speed: 0, io: { ignition: 0, can_total_mileage: Math.round(km), fuel_level_liters: Math.round(nivel * 10) / 10, can_fuel_consumed: Math.round(cumul * 10) / 10 } });
  }
  return pts.sort((a, b) => a.ts - b.ts).map((p) => ({ timestamp: new Date(p.ts).toISOString(), cheie: new Date(p.ts).toISOString(), latitude: p.lat, longitude: p.lng, altitude: 80, angle: p.angle || 0, speed: p.speed, satellites: 10, io_data: p.io }));
}
const DATE = { M1: luna('M1', 44.40, 26.10), M2: luna('M2', 45.70, 21.20) };
const DEV = [
  { imei: 'M1', name: 'Dacia Logan 3', plate: 'B 154 UIP', driver_id: 1, vehicle_type: 'Autoturism', fuel_type: 'Motorina', fuel_price: 7.5, consumption_road: 7, consumption_idle: 0.8 },
  { imei: 'M2', name: 'Ford Transit', plate: 'TM 22 RAT', driver_id: 2, vehicle_type: 'Van', fuel_type: 'Motorina', fuel_price: 7.5, consumption_road: 9, consumption_idle: 1.2 },
];
const pool = { query: async (sql) => {
  if (/FROM drivers/i.test(sql) && !/JOIN/i.test(sql)) return { rows: [{ id: 1, name: 'Ion Popescu' }, { id: 2, name: 'Andrei Stan' }] };
  if (/FROM devices/i.test(sql)) return { rows: DEV.map((d) => Object.assign({ driver_name: d.driver_id === 1 ? 'Ion Popescu' : 'Andrei Stan' }, d)) };
  return { rows: [] };
} };
const inPerioada = (imei, from, to) => (DATE[imei] || []).filter((p) => p.timestamp >= new Date(from).toISOString() && p.timestamp <= new Date(to).toISOString());
// Baza „nouă": citire pe pagini + coadă; getDeviceHistory ține plafonul (ca baza adevărată).
const bazaPagini = { pool,
  getDeviceHistory: async (imei, from, to, limit) => inPerioada(imei, from, to).slice(0, limit || 50000),
  istoricInterval: async (imei, from, to, dupa, limita) => inPerioada(imei, from, to).filter((p) => !dupa || p.cheie > dupa).slice(0, limita),
  istoricCoada: async (imei, from, to, n) => inPerioada(imei, from, to).slice(-n),
  getAlertHistoryRange: async () => [] };
// Baza „dintr-o bucată, fără plafon" — ce ar trebui să iasă.
const bazaToata = { pool, getDeviceHistory: async (imei, from, to) => inPerioada(imei, from, to), getAlertHistoryRange: async () => [] };
// Martorul: citirea VECHE, oprită la plafon, fără pagini.
const bazaVeche = { pool, getDeviceHistory: async (imei, from, to, limit) => inPerioada(imei, from, to).slice(0, limit || 50000), getAlertHistoryRange: async () => [] };

const FROM = '2026-09-01T00:00:00Z', TO = '2026-09-30T23:59:59Z', IMEIS = ['M1', 'M2'];
const OPTS = { stopMin: 5, limit: 90, refuelMin: 10, dropMin: 10, geo: false, priceByType: { motorina: 7.5 } };
const fara = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.charts; return c; };   // graficele nu contează aici
const egal = (a, b) => JSON.stringify(fara(a)) === JSON.stringify(fara(b));

(async () => {
  console.log('1. Pe pagini = dintr-o bucată (' + DATE.M1.length + ' de poziții pe mașină, plafon 1.000, pagini de 300)');
  T('datele de probă trec de 3 ori de plafon', DATE.M1.length > 3000 && DATE.M2.length > 3000, DATE.M1.length);
  const RAPOARTE = ['utilization', 'consumption', 'costs', 'emissions', 'idling', 'speeding', 'ecodrive', 'ecodrive_drivers', 'enginehours', 'fuel', 'location'];
  for (const tip of RAPOARTE) {
    const p = await reports.runReport(bazaPagini, tip, IMEIS, FROM, TO, OPTS, null);
    const t = await reports.runReport(bazaToata, tip, IMEIS, FROM, TO, OPTS, null);
    T('„' + p.label + '": aceleași cifre, fără avertisment', egal(p, t) && !p.trunchiat, JSON.stringify(fara(p)).slice(0, 160) + ' ≠ ' + JSON.stringify(fara(t)).slice(0, 160));
  }
  const fsP = await reports.fuelStats(bazaPagini, IMEIS, FROM, TO, OPTS), fsT = await reports.fuelStats(bazaToata, IMEIS, FROM, TO, OPTS);
  T('statisticile de consum (pagina „Combustibil"): aceleași cifre', JSON.stringify(fsP) === JSON.stringify(fsT), JSON.stringify(fsP.kpi) + ' ≠ ' + JSON.stringify(fsT.kpi));
  const TF = Object.assign({}, OPTS, { timeFilter: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '06:00', to: '18:00' } });
  for (const tip of ['utilization', 'consumption', 'ecodrive', 'idling']) {
    const p = await reports.runReport(bazaPagini, tip, IMEIS, FROM, TO, TF, null);
    const t = await reports.runReport(bazaToata, tip, IMEIS, FROM, TO, TF, null);
    T('cu filtrul zile/ore (luni–vineri, 06–18): „' + p.label + '" la fel', egal(p, t) && !p.trunchiat);
  }
  const km = (r) => r.valori.reduce((s, v) => s + v.km, 0);
  const uP = await reports.runReport(bazaPagini, 'utilization', IMEIS, FROM, TO, OPTS, null);
  const uV = await reports.runReport(bazaVeche, 'utilization', IMEIS, FROM, TO, OPTS, null);
  T('martorul: citirea veche, oprită la plafon, număra mult mai puțini km (' + Math.round(km(uV)) + ' din ' + Math.round(km(uP)) + ')', km(uV) < km(uP) * 0.5 && uV.trunchiat && uV.trunchiat.length === 2);
  const lP = await reports.runReport(bazaPagini, 'location', ['M1'], FROM, TO, OPTS, null);
  const lV = await reports.runReport(bazaVeche, 'location', ['M1'], FROM, TO, OPTS, null);
  const cLoc = (r) => r.columns.indexOf('Locație (unde a oprit)');   // „Șofer" se pune singur pe a doua coloană
  T('martorul: „Ultima locație" veche ieșea de la începutul lunii; acum e ultima poziție', lP.rows[0][cLoc(lP)] !== lV.rows[0][cLoc(lV)] && lP.rows[0][cLoc(lP)].indexOf(DATE.M1[DATE.M1.length - 1].latitude.toFixed(5)) === 0, lP.rows[0][cLoc(lP)] + ' / ' + lV.rows[0][cLoc(lV)]);

  console.log('\n2. Rapoartele care au nevoie de tot traseul deodată o SPUN când se opresc');
  for (const tip of ['stops', 'trips']) {
    const r = await reports.runReport(bazaPagini, tip, IMEIS, FROM, TO, OPTS, null);
    const tr = r.trunchiat || [];
    T('„' + r.label + '": `trunchiat` pe ambele mașini, cu ziua citită ultima', tr.length === 2 && tr[0].panaLa === DATE.M1[999].timestamp && /Dacia Logan 3/.test(tr[0].vehicul), JSON.stringify(tr));
    const lg = (r.legend && r.legend.items) || [];
    T('…și rândul „Atenție" în legendă (ecran, Excel, PDF)', lg.length && /prea multe poziții/.test(lg[0][1]) && /citit până pe/.test(lg[0][1]), JSON.stringify(lg[0]));
  }
  const scurt = await reports.runReport(bazaPagini, 'stops', IMEIS, '2026-09-01T00:00:00Z', '2026-09-05T00:00:00Z', OPTS, null);
  T('pe o perioadă scurtă: fără avertisment', !scurt.trunchiat);
  // AI Raport spune primul lucru: cifrele nu acoperă toată perioada
  const F = I.fisaFlotei(DEV.map((d) => ({ imei: d.imei, name: d.name, plate: d.plate })), {});
  const u = A.intelege('opriri luna trecută', {}, F, Date.parse('2026-10-05T10:00:00Z'));
  const rStops = await reports.runReport(bazaPagini, 'stops', IMEIS, FROM, TO, OPTS, null);
  const ra = A.raspunde(u, rStops, { fisa: F });
  T('AI Raport: prima sugestie spune că raportul s-a oprit, cu mașina și ziua', ra.sugestii[0] && ra.sugestii[0].fel === 'atentie' && /B 154 UIP · Dacia Logan 3 \(citit până pe \d\d\.09\.2026\)/.test(ra.sugestii[0].text), JSON.stringify(ra.sugestii[0]));
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  T('RA Insight: unealta de rapoarte îi spune modelului că cifrele nu acoperă perioada', /if \(Array\.isArray\(report\.trunchiat\) && report\.trunchiat\.length\) \{\s*out\.atentie = /.test(SRV));
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  T('ecranul Rapoarte: banda „Perioada are prea multe poziții", sub perioadă (cu textContent curățat)', /id="rep-trunchiat"/.test(PAG) && /_rw\.innerHTML = '<i class="fas fa-triangle-exclamation"><\/i> ' \+ _repEsc\('Perioada are prea multe poziții pentru '/.test(PAG));
  const RJ = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
  T('rapoartele de bază citesc pe pagini (nu prin `history`)', ['rUtilization', 'rIdling', 'rEcoDrive', 'rEcoDriveDrivers', 'rEngineHours', 'rFuel', '_consumptionMap', 'fuelStats'].every((f) => {
    const corp = (RJ.split('async function ' + f + '(')[1] || '').split(/\nasync function |\nfunction /)[0];
    return /fiecarePozitie\(db, imei, from, to,/.test(corp) && !/await history\(db, imei, from, to\)/.test(corp);
  }));

  // ─── 3. Pe server pornit ──────────────────────────────────────────────────────────────────────────
  const PORT = 3294, TCP = 5294;
  const DIR = path.join(os.tmpdir(), 'rax_pagini_' + Date.now());
  const B = 'http://127.0.0.1:' + PORT;
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_pagini', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RAPOARTE_PLAFON: '300', RAPOARTE_PAGINA: '100',
  });
  delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY;
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (c) => { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(c); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n3. Pe server pornit (plafon 300, pagini de 100, 700 de poziții în bază)');
  async function login(u, p) {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    return r.ok ? (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ') : null;
  }
  async function json(m, u, ck, body) {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j: j || {}, text };
  }
  const S = await login('admin', 'test1234');
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Pagini SRL' })).j;
  const u1 = (await json('POST', '/api/users', S, { username: 'sef@pagini.ro', full_name: 'Sef', role: 'admin', company_id: co.id })).j;
  await puneParola(u1, 'Str4da-Verde-2026', B);
  const ck = await login('sef@pagini.ro', 'Str4da-Verde-2026');
  const IM = '350000000061001';
  await json('POST', '/api/devices/import', S, { rows: [{ imei: IM, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }] });
  await json('PUT', '/api/devices/' + IM + '/company', S, { company_id: co.id });
  T('pregătire: firma, șeful, mașina', !!(co.id && ck));
  // 700 de poziții, una pe minut, 0,5 km între ele, spre nord: ~349,5 km în total; primele 300 = ~149,5 km.
  // Ziua: acum 4 zile, de la 8 dimineața la București (față de AZI — o dată scrisă de mână ar fi îmbătrânit proba).
  const zi4 = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.now() - 4 * 86400000)).forEach((x) => { if (x.type !== 'literal') zi4[x.type] = +x.value; });
  const t0 = I.inceputZiRO(zi4.year, zi4.month - 1, zi4.day) + 8 * 3600000;
  const ziText = String(zi4.day).padStart(2, '0') + '.' + String(zi4.month).padStart(2, '0');
  let kmAsteptat = 0, prev = null;
  for (let i = 0; i < 700; i++) {
    const lat = 44.40 + i * 0.5 / 111;
    if (prev) { const R = 6371, dLat = (lat - prev) * Math.PI / 180; kmAsteptat += R * 2 * Math.atan2(Math.sqrt(Math.sin(dLat / 2) ** 2), Math.sqrt(1 - Math.sin(dLat / 2) ** 2)); }
    prev = lat;
    await json('POST', '/api/test/simulate', S, { imei: IM, ts: new Date(t0 + i * 60000).toISOString(), lat, lng: 26.10, speed: 30, io: { ignition: 1 } });
  }
  const from = new Date(t0 - 60000).toISOString(), to = new Date(t0 + 700 * 60000).toISOString();
  const q = '?imei=' + IM + '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
  const ru = await json('GET', '/api/reports/utilization' + q, ck);
  const kmR = ru.j.valori && ru.j.valori[0] && ru.j.valori[0].km;
  T('„Index km": toate cele 700 de poziții, ' + Math.round(kmR) + ' km (așteptat ~' + Math.round(kmAsteptat) + '), fără avertisment', ru.status === 200 && Math.abs(kmR - kmAsteptat) < 1 && !ru.j.trunchiat, ru.status + ' ' + kmR);
  const rl = await json('GET', '/api/reports/location' + q, ck);
  const latUlt = (44.40 + 699 * 0.5 / 111).toFixed(5);
  const cl = (rl.j.columns || []).indexOf('Locație (unde a oprit)');
  T('„Ultima locație": ultima poziție din bază (' + latUlt + '), nu a 300-a', rl.status === 200 && cl > 0 && String((rl.j.rows || [[]])[0][cl]).indexOf(latUlt) === 0, JSON.stringify((rl.j.rows || [])[0]));
  const rs = await json('GET', '/api/reports/stops' + q, ck);
  T('„Staționări": spune că s-a oprit (citit până la a 300-a poziție)', rs.status === 200 && Array.isArray(rs.j.trunchiat) && rs.j.trunchiat[0].panaLa === new Date(t0 + 299 * 60000).toISOString(), JSON.stringify(rs.j.trunchiat));
  const ai = await json('POST', '/api/reports/ai-raport', ck, { text: 'câți km a făcut B 154 UIP pe ' + ziText });
  T('AI Raport: km-ii întregi ai zilei (' + (((ai.j.raspuns || {}).tiles || [])[0] || {}).val + ')', ai.status === 200 && (((ai.j.raspuns || {}).tiles || [])[0] || {}).val === A.nr(kmR), ai.text.slice(0, 200));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); process.exit(1); });
