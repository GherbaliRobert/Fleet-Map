// verify_chat_inteligent.js — chatul inteligent (Alin, 02.11: „1. da, 2. da, 3. da, 4. da, 5. da"; macheta
// https://claude.ai/artifact/PiQ5rQtLFmstUGuEZnE6S3): același aspect la RA Insight (clienții) și la asistentul fondatorilor.
//
//   node verify_chat_inteligent.js
//
// Ce păzește:
//   1. piesele comune (_chatGand, _chatSecunde, _chatDurata, _chatScrieTreptat, _chatMiscare) sunt scrise O DATĂ și le folosesc
//      AMÂNDOUĂ chaturile, la răspunsul abia venit (nu la o conversație redeschisă); punctele vechi („rax-typing") au plecat;
//   2. cât a durat: „1 secundă", „4 secunde", „20 de secunde" — doar la răspunsurile AI;
//   3. textul treptat: sub o secundă (800 ms pentru toate cuvintele), oprit pentru cine a cerut „mai puțină mișcare" (CSS + JS);
//   4. piesele răspunsului NU se schimbă (telefonul le oglindește — verify_telefon_insight.js): eticheta aleasă pe 19.10 (chenar
//      subțire, fără fundal) primește doar iconița; lista butoanelor de sub salut e aceeași, iconițele stau separat;
//   5. culorile, MĂSURATE pe ambele teme: rândul „✓" (B — #15803d ieșea 4,46), semnul, butonul de trimis, salutul în degrade,
//      iconițele pastilelor; întrebările gata făcute ale asistentului vin cu iconița de la server. Din 05.11 (Alin: „din movul
//      ăsta, în culorile brandului") RA Insight are culorile siglei: verdele casei + negrul „cernelii" (albul pe tema închisă) —
//      niciun mov rămas în chat;
//   6. în browser (dacă e Chromium): cuvintele pornesc stinse și se aprind toate sub o secundă, tabelul de după apare la urmă,
//      iar cu „mai puțină mișcare" totul e pe loc. În CI fără browser, partea asta se sare („⤼ sărit").
'use strict';
const fs = require('fs');
const vm = require('vm');

const PAG = fs.readFileSync(__dirname + '/public/index.html', 'utf8').replace(/\r\n/g, '\n');
const CSS = fs.readFileSync(__dirname + '/public/css/app.css', 'utf8').replace(/\r\n/g, '\n');
const AF = require('./asistent_fondatori.js');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 300) : '')); }
}
const intre = (a, b) => { const i = PAG.indexOf(a), j = PAG.indexOf(b, i + 1); return i >= 0 && j > i ? PAG.slice(i, j) : ''; };
const cate = (text, s) => text.split(s).length - 1;
const INSP = intre('// ── începe „secțiunea RA Insight" ──', '// ── sfârșit „secțiunea RA Insight" ──');
const ASF = intre('// ── începe „asistentul fondatorilor" ──', '// ── sfârșit „asistentul fondatorilor" ──');
const COMUNE = intre('// ─── Chatul inteligent (Alin, 02.11', '// ═══ RA Insight — secțiunea proprie');

console.log('\n1. Piesele comune, scrise o dată, folosite de amândouă chaturile');
T('blocurile se găsesc (RA Insight, asistentul nostru, piesele comune)', INSP.length > 1000 && ASF.length > 1000 && COMUNE.length > 500);
['_chatMiscare', '_chatGand', '_chatSecunde', '_chatDurata', '_chatScrieTreptat'].forEach((n) => {
  T('window.' + n + ' e scrisă o singură dată, în piesele comune', cate(PAG, 'window.' + n + ' = function') === 1 && COMUNE.indexOf('window.' + n + ' = function') >= 0);
});
T('RA Insight: „Mă gândesc…", cât a durat (doar AI) și textul treptat — o dată, în insightTrimite',
  cate(INSP, 'window._chatGand(') === 1 && cate(INSP, 'window._chatScrieTreptat(') === 1 && /if \(j\.insigna && j\.insigna\.fel === 'ai'\) window\._chatDurata\(rand, Date\.now\(\) - t0\)/.test(INSP)
  && INSP.indexOf('window._chatScrieTreptat(') > INSP.indexOf('window.insightTrimite = async function'));
