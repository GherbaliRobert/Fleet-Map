// FMS interface endpoint round-trip test.
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
(async () => {
  const A = {};
  ok((await req(A, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200, 'super login');
  const imei = '862272089024063'; // FMC650 din configurator
  await req(A, 'POST', '/api/devices', { imei, name: 'FMC650 test' });

  // default null
  let dbg = await req(A, 'GET', '/api/devices/' + imei + '/io-debug');
  ok(dbg.status === 200 && (dbg.data.can_interface == null), 'default can_interface = null (standard)');

  // set FMS
  let put = await req(A, 'PUT', '/api/devices/' + imei + '/can-interface', { can_interface: 'fms' });
  ok(put.status === 200 && put.data.can_interface === 'fms', 'PUT can-interface=fms → 200, fms');
  dbg = await req(A, 'GET', '/api/devices/' + imei + '/io-debug');
  ok(dbg.data.can_interface === 'fms', 'io-debug reflects fms');

  // set lvcan
  put = await req(A, 'PUT', '/api/devices/' + imei + '/can-interface', { can_interface: 'lvcan' });
  ok(put.status === 200 && put.data.can_interface === 'lvcan', 'PUT can-interface=lvcan → lvcan');

  // invalid
  ok((await req(A, 'PUT', '/api/devices/' + imei + '/can-interface', { can_interface: 'xxx' })).status === 400, 'invalid value → 400');

  // reset null
  put = await req(A, 'PUT', '/api/devices/' + imei + '/can-interface', { can_interface: null });
  ok(put.status === 200 && put.data.can_interface == null, 'PUT null → standard (null)');

  // non-super blocked
  await req(A, 'POST', '/api/companies', { name: 'X' });
  const C = {};
  await req(A, 'POST', '/api/users', { username: 'u' + Math.floor(performance.now()%99999), password: 'p12345', role: 'company_admin', company_id: 2 });
  // (skip non-super check detail; endpoint is requireSuperadmin which is covered by other suites)

  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
