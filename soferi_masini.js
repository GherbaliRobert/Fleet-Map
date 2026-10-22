// soferi_masini.js — Capitolul 2, pasul 2 („RA Insight face, cu Da-ul tău"; Alin, 21–22.10: „da" la flux, „da" la „Da"-ul
// nenumărat și de la Basic), partea 1: ȘOFERII PE MAȘINI. Ce permis cere fiecare mașină, ce acoperă permisul unui șofer, ce e
// de rezolvat pe flotă, ce se propune și textele cartonașului din discuție și ale paginii „Șoferi pe mașini".
//
// Curat: fără bază, fără rețea, fără model. Categoriile de pe permis vin din license_cats.js (sursa lor unică), zilele până la
// o dată și forma ei („02.10", „14.03.2031") din ramuri.js — aceleași ca la „Mentenanță & acte". Serverul adună fișele (mașinile
// omului, șoferii firmei, istoricul șoferilor) și le dă aici; aplică schimbările pe calea ecranului (Vehicule › fișa mașinii ›
// Șofer). Păzit de verify_soferi_masini.js.
//
// Ce NU știe aplicația: cine a condus cu adevărat (n-avem identificarea șoferului la bord). Știe cine e TRECUT pe mașină —
// de aceea textele spun „a mai fost trecut pe ea", nu „a mai condus-o".
'use strict';

const licenseCats = require('./license_cats');
const { zz, zilePana } = require('./ramuri');
const insight = require('./insight');

const ANULARE_MIN = 10;          // „Anulează" ține 10 minute după „Da" (macheta din 21.10, aprobată)
const PROPUNERE_ORE = 24;        // o propunere neapăsată mai veche de o zi nu se mai aplică: se cere din nou
const RECENT_ZILE = 30;          // „Azi la tine": mașina rămasă fără șofer în ultimele 30 de zile (cea fără șofer dintotdeauna, doar în pagină)
const PERMIS_CURAND_ZILE = 30;   // „expiră curând" — același prag ca anunțul permiselor (NOTIFY_EXPIRY_DAYS)

// ─── Ce permis cere mașina ──────────────────────────────────────────────────────────────────────────
// Din „Categorie" (devices.vehicle_type) — aceeași listă ca formularul vehiculului —, iar la autoturisme, dube și camioane și din
// masa maximă din „Config Camion" (kg), când e trecută: peste 3.500 kg cere C1, peste 7.500 kg cere C. La autobuz, locurile:
// cel mult 16 pasageri → D1. Utilajele și tractorul nu primesc o categorie anume (aplicația nu le potrivește pe permis), iar
// remorcile și grupul electrogen n-au șofer.
const FEL = {
  auto: { fel: 'autoturism', art: 'Autoturismul', cod: 'B' },
  duba: { fel: 'dubă', art: 'Duba', cod: 'B' },
  ambulanta: { fel: 'ambulanță', art: 'Ambulanța', cod: 'B' },
  camion: { fel: 'camion', art: 'Camionul', cod: 'C' },
  automixt: { fel: 'automixt', art: 'Automixtul', cod: 'C' },
  tir: { fel: 'TIR', art: 'TIR-ul', cod: 'CE' },
  autotractor: { fel: 'autotractor', art: 'Autotractorul', cod: 'CE' },
  autobuz: { fel: 'autobuz', art: 'Autobuzul', cod: 'D' },
  autocar: { fel: 'autocar', art: 'Autocarul', cod: 'D' },
  moto: { fel: 'motocicletă', art: 'Motocicleta', cod: 'A1' }
};
const TIPURI = {
  'auto': 'auto', 'car': 'auto', 'electric': 'auto', 'plug-in hibrid': 'auto', 'phev': 'auto', 'hibrid': 'auto', 'hybrid': 'auto',
  'cng/gpl': 'auto', 'cng': 'auto', 'gpl': 'auto',
  'duba': 'duba', 'van': 'duba',
  'ambulanta': 'ambulanta', 'ambulance': 'ambulanta',
  'camion': 'camion', 'truck': 'camion', 'lorry': 'camion',
  'automixt': 'automixt', 'mixer': 'automixt',
  'tir': 'tir', 'autotractor': 'autotractor',
  'autobuz': 'autobuz', 'bus': 'autobuz', 'autocar': 'autocar', 'coach': 'autocar',
  'motocicleta': 'moto', 'motorcycle': 'moto'
};
const FARA_SOFER = new Set(['remorca', 'remorca tehnologica', 'trailer', 'trailer_tech', 'grup electrogen', 'generator']);
// Ordinea categoriilor cerute, de la cea mai „grea": o mașină care cere CE își alege șoferul înaintea uneia care cere B.
const RANG = { CE: 6, D: 5, C: 4, C1: 3, D1: 3, B: 1, A1: 1, Tr: 1 };
// Cine acoperă o categorie cerută: categoria însăși și cele care o cuprind. C și D se iau doar după B (permisul B e condiția
// lor), deci un permis trecut doar „C" are și B.
const ACOPERA = {
  B: ['B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE'],
  C1: ['C1', 'C1E', 'C', 'CE'], C: ['C', 'CE'], CE: ['CE'],
  D1: ['D1', 'D1E', 'D', 'DE'], D: ['D', 'DE'],
  A1: ['A1', 'A2', 'A'], Tr: ['Tr']
};

