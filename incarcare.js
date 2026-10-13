// incarcare.js — regulile simulatorului de încărcare (Robert, 12.10: „să poți alege din flota pe care o ai deja… și pentru
// camioane, de exemplu 3,5 t, 7 t"). CURAT: fără bază de date, fără rețea.
//
//   • FELURI_VEHICUL — felul vehiculului cu caroserie (fila „Încărcare" din fișa vehiculului): autotractor, dubă 3,5 t,
//     camion 7,5 / 12 / 18 t, altul. Cifrele sunt cele OBIȘNUITE: omul le schimbă după fișa tehnică a mașinii lui.
//   • TIPURI_REMORCA — semiremorcile (pe șaua autotractorului) și remorcile cu proțap (la camionul cu cârlig), deosebite
//     (Robert: „le diferențiem"), cu tipurile lor obișnuite.
//   • curataRemorca / curataCaroserie — ce se poate scrie (cifre cu sens, în metri și kilograme).
//   • paletiEur / paletiInd — câți paleți încap la un rând (EUR 120 × 80, industrial 120 × 100).
//   • simuleaza — simulatorul (pasul 3, 12.10): cum se așază marfa (aranjeaza), greutatea pe osii (osii), cifrele și
//     TEXTELE gata scrise. Pagina, PDF-ul și (mai târziu) telefonul le primesc de la server — nimeni nu le socotește a doua oară.
//     Limitele pe axe: din „Config Camion" (fișa), altfel cele obișnuite ale felului (limFata / limSpate / masaMax), spuse ca
//     „presupuse". Fizica e cea a machetei aprobate (12.10): momente față de axe, pivot, șa.
//
// Le citesc serverul (validarea, rutele) și ecranele, prin GET /api/incarcare/meta — pagina și telefonul NU scriu a doua
// oară cifrele obișnuite. Legat prin verify_flota_incarcare.js.
'use strict';

const FELURI_VEHICUL = [
  { id: 'autotractor', et: 'Autotractor', caroserie: false, ampatament: 3.7, sa: 0.55, taraFata: 5200, taraSpate: 2600, limFata: 8000, limSpate: 11500, masaMax: 40000 },
  { id: 'duba35', et: 'Dubă 3,5 t', caroserie: true, lungime: 4.3, latime: 1.78, inaltime: 1.94, sarcina: 1300, ampatament: 4.1, axaCaroserie: 1.0, taraFata: 1250, taraSpate: 950, limFata: 1850, limSpate: 2450, masaMax: 3500 },
  { id: 'camion75', et: 'Camion 7,5 t', caroserie: true, lungime: 6.2, latime: 2.45, inaltime: 2.4, sarcina: 3000, ampatament: 4.2, axaCaroserie: 0.9, taraFata: 2600, taraSpate: 1900, limFata: 3100, limSpate: 5400, masaMax: 7490 },
  { id: 'camion12', et: 'Camion 12 t', caroserie: true, lungime: 7.2, latime: 2.45, inaltime: 2.5, sarcina: 5950, ampatament: 4.8, axaCaroserie: 0.95, taraFata: 3600, taraSpate: 2450, limFata: 4500, limSpate: 8000, masaMax: 12000 },
  { id: 'camion18', et: 'Camion 18 t', caroserie: true, lungime: 8.5, latime: 2.48, inaltime: 2.6, sarcina: 9500, ampatament: 5.4, axaCaroserie: 1.05, taraFata: 4900, taraSpate: 3600, limFata: 7100, limSpate: 11500, masaMax: 18000 },
  { id: 'altul', et: 'Altul (scriu eu)', caroserie: true }
];

const FEL_REMORCA = [
  { id: 'semiremorca', et: 'Semiremorcă', cuplare: 'pe șaua unui autotractor' },
  { id: 'remorca', et: 'Remorcă cu proțap', cuplare: 'la un camion cu cârlig' }
];
const TIPURI_REMORCA = {
  semiremorca: [
    { id: 'prelata', et: 'Prelată standard', lungime: 13.6, latime: 2.48, inaltime: 2.7, sarcina: 24000, tara: 7000, axe: 3, pivotAxe: 7.8, limitaAxe: 24000 },
    { id: 'mega', et: 'Mega', lungime: 13.62, latime: 2.48, inaltime: 3.0, sarcina: 24000, tara: 7200, axe: 3, pivotAxe: 7.8, limitaAxe: 24000 },
    { id: 'frigo', et: 'Frigo', lungime: 13.3, latime: 2.46, inaltime: 2.6, sarcina: 22000, tara: 9000, axe: 3, pivotAxe: 7.7, limitaAxe: 24000 },
    { id: 'box', et: 'Box (pereți rigizi)', lungime: 13.6, latime: 2.48, inaltime: 2.65, sarcina: 23500, tara: 7500, axe: 3, pivotAxe: 7.8, limitaAxe: 24000 },
    { id: 'platforma', et: 'Platformă', lungime: 13.6, latime: 2.48, inaltime: 2.7, sarcina: 25000, tara: 6000, axe: 3, pivotAxe: 7.8, limitaAxe: 24000 }
  ],
  remorca: [
    { id: 'prelata', et: 'Prelată 7,7 m', lungime: 7.7, latime: 2.48, inaltime: 2.7, sarcina: 11000, tara: 5000, axe: 2, ampatament: 4.6, axaFata: 1.6, limitaAxe: 18000 },
    { id: 'box', et: 'Box 7,2 m', lungime: 7.2, latime: 2.48, inaltime: 2.6, sarcina: 10500, tara: 5500, axe: 2, ampatament: 4.4, axaFata: 1.5, limitaAxe: 18000 },
    { id: 'frigo', et: 'Frigo 7,2 m', lungime: 7.2, latime: 2.46, inaltime: 2.5, sarcina: 9500, tara: 6500, axe: 2, ampatament: 4.4, axaFata: 1.5, limitaAxe: 18000 }
  ]
};

