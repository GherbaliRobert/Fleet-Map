'use strict';
// demo_flota.js — flota de probă a COMPANIEI DEMO (19.11; Alin: „varianta 2” — mașinile de pe site, cu șoferi, acte, revizii,
// alimentări, opriri și istoric pe ultimele 30 de zile; „agenții ar trebui să aibă niște texte despre mașinile demo”).
//
// CURAT: fără bază de date, fără ceas propriu, fără formatatoare noi (ziua pe ora României vine din insight.inceputZiRO).
// O zi e o funcție de (mașină, numărul zilei de la EPOCA): aceeași zi dă mereu aceleași poziții. Așa istoricul scris o dată și
// harta live (citită clipă de clipă, `stareaLa`) spun același lucru, iar o zi lipsă se poate reface oricând, identic.
//
// Ce se întâmplă AZI (`azi` = numărul zilei de acum) e mai mult decât într-o zi obișnuită, ca agenții să aibă ce arăta, ca pe site:
//   B 90 CTR  — noaptea, la depozit, rezervorul scade cu 38 L; dimineața, înainte de plecare, se pun la loc (RA Watch: scădere).
//   B 63 FRG  — frigorificul stă 2 h 10 min la un client cu motorul pornit (RA Watch: ralanti prelungit).
//   B 77 TIR  — pe primul drum, doar o oprire de 25 de minute în loc de pauza de 45 (RA Compliance: peste 4h30 de condus continuu).
//   B 204 RAT — frânări și accelerări bruște prin oraș (RA Optimize: scor eco slab).
//   B 88 AUT  — mașina de rezervă stă la depozit (RA Dispatch: disponibilă, nefolosită).
// Toate sunt „neutre”: nu schimbă kilometrajul și motorina de la capătul zilei, deci ziua de mâine pleacă de unde trebuie, oricând
// ar fi fost scrisă ziua de azi. Actele și reviziile (RA Care) vin din `acte` și `revizii`, socotite față de azi.
// Drumurile sunt linii între locuri adevărate (depozit, cartiere, orașe, puncte de pe autostradă), NU pe străzi — drumurile pe
// străzi se discută separat (Alin, 19.11).

const insight = require('./insight');

const MIN = 60000, ORA = 3600000;
// Ziua 0. FIXĂ: kilometrajul și motorina se adună de aici, deci aceeași zi iese la fel oricând e citită.
const EPOCA = { y: 2026, m0: 8, d: 1 };
const ZILE_ISTORIC = 30;
const PAS_DRUM_MS = 60000;          // o poziție pe minut în mers (ca un aparat obișnuit)
const PAS_RALANTI_MS = 2 * MIN;     // motor pornit pe loc: din 2 în 2 minute (RA Watch rupe ralantiul la goluri de peste 5)
const PAS_PARCAT_MS = 30 * MIN;     // parcat, motorul oprit: un semn la 30 de minute
const PRAG_ALIMENTARE = 0.22;       // sub 22% din rezervor, se alimentează înainte de drumul următor

// ─── Locurile (lat, lng) ────────────────────────────────────────────────────────────────────────────────────────────────
const LOC = {
  depozit: [44.4541, 25.9817],     // Chiajna, lângă ieșirea spre A1
  baneasa: [44.5050, 26.0800], pipera: [44.4985, 26.1205], unirii: [44.4268, 26.1025], berceni: [44.3830, 26.1210],
  titan: [44.4205, 26.1785], taberei: [44.4205, 26.0365], otopeni: [44.5490, 26.0730], voluntari: [44.4920, 26.1715],
  popesti: [44.3790, 26.1665], chitila: [44.5070, 25.9825], pantelimon: [44.4545, 26.2070], militari: [44.4350, 26.0170],
  colentina: [44.4620, 26.1420], rahova: [44.4080, 26.0570], floreasca: [44.4640, 26.1050], domenii: [44.4710, 26.0730],
  ploiesti: [44.9419, 26.0225], pitesti: [44.8565, 24.8692], craiova: [44.3302, 23.7949], constanta: [44.1720, 28.6480]
};
const ORAS = ['baneasa', 'pipera', 'unirii', 'berceni', 'titan', 'taberei', 'otopeni', 'voluntari', 'popesti', 'chitila',
  'pantelimon', 'militari', 'colentina', 'rahova', 'floreasca', 'domenii'];
