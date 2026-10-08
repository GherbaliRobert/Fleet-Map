// verify_ai_raport.js — „AI Raport" (Rapoarte → fila „AI Raport"): întrebări despre rapoarte, pe REGULI, fără model.
//
//   node verify_ai_raport.js
//
// De ce (Alin, 02.10): „în rapoarte vreau să fie un agent unde întrebi ceva despre rapoarte… cu sugestii" + „AI Raport
// va lua din rapoarte date, deci nu ne costă bani/tokeni; RA Insight va fi singurul care va costa". Și 07.10: „de cât
// timp staționează B 154 UIP?" → „Nu am înțeles despre ce raport e vorba"; „din raport staționări" → toată flota, nu
// mașina; „Gratuit — nu se scade din fondul RA Insight" nu are ce căuta pe ecran. Proba păzește:
//   1. înțelegerea (ai_raport.js): subiectul (cuvintele tari întâi, verbele după), prezentul („staționează", „unde e")
//      = acum, mașina (număr, nume, grupă) ținută minte în discuție, perioada pe ora României, îndoiala („Loganul" cu
//      două Logan) cu subiectul păstrat, mașina fără subiect → butoane, „de ce" → RA Insight;
//   2. răspunsurile pe forma ADEVĂRATĂ a rapoartelor: coloanele citite din reports.js și coloana „Șofer" pusă de
//      funcția adevărată (până pe 07.10 AI Raport citea după poziție și „Ce expiră" citea coloana greșită);
//   3. sursa: aceeași funcție de opțiuni ca ecranul Rapoarte, fără loc RA Insight, fără model, fără „gratuit"/„fond";
//   4. pe server pornit: cifrele = cifrele raportului (km, „de cât timp stă", staționări, ce expiră); modelul nu e chemat
//      NICIODATĂ; drepturile (rol tăiat, fără „vede rapoarte"); nimeni nu vede mașinile altei firme (nici prin
//      `context`, nici prin `imei`); demo-ul lipsește; plafonul pe minut; în jurnal nu ajunge textul întrebării.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const A = require('./ai_raport');
const I = require('./insight');
const R = require('./reports');
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
const u4b = U('B 155 UIP', u4.context);
T('…iar mașina aleasă din butoane primește răspunsul ÎNTREBĂRII (consum, septembrie), nu „nu am înțeles"', u4b.ok && u4b.subiect === 'consum' && u4b.masini.join() === DEV[1].imei && u4b.perioada.eticheta === 'septembrie 2026', JSON.stringify(u4b).slice(0, 200));
const u5 = U('și celălalt Logan?', { subiect: 'consum', masini: [DEV[0].imei] });
T('„celălalt Logan" → celălalt, fără să mai întrebe', u5.ok && u5.masini.join() === DEV[1].imei, JSON.stringify(u5).slice(0, 160));
T('„de ce consumă atât?" → la RA Insight (cauzele nu se ghicesc pe reguli)', U('de ce consumă B 77 RAT atât de mult?').motiv === 'pentru_insight');
T('„compară…" și „ce să fac" → tot la RA Insight', U('compară consumul lui B 154 UIP cu B 155 UIP').motiv === 'pentru_insight' && U('ce să fac cu ralantiul?').motiv === 'pentru_insight');
T('o propoziție fără subiect nu moștenește subiectul de dinainte („vreme frumoasă azi")', U('vreme frumoasa azi', ctx1).motiv === 'fara_subiect');
// Regula din 07.10: mașina discutată rămâne în discuție (până atunci, doar la „și…"/„dar…"). „Ce expiră" privește ÎNAINTE.
const u6 = U('Ce expiră în următoarele 30 de zile');
T('„Ce expiră în următoarele 30 de zile", fără discuție: privește ÎNAINTE, toată flota', u6.ok && u6.subiect === 'scadente' && u6.masini === null && u6.perioada.inainte && Date.parse(u6.perioada.to) - ACUM === 30 * 86400000, JSON.stringify(u6).slice(0, 160));
const u6b = U('Ce expiră în următoarele 30 de zile', ctx1);
T('…după o întrebare despre B 154 UIP: rămâne pe B 154 UIP („ținut minte"), perioada tot înainte', u6b.ok && u6b.subiect === 'scadente' && u6b.masini.join() === DEV[0].imei && u6b.mem.masini && u6b.perioada.inainte, JSON.stringify(u6b).slice(0, 200));
T('…„pe toată flota" sau o întrebare despre mașini la plural („care mașină…", „cine…") o lasă', U('ce expira pe toata flota', ctx1).masini === null && U('care masina a mers cel mai mult luna trecuta', ctx1).masini === null && U('cine a avut cele mai multe depasiri', ctx1).masini === null);
const u7 = U('km pe grupa Distribuție în septembrie');
T('grupa → mașinile ei; „în septembrie" → luna întreagă, pe ora României', u7.ok && u7.grupa === 'Distribuție' && u7.masini.length === 2 && u7.perioada.from === '2026-08-31T21:00:00.000Z' && u7.perioada.to === '2026-09-30T21:00:00.000Z', JSON.stringify(u7.perioada));
T('„toată flota" uită mașina discutată', U('si ralanti pe toata flota', ctx1).masini === null);
T('„mai mult" nu e luna mai', U('cine a facut mai mult km').perioada.implicita === true);
T('„ultimele 200 de zile" se taie la ' + A.MAX_ZILE + ' (un raport prea lung încetinește serverul)', (Date.parse(U('km ultimele 200 de zile').perioada.to) - Date.parse(U('km ultimele 200 de zile').perioada.from)) / 86400000 === A.MAX_ZILE);
T('o zi anume („pe 15.09") → ziua aia, de la miezul nopții la București', U('opriri pe 15.09').perioada.from === '2026-09-14T21:00:00.000Z');
const int1 = A.inteles(u2, F).map((x) => (x.mem ? 'mem:' : '') + x.tip + ':' + x.text);
T('„Am înțeles" arată ce s-a ținut minte', int1.join(' | ') === 'mem:subiect:Km parcurși | mem:masina:B 154 UIP · Dacia Logan 3 | perioada:septembrie 2026', int1.join(' | '));

