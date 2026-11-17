// verify_ra_insight_demo.js — telefonul RA Insight de pe site și din „Vezi pachetele" (16.11; Alin: „1. A, 2. închis, 3. da, cu comutator
// Basic / Pro / Business, 4. da, 5. da" — macheta https://claude.ai/artifact/WZp8wrbHtGe65SgywGATGt, „exact așa animat ca în machetă").
//
//   node verify_ra_insight_demo.js
//
// Ce păzește:
//   1. UN fișier (public/js/ra-insight-demo.js + public/css/ra-insight-demo.css), folosit în cele trei locuri: prima pagină (primul ecran,
//      cu cele patru butoane, și bucățile din secțiunea RA Insight), /pachete-ra-insight (Start + pachetele plătite) și aplicația („Vezi
//      pachetele", doar la firmele de pe Start); „RA Insight" primul în meniul site-ului; caseta veche de sub agenți a plecat;
//   2. niciun mov rămas pe site la RA Insight (05.11: culorile siglei) — chenarul Basic și coloana lui din comparație sunt verzi;
//   3. ce scrie în telefon e ce scrie aplicația: cartonașul alertei și „Gata" (propuneri.js), raportul cerut (cartonasRaport, reports.js),
//      răspunsul pe loc (fleet_quick.js), insignele (pachete.js), „Cifrele le-am luat din…" și „Surse de pe internet" (sursa_externa.js),
//      „Azi la tine" (azi_la_tine.js), butoanele și textul din casetă (pagina), pachetele (pachete.js, sursa_externa.js);
//   4. întrebările din telefoane trec prin regulile ADEVĂRATE ale aplicației și ies cum le arată telefonul;
//   5. textele telefonului: cu diacritice, fără numele furnizorului de AI, fără prețuri, fără „gratuit" / „tokeni" / „24/7";
//   6. culorile ecranului = culorile chatului pe tema închisă a aplicației (app.css);
//   7. în browser (dacă e Chromium): telefonul pornește, scrie, răspunde; „Alertă" ajunge la „Gata"; comutatorul schimbă pachetul; nimic nu
//      iese din ecran la 390 px; cu „mai puțină mișcare", răspunsurile sunt gata scrise. Fără Chromium, partea asta se sare („⤼ sărit").
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const rd = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const L = rd('public/landing.html'), P = rd('public/pachete-ra-insight.html'), IX = rd('public/index.html');
const CSSAPP = rd('public/css/app.css'), JS = rd('public/js/ra-insight-demo.js'), CSS = rd('public/css/ra-insight-demo.css');
const SRV = rd('server.js'), PKJS = rd('pachete.js'), AR = rd('ai_raport.js'), REPJS = rd('reports.js');
const PK = require('./pachete'), PR = require('./propuneri'), SM = require('./soferi_masini'), INS = require('./insight');
const SE = require('./sursa_externa'), FQ = require('./fleet_quick'), ARM = require('./ai_raport'), AZ = require('./azi_la_tine');
const RM = require('./ramuri'), REP = require('./reports');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(typeof detaliu === 'string' ? detaliu : JSON.stringify(detaliu)).slice(0, 400) : '')); }
}
const intre = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };
const fara = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,;:])/g, '$1').trim();
const md = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Telefonul, încărcat ca în pagină (fără DOM: doar textele și datele lui).
const ctx = { window: { matchMedia: () => ({ matches: false }) }, document: { readyState: 'complete', querySelectorAll: () => [] }, console };
vm.runInNewContext(JS, ctx);
const DEMO = ctx.window.RaInsightDemo;
const ACUM = Date.now(), ZI = 864e5;
const TX = DEMO._texte(ACUM);
const fz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' });
const ziRo = (ms) => { const o = {}; fz.formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; }); return o.year + '-' + o.month + '-' + o.day; };
const fo = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
// 10:24 de azi, pe ora României (și în zilele cu ora schimbată).
let LA = Date.parse(INS.perioada({ period: 'today' }, ACUM).from) + (10 * 60 + 24) * 60000;
for (const d of [0, -3600000, 3600000]) if (fo.format(new Date(LA + d)) === '10:24') { LA += d; break; }

console.log('\n1. Un fișier, trei locuri');
T('fișierele telefonului există (JS + CSS) și scriptul se încarcă', !!DEMO && typeof DEMO.porneste === 'function' && typeof DEMO.opreste === 'function' && CSS.length > 2000);
T('prima pagină încarcă telefonul (foaia de stil + scriptul)', L.includes('<link rel="stylesheet" href="/css/ra-insight-demo.css">') && L.includes('<script src="/js/ra-insight-demo.js" defer></script>'));
T('pagina pachetelor îl încarcă (și Font Awesome, pentru iconițele lui)', P.includes('<link rel="stylesheet" href="/css/ra-insight-demo.css">') && P.includes('<script src="/js/ra-insight-demo.js" defer></script>') && P.includes('font-awesome/6.5.1/css/all.min.css'));
T('aplicația îl încarcă', IX.includes('<link rel="stylesheet" href="/css/ra-insight-demo.css">') && IX.includes('<script src="/js/ra-insight-demo.js"></script>'));
const iH = L.indexOf('<section class="hero">'), erou = iH > 0 ? L.slice(iH, L.indexOf('</section>', iH)) : '';
T('primul ecran: telefonul (data-ri-demo="erou") stă lângă titlu, în aceeași secțiune cu <h1>', /data-ri-demo="erou"/.test(erou) && /<h1>/.test(erou));
const taburi = [...erou.matchAll(/data-sc="([a-z]+)"/g)].map((m) => m[1]);
T('…cu cele patru butoane, în ordinea din telefon', JSON.stringify(taburi) === JSON.stringify(DEMO._ORDINE.slice()), taburi);
T('…și „Exemplu cu o flotă de probă" sub el', /Exemplu cu o flotă de probă/.test(erou));
// Textele primului ecran (17.11, Alin): eticheta cu „asistentul AI" (nu „agentul": „Agenți AI" sunt cei șase), titlul cu
// „inteligență artificială", sloganul, un singur buton care coboară la secțiunea RA Insight; „Cere cont demo" vine mai jos.
T('primul ecran (17.11): eticheta „RA Insight · asistentul AI al flotei tale", titlul cu „inteligență artificială", sloganul',
  erou.includes('RA Insight · asistentul AI al flotei tale') && /<h1>Monitorizare GPS și analiză cu <span class="grad-ai">inteligență artificială<\/span><\/h1>/.test(erou) &&
  erou.includes('<p class="hero-tag">De la poziția mașinii la decizia potrivită</p>'));
