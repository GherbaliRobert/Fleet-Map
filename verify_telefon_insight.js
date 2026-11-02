// verify_telefon_insight.js — RA Insight pe telefon (lotul „discuția", 02.11): telefonul face ce face secțiunea de pe web,
// pe aceleași rute, cu aceleași reguli și aceleași cuvinte.
//
//   node verify_telefon_insight.js
//
// Ce păzește:
//   1.  butoanele de sub salut, perioadele, lista din „+", meniul „⋯": aceleași ca pe web;
//   2.  „Azi la tine": aziPrimul și aziButon ale paginii, RULATE lângă cele ale telefonului, pe aceleași cazuri;
//   3.  pachetul și contorul (/api/ai/quota): incarcaPachet, textContor, actualizeazaCaseta ale paginii, rulate;
//   4.  textul serverului: md, mdScurt, textGros, _chatTextSimplu, cand, grup, _chatPuneInText, _chatMasini ale paginii, rulate;
//   5.  răspunsul: bulaAi al paginii, RULAT pe un DOM de carton, lângă planBula de pe telefon — aceleași părți, în aceeași ordine;
//   6.  ce pleacă la server și ce se ține din răspuns: corpul întrebării, câmpurile mesajului, o singură cale de întrebat;
//   7.  butoanele: fiecare fel din insightProblemaButon are drum pe telefon (sau, fără pagină încă, nu se desenează);
//       cartonașul de propunere: câmpurile din „Schimbă", rutele, „Anulează" numărat din `ramasMs`;
//   8.  niciun text de-al serverului scris pe telefon, nicio etichetă altfel decât pe web, niciun HTML de la server, linkuri doar http/https;
//   9.  navigarea: /ai duce la /insight, rândul din meniu, „Agenți AI" ascuns cu `aiCont`;
//   10. culorile, măsurate pe ambele teme, și așezarea (fără ieșire în lături, caseta pe zona sigură, sertarul fără umbră cât e închis);
//   11. ecranele desenate în HTML (cu preact; în CI se sare, ca la verify_telefon_lot5.js);
//   12. pe server pornit, prin clientul HTTP ADEVĂRAT al telefonului, cu cheia lui: rapoarte cerute în cuvinte, conversații,
//       cartonașul alertei (Schimbă, dovezile, Da, Anulează, un 409 care aduce starea), notițele, omul fără cont. ZERO cereri la model.
//
// Regula casei: unde telefonul ține o copie a unei reguli a paginii, proba nu o crede pe cuvânt. Decupează bucata paginii
// (public/index.html) și pe cea a telefonului (TypeScript, tradus), le RULEAZĂ pe aceleași cazuri și cere același rezultat.
//
// Pornește UN server (PGlite, port 3531, TCP 5531, baza în dosarul temporar, ștearsă la final), cu modelul simulat: orice cerere
// către el se numără și trebuie să rămână zero. În CI (fără mobile/node_modules) compilatorul vine de la rădăcină, iar ce se
// desenează cu preact se sare, cu un rând „⤼ sărit". `PROBA_CA_IN_CI=1 node verify_telefon_insight.js` face la fel pe calculator.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

const ROOT = __dirname;
// Unele fișiere sunt CRLF pe disc: rândurile se normalizează, ca reperele și expresiile de aici (cu \n) să le prindă.
const citeste = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0, sarite = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 700) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const JC = (x) => JSON.stringify(x, function (k, v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce(function (o, kk) { o[kk] = v[kk]; return o; }, {}) : v; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function functie(src, reper) {
  const i = src.indexOf(reper); if (i < 0) return '';
  let j = src.indexOf('{', i + reper.length - 1), adanc = 0;
  for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
  return src.slice(i, j + 1);
}
const taie = (src, de, pana) => { const i = src.indexOf(de); if (i < 0) return ''; const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j); };
const faraComentarii = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');

// ─── TypeScript și preact: din mobile/node_modules, care în CI NU există ─────────────────────────────────────────
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
const SARI = (n, motiv) => { sarite++; console.log('  ⤼ sărit: ' + n + '  (' + motiv + ')'); };
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
  const cod = citeste(rel).split('(import.meta as any).env').join('({})');
  vm.runInContext(tsJs(cod, rel), ctx, { filename: rel });
  return m.exports;
}

const html = citeste('public/index.html');
const INSP = taie(html, '// ── începe „secțiunea RA Insight" ──', '// ── sfârșit „secțiunea RA Insight" ──');
const COMUNE = html.slice(Math.max(0, html.indexOf('window._insightExtra = function')), html.indexOf('// ── începe „secțiunea RA Insight" ──'));
const server = citeste('server.js');
const F = {
  lib: 'mobile/src/lib/insight.ts', ecran: 'mobile/src/screens/Insight.tsx', bula: 'mobile/src/components/InsightBula.tsx',
  prop: 'mobile/src/components/InsightPropunere.tsx', text: 'mobile/src/components/InsightText.tsx', css: 'mobile/src/screens/insight.css',
  app: 'mobile/src/App.tsx', meniu: 'mobile/src/screens/Menu.tsx', endpoints: 'mobile/src/api/endpoints.ts', client: 'mobile/src/api/client.ts',
  reports: 'mobile/src/screens/Reports.tsx', route: 'mobile/src/screens/RouteScreen.tsx', detaliu: 'mobile/src/screens/VehicleDetail.tsx',
  icon: 'mobile/src/components/Icon.tsx', tokens: 'mobile/src/theme/tokens.css', chat: 'mobile/src/components/ChatScreen.tsx', push: 'mobile/src/lib/push.ts',
};
const S = {}; Object.keys(F).forEach((k) => { S[k] = citeste(F[k]); });

sect('0. Fișierele');
T('toate fișierele citite de probă există', Object.keys(S).every((k) => !!S[k]), Object.keys(S).filter((k) => !S[k]).join(', '));
T('găsesc blocul secțiunii și piesele comune în pagină', INSP.length > 1000 && COMUNE.length > 1000);
T('ecranul vechi „Asistent AI" a plecat', !fs.existsSync(path.join(ROOT, 'mobile/src/screens/AiChat.tsx')) && !/export function ChatScreen\b/.test(S.chat));

const L = modul(F.lib);

sect('1. Butoanele de sub salut, perioadele, „+", „⋯"');
{
  const ev = (re) => { const m = INSP.match(re); return m ? vm.runInNewContext('(' + m[1] + ')') : null; };
  const CARDURI = ev(/var CARDURI = (\[[\s\S]*?\]);/);
  T('aceleași trei butoane ca pe web (pe ecran `t`, pleacă `q`)', J(L.CARDURI) === J(CARDURI), J(L.CARDURI));
  const reg = vm.runInNewContext('var CARDURI = ' + J(CARDURI) + '; ' + (INSP.match(/var CARDURI_REGULI = [^\n]*;/) || [''])[0] + ' CARDURI_REGULI');
  T('…și la fel pe butoane (Start, luna oprită)', J(L.CARDURI_REGULI) === J(reg), J(L.CARDURI_REGULI));
  const per = vm.runInNewContext('(' + taie(html, 'window._CHAT_PERIOADE = ', '.map(function (x) { x.fa').replace('window._CHAT_PERIOADE = ', '') + ')');
  T('aceleași perioade', J(L.PERIOADE) === J(per), J(L.PERIOADE));
  // Lista din „+", rulată pe web (insightPlus cu un _chatAlege care doar ține minte).
  const plusWeb = (rapoarte) => {
    let prins = null;
    const w = { _chatAlege: (b, t, l) => { prins = { t, l }; } };
    new Function('window', 'poateRapoarte', functie(INSP, 'window.insightPlus = function (btn) {') + '; window.insightPlus({});')(w, () => rapoarte);
    return prins;
  };
  [true, false].forEach((r) => {
    const a = plusWeb(r), b = L.listaPlus(r);
    T('„+" (' + (r ? 'cu' : 'fără') + ' rapoarte): aceleași rânduri', a.t === 'Adaugă' && J(a.l.map((x) => [x.text, x.sub, x.k])) === J(b.map((x) => [x.text, x.sub, x.k])), J(b));
  });
  T('titlurile foilor, ca pe web', ["'Adaugă'", "'Alege mașina'", "'Alege perioada'", "'Ce raport fac?'", "'RA Insight'"].every((t) => INSP.indexOf('_chatAlege(btn, ' + t) >= 0 && S.ecran.indexOf('titlu: ' + t) >= 0));
  // „⋯": ce vine în lotul ăsta, cu aceleași cuvinte și în aceeași ordine ca pe web. „Pachet și conturi" și „Ghidul" vin cu ecranele lor.
  const meniuWeb = taie(INSP, 'window.insightMeniu = function (btn) {', "window._chatAlege(btn, 'RA Insight'");
  const lb = L.listaMeniu({ areConv: true, poateAgenti: true }).map((x) => x.text);
  const laWeb = lb.map((t) => meniuWeb.indexOf("text: '" + t + "'"));
  T('meniul „⋯": fiecare rând există pe web, în aceeași ordine', laWeb.every((x) => x >= 0) && laWeb.every((x, i) => !i || x > laWeb[i - 1]), J(lb) + ' ' + J(laWeb));
  T('…fără conversație deschisă: doar notițele și agenții', J(L.listaMeniu({ areConv: false, poateAgenti: true }).map((x) => x.k)) === J(['notite', 'agenti']) && J(L.listaMeniu({ areConv: false, poateAgenti: false }).map((x) => x.k)) === J(['notite']));
  T('…„Pachet și conturi" și „Ghidul" nu apar în lotul ăsta (ecranele lor vin după)', !/Pachet și conturi|Ghidul aplicației/.test(faraComentarii(S.lib + S.ecran)));
  T('…nota de jos, ca pe web', INSP.indexOf(L.NOTA_MENIU) >= 0, L.NOTA_MENIU);
  T('…„Setările agenților": aceeași condiție ca pe web, duce la ecranul agenților',
    /u\.features && u\.features\.agents !== false && u\.permissions && u\.permissions\.viewReports/.test(meniuWeb) && /u\?\.features && u\.features\.agents !== false && u\?\.permissions\?\.viewReports/.test(S.ecran) && /x\.k === 'agenti'\) loc\.route\('\/ai-agents'\)/.test(S.ecran));
  // Salutul, rulat pe web.
  const prenumeWeb = (full) => new Function('window', functie(INSP, 'function prenume()') + '; return (prenume() ? "Salut, " + prenume() + "! " : "Salut! ") + "Cu ce te pot ajuta?";')({ currentUser: { full_name: full } });
  ['Alin Tîlvăr', '  Ion  ', '', null, 'alin@firma.ro', 'Maria-Ana Pop'].forEach((f) => T('salutul pentru ' + J(f), L.textSalut(f) === prenumeWeb(f), L.textSalut(f)));
  T('rapoartele din „+": de la server, cu textul pus în casetă', /Api\.insightRapoarte\(\)/.test(S.ecran) && /pune: String\(x\.pune \|\| ''\)/.test(S.ecran) && /'\/api\/insight\/rapoarte'/.test(S.endpoints));
}