// Câți paleți încap la un rând (fără să-i punem unul peste altul).
// EUR 120 × 80: la 2,40 m lățime intră 3 pe lat (latura de 80 de-a curmezișul) → 33 într-o prelată de 13,6 m.
// Industrial 120 × 100: la 2,40 m intră 2 cu latura de 120 de-a curmezișul, câte unul la fiecare metru → 26.
function paletiEur(L, W) {
  L = Number(L) || 0; W = Number(W) || 0;
  const pePat = W >= 2.4 ? 3 : (W >= 1.6 ? 2 : (W >= 0.8 ? 1 : 0));
  return Math.floor(L / 1.2 + 1e-9) * pePat;
}
function paletiInd(L, W) {
  L = Number(L) || 0; W = Number(W) || 0;
  if (W >= 2.4) return Math.floor(L / 1.0 + 1e-9) * 2;
  if (W >= 2.0) return Math.floor(L / 1.2 + 1e-9) * 2;
  if (W >= 1.0) return Math.floor(L / 1.2 + 1e-9);
  return 0;
}

// Numerele scrise de om: „13,6" sau „13.6", „24.000" (cu punct de mii) sau „24000". Gol → null.
function _nr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  // „24.000" = 24000 (mii); „13.6" = 13,6 (zecimale). Un punct urmat de exact trei cifre, fără virgulă = mii.
  const t = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
// Câmp cu limite: { k, min, max, intreg }. Întoarce valoarea curată sau o eroare pe față.
function _camp(b, k, et, min, max, intreg, err) {
  const n = _nr(b[k]);
  if (n === null) return null;
  if (Number.isNaN(n) || n < min || n > max) { err.push(et + ': între ' + min + ' și ' + max); return null; }
  return intreg ? Math.round(n) : Math.round(n * 100) / 100;
}

// O semiremorcă / remorcă din formular → rândul de scris, sau { eroare }.
function curataRemorca(b) {
  b = b || {};
  const err = [];
  const fel = FEL_REMORCA.some((f) => f.id === b.fel) ? b.fel : null;
  if (!fel) return { eroare: 'Alege: semiremorcă sau remorcă cu proțap.' };
  const tip = (TIPURI_REMORCA[fel] || []).some((t) => t.id === b.tip) ? b.tip : null;
  const plate = String(b.plate || '').trim().toUpperCase().slice(0, 20);
  if (!plate) return { eroare: 'Scrie numărul de înmatriculare.' };
  const r = {
    fel, tip, plate, model: String(b.model || '').trim().slice(0, 80) || null,
    lungime_m: _camp(b, 'lungime_m', 'Lungimea', 1, 20, false, err),
    latime_m: _camp(b, 'latime_m', 'Lățimea', 1, 3.2, false, err),
    inaltime_m: _camp(b, 'inaltime_m', 'Înălțimea', 0.5, 4.5, false, err),
    sarcina_kg: _camp(b, 'sarcina_kg', 'Sarcina utilă', 100, 45000, true, err),
    tara_kg: _camp(b, 'tara_kg', 'Tara', 100, 20000, true, err),
    nr_axe: _camp(b, 'nr_axe', 'Numărul de axe', 1, 5, true, err),
    pivot_axe_m: _camp(b, 'pivot_axe_m', fel === 'remorca' ? 'Ampatamentul' : 'Distanța de la pivot la axe', 0.5, 15, false, err),
    axa_fata_m: fel === 'remorca' ? _camp(b, 'axa_fata_m', 'Distanța până la axa față', 0, 5, false, err) : null,
    limita_axe_kg: _camp(b, 'limita_axe_kg', 'Limita pe axe', 1000, 40000, true, err),
    imei: /^\d{6,20}$/.test(String(b.imei || '').trim()) ? String(b.imei).trim() : null,
    note: String(b.note || '').trim().slice(0, 500) || null
  };
  if (err.length) return { eroare: err.join(' · ') };
  if (r.lungime_m == null || r.latime_m == null || r.inaltime_m == null) return { eroare: 'Scrie lungimea, lățimea și înălțimea interioare.' };
  return { rand: r };
}

// Câmpurile „Încărcare" din fișa vehiculului (coloanele inc_* din devices). Ce nu vine, nu se atinge.
const CAMPURI_CAROSERIE = ['inc_fel', 'inc_lungime', 'inc_latime', 'inc_inaltime', 'inc_ampatament', 'inc_axa_caroserie', 'inc_sa_axa', 'inc_tara_fata', 'inc_tara_spate', 'inc_remorca_id'];
function curataCaroserie(b) {
  b = b || {};
  const err = [], out = {};
  if (b.inc_fel !== undefined) {
    const f = b.inc_fel === '' || b.inc_fel == null ? null : String(b.inc_fel);
    if (f !== null && !FELURI_VEHICUL.some((x) => x.id === f)) err.push('Felul vehiculului nu e în listă');
    else out.inc_fel = f;
  }
  const lim = { inc_lungime: ['Lungimea', 1, 20], inc_latime: ['Lățimea', 1, 3.2], inc_inaltime: ['Înălțimea', 0.5, 4.5],
    inc_ampatament: ['Ampatamentul', 1, 9], inc_axa_caroserie: ['Distanța de la axa față la caroserie', -2, 6], inc_sa_axa: ['Șaua față de axa motoare', -1, 2] };
  Object.keys(lim).forEach((k) => { if (b[k] !== undefined) out[k] = _camp(b, k, lim[k][0], lim[k][1], lim[k][2], false, err); });
  ['inc_tara_fata', 'inc_tara_spate'].forEach((k) => { if (b[k] !== undefined) out[k] = _camp(b, k, k === 'inc_tara_fata' ? 'Tara pe axa față' : 'Tara pe axa din spate', 100, 20000, true, err); });
  if (b.inc_remorca_id !== undefined) { const n = parseInt(b.inc_remorca_id, 10); out.inc_remorca_id = Number.isFinite(n) && n > 0 ? n : null; }
  if (err.length) return { eroare: err.join(' · ') };
  return { campuri: out };
}

