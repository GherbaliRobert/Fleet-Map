// verify_pachete.js — pachetele RA Insight (Alin, 14.10, „Capitolul 1"): Start / Basic / Pro / Business.
//
//   node verify_pachete.js
//
// Ce păzește:
//   1. regula (pachete.js): ce primește fiecare pachet, conturile, împărțirea întrebărilor, starea (cota, limita omului,
//      partea la comun, plasa de 80%), analiza aprofundată, textele (fără bani pentru client);
//   2. sursa: o singură numărătoare a răspunsurilor pe butoane, ramurile de la Basic în sus, costul nu pleacă la client;
//   3. pe server pornit, cu modelul SIMULAT (nu se cheltuie nimic):
//      Start — doar administratorul, singur primește locul, 50 de răspunsuri pe butoane, întrebarea liberă NU pleacă spre
//      model, „Rezumă raportul" pe reguli, fila AI Raport cu cont, ramurile închise; la capăt, mesajul până pe 1;
//      Basic — 2 conturi, întrebările libere la model (se numără), butoanele pe reguli (nu se numără), plasa;
//      Pro — limitele pe om, partea la comun, analiza aprofundată (Sonnet) doar pornită, doar la „de ce", cât ține bugetul;
//      regula veche, pe cont, rămâne cum era; super-adminul pune / scoate pachetul.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('./pachete');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────
console.log('1. Regula pachetelor (pachete.js)');
const p = (c) => P.dupaCod(c);
T('patru pachete, în ordine: Start, Basic, Pro, Business', P.PACHETE.map((x) => x.nume).join() === 'Start,Basic,Pro,Business');
T('Start: 0 lei, 1 cont (administratorul), 50 de răspunsuri, fără AI, fără ramuri', p('start').pret === 0 && p('start').conturi === 1 && p('start').intrebari === 50 && !p('start').ai && !p('start').ramuri && p('start').doarAdmin);
T('Basic: 10 lei, 2 conturi, 200 de întrebări la comun, cu AI și ramuri, fără împărțire', p('basic').pret === 10 && p('basic').conturi === 2 && p('basic').intrebari === 200 && p('basic').ai && p('basic').ramuri && !p('basic').imparte);
T('Pro: 20 de lei, până la 5 conturi, 600 de întrebări, împărțire, 5 lei de analiză aprofundată', p('pro').pret === 20 && p('pro').conturi === 5 && p('pro').intrebari === 600 && p('pro').imparte && p('pro').sonnetLei === 5);
T('Business: 30 de lei, conturi nelimitate, 1.000 de întrebări, împărțire, 8 lei de analiză aprofundată', p('business').pret === 30 && p('business').conturi === null && p('business').intrebari === 1000 && p('business').imparte && p('business').sonnetLei === 8);
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
T('Basic: întrebările sunt la comun (împărțirea e de la Pro)', /de la Pro în sus/.test(P.refuzLimita(p('basic'), 50, 0) || ''));
T('Pro: 100 lângă 300 date altora — da; 400 lângă 300 — nu, cu „cel mult 300"', P.refuzLimita(p('pro'), 100, 300) === null && /Mai puteți da cel mult 300\./.test(P.refuzLimita(p('pro'), 400, 300) || ''), P.refuzLimita(p('pro'), 400, 300));
T('Pro: limita e un întreg ≥ 0; gol = la comun', !!P.refuzLimita(p('pro'), 2.5, 0) && !!P.refuzLimita(p('pro'), -1, 0) && P.refuzLimita(p('pro'), null, 0) === null && P.refuzLimita(p('pro'), 0, 0) === null);

