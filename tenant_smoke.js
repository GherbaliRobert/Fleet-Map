// Test de izolare multi-tenant: două companii nu își văd reciproc datele.
const BASE = process.env.BASE || 'http://localhost:3000';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'test1234';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } }

async function req(jar, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) headers['Cookie'] = ck;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setc) { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); }
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

(async () => {
  const su = {}, aA = {}, aB = {};
  console.log('# login super-admin');
  const lg = await req(su, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASS });
  ok(lg.status === 200, 'super-admin login (' + lg.status + ')');
  ok(lg.data && lg.data.role === 'superadmin', 'rol superadmin (' + (lg.data && lg.data.role) + ')');

  console.log('# create companies + admins');
  const A = (await req(su, 'POST', '/api/companies', { name: 'Alpha SRL ' + Date.now() })).data;
  const B = (await req(su, 'POST', '/api/companies', { name: 'Beta SRL ' + Date.now() })).data;
  ok(A && A.id, 'companie A creată #' + (A && A.id));
  ok(B && B.id, 'companie B creată #' + (B && B.id));
  const uA = 'admin.a.' + (A.id) + '@test.ro', uB = 'admin.b.' + (B.id) + '@test.ro';
  const ca = await req(su, 'POST', `/api/companies/${A.id}/admin`, { username: uA, password: 'pass1234', full_name: 'Admin A' });
  const cb = await req(su, 'POST', `/api/companies/${B.id}/admin`, { username: uB, password: 'pass1234', full_name: 'Admin B' });
  ok(ca.status === 200, 'admin A creat (' + ca.status + ')');
  ok(cb.status === 200, 'admin B creat (' + cb.status + ')');

  console.log('# assign seeded devices to companies (TEST111->A, TEST222->B)');
  const r1 = await req(su, 'PUT', '/api/devices/TEST111/company', { company_id: A.id });
  const r2 = await req(su, 'PUT', '/api/devices/TEST222/company', { company_id: B.id });
  ok(r1.status === 200 && r2.status === 200, 'device assignment ok');

  console.log('# login company admins');
  ok((await req(aA, 'POST', '/api/login', { username: uA, password: 'pass1234', full_name: 'Admin A' })).status === 200, 'admin A login');
  ok((await req(aB, 'POST', '/api/login', { username: uB, password: 'pass1234', full_name: 'Admin B' })).status === 200, 'admin B login');

  console.log('# device list isolation');
  const devA = ((await req(aA, 'GET', '/api/devices')).data || []).map(d => d.imei);
  const devB = ((await req(aB, 'GET', '/api/devices')).data || []).map(d => d.imei);
  ok(devA.includes('TEST111') && !devA.includes('TEST222'), 'A vede TEST111, NU TEST222 [' + devA.join(',') + ']');
  ok(devB.includes('TEST222') && !devB.includes('TEST111'), 'B vede TEST222, NU TEST111 [' + devB.join(',') + ']');

  console.log('# cross-tenant history blocked');
  const cross = await req(aA, 'GET', '/api/history/TEST222');
  ok(cross.status === 403, 'A nu poate citi istoric TEST222 (' + cross.status + ')');

  console.log('# user list isolation');
  const usersA = ((await req(aA, 'GET', '/api/users')).data || []).map(u => u.username);
  ok(usersA.includes(uA) && !usersA.includes(uB) && !usersA.includes('admin'), 'A vede doar userii lui [' + usersA.join(',') + ']');

  console.log('# super-admin sees everything');
  const allDev = ((await req(su, 'GET', '/api/devices')).data || []).map(d => d.imei);
  ok(allDev.includes('TEST111') && allDev.includes('TEST222'), 'super-admin vede ambele [' + allDev.join(',') + ']');

  console.log('# cross-tenant notification ack blocked (IDOR fix)');
  // A declanșează un eveniment (overspeed) pe vehiculul ei TEST111 → notificare pentru adminul A
  await req(aA, 'POST', '/api/test/simulate', { imei: 'TEST111', speed: 120, io: { ignition: 1 } });
  const notifsA = (await req(aA, 'GET', '/api/notifications')).data || [];
  const nA = notifsA.find(n => n.imei === 'TEST111') || notifsA[0];
  ok(!!nA, 'notificare A creată #' + (nA && nA.id));
  if (nA) {
    const bAck = await req(aB, 'POST', '/api/notifications/' + nA.id + '/ack');
    ok(bAck.status === 404, 'B NU poate confirma notificarea lui A (' + bAck.status + ', așteptat 404)');
    const stillUnack = ((await req(aA, 'GET', '/api/notifications')).data || []).find(n => n.id === nA.id);
    ok(stillUnack && !stillUnack.acknowledged, 'notificarea lui A a rămas neconfirmată după încercarea lui B');
    const aAck = await req(aA, 'POST', '/api/notifications/' + nA.id + '/ack');
    ok(aAck.status === 200, 'A poate confirma propria notificare (' + aAck.status + ')');
  }

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
