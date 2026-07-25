// Smoke test Faza 3: catalog rapoarte + hotspot + analiză zonă (necesită SEED_TEST=1).
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra!==undefined?' → '+JSON.stringify(extra):'')); } }
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return {status:r.status,cookie:cookieFrom(r),body:await r.json().catch(()=>({}))}; }
async function api(method, path, opts={}) { const h={'Content-Type':'application/json'}; if(opts.cookie)h.Cookie=opts.cookie; const r=await fetch(BASE+path,{method,headers:h,body:opts.body?JSON.stringify(opts.body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j}; }

(async () => {
  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  const A = { cookie: admin.cookie };
  check('login admin', admin.status === 200);
  const from = new Date(Date.now() - 3*3600*1000).toISOString();
  const to = new Date().toISOString();
  const q = `?imei=TEST111&from=${from}&to=${to}`;

  console.log('\n— Catalog —');
  const cat = await api('GET', '/api/reports', A);
  check('catalog: 14 rapoarte + 4 categorii', cat.body && Array.isArray(cat.body.reports) && cat.body.reports.length === 14 && Array.isArray(cat.body.categories) && cat.body.categories.length === 4, cat.body && cat.body.reports && cat.body.reports.length);

  console.log('\n— Rapoarte (din cursa seedată) —');
  const trips = await api('GET', '/api/reports/trips' + q, A);
  check('foaie de parcurs: ≥2 curse', trips.status===200 && trips.body.rows && trips.body.rows.length >= 2, trips.body && trips.body.rows && trips.body.rows.length);
  const stops = await api('GET', '/api/reports/stops' + q, A);
  check('opriri: ≥1', stops.body.rows && stops.body.rows.length >= 1, stops.body && stops.body.rows && stops.body.rows.length);
  const spd = await api('GET', '/api/reports/speeding' + q + '&limit=90', A);
  check('depășiri: ≥1 (viteză 100>90)', spd.body.rows && spd.body.rows.length >= 1, spd.body && spd.body.rows && spd.body.rows.length);
  const fuel = await api('GET', '/api/reports/fuel' + q, A);
  check('combustibil: ≥2 evenimente (alimentare + scădere)', fuel.body.rows && fuel.body.rows.length >= 2, fuel.body && fuel.body.rows && fuel.body.rows.length);
  const util = await api('GET', '/api/reports/utilization' + q, A);
  check('utilizare: are sumar km', util.body.summary && util.body.summary['Km total'] > 0, util.body && util.body.summary);
  const drv = await api('GET', '/api/reports/driver' + q, A);
  check('pontaj șofer: ≥1 rând', drv.body.rows && drv.body.rows.length >= 1);
  const gf = await api('GET', '/api/reports/geofence' + q, A);
  check('vizite geofence: 200 (poate fi gol)', gf.status === 200);

  console.log('\n— Hotspot + zonă —');
  const hs = await api('GET', '/api/hotspot' + q + '&mode=stops', A);
  check('hotspot (stops): ≥1 punct', Array.isArray(hs.body) && hs.body.length >= 1, hs.body && hs.body.length);
  const zone = await api('POST', '/api/zone-report', { cookie: admin.cookie, body: { imei: 'TEST111', from, to, zone: { type: 'circle', center: [44.4268, 26.1025], radius: 3000 } } });
  check('analiză zonă: ≥1 vehicul cu vizită', zone.status===200 && zone.body.rows && zone.body.rows.length >= 1, zone.body && zone.body.summary);

  console.log('\n— Acces (client scopat) —');
  await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'cli.rep@test.ro', full_name: 'Client Rapoarte', password: 'test12', role: 'client' } });
  const cl = await login('cli.rep@test.ro', 'test12'); const C = { cookie: cl.cookie };
  const cTrips = await api('GET', '/api/reports/trips?imei=TEST111&from='+from+'&to='+to, C);
  check('client FĂRĂ acces e blocat pe raport TEST111 (403)', cTrips.status === 403, cTrips.status);

  console.log('\n=== Faza 3: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
