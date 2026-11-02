// verify_telefon_pachete.js — pachetele RA Insight pe telefon (lotul 3, 02.11): „Vezi pachetele", trecerea, „Pachet și conturi",
// Utilizatori, fila „Acces", „Abonament & plăți", oferta și „RA Insight · control" fac ce face pagina web, pe aceleași rute.
//
//   node verify_telefon_pachete.js
//
// Ce păzește:
//   1. intrările: rândul din „⋯", rândul pachetului din sertar, „Vezi pachetele" din cartonașul încuiat și din caseta limitei,
//      cartonașul „nu e pornit" la administrator; doar administratorul firmei, ca pe web;
//   2. „Vezi pachetele" (insightPachete) și confirmarea (arataConfirmarea, cu tot cu 409), RULATE pe un DOM de carton lângă lib/insightPachet;
//   3. „Pachet și conturi" (deseneazaPachetConturi): vechi, Basic, Pro, urmator, nuPoate, limita, Sursa, treceri;
//   4. Utilizatori (_usrSeatsHtml, bagheta) și fila „Acces" (_raxRenderCfg, raxCfgPachet), rulate; „Abonament & plăți" pe regula veche;
//   5. oferta: pachetul și prețul, fără câmpurile vechi;
//   6. „RA Insight · control": fără cartonașele vechi (cifrele le ține verify_insight_bani.js), fără „Proba modelelor";
//   7. pe server pornit, prin clientul HTTP adevărat al telefonului: Start / Basic / Pro, regula veche, administrator cu și fără cont,
//      manager, fondator; confirmarea cu 409; nimeni de la o firmă nu vede costuri;
//   8. ecranele desenate în HTML (cu preact; în CI se sare).
//
// Pornește UN server (PGlite, port 3533, TCP 5533, baza în dosarul temporar, ștearsă la final), fără model și fără email.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

const ROOT = __dirname;
const citeste = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0, sarite = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 800) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function functie(src, reper) {
  const i = src.indexOf(reper); if (i < 0) return '';
  let j = src.indexOf('{', i + reper.length - 1), adanc = 0;
  for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
  return src.slice(i, j + 1);
}
const taie = (src, de, pana) => { const i = src.indexOf(de); if (i < 0) return ''; const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j); };
const faraComentarii = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');

const CA_IN_CI = process.env.PROBA_CA_IN_CI === '1';
const NM = path.join(ROOT, 'mobile/node_modules');
const dinMobile = (id) => { if (CA_IN_CI) return null; try { return require(path.join(NM, id)); } catch (e) { return null; } };
let ts = dinMobile('typescript');
if (!ts) { try { ts = require('typescript'); } catch (e) { /* lipsește */ } }
if (!ts && CA_IN_CI) { try { ts = require(path.join(NM, 'typescript')); } catch (e) { /* lipsește */ } }
const PREACT = (() => {
  const preact = dinMobile('preact'), hooks = dinMobile('preact/hooks'), jsxRt = dinMobile('preact/jsx-runtime'), rts = dinMobile('preact-render-to-string');
  return preact && hooks && jsxRt && rts ? { preact, hooks, jsxRt, rts } : null;
})();
if (!ts) { console.log('  ✗ lipsește compilatorul TypeScript: rulează o dată `npm install` în mobile/ (în CI îl pune pasul de instalare, la rădăcină)'); process.exit(1); }
function tsJs(cod, fisier) {
  return ts.transpileModule(cod, { fileName: path.basename(fisier), compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'preact' } }).outputText;
}
function modul(rel, stubs, globale) {
  const m = { exports: {} };
  const ctx = vm.createContext(Object.assign({
    module: m, exports: m.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, AbortController,
    require: (id) => {
      if (stubs && Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
      if (/\.css$/.test(id)) return {};
      throw new Error('require neașteptat în ' + rel + ': ' + id);
    },
  }, globale || {}));
  vm.runInContext(tsJs(citeste(rel).split('(import.meta as any).env').join('({})'), rel), ctx, { filename: rel });
  return m.exports;
}

const html = citeste('public/index.html');
const INSP = taie(html, '// ── începe „secțiunea RA Insight" ──', '// ── sfârșit „secțiunea RA Insight" ──');
const server = citeste('server.js');
const F = {
  lib: 'mobile/src/lib/insightPachet.ts', comp: 'mobile/src/components/InsightPachet.tsx', ecran: 'mobile/src/screens/Insight.tsx', insightLib: 'mobile/src/lib/insight.ts',
  bula: 'mobile/src/components/InsightBula.tsx', pagini: 'mobile/src/components/InsightPagini.tsx', pagLib: 'mobile/src/lib/insightPagini.ts', endpoints: 'mobile/src/api/endpoints.ts',
  users: 'mobile/src/screens/AdminUsers.tsx', acces: 'mobile/src/components/CompanyEdit.tsx', abon: 'mobile/src/screens/CompanyAbonament.tsx', sheet: 'mobile/src/screens/CompanySheet.tsx',
  oferta: 'mobile/src/screens/OfferCalc.tsx', control: 'mobile/src/screens/AiUsage.tsx', bani: 'mobile/src/components/insightBani.ts', meniu: 'mobile/src/screens/Menu.tsx', app: 'mobile/src/App.tsx',
  client: 'mobile/src/api/client.ts', css: 'mobile/src/screens/insight.css', tokens: 'mobile/src/theme/tokens.css', fcss: 'mobile/src/screens/fondator.css',
};
const S = {}; Object.keys(F).forEach((k) => { S[k] = citeste(F[k]); });
const L = modul(F.lib);
const LP = modul(F.pagLib);
const IL = modul(F.insightLib, { './insightPagini': LP, './cereriEchipa': modul('mobile/src/lib/cereriEchipa.ts', { './numar': modul('mobile/src/lib/numar.ts') }) });

// ─── DOM de carton: funcțiile paginii scriu în el, iar proba îi citește textele, în ordine ─────────────────────────────────────
function nod(tag) {
  const n = { tag, children: [], className: '', style: {}, attrs: {}, dataset: {}, _t: '', _h: '', type: '', title: '', onclick: null, onchange: null, value: '', checked: false, disabled: false, min: '', step: '', colSpan: 1 };
  n.appendChild = (c) => { if (c) { n.children.push(c); c.parent = n; } return c; };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.addEventListener = () => {}; n.focus = () => {};
  n.remove = () => { if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n); };
  n.classList = { toggle() {}, add() {}, remove() {} };
  n.querySelector = () => null;
  Object.defineProperty(n, 'textContent', { get: () => n._t + n.children.map((c) => c.textContent).join(''), set: (v) => { n._t = String(v); n.children = []; } });
  Object.defineProperty(n, 'innerHTML', { get: () => n._h, set: (v) => { n._h = String(v); n.children = []; } });
  return n;
}
const faraEtichete = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function texte(n, out) {
  out = out || [];
  const pune = (t) => { const x = faraEtichete(t == null ? '' : t).trim(); if (x) out.push(x); };
  if (n._h) pune(n._h);
  if (n._t) pune(n._t);
  n.children.forEach((c) => texte(c, out));
  return out;
}
function cauta(n, f, out) { out = out || []; if (f(n)) out.push(n); n.children.forEach((c) => cauta(c, f, out)); return out; }
// Partea din secțiunea RA Insight pe care o rulăm, cu serverul înlocuit de `rute` și cu fereastra de confirmare prinsă.
function web(rute, extra) {
  const body = nod('body'), ids = {}, toast = [];
  const e = extra || {};
  const cereri = [];
  const cere = async (m, url, b) => {
    cereri.push({ m, url, b });
    const k = Object.keys(rute).filter((x) => x === m + ' ' + url || x === m + ' ' + url.split('?')[0])[0];
    if (k == null) throw new Error('adresă neașteptată în probă: ' + m + ' ' + url);
    const r = typeof rute[k] === 'function' ? rute[k](b) : rute[k];
    return r && r.__s ? { s: r.__s, j: r.j } : { s: 200, j: r };
  };
  const w = { currentUser: { role: e.rol || 'company_admin' }, raxToast: (m, t) => toast.push({ m, t }), insightPachete() {}, insightRamura() {}, insightLoc() {}, insightLimita() {}, insightSursaFirma() {}, raxHartie() {} };
  const document = { createElement: nod, createTextNode: (t) => { const x = nod('#text'); x._t = String(t); return x; }, body };
  const bucati = ['function el(tag, cls, text)', 'async function deseneazaPachetConturi(main)', 'function arataConfirmarea(cod, j)', 'function deseneazaIncuiata(main)', 'function esteAdmin()'];
  const cod = bucati.map((b) => functie(INSP, b)).join('\n') + '\n'
    + 'window.insightPachete = ' + functie(INSP, 'window.insightPachete = async function ()').replace('window.insightPachete = ', '') + ';\n'
    + 'window.insightTrecere = ' + functie(INSP, 'window.insightTrecere = async function (cod)').replace('window.insightTrecere = ', '') + ';\n'
    + 'return { deseneazaPachetConturi, arataConfirmarea, deseneazaIncuiata, esteAdmin };';
  const f = new Function('S', 'cere', 'window', 'document', '$i', 'incarcaPachet', 'deseneazaMain', 'RAMURI', cod)(e.S || { ramura: 'pachet' }, cere, w, document, (id) => ids[id] || null, () => {}, () => {}, []);
  return { f, w, body, ids, toast, cereri, document };
}
async function textePacheteWeb(j) {
  const a = web({ 'GET /api/insight/pachete': j });
  await a.w.insightPachete();
  return { t: texte(a.body), a };
}
function textePachetePhone(j) {
  const p = L.planPachete(j), o = [L.TITLU_PACHETE, p.sub];
  if (p.urmText) o.push(p.urmText);
  p.carduri.forEach((c) => {
    if (c.eticheta) o.push(c.eticheta);
    if (c.al) o.push('Pachetul tău');
    o.push(c.nume, c.pret, c.subPret, c.titlu, c.pentru);
    c.cifre.forEach((x) => o.push(x.et, x.val));
    if (c.plus) o.push(c.plus);
    c.include.forEach((t) => o.push(t));
    if (c.programat) o.push(c.programat);
    if (c.alege) o.push(c.alege);
  });
  if (p.comparatie.length) {
    o.push(L.TITLU_COMPARATIE, 'Ce primești');
    // Capul de tabel (numele + prețul fiecărui pachet) stă pe web: pe telefon, numele e în fiecare celulă, iar prețul pe cartonaș.
    (j.pachete || []).forEach((x) => { o.push(x.nume); o.push(((x.pret || '') + ' ' + (x.subPret || '')).trim()); });
    p.comparatie.forEach((g) => {
      o.push(g.grup);
      g.randuri.forEach((r) => {
        o.push(r.t); if (r.d) o.push(r.d);
        r.celule.forEach((c) => { if (c.da === false) o.push('—'); else if (c.da === null && c.text) o.push(c.text); if (c.mic) o.push(c.mic); });
      });
    });
  }
  if (p.inToate.length) { o.push(L.TITLU_IN_TOATE); p.inToate.forEach((x) => o.push(x.t, x.d)); }
  o.push(p.schimbText);
  return o.filter((x) => String(x).trim()).map((x) => String(x).trim());
}
async function comparaPachete(nume, j) {
  const { t } = await textePacheteWeb(j);
  const tel = textePachetePhone(j);
  // Pe web „Închide" e o iconiță, deci nu are text. Aceleași texte, în aceeași ordine.
  let unde = -1; for (let i = 0; i < Math.max(t.length, tel.length); i++) if (t[i] !== tel[i]) { unde = i; break; }
  T(nume + ': aceleași texte și aceeași ordine ca pe web (' + t.length + ')', unde < 0, 'la ' + unde + ': web ' + J(t.slice(Math.max(0, unde - 1), unde + 3)) + ' / telefon ' + J(tel.slice(Math.max(0, unde - 1), unde + 3)));
}
function textePachetConturiPhone(j) {
  const p = L.planConturi(j);
  if (p.vechi) return [p.mesaj].filter(Boolean);
  const o = [L.TITLU_CONTURI];
  if (p.pilula) o.push(p.pilula);
  o.push('Vezi pachetele');
  if (p.urmator) o.push(p.urmator);
  p.rezumat.forEach((t) => o.push(t));
  p.coloane.forEach((c) => o.push(c));
  p.oameni.forEach((m) => {
    o.push(m.nume, m.rol);
    if (m.nuPoate) o.push(m.nuPoate);
    if (p.imparte) { if (m.arataLimita) o.push('Fără limită', 'Cel mult…', 'pe lună'); else o.push('—'); }
    o.push(m.folosite);
  });
  o.push(p.nota);
  if (p.sursa) o.push(p.sursa.nume, p.sursa.text, p.sursa.explicatie);
  if (p.treceri.length) {
    o.push('Schimbările de pachet');
    p.treceri.forEach((t) => o.push(t.cand, t.rezumat, t.cine, 'PDF'));
  }
  return o.filter((x) => String(x).trim()).map((x) => String(x).trim());
}
async function comparaConturi(nume, j, status) {
  const a = web({ 'GET /api/insight/pachet-conturi': status ? { __s: status, j } : j });
  const main = nod('main');
  await a.f.deseneazaPachetConturi(main);
  const t = texte(main), tel = status ? [String(j.error || '')] : textePachetConturiPhone(j);
  let unde = -1; for (let i = 0; i < Math.max(t.length, tel.length); i++) if (t[i] !== tel[i]) { unde = i; break; }
  T(nume + ': aceleași texte și aceeași ordine ca pe web (' + t.length + ')', unde < 0, 'la ' + unde + ': web ' + J(t.slice(Math.max(0, unde - 1), unde + 3)) + ' / telefon ' + J(tel.slice(Math.max(0, unde - 1), unde + 3)));
  if (!status && !j.vechi) {
    const bi = cauta(main, (n) => n.tag === 'b' && n.style && n.style.width != null)[0];
    const p = L.planConturi(j);
    T(nume + ': bara, același procent', bi ? bi.style.width === p.bara + '%' : p.bara == null, (bi && bi.style.width) + ' / ' + p.bara);
    const sw = cauta(main, (n) => n.tag === 'input' && n.type === 'checkbox');
    T(nume + ': comutatoarele, aceleași stări', J(sw.slice(0, p.oameni.length).map((c) => [!!c.checked, !!c.disabled])) === J(p.oameni.map((o) => [o.loc, !o.loc && !!o.nuPoate])), J(sw.map((c) => [c.checked, c.disabled])));
  }
}