// ═══════════════════════════ Simulatorul (pasul 3, 12.10: „cu 3D și greutatea pe osii") ═══════════════════════════
// Estimări obișnuite, folosite doar când fișa nu spune altceva (machetă aprobată de Robert, 12.10):
const PIVOT_DE_LA_FATA = 1.2;   // m: pivotul semiremorcii, de la peretele din față al spațiului de încărcare
const PARTE_TARA_PIVOT = 0.36;  // cât din tara semiremorcii stă pe pivot (restul, pe axele ei)
const PAS_AXE_SEMI = 1.31;      // m între axele semiremorcii (doar pentru desen)
const DISTANTA_REMORCA = 1.0;   // m între caroseria camionului și cea a remorcii (desenul și locul axelor remorcii)
const MASA_TREN = 40000;        // kg: camion + remorcă, când fișa nu spune altceva
const AXA_FATA_MIN = 0.20;      // axa din față să ducă cel puțin 20% din masa totală, altfel direcția se simte ușoară
const PRAG_ATENTIE = 92;        // % de la care o bară se face galbenă
const STRAT_MAX = 2;            // cel mult două colete unul peste altul
const MAX_OPRIRI = 5, MAX_RANDURI_MARFA = 40, MAX_BUC = 500;
const CULORI_OPRIRI = ['#3B82F6', '#F59E0B', '#A78BFA', '#EC4899', '#14B8A6'];
const PRESETURI_MARFA = [
  { id: 'eur', nume: 'Paleți EUR', lungime: 120, latime: 80, inaltime: 120, kg: 400, buc: 4, suprapus: false },
  { id: 'ind', nume: 'Paleți industriali', lungime: 120, latime: 100, inaltime: 120, kg: 500, buc: 2, suprapus: false },
  { id: 'colet', nume: 'Colete', lungime: 80, latime: 60, inaltime: 60, kg: 45, buc: 10, suprapus: true }
];
const MODURI = [
  { id: 'opriri', et: 'După opriri', sub: 'ultima oprire lângă peretele din față' },
  { id: 'echilibrat', et: 'Greutate echilibrată', sub: 'marfa ușoară în față, cea grea spre axe' }
];

const nf0 = (n) => Math.round(n).toLocaleString('ro-RO');
const nf1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = (n) => Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const de = (n) => { const r = Math.abs(Math.round(n)) % 100; return (n !== 0 && (r === 0 || r >= 20)) ? ' de ' : ' '; };
const _pozitiv = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const _numar = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const _ton = (pct) => (pct == null ? 'gri' : (pct > 100 ? 'rosu' : (pct > PRAG_ATENTIE ? 'galben' : 'verde')));

// Lista de marfă din formular → rândurile curate, sau { eroare } pe față.
function curataMarfa(lista) {
  if (!Array.isArray(lista)) return { eroare: 'Lista de marfă lipsește.' };
  if (lista.length > MAX_RANDURI_MARFA) return { eroare: 'Cel mult ' + MAX_RANDURI_MARFA + de(MAX_RANDURI_MARFA) + 'rânduri de marfă.' };
  const out = [], err = [];
  lista.forEach((b, i) => {
    b = b || {};
    const e = [];
    const nume = String(b.nume || '').trim().slice(0, 60) || ('Marfa ' + (i + 1));
    const r = {
      nume,
      lungime: _camp(b, 'lungime', 'lungimea', 1, 1500, true, e),
      latime: _camp(b, 'latime', 'lățimea', 1, 1500, true, e),
      inaltime: _camp(b, 'inaltime', 'înălțimea', 1, 1500, true, e),
      kg: _camp(b, 'kg', 'greutatea', 0, 40000, false, e),
      buc: _camp(b, 'buc', 'bucățile', 1, MAX_BUC, true, e),
      oprire: _camp(b, 'oprire', 'oprirea', 1, MAX_OPRIRI, true, e) || 1,
      suprapus: b.suprapus === true || b.suprapus === 'true'
    };
    if (!e.length && (r.lungime == null || r.latime == null || r.inaltime == null)) e.push('dimensiunile (cm)');
    if (!e.length && r.buc == null) r.buc = 1;
    if (!e.length && r.kg == null) r.kg = 0;
    if (e.length) err.push('Rândul ' + (i + 1) + ' (' + nume + '): ' + e.join(', '));
    else out.push(r);
  });
  if (err.length) return { eroare: err.join(' · ') };
  return { marfa: out };
}
function curataOpriri(lista) {
  const l = Array.isArray(lista) ? lista.slice(0, MAX_OPRIRI) : [];
  const out = l.map((x, i) => String(x == null ? '' : x).trim().slice(0, 40) || ('Oprirea ' + (i + 1)));
  return out.length ? out : ['Oprirea 1'];
}

