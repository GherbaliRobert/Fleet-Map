// verify_safe_drive.js — Safe Drive & costuri (pasul 3 din RA Insight; Alin, 02.10: „SAFE DRIVE, CU COSTURI").
//
//   node verify_safe_drive.js
//
// Păzește:
//   1. regulile (condus.js): o lună de date pe două mașini, trecută prin socoteala pe zile, dă EXACT cifrele raportului
//      EcoDrive (manevre, km, scor pe mașină și pe flotă), ale clasamentului pe șoferi (și cu un schimb de șofer la mijlocul
//      lunii) și ale raportului Ralanti (opriri, litri); litrii și leii pe un exemplu socotit de mână; viteza (o treime din
//      consum pe aer, peste 90 km/h); prețurile pe eveniment curățate; „înainte / după" o discuție; unde și când; zilele pe
//      ora României; recomandările;
//   2. zilele (safe_drive.js): ce se reface (zi socotită înainte să se termine, „azi" la 15 minute, viitorul nu), șirurile,
//      citirea cu 10 minute înainte (drumul de peste miezul nopții) fără să scrie ziua de dinainte, luna pentru pagină;
//   3. pe server pornit: firma cu RA Insight, poziții ieri și luna dinainte — pagina dă cifrele raportului EcoDrive pe
//      aceeași lună; fără loc RA Insight → 403; altă firmă nu vede nimic; „Am vorbit cu el" și prețurile doar pentru cine
//      conduce flota și doar pe firma lui; schimbul de șofer nu mută zilele trecute (nici în raport); tura de noapte; aparatul
//      arhivat de peste 30 de zile își pierde și zilele.
'use strict';
// Fără adrese (pe GitHub serviciul de hărți răspunde, aici nu): adresele se cer unui port închis, ca peste tot în probe.
process.env.GEOCODE_URL = 'http://127.0.0.1:9/reverse';
process.env.GEOCODE_MIN_INTERVAL_MS = '0';
process.env.GEOCODE_TIMEOUT_MS = '300';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const reports = require('./reports');
const C = require('./condus');
const SD = require('./safe_drive');
const I = require('./insight');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const iso = (x) => new Date(x).toISOString();
const r1 = (x) => Math.round(x * 10) / 10;

// ─── O lună de date (septembrie 2026), pe două mașini ───────────────────────────────────────────────────
// În fiecare zi: două drumuri (08:00 și 15:00, ora României) cu o accelerare și o frânare bruscă, un viraj brusc (90° în
// 2 secunde), 40 de secunde la 130 km/h; un ralanti de ~4,5 minute după primul drum; noaptea parcată. Pe 10 septembrie, un
// drum peste miezul nopții (23:57 → 00:03). M1 are contor CAN de combustibil (ralantiul se MĂSOARĂ), M2 nu (se ESTIMEAZĂ).
const RO0 = Date.parse('2026-08-31T21:00:00Z');   // 1 septembrie, 00:00 la București (ora de vară, +3)
function luna(lat0, lng0, cuContor) {
  const pts = []; let lat = lat0, cumul = 3000;
  const pune = (ms, sp, ang, io) => pts.push({ ts: ms, lat, lng: lng0, sp, ang, io });
  const ioMers = (rpm) => Object.assign({ ignition: 1, can_rpm: rpm }, cuContor ? { can_fuel_consumed: r1(cumul) } : {});
  for (let zi = 0; zi < 30; zi++) {
    const z0 = RO0 + zi * 86400000;
    for (let h = 1; h < 6; h++) pune(z0 + h * 3600000, 0, 0, { ignition: 0 });
    for (let drum = 0; drum < 2; drum++) {
      const s0 = z0 + (8 + drum * 7) * 3600000;
      let ang = 0;
      for (let k = 0; k < 40; k++) {
        let sp = 50 + (k % 7) * 3;
        if (k === 10) sp = 125;                 // accelerare bruscă (+~7,5 km/h pe secundă)…
        if (k === 11) sp = 30;                  // …și frânare bruscă
        if (k >= 25 && k <= 28) sp = 130;       // 40 de secunde la 130 km/h
        lat += sp / 3600 * 10 / 111; if (cuContor) cumul += sp / 3600 * 10 * 0.07;
        pune(s0 + k * 10000, sp, ang, ioMers(1800));
        if (k === 30) { lat += sp / 3600 * 2 / 111; ang = 90; pune(s0 + k * 10000 + 2000, sp, ang, ioMers(1800)); }   // viraj brusc: 45°/s
      }
      if (drum === 0) for (let k = 1; k <= 10; k++) { if (cuContor) cumul += 0.02; pune(s0 + 400000 + k * 30000, 0, ang, ioMers(800)); }
    }
    for (let h = 18; h < 24; h++) pune(z0 + h * 3600000 + 1800000, 0, 0, { ignition: 0 });
    if (zi === 9) { const s0 = z0 + 86400000 - 3 * 60000; for (let k = 0; k < 36; k++) { lat += 60 / 3600 * 10 / 111; pune(s0 + k * 10000, 60, 0, ioMers(1500)); } }
  }
  return pts.sort((a, b) => a.ts - b.ts).map((p) => ({ timestamp: iso(p.ts), cheie: iso(p.ts), latitude: p.lat, longitude: p.lng, altitude: 80, angle: p.ang, speed: p.sp, satellites: 10, io_data: p.io }));
}
const DATE = { M1: luna(44.40, 26.10, true), M2: luna(45.70, 21.20, false) };
const DEV = [
  { imei: 'M1', name: 'Dacia Logan 3', plate: 'B 154 UIP', driver_id: 1, vehicle_type: 'Autoturism', fuel_type: 'Motorina', fuel_price: 7.5, consumption_road: 7, consumption_idle: 0.8 },
  { imei: 'M2', name: 'Ford Transit', plate: 'TM 22 RAT', driver_id: 2, vehicle_type: 'Van', fuel_type: 'Motorina', fuel_price: 7.2, consumption_road: 9, consumption_idle: 1.2 },
];
const SOFERI = [{ id: 1, name: 'Ion Popescu' }, { id: 2, name: 'Andrei Stan' }, { id: 3, name: 'Mihai Pop' }];
const NUME = {}; SOFERI.forEach((s) => { NUME[s.id] = s.name; });
// Baza de probă: citirea pe pagini a rapoartelor + ce scrie Safe Drive; `ist` = istoricul șoferilor (sau nimic).
function baza(ist) {
  const inP = (imei, from, to) => (DATE[imei] || []).filter((p) => p.timestamp >= iso(from) && p.timestamp <= iso(to));
  const zile = {};
  const b = {
    pool: { query: async (sql) => {
      if (/FROM drivers/i.test(sql) && !/JOIN/i.test(sql)) return { rows: SOFERI };
      if (/FROM devices/i.test(sql)) return { rows: DEV.map((d) => Object.assign({ driver_name: NUME[d.driver_id] }, d)) };
      return { rows: [] };
    } },
    getDeviceHistory: async (imei, from, to, limit) => inP(imei, from, to).slice(0, limit || 50000),
    istoricInterval: async (imei, from, to, dupa, limita) => inP(imei, from, to).filter((p) => !dupa || p.cheie > dupa).slice(0, limita),
    istoricCoada: async (imei, from, to, n) => inP(imei, from, to).slice(-n),
    getAlertHistoryRange: async () => [],
    scrieZileCondus: async (imei, de, pana, randuri, toate) => {
      zile[imei] = (zile[imei] || []).filter((r) => r.zi < de || r.zi > pana);
      randuri.forEach((r) => { const d = Object.assign({}, r); delete d.zi; delete d.sofer; zile[imei].push({ imei, zi: r.zi, sofer: r.sofer, date: d }); });
      toate.forEach((z) => { if (!randuri.some((r) => r.zi === z)) zile[imei].push({ imei, zi: z, sofer: 0, date: {} }); });
    },
    _zile: zile,
  };
  if (ist) b.istoricSoferi = async (imeis) => ist.filter((x) => imeis.includes(x.imei));
  return b;
}
const FROM = iso(RO0), TO = iso(Date.parse('2026-09-30T21:00:00Z') - 1);
const OPTS = { stopMin: 5, limit: 90, geo: false, priceByType: { motorina: 7.5 } };
const ACUM = Date.parse('2026-10-05T10:00:00Z');
const sumar = (pv, k) => { const x = (pv.summary || []).filter((r) => r[0] === k)[0]; return x ? x[1] : undefined; };

