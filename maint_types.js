// Tipurile de MENTENANȚĂ — o singură sursă pentru toată aplicația.
//
// De ce există fișierul ăsta: aceleași tipuri erau scrise de mână în DOUĂ locuri din index.html
// (ecranul Mentenanță avea 14, fila „Service" din editarea vehiculului avea 7, altfel ordonate),
// iar cinci dintre ele — ITP, RCA, Rovinietă, Casco, Tahograf — se repetau și în fila Documente.
// Același ITP putea fi scris în două locuri, iar agentul RA Care îl număra de două ori.
//
// GRANIȚA, hotărâtă 2026-08-20:
//   MENTENANȚĂ = ce se face la service. O lucrare mecanică: se consumă piese, se plătește manoperă,
//                se repetă la km sau la luni. Rezultatul e o mașină reparată.
//   DOCUMENTE  = ce se plătește și EXPIRĂ. Rezultatul e un act cu valabilitate: ITP, RCA, CASCO,
//                rovinietă, licență, verificarea tahografului.
// Testul care le separă: „la final rămân cu o hârtie care are dată de expirare?" → Documente.
//
// ITP e cazul care înșală: te duci fizic la o stație, ca la service. Dar ce cumperi acolo e
// certificatul, nu reparația — dacă mașina nu trece, plătești reparația SEPARAT, și AIA e mentenanță.

// Cele trei feluri de mașini pentru care intervalele diferă REAL. Un Logan și un Scania nu fac
// revizia la aceiași kilometri, iar dacă aplicația propune o singură cifră, propune greșit pentru
// jumătate din flotă. Mai fin de-atât (pe motorizare, pe marcă) n-are rost: clientul poate corecta.
// `art` = articolul, ca propoziția din propunere să sune românește: „La UN autoturism…",
// „La O utilitară…". Fără el ar fi trebuit ghicit din nume, și ar fi ieșit „La un utilitară".
// `low` = cum se scrie clasa în mijlocul unei propoziții. Nu e `label` cu litere mici: aia ar fi
// dat „La un camion / tir", cu TIR stricat, și „La o utilitară / dubă" — corect, dar greoi.
const CLASSES = [
  { key: 'car',   label: 'Autoturism',        art: 'un', low: 'autoturism' },
  { key: 'van',   label: 'Utilitară / dubă',  art: 'o',  low: 'utilitară' },
  { key: 'truck', label: 'Camion / TIR',      art: 'un', low: 'camion' },
];

// Categoria de pe hartă (markerCategory) → clasa de service. Tot ce e greu intră la „camion":
// autobuz, autotractor, utilaj, combină — se întrețin la intervale de camion, nu de autoturism.
const _CLS = {
  car: 'car', motorcycle: 'car', electric: 'car', phev: 'car', hybrid: 'car', cng: 'car',
  ambulance: 'car', boat: 'car',
  van: 'van',
};
function classOf(cat) { return _CLS[String(cat || '').trim()] || (cat ? 'truck' : 'car'); }
// Expus si in pagina (window.RA_MAINT.classMap): acolo categoria vine din markerCategory(),
// care intoarce mereu ceva, deci regula e simplu `classMap[cat] || 'truck'`.

