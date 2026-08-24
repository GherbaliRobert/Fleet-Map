// verify_consum.js — cifra de consum din rapoarte, verificată pe un adevăr CUNOSCUT.
//
//   node verify_consum.js
//
// De ce există: pe 24.08 Robert a scos un raport care zicea 52 de litri la o mașină care consumase
// 27. Cauza: consumul din senzorul de nivel se calcula adunând TOATE scăderile de nivel. Nivelul
// dintr-un rezervor oscilează (combustibilul se plimbă la viraje, pante, frânări), iar adunând doar
// coborârile aduni și zgomotul — mereu în plus, niciodată în minus. Cât se aduna depindea de cât de
// des transmite trackerul: pe același drum, punct la 10 s dădea 208 L, punct la 5 min dădea 25.
//
// Proba construiește un drum în care se știe exact cât s-a consumat și cere raportul REAL. Consumul
// din fișa mașinii e pus INTENȚIONAT diferit (15 L/100km → 45 L), ca să se vadă dacă cifra vine din
// datele mașinii sau dintr-o estimare care doar pare plauzibilă.
const reports = require('./reports.js');

let _s = 12345;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };

const KM = 300, LITRI = 27;   // adevărul

function drum({ zgomot = 0, cumul = null, pas = 30, alimentare = null }) {
  const pts = [];
  const N = Math.round(5 * 3600 / pas);
  const t0 = Date.parse('2026-08-20T06:00:00Z');
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    let consumat = LITRI * f;
    let nivelReal = 60 - consumat;
    if (alimentare && f > 0.5) nivelReal += alimentare;   // a alimentat la jumătatea drumului
    const nivel = nivelReal + (zgomot ? (rnd() - 0.5) * 2 * zgomot : 0);
    const io = { ignition: 1, fuel_level_liters: Math.round(nivel * 10) / 10, total_odometer: Math.round(KM * 1000 * f) };
    if (cumul) Object.assign(io, cumul(consumat, i));
    pts.push({ timestamp: new Date(t0 + i * pas * 1000).toISOString(), latitude: 44.4 + f * 2.7, longitude: 26.1, speed: 60, io_data: io });
  }
  return pts;
}

const fakeDb = (pts) => ({
  getDeviceHistory: async () => pts,
  pool: { query: async (sql) => /FROM devices/i.test(sql)
    ? { rows: [{ imei: 'X1', name: 'Mașina lui Robert', plate: 'B 01 ABC', vehicle_type: 'Auto',
        fuel_type: 'motorina', fuel_price: 7.5, consumption_road: 15, consumption_city: 15,
        consumption_idle: 0.8, tank_capacity: 60 }] }
    : { rows: [] } },
});

let ok = 0, rele = 0;
async function ruleaza(nume, pts, tolerantaPct) {
  const db = fakeDb(pts);
  const r = await reports.runReport(db, 'consumption', ['X1'], '2026-08-20T00:00:00Z', '2026-08-21T00:00:00Z', {});
  const c = r.columns, row = r.rows[0] || [];
  const g = (n) => row[c.indexOf(n)];
  const litri = parseFloat(g('Consumat'));
  const fs = await reports.fuelStats(db, ['X1'], '2026-08-20T00:00:00Z', '2026-08-21T00:00:00Z', {});
  const pv = (fs.perVehicle || [])[0] || {};
  const tol = tolerantaPct || 10;
  const abatere = ((litri / LITRI - 1) * 100);
  const abatereA = pv.liters != null ? ((pv.liters / LITRI - 1) * 100) : 999;
  const bun = Math.abs(abatere) <= tol && Math.abs(abatereA) <= tol;
  if (bun) ok++; else rele++;
  console.log('  ' + (bun ? '✓' : '✗') + ' ' + nume.padEnd(44) +
    String(litri.toFixed(1) + ' L').padStart(8) +
    '  (' + (abatere >= 0 ? '+' : '') + abatere.toFixed(0) + '%)' +
    '  analitic ' + String((pv.liters != null ? pv.liters : '—') + ' L').padStart(8) +
    '  ' + g('Sursă'));
  // Cele două rapoarte trebuie să spună ACELAȘI lucru — se contraziceau (unul avea o gardă de o oră
  // la alimentări, celălalt nu), iar clientul le vedea pe amândouă.
  if (pv.liters != null && Math.abs(pv.liters - litri) > 1.5) {
    rele++; console.log('    ✗ raportul și analiticul nu se potrivesc: ' + litri + ' vs ' + pv.liters);
  } else if (pv.liters != null) ok++;
}

(async () => {
  console.log('\nADEVĂRUL: 27.0 L pe 300 km. Fișa mașinii zice 15 L/100km, deci o ESTIMARE ar da 45 L.');
  console.log('Orice altceva decât ~27 înseamnă că cifra din raport e greșită.\n');

  console.log('A. Mașină cu senzor de nivel');
  await ruleaza('senzor perfect, fără zgomot', drum({ zgomot: 0 }));
  await ruleaza('zgomot ±0.2 L', drum({ zgomot: 0.2 }));
  await ruleaza('zgomot ±0.5 L (combustibil care se plimbă)', drum({ zgomot: 0.5 }));
  await ruleaza('zgomot ±1.0 L', drum({ zgomot: 1.0 }));
  await ruleaza('zgomot ±0.5 L + alimentare 30 L', drum({ zgomot: 0.5, alimentare: 30 }));

  console.log('\nB. Mașină cu contor CAN cumulativ');
  await ruleaza('un singur contor', drum({ zgomot: 0.5, cumul: (c) => ({ can_fuel_consumed: +(1000 + c).toFixed(2) }) }));
  await ruleaza('două contoare care alternează', drum({ zgomot: 0.5,
    cumul: (c, i) => (i % 2 === 0 ? { can_fuel_consumed: +(1000 + c).toFixed(2) } : { can_fuel_consumed_counted: +(940 + c).toFixed(2) }) }));

  console.log('\nC. Aceeași realitate, doar alt ritm de transmisie');
  // Cel mai important test din fișier: aceeași realitate, singura diferență e cât de des transmite
  // trackerul. Dacă cifra se schimbă, calculul e greșit — fizica nu depinde de asta.
  const rez = [];
  for (const pas of [10, 30, 60, 120, 300]) {
    const before = ok + rele;
    await ruleaza('punct la ' + String(pas).padStart(3) + ' s (zgomot ±0.5 L)', drum({ zgomot: 0.5, pas }), 12);
    rez.push(pas);
    void before;
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
