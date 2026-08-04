// verify_geo_alerts.js — alertele de zonă: notificare pe fiecare zonă + push activ implicit.
//
// Două lipsuri reparate, verificate aici cu poziții REALE trimise pe TCP (codec8E), nu cu apeluri simulate:
//
// 1. Tipul `alert` LIPSEA din catalogul de preferințe (EVENT_TYPES). Push-ul se trimite doar pentru tipuri
//    bifate, iar bifa nu exista nicăieri → o regulă din „Alerte" nu putea ajunge NICIODATĂ pe telefon.
// 2. O regulă de zonă accepta o SINGURĂ zonă (`geofenceId`), iar răcirea de 5 minute era pe (regulă, vehicul):
//    chiar cu mai multe zone, a doua trecere din aceeași oră ar fi fost înghițită. Acum: `geofenceIds` +
//    răcire per zonă.
const { spawn } = require('child_process');
const net = require('net');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3141, TCP = 5141;
const DIR = path.join(os.tmpdir(), 'rax_geo_' + Date.now());
const B = 'http://localhost:' + PORT;
const IMEI = '860000000022201';
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const jar = { cookie: '' };
async function req(m, p, body) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, jar.cookie ? { Cookie: jar.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) jar.cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

// ── Pachet Teltonika codec8 cu o poziție — constructorul dovedit din verify_archive.js ──
function buildPacket(ts, lat, lng, speed, ignition) {
  const ones = [[239, ignition & 0xff]];
  const b1 = Buffer.concat([Buffer.from([ones.length])].concat(ones.map(([id, v]) => Buffer.from([id, v]))));
  const io = Buffer.concat([Buffer.from([0x00, ones.length]), b1, Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(lng * 1e7), 0); gps.writeInt32BE(Math.round(lat * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(speed, 13);
  const rec = Buffer.concat([tsb, Buffer.from([0x01]), gps, io]);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), rec, Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
let _ts = Date.now() - 600000;
function sendPos(lat, lng, speed, ign) {
  _ts += 20000; // timestamp-uri crescătoare (pozițiile din trecut pot fi respinse ca duplicat)
  const pkt = buildPacket(_ts, lat, lng, speed, ign ? 1 : 0);
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let step = 0;
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const len = Buffer.alloc(2); len.writeUInt16BE(im.length, 0); s.write(Buffer.concat([len, im])); });
    s.on('data', () => { if (step === 0) { step = 1; s.write(pkt); } else { s.end(); resolve(true); } });
    s.on('error', () => resolve(false));
    setTimeout(() => { try { s.end(); } catch (e) {} resolve(false); }, 3000);
  });
}

function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true', STRICT_DEVICES: 'false',
    });
    delete env.DATABASE_URL;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (b) => { out += b.toString(); if (/Server (HTTP )?(activ|pornit)|\[HTTP\]/i.test(out)) { p.stdout.off('data', onData); resolve(p); } };
    p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { out += b.toString(); });
    setTimeout(() => resolve(p), 20000);
  });
}
function kill(p) { return new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); }); }