// `every` = la cât se face, implicit, pe fiecare clasă: { km, months }. null = „la nevoie" —
// aplicația nu propune nimic, o pui manual când apare problema.
// Cifrele sunt un PUNCT DE PLECARE, discutat cu clientul: fiecare companie și le poate schimba
// din Mentenanță → Intervale (se salvează în settings.maint_intervals și bat valorile de aici).
const WORK = [
  { type: 'Schimb ulei + filtru',      icon: 'fa-oil-can',             fam: 'f-service',
    every: { car: { km: 15000, months: 12 }, van: { km: 20000, months: 12 }, truck: { km: 40000, months: 12 } } },
  { type: 'Revizie generală',          icon: 'fa-screwdriver-wrench',  fam: 'f-zone',
    every: { car: { km: 30000, months: 24 }, van: { km: 40000, months: 24 }, truck: { km: 80000, months: 12 } } },
  { type: 'Plăcuțe/discuri frână',     icon: 'fa-car-burst',           fam: 'f-danger',
    every: { car: { km: 40000 }, van: { km: 50000 }, truck: { km: 120000 } } },
  { type: 'Distribuție',               icon: 'fa-gears',               fam: 'f-load',
    every: { car: { km: 120000, months: 60 }, van: { km: 150000, months: 60 }, truck: null } },  // camioanele au lanț
  { type: 'Ambreiaj',                  icon: 'fa-circle-half-stroke',  fam: 'f-load',
    every: { car: { km: 150000 }, van: { km: 180000 }, truck: { km: 400000 } } },
  { type: 'Amortizoare',               icon: 'fa-compress',            fam: 'f-load',
    every: { car: { km: 80000 }, van: { km: 100000 }, truck: { km: 250000 } } },
  { type: 'Anvelope',                  icon: 'fa-circle-notch',        fam: 'f-neutral',
    every: { car: { km: 40000, months: 60 }, van: { km: 60000, months: 60 }, truck: { km: 150000, months: 60 } } },
  { type: 'Geometrie',                 icon: 'fa-ruler-combined',      fam: 'f-neutral',
    every: { car: { km: 30000, months: 24 }, van: { km: 40000 }, truck: { km: 100000 } } },
  { type: 'Filtre (aer/polen/comb.)',  icon: 'fa-filter',              fam: 'f-service',
    every: { car: { km: 15000, months: 12 }, van: { km: 20000, months: 12 }, truck: { km: 40000, months: 12 } } },
  { type: 'Baterie',                   icon: 'fa-car-battery',         fam: 'f-fuel',
    every: { car: { months: 48 }, van: { months: 48 }, truck: { months: 36 } } },
  { type: 'Antigel/lichide',           icon: 'fa-droplet',             fam: 'f-fuel',
    every: { car: { km: 60000, months: 36 }, van: { km: 60000, months: 36 }, truck: { km: 150000, months: 24 } } },
  { type: 'Curea accesorii',           icon: 'fa-rotate',              fam: 'f-load',
    every: { car: { km: 90000, months: 60 }, van: { km: 100000, months: 60 }, truck: { km: 200000 } } },
  { type: 'Sistem de răcire',          icon: 'fa-temperature-low',     fam: 'f-fuel',
    every: { car: { km: 60000, months: 48 }, van: { km: 60000, months: 48 }, truck: { km: 200000 } } },
  { type: 'Instalație electrică',      icon: 'fa-bolt',                fam: 'f-service',
    every: { car: null, van: null, truck: null } },
  { type: 'Caroserie / tinichigerie',  icon: 'fa-hammer',              fam: 'f-neutral',
    every: { car: null, van: null, truck: null } },
  { type: 'Spălare / curățenie',       icon: 'fa-spray-can-sparkles',  fam: 'f-zone',
    every: { car: { months: 1 }, van: { months: 1 }, truck: { months: 1 } } },
];

// Ce NU e mentenanță, ci act. E ȘI lista din care se umple alegerea de tip la Documente — în două
// locuri (fișa vehiculului + Management), care până acum o aveau scrisă de mână, separat.
// „Altul" se adaugă la final de interfață, nu stă aici: nu e un tip de act, e supapa pentru rest.
// Card tahograf NU e aici: e actul ȘOFERULUI, nu al mașinii.
const DOCS = ['ITP', 'RCA', 'CASCO', 'Rovinietă', 'Licență transport', 'Tahograf', 'Asigurare marfă'];

const DEFAULT_ICON = 'fa-wrench', DEFAULT_FAM = 'f-neutral';

// Comparare iertătoare: fără diacritice, fără majuscule, fără spații de prisos.
// „ROVINIETA", „rovinietă" și „Rovinieta " sunt același lucru.
function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // taie diacriticele desprinse de NFD
    .replace(/\s+/g, ' ');
}

const _byNorm = {};
WORK.forEach(w => { _byNorm[norm(w.type)] = w; });
const _docSet = new Set(DOCS.map(norm));
// Sinonime întâlnite în date vechi, scrise cu mâna prin „Altele…".
[['tahograf (verificare)', 'tahograf'], ['rovineta', 'rovinieta'], ['casco', 'casco'],
 ['asigurare rca', 'rca'], ['itp (inspectie tehnica)', 'itp']].forEach(([a]) => _docSet.add(norm(a)));

