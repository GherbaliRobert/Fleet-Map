// verify_ai_raport.js — „AI Raport" (Rapoarte → fila „AI Raport"): întrebări despre rapoarte, pe REGULI, gratuit.
//
//   node verify_ai_raport.js
//
// De ce (Alin, 02.10): „în rapoarte vreau să fie un agent unde întrebi ceva despre rapoarte… cu sugestii" + „AI Raport
// va lua din rapoarte date, deci nu ne costă bani/tokeni; RA Insight va fi singurul care va costa". Proba păzește:
//   1. înțelegerea (ai_raport.js): subiectul, mașina (număr, nume, grupă), perioada pe ora României, ce se ține minte
//      la „și luna trecută?", îndoiala („Loganul" cu două Logan), „de ce" → RA Insight;
//   2. răspunsurile pe forma ADEVĂRATĂ a rapoartelor (aceleași chei ca reports.js), cu numere scrise românește;
//   3. sursa: aceeași funcție de opțiuni ca ecranul Rapoarte, fără loc RA Insight, fără model, fără fond;
//   4. pe server pornit: cifrele = cifrele raportului; modelul nu e chemat NICIODATĂ; drepturile (rol tăiat, fără
//      „vede rapoarte"); nimeni nu vede mașinile altei firme (nici prin `context`, nici prin `imei`); demo-ul lipsește;
//      plafonul pe minut; în jurnal nu ajunge textul întrebării.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const A = require('./ai_raport');
const I = require('./insight');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Înțelegerea ─────────────────────────────────────────────────────────────────────────────────
console.log('1. AI Raport înțelege întrebările scrise simplu');
const DEV = [
  { imei: '350000000051001', name: 'Dacia Logan 3', plate: 'B 154 UIP', group_name: 'Distribuție' },
  { imei: '350000000051002', name: 'Dacia Logan 2', plate: 'B 155 UIP', group_name: 'Distribuție' },
  { imei: '350000000051003', name: 'VW Passat B7', plate: 'B 77 RAT', group_name: 'Cluj' },
  { imei: '350000000051004', name: 'VW CADDY', plate: 'IF 01 ABC' },
];
const F = I.fisaFlotei(DEV, {});
const ACUM = Date.parse('2026-10-02T10:00:00Z');   // vineri, 13:00 la București
const U = (t, ctx) => A.intelege(t, ctx || {}, F, ACUM);
for (const q of A.INTREBARI_GATA) {
  const u = U(q.text);
  T('întrebarea gata făcută „' + q.text + '" e înțeleasă (' + q.k + ')', u.ok && u.subiect === q.k, JSON.stringify(u).slice(0, 120));
}
const u1 = U('Câți km a făcut B 154 UIP săptămâna trecută?');
T('km + numărul + „săptămâna trecută" → Index km, B 154 UIP, 21–27 septembrie', u1.ok && u1.raport === 'utilization' && u1.masini.join() === DEV[0].imei && u1.perioada.eticheta === '21–27 septembrie', JSON.stringify(u1).slice(0, 200));
const ctx1 = { subiect: u1.subiect, masini: u1.masini, perioada: { from: u1.perioada.from, to: u1.perioada.to } };
const u2 = U('și luna trecută?', ctx1);
T('„și luna trecută?" ține minte subiectul și mașina, schimbă perioada', u2.ok && u2.subiect === 'km' && u2.masini.join() === DEV[0].imei && u2.perioada.eticheta === 'septembrie 2026' && u2.mem.subiect && u2.mem.masini && !u2.mem.perioada, JSON.stringify(u2.mem) + ' ' + u2.perioada.eticheta);
const u3 = U('dar B 77 RAT?', ctx1);
T('„dar B 77 RAT?" schimbă mașina, păstrează subiectul și perioada', u3.ok && u3.subiect === 'km' && u3.masini.join() === DEV[2].imei && u3.perioada.eticheta === '21–27 septembrie' && u3.mem.perioada, JSON.stringify(u3).slice(0, 160));
const u4 = U('consumul Loganului luna trecută');
T('„Loganul" cu două Logan în flotă → întreabă care (nu alege singur)', !u4.ok && u4.motiv === 'ambiguu' && u4.variante.map((v) => v.nr).sort().join() === 'B 154 UIP,B 155 UIP', JSON.stringify(u4).slice(0, 160));
const u5 = U('și celălalt Logan?', { subiect: 'consum', masini: [DEV[0].imei] });
T('„celălalt Logan" → celălalt, fără să mai întrebe', u5.ok && u5.masini.join() === DEV[1].imei, JSON.stringify(u5).slice(0, 160));
T('„de ce consumă atât?" → la RA Insight (cauzele nu se ghicesc pe reguli)', U('de ce consumă B 77 RAT atât de mult?').motiv === 'pentru_insight');
T('„compară…" și „ce să fac" → tot la RA Insight', U('compară consumul lui B 154 UIP cu B 155 UIP').motiv === 'pentru_insight' && U('ce să fac cu ralantiul?').motiv === 'pentru_insight');
T('o propoziție fără subiect nu moștenește subiectul de dinainte („vreme frumoasă azi")', U('vreme frumoasa azi', ctx1).motiv === 'fara_subiect');
const u6 = U('Ce expiră în următoarele 30 de zile', ctx1);
T('„Ce expiră în următoarele 30 de zile": privește ÎNAINTE, toată flota (nu mașina discutată)', u6.ok && u6.subiect === 'scadente' && u6.masini === null && u6.perioada.inainte && Date.parse(u6.perioada.to) - ACUM === 30 * 86400000, JSON.stringify(u6).slice(0, 160));
const u7 = U('km pe grupa Distribuție în septembrie');
T('grupa → mașinile ei; „în septembrie" → luna întreagă, pe ora României', u7.ok && u7.grupa === 'Distribuție' && u7.masini.length === 2 && u7.perioada.from === '2026-08-31T21:00:00.000Z' && u7.perioada.to === '2026-09-30T21:00:00.000Z', JSON.stringify(u7.perioada));
T('„toată flota" uită mașina discutată', U('si ralanti pe toata flota', ctx1).masini === null);
T('„mai mult" nu e luna mai', U('cine a facut mai mult km').perioada.implicita === true);
T('„ultimele 200 de zile" se taie la ' + A.MAX_ZILE + ' (un raport prea lung încetinește serverul)', (Date.parse(U('km ultimele 200 de zile').perioada.to) - Date.parse(U('km ultimele 200 de zile').perioada.from)) / 86400000 === A.MAX_ZILE);
T('o zi anume („pe 15.09") → ziua aia, de la miezul nopții la București', U('opriri pe 15.09').perioada.from === '2026-09-14T21:00:00.000Z');
const int1 = A.inteles(u2, F).map((x) => (x.mem ? 'mem:' : '') + x.tip + ':' + x.text);
T('„Am înțeles" arată ce s-a ținut minte', int1.join(' | ') === 'mem:subiect:Km parcurși | mem:masina:B 154 UIP · Dacia Logan 3 | perioada:septembrie 2026', int1.join(' | '));