// Întrebarea lui Alin din 07.10 și surorile ei: prezentul = ACUM („Ultima locație"), trecutul = o perioadă („Staționări").
const s1 = U('de cat timp stationeaza b 154 uip?');
T('„de cat timp stationeaza b 154 uip?" (fără diacritice) → Ultima locație, B 154 UIP, acum', s1.ok && s1.subiect === 'locatie' && s1.masini.join() === DEV[0].imei && s1.perioada.acum && A.inteles(s1, F)[2].text === 'acum', JSON.stringify(s1).slice(0, 200));
T('…aceeași cu diacritice, „unde e B 154 UIP", „B 154 UIP e oprită?", „de când stă B 154 UIP"', ['De cât timp staționează B 154 UIP?', 'unde e B 154 UIP', 'B 154 UIP e oprită?', 'de când stă B 154 UIP'].every((q) => { const x = U(q); return x.ok && x.subiect === 'locatie' && x.masini.join() === DEV[0].imei; }));
T('„unde e B 154 UIP azi" e tot ACUM (citit pe o zi, o mașină parcată de ieri ar fi ieșit „de la miezul nopții")', U('unde e B 154 UIP azi').perioada.acum === true);
const s2 = U('unde a stat B 154 UIP ieri');
T('„unde a stat B 154 UIP ieri" (trecut) → Staționări, ieri', s2.ok && s2.subiect === 'opriri' && s2.perioada.eticheta === 'ieri', JSON.stringify(s2).slice(0, 160));
T('„cât a staționat … săptămâna trecută", „staționările de azi" → Staționări', U('cât a staționat B 154 UIP săptămâna trecută').subiect === 'opriri' && U('staționările lui B 154 UIP de azi').subiect === 'opriri');
const s3 = U('B 154 UIP');
T('doar mașina, fără subiect → „Ce vrei să afli despre B 154 UIP?", cu mașina ținută minte', !s3.ok && s3.motiv === 'doar_masina' && s3.context.masini.join() === DEV[0].imei && /Ce vrei să afli despre \*\*B 154 UIP · Dacia Logan 3\*\*/.test(A.neinteles(s3, F).text), JSON.stringify(s3).slice(0, 200));
const s4 = U('din raport stationari', s3.context);
T('…apoi „din raport stationari" → Staționări pe B 154 UIP (Alin, 07.10: primea toată flota)', s4.ok && s4.subiect === 'opriri' && s4.masini.join() === DEV[0].imei && s4.mem.masini, JSON.stringify(s4).slice(0, 200));
T('…și după o întrebare NEînțeleasă despre mașină, mașina rămâne („blabla B 154 UIP" → „staționări")', U('staționări', U('ceva neclar despre B 154 UIP').context).masini.join() === DEV[0].imei);
const bs = A.neinteles(s3, F).alege || [];
T('butoanele pentru o mașină (' + bs.length + '): fiecare întrebare e înțeleasă, pe mașina ei, cu numărul scris în ea', bs.length === A.PE_MASINA.length && bs.every((b) => { const x = U(b.trimite); return x.ok && x.masini && x.masini.join() === DEV[0].imei && /B 154 UIP/.test(b.trimite); }), JSON.stringify(bs.map((b) => b.trimite)));
const bf = A.neinteles(U('ceva fara sens'), F).alege || [];
T('butoanele pentru flotă (' + bf.length + '): fiecare înțeleasă, pe toată flota, chiar dacă s-a vorbit de o mașină', bf.length === A.PE_FLOTA.length && bf.every((b) => { const x = U(b.trimite, ctx1); return x.ok && x.masini === null; }), JSON.stringify(bf.map((b) => b.trimite)));
T('cuvintele tari bat verbele: „ce curse a făcut ieri" → curse (nu km), „foaia de parcurs" → curse (nu km), „km până la revizie" → ce expiră', U('ce curse a făcut B 154 UIP ieri').subiect === 'curse' && U('foaia de parcurs de ieri').subiect === 'curse' && U('câți km mai are B 154 UIP până la revizie').subiect === 'scadente');
T('„ce a făcut B 154 UIP ieri?", „la ce oră a plecat azi" → Situație zilnică', U('ce a făcut B 154 UIP ieri?').subiect === 'rezumat' && U('la ce oră a plecat B 154 UIP azi').subiect === 'rezumat');
T('„a mers B 154 UIP azi?" → km; „a stat cu motorul pornit" → ralanti; „când a transmis ultima dată" → disponibilitate', U('a mers B 154 UIP azi?').subiect === 'km' && U('B 154 UIP a stat cu motorul pornit?').subiect === 'ralanti' && U('când a transmis ultima dată B 154 UIP').subiect === 'disponibilitate');
const s5 = U('supraturații la B 154 UIP săptămâna asta');
T('un raport pe care AI Raport nu-l citește (supraturații) → butonul raportului, cu mașina și perioada, nu „nu am înțeles"', !s5.ok && s5.motiv === 'alt_raport' && s5.raport === 'overrev' && s5.masini.join() === DEV[0].imei && !!R.REPORTS[s5.raport] && A.ALTE_RAPOARTE.every((a) => !!R.REPORTS[a.raport]), JSON.stringify(s5).slice(0, 200));
T('„aseară" = ieri', U('unde a parcat B 154 UIP aseară').perioada.eticheta === 'ieri');
T('după „unde e acum", discuția nu ține minte o perioadă (întrebarea următoare pornește de la a ei)', A.contextul(s1, s1.perioada.from, s1.perioada.to).perioada === null && A.contextul(u1, u1.perioada.from, u1.perioada.to).perioada.from === u1.perioada.from);

// Întrebările de continuare de sub răspuns (Alin, 08.10: „da"): pe reguli, cel mult trei, fiecare înțeleasă cu discuția
// de după răspuns — altfel butonul ar duce la „nu am înțeles".
const LANT = ['Câți km a făcut B 154 UIP săptămâna trecută?', 'consum luna trecută pe flotă', 'ce a făcut B 154 UIP azi?', 'unde sunt mașinile acum',
  'Ce expiră în următoarele 30 de zile', 'depășiri de viteză în ultimele 7 zile', 'staționări ieri B 77 RAT', 'alerte săptămâna asta', 'ralanti luna asta pe flotă'];
const rauUrm = [];
for (const q of LANT) {
  const u = U(q), urm = A.urmari(u, u.masini ? null : 'B 77 RAT'), cx = A.contextul(u, u.perioada.from, u.perioada.to);
  if (!urm.length || urm.length > 3) rauUrm.push(q + ': ' + urm.length);
  for (const x of urm) { const v = U(x.trimite, cx); if (!v.ok) rauUrm.push(q + ' → ' + x.text + ': ' + v.motiv); }
}
T('întrebările de continuare: 1–3 după fiecare răspuns, fiecare înțeleasă cu discuția de după (' + LANT.length + ' răspunsuri)', !rauUrm.length, rauUrm.join(' | '));
const cu1 = A.contextul(u1, u1.perioada.from, u1.perioada.to), urm1 = A.urmari(u1, null);
const sd = U('Și săptămâna dinainte?', cu1);
T('după km-ii lui B 154 UIP pe săptămâna trecută: „Și săptămâna dinainte?" (14–20 septembrie, pe aceeași mașină), „Și consumul?", „Și pe toată flota?"',
  urm1.map((x) => x.text).join(' | ') === 'Și săptămâna dinainte? | Și consumul? | Și pe toată flota?' && sd.ok && sd.perioada.eticheta === '14–20 septembrie' && sd.masini.join() === DEV[0].imei && sd.subiect === 'km', urm1.map((x) => x.text).join(' | ') + ' / ' + sd.perioada.eticheta);
const ul = U('consum luna trecută pe flotă'), ld = U('Și luna dinainte?', A.contextul(ul, ul.perioada.from, ul.perioada.to));
const uz = U('ce a făcut B 154 UIP azi?'), zd = U('Și ziua dinainte?', A.contextul(uz, uz.perioada.from, uz.perioada.to));
const ur = U('depășiri de viteză în ultimele 7 zile'), rd = U('Și perioada dinainte?', A.contextul(ur, ur.perioada.from, ur.perioada.to));
T('„dinainte": luna întreagă de dinainte (august), ziua de dinainte (după „azi" = ieri), iar o perioadă oarecare — la fel de lungă, lipită înainte',
  ld.perioada.eticheta === 'august 2026' && zd.perioada.eticheta === 'ieri' && Date.parse(rd.perioada.to) === Date.parse(ur.perioada.from) && Date.parse(ur.perioada.to) - Date.parse(ur.perioada.from) === Date.parse(rd.perioada.to) - Date.parse(rd.perioada.from),
  [ld.perioada.eticheta, zd.perioada.eticheta, rd.perioada.eticheta].join(' | '));
