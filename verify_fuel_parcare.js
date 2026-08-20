// verify_fuel_parcare.js — „chiar a dispărut combustibil?", cazul care a produs alarma falsă.
//
// Pornit de la un caz real (Robert, 20.08): notificare „scădere de la 43 L la 32 L", fără să se fi
// întâmplat nimic. Regula veche compara O SINGURĂ citire de la oprirea motorului cu O SINGURĂ
// citire de la pornire — adică exact citirea cea mai nesigură din tot ciclul.
//
// Testele de aici apără două lucruri deodată, care se bat cap în cap dacă nu ești atent:
//   • un furt ADEVĂRAT trebuie să dea în continuare alertă (altfel am „reparat" prin surzenie);
//   • o sondă care se așază după pornire NU trebuie să dea alertă.
//
// Rulează instant, fără server: node verify_fuel_parcare.js
const ft = require('./fueltheft.js');

let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

const MIN = 60000;
const PRAG = 10; // fuelTheftL al companiei: 10 litri

// Derulează o listă de [minut, ignition, litri(sau null), sursă?] și întoarce alertele emise.
function ruleaza(pasi, prag) {
  let st = ft.stareNoua();
  const alerte = [];
  for (const [min, ign, litri, sursa] of pasi) {
    const io = { ignition: ign };
    if (litri != null) io[sursa || 'fuel_level_liters'] = litri;
    const r = ft.pas(st, io, prag == null ? PRAG : prag, min * MIN);
    st = r.st;
    if (r.alerta) alerte.push(r.alerta);
  }
  return alerte;
}

console.log('\n══ Cazul raportat: sonda se așază după pornire ══\n');

// Mașina parchează seara cu 43 L. Dimineața, primul cadru CAN după contact spune 32 L; peste
// câteva minute revine la 43. Nimeni n-a furat nimic.
let a = ruleaza([
  [0, 1, 43], [5, 0, 43],          // merge, apoi oprește motorul cu 43 L
  [600, 1, 32],                     // a doua zi: contact pornit, prima citire minte
  [603, 1, 42.5],                   // sonda s-a așezat
  [610, 1, 43],
]);
t('citire proastă la pornire, apoi revine → NICIO alertă', a.length === 0, JSON.stringify(a));

// Varianta și mai scurtă: citirea mincinoasă e chiar în fereastra de așezare și nici nu se ia în seamă.
a = ruleaza([[0, 1, 43], [5, 0, 43], [600, 1, 30], [601, 1, 43], [605, 1, 43], [612, 1, 43]]);
t('citirea din primele 2 minute după contact e ignorată', a.length === 0, JSON.stringify(a));

console.log('\n══ Furt adevărat: nivelul RĂMÂNE jos ══\n');

a = ruleaza([
  [0, 1, 43], [5, 0, 43],          // parchează cu 43 L
  [600, 1, 32],                     // pornește: 32 L
  [603, 1, 32], [606, 1, 31.8], [610, 1, 32],   // și rămâne acolo
]);
t('scădere care nu revine → alertă', a.length === 1, JSON.stringify(a));
t('modul e „cât a stat oprit"', a[0] && a[0].mode === 'parked', a[0] && a[0].mode);
t('raportează de la cât la cât', a[0] && a[0].from === 43 && a[0].to === 31.8, JSON.stringify(a[0]));
t('cantitatea, peste pragul companiei', a[0] && a[0].drop > PRAG, a[0] && String(a[0].drop));

// Un furt sub pragul companiei nu se raportează.
a = ruleaza([[0, 1, 43], [5, 0, 43], [600, 1, 37], [603, 1, 37], [606, 1, 37], [610, 1, 37]]);
t('scădere de 6 L sub pragul de 10 L → fără alertă', a.length === 0, JSON.stringify(a));

console.log('\n══ Scări diferite: rezervor calibrat vs. CAN brut ══\n');

// La oprire raporta rezervorul calibrat (43 L), la pornire doar CAN-ul brut (32 L). Nu e o scădere,
// sunt două moduri de a măsura. Comparația asta producea „furturi" din senin.
a = ruleaza([
  [0, 1, 43, 'tank_level_liters'], [5, 0, 43, 'tank_level_liters'],
  [600, 1, 32, 'can_fuel_level_liters'], [605, 1, 32, 'can_fuel_level_liters'],
  [610, 1, 32, 'can_fuel_level_liters'], [615, 1, 32, 'can_fuel_level_liters'],
]);
t('sursă schimbată între oprire și pornire → NU se compară', a.length === 0, JSON.stringify(a));

// Dar dacă sursa e aceeași, comparația e validă.
a = ruleaza([
  [0, 1, 43, 'tank_level_liters'], [5, 0, 43, 'tank_level_liters'],
  [600, 1, 32, 'tank_level_liters'], [605, 1, 32, 'tank_level_liters'],
  [610, 1, 32, 'tank_level_liters'], [615, 1, 32, 'tank_level_liters'],
]);
t('aceeași sursă → alertă', a.length === 1, JSON.stringify(a));

console.log('\n══ Prudență ══\n');

// Prag nesetat = detecția e oprită pentru companie (decizia din 26.07: „nesetat" nu devine „prag 0").
a = ruleaza([[0, 1, 43], [5, 0, 43], [600, 1, 20], [605, 1, 20], [610, 1, 20], [615, 1, 20]], 0);
t('fără prag setat → detecția e oprită', a.length === 0, JSON.stringify(a));

// Pachet fără contact (heartbeat GPS) nu trebuie să pară „a oprit motorul".
a = ruleaza([[0, 1, 43], [2, null, 43], [4, 1, 43], [6, 1, 43]]);
t('pachet fără contact nu inventează o oprire', a.length === 0, JSON.stringify(a));

// Alimentare: nivelul URCĂ — nicio scădere.
a = ruleaza([[0, 1, 20], [5, 0, 20], [600, 1, 70], [605, 1, 70], [610, 1, 70], [615, 1, 70]]);
t('alimentare (nivelul urcă) → fără alertă', a.length === 0, JSON.stringify(a));

// Suspiciune care nu se confirmă niciodată (mașina nu mai transmite) → se uită, nu se emite orbește.
let st = ft.stareNoua();
st = ft.pas(st, { ignition: 1, fuel_level_liters: 43 }, PRAG, 0).st;
st = ft.pas(st, { ignition: 0, fuel_level_liters: 43 }, PRAG, 5 * MIN).st;
st = ft.pas(st, { ignition: 1, fuel_level_liters: 32 }, PRAG, 600 * MIN).st;
const e = ft.expira(st, PRAG, (600 + 180) * MIN);
t('suspiciune de parcare neconfirmată în 2h → uitată, nu emisă', e.alerta === null && !e.st.pend, JSON.stringify(e.alerta));

console.log('\n══ În mers: comportamentul vechi rămâne ══\n');

// Scădere bruscă în mers care revine (clătinare pe pantă) → fără alertă.
a = ruleaza([[0, 1, 60], [3, 1, 45], [6, 1, 59], [9, 1, 60]]);
t('scădere în mers care revine → fără alertă', a.length === 0, JSON.stringify(a));

// Scădere bruscă în mers care NU revine timp de o oră → alertă.
a = ruleaza([[0, 1, 60], [3, 1, 45], [30, 1, 45], [64, 1, 45]]);
t('scădere în mers nerevenită în 1h → alertă', a.length === 1 && a[0].mode === 'motion', JSON.stringify(a));

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