function _norm(s) { return insight.norm(s); }
function categoriaCeruta(m) {
  const x = m || {};
  const t = _norm(x.tip);
  if (FARA_SOFER.has(t)) return { cod: null, faraSofer: true, fel: String(x.tip || ''), art: '' };
  const k = TIPURI[t];
  if (!k) return { cod: null, necunoscut: true, fel: t ? String(x.tip) : '', art: '', tipLipsa: !t || t === 'altul' };
  const f = FEL[k];
  let cod = f.cod, deCe = null;
  const masa = Number(x.masaMax);
  if ((k === 'auto' || k === 'duba' || k === 'ambulanta' || k === 'camion') && Number.isFinite(masa) && masa > 0) {
    const dupaMasa = masa > 7500 ? 'C' : (masa > 3500 ? 'C1' : 'B');
    if (dupaMasa !== cod) { cod = dupaMasa; deCe = 'masa maximă ' + Math.round(masa).toLocaleString('ro-RO') + ' kg'; }
  }
  const loc = Number(x.locuri);
  if ((k === 'autobuz' || k === 'autocar') && Number.isFinite(loc) && loc > 0 && loc <= 16) { cod = 'D1'; deCe = loc + (loc === 1 ? ' loc' : ' locuri'); }
  return { cod: cod, fel: f.fel, art: f.art, deCe: deCe };
}
// Categoriile permisului (din fișa șoferului) care acoperă categoria cerută; [] = nu o acoperă.
function acoperitoare(categorii, cod) {
  const c = licenseCats.parse(categorii);
  return (ACOPERA[cod] || [cod]).filter(function (x) { return c.indexOf(x) >= 0; });
}
function acopera(categorii, cod) { return acoperitoare(categorii, cod).length > 0; }
// Cea mai „grea" categorie de pe permis — ca un șofer de CE să nu fie folosit pe un autoturism când există unul de B.
function rangSofer(categorii) { return licenseCats.parse(categorii).reduce(function (m, c) { return Math.max(m, RANG[c] || 0); }, 0); }

// ─── Permisul unui șofer față de o mașină ───────────────────────────────────────────────────────────
// { stare: 'ok'|'nepotrivit'|'expirat'|'fara_categorii'|'necunoscut', nivel: 'ok'|'w'|'r'|'i', text, curand }.
function verdict(sofer, ceruta, acum) {
  const s = sofer || {};
  const cats = licenseCats.parse(s.categorii);
  const zile = s.expira ? zilePana(s.expira, acum) : null;
  if (zile != null && zile < 0) return { stare: 'expirat', nivel: 'r', text: 'permis expirat pe ' + zz(s.expira, acum) };
  if (!ceruta || !ceruta.cod) {
    return { stare: 'necunoscut', nivel: 'i', text: ceruta && ceruta.tipLipsa ? 'categoria mașinii nu e trecută în fișă, deci nu verific permisul' : 'nu verific permisul la ' + (ceruta && ceruta.fel ? '„' + ceruta.fel + '"' : 'mașina asta') };
  }
  if (!cats.length) return { stare: 'fara_categorii', nivel: 'i', text: 'categoriile permisului nu sunt trecute în fișa șoferului' };
  const ac = acoperitoare(cats, ceruta.cod);
  if (!ac.length) return { stare: 'nepotrivit', nivel: 'w', text: 'are doar permis ' + cats.join(', ') };
  const are = ac.indexOf(ceruta.cod) >= 0 ? ceruta.cod : ac[0];
  const curand = zile != null && zile <= PERMIS_CURAND_ZILE;
  const text = 'permis ' + are + (are !== ceruta.cod ? ' (cuprinde ' + ceruta.cod + ')' : '') +
    (s.expira ? (curand ? ', expiră pe ' + zz(s.expira, acum) + (zile === 0 ? ' (azi)' : ' (peste ' + zile + (zile === 1 ? ' zi)' : ' zile)')) : ' valabil până pe ' + zz(s.expira, acum)) : ' · valabilitatea nu e trecută în fișă');
  return { stare: 'ok', nivel: curand ? 'w' : 'ok', text: text, curand: curand, faraData: !s.expira };
}