// Autostrăzile, prin câteva puncte de pe traseu. Întoarcerea = aceeași listă, invers.
const RUTE = {
  constanta: [LOC.depozit, [44.4300, 26.0600], [44.4100, 26.2300], [44.3600, 26.5500], [44.3000, 27.0000], [44.2500, 27.3800],
    [44.3300, 27.8800], [44.2300, 28.2900], [44.1900, 28.5600], LOC.constanta],
  pitesti: [LOC.depozit, [44.4900, 25.8200], [44.5650, 25.6100], [44.6400, 25.4200], [44.7300, 25.1600], [44.8200, 24.9700], LOC.pitesti],
  craiova: [LOC.pitesti, [44.7300, 24.6500], [44.5800, 24.4000], [44.4500, 24.1000], LOC.craiova],
  ploiesti: [LOC.depozit, LOC.chitila, [44.6000, 26.0000], [44.7500, 26.0100], LOC.ploiesti]
};
// Portul Constanța: un ocol pe la terminal (drum încet, ca manevrele dintr-un port).
const PORT = [LOC.constanta, [44.1610, 28.6560], [44.1490, 28.6480], [44.1560, 28.6330], LOC.constanta];

// ─── Mașinile (numerele și modelele de pe site: „VW Caddy (B 204 RAT)”, „Iveco Stralis (B 77 TIR)”, „Dacia Logan (B 31 LOG)”) ──
// fel: oras (livrări prin București) · frig (livrări cu frigorificul, motorul merge la descărcare) · agent (vizite la clienți)
// · regional (Ploiești / Pitești) · lung (naveta la portul Constanța) · rezerva (stă la depozit, iese rar).
const MASINI = [
  { imei: 'DEMO0001', nume: 'VW Caddy', nr: 'B 204 RAT', tip: 'Dubă', icon: 'van', marca: 'Volkswagen', model: 'Caddy', an: 2021, comb: 'Diesel', rezervor: 55,
    oras: 7.4, drum: 6.1, ralanti: 0.8, limita: 90, odo0: 84200, sofer: 'Mihai Ionescu', grupa: 'Distribuție București', fel: 'oras', v: 34 },
  { imei: 'DEMO0002', nume: 'Iveco Stralis', nr: 'B 77 TIR', tip: 'Autotractor', icon: 'autotractor', marca: 'Iveco', model: 'Stralis', an: 2019, comb: 'Diesel', rezervor: 600,
    oras: 36, drum: 29.5, ralanti: 3, limita: 85, odo0: 612400, sofer: 'Vasile Dumitru', grupa: 'Transport marfă', fel: 'lung', v: 74 },
  { imei: 'DEMO0003', nume: 'Renault Master', nr: 'B 18 VAN', tip: 'Dubă', icon: 'van', marca: 'Renault', model: 'Master', an: 2020, comb: 'Diesel', rezervor: 80,
    oras: 10.8, drum: 8.9, ralanti: 1.1, limita: 90, odo0: 143900, sofer: 'Ion Popa', grupa: 'Distribuție București', fel: 'oras', v: 31 },
  { imei: 'DEMO0004', nume: 'Dacia Logan', nr: 'B 31 LOG', tip: 'Auto', icon: 'car', marca: 'Dacia', model: 'Logan', an: 2022, comb: 'Benzină', rezervor: 50,
    oras: 7.2, drum: 5.6, ralanti: 0.7, limita: 100, odo0: 96300, sofer: 'Cristian Matei', grupa: 'Agenți de vânzări', fel: 'agent', v: 36 },
  { imei: 'DEMO0005', nume: 'Iveco Eurocargo', nr: 'B 90 CTR', tip: 'Camion', icon: 'truck', marca: 'Iveco', model: 'Eurocargo', an: 2018, comb: 'Diesel', rezervor: 200,
    oras: 22, drum: 17.5, ralanti: 2, limita: 85, odo0: 287600, sofer: 'Florin Neagu', grupa: 'Transport marfă', fel: 'regional', v: 66 },
  { imei: 'DEMO0006', nume: 'VW Crafter', nr: 'B 52 DUB', tip: 'Dubă', icon: 'van', marca: 'Volkswagen', model: 'Crafter', an: 2021, comb: 'Diesel', rezervor: 75,
    oras: 10.4, drum: 8.4, ralanti: 1, limita: 90, odo0: 121500, sofer: 'Elena Stoica', grupa: 'Distribuție București', fel: 'oras', v: 32 },
  { imei: 'DEMO0007', nume: 'Mercedes Sprinter', nr: 'B 63 FRG', tip: 'Dubă', icon: 'van', marca: 'Mercedes-Benz', model: 'Sprinter frigorific', an: 2020, comb: 'Diesel', rezervor: 75,
    oras: 11.6, drum: 9.4, ralanti: 1.6, limita: 90, odo0: 176800, sofer: 'George Tudor', grupa: 'Distribuție București', fel: 'frig', v: 30 },
  { imei: 'DEMO0008', nume: 'Skoda Octavia', nr: 'B 88 AUT', tip: 'Auto', icon: 'car', marca: 'Skoda', model: 'Octavia', an: 2023, comb: 'Diesel', rezervor: 55,
    oras: 6.1, drum: 4.7, ralanti: 0.6, limita: 100, odo0: 58200, sofer: null, grupa: 'Agenți de vânzări', fel: 'rezerva', v: 38 }
];
const IMEIS = MASINI.map(function (m) { return m.imei; });
const _peImei = {}; MASINI.forEach(function (m) { _peImei[m.imei] = m; });
// Camioanele (Reg. 561) trimit și date de tahograf: viteza și cardul șoferului.
const CARD = { DEMO0002: 'RO000077TIR0001', DEMO0005: 'RO000090CTR0001' };

