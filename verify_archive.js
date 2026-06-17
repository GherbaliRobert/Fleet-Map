// verify_archive.js — integration test: oprire ingest + păstrare istoric la arhivare dispozitiv.
// Boot server (PGlite temp) → device ACTIV trimite 3 pachete (stocate) → ARHIVEAZĂ (snapshot istoric + scos din live)
// → mai trimite 2 pachete (DROPPED) → istoricul vechi RĂMÂNE → RESTAUREAZĂ → trimite 1 pachet (stocat iar).
const { spawn } = require('child_process');
const net = require('net'); const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');

const TMP = path.join(os.tmpdir(), 'rax_archive_' + Date.now());
const IMEI = '111122223333444';
const HTTP = 3013, TCP = 5039;
let pass = 0, fail = 0, srv = null;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

function buildPacket(ts, lat, lng, ignition) {
  const ones = [[239, ignition & 0xff]];
  const b1 = Buffer.concat([Buffer.from([ones.length])].concat(ones.map(([id, v]) => Buffer.from([id, v]))));
  const b2 = Buffer.from([0]); const b4 = Buffer.from([0]); const b8 = Buffer.from([0]);
  const total = ones.length;
  const io = Buffer.concat([Buffer.from([0x00, total]), b1, b2, b4, b8]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(lng * 1e7), 0); gps.writeInt32BE(Math.round(lat * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(0, 13);
  const rec = Buffer.concat([tsb, Buffer.from([0x01]), gps, io]);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), rec, Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
function sendPacket(pkt, who) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let step = 0;
    s.on('connect', () => { const imei = Buffer.from(who || IMEI, 'ascii'); const len = Buffer.alloc(2); len.writeUInt16BE(imei.length, 0); s.write(Buffer.concat([len, imei])); });
    s.on('data', () => { if (step === 0) { step = 1; s.write(pkt); } else { s.end(); resolve(); } });
    s.on('error', () => resolve());
    setTimeout(() => { try { s.end(); } catch (e) {} resolve(); }, 2500);
  });
}
function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' }; if (cookie) headers.Cookie = cookie; if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port: HTTP, path: p, method, headers }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, data: j, cookie: (res.headers['set-cookie'] || [''])[0].split(';')[0] }); });
    });
    req.on('error', () => resolve({ status: 0 })); if (data) req.write(data); req.end();
  });
}
async function waitReady(timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const r = await httpReq('POST', '/api/login', { username: 'admin', password: 'admin123' }); if (r.status === 200) return r.cookie; await new Promise(r => setTimeout(r, 400)); }
  return null;
}
function startServer() {
  return spawn('node', ['server.js'], { cwd: process.cwd(), env: Object.assign({}, process.env, { PGLITE_DIR: TMP, ADMIN_PASSWORD: 'admin123', PORT: String(HTTP), TCP_PORT: String(TCP), DEMO_DISABLED: 'true', DATABASE_URL: '' }), stdio: ['ignore', 'pipe', 'pipe'] });
}
async function getLive(cookie) { const r = await httpReq('GET', '/api/live', null, cookie); return (r.status === 200 && Array.isArray(r.data)) ? r.data : []; }
async function getHistory(cookie, from, to) {
  const r = await httpReq('GET', '/api/history/' + IMEI + '?from=' + encodeURIComponent(new Date(from).toISOString()) + '&to=' + encodeURIComponent(new Date(to).toISOString()), null, cookie);
  return (r.status === 200 && Array.isArray(r.data)) ? r.data : [];
}
async function getArchivedList(cookie) { const r = await httpReq('GET', '/api/archived-devices', null, cookie); return (r.status === 200 && Array.isArray(r.data)) ? r.data : []; }

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  srv = startServer(); srv.stderr.on('data', d => { const s = String(d); if (/Error|throw|undefined is not/i.test(s)) process.stderr.write('[srv] ' + s); });
  let cookie = await waitReady(30000);
  ok(!!cookie, 'server ready + admin login');
  if (!cookie) { console.log('RESULT: ' + pass + ' / ' + (fail + 1) + ' fail'); srv.kill(); process.exit(1); }

  const base = Date.now() - 5 * 60 * 1000; // 5 min în urmă, ca să fie în fereastra implicită
  const FROM = base - 60000, TO = base + 600000;

  console.log('\n— Device ACTIV: 3 pachete → trebuie stocate —');
  await sendPacket(buildPacket(base, 44.40, 26.00, 1));
  await sendPacket(buildPacket(base + 1000, 44.41, 26.01, 1));
  await sendPacket(buildPacket(base + 2000, 44.42, 26.02, 1));
  await new Promise(r => setTimeout(r, 1200));
  let hist = await getHistory(cookie, FROM, TO);
  ok(hist.length === 3, '3 poziții stocate cât e activ (got ' + hist.length + ')');
  let live = await getLive(cookie);
  ok(live.some(p => p.imei === IMEI), 'apare live cât e activ');

  console.log('\n— ARHIVEAZĂ device-ul → snapshot istoric + scos din live —');
  let r = await httpReq('PUT', '/api/devices/' + IMEI + '/status', { status: 'archived' }, cookie);
  ok(r.status === 200 && r.data && r.data.status === 'archived', 'PUT status=archived OK');
  ok(r.data && r.data.archived_positions === 3, 'archived_positions=3 (istoric copiat în arhivă, got ' + (r.data && r.data.archived_positions) + ')');
  live = await getLive(cookie);
  ok(!live.some(p => p.imei === IMEI), 'NU mai apare live după arhivare');
  let arch = await getArchivedList(cookie);
  let ad = arch.find(d => d.imei === IMEI);
  ok(!!ad, 'apare în /api/archived-devices după arhivare');
  ok(ad && ad.archived_positions === 3, 'archived-devices: archived_positions=3 (got ' + (ad && ad.archived_positions) + ')');

  console.log('\n— Device ARHIVAT trimite 2 pachete → trebuie DROPPED (nu se stochează) —');
  await sendPacket(buildPacket(base + 3000, 44.50, 26.10, 1));
  await sendPacket(buildPacket(base + 4000, 44.51, 26.11, 1));
  await new Promise(r => setTimeout(r, 1200));
  hist = await getHistory(cookie, FROM, TO);
  ok(hist.length === 3, 'istoricul rămâne 3 — pachetele post-arhivare DROPPED (got ' + hist.length + ')');
  live = await getLive(cookie);
  ok(!live.some(p => p.imei === IMEI), 'tot NU apare live (pachete ignorate)');

  console.log('\n— Memoria veche NU se pierde: istoricul vechi e accesibil din arhivă —');
  ok(hist.length === 3 && hist[0].latitude && Math.abs(hist[0].latitude - 44.40) < 0.001, 'prima poziție veche păstrată (lat 44.40, got ' + (hist[0] && hist[0].latitude) + ')');

  console.log('\n— RESTAUREAZĂ → reia ingestul —');
  r = await httpReq('PUT', '/api/devices/' + IMEI + '/status', { status: 'active' }, cookie);
  ok(r.status === 200 && r.data && r.data.status === 'active', 'PUT status=active (restore) OK');
  await sendPacket(buildPacket(base + 5000, 44.43, 26.03, 1));
  await new Promise(r => setTimeout(r, 1200));
  hist = await getHistory(cookie, FROM, TO);
  ok(hist.length === 4, 'după restaurare: 3 vechi (din arhivă) + 1 nou = 4 (got ' + hist.length + ')');
  live = await getLive(cookie);
  ok(live.some(p => p.imei === IMEI), 'apare iar live după restaurare');
  arch = await getArchivedList(cookie);
  ok(!arch.some(d => d.imei === IMEI), 'dispare din /api/archived-devices după restaurare');

  srv.kill();
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); try { srv && srv.kill(); } catch (_) {} process.exit(2); });