const ctaErou = intre(erou, '<div class="hero-ctas">', '</div>');
T('…un singur buton, „Descoperă RA Insight", care coboară la secțiunea RA Insight (fără „Cere cont demo" sus)',
  (ctaErou.match(/<a |<button /g) || []).length === 1 && /<a href="#ra-insight" class="btn btn-primary">Descoperă RA Insight /.test(ctaErou) &&
  !/raxDemoAsk|Cere cont demo/.test(erou.replace(/<!--[\s\S]*?-->/g, '')));
const banda = intre(L, '<section class="cta-band">', '</section>');
T('banda de la final: „Cere cont demo", cu „Ai deja cont? Intră în aplicație" alături', /onclick="raxDemoAsk\(\)"[^>]*>.*Cere cont demo<\/button>/.test(banda) && /href="\/app"[^>]*>.*Ai deja cont\? Intră în aplicație<\/a>/.test(banda));
T('pe site, RA Insight e „asistentul", niciodată „agentul" (agenții AI sunt cei șase)', !/agentul AI/i.test(L) && !/agentul AI/i.test(P));
const iS = L.indexOf('id="ra-insight"'), sec = iS > 0 ? L.slice(iS, L.indexOf('</section>', iS)) : '';
T('secțiunea RA Insight: titlul din 17.11 și „Cere cont demo" la capătul ei', sec.includes('<h2>Inteligența artificială intră în conexiune directă cu flota ta. <span class="accent">Răspunde, explică, recomandă.</span></h2>') &&
  /raxDemoAsk\(\)/.test(intre(sec, '<div class="ri-cta">', '</div>')));
T('secțiunea RA Insight stă imediat după primul ecran (înaintea „Funcții")', iS > iH && iS < L.indexOf('id="functii"'));
const bucati = [...sec.matchAll(/data-ri-demo="bucata" data-sc="([a-z]+)"/g)].map((m) => m[1]);
T('…cu cele patru bucăți de ecran (aceleași patru întrebări)', JSON.stringify(bucati) === JSON.stringify(DEMO._ORDINE.slice()), bucati);
T('…„de la Basic" pe cele două lucruri care cer AI (analiza, propunerile cu „Da")', (sec.match(/class="ri-de">de la Basic</g) || []).length === 2);
T('…pachetele (cartonașele scurte) stau în ea, cu legătura spre comparație', sec.includes('class="ri-pachete"') && sec.includes('href="/pachete-ra-insight"'));
T('caseta veche de sub agenți a plecat (.ra-insight)', !/class="ra-insight/.test(L) && !/^\s*\.ra-insight[\s{.:,]/m.test(L));
T('meniul de sus: „RA Insight" primul, spre secțiune', /<div class="nav-links">\s*<a href="#ra-insight">RA Insight<\/a>/.test(L));
T('…și în meniul de pe telefon', /<\/div>\s*<a href="#ra-insight">RA Insight<\/a>\s*<a href="#functii">/.test(L));
T('pagina pachetelor: telefonul Start și cel al pachetelor plătite, sub textul de început', /data-ri-demo="start"/.test(P) && /data-ri-demo="platit"/.test(P) &&
  P.indexOf('class="tel-doi"') > P.indexOf('class="intro"') && P.indexOf('class="tel-doi"') < P.indexOf('class="pachete"'));
const PKF = intre(IX, 'window.insightPachete = async function', 'window.insightTrecere = async function');
T('aplicația, „Vezi pachetele": telefonul pachetelor plătite doar la firmele de pe Start', /if \(j\.actual === 'start' && window\.RaInsightDemo\)/.test(PKF) && /setAttribute\('data-ri-demo', 'platit'\)/.test(PKF));
T('…pornit după ce fereastra e pe ecran și oprit la închidere (×, clic pe fundal, fereastră nouă)', /document\.body\.appendChild\(ov\);\s*if \(window\.RaInsightDemo\) window\.RaInsightDemo\.porneste\(ov\);/.test(PKF) &&
  /function inchidePachete\(ov\) \{[^}]*RaInsightDemo\.opreste\(ov\)/.test(PKF) && (PKF.match(/inchidePachete\((ov|vechi)\)/g) || []).length >= 3 && !/ov\.remove\(\); \};\n\s*cap\.appendChild\(bi\)/.test(PKF));
T('…comenzile din jurul lui iau culorile temei aplicației (.insp-pk-demo)', /\.insp-pk-demo \{[^}]*--ri-c-fg: var\(--text-primary\); --ri-c-mut: var\(--text-secondary\); --ri-c-line: var\(--border-light\);/.test(CSSAPP));
T('…iar foaia telefonului nu le acoperă (variabilele --ri-c-* au doar valori de rezervă)', !/--ri-c-(fg|mut|line)\s*:/.test(CSS));
T('o singură definiție a telefonului (nicio copie în pagini)', /Telefon\.prototype\.joacaUna/.test(JS) && ![L, P, IX].some((s) => /Telefon\.prototype|ri-gand|Mă gândesc…<\/div>/.test(s)));

