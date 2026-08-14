// license_cats.js — categoriile de pe permisul de conducere românesc și încadrarea șoferului.
//
// SURSĂ UNICĂ. Serverul, rapoartele și interfața citesc TOATE de aici: interfața primește lista prin
// ruta `/js/license-cats.js` (generată din acest fișier), nu o rescrie. Regula e aceeași ca la AGP_META
// — o listă paralelă de categorii ar începe să se contrazică cu asta din prima săptămână.
//
// Ordinea din listă e cea de pe permis (rubrica 9) și e ordinea în care se afișează bifele.

const CATEGORIES = [
  { code: 'AM', label: 'Mopede', group: 'Moto' },
  { code: 'A1', label: 'Motociclete până la 125 cm³', group: 'Moto' },
  { code: 'A2', label: 'Motociclete până la 35 kW', group: 'Moto' },
  { code: 'A', label: 'Motociclete fără limită', group: 'Moto' },
  { code: 'B1', label: 'Cvadricicluri', group: 'Auto' },
  { code: 'B', label: 'Autovehicule până la 3.500 kg', group: 'Auto' },
  { code: 'BE', label: 'B + remorcă', group: 'Auto' },
  { code: 'C1', label: 'Camioane 3.500–7.500 kg', group: 'Marfă', pro: true },
  { code: 'C1E', label: 'C1 + remorcă', group: 'Marfă', pro: true },
  { code: 'C', label: 'Camioane peste 3.500 kg', group: 'Marfă', pro: true },
  { code: 'CE', label: 'Camion + semiremorcă (TIR)', group: 'Marfă', pro: true },
  { code: 'D1', label: 'Autobuz până la 16 locuri', group: 'Persoane', pro: true },
  { code: 'D1E', label: 'D1 + remorcă', group: 'Persoane', pro: true },
  { code: 'D', label: 'Autobuz', group: 'Persoane', pro: true },
  { code: 'DE', label: 'Autobuz + remorcă', group: 'Persoane', pro: true },
  { code: 'Tr', label: 'Tractor agricol / forestier', group: 'Speciale' },
  { code: 'Tb', label: 'Troleibuz', group: 'Speciale', pro: true },
  { code: 'Tv', label: 'Tramvai', group: 'Speciale', pro: true }
];

const GROUPS = ['Moto', 'Auto', 'Marfă', 'Persoane', 'Speciale'];
const VALID = new Set(CATEGORIES.map(c => c.code));
const PRO = CATEGORIES.filter(c => c.pro).map(c => c.code);
const PRO_SET = new Set(PRO);
// Ordinea de pe permis, ca să afișăm mereu „B, C, CE", nu în ordinea în care s-a bifat.
const ORDER = new Map(CATEGORIES.map((c, i) => [c.code, i]));

// Acceptă string („B,C,CE"), array sau null. Curăță, validează, deduplică și sortează.
// Nu aruncă niciodată: o valoare stricată se transformă în listă goală, nu în eroare 500.
function parse(v) {
  let arr;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string') arr = v.split(/[,;\s]+/);
  else return [];
  const out = [];
  for (const raw of arr) {
    if (raw == null) continue;
    const c = String(raw).trim().toUpperCase();
    if (!c) continue;
    // Codurile românești Tr/Tb/Tv se scriu cu literă mică a doua — le normalizăm la forma de pe permis.
    const norm = (c === 'TR' || c === 'TB' || c === 'TV') ? c[0] + c[1].toLowerCase() : c;
    if (VALID.has(norm) && out.indexOf(norm) < 0) out.push(norm);
  }
  return out.sort((a, b) => ORDER.get(a) - ORDER.get(b));
}

function format(v) { const a = parse(v); return a.length ? a.join(',') : null; }

// Încadrarea cerută de client: profesionist dacă are măcar o categorie de marfă/persoane
// (C*, D*, troleibuz, tramvai). Doar A/B/BE/Tr → șofer obișnuit. Nimic bifat → nu inventăm o încadrare.
function classify(v) {
  const a = parse(v);
  if (!a.length) return { key: 'none', label: 'Neîncadrat', short: '—' };
  if (a.some(c => PRO_SET.has(c))) return { key: 'pro', label: 'Șofer profesionist', short: 'Profesionist' };
  return { key: 'basic', label: 'Șofer', short: 'Șofer' };
}

module.exports = { CATEGORIES, GROUPS, PRO, PRO_SET, VALID, parse, format, classify };
