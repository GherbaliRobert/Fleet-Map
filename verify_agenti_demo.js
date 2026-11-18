// verify_agenti_demo.js — telefonul cu agenții AI de pe prima pagină (17.11; Alin, la cele trei machete: „hai să facem varianta B să o
// testez"; macheta https://claude.ai/artifact/E2G99v9is5kxgLpF2HKowC).
//
//   node verify_agenti_demo.js
//
// Ce păzește:
//   1. pagina: în capitolul „Inteligență artificială”, partea 2, cele șase butoane (ordinea, numele, iconițele din aplicație) și locul
//      telefonului, cu foaia și scriptul lui; cartonașele vechi au plecat; puntea are aceleași iconițe;
//   2. ce scrie în telefon e ce scrie aplicația: numele, rolurile, descrierile (AGENTS din agents.js), iconițele (AGP_META), etichetele
//      paginii agentului (agpOpen, agpLiveRefresh, _agpClientCard);
//   3. constatările = ce scriu AGENȚII ADEVĂRAȚI: îi rulează pe flota de probă (agenti_demo_flota.js), la ora din telefon, și compară
//      titlul, textul, culoarea și ordinea fiecăruia, plus cartonașul lui RA Client;
//   4. textele telefonului: fără „24/7” / „non-stop”, fără prețuri, fără „gratuit” / „tokeni”, fără numele furnizorului de AI;
//   5. în browser (dacă e Chromium): telefonul se desenează, trece singur la agentul următor, un clic alege agentul, totul încape în
//      telefon la fiecare agent, iar cu „mai puțină mișcare” nu se schimbă singur;
//   6. pe tabletă și pe telefon (≤ 1000 px; 18.11, Alin: „1. da, 2. da”): în locul telefonului desenat, cartonașele paginii „Agenți AI”
//      din aplicație — insigna și rândul de stare scrise de _agpSortate / _agpInsigna / _agpStatusLine (proba le rulează pe ce scriu
//      agenții), două coloane pe tabletă, un rând pe agent pe telefon, se deschid la atingere, încap la 360 px.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const rd = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const L = rd('public/landing.html'), IX = rd('public/index.html'), JS = rd('public/js/agenti-demo.js'), CSS = rd('public/css/agenti-demo.css');
const AG = require('./agents'), FL = require('./agenti_demo_flota');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(typeof detaliu === 'string' ? detaliu : JSON.stringify(detaliu)).slice(0, 500) : '')); }
}
const intre = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };
const faraCom = (h) => String(h).replace(/<!--[\s\S]*?-->/g, '');
const dec = (s) => String(s).replace(/&amp;/g, '&');

// Telefonul, încărcat ca în pagină (fără DOM: doar datele lui).
const ctx = { window: { matchMedia: () => ({ matches: false }) }, document: undefined, console, Intl };
vm.runInNewContext(JS, ctx);
const DEMO = ctx.window.AgentiDemo;
const ORDINE = ['watch', 'care', 'optimize', 'compliance', 'client', 'dispatch'];