(async () => {
  console.log('\n══ Alerte de zonă: notificare per zonă + push implicit ══\n');
  try {
    srv = await boot();
    await sleep(2500);
    t('super-admin autentificat', (await req('POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200);

    // ── Tipul „alert" trebuie să EXISTE în catalogul de preferințe, altfel nu se poate bifa push ──
    const et = (await req('GET', '/api/event-types')).body || [];
    const alertType = et.find(x => x.key === 'alert');
    t('tipul „alert" apare în preferințele de notificare', !!alertType, et.map(x => x.key).join(', '));
    t('push implicit PORNIT pentru regulile de alertă', !!(alertType && alertType.pushDefault), JSON.stringify(alertType));

    // ── Companie + vehicul + două zone vecine ──
    const co = (await req('POST', '/api/companies', { name: 'Firma Zone' })).body;
    await req('POST', '/api/devices', { imei: IMEI, name: 'Dacia Logan', plate: 'B 154 UIP', company_id: co.id });
    // Două cercuri de 500 m, la ~2 km distanță (nu se suprapun).
    const zA = (await req('POST', '/api/geofences', { name: 'Depozit Vest', type: 'circle', coordinates: { center: [45.700, 21.200], radius: 500 }, company_id: co.id })).body;
    const zB = (await req('POST', '/api/geofences', { name: 'Punct lucru Est', type: 'circle', coordinates: { center: [45.700, 21.230], radius: 500 }, company_id: co.id })).body;
    t('două zone create', !!(zA && zA.id && zB && zB.id), JSON.stringify([zA && zA.id, zB && zB.id]));

    // ── O SINGURĂ regulă, pentru AMBELE zone ──
    const rule = (await req('POST', '/api/alerts', {
      name: 'Intrare în zone urmărite', type: 'geofence_enter', imei: IMEI, enabled: true,
      condition: { geofenceIds: [zA.id, zB.id] }, company_id: co.id
    })).body;
    t('regulă cu DOUĂ zone salvată', !!(rule && rule.id) && JSON.stringify(rule.condition).includes(String(zB.id)), JSON.stringify(rule && rule.condition));

    // ── Traseu: în afara zonelor → intră în A → iese → intră în B, totul în câteva secunde ──
    await sendPos(45.700, 21.150, 40, true);   // afară (seedează starea „în afară" pt. ambele)
    await sleep(900);
    await sendPos(45.700, 21.200, 30, true);   // INTRARE în zona A
    await sleep(900);
    await sendPos(45.700, 21.215, 45, true);   // între zone
    await sleep(900);
    await sendPos(45.700, 21.230, 30, true);   // INTRARE în zona B  ← ar fi fost înghițită de răcirea comună
    await sleep(2500);

    const notifs = (await req('GET', '/api/notifications?limit=50')).body;
    const list = Array.isArray(notifs) ? notifs : (notifs && notifs.items) || [];
    const zoneNotifs = list.filter(n => n.data && n.data.alertType === 'geofence_enter');
    const names = zoneNotifs.map(n => (n.data && n.data.geofence) || '?');
    t('a apărut notificare pentru zona A', names.includes('Depozit Vest'), names.join(', ') || '(nicio notificare)');
    t('a apărut notificare pentru zona B în ACEEAȘI oră (răcire per zonă)', names.includes('Punct lucru Est'), names.join(', ') || '(nicio notificare)');
    t('exact două intrări raportate, nu una', zoneNotifs.length === 2, zoneNotifs.length + ' notificări: ' + names.join(', '));
    t('fiecare notificare spune ce zonă e', zoneNotifs.every(n => n.body && /zon/i.test(n.body)), zoneNotifs.map(n => n.body).join(' | '));

    // ── Regulile VECHI, cu o singură zonă (`geofenceId`), trebuie să meargă la fel ──
    const old = (await req('POST', '/api/alerts', {
      name: 'Regulă veche', type: 'geofence_exit', imei: IMEI, enabled: true,
      condition: { geofenceId: zB.id }, company_id: co.id
    })).body;
    await sendPos(45.700, 21.230, 20, true);   // încă în B (seed „înăuntru" pt. regula nouă)
    await sleep(900);
    await sendPos(45.700, 21.260, 50, true);   // IEȘIRE din B
    await sleep(2500);
    const l2 = (await req('GET', '/api/notifications?limit=50')).body;
    const arr2 = Array.isArray(l2) ? l2 : (l2 && l2.items) || [];
    t('formatul VECHI (o singură zonă) încă funcționează',
      arr2.some(n => n.data && n.data.alertType === 'geofence_exit'),
      arr2.filter(n => n.data && n.data.alertType).map(n => n.data.alertType).join(', '));

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack && e.stack.split('\n')[1]);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