// ─── 2. Răspunsurile, pe forma adevărată a rapoartelor ──────────────────────────────────────────────
console.log('\n2. Răspunsurile, din rapoarte (aceleași chei ca reports.js), cu numere românești');
const ET = (i) => DEV[i].name + ' (' + DEV[i].plate + ')';   // cum scriu rapoartele mașina
const X = { fisa: F, acum: ACUM, pret: 7.5 };
let r = A.raspunde(u1, { valori: [{ vehicul: ET(0), imei: DEV[0].imei, km: 538.4, ore: 0, unitate: 'km', sursa: 'CAN' }] }, Object.assign({}, X, { anterior: { valori: [{ imei: DEV[0].imei, km: 472, unitate: 'km' }] } }));
T('km pe o mașină: „a parcurs 538 de km", cu sursa (calculatorul de bord)', /B 154 UIP · Dacia Logan 3\*\* a parcurs \*\*538 de km\*\* — 21–27 septembrie\. \(din calculatorul de bord\)/.test(r.text), r.text);
T('…și față de perioada dinainte, la fel de lungă (+66 km, +14%)', r.sugestii.some((s) => s.fel === 'info' && /Cu 66 de km mai mult .* \(\+14%\)/.test(s.text)), JSON.stringify(r.sugestii));
r = A.raspunde(U('km pe flota saptamana trecuta'), { valori: [
  { vehicul: ET(0), imei: DEV[0].imei, km: 1234.5, unitate: 'km', sursa: 'GPS (estimat)' },
  { vehicul: ET(1), imei: DEV[1].imei, km: 0, unitate: 'km', sursa: 'GPS (estimat)' },
  { vehicul: ET(2), imei: DEV[2].imei, km: 310, unitate: 'km', sursa: 'CAN' }] }, X);
T('km pe flotă: totalul cu separatorul românesc de mii, tabelul ordonat, cine n-a mers', /Flota a parcurs \*\*1\.545 de km\*\*/.test(r.text) && r.tabel.randuri[0][0] === 'B 154 UIP · Dacia Logan 3' && r.tabel.randuri[0][1] === '1.235' && r.sugestii.some((s) => s.fel === 'atentie' && /O mașină n-a mers deloc: B 155 UIP · Dacia Logan 2/.test(s.text)), r.text + ' ' + JSON.stringify(r.tabel));
r = A.raspunde(U('consumul lui B 77 RAT luna trecuta'), { valori: [{ vehicul: ET(2), imei: DEV[2].imei, km: 1200, litri: 81.6, l100: 6.8, sursa: 'CAN', areDate: true }] }, Object.assign({}, X, { anterior: { valori: [{ imei: DEV[2].imei, l100: 7.2 }] },
  alimentari: { rows: [[ET(2), '15.09.2026, 22:10:00', 'Scădere/furt', 'Motorină', -23.4, '60.0 → 36.6', '']] } }));
