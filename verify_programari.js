// verify_programari.js — Pasul 2 al Capitolului 2, partea 3 (Alin, 26.10: „6. după ce rezolvi punctele de la 1 la 5"): „RA Insight
// face, cu Da-ul tău" — REVIZIA, ACTUL și RAPORTUL PROGRAMAT (macheta M6 din 21.10: „două lucruri deodată, aprobate pe rând").
// Ce apără:
//   1. regula (programari.js, curată): ce e o cerere (și ce nu: o întrebare, „am făcut revizia", un raport pe loc), mai multe cereri
//      într-un mesaj, data și kilometrii din text, cartonașele (termenul din intervalul mașinii, „Acum", preavizul), „Schimbă";
//   2. categoria mașinii pe server = cea din pagină (markerCategory), ca termenul propus să fie cel din fereastra Mentenanță;
//   3. serverul: calea ecranului (db.createMaintenance; actul vechi în istoric + db.createVehicleDocument; db.createReportSchedule
//      cu computeNextRun), drepturile ecranelor, întâia în RA Insight, cartonașele din conversația redeschisă;
//   4. pagina: mai multe cartonașe într-un mesaj, „Schimbă" pe cele trei feluri, butonul „Vezi în Programări";
//   5. pe server pornit (modelul simulat: orice cerere către el se numără și trebuie să rămână ZERO): fraza din machetă → două
//      cartonașe; „Da" / „Schimbă" / „Nu" / „Anulează" pe fiecare; drepturile; pachetul; fondatorul.
//
//   node verify_programari.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawn } = require('child_process');
const insight = require('./insight');
const programari = require('./programari');
const maintTypes = require('./maint_types');
const reportSchedules = require('./report_schedules');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const SRV = citeste('server.js'), PAG = citeste('public/index.html'), CSS = citeste('public/css/app.css');

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Regula (programari.js, fără server)');
const fisa = insight.fisaFlotei([
  { imei: '1', name: 'Dacia Logan 3', plate: 'B 154 UIP' }, { imei: '2', name: 'VW Caddy', plate: 'B 268 ROY' }, { imei: '3', name: 'MAN TGX', plate: 'B 77 TIR' }], {});
const ACUM = Date.parse('2026-10-26T10:00:00Z');
const C = (t) => programari.cereri(t, fisa, ACUM);
const m6 = C('Programează revizia la Caddy și trimite-mi în fiecare luni raportul de consum.');
T('fraza din machetă → două cereri, în ordinea scrisă: revizia la Caddy, apoi raportul de consum săptămânal (pe toată flota, nu pe Caddy)',
  m6.length === 2 && m6[0].fel === 'revizie' && m6[0].tip === 'Revizie generală' && m6[0].imei === '2' && m6[1].fel === 'raport' && m6[1].tip === 'consumption' &&
  m6[1].frecventa === 'weekly' && m6[1].perioada === 'last7' && !m6[1].imei, JSON.stringify(m6));
const ulei = C('Pune schimbul de ulei la B 268 ROY la 150.000 km')[0] || {};
T('„Pune schimbul de ulei la B 268 ROY la 150.000 km" → Schimb ulei + filtru, 150.000 km (cifrele numărului nu se iau)', ulei.tip === 'Schimb ulei + filtru' && ulei.km === 150000 && ulei.imei === '2', JSON.stringify(ulei));
const itp = C('Am făcut ITP la Caddy, expiră pe 26.10.2027')[0] || {}, rca = C('Trece RCA-ul la Logan, valabil până pe 30 noiembrie')[0] || {};
T('actul: „Am făcut ITP la Caddy, expiră pe 26.10.2027"; „Trece RCA-ul la Logan, valabil până pe 30 noiembrie" (fără an: anul de acum, dacă n-a trecut)',
  itp.fel === 'act' && itp.tip === 'ITP' && itp.data === '2027-10-26' && itp.imei === '2' && rca.tip === 'RCA' && rca.data === '2026-11-30' && rca.imei === '1', JSON.stringify([itp, rca]));
const r7 = C('Vreau zilnic la 7 raportul de km pentru B 154 UIP, în PDF')[0] || {}, rl = C('Programează raportul de costuri lunar pe ana@firma.ro')[0] || {};
T('raportul: „zilnic la 7 … km … PDF" (ziua precedentă, ora 7, PDF, pe Logan); „costuri lunar pe ana@firma.ro" (luna precedentă, adresa scrisă)',
  r7.tip === 'utilization' && r7.frecventa === 'daily' && r7.perioada === 'yesterday' && r7.ora === 7 && r7.format === 'pdf' && r7.imei === '1' &&
  rl.tip === 'costs' && rl.frecventa === 'monthly' && rl.perioada === 'lastmonth' && rl.dest.join() === 'ana@firma.ro', JSON.stringify([r7, rl]));
