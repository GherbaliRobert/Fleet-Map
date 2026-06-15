const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
async function req(jar, method, path, body) {
  const h = { 'Content-Type': 'application/json' }; if (jar.cookie) h.Cookie = jar.cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) jar.cookie = sc.split(';')[0];
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
(async () => {
  const A = {};
  ok((await req(A, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200, 'admin login');
  let devs = (await req(A, 'GET', '/api/devices')).data;
  let list = Array.isArray(devs) ? devs : (devs.devices || []);
  let imei = list.length ? list[0].imei : null;
  if (!imei) { // creează un device de test ca să avem un rând pe care persistăm maparea
    imei = '357000000000999';
    const cr = await req(A, 'POST', '/api/devices', { imei, name: 'Test IO' });
    ok(cr.status === 200 || cr.status === 201, 'created test device (' + cr.status + ')');
  } else { ok(true, 'using existing device ' + imei); }
  const put = await req(A, 'PUT', '/api/devices/' + imei + '/io-mappings/713', { name: 'Combustibil rezervor', type: 'fuel', capacity: 400, rawMax: 1023, rawMin: 0 });
  ok(put.status === 200 && put.data.mappings && put.data.mappings['713'] && put.data.mappings['713'].name === 'Combustibil rezervor', 'PUT io-mapping 713 stored');
  ok(put.data.mappings['713'].capacity === 400 && put.data.mappings['713'].type === 'fuel', 'mapping has capacity 400 + type fuel');
  const get = await req(A, 'GET', '/api/devices/' + imei + '/io-mappings');
  ok(get.status === 200 && get.data['713'] && get.data['713'].capacity === 400, 'GET io-mappings returns 713');
  const dbg = await req(A, 'GET', '/api/devices/' + imei + '/io-debug');
  ok(dbg.status === 200 && Array.isArray(dbg.data.unmapped) && dbg.data.mappings && dbg.data.mappings['713'], 'io-debug returns {unmapped[], mappings}');
  ok((await req(A, 'PUT', '/api/devices/' + imei + '/io-mappings/999', { name: '' })).status === 400, 'empty name -> 400');
  const del = await req(A, 'DELETE', '/api/devices/' + imei + '/io-mappings/713');
  ok(del.status === 200 && !(del.data.mappings && del.data.mappings['713']), 'DELETE io-mapping 713');
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
