// verify_discutia.js — discuția lui Alin cu RA Insight, refăcută (15.10).
//
//   node verify_discutia.js
//
// Alin, 15.10, cu șase poze dintr-o discuție: „complet inutilă și plină de erori… dacă eram client ceream bani înapoi". Cele
// nouă cauze, toate în aplicație, și reparațiile lor (Alin: „1. da", „4. da"; insignele fără „bonus" și fără „nu se scade"):
//   1. anul mașinii („nu sunt disponibili") — RA Insight nu citea fișa mașinii;
//   2. consumul — o cifră socotită din fișă prezentată ca măsurată, cu senzorul blocat pe 25 L;
//   3. „foii de parcurs" neînțeles; 4. ziua uitată de buton; 5. „compară" + două zile → un singur raport, toată flota;
//   6. mașina pierdută la o cerere nouă; 7. „o corecție" falsă (RA Insight nu vedea cifrele rapoartelor făcute de aplicație);
//   8. „De verificat" pe sume bune (verificarea nu știa să adune pe mașini și citea „12.53" ca dată); 9. viteza „merită verificată".
// Aici: regulile curate (probleme.js, ai_raport.js, insight.js, cifre.js, pachete.js), pagina și TOATĂ discuția pe server pornit,
// cu modelul simulat (nu se cheltuie nimic) — inclusiv pagina noastră „RA Insight · control".
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const P = require('./probleme.js');
const A = require('./ai_raport.js');
const I = require('./insight.js');
const C = require('./cifre.js');
const K = require('./pachete.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Regulile detectorului (probleme.js) ─────────────────────────────────────────────────────────
console.log('\n1. „Am găsit o problemă": regulile (probleme.js)');
T('sursa consumului: măsurat (contor, senzor) față de socotit — spusă pe față',
  P.sursaConsum({ sursa: 'CAN' }).masurat && P.sursaConsum({ sursa: 'Senzor' }).masurat && !P.sursaConsum({ sursa: 'Estimat', consumFisa: 8 }).masurat &&
  /^NU e măsurat; socotit din consumul trecut în fișa mașinii \(8,0 l\/100 km\)$/.test(P.sursaConsum({ sursa: 'Estimat', consumFisa: 8 }).text));
T('…cu nivelul care nu se schimbă: „nivelul a stat pe 25 L toată perioada, deși mașina a mers" (fapt, fără „senzorul")', /^NU e măsurat: nivelul din rezervor a stat pe 25 L toată perioada, deși mașina a mers; socotit din consumul trecut în fișa mașinii/.test(P.sursaConsum({ sursa: 'Estimat (nivel CAN)', nivelBlocat: true, nivelStart: 25, consumFisa: 7.5 }).text));
// Alin, 19.10: „nu trebuie să ne învinuim pe noi… «păi voi nu ați verificat dacă are, eu vă plătesc»": echipamentul e treaba noastră.
const VINA = /senzor|aparat|instalator|montaj|necalibrat|blocat|nu trimite|verific/i;
T('…niciun text despre sursa consumului nu pune vina pe echipament și nu-l trimite pe client să verifice', [{ sursa: 'Estimat', consumFisa: 8 }, { sursa: 'Estimat (nivel CAN)', consumFisa: 8 }, { sursa: 'Estimat (nivel CAN)', nivelBlocat: true, nivelStart: 25, consumFisa: 7.5 }, { sursa: 'Estimat', consumImplicit: 9 }, {}].every((v) => !VINA.test(P.sursaConsum(v).text)));
T('…fără consum în fișă: „un consum obișnuit pentru felul mașinii", nu o cifră prezentată ca a ei', /consum obișnuit pentru felul mașinii \(9,0 l\/100 km\), fiindcă fișa n-are consumul trecut/.test(P.sursaConsum({ sursa: 'Estimat', consumImplicit: 9 }).text));
T('senzorul blocat: pe 100 km sau mai mult, nivelul a variat sub 1,5 L, fără alimentare', P.nivelBlocat(25, 25, 555, 0) && P.nivelBlocat(24.5, 25.5, 100, 0) && !P.nivelBlocat(25, 25, 99, 0) && !P.nivelBlocat(20, 25, 555, 0) && !P.nivelBlocat(25, 25, 555, 30) && !P.nivelBlocat(null, null, 555, 0));
const ps = P.problemaSenzor({ vehicul: 'B 154 UIP', imei: '1', km: 555, nivelStart: 25, consumFisa: 7.5 }, { from: 'a', to: 'b', eticheta: '5–11 octombrie' });
// Din 23.10 (macheta „Anunță echipa RA Track", aprobată pe 22.10): întâi „Anunță echipa RA Track" — singurul lucru de făcut pentru
// client e să ne anunțe, aparatul e treaba noastră —, apoi raportul de consum, cu nota de sub butoane. Tot fără calibrare și fără vină.
T('nivelul care nu se schimbă: galben, faptul în cifre („consumul nu se poate măsura acum"), „Anunță echipa RA Track" + raportul de consum — fără calibrare, fără vină pe echipament',
  ps.grav === 'galben' && ps.titlu === 'Consumul la B 154 UIP nu se poate măsura acum' && /^Pe 5–11 octombrie nivelul din rezervor a stat la 25 L, deși mașina a mers 555 km, așa că din el nu se poate măsura consumul\. Consumul de aici e socotit din consumul trecut în fișa mașinii \(7,5 l\/100 km\)\.$/.test(ps.dovada) &&
  ps.butoane.length === 2 && ps.butoane[0].fel === 'echipa' && ps.butoane[0].text === 'Anunță echipa RA Track' && ps.butoane[0].problema === 'consum' &&
  ps.butoane[1].fel === 'raport' && ps.butoane[1].tip === 'consumption' && /^Aparatul e treaba noastră/.test(ps.nota || '') &&
  !VINA.test(ps.titlu + ' ' + ps.dovada) && !/calibr|senzor|blocat|nu trimite|verific|instalator|montaj/i.test(JSON.stringify(ps.butoane) + ' ' + (ps.nota || '')), JSON.stringify(ps));
const t0 = Date.parse('2026-10-08T11:30:00Z');
const sir = (viteze, pas) => { let lng = 26; return viteze.map((v, i) => { const p = { t: t0 + i * 30000, lat: 44.45, lng, v }; lng += (pas != null ? pas : v / 3600 * 30) / (111 * Math.cos(44.45 * Math.PI / 180)); return p; }); };
const vr = P.verdictViteza(sir([90, 95, 140, 150, 159, 148, 141, 95]), 130);
T('viteza reală: mai multe poziții la rând peste prag, drumul se leagă', vr && vr.verdict === 'reala' && vr.vmax === 159 && vr.nPeste === 5 && vr.km > 4, JSON.stringify(vr));
const ve = P.verdictViteza([{ t: t0, lat: 44.45, lng: 26, v: 60 }, { t: t0 + 30000, lat: 44.4505, lng: 26.006, v: 159 }, { t: t0 + 60000, lat: 44.451, lng: 26.012, v: 60 }], 130);
T('eroarea de GPS: un singur punct ieșit din șir, iar din poziția dinainte în cea de după mașina a mers încet', ve && ve.verdict === 'eroare' && ve.impl < 100, JSON.stringify(ve));
T('sub prag → nicio problemă', P.verdictViteza(sir([90, 110, 125]), 130) === null);
const pv = P.problemaViteza(vr, { vehicul: 'B 154 UIP', imei: '1', prag: P.pragViteza({}), adresa: 'Bolintin' });
T('problema de viteză: titlul cu ziua și ora (ora României), dovada fără „merită verificat", butoanele spre Traseu la minutul acela și spre Depășiri viteză',
  pv.grav === 'rosu' && pv.titlu === '159 km/h pe 8 octombrie, la 14:32' && /^Viteză reală, nu eroare de GPS: 5 poziții la rând peste 130 km\/h, pe .+ km, lângă Bolintin\. Cea mai mare limită din România e 130 km\/h, pe autostradă\.$/.test(pv.dovada) &&
  pv.butoane[0].fel === 'traseu' && pv.butoane[0].la === new Date(vr.t).toISOString() && pv.butoane[0].lat === vr.lat && pv.butoane[1].tip === 'speeding' && !/verific/i.test(pv.dovada), JSON.stringify(pv));
T('eroarea de GPS e galbenă și spune „Nu-l lua în calcul"', P.problemaViteza(ve, { vehicul: 'X', imei: '1', prag: P.pragViteza({}) }).grav === 'galben' && /Nu-l lua în calcul/.test(P.problemaViteza(ve, { vehicul: 'X', imei: '1', prag: P.pragViteza({}) }).dovada));
T('pragul: limita din fișă, altfel 130 km/h (90 la camioane)', P.pragViteza({ limita: 110 }).kmh === 110 && P.pragViteza({ camion: true }).kmh === 90 && P.pragViteza({}).kmh === 130);
T('fișa mașinii: „anii de înmatriculare" privește anul; „ce consum" nu privește fișa', P.campuriCerute('vreau sa stiu anii de inmatriculare a masinilor').join() === 'anul de fabricație' && P.campuriCerute('ce consum a avut').length === 0);
const pf = P.problemaFisa('anul de fabricație', [{ nr: 'B 112 RFG', imei: '1', necompletat: ['anul de fabricație'] }, { nr: 'B 154 UIP', imei: '2' }, { nr: 'B 268 ROY', imei: '3', necompletat: ['anul de fabricație'] }]);
T('…ce lipsește, pe nume, cu butonul spre fila „Detalii vehicul" a fiecărei mașini', pf.grav === 'galben' && /\(2 mașini\)/.test(pf.titlu) && pf.butoane.length === 2 && pf.butoane.every((b) => b.fel === 'fisa' && b.fila === 'basic') && /B 112 RFG, B 268 ROY/.test(pf.dovada), JSON.stringify(pf));
T('cel mult ' + P.MAX_PROBLEME + ' probleme sub un răspuns, întâi cele roșii, fără dubluri', P.ordoneaza([{ fel: 'a', grav: 'galben', titlu: '1' }, { fel: 'b', grav: 'rosu', titlu: '2' }, { fel: 'b', grav: 'rosu', titlu: '2' }]).map((x) => x.titlu).join() === '2,1');
const SRC_P = fs.readFileSync(path.join(__dirname, 'probleme.js'), 'utf8');
T('probleme.js e curat (fără bază, fără rețea, fără model) și fără caractere de control', !/require\('\.\/db|require\('pg|fetch\(|callClaude/.test(SRC_P) && !/[\x00-\x08]/.test(SRC_P));

// ─── 2. Cererile (ai_raport.js) ─────────────────────────────────────────────────────────────────────
console.log('\n2. Cererile de rapoarte: „foii", mai multe zile, „compară", mașina și ziua păstrate');
const fisa = I.fisaFlotei([{ imei: '1', name: 'VW Passat B7', plate: 'B 112 RFG' }, { imei: '2', name: 'Dacia Logan 3', plate: 'B 154 UIP' }, { imei: '3', name: 'VW Caddy', plate: 'B 268 ROY' }], {});
const acum = Date.parse('2026-10-15T10:00:00Z');
const c1 = A.comanda('genereaza raportul foii de parcurs pentru b 154 uip pe ziua de 8 octombrie.', null, fisa, acum);
T('„generează raportul FOII de parcurs … pe ziua de 8 octombrie" → Foaia de parcurs, B 154 UIP, doar 8 octombrie', c1 && c1.ok && c1.raport === 'trips' && c1.masini.join() === '2' && c1.perioada.eticheta === '8 octombrie', JSON.stringify(c1));
T('…și „foilor", „situației zilnice", „ultimei locații"', ['fa-mi raportul foilor de parcurs', 'genereaza raportul situatiei zilnice', 'fa-mi raportul ultimei locatii'].every((t) => { const u = A.comanda(t, null, fisa, acum); return u && u.ok; }));
const c2 = A.comanda('vreau sa mi generezi raportul foaie de parcurs de pe ziua de 8 octombrie si pe cel de pe 5 octombrie si sa mi faci o comparatie.', null, fisa, acum, { masini: ['2'] });
T('două zile + „comparație" → un raport pe zi (8 și 5 octombrie, în ordinea scrisă) și `analiza`', c2.ok && (c2.perioade || []).map((p) => p.eticheta).join() === '8 octombrie,5 octombrie' && c2.analiza === true, JSON.stringify(c2));
T('…pe mașina din discuție (B 154 UIP), nu pe toată flota', (c2.masini || []).join() === '2' && c2.mem.masini === true);
T('„pentru toată flota" schimbă mașina discuției', A.comanda('fa-mi foaia de parcurs pe 5, 7 si 8 octombrie pentru toata flota', null, fisa, acum, { masini: ['2'] }).masini === null);
T('„pe 5, 7 și 8 octombrie" = trei zile; „1–7 octombrie" = O perioadă', A.zileleDin('pe 5, 7 si 8 octombrie', acum).length === 3 && A.zileleDin('1-7 octombrie', acum) === null && A.zileleDin('pe 8 octombrie', acum) === null);
const c3 = A.comanda('genereaza raportul pentru b 154 uip pe ziua de 8 octombrie', null, fisa, acum);
T('cererea fără nume de raport ține minte mașina și ZIUA', !c3.ok && c3.motiv === 'fara_raport' && c3.context.masini.join() === '2' && c3.context.perioada && c3.context.perioada.from === c1.perioada.from, JSON.stringify(c3));
const c4 = A.comanda('Fă-mi raportul „Foaie de parcurs”', c3.context, fisa, acum);
T('…iar butonul ales face raportul pe ziua aceea (nu pe ultimele 7 zile)', c4.ok && c4.perioada.eticheta === '8 octombrie' && c4.masini.join() === '2' && c4.mem.perioada === true, JSON.stringify(c4));
T('o cerere simplă nu e „analiză"; „de ce" da', !A.comanda('fa-mi foaia de parcurs pe 8 octombrie', null, fisa, acum).analiza && A.comanda('fa-mi foaia de parcurs pe 8 octombrie si spune-mi de ce a mers asa mult', null, fisa, acum).analiza === true);

// ─── 3. Sumele și cifrele (insight.js, cifre.js) ────────────────────────────────────────────────────
console.log('\n3. Sumele pe mașină / zi și verificarea cifrelor');
const cols = ['Vehicul', 'Șofer', 'Plecare', 'Loc. plecare', 'Sosire', 'Loc. sosire', 'Durată', 'Distanță (km)', 'Km plecare', 'Km sosire', 'Vit. medie', 'Vit. max'];
const rd = (v, z, km, vm) => [v, 'x', z + ' 08:00', 'A', z + ' 09:00', 'B', '1h 0m', km.toFixed(2), '—', '—', 40, vm];
const rows = [rd('Dacia Logan 3 (B 154 UIP)', '05.10.2026', 12.11, 90), rd('Dacia Logan 3 (B 154 UIP)', '05.10.2026', 47.29, 137), rd('Dacia Logan 3 (B 154 UIP)', '08.10.2026', 96.4, 159), rd('VW Caddy (B 268 ROY)', '05.10.2026', 19.4, 50)];
const tot = I.totaluriPeMasina(cols, rows);
T('totalurile pe mașină le face aplicația, pe TOATE rândurile: kilometrii adunați, viteza cea mai mare', tot.pe_masina.length === 2 && tot.pe_masina[0]['Distanță (km) (adunat)'] === 155.8 && tot.pe_masina[0]['Vit. max (cea mai mare)'] === 159 && tot.pe_masina[0].randuri === 3, JSON.stringify(tot.pe_masina));
T('…și pe mașină și zi, când rândurile țin mai multe zile', (tot.pe_masina_si_zi || []).some((x) => /B 154 UIP/.test(x.vehicul) && x.zi === '05.10.2026' && x['Distanță (km) (adunat)'] === 59.4), JSON.stringify(tot.pe_masina_si_zi));
const date = [{ columns: cols, rows: rows, summary: { 'Distanță totală (km)': 175.2 } }];
T('„12.53" dintr-o celulă e 12,53 (nu ziua 12.53), iar „40,137" din JSON nu mai înghite viteza de 137 km/h', C._numarCelula('12.53') === 12.53 && C.negasite('Viteza maximă a fost 137 km/h.', date).length === 0);
T('sumele pe mașină și pe zi sunt găsite (59,4 km = 12,11 + 47,29); o cifră inventată nu', C.negasite('B 154 UIP: 59,4 km pe 5 octombrie, 155,8 km în total; B 268 ROY 19,4 km.', date).length === 0 && C.negasite('Flota a mers 777,7 km.', date).join() === '777,7 km');

// ─── 4. Insignele (pachete.js) ──────────────────────────────────────────────────────────────────────
console.log('\n4. Insignele, ca antet (Alin, 19.10: „varianta 1 — antetul"): ANALIZĂ mov (se numără), INSTANT verde');
// Forma: numele, eticheta și detaliul — toate de la server; `text` = propoziția întreagă.
const IN = (fel, o) => K.insigna(fel, o);
const egal = (x, nume, et, det, text) => x.nume === nume && x.eticheta === et && x.detaliu === det && x.text === text;
T('textele stau într-un singur loc: RA Insight · Analiză · 1 întrebare / RA Insight · Instant · din rapoarte',
  egal(IN('ai', { numarat: true }), 'RA Insight', 'Analiză', '1 întrebare', 'RA Insight · Analiză · 1 întrebare') && egal(IN('ai', {}), 'RA Insight', 'Analiză', '', 'RA Insight · Analiză') &&
  egal(IN('instant', {}), 'RA Insight', 'Instant', 'din rapoarte', 'RA Insight · Instant · din rapoarte') && egal(IN('instant', { numarat: true }), 'RA Insight', 'Instant', '1 răspuns', 'RA Insight · Instant · 1 răspuns') &&
  egal(IN('instant', { live: true }), 'RA Insight', 'Instant', 'din datele de acum', 'RA Insight · Instant · din datele de acum') && IN('ai', {}).fel === 'ai' && IN('instant', {}).fel === 'instant');
// Mesajele salvate pe 19.10 înainte de antet ({ fel, text } în forma veche) primesc la citire aceeași formă.
const nouDinVechi = (fel, text) => K.insignaCompleta({ fel, text });
const deja = IN('ai', { numarat: true });
T('mesajele de dinainte de antet se completează din textul lor (toate cele patru forme vechi), iar cele noi rămân neatinse',
  egal(nouDinVechi('ai', 'Analiză RA Insight · 1 întrebare'), 'RA Insight', 'Analiză', '1 întrebare', 'RA Insight · Analiză · 1 întrebare') && egal(nouDinVechi('ai', 'Analiză RA Insight'), 'RA Insight', 'Analiză', '', 'RA Insight · Analiză') &&
  egal(nouDinVechi('instant', 'Răspuns instant · din rapoarte'), 'RA Insight', 'Instant', 'din rapoarte', 'RA Insight · Instant · din rapoarte') && egal(nouDinVechi('instant', 'Răspuns instant · 1 răspuns'), 'RA Insight', 'Instant', '1 răspuns', 'RA Insight · Instant · 1 răspuns') &&
  egal(nouDinVechi('instant', 'Răspuns instant · din datele de acum'), 'RA Insight', 'Instant', 'din datele de acum', 'RA Insight · Instant · din datele de acum') && K.insignaCompleta(deja) === deja && K.insignaCompleta(null) === null);
const SRVd = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const INSd = require('./insight.js');
// Aceeași regulă la agenți (RA Insight le preia constatările prin fleet_alerts) și pe pagina publică a agenților (Alin, 19.10).
const AGd = fs.readFileSync(path.join(__dirname, 'agents.js'), 'utf8'), PUBd = fs.readFileSync(path.join(__dirname, 'public', 'agenti-ai.html'), 'utf8');
const corpuri = (AGd.match(/body: '[^\n]*/g) || []).join('\n');
T('agenții nu-l trimit pe client să verifice echipamentul (dispozitiv, alimentare, SIM, cablaj, interfața CAN), iar pagina publică nu pune vina pe montaj',
  corpuri.length > 500 && !/Verifică dispozitivul|alimentarea\/sim|sim-ul|cablaj|K-Line|interfața CAN|Remote Data Download/i.test(corpuri) && !/la montaj|un cablu/.test(PUBd) &&
  /sună șoferul/.test(corpuri) && /Pune scadența pe dată/.test(corpuri));
T('instrucțiunile: echipamentul e treaba noastră — RA Insight nu-l trimite pe client să verifice senzori, aparatul sau montajul (Alin, 19.10)',
  /^ECHIPAMENTUL: aparatul GPS, senzorii .*sunt treaba RA Track, nu a omului\. Nu-i cere să verifice, să repare sau să ceară echipament/.test(INSd.ECHIPAMENTUL || '') &&
  /\n    insight\.ECHIPAMENTUL,\n/.test(SRVd) &&
  /\*\*Ce să faci:\*\* \(cel mult trei puncte scurte, numai ce poate face omul singur/.test(SRVd) && !/consum fără senzor/.test(SRVd));
T('…scrisul nu mai dă „Verifică…" ca exemplu de recomandare și cere numai litere românești', !/„Verifică…"/.test(INSd.SCRISUL) && /„Completează…"/.test(INSd.SCRISUL) && /numai cu litere ' \+\s*'românești/.test(fs.readFileSync(path.join(__dirname, 'insight.js'), 'utf8')));
T('literele din alt alfabet se recunosc și se trec în litere românești („октомбrie" → „octombrie"); diacriticele românești rămân',
  INSd.areLitereStraine('Consum (октомбrie 2026)') && !INSd.areLitereStraine('ș ț ă î â Ș Ț') && INSd.litereRomanesti('Consum real acum (октомбrie 2026, până azi)') === 'Consum real acum (octombrie 2026, până azi)' &&
  INSd.litereRomanesti('Октомбрие') === 'Octombrie' && INSd.litereRomanesti('fără schimbări') === 'fără schimbări');
T('…pe server: un răspuns cu litere străine se rescrie o dată, iar ce rămâne se curăță; și Scrisoarea de luni se curăță',
  /const strain = insight\.areLitereStraine\(reply\);/.test(SRVd) && /\n    reply = insight\.litereRomanesti\(reply\);/.test(SRVd) && /text: insight\.litereRomanesti\(String\(text\)\.trim\(\)\), scrisDe: 'model'/.test(SRVd) &&
  (SRVd.match(/brut: true/g) || []).length === 2);
T('…completarea se face la citirea conversației (pe server), nu în pagină', /m\.extra\.insigna = pachete\.insignaCompleta\(m\.extra\.insigna\)/.test(SRVd));
const SRC_K = fs.readFileSync(path.join(__dirname, 'pachete.js'), 'utf8');
const bucInsigna = SRC_K.slice(SRC_K.indexOf('const INSIGNA'), SRC_K.indexOf('module.exports'));
T('…fără „bonus", „gratuit" sau „nu se scade" (Alin, 15.10: „să pară ceva profesionist")', !/bonus|gratuit|nu se scade/i.test(bucInsigna.replace(/^\s*\/\/.*$/gm, '')));

// ─── 5. Pagina ──────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. Pagina: chatul și „RA Insight · control"');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const FINS = PAG.slice(PAG.indexOf('window._chatInsigna = function (ins)'), PAG.indexOf('window._chatTextSimplu'));
T('insigna o scrie serverul; pagina doar o desenează (antet: nume, etichetă mov / verde, detaliu), cu textContent, fără niciun cuvânt al ei',
  /var cap = document\.createElement\('div'\); cap\.className = 'chat-ins-cap';/.test(FINS) && /s\.textContent = String\(t\)/.test(FINS) && !/innerHTML/.test(FINS) &&
  !/'(Analiză|Instant|RA Insight|1 întrebare|din rapoarte)/.test(FINS) && PAG.indexOf("'Analiză RA Insight") < 0);
const BULA = PAG.slice(PAG.indexOf('function bulaAi(m) {'), PAG.indexOf('window.insightTrimite = async function'));
T('antetul stă DEASUPRA răspunsului (înaintea titlului, a cartonașelor și a textului), nu dedesubt',
  BULA.indexOf('window._chatInsigna(x.insigna)') > 0 && BULA.indexOf('window._chatInsigna(x.insigna)') < BULA.indexOf("'inteles')") && BULA.indexOf('window._chatInsigna(x.insigna)') < BULA.indexOf('cartonasRaport(rp)') && BULA.indexOf('chat-ins-r') < 0);
T('Traseu de la o problemă: mașina, intervalul, traseul arătat și punctul marcat pe hartă', /window\.insightLaTraseu = function \(b\)/.test(PAG) && /L\.circleMarker\(\[Number\(b\.lat\), Number\(b\.lng\)\]/.test(PAG) && /historyMarkers\.push\(mk\)/.test(PAG));
T('meniul fondatorului: „RA Insight · control" sus, mereu la vedere (nu într-un grup); grupul se cheamă „Module"', /<button class="nav-item" data-vert="fondator" data-super onclick="navGo\(this, function\(\)\{ goSistem\('agents'\); \}\)"><i class="fas fa-wand-magic-sparkles"><\/i><span>RA Insight · control<\/span><\/button>\s*<div class="nav-group" data-vert="fondator" data-group="gestiune">/.test(PAG) &&
  /<span>Module<\/span>/.test(PAG) && PAG.indexOf('<span>Utilizare RA Insight</span>') < 0 && /agents: 'RA Insight · control'/.test(PAG));
const LOAD = PAG.slice(PAG.indexOf('window.raxLoadAiUsage = async function'), PAG.indexOf('// ─── sfârșit „Panoul RA Insight pe firme"'));
// Din 19.10 (punctul 5) panoul vechi „Mai multe cifre" a ieșit: pagina e doar asta, plus istoricul pe luni (buton).
T('pagina pe un ecran: patru cifre, ce cere atenție, firmă cu firmă, controalele, istoricul; panoul vechi „Mai multe cifre" nu mai e',
  /box\.innerHTML = _aiuPachete\(d\.pachete\)\s*\+ _aiuAtentie\(d\.pachete, s, rows\)\s*\+ _aiuTabel\(rows\)\s*\+ _aiuControale\(d\.pachete\)\s*\+ '<div class="aiu-ist-box">'/.test(LOAD) && LOAD.indexOf('aiu-mai-box') < 0 && PAG.indexOf('raxAiMaiMulte') < 0);
const CTL = PAG.slice(PAG.indexOf('function _aiuControale('), PAG.indexOf('function _aiuPachetRand('));
// Din 28.10 fără „Analiza aprofundată" (Sonnet scos; analiza atentă pe Haiku merge singură, fără buton).
T('controalele, toate într-un loc: proba modelelor, soldul și cheia Anthropic, istoricul — fără „Analiza aprofundată"', ['raxProbaModele()', 'raxAiSold()', "goSistem('dashboard')", 'raxAiIstoric()'].every((x) => CTL.indexOf(x) >= 0) &&
  CTL.indexOf('raxAiAprofundat') < 0 && PAG.indexOf('raxAiAprofundat') < 0);

// ─── 6. Pe server pornit: discuția lui Alin, cu modelul simulat ─────────────────────────────────────
const PORT = 3297, TCP = 5297;
const DIR = path.join(os.tmpdir(), 'rax_discutia_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');", 'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {', "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
  "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
  "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
  "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada)); r.usage = { input_tokens: 100, output_tokens: 20 };",
  "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });", '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);', '};'].join('\n'));
fs.writeFileSync(AI_LOG, ''); fs.writeFileSync(AI_COADA, '[]');
const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_discutia', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA, RATE_LIMIT_ENABLED: 'false',
  GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY; delete env.BREVO_API_KEY; delete env.SMTP_HOST;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, ck, body) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const unealta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const LUNI = I.LUNI;

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n6. Pe server pornit: discuția lui Alin, cu modelul simulat (nu se cheltuie nimic)');
  const S = await login('admin', 'test1234');
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Discuția SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
  const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start SRL' })).j;   // pachetul Start: fără AI
  const LOG = '862129084932001', CAD = '862129084932002', PAS = '862129084932003', STL = '862129084932004';
  await json('POST', '/api/devices/import', S, { rows: [
    { imei: LOG, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP', consum_afara: '7.5', consum_oras: '8.5' },
    { imei: CAD, nume: 'VW Caddy', nr_inmatriculare: 'B 268 ROY', consum_afara: '7', consum_oras: '8' },
    { imei: PAS, nume: 'VW Passat B7', nr_inmatriculare: 'B 112 RFG' },
    { imei: STL, nume: 'Dacia Duster', nr_inmatriculare: 'B 777 STR' }] });
  for (const imei of [LOG, CAD, PAS]) await json('PUT', '/api/devices/' + imei + '/company', S, { company_id: co.id });
  await json('PUT', '/api/devices/' + STL + '/company', S, { company_id: coS.id });
  await json('PUT', '/api/devices/' + LOG + '/details', S, { brand: 'Dacia', model: 'Logan', year: 2021 });
  const om = async (user, firma) => { const r = await json('POST', '/api/users', S, { username: user, full_name: 'Om Probă', role: 'company_admin', company_id: firma }); await puneParola(r.j, 'Str4da-Verde-2026', B); await json('PUT', '/api/users/' + r.j.id + '/ai-seat', S, { on: true }); return login(user, 'Str4da-Verde-2026'); };
  const ck = await om('sef@discutia.ro', co.id), ckS = await om('sef@start-discutia.ro', coS.id);
  T('pregătire: firma pe Pro (trei mașini), firma pe Start (una), câte un administrator cu RA Insight', !!(co.id && coS.id && ck && ckS));
  // Drumuri: acum 5 zile (liniștit) și acum 2 zile (cu 159 km/h, șase poziții peste 130); nivelul stă pe 25 L tot timpul.
  const zi = 86400000, azi0 = new Date(); azi0.setUTCHours(7, 0, 0, 0);
  const zA = azi0.getTime() - 5 * zi, zB = azi0.getTime() - 2 * zi;
  const etZi = (ms) => insight_zi(ms);
  function insight_zi(ms) { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'numeric' }).formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; }); return (+p.day) + ' ' + LUNI[+p.month - 1]; }
  // `mers` = viteza cu care se mută de fapt poziția (implicit = viteza raportată); la un salt de GPS, aparatul raportează 180 km/h,
  // dar poziția merge mai departe ca la 40.
  const drum = async (imei, t0d, viteze, mers) => {
    let lat = 44.40, lng = 26.10;
    for (let k = 0; k < viteze.length; k++) {
      await json('POST', '/api/test/simulate', S, { imei, ts: new Date(t0d + k * 30000).toISOString(), lat, lng, speed: viteze[k], io: { ignition: 1, fuel_level_liters: 25 } });
      lng += ((mers != null ? mers : viteze[k]) / 3600 * 30) / (111 * Math.cos(lat * Math.PI / 180));
    }
  };
  const lung = (n, v) => Array.from({ length: n }, () => v);
  await drum(LOG, zA, lung(60, 70));
  await drum(LOG, zB, lung(20, 90).concat([120, 142, 148, 159, 151, 144, 133], lung(60, 95)));
  await drum(CAD, zA + 3 * 3600000, lung(30, 40));
  // un salt de GPS la Caddy, ziua B: un singur punct de 180 km/h, între două la 40 km/h, aproape unul de altul
  await drum(CAD, zB + 3 * 3600000, lung(10, 40).concat([180], lung(10, 40)), 40);
  await drum(STL, zA, lung(30, 60)); await drum(STL, zB, lung(30, 60));

  // a) „foii de parcurs … pe ziua de X" → cartonaș pe ziua aceea, problema de viteză (reală), răspuns instant, fără model
  const n0 = cereri().length;
  const qa = await json('POST', '/api/insight/intreaba', ck, { message: 'genereaza raportul foii de parcurs pentru b 154 uip pe ziua de ' + etZi(zB) + '.', nou: true });
  const conv = qa.j.conversatieId;
  T('a) „foii de parcurs" pe o zi → cartonașul Foii de parcurs, B 154 UIP, doar ziua cerută', qa.j.source === 'reguli' && qa.j.raport && qa.j.raport.tip === 'trips' && qa.j.raport.perioada === etZi(zB) && /B 154 UIP/.test(qa.j.raport.vehicul), JSON.stringify(qa.j.raport));
  const pvA = (qa.j.probleme || []).find((p) => p.fel === 'viteza');
  T('…„Am găsit o problemă": 159 km/h, viteză reală (pozițiile din jur), cu butonul spre Traseu la minutul acela', pvA && /^159 km\/h pe /.test(pvA.titlu) && /^Viteză reală, nu eroare de GPS: 6 poziții la rând peste 130 km\/h/.test(pvA.dovada) && pvA.butoane[0].fel === 'traseu' && pvA.butoane[0].lat != null, JSON.stringify(qa.j.probleme));
  T('…insigna verde, INSTANT · din rapoarte, și niciun drum la model', (qa.j.insigna || {}).eticheta === 'Instant' && (qa.j.insigna || {}).detaliu === 'din rapoarte' && (qa.j.insigna || {}).fel === 'instant' && cereri().length === n0, JSON.stringify(qa.j.insigna));
  T('…textul răspunsului (îl vede RA Insight în discuția de după) poartă cifrele de sus ale raportului', /Curse: 1 · Distanță totală \(km\): /.test(qa.j.reply || ''), (qa.j.reply || '').slice(0, 160));

  // b) două zile + „comparație" → două cartonașe (pe reguli), apoi RA Insight compară: o întrebare, cu rapoartele în mână
  const kmB = (((qa.j.raport || {}).kpi || []).find((k) => /Distan/.test(k.et)) || {}).val;
  const n1 = cereri().length;
  coada([text('Pe ' + etZi(zB) + ', B 154 UIP a mers ' + kmB + ' km, mai mult decât pe ' + etZi(zA) + '.\n\n**Concluzie:** ziua de ' + etZi(zB) + ' a fost cu drum mai lung; singura problemă e viteza.')]);
  const qb = await json('POST', '/api/insight/intreaba', ck, { message: 'vreau sa mi generezi raportul foaie de parcurs de pe ziua de ' + etZi(zB) + ' si pe cel de pe ' + etZi(zA) + ' si sa mi faci o comparatie.', conversatieId: conv });
  const cb = cereri().slice(n1);
  T('b) două zile + „compară" → DOUĂ cartonașe, pe B 154 UIP (mașina discuției), în ordinea scrisă', (qb.j.rapoarte || []).map((c) => c.perioada).join(' | ') === etZi(zB) + ' | ' + etZi(zA) && (qb.j.rapoarte || []).every((c) => /B 154 UIP/.test(c.vehicul) && c.id), JSON.stringify((qb.j.rapoarte || []).map((c) => [c.vehicul, c.perioada])));
  T('…și comparația lui RA Insight: un singur drum la model, cu rapoartele făcute deja în instrucțiuni (nu le mai rulează)', qb.j.source === 'ai' && cb.length === 1 && /RAPOARTE FĂCUTE ACUM/.test(JSON.stringify(cb[0].system)) && /pe_masina/.test(JSON.stringify(cb[0].system)), cb.length);
  T('…cifra din comparație se regăsește în rapoarte („✓ Cifrele le-am luat din rapoarte"); insigna mov, care se numără', qb.j.verificat === true && (qb.j.insigna || {}).fel === 'ai' && (qb.j.insigna || {}).eticheta === 'Analiză' && (qb.j.insigna || {}).detaliu === '1 întrebare', JSON.stringify({ v: qb.j.verificat, i: qb.j.insigna }));
  T('…problema de viteză vine și aici', (qb.j.probleme || []).some((p) => p.fel === 'viteza'));
  T('…modelul vede în discuție cifrele raportului făcut de aplicație și instrucțiunea că sunt reale (nu mai „corectează")', /Curse: 1 · Distanță totală/.test(JSON.stringify(cb[0].messages)) && /sunt rapoarte făcute de APLICAȚIE în discuție/.test(JSON.stringify(cb[0].system)));

  // c) consumul cu senzorul blocat: problema roșie, sursa „NU e măsurat" ajunge la model
  const n2 = cereri().length;
  coada([unealta('run_report', { type: 'consumption', vehicle: 'B154UIP', period: 'last_7_days' }), text('Consumul lui B 154 UIP nu se poate măsura acum: nivelul a stat pe 25 L.')]);
  const qc = await json('POST', '/api/insight/intreaba', ck, { message: 'b 154 uip, ce consum a avut in ultimele 7 zile?', conversatieId: conv });
  const cc = cereri().slice(n2);
  const trC = JSON.stringify(cc[1] ? cc[1].messages.slice(-1) : '');
  T('c) consumul: nivelul care nu se schimbă e „Am găsit o problemă", galbenă, spusă ca fapt, fără butoane tehnice', (qc.j.probleme || []).some((p) => p.fel === 'senzor' && p.grav === 'galben' && /^Consumul la B 154 UIP.* nu se poate măsura acum$/.test(p.titlu) && !p.butoane.some((b) => b.fila === 'calibration') && !/senzor|blocat|necalibrat/i.test(p.titlu + p.dovada)), JSON.stringify(qc.j.probleme));
  T('…modelul primește „NU e măsurat: nivelul din rezervor a stat pe 25 L" și sumele pe mașină', /NU e măsurat: nivelul din rezervor a stat pe 25 L toată perioada/.test(trC) && /cum_s_a_socotit/.test(trC), trC.slice(0, 200));

  // c2) litere rusești în răspuns (Alin, 19.10: „октомбrie 2026"): o rescriere; dacă și ea le are, se curăță
  const n2b = cereri().length;
  coada([text('**Consumul pe octombrie** (октомбrie 2026): nimic neobișnuit.'), text('**Consumul pe octombrie 2026:** nimic neobișnuit.')]);
  const qcr = await json('POST', '/api/insight/intreaba', ck, { message: 'de ce a stat b 154 uip mai mult luna asta?', conversatieId: conv });
  T('c2) un răspuns cu litere rusești se rescrie O DATĂ, iar omul primește varianta curată', cereri().length - n2b === 2 && qcr.j.reply === '**Consumul pe octombrie 2026:** nimic neobișnuit.', JSON.stringify({ n: cereri().length - n2b, r: qcr.j.reply }));
  const n2c = cereri().length;
  coada([text('Pe октомбrie: totul în regulă.'), text('Tot pe октомбrie: totul în regulă.')]);
  const qcs = await json('POST', '/api/insight/intreaba', ck, { message: 'de ce a stat b 268 roy mai mult luna asta?', conversatieId: conv });
  T('…iar dacă și rescrierea le are, literele se trec în românește înainte să ajungă la om', cereri().length - n2c === 2 && !/[\u0400-\u04FF]/.test(qcs.j.reply || '') && /octombrie/.test(qcs.j.reply || ''), JSON.stringify({ n: cereri().length - n2c, r: qcs.j.reply }));

  // d) anii mașinilor: fișa mașinii, ce lipsește are butonul spre fișă
  coada([unealta('list_vehicles', {}), text('Anul de fabricație: B 154 UIP — 2021; la celelalte două nu e completat în fișă.')]);
  const n3 = cereri().length;
  const qd = await json('POST', '/api/insight/intreaba', ck, { message: 'vreau sa stiu anii de inmatriculare a masinilor', conversatieId: conv });
  const trD = JSON.stringify((cereri().slice(n3)[1] || {}).messages || '');
  T('d) list_vehicles poartă fișa mașinii (anul, marca) și ce nu e completat', /an_fabricatie/.test(trD) && /2021/.test(trD) && /necompletat/.test(trD), trD.slice(0, 200));
  T('…„Nu e completat în fișa mașinii: anul de fabricație (2 mașini)", cu butoanele spre fișă', (qd.j.probleme || []).some((p) => p.fel === 'fisa' && /\(2 mașini\)/.test(p.titlu) && p.butoane.length === 2), JSON.stringify(qd.j.probleme));

  // e) un salt de GPS (Caddy): eroare, galbenă, „Nu-l lua în calcul"
  const qe = await json('POST', '/api/insight/intreaba', ck, { message: 'fa-mi foaia de parcurs pentru b 268 roy pe ' + etZi(zB), conversatieId: conv });
  T('e) un singur punct de 180 km/h între două la 40 km/h = eroare de GPS (galbenă), nu viteză', (qe.j.probleme || []).some((p) => p.fel === 'gps' && p.grav === 'galben' && /eroare de GPS/.test(p.titlu)), JSON.stringify(qe.j.probleme));

  // f) pe Start (fără AI): cererea cu „compară" face rapoartele și spune de la ce pachet merge comparația; nimic la model
  const n4 = cereri().length;
  const qf = await json('POST', '/api/insight/intreaba', ckS, { message: 'fa-mi foaia de parcurs pe ' + etZi(zB) + ' si pe ' + etZi(zA) + ' si compara-le', nou: true });
  T('f) pe Start: cele două cartonașe + mesajul pachetului; niciun drum la model; insigna verde INSTANT · 1 răspuns (se numără din 50)', (qf.j.rapoarte || []).length === 2 && !!qf.j.pachetMesaj && cereri().length === n4 && (qf.j.insigna || {}).eticheta === 'Instant' && (qf.j.insigna || {}).detaliu === '1 răspuns', JSON.stringify({ r: (qf.j.rapoarte || []).length, m: qf.j.pachetMesaj, i: qf.j.insigna }));

  // g) totul rămâne în conversație (se vede la redeschidere)
  const cv = await json('GET', '/api/insight/conversatii/' + conv, ck);
  const asist = (cv.j.mesaje || []).filter((m) => m.rol === 'assistant');
  T('g) cartonașele, problemele și insignele rămân în conversație', asist.some((m) => m.extra && (m.extra.rapoarte || []).length === 2) && asist.some((m) => m.extra && (m.extra.probleme || []).length) && asist.every((m) => m.extra && m.extra.insigna), asist.length);

  // h) „RA Insight · control" (fondatorii): răspunsurile instant și 👎 pe firmă — numere, fără texte
  const mid = (asist.filter((m) => m.extra && m.extra.source === 'ai')[0] || {}).id;
  const fb = mid ? await json('POST', '/api/insight/mesaje/' + mid + '/feedback', ck, { valoare: -1 }) : { status: 0 };
  const au = await json('GET', '/api/admin/ai-usage', S);
  const rf = (au.j.rows || []).find((r) => r.id === co.id) || {};
  // pe Pro: instant = a) și e) (cartonașele pe reguli); b), c), c2) ×2, d) = cinci întrebări AI (rescrierea din c2 nu e a doua
  // întrebare: un singur rând de consum). Pe platformă se adaugă f) (Start).
  T('h) tabloul nostru: răspunsurile instant ale lunii pe firmă și pe platformă, câte întrebări AI', rf.instant === 2 && rf.used === 5 && au.j.pachete && au.j.pachete.instant === 3, JSON.stringify({ instant: rf.instant, used: rf.used, p: au.j.pachete && { i: au.j.pachete.instant, a: au.j.pachete.intrebariAi } }));
  T('…și 👎 din ultimele 7 zile, pe firmă și pe platformă (doar numărul)', fb.status === 200 && rf.jos7 === 1 && au.j.pachete.jos7 >= 1, JSON.stringify({ fb: fb.status, f: rf.jos7, p: au.j.pachete && au.j.pachete.jos7 }));
  T('…fără niciun text din conversații', ['comparatie', 'Consumul lui', 'anii de inmatriculare'].every((w) => au.text.indexOf(w) < 0));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); gata(1); });