console.log('   starea');
const st = (cod, o) => P.stare(Object.assign({ pachet: Object.assign(p(cod), { pretRON: p(cod).pret }), peOm: true }, o));
T('Basic, 120 din 200: merge, 80 rămase', !st('basic', { folositeFirma: 120 }).blocat && st('basic', { folositeFirma: 120 }).ramase === 80);
T('Basic, 200 din 200: se oprește (cota)', st('basic', { folositeFirma: 200 }).motiv === 'cota');
T('plasa: 8 lei cheltuiți pe Basic oprește RA Insight chiar cu întrebări rămase (și înaintea cotei)', st('basic', { folositeFirma: 10, costLei: 8 }).motiv === 'plasa' && st('basic', { folositeFirma: 200, costLei: 9 }).motiv === 'plasa' && st('basic', { costLei: 7.99 }).blocat === false);
T('Start nu are plasă (n-are AI): oprit doar la 50 de răspunsuri', st('start', { folositeFirma: 49, costLei: 100 }).blocat === false && st('start', { folositeFirma: 50 }).motiv === 'cota');
T('Pro: omul cu limita 100 ajunsă se oprește (limita), colegii nu', st('pro', { folositeFirma: 150, limitaOm: 100, folositeOm: 100, sumaLimite: 100, folositeCuLimita: 100 }).motiv === 'limita' && !st('pro', { folositeFirma: 150, limitaOm: null, sumaLimite: 100, folositeCuLimita: 100 }).blocat);
T('Pro: partea la comun (600 − 500 date) se termină → la comun, oprit; cu limită, merge', st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }).motiv === 'comun' && !st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60, limitaOm: 200, folositeOm: 60 }).blocat);
T('starea FIRMEI (fără om) se oprește doar la plasă și cotă, nu la limita sau partea unui om', !P.stare({ pachet: p('pro'), folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }).blocat);
T('procentul din plasă nu trece de 100%', st('pro', { costLei: 40 }).plasaProcent === 1 && st('pro', { costLei: 8 }).plasaProcent === 0.5);

console.log('   analiza aprofundată');
const am = (cod, o) => P.alegeModel(Object.assign({ pachet: p(cod), pornita: true, analiza: true, cheltuitLei: 0 }, o));
T('Pro / Business, pornită, la „de ce", cu buget → aprofundat', am('pro') === 'aprofundat' && am('business') === 'aprofundat');
T('Start, Basic, oprită, întrebare obișnuită, buget dus → modelul obișnuit', am('start') === 'obisnuit' && am('basic') === 'obisnuit' && am('pro', { pornita: false }) === 'obisnuit' && am('pro', { analiza: false }) === 'obisnuit' && am('pro', { cheltuitLei: 4.8 }) === 'obisnuit' && am('business', { cheltuitLei: 7.7 }) === 'aprofundat');

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
T('partea la comun terminată: „îți rămân 0" + „Tu: s-au terminat întrebările lăsate la comun"', P.textScurt(st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 })) === 'îți rămân 0' && /lăsate la comun/.test(P.textOm(st('pro', { folositeFirma: 160, sumaLimite: 500, folositeCuLimita: 60 }))));
T('limita cea mai veche de pe firmă (ai_monthly_limit) = regula veche, nu Start', P.pachetFirma({}, 80) === null && P.pachetFirma({}, 0).cod === 'start' && P.pachetFirma({ ai_pachet: { cod: 'basic' } }, 80).cod === 'basic');
const pub = P.publice({ aprofundat: false }), pubSite = P.publice({ cuPret: false, aprofundat: true });
T('descrierile pachetelor: un singur loc, cu ce primește fiecare (Start: ce NU are)', pub.length === 4 && pub[0].fara.length === 2 && pub[1].include.some((x) => /Ramurile/.test(x)) && pub[0].pret === 'Inclus' && pub[2].pret === '20 de lei');
T('analiza aprofundată se scrie doar cât e pornită (doar ce face aplicația azi)', !pub[2].include.some((x) => /aprofundat/i.test(x)) && pubSite[2].include.some((x) => /aprofundat/i.test(x)));
const stPro = st('pro', { folositeFirma: 188, sumaLimite: 300 });
const cc = P.cartonaseConturi(stPro, 4, OCT);
T('„Pachet și conturi": Pro · 20 de lei pe lună · 412 din 600 · 4 din 5 (mai poți da unul) · 300 de limite, restul la comun', cc.map((x) => x.val + '|' + x.sub).join(' / ') === 'Pro|20 de lei pe lună / 412|din 600 · se reîncarcă pe 1 noiembrie / 4|din 5 · mai poți da unul / 300|restul de 300 sunt la comun', cc.map((x) => x.val + '|' + x.sub).join(' / '));
T('„Pachet și conturi" pe Start: trei cartonașe (fără limite), „inclus în contract", „1 din 1 · toate date"', P.cartonaseConturi(st('start', { folositeFirma: 16 }), 1, OCT).map((x) => x.val + '|' + x.sub).join(' / ') === 'Start|inclus în contract / 34|din 50 · se reîncarcă pe 1 noiembrie / 1|din 1 · toate date');
T('cât a folosit omul: „58 din 200" cu limită, „64" la comun; nota spune ce înseamnă „la comun"', P.textFolositeOm(200, 58) === '58 din 200' && P.textFolositeOm(null, 64) === '64' && /La comun/.test(P.notaConturi(P.dupaCod('pro'))) && /doar administratorul/.test(P.notaConturi(P.dupaCod('start'))));
T('pe site, fără prețuri: „Cere ofertă" (Alin, 14.10)', pubSite.every((x) => x.pret == null) && pubSite[1].subPret === 'Cere ofertă' && pubSite[0].subPret === 'în orice contract');

