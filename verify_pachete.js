// verify_pachete.js — pachetele RA Insight (Alin, 14.10, „Capitolul 1"): Start / Basic / Pro / Business.
//
//   node verify_pachete.js
//
// Ce păzește:
//   1. regula (pachete.js): ce primește fiecare pachet, conturile, împărțirea întrebărilor, starea (cota, limita omului,
//      partea la comun, plasa de 80%), analiza atentă (din 28.10: ce întrebări o primesc; Sonnet scos), textele (fără bani pentru client);
//   2. sursa: o singură numărătoare a răspunsurilor pe butoane, ramurile de la Basic în sus, costul nu pleacă la client;
//   3. pe server pornit, cu modelul SIMULAT (nu se cheltuie nimic):
//      Start — doar administratorul, singur primește locul, 50 de răspunsuri pe butoane, întrebarea liberă NU pleacă spre
//      model, „Rezumă raportul" pe reguli, fila AI Raport cu cont, ramurile închise; la capăt, mesajul până pe 1;
//      Basic — 2 conturi, întrebările libere la model (se numără), butoanele pe reguli (nu se numără), plasa;
//      Pro — limitele pe om, partea la comun, analiza atentă la „de ce" (același model, forma fixă; comutatorul vechi = 404);
//      regula veche, pe cont, rămâne cum era; super-adminul pune / scoate pachetul;
//   4. pasul 5 — oferta, contractul, factura: prețul pachetului intră în motorul de preț (rândul „RA Insight Pro" pe factură
//      și în registru), anexa îl îngheață cu prețurile celorlalte, contractul și oferta scriu clauza de trecere; pe server,
//      oferta cu pachet → contract → pachetul pe firmă (fără să calce unul existent) → rândul de pe factură;
//   5. pasul 6 — trecerea la alt pachet, din aplicație: regula (mai mare de azi, cu luna pe zile; mai mic de la 1 a lunii
//      următoare; conturile), textul confirmat, factura pe zile din istoric; pe server, administratorul confirmă (bifa, textul
//      exact), confirmarea pleacă pe email cu PDF (Brevo fals), rămâne în „Pachet și conturi", iar factura adaugă diferența.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('./pachete');
const { puneParola } = require('./test_parola');
const http = require('http');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────
console.log('1. Regula pachetelor (pachete.js)');
const p = (c) => P.dupaCod(c);
T('patru pachete, în ordine: Start, Basic, Pro, Business', P.PACHETE.map((x) => x.nume).join() === 'Start,Basic,Pro,Business');
T('Start: 0 lei, 1 cont (administratorul), 50 de răspunsuri, fără AI, fără ramuri', p('start').pret === 0 && p('start').conturi === 1 && p('start').intrebari === 50 && !p('start').ai && !p('start').ramuri && p('start').doarAdmin);
T('Basic: 10 lei, 2 conturi, 200 de întrebări la comun, cu AI și ramuri, fără împărțire', p('basic').pret === 10 && p('basic').conturi === 2 && p('basic').intrebari === 200 && p('basic').ai && p('basic').ramuri && !p('basic').imparte);
T('Pro: 20 de lei, până la 5 conturi, 600 de întrebări, împărțire', p('pro').pret === 20 && p('pro').conturi === 5 && p('pro').intrebari === 600 && p('pro').imparte);
T('Business: 30 de lei, conturi nelimitate, 1.000 de întrebări, împărțire', p('business').pret === 30 && p('business').conturi === null && p('business').intrebari === 1000 && p('business').imparte);
// Din 28.10 fără bugetul de analiză aprofundată pe Sonnet (Alin: „nu o mai vreau… avem Haiku"; „1 da" la analiza atentă pe Haiku).
T('niciun pachet nu mai are buget de Sonnet, iar alegerea modelului a ieșit din regulă', P.PACHETE.every((x) => !('sonnetLei' in x)) && P.alegeModel === undefined && P.REZERVA_APROFUNDAT_LEI === undefined);
T('plasa: 80% din preț (8 / 16 / 24 de lei); la Start, 0', P.PLASA === 0.8 && P.plafonLei(p('basic')) === 8 && P.plafonLei(p('pro')) === 16 && P.plafonLei(p('business')) === 24 && P.plafonLei(p('start')) === 0);
const fs1 = (s) => P.pachetFirma(s);
T('firma fără nimic scris → Start (orice firmă începe cu Start)', fs1({}).cod === 'start' && fs1(null).cod === 'start' && fs1('{}').cod === 'start');
T('firma pe regula veche, pe cont (întrebări pe cont sau cotă fixă) → null: o citește regula veche', fs1({ ai_quota: { questionsPerSeat: 50 } }) === null && fs1({ ai_quota: { questions: 300 } }) === null);
T('pachetul scris pe firmă, cu prețul semnat (18 lei bate 20)', fs1({ ai_pachet: { cod: 'pro' } }).cod === 'pro' && fs1({ ai_pachet: { cod: 'pro' } }).pretRON === 20 && fs1({ ai_pachet: { cod: 'pro', pretRON: 18 } }).pretRON === 18 && P.plafonLei(fs1({ ai_pachet: { cod: 'pro', pretRON: 18 } })) === 14.4);
T('pachetul bate regula veche rămasă pe firmă; setările ca text se citesc', fs1({ ai_pachet: { cod: 'basic' }, ai_quota: { questionsPerSeat: 50 } }).cod === 'basic' && fs1(JSON.stringify({ ai_pachet: { cod: 'business' } })).cod === 'business');
T('curataPachet: cod necunoscut / preț stricat → null; fără preț → prețul de pornire', P.curataPachet({ cod: 'gold' }) === null && P.curataPachet({ cod: 'pro', pretRON: -1 }) === null && P.curataPachet({ cod: 'pro', pretRON: 'x' }) === null && P.curataPachet({ cod: 'basic' }).pretRON === 10 && P.curataPachet({ cod: 'BASIC', pretRON: '12.345' }).pretRON === 12.35);

console.log('   conturile');
T('Start: un coleg (manager) nu primește RA Insight', /doar administratorul/.test(P.refuzLoc(p('start'), 0, 'manager') || ''));
T('Start: administratorul primește singurul loc; al doilea administrator, nu', P.refuzLoc(p('start'), 0, 'company_admin') === null && P.refuzLoc(p('start'), 0, 'admin') === null && !!P.refuzLoc(p('start'), 1, 'company_admin'));
T('Basic: al treilea cont se refuză, cu drumul spre Pro', P.refuzLoc(p('basic'), 1, 'manager') === null && P.refuzLoc(p('basic'), 2, 'manager') === 'Pachetul Basic are 2 conturi, toate date. Pentru mai mulți oameni, treceți la Pro (până la 5 conturi).', P.refuzLoc(p('basic'), 2, 'manager'));
T('Pro: al șaselea, spre Business (conturi nelimitate); Business: niciodată plin', /treceți la Business \(conturi nelimitate\)/.test(P.refuzLoc(p('pro'), 5, 'viewer') || '') && P.refuzLoc(p('business'), 500, 'viewer') === null);

console.log('   împărțirea întrebărilor');
T('Basic: toți folosesc aceleași întrebări (limita pe om e de la Pro)', /toți cei cu RA Insight folosesc aceleași întrebări\. Limita pe om e de la Pro în sus/.test(P.refuzLimita(p('basic'), 50, 0) || ''));
T('Pro: 100 lângă 300 date altora — da; 400 lângă 300 — nu, cu „cel mult 300"', P.refuzLimita(p('pro'), 100, 300) === null && /Mai puteți da cel mult 300\./.test(P.refuzLimita(p('pro'), 400, 300) || ''), P.refuzLimita(p('pro'), 400, 300));
T('Pro: limita e un întreg ≥ 0; gol = „Fără limită"', !!P.refuzLimita(p('pro'), 2.5, 0) && !!P.refuzLimita(p('pro'), -1, 0) && P.refuzLimita(p('pro'), null, 0) === null && P.refuzLimita(p('pro'), 0, 0) === null);

console.log('   starea');
const st = (cod, o) => P.stare(Object.assign({ pachet: Object.assign(p(cod), { pretRON: p(cod).pret }), peOm: true }, o));
T('Basic, 120 din 200: merge, 80 rămase', !st('basic', { folositeFirma: 120 }).blocat && st('basic', { folositeFirma: 120 }).ramase === 80);
T('Basic, 200 din 200: se oprește (cota)', st('basic', { folositeFirma: 200 }).motiv === 'cota');
T('plasa: 8 lei cheltuiți pe Basic oprește RA Insight chiar cu întrebări rămase (și înaintea cotei)', st('basic', { folositeFirma: 10, costLei: 8 }).motiv === 'plasa' && st('basic', { folositeFirma: 200, costLei: 9 }).motiv === 'plasa' && st('basic', { costLei: 7.99 }).blocat === false);
T('Start nu are plasă (n-are AI): oprit doar la 50 de răspunsuri', st('start', { folositeFirma: 49, costLei: 100 }).blocat === false && st('start', { folositeFirma: 50 }).motiv === 'cota');
T('Pro: omul cu limita 100 ajunsă se oprește (limita), colegii nu', st('pro', { folositeFirma: 150, limitaOm: 100, folositeOm: 100, sumaLimite: 100, folositeCuLimita: 100 }).motiv === 'limita' && !st('pro', { folositeFirma: 150, limitaOm: null, sumaLimite: 100, folositeCuLimita: 100 }).blocat);
T('Pro: ce rămâne celor fără limită (600 − 500 date cu limită) se termină → oprit; cu limită, merge', st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }).motiv === 'comun' && !st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60, limitaOm: 200, folositeOm: 60 }).blocat);
T('starea FIRMEI (fără om) se oprește doar la plasă și cotă, nu la limita sau partea unui om', !P.stare({ pachet: p('pro'), folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }).blocat);
T('procentul din plasă nu trece de 100%', st('pro', { costLei: 40 }).plasaProcent === 1 && st('pro', { costLei: 8 }).plasaProcent === 0.5);

console.log('   analiza atentă (28.10): ce întrebări o primesc');
const INS = require('./insight');
T('„de ce", „din ce cauză", „compară", „ce să fac", „ce pot face", „motivul" → analiza atentă',
  ['De ce a crescut consumul?', 'Din ce cauză a scăzut nivelul?', 'Compară B 154 UIP cu B 268 ROY.', 'Ce să fac cu ralantiul?', 'Ce pot face ca să scadă consumul?', 'Care e motivul opririi?'].every((q) => INS.esteAnaliza(q)));
T('…dar nu „scrie-i", „cum pot", „explică raportul" sau o întrebare obișnuită (acolo forma fixă n-ar avea sens)',
  ['Scrie-i lui Ion un mesaj', 'Cum pot pune o alertă?', 'Explică raportul', 'Câți km a făcut flota luna asta?'].every((q) => !INS.esteAnaliza(q)));
T('textul analizei atente: comparația cu perioada dinainte și forma Ce s-a întâmplat → De ce → Ce poți face', /perioada dinainte/.test(INS.ANALIZA_ATENTA) &&
  /\*\*Ce s-a întâmplat\*\*/.test(INS.ANALIZA_ATENTA) && /\*\*De ce\*\*/.test(INS.ANALIZA_ATENTA) && /\*\*Ce poți face\*\*/.test(INS.ANALIZA_ATENTA));