console.log('\n2. Fără mov la RA Insight pe site (culorile siglei, 05.11)');
const MOV = /#6d28d9|#7c3aed|#8b5cf6|#a78bfa|#c4b5fd|#5b21b6|#818cf8|#4f46e5|#a5b4fc|#4338ca|#1e1033|#160b2e|#1b1036|var\(--purple\b|rgba\(\s*124,\s*58,\s*237|rgba\(\s*167,\s*139,\s*250|rgba\(\s*109,\s*40,\s*217|rgba\(\s*139,\s*92,\s*246/i;
for (const [n, s] of [['prima pagină', L], ['pagina pachetelor', P], ['ra-insight-demo.css', CSS], ['ra-insight-demo.js', JS], ['app.css (.insp-pk-demo)', intre(CSSAPP, '/* „Vezi pachetele" la firmele de pe Start', '/* Trecerea la alt pachet')]]) {
  T(n + ': niciun mov', s.length > 0 && !MOV.test(s), (s.match(MOV) || [''])[0]);
}
T('chenarul pachetului Basic e verde (prima pagină și pagina pachetelor)', /\.ri-pk\.ai\{border-color:rgba\(63,224,125,\.45\)\}/.test(L) && /\.pachet\.ai\{border-color:rgba\(63,224,125,\.45\)\}/.test(P));
T('coloana pachetelor cu AI din comparație e verde', /\.comparatie td\.v\.ai,\.comparatie th\.p\.ai\{background:rgba\(63,224,125,\.07\)\}/.test(P));

console.log('\n3. Ce scrie în telefon e ce scrie aplicația');
// Alerta (propuneri.js): textul de dinainte, cartonașul, dovezile, „Gata", jurnalul.
const baza = Number((SRV.match(/const SPEED_ALERT_BASE = .*? : (\d+);/) || [])[1]);
const marja = Number((SRV.match(/const SPEED_ALERT_MARGIN = .*? : (\d+);/) || [])[1]);
const card = PR.cardAlerta({ prag: 120, imei: '1', optiuni: [{ v: '1', t: 'B 204 RAT · VW Caddy', scurt: 'B 204 RAT' }], poate: true, cine: 'Andrei',
  sim: { ori: 3, masini: 1 }, max: { v: 134, t: ACUM - 7 * ZI }, acum: ACUM, marja: { baza, marja } });
const A = TX.sc.alerta;
T('alerta: textul de dinainte = TEXTE.amPregatitAlerta', fara(A.corp) === fara(md(PR.TEXTE.amPregatitAlerta)), fara(A.corp));
T('alerta: titlul și iconița cartonașului', A.dupa.includes('>' + card.titlu + '<') && A.dupa.includes(card.ic));
card.randuri.forEach((r) => T('alerta: rândul „' + r.l + ': ' + r.v + '"', A.dupa.includes('<span class="ri-l">' + r.l + '</span>' + (r.b ? '<b>' + r.v + '</b>' : r.v))));
T('alerta: „' + card.dovT + '"', A.dupa.includes('>' + card.dovT + '<'));
T('alerta: de câte ori ar fi sunat — forma din cod, ziua de acum 7 zile', /^Ar fi sunat de 3 ori\. Cea mai mare viteză: 134 km\/h, pe \d{2}\.\d{2}(\.\d{4})?, la \d{2}:\d{2}\.$/.test(card.dovezi[0].text) &&
  A.dupa.includes(card.dovezi[0].text.replace(/la \d{2}:\d{2}\.$/, 'la 14:22.')), card.dovezi[0].text);
T('alerta: marja de viteză (textMarjaViteza, cu cifrele motorului din server.js)', card.dovezi[1].text === PR.textMarjaViteza(120, { baza, marja }) && A.dupa.includes(card.dovezi[1].text), card.dovezi[1].text);
T('alerta: cui ajunge', A.dupa.includes(card.dovezi[2].text));
T('alerta: butonul „' + card.butonDa + '", apoi „Schimbă" și „Nu"', A.dupa.includes(card.butonDa + '</span>') && /fa-pen"><\/i>Schimbă</.test(A.dupa) && /fa-xmark"><\/i>Nu</.test(A.dupa));
T('alerta: rândul de sub butoane (cine, jurnalul, cele ' + SM.ANULARE_MIN + ' minute)', A.dupa.includes(card.sub) && SM.ANULARE_MIN === 10, card.sub);
const GA = PR.gataAlerta({ name: PR.numeAlerta(120, 'B 204 RAT') }, 'Andrei', LA);
T('„Gata": textul (gataAlerta)', fara(A.gata).includes(fara(md(GA.text))), GA.text);
T('„Gata": jurnalul', fara(A.gata).includes(GA.jurnal), GA.jurnal);
T('„Gata": butonul „' + GA.buton.text + '"', A.gata.includes('>' + GA.buton.text + '<'));
T('„Gata": „Anulează · mai ai 9:59" — forma ceasului din pagină (ceasAnulare)', IX.includes("t.textContent = 'Anulează · mai ai ' + Math.floor(s / 60)") && A.gata.includes('Anulează · mai ai 9:59'));
T('cartonașul după „Da": „Ai apăsat Da · ora" (server.js, _cardPublic)', /c\.apasat = 'Ai apăsat Da · ' \+ ora\(a\.aplicat_la\)/.test(SRV) && A.apasat === 'Ai apăsat Da · 10:24');
// Raportul cerut (cartonasRaport + reports.js).
const R = TX.sc.raport;
T('raportul: numele din catalog și capul cartonașului (nume · mașina · perioada)', REP.REPORTS.trips && REP.REPORTS.trips.label === 'Foaie de parcurs' &&
  R.dupa.includes('>' + REP.REPORTS.trips.label + ' · ' + INS.eticheta({ nr: 'B 204 RAT', nume: 'VW Caddy' }) + ' · ieri<') && IX.includes("rp.label + ' · ' + (rp.vehicul || '') + (rp.perioada ? ' · ' + rp.perioada : '')"));