// ─── 2. Sursa ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Sursa: o singură numărătoare, ramurile închise pe Start, banii nu pleacă la client');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const corp = (nume) => { const i = SRV.indexOf('function ' + nume + '('); if (i < 0) return ''; const j = SRV.indexOf('\n}\n', i); return SRV.slice(i, j); };
T('răspunsurile pe butoane se scriu într-un singur loc (_numaraRaspunsReguli)', (SRV.match(/db\.noteazaRaspunsReguli\(/g) || []).length === 2 && /db\.noteazaRaspunsReguli\(/.test(corp('_numaraRaspunsReguli')), (SRV.match(/db\.noteazaRaspunsReguli\(/g) || []).length + ' (una e ruta de probă)');
T('…chemat de chat, de fila AI Raport și de „Rezumă raportul"', (SRV.match(/await _numaraRaspunsReguli\(req, /g) || []).length === 3, (SRV.match(/await _numaraRaspunsReguli\(req, /g) || []).length);
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
T('pagina: caseta pachetului și contorul arată textele serverului (pachet.text / scurt / textOm), ca text', /function deseneazaPachet\(box, q\)/.test(blocIns) && /el\('div', 'insp-fond-s', p\.text/.test(blocIns) && /c\.textContent = S\.pachet \? String\(S\.pachet\.scurt/.test(blocIns) && /p\.textOm/.test(blocIns));
T('pagina: „Vezi pachetele" doar la administrator; fereastra cere /api/insight/pachete', /if \(esteAdmin\(\)\) \{ var a = el\('button', 'insp-pk-vezi'/.test(blocIns) && /cere\('GET', '\/api\/insight\/pachete'\)/.test(blocIns));
T('pagina: ramurile de la Basic apar încuiate pe Start („· Basic"), cu pagina lor de lămurire', /ramuraIncuiata\(r\)/.test(blocIns) && /'· Basic'/.test(blocIns) && /deseneazaIncuiata\(main\)/.test(blocIns) && /pachet: true \}/.test(blocIns));
T('pagina: butoanele (cartonașe, continuări, alegeri, casetă făcută din butoane) trimit `buton`, scrisul de mână nu', (blocIns.match(/insightTrimite\(t, \{ buton: true \}\)/g) || []).length === 3 && /insightTrimite\(c\.q, \{ buton: true \}\)/.test(blocIns) && /if \(buton\) corp\.buton = true;/.test(blocIns) && /if \(ev && ev\.inputType\) delete t\.dataset\.buton;/.test(blocIns) && /ta\.dataset\.buton = '1'/.test(PAG));
T('pagina: mesajul pachetului în caseta de avertizare; eticheta „analiză aprofundată"', /x\.limita \|\| x\.pachetMesaj/.test(blocIns) && /'chat-aprof', 'analiză aprofundată'/.test(blocIns) && /aprofundat: j\.aprofundat, limita: j\.limita, pachetMesaj: j\.pachetMesaj/.test(blocIns));
T('„Pachet și conturi": pagina în secțiune (doar textele serverului), deschisă din caseta pachetului și din Utilizatori', /async function deseneazaPachetConturi\(main\)/.test(blocIns) && /cere\('GET', '\/api\/insight\/pachet-conturi'\)/.test(blocIns) && /'Pachet și conturi →'\); a\.type = 'button'; a\.onclick = function \(\) \{ window\.insightRamura\('pachet'\); \}/.test(blocIns) && /onclick="insightPachetConturi\(\)"/.test(PAG));
T('…conturile și limitele pleacă pe rutele lor (ai-seat, ai-limita), nu pe o cale nouă', /cere\('PUT', '\/api\/users\/' \+ id \+ '\/ai-seat'/.test(blocIns) && /cere\('PUT', '\/api\/users\/' \+ id \+ '\/ai-limita'/.test(blocIns));
T('tabloul nostru: blocul pachetelor și rândul pachetului pe cartonașul firmei, din cifrele serverului', /function _aiuPachete\(p\)/.test(PAG) && /function _aiuPachetRand\(r\)/.test(PAG) && /_aiuPachete\(d\.pachete\)/.test(PAG) && /fetch\('\/api\/admin\/insight\/aprofundat', \{ method: 'PUT'/.test(PAG) && /fetch\('\/api\/admin\/insight\/sold', \{ method: 'PUT'/.test(PAG));
T('anunțul pentru noi la 60% din plasă și la plasă: o dată pe firmă, lună și prag, ținut minte în setări', /const PLASA_ANUNT_PROCENT = 60;/.test(SRV) && /_anuntaSuperadmini\(supers, 'ai_plasa'/.test(SRV) && /db\.setSetting\('ai_plasa_anuntat'/.test(SRV) && /setInterval\(\(\) => plasaAnuntTick\(\)/.test(SRV));
T('fila „Acces" a firmei: pachetul se pune de aici (super-admin), cu întrebare', /window\.raxCfgPachet = async function \(cod\)/.test(PAG) && /body: JSON\.stringify\(\{ ai_pachet: \{ cod: cod \} \}\)/.test(PAG));
T('„Dai RA Insight acestui cont?" pe un pachet nu mai spune că se facturează un cont în plus', /Prețul pachetului rămâne același, oricâte conturi dai\./.test(PAG));
const plans = require('./plans');
T('RA Insight e pornit implicit (Start inclus); unde l-am oprit noi, rămâne oprit', plans.featuresFor({ settings: {} }).ai_assistant === true && plans.featuresFor({ settings: { features: { ai_assistant: false } } }).ai_assistant === false);
T('suma veche „Asistent AI" nu apare pe factura unei firme care n-a cumpărat modulul', plans.computeCompanyPrice({ settings: {}, custom_plan: { priceNoneRON: 45, aiAssistantRON: 150 } }, { none: 2 }, { features: plans.featuresFor({ settings: {} }) }).monthlyTotal === 90 &&
  plans.computeCompanyPrice({ settings: { features: { ai_assistant: true } }, custom_plan: { priceNoneRON: 45, aiAssistantRON: 150 } }, { none: 2 }, { features: { ai_assistant: true } }).monthlyTotal === 240);

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
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_pachete', DEMO_DISABLED: 'true',
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
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
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
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
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
  const pk0 = await json('GET', '/api/insight/pachete', adm.ck);
  T('„Vezi pachetele": cele patru, cu ce primește fiecare, pachetul firmei = Start; fără analiza aprofundată cât e oprită', pk0.status === 200 && (pk0.j.pachete || []).length === 4 && pk0.j.actual === 'start' && !JSON.stringify(pk0.j.pachete).match(/aprofundat/i) && /Se reîncarcă pe 1/.test(pk0.j.reincarcare || ''), pk0.text.slice(0, 160));
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
  T('…pe modelul obișnuit, fără eticheta de analiză aprofundată', !/sonnet/.test(cereri().slice(-1)[0].model || '') && !bLib.j.aprofundat);
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
  T('„Pachet și conturi" pe Pro: patru cartonașe, Ana cu limita 597 și „2 din 597" folosite', pcP.status === 200 && (pcP.j.cartonase || []).length === 4 && !!anaPc && anaPc.limita === 597 && anaPc.folositeText === '2 din 597' && pcP.j.pachet.imparte === true, JSON.stringify(anaPc));
  const qB = await cota(pB);
  T('Bogdan: partea la comun s-a terminat (comun), Ana are încă din ale ei', qB.blocked === true && qB.motiv === 'comun' && (await cota(pA)).blocked === false, JSON.stringify({ b: qB.blocked, m: qB.motiv, c: qB.pachet && qB.pachet.comun }));
  const bogCom = await intreaba(pB, 'De ce a crescut consumul?');
  T('…mesajul lui spune că s-au terminat cele lăsate la comun', /lăsate la comun/.test(bogCom.j.reply || ''), (bogCom.j.reply || '').slice(0, 100));
  // analiza aprofundată
  const apr0 = await json('GET', '/api/admin/insight/aprofundat', S);
  T('analiza aprofundată pornește OPRITĂ (Alin: doar dacă proba arată că Haiku e slab)', apr0.status === 200 && apr0.j.pornita === false && (apr0.j.bugete || []).map((x) => x.cod + ':' + x.lei).join() === 'pro:5,business:8', apr0.text.slice(0, 160));
  T('comutatorul e doar al nostru (403 pentru administratorul firmei)', (await json('PUT', '/api/admin/insight/aprofundat', pAdm.ck, { pornita: true })).status === 403);
  coada([text('Cauza: ralanti.')]);
  await intreaba(pA, 'De ce a crescut consumul?');
  T('oprită: și la „de ce" răspunde modelul obișnuit', !/sonnet/.test(cereri().slice(-1)[0].model || ''));
  await json('PUT', '/api/admin/insight/aprofundat', S, { pornita: true });
  coada([text('Cauza: ralanti, cu cifre.')]);
  const aApr = await intreaba(pA, 'De ce a crescut consumul?');
  T('pornită, pe Pro, la „de ce": răspunde Sonnet, cu eticheta „analiză aprofundată"', cereri().slice(-1)[0].model === 'claude-sonnet-5-5' && aApr.j.aprofundat === true, cereri().slice(-1)[0].model);
  T('…iar „Vezi pachetele" o scrie acum la Pro și Business', /aprofundat/i.test(JSON.stringify(((await json('GET', '/api/insight/pachete', pAdm.ck)).j.pachete || []).slice(2))));
  coada([text('Răspuns simplu.')]);
  const aSimplu = await intreaba(pA, 'Câți km a făcut flota luna asta în total pe toate mașinile, cu tot cu cele oprite?');
  T('…la o întrebare obișnuită, modelul obișnuit', !/sonnet/.test(cereri().slice(-1)[0].model || '') && !aSimplu.j.aprofundat, cereri().slice(-1)[0].model);
  // bugetul de 5 lei: 600.000 de tokeni pe Sonnet = 1,2 $ ≈ 5,5 lei
  await json('POST', '/api/test/ai-usage', S, { companyId: coP.id, userId: pAdm.id, kind: 'insight', usage: { input_tokens: 600000, output_tokens: 0 }, model: 'claude-sonnet-5-5' });
  coada([text('Fără buget.')]);
  const aFara = await intreaba(pA, 'De ce a crescut consumul?');
  T('bugetul de analiză aprofundată dus: înapoi pe modelul obișnuit (RA Insight merge mai departe)', aFara.j.source === 'ai' && !/sonnet/.test(cereri().slice(-1)[0].model || '') && !aFara.j.aprofundat, cereri().slice(-1)[0].model);
  await json('PUT', '/api/admin/insight/aprofundat', S, { pornita: false });
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
  await json('PUT', '/api/companies/' + coV.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  const vAdm = await om('sef@veche.ro', 'company_admin', coV.id);
  const vFara = await om('fara@veche.ro', 'manager', coV.id);
  await loc(vAdm);
  const qV = await cota(vAdm);
  T('firma pe regula veche (50 pe cont): fond = conturi × 50, fără pachet', qV.questions === 50 && !qV.pachet, JSON.stringify(qV).slice(0, 160));
  T('…„Pachet și conturi" îi spune că e pe regula veche', (await json('GET', '/api/insight/pachet-conturi', vAdm.ck)).j.vechi === true);
  const arV = await json('POST', '/api/reports/ai-raport', vFara.ck, { text: 'Ce acte expiră?' });
  T('…și fila AI Raport rămâne pentru toți, ca înainte', arV.status === 200 && !!arV.j.raspuns && !arV.j.pachet, arV.status);
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

  console.log('\n' + ok + ' trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