// Felul unui vehicul fără fila „Încărcare" completată, după tipul din fișă (prima simulare merge și așa).
function felDinTip(t) {
  const s = String(t || '');
  if (/^(Autotractor|TIR|autotractor|tir)$/.test(s)) return 'autotractor';
  if (/^(Duba|Dubă|van)$/.test(s)) return 'duba35';
  if (/^(Camion|truck)$/.test(s)) return 'camion12';
  return null;
}
function _axeDinFisa(dev) {
  let a = dev && dev.max_axle_loads;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = null; } }
  return a && typeof a === 'object' ? a : {};
}
// Vehiculul din fișă → ce trebuie simulatorului. `presupuse` = cifre luate din cele obișnuite ale felului; `lipsa` = cifre
// fără de care nu se poate desena (doar la „Altul"). null = vehiculul nu cară marfă.
function vehiculDin(dev) {
  dev = dev || {};
  const fel = FELURI_VEHICUL.some((f) => f.id === dev.inc_fel) ? dev.inc_fel : felDinTip(dev.vehicle_type);
  if (!fel) return null;
  const f = FELURI_VEHICUL.find((x) => x.id === fel);
  const presupuse = [], lipsa = [];
  const ia = (v, implicit, et, esential) => {
    if (v != null) return v;
    if (implicit != null) { presupuse.push(et); return implicit; }
    if (esential) lipsa.push(et);
    return null;
  };
  const ax = _axeDinFisa(dev);
  const spate = [2, 3, 4, 5].map((k) => _pozitiv(ax['axle' + k])).filter(Boolean).reduce((a, b) => a + b, 0) || null;
  const v = {
    imei: dev.imei, plate: dev.plate || dev.name || dev.imei, fel, felEt: f.et, presupuse, lipsa,
    tare: [ia(_pozitiv(dev.inc_tara_fata), f.taraFata, 'tara pe axa față'), ia(_pozitiv(dev.inc_tara_spate), f.taraSpate, 'tara pe axa din spate')],
    wb: ia(_pozitiv(dev.inc_ampatament), f.ampatament, 'ampatamentul', true),
    lim: [ia(_pozitiv(ax.axle1), f.limFata, 'limita axei față'), ia(spate, f.limSpate, 'limita axelor din spate')],
    total: ia(_pozitiv(dev.max_weight_legal), f.masaMax, 'masa maximă')
  };
  if (fel === 'autotractor') {
    v.tip = 'trac';
    v.sa = ia(_numar(dev.inc_sa_axa), f.sa, 'șaua față de axa motoare', true);
  } else {
    v.tip = 'rigid';
    v.L = ia(_pozitiv(dev.inc_lungime), f.lungime, 'lungimea caroseriei', true);
    v.W = ia(_pozitiv(dev.inc_latime), f.latime, 'lățimea caroseriei', true);
    v.H = ia(_pozitiv(dev.inc_inaltime), f.inaltime, 'înălțimea caroseriei', true);
    v.pay = ia(_pozitiv(dev.payload), f.sarcina, 'sarcina utilă');
    v.b0 = ia(_numar(dev.inc_axa_caroserie), f.axaCaroserie, 'distanța de la axa față la caroserie', true);
    v.carlig = fel !== 'duba35';   // dubele nu trag remorcă cu proțap
  }
  if (v.tare[0] == null) v.tare[0] = 0;
  if (v.tare[1] == null) v.tare[1] = 0;
  return v;
}
function _tipRemorca(fel, id) { const l = TIPURI_REMORCA[fel] || []; return l.find((t) => t.id === id) || l[0]; }
function semiDin(r) {
  const tip = _tipRemorca('semiremorca', r.tip), presupuse = [];
  const ia = (v, implicit, et) => { if (v != null) return v; presupuse.push(et); return implicit; };
  const tara = ia(_pozitiv(r.tara_kg), tip.tara, 'tara semiremorcii');
  const pivotAxe = ia(_pozitiv(r.pivot_axe_m), tip.pivotAxe, 'distanța de la pivot la axe');
  return {
    id: r.id, plate: r.plate, fel: 'semiremorca', tipEt: tip.et, L: Number(r.lungime_m), W: Number(r.latime_m), H: Number(r.inaltime_m),
    pay: ia(_pozitiv(r.sarcina_kg), tip.sarcina, 'sarcina utilă a semiremorcii'), xk: PIVOT_DE_LA_FATA, xa: PIVOT_DE_LA_FATA + pivotAxe,
    tare: [tara * PARTE_TARA_PIVOT, tara * (1 - PARTE_TARA_PIVOT)], lim: ia(_pozitiv(r.limita_axe_kg), tip.limitaAxe, 'limita pe axele semiremorcii'),
    nrAxe: _pozitiv(r.nr_axe) || tip.axe, presupuse
  };
}
function remorcaDin(r) {
  const tip = _tipRemorca('remorca', r.tip), presupuse = [];
  const ia = (v, implicit, et) => { if (v != null) return v; presupuse.push(et); return implicit; };
  const tara = ia(_pozitiv(r.tara_kg), tip.tara, 'tara remorcii');
  const lim = ia(_pozitiv(r.limita_axe_kg), tip.limitaAxe, 'limita pe axele remorcii');
  return {
    id: r.id, plate: r.plate, fel: 'remorca', tipEt: tip.et, L: Number(r.lungime_m), W: Number(r.latime_m), H: Number(r.inaltime_m),
    pay: ia(_pozitiv(r.sarcina_kg), tip.sarcina, 'sarcina utilă a remorcii'),
    xf: ia(_numar(r.axa_fata_m), tip.axaFata, 'locul axei față a remorcii'), wb: ia(_pozitiv(r.pivot_axe_m), tip.ampatament, 'ampatamentul remorcii'),
    tare: [tara / 2, tara / 2], lim: [lim / 2, lim / 2], presupuse
  };
}

