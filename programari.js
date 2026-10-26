// programari.js — Pasul 2 al Capitolului 2, partea 3 (Alin, 26.10: „6. după ce rezolvi punctele de la 1 la 5"): „RA Insight face,
// cu Da-ul tău" — REVIZIA, ACTUL și RAPORTUL PROGRAMAT. Macheta M6 din 21.10 („Două lucruri deodată, aprobate pe rând"): „Programează
// revizia la Caddy și trimite-mi în fiecare luni raportul de consum." → două cartonașe, fiecare cu „Da" / „Schimbă" / „Nu".
// RA Insight pregătește, omul apasă „Da", aplicația face pe CALEA ECRANULUI (Mentenanță › Adaugă, Documente › Adaugă, Rapoarte ›
// Programări), cu aceleași drepturi. Curat: fără bază, fără server, fără model. Aici stau înțelegerea cererii, cartonașele, ce vine
// din „Schimbă" și textele; serverul adună datele (kilometrajul, intervalele firmei, actul de acum, adresa omului) și aplică.
'use strict';
const insight = require('./insight');
const maintTypes = require('./maint_types');
const aiRaport = require('./ai_raport');
const soferiMasini = require('./soferi_masini');   // aceleași 10 minute pentru „Anulează", aceeași zi pentru o propunere veche

const KM_MIN = maintTypes.KM_MIN || 100, KM_MAX = 2000000;
const ZILE_MAX = 3660;                 // un termen mai departe de 10 ani e o greșeală de tastare
const ORA_IMPLICITA = 8;               // macheta M6: „în fiecare luni, la 8:00"
const FORMAT_IMPLICIT = 'xlsx';        // macheta M6: „Excel"
const DEST_MAX = 10, NUME_MAX = 120, DESCRIERE_MAX = 300;
const MAX_CERERI = 3;                  // „două lucruri deodată" (macheta); mai multe într-un mesaj — doar primele trei
const FRECVENTE = ['daily', 'weekly', 'monthly'];
const PERIOADE = ['yesterday', 'last7', 'last30', 'thismonth', 'lastmonth'];
const FORMATE = ['xlsx', 'pdf'];
// Cuvintele ecranului Rapoarte › Programări (aceleași etichete, ca omul să le regăsească acolo).
const ET_PERIOADA = { yesterday: 'ziua precedentă', last7: 'ultimele 7 zile', last30: 'ultimele 30 de zile', thismonth: 'luna curentă', lastmonth: 'luna precedentă' };
const ET_FRECVENTA = { daily: 'Zilnic', weekly: 'Săptămânal (luni)', monthly: 'Lunar (ziua 1)' };
const ET_FORMAT = { xlsx: 'Excel', pdf: 'PDF' };
// Perioada potrivită frecvenței, când omul n-o spune: zilnic → ziua de dinainte; săptămânal → ultimele 7 zile; lunar → luna trecută.
const PERIOADA_DIN_FRECVENTA = { daily: 'yesterday', weekly: 'last7', monthly: 'lastmonth' };

const TEXTE = {
  fondator: 'Programările cu „Da" (o revizie, un act, un raport) se fac pe flota unei firme, iar contul de fondator n-are una. Intră cu contul administratorului firmei ca să le vezi.',
  pachet: 'Propunerile cu „Da" (revizia, actul, raportul programat, alerta, șoferul pe mașină) sunt de la pachetul Basic în sus.',
  faraMasini: 'Nu văd nicio mașină la care să programez.',
  careMasina: 'Pe care mașină?',
  peCe: 'Pe ce mașină? Scrie-i numărul sau alege-o de mai jos.',
  oMasina: 'Revizia și actul se programează pe o mașină. Pe care?',
  nuVad: 'Nu văd mașina asta printre cele la care ai acces.',
  termenLipsa: 'Până când? Scrie kilometrii sau data — de exemplu „la 150.000 km" sau „pe 15.01.2027".',
  dataLipsa: 'Până când e valabil actul? Scrie data — de exemplu „expiră pe 26.10.2027".',
  dataTrecuta: 'Data e în trecut. Scrie data de la care încolo vrei termenul.',
  ceRaport: 'Ce raport să programez?',
  doua: 'Sunt două lucruri. Le aprobi pe rând:',
  trei: 'Sunt trei lucruri. Le aprobi pe rând:',
  amPregatit: 'Am pregătit programarea. Uite ce pun — apeși **Da** și o fac.',
  // Când e un singur cartonaș, începutul spune ce e: actul nu se „programează", se trece.
  unul: {
    revizie: 'Am pregătit revizia. Uite ce pun — apeși **Da** și o programez.',
    act: 'Am pregătit actul. Uite ce trec — apeși **Da** și îl trec.',
    raport: 'Am pregătit raportul programat. Uite ce pun — apeși **Da** și îl programez.'
  },
  masinaPlecata: 'Mașina nu mai e a firmei: cere din nou programarea.',
  faraEmail: 'Contul tău n-are o adresă de email: raportul se face și stă în Istoric rapoarte; o adresă o pui la „Cui", din „Schimbă".',
  dupaAnulare: {
    revizie: 'o schimbi sau o ștergi din Management › Mentenanță, ca de obicei.',
    act: 'îl schimbi sau îl ștergi din Management › Documente, ca de obicei.',
    raport: 'o oprești sau o ștergi din Rapoarte › Programări, ca de obicei.'
  }
};