T('consum pe o mașină: „82 de litri", „6,8 L la 100 km", mai bine decât înainte', /a consumat \*\*82 de litri\*\* — septembrie 2026: \*\*6,8 L la 100 km\*\*, pe 1\.200 de km/.test(r.text) && r.sugestii.some((s) => s.fel === 'bun' && /0,4 L la 100 km mai mic/.test(s.text)), r.text + ' ' + JSON.stringify(r.sugestii));
T('…iar scăderea de combustibil din aceeași perioadă e spusă, cu ziua și litrii', r.sugestii.some((s) => s.fel === 'atentie' && /Pe 15\.09\.2026, rezervorul a scăzut cu 23 de litri/.test(s.text)), JSON.stringify(r.sugestii));
r = A.raspunde(U('consumul lui B 155 UIP luna trecuta'), { valori: [{ vehicul: ET(1), imei: DEV[1].imei, km: 900, litri: 0, l100: null, sursa: null, areDate: false }] }, X);
T('consum fără date: spune de ce (fără senzor / calculatorul nu trimite), nu „0 litri"', /nu am date de consum/.test(r.text) && !/0 litri/.test(r.text), r.text);
r = A.raspunde(U('costuri luna asta'), { valori: [
  { vehicul: ET(0), imei: DEV[0].imei, km: 800, litri: 56, pret: 7.5, cost: 420, estimat: false },
  { vehicul: ET(2), imei: DEV[2].imei, km: 1500, litri: 120, pret: 7.5, cost: 900, estimat: true }] }, X);
T('costuri: „~1.320 de lei", cost pe km, litrii estimați spuși pe față', /a costat \*\*~1\.320 de lei\*\*/.test(r.text) && /estimați/.test(r.text) && r.tiles.some((t) => t.et === 'Cost pe km' && t.val === '0,57 lei'), r.text + ' ' + JSON.stringify(r.tiles));
r = A.raspunde(U('ralanti azi'), { summary: { 'Evenimente ralanti': 0, 'Timp ralanti total': '0s', 'Combustibil irosit (L)': 0 } }, X);
T('ralanti zero: o propoziție, nu „0s"', /nu a stat în ralanti/.test(r.text) && !/0s/.test(r.text), r.text);
r = A.raspunde(U('ralanti saptamana asta'), { summary: { 'Evenimente ralanti': 9, 'Timp ralanti total': '3h 20m', 'Combustibil irosit (L)': 4.2 },
  perVehicle: [{ vehicul: ET(0), summary: [['Evenimente ralanti', 0], ['Timp ralanti', '0s'], ['Combustibil irosit (L)', 0]] }, { vehicul: ET(2), summary: [['Evenimente ralanti', 9], ['Timp ralanti', '3h 20m'], ['Combustibil irosit (L)', 4.2]] }] }, X);
T('ralanti: timpul, litrii arși și cât înseamnă în lei; tabelul fără mașinile cu zero', /3h 20m/.test(r.text) && /4,2 litri/.test(r.text) && r.sugestii.some((s) => /32 de lei pierduți \(la 7,5 lei litrul\)/.test(s.text)) && r.tabel.randuri.length === 1, r.text + ' ' + JSON.stringify(r.sugestii));
r = A.raspunde(U('depasiri de viteza in ultimele 7 zile'), { summary: { 'Depășiri': 7, 'Viteză maximă (km/h)': 132, 'Limită folosită': 90 },
  perVehicle: [{ vehicul: ET(0), summary: [['Depășiri', 6], ['Viteză max', 132]] }, { vehicul: ET(2), summary: [['Depășiri', 1], ['Viteză max', 95]] }] }, X);
