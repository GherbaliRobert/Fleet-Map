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

// Familiile de culoare sunt aceleași ca la Alerte (f-*, definite în app.css / mnt-cards-css).
const WORK = [
  { type: 'Schimb ulei + filtru',      icon: 'fa-oil-can',             fam: 'f-service' },
  { type: 'Revizie generală',          icon: 'fa-screwdriver-wrench',  fam: 'f-zone' },
  { type: 'Plăcuțe/discuri frână',     icon: 'fa-car-burst',           fam: 'f-danger' },
  { type: 'Distribuție',               icon: 'fa-gears',               fam: 'f-load' },
  { type: 'Ambreiaj',                  icon: 'fa-circle-half-stroke',  fam: 'f-load' },
  { type: 'Amortizoare',               icon: 'fa-compress',            fam: 'f-load' },
  { type: 'Anvelope',                  icon: 'fa-circle-notch',        fam: 'f-neutral' },
  { type: 'Geometrie',                 icon: 'fa-ruler-combined',      fam: 'f-neutral' },
  { type: 'Filtre (aer/polen/comb.)',  icon: 'fa-filter',              fam: 'f-service' },
  { type: 'Baterie',                   icon: 'fa-car-battery',         fam: 'f-fuel' },
  { type: 'Antigel/lichide',           icon: 'fa-droplet',             fam: 'f-fuel' },
  { type: 'Curea accesorii',           icon: 'fa-rotate',              fam: 'f-load' },
  { type: 'Sistem de răcire',          icon: 'fa-temperature-low',     fam: 'f-fuel' },
  { type: 'Instalație electrică',      icon: 'fa-bolt',                fam: 'f-service' },
  { type: 'Caroserie / tinichigerie',  icon: 'fa-hammer',              fam: 'f-neutral' },
  { type: 'Spălare / curățenie',       icon: 'fa-spray-can-sparkles',  fam: 'f-zone' },
];

// Ce NU e mentenanță, ci act. Ține locul listei din fila Documente + servește la depistarea
// intrărilor vechi, scrise greșit în Mentenanță înainte de granița asta.
const DOCS = ['ITP', 'RCA', 'CASCO', 'Rovinietă', 'Licență transport', 'Tahograf', 'Card tahograf', 'Asigurare marfă'];

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

// Iconița + familia de culoare a unui tip. Tipurile scrise liber („Altele…") primesc cheia neutră.
function meta(t) {
  const w = _byNorm[norm(t)];
  return w ? { icon: w.icon, fam: w.fam } : { icon: DEFAULT_ICON, fam: DEFAULT_FAM };
}

module.exports = { WORK, DOCS, isDocType, canonDocType, meta, norm, DEFAULT_ICON, DEFAULT_FAM };