sect('2. „Azi la tine": un rând = un clic');
{
  const webPrimul = (rd, ai, rap) => new Function('areAi', 'poateRapoarte', functie(INSP, 'function aziPrimul(rd)') + '; return aziPrimul;')(() => ai, () => rap)(rd);
  const CAZURI = [
    { butoane: [] },
    { butoane: [{ fel: 'harta', text: 'Pe hartă', imeis: ['1', '2'] }] },
    { butoane: [{ fel: 'harta', text: 'Pe hartă', imeis: [] }, { fel: 'dece', text: 'De ce?', trimite: 'De ce?' }] },
    { butoane: [{ fel: 'harta', imeis: [] }, { fel: 'raport', text: 'Ralantiul', trimite: 'Fă-mi' }] },
    { butoane: [{ fel: 'dece', text: 'De ce?', trimite: 'De ce?' }, { fel: 'raport', text: 'R', trimite: 'F' }, { fel: 'intreaba', text: 'Care?', trimite: 'Care?' }] },
    { butoane: [{ fel: 'acte', text: 'Actele', ramura: 'mentenanta', trimite: 'Ce expiră?' }] },
    { butoane: [{ fel: 'propunere', text: 'Propunere', trimite: 'Propune' }] },
    { butoane: [{ fel: 'pagina', text: 'Șoferi', ramura: 'soferi', trimite: 'Arată' }] },
    {},
  ];
  let rulate = 0, diferite = '';
  for (const rd of CAZURI) for (const ai of [true, false]) for (const rap of [true, false]) {
    rulate++;
    const a = webPrimul(rd, ai, rap), b = L.aziPrimul(rd, ai, rap);
    if (J(a) !== J(b)) diferite += J([rd, ai, rap, a, b]) + ' ';
  }
  T('aziPrimul: același buton ca pe web, pe ' + rulate + ' de cazuri', !diferite && rulate === 36, diferite);
  // aziButon al paginii: fără nicio ramură livrată (ca pe telefon, în lotul ăsta), „Actele" pleacă drept întrebare.
  const webButon = (b) => {
    const urma = [];
    const w = { insightRamura: (k) => urma.push({ ramura: k }), insightTrimite: (t, o) => urma.push(o ? { trimite: t, buton: !!o.buton } : { trimite: t }) };
    const fn = new Function('window', 'showView', 'selectDevice', 'setTimeout', 'RAMURI', 'ramuraIncuiata', functie(INSP, 'function aziButon(b)') + '; return aziButon;')(
      w, () => {}, (imei) => urma.push({ harta: imei }), (f) => f(), [], () => false);
    fn(b);
    return urma[0] || null;
  };
  const telButon = (b) => {
    const a = L.aziActiune(b);
    if (!a) return null;
    if (a.ruta) return { harta: decodeURIComponent(a.ruta.replace('/vehicles/', '')) };
    return a.buton ? { trimite: a.trimite, buton: true } : { trimite: a.trimite };
  };
  [{ fel: 'harta', imeis: ['35/0', '2'] }, { fel: 'dece', trimite: 'De ce a scăzut?' }, { fel: 'raport', trimite: 'Fă-mi raportul' }, { fel: 'intreaba', trimite: 'Care?' },
    { fel: 'propunere', trimite: 'Propune un șofer' }, { fel: 'acte', ramura: 'mentenanta', trimite: 'Ce expiră?' }, { fel: 'pagina', ramura: 'soferi', trimite: 'Arată' }, { fel: 'alta' }]
    .forEach((b) => T('aziButon (' + b.fel + '): la fel ca pe web', J(webButon(b)) === J(telButon(b)), J(webButon(b)) + ' / ' + J(telButon(b))));
  T('„De ce?" se vede pe rând (se numără); „Propunere ›" la fel; restul, o săgeată', /b\.fel === 'dece' \? <span class="azi-dece">\{b\.text\}<\/span>/.test(S.ecran) && /b\.fel === 'propunere' \? <span class="azi-prop">\{b\.text\}/.test(S.ecran));
  T('capul, ca pe web: „N de văzut" sau „de la agenți · când"', /dv > 0 \? dv \+ ' de văzut' : 'de la agenți' \+ \(j\.la \? ' · ' \+ cand\(j\.la\) : ''\)/.test(INSP) && /dv > 0 \? dv \+ ' de văzut' : 'de la agenți' \+ \(j\.la \? ' · ' \+ cand\(j\.la\) : ''\)/.test(S.ecran));
  T('la noi (`platforma`) și fără cont, „Azi la tine" nu apare', /j\.platforma \|\| j\.seatMissing \|\| j\.error/.test(S.ecran));
  T('`nivel` doar din lista cunoscută (nu ajunge alt cuvânt în clasă)', L.nivelAzi('r') === 'r' && L.nivelAzi('x" onload="') === 'g' && L.nivelAzi(undefined) === 'g');
}

async function pachetSiContorul() {
  sect('3. Pachetul și contorul, din /api/ai/quota');
  const webQuota = async (q, fondator) => {
    const box = { style: {}, textContent: '', title: '', className: '', onclick: null };
    const St = { lista: [], mesaje: [], ramura: 'general', pachet: null, peReguli: false, sursa: false, sursaInfo: null };
    const w = { currentUser: { isSuper: fondator }, _raxNrI: new Function('n', functie(html, 'window._raxNrI = function (n) {').replace('window._raxNrI = function (n) {', '').replace(/\}$/, '')) };
    const cod = functie(INSP, 'async function incarcaPachet()') + functie(INSP, 'function deseneazaPachet(box, q)') + functie(INSP, 'function textContor(q)') + '; return incarcaPachet;';
    const fn = new Function('S', 'window', '$i', 'cere', 'actualizeazaCaseta', 'deseneazaRamuri', 'deseneazaMain', 'esteAdmin', cod)(St, w, (id) => (id === 'insp-fond' ? box : null), async () => ({ j: q }), () => {}, () => {}, () => {}, () => false);
    await fn();
    return { St, box };
  };
  const PK = (o) => Object.assign({ cod: 'basic', nume: 'Basic', ai: true, scurt: '188 din 200', text: 'Mai ai 188', textOm: 'Tu: cel mult 20', reincarcare: 'Se reîncarcă pe 1' }, o || {});
  const SE = { vede: true, poate: true, nume: 'Sursă externă', contor: '7 din 10', nota: 'Caută pe internet.', explicatie: 'E.' };
  const CAZURI = [
    ['Basic', { pachet: PK(), sursa: SE, questions: 200, remaining: 188 }, false],
    ['Basic oprit (s-au terminat)', { pachet: PK({ scurt: '0 din 200' }), blocked: true, sursa: SE }, false],
    ['Start, pe butoane', { pachet: PK({ cod: 'start', nume: 'Start', ai: false, scurt: '12 din 50', textOm: '' }), sursa: null }, false],
    ['Sursă externă terminată', { pachet: PK(), sursa: Object.assign({}, SE, { poate: false, contor: '0 din 10' }) }, false],
    ['Sursă externă fără voie', { pachet: PK(), sursa: Object.assign({}, SE, { vede: false }) }, false],
    ['fondator', { unlimited: true, questions: 0 }, true],
    ['client fără limită', { unlimited: true, questions: 0 }, false],
    ['regula veche', { questions: 100, remaining: 42, questionsPerSeat: 50 }, false],
    ['regula veche, oprită', { questions: 1, remaining: 0, blocked: true, periodEnd: '2026-12-01T00:00:00.000Z', questionsPerSeat: 0 }, false],
    ['eroare', { error: 'x' }, false],
    ['fără răspuns', null, false],
  ];
  {
    for (const [nume, q, fond] of CAZURI) {
      const { St, box } = await webQuota(q, fond);
      const st = L.stareDinQuota(q, fond);
      const arata = box.style.display !== 'none' && box.textContent !== '';
      T('rândul de jos, „' + nume + '": același text', (st.fond ? st.fond.text : '') === (arata ? box.textContent : ''), J(st.fond) + ' / ' + box.textContent);
      T('…același amănunt (pe web la mouse, aici la apăsare)', (st.fond ? st.fond.detaliu : '') === (arata ? box.title : ''), J(st.fond) + ' / ' + box.title);
      T('…același contor, aceeași hotărâre „pe butoane", aceeași „Sursă externă"',
        st.contor === St.contor && st.peReguli === St.peReguli && J(st.sursaInfo) === J(St.sursaInfo), J([st.contor, St.contor, st.peReguli, St.peReguli]));
      T('…avertizarea (portocaliu) pe același caz', !!(st.fond && st.fond.avert) === /\bw\b/.test(box.className), box.className);
    }
    // Caseta: placeholder-ul și butonul „Sursă externă", rulate pe web.
    const webCaseta = (St) => {
      const i = { placeholder: '' }, nm = { textContent: '' }, nr = { textContent: '' }, cls = {};
      const sb = { style: {}, title: '', attrs: {}, classList: { toggle: (k, v) => { cls[k] = !!v; } }, setAttribute: (k, v) => { sb.attrs[k] = v; }, querySelector: (s) => (s === '.nm' ? nm : nr) };
      const sn = { style: {}, textContent: '' };
      const dol = (id) => ({ 'insp-input': i, 'insp-sursa': sb, 'insp-sursa-nota': sn })[id] || null;
      new Function('S', '$i', 'poateRapoarte', functie(INSP, 'function actualizeazaCaseta()') + '; actualizeazaCaseta();')(St.S, dol, () => St.rap);
      return { placeholder: i.placeholder, arata: sb.style.display !== 'none', on: !!cls.on, gol: !!cls.gol, nr: nr.textContent, nota: sn.style.display === 'none' ? '' : sn.textContent, nume: nm.textContent };
    };
    const SEc = (o) => Object.assign({}, SE, o || {});
    const cazuri = [
      [false, null, true, SEc(), false], [false, null, false, SEc(), true], [true, PK({ ai: false }), true, null, false], [true, PK(), true, SEc(), true],
      [false, PK(), true, SEc({ poate: false, contor: '0 din 10' }), false], [false, PK(), true, SEc({ contor: '' }), true], [false, null, true, null, false],
    ];
    for (const [peReguli, pachet, rap, sursaInfo, sursa] of cazuri) {
      const w = webCaseta({ S: { peReguli, pachet, sursaInfo, sursa, contor: '' }, rap });
      T('caseta ' + J([peReguli, !!pachet, rap, !!sursaInfo, sursa]) + ': același placeholder', w.placeholder === L.placeholderCaseta(peReguli, pachet, rap), w.placeholder);
      const b = L.butonSursa(sursaInfo, peReguli, sursa);
      T('…același buton „Sursă externă" (apare, pornit, gol, contor, nota)', w.arata === !!b && (!b || (b.on === w.on && b.gol === w.gol && b.contor === w.nr && b.nota === w.nota && b.nume === w.nume)), J(w) + ' / ' + J(b));
    }
    T('`areAi`, ca pe web', /function areAi\(\) \{ return !S\.peReguli && !\(S\.pachet && !S\.pachet\.ai\); \}/.test(INSP) && L.areAi(false, null) === true && L.areAi(true, PK()) === false && L.areAi(false, PK({ ai: false })) === false);
    T('„Sursă externă" terminată: apăsarea spune nota, nu pornește nimic; se stinge la o discuție nouă și la una redeschisă',
      /if \(!si\.poate && !sursaOn\) \{ showToast\(String\(si\.nota \|\| ''\), true\); return; \}/.test(S.ecran) && (S.ecran.match(/setSursaOn\(false\)/g) || []).length >= 3 && /if \(!st\.sursaInfo \|\| !st\.sursaInfo\.poate\) setSursaOn\(false\)/.test(S.ecran));
    T('nicio cifră de pachet și niciun nume de pachet scris pe telefon', !/\b(Basic|Business|Start)\b/.test(faraComentarii(S.lib + S.ecran + S.bula + S.prop)) && !/din 200|din 50\b/.test(faraComentarii(S.lib + S.ecran)));
  }
}