// Cum stă o bucată de marfă într-un spațiu: pe lat încap `n`, de-a lungul ocupă `along`, câte `straturi` unul peste altul.
function _orient(it, B) {
  const Wcm = Math.round(B.W * 100), Hcm = Math.round(B.H * 100);
  let best = null;
  [[it.lungime, it.latime], [it.latime, it.lungime]].forEach((o) => {
    const n = Math.floor(Wcm / o[1]);
    if (n < 1) return;
    const d = n / o[0];
    if (!best || d > best.d + 1e-9) best = { along: o[0], across: o[1], n, d };
  });
  const straturi = it.inaltime > Hcm ? 0 : (it.suprapus ? Math.max(1, Math.min(STRAT_MAX, Math.floor(Hcm / it.inaltime))) : 1);
  if (!best || !straturi) return null;
  best.straturi = straturi;
  return best;
}
// Așază marfa în rânduri, de la peretele din față spre uși, în corpurile date (camionul, apoi remorca). „După opriri":
// ultima oprire lângă perete (se descarcă ultima); „echilibrat": marfa ușoară pe metru în față. Un rând merge în primul corp
// în care încape; în fiecare corp rândurile doar se adaugă spre uși, deci ordinea de descărcare se păstrează.
function aranjeaza(corpuri, marfa, mod) {
  const C = corpuri.map((B) => ({ Lcm: Math.round(B.L * 100), kg: 0, mx: 0, folosit: 0 }));
  const xs = corpuri.map(() => 0);
  const gs = marfa.map((it, i) => { const o = _orient(it, corpuri[0]); return { it, i, wpm: o ? it.kg * o.straturi * o.n / o.along : 0 }; });
  if (mod === 'echilibrat') gs.sort((p, q) => (p.wpm - q.wpm) || (p.i - q.i));
  else gs.sort((p, q) => (q.it.oprire - p.it.oprire) || (p.i - q.i));
  const cutii = [], ramase = marfa.map(() => 0), ordine = [], ordineMarfa = [];
  let incarcate = 0, total = 0, kg = 0, vol = 0, mxw = 0;
  gs.forEach((g) => {
    const it = g.it;
    let rest = it.buc, pus = false;
    total += it.buc;
    while (rest > 0) {
      let k = -1, o = null;
      for (let j = 0; j < corpuri.length; j++) {
        const oj = _orient(it, corpuri[j]);
        if (oj && xs[j] + oj.along <= C[j].Lcm) { k = j; o = oj; break; }
      }
      if (k < 0) { ramase[g.i] += rest; break; }
      const take = Math.min(o.n * o.straturi, rest), col = Math.ceil(take / o.straturi);
      const yoff = (Math.round(corpuri[k].W * 100) - o.n * o.across) / 2, x = xs[k];
      let r = take;
      for (let c = 0; c < col; c++) {
        const aici = Math.min(o.straturi, r);
        for (let l = 0; l < aici; l++) {
          cutii.push({ c: k, i: g.i, oprire: it.oprire, x0: x, x1: x + o.along, y0: yoff + c * o.across, y1: yoff + (c + 1) * o.across, z0: l * it.inaltime, z1: (l + 1) * it.inaltime });
          C[k].kg += it.kg; C[k].mx += it.kg * (x + o.along / 2);
          mxw += it.kg * (corpuri[k].x0 * 100 + x + o.along / 2);
          kg += it.kg; vol += it.lungime * it.latime * it.inaltime / 1e6; incarcate++;
        }
        r -= aici;
      }
      rest -= take; xs[k] += o.along; C[k].folosit = Math.max(C[k].folosit, xs[k]); pus = true;
    }
    if (pus && ordine[ordine.length - 1] !== it.oprire) ordine.push(it.oprire);
    if (pus) ordineMarfa.push(g.i);
  });
  return { cutii, ramase, corpuri: C, incarcate, total, kg, vol, xcw: kg ? mxw / kg / 100 : 0, ordine, ordineMarfa };
}

// Greutatea pe fiecare axă (kg), din momentele față de axe. Tara pe axe vine din fila „Încărcare", limitele din „Config Camion".
function osii(veh, semi, rem, C) {
  const list = [];
  let lim, extra = '';
  if (veh.tip === 'trac') {
    const B = C[0], W = B.kg, xc = W ? B.mx / W / 100 : 0;
    const axTr = W ? W * (xc - semi.xk) / (semi.xa - semi.xk) : 0, kp = W - axTr + semi.tare[0];
    list.push({ nume: 'Axa față', sub: 'autotractor', kg: veh.tare[0] + kp * veh.sa / veh.wb, lim: veh.lim[0], dir: 'spre spate' });
    list.push({ nume: 'Axa motoare', sub: 'autotractor', kg: veh.tare[1] + kp * (veh.wb - veh.sa) / veh.wb, lim: veh.lim[1], dir: 'spre spate' });
    list.push({ nume: 'Axele semiremorcii', sub: semi.nrAxe + ' axe', kg: axTr + semi.tare[1], lim: semi.lim, dir: 'spre față' });
    lim = veh.total;
  } else {
    const B0 = C[0], W0 = B0.kg, spate0 = (veh.b0 * W0 + B0.mx / 100) / veh.wb;
    list.push({ nume: 'Axa față', sub: 'camion', kg: (W0 - spate0) + veh.tare[0], lim: veh.lim[0], dir: 'spre spate' });
    list.push({ nume: 'Axa spate', sub: 'camion', kg: spate0 + veh.tare[1], lim: veh.lim[1], dir: 'spre față' });
    lim = veh.total;
    if (rem && C[1]) {
      const B1 = C[1], W1 = B1.kg, xc1 = W1 ? B1.mx / W1 / 100 : 0, r1 = W1 ? W1 * (xc1 - rem.xf) / rem.wb : 0;
      list.push({ nume: 'Axa față', sub: 'remorcă', kg: (W1 - r1) + rem.tare[0], lim: rem.lim[0], dir: 'spre spate' });
      list.push({ nume: 'Axa spate', sub: 'remorcă', kg: r1 + rem.tare[1], lim: rem.lim[1], dir: 'spre față' });
      lim = MASA_TREN;
      if (veh.total != null && list[0].kg + list[1].kg > veh.total) extra = 'Camionul singur trece de ' + nf1(veh.total / 1000) + ' t — mută o parte din marfă în remorcă.';
    }
  }
  let tot = 0;
  list.forEach((a) => { tot += a.kg; });
  return { list, tot, lim, extra };
}