function parteaIntrarilor() {
  sect('1. Intrările, doar la administratorul firmei');
  const esteWeb = new Function('window', functie(INSP, 'function esteAdmin()') + '; return esteAdmin;');
  for (const r of ['company_admin', 'admin', 'manager', 'dispatcher', 'viewer', 'client', 'superadmin', '', null]) {
    T('esteAdmin(' + r + ') la fel ca pe web', esteWeb({ currentUser: { role: r } })() === L.esteAdminFirma(r));
  }
  const meniuWeb = functie(INSP, 'window.insightMeniu = function (btn)');
  T('„⋯": regula paginii, cuvânt cu cuvânt', /if \(esteAdmin\(\) && \(S\.pachet \|\| S\.faraLoc\)\) l\.push\(\{ text: 'Pachet și conturi'/.test(meniuWeb));
  for (const [a, p, fl] of [[true, { cod: 'basic' }, null], [true, null, 'x'], [true, null, null], [false, { cod: 'pro' }, 'x'], [false, null, null]]) {
    T('rândul din „⋯" (' + J([a, !!p, !!fl]) + ')', L.arataPachetConturi(a, p, fl) === !!(a && (p || fl)));
  }
  const lst = IL.listaMeniu({ areConv: true, poateAgenti: true, poatePachet: true }).map((x) => x.text);
  T('„⋯": aceeași ordine ca pe web', J(lst) === J(['Conversație nouă', 'Pachet și conturi', 'Notițele firmei', 'Setările agenților', 'Ghidul aplicației', 'Redenumește conversația', 'Șterge conversația']), J(lst));
  T('…fără drept, rândul nu apare', IL.listaMeniu({ areConv: false, poateAgenti: false }).every((x) => x.k !== 'pachet'));
  T('…ecranul îi dă dreptul și îl duce la pagină', /poatePachet: arataPachetConturi\(admin, stare\.pachet, faraLoc\)/.test(S.ecran) && /x\.k === 'pachet'\) deschidePagina\('pachet'\)/.test(S.ecran));
  T('rândul pachetului din sertar: administratorul ajunge în pagină; ceilalți îi văd amănuntul', /box\.onclick = esteAdmin\(\) \? function \(\) \{ window\.insightRamura\('pachet'\); \} : null;/.test(INSP) && /if \(admin && stare\.pachet\) deschidePagina\('pachet'\); else setDetaliuFond\(!detaliuFond\);/.test(S.ecran));
  T('`pachet` e pe listă, ca o ramură de pe web, fără să intre în „Pagini"', IL.RAMURI_PE_TELEFON.indexOf('pachet') >= 0 && LP.pagini().every((r) => r.k !== 'pachet'));
  T('o adresă de pachet, fără să fii administrator: discuția (ca pe web)', /\(ramuraCeruta === 'pachet' \|\| ramuraCeruta === 'pachete'\) \? \(admin \? ramuraCeruta : null\)/.test(S.ecran) && /if \(S\.ramura === 'pachet' && esteAdmin\(\)\) return deseneazaPachetConturi\(main\);/.test(INSP));
  T('„Pachet și conturi" stă înaintea cartonașului „nu e pornit": administratorul fără cont ajunge acolo', S.ecran.indexOf("ramura === 'pachet' ? <PaginaPachetConturi") >= 0 && S.ecran.indexOf("ramura === 'pachet' ? <PaginaPachetConturi") < S.ecran.indexOf('<h3>RA Insight nu e pornit pe contul tău</h3>') && INSP.indexOf("if (S.ramura === 'pachet' && esteAdmin()) return deseneazaPachetConturi(main);") < INSP.indexOf("el('h3', null, 'RA Insight nu e pornit pe contul tău')"));
  T('cartonașul „nu e pornit": rândul administratorului și butonul, aceleași cuvinte ca pe web', INSP.indexOf(L.TEXT_ADMIN_FARA_LOC) >= 0 && /Deschide Pachet și conturi/.test(INSP) && /text="Deschide Pachet și conturi"/.test(S.ecran) && /admin \? <>[\s\S]{0,120}TEXT_ADMIN_FARA_LOC/.test(S.ecran));
  T('cartonașul încuiat și caseta limitei: „Vezi pachetele" doar la administrator', /laPachete=\{admin \? vedePachetele : undefined\}/.test(S.ecran) && /pachete: admin \? vedePachetele : undefined/.test(S.ecran) && /laPachete \? <div class="insp-card-b"><ButonProp text="Vezi pachetele"/.test(S.pagini) && /l\.pachete \? <ButonProp text="Vezi pachetele"/.test(S.bula) && /if \(esteAdmin\(\)\) \{ var b = el\('button', 'chat-pas'\);[^\n]*Vezi pachetele/.test(functie(INSP, 'function deseneazaIncuiata(main)')));
  T('„Vezi pachetele" se adaugă în istoric, ca „Înapoi" să ducă pe pagina de sub el', /function vedePachetele\(\) \{ du\(rutaRamura\('pachete'\)\); \}/.test(S.ecran));
  T('după ce s-a schimbat ceva, contorul și locul omului se citesc din nou', /function dupaPachet\(\) \{ incarcaPachet\(\); incarcaLista\(\); incarcaNumere\(\); \}/.test(S.ecran));
  T('foile din paginile pachetului se închid cu „înapoi"', (S.comp.match(/useInapoiInchide\(/g) || []).length >= 2);
}

function parteaPachetelor() {
  return (async () => {
    sect('2. „Vezi pachetele" și confirmarea, rulate lângă pagina web');
    const PK = require('./pachete');
    const preturi = { start: 0, basic: 10, pro: 22.5, business: 30 };
    const baza = () => ({ pachete: PK.publice({ preturi }), comparatie: PK.comparatie({ cuPret: true, preturi }), actual: 'basic', pretRON: 10, urmator: null, inToate: PK.IN_TOATE, reincarcare: 'Se reîncarcă pe 1 decembrie.', contact: 'contact@ratrack.ro', poateSchimba: true, schimbText: 'Alegi alt pachet chiar de aici.' });
    await comparaPachete('administrator pe Basic', baza());
    await comparaPachete('programat Basic din 1 decembrie, pe Pro', Object.assign(baza(), { actual: 'pro', urmator: { cod: 'basic', nume: 'Basic', deLa: 1, text: 'Din 1 decembrie: pachetul Basic.', scurt: 'Programat din 1 decembrie' } }));
    await comparaPachete('fără drept de schimbat', Object.assign(baza(), { poateSchimba: false, schimbText: 'Pentru alt pachet, scrie-ne.' }));
    await comparaPachete('regula veche (niciun pachet actual)', Object.assign(baza(), { actual: null }));
    await comparaPachete('fără comparație și fără „în toate"', Object.assign(baza(), { comparatie: [], inToate: [] }));
    const p = L.planPachete(baza());
    T('„Alege": pe toate, afară de al tău', J(p.carduri.map((c) => c.alege)) === J(['Alege Start', '', 'Alege Pro', 'Alege Business']), J(p.carduri.map((c) => c.alege)));
    const pr = L.planPachete(Object.assign(baza(), { actual: 'pro', urmator: { cod: 'basic', scurt: 'x', text: 'y' } }));
    T('…cu o trecere programată: „Rămân pe Pro"; cel programat n-are buton', J(pr.carduri.map((c) => c.alege)) === J(['Alege Start', '', 'Rămân pe Pro', 'Alege Business']), J(pr.carduri.map((c) => c.alege)));
    T('fără preț sau cifră scrisă pe telefon: ce include un pachet vine de la server', !/\b(10|20|30) (de )?lei\b|200 de întrebări|600 de întrebări|1\.000 de întrebări/.test(faraComentarii(S.lib + S.comp)));

    // Confirmarea: fereastra paginii, apăsată pe bune, lângă cea a telefonului.
    const J0 = { sens: 'sus', la: 'pro', text: 'Textul de confirmat, de la server.', buton: 'Trec la Pro', bifa: 'Am citit și sunt de acord, în numele firmei.' };
    let raspuns = { __s: 409, j: { error: 'Ceva s-a schimbat.', text: 'Textul NOU.', buton: 'Trec la Pro acum' } };
    const a = web({ 'POST /api/insight/pachet-trecere': () => raspuns });
    a.f.arataConfirmarea('pro', J0);
    const ov = a.body.children[0];
    T('confirmarea: aceleași texte ca pe web', J(texte(ov)) === J([L.TITLU_CONFIRMARE, J0.text, J0.bifa, L.TEXT_RENUNT, J0.buton]), J(texte(ov)));
    const ck = cauta(ov, (n) => n.tag === 'input')[0], btn = cauta(ov, (n) => n.tag === 'button').filter((b) => b.textContent === J0.buton)[0];
    T('…butonul e oprit până la bifă', btn.disabled === true);
    ck.checked = true; ck.onchange();
    T('…bifa îl pornește', btn.disabled === false);
    await btn.onclick();
    const dn = a.cereri[0];
    T('…ce pleacă: codul, textul VĂZUT, acordul', J(dn.b) === J(L.corpTrecere('pro', J0.text, true)), J(dn.b));
    const d409 = L.dupaConfirmare(409, raspuns.j);
    T('…409: textul nou pe ecran, bifa ștearsă, mesajul serverului', d409.fel === 'din-nou' && texte(ov).indexOf(d409.text) >= 0 && ck.checked === false && a.toast[0].m === d409.mesaj && btn.textContent === d409.buton, J(a.toast));
    T('…telefonul: la 409, același lucru', /setText\(d\.text\); if \(d\.buton\) setButon\(d\.buton\); setBifat\(false\); showToast\(d\.mesaj, true\)/.test(S.comp));
    raspuns = { __s: 400, j: { error: 'Bifează.' } };
    ck.checked = true; ck.onchange(); await btn.onclick();
    T('…altă eroare: mesajul serverului, fereastra rămâne', L.dupaConfirmare(400, raspuns.j).mesaj === a.toast[1].m && a.body.children.length === 1);
    T('…fără mesaj de la server: aceleași cuvinte de rezervă', L.dupaConfirmare(500, {}).mesaj === 'Nu s-a putut schimba pachetul.' && /Nu s-a putut schimba pachetul\./.test(functie(INSP, 'function arataConfirmarea(cod, j)')));
    raspuns = { ok: true, mesaj: 'Gata, de azi ești pe Pro.' };
    await btn.onclick();
    T('…gata: mesajul serverului, fereastra se închide', a.toast[2].m === raspuns.mesaj && a.body.children.length === 0 && L.dupaConfirmare(200, raspuns).mesaj === raspuns.mesaj && L.dupaConfirmare(200, raspuns).fel === 'gata', J(a.toast));
    T('„Renunț" și „Se trimite" nu lasă două trimiteri', /if \(!bifat \|\| busy\) return;/.test(S.comp));
    T('rutele sunt cele de pe web', ["'/api/insight/pachete'", "'/api/insight/pachet-trecere'", "'/api/insight/pachet-conturi'", "'/api/insight/sursa-externa'"].every((r) => S.endpoints.indexOf(r) >= 0 && INSP.indexOf(r) >= 0) && /\/api\/insight\/pachet-trecere\?cod=/.test(S.endpoints));

    sect('3. „Pachet și conturi", rulat lângă pagina web');
    const om = (x) => Object.assign({ id: 1, nume: 'Maria', rol: 'Admin companie', loc: true, limita: null, folosite: 3, folositeText: '3', nuPoate: null }, x);
    const CAZURI = {
      Basic: { pachet: { cod: 'basic', nume: 'Basic', imparte: false, conturi: 2, intrebari: 200, ramase: 150 }, urmator: null, treceri: [], rezumat: ['Mai ai 150 din 200.', 'Se reîncarcă pe 1.'], oameni: [om({}), om({ id: 2, nume: 'Ion', loc: false, folositeText: null, nuPoate: 'Basic are 2 conturi.' })], nota: 'Nota serverului.', luna: 'noiembrie', sursa: { nume: 'Sursă externă', explicatie: 'Caută pe internet.', oprita: false, text: 'Pornită.' } },
      Pro: { pachet: { cod: 'pro', nume: 'Pro', imparte: true, conturi: 5, intrebari: 600, ramase: 0 }, urmator: 'Din 1 decembrie firma trece pe pachetul Basic.', treceri: [{ id: 3, cand: '02.11.2026', cine: 'Maria', rezumat: 'Basic → Pro', email: 'trimisă pe email', pdf: '/api/insight/pachet-trecere/3/pdf' }], rezumat: ['Una.'], oameni: [om({ limita: 40, folositeText: '3 din 40' }), om({ id: 2, nume: 'Vasile', folosite: 0, folositeText: '0' }), om({ id: 3, nume: 'Ana', loc: false, folositeText: null }), om({ id: 4, nume: 'Dan', loc: false, folositeText: '7' })], nota: 'Nota.', luna: 'noiembrie', sursa: { nume: 'Sursă externă', explicatie: 'E.', oprita: true, text: 'Oprită.' } },
      Start: { pachet: { cod: 'start', nume: 'Start', imparte: false, conturi: 1, intrebari: 50, ramase: 40 }, urmator: null, treceri: [], rezumat: ['Mai ai 40.'], oameni: [om({}), om({ id: 2, nume: 'Ion', loc: false, folositeText: null, nuPoate: 'Pe Start întreabă doar administratorul.' })], nota: 'Start.', luna: 'noiembrie', sursa: null },
      'fără pachet în răspuns': { pachet: null, rezumat: [], oameni: [], nota: '' },
    };
    for (const k of Object.keys(CAZURI)) await comparaConturi(k, CAZURI[k]);
    await comparaConturi('regula veche', { vechi: true, mesaj: 'Firma e pe regula veche.' });
    await comparaConturi('refuzul serverului', { error: 'Doar administratorul.' }, 403);
    T('… pe telefon, regula: `vechi` arată `mesaj`', L.planConturi({ vechi: true, mesaj: 'M' }).mesaj === 'M');
    // Cuvintele de după apăsări: rulate pe web, pe aceleași cazuri.
    const toast = {};
    const faceLoc = functie(INSP, 'window.insightLoc = async function (id, on, nume)');
    T('dă-i cont: aceleași cuvinte ca fereastra paginii', faceLoc.indexOf("'„' + nume + '\" primește RA Insight. Prețul pachetului rămâne același, oricâte conturi dai.'") >= 0 && L.textDaiLoc('X') === '„X" primește RA Insight. Prețul pachetului rămâne același, oricâte conturi dai.' && faceLoc.indexOf("title: '" + L.TITLU_DAI_LOC + "'") >= 0 && faceLoc.indexOf("okLabel: '" + L.OK_DAI_LOC + "'") >= 0);
    T('…și după', faceLoc.indexOf("on ? 'RA Insight pornit pentru „' + nume + '\"' : 'RA Insight oprit pentru „' + nume + '\"'") >= 0 && L.textLocGata(true, 'X') === 'RA Insight pornit pentru „X"' && L.textLocGata(false, 'X') === 'RA Insight oprit pentru „X"');
    const faceLim = functie(INSP, 'window.insightLimita = async function (id, val)');
    T('limita: aceleași cuvinte și același corp', faceLim.indexOf("'Fără limită: folosește din întrebările firmei'") >= 0 && faceLim.indexOf("'Limita s-a salvat: cel mult ' + v + ' pe lună'") >= 0 && L.textLimitaGata('') === 'Fără limită: folosește din întrebările firmei' && L.textLimitaGata(' 40 ') === 'Limita s-a salvat: cel mult 40 pe lună' && J(L.corpLimita('')) === '{"limita":null}' && J(L.corpLimita('40')) === '{"limita":40}' && /limita: v === '' \? null : Number\(v\)/.test(faceLim));
    const faceSe = functie(INSP, 'window.insightSursaFirma = async function (on)');
    T('„Sursă externă" pe firmă: aceleași cuvinte, aceeași rută', faceSe.indexOf("'" + L.textSursaGata(true) + "'") >= 0 && faceSe.indexOf("'" + L.textSursaGata(false) + "'") >= 0 && /pornita: !!on/.test(faceSe) && /body: \{ pornita \}/.test(S.endpoints));
    T('limita: „Fără limită" / „Cel mult…", caseta doar la „Cel mult", ca pe web', /<option value="fara">Fără limită<\/option>/.test(S.comp) && /<option value="cel">Cel mult…<\/option>/.test(S.comp) && /\[\['fara', 'Fără limită'\], \['cel', 'Cel mult…'\]\]/.test(INSP) && /\{cel \? <>/.test(S.comp));
    T('…la „Fără limită", se șterge doar dacă omul avea limită; cifra goală nu pleacă', /if \(v === 'fara'\) \{ setCel\(false\); if \(o\.cuLimita\) onSalveaza\(o\.id, ''\); \}/.test(S.comp) && /if \(sel\.value === 'fara'\) \{ arata\(false\); if \(cuLim\) window\.insightLimita\(o\.id, ''\); \}/.test(functie(INSP, 'async function deseneazaPachetConturi(main)')) && /String\(v\)\.trim\(\) !== ''\) onSalveaza/.test(S.comp));
    T('comutatorul: la nuPoate, oprit; a da un cont cere confirmare, a-l lua nu', /disabled=\{!o\.loc && !!o\.nuPoate\}/.test(S.comp) && /if \(o\.loc\) pune\(o\.id, false, o\.nume\); else setDaLoc\(o\)/.test(S.comp));
    T('„Schimbările de pachet": butoanele de hârtie ale telefonului, pe adresa serverului', /<HartieBtns path=\{t\.pdf\} ce="Confirmarea"/.test(S.comp));
    T('fără HTML de la server', !/dangerouslySetInnerHTML|innerHTML/.test(faraComentarii(S.lib + S.comp + S.control + S.bani)));
    void toast;
  })();
}

function parteaUtilizatorilor() {
  return (async () => {
    sect('4. Utilizatori, fila „Acces", „Abonament & plăți"');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const f = (pk) => new Function('_usrPachet', 'esc', functie(html, 'function _usrSeatsHtml(toti)') + '; return _usrSeatsHtml;')(pk, esc);
    const om = (s) => ({ ai_seat: s });
    for (const pk of [null, { nume: 'Basic', conturi: 2 }, { nume: 'Start', conturi: 1 }, { nume: 'Business', conturi: null }]) {
      for (const lista of [[], [om(true)], [om(true), om(true)], [om(false)]]) {
        const w = f(pk)(lista), r = L.randConturi(lista, pk);
        const tw = faraEtichete(w).replace(/\s+/g, ' ').trim();
        const tl = r ? (r.n + ' ' + r.cat + ' ' + r.rest + (r.link ? ' ' + L.LINK_CONTURI : '')) : '';
        T('rândul de sus (' + J(pk && pk.nume) + ', ' + lista.length + '): la fel ca _usrSeatsHtml', tw === tl, tw + ' / ' + tl);
      }
    }
    const randUser = taie(html, "(_usrPachet && u.ai_seat ? '<span class=\"rau-ra\"", 'semne +');
    T('eticheta: aceeași regulă și același text ca pe web', /\(_usrPachet && u\.ai_seat \?/.test(randUser) && randUser.indexOf(L.TITLU_RA) >= 0 && L.arataEticheta({ ai_seat: true }, { nume: 'B' }) && !L.arataEticheta({ ai_seat: false }, { nume: 'B' }) && !L.arataEticheta({ ai_seat: true }, null));
    T('bagheta: pe web `u.role === \'superadmin\' || _usrPachet` o scoate', /\(u\.role === 'superadmin' \|\| _usrPachet \? '' :/.test(html));
    for (const [u, pk, v] of [[{ role: 'viewer' }, null, true], [{ role: 'viewer' }, { nume: 'B' }, false], [{ role: 'superadmin' }, null, false], [{ role: 'company_admin' }, { nume: 'B' }, false]]) T('bagheta (' + J([u.role, !!pk]) + ')', L.arataBagheta(u, pk) === v);
    T('…pe ecran: bagheta după `arataBagheta`, eticheta după `arataEticheta`, linkul duce la „Pachet și conturi"', /\{arataBagheta\(u, pachetRa\) && \(/.test(S.users) && /arataEticheta\(u, pachetRa\) &&/.test(S.users) && /loc\.route\(rutaRamura\('pachet'\)\)/.test(S.users) && !/u\.role !== 'superadmin' && \(\s*<button/.test(S.users));
    T('pachetul: din /api/ai/quota, doar la omul unei firme (ca loadUsers)', /currentUser\.role !== 'superadmin'\) \{ try \{ var qp = await fetch\('\/api\/ai\/quota'\)/.test(html) && /me\.value\?\.role !== 'superadmin'\) \{ try \{ setPachetRa\(cuPachetFirmei\(me\.value\?\.role, await Api\.aiQuota\(\)\)\)/.test(S.users) && L.cuPachetFirmei('superadmin', { pachet: { nume: 'B' } }) === null && L.cuPachetFirmei('viewer', { pachet: { nume: 'B' } }).nume === 'B' && L.cuPachetFirmei('viewer', {}) === null);

    // Fila „Acces": funcția paginii, rulată.
    const scoala = (s) => {
      const ids = { 'rax-cod-acces': { innerHTML: '' } };
      const fn = new Function('_raxCfg', 'document', 'esc', '_RAX_MODS', '_RAX_AGS', '_raxModAuto', functie(html, 'function _raxRenderCfg()') + '; return _raxRenderCfg;')(s, { getElementById: (id) => ids[id] || null }, esc, [], [], () => '');
      fn();
      return ids['rax-cod-acces'].innerHTML;
    };
    const PK = [{ cod: 'start', nume: 'Start', pret: 0, conturi: 1, intrebari: 50 }, { cod: 'basic', nume: 'Basic', pret: 10, conturi: 2, intrebari: 200 }, { cod: 'pro', nume: 'Pro', pret: 20, conturi: 5, intrebari: 600 }, { cod: 'business', nume: 'Business', pret: 30, conturi: null, intrebari: 1000 }, { cod: 'x', nume: 'X', pret: 119, conturi: 1, intrebari: 119 }, { cod: 'y', nume: 'Y', pret: 12.5, conturi: 1, intrebari: 20 }];
    for (const ales of [{ cod: 'basic', nume: 'Basic', deLa: Date.UTC(2026, 9, 1) }, { cod: 'pro', nume: 'Pro', urmator: 'Programat de administratorul firmei: pachetul Basic din 1 decembrie.' }, null]) {
      const w = scoala({ pachet: ales, pachete: PK, feats: {}, agents: [], setate: {}, aiLimit: '' });
      const cfg = { ai_pachet: ales, pachete: PK };
      const bl = taie(w, 'Pachet RA Insight</div>', '>Module (acces funcții)');
      const butoane = (bl.match(/<button[^>]*>[^<]*<\/button>/g) || []).map(faraEtichete);
      T('„Acces" (' + J(ales && ales.cod) + '): aceleași butoane', J(butoane) === J(PK.map(L.butonPachetFirma)), J(butoane));
      const nota = faraEtichete(bl.slice(bl.indexOf('margin-top:5px;'))).replace(/^[^>]*>/, '').replace(/<[\s\S]*$/, '').trim();
      const tw = nota.slice(0, nota.indexOf(L.NOTA_PACHET_FIRMA) + L.NOTA_PACHET_FIRMA.length);
      const tl = (L.acumPachetFirma(cfg) + ' ' + L.NOTA_PACHET_FIRMA).replace(/\*\*/g, '');
      T('…aceeași notă', tw.replace(/\s+/g, ' ') === tl.replace(/\s+/g, ' '), tw + ' // ' + tl);
      T('…limita AI doar pe regula veche', /regula veche, pe cont\)<\/div>[\s\S]*rax-cfg-ailimit/.test(w) === L.peRegulaVeche(cfg), String(L.peRegulaVeche(cfg)));
    }
    let cerut = null;
    const pune = new Function('_raxCfg', 'raConfirm', 'fetch', 'window', 'document', '_raxRenderCfg', 'var w = {}; ' + functie(html, 'window.raxCfgPachet = async function (cod)').replace('window.raxCfgPachet =', 'w.f =') + '; return w.f;')(
      { id: 7, pachet: null, pachete: PK }, async (m, o) => { cerut = { m, o }; return false; }, async () => ({ json: async () => ({}) }), {}, {}, () => {});
    for (const p of PK) {
      await pune(p.cod);
      const c = L.confirmarePachetFirma(p);
      T('confirmarea pachetului ' + p.nume + ': aceleași cuvinte ca raxCfgPachet', cerut.m === c.text && cerut.o.title === c.titlu && cerut.o.okLabel === c.ok, cerut.m + ' / ' + c.text);
    }
    T('fila „Acces": butoanele pachetului, nota și confirmarea; limita doar pe regula veche', /butonPachetFirma\(p\)/.test(S.acces) && /peRegulaVeche\(cfg\) && <>/.test(S.acces) && /saveCompanySettingsOf\(companyId, \{ ai_pachet: \{ cod: p\.cod \} \}\)/.test(S.acces));
    T('…numele rândului ca pe web', /Limită AI lunară \(regula veche, pe cont\)/.test(S.acces));
    T('„Abonament & plăți": întrebările pe cont doar pe `ai_regula_veche`, altfel drumul spre „Acces"', /\{!!ov\.ai_regula_veche && <>/.test(S.abon) && /\{!ov\.ai_regula_veche && <>/.test(S.abon) && /Se vinde pe pachete; pachetul firmei se alege din fila „Acces”\./.test(S.abon) && html.indexOf('Se vinde pe pachete; pachetul firmei se alege din fila „Acces”.') >= 0 && /rutaFisa\(id, 'acces'\), true/.test(S.abon) && /ai_regula_veche: !_pachetCo\(company\)/.test(server));
    T('…și telefonul nu mai pomenește „Module & limite"', !/Module &amp; limite/.test(S.abon) && html.indexOf('Agenții se pornesc și se opresc din fila „Acces”.') >= 0 && S.abon.indexOf('Agenții se pornesc și se opresc din fila „Acces”.') >= 0);
  })();
}

function parteaOfertei() {
  sect('5. Oferta: pachetul și prețul, fără câmpurile vechi');
  T('cele patru pachete vin din lista paginii (`aiPachet`), prețul e `pPachet`, descrierea o dă serverul', /meta\.aiPachet && meta\.aiPachet\.optiuni/.test(S.oferta) && /schimba\('aiPachet', o\.v\)/.test(S.oferta) && /nr\('pPachet'/.test(S.oferta) && /res\.arata\.pachetPret/.test(S.oferta) && /web\(res && res\.html && res\.html\.aiA\)/.test(S.oferta));
  T('câmpurile vechi au plecat: bifa `aiA`, prețul pe cont, conturile, întrebările pe cont', !/'aiA'|'pAiA'|'aiqSeats'|'aiqN'|aiqCost|res\.arata\.aiq/.test(faraComentarii(S.oferta)));
  T('textele cărților: ca pe web', html.indexOf('De aici pornește tot: abonamentul lunar, cantitățile de montaj și aparatele de cumpărat.') >= 0 && S.oferta.indexOf('De aici pornește tot: abonamentul lunar, cantitățile de montaj și aparatele de cumpărat.') >= 0
    && html.indexOf('RA Insight se vinde în pachete pe firmă: Start e inclus, iar Basic, Pro și Business au un preț fix pe lună, oricâte mașini.') >= 0 && S.oferta.indexOf('RA Insight se vinde în pachete pe firmă: Start e inclus, iar Basic, Pro și Business au un preț fix pe lună, oricâte mașini.') >= 0 && !/se vinde pe cont/.test(S.oferta));
  T('telefonul de dinainte rămâne citit de server (bifa `aiA`)', /if \('aiA' in b\.campuri\)/.test(server));
}

function parteaControlului() {
  sect('6. „RA Insight · control": numele, cartonașele vechi, ce rămâne pe web');
  T('numele, în meniu, sus, și pe ecran, ca pe web', /item\('sparkles', 'RA Insight · control'/.test(S.meniu) && S.meniu.indexOf("'RA Insight · control'") < S.meniu.indexOf('/> Gestiune</div>') && /titlu="RA Insight · control"/.test(S.control) && /doarSuper\(AiUsage, 'RA Insight · control'\)/.test(S.app) && !/Utilizare RA Insight/.test(faraComentarii(S.meniu + S.control + S.app)) && /agents: 'RA Insight · control'/.test(html));
  T('grupa se cheamă „Module", ca pe web', /Icon name="puzzle" size=\{13\} \/> Module</.test(S.meniu) && /<span>Module<\/span>/.test(html));
  T('cartonașele vechi au plecat, cu formulele lor', !/Banii, luna curentă|Clienții|conturi date, zero întrebări|Conturi de facturat/.test(S.control) && !/cifreLuna|profitLunaLei|marjaLuna|venitPeContLei|costPeIntrebareLei|profitFirmaLei|tendinta\b/.test(S.bani));
  T('patru cifre, „Ce cere atenție", un rând pe firmă, „Controale", istoricul, ca pe web', ['tilePachete(p, fx)', 'atentie(p, s, rows, fx)', 'randFirma(x, fx)', 'planSursa(', 'Controale', 'comutaIstoric'].every((x) => S.control.indexOf(x) >= 0) && /_aiuPachete\(d\.pachete\)[\s\S]{0,60}_aiuAtentie\(d\.pachete, s, rows\)[\s\S]{0,60}_aiuTabel\(rows\)[\s\S]{0,60}_aiuControale\(d\.pachete, d\.sursa\)/.test(html));
  T('soldul: rutele paginii, câmpurile serverului', /'\/api\/admin\/insight\/sold'/.test(S.endpoints) && /'\/api\/admin\/insight\/sold'/.test(html) && /p\.sold|const sold = p\.sold/.test(S.bani));
  T('„Proba modelelor" și „Cheia Anthropic" rămân pe web', /raxProbaModele/.test(html) && !/raxProbaModele|Proba modelelor|proba-modele|Cheia Anthropic/.test(faraComentarii(S.control + S.endpoints)));
  T('ecranul e doar al nostru', /aiUsage: doarSuper\(AiUsage/.test(S.app));
  T('bara se desenează fără HTML și cu stilurile ei pe ambele teme', /--fd-info: #60a5fa/.test(S.fcss) && /--fd-info: #1d4ed8/.test(S.fcss));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 7. Pe server pornit, prin clientul HTTP adevărat al telefonului
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PORT = 3533, TCP = 5533;
const BASE = 'http://127.0.0.1:' + PORT;
const DIR = path.join(os.tmpdir(), 'rax_telpachete_' + process.pid);
let srv = null, srvIesit = null, jurnal = '';
function pornesteServerul() {
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_tel_pachete', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
  });
  ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  srv.stderr.on('data', (x) => { jurnal = (jurnal + x).slice(-3000); });
  srv.on('error', (e) => { if (srvIesit === null) srvIesit = 'nu a pornit: ' + e.message; });
  srv.on('exit', (c, s) => { srvIesit = c != null ? c : (s || 'oprit'); });
}
// Nimeni de la o firmă nu vede costuri: nicio cheie de felul ăsta, oricât de adânc.
const CHEI_COST = /^(cost|costLei|costEur|cost_usd|costUsd|plasa|plasaLei|ramanLei|marja|plafonLei|tokens|input_tokens|output_tokens)$/;
function cheiCost(x, out) {
  out = out || [];
  if (Array.isArray(x)) x.forEach((y) => cheiCost(y, out));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => { if (CHEI_COST.test(k)) out.push(k); cheiCost(x[k], out); });
  return out;
}
async function parteaServerului() {
  sect('7. Pe server pornit, prin clientul HTTP al telefonului');
  let pornit = false;
  for (let i = 0; i < 480 && srvIesit === null; i++) {
    try { if ((await fetch(BASE + '/api')).ok) { pornit = true; break; } } catch (e) { /* încă pornește */ }
    await sleep(500);
  }
  T('serverul pornește', pornit, (srvIesit !== null ? 's-a oprit singur (' + srvIesit + '). ' : '') + jurnal.slice(-1500));
  if (!pornit) return;
  const r0 = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: 'admin', password: 'test1234' }) });
  const ck = (r0.headers.getSetCookie ? r0.headers.getSetCookie() : [r0.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, b) => { const x = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? J(b) : undefined }); let j = null; try { j = await x.json(); } catch (e) { /* */ } return { s: x.status, j }; };
  const PAROLA = 'Str4da-Verde-2026';
  const firma = async (name, setari) => {
    const co = (await R('POST', '/api/companies', { name })).j;
    if (setari) await R('PUT', '/api/companies/' + co.id + '/settings', setari);
    return co;
  };
  const om = async (co, username, role) => {
    const r = await R('POST', '/api/users', { username, full_name: 'Om ' + username.split('@')[0], role, company_id: co.id });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, BASE);
    return r.j;
  };
  const coS = await firma('Firma Start SRL', { ai_pachet: { cod: 'start' } });
  const coB = await firma('Firma Basic SRL', { ai_pachet: { cod: 'basic' } });
  const coP = await firma('Firma Pro SRL', { ai_pachet: { cod: 'pro' } });
  const coV = await firma('Firma Veche SRL');
  const pusV = await R('PUT', '/api/companies/' + coV.id + '/settings', { ai_quota: { questionsPerSeat: 50, seatPriceRON: 17 }, regula_veche: true });
  T('(pregătire) firma pe regula veche', pusV.s === 200, J(pusV));
  const admS = await om(coS, 'sef@start.ro', 'company_admin');
  const omS = await om(coS, 'om@start.ro', 'manager');
  const admB = await om(coB, 'sef@basic.ro', 'company_admin');
  const omB = await om(coB, 'om@basic.ro', 'manager');
  const om2B = await om(coB, 'om2@basic.ro', 'viewer');
  const admP = await om(coP, 'sef@pro.ro', 'company_admin');
  const omP = await om(coP, 'om@pro.ro', 'manager');
  const admV = await om(coV, 'sef@veche.ro', 'company_admin');
  const omV = await om(coV, 'om@veche.ro', 'viewer');
  void omS; void om2B; void omV;

  const hook = {};
  const client = modul(F.client, { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } }, { fetch: (...a) => hook.fetch(...a) });
  hook.fetch = (url, op) => fetch(BASE + url, op);
  const Api = modul(F.endpoints, { './client': client }).Api;
  let tokenAcum = null;
  const tel = async (u, parola) => { const r = await Api.mobileLogin(u, parola || PAROLA, 'proba'); client.setAuthToken(r.token); tokenAcum = r.token; return r; };
  const eroare = async (f) => { try { await f(); return null; } catch (e) { return e; } };

  // ── Administratorul pe Basic ──
  const lgB = await tel('sef@basic.ro');
  T('administratorul pe Basic intră', !!lgB.token);
  const qB = await Api.aiQuota();
  T('/api/ai/quota: pachetul, fără bani', qB.pachet && qB.pachet.cod === 'basic' && !cheiCost(qB).length, J(qB).slice(0, 300));
  const pk = await Api.insightPachete();
  T('„Vezi pachetele": cele patru, cu `eticheta`, `cifre`, `plus`, `include`, `comparatie`, `inToate`, prețuri', pk.pachete.length === 4 && pk.actual === 'basic' && pk.poateSchimba === true && pk.pachete.every((p) => Array.isArray(p.cifre) && p.plus && Array.isArray(p.include)) && pk.comparatie.length > 0 && pk.inToate.length > 0 && pk.pachete[2].pret, J(pk).slice(0, 200));
  await comparaPachete('„Vezi pachetele", răspunsul adevărat', pk);
  T('…fără costuri', !cheiCost(pk).length, J(cheiCost(pk)));
  const co1 = await Api.insightPachetConturi();
  T('„Pachet și conturi": `rezumat`, oamenii, nota', Array.isArray(co1.rezumat) && co1.rezumat.length > 0 && Array.isArray(co1.oameni) && !!co1.nota, J(co1).slice(0, 300));
  await comparaConturi('„Pachet și conturi", Basic, răspunsul adevărat', co1);
  T('…fără costuri', !cheiCost(co1).length, J(cheiCost(co1)));
  // Dă-i cont; la plin, `nuPoate`.
  const sefB = co1.oameni.find((o) => o.nume === 'Om sef');
  T('administratorul are singur locul (primul pe pachet)', !!sefB && sefB.loc === true, J(co1.oameni));
  await Api.setUserAiSeat(omB.id, true);
  const co2 = await Api.insightPachetConturi();
  const plan2 = L.planConturi(co2);
  T('al doilea cont pornește; Basic e plin: al treilea are `nuPoate`, de la server', plan2.oameni.filter((o) => o.loc).length === 2 && plan2.oameni.some((o) => !o.loc && o.nuPoate), J(plan2.oameni));
  await comparaConturi('„Pachet și conturi", plin', co2);
  const fara = co2.oameni.find((o) => !o.loc);
  const ref = await eroare(() => Api.setUserAiSeat(fara.id, true));
  T('…și serverul îl refuză, cu mesajul lui', !!ref && !!ref.message && (ref.status === 403 || ref.status === 400 || ref.status === 409), ref && (ref.status + ' ' + ref.message));
  T('limita nu e pe Basic: refuzată de server', !!(await eroare(() => Api.setUserAiLimita(omB.id, 10))));

  // Administratorul FĂRĂ cont: le-a dat colegilor; intră tot în „Pachet și conturi".
  await Api.setUserAiSeat(admB.id, false);
  const faraLoc = await Api.insightConversatii('');
  T('administratorul fără cont: conversațiile spun că nu e pornit', faraLoc.seatMissing === true || faraLoc.error === 'ai_seat_missing', J(faraLoc).slice(0, 200));
  const coFara = await Api.insightPachetConturi();
  T('…dar „Pachet și conturi" i se deschide', Array.isArray(coFara.oameni) && coFara.oameni.some((o) => o.nume === 'Om sef' && !o.loc), J(coFara).slice(0, 300));
  const pkFara = await Api.insightPachete();
  T('…și „Vezi pachetele"', pkFara.poateSchimba === true);
  await Api.setUserAiSeat(admB.id, true).catch(() => {});

  // Trecerea, cu 409 adevărat: prețul se schimbă între deschidere și confirmare.
  const tr = await Api.insightPachetTrecere('pro');
  T('trecerea: textul, butonul, bifa — de la server', !!tr.text && !!tr.buton && !!tr.bifa && !cheiCost(tr).length, J(tr).slice(0, 300));
  const faraBifa = await eroare(() => Api.insightPachetTrecereConfirma(L.corpTrecere('pro', tr.text, false)));
  T('fără bifă: refuzat', !!faraBifa && faraBifa.status === 400 && L.dupaConfirmare(400, faraBifa.data).fel === 'eroare', faraBifa && faraBifa.status);
  const lista0 = (await R('GET', '/api/admin/system-settings')).j || {};
  const pus = await R('PUT', '/api/admin/system-settings', { tarife_lista: Object.assign({}, lista0.tarife_lista || {}, { pkPro: 27 }) });
  T('(pregătire) prețul lui Pro se schimbă între timp', pus.s === 200, J(pus).slice(0, 200));
  const e409 = await eroare(() => Api.insightPachetTrecereConfirma(L.corpTrecere('pro', tr.text, true)));
  T('textul s-a schimbat: 409, cu textul nou și butonul', !!e409 && e409.status === 409 && e409.data && !!e409.data.text && e409.data.text !== tr.text, e409 && (e409.status + ' ' + J(e409.data)));
  const d = L.dupaConfirmare(e409.status, e409.data);
  T('…telefonul arată textul nou și cere bifa din nou', d.fel === 'din-nou' && d.text === e409.data.text && /27/.test(d.text), J(d));
  const gata = await Api.insightPachetTrecereConfirma(L.corpTrecere('pro', d.text, true));
  const dg = L.dupaConfirmare(200, gata);
  T('…cu textul nou: gata, mesajul serverului', gata.ok === true && dg.fel === 'gata' && !!dg.mesaj, J(gata));
  const qDupa = await Api.aiQuota();
  T('firma e pe Pro, de azi', qDupa.pachet.cod === 'pro', qDupa.pachet.cod);
  const coDupa = await Api.insightPachetConturi();
  T('„Schimbările de pachet": rândul, cu PDF-ul', coDupa.treceri.length === 1 && /\/api\/insight\/pachet-trecere\/\d+\/pdf/.test(coDupa.treceri[0].pdf) && L.planConturi(coDupa).treceri[0].cine.indexOf(' · ') > 0, J(coDupa.treceri));
  await comparaConturi('„Pachet și conturi", cu trecerea', coDupa);
  const cuCheie = (p, tok) => fetch(BASE + p, { headers: { Authorization: 'Bearer ' + tok } });
  const antet = /Bearer/.test(S.client) ? 'Bearer' : '';
  const hPdf = await cuCheie(coDupa.treceri[0].pdf, tokenAcum);
  T('…PDF-ul se deschide cu cheia telefonului', hPdf.status === 200 && /pdf/.test(hPdf.headers.get('content-type') || ''), antet + ' ' + hPdf.status + ' ' + hPdf.headers.get('content-type'));
  // Limita pe om, acum pe Pro: prin ruta lui.
  await Api.setUserAiLimita(omB.id, 40);
  const coLim = await Api.insightPachetConturi();
  const omLim = L.planConturi(coLim).oameni.find((o) => o.id === omB.id);
  T('limita: „Cel mult 40" se ține minte, folositele „0 din 40"', omLim.cuLimita && omLim.limita === '40' && omLim.arataLimita && /din 40/.test(omLim.folosite), J(omLim));
  await comparaConturi('„Pachet și conturi", cu limită', coLim);
  const preaMult = await eroare(() => Api.setUserAiLimita(omB.id, 100000));
  T('…peste întrebările pachetului: refuzat de server', !!preaMult && !!preaMult.message, preaMult && preaMult.message);
  await Api.setUserAiLimita(omB.id, null);
  T('…„Fără limită" o scoate', L.planConturi(await Api.insightPachetConturi()).oameni.find((o) => o.id === omB.id).cuLimita === false);

  // Trecerea programată în jos: `urmator`, pe ecran și pe rând.
  const jos = await Api.insightPachetTrecere('basic');
  await Api.insightPachetTrecereConfirma(L.corpTrecere('basic', jos.text, true));
  const coJos = await Api.insightPachetConturi();
  T('un pachet mai mic: programat, `urmator` pe pagină', !!coJos.urmator, J(coJos.urmator));
  await comparaConturi('„Pachet și conturi", cu trecerea programată', coJos);
  const pkJos = await Api.insightPachete();
  await comparaPachete('„Vezi pachetele", cu trecerea programată', pkJos);
  const planJos = L.planPachete(pkJos);
  T('…„Rămân pe Pro", cel programat fără buton', planJos.carduri.find((c) => c.cod === 'pro').alege === 'Rămân pe Pro' && !planJos.carduri.find((c) => c.cod === 'basic').alege && !!planJos.carduri.find((c) => c.cod === 'basic').programat, J(planJos.carduri.map((c) => c.alege)));
  const inapoi = await Api.insightPachetTrecere('pro');
  await Api.insightPachetTrecereConfirma(L.corpTrecere('pro', inapoi.text, true));

  // ── Pe Pro: conturile și limita ──
  await tel('sef@pro.ro');
  const cp = await Api.insightPachetConturi();
  T('Pro: se împart întrebările', cp.pachet.imparte === true && L.planConturi(cp).coloane.indexOf('Întrebări pe lună') >= 0);
  await comparaConturi('„Pachet și conturi", Pro', cp);
  await Api.setUserAiSeat(omP.id, true);
  await Api.setUserAiLimita(omP.id, 30);
  await comparaConturi('„Pachet și conturi", Pro, cu limită', await Api.insightPachetConturi());
  const uP = await Api.users();
  const rP = L.randConturi(uP, L.cuPachetFirmei('company_admin', await Api.aiQuota()));
  T('Utilizatori, pe Pro: rândul cu pachetul și linkul', rP && rP.n === 1 && rP.link && /pachetul Pro, 5 conturi/.test(rP.rest), J(rP));
  T('…bagheta nu apare, eticheta da', uP.filter((u) => u.role !== 'superadmin').every((u) => !L.arataBagheta(u, { nume: 'Pro' })) && uP.some((u) => L.arataEticheta(u, { nume: 'Pro' })));

  // ── Pe Start ──
  await tel('sef@start.ro');
  const qS = await Api.aiQuota();
  T('Start: pachetul, fără AI și fără ramuri', qS.pachet.cod === 'start' && qS.pachet.ai === false && qS.pachet.ramuri === false);
  const cs = await Api.insightPachetConturi();
  await comparaConturi('„Pachet și conturi", Start', cs);
  T('Start: doar administratorul; celălalt are `nuPoate`, „Sursă externă" lipsește', cs.oameni.some((o) => !o.loc && o.nuPoate) && !cs.sursa, J(cs.oameni));
  const ps = await Api.insightPachete();
  await comparaPachete('„Vezi pachetele", Start', ps);
  T('…poate trece mai sus', ps.poateSchimba === true && L.planPachete(ps).carduri.find((c) => c.cod === 'basic').alege === 'Alege Basic');
  T('…fără costuri', !cheiCost(qS).concat(cheiCost(cs), cheiCost(ps)).length);
  void admS;

  // ── Regula veche ──
  await tel('sef@veche.ro');
  const cv = await Api.insightPachetConturi();
  T('regula veche: `vechi`, cu `mesaj`', cv.vechi === true && !!cv.mesaj, J(cv));
  await comparaConturi('„Pachet și conturi", regula veche', cv);
  const qV = await Api.aiQuota();
  T('…nu are pachet', !qV.pachet && !cheiCost(qV).length, J(qV).slice(0, 200));
  const pv = await Api.insightPachete();
  T('…„Vezi pachetele": fără pachet actual și fără „Alege"', !pv.actual && pv.poateSchimba === false && L.planPachete(pv).carduri.every((c) => !c.alege), J(pv.poateSchimba));
  await comparaPachete('„Vezi pachetele", regula veche', pv);
  const uV = await Api.users();
  T('Utilizatori: bagheta rămâne, fără etichetă și fără link', uV.filter((u) => u.role !== 'superadmin').every((u) => L.arataBagheta(u, null) && !L.arataEticheta(u, null)));
  await Api.setUserAiSeat(admV.id, true);
  const rV = L.randConturi(await Api.users(), L.cuPachetFirmei('company_admin', await Api.aiQuota()));
  T('…rândul de sus spune regula veche', rV && !rV.link && /vârful lunii/.test(rV.rest), J(rV));

  // Omul firmei, fără drept: nu ajunge la paginile administratorului și nu vede costuri.
  await tel('om@basic.ro');
  const rOm = await eroare(() => Api.insightPachetConturi());
  const rTr = await eroare(() => Api.insightPachetTrecere('pro'));
  T('managerul: „Pachet și conturi" și trecerea îi sunt refuzate de server', !!rOm && (rOm.status === 403) && !!rTr && (rTr.status === 403), J([rOm && rOm.status, rTr && rTr.status]));
  const pOm = await Api.insightPachete();
  T('…„Vezi pachetele" fără „Alege" (`poateSchimba` de la server)', pOm.poateSchimba === false && L.planPachete(pOm).carduri.every((c) => !c.alege));
  // Niciun om de la o firmă nu ajunge la tabloul nostru, cu cheia telefonului.
  for (const [cine, cum] of [['managerul', 'om@basic.ro'], ['administratorul', 'sef@basic.ro'], ['administratorul de pe Start', 'sef@start.ro'], ['cel de pe regula veche', 'sef@veche.ro']]) {
    await tel(cum);
    const e = await eroare(() => Api.aiUsage());
    T(cine + ': tabloul costurilor îi e închis', !!e && (e.status === 403 || e.status === 401), e && e.status);
    const eo = await eroare(() => Api.offerCalc({ nou: true }));
    T(cine + ': oferta (cu ce ne rămâne) îi e închisă', !!eo && (eo.status === 403 || eo.status === 401), eo && eo.status);
    const es = await eroare(() => Api.companySettingsOf(coB.id));
    T(cine + ': setările firmei (prețurile, pachetul) îi sunt închise', !!es && (es.status === 403 || es.status === 401), es && es.status);
    const pdfAltul = await cuCheie(coDupa.treceri[0].pdf, tokenAcum);
    if (cum !== 'sef@basic.ro') T(cine + ': confirmarea altei firme = 404', pdfAltul.status === 404 || pdfAltul.status === 403, pdfAltul.status);
  }

  // ── Fondatorul ──
  await tel('admin', 'test1234');
  const ovP = await Api.companyOverview(coP.id), ovV = await Api.companyOverview(coV.id);
  T('fișa firmei: `ai_regula_veche` deosebește cele două', ovP.ai_regula_veche === false && ovV.ai_regula_veche === true, J([ovP.ai_regula_veche, ovV.ai_regula_veche]));
  const sB = await Api.companySettingsOf(coS.id);
  T('fila „Acces": lista pachetelor și pachetul firmei', Array.isArray(sB.pachete) && sB.pachete.length === 4 && sB.ai_pachet.cod === 'start' && !L.peRegulaVeche(sB), J(sB.ai_pachet));
  T('…pe regula veche, limita AI se arată', L.peRegulaVeche(await Api.companySettingsOf(coV.id)) === true);
  const refCot = await eroare(() => Api.saveCompanySettingsOf(coS.id, { ai_quota: { questionsPerSeat: 10, seatPriceRON: 5 } }));
  T('pe o firmă cu pachet, „întrebări pe cont" e refuzat de server (deci nu se arată)', !!refCot && refCot.status === 400, refCot && (refCot.status + ' ' + refCot.message));
  const refLim = await eroare(() => Api.setCompanyAiLimit(coS.id, 10));
  T('…și limita AI', !!refLim && refLim.status === 400, refLim && refLim.status);
  const pusPk = await Api.saveCompanySettingsOf(coS.id, { ai_pachet: { cod: 'pro' } });
  T('fondatorul pune pachetul din „Acces"', pusPk.ai_pachet && pusPk.ai_pachet.cod === 'pro', J(pusPk.ai_pachet));
  await Api.saveCompanySettingsOf(coS.id, { ai_pachet: { cod: 'start' } });
  const uF = await Api.users();
  T('Utilizatori, la fondator: bagheta pe oamenii firmelor, nu pe colegi', uF.filter((u) => u.role === 'superadmin').every((u) => !L.arataBagheta(u, null)) && uF.filter((u) => u.role !== 'superadmin').every((u) => L.arataBagheta(u, null)));
  const rPkF = await eroare(() => Api.insightPachetTrecere('pro'));
  T('fondatorul nu schimbă pachetul prin trecere (n-are firmă)', !!rPkF, rPkF && rPkF.status);

  // ── Oferta ──
  const o0 = await Api.offerCalc({ nou: true });
  T('oferta nouă: pachetul (Start), lista celor patru, fără câmpurile vechi', o0.campuri.aiPachet === 'start' && o0.formular.find((x) => x.k === 'aiPachet').optiuni.length === 4 && !('aiA' in o0.campuri) && !('pAiA' in o0.campuri) && !('aiqSeats' in o0.campuri) && !('aiqN' in o0.campuri) && o0.arata.pachetPret === false, J(Object.keys(o0.campuri).filter((k) => /ai/i.test(k))));
  const o1 = await Api.offerCalc({ campuri: Object.assign({}, o0.campuri, { aiPachet: 'pro' }), atinse: o0.atinse, schimbate: ['aiPachet'] });
  const ln = (o1.r.lines || []).find((x) => x.fel === 'ai') || {};
  T('alege Pro: prețul propus, descrierea pachetului, rândul de pe ofertă', o1.arata.pachetPret === true && Number(o1.campuri.pPachet) > 0 && /5 conturi|până la 5/.test(o1.html.aiA) && ln.pachet === 'pro' && ln.total === Number(o1.campuri.pPachet), J([o1.campuri.pPachet, o1.html.aiA.slice(0, 120), ln]));
  const o2 = await Api.offerCalc({ campuri: Object.assign({}, o1.campuri, { pPachet: '17', 'cl-name': 'Client de probă' }), atinse: (o1.atinse || []).concat(['pPachet']), schimbate: ['pPachet'] });
  T('prețul negociat: rămâne și ajunge în corpul salvării', o2.campuri.pPachet === '17' && o2.salvare && o2.salvare.corp.config.cfg.aiPachet === 'pro' && Number(o2.salvare.corp.config.cfg.aiPachetPret) === 17, J([o2.salvareEroare, o2.campuri.pPachet, o2.salvare && o2.salvare.corp.config.cfg]));
  T('…fără vechiul `aiA` trimis de telefon', !('aiA' in o2.campuri));
  // O ofertă veche, pe cont, se redeschide pe Basic, ca pe web.
  const veche = await Api.createOffer({ name: 'Oferta veche', client_name: 'Client vechi', config: { cfg: { nVeh: 5, aiA: true, aiqN: 100, aiqSeats: 3, aiqSeat: 14, contractMonths: 24 }, prices: { pAiA: 14 } }, monthly_total: 100 });
  const dV = await Api.offerCalc({ offer_id: veche.id, incarca: true });
  T('o ofertă veche (pe cont) se redeschide pe Basic', dV.campuri.aiPachet === 'basic', J(dV.campuri.aiPachet));
  // Telefonul vechi: bifa `aiA`, citită de server ca Basic.
  const tv = await Api.offerCalc({ campuri: Object.assign({}, o0.campuri, { aiA: true }), atinse: [], schimbate: ['aiA'] });
  T('telefonul de dinainte (bifa `aiA`) merge mai departe, pe Basic', tv.campuri.aiPachet === 'basic', J(tv.campuri.aiPachet));

  // ── „RA Insight · control" ──
  const usage = await Api.aiUsage();
  T('tabloul nostru: pachetele, soldul nescris, `sursa`', !!usage.pachete && !usage.pachete.sold && !!usage.sursa && Array.isArray(usage.rows), J(Object.keys(usage)));
  const B = modul('mobile/src/components/insightBani.ts');
  const fx = usage.fxEur;
  const tile = B.tilePachete(usage.pachete, fx);
  T('cele patru cifre, din ce a dat serverul', tile.length === 4 && tile[3].v === '—' && tile[3].s === 'nescris' && tile[3].buton === 'scrie-l', J(tile));
  const rBas = usage.rows.find((r) => r.id === coB.id);
  const rr = B.randFirma(rBas, fx);
  T('rândul firmei: pachetul, plasa (fără costuri inventate)', rr.pachet === rBas.pachet.nume && rr.pachetRand && /plasa/.test(rr.pachetRand.plasa), J(rr));
  await Api.insightSold('120,5'.replace(',', '.'));
  const u2 = await Api.aiUsage();
  T('soldul scris: `_soldAnthropic` îl dă înapoi, fără zile fără ritm', u2.pachete.sold && Number(u2.pachete.sold.usd) === 120.5 && /fără cheltuieli în ultimele 7 zile/.test(B.textSold(u2.pachete.sold)), J(u2.pachete.sold));
  const seS = await Api.adminSursaExterna('firme');
  T('„Sursă externă": comutatorul pe platformă', seS.ok === true && seS.stare === 'firme', J(seS));
  const u3 = await Api.aiUsage();
  const seP = B.planSursa(u3.sursa, fx);
  T('…rândul lui', seP.stari.find((x) => x.al).k === 'firme' && seP.stari.length === 3 && /Basic 10, Pro 30, Business 50/.test(seP.luna), J(seP));

  // Cu sursa pornită, rândul firmei apare, iar administratorul îl oprește.
  await tel('sef@pro.ro');
  const cuSe = await Api.insightPachetConturi();
  T('rândul „Sursă externă" la firmă, pornit', !!cuSe.sursa && cuSe.sursa.oprita === false, J(cuSe.sursa));
  await comparaConturi('„Pachet și conturi", cu „Sursă externă"', cuSe);
  await Api.insightSursaFirma(false);
  const faraSe = L.planConturi(await Api.insightPachetConturi());
  T('…oprit de administrator', faraSe.sursa.pornita === false, J(faraSe.sursa));
  await Api.insightSursaFirma(true);
}

function parteaDesenului() {
  sect('8. Ecranele, desenate în HTML (doar cu preact)');
  if (!PREACT) { sarite++; console.log('  ⤼ sărit: desenul paginilor (' + (CA_IN_CI ? 'PROBA_CA_IN_CI=1' : 'mobile/node_modules nu e instalat') + ')'); return; }
  const { preact, hooks, jsxRt, rts } = PREACT;
  const h = preact.h, r = (x) => rts.renderToString(x);
  const rezolva = (rel, id) => {
    const baza = path.posix.join(path.posix.dirname(rel), id);
    for (const ext of ['.ts', '.tsx']) if (fs.existsSync(path.join(ROOT, baza + ext))) return baza + ext;
    return baza;
  };
  // Serverul de carton răspunde pe loc; efectele nu rulează la desenul pe server, deci cartonașele se desenează cu un `useState` pus de probă.
  const stari = [];
  const hooksPuse = Object.assign({}, hooks, { useState: (v) => { if (stari.length) { const x = stari.shift(); return [x, () => {}]; } return hooks.useState(v); } });
  const me = { value: { role: 'company_admin', permissions: {}, features: {} } };
  const stubs = {
    preact, 'preact/hooks': hooksPuse, 'preact/jsx-runtime': jsxRt,
    'preact-iso': { useLocation: () => ({ route() {}, query: {}, path: '/', url: '/' }), useRoute: () => ({ params: {}, query: {} }) },
    '../app/store': { me, showToast() {} }, '../api/endpoints': { Api: new Proxy({}, { get: () => () => new Promise(() => {}) }) },
    './FlotaUi': { Confirma: () => null }, '../lib/inapoiFoaie': { useInapoiInchide() {}, dupaInapoi(f) { f(); } }, '../lib/export': { exportHistoryReport() {} },
    './ContractUi': { HartieBtns: ({ path: p }) => h('a', { href: p }, 'PDF') },
  };
  const mem = {};
  const inc = (rel) => {
    if (mem[rel]) return mem[rel].exports;
    const m = mem[rel] = { exports: {} };
    const ctx = vm.createContext({ module: m, exports: m.exports, console, setTimeout, clearTimeout, setInterval, clearInterval,
      require: (id) => {
        if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
        if (/\.css$/.test(id)) return {};
        if (id.charAt(0) === '.') return inc(rezolva(rel, id));
        throw new Error('require neașteptat în ' + rel + ': ' + id);
      } });
    vm.runInContext(tsJs(citeste(rel), rel), ctx, { filename: rel });
    return m.exports;
  };
  const C = inc(F.comp);
  const RAU = '<img src=x onerror=alert(1)>';
  const PK = require('./pachete');
  // Ordinea stărilor în PaginaPachete: j, err, trecere, cer.
  const jP = { pachete: PK.publice({}).map((p) => Object.assign(p, { titlu: RAU + p.titlu })), comparatie: PK.comparatie({ cuPret: true }), actual: 'pro', urmator: null, inToate: PK.IN_TOATE, reincarcare: RAU, poateSchimba: true, schimbText: RAU };
  stari.length = 0; stari.push(jP, '', null, '');
  const hp = r(h(C.PaginaPachete, { onSchimbat() {} }));
  T('„Vezi pachetele": textul serverului rămâne text', hp.indexOf('<img') < 0 && hp.indexOf('&lt;img') >= 0, hp.slice(0, 300));
  T('…cele patru, „Pachetul tău", „Alege", comparația pe celule', ['Pachetul tău', 'Alege Start', 'Alege Basic', 'Alege Business', 'pk-cel', L.TITLU_COMPARATIE, L.TITLU_IN_TOATE].every((x) => hp.indexOf(x) >= 0) && hp.indexOf('Alege Pro') < 0, hp.slice(0, 400));
  T('…fără tabel lat pe telefon', hp.indexOf('<table') < 0);
  // PaginaPachetConturi: j, err, daLoc.
  const jC = { pachet: { cod: 'pro', nume: 'Pro', imparte: true, conturi: 5, intrebari: 600, ramase: 150 }, urmator: RAU, treceri: [{ id: 3, cand: '02.11', cine: RAU, rezumat: 'Basic → Pro', email: 'trimisă', pdf: '/api/insight/pachet-trecere/3/pdf' }], rezumat: [RAU, 'doi'], oameni: [{ id: 1, nume: RAU, rol: 'Admin', loc: true, limita: 40, folositeText: '3 din 40' }, { id: 2, nume: 'Ion', rol: 'Manager', loc: false, folositeText: null, nuPoate: 'Nu mai sunt conturi.' }], nota: RAU, luna: 'noiembrie', sursa: { nume: 'Sursă externă', explicatie: RAU, oprita: false, text: RAU } };
  stari.length = 0; stari.push(jC, '', null);
  // Limita are stările ei (cel, val), citite tot de aici, după pagină.
  stari.push(true, '40');
  const hc = r(h(C.PaginaPachetConturi, { laPachete() {}, onSchimbat() {} }));
  T('„Pachet și conturi": textul serverului rămâne text', hc.indexOf('<img') < 0 && hc.indexOf('&lt;img') >= 0, hc.slice(0, 300));
  T('…rezumatul și bara, nu cartonașele vechi', /pkc-rez/.test(hc) && /width:25%/.test(hc) && !/pkc-card|cartonase/.test(hc), hc.slice(0, 400));
  T('…limita: „Fără limită" / „Cel mult…", caseta cu cifra, „pe lună"', hc.indexOf('Fără limită') >= 0 && hc.indexOf('Cel mult…') >= 0 && hc.indexOf('pe lună') >= 0 && /value="40"/.test(hc), hc);
  T('…comutatorul oprit la `nuPoate`, cu motivul sub el', /Nu mai sunt conturi\./.test(hc) && /role="switch"[^>]*aria-checked="false"[^>]*disabled/.test(hc), hc.slice(0, 600));
  T('…PDF-ul prin butoanele de hârtie', /href="\/api\/insight\/pachet-trecere\/3\/pdf"/.test(hc));
  stari.length = 0;
  const ip = inc(F.pagini);
  const ic = r(h(ip.PaginaIncuiata, { k: 'combustibil', laPachete() {} }));
  T('cartonașul încuiat: „Vezi pachetele" la administrator', ic.indexOf('Vezi pachetele') >= 0);
  T('…la ceilalți, nu', r(h(ip.PaginaIncuiata, { k: 'combustibil' })).indexOf('Vezi pachetele') < 0);
}

// Culorile: ce e text are contrast pe ambele teme.
function parteaCulorilor() {
  sect('9. Culorile, măsurate pe ambele teme');
  const hex = (c) => { const m = String(c).trim().match(/^#([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const cssInch = (S.css.match(/\.insp \{ --i-pk-verde:[^}]*\}/) || [''])[0], cssDesc = (S.css.match(/:root\[data-theme="light"\] \.insp \{ --i-pk-verde:[^}]*\}/) || [''])[0];
  const val = (bloc, k) => (bloc.match(new RegExp(k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
  const fundaluri = (s) => { const o = {}; ['--bg-panel', '--bg-card', '--bg-dark'].forEach((k) => { o[k] = val(s, k); }); return o; };
  const tok = S.tokens;
  const inch = fundaluri((tok.match(/:root[^{]*\{[^}]*\}/) || [''])[0] + tok), desc = fundaluri((tok.match(/\[data-theme="light"\][^{]*\{[^}]*\}/) || [''])[0]);
  for (const [nume, bloc, f] of [['închisă', cssInch, inch], ['deschisă', cssDesc, desc]]) {
    T('tema ' + nume + ': fundalurile citite', !!(f['--bg-panel'] && hex(f['--bg-panel'])), J(f));
    for (const k of ['--i-pk-verde', '--i-pk-urm']) {
      const c = contrast(hex(val(bloc, k)), hex(f['--bg-panel']));
      T('tema ' + nume + ': ' + k + ' pe panou = ' + c.toFixed(2), c >= 4.5, val(bloc, k));
    }
    const et = contrast(hex(val(bloc, '--i-pk-eti-text') || '#ffffff'), hex(val(bloc, '--i-pk-eti-fund')));
    T('tema ' + nume + ': eticheta pachetului = ' + et.toFixed(2), et >= 4.5);
    const ta = contrast(hex(val(bloc, '--i-pk-tau-text') || '#ffffff'), hex(val(bloc, '--i-pk-tau-fund') || '#3fe07d'));
    T('tema ' + nume + ': „Pachetul tău" = ' + ta.toFixed(2), ta >= 4.5);
  }
  T('câmpurile de scris: 16 px, ca telefonul să nu mărească pagina', /\.pkc-sel, \.pkc-lim \{[^}]*font-size: 16px/.test(S.css));
  T('fără nume de font: paginile moștenesc Nunito', !/font-family:\s*(?!\s|inherit)/.test(S.css.slice(S.css.indexOf('„Vezi pachetele" și trecerea'))));
}

let terminat = false;
function curata() {
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(DIR, { recursive: true, force: true }); if (!fs.existsSync(DIR)) return; } catch (e) { /* încă ținut de server */ }
    const t = Date.now(); while (Date.now() - t < 300) { /* Windows: fișierele se eliberează greu după oprire */ }
  }
}
function gata() {
  if (terminat) return; terminat = true;
  const final = () => {
    curata();
    console.log('\n' + '─'.repeat(30));
    if (sarite) console.log(sarite + (sarite === 1 ? ' verificare sărită' : ' verificări sărite'));
    console.log(ok + ' verificări trecute, ' + rele + ' picate');
    process.exit(rele ? 1 : 0);
  };
  if (!srv || srvIesit !== null) return final();
  let dus = false;
  const o = () => { if (!dus) { dus = true; final(); } };
  srv.on('exit', o);
  try { srv.kill(); } catch (e) { /* */ }
  setTimeout(o, 3000);
}
(async () => {
  sect('0. Fișierele');
  T('toate fișierele citite de probă există', Object.keys(S).every((k) => !!S[k]), Object.keys(S).filter((k) => !S[k]).join(', '));
  pornesteServerul();   // se încălzește cât rulează bucățile fără server
  for (const [nume, f] of [['intrările', parteaIntrarilor], ['pachetele', parteaPachetelor], ['utilizatorii', parteaUtilizatorilor], ['oferta', parteaOfertei], ['controlul', parteaControlului], ['desenul', parteaDesenului], ['culorile', parteaCulorilor], ['serverul', parteaServerului]]) {
    try { await f(); } catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
})().catch((e) => { rele++; console.log('  ✗ EROARE: ' + ((e && e.stack) || e)); }).then(gata);