const vin = C('Trimite-mi raportul de consum în fiecare vineri la 6 seara')[0] || {};
T('„în fiecare vineri la 6 seara" → săptămânal (pleacă lunea, cartonașul o spune), ora 18', vin.frecventa === 'weekly' && vin.ziAlta === 'vineri' && vin.ora === 18, JSON.stringify(vin));
T('NU sunt cereri: o întrebare, „am făcut revizia", un raport pe loc, o alertă de expirare', !C('Când e revizia la Caddy?').length && !C('Am făcut revizia la Caddy').length &&
  !C('Fă-mi raportul de consum pe săptămâna trecută').length && !C('Anunță-mă când expiră ITP-ul la Logan').length && !C('Câte revizii are Caddy-ul?').length);
T('fără dată la act → o cere; revizia pe toată flota → pe o mașină; „peste 3 luni" → data', C('Pune ITP-ul la Logan')[0].lipsaData === true && C('Programează revizia la toată flota')[0].flota === true &&
  C('Programează revizia la Caddy peste 3 luni')[0].data === '2027-01-26');
T('o dată din trecut se spune (nu se ia)', (C('Programează revizia la Caddy pe 01.01.2026')[0] || {}).dataTrecuta === '2026-01-01');
T('trei cereri într-un mesaj → trei, fiecare cu mașina ei', C('Pune schimbul de ulei la Logan, trece ITP-ul la Caddy valabil până pe 26.10.2027 și programează raportul de costuri lunar').map((c) => c.fel + ':' + (c.imei || '-')).join() === 'revizie:1,act:2,raport:-');
// Cartonașul reviziei: termenul din intervalul mașinii (ca fereastra din Mentenanță), „Acum", preavizul.
const iv = maintTypes.intervalFor('Revizie generală', 'van', null);
const cr = programari.cardRevizie({ tip: 'Revizie generală', imei: '2', nr: 'B 268 ROY', interval: iv, clasa: maintTypes.CLASSES[1], odo: 141230, kmLuna: 3000, lead: { days: 14, km: 500 }, existente: [], poate: true, cine: 'Ana Pop', acum: ACUM });
T('revizia la Caddy (utilitară): termen 181.230 km (141.230 + 40.000) sau pe 26.10.2028 (2 ani), ce vine întâi', iv.km === 40000 && iv.months === 24 && cr.titlu === 'Programez revizia la B 268 ROY' &&
  cr.randuri[1].v === 'la 181.230 km sau pe 26.10.2028, ce vine întâi', JSON.stringify(cr.randuri));
T('…„Acum: 141.230 km · merge cam 3.000 km pe lună, deci ajunge acolo …" + de unde vine termenul + „Îți amintește cu 14 zile sau 500 km înainte"',
  /^141\.230 km · merge cam 3\.000 km pe lună, deci ajunge acolo pe la (începutul|jumătatea|sfârșitul) lui \S+( \d{4})?$/.test(cr.randuri[2].v) &&
  cr.dovezi.some((d) => d.text === 'La o utilitară, „Revizie generală" se face la fiecare 40.000 km sau la 2 ani, ce vine întâi — de acolo termenul (îl potrivești din „Schimbă").') &&
  cr.dovezi.some((d) => d.text === 'Îți amintește cu 14 zile sau 500 km înainte, ca la toate reviziile.') && cr.butonDa === 'Da, programează', JSON.stringify(cr));
const cr2 = programari.cardRevizie({ tip: 'Revizie generală', nr: 'B 268 ROY', km: 150000, data: '2027-01-15', odo: 141230, kmLuna: 3000, lead: { days: 14, km: 500 }, existente: [{ due_km: 160000 }], poate: false, aproba: 'administratorul firmei, Ana Pop', acum: ACUM });
T('termenul scris de om bate intervalul (exact ca în machetă: „la 150.000 km sau pe 15.01.2027, ce vine întâi"); revizia deja programată se spune; fără drept → cine aprobă',
  cr2.randuri[1].v === 'la 150.000 km sau pe 15.01.2027, ce vine întâi' && /deja programată „Revizie generală" la 160\.000 km/.test(cr2.dovezi.map((d) => d.text).join(' ')) &&
  cr2.sub === 'Doar cine poate schimba mentenanța apasă „Da": administratorul firmei, Ana Pop.' && cr2.poate === false);