const ieri = INS.perioada({ period: 'yesterday' }, ACUM);
T('…„ieri" e eticheta perioadei din aplicație', INS.etichetaPerioadei(ieri.from, ieri.to, ACUM) === 'ieri', INS.etichetaPerioadei(ieri.from, ieri.to, ACUM));
const kpi = REP.kpiRaport({ summary: { 'Curse': 6, 'Distanță totală (km)': 184.3, 'Durată totală': '4h 12m' } });
T('…cifrele de sus: cheile raportului „Foaie de parcurs" și forma lor (kpiRaport)', /summary: \{ 'Curse': count, 'Distanță totală \(km\)': [^,]+, 'Durată totală': fmtDur\(totalDur\) \}/.test(REPJS) &&
  R.dupa.includes('<div class="ri-kpi">' + kpi.map((k) => '<span><span class="ri-l">' + k.et + '</span><b>' + k.val + '</b></span>').join('') + '</div>'), kpi);
T('…butoanele „Deschide raportul" / „Descarcă Excel" și „E și în Istoric rapoarte, până pe …" (cartonasRaport)', ['Deschide raportul', 'Descarcă Excel', 'E și în Istoric rapoarte, până pe '].every((t) => IX.includes(t) && R.dupa.includes(t)));
T('…„până pe" = azi + ' + Number((SRV.match(/const ZILE_ISTORIC_RAPOARTE = (\d+);/) || [])[1]) + ' zile', /const ZILE_ISTORIC_RAPOARTE = 7;/.test(SRV) && R.dupa.includes('până pe ' + ziRo(ACUM + 7 * ZI).slice(8, 10) + '.' + ziRo(ACUM + 7 * ZI).slice(5, 7) + '.'));
// Răspunsul pe loc (fleet_quick).
const RFQ = FQ.answer('where', { snapshot: [{ imei: '1', nume: 'VW Caddy', nr: 'B 204 RAT', locatie: 'Calea Victoriei 155, București', viteza_kmh: 54, ultima_actualizare: new Date(ACUM - 60000).toISOString() }], today: [], now: ACUM, total: 1 }).reply;
const lFQ = RFQ.split('\n').filter(Boolean).map((l) => l.replace(/\*\*/g, '').replace(/^• /, ''));
const lDemo = [...TX.sc.unde.corp.matchAll(/<(div|p)[^>]*>(.*?)<\/\1>/g)].map((m) => fara(m[2]));
T('răspunsul pe loc „Unde e acum" = fleet_quick (titlul, mașina, locul, starea)', JSON.stringify(lFQ) === JSON.stringify(lDemo), { fq: lFQ, demo: lDemo });
// Pe butoane (Start): „Ce a făcut flota ieri?" — rezumatul pe mai multe mașini din ai_raport.js.
T('„Ce a făcut flota ieri?" (Start): forma răspunsului pe reguli (ai_raport, rezumatul pe mai multe mașini)',
  AR.includes("r.text = (cine ? '**' + cine + '**' : 'Flota') + ' — ' + per + ': **' + cant(Math.round(kmTot), 'km', 'km') + '**; au mers '") && AR.includes("', ralanti în total '") &&
  /^<p>Flota — ieri: <b>1\.240 km<\/b>; au mers 7 din 8 mașini, ralanti în total 3h 10m\.<\/p>$/.test(TX.sc.ieri.corp));
T('…tabelul: aceleași coloane', AR.includes("coloane: ['Mașina', 'Km', 'Zile de mers', 'În mers']") && TX.sc.ieri.dupa.includes('<th>Mașina</th><th>Km</th><th>Zile de mers</th><th>În mers</th>'));
// Insignele (pachete.insigna) și durata (_chatSecunde din pagină).
const I = (f, o) => PK.insigna(f, o).detaliu;
const insigne = [['unde', I('instant', { live: true })], ['raport', I('instant', {})], ['alerta', I('instant', { propunere: true })], ['ieri', I('instant', { numarat: true })],
  ['dece', I('ai', { numarat: true })], ['soferi', I('ai', { numarat: true })], ['ore', I('ai', { numarat: true, sursa: 1 })]];
