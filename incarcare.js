// incarcare.js — regulile simulatorului de încărcare (Robert, 12.10: „să poți alege din flota pe care o ai deja… și pentru
// camioane, de exemplu 3,5 t, 7 t"). CURAT: fără bază de date, fără rețea.
//
//   • FELURI_VEHICUL — felul vehiculului cu caroserie (fila „Încărcare" din fișa vehiculului): autotractor, dubă 3,5 t,
//     camion 7,5 / 12 / 18 t, altul. Cifrele sunt cele OBIȘNUITE: omul le schimbă după fișa tehnică a mașinii lui.
//   • TIPURI_REMORCA — semiremorcile (pe șaua autotractorului) și remorcile cu proțap (la camionul cu cârlig), deosebite
//     (Robert: „le diferențiem"), cu tipurile lor obișnuite.
//   • curataRemorca / curataCaroserie — ce se poate scrie (cifre cu sens, în metri și kilograme).
//   • paletiEur / paletiInd — câți paleți încap la un rând (EUR 120 × 80, industrial 120 × 100).
//
// Le citesc serverul (validarea, rutele) și ecranele, prin GET /api/incarcare/meta — pagina și telefonul NU scriu a doua
// oară cifrele obișnuite. Legat prin verify_flota_incarcare.js.
'use strict';

const FELURI_VEHICUL = [
  { id: 'autotractor', et: 'Autotractor', caroserie: false, ampatament: 3.7, sa: 0.55, taraFata: 5200, taraSpate: 2600 },
  { id: 'duba35', et: 'Dubă 3,5 t', caroserie: true, lungime: 4.3, latime: 1.78, inaltime: 1.94, sarcina: 1300, ampatament: 4.1, axaCaroserie: 1.0, taraFata: 1250, taraSpate: 950 },
  { id: 'camion75', et: 'Camion 7,5 t', caroserie: true, lungime: 6.2, latime: 2.45, inaltime: 2.4, sarcina: 3000, ampatament: 4.2, axaCaroserie: 0.9, taraFata: 2600, taraSpate: 1900 },
  { id: 'camion12', et: 'Camion 12 t', caroserie: true, lungime: 7.2, latime: 2.45, inaltime: 2.5, sarcina: 5950, ampatament: 4.8, axaCaroserie: 0.95, taraFata: 3600, taraSpate: 2450 },
  { id: 'camion18', et: 'Camion 18 t', caroserie: true, lungime: 8.5, latime: 2.48, inaltime: 2.6, sarcina: 9500, ampatament: 5.4, axaCaroserie: 1.05, taraFata: 4900, taraSpate: 3600 },
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

// Ce trimite /api/incarcare/meta: tot ce trebuie ecranelor ca să propună cifrele obișnuite.
function meta() {
  return { feluriVehicul: FELURI_VEHICUL, felRemorca: FEL_REMORCA, tipuriRemorca: TIPURI_REMORCA, campuriCaroserie: CAMPURI_CAROSERIE };
}

module.exports = { FELURI_VEHICUL, FEL_REMORCA, TIPURI_REMORCA, CAMPURI_CAROSERIE, paletiEur, paletiInd, curataRemorca, curataCaroserie, meta, _nr };
