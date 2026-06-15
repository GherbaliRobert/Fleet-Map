// test_codec8e.js — unit tests pentru parserul Teltonika Codec 8 (fără server/rețea).
// Acoperă: getIoName (standard/fms/tacho), convertCanValue, parseAvlPacket (pachet construit byte-cu-byte),
// decodeSecurityFlags, decodeControlFlags.
const c = require('./codec8e.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, msg) { ok(Math.abs(a - b) < 1e-4, msg + ' (got ' + a + ', want ~' + b + ')'); }

console.log('\n— getIoName: mapări per interfață —');
eq(c.getIoName(239), 'ignition', 'id 239 = ignition');
eq(c.getIoName(88), 'can_engine_rpm', 'id 88 standard = can_engine_rpm (alias truck)');
eq(c.getIoName(88, 'fms'), 'can_engine_rpm', 'id 88 fms = can_engine_rpm');
eq(c.getIoName(88, 'tacho'), 'can_engine_rpm', 'id 88 tacho = can_engine_rpm');
eq(c.getIoName(192), 'can_distance_to_service', 'id 192 standard = can_distance_to_service (LV-CAN)');
eq(c.getIoName(192, 'tacho'), 'tacho_total_vehicle_distance', 'id 192 tacho = tacho_total_vehicle_distance');
eq(c.getIoName(187, 'tacho'), 'tacho_driver1_working_state', 'id 187 tacho = driver1 working state');
eq(c.getIoName(143, 'fms'), 'can_door_status', 'id 143 fms = can_door_status');
eq(c.getIoName(91), 'can_axle3_load', 'id 91 standard = can_axle3_load (alias)');
eq(c.getIoName(99999), 'io_99999', 'id necunoscut = io_<id>');

console.log('\n— convertCanValue: scalări —');
near(c.convertCanValue('can_fuel_level_liters', 1234), 123.4, 'fuel liters /10');
near(c.convertCanValue('can_total_mileage', 1500000), 1500, 'mileage m→km /1000');
near(c.convertCanValue('can_fuel_rate', 105), 10.5, 'fuel rate /10');
near(c.convertCanValue('can_engine_temp', 905), 90.5, 'engine temp /10 pozitiv');
near(c.convertCanValue('can_engine_temp', 65436), -10, 'engine temp /10 negativ (signed)');

console.log('\n— parseAvlPacket: pachet Codec 8 cu 1 record + 3 IO —');
(function () {
  // Construiesc un pachet Codec 8 (non-extended) valid byte-cu-byte.
  const io = Buffer.concat([
    Buffer.from([0x00]),                 // eventIoId
    Buffer.from([0x03]),                 // totalCount = 3
    Buffer.from([0x02]),                 // N1 (1-byte) = 2
    Buffer.from([239, 1]),               // ignition = 1
    Buffer.from([24, 50]),               // speed_io = 50
    Buffer.from([0x01]),                 // N2 (2-byte) = 1
    (() => { const b = Buffer.alloc(3); b.writeUInt8(66, 0); b.writeUInt16BE(12500, 1); return b; })(), // external_voltage
    Buffer.from([0x00]),                 // N4 = 0
    Buffer.from([0x00]),                 // N8 = 0
  ]);
  const ts = Buffer.alloc(8); ts.writeBigUInt64BE(1749974400000n, 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(261025000, 0);        // longitude 26.1025
  gps.writeInt32BE(444268000, 4);        // latitude 44.4268
  gps.writeUInt16BE(80, 8);              // altitude
  gps.writeUInt16BE(90, 10);             // angle
  gps.writeUInt8(10, 12);                // satellites
  gps.writeUInt16BE(50, 13);             // speed
  const record = Buffer.concat([ts, Buffer.from([0x01]), gps, io]);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), record, Buffer.from([0x01])]); // codec, count, record, count
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  const pkt = Buffer.concat([head, data, Buffer.alloc(4)]); // + CRC dummy

  const r = c.parseAvlPacket(pkt);
  ok(!r.error, 'parsare fără eroare' + (r.error ? ' [' + r.error + ']' : ''));
  eq(r.numberOfRecords, 1, 'numberOfRecords = 1');
  if (r.records && r.records[0]) {
    near(r.records[0].gps.latitude, 44.4268, 'latitude');
    near(r.records[0].gps.longitude, 26.1025, 'longitude');
    eq(r.records[0].gps.speed, 50, 'speed');
    eq(r.records[0].io.ignition, 1, 'io.ignition');
    eq(r.records[0].io.speed_io, 50, 'io.speed_io');
    eq(r.records[0].io.external_voltage, 12500, 'io.external_voltage');
  } else { fail++; console.log('  FAIL records[0] lipsește'); }
})();

console.log('\n— parseAvlPacket: erori —');
(function () {
  const bad = Buffer.alloc(12); bad.writeUInt32BE(0x12345678, 0); // preamble invalid
  const r = c.parseAvlPacket(bad);
  ok(r.error && /preamble/i.test(r.error), 'preamble invalid → eroare');
})();

console.log('\n— decodeSecurityFlags / decodeControlFlags —');
ok(typeof c.decodeSecurityFlags(0n) === 'object', 'decodeSecurityFlags(0) → obiect');
ok(typeof c.decodeControlFlags(0) === 'object', 'decodeControlFlags(0) → obiect');

console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
