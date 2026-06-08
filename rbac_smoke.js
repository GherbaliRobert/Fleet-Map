// Smoke test RBAC + scoping + chei API (HTTP-only).
// Necesită: serverul pornit pe :3000 cu DB-ul PGlite deja seedat cu TEST111/TEST222.
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; }
  return null;
}
async function login(username, password) {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, cookie: cookieFrom(res), body };
}
async function api(method, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.apiKey) headers.Authorization = 'Bearer ' + opts.apiKey;
  const res = await fetch(BASE + path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: res.status, body: json };
}

(async () => {
  console.log('\n— Admin —');
  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  check('login admin 200', admin.status === 200, admin.status);
  check('admin permissions.manageUsers=true', admin.body.permissions && admin.body.permissions.manageUsers === true);
  const A = { cookie: admin.cookie };
  const me = await api('GET', '/api/me', A);
  check('GET /api/me → role admin', me.body.role === 'admin');
  const devAdmin = await api('GET', '/api/devices', A);
  check('admin vede ambele device-uri seedate (>=2)', Array.isArray(devAdmin.body) && devAdmin.body.length >= 2, devAdmin.body && devAdmin.body.length);

  console.log('\n— Creare client + acces (doar TEST111) —');
  const create = await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'client_test', password: 'test12', role: 'client', full_name: 'Client Test' } });
  check('creare client 200', create.status === 200, create.body);
  const cid = create.body.id;
  const grant = await api('PUT', '/api/users/' + cid + '/access', { cookie: admin.cookie, body: { devices: ['TEST111'], groups: [] } });
  check('atribuire acces 200', grant.status === 200, grant.body);

  console.log('\n— Client (sesiune, scoped) —');
  const client = await login('client_test', 'test12');
  check('login client 200', client.status === 200, client.status);
  check('client manageUsers=false', client.body.permissions && client.body.permissions.manageUsers === false);
  check('client manageFleet=false', client.body.permissions && client.body.permissions.manageFleet === false);
  const C = { cookie: client.cookie };
  const devClient = await api('GET', '/api/devices', C);
  check('client vede DOAR 1 device', Array.isArray(devClient.body) && devClient.body.length === 1, devClient.body && devClient.body.length);
  check('device-ul e TEST111', devClient.body[0] && devClient.body[0].imei === 'TEST111', devClient.body[0] && devClient.body[0].imei);
  check('client → istoric TEST111 = 200', (await api('GET', '/api/history/TEST111', C)).status === 200);
  check('client → istoric TEST222 = 403 (blocat)', (await api('GET', '/api/history/TEST222', C)).status === 403);
  check('client → raport TEST222 = 403 (blocat)', (await api('GET', '/api/report/TEST222', C)).status === 403);
  check('client NU poate crea useri (403)', (await api('POST', '/api/users', { cookie: client.cookie, body: { username: 'x', password: 'yyyy' } })).status === 403);
  check('client NU poate crea geofence (403)', (await api('POST', '/api/geofences', { cookie: client.cookie, body: { name: 'z', type: 'circle', coordinates: {} } })).status === 403);

  console.log('\n— Cheie API (moștenește rolul + accesul clientului) —');
  const mk = await api('POST', '/api/apikeys', { cookie: admin.cookie, body: { userId: cid, name: 'integrare-test' } });
  check('admin creează cheie API 200', mk.status === 200, mk.body);
  check('cheia e returnată o singură dată (gpsk_...)', typeof mk.body.key === 'string' && mk.body.key.startsWith('gpsk_'));
  const KEY = mk.body.key;
  const meKey = await api('GET', '/api/me', { apiKey: KEY });
  check('GET /api/me cu cheie → role client', meKey.status === 200 && meKey.body.role === 'client', meKey.body);
  check('GET /api/me cu cheie → viaApiKey=true', meKey.body.viaApiKey === true);
  const devKey = await api('GET', '/api/devices', { apiKey: KEY });
  check('cheia vede DOAR 1 device (scoping moștenit)', Array.isArray(devKey.body) && devKey.body.length === 1, devKey.body && devKey.body.length);
  check('cheia e blocată pe TEST222 (403)', (await api('GET', '/api/history/TEST222', { apiKey: KEY })).status === 403);
  check('cheia NU poate crea useri (403)', (await api('POST', '/api/users', { apiKey: KEY, body: { username: 'q', password: 'wwww' } })).status === 403);
  const badKey = await api('GET', '/api/devices', { apiKey: 'gpsk_invalid' });
  check('cheie invalidă → 401', badKey.status === 401, badKey.status);

  console.log('\n— Audit + catalog API —');
  const auditAdmin = await api('GET', '/api/audit?limit=50', A);
  check('admin vede audit (>0 intrări)', auditAdmin.status === 200 && Array.isArray(auditAdmin.body) && auditAdmin.body.length > 0, auditAdmin.body && auditAdmin.body.length);
  check('client blocat pe audit (403)', (await api('GET', '/api/audit', C)).status === 403);
  const catalog = await api('GET', '/api');
  check('GET /api (catalog public) 200', catalog.status === 200 && !!catalog.body.endpoints);

  console.log('\n— Rate-limit / parolă greșită —');
  check('parolă greșită → 401', (await login('admin', 'gresit')).status === 401);

  console.log('\n=== Rezultat: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
