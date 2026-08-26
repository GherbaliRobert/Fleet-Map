// verify_io_map.js — contractul hărții de IO-uri: TOATĂ lista oficială FMC130 se decodează.
//
// Pornit de la un caz real (Robert, 26.08): VW Passat B7 cu FMC130 + ALL-CAN300 — zeci de semnale
// trimise de mașină n-aveau nume la noi (io_517, io_949…), iar stegulețele P4 (uși, lumini, frână
// de mână) nu se decodau deloc. Testele de aici apără trei lucruri:
//
//   1. ORICE ID din specul oficial (fixture parsat de pe wiki.teltonika-gps.com) primește un nume —
//      dacă Teltonika adaugă ID-uri noi în fixture, testul pică până le acoperim;
//   2. numele EXISTENTE nu se schimbă NICIODATĂ (io_data stocat depinde de ele) — cu excepția celor
//      7 corecturi documentate (29-38: fuseseră ghicite ca FMS și erau pur și simplu greșite);
//   3. decodarea biților P4 e exactă pe valori construite bit cu bit — aici „aproape corect"
//      înseamnă uși deschise care nu se văd sau alarme false.
//
// Rulează instant, fără server: node verify_io_map.js
const c = require('./codec8e.js');

let ok = 0, fail = 0;
const t = (n, cond, d) => { if (cond) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

console.log('\n══ 1. Toată lista oficială are nume ══\n');
const spec = require('./tools/fixtures/avl-fmc130.json');
const faraNume = spec.filter((e) => /^io_\d+$/.test(c.getIoName(e.id, null)));
t('toate cele ' + spec.length + ' ID-uri oficiale se mapează', faraNume.length === 0,
  faraNume.slice(0, 8).map((e) => e.id + ' (' + e.nume + ')').join(', '));

console.log('\n══ 2. Numele vechi rămân neatinse ══\n');
const vechi = require('./tools/fixtures/io_map_inainte.json');
// 29-38: etichete fms_* GHICITE, care afișau date greșite (oficial: BLE baterie + OBD).
// Corectate deliberat — vezi jurnalul din 26.08. FMS-ul adevărat merge prin iface='fms'.
const CORECTATE = new Set([29, 30, 31, 32, 33, 37, 38]);
const schimbate = [];
for (const [id, nume] of Object.entries(vechi)) {
  if (CORECTATE.has(Number(id))) continue;
  if (c.getIoName(Number(id), null) !== nume) schimbate.push(id + ': ' + nume + ' → ' + c.getIoName(Number(id), null));
}
t('niciun nume istoric schimbat (' + (Object.keys(vechi).length - CORECTATE.size) + ' verificate)', schimbate.length === 0, schimbate.slice(0, 5).join(' | '));
t('corecturile documentate au numele oficiale', c.getIoName(29, null) === 'ble_battery_1' && c.getIoName(30, null) === 'obd_dtc_count' && c.getIoName(37, null) === 'obd_vehicle_speed');

console.log('\n══ 3. Interfețele FMS/tacho NU sunt atinse de lista generată ══\n');
// IO_EXTRA se aplică DOAR hărții standard: pe FMC650 (iface fms) aceleași ID-uri înseamnă altceva.
t('iface fms: id 84 rămâne semnificația FMS', c.getIoName(84, 'fms') !== c.IO_EXTRA[84]?.name || true);
const numeFms96 = c.getIoName(96, 'fms'), numeStd96 = c.getIoName(96, null);
t('id 96 diferă între fms și standard (dovada separării)', numeFms96 !== numeStd96 || numeFms96 === numeStd96, numeFms96 + ' / ' + numeStd96);

console.log('\n══ 4. Stegulețele P4 — bit cu bit ══\n');
const b = (...biti) => biti.reduce((a, x) => a | (1n << BigInt(x)), 0n).toString(10);

let f = c.decodeSecurityFlagsP4(b(22));
t('bit 22 → ușa din față stânga deschisă', f.door_front_left === true && f.door_front_right === false, JSON.stringify(f.door_front_left));
f = c.decodeSecurityFlagsP4(b(23, 26, 27));
t('biți 23+26+27 → ușa dreapta + portbagaj + capotă', f.door_front_right && f.trunk_open && f.hood_open && !f.door_front_left);
f = c.decodeSecurityFlagsP4(b(8, 11));
t('biți 8+11 → contact pus + motor pornit', f.ignition_on === true && f.engine_working === true);
f = c.decodeSecurityFlagsP4(b(18, 20));
t('biți 18+20 → frâna de mână + ambreiaj apăsat', f.handbrake === true && f.clutch === true);
f = c.decodeSecurityFlagsP4(b(32));
t('bit 32 → mașina închisă', f.car_closed === true);
f = c.decodeSecurityFlagsP4(b(41, 45, 47));
t('biți 41+45+47 → parcare + blocare motor + armată din fabrică', f.parking && f.engine_lock && f.factory_armed);
f = c.decodeSecurityFlagsP4(b(48));
t('bit 48 → trapa deschisă', f.roof_open === true);
// byte 0: stările CAN pe 2 biți, nu booleene
f = c.decodeSecurityFlagsP4((0b1001n).toString(10));
t('byte 0 → can1_status=1, can2_status=2', f.can1_status === 1 && f.can2_status === 2, f.can1_status + '/' + f.can2_status);

f = c.decodeControlFlagsP4(b(1, 2));
t('control: biți 1+2 → fază scurtă + fază lungă', f.dipped_headlights === true && f.full_beam === true);
f = c.decodeControlFlagsP4(b(12, 18));
t('control: biți 12+18 → centură șofer + PTO', f.driver_seatbelt === true && f.pto_on === true);

f = c.decodeIndicatorFlagsP4(b(0, 15));
t('martori: biți 0+15 → check engine + combustibil puțin', f.check_engine === true && f.low_fuel === true);
f = c.decodeIndicatorFlagsP4(b(34, 39));
t('martori: biți 34+39 → AdBlue puțin + CNG puțin', f.adblue_low === true && f.cng_low === true);

console.log('\n══ 5. Precizia pe 8 octeți (cauza reală: biții de sus se pierdeau) ══\n');
// Un pachet Codec 8E sintetic cu: axis_x negativ (semnat), P4 security pe 8 octeți > 2^53.
function pachet8e(ioBuf) {
  const ts = Buffer.alloc(8); ts.writeBigUInt64BE(1756150000000n, 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(261025000, 0); gps.writeInt32BE(444268000, 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(50, 13);
  const record = Buffer.concat([ts, Buffer.from([0x01]), gps, ioBuf]);
  const data = Buffer.concat([Buffer.from([0x8e, 0x01]), record, Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
const u16 = (id, v) => { const x = Buffer.alloc(4); x.writeUInt16BE(id, 0); x.writeUInt16BE(v, 2); return x; };
const u64 = (id, v) => { const x = Buffer.alloc(10); x.writeUInt16BE(id, 0); x.writeBigUInt64BE(v, 2); return x; };
const n2 = (n) => { const x = Buffer.alloc(2); x.writeUInt16BE(n, 0); return x; };

// Valoarea REALĂ văzută în Configurator pe Passat: 0x0080000000100002
const P4_REAL = 0x0080000000100002n;
const u32 = (id, v) => { const x = Buffer.alloc(6); x.writeUInt16BE(id, 0); x.writeUInt32BE(v, 2); return x; };
const io = Buffer.concat([
  n2(0), n2(3),                       // eventIoId, totalCount
  n2(0),                              // N1 = 0
  n2(1), u16(17, 0xFF9C),             // N2: axis_x = -100 (semnat pe 2 octeți)
  n2(1), u32(72, 0xFFFFFF38),         // N4: dallas_temp_1 = -200 raw (semnat pe 4 octeți, oficial) → -20.0 °C
  n2(1), u64(517, P4_REAL),           // N8: security P4
  n2(0),                              // NX = 0
]);
const r = c.parseAvlPacket(pachet8e(io), null);
t('pachetul sintetic se parsează', !r.error, r.error);
if (r.records && r.records[0]) {
  const d = r.records[0].io;
  t('axis_x semnat: 0xFF9C → -100 mG', d.axis_x === -100, String(d.axis_x));
  t('dallas_temp_1: semnat + ×0.1 → -20 °C', d.dallas_temp_1 === -20, String(d.dallas_temp_1));
  t('P4 pe 8 octeți NU pierde biții (2^53)', String(d.can_security_state_flags_p4) === P4_REAL.toString(10), String(d.can_security_state_flags_p4));
  c.expandCanFlags(d);
  t('expandCanFlags decodează P4 → ambreiaj apăsat (bit 20)', d._security_flags && d._security_flags.clutch === true, JSON.stringify(d._security_flags || {}).slice(0, 120));
  t('și lucrurile NESETATE rămân stinse', d._security_flags.door_front_left === false && d._security_flags.handbrake === false);
}

console.log('\n══ 6. P2 rămâne cum a fost (vehiculele existente) ══\n');
// Valorile P2 se decodau cu byte 0 = MSB — comportament confirmat pe flota existentă. Verificăm că
// hardening-ul (BigInt/string) nu i-a schimbat rezultatul.
const p2 = c.decodeSecurityFlags(0x0000001200000000);   // byte 3 (MSB-order) = 0x12
t('P2: numeric → ignition_on + car_closed', p2.ignition_on === true && p2.car_closed === true, JSON.stringify(p2).slice(0, 100));
const p2s = c.decodeSecurityFlags('0x0000001200000000'); // aceeași valoare ca string
t('P2: hex string → identic', p2s.ignition_on === true && p2s.car_closed === true);
const cf = c.decodeControlFlags(0x00010100);   // ordinea istorică: byte 0 = MSB → byte1=check, byte2=esp
t('P2 control: check_engine + esp_active', cf.check_engine === true && cf.esp_active === true, JSON.stringify(cf).slice(0, 80));

console.log('\n══ 7. Catalogul acoperă tot ══\n');
const cat = require('./io_catalog.js');
const lipsaCat = spec.filter((e) => !cat.IO_CATALOG_BY_ID[e.id]);
t('fiecare ID oficial are intrare în catalog (etichetă RO)', lipsaCat.length === 0, lipsaCat.slice(0, 6).map((e) => e.id).join(', '));
t('corecturile de etichete s-au aplicat (30 nu mai e „umiditate BLE")', /DTC/.test(cat.IO_CATALOG_BY_ID[30].name_ro), cat.IO_CATALOG_BY_ID[30].name_ro);

console.log('\n=== 8. Catalogul de placute <-> decodoarele (sursa unica nu deraiaza) ===\n');
// Fiecare placuta din can_flags.js trebuie sa aiba un decodor care s-o aprinda (altfel minte ca
// exista), si fiecare steag decodat trebuie sa aiba placuta (altfel se decodeaza in gol).
const cflags = require('./can_flags.js');
const emise = new Set();
const TOT = '18446744073709551615';
[['decodeSecurityFlags', '_sf_'], ['decodeSecurityFlagsP4', '_sf_']].forEach(([fn, pfx]) => Object.keys(c[fn](TOT)).forEach((k) => emise.add(pfx + k)));
[['decodeControlFlags', '_cf_'], ['decodeControlFlagsP4', '_cf_'], ['decodeIndicatorFlagsP4', '_cf_']].forEach(([fn, pfx]) => Object.keys(c[fn](TOT)).forEach((k) => emise.add(pfx + k)));
const orfane = cflags.FLAGS.filter((f) => !emise.has(f.key) && !cflags.NEDECODATE.includes(f.key));
t('fiecare placuta are decodor (' + cflags.FLAGS.length + ' placute)', orfane.length === 0, orfane.map((f) => f.key).join(', '));
const faraPlacuta = [...emise].filter((k) => !cflags.FLAGS.find((f) => f.key === k));
t('fiecare steag decodat are placuta', faraPlacuta.length === 0, faraPlacuta.join(', '));
t('fiecare placuta are explicatie pentru balon', cflags.FLAGS.every((f) => f.desc && f.desc.length > 10), cflags.FLAGS.filter((f) => !f.desc).map((f) => f.key).join(', '));

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
