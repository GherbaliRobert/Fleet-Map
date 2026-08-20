// Test RA Watch — alertă furt combustibil (oprit→pornit, scădere nerevenită în 5 min, % sau L).
const agents = require('./agents.js');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' ' + m); };
const t0 = Date.parse('2026-06-12T08:00:00Z');
const pt = (min, ign, fuelPct, speed) => ({ timestamp: new Date(t0 + min * 60000).toISOString(), latitude: 44, longitude: 26, speed: speed || 0, io_data: { ignition: ign, can_fuel_level_pct: fuelPct } });

// Pragul companiei TREBUIE trimis: din 26.07 („onestitate: trei locuri în care interfața spunea
// altceva decât făcea codul"), `fuelTheftL` nesetat înseamnă „utilizatorul a ales Dezactivat", nu
// „prag 0" — și oprește detecția cu totul, inclusiv pe procente. Testul rula cu praguri goale, deci
// verifica o cale moartă și pica din 26.07 încoace, în CI, fără ca nimeni să se uite.
// Ultimul caz de mai jos apără chiar regula asta, ca să nu se piardă în cealaltă direcție.
async function run(hist, thresholds) {
  const base = {
    db: { getDeviceHistory: async () => hist, getDeviceFull: async () => ({ vehicle_type: 'Camion', tank_capacity: 400 }) },
    imeis: ['T1'],
    livePositions: new Map([['T1', { name: 'Cap tractor', timestamp: hist[hist.length - 1].timestamp, io: hist[hist.length - 1].io_data }]]),
    companyId: 1, alertThresholds: (thresholds === undefined ? { fuelTheftL: 20 } : thresholds)
  };
  const r = await agents.runAgent('watch', base);
  return (r.findings || []).find(f => f.fkey === 'fuel_theft_T1') || null;
}

(async () => {
  // 1) FURT: oprit la 55%, pornește, scade la 45% și NU revine în 5 min → detectat
  let f = await run([pt(0,1,55,30), pt(5,0,55,0), pt(40,0,55,0), pt(60,1,55,0), pt(62,1,50,5), pt(64,1,45,10), pt(70,1,45,20)]);
  ok(f && /furt/i.test(f.title), 'FURT 55%→45% nerevenit → alertă (' + (f ? f.title : 'lipsă') + ')');

  // 2) REVENIRE (refuel/zgomot): scade apoi revine la 55% în fereastră → NU alertă
  f = await run([pt(0,1,55,30), pt(5,0,55,0), pt(60,1,55,0), pt(62,1,50,0), pt(64,1,55,0), pt(66,1,55,5)]);
  ok(!f, 'Revenire la 55% în 5 min → fără alertă (corect)');

  // 3) Scădere mică (3% < 5%) → NU alertă
  f = await run([pt(0,1,55,30), pt(5,0,55,0), pt(60,1,55,0), pt(63,1,52,0), pt(65,1,52,0)]);
  ok(!f, 'Scădere 3% (sub prag 5%) → fără alertă (corect)');

  // 4) Motor oprit fără CAN pe punctele de staționare (FMS real) → folosește ultima citire validă
  const histOff = [pt(0,1,55,30), { timestamp: new Date(t0+5*60000).toISOString(), latitude:44, longitude:26, speed:0, io_data:{ ignition:0 } }, { timestamp:new Date(t0+40*60000).toISOString(), latitude:44, longitude:26, speed:0, io_data:{ ignition:0 } }, pt(60,1,44,0), pt(63,1,44,10), pt(65,1,44,15)];
  f = await run(histOff);
  ok(f && /furt/i.test(f.title), 'Oprit fără CAN, ultima citire 55%→44% după pornire → alertă (' + (f ? Math.round(0) : '') + (f?f.title:'lipsă') + ')');

  // 5) Scădere normală în mers (fără oprire→pornire) → NU declanșează regula de furt post-pornire
  f = await run([pt(0,1,55,30), pt(10,1,50,40), pt(20,1,45,50)]);
  ok(!f, 'Scădere graduală în mers (fără stop→start) → fără alertă furt post-pornire (corect)');

  // 6) Compania NU și-a setat pragul → detecția e oprită cu totul (decizia din 26.07).
  //    Aceleași date ca la cazul 1, care ACOLO dau alertă.
  f = await run([pt(0,1,55,30), pt(5,0,55,0), pt(40,0,55,0), pt(60,1,55,0), pt(62,1,50,5), pt(64,1,45,10), pt(70,1,45,20)], {});
  ok(!f, 'Fără prag setat pe companie → agentul nu semnalează furt (corect, dar vezi jurnalul)');

  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