function _n(t) { return insight.norm(t || ''); }
function _de(n) { const r = Math.abs(Math.round(n)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function _nr(n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); }
function _curat(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
const _FMT_ZI = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' });
const _FMT_ZI_SAPT = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long' });
const _FMT_ORA = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
// Ziua României a unei clipe: { y, m0, d }.
function _parti(ms) {
  const p = {};
  _FMT_ZI.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { y: p.year, m0: p.month - 1, d: p.day };
}
function _iso(y, m0, d) { const z = new Date(Date.UTC(y, m0, d)); return z.getUTCFullYear() + '-' + String(z.getUTCMonth() + 1).padStart(2, '0') + '-' + String(z.getUTCDate()).padStart(2, '0'); }
function _aziIso(acum) { const p = _parti(acum); return _iso(p.y, p.m0, p.d); }
// O dată din bază poate veni ca obiect Date (coloana DATE, pe ceasul serverului — UTC) sau ca text: „AAAA-LL-ZZ".
function _isoDin(v) { if (v == null || v === '') return null; if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10); return String(v).slice(0, 10); }
function _dinIso(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? { y: +m[1], m0: +m[2] - 1, d: +m[3] } : null; }
// „15.01.2027".
function ziText(iso) { const p = _dinIso(iso); return p ? String(p.d).padStart(2, '0') + '.' + String(p.m0 + 1).padStart(2, '0') + '.' + p.y : ''; }
function _zileIntre(isoA, isoB) { const a = _dinIso(isoA), b = _dinIso(isoB); return (a && b) ? Math.round((Date.UTC(b.y, b.m0, b.d) - Date.UTC(a.y, a.m0, a.d)) / 86400000) : null; }
function _plusLuni(iso, luni) { const p = _dinIso(iso); return p ? _iso(p.y, p.m0 + luni, Math.min(p.d, new Date(Date.UTC(p.y, p.m0 + luni + 1, 0)).getUTCDate())) : null; }
function _valid(y, m0, d) { const z = new Date(Date.UTC(y, m0, d)); return z.getUTCFullYear() === y && z.getUTCMonth() === m0 && z.getUTCDate() === d; }

// Numerele mașinilor („B 154 UIP") și numele lor ies din text înainte să caut cifre (kilometri, ore, zile), ca la alertă.
function _faraMasini(text, fisa) {
  let t = ' ' + _n(text) + ' ';
  const sc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  (fisa || []).forEach(function (v) {
    [v.nr, v.nume].forEach(function (x) {
      const k = _n(x).trim();
      if (k.length < 3) return;
      t = t.replace(new RegExp(sc(k).replace(/\s+/g, '\\s*'), 'g'), ' ');
    });
  });
  return t.replace(/\b[a-z]{1,2}\s?\d{2,3}\s?[a-z]{3}\b/g, ' ');
}

// ─── Data dintr-un text („pe 15.01.2027", „15 ianuarie", „peste 3 luni") ─────────────────────────────────────────────────────
// Fără an: anul de acum, dacă ziua n-a trecut; altfel anul următor. → { zi: 'AAAA-LL-ZZ' } | { zi, trecut: true } | null.
const LUNI_RE = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|sept|octombrie|noiembrie|decembrie';
const NUMERE = { o: 1, un: 1, una: 1, doua: 2, doi: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10, douasprezece: 12 };
function dataDin(text, acum, fisa) {
  const t = _faraMasini(text, fisa).replace(/\s+/g, ' ');
  const azi = _parti(acum);
  const cuAn = function (y, m0, d) {
    if (y != null) return _valid(y, m0, d) ? _iso(y, m0, d) : null;
    if (!_valid(azi.y, m0, d) && !_valid(azi.y + 1, m0, d)) return null;
    const anul = _iso(azi.y, m0, d);
    return (_valid(azi.y, m0, d) && anul >= _iso(azi.y, azi.m0, azi.d)) ? anul : (_valid(azi.y + 1, m0, d) ? _iso(azi.y + 1, m0, d) : null);
  };
  let m, zi = null;
  if ((m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/.exec(t))) zi = cuAn(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  else if ((m = new RegExp('\\b(\\d{1,2}) (' + LUNI_RE + ')(?: (\\d{4}))?\\b').exec(t))) {
    const i = insight.LUNI.indexOf(m[2]);
    zi = cuAn(m[3] ? +m[3] : null, i >= 0 ? i : 8, +m[1]);
  } else if ((m = /\b(\d{1,2})[./](\d{1,2})\b(?![./]\d)/.exec(t)) && +m[2] >= 1 && +m[2] <= 12) zi = cuAn(null, +m[2] - 1, +m[1]);
  else if ((m = /\bpeste (\d{1,3}|o|un|una|doua|doi|trei|patru|cinci|sase|sapte|opt|noua|zece|douasprezece) (zi|zile|saptamana|saptamani|luna|luni|an|ani)\b/.exec(t))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUMERE[m[1]];
    const u = m[2];
    const baza = _iso(azi.y, azi.m0, azi.d);
    if (/^zi/.test(u)) zi = _iso(azi.y, azi.m0, azi.d + n);
    else if (/^saptam/.test(u)) zi = _iso(azi.y, azi.m0, azi.d + 7 * n);
    else if (/^lun/.test(u)) zi = _plusLuni(baza, n);
    else zi = _plusLuni(baza, 12 * n);
  }
  if (!zi) return null;
  const dif = _zileIntre(_iso(azi.y, azi.m0, azi.d), zi);
  if (dif < 0) return { zi: zi, trecut: true };
  if (dif > ZILE_MAX) return null;
  return { zi: zi };
}
// Kilometrii unui termen: „la 150.000 km", „150000 km", „la 150 de mii de km".
function kmDin(text, fisa) {
  const t = _faraMasini(text, fisa);
  let m = /\b(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:de\s+)?(?:km|kilometri)\b/.exec(t);
  if (m) return parseInt(m[1].replace(/[.\s]/g, ''), 10);
  m = /\b(\d{1,4})\s*(?:de\s+)?mii\s*(?:de\s+)?(?:km|kilometri)\b/.exec(t);
  return m ? parseInt(m[1], 10) * 1000 : null;
}

// ─── Mai multe cereri într-un mesaj (macheta M6) ─────────────────────────────────────────────────────────────────────────────
// Se taie înaintea unui verb nou legat cu „și" / „apoi" / „," — „Programează revizia la Caddy și trimite-mi în fiecare luni
// raportul de consum" → două bucăți, fiecare cu mașina ei (raportul de consum nu ia „Caddy" din prima bucată).
const VERBE = '(?:te rog\\s+)?(?:programeaz[aă]|programeaz[aă]-mi|pune|pune-mi|trimite|trimite-mi|f[aă]|f[aă]-mi|adaug[aă]|adaug[aă]-mi|treci|trece|noteaz[aă]|noteaz[aă]-mi|vreau|a[sș] vrea|seteaz[aă]|planific[aă]|am f[aă]cut|am luat|am pl[aă]tit|am re[iî]nnoit)';
// ⚠ Fără `\b` lângă litere românești: JavaScript socotește „ș", „ă" semne, nu litere (vezi CLAUDE.md, „Diacriticele").
function bucati(text) {
  const s = String(text || '').trim();
  const re = new RegExp('(?:\\s*[,;]\\s*|\\s+(?:și|si|apoi)\\s+)(?=' + VERBE + '(?=[\\s,.!?]|$))', 'gi');
  return s.split(re).map(function (x) { return x.trim(); }).filter(Boolean);
}

// ─── Ce cere omul ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const RE_INTREBARE = /\?|^\s*(cand|ce|cat|cate|care|cine|unde|de ce|oare|exista|mai am|mai are|trebuie sa stiu)\b/;
const RE_VERB_PROG = /\b(programeaza|programeaza-mi|programati|programez|planifica|planifica-mi|pune|pune-mi|adauga|adauga-mi|noteaza|noteaza-mi|treci|trece|seteaza|seteaza-mi|fa-mi|vreau|as vrea|imi trebuie|trebuie sa (fac|facem|faca))\b/;
const RE_TRECUT_FACUT = /\b(am|a|au|ai|ati) (facut|schimbat|dus|programat|pus|terminat)\b/;
// Lucrările de service: cuvântul omului → tipul din Mentenanță (maint_types.WORK). Uleiul înaintea reviziei („revizia de ulei").
const LUCRARI = [
  ['Schimb ulei + filtru', /\b(schimb(ul)? (de )?ulei\w*|uleiul|ulei)\b/],
  ['Revizie generală', /\b(revizi\w*|service-ul|serviceul|service|servis\w*)\b/],
  ['Plăcuțe/discuri frână', /\b(placut\w*|discuri\w*|frane\w*|franele)\b/],
  ['Distribuție', /\bdistributi\w*\b/],
  ['Ambreiaj', /\bambreiaj\w*\b/],
  ['Amortizoare', /\bamortizo\w*\b/],
  ['Anvelope', /\b(anvelop\w*|cauciuc\w*|pneur\w*)\b/],
  ['Geometrie', /\bgeometri\w*\b/],
  ['Filtre (aer/polen/comb.)', /\bfiltr(e|ele|ul)\b/],
  ['Baterie', /\b(bateri\w*|acumulator\w*)\b/],
  ['Antigel/lichide', /\b(antigel\w*|lichidele|lichide)\b/],
  ['Curea accesorii', /\bcure(a|aua)\b/],
  ['Sistem de răcire', /\b(racire\w*|radiator\w*)\b/],
  ['Spălare / curățenie', /\b(spalat\w*|spalare\w*|curatenie)\b/]
];
// Cum spune cartonașul lucrarea în titlu: „Programez revizia la B 268 ROY".
const ARTICULAT = {
  'Schimb ulei + filtru': 'schimbul de ulei', 'Revizie generală': 'revizia', 'Plăcuțe/discuri frână': 'frânele', 'Distribuție': 'distribuția',
  'Ambreiaj': 'ambreiajul', 'Amortizoare': 'amortizoarele', 'Anvelope': 'anvelopele', 'Geometrie': 'geometria', 'Filtre (aer/polen/comb.)': 'filtrele',
  'Baterie': 'bateria', 'Antigel/lichide': 'lichidele', 'Curea accesorii': 'cureaua', 'Sistem de răcire': 'răcirea', 'Spălare / curățenie': 'spălarea'
};
// Actele (maint_types.DOCS): cuvântul omului → tipul din Documente.
const ACTE = [
  ['ITP', /\b(itp(-ul|ul)?|inspecti\w* tehnic\w*)\b/],
  ['RCA', /\b(rca(-ul|ul)?|asigurare\w* (rca|obligatori\w*))\b/],
  ['CASCO', /\bcasco(-ul|ul)?\b/],
  ['Rovinietă', /\b(rovinie?t\w*|rovigneta)\b/],
  ['Licență transport', /\blicent\w*\b/],
  ['Tahograf', /\b(verificar\w* tahograf\w*|tahograf\w*)\b/],
  ['Asigurare marfă', /\b(asigurar\w* (de |pentru )?marf\w*|cmr)\b/]
];
const RE_ACT_VERB = /\b(trece|treci|pune|pune-mi|adauga|adauga-mi|noteaza|noteaza-mi|programeaza|programeaza-mi|actualizeaza|inregistreaza|seteaza|am facut|am luat|am platit|am reinnoit|am innoit|am prelungit|am schimbat|s-a facut|s-a luat|s-a platit|s-a reinnoit|e valabil|este valabil|valabil|valabila|expira|expira pe)\b/;
const RE_FRECV = {
  daily: /\b(zilnic|zilnica|zilnice|in fiecare zi|in fiecare dimineata|in fiecare seara|zi de zi|in toate zilele|la fiecare zi)\b/,
  weekly: /\b(saptamanal|saptamanala|saptamanale|in fiecare saptamana|o data pe saptamana|la fiecare saptamana|in fiecare luni|luni de luni|in fiecare (marti|miercuri|joi|vineri|sambata|duminica))\b/,
  monthly: /\b(lunar|lunara|lunare|in fiecare luna|o data pe luna|la fiecare luna|pe (1|intai) ale (fiecarei )?luni|la inceputul (fiecarei )?luni)\b/
};
const RE_ZI_SAPT = /\bin fiecare (marti|miercuri|joi|vineri|sambata|duminica)\b/;
const RE_PROGRAM_RAPORT = /\bprogram\w*\b[^.?!]{0,50}\braport\w*|\braport\w*[^.?!]{0,50}\bprogram\w*/;
const RE_RAPORT = /\braport\w*\b/;

function _masina(text, fisa) {
  const g = insight.gasesteInText(text, fisa || []);
  const dinGrupe = [];
  (g.grupe || []).forEach(function (gr) { (gr.masini || []).forEach(function (v) { if (!dinGrupe.some(function (z) { return z.imei === v.imei; })) dinGrupe.push(v); }); });
  const toate = g.masini.concat(dinGrupe.filter(function (v) { return !g.masini.some(function (z) { return z.imei === v.imei; }); }));
  if (toate.length === 1) return { imei: toate[0].imei };
  if (toate.length > 1) return { variante: toate.slice(0, 8) };
  if (g.ambigue && g.ambigue.length) return { variante: g.ambigue[0].variante.slice(0, 8) };
  return {};
}
const RE_FLOTA = /\b(toata flota|toate masinile|toate vehiculele|fiecare masina|flotei|flota)\b/;

// O revizie: verbul de programare + o lucrare de service; nu o întrebare, nu „am făcut revizia" (făcută deja).
function cerereRevizie(text, fisa, acum) {
  const t = _n(text);
  if (RE_INTREBARE.test(t) || RE_TRECUT_FACUT.test(t) || RE_RAPORT.test(t)) return null;
  if (!RE_VERB_PROG.test(t)) return null;
  const l = LUCRARI.filter(function (x) { return x[1].test(t); })[0];
  if (!l) return null;
  const r = { fel: 'revizie', tip: l[0], km: kmDin(text, fisa) };
  const d = dataDin(text, acum, fisa);
  if (d && d.trecut) r.dataTrecuta = d.zi; else if (d) r.data = d.zi;
  if (r.km != null && !(r.km >= KM_MIN && r.km <= KM_MAX)) r.km = null;
  Object.assign(r, RE_FLOTA.test(t) && !_masina(text, fisa).imei ? { flota: true } : _masina(text, fisa));
  if (!r.imei && !r.variante && !r.flota) r.lipsa = 'masina';
  return r;
}
// Un act: numele actului + verbul (sau „am făcut / am plătit", „expiră pe …", „valabil până pe …"). Data = până când e valabil.
function cerereAct(text, fisa, acum) {
  const t = _n(text);
  if (RE_INTREBARE.test(t) || RE_RAPORT.test(t)) return null;
  const a = ACTE.filter(function (x) { return x[1].test(t); })[0];
  if (!a) return null;
  const d = dataDin(text, acum, fisa);
  if (!RE_ACT_VERB.test(t) && !d) return null;
  if (/\b(anunta|avertizeaza|alerteaza|notifica)-ma\b/.test(t)) return null;   // „anunță-mă când expiră ITP-ul" = o alertă
  const r = { fel: 'act', tip: a[0] };
  if (d && d.trecut) r.dataTrecuta = d.zi; else if (d) r.data = d.zi; else r.lipsaData = true;
  Object.assign(r, RE_FLOTA.test(t) && !_masina(text, fisa).imei ? { flota: true } : _masina(text, fisa));
  if (!r.imei && !r.variante && !r.flota) r.lipsa = 'masina';
  return r;
}
// Un raport programat: un raport (cuvântul „raport" sau un nume tare) + cât de des („în fiecare luni", „zilnic", „lunar") sau
// „programează raportul…". O cerere de raport pe loc („fă-mi raportul de consum pe săptămâna trecută") NU e de-a ei.
function cerereRaport(text, fisa) {
  const t = _n(text);
  if (RE_INTREBARE.test(t)) return null;
  const nume = aiRaport.numeRaportDin(t);
  if (!RE_RAPORT.test(t) && !(nume && nume.tare)) return null;
  const frecventa = FRECVENTE.filter(function (f) { return RE_FRECV[f].test(t); })[0] || null;
  if (!frecventa && !RE_PROGRAM_RAPORT.test(t)) return null;
  const r = { fel: 'raport', tip: nume ? nume.raport : null, frecventa: frecventa || 'weekly', perioada: null, ora: null, format: null, dest: [] };
  r.perioada = PERIOADA_DIN_FRECVENTA[r.frecventa];
  if (/\b(ziua precedenta|ziua de ieri|pe ieri)\b/.test(t)) r.perioada = 'yesterday';
  else if (/\bultimele 7 zile\b|\bsaptamana trecuta\b/.test(t)) r.perioada = 'last7';
  else if (/\bultimele 30 (de )?zile\b/.test(t)) r.perioada = 'last30';
  else if (/\bluna (curenta|asta|aceasta)\b/.test(t)) r.perioada = 'thismonth';
  else if (/\bluna trecuta\b|\bluna precedenta\b/.test(t)) r.perioada = 'lastmonth';
  const z = RE_ZI_SAPT.exec(t); if (z) r.ziAlta = z[1];
  const fm = _faraMasini(text, fisa);
  const o = /\b(?:la|pe la|in jur de|de la)\s+(?:ora\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(dimineata|seara|dupa-amiaza|dupa amiaza)?\b/.exec(fm);
  if (o) { let h = +o[1]; if (o[3] && o[3] !== 'dimineata' && h < 12) h += 12; if (h >= 0 && h <= 23) r.ora = h; }
  if (/\bpdf\b/.test(t)) r.format = 'pdf'; else if (/\b(excel|xlsx|xls)\b/.test(t)) r.format = 'xlsx';
  r.dest = adreseDin(text);
  const mm = _masina(text, fisa);
  if (mm.imei && !RE_FLOTA.test(t)) r.imei = mm.imei; else if (mm.variante) r.variante = mm.variante;
  return r;
}
function adreseDin(text) {
  const out = [], vazut = new Set();
  (String(text || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).forEach(function (a) {
    const k = a.toLowerCase(); if (!vazut.has(k)) { vazut.add(k); out.push(a); }
  });
  return out.slice(0, DEST_MAX);
}
// Toate cererile dintr-un mesaj, în ordinea scrisă. Raportul întâi (are cuvinte tari), apoi actul, apoi revizia.
function pareCerere(text) { return cereri(text, [], Date.now()).length > 0; }
// „Notează că am vorbit cu Ion despre frâne" e o discuție (partea 2), nu o revizie la frâne: nu e de-a ei.
const RE_DISCUTIE = /\b(am vorbit|am discutat|vorbit cu|discutat cu|discutia cu|discutie cu)\b/;
function cereri(text, fisa, acum) {
  const out = [];
  if (RE_DISCUTIE.test(_n(text))) return out;
  bucati(text).forEach(function (b) {
    if (out.length >= MAX_CERERI) return;
    const c = cerereRaport(b, fisa) || cerereAct(b, fisa, acum) || cerereRevizie(b, fisa, acum);
    if (c) { c.text = b; out.push(c); }
  });
  return out;
}

// ─── Textele cartonașelor ───────────────────────────────────────────────────────────────────────────────────────────────────
function textTermen(km, data) {
  if (km && data) return 'la ' + _nr(km) + ' km sau pe ' + ziText(data) + ', ce vine întâi';
  if (km) return 'la ' + _nr(km) + ' km';
  if (data) return 'pe ' + ziText(data);
  return '';
}
function _durata(luni) {
  const n = parseInt(luni, 10) || 0;
  if (!n) return '';
  if (n === 1) return 'o lună';
  if (n < 12 || n % 12 !== 0) return n + _de(n) + 'luni';
  const a = n / 12;
  return a === 1 ? 'un an' : a + _de(a) + 'ani';
}
// „pe la jumătatea lui ianuarie" (anul doar dacă nu e cel de acum).
function candAjunge(iso, acum) {
  const p = _dinIso(iso); if (!p) return '';
  const an = _parti(acum).y;
  const parte = p.d <= 10 ? 'pe la începutul lui ' : (p.d <= 20 ? 'pe la jumătatea lui ' : 'pe la sfârșitul lui ');
  return parte + insight.LUNI[p.m0] + (p.y !== an ? ' ' + p.y : '');
}
// Termenul propus pentru o revizie: ce a scris omul; altfel intervalul lucrării pe felul mașinii (ca fereastra din Mentenanță:
// kilometrajul de acum + km-ii intervalului, azi + lunile lui).
function termenPropus(o) {
  const km = o.km != null ? o.km : (o.interval && o.interval.km && o.odo ? o.odo + o.interval.km : null);
  const data = o.data || (o.interval && o.interval.months ? _plusLuni(_aziIso(o.acum), o.interval.months) : null);
  return { km: km, data: data, dinInterval: o.km == null && !o.data && !!(km || data) };
}
// o = { tip, imei, nr, eticheta, km?, data?, interval, clasa ({ art, low }), odo, kmLuna, lead: { days, km }, existente: [{ due_km, due_date }],
//       tipuri, poate, aproba, cine, acum }
function cardRevizie(o) {
  const tp = termenPropus(o);
  const randuri = [{ l: 'Lucrarea', v: o.tip, b: true }, { l: 'Termen', v: textTermen(tp.km, tp.data) }];
  let acumT = '';
  if (o.odo) {
    acumT = _nr(o.odo) + ' km';
    if (o.kmLuna > 0) {
      acumT += ' · merge cam ' + _nr(Math.round(o.kmLuna / 100) * 100 || o.kmLuna) + ' km pe lună';
      if (tp.km && tp.km > o.odo) {
        const luni = (tp.km - o.odo) / o.kmLuna;
        if (luni <= 120) acumT += ', deci ajunge acolo ' + candAjunge(_iso(_parti(o.acum).y, _parti(o.acum).m0, _parti(o.acum).d + Math.round(luni * 30.4)), o.acum);
      }
    }
  } else if (tp.km) acumT = 'Aplicația nu are kilometrajul mașinii: termenul pe km se urmărește când îl are.';
  if (acumT) randuri.push({ l: 'Acum', v: acumT });
  const dov = [];
  if (tp.dinInterval && o.interval) {
    const cl = o.clasa || { art: 'o', low: 'mașină' };
    let iv = 'La ' + cl.art + ' ' + cl.low + ', „' + o.tip + '" se face ';
    if (o.interval.km && o.interval.months) iv += 'la fiecare ' + _nr(o.interval.km) + ' km sau la ' + _durata(o.interval.months) + ', ce vine întâi';
    else if (o.interval.km) iv += 'la fiecare ' + _nr(o.interval.km) + ' km';
    else iv += 'o dată la ' + _durata(o.interval.months);
    dov.push({ nivel: 'i', text: iv + ' — de acolo termenul (îl potrivești din „Schimbă").' });
  }
  if (o.odo && tp.km && tp.km <= o.odo) dov.push({ nivel: 'w', text: 'Mașina a trecut deja de ' + _nr(tp.km) + ' km (are ' + _nr(o.odo) + '): revizia ar fi depășită de la început.' });
  const L = o.lead || {};
  dov.push({ nivel: 'i', text: 'Îți amintește cu ' + (L.days || 14) + _de(L.days || 14) + 'zile sau ' + _nr(L.km || 500) + ' km înainte, ca la toate reviziile.' });
  (o.existente || []).slice(0, 1).forEach(function (e) {
    dov.push({ nivel: 'w', text: 'Pe ' + (o.nr || 'mașina asta') + ' e deja programată „' + o.tip + '"' + (e.due_km || e.due_date ? ' ' + textTermen(e.due_km, _isoDin(e.due_date)) : '') + '. O nouă intrare stă lângă ea, în Mentenanță.' });
  });
  return {
    fel: 'revizie', ic: 'fa-screwdriver-wrench', titlu: 'Programez ' + (ARTICULAT[o.tip] || '„' + o.tip + '"') + ' la ' + (o.nr || o.eticheta || 'mașina aleasă'),
    randuri: randuri,
    campuri: { imei: String(o.imei || ''), tip: o.tip, km: tp.km || '', data: tp.data || '', tipuri: (o.tipuri || maintTypes.WORK.map(function (w) { return w.type; })), kmMin: KM_MIN, kmMax: KM_MAX,
      interval: o.interval || null, odo: o.odo || null },
    dovezi: dov,
    sub: o.poate ? 'Se face exact ca din Management › Mentenanță › Adaugă, cu drepturile tale. În jurnal: „' + (o.cine || 'tu') + ', prin RA Insight”. Se poate anula ' + soferiMasini.ANULARE_MIN + ' minute.'
      : 'Doar cine poate schimba mentenanța apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: 'Da, programează', poate: !!o.poate
  };
}
// „Schimbă" pe revizie: lucrarea din listă, km (întreg, între limite) și / sau data (de azi încolo); cel puțin una.
function campuriRevizie(cerute, card, acum) {
  const c = card && card.campuri ? card.campuri : {};
  const q = cerute || {};
  const tip = q.tip != null && String(q.tip).trim() ? String(q.tip).trim() : c.tip;
  if ((c.tipuri || []).indexOf(tip) < 0) return { eroare: 'Alege lucrarea din listă.' };
  const kmS = q.km != null ? String(q.km).replace(/[.\s]/g, '').trim() : String(c.km || '');
  const km = kmS === '' ? null : Number(kmS);
  if (km != null && !(Number.isInteger(km) && km >= KM_MIN && km <= KM_MAX)) return { eroare: 'Kilometrii trebuie să fie un număr întreg între ' + _nr(KM_MIN) + ' și ' + _nr(KM_MAX) + '.' };
  const data = q.data != null ? String(q.data).trim() : String(c.data || '');
  if (data && !_dinIso(data)) return { eroare: 'Data nu e bună.' };
  if (data && _zileIntre(_aziIso(acum || Date.now()), data) < 0) return { eroare: TEXTE.dataTrecuta };
  if (!km && !data) return { eroare: 'Pune măcar kilometrii sau data.' };
  // Intervalul lucrării rămâne pe rând (ca în fereastra din Mentenanță): la bifarea „făcută", următoarea scadență se pune singură.
  const iv = tip === c.tip ? (c.interval || null) : null;
  return { spec: { imei: c.imei, type: tip, due_km: km, due_date: data || null, status: 'pending', interval_km: iv && iv.km ? iv.km : null, interval_months: iv && iv.months ? iv.months : null, description: 'Programată prin RA Insight' } };
}
function cardRevizieDupa(card, spec) {
  const c = Object.assign({}, card);
  c.randuri = [{ l: 'Lucrarea', v: spec.type, b: true }, { l: 'Termen', v: textTermen(spec.due_km, spec.due_date) }].concat((card.randuri || []).filter(function (r) { return r.l === 'Acum'; }));
  c.titlu = 'Programez ' + (ARTICULAT[spec.type] || '„' + spec.type + '"') + ' la ' + String(card.titlu || '').split(' la ').slice(1).join(' la ');
  return c;
}
function gataRevizie(spec, nr, cine, ms) {
  return {
    text: 'Gata. **' + spec.type + '** la ' + nr + ' e în Mentenanță, ' + textTermen(spec.due_km, spec.due_date) + '.',
    jurnal: 'În jurnal: „' + (cine || 'tu') + ', prin RA Insight: ' + spec.type + ' la ' + nr + '” · ' + ziText(_aziIso(ms)) + ', ' + _FMT_ORA.format(new Date(ms)) + '.',
    buton: { fel: 'ecran', ecran: 'maintenance', text: 'Vezi în Mentenanță', ic: 'fa-screwdriver-wrench' }
  };
}
function jurnalRevizie(spec, nr) { return spec.type + ' la ' + nr + ', ' + textTermen(spec.due_km, spec.due_date); }
function anulareRevizie(spec, nr, era) { return era ? 'Am anulat: „' + spec.type + '" la ' + nr + ' nu mai e în Mentenanță.' : 'Lucrarea nu mai era în Mentenanță (ștearsă sau bifată între timp): n-am avut ce anula.'; }

// Actul: o = { tip, imei, nr, data, actual: { id, expiry_date } | null, leadZile, tipuri, poate, aproba, cine, acum }
function cardAct(o) {
  const meta = maintTypes.docMeta ? maintTypes.docMeta(o.tip) : null;
  const randuri = [{ l: 'Actul', v: o.tip, b: true }, { l: 'Valabil până pe', v: ziText(o.data) }];
  const exp = o.actual ? _isoDin(o.actual.expiry_date) : null;
  randuri.push({ l: 'Acum', v: o.actual ? ('trecut ' + (exp ? 'până pe ' + ziText(exp) : 'fără dată de expirare') + ' — trece în istoricul mașinii, ca la orice reînnoire') : 'nu e trecut în aplicație' });
  const dov = [];
  const zile = _zileIntre(_aziIso(o.acum), o.data);
  const lead = o.leadZile || 30;
  if (zile != null && zile <= lead) dov.push({ nivel: 'w', text: 'Expiră în ' + zile + _de(zile) + 'zile: îl vezi de azi cu galben în Documente.' });
  dov.push({ nivel: 'i', text: 'Îți amintește cu ' + lead + _de(lead) + 'zile înainte să expire, ca la toate actele.' });
  return {
    fel: 'act', ic: (meta && meta.icon) || 'fa-file-contract', titlu: 'Trec ' + o.tip + (/^[A-Z]{2,5}$/.test(o.tip) ? '-ul' : '') + ' la ' + (o.nr || 'mașina aleasă'),
    randuri: randuri,
    campuri: { imei: String(o.imei || ''), tip: o.tip, data: o.data || '', tipuri: o.tipuri || maintTypes.DOCS.slice() },
    dovezi: dov,
    sub: o.poate ? 'Se face exact ca din Management › Documente › Adaugă, cu drepturile tale. În jurnal: „' + (o.cine || 'tu') + ', prin RA Insight”. Se poate anula ' + soferiMasini.ANULARE_MIN + ' minute.'
      : 'Doar cine poate schimba documentele apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: 'Da, trec actul', poate: !!o.poate
  };
}
function campuriAct(cerute, card, acum) {
  const c = card && card.campuri ? card.campuri : {};
  const q = cerute || {};
  const tip = q.tip != null && String(q.tip).trim() ? String(q.tip).trim() : c.tip;
  if ((c.tipuri || []).indexOf(tip) < 0) return { eroare: 'Alege actul din listă.' };
  const data = q.data != null ? String(q.data).trim() : String(c.data || '');
  if (!_dinIso(data)) return { eroare: 'Scrie data până la care e valabil actul.' };
  if (_zileIntre(_aziIso(acum || Date.now()), data) < 0) return { eroare: TEXTE.dataTrecuta };
  return { spec: { imei: c.imei, doc_type: tip, expiry_date: data, notes: 'Trecut prin RA Insight' } };
}
function cardActDupa(card, spec) {
  const c = Object.assign({}, card);
  c.randuri = [{ l: 'Actul', v: spec.doc_type, b: true }, { l: 'Valabil până pe', v: ziText(spec.expiry_date) }].concat((card.randuri || []).filter(function (r) { return r.l === 'Acum'; }));
  return c;
}
function gataAct(spec, nr, cine, ms) {
  return {
    text: 'Gata. **' + spec.doc_type + '** la ' + nr + ' e în Documente, valabil până pe ' + ziText(spec.expiry_date) + '.',
    jurnal: 'În jurnal: „' + (cine || 'tu') + ', prin RA Insight: ' + spec.doc_type + ' la ' + nr + '” · ' + ziText(_aziIso(ms)) + ', ' + _FMT_ORA.format(new Date(ms)) + '.',
    buton: { fel: 'ecran', ecran: 'documente', text: 'Vezi în Documente', ic: 'fa-file-contract' }
  };
}
function jurnalAct(spec, nr) { return spec.doc_type + ' la ' + nr + ', valabil până pe ' + ziText(spec.expiry_date); }
function anulareAct(spec, nr, era, repus) {
  if (!era) return 'Actul nu mai era în Documente (schimbat sau șters între timp): n-am avut ce anula.';
  return 'Am anulat: ' + spec.doc_type + ' la ' + nr + ' a ieșit din Documente' + (repus ? ', iar cel de dinainte e iar cel valabil.' : '.');
}

// Raportul programat: o = { tip, label, imei, eticheta, frecventa, ora, perioada, format, dest: [adrese scrise], email (al omului),
//   agendaN, primul (ms), ziAlta, optiuni: [{ v, t }], poate, aproba, cine }
function textCand(frecventa, ora) {
  const h = (ora != null ? ora : ORA_IMPLICITA) + ':00';
  if (frecventa === 'daily') return 'în fiecare zi, la ' + h;
  if (frecventa === 'monthly') return 'pe 1 ale fiecărei luni, la ' + h;
  return 'în fiecare luni, la ' + h;
}
function textCui(dest, email, format, agendaN) {
  const lista = (dest && dest.length) ? dest : (email ? [email] : []);
  let s = lista.length ? lista.slice(0, 3).join(', ') + (lista.length > 3 ? ' și încă ' + (lista.length - 3) : '') : 'nicio adresă (doar în Istoric rapoarte)';
  if (agendaN > 0) s += ' + ' + (agendaN === 1 ? 'o adresă' : agendaN + _de(agendaN) + 'adrese') + ' din agenda firmei';
  return s + ' · ' + (ET_FORMAT[format] || ET_FORMAT[FORMAT_IMPLICIT]);
}
function textPrimul(ms) { if (!ms) return ''; const p = _parti(ms); return _FMT_ZI_SAPT.format(new Date(ms)) + ', ' + p.d + '.' + String(p.m0 + 1).padStart(2, '0') + '.' + p.y; }
function numeProgramare(label, eticheta, frecventa) { return _curat(label + ' · ' + (eticheta || 'toată flota') + ' · ' + (ET_FRECVENTA[frecventa] || '').toLowerCase().replace(/ \(.*\)$/, ''), NUME_MAX); }
function cardRaport(o) {
  const format = o.format || FORMAT_IMPLICIT, ora = o.ora != null ? o.ora : ORA_IMPLICITA;
  const randuri = [
    { l: 'Ce', v: o.label + ' · ' + (o.eticheta || 'toată flota') + ' · ' + ET_PERIOADA[o.perioada] },
    { l: 'Când', v: textCand(o.frecventa, ora) },
    { l: 'Cui', v: textCui(o.dest, o.email, format, o.agendaN) },
    { l: 'Primul', v: textPrimul(o.primul) }
  ];
  const dov = [];
  if (o.ziAlta) dov.push({ nivel: 'i', text: 'Rapoartele săptămânale pleacă lunea (așa merg programările din aplicație), nu ' + o.ziAlta + '.' });
  if (!(o.dest && o.dest.length) && !o.email) dov.push({ nivel: 'w', text: TEXTE.faraEmail });
  dov.push({ nivel: 'i', text: 'Fiecare raport intră și în Istoric rapoarte, ca orice raport programat.' });
  return {
    fel: 'raport', ic: 'fa-file-lines', titlu: 'Programez raportul ' + o.label,
    randuri: randuri,
    campuri: { tip: o.tip, label: o.label, imei: String(o.imei || ''), frecventa: o.frecventa, ora: ora, perioada: o.perioada, format: format, dest: (o.dest || []).join(', '),
      email: o.email || '', optiuni: o.optiuni || [], frecvente: FRECVENTE.map(function (f) { return { v: f, t: ET_FRECVENTA[f] }; }),
      perioade: PERIOADE.map(function (p) { return { v: p, t: ET_PERIOADA[p].charAt(0).toUpperCase() + ET_PERIOADA[p].slice(1) }; }), formate: FORMATE.map(function (f) { return { v: f, t: ET_FORMAT[f] }; }) },
    dovezi: dov,
    sub: o.poate ? 'Se face exact ca din Rapoarte › Programări, cu drepturile tale. În jurnal: „' + (o.cine || 'tu') + ', prin RA Insight”. Se poate anula ' + soferiMasini.ANULARE_MIN + ' minute.'
      : 'Doar cine vede rapoartele apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: 'Da, programează', poate: !!o.poate
  };
}
// „Schimbă" pe raport: frecvența, ora, perioada, formatul, adresele, mașina — toate din listele de pe cartonaș.
function campuriRaport(cerute, card) {
  const c = card && card.campuri ? card.campuri : {};
  const q = cerute || {};
  const ia = function (k) { return q[k] != null ? q[k] : c[k]; };
  const frecventa = String(ia('frecventa')), perioada = String(ia('perioada')), format = String(ia('format'));
  if (FRECVENTE.indexOf(frecventa) < 0) return { eroare: 'Alege cât de des.' };
  if (PERIOADE.indexOf(perioada) < 0) return { eroare: 'Alege perioada.' };
  if (FORMATE.indexOf(format) < 0) return { eroare: 'Alege formatul.' };
  const ora = Number(ia('ora'));
  if (!(Number.isInteger(ora) && ora >= 0 && ora <= 23)) return { eroare: 'Ora trebuie să fie între 0 și 23.' };
  const imei = String(ia('imei') == null ? '' : ia('imei'));
  if (imei && !(c.optiuni || []).some(function (x) { return String(x.v) === imei; })) return { eroare: 'Alege mașina din listă.' };
  const scrise = String(ia('dest') == null ? '' : ia('dest')).split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (scrise.length > DEST_MAX) return { eroare: 'Cel mult ' + DEST_MAX + ' adrese.' };
  const rele = scrise.filter(function (a) { return !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a); });
  if (rele.length) return { eroare: 'Adresa „' + rele[0].slice(0, 60) + '" nu e bună.' };
  const opt = (c.optiuni || []).filter(function (x) { return String(x.v) === imei; })[0];
  return { spec: { report_type: c.tip, imei: imei || null, period: perioada, frequency: frecventa, hour: ora, format: format, recipients: scrise.join(', '),
    name: numeProgramare(c.label, imei && opt ? opt.scurt || opt.t : null, frecventa) }, eticheta: imei && opt ? (opt.scurt || opt.t) : null };
}
function cardRaportDupa(card, c, primul) {
  const k = Object.assign({}, card), s = c.spec;
  k.randuri = [
    { l: 'Ce', v: (card.campuri && card.campuri.label) + ' · ' + (c.eticheta || 'toată flota') + ' · ' + ET_PERIOADA[s.period] },
    { l: 'Când', v: textCand(s.frequency, s.hour) },
    { l: 'Cui', v: textCui(s.recipients ? s.recipients.split(/,\s*/) : [], card.campuri && card.campuri.email, s.format, card.campuri && card.campuri.agendaN) },
    { l: 'Primul', v: textPrimul(primul) }
  ];
  return k;
}
function gataRaport(spec, label, primul, cine, ms) {
  return {
    text: 'Gata. Raportul **' + label + '** pleacă ' + textCand(spec.frequency, spec.hour) + '; primul, ' + textPrimul(primul) + '.',
    jurnal: 'În jurnal: „' + (cine || 'tu') + ', prin RA Insight: raportul ' + label + ' programat” · ' + ziText(_aziIso(ms)) + ', ' + _FMT_ORA.format(new Date(ms)) + '.',
    buton: { fel: 'programate', text: 'Vezi în Programări', ic: 'fa-clock' }
  };
}
function jurnalRaport(spec, label) { return 'raportul ' + label + ', ' + textCand(spec.frequency, spec.hour); }
function anulareRaport(label, era) { return era ? 'Am anulat: raportul ' + label + ' nu mai e programat.' : 'Programarea nu mai era în Rapoarte › Programări: n-am avut ce anula.'; }
function dupaAnulare(fel) { return TEXTE.dupaAnulare[fel] || ''; }
// Cererea scrisă de un buton de alegere (o mașină dintre mai multe): aceeași formă pe care o înțelege `cereri`.
function cerereText(c, nr) {
  if (!c) return '';
  if (c.fel === 'revizie') return 'Programează ' + (ARTICULAT[c.tip] || c.tip) + ' la ' + nr + (c.km ? ' la ' + _nr(c.km) + ' km' : '') + (c.data ? ' pe ' + ziText(c.data) : '');
  if (c.fel === 'act') return 'Trece ' + c.tip + ' la ' + nr + (c.data ? ', valabil până pe ' + ziText(c.data) : '');
  return String(c.text || '') + ' pentru ' + nr;
}

module.exports = {
  KM_MIN, KM_MAX, ORA_IMPLICITA, FORMAT_IMPLICIT, FRECVENTE, PERIOADE, FORMATE, ET_PERIOADA, ET_FRECVENTA, ET_FORMAT, PERIOADA_DIN_FRECVENTA, TEXTE, LUCRARI, ACTE, ARTICULAT, MAX_CERERI,
  bucati, cereri, pareCerere, cerereRevizie, cerereAct, cerereRaport, dataDin, kmDin, adreseDin, ziText, textTermen, candAjunge, termenPropus,
  cardRevizie, campuriRevizie, cardRevizieDupa, gataRevizie, jurnalRevizie, anulareRevizie,
  cardAct, campuriAct, cardActDupa, gataAct, jurnalAct, anulareAct,
  textCand, textCui, textPrimul, numeProgramare, cardRaport, campuriRaport, cardRaportDupa, gataRaport, jurnalRaport, anulareRaport,
  dupaAnulare, cerereText
};