T('asistentul nostru: la fel, o dată, în asfTrimite (semnul verde: _chatGand(\'asf-av\'))',
  cate(ASF, "window._chatGand('asf-av')") === 1 && cate(ASF, 'window._chatScrieTreptat(') === 1 && /if \(j\.insigna && j\.insigna\.fel === 'ai'\) window\._chatDurata\(rand, Date\.now\(\) - t0\)/.test(ASF)
  && ASF.indexOf('window._chatScrieTreptat(') > ASF.indexOf('window.asfTrimite = async function'));
T('conversația redeschisă se desenează întreagă (deseneazaMain nu scrie treptat)', !/_chatScrieTreptat/.test(intre('function deseneazaMain() {', '// ── „Pachet și conturi"')));
// Punctele de așteptare rămân doar la încărcarea unei PAGINI („Pachet și conturi", „Rezumă"); la răspuns e „Mă gândesc…".
const TRIM_INSP = intre('window.insightTrimite = async function', 'window.insightEditeaza = function');
const TRIM_ASF = intre('window.asfTrimite = async function', 'window.asfTasta = function');
T('punctele vechi („rax-typing") au plecat de la răspunsul amândurora (insightTrimite, asfTrimite)', TRIM_INSP.length > 500 && TRIM_ASF.length > 500 && TRIM_INSP.indexOf('rax-typing') < 0 && TRIM_ASF.indexOf('rax-typing') < 0
  && TRIM_INSP.indexOf('window._chatGand(') >= 0 && TRIM_ASF.indexOf("window._chatGand('asf-av')") >= 0);
T('„Mă gândesc…" e scris o singură dată în pagină, cu role="status"', cate(PAG, "'Mă gândesc…'") === 1 && /g\.setAttribute\('role', 'status'\)/.test(COMUNE));

console.log('\n2. Cât a durat');
const ctx = { window: {}, document: {} };
vm.runInNewContext(intre('window._chatSecunde = function', '// Lângă antetul') , ctx);
const sec = ctx.window._chatSecunde;
const cazuri = [[400, '1 secundă'], [1000, '1 secundă'], [1600, '2 secunde'], [4200, '4 secunde'], [19000, '19 secunde'], [20000, '20 de secunde'], [64000, '64 de secunde'], [100000, '100 de secunde'], [101000, '101 secunde'], [119000, '119 secunde'], [120000, '120 de secunde'], [0, '1 secundă'], [NaN, '1 secundă']];
cazuri.forEach(([ms, asteptat]) => T(ms + ' ms → „' + asteptat + '"', sec(ms) === asteptat, sec(ms)));

