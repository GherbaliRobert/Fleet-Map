// asistent_fondatori.js — asistentul fondatorilor, etapa 1, pasul 2 (Alin, 30.10: „2. da" — caseta „Întreabă orice", ca în macheta
// „tot un chat", https://claude.ai/artifact/UjazZMNJ9FctMXq7KRfffw). Două drumuri, ca la RA Insight:
//   • PE LOC (insigna „Instant"): întrebările obișnuite ale fondatorilor — cine e restant, încasările, montajele, contractele care
//     expiră sau stau nesemnate, stocul, cererile, ce e de facturat, aparatele fără firmă, starea firmelor, venitul lunar —
//     înțelese pe reguli (`intelege`) și scrise aici (`raspunde`): titlul, tabelul, o frază, butoanele spre ecranul potrivit și de
//     unde sunt cifrele. Fără model, fără cost.
//   • MODELUL (insigna „Analiză"): restul — instrucțiunile (`instructiuni`) și uneltele (`UNELTE`), care citesc ACELEAȘI date.
// Curat: fără bază și fără server. Datele le adună serverul (`_asfDate`), cu socotelile care există deja (neplata, contractele,
// calendarul de montaj, stocul, venitul lunar), și le dă aici. Pagina doar desenează ce primește (textele, ca TEXT).
'use strict';
const I = require('./insight');
const AR = require('./ai_raport');
const C = require('./cifre');
const { numar } = require('./contracts');

const TZ = 'Europe/Bucharest';
const ZI = 86400000;
// Formatatoarele, ținute minte (nu unul la fiecare rând — verify_formatoare.js le numără).
const _fmtParti = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const _fmtZiSapt = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' });
const _fmtData = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

// Câte rânduri are cel mult un tabel pe ecran (restul: „și încă N").
const MAX_RANDURI = 10;
// O întrebare mai lungă decât atât e a modelului, chiar dacă pomenește un subiect cunoscut („fă-mi un rezumat al încasărilor pe
// trei luni, comparat cu costurile"): regulile răspund la întrebările scurte, obișnuite.
const MAX_CUVINTE_PE_LOC = 14;
// „Contracte care expiră", fără perioadă: următoarele 90 de zile.
const ZILE_CONTRACTE = 90;

// Întrebările gata făcute de sub „Azi la noi" (macheta): un clic și pleacă, ca una scrisă. `ic` = iconița pastilei (chatul inteligent, 02.11).
const INTREBARI_GATA = [
  { text: 'Cine e restant?', trimite: 'Cine e restant?', ic: 'fa-coins' },
  { text: 'Încasări luna asta', trimite: 'Încasări luna asta', ic: 'fa-chart-column' },
  { text: 'Montaje săptămâna asta', trimite: 'Montaje săptămâna asta', ic: 'fa-calendar-days' }
];
// Perioadele din „+" › Perioada: se pun în casetă cum le scrie omul, iar regulile de mai jos le înțeleg (proba le citește pe toate).
const PERIOADE = [
  { text: 'Azi', pune: 'azi' }, { text: 'Mâine', pune: 'mâine' }, { text: 'Săptămâna asta', pune: 'săptămâna asta' },
  { text: 'Săptămâna viitoare', pune: 'săptămâna viitoare' }, { text: 'Luna asta', pune: 'luna asta' },
  { text: 'Luna trecută', pune: 'luna trecută' }, { text: 'Luna viitoare', pune: 'luna viitoare' }
];

// De unde vin cifrele fiecărui subiect (insigna, rândul „✓" și butonul spre ecran).
const SURSE = {
  restanti: 'Facturare', incasari: 'Facturare', de_facturat: 'Facturare', montaje: 'Calendarul de montaj',
  contracte: 'Contracte', nesemnate: 'Contracte', stoc: 'Stoc echipamente', demo: 'Cereri demo', cereri: 'Cereri de la clienți',
  aparate: 'Dispozitive', venit: 'Companii', firme: 'Companii'
};

