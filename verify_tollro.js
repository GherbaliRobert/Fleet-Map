// verify_tollro.js — calculul taxei rutiere pe kilometru (TollRo).
//
// Aici se calculează BANI, iar cifrele ajung în oferte către clienți. Testele apără trei lucruri:
//   • încadrarea corectă (sub 3,5 t NU e TollRo — e rovinietă; a spune altceva e o minciună scumpă);
//   • tarifele publicate să iasă exact cum sunt publicate;
//   • prudența: date lipsă din fișă → estimare pe cazul cel mai scump, cu avertisment, nu o cifră
//     optimistă pe care omul o pune în ofertă și pierde bani.
//
// Rulează instant, fără server: node verify_tollro.js
const T = require('./tollro.js');

let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const DUPA = '2026-12-01';   // după intrarea în vigoare
const INAINTE = '2026-05-01';

console.log('\n══ Încadrarea vehiculului ══\n');
t('autoturism (1.800 kg) → nu intră la TollRo', T.categorieDupaMasa(1800) === null, String(T.categorieDupaMasa(1800)));
t('autoutilitară 3,5 t exact → tot rovinietă', T.categorieDupaMasa(3500) === 'c1', String(T.categorieDupaMasa(3500)));
t('camion 7.500 kg → treapta 7,5–12 t', T.categorieDupaMasa(7500) === 'c2', String(T.categorieDupaMasa(7500)));
t('cap tractor 30 t → peste 12 t', T.categorieDupaMasa(30000) === 'c3', String(T.categorieDupaMasa(30000)));
t('masă lipsă → fără încadrare', T.categorieDupaMasa(null) === null && T.categorieDupaMasa('') === null);

console.log('\n══ Norma de poluare, scrisă cum vrea omul ══\n');
[['Euro 6', 'euro6'], ['EURO6', 'euro6'], ['euro VI', 'euro6'], ['6', 'euro6'], ['Euro 5', 'euro5'],
 ['Euro 4', 'euro4'], ['Euro 3', 'euro3'], ['Euro 2', 'euro3'], ['euro-ii', 'euro3'], ['Euro 7', 'euro6']]
  .forEach(([intrare, astept]) => t('„' + intrare + '" → ' + astept, T.euroNormalizat(intrare) === astept, String(T.euroNormalizat(intrare))));
t('text fără sens → necunoscut', T.euroNormalizat('n/a') === null && T.euroNormalizat('') === null);

console.log('\n══ Tarifele PUBLICATE ies exact ══\n');
// Peste 12 t, Euro VI: 0,48 lei/km autostradă și 0,24 lei/km drum național (exact cifrele din piață).
let r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: 100, national: 100, alte: 50 }, null, DUPA);
t('se aplică', r.aplicabil === true, r.motiv);
t('autostradă 0,48 lei/km', r.leiPerKm.autostrada === 0.48, String(r.leiPerKm.autostrada));
t('drum național 0,24 lei/km', r.leiPerKm.national === 0.24, String(r.leiPerKm.national));
t('100 km autostradă = 48 lei', r.linii[0].cost === 48, String(r.linii[0].cost));
t('100 km național = 24 lei', r.linii[1].cost === 24, String(r.linii[1].cost));
t('celelalte drumuri NU se taxează', r.linii[2].cost === 0 && r.linii[2].taxabil === false, JSON.stringify(r.linii[2]));
t('total = 72 lei', r.total === 72, String(r.total));
t('tariful NU e marcat ca presupus (e publicat)', r.tarifPresupus === false);

// Cel mai poluant, peste 12 t: 0,62 / 0,31.
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 3' }, { autostrada: 1000, national: 0, alte: 0 }, null, DUPA);
t('Euro 3, 1000 km autostradă = 620 lei', r.total === 620, String(r.total));

// Exemplul din presă: 1000 km autostradă, peste 12 t, Euro VI → ~480 lei.
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: 1000 }, null, DUPA);
t('1000 km autostradă, Euro VI = 480 lei', r.total === 480, String(r.total));

console.log('\n══ Prudență: ce facem când fișa e incompletă ══\n');
r = T.estimeaza({ masaKg: 30000, euro: null }, { autostrada: 100 }, null, DUPA);
t('fără normă Euro → calculăm la tariful MAXIM', r.euro === 'euro3' && r.total === 62, r.euro + ' / ' + r.total);
t('și o spunem', r.avertismente.some(a => /norma de poluare/i.test(a)), JSON.stringify(r.avertismente));

r = T.estimeaza({ masaKg: 1800, euro: 'Euro 6' }, { autostrada: 500 }, null, DUPA);
t('autoturism → NU calculăm taxă', r.aplicabil === false && r.total === 0, JSON.stringify(r));
t('și explicăm că rămâne rovinieta', /rovinie/i.test(r.motiv), r.motiv);

