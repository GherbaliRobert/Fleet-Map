// verify_report_charts.js — unit test: fiecare raport chart-worthy produce `charts` valid dintr-un track sintetic bogat.
const reports = require('./reports');

function synthTrack() {
  const pts = [];
  const base = Date.parse('2026-06-10T08:00:00Z');
  const day = 86400000;
  let fuel = 60;
  for (let d = 0; d < 2; d++) {
    let lat = 44.40, lng = 26.00, ts = base + d * day;
    const push = (speed, ign, dlng) => { lng += dlng || 0; fuel = Math.max(5, fuel - 0.05); pts.push({ timestamp: new Date(ts).toISOString(), latitude: lat, longitude: lng, speed, angle: 90, satellites: 10, io_data: { ignition: ign, fuel_level_liters: Math.round(fuel * 10) / 10 } }); ts += 60000; };
    for (let i = 0; i < 8; i++) push(50, 1, 0.005);   // trip 1
    push(120, 1, 0.01); push(120, 1, 0.01);            // depășire viteză (>90)
    for (let i = 0; i < 12; i++) push(0, 1, 0);        // ralanti (ign on, 12 min)
    for (let i = 0; i < 6; i++) push(0, 0, 0);         // staționare (ign off, 6 min)
    fuel += 40; push(0, 1, 0);                          // alimentare +40 L
    for (let i = 0; i < 6; i++) push(55, 1, 0.006);    // trip 2
  }
  return pts;
}
const mockDb = {
  pool: { query: async (sql) => {
    if (/FROM devices/.test(sql) && /fuel_price/.test(sql)) return { rows: [{ imei: 'X', fuel_price: 7.5 }] };
    if (/FROM devices/.test(sql)) return { rows: [{ imei: 'X', name: 'Test', plate: 'B-01', driver_id: 1, group_id: null }] };
    if (/FROM drivers/.test(sql)) return { rows: [{ id: 1, name: 'Ion Popescu' }] };
    return { rows: [] };
  } },
  getDeviceHistory: async () => synthTrack(),
  getDrivers: async () => [{ id: 1, name: 'Ion Popescu' }],
  getGeofences: async () => [{ name: 'Depozit', type: 'circle', coordinates: JSON.stringify({ center: [44.40, 26.00], radius: 5000 }) }],
  getAlertHistory: async () => [
    { imei: 'X', alert_name: 'Viteză depășită', alert_type: 'speed', triggered_at: new Date(Date.parse('2026-06-10T08:09:00Z')).toISOString(), data: { v: 120 } },
    { imei: 'X', alert_name: 'Ralanti prelungit', alert_type: 'idle', triggered_at: new Date(Date.parse('2026-06-11T08:20:00Z')).toISOString(), data: {} }
  ]
};

const CHART_REPORTS = ['trips', 'stops', 'speeding', 'fuel', 'consumption', 'costs', 'emissions', 'daily', 'idling', 'driver', 'utilization', 'geofence', 'events', 'ecodrive', 'ecodrive_drivers'];
const ALL = ['route', 'location', 'can', 'analytic']; // fără charts (detaliu) — verificăm doar că rulează

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

(async () => {
  for (const type of CHART_REPORTS) {
    let r;
    try { r = await reports.runReport(mockDb, type, ['X'], '2026-06-09', '2026-06-13', { stopMin: 5, idleMin: 3, limit: 90 }); }
    catch (e) { ok(false, type + ': RULARE — ' + e.message); continue; }
    const c = r.charts;
    const okShape = Array.isArray(c) && c.every(ch => ch && ch.type && ch.title && Array.isArray(ch.labels) && Array.isArray(ch.datasets) && ch.datasets.every(d => Array.isArray(d.data) && d.data.length === ch.labels.length && d.data.every(v => typeof v === 'number')));
    ok(okShape && c.length > 0, type + ': ' + (c ? c.length : 'NULL') + ' grafice valide' + (c && c[0] ? ' [' + c.map(x => x.type).join(',') + ']' : ''));
  }
  // rapoartele de detaliu: doar să nu crape
  for (const type of ALL) {
    try { await reports.runReport(mockDb, type, ['X'], '2026-06-09', '2026-06-13', {}); ok(true, type + ': rulează (fără charts, ok)'); }
    catch (e) { ok(false, type + ': RULARE — ' + e.message); }
  }
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
