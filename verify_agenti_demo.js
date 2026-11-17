// verify_agenti_demo.js — telefonul cu agenții AI de pe prima pagină (17.11; Alin, la cele trei machete: „hai să facem varianta B să o
// testez"; macheta https://claude.ai/artifact/E2G99v9is5kxgLpF2HKowC).
//
//   node verify_agenti_demo.js
//
// Ce păzește:
//   1. pagina: în capitolul „Inteligență artificială", partea 2, cele șase butoane (ordinea, numele, iconițele din aplicație) și locul
//      telefonului, cu foaia și scriptul lui; cartonașele vechi au plecat; puntea are aceleași iconițe;
//   2. ce scrie în telefon e ce scrie aplicația: numele, rolurile, descrierile (AGENTS din agents.js), iconițele (AGP_META), etichetele
//      paginii agentului (agpOpen, agpLiveRefresh, _agpClientCard);
//   3. constatările = ce scriu AGENȚII ADEVĂRAȚI: îi rulează pe flota de probă (agenti_demo_flota.js), la ora din telefon, și compară
//      titlul, textul, culoarea și ordinea fiecăruia, plus cartonașul lui RA Client;
//   4. textele telefonului: fără „24/7" / „non-stop", fără prețuri, fără „gratuit" / „tokeni", fără numele furnizorului de AI;
//   5. în browser (dacă e Chromium): telefonul se desenează, trece singur la agentul următor, un clic alege agentul, totul încape în
//      telefon la fiecare agent, nimic nu iese din ecran la 360 px, iar cu „mai puțină mișcare" nu se schimbă singur.
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
T('…și descrierea de pe site, cu „RA Watch verifică flota în fiecare oră" (din oră în oră, ca în server)', /Verifică flota în fiecare oră: vehicule care nu mai transmit/.test(BUT[0] ? BUT[0][4] : '') && /setInterval\(runAgentsWorker, 60 \* 60 \* 1000\)/.test(rd('server.js')));
T('locul telefonului și „Exemplu cu o flotă de probă" sub el', /<div class="agd-tel-loc"><\/div>\s*<span class="ri-exemplu">Exemplu cu o flotă de probă<\/span>/.test(BLOC));
T('cele șase cartonașe de dinainte (.agents-grid / .agent) au plecat, cu foaia lor', !/class="agents-grid"|class="agent reveal"|\.agents-grid\{|\.agent\{/.test(faraCom(L)));
const PUNTE = intre(SEC, '<div class="ai-punte-ic" aria-hidden="true">', '</div>');
T('puntea „Azi la tine": aceleași iconițe, în aceeași ordine', [...PUNTE.matchAll(/fa-solid ([a-z-]+)/g)].map((m) => m[1]).join() === ORDINE.map((k) => META[k] && META[k].icon).join(), PUNTE);

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
T('titlul listei: ca în aplicație („Disponibile acum", „Scadențe acum"…, „Verificări & alerte" la RA Watch)',
  D.every((a) => a.live ? FH.includes(a.k + ": '" + a.fh + "'") : (a.fh === 'Verificări & alerte' && IX.includes("feedHead = 'Verificări &amp; alerte'"))), FH);
const APP = DEMO._APP;
const AGP = intre(IX, 'window.agpOpen = function (k) {', '// Constatare RA Care legată de o mentenanță');
const LIVEF = intre(IX, 'window.agpLiveRefresh = async function (k) {', '// ── Tutorial per agent');
const CL = intre(IX, 'function _agpClientCard(s) {', 'window.agpLiveRefresh');
T('etichetele paginii agentului: „Toți agenții", „activ", „Rulează", „Cum funcționează", „Toate văzute (N)"',
  AGP.includes('<i class="fas fa-arrow-left"></i> ' + APP.inapoi + '</button>') && AGP.includes('<span class="agp-status">' + APP.activ + '</span>') &&
  AGP.includes('<i class="fas fa-bolt"></i> ' + APP.ruleaza + '</button>') && AGP.includes('<i class="fas fa-circle-question"></i> ' + APP.cum + '</button>') &&
  AGP.includes(APP.toateVazute + " (' + fs.length + ')") && APP.bara === 'Agenți AI' && IX.includes("<i class=\"fas fa-robot\" style=\"margin-right:8px;color:var(--accent);\"></i> Agenți AI</span>"));
T('„Se verifică flota…" și subsolurile: „Ultima rulare: azi …" la RA Watch, „Verificat: … · se actualizează…" la ceilalți',
  LIVEF.includes('<i class="fas fa-spinner fa-spin"></i> ' + APP.scan + '</div>') && AGP.includes("'" + APP.ultimaRulare + "<b>' + _agpWhen(lastMs)") &&
  AGP.includes("'" + APP.automat.slice(3) + "'") && LIVEF.includes("'<i class=\"fas fa-clock\"></i> " + APP.verificat + "<b>' + when + '</b>" + APP.seActualizeaza + "'"));
T('cartonașul lui RA Client: aceleași etichete ca _agpClientCard', ['km', 'active', 'nefolosite', 'ieri'].every((k) => CL.includes("'" + APP.client[k] + "'")) &&
  CL.includes(APP.client.top + '<b>') && CL.includes(APP.client.ydKm + '<b>') && CL.includes('>' + APP.client.deVerificat + '</div>'));
T('ora din telefon = ora la care rulează agenții pe flota de probă; RA Watch a rulat la ora fixă de dinainte („acum 30m", ca _agpAgo)',
  DEMO.ORA === String(FL.ORA_TELEFON.h).padStart(2, '0') + ':' + String(FL.ORA_TELEFON.m).padStart(2, '0') && DEMO.RULARE === String(FL.ORA_TELEFON.h).padStart(2, '0') + ':00' &&
  DEMO.ACUM_RULARE === 'acum ' + FL.ORA_TELEFON.m + 'm' && /if \(s < 3600\) return 'acum ' \+ Math\.round\(s \/ 60\) \+ 'm';/.test(IX) && DEMO.ZILE_ITP === FL.ZILE_ITP && DEMO.ZILE_RCA === FL.ZILE_RCA);

(async () => {
  console.log('\n3. Constatările = ce scriu agenții adevărați pe flota de probă');
  const R = await FL.ruleaza(Date.now());
  T('flota de probă: aceeași oră ca telefonul', R.now === NOW);
  for (const a of D) {
    const f = R.findings.filter((x) => x.agent === a.k);
    if (a.k === 'client') {
      const s = R.meta.client && R.meta.client.summary;
      T('RA Client: cartonașul zilei (km, active, nefolosite, față de ieri, cel mai activ, ieri, „De verificat")', JSON.stringify(s) === JSON.stringify(a.sumar), { agent: s, telefon: a.sumar });
      continue;
    }
    const ag = f.map((x) => [x.severity, x.title, x.body]), tel = a.f.map((x) => [x.s, x.t, x.b]);
    T(a.nume + ': ' + a.f.length + (a.f.length === 1 ? ' constatare' : ' constatări') + ', aceleași texte, culori și ordine', JSON.stringify(ag) === JSON.stringify(tel), { agent: ag, telefon: tel });
  }
  T('…și nimic în plus: ce scriu agenții e tot în telefon', R.findings.filter((x) => x.agent !== 'client').length === D.reduce((n, a) => n + (a.f ? a.f.length : 0), 0));

  console.log('\n4. Textele telefonului');
  const TXT = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  T('fără „24/7" / „non-stop" (RA Watch verifică din oră în oră)', !/24\/7|non-?stop/i.test(TXT));
  T('fără numele furnizorului de AI, „gratuit", „tokeni", prețuri de abonament', !/Claude|Anthropic|gratuit|tokeni|lei\s*\/\s*lun|€/i.test(TXT));
  T('cu diacritice (ș, ț cu virgulă, nu cu sedilă)', !/[şţŞŢ]/.test(JS));
  T('textele se pun cu textContent (niciun innerHTML în telefon)', !/innerHTML/.test(TXT));
  T('stilul telefonului e pe clase „agd-" (rama: a telefonului RA Insight)', !/^\.(?!agd|ri-)[a-z]/m.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')) && /\.agd-tel \.ri-bt/.test(CSS));
  T('„mai puțină mișcare": fără schimbări singure și fără animații', /var MISCARE = !\(window\.matchMedia/.test(JS) && /@media \(prefers-reduced-motion: reduce\)/.test(CSS) && /if \(!MISCARE\) return;/.test(JS));

  console.log('\n5. În browser: se desenează, trece singur, clicul, încape, 360 px, „mai puțină mișcare"');
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
    T('…care arată „1.240 km" și „7/8", ca aplicația', await p.evaluate(() => [...document.querySelectorAll('.agd-tile b')].map((b) => b.textContent).slice(0, 2).join('|')) === '1.240 km|7/8');
    await p.click('.agd-dv button:nth-of-type(2)');
    T('…iar „2 scadențe · RA Care" din „De verificat" deschide RA Care (ca în aplicație)', await astepta(p, () => /RA Care/.test(document.querySelector('.agd-head b').textContent), null, 3000));
    await p.hover('.agd-tel');
    const inainte = await ales(p); await p.waitForTimeout(9500);
    T('…mouse-ul pe telefon îl oprește pe loc (nu trece mai departe)', (await ales(p)) === inainte, [inainte, await ales(p)]);
    T('fără erori în pagină', p._erori.length === 0, p._erori);
    await p.context().close();
    // Fără mișcare: totul pe loc, fără schimbări singure; încape tot în telefon la fiecare agent (pe calculator și la 360 px).
    for (const [w, h] of [[1366, 900], [360, 760]]) {
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
  } catch (e) { T('proba din browser a mers până la capăt', false, e && e.message); }
  finally { try { await br.close(); } catch (e) {} srv.close(); }
  gata();
})().catch((e) => { T('proba a mers până la capăt', false, e && e.stack); gata(); });

function gata() {
  console.log('\n' + (rele ? '✗' : '✓') + ' telefonul cu agenții AI: ' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exitCode = rele ? 1 : 0;
}