const SOFERI = [
  { nume: 'Mihai Ionescu', categorii: 'B', permisZile: 900 },
  { nume: 'Vasile Dumitru', categorii: 'B,C,CE', permisZile: 1300 },
  { nume: 'Ion Popa', categorii: 'B,C1', permisZile: 700 },
  { nume: 'Cristian Matei', categorii: 'B', permisZile: 1500 },
  { nume: 'Florin Neagu', categorii: 'B,C', permisZile: 25 },     // permisul expiră curând
  { nume: 'Elena Stoica', categorii: 'B', permisZile: 1100 },
  { nume: 'George Tudor', categorii: 'B,C1', permisZile: 800 }
];
const GRUPE = [
  { nume: 'Distribuție București', culoare: '#22c55e' },
  { nume: 'Transport marfă', culoare: '#f59e0b' },
  { nume: 'Agenți de vânzări', culoare: '#3b82f6' }
];
// Actele: [mașina, tipul (lista din maint_types.js), câte zile mai sunt (negativ = expirat de atâtea zile)].
const ACTE = [
  ['DEMO0002', 'ITP', 12], ['DEMO0002', 'RCA', 140], ['DEMO0002', 'Rovinietă', 200], ['DEMO0002', 'CASCO', 95], ['DEMO0002', 'Tahograf', 410],
  ['DEMO0001', 'RCA', 19], ['DEMO0001', 'ITP', 160], ['DEMO0001', 'Rovinietă', 75],
  ['DEMO0003', 'Rovinietă', -3], ['DEMO0003', 'RCA', 210], ['DEMO0003', 'ITP', 300],
  ['DEMO0004', 'ITP', 230], ['DEMO0004', 'RCA', 120], ['DEMO0004', 'Rovinietă', 160],
  ['DEMO0005', 'ITP', 180], ['DEMO0005', 'RCA', 60], ['DEMO0005', 'Rovinietă', 45], ['DEMO0005', 'Tahograf', 520],
  ['DEMO0006', 'ITP', 270], ['DEMO0006', 'RCA', 150], ['DEMO0006', 'Rovinietă', 230],
  ['DEMO0007', 'ITP', 90], ['DEMO0007', 'RCA', 85], ['DEMO0007', 'Rovinietă', 120],
  ['DEMO0008', 'ITP', 400], ['DEMO0008', 'RCA', 330], ['DEMO0008', 'Rovinietă', 300]
];