r = T.estimeaza({ masaKg: null, euro: 'Euro 6' }, { autostrada: 500 }, null, DUPA);
t('fără masă în fișă → refuzăm calculul, nu ghicim', r.aplicabil === false && /masa/i.test(r.motiv), r.motiv);

r = T.estimeaza({ masaKg: 10000, euro: 'Euro 6' }, { autostrada: 100 }, null, DUPA);
t('treapta 7,5–12 t e marcată ca NEPUBLICATĂ', r.tarifPresupus === true);
t('și apare avertisment', r.avertismente.some(a => /nu e publicat/i.test(a)), JSON.stringify(r.avertismente));

console.log('\n══ Data intrării în vigoare ══\n');
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: 100 }, null, INAINTE);
t('înainte de 1 octombrie 2026 → previziune, nu factură', r.inVigoare === false && r.avertismente.some(a => /previziune/i.test(a)), JSON.stringify(r.avertismente));
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: 100 }, null, DUPA);
t('după → în vigoare', r.inVigoare === true);

console.log('\n══ Grila editată de super-admin ══\n');
const g = T.grilaValida({ aplicabilDin: '2027-01-01', tarife: { c3: { euro6: { autostrada: 0.55, national: 0.30 } } } });
t('valorile scrise de om se păstrează', g.tarife.c3.euro6.autostrada === 0.55 && g.tarife.c3.euro6.national === 0.30, JSON.stringify(g.tarife.c3.euro6));
t('data se păstrează', g.aplicabilDin === '2027-01-01', g.aplicabilDin);
t('restul grilei rămâne implicit', g.tarife.c1.euro6.autostrada === 0.22, String(g.tarife.c1.euro6.autostrada));
t('valoarea scrisă de om nu mai e „presupusă"', g.tarife.c3.euro6.presupus === false);

// Valori absurde: mai bine implicitul decât o taxă de 900 lei/km salvată din greșeală.
const gr = T.grilaValida({ tarife: { c3: { euro6: { autostrada: 900, national: -5 } } } });
t('tarif absurd de mare → respins', gr.tarife.c3.euro6.autostrada === 0.48, String(gr.tarife.c3.euro6.autostrada));
t('tarif negativ → respins', gr.tarife.c3.euro6.national === 0.24, String(gr.tarife.c3.euro6.national));
t('grilă lipsă → implicitele', T.grilaValida(null).tarife.c3.euro3.autostrada === 0.62);

console.log('\n══ Tipul drumului din OpenStreetMap ══\n');
[['motorway', 'autostrada'], ['motorway_link', 'autostrada'], ['trunk', 'autostrada'],
 ['primary', 'national'], ['primary_link', 'national'],
 ['secondary', 'alte'], ['residential', 'alte'], ['nimic', 'alte']]
  .forEach(([hw, astept]) => t(hw + ' → ' + astept, T.clasaDinOsm(hw) === astept, T.clasaDinOsm(hw)));

console.log('\n══ Aritmetică ══\n');
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: 55.3, national: 148.3, alte: 24.9 }, null, DUPA);
// Ruta din captura clientului: 55,3 km autostradă + 148,3 km național
t('55,3 km autostradă = 26,54 lei', r.linii[0].cost === 26.54, String(r.linii[0].cost));
t('148,3 km național = 35,59 lei', r.linii[1].cost === 35.59, String(r.linii[1].cost));
t('total = 62,13 lei', r.total === 62.13, String(r.total));
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, {}, null, DUPA);
t('fără kilometri → total 0, fără eroare', r.total === 0 && r.aplicabil === true);
r = T.estimeaza({ masaKg: 30000, euro: 'Euro 6' }, { autostrada: -100 }, null, DUPA);
t('kilometri negativi → ignorați', r.total === 0, String(r.total));

console.log('\n══ Culorile spun cât costă, nu ce fel de drum e ══\n');
// Roșu pe autostradă, verde pe național. Alegerea are sens DOAR cât timp autostrada rămâne mai
// scumpă — altfel roșul ar sta pe cel ieftin și ecranul ar minți prin culoare, tăcut.
const _c = (k) => (T.CLASE_DRUM.find(x => x.key === k) || {}).culoare;
t('autostrada e roșie (cea scumpă)', _c('autostrada') === '#ef4444', _c('autostrada'));
t('nationalul e verde (cel ieftin)', _c('national') === '#22c55e', _c('national'));
t('drumurile netaxate au culoare neutră, nu verde',
  _c('alte') !== '#22c55e' && (T.CLASE_DRUM.find(x => x.key === 'alte') || {}).taxabil === false, _c('alte'));
let _inv = [];
for (const c of T.CATEGORII) for (const e of T.EURO) {
  const tf = T.GRILA_IMPLICITA.tarife[c.key][e.key];
  if (tf.autostrada < tf.national) _inv.push(c.key + '/' + e.key);
}
t('autostrada e mai scumpă decât nationalul în TOATE celulele grilei',
  _inv.length === 0, _inv.join(', ') + ' — dacă raportul s-a schimbat, culorile trebuie reevaluate');

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