console.log('   textele');
const OCT = Date.parse('2026-10-14T09:00:00Z'), DEC = Date.parse('2026-12-20T09:00:00Z');
T('se reîncarcă pe 1 a lunii următoare (decembrie → ianuarie), pe ora României', P.reincarcare(OCT).urmatoarea === 'noiembrie' && P.reincarcare(DEC).urmatoarea === 'ianuarie' && P.reincarcare(Date.parse('2026-10-31T22:30:00Z')).luna === 'noiembrie');
const tPlasa = P.textBlocat(st('basic', { costLei: 9 }), OCT);
T('plasa: clientul află că s-a oprit și când revine — fără lei, fără procente, fără „cost" în afară de „fără niciun cost în plus"', /1 noiembrie/.test(tPlasa) && !/lei|%|\d{2,}/.test(tPlasa) && tPlasa.replace('fără niciun cost în plus', '').indexOf('cost') < 0, tPlasa);
T('cota: „Ați folosit cele 200 de întrebări din octombrie" + butoanele', /Ați folosit cele 200 de întrebări din octombrie\. Se reîncarcă pe 1 noiembrie/.test(P.textBlocat(st('basic', { folositeFirma: 200 }), OCT)) && /întrebările de pe butoane/.test(P.textBlocat(st('basic', { folositeFirma: 200 }), OCT)));
T('limita: „Ai folosit cele 2 întrebări date de administrator" + vorbește cu administratorul', /Ai folosit cele 2 întrebări date de administrator pentru octombrie/.test(P.textBlocat(st('pro', { limitaOm: 2, folositeOm: 2 }), OCT)) && /administratorul firmei/.test(P.textBlocat(st('pro', { limitaOm: 2, folositeOm: 2 }), OCT)));
T('Start la capăt: cele 50 de răspunsuri + ce aduce Basic', /Ați folosit cele 50 de răspunsuri din octombrie ale pachetului Start/.test(P.textBlocat(st('start', { folositeFirma: 50 }), OCT)) && /Cu Basic/.test(P.textBlocat(st('start', { folositeFirma: 50 }), OCT)));
T('Start, întrebarea liberă: de la Basic (200 de întrebări), fără preț', /de la pachetul \*\*Basic\*\* \(200 de întrebări pe lună\)/.test(P.textDoarButoane()) && !/lei/.test(P.textDoarButoane()));
T('rândul de lângă casetă: „34 din 50 de răspunsuri pe butoane rămase în octombrie" / „412 din 600 rămase în octombrie"', P.textRamase(st('start', { folositeFirma: 16 }), OCT) === '34 din 50 de răspunsuri pe butoane rămase în octombrie' && P.textRamase(st('pro', { folositeFirma: 188 }), OCT) === '412 din 600 rămase în octombrie', P.textRamase(st('start', { folositeFirma: 16 }), OCT));
T('„de" se pune după cifră (1–19 fără, 20+ cu)', P.deNr(19) === ' ' && P.deNr(20) === ' de ' && P.deNr(101) === ' ' && P.deNr(120) === ' de ');
T('contorul de lângă casetă: „34 din 50" / „îți rămân 38" (omul cu limită)', P.textScurt(st('start', { folositeFirma: 16 })) === '34 din 50' && P.textScurt(st('pro', { folositeFirma: 150, limitaOm: 100, folositeOm: 62, sumaLimite: 100, folositeCuLimita: 62 })) === 'îți rămân 38');
T('rândul omului cu limită: „Tu: 38 din 100 (limita dată de administrator)"; fără limită, niciun rând', P.textOm(st('pro', { limitaOm: 100, folositeOm: 62, sumaLimite: 100 })) === 'Tu: 38 din 100 (limita dată de administrator)' && P.textOm(st('pro', { folositeFirma: 3 })) === null);
T('la plasă ecranul arată 0 rămase (oprit pe lună), fără să spună de ce în bani', P.textRamase(st('basic', { folositeFirma: 1, costLei: 9 }), OCT) === '0 din 200 rămase în octombrie' && P.textScurt(st('basic', { folositeFirma: 1, costLei: 9 })) === '0 din 200' && P.ramaseAfisate(st('basic', { folositeFirma: 1 })) === 199);
T('cele pentru cei fără limită s-au terminat: „îți rămân 0" + „Tu: s-au terminat întrebările pentru cei fără limită" (macheta din 15.10, fără „la comun")', P.textScurt(st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 })) === 'îți rămân 0' && P.textOm(st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 })) === 'Tu: s-au terminat întrebările pentru cei fără limită' && !/la comun/.test(P.textBlocat(st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }), OCT)));
T('limita cea mai veche de pe firmă (ai_monthly_limit) = regula veche, nu Start', P.pachetFirma({}, 80) === null && P.pachetFirma({}, 0).cod === 'start' && P.pachetFirma({ ai_pachet: { cod: 'basic' } }, 80).cod === 'basic');
const pub = P.publice({}), pubSite = P.publice({ cuPret: false });
// Pachetele refăcute pe 27.10 (Alin: „da" la lista rămasă în urmă; „fără preț pe site, cu prețuri în aplicație"): cartonașul spune ce
// primești (Start) sau ce adaugă față de pachetul dinainte; cifrele de sus vin din PACHETE, nu din text.
T('descrierile pachetelor: un singur loc — ce primești la Start, ce adaugă fiecare față de cel dinainte, prețul doar în aplicație',
  pub.length === 4 && pub.map((p) => p.plus).join('|') === 'Ce primești|În plus față de Start|În plus față de Basic|În plus față de Pro' &&
  pub[0].pret === 'Inclus' && pub[2].pret === '20 de lei' && pubSite.every((p) => p.pret === undefined) && pubSite[1].subPret === 'Cere ofertă' &&
  pub.filter((p) => p.eticheta).map((p) => p.cod).join() === 'basic', JSON.stringify(pub.map((p) => [p.plus, p.pret, p.eticheta])));
T('lista spune ce face aplicația azi: „Azi la tine”, rapoartele cerute în cuvinte, „RA Insight face, cu Da-ul tău”, „Șoferi pe mașini”',
  pub[0].include.some((x) => /Azi la tine/.test(x)) && pub[0].include.some((x) => /Rapoarte cerute în cuvinte/.test(x)) &&
  pub[1].include.some((x) => /„Da”-ul tău/.test(x)) && pub[1].include.some((x) => /Șoferi pe mașini/.test(x)));
T('cifrele cartonașelor vin din PACHETE (conturi, întrebări libere, răspunsuri pe loc), iar textele cu cifre se potrivesc cu ele',
  JSON.stringify(pub.map((p) => p.cifre.map((c) => c.val))) === JSON.stringify([['1 · administratorul', null, '50 pe lună'], ['2', '200 pe lună', 'fără limită'], ['până la 5', '600 pe lună', 'fără limită'], ['nelimitate', '1.000 pe lună', 'fără limită']]) &&
  pub[2].include.some((x) => x.indexOf('Până la ' + P.dupaCod('pro').conturi + ' oameni') === 0) && pub[2].include.some((x) => x.indexOf(': ' + P.dupaCod('pro').intrebari + ' pe lună') > 0) &&
  P.dupaCod('pro').intrebari === 3 * P.dupaCod('basic').intrebari && pub[3].include.some((x) => x === P.dupaCod('business').intrebari.toLocaleString('ro-RO') + ' de întrebări pe lună'),
  JSON.stringify(pub.map((p) => p.cifre.map((c) => c.val))));
T('analiza aprofundată (Sonnet) nu mai e în pachete — Alin, 27.10: „nu o mai vreau"', ![].concat(...pub.map((p) => p.include)).some((x) => /aprofundat/i.test(x)));
// Comparația rând cu rând: aceleași rânduri în aplicație și pe site; rândul cu prețul pe întrebare doar în aplicație, socotit din prețuri.
const cmpA = P.comparatie({ cuPret: true, preturi: { start: 0, basic: 10, pro: 20, business: 30 } }), cmpS = P.comparatie({ cuPret: false });
const rand = (c, t) => [].concat(...c.map((g) => g.randuri)).find((r) => r.t === t);
const cel = (r) => r.v.map((x) => x.da === true ? '✓' : x.da === false ? '—' : x.text).join(' | ');
T('comparația: conturi, întrebări libere (Basic „la comun”), răspunsuri pe loc, pagini și „Da"-ul de la Basic, „Azi la tine" peste tot',
  cel(rand(cmpS, 'Conturi RA Insight')) === '1 | 2 | până la 5 | nelimitate' && cel(rand(cmpS, 'Întrebări libere, cu AI')) === '— | 200 pe lună | 600 pe lună | 1.000 pe lună' &&
  rand(cmpS, 'Întrebări libere, cu AI').v[1].mic === 'la comun' && cel(rand(cmpS, 'Răspunsuri pe loc, din rapoarte')) === '50 pe lună | fără limită | fără limită | fără limită' &&
  cel(rand(cmpS, 'Paginile RA Insight')) === '— | ✓ | ✓ | ✓' && cel(rand(cmpS, 'RA Insight face, cu „Da”-ul tău')) === '— | ✓ | ✓ | ✓' && cel(rand(cmpS, '„Azi la tine”')) === '✓ | ✓ | ✓ | ✓',
  JSON.stringify(cmpS.map((g) => g.randuri.map((r) => r.t + ': ' + cel(r)))));
T('…prețul pe o întrebare liberă doar în aplicație: 5 bani / 3,3 bani / 3 bani la prețurile de listă (Start: —); pe site lipsește',
  cel(rand(cmpA, 'Preț pe o întrebare liberă')) === '— | 5 bani | 3,3 bani | 3 bani' && !rand(cmpS, 'Preț pe o întrebare liberă') &&
  cel(rand(P.comparatie({ cuPret: true, preturi: { basic: 12 } }), 'Preț pe o întrebare liberă')).split(' | ')[1] === '6 bani', cel(rand(cmpA, 'Preț pe o întrebare liberă') || { v: [] }));
T('„În toate pachetele": cinci rânduri; insignele numite ca în aplicație; conversațiile păstrate cât spune contracts.js',
  P.IN_TOATE.length === 5 && P.IN_TOATE[3].d.indexOf('„' + P.insigna('ai', { numarat: true }).eticheta + ' · ' + P.insigna('ai', { numarat: true }).detaliu + '”') === 0 &&
  P.IN_TOATE[3].d.indexOf('„' + P.insigna('instant', {}).eticheta + ' · ' + P.insigna('instant', {}).detaliu + '”') > 0 &&
  P.IN_TOATE[2].d.indexOf('Se păstrează ' + require('./contracts').LUNI_CONVERSATII_AI + ' luni') >= 0 &&
  rand(cmpS, 'RA Insight face, cu „Da”-ul tău').d.indexOf('timp de ' + require('./soferi_masini').ANULARE_MIN + ' minute') > 0, JSON.stringify(P.IN_TOATE[3]));
// „Sursă externă" în ce primește fiecare pachet (29.10; Alin: „da, dar nu le punem preț extra"): cifrele din sursa_externa.PE_PACHET,
// spuse ca parte din întrebările pachetului; Start fără; niciun preț — nici în aplicație, unde comparația are prețuri.
{
  const SE = require('./sursa_externa');
  const rS = rand(cmpS, 'Întrebări cu „Sursă externă”'), rA = rand(cmpA, 'Întrebări cu „Sursă externă”');
  const asteptat = P.PACHETE.map((p) => SE.PE_PACHET[p.cod] ? SE.PE_PACHET[p.cod] + ' pe lună' : '—').join(' | ');
  const cuSursa = (i) => pub[i].include.filter((x) => /Sursă externă/.test(x));
  T('„Sursă externă" în pachete: cifrele din sursa_externa.PE_PACHET, „din cele 200 / 600 / 1.000", Start fără, niciun preț (Alin, 29.10: „nu le punem preț extra")',
    !!rS && !!rA && cel(rS) === asteptat && cel(rA) === asteptat && rS.d === SE.EXPLICATIE &&
    rS.v.slice(1).map((x) => x.mic).join() === P.PACHETE.slice(1).map((p) => 'din cele ' + p.intrebari.toLocaleString('ro-RO')).join() &&
    !/lei|bani|€/.test(JSON.stringify(rA)) && cuSursa(0).length === 0 &&
    cuSursa(1).length === 1 && cuSursa(1)[0].indexOf('(' + SE.PE_PACHET.basic + ' întrebări pe lună, din cele ' + P.dupaCod('basic').intrebari + ')') > 0 &&
    cuSursa(2).length === 1 && cuSursa(2)[0] === 'Sursă externă: ' + SE.PE_PACHET.pro + ' de întrebări pe lună, din cele ' + P.dupaCod('pro').intrebari &&
    cuSursa(3).length === 1 && cuSursa(3)[0] === 'Sursă externă: ' + SE.PE_PACHET.business + ' de întrebări pe lună, din cele ' + P.dupaCod('business').intrebari.toLocaleString('ro-RO'),
    cel(rS || { v: [] }) + ' · ' + JSON.stringify([cuSursa(1), cuSursa(2), cuSursa(3)]));
}
const stPro = st('pro', { folositeFirma: 188, sumaLimite: 300 });
const cc = P.cartonaseConturi(stPro, 4, OCT);
T('„Pachet și conturi" (cartonașele, pentru telefon): Pro · 20 de lei pe lună · 412 din 600 · 4 din 5 (mai poți da unul) · 300 date cu limită', cc.map((x) => x.val + '|' + x.sub).join(' / ') === 'Pro|20 de lei pe lună / 412|din 600 · se reîncarcă pe 1 noiembrie / 4|din 5 · mai poți da unul / 300|ceilalți folosesc restul de 300', cc.map((x) => x.val + '|' + x.sub).join(' / '));
const rz = P.rezumatConturi(stPro, 4, OCT);
T('„Pachet și conturi" pe web, pe un rând (macheta din 15.10): conturile, întrebările rămase, reîncărcarea; pe al doilea, cât e dat cu limită', JSON.stringify(rz) === JSON.stringify(['Conturi: 4 din 5 · Întrebări rămase: 412 din 600 (se reîncarcă pe 1 noiembrie)', 'Date cu limită: 300 de întrebări · ceilalți folosesc restul de 300.']), JSON.stringify(rz));
T('…pe Start: „Răspunsuri pe butoane rămase", un singur rând; Business: „(nelimitate)"', JSON.stringify(P.rezumatConturi(st('start', { folositeFirma: 16 }), 1, OCT)) === JSON.stringify(['Conturi: 1 din 1 · Răspunsuri pe butoane rămase: 34 din 50 (se reîncarcă pe 1 noiembrie)']) && /^Conturi: 7 \(nelimitate\)/.test(P.rezumatConturi(st('business', {}), 7, OCT)[0]), JSON.stringify(P.rezumatConturi(st('start', { folositeFirma: 16 }), 1, OCT)));
T('„Pachet și conturi" pe Start: trei cartonașe (fără limite), „inclus în contract", „1 din 1 · toate date"', P.cartonaseConturi(st('start', { folositeFirma: 16 }), 1, OCT).map((x) => x.val + '|' + x.sub).join(' / ') === 'Start|inclus în contract / 34|din 50 · se reîncarcă pe 1 noiembrie / 1|din 1 · toate date');
T('cât a folosit omul: „58 din 200" cu limită, „64" fără; nota spune ce înseamnă „Fără limită" și „Cel mult…" (fără „la comun")', P.textFolositeOm(200, 58) === '58 din 200' && P.textFolositeOm(null, 64) === '64' && /„Fără limită”/.test(P.notaConturi(P.dupaCod('pro'))) && /„Cel mult … pe lună”/.test(P.notaConturi(P.dupaCod('pro'))) && !/comun/i.test(P.notaConturi(P.dupaCod('pro')) + P.notaConturi(P.dupaCod('basic'))) && /doar administratorul/.test(P.notaConturi(P.dupaCod('start'))));
T('pe site, fără prețuri: „Cere ofertă" (Alin, 14.10)', pubSite.every((x) => x.pret == null) && pubSite[1].subPret === 'Cere ofertă' && pubSite[0].subPret === 'în orice contract');

