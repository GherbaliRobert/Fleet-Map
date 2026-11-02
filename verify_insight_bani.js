// verify_insight_bani.js — „RA Insight · control": telefonul arată aceleași sume și aceleași texte ca web-ul.
//
//   node verify_insight_bani.js
//
// Regula casei: telefonul nu socotește bani. Serverul (/api/admin/ai-usage) trimite gata cifrele mari; puținul pe care îl socotește
// pagina din două cifre ale lui (ce ne rămâne din total, costul unei firme pe regula veche, totalurile istoricului, marja) stă pe
// telefon într-un singur loc, mobile/src/components/insightBani.ts, copiat de pe web. Proba ține cele două copii legate: rulează
// blocul web („Panoul RA Insight pe firme" din public/index.html) și insightBani.ts pe ACELEAȘI date și compară cifrele și textele.
//
// Cum: blocul web rulează într-un vm, cu `_aiuLei` / `_aiuNr` înlocuite cu niște etichete care păstrează suma
// NEROTUNJITĂ (⟦L:12.3456⟧). Două sume sunt „aceleași" doar dacă sunt același număr (fără zgomot de virgulă mobilă)
// ȘI se scriu la fel („45 lei (9 €)"). Nu ne ajunge „aproape": o diferență de o zecime de ban, la o graniță de
// rotunjire, schimbă cifra de pe ecran (așa s-a prins marja 90% pe telefon vs. 91% pe web, când telefonul folosea
// costul rotunjit de server). Separat, verificăm că o sumă, un număr de întrebări și o lună se scriu la fel.
//
// Din 02.11 telefonul are pagina nouă (cele patru cifre, „Ce cere atenție", un rând pe firmă, „Sursă externă", istoricul), deci
// formulele panoului vechi, ținute aici ca REFERINTA din 19.10, au plecat odată cu el, din insightBani.ts și de aici.
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
if (/function _aiuKpiuri|function _aiuCard\b/.test(BLOC)) { console.log('✗ panoul vechi a revenit în pagină (_aiuKpiuri / _aiuCard), iar telefonul nu-l mai are'); process.exit(1); }
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
for (const f of ['_aiuPachete', '_aiuAtentie', '_aiuTabel', '_aiuSursa', '_aiuIstoric', '_aiuAvertismente', '_aiuStatistici', '_aiuEstimare', '_aiuLunaNume', '_aiuSocoteala', '_aiuSemnale', '_aiuOameni', '_aiuPachetRand', '_aiuUndeConturi']) {
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
// Două texte se compară fără spații și fără **: pe web, bucățile sunt lipite de marcaj, pe telefon de rânduri separate.
const entitati = (t) => String(t || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const curat = (h) => entitati(strip(h)).replace(/Conturi & Abonamente/g, P.UNDE_PRET).replace(/\s+/g, '');
const fara = (t) => String(t == null ? '' : t).replace(/\*\*/g, '').replace(/\s+/g, '');
// Pe web prețul pe cont se pune din „Conturi & Abonamente", ecran pe care telefonul nu-l are: acolo, fișa firmei.
const unde = (t) => String(t);
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
  const pk = o.pachet || null;   // { cod, nume, pretRON, ai, intrebari }: ca plans.pachetAi + _insightFirma
  const conturi = o.conturi || 0, deFacturat = pk ? conturi : Math.max(conturi, o.deFacturat || 0);
  const peCont = pk ? 0 : (o.peCont || 0), pretCont = pk ? 0 : (o.pretCont || 0);
  const fond = pk ? pk.intrebari : (peCont > 0 ? conturi * peCont : (o.fondVechi || 0));
  const used = o.used || 0;
  const costPlasa = o.costPlasaLei || 0;
  const plafon = pk && pk.ai ? r2((pk.pretRON || 0) * 0.8) : 0;
  return {
    id, name: 'Firma ' + id + (o.semn || ''), enabled: o.enabled !== false, conturi, deFacturat, peCont, pretCont, fond,
    vechi: !pk && !peCont && !!o.fondVechi, used, ramase: fond ? Math.max(0, fond - used) : null,
    pachet: pk ? { cod: pk.cod, nume: pk.nume, pretRON: pk.pretRON, ai: pk.ai } : null,
    plasa: pk && pk.ai ? { plafonLei: plafon, costLei: r2(costPlasa), procent: plafon > 0 ? Math.round(Math.min(9.99, costPlasa / plafon) * 100) : 0 } : null,
    ramanLei: pk ? r2((pk.pretRON || 0) - costPlasa) : null,
    pct: fond ? Math.round((used / fond) * 100) : null, epuizat: !!fond && used >= fond,
    costEur: r2(o.costEur || 0), venitLei: pk ? r2(pk.pretRON || 0) : (pretCont > 0 ? r2(deFacturat * pretCont) : 0),
    lastUsed: o.lastUsed || null, contFaraFolos: o.contFaraFolos || 0, folosFaraCont: o.folosFaraCont || 0, contPeInactiv: o.contPeInactiv || 0, oameni: o.oameni || [],
    facturatLei: r2(o.facturatLei || 0), incasatLei: r2(o.incasatLei || 0),
    instant: o.instant || 0, jos7: o.jos7 || 0, sursa: o.sursa || null,
  };
}
const SE = require('./sursa_externa');
const OM = (id, nume, loc, activ, used, lastUsed) => ({ id, nume, loc, activ, used, lastUsed: lastUsed || null });
const PK = {
  start: { cod: 'start', nume: 'Start', pretRON: 0, ai: false, intrebari: 50 }, basic: { cod: 'basic', nume: 'Basic', pretRON: 10, ai: true, intrebari: 200 },
  pro: { cod: 'pro', nume: 'Pro', pretRON: 22.5, ai: true, intrebari: 600 }, business: { cod: 'business', nume: 'Business', pretRON: 30, ai: true, intrebari: 1000 },
};
function luni12(lista) {
  const acum = new Date(), chei = [];
  for (let i = 11; i >= 0; i--) chei.push(new Date(Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return chei.map((luna, i) => Object.assign({ luna, intrebari: 0, firme: 0, costEur: 0, facturatLei: 0, incasatLei: 0, conturi: 0, firmeFacturate: 0, estimatLei: 0 }, lista[i] || {}));
}
// `pachete` și `sursa`, cu forma din GET /api/admin/ai-usage.
function sumarPachete(rows, o) {
  const cu = rows.filter((r) => r.pachet && r.enabled), peCod = { start: 0, basic: 0, pro: 0, business: 0 };
  cu.forEach((r) => { peCod[r.pachet.cod]++; });
  return Object.assign({
    peCod, venitLei: r2(cu.reduce((s, r) => s + r.venitLei, 0)), costLei: r2(cu.reduce((s, r) => s + (r.plasa ? r.plasa.costLei : 0), 0)),
    langaPlasa: cu.filter((r) => r.plasa && r.plasa.procent >= 60).map((r) => ({ id: r.id, name: r.name, cod: r.pachet.cod, nume: r.pachet.nume, procent: r.plasa.procent, plafonLei: r.plasa.plafonLei })).sort((a, b) => b.procent - a.procent),
    sold: null, jos7: rows.reduce((s, r) => s + r.jos7, 0), instant: rows.reduce((s, r) => s + r.instant, 0), intrebariAi: rows.reduce((s, r) => s + r.used, 0), corecturi: null,
  }, o || {});
}
function sumarSursa(o) {
  const a = Object.assign({ stare: 'noi', model: '', modelOk: null, eroare: null, intrebari: 0, cautari: 0, costLei: 0 }, o || {});
  a.stari = SE.STARI.map((k) => ({ k, t: SE.TEXT_STARI[k], d: SE.DESCRIERE_STARI[k] })); a.peLuna = SE.PE_PACHET;
  return a;
}
function raspuns(rows, istoric, fx, cuCampuriServer, extra) {
  const s = sumar(rows, fx, istoric);
  istoric[istoric.length - 1].estimatLei = s.totalVenitLei;   // luna curentă, încă nefacturată, primește estimarea
  if (!cuCampuriServer) { delete s.totalCostLei; delete s.profitLei; }
  return { rows, summary: s, istoric, fxEur: fx, pachete: sumarPachete(rows, extra && extra.pachete), sursa: extra && extra.faraSursa ? null : sumarSursa(extra && extra.sursa) };
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
SCENARII.push(['nimic: nicio firmă cu RA Insight, istoric gol', raspuns([firma(1, { enabled: false }), firma(2, { enabled: false })], luni12({}), 5.0, true, { faraSursa: true })]);
{
  const azi = Date.UTC(2026, 10, 2, 9), oameni = [OM(1, 'Maria <b>Pop</b>', true, true, 12, azi), OM(2, 'Ion', true, false, 0), OM(3, 'Dan', false, true, 3, azi)];
  const rows = [
    firma(1, { pachet: PK.pro, conturi: 3, used: 610, costPlasaLei: 19.5, instant: 40, jos7: 3, oameni, contPeInactiv: 1, folosFaraCont: 1, lastUsed: azi, sursa: { intrebari: 3, cautari: 5, costLei: 0.26 } }),
    firma(2, { pachet: PK.basic, conturi: 1, used: 170, costPlasaLei: 5, contFaraFolos: 1, jos7: 1, facturatLei: 30, incasatLei: 30, oameni: [OM(4, 'Ana', true, true, 0)] }),
    firma(3, { pachet: PK.start, conturi: 1, used: 50, instant: 50, oameni: [OM(5, 'Vasile', true, true, 0)] }),
    firma(4, { pachet: PK.business, conturi: 0, used: 0 }),
    firma(5, { conturi: 2, peCont: 50, pretCont: 17, used: 30, costEur: 0.8, deFacturat: 3, facturatLei: 100, incasatLei: 40 }),
    firma(6, { fondVechi: 200, used: 77, costEur: 3.05 }),
    firma(7, { conturi: 2, peCont: 100, used: 9, costEur: 0.2 }),
    firma(8, { used: 5, costEur: 0.1 }),
    firma(9, { enabled: false }), firma(10, { enabled: false }),
  ];
  const sold = { usd: 1234.5, scris: 1300, la: azi, cheltuit: 65.5, peZi: 2, zile: 21, ritmZile: 7 };
  SCENARII.push(['pachete: plasă atinsă, 👎, corecturi, sold, sursă cu eroare', raspuns(rows, luni12({ 11: { intrebari: 860, costEur: 3.2 } }), 5.0421, true, {
    pachete: { sold, corecturi: { rescrise: 12, cifre: 7, litere: 3, echipament: 2, ramase: 2 } },
    sursa: { stare: 'firme', model: 'Modelul primește căutarea.', modelOk: true, eroare: 'rețea', intrebari: 1, cautari: 21, costLei: 1.5 },
  })]);
  SCENARII.push(['pachete: sold fără ritm, corecturi fără nimic rămas, model refuzat', raspuns(JSON.parse(JSON.stringify(rows)), luni12({}), 4.9765, true, {
    pachete: { sold: { usd: 100, scris: 100, la: azi, zile: null, ritmZile: 7 }, corecturi: { rescrise: 0, cifre: 0, litere: 0, echipament: 0, ramase: 0 } },
    sursa: { stare: 'oprita', model: 'Modelul NU primește căutarea.', modelOk: false },
  })]);
  SCENARII.push(['pachete: sold pe 20 și 100 de zile', raspuns([firma(1, { pachet: PK.basic, conturi: 1, used: 1, costPlasaLei: 12 })], luni12({}), 5, true, { pachete: { sold: { usd: 5000, zile: 120 } } })]);
  SCENARII.push(['o singură firmă pe regula veche, fără preț', raspuns([firma(1, { conturi: 1, peCont: 50, used: 2, costEur: 0.1 })], luni12({}), 5, true)]);
}

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
    const pkA = rnd() < 0.5 ? alege([PK.start, PK.basic, PK.pro, PK.business]) : null;
    rows.push(firma(i, {
      pachet: pkA, costPlasaLei: pkA && pkA.ai ? rnd() * (pkA.pretRON * 1.2) : 0, instant: int(0, 60), jos7: rnd() < 0.2 ? int(1, 5) : 0,
      contFaraFolos: rnd() < 0.2 ? int(1, 3) : 0, folosFaraCont: rnd() < 0.1 ? int(1, 2) : 0, contPeInactiv: rnd() < 0.1 ? int(1, 2) : 0,
      lastUsed: rnd() < 0.5 ? Date.UTC(2026, 9, int(1, 28)) : null,
      oameni: rnd() < 0.5 ? [OM(1, 'Om ' + i, rnd() < 0.7, rnd() < 0.8, int(0, 25), rnd() < 0.5 ? Date.UTC(2026, 9, 3) : null)] : [],
      sursa: rnd() < 0.2 ? { intrebari: int(1, 9), cautari: int(1, 20), costLei: r2(rnd() * 3) } : null,
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
  const zile = rnd() < 0.5 ? int(0, 250) : null;
  SCENARII.push(['aleator #' + k, raspuns(rows, luni12(lista), fx, rnd() < 0.8, {
    pachete: { sold: rnd() < 0.5 ? { usd: r2(rnd() * 2000), scris: r2(rnd() * 3000), la: rnd() < 0.8 ? Date.UTC(2026, 9, 5) : null, zile, ritmZile: 7 } : null,
      corecturi: rnd() < 0.5 ? { rescrise: int(0, 200), cifre: int(0, 100), litere: int(0, 3), echipament: int(0, 21), ramase: int(0, 2) } : null },
    sursa: { stare: alege(SE.STARI), model: 'Model', modelOk: alege([true, false, null]), eroare: rnd() < 0.2 ? 'x' : null, intrebari: int(0, 21), cautari: int(0, 120), costLei: r2(rnd() * 5) },
    faraSursa: rnd() < 0.1,
  })]);
}

// ── 3. Felul în care se scrie o sumă ─────────────────────────────────────────────────────────────────
sect('1. Cum se scrie o sumă, un număr de întrebări, o lună (web _aiuNr / _aiuLei / _raxNrI / _aiuLunaNume)');
const VALORI = [-950, -12.5, -0.005, 0, 0.004, 0.005, 0.04, 0.1, 0.35, 1.005, 2.5, 9.994, 9.995, 9.999, 10, 10.5, 12.495, 12.5, 45, 123.456, 999.5, 1e6];
for (const v of VALORI) T('suma ' + v, P.nr(v) === W0._aiuNr(v), 'web „' + W0._aiuNr(v) + '" · telefon „' + P.nr(v) + '"');
for (const fx of [5, 4.9765]) {
  CURS.v = fx;
  for (const v of VALORI) {
    const tel = P.lei(v, fx);
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
  // Cele patru cifre de sus: fiecare, ca sumă nerotunjită și ca text.
  const hp = W._aiuPachete(d.pachete), ht = W0._aiuPachete(d.pachete), tile = P.tilePachete(d.pachete, fx);
  const tileWeb = String(ht).split('<div class="aiu-pk-t">').slice(1);
  T(nume + ' · patru cifre sus', tileWeb.length === 4 && tile.length === 4, tileWeb.length + ' / ' + tile.length);
  tile.forEach((t, i) => {
    const b = tileWeb[i] || '';
    T(nume + ' · ' + t.k + ': titlul', curat(intre(b, '<div class="k">', '</div>')) === fara(t.k));
    T(nume + ' · ' + t.k + ': cifra', curat(intre(b, '<div class="v">', '<div class="s">')) === fara(t.v), curat(intre(b, '<div class="v">', '<div class="s">')) + ' · ' + fara(t.v));
    T(nume + ' · ' + t.k + ': rândul de sub', curat(b.slice(b.indexOf('<div class="s">'))) === fara(t.s + (t.buton ? ' · ' + t.buton : '')), curat(b.slice(b.indexOf('<div class="s">'))) + ' · ' + fara(t.s));
    if (t.ton) T(nume + ' · ' + t.k + ': culoarea', b.indexOf(t.ton === 'ok' ? 'var(--accent)' : 'var(--red)') >= 0);
  });
  const venitP = Number((d.pachete || {}).venitLei) || 0, costP = Number((d.pachete || {}).costLei) || 0;
  const sp = String(hp).split('<div class="aiu-pk-t">').slice(1);
  sumaEq(nume + ' · Încasăm', L(sp[0]), venitP);
  sumaEq(nume + ' · Ne costă', L(sp[1]), costP);
  sumaEq(nume + ' · Ne rămân', L(sp[2]), r2(venitP - costP));

  // „Ce cere atenție": aceleași rânduri, în aceeași ordine, cu aceeași culoare și cu aceeași firmă de deschis.
  const hAt = W0._aiuAtentie(d.pachete, s, rows);
  const atWeb = [...String(hAt).matchAll(/<div class="aiu-(?:alerta|at) (\w+)">([\s\S]*?)<\/span>((?:<button[\s\S]*?<\/button>)?)<\/div>/g)].map((m) => ({ ton: m[1], t: curat(m[2]), firma: (/raxOpenCompanyDetail\((\d+)\)/.exec(m[3]) || [])[1] || null }));
  const atTel = P.atentie(d.pachete, s, rows, fx);
  if (!atTel.length) T(nume + ' · „Nimic de rezolvat"', atWeb.length === 1 && atWeb[0].ton === 'ok' && atWeb[0].t === fara(P.NIMIC_ATENTIE), JSON.stringify(atWeb));
  else {
    T(nume + ' · câte rânduri cer atenție', atWeb.length === atTel.length, atWeb.length + ' / ' + atTel.length + ' ' + JSON.stringify(atWeb).slice(0, 400));
    atTel.forEach((a, i) => {
      const w = atWeb[i] || {};
      T(nume + ' · atenție #' + i + ': textul', w.t === fara(unde(a.t)), w.t + ' // ' + fara(unde(a.t)));
      T(nume + ' · atenție #' + i + ': culoarea', w.ton === a.ton, w.ton + ' / ' + a.ton);
      T(nume + ' · atenție #' + i + ': firma', String(w.firma) === String(a.firma == null ? null : a.firma), w.firma + ' / ' + a.firma);
    });
  }
  // Banda „Nicio firmă nu plătește RA Insight" — costul lunii, nerotunjit.
  const av = W._aiuAvertismente(s, rows);
  if (/Nicio firmă nu plătește/.test(av)) sumaEq(nume + ' · banda „nu plătește nimeni"', L(av), P.costLunaLei(s, fx));

  // „Sursă externă" pe toată platforma.
  const hSe = W0._aiuSursa(d.sursa), pSe = P.planSursa(d.sursa, fx);
  if (!pSe) T(nume + ' · fără `sursa`, fără rând', hSe === '');
  else {
    const tel = pSe.titlu + pSe.sub + pSe.stari.map((x) => x.t).join('') + pSe.model + pSe.eroare + pSe.luna;
    T(nume + ' · „Sursă externă": aceleași texte', curat(hSe) === fara(tel), curat(hSe) + ' // ' + fara(tel));
    T(nume + ' · „Sursă externă": starea aleasă', (/<button class="rax-btn primary"[^>]*>([^<]*)</.exec(hSe) || [])[1] === (pSe.stari.find((x) => x.al) || {}).t);
    T(nume + ' · „Sursă externă": modelul refuzat, în roșu', /aiu-se-m rau">/.test(hSe.split('</div>').slice(2, 4).join('')) === pSe.modelRau || (!!pSe.eroare), String(pSe.modelRau));
  }

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

  // Firmă cu firmă: un rând pe firmă, amănuntul dedesubt, ca _aiuTabel.
  const hTab = W._aiuTabel(rows), hTab0 = W0._aiuTabel(rows);
  const cu = rows.filter((r) => r.enabled);
  if (!cu.length) T(nume + ' · nicio firmă', curat(hTab0).indexOf(fara(P.NICIO_FIRMA)) >= 0);
  const rw = String(hTab).split('<tr class="aiu-tr"').slice(1), rw0 = String(hTab0).split('<tr class="aiu-tr"').slice(1);
  T(nume + ' · câte rânduri de firmă', rw.length === cu.length, rw.length + ' / ' + cu.length);
  cu.forEach((x, i) => {
    const r = P.randFirma(x, fx), e = nume + ' · ' + x.name;
    const cel = String(rw[i] || '').split('<td').slice(1), cel0 = String(rw0[i] || '').split('<td').slice(1);
    const c = (k) => { const v = cel0[k] || ''; return curat('<td' + v); };
    T(e + ' · numele', c(0) === fara(r.nume), c(0) + ' // ' + r.nume);
    T(e + ' · pachetul', c(1) === fara(r.pachet), c(1) + ' // ' + r.pachet);
    T(e + ' · întrebările', c(2) === fara(r.folosite), c(2) + ' // ' + r.folosite);
    const barW = /<i style="width:(\d+)%;background:var\(--(\w+)\)/.exec(cel0[2] || '');
    T(e + ' · bara', barW ? r.bara === Number(barW[1]) && ({ red: 'bad', orange: 'warn', purple: 'mov' })[barW[2]] === r.baraTon : r.bara == null, JSON.stringify([barW && barW[1], barW && barW[2], r.bara, r.baraTon]));
    T(e + ' · instant', c(3) === fara(r.instant));
    T(e + ' · sursă externă', c(4) === fara(r.sursa), c(4) + ' // ' + r.sursa);
    T(e + ' · ne costă: textul', c(5) === fara(r.cost), c(5) + ' // ' + r.cost);
    T(e + ' · ne rămân: textul', c(6) === fara(r.raman), c(6) + ' // ' + r.raman);
    T(e + ' · ne rămân: culoarea', (cel0[6] || '').indexOf(r.ramanOk ? 'var(--accent)' : 'var(--red)') >= 0);
    sumaEq(e + ' · ne costă', L(cel[5]), P.costFirmaLei(x, fx));
    sumaEq(e + ' · ne rămân', L(cel[6]), P.ramanFirmaLei(x, fx));
    // Amănuntul.
    const det = String(rw0[i] || '').slice(String(rw0[i] || '').indexOf('<div class="aiu-det-in">')).split('</tbody>')[0];
    const tel = (r.pachetRand ? r.pachetRand.nume + ' · ' + r.pachetRand.plasa + (r.pachetRand.raman ? ' · ' + r.pachetRand.raman : '') : '')
      + r.semnale.map((z) => z.t).join('') + 'Cum iese cifra' + r.socoteala.map((t) => '• ' + t).join('') + 'Cine are cont'
      + (r.oameni.length ? r.oameni.map((o) => o.nume + o.stare + o.folosite + o.data).join('') : 'Niciun cont cu RA Insight.')
      + (r.facturat ? 'Ce am facturat pe RA Insight' + r.facturat.t + (r.facturat.platit ? ' — a plătit tot' : '') : '')
      + r.ultima + 'Deschide firma';
    T(e + ' · amănuntul: aceleași texte, în aceeași ordine', curat(det) === fara(unde(tel)), curat(det) + ' // ' + fara(unde(tel)));
    if (r.pachetRand) {
      const pr = W0._aiuPachetRand(x), cul = { bad: 'var(--red)', warn: 'var(--orange)', sec: 'var(--text-secondary)', mut: 'var(--text-muted)' }[r.pachetRand.plasaTon];
      T(e + ' · plasa: culoarea', pr.indexOf(cul) >= 0, pr);
    }
    const sw = W0._aiuSemnale(x), culS = { bad: 'var(--red)', warn: 'var(--orange)', mut: 'var(--text-muted)' };
    T(e + ' · semnalele: culorile', r.semnale.every((z) => sw.indexOf(culS[z.ton]) >= 0) && (r.semnale.length ? true : sw === ''), sw);
    r.oameni.forEach((o) => T(e + ' · ' + o.nume + ': culoarea', W0._aiuOameni(x).indexOf(({ ok: 'var(--accent)', bad: 'var(--red)', mut: 'var(--text-muted)' })[o.ton]) >= 0));
  });
  const tf = P.textFaraInsight(rows);
  T(nume + ' · firmele fără RA Insight', tf ? curat(hTab0).endsWith(fara(tf)) : curat(hTab0).indexOf('fărăRAInsight:') < 0, tf);
}

sect('2. Scenariile pe care le văd fondatorii');
SCENARII.slice(0, SCENARII.length - ALEATOARE).forEach(([nume, d]) => verifica(nume, d));
sect('3. ' + ALEATOARE + ' de răspunsuri la întâmplare (sămânță fixă)');
SCENARII.slice(SCENARII.length - ALEATOARE).forEach(([nume, d]) => verifica(nume, d));

sect('4. Web-ul dă blocului cursul din răspuns, ca telefonul');
// Scenariile de mai sus pun ele `_aiuFxResp`; aici verificăm că și pagina adevărată o face, ÎNAINTE de cartonașe.
const LOAD = (() => { const i = HTML.indexOf('window.raxLoadAiUsage = async function'); return i < 0 ? '' : HTML.slice(i, HTML.indexOf('\n    };', i)); })();
T('raxLoadAiUsage există', !!LOAD);
const iSet = LOAD.indexOf('_aiuFxResp = Number(d.fxEur)'), iSume = LOAD.indexOf('_aiuPachete(');
T('pune cursul din răspuns înainte de primele sume (cele patru cifre de sus)', iSet > 0 && iSume > iSet, 'set ' + iSet + ' · sume ' + iSume);
T('nota de sub pagină: aceleași cuvinte ca pe web', LOAD.indexOf(P.NOTA_CONTROL) >= 0);
T('panoul vechi nu mai e în pagină (nici cutia „Mai multe cifre", nici cartonașele pe firme)', LOAD.indexOf('aiu-mai-box') < 0 && LOAD.indexOf('_aiuKpiuri(') < 0 && LOAD.indexOf('_aiuCard(') < 0);

sect('5. Cursul');
T('_aiuFx preferă cursul din răspuns', /function _aiuFx\(\) \{ return _aiuFxResp \|\|/.test(BLOC));
flush();

console.log('\n' + (rele ? '✗ ' + rele + ' diferențe între telefon și web (din ' + (ok + rele) + ')' : '✓ Telefonul arată aceleași sume și aceleași texte ca web-ul (' + ok + ' verificări)'));
process.exit(rele ? 1 : 0);