T('viteză: „7 depășiri", cea mai mare 132 km/h, limita folosită; mașina cu de două ori mai multe e numită', /\*\*7 depășiri\*\* de viteză/.test(r.text) && /132 km\/h/.test(r.text) && /limita folosită: 90/.test(r.text) && r.sugestii.some((s) => /B 154 UIP · Dacia Logan 3 are de două ori mai multe depășiri/.test(s.text)), r.text);
r = A.raspunde(U('depasiri de viteza azi'), { summary: { 'Depășiri': 0, 'Viteză maximă (km/h)': 0, 'Limită folosită': 90 } }, X);
T('viteză zero: „nicio depășire"', /nicio depășire de viteză/.test(r.text), r.text);
r = A.raspunde(U('opriri ieri'), { summary: { 'Opriri': 0, 'Timp staționat total': '0s' } }, X);
T('staționări zero: „Nicio staționare", nu un șir de zerouri', /^Nicio staționare/.test(r.text), r.text);
r = A.raspunde(U('opriri ieri'), { summary: { 'Opriri': 12, 'Timp staționat total': '5h 20m' } }, X);
T('staționări: etichetele raportului, cu literă mică în propoziție', /opriri \*\*12\*\*, timp staționat total \*\*5h 20m\*\*/.test(r.text), r.text);
r = A.raspunde(U('alimentari luna asta'), { summary: { 'Vehicule alimentate': 0, 'Alimentări': 0, 'Litri alimentați': 0, 'Scăderi suspecte': 0, 'Litri scăzuți': 0 } }, X);
T('alimentări zero: spune și de ce s-ar putea să nu le vadă (fără nivelul rezervorului)', /^Nicio alimentare/.test(r.text) && r.sugestii.some((s) => s.fel === 'info' && /nivelul rezervorului/.test(s.text)), r.text);
r = A.raspunde(U('alimentari luna asta'), { summary: { 'Vehicule alimentate': 2, 'Alimentări': 3, 'Litri alimentați': 150, 'Scăderi suspecte': 1, 'Litri scăzuți': 23 } }, X);
T('alimentări cu o scădere suspectă: semnalată', r.sugestii.some((s) => s.fel === 'atentie' && /1 scădere suspectă \(23 de litri\)/.test(s.text)), JSON.stringify(r.sugestii));
const DUE = { rows: [
  [ET(0), 'Document', 'ITP', '05.10.2026 (3 zile)', '—', 'Critic'],
  [ET(2), 'Document', 'RCA', '20.09.2026 (12 zile în urmă)', '—', 'Depășit'],
  [ET(1), 'Service', 'Schimb ulei', '25.10.2026 (23 zile)', '—', 'Curând'],
  [ET(1), 'Service (km)', 'Revizie', 'la 150.000 km (fără odometru)', '—', '—'],
  [ET(3), 'Service (km)', 'Distribuție', 'la 200.000 km (~9.000 km)', '—', 'OK'],
  [ET(0), 'Service', 'Ulei', '01.09.2026', '01.09.2026 · 120.000 km', 'Efectuat']] };
r = A.raspunde(u6, DUE, X);
T('ce expiră: 2 de urmărit (Critic + Curând), 1 deja expirat; „OK", „Efectuat" și „—" nu se numără', /\*\*2 scadențe\*\*, plus \*\*1 act sau revizie deja expirat\*\*/.test(r.text) && r.tabel.randuri.length === 3 && r.tabel.randuri[0][3] === 'Depășit', r.text + ' ' + JSON.stringify(r.tabel.randuri));
T('…cu cel care expiră în 7 zile numit, și revizia fără kilometraj explicată', r.sugestii.some((s) => /Unul expiră în cel mult 7 zile: B 154 UIP · Dacia Logan 3 — ITP/.test(s.text)) && r.sugestii.some((s) => s.fel === 'info' && /1 revizie pe km nu se poate socoti/.test(s.text)), JSON.stringify(r.sugestii));
r = A.raspunde(u6, { rows: [DUE.rows[4], DUE.rows[5]] }, X);
T('nimic de urmărit: „Nimic nu expiră", fără tabel gol', /^Nimic nu expiră/.test(r.text) && !r.tabel, r.text);
r = A.raspunde(U('clasamentul soferilor in ultimele 30 de zile'), { rows: [[1, 'Ion Popescu', 92, 'A', 0.8, 2100], [2, 'Andrei Stan', 55, 'D', 6.1, 900]], summary: { 'Scor mediu flotă (0-100)': 80 } }, X);
T('clasamentul: cel mai bun șofer, iar cel cu scor sub 60 e numit cu un sfat', /Cel mai bun: \*\*Ion Popescu\*\* \(scor 92, nota A\)/.test(r.text) && r.sugestii.some((s) => /Andrei Stan are cel mai mic scor \(55\)/.test(s.text)), r.text);
r = A.raspunde(U('clasamentul soferilor azi'), { rows: [], summary: { 'Scor mediu flotă (0-100)': 0 } }, X);
T('clasament fără date: spus, fără „scorul mediu 0"', /Nu am destule date/.test(r.text) && !r.tiles.length, r.text);
r = A.raspunde(U('scorul lui B 154 UIP saptamana asta'), { summary: { 'Scor flotă (0-100)': 0, 'Vehicule evaluate': 0, 'Accelerări bruște': 0, 'Frânări bruște': 0 } }, X);
T('stil de condus fără drum: „nu am destule date", nu „scorul 0 din 100"', /Nu am destule date de condus/.test(r.text) && !/scorul \*\*0\*\*/.test(r.text), r.text);
r = A.raspunde(U('scorul lui B 154 UIP saptamana asta'), { summary: { 'Scor flotă (0-100)': 81, 'Vehicule evaluate': 1, 'Accelerări bruște': 2, 'Frânări bruște': 3 },
  perVehicle: [{ vehicul: ET(0), summary: [['Scor', 81], ['Notă', 'B'], ['Accel. bruște', 2], ['Frânări bruște', 3]] }] }, X);
