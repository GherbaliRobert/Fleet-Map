// Integration test for Faza 1+2 hardening fixes. Run against a fresh-DB server on :3000.
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
async function req(jar, method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (jar.cookie) h.Cookie = jar.cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) jar.cookie = sc.split(';')[0];
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
(async () => {
  const A = {}; // super-admin
  const login = await req(A, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
  ok(login.status === 200, 'admin login 200');
  ok(login.data && login.data.features && login.data.access !== undefined, 'login response carries features + access (finding #5)');
  ok((await req(A, 'GET', '/api/devices')).status === 200, 'super-admin /api/devices 200 (never blocked by gate)');

  const co = (await req(A, 'POST', '/api/companies', { name: 'PayTest SRL ' + Date.now() })).data;
  ok(co && co.id, 'company created');
  const cu = await req(A, 'POST', '/api/users', { username: 'paytest_' + Date.now().toString(36), password: 'pass1234', role: 'admin', company_id: co.id });
  ok(cu.status === 200 && cu.data && cu.data.id, 'company admin user created');
  const uname = cu.data.username;

  const B = {}; // company admin session
  ok((await req(B, 'POST', '/api/login', { username: uname, password: 'pass1234' })).status === 200, 'company admin login 200 (unlimited)');
  ok((await req(B, 'GET', '/api/devices')).status === 200, 'company admin /api/devices 200 (active, gate allows)');

  // expire the company
  const setExp = await req(A, 'PUT', '/api/companies/' + co.id + '/access', { until: Date.now() - 30 * 24 * 3600 * 1000 });
  ok(setExp.data && setExp.data.access && setExp.data.access.status === 'expired', 'access set to expired');

  // CENTRAL GATE (finding #1): existing session now blocked on data endpoint
  const d2 = await req(B, 'GET', '/api/devices');
  ok(d2.status === 402, 'EXPIRED existing session /api/devices -> 402 (central gate #1) got ' + d2.status);
  const m2 = await req(B, 'GET', '/api/me');
  ok(m2.status === 200 && m2.data.access && m2.data.access.status === 'expired', '/api/me still 200 + expired (allowlist)');
  const C = {};
  ok((await req(C, 'POST', '/api/login', { username: uname, password: 'pass1234' })).status === 402, 'EXPIRED fresh login -> 402');

  // RO comma decimal (finding #3) + cache invalidation (#1) + active after pay
  const payComma = await req(A, 'POST', '/api/companies/' + co.id + '/payment', { amount: '12,5', months: 1 });
  ok(payComma.data && payComma.data.payment && Number(payComma.data.payment.amount_ron) === 12.5, 'payment "12,5" -> 12.5 (finding #3) got ' + (payComma.data && payComma.data.payment && payComma.data.payment.amount_ron));
  ok(payComma.data && payComma.data.access && payComma.data.access.status === 'active', 'access active after payment');
  ok((await req(B, 'GET', '/api/devices')).status === 200, 'previously-blocked session works again after renewal (cache invalidated #1)');

  // thousands separator
  const payTh = await req(A, 'POST', '/api/companies/' + co.id + '/payment', { amount: '1.234,56', months: 1 });
  ok(payTh.data && payTh.data.payment && Number(payTh.data.payment.amount_ron) === 1234.56, 'payment "1.234,56" -> 1234.56 got ' + (payTh.data && payTh.data.payment && payTh.data.payment.amount_ron));

  // negative + garbage rejected (finding #7)
  ok((await req(A, 'POST', '/api/companies/' + co.id + '/payment', { amount: '-5' })).status === 400, 'negative amount -> 400 (finding #7)');
  ok((await req(A, 'POST', '/api/companies/' + co.id + '/payment', { amount: 'abc' })).status === 400, 'garbage amount -> 400');

  // contiguous grace renewal (finding #9): set grace, pay, period_start == old access_until (not now)
  const oneDayAgo = Date.now() - 24 * 3600 * 1000;
  await req(A, 'PUT', '/api/companies/' + co.id + '/access', { until: oneDayAgo });
  const payGrace = await req(A, 'POST', '/api/companies/' + co.id + '/payment', { months: 1 });
  const ps = payGrace.data && payGrace.data.payment && Number(payGrace.data.payment.period_start);
  ok(ps && Math.abs(ps - oneDayAgo) < 5000, 'grace renewal contiguous: period_start = old access_until (finding #9) got ' + ps + ' vs ' + oneDayAgo);

  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
