// Smoke test: evenimente per-utilizator (abonamente + praguri + detecție + push). Necesită SEED_TEST=1.
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra!==undefined?' → '+JSON.stringify(extra):'')); } }
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return {status:r.status,cookie:cookieFrom(r),body:await r.json().catch(()=>({}))}; }
async function api(method, path, opts={}) { const h={'Content-Type':'application/json'}; if(opts.cookie)h.Cookie=opts.cookie; const r=await fetch(BASE+path,{method,headers:h,body:opts.body!==undefined?JSON.stringify(opts.body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j}; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  const A = { cookie: admin.cookie };
  check('login admin', admin.status === 200);

  console.log('\n— Catalog tipuri + preferințe —');
  const et = await api('GET', '/api/event-types', A);
  check('catalog tipuri evenimente (9)', Array.isArray(et.body) && et.body.length === 9, et.body && et.body.length);
  const prefs = { types: { fuel_drop: { enabled: true, threshold: 5, email: false, push: false }, overspeed: { enabled: true, threshold: 80 }, no_ignition_move: { enabled: true }, idling: { enabled: false } } };
  check('salvare preferințe', (await api('PUT', '/api/notification-prefs', { cookie: admin.cookie, body: prefs })).status === 200);
  const got = await api('GET', '/api/notification-prefs', A);
  check('preferințe persistate (prag fuel_drop=5)', got.body && got.body.types && got.body.types.fuel_drop && got.body.types.fuel_drop.threshold === 5, got.body);

  console.log('\n— Web Push —');
  const vapid = await api('GET', '/api/push/vapid', A);
  check('cheie VAPID publică disponibilă', vapid.body && typeof vapid.body.publicKey === 'string' && vapid.body.publicKey.length > 20);
  const sub = { endpoint: 'https://example.com/push/' + Date.now(), keys: { p256dh: 'BJxxx', auth: 'authxxx' } };
  check('abonare push (stocată)', (await api('POST', '/api/push/subscribe', { cookie: admin.cookie, body: sub })).status === 200);

  console.log('\n— Detecție evenimente per-user (simulare poziții) —');
  // 1) setează nivel inițial combustibil (fără eveniment, prev gol)
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', name: 'Camion A', speed: 40, io: { can_fuel_level_liters: 300, ignition: 1 } } });
  // 2) scădere 10 L (>= prag 5) -> fuel_drop
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', name: 'Camion A', speed: 40, io: { can_fuel_level_liters: 290, ignition: 1 } } });
  // 3) viteză 100 (>= prag 80) -> overspeed
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', name: 'Camion A', speed: 100, io: { can_fuel_level_liters: 290, ignition: 1 } } });
  // 4) mișcare cu contact oprit -> no_ignition_move
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', name: 'Camion A', speed: 20, io: { ignition: 0 } } });
  await sleep(300);
  const notifs = await api('GET', '/api/notifications?limit=50', A);
  const types = (Array.isArray(notifs.body) ? notifs.body : []).map(n => n.type);
  check('eveniment fuel_drop livrat', types.includes('fuel_drop'), types);
  check('eveniment overspeed livrat', types.includes('overspeed'));
  check('eveniment no_ignition_move livrat', types.includes('no_ignition_move'));
  const fd = notifs.body.find(n => n.type === 'fuel_drop');
  check('notificarea e personală (user_id setat)', fd && fd.user_id != null, fd && fd.user_id);

  console.log('\n— Prag respectat (idling dezactivat nu apare) —');
  check('idling dezactivat → fără eveniment idling', !types.includes('idling'));

  console.log('\n— Unread + ack —');
  const u1 = await api('GET', '/api/notifications/unread-count', A);
  check('unread > 0', u1.body.count > 0, u1.body);
  await api('POST', '/api/notifications/ack-all', A);
  check('unread = 0 după ack-all', (await api('GET', '/api/notifications/unread-count', A)).body.count === 0);

  console.log('\n— Scoping notificări personale —');
  await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'cli.ev@test.ro', full_name: 'Client Evenimente', password: 'test12', role: 'client' } });
  const cl = await login('cli.ev@test.ro', 'test12'); const C = { cookie: cl.cookie };
  const cn = await api('GET', '/api/notifications', C);
  check('clientul NU vede notificările personale ale adminului', Array.isArray(cn.body) && !cn.body.some(n => n.type === 'fuel_drop'), cn.body && cn.body.length);

  console.log('\n=== Faza 6: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