T('„unde e acum" nu primește „perioada dinainte"; „ce expiră" primește „Și luna viitoare?" (privește înainte)', !A.urmari(s1, null).some((x) => /dinainte/.test(x.text)) && A.urmari(u6, null)[0].text === 'Și luna viitoare?' && U('Și luna viitoare?', A.contextul(u6, u6.perioada.from, u6.perioada.to)).perioada.eticheta === 'noiembrie 2026');
T('butonul „Raport" din casetă: fiecare cuvânt pus în întrebare numește subiectul lui (' + A.ALEGERI_RAPORT.length + ')', A.ALEGERI_RAPORT.length >= 15 && A.ALEGERI_RAPORT.every((x) => { const v = A.subiectDin(I.norm(x.pune)); return v && v.k === x.k; }), JSON.stringify(A.ALEGERI_RAPORT.filter((x) => { const v = A.subiectDin(I.norm(x.pune)); return !v || v.k !== x.k; })));

// ─── 2. Răspunsurile, pe forma adevărată a rapoartelor ──────────────────────────────────────────────
console.log('\n2. Răspunsurile, din rapoarte (aceleași chei ca reports.js), cu numere românești');
const ET = (i) => DEV[i].name + ' (' + DEV[i].plate + ')';   // cum scriu rapoartele mașina
const X = { fisa: F, acum: ACUM, pret: 7.5 };
// Forma ADEVĂRATĂ a unui raport: coloanele citite din reports.js (din funcția raportului) și coloana „Șofer" pusă de
// funcția adevărată (runReport → _injectDriverColumn). Rândurile se scriu cum le scrie funcția raportului, fără „Șofer".
const RSRC = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
function coloaneDin(fn) {
  const m = new RegExp('async function ' + fn + '\\(([\\s\\S]*?)\\n}\\n').exec(RSRC);
  const c = m && /columns: (\[[^\]]*\])/.exec(m[1]);
  return c ? JSON.parse(c[1].replace(/'/g, '"')) : null;
}
const DEVMAP = {}; DEV.forEach((d) => { DEVMAP[d.imei] = { name: d.name, plate: d.plate, driver_name: 'Ion Popescu' }; });
function forma(fn, rows, rest) {
  const res = Object.assign({ columns: coloaneDin(fn), rows: rows.map((x) => x.slice()) }, rest || {});
  R._ajutor.coloanaSofer(res, DEV.map((d) => d.imei), DEVMAP);
  return res;
}
const LOC0 = forma('rLocation', [[ET(0), 'Str. Lungă 5, Brașov', '02.10.2026, 08:10:00', '4 h 50 min', 'oprit', '9 (bun)']]);
T('forma adevărată: coloanele vin din reports.js, iar „Șofer" stă pe locul 2 (așa ajung rapoartele la AI Raport)', LOC0.columns.join('|') === 'Vehicul|Șofer|Locație (unde a oprit)|A oprit la|Staționează de|Contact|Sateliți' && LOC0.rows[0][1] === 'Ion Popescu', LOC0.columns.join('|'));
let r = A.raspunde(u1, { valori: [{ vehicul: ET(0), imei: DEV[0].imei, km: 538.4, ore: 0, unitate: 'km', sursa: 'CAN' }] }, Object.assign({}, X, { anterior: { valori: [{ imei: DEV[0].imei, km: 472, unitate: 'km' }] } }));
T('km pe o mașină: „a parcurs 538 de km", cu sursa (calculatorul de bord)', /B 154 UIP · Dacia Logan 3\*\* a parcurs \*\*538 de km\*\* — 21–27 septembrie\. \(din calculatorul de bord\)/.test(r.text), r.text);
T('…și față de perioada dinainte, la fel de lungă (+66 km, +14%)', r.sugestii.some((s) => s.fel === 'info' && /Cu 66 de km mai mult .* \(\+14%\)/.test(s.text)), JSON.stringify(r.sugestii));
r = A.raspunde(U('km pe flota saptamana trecuta'), { valori: [
  { vehicul: ET(0), imei: DEV[0].imei, km: 1234.5, unitate: 'km', sursa: 'GPS (estimat)' },
  { vehicul: ET(1), imei: DEV[1].imei, km: 0, unitate: 'km', sursa: 'GPS (estimat)' },
  { vehicul: ET(2), imei: DEV[2].imei, km: 310, unitate: 'km', sursa: 'CAN' }] }, X);
T('km pe flotă: totalul cu separatorul românesc de mii, tabelul ordonat, cine n-a mers', /Flota a parcurs \*\*1\.545 de km\*\*/.test(r.text) && r.tabel.randuri[0][0] === 'B 154 UIP · Dacia Logan 3' && r.tabel.randuri[0][1] === '1.235' && r.sugestii.some((s) => s.fel === 'atentie' && /O mașină n-a mers deloc: B 155 UIP · Dacia Logan 2/.test(s.text)), r.text + ' ' + JSON.stringify(r.tabel));
T('…iar sub răspuns, continuarea pe prima mașină din tabel: „Dar B 154 UIP?"', (r.urmari || []).some((x) => x.trimite === 'Dar B 154 UIP?'), JSON.stringify(r.urmari));
r = A.raspunde(U('consumul lui B 77 RAT luna trecuta'), { valori: [{ vehicul: ET(2), imei: DEV[2].imei, km: 1200, litri: 81.6, l100: 6.8, sursa: 'CAN', areDate: true }] }, Object.assign({}, X, { anterior: { valori: [{ imei: DEV[2].imei, l100: 7.2 }] },
  alimentari: forma('rFuel', [[ET(2), '15.09.2026, 22:10:00', 'Scădere/furt', 'Motorină', -23.4, '60.0 → 36.6', '']], { valori: [{ imei: DEV[2].imei, vehicul: ET(2), ts: '2026-09-15T19:10:00.000Z', fel: 'scadere', litri: 23.4, de: 60, la: 36.6 }] }) }));
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
r = A.raspunde(U('opriri ieri'), forma('rStops', [], { summary: { 'Opriri': 0, 'Timp staționat total': '0s' } }), X);
T('staționări zero: „Nicio staționare", nu un șir de zerouri', /^Nicio staționare/.test(r.text), r.text);
const OPR = [[ET(0), '01.10.2026, 07:40:00', '01.10.2026, 08:05:00', '25m', 'Str. Lungă 5, Brașov'],
  [ET(0), '01.10.2026, 10:30:00', '01.10.2026, 12:15:00', '1h 45m', 'Client X, Ploiești'],
  [ET(0), '01.10.2026, 14:00:00', '01.10.2026, 17:10:00', '3h 10m', 'Depozit, Ploiești']];
r = A.raspunde(U('unde a stat B 154 UIP ieri'), forma('rStops', OPR, { summary: { 'Opriri': 3, 'Timp staționat total': '5h 20m' } }), X);
T('staționări pe o mașină: câte, cât în total, cea mai lungă cu locul și ora (pe o zi: doar ora)', /\*\*B 154 UIP · Dacia Logan 3\*\* a avut \*\*3 opriri\*\* — ieri, în total \*\*5h 20m\*\* pe loc\. Cea mai lungă: \*\*3h 10m\*\*, la Depozit, Ploiești \(de la 14:00\)\./.test(r.text), r.text);
T('…cu fiecare oprire în tabel, în ordinea zilei, cu locul (nu șoferul)', r.tabel && r.tabel.randuri.length === 3 && r.tabel.randuri[0].join('|') === '07:40|08:05|25m|Str. Lungă 5, Brașov', JSON.stringify(r.tabel));
const OPR2 = OPR.concat([[ET(2), '01.10.2026, 09:00:00', '01.10.2026, 09:20:00', '20m', 'Cluj']]);
r = A.raspunde(U('staționări ieri pe flotă'), forma('rStops', OPR2, { summary: { 'Opriri': 4, 'Timp staționat total': '5h 40m' },
  perVehicle: [{ vehicul: ET(2), summary: [['Opriri', 1], ['Timp staționat', '20m'], ['Cea mai lungă', '20m']] }, { vehicul: ET(0), summary: [['Opriri', 3], ['Timp staționat', '5h 20m'], ['Cea mai lungă', '3h 10m']] }] }), X);
T('staționări pe flotă: totalul, iar mașinile ordonate după timpul pe loc', /Flota: \*\*4 opriri\*\* — ieri, în total \*\*5h 40m\*\* pe loc/.test(r.text) && r.tabel.randuri[0][0] === 'B 154 UIP · Dacia Logan 3' && r.tabel.randuri[0][2] === '5h 20m', r.text + ' ' + JSON.stringify(r.tabel));
// Foaia de parcurs și „ce a făcut" (Situație zilnică), pe forma adevărată.
const CRS = [[ET(0), '01.10.2026, 07:00:00', 'Str. Lungă 5, Brașov', '01.10.2026, 07:40:00', 'Client X, Ploiești', '40m', '61.20', '—', '—', 70, 96],
  [ET(0), '01.10.2026, 08:05:00', 'Client X, Ploiești', '01.10.2026, 10:30:00', 'Depozit, Ploiești', '2h 25m', '120.84', '—', '—', 52, 88]];
r = A.raspunde(U('ce curse a făcut B 154 UIP ieri'), forma('rTrips', CRS, { summary: { 'Curse': 2, 'Distanță totală (km)': 182, 'Durată totală': '3h 5m' } }), X);
T('curse pe o mașină: câte, km, timpul la drum, prima plecare și ultima sosire cu locurile', /a făcut \*\*2 curse\*\* — ieri: \*\*182 de km\*\*, 3h 5m la drum\. Prima plecare: 07:00 \(Str\. Lungă 5, Brașov\); ultima sosire: 10:30 \(Depozit, Ploiești\)\./.test(r.text) && r.tabel.randuri[1].join('|') === '08:05|Client X, Ploiești|Depozit, Ploiești|120,8', r.text + ' ' + JSON.stringify(r.tabel));
const ZIL = [[ET(0), '2026-10-01', '07:00 – 17:40', '182.4', 6, '4h 10m', '25m', '4h 35m', 5, 96]];
r = A.raspunde(U('ce a făcut B 154 UIP ieri?'), forma('rDaily', ZIL, { summary: { 'Zile-vehicul': 1, 'Km total': 182, 'Ralanti total (flotă)': '25m' } }), X);
T('„ce a făcut ieri": între ce ore a lucrat, km, curse, mers, ralanti, opriri, viteza maximă', /— ieri: a lucrat între \*\*07:00 – 17:40\*\*, \*\*182 de km\*\* în 6 curse; 4h 10m în mers, 25m în ralanti, 5 opriri\. Viteza cea mai mare: 96 km\/h\./.test(r.text), r.text);
r = A.raspunde(U('ce a făcut B 154 UIP săptămâna asta?'), forma('rDaily', ZIL.concat([[ET(0), '2026-10-02', '—', '0.0', 0, '0s', '0s', '0s', 0, 0], [ET(0), '2026-10-03', '08:00 – 12:00', '40.0', 2, '1h 5m', '10m', '1h 15m', 1, 70]]), { summary: {} }), X);
T('…pe mai multe zile: km, zilele cu mers, curse, mers și ralanti adunate, plus ziua săptămânii în tabel', /\*\*222 de km\*\* în \*\*2 zile\*\* de mers, 8 curse; 5h 15m în mers, 35m în ralanti\./.test(r.text) && r.tabel.randuri[0][0] === 'joi 01.10', r.text + ' ' + JSON.stringify(r.tabel && r.tabel.randuri[0]));
r = A.raspunde(U('ce a făcut B 154 UIP azi'), forma('rDaily', [[ET(0), '2026-10-02', '—', '0.0', 0, '0s', '0s', '0s', 0, 0]], { summary: {} }), X);
T('…o zi fără mers: „n-a mers", nu „0 km în 0 curse"', /n-a mers — azi/.test(r.text) && !/0 curse/.test(r.text), r.text);
r = A.raspunde(U('ce a făcut B 154 UIP ieri?'), forma('rDaily', [[ET(0), '2026-10-01', '11:30 – 13:42', '116.0', 2, '1h 43m', '0s', '1h 43m', 2, 60]], { summary: {} }), X);
T('…fără ralanti: „fără ralanti", nu „0s în ralanti"', /1h 43m în mers, fără ralanti, 2 opriri/.test(r.text) && !/0s/.test(r.text), r.text);
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
r = A.raspunde(u6, forma('rDocServiceDue', DUE.rows), X);
T('martor: pe forma adevărată, locul 6 („Stare" de până pe 07.10) e de fapt „Efectuat" — citirea după poziție greșea', forma('rDocServiceDue', DUE.rows).rows[0][5] === '—' && forma('rDocServiceDue', DUE.rows).rows[0][6] === 'Critic');
T('ce expiră: 2 de urmărit (Critic + Curând), 1 deja expirat; „OK", „Efectuat" și „—" nu se numără', /\*\*2 scadențe\*\*, plus \*\*1 act sau revizie deja expirat\*\*/.test(r.text) && r.tabel.randuri.length === 3 && r.tabel.randuri[0][3] === 'Depășit', r.text + ' ' + JSON.stringify(r.tabel.randuri));
T('…cu cel care expiră în 7 zile numit, și revizia fără kilometraj explicată', r.sugestii.some((s) => /Unul expiră în cel mult 7 zile: B 154 UIP · Dacia Logan 3 — ITP/.test(s.text)) && r.sugestii.some((s) => s.fel === 'info' && /1 revizie pe km nu se poate socoti/.test(s.text)), JSON.stringify(r.sugestii));
r = A.raspunde(u6, forma('rDocServiceDue', [DUE.rows[4], DUE.rows[5]]), X);
T('nimic de urmărit: „Nimic nu expiră", fără tabel gol', /^Nimic nu expiră/.test(r.text) && !r.tabel, r.text);
r = A.raspunde(U('clasamentul soferilor in ultimele 30 de zile'), forma('rEcoDriveDrivers', [[1, 'Ion Popescu', 92, 'A', 0.8, 2100], [2, 'Andrei Stan', 55, 'D', 6.1, 900]], { summary: { 'Scor mediu flotă (0-100)': 80 } }), X);
T('clasamentul: cel mai bun șofer, iar cel cu scor sub 60 e numit cu un sfat', /Cel mai bun: \*\*Ion Popescu\*\* \(scor 92, nota A\)/.test(r.text) && r.sugestii.some((s) => /Andrei Stan are cel mai mic scor \(55\)/.test(s.text)), r.text);
r = A.raspunde(U('clasamentul soferilor azi'), forma('rEcoDriveDrivers', [], { summary: { 'Scor mediu flotă (0-100)': 0 } }), X);
T('clasament fără date: spus, fără „scorul mediu 0"', /Nu am destule date/.test(r.text) && !r.tiles.length, r.text);
r = A.raspunde(U('scorul lui B 154 UIP saptamana asta'), { summary: { 'Scor flotă (0-100)': 0, 'Vehicule evaluate': 0, 'Accelerări bruște': 0, 'Frânări bruște': 0 } }, X);
T('stil de condus fără drum: „nu am destule date", nu „scorul 0 din 100"', /Nu am destule date de condus/.test(r.text) && !/scorul \*\*0\*\*/.test(r.text), r.text);
r = A.raspunde(U('scorul lui B 154 UIP saptamana asta'), { summary: { 'Scor flotă (0-100)': 81, 'Vehicule evaluate': 1, 'Accelerări bruște': 2, 'Frânări bruște': 3 },
  perVehicle: [{ vehicul: ET(0), summary: [['Scor', 81], ['Notă', 'B'], ['Accel. bruște', 2], ['Frânări bruște', 3]] }] }, X);
T('stil de condus pe o mașină: scorul, nota, frânările și accelerările bruște', /scor \*\*81\*\* \(nota B\), cu 3 frânări bruște și 2 accelerări bruște/.test(r.text), r.text);
r = A.raspunde(U('alerte saptamana asta'), forma('rEvents', [[ET(0), 'Depășire viteză', 'x', '', ''], [ET(0), 'Depășire viteză', 'x', '', ''], [ET(0), 'Ralanti', 'x', '', ''], [ET(2), 'Ralanti', 'x', '', '']], { summary: {} }), X);
T('alerte: câte, pe feluri, iar mașina cu cele mai multe e numită', /\*\*4 alerte\*\*/.test(r.text) && /Depășire viteză \(2\), Ralanti \(2\)/.test(r.text) && r.sugestii.some((s) => /B 154 UIP · Dacia Logan 3 are cele mai multe alerte \(3\)/.test(s.text)), r.text + ' ' + JSON.stringify(r.sugestii));
r = A.raspunde(U('vizite in zone saptamana asta'), forma('rGeofence', [[ET(0), 'Depozit', 'a', 'b', '1h'], [ET(2), 'Depozit', 'a', 'b', '2h'], [ET(2), 'Client X', 'a', 'b', '1h']], { summary: {} }), X);
T('zone: vizitele și zonele, pe zone', /\*\*3 vizite\*\* în zone/.test(r.text) && /în 2 zone/.test(r.text) && r.tabel.randuri[0].join() === 'Depozit,2', r.text);
const VL = (o) => [Object.assign({ imei: DEV[0].imei, vehicul: ET(0), inMiscare: false, opritLa: '2026-10-02T05:10:00.000Z', ultima: '2026-10-02T09:58:00.000Z', deCelPutin: false }, o || {})];
r = A.raspunde(U('de cât timp staționează B 154 UIP?'), forma('rLocation', LOC0.rows.map((x) => [x[0]].concat(x.slice(2))), { valori: VL() }), X);
T('„de cât timp staționează B 154 UIP?": de cât timp, unde și de când — „azi la 08:10" (adresa, nu șoferul)', /\*\*B 154 UIP · Dacia Logan 3\*\* stă de \*\*4 h 50 min\*\* la \*\*Str\. Lungă 5, Brașov\*\* \(a oprit azi la 08:10\)\./.test(r.text) && r.text.indexOf('Ion Popescu') < 0, r.text);
r = A.raspunde(U('de cât timp staționează B 154 UIP?'), forma('rLocation', [[ET(0), 'Brașov', '01.10.2026, 18:40:00', '15 h 20 min', 'oprit', '9']], { valori: VL() }), X);
const r2 = A.raspunde(U('de cât timp staționează B 154 UIP?'), forma('rLocation', [[ET(0), 'Brașov', '28.09.2026, 18:40:00', '3 zile', 'oprit', '9']], { valori: VL() }), X);
T('…„ieri la 18:40" pentru ieri, „pe 28.09 la 18:40" mai demult (pe ora României)', /\(a oprit ieri la 18:40\)/.test(r.text) && /\(a oprit pe 28\.09 la 18:40\)/.test(r2.text), r.text + ' | ' + r2.text);
const LOCR = [[ET(0), 'Str. Lungă 5, Brașov', '02.10.2026, 08:10:00', '7 zile', 'pornit', '9 (bun)']];
r = A.raspunde(U('unde e B 154 UIP'), forma('rLocation', LOCR, { valori: VL({ deCelPutin: true }) }), Object.assign({}, X, { semnal: () => 'fără semnal de 3 zile' }));
T('…oprirea care ține de la începutul citirii: „de cel puțin", spus și de ce', /stă de \*\*cel puțin 7 zile\*\*/.test(r.text) && r.sugestii.some((x) => x.fel === 'info' && /de și mai mult timp/.test(x.text)), r.text);
T('…contactul pornit cât stă = poate ralanti; aparatul fără semnal = locul e doar ultimul primit (cuvintele Inventarului)', r.sugestii.some((x) => /Contactul e pornit/.test(x.text)) && r.sugestii.some((x) => x.fel === 'atentie' && /Aparatul e fără semnal de 3 zile/.test(x.text)), JSON.stringify(r.sugestii));
r = A.raspunde(U('unde e B 154 UIP'), forma('rLocation', [[ET(0), '44.40000, 26.10000', '—', 'în mișcare', 'pornit', '9 (bun)']], { valori: VL({ inMiscare: true, opritLa: null }) }), X);
T('…în mers: „e în mișcare acum, pe la …"', /e în mișcare acum, pe la \*\*44\.40000, 26\.10000\*\*/.test(r.text) && !r.sugestii.some((x) => /Contactul/.test(x.text)), r.text);
r = A.raspunde(U('unde a parcat B 154 UIP aseară'), forma('rLocation', LOC0.rows.map((x) => [x[0]].concat(x.slice(2))), { valori: VL() }), X);
T('…pe o perioadă trecută („aseară"): la timpul trecut, „la capătul perioadei"', /^La capătul perioadei \(ieri\), \*\*B 154 UIP · Dacia Logan 3\*\* era parcată la/.test(r.text), r.text);
r = A.raspunde(U('unde sunt masinile acum'), forma('rLocation', [[ET(0), 'Brașov', '02.10.2026, 08:10:00', '4 h 50 min', 'oprit', '9'], [ET(2), 'Cluj', '—', 'în mișcare', 'pornit', '9'], [ET(1), 'Ploiești', '30.09.2026, 18:00:00', '1 zi', 'oprit', '9']],
  { valori: [VL()[0], { imei: DEV[2].imei, vehicul: ET(2), inMiscare: true, opritLa: null, ultima: '2026-10-02T09:59:00.000Z' }, { imei: DEV[1].imei, vehicul: ET(1), inMiscare: false, opritLa: '2026-09-30T15:00:00.000Z', ultima: '2026-10-02T09:00:00.000Z' }] }), X);
T('…pe flotă: câte stau, câte merg; cea care stă de cel mai mult timp, prima', /Flota acum: \*\*2 mașini parcate\*\* și \*\*1 mașină în mișcare\*\*/.test(r.text) && r.tabel.randuri[0][0] === 'B 155 UIP · Dacia Logan 2' && r.tabel.randuri[2][0] === 'B 77 RAT · VW Passat B7', r.text + ' ' + JSON.stringify(r.tabel.randuri.map((x) => x[0])));
r = A.raspunde(U('cate masini au fost inactive saptamana asta'), forma('rFleetUptime', [
  [ET(0), '5 zile: …', '0 zile', '10h', 'x', 'Bun (9 sat.)'], [ET(1), '0 zile', '5 zile: …', '5 zile', 'x', 'Inexistent'], [ET(2), '3 zile: …', '2 zile: …', '1 zi', 'x', 'Slab']]), X);
T('disponibilitate: câte au mers zilnic, câte au avut zile fără mers, cine nu transmite', /\*\*1 din 3\*\* au mers în fiecare zi/.test(r.text) && /\*\*2 mașini au avut\*\* zile fără mers/.test(r.text) && r.sugestii.some((s) => /O mașină nu mai transmite: B 155 UIP · Dacia Logan 2/.test(s.text)), r.text);
r = A.raspunde(U('când a transmis ultima dată B 154 UIP'), forma('rFleetUptime', [[ET(0), '5 zile: 28.09.2026, …', '2 zile: 26.09.2026, 27.09.2026', '1 zi  ·  26.09.2026, 18:00 → 27.09.2026, 19:00', '02.10.2026, 12:58:10', 'Bun (9 sat.)']]), X);
T('…pe o mașină: zilele cu mers, pauza cea mai lungă, ultima poziție, semnalul', /a mers în \*\*5 zile\*\*, a stat 2 zile\. Cea mai lungă pauză: 1 zi; ultima poziție: 02\.10, 12:58; semnalul: bun \(9 sat\.\)\./.test(r.text), r.text);
r = A.raspunde(U('emisii luna trecuta'), { summary: { 'CO₂ total (t)': '0.45', 'Consum total (L)': 170, 'Km total': 2300, 'CO₂ mediu (g/km)': 196 } }, X);
T('orice alt raport: sumarul lui, cu virgulă la zecimale („0,45") și „CO₂" scris cum trebuie', /CO₂ total \(t\) \*\*0,45\*\*/.test(r.text) && /km total \*\*2\.300\*\*/.test(r.text), r.text);
T('„de" pus după regula limbii: 1 litru, 12 litri, 20 de litri, 6,8 litri, 101 litri', A.cant(1, 'litru', 'litri') === '1 litru' && A.cant(12, 'litru', 'litri') === '12 litri' && A.cant(20, 'litru', 'litri') === '20 de litri' && A.cant(6.8, 'litru', 'litri', 1) === '6,8 litri' && A.cant(101, 'litru', 'litri') === '101 litri');
const ni = A.neinteles(u4, F);
T('îndoiala: butoane cu numărul (de trimis înapoi) și eticheta mașinii', ni.alege.map((a) => a.trimite).sort().join() === 'B 154 UIP,B 155 UIP' && ni.alege.every((a) => /Dacia Logan/.test(a.text)));
const deCe = U('de ce consumă B 77 RAT atât de mult?');
T('„de ce": cine are RA Insight primește butonul spre el; cine nu — cifrele pe butoane, fără să-i promită RA Insight', A.neinteles(deCe, F, { areInsight: true }).spreInsight === true && !A.neinteles(deCe, F, { areInsight: false }).spreInsight && (A.neinteles(deCe, F, { areInsight: false }).alege || []).length > 0);
// Alin, 07.10: „Gratuit — nu se scade din fondul RA Insight" nu e ok să apară. Niciun text al lui AI Raport nu vorbește
// despre fond sau „gratuit" — nici răspunsurile de mai sus, nici cele pentru întrebările neînțelese.
const TOATE_NE = [deCe, u4, U(''), s3, s5, U('ceva fara sens'), U('ceva fara sens', ctx1)].map((x) => A.neinteles(x, F, { areInsight: true, etRaport: { overrev: 'Supraturații' } }))
  .concat([deCe].map((x) => A.neinteles(x, F, { areInsight: false })));
T('niciun text al lui AI Raport nu spune „fond", „gratuit" sau „se scade"', TOATE_NE.every((x) => !/fond|gratuit|se scade/i.test(JSON.stringify(x))) && !/fond|gratuit|se scade/i.test(JSON.stringify(r)), JSON.stringify(TOATE_NE).match(/.{40}(fond|gratuit).{20}/i));
T('raportul necitit: îl numește pe nume și dă butonul („deschide")', /Raportul \*\*„Supraturații”\*\* nu-l citesc încă aici/.test(A.neinteles(s5, F, { etRaport: { overrev: 'Supraturații' } }).text) && A.neinteles(s5, F, {}).deschide === true);
// AI Raport nu mai citește nicio coloană după poziție (`row[5]`): pe raportul adevărat, „Șofer" le mută cu un loc.
const ARSRC = fs.readFileSync(path.join(__dirname, 'ai_raport.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
T('ai_raport.js nu citește rânduri după poziție (row[N]) — doar după numele coloanei', !/\b(row|prim|ult|z|max)\[\d+\]/.test(ARSRC), (ARSRC.match(/\b(row|prim|ult|z|max)\[\d+\]/) || [])[0]);

// ─── 3. Sursa ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Sursa: fără model, aceleași opțiuni ca ecranul Rapoarte, fără „gratuit"/„fond" pe ecran');
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
T('pagina: fila se numește „AI Raport", FĂRĂ eticheta „GRATUIT" (Alin, 07.10)', /id="rep-tab-btn-insight"[^>]*>[\s\S]{0,120}AI Raport/.test(PAG) && PAG.indexOf('rin-gratis') < 0 && PAG.indexOf('>GRATUIT<') < 0);
// Fila AI Raport și funcțiile ei din pagină: niciun „gratuit", niciun „fond" (fila, intro, răspunsurile).
const filaAR = (PAG.split('<div id="rep-tab-insight"')[1] || '').split('<!-- ═══ Hotspot')[0];
const codAR = (PAG.split('var _rinCtx = null')[1] || '').split('async function rinOpenReport')[0];
T('pagina: fila și codul AI Raport nu spun „gratuit", „fond" sau „se scade"', filaAR.length > 300 && codAR.length > 2000 && !/gratuit|fond|se scade/i.test(filaAR.replace(/<!--[\s\S]*?-->/g, '')) && !/gratuit|fondul|se scade/i.test(codAR.replace(/\/\/[^\n]*/g, '')), (codAR.match(/.{30}(gratuit|fondul).{20}/i) || [])[0]);
T('serverul nu mai trimite `gratuit: true` în răspunsurile AI Raport', ruta.indexOf('gratuit') < 0);
T('pagina: o întrebare gata făcută pornește de la zero (e despre flotă); butoanele din răspuns țin minte discuția', /b\.onclick = function \(\) \{ rinAsk\(String\(q\.text \|\| ''\), true\); \};/.test(PAG) && /context: deLaZero \? \{\} : \(_rinCtx \|\| \{\}\)/.test(PAG) && /function \(t\) \{ rinAsk\(t\); \}/.test(PAG));
T('pagina: raportul pe care AI Raport nu-l citește are butonul „Deschide raportul" (același cu cel de sub răspunsuri)', /if \(j\.sursa && j\.sursa\.type\) w\.appendChild\(_rinButonRaport\(j\.sursa\)\)/.test(PAG) && /if \(j\.sursa && j\.sursa\.type\) acts\.appendChild\(_rinButonRaport\(j\.sursa\)\)/.test(PAG));
T('serverul: întrebarea neînțeleasă întoarce ce s-a ținut minte (mașina), iar după răspuns discuția vine din ai_raport.js', /context: u\.context \|\| ctx/.test(ruta) && /context: aiRaport\.contextul\(u, from, to\)/.test(ruta));
T('serverul: „Unde e acum" spune vechimea locului cu ACELEAȘI cuvinte ca Inventarul (_invSemnalText), nu cu praguri noi', /semnal: _invSemnalText/.test(ruta));
// Chatul modern (08.10): caseta rotundă cu Mașina / Perioada / Raport, continuările sub răspuns, Copiază — aceleași piese ca RA Insight.
T('pagina: caseta AI Raport are Mașina, Perioada, Raport și butonul rotund de trimis', /onclick="rinAlegeMasina\(this\)"/.test(PAG) && /onclick="rinAlegePerioada\(this\)"/.test(PAG) && /onclick="rinAlegeRaport\(this\)"/.test(PAG) && /class="chat-trimite gol" id="rin-send"/.test(PAG));
T('pagina: continuările și Copiază vin din piesele COMUNE ale chatului (o singură scriere, folosită și de RA Insight)', (PAG.match(/window\._chatUrmari = function/g) || []).length === 1 && /wrap\.appendChild\(window\._chatUrmari\(urm, function \(t\) \{ rinAsk\(t\); \}\)\)/.test(PAG) && /bub\.appendChild\(window\._chatActiuni\(String\(x\.text \|\| ''\)\)\)/.test(PAG));
T('serverul: subiectele butonului „Raport" vin din ai_raport.js (nu sunt scrise în pagină)', /subiecte: aiRaport\.ALEGERI_RAPORT\.map/.test(SRV) && PAG.indexOf('costurile cu combustibilul') < 0);
T('pagina: textele venite de la server trec prin textContent sau prin rinMd (care curăță)', /tx\.innerHTML = rinMd\(String\(x\.text/.test(PAG) && /bub\.innerHTML = rinMd\(String\(j\.text/.test(PAG) && /it\.appendChild\(el\('span', null, s\.text\)\)/.test(PAG));

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
  // …apoi B 154 UIP stă pe loc (contact oprit) de 38 de minute — pentru „de cât timp staționează".
  const latStat = 44.40 + 19 * 1.0 / 111, t0Stat = Date.now() - 38 * 60000;
  for (let i = 0; i < 10; i++) await json('POST', '/api/test/simulate', S, { imei: DEV[0].imei, ts: new Date(t0Stat + i * 4 * 60000).toISOString(), lat: latStat, lng: 26.10, speed: 0, io: { ignition: 0 } });
  await drum(DEV[2].imei, acumOOra, 15, 1.0);
  await drum('350000000051009', acumOOra, 15, 1.0);
  const fond0 = (await json('GET', '/api/ai/quota', ckSef)).j.used;

  // a) întrebările gata făcute
  const iq = await json('GET', '/api/reports/ai-raport/intrebari', ckAlt);
  T('întrebările gata făcute: și pentru firma FĂRĂ RA Insight', iq.status === 200 && iq.j.intrebari.length === A.INTREBARI_GATA.length);

  // b) cifrele = cifrele raportului
  const q1 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'Câți km a făcut B 154 UIP săptămâna trecută?' });
  T('răspunde cu sursa: Index km / ore, pe B 154 UIP (fără vreun „gratuit" în răspuns)', q1.status === 200 && !('gratuit' in q1.j) && q1.j.sursa && q1.j.sursa.type === 'utilization' && (q1.j.sursa.imeis || []).join() === DEV[0].imei, q1.text.slice(0, 200));
  const rap = await json('GET', '/api/reports/utilization?imei=' + DEV[0].imei + '&from=' + encodeURIComponent(q1.j.sursa.from) + '&to=' + encodeURIComponent(q1.j.sursa.to), ckSef);
  const kmRap = rap.j.valori && rap.j.valori[0] && rap.j.valori[0].km;
  T('cifra din răspuns e cifra raportului „Index km / ore" pe aceeași perioadă (' + kmRap + ' km)', kmRap > 20 && (q1.j.raspuns.tiles[0] || {}).val === A.nr(kmRap), JSON.stringify(q1.j.raspuns.tiles) + ' vs ' + kmRap);
  T('„Am înțeles" vine cu răspunsul (subiect, mașină, perioadă)', (q1.j.inteles || []).map((x) => x.tip).join() === 'subiect,masina,perioada');
  // c) continuarea, cu contextul întors de server
  const q2 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'și săptămâna asta?', context: q1.j.context });
  T('„și săptămâna asta?" continuă pe B 154 UIP, cu „ținut minte"', q2.status === 200 && (q2.j.sursa.imeis || []).join() === DEV[0].imei && (q2.j.inteles || []).some((x) => x.mem && x.tip === 'masina'), q2.text.slice(0, 200));
  const toate = [q1.text, q2.text];   // la final: niciun răspuns nu vorbește de „gratuit" sau de fond
  // c2) întrebarea lui Alin din 07.10, pe server: „de cât timp staționează" = cifrele raportului „Ultima locație"
  const ql = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'de cat timp stationeaza b 154 uip?' });
  toate.push(ql.text);
  const rl = ql.j.sursa ? await json('GET', '/api/reports/location?imei=' + DEV[0].imei + '&from=' + encodeURIComponent(ql.j.sursa.from) + '&to=' + encodeURIComponent(ql.j.sursa.to), ckSef) : { j: {} };
  const colL = (rl.j.columns || []).indexOf('Staționează de'), colO = (rl.j.columns || []).indexOf('A oprit la'), colLoc = (rl.j.columns || []).indexOf('Locație (unde a oprit)');
  const rowL = (rl.j.rows || [])[0] || [];
  const minR = parseInt(String(rowL[colL] || ''), 10), mL = /stă de \*\*(\d+) min\*\*/.exec((ql.j.raspuns || {}).text || '');
  const opritR = /^(\d{2})\.(\d{2})\.\d{4}, (\d{2}:\d{2})/.exec(String(rowL[colO] || ''));
  T('„de cat timp stationeaza b 154 uip?" → Ultima locație pe B 154 UIP, cu „acum" în „Am înțeles"', ql.status === 200 && ql.j.sursa && ql.j.sursa.type === 'location' && (ql.j.sursa.imeis || []).join() === DEV[0].imei && (ql.j.inteles || []).some((x) => x.tip === 'perioada' && x.text === 'acum'), ql.text.slice(0, 240));
  T('…„stă de N min" = coloana „Staționează de" a raportului (' + rowL[colL] + '), iar ora opririi = „A oprit la" (azi; ieri lângă miezul nopții)', colL > 1 && mL && Math.abs(+mL[1] - minR) <= 1 && minR >= 35 && minR <= 40 && opritR && new RegExp('\\(a oprit (azi|ieri) la ' + opritR[3] + '\\)').test(ql.j.raspuns.text), (ql.j.raspuns || {}).text + ' | raport: ' + JSON.stringify(rowL));
  T('…locul din răspuns e locul din raport (nu șoferul, cum ar fi ieșit citind după poziție)', colLoc > 1 && ql.j.raspuns.text.indexOf('la **' + rowL[colLoc] + '**') > 0, JSON.stringify(rowL));
  T('…discuția nu ține minte o perioadă după „acum"', ql.j.context && ql.j.context.perioada === null && (ql.j.context.masini || []).join() === DEV[0].imei, JSON.stringify(ql.j.context));
  // c3) doar mașina → butoane; apoi „din raport stationari" → pe mașina aceea, cu cifrele raportului „Staționări"
  const qm = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'B 154 UIP' });
  toate.push(qm.text);
  T('doar „B 154 UIP" → „Ce vrei să afli despre B 154 UIP?", cu butoane și mașina ținută minte', qm.status === 200 && qm.j.neinteles && qm.j.motiv === 'doar_masina' && (qm.j.alege || []).length === A.PE_MASINA.length && (qm.j.context.masini || []).join() === DEV[0].imei, qm.text.slice(0, 240));
  const qs = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'din raport stationari', context: qm.j.context });
  toate.push(qs.text);
  const rs = qs.j.sursa ? await json('GET', '/api/reports/stops?imei=' + DEV[0].imei + '&from=' + encodeURIComponent(qs.j.sursa.from) + '&to=' + encodeURIComponent(qs.j.sursa.to), ckSef) : { j: {} };
  const nOpr = rs.j.summary && rs.j.summary['Opriri'];
  T('…„din raport stationari" → Staționări pe B 154 UIP (Alin: primea toată flota), mașina „ținută minte"', qs.status === 200 && qs.j.sursa && qs.j.sursa.type === 'stops' && (qs.j.sursa.imeis || []).join() === DEV[0].imei && (qs.j.inteles || []).some((x) => x.mem && x.tip === 'masina'), qs.text.slice(0, 240));
  T('…cu numărul de opriri al raportului „Staționări" (' + nOpr + ')', nOpr > 0 && ((qs.j.raspuns || {}).tiles || []).some((x) => x.et === 'Opriri' && x.val === A.nr(nOpr)), JSON.stringify((qs.j.raspuns || {}).tiles) + ' vs ' + nOpr);
  const urmS = (qs.j.raspuns || {}).urmari || [];
  const fisaSrv = I.fisaFlotei(DEV, {});
  T('…și sub răspuns, 1–3 întrebări de continuare, fiecare înțeleasă cu discuția întoarsă de server', urmS.length >= 1 && urmS.length <= 3 && urmS.every((x) => A.intelege(x.trimite, qs.j.context, fisaSrv, Date.now()).ok), JSON.stringify(urmS));
  const iqS = await json('GET', '/api/reports/ai-raport/intrebari', ckSef);
  T('butonul „Raport": lista vine de la server, aceeași ca în ai_raport.js', (iqS.j.subiecte || []).length === A.ALEGERI_RAPORT.length && iqS.j.subiecte.every((x, i) => x.pune === A.ALEGERI_RAPORT[i].pune), (iqS.j.subiecte || []).length);
  // c4) un raport pe care AI Raport nu-l citește: butonul lui, cu mașina și perioada
  const qa = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'supraturații la B 154 UIP săptămâna asta' });
  toate.push(qa.text);
  T('„supraturații la B 154 UIP" → butonul raportului „Supraturații", pe B 154 UIP (nu „nu am înțeles")', qa.j.neinteles && qa.j.motiv === 'alt_raport' && qa.j.sursa && qa.j.sursa.type === 'overrev' && (qa.j.sursa.imeis || []).join() === DEV[0].imei && /Supraturații/.test(qa.j.text || ''), qa.text.slice(0, 240));
  // d) îndoiala
  const q3 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'consumul Loganului luna trecută' });
  T('„Loganul" → butoane cu cele două Logan, fără raport rulat', q3.j.neinteles && q3.j.motiv === 'ambiguu' && (q3.j.alege || []).map((a) => a.trimite).sort().join() === 'B 154 UIP,B 155 UIP', q3.text.slice(0, 200));
  const q3b = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'B 155 UIP', context: q3.j.context });
  const lunaTrec = I.perioada({ period: 'last_month' }, Date.now());
  T('…butonul „B 155 UIP" primește răspunsul întrebării: consumul lui B 155 UIP, luna trecută', q3b.status === 200 && q3b.j.sursa && q3b.j.sursa.type === 'consumption' && (q3b.j.sursa.imeis || []).join() === DEV[1].imei && Date.parse(q3b.j.sursa.from) === Date.parse(lunaTrec.from), q3b.text.slice(0, 240));
  toate.push(q3.text, q3b.text);
  const q4 = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'de ce consumă B 77 RAT atât?' });
  T('„de ce" → trimite la RA Insight (spreInsight), cui are loc RA Insight', q4.j.neinteles && q4.j.spreInsight === true);
  const q4b = await json('POST', '/api/reports/ai-raport', ckAlt, { text: 'de ce consumă atât?' });
  T('…în firma FĂRĂ RA Insight nu-l trimite acolo (nu-i promite ce nu are): îi dă butoane cu cifre', q4b.j.neinteles && !q4b.j.spreInsight && (q4b.j.alege || []).length > 0, q4b.text.slice(0, 200));
  toate.push(q4.text, q4b.text);
  // d2) ce expiră, pe raportul adevărat: un ITP peste 3 zile la B 154 UIP, un RCA expirat acum 5 zile la B 77 RAT
  const ziISO = (ms) => new Date(ms).toISOString().slice(0, 10);
  const d1 = await json('POST', '/api/documents', ckSef, { imei: DEV[0].imei, doc_type: 'ITP', expiry_date: ziISO(Date.now() + 3 * 86400000) });
  const d2 = await json('POST', '/api/documents', ckSef, { imei: DEV[2].imei, doc_type: 'RCA', expiry_date: ziISO(Date.now() - 5 * 86400000) });
  const qe = await json('POST', '/api/reports/ai-raport', ckSef, { text: 'Ce expiră pe flotă în următoarele 30 de zile' });
  toate.push(qe.text);
  const re2 = qe.j.sursa ? await json('GET', '/api/reports/due?from=' + encodeURIComponent(qe.j.sursa.from) + '&to=' + encodeURIComponent(qe.j.sursa.to), ckSef) : { j: {} };
  const colS = (re2.j.columns || []).indexOf('Stare');
  const nCrit = (re2.j.rows || []).filter((x) => /^(critic|curând)/i.test(String(x[colS]))).length, nDep = (re2.j.rows || []).filter((x) => /^depășit/i.test(String(x[colS]))).length;
  T('ce expiră, pe raportul adevărat (cu „Șofer" pe locul 2): ITP-ul de peste 3 zile și RCA-ul expirat sunt numărate', d1.status === 200 && d2.status === 200 && colS === 6 && nCrit >= 1 && nDep >= 1 &&
    ((qe.j.raspuns || {}).tiles || []).some((x) => x.et === 'De urmărit' && x.val === A.nr(nCrit)) && ((qe.j.raspuns || {}).tiles || []).some((x) => x.et === 'Deja expirate' && x.val === A.nr(nDep)) &&
    (qe.j.raspuns.tabel || { randuri: [] }).randuri.some((x) => x[1] === 'ITP' && /^critic/i.test(x[3])) && (qe.j.raspuns.tabel || { randuri: [] }).randuri.some((x) => x[1] === 'RCA' && /^depășit/i.test(x[3])), (qe.j.raspuns || {}).text + ' ' + JSON.stringify((qe.j.raspuns || {}).tabel) + ' col ' + colS);
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
  T('niciun răspuns al serverului (' + toate.length + ') nu spune „gratuit", „fondul" sau „se scade"', toate.length >= 10 && toate.every((x) => !/gratuit|fondul|se scade/i.test(x)), (toate.join(' ').match(/.{40}(gratuit|fondul|se scade).{20}/i) || [])[0]);

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
