// verify_cereri_echipa.js — „Anunță echipa RA Track" (capitolul 4 al machetei din 21.10; Alin, 22.10: „da" la flux, „te sunăm
// în cel mult o zi lucrătoare", cererile le preiau amândoi fondatorii, cu „Preiau").
//
// Ce păzește:
//   1. regula (cereri_echipa.js, curată): ce se primește de la ecran, ce lipsește, titlul („Nu transmite de 3 ore"), duratele
//      românești, pașii (trimisă → preluată → programată → rezolvată), ce vede clientul (fără datele aparatului) și ce vedem noi,
//      „Pare rezolvată singură", mesajul programării, emailurile și anunțurile — fără vină pe aparat;
//   2. pagina: O fereastră și O cerere de trimitere, deschisă din trei locuri (caseta din RA Insight, fișa mașinii, iconița cu
//      căști); fereastra veche „Suport clienți" (cu un telefon și un WhatsApp care nu erau ai noștri) a plecat; „Cereri de la
//      clienți" la noi, cu textele de la server prin esc(); intervențiile în Calendarul de montaj; culorile pe ambele teme;
//   3. pe server pornit (Brevo fals): tot drumul — cererea, a doua pe aceeași problemă (409, „se ocupă deja"), mașina tăcută
//      devenită „Nu transmite", drepturile (firma omului, administratorul vede tot, ceilalți pe ale lor), emailul la contact@ cu
//      datele aparatului, „Preiau" o singură dată, „Programez" (cu intervenția în calendar), „Rezolvat", „Redeschide", anunțurile
//      la client, „Pare rezolvată singură", plafonul pe oră, ruta veche a telefonului.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const CE = require('./cereri_echipa');
const probleme = require('./probleme');

let ok = 0, rele = 0;
function T(nume, cond, detalii) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detalii !== undefined ? '  → ' + String(detalii).slice(0, 500) : '')); }
}
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
const MOD = fs.readFileSync(path.join(__dirname, 'cereri_echipa.js'), 'utf8');
const MT = fs.readFileSync(path.join(__dirname, 'public', 'js', 'map-tools.js'), 'utf8');
const bloc = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────
console.log('1. Regula (cereri_echipa.js)');
const acum = Date.parse('2026-10-22T07:42:00Z');   // joi, 22.10, 10:42 ora României
T('duratele: „un minut", „45 de minute", „o oră", „3 ore", „21 de ore", „o zi", „3 zile", „25 de zile"',
  CE.durata(1) === 'un minut' && CE.durata(45) === '45 de minute' && CE.durata(60) === 'o oră' && CE.durata(185) === '3 ore' && CE.durata(21 * 60) === '21 de ore' &&
  CE.durata(1440) === 'o zi' && CE.durata(3 * 1440 + 5) === '3 zile' && CE.durata(25 * 1440) === '25 de zile', [1, 45, 60, 185, 1260, 1440, 4325, 36000].map(CE.durata).join(' | '));
T('ora României: „azi, 10:42", „ieri, 16:20", „14.10, 09:15"; ziua scrisă „vineri, 23.10"',
  CE.cand(acum, acum) === 'azi, 10:42' && CE.cand(Date.parse('2026-10-21T13:20:00Z'), acum) === 'ieri, 16:20' && CE.cand(Date.parse('2026-10-14T06:15:00Z'), acum) === '14.10, 09:15' &&
  CE.ziScrisa('2026-10-23') === 'vineri, 23.10' && CE.ziPlus('2026-10-31', 1) === '2026-11-01');
T('ziua propusă la „Programez" = următoarea zi lucrătoare: joi → vineri, vineri / sâmbătă / duminică → luni',
  CE.ziLucratoareDupa('2026-10-22') === '2026-10-23' && CE.ziLucratoareDupa('2026-10-23') === '2026-10-26' && CE.ziLucratoareDupa('2026-10-24') === '2026-10-26' && CE.ziLucratoareDupa('2026-10-25') === '2026-10-26' &&
  /maine: cereriEchipa\.ziLucratoareDupa\(azi\)/.test(SRV));
const c0 = CE.curata({ problema: 'consum', imei: '350000000091001', ce: '  Pe 1–21 octombrie   nivelul a stat la 22 L.  ', mesaj: 'A fost la service.\r\n', cand: ['dimineata', 'dimineata', 'noaptea'], unde: 'Strada Fabricii 12', telefon: '0722 345 678 <b>', sursa: 'insight', x: 1 });
T('ce primește serverul, curățat: problema știută, IMEI-ul de cifre, „când" doar din listă (fără dubluri), telefonul fără litere, „ce" pe un rând',
  c0.problema === 'consum' && c0.imei === '350000000091001' && JSON.stringify(c0.cand) === '["dimineata"]' && c0.telefon === '0722 345 678' && c0.ce === 'Pe 1–21 octombrie nivelul a stat la 22 L.' &&
  c0.mesaj === 'A fost la service.' && c0.sursa === 'insight' && !('x' in c0), JSON.stringify(c0));
T('…„ce" (scris de aplicație în casetă) se păstrează doar la consum; o problemă necunoscută e „o întrebare"; o sursă necunoscută e iconița',
  CE.curata({ problema: 'semnal', ce: 'orice' }).ce === '' && CE.curata({ problema: 'hack' }).problema === 'alta' && CE.curata({ sursa: 'x' }).sursa === 'suport' && CE.curata({ imei: '12ab' }).imei === null);
T('ce lipsește: mașina la problemele unei mașini, mesajul la „o întrebare"',
  CE.lipsa(CE.curata({ problema: 'consum' })) === 'Alege mașina.' && CE.lipsa(CE.curata({ problema: 'alta' })) === 'Scrie pe scurt ce s-a întâmplat sau ce vrei să ne întrebi.' &&
  CE.lipsa(CE.curata({ problema: 'alta', mesaj: 'Cum pun RCA-ul?' })) === null && CE.lipsa(CE.curata({ problema: 'aparat', imei: '350000000091001' })) === null);
T('titlul: „Consumul nu se poate măsura", „Nu transmite de 3 ore", „Ceva nu merge la aparat", „O întrebare pentru echipă"',
  CE.titlu('consum') === 'Consumul nu se poate măsura' && CE.titlu('semnal', { tacutMin: 190 }) === 'Nu transmite de 3 ore' && CE.titlu('aparat') === 'Ceva nu merge la aparat' && CE.titlu('alta') === 'O întrebare pentru echipă');
T('„ce s-a întâmplat" la o mașină tăcută: ultima poziție, cu adresa; fără poziție: „n-a transmis încă nicio poziție"',
  CE.ceSemnal({ ultima: Date.parse('2026-10-22T04:40:00Z'), adresa: 'Strada Fabricii 12, București', acum }) === 'Ultima poziție: azi, 07:40, Strada Fabricii 12, București.' &&
  CE.ceSemnal({}) === 'Mașina n-a transmis încă nicio poziție.');
const cer = { id: 142, company_id: 7, company_name: 'Transport Ionescu SRL', user_id: 11, imei: '350000000091001', plate: 'B 154 UIP', masina: 'Dacia Logan 3', problema: 'consum',
  titlu: 'Consumul nu se poate măsura', ce: 'Pe 1–21 octombrie nivelul din rezervor a stat la 22 L.', mesaj: 'Mașina a fost la service pe 2 octombrie.', sursa: 'insight',
  cand: { cand: ['dimineata'], unde: 'Strada Fabricii 12, Sector 6, București' }, contact: { nume: 'Ana Pop', rol: 'admin companie', telefon: '0722 345 678', email: 'ana.pop@ionescu.ro' },
  aparat: { imei: '350000000091001', model: 'FMC130', sim: '0744 123 456', ultima: acum - 60000, gsm: 4, sateliti: 11, tensiune: 13.9, rezervor: 22, pornit: Date.parse('2026-03-12T09:00:00Z'), instalator: 'Montaj Rapid' },
  stare: 'trimisa', creat_la: acum, trimisa_de_nume: 'Ana Pop' };