async function parteaTextului() {
  sect('4. Textul serverului, caseta, mașinile');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const webMd = new Function(functie(INSP, 'function md(t)') + '; return md;')();
  const pHtml = (p) => p.map((x) => (x.b ? '<strong>' + esc(x.t) + '</strong>' : (x.i ? '<em>' + esc(x.t) + '</em>' : esc(x.t)))).join('');
  const telMd = (t) => L.mdBlocuri(t).map((b) => {
    if (b.fel === 'gol') return '<div style="height:6px"></div>';
    if (b.fel === 'h') return '<div class="rax-md-h">' + pHtml(b.parti) + '</div>';
    if (b.fel === 'li') return '<div class="rax-md-li">' + pHtml(b.parti) + '</div>';
    return '<div>' + pHtml(b.parti) + '</div>';
  }).join('');
  ['Simplu.', '**Gros** și subțire **iar**', '## Titlu **gros**\nRând', '- unu\n• doi\n* trei', 'A\n\nB', '<script>alert(1)</script> & **<b>x</b>**', 'Cost: 2 * 3 lei', '', null, 'rând cu spații la coadă   \n  rând cu spații în față'].forEach((c) => {
    T('md ' + J(c) + ': aceleași blocuri ca pe web', telMd(c) === webMd(c), telMd(c) + ' / ' + webMd(c));
  });
  T('*italic*, ca `aiMd` (explicația serverului când s-a terminat fondul)', J(L.partiMd('Rămân gratuite: *unde e o mașină, câți km*.')) === J([{ t: 'Rămân gratuite: ' }, { t: 'unde e o mașină, câți km', i: true }, { t: '.' }]), J(L.partiMd('Rămân gratuite: *unde e o mașină, câți km*.')));
  T('…„2*3" și o listă rămân text', J(L.partiMd('2*3 și 4*5')) === J([{ t: '2*3 și 4*5' }]) && L.mdBlocuri('* unu').map((b) => b.fel)[0] === 'li');
  T('…aceeași expresie ca aiMd', S.chat.indexOf('(^|[^*\\w])\\*([^*\\s](?:[^*\\n]*[^*\\s])?)\\*(?![*\\w])') >= 0 && S.lib.indexOf('(^|[^*\\w])\\*([^*\\s](?:[^*\\n]*[^*\\s])?)\\*(?![*\\w])') >= 0);
  const webScurt = new Function(functie(INSP, 'function mdScurt(t)') + '; return mdScurt;')();
  const webGros = (t) => {
    const n = { html: '', appendChild(c) { n.html += c; return n; } };
    const el = (tag, cls, x) => '<b>' + esc(x) + '</b>';
    const doc = { createTextNode: (x) => esc(x) };
    new Function('el', 'document', functie(INSP, 'function textGros(nod, t)') + '; return textGros;')(el, doc)(n, t);
    return n.html;
  };
  const telGros = (t) => L.partiGros(t).map((x) => (x.b ? '<b>' + esc(x.t) + '</b>' : esc(x.t))).join('');
  ['**B 154 UIP** nu transmite de 3 ore.', 'Fără gros', 'A **b** c **d**', '<i>x</i> **<y>**', ''].forEach((c) => {
    T('rândul din „Azi la tine" ' + J(c) + ': ca mdScurt', telGros(c) === webScurt(c), telGros(c) + ' / ' + webScurt(c));
    T('rândul din „Gata" ' + J(c) + ': ca textGros', telGros(c) === webGros(c), telGros(c) + ' / ' + webGros(c));
  });
  const webSimplu = new Function(functie(COMUNE, 'window._chatTextSimplu = function (t) {').replace('window._chatTextSimplu = function (t) {', 'return (function (t) {') + ');')();
  ['**Gros** normal', '## Titlu\n- unu\n* doi\n• trei', '  spații  ', null].forEach((c) => T('ce se copiază ' + J(c) + ': ca pe web', L.textSimplu(c) === webSimplu(c), L.textSimplu(c)));
  // Datele: aceeași zi / grupă, cu ceasul adevărat.
  const webCand = new Function(functie(INSP, 'function zi0(d)') + functie(INSP, 'function cand(ts)') + functie(INSP, 'function grup(ts)') + '; return { cand, grup };')();
  const acum = Date.now();
  [0, 3600e3, 86400e3, 2 * 86400e3, 6 * 86400e3, 7 * 86400e3, 40 * 86400e3].forEach((d) => {
    const iso = new Date(acum - d).toISOString();
    T('când ' + Math.round(d / 3600e3) + ' h în urmă: „' + L.cand(iso) + '", grupa „' + L.grup(iso) + '"', L.cand(iso) === webCand.cand(iso) && L.grup(iso) === webCand.grup(iso), webCand.cand(iso) + ' / ' + webCand.grup(iso));
  });
  T('o dată stricată nu scrie nimic', L.cand('nu e o dată') === '' && L.cand(null) === webCand.cand(null));
  // _chatPuneInText: pe web, cu o casetă de carton.
  const webPune = (v, a, b, bucata, buton) => {
    const ta = { value: v, selectionStart: a, selectionEnd: b, dataset: buton ? { buton: '1' } : {}, focus() {}, setSelectionRange(x) { ta.cursor = x; }, dispatchEvent() {} };
    new Function('window', 'Event', functie(COMUNE, 'window._chatPuneInText = function (ta, bucata) {') + '; window._chatPuneInText(arguments[2], arguments[3]);')({}, function () {}, ta, bucata);
    return { text: ta.value, cursor: ta.cursor, buton: ta.dataset.buton === '1' };
  };
  [['', 0, 0, 'B 154 UIP', false], ['ieri', 0, 0, 'B 154 UIP', false], ['km pe', 5, 5, 'B 154 UIP', false], ['km pe ', 6, 6, 'azi', true], ['Fă-mi  acum', 6, 6, 'azi', false], ['abc', 1, 2, 'X', false], ['B 1', null, null, 'azi', true]].forEach((c) => {
    const a = webPune(c[0], c[1], c[2], c[3], c[4]), b = L.punInText(c[0], c[1], c[2], c[3], c[4]);
    T('pus în casetă ' + J(c) + ': la fel ca pe web', J(a) === J({ text: b.text, cursor: b.cursor, buton: b.buton }), J(a) + ' / ' + J(b));
  });
  T('o literă scrisă de mână: nu mai e o întrebare de pe butoane', /onText=\{\(v\) => \{ dinButoane\.current = false; setText\(v\); \}\}/.test(S.ecran) && /if \(ev && ev\.inputType\) delete t\.dataset\.buton/.test(INSP));
  // _chatMasini.
  const DEV = [{ imei: '1', plate: 'B 2', name: 'Logan', group_name: 'Grupa' }, { imei: '2', plate: 'AG 1', name: 'AG 1' }, { imei: '3', plate: '', name: 'Șoim' }, { imei: '4' }, { imei: '5', plate: ' CJ 9 ', name: ' Caddy ' }];
  for (const forma of [DEV, { devices: DEV }, {}, null]) {
    const fet = async () => ({ ok: true, json: async () => forma });
    const fn = new Function('window', 'fetch', 'Date', 'var _chatMasiniMem = null;' + functie(COMUNE, 'window._chatMasini = async function () {') + '; return window._chatMasini;')({}, fet, Date);
    const a = (await fn()).map((x) => ({ text: x.text, sub: x.sub, pune: x.pune }));
    T('mașinile din „+" (' + (Array.isArray(forma) ? 'listă' : (forma ? 'obiect' : 'gol')) + '): ca pe web', J(a) === J(L.masiniAlegere(forma)), J(a) + ' / ' + J(L.masiniAlegere(forma)));
  }
  T('…din aceeași listă ca harta (/api/devices)', /Api\.devices\(\)/.test(S.ecran) && /fetch\('\/api\/devices'/.test(COMUNE));
  T('linkurile: doar http / https', L.linkSigur('https://a.ro') && L.linkSigur('HTTP://A.RO') && !L.linkSigur('javascript:alert(1)') && !L.linkSigur('data:text/html,x') && !L.linkSigur(' https://a.ro') && !L.linkSigur('') && !L.linkSigur(null) && !L.linkSigur('//a.ro'));
  T('…aceeași regulă ca pe web, iar telefonul o aplică pe fiecare sursă, cu aceleași atribute', /if \(!\/\^https\?:\\\/\\\/\/i\.test\(String\(s\.url \|\| ''\)\)\) return;/.test(INSP) && /\.filter\(\(s: any\) => linkSigur\(s\.url\)\)/.test(S.bula) && /target="_blank" rel="noopener noreferrer nofollow"/.test(S.bula) && /a\.rel = 'noopener noreferrer nofollow'/.test(INSP));
}

function parteaBulei() {
  sect('5. Răspunsul: bulaAi al paginii, rulat pe un DOM de carton, lângă planBula de pe telefon');
  const nod = (tag) => {
    const n = { tag, children: [], className: '', style: {}, attrs: {}, dataset: {}, _t: '', _h: '', type: '', title: '', onclick: null };
    n.appendChild = (c) => { if (c) n.children.push(c); return c; };
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.remove = () => {}; n.replaceWith = () => {};
    n.classList = { toggle() {}, add() {}, remove() {} };
    n.querySelector = () => null;
    Object.defineProperty(n, 'childNodes', { get: () => n.children });
    Object.defineProperty(n, 'textContent', { get: () => n._t + n.children.map((c) => c.textContent).join(''), set: (v) => { n._t = String(v); n.children = []; } });
    Object.defineProperty(n, 'innerHTML', { get: () => n._h, set: (v) => { n._h = String(v); n.children = []; } });
    return n;
  };
  const D = { createElement: nod, createTextNode: (t) => { const x = nod('#text'); x._t = String(t); return x; } };
  const cod = [functie(INSP, 'function el(tag, cls, text)'), functie(INSP, 'function md(t)'), functie(INSP, 'function blocSursa(se)'), functie(INSP, 'function cartonasRaport(rp)'),
    'var window = W; var document = D;',
    functie(COMUNE, 'window._insightExtra = function (j, laAlegere, parte) {') + ';', functie(COMUNE, 'window._chatInsigna = function (ins) {') + ';',
    functie(COMUNE, 'window._chatProbleme = function (lista) {') + ';', functie(COMUNE, 'window._chatActiuni = function (text) {') + ';',
    functie(INSP, 'function bulaAi(m)'), 'return bulaAi;'].join('\n');
  const W = {};
  const stubProp = () => { const n = nod('div'); n.className = 'PROPUNERE'; return n; };
  const stubBtn = (t) => { const n = nod('button'); n._t = String(t); return n; };
  const bulaAi = new Function('W', 'D', 'cartonasPropunere', 'butonProp', 'esteAdmin', 'adaugaUrmator', cod)(W, D, stubProp, stubBtn, () => false, () => {});
  const clase = (bub) => {
    const out = [];
    bub.children.forEach((c) => {
      const k = String(c.className), prim = c.children[0] ? String(c.children[0].className) : '';
      let p = null;
      if (k === 'chat-ins-cap') p = 'insigna';
      else if (k === 'ins-extra') p = prim === 'ins-tit' ? 'inteles' : (prim === 'chat-nota' ? 'nota' : (prim === 'ins-alege' ? 'alege' : '?' + prim));
      else if (k === 'chat-lim') p = 'limita';
      else if (k === 'chat-raps') p = 'rapoarte';
      else if (k === 'insp-txt') p = 'text';
      else if (k === 'chat-se') p = 'sursa';
      else if (k === 'PROPUNERE') p = 'propunere';
      else if (/chat-actiuni/.test(k)) p = 'actiuni';
      else if (k === 'chat-probs') p = 'probleme';
      else if (k === 'chat-ok') p = 'verificat';
      else if (k === 'insp-surse') p = 'surse';
      else if (k === 'chat-act') p = 'jos';
      else p = '?' + k;
      if (out[out.length - 1] !== p) out.push(p);
    });
    return out;
  };
  const INS = { fel: 'ai', nume: 'RA Insight', eticheta: 'Analiză', detaliu: '1 întrebare', text: 'x' };
  const RAP = { id: 7, label: 'Foaie de parcurs', vehicul: 'B 1', perioada: 'azi', pana: '09.11', kpi: [{ et: 'Curse', val: '1' }], note: ['Tăiat'] };
  const SURSE = [{ type: 'trips', label: 'Foaie de parcurs', imei: '1', vehicle: 'B 1' }, { type: 'fuel', label: 'Combustibil', imei: '1' }, { type: 'idle', label: 'Ralanti' }];
  const PROB = [{ grav: 'rosu', titlu: 'Viteză', dovada: 'la 14:32', butoane: [{ fel: 'traseu', text: 'Vezi', imei: '1' }] }];
  const PROP = (stare) => ({ id: 5, stare, titlu: 'Pun alerta', randuri: [{ l: 'Peste', v: '120', b: true }], poate: true });
  const CAZURI = [
    ['rapid, local', { id: 1, text: 'Unde e', extra: { source: 'local', insigna: INS, inteles: [{ text: 'toată flota' }] } }],
    ['fără id: fără 👍/👎', { text: 'Eroare de rețea: x', extra: {} }],
    ['fără extra (mesaj vechi)', { id: 2, text: 'Vechi', extra: null }],
    ['AI, plin', { id: 3, text: 'Analiza **bună**', extra: { source: 'ai', insigna: INS, inteles: [{ text: 'B 1', mem: true }, { text: 'azi' }], sursa: { titlu: 'Surse', text: 'Căutat', surse: [{ url: 'https://a.ro', titlu: 'A', site: 'a.ro' }, { url: 'javascript:x', titlu: 'R' }], ceAmCautat: 'Ce' }, actiuni: [{ fel: 'ecran', ecran: 'alerts', text: 'Deschide Alerte' }], probleme: PROB, verificat: true, verificatText: 'Cifrele din sursele de mai sus.', nota: 'Am citit altă perioadă.', alege: [{ text: 'B 1', trimite: 'B 1' }], sources: SURSE, urmari: [{ text: 'Și ieri?' }] } }],
    ['verificat fără text (mesaj vechi)', { id: 4, text: 'x', extra: { source: 'ai', verificat: true } }],
    ['verificat fără text, cu sursă', { id: 4, text: 'x', extra: { source: 'ai', verificat: true, sursa: { titlu: 't', surse: [] } } }],
    ['nota veche (verificare.perioada)', { id: 4, text: 'x', extra: { source: 'ai', verificare: { perioada: 'Altă perioadă' } } }],
    ['raport cerut: doar cartonașul', { id: 5, text: 'Am făcut raportul', extra: { source: 'reguli', insigna: INS, inteles: [{ text: 'Foaie' }], raport: RAP } }],
    ['mai multe rapoarte + analiză (source ai): și textul', { id: 6, text: 'Compar', extra: { source: 'ai', insigna: INS, inteles: [{ text: 'x' }], rapoarte: [RAP, RAP], sources: SURSE.slice(0, 1) } }],
    ['raport fără label: nu e cartonaș', { id: 6, text: 'x', extra: { source: 'reguli', raport: { id: 1 } } }],
    ['limita pachetului', { id: 7, text: 'S-au terminat', extra: { source: 'reguli', insigna: INS, limita: true } }],
    ['pachetMesaj + text', { id: 8, text: 'Doar butoane.\n\nAm făcut.', extra: { source: 'reguli', pachetMesaj: 'Doar butoane.', rapoarte: [RAP] } }],
    ['pachetMesaj, alt text', { id: 8, text: 'Altceva', extra: { source: 'reguli', pachetMesaj: 'Doar butoane.' } }],
    ['propunere deschisă: și fraza', { id: 9, text: 'Apeși Da', extra: { source: 'reguli', propunere: PROP('propusa') } }],
    ['propunere apăsată: fără frază', { id: 9, text: 'Apeși Da', extra: { source: 'reguli', propunere: PROP('aplicata') } }],
    ['două cartonașe, unul deschis', { id: 9, text: 'Două', extra: { source: 'reguli', propuneri: [PROP('aplicata'), Object.assign(PROP('propusa'), { id: 6 })] } }],
    ['două cartonașe, închise', { id: 9, text: 'Două', extra: { source: 'reguli', propuneri: [PROP('aplicata'), Object.assign(PROP('refuzata'), { id: 6 })] } }],
    ['propunere fără id: nu se desenează', { id: 9, text: 'x', extra: { propunere: { stare: 'propusa' } } }],
    ['insignă doar cu text (mesaj vechi)', { id: 9, text: 'x', extra: { insigna: { text: 'Veche' } } }],
    ['insignă goală', { id: 9, text: 'x', extra: { insigna: {} } }],
  ];
  for (const [nume, m] of CAZURI) {
    const row = bulaAi(JSON.parse(J(m)));
    const bub = row.children[1];
    const web = clase(bub), plan = L.planBula(JSON.parse(J(m)));
    T('„' + nume + '": aceleași părți, în aceeași ordine', J(web) === J(plan.ordine), J(web) + ' / ' + J(plan.ordine));
    const dupa = (cls) => bub.children.filter((c) => String(c.className).split(' ').indexOf(cls) >= 0)[0];
    const txt = dupa('insp-txt');
    T('…același text', (txt ? txt.innerHTML : '') === (plan.text ? new Function(functie(INSP, 'function md(t)') + '; return md;')()(plan.text) : ''), plan.text);
    const okk = dupa('chat-ok');
    T('…același rând „✓"', (okk ? okk.textContent : '') === plan.verificat, plan.verificat);
    const jos = dupa('chat-act');
    T('…aceleași butoane jos (Copiază; 👍/👎 doar cu id și nu pe răspunsul rapid)', jos.children.filter((c) => c.tag === 'button').length === (plan.voteaza ? 3 : 1), plan.voteaza);
    const sp = jos.children.filter((c) => String(c.className) === 'chat-sursa')[0];
    T('…același „Din raportul…"', (sp ? sp.textContent : '') === plan.dinRaport, plan.dinRaport);
    const su = dupa('insp-surse');
    T('…cel mult două butoane spre rapoarte, cu același text', J(su ? su.children.map((b) => b.textContent) : []) === J(plan.surse.map(L.textSursaRaport)), J(plan.surse.map(L.textSursaRaport)));
    const lim = dupa('chat-lim');
    if (lim) T('…aceeași casetă a pachetului', plan.limita != null && lim._h === new Function(functie(INSP, 'function md(t)') + '; return md;')()(plan.limita), plan.limita);
    else T('…fără caseta pachetului', plan.limita == null, plan.limita);
  }
  T('întrebările de continuare: cel mult trei, doar sub ultimul răspuns, pleacă pe butoane',
    /\.slice\(0, 3\)/.test(functie(COMUNE, 'window._chatUrmari = function (urmari, laAlegere) {')) && /urmari\.slice\(0, 3\)/.test(S.bula) && /ult && ult\.rol !== 'user'/.test(S.ecran) && /String\(u\.trimite \|\| u\.text \|\| ''\), \{ buton: true \}/.test(S.bula));
  T('desenul citește planul: nicio hotărâre a doua în bulă', /const plan = planBula\(m\);/.test(S.bula) && !/x\.source !== 'ai'|\.stare !== 'propusa'/.test(S.bula));
  // Câmpurile cu care desenează telefonul: fiecare e citit și de pagină (nu inventăm nume de câmpuri).
  const prinsCuPlan = (cheie, re) => T('cartonașul raportului citește `' + cheie + '`, ca pagina', re.test(S.bula) && new RegExp('rp\\.' + cheie).test(functie(INSP, 'function cartonasRaport(rp)')));
  [['label', /rp\.label/], ['vehicul', /rp\.vehicul/], ['perioada', /rp\.perioada/], ['gol', /rp\.gol/], ['kpi', /rp\.kpi/], ['id', /rp\.id/], ['pana', /rp\.pana/], ['note', /rp\.note/]].forEach((x) => prinsCuPlan(x[0], x[1]));
  ['titlu', 'text', 'surse', 'ceAmCautat'].forEach((k) => T('blocul sursei citește `' + k + '`, ca pagina', new RegExp('se\\.' + k).test(S.bula) && new RegExp('se\\.' + k).test(functie(INSP, 'function blocSursa(se)'))));
  ['titlu', 'dovada', 'butoane', 'nota', 'grav'].forEach((k) => T('problema citește `' + k + '`, ca pagina', new RegExp('p\\.' + k).test(S.bula) && new RegExp('p\\.' + k).test(functie(COMUNE, 'window._chatProbleme = function (lista) {'))));
}

function parteaCererilor() {
  sect('6. Ce pleacă la server și ce se ține din răspuns');
  const ins = functie(INSP, 'window.insightTrimite = async function (text, opt) {');
  const campuriWeb = (ins.match(/extra: \{([\s\S]*?)\} \};/) || ['', ''])[1].split(',').map((x) => x.split(':')[0].trim()).filter(Boolean);
  const m = L.mesajDinRaspuns({});
  T('mesajul ține aceleași câmpuri ca pe web', J(Object.keys(m.extra).sort()) === J(campuriWeb.slice().sort()), J(Object.keys(m.extra)) + ' / ' + J(campuriWeb));
  T('…și același text de rezervă', /j\.reply \|\| j\.message \|\| j\.error \|\| 'RA Insight nu a putut răspunde acum\.'/.test(ins) && m.text === 'RA Insight nu a putut răspunde acum.' && L.mesajDinRaspuns({ error: 'E', message: 'M' }).text === 'M');
  T('…id-ul mesajului vine din `mesajId`', L.mesajDinRaspuns({ mesajId: 9 }).id === 9 && /id: j\.mesajId \|\| null/.test(ins));
  // Corpul întrebării, rulat pe web cu un `cere` care doar ține minte.
  const corpWeb = (o) => {
    const prins = {};
    const bucata = (ins.match(/var corp = \{ message: msg \};[\s\S]*?else corp\.nou = true;/) || [''])[0];
    new Function('msg', 'buton', 'S', 'prins', bucata + ' prins.corp = corp;')(o.msg, !!o.buton, { sursa: !!o.sursa, conv: o.id ? { id: o.id } : null }, prins);
    return prins.corp;
  };
  [{ msg: 'a' }, { msg: 'a', buton: true }, { msg: 'a', sursa: true }, { msg: 'a', id: 12 }, { msg: 'a', buton: true, sursa: true, id: 3 }].forEach((o) => {
    T('corpul întrebării ' + J(o) + ': ca pe web', J(corpWeb(o)) === J(L.corpIntrebare(o.msg, { buton: o.buton, sursa: o.sursa, conversatieId: o.id })), J(L.corpIntrebare(o.msg, { buton: o.buton, sursa: o.sursa, conversatieId: o.id })));
  });
  const toate = [];
  const umbla = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) umbla(p); else if (/\.tsx?$/.test(f.name)) toate.push(p); } };
  umbla(path.join(ROOT, 'mobile/src'));
  const cuRuta = toate.filter((p) => faraComentarii(fs.readFileSync(p, 'utf8')).indexOf("/api/insight/intreaba") >= 0).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
  T('o SINGURĂ funcție cheamă ruta întrebării (endpoints.ts), o singură dată', J(cuRuta) === J(['mobile/src/api/endpoints.ts']) && (S.endpoints.match(/\/api\/insight\/intreaba/g) || []).length === 1, J(cuRuta));
  T('ecranul întreabă dintr-un singur loc', (S.ecran.match(/Api\.insightIntreaba\(/g) || []).length === 1 && !/insightIntreaba/.test(S.bula + S.prop));
  T('rutele din endpoints.ts sunt cele ale paginii', ["'/api/insight/conversatii", "'/api/insight/azi'", "'/api/insight/rapoarte'", "'/api/insight/notite'"].every((r) => S.endpoints.indexOf(r) >= 0 && INSP.indexOf(r) >= 0)
    && /\/api\/insight\/actiuni\/'/.test(S.endpoints) && /'\/api\/insight\/actiuni\/'/.test(INSP) && /'\/feedback'/.test(S.endpoints) && /'\/feedback'/.test(INSP));
  T('serverul le are pe toate', ['/api/insight/intreaba', '/api/insight/conversatii', '/api/insight/conversatii/:id', '/api/insight/mesaje/:id/feedback', '/api/insight/notite', '/api/insight/azi', '/api/insight/rapoarte',
    '/api/insight/actiuni/:id/aplica', '/api/insight/actiuni/:id/refuza', '/api/insight/actiuni/:id/anuleaza', '/api/insight/actiuni/:id/dovezi'].every((r) => server.indexOf("'" + r + "'") >= 0));
  T('un `pagina` din răspuns se ignoră cât pagina nu e pe telefon, fără să crape', J(L.RAMURI_PE_TELEFON) === '[]' && /j\.pagina && RAMURI_PE_TELEFON\.indexOf\(String\(j\.pagina\)\) >= 0/.test(S.ecran));
  T('la o eroare, corpul serverului ajunge în bulă (`reply`), iar conversația dispărută se uită', /if \(e\.status === 404\) \{ setConv\(null\); convCurenta = null; \}/.test(S.ecran) && /r\.s === 404\) \{ S\.conv = null; window\._raxConvId = null; \}/.test(ins) && /new ApiError\(status, \(data && data\.error\) \|\| \('Eroare ' \+ status\), data\)/.test(S.client));
  T('conversația rămâne ținută minte cât trăiește aplicația (web: _raxConvId) și se redeschide la întoarcerea pe ecran', /if \(convCurenta\) deschide\(convCurenta\);/.test(S.ecran));
  T('fără cont: textul serverului, din amândouă formele (200 cu cheie, 403 cu sesiune)', L.textFaraLoc({ seatMissing: true, message: 'M' }) === 'M' && L.textFaraLoc({ error: 'ai_seat_missing', reply: 'R' }) === 'R' && L.textFaraLoc({ conversatii: [] }) === null && /e\.status === 403 \|\| e\.status === 401/.test(S.ecran));
  T('„Asistent AI" (ușa veche) rămâne pe server pentru aplicațiile vechi', /app\.post\('\/api\/ai\/chat'/.test(server));
}

function parteaButoanelor() {
  sect('7. Butoanele și cartonașul de propunere');
  const fnWeb = functie(COMUNE, 'window.insightProblemaButon = function (b, p, it) {');
  const feluri = Array.from(new Set((fnWeb.match(/b\.fel === '([a-z]+)'/g) || []).map((x) => x.match(/'([a-z]+)'/)[1])));
  T('felurile din insightProblemaButon', J(feluri.slice().sort()) === J(['echipa', 'ecran', 'fisa', 'harta', 'programate', 'ramura', 'raport', 'traseu']), J(feluri));
  const E = { echipa: { fel: 'echipa', text: 'Anunță', problema: 'semnal', imei: '35' }, harta: { fel: 'harta', text: 'H', imei: '35' }, traseu: { fel: 'traseu', text: 'T', imei: '35', de: '2026-11-02T10:00:00.000Z', pana: '2026-11-02T10:30:00.000Z', lat: 44.5, lng: 26.1, eticheta: '159 km/h' },
    ecran: { fel: 'ecran', text: 'E', ecran: 'alerts' }, ramura: { fel: 'ramura', text: 'R', ramura: 'safedrive' }, programate: { fel: 'programate', text: 'P' }, fisa: { fel: 'fisa', text: 'F', imei: '35', fila: 'basic' }, raport: { fel: 'raport', text: 'R', tip: 'consumption', imei: '35', de: '2026-11-01T00:00:00.000Z', pana: '2026-11-02T00:00:00.000Z' } };
  const AST = { echipa: /^\/meniu\?suport=1/, harta: /^\/vehicles\/35$/, traseu: /^\/vehicles\/35\/route\?de=\d+&pana=\d+&lat=44\.5&lng=26\.1&et=159%20km%2Fh$/, ecran: /^\/admin\/alerts$/, programate: /^\/report-schedules$/, fisa: /^\/vehicles\/35\?edit=fisa$/, raport: /^\/reports\?tip=consumption&imei=35&de=\d+&pana=\d+$/ };
  Object.keys(AST).forEach((k) => T('buton `' + k + '` → ' + L.rutaButon(E[k]), AST[k].test(String(L.rutaButon(E[k]))), String(L.rutaButon(E[k]))));
  T('buton `ramura`: fără pagină pe telefon nu are drum și nu se desenează', L.rutaButon(E.ramura) === null && J(L.butonuriCuDrum([E.ramura, E.harta]).map((b) => b.fel)) === J(['harta']));
  T('fel necunoscut, fără imei, ecran necunoscut, fără text: fără drum, fără să crape', L.rutaButon({ fel: 'alta' }) === null && L.rutaButon({ fel: 'harta' }) === null && L.rutaButon({ fel: 'fisa' }) === null && L.rutaButon({ fel: 'ecran', ecran: 'x' }) === null && L.rutaButon(null) === null && L.butonuriCuDrum([{ fel: 'harta', imei: '1' }]).length === 0 && L.butonuriCuDrum(null).length === 0);
  const toateEcranele = ['alerts', 'maintenance', 'documente', 'drivers'];
  T('fiecare ecran cerut de server are pereche pe telefon', toateEcranele.every((e) => L.rutaButon({ fel: 'ecran', ecran: e, text: 'x' })) && /ecran: 'maintenance'/.test(citeste('programari.js')) && /ecran: 'documente'/.test(citeste('programari.js')) && /ecran: 'alerts'/.test(citeste('propuneri.js')));
  const rute = (S.app.match(/<Route path="([^"]+)"/g) || []).map((x) => x.match(/"([^"]+)"/)[1]);
  ['/admin/alerts', '/admin/maintenance', '/admin/documents', '/admin/drivers', '/report-schedules', '/reports', '/vehicles/:imei', '/vehicles/:imei/route', '/meniu', '/ai-agents', '/insight'].forEach((r) => T('ruta ' + r + ' există în App.tsx', rute.indexOf(r) >= 0));
  T('„Deschide raportul" → Istoric, pe raportul ăsta (ruta pe care Rapoartele o citesc deja)', L.rutaIstoric(7) === '/reports?histId=7' && /\.histId/.test(S.reports));
  T('„Descarcă Excel": calea existentă a telefonului (fișierul din Istoric)', /exportHistoryReport\(rp\.id, rp\.tip \|\| 'raport', 'xlsx'\)/.test(S.bula) && /\/api\/reports\/history\/\$\{encodeURIComponent\(String\(id\)\)\}\?format=\$\{format\}/.test(citeste('mobile/src/lib/export.ts')));
  T('Rapoartele citesc `tip`, `de`, `pana` (ca rinOpenReport)', /\.tip\)/.test(S.reports) && /as any\)\?\.de\)/.test(S.reports) && /as any\)\?\.pana\)/.test(S.reports) && /tq !== 'due'/.test(S.reports) && /type !== 'due'/.test(functie(html, 'async function rinOpenReport(type, imei, from, to)')));
  T('Traseu citește intervalul și punctul; punctul se marchează ca pe web', /as any\)\?\.de\)/.test(S.route) && /as any\)\?\.lat\)/.test(S.route) && /L\.circleMarker\(\[punctLat, punctLng\], \{ radius: 10, color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0\.3 \}\)/.test(S.route) && /L\.circleMarker\(\[Number\(b\.lat\), Number\(b\.lng\)\], \{ radius: 10, color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0\.3 \}\)/.test(COMUNE) && /replace\(\/\[<>&\]\/g, ''\)/.test(S.route));
  T('fișa mașinii: `?edit=fisa` deschide foaia, doar cui are creion', /get\('edit'\) === 'fisa'/.test(S.detaliu) && /!_cerutFisa \|\| !me\.value \|\| !canManage/.test(S.detaliu));
  // Suportul, până vine fereastra „Anunță echipa".
  const supp = L.rutaSuport({ titlu: 'B 1 nu transmite', dovada: 'de 3 ore' });
  T('„Anunță echipa": drumul de suport din Meniu, cu textul serverului în casetă', supp === '/meniu?suport=1&ce=' + encodeURIComponent('B 1 nu transmite — de 3 ore') && L.rutaSuport() === '/meniu?suport=1', supp);
  T('…Meniul îl citește, deschide foaia și curăță adresa', /if \(!q\.suport\) return;/.test(S.meniu) && /setSupport\(true\);/.test(S.meniu) && /setMsg\(String\(q\.ce\)\)/.test(S.meniu) && /loc\.route\('\/meniu', true\)/.test(S.meniu));
  T('…butonul poartă textul serverului', /\{String\(b\.text\)\}/.test(S.bula) && /text: CE\.BUTON/.test(citeste('probleme.js')));
  // Cartonașul.
  const web = functie(INSP, 'function cartonasPropunere(p, gata) {');
  // Câmpurile din „Schimbă", citite din bucata paginii pe fiecare fel (`f.prag = …`), lângă ce pornește telefonul.
  [
    ['alerta', ['prag', 'imei', 'nume'], "if (p.fel === 'alerta') {", "} else if (p.fel === 'revizie' ||"],
    ['revizie', ['tip', 'km', 'data'], "if (p.fel === 'revizie') {", "} else if (p.fel === 'act') {"],
    ['act', ['tip', 'data'], "} else if (p.fel === 'act') {", "rand('Raportul'"],
    ['raport', ['imei', 'perioada', 'frecventa', 'ora', 'dest', 'format'], "rand('Raportul'", "if (r.l !== 'Despre')"],
  ].forEach(([fel, chei, de, pana]) => {
    const bucata = taie(web, de, pana);
    const dinWeb = Array.from(new Set((bucata.match(/\bf\.([a-z]+) = /g) || []).map((x) => x.match(/f\.([a-z]+)/)[1])));
    T('câmpurile din „Schimbă" (' + fel + '): aceleași ca pe web', J(dinWeb.slice().sort()) === J(chei.slice().sort()) && J(Object.keys(L.campuriStart({ fel, campuri: {} })).sort()) === J(chei.slice().sort()), J(dinWeb));
  });
  T('…discuția: doar `nota`, și numai dacă are rândul „Despre"', J(L.campuriStart({ fel: 'discutie', randuri: [{ l: 'Despre' }], campuri: { nota: 'x' } })) === J({ nota: 'x' }) && J(L.campuriStart({ fel: 'discutie', randuri: [{ l: 'Altceva' }] })) === '{}');
  T('…valorile pornesc de la `campuri`', J(L.campuriStart({ fel: 'alerta', campuri: { prag: 120, imei: '1', nume: 'N' } })) === J({ prag: '120', imei: '1', nume: 'N' }));
  T('„Da": același corp ca pe web (`campuri` la cele cu rânduri, `la` la șofer)', /var corp = p\.randuri \? \(ed \? \{ campuri: ed\(\) \} : \{\}\) : \(ales\.id != null && String\(ales\.id\) !== String\(p\.la\) \? \{ la: ales\.id \} : \{\}\);/.test(web) && /const corp = p\.randuri \? \(ed \? \{ campuri: ed \} : \{\}\) : \(ales\.id != null && String\(ales\.id\) !== String\(p\.la\) \? \{ la: ales\.id \} : \{\}\);/.test(S.prop));
  T('rutele apăsărilor: aplica, refuza, anuleaza, dovezi', ['aplica', 'refuza', 'anuleaza', 'dovezi'].every((f) => web.indexOf("/" + f) >= 0 || INSP.indexOf('/' + f + "'") >= 0) && /'aplica', corp\)/.test(S.prop) && /'refuza'\)/.test(S.prop) && /'anuleaza'\)/.test(S.prop) && /'dovezi', \{ prag, imei \}\)/.test(S.prop));
  T('un 409 aduce starea de acum (`propunere` din corpul erorii), ca pe web', /if \(r\.j\.propunere\) gata\(r\.j\.propunere, null\)/.test(web) && /e\.data\.propunere\) onGata\(e\.data\.propunere, null\)/.test(S.prop));
  // Ceasul lui „Anulează", rulat pe web.
  const webCeas = (ms) => {
    const t = { textContent: '' }; const btn = { lastChild: t };
    const doc = { body: { contains: () => true } };
    new Function('document', 'setInterval', functie(INSP, 'function ceasAnulare(btn, ramasMs)') + '; ceasAnulare(arguments[2], arguments[3]);')(doc, () => 0, btn, ms);
    return t.textContent;
  };
  [598000, 61000, 60000, 9000, 1000, 1500].forEach((x) => T('„Anulează" la ' + x + ' ms: ' + L.textCeas(x), webCeas(x) === L.textCeas(x), webCeas(x)));
  T('…pornește de la `ramasMs` al serverului și pleacă la capăt', /Date\.now\(\) \+ Math\.max\(0, Number\(ramasMs\) \|\| 0\)/.test(S.prop) && /if \(ramas <= 0\) return null;/.test(S.prop) && /p\.ramasMs > 0 \? <CeasAnulare ramasMs=\{p\.ramasMs\}/.test(S.prop));
  T('pasul următor după „Da" vine ca mesaj nou (`urmator`), ca pe web', J(L.mesajUrmator({ text: 'T', mesajId: 2, urmari: [1], insigna: { x: 1 } })) === J({ rol: 'assistant', id: 2, text: 'T', feedback: null, extra: { source: 'reguli', urmari: [1], insigna: { x: 1 } } }) && L.mesajUrmator(null) === null && /extra: \{ source: 'reguli', urmari: u\.urmari, insigna: u\.insigna \}/.test(INSP));
  T('iconițele cerute de server: un nume necunoscut ia iconița de rezervă, nu ajunge în pagină', L.iconaFa('fa-bell', 'x') === 'bell' && L.iconaFa('fa-nu-exista', 'x') === 'x' && L.iconaFa(undefined, 'x') === 'x');
  T('dovezile: nivelul doar din lista cunoscută', L.nivelDovada('ok') === 'ok' && L.nivelDovada('zzz') === 'i');
}