insigne.forEach(([k, d]) => T('insigna „' + k + '": ' + (TX.sc[k].fel === 'ai' ? 'Analiză' : 'Instant') + ' · ' + d, TX.sc[k].det === d, TX.sc[k].det));
T('numele și etichetele insignei (pachete.INSIGNA)', JS.includes("el('span', 'ri-nm', '" + PK.INSIGNA.nume + "')") && JS.includes('</i>' + PK.INSIGNA.ai + "'") && JS.includes('</i>' + PK.INSIGNA.instant + "'"));
const secMatch = IX.match(/window\._chatSecunde = function \(ms\) \{[\s\S]*?\n    \};/);
const secunde = secMatch ? vm.runInNewContext('(function(){var window={};' + secMatch[0] + ';return window._chatSecunde;})()') : null;
T('durata de lângă insignă: forma din pagină (_chatSecunde)', !!secunde && TX.sc.dece.dur === secunde(7000) && TX.sc.soferi.dur === secunde(6000) && TX.sc.ore.dur === secunde(9000));
// „Cifrele le-am luat din…" și „Surse de pe internet" (sursa_externa.js).
T('„Cifrele le-am luat din rapoarte." (TEXT_VERIFICAT.aplicatie)', TX.sc.dece.dupa.includes(SE.TEXT_VERIFICAT.aplicatie) && TX.sc.soferi.dupa.includes(SE.TEXT_VERIFICAT.aplicatie));
T('…„din sursele de mai sus." la întrebarea cu sursă externă (TEXT_VERIFICAT.sursa)', TX.sc.ore.dupa.includes(SE.TEXT_VERIFICAT.sursa));
const CAUT = 'ore de condus șofer camion pe săptămână, regulamentul 561';
const PE = SE.pentruEcran({ cautari: [CAUT], surse: [{ url: 'https://eur-lex.europa.eu/', titlu: 'Regulamentul (CE) nr. 561/2006', site: 'eur-lex.europa.eu' }] }, LA);
T('„Surse de pe internet": titlul, „Căutat pe internet la …", „Ce am căutat: …" (pentruEcran)', TX.sc.ore.dupa.includes('>' + PE.titlu + '<') && TX.sc.ore.dupa.includes(PE.text) && TX.sc.ore.dupa.includes(PE.ceAmCautat), PE);
T('butonul „Sursă externă" (sursa_externa.NUME) și forma „N din M"', JS.includes('title="' + SE.NUME + '"') && /\(this\.sursa\.ramase - 1\) \+ ' din ' \+ this\.sursa\.total/.test(JS));
// Ecranul gol: salutul, caseta, butoanele, „Azi la tine".
T('„Mă gândesc…" (_chatGand din pagină)', IX.includes("g.textContent = 'Mă gândesc…'") && JS.includes("'Mă gândesc…'"));
T('salutul: „Salut, {prenume}! Cu ce te pot ajuta?" (pagina)', IX.includes("(prenume() ? 'Salut, ' + prenume() + '! ' : 'Salut! ') + 'Cu ce te pot ajuta?'") && JS.includes("Salut, ' + this.cine + '! Cu ce te pot ajuta?"));
const cardSrc = (IX.match(/var CARDURI = \[[\s\S]*?\];\n\s*\/\/[^\n]*\n\s*var CARDURI_REGULI = [^\n]*\n\s*\/\/[^\n]*\n\s*var CARDURI_IC = [^\n]*/) || [''])[0];
const CRD = cardSrc ? vm.runInNewContext('(function(){' + cardSrc + ';return {c:CARDURI,r:CARDURI_REGULI,ic:CARDURI_IC};})()') : null;
T('butoanele de sub casetă = CARDURI (cu AI) și CARDURI_REGULI (Start), cu iconițele lor', !!CRD &&
  JSON.stringify(DEMO._CHIPS) === JSON.stringify(CRD.c.map((c) => [CRD.ic[c.t], c.t])) && JSON.stringify(DEMO._CHIPS_START) === JSON.stringify(CRD.r.map((c) => [CRD.ic[c.t], c.t])), CRD && CRD.c);
T('textul din casetă (cu AI / Start) = cel din pagină', IX.includes("'" + DEMO._LOC + "'") && IX.includes("'" + DEMO._LOC_START + "'"));
const d = AZ.randuri({ agenti: ['watch', 'care', 'dispatch', 'client', 'optimize', 'compliance'], offlineMin: 60,
  faraSemnal: [{ imei: '2', eticheta: 'B 77 TIR · Iveco Stralis', nr: 'B 77 TIR', minute: 180 }], constatari: [],
  termene: [{ stare: 'curand', cine: 'B 31 LOG · Dacia Logan', ce: 'ITP', cand: RM.candData(12, ziRo(ACUM + 12 * ZI), ACUM, true) }],
  libere: 0, ieri: { km: 1240, active: 7, total: 8, top: { eticheta: 'B 77 TIR · Iveco Stralis', nr: 'B 77 TIR', km: 412 } }, soferi: [] });
T('„Azi la tine": aceleași trei rânduri ca azi_la_tine.js (nu transmite, ITP-ul, ziua de ieri)', d.randuri.length === 3 && d.randuri.every((r, i) => md(r.text) === TX.azi[i].t), d.randuri.map((r) => r.text));
T('…în aceeași ordine și culoare (roșu, portocaliu, verde) și „2 de văzut"', d.randuri.map((r) => r.nivel).join() === 'r,w,g' && TX.azi.map((x) => x.st).join() === 'r,w,g' && d.deVazut === 2 &&
  IX.includes("dv + ' de văzut'") && JS.includes('<span>2 de văzut</span>'));
// Pachetele (pachete.js, sursa_externa.js) și contoarele (textScurt).
const PUB = PK.publice({ cuPret: false });
for (const k of DEMO._PLANURI) {
  const p = PUB.find((x) => x.cod === k), D = DEMO._PACHETE[k];
  T(k + ': nume, titlu, pentru cine, conturi, întrebări = pachete.js', !!p && D.nume === p.nume && D.titlu === p.titlu && D.pentru === p.pentru && D.conturi === p.cifre[0].val && D.intrebari === p.cifre[1].val, D);
  T(k + ': „Sursă externă: ' + SE.PE_PACHET[k] + ' pe lună" (PE_PACHET) și butonul pornit „N din ' + SE.PE_PACHET[k] + '"', D.sursa === SE.PE_PACHET[k] && D.sursaRamase > 0 && D.sursaRamase <= D.sursa);
  const tot = PK.dupaCod(k).intrebari;
  T(k + ': contorul are forma casetei (textScurt) și scade cu o întrebare', (k === 'basic' ? D.contor.every((c) => new RegExp('^\\d+ din ' + esc(tot.toLocaleString('ro-RO')) + '$').test(c)) : D.contor.every((c) => /^îți rămân \d+$/.test(c))) &&
    Number(D.contor[0].match(/\d+/)[0]) - 1 === Number(D.contor[1].match(/\d+/)[0]), D.contor);
}
T('textScurt scrie „N din M" (fără împărțire) și „îți rămân N" (cu cifra omului)', PKJS.includes("return 'îți rămân ' + _nrRo(st.motiv === 'plasa' ? 0 : st.ramaseOm);") && PKJS.includes("return _nrRo(ramaseAfisate(st)) + ' din ' + _nrRo(st.intrebari);"));
const st0 = PUB.find((x) => x.cod === 'start');
T('Start: telefonul numără din ' + PK.dupaCod('start').intrebari + ' și coloana lui de pe pagina pachetelor are textele din pachete.js',
  DEMO._START.contor.every((c) => new RegExp(' din ' + PK.dupaCod('start').intrebari + '$').test(c)) && P.includes('<b>' + st0.titlu + '</b> ' + st0.pentru) &&
  P.includes('Conturi: ' + st0.cifre[0].val + ' · Răspunsuri pe loc: ' + st0.cifre[2].val) && P.includes(PK.dupaCod('start').intrebari + ' de răspunsuri pe lună'));

