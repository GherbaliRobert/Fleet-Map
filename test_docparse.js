// test_docparse.js — extragerea câmpurilor din acte, pe text realist, FĂRĂ rețea și fără server.
//
// Textele de mai jos imită ce iese dintr-o citire automată de talon/RCA: coloane amestecate,
// diacritice pierdute, O confundat cu 0, spații în locuri aiurea. Dacă parserul rezistă aici,
// are o șansă pe documente reale; dacă pică aici, nu are rost să-l legăm de interfață.
//
// ATENȚIE LA VOCABULAR: valorile așteptate sunt EXACT cele din selectoare (`Motorina`, nu 'diesel';
// `autoturism`, nu 'M1') — testul păzește contractul cu formularul, nu doar extragerea.
const dp = require('./docparse');
let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

console.log('\n══ docparse: talon / CIV / RCA / ITP ══\n');

// ── 1. Talon curat, așezat ca pe document ──
const TALON = `
CERTIFICAT DE INMATRICULARE
A) TM 12 ABC
B) 15.03.2019
D.1) DACIA
D.2) SD LOGAN
D.3) LOGAN II 1.5 DCI
E) UU1SDABC4KL123456
F.1) 1980
G) 1165
J) N1
P.1) 1461
P.2) 70
P.3) MOTORINA
S.1) 5
`;
const r1 = dp.parse(TALON, 'auto');
t('tipul detectat singur: talon', r1.tip === 'talon', r1.tip);
t('numărul de înmatriculare', r1.campuri.plate === 'TM 12 ABC', r1.campuri.plate);
t('VIN complet, 17 caractere', r1.campuri.vin === 'UU1SDABC4KL123456', r1.campuri.vin);
t('marca', r1.campuri.brand === 'DACIA', r1.campuri.brand);
t('anul din prima înmatriculare', r1.campuri.year === 2019, String(r1.campuri.year));
t('combustibil ÎN VOCABULARUL selectorului', r1.campuri.fuel_type === 'Motorina', r1.campuri.fuel_type);
t('masa proprie (G)', r1.campuri.tare_weight === 1165, String(r1.campuri.tare_weight));
t('masa maximă (F.1)', r1.campuri.max_weight_legal === 1980, String(r1.campuri.max_weight_legal));
t('cilindree (P.1)', r1.campuri.displacement === 1461, String(r1.campuri.displacement));
t('putere kW (P.2)', r1.campuri.power_kw === 70, String(r1.campuri.power_kw));
t('locuri (S.1)', r1.campuri.passenger_seats === 5, String(r1.campuri.passenger_seats));
t('categoria J=N1 → propune „autoutilitara"', r1.campuri.vehicle_type === 'autoutilitara', r1.campuri.vehicle_type);
t('categoria brută păstrată la vedere', r1.campuri.vehicle_type_raw === 'N1', r1.campuri.vehicle_type_raw);
t('fiecare câmp are grad de încredere', Object.keys(r1.campuri).every(k => typeof r1.incredere[k] === 'number'));

// ── 2. Talon citit PROST: O în loc de 0 în VIN, spații rupte ──
const TALON_MURDAR = `
CERTIFICAT DE INMATRICULARE
A) B 123 XYZ
D.1) VOLVO
E) YV2AS02A8KBO54321
P.3) DIESEL
G) 7 500
F.1) 18 000
`;
const r2 = dp.parse(TALON_MURDAR, 'talon');
t('VIN reparat: O devine 0 (litera O nu există în VIN)', r2.campuri.vin === 'YV2AS02A8KB054321', r2.campuri.vin);
t('marca VOLVO rămâne cu O (contextul contează)', r2.campuri.brand === 'VOLVO', r2.campuri.brand);
t('„B 123 XYZ" acceptat (Bucureștiul are un singur B)', r2.campuri.plate === 'B 123 XYZ', r2.campuri.plate);
t('„DIESEL" → tot Motorina', r2.campuri.fuel_type === 'Motorina', r2.campuri.fuel_type);
t('mase cu spații în cifre: 7 500 → 7500', r2.campuri.tare_weight === 7500, String(r2.campuri.tare_weight));

// ── 3. RCA — perioadă de valabilitate + asigurător + serie ──
const RCA = `
POLITA DE ASIGURARE RCA
RASPUNDERE CIVILA AUTO
ALLIANZ TIRIAC ASIGURARI S.A.
Seria RO/22/H22 Nr. 123456789
Numar de inmatriculare: TM 12 ABC
Serie sasiu: UU1SDABC4KL123456
Valabilitate: de la 01.09.2026 pana la 28.02.2027
`;
const r3 = dp.parse(RCA, 'auto');
t('tipul detectat singur: RCA', r3.campuri.doc_type === 'RCA', r3.campuri.doc_type);
t('începutul valabilității', r3.campuri.issue_date === '2026-09-01', r3.campuri.issue_date);
t('EXPIRAREA — câmpul care pornește alertele', r3.campuri.expiry_date === '2027-02-28', r3.campuri.expiry_date);
t('asigurătorul recunoscut', r3.campuri.issuer === 'ALLIANZ', r3.campuri.issuer);
t('vehiculul de care se leagă (nr.)', r3.campuri.plate === 'TM 12 ABC', r3.campuri.plate);
t('vehiculul de care se leagă (VIN)', r3.campuri.vin === 'UU1SDABC4KL123456', r3.campuri.vin);

// ── 4. ITP — o singură dată pe document = expirarea ──
const ITP = `
INSPECTIA TEHNICA PERIODICA
Statia ITP AUTO TEST SRL
Nr. inmatriculare TM 12 ABC
Data expirare ITP: 14.08.2027
`;
const r4 = dp.parse(ITP, 'auto');
t('tipul detectat singur: ITP', r4.campuri.doc_type === 'ITP', r4.campuri.doc_type);
t('data de expirare', r4.campuri.expiry_date === '2027-08-14', r4.campuri.expiry_date);

// ── 5. Ce NU trebuie să facă ──
const GOL = dp.parse('text oarecare fara nimic util', 'auto');
t('text fără sens → nu inventează câmpuri', Object.keys(GOL.campuri).filter(k => k !== 'doc_type').length === 0,
  JSON.stringify(GOL.campuri));
const seriiNuVin = dp.parse('E) 12345678901234567', 'talon');   // 17 cifre — serie de document, nu VIN
t('17 cifre pure NU devin VIN (VIN-ul are și litere)', seriiNuVin.campuri.vin == null, seriiNuVin.campuri.vin);
// Anul din două cifre
t('data „15.03.19" → 2019', dp.ziLunaAn('15', '03', '19') === '2019-03-15');
t('data „15.03.98" → 1998', dp.ziLunaAn('15', '03', '98') === '1998-03-15');
t('data invalidă „32.13.2020" → respinsă', dp.ziLunaAn('32', '13', '2020') === null);

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
