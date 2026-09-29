// verify_insight_bani.js — „Utilizare RA Insight": telefonul arată aceleași sume ca web-ul.
//
//   node verify_insight_bani.js
//
// Regula casei: telefonul nu socotește bani. Serverul (/api/admin/ai-usage) trimite gata socotite doar venitul,
// costul și profitul lunii; restul cifrelor ecranului (profitul pe firmă și pe lună, totalurile istoricului, marja,
// media pe cont, costul pe întrebare, tendința) le socotește web-ul în pagină (_aiuKpiuri, _aiuIstoric, _aiuCard,
// _aiuStatistici, _aiuTendinta). Telefonul le are într-un singur loc, mobile/src/components/insightBani.ts, copiate
// de pe web — până le trimite serverul (cerere la F2). Proba asta ține cele două copii legate: rulează blocul web
// („Panoul RA Insight pe firme" din public/index.html) și insightBani.ts pe ACELEAȘI date și compară cifrele.
//
// Cum: blocul web rulează într-un vm, cu `_aiuLei` / `_aiuNr` înlocuite cu niște etichete care păstrează suma
// NEROTUNJITĂ (⟦L:12.3456⟧). Două sume sunt „aceleași" doar dacă sunt același număr (fără zgomot de virgulă mobilă)
// ȘI se scriu la fel („45 lei (9 €)"). Nu ne ajunge „aproape": o diferență de o zecime de ban, la o graniță de
// rotunjire, schimbă cifra de pe ecran (așa s-a prins marja 90% pe telefon vs. 91% pe web, când telefonul folosea
// costul rotunjit de server). Separat, verificăm că o sumă, un număr de întrebări și o lună se scriu la fel.
//
// Nu pornește serverul și nu are nevoie de rețea. Are nevoie de TypeScript din mobile/node_modules (e acolo
// oricum pentru `tsc` pe aplicația de telefon).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, rele = 0;
const detalii = [];
const T = (n, c, d) => { if (c) { ok++; } else { rele++; if (detalii.length < 25) detalii.push('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => { flush(); console.log('\n' + s); };
let okSect = 0, releSect = 0;
function flush() {
  const o = ok - okSect, r = rele - releSect;
  if (o || r) console.log('  ' + (r ? '✗' : '✓') + ' ' + o + ' verificări bune' + (r ? ', ' + r + ' greșite' : ''));
  detalii.splice(0).forEach((l) => console.log(l));
  okSect = ok; releSect = rele;
}

// ── 1. Blocul web ────────────────────────────────────────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const A = '// ─── începe „Panoul RA Insight pe firme"', Z = '// ─── sfârșit „Panoul RA Insight pe firme"';
const ia = HTML.indexOf(A), iz = HTML.indexOf(Z);
if (ia < 0 || iz < 0 || iz < ia) { console.log('✗ nu găsesc blocul „Panoul RA Insight pe firme" în public/index.html'); process.exit(1); }
const BLOC = HTML.slice(ia, iz);
const mNrI = HTML.match(/window\._raxNrI = function \(n\) \{[^\n]*\};/);
if (!mNrI) { console.log('✗ nu găsesc window._raxNrI în public/index.html'); process.exit(1); }

const CURS = { v: 5 };
function webCtx(etichete) {
  const ctx = {
    console, Math, Number, String, Date, Array, Object, isFinite,
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.window = { raFx: () => ({ eur: CURS.v }) };
  vm.createContext(ctx);
  vm.runInContext(mNrI[0] + '\n' + BLOC, ctx, { filename: 'index.html#ra-insight' });
  ctx._raxNrI = ctx.window._raxNrI;
  if (etichete) {
    // Suma rămâne în HTML nerotunjită, ca s-o putem compara ca număr.
    ctx._aiuLei = (v) => '⟦L:' + (Number(v) || 0) + '⟧';
    ctx._aiuNr = (v) => '⟦N:' + (Number(v) || 0) + '⟧';
  }
  return ctx;
}
const W = webCtx(true);    // pentru cifre
const W0 = webCtx(false);  // pentru felul în care se scrie o sumă
for (const f of ['_aiuKpiuri', '_aiuIstoric', '_aiuCard', '_aiuAvertismente', '_aiuStatistici', '_aiuTendinta', '_aiuEstimare', '_aiuLunaNume']) {
  if (typeof W[f] !== 'function') { console.log('✗ blocul web nu mai are funcția ' + f + ' — actualizează proba (și insightBani.ts)'); process.exit(1); }
}

// ── 2. Copia de pe telefon ───────────────────────────────────────────────────────────────────────────
let ts;
// Local: cel din aplicația de telefon. În CI nu se instalează aplicația de telefon, deci poarta pune doar
// TypeScript-ul, la rădăcină (ci.yml, „Install dependencies").
try { ts = require(path.join(__dirname, 'mobile', 'node_modules', 'typescript')); }
catch (e) {
  try { ts = require('typescript'); }
  catch (e2) { console.log('✗ lipsește TypeScript (rulează o dată npm install în mobile/)'); process.exit(1); }
}
const SRC = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'components', 'insightBani.ts'), 'utf8');
const JS = ts.transpileModule(SRC, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modul = { exports: {} };
new Function('module', 'exports', 'require', JS)(modul, modul.exports, require);
const P = modul.exports;

// ── Unelte ───────────────────────────────────────────────────────────────────────────────────────────
const EPS = 1e-9;
const r2 = (x) => Math.round(x * 100) / 100;
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '');
// Textul unei celule tăiate după '<td' (îi punem la loc începutul, ca să plece și restul etichetei).
const txt = (cel) => strip('<td' + (cel || '')).trim();
function intre(s, a, b, de) { const i = s.indexOf(a, de || 0); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i + a.length, j); }
const L = (h) => { const m = /⟦L:(-?[\d.e+-]+)⟧/.exec(h || ''); return m ? Number(m[1]) : null; };
const N = (h) => { const m = /⟦N:(-?[\d.e+-]+)⟧/.exec(h || ''); return m ? Number(m[1]) : null; };
// Același număr și același text pe ecran (sumă întreagă „lei (€)", respectiv număr scurt ca „0.35").
const aproape = (a, b) => a != null && b != null && Math.abs(a - b) <= EPS && W0._aiuNr(a) === W0._aiuNr(b);
const sumaEq = (nume, web, tel) => T(nume, aproape(web, tel) && W0._aiuLei(web) === W0._aiuLei(tel), 'web ' + web + ' · telefon ' + tel);
function carduri(html) {
  const o = {};
  String(html).split('<div class="aiu-kpi').slice(1).forEach((ch) => {
    const cap = strip(intre(ch, '<div class="cap">', '</div>') || '').trim();
    o[cap] = { val: intre(ch, '<div class="val">', '</div>') || '', html: ch };
  });
  return o;
}

// ── Date de probă, cu forma exactă a răspunsului /api/admin/ai-usage ──────────────────────────────────
// Sumarul se face ca în server.js (GET /api/admin/ai-usage): costEur și venitLei adunați și rotunjiți la ban,
// totalCostLei / profitLei socotiți din ei cu cursul zilei.
function sumar(rows, fx, istoric) {
  const cuModul = rows.filter((r) => r.enabled);
  const costEur = r2(rows.reduce((s, r) => s + r.costEur, 0));
  const venitLei = r2(rows.reduce((s, r) => s + r.venitLei, 0));
  return {
    companies: rows.length, withFeature: cuModul.length, active: cuModul.filter((r) => r.used > 0).length,
    adoptionPct: 0,
    conturi: rows.reduce((s, r) => s + r.deFacturat, 0),
    fond: rows.reduce((s, r) => s + (r.fond || 0), 0),
    totalCalls: rows.reduce((s, r) => s + r.used, 0),
    epuizate: rows.filter((r) => r.epuizat).length,
    totalCostEur: costEur,
    totalCostLei: r2(costEur * fx),
    totalVenitLei: venitLei,
    profitLei: r2(venitLei - costEur * fx),
    istoricFacturatLei: r2(istoric.reduce((s, m) => s + m.facturatLei, 0)),
    istoricIncasatLei: r2(istoric.reduce((s, m) => s + m.incasatLei, 0)),
    istoricLuni: istoric.length,
  };
}
function firma(id, o) {
  const conturi = o.conturi || 0, deFacturat = Math.max(conturi, o.deFacturat || 0);
  const peCont = o.peCont || 0, pretCont = o.pretCont || 0;
  const fond = peCont > 0 ? conturi * peCont : (o.fondVechi || 0);
  const used = o.used || 0;
  return {
    id, name: 'Firma ' + id, enabled: o.enabled !== false, conturi, deFacturat, peCont, pretCont, fond,
    vechi: !peCont && !!o.fondVechi, used, ramase: fond ? Math.max(0, fond - used) : null,
    pct: fond ? Math.round((used / fond) * 100) : null, epuizat: !!fond && used >= fond,
    costEur: r2(o.costEur || 0), venitLei: pretCont > 0 ? r2(deFacturat * pretCont) : 0,
    lastUsed: null, contFaraFolos: 0, folosFaraCont: 0, contPeInactiv: 0, oameni: [],
    facturatLei: r2(o.facturatLei || 0), incasatLei: r2(o.incasatLei || 0),
  };
}
function luni12(lista) {
  const acum = new Date(), chei = [];
  for (let i = 11; i >= 0; i--) chei.push(new Date(Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return chei.map((luna, i) => Object.assign({ luna, intrebari: 0, firme: 0, costEur: 0, facturatLei: 0, incasatLei: 0, conturi: 0, firmeFacturate: 0, estimatLei: 0 }, lista[i] || {}));
}
function raspuns(rows, istoric, fx, cuCampuriServer) {
  const s = sumar(rows, fx, istoric);
  istoric[istoric.length - 1].estimatLei = s.totalVenitLei;   // luna curentă, încă nefacturată, primește estimarea
  if (!cuCampuriServer) { delete s.totalCostLei; delete s.profitLei; }
  return { rows, summary: s, istoric, fxEur: fx };
}

// Scenariile cu nume: situațiile pe care fondatorii le văd de fapt.
const SCENARII = [];
{
  const rows = [firma(1, { conturi: 2, peCont: 50, used: 31, costEur: 1.37 }), firma(2, { conturi: 0, peCont: 50 }), firma(3, { enabled: false })];
  SCENARII.push(['început de drum: se folosește, nu plătește nimeni', raspuns(rows, luni12({ 11: { intrebari: 31, costEur: 1.37 } }), 4.9765, true)]);
}
{
  const rows = [
    firma(1, { conturi: 3, deFacturat: 4, peCont: 100, pretCont: 29, used: 240, costEur: 9.81, facturatLei: 812.5, incasatLei: 696 }),
    firma(2, { conturi: 1, peCont: 50, pretCont: 19, used: 50, costEur: 2.2, facturatLei: 95, incasatLei: 95 }),
    firma(3, { conturi: 2, peCont: 150, used: 12, costEur: 0.41 }),
    firma(4, { fondVechi: 200, used: 77, costEur: 3.05 }),
  ];
  const ist = luni12({
    5: { intrebari: 90, costEur: 3.4, facturatLei: 116, incasatLei: 116, conturi: 4 },
    6: { intrebari: 0 },
    7: { intrebari: 140, costEur: 5.12, facturatLei: 145, incasatLei: 145, conturi: 5 },
    8: { intrebari: 160, costEur: 6.02, facturatLei: 174, incasatLei: 116, conturi: 6 },
    9: { intrebari: 210, costEur: 8.77, facturatLei: 203, incasatLei: 145, conturi: 7 },
    10: { intrebari: 280, costEur: 11.9, facturatLei: 232, incasatLei: 174, conturi: 8 },
    11: { intrebari: 379, costEur: 15.47 },
  });
  SCENARII.push(['plătesc: istoric plin, o lună moartă la mijloc, luna curentă estimată', raspuns(rows, ist, 5.0421, true)]);
  SCENARII.push(['la fel, de la un server fără totalCostLei/profitLei', raspuns(JSON.parse(JSON.stringify(rows)), JSON.parse(JSON.stringify(ist)), 5.0421, false)]);
}
{
  const rows = [firma(1, { conturi: 1, peCont: 50, pretCont: 19, used: 50, costEur: 7.9 })];
  const ist = luni12({ 9: { intrebari: 40, costEur: 6.1, facturatLei: 19, incasatLei: 0, conturi: 1 }, 10: { intrebari: 45, costEur: 7.4 }, 11: { intrebari: 50, costEur: 7.9, facturatLei: 19, conturi: 1 } });
  SCENARII.push(['pe pierdere, luna trecută zero (fără săgeată), luna curentă deja facturată', raspuns(rows, ist, 4.9712, true)]);
}
{
  const rows = [firma(1, { conturi: 2, peCont: 50, pretCont: 29, used: 10, costEur: 0.5 })];
  const ist = luni12({ 10: { intrebari: 30, costEur: 1.2, facturatLei: 58, incasatLei: 58, conturi: 2 }, 11: { intrebari: 10, costEur: 0.5, facturatLei: -29, conturi: -1 } });
  SCENARII.push(['storno în luna curentă (factură negativă)', raspuns(rows, ist, 5, true)]);
}
SCENARII.push(['nimic: nicio firmă cu RA Insight, istoric gol', raspuns([firma(1, { enabled: false }), firma(2, { enabled: false })], luni12({}), 5.0, true)]);

// Și câteva sute la întâmplare (cu sămânță fixă, ca proba să dea mereu același rezultat).
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20260924);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const alege = (l) => l[Math.floor(rnd() * l.length)];
const ALEATOARE = 400;
for (let k = 0; k < ALEATOARE; k++) {
  const fx = Math.round((4.9 + rnd() * 0.25) * 10000) / 10000;
  const rows = [];
  for (let i = 1, nf = int(0, 6); i <= nf; i++) {
    const peCont = alege([0, 50, 100, 150, 200]);
    const conturi = int(0, 6);
    const fondVechi = peCont ? 0 : alege([0, 0, 200, 500]);
    const fond = peCont ? conturi * peCont : fondVechi;
    const used = fond ? int(0, Math.round(fond * 1.1)) : int(0, 300);
    const facturat = rnd() < 0.5 ? r2(rnd() * 900) : 0;
    rows.push(firma(i, {
      enabled: rnd() < 0.85, conturi, deFacturat: conturi + (rnd() < 0.2 ? int(1, 2) : 0), peCont, fondVechi,
      pretCont: alege([0, 19, 29, 49, 59, 24.5, 33.33]), used, costEur: used * (0.004 + rnd() * 0.02),
      facturatLei: facturat, incasatLei: rnd() < 0.5 ? facturat : r2(facturat * rnd()),
    }));
  }
  const lista = {};
  for (let i = int(0, 11); i <= 11; i++) {
    if (rnd() < 0.15) continue;   // o lună moartă la mijloc
    const f = i === 11 ? (rnd() < 0.25 ? r2(rnd() * 600) : 0) : (rnd() < 0.8 ? r2(rnd() * 900 - (rnd() < 0.08 ? 950 : 0)) : 0);
    lista[i] = { intrebari: int(0, 500), costEur: r2(rnd() * 25), facturatLei: f, incasatLei: f > 0 && rnd() < 0.6 ? f : r2(Math.max(0, f) * rnd()), conturi: int(0, 12) };
  }
  SCENARII.push(['aleator #' + k, raspuns(rows, luni12(lista), fx, rnd() < 0.8)]);
}

// ── 3. Felul în care se scrie o sumă ─────────────────────────────────────────────────────────────────
sect('1. Cum se scrie o sumă, un număr de întrebări, o lună (web _aiuNr / _aiuLei / _raxNrI / _aiuLunaNume)');
const VALORI = [-950, -12.5, -0.005, 0, 0.004, 0.005, 0.04, 0.1, 0.35, 1.005, 2.5, 9.994, 9.995, 9.999, 10, 10.5, 12.495, 12.5, 45, 123.456, 999.5, 1e6];
for (const v of VALORI) T('suma ' + v, P.nr(v) === W0._aiuNr(v), 'web „' + W0._aiuNr(v) + '" · telefon „' + P.nr(v) + '"');
for (const fx of [5, 4.9765]) {
  CURS.v = fx;
  for (const v of VALORI) {
    const tel = P.nr(v) + ' lei (' + P.nr((Number(v) || 0) / fx) + ' €)';   // <Lei> din AiUsage.tsx
    T('„lei (€)" pentru ' + v + ' la cursul ' + fx, strip(W0._aiuLei(v)) === tel, 'web „' + strip(W0._aiuLei(v)) + '" · telefon „' + tel + '"');
  }
}
for (const k of [0, 1, 2, 19, 20, 21, 100, 101, 119, 120, 1000]) T('întrebări ' + k, P.intrebari(k) === W0._raxNrI(k), 'web „' + W0._raxNrI(k) + '" · telefon „' + P.intrebari(k) + '"');
for (const l of ['2026-01', '2026-09', '2025-12']) T('luna ' + l, P.lunaNume(l) === W0._aiuLunaNume(l), W0._aiuLunaNume(l) + ' · ' + P.lunaNume(l));

// ── 4. Cifrele, scenariu cu scenariu ─────────────────────────────────────────────────────────────────
function verifica(nume, d) {
  const s = d.summary, rows = d.rows, ist = d.istoric, fx = d.fxEur;
  // Cursul paginii (al nostru, pus de mână) DIFERIT de cel din răspuns — cazul din 24.09, când cartonașele
  // web luau cursul paginii și telefonul pe cel din răspuns. Ca raxLoadAiUsage, dăm blocului cursul din
  // răspuns; dacă o funcție a blocului ar citi cursul paginii direct, sumele în € s-ar despărți.
  CURS.v = fx + 0.37;
  W._aiuFxResp = fx; W0._aiuFxResp = fx;
  const c = P.cifreLuna(s, ist, fx);
  const venit = Number(s.totalVenitLei) || 0;

  // Cartonașele lunii curente.
  const k = carduri(W._aiuKpiuri(s, rows, ist, fx));
  sumaEq(nume + ' · Încasăm', L(k['Încasăm'] && k['Încasăm'].val), c.venitLei);
  sumaEq(nume + ' · Ne costă', L(k['Ne costă'] && k['Ne costă'].val), c.costLei);
  sumaEq(nume + ' · Profit', L(k['Profit'] && k['Profit'].val), c.profitLei);
  const mj = /marjă (-?\d+)%/.exec((k['Profit'] || {}).html || '');
  T(nume + ' · marja lunii', venit > 0 ? (mj && Number(mj[1]) === c.marja) : (!mj && c.marja == null), 'web ' + (mj && mj[1]) + ' · telefon ' + c.marja);
  const pc = /× (⟦N:[^⟧]*⟧) lei în medie/.exec((k['Încasăm'] || {}).html || '');
  T(nume + ' · media pe cont', pc ? aproape(N(pc[1]), c.peContLei) : !c.peContLei, 'web ' + (pc && N(pc[1])) + ' · telefon ' + c.peContLei);
  const unCont = /un cont aduce (⟦L:[^⟧]*⟧)/.exec((k['Conturi de facturat'] || {}).html || '');
  T(nume + ' · „un cont aduce"', unCont ? aproape(L(unCont[1]), c.peContLei) : !c.peContLei, 'web ' + (unCont && L(unCont[1])) + ' · telefon ' + c.peContLei);
  const pi = /· (⟦N:[^⟧]*⟧) lei una/.exec((k['Ne costă'] || {}).html || '');
  T(nume + ' · costul pe întrebare', pi ? aproape(N(pi[1]), c.peIntrebareLei) : !c.peIntrebareLei, 'web ' + (pi && N(pi[1])) + ' · telefon ' + c.peIntrebareLei);
  const sg = /(▲ \+|▼ )(-?\d+)%<\/span> față de luna trecută/.exec((k['Încasăm'] || {}).html || '');
  const tw = W._aiuTendinta(ist);
  T(nume + ' · tendința', sg ? (!!c.tendinta && Number(sg[2]) === c.tendinta.pct && /\(estimat\)/.test(k['Încasăm'].html) === c.tendinta.estimat) : !c.tendinta,
    'web ' + JSON.stringify(tw) + ' · telefon ' + JSON.stringify(c.tendinta));

  // Banda „Nicio firmă nu plătește RA Insight" — costul lunii.
  const av = W._aiuAvertismente(s, rows);
  if (/Nicio firmă nu plătește/.test(av)) sumaEq(nume + ' · banda „nu plătește nimeni"', L(av), P.costLunaLei(s, fx));

  // Istoricul.
  const hi = W._aiuIstoric(ist, fx);
  const luni = P.luniCuViata(ist);
  if (!luni.length) { T(nume + ' · istoric gol', /Încă nu e nimic de arătat aici/.test(hi)); }
  else {
    T(nume + ' · câte luni se arată', hi.indexOf('ultimele ' + luni.length + (luni.length === 1 ? ' lună' : ' luni')) >= 0, 'telefon ' + luni.length);
    const st = P.statIstoric(luni, fx, d.istoricStat);
    const kw = carduri(intre(hi, '', '<div class="aiu-ist-wrap">') || hi);
    sumaEq(nume + ' · istoric Facturat', L(kw['Facturat'] && kw['Facturat'].val), st.facturatLei);
    sumaEq(nume + ' · istoric Intrat în cont', L(kw['Intrat în cont'] && kw['Intrat în cont'].val), st.incasatLei);
    const ni = /(⟦N:[^⟧]*⟧) lei încă neplătiți/.exec((kw['Intrat în cont'] || {}).html || '');
    T(nume + ' · istoric neîncasat', ni ? aproape(N(ni[1]), st.neincasatLei) && st.neincasatLei > 0.01 : !(st.neincasatLei > 0.01), 'web ' + (ni && N(ni[1])) + ' · telefon ' + st.neincasatLei);
    const ri = /rată de încasare (-?\d+)%/.exec((kw['Intrat în cont'] || {}).html || '');
    T(nume + ' · rata de încasare', ri ? Number(ri[1]) === st.rataIncasare : st.rataIncasare == null, 'web ' + (ri && ri[1]) + ' · telefon ' + st.rataIncasare);
    sumaEq(nume + ' · istoric Profit', L(kw['Profit'] && kw['Profit'].val), st.profitLei);
    const mi = /marjă (-?\d+)%/.exec((kw['Profit'] || {}).html || '');
    T(nume + ' · marja istoricului', mi ? Number(mi[1]) === st.marja : st.marja == null, 'web ' + (mi && mi[1]) + ' · telefon ' + st.marja);
    const sw = W._aiuStatistici(luni, fx);
    T(nume + ' · _aiuStatistici (rată, marjă)', sw.rataIncasare === st.rataIncasare && sw.marja === st.marja, JSON.stringify(sw) + ' · ' + JSON.stringify(st));

    // Rândurile tabelului, lună cu lună.
    const randuri = (intre(hi, '<tbody>', '</tbody>') || '').split('<tr').slice(1);
    T(nume + ' · rânduri în tabel', randuri.length === luni.length, 'web ' + randuri.length + ' · telefon ' + luni.length);
    randuri.forEach((rd, i) => {
      const m = luni[i]; if (!m) return;
      const cel = rd.split('<td').slice(1);
      const eti = nume + ' · ' + m.luna;
      T(eti + ' · estimată', /^ class="est"/.test(rd) === (P.estimare(m) > 0));
      const cost = P.costLunaIstLei(m, fx);
      T(eti + ' · a costat', cost ? aproape(L(cel[2]), cost) : txt(cel[2]) === '—', 'web ' + L(cel[2]) + ' · telefon ' + cost);
      const bani = P.baniLuna(m);
      T(eti + ' · facturat', bani ? aproape(L(cel[3]), bani) : /^—/.test(txt(cel[3])), 'web ' + L(cel[3]) + ' · telefon ' + bani);
      const ne = P.neincasatLunaLei(m);
      const nw = /(⟦N:[^⟧]*⟧) lei neîncasați/.exec(cel[4] || '');
      T(eti + ' · neîncasat', nw ? aproape(N(nw[1]), ne) && ne > 0.01 : !(ne > 0.01), 'web ' + (nw && N(nw[1])) + ' · telefon ' + ne);
      sumaEq(eti + ' · profit', L(cel[5]), P.profitLunaIst(m, fx));
    });
    const tf = (intre(hi, '<tfoot>', '</tfoot>') || '').split('<td').slice(1);
    T(nume + ' · total întrebări', txt(tf[1]) === String(st.intrebari), txt(tf[1]) + ' · ' + st.intrebari);
    sumaEq(nume + ' · total a costat', L(tf[2]), st.costLei);
    sumaEq(nume + ' · total facturat', L(tf[3]), st.facturatLei);
    sumaEq(nume + ' · total intrat în cont', L(tf[4]), st.incasatLei);
    sumaEq(nume + ' · total profit', L(tf[5]), st.profitLei);
  }

  // Firmă cu firmă.
  rows.forEach((r) => {
    const h = W._aiuCard(r, true);
    const bani = intre(h, '<div class="aiu-bani">', '</div>');
    T(nume + ' · ' + r.name + ' · are rândul de bani doar cu RA Insight', !!bani === !!r.enabled);
    if (!bani) return;
    sumaEq(nume + ' · ' + r.name + ' · ne costă', L(intre(bani, 'ne costă ', '</span>')), P.costFirmaLei(r, fx));
    if (r.venitLei > 0) sumaEq(nume + ' · ' + r.name + ' · profit', L(intre(bani, 'profit <b', '</b>')), P.profitFirmaLei(r, fx));
    else T(nume + ' · ' + r.name + ' · fără venit, fără profit', bani.indexOf('profit') < 0);
  });
}

sect('2. Scenariile pe care le văd fondatorii');
SCENARII.slice(0, SCENARII.length - ALEATOARE).forEach(([nume, d]) => verifica(nume, d));
sect('3. ' + ALEATOARE + ' de răspunsuri la întâmplare (sămânță fixă)');
SCENARII.slice(SCENARII.length - ALEATOARE).forEach(([nume, d]) => verifica(nume, d));

sect('4. Web-ul dă blocului cursul din răspuns, ca telefonul');
// Scenariile de mai sus pun ele `_aiuFxResp`; aici verificăm că și pagina adevărată o face, ÎNAINTE de cartonașe.
const LOAD = (() => { const i = HTML.indexOf('window.raxLoadAiUsage = async function'); return i < 0 ? '' : HTML.slice(i, HTML.indexOf('\n    };', i)); })();
T('raxLoadAiUsage există', !!LOAD);
const iSet = LOAD.indexOf('_aiuFxResp = Number(d.fxEur)'), iCard = LOAD.indexOf('_aiuCard(');
T('pune cursul din răspuns înainte de cartonașe', iSet > 0 && iCard > iSet, 'set ' + iSet + ' · card ' + iCard);
T('_aiuFx preferă cursul din răspuns', /function _aiuFx\(\) \{ return _aiuFxResp \|\|/.test(BLOC));
flush();

console.log('\n' + (rele ? '✗ ' + rele + ' diferențe între telefon și web (din ' + (ok + rele) + ')' : '✓ Telefonul arată aceleași sume ca web-ul (' + ok + ' verificări)'));
process.exit(rele ? 1 : 0);
