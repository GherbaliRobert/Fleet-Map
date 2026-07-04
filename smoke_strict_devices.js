// smoke_strict_devices.js — test integrare pentru MODUL STRICT de înregistrare device-uri.
// Pornește serverul real (PGlite, porturi de test), apoi verifică la handshake-ul TCP:
//   IMEI înregistrat → ACCEPTAT (0x01);  IMEI neînregistrat → RESPINS (fără 0x01) + apare în jurnalul de încercări.
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TCP_PORT = 25027, HTTP_PORT = 25028;
const BASE = 'http://localhost:' + HTTP_PORT;
const PGDIR = path.join(os.tmpdir(), 'strict-test-' + Date.now());

let pass = 0, fail = 0;
function check(n, c, extra) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }

// Handshake IMEI Teltonika (2 byte lungime + IMEI ascii) → citește primul byte (0x01 = accept).
function tcpHandshake(imei, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = net.connect(TCP_PORT, '127.0.0.1');
    let done = false; const finish = (r) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} resolve(r); };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => { const len = Buffer.alloc(2); len.writeUInt16BE(imei.length, 0); sock.write(Buffer.concat([len, Buffer.from(imei, 'ascii')])); });
    sock.on('data', (d) => finish({ ack: d[0] === 0x01, closed: false }));
    sock.on('close', () => finish({ ack: false, closed: true }));
    sock.on('error', () => finish({ ack: false, closed: true }));
    sock.on('timeout', () => finish({ ack: false, closed: false, timeout: true }));
  });
}
function cookieFrom(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; } return null; }
async function login(u, p) { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return { status: r.status, cookie: cookieFrom(r) }; }
async function api(method, p, opts = {}) { const h = { 'Content-Type': 'application/json' }; if (opts.cookie) h.Cookie = opts.cookie; const r = await fetch(BASE + p, { method, headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t; } return { status: r.status, body: j }; }
async function waitHealth(ms = 40000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 500)); } return false; }

(async () => {
  fs.mkdirSync(PGDIR, { recursive: true });
  const env = Object.assign({}, process.env, { PORT: String(HTTP_PORT), TCP_PORT: String(TCP_PORT), PGLITE_DIR: PGDIR, ADMIN_PASSWORD: 'admin123', STRICT_DEVICES: '1' });
  delete env.DATABASE_URL; delete env.DATABASE_PUBLIC_URL; // forțează PGlite local (nu Postgres-ul de producție)
  const srv = spawn('node', ['server.js'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = ''; srv.stdout.on('data', (d) => { bootLog += d; }); srv.stderr.on('data', (d) => { bootLog += d; });
  const cleanup = () => { try { srv.kill('SIGKILL'); } catch (_) {} try { fs.rmSync(PGDIR, { recursive: true, force: true }); } catch (_) {} };
  try {
    const up = await waitHealth();
    check('server pornit (health)', up);
    if (!up) { console.log('--- boot log ---\n' + bootLog.slice(-2000)); throw new Error('serverul nu a pornit'); }
    check('log „mod strict ACTIV"', /mod strict ACTIV/.test(bootLog), bootLog.match(/\[STRICT\].*/)?.[0]);

    const admin = await login('admin', 'admin123'); check('login admin', admin.status === 200, admin.status);
    const REG = '350111222333444', UNREG = '350999888777666';
    const reg = await api('POST', '/api/devices', { cookie: admin.cookie, body: { imei: REG, name: 'Test Strict' } });
    check('înregistrare IMEI (POST /api/devices)', reg.status === 200, reg.body);

    const r1 = await tcpHandshake(REG);
    check('IMEI ÎNREGISTRAT → ACCEPTAT (0x01)', r1.ack === true, r1);
    const r2 = await tcpHandshake(UNREG);
    check('IMEI NEÎNREGISTRAT → RESPINS (fără 0x01)', r2.ack === false && (r2.closed || r2.timeout), r2);

    await new Promise((r) => setTimeout(r, 400));
    const att = await api('GET', '/api/admin/device-attempts', { cookie: admin.cookie });
    check('jurnalul raportează strict=true', att.body && att.body.strict === true, att.body && att.body.strict);
    check('încercarea neînregistrată e în jurnal', att.body && Array.isArray(att.body.attempts) && att.body.attempts.some((a) => a.imei === UNREG), att.body && att.body.attempts);
    check('IMEI-ul înregistrat NU e în jurnal', att.body && Array.isArray(att.body.attempts) && !att.body.attempts.some((a) => a.imei === REG), true);
  } catch (e) { check('excepție', false, e.message); }
  finally { cleanup(); console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail'); process.exit(fail ? 1 : 0); }
})();