T('stil de condus pe o mașină: scorul, nota, frânările și accelerările bruște', /scor \*\*81\*\* \(nota B\), cu 3 frânări bruște și 2 accelerări bruște/.test(r.text), r.text);
r = A.raspunde(U('alerte saptamana asta'), { rows: [[ET(0), 'Depășire viteză', 'x', '', ''], [ET(0), 'Depășire viteză', 'x', '', ''], [ET(0), 'Ralanti', 'x', '', ''], [ET(2), 'Ralanti', 'x', '', '']], summary: {} }, X);
T('alerte: câte, pe feluri, iar mașina cu cele mai multe e numită', /\*\*4 alerte\*\*/.test(r.text) && /Depășire viteză \(2\), Ralanti \(2\)/.test(r.text) && r.sugestii.some((s) => /B 154 UIP · Dacia Logan 3 are cele mai multe alerte \(3\)/.test(s.text)), r.text + ' ' + JSON.stringify(r.sugestii));
r = A.raspunde(U('vizite in zone saptamana asta'), { rows: [[ET(0), 'Depozit', 'a', 'b', '1h'], [ET(2), 'Depozit', 'a', 'b', '2h'], [ET(2), 'Client X', 'a', 'b', '1h']], summary: {} }, X);
T('zone: vizitele și zonele, pe zone', /\*\*3 vizite\*\* în zone/.test(r.text) && /în 2 zone/.test(r.text) && r.tabel.randuri[0].join() === 'Depozit,2', r.text);
r = A.raspunde(U('ultima locatie a lui B 154 UIP'), { rows: [[ET(0), 'Str. Lungă 5, Brașov', '02.10.2026, 08:10:00', '4h 50m', 'oprit', '9 (bun)']] }, X);
T('ultima locație pe o mașină: unde stă și de cât timp', /stă la \*\*Str\. Lungă 5, Brașov\*\* de \*\*4h 50m\*\*/.test(r.text), r.text);
r = A.raspunde(U('cate masini au fost inactive saptamana asta'), { rows: [
  [ET(0), '5 zile: …', '0 zile', '10h', 'x', 'Bun (9 sat.)'], [ET(1), '0 zile', '5 zile: …', '5 zile', 'x', 'Inexistent'], [ET(2), '3 zile: …', '2 zile: …', '1 zi', 'x', 'Slab']] }, X);
T('disponibilitate: câte au mers zilnic, câte au avut zile fără mers, cine nu transmite', /\*\*1 din 3\*\* au mers în fiecare zi/.test(r.text) && /\*\*2 mașini au avut\*\* zile fără mers/.test(r.text) && r.sugestii.some((s) => /O mașină nu mai transmite: B 155 UIP · Dacia Logan 2/.test(s.text)), r.text);
r = A.raspunde(U('emisii luna trecuta'), { summary: { 'CO₂ total (t)': '0.45', 'Consum total (L)': 170, 'Km total': 2300, 'CO₂ mediu (g/km)': 196 } }, X);
T('orice alt raport: sumarul lui, cu virgulă la zecimale („0,45") și „CO₂" scris cum trebuie', /CO₂ total \(t\) \*\*0,45\*\*/.test(r.text) && /km total \*\*2\.300\*\*/.test(r.text), r.text);
T('„de" pus după regula limbii: 1 litru, 12 litri, 20 de litri, 6,8 litri, 101 litri', A.cant(1, 'litru', 'litri') === '1 litru' && A.cant(12, 'litru', 'litri') === '12 litri' && A.cant(20, 'litru', 'litri') === '20 de litri' && A.cant(6.8, 'litru', 'litri', 1) === '6,8 litri' && A.cant(101, 'litru', 'litri') === '101 litri');
const ni = A.neinteles('ambiguu', u4.variante, F);
T('îndoiala: butoane cu numărul (de trimis înapoi) și eticheta mașinii', ni.alege.map((a) => a.trimite).sort().join() === 'B 154 UIP,B 155 UIP' && ni.alege.every((a) => /Dacia Logan/.test(a.text)));
T('„de ce" spune pe față că RA Insight se scade din fond', A.neinteles('pentru_insight').spreInsight === true && /fondul lunii/.test(A.neinteles('pentru_insight').text));

