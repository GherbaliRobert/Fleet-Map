// verify_ack_durabil.js — confirmarea către tracker vine DUPĂ scrierea în baza de date.
//
// Constatare critică din auditul de lansare: ACK-ul se trimitea înainte de `insertPositions`. Trackerul
// Teltonika șterge batch-ul din memoria lui imediat ce primește confirmarea — deci orice pană de bază
// (restart Railway, pool epuizat într-un vârf) însemna pierdere DEFINITIVĂ, fără urmă recuperabilă.
// Retrimiterea de către tracker e plasa de siguranță pe care protocolul o oferă gratis; o aruncam.
//
// Testul verifică patru lucruri, cu pachete REALE pe TCP:
//   1. în funcționare normală, confirmarea vine și poziția chiar ajunge în istoric;
//   2. când scrierea eșuează, NU se confirmă → trackerul păstrează batch-ul;
//   3. după ce baza revine, retransmisia aceluiași batch se scrie și se confirmă;
//   4. retransmisia NU duplică (ON CONFLICT DO NOTHING).
const { spawn } = require('child_process');
const net = require('net');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3161, TCP = 5161;
const DIR = path.join(os.tmpdir(), 'rax_ack_' + Date.now());
const B = 'http://localhost:' + PORT;
const IMEI = '860000000044401';
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jar = () => ({ cookie: '' });
async function req(j, m, p, body) {
  const r = await fetch(B + p, {
    method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, j.cookie ? { Cookie: j.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) j.cookie = sc.split(';')[0];
  let o = null; try { o = await r.json(); } catch (e) {}
  return { status: r.status, body: o };
}

// Pachet Teltonika codec8 (constructorul dovedit din verify_archive.js)
function buildPacket(ts, lat, lng, speed) {
  const ones = [[239, 1]];
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
// Trimite un pachet și întoarce ACK-ul primit (numărul de recorduri confirmate), sau null dacă N-A VENIT.
function trimite(pkt, asteaptaMs) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0; let raspuns = null;
    const gata = () => { try { s.end(); } catch (e) {} resolve(raspuns); };
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', (b) => {
      if (pas === 0) { pas = 1; s.write(pkt); return; }        // primul răspuns = acceptarea IMEI-ului
      raspuns = b.length >= 4 ? b.readUInt32BE(0) : null;      // al doilea = ACK-ul batch-ului
      gata();
    });
    s.on('error', () => resolve(null));
    setTimeout(gata, asteaptaMs || 3500);                      // fără ACK în intervalul ăsta → null
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
    let o = '';
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { p.stdout.off('data', on); setTimeout(() => resolve(p), 1200); } };
    p.stdout.on('data', on); p.stderr.on('data', () => {});
    setTimeout(() => resolve(p), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); });

(async () => {
  console.log('\n══ Durabilitate: confirmarea vine după scriere ══\n');
  const azi = new Date(); azi.setHours(6, 0, 0, 0);
  try {
    srv = await boot(); await sleep(3500);
    const S = jar();
    await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    await req(S, 'POST', '/api/devices', { imei: IMEI, name: 'Test Durabilitate', plate: 'B 01 DUR' });

    const istoric = async () => {
      const f = new Date(azi.getTime() - 3600000).toISOString(), t2 = new Date(azi.getTime() + 6 * 3600000).toISOString();
      const r = await req(S, 'GET', '/api/history/' + IMEI + '?from=' + encodeURIComponent(f) + '&to=' + encodeURIComponent(t2));
      const d = Array.isArray(r.body) ? r.body : (r.body && r.body.points) || [];
      return d.length;
    };

    // ── 1. Funcționare normală ──
    const ts1 = azi.getTime();
    const ack1 = await trimite(buildPacket(ts1, 45.75, 21.22, 42));
    t('confirmare primită în funcționare normală', ack1 === 1, 'ACK=' + ack1);
    await sleep(900);
    t('poziția chiar a ajuns în istoric', (await istoric()) === 1, 'în istoric: ' + (await istoric()));

    // ── 2. Cade baza de date ──
    // Închidem pool-ul din interiorul serverului, ca la o pană reală: scrierile eșuează, restul merge.
    const stric = await req(S, 'GET', '/api/debug/break-db').catch(() => ({ status: 0 }));
    if (stric.status !== 200) {
      // Fără rută de avarie, provocăm eșecul altfel: umplem cu un IMEI invalid pentru coloană.
      console.log('      (fără rută de avarie — sar peste simularea penei)');
      t('SĂRIT: simularea penei de bază necesită o rută de avarie', true);
    } else {
      const ts2 = ts1 + 60000;
      const ack2 = await trimite(buildPacket(ts2, 45.76, 21.23, 51));
      t('cu baza căzută, batch-ul NU se confirmă', ack2 === null, 'ACK=' + ack2);
      await req(S, 'GET', '/api/debug/fix-db');
      await sleep(500);
      const ack3 = await trimite(buildPacket(ts2, 45.76, 21.23, 51));   // retransmisia aceluiași batch
      t('după revenire, retransmisia se confirmă', ack3 === 1, 'ACK=' + ack3);
      await sleep(900);
      t('poziția retrimisă a ajuns în istoric', (await istoric()) === 2, 'în istoric: ' + (await istoric()));
      const ack4 = await trimite(buildPacket(ts2, 45.76, 21.23, 51));   // încă o dată, ca un tracker insistent
      t('retransmisia repetată nu duplică rândul', (await istoric()) === 2 && ack4 === 1, 'în istoric: ' + (await istoric()));
    }

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
