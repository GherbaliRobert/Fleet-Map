// smoke_reports.js — rulează TOATE rapoartele pe date sintetice + verifică alinierea coloane/rânduri și graficele.
const reports = require('./reports');

function synthTrack() {
  const pts = [];
  const base = Date.parse('2026-06-10T08:00:00Z');
  const day = 86400000;
  let fuel = 60;
  for (let d = 0; d < 2; d++) {
    let lat = 44.40, lng = 26.00, ts = base + d * day;
    const push = (speed, ign, dlng) => { lng += dlng || 0; fuel = Math.max(5, fuel - 0.05); pts.push({ timestamp: new Date(ts).toISOString(), latitude: lat, longitude: lng, speed, angle: 90, satellites: 10, io_data: { ignition: ign, fuel_level_liters: Math.round(fuel * 10) / 10 } }); ts += 60000; };
    for (let i = 0; i < 8; i++) push(50, 1, 0.005);
    push(120, 1, 0.01); push(120, 1, 0.01);
    for (let i = 0; i < 12; i++) push(0, 1, 0);
    for (let i = 0; i < 6; i++) push(0, 0, 0);
    fuel -= 35; push(0, 0, 0);                          // scădere bruscă -35 L cu motorul STINS (furt)
    fuel += 40; push(0, 1, 0);                          // alimentare +40 L
    for (let i = 0; i < 6; i++) push(55, 1, 0.006);
  }
  return pts;
}
const LAST = synthTrack().slice(-1)[0];

const mockDb = {
  pool: { query: async (sql) => {
    if (/FROM devices/.test(sql) && /consumption_road/.test(sql)) return { rows: [{ imei: 'X', fuel_price: 7.5, vehicle_type: 'Camion', consumption_road: 30, consumption_city: null, consumption_idle: 1.5 }] };
    if (/FROM devices/.test(sql) && /fuel_price/.test(sql)) return { rows: [{ imei: 'X', fuel_price: 7.5 }] };
    if (/FROM devices/.test(sql)) return { rows: [{ imei: 'X', name: 'Test', plate: 'B-01', driver_id: 1, group_id: null }] };
    if (/FROM drivers/.test(sql)) return { rows: [{ id: 1, name: 'Ion Popescu' }] };
    if (/FROM vehicle_documents/.test(sql) && /expiry_date IS NOT NULL/.test(sql)) return { rows: [{ imei: 'X', doc_type: 'ITP', number: '123', expiry_date: '2026-07-15' }, { imei: 'X', doc_type: 'RCA', number: '456', expiry_date: '2026-06-05' }] };
    if (/FROM maintenance/.test(sql) && /status <> 'done'/.test(sql)) return { rows: [{ imei: 'X', type: 'Schimb ulei', due_date: '2026-06-20' }] };
    if (/FROM maintenance/.test(sql)) return { rows: [{ imei: 'X', c: 500 }] };
    if (/FROM vehicle_documents/.test(sql)) return { rows: [{ imei: 'X', c: 200 }] };
    if (/FROM positions/.test(sql)) return { rows: [LAST] };
    return { rows: [] };
  } },
  getDeviceHistory: async () => synthTrack(),
  getDrivers: async () => [{ id: 1, name: 'Ion Popescu' }],
  getGeofences: async () => [
    { name: 'Depozit', type: 'circle', coordinates: JSON.stringify({ center: [44.40, 26.00], radius: 5000 }) },
    { name: 'Zonă stricată', type: 'circle', coordinates: JSON.stringify({ radius: 1000 }) }  // FĂRĂ center → trebuie să NU crape
  ],
  getAlertHistory: async () => [],
  getAlertHistoryRange: async () => [
    { imei: 'X', alert_name: 'Viteză depășită', alert_type: 'speed', triggered_at: '2026-06-10T08:09:00Z', data: { v: 120 } },
    { imei: 'X', alert_name: 'Ralanti prelungit', alert_type: 'idle', triggered_at: '2026-06-11T08:20:00Z', data: {} }
  ]
};

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

(async () => {
  const types = Object.keys(reports.REPORTS);
  for (const type of types) {
    let r;
    try { r = await reports.runReport(mockDb, type, ['X'], '2026-06-09', '2026-06-13', { stopMin: 5, idleMin: 3, limit: 90 }); }
    catch (e) { ok(false, type + ': CRASH — ' + e.message); continue; }
    const colN = Array.isArray(r.columns) ? r.columns.length : -1;
    const rowsOk = Array.isArray(r.rows) && r.rows.every(row => Array.isArray(row) && row.length === colN);
    const badRow = (r.rows || []).find(row => !Array.isArray(row) || row.length !== colN);
    const chartsOk = !r.charts || (Array.isArray(r.charts) && r.charts.every(ch => ch && ch.type && Array.isArray(ch.labels) && Array.isArray(ch.datasets) && ch.datasets.every(d => Array.isArray(d.data) && d.data.length === ch.labels.length)));
    ok(rowsOk && chartsOk, `${type}: ${colN} col, ${(r.rows || []).length} rânduri, ${(r.charts || []).length} grafice` + (rowsOk ? '' : ` — RÂND NEALINIAT: ${badRow ? badRow.length : '?'} celule`) + (chartsOk ? '' : ' — GRAFIC INVALID'));
  }
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
