// seed_traseu.js — injectează în sandbox un traseu realist pentru verificarea steagurilor:
// staționează în curte, PLEACĂ, merge, se OPREȘTE, apoi stă iar. Steagul verde trebuie să cadă pe
// plecare (nu pe primul punct al intervalului), iar cel roșu pe oprire (nu pe ultimul punct).
const net = require('net');
const TCP = Number(process.env.TCP_PORT || 5041);
const IMEI = process.env.IMEI || '860000000033301';

function buildPacket(ts, lat, lng, speed, angle, ignition) {
  const ones = [[239, ignition & 0xff]];
  const b1 = Buffer.concat([Buffer.from([ones.length])].concat(ones.map(([id, v]) => Buffer.from([id, v]))));
  const io = Buffer.concat([Buffer.from([0x00, ones.length]), b1, Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(lng * 1e7), 0); gps.writeInt32BE(Math.round(lat * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(angle, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(speed, 13);
  const rec = Buffer.concat([tsb, Buffer.from([0x01]), gps, io]);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), rec, Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
function send(pkt) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let step = 0;
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', () => { if (step === 0) { step = 1; s.write(pkt); } else { s.end(); resolve(true); } });
    s.on('error', () => resolve(false));
    setTimeout(() => { try { s.end(); } catch (e) {} resolve(false); }, 3000);
  });
}

(async () => {
  const azi = new Date(); azi.setHours(0, 0, 0, 0);
  const T = (h, m) => azi.getTime() + h * 3600000 + m * 60000;
  const pts = [];
  // 00:00 → 07:00 staționează în curte (viteză 0, contact oprit) — un punct la fiecare oră
  for (let h = 0; h <= 7; h++) pts.push([T(h, 0), 45.760, 21.260, 0, 0, 0]);
  // 07:12 PLECAREA — aici trebuie să cadă steagul verde
  let lat = 45.700, lng = 21.200;
  for (let k = 0; k < 26; k++) {
    lat -= 0.0026; lng += 0.0018;
    pts.push([T(9, 30 + k * 2), lat, lng, 40 + (k % 5) * 9, (58 + k * 4) % 360, 1]);
  }
  // 08:04 OPRIREA — aici trebuie să cadă steagul roșu
  const tStop = T(8, 4);
  pts.push([tStop, lat, lng, 0, 0, 1]);
  // 08:04 → 23:00 stă pe loc (contact oprit)
  for (let h = 9; h <= 23; h++) pts.push([T(h, 0), lat, lng, 0, 0, 0]);

  let ok = 0;
  for (const [ts, la, ln, sp, an, ig] of pts) if (await send(buildPacket(ts, la, ln, sp, an, ig))) ok++;
  console.log('IMEI ' + IMEI + ' — ' + ok + '/' + pts.length + ' poziții trimise');
  console.log('plecare așteptată 07:12 · oprire așteptată ' + new Date(tStop).toLocaleTimeString('ro-RO'));
})();
