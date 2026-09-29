// stoc.js — stocul NOSTRU de echipamente (GPS-uri, module LV-CAN): unde e fiecare și al cui e.
//
// Alin (25.09): „noi trebuie să avem un stoc de echipamente, de GPS-uri, LV-CAN-uri. Poate nu toți vor
// să cumpere echipamentele." Cine închiriază primește aparate care rămân ALE NOASTRE și stau la el —
// deci trebuie să știm oricând unde e fiecare. Același stoc ajută și la vânzare: aparatele le cumpărăm
// înainte să le montăm.
//
// Un rând = O BUCATĂ (un aparat, un modul), cu seria ei. Două întrebări, două câmpuri:
//   • UNDE e  → `stare`: depozit → la instalator → montat la client → returnat → defect / casat;
//   • AL CUI e → `proprietar`: 'ra' (al nostru: în stoc sau închiriat) sau 'client' (vândut).
// Regulile stau aici, fără bază de date, ca să se poată proba cu date inventate.

const STARI = ['depozit', 'instalator', 'montat', 'retur', 'defect', 'casat'];
const ETICHETE_STARE = {
  depozit: 'în depozit',
  instalator: 'la instalator',
  montat: 'montat la client',
  retur: 'returnat, de verificat',
  defect: 'defect',
  casat: 'casat'
};
// Pe unde poate merge o bucată. Ce nu e aici se refuză: un aparat casat nu se mai montează, iar unul
// de la instalator nu sare direct în „returnat" (n-a fost la client).
const TRECERI = {
  depozit: ['instalator', 'montat', 'defect', 'casat'],
  instalator: ['montat', 'depozit', 'defect'],
  montat: ['retur', 'defect'],
  retur: ['depozit', 'defect', 'casat'],
  defect: ['depozit', 'casat'],
  casat: []
};
function poateTrece(din, spre) { return (TRECERI[din] || []).indexOf(spre) >= 0; }

// Câte zile poate sta o bucată la instalator până o semnalăm. Implicit 14; se schimbă din ecran.
const ZILE_LA_INSTALATOR = 14;

// Sumarul pe modele: câte în depozit, la instalatori, închiriate la clienți, vândute, de verificat,
// defecte. Casatele nu se mai numără nicăieri (au ieșit din evidență).
function sumar(randuri) {
  const s = {};
  (randuri || []).forEach(function (r) {
    const t = r.tip || 'necunoscut';
    const x = s[t] || (s[t] = { depozit: 0, instalator: 0, inchiriate: 0, vandute: 0, retur: 0, defect: 0 });
    if (r.stare === 'depozit') x.depozit++;
    else if (r.stare === 'instalator') x.instalator++;
    else if (r.stare === 'montat') { if (r.proprietar === 'client') x.vandute++; else x.inchiriate++; }
    else if (r.stare === 'retur') x.retur++;
    else if (r.stare === 'defect') x.defect++;
  });
  return s;
}

// Ce trebuie făcut, pe trei rânduri:
//   • subMinim     — un model a scăzut sub stocul minim ales de noi (e timpul să comandăm);
//   • laInstalator — o bucată stă la instalator de mai mult de N zile (montată și neînregistrată, sau uitată);
//   • deRecuperat  — o bucată a NOASTRĂ stă la un client al cărui contract s-a încheiat.
// `firmeIncheiate` = id-urile firmelor cu contractul încheiat (le dă serverul, din contracte).
function alerte(randuri, praguri, firmeIncheiate, acum) {
  const p = praguri || {};
  const minim = p.minim || {};
  const zile = Number(p.zileInstalator) > 0 ? Number(p.zileInstalator) : ZILE_LA_INSTALATOR;
  const t = acum || Date.now();
  const incheiate = new Set((firmeIncheiate || []).map(Number));
  const sm = sumar(randuri);
  const subMinim = Object.keys(minim).filter(function (tip) {
    const m = Number(minim[tip]);
    return m > 0 && ((sm[tip] && sm[tip].depozit) || 0) < m;
  }).map(function (tip) { return { tip: tip, minim: Number(minim[tip]), depozit: (sm[tip] && sm[tip].depozit) || 0 }; });
  const laInstalator = (randuri || []).filter(function (r) {
    return r.stare === 'instalator' && Number(r.stare_din) > 0 && (t - Number(r.stare_din)) > zile * 86400000;
  }).map(function (r) { return { id: r.id, zile: Math.floor((t - Number(r.stare_din)) / 86400000) }; });
  const deRecuperat = (randuri || []).filter(function (r) {
    return r.stare === 'montat' && r.proprietar !== 'client' && r.company_id != null && incheiate.has(Number(r.company_id));
  }).map(function (r) { return { id: r.id, company_id: r.company_id }; });
  return { subMinim: subMinim, laInstalator: laInstalator, deRecuperat: deRecuperat, zileInstalator: zile };
}

// Seriile venite din ecran (una pe rând, sau despărțite prin virgulă): curate, fără goluri și fără dubluri.
function serii(text) {
  const vazute = {};
  return String(text || '').split(/[\s,;]+/).map(function (x) { return x.trim().slice(0, 60); })
    .filter(function (x) { if (!x || vazute[x]) return false; vazute[x] = true; return true; });
}

module.exports = { STARI, ETICHETE_STARE, TRECERI, poateTrece, ZILE_LA_INSTALATOR, sumar, alerte, serii };
