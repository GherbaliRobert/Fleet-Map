// verify_fuel_alarma.js — lanțul COMPLET al unei scăderi de carburant: pachet → detector → notificare.
//
// De ce există. `verify_fuel_parcare.js` verifică automatul de decizie (fueltheft.js) izolat, și e
// verde de la 20.08. Cu toate astea, pe Dacia Logan B154UIP continua să vină, la FIECARE pornire de
// motor, „Scădere 11.0 L (43 → 32 L)". Motivul: automatul ăla nu era singurul care decidea. Calea
// evenimentelor per-utilizator își făcea propria scădere — nivelul din poziția anterioară minus
// nivelul de acum, pe un singur pachet — fără fereastră de așezare a sondei, fără confirmare, fără
// să verifice că amândouă citirile vin din aceeași sursă, și fără să știe că valoarea „anterioară"
// era de fapt cea CĂRATĂ de dinainte de parcare.
//
// Testul ăsta pornește serverul adevărat și verifică pe rând:
//   1. ciclu normal oprit → pornit, cu citire mică la pornire care apoi revine → TĂCERE;
//   2. furt adevărat (nivelul rămâne jos și se confirmă)                       → EXACT o notificare;
//   3. surse diferite (rezervor calibrat la oprire, CAN brut la pornire)        → TĂCERE;
//   4. prima citire după contact e 0                                           → TĂCERE.
//
// Ferestrele de așezare/confirmare se scurtează din mediu (FUEL_ASEZARE_MS / FUEL_CONFIRM_MS /
// FUEL_CONFIRM_N), altfel un test onest ar dura șapte minute. Valorile de producție rămân cele din
// fueltheft.js — testul nu le atinge.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const HTTP = 3013, TCP = 5039;
const BASE = 'http://localhost:' + HTTP;
const TMP = path.join(os.tmpdir(), 'rax_fuelalarm_' + Date.now());