console.log('\n4. Întrebările din telefoane trec prin regulile aplicației și ies cum le arată telefonul');
const FISA = INS.fisaFlotei([{ imei: '1', name: 'VW Caddy', plate: 'B 204 RAT', driver_name: 'Mihai Ionescu' }, { imei: '2', name: 'Iveco Stralis', plate: 'B 77 TIR', driver_name: 'Ion Popa' },
  { imei: '3', name: 'Dacia Logan', plate: 'B 31 LOG' }, { imei: '4', name: 'Ford Transit', plate: 'B 18 VAN' }]);
const q = (k, singur) => (singur && TX.sc[k].qSingur) || TX.sc[k].q;
const g1 = INS.gasesteInText(q('unde'), FISA);
T('„' + q('unde') + '" → răspunsul pe loc „unde e", pe B 204 RAT', JSON.stringify(FQ.detectIntents(q('unde'))) === '["where"]' && INS.potrivitPentruRapid(q('unde'), g1, false) && g1.masini.map((m) => m.imei).join() === '1');
const g2 = INS.gasesteInText(q('dece'), FISA);
T('„' + q('dece') + '" → analiza atentă (merge la RA Insight, nu e răspuns pe loc), pe B 204 RAT', INS.esteAnaliza(q('dece')) && !INS.potrivitPentruRapid(q('dece'), g2, false) && g2.masini.map((m) => m.imei).join() === '1' && ARM.comanda(q('dece'), null, FISA, ACUM, { masini: ['1'] }) == null);
const c3 = ARM.comanda(q('raport'), null, FISA, ACUM, { masini: ['1'] }), c3b = ARM.comanda(q('raport', true), null, FISA, ACUM, {});
T('„' + q('raport') + '" (după discuția despre Caddy) → raportul „Foaie de parcurs", pe B 204 RAT, ieri', !!c3 && c3.raport === 'trips' && (c3.masini || []).join() === '1' && c3.perioada && c3.perioada.eticheta === 'ieri', c3);
T('„' + q('raport', true) + '" (apăsat singur) → același raport', !!c3b && c3b.raport === 'trips' && (c3b.masini || []).join() === '1' && c3b.perioada && c3b.perioada.eticheta === 'ieri', c3b);
const c4 = PR.cerereAlerta(q('alerta'), FISA);
T('„' + q('alerta') + '" → propunerea de alertă de viteză, peste 120, pe B 204 RAT', !!c4 && c4.tip === 'overspeed' && c4.prag === 120 && String(c4.imei) === '1', c4);
const u5 = ARM.intelege(q('ieri'), {}, FISA, ACUM);
T('„' + q('ieri') + '" (butonul de pe Start) → pe reguli: ce a făcut flota, ieri, toată flota', !!u5 && u5.subiect === 'rezumat' && u5.perioada && u5.perioada.eticheta === 'ieri' && !u5.masini, u5 && { s: u5.subiect, m: u5.masini });
for (const k of ['soferi', 'ore']) {
  const g = INS.gasesteInText(q(k), FISA);
  T('„' + q(k) + '" → întrebare liberă pentru RA Insight (nici pe loc, nici raport, nici propunere)', !INS.potrivitPentruRapid(q(k), g, false) && ARM.comanda(q(k), null, FISA, ACUM, {}) == null && PR.cerereAlerta(q(k), FISA) == null);
}
const V = SE.verifica(CAUT, { nume: ['Mihai Ionescu', 'Ion Popa'], numere: ['B 204 RAT', 'B 77 TIR', 'B 31 LOG', 'B 18 VAN'] });
T('căutarea pe internet din telefon ar pleca (fără datele firmei)', V.ok === true, V);