// Simularea întreagă: corpurile, marfa așezată, osiile, cifrele și TEXTELE (ecranul și PDF-ul doar le arată).
// o = { vehicul (vehiculDin), semi (semiDin), remorca (remorcaDin), marfa (curataMarfa), mod, opriri (curataOpriri) }
function simuleaza(o) {
  const veh = o.vehicul, trac = veh.tip === 'trac', mod = MODURI.some((m) => m.id === o.mod) ? o.mod : 'opriri';
  const opriri = curataOpriri(o.opriri), marfa = o.marfa || [];
  if (veh.lipsa && veh.lipsa.length) return { eroare: 'Completează în fișa vehiculului (fila „Încărcare”): ' + veh.lipsa.join(', ') + '.' };
  if (trac && !o.semi) return { eroare: 'Alege semiremorca.' };
  const semi = trac ? o.semi : null, rem = !trac && veh.carlig ? (o.remorca || null) : null;
  const corpuri = trac ? [{ L: semi.L, W: semi.W, H: semi.H, pay: semi.pay, x0: 0 }] : [{ L: veh.L, W: veh.W, H: veh.H, pay: veh.pay, x0: 0 }];
  if (rem) corpuri.push({ L: rem.L, W: rem.W, H: rem.H, pay: rem.pay, x0: veh.L + DISTANTA_REMORCA });
  const P = aranjeaza(corpuri, marfa, mod);
  const AX = osii(veh, semi, rem, P.corpuri);

  // Unde stau axele (m de la peretele din față al primului spațiu de încărcare) — pentru desen.
  const axe = [];
  if (trac) {
    const motoare = semi.xk + veh.sa;
    axe.push({ x: motoare - veh.wb, sub: 'autotractor' }, { x: motoare, sub: 'autotractor' });
    for (let i = 0; i < semi.nrAxe; i++) axe.push({ x: semi.xa + (i - (semi.nrAxe - 1) / 2) * PAS_AXE_SEMI, sub: 'semiremorcă' });
  } else {
    axe.push({ x: -veh.b0, sub: 'camion' }, { x: -veh.b0 + veh.wb, sub: 'camion' });
    if (rem) axe.push({ x: corpuri[1].x0 + rem.xf, sub: 'remorcă' }, { x: corpuri[1].x0 + rem.xf + rem.wb, sub: 'remorcă' });
  }

  // Cifrele de sus.
  let Ltot = 0, folosit = 0, volTot = 0, payTot = 0, payStiut = true;
  corpuri.forEach((B, i) => {
    Ltot += B.L; folosit += P.corpuri[i].folosit / 100; volTot += B.L * B.W * B.H;
    if (B.pay == null) payStiut = false; else payTot += B.pay;
  });
  const pL = Ltot ? folosit / Ltot * 100 : 0, pW = payStiut && payTot ? P.kg / payTot * 100 : null, pV = volTot ? P.vol / volTot * 100 : 0;
  const nuIncap = P.ramase.reduce((a, b) => a + b, 0);
  const indicatori = [
    { et: 'Metri de podea (LDM)', val: nf1(folosit) + ' m', tot: 'din ' + nf1(Ltot) + ' m', pct: pL, ton: _ton(pL) },
    { et: 'Greutate', val: nf0(P.kg) + ' kg', tot: payStiut ? 'din ' + nf0(payTot) + ' kg sarcină utilă' : 'sarcina utilă nu e în fișă', pct: pW, ton: _ton(pW) },
    { et: 'Volum', val: nf1(P.vol) + ' m³', tot: 'din ' + nf1(volTot) + ' m³', pct: pV, ton: _ton(pV) },
    { et: 'Colete încărcate', val: P.incarcate + ' din ' + P.total, tot: nuIncap ? 'nu încap ' + nuIncap : 'încap toate', pct: P.total ? P.incarcate / P.total * 100 : 0, ton: nuIncap ? 'rosu' : 'verde' }
  ];

  // Osiile, cu textele lor.
  const osiiTxt = AX.list.map((a) => {
    const pct = a.lim ? a.kg / a.lim * 100 : null;
    return { nume: a.nume, sub: a.sub, kg: Math.round(a.kg), lim: a.lim, pct, ton: _ton(pct),
      text: nf1(a.kg / 1000) + ' t' + (a.lim ? ' din ' + nf1(a.lim / 1000) + ' t' : ' (fără limită în fișă)') };
  });
  const pT = AX.lim ? AX.tot / AX.lim * 100 : null;
  const masa = { kg: Math.round(AX.tot), lim: AX.lim, pct: pT, ton: _ton(pT), text: nf1(AX.tot / 1000) + ' t' + (AX.lim ? ' din ' + nf1(AX.lim / 1000) + ' t' : '') };

  // Ce e de corectat, cel mai grav întâi.
  const mesaje = [];
  if (nuIncap) {
    const care = P.ramase.map((n, i) => (n ? n + ' × ' + marfa[i].nume : null)).filter(Boolean).join(', ');
    mesaje.push({ fel: 'rosu', text: 'Nu încap ' + nuIncap + de(nuIncap) + (nuIncap === 1 ? 'colet' : 'colete') + ' (' + care + '). Alege un vehicul mai mare' +
      (!trac && !rem && veh.carlig ? ', adaugă o remorcă' : '') + ' sau împarte marfa pe două curse.' });
  }
  corpuri.forEach((B, i) => {
    if (B.pay != null && P.corpuri[i].kg > B.pay) {
      mesaje.push({ fel: 'rosu', text: (i ? 'Remorca' : (trac ? 'Semiremorca' : 'Caroseria')) + ' duce ' + nf0(P.corpuri[i].kg) + ' kg de marfă — cu ' + nf0(P.corpuri[i].kg - B.pay) + ' kg peste sarcina utilă.' });
    }
  });
  AX.list.forEach((a) => {
    if (a.lim && a.kg > a.lim) mesaje.push({ fel: 'rosu', text: a.nume + ' (' + a.sub + ') trece cu ' + nf1((a.kg - a.lim) / 1000) + ' t peste limită — mută marfa grea ' + a.dir + '.' });
  });
  if (AX.extra) mesaje.push({ fel: 'rosu', text: AX.extra });
  if (AX.lim && AX.tot > AX.lim) mesaje.push({ fel: 'rosu', text: 'Masa totală trece de ' + nf1(AX.lim / 1000) + ' t.' });
  const fata = AX.list[0];
  if (P.kg > 0 && AX.tot > 0 && fata.kg / AX.tot < AXA_FATA_MIN) {
    mesaje.push({ fel: 'galben', text: 'Axa față duce doar ' + Math.round(fata.kg / AX.tot * 100) + '% din masa totală (de obicei cel puțin ' + Math.round(AXA_FATA_MIN * 100) + '%) — direcția se simte ușoară; mută marfa grea spre față.' });
  }
  const presupuse = [].concat(veh.presupuse || [], semi ? semi.presupuse : [], rem ? rem.presupuse : []);
  if (presupuse.length) {
    mesaje.push({ fel: 'galben', text: 'Cifre obișnuite, nu ale mașinii: ' + presupuse.join(', ') + '. Le scrii o dată în fișă (fila „Încărcare” și „Config Camion”) sau la semiremorcă.' });
  }
  const rosii = mesaje.filter((m) => m.fel === 'rosu').length;
  if (!rosii && marfa.length) mesaje.push({ fel: 'verde', text: 'Greutatea pe osii e în limite.' });
  const stare = !marfa.length ? { fel: 'gri', text: 'Adaugă marfa' } : (rosii ? { fel: 'galben', text: 'De corectat: ' + rosii } : { fel: 'verde', text: 'Gata de încărcat' });

  // Pentru șofer (pasul 4): ordinea de încărcare pas cu pas, rezumatul osiilor și al spațiului — tot texte gata scrise.
  const numeOp = (n) => opriri[n - 1] || ('Oprirea ' + n);
  const pasi = P.ordineMarfa.map((i, k, arr) => {
    const it = marfa[i], inc = it.buc - P.ramase[i], ale = P.cutii.filter((c) => c.i === i);
    const det = [], unu = inc === 1;   // „primul, lipit" la o singură bucată, „primii, lipiți" la mai multe
    if (k === 0) det.push(arr.length > 1 ? (unu ? 'Primul, lipit de peretele din față.' : 'Primii, lipiți de peretele din față.') : (unu ? 'Lipit de peretele din față.' : 'Lipiți de peretele din față.'));
    else if (k === arr.length - 1) det.push(unu ? 'Ultimul, spre uși: se descarcă primul.' : 'Ultimii, spre uși: se descarcă primii.');
    if (rem && ale.length) det.push(ale.every((c) => c.c === 1) ? 'În remorcă.' : (ale.some((c) => c.c === 1) ? 'În camion și în remorcă.' : 'În camion.'));
    if (ale.some((c) => c.z0 > 0)) det.push('Câte ' + STRAT_MAX + ', unul peste altul.');
    det.push(nf0(it.kg) + ' kg bucata.');
    if (P.ramase[i]) det.push('Nu încap ' + P.ramase[i] + '.');
    return { nr: k + 1, oprire: it.oprire, culoare: CULORI_OPRIRI[(it.oprire - 1) % CULORI_OPRIRI.length], text: numeOp(it.oprire) + ' — ' + inc + ' × ' + it.nume, detaliu: det.join(' ') };
  });
  const rosiiOsii = AX.list.some((a) => a.lim && a.kg > a.lim) || !!AX.extra || (AX.lim && AX.tot > AX.lim);
  const osiiRezumat = {
    fel: !marfa.length ? 'gri' : (rosiiOsii ? 'rosu' : 'verde'),
    titlu: 'Greutatea pe osii: ' + (rosiiOsii ? 'de corectat' : 'în regulă'),
    text: osiiTxt.map((a, i) => (i ? a.nume.charAt(0).toLowerCase() + a.nume.slice(1) : a.nume) + ' ' + a.text).join(' · ') + ' · total ' + masa.text
  };
  // Ce nu încape deloc nu apare în pași: șoferul trebuie să afle totuși ce rămâne la rampă.
  const ramase = P.ramase.map((n, i) => (n ? n + ' × ' + marfa[i].nume : null)).filter(Boolean).join(', ');
  const rezumatSofer = { greutate: nf0(P.kg) + ' kg · ' + P.incarcate + de(P.incarcate) + (P.incarcate === 1 ? 'colet' : 'colete'), liber: 'liber ' + nf1(Math.max(0, Ltot - folosit)) + ' m', lungime: nf1(Ltot) + ' m',
    ramane: ramase ? 'Rămân la rampă (nu încap): ' + ramase + '.' : '' };
  const folositeOpriri = {};
  marfa.forEach((it) => { folositeOpriri[it.oprire] = true; });
  const legenda = opriri.map((nume, i) => ({ nr: i + 1, nume, culoare: CULORI_OPRIRI[i % CULORI_OPRIRI.length] })).filter((x) => folositeOpriri[x.nr]);
  const numeOprire = (n) => opriri[n - 1] || ('Oprirea ' + n);
  return {
    trac, cuRemorca: !!rem, mod, opriri,
    corpuri: corpuri.map((B, i) => ({ L: B.L, W: B.W, H: B.H, x0: B.x0, pay: B.pay, kg: Math.round(P.corpuri[i].kg), folosit: P.corpuri[i].folosit / 100 })),
    cutii: P.cutii, axe, xcw: P.xcw, kg: P.kg, incarcate: P.incarcate, total: P.total,
    marfa: marfa.map((it, i) => ({ nume: it.nume, oprire: it.oprire, buc: it.buc, incarcate: it.buc - P.ramase[i], suprapus: it.suprapus,
      dims: it.lungime + ' × ' + it.latime + ' × ' + it.inaltime + ' cm', kgText: nf0(it.kg) + ' kg bucata',
      oprireText: 'Oprirea ' + it.oprire + ' · ' + numeOprire(it.oprire),
      suprapusText: it.suprapus ? 'Se pot pune câte ' + STRAT_MAX + ' unul peste altul' : 'Nu se pun unul peste altul' })),
    indicatori, osii: osiiTxt, masa, mesaje, stare, legenda, pasi, osiiRezumat, rezumatSofer,
    titlu: trac ? 'Semiremorca · ' + semi.plate + ' (' + semi.tipEt + ')' : 'Caroseria · ' + veh.plate + (rem ? ' + remorca ' + rem.plate : ''),
    dimensiuni: corpuri.map((B, i) => (i ? 'remorca ' : 'interior ') + nf2(B.L) + ' × ' + nf2(B.W) + ' × ' + nf2(B.H) + ' m').join(' · '),
    ordineText: P.ordine.length ? 'Se încarcă în ordinea: ' + P.ordine.map(numeOprire).join(' → ') + ' (prima lângă peretele din față).' : '',
    xcwText: P.kg ? 'Centrul de greutate al mărfii: la ' + nf1(P.xcw) + ' m de peretele din față' : 'Nicio marfă încărcată',
    vehicul: { plate: veh.plate, fel: veh.fel, felEt: veh.felEt, tip: veh.tip }
  };
}