// E act, nu lucrare? Folosit ca să semnalăm intrările vechi și să oferim mutarea la Documente.
function isDocType(t) { return _docSet.has(norm(t)); }

// Numele scris ca la carte, pentru mutarea la Documente: „ROVINIETA" / „rovinieta" → „Rovinietă",
// „Tahograf (verificare)" → „Tahograf". Necunoscut = „Altul", ca să nu inventăm un tip nou.
const _canon = {};
DOCS.forEach(d => { _canon[norm(d)] = d; });
_canon[norm('Tahograf (verificare)')] = 'Tahograf';
_canon[norm('Asigurare RCA')] = 'RCA';
_canon[norm('ITP (inspectie tehnica)')] = 'ITP';
_canon[norm('rovineta')] = 'Rovinietă';
function canonDocType(t) { return _canon[norm(t)] || 'Altul'; }

// ─── Intervale: implicitul de mai sus + ce a schimbat compania ───
// Limitele nu sunt mofturi: fără ele, un „interval" de 9 miliarde de km ar face ca propunerea
// aplicației să iasă mereu absurdă, iar nimeni n-ar mai avea încredere în ea.
const KM_MIN = 100, KM_MAX = 2000000, MO_MIN = 1, MO_MAX = 240;

function _curata(v) {
  if (!v || typeof v !== 'object') return null;
  let km = parseInt(v.km) || 0, months = parseInt(v.months) || 0;
  if (km && (km < KM_MIN || km > KM_MAX)) km = 0;
  if (months && (months < MO_MIN || months > MO_MAX)) months = 0;
  if (!km && !months) return null;
  const out = {};
  if (km) out.km = km;
  if (months) out.months = months;
  return out;
}

// Cât de des se face lucrarea, pentru clasa asta de mașină. Ce a pus compania bate implicitul.
// `overrides` = { '<tip normalizat>': { car: {km,months}|null, van: …, truck: … } }
function intervalFor(type, cls, overrides) {
  const c = CLASSES.some(x => x.key === cls) ? cls : 'car';
  const k = norm(type);
  const ov = overrides && overrides[k];
  if (ov && Object.prototype.hasOwnProperty.call(ov, c)) return _curata(ov[c]);
  const w = _byNorm[k];
  return _curata(w && w.every ? w.every[c] : null);
}

// Ce vine de la client, curățat: doar lucrări și clase cunoscute, doar numere plauzibile.
// `null` explicit se păstrează — înseamnă „la lucrarea asta nu vreau propunere".
function sanitizeOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(raw)) {
    const k = norm(key);
    if (!_byNorm[k]) continue;                     // lucrare necunoscută → ignorată
    const src = raw[key]; if (!src || typeof src !== 'object') continue;
    const dst = {};
    for (const c of CLASSES) {
      if (!Object.prototype.hasOwnProperty.call(src, c.key)) continue;
      const v = src[c.key], curat = _curata(v);
      if (curat) { dst[c.key] = curat; continue; }
      // Nimic valid. Două cazuri DIFERITE, care nu trebuie confundate:
      //  - câmpuri goale → omul chiar vrea „la nevoie", fără propunere: păstrăm null;
      //  - o cifră imposibilă (99 km, 900 de luni) → e o greșeală de tastare. Dacă am păstra null,
      //    o scăpare de tastatură ar stinge tăcut propunerea. Ignorăm și rămâne implicitul.
      const aScrisOCifra = v && typeof v === 'object' && ((parseInt(v.km) > 0) || (parseInt(v.months) > 0));
      if (!aScrisOCifra) dst[c.key] = null;
    }
    if (Object.keys(dst).length) out[k] = dst;
  }
  return out;
}

// Iconița + familia de culoare a unui tip. Tipurile scrise liber („Altele…") primesc cheia neutră.
function meta(t) {
  const w = _byNorm[norm(t)];
  return w ? { icon: w.icon, fam: w.fam } : { icon: DEFAULT_ICON, fam: DEFAULT_FAM };
}

module.exports = {
  WORK, DOCS, CLASSES, CLASS_MAP: _CLS, isDocType, canonDocType, meta, norm, classOf,
  intervalFor, sanitizeOverrides, DEFAULT_ICON, DEFAULT_FAM
};
