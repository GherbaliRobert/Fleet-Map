// verify_telefon_echipa.js — „Anunță echipa RA Track", „Cereri de la clienți", intervențiile din calendar și ecranul Alerte pe telefon
// (lotul 4, 02.11) fac ce face pagina web, pe aceleași rute.
//
//   node verify_telefon_echipa.js
//
// Ce păzește:
//   1. ușile: butonul din casete (insightProblemaButon), fișa mașinii (echipaDinFisa), meniul (openSupport), RULATE lângă lib/cereriEchipa;
//      foaia veche de suport a plecat; fondatorii n-au ușă; butonul `harta` duce la mașină;
//   2. fereastra clientului (blocul paginii, RULAT pe un DOM de carton): filele, mașina, lista de mașini, etichetele, ce pleacă, confirmarea
//      (și la 409), „Cererile tale", eroarea, `platforma`;
//   3. „Cereri de la clienți" (_cereriRand, raxCerere, RULATE): filele, ce scrie pe o cerere, butoanele, formularele, corpul cererilor, mesajele;
//   4. anunțurile: adresaAnunt, o adresă pentru fiecare, citită înapoi de ecrane;
//   5. calendarul: _mjcCalendarHtml și _mjcZiHtml, RULATE, lângă lib/calendarMontaj;
//   6. Alerte: `suna_peste`, `cum_suna`, fraza de sub prag, ca pe web;
//   7. pe server pornit, prin clientul HTTP adevărat al telefonului: clientul trimite, a doua cerere → 409, fondatorul nu poate trimite,
//      Preiau / Programez / Rezolvat / Redeschide, a doua apăsare → 409, anunțurile, intervenția în calendar, Alerte; clientul nu primește
//      niciodată datele aparatului;
//   8. ecranele desenate în HTML, lângă textele paginii (cu preact; în CI se sare);
//   9. culorile, măsurate pe ambele teme.
//
// Pornește UN server (PGlite, port 3535, TCP 5535, baza în dosarul temporar, ștearsă la final), fără model și fără email.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const CE = require('./cereri_echipa');

const ROOT = __dirname;
const citeste = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0, sarite = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
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
const faraComentarii = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');

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

const F = {
  html: 'public/index.html', srv: 'server.js', lib: 'mobile/src/lib/cereriEchipa.ts', numar: 'mobile/src/lib/numar.ts', insightLib: 'mobile/src/lib/insight.ts', pagLib: 'mobile/src/lib/insightPagini.ts',
  ecran: 'mobile/src/screens/AnuntaEchipa.tsx', lista: 'mobile/src/screens/CereriClienti.tsx', css: 'mobile/src/screens/echipa.css', icss: 'mobile/src/screens/insight.css', mcss: 'mobile/src/screens/montaj.css', fcss: 'mobile/src/screens/flota.css',
  meniu: 'mobile/src/screens/Menu.tsx', fisa: 'mobile/src/screens/VehicleDetail.tsx', bula: 'mobile/src/components/InsightBula.tsx', endpoints: 'mobile/src/api/endpoints.ts', client: 'mobile/src/api/client.ts', app: 'mobile/src/App.tsx',
  push: 'mobile/src/lib/push.ts', calLib: 'mobile/src/lib/calendarMontaj.ts', calTsx: 'mobile/src/components/CalendarMontaj.tsx', montaj: 'mobile/src/screens/Montaj.tsx', alerte: 'mobile/src/screens/AdminAlerts.tsx', tokens: 'mobile/src/theme/tokens.css',
  ctrLib: 'mobile/src/lib/contracte.ts',
};
const S = {}; Object.keys(F).forEach((k) => { S[k] = citeste(F[k]); });
const LN = modul(F.numar);
const L = modul(F.lib, { './numar': LN });
const LP = modul(F.pagLib);
const IL = modul(F.insightLib, { './insightPagini': LP, './cereriEchipa': L });
const PB = taie(S.html, '// ── începe „Anunță echipa RA Track"', '// ── sfârșit „Anunță echipa RA Track"');
const NB = taie(S.html, '// ── începe „Cereri de la clienți"', '// ── sfârșit „Cereri de la clienți"');
const citita = (u) => { const x = new URL(u, 'http://x'); return { path: x.pathname, query: Object.fromEntries(x.searchParams) }; };
// Textul unei bucăți: toate spațiile strânse, ca o propoziție (tăierea pe noduri diferă între DOM-ul de carton și HTML).
const strange = (l) => (Array.isArray(l) ? l.join(' ') : String(l)).replace(/\s+/g, ' ').trim();
const unesc = (t) => String(t).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const textHtml = (h) => strange(String(h).split(/<[^>]+>/).map(unesc));

// Răspunsuri de proba, din modulul serverului (aceleași funcții ca ruta).
const ACUM = Date.parse('2026-10-22T07:42:00Z');
const CERERE = {
  id: 142, company_id: 5, company_name: 'Transport Ionescu SRL', user_id: 11, imei: '350000000091001', plate: 'B 154 UIP', masina: 'Dacia Logan 3', problema: 'consum', titlu: 'Consumul nu se poate măsura', ce: 'Nivelul a stat la 22 L.',
  mesaj: 'A fost la service.', sursa: 'insight', cand: { cand: ['dimineata'], unde: 'Strada Fabricii 12' }, contact: { nume: 'Ana Pop', rol: 'admin companie', telefon: '0722 345 678', email: 'ana.pop@ionescu.ro' },
  aparat: { imei: '350000000091001', model: 'FMC130', sim: '0744 123 456', ultima: ACUM - 60000, gsm: 4, sateliti: 11, tensiune: 13.9, rezervor: 22, pornit: Date.parse('2026-03-12T09:00:00Z'), instalator: 'Montaj Rapid' },
  stare: 'trimisa', creat_la: ACUM - 3600000, trimisa_de_nume: 'Ana Pop',
};
const META = {
  cereri: [CE.pentruClient(CERERE, ACUM, { eu: 11 }), CE.pentruClient(Object.assign({}, CERERE, { id: 143, user_id: 12, trimisa_de_nume: 'Dan', stare: 'rezolvata', rezolvata_la: ACUM, rezolvata_de_nume: 'Alin Tilvar', raspuns: 'Am schimbat cartela.' }), ACUM, { eu: 11 })],
  admin: true, contact: { nume: 'Ana Pop', telefon: '0722 345 678', email: 'ana.pop@ionescu.ro' }, termen: CE.TERMEN, laFiecarePas: CE.LA_FIECARE_PAS,
  cand: CE.CAND.map((x) => ({ k: x[0], t: x[1] })), dateTrimise: CE.DATE_TRIMISE, dateTrimiseFaraMasina: CE.DATE_TRIMISE_FARA_MASINA, notaTrimisa: CE.NOTA_TRIMISA, notaLista: CE.NOTA_LISTA,
};
const MASINI = [{ imei: '350000000091001', plate: 'B 154 UIP', name: 'Dacia Logan 3' }, { imei: '350000000091002', plate: 'AB 268 ROY', name: 'AB 268 ROY' }, { imei: '350000000091003', name: 'Fără număr' }, { imei: '350000000091004' }];
const R200 = { ok: true, cerere: CE.pentruClient(CERERE, ACUM, { eu: 11 }), confirmare: CE.confirmare(CERERE, ACUM), seOcupa: CE.seOcupa(CERERE, ACUM), nota: CE.NOTA_TRIMISA, notaDupa: CE.NOTA_DUPA };
const R409 = { error: 'Echipa RA Track se ocupă deja de asta: cererea nr. 142.', deja: true, cerere: CE.pentruClient(CERERE, ACUM, { eu: 11 }), seOcupa: CE.seOcupa(CERERE, ACUM) };