const cr3 = programari.cardRevizie({ tip: 'Revizie generală', nr: 'B 268 ROY', interval: iv, clasa: maintTypes.CLASSES[1], odo: null, lead: {}, acum: ACUM });
T('fără kilometraj: termenul pe dată, spus pe față (fără să-i cerem clientului să verifice ceva)', cr3.randuri[1].v === 'pe 26.10.2028' && cr3.randuri.length === 2 && !/verific|senzor|aparat/i.test(JSON.stringify(cr3)), JSON.stringify(cr3.randuri));
// „Schimbă" pe revizie
const sr = programari.campuriRevizie({ tip: 'Schimb ulei + filtru', km: '150.000', data: '' }, cr, ACUM);
T('„Schimbă": altă lucrare, km cu punct („150.000"), fără dată → spec-ul ecranului (fără intervalul altei lucrări)', sr.spec && sr.spec.type === 'Schimb ulei + filtru' && sr.spec.due_km === 150000 && sr.spec.due_date === null && sr.spec.interval_km === null && sr.spec.status === 'pending', JSON.stringify(sr));
T('…aceeași lucrare păstrează intervalul (la „făcută", următoarea scadență se pune singură)', programari.campuriRevizie({}, cr, ACUM).spec.interval_km === 40000 && programari.campuriRevizie({}, cr, ACUM).spec.interval_months === 24);
T('…greșit: lucrare din afara listei, km 99, data trecută, nimic → refuzat cu motivul', !!programari.campuriRevizie({ tip: 'Vopsit' }, cr, ACUM).eroare && !!programari.campuriRevizie({ km: 99 }, cr, ACUM).eroare &&
  programari.campuriRevizie({ data: '2025-01-01' }, cr, ACUM).eroare === programari.TEXTE.dataTrecuta && !!programari.campuriRevizie({ km: '', data: '' }, cr, ACUM).eroare);
// Actul
const ca = programari.cardAct({ tip: 'ITP', imei: '2', nr: 'B 268 ROY', data: '2027-10-26', actual: { id: 7, expiry_date: '2026-11-03' }, leadZile: 30, poate: true, cine: 'Ana Pop', acum: ACUM });
T('actul: „Trec ITP-ul la B 268 ROY", valabil până pe 26.10.2027, cel de acum trece în istoric; preavizul de 30 de zile', ca.titlu === 'Trec ITP-ul la B 268 ROY' && ca.randuri[1].v === '26.10.2027' &&
  /până pe 03\.11\.2026 — trece în istoricul mașinii/.test(ca.randuri[2].v) && ca.dovezi.some((d) => d.text === 'Îți amintește cu 30 de zile înainte să expire, ca la toate actele.') && ca.butonDa === 'Da, trec actul', JSON.stringify(ca));
T('…„Schimbă": alt act din listă, data; data trecută / lipsă → refuzat', programari.campuriAct({ tip: 'RCA', data: '2027-03-01' }, ca, ACUM).spec.doc_type === 'RCA' && !!programari.campuriAct({ data: '' }, ca, ACUM).eroare &&
  !!programari.campuriAct({ tip: 'Pașaport' }, ca, ACUM).eroare && programari.campuriAct({ data: '2026-01-01' }, ca, ACUM).eroare === programari.TEXTE.dataTrecuta);
// Raportul
const primul = reportSchedules.computeNextRun('weekly', 8, new Date(ACUM)).getTime();
const cp = programari.cardRaport({ tip: 'consumption', label: 'Consum', frecventa: 'weekly', ora: 8, perioada: 'last7', format: null, dest: [], email: 'ana.pop@transport-ionescu.ro', agendaN: 0, primul: primul,
  optiuni: [{ v: '', t: 'Toată flota', scurt: 'toată flota' }, { v: '2', t: 'B 268 ROY · VW Caddy', scurt: 'B 268 ROY' }], poate: true, cine: 'Ana Pop' });
T('raportul, ca în machetă: Ce „Consum · toată flota · ultimele 7 zile", Când „în fiecare luni, la 8:00", Cui „ana.pop@… · Excel", Primul „luni, 2.11.2026"',
  cp.titlu === 'Programez raportul Consum' && cp.randuri[0].v === 'Consum · toată flota · ultimele 7 zile' && cp.randuri[1].v === 'în fiecare luni, la 8:00' &&
  cp.randuri[2].v === 'ana.pop@transport-ionescu.ro · Excel' && cp.randuri[3].v === 'luni, 2.11.2026', JSON.stringify(cp.randuri));
const sp = programari.campuriRaport({ frecventa: 'daily', ora: '7', perioada: 'yesterday', format: 'pdf', dest: 'sef@firma.ro, contabil@firma.ro', imei: '2' }, cp);
T('…„Schimbă": zilnic la 7, ziua precedentă, PDF, două adrese, pe Caddy → spec-ul ecranului Programări', sp.spec && sp.spec.frequency === 'daily' && sp.spec.hour === 7 && sp.spec.period === 'yesterday' &&
  sp.spec.format === 'pdf' && sp.spec.recipients === 'sef@firma.ro, contabil@firma.ro' && sp.spec.imei === '2' && sp.spec.report_type === 'consumption' && sp.spec.name === 'Consum · B 268 ROY · zilnic', JSON.stringify(sp));
T('…greșit: ora 25, o adresă stricată, o mașină din afara listei, o frecvență necunoscută → refuzat', !!programari.campuriRaport({ ora: 25 }, cp).eroare && !!programari.campuriRaport({ dest: 'nu-e-adresa' }, cp).eroare &&
  !!programari.campuriRaport({ imei: '9' }, cp).eroare && !!programari.campuriRaport({ frecventa: 'orar' }, cp).eroare);