// ─── Zilele, pe ora României ───────────────────────────────────────────────────────────────────────────────────────────
const _zi0 = new Map();
function inceputZi(idx) {
  let v = _zi0.get(idx);
  if (v == null) { v = insight.inceputZiRO(EPOCA.y, EPOCA.m0, EPOCA.d + idx); _zi0.set(idx, v); if (_zi0.size > 4000) _zi0.clear(); }
  return v;
}
// Numărul zilei (de la EPOCA) în care cade clipa `t`.
function ziuaLa(t) {
  let i = Math.floor((Number(t) - inceputZi(0)) / 86400000);
  while (t < inceputZi(i)) i--;
  while (t >= inceputZi(i + 1)) i++;
  return i;
}
// „AAAA-LL-ZZ” al zilei `idx` (calendarul, nu ceasul).
function dataZi(idx) { return new Date(Date.UTC(EPOCA.y, EPOCA.m0, EPOCA.d + idx)).toISOString().slice(0, 10); }
// 1 = luni … 7 = duminică
function ziSaptamana(idx) { const d = new Date(Date.UTC(EPOCA.y, EPOCA.m0, EPOCA.d + idx)).getUTCDay(); return d === 0 ? 7 : d; }

// ─── Hazardul, mereu același pe aceeași zi ─────────────────────────────────────────────────────────────────────────────
function _rng(cheie) {
  let h = 2166136261;
  for (let i = 0; i < cheie.length; i++) h = Math.imul(h ^ cheie.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Geometrie ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function _km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function _lungime(cale) { let s = 0; for (let i = 1; i < cale.length; i++) s += _km(cale[i - 1], cale[i]); return s; }
function _unghi(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return Math.round(((Math.atan2(y, x) / rad) + 360) % 360);
}
// Punctul aflat la fracția f (0..1) din lungimea căii, cu direcția de mers.
function _peCale(cale, f) {
  const tot = _lungime(cale);
  let tinta = Math.max(0, Math.min(1, f)) * tot;
  for (let i = 1; i < cale.length; i++) {
    const d = _km(cale[i - 1], cale[i]);
    if (tinta <= d || i === cale.length - 1) {
      const k = d > 0 ? Math.min(1, tinta / d) : 1;
      return { lat: cale[i - 1][0] + (cale[i][0] - cale[i - 1][0]) * k, lng: cale[i - 1][1] + (cale[i][1] - cale[i - 1][1]) * k, unghi: _unghi(cale[i - 1], cale[i]) };
    }
    tinta -= d;
  }
  const u = cale[cale.length - 1];
  return { lat: u[0], lng: u[1], unghi: 0 };
}
// Prin oraș: un cot, ca drumul să nu taie în linie dreaptă (tot nu e pe străzi).
function _caleOras(a, b, r) {
  const cot = r() < 0.5 ? [a[0], b[1]] : [b[0], a[1]];
  const mij = [(a[0] + b[0]) / 2 + (r() - 0.5) * 0.006, (a[1] + b[1]) / 2 + (r() - 0.5) * 0.006];
  return r() < 0.5 ? [a, cot, b] : [a, mij, b];
}

// ─── Planul unei zile ──────────────────────────────────────────────────────────────────────────────────────────────────
// Bucăți: { fel: 'parcat' | 'ralanti' | 'drum', de, pana, loc | cale, v, km, l (litri consumați), evenimente? }
// plus alimentările și scăderea de noapte (`motorina`: [{ la, delta }]). `stare` = { odo (km), litri } la miezul nopții.
function _plan(m, idx, stare, azi) {
  const r = _rng(m.imei + '|' + idx);
  const z0 = inceputZi(idx), z1 = inceputZi(idx + 1);
  const dow = ziSaptamana(idx);
  const eAzi = idx === azi;
  const bucati = [], motorina = [];
  let t = z0, loc = LOC.depozit, litri = stare.litri;
  const pune = function (b) { bucati.push(b); t = b.pana; };
  const stai = function (minute, fel) { const pana = t + minute * MIN; if (pana > t) pune({ fel: fel || 'parcat', de: t, pana: pana, loc: loc }); };
  const pleacaLa = function (ora, minut) { const la = z0 + (ora * 60 + minut) * MIN; if (la > t) pune({ fel: 'parcat', de: t, pana: la, loc: loc }); };
  const alimenteaza = function () {
    const plin = Math.round(m.rezervor * 0.95);
    if (litri >= plin - 1) return;
    stai(10);
    motorina.push({ la: t, delta: plin - litri, fel: 'alimentare' });
    litri = plin;
  };
  const mergi = function (cale, v, evenimente, fix) {
    const km = _lungime(cale);
    const cons = (v > 55 ? m.drum : m.oras) / 100;
    if (litri - km * cons < m.rezervor * PRAG_ALIMENTARE) alimenteaza();
    const vMed = fix ? v : v * (0.92 + r() * 0.16);
    const dur = km / vMed * ORA;
    const b = { fel: 'drum', de: t, pana: t + dur, cale: cale, v: vMed, km: km, l: km * cons };
    if (evenimente && evenimente.length) b.evenimente = evenimente;
    pune(b);
    litri -= km * cons; loc = cale[cale.length - 1];
  };
  const prinOras = function (spre, ev) { mergi(_caleOras(loc, spre, r), m.v, ev); };
  const alege = function () { return LOC[ORAS[Math.floor(r() * ORAS.length)]]; };
  // Livrările sar prin tot orașul: următorul client e la cel puțin 6 km (drumurile țin mai mult, harta are mai multă mișcare).
  const departe = function () { for (let k = 0; k < 8; k++) { const x = alege(); if (_km(loc, x) >= 6) return x; } return alege(); };
  // B 90 CTR: scăderea de noapte, la depozit, apoi la loc dimineață (neutră pentru ziua de mâine).
  if (eAzi && m.fel === 'regional') {
    pleacaLa(2, 10);
    motorina.push({ la: t, delta: -38, fel: 'scadere' }); litri -= 38;
    pleacaLa(6, 5); stai(10);
    motorina.push({ la: t, delta: 38, fel: 'alimentare' }); litri += 38;
  }
  // Luni–vineri toți; sâmbăta jumătate de zi (fără agent și rezervă; camionul de Constanța, toată ziua); duminica doar frigorificul.
  const lucreaza = dow <= 5 || (dow === 6 && m.fel !== 'agent' && m.fel !== 'rezerva') || (dow === 7 && m.fel === 'frig');
  const jumatate = dow === 6;
  if (lucreaza) {
    if (m.fel === 'oras' || m.fel === 'frig') {
      pleacaLa(7, 15 + Math.floor(r() * 40));
      const n = jumatate ? 4 : 8 + Math.floor(r() * 3);
      // B 204 RAT, azi: frânări și accelerări bruște pe primele patru drumuri (RA Optimize le numără). Nu schimbă nici drumul,
      // nici timpul: doar câte trei puncte la 5 secunde.
      const brusc = eAzi && m.imei === 'DEMO0001';
      for (let i = 0; i < n; i++) {
        const ev = brusc && i < 6 ? [{ f: 0.3, fel: 'franare' }, { f: 0.55, fel: 'accelerare' }, { f: 0.8, fel: 'franare' }] : null;
        prinOras(departe(), ev);
        if (m.fel === 'frig') {
          // frigorificul descarcă cu motorul pornit; azi, la al doilea client, 2 h 10 min (hazardul se trage oricum, ca restul
          // zilei să rămână același)
          const a = 8 + Math.floor(r() * 12), b2 = 5 + Math.floor(r() * 10);
          if (eAzi && i === 1) stai(130, 'ralanti');
          else { stai(a, 'ralanti'); stai(b2); }
        } else stai(12 + Math.floor(r() * 18));
        if (!jumatate && i === 2) stai(35 + Math.floor(r() * 10));   // masa de prânz
      }
      prinOras(LOC.depozit);
    } else if (m.fel === 'agent') {
      pleacaLa(8, 30 + Math.floor(r() * 30));
      const laPloiesti = dow === 2 || dow === 4;
      if (laPloiesti) {
        mergi(RUTE.ploiesti, 72); stai(45 + Math.floor(r() * 20));
        prinOras([44.9480, 26.0400]); stai(40 + Math.floor(r() * 20));
        mergi(RUTE.ploiesti.slice().reverse(), 74);
      }
      const n = laPloiesti ? 2 : 5 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) { prinOras(departe()); stai(25 + Math.floor(r() * 25)); if (i === 2) stai(40); }
      prinOras(LOC.depozit);
    } else if (m.fel === 'regional') {
      pleacaLa(6, 30 + Math.floor(r() * 20));
      const spre = (dow === 2 || dow === 4) ? 'pitesti' : 'ploiesti';
      mergi(RUTE[spre], 68); stai(55 + Math.floor(r() * 25));
      prinOras(LOC[spre] === LOC.pitesti ? [44.8700, 24.8900] : [44.9300, 26.0500]); stai(30 + Math.floor(r() * 20));
      mergi(RUTE[spre].slice().reverse(), 70);
      if (!jumatate) { stai(40); for (let i = 0; i < 4; i++) { prinOras(departe()); stai(15 + Math.floor(r() * 15)); } prinOras(LOC.depozit); }
    } else if (m.fel === 'lung') {
      // Naveta la portul Constanța, în fiecare zi lucrătoare (sâmbăta inclusiv): ~225 km dus, descărcare, ~225 km întors.
      // Vitezele sunt fixe (camion greu, cu trafic): azi, cu oprirea de 25 de minute în loc de pauza de 45, drumul de dus
      // trece de 4h30 de condus continuu (RA Compliance), iar ziua rămâne sub 9 ore de condus.
      const plecare = 10 + Math.floor(r() * 30);
      pleacaLa(5, eAzi ? 0 : plecare);
      const dus = RUTE.constanta, mij = Math.floor(dus.length / 2);
      mergi(dus.slice(0, mij + 1), 62, null, true); stai(eAzi ? 25 : 45);
      mergi(dus.slice(mij), 62, null, true);
      mergi(PORT, 8, null, true); stai(120 + Math.floor(r() * 30));
      const intors = dus.slice().reverse();
      mergi(intors.slice(0, mij + 1), 64, null, true); stai(45);
      mergi(intors.slice(mij), 64, null, true);
    } else if (m.fel === 'rezerva') {
      // Mașina de rezervă iese rar: o zi din zece, câteva ore. Azi stă (RA Dispatch o arată liberă).
      if (!eAzi && idx % 10 === 0 && dow <= 5) {
        pleacaLa(13, 0);
        for (let i = 0; i < 3; i++) { prinOras(alege()); stai(40); }
        prinOras(LOC.depozit);
      }
    }
  }
  if (t < z1) pune({ fel: 'parcat', de: t, pana: z1, loc: loc });
  bucati.forEach(function (b) { if (b.pana > z1) b.pana = z1; });   // ziua se oprește la miezul nopții (planurile de aici nu ajung acolo)
  // O zi lungă care trece de miezul nopții se taie: restul nu se mai pierde, doar nu se mai scrie (nu se întâmplă cu planurile de aici).
  const km = bucati.reduce(function (s, b) { return s + (b.km || 0); }, 0);
  return { idx: idx, z0: z0, z1: z1, bucati: bucati.filter(function (b) { return b.de < z1; }), motorina: motorina, km: km,
    odo0: stare.odo, litri0: stare.litri, litri1: litri };
}

// Starea de la miezul nopții (kilometraj, motorină), adunată de la EPOCA cu planurile OBIȘNUITE (fără ce se întâmplă azi —
// acelea sunt neutre), ținută minte pe mașină.
const _stari = new Map();
function _stareZi(m, idx) {
  let s = _stari.get(m.imei);
  if (!s) { s = [{ odo: m.odo0, litri: Math.round(m.rezervor * 0.7) }]; _stari.set(m.imei, s); }
  if (idx < 0) return s[0];
  while (s.length <= idx) {
    const i = s.length - 1;
    const p = _plan(m, i, s[i], -1);
    s.push({ odo: s[i].odo + p.km, litri: p.litri1 });
  }
  return s[idx];
}
function _planZi(m, idx, azi) { return _plan(m, idx, _stareZi(m, idx), azi); }

// ─── Ce trimite „aparatul” într-o clipă ────────────────────────────────────────────────────────────────────────────────
// Viteza pe drum: aproape de media bucății, cu o undă lentă (mereu aceeași la aceeași clipă).
function _viteza(b, t) {
  const und = Math.sin((t / 60000) * 0.7 + b.de / 1e7) * 0.12 + Math.sin((t / 60000) * 0.23) * 0.06;
  return Math.max(4, Math.round(b.v * (1 + und)));
}
function _io(m, ign, litri, odoKm, v) {
  const io = { ignition: ign ? 1 : 0, fuel_level_liters: Math.round(litri * 10) / 10, total_odometer: Math.round(odoKm * 1000) };
  if (CARD[m.imei] && ign) { io.can_tacho_speed = v; io.driver_card_id = CARD[m.imei]; }
  return io;
}
// Kilometrajul și motorina în clipa t (înainte de bucata care o conține: tot ce s-a mers până atunci).
function _laClipa(m, p, t) {
  let odo = p.odo0, litri = p.litri0;
  for (const e of p.motorina) if (e.la <= t) litri += e.delta;
  for (const b of p.bucati) {
    if (b.fel !== 'drum') continue;
    if (b.pana <= t) { odo += b.km; litri -= b.l; }
    else if (b.de < t) { const f = (t - b.de) / (b.pana - b.de); odo += b.km * f; litri -= b.l * f; }
  }
  return { odo: odo, litri: Math.max(0, litri) };
}
function _punct(m, p, b, t, vPus) {
  const st = _laClipa(m, p, t);
  if (b.fel === 'drum') {
    const f = (t - b.de) / (b.pana - b.de), pc = _peCale(b.cale, f);
    const v = vPus != null ? vPus : _viteza(b, t);
    return { t: t, lat: pc.lat, lng: pc.lng, v: v, unghi: pc.unghi, io: _io(m, true, st.litri, st.odo, v) };
  }
  const ign = b.fel === 'ralanti';
  return { t: t, lat: b.loc[0], lng: b.loc[1], v: 0, unghi: 0, io: _io(m, ign, st.litri, st.odo, 0) };
}

// Pozițiile unei zile, cum le-ar fi trimis aparatul: pe drum la un minut, cu motorul pornit pe loc la 2 minute, parcat la 30.
// Frânările și accelerările bruște au câte trei puncte la 5 secunde (RA Optimize le vede din diferența de viteză).
function punctePeZi(imei, idx, azi) {
  const m = _peImei[imei]; if (!m) return [];
  const p = _planZi(m, idx, azi);
  const out = [];
  for (const b of p.bucati) {
    const pas = b.fel === 'drum' ? PAS_DRUM_MS : (b.fel === 'ralanti' ? PAS_RALANTI_MS : PAS_PARCAT_MS);
    for (let t = b.de; t < b.pana; t += pas) out.push(_punct(m, p, b, t));
    for (const e of (b.evenimente || [])) {
      const te = Math.round(b.de + (b.pana - b.de) * e.f);
      const sus = Math.max(56, Math.round(b.v * 1.7)), jos = 8;   // ±(48 km/h în 5 s) > pragurile lui RA Optimize (7 și 9 km/h pe secundă)
      const vit = e.fel === 'franare' ? [sus, jos, Math.round(b.v)] : [jos, sus, Math.round(b.v)];
      [-5000, 0, 25000].forEach(function (d, k) { out.push(_punct(m, p, b, te + d, vit[k])); });
    }
  }
  // scăderea de noapte și alimentările: câte un punct chiar înainte și chiar după
  for (const e of p.motorina) {
    const b = p.bucati.filter(function (x) { return x.de <= e.la && e.la < x.pana; })[0] || p.bucati[0];
    out.push(_punct(m, p, b, e.la - 1000)); out.push(_punct(m, p, b, e.la + 1000));
  }
  out.sort(function (a, b) { return a.t - b.t; });
  // fără două puncte în aceeași secundă (cheia bazei e mașina + clipa)
  const unice = [];
  for (const x of out) if (!unice.length || Math.floor(unice[unice.length - 1].t / 1000) !== Math.floor(x.t / 1000)) unice.push(x);
  return unice;
}
// Pozițiile dintre două clipe (deLa < t ≤ pana), peste oricâte zile.
function puncteIntre(imei, deLa, pana, azi) {
  const out = [];
  for (let i = ziuaLa(deLa); i <= ziuaLa(pana); i++) {
    for (const x of punctePeZi(imei, i, azi)) if (x.t > deLa && x.t <= pana) out.push(x);
  }
  return out;
}
// Poziția de ACUM, pentru harta live (aceeași regulă ca istoricul, la orice clipă).
function stareaLa(imei, t, azi) {
  const m = _peImei[imei]; if (!m) return null;
  const idx = ziuaLa(t);
  const p = _planZi(m, idx, azi == null ? idx : azi);
  const b = p.bucati.filter(function (x) { return x.de <= t && t < x.pana; })[0] || p.bucati[p.bucati.length - 1];
  return _punct(m, p, b, t);
}
// Kilometrajul de acum (km), pentru revizia pe km (RA Care).
function odoLa(imei, t) { const m = _peImei[imei]; if (!m) return null; const idx = ziuaLa(t); return Math.round(_laClipa(m, _planZi(m, idx, idx), t).odo); }

// ─── Actele, reviziile, permisele — față de AZI ────────────────────────────────────────────────────────────────────────
function acte(acum) {
  const azi = ziuaLa(acum);
  return ACTE.map(function (a) { return { imei: a[0], doc_type: a[1], expiry_date: dataZi(azi + a[2]), issue_date: dataZi(azi + a[2] - 365) }; });
}
function revizii(acum) {
  const azi = ziuaLa(acum);
  return [
    { imei: 'DEMO0005', type: 'Revizie generală', description: 'Ulei, filtre și verificarea frânelor', due_km: odoLa('DEMO0005', acum) + 320, interval_km: 40000 },
    { imei: 'DEMO0006', type: 'Anvelope', description: 'Trecerea pe anvelopele de iarnă', due_date: dataZi(azi + 9) },
    { imei: 'DEMO0001', type: 'Schimb ulei + filtru', description: 'La 15.000 km', due_km: odoLa('DEMO0001', acum) + 4200, interval_km: 15000 }
  ];
}
function soferi(acum) {
  const azi = ziuaLa(acum);
  return SOFERI.map(function (s) { return { name: s.nume, license_categories: s.categorii, license_expiry: dataZi(azi + s.permisZile) }; });
}
// Fișa fiecărei mașini (ce se scrie în baza aplicației).
function fisa(m) {
  return { name: m.nume, plate: m.nr, vehicle_type: m.tip, icon: m.icon, brand: m.marca, model: m.model, year: m.an, fuel_type: m.comb,
    tank_capacity: m.rezervor, consumption_city: m.oras, consumption_road: m.drum, consumption_idle: m.ralanti, speed_limit: m.limita };
}

module.exports = {
  EPOCA, ZILE_ISTORIC, LOC, MASINI, IMEIS, SOFERI, GRUPE, ACTE, CARD,
  inceputZi, ziuaLa, dataZi, ziSaptamana, punctePeZi, puncteIntre, stareaLa, odoLa, acte, revizii, soferi, fisa,
  _plan: _planZi
};