// ─── Blocul ferestrei, rulat pe un DOM de carton (ca în verify_cereri_echipa.js) ───
function webFereastra(raspunsuri) {
  const noduri = [];
  function Nod(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.className = ''; this.hidden = false; this._t = ''; this.listeners = {}; this.value = ''; this.checked = false;
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }; noduri.push(this); }
  const text = (t) => { const n = new Nod('#text'); n._t = String(t); return n; };
  Nod.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
  Nod.prototype.replaceChild = function (n, v) { const i = this.children.indexOf(v); if (i >= 0) this.children[i] = n; n.parentNode = this; return v; };
  Nod.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  Nod.prototype.addEventListener = function (k, f) { this.listeners[k] = f; };
  Nod.prototype.querySelector = function (sel) { const c = String(sel).replace(/^\./, ''); const cauta = (n) => { for (const x of n.children) { if ((' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0) return x; const y = cauta(x); if (y) return y; } return null; }; return cauta(this); };
  Object.defineProperty(Nod.prototype, 'textContent', {
    get() { return this.tagName === '#TEXT' ? this._t : this.children.map((c) => c.textContent).join(''); },
    set(v) { if (this.tagName === '#TEXT') { this._t = String(v); return; } this.children = []; if (String(v)) this.appendChild(text(v)); } });
  Object.defineProperty(Nod.prototype, 'firstChild', { get() { return this.children[0] || null; } });
  Object.defineProperty(Nod.prototype, 'lastChild', { get() { return this.children[this.children.length - 1] || null; } });
  const doc = { body: new Nod('body'), createElement: (t) => new Nod(t), createTextNode: text, getElementById(id) { return noduri.filter((n) => n.id === id)[0] || null; }, addEventListener() {} };
  const trimise = [];
  const ctx = { document: doc, console, String, Array, JSON, Promise, encodeURIComponent, setTimeout, devices: new Map(MASINI.map((d) => [d.imei, d])),
    fetch: async (u, o) => { trimise.push({ u, o }); const r = raspunsuri(u, o || {}); return { status: r.s, json: async () => r.j }; } };
  ctx.window = ctx; ctx.detailPanelImei = null; ctx.goSistem = () => {};
  vm.createContext(ctx);
  vm.runInContext(PB, ctx);
  const vizibil = (n) => { if (n.hidden) return ''; if (n.tagName === '#TEXT') return n._t + ' '; return n.children.map(vizibil).join(''); };
  const dupaId = (id) => strange(vizibil(doc.getElementById(id)));
  const buton = (t) => noduri.filter((n) => n.tagName === 'BUTTON' && new RegExp(t).test(n.textContent)).pop();
  return { ctx, doc, noduri, trimise, dupaId, buton };
}

function parteaUsilor() {
  sect('1. Ușile');
  T('fișierele citite de probă există', Object.keys(S).every((k) => !!S[k]), Object.keys(S).filter((k) => !S[k]).join(', '));
  // Pagina, rulată: ce primește fereastra din fiecare ușă.
  const prinse = [];
  const ctx = vm.createContext({ console, String, setTimeout });
  ctx.window = ctx; ctx.echipaDeschide = (o) => { prinse.push(o); };
  vm.runInContext(functie(S.html, 'window.insightProblemaButon = function (b, p, it) {') + ';', ctx);
  const CAZURI = [
    [{ fel: 'echipa', text: 'x', problema: 'consum', imei: '35' }, { dovada: 'Nivelul a stat la 22 L.', titlu: 'T' }],
    [{ fel: 'echipa', text: 'x', problema: 'semnal', imei: '35' }, { dovada: 'De 3 ore.', titlu: 'T' }],
    [{ fel: 'echipa', text: 'x', problema: 'consum', imei: '35' }, {}],
    [{ fel: 'echipa', text: 'x', problema: 'semnal', imei: '3 5/6' }, null],
  ];
  for (const [b, p] of CAZURI) {
    prinse.length = 0;
    ctx.insightProblemaButon(b, p, null);
    const w = prinse[0], t = L.dinAdresa(citita(L.usaCaseta(b, p)).query);
    T('caseta RA Insight: fereastra primește la fel (' + b.problema + ')', w && w.imei === t.imei && w.problema === t.problema && String(w.ce || '') === t.ce && w.sursa === t.sursa, J([w, t]));
    T('…și butonul din lib/insight duce acolo', IL.rutaButon(b, p) === L.usaCaseta(b, p), IL.rutaButon(b, p));
  }
  T('`harta` duce la mașină (harta stă sus în fișă), `ce` nu se pune decât la consum', IL.rutaButon({ fel: 'harta', text: 'H', imei: '35' }) === '/vehicles/35' && !/ce=/.test(L.usaCaseta({ problema: 'semnal', imei: '35' }, { dovada: 'x' })));

  // Fișa și meniul, pe blocul paginii.
  const prindeUsa = (expr) => {
    const m = expr.match(/deschide\((\{[^}]*\})\)/);
    return m ? vm.runInNewContext('(' + m[1] + ')', { detailPanelImei: '35' }) : null;
  };
  const fisaW = prindeUsa(functie(PB, 'window.echipaDinFisa = function () {')), meniuW = prindeUsa(functie(PB, 'window.openSupport = function () {'));
  const fisaT = L.dinAdresa(citita(L.usaFisa('35')).query), meniuT = L.dinAdresa(citita(L.usaMeniu()).query);
  T('fișa mașinii: aceeași mașină, problemă și sursă ca pe web', fisaW && fisaW.imei === fisaT.imei && fisaW.problema === fisaT.problema && fisaW.sursa === fisaT.sursa, J([fisaW, fisaT]));
  T('meniul: fără mașină, ca iconița cu căști de pe web', meniuW && !meniuW.imei && !meniuW.problema && !meniuT.imei && !meniuT.problema, J([meniuW, meniuT]));
  T('…dar sursa spune adevărul: telefonul n-are iconița, deci „de pe telefon", și cererea nouă la fel', meniuW.sursa === 'suport' && meniuT.sursa === 'telefon' && CE.sursaText({ sursa: 'telefon' }) === 'de pe telefon' && L.corpCerere({}, { imei: '', mesaj: 'x', cand: [], unde: '', telefon: '' }).sursa === 'telefon' && /sursa: 'telefon', fila: 'noua'/.test(S.ecran), J([meniuW, meniuT]));
  T('adresa o citește fereastra: `fila=lista` = „Cererile tale"', L.dinAdresa({ fila: 'lista' }).fila === 'lista' && L.dinAdresa({}).fila === 'noua' && L.dinAdresa({ fila: 'x' }).fila === 'noua');

  const meniu = faraComentarii(S.meniu), fisa = faraComentarii(S.fisa), bula = faraComentarii(S.bula);
  T('meniul: rândul „Anunță echipa RA Track", doar la client; foaia veche a plecat', /!u\?\.isSuper && item\('headset', TITLU_FEREASTRA, \(\) => loc\.route\(usaMeniu\(\)\)\)/.test(meniu) &&
    !/Suport clienți|setSupport|sendSupport|Api\.support|tel:\+40|mailto:contact|sheet-ov|suport=1/.test(meniu), meniu.slice(0, 200));
  T('meniul: „Cereri de la clienți" doar la fondator, după „Cereri demo" și înaintea lui „Mail", cu bulina cererilor noi', (() => {
    const fond = taie(meniu, '{u?.isSuper && (', 'Sistem</div>');
    const a = fond.indexOf("'Cereri demo'"), b = fond.indexOf('TITLU_CERERI'), c = fond.indexOf("'Mail'");
    return a > 0 && a < b && b < c && /bulina\(cereriEchipaNoi\)/.test(fond) && /Api\.cereriNumar\(\)/.test(meniu);
  })());
  T('fișa mașinii: ușa, doar la client, cu textul de pe web', /!me\.value\?\.isSuper && \(\s*<button type="button" class="d-echipa" onClick=\{\(\) => loc\.route\(usaFisa\(imei\)\)\}>/.test(fisa) && />Ceva nu merge la aparat\? <b>Anunță echipa RA Track<\/b>/.test(fisa) &&
    /<span>Ceva nu merge la aparat\? <b>Anunță echipa RA Track<\/b><\/span>/.test(S.html));
  T('caseta: la fondator butonul nu apare; cererea deschisă îl înlocuiește; nota devine `notaDupa`', /faraEchipa && b\.fel === 'echipa'/.test(bula) && /const faraEchipa = !!me\.value\?\.isSuper/.test(bula) && /Api\.cereriDeschise\(imeis\)/.test(bula) && /seOcupaPeButon\(des && des\.deschise, b\)/.test(bula) &&
    /class="chat-seocupa"/.test(bula) && /ocupate\.some\(Boolean\) && des && des\.notaDupa \? des\.notaDupa : p\.nota/.test(bula));
  T('rutele: fereastra pentru oricine, lista doar pentru noi', /<Route path="\/echipa" component=\{AnuntaEchipa\} \/>/.test(S.app) && /cereriClienti: doarSuper\(CereriClienti, 'Cereri de la clienți'\)/.test(S.app) && /<Route path="\/admin\/cereri" component=\{P\.cereriClienti\} \/>/.test(S.app));
  T('ruta veche rămâne pe server pentru telefoanele de dinainte, iar telefonul nu o mai cheamă', /app\.post\('\/api\/support'/.test(S.srv) && !/\/api\/support'/.test(S.endpoints));
  T('o singură cerere de trimitere pe telefon', (S.ecran.match(/Api\.trimiteCerere\(/g) || []).length === 1 && (S.endpoints.match(/\/api\/cereri-echipa', \{ method: 'POST'/g) || []).length === 1);
  // Caseta: regula „se ocupă", ca _echipaSeOcupa.
  const des = [{ imei: '35', problema: 'semnal', seOcupa: 'Echipa se ocupă' }];
  T('…cererea se potrivește pe mașină ȘI pe problemă', L.seOcupaPeButon(des, { fel: 'echipa', imei: '35', problema: 'semnal' }) === des[0] && !L.seOcupaPeButon(des, { fel: 'echipa', imei: '35', problema: 'consum' }) && !L.seOcupaPeButon(des, { fel: 'echipa', imei: '36', problema: 'semnal' }) && !L.seOcupaPeButon(des, { fel: 'harta', imei: '35', problema: 'semnal' }));
  T('…mașinile cerute, fără dubluri, doar butoanele de echipă cu mașină', J(L.imeisEchipa([{ fel: 'echipa', imei: '1' }, { fel: 'echipa', imei: 1 }, { fel: 'harta', imei: '2' }, { fel: 'echipa' }, { fel: 'echipa', imei: '3' }])) === J(['1', '3']));
}

async function parteaFerestrei() {
  sect('2. Fereastra clientului (pagina, rulată)');
  const texte = {};
  const trimis = { s: 200, j: R200 };
  let urm = trimis;
  const w = webFereastra((u, o) => (o.method === 'POST' ? urm : { s: 200, j: META }));
  // a) cu mașină, din caseta de consum
  const oCaseta = { imei: MASINI[0].imei, problema: 'consum', ce: 'Nivelul a stat la 22 L.', sursa: 'insight' };
  await w.ctx.echipaDeschide(oCaseta);
  texte.formCuMasina = w.dupaId('ce-b') + ' ' + strange(vizibil(w, 'ce-f', 'n'));
  const file = [];
  w.doc.getElementById('ce-tabs').children.forEach((c) => file.push(c.textContent));
  T('filele', J(file) === J(L.fileFereastra(META).map((x) => x.t)), J([file, L.fileFereastra(META)]));
  const ms = L.masinaDin(MASINI[0].imei, MASINI);
  T('mașina din fereastră', w.dupaId('ce-b').indexOf('Mașina ' + ms.nr + ' · ' + ms.nume) === 0, w.dupaId('ce-b').slice(0, 80));
  const dmC = L.dupaMasina(META, false);
  T('cu mașină: etichetele și ce se trimite', w.dupaId('ce-b').indexOf(dmC.mesaj + ' · ' + dmC.mesajSub) > 0 && w.dupaId('ce-b').indexOf(dmC.date) > 0 && dmC.arataCand, w.dupaId('ce-b'));
  T('subsolul: termenul + „la fiecare pas"', strange(vizibil(w, 'ce-f', 'n')) === L.notaFormular(META), strange(vizibil(w, 'ce-f', 'n')));
  await w.buton('Trimite echipei').onclick();
  const post = w.trimise.filter((x) => x.o && x.o.method === 'POST').pop();
  const corpW = JSON.parse(post.o.body);
  const corpT = L.corpCerere(oCaseta, { imei: oCaseta.imei, mesaj: '', cand: [], unde: '', telefon: '0722 345 678' });
  T('ce pleacă, cu mașină: la fel, câmp cu câmp', J(sortat(corpW)) === J(sortat(corpT)), J([corpW, corpT]));
  // b) confirmarea
  texte.trimisa = w.dupaId('ce-b');
  const pc = L.planTrimisa(META, R200);
  T('confirmarea: titlul, ce s-a întâmplat, pașii, unde o găsește', w.dupaId('ce-b') === strange([pc.titlu, pc.sub].concat(pc.pasi.reduce((t, x) => t.concat([x.eticheta, x.detaliu || '']), [])).concat([pc.nota])), JSON.stringify([w.dupaId('ce-b'), pc]));
  T('după 200 lista crește cu cererea', L.dupaTrimitere(200, R200).trimisa === true && /Cererile tale · 3/.test(w.doc.getElementById('ce-tabs').textContent));
  // c) 409 „se ocupă deja"
  urm = { s: 409, j: R409 };
  await w.ctx.echipaDeschide(oCaseta);
  await w.buton('Trimite echipei').onclick();
  texte.deja = w.dupaId('ce-b');
  const pd = L.planTrimisa(META, R409);
  T('409 cu `deja`: tot confirmarea, cu textul serverului', pd.deja && pd.titlu === R409.error && pd.sub === R409.seOcupa && w.dupaId('ce-b') === strange([pd.titlu, pd.sub].concat(pd.pasi.reduce((t, x) => t.concat([x.eticheta, x.detaliu || '']), [])).concat([pd.nota])) && L.dupaTrimitere(409, R409).trimisa === true, JSON.stringify([w.dupaId('ce-b'), pd]));
  // d) altă eroare
  urm = { s: 400, j: { error: 'Alege mașina.' } };
  await w.ctx.echipaDeschide(oCaseta);
  await w.buton('Trimite echipei').onclick();
  T('eroarea serverului rămâne în formular', w.dupaId('ce-b').indexOf('Alege mașina.') > 0 && L.dupaTrimitere(400, urm.j).eroare === 'Alege mașina.' && !L.dupaTrimitere(400, urm.j).trimisa);
  urm = { s: 500, j: {} };
  await w.buton('Trimite echipei').onclick();
  T('…fără text de la server, același text ca pe web', w.dupaId('ce-b').indexOf(L.EROARE_TRIMITERE) > 0 && L.dupaTrimitere(500, {}).eroare === L.EROARE_TRIMITERE && L.dupaTrimitere(undefined, {}).eroare === L.EROARE_TRIMITERE);
  // e) fără mașină
  await w.ctx.echipaDeschide({ sursa: 'suport' });
  texte.formFara = w.dupaId('ce-b') + ' ' + strange(vizibil(w, 'ce-f', 'n'));
  const sel = w.noduri.filter((n) => n.tagName === 'SELECT').pop();
  const opt = sel.children.map((c) => ({ v: c.value, t: c.textContent }));
  T('lista de mașini: prima „Fără mașină", apoi în aceeași ordine, cu același text', opt[0].t === L.OPTIUNE_FARA_MASINA && opt[0].v === '' && J(opt.slice(1)) === J(L.optiuniMasini(MASINI)), J([opt, L.optiuniMasini(MASINI)]));
  const dmF = L.dupaMasina(META, true);
  T('fără mașină: altă etichetă, fără „când", alt text despre ce se trimite', w.dupaId('ce-b').indexOf(dmF.mesaj) > 0 && w.dupaId('ce-b').indexOf('Când poate veni') < 0 && w.dupaId('ce-b').indexOf(dmF.date) > 0 && !dmF.arataCand && dmF.mesajSub === '', w.dupaId('ce-b'));
  urm = trimis;
  await w.buton('Trimite echipei').onclick();
  const postF = w.trimise.filter((x) => x.o && x.o.method === 'POST').pop();
  const corpF = JSON.parse(postF.o.body);
  T('ce pleacă, fără mașină: „alta", fără `cand` și `unde`, la fel ca pe web', J(sortat(corpF)) === J(sortat(L.corpCerere({ sursa: 'suport' }, { imei: '', mesaj: '', cand: ['dimineata'], unde: 'x', telefon: '0722 345 678' }))) && corpF.problema === 'alta' && corpF.imei === null, J(corpF));
  // f) „Cererile tale"
  await w.ctx.echipaDeschide({ fila: 'lista' });
  texte.lista = w.dupaId('ce-b') + ' ' + strange(vizibil(w, 'ce-f', 'n'));
  const pl = L.planLista(META);
  T('„Cererile tale": fiecare rând, ca pe web, cu nota administratorului', texte.lista === strange(pl.randuri.reduce((t, c) => t.concat([c.cap, c.eticheta, c.titlu, c.detaliu, c.deAltcineva]), []).concat([pl.nota])), JSON.stringify([texte.lista, pl]));
  T('…omul obișnuit nu vede nota; lista goală are textul paginii', !L.planLista(Object.assign({}, META, { admin: false })).nota && L.planLista({ cereri: [] }).gol === L.GOL_CERERILE_TALE && new RegExp(L.GOL_CERERILE_TALE).test(PB));
  // g) eroare și platformă
  const we = webFereastra(() => ({ s: 500, j: {} }));
  await we.ctx.echipaDeschide({});
  T('fereastra nu se poate deschide: textul paginii', we.dupaId('ce-b') === L.EROARE_FEREASTRA, we.dupaId('ce-b'));
  const wp = webFereastra(() => ({ s: 200, j: { platforma: true, cereri: [] } }));
  await wp.ctx.echipaDeschide({});
  T('fondatorul (`platforma`): textul și butonul paginii', wp.dupaId('ce-b') === L.TEXT_PLATFORMA && wp.dupaId('ce-f') === L.BUTON_PLATFORMA, wp.dupaId('ce-f'));
  T('titlul ferestrei', new RegExp("el\\('b', null, '" + L.TITLU_FEREASTRA + "'\\)").test(PB));
  return texte;
}
const sortat = (o) => Object.keys(o).sort().reduce((t, k) => { t[k] = o[k]; return t; }, {});
function vizibil(w, id, cls) {
  const n = w.doc.getElementById(id);
  const c = n.children.filter((x) => x.className === cls)[0];
  return c ? c.textContent : '';
}

// ─── „Cereri de la clienți": blocul paginii, rulat ───
function webCereri() {
  const box = { innerHTML: '' }, campuri = {}, cereri = [];
  const ctx = { console, String, Array, JSON, Number, encodeURIComponent, __toast: [], __confirm: [], __raspuns: () => ({ s: 200, j: {} }), __incarcat: 0 };
  ctx.window = ctx;
  ctx.$ = (id) => (id === 'admin-tab-cereri' ? box : (campuri[id] || null));
  ctx.raxToast = (m, t) => { ctx.__toast.push({ m, t }); };
  ctx.raConfirm = async (m, o) => { ctx.__confirm.push({ m, o }); return true; };
  ctx.fetch = async (u, o) => { cereri.push({ u, o: o || {} }); const r = ctx.__raspuns(u, o || {}); return { ok: r.s === 200, status: r.s, json: async () => r.j }; };
  vm.createContext(ctx);
  vm.runInContext(functie(S.html, 'function esc(s) {') + '\n' + functie(S.html, 'function _rDe(n) {') + '\n' + functie(S.html, 'function _raxDe(n) {') + '\n' + NB + '\nthis.__cer = _cer; this.__rand = _cereriRand; this.__des = _cereriDeseneaza;', ctx);
  return { ctx, box, campuri, cereri };
}
const CERERI_D = () => {
  const lista = [
    CE.pentruNoi(CERERE, ACUM),
    CE.pentruNoi(Object.assign({}, CERERE, { id: 144, problema: 'semnal', titlu: 'Nu transmite de 3 ore', ce: '', stare: 'preluata', preluata_de_nume: 'Alin Tilvar', preluata_la: ACUM - 600000, mesaj: '', cand: null }), ACUM, { ultima: ACUM - 1000 }),
    CE.pentruNoi(Object.assign({}, CERERE, { id: 145, stare: 'programata', programata_de_nume: 'Alin Tilvar', programare: { zi: '2026-10-23', interval: '9-12', intervalText: '9:00 – 12:00', partener_id: 9, partener_nume: 'Montaj Rapid', mesaj: 'Venim vineri.', in_calendar: true } }), ACUM),
    CE.pentruNoi(Object.assign({}, CERERE, { id: 146, stare: 'rezolvata', company_id: null, rezolvata_la: ACUM, rezolvata_de_nume: 'Alin Tilvar', raspuns: 'Am schimbat cartela.' }), ACUM),
    CE.pentruNoi(Object.assign({}, CERERE, { id: 147, imei: null, plate: null, masina: null, aparat: null, contact: { nume: 'Dan', telefon: '', email: 'dan@x.ro' }, problema: 'alta', titlu: 'O întrebare', ce: '', mesaj: 'Ce faceți?', cand: null, sursa: 'suport' }), ACUM),
  ];
  return { fel: 'deschise', cereri: lista, deschise: 3, noi: 1, primaDeschisa: 'azi, 09:42', azi: '2026-10-22', maine: '2026-10-23', intervale: CE.INTERVALE.map((x) => ({ k: x[0], t: x[1] })), parteneri: [{ id: 9, name: 'Montaj Rapid' }] };
};

async function parteaCererilor() {
  sect('3. „Cereri de la clienți" (pagina, rulată)');
  const w = webCereri();
  const d = CERERI_D();
  w.ctx.__cer.d = d; w.ctx.__cer.fel = 'deschise';
  w.ctx.__des();
  const cap = taie(w.box.innerHTML, '<div class="cer-head">', '<div class="dq-item');
  T('capul listei: filele, câte, prima deschisă', textHtml(cap) === strange(L.fileCereri(d).map((x) => x.t).concat([L.cateCereri(d)])), JSON.stringify([textHtml(cap), L.fileCereri(d), L.cateCereri(d)]));
  for (const n of [0, 1, 2, 5, 20, 21, 100, 101]) {
    const dx = { cereri: Array.from({ length: n }, () => ({})), deschise: n };
    const wn = webCereri();
    const rand = /(\d+[^<]*)<\/span><\/div>/.exec(capDe(wn, dx));
    T('„' + L.cateCereri(dx) + '" (' + n + ')', rand && unesc(rand[1]) === L.cateCereri(dx), rand && rand[1]);
  }
  T('lista goală: aceleași texte', /Nicio cerere deschisă\./.test(NB) && /'Nicio cerere\.'/.test(NB) && L.golCereri('deschise') === 'Nicio cerere deschisă.' && L.golCereri('toate') === 'Nicio cerere.');
  T('filele: fără cifră când n-are nimic deschis', L.fileCereri({ deschise: 0 })[0].t === 'Deschise' && L.fileCereri({ deschise: 4 })[0].t === 'Deschise · 4');
  // Butoanele, de la server.
  for (const c of d.cereri) {
    const rand = w.ctx.__rand(c), p = L.planCerere(c);
    const web = []; const re = /<button class="rax-btn( primary)?" onclick="raxCerere\('(\w+)',\d+\)"><i class="fas [^"]*"><\/i> ([^<]*)<\/button>/g; let m;
    const acts = rand.slice(rand.indexOf('cer-acts'));
    while ((m = re.exec(acts))) web.push({ k: m[2], t: m[3], prim: !!m[1] });
    T('cererea ' + c.id + ': butoanele, în aceeași ordine, același principal', J(web) === J(p.butoane.map((b) => ({ k: b.k, t: b.t, prim: b.prim }))), J([web, p.butoane]));
    T('…„Sună" și „Deschide firma", în aceleași cazuri', /<i class="fas fa-phone"><\/i> Sună/.test(acts) === !!p.suna && /Deschide firma/.test(acts) === (p.firma != null) && (!p.suna || new RegExp('href="' + p.suna.replace(/\+/g, '\\+') + '"').test(acts)), acts.slice(0, 300));
    T('…clasa ei de culoare', new RegExp('class="dq-item cer-item ' + p.tag.cls + '"').test(rand), p.tag.cls);
    const textW = textHtml(rand.slice(0, rand.indexOf('dq-acts') > 0 ? rand.lastIndexOf('<div class="dq-acts') : rand.length));
    const planText = strange([p.cap, p.vehicul ? '· ' + p.vehicul : '', p.tag.text, [p.cine, p.telefon, p.email, p.cand, p.sursa].filter(Boolean).join(' · '), p.titlu]
      .concat(p.msg.map((x) => x.l + ' ' + x.t)).concat([p.pareRezolvata]).concat(p.aparat.length ? [L.TEXT_APARAT].concat(p.aparat.map((a) => a.l + ' ' + a.v)) : [])
      .concat(p.programare ? [L.TEXT_PROGRAMATA + ' ' + p.programare + (p.programareMesaj ? ' ' + L.TEXT_MESAJ_TRIMIS + '„' + p.programareMesaj + '”' : '')] : []).concat(p.raspuns ? [L.TEXT_I_AM_SCRIS + ' „' + p.raspuns + '”'] : []));
    T('…toate textele, în aceeași ordine', textW === planText, JSON.stringify([textW, planText]));
  }
  T('„Pare rezolvată singură": Rezolvat devine principal', L.butoaneCerere({ butoane: ['preiau', 'rezolvat'], pareRezolvata: 'x' }).find((b) => b.prim).k === 'rezolvat' && L.butoaneCerere({ butoane: ['preiau', 'rezolvat'] }).find((b) => b.prim).k === 'preiau');
  T('„Sună" scoate ce nu e cifră, ca pe web', L.telHref('0722 345-678') === 'tel:0722345678' && L.telHref('+40 722') === 'tel:+40722');
  // Formularele.
  const c0 = d.cereri[0];
  await w.ctx.raxCerere('programez', c0.id);
  const fp = taie(w.box.innerHTML, '<div class="cer-form">', '</div></div></div>');
  const fT = L.formProgramare(d);
  T('„Programez": ziua propusă = mâine, de azi încolo, primul interval, fără instalator, în calendar', new RegExp('min="' + d.azi + '" value="' + d.maine + '"').test(fp) && fT.zi === d.maine && fT.interval === d.intervale[0].k && fT.partener === '' && fT.inCalendar === true && /checked>/.test(fp), fp.slice(0, 300));
  T('…textele formularului', [L.TEXT_FORM.programez, L.TEXT_FORM.faraInstalator, L.TEXT_FORM.instalator, L.TEXT_FORM.mesaj, L.TEXT_FORM.mesajGol, L.TEXT_FORM.inCalendar, L.TEXT_FORM.renunta, L.TEXT_FORM.programeaza].every((t) => fp.indexOf(esc(t)) >= 0), fp);
  await w.ctx.raxCerere('rezolvat', c0.id);
  const fr = taie(w.box.innerHTML, '<div class="cer-form">', '</div></div></div>');
  T('„Rezolvat": textele formularului', [L.TEXT_FORM.ceAmFacut, L.TEXT_FORM.raspunsGol, L.TEXT_FORM.renunta, L.TEXT_FORM.rezolva].every((t) => fr.indexOf(esc(t)) >= 0), fr);
  // Corpul cererilor.
  const id = c0.id;
  const pune = (k, v) => { w.campuri['cer-' + k + '-' + id] = v; };
  w.ctx.__raspuns = () => ({ s: 200, j: { fel: 'deschise', cereri: [] } });
  pune('zi', { value: '2026-10-25' }); pune('iv', { value: 'dim' }); pune('pt', { value: '9' }); pune('ms', { value: 'Venim.' }); pune('cal', { checked: false });
  w.cereri.length = 0;
  await w.ctx.raxCerere('programeaza', id);
  const pW = JSON.parse(w.cereri[0].o.body);
  T('„Programează": aceeași adresă, același corp', /\/api\/admin\/cereri-echipa\/142\/programeaza$/.test(w.cereri[0].u) && J(sortat(pW)) === J(sortat(L.corpProgramare({ zi: '2026-10-25', interval: 'dim', partener: '9', mesaj: 'Venim.', inCalendar: false }))), J([w.cereri[0].u, pW]));
  T('…mesajul de după', w.ctx.__toast.pop().m === L.TEXT_DUPA.programeaza);
  pune('pt', { value: '' }); pune('cal', { checked: true }); w.cereri.length = 0;
  await w.ctx.raxCerere('programeaza', id);
  T('…fără instalator: `partener_id` null', J(sortat(JSON.parse(w.cereri[0].o.body))) === J(sortat(L.corpProgramare({ zi: '2026-10-25', interval: 'dim', partener: '', mesaj: 'Venim.', inCalendar: true }))));
  pune('rs', { value: 'Am schimbat cartela.' }); w.cereri.length = 0;
  await w.ctx.raxCerere('rezolva', id);
  T('„Rezolvată": aceeași adresă, același corp, același mesaj', /\/142\/rezolvat$/.test(w.cereri[0].u) && J(JSON.parse(w.cereri[0].o.body)) === J(L.corpRezolvat('Am schimbat cartela.')) && w.ctx.__toast.pop().m === L.TEXT_DUPA.rezolva);
  w.cereri.length = 0;
  await w.ctx.raxCerere('preiau', id);
  T('„Preiau": aceeași adresă, același mesaj', /\/142\/preiau$/.test(w.cereri[0].u) && w.ctx.__toast.pop().m === L.TEXT_DUPA.preiau);
  w.cereri.length = 0;
  await w.ctx.raxCerere('redeschide', id);
  T('„Redeschide": aceeași întrebare, același buton, același mesaj', w.ctx.__confirm[0].m === L.intrebareRedeschide(id) && w.ctx.__confirm[0].o.okLabel === 'Redeschide' && /\/142\/redeschide$/.test(w.cereri[0].u) && w.ctx.__toast.pop().m === L.TEXT_DUPA.redeschide, J(w.ctx.__confirm));
  // A doua apăsare: 409 = refuzul serverului, se închide formularul, lista se reîncarcă. Pe telefon la fel.
  w.ctx.__raspuns = (u) => (/preiau$/.test(u) ? { s: 409, j: { error: 'Cererea a fost deja preluată (Alin).' } } : { s: 200, j: { fel: 'deschise', cereri: [] } });
  w.cereri.length = 0;
  await w.ctx.raxCerere('preiau', id);
  T('a doua apăsare (409): refuzul serverului și lista reîncărcată', w.ctx.__toast.pop().m === 'Cererea a fost deja preluată (Alin).' && w.cereri.length === 2);
  const lista = faraComentarii(S.lista);
  T('…pe telefon la fel', /showToast\(\(e && e\.message\) \|\| NU_S_A_PUTUT, true\)/.test(lista) && /if \(e && e\.status === 409\) \{ inchideForm\(id\); await incarca\(\); \}/.test(lista));
  T('același text la o eroare fără cuvinte', new RegExp("j\\.error \\|\\| '" + L.NU_S_A_PUTUT + "'").test(NB));
  T('textele scrise în pagină: „Datele aparatului", „Programată:", „Mesajul trimis", „Ce i-am scris:", „Sună", „Deschide firma"', [L.TEXT_APARAT, L.TEXT_PROGRAMATA, L.TEXT_MESAJ_TRIMIS, L.TEXT_I_AM_SCRIS].every((t) => NB.indexOf(t) >= 0) && /> Sună</.test(NB) && /> Deschide firma</.test(NB) && /> Sună</.test(lista) && /> Deschide firma</.test(lista));
  T('din calendar: cererea, la vedere', /document\.getElementById\('cer-' \+ id\)/.test(lista) && /el\.scrollIntoView\(\{ block: 'center' \}\)/.test(lista) && /cer-arat/.test(S.css));
  T('„Deschide firma" = fișa firmei, ca pe web', /loc\.route\(adresaFirmei\(id\)\)/.test(lista));
  T('fără HTML de la server', !/dangerouslySetInnerHTML/.test(S.lista + S.ecran));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function capDe(w, d) {
  w.ctx.__cer.d = d; w.ctx.__cer.fel = 'toate';
  w.ctx.__des();
  return taie(w.box.innerHTML + '<END', '<div class="cer-head">', '<END').slice(0, 2000).replace(/<div class="(dq-item|rax-co-meta)[\s\S]*$/, '');
}

function parteaAnunturilor() {
  sect('4. Anunțurile');
  const P = modul(F.push, {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }, '../api/endpoints': { Api: {} }, '../app/store': { showToast: () => {} },
    './factura': { rutaFactura: () => '/billing' }, './contracte': { RUTA_NEASIGNATE: '/admin/devices?filtru=neasignate' }, './calendarMontaj': { rutaCalendarMontaj: () => '/admin/montaj' },
    './incarcare': { rutaPlanSofer: () => '/p', rutaPlanSimulator: () => '/s', RUTA_PLANURI: '/pl' },
  });
  // Felurile, de la server: `cerere_` + pasul pe care îl anunță la client (preluată / programată / rezolvată), `cerere_echipa` la noi.
  const pasi = ['preluata', 'programata', 'rezolvata'];
  T('pașii anunțați clientului sunt exact cei trei de pe telefon', pasi.every((x) => !!CE.anuntClient(Object.assign({}, CERERE, { programare: { zi: '2026-10-23', intervalText: 'x' } }), x)) && !CE.anuntClient(CERERE, 'redeschisa'), pasi.map((x) => !!CE.anuntClient(CERERE, x)).join());
  T('`cerere_echipa` (la noi) → „Cereri de la clienți", aceeași adresă ca din meniu', P.adresaAnunt('cerere_echipa', { cerere: true, cerereId: 5, pentru: 'noi' }) === L.RUTA_CERERI_CLIENTI && /'cerere_echipa'/.test(S.srv));
  for (const x of pasi) T('`cerere_' + x + '` (la client) → „Cererile tale"', P.adresaAnunt('cerere_' + x, { cerere: true, cerereId: 5, pentru: 'client' }) === L.RUTA_CERERILE_TALE && P.TIPURI_CU_LOC.indexOf('cerere_' + x) >= 0);
  T('…fereastra citește adresa ca fila „Cererile tale"', L.dinAdresa(citita(L.RUTA_CERERILE_TALE).query).fila === 'lista');
  T('push-ul lor (cu `notifId`) trece prin detaliu, care marchează citit și duce la adresa lui', P.adresaPush({ type: 'cerere_echipa', notifId: 7 }) === '/notif/7' && P.adresaPush({ type: 'cerere_preluata', notifId: 8 }) === '/notif/8');
  T('…serverul trimite `notifId` pe ambele drumuri', /async function _anuntaSuperadmini[\s\S]{0,500}notifId: n\.id/.test(S.srv) && /async function _incAnunta[\s\S]{0,500}notifId: n\.id/.test(S.srv));
  T('o singură scriere a acestor adrese în push.ts, fără un import nou (push.ts se încarcă în alte probe)', (S.push.match(/'\/admin\/cereri'/g) || []).length === 1 && (S.push.match(/'\/echipa\?fila=lista'/g) || []).length === 1 && !/cereriEchipa'/.test(S.push));
}

function parteaCalendarului() {
  sect('5. Intervențiile din calendar (pagina, rulată)');
  const CAL = modul(F.calLib, { '../api/client': { api: async () => ({}) }, './contracte': { MONTAJ_TIPURI: [], zi: () => '' }, './numar': LN });
  const CLOC = { luna: '2026-10', azi: '2026-10-22', lucrari: [{ id: 1, company_id: 5, company_name: 'Alfa', zi: '2026-10-23', status: 'programat', masini: 3, partener_id: 9, partener_nume: 'Montaj Rapid', conf: 'de_confirmat', items: [] }],
    deProgramat: [], parteneri: [{ id: 9, name: 'Montaj Rapid', active: true }, { id: 8, name: 'Alt instalator', active: true }], stoc: [], stari: { programat: 'programat', executat: 'montat' },
    interventii: [
      { id: 'c7', cerere_id: 7, interventie: true, zi: '2026-10-23', partener_id: 9, partener_nume: 'Montaj Rapid', company_id: 5, company_name: 'Alfa SRL', status: 'programat', masini: 1, vehicul: 'B 154 UIP', titlu: 'Nu transmite', interval: '09:00–12:00', text: 'Intervenție · cererea nr. 7 · B 154 UIP · Nu transmite' },
      { id: 'c8', cerere_id: 8, interventie: true, zi: '2026-10-24', partener_id: null, partener_nume: null, company_id: 6, company_name: 'Beta SRL', status: 'executat', masini: 1, vehicul: '', titlu: 'O problemă', interval: '', text: 'Intervenție · cererea nr. 8 · O problemă' },
    ] };
  const bloc = taie(S.html, '// ── începe „calendarul de montaj"', '// ── sfârșit „calendarul de montaj"');
  const cer = { fel: '', spre: null, form: null };
  const fac = (cal) => {
    const ctx = { console, String, Array, JSON, Date, Math, parseInt, Number, Object, _raxMj: { fila: 'calendar', contracte: [], faraContract: [], lucrari: [], stari: {}, trimite: false, editC: null, fStare: '', fPart: '', cal: Object.assign({ luna: '2026-10', data: CLOC, part: '', form: null, sel: null, pre: null }, cal) }, _raxPart: { lista: [], edit: null }, _cer: cer, companiesCache: [], goSistem: () => {}, raxToast: () => {}, raConfirm: async () => true };
    ctx.window = ctx; ctx.document = { getElementById: () => null, querySelectorAll: () => [] };
    vm.createContext(ctx);
    vm.runInContext([functie(S.html, 'function esc(s) {'), functie(S.html, 'function _rDe(n) {'), functie(S.html, 'function _raxDe(n) {'), functie(S.html, 'function _zi(v) {'), (/var MONTAJ_TIPURI = \[[\s\S]*?\];/.exec(S.html) || [''])[0], (/var CTR_STARI = \{[\s\S]*?\};/.exec(S.html) || [''])[0], bloc, 'this.__cal = _mjcCalendarHtml; this.__zi = _mjcZiHtml;'].join('\n'), ctx);
    return ctx;
  };
  for (const part of ['', '9', '8']) {
    const x = fac({ part });
    const h = x.__cal();
    const web = []; const re = /<button type="button" class="mjc-l mjc-int( gata)?" title="([^"]*)" onclick="event\.stopPropagation\(\);raxMjCalInterventie\((\d+),(true|false)\)"/g; let m;
    while ((m = re.exec(h))) web.push({ id: +m[3], gata: m[4] === 'true', cls: !!m[1], titlu: unesc(m[2]) });
    const pe = CAL.interventiiPeZi(CLOC.interventii, part);
    const tel = Object.keys(pe).sort().reduce((t, z) => t.concat(pe[z].map((i) => ({ id: i.cerere_id, gata: CAL.interventieGata(i), cls: CAL.interventieGata(i), titlu: CAL.titluInterventie(i) }))), []);
    T('grila, instalator „' + (part || 'toți') + '": aceleași intervenții, aceleași titluri', J(web) === J(tel), J([web, tel]));
    T('…legenda', /<span class="mjc-l mjc-int"><i class="fas fa-headset" aria-hidden="true"><\/i> intervenție<\/span>/.test(h));
  }
  T('pe telefon: în grilă, în legendă, în lista lunii, în foaia zilei', /interventiiPeZi\(d\.interventii, part\)/.test(S.calTsx) && /<span class="mjc-l mjc-int"><Icon name="headset" size=\{12\} \/> intervenție<\/span>/.test(S.calTsx) && /'mjc-l mjc-int' \+ \(iz\.every\(interventieGata\)/.test(S.calTsx) && /Intervenții în ziua asta/.test(S.calTsx) && /Intervenții în ziua asta/.test(bloc));
  for (const zi of ['2026-10-23', '2026-10-24']) {
    const x = fac({ form: { zi } });
    const h = x.__zi();
    const web = []; const re = /raxMjCalInterventie\((\d+),(true|false)\)"><span class="mjc-l mjc-int">[\s\S]*?<b>([^<]*)<\/b><span class="mjc-zi-rand-s">([^<]*)<\/span>/g; let m;
    while ((m = re.exec(h))) web.push({ id: +m[1], firma: unesc(m[3]), sub: unesc(m[4]) });
    const tel = CLOC.interventii.filter((i) => i.zi === zi).map((i) => ({ id: i.cerere_id, firma: i.company_name || '—', sub: CAL.subInterventie(i) }));
    T('fereastra zilei ' + zi + ': același rând', J(web) === J(tel), J([web, tel]));
  }
  // Clicul: cererea ei (rezolvată = în „Toate").
  const x = fac({});
  for (const i of CLOC.interventii) {
    vm.runInContext(functie(bloc, 'window.raxMjCalInterventie = function (id, gata) {') + ';', x);
    x.raxMjCalInterventie(i.cerere_id, i.status === 'executat');
    const t = L.cerereDinAdresa(citita(L.rutaCerere(i.cerere_id, CAL.interventieGata(i))).query);
    T('clicul pe cererea ' + i.cerere_id + ': aceeași filă, aceeași cerere', cer.fel === t.fel && cer.spre === t.spre, J([cer, t]));
  }
  T('Montaj trece adresa; din foaie înlocuiește intrarea ei din istoric', /onInterventie=\{\(x, dinFoaie\) => loc\.route\(rutaCerere\(x\.cerere_id, interventieGata\(x\)\), dinFoaie\)\}/.test(S.montaj) && /onInterventie\(x, true\)/.test(S.calTsx) && /onInterventie\(x, false\)/.test(S.calTsx));
  T('o intervenție nu e lucrare: nu intră în „De programat", nici în istoric, nici în foaia lucrării', !/interventii/.test(functie(S.calLib, 'export function deProgramatActive(') + functie(S.calLib, 'export function istoricFiltrat(')) && /\(pe\[zi\] \|\| \[\]\)\.map\(\(l\) => <RandLucrare/.test(S.calTsx));
}

function parteaAlertelor() {
  sect('6. Ecranul Alerte');
  const src = S.alerte;
  const sunaWeb = (a) => { const out = []; const h = (typeof a.suna_peste === 'number' ? '<span class="alr-suna">sună peste ' + a.suna_peste + ' km/h</span>' : '') + (a.cum_suna ? '<span class="alr-suna">' + esc(a.cum_suna) + '</span>' : ''); const re = /<span class="alr-suna">([^<]*)<\/span>/g; let m; while ((m = re.exec(h))) out.push(unesc(m[1])); return out; };
  T('pagina scrie la fel rândul regulii', S.html.indexOf("(typeof a.suna_peste === 'number' ? '<span class=\"alr-suna\">sună peste ' + a.suna_peste + ' km/h</span>' : '')") > 0 && S.html.indexOf("(a.cum_suna ? '<span class=\"alr-suna\">' + esc(a.cum_suna) + '</span>' : '')") > 0);
  const ctx = vm.createContext({});
  vm.runInContext(tsJs(functie(src, 'function sunaText(a: any): string[] {') + '\n' + functie(src, 'function notaStare(cs: any, tip: string): string {') + '\nthis.sunaText = sunaText; this.notaStare = notaStare;', 'x.ts'), ctx);
  for (const a of [{ suna_peste: 140 }, { suna_peste: 0 }, { cum_suna: 'sună la apariție, apoi o dată pe zi' }, { suna_peste: 60, cum_suna: 'x' }, {}, { suna_peste: '140' }]) {
    T('rândul regulii ' + J(a), J(Array.from(ctx.sunaText(a))) === J(sunaWeb(a)), J([ctx.sunaText(a), sunaWeb(a)]));
  }
  T('rândul stă sub numele regulii', /\{sunaText\(a\)\.map\(\(t\) => <div class="alr-suna">\{t\}<\/div>\)\}/.test(src));
  // Fraza de stare: doar la tipurile din `deStare`, ca pe web.
  const CS = { deStare: ['dtc_error', 'engine_temp'], text: 'Sună la apariție.' };
  T('fraza de stare: doar la tipurile din `deStare`', ctx.notaStare(CS, 'dtc_error') === CS.text && ctx.notaStare(CS, 'overspeed') === '' && ctx.notaStare(null, 'dtc_error') === '' && ctx.notaStare({ deStare: 'x' }, 'x') === '');
  T('pagina: aceeași condiție', S.html.indexOf('cs && Array.isArray(cs.deStare) && cs.deStare.indexOf(type) >= 0') > 0);
  T('o eroare nu rămâne ținută minte (ca _alertCumSunaIa)', /if \(!j\) _cumSuna = null;/.test(src) && /if \(!j\) _alertCumSuna = null;/.test(S.html));
  T('fraza de sub prag: de la server, la 200 ms după ultima cifră, iar ce vine târziu nu se mai pune', /Api\.alerteViteza\(vitezaScrisa\)/.test(src) && /\}, 200\);/.test(src) && /viu = false; clearTimeout\(t\)/.test(src) && /\[areNota, vitezaScrisa\]/.test(src) && /'\/api\/alerts\/viteza\?prag=' \+ encodeURIComponent/.test(S.html));
  T('ca pe web, sub câmpul de viteză; cifra de 60 km/h nu mai e scrisă pe telefon', /\{ k: 'maxSpeed', label: 'Viteză max \(km\/h\)', def: 90, nota: true \}/.test(src) && /k:'maxSpeed',label:'Viteză max \(km\/h\)',def:90,nota:true/.test(S.html) && !/peste 60 km\/h/.test(src) && /f\.nota && notaViteza \? <div class="alr-cf-nota">/.test(src));
}

// ─── Pe server pornit ───
const PORT = 3535, TCP = 5535;
const BASE = 'http://127.0.0.1:' + PORT;
const DIR = path.join(os.tmpdir(), 'rax_tel_echipa_' + process.pid);
let srv = null, srvIesit = null, jurnal = '';
function pornesteServerul() {
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_tel_echipa', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300',
  });
  ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  srv.stderr.on('data', (x) => { jurnal = (jurnal + x).slice(-3000); });
  srv.on('error', (e) => { if (srvIesit === null) srvIesit = 'nu a pornit: ' + e.message; });
  srv.on('exit', (c, s) => { srvIesit = c != null ? c : (s || 'oprit'); });
}
// Clientul nu primește niciodată datele aparatului: nicio cheie de felul ăsta, oricât de adânc.
function cheiAparat(x, out) {
  out = out || [];
  if (Array.isArray(x)) x.forEach((y) => cheiAparat(y, out));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => { if (/^(aparat|dateAparat|date_aparat|cartela|sim|sim_number|pareRezolvata|pare_rezolvata_la)$/.test(k)) out.push(k); cheiAparat(x[k], out); });
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
  const co = (await R('POST', '/api/companies', { name: 'Transport Ionescu SRL' })).j;
  const om = async (username, nume, role, companyId) => {
    const r = await R('POST', '/api/users', { username, full_name: nume, role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, BASE);
    return r.j;
  };
  await om('ana@ionescu.ro', 'Ana Pop', 'company_admin', co.id);
  await om('dan@ionescu.ro', 'Dan Dispecer', 'dispatcher', co.id);
  const IM = ['350000000095001', '350000000095002'];
  await R('POST', '/api/devices/import', { rows: [{ imei: IM[0], nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP', model_gps: 'FMC130' }, { imei: IM[1], nume: 'VW Caddy', nr_inmatriculare: 'B 268 ROY', model_gps: 'FMC130' }] });
  for (const [imei, name, plate] of [[IM[0], 'Dacia Logan 3', 'B 154 UIP'], [IM[1], 'VW Caddy', 'B 268 ROY']]) {
    await R('PUT', '/api/devices/' + imei + '/company', { company_id: co.id });
    await R('PUT', '/api/devices/' + imei + '/details', { name, plate, vehicle_type: 'Auto' });
    await R('POST', '/api/test/simulate', { imei, ts: new Date(Date.now() - 60000).toISOString(), io: { external_voltage: 13900 } });
  }
  const dan0 = await fetch(BASE + '/api/users', { headers: { Cookie: ck } }).then((x) => x.json());
  const danU = (Array.isArray(dan0) ? dan0 : []).find((u) => u.username === 'dan@ionescu.ro');
  if (danU) await R('PUT', '/api/users/' + danU.id + '/access', { devices: IM, groups: [] });
  const pt = (await R('POST', '/api/montaj/parteneri', { name: 'Montaj Rapid' })).j;

  const hook = {};
  const client = modul(F.client, { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } }, { fetch: (...a) => hook.fetch(...a) });
  hook.fetch = (url, op) => fetch(BASE + url, op);
  const Api = modul(F.endpoints, { './client': client }).Api;
  const tel = async (u, parola) => { const r = await Api.mobileLogin(u, parola || PAROLA, 'proba'); client.setAuthToken(r.token); return r; };
  const eroare = async (f) => { try { await f(); return null; } catch (e) { return e; } };

  // ── Clientul ──
  const lgA = await tel('ana@ionescu.ro');
  T('administratorul firmei intră', !!lgA.token);
  const m0 = await Api.cereriEchipa();
  T('fereastra: termenul, „când", ce se trimite, cum îl găsim, lista goală; nu `platforma`', !m0.platforma && m0.termen === CE.TERMEN && m0.cand.length === 5 && m0.dateTrimise === CE.DATE_TRIMISE && m0.contact.nume === 'Ana Pop' && m0.contact.email === 'ana@ionescu.ro' && L.planLista(m0).gol === L.GOL_CERERILE_TALE && L.fileFereastra(m0)[1].t === 'Cererile tale · 0', J(m0).slice(0, 500));
  // Din caseta de consum: ușa, adresa citită înapoi, corpul — apoi serverul.
  const oC = L.dinAdresa(citita(L.usaCaseta({ problema: 'consum', imei: IM[0] }, { dovada: 'Nivelul a stat la 22 L.' })).query);
  const r1 = await Api.trimiteCerere(L.corpCerere(oC, { imei: oC.imei, mesaj: 'A fost la service.', cand: ['dimineata'], unde: 'Strada Fabricii 12', telefon: '0722 345 678' }));
  const id1 = r1.cerere && r1.cerere.id;
  const pc = L.planTrimisa(m0, r1);
  T('clientul trimite: „Am trimis cererea nr. N.", pașii, „se ocupă", unde o găsește', !!id1 && L.dupaTrimitere(200, r1).trimisa && pc.titlu === 'Am trimis cererea nr. ' + id1 + '.' && pc.pasi.length >= 3 && pc.pasi[0].gata && !pc.pasi[1].gata && !!pc.nota && /^Echipa RA Track se ocupă · cererea nr\./.test(r1.seOcupa), J(r1).slice(0, 500));
  T('…clientul NU primește datele aparatului', !cheiAparat(r1).length, J(cheiAparat(r1)));
  // A doua cerere pe aceeași mașină și problemă: 409, tot confirmare.
  await tel('dan@ionescu.ro');
  const e2 = await eroare(() => Api.trimiteCerere(L.corpCerere(oC, { imei: oC.imei, mesaj: '', cand: [], unde: '', telefon: '' })));
  T('a doua cerere pe aceeași mașină: 409, textul serverului, tot confirmarea', e2 && e2.status === 409 && e2.data && e2.data.deja === true && e2.message === 'Echipa RA Track se ocupă deja de asta: cererea nr. ' + id1 + '.' && L.dupaTrimitere(e2.status, e2.data).trimisa === true && L.planTrimisa(m0, e2.data).titlu === e2.message && L.planTrimisa(m0, e2.data).deja, J(e2 && e2.data).slice(0, 400));
  T('…și atunci fără datele aparatului', !cheiAparat(e2 && e2.data).length);
  // Caseta: butonul pleacă.
  const des = await Api.cereriDeschise(IM.join(','));
  const bC = { fel: 'echipa', text: 'x', problema: 'consum', imei: IM[0] };
  const ocu = L.seOcupaPeButon(des.deschise, bC);
  T('caseta: „Echipa RA Track se ocupă · …" pe butonul mașinii, și nota de după', ocu && /^Echipa RA Track se ocupă · cererea nr\./.test(ocu.seOcupa) && !!des.notaDupa && !L.seOcupaPeButon(des.deschise, Object.assign({}, bC, { imei: IM[1] })) && !L.seOcupaPeButon(des.deschise, Object.assign({}, bC, { problema: 'semnal' })), J(des).slice(0, 300));
  T('…fără datele aparatului', !cheiAparat(des).length);
  // Fără mașină; fără text → refuzul serverului.
  const e3 = await eroare(() => Api.trimiteCerere(L.corpCerere({ sursa: 'suport' }, { imei: '', mesaj: '  ', cand: [], unde: '', telefon: '' })));
  T('fără mașină și fără text: refuzul serverului rămâne în formular', e3 && e3.status === 400 && L.dupaTrimitere(e3.status, e3.data).eroare === CE.lipsa({ problema: 'alta', mesaj: '' }), J(e3 && e3.data));
  const r3 = await Api.trimiteCerere(L.corpCerere(L.dinAdresa(citita(L.usaMeniu()).query), { imei: '', mesaj: 'O întrebare pentru voi.', cand: [], unde: '', telefon: '' }));
  T('fără mașină: cerere „alta"', !!(r3.cerere && r3.cerere.id) && !cheiAparat(r3).length, J(r3).slice(0, 300));
  const r4 = await Api.trimiteCerere(L.corpCerere(L.dinAdresa(citita(L.usaFisa(IM[1])).query), { imei: IM[1], mesaj: 'Nu o văd.', cand: [], unde: '', telefon: '' }));
  T('din fișa mașinii: cerere pe mașina ei', !!(r4.cerere && r4.cerere.id));
  const e5 = await eroare(() => Api.cereriClienti('deschise'));
  T('clientul nu ajunge la lista noastră', e5 && e5.status === 403, e5 && e5.status);
  const e5b = await eroare(() => Api.cererePreiau(id1));
  T('…și nu poate prelua', e5b && e5b.status === 403);
  await tel('ana@ionescu.ro');
  const m1 = await Api.cereriEchipa();
  T('„Cererile tale": administratorul le vede pe toate, cu nota lui, fără datele aparatului', L.planLista(m1).randuri.length === 3 && !!L.planLista(m1).nota && !cheiAparat(m1.cereri).length && !cheiAparat(m1.contact).length && L.fileFereastra(m1)[1].t === 'Cererile tale · 3', J(L.planLista(m1)).slice(0, 400));
  await tel('dan@ionescu.ro');
  const mDan = await Api.cereriEchipa();
  T('…omul obișnuit le vede doar pe ale lui, fără notă', mDan.cereri.length === 2 && !L.planLista(mDan).nota && !cheiAparat(mDan.cereri).length && L.planLista(mDan).randuri.every((c) => !c.deAltcineva), J(mDan.cereri).slice(0, 300));

  // ── Fondatorul ──
  await tel('admin', 'test1234');
  const mS = await Api.cereriEchipa();
  T('fondatorul: fereastra spune `platforma`', mS.platforma === true, J(mS).slice(0, 200));
  const e6 = await eroare(() => Api.trimiteCerere(L.corpCerere({ sursa: 'suport' }, { imei: '', mesaj: 'x', cand: [], unde: '', telefon: '' })));
  T('fondatorul nu poate trimite', e6 && e6.status === 400 && /Cererile le trimit clienții/.test(e6.message), e6 && e6.message);
  const n0 = await Api.cereriNumar();
  T('bulina: cererile nepreluate', n0.noi === 3 && n0.deschise === 3, J(n0));
  const d1 = await Api.cereriClienti('deschise');
  T('lista: Deschise · 3, ziua de azi și de mâine, intervalele, instalatorii, bulina', L.fileCereri(d1)[0].t === 'Deschise · 3' && L.cateCereri(d1).indexOf('3 cereri') === 0 && !!d1.azi && !!d1.maine && d1.intervale.length > 0 && d1.parteneri.some((p) => p.id === pt.id) && d1.noi === 3, J(d1).slice(0, 300));
  const c1 = d1.cereri.find((c) => c.id === id1);
  const p1 = L.planCerere(c1);
  T('datele aparatului sunt doar la noi', p1.aparat.length > 0 && p1.aparat.some((a) => a.v === IM[0] || /350000000095001/.test(a.v)), J(p1.aparat));
  T('cum îl găsim: numele, telefonul, emailul; butoanele de la server; „Deschide firma"', /Ana Pop/.test(p1.cine) && p1.telefon === '0722 345 678' && p1.email === 'ana@ionescu.ro' && p1.suna === 'tel:0722345678' && p1.firma === co.id && p1.butoane[0].k === 'preiau' && p1.butoane[0].prim, J(p1).slice(0, 500));
  const cMeniu = d1.cereri.find((c) => c.id === r3.cerere.id);
  T('cererea din meniu: la noi scrie „de pe telefon"', cMeniu && L.planCerere(cMeniu).sursa === 'de pe telefon', J(cMeniu).slice(0, 200));
  const pr = await Api.cererePreiau(id1);
  T('Preiau', !!pr.ok);
  const e7 = await eroare(() => Api.cererePreiau(id1));
  T('a doua apăsare: 409, cu textul serverului', e7 && e7.status === 409 && /^Cererea a fost deja preluată/.test(e7.message), e7 && e7.message);
  const n1 = await Api.cereriNumar();
  T('bulina scade', n1.noi === 2 && n1.deschise === 3, J(n1));
  const d2 = await Api.cereriClienti('deschise');
  const f0 = L.formProgramare(d2);
  const fp = Object.assign({}, f0, { partener: String(pt.id) });
  const pg = await Api.cereriProgrameaza(id1, L.corpProgramare(fp));
  T('Programez: ziua propusă, primul interval, instalatorul, în calendar', !!pg.ok, J(pg).slice(0, 200));
  const d3 = await Api.cereriClienti('deschise');
  const c3 = d3.cereri.find((c) => c.id === id1);
  T('…cererea scrie programarea și mesajul trimis clientului (scris de server)', !!L.planCerere(c3).programare && !!L.planCerere(c3).programareMesaj, J(c3).slice(0, 400));
  const luna = String(f0.zi).slice(0, 7);
  const cal = await client.api('/api/montaj/calendar?luna=' + luna);
  const CAL = modul(F.calLib, { '../api/client': { api: async () => ({}) }, './contracte': { MONTAJ_TIPURI: [], zi: () => '' }, './numar': LN });
  const inte = (cal.interventii || []).filter((x) => x.cerere_id === id1);
  T('calendarul: intervenția, pe ziua ei și pe instalatorul ei', inte.length === 1 && inte[0].zi === f0.zi && inte[0].partener_id === pt.id && CAL.interventiiPeZi(cal.interventii, String(pt.id))[f0.zi].length === 1 && !CAL.interventiiPeZi(cal.interventii, '99999')[f0.zi] && /^Intervenție · cererea nr\./.test(CAL.titluInterventie(inte[0])) && CAL.subInterventie(inte[0]).indexOf('Montaj Rapid') > 0, J(cal.interventii).slice(0, 400));
  T('…nu e lucrare de montaj', !(cal.lucrari || []).some((l) => l.interventie) && !(cal.programate || []).some((l) => l.interventie), J(cal.lucrari));
  T('…clicul duce la cererea ei, în „Deschise"', J(L.cerereDinAdresa(citita(L.rutaCerere(inte[0].cerere_id, CAL.interventieGata(inte[0]))).query)) === J({ fel: 'deschise', spre: id1 }));
  const e8 = await eroare(() => Api.cereriProgrameaza(id1, L.corpProgramare(Object.assign({}, fp, { zi: '2020-01-01' }))));
  T('o zi din trecut: refuzul serverului', e8 && e8.status === 400, e8 && e8.message);
  const e9 = await eroare(() => Api.cerereRezolvat(id1, L.corpRezolvat('')));
  T('Rezolvat fără text: refuzul serverului', e9 && e9.status === 400, e9 && e9.message);
  const rz = await Api.cerereRezolvat(id1, L.corpRezolvat('Am schimbat cartela SIM.'));
  T('Rezolvat', !!rz.ok);
  const dr = await Api.cereriClienti('rezolvate');
  const crz = dr.cereri.find((c) => c.id === id1);
  T('…apare la Rezolvate, cu ce i-am scris și „Redeschide"', crz && L.planCerere(crz).raspuns === 'Am schimbat cartela SIM.' && L.planCerere(crz).butoane.map((b) => b.k).indexOf('redeschide') >= 0, J(crz).slice(0, 300));
  const cal2 = await client.api('/api/montaj/calendar?luna=' + luna);
  const i2 = (cal2.interventii || []).find((x) => x.cerere_id === id1);
  T('…intervenția rezolvată: gri, iar clicul duce în „Toate"', i2 && CAL.interventieGata(i2) && L.cerereDinAdresa(citita(L.rutaCerere(i2.cerere_id, true)).query).fel === 'toate', J(i2));
  const P = modul(F.push, {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }, '../api/endpoints': { Api: {} }, '../app/store': { showToast: () => {} },
    './factura': { rutaFactura: () => '/billing' }, './contracte': { RUTA_NEASIGNATE: '/admin/devices?filtru=neasignate' }, './calendarMontaj': { rutaCalendarMontaj: () => '/admin/montaj' },
    './incarcare': { rutaPlanSofer: () => '/p', rutaPlanSimulator: () => '/s', RUTA_PLANURI: '/pl' },
  });
  const nS = await Api.notifications();
  const anS = (Array.isArray(nS) ? nS : []).filter((n) => n.type === 'cerere_echipa');
  T('fondatorul: anunțul `cerere_echipa`, fără date tehnice, duce la lista noastră', anS.length >= 1 && P.adresaAnunt(anS[0].type, anS[0].data) === L.RUTA_CERERI_CLIENTI && !cheiAparat(anS).length, J(anS[0] || null).slice(0, 300));
  await tel('ana@ionescu.ro');
  const nA = await Api.notifications();
  const felA = (Array.isArray(nA) ? nA : []).filter((n) => /^cerere_/.test(n.type));
  T('clientul: `cerere_preluata`, `_programata`, `_rezolvata`, toate spre „Cererile tale"', ['cerere_preluata', 'cerere_programata', 'cerere_rezolvata'].every((t) => felA.some((n) => n.type === t)) && felA.every((n) => P.adresaAnunt(n.type, n.data) === L.RUTA_CERERILE_TALE) && !cheiAparat(felA).length, J(felA.map((n) => n.type)));
  const m2 = await Api.cereriEchipa();
  const rz2 = L.planLista(m2).randuri.find((c) => c.id === id1);
  T('la client: cererea e rezolvată, cu pașii ei, fără datele aparatului', rz2 && rz2.stare === 'rezolvata' && !cheiAparat(m2.cereri).length, J(rz2));
  const des2 = await Api.cereriDeschise(IM[0]);
  T('caseta: fără cerere deschisă, butonul revine', !L.seOcupaPeButon(des2.deschise, bC), J(des2));
  await tel('admin', 'test1234');
  const rd = await Api.cerereRedeschide(id1);
  T('Redeschide', !!rd.ok);
  const e10 = await eroare(() => Api.cerereRedeschide(id1));
  T('…a doua apăsare: 409', e10 && e10.status === 409, e10 && e10.status);

  // ── Alerte ──
  await tel('ana@ionescu.ro');
  const al1 = await Api.createAlert({ name: 'Viteză 130', type: 'overspeed', imei: null, enabled: true, condition: { maxSpeed: 130 } });
  const al2 = await Api.createAlert({ name: 'Viteză 30', type: 'overspeed', imei: null, enabled: true, condition: { maxSpeed: 30 } });
  const al3 = await Api.createAlert({ name: 'Erori', type: 'dtc_error', imei: null, enabled: true, condition: {} });
  const al4 = await Api.createAlert({ name: 'Pornire', type: 'ignition_on', imei: null, enabled: true, condition: {} });
  void al1; void al2; void al3; void al4;
  const reg = await Api.alerts();
  const dupa = (n) => reg.find((a) => a.name === n);
  T('`suna_peste` pe regulile de viteză', dupa('Viteză 130').suna_peste === 140 && dupa('Viteză 30').suna_peste === 60, J(reg.map((a) => [a.name, a.suna_peste])));
  const ctx = vm.createContext({});
  vm.runInContext(tsJs(functie(S.alerte, 'function sunaText(a: any): string[] {') + '\n' + functie(S.alerte, 'function notaStare(cs: any, tip: string): string {') + '\nthis.sunaText = sunaText; this.notaStare = notaStare;', 'x.ts'), ctx);
  T('…pe rând: „sună peste 140 km/h"', J(Array.from(ctx.sunaText(dupa('Viteză 130')))) === J(['sună peste 140 km/h']));
  const cs = await Api.alerteCumSuna();
  T('`cum_suna` pe regula de stare; nimic pe „Pornire motor"', !!dupa('Erori').cum_suna && ctx.sunaText(dupa('Erori')).length === 1 && ctx.sunaText(dupa('Pornire')).length === 0, J(reg.map((a) => [a.name, a.cum_suna])));
  T('fraza de stare, doar la tipurile din `deStare`', !!cs.text && ctx.notaStare(cs, 'dtc_error') === cs.text && ctx.notaStare(cs, 'overspeed') === '' && ctx.notaStare(cs, 'ignition_on') === '', J(cs));
  const v1 = await Api.alerteViteza('130'), v2 = await Api.alerteViteza('30'), v3 = await Api.alerteViteza('');
  T('fraza de sub prag se schimbă după cifră: 130, 30, gol', /când trece de 140 km\/h/.test(v1.text) && /când trece de 60 km\/h/.test(v2.text) && /când trece de 60 km\/h/.test(v3.text) && v1.text !== v2.text, J([v1.text, v2.text, v3.text]));
  const e11 = await eroare(() => Api.alerteViteza('abc'));
  T('un prag scris greșit: 400, iar nota dispare (ca pe web)', e11 && e11.status === 400 && /catch\(\(\) => \{ if \(viu\) setNotaViteza\(''\); \}\)/.test(S.alerte), e11 && e11.status);
}

function parteaDesenului(texte) {
  sect('8. Ecranele, desenate în HTML (doar cu preact)');
  if (!PREACT) { sarite++; console.log('  ⤼ sărit: desenul ecranelor (' + (CA_IN_CI ? 'PROBA_CA_IN_CI=1' : 'mobile/node_modules nu e instalat') + ')'); return; }
  const { preact, hooks, jsxRt, rts } = PREACT;
  const h = preact.h, r = (x) => rts.renderToString(x);
  const rezolva = (rel, id) => {
    const baza = path.posix.join(path.posix.dirname(rel), id);
    for (const ext of ['.ts', '.tsx']) if (fs.existsSync(path.join(ROOT, baza + ext))) return baza + ext;
    return baza;
  };
  const me = { value: { role: 'company_admin', permissions: {}, features: {} } };
  const stubs = {
    preact, 'preact/hooks': hooks, 'preact/jsx-runtime': jsxRt,
    'preact-iso': { useLocation: () => ({ route() {}, query: {}, path: '/', url: '/' }), useRoute: () => ({ params: {}, query: {} }) },
    '../app/store': { me, showToast() {}, vehicles: { value: MASINI } }, '../api/endpoints': { Api: new Proxy({}, { get: () => () => new Promise(() => {}) }) },
    '../components/FlotaUi': { Confirma: () => null }, './FlotaUi': { Confirma: () => null }, '../lib/inapoiFoaie': { useInapoiInchide() {}, dupaInapoi(f) { f(); } }, '../lib/export': { exportHistoryReport() {} },
    '../components/FondatorUi': { adresaFirmei: (id) => '/admin/companies/' + id }, './InsightPropunere': { CartonasPropunere: () => null, ButonProp: () => null },
  };
  const mem = {};
  const inc = (rel) => {
    if (mem[rel]) return mem[rel].exports;
    const m = mem[rel] = { exports: {} };
    const ctx = vm.createContext({ module: m, exports: m.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams,
      require: (id) => {
        if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
        if (/\.css$/.test(id)) return {};
        if (id.charAt(0) === '.') return inc(rezolva(rel, id));
        throw new Error('require neașteptat în ' + rel + ': ' + id);
      } });
    vm.runInContext(tsJs(citeste(rel), rel), ctx, { filename: rel });
    return m.exports;
  };
  const E = inc(F.ecran), C = inc(F.lista);
  const FG = { masina: '', mesaj: '', cand: [], unde: '', tel: null };
  const oCaseta = { imei: MASINI[0].imei, problema: 'consum', ce: 'Nivelul a stat la 22 L.', sursa: 'insight', fila: 'noua' };
  const fCu = r(h(E.FormularCerere, { m: META, o: oCaseta, f: FG, lista: MASINI, err: '', pune() {} }));
  T('formularul cu mașină: aceleași texte, în aceeași ordine', textHtml(fCu) === texte.formCuMasina, JSON.stringify([textHtml(fCu), texte.formCuMasina]));
  const fFara = r(h(E.FormularCerere, { m: META, o: { imei: '', problema: '', ce: '', sursa: 'suport', fila: 'noua' }, f: FG, lista: MASINI, err: '', pune() {} }));
  T('formularul fără mașină: aceleași texte, în aceeași ordine', textHtml(fFara) === texte.formFara, JSON.stringify([textHtml(fFara), texte.formFara]));
  T('…telefonul din fișă e deja în casetă, cu lungimile de pe web', /maxLength="?2000|maxlength="?2000/i.test(fCu) && /value="0722 345 678"/.test(fCu) && /maxlength="?40/i.test(fCu) && /maxlength="?200/i.test(fCu));
  const fMasinaAleasa = r(h(E.FormularCerere, { m: META, o: { imei: '', problema: '', ce: '', sursa: 'suport', fila: 'noua' }, f: Object.assign({}, FG, { masina: MASINI[0].imei }), lista: MASINI, err: 'Eroare de la server', pune() {} }));
  T('o mașină aleasă din listă aprinde „Când poate veni" și arată eroarea', /Când poate veni cineva la mașină/.test(fMasinaAleasa) && /Eroare de la server/.test(fMasinaAleasa) && /Mesaj pentru echipă/.test(fMasinaAleasa));
  const tr = r(h(E.ConfirmareCerere, { m: META, j: R200 }));
  T('confirmarea: aceleași texte', textHtml(tr).replace(/\s/g, '') === texte.trimisa.replace(/\s/g, ''), JSON.stringify([textHtml(tr), texte.trimisa]));
  const de = r(h(E.ConfirmareCerere, { m: META, j: R409 }));
  T('confirmarea la 409: aceleași texte', textHtml(de).replace(/\s/g, '') === texte.deja.replace(/\s/g, ''), JSON.stringify([textHtml(de), texte.deja]));
  const li = r(h(E.ListaCererilor, { m: META }));
  T('„Cererile tale": aceleași texte', textHtml(li) === texte.lista, JSON.stringify([textHtml(li), texte.lista]));
  T('…fiecare stare cu clasa ei', /class="ce-st trimisa"/.test(li) && /class="ce-st rezolvata"/.test(li));
  // „Cereri de la clienți": rândul, lângă _cereriRand.
  const w = webCereri(), d = CERERI_D();
  w.ctx.__cer.d = d;
  const faraAct = (html) => textHtml(html);
  for (const c of d.cereri) {
    const noi = r(h(C.Cerere, { c, d, form: null, arat: false, busy: false, onApasa() {}, onFirma() {}, onSchimba() {}, onInchide() {}, onTrimite() {} }));
    T('cererea ' + c.id + ': aceleași texte, în aceeași ordine', faraAct(noi) === faraAct(w.ctx.__rand(c)), JSON.stringify([faraAct(noi), faraAct(w.ctx.__rand(c))]));
    T('…doar pentru noi: datele aparatului, când sunt', /Datele aparatului/.test(noi) === !!(c.aparat && c.aparat.length));
  }
  const c0 = d.cereri[0];
  w.ctx.__cer.form[c0.id] = 'programez';
  const prog = r(h(C.Cerere, { c: c0, d, form: { fel: 'programez', p: { zi: d.maine, interval: d.intervale[0].k, partener: '', mesaj: '', inCalendar: true }, r: '' }, arat: true, busy: false, onApasa() {}, onFirma() {}, onSchimba() {}, onInchide() {}, onTrimite() {} }));
  T('formularul „Programez": aceleași texte, în aceeași ordine', faraAct(prog) === faraAct(w.ctx.__rand(c0)), JSON.stringify([faraAct(prog), faraAct(w.ctx.__rand(c0))]));
  T('…același minim, aceeași propunere, același text gol, aceeași limită, bifat', new RegExp('min="' + d.azi + '"').test(prog) && new RegExp('value="' + d.maine + '"').test(prog) && prog.indexOf('placeholder="' + esc(L.TEXT_FORM.mesajGol) + '"') > 0 && /maxlength="?300/i.test(prog) && /checked/.test(prog) && /cer-arat/.test(prog));
  w.ctx.__cer.form[c0.id] = 'rezolvat';
  const rez = r(h(C.Cerere, { c: c0, d, form: { fel: 'rezolvat', p: { zi: '', interval: '', partener: '', mesaj: '', inCalendar: true }, r: '' }, arat: false, busy: false, onApasa() {}, onFirma() {}, onSchimba() {}, onInchide() {}, onTrimite() {} }));
  T('formularul „Rezolvat": aceleași texte, în aceeași ordine', faraAct(rez) === faraAct(w.ctx.__rand(c0)), JSON.stringify([faraAct(rez), faraAct(w.ctx.__rand(c0))]));
  T('…același text gol, aceeași limită', rez.indexOf('placeholder="' + esc(L.TEXT_FORM.raspunsGol) + '"') > 0 && /maxlength="?1000/i.test(rez));
  // Un text de la server nu se desenează ca HTML.
  const rau = '<img src=x onerror=alert(1)>';
  const cR = Object.assign({}, c0, { mesaj: rau, titlu: rau, cap: rau });
  T('un text de la server se pune ca text, nu ca HTML', r(h(C.Cerere, { c: cR, d, form: null, arat: false, busy: false, onApasa() {}, onFirma() {}, onSchimba() {}, onInchide() {}, onTrimite() {} })).indexOf('<img') < 0 && r(h(E.ListaCererilor, { m: { cereri: [{ id: 1, cap: rau, titlu: rau, detaliu: rau, eticheta: rau }] } })).indexOf('<img') < 0);
  // Caseta din RA Insight: la fondator nu apare butonul. Ramura `Probleme` se vede prin `BulaAi`.
  const B = inc(F.bula);
  const lat = { trimite() {}, buton() {}, ruta() {}, plus() {}, nota() {}, propunere() {}, editeaza() {} };
  const msg = { id: 3, text: 'x', extra: { source: 'ai', probleme: [{ grav: 'galben', titlu: 'Nu transmite', dovada: 'De 3 ore', nota: 'Aparatul e treaba noastră.', butoane: [{ fel: 'harta', text: 'Vezi pe hartă', imei: '35' }, { fel: 'echipa', text: 'Anunță echipa RA Track', problema: 'semnal', imei: '35' }] }] } };
  const laClient = r(h(B.BulaAi, { l: lat, m: msg }));
  T('caseta, la client: butonul, cu textul serverului, și nota', /Anunță echipa RA Track/.test(laClient) && /Vezi pe hartă/.test(laClient) && /Aparatul e treaba noastră\./.test(laClient));
  me.value = Object.assign({}, me.value, { isSuper: true });
  const laNoi = r(h(B.BulaAi, { l: lat, m: msg }));
  T('caseta, la fondator: fără „Anunță echipa"; restul rămâne', !/Anunță echipa RA Track/.test(laNoi) && /Vezi pe hartă/.test(laNoi) && /Aparatul e treaba noastră\./.test(laNoi));
  me.value = { role: 'company_admin', permissions: {}, features: {} };
}

function parteaCulorilor() {
  sect('9. Culorile, măsurate pe ambele teme');
  const hex = (c) => { const m = String(c).trim().match(/^#([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (c) => { const m = String(c).trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] } : null; };
  const peste = (sus, jos) => sus.c.map((x, i) => Math.round(x * sus.a + jos[i] * (1 - sus.a)));
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bloc = (css, sel) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const val = (b, k) => (b.match(new RegExp(k.replace(/-/g, '\\-') + ':\\s*([^;}]+)')) || [])[1];
  const tokInch = taie(S.tokens, ':root', '}'), tokDesc = S.tokens.slice(S.tokens.indexOf('[data-theme="light"]'));
  const insInch = bloc(S.icss, '.insp'), insDesc = bloc(S.icss, ':root[data-theme="light"] .insp');
  const teme = [['închisă', bloc(S.css, ':root'), tokInch, bloc(S.mcss, ':root'), insInch], ['deschisă', bloc(S.css, ':root[data-theme="light"]'), tokDesc, bloc(S.mcss, ':root[data-theme="light"]'), insDesc]];
  for (const [nume, ce, tok, mjc, ins] of teme) {
    const fnd = {}; ['--bg-panel', '--bg-card', '--bg-dark', '--bg-darkest'].forEach((k) => { fnd[k] = hex(val(tok, k)); });
    T('tema ' + nume + ': fundalurile citite', fnd['--bg-panel'] && fnd['--bg-card'] && fnd['--bg-dark'], J(fnd));
    // Textele colorate ale ferestrei și ale listei, pe fundalurile lor.
    for (const [k, fund] of [['--ce-rosu', '--bg-panel'], ['--ce-verde', '--bg-dark'], ['--ce-verde', '--bg-card'], ['--ce-trimisa', '--bg-card'], ['--ce-preluata', '--bg-card'], ['--ce-programata', '--bg-card'], ['--ce-rezolvata', '--bg-card'], ['--cer-prog-ic', '--bg-card']]) {
      const c = contrast(hex(val(ce, k)), fnd[fund]);
      T('tema ' + nume + ': ' + k + ' pe ' + fund + ' = ' + c.toFixed(2), c >= 4.5, val(ce, k));
    }
    // Filă de stare „bifată": bifa pe verde.
    const gata = contrast(hex(val(ce, '--ce-gata-text')), hex(val(ce, '--ce-verde')));
    T('tema ' + nume + ': bifa pașilor pe verde = ' + gata.toFixed(2), gata >= 4.5);
    // Chip-ul ales: verde pe fundalul lui verde deschis, peste panou.
    const chip = contrast(hex(val(ce, '--ce-verde')), peste(rgba(val(ce, '--ce-verde-fund')), fnd['--bg-dark']));
    T('tema ' + nume + ': chipul ales = ' + chip.toFixed(2), chip >= 4.5);
    // Textele obișnuite, pe fundalurile folosite aici.
    for (const fund of ['--bg-panel', '--bg-card', '--bg-dark']) {
      const c = contrast(hex(val(tok, '--text-secondary')), fnd[fund]);
      T('tema ' + nume + ': --text-secondary pe ' + fund + ' = ' + c.toFixed(2), c >= 4.5);
    }
    // Calendarul.
    for (const [t, f] of [['--mjc-int', '--mjc-int-bg'], ['--mjc-mont', '--mjc-mont-bg']]) {
      const fv = val(mjc, f), jos = fnd['--bg-card'];
      const fc = hex(fv) || peste(rgba(fv), jos);
      const c = contrast(hex(val(mjc, t)), fc);
      T('tema ' + nume + ': ' + t + ' pe fundalul lui = ' + c.toFixed(2), c >= 4.5, J([val(mjc, t), fv]));
    }
    // Caseta „se ocupă".
    const so = contrast(hex(val(ins, '--i-seocupa')), peste(rgba(val(ins, '--i-seocupa-fund')), fnd['--bg-panel']));
    T('tema ' + nume + ': „Echipa se ocupă" = ' + so.toFixed(2), so >= 4.5);
  }
  T('perechile sunt aceleași ca pe web (app.css)', (() => {
    const app = citeste('public/css/app.css');
    return /\.ce-st\.trimisa \{ color: #b45309; \}/.test(app) && /body\.dark \.ce-st\.trimisa \{ color: #fbbf24; \}/.test(app) && /\.mjc-l\.mjc-int \{ color: #1d4ed8; background: #e8f0fe; border-color: #93c5fd; \}/.test(app) && /\.mjc-l\.mjc-int \{ color: #93c5fd;/.test(app) && /body\.dark \.chat-seocupa \{ color: #4ade80;/.test(app);
  })());
  T('foaia nouă: fără nume de font (moștenește Nunito), fără monospace', !/font-family/.test(S.css) && !/monospace/.test(S.css));
  T('câmpurile de scris: 16 px, ca telefonul să nu mărească pagina', /\.ce-in \{[^}]*font-size: 16px/.test(S.css));
  T('jos stă deasupra zonei sigure și a tastaturii (ecranul n-are bară de file)', /\.ce-f \{[^}]*calc\(10px \+ max\(var\(--sab\), var\(--ce-kb, 0px\)\)\)/.test(S.css) && /\.cer-pag \{[^}]*calc\(28px \+ var\(--sab\)\)/.test(S.css));
  T('Alerte: rândul și nota, pe --text-secondary', /\.alr-suna \{[^}]*color: var\(--text-secondary\)/.test(S.fcss) && /\.alr-cf-nota \{[^}]*color: var\(--text-secondary\)/.test(S.fcss));
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
  pornesteServerul();   // se încălzește cât rulează bucățile fără server
  let texte = {};
  for (const [nume, f] of [['ușile', parteaUsilor], ['fereastra', async () => { texte = await parteaFerestrei(); }], ['cererile', parteaCererilor], ['anunțurile', parteaAnunturilor], ['calendarul', parteaCalendarului], ['alertele', parteaAlertelor], ['serverul', parteaServerului], ['desenul', () => parteaDesenului(texte)], ['culorile', parteaCulorilor]]) {
    try { await f(); } catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
})().catch((e) => { rele++; console.log('  ✗ EROARE: ' + ((e && e.stack) || e)); }).then(gata);