// ─── Planurile de încărcare (pasul 4, 12.10): starea unui plan, scrisă o dată, pentru web, telefon și anunțuri ───
// Ora se scrie pe ora României: „azi, 09:12", „ieri, 18:40", „10.10, 07:05".
function cand(ms, acum) {
  if (!ms) return '';
  const zi = (t) => new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
  const ora = new Date(Number(ms)).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
  const a = acum || Date.now();
  if (zi(ms) === zi(a)) return 'azi, ' + ora;
  if (zi(ms) === zi(a - 86400000)) return 'ieri, ' + ora;
  return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit' }) + ', ' + ora;
}
// Ce s-a întâmplat ultima dată cu planul: ciornă → trimis → încărcat (sau „Am o problemă").
function stareaPlanului(p, acum) {
  p = p || {};
  const cine = p.trimis_catre_nume || 'șofer';
  if (p.problema_la && (!p.incarcat_la || p.problema_la > p.incarcat_la)) return { fel: 'rosu', cheie: 'problema', text: 'Problemă de la ' + cine + ', ' + cand(p.problema_la, acum) + ': „' + (p.problema_text || '') + '”' };
  if (p.incarcat_la) return { fel: 'verde', cheie: 'incarcat', text: 'Încărcat — ' + cine + ', ' + cand(p.incarcat_la, acum) };
  if (p.trimis_la) return { fel: 'galben', cheie: 'trimis', text: 'Trimis lui ' + cine + ', ' + cand(p.trimis_la, acum) + ' — așteaptă „Am încărcat”' };
  return { fel: 'gri', cheie: 'ciorna', text: 'Netrimis' };
}
// Textul de pe ecranul șoferului, sub plan (machetă, 12.10).
function notaSofer(p, acum) {
  return 'Trimis de ' + (p.trimis_de_nume || 'dispecer') + ' ' + cand(p.trimis_la, acum) + '. Dacă se schimbă marfa la rampă, spune-i: reface planul și ți-l trimite din nou.';
}