T('confirmarea (E3): „Am trimis cererea nr. 142." + „B 154 UIP · Consumul nu se poate măsura · azi, 10:42"',
  CE.confirmare(cer, acum).titlu === 'Am trimis cererea nr. 142.' && CE.confirmare(cer, acum).sub === 'B 154 UIP · Consumul nu se poate măsura · azi, 10:42');
T('caseta după trimitere (E3c): „Echipa RA Track se ocupă · cererea nr. 142 · trimisă azi, 10:42"; preluată „… de Robert"; programată „… vineri, 23.10"',
  CE.seOcupa(cer, acum) === 'Echipa RA Track se ocupă · cererea nr. 142 · trimisă azi, 10:42' &&
  CE.seOcupa(Object.assign({}, cer, { stare: 'preluata', preluata_la: acum + 600000, preluata_de_nume: 'Robert Gherbali' }), acum + 600000) === 'Echipa RA Track se ocupă · cererea nr. 142 · preluată azi, 10:52 de Robert' &&
  CE.seOcupa(Object.assign({}, cer, { stare: 'programata', programare: { zi: '2026-10-23' } }), acum) === 'Echipa RA Track se ocupă · cererea nr. 142 · programată vineri, 23.10');
const p1 = CE.pasi(cer, acum);
T('pașii (E3): Trimisă (cu ora și cine) bifată, apoi ce înseamnă fiecare pas care urmează',
  p1.map((x) => x.eticheta + (x.gata ? '✓' : '')).join(' ') === 'Trimisă✓ Preluată Programată Rezolvată' && p1[0].detaliu === 'azi, 10:42 · de Ana Pop' &&
  p1[1].detaliu === CE.PASI.preluata && p1[2].detaliu === CE.PASI.programata && p1[3].detaliu === CE.PASI.rezolvata, JSON.stringify(p1));
const rez = Object.assign({}, cer, { stare: 'rezolvata', preluata_la: acum + 1, preluata_de_nume: 'Alin Tilvar', rezolvata_la: acum + 2, rezolvata_de_nume: 'Alin Tilvar', raspuns: 'Am schimbat cartela SIM.' });
const p2 = CE.pasi(rez, acum);
T('rezolvată fără programare: „Programată" rămâne sărită („n-a fost nevoie să venim la mașină"), „Rezolvată" cu ce i-am scris',
  p2[2].sarit === true && p2[2].gata === false && p2[2].detaliu === 'n-a fost nevoie să venim la mașină' && p2[3].gata && /: „Am schimbat cartela SIM\.”$/.test(p2[3].detaliu), JSON.stringify(p2));
const pc = CE.pentruClient(cer, acum, { eu: 99 });
T('„Cererile tale" (E3b): „Nr. 142 · B 154 UIP", eticheta, „Trimisă azi, 10:42. Te sunăm…", trimisă de un coleg — FĂRĂ datele aparatului și fără contactul nostru',
  pc.cap === 'Nr. 142 · B 154 UIP' && pc.eticheta === 'Trimisă' && pc.detaliu === 'Trimisă azi, 10:42. ' + CE.TERMEN && pc.deAltcineva === 'trimisă de Ana Pop' && pc.deschisa === true &&
  !('aparat' in pc) && JSON.stringify(pc).indexOf('FMC130') < 0 && JSON.stringify(pc).indexOf('0744') < 0, JSON.stringify(pc));
T('…rezolvată: „DD.LL: „ce i-am scris” · Alin Tilvar, RA Track"', /^\d\d\.\d\d: „Am schimbat cartela SIM\.” · Alin Tilvar, RA Track$/.test(CE.pentruClient(rez, acum, { eu: 11 }).detaliu) && CE.pentruClient(rez, acum, { eu: 11 }).deAltcineva === null);
const pn = CE.pentruNoi(cer, acum, { ultima: acum - 60000 });
T('la noi (E4): firma, mașina lungă, eticheta „nouă", cine (cu rolul), telefonul, emailul, de unde, ce s-a întâmplat, „când se poate"',
  pn.cap === 'Nr. 142 · Transport Ionescu SRL' && pn.vehicul === 'B 154 UIP · Dacia Logan 3' && pn.tag.text === 'nouă' && pn.cine === 'Ana Pop, admin companie' && pn.telefon === '0722 345 678' &&
  pn.sursa === 'din caseta „Consumul nu se poate măsura”, în RA Insight' && pn.candText === 'dimineața · Strada Fabricii 12, Sector 6, București' &&
  JSON.stringify(pn.butoane) === '["preiau","programez","rezolvat"]', JSON.stringify(pn).slice(0, 400));
const ap = pn.aparat.map((x) => x.l + ': ' + x.v);
T('…datele aparatului, doar pentru noi: Teltonika FMC130 · IMEI, cartela, ultima poziție, semnalul („11 sateliți"), alimentarea „13,9 V", rezervorul, de când transmite, instalatorul',
  ap[0] === 'Aparat: Teltonika FMC130 · IMEI 350000000091001' && ap.indexOf('Cartela: 0744 123 456') >= 0 && ap.indexOf('Semnal: GSM 4/5 · 11 sateliți') >= 0 && ap.indexOf('Alimentare: 13,9 V') >= 0 &&
  ap.indexOf('Rezervor: 22 L') >= 0 && ap.indexOf('Transmite de pe: 12.03.2026') >= 0 && ap.indexOf('Instalator: Montaj Rapid') >= 0, ap.join(' | '));
T('butoanele după stare: preluată → Programez / Rezolvat; programată → la fel; rezolvată → doar Redeschide',
  JSON.stringify(CE.pentruNoi(Object.assign({}, cer, { stare: 'preluata' }), acum).butoane) === '["programez","rezolvat"]' &&
  JSON.stringify(CE.pentruNoi(Object.assign({}, cer, { stare: 'programata', programare: { zi: '2026-10-23', intervalText: '9:00 – 12:00', partener_nume: 'Montaj Rapid', mesaj: 'm', in_calendar: true } }), acum).butoane) === '["programez","rezolvat"]' &&
  JSON.stringify(CE.pentruNoi(rez, acum).butoane) === '["redeschide"]');
const sem = Object.assign({}, cer, { problema: 'semnal', titlu: 'Nu transmite de 3 ore' });
T('„Pare rezolvată singură": doar la „nu transmite", când mașina a transmis DUPĂ cerere (nu înainte, nu după rezolvare)',
  CE.pareRezolvata(sem, acum + 3600000, acum + 3600000) === 'Pare rezolvată singură: transmite din nou de azi, 11:42.' && CE.pareRezolvata(sem, acum - 1000, acum) === null &&
  CE.pareRezolvata(cer, acum + 3600000, acum) === null && CE.pareRezolvata(Object.assign({}, sem, { stare: 'rezolvata' }), acum + 3600000, acum) === null);