// ─── Cuvintele care se acordă ───────────────────────────────────────────────────────────────────────
function de(n) { const r = Math.abs(Math.round(n)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function cate(n, unu, multe) { return n === 1 ? unu : n + de(n) + multe; }
function lista(nume, max) { const m = max || 2; return nume.slice(0, m).join(', ') + (nume.length > m ? ' și încă ' + (nume.length - m) : ''); }
function luna(ms, acum) {
  const d = new Date(ms); if (isNaN(d)) return '';
  const an = new Date(acum || Date.now()).getUTCFullYear();
  return insight.LUNI[d.getUTCMonth()] + (d.getUTCFullYear() !== an ? ' ' + d.getUTCFullYear() : '');
}

// ─── Flota: ce e de rezolvat, ce e în regulă, cine e liber, ce propun ──────────────────────────────────
// o = {
//   masini: [{ imei, nr, nume, tip, masaMax, locuri, soferId, grupa }] — mașinile omului (fără arhivate);
//   soferi: [{ id, nume, categorii, expira, masini: [imei…] }] — TOȚI șoferii firmei, cu mașinile lor din toată firma
//           (un șofer trecut pe o mașină pe care omul n-o vede nu e „liber");
//   istoric: [{ imei, driver_id, de_la, pana_la }] — istoricul șoferilor (istoric_soferi);
//   acum
// }
function analiza(o) {
  const x = o || {}, acum = x.acum || Date.now();
  const soferi = Array.isArray(x.soferi) ? x.soferi : [];
  const pe = {}; soferi.forEach(function (s) { pe[s.id] = s; });
  const ist = Array.isArray(x.istoric) ? x.istoric : [];
  const masini = [];
  (Array.isArray(x.masini) ? x.masini : []).forEach(function (m) {
    const ceruta = categoriaCeruta(m);
    if (ceruta.faraSofer) return;
    const sofer = m.soferId != null ? (pe[m.soferId] || null) : null;
    const nr = String(m.nr || '').trim() || String(m.nume || '').trim() || m.imei;
    const nume = String(m.nume || '').trim();
    const desc = [nume && insight.compact(nume) !== insight.compact(nr) ? nume : '', ceruta.fel ? ceruta.fel + (ceruta.cod ? ', cere ' + ceruta.cod : '') : ''].filter(Boolean).join(' · ');
    const r = { imei: m.imei, nr: nr, nume: nume, descriere: desc, ceruta: ceruta, grupa: m.grupa || null, sofer: sofer ? { id: sofer.id, nume: sofer.nume } : null };
    if (!sofer) {
      if (!ceruta.cod) return;   // fără categorie știută și fără șofer: nu știm dacă are nevoie de unul
      const rows = ist.filter(function (h) { return h.imei === m.imei; });
      const deschis = rows.some(function (h) { return h.pana_la == null; });
      const ultim = rows.reduce(function (mx, h) { return h.pana_la != null && h.pana_la > mx ? h.pana_la : mx; }, 0);
      r.faraDe = !deschis && ultim > 0 ? ultim : null;
      r.zileFara = r.faraDe ? Math.max(0, Math.floor((acum - r.faraDe) / 86400000)) : null;
      r.recent = r.zileFara != null && r.zileFara <= RECENT_ZILE;
      r.stare = 'fara'; r.nivel = 'w';
      r.text = r.zileFara == null ? 'fără șofer' : 'fără șofer' + (r.zileFara === 0 ? ' de azi' : ' de ' + cate(r.zileFara, 'o zi', 'zile'));
      masini.push(r); return;
    }
    const v = verdict(sofer, ceruta, acum);
    r.stare = v.stare === 'ok' || v.stare === 'necunoscut' ? 'ok' : (v.stare === 'fara_categorii' ? 'de_completat' : v.stare);
    r.nivel = v.nivel; r.text = v.text; r.curand = !!v.curand;
    masini.push(r);
  });
  const deRezolvat = masini.filter(function (m) { return m.stare === 'fara' || m.stare === 'nepotrivit' || m.stare === 'expirat'; });
  const inRegula = masini.filter(function (m) { return m.stare === 'ok'; });
  const deCompletat = masini.filter(function (m) { return m.stare === 'de_completat'; });
  const liberi = soferi.filter(function (s) { return !(s.masini || []).length; }).map(function (s) {
    const cats = licenseCats.parse(s.categorii), zile = s.expira ? zilePana(s.expira, acum) : null;
    return { id: s.id, nume: s.nume, categorii: cats.join(', '), expirat: zile != null && zile < 0,
      text: !cats.length ? 'categoriile permisului lipsesc din fișă' : (zile != null && zile < 0 ? 'permis ' + cats.join(', ') + ' expirat pe ' + zz(s.expira, acum) : cats.join(', ')) };
  });
  const p = _propuneri(deRezolvat, soferi, ist, acum);
  return { masini: masini, deRezolvat: deRezolvat, inRegula: inRegula, deCompletat: deCompletat, liberi: liberi,
    propuneri: p.propuneri, faraPropunere: p.faraPropunere, faraSoferi: soferi.length === 0,
    rezumat: rezumat(deRezolvat, inRegula, liberi) };
}
// A mai fost trecut șoferul pe mașina asta? Luna ultimei treceri, pentru „a mai fost trecut pe ea în septembrie". O trecere mai
// scurtă de o oră nu se socotește (o greșeală îndreptată pe loc, un „Anulează"); cea „de dinainte să ținem minte" (de_la = 0), da.
// Istoricul se strânge O DATĂ într-o hartă (mașină|șofer → ultima trecere): la sute de mașini, căutarea ar merge altfel la nesfârșit.
const TRECERE_MIN_MS = 60 * 60000;
function indexIstoric(ist) {
  const m = new Map();
  (ist || []).forEach(function (h) {
    if (h.pana_la == null || !(!h.de_la || h.pana_la - h.de_la >= TRECERE_MIN_MS)) return;
    const k = h.imei + '|' + Number(h.driver_id);
    if (!(m.get(k) >= h.pana_la)) m.set(k, h.pana_la);
  });
  return m;
}
function aMaiFost(idx, imei, driverId) { return (idx && idx.get(imei + '|' + Number(driverId))) || null; }
// Ce categorii cerute poate conduce un șofer (o dată pe șofer, nu la fiecare mașină).
function _poateConduce(categorii) {
  const c = licenseCats.parse(categorii), o = {};
  Object.keys(ACOPERA).forEach(function (k) { o[k] = ACOPERA[k].some(function (x) { return c.indexOf(x) >= 0; }); });
  return o;
}
// Propunerile: pe rând, întâi mașinile cu cei mai puțini șoferi potriviți (o mașină care cere CE își alege înaintea uneia
// care cere B). Șoferul ales iese din cei liberi; cel scos de pe o mașină cu permisul nepotrivit devine liber („după ce iese de
// pe …") și poate merge pe altă mașină. Alegerea: cine a mai fost trecut pe mașină, apoi cel mai puțin „prea calificat" (un
// șofer de CE rămâne pentru camioane), apoi cine are valabilitatea trecută în fișă, apoi numele.
function _propuneri(deRezolvat, soferi, ist, acum) {
  const valid = function (s) { const z = s.expira ? zilePana(s.expira, acum) : null; return licenseCats.parse(s.categorii).length > 0 && !(z != null && z < 0); };
  const idx = indexIstoric(ist);
  let liberi = soferi.filter(function (s) { return !(s.masini || []).length && valid(s); }).map(function (s) { return Object.assign({}, s, { dupa: null, _poate: _poateConduce(s.categorii), _rang: rangSofer(s.categorii) }); });
  let ramase = deRezolvat.filter(function (m) { return m.ceruta && m.ceruta.cod; }).slice();
  const propuneri = [];
  const alegeDintre = function (m, c) {
    return c.slice().sort(function (a, b) {
      const ia = aMaiFost(idx, m.imei, a.id) ? 1 : 0, ib = aMaiFost(idx, m.imei, b.id) ? 1 : 0;
      return (ib - ia) || (a._rang - b._rang) || ((b.expira ? 1 : 0) - (a.expira ? 1 : 0)) || String(a.nume).localeCompare(String(b.nume), 'ro');
    })[0];
  };
  for (let pas = 0; pas < 5000 && ramase.length; pas++) {
    // Mașina care alege acum: cea cu cei mai puțini șoferi potriviți; la egalitate, cea pe care cel ales a mai fost trecut
    // (Ion, scos de pe TIR, merge pe duba pe care a mai fost, nu pe alt autoturism), apoi permisul cel mai „greu", apoi numărul.
    const cand = ramase.map(function (m) { const c = liberi.filter(function (s) { return s._poate[m.ceruta.cod]; }); const a = c.length ? alegeDintre(m, c) : null; return { m: m, c: c, a: a, fost: a && aMaiFost(idx, m.imei, a.id) ? 1 : 0 }; })
      .filter(function (x) { return x.c.length; })
      .sort(function (a, b) { return (a.c.length - b.c.length) || (b.fost - a.fost) || ((RANG[b.m.ceruta.cod] || 0) - (RANG[a.m.ceruta.cod] || 0)) || String(a.m.nr).localeCompare(String(b.m.nr), 'ro'); });
    if (!cand.length) break;
    const m = cand[0].m, ales = cand[0].a;
    const v = verdict(ales, m.ceruta, acum), fost = aMaiFost(idx, m.imei, ales.id);
    propuneri.push({ imei: m.imei, deLa: m.sofer ? m.sofer.id : null, la: ales.id, laNume: ales.nume, dupa: ales.dupa,
      deCe: [v.text, ales.dupa ? null : 'nu e pe altă mașină', fost ? 'a mai fost trecut pe ea în ' + luna(fost, acum) : null].filter(Boolean).join(' · ') });
    liberi = liberi.filter(function (s) { return s.id !== ales.id; });
    // Cel scos de pe o mașină care cere alt permis devine liber (doar dacă permisul lui e bun la altceva).
    if (m.sofer && m.stare === 'nepotrivit') {
      const vechi = soferi.filter(function (s) { return s.id === m.sofer.id; })[0];
      if (vechi && valid(vechi) && (vechi.masini || []).length <= 1) liberi.push(Object.assign({}, vechi, { dupa: m.imei, dupaNr: m.nr, _poate: _poateConduce(vechi.categorii), _rang: rangSofer(vechi.categorii) }));
    }
    ramase = ramase.filter(function (r) { return r.imei !== m.imei; });
  }
  const faraPropunere = [];
  ramase.forEach(function (m) {
    const lipsa = 'nu e alt șofer liber cu permis ' + m.ceruta.cod + ' valabil';
    // Permisul expirat: fără altul liber, propun să-l scot de pe mașină până trece permisul nou în fișă (macheta din 21.10).
    if (m.stare === 'expirat') propuneri.push({ imei: m.imei, deLa: m.sofer.id, la: null, scoate: true, deCe: lipsa });
    else faraPropunere.push({ imei: m.imei, motiv: lipsa });
  });
  // Permisul expirat pe o mașină fără o categorie știută (utilaj, „Altul", categoria netrecută): nu caut alt șofer (nu știu ce
  // permis cere), dar nu-l las nici pe dinafară — propun să-l scot, ca la orice permis expirat.
  deRezolvat.filter(function (m) { return !(m.ceruta && m.ceruta.cod) && m.stare === 'expirat' && m.sofer; }).forEach(function (m) {
    propuneri.push({ imei: m.imei, deLa: m.sofer.id, la: null, scoate: true, deCe: 'permisul a expirat; categoria mașinii nu e știută, deci nu caut alt șofer' });
  });
  // „după ce iese de pe B 77 TIR": cu numărul mașinii, pentru pagină.
  propuneri.forEach(function (p) { if (p.dupa) { const d = deRezolvat.filter(function (m) { return m.imei === p.dupa; })[0]; p.dupaNr = d ? d.nr : ''; } });
  return { propuneri: propuneri, faraPropunere: faraPropunere };
}
// Cartonașele de sus ale paginii: „3 · un permis nepotrivit, unul expirat, o mașină fără șofer".
function rezumat(deRezolvat, inRegula, liberi) {
  const n = function (s) { return deRezolvat.filter(function (m) { return m.stare === s; }).length; };
  const nep = n('nepotrivit'), exp = n('expirat'), fara = n('fara');
  const parti = [];
  if (nep) parti.push(nep === 1 ? 'un permis nepotrivit' : nep + de(nep) + 'permise nepotrivite');
  if (exp) parti.push(nep ? (exp === 1 ? 'unul expirat' : exp + de(exp) + 'expirate') : (exp === 1 ? 'un permis expirat' : exp + de(exp) + 'permise expirate'));
  if (fara) parti.push(fara === 1 ? 'o mașină fără șofer' : fara + de(fara) + 'mașini fără șofer');
  const okNume = inRegula.map(function (m) { return m.nr + (m.sofer ? ' · ' + m.sofer.nume : ''); });
  const liberiOk = liberi.filter(function (s) { return !s.expirat && s.categorii; });
  return {
    deRezolvat: deRezolvat.length, deRezolvatText: parti.length ? parti.join(', ') : 'nimic',
    inRegula: inRegula.length, inRegulaText: okNume.length ? lista(okNume, 1) : '—',
    liberi: liberiOk.length, liberiText: liberiOk.length ? (liberiOk.length === 1 ? liberiOk[0].nume + ' · ' + liberiOk[0].categorii : lista(liberiOk.map(function (s) { return s.nume; }), 2)) : 'niciunul'
  };
}

// ─── Cartonașul din discuție ────────────────────────────────────────────────────────────────────────
// Textele care nu depind de date (pagina le ia de la server, nu le scrie).
const TEXTE = {
  deCand: 'din clipa în care apeși Da',
  faraDa: 'Fără „Da" nu schimb nimic.',
  anulare: 'Se poate anula ' + ANULARE_MIN + ' minute.',
  sofeiNuPrimesc: 'Fiecare schimbare intră în istoricul mașinii și se poate anula ' + ANULARE_MIN + ' minute. Șoferii nu primesc niciun mesaj.',
  intro: 'Din fișele șoferilor (categoriile și valabilitatea permisului) și din cine a mai fost trecut pe fiecare mașină. Nu se schimbă nimic până nu apeși „Aplică”.',
  nuStie: 'Aplicația știe cine e trecut pe mașină, nu cine a condus-o: potrivirea se face pe fișe.'
};
function caleText(cineNume) {
  return 'Se face exact ca din Vehicule › fișa mașinii › Șofer, cu drepturile tale. În jurnal: „' + cineNume + ', prin RA Insight”. ' + TEXTE.anulare;
}
function nuSeSchimba(grupa) { return 'Nu se schimbă: grupa mașinii' + (grupa ? ' (' + grupa + ')' : '') + ', alertele și rapoartele programate.'; }

// Cartonașul pentru o pereche cerută („Pune-l pe Mihai Ionescu pe B 77 TIR"). Întoarce { ok: false, text, alege? } când nu se
// poate propune (permisul nu acoperă mașina, e expirat, e deja acolo) — cu șoferii potriviți, de ales —, altfel { ok: true, card }.
function propunerePereche(an, o) {
  const x = o || {}, acum = x.acum || Date.now();
  const m = an.masini.filter(function (q) { return q.imei === x.imei; })[0];
  const s = (x.soferi || []).filter(function (q) { return Number(q.id) === Number(x.soferId); })[0];
  if (!m) return { ok: false, text: 'Nu văd mașina asta printre cele la care ai acces.' };
  if (!s) return { ok: false, text: 'Nu găsesc șoferul în fișele firmei.' };
  if (m.sofer && Number(m.sofer.id) === Number(s.id)) return { ok: false, text: '**' + s.nume + '** e deja trecut pe **' + m.nr + '**.' };
  const v = verdict(s, m.ceruta, acum);
  const potriviti = function () {
    return an.liberi.filter(function (l) { return !l.expirat && m.ceruta.cod && acopera((x.soferi.filter(function (q) { return q.id === l.id; })[0] || {}).categorii, m.ceruta.cod); });
  };
  if (v.stare === 'expirat' || v.stare === 'nepotrivit') {
    const alt = potriviti();
    const motiv = v.stare === 'expirat' ? 'permisul lui **' + s.nume + '** a expirat pe ' + zz(s.expira, acum) : '**' + s.nume + '** ' + v.text + ', iar ' + m.ceruta.art.toLowerCase() + ' cere ' + m.ceruta.cod;
    return { ok: false, text: 'Nu-l pot trece pe **' + m.nr + '**: ' + motiv + '.' + (alt.length ? ' ' + (alt.length === 1 ? 'Șoferul liber' : 'Șoferii liberi') + ' cu permis ' + m.ceruta.cod + ' valabil: ' + lista(alt.map(function (l) { return l.nume; }), 3) + '.' : ' Niciun șofer liber nu are permis ' + m.ceruta.cod + ' valabil.'),
      alege: alt.slice(0, 4).map(function (l) { return { text: 'Pune-l pe ' + l.nume + ' pe ' + m.nr, trimite: 'Pune-l pe ' + l.nume + ' pe ' + m.nr }; }) };
  }
  const dovezi = [];
  if (v.stare === 'ok') dovezi.push({ nivel: v.curand ? 'w' : 'ok', text: s.nume + ' are ' + v.text.replace(' valabil până pe ', ', valabil până pe ') + '. ' + m.ceruta.art + ' cere ' + m.ceruta.cod + (m.ceruta.deCe ? ' (' + m.ceruta.deCe + ')' : '') + '.' });
  else dovezi.push({ nivel: 'w', text: v.stare === 'fara_categorii' ? 'Categoriile permisului lui ' + s.nume + ' nu sunt trecute în fișa lui, deci nu pot verifica dacă poate conduce ' + (m.ceruta.art ? m.ceruta.art.toLowerCase() : 'mașina') + '.' : 'Categoria mașinii nu e trecută în fișă, deci nu verific permisul.' });
  const schimbari = [];
  const alte = (s.masini || []).filter(function (i) { return i !== m.imei; });
  // Trecut pe o mașină pe care omul n-o vede: n-o poate schimba el — o face cine o vede.
  const nevazute = alte.filter(function (i) { return !an.masini.some(function (z) { return z.imei === i; }); });
  if (nevazute.length) return { ok: false, text: '**' + s.nume + '** e trecut acum pe o mașină la care n-ai acces. Schimbarea o poate face cine vede mașina aceea (de pildă administratorul firmei).' };
  if (!alte.length) dovezi.push({ nivel: 'ok', text: s.nume + ' nu e trecut acum pe nicio altă mașină.' });
  else {
    alte.forEach(function (i) { schimbari.push({ imei: i, deLa: s.id, la: null }); });
    const nrAlte = alte.map(function (i) { return an.masini.filter(function (z) { return z.imei === i; })[0].nr; });
    dovezi.push({ nivel: 'w', text: s.nume + ' e trecut acum pe ' + lista(nrAlte, 3) + ': îl mut de acolo, iar ' + (alte.length === 1 ? 'mașina aceea rămâne' : 'acelea rămân') + ' fără șofer.' });
  }
  schimbari.push({ imei: m.imei, deLa: m.sofer ? m.sofer.id : null, la: s.id });
  if (m.sofer) {
    const vechi = (x.soferi || []).filter(function (q) { return q.id === m.sofer.id; })[0] || {};
    const vv = verdict(vechi, m.ceruta, acum);
    dovezi.push({ nivel: 'w', text: m.sofer.nume + ' rămâne fără mașină' + (vv.stare === 'nepotrivit' ? '. ' + (vv.text.replace(/^are /, 'Are ')) + ', deci nu poate conduce ' + m.ceruta.art.toLowerCase() + '.' : (vv.stare === 'expirat' ? ' (' + vv.text + ').' : '.')) });
  }
  return { ok: true, card: _card(m, { la: { id: s.id, nume: s.nume }, schimbari: schimbari, dovezi: dovezi, cine: x.cine, poate: x.poate, aproba: x.aproba,
    alternative: _alternative(an, m, x.soferi, s.id) }) };
}
// Cartonașul pentru o mașină („Propune un șofer pentru B 268 ROY", din „Azi la tine"): propunerea paginii pentru ea.
// { ok: false, text } când mașina e în regulă sau n-am pe cine propune.
function propunerePentru(an, o) {
  const x = o || {}, acum = x.acum || Date.now();
  const m = an.masini.filter(function (q) { return q.imei === x.imei; })[0];
  if (!m) return { ok: false, text: 'Nu văd mașina asta printre cele la care ai acces.' };
  if (m.stare === 'ok') return { ok: false, text: '**' + m.nr + '** e în regulă: ' + (m.sofer ? m.sofer.nume + ', ' : '') + m.text + '.' };
  if (m.stare === 'de_completat') return { ok: false, text: 'La **' + m.nr + '** e trecut ' + m.sofer.nume + ', dar ' + m.text + ': completează-le din Management › Șoferi și verific din nou.' };
  const p = an.propuneri.filter(function (q) { return q.imei === m.imei; })[0];
  if (!p) {
    const f = an.faraPropunere.filter(function (q) { return q.imei === m.imei; })[0];
    return { ok: false, text: 'Pentru **' + m.nr + '** (' + m.text + ') nu am pe cine propune: ' + (f ? f.motiv : 'niciun șofer liber potrivit') + '. Un șofer nou se adaugă din Management › Șoferi.' };
  }
  if (p.scoate) {
    const dovezi = [{ nivel: 'r', text: 'Permisul lui ' + m.sofer.nume + ' a expirat (' + m.text + ').' }, { nivel: 'i', text: p.deCe.replace(/^n/, 'N') + ': mașina rămâne fără șofer până trece permisul nou în fișa lui.' }];
    return { ok: true, card: _card(m, { la: null, schimbari: [{ imei: m.imei, deLa: m.sofer.id, la: null }], dovezi: dovezi, cine: x.cine, poate: x.poate, aproba: x.aproba, alternative: [] }) };
  }
  // Șoferul propus e încă pe mașina de pe care l-ar scoate altă propunere („după ce iese de pe…"): aici, singur, îl mut pe față.
  return propunerePereche(an, Object.assign({}, x, { soferId: p.la }));
}
// „Scoate-l pe Andrei Pop de pe B 112 RFG": mașina rămâne fără șofer trecut. { ok: false, text } când n-are pe nimeni (sau pe
// altcineva decât cel numit).
function propunereScoate(an, o) {
  const x = o || {};
  const m = an.masini.filter(function (q) { return q.imei === x.imei; })[0];
  if (!m) return { ok: false, text: 'Nu văd mașina asta printre cele la care ai acces.' };
  if (!m.sofer) return { ok: false, text: '**' + m.nr + '** n-are niciun șofer trecut.' };
  if (x.soferId != null && Number(x.soferId) !== Number(m.sofer.id)) {
    const s = (x.soferi || []).filter(function (q) { return Number(q.id) === Number(x.soferId); })[0];
    return { ok: false, text: (s ? '**' + s.nume + '**' : 'Șoferul ăsta') + ' nu e trecut pe **' + m.nr + '**; acolo e trecut ' + m.sofer.nume + '.' };
  }
  const dovezi = [];
  if (m.stare === 'expirat' || m.stare === 'nepotrivit') dovezi.push({ nivel: m.nivel, text: m.sofer.nume + ': ' + m.text + '.' });
  dovezi.push({ nivel: 'i', text: m.nr + ' rămâne fără șofer trecut, până pui altul (din fișa mașinii sau cu „Pune-l pe … pe ' + m.nr + '").' });
  return { ok: true, card: _card(m, { la: null, schimbari: [{ imei: m.imei, deLa: m.sofer.id, la: null }], dovezi: dovezi, cine: x.cine, poate: x.poate, aproba: x.aproba, alternative: [] }) };
}
// Ceilalți șoferi liberi care pot conduce mașina — pentru „Schimbă".
function _alternative(an, m, soferi, faraId) {
  if (!m.ceruta || !m.ceruta.cod) return [];
  return an.liberi.filter(function (l) {
    if (l.expirat || Number(l.id) === Number(faraId)) return false;
    const s = (soferi || []).filter(function (q) { return q.id === l.id; })[0];
    return s && acopera(s.categorii, m.ceruta.cod);
  }).slice(0, 12).map(function (l) {
    const s = (soferi || []).filter(function (q) { return q.id === l.id; })[0];
    return { id: l.id, nume: l.nume, text: l.nume + ' — ' + verdict(s, m.ceruta, Date.now()).text };
  });
}
function _card(m, o) {
  const scoate = !o.la;
  return {
    fel: 'sofer', imei: m.imei, la: o.la ? o.la.id : null,
    titlu: scoate ? 'Scot șoferul de pe ' + m.nr : 'Trec șoferul pe ' + m.nr,
    masina: { nr: m.nr, rest: m.descriere.replace(/, cere [A-Z0-9]+$/, '') },
    sofer: { de: m.sofer ? m.sofer.nume : null, la: o.la ? o.la.nume : null },
    deCand: TEXTE.deCand,
    dovezi: o.dovezi, dovT: scoate ? 'De ce' : 'De ce se potrivește',
    nuSeSchimba: nuSeSchimba(m.grupa),
    sub: o.poate ? caleText(o.cine || 'tu') : 'Doar cine poate schimba vehiculele apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: scoate ? 'Da, scoate-l' : 'Da, trece-l',
    poate: !!o.poate,
    alternative: o.alternative || [],
    schimbari: o.schimbari
  };
}

// ─── După „Da" ─────────────────────────────────────────────────────────────────────────────────────
function oraText(ms) { return new Date(ms).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }); }
// „Gata. Mihai Ionescu e pe B 77 TIR de azi, 10:42." + rândul jurnalului, scris de server după ce schimbarea chiar s-a făcut.
function gata(card, cine, la) {
  const ora = oraText(la);
  const zi = new Date(la).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' });
  const scoate = !card.sofer.la;
  const ce = scoate ? 'fără șofer pe ' + card.masina.nr : 'șoferul ' + card.sofer.la + ' pe ' + card.masina.nr;
  return {
    text: scoate ? 'Gata. **' + card.masina.nr + '** nu mai are șofer trecut, de azi, ' + ora + '.' : 'Gata. **' + card.sofer.la + '** e pe **' + card.masina.nr + '** de azi, ' + ora + '.',
    jurnal: 'În jurnal: „' + cine + ', prin RA Insight: ' + ce + '” · ' + zi + ', ' + ora + '.' +
      (card.sofer.de ? ' În istoricul mașinii: ' + card.sofer.de + ' până azi la ' + ora + (scoate ? '.' : ', ' + card.sofer.la + ' de atunci.') : '')
  };
}
// Textul jurnalului pentru o schimbare (în audit, lângă „prin RA Insight").
function jurnalText(nrMasina, numeSofer) { return numeSofer ? 'șoferul ' + numeSofer + ' pe ' + nrMasina : 'fără șofer pe ' + nrMasina; }
// Pasul următor, după „Da": cel rămas fără mașină și o mașină pentru el (din propunerile flotei de acum), altfel ce mai e de rezolvat.
function pasulUrmator(an, eliberatId) {
  const p = eliberatId != null ? an.propuneri.filter(function (q) { return Number(q.la) === Number(eliberatId) && !q.scoate; })[0] : null;
  if (p) {
    const m = an.masini.filter(function (q) { return q.imei === p.imei; })[0];
    return { text: p.laNume + ' a rămas fără mașină, iar **' + m.nr + '** ' + (m.stare === 'fara' ? 'n-are șofer' + (m.zileFara ? ' de ' + cate(m.zileFara, 'o zi', 'zile') : '') : (m.stare === 'expirat' ? 'are un șofer cu permisul expirat' : 'are un șofer fără permisul cerut')) +
      '. ' + p.laNume + ' are ' + p.deCe.split(' · ')[0] + (/a mai fost trecut/.test(p.deCe) ? ' și ' + p.deCe.split(' · ').filter(function (t) { return /a mai fost trecut/.test(t); })[0] : '') + '. Îți pregătesc și schimbarea asta?',
      urmari: [{ text: 'Pune-l pe ' + p.laNume + ' pe ' + m.nr, trimite: 'Pune-l pe ' + p.laNume + ' pe ' + m.nr }, { text: 'Arată-mi potrivirea șoferilor pe toate mașinile', trimite: 'Arată-mi potrivirea șoferilor pe toate mașinile' }] };
  }
  const n = an.deRezolvat.length;
  if (!n) return null;
  return { text: 'Mai ' + (n === 1 ? 'e un lucru' : 'sunt ' + n + de(n) + 'lucruri') + ' de rezolvat la șoferi: ' + an.rezumat.deRezolvatText + '.',
    urmari: [{ text: 'Arată-mi potrivirea șoferilor pe toate mașinile', trimite: 'Arată-mi potrivirea șoferilor pe toate mașinile' }] };
}

