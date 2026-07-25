// Smoke test Faza 4: detecție curse + notificări (centru + ack + scoping) + canal webhook.
// Necesită server pornit cu SEED_TEST=1 și NOTIFY_WEBHOOK_URL=http://localhost:4999/hook
const http = require('http');
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra!==undefined?' → '+JSON.stringify(extra):'')); } }
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return {status:r.status,cookie:cookieFrom(r),body:await r.json().catch(()=>({}))}; }
async function api(method, path, opts={}) { const h={'Content-Type':'application/json'}; if(opts.cookie)h.Cookie=opts.cookie; const r=await fetch(BASE+path,{method,headers:h,body:opts.body?JSON.stringify(opts.body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j}; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // listener webhook local
  const received = [];
  const hook = http.createServer((req, res) => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{received.push(JSON.parse(b));}catch{} res.writeHead(200); res.end('ok'); }); });
  await new Promise(r => hook.listen(4999, r));

  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  const A = { cookie: admin.cookie };
  check('login admin', admin.status === 200);

  console.log('\n— Detecție automată curse → trips —');
  const det = await api('POST', '/api/trips/detect', A);
  check('declanșare detecție curse', det.status === 200, det.body);
  const from = new Date(Date.now()-3*3600*1000).toISOString(), to = new Date().toISOString();
  const trips = await api('GET', `/api/trips/TEST111?from=${from}&to=${to}`, A);
  check('tabela trips populată (≥2 curse)', Array.isArray(trips.body) && trips.body.length >= 2, trips.body && trips.body.length);
  check('cursa are distanță și durată', trips.body[0] && trips.body[0].distance_km > 0 && trips.body[0].duration_seconds > 0, trips.body[0]);

  console.log('\n— Expirări documente/mentenanță → notificări —');
  await api('POST', '/api/drivers', { cookie: admin.cookie, body: { name: 'Sofer Expirat', license_number: 'X999', license_expiry: '2020-01-01' } });
  await api('POST', '/api/maintenance', { cookie: admin.cookie, body: { imei: 'TEST111', type: 'ITP', due_date: '2020-01-01', status: 'pending' } });
  const ce = await api('POST', '/api/notifications/check-expiries', A);
  check('verificare expirări', ce.status === 200, ce.body);
  await sleep(600);
  const notifs = await api('GET', '/api/notifications?limit=50', A);
  check('notificare expirare permis creată', Array.isArray(notifs.body) && notifs.body.some(n => n.type === 'document_expiry'));
  check('notificare mentenanță scadentă creată', notifs.body.some(n => n.type === 'maintenance_due' && n.imei === 'TEST111'));

  console.log('\n— Canal webhook (livrare externă) —');
  check('webhook a primit notificări', received.length >= 1, received.length);
  check('payload webhook are tip notificare', received.some(n => n.type === 'document_expiry' || n.type === 'maintenance_due'));

  console.log('\n— Centru notificări: unread + ack —');
  const u1 = await api('GET', '/api/notifications/unread-count', A);
  check('unread-count > 0', u1.body.count > 0, u1.body);
  const firstId = notifs.body[0].id;
  await api('POST', '/api/notifications/' + firstId + '/ack', A);
  const u2 = await api('GET', '/api/notifications/unread-count', A);
  check('unread scade după ack', u2.body.count === u1.body.count - 1, { before: u1.body.count, after: u2.body.count });
  await api('POST', '/api/notifications/ack-all', A);
  const u3 = await api('GET', '/api/notifications/unread-count', A);
  check('unread = 0 după ack-all', u3.body.count === 0, u3.body);

  console.log('\n— Scoping notificări —');
  await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'cli.notif@test.ro', full_name: 'Client Notificari', password: 'test12', role: 'client' } });
  const cl = await login('cli.notif@test.ro', 'test12'); const C = { cookie: cl.cookie };
  const cn = await api('GET', '/api/notifications', C);
  check('client (fără acces) NU vede notificarea mentenanță TEST111', Array.isArray(cn.body) && !cn.body.some(n => n.type === 'maintenance_due' && n.imei === 'TEST111'), cn.body && cn.body.map && cn.body.map(n=>n.type));

  console.log('\n— Canale configurate —');
  const ch = await api('GET', '/api/notifications/channels', A);
  check('canal webhook raportat ca activ', ch.body && ch.body.webhook === true, ch.body);

  hook.close();
  console.log('\n=== Faza 4: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