T('mesajul programării, dacă nu scriem altul: „Vineri, 23.10, între 9 și 12, vine instalatorul la Strada Fabricii 12."',
  CE.mesajProgramare({ zi: '2026-10-23', interval: '9-12', unde: 'Strada Fabricii 12' }) === 'Vineri, 23.10, între 9 și 12, vine instalatorul la Strada Fabricii 12.' &&
  CE.mesajProgramare({ zi: '2026-10-26', interval: 'zi' }) === 'Luni, 26.10, în cursul zilei, vine instalatorul.');
const em = CE.emailNoi(Object.assign({}, cer, { mesaj: '<script>x</script>' }), { acum, link: 'https://ratrack.ro/app' });
T('emailul la noi (E5): subiectul „Cerere 142 · Transport Ionescu SRL · B 154 UIP · Consumul nu se poate măsura", datele aparatului, linkul, textul clientului scăpat',
  em.subject === 'Cerere 142 · Transport Ionescu SRL · B 154 UIP · Consumul nu se poate măsura' && /Datele aparatului/.test(em.html) && /IMEI 350000000091001/.test(em.html) &&
  /href="https:\/\/ratrack\.ro\/app"/.test(em.html) && em.html.indexOf('<script>') < 0 && /&lt;script&gt;/.test(em.html) && /Răspunde la acest email ca să-i scrii direct Ana Pop\./.test(em.html) &&
  /Datele aparatului:\nAparat: Teltonika FMC130/.test(em.text), em.subject);
T('…o întrebare fără mașină: fără rândul mașinii și fără datele aparatului', !/Datele aparatului/.test(CE.emailNoi({ id: 9, company_name: 'X SRL', problema: 'alta', mesaj: 'Cum pun RCA-ul?', contact: { nume: 'Ana' }, sursa: 'suport' }, {}).html) &&
  CE.emailNoi({ id: 9, company_name: 'X SRL', problema: 'alta', mesaj: 'm', contact: {}, sursa: 'suport' }, {}).subject === 'Cerere 9 · X SRL · O întrebare pentru echipă');
T('anunțurile la noi: „Cerere nouă nr. 142 · Transport Ionescu SRL" — fără date tehnice', CE.anuntNoi(cer).titlu === 'Cerere nouă nr. 142 · Transport Ionescu SRL' && CE.anuntNoi(cer).corp === 'B 154 UIP · Consumul nu se poate măsura · Ana Pop');
const prel = Object.assign({}, cer, { preluata_de_nume: 'Robert Gherbali' });
T('anunțurile la client: preluată („Te sună Robert Gherbali, din echipa RA Track, în cel mult o zi lucrătoare."), programată (mesajul), rezolvată (ce i-am scris)',
  CE.anuntClient(prel, 'preluata').corp === 'B 154 UIP · Consumul nu se poate măsura. Te sună Robert Gherbali, din echipa RA Track, în cel mult o zi lucrătoare.' &&
  CE.anuntClient(cer, 'preluata').corp === 'B 154 UIP · Consumul nu se poate măsura. Te sună cineva din echipa RA Track în cel mult o zi lucrătoare.' &&
  CE.anuntClient(Object.assign({}, cer, { programare: { mesaj: 'Vineri, 23.10, între 9 și 12, vine instalatorul.' } }), 'programata').corp === 'B 154 UIP · Consumul nu se poate măsura. Vineri, 23.10, între 9 și 12, vine instalatorul.' &&
  CE.anuntClient(rez, 'rezolvata').corp === 'B 154 UIP · Consumul nu se poate măsura. „Am schimbat cartela SIM.”' && CE.anuntClient(cer, 'redeschisa') === null);
T('…și emailul la client: „Bună ziua, Ana," + același text + unde găsește cererea', /^Bună ziua, Ana,\n\nB 154 UIP/.test(CE.emailClient(prel, 'preluata').text) && /„Cererile tale”/.test(CE.emailClient(prel, 'preluata').text) &&
  CE.emailClient(prel, 'preluata').subject === 'Am preluat cererea nr. 142 · RA Track');
const toate = [CE.TERMEN, CE.LA_FIECARE_PAS, CE.NOTA_CASETA, CE.NOTA_DUPA, CE.NOTA_TRIMISA, CE.DATE_TRIMISE, CE.DATE_TRIMISE_FARA_MASINA, CE.PASI.preluata, CE.PASI.programata, CE.PASI.rezolvata].join(' ');
T('ce vede clientul NU-l trimite la echipament și nu promite ce nu facem (fără „verifică", „senzorul", „pe ultimele 30 de zile")',
  !/verific|senzor|calibr|cablu|montaj greșit|pe ultimele 30 de zile/i.test(toate) && /Aparatul e treaba noastră/.test(CE.NOTA_CASETA) && CE.TERMEN === 'Te sunăm în cel mult o zi lucrătoare.', toate);