// ─── 3. Sursa ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Sursa: gratuit, fără model, aceleași opțiuni ca ecranul Rapoarte');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const ruta = (SRV.split("app.post('/api/reports/ai-raport'")[1] || '').split('\n});')[0];
const antet = (SRV.match(/app\.post\('\/api\/reports\/ai-raport',[^\n]*/) || [''])[0];
T('ruta cere doar „vede rapoarte" — nu loc RA Insight, nu modulul RA Insight', /requirePerm\('viewReports'\)/.test(antet) && !/requireAiSeat|requireFeature\('ai_assistant'\)/.test(antet), antet);
T('ruta nu cheamă modelul și nu numără nimic din fond', ruta.length > 500 && !/runAgent|anthropic|recordAiUsage|_regulileFonduluiAi|ai\.chat/.test(ruta));
// Cine cheamă opțiunile, pe nume: ecranul Rapoarte, AI Raport și ramurile RA Insight Combustibil și Ore de condus (07.10) —
// toate aceeași funcție; nicio a doua listă de opțiuni.
T('opțiunile raportului vin din ACEEAȘI funcție ca ecranul (ecranul, AI Raport, ramurile Combustibil și Ore de condus)', (SRV.match(/_optiuniRaport\(/g) || []).length === 5 &&
  /const opts = _optiuniRaport\(req\.query, _cs\);/.test(SRV) && /const opts = _optiuniRaport\(\{\}, cs\);/.test(SRV) && (SRV.match(/_optiuniRaport\(\{\}, f\.cs\)/g) || []).length === 2 &&
  /async function _ramCombustibil\([\s\S]*?_optiuniRaport\(\{\}, f\.cs\)/.test(SRV) && /async function _ramOreCondus\([\s\S]*?_optiuniRaport\(\{\}, f\.cs\)/.test(SRV), (SRV.match(/_optiuniRaport\(/g) || []).length);
T('mașinile: aceeași regulă ca rapoartele (fără arhivate, fără demo); `imei` din corp e aruncat', /delete b\.imei/.test(ruta) && /resolveReportImeis\(req\)/.test(ruta));
T('rolul tăiat se respectă și aici (poateRaport)', /poateRaport\(req, u\.raport\)/.test(ruta));
T('în jurnal: doar subiectul și câte mașini — nu textul întrebării', /auditReq\(req, 'ai_raport', 'report', null, \{ subiect: u\.subiect, masini: imeis\.length \}\)/.test(ruta) && !/auditReq\([^)]*text/.test(ruta));
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
T('pagina: o singură cerere către AI Raport; fila nu mai cheamă RA Insight (plătit)', (PAG.match(/fetch\('\/api\/reports\/ai-raport'/g) || []).length === 1 && PAG.indexOf("'/api/insight/run'") < 0 && PAG.indexOf("'/api/insight/presets'") < 0);
T('pagina: întrebările gata făcute vin de la server, nu scrise în pagină', /fetch\('\/api\/reports\/ai-raport\/intrebari'/.test(PAG) && PAG.indexOf('Km săptămâna asta') < 0);
T('pagina: fila se numește „AI Raport" și poartă eticheta „GRATUIT"', /id="rep-tab-btn-insight"[^>]*>[\s\S]{0,120}AI Raport[\s\S]{0,80}rin-gratis">GRATUIT/.test(PAG));
T('pagina: textele venite de la server trec prin textContent sau prin rinMd (care curăță)', /bub\.innerHTML = rinMd\(String\(x\.text/.test(PAG) && /it\.appendChild\(el\('span', null, s\.text\)\)/.test(PAG));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3293, TCP = 5293;
const DIR = path.join(os.tmpdir(), 'rax_airaport_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
const B = 'http://127.0.0.1:' + PORT;
// Orice cerere către model se scrie aici; proba cere ca fișierul să rămână GOL.
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, ((opts && opts.body) || '{}') + '\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'MODELUL_A_FOST_CHEMAT' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_airaport', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG,
});
delete env.DATABASE_URL;
delete env.ANTHROPIC_API_KEY;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
function curata() {
  for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} }
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, p) {
  const res = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!res.ok) return null;
  return (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, ck, body) {
  const res = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: res.status, j: j || {}, text };
}
const cereriModel = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const res = await fetch(B + '/api'); if (res.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit (modelul ar fi simulat — dar AI Raport nu trebuie să-l cheme deloc)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const PAROLA = 'Str4da-Verde-2026';
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Raport SRL' })).j;
  const co2 = (await json('POST', '/api/companies', S, { name: 'Alta Firma Raport SRL' })).j;
  // Firma 1 ARE RA Insight (ca să vedem că fondul nu se mișcă); firma 2 NU îl are deloc (AI Raport tot merge).
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  async function om(username, role, companyId, loc) {
    const res = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (res.j && res.j.link) await puneParola(res.j, PAROLA, B);
    if (loc && res.j && res.j.id) await json('PUT', '/api/users/' + res.j.id + '/ai-seat', S, { on: true });
    return res.j;
  }
  await om('sef@raport.ro', 'admin', co.id, true);
  await om('manager@raport.ro', 'manager', co.id, false);
  await om('dispecer@raport.ro', 'dispatcher', co.id, false);
  await om('sef@alta-raport.ro', 'admin', co2.id, false);
  await om('rafala@raport.ro', 'viewer', co.id, false);
  const ckSef = await login('sef@raport.ro', PAROLA), ckMan = await login('manager@raport.ro', PAROLA), ckDisp = await login('dispecer@raport.ro', PAROLA);
  const ckAlt = await login('sef@alta-raport.ro', PAROLA), ckRaf = await login('rafala@raport.ro', PAROLA);
  T('pregătire: o firmă cu RA Insight (șef cu loc), una fără; manager, dispecer, viewer — toți intră', !!(co.id && co2.id && ckSef && ckMan && ckDisp && ckAlt && ckRaf));
  await json('POST', '/api/devices/import', S, { rows: DEV.map((d) => ({ imei: d.imei, nume: d.name, nr_inmatriculare: d.plate })).concat([{ imei: '350000000051009', nume: 'Ford Transit', nr_inmatriculare: 'CJ 99 ALT' }]) });
  for (const d of DEV) await json('PUT', '/api/devices/' + d.imei + '/company', S, { company_id: co.id });
  await json('PUT', '/api/devices/350000000051009/company', S, { company_id: co2.id });
  // Drumuri adevărate în istoric: B 154 UIP joi săptămâna trecută (24.09) și miercuri (30.09); B 77 RAT pe 30.09.
  const drum = async (imei, startIso, n, pasKm) => {
    const t0 = Date.parse(startIso);
    for (let i = 0; i < n; i++) await json('POST', '/api/test/simulate', S, { imei, ts: new Date(t0 + i * 60000).toISOString(), lat: 44.40 + i * pasKm / 111, lng: 26.10, speed: 60, io: { ignition: 1 } });
  };
  // Zilele se socotesc față de AZI (serverul merge pe ceasul adevărat; scrise de mână, proba ar fi picat peste o săptămână):
  // un drum miercuri săptămâna trecută, unul acum o oră (săptămâna asta — sau, luni la miezul nopții, tot cea trecută).
  const sapTrecuta = I.perioada({ period: 'last_week' }, Date.now());
  const ziTrecuta = new Date(Date.parse(sapTrecuta.from) + 2 * 86400000 + 7 * 3600000).toISOString();
  const acumOOra = new Date(Date.now() - 60 * 60000).toISOString();
  await drum(DEV[0].imei, ziTrecuta, 30, 1.0);
  await drum(DEV[0].imei, acumOOra, 20, 1.0);
  await drum(DEV[2].imei, acumOOra, 15, 1.0);
  await drum('350000000051009', acumOOra, 15, 1.0);
  const fond0 = (await json('GET', '/api/ai/quota', ckSef)).j.used;

  // a) întrebările gata făcute
  const iq = await json('GET', '/api/reports/ai-raport/intrebari', ckAlt);
  T('întrebările gata făcute: și pentru firma FĂRĂ RA Insight', iq.status === 200 && iq.j.intrebari.length === A.INTREBARI_GATA.length);

  // b) cifrele = cifrele raportului
  const q1 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'Câți km a făcut B 154 UIP săptămâna trecută?' });
  T('răspunde, gratuit, cu sursa: Index km / ore, pe B 154 UIP', q1.status === 200 && q1.j.gratuit === true && q1.j.sursa && q1.j.sursa.type === 'utilization' && (q1.j.sursa.imeis || []).join() === DEV[0].imei, q1.text.slice(0, 200));
  const rap = await json('GET', '/api/reports/utilization?imei=' + DEV[0].imei + '&from=' + encodeURIComponent(q1.j.sursa.from) + '&to=' + encodeURIComponent(q1.j.sursa.to), ckSef);
  const kmRap = rap.j.valori && rap.j.valori[0] && rap.j.valori[0].km;
  T('cifra din răspuns e cifra raportului „Index km / ore" pe aceeași perioadă (' + kmRap + ' km)', kmRap > 20 && (q1.j.raspuns.tiles[0] || {}).val === A.nr(kmRap), JSON.stringify(q1.j.raspuns.tiles) + ' vs ' + kmRap);
  T('„Am înțeles" vine cu răspunsul (subiect, mașină, perioadă)', (q1.j.inteles || []).map((x) => x.tip).join() === 'subiect,masina,perioada');
  // c) continuarea, cu contextul întors de server
  const q2 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'și săptămâna asta?', context: q1.j.context });
  T('„și săptămâna asta?" continuă pe B 154 UIP, cu „ținut minte"', q2.status === 200 && (q2.j.sursa.imeis || []).join() === DEV[0].imei && (q2.j.inteles || []).some((x) => x.mem && x.tip === 'masina'), q2.text.slice(0, 200));
  // d) îndoiala
  const q3 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'consumul Loganului luna trecută' });
  T('„Loganul" → butoane cu cele două Logan, fără raport rulat', q3.j.neinteles && q3.j.motiv === 'ambiguu' && (q3.j.alege || []).map((a) => a.trimite).sort().join() === 'B 154 UIP,B 155 UIP', q3.text.slice(0, 200));
  const q4 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'de ce consumă B 77 RAT atât?' });
  T('„de ce" → trimite la RA Insight (spreInsight)', q4.j.neinteles && q4.j.spreInsight === true);
  // e) modelul nu a fost chemat, fondul nu s-a mișcat
  T('modelul NU a fost chemat deloc', cereriModel() === 0, cereriModel());
  T('fondul RA Insight al firmei nu s-a mișcat', (await json('GET', '/api/ai/quota', ckSef)).j.used === fond0);
  // f) fără loc RA Insight și într-o firmă fără RA Insight: merge
  const q5 = await json('POST', '/api/reports/ai-raport', ckAlt, { text: 'km săptămâna asta' });
  T('firma FĂRĂ RA Insight: AI Raport răspunde (e gratuit, al tuturor)', q5.status === 200 && !!q5.j.raspuns && /Flota a parcurs|a parcurs/.test(q5.j.raspuns.text || ''), q5.text.slice(0, 160));
  // g) nimeni nu vede mașinile altei firme
  const furt1 = await json('POST', '/api/reports/ai-raport', ckAlt, { text: 'Câți km a făcut B 154 UIP săptămâna trecută?' });
  T('altă firmă, cu numărul nostru: nu-l recunoaște, răspunde doar despre flota ei', furt1.status === 200 && !(furt1.j.sursa && furt1.j.sursa.imeis) && furt1.text.indexOf('Dacia Logan') < 0 && furt1.text.indexOf('154 UIP') < 0, furt1.text.slice(0, 200));
  const furt2 = await json('POST', '/api/reports/ai-raport', ckAlt, { text: 'și săptămâna asta?', context: { subiect: 'km', masini: [DEV[0].imei, DEV[1].imei], perioada: q1.j.context.perioada } });
  T('…nici cu `context` trimis de mână cu mașinile noastre (se curăță pe server)', furt2.status === 200 && !(furt2.j.context && furt2.j.context.masini) && furt2.text.indexOf('Dacia Logan') < 0, furt2.text.slice(0, 200));
  const furt3 = await json('POST', '/api/reports/ai-raport', ckAlt, { text: 'km săptămâna asta', imei: DEV[0].imei });
  T('…nici cu `imei` în corp (aruncat)', furt3.status === 200 && furt3.text.indexOf('Dacia Logan') < 0);
  const furt4 = await json('POST', '/api/reports/ai-raport?imei=' + DEV[0].imei, ckAlt, { text: 'km săptămâna asta' });
  T('…nici cu `?imei=` în adresă (refuz)', furt4.status === 403, furt4.status);
  // h) drepturile din rol
  await json('PUT', '/api/company-roles/manager', ckSef, { nume: 'Manager', taiate: [], rapoarte: ['utilization'] });
  const q6 = await json('POST', '/api/reports/ai-raport', ckMan, { text: 'km săptămâna trecută' });
  T('managerul cu „Index km / ore" tăiat din rol: AI Raport îi spune că n-are acces (nu cifrele)', q6.status === 200 && q6.j.motiv === 'fara_drept' && !q6.j.raspuns, q6.text.slice(0, 160));
  const q6b = await json('POST', '/api/reports/ai-raport', ckMan, { text: 'depășiri de viteză săptămâna trecută' });
  T('…dar celelalte rapoarte îi merg', q6b.status === 200 && !!q6b.j.raspuns, q6b.text.slice(0, 120));
  await json('PUT', '/api/company-roles/dispatcher', ckSef, { nume: 'Dispecer', taiate: ['viewReports'], rapoarte: [] });
  const q7 = await json('POST', '/api/reports/ai-raport', ckDisp, { text: 'km azi' });
  const q7b = await json('GET', '/api/reports/ai-raport/intrebari', ckDisp);
  T('fără dreptul „vede rapoarte": refuz (403), și la întrebări, și la răspuns', q7.status === 403 && q7b.status === 403, q7.status + '/' + q7b.status);
  // i) demo-ul nu intră (compania demo există în bază chiar cu DEMO_DISABLED)
  const q8 = await json('POST', '/api/reports/ai-raport', S, { text: 'km pe toată flota săptămâna asta' });
  T('super-adminul, pe toată flota: fără mașinile demo', q8.status === 200 && q8.text.indexOf('DEMO') < 0 && q8.text.indexOf('Demo') < 0, q8.text.slice(0, 200));
  // j) plafonul pe minut
  let ultim = null;
  for (let i = 0; i < 31; i++) ultim = await json('POST', '/api/reports/ai-raport', ckRaf, { text: '' });
  T('plafonul: a 31-a întrebare într-un minut e oprită (429)', ultim.status === 429, ultim.status);
  // k) în jurnal: subiectul, nu textul
  const aud = await json('GET', '/api/audit?limit=500', S);
  const randuri = (Array.isArray(aud.j) ? aud.j : (aud.j.rows || aud.j.entries || [])).filter((x) => x.action === 'ai_raport');
  T('jurnalul are rândurile AI Raport, fără textul întrebării', randuri.length >= 3 && randuri.every((x) => JSON.stringify(x).indexOf('Câți km') < 0 && JSON.stringify(x).indexOf('săptămâna') < 0), randuri.length + ' ' + JSON.stringify(randuri[0] || {}).slice(0, 200));
  T('la final, tot zero cereri către model', cereriModel() === 0, cereriModel());

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