(async () => {
  // ─── 1. Regulile ──────────────────────────────────────────────────────────────────────────────────────
  console.log('1. Regulile (condus.js): aceleași cifre ca rapoartele EcoDrive și Ralanti');
  const RJ = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
  const corp = (f) => (RJ.split('async function ' + f + '(')[1] || '').split(/\nasync function |\nfunction /)[0];
  T('raportul EcoDrive citește pragurile și scorul din condus.js (o singură regulă)', /condus\.PRAGURI\.accel/.test(corp('rEcoDrive')) && /condus\.scor\(/.test(corp('rEcoDrive')) && /condus\.scorFlota\(/.test(corp('rEcoDrive')) && /condus\.scor\(/.test(corp('rEcoDriveDrivers')) && /condus\.scorFlota\(/.test(corp('rEcoDriveDrivers')));
  T('…și nicio prag scris de mână în ele (7 / 9 / 25 / 90)', !/\|\| (7|9|25|90)\b/.test(corp('rEcoDrive')) && !/\|\| (7|9|25|90)\b/.test(corp('rEcoDriveDrivers')));
  T('clasamentul pe șoferi pune fiecare poziție pe cine conducea atunci (același istoric ca Safe Drive)', /condus\.soferLa\(ist\[imei\]\)/.test(corp('rEcoDriveDrivers')));

  // Safe Drive pe luna întreagă, mașină cu mașină, cu istoricul: șoferul 1 pe M1 până pe 16, apoi 3; șoferul 2 pe M2.
  const sch = SD.inceput('2026-09-16');
  const IST = [{ imei: 'M1', driver_id: 1, de_la: 0, pana_la: sch }, { imei: 'M1', driver_id: 3, de_la: sch, pana_la: null }, { imei: 'M2', driver_id: 2, de_la: 0, pana_la: null }];
  const B = baza(IST);
  for (const d of DEV) await SD.socotesteMasina(B, d.imei, '2026-09-01', '2026-09-30', IST.filter((x) => x.imei === d.imei));
  const zile = [].concat(B._zile.M1, B._zile.M2);
  T('o zi pe rând (și pe șofer): 30 de zile pe fiecare mașină, M1 pe doi șoferi', new Set(B._zile.M1.map((r) => r.zi)).size === 30 && B._zile.M1.some((r) => r.sofer === 1) && B._zile.M1.some((r) => r.sofer === 3) && B._zile.M2.every((r) => r.sofer === 2), B._zile.M1.length);
  const MAS = DEV.map((d) => Object.assign(SD.masina(d, { motorina: 7.5 }), { eticheta: I.eticheta({ imei: d.imei, nr: d.plate, nume: d.name }) }));
  const P = C.preturi(null);
  const L = SD.alcatuieste({ luna: '2026-09', acum: ACUM, masini: MAS, soferi: NUME, preturi: P, zile: zile, inaintePregatita: true, discutii: [], adrese: {} });

  const eco = await reports.runReport(B, 'ecodrive', ['M1', 'M2'], FROM, TO, OPTS, null);
  for (const d of DEV) {
    const pv = (eco.perVehicle || []).filter((x) => /B 154 UIP|TM 22 RAT/.test(x.vehicul) && x.vehicul.indexOf(d.plate) >= 0)[0] || {};
    const m = L.masini.filter((x) => x.imei === d.imei)[0] || {};
    T(d.plate + ': scorul, frânările, accelerările, virajele și km-ii = raportul EcoDrive (' + m.scor + ', ' + m.frana + ' frânări, ' + m.viraj + ' viraje)',
      m.scor === sumar(pv, 'Scor') && m.nota === sumar(pv, 'Notă') && m.accel === sumar(pv, 'Accel. bruște') && m.frana === sumar(pv, 'Frânări bruște') && m.viraj === sumar(pv, 'Viraje bruște') && m.km === sumar(pv, 'Km'),
      JSON.stringify({ sd: [m.scor, m.nota, m.accel, m.frana, m.viraj, m.km], eco: pv.summary }));
  }
  T('datele de probă chiar au de toate (frânări, accelerări, viraje, peste 90)', L.masini.every((m) => m.frana >= 60 && m.accel >= 60 && m.viraj >= 60 && m.pesteMin > 0), JSON.stringify(L.masini.map((m) => [m.frana, m.accel, m.viraj, m.pesteMin])));
  T('scorul flotei = „Scor flotă" din raport (' + L.flota.scor + ')', L.flota.scor === eco.summary['Scor flotă (0-100)'], L.flota.scor + ' / ' + eco.summary['Scor flotă (0-100)']);

  const sof = await reports.runReport(B, 'ecodrive_drivers', ['M1', 'M2'], FROM, TO, OPTS, null);
  const rand = {}; sof.rows.forEach((r) => { rand[r[1]] = r; });
  T('clasamentul pe șoferi are trei șoferi (schimbul de pe 16 e văzut și de raport)', sof.rows.length === 3 && !!rand['Mihai Pop'], JSON.stringify(sof.rows));
  L.soferi.forEach((s) => {
    const r = rand[s.nume] || [];
    T(s.nume + ': scorul, nota, manevrele la 100 km și km-ii = clasamentul raportului', s.scor === r[2] && s.nota === r[3] && s.laSuta === r[4] && s.km === r[5], JSON.stringify([s.scor, s.nota, s.laSuta, s.km]) + ' / ' + JSON.stringify(r));
  });
  const kmS = L.soferi.reduce((a, s) => a + s.km, 0), kmM = L.masini.reduce((a, m) => a + m.km, 0);
  T('km-ii șoferilor se adună la km-ii mașinilor (fiecare zi pe un singur șofer)', Math.abs(kmS - kmM) <= 1, kmS + ' / ' + kmM);
  const fara = await reports.runReport(baza(null), 'ecodrive_drivers', ['M1', 'M2'], FROM, TO, OPTS, null);
  T('fără istoric (mașini vechi, baze de probă), clasamentul pune perioada pe șoferul de acum, ca înainte', fara.rows.length === 2 && fara.rows.some((r) => r[1] === 'Ion Popescu') && !fara.rows.some((r) => r[1] === 'Mihai Pop'), JSON.stringify(fara.rows));

  const ral = await reports.runReport(B, 'idling', ['M1', 'M2'], FROM, TO, OPTS, null);
  for (const d of DEV) {
    const pv = (ral.perVehicle || []).filter((x) => x.vehicul.indexOf(d.plate) >= 0)[0] || {};
    const t = C.insumeaza(B._zile[d.imei]);
    const m = MAS.filter((x) => x.imei === d.imei)[0];
    const l = C.litri(t, m).ralanti;
    T(d.plate + ': opririle cu motorul pornit și litrii arși = raportul Ralanti (' + t.ralantiEp + ' opriri, ' + r1(l) + ' L, ' + (d.imei === 'M1' ? 'măsurați' : 'estimați') + ')',
      t.ralantiEp === sumar(pv, 'Evenimente ralanti') && Math.round(l * 100) / 100 === sumar(pv, 'Combustibil irosit (L)'), JSON.stringify([t.ralantiEp, l, pv.summary]));
  }
  T('M1 își măsoară ralantiul din contor; M2 îl estimează din ore × L/h', C.insumeaza(B._zile.M1).ralantiLMasurat > 0 && C.insumeaza(B._zile.M1).ralantiOreEst === 0 && C.insumeaza(B._zile.M2).ralantiOreEst > 0 && C.insumeaza(B._zile.M2).ralantiLMasurat === 0);

  // Litrii și leii, socotiți de mână
  const ex = C.costuri({ ralantiLMasurat: 2, ralantiOreEst: 1, pesteF: 50, frana: 10, accel: 5, viraj: 2 }, { l100: 9, lph: 0.8, pretL: 7.5 }, C.PRETURI_IMPLICITE.autoturism);
  T('lei, de mână: ralanti (2 L + 1 h × 0,8) × 7,5 = 21; viteza 50 × 9/100 × ⅓ × 7,5 = 11,25; manevre 10×0,20 + 5×0,15 + 2×0,10 = 2,95',
    ex.ralanti === 21 && ex.viteza === 11.25 && ex.manevre === 2.95 && ex.total === 35.2 && ex.litri.ralanti === 2.8 && ex.litri.viteza === 1.5, JSON.stringify(ex));
  T('…împărțit ca pe pagină: „Combustibil" = accelerările (0,75), „Frâne și anvelope" = frânările + virajele (2,20)', ex.accel === 0.75 && ex.frane === 2.2 && ex.accel + ex.frane === ex.manevre);
  T('viteza: la 130 km/h, cam +36% combustibil față de 90 (o treime din consum pe aer × pătratul vitezei)', Math.abs(C.PARTE_AER * (Math.pow(130 / 90, 2) - 1) - 0.362) < 0.001 && C.PRAGURI.limita === 90);
  // Socotit de mână din poziții: fiecare bucată de drum peste 90 km/h, km × ((v / 90)² − 1) — 125 și 130 km/h în date.
  const tm1 = C.insumeaza(B._zile.M1), H = reports._ajutor.haversineKm;
  let deMana = 0, kmPeste = 0;
  for (let i = 1; i < DATE.M1.length; i++) {
    const a = DATE.M1[i - 1], b = DATE.M1[i], dt = (Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 1000, d = H(a.latitude, a.longitude, b.latitude, b.longitude);
    if (dt > 0 && dt <= 300 && b.speed > 90 && d < 10) { deMana += d * (Math.pow(b.speed / 90, 2) - 1); kmPeste += d; }
  }
  T('pe datele lunii: „cât de repede peste 90" = Σ km × ((v / 90)² − 1), socotit de mână din poziții', Math.abs(tm1.pesteF - deMana) < 1e-6 && Math.abs(tm1.pesteKm - kmPeste) < 1e-6 && deMana > 0, tm1.pesteF + ' / ' + deMana);
  T('prețurile mașinii vin din fișă: consumul „pe drum", L/h la ralanti, prețul ei, clasa', MAS[0].l100 === 7 && MAS[0].lph === 0.8 && MAS[0].pretL === 7.5 && MAS[0].clasa === 'autoturism' && MAS[1].pretL === 7.2 && MAS[1].clasa === 'duba');
  const fs0 = SD.masina({ imei: 'X', vehicle_type: 'Camion' }, { motorina: 7.1 });
  T('…iar fără ele, aceleași rezerve ca rapoartele (consum pe tip, L/h pe tip, prețul firmei)', fs0.l100 === 30 && fs0.lph === 3 && fs0.pretL === 7.1 && fs0.clasa === 'camion', JSON.stringify(fs0));
  T('costul mașinii folosește prețul și clasa EI (Transitul: 7,2 lei, preț de dubă)', (() => { const m = L.masini.filter((x) => x.imei === 'M2')[0]; const t = C.insumeaza(B._zile.M2); const c = C.costuri(t, MAS[1], P.duba); return m.cost.total === c.total && c.manevre === Math.round((t.frana * 0.4 + t.accel * 0.3 + t.viraj * 0.2) * 100) / 100; })());
  T('costul flotei = suma mașinilor', Math.abs(L.flota.cost.total - L.masini.reduce((a, m) => a + m.cost.total, 0)) < 0.011, L.flota.cost.total);

  // Prețurile pe eveniment: doar numere între 0 și 100 de lei
  const pr = C.preturi({ autoturism: { frana: '0.5', accel: 'x', viraj: 200 }, camion: { frana: -1, accel: 2.345 } });
  T('prețurile firmei se curăță: „0.5" → 0,5; text, 200 sau -1 → prețul de pornire; 2,345 → 2,35', pr.autoturism.frana === 0.5 && pr.autoturism.accel === 0.15 && pr.autoturism.viraj === 0.1 && pr.camion.frana === 1.5 && pr.camion.accel === 2.35 && pr.duba.frana === 0.4, JSON.stringify(pr));

  // Înainte / după o discuție
  const cA = C.comparatie({ km: 1000, accel: 50, frana: 50, condusSec: 36000 }, { km: 500, accel: 10, frana: 15, condusSec: 18000 });
  T('„Am vorbit cu el": 10 → 5 manevre la 100 km = „Mai bine", −50%', cA.fel === 'bun' && /^Mai bine: manevre bruște la 100 km 10 → 5 \(-50%\)/.test(cA.text), cA.text);
  const cB = C.comparatie({ km: 1000, accel: 50, frana: 50 }, { km: 12, accel: 1, frana: 0 });
  T('…iar cu prea puțin drum de atunci, spune să revii (nu trage concluzii)', cB.fel === 'info' && /Prea puțin drum/.test(cB.text), cB.text);

  // Unde și când
  const fe = C.ferestre([{ zi: '2026-09-04', date: { ore: Object.assign(new Array(24).fill(0), { 16: 3, 17: 4, 18: 2 }) } }, { zi: '2026-09-11', date: { ore: Object.assign(new Array(24).fill(0), { 17: 3 }) } }], 2, 5);
  T('„când": fereastra de 3 ore cu cele mai multe manevre, pe ziua săptămânii („vineri, 16–19: 12")', fe[0] && fe[0].text === 'vineri, 16–19' && fe[0].n === 12, JSON.stringify(fe));
  const lo = C.locuri({ '44.400,26.100': 7, '44.410,26.100': 2, '45.000,21.000': 4 }, 3, 3);
  T('„unde": zonele cu cel puțin 3 manevre, cele mai încărcate întâi', lo.length === 2 && lo[0].n === 7 && lo[0].lat === 44.4 && lo[1].n === 4, JSON.stringify(lo));
  T('zonele sunt de ~500 m (punctele de pe aceeași stradă se strâng)', C.celula(44.40123, 26.09981) === C.celula(44.40201, 26.10149) && C.celula(44.40123, 26.09981) !== C.celula(44.41, 26.1));

  // Zilele, pe ora României
  T('ziua pe ora României: 21:30 UTC vara = a doua zi; 22:30 UTC iarna = a doua zi', C.zi(Date.parse('2026-07-15T21:30:00Z')) === '2026-07-16' && C.zi(Date.parse('2026-01-15T22:30:00Z')) === '2026-01-16' && C.zi(Date.parse('2026-01-15T21:30:00Z')) === '2026-01-15');
  const z10 = B._zile.M1.filter((r) => r.zi === '2026-09-10'), z11 = B._zile.M1.filter((r) => r.zi === '2026-09-11');
  T('drumul de peste miezul nopții (23:57 → 00:03) se împarte pe cele două zile', z10.length && z11.length && C.insumeaza(z11).km > C.insumeaza(B._zile.M1.filter((r) => r.zi === '2026-09-12')).km, JSON.stringify([C.insumeaza(z10).km, C.insumeaza(z11).km]));

  // Recomandările
  const rec = C.recomandari(
    [{ eticheta: 'B 1 AAA · Logan', t: { km: 900, ralantiEpSec: 5 * 3600, pesteSec: 4000, vmax: 152, accel: 10, frana: 10, viraj: 0 }, cost: { ralanti: 64, viteza: 35, manevre: 4, total: 103 } },
     { eticheta: 'B 2 BBB · Caddy', t: { km: 900, ralantiEpSec: 0, pesteSec: 0, vmax: 88, accel: 5, frana: 5, viraj: 0 }, cost: { ralanti: 0, viteza: 0, manevre: 2, total: 2 } }],
    [{ id: 7, nume: 'Vasile Ion', t: { km: 300, accel: 30, frana: 30, viraj: 0 }, cost: { total: 20 }, discutie: null },
     { id: 8, nume: 'Dan Pop', t: { km: 1500, accel: 0, frana: 0, viraj: 0 }, cost: { total: 0 }, discutie: { comparatie: { fel: 'bun', text: 'Mai bine: manevre bruște la 100 km 10 → 5 (-50%) · scor 70 → 85.' } } }],
    { ferestre: [{ text: 'vineri, 16–19', n: 14 }], locuri: [{ lat: 44.4, lng: 26.1, n: 9, adresa: 'Bd. Iuliu Maniu, București' }] });
  const recT = rec.map((x) => x.text).join(' | ');
  T('recomandări: ralantiul scump, cu ore și lei', /B 1 AAA · Logan a stat cu motorul pornit, pe loc, 5 ore — cam 64 de lei/.test(recT), recT);
  T('…viteza, spusă „peste 90 km/h" (pragul raportului, nu limita drumului)', /a mers 67 de minute peste 90 km\/h \(cel mai repede 152 km\/h\) — cam 35 de lei/.test(recT), recT);
  T('…șoferul cu de două ori mai multe manevre decât media, cu îndemnul „Am vorbit cu el"', /Vasile Ion are 20 manevre bruște la 100 km, față de 1,7 media flotei/.test(recT) && /„Am vorbit cu el"/.test(recT), recT);
  T('…când și unde se repetă (cu adresa), și discuția care a mers', /vineri, 16–19 \(14\)/.test(recT) && /Bd\. Iuliu Maniu, București \(9 manevre\)/.test(recT) && /După discuția cu Dan Pop: Mai bine/.test(recT), recT);

  // ─── 2. Zilele ────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n2. Zilele (safe_drive.js): ce se reface, șirurile, luna pentru pagină');
  const stare = new Map([
    ['X|2026-10-03', SD.inceput('2026-10-04') + 5 * 60000],      // socotită după ce s-a terminat ziua → bună
    ['X|2026-10-04', SD.inceput('2026-10-04') + 20 * 3600000],    // socotită ÎN ziua ei (seara) → se reface
    ['X|2026-10-05', ACUM - 10 * 60000],                          // azi, acum 10 minute → bună
    ['Y|2026-10-05', ACUM - 20 * 60000],                          // azi, acum 20 de minute → se reface
  ]);
  const lipsa = await SD.deSocotit({ zileCondusStare: async () => stare }, ['X', 'Y'], '2026-10-02', '2026-10-31', ACUM);
  T('se refac: ziua nesocotită, ziua socotită înainte să se termine, „azi" mai vechi de 15 minute; viitorul nu',
    JSON.stringify(lipsa.X) === JSON.stringify(['2026-10-02', '2026-10-04']) && JSON.stringify(lipsa.Y) === JSON.stringify(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']), JSON.stringify(lipsa));
  T('zilele de socotit se strâng în șiruri fără goluri (o singură citire pe șir)', JSON.stringify(SD.siruri(['2026-10-05', '2026-10-02', '2026-10-03'])) === JSON.stringify([{ de: '2026-10-02', pana: '2026-10-03' }, { de: '2026-10-05', pana: '2026-10-05' }]));
  T('luna: prima și ultima zi (și în februarie), luna dinainte peste an', JSON.stringify(SD.luna('2027-02')) === JSON.stringify({ luna: '2027-02', de: '2027-02-01', pana: '2027-02-28' }) && SD.lunaDinainte('2027-01') === '2026-12' && SD.luna('2026-13') === null);
  T('zilele de la trecerea pe ora de iarnă (25 octombrie) nu se pierd și nu se dublează', JSON.stringify(SD.zileIntre('2026-10-24', '2026-10-27')) === JSON.stringify(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']));
  // Citirea cu 10 minute înainte: drumul de peste miezul nopții se leagă, dar ziua de dinainte nu se scrie.
  const B2 = baza(null);
  await SD.socotesteMasina(B2, 'M1', '2026-09-11', '2026-09-11', []);
  T('o zi socotită singură citește și ultimele minute ale zilei dinainte (drumul de peste miezul nopții), dar scrie DOAR ziua ei',
    B2._zile.M1.every((r) => r.zi === '2026-09-11') && Math.abs(C.insumeaza(B2._zile.M1).km - C.insumeaza(z11).km) < 0.001, JSON.stringify(B2._zile.M1.map((r) => r.zi)));
  await SD.socotesteMasina(B2, 'M1', '2026-10-01', '2026-10-02', []);
  T('o zi fără nicio poziție primește totuși un rând (gol), ca să se știe că a fost socotită', B2._zile.M1.filter((r) => r.zi >= '2026-10-01').length === 2 && B2._zile.M1.filter((r) => r.zi === '2026-10-02')[0].sofer === 0);
  // Luna de acum se compară cu ACELEAȘI zile din luna dinainte (1–5 cu 1–5), nu cu o lună întreagă
  const zileOct = [].concat(B._zile.M1.map((r) => Object.assign({}, r, { zi: r.zi.replace('2026-09-', '2026-10-') })), B._zile.M2.map((r) => Object.assign({}, r, { zi: r.zi.replace('2026-09-', '2026-10-') })));
  const LO = SD.alcatuieste({ luna: '2026-10', acum: ACUM, masini: MAS, soferi: NUME, preturi: P, zile: zile.concat(zileOct.filter((r) => r.zi <= '2026-10-05')), inaintePregatita: true, discutii: [], adrese: {} });
  const zile5 = C.insumeaza(zile.filter((r) => r.zi <= '2026-09-05'));
  T('luna de acum (1–5 octombrie) se compară cu 1–5 septembrie, nu cu toată luna', LO.inainte && LO.inainte.eticheta === '1–5 septembrie' && LO.inainte.km === Math.round(zile5.km) && /^(cam la fel|[+−]\d)/.test(LO.fata.cost), JSON.stringify([LO.inainte && LO.inainte.eticheta, LO.inainte && LO.inainte.km, Math.round(zile5.km), LO.fata]));
  T('…iar o lună întreagă, cu luna întreagă dinainte (fără „pe 1–N")', L.inainte && L.inainte.eticheta === 'august' && L.fata.cost === 'fără drum în august — nimic de comparat' && L.fata.fel === 'info', JSON.stringify(L.fata));
  T('„Cum se socotește": cinci lămuriri scrise o dată, cu pragurile adevărate (7 / 9 / 25 de grade / 90 / 3 minute / +36%)', L.explicatii.length === 5 && /peste 7 km\/h/.test(L.explicatii[0].text) && /25 de grade/.test(L.explicatii[0].text) && /3 minute/.test(L.explicatii[1].text) && /Peste 90 km\/h/.test(L.explicatii[2].text) && /cam 36% în plus/.test(L.explicatii[2].text), JSON.stringify(L.explicatii.map((x) => x.titlu)));
  T('graficul pe ore primește manevrele pe fiecare oră (24)', Array.isArray(L.flota.ore) && L.flota.ore.length === 24 && L.flota.ore.reduce((a, b) => a + b, 0) === L.flota.manevre);
  T('pagina primește eticheta lunii și dacă e „până azi"', L.eticheta === 'septembrie 2026' && SD.alcatuieste({ luna: '2026-10', acum: ACUM, masini: MAS, soferi: NUME, preturi: P, zile: [], discutii: [] }).eticheta === 'octombrie 2026 (până azi)');
  T('mașinile, cele mai scumpe întâi; un rând „Fără șofer atribuit" doar dacă a mers cineva fără șofer', L.masini[0].cost.total >= L.masini[1].cost.total && !L.soferi.some((s) => !s.id));
  // Discuția: ultima, cu înainte / după din zilele pe care le avem
  const zDisc = SD.inceput('2026-09-16') + 9 * 3600000;
  const LD = SD.alcatuieste({ luna: '2026-09', acum: ACUM, masini: MAS, soferi: NUME, preturi: P, zile: zile, inaintePregatita: true, adrese: {},
    discutii: [{ id: 5, driver_id: 2, la: zDisc, nota: 'despre frânări' }, { id: 4, driver_id: 2, la: zDisc - 86400000 * 3, nota: 'mai veche' }] });
  const andrei = LD.soferi.filter((s) => s.nume === 'Andrei Stan')[0] || {};
  T('„Am vorbit cu el": ultima discuție a șoferului, cu ziua și nota', andrei.discutie && andrei.discutie.id === 5 && andrei.discutie.zi === '2026-09-16' && andrei.discutie.nota === 'despre frânări', JSON.stringify(andrei.discutie));
  T('…și comparația înainte / după (la același fel de drum: „Cam la fel")', andrei.discutie && andrei.discutie.comparatie && andrei.discutie.comparatie.fel === 'info' && /^Cam la fel/.test(andrei.discutie.comparatie.text), JSON.stringify(andrei.discutie && andrei.discutie.comparatie));

  // ─── 3. Pe server pornit ──────────────────────────────────────────────────────────────────────────────
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const rut = (m, u) => (SRV.split("app." + m + "('" + u + "'")[1] || '').split('\n')[0];
  T('pagina: doar cu RA Insight pe firmă ȘI loc RA Insight pe om', /requireAuth, withScope, requireFeature\('ai_assistant'\), requireAiSeat/.test(rut('get', '/api/insight/safe-drive')));
  T('prețurile și „Am vorbit cu el": doar cine conduce flota (requireFleet)', /requireFleet/.test(rut('put', '/api/insight/safe-drive/preturi')) && /requireFleet/.test(rut('post', '/api/insight/safe-drive/discutie')) && /requireFleet/.test(rut('delete', '/api/insight/safe-drive/discutie/:id')));
  // Regula „ce mașini vede omul" stă în _ramFlota (07.10: una pentru toate ramurile RA Insight); Safe Drive o cheamă de acolo.
  const corpFn = (nume) => (SRV.split('async function ' + nume + '(')[1] || '').split(/\nasync function |\nfunction /)[0];
  T('mașinile: doar cele la care omul are acces, fără arhivate (demo-ul îl taie canAccessImei) — regula comună a ramurilor', /canAccessImei\(req, d\.imei\) && d\.status !== 'archived'/.test(corpFn('_ramFlota')) && /await _ramFlota\(req\)/.test(corpFn('_sdFlota')));
  T('tura de noapte: fără firma demo și fără mașinile demo', /co\.id !== demoCompanyId/.test(SRV.split('async function safeDriveNoaptea(')[1] || '') && /!DEMO_SET\.has\(d\.imei\)/.test(SRV.split('async function safeDriveNoaptea(')[1] || ''));
  const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const fdb = (f) => (DB.split('async function ' + f + '(')[1] || '').split(/\nasync function /)[0];
  T('zilele se șterg odată cu pozițiile: la 30 de zile după arhivare, la păstrarea pe firmă, la ștergerea aparatului',
    /DELETE FROM zile_condus WHERE imei = \$1/.test(fdb('stergeIstoricAparat')) && /DELETE FROM zile_condus WHERE imei = \$1 AND zi </.test(fdb('stergeIstoricMaiVechiDe')) && /'zile_condus', 'istoric_soferi'/.test(fdb('deleteDeviceCompletely')));
  const BK = require('./backup.js');
  T('copia de siguranță: istoricul șoferilor și discuțiile intră; zilele nu (se refac din poziții)', BK.BUSINESS_TABLES.includes('istoric_soferi') && BK.BUSINESS_TABLES.includes('safe_drive_discutii') && !!BK.BACKUP_EXCLUDED.zile_condus);
  // Pagina (secțiunea RA Insight): arată, nu socotește; textele serverului cu textContent
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const bloc = (PAG.split('// ─── Ramura „Safe Drive & costuri"')[1] || '').split('// ── sfârșit „secțiunea RA Insight" ──')[0];
  T('pagina: ramura Safe Drive se arată (gata: true) și are pagina ei', /k: 'safedrive', et: 'Safe Drive & costuri', ic: 'fa-shield-halved', gata: true/.test(PAG) && /if \(S\.ramura === 'safedrive'\) return deseneazaSafeDrive\(main, S\.sdLuna\);/.test(PAG) && bloc.length > 1000);
  T('pagina nu socotește nimic: fără praguri, prețuri sau „o treime" scrise în ea', !/\b90\b|\b0\.15\b|\b0\.20?\b|\b1\.5\b|PARTE_AER|treime/.test(bloc), (bloc.match(/\b90\b|\b0\.15\b|\b0\.20?\b|\b1\.5\b|PARTE_AER|treime/) || [])[0]);
  T('pagina: o singură cerere pentru lună, una pentru discuție (+ scoaterea), una pentru prețuri', (bloc.match(/'\/api\/insight\/safe-drive'/g) || []).length === 1 && (bloc.match(/'\/api\/insight\/safe-drive\/discutie'/g) || []).length === 1 && (bloc.match(/'\/api\/insight\/safe-drive\/discutie\/'/g) || []).length === 1 && (bloc.match(/'\/api\/insight\/safe-drive\/preturi'/g) || []).length === 1);
  const ih = bloc.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textele serverului se pun cu textContent (innerHTML doar pentru iconițe, fără nume, texte sau adrese)', ih.length >= 5 && ih.every((x) => !/\.(text|nume|eticheta|nota|adresa|message|error|titlu|cost)\b/.test(x)), ih.filter((x) => /\.(text|nume|eticheta|nota|adresa|message|error|titlu|cost)\b/.test(x)).join(' | '));
  const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
  T('culorile de stare au pereche pe tema deschisă (portocaliu și verde închise)', /body:not\(\.dark\) \.sdp \.sdp-chip\.atentie[^{]*\{ color: #9a3412; \}/.test(CSS) && /body:not\(\.dark\) \.sdp \.sdp-chip\.bun[^{]*\{ color: #166534; \}/.test(CSS));
  T('tabelele se derulează în cutia lor (pagina nu iese din ecran pe telefon)', /\.sdp-scroll \{ overflow-x: auto; max-width: 100%; \}/.test(CSS) && /\.sdp \{ overflow-y: auto; min-height: 0; min-width: 0;/.test(CSS));

  const PORT = 3297, TCP = 5297;
  const DIR = path.join(os.tmpdir(), 'rax_safedrive_' + Date.now());
  const BU = 'http://127.0.0.1:' + PORT;
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_safedrive', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
  });
  delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY;
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (c) => { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(c); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(BU + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n3. Pe server pornit');
  async function login(u, p) {
    const r = await fetch(BU + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    return r.ok ? (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ') : null;
  }
  async function json(m, u, ck, body) {
    const r = await fetch(BU + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j: j || {}, text };
  }
  const S = await login('admin', 'test1234');
  const PAROLA = 'Str4da-Verde-2026';
  const coA = (await json('POST', '/api/companies', S, { name: 'Firma Safe Drive SRL' })).j;
  const coB = (await json('POST', '/api/companies', S, { name: 'Alta Firma Drive SRL' })).j;
  for (const co of [coA, coB]) await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  async function om(username, role, companyId, loc) {
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, BU);
    if (r.j && r.j.id && loc) await json('PUT', '/api/users/' + r.j.id + '/ai-seat', S, { on: true });
    return login(username, PAROLA);
  }
  const ckSef = await om('sef@safedrive.ro', 'admin', coA.id, true);
  const ckDisp = await om('dispecer@safedrive.ro', 'dispatcher', coA.id, true);
  const ckFara = await om('fara@safedrive.ro', 'manager', coA.id, false);
  const ckAlt = await om('sef@alta-drive.ro', 'admin', coB.id, true);
  const V = ['350000000071001', '350000000071002', '350000000071003'];
  await json('POST', '/api/devices/import', S, { rows: [{ imei: V[0], nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }, { imei: V[1], nume: 'VW Caddy', nr_inmatriculare: 'B 77 RAT' }, { imei: V[2], nume: 'Ford Focus', nr_inmatriculare: 'CJ 01 ALT' }] });
  await json('PUT', '/api/devices/' + V[0] + '/company', S, { company_id: coA.id });
  await json('PUT', '/api/devices/' + V[1] + '/company', S, { company_id: coA.id });
  await json('PUT', '/api/devices/' + V[2] + '/company', S, { company_id: coB.id });
  const ion = (await json('POST', '/api/drivers', ckSef, { name: 'Ion Popescu' })).j;
  const mihai = (await json('POST', '/api/drivers', ckSef, { name: 'Mihai Pop' })).j;
  const dinB = (await json('POST', '/api/drivers', ckAlt, { name: 'Șofer Alta' })).j;
  await json('PUT', '/api/devices/' + V[0] + '/assign', ckSef, { driver_id: ion.id });
  T('pregătire: două firme cu RA Insight, șeful, dispecerul, un manager fără loc, trei mașini, șoferi', !!(coA.id && coB.id && ckSef && ckDisp && ckFara && ckAlt && ion.id && mihai.id && dinB.id));

  // Zilele: ieri (ora României) și ziua 10 a lunii dinainte. Totul față de AZI — o dată scrisă de mână ar îmbătrâni proba.
  const ieri = C.zi(Date.now() - 86400000), LUNA = ieri.slice(0, 7), LI = SD.lunaDinainte(LUNA), zB = LI + '-10';
  async function drum(imei, t0, lat0) {
    let lat = lat0;
    for (let k = 0; k < 30; k++) {
      let sp = 50 + (k % 5) * 4;
      if (k === 8) sp = 125; if (k === 9) sp = 30; if (k >= 15 && k <= 18) sp = 130;
      lat += sp / 3600 * 10 / 111;
      await json('POST', '/api/test/simulate', S, { imei, ts: iso(t0 + k * 10000), lat, lng: 26.1, speed: sp, angle: k === 20 ? 90 : (k > 20 ? 90 : 0), io: { ignition: 1 } });
      if (k === 19) { lat += sp / 3600 * 2 / 111; await json('POST', '/api/test/simulate', S, { imei, ts: iso(t0 + k * 10000 + 2000), lat, lng: 26.1, speed: sp, angle: 90, io: { ignition: 1 } }); }
    }
    for (let k = 1; k <= 8; k++) await json('POST', '/api/test/simulate', S, { imei, ts: iso(t0 + 300000 + k * 30000), lat, lng: 26.1, speed: 0, angle: 90, io: { ignition: 1 } });
  }
  await drum(V[0], SD.inceput(ieri) + 9 * 3600000, 44.40);
  await drum(V[1], SD.inceput(ieri) + 10 * 3600000, 44.60);
  await drum(V[0], SD.inceput(zB) + 10 * 3600000, 44.40);
  await drum(V[2], SD.inceput(ieri) + 11 * 3600000, 46.70);

  async function pagina(ck, luna) {
    let r;
    for (let i = 0; i < 20; i++) { r = await json('GET', '/api/insight/safe-drive?luna=' + luna, ck); if (!(r.j && (r.j.pregatire || r.j.inaintePregatire))) break; await sleep(1000); }
    return r;
  }
  const p1 = await pagina(ckSef, LUNA);
  const m0 = (p1.j.masini || []).filter((m) => m.imei === V[0])[0] || {};
  T('pagina răspunde (' + p1.status + '), cu lunile din care se alege, pragurile și prețurile de pornire', p1.status === 200 && Array.isArray(p1.j.luni) && p1.j.luni[0].luna === C.zi(Date.now()).slice(0, 7) && p1.j.praguri.limita === 90 && p1.j.preturi.valori.autoturism.frana === 0.2, p1.text.slice(0, 200));
  T('doar mașinile firmei: B 154 UIP și B 77 RAT, nu CJ 01 ALT', (p1.j.masini || []).length === 2 && p1.text.indexOf(V[2]) < 0, JSON.stringify((p1.j.masini || []).map((m) => m.eticheta)));
  const fr = (d) => iso(SD.inceput(d));
  const eco2 = await json('GET', '/api/reports/ecodrive?imei=' + V[0] + ',' + V[1] + '&from=' + encodeURIComponent(fr(LUNA + '-01')) + '&to=' + encodeURIComponent(iso(SD.inceput(SD.urmatoarea(SD.luna(LUNA).pana)) - 1)) + '&geo=0', ckSef);
  const pv0 = ((eco2.j.perVehicle || []).filter((x) => x.vehicul.indexOf('B 154 UIP') >= 0)[0]) || {};
  T('B 154 UIP pe luna asta: scorul, frânările, accelerările, virajele și km-ii = raportul EcoDrive (' + m0.scor + ', ' + m0.frana + '/' + m0.accel + '/' + m0.viraj + ', ' + m0.km + ' km)',
    eco2.status === 200 && m0.scor === sumar(pv0, 'Scor') && m0.frana === sumar(pv0, 'Frânări bruște') && m0.accel === sumar(pv0, 'Accel. bruște') && m0.viraj === sumar(pv0, 'Viraje bruște') && m0.km === sumar(pv0, 'Km') && m0.frana > 0 && m0.viraj > 0,
    JSON.stringify([m0.scor, m0.frana, m0.accel, m0.viraj, m0.km]) + ' / ' + JSON.stringify(pv0.summary));
  T('scorul flotei = „Scor flotă" din raport', p1.j.flota && p1.j.flota.scor === eco2.j.summary['Scor flotă (0-100)'], JSON.stringify(p1.j.flota) + ' / ' + JSON.stringify(eco2.j.summary));
  // Luna lui „ieri" e luna de acum (până azi) → se compară cu aceleași zile din luna dinainte; altfel cu toată luna dinainte.
  const acumL = C.zi(Date.now()), eLI = I.LUNI[Number(LI.slice(5, 7)) - 1];
  const eAsteptata = LUNA === acumL.slice(0, 7) ? '1–' + Number(acumL.slice(8, 10)) + ' ' + eLI : eLI;
  T('luna dinainte e alături (' + eAsteptata + '), cu „față de" scris de server', p1.j.inainte && p1.j.inainte.luna === LI && p1.j.inainte.eticheta === eAsteptata && p1.j.fata && typeof p1.j.fata.cost === 'string', JSON.stringify([p1.j.inainte, p1.j.fata]));
  T('drumul din ziua 10 a lunii dinainte e citit (pe toată luna: ' + (await pagina(ckSef, LI)).j.flota.km + ' km)', ((await pagina(ckSef, LI)).j.flota || {}).km > 0);
  T('costul fiecărei mașini, pe feluri: combustibil + frâne și anvelope = manevre', (p1.j.masini || []).every((m) => Math.abs(m.cost.accel + m.cost.frane - m.cost.manevre) < 0.011));
  const ion1 = (p1.j.soferi || []).filter((s) => s.nume === 'Ion Popescu')[0] || {};
  T('Ion Popescu, trecut azi pe B 154 UIP (primul lui șofer), poartă și zilele de dinainte; Caddy-ul, fără șofer', ion1.km === m0.km && (p1.j.soferi || []).some((s) => s.nume === 'Fără șofer atribuit'), JSON.stringify(p1.j.soferi));

  const pFara = await json('GET', '/api/insight/safe-drive?luna=' + LUNA, ckFara);
  T('fără loc RA Insight: 403, cu motivul (nu cifrele)', pFara.status === 403 && pFara.j.seatMissing === true && !pFara.j.masini, pFara.status + ' ' + pFara.text.slice(0, 100));
  const pAlt = await pagina(ckAlt, LUNA);
  T('altă firmă: doar mașina ei; nimic din firma noastră', pAlt.status === 200 && (pAlt.j.masini || []).length === 1 && pAlt.text.indexOf(V[0]) < 0 && pAlt.text.indexOf('Ion Popescu') < 0, pAlt.text.slice(0, 200));

  // Grupele: doar mașinile grupei; o grupă a altei firme e ignorată (toată flota)
  const gr = (await json('POST', '/api/groups', ckSef, { name: 'Distribuție' })).j;
  const grB = (await json('POST', '/api/groups', ckAlt, { name: 'Alta' })).j;
  await json('PUT', '/api/devices/' + V[1] + '/assign', ckSef, { group_id: gr.id });
  const pG = await pagina(ckSef, LUNA + '&grupa=' + gr.id);
  T('grupa „Distribuție": doar mașina ei, și lista grupelor („Toată flota · 2 mașini", „Distribuție · 1 mașină")', (pG.j.masini || []).length === 1 && pG.j.masini[0].imei === V[1] && pG.j.grupaAleasa === gr.id && JSON.stringify(pG.j.grupe.map((g) => g.eticheta)) === JSON.stringify(['Toată flota · 2 mașini', 'Distribuție · 1 mașină']), JSON.stringify([pG.j.grupe, (pG.j.masini || []).length]));
  const pGB = await pagina(ckSef, LUNA + '&grupa=' + grB.id);
  T('…iar grupa altei firme e ignorată (toată flota, fără numele grupei străine)', (pGB.j.masini || []).length === 2 && pGB.j.grupaAleasa === null && pGB.text.indexOf('Alta') < 0, JSON.stringify([pGB.j.grupaAleasa, (pGB.j.masini || []).length]));
  // „Am vorbit cu el"
  const dA = await json('POST', '/api/insight/safe-drive/discutie', ckSef, { driverId: ion.id, nota: 'despre frânările de pe centură' });
  const dD = await json('POST', '/api/insight/safe-drive/discutie', ckDisp, { driverId: ion.id });
  const dX = await json('POST', '/api/insight/safe-drive/discutie', ckAlt, { driverId: ion.id });
  const dY = await json('POST', '/api/insight/safe-drive/discutie', ckSef, { driverId: dinB.id });
  T('„Am vorbit cu el": șeful trece discuția (ziua o pune serverul)', dA.status === 200 && dA.j.id > 0 && Math.abs(dA.j.la - Date.now()) < 60000, dA.text);
  T('…dispecerul nu (403), altă firmă nu (404, ca un șofer care nu există), nici pe un șofer al altei firme (404)', dD.status === 403 && dX.status === 404 && dY.status === 404, [dD.status, dX.status, dY.status].join(' '));
  const p2 = await pagina(ckSef, LUNA);
  const ion2 = (p2.j.soferi || []).filter((s) => s.nume === 'Ion Popescu')[0] || {};
  T('discuția apare la Ion, cu ziua de azi și nota', ion2.discutie && ion2.discutie.zi === C.zi(Date.now()) && ion2.discutie.nota === 'despre frânările de pe centură', JSON.stringify(ion2.discutie));
  const sX = await json('DELETE', '/api/insight/safe-drive/discutie/' + dA.j.id, ckAlt);
  const sA = await json('DELETE', '/api/insight/safe-drive/discutie/' + dA.j.id, ckSef);
  T('o discuție trecută din greșeală se scoate — doar din firma ei', sX.status === 404 && sA.status === 200, sX.status + ' ' + sA.status);

  // Prețurile pe eveniment
  const prD = await json('PUT', '/api/insight/safe-drive/preturi', ckDisp, { preturi: { autoturism: { frana: 9 } } });
  const prA = await json('PUT', '/api/insight/safe-drive/preturi', ckSef, { preturi: { autoturism: { frana: 0.5, accel: 'x', viraj: 200 } } });
  T('prețurile: dispecerul nu (403); șeful da, curățate (0,5 / pornire / pornire)', prD.status === 403 && prA.status === 200 && prA.j.preturi.autoturism.frana === 0.5 && prA.j.preturi.autoturism.accel === 0.15 && prA.j.preturi.autoturism.viraj === 0.1, prD.status + ' ' + prA.text.slice(0, 200));
  const p3 = await pagina(ckSef, LUNA);
  const m3 = (p3.j.masini || []).filter((m) => m.imei === V[0])[0] || {};
  T('…iar costul manevrelor se socotește cu ele (B 154 UIP: ' + m3.frana + ' × 0,5 + ' + m3.accel + ' × 0,15 + ' + m3.viraj + ' × 0,10)', m3.cost && m3.cost.manevre === Math.round((m3.frana * 0.5 + m3.accel * 0.15 + m3.viraj * 0.1) * 100) / 100 && p3.j.preturi.valori.autoturism.frana === 0.5, JSON.stringify(m3.cost));
  const pAlt2 = await pagina(ckAlt, LUNA);
  T('…doar în firma lui: cealaltă firmă are tot prețurile de pornire', pAlt2.j.preturi && pAlt2.j.preturi.valori.autoturism.frana === 0.2);

  // Schimbul de șofer nu mută zilele trecute — nici în pagină, nici în raport
  await json('PUT', '/api/devices/' + V[0] + '/assign', ckSef, { driver_id: mihai.id });
  const noapte = await json('POST', '/api/test/safe-drive-noaptea', S, { acum: Date.now() });
  T('tura de noapte: refăcute ultimele 3 zile pentru mașinile firmelor cu RA Insight (3 mașini)', noapte.status === 200 && noapte.j.masini === 3 && noapte.j.pana === ieri, noapte.text);
  const p4 = await pagina(ckSef, LUNA);
  const ion4 = (p4.j.soferi || []).filter((s) => s.nume === 'Ion Popescu')[0] || {};
  T('după ce Mihai a luat mașina azi, ziua de ieri rămâne a lui Ion (refăcută de tura de noapte)', ion4.km === m0.km && !(p4.j.soferi || []).some((s) => s.nume === 'Mihai Pop'), JSON.stringify(p4.j.soferi));
  const eco3 = await json('GET', '/api/reports/ecodrive_drivers?imei=' + V[0] + '&from=' + encodeURIComponent(fr(LUNA + '-01')) + '&to=' + encodeURIComponent(iso(SD.inceput(SD.urmatoarea(SD.luna(LUNA).pana)) - 1)), ckSef);
  T('…și în clasamentul EcoDrive pe șoferi tot Ion apare, nu Mihai', eco3.status === 200 && (eco3.j.rows || []).length === 1 && eco3.j.rows[0][1] === 'Ion Popescu', JSON.stringify(eco3.j.rows));

  // Aparatul arhivat: la 30 de zile, zilele pleacă odată cu pozițiile
  await json('PUT', '/api/devices/' + V[1] + '/status', S, { status: 'archived' });
  const p5 = await pagina(ckSef, LUNA);
  T('aparatul arhivat iese din pagină pe loc', (p5.j.masini || []).length === 1 && p5.text.indexOf(V[1]) < 0);
  await json('POST', '/api/test/arhivat-de', S, { imei: V[1], zile: 31 });
  const purj = await json('POST', '/api/admin/arhiva/sterge-istoric', S);
  const st = ((purj.j.sterse || []).filter((x) => x.imei === V[1])[0]) || {};
  T('la 30 de zile după arhivare se șterg și zilele lui (' + st.zile + ')', purj.status === 200 && st.zile > 0 && st.pozitii > 0, purj.text.slice(0, 200));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); process.exit(1); });