// ─── 2. Sursa ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Sursa: o singură numărătoare, ramurile închise pe Start, banii nu pleacă la client');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const corp = (nume) => { const i = SRV.indexOf('function ' + nume + '('); if (i < 0) return ''; const j = SRV.indexOf('\n}\n', i); return SRV.slice(i, j); };
T('răspunsurile pe butoane se scriu într-un singur loc (_numaraRaspunsReguli)', (SRV.match(/db\.noteazaRaspunsReguli\(/g) || []).length === 2 && /db\.noteazaRaspunsReguli\(/.test(corp('_numaraRaspunsReguli')), (SRV.match(/db\.noteazaRaspunsReguli\(/g) || []).length + ' (una e ruta de probă)');
T('…chemat de chat, de ruta AI Raport (telefonul vechi), de „Rezumă raportul", de rapoartele cerute în cuvinte (15.10) și de rapoartele unei cereri „…și compară" când RA Insight nu poate face judecata (Start, luna oprită)', (SRV.match(/await _numaraRaspunsReguli\(req, /g) || []).length === 5 && (SRV.match(/await _numaraRaspunsReguli\(req, gata\.sp, /g) || []).length === 1, (SRV.match(/await _numaraRaspunsReguli\(req, /g) || []).length);
T('ce vede omul despre pachet (_cotaDinPachet, _pachetPeEcran) nu are cost, plasă sau buget', !/cost|plafon|plasa|aprofund/i.test(corp('_cotaDinPachet')) && !/cost|plafon|plasa|aprofund/i.test(corp('_pachetPeEcran')));
const RAMURI_RUTE = ["get('/api/insight/safe-drive'", "put('/api/insight/safe-drive/preturi'", "post('/api/insight/safe-drive/discutie'", "delete('/api/insight/safe-drive/discutie/:id'", "get('/api/insight/mentenanta'", "get('/api/insight/combustibil'", "get('/api/insight/ore-condus'", "get('/api/insight/ramuri'"];
T('ramurile (8 rute) cer pachetul cu ramuri (requireRamuri)', RAMURI_RUTE.every((r) => { const i = SRV.indexOf('app.' + r); return i >= 0 && /requireRamuri/.test(SRV.slice(i, SRV.indexOf('\n', i))); }), RAMURI_RUTE.filter((r) => { const i = SRV.indexOf('app.' + r); return !(i >= 0 && /requireRamuri/.test(SRV.slice(i, SRV.indexOf('\n', i)))); }).join(' | '));
T('scrisoarea de luni pe Start: pe reguli, fără Safe Drive; tura de noapte de Safe Drive doar la firmele cu ramuri', /faraAi: !!\(pF && !pF\.ai\)/.test(SRV) && /faraSafeDrive: !!\(pF && !pF\.ramuri\)/.test(SRV) && /_firmaAreRamuri\(co\); \}\);   \/\/ ramurile/.test(SRV));
T('rezumatul agenților nu cheamă modelul pe Start', /if \(_co && !_firmaAreAi\(_co\)\) _aiAllowed = false;/.test(SRV));
T('pachetul îl scrie doar super-adminul (allowFeatures), iar un pachet pus scoate regula veche', /body\.ai_pachet !== undefined && opts && opts\.allowFeatures/.test(SRV) && /next\.ai_pachet = ap; delete next\.ai_quota;/.test(SRV));
T('„Asistent AI" (suma fixă veche) se plătește doar unde modulul e pornit de noi (plans.js + pagina)', /featuresSetate\(company\)\.ai_assistant === true/.test(fs.readFileSync(path.join(__dirname, 'plans.js'), 'utf8')) && /setate && setate\.ai_assistant === true/.test(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')));
T('ai_reguli e în copii (BUSINESS_TABLES) și pleacă odată cu firma', /'ai_reguli'/.test(fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8')) && /DELETE FROM ai_reguli WHERE company_id/.test(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8')));
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const blocIns = (PAG.split('// ── începe „secțiunea RA Insight" ──')[1] || '').split('// ── sfârșit „secțiunea RA Insight" ──')[0];
const G = require('./insight_ghid');
T('pagina: pachetul (un rând, macheta „mai simplu" din 15.10) și contorul arată textele serverului (nume · scurt; text / textOm / reîncărcarea la mouse), ca text', /function deseneazaPachet\(box, q\)/.test(blocIns) && /box\.textContent = p\.nume \+ ' · ' \+ String\(p\.scurt \|\| ''\);/.test(blocIns) && /box\.title = \[p\.text, p\.textOm, p\.reincarcare\]\.filter\(Boolean\)\.join\(' · '\);/.test(blocIns) && /if \(S\.pachet\) return String\(S\.pachet\.scurt \|\| ''\);/.test(blocIns) && /c\.textContent = S\.contor \|\| '';/.test(blocIns));
T('pagina: „Vezi pachetele" doar la administrator (în mesajul pachetului și pe pagina încuiată); fereastra cere /api/insight/pachete', /if \(esteAdmin\(\)\) \{ var bv = el\('button', 'chat-pas ins'\)/.test(blocIns) && /if \(esteAdmin\(\)\) \{ var b = el\('button', 'chat-pas'\)/.test(blocIns) && /cere\('GET', '\/api\/insight\/pachete'\)/.test(blocIns));
T('pagina: ramurile de la Basic apar încuiate pe Start („· Basic"), cu pagina lor de lămurire', /ramuraIncuiata\(r\)/.test(blocIns) && /'· Basic'/.test(blocIns) && /deseneazaIncuiata\(main\)/.test(blocIns) && /pachet: true \}/.test(blocIns));
// Continuările stau în trei locuri (conversația redeschisă, răspunsul proaspăt, pasul următor de după „Da" — pasul 2, 22.10),
// plus butoanele de ales: patru, toate cu `buton`.
T('pagina: butoanele (cartonașe, continuări, alegeri, casetă făcută din butoane) trimit `buton`, scrisul de mână nu', (blocIns.match(/insightTrimite\(t, \{ buton: true \}\)/g) || []).length === 4 && /insightTrimite\(c\.q, \{ buton: true \}\)/.test(blocIns) && /if \(buton\) corp\.buton = true;/.test(blocIns) && /if \(ev && ev\.inputType\) delete t\.dataset\.buton;/.test(blocIns) && /ta\.dataset\.buton = '1'/.test(PAG));
T('pagina: mesajul pachetului în caseta de avertizare; fără eticheta „analiză aprofundată" (Sonnet scos pe 28.10; insigna rămâne „Analiză · 1 întrebare")', /x\.limita \|\| x\.pachetMesaj/.test(blocIns) && blocIns.indexOf('chat-aprof') < 0 && /limita: j\.limita, pachetMesaj: j\.pachetMesaj/.test(blocIns) && !/aprofundat/.test(blocIns));
T('„Pachet și conturi": pagina în secțiune (doar textele serverului), deschisă din rândul pachetului (administratorul), din „⋯" și din Utilizatori', /async function deseneazaPachetConturi\(main\)/.test(blocIns) && /cere\('GET', '\/api\/insight\/pachet-conturi'\)/.test(blocIns) && /box\.onclick = esteAdmin\(\) \? function \(\) \{ window\.insightRamura\('pachet'\); \} : null;/.test(blocIns) && /else if \(x\.k === 'pachet' \|\| x\.k === 'ghid'\) window\.insightRamura\(x\.k\);/.test(blocIns) && /onclick="insightPachetConturi\(\)"/.test(PAG));
// Macheta din 15.10 (Alin: „3. da, 4. da, 5. da"): un singur loc pentru conturi, „Fără limită" / „Cel mult … pe lună", rezumatul.
T('„Pachet și conturi": sus, rezumatul serverului pe rânduri (cu bara), fără cartonașe', /\(j\.rezumat \|\| \[\]\)\.forEach\(function \(t, i\) \{ rz\.appendChild\(el\('div', i \? 'pkc-rez-2' : null, t\)\); \}\);/.test(blocIns) && blocIns.indexOf('pkc-tiles') < 0 && blocIns.indexOf('pkc-tile') < 0);
T('…pe om: „Fără limită" / „Cel mult…" (caseta cifrei doar la „Cel mult"), fără „la comun"', /\[\['fara', 'Fără limită'\], \['cel', 'Cel mult…'\]\]/.test(blocIns) && /if \(sel\.value === 'fara'\) \{ arata\(false\); if \(cuLim\) window\.insightLimita\(o\.id, ''\); \}/.test(blocIns) && blocIns.indexOf("'la comun'") < 0 && !/la comun/.test(blocIns));
T('Utilizatori, pe o firmă cu pachet: doar eticheta „RA Insight" pe rând și „Schimbă în Pachet și conturi →" (butonul baghetă doar pe regula veche)', /\(u\.role === 'superadmin' \|\| _usrPachet \? '' :/.test(PAG) && /_usrPachet && u\.ai_seat \? '<span class="rau-ra"/.test(PAG) && PAG.indexOf('Schimbă în Pachet și conturi →') > 0);
T('omul fără cont, pe o firmă cu pachet: mesajul îl trimite la „Pachet și conturi" (pe regula veche, tot la Utilizatori)', /const MESAJ_FARA_LOC_PACHET = '[^']*RA Insight → „Pachet și conturi”/.test(SRV) && /return _pachetCo\(await db\.getCompanyById\(companyId\)\) \? MESAJ_FARA_LOC_PACHET : MESAJ_FARA_LOC_AI;/.test(SRV) && /const mesaj = await _mesajFaraLoc\(req\.companyId\);/.test(SRV));
T('administratorul fără cont RA Insight al lui tot ajunge în „Pachet și conturi" (singurul loc din care se dau conturile): din „⋯" și din cartonașul „nu e pornit"', /if \(S\.ramura === 'pachet' && esteAdmin\(\)\) return deseneazaPachetConturi\(main\);/.test(blocIns) && blocIns.indexOf("if (S.ramura === 'pachet' && esteAdmin()) return deseneazaPachetConturi(main);") < blocIns.indexOf('if (S.faraLoc) {\n          main.innerHTML') && /if \(esteAdmin\(\) && \(S\.pachet \|\| S\.faraLoc\)\) l\.push\(\{ text: 'Pachet și conturi'/.test(blocIns) && /'Deschide Pachet și conturi'/.test(blocIns));
T('ghidul spune drumul nou și nu mai pomenește factura unui cont', /„Pachet și conturi"/.test(G.SECTIUNI.find((x) => x.cheie === 'ra_insight').pasi.join(' ')) && !/se facturează un cont în plus/.test(JSON.stringify(G.SECTIUNI)));
T('…conturile și limitele pleacă pe rutele lor (ai-seat, ai-limita), nu pe o cale nouă', /cere\('PUT', '\/api\/users\/' \+ id \+ '\/ai-seat'/.test(blocIns) && /cere\('PUT', '\/api\/users\/' \+ id \+ '\/ai-limita'/.test(blocIns));
// Din 28.10 (Alin: „1 da") analiza aprofundată pe Sonnet a ieșit: comutatorul ei nu mai e în tablou, ruta nu mai există.
T('tabloul nostru: blocul pachetelor și rândul pachetului în amănuntul firmei, din cifrele serverului (fără comutatorul analizei pe Sonnet)', /function _aiuPachete\(p\)/.test(PAG) && /function _aiuPachetRand\(r\)/.test(PAG) && /_aiuPachete\(d\.pachete\)/.test(PAG) && PAG.indexOf('/api/admin/insight/aprofundat') < 0 && SRV.indexOf("'/api/admin/insight/aprofundat'") < 0 && /fetch\('\/api\/admin\/insight\/sold', \{ method: 'PUT'/.test(PAG));
T('anunțul pentru noi la 60% din plasă și la plasă: o dată pe firmă, lună și prag, ținut minte în setări', /const PLASA_ANUNT_PROCENT = 60;/.test(SRV) && /_anuntaSuperadmini\(supers, 'ai_plasa'/.test(SRV) && /db\.setSetting\('ai_plasa_anuntat'/.test(SRV) && /setInterval\(\(\) => plasaAnuntTick\(\)/.test(SRV));
T('fila „Acces" a firmei: pachetul se pune de aici (super-admin), cu întrebare', /window\.raxCfgPachet = async function \(cod\)/.test(PAG) && /body: JSON\.stringify\(\{ ai_pachet: \{ cod: cod \} \}\)/.test(PAG));
T('„Dai RA Insight acestui cont?" pe un pachet nu mai spune că se facturează un cont în plus', /Prețul pachetului rămâne același, oricâte conturi dai\./.test(PAG));
const plans = require('./plans');
T('RA Insight e pornit implicit (Start inclus); unde l-am oprit noi, rămâne oprit', plans.featuresFor({ settings: {} }).ai_assistant === true && plans.featuresFor({ settings: { features: { ai_assistant: false } } }).ai_assistant === false);
T('suma veche „Asistent AI" nu apare pe factura unei firme care n-a cumpărat modulul', plans.computeCompanyPrice({ settings: {}, custom_plan: { priceNoneRON: 45, aiAssistantRON: 150 } }, { none: 2 }, { features: plans.featuresFor({ settings: {} }) }).monthlyTotal === 90 &&
  plans.computeCompanyPrice({ settings: { features: { ai_assistant: true } }, custom_plan: { priceNoneRON: 45, aiAssistantRON: 150 } }, { none: 2 }, { features: { ai_assistant: true } }).monthlyTotal === 240);

// ─── 2b. Pasul 5: oferta, contractul, factura (fără server) ─────────────────────────────────────────
console.log('\n2b. Pasul 5: prețul pachetului în preț, anexă, contract, ofertă');
const CTR = require('./contracts');
const pret = (settings, n, feats) => plans.computeCompanyPrice({ settings: settings, custom_plan: { priceNoneRON: 45 } }, { none: n || 2 }, { features: feats || plans.featuresFor({ settings: settings }) });
const prPro = pret({ ai_pachet: { cod: 'pro', pretRON: 20 } });
T('Pro (20 lei): un rând fix pe FIRMĂ în motorul de preț — 2 × 45 + 20 = 110, eticheta „RA Insight Pro"',
  prPro.monthlyTotal === 110 && prPro.breakdown.aiPachet === 20 && prPro.breakdown.aiPachetEticheta === 'RA Insight Pro', JSON.stringify(prPro.breakdown));
T('…pe orice flotă la fel (10 mașini: 450 + 20)', pret({ ai_pachet: { cod: 'pro', pretRON: 20 } }, 10).monthlyTotal === 470);
T('prețul negociat al firmei (17,50) e cel facturat', pret({ ai_pachet: { cod: 'pro', pretRON: 17.5 } }).breakdown.aiPachet === 17.5);
T('Start (fără nimic scris) = 0 lei, fără rând', pret({}).breakdown.aiPachet === 0 && pret({}).monthlyTotal === 90 && pret({}).breakdown.aiPachetEticheta === null);
T('modulul oprit de noi = nimic facturat', pret({ ai_pachet: { cod: 'pro', pretRON: 20 }, features: { ai_assistant: false } }).breakdown.aiPachet === 0);
T('firma pe regula veche (pe cont) nu primește rând de pachet — se facturează pe conturi, ca înainte',
  pret({ ai_quota: { questionsPerSeat: 50, seatPriceRON: 14 }, features: { ai_assistant: true } }).breakdown.aiPachet === 0 && plans.pachetAi({ settings: { ai_quota: { questionsPerSeat: 50 } } }) === null);
T('o singură regulă „ce pachet are firma": plans.pachetAi, folosită de server (`_pachetCo`)',
  /function _pachetCo\(co\) \{ return co && plans \? plans\.pachetAi\(co\) : null; \}/.test(SRV) && !/pachete\.pachetFirma\(/.test(SRV));
T('factura: rândul pachetului vine din motorul de preț (ca registrul), înaintea regulii pe cont',
  /if \(bd\.aiPachet > 0\) \{\s*add\(bd\.aiPachetEticheta \|\| 'RA Insight', 1, bd\.aiPachet\);\s*\} else if \(ra && ra\.seats > 0/.test(SRV));
const ax = CTR.facAnexa([], { monthlyTotal: 20, aiPachet: { cod: 'pro', pretRON: 18, lista: { basic: 10, pro: 20, business: 30, aur: 99 } } });
T('anexa îngheață pachetul: codul, numele, prețul negociat și prețurile celorlalte (fără chei străine)',
  JSON.stringify(ax.aiPachet) === JSON.stringify({ cod: 'pro', nume: 'Pro', pretRON: 18, lista: { basic: 10, pro: 20, business: 30 } }), JSON.stringify(ax.aiPachet));
T('un pachet necunoscut nu intră în anexă', !CTR.facAnexa([], { aiPachet: { cod: 'aur', pretRON: 5 } }).aiPachet);
T('fără preț trimis, anexa ia prețul pachetului', CTR.facAnexa([], { aiPachet: { cod: 'basic' } }).aiPachet.pretRON === 10);
T('„Salvează anexa" nu pierde pachetul', JSON.stringify(CTR.dinAnexaDePastrat(ax).aiPachet) === JSON.stringify(ax.aiPachet));
// Hârtiile se desenează pe un „carton" care ține doar textul (ca în verify_abonament.js).
const carton = () => {
  const texte = [];
  const d = {
    page: { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } }, x: 50, y: 50,
    font() { return d; }, fontSize() { return d; }, fillColor() { return d; }, strokeColor() { return d; }, lineWidth() { return d; },
    moveTo() { return d; }, lineTo() { return d; }, stroke() { return d; }, image() { return d; }, roundedRect() { return d; }, rect() { return d; }, fill() { return d; },
    fillAndStroke() { return d; }, widthOfString(x) { return String(x == null ? '' : x).length * 4.6; }, heightOfString() { return 10; },
    addPage() { d.y = 50; return d; }, moveDown(n) { d.y += 12 * (n == null ? 1 : n); return d; },
    text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') d.y = y + 11; else d.y += 11; return d; }
  };
  return { d, texte };
};
const ZI = Date.parse('2026-10-14T09:00:00Z');
const hartieContract = (anexa) => {
  const c = carton();
  require('./contract_pdf').scrieContract(c.d, {
    contract: { number: 'RAT-C-2026-0099', status: 'aprobat', signed_at: ZI, start_at: ZI, months: 24, end_at: CTR.calcSfarsit(ZI, 24), auto_renew: true, notice_days: 30, gdpr: { kind: 'anexa' }, annex: anexa, montaj: null },
    firma: { name: 'Transport SRL', cui: 'RO12345678', address: 'Str. Exemplu 1', payment_term_days: 15, billing_day: 1 },
    emitent: { name: 'RA TRACKS SRL', cui: 'RO44556677', vat_rate: 21 }
  });
  return c.texte.join(' ¦ ');
};
const tC = hartieContract(ax);
T('contractul: pachetul ales, cu ce primește și prețul negociat',
  /RA Insight: pachetul Pro \(până la 5 conturi · 600 de întrebări pe lună\), 18,00 (RON|lei) pe lună, fără TVA\./.test(tC), (tC.match(/RA Insight: pachetul[^¦]{0,400}/) || ['—'])[0]);
T('…prețurile celorlalte la data semnării (Start inclus) și clauza de trecere din aplicație',
  /Celelalte pachete, la data semnării: Start — inclus; Basic — 10,00 (RON|lei) pe lună; Business — 30,00 (RON|lei) pe lună\./.test(tC) && tC.indexOf(P.CLAUZA_TRECERE) > 0, (tC.match(/Celelalte pachete[^¦]{0,500}/) || ['—'])[0]);
T('clauza: confirmarea din aplicație ține loc de act adițional; mai mare din ziua confirmării (pe zile), mai mic de la 1 a lunii următoare',
  /confirmarea din aplicație ține loc de act adițional/.test(P.CLAUZA_TRECERE) && /mai mare se aplică din ziua confirmării, iar luna respectivă se facturează pe zile/.test(P.CLAUZA_TRECERE)
  && /mai mic se aplică de la 1 a lunii următoare/.test(P.CLAUZA_TRECERE));
T('un contract fără pachet nu scrie nimic despre pachete', !/pachetul/.test(hartieContract(CTR.facAnexa([], { monthlyTotal: 90 }))));
const RE = require('./report_export');
const hartieOferta = (o) => { const c = carton(); RE.renderOfertaPdf(c.d, Object.assign({ client: { name: 'Transport SRL' }, contractMonths: 24, fxRate: 5, nVeh: 2,
  lines: [{ fel: 'plain', label: 'Vehicule GPS', qty: 2, unit: 45, total: 90 }], monthly: 90, contractTotal: 2160, montajLines: [], montaj: 0, deviceLines: [], hwTotal: 0 }, o)); return c.texte.join(' ¦ '); };
const tO = hartieOferta({ aiPachet: { cod: 'pro', pretRON: 18, lista: { basic: 10, pro: 20, business: 30 } } });
T('oferta: „ce include" scrie pachetul, din pachete.js', /RA Insight Pro: până la 5 conturi · 600 de întrebări pe lună/.test(tO), (tO.match(/RA Insight Pro[^¦]{0,120}/) || ['—'])[0]);
T('…și condiția: toate pachetele cu prețul lor (al ales = negociat) + clauza de trecere, pentru „administratorul firmei"',
  /RA Insight: pachetul Pro\. Pachetele: Start — inclus · Basic — 10,00 lei\/lună · Pro — 18,00 lei\/lună · Business — 30,00 lei\/lună\./.test(tO)
  && tO.indexOf(P.CLAUZA_TRECERE.replace('administratorul Beneficiarului', 'administratorul firmei')) > 0, (tO.match(/RA Insight: pachetul[^¦]{0,600}/) || ['—'])[0]);
const tOS = hartieOferta({ aiPachet: { cod: 'start', pretRON: 0, lista: { basic: 10, pro: 20, business: 30 } } });
T('oferta pe Start: „RA Insight Start: doar administratorul · 50 de răspunsuri pe butoane pe lună (inclus)"',
  /RA Insight Start: doar administratorul · 50 de răspunsuri pe butoane pe lună \(inclus\)/.test(tOS), (tOS.match(/RA Insight Start[^¦]{0,120}/) || ['—'])[0]);
T('ce rămâne la noi NU e pe hârtie (nici „marja", nici „plasa")', !/rămâne la noi|plasa|marj/i.test(tO + tOS));

// ─── 2c. Pasul 6: trecerea la alt pachet (fără server) ──────────────────────────────────────────────
console.log('\n2c. Pasul 6: trecerea la alt pachet — regula, textul, factura pe zile');
const T14 = Date.parse('2026-10-14T09:00:00Z');            // 14 octombrie 2026, ziua (ora României)
const pk = (cod, pret, extra) => Object.assign(P.dupaCod(cod), { pretRON: pret }, extra || {});
T('ora României: ziua începe la miezul nopții de acolo (vara: 21:00 UTC), luna următoare la fel (iarna: 22:00 UTC)',
  new Date(P.inceputZi(T14)).toISOString() === '2026-10-13T21:00:00.000Z' && new Date(P.inceputLunaUrm(T14)).toISOString() === '2026-10-31T22:00:00.000Z');
T('…și în zilele cu schimbarea orei (29.03 și 25.10.2026), și peste an (1 ianuarie 2027)',
  new Date(P.ziRo(2026, 3, 29)).toISOString() === '2026-03-28T22:00:00.000Z' && new Date(P.ziRo(2026, 10, 25)).toISOString() === '2026-10-24T21:00:00.000Z'
  && new Date(P.inceputLunaUrm(Date.parse('2026-12-20T12:00:00Z'))).toISOString() === '2026-12-31T22:00:00.000Z');
const tSus = P.trecere({ actual: pk('basic', 10), la: 'pro', pretNou: 20, conturi: 2, firma: 'Zebra SRL', acum: T14 });
T('mai mare (Basic → Pro, pe 14.10): de azi, iar pentru cele 18 zile rămase diferența de 5,81 lei vine pe factura din 1 noiembrie',
  tSus.sens === 'sus' && tSus.deLa === P.inceputZi(T14) && tSus.diferenta === 5.81 && tSus.zileRamase === 18
  && tSus.text === 'Firma Zebra SRL trece de la pachetul RA Insight Basic (10 lei pe lună, fără TVA) la pachetul RA Insight Pro (20 de lei pe lună, fără TVA), din 14 octombrie 2026. Luna octombrie se facturează pe zile: pentru cele 18 zile rămase se adaugă diferența de 5,81 lei fără TVA, pe factura din 1 noiembrie. ' + P.FINAL_CONFIRMARE, tSus.text);
const tJos = P.trecere({ actual: pk('pro', 20), la: 'basic', pretNou: 10, conturi: 2, firma: 'Zebra SRL', acum: T14 });
T('mai mic (Pro → Basic): de la 1 a lunii următoare, până atunci rămâne Pro',
  tJos.sens === 'jos' && tJos.deLa === P.inceputLunaUrm(T14) && /din 1 noiembrie 2026\. Până atunci rămâne pachetul Pro\./.test(tJos.text), tJos.text);
T('…dar nu cu mai multe conturi decât are pachetul cel mic (4 oameni pe Basic: „oprește întâi 2 conturi")',
  P.trecere({ actual: pk('pro', 20), la: 'basic', pretNou: 10, conturi: 4, acum: T14 }).refuz === 'Pachetul Basic are 2 conturi; acum RA Insight îl au 4 oameni. Oprește întâi 2 conturi din „Pachet și conturi”, apoi alege din nou.');
T('…iar pe Start doar administratorul', /^Pe Start, RA Insight îl are doar administratorul; acum îl au 2 oameni\./.test(P.trecere({ actual: pk('pro', 20), la: 'start', conturi: 2, acum: T14 }).refuz || ''));
T('Business → Pro cu 9 oameni: refuz; Business are conturi nelimitate, deci în sus nu se refuză niciodată pe conturi',
  !!P.trecere({ actual: pk('business', 30), la: 'pro', pretNou: 20, conturi: 9, acum: T14 }).refuz && P.trecere({ actual: pk('pro', 20), la: 'business', pretNou: 30, conturi: 9, acum: T14 }).sens === 'sus');
T('același pachet: refuz; cu o trecere programată, alegerea lui = anularea ei',
  P.trecere({ actual: pk('pro', 20), la: 'pro', pretNou: 20, acum: T14 }).refuz === 'Firma are deja pachetul Pro.'
  && /se anulează/.test(P.trecere({ actual: pk('pro', 20, { urmator: { cod: 'basic', nume: 'Basic', pretRON: 10, deLa: P.inceputLunaUrm(T14) } }), la: 'pro', pretNou: 20, acum: T14 }).text || ''));
T('un pachet plătit fără preț nu se poate alege (nu pornește pe 0 lei)', /n-are încă preț/.test(P.trecere({ actual: pk('basic', 10), la: 'pro', pretNou: 0, acum: T14 }).refuz || ''));
T('regula veche (pe cont): trecerea nu se face din aplicație', /regula veche/.test(P.trecere({ actual: null, la: 'pro', pretNou: 20 }).refuz || ''));
// Pachetul programat devine pachetul firmei din clipa lui (fără ceas care să-l mute).
const sP = { ai_pachet: { cod: 'pro', pretRON: 20, de_la: 1 }, ai_pachet_urmator: { cod: 'basic', pretRON: 10, de_la: P.inceputLunaUrm(T14) } };
const inainte = P.pachetFirma(sP, false, T14), dupa = P.pachetFirma(sP, false, P.inceputLunaUrm(T14) + 1000);
T('trecerea programată: până pe 1 — Pro (cu „urmator": Basic din 1 noiembrie); din 1 — Basic',
  inainte.cod === 'pro' && inainte.urmator && inainte.urmator.cod === 'basic' && inainte.urmator.deLa === P.inceputLunaUrm(T14) && dupa.cod === 'basic' && dupa.pretRON === 10 && !dupa.urmator);
const cons = P.consolideaza(sP, P.inceputLunaUrm(T14) + 1000);
T('…și se scrie în istoric la prima schimbare de după (consolideaza)', cons.ai_pachet.cod === 'basic' && !cons.ai_pachet_urmator && cons.ai_pachet_istoric.map((x) => x.cod).join() === 'pro,basic');
// Factura pe zile, din istoric (aceeași regulă ca abonamentul: luna întreagă în avans, zilele lunii trecute pe factura următoare).
const IST = [{ de_la: 0, cod: 'basic', pretRON: 10 }, { de_la: P.inceputZi(T14), cod: 'pro', pretRON: 20 }];
const fNov = P.liniiFactura({ istoric: IST, an: 2026, luna: 11, intreaga: true, anterioaraIntreaga: true });
T('factura din 1 noiembrie: Pro întreg + diferența Basic → Pro pe 14–31.10 (18 zile) = 5,81 lei',
  JSON.stringify(fNov) === JSON.stringify([{ desc: 'RA Insight Pro — noiembrie 2026', pret: 20 }, { desc: 'RA Insight — trecerea la pachetul Pro, 14–31.10.2026 (18 zile)', pret: 5.81 }]), JSON.stringify(fNov));
const fOct = P.liniiFactura({ istoric: IST, an: 2026, luna: 10, intreaga: true, anterioaraIntreaga: true });
T('factura din 1 octombrie (emisă înainte de trecere): Basic întreg, nimic altceva', JSON.stringify(fOct) === JSON.stringify([{ desc: 'RA Insight Basic — octombrie 2026', pret: 10 }]), JSON.stringify(fOct));
T('octombrie, adunat: 10 (avans) + 5,81 (diferența) = 15,81 = 13 zile Basic + 18 zile Pro (pe zile, pentru fiecare pachet)',
  Math.round((fOct[0].pret + fNov[1].pret) * 100) === Math.round((10 * 13 / 31 + 20 * 18 / 31) * 100));
const fPrim = P.liniiFactura({ istoric: IST, an: 2026, luna: 11, intreaga: true, partialaZi: 10 });
T('o firmă cu primul aparat pornit pe 10.10: zilele din octombrie pe bucăți, fiecare la pachetul ei (Basic 4 zile, Pro 18 zile)',
  JSON.stringify(fPrim.slice(1)) === JSON.stringify([{ desc: 'RA Insight Basic — 10–13.10.2026 (4 zile)', pret: 1.29 }, { desc: 'RA Insight Pro — 14–31.10.2026 (18 zile)', pret: 11.61 }]), JSON.stringify(fPrim));
const ISTJ = [{ de_la: 0, cod: 'pro', pretRON: 20 }, { de_la: P.inceputLunaUrm(T14), cod: 'basic', pretRON: 10 }];
T('mai mic, de la 1 noiembrie: factura din noiembrie = Basic întreg, fără nicio diferență (nici în minus)',
  JSON.stringify(P.liniiFactura({ istoric: ISTJ, an: 2026, luna: 11, intreaga: true, anterioaraIntreaga: true })) === JSON.stringify([{ desc: 'RA Insight Basic — noiembrie 2026', pret: 10 }]));
T('Start nu apare pe factură (0 lei); fără aparat pornit, nimic', !P.liniiFactura({ istoric: [], an: 2026, luna: 11, intreaga: true, anterioaraIntreaga: true }).length
  && !P.liniiFactura({ istoric: IST, an: 2026, luna: 11 }).length);
T('o firmă cu pachet de dinainte de istoric pornește de la pachetul ei, din ziua lui', JSON.stringify(P.istoricFirma({ ai_pachet: { cod: 'pro', pretRON: 18, de_la: 5 } })) === JSON.stringify([{ de_la: 5, cod: 'pro', pretRON: 18 }]));
T('o schimbare nouă înlocuiește ce era programat după ea', P.adaugaIstoric(sP, { de_la: P.inceputZi(T14), cod: 'business', pretRON: 30 }).map((x) => x.cod).join() === 'pro,business');
T('pe server: factura lunii ia pachetul din istoric (nu prețul de azi) și o singură regulă pentru rânduri',
  /pachete\.liniiFactura\(\{ istoric: pachete\.istoricFirma\(setariCo\)/.test(SRV) && /settings: Object\.assign\(\{\}, setariCo, \{ ai_pachet: null, ai_pachet_urmator: null, ai_pachet_istoric: null \}\)/.test(SRV));
T('o singură scriere a pachetului pe firmă (_applyCompanySettingsPatch), cu istoricul la fiecare schimbare',
  (SRV.match(/pachete\.adaugaIstoric\(/g) || []).length === 2 && /if \(body\.ai_pachet_trecere && opts && opts\.trecere\)/.test(SRV) && (SRV.match(/\{ trecere: true \}/g) || []).length === 1);
T('după confirmare, textul îl scrie serverul (cu emailul, așa cum a plecat)',
  /a plecat pe email \(a@b\.ro\), în PDF/.test(P.textDupaTrecere(tSus, { trimis: true, catre: 'a@b.ro' })) && /emailul n-a plecat: x/.test(P.textDupaTrecere(tJos, { trimis: false, motiv: 'x' })));
const tConf = (function () { const c = carton(); require('./contract_pdf').scrieConfirmarePachet(c.d, { trecere: { id: 7, creat_la: T14, text: tSus.text, user_nume: 'Ion Pop', ip: '10.0.0.1', aplicat_de_la: tSus.deLa },
  firma: { name: 'Zebra SRL', cui: 'RO1' }, emitent: { name: 'RA TRACKS SRL' }, contract: { number: 'RAT-C-2026-0001', signed_at: T14 } }); return c.texte.join(' ¦ '); })();
T('hârtia confirmării: textul exact, cine (Ion Pop), când, de pe ce adresă, de la ce dată — fără semnături',
  tConf.indexOf(tSus.text) >= 0 && /CONFIRMARE — PACHETUL RA INSIGHT/.test(tConf) && /de Ion Pop, administratorul firmei, pe 14\.10\.2026, 12:00 \(ora României\), de la adresa IP 10\.0\.0\.1/.test(tConf)
  && /la contractul de prestări servicii nr\. RAT-C-2026-0001/.test(tConf) && !/SEMNĂTURA|Semnătura/.test(tConf), tConf.slice(0, 600));

// ─── 3. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3297, TCP = 5297;
const DIR = path.join(os.tmpdir(), 'rax_pachete_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
  "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
  "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
  "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada));",
  "    r.usage = { input_tokens: 100, output_tokens: 20 };",
  "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
fs.writeFileSync(AI_COADA, '[]');
// Brevo fals (pasul 6): confirmarea trecerii pleacă pe email, cu PDF-ul. Conturile probei își iau linkul de parolă din invitația
// primită aici, ca un om adevărat (cu emailul pornit, serverul nu mai întoarce linkul).
const PORT_BREVO = 3296, primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {} primite.push({ cale: req.url, corp: j });
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' })); });
});
fals.listen(PORT_BREVO, '127.0.0.1');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_pachete', DEMO_DISABLED: 'true',
  BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + PORT_BREVO + '/v3/smtp/email', EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA,
  EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
});
delete env.DATABASE_URL;
delete env.ANTHROPIC_API_KEY;
delete env.AI_AGENT_MODEL;
delete env.AI_MODEL;
delete env.AI_MODEL_APROFUNDAT;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() {
  for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} }
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} try { fals.close(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, pw) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cine) h.Cookie = cine;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const LUNA = P.reincarcare(Date.now()).luna;

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n3. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const PAROLA = 'Str4da-Verde-2026';
  async function firma(nume, imei, nr) {
    const co = (await json('POST', '/api/companies', S, { name: nume })).j;
    await json('POST', '/api/devices/import', S, { rows: [{ imei, nume: 'Dacia Logan', nr_inmatriculare: nr }] });
    await json('PUT', '/api/devices/' + imei + '/company', S, { company_id: co.id });
    return co;
  }
  async function om(username, role, companyId) {
    const n0 = primite.length;
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    else {
      // invitația a plecat pe email (Brevo fals): linkul de parolă se ia din ea
      let inv = null;
      for (let i = 0; i < 25 && !inv; i++) { inv = primite.slice(n0).filter((x) => x.corp.to && x.corp.to[0] && x.corp.to[0].email === username)[0]; if (!inv) await sleep(200); }
      const tok = inv && (String(inv.corp.textContent || inv.corp.htmlContent || '').match(/token=([A-Za-z0-9_-]+)/) || [])[1];
      if (tok) await fetch(B + '/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: PAROLA }) });
    }
    return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
  }
  const loc = (u) => json('PUT', '/api/users/' + u.id + '/ai-seat', S, { on: true });
  const intreaba = (u, message, extra) => json('POST', '/api/insight/intreaba', u.ck, Object.assign({ message, nou: true }, extra || {}));
  const cota = async (u) => (await json('GET', '/api/ai/quota', u.ck)).j;
  const nCereri = () => cereri().length;

  // ── a) Start ─────────────────────────────────────────────────────────────────────────────────────
  console.log('   a) Start');
  const coS = await firma('Firma Start SRL', '350000000059001', 'B 101 STA');
  const adm = await om('sef@start.ro', 'company_admin', coS.id);
  const man = await om('dispecer@start.ro', 'manager', coS.id);
  T('pregătire: firma fără nimic scris, administratorul și un manager intră', !!(coS.id && adm.ck && man.ck));
  const q0 = await cota(adm);
  T('administratorul deschide RA Insight și primește SINGUR locul (Start: el e contul)', q0.seat === true && q0.pachet && q0.pachet.cod === 'start' && q0.seats === 1, JSON.stringify(q0).slice(0, 200));
  T('caseta: „50 din 50 de răspunsuri pe butoane rămase în …", fără niciun cost', q0.pachet.text === '50 din 50 de răspunsuri pe butoane rămase în ' + LUNA && !/cost|plafon|plasa/i.test(JSON.stringify(q0)), q0.pachet.text);
  const qm = await cota(man);
  T('managerul NU primește loc pe Start', qm.seat === false);
  const locM = await loc(man);
  T('nici noi nu-i putem da locul pe Start (409, „doar administratorul")', locM.status === 409 && /doar administratorul/.test(locM.j.error || ''), locM.status + ' ' + locM.text.slice(0, 120));
  const intrM = await intreaba(man, 'Ce acte expiră?');
  T('managerul fără loc: RA Insight îi spune cine îi poate da acces', intrM.status === 403 && intrM.j.seatMissing === true, intrM.status);
  const arM = await json('POST', '/api/reports/ai-raport', man.ck, { text: 'Ce acte expiră?' });
  T('…și nici fila AI Raport nu-i mai răspunde (e motorul lui RA Insight)', arM.status === 403 && arM.j.seatMissing === true, arM.status + ' ' + arM.text.slice(0, 100));
  const n0 = nCereri();
  const lib = await intreaba(adm, 'De ce a crescut consumul?');
  T('întrebarea liberă pe Start: „de la pachetul Basic", fără model, fără să se numere', lib.status === 200 && lib.j.source === 'reguli' && /de la pachetul \*\*Basic\*\*/.test(lib.j.reply || '') && nCereri() === n0 && (await cota(adm)).used === 0, lib.status + ' ' + (lib.j.reply || '').slice(0, 80));
  T('…marcată ca mesaj al pachetului (ecranul îl pune în caseta de avertizare), și păstrat așa în conversație', lib.j.limita === true && ((await json('GET', '/api/insight/conversatii/' + lib.j.conversatieId, adm.ck)).j.mesaje || []).some((m) => m.extra && m.extra.limita === true));
  const pcS = await json('GET', '/api/insight/pachet-conturi', adm.ck);
  const manPc = (pcS.j.oameni || []).find((o) => o.nume === 'dispecer');
  T('„Pachet și conturi" pe Start: trei cartonașe, administratorul cu cont, managerul nu poate („doar administratorul")', pcS.status === 200 && (pcS.j.cartonase || []).length === 3 && (pcS.j.oameni || [])[0].loc === true && !!manPc && /doar administratorul/.test(manPc.nuPoate || ''), pcS.text.slice(0, 200));
  T('…pagina e doar a administratorului (managerul: 403)', (await json('GET', '/api/insight/pachet-conturi', man.ck)).status === 403);
  const farLoc = await json('GET', '/api/insight/conversatii', man.ck);
  T('…iar managerul fără cont, pe o firmă cu pachet, află că i-l poate da administratorul din „Pachet și conturi"', farLoc.status === 403 && /RA Insight → „Pachet și conturi”/.test(farLoc.j.message || ''), farLoc.status + ' ' + (farLoc.j.message || ''));
  const pk0 = await json('GET', '/api/insight/pachete', adm.ck);
  T('„Vezi pachetele": cele patru, cu ce primește fiecare, pachetul firmei = Start; fără analiza aprofundată', pk0.status === 200 && (pk0.j.pachete || []).length === 4 && pk0.j.actual === 'start' && !JSON.stringify(pk0.j.pachete).match(/aprofundat/i) && /Se reîncarcă pe 1/.test(pk0.j.reincarcare || ''), pk0.text.slice(0, 160));
  T('caseta: contorul „50 din 50" și reîncărcarea, scrise de server', q0.pachet.scurt === '50 din 50' && /Se reîncarcă pe 1 /.test(q0.pachet.reincarcare || ''));
  const but = await intreaba(adm, 'Ce acte expiră?');
  T('o întrebare de pe butoane pe Start: răspuns pe reguli, cu „Am înțeles", fără model', but.status === 200 && but.j.source === 'reguli' && (but.j.inteles || []).length >= 2 && nCereri() === n0, but.status + ' ' + (but.j.reply || '').slice(0, 100));
  T('…și se numără: 49 rămase, scris în răspuns', but.j.pachet && but.j.pachet.ramase === 49 && (await cota(adm)).used === 1, JSON.stringify(but.j.pachet));
  T('…în aceeași discuție (conversația păstrată)', Number(but.j.conversatieId) > 0);
  const ar = await json('POST', '/api/reports/ai-raport', adm.ck, { text: 'Ce acte expiră?' });
  T('fila AI Raport, la administrator: răspunde și se numără din aceleași 50', ar.status === 200 && !!ar.j.raspuns && ar.j.pachet && ar.j.pachet.ramase === 48 && !ar.j._u, ar.status + ' ' + JSON.stringify(ar.j.pachet));
  const rez = await json('POST', '/api/ai/report-summary', adm.ck, { type: 'utilization', report: { columns: ['Vehicul', 'Km'], rows: [['B 101 STA', '47 km'], ['B 102 STA', '12 km']] } });
  T('„Rezumă raportul" pe Start: pe reguli, din tabel (59 km în total), fără model, numărat', rez.status === 200 && rez.j.reguli === true && /59 km/.test(rez.j.summary || '') && nCereri() === n0 && (await cota(adm)).used === 3, rez.status + ' ' + (rez.j.summary || '').slice(0, 120));
  const ram = await json('GET', '/api/insight/mentenanta', adm.ck);
  T('ramurile sunt închise pe Start (de la Basic)', ram.status === 403 && ram.j.error === 'ramuri_pachet' && /Basic/.test(ram.j.message || ''), ram.status);
  await json('POST', '/api/test/ai-reguli', S, { companyId: coS.id, userId: adm.id, n: 47 });
  const cap = await intreaba(adm, 'Ce acte expiră?');
  T('la 50 din 50: mesajul cu reîncărcarea pe 1, fără model', cap.j.source === 'reguli' && /Ați folosit cele 50 de răspunsuri/.test(cap.j.reply || '') && nCereri() === n0, (cap.j.reply || '').slice(0, 100));
  const capAr = await json('POST', '/api/reports/ai-raport', adm.ck, { text: 'Ce acte expiră?' });
  T('…și fila AI Raport spune la fel', capAr.status === 200 && capAr.j.neinteles === true && capAr.j.motiv === 'pachet_epuizat', capAr.status + ' ' + capAr.text.slice(0, 100));
  T('caseta arată 0 din 50, oprit', (await cota(adm)).remaining === 0 && (await cota(adm)).blocked === true);

  // ── b) Basic ─────────────────────────────────────────────────────────────────────────────────────
  console.log('   b) Basic');
  const coB = await firma('Firma Basic SRL', '350000000059002', 'B 202 BAS');
  const pb = await json('PUT', '/api/companies/' + coB.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
  T('super-adminul pune pachetul Basic', pb.status === 200 && pb.j.ai_pachet && pb.j.ai_pachet.cod === 'basic' && pb.j.ai_pachet.pretRON === 10, pb.status + ' ' + pb.text.slice(0, 120));
  const setB = await json('GET', '/api/companies/' + coB.id + '/settings', S);
  T('fila „Acces" primește pachetul firmei și lista (cu prețurile de listă)', setB.j.ai_pachet && setB.j.ai_pachet.cod === 'basic' && (setB.j.pachete || []).map((x) => x.cod + ':' + x.pret).join() === 'start:0,basic:10,pro:20,business:30', JSON.stringify(setB.j.ai_pachet));
  const bAdm = await om('sef@basic.ro', 'company_admin', coB.id);
  const bM1 = await om('unu@basic.ro', 'manager', coB.id);
  const bM2 = await om('doi@basic.ro', 'dispatcher', coB.id);
  await cota(bAdm);
  const l1 = await loc(bM1), l2 = await loc(bM2);
  T('Basic: al doilea cont da, al treilea 409 cu drumul spre Pro', l1.status === 200 && l2.status === 409 && /treceți la Pro/.test(l2.j.error || ''), l1.status + '/' + l2.status);
  coada([text('Consumul a crescut din cauza ralantiului.')]);
  const n1 = nCereri();
  const bLib = await intreaba(bAdm, 'De ce a crescut consumul?');
  T('întrebarea liberă pe Basic: la model, numărată (1 din 200)', bLib.j.source === 'ai' && nCereri() === n1 + 1 && (await cota(bAdm)).used === 1, bLib.j.source + ' ' + (bLib.j.reply || '').slice(0, 60));
  const sysBLib = JSON.stringify(cereri().slice(-1)[0].system || '');
  T('…pe modelul obișnuit, cu analiza atentă („de ce" pe Basic: comparația și forma fixă în contextul întrebării), fără etichetă nouă',
    !/sonnet/.test(cereri().slice(-1)[0].model || '') && /ÎNTREBARE DE ANALIZĂ/.test(sysBLib) && !('aprofundat' in bLib.j), sysBLib.slice(-200));
  const bBut = await intreaba(bAdm, 'Ce acte expiră?', { buton: true });
  T('un buton pe Basic: răspuns pe reguli, fără model, NU se numără', bBut.j.source === 'reguli' && nCereri() === n1 + 1 && (await cota(bAdm)).used === 1, bBut.j.source);
  coada([text('Analiza.')]);
  const bBut2 = await intreaba(bAdm, 'De ce a crescut consumul?', { buton: true });
  T('un buton pe care regulile nu-l știu merge la model (și se numără)', bBut2.j.source === 'ai' && nCereri() === n1 + 2 && (await cota(bAdm)).used === 2, bBut2.j.source);
  T('ramurile sunt deschise pe Basic', (await json('GET', '/api/insight/mentenanta', bAdm.ck)).status === 200);
  const bLim = await json('PUT', '/api/users/' + bM1.id + '/ai-limita', bAdm.ck, { limita: 50 });
  T('pe Basic nu se împart întrebările (400, „de la Pro")', bLim.status === 400 && /de la Pro/.test(bLim.j.error || ''));
  // plasa: un răspuns pe Sonnet de 1.000.000 de tokeni = 2 $ ≈ 9,2 lei > 8 lei
  await json('POST', '/api/test/ai-usage', S, { companyId: coB.id, userId: bAdm.id, kind: 'insight', usage: { input_tokens: 1000000, output_tokens: 0 }, model: 'claude-sonnet-5-5' });
  const qPl = await cota(bAdm);
  T('plasa atinsă: RA Insight oprit pe lună, cu întrebări rămase (3 din 200 folosite)', qPl.blocked === true && qPl.motiv === 'plasa' && qPl.used === 3, JSON.stringify({ b: qPl.blocked, m: qPl.motiv, u: qPl.used }));
  T('…iar clientul nu vede niciun cost', !/cost|plafon|lei/i.test(JSON.stringify(qPl)));
  const n2 = nCereri();
  const plLib = await intreaba(bAdm, 'De ce a crescut consumul?');
  T('întrebarea liberă după plasă: mesajul „a ajuns la limita lunii", fără model', plLib.j.source === 'reguli' && /a ajuns la limita lunii/.test(plLib.j.reply || '') && nCereri() === n2 && !/lei/.test(plLib.j.reply || ''), (plLib.j.reply || '').slice(0, 100));
  const plBut = await intreaba(bAdm, 'Ce acte expiră?');
  T('butoanele merg mai departe după plasă (pe reguli), cu explicația o dată pe discuție', plBut.j.source === 'reguli' && /a ajuns la limita lunii/.test(plBut.j.reply || '') && nCereri() === n2, (plBut.j.reply || '').slice(0, 80));
  T('…explicația vine și separat (pachetMesaj), iar răspunsul începe cu ea (telefonul vechi citește doar textul)', !!plBut.j.pachetMesaj && (plBut.j.reply || '').indexOf(plBut.j.pachetMesaj) === 0 && !plBut.j.limita);
  T('caseta la plasă: 0 din 200, oprită', qPl.remaining === 0 && qPl.pachet.scurt === '0 din 200');
  const plBut2 = await json('POST', '/api/insight/intreaba', bAdm.ck, { message: 'Și luna trecută?', conversatieId: plBut.j.conversatieId });
  T('…a doua întrebare din aceeași discuție nu mai repetă explicația', plBut2.j.source === 'reguli' && !/a ajuns la limita lunii/.test(plBut2.j.reply || ''), (plBut2.j.reply || '').slice(0, 80));
  const plRez = await json('POST', '/api/ai/report-summary', bAdm.ck, { type: 'utilization', report: { columns: ['Vehicul', 'Km'], rows: [['B 202 BAS', '30 km']] } });
  T('„Rezumă raportul" după plasă: pe reguli, fără model', plRez.j.reguli === true && nCereri() === n2);
  // Tabloul nostru (pasul 4)
  const uz = await json('GET', '/api/admin/ai-usage', S);
  const rB = (uz.j.rows || []).find((r) => r.id === coB.id) || {};
  T('tabloul nostru: firma Basic cu plasa ei (9,20 lei = 115% din 8 lei), încasăm 10 lei, ne rămân 0,80 lei', rB.pachet && rB.pachet.cod === 'basic' && rB.plasa && rB.plasa.plafonLei === 8 && rB.plasa.procent === 115 && rB.plasa.costLei === 9.2 && rB.venitLei === 10 && rB.ramanLei === 0.8, JSON.stringify({ p: rB.pachet, pl: rB.plasa, v: rB.venitLei, r: rB.ramanLei }));
  T('…și în rezumat: câte firme pe pachete, ce încasăm, cine e lângă plasă', uz.j.pachete && uz.j.pachete.peCod.start >= 1 && uz.j.pachete.peCod.basic === 1 && uz.j.pachete.venitLei >= 10 && (uz.j.pachete.langaPlasa || []).some((x) => x.id === coB.id && x.procent >= 100), JSON.stringify(uz.j.pachete || {}).slice(0, 240));
  T('tabloul nostru e doar al nostru (administratorul firmei: 403)', (await json('GET', '/api/admin/ai-usage', bAdm.ck)).status === 403);
  const c1 = await json('POST', '/api/test/ceasuri', S, { plasa: true });
  const c2 = await json('POST', '/api/test/ceasuri', S, { plasa: true });
  const notP = ((await json('GET', '/api/notifications?limit=80', S)).j || []).filter((n) => n.type === 'ai_plasa');
  T('anunțul pentru noi: „a atins plasa", o singură dată (a doua trecere nu-l repetă), fără firmă pe notificare', (c1.j.plasa.anuntate || []).some((k) => k.indexOf(coB.id + '|') === 0 && /\|100$/.test(k)) && !(c2.j.plasa.anuntate || []).length && notP.some((n) => /Firma Basic SRL a atins plasa/.test(n.title)), JSON.stringify(c1.j.plasa) + ' / ' + JSON.stringify(notP.map((n) => n.title)));
  T('…clientul nu-l primește', !(((await json('GET', '/api/notifications?limit=80', bAdm.ck)).j || []).some((n) => n.type === 'ai_plasa')));
  const sl0 = await json('PUT', '/api/admin/insight/sold', S, { usd: 'mult' });
  const sl1 = await json('PUT', '/api/admin/insight/sold', S, { usd: '46.5' });
  T('soldul Anthropic: îl scriem noi (o sumă), aplicația spune pentru câte zile ajunge la ritmul lunii', sl0.status === 400 && sl1.status === 200 && sl1.j.sold && sl1.j.sold.usd === 46.5 && Number.isInteger(sl1.j.sold.zile) && (await json('GET', '/api/admin/ai-usage', S)).j.pachete.sold.usd === 46.5, JSON.stringify(sl1.j));
  T('…doar noi (administratorul firmei: 403)', (await json('PUT', '/api/admin/insight/sold', bAdm.ck, { usd: 1 })).status === 403);

  // ── c) Pro ───────────────────────────────────────────────────────────────────────────────────────
  console.log('   c) Pro');
  const coP = await firma('Firma Pro SRL', '350000000059003', 'B 303 PRO');
  await json('PUT', '/api/companies/' + coP.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
  const pAdm = await om('sef@pro.ro', 'company_admin', coP.id);
  const pA = await om('ana@pro.ro', 'manager', coP.id);
  const pB = await om('bogdan@pro.ro', 'manager', coP.id);
  const pFara = await om('fara@pro.ro', 'viewer', coP.id);
  await cota(pAdm); await loc(pA); await loc(pB);
  const limFara = await json('PUT', '/api/users/' + pFara.id + '/ai-limita', pAdm.ck, { limita: 10 });
  T('întrebări doar pentru cine are cont (400 pentru omul fără RA Insight)', limFara.status === 400);
  const limMult = await json('PUT', '/api/users/' + pA.id + '/ai-limita', pAdm.ck, { limita: 601 });
  T('limita nu trece de cele 600 ale pachetului', limMult.status === 400 && /cel mult 600/.test(limMult.j.error || ''), limMult.text.slice(0, 120));
  const limA = await json('PUT', '/api/users/' + pA.id + '/ai-limita', pAdm.ck, { limita: 2 });
  T('administratorul îi dă Anei 2 întrebări pe lună', limA.status === 200 && limA.j.ai_limita === 2, limA.text.slice(0, 120));
  for (let i = 0; i < 2; i++) await json('POST', '/api/test/ai-usage', S, { companyId: coP.id, userId: pA.id, kind: 'insight' });
  const qA = await cota(pA);
  T('Ana: 0 rămase din ale ei, oprită (limita); caseta știe limita ei', qA.blocked === true && qA.motiv === 'limita' && qA.pachet.limitaOm === 2 && qA.pachet.ramaseOm === 0, JSON.stringify({ b: qA.blocked, m: qA.motiv, p: qA.pachet }));
  T('…contorul ei: „îți rămân 0"; rândul ei: „Tu: 0 din 2 (limita dată de administrator)"', qA.pachet.scurt === 'îți rămân 0' && qA.pachet.textOm === 'Tu: 0 din 2 (limita dată de administrator)', qA.pachet.scurt + ' / ' + qA.pachet.textOm);
  const n3 = nCereri();
  const aLib = await intreaba(pA, 'De ce a crescut consumul?');
  T('Ana la limită: „Ai folosit cele 2 întrebări date de administrator", fără model', aLib.j.source === 'reguli' && /Ai folosit cele 2 întrebări date de administrator/.test(aLib.j.reply || '') && nCereri() === n3, (aLib.j.reply || '').slice(0, 100));
  coada([text('Bogdan primește răspuns.')]);
  const bogLib = await intreaba(pB, 'De ce a crescut consumul?');
  T('Bogdan (la comun) întreabă mai departe', bogLib.j.source === 'ai' && nCereri() === n3 + 1);
  const limAp = await json('PUT', '/api/users/' + pA.id + '/ai-limita', pAdm.ck, { limita: 597 });
  T('Anei i se dau 597: la comun rămân 3, deja folosite (Bogdan 1 + 2 de-ale firmei de mai jos)', limAp.status === 200);
  for (let i = 0; i < 2; i++) await json('POST', '/api/test/ai-usage', S, { companyId: coP.id, userId: pAdm.id, kind: 'insight' });
  const pcP = await json('GET', '/api/insight/pachet-conturi', pAdm.ck);
  const anaPc = (pcP.j.oameni || []).find((o) => o.nume === 'ana');
  T('„Pachet și conturi" pe Pro: patru cartonașe (telefonul), rezumatul pe rânduri (web), câte au rămas, Ana cu limita 597 și „2 din 597" folosite', pcP.status === 200 && (pcP.j.cartonase || []).length === 4 && (pcP.j.rezumat || []).length === 2 && /^Conturi: /.test(pcP.j.rezumat[0]) && typeof pcP.j.pachet.ramase === 'number' && !!anaPc && anaPc.limita === 597 && anaPc.folositeText === '2 din 597' && pcP.j.pachet.imparte === true, JSON.stringify([pcP.j.rezumat, anaPc]));
  // Administratorul își stinge contul lui: „Pachet și conturi" (manageUsers, nu cont RA Insight) rămâne deschis, iar contul și-l
  // poate aprinde la loc de acolo — altfel, pe o firmă cu pachet, n-ar mai avea de unde da conturi (Utilizatori are doar eticheta).
  const admId = (pcP.j.oameni || []).find((o) => o.nume === 'sef');
  const stins = admId ? await json('PUT', '/api/users/' + admId.id + '/ai-seat', pAdm.ck, { on: false }) : { s: 0 };
  const pcFara = await json('GET', '/api/insight/pachet-conturi', pAdm.ck);
  const aprins = admId ? await json('PUT', '/api/users/' + admId.id + '/ai-seat', pAdm.ck, { on: true }) : { s: 0 };
  T('administratorul fără cont al lui intră tot în „Pachet și conturi" și își dă singur contul înapoi', !!admId && stins.status === 200 && pcFara.status === 200 && aprins.status === 200, JSON.stringify([admId && admId.nume, stins.status, pcFara.status, aprins.status]));
  const qB = await cota(pB);
  T('Bogdan: partea la comun s-a terminat (comun), Ana are încă din ale ei', qB.blocked === true && qB.motiv === 'comun' && (await cota(pA)).blocked === false, JSON.stringify({ b: qB.blocked, m: qB.motiv, c: qB.pachet && qB.pachet.comun }));
  const bogCom = await intreaba(pB, 'De ce a crescut consumul?');
  T('…mesajul lui spune că s-au terminat cele pentru cei fără limită', /întrebările pentru cei fără limită/.test(bogCom.j.reply || ''), (bogCom.j.reply || '').slice(0, 100));
  // Analiza atentă (28.10; Alin: „1 da"): Sonnet și comutatorul lui au ieșit; la „de ce" răspunde același model, mai atent.
  T('comutatorul vechi „Analiza aprofundată" nu mai există (404)', (await json('GET', '/api/admin/insight/aprofundat', S)).status === 404 &&
    (await json('PUT', '/api/admin/insight/aprofundat', S, { pornita: true })).status === 404);
  coada([text('Cauza: ralanti, cu cifre.')]);
  const aApr = await intreaba(pA, 'De ce a crescut consumul?');
  const sysApr = JSON.stringify(cereri().slice(-1)[0].system || '');
  T('pe Pro, la „de ce": același model (nu Sonnet), cu analiza atentă în contextul întrebării; se numără ca orice întrebare',
    aApr.j.source === 'ai' && !/sonnet/.test(cereri().slice(-1)[0].model || '') && /ÎNTREBARE DE ANALIZĂ/.test(sysApr) && /\*\*Ce s-a întâmplat\*\*/.test(sysApr) && !('aprofundat' in aApr.j),
    cereri().slice(-1)[0].model + ' ' + sysApr.slice(-160));
  T('…iar „Vezi pachetele" n-o promite (Alin, 27.10: „nu o mai vreau")', !/aprofundat/i.test(JSON.stringify((await json('GET', '/api/insight/pachete', pAdm.ck)).j || {})));
  coada([text('Răspuns simplu.')]);
  await intreaba(pA, 'Câți km a făcut flota luna asta în total pe toate mașinile, cu tot cu cele oprite?');
  T('…la o întrebare obișnuită, fără analiza atentă', !/ÎNTREBARE DE ANALIZĂ/.test(JSON.stringify(cereri().slice(-1)[0].system || '')) && !/sonnet/.test(cereri().slice(-1)[0].model || ''));
  const scoate = await json('PUT', '/api/users/' + pA.id + '/ai-seat', S, { on: false });
  const listaU = (await json('GET', '/api/users', pAdm.ck)).j;
  const ana = (Array.isArray(listaU) ? listaU : (listaU.users || [])).find((u) => u.id === pA.id) || {};
  T('fără cont, limita omului se șterge (nu ține întrebări rezervate)', scoate.status === 200 && ana.ai_limita == null, JSON.stringify(ana).slice(0, 120));

  // ── d) Business, regula veche, schimbarea pachetului ─────────────────────────────────────────────
  console.log('   d) Business, regula veche, schimbarea pachetului');
  const coBz = await firma('Firma Business SRL', '350000000059004', 'B 404 BIZ');
  await json('PUT', '/api/companies/' + coBz.id + '/settings', S, { ai_pachet: { cod: 'business' } });
  const zAdm = await om('sef@biz.ro', 'company_admin', coBz.id);
  await cota(zAdm);
  let toate = true;
  for (let i = 0; i < 6; i++) { const u = await om('om' + i + '@biz.ro', 'viewer', coBz.id); if ((await loc(u)).status !== 200) toate = false; }
  T('Business: conturi nelimitate (încă 6, toate date)', toate && (await cota(zAdm)).seats === 7);
  const coV = await firma('Firma Veche SRL', '350000000059005', 'B 505 VEC');
  await json('PUT', '/api/companies/' + coV.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 }, regula_veche: true });
  const vAdm = await om('sef@veche.ro', 'company_admin', coV.id);
  const vFara = await om('fara@veche.ro', 'manager', coV.id);
  await loc(vAdm);
  const qV = await cota(vAdm);
  T('firma pe regula veche (50 pe cont): fond = conturi × 50, fără pachet', qV.questions === 50 && !qV.pachet, JSON.stringify(qV).slice(0, 160));
  T('…„Pachet și conturi" îi spune că e pe regula veche', (await json('GET', '/api/insight/pachet-conturi', vAdm.ck)).j.vechi === true);
  const arV = await json('POST', '/api/reports/ai-raport', vFara.ck, { text: 'Ce acte expiră?' });
  T('…și fila AI Raport rămâne pentru toți, ca înainte', arV.status === 200 && !!arV.j.raspuns && !arV.j.pachet, arV.status);
  // Casetele vechi din fișa firmei (Alin, 20.10: „rezolvăm acum"): pe o firmă cu pachet — și Start e un pachet — nu mai mută
  // firma pe regula veche; se arată doar pe regula veche, iar serverul refuză fără cererea pe față (`regula_veche: true`).
  const coSt = await firma('Firma Start Casete SRL', '350000000059006', 'B 606 CAS');
  const qSt = await json('PUT', '/api/companies/' + coSt.id + '/settings', S, { ai_quota: { questionsPerSeat: 50, seatPriceRON: 15 } });
  const dupaSt = await json('GET', '/api/companies/' + coSt.id + '/settings', S);
  T('casetele vechi: „întrebări pe cont" salvate pe o firmă de pe Start se refuză (400), iar firma rămâne pe Start',
    qSt.status === 400 && /^RA Insight se vinde pe pachete: firma are pachetul Start\. .*fila „Acces”/.test(qSt.j.error || '') && (dupaSt.j.ai_pachet || {}).cod === 'start', JSON.stringify({ s: qSt.status, e: qSt.j.error, p: dupaSt.j.ai_pachet }));
  const limSt = await json('PUT', '/api/companies/' + coSt.id + '/ai-limit', S, { limit: 500 });
  const limGol = await json('PUT', '/api/companies/' + coSt.id + '/ai-limit', S, { limit: null });
  T('…la fel „Limită AI lunară" (400); golirea ei merge oricând', limSt.status === 400 && /pachetul Start/.test(limSt.j.error || '') && limGol.status === 200 &&
    ((await json('GET', '/api/companies/' + coSt.id + '/settings', S)).j.ai_pachet || {}).cod === 'start', JSON.stringify({ a: limSt.status, b: limGol.status }));
  const ovSt = await json('GET', '/api/companies/' + coSt.id + '/overview', S), ovV = await json('GET', '/api/companies/' + coV.id + '/overview', S);
  T('…fișa firmei spune ecranului dacă e pe regula veche (casetele se arată doar acolo)', ovSt.j.ai_regula_veche === false && ovV.j.ai_regula_veche === true);
  T('…pe ecran: „Limită AI lunară" doar fără pachet, fondul pe cont doar pe regula veche (altfel butonul spre „Acces”)',
    /if \(!s\.pachet\) html \+= '<div style="' \+ SEC \+ 'border-bottom:none;"><div style="' \+ H \+ '">Limită AI lunară \(regula veche, pe cont\)/.test(PAG) &&
    /regulaVeche: !!d\.ai_regula_veche/.test(PAG) && /\(s\.regulaVeche \? '<div style="margin-top:12px;[^']*">' \+\s*'<div style="font-size:12px;font-weight:700;margin-bottom:8px;">RA Insight — conturi și fond de întrebări/.test(PAG) &&
    /Se vinde pe pachete; pachetul firmei se alege din fila „Acces”/.test(PAG));
  const rau = await json('PUT', '/api/companies/' + coB.id + '/settings', S, { ai_pachet: { cod: 'gold' } });
  T('un pachet necunoscut se refuză (400)', rau.status === 400 && /Start, Basic, Pro, Business/.test(rau.j.error || ''));
  const laV = await json('PUT', '/api/companies/' + coV.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
  const qV2 = await cota(vAdm);
  T('pachetul pus pe o firmă veche scoate regula pe cont (Pro, 600)', laV.status === 200 && laV.j.ai_quota === null && qV2.pachet && qV2.pachet.cod === 'pro' && qV2.questions === 600, JSON.stringify(qV2.pachet || {}).slice(0, 120));
  const laS = await json('PUT', '/api/companies/' + coB.id + '/settings', S, { ai_pachet: null });
  T('null = înapoi la Start', laS.status === 200 && laS.j.ai_pachet === null && (await cota(bAdm)).pachet.cod === 'start');
  const aud = await json('GET', '/api/audit?limit=200', S);
  const rand = (Array.isArray(aud.j) ? aud.j : []).find((r) => r.entity === 'company_settings' && JSON.stringify(r.details || '').indexOf('ai_pachet') >= 0);
  T('schimbarea pachetului intră în jurnal, de la cât la cât', !!rand && JSON.stringify(rand.details).indexOf('"la":"start"') >= 0, aud.status + ' ' + JSON.stringify((Array.isArray(aud.j) ? aud.j : []).filter((r) => r.entity === 'company_settings').slice(0, 2)).slice(0, 300));

  // ── e) Pasul 5: oferta cu pachet → contract → firmă → factură ────────────────────────────────────
  console.log('   e) Oferta cu pachet → contract → firmă → factură');
  const ofP = (await json('POST', '/api/admin/offers', S, { name: 'Ofertă Pachet', client_name: 'Firma Oferta Pro SRL', monthly_total: 108, currency: 'RON',
    config: { cfg: { aiPachet: 'pro', aiPachetPret: 18, aiA: true, contractMonths: 24, montaj: {}, devices: {} }, prices: { pkBasic: 10, pkPro: 20, pkBusiness: 30 } } })).j;
  await json('PUT', '/api/admin/offers/' + ofP.id + '/stare', S, { status: 'trimisa' });
  const coO = await firma('Firma Oferta Pro SRL', '350000000059006', 'B 606 OFE');
  const ctO = await json('POST', '/api/companies/' + coO.id + '/contract', S, { offer_id: ofP.id, months: 24,
    din_oferta: { unitati: { plain: 45, can: 45, fms: 65 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS', cant: 2, pret: 45, total: 90 }], servicii: [{ fel: 'ai', nume: 'RA Insight Pro', cant: 1, pret: 18, total: 18 }] } });
  T('contractul din ofertă: pachetul în anexă (Pro, 18 lei negociat, prețurile celorlalte de la data ofertei)',
    // (baza întoarce cheile în altă ordine — se compară pe câmpuri)
    ctO.status === 200 && (function (a) { return a && a.cod === 'pro' && a.nume === 'Pro' && a.pretRON === 18 && a.lista && a.lista.basic === 10 && a.lista.pro === 20 && a.lista.business === 30 && Object.keys(a.lista).length === 3; })(ctO.j.annex && ctO.j.annex.aiPachet)
    && !(ctO.j.annex && ctO.j.annex.aiSeatPriceRON), ctO.status + ' ' + JSON.stringify(ctO.j.annex && ctO.j.annex.aiPachet));
  const stO = (await json('GET', '/api/companies/' + coO.id + '/settings', S)).j;
  T('…și pe firmă: pachetul Pro la 18 lei, RA Insight pornit', stO.ai_pachet && stO.ai_pachet.cod === 'pro' && stO.ai_pachet.pretRON === 18 && stO.features && stO.features.ai_assistant === true, JSON.stringify(stO.ai_pachet));
  await json('POST', '/api/test/simulate', S, { imei: '350000000059006' });
  const ovO = (await json('GET', '/api/companies/' + coO.id + '/overview', S)).j;
  T('prețul lunar al firmei: mașina + „RA Insight Pro" 18 lei', ovO.price && ovO.price.breakdown && ovO.price.breakdown.aiPachet === 18 && ovO.price.breakdown.aiPachetEticheta === 'RA Insight Pro', JSON.stringify(ovO.price && ovO.price.breakdown));
  const cmp = ovO.comparatie && ovO.comparatie.raInsight;
  T('„Contract ↔ factură": pachetul din contract lângă rândul de pe factură — Pro, 18 = 18',
    cmp && cmp.pachet === true && cmp.contractNume === 'Pro' && cmp.contractLei === 18 && cmp.facturaNume === 'RA Insight Pro' && cmp.facturaLei === 18, JSON.stringify(cmp));
  // O firmă care are deja un pachet cu AI (pus de noi, negociat separat) nu și-l pierde la un contract dintr-o ofertă Basic.
  const ofB = (await json('POST', '/api/admin/offers', S, { name: 'Ofertă Basic', client_name: 'Firma Are Business SRL', monthly_total: 100, currency: 'RON',
    config: { cfg: { aiPachet: 'basic', aiPachetPret: 10, aiA: true, contractMonths: 24, montaj: {}, devices: {} }, prices: { pkBasic: 10, pkPro: 20, pkBusiness: 30 } } })).j;
  const coZ = await firma('Firma Are Business SRL', '350000000059007', 'B 707 ARE');
  await json('PUT', '/api/companies/' + coZ.id + '/settings', S, { ai_pachet: { cod: 'business', pretRON: 25 } });
  await json('POST', '/api/companies/' + coZ.id + '/contract', S, { offer_id: ofB.id, months: 24, din_oferta: { unitati: { plain: 45, can: 45, fms: 65 }, vehicule: [], servicii: [] } });
  const stZ = (await json('GET', '/api/companies/' + coZ.id + '/settings', S)).j;
  T('o firmă cu pachet deja (Business, 25 lei) nu e călcată de un contract dintr-o ofertă Basic', stZ.ai_pachet && stZ.ai_pachet.cod === 'business' && stZ.ai_pachet.pretRON === 25, JSON.stringify(stZ.ai_pachet));
  // Prețurile de listă din „Prețurile noastre" ajung peste tot: pagina pachetelor, fila „Acces", pachetul pus fără preț.
  await json('PUT', '/api/admin/system-settings', S, { tarife_lista: { pkPro: 24 } });
  const coL = await firma('Firma Lista SRL', '350000000059008', 'B 808 LIS');
  await json('PUT', '/api/companies/' + coL.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
  const stL = (await json('GET', '/api/companies/' + coL.id + '/settings', S)).j;
  T('pachetul pus fără preț ia prețul de listă de azi (Pro 24), iar fila „Acces" arată lista', stL.ai_pachet && stL.ai_pachet.pretRON === 24 && (stL.pachete || []).find((x) => x.cod === 'pro').pret === 24, JSON.stringify({ p: stL.ai_pachet, l: stL.pachete }));
  T('…și „Vezi pachetele" din aplicație scrie același preț', ((await json('GET', '/api/insight/pachete', zAdm.ck)).j.pachete || []).find((x) => x.cod === 'pro').pret === '24 de lei');
  await json('PUT', '/api/admin/system-settings', S, { tarife_lista: { pkPro: '' } });

  // ── f) Pasul 6: administratorul trece singur la alt pachet ───────────────────────────────────────
  console.log('   f) Trecerea la alt pachet, din aplicație');
  const coT = await firma('Firma Trecere SRL', '350000000059009', 'B 909 TRE');
  await json('PUT', '/api/companies/' + coT.id, S, { contact_email: 'office@trecere.ro' });
  const luna1 = Date.now() - 100 * 86400000;   // înainte de 1 a lunii trecute, oricare ar fi azi
  await json('PUT', '/api/companies/' + coT.id + '/settings', S, { ai_pachet: { cod: 'basic', de_la: luna1 } });
  await json('PUT', '/api/devices/350000000059009/abonament', S, { de_la: luna1 });
  const tAdm = await om('sef@trecere.ro', 'company_admin', coT.id);
  const tMan = await om('ana@trecere.ro', 'manager', coT.id);
  await cota(tAdm); await loc(tMan);
  const pkT = await json('GET', '/api/insight/pachete', tAdm.ck);
  T('„Vezi pachetele": administratorul poate schimba singur, cu textul de jos de la server', pkT.j.poateSchimba === true && pkT.j.actual === 'basic' && /Alegi alt pachet chiar de aici/.test(pkT.j.schimbText || ''), JSON.stringify({ p: pkT.j.poateSchimba, a: pkT.j.actual }));
  T('…managerul nu (403), noi nici (pachetul îl punem din fila „Acces")', (await json('GET', '/api/insight/pachet-trecere?cod=pro', tMan.ck)).status === 403
    && (await json('GET', '/api/insight/pachet-trecere?cod=pro', S)).status === 403 && (await json('GET', '/api/insight/pachete', S)).j.poateSchimba === false);
  const prev = await json('GET', '/api/insight/pachet-trecere?cod=pro', tAdm.ck);
  const zR = P.ziuaRo(Date.now()), nZ = P.zileLuna(zR.an, zR.luna), ramZ = nZ - zR.zi + 1, difAsteptata = Math.round(10 * ramZ / nZ * 100) / 100;
  T('fereastra: textul exact (Basic → Pro de azi, cu diferența pe zile), bifa și butonul', prev.status === 200 && prev.j.sens === 'sus' && prev.j.buton === 'Trec la Pro de azi'
    && prev.j.text.indexOf('diferența de ' + difAsteptata.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei fără TVA') > 0 && /Am citit și sunt de acord/.test(prev.j.bifa || ''), prev.j.text);
  T('fără bifă: refuz (400)', (await json('POST', '/api/insight/pachet-trecere', tAdm.ck, { cod: 'pro', text: prev.j.text })).status === 400);
  const vechiT = await json('POST', '/api/insight/pachet-trecere', tAdm.ck, { cod: 'pro', text: 'alt text', acord: true });
  T('un text care nu mai e cel de acum: 409, cu textul nou (omul citește din nou)', vechiT.status === 409 && vechiT.j.text === prev.j.text);
  const nMail = primite.length;
  const sus = await json('POST', '/api/insight/pachet-trecere', tAdm.ck, { cod: 'pro', text: prev.j.text, acord: true });
  T('confirmat: pachetul Pro de azi; mesajul spune unde a plecat confirmarea', sus.status === 200 && sus.j.sens === 'sus' && /^Gata: firma are pachetul Pro de azi\. Confirmarea a plecat pe email \(office@trecere\.ro, sef@trecere\.ro\), în PDF\.$/.test(sus.j.mesaj || ''), sus.status + ' ' + (sus.j.mesaj || sus.j.error));
  const qT = await cota(tAdm);
  T('…și RA Insight are de acum 600 de întrebări (Pro)', qT.pachet && qT.pachet.cod === 'pro' && qT.questions === 600, JSON.stringify(qT.pachet || {}).slice(0, 100));
  const em = primite.slice(nMail).filter((x) => /Confirmare: pachetul RA Insight/.test(x.corp.subject || ''))[0];
  const ata = em && (em.corp.attachment || [])[0];
  T('emailul: firmei și omului, cu PDF-ul atașat (numele casei)', !!em && em.corp.to.map((x) => x.email).join() === 'office@trecere.ro,sef@trecere.ro'
    && ata && /^RA-Track - Confirmare pachet RA Insight - Firma Trecere SRL - \d\d\.\d\d\.\d{4}\.pdf$/.test(ata.name) && Buffer.from(ata.content, 'base64').slice(0, 4).toString() === '%PDF', JSON.stringify(em && { to: em.corp.to, a: ata && ata.name }));
  const trimise = (await json('GET', '/api/mail/trimise', S)).j.mailuri || [];
  T('…și apare în „Trimise" ca „Pachet RA Insight", pe firma ei', trimise.some((m) => m.fel === 'pachet' && m.felText === 'Pachet RA Insight' && m.companyId === coT.id), JSON.stringify(trimise.slice(0, 2)).slice(0, 200));
  const pdfT = await fetch(B + '/api/insight/pachet-trecere/' + sus.j.trecereId + '/pdf', { headers: { Cookie: tAdm.ck } });
  const pdfAltul = await fetch(B + '/api/insight/pachet-trecere/' + sus.j.trecereId + '/pdf', { headers: { Cookie: zAdm.ck } });
  const pdfNoi = await fetch(B + '/api/insight/pachet-trecere/' + sus.j.trecereId + '/pdf', { headers: { Cookie: S } });
  T('PDF-ul confirmării: al firmei (200), al altei firme nu (404), noi da', pdfT.status === 200 && Buffer.from(await pdfT.arrayBuffer()).slice(0, 4).toString() === '%PDF' && pdfAltul.status === 404 && pdfNoi.status === 200,
    pdfT.status + ' / ' + pdfAltul.status + ' / ' + pdfNoi.status);
  const pcT = await json('GET', '/api/insight/pachet-conturi', tAdm.ck);
  T('„Pachet și conturi": confirmarea în listă (Basic → Pro, cine, trimisă pe email, PDF)', (pcT.j.treceri || []).length === 1 && /^Basic → Pro, din \d\d\.\d\d\.\d{4}$/.test(pcT.j.treceri[0].rezumat) && pcT.j.treceri[0].email === 'trimisă pe email', JSON.stringify(pcT.j.treceri));
  const aud6 = (await json('GET', '/api/audit?limit=100', S)).j;
  T('în jurnal: „ai_pachet_trecere", de la cât la cât; la noi, anunțul', (Array.isArray(aud6) ? aud6 : []).some((r) => r.action === 'ai_pachet_trecere' && JSON.stringify(r.details).indexOf('"la":"pro"') >= 0)
    && ((await json('GET', '/api/notifications?limit=80', S)).j || []).some((n) => n.type === 'pachet_trecere' && /Firma Trecere SRL/.test(n.title)));
  // Factura: luna asta s-a facturat în avans pe Basic; diferența pe zile vine pe factura lunii următoare.
  const lunaUrm = (zR.luna === 12 ? (zR.an + 1) + '-01' : zR.an + '-' + String(zR.luna + 1).padStart(2, '0'));
  const lunaAcum = zR.an + '-' + String(zR.luna).padStart(2, '0');
  const dAcum = (await json('POST', '/api/invoices/draft', S, { companyId: coT.id, luna: lunaAcum })).j;
  const dUrm = (await json('POST', '/api/invoices/draft', S, { companyId: coT.id, luna: lunaUrm })).j;
  const ai = (d) => (d.lines || []).filter((l) => /^RA Insight/.test(l.desc)).map((l) => l.desc + '=' + l.net).join(' | ');
  T('factura lunii de acum: Basic întreg (în avans, ca la emitere)', /^RA Insight Basic — \S+ \d{4}=10$/.test(ai(dAcum)), ai(dAcum));
  T('factura lunii următoare: Pro întreg + diferența pe zilele rămase (' + ramZ + ')', new RegExp('^RA Insight Pro — \\S+ \\d{4}=20 \\| RA Insight — trecerea la pachetul Pro, ' + (zR.zi === nZ ? zR.zi : zR.zi + '–' + nZ) + '\\.' + String(zR.luna).padStart(2, '0') + '\\.' + zR.an + ' \\(.*\\)=' + difAsteptata.toString().replace('.', '\\.') + '$').test(ai(dUrm)), ai(dUrm));
  // Mai mic: Pro → Basic de la 1 a lunii următoare (cu 2 conturi: administratorul + Ana — încap în Basic).
  const prevJ = await json('GET', '/api/insight/pachet-trecere?cod=basic', tAdm.ck);
  const jos = await json('POST', '/api/insight/pachet-trecere', tAdm.ck, { cod: 'basic', text: prevJ.j.text, acord: true });
  const qJ = await cota(tAdm), pkJ = await json('GET', '/api/insight/pachete', tAdm.ck), pcJ = await json('GET', '/api/insight/pachet-conturi', tAdm.ck);
  T('mai mic: programat de la 1 a lunii următoare; până atunci rămâne Pro, iar ecranele spun ce urmează', jos.status === 200 && jos.j.sens === 'jos' && prevJ.j.buton === 'Trec la Basic din ' + P.dataLunga(P.inceputLunaUrm(Date.now()))
    && qJ.pachet.cod === 'pro' && pkJ.j.urmator && pkJ.j.urmator.cod === 'basic' && /^Programat din 1 /.test(pkJ.j.urmator.scurt) && /firma trece pe pachetul Basic/.test(pcJ.j.urmator || ''), JSON.stringify({ s: jos.status, m: jos.j.mesaj || jos.j.error, u: pkJ.j.urmator }));
  const dUrm2 = (await json('POST', '/api/invoices/draft', S, { companyId: coT.id, luna: lunaUrm })).j;
  T('…iar factura lunii următoare: Basic întreg + diferența pe zile pentru Pro din luna asta', new RegExp('^RA Insight Basic — \\S+ \\d{4}=10 \\| RA Insight — trecerea la pachetul Pro, ').test(ai(dUrm2)), ai(dUrm2));
  const prevA = await json('GET', '/api/insight/pachet-trecere?cod=pro', tAdm.ck);
  const anul = await json('POST', '/api/insight/pachet-trecere', tAdm.ck, { cod: 'pro', text: prevA.j.text, acord: true });
  T('alegerea lui Pro din nou = anularea trecerii programate (Rămân pe Pro)', prevA.j.sens === 'anulare' && prevA.j.buton === 'Rămân pe Pro' && anul.status === 200 && !(await json('GET', '/api/insight/pachete', tAdm.ck)).j.urmator);
  for (const n of ['x1', 'x2']) await loc(await om(n + '@trecere.ro', 'viewer', coT.id));
  const prea = await json('GET', '/api/insight/pachet-trecere?cod=basic', tAdm.ck);
  T('cu 4 conturi, Basic se refuză: „oprește întâi 2 conturi"', prea.status === 400 && /Oprește întâi 2 conturi/.test(prea.j.error || ''), prea.j.error);
  const coVV = await firma('Firma Pe Cont SRL', '350000000059010', 'B 110 CON');
  await json('PUT', '/api/companies/' + coVV.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 }, regula_veche: true });
  const vvAdm = await om('sef@pecont.ro', 'company_admin', coVV.id);
  T('firma pe regula veche nu-și schimbă singură pachetul (poateSchimba: false, 403)', (await json('GET', '/api/insight/pachete', vvAdm.ck)).j.poateSchimba === false
    && (await json('GET', '/api/insight/pachet-trecere?cod=pro', vvAdm.ck)).status === 403);

  console.log('\n' + ok + ' trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