let pass = 0, fail = 0;
function check(nume, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + nume); }
  else { fail++; console.log('  ❌ ' + nume + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; }
  return null;
}
async function api(method, cale, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (opts.cookie) h.Cookie = opts.cookie;
  const r = await fetch(BASE + cale, { method, headers: h, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, cookie: cookieFrom(r) };
}

function porneste() {
  return spawn('node', ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PGLITE_DIR: TMP, ADMIN_PASSWORD: 'admin123', SESSION_SECRET: 'fuel_alarma_test',
      PORT: String(HTTP), TCP_PORT: String(TCP), DATABASE_URL: '', DEMO_DISABLED: 'true', SEED_TEST: '1',
      // ferestre scurte: 0,4 s așezare, 0,8 s confirmare, 2 citiri
      FUEL_ASEZARE_MS: '400', FUEL_CONFIRM_MS: '800', FUEL_CONFIRM_N: '2',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

(async () => {
  const srv = porneste();
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  let gata = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { gata = true; break; } } catch { /* încă pornește */ }
    await sleep(1000);
  }
  check('serverul a pornit', gata);
  if (!gata) { srv.kill(); process.exit(1); }

  const login = await api('POST', '/api/login', { body: { username: 'admin', password: 'admin123' } });
  check('autentificare admin', login.status === 200);
  const A = { cookie: login.cookie };

  // Utilizatorul e abonat la „Scădere bruscă combustibil" cu prag mic — ca la client.
  await api('PUT', '/api/notification-prefs', {
    cookie: A.cookie, body: { types: { fuel_drop: { enabled: true, threshold: 5, email: false, push: false } } },
  });

  const IMEI = '350424069999001';
  await api('POST', '/api/devices', { cookie: A.cookie, body: { imei: IMEI, name: 'Dacia Logan probă', plate: 'B154UIP' } });

  const sim = (io, speed) => api('POST', '/api/test/simulate', { cookie: A.cookie, body: { imei: IMEI, name: 'Dacia Logan probă', speed: speed || 0, io } });
  async function scaderi() {
    const n = await api('GET', '/api/notifications?limit=50', A);
    return (Array.isArray(n.body) ? n.body : []).filter((x) => x.type === 'fuel_drop');
  }
  async function curata() { await api('POST', '/api/notifications/ack-all', A); }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n1. Pornire normală: prima citire e mică, apoi sonda se așază înapoi la 43 L');
  await sim({ ignition: 1, can_fuel_level_liters: 43 }, 40);
  await sim({ ignition: 0, can_fuel_level_liters: 43 }, 0);
  await sim({ ignition: 1, can_fuel_level_liters: 32 }, 0);   // citirea nesigură de la pornire
  await sleep(600);
  await sim({ ignition: 1, can_fuel_level_liters: 43 }, 5);   // s-a așezat — nu lipsește nimic
  await sim({ ignition: 1, can_fuel_level_liters: 43 }, 20);
  await sleep(500);
  let f = await scaderi();
  check('nicio notificare (exact cazul raportat pe B154UIP)', f.length === 0, f.map((x) => x.body));

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n2. Furt adevărat: nivelul RĂMÂNE jos după pornire');
  await curata();
  await sim({ ignition: 1, can_fuel_level_liters: 43 }, 30);
  await sim({ ignition: 0, can_fuel_level_liters: 43 }, 0);
  await sim({ ignition: 1, can_fuel_level_liters: 25 }, 0);
  await sleep(600);                                            // trece fereastra de așezare
  await sim({ ignition: 1, can_fuel_level_liters: 25 }, 3);
  await sleep(500);
  await sim({ ignition: 1, can_fuel_level_liters: 25 }, 4);
  await sleep(300);
  await sim({ ignition: 1, can_fuel_level_liters: 25 }, 5);
  await sleep(600);
  f = await scaderi();
  check('scăderea reală ESTE anunțată', f.length >= 1, f.map((x) => x.body));
  check('anunțul spune de la cât la cât', f.length > 0 && /43[.,]0 → 25[.,]0 L/.test(f[0].body || ''), f[0] && f[0].body);
  check('anunțul spune că s-a întâmplat cât a stat oprit', f.length > 0 && /cât a stat oprit/.test(f[0].body || ''));
  check('detaliul are cantitatea, pentru ecranul de notificare',
    f.length > 0 && f[0].data && Math.abs(Number(f[0].data.drop) - 18) < 0.51, f[0] && f[0].data);
  check('o singură notificare, nu una pe pachet', f.length === 1, f.length);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n3. Surse diferite: rezervor calibrat la oprire, CAN brut la pornire');
  await curata();
  const IMEI2 = '350424069999002';
  await api('POST', '/api/devices', { cookie: A.cookie, body: { imei: IMEI2, name: 'Camion sondă', plate: 'B-999-SND' } });
  const sim2 = (io, speed) => api('POST', '/api/test/simulate', { cookie: A.cookie, body: { imei: IMEI2, name: 'Camion sondă', speed: speed || 0, io } });
  await sim2({ ignition: 1, fuel_level_liters: 430 }, 40);
  await sim2({ ignition: 0, fuel_level_liters: 430 }, 0);
  await sim2({ ignition: 1, can_fuel_level_liters: 380 }, 0);
  await sleep(600);
  await sim2({ ignition: 1, can_fuel_level_liters: 380 }, 3);
  await sleep(500);
  await sim2({ ignition: 1, can_fuel_level_liters: 380 }, 4);
  await sleep(600);
  f = (await scaderi()).filter((x) => x.imei === IMEI2);
  check('nu se compară două feluri de a măsura', f.length === 0, f.map((x) => x.body));

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Prima citire după contact e 0 (magistrala încă nu răspunde)');
  await curata();
  const IMEI3 = '350424069999003';
  await api('POST', '/api/devices', { cookie: A.cookie, body: { imei: IMEI3, name: 'Probă zero', plate: 'B-000-ZER' } });
  const sim3 = (io, speed) => api('POST', '/api/test/simulate', { cookie: A.cookie, body: { imei: IMEI3, name: 'Probă zero', speed: speed || 0, io } });
  await sim3({ ignition: 1, can_fuel_level_liters: 43 }, 40);
  await sim3({ ignition: 0, can_fuel_level_liters: 43 }, 0);
  await sim3({ ignition: 1, can_fuel_level_liters: 0 }, 0);
  await sleep(600);
  await sim3({ ignition: 1, can_fuel_level_liters: 0 }, 0);
  await sleep(500);
  await sim3({ ignition: 1, can_fuel_level_liters: 0 }, 0);
  await sleep(600);
  f = (await scaderi()).filter((x) => x.imei === IMEI3);
  check('un 0 nu înseamnă „rezervorul e gol"', f.length === 0, f.map((x) => x.body));

  console.log('\n──────────────────────────────');
  console.log(pass + ' verificări trecute, ' + fail + ' picate');
  srv.kill();
  await sleep(400);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* rămâne în temp */ }
  process.exit(fail ? 1 : 0);
})();