T('modulul e curat: fără bază, fără rețea, un singur formatator de dată ținut minte', !/require\(['"]\.\/db|require\(['"]http|fetch\(/.test(MOD) && (MOD.match(/new Intl\.DateTimeFormat\(/g) || []).length === 1);
const ps = probleme.problemaSemnal({ vehicul: 'B 268 ROY', imei: '350000000091002', tacutMin: 3 * 1440 + 30, ultima: acum - 3 * 86400000, adresa: 'Turda' }, acum);
T('caseta „nu transmite" (E1): titlul, ultima poziție, ce poate face omul singur, „Pe hartă" + „Anunță echipa RA Track", nota — fără vină pe aparat',
  ps.titlu === 'B 268 ROY nu transmite de 3 zile' && /^Ultima poziție: 19\.10, 10:42, Turda\. Dacă ar trebui să fie pe drum, sună șoferul\./.test(ps.dovada) &&
  ps.butoane.map((b) => b.fel).join(',') === 'harta,echipa' && ps.butoane[1].text === CE.BUTON && ps.butoane[1].problema === 'semnal' && ps.nota === CE.NOTA_CASETA &&
  !/aparatul (e|este) (stricat|defect)|verific/i.test(ps.dovada), ps.dovada);
const pz = probleme.problemaSenzor({ vehicul: 'B 154 UIP', imei: '350000000091001', km: 1617, nivelStart: 22, consumFisa: 8.5 }, { from: 1, to: 2, eticheta: '1–21 octombrie' });
T('caseta „consumul nu se poate măsura": „Anunță echipa RA Track" PRIMUL (problema „consum"), apoi raportul de consum, cu nota', pz.butoane[0].fel === 'echipa' && pz.butoane[0].problema === 'consum' && pz.butoane[1].fel === 'raport' && pz.nota === CE.NOTA_CASETA);

// ─── 2. Pagina ──────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Pagina');
const PB = bloc(PAG, '// ── începe „Anunță echipa RA Track"', '// ── sfârșit „Anunță echipa RA Track"');
T('fereastra clientului stă într-un singur bloc, cu O singură cerere de trimitere (POST /api/cereri-echipa) în toată pagina',
  PB.length > 2000 && (PAG.match(/cere\('POST', '\/api\/cereri-echipa'/g) || []).length === 1 && (PAG.match(/'\/api\/cereri-echipa'/g) || []).length === 2 && (PAG.match(/id = 'ce-ov'|o\.id = 'ce-ov'/g) || []).length === 1);
T('…textele (termenul, ce se trimite, pașii, „Cererile tale") vin de la server și se pun ca TEXT (fără innerHTML în bloc)',
  PB.indexOf('innerHTML') < 0 && PB.indexOf('Te sunăm în cel mult o zi lucrătoare') < 0 && PB.indexOf('Trimitem singuri') < 0 && /m\.termen, m\.laFiecarePas/.test(PB) && /m\.dateTrimise/.test(PB));
T('trei uși, aceeași fereastră: caseta din RA Insight (`insightProblemaButon` → echipa), fișa mașinii (`echipaDinFisa`), iconița cu căști (`openSupport`)',
  /if \(b\.fel === 'echipa'\) \{[\s\S]{0,200}window\.echipaDeschide\(\{ imei: b\.imei, problema: b\.problema/.test(PAG) && /window\.echipaDinFisa = function \(\) \{[^\n]*deschide\(\{ imei: detailPanelImei, problema: 'aparat', sursa: 'fisa' \}\)/.test(PB) &&
  /window\.openSupport = function \(\) \{ deschide\(\{ sursa: 'suport' \}\); \};/.test(PB) && /id="detail-echipa" onclick="echipaDinFisa\(\)" hidden/.test(PAG) && /onclick="openSupport\(\)" title="Anunță echipa RA Track"/.test(PAG));
T('fereastra veche „Suport clienți" a plecat: fără telefonul 0312 295 000 și fără WhatsApp-ul 40700000000 (nu erau ai noștri), fără a doua `openSupport`',
  MT.indexOf('support-overlay') < 0 && !/window\.(openSupport|closeSupport|sendSupport)\s*=/.test(MT) && !/0312 295 000|wa\.me\/40700000000/.test(PAG + MT) && (PAG.match(/window\.openSupport = /g) || []).length === 1 &&
  !/\.msb-overlay/.test(fs.readFileSync(path.join(__dirname, 'public', 'css', 'map-tools.css'), 'utf8')) && /\/js\/map-tools\.js\?v=8/.test(PAG));
T('caseta: după trimitere, în locul butonului „Echipa RA Track se ocupă · …"; la deschidere, cererile deschise ale mașinilor înlocuiesc butonul (o singură cerere)',
  /window\._echipaInlocuieste = function \(it, seOcupa, notaDupa\)/.test(PB) && /\/api\/cereri-echipa\/deschise\?imeis=/.test(PB) && /if \(echipa\.length && typeof window\._echipaSeOcupa === 'function'\) window\._echipaSeOcupa\(echipa\);/.test(PAG) &&
  /if \(p\.nota\) \{ var n = document\.createElement\('div'\); n\.className = 'chat-prob-n'; n\.textContent = String\(p\.nota\);/.test(PAG));
T('„Pe hartă" din casetă duce pe hartă, pe mașină', /if \(b\.fel === 'harta'\) \{\s*showView\('localizare'\);\s*setTimeout\(function \(\) \{ try \{ selectDevice\(String\(b\.imei\)\); \} catch \(e\) \{\} \}, 150\);/.test(PAG));
const NB = bloc(PAG, '// ── începe „Cereri de la clienți"', '// ── sfârșit „Cereri de la clienți"');
const NBcod = NB.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');   // fără rândurile de comentariu
T('„Cereri de la clienți" (la noi): rândul din meniu după „Cereri demo", cu bulina; numele = rândul (`_RAX_NUME`); încărcarea din `raxAdminTab`',
  /goSistem\('demoreq'\); \}\)"><i class="fas fa-envelope-open-text"><\/i><span>Cereri demo<\/span>[^\n]*\n\s*<button class="nav-item nav-sub" data-super onclick="navGo\(this, function\(\)\{ goSistem\('cereri'\); \}\)"><i class="fas fa-headset"><\/i><span>Cereri de la clienți<\/span><span id="nav-cereri-nr"/.test(PAG) &&
  /cereri: 'Cereri de la clienți'/.test(PAG) && /cereri: 'admin-tab-cereri'/.test(PAG) && /\} else if \(name === 'cereri'\) \{\s*if \(window\.raxLoadCereri\) window\.raxLoadCereri\(\);/.test(PAG) && /<div id="admin-tab-cereri" class="ra-camp"/.test(PAG));
T('…lista nu scrie texte de-ale ei: tot ce vine de la server trece prin esc(); butoanele vin de la server; acțiunile cheamă funcții de pe `window`',
  NB.length > 2000 && /esc\(c\.cap\)/.test(NB) && /esc\(c\.ce \|\| c\.titlu\)/.test(NB) && /esc\(a\.l\) \+ ' <b>' \+ esc\(a\.v\)/.test(NB) && /var b = c\.butoane \|\| \[\]/.test(NB) &&
  /window\.raxCerere = async function \(ce, id\)/.test(NB) && !/onclick="_cer/.test(NB) && !/Pare rezolvată singură/.test(NBcod) && !/vine instalatorul/.test(NBcod));
T('…fiecare pas pe ruta lui (preiau / programeaza / rezolvat / redeschide); „Rezolvat" cere textul pentru client; mesajul programării gol îl scrie serverul',
  /url \+= 'preiau'/.test(NB) && /url \+= 'programeaza'/.test(NB) && /url \+= 'rezolvat'/.test(NB) && /url \+= 'redeschide'/.test(NB) && /Gol = îl scriem noi/.test(NB) && /Pune și în Calendarul de montaj, ca intervenție/.test(NB));
T('anunțurile duc la cerere: la noi în „Cereri de la clienți", la client în „Cererile tale"; bulina se reîmprospătează',
  /const isCerere = \/\^cerere_\(echipa\|preluata\|programata\|rezolvata\)\$\/\.test\(n\.type\);/.test(PAG) && /function notifCerere\(id\) \{[\s\S]{0,200}if \(d\.pentru === 'noi'\) \{ goSistem\('cereri'\); return; \}[\s\S]{0,120}window\.echipaDeschide\(\{ fila: 'lista' \}\)/.test(PAG) &&
  /notif\.type === 'cerere_echipa' && window\._cereriNumara/.test(PAG) && /currentUser\.role === 'superadmin' && window\._cereriNumara\) \{ window\._cereriNumara\(\); setInterval\(window\._cereriNumara, 120000\); \}/.test(PAG));
T('Calendarul de montaj: intervențiile (iconița cu căști), în grilă, în fereastra zilei și în legendă; clicul duce la cerere',
  /\(d\.interventii \|\| \[\]\)\.forEach\(function \(x\) \{\s*if \(part && String\(x\.partener_id \|\| ''\) !== part\) return;/.test(PAG) && /Intervenții în ziua asta/.test(PAG) && /<span class="mjc-l mjc-int"><i class="fas fa-headset" aria-hidden="true"><\/i> intervenție<\/span>/.test(PAG) &&
  /window\.raxMjCalInterventie = function \(id, gata\)/.test(PAG));
const areDark = (sel) => new RegExp('body\\.dark ' + sel.replace(/\./g, '\\.') + '[\\s{,]').test(CSS);
T('culorile au pereche pe tema închisă (fereastra, caseta, fișa, lista noastră) și pe cea deschisă (calendarul)',
  ['.ce-h .ic', '.ce-tab.on', '.ce-chip.on', '.ce-err', '.ce-st.trimisa', '.chat-seocupa', '.detail-echipa > i:first-child', '.cer-tag', '.cer-auto', '.cer-item.prel'].every(areDark) &&
  /body:not\(\.dark\) \.raco \.mjc-l\.mjc-int \{/.test(CSS), ['.ce-h .ic', '.ce-tab.on', '.ce-chip.on', '.ce-err', '.ce-st.trimisa', '.chat-seocupa', '.detail-echipa > i:first-child', '.cer-tag', '.cer-auto', '.cer-item.prel'].filter((s) => !areDark(s)).join(', '));
// Blocul paginii, rulat: fereastra se desenează din ce dă serverul (fără nicio cifră tehnică scrisă în pagină).
(function () {
  // Un DOM de carton, cât să ruleze blocul: textContent pe un element pune UN nod de text (ca în browser), pe unul de text, textul.
  const noduri = [];
  function Nod(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.className = ''; this.hidden = false; this._t = ''; this.listeners = {}; this.value = ''; this.checked = false;
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }; noduri.push(this); }
  const text = (t) => { const n = new Nod('#text'); n._t = String(t); return n; };
  Nod.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
  Nod.prototype.replaceChild = function (n, v) { const i = this.children.indexOf(v); if (i >= 0) this.children[i] = n; n.parentNode = this; return v; };
  Nod.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  Nod.prototype.addEventListener = function (k, f) { this.listeners[k] = f; };
  Nod.prototype.querySelector = function () { return null; };
  Object.defineProperty(Nod.prototype, 'textContent', {
    get() { return this.tagName === '#TEXT' ? this._t : this.children.map((c) => c.textContent).join(''); },
    set(v) { if (this.tagName === '#TEXT') { this._t = String(v); return; } this.children = []; if (String(v)) this.appendChild(text(v)); } });
  Object.defineProperty(Nod.prototype, 'firstChild', { get() { return this.children[0] || null; } });
  Object.defineProperty(Nod.prototype, 'lastChild', { get() { return this.children[this.children.length - 1] || null; } });
  const doc = { body: new Nod('body'), createElement: (t) => new Nod(t), createTextNode: text,
    getElementById(id) { return noduri.filter((n) => n.id === id)[0] || null; }, addEventListener() {} };
  const META = { cereri: [CE.pentruClient(cer, acum, { eu: 11 })], admin: true, contact: { nume: 'Ana Pop', telefon: '0722 345 678', email: 'ana.pop@ionescu.ro' },
    termen: CE.TERMEN, laFiecarePas: CE.LA_FIECARE_PAS, cand: CE.CAND.map((x) => ({ k: x[0], t: x[1] })), dateTrimise: CE.DATE_TRIMISE, dateTrimiseFaraMasina: CE.DATE_TRIMISE_FARA_MASINA,
    notaTrimisa: CE.NOTA_TRIMISA, notaLista: CE.NOTA_LISTA };
  const trimise = [];
  const ctx = { window: {}, document: doc, console, String, Array, JSON, Promise, encodeURIComponent, setTimeout, devices: new Map([['350000000091001', { imei: '350000000091001', plate: 'B 154 UIP', name: 'Dacia Logan 3' }]]),
    fetch: async (u, o) => { trimise.push({ u, o }); const corp = (o && o.method === 'POST') ? { ok: true, cerere: CE.pentruClient(cer, acum, { eu: 11 }), confirmare: CE.confirmare(cer, acum), seOcupa: CE.seOcupa(cer, acum), nota: CE.NOTA_TRIMISA } : META;
      return { status: 200, json: async () => corp }; } };
  ctx.window = ctx; ctx.detailPanelImei = null;
  vm.createContext(ctx);
  let eroare = null;
  try { vm.runInContext(PB, ctx); } catch (e) { eroare = e; }
  T('blocul ferestrei rulează singur (vm) și pune pe `window` cele trei uși', !eroare && typeof ctx.echipaDeschide === 'function' && typeof ctx.openSupport === 'function' && typeof ctx.echipaDinFisa === 'function', eroare && eroare.message);
  if (eroare) return;
  ctx.__gata = ctx.echipaDeschide({ imei: '350000000091001', problema: 'consum', ce: 'Pe 1–21 octombrie nivelul din rezervor a stat la 22 L.', sursa: 'insight' });
  ctx.__gata.then(async () => {
    const tot = doc.getElementById('ce-ov') ? doc.getElementById('ce-ov').textContent : '';
    T('desenată din răspunsul serverului: mașina „B 154 UIP · Dacia Logan 3", „Ce s-a întâmplat · scris de aplicație", cele cinci „când", ce se trimite, termenul',
      /B 154 UIP · Dacia Logan 3/.test(tot) && /Ce s-a întâmplat · scris de aplicație/.test(tot) && /Oricând.*Dimineața.*După-amiaza.*În weekend.*Sunați-mă întâi/.test(tot) && tot.indexOf(CE.DATE_TRIMISE) >= 0 && tot.indexOf(CE.TERMEN) >= 0 &&
      /Cererile tale · 1/.test(tot) && /Trimite echipei/.test(tot), tot.slice(0, 600));
    const btn = noduri.filter((n) => n.tagName === 'BUTTON' && /Trimite echipei/.test(n.textContent))[0];
    await btn.onclick();
    const post = trimise.filter((x) => x.o && x.o.method === 'POST')[0];
    const corp = post ? JSON.parse(post.o.body) : {};
    T('„Trimite echipei" trimite problema, mașina, ce a scris aplicația, telefonul și sursa — nimic tehnic (serverul pune datele aparatului)',
      post && post.u === '/api/cereri-echipa' && corp.problema === 'consum' && corp.imei === '350000000091001' && corp.sursa === 'insight' && corp.telefon === '0722 345 678' && /22 L/.test(corp.ce) &&
      Object.keys(corp).sort().join(',') === 'cand,ce,imei,mesaj,problema,sursa,telefon,unde', JSON.stringify(corp));
    const dupa = doc.getElementById('ce-ov').textContent;
    T('…apoi confirmarea (E3): „Am trimis cererea nr. 142.", pașii, unde o găsește', /Am trimis cererea nr\. 142\./.test(dupa) && /TrimisăPreluatăProgramatăRezolvată|Trimisă.*Preluată.*Programată.*Rezolvată/.test(dupa) && dupa.indexOf(CE.NOTA_TRIMISA) >= 0, dupa.slice(0, 400));
  }).catch((e) => T('fereastra rulată', false, e && e.stack));
})();

// ─── 3. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3367, TCP = 5367;
const DIR = path.join(os.tmpdir(), 'rax_cereri_' + Date.now());
const PRELOAD = DIR + '_fetch.js';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
// Brevo fals: refuză până după conturi (ca invitațiile să întoarcă linkul de parolă), apoi primește și ține minte.
const emailuri = [];
let brevoPrimeste = false;
const brevo = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    if (req.url !== '/v3/account' && !brevoPrimeste) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"message":"proba: încă nu"}'); }
    if (req.url !== '/v3/account') emailuri.push(j);
    res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"messageId":"<m@b>"}');
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => brevo.listen(0, '127.0.0.1', r));
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_cereri', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false',
    BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + brevo.address().port + '/v3/smtp/email', EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SUPPORT_EMAIL']) delete env[k];
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const curata = () => { try { fs.rmSync(PRELOAD, { force: true }); } catch (e) {} try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { brevo.close(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
  const login = async (u, p) => {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  };
  const json = async (m, u, ck, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: r.status, j: j || {}, text: t };
  };
  const asteaptaEmail = async (n, cond) => { for (let i = 0; i < 40; i++) { const g = emailuri.slice(n).filter(cond); if (g.length) return g[0]; await sleep(150); } return null; };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    // Pagina rulată în vm (secțiunea 2) e asincronă: o lăsăm să termine înaintea serverului, ca rândurile să nu se amestece.
    await sleep(50);
    console.log('\n3. Pe server pornit, cu un Brevo fals');
    const S = await login('admin', 'test1234');
    if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
    const PAROLA = 'Str4da-Verde-2026';
    const om = async (username, fullName, role, companyId, ck) => {
      const r = await json('POST', '/api/users', ck || S, { username, full_name: fullName, role, company_id: companyId });
      if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
      return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
    };
    const co = (await json('POST', '/api/companies', S, { name: 'Transport Ionescu SRL' })).j;
    const co2 = (await json('POST', '/api/companies', S, { name: 'Agro Vest SRL' })).j;
    const MAS = [['350000000091001', 'Dacia Logan 3', 'B 154 UIP', co.id], ['350000000091002', 'VW Caddy', 'B 268 ROY', co.id], ['350000000091003', 'Ford Transit', 'CJ 09 AGV', co2.id]];
    await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2], model_gps: 'FMC130' })) });
    for (const m of MAS) { await json('PUT', '/api/devices/' + m[0] + '/company', S, { company_id: m[3] }); await json('PUT', '/api/devices/' + m[0] + '/details', S, { name: m[1], plate: m[2], vehicle_type: 'Auto' }); }
    const ana = await om('ana.pop@ionescu.ro', 'Ana Pop', 'company_admin', co.id);
    const dan = await om('dan@ionescu.ro', 'Dan Dispecer', 'dispatcher', co.id);
    const mircea = await om('mircea@agrovest.ro', 'Mircea Pop', 'company_admin', co2.id);
    await json('PUT', '/api/users/' + dan.id + '/access', S, { devices: [MAS[0][0], MAS[1][0]], groups: [] });
    const alin = await om('alin@ratrack.ro', 'Alin Tilvar', 'superadmin', null);
    const pt = (await json('POST', '/api/montaj/parteneri', S, { name: 'Montaj Rapid' })).j;
    const acumS = Date.now();
    await json('POST', '/api/test/simulate', S, { imei: MAS[0][0], ts: new Date(acumS - 60000).toISOString(), io: { external_voltage: 13900, gsm_signal: 4 } });
    await json('POST', '/api/test/simulate', S, { imei: MAS[1][0], ts: new Date(acumS - 3 * 3600000 - 120000).toISOString() });   // tăcută de 3 ore
    await json('POST', '/api/test/simulate', S, { imei: MAS[2][0], ts: new Date(acumS - 60000).toISOString() });
    T('pregătire: două firme, trei mașini (una tăcută de 3 ore), administratorul, dispecerul, al doilea fondator, un instalator',
      !!(co.id && co2.id && ana.ck && dan.ck && mircea.ck && alin.ck && pt.id), JSON.stringify({ co: co.id, ana: !!ana.ck, dan: !!dan.ck, alin: !!alin.ck, pt: pt.id }));
    brevoPrimeste = true;

    // a) fereastra: ce primește
    const m0 = await json('GET', '/api/cereri-echipa', ana.ck);
    T('fereastra primește termenul, cele cinci „când", ce se trimite și cum îl găsim (numele și emailul din fișă)',
      m0.status === 200 && m0.j.termen === CE.TERMEN && m0.j.cand.length === 5 && m0.j.dateTrimise === CE.DATE_TRIMISE && m0.j.contact.nume === 'Ana Pop' && m0.j.contact.email === 'ana.pop@ionescu.ro' && m0.j.admin === true && m0.j.cereri.length === 0, JSON.stringify(m0.j).slice(0, 300));
    const ms = await json('GET', '/api/cereri-echipa', S);
    T('noi (super-admin) nu trimitem cereri: fereastra ne trimite la „Cereri de la clienți", iar POST-ul e refuzat',
      ms.j.platforma === true && (await json('POST', '/api/cereri-echipa', S, { problema: 'alta', mesaj: 'x' })).status === 400);

    // b) cererea din caseta de consum
    const n0 = emailuri.length;
    const r1 = await json('POST', '/api/cereri-echipa', ana.ck, { problema: 'consum', imei: MAS[0][0], ce: 'Pe 1–21 octombrie nivelul din rezervor a stat la 22 L.', mesaj: 'Mașina a fost la service pe 2 octombrie.',
      cand: ['dimineata'], unde: 'Strada Fabricii 12, Sector 6, București', telefon: '0722 345 678', sursa: 'insight' });
    const id1 = r1.j.cerere && r1.j.cerere.id;
    T('cererea pleacă: „Am trimis cererea nr. N.", pașii (Trimisă bifată), „Echipa RA Track se ocupă" pentru casetă',
      r1.status === 200 && r1.j.confirmare.titlu === 'Am trimis cererea nr. ' + id1 + '.' && /^B 154 UIP · Consumul nu se poate măsura · azi, \d\d:\d\d$/.test(r1.j.confirmare.sub) &&
      r1.j.cerere.pasi[0].gata && !r1.j.cerere.pasi[1].gata && /^Echipa RA Track se ocupă · cererea nr\. \d+ · trimisă azi, /.test(r1.j.seOcupa) && !('aparat' in r1.j.cerere), JSON.stringify(r1.j).slice(0, 400));
    const e1 = await asteaptaEmail(n0, (x) => /^Cerere \d+ · /.test(x.subject || ''));
    T('emailul ne vine la contact@ratrack.ro, cu „Răspuns la" = Ana, subiectul cu firma, mașina și problema, și datele aparatului (IMEI, ultima poziție)',
      e1 && (e1.to || [])[0] && e1.to[0].email === 'contact@ratrack.ro' && e1.replyTo && e1.replyTo.email === 'ana.pop@ionescu.ro' &&
      e1.subject === 'Cerere ' + id1 + ' · Transport Ionescu SRL · B 154 UIP · Consumul nu se poate măsura' && /Datele aparatului/.test(e1.htmlContent || '') && /IMEI 350000000091001/.test(e1.htmlContent || '') &&
      /Teltonika FMC130/.test(e1.htmlContent || '') && /Alimentare/.test(e1.htmlContent || ''), JSON.stringify(e1 || {}).slice(0, 400));
    const r1b = await json('POST', '/api/cereri-echipa', dan.ck, { problema: 'consum', imei: MAS[0][0], sursa: 'insight' });
    T('a doua cerere pe aceeași mașină și problemă (de la un coleg): 409 „Echipa RA Track se ocupă deja de asta: cererea nr. N."',
      r1b.status === 409 && r1b.j.deja === true && r1b.j.error === 'Echipa RA Track se ocupă deja de asta: cererea nr. ' + id1 + '.' && /^Echipa RA Track se ocupă · cererea nr\./.test(r1b.j.seOcupa), JSON.stringify(r1b.j));
    const d0 = await json('GET', '/api/cereri-echipa/deschise?imeis=' + MAS[0][0] + ',' + MAS[1][0] + ',' + MAS[2][0], ana.ck);
    T('casetele din discuție află cererile deschise ale mașinilor (doar ale firmei, doar mașinile văzute)', d0.status === 200 && d0.j.deschise.length === 1 && d0.j.deschise[0].id === id1 && d0.j.deschise[0].problema === 'consum' && d0.j.notaDupa === CE.NOTA_DUPA, JSON.stringify(d0.j));

    // c) fișa mașinii tăcute: „Ceva nu merge la aparat" devine „Nu transmite"
    const r2 = await json('POST', '/api/cereri-echipa', dan.ck, { problema: 'aparat', imei: MAS[1][0], sursa: 'fisa', mesaj: 'Nu o văd pe hartă.' });
    const id2 = r2.j.cerere && r2.j.cerere.id;
    T('„Ceva nu merge la aparat" pe o mașină tăcută de 3 ore = „Nu transmite de 3 ore" (aceeași regulă ca în caseta din RA Insight)',
      r2.status === 200 && r2.j.cerere.titlu === 'Nu transmite de 3 ore' && /^B 268 ROY · Nu transmite de 3 ore · /.test(r2.j.confirmare.sub), JSON.stringify(r2.j).slice(0, 300));
    const r2b = await json('POST', '/api/cereri-echipa', ana.ck, { problema: 'semnal', imei: MAS[1][0], sursa: 'insight' });
    T('…deci caseta „nu transmite" din RA Insight găsește aceeași cerere (409), nu face a doua', r2b.status === 409 && r2b.j.cerere.id === id2);
    T('drepturile: mașina altei firme = „Mașina nu există." (404); o întrebare fără mesaj = 400; fără mașină la o problemă de mașină = 400',
      (await json('POST', '/api/cereri-echipa', ana.ck, { problema: 'aparat', imei: MAS[2][0] })).status === 404 &&
      (await json('POST', '/api/cereri-echipa', ana.ck, { problema: 'alta' })).j.error === 'Scrie pe scurt ce s-a întâmplat sau ce vrei să ne întrebi.' &&
      (await json('POST', '/api/cereri-echipa', ana.ck, { problema: 'consum' })).j.error === 'Alege mașina.');
    const la = await json('GET', '/api/cereri-echipa', ana.ck), ld = await json('GET', '/api/cereri-echipa', dan.ck), lm = await json('GET', '/api/cereri-echipa', mircea.ck);
    T('„Cererile tale": administratorul vede toate cererile firmei (și pe a dispecerului, „trimisă de Dan Dispecer"); dispecerul doar pe a lui; altă firmă nimic',
      la.j.cereri.length === 2 && la.j.cereri.some((c) => c.id === id2 && c.deAltcineva === 'trimisă de Dan Dispecer') && ld.j.cereri.length === 1 && ld.j.cereri[0].id === id2 && ld.j.admin === false &&
      lm.j.cereri.length === 0, JSON.stringify(la.j.cereri.map((c) => [c.id, c.deAltcineva])));
    T('…și nu primește nimic tehnic (IMEI-ul, cartela, modelul stau doar la noi)', la.j.cereri.every((c) => !('aparat' in c) && !('imei' in c)) && la.text.indexOf('350000000091001') < 0 && la.text.indexOf('FMC130') < 0);

    // d) la noi
    const nr0 = await json('GET', '/api/admin/cereri-echipa/numar', S);
    const l0 = await json('GET', '/api/admin/cereri-echipa', S);
    const c1 = (l0.j.cereri || []).filter((c) => c.id === id1)[0] || {};
    T('„Cereri de la clienți": 2 noi, 2 deschise; rândul are firma, mașina, cine (cu rolul), telefonul, de unde, ce s-a întâmplat, mesajul, „când se poate"',
      nr0.j.noi === 2 && nr0.j.deschise === 2 && c1.cap === 'Nr. ' + id1 + ' · Transport Ionescu SRL' && c1.vehicul === 'B 154 UIP · Dacia Logan 3' && /^Ana Pop/.test(c1.cine) && c1.telefon === '0722 345 678' &&
      c1.sursa === 'din caseta „Consumul nu se poate măsura”, în RA Insight' && /22 L/.test(c1.ce) && c1.mesaj === 'Mașina a fost la service pe 2 octombrie.' && c1.candText === 'dimineața · Strada Fabricii 12, Sector 6, București' &&
      JSON.stringify(c1.butoane) === '["preiau","programez","rezolvat"]' && l0.j.intervale.length === 4 && l0.j.parteneri.some((p) => p.name === 'Montaj Rapid'), JSON.stringify(c1).slice(0, 500));
    T('…datele aparatului, doar pentru noi: Teltonika FMC130 · IMEI, ultima poziție, alimentarea', c1.aparat && c1.aparat.some((a) => a.l === 'Aparat' && a.v === 'Teltonika FMC130 · IMEI 350000000091001') &&
      c1.aparat.some((a) => a.l === 'Ultima poziție') && c1.aparat.some((a) => a.l === 'Alimentare' && a.v === '13,9 V'), JSON.stringify(c1.aparat));
    T('clientul nu intră la noi (403)', (await json('GET', '/api/admin/cereri-echipa', ana.ck)).status === 403 && (await json('POST', '/api/admin/cereri-echipa/' + id1 + '/preiau', ana.ck)).status === 403);

    // e) Preiau — o singură dată
    const ne = emailuri.length;
    const pr1 = await json('POST', '/api/admin/cereri-echipa/' + id1 + '/preiau', S);
    const pr2 = await json('POST', '/api/admin/cereri-echipa/' + id1 + '/preiau', alin.ck);
    T('„Preiau": primul fondator o ia; al doilea primește „Cererea a fost deja preluată (…)." (409)', pr1.status === 200 && pr1.j.cerere.stare === 'preluata' && pr2.status === 409 && /^Cererea a fost deja preluată/.test(pr2.j.error || ''), JSON.stringify([pr1.j.cerere && pr1.j.cerere.tag, pr2.j]));
    const eP = await asteaptaEmail(ne, (x) => /^Am preluat cererea nr\./.test(x.subject || ''));
    T('…clientul primește emailul „Am preluat cererea nr. N · RA Track" (la Ana)', eP && eP.to[0].email === 'ana.pop@ionescu.ro' && /în cel mult o zi lucrătoare/.test(eP.textContent || ''), JSON.stringify(eP || {}).slice(0, 300));
    const nf = await json('GET', '/api/notifications?limit=20', ana.ck);
    T('…și anunțul în aplicație („cerere_preluata", cu `pentru: client`)', Array.isArray(nf.j) && nf.j.some((n) => n.type === 'cerere_preluata' && /Am preluat cererea nr\. /.test(n.title) && (typeof n.data === 'string' ? JSON.parse(n.data) : n.data).pentru === 'client'), JSON.stringify(nf.j).slice(0, 300));
    const nS = await json('GET', '/api/notifications?limit=40', S);
    T('noi am primit anunțul „Cerere nouă nr. N · Transport Ionescu SRL" (`pentru: noi`), fără date tehnice', Array.isArray(nS.j) && nS.j.some((n) => n.type === 'cerere_echipa' && n.title === 'Cerere nouă nr. ' + id1 + ' · Transport Ionescu SRL' &&
      (n.body || '').indexOf('350000000091001') < 0 && (typeof n.data === 'string' ? JSON.parse(n.data) : n.data).pentru === 'noi'), JSON.stringify((nS.j || []).filter((n) => n.type === 'cerere_echipa')).slice(0, 300));

    // f) Programez — cu intervenția în calendar
    const aziRo = l0.j.azi, maine = l0.j.maine;
    T('„Programez" refuză o zi trecută și un interval necunoscut', (await json('POST', '/api/admin/cereri-echipa/' + id1 + '/programeaza', S, { zi: '2020-01-01', interval: '9-12' })).status === 400 &&
      (await json('POST', '/api/admin/cereri-echipa/' + id1 + '/programeaza', S, { zi: maine, interval: '7-8' })).status === 400);
    const ne2 = emailuri.length;
    const pg = await json('POST', '/api/admin/cereri-echipa/' + id1 + '/programeaza', S, { zi: maine, interval: '9-12', partener_id: pt.id, mesaj: '', in_calendar: true });
    const mesajAsteptat = CE.mesajProgramare({ zi: maine, interval: '9-12', unde: 'Strada Fabricii 12, Sector 6, București' });
    T('„Programează și anunță clientul": mesajul gol îl scrie serverul („…, între 9 și 12, vine instalatorul la Strada Fabricii 12…")',
      pg.status === 200 && pg.j.cerere.stare === 'programata' && pg.j.cerere.programareMesaj === mesajAsteptat && /Montaj Rapid · în Calendarul de montaj$/.test(pg.j.cerere.programare), JSON.stringify(pg.j).slice(0, 400));
    const eG = await asteaptaEmail(ne2, (x) => /^Am programat cererea nr\./.test(x.subject || ''));
    T('…clientul primește ziua și ora pe email', eG && (eG.textContent || '').indexOf(mesajAsteptat) >= 0);
    const cal = await json('GET', '/api/montaj/calendar?luna=' + maine.slice(0, 7), S);
    const iv = ((cal.j.interventii) || []).filter((x) => x.cerere_id === id1)[0];
    T('…intervenția stă în Calendarul de montaj (ziua, instalatorul, „Intervenție · cererea nr. N · B 154 UIP · …") și îl ține ocupat pe instalator',
      iv && iv.zi === maine && Number(iv.partener_id) === Number(pt.id) && iv.status === 'programat' && iv.text === 'Intervenție · cererea nr. ' + id1 + ' · B 154 UIP · Consumul nu se poate măsura' &&
      cal.j.incarcare && cal.j.incarcare[maine] && cal.j.incarcare[maine][pt.id] && /are deja 1 mașină \(Transport Ionescu SRL\)/.test(cal.j.incarcare[maine][pt.id].text), JSON.stringify({ iv, inc: cal.j.incarcare && cal.j.incarcare[maine] }));
    T('…dar NU e o lucrare de montaj (nu intră în „de programat" sau în lucrări)', !(cal.j.lucrari || []).some((l) => String(l.id) === 'c' + id1) && !(cal.j.programate || []).some((l) => String(l.id) === 'c' + id1));
    const la2 = await json('GET', '/api/cereri-echipa', ana.ck);
    const v1 = la2.j.cereri.filter((c) => c.id === id1)[0] || {};
    T('„Cererile tale": „Programată" + mesajul programării + cine din echipă', v1.eticheta === 'Programată' && v1.detaliu.indexOf(mesajAsteptat + ' · ') === 0 && /RA Track$/.test(v1.detaliu) && v1.pasi[2].gata && v1.pasi[2].detaliu === mesajAsteptat, JSON.stringify(v1));

    // g) Rezolvat — cu textul pentru client; Redeschide
    T('„Rezolvat" fără textul pentru client = 400', (await json('POST', '/api/admin/cereri-echipa/' + id1 + '/rezolvat', S, { raspuns: '  ' })).status === 400);
    const ne3 = emailuri.length;
    const rz = await json('POST', '/api/admin/cereri-echipa/' + id1 + '/rezolvat', alin.ck, { raspuns: 'Am refăcut legătura cu rezervorul. Consumul se măsoară din nou.' });
    T('„Rezolvată — trimite clientului": starea, eticheta „rezolvată … · Alin", butonul „Redeschide"', rz.status === 200 && rz.j.cerere.stare === 'rezolvata' && /^rezolvată \d\d\.\d\d · Alin$/.test(rz.j.cerere.tag.text) && JSON.stringify(rz.j.cerere.butoane) === '["redeschide"]', JSON.stringify(rz.j.cerere && rz.j.cerere.tag));
    const eR = await asteaptaEmail(ne3, (x) => /^Am rezolvat cererea nr\./.test(x.subject || ''));
    T('…clientul primește ce i-am scris', eR && /„Am refăcut legătura cu rezervorul\. Consumul se măsoară din nou\.”/.test(eR.textContent || ''));
    const cal2 = await json('GET', '/api/montaj/calendar?luna=' + maine.slice(0, 7), S);
    T('…în calendar intervenția rămâne, gri (rezolvată), și nu-l mai ține ocupat pe instalator', ((cal2.j.interventii || []).filter((x) => x.cerere_id === id1)[0] || {}).status === 'executat' && !((cal2.j.incarcare || {})[maine] || {})[pt.id]);
    T('…și caseta din discuție nu mai spune „se ocupă" (cererea e închisă); a doua cerere pe aceeași problemă se poate face iar',
      (await json('GET', '/api/cereri-echipa/deschise?imeis=' + MAS[0][0], ana.ck)).j.deschise.length === 0);
    const rd = await json('POST', '/api/admin/cereri-echipa/' + id1 + '/redeschide', S);
    T('„Redeschide": înapoi la „preluată" (a fost preluată), cu butoanele Programez / Rezolvat; a doua oară 409', rd.status === 200 && rd.j.cerere.stare === 'preluata' && JSON.stringify(rd.j.cerere.butoane) === '["programez","rezolvat"]' &&
      (await json('POST', '/api/admin/cereri-echipa/' + id1 + '/redeschide', S)).status === 409);

    // h) „Pare rezolvată singură": mașina tăcută transmite din nou
    await json('POST', '/api/test/simulate', S, { imei: MAS[1][0], ts: new Date(Date.now() + 1000).toISOString() });
    const l3 = await json('GET', '/api/admin/cereri-echipa', S);
    const c2 = (l3.j.cereri || []).filter((c) => c.id === id2)[0] || {};
    T('„Pare rezolvată singură: transmite din nou de azi, …" (mașina tăcută a transmis după cerere); „Rezolvat" devine butonul de seamă',
      /^Pare rezolvată singură: transmite din nou de azi, \d\d:\d\d\.$/.test(c2.pareRezolvata || '') && c2.titlu === 'Nu transmite de 3 ore', JSON.stringify(c2).slice(0, 300));

    // i) plafonul și ruta veche a telefonului
    let ultim = null;
    for (let i = 0; i < CE.LIMITA_ORA; i++) ultim = await json('POST', '/api/cereri-echipa', mircea.ck, { problema: 'alta', mesaj: 'Întrebarea ' + (i + 1), sursa: 'suport' });
    const peste = await json('POST', '/api/cereri-echipa', mircea.ck, { problema: 'alta', mesaj: 'Încă una', sursa: 'suport' });
    T('cel mult ' + CE.LIMITA_ORA + ' cereri pe oră de la același om (a ' + (CE.LIMITA_ORA + 1) + '-a: 429, cu textul pe față)', ultim.status === 200 && peste.status === 429 && /în ultima oră/.test(peste.j.error || ''), peste.status + ' ' + peste.text);
    const ne4 = emailuri.length;
    const tel = await json('POST', '/api/support', ana.ck, { message: 'Nu-mi vine raportul pe email.' });
    const eT = await asteaptaEmail(ne4, (x) => /^Cerere \d+ · Transport Ionescu SRL · O întrebare pentru echipă$/.test(x.subject || ''));
    T('ruta veche a telefonului (/api/support) face o cerere ca oricare alta („de pe telefon"), cu emailul la contact@', tel.status === 200 && tel.j.ok && tel.j.id > 0 && eT && eT.to[0].email === 'contact@ratrack.ro' &&
      /Nu-mi vine raportul/.test(eT.textContent || '') && /de pe telefon/.test(eT.textContent || ''), JSON.stringify(tel.j) + ' ' + JSON.stringify(eT || {}).slice(0, 200));
    T('în jurnal: crearea și fiecare pas (fără textul cererii)', (await json('GET', '/api/audit?limit=200', S)).text.indexOf('cerere_echipa') >= 0);
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