// ─── Ce cere omul, în cuvinte ───────────────────────────────────────────────────────────────────────
// Pe reguli, fără model. O CERERE = un verb de schimbare + un șofer + o mașină („Pune-l pe Mihai Ionescu pe B 77 TIR"), sau
// „propune un șofer pentru …", „scoate-l pe … de pe …", „potrivirea șoferilor". O întrebare („ce mașină conduce Mihai?",
// „cine l-a trecut pe…") rămâne întrebare: trecutul („pus", „trecut") nu e o cerere.
const RE_PAGINA = /\b(potrivirea soferilor|potriveste soferii|soferi pe masini|soferii pe masini)\b/;
const RE_PROPUNE = /\b(propune|propune-mi|recomanda|recomanda-mi|gaseste|gaseste-mi)\b.*\bsofer|\bpe cine (pun|trec|las)\b|\bcine (poate|ar putea) (conduce|sa conduca)\b/;
const RE_SCOATE = /\b(scoate|scoate-l|scoate-o|scoateti|elibereaza)\b.*\b(de pe|de la)\b/;
const RE_PUNE = /\b(pune|pune-l|pune-o|puneti|trece|trece-l|trece-o|treci|atribuie|atribuie-l|atribuie-o|aloca|aloca-l|muta|muta-l|muta-o|da-i|seteaza)\b/;
const RE_SCHIMBA = /\bschimba soferul\b/;
const RE_DA = /^(da|da,? te rog|da,? fa-o|da,? trece-l|da,? scoate-l|ok|okay|fa-o|aplica|confirm|sigur|de acord|da da)[.!]*$/;
function pareCerere(text) {
  const t = _norm(text);
  return RE_PAGINA.test(t) || RE_PROPUNE.test(t) || RE_SCOATE.test(t) || RE_PUNE.test(t) || RE_SCHIMBA.test(t);
}
function eDaScris(text) { return RE_DA.test(_norm(text).replace(/\s+/g, ' ')); }
// Șoferii pomeniți: numele întreg (cel mai lung întâi), altfel un singur cuvânt din nume, doar după „pe", „lui", „șoferul", „cu"
// (altfel „consum mare" ar găsi pe Ionel Mare). Două potriviri pe același cuvânt = îndoială, de lămurit cu butoane.
function gasesteSoferi(text, soferi) {
  let t = ' ' + _norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  const out = { soferi: [], ambigui: [], rest: t };
  const lst = (soferi || []).map(function (s) { return { s: s, n: _norm(s.nume).replace(/[^a-z0-9]+/g, ' ').trim() }; }).filter(function (x) { return x.n.length >= 3; })
    .sort(function (a, b) { return b.n.length - a.n.length; });
  lst.forEach(function (x) {
    if (x.n.indexOf(' ') < 0) return;
    const re = new RegExp(' ' + x.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ');
    if (re.test(t)) { out.soferi.push(x.s); t = t.replace(re, ' '); }
  });
  if (!out.soferi.length) {
    const tok = t.trim().split(' ');
    for (let i = 1; i < tok.length; i++) {
      if (!/^(pe|lui|soferul|sofer|cu)$/.test(tok[i - 1]) || tok[i].length < 3) continue;
      const cand = lst.filter(function (x) { return x.n.split(' ').indexOf(tok[i]) >= 0; });
      if (cand.length === 1) { out.soferi.push(cand[0].s); t = t.replace(' ' + tok[i] + ' ', ' '); break; }
      if (cand.length > 1) { out.ambigui = cand.map(function (x) { return x.s; }); t = t.replace(' ' + tok[i] + ' ', ' '); break; }
    }
  }
  out.rest = t;
  return out;
}
// → null (nu e o cerere de-a noastră) | { fel: 'pagina' } | { fel: 'pentru', imei | ambigue | lipsa } |
//   { fel: 'pereche', soferId, imei | ambigui | ambigue | lipsa } | { fel: 'scoate', imei, soferId? }.
function cerere(text, soferi, fisa) {
  const t = _norm(text);
  if (RE_PAGINA.test(t) && !RE_PUNE.test(t.replace(/\barata(-mi)?\b/, ''))) return { fel: 'pagina' };
  const masiniDin = function (rest) {
    const g = insight.gasesteInText(rest, fisa || []);
    if (g.masini.length === 1) return { imei: g.masini[0].imei };
    if (g.masini.length > 1) return { ambigue: g.masini.slice(0, 8) };
    if (g.ambigue.length) return { ambigue: g.ambigue[0].variante.slice(0, 8) };
    return { lipsa: 'masina' };
  };
  if (RE_PROPUNE.test(t)) return Object.assign({ fel: 'pentru' }, masiniDin(text));
  const sf = gasesteSoferi(text, soferi);
  if (RE_SCOATE.test(t)) {
    const r = Object.assign({ fel: 'scoate' }, masiniDin(sf.rest));
    if (sf.soferi.length === 1) r.soferId = sf.soferi[0].id;
    return r;
  }
  if ((RE_PUNE.test(t) || RE_SCHIMBA.test(t)) && (sf.soferi.length || sf.ambigui.length)) {
    const r = Object.assign({ fel: 'pereche' }, masiniDin(sf.rest));
    if (sf.soferi.length === 1) r.soferId = sf.soferi[0].id;
    else if (sf.soferi.length > 1) r.ambigui = sf.soferi;
    else r.ambigui = sf.ambigui;
    return r;
  }
  if (RE_PAGINA.test(t)) return { fel: 'pagina' };
  return null;
}

module.exports = {
  ANULARE_MIN, PROPUNERE_ORE, RECENT_ZILE, TEXTE, ACOPERA,
  categoriaCeruta, acopera, acoperitoare, verdict, analiza, rezumat, propunerePereche, propunerePentru, propunereScoate,
  gata, jurnalText, pasulUrmator, caleText, nuSeSchimba, cerere, pareCerere, eDaScris, gasesteSoferi
};