console.log('\n5. Textele telefonului');
const SIR = [...JS.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]).map((s) => fara(s).replace(/(^|\s)(ri|fa)-[a-z0-9-]+/g, ' ')).filter((s) => /[a-zăâîșț]{2,}\s+[a-zăâîșț]{2,}/i.test(s)).join(' | ');   // fără numele claselor (ri-dupa)
const LIT = '[\\p{L}\\p{N}_]';
const cuvinte = (lista) => new RegExp('(?<!' + LIT + ')(' + lista + ')(?!' + LIT + ')', 'iu');
const FARA = cuvinte('si|in|iti|cand|fara|dupa|masina|masini|masinile|sofer|soferi|soferul|aplicatie|aplicatia|intrebare|intrebari|raspuns|raspunde|tau|saptamana|descarca|ramase|cate|cati|anunta|pregatit|apasa|apesi|fata|urmeaza|expira|vazut|parcurs ieri|cautat');
const g = SIR.match(FARA);
T('cu diacritice (niciun cuvânt scris fără ele)', !g, g ? SIR.slice(Math.max(0, g.index - 40), g.index + 40) : '');
T('ș și ț cu virgulă, nu cu sedilă', !/[şţŞŢ]/.test(JS + CSS + L + P));
T('fără numele furnizorului de AI, fără prețuri, fără „gratuit" / „tokeni" / „nu se numără" / „24/7"', !/Anthropic|Claude|model de limbaj|gratuit|tokeni|nu se num[aă]r|24\/7|\blei\b|€/i.test(SIR), (SIR.match(/Anthropic|Claude|model de limbaj|gratuit|tokeni|nu se num[aă]r|24\/7|\blei\b|€/i) || [''])[0]);
T('mașinile și oamenii sunt de probă, iar sub telefoane scrie „Exemplu cu o flotă de probă"', /Exemplu cu o flotă de probă/.test(JS) && /Exemplu cu o flotă de probă/.test(L) && /Exemplu cu o flotă de probă/.test(P));
T('zilele se socotesc față de azi, pe ora României (fără date scrise de mână)', !/\b\d{2}\.\d{2}\.20\d\d\b/.test(JS) && /timeZone: TZ/.test(JS) && TX.sc.dece.tit.includes(INS.LUNI ? INS.LUNI[new Date(Date.parse(INS.perioada({ period: 'today' }, ACUM).from) + 12 * 3600000).getUTCMonth()] : 'x'), TX.sc.dece.tit);