console.log('\n1. Pagina: cele șase butoane și locul telefonului');
const SEC = faraCom(intre(L, '<section class="section section-ri" id="ra-insight">', '</section>'));
const BLOC = intre(SEC, '<div class="agd" data-agenti-demo>', '<div class="ai-parte ai-parte-pk');
T('scriptul și foaia telefonului sunt încărcate de prima pagină', L.includes('<link rel="stylesheet" href="/css/agenti-demo.css">') && L.includes('<script src="/js/agenti-demo.js" defer></script>') && !!DEMO);
T('telefonul stă în capitol, după titlul părții 2 (#agenti-ai) și înaintea pachetelor', !!BLOC && SEC.indexOf('id="agenti-ai"') < SEC.indexOf('data-agenti-demo') && SEC.indexOf('data-agenti-demo') < SEC.indexOf('ai-parte ai-parte-pk'));
const BUT = [...BLOC.matchAll(/<button type="button" class="agd-b" data-k="([a-z]+)"><span class="agd-b-ic" aria-hidden="true"><i class="fa-solid ([a-z-]+)"><\/i><\/span><span class="agd-b-n">([^<]+)<\/span><span class="agd-b-d">([^<]+)<\/span><\/button>/g)];
T('șase butoane, în ordinea de pe site: RA Watch, Care, Optimize, Compliance, Client, Dispatch', BUT.map((m) => m[1]).join() === ORDINE.join(), BUT.map((m) => m[1]));
const META = {};
for (const m of IX.matchAll(/^\s+(watch|dispatch|care|optimize|compliance|client):\s+\{ name: '([^']+)',\s+icon: '([a-z-]+)'/gm)) META[m[1]] = { name: m[2], icon: m[3] };
T('pagina aplicației are AGP_META pentru toți șase', ORDINE.every((k) => META[k]), META);
T('pe butoane: numele din agents.js și iconițele din aplicație (AGP_META)', BUT.every((m) => AG.AGENTS[m[1]] && m[3] === AG.AGENTS[m[1]].name && META[m[1]] && m[2] === META[m[1]].icon), BUT.map((m) => m[1] + ':' + m[2] + ':' + m[3]));
T('…și descrierea de pe site, cu „RA Watch verifică flota în fiecare oră” (din oră în oră, ca în server)', /Verifică flota în fiecare oră: vehicule care nu mai transmit/.test(BUT[0] ? BUT[0][4] : '') && /setInterval\(runAgentsWorker, 60 \* 60 \* 1000\)/.test(rd('server.js')));
T('locul telefonului și „Exemplu cu o flotă de probă” sub el', /<div class="agd-tel-loc"><\/div>\s*<span class="ri-exemplu">Exemplu cu o flotă de probă<\/span>/.test(BLOC));
T('cele șase cartonașe de dinainte (.agents-grid / .agent) au plecat, cu foaia lor', !/class="agents-grid"|class="agent reveal"|\.agents-grid\{|\.agent\{/.test(faraCom(L)));
// 18.11 (găsit pe drum, Alin: „fă-le cum le-ai propus”): pagina „Agenți AI” de pe site spune rolurile cu numele din aplicație
// (era „Paznicul”, „Dispeceratul”, „Condusul economic”…, iar prima pagină și aplicația „Supraveghere”, „Dispecerat”, „Condus economic”).
const PAG_AGENTI = rd('public/agenti-ai.html');
const ROLURI = [...PAG_AGENTI.matchAll(/<div class="rol">([^<]+)<\/div>\s*<h3>([^<]+)<\/h3>/g)].map((m) => [m[2], m[1]]);
T('/agenti-ai: rolul fiecărui agent = cel din aplicație (agents.js)', ROLURI.length === 6 && ROLURI.every(([n, r]) => { const k = Object.keys(AG.AGENTS).find((x) => AG.AGENTS[x].name === n); return k && AG.AGENTS[k].role === r; }), ROLURI);
const PUNTE = intre(SEC, '<div class="ai-punte-ic" aria-hidden="true">', '</div>');
T('puntea „Azi la tine”: aceleași iconițe, în aceeași ordine', [...PUNTE.matchAll(/fa-solid ([a-z-]+)/g)].map((m) => m[1]).join() === ORDINE.map((k) => META[k] && META[k].icon).join(), PUNTE);

console.log('\n2. Ce scrie în telefon e ce scrie aplicația');
const NOW = FL.flota(Date.now()).now;
const D = DEMO._date(NOW);
T('cei șase, în ordinea butoanelor', D.map((a) => a.k).join() === ORDINE.join());
for (const a of D) {
  const A = AG.AGENTS[a.k];
  T(a.nume + ': numele, rolul și descrierea din agents.js; iconița din AGP_META', A && a.nume === A.name && a.rol === A.role && a.desc === A.desc && META[a.k] && a.ic === META[a.k].icon,
    { demo: [a.nume, a.rol, a.desc, a.ic], app: A && [A.name, A.role, A.desc, META[a.k] && META[a.k].icon] });
}
const LIVE = (IX.match(/var LIVE_AGENT_KEYS = \[([^\]]+)\]/) || [])[1] || '';
T('care se verifică la deschiderea paginii (LIVE_AGENT_KEYS din pagină) și care rulează din oră în oră (RA Watch)', D.every((a) => a.live === LIVE.includes("'" + a.k + "'")), LIVE);
const FH = (IX.match(/var _fh = \{([^}]+)\}/) || [])[1] || '';
T('titlul listei: ca în aplicație („Disponibile acum”, „Scadențe acum”…, „Verificări & alerte” la RA Watch)',
  D.every((a) => a.live ? FH.includes(a.k + ": '" + a.fh + "'") : (a.fh === 'Verificări & alerte' && IX.includes("feedHead = 'Verificări &amp; alerte'"))), FH);
const APP = DEMO._APP;
const AGP = intre(IX, 'window.agpOpen = function (k) {', '// Constatare RA Care legată de o mentenanță');
const LIVEF = intre(IX, 'window.agpLiveRefresh = async function (k) {', '// ── Tutorial per agent');
const CL = intre(IX, 'function _agpClientCard(s) {', 'window.agpLiveRefresh');
T('etichetele paginii agentului: „Toți agenții”, „activ”, „Rulează”, „Cum funcționează”, „Toate văzute (N)”',
  AGP.includes('<i class="fas fa-arrow-left"></i> ' + APP.inapoi + '</button>') && AGP.includes('<span class="agp-status">' + APP.activ + '</span>') &&
  AGP.includes('<i class="fas fa-bolt"></i> ' + APP.ruleaza + '</button>') && AGP.includes('<i class="fas fa-circle-question"></i> ' + APP.cum + '</button>') &&
  AGP.includes(APP.toateVazute + " (' + fs.length + ')") && APP.bara === 'Agenți AI' && IX.includes("<i class=\"fas fa-robot\" style=\"margin-right:8px;color:var(--accent);\"></i> Agenți AI</span>"));
T('„Se verifică flota…” și subsolurile: „Ultima rulare: azi …” la RA Watch, „Verificat: … · se actualizează…” la ceilalți',
  LIVEF.includes('<i class="fas fa-spinner fa-spin"></i> ' + APP.scan + '</div>') && AGP.includes("'" + APP.ultimaRulare + "<b>' + _agpWhen(lastMs)") &&
  AGP.includes("'" + APP.automat.slice(3) + "'") && LIVEF.includes("'<i class=\"fas fa-clock\"></i> " + APP.verificat + "<b>' + when + '</b>" + APP.seActualizeaza + "'"));
T('cartonașul lui RA Client: aceleași etichete ca _agpClientCard', ['km', 'active', 'nefolosite', 'ieri'].every((k) => CL.includes("'" + APP.client[k] + "'")) &&
  CL.includes(APP.client.top + '<b>') && CL.includes(APP.client.ydKm + '<b>') && CL.includes('>' + APP.client.deVerificat + '</div>'));
// Cartonașul din pagina „Agenți AI” (18.11): o regulă, în funcții, pe care le folosește pagina și le rulează proba (mai jos).
const GRID = intre(IX, 'var cards = keys.map(function (k, i) {', "}).join('');");
T('pagina „Agenți AI” face cartonașul cu _agpSortate / _agpCate / _agpInsigna / _agpStatusLine (o singură regulă)',
  /var fs = _agpSortate\(byAgent\[k\]\);/.test(GRID) && /var summaryCount = _agpCate\(k, fs\);/.test(GRID) && /var ins = _agpInsigna\(k, fs\);/.test(GRID) &&
  /_agpStatusLine\(k, last, summaryCount\)/.test(GRID) && !/semnalări/.test(GRID), GRID.slice(0, 300));
const APPF = (() => {
  const bloc = intre(IX, 'function _agpTime(t) {', 'window.renderAgentsPage = async function');
  const rde = intre(IX, 'function _rDe(n) {', '// Aceleași sume, dar pentru celule de tabel');
  const c = { console, Date, Math, String, Number, Object, Array };
  vm.runInNewContext('var _agpLastRun = {}, _agpOptEvaluated = null, _agpCompMonitored = null;\n' + rde + '\n' + bloc +
    '\nthis.f = { _agpSortate: _agpSortate, _agpCate: _agpCate, _agpInsigna: _agpInsigna, _agpStatusLine: _agpStatusLine, _agpSevCol: _agpSevCol };', c);
  return c.f;
})();
T('…și funcțiile se pot rula singure (proba le are)', !!(APPF && APPF._agpInsigna && APPF._agpStatusLine));
// 18.11 (găsit pe drum): fila „Acces” a firmei ia numele și descrierile agenților din AGP_META (sursa unică), nu din a doua listă.
T('fila „Acces” a firmei: agenții din AGP_META, în ordinea AGP_ORDER — fără a doua listă cu texte vechi',
  /function _raxAgs\(\) \{\s+var M = window\.AGP_META \|\| \{\}, ord = window\.AGP_ORDER/.test(IX) && /_raxAgs\(\)\.map\(function \(a\)/.test(IX) && /window\.AGP_ORDER = AGP_ORDER;/.test(IX) &&
  !/_RAX_AGS|Vehicule offline \+|Eco-driving — scor șofer|Raport zilnic automat/.test(IX.replace(/^\s*\/\/[^\n]*$/gm, '')));
T('ora din telefon = ora la care rulează agenții pe flota de probă; RA Watch a rulat la ora fixă de dinainte („acum 30 min”, ca _agpAgo)',
  DEMO.ORA === String(FL.ORA_TELEFON.h).padStart(2, '0') + ':' + String(FL.ORA_TELEFON.m).padStart(2, '0') && DEMO.RULARE === String(FL.ORA_TELEFON.h).padStart(2, '0') + ':00' &&
  DEMO.ACUM_RULARE === 'acum ' + FL.ORA_TELEFON.m + ' min' && /if \(s < 3600\) return 'acum ' \+ Math\.round\(s \/ 60\) \+ ' min';/.test(IX) && DEMO.ZILE_ITP === FL.ZILE_ITP && DEMO.ZILE_RCA === FL.ZILE_RCA);

(async () => {
  console.log('\n3. Constatările = ce scriu agenții adevărați pe flota de probă');
  const R = await FL.ruleaza(Date.now());
  T('flota de probă: aceeași oră ca telefonul', R.now === NOW);
  for (const a of D) {
    const f = R.findings.filter((x) => x.agent === a.k);
    if (a.k === 'client') {
      const s = R.meta.client && R.meta.client.summary;
      T('RA Client: cartonașul zilei (km, active, nefolosite, față de ieri, cel mai activ, ieri, „De verificat”)', JSON.stringify(s) === JSON.stringify(a.sumar), { agent: s, telefon: a.sumar });
      continue;
    }
    const ag = f.map((x) => [x.severity, x.title, x.body]), tel = a.f.map((x) => [x.s, x.t, x.b]);
    T(a.nume + ': ' + a.f.length + (a.f.length === 1 ? ' constatare' : ' constatări') + ', aceleași texte, culori și ordine', JSON.stringify(ag) === JSON.stringify(tel), { agent: ag, telefon: tel });
  }
  // 17.11 (găsit la inventarul site-ului): cele două telefoane de pe prima pagină nu arată aceleași cifre (ar părea copiate).
  const RIJS = rd('public/js/ra-insight-demo.js');
  const ieri = (RIJS.match(/Ieri: <b>([\d.]+) km<\/b>/) || [])[1], cl = D.find((a) => a.k === 'client').sumar;
  const nrRo = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  T('cifrele zilei diferă de cele din telefonul RA Insight de pe aceeași pagină (km, cel mai activ)', !!ieri && ieri !== nrRo(cl.totalKm) && !RIJS.includes(nrRo(cl.top.km) + ' km'), { ieri, azi: cl.totalKm, top: cl.top.km });
  // Cartonașul de pe tabletă și telefon: insigna și rândul de stare, scrise de funcțiile paginii pe constatările agenților (RA Watch a rulat
  // la ora fixă de dinainte, ceilalți acum — ca în aplicație: constatările lor live primesc ora verificării).
  const ACUM = Date.now(), fara = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  for (const a of D) {
    const fsr = R.findings.filter((x) => x.agent === a.k).map((x) => Object.assign({}, x, { created_at: new Date(a.live ? ACUM : ACUM - FL.ORA_TELEFON.m * 60000).toISOString() }));
    const s = APPF._agpSortate(fsr), ins = APPF._agpInsigna(a.k, s), lin = APPF._agpStatusLine(a.k, s[0], APPF._agpCate(a.k, s));
    const linDemo = a.card.l.map((p) => (typeof p === 'string' ? p : p.b)).join('') + (a.card.tm ? ' · ' + a.card.tm : '');
    const bApp = [...lin.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]), bDemo = a.card.l.filter((p) => typeof p !== 'string').map((p) => p.b);
    T(a.nume + ', cartonașul: insigna „' + a.card.ins + '” și rândul „' + linDemo + '”, ca în pagina „Agenți AI”',
      !ins.ok && ins.t === a.card.ins && ins.sev === a.card.s && fara(lin) === linDemo && JSON.stringify(bApp) === JSON.stringify(bDemo) &&
      lin.includes('background:' + APPF._agpSevCol(a.card.s)), { aplicatie: [ins.t, ins.sev, fara(lin), bApp], site: [a.card.ins, a.card.s, linDemo, bDemo] });
  }
  T('…și nimic în plus: ce scriu agenții e tot în telefon', R.findings.filter((x) => x.agent !== 'client').length === D.reduce((n, a) => n + (a.f ? a.f.length : 0), 0));

  console.log('\n4. Textele telefonului');
  const TXT = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  T('fără „24/7” / „non-stop” (RA Watch verifică din oră în oră)', !/24\/7|non-?stop/i.test(TXT));
  T('fără numele furnizorului de AI, „gratuit”, „tokeni”, prețuri de abonament', !/Claude|Anthropic|gratuit|tokeni|lei\s*\/\s*lun|€/i.test(TXT));
  T('cu diacritice (ș, ț cu virgulă, nu cu sedilă)', !/[şţŞŢ]/.test(JS));
  T('textele se pun cu textContent (niciun innerHTML în telefon)', !/innerHTML/.test(TXT));
  T('stilul telefonului e pe clase „agd-” (rama: a telefonului RA Insight)', !/^\.(?!agd|ri-)[a-z]/m.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')) && /\.agd-tel \.ri-bt/.test(CSS));
  T('„mai puțină mișcare”: fără schimbări singure și fără animații', /var MISCARE = !\(window\.matchMedia/.test(JS) && /@media \(prefers-reduced-motion: reduce\)/.test(CSS) && /if \(!MISCARE\) return;/.test(JS));

  console.log('\n5. În browser: se desenează, trece singur, clicul, încape, 360 px, „mai puțină mișcare”');
  let pw = null; try { pw = require('playwright'); } catch (e) {}
  let br = null;
  if (pw) { try { br = await pw.chromium.launch(); } catch (e) { br = null; } }
  if (!br) { console.log('  ⤼ sărit (fără Chromium aici)'); return gata(); }
  const TIP = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const PUBD = path.join(__dirname, 'public');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(String(req.url || '/').split('?')[0]);
    const f = path.join(PUBD, u === '/' ? 'landing.html' : u);
    if (!f.startsWith(PUBD)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TIP[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  const pagina = async (w, h, redus) => {
    const c = await br.newContext({ viewport: { width: w, height: h }, reducedMotion: redus ? 'reduce' : 'no-preference', timezoneId: 'Europe/Bucharest' });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await c.addInitScript(() => { try { localStorage.setItem('ra_consent_v1', 'denied'); } catch (e) {} });
    const p = await c.newPage(); p._erori = [];
    p.on('pageerror', (e) => p._erori.push(e.message));
    return p;
  };
  const astepta = async (p, fn, arg, ms) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const ales = (p) => p.evaluate(() => { const b = document.querySelector('.agd-b[aria-pressed="true"]'); return b && b.getAttribute('data-k'); });
  try {
    let p = await pagina(1366, 900, false);
    await p.goto(B + '/landing.html', { waitUntil: 'load' });
    await p.evaluate(() => document.getElementById('agenti-ai').scrollIntoView());
    T('telefonul se desenează, pe RA Watch, cu cele trei constatări', await astepta(p, () => document.querySelectorAll('.agd-tel .agd-fi:not(.agd-scan):not(.agd-ascuns)').length === 3 && /RA Watch/.test(document.querySelector('.agd-head b').textContent), null, 6000));
    await p.mouse.move(2, 2);
    T('…trece singur la agentul următor (RA Care)', await astepta(p, () => (document.querySelector('.agd-b[aria-pressed="true"]') || {}).getAttribute && document.querySelector('.agd-b[aria-pressed="true"]').getAttribute('data-k') === 'care', null, 12000));
    await p.click('.agd-b[data-k="client"]');
    T('un clic alege agentul: RA Client, cu cartonașul zilei', await astepta(p, () => /RA Client/.test(document.querySelector('.agd-head b').textContent) && !!document.querySelector('.agd-tiles') && !document.querySelector('.agd-scan'), null, 4000));
    T('…care arată „1.185 km” și „7/8”, ca aplicația (punctul miilor, „7/8” lipit)', await p.evaluate(() => [...document.querySelectorAll('.agd-tile b')].map((b) => b.textContent).slice(0, 2).join('|')) === '1.185 km|7/8');
    await p.click('.agd-dv button:nth-of-type(2)');
    T('…iar „2 scadențe · RA Care” din „De verificat” deschide RA Care (ca în aplicație)', await astepta(p, () => /RA Care/.test(document.querySelector('.agd-head b').textContent), null, 3000));
    await p.hover('.agd-tel');
    const inainte = await ales(p); await p.waitForTimeout(9500);
    T('…mouse-ul pe telefon îl oprește pe loc (nu trece mai departe)', (await ales(p)) === inainte, [inainte, await ales(p)]);
    T('fără erori în pagină', p._erori.length === 0, p._erori);
    await p.context().close();
    // Fără mișcare: totul pe loc, fără schimbări singure; încape tot în telefon la fiecare agent (pe calculator și la 360 px).
    for (const [w, h] of [[1366, 900]]) {
      p = await pagina(w, h, true);
      await p.goto(B + '/landing.html', { waitUntil: 'load' });
      await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
      await p.evaluate(() => document.getElementById('agenti-ai').scrollIntoView());
      await p.waitForTimeout(300);
      const lat = await p.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
      T(w + ' px: nimic nu iese din ecran', lat[1] <= lat[0], lat);
      const nu = [];
      for (const k of ['watch', 'care', 'optimize', 'compliance', 'client', 'dispatch']) {
        await p.click('.agd-b[data-k="' + k + '"]'); await p.waitForTimeout(80);
        const m = await p.evaluate(() => {
          const corp = document.querySelector('.agd-corp'), feed = corp.querySelector('.agd-feed'), ult = feed.lastElementChild;
          const jos = (ult.querySelector('.agd-dv') ? ult.querySelector('.agd-dv').lastElementChild : ult).getBoundingClientRect().bottom;
          return { k: document.querySelector('.agd-b[aria-pressed="true"]').getAttribute('data-k'), loc: Math.round(corp.getBoundingClientRect().bottom - 6 - jos), scan: !!document.querySelector('.agd-scan') };
        });
        if (m.k !== k || m.loc < 0 || m.scan) nu.push(k + ':' + JSON.stringify(m));
      }
      T(w + ' px, fără mișcare: fiecare agent e desenat pe loc și încape în telefon', nu.length === 0, nu);
      if (w === 1366) { const a0 = await ales(p); await p.waitForTimeout(9500); T('fără mișcare: nu trece singur la alt agent', (await ales(p)) === a0); }
      T(w + ' px: fără erori în pagină', p._erori.length === 0, p._erori);
      await p.context().close();
    }

    console.log('\n6. Pe tabletă și pe telefon: cartonașele C (18.11)');
    const cart = (p) => p.evaluate(() => {
      const v = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
      const l = document.querySelector('.agd-cart-l');
      return { b: v('.agd-lista'), tel: v('.agd-tel-col'), cart: v('.agd-cart'), ind: v('.agd-cart-ind'), cols: l ? getComputedStyle(l).gridTemplateColumns.split(' ').length : 0,
        n: document.querySelectorAll('.agd-cr').length, h: Math.round((document.querySelector('.agd-cart') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
        lat: [document.documentElement.clientWidth, document.documentElement.scrollWidth] };
    });
    p = await pagina(1366, 900, true);
    await p.goto(B + '/landing.html', { waitUntil: 'load' });
    let c0 = await cart(p);
    T('1366 px: butoanele și telefonul desenat (B), fără cartonașe', c0.b && c0.tel && !c0.cart, c0);
    await p.context().close();
    for (const [w, h, cols] of [[820, 1180, 2], [402, 874, 1], [360, 760, 1]]) {
      p = await pagina(w, h, true);
      await p.goto(B + '/landing.html', { waitUntil: 'load' });
      await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
      await p.evaluate(() => document.getElementById('agenti-ai').scrollIntoView());
      c0 = await cart(p);
      T(w + ' px: cartonașele C în locul telefonului desenat, pe ' + cols + (cols === 1 ? ' coloană' : ' coloane') + (cols === 1 ? ', cu „Atinge un agent…”' : ''),
        !c0.b && !c0.tel && c0.cart && c0.n === 6 && c0.cols === cols && c0.ind === (cols === 1), c0);
      const txt = await p.evaluate(() => [...document.querySelectorAll('.agd-cr')].map((r) => [r.querySelector('.agd-cr-n b').textContent, r.querySelector('.agd-cr-n small').textContent,
        r.querySelector('.agd-cr-ins').textContent, r.querySelector('.agd-cr-lt').textContent, r.querySelector('.agd-cr-d').textContent]));
      const asteptat = D.map((a) => [a.nume, a.rol, a.card.ins, a.card.l.map((x) => (typeof x === 'string' ? x : x.b)).join('') + (a.card.tm ? ' · ' + a.card.tm : ''),
        (BUT.find((m) => m[1] === a.k) || [])[4]].map((x) => dec(x)));
      if (w === 820) T('pe cartonașe: numele, rolul, insigna, rândul de stare și descrierea de pe butoanele site-ului', JSON.stringify(txt) === JSON.stringify(asteptat), { pagina: txt, asteptat });
      const nu = [];
      for (let i = 0; i < 6; i++) {
        await p.click('.agd-cr:nth-child(' + (i + 1) + ') .agd-cr-cap'); await p.waitForTimeout(60);
        const m = await p.evaluate((i) => {
          const r = document.querySelectorAll('.agd-cr')[i], cb = r.getBoundingClientRect(), det = r.querySelector('.agd-cr-det');
          const afara = [...r.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && getComputedStyle(e).display !== 'none' && (b.right > cb.right + 0.5 || b.left < cb.left - 0.5); });
          return { deschise: document.querySelectorAll('.agd-cr.agd-cr-on').length, al: r.classList.contains('agd-cr-on'), vizibil: !det.hidden && det.getBoundingClientRect().height > 0,
            randuri: det.querySelectorAll('.agd-fi, .agd-tiles').length, exp: r.querySelector('.agd-cr-cap').getAttribute('aria-expanded'), afara: afara.length,
            sw: document.documentElement.scrollWidth };
        }, i);
        if (!(m.deschise === 1 && m.al && m.vizibil && m.randuri > 0 && m.exp === 'true' && m.afara === 0 && m.sw <= w)) nu.push(D[i].k + ':' + JSON.stringify(m));
      }
      T(w + ' px: fiecare cartonaș se deschide la atingere (unul odată), cu ce a găsit agentul, și încape', nu.length === 0, nu);
      if (w === 402) {
        await p.click('.agd-cr:nth-child(5) .agd-cr-cap');
        await p.click('.agd-cr:nth-child(5) .agd-dv button:nth-of-type(2)');
        T('…„2 scadențe · RA Care” din „De verificat” deschide cartonașul RA Care', await astepta(p, () => document.querySelector('.agd-cr.agd-cr-on .agd-cr-n b').textContent === 'RA Care', null, 2000));
        await p.click('.agd-cr.agd-cr-on .agd-cr-cap');
        const inchis = await cart(p);
        T('…închis, rândurile de pe telefon sunt mai scurte decât butoanele + telefonul desenat de dinainte (855 px)', inchis.h > 0 && inchis.h < 760, inchis.h);
      }
      T(w + ' px: nimic nu iese din ecran, fără erori în pagină', c0.lat[1] <= c0.lat[0] && p._erori.length === 0, { lat: c0.lat, erori: p._erori });
      await p.context().close();
    }
  } catch (e) { T('proba din browser a mers până la capăt', false, e && e.message); }
  finally { try { await br.close(); } catch (e) {} srv.close(); }
  gata();
})().catch((e) => { T('proba a mers până la capăt', false, e && e.stack); gata(); });

function gata() {
  console.log('\n' + (rele ? '✗' : '✓') + ' telefonul cu agenții AI: ' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exitCode = rele ? 1 : 0;
}
