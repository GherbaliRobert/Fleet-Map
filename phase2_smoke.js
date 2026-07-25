// Smoke test Faza 2: CRUD șoferi/grupe/alerte/zone/mentenanță + atribuire + ACCES PE GRUP.
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra!==undefined?' → '+JSON.stringify(extra):'')); } }
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u, p) { const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return { status:r.status, cookie:cookieFrom(r), body: await r.json().catch(()=>({})) }; }
async function api(method, path, opts={}) { const h={'Content-Type':'application/json'}; if(opts.cookie)h.Cookie=opts.cookie; const r=await fetch(BASE+path,{method,headers:h,body:opts.body?JSON.stringify(opts.body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j}; }

(async () => {
  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  const A = { cookie: admin.cookie };
  check('login admin', admin.status === 200);

  console.log('\n— Grupe & șoferi & atribuire —');
  const g = await api('POST', '/api/groups', { cookie: admin.cookie, body: { name: 'Flota Nord', description: 'test', color: '#10b981' } });
  check('creare grupă', g.status === 200, g.body); const gid = g.body.id;
  const d = await api('POST', '/api/drivers', { cookie: admin.cookie, body: { name: 'Ion Pop', phone: '0700', license_number: 'B123' } });
  check('creare șofer', d.status === 200, d.body); const did = d.body.id;
  const asg = await api('PUT', '/api/devices/TEST111/assign', { cookie: admin.cookie, body: { group_id: gid, driver_id: did } });
  check('atribuire grup+șofer pe TEST111', asg.status === 200, asg.body);
  const full = await api('GET', '/api/devices/TEST111/full', A);
  check('TEST111 are group_id corect', full.body.group_id === gid, full.body.group_id);
  check('TEST111 are driver_id corect', full.body.driver_id === did, full.body.driver_id);

  console.log('\n— Zone (geofence) + update —');
  const poly = await api('POST', '/api/geofences', { cookie: admin.cookie, body: { name: 'Depozit', type: 'polygon', coordinates: [[44.43,26.10],[44.44,26.10],[44.44,26.12]], color: '#2563eb' } });
  check('creare geofence poligon', poly.status === 200, poly.body);
  const circ = await api('POST', '/api/geofences', { cookie: admin.cookie, body: { name: 'Sediu', type: 'circle', coordinates: { center: [44.43,26.10], radius: 300 }, color: '#f59e0b' } });
  check('creare geofence cerc', circ.status === 200);
  const upd = await api('PUT', '/api/geofences/' + poly.body.id, { cookie: admin.cookie, body: { name: 'Depozit Central', type: 'polygon', coordinates: [[44.43,26.10],[44.44,26.10],[44.44,26.12]], color: '#2563eb' } });
  check('update geofence', upd.status === 200, upd.body);
  const gfs = await api('GET', '/api/geofences', A);
  check('listă geofence are 2', Array.isArray(gfs.body) && gfs.body.length === 2, gfs.body && gfs.body.length);

  console.log('\n— Alerte —');
  const al1 = await api('POST', '/api/alerts', { cookie: admin.cookie, body: { name: 'Viteză Nord', type: 'overspeed', imei: 'TEST111', condition: { maxSpeed: 90 }, enabled: true } });
  check('creare alertă overspeed', al1.status === 200, al1.body);
  const al2 = await api('POST', '/api/alerts', { cookie: admin.cookie, body: { name: 'Intrare depozit', type: 'geofence_enter', imei: null, condition: { geofenceId: poly.body.id }, enabled: true } });
  check('creare alertă geofence', al2.status === 200);
  const als = await api('GET', '/api/alerts', A);
  check('listă alerte are 2', Array.isArray(als.body) && als.body.length === 2, als.body && als.body.length);

  console.log('\n— Mentenanță —');
  const mn = await api('POST', '/api/maintenance', { cookie: admin.cookie, body: { imei: 'TEST111', type: 'ITP', description: 'Inspecție', due_date: '2026-09-01', status: 'pending' } });
  check('creare mentenanță', mn.status === 200, mn.body);
  const mns = await api('GET', '/api/maintenance', A);
  check('listă mentenanță conține intrarea', Array.isArray(mns.body) && mns.body.some(m => m.type === 'ITP'));

  console.log('\n— ACCES PE GRUP (client vede vehiculul prin grupă) —');
  await api('PUT', '/api/users/_purge', A).catch(()=>{}); // no-op
  const cu = await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'client.grup@test.ro', full_name: 'Client Grup', password: 'test12', role: 'client' } });
  check('creare client', cu.status === 200, cu.body); const cid = cu.body.id;
  // acces DOAR pe grup (fără device direct)
  const grant = await api('PUT', '/api/users/' + cid + '/access', { cookie: admin.cookie, body: { devices: [], groups: [gid] } });
  check('acordare acces pe grupă', grant.status === 200);
  const cl = await login('client.grup@test.ro', 'test12'); const C = { cookie: cl.cookie };
  const cdev = await api('GET', '/api/devices', C);
  check('client vede TEST111 PRIN GRUPĂ', Array.isArray(cdev.body) && cdev.body.length === 1 && cdev.body[0].imei === 'TEST111', cdev.body && cdev.body.map && cdev.body.map(x=>x.imei));
  check('client NU vede TEST222', Array.isArray(cdev.body) && !cdev.body.some(x => x.imei === 'TEST222'));
  const cmnt = await api('GET', '/api/maintenance', C);
  check('client vede mentenanța vehiculului din grup', Array.isArray(cmnt.body) && cmnt.body.some(m => m.imei === 'TEST111'));
  check('client e BLOCAT pe istoric TEST222 (403)', (await api('GET','/api/history/TEST222',C)).status === 403);
  check('client NU poate crea grupă (403)', (await api('POST','/api/groups',{cookie:cl.cookie,body:{name:'x'}})).status === 403);

  console.log('\n=== Faza 2: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
