// verify_docparse_acte.js — extragerea din acte REALE, pe forme diferite de așezare în pagină.
//
// De ce există separat de verify_docscan.js: acela verifică LANȚUL (server, rute, salvare), pe un
// singur act ideal. Ăsta verifică EXTRAGEREA, pe multe forme — și e locul unde se adaugă fiecare
// act care a fost citit greșit în producție. Rulează instant, fără server.
//
// Pornit de la un caz real (Robert, 18.08): o poliță RCA încărcată a completat doar tipul și seria;
// emitentul și AMBELE date au rămas goale — adică exact câmpul care pornește alertele. Cauzele au
// fost trei, toate în regulile de aici, nu în PDF.
const dp = require('./docparse.js');

let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const P = (txt, tip) => dp.parse(txt, tip || 'auto').campuri;

console.log('\n══ Extragerea din acte: forme diferite de așezare ══\n');

// ── RCA așezat în TABEL: eticheta și valoarea ajung departe una de alta după extragerea din PDF.
// Fereastra veche de căutare (60 de caractere) nu le prindea. ──
console.log('── RCA în tabel ──');
const a = P([
  'POLITA DE ASIGURARE OBLIGATORIE RCA',
  'ASIGURATOR   SOCIETATEA X ASIGURARI S.A.',
  'Seria CU Nr. 10309310',
  'Numar de inmatriculare      B 268 ROY',
  'Perioada de valabilitate  de la 15.01.2026  pana la  14.01.2027',
].join('\n'));
t('tipul e RCA', a.doc_type === 'RCA', a.doc_type);
t('DATA EXPIRĂRII — câmpul care pornește alertele', a.expiry_date === '2027-01-14', a.expiry_date);
t('data emiterii', a.issue_date === '2026-01-15', a.issue_date);
t('seria ȘI numărul, deși „Nr." stă între ele', a.number === 'CU/10309310', a.number);
t('emitentul, fără cuvântul-etichetă în față', a.issuer === 'SOCIETATEA X ASIGURARI', a.issuer);
t('numărul de înmatriculare', a.plate === 'B 268 ROY', a.plate);

// ── RCA pe UN SINGUR RÂND, cu serie compusă ──
console.log('\n── RCA pe un rând, serie compusă ──');
const b = P('RCA OMNIASIG Seria RO/22/H22 Nr 123456789 valabila de la 01.03.2026 pana la 28.02.2027 B 268 ROY');
t('seria compusă nu se pierde', b.number === 'RO/22/H22/123456789', b.number);
t('expirarea', b.expiry_date === '2027-02-28', b.expiry_date);
t('asigurătorul cunoscut', b.issuer === 'OMNIASIG', b.issuer);

// ── ITP: alt emitent (stație, nu asigurător) și capcana „Nr. înmatriculare" ──
console.log('\n── ITP ──');
const c = P([
  'CERTIFICAT INSPECTIE TEHNICA PERIODICA',
  'Statia: ITP GENERAL SRL',
  'Nr. inmatriculare B 268 ROY',
  'Valabil pana la 25.01.2027',
].join('\n'));
t('tipul e ITP', c.doc_type === 'ITP', c.doc_type);
t('expirarea', c.expiry_date === '2027-01-25', c.expiry_date);
t('stația, nu un asigurător', c.issuer === 'ITP GENERAL SRL', c.issuer);
t('„înmatriculare" NU devine număr de act', !c.number || /\d/.test(c.number), c.number);

// ── Talonul: codurile armonizate, cazul pentru care regulile sunt cele mai puternice ──
console.log('\n── Talon ──');
const d = P([
  'CERTIFICAT DE INMATRICULARE',
  'A) TM 10 ABC', 'B) 15.03.2019',
  'D.1) DACIA', 'D.2) LOGAN',
  'E) UU1SDJKL5MJ123456',
  'J) N1', 'P.1) 1461', 'P.2) 66', 'P.3) MOTORINA', 'S.1) 5',
  'F.1) 1900', 'G) 1200',
].join('\n'));
t('VIN', d.vin === 'UU1SDJKL5MJ123456', d.vin);
t('marca și modelul', d.brand === 'DACIA' && d.model === 'LOGAN', d.brand + '/' + d.model);
t('combustibilul, în vocabularul formularului', d.fuel_type === 'Motorina', d.fuel_type);
t('categoria N1 → autoutilitară (propusă)', d.vehicle_type === 'autoutilitara', d.vehicle_type);
t('cilindree, putere, locuri', d.displacement === 1461 && d.power_kw === 66 && d.passenger_seats === 5,
  d.displacement + '/' + d.power_kw + '/' + d.passenger_seats);
t('masele', d.max_weight_legal === 1900 && d.tare_weight === 1200, d.max_weight_legal + '/' + d.tare_weight);
t('anul din data primei înmatriculări', d.year === 2019, d.year);

// ── Cazul REAL raportat (Robert, 18.08): PDF care scrie titlul cu litere spațiate și e plin de
// etichete de formular. Emitentul ieșea „O R I G I N A L 9. N UMELE SI ADRESA". ──
console.log('\n── Poliță reală: litere spațiate + etichete de formular ──');
const g = P([
  'O R I G I N A L',
  'POLITA DE ASIGURARE RCA',
  '9. NUMELE SI ADRESA ASIGURATULUI',
  'POPESCU ION, STR. LUNGA 5',
  'Seria CU Nr. 10309310',
  'B 268 ROY   WV2ZZZ2KZ8X017409',
  'Valabila de la 28.07.2026 pana la 27.07.2027',
].join('\n'));
t('eticheta de formular NU devine emitent', !/UMELE|ADRESA|ORIGINAL/.test(String(g.issuer || '')), g.issuer);
t('expirarea', g.expiry_date === '2027-07-27', g.expiry_date);
t('emiterea', g.issue_date === '2026-07-28', g.issue_date);
t('seria', g.number === 'CU/10309310', g.number);
t('VIN-ul din poliță', g.vin === 'WV2ZZZ2KZ8X017409', g.vin);

// Litere spațiate în titlu: fără lipirea lor, nicio regulă nu se potrivește.
const h = P(['P O L I T A DE ASIGURARE RCA', 'GROUPAMA ASIGURARI S.A.', 'Valabil pana la 01.01.2028'].join('\n'));
t('„P O L I T A" lipit → tipul se recunoaște', h.doc_type === 'RCA', h.doc_type);
t('asigurătorul din listă', h.issuer === 'GROUPAMA', h.issuer);

// Asigurător care NU e în listă: se prinde generic, dar curat.
const k = P(['POLITA RCA', 'ASIGURATOR: VIENNA LIFE ASIGURARI S.A.', 'Valabil de la 01.01.2027 pana la 31.12.2027'].join('\n'));
t('firmă necunoscută, fără cuvântul-etichetă', !!k.issuer && !/ASIGURATOR/.test(k.issuer), k.issuer);

// ── Ce NU trebuie să se întâmple ──
console.log('\n── Prudență ──');
const e = P('Document oarecare fara date si fara numere de act.');
t('text fără nimic util → nu inventează expirare', e.expiry_date == null, e.expiry_date);
const f = P('RCA valabil pana la 31.02.2027');   // 31 februarie nu există
t('dată imposibilă (31 februarie) → respinsă', f.expiry_date == null, f.expiry_date);

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
