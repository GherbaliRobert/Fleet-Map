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
  ok((await req(A, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200, 'admin login');
  const g0 = await req(A, 'GET', '/api/admin/system-settings');
  ok(g0.status === 200 && typeof g0.data.agents_auto === 'boolean' && g0.data.offline_minutes === 65 && g0.data.default_speed_limit === 90, 'GET defaults (agents_auto bool, offline 65, speed 90)');
  const put = await req(A, 'PUT', '/api/admin/system-settings', { announcement: 'Mentenanta diseara', agents_auto: false, offline_minutes: 90, default_speed_limit: 110 });
  ok(put.status === 200 && put.data.settings.announcement === 'Mentenanta diseara' && put.data.settings.agents_auto === false && put.data.settings.offline_minutes === 90, 'PUT settings stored');
  const me = await req(A, 'GET', '/api/me');
  ok(me.data.announcement === 'Mentenanta diseara' && me.data.offline_minutes === 90, '/api/me reflects announcement + offline_minutes');
  const put2 = await req(A, 'PUT', '/api/admin/system-settings', { offline_minutes: 2 });
  ok(put2.status === 200 && put2.data.settings.offline_minutes === 90, 'out-of-range offline (2) ignored, stays 90');
  await req(A, 'PUT', '/api/admin/system-settings', { announcement: '', agents_auto: true, offline_minutes: 65, default_speed_limit: 90 });
  const g1 = await req(A, 'GET', '/api/admin/system-settings');
  ok(g1.data.announcement === '' && g1.data.agents_auto === true, 'reset OK');
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