console.log('\n3. Textul treptat: sub o secundă, oprit pentru „mai puțină mișcare"');
const ST = intre('window._chatScrieTreptat = function', '// ═══ RA Insight');
T('bugetul: 800 ms pentru toate cuvintele (pasul între 6 și 30 ms; un text foarte lung, câte câteva deodată)', /Math\.max\(6, Math\.min\(30, Math\.floor\(800 \/ Math\.max\(1, nrCuv\)\)\)\)/.test(ST) && /Math\.ceil\(nrCuv \/ 130\)/.test(ST));
T('fără mișcare cerută (sau fără text): nimic stins, nimic întârziat', /if \(prim < 0 \|\| !window\._chatMiscare\(\)\) return;/.test(ST) && /prefers-reduced-motion: reduce/.test(intre('window._chatMiscare = function', 'window._chatGand')));
const mic = (CSS.match(/@media \(prefers-reduced-motion: reduce\) \{\n  \.insp-a \.av\.lucreaza::before[\s\S]*?\n\}/) || [''])[0];
T('CSS: inelul, intrarea, luminarea și cuvintele stinse — toate oprite la „mai puțină mișcare"', /\.insp-a \.av\.lucreaza::before, \.chat-intra \{ animation: none; \}/.test(mic) && /\.chat-gand \{ animation: none;/.test(mic) && /\.chat-w, \.chat-ascuns \{ opacity: 1;/.test(mic), mic);
T('cuvintele stinse își țin locul (opacity, nu display): nimic nu sare', /\.chat-w \{ opacity: 0;/.test(CSS) && !/\.chat-w \{[^}]*display: none/.test(CSS));

console.log('\n4. Piesele răspunsului rămân (telefonul le oglindește)');
T('eticheta aleasă pe 19.10 rămâne: chenar subțire, fără fundal (din 05.11 ANALIZĂ în negrul siglei — alb pe tema închisă —, INSTANT #166534)', /\.chat-ins-et\.ai \{ color: var\(--text-primary\); \}/.test(CSS) && /\.chat-ins-et\.instant \{ color: #166534; \}/.test(CSS) && !/body\.dark \.chat-ins-et\.ai/.test(CSS)
  && /\.chat-ins-et \{[^}]*border: 1px solid currentColor;/.test(CSS) && !/\.chat-ins-et[^{]*\{[^}]*background/.test(CSS));
T('„· N secunde" are aceeași literă ca detaliul antetului (12px, 600): altfel stă mai sus, pe alt rând de litere (03.11, poze)',
  /\.chat-ins-dur \{ font-size: 12px; font-weight: 600; color: var\(--text-secondary\); \}/.test(CSS) && /\.chat-ins-det \{ font-size: 12px; font-weight: 600; color: var\(--text-secondary\); \}/.test(CSS));
T('…și primește doar iconița: steluța la ANALIZĂ, fulgerul la INSTANT (Font Awesome)', /\.chat-ins-et\.ai::before \{ content: '\\e2ca'; \}/.test(CSS) && /\.chat-ins-et\.instant::before \{ content: '\\f0e7'; \}/.test(CSS) && /\.chat-ins-et::before \{ font-family: 'Font Awesome 6 Free'; font-weight: 900;/.test(CSS));
const carduri = vm.runInNewContext('(' + (INSP.match(/var CARDURI = (\[[\s\S]*?\]);/) || [, '[]'])[1] + ')');
const ic = vm.runInNewContext('(' + (INSP.match(/var CARDURI_IC = (\{[^\n]*\});/) || [, '{}'])[1] + ')');
T('butoanele de sub salut: aceeași listă { t, q } (ca pe telefon), iconițele separat, pentru fiecare', carduri.length === 3 && carduri.every((c) => Object.keys(c).join() === 't,q' && /^fa-[a-z-]+$/.test(ic[c.t] || '')) && /^fa-[a-z-]+$/.test(ic['Ce a făcut flota ieri?'] || ''), JSON.stringify(ic));
T('întrebările gata făcute ale asistentului nostru vin cu iconița de la server (ic), iar _chatUrmari o folosește doar dacă e „fa-…"',
  AF.INTREBARI_GATA.every((q) => /^fa-[a-z-]+$/.test(q.ic || '')) && /\/\^fa-\[a-z-\]\+\$\/\.test\(u\.ic \|\| ''\) \? u\.ic : 'fa-arrow-turn-down'/.test(PAG));
T('…și stau ca pastile pline (chat-start), sub „Azi la noi"', /prim\.appendChild\(window\._chatUrmari\(j\.intrebari, function \(q\) \{ window\.asfTrimite\(q\); \}\)\)\.classList\.add\('chat-start'\)/.test(ASF) && /\.chat-urm\.chat-start button \{[^}]*border-style: solid/.test(CSS));
T('semnul asistentului nostru: steluța, în locul servietei', /var av = el\('div', 'av asf-av'\); av\.innerHTML = '<i class="fas fa-wand-magic-sparkles"><\/i>'/.test(ASF) && ASF.indexOf('fa-briefcase') < 0);
T('salutul nostru: mare, în degrade (asf-salut)', /el\('div', 'insp-txt asf-salut'\)/.test(ASF));

console.log('\n5. Culorile, măsurate pe ambele teme');
const lum = (hex) => { const h = hex.replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Fundalurile discuției: tema deschisă (--bg-darkest, --bg-dark, --bg-panel), tema întunecată.
const FD = ['#eef2f6', '#f1f5f9', '#ffffff'], FI = ['#0B0E11', '#0E1217', '#15181D', '#181C22'];
const minim = (cul, fonduri) => Math.min.apply(null, fonduri.map((f) => contrast(cul, f)));
T('B: rândul „✓" pe tema deschisă = #166534 (≥ 4,5 pe orice fundal al discuției)', /\.chat-ok \{[^}]*color: #166534;/.test(CSS) && minim('#166534', FD) >= 4.5, minim('#166534', FD).toFixed(2));
T('…și pe tema întunecată #4ade80 (≥ 4,5)', /body\.dark \.chat-ok \{ color: #4ade80; \}/.test(CSS) && minim('#4ade80', FI) >= 4.5, minim('#4ade80', FI).toFixed(2));
const pereche = [
  ['iconița semnului RA Insight, deschis: negru (#06210F) pe verdele casei #3FE07D / #2BB763', ['#06210F', '#3FE07D'], ['#06210F', '#2BB763'], /\.insp-a \.av \{[^}]*color: #06210F; background: linear-gradient\(135deg, #3FE07D, #2BB763\)/],
  ['…întunecat: la fel', ['#06210F', '#3FE07D'], ['#06210F', '#2BB763'], /body\.dark \.insp-a \.av \{ color: #06210F; background: linear-gradient\(135deg, #3FE07D, #2BB763\)/],
  ['semnul nostru, deschis: alb pe #15803d / #0f766e', ['#ffffff', '#15803d'], ['#ffffff', '#0f766e'], /\.insp-a \.av\.asf-av \{ color: #fff; background: linear-gradient\(135deg, #15803d, #0f766e\)/],
  ['…întunecat: #06210F pe #3FE07D / #2DD4BF', ['#06210F', '#3FE07D'], ['#06210F', '#2DD4BF'], /body\.dark \.insp-a \.av\.asf-av \{ color: #06210F; background: linear-gradient\(135deg, #3FE07D, #2DD4BF\)/],
  ['săgeata de trimis la RA Insight: negru pe verdele casei (ca butonul principal)', ['#06210F', '#3FE07D'], ['#06210F', '#2BB763'], /\.chat-trimite \{[^}]*background: linear-gradient\(135deg, #3FE07D, #2BB763\); color: #06210F;/],
  ['…întunecat: la fel', ['#06210F', '#3FE07D'], ['#06210F', '#2BB763'], /body\.dark \.chat-trimite \{ background: linear-gradient\(135deg, #3FE07D, #2BB763\); color: #06210F; \}/],
  ['semnul din capul listei RA Insight, deschis: bagheta verde pe negrul siglei', ['#3FE07D', '#0B0E11'], ['#3FE07D', '#0B0E11'], /\.insp-stea \{[^}]*color: #3FE07D; background: #0B0E11; \}/],
  ['…întunecat: bagheta neagră pe verde', ['#06210F', '#3FE07D'], ['#06210F', '#3FE07D'], /body\.dark \.insp-stea \{ color: #06210F; background: #3FE07D; \}/],
  ['„NOU" din meniu: litere verzi pe negru (deschis; și pe rândul ales, verde)', ['#3FE07D', '#0B0E11'], ['#3FE07D', '#0B0E11'], /\.nav-nou \{[^}]*background: #0B0E11; color: #3FE07D;/],
  ['…întunecat: negru pe verde; pe rândul ales, din nou negru cu verde', ['#06210F', '#3FE07D'], ['#3FE07D', '#0B0E11'], /body\.dark \.nav-nou \{ background: #3FE07D; color: #06210F; \}\nbody\.dark \.nav-item\.active \.nav-nou \{ background: #0B0E11; color: #3FE07D; \}/],
  ['…la noi: #06210F pe verde', ['#06210F', '#3FE07D'], ['#06210F', '#2DD4BF'], /\.asf \.chat-trimite, body\.dark \.asf \.chat-trimite \{ background: linear-gradient\(135deg, #3FE07D, #2DD4BF\); color: #06210F; \}/]
];
pereche.forEach(([n, a, b, re]) => { const c = Math.min(contrast(a[0], a[1]), contrast(b[0], b[1])); T(n + ' (iconiță: ≥ 4,5)', re.test(CSS) && c >= 4.5, c.toFixed(2)); });
// Salutul în degrade: literă mare și groasă (≥ 3 pe fundal), pe ambele capete ale degradeului.
const salut = [
  ['salutul RA Insight, deschis: din negrul siglei în verde (#0B0E11 → #15803d), ca „R" și „A"', ['#0B0E11', '#15803d'], FD, /\.insp-salut h2 \{[^}]*background: linear-gradient\(90deg, #0B0E11, #15803d\)/],
  ['…întunecat: din alb în verdele casei (#FFFFFF → #3FE07D)', ['#FFFFFF', '#3FE07D'], FI, /body\.dark \.insp-salut h2 \{[^}]*linear-gradient\(90deg, #FFFFFF, #3FE07D\)/],
  ['salutul nostru, deschis (#15803d → #0f766e)', ['#15803d', '#0f766e'], FD, /\.asf-salut b \{[^}]*linear-gradient\(90deg, #15803d, #0f766e\)/],
  ['…întunecat (#3FE07D → #2DD4BF)', ['#3FE07D', '#2DD4BF'], FI, /body\.dark \.asf-salut b \{[^}]*linear-gradient\(90deg, #3FE07D, #2DD4BF\)/]
];
salut.forEach(([n, capete, fonduri, re]) => { const c = Math.min.apply(null, capete.map((x) => minim(x, fonduri))); T(n + ' — literă mare: ≥ 3', re.test(CSS) && c >= 3, c.toFixed(2)); });
const icoane = [['iconițele pastilelor RA Insight, deschis (#166534)', '#166534', FD, /\.insp-chip \.ic \{[^}]*color: #166534;/], ['…întunecat (#3FE07D)', '#3FE07D', FI, /body\.dark \.insp-chip \.ic \{ color: #3FE07D;/],
  ['ANALIZĂ, deschis (negrul textului)', '#0f172a', FD, /\.chat-ins-et\.ai \{ color: var\(--text-primary\); \}/], ['…întunecat (albul textului)', '#FFFFFF', FI, /\.chat-ins-et\.ai \{ color: var\(--text-primary\); \}/],
  ['„ținut minte din discuție", deschis (#166534)', '#166534', FD, /\.ins-tit \.mem \{ color: #166534; \}/], ['…întunecat (#3FE07D)', '#3FE07D', FI, /body\.dark \.ins-tit \.mem \{ color: #3FE07D; \}/],
  ['„Vezi pachetele", deschis (#166534)', '#166534', FD, /\.chat-pas\.ins \{ border-color: #16a34a; color: #166534;/], ['…întunecat (#3FE07D)', '#3FE07D', FI, /body\.dark \.chat-pas\.ins \{ border-color: #3FE07D; color: #3FE07D; \}/],
  ['„din RA Insight" (Istoric rapoarte), deschis (#166534)', '#166534', FD, /\.rh-ins \{[^}]*color: #166534;/], ['…întunecat (#3FE07D)', '#3FE07D', FI, /body\.dark \.rh-ins \{ color: #3FE07D;/],
  ['iconițele pastilelor noastre, deschis (#166534)', '#166534', FD, /\.chat-urm\.chat-start button i \{[^}]*color: #166534;/], ['…întunecat (#86efac)', '#86efac', FI, /body\.dark \.chat-urm\.chat-start button i \{ color: #86efac;/]];
icoane.forEach(([n, cul, fonduri, re]) => { const c = minim(cul, fonduri); T(n + ' (≥ 4,5)', re.test(CSS) && c >= 4.5, c.toFixed(2)); });
// 05.11 (Alin: „din movul ăsta, în culorile brandului"): niciun mov rămas în regulile lui RA Insight (secțiunea, chatul, „Azi la
// tine", paginile ramurilor, pachetele, meniul, Istoric rapoarte, „Rezumă") și nici în blocul paginii. Movul rămâne doar în afara lui
// (comutatorul Fondator / Partener, stările cererilor, rolurile).
const MOV = /#6d28d9|#7c3aed|#8b5cf6|#a78bfa|#c4b5fd|#5b21b6|#818cf8|#4f46e5|#a5b4fc|#4338ca|#1e1033|#160b2e|#1b1036|var\(--purple\b|rgba\(\s*124,\s*58,\s*237|rgba\(\s*167,\s*139,\s*250|rgba\(\s*109,\s*40,\s*217/i;
const ALE_INSIGHT = /\.insp|\.chat-|\.ins-|\.azi-|\.sdp|\.nav-nou|#nav-insight|\.rh-ins|\.rep-rezumat|\.pkc-|\.rau-ra|#rax-main-fab|\.asf/;
const cuMov = []; CSS.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, corp) => { if (ALE_INSIGHT.test(sel) && MOV.test(corp)) cuMov.push(sel.trim().slice(-60)); return m; });
T('niciun mov în regulile lui RA Insight (culorile siglei: verdele casei + negrul „cernelii")', cuMov.length === 0, cuMov.slice(0, 5).join(' | '));
T('…nici în blocul paginii (secțiunea RA Insight)', INSP.length > 1000 && !MOV.test(INSP), (INSP.match(MOV) || [''])[0]);
T('…pe tema închisă butonul de trimis GOL rămâne gri („body.dark .chat-trimite" are 2 clase + body și bătea „.chat-trimite.gol")', /body\.dark \.chat-trimite\.gol \{ background: var\(--bg-dark\); color: var\(--text-secondary\); \}/.test(CSS));
T('…și la asistentul nostru (05.11): „.asf .chat-trimite.gol" pe ambele teme', /\.asf \.chat-trimite\.gol, body\.dark \.asf \.chat-trimite\.gol \{ background: var\(--bg-dark\); color: var\(--text-secondary\); \}/.test(CSS));

(async () => {
  console.log('\n6. În browser: cuvintele se aprind sub o secundă; cu „mai puțină mișcare", pe loc');
  let pw = null; try { pw = require('playwright'); } catch (e) {}
  let br = null;
  if (pw) { try { br = await pw.chromium.launch(); } catch (e) { br = null; } }
  if (!br) { console.log('  ⤼ sărit (fără Chromium aici)'); }
  else {
    try {
      const html = '<!doctype html><html><head><style>' + (CSS.match(/\.chat-w \{[^}]*\}\n\.chat-w\.v \{[^}]*\}\n\.chat-ascuns \{[^}]*\}\n\.chat-arata \{[^}]*\}/) || [''])[0] + '</style></head><body>' +
        '<div class="insp-a" id="r"><div class="av"></div><div class="bub"><div class="chat-ins-cap">RA Insight</div><div class="asf-tit">Titlul răspunsului, scurt.</div><div class="asf-tab" id="tab">tabel</div>' +
        '<div class="insp-txt"><p>Un răspuns de probă cu <b>cuvinte îngroșate</b> și destul text ca să se vadă cum apare.</p></div><div class="chat-ok" id="ok">ok</div></div></div><div class="chat-urm" id="urm">continuări</div>' +
        '<script>' + COMUNE + '</script></body></html>';
      for (const redus of [false, true]) {
        const pg = await br.newPage({ reducedMotion: redus ? 'reduce' : 'no-preference' });
        await pg.setContent(html);
        const r0 = await pg.evaluate(() => { const row = document.getElementById('r'); window._chatScrieTreptat(row, document.getElementById('urm'));
          const w = Array.from(document.querySelectorAll('.chat-w')); return { cuv: w.length, aprinse: w.filter((x) => x.classList.contains('v')).length, tab: document.getElementById('tab').className, urm: document.getElementById('urm').className, cap: document.querySelector('.chat-ins-cap').className, text: document.querySelector('.insp-txt').textContent }; });
        await pg.waitForTimeout(1300);
        const r1 = await pg.evaluate(() => { const w = Array.from(document.querySelectorAll('.chat-w')); return { cuv: w.length, aprinse: w.filter((x) => x.classList.contains('v')).length, tab: document.getElementById('tab').className, urm: document.getElementById('urm').className }; });
        if (!redus) {
          T('la început: cuvintele stinse, tabelul și continuările ascunse, antetul pe loc', r0.cuv > 15 && r0.aprinse <= 2 && /chat-ascuns/.test(r0.tab) && /chat-ascuns/.test(r0.urm) && !/chat-ascuns/.test(r0.cap), JSON.stringify(r0));
          T('…textul e același (cuvintele doar împachetate)', r0.text === 'Un răspuns de probă cu cuvinte îngroșate și destul text ca să se vadă cum apare.', r0.text);
          T('după 1,3 s: toate aprinse, tabelul și continuările la vedere', r1.aprinse === r1.cuv && !/chat-ascuns/.test(r1.tab) && /chat-arata/.test(r1.tab) && !/chat-ascuns/.test(r1.urm), JSON.stringify(r1));
        } else {
          T('cu „mai puțină mișcare": nimic împachetat, nimic ascuns — totul pe loc', r0.cuv === 0 && !/chat-ascuns/.test(r0.tab) && !/chat-ascuns/.test(r0.urm), JSON.stringify(r0));
        }
        await pg.close();
      }
      // Rândul „Mă gândesc…" și durata.
      const pg = await br.newPage();
      await pg.setContent('<!doctype html><html><body><div id="b"></div><script>' + COMUNE + '</script></body></html>');
      const g = await pg.evaluate(() => { const r = window._chatGand('asf-av'); document.getElementById('b').appendChild(r); const cap = document.createElement('div'); cap.className = 'chat-ins-cap'; const row = document.createElement('div'); row.appendChild(cap); window._chatDurata(row, 4200);
        return { av: r.querySelector('.av').className, text: r.querySelector('.chat-gand').textContent, rol: r.querySelector('.chat-gand').getAttribute('role'), dur: cap.textContent }; });
      T('„Mă gândesc…": semnul se învârte (av lucreaza asf-av), role="status"', g.av === 'av lucreaza asf-av' && g.text === 'Mă gândesc…' && g.rol === 'status', JSON.stringify(g));
      T('cât a durat, lângă antet: „· 4 secunde"', g.dur === '· 4 secunde', g.dur);
      await pg.close();
      // Butonul de trimis GOL e gri în AMBELE chaturi, pe ambele teme (05.11; Alin: „rezolvă acum") — măsurat cu toată foaia de stil:
      // pe tema închisă „body.dark .chat-trimite" bătea „.chat-trimite.gol", iar la noi „.asf .chat-trimite" (scrisă mai jos) la fel.
      const pg2 = await br.newPage(), rez = {};
      for (const dark of [false, true]) {
        await pg2.setContent('<html><head><style>' + CSS + '</style></head><body class="' + (dark ? 'dark' : '') + '"><div class="insp"><button id="a" class="chat-trimite gol">x</button><button id="b" class="chat-trimite">x</button></div>' +
          '<div class="asf"><button id="c" class="chat-trimite gol">x</button><button id="d" class="chat-trimite">x</button></div></body></html>');
        rez[dark ? 'inchisa' : 'deschisa'] = await pg2.evaluate(() => ['a', 'b', 'c', 'd'].map((id) => getComputedStyle(document.getElementById(id)).backgroundImage === 'none' ? 'gri' : 'plin'));
      }
      T('butonul de trimis: gol = gri, cu text = plin — la RA Insight și la noi, pe ambele teme (măsurat)', JSON.stringify(rez) === JSON.stringify({ deschisa: ['gri', 'plin', 'gri', 'plin'], inchisa: ['gri', 'plin', 'gri', 'plin'] }), JSON.stringify(rez));
      await pg2.close();
    } catch (e) { T('partea din browser a mers până la capăt', false, e.message); }
    await br.close();
  }
  console.log('\n' + (rele ? '✗' : '✓') + ' verify_chat_inteligent: ' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