// Ce trimite /api/incarcare/meta: tot ce trebuie ecranelor ca să propună cifrele obișnuite.
function meta() {
  return { feluriVehicul: FELURI_VEHICUL, felRemorca: FEL_REMORCA, tipuriRemorca: TIPURI_REMORCA, campuriCaroserie: CAMPURI_CAROSERIE,
    presetari: PRESETURI_MARFA, moduri: MODURI, culoriOpriri: CULORI_OPRIRI, maxOpriri: MAX_OPRIRI, maxRanduri: MAX_RANDURI_MARFA };
}

module.exports = { FELURI_VEHICUL, FEL_REMORCA, TIPURI_REMORCA, CAMPURI_CAROSERIE, paletiEur, paletiInd, curataRemorca, curataCaroserie, meta, _nr,
  PRESETURI_MARFA, MODURI, CULORI_OPRIRI, MAX_OPRIRI, MAX_RANDURI_MARFA, MAX_BUC, STRAT_MAX, PIVOT_DE_LA_FATA, PARTE_TARA_PIVOT, MASA_TREN, AXA_FATA_MIN, PRAG_ATENTIE,
  curataMarfa, curataOpriri, felDinTip, vehiculDin, semiDin, remorcaDin, aranjeaza, osii, simuleaza, cand, stareaPlanului, notaSofer };
