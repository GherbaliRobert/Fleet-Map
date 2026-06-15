// Tenant-isolation regression tests — prove the 5 audited cross-tenant leaks are closed.
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
async function req(jar, method, path, body) {
  const h = { 'Content-Type': 'application/json' }; if (jar.cookie) h.Cookie = jar.cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) jar.cookie = sc.split(';')[0];
  let d = null; try { d = await res.json(); } catch (e) {}
  return { status: res.status, data: d };
}
const U = () => Math.floor(performance.now() % 100000);
(async () => {
  const S = {}; // super-admin
  ok((await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200, 'super login');

  // 2 companies
  const A = (await req(S, 'POST', '/api/companies', { name: 'CoA ' + U() })).data.id;
  const B = (await req(S, 'POST', '/api/companies', { name: 'CoB ' + U() })).data.id;
  // devices (IMEI must be 10-20 digits)
  const dA = '8861' + String(U()).padStart(8, '0'), dB = '8862' + String(U()).padStart(8, '0');
  ok((await req(S, 'POST', '/api/devices', { imei: dA, name: 'VehA', company_id: A })).status === 200, 'device A created');
  ok((await req(S, 'POST', '/api/devices', { imei: dB, name: 'VehB', company_id: B })).status === 200, 'device B created');
  // company_admin users
  const uaName = 'adminA' + U(), ubName = 'adminB' + U();
  await req(S, 'POST', '/api/users', { username: uaName, password: 'pass123', role: 'company_admin', company_id: A });
  await req(S, 'POST', '/api/users', { username: ubName, password: 'pass123', role: 'company_admin', company_id: B });
  const UA = {}, UB = {};
  ok((await req(UA, 'POST', '/api/login', { username: uaName, password: 'pass123' })).status === 200, 'company A admin login');
  ok((await req(UB, 'POST', '/api/login', { username: ubName, password: 'pass123' })).status === 200, 'company B admin login');

  // drivers (expired license) created AS each company admin → carry the right company_id
  const drA = (await req(UA, 'POST', '/api/drivers', { name: 'SoferAlpha', license_number: 'LA1', license_expiry: '2020-01-01' })).data;
  const drB = (await req(UB, 'POST', '/api/drivers', { name: 'SoferBeta', license_number: 'LB1', license_expiry: '2020-01-01' })).data;
  ok(drA && drA.id, 'driver A created'); ok(drB && drB.id, 'driver B created');
  // geofences per company
  await req(UA, 'POST', '/api/geofences', { name: 'ZonaAlpha', type: 'circle', coordinates: { center: [44.4, 26.1], radius: 500 } });
  await req(UB, 'POST', '/api/geofences', { name: 'ZonaBeta', type: 'circle', coordinates: { center: [46.7, 23.6], radius: 500 } });

  console.log('\n— FIX C (CRITICAL): report-schedules PUT cannot retarget to another company vehicle —');
  // POST already blocks cross-company imei
  const postCross = await req(UA, 'POST', '/api/report-schedules', { report_type: 'rezumat', imei: dB, frequency: 'daily' });
  ok(postCross.status === 403, 'POST schedule with company B imei → 403');
  // create a legit schedule for company A own vehicle
  const sch = await req(UA, 'POST', '/api/report-schedules', { report_type: 'rezumat', imei: dA, frequency: 'daily' });
  ok(sch.status === 200 && sch.data.id, 'POST own-vehicle schedule → 200');
  // try to retarget it to company B vehicle via PUT
  const putCross = await req(UA, 'PUT', '/api/report-schedules/' + sch.data.id, { imei: dB });
  ok(putCross.status === 403, 'PUT retarget schedule to company B imei → 403 (was the leak)');

  console.log('\n— FIX B (HIGH): /api/debug/raw/:imei scoped —');
  ok((await req(UA, 'GET', '/api/debug/raw/' + dB)).status === 403, 'company A admin GET debug/raw of company B imei → 403');
  ok((await req(UA, 'GET', '/api/debug/raw/' + dA)).status === 200, 'company A admin GET debug/raw of OWN imei → 200');
  ok((await req(S, 'GET', '/api/debug/raw/' + dB)).status === 200, 'super GET debug/raw any imei → 200 (by design)');

  console.log('\n— FIX A (MEDIUM): /api/connections scoped —');
  const connA = await req(UA, 'GET', '/api/connections');
  ok(connA.status === 200 && typeof connA.data === 'object', 'connections returns object (scoped)');
  ok(!Object.keys(connA.data).includes(dB), 'company A connections do NOT list company B imei');

  console.log('\n— FIX D (MEDIUM): geofences list is company-scoped (report reuses getGeofences(companyId)) —');
  const gA = (await req(UA, 'GET', '/api/geofences')).data || [];
  ok(gA.some(g => g.name === 'ZonaAlpha') && !gA.some(g => g.name === 'ZonaBeta'), 'company A sees only own geofence');
  ok((await req(UA, 'GET', '/api/reports/geofence?from=2020-01-01&to=2020-01-02')).status === 200, 'company A geofence report runs (200)');

  console.log('\n— FIX E (HIGH): driver license-expiry notifications do NOT broadcast cross-tenant —');
  // trigger the expiry scan (any admin; scans all drivers, creates per-company notifications)
  await req(S, 'POST', '/api/notifications/check-expiries');
  await new Promise(r => setTimeout(r, 400));
  const notA = (await req(UA, 'GET', '/api/notifications')).data || [];
  const notB = (await req(UB, 'GET', '/api/notifications')).data || [];
  const notS = (await req(S, 'GET', '/api/notifications')).data || [];
  const hasAlphaInA = notA.some(n => (n.body || n.title || '').includes('SoferAlpha') || (n.title||'').includes('SoferAlpha'));
  const hasBetaInA = notA.some(n => (n.title || '').includes('SoferBeta') || (n.body||'').includes('SoferBeta'));
  const hasBetaInB = notB.some(n => (n.title || '').includes('SoferBeta'));
  const hasAlphaInB = notB.some(n => (n.title || '').includes('SoferAlpha'));
  ok(hasAlphaInA, 'company A admin sees OWN driver (SoferAlpha) expiry');
  ok(!hasBetaInA, 'company A admin does NOT see company B driver (SoferBeta) expiry  [was the leak]');
  ok(hasBetaInB, 'company B admin sees OWN driver (SoferBeta) expiry');
  ok(!hasAlphaInB, 'company B admin does NOT see company A driver (SoferAlpha) expiry  [was the leak]');
  const superSeesBoth = notS.some(n => (n.title||'').includes('SoferAlpha')) && notS.some(n => (n.title||'').includes('SoferBeta'));
  ok(superSeesBoth, 'super-admin sees BOTH (by design)');
  // ack scoping: company A cannot ack company B's notification
  const betaNotif = notS.find(n => (n.title||'').includes('SoferBeta'));
  if (betaNotif) {
    const ackCross = await req(UA, 'POST', '/api/notifications/' + betaNotif.id + '/ack');
    ok(ackCross.status === 404, 'company A cannot ack company B notification → 404');
  } else { ok(false, '(could not find Beta notif to test ack scoping)'); }

  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