T('textele de după: „Gata…" cu butonul spre ecranul lui; „Anulează" spune ce a scos', /^Gata\. \*\*Revizie generală\*\* la B 268 ROY e în Mentenanță, la 181\.230 km/.test(programari.gataRevizie(sr.spec.type === 'x' ? {} : { type: 'Revizie generală', due_km: 181230, due_date: '2028-10-26' }, 'B 268 ROY', 'Ana Pop', ACUM).text) &&
  programari.gataRevizie({ type: 'Revizie generală', due_km: 1000 }, 'X', 'Ana', ACUM).buton.ecran === 'maintenance' && programari.gataAct({ doc_type: 'ITP', expiry_date: '2027-10-26' }, 'X', 'Ana', ACUM).buton.ecran === 'documente' &&
  programari.gataRaport({ frequency: 'weekly', hour: 8 }, 'Consum', primul, 'Ana', ACUM).buton.fel === 'programate' && programari.anulareAct({ doc_type: 'ITP' }, 'X', true, true) === 'Am anulat: ITP la X a ieșit din Documente, iar cel de dinainte e iar cel valabil.');

// ─── 2. Categoria mașinii: pe server = în pagină ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Categoria mașinii (maint_types.categorieVehicul = markerCategory din pagină)');
const fMC = PAG.slice(PAG.indexOf('function markerCategory(dev)'), PAG.indexOf('// Siluetă top-down a vehiculului'));
const markerCategory = vm.runInNewContext(fMC + '; markerCategory');
const ICOANE = ['car', 'van', 'truck', 'tir', 'bus', 'motorcycle', 'utilaj', 'tractor', 'trailer', 'autotractor', 'trailer_tech', 'excavator', 'forklift', 'combine', 'mixer', 'generator', 'boat', 'ambulance', 'electric', 'phev', 'hybrid', 'cng', 'necunoscut'];
const TIPURI = ['Auto', 'Camion', 'TIR', 'Duba', 'Dubă', 'Motocicleta', 'Motocicletă', 'Autobuz', 'Utilaj', 'Remorca', 'Remorcă', 'Autotractor', 'Tractor', 'Remorcă tehnologică', 'Buldoexcavator', 'Motostivuitor', 'Combină agricolă', 'Automixt', 'Grup electrogen', 'Barcă', 'Ambulanță', 'Electric', 'Plug-in hibrid', 'Hibrid', 'CNG/GPL', 'Altceva', ''];
const cazuri = [null, {}].concat(ICOANE.map((i) => ({ icon: i })), TIPURI.map((t) => ({ vehicle_type: t })), ICOANE.slice(0, 5).map((i, k) => ({ icon: i, vehicle_type: TIPURI[k + 3] })));
const diferite = cazuri.filter((d) => markerCategory(d) !== maintTypes.categorieVehicul(d));
T('aceeași categorie pe ' + cazuri.length + ' de cazuri (iconiță, „Categorie", amândouă, nimic)', diferite.length === 0, JSON.stringify(diferite.slice(0, 3)));
T('clasa de service: Duba → utilitară, Auto → autoturism, Autotractor → camion, fără nimic → autoturism', maintTypes.clasaVehicul({ vehicle_type: 'Duba' }) === 'van' && maintTypes.clasaVehicul({ vehicle_type: 'Auto' }) === 'car' &&
  maintTypes.clasaVehicul({ vehicle_type: 'Autotractor' }) === 'truck' && maintTypes.clasaVehicul({}) === 'car');