function parteaTextelor() {
  sect('8. Niciun text al serverului scris pe telefon, nicio etichetă altfel decât pe web, niciun HTML de la server');
  const cod = faraComentarii(S.lib + '\n' + S.ecran + '\n' + S.bula + '\n' + S.prop + '\n' + S.text);
  // Cuvintele pe care le scrie serverul (pachete.insigna, sursa_externa.js, probleme.js, propuneri.js, azi_la_tine.js).
  ['Analiză', 'ANALIZĂ', 'Instant', 'INSTANT', 'din datele de acum', 'Surse de pe internet', 'Căutat pe internet', 'Ce am căutat', 'Am găsit o problemă', 'De verificat', 'Sursă externă', 'Caută pe internet', 'gratuit', 'nu se scade', 'bonus', 'Safe Drive'].forEach((t) => {
    T('telefonul nu scrie „' + t + '"', cod.indexOf(t) < 0);
  });
  T('…dar serverul le scrie pe cele esențiale', /eticheta: .*'Analiză'|'Analiză'/.test(citeste('pachete.js')) && /'Instant'/.test(citeste('pachete.js')) && /Sursă externă/.test(citeste('sursa_externa.js')));
  // Etichetele pe care le scrie și pagina: aceleași cuvinte.
  const ET = ['Alege ce vrei să afli', 'Deschide raportul', 'Descarcă Excel', 'fără rânduri', 'E și în Istoric rapoarte, până pe ', 'Azi la tine', 'Agenții n-au găsit nimic de semnalat azi.', 'de la agenți', ' de văzut',
    'Conversație nouă', 'Caută în conversații', 'Caută în conversațiile tale', 'Nicio conversație nu conține ce cauți.', 'Încă nicio conversație. Pune prima întrebare în dreapta.', 'RA Insight nu e pornit pe contul tău',
    'Notițele firmei pentru RA Insight', 'Le scrie administratorul firmei.', 'Regulile casei, pe care RA Insight le folosește la fiecare răspuns. De exemplu: „Motorina e 7,30 lei.”, „Grupa Distribuție = cele 8 dube.”, „La noi săptămâna de lucru e luni–sâmbătă.” Le văd toți cei cu RA Insight din firmă — nu scrie aici date personale.',
    'Renunță', 'Închide', 'Notițele firmei s-au salvat ✓', 'Nu s-au putut salva.', 'Notițele nu s-au putut încărca.',
    'Un nume după care o recunoști ușor în listă.', 'Redenumește conversația', 'Numele conversației', 'Ștergi conversația?', 'Conversația se șterge de tot și nu se mai poate recupera.', 'Nu s-a putut redenumi.', 'Nu s-a putut șterge.',
    'Schimbă', 'Lasă cum era', 'Vezi fișa mașinii', 'fără șofer', 'De când', 'Șoferul', 'Îl scriu eu, după prag și mașină', 'Da, trece-l pe ', ' — propunerea mea', 'Numele alertei', 'Peste', 'Lucrarea', 'Termen', 'Actul', 'Valabil până pe', 'Raportul', 'Perioada', 'Cât de des', 'La ora', 'Cui', 'Format', 'Despre', 'nu e obligatoriu',
    'Pragul, în km/h', 'Kilometrii termenului', 'Data termenului', 'Perioada raportului', 'Ora trimiterii', 'Adresele de email, despărțite prin virgulă', 'Despre ce ați vorbit', 'Formatul', 'Alt șofer',
    'Mulțumim! Ne ajută să știm ce merge.', 'Mulțumim — ne uităm la ce n-a mers.', 'Nimic nu se potrivește.', 'Lista e goală.', 'Caută…', 'Răspuns bun', 'Răspuns slab', 'Copiază răspunsul', 'Editează întrebarea', 'Copiază întrebarea',
    'Adaugă mașina, perioada sau un raport', 'La ultimul mesaj', 'Cifrele le-am luat din rapoarte.', 'Cifrele le-am luat din aplicație și din sursele de mai sus.', 'Din raportul ', 'Din rapoartele ', 'Am copiat răspunsul.', 'Eroare de rețea: ', 'Nu s-a putut face.', 'Nu s-a putut anula.'];
  ET.forEach((t) => T('„' + t.slice(0, 60) + '": același cuvânt pe web și pe telefon', (INSP + COMUNE).indexOf(t) >= 0 && (S.lib + S.ecran + S.bula + S.prop).indexOf(t) >= 0, ((INSP + COMUNE).indexOf(t) >= 0 ? 'lipsește pe telefon' : 'lipsește pe web')));
  T('placeholder-ele casetei, aceleași', ['Scrie o întrebare sau cere un raport…', 'Scrie o întrebare…', 'Apasă „+" sau scrie o întrebare…', 'Apasă „+" ca să alegi…'].every((t) => INSP.indexOf(t) >= 0 && S.lib.indexOf(t) >= 0));
  T('regula veche: aceleași cuvinte', ['Fondul lunii s-a terminat: oprit până pe ', ', fără niciun cost în plus.', 'Întrebări · ', 'Un cont în plus aduce încă ', 'Fondator · fără limită', 'Fără limită'].every((t) => INSP.indexOf(t) >= 0 && S.lib.indexOf(t) >= 0));
  // Niciun HTML de la server.
  [['lib', S.lib], ['ecranul', S.ecran], ['bula', S.bula], ['cartonașul', S.prop], ['textul', S.text]].forEach(([n, s]) => {
    T(n + ': fără innerHTML / dangerouslySetInnerHTML', !/dangerouslySetInnerHTML|innerHTML/.test(faraComentarii(s)));
  });
  T('textul serverului trece doar prin noduri (Md, Gros), fără `aiMd`', /<Md text=\{plan\.text\} \/>/.test(S.bula) && /<Gros text=\{rd\.text\} \/>/.test(S.ecran) && /<Gros text=\{p\.gata\.text\} \/>/.test(S.prop) && !/aiMd/.test(faraComentarii(S.bula + S.ecran + S.prop + S.text)));
  T('Românește, cu diacritice (fără „Masina", „Sterge", „Salveaza" pe ecran)', !/'(Masina|Sterge|Salveaza|Inchide|Schimba|Intrebare)\b/.test(cod));
  T('iconițele cu nume necunoscut de server nu se pun în clasă sau în pagină', !/class=\{[^}]*\bp\.ic\b/.test(S.prop));
}

function parteaNavigarii() {
  sect('9. Navigarea');
  T('/insight e păzit ca web-ul (ecranul „insight" tăiat din rol → pagina calmă)', /insight: pazit\('insight', Insight, 'RA Insight'\)/.test(S.app) && /<Route path="\/insight" component=\{P\.insight\} \/>/.test(S.app));
  T('/ai duce la /insight (anunțuri vechi), înlocuind adresa', /<Route path="\/ai" component=\{SpreInsight\} \/>/.test(S.app) && /function SpreInsight\(\) \{[\s\S]*?loc\.route\('\/insight', true\)/.test(S.app));
  T('App.tsx nu mai încarcă ecranul vechi', !/AiChat/.test(S.app));
  T('meniul: rândul „RA Insight" duce la /insight, cu aceeași condiție ca pe web', /u\?\.features\?\.ai_assistant !== false && vede\('insight'\) && item\('sparkles', 'RA Insight', \(\) => loc\.route\('\/insight'\)\)/.test(S.meniu) && /feats\.ai_assistant !== false/.test(html));
  T('meniul: „Asistent AI" a plecat', !/Asistent AI/.test(faraComentarii(S.meniu)) && !/route\('\/ai'\)/.test(S.meniu));
  T('meniul: „Agenți AI" iese cu `aiCont`, ca pe web', /perms\.viewReports && !u\?\.aiCont && vede\('insight'\) && item\('shield', 'Agenți AI'/.test(S.meniu) && /feats\.agents !== false && me\.permissions && me\.permissions\.viewReports && !me\.aiCont/.test(html));
  T('`aiCont` e pe tipul profilului și îl dă serverul', /aiCont\?: boolean;/.test(S.endpoints) && /aiCont: !isSuper\(a\.role\) && features\.ai_assistant !== false && aiSeat/.test(server));
  // Nimeni altcineva nu duce la adresa veche.
  const toate = [];
  const umbla = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) umbla(p); else if (/\.tsx?$/.test(f.name)) toate.push(p); } };
  umbla(path.join(ROOT, 'mobile/src'));
  const vechi = toate.filter((p) => /route\(['"`]\/ai['"`?]|href=["']\/ai["']|['"`]\/ai['"`]\s*:/.test(fs.readFileSync(p, 'utf8'))).map((p) => path.relative(ROOT, p));
  T('nicio altă cale nu duce la /ai (nici bulă, nici filă)', vechi.length === 0, vechi.join(', '));
  T('bara de jos n-are chatul vechi', !/\/ai\b/.test(citeste('mobile/src/components/TabBar.tsx')));
  T('adresaAnunt nu duce la adresa veche', !/['"`]\/ai['"`]/.test(S.push));
  T('ecranul n-are bara de file (caseta stă pe zona sigură)', !/path === '\/insight'/.test(S.app));
  T('butonul „înapoi" închide sertarul și foile, nu ecranul', /useInapoiInchide\(sertar,/.test(S.ecran) && /useInapoiInchide\(!!foaie,/.test(S.ecran));
  T('sertarul: Conversație nouă, căutare, conversațiile pe zile, Redenumește, Șterge, rândul pachetului', ['class="insp-nou"', 'class="insp-cauta-r"', 'class="insp-zi"', 'title="Redenumește"', 'title="Șterge"', 'class={\'insp-fond\''].every((x) => S.ecran.indexOf(x) >= 0));
  T('foaia de suport din meniu rămâne calea veche (`/api/support`), până vine fereastra cererilor', /support: \(message: string\) => api\('\/api\/support'/.test(S.endpoints));
}

function parteaCulorilor() {
  sect('10. Culorile, măsurate pe ambele teme, și așezarea');
  const hex = (h) => { const m = String(h).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]; return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16)); };
  const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const vars = (bloc) => { const o = {}; (bloc.match(/--[a-z0-9-]+:\s*[^;]+;/gi) || []).forEach((x) => { const m = x.match(/(--[a-z0-9-]+):\s*([^;]+);/i); o[m[1]] = m[2].trim(); }); return o; };
  const tokI = vars(taie(S.tokens, ':root, :root[data-theme="dark"] {', '}')), tokD = Object.assign({}, tokI, vars(taie(S.tokens, ':root[data-theme="light"] {', '}')));
  const cssI = vars(taie(S.css, '.insp {', '}')), cssD = Object.assign({}, cssI, vars(taie(S.css, ':root[data-theme="light"] .insp {', '}')));
  const TEME = [['închisă', Object.assign({}, tokI, cssI)], ['deschisă', Object.assign({}, tokD, cssD)]];
  const TEXTE = ['--text-primary', '--text-secondary', '--i-mov', '--i-verde', '--i-ok', '--i-albastru', '--i-fond-w'];
  const FONDURI = ['--bg-panel', '--bg-card', '--bg-dark', '--bg-darkest'];
  for (const [nume, t] of TEME) {
    for (const tx of TEXTE) for (const fn of FONDURI) {
      const c = contrast(hex(t[tx]), hex(t[fn]));
      T('tema ' + nume + ': ' + tx + ' pe ' + fn + ' = ' + c.toFixed(2) + ' (≥ 4,5)', c >= 4.5, t[tx] + ' / ' + t[fn]);
    }
    T('tema ' + nume + ': textul închis #06210F pe verdele casei', contrast(hex('#06210F'), hex(t['--accent'])) >= 4.5);
    for (const tx of ['--i-rosu', '--i-galben']) T('tema ' + nume + ': ' + tx + ' pe cartonaș', contrast(hex(t[tx]), hex(t['--bg-panel'])) >= 4.5, t[tx]);
  }
  T('tema deschisă: INSTANT #166534, ANALIZĂ #6d28d9 (perechile de pe web)', cssD['--i-verde'] === '#166534' && cssD['--i-mov'] === '#6d28d9' && /\.chat-ins-et\.ai \{ color: #6d28d9; \}/.test(citeste('public/css/app.css')) && /\.chat-ins-et\.instant \{ color: #166534; \}/.test(citeste('public/css/app.css')));
  T('fără verde deschis pe alb: --accent nu e folosit ca text', !/(^|[^-])color: var\(--accent\)/m.test(S.css), (S.css.match(/(^|[^-])color: var\(--accent\)[^\n]*/m) || [''])[0]);
  T('--text-muted nu e text aici (pe tema deschisă iese 4,2 pe fundalul discuției)', !/[^-]color: var\(--text-muted\)/.test(S.css));
  T('temele: doar variabilele casei, fără body.dark și fără color-mix (WebView-uri vechi)', !/body\.dark|color-mix/.test(S.css));
  T('fontul: niciunul nou, fără monospace', !/font-family|monospace/.test(S.css));
  // Așezarea: nimic nu trece de ecran la 360 px.
  T('coloana răspunsului se poate strânge (minmax(0, 1fr)), iar textul lung se rupe', /grid-template-columns: 26px minmax\(0, 1fr\)/.test(S.css) && /\.insp-a \.bub \{[^}]*overflow-wrap: anywhere/.test(S.css));
  T('rândul casetei și cartonașele nu împing ecranul (min-width: 0)', ['.chat-unelte', '.chat-rap', '.chat-prop', '.chat-prob', '.chat-gata', '.chat-prop-w', '.chat-raps', '.chat-probs'].every((k) => new RegExp(k.replace('.', '\\.') + ' \\{[^}]*min-width: 0').test(S.css)));
  T('…pe ecranul îngust, „Sursă externă" = globul și „7 din 10" (ca pe web), numele rămâne pentru cititorul de ecran', /aria-label=\{sursa\.nume/.test(S.ecran) && !/class="nm"/.test(S.ecran) && /\.chat-un\.chat-sursa \.nm \{ display: none; \}/.test(citeste('public/css/app.css')));
  T('continuările derulează în lături DOAR în rândul lor', /\.chat-urm \{[^}]*overflow-x: auto/.test(S.css));
  T('caseta stă pe zona sigură și deasupra tastaturii', /\.insp-scrie \{[^}]*calc\(10px \+ max\(var\(--sab\), var\(--insp-kb, 0px\)\)\)/.test(S.css) && /visualViewport/.test(S.ecran) && /--insp-kb/.test(S.ecran));
  T('sertarul: închis fără umbră, deschis cu umbră (nicio fâșie gri)', !/^\.insp-st \{[^}]*box-shadow/m.test(S.css) && /\.insp\.st-deschis \.insp-st \{[^}]*box-shadow/.test(S.css) && /^\.insp-st \{[^}]*translateX\(-104%\)/m.test(S.css));
  T('regulile nu ating alte ecrane: fără `.azi` sau `.insp ` generice în afara ecranului, nimic din chat.css rescris', !/^\.azi \{/m.test(S.css) && !/^\.chat-(msg|chip|bar|send|wrap|scroll|intro)\b/m.test(S.css));
  // Iconițele folosite există.
  const nume = new Set(Array.from(S.icon.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*): '/gm)).map((m) => m[1]));
  const folosite = new Set();
  [S.ecran, S.bula, S.prop].forEach((s) => { for (const m of s.matchAll(/<Icon name="([a-zA-Z]+)"/g)) folosite.add(m[1]); for (const m of s.matchAll(/ic="([a-zA-Z]+)"/g)) folosite.add(m[1]); for (const m of s.matchAll(/'([a-zA-Z]+)' as IconName/g)) folosite.add(m[1]); });
  for (const m of S.lib.matchAll(/ic: '([a-zA-Z]+)'/g)) folosite.add(m[1]);
  const harta = (S.lib.match(/const ICONE_FA[^{]*\{([\s\S]*?)\};/) || ['', ''])[1];
  for (const m of harta.matchAll(/'fa-[a-z-]+': '([a-zA-Z]+)'/g)) folosite.add(m[1]);
  const lipsa = Array.from(folosite).filter((x) => !nume.has(x));
  T('toate iconițele folosite (' + folosite.size + ') există în Icon.tsx', lipsa.length === 0 && folosite.size > 15, lipsa.join(', '));
  const can = citeste('can_icons.js');
  T('can_icons.js e regenerat: are iconițele noi (poarta le compară octet cu octet)', ['globe', 'arrowUp', 'ellipsis', 'thumbsUp', 'thumbsDown', 'brain', 'note', 'externalLink', 'cornerDown', 'circleCheck', 'circleInfo', 'comments'].every((k) => new RegExp('^  ' + k + ": '", 'm').test(can) && nume.has(k)));
}

function parteaDesenului() {
  sect('11. Ecranele, desenate în HTML (doar cu preact)');
  if (!PREACT) { SARI('desenul bulei, al cartonașului și al ecranului', CA_IN_CI ? 'PROBA_CA_IN_CI=1' : 'mobile/node_modules nu e instalat'); return; }
  const { preact, hooks, jsxRt, rts } = PREACT;
  const h = preact.h;
  const rezolva = (rel, id) => {
    const baza = path.posix.join(path.posix.dirname(rel), id);
    for (const ext of ['.ts', '.tsx']) if (fs.existsSync(path.join(ROOT, baza + ext))) return baza + ext;
    return baza;
  };
  const me = { value: { full_name: 'Alin Tîlvăr', permissions: { viewReports: true }, features: {}, isSuper: false } };
  const stubs = {
    preact, 'preact/hooks': hooks, 'preact/jsx-runtime': jsxRt,
    'preact-iso': { useLocation: () => ({ route() {}, query: {}, path: '/insight', url: '/insight' }) },
    '../app/store': { me, showToast() {} }, '../lib/export': { exportHistoryReport() {} },
    '../api/endpoints': { Api: new Proxy({}, { get: () => () => new Promise(() => {}) }) },
    '../components/FlotaUi': { Confirma: () => null }, '../lib/inapoiFoaie': { useInapoiInchide() {} },
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
  const B = inc(F.bula), PR = inc(F.prop), E = inc(F.ecran), TX = inc(F.text);
  const l = { trimite() {}, buton() {}, ruta() {}, plus() {}, nota() {}, propunere() {}, editeaza() {} };
  const r = (x) => rts.renderToString(x);
  const INS = { fel: 'ai', nume: 'RA Insight', eticheta: 'Analiză', detaliu: '1 întrebare' };
  const RAP = { id: 7, tip: 'trips', label: 'Foaie de parcurs', vehicul: 'B 1 ABC', perioada: 'azi', pana: '09.11', kpi: [{ et: 'Curse', val: '3' }], note: ['Raportul e tăiat.'], gol: true };
  const htm = r(h(B.BulaAi, { l, m: { id: 3, text: '## Titlu\n**Gros** <script>alert(1)</script> *ital*', feedback: 1, extra: {
    source: 'ai', insigna: INS, inteles: [{ text: 'B 1 ABC', mem: true }, { text: 'azi' }], rapoarte: [RAP],
    sursa: { titlu: 'Surse de pe internet', text: 'Căutat la 10:00', surse: [{ url: 'https://exemplu.ro/a', titlu: 'Pagina A', site: 'exemplu.ro' }, { url: 'javascript:alert(2)', titlu: 'Rea' }], ceAmCautat: 'Ce am căutat: X' },
    propunere: { id: 5, stare: 'propusa', fel: 'alerta', ic: 'fa-bell', titlu: 'Pun o alertă', randuri: [{ l: 'Peste', v: '120 km/h', b: true }], dovT: 'Din ultimele 30 de zile', dovezi: [{ nivel: 'w', text: 'De 3 ori peste prag' }], nuSeSchimba: 'Nimic altceva', poate: true, butonDa: 'Da, pune alerta', campuri: { prag: 120, imei: '', nume: 'A', min: 30, max: 250, optiuni: [{ v: '', t: 'Toată flota' }] }, sub: 'Sub text' },
    actiuni: [{ fel: 'ecran', ecran: 'alerts', text: 'Deschide Alerte', ic: 'fa-bell' }, { fel: 'ramura', ramura: 'safedrive', text: 'Vezi RA Drive' }],
    probleme: [{ grav: 'rosu', titlu: 'Viteză 159', dovada: 'la 14:32', nota: 'Nota de sub', butoane: [{ fel: 'traseu', text: 'Vezi pe hartă', imei: '1' }, { fel: 'echipa', text: 'Anunță echipa RA Track', imei: '1' }, { fel: 'ramura', ramura: 'x', text: 'Fără drum' }] }],
    verificat: true, verificatText: 'Cifrele din aplicație.', nota: 'Am citit altă perioadă.', alege: [{ text: 'B 2', trimite: 'B 2' }], sources: [{ type: 'trips', label: 'Foaie de parcurs', imei: '1', vehicle: 'B 1' }],
  } } }));
  const ordine = ['chat-ins-cap', 'ins-tit', 'chat-raps', 'insp-txt', 'chat-se', 'chat-prop-w', 'chat-actiuni', 'chat-probs', 'chat-ok', 'chat-nota', 'ins-alege', 'insp-surse', 'chat-act'];
  const poz = ordine.map((c) => htm.indexOf(c + '"') < 0 ? htm.indexOf(c) : htm.indexOf(c + '"'));
  T('bula: toate părțile, în ordinea paginii', poz.every((x) => x >= 0) && poz.every((x, i) => !i || x > poz[i - 1]), J(ordine.map((c, i) => [c, poz[i]])));
  T('…textul serverului e text: <script> nu ajunge ca etichetă', htm.indexOf('<script>') < 0 && htm.indexOf('&lt;script>') >= 0, htm.slice(htm.indexOf('insp-txt'), htm.indexOf('insp-txt') + 200));
  T('…linkul rău nu se desenează, cel bun iese cu toate atributele', htm.indexOf('javascript:') < 0 && htm.indexOf('Rea') < 0 && /href="https:\/\/exemplu\.ro\/a"[^>]*target="_blank"[^>]*rel="noopener noreferrer nofollow"/.test(htm));
  T('…îngroșat, titlu, italic', htm.indexOf('<b>Gros</b>') >= 0 && htm.indexOf('insp-md-h') >= 0 && htm.indexOf('<em>ital</em>') >= 0);
  T('…insigna din server, cu clasele ei', /chat-ins-et ai">Analiză</.test(htm) && htm.indexOf('1 întrebare') >= 0);
  T('…cartonașul raportului: titlu, cifre, „fără rânduri", două butoane, Istoric, nota', ['Foaie de parcurs · B 1 ABC · azi', 'Curse', 'fără rânduri', 'Deschide raportul', 'Descarcă Excel', 'E și în Istoric rapoarte, până pe 09.11.', 'Raportul e tăiat.'].every((x) => htm.indexOf(x) >= 0));
  T('…problema: titlu, dovadă, butoanele cu drum, nota; cel fără drum lipsește', ['Viteză 159', 'la 14:32', 'Vezi pe hartă', 'Anunță echipa RA Track', 'Nota de sub'].every((x) => htm.indexOf(x) >= 0) && htm.indexOf('Fără drum') < 0);
  T('…`actiuni`: cu drum da; `ramura` fără pagină, nu', htm.indexOf('Deschide Alerte') >= 0 && htm.indexOf('Vezi RA Drive') < 0);
  T('…„ținut minte": creierașul pe rândul din discuție', /class="mem"><svg/.test(htm));
  T('…👍 aprins după `feedback`', /chat-ib on"[^>]*title="Răspuns bun"/.test(htm));
  const pdes = r(h(PR.CartonasPropunere, { p: { id: 5, stare: 'propusa', titlu: 'Șofer', masina: { nr: 'B 1', rest: 'Logan' }, sofer: { de: 'Ion', la: 'Mihai' }, deCand: 'de azi', la: 3, poate: true, alternative: [{ id: 4, nume: 'Vasile', text: 'Vasile · B' }], dovezi: [{ nivel: 'ok', text: 'Are B' }], butonDa: 'Da, trece-l' }, onGata() {}, laButon() {} }));
  T('cartonașul de șofer: mașina, de la → la, de când, Da / Schimbă / Nu', ['Mașina', 'B 1', ' · Logan', 'Ion', '→', 'Mihai', 'de azi', 'Are B', 'Da, trece-l', 'Schimbă', '>Nu<'].every((x) => pdes.indexOf(x) >= 0), pdes);
  const pgata = r(h(PR.CartonasPropunere, { p: { id: 5, stare: 'aplicata', titlu: 'Șofer', imei: '1', sofer: { la: 'Mihai' }, apasat: 'Ai apăsat Da · 10:00', ramasMs: 90000, gata: { text: '**Mihai** e pe B 1', jurnal: 'E în jurnal.' } }, onGata() {}, laButon() {} }));
  T('după „Da": „Gata" cu îngroșat, „Anulează · mai ai 1:30", fișa mașinii, jurnalul; fără Da/Nu', /<b>Mihai<\/b> e pe B 1/.test(pgata) && pgata.indexOf('Anulează · mai ai 1:30') >= 0 && pgata.indexOf('Vezi fișa mașinii') >= 0 && pgata.indexOf('E în jurnal.') >= 0 && pgata.indexOf('Ai apăsat Da · 10:00') >= 0 && pgata.indexOf('>Nu<') < 0, pgata);
  const pdisc = r(h(PR.CartonasPropunere, { p: { id: 5, stare: 'anulata', titlu: 'T', sofer: {}, anulareText: 'Am anulat tot.', apasat: 'Anulată' }, onGata() {}, laButon() {} }));
  T('anulat: textul serverului', pdisc.indexOf('Am anulat tot.') >= 0 && pdisc.indexOf('fără șofer') >= 0);
  const prm = r(h(PR.CartonasPropunere, { p: { id: 5, stare: 'aplicata', titlu: 'T', randuri: [], ramasMs: 0, gata: { text: 'Gata', buton: { fel: 'ramura', ramura: 'safedrive', text: 'Vezi RA Drive' } } }, onGata() {}, laButon() {} }));
  T('„Gata" cu buton spre o pagină care nu e pe telefon: răspunsul rămâne, butonul lipsește, fără „Anulează" la capăt', prm.indexOf('Gata') >= 0 && prm.indexOf('Vezi RA Drive') < 0 && prm.indexOf('Anulează') < 0);
  const u1 = r(h(B.BulaOm, { text: 'Întrebare <b>x</b>', l }));
  T('bula omului: text, Editează, Copiază', u1.indexOf('Întrebare &lt;b>x&lt;/b>') >= 0 && u1.indexOf('Editează întrebarea') >= 0 && u1.indexOf('Copiază întrebarea') >= 0, u1);
  T('continuările: textul lor', r(h(B.Urmari, { urmari: [{ text: 'Și ieri?' }, { trimite: 'Doar' }, { text: 'C' }, { text: 'D' }], l })).split('<button').length - 1 === 3);
  T('Md: bloc gol, listă', r(h(TX.Md, { text: 'a\n\n- b' })).indexOf('insp-md-li') >= 0);
  const scr = r(h(E.Insight, {}));
  T('ecranul, la intrare: salutul, caseta, butoanele, sertarul, „⋯"', ['Salut, Alin! Cu ce te pot ajuta?', 'Ce probleme are flota?', 'Km săptămâna trecută', 'Ce acte expiră?', 'Scrie o întrebare sau cere un raport…', 'Conversație nouă', 'Caută în conversații', 'aria-label="Mai multe"', 'aria-label="Conversații"', 'chat-caseta'].every((x) => scr.indexOf(x) >= 0), scr.slice(0, 600));
  T('…ecran de sine stătător: fără bara de file în el', scr.indexOf('tabbar') < 0 && /screen insp/.test(scr));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 12. Pe server pornit, prin clientul HTTP adevărat al telefonului (api/client.ts + api/endpoints.ts), cu cheia lui de la
//     /api/mobile/login. Serverul: o firmă pe Basic, patru mașini, un administrator cu cont, un manager fără. Modelul e simulat și numărat.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PORT = 3531, TCP = 5531;
const BASE = 'http://127.0.0.1:' + PORT;
const DIR = path.join(os.tmpdir(), 'rax_telinsight_' + process.pid);
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
let srv = null, srvIesit = null, jurnal = '';
function pornesteServerul() {
  fs.writeFileSync(PRELOAD, [
    "const fs = require('fs');",
    'const orig = globalThis.fetch;',
    'globalThis.fetch = async function (url, opts) {',
    "  const u = String((url && url.url) || url);",
    "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
    "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, String((opts && opts.body) || '').slice(0, 200) + '\\n'); } catch (e) {}",
    "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
    '  }',
    "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
    '  return orig.apply(this, arguments);',
    '};',
  ].join('\n'));
  fs.writeFileSync(AI_LOG, '');
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_tel_insight', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
  });
  ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
  srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  srv.stderr.on('data', (x) => { jurnal = (jurnal + x).slice(-3000); });
  srv.on('error', (e) => { if (srvIesit === null) srvIesit = 'nu a pornit: ' + e.message; });
  srv.on('exit', (c, s) => { srvIesit = c != null ? c : (s || 'oprit'); });
}
const nModel = () => { try { return fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return -1; } };
async function parteaServerului() {
  sect('12. Pe server pornit, prin clientul HTTP al telefonului');
  let pornit = false;
  for (let i = 0; i < 480 && srvIesit === null; i++) {
    try { if ((await fetch(BASE + '/api')).ok) { pornit = true; break; } } catch (e) { /* încă pornește */ }
    await sleep(500);
  }
  T('serverul pornește', pornit, (srvIesit !== null ? 's-a oprit singur (' + srvIesit + '). ' : '') + jurnal.slice(-1500));
  if (!pornit) return;
  // Sesiunea noastră, pentru pregătire.
  const r0 = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (r0.headers.getSetCookie ? r0.headers.getSetCookie() : [r0.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, b) => { const x = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await x.json(); } catch (e) { /* */ } return { s: x.status, j: j || {} }; };
  await R('POST', '/api/ai/config', { key: 'sk-ant-proba-fara-retea' });
  const co = (await R('POST', '/api/companies', { name: 'Firma Telefon SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/settings', { ai_pachet: { cod: 'basic' } });
  const MAS = [['350000000081001', 'Dacia Logan', 'B 101 TEL'], ['350000000081002', 'Ford Transit', 'B 202 TEL']];
  await R('POST', '/api/devices/import', { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
  for (const m of MAS) await R('PUT', '/api/devices/' + m[0] + '/company', { company_id: co.id });
  const t0 = Date.now();
  for (let k = 0; k < 4; k++) await R('POST', '/api/test/simulate', { imei: MAS[0][0], name: MAS[0][1], speed: k < 3 ? 50 : 0, io: { ignition: k < 3 ? 1 : 0 }, ts: new Date(t0 - (4 - k) * 60000).toISOString(), lat: 44.43 + k * 0.002, lng: 26.1 });
  const PAROLA = 'Str4da-Verde-2026';
  const om = async (username, role) => {
    const r = await R('POST', '/api/users', { username, full_name: 'Maria ' + username.split('@')[0], role, company_id: co.id });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, BASE);
    return r.j;
  };
  const adm = await om('sef@telefon.ro', 'company_admin');
  const man = await om('dispecer@telefon.ro', 'manager');
  await R('PUT', '/api/users/' + adm.id + '/ai-seat', { on: true });

  // Clientul telefonului, în forma din browser (fără Capacitor), cu adresa probei.
  const hook = {};
  const client = modul(F.client, { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } }, { fetch: (...a) => hook.fetch(...a) });
  hook.fetch = (url, op) => fetch(BASE + url, op);
  const Api = modul(F.endpoints, { './client': client }).Api;
  const tel = async (u) => { const r = await Api.mobileLogin(u, PAROLA, 'proba'); client.setAuthToken(r.token); return r; };

  const lg = await tel('sef@telefon.ro');
  T('autentificarea telefonului: cheia lui', !!lg.token);
  const me = await Api.me();
  T('/api/me: `aiCont` la omul cu cont', me.aiCont === true, J(me.aiCont));
  const q = await Api.aiQuota();
  const st = L.stareDinQuota(q, false);
  T('/api/ai/quota: pachetul, cu textele serverului; rândul de jos', !!st.pachet && st.pachet.nume === 'Basic' && st.fond.text === 'Basic · ' + st.pachet.scurt && st.contor === st.pachet.scurt && !st.peReguli, J(st));
  const azi = await Api.insightAzi();
  T('„Azi la tine": rândurile de la server, un clic pe rând', Array.isArray(azi.randuri) && azi.randuri.every((rd) => typeof rd.text === 'string' && Array.isArray(rd.butoane)) && azi.randuri.length <= 3, J(azi).slice(0, 300));
  azi.randuri.forEach((rd) => { const b = L.aziPrimul(rd, L.areAi(st.peReguli, st.pachet), true); if (b) T('…rândul are un drum: ' + b.fel, !!L.aziActiune(b), J(b)); });
  const raps = await Api.insightRapoarte();
  T('„Raport" din „+": lista serverului, cu textul de pus în casetă', (raps.rapoarte || []).length > 10 && raps.rapoarte.every((x) => /^Fă-mi raportul „/.test(x.pune)));
  const dev = L.masiniAlegere(await Api.devices());
  T('„Mașina" din „+": mașinile omului', dev.length === 2 && dev[0].pune === 'B 101 TEL' && dev[0].text === 'B 101 TEL · Dacia Logan', J(dev));

  // Un raport cerut în cuvinte.
  const j1 = await Api.insightIntreaba(L.corpIntrebare('Fă-mi foaia de parcurs pentru B 101 TEL, azi', {}));
  const m1 = L.mesajDinRaspuns(j1), p1 = L.planBula(m1);
  T('raportul cerut în cuvinte: cartonașul, fără text, cu insigna serverului', p1.carduri.length === 1 && p1.carduri[0].label === 'Foaie de parcurs' && !p1.text && !!p1.insigna && p1.ordine.indexOf('rapoarte') >= 0, J(p1.ordine));
  T('…cartonașul are tot ce desenează telefonul', ['id', 'label', 'vehicul', 'perioada', 'pana', 'kpi'].every((k) => p1.carduri[0][k] !== undefined), J(p1.carduri[0]));
  const h1 = await Api.reportHistoryItem(p1.carduri[0].id);
  T('„Deschide raportul": îl găsește Istoricul (aceeași rută ca Rapoartele)', !!(h1 && h1.report && Array.isArray(h1.report.rows)), J(h1).slice(0, 200));
  T('…conversația vine în răspuns, ca și mesajul', !!j1.conversatieId && !!j1.mesajId);
  T('…continuările, de la server', (j1.urmari || []).length > 0 && j1.urmari.every((u) => u.text));
  // Continuarea, de pe buton, în aceeași conversație.
  const j2 = await Api.insightIntreaba(L.corpIntrebare(j1.urmari[0].trimite || j1.urmari[0].text, { buton: true, conversatieId: j1.conversatieId }));
  T('continuarea, pe buton, în aceeași conversație', j2.conversatieId === j1.conversatieId && L.planBula(L.mesajDinRaspuns(j2)).carduri.length === 1, J(j2).slice(0, 200));
  // Conversațiile.
  const l1 = await Api.insightConversatii('');
  T('conversațiile omului: cu titlu și zi', (l1.conversatii || []).length === 1 && !!l1.conversatii[0].titlu && !!l1.conversatii[0].actualizat_la && L.grup(l1.conversatii[0].actualizat_la) === 'Azi', J(l1).slice(0, 200));
  const l2 = await Api.insightConversatii('nu-exista-asa-ceva');
  T('căutarea: nimic, când nimic nu se potrivește', (l2.conversatii || []).length === 0);
  const c1 = await Api.insightConversatie(j1.conversatieId);
  T('redeschisă: aceleași mesaje, în ordine', (c1.mesaje || []).length === 4 && c1.mesaje[0].rol === 'user' && c1.mesaje[1].rol === 'assistant');
  T('…bula redeschisă arată la fel ca cea de pe loc', J(L.planBula(c1.mesaje[1]).ordine) === J(p1.ordine) && JC(L.planBula(c1.mesaje[1]).carduri) === JC(p1.carduri), JC(L.planBula(c1.mesaje[1]).carduri) + ' / ' + JC(p1.carduri));
  await Api.insightFeedback(j1.mesajId, -1);
  T('👎 se ține minte în conversație', (await Api.insightConversatie(j1.conversatieId)).mesaje[1].feedback === -1);
  await Api.insightFeedback(j1.mesajId, 0);
  await Api.insightRedenumeste(j1.conversatieId, 'Numele meu');
  T('redenumirea', (await Api.insightConversatii('')).conversatii[0].titlu === 'Numele meu');

  // Cartonașul alertei: Schimbă, dovezile, Da, Anulează, 409.
  const ja = await Api.insightIntreaba(L.corpIntrebare('Anunță-mă când B 101 TEL trece de 120 km/h', {}));
  const pa = ja.propunere || {};
  T('cartonașul alertei: `fel`, rândurile, „Schimbă" din `campuri`, dovezile', pa.fel === 'alerta' && pa.stare === 'propusa' && Array.isArray(pa.randuri) && !!pa.campuri && Array.isArray(pa.dovezi) && pa.poate === true, J(pa).slice(0, 500));
  T('…planul îl desenează, cu fraza deasupra', L.planBula(L.mesajDinRaspuns(ja)).ordine.indexOf('propunere') >= 0);
  const start = L.campuriStart(pa);
  T('…câmpurile din „Schimbă" pornesc din server', start.prag === String(pa.campuri.prag) && start.imei === String(pa.campuri.imei), J(start));
  const dv = await Api.insightActiune(pa.id, 'dovezi', { prag: '110', imei: start.imei });
  T('…pragul schimbat: dovezile vin din nou', Array.isArray(dv.dovezi) && dv.dovezi.length > 0, J(dv));
  const ap = await Api.insightActiune(pa.id, 'aplica', { campuri: Object.assign({}, start, { prag: '110', nume: '' }) });
  T('„Da": starea, „Gata", ceasul lui „Anulează"', ap.propunere && ap.propunere.stare === 'aplicata' && ap.propunere.gata && ap.propunere.gata.text && ap.propunere.ramasMs > 0 && L.rutaButon(ap.propunere.gata.buton) === '/admin/alerts', J(ap).slice(0, 400));
  let dublu = null;
  try { await Api.insightActiune(pa.id, 'aplica', {}); } catch (e) { dublu = e; }
  T('a doua apăsare: 409, iar eroarea poartă starea de acum (ApiError.data)', dublu && dublu.status === 409 && dublu.data && dublu.data.propunere && dublu.data.propunere.stare === 'aplicata', dublu && J({ s: dublu.status, d: dublu.data }));
  const an = await Api.insightActiune(pa.id, 'anuleaza');
  T('„Anulează": starea și textul serverului', an.propunere && an.propunere.stare === 'anulata' && !!an.text && !!an.propunere.anulareText, J(an).slice(0, 300));
  const cAl = await Api.insightConversatie(ja.conversatieId);
  const mAl = cAl.mesaje.filter((m) => m.extra && m.extra.propunere)[0];
  T('…redeschisă, conversația arată starea de ACUM a cartonașului', mAl && mAl.extra.propunere.stare === 'anulata', mAl && J(mAl.extra.propunere).slice(0, 200));
  // Un cartonaș refuzat.
  const jn = await Api.insightIntreaba(L.corpIntrebare('Anunță-mă când B 202 TEL trece de 130 km/h', { conversatieId: ja.conversatieId }));
  const rf = await Api.insightActiune(jn.propunere.id, 'refuza');
  T('„Nu": starea serverului; fraza pleacă din bulă', rf.propunere.stare === 'refuzata' && !L.planBula({ id: 1, text: 'x', extra: { propunere: rf.propunere } }).text);

  // Notițele.
  const n0 = await Api.insightNotite();
  T('notițele: administratorul le poate scrie', n0.poateScrie === true && n0.max > 0, J(n0));
  await Api.saveInsightNotite('Motorina e 7,30 lei.');
  T('…se țin minte', (await Api.insightNotite()).text === 'Motorina e 7,30 lei.');

  await Api.insightSterge(j1.conversatieId);
  let sters = null;
  try { await Api.insightConversatie(j1.conversatieId); } catch (e) { sters = e; }
  T('ștearsă: 404, iar o întrebare pe ea primește `reply` în corpul erorii', sters && sters.status === 404);
  let e404 = null;
  try { await Api.insightIntreaba(L.corpIntrebare('Ce a făcut flota ieri?', { conversatieId: j1.conversatieId })); } catch (e) { e404 = e; }
  T('…corpul erorii ajunge la telefon', e404 && e404.status === 404 && e404.data && !!e404.data.reply, e404 && J(e404.data));

  // Omul fără cont: pe telefon (cheie) vine 200 cu seatMissing.
  await tel('dispecer@telefon.ro');
  const man2 = await Api.me();
  T('omul fără cont: `aiCont` fals, „Agenți AI" rămâne în meniu', man2.aiCont === false);
  const lm = await Api.insightConversatii('');
  T('…conversațiile: refuzul, cu textul serverului („Pachet și conturi")', /Pachet și conturi/.test(String(L.textFaraLoc(lm))), J(lm));
  T('…„Azi la tine" nu apare (`seatMissing`)', (await Api.insightAzi()).seatMissing === true);
  const qm = await Api.aiQuota();
  T('…`seat: false` în /api/ai/quota', qm.seat === false, J(qm).slice(0, 200));

  // Fondatorul: fără pachet, fără „Azi la tine".
  client.setAuthToken((await Api.mobileLogin('admin', 'test1234', 'proba')).token);
  const qs = await Api.aiQuota();
  T('fondatorul: „Fondator · fără limită"', L.stareDinQuota(qs, true).contor === 'Fondator · fără limită' && L.stareDinQuota(qs, true).fond.text === 'Fondator · fără limită', J(qs).slice(0, 200));
  T('…„Azi la tine": gol, cu `platforma`', (await Api.insightAzi()).platforma === true);
  T('ZERO cereri către model', nModel() === 0, String(nModel()));
}

let terminat = false;
function curata() {
  for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) { /* */ } }
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
process.on('uncaughtException', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });
process.on('unhandledRejection', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });
for (const semnal of ['SIGINT', 'SIGTERM']) process.on(semnal, () => { rele++; console.log('\n  ✗ proba a fost oprită (' + semnal + ')'); gata(); });

(async () => {
  pornesteServerul();   // se încălzește cât rulează bucățile fără server
  for (const [nume, f] of [['pachetul', pachetSiContorul], ['textul', parteaTextului], ['bula', parteaBulei], ['cererile', parteaCererilor], ['butoanele', parteaButoanelor], ['textele', parteaTextelor], ['navigarea', parteaNavigarii], ['culorile', parteaCulorilor], ['desenul', parteaDesenului], ['serverul', parteaServerului]]) {
    // O parte care crapă se numără ca picată și nu le ascunde pe celelalte.
    try { await f(); } catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
})().catch((e) => { rele++; console.log('  ✗ EROARE: ' + ((e && e.stack) || e)); }).then(gata);