// ─── Ajutoare de scris ───────────────────────────────────────────────────────────────────────────────────────────────────────
function _mii(n) { return String(Math.floor(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// Suma exactă: „1.240,84 lei", „2.915 lei" (fără zecimale când e întreagă).
function lei(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100, a = Math.abs(v), int = Math.floor(a), dec = Math.round((a - int) * 100);
  return (v < 0 ? '−' : '') + _mii(int) + (dec ? ',' + String(dec).padStart(2, '0') : '') + ' lei';
}
function zi(ms) { return ms ? _fmtData.format(new Date(Number(ms))) : '—'; }
function ziSapt(ms) { return ms ? _fmtZiSapt.format(new Date(Number(ms))) : '—'; }
function _parti(ms) {
  const p = {};
  _fmtParti.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { y: p.year, m0: p.month - 1, d: p.day };
}
function _zi0(y, m0, d) { return I.inceputZiRO(y, m0, d); }
// „de 5 zile" / „de o zi" / „de 3 ore": cât așteaptă ceva.
function deCand(la, acum) {
  const ms = Math.max(0, (Number(acum) || Date.now()) - (Number(la) || 0));
  if (ms < 3600000) return 'de ' + numar(Math.max(1, Math.round(ms / 60000)), 'minut', 'minute');
  if (ms < ZI) return 'de ' + numar(Math.round(ms / 3600000), 'oră', 'ore');
  return 'de ' + numar(Math.floor(ms / ZI), 'zi', 'zile');
}
function _intreg(n) { const v = Number(n) || 0; return v === 1 ? 'o' : String(v); }

// ─── Perioadele ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Zilele întregi ale calendarului (montajele, contractele): „azi", „mâine", „săptămâna asta" (luni–duminică, cu zilele care
// urmează), „luna viitoare", „în noiembrie". `viitor` = privește înainte (o lună trecută fără an = cea de anul viitor: „contracte
// care expiră în ianuarie", întrebat în octombrie). { de, pana, eticheta } sau null.
const LUNI_RE = I.LUNI.join('|');
function perioadaCalendar(t, acum, viitor) {
  const now = Number(acum) || Date.now();
  const z = _parti(now), azi = _zi0(z.y, z.m0, z.d);
  const dow = (new Date(Date.UTC(z.y, z.m0, z.d)).getUTCDay() + 6) % 7;   // 0 = luni
  const per = function (de, pana, eticheta) { return { de: de, pana: pana, eticheta: eticheta }; };
  const zil = function (k) { return _zi0(z.y, z.m0, z.d + k); };
  let m;
  if (/\bpoimaine\b/.test(t)) return per(zil(2), zil(3), 'poimâine');
  if (/\bmaine\b/.test(t)) return per(zil(1), zil(2), 'mâine');
  if (/\balaltaieri\b/.test(t)) return per(zil(-2), zil(-1), 'alaltăieri');
  if (/\bieri\b/.test(t)) return per(zil(-1), azi, 'ieri');
  if (/\b(azi|astazi)\b/.test(t)) return per(azi, zil(1), 'azi');
  if ((m = /\b(?:in )?(?:urmatoarele|urmatorii|in) (\d{1,3}) (?:de )?zile\b/.exec(t))) {
    const n = Math.max(1, Math.min(366, +m[1]));
    return per(now, now + n * ZI, 'în următoarele ' + numar(n, 'zi', 'zile'));
  }
  if (/\bsaptamana (viitoare|urmatoare)\b/.test(t)) return per(zil(7 - dow), zil(14 - dow), 'săptămâna viitoare');
  if (/\bsaptamana (trecuta|precedenta|anterioara)\b/.test(t)) return per(zil(-7 - dow), zil(-dow), 'săptămâna trecută');
  if (/\bsaptamana (asta|aceasta|curenta)\b/.test(t)) return per(zil(-dow), zil(7 - dow), 'săptămâna asta');
  if (/\bluna (viitoare|urmatoare)\b/.test(t)) return per(_zi0(z.y, z.m0 + 1, 1), _zi0(z.y, z.m0 + 2, 1), 'luna viitoare (' + I.LUNI[(z.m0 + 1) % 12] + ')');
  if (/\bluna (trecuta|precedenta|anterioara)\b/.test(t)) return per(_zi0(z.y, z.m0 - 1, 1), _zi0(z.y, z.m0, 1), 'luna trecută (' + I.LUNI[(z.m0 + 11) % 12] + ')');
  if (/\bluna (asta|aceasta|curenta)\b/.test(t)) return per(_zi0(z.y, z.m0, 1), _zi0(z.y, z.m0 + 1, 1), 'luna asta (' + I.LUNI[z.m0] + ')');
  if (/\banul (asta|acesta|curent)\b/.test(t)) return per(_zi0(z.y, 0, 1), _zi0(z.y + 1, 0, 1), 'în ' + z.y);
  // O lună: „în noiembrie", „noiembrie 2026"; „mai" doar cu „în / luna / din" sau cu anul (altfel e „mai avem").
  if ((m = new RegExp('\\b(?:(?:in|luna|din|pe) )?(' + LUNI_RE.replace('mai|', '') + ')(?: (\\d{4}))?\\b').exec(t)) ||
      (m = /\b(?:in|luna|din|pe) (mai)(?: (\d{4}))?\b/.exec(t)) || (m = /\b(mai) (\d{4})\b/.exec(t))) {
    const m0 = I.LUNI.indexOf(m[1]);
    if (m0 >= 0) {
      let y = m[2] ? +m[2] : z.y;
      if (!m[2] && viitor && m0 < z.m0) y += 1;
      return per(_zi0(y, m0, 1), _zi0(y, m0 + 1, 1), 'în ' + I.LUNI[m0] + (y !== z.y ? ' ' + y : ''));
    }
  }
  return null;
}
// Încasările privesc înapoi: perioada citită ca la rapoarte (ai_raport.perioadaDin — „luna trecută", „în septembrie", „ieri",
// „1–7 octombrie"); fără ea sau cu „luna asta", luna de acum până acum. „Luna asta" se citește aici, nu la rapoarte: pe 1 ale lunii
// rapoartele o fac „azi" (o zi), iar întrebarea era despre lună.
function perioadaTrecuta(t, acum) {
  const now = Number(acum) || Date.now();
  const spusa = /\bluna (asta|aceasta|curenta)\b/.test(t) ? null : AR.perioadaDin(t, now);
  if (!spusa) {
    const r = I.perioada({ period: 'this_month' }, now);
    return { de: Date.parse(r.from), pana: Date.parse(r.to), eticheta: 'luna asta (' + I.LUNI[_parti(now).m0] + ', până azi)', lunaAsta: true };
  }
  const e = String(spusa.eticheta || '');
  const fraza = I.LUNI.some(function (l) { return e.indexOf(l + ' ') === 0; }) ? 'în ' + e : (/^(azi|ieri|alaltăieri)$/.test(e) ? e : 'în perioada ' + e);
  // `lunaAsta` = luna de acum, până azi → „Și luna trecută?" și comparația cu aceleași zile din luna dinainte.
  return { de: Date.parse(spusa.from), pana: Date.parse(spusa.to), eticheta: fraza, lunaAsta: / \(până azi\)$/.test(e) };
}
// Cu ce se compară încasările: luna de acum (până azi) cu ACELEAȘI zile din luna dinainte — nu cu luna întreagă, care ar ieși
// mereu mai mare; altfel perioada dinainte, la fel de lungă (ai_raport.perioadaDinainte). { de, pana, fraza }.
function perioadaComparata(u, acum) {
  const now = Number(acum) || Date.now();
  if (u.lunaAsta) {
    const z = _parti(u.de);
    const de = _zi0(z.y, z.m0 - 1, 1), capat = _zi0(z.y, z.m0, 1);
    return { de: de, pana: Math.min(capat, de + Math.max(0, u.pana - u.de)), fraza: 'În aceleași zile din ' + I.LUNI[(z.m0 + 11) % 12] };
  }
  const p = AR.perioadaDinainte({ from: new Date(u.de).toISOString(), to: new Date(u.pana).toISOString() }, now);
  return { de: Date.parse(p.from), pana: Date.parse(p.to), fraza: 'Perioada de dinainte (' + p.eticheta + ')' };
}

// ─── Firmele numite în întrebare ─────────────────────────────────────────────────────────────────────────────────────────────
// „Trans Expres e restant?", „cât am încasat de la Agro Nord" — numele firmei, fără SRL / SA, ca un cuvânt întreg. La două potriviri
// care se suprapun („Trans" și „Trans Expres"), câștigă cea mai lungă.
function _numeFirma(n) {
  return I.norm(n).replace(/\b(s\.?\s?r\.?\s?l|s\.?\s?a|srl|sa|pfa|ii|ie|snc|scs|sca|scm|ifn)\b\.?/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function firmeDin(t, firme) {
  const gasite = [];
  (firme || []).forEach(function (f) {
    const n = _numeFirma(f.nume || '');
    if (n.length < 3) return;
    const re = new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
    if (re.test(t)) gasite.push({ id: f.id, nume: f.nume, n: n });
  });
  return gasite.filter(function (g) { return !gasite.some(function (h) { return h !== g && h.n.length > g.n.length && h.n.indexOf(g.n) >= 0; }); })
    .map(function (g) { return { id: g.id, nume: g.nume }; });
}

// ─── Înțelegerea întrebării ──────────────────────────────────────────────────────────────────────────────────────────────────
// Ordinea contează: „facturi restante" e o restanță, nu „de facturat"; „cereri demo" sunt ale demo-ului.
const SUBIECTE = [
  { k: 'restanti', re: /\b(restant\w*|neplat\w*|neachitat\w*|datori\w*|datoreaza|intarzi\w*|scadent\w*|nu (ne )?(au|a) platit)\b/ },
  { k: 'incasari', re: /\b(incas\w*|bani (am )?(primit|intrat)|ce bani (au )?intrat|plati(le)? primite)\b/ },
  { k: 'de_facturat', re: /\b(de facturat|neemis\w*|facturi(le)? de (emis|facut)|ce (mai )?(am|avem) de facturat)\b/ },
  { k: 'montaje', re: /\b(montaj\w*|instalari\w*|instalam|montam)\b/ },
  { k: 'contracte', re: /\bcontract\w*\b[\s\S]*\b(expir\w*|se termin\w*|preaviz\w*|reinno\w*|reinnoi\w*)\b|\b(expir\w*|se termin\w*)\b[\s\S]*\bcontract\w*\b/ },
  { k: 'nesemnate', re: /\bcontract\w*\b[\s\S]*\b(nesemnat\w*|la semnat|semnatur\w*|nu (au|a) semnat|in lucru|ciorn\w*)\b|\b(nesemnat\w*)\b[\s\S]*\bcontract\w*\b/ },
  { k: 'stoc', re: /\b(stoc\w*|depozit\w*|fmc ?\d{3}|lv ?-?can ?\d*)\b/ },
  { k: 'demo', re: /\bdemo\b/ },
  { k: 'cereri', re: /\b(cerer\w*|tichet\w*)\b/ },
  { k: 'aparate', re: /\b(neasignat\w*|fara firma|aparate(le)? noi)\b/ },
  { k: 'venit', re: /\b(venit(ul)? lunar|venitul pe luna|mrr|cat facturam( pe luna| lunar)?|cei mai mari clienti|cel mai mare client|top clienti|abonamentele lunare)\b/ },
  { k: 'firme', re: /\b(cate firme|cati clienti|clienti activi|firme active|toate firmele|toti clientii|suspendat\w*|fara contract|lista (de )?(firme|clienti))\b/ }
];
// O continuare care e DOAR o perioadă („și luna trecută?", „și mâine?"): regula rapoartelor (ai_raport.doarPerioada), plus cuvintele
// viitorului — montajele și contractele privesc și înainte, rapoartele nu.
const VIITOR = /\b(maine|poimaine|viitoare|viitor|urmatoare|urmatorul|urmatoarele|urmatorii)\b/g;
function _doarPerioada(t) { return AR.doarPerioada(String(t || '').replace(VIITOR, ' ')); }
// Modelele din stoc, scrise cum le scriu oamenii („fmc 130", „FMC130", „lv-can").
function _modelDin(t) {
  const m = /\bfmc ?(\d{3})\b/.exec(t);
  if (m) return 'fmc' + m[1];
  if (/\blv ?-?can/.test(t)) return 'lvcan200';
  return null;
}
// `o` = { acum, ctx (ce a întors răspunsul de dinainte: { s, de, pana, eticheta, firme }), analiza (insight.esteAnaliza — „de ce",
// „compară", „ce să fac" sunt ale modelului), firme: [{ id, nume }] }. Întoarce { s, de?, pana?, eticheta?, firme?, model? } sau null.
function intelege(text, o) {
  o = o || {};
  const acum = Number(o.acum) || Date.now();
  const t = I.norm(text);
  if (!t || o.analiza) return null;
  if (t.split(' ').length > MAX_CUVINTE_PE_LOC) return null;
  let s = null;
  for (const x of SUBIECTE) if (x.re.test(t)) { s = x.k; break; }
  const firme = firmeDin(t, o.firme);
  const c = o.ctx || {};
  // „Și luna trecută?", „și la Agro Nord?" — fără subiect, dar cu o perioadă sau o firmă: subiectul de dinainte.
  const doarPer = _doarPerioada(t);
  if (!s && c.s && SURSE[c.s] && t.split(' ').length <= 8 && (doarPer || firme.length)) s = c.s;
  if (!s) return null;
  const u = { s: s };
  if (firme.length) u.firme = firme;
  // Firma de dinainte rămâne doar la o continuare („Și luna trecută?"); o întrebare întreagă e despre toate firmele.
  else if (c.s === s && Array.isArray(c.firme) && c.firme.length && doarPer) u.firme = c.firme;
  if (s === 'incasari') Object.assign(u, perioadaTrecuta(t, acum));
  if (s === 'montaje') {
    const p = perioadaCalendar(t, acum, false) || (c.s === s && !doarPer && c.de ? { de: c.de, pana: c.pana, eticheta: c.eticheta } : null) || perioadaCalendar('saptamana asta', acum, false);
    Object.assign(u, p);
  }
  if (s === 'contracte') {
    const p = perioadaCalendar(t, acum, true) || { de: acum, pana: acum + ZILE_CONTRACTE * ZI, eticheta: 'în următoarele ' + numar(ZILE_CONTRACTE, 'zi', 'zile') };
    Object.assign(u, p);
  }
  if (s === 'stoc') { const md = _modelDin(t); if (md) u.model = md; }
  return u;
}

// ─── Răspunsurile pe loc ─────────────────────────────────────────────────────────────────────────────────────────────────────
function _insigna(s) { return { fel: 'instant', nume: 'Asistent', eticheta: 'Instant', detaliu: 'din ' + SURSE[s] }; }
function _tabel(col, randuri, dr) {
  const r = randuri || [];
  const inca = Math.max(0, r.length - MAX_RANDURI);
  return { col: col, dr: dr || [], rand: r.slice(0, MAX_RANDURI), inca: inca, incaText: inca ? '… și încă ' + numar(inca, 'rând', 'rânduri') + '.' : '' };
}
function _deFirma(u) { return u.firme && u.firme.length ? u.firme.map(function (f) { return f.nume; }).join(', ') : ''; }
function _peFirme(u, l, cheie) {
  if (!u.firme || !u.firme.length) return l;
  const ids = u.firme.map(function (f) { return Number(f.id); });
  return (l || []).filter(function (x) { return ids.indexOf(Number(x[cheie || 'companyId'])) >= 0; });
}
const BTN = {
  facturare: { text: 'Facturare', ic: 'fa-file-invoice', tinta: { fel: 'facturare', sectiune: 'facturi' } },
  montajFacturat: { text: 'Montaj de facturat', ic: 'fa-screwdriver-wrench', tinta: { fel: 'facturare', sectiune: 'montaj' } },
  calendar: { text: 'Calendarul de montaj', ic: 'fa-calendar-days', tinta: { fel: 'sectiune', tab: 'montaj' } },
  contracte: { text: 'Contracte', ic: 'fa-file-signature', tinta: { fel: 'sectiune', tab: 'contracte' } },
  stoc: { text: 'Stoc echipamente', ic: 'fa-boxes-stacked', tinta: { fel: 'sectiune', tab: 'stoc' } },
  cereri: { text: 'Cereri de la clienți', ic: 'fa-headset', tinta: { fel: 'sectiune', tab: 'cereri' } },
  demo: { text: 'Cereri demo', ic: 'fa-envelope-open-text', tinta: { fel: 'sectiune', tab: 'demoreq' } },
  companii: { text: 'Companii', ic: 'fa-building', tinta: { fel: 'sectiune', tab: 'companies' } }
};
function _laFirma(id, nume, fila) { return { text: 'Deschide ' + nume, ic: 'fa-building', tinta: { fel: 'firma', id: id, fila: fila } }; }

const RASPUNS = {
  // Facturile trecute de scadență — ACEEAȘI listă ca rândul „bani" din „Azi la noi" (neplata). `zilePanaLaOprire` -1 = oprit.
  restanti: function (u, d) {
    const l = _peFirme(u, d.facturi).slice().sort(function (a, b) { return (b.zileIntarziere - a.zileIntarziere) || (b.totalRon - a.totalRon); });
    const df = _deFirma(u);
    if (!l.length) return { titlu: df ? df + ': nicio factură trecută de scadență.' : 'Nicio factură trecută de scadență.', text: 'Toate facturile emise sunt plătite sau încă în termen.', butoane: [BTN.facturare] };
    const ron = l.filter(function (f) { return (f.moneda || 'RON') === 'RON'; }).reduce(function (s, f) { return s + f.totalRon; }, 0);
    const alte = l.filter(function (f) { return (f.moneda || 'RON') !== 'RON'; });
    const nf = Array.from(new Set(l.map(function (f) { return f.companyId; }))).length;
    const urgent = l.filter(function (f) { return f.zilePanaLaOprire >= 0; }).sort(function (a, b) { return a.zilePanaLaOprire - b.zilePanaLaOprire; })[0];
    const oprite = Array.from(new Set(l.filter(function (f) { return f.zilePanaLaOprire < 0; }).map(function (f) { return f.firma; })));
    const fraze = [];
    if (urgent) fraze.push('La **' + urgent.firma + '** accesul se oprește singur ' + (urgent.zilePanaLaOprire === 0 ? 'azi' : 'în ' + numar(urgent.zilePanaLaOprire, 'zi', 'zile')) + '.');
    if (oprite.length) fraze.push((oprite.length === 1 ? '**' + oprite[0] + '** are' : '**' + oprite.join('**, **') + '** au') + ' accesul oprit pentru neplată.');
    const prima = urgent || l[0];
    return {
      titlu: 'Facturi trecute de scadență: ' + numar(nf, 'firmă', 'firme') + ', ' + lei(ron) + (alte.length ? ' (și ' + alte.map(function (f) { return f.totalRon + ' ' + f.moneda; }).join(', ') + ')' : '') + '.',
      tabel: _tabel(['Firma', 'Factura', 'Întârziere', 'Suma'], l.map(function (f) {
        return [f.firma, f.numar, numar(f.zileIntarziere, 'zi', 'zile'), (f.moneda || 'RON') === 'RON' ? lei(f.totalRon) : f.totalRon + ' ' + f.moneda];
      }), [3]),
      text: fraze.join(' '),
      butoane: [_laFirma(prima.companyId, prima.firma, 'facturi'), BTN.facturare],
      urmari: [{ text: 'Încasări luna asta', trimite: 'Încasări luna asta' }]
    };
  },
  // Plățile trecute în aplicație (Facturare › „Plătită" / încasare), pe firme; perioada de dinainte, la fel de lungă, ca reper.
  incasari: function (u, d) {
    const l = _peFirme(u, d.plati);
    const df = _deFirma(u);
    const tot = l.reduce(function (s, p) { return s + p.suma; }, 0);
    const pe = {};
    l.forEach(function (p) { const k = p.companyId; const x = pe[k] || (pe[k] = { companyId: k, firma: p.firma, n: 0, suma: 0 }); x.n++; x.suma += p.suma; });
    const firme = Object.keys(pe).map(function (k) { return pe[k]; }).sort(function (a, b) { return b.suma - a.suma; });
    const r = {
      titlu: 'Încasări ' + (df ? 'de la ' + df + ', ' : '') + u.eticheta + ': ' + lei(tot) + (l.length ? ', din ' + numar(l.length, 'plată', 'plăți') : '') + '.',
      butoane: [BTN.facturare]
    };
    if (firme.length) r.tabel = _tabel(['Firma', 'Plăți', 'Suma'], firme.map(function (x) { return [x.firma, String(x.n), lei(x.suma)]; }), [1, 2]);
    else r.text = 'Nu e trecută nicio plată în perioada asta.';
    if (d.inainte && d.inainte.fraza) {
      const ti = _peFirme(u, d.inainte.plati || []).reduce(function (s, p) { return s + p.suma; }, 0);
      const dif = Math.round((tot - ti) * 100) / 100;
      r.text = (r.text ? r.text + ' ' : '') + d.inainte.fraza + ': ' + lei(ti) + '.' + (dif ? ' Acum: cu ' + lei(Math.abs(dif)) + (dif > 0 ? ' mai mult.' : ' mai puțin.') : '');
    }
    if (u.lunaAsta) r.urmari = [{ text: 'Și luna trecută?', trimite: 'Încasări luna trecută' }];
    else r.urmari = [{ text: 'Cine e restant?', trimite: 'Cine e restant?' }];
    return r;
  },
  // Zilele de montaj din calendar (fără cele anulate), cu instalatorul, mașinile și confirmările — aceleași ca în Calendarul de montaj.
  montaje: function (u, d) {
    const l = _peFirme(u, d.lucrari).slice().sort(function (a, b) { return a.la - b.la; });
    const df = _deFirma(u);
    if (!l.length) return { titlu: 'Niciun montaj ' + (df ? 'la ' + df + ' ' : '') + u.eticheta + '.', butoane: [BTN.calendar],
      urmari: u.eticheta === 'săptămâna asta' ? [{ text: 'Și săptămâna viitoare?', trimite: 'Montaje săptămâna viitoare' }] : [] };
    const masini = l.reduce(function (s, x) { return s + (x.masini || 0); }, 0);
    const zile = Array.from(new Set(l.map(function (x) { return x.zi; }))).length;
    const neconf = l.filter(function (x) { return x.status === 'programat' && x.conf !== 'ok'; });
    const stare = function (x) {
      if (x.status !== 'programat') return 'montat';
      if (x.conf === 'ok') return 'confirmat';
      const lipsa = [x.confirmatClient ? null : 'clientul', x.confirmatInstalator ? null : 'instalatorul'].filter(Boolean);
      return 'de confirmat: ' + lipsa.join(' și ');
    };
    return {
      titlu: 'Montaje ' + (df ? 'la ' + df + ' ' : '') + u.eticheta + ': ' + numar(l.length, 'lucrare', 'lucrări') + ' în ' + numar(zile, 'zi', 'zile') + ', ' + numar(masini, 'mașină', 'mașini') + '.',
      tabel: _tabel(['Ziua', 'Firma', 'Instalator', 'Mașini', 'Stare'], l.map(function (x) {
        return [ziSapt(x.la), x.firma, x.instalator || '—', String(x.masini || 0), stare(x)];
      }), [3]),
      text: neconf.length ? (neconf.length === 1 ? 'Lucrarea de la **' + neconf[0].firma + '** nu e confirmată încă.' : '**' + numar(neconf.length, 'lucrare', 'lucrări') + '** nu sunt confirmate încă.') : '',
      butoane: [BTN.calendar],
      urmari: u.eticheta === 'săptămâna asta' ? [{ text: 'Și săptămâna viitoare?', trimite: 'Montaje săptămâna viitoare' }] : []
    };
  },
  // Contractele semnate al căror termen de acum (cu prelungirile semnate) cade în perioadă — și până când se mai poate da preavizul.
  contracte: function (u, d) {
    const l = _peFirme(u, d.contracte).filter(function (c) { return c.sfarsit && c.sfarsit >= u.de && c.sfarsit < u.pana; })
      .sort(function (a, b) { return a.sfarsit - b.sfarsit; });
    const df = _deFirma(u);
    if (!l.length) return { titlu: (df ? df + ': niciun contract nu expiră ' : 'Niciun contract nu expiră ') + u.eticheta + '.', butoane: [BTN.contracte],
      urmari: [{ text: 'Contracte nesemnate', trimite: 'Contracte nesemnate' }] };
    const deDat = l.filter(function (c) { return !c.autoRenew && c.preaviz && c.preaviz >= (d.acum || 0); }).sort(function (a, b) { return a.preaviz - b.preaviz; })[0];
    return {
      titlu: 'Contracte care expiră ' + u.eticheta + ': ' + l.length + '.',
      tabel: _tabel(['Firma', 'Contract', 'Expiră pe', 'Preaviz până pe', 'Se reînnoiește'], l.map(function (c) {
        return [c.firma, c.numar || '—', zi(c.sfarsit), c.preaviz ? zi(c.preaviz) : '—', c.autoRenew ? 'da' : 'nu'];
      })),
      text: deDat ? 'Primul preaviz: **' + deDat.firma + '**, până pe ' + zi(deDat.preaviz) + '.' : '',
      butoane: [{ text: 'Deschide contractul', ic: 'fa-file-signature', tinta: { fel: 'firma', id: l[0].companyId, fila: 'contract' } }, BTN.contracte],
      urmari: [{ text: 'Contracte nesemnate', trimite: 'Contracte nesemnate' }]
    };
  },
  // Contractele încă nesemnate: în lucru, aprobate sau trimise la semnat (de când).
  nesemnate: function (u, d) {
    const l = _peFirme(u, d.contracte).slice().sort(function (a, b) { return (a.trimisLa || a.facutLa || 0) - (b.trimisLa || b.facutLa || 0); });
    if (!l.length) return { titlu: 'Niciun contract nesemnat.', text: 'Toate contractele sunt semnate sau încheiate.', butoane: [BTN.contracte] };
    const trimise = l.filter(function (c) { return c.status === 'trimis'; });
    return {
      titlu: 'Contracte nesemnate: ' + l.length + (trimise.length ? ' (' + numar(trimise.length, 'trimis', 'trimise') + ' la semnat)' : '') + '.',
      tabel: _tabel(['Firma', 'Contract', 'Stare', 'De când'], l.map(function (c) {
        return [c.firma, c.numar || '—', c.eticheta || c.status, c.trimisLa ? 'trimis ' + deCand(c.trimisLa, d.acum) : (c.facutLa ? 'făcut ' + deCand(c.facutLa, d.acum) : '—')];
      })),
      butoane: [{ text: 'Deschide contractul', ic: 'fa-file-signature', tinta: { fel: 'firma', id: l[0].companyId, fila: 'contract' } }, BTN.contracte],
      urmari: [{ text: 'Contracte care expiră', trimite: 'Contracte care expiră' }]
    };
  },
  // Stocul pe modele (stoc.sumar): în depozit, la instalatori, montate (închiriate de la noi / vândute).
  stoc: function (u, d) {
    let l = d.modele || [];
    if (u.model) l = l.filter(function (m) { return m.tip === u.model; });
    if (!l.length) return { titlu: u.model ? 'Nu am în stoc nicio bucată din modelul ăsta.' : 'Stocul e gol.', butoane: [BTN.stoc] };
    const unul = l.length === 1 ? l[0] : null;
    return {
      titlu: unul ? unul.model + ': ' + numar(unul.depozit, 'bucată', 'bucăți') + ' în depozit, ' + unul.instalator + ' la instalatori.'
        : 'Stocul: ' + numar(l.reduce(function (s, m) { return s + m.depozit; }, 0), 'bucată', 'bucăți') + ' în depozit, ' + l.reduce(function (s, m) { return s + m.instalator; }, 0) + ' la instalatori.',
      tabel: _tabel(['Model', 'În depozit', 'La instalatori', 'Montate (închiriate)', 'Montate (vândute)'], l.map(function (m) {
        return [m.model, String(m.depozit), String(m.instalator), String(m.inchiriate), String(m.vandute)];
      }), [1, 2, 3, 4]),
      text: l.filter(function (m) { return m.subPrag; }).map(function (m) { return '**' + m.model + '** e sub stocul minim (' + m.prag + ').'; }).join(' '),
      butoane: [BTN.stoc]
    };
  },
  // Cererile deschise de la clienți („Anunță echipa RA Track").
  cereri: function (u, d) {
    const l = _peFirme(u, d.cereri).slice().sort(function (a, b) { return a.la - b.la; });
    if (!l.length) return { titlu: 'Nicio cerere deschisă de la clienți.', butoane: [BTN.cereri] };
    const noi = l.filter(function (c) { return c.stare === 'trimisa'; });
    return {
      titlu: 'Cereri deschise de la clienți: ' + l.length + (noi.length ? ' (' + numar(noi.length, 'nepreluată', 'nepreluate') + ')' : '') + '.',
      tabel: _tabel(['Nr.', 'Firma', 'Problema', 'Stare', 'De când'], l.map(function (c) { return [String(c.nr), c.firma, c.titlu, c.stareText || c.stare, deCand(c.la, d.acum)]; }), [0]),
      butoane: [BTN.cereri]
    };
  },
  // Cererile noi de cont demo / din formularul de contact — fără date personale (doar firma, dacă a scris-o).
  demo: function (u, d) {
    const l = (d.cereri || []).slice().sort(function (a, b) { return a.la - b.la; });
    if (!l.length) return { titlu: 'Nicio cerere nouă de cont demo.', butoane: [BTN.demo] };
    return {
      titlu: 'Cereri noi de cont demo: ' + l.length + '.',
      tabel: _tabel(['Firma', 'Ce cere', 'De când'], l.map(function (c) { return [c.firma || '—', c.ce, deCand(c.la, d.acum)]; })),
      butoane: [BTN.demo]
    };
  },
  // Aparatele care transmit (ultimele 7 zile) și n-au firmă — ca rândul din „Azi la noi"; butonul le bifează în Neasignate.
  aparate: function (u, d) {
    const l = d.aparate || [];
    if (!l.length) return { titlu: 'Niciun aparat fără firmă nu transmite acum.', butoane: [{ text: 'Dispozitive', ic: 'fa-satellite-dish', tinta: { fel: 'sectiune', tab: 'devices' } }] };
    const ids = Array.from(new Set(l.map(function (a) { return a.firmaId; })));
    return {
      titlu: numar(l.length, 'aparat', 'aparate') + ' ' + (l.length === 1 ? 'transmite' : 'transmit') + ' și n-' + (l.length === 1 ? 'are' : 'au') + ' firmă.',
      tabel: _tabel(['IMEI', 'Propus pentru'], l.map(function (a) { return [a.imei, a.firma || '—']; })),
      butoane: [{ text: 'Neasignate', ic: 'fa-satellite-dish', tinta: { fel: 'neasignate', imeis: l.map(function (a) { return a.imei; }).slice(0, 200), firma: ids.length === 1 ? ids[0] : null } }]
    };
  },
  // Ce așteaptă o factură: montajul gata de facturat (în ritmul instalatorului) și abonamentul lunii neemis.
  de_facturat: function (u, d) {
    const rows = [];
    (d.montaj || []).forEach(function (m) { rows.push(['Montaj', m.firma, numar(m.masini || 0, 'mașină', 'mașini') + (m.perioada ? ' (' + m.perioada + ')' : '')]); });
    (d.abonamente || []).forEach(function (a) { rows.push(['Abonament ' + (d.luna || ''), a.firma, a.totalRon != null ? lei(a.totalRon) : '—']); });
    if (!rows.length) return { titlu: 'Nimic de facturat acum.', text: 'Montajul e facturat și abonamentul lunii e emis peste tot.', butoane: [BTN.facturare] };
    const nm = (d.montaj || []).length, na = (d.abonamente || []).length;
    return {
      titlu: 'De facturat: ' + [nm ? 'montajul la ' + numar(nm, 'firmă', 'firme') : null, na ? 'abonamentul lunii la ' + numar(na, 'firmă', 'firme') : null].filter(Boolean).join(' și ') + '.',
      tabel: _tabel(['Ce', 'Firma', 'Detalii'], rows),
      butoane: [nm ? BTN.montajFacturat : null, BTN.facturare].filter(Boolean),
      urmari: [{ text: 'Cine e restant?', trimite: 'Cine e restant?' }]
    };
  },
  // Venitul lunar de acum (ca factura: doar mașinile pornite, cu ce ține de firmă) — cei mai mari clienți întâi.
  venit: function (u, d) {
    const l = (d.firme || []).filter(function (f) { return f.lei > 0; }).sort(function (a, b) { return b.lei - a.lei; });
    const tot = l.reduce(function (s, f) { return s + f.lei; }, 0);
    if (!l.length) return { titlu: 'Niciun venit lunar încă: nicio firmă nu are mașini pornite pe o ofertă.', butoane: [BTN.companii] };
    return {
      titlu: 'Venitul lunar de acum: ' + lei(tot) + ', de la ' + numar(l.length, 'firmă', 'firme') + '.',
      tabel: _tabel(['Firma', 'Pe lună'], l.map(function (f) { return [f.firma, lei(f.lei)]; }), [1]),
      text: 'Socotit ca factura: doar mașinile pornite, plus ce ține de firmă (RA Insight, păstrarea istoricului, chiria).',
      butoane: [BTN.companii],
      urmari: [{ text: 'Încasări luna asta', trimite: 'Încasări luna asta' }]
    };
  },
  // Starea firmelor, cu regulile filtrelor din Companii (fără contract / restanță / suspendată) — ca cifrele de sub „Companii".
  firme: function (u, d) {
    const l = d.firme || [];
    const fc = l.filter(function (f) { return f.faraContract; }), rs = l.filter(function (f) { return f.restanta; }), su = l.filter(function (f) { return f.suspendata; });
    const pr = l.filter(function (f) { return f.faraContract || f.restanta || f.suspendata; });
    const r = {
      titlu: numar(l.length, 'firmă', 'firme') + ': ' + fc.length + ' fără contract, ' + rs.length + (rs.length === 1 ? ' restanță, ' : ' restanțe, ') + su.length + (su.length === 1 ? ' suspendată.' : ' suspendate.'),
      butoane: [BTN.companii]
    };
    if (pr.length) r.tabel = _tabel(['Firma', 'Ce e'], pr.map(function (f) {
      return [f.firma, [f.faraContract ? 'fără contract' : null, f.restanta ? 'restanță' : null, f.suspendata ? 'suspendată' : null].filter(Boolean).join(', ')];
    }));
    else r.text = 'Toate au contract, nicio restanță, nicio suspendare.';
    if (rs.length) r.urmari = [{ text: 'Cine e restant?', trimite: 'Cine e restant?' }];
    return r;
  }
};

// Răspunsul întreg, gata de desenat. `u` = ce a înțeles `intelege`, `d` = datele de la server.
function raspunde(u, d, acum) {
  const f = RASPUNS[u.s];
  const r = f(u, Object.assign({ acum: Number(acum) || Date.now() }, d || {}));
  const ctx = { s: u.s };
  if (u.de != null) { ctx.de = u.de; ctx.pana = u.pana; ctx.eticheta = u.eticheta; }
  if (u.firme && u.firme.length) ctx.firme = u.firme;
  return Object.assign({ fel: 'instant', insigna: _insigna(u.s), verificat: 'Cifrele le-am luat din ' + SURSE[u.s] + '.', urmari: [] }, r, { context: ctx });
}
// Textul simplu al unui răspuns (pentru „Copiază" și pentru istoricul pe care îl vede modelul la întrebarea următoare).
function textSimplu(r) {
  if (!r) return '';
  const p = [String(r.titlu || '').replace(/\*\*/g, '')];
  if (r.tabel && r.tabel.rand && r.tabel.rand.length) {
    p.push(r.tabel.col.join(' | '));
    r.tabel.rand.forEach(function (x) { p.push(x.join(' | ')); });
    if (r.tabel.incaText) p.push(r.tabel.incaText);
  }
  if (r.text) p.push(String(r.text).replace(/\*\*/g, ''));
  return p.filter(Boolean).join('\n');
}

// ─── Modelul ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Ce vede modelul despre ce poate citi (aceleași date ca răspunsurile pe loc, ca obiecte). Toate doar CITESC.
const _PER = { de: { type: 'string', description: 'Ziua de început, AAAA-LL-ZZ (ora României).' }, pana: { type: 'string', description: 'Ziua de sfârșit, inclusiv, AAAA-LL-ZZ.' } };
const UNELTE = [
  { name: 'restante', description: 'Facturile trecute de scadență (neplătite): firma, numărul, suma, câte zile de întârziere, în câte zile se oprește accesul firmei (-1 = deja oprit).', input_schema: { type: 'object', properties: {} } },
  { name: 'incasari', description: 'Plățile încasate (trecute în aplicație) într-o perioadă, cu firma și suma. Fără perioadă: luna asta până azi.', input_schema: { type: 'object', properties: _PER } },
  { name: 'facturi', description: 'Facturile și proformele emise (fără ciorne), cu starea lor: firma, numărul, suma, emisă, scadența, plătită. Se pot alege firma (o parte din nume) și perioada emiterii.', input_schema: { type: 'object', properties: Object.assign({ firma: { type: 'string', description: 'O parte din numele firmei.' } }, _PER) } },
  { name: 'montaje', description: 'Zilele de montaj din calendar într-o perioadă (fără cele anulate): ziua, firma, instalatorul, câte mașini, starea și confirmările. Fără perioadă: săptămâna asta (luni–duminică).', input_schema: { type: 'object', properties: _PER } },
  { name: 'contracte', description: 'Contractele clienților: firma, numărul, starea (în lucru / trimis / semnat / încheiat), când expiră termenul de acum, până când se poate da preavizul, dacă se reînnoiește singur.', input_schema: { type: 'object', properties: { firma: { type: 'string', description: 'O parte din numele firmei.' } } } },
  { name: 'firme', description: 'Firmele clienți: numele, venitul lunar de acum (lei, ca factura), câte aparate, dacă au contract, restanță sau acces suspendat.', input_schema: { type: 'object', properties: { firma: { type: 'string', description: 'O parte din numele firmei.' } } } },
  { name: 'stoc', description: 'Stocul de aparate pe modele: în depozit, la instalatori, montate (închiriate de la noi sau vândute).', input_schema: { type: 'object', properties: {} } },
  { name: 'cereri', description: 'Cererile deschise de la clienți (problemele anunțate din aplicație): numărul, firma, problema, starea, de când.', input_schema: { type: 'object', properties: {} } },
  { name: 'de_facturat', description: 'Ce așteaptă o factură: montajul gata de facturat și abonamentul lunii încă neemis, pe firme.', input_schema: { type: 'object', properties: {} } },
  { name: 'azi_la_noi', description: 'Ce cere atenție azi (aceleași rânduri ca „Azi la noi" de sus): facturi întârziate, cereri, contracte, montaj, de facturat, aparate, firma noastră.', input_schema: { type: 'object', properties: {} } }
];
// De unde vin cifrele unei unelte (insigna și butoanele de sub răspunsul modelului).
const SURSA_UNELTE = {
  restante: { sursa: 'Facturare', buton: BTN.facturare }, incasari: { sursa: 'Facturare', buton: BTN.facturare }, facturi: { sursa: 'Facturare', buton: BTN.facturare },
  de_facturat: { sursa: 'Facturare', buton: BTN.facturare }, montaje: { sursa: 'Calendarul de montaj', buton: BTN.calendar }, contracte: { sursa: 'Contracte', buton: BTN.contracte },
  firme: { sursa: 'Companii', buton: BTN.companii }, stoc: { sursa: 'Stoc echipamente', buton: BTN.stoc }, cereri: { sursa: 'Cereri de la clienți', buton: BTN.cereri },
  azi_la_noi: { sursa: 'Azi la noi', buton: null }
};
// Insigna și butoanele unui răspuns al modelului, din uneltele chiar rulate (nu din ce a scris el). `surse` = ecranele din care
// au venit cifrele (pentru rândul „✓", la pasul 3).
function _insiruire(l) { return l.length > 1 ? l.slice(0, -1).join(', ') + ' și ' + l[l.length - 1] : (l[0] || ''); }
function dupaModel(unelte) {
  const surse = [], butoane = [];
  (unelte || []).forEach(function (n) {
    const x = SURSA_UNELTE[n]; if (!x) return;
    if (surse.indexOf(x.sursa) < 0) surse.push(x.sursa);
    if (x.buton && butoane.indexOf(x.buton) < 0) butoane.push(x.buton);
  });
  const det = surse.length ? 'din ' + _insiruire(surse) : 'din aplicație';
  return { insigna: { fel: 'ai', nume: 'Asistent', eticheta: 'Analiză', detaliu: det }, butoane: butoane.slice(0, 3), surse: surse };
}

// ─── Pasul 3 (04.11; Alin, 02.11: „5. da", 03.11: „da, poți începe"): cifrele verificate și analiza atentă ─────────────────────
// Cifrele din răspunsul modelului se caută în ce au întors uneltele (cifre.negasite — aceeași regulă ca la RA Insight: sumele în lei
// și procentele; totalurile, diferențele și procentele între două perioade se socotesc din date). O cifră negăsită → modelul își
// rescrie O DATĂ răspunsul (`cerereRescriere`); rămasă negăsită → o spunem pe față („Nu am găsit…"), nu „verifică tu".
function cerereRescriere(lipsa) {
  return 'Verificarea aplicației: cifrele ' + (lipsa || []).join(', ') + ' nu se regăsesc în datele citite de unelte și nici nu se pot ' +
    'socoti din ele. Scrie din nou tot răspunsul, doar cu cifre din unelte (citește din nou ce îți trebuie). Nu pomeni verificarea.';
}
const TEXT_NEGASIT = 'Cifra nu apare în ce am citit din aplicație și nu se poate socoti din ce am citit. N-o lua drept sigură.';
// Ce stă sub răspunsul modelului: { verificat } — toate cifrele de verificat (lei, %, fără cifrele mici întregi) se regăsesc în
// date; { probleme } — una a rămas negăsită după rescriere; {} — răspunsul n-are cifre de verificat (sau nu s-a citit nimic).
function verificare(text, lipsa, citite, surse) {
  if (lipsa && lipsa.length) {
    return { probleme: [{ fel: 'cifra', grav: 'galben', titlu: 'Nu am găsit în datele aplicației: ' + lipsa.slice(0, 6).join(', '), dovada: TEXT_NEGASIT }] };
  }
  const deVazut = C.cifreleRaspunsului(text).filter(function (c) { return c.fel !== 'timp' && !(c.zec === 0 && c.v <= C.MICI); });
  if (deVazut.length && (citite || []).length) return { verificat: 'Cifrele le-am luat din ' + (_insiruire(surse || []) || 'aplicație') + '.' };
  return {};
}
// Analiza atentă (ca la RA Insight, insight.ANALIZA_ATENTA): la „de ce", „compară", „ce să fac" (insight.esteAnaliza) același model
// gândește mai mult (efortul „medium", pus de server) și răspunde în forma fixă. Zilele perioadelor le dă aplicația (pe ora României),
// ca modelul să nu le socotească singur. Stă în CONTEXTUL întrebării, nu în partea fixă din cache.
function _iso(y, m0, d) { return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10); }
function analizaAtenta(acum) {
  const z = _parti(Number(acum) || Date.now());
  const dow = (new Date(Date.UTC(z.y, z.m0, z.d)).getUTCDay() + 6) % 7;   // 0 = luni
  const zileLunaTrecuta = new Date(Date.UTC(z.y, z.m0, 0)).getUTCDate();
  const azi = _iso(z.y, z.m0, z.d);
  return 'ÎNTREBARE DE ANALIZĂ („de ce", „compară", „ce să fac"). Lucrează atent; forma de mai jos ține locul celei obișnuite.\n' +
    '1. Înainte să răspunzi, citește cu uneltele datele pentru perioada întrebării ȘI pentru perioada dinainte, de aceeași lungime ' +
    '(de pildă încasările lunii și ale lunii dinainte: unealta `incasari` de două ori, cu `de` și `pana`); pe firme, dacă ajută. ' +
    'Zilele, pe ora României: luna asta până azi = ' + _iso(z.y, z.m0, 1) + ' – ' + azi + '; aceleași zile din luna trecută = ' +
    _iso(z.y, z.m0 - 1, 1) + ' – ' + _iso(z.y, z.m0 - 1, Math.min(z.d, zileLunaTrecuta)) + '; luna trecută întreagă = ' + _iso(z.y, z.m0 - 1, 1) +
    ' – ' + _iso(z.y, z.m0 - 1, zileLunaTrecuta) + '; săptămâna asta = ' + _iso(z.y, z.m0, z.d - dow) + ' – ' + azi + '; săptămâna trecută = ' +
    _iso(z.y, z.m0, z.d - dow - 7) + ' – ' + _iso(z.y, z.m0, z.d - dow - 1) + '.\n' +
    '2. Răspunde scurt, în forma asta:\n' +
    '**Ce s-a întâmplat** — o frază, cu cifra principală și comparația cu perioada dinainte.\n' +
    '**De ce** — două-trei cauze, fiecare cu cifra ei din date (firma, factura, contractul, ziua).\n' +
    '**Ce poți face** — doi-trei pași pe care îi faceți voi în aplicație (Facturare, Companii, Contracte, Montaj, Stoc echipamente, ' +
    'Cereri de la clienți); tu doar arăți unde, nu faci nimic.\n' +
    'Cifrele, numai din ce au întors uneltele. Dacă datele nu ajung pentru o cauză, spune asta pe scurt; nu ghici.';
}
// Partea fixă a instrucțiunilor (în cache); ora și ziua vin în contextul întrebării.
function instructiuni(scrisul) {
  return 'Ești asistentul fondatorilor RA Track (Alin și Robert). RA Track vinde monitorizare GPS pentru flote: aparate montate pe mașinile ' +
    'clienților, abonament lunar pe mașină, oferte, contracte, montaj prin instalatori parteneri, facturi. Vorbești DOAR cu fondatorii.\n' +
    'Răspunzi numai din datele firmei, citite cu uneltele: firmele clienți, facturile și încasările, contractele, montajul, stocul de aparate, ' +
    'cererile clienților, ce e de facturat. Dacă întrebarea cere altceva (de pildă flota unui client), spune scurt că aici răspunzi despre ' +
    'firma RA Track și unde se vede restul în aplicație.\n' +
    'REGULI: Cifrele DOAR din unelte — nu inventa și nu ghici; dacă o unealtă nu are datele, spune asta. Sumele în lei, cu punct la mii și ' +
    'virgulă la zecimale (2.915,40 lei). Datele pe ora României (30.10.2026). Începe cu răspunsul, o propoziție cu cifra, îngroșată cu **…**; ' +
    'apoi, dacă e nevoie, cel mult 6 rânduri care încep cu „- ". Fără tabele, fără titluri (#), fără emoji. Nu promite acțiuni: nu emiți ' +
    'facturi, nu suspenzi firme, nu schimbi prețuri, nu trimiți emailuri, nu ștergi nimic — spui doar unde se face, în aplicație ' +
    '(Facturare, Companii, Contracte, Montaj, Stoc echipamente, Cereri de la clienți).\n' + (scrisul || '');
}
function contextIntrebare(acum) {
  const z = _parti(Number(acum) || Date.now());
  return 'Azi e ' + ziSapt(acum) + '.' + z.y + ' (ora României).';
}
// Ce pot întreba pe loc, când întrebarea a fost a modelului și modelul nu e (cheia lipsă) sau n-a răspuns.
const PE_LOC = INTREBARI_GATA.concat([
  { text: 'Contracte care expiră', trimite: 'Contracte care expiră' }, { text: 'Ce am de facturat?', trimite: 'Ce am de facturat?' },
  { text: 'Stocul de aparate', trimite: 'Stocul de aparate' }
]);
function faraModel() {
  return { fel: 'instant', insigna: { fel: 'instant', nume: 'Asistent', eticheta: 'Instant', detaliu: 'din aplicație' },
    text: 'La întrebarea asta răspunde modelul, iar cheia lui nu e pusă pe server. Pe loc îți pot răspunde, de pildă, la:', urmari: PE_LOC };
}
function eroareModel() {
  return { fel: 'instant', insigna: { fel: 'instant', nume: 'Asistent', eticheta: 'Instant', detaliu: 'din aplicație' },
    text: 'Modelul n-a răspuns acum. Încearcă din nou peste un minut. Pe loc îți pot răspunde, de pildă, la:', urmari: PE_LOC };
}

module.exports = {
  INTREBARI_GATA, PERIOADE, SURSE, MAX_RANDURI, MAX_CUVINTE_PE_LOC, ZILE_CONTRACTE, SUBIECTE, UNELTE, SURSA_UNELTE,
  lei, zi, ziSapt, deCand, perioadaCalendar, perioadaTrecuta, perioadaComparata, firmeDin, intelege, raspunde, textSimplu, dupaModel, instructiuni, contextIntrebare,
  PE_LOC, faraModel, eroareModel, cerereRescriere, verificare, analizaAtenta, TEXT_NEGASIT
};