console.log('\n6. Culorile ecranului = chatul RA Insight pe tema închisă (app.css)');
const DARK = (CSSAPP.match(/\nbody\.dark \{[\s\S]*?\n\}/) || CSSAPP.match(/body\.dark \{[^}]*--bg-darkest[^}]*\}/) || [''])[0] + (CSSAPP.slice(0, 2000).match(/--bg-darkest: #0B0E11[\s\S]*?--accent: #3FE07D;/) || [''])[0];
const PERECHI = [
  ['eticheta INSTANT', /body\.dark \.chat-ins-et\.instant \{ color: (#[0-9a-f]+); \}/i, /--ri-instant: (#[0-9a-f]+);/i],
  ['rândul „✓"', /body\.dark \.chat-ok \{ color: (#[0-9a-f]+); \}/i, /--ri-okc: (#[0-9a-f]+);/i],
  ['semnul răspunsului', /\.insp-a \.av \{[^}]*background: (linear-gradient\(135deg, #3FE07D, #2BB763\))/i, /\.ri-av \{[^}]*background: (linear-gradient\(135deg, #3FE07D, #2BB763\))/i],
  ['butonul de trimis', /\.chat-trimite \{[^}]*background: (linear-gradient\(135deg, #3FE07D, #2BB763\)); color: (#06210F)/i, /\.ri-trim\.ri-plin \{ background: (linear-gradient\(135deg, #3FE07D, #2BB763\)); color: (#06210F)/i],
  ['bula întrebării', /body\.dark \.insp-u \.b \{ background: color-mix\(in srgb, (#3FE07D \d+%), var\(--bg-darkest\)\); \}/i, /--ri-ub: color-mix\(in srgb, (#3FE07D \d+%), #0B0E11\);/i],
  ['salutul în degrade', /body\.dark \.insp-salut h2 \{[^}]*background: (linear-gradient\(90deg, #FFFFFF, #3FE07D\))/i, /\.ri-sal \{[^}]*background: (linear-gradient\(90deg, #FFFFFF, #3FE07D\))/i],
  ['„Sursă externă" pornită', /body\.dark \.chat-un\.chat-sursa\.on \{ (background: rgba\(59,130,246,\.16\); border-color: rgba\(147,197,253,\.55\); color: #bfdbfe;) \}/i, /\.ri-sursa\.ri-on \{ (background: rgba\(59,130,246,\.16\); border-color: rgba\(147,197,253,\.55\); color: #bfdbfe;) \}/i],
  ['dunga cartonașului de propunere', /body\.dark \.chat-prop \{ border-left-color: (#[0-9a-f]+); \}/i, /--ri-propc: (#[0-9a-f]+);/i],
  ['dunga cartonașului de raport', /body\.dark \.chat-rap \{ border-left-color: (#[0-9a-f]+); \}/i, /--ri-rapc: (#[0-9a-f]+);/i],
  ['dunga lui „Gata"', /body\.dark \.chat-gata \{ border-left-color: (#[0-9a-f]+); \}/i, /--ri-gatac: (#[0-9a-f]+);/i]
];
for (const [n, ra, rb] of PERECHI) {
  const a = CSSAPP.match(ra), b = CSS.match(rb);
  T(n + ': ' + (a ? a.slice(1).join(' ') : '?'), !!a && !!b && a.slice(1).join('|').toLowerCase() === b.slice(1).join('|').toLowerCase(), { app: a && a.slice(1), tel: b && b.slice(1) });
}
const VARS = [['--bg-panel', '--ri-panel'], ['--border', '--ri-line'], ['--border-light', '--ri-line2'], ['--text-secondary', '--ri-fg2'], ['--text-muted', '--ri-fg3'], ['--bg-darkest', '--ri-darkest']];
const darkBloc = (CSSAPP.match(/\n\s*--bg-darkest: #0B0E11;[\s\S]*?--accent: #3FE07D;/) || [''])[0];
for (const [va, vb] of VARS) {
  const a = darkBloc.match(new RegExp(esc(va) + ': (#[0-9A-Fa-f]+);')), b = CSS.match(new RegExp(esc(vb) + ': (#[0-9A-Fa-f]+);'));
  T('tema închisă: ' + va + ' = ' + vb + ' (' + (a ? a[1] : '?') + ')', !!a && !!b && a[1].toLowerCase() === b[1].toLowerCase(), { app: a && a[1], tel: b && b[1] });
}
void DARK;

(async () => {
  console.log('\n7. În browser: pornește, scrie, răspunde; comutatorul; 390 px; „mai puțină mișcare"');
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
    const c = await br.newContext({ viewport: { width: w, height: h }, reducedMotion: redus ? 'reduce' : 'no-preference' });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await c.addInitScript(() => { try { localStorage.setItem('ra_consent_v1', 'denied'); } catch (e) {} });
    const p = await c.newPage(); p._erori = [];
    p.on('pageerror', (e) => p._erori.push(e.message));
    return p;
  };
  const astepta = async (p, fn, arg, ms) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  try {
    let p = await pagina(1366, 860, false);
    await p.goto(B + '/landing.html', { waitUntil: 'load' });
    T('prima pagină: telefonul se desenează, cu salutul', await astepta(p, () => /Salut, Andrei! Cu ce te pot ajuta\?/.test((document.querySelector('[data-ri-demo="erou"] .ri-sal') || {}).textContent || ''), null, 4000));
    T('…apoi scrie întrebarea și răspunde (antetul RA Insight · Instant)', await astepta(p, () => !!document.querySelector('[data-ri-demo="erou"] .ri-pu') && /RA Insight/.test((document.querySelector('[data-ri-demo="erou"] .ri-cap') || {}).textContent || ''), null, 12000));
    T('…butonul „Unde e" e cel aprins', await astepta(p, () => (document.querySelector('[data-ri-taburi] [aria-pressed="true"]') || {}).getAttribute && document.querySelector('[data-ri-taburi] [aria-pressed="true"]').getAttribute('data-sc') === 'unde', null, 3000));
    T('…cele patru bucăți din secțiunea RA Insight sunt desenate', await p.evaluate(() => document.querySelectorAll('#ra-insight .ri-ecran .ri-pa').length) === 4);
    T('…punctele din „Azi la tine" se văd (roșu, portocaliu, verde — clasele lor nu sunt „ri-w", a cuvintelor care se aprind)', await p.evaluate(() => Array.from(document.querySelectorAll('[data-ri-demo="erou"] .ri-azi-st')).map((e) => getComputedStyle(e).opacity).join()) === '1,1,1');
    await p.click('[data-ri-taburi] [data-sc="alerta"]');
    T('„Alertă": scrie, propune, apasă „Da" și ajunge la „Gata"', await astepta(p, () => !!document.querySelector('[data-ri-demo="erou"] .ri-gata') && !!document.querySelector('[data-ri-demo="erou"] .ri-prop.ri-inchis'), null, 16000));
    T('…fără erori în pagină și nimic ieșit din ecran', p._erori.length === 0 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), p._erori);
    await p.goto(B + '/pachete-ra-insight.html', { waitUntil: 'load' });
    T('pagina pachetelor: telefonul Start și comutatorul Basic / Pro / Business', await astepta(p, () => !!document.querySelector('[data-ri-demo="start"] .ri-scr') && document.querySelectorAll('[data-ri-demo="platit"] .ri-pk-b').length === 3, null, 4000));
    await p.click('[data-ri-demo="platit"] [data-pk="pro"]');
    T('…„Pro": rândul pachetului, Maria în telefon și contorul ei', await astepta(p, (o) => {
      const z = document.querySelector('[data-ri-demo="platit"]');
      return (z.querySelector('.ri-pk-info') || {}).textContent.indexOf(o.titlu) >= 0 && /Salut, Maria!/.test((z.querySelector('.ri-sal') || {}).textContent || '') &&
        (z.querySelector('.ri-cnt') || {}).textContent === o.cnt && z.querySelector('[data-pk="pro"]').getAttribute('aria-pressed') === 'true';
    }, { titlu: DEMO._PACHETE.pro.titlu, cnt: DEMO._PACHETE.pro.contor[0] }, 3000));
    await p.click('[data-ri-demo="platit"] [data-pk="business"]');
    T('…„Business": pornește „Sursă externă" și răspunde cu sursele de pe internet', await astepta(p, () => !!document.querySelector('[data-ri-demo="platit"] .ri-sursa.ri-on') && !!document.querySelector('[data-ri-demo="platit"] .ri-se'), null, 16000));
    T('…fără erori', p._erori.length === 0, p._erori);
    await p.context().close();
    for (const f of ['/landing.html', '/pachete-ra-insight.html']) {
      p = await pagina(390, 844, false);
      await p.goto(B + f, { waitUntil: 'load' }); await p.waitForTimeout(800);
      T('390 px, ' + f + ': nimic nu iese din ecran', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await p.evaluate(() => document.documentElement.scrollWidth));
      await p.context().close();
    }
    p = await pagina(1366, 860, true);
    await p.goto(B + '/landing.html', { waitUntil: 'load' }); await p.waitForTimeout(400);
    T('„mai puțină mișcare": răspunsul e gata scris pe loc, fără cuvinte stinse', await p.evaluate(() => !!document.querySelector('[data-ri-demo="erou"] .ri-pa') && !document.querySelector('[data-ri-demo="erou"] .ri-w')));
    await p.goto(B + '/pachete-ra-insight.html', { waitUntil: 'load' }); await p.waitForTimeout(400);
    T('…și pe pagina pachetelor (amândouă telefoanele)', await p.evaluate(() => !!document.querySelector('[data-ri-demo="start"] .ri-pa') && !!document.querySelector('[data-ri-demo="platit"] .ri-pa')));
    await p.context().close();
  } catch (e) { rele++; console.log('  ✗ partea din browser a crăpat: ' + (e && e.stack || e)); }
  try { await br.close(); } catch (e) {}
  srv.close();
  gata();
})().catch((e) => { rele++; console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(); });

function gata() {
  console.log('\n' + (rele ? '✗' : '✓') + ' telefonul RA Insight: ' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exitCode = rele ? 1 : 0;
}
