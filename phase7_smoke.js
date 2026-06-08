// Smoke test: mapare sonde litrometrice + calcul nivel normalizat. Necesită SEED_TEST=1.
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra!==undefined?' → '+JSON.stringify(extra):'')); } }
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return {status:r.status,cookie:cookieFrom(r),body:await r.json().catch(()=>({}))}; }
async function api(method, path, opts={}) { const h={'Content-Type':'application/json'}; if(opts.cookie)h.Cookie=opts.cookie; const r=await fetch(BASE+path,{method,headers:h,body:opts.body!==undefined?JSON.stringify(opts.body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j}; }

(async () => {
  const admin = await login('admin', process.env.ADMIN_PASSWORD || 'admin123');
  const A = { cookie: admin.cookie };
  check('login admin', admin.status === 200);

  console.log('\n— Config sonde (EuroSens Dominator LLS + Degree BLE frecvență) —');
  const sensors = [
    { name: 'Rezervor LLS', source: 'lls_fuel_level_1', mode: 'direct' },
    { name: 'BLE frecvență', source: 'ble_fuel_frequency_1', mode: 'calibration', calibration: [{ raw: 0, liters: 0 }, { raw: 1000, liters: 100 }] }
  ];
  check('salvare sonde', (await api('PUT', '/api/devices/TEST111/fuel-sensors', { cookie: admin.cookie, body: { sensors } })).status === 200);
  const got = await api('GET', '/api/devices/TEST111/fuel-sensors', A);
  check('citire sonde (2)', Array.isArray(got.body) && got.body.length === 2, got.body && got.body.length);
  const full = await api('GET', '/api/devices/TEST111/full', A);
  check('fuel_sensors prezent în /full', full.body && Array.isArray(full.body.fuel_sensors) && full.body.fuel_sensors.length === 2);

  console.log('\n— Calcul nivel normalizat (din sonde) —');
  // primar = LLS direct (250 L); a doua = frecvență 500 Hz -> interpolare [0->0, 1000->100] = 50 L
  const sim = await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', speed: 0, io: { lls_fuel_level_1: 250, ble_fuel_frequency_1: 500, ignition: 1 } } });
  check('simulare 200', sim.status === 200, sim.body);
  check('fuel_level_liters = 250 (LLS direct, primar)', sim.body.io && sim.body.io.fuel_level_liters === 250, sim.body.io && sim.body.io.fuel_level_liters);
  check('sondă 2 (frecvență→litri) = 50', sim.body.io && sim.body.io.fuel_sensor_2_liters === 50, sim.body.io && sim.body.io.fuel_sensor_2_liters);

  console.log('\n— Calibrare analogică (Escort AIN) —');
  await api('PUT', '/api/devices/TEST111/fuel-sensors', { cookie: admin.cookie, body: { sensors: [ { name: 'Escort AIN1', source: 'analog_input_1', mode: 'calibration', calibration: [{ raw: 500, liters: 0 }, { raw: 4500, liters: 100 }] } ] } });
  const sim2 = await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', speed: 0, io: { analog_input_1: 2500, ignition: 1 } } });
  check('AIN1=2500mV → 50 L (interpolare 500-4500)', sim2.body.io && sim2.body.io.fuel_level_liters === 50, sim2.body.io && sim2.body.io.fuel_level_liters);

  console.log('\n— Scădere combustibil pe sonda mapată declanșează eveniment —');
  await api('PUT', '/api/notification-prefs', { cookie: admin.cookie, body: { types: { fuel_drop: { enabled: true, threshold: 5 } } } });
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', speed: 0, io: { analog_input_1: 4500, ignition: 1 } } }); // ~100 L
  await api('POST', '/api/test/simulate', { cookie: admin.cookie, body: { imei: 'TEST111', speed: 0, io: { analog_input_1: 2500, ignition: 1 } } }); // ~50 L (scădere 50)
  const notifs = await api('GET', '/api/notifications?limit=20', A);
  check('eveniment fuel_drop din sonda mapată', Array.isArray(notifs.body) && notifs.body.some(n => n.type === 'fuel_drop'));

  console.log('\n— Acces (client fără drept nu poate seta sonde) —');
  await api('POST', '/api/users', { cookie: admin.cookie, body: { username: 'cli_fs', password: 'test12', role: 'client' } });
  const cl = await login('cli_fs', 'test12');
  check('client NU poate seta sonde (403)', (await api('PUT', '/api/devices/TEST111/fuel-sensors', { cookie: cl.cookie, body: { sensors: [] } })).status === 403);

  console.log('\n=== Sonde: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('EROARE TEST:', e); process.exit(2); });