// ─── 3. Serverul (cod) ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Serverul (cod)');
const BLOC = SRV.slice(SRV.indexOf('// ─── Pasul 2, partea 3 (26.10'), SRV.indexOf('// Ce au găsit agenții, pe mașinile omului'));
T('întâia în RA Insight: înaintea alertei, a șoferilor și a rapoartelor („trimite-mi în fiecare luni raportul…" nu e un raport pe loc)',
  SRV.indexOf('if (await _insightProgramari(req, res,') > 0 && SRV.indexOf('if (await _insightProgramari(req, res,') < SRV.indexOf('if (await _insightPropuneri(req, res,') &&
  SRV.indexOf('if (await _insightPropuneri(req, res,') < SRV.indexOf('if (await _insightSoferi(req, res,') && (SRV.match(/await _insightProgramari\(/g) || []).length === 1);
T('calea ecranului: revizia = db.createMaintenance; actul = actul vechi în istoric (archiveVehicleDocumentsByType) + db.createVehicleDocument; raportul = db.createReportSchedule cu computeNextRun',
  /db\.createMaintenance\(s, req\.companyId\)/.test(BLOC) && /db\.archiveVehicleDocumentsByType\(s\.imei, s\.doc_type, companyId\)/.test(BLOC) && /db\.createVehicleDocument\(s, companyId\)/.test(BLOC) &&
  /reportSchedules\.computeNextRun\(s\.frequency, s\.hour, new Date\(\)\)/.test(BLOC) && /db\.createReportSchedule\(\{ company_id: req\.companyId, user_id: userId/.test(BLOC));
T('„Anulează": lucrarea ștearsă doar dacă e încă deschisă; actul scos și cel vechi pus la loc (db.restaureazaActe); programarea ștearsă',
  /!_maintClosed\(r\)/.test(BLOC) && /db\.restaureazaActe\(D\.inlocuite \|\| \[\], r\.imei, r\.company_id\)/.test(BLOC) && /db\.deleteReportSchedule\(r\.id\)/.test(BLOC));
T('drepturile ecranelor (`_poateActiunea`): Mentenanță, Documente — modifică flota + editarea + ecranul; Programări — vede rapoartele + ecranul; raportul tăiat din rol, nu',
  /if \(fel === 'revizie'\) return !!\(permReq\(req, 'manageFleet'\) && poateEditare\(req, 'mentenanta'\) && poateEcran\(req, 'mentenanta'\)\);/.test(SRV) &&
  /if \(fel === 'act'\) return !!\(permReq\(req, 'manageFleet'\) && poateEditare\(req, 'documente'\) && poateEcran\(req, 'documente'\)\);/.test(SRV) &&
  /if \(fel === 'raport'\) return !!\(permReq\(req, 'viewReports'\) && poateEcran\(req, 'programari'\)\);/.test(SRV) && /if \(!poateRaport\(req, s\.report_type\)\) return res\.status\(403\)/.test(BLOC));
T('rutele comune „Da" / „Anulează" trimit cele trei feluri aici; conversația redeschisă își reface și `propuneri` (mai multe cartonașe)',
  /if \(a\.fel === 'revizie' \|\| a\.fel === 'act' \|\| a\.fel === 'raport'\) return await _aplicaPropunere3\(req, res, a\);/.test(SRV) &&
  /if \(a\.fel === 'revizie' \|\| a\.fel === 'act' \|\| a\.fel === 'raport'\) return await _anuleazaPropunere3\(req, res, a\);/.test(SRV) && /x\.propuneri = x\.propuneri\.map\(function \(p\) \{ return p && p\.id && pe\[p\.id\] \? _cardPublic\(pe\[p\.id\]\) : p; \}\);/.test(SRV));
T('fără model și fără numărătoare în bloc; termenul cu intervalul firmei și clasa mașinii (aceeași regulă ca fereastra din Mentenanță)',
  !/callClaude|_numaraRaspunsReguli|ai\.call/.test(BLOC) && /maintTypes\.intervalFor\(u\.tip, cls, await _maintOverrides\(req\.companyId\)\)/.test(BLOC) && /maintTypes\.clasaVehicul\(d\)/.test(BLOC));

// ─── 4. Pagina ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. Pagina');
T('mai multe cartonașe într-un mesaj: fiecare se apasă singur; fraza stă cât unul e deschis', /var mai = Array\.isArray\(x\.propuneri\)/.test(PAG) && /mai\.forEach\(function \(q, i\) \{/.test(PAG) &&
  /propunere: j\.propunere, propuneri: j\.propuneri, actiuni: j\.actiuni, pagina: j\.pagina,/.test(PAG));
T('„Schimbă": lucrarea + km + data (revizie); actul + data; mașina, perioada, frecvența, ora, adresele, formatul (raport) — listele de pe cartonaș',
  /else if \(p\.fel === 'revizie' \|\| p\.fel === 'act' \|\| p\.fel === 'raport'\) \{/.test(PAG) && /f\.tip = lista\(k\.tipuri, k\.tip, 'Lucrarea'\)/.test(PAG) && /f\.data = caseta\('data', 'date', k\.data, 'Valabil până pe'\)/.test(PAG) &&
  /f\.frecventa = lista\(k\.frecvente, k\.frecventa, 'Cât de des'\)/.test(PAG) && /\.chat-prop-in\.data \{ width: 158px; \}/.test(CSS));
T('„Vezi în Programări" deschide Rapoarte cu fereastra „Rapoarte programate"; iconița butonului de după „Da" vine de la server',
  /if \(b\.fel === 'programate'\) \{ showView\('rapoarte'\); setTimeout\(function \(\) \{ try \{ openSchedules\(\); \} catch \(e\) \{\} \}, 150\); return; \}/.test(PAG) && /\/\^fa-\[a-z-\]\+\$\/\.test\(p\.gata\.buton\.ic \|\| ''\) \? p\.gata\.buton\.ic/.test(PAG));

// ─── 5. Pe server pornit ────────────────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3375, TCP = 5375;
const DIR = path.join(os.tmpdir(), 'rax_programari_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, String((opts && opts.body) || '').slice(0, 200) + '\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_programari', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
  GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
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
const nModel = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;
const ziIso = (ms) => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; };
const plusLuni = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const z = new Date(Date.UTC(y, m - 1 + n, Math.min(d, new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()))); return z.toISOString().slice(0, 10); };
const ddmmyyyy = (iso) => iso.split('-').reverse().join('.');

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n5. Pe server pornit (modelul simulat: orice cerere către el se numără; trebuie să rămână ZERO)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const PAROLA = 'Str4da-Verde-2026';
  async function om(username, fullName, role, companyId) {
    const r = await json('POST', '/api/users', S, { username, full_name: fullName, role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
  }
  const co = (await json('POST', '/api/companies', S, { name: 'Transport Ionescu SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
  const MAS = [['350000000092001', 'Dacia Logan 3', 'B 154 UIP', 'Auto'], ['350000000092002', 'VW Caddy', 'B 268 ROY', 'Duba']];
  await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
  for (const m of MAS) { await json('PUT', '/api/devices/' + m[0] + '/company', S, { company_id: co.id }); await json('PUT', '/api/devices/' + m[0] + '/details', S, { name: m[1], plate: m[2], vehicle_type: m[3], icon: m[3] === 'Duba' ? 'van' : 'car' }); }
  // Caddy: kilometrajul aparatului 141.230 km (în metri, ca Teltonika).
  await json('POST', '/api/test/simulate', S, { imei: MAS[1][0], name: MAS[1][1], speed: 0, io: { ignition: 0, total_odometer: 141230000 }, ts: new Date(Date.now() - 60000).toISOString(), lat: 44.43, lng: 26.1 });
  const ana = await om('ana.pop@ionescu.ro', 'Ana Pop', 'company_admin', co.id);
  const dan = await om('dan@ionescu.ro', 'Dan Dispecer', 'dispatcher', co.id);
  await json('PUT', '/api/users/' + ana.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/access', S, { devices: MAS.map((m) => m[0]), groups: [] });
  // Un ITP vechi la Caddy, ca din Documente.
  const itpVechi = (await json('POST', '/api/documents', ana.ck, { imei: MAS[1][0], doc_type: 'ITP', expiry_date: '2026-11-03' })).j;
  T('pregătire: firma pe Basic, Logan și Caddy (141.230 km), un ITP la Caddy, administratorul și dispecerul cu RA Insight', !!(co.id && ana.ck && dan.ck && itpVechi.id));
  const q0 = (await json('GET', '/api/ai/quota', ana.ck)).j;
  const mentenanta = async () => { const l = (await json('GET', '/api/maintenance?imei=' + MAS[1][0], ana.ck)).j; return Array.isArray(l) ? l : []; };
  const programate = async () => { const l = (await json('GET', '/api/report-schedules', ana.ck)).j; return Array.isArray(l) ? l : []; };
  const acte = async () => { const l = (await json('GET', '/api/documents?imei=' + MAS[1][0], ana.ck)).j; return Array.isArray(l) ? l : []; };
  const azi = ziIso(Date.now());

  // a) fraza din machetă → două cartonașe
  const r1 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Programează revizia la Caddy și trimite-mi în fiecare luni raportul de consum.', nou: true });
  const [pr, pp] = Array.isArray(r1.j.propuneri) ? r1.j.propuneri : [];
  T('fraza din machetă → „Sunt două lucruri. Le aprobi pe rând:", două cartonașe (revizia, raportul), pe reguli, „INSTANT · propunere"',
    r1.status === 200 && r1.j.reply === 'Sunt două lucruri. Le aprobi pe rând:' && r1.j.source === 'reguli' && pr && pr.fel === 'revizie' && pp && pp.fel === 'raport' &&
    pr.stare === 'propusa' && pp.stare === 'propusa' && r1.j.insigna && r1.j.insigna.detaliu === 'propunere' && !r1.j.propunere, r1.text.slice(0, 400));
  T('…revizia la B 268 ROY: termen 181.230 km sau pe ' + ddmmyyyy(plusLuni(azi, 24)) + ' (utilitară: 40.000 km / 2 ani), „Acum: 141.230 km"',
    pr && pr.titlu === 'Programez revizia la B 268 ROY' && pr.randuri[1].v === 'la 181.230 km sau pe ' + ddmmyyyy(plusLuni(azi, 24)) + ', ce vine întâi' && /^141\.230 km/.test(pr.randuri[2].v) && pr.poate === true, JSON.stringify(pr && pr.randuri));
  const primulLuni = reportSchedules.computeNextRun('weekly', 8, new Date()).getTime();
  T('…raportul Consum carburant: toată flota, ultimele 7 zile, în fiecare luni la 8:00, la adresa Anei, Excel, primul ' + programari.textPrimul(primulLuni),
    pp && pp.titlu === 'Programez raportul Consum carburant' && pp.randuri[0].v === 'Consum carburant · toată flota · ultimele 7 zile' && pp.randuri[1].v === 'în fiecare luni, la 8:00' && pp.randuri[2].v === 'ana.pop@ionescu.ro · Excel' && pp.randuri[3].v === programari.textPrimul(primulLuni), JSON.stringify(pp && pp.randuri));
  T('…nimic nu s-a pus încă (nici lucrare, nici programare)', (await mentenanta()).length === 0 && (await programate()).length === 0);
  // dispecerul: fără „modifică flota" nu pune revizia
  const rD = await json('POST', '/api/insight/intreaba', dan.ck, { message: 'Programează revizia la Caddy', nou: true });
  T('dispecerul vede revizia, cu „Da" oprit și cine aprobă; dacă apasă: 403', rD.status === 200 && (rD.j.propunere || {}).poate === false && /administratorul firmei, Ana Pop/.test((rD.j.propunere || {}).sub || '') &&
    (await json('POST', '/api/insight/actiuni/' + rD.j.propunere.id + '/aplica', dan.ck, {})).status === 403 && (await mentenanta()).length === 0, rD.text.slice(0, 300));
  // „Da" pe revizie, cu „Schimbă"
  const d1 = await json('POST', '/api/insight/actiuni/' + pr.id + '/aplica', ana.ck, { campuri: { tip: 'Revizie generală', km: '150.000', data: '' } });
  const l1 = await mentenanta();
  T('„Da" pe revizie (cu „Schimbă": la 150.000 km): lucrarea e în Mentenanță, ca din Adaugă, cu intervalul ei', d1.status === 200 && d1.j.propunere.stare === 'aplicata' && l1.length === 1 &&
    l1[0].type === 'Revizie generală' && Number(l1[0].due_km) === 150000 && !l1[0].due_date && Number(l1[0].interval_km) === 40000 && Number(l1[0].interval_months) === 24 && l1[0].status === 'pending' &&
    /^Gata\. \*\*Revizie generală\*\* la B 268 ROY e în Mentenanță, la 150\.000 km\.$/.test(d1.j.propunere.gata.text) && d1.j.propunere.gata.buton.ecran === 'maintenance', d1.text.slice(0, 300) + ' ' + JSON.stringify(l1));
  const aud = (await json('GET', '/api/audit?limit=80', S)).j;
  T('…în jurnal: „create maintenance", prin RA Insight', Array.isArray(aud) && aud.some((x) => x.action === 'create' && x.entity === 'maintenance' && x.details && x.details.prin === 'RA Insight'));
  T('…al doilea „Da": 409; tot o lucrare', (await json('POST', '/api/insight/actiuni/' + pr.id + '/aplica', ana.ck, {})).status === 409 && (await mentenanta()).length === 1);
  const an1 = await json('POST', '/api/insight/actiuni/' + pr.id + '/anuleaza', ana.ck);
  T('„Anulează": lucrarea iese din Mentenanță', an1.status === 200 && an1.j.text === 'Am anulat: „Revizie generală" la B 268 ROY nu mai e în Mentenanță.' && (await mentenanta()).length === 0, an1.text.slice(0, 200));
  // raportul: „Da" cu „Schimbă"
  const d2 = await json('POST', '/api/insight/actiuni/' + pp.id + '/aplica', ana.ck, { campuri: { frecventa: 'daily', ora: '7', perioada: 'yesterday', format: 'pdf', dest: 'sef@ionescu.ro', imei: '' } });
  const l2 = await programate();
  T('„Da" pe raport (cu „Schimbă": zilnic la 7, PDF, sef@ionescu.ro): programarea e în Rapoarte › Programări, ca din ecran', d2.status === 200 && l2.length === 1 && l2[0].report_type === 'consumption' &&
    l2[0].frequency === 'daily' && Number(l2[0].hour) === 7 && l2[0].format === 'pdf' && l2[0].period === 'yesterday' && l2[0].recipients === 'sef@ionescu.ro' && !l2[0].imei && l2[0].enabled !== false &&
    /^Gata\. Raportul \*\*Consum carburant\*\* pleacă în fiecare zi, la 7:00; primul, /.test(d2.j.propunere.gata.text) && d2.j.propunere.gata.buton.fel === 'programate', d2.text.slice(0, 300) + ' ' + JSON.stringify(l2));
  const an2 = await json('POST', '/api/insight/actiuni/' + pp.id + '/anuleaza', ana.ck);
  T('„Anulează": programarea iese din listă', an2.status === 200 && an2.j.text === 'Am anulat: raportul Consum carburant nu mai e programat.' && (await programate()).length === 0, an2.text.slice(0, 200));
  // conversația redeschisă: ambele cartonașe, cu starea de acum
  const cv = await json('GET', '/api/insight/conversatii/' + r1.j.conversatieId, ana.ck);
  const ms = (cv.j.mesaje || []).filter((m) => m.extra && Array.isArray(m.extra.propuneri));
  T('conversația redeschisă: cele două cartonașe, cu starea de ACUM (amândouă anulate)', ms.length === 1 && ms[0].extra.propuneri.map((p) => p.stare).join() === 'anulata,anulata', JSON.stringify(ms.map((m) => m.extra.propuneri.map((p) => p.stare))));

  // b) actul
  const exp = plusLuni(azi, 12);
  const r3 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Am făcut ITP la Caddy, expiră pe ' + ddmmyyyy(exp), nou: true });
  const pa = r3.j.propunere || {};
  T('„Am făcut ITP la Caddy, expiră pe …" → „Trec ITP-ul la B 268 ROY", cel de acum (03.11.2026) trece în istoric', r3.status === 200 && pa.fel === 'act' && pa.titlu === 'Trec ITP-ul la B 268 ROY' &&
    pa.randuri[1].v === ddmmyyyy(exp) && /până pe 03\.11\.2026 — trece în istoricul mașinii/.test(pa.randuri[2].v), r3.text.slice(0, 300));
  T('…începutul spune ce e (un act nu se „programează"): „Am pregătit actul…"', r3.j.reply === programari.TEXTE.unul.act && /^Am pregătit actul\./.test(r3.j.reply) &&
    rD.j.reply === programari.TEXTE.unul.revizie, r3.j.reply + ' | ' + rD.j.reply);
  const d3 = await json('POST', '/api/insight/actiuni/' + pa.id + '/aplica', ana.ck, {});
  const a3 = await acte();
  T('„Da" pe act: noul ITP e cel valabil, cel vechi a trecut în istoric (ca la Documente › Adaugă)', d3.status === 200 && a3.filter((x) => x.doc_type === 'ITP').length === 1 && String(a3.filter((x) => x.doc_type === 'ITP')[0].expiry_date).slice(0, 10) === exp &&
    d3.j.propunere.gata.buton.ecran === 'documente', d3.text.slice(0, 200) + ' ' + JSON.stringify(a3));
  const an3 = await json('POST', '/api/insight/actiuni/' + pa.id + '/anuleaza', ana.ck);
  const a4 = await acte();
  T('„Anulează": noul ITP iese, cel vechi e iar cel valabil', an3.status === 200 && an3.j.text === 'Am anulat: ITP la B 268 ROY a ieșit din Documente, iar cel de dinainte e iar cel valabil.' &&
    a4.filter((x) => x.doc_type === 'ITP').length === 1 && a4.filter((x) => x.doc_type === 'ITP')[0].id === itpVechi.id, an3.text.slice(0, 200) + ' ' + JSON.stringify(a4));
  const r4 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune RCA-ul la Logan', nou: true });
  T('un act fără dată → o cere, fără cartonaș', r4.status === 200 && !r4.j.propunere && r4.j.reply === programari.TEXTE.dataLipsa, r4.text.slice(0, 200));
  const r5 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Programează revizia la toată flota', nou: true });
  T('revizia pe toată flota → „pe o mașină. Pe care?", cu mașinile', r5.status === 200 && !r5.j.propunere && r5.j.reply === programari.TEXTE.oMasina && (r5.j.alege || []).length === 2, r5.text.slice(0, 300));
  // c) ce NU e al ei
  const r6 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Fă-mi raportul de consum pe săptămâna trecută', nou: true });
  T('„Fă-mi raportul de consum pe săptămâna trecută" rămâne un raport pe loc (cartonașul raportului, nu o programare)', r6.status === 200 && !r6.j.propunere && !r6.j.propuneri && !!r6.j.raport, r6.text.slice(0, 300));
  // d) pachetul și fondatorul
  const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start SRL' })).j;
  await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000092101', nume: 'Dacia Logan', nr_inmatriculare: 'B 101 STA' }] });
  await json('PUT', '/api/devices/350000000092101/company', S, { company_id: coS.id });
  const st = await om('sef@start.ro', 'Șef Start', 'company_admin', coS.id);
  await json('PUT', '/api/users/' + st.id + '/ai-seat', S, { on: true });
  const rs = await json('POST', '/api/insight/intreaba', st.ck, { message: 'Programează revizia la B 101 STA', nou: true });
  T('pe Start: fără cartonaș — „de la pachetul Basic în sus"', rs.status === 200 && !rs.j.propunere && rs.j.reply === programari.TEXTE.pachet, rs.text.slice(0, 300));
  const rf = await json('POST', '/api/insight/intreaba', S, { message: 'Programează revizia la B 268 ROY', nou: true });
  T('contul de fondator n-are o flotă: o spune, fără cartonaș', !rf.j.propunere && rf.j.reply === programari.TEXTE.fondator, rf.text.slice(0, 300));
  const q1 = (await json('GET', '/api/ai/quota', ana.ck)).j;
  T('nimic nu s-a numărat (propunerile și „Da" sunt pe reguli) și ZERO cereri către model', JSON.stringify(q1.folosite != null ? q1.folosite : q1.used) === JSON.stringify(q0.folosite != null ? q0.folosite : q0.used) && nModel() === 0,
    JSON.stringify({ q0, q1, model: nModel() }).slice(0, 300));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e)); gata(1); });
