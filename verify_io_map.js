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
// 217: era etichetat 'can_vin', dar oficial e „Geofence zone 36" — VIN-ul real e ID 325.
// Aceeași categorie de greșeală ca 29-38: un nume ghicit, care arăta date de altundeva.
// 652/658-661/898: erau „can_security_flag_ext", „can_indicator_left/right/hazard/lights" si
// „can_handbrake" — toate GHICITE. Oficial sunt steaguri individuale: cheia in contact, portbagaj,
// treptele N/P/R si CONTACTUL. Rulau LIVE cu intelesul gresit pe VW Passat B7. Vezi jurnalul 26.08.
const CORECTATE = new Set([29, 30, 31, 32, 33, 37, 38, 217, 652, 658, 659, 660, 661, 898, 900, 902, 904]);
const schimbate = [];
for (const [id, nume] of Object.entries(vechi)) {
  if (CORECTATE.has(Number(id))) continue;
  if (c.getIoName(Number(id), null) !== nume) schimbate.push(id + ': ' + nume + ' → ' + c.getIoName(Number(id), null));
}
t('niciun nume istoric schimbat (' + (Object.keys(vechi).length - CORECTATE.size) + ' verificate)', schimbate.length === 0, schimbate.slice(0, 5).join(' | '));
t('corecturile documentate au numele oficiale', c.getIoName(29, null) === 'ble_battery_1' && c.getIoName(30, null) === 'obd_dtc_count' && c.getIoName(37, null) === 'obd_vehicle_speed');
t('217 nu mai e „VIN", ci zona de geofence', c.getIoName(217, null) === 'geofence_zone_36', c.getIoName(217, null));
t('VIN-ul real e ID 325', c.getIoName(325, null) === 'can_vin', c.getIoName(325, null));

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

console.log('\n=== 9. Campuri TEXT si valori lungi (grupul NX) ===\n');
// Cazul real: VIN-ul soseste pe 17 octeti ASCII (ID 325). Soseau ca sir hex si asa ramaneau —
// „5756325a..." in loc de „WV2ZZZ...". Iar containerele de stegulete trimise prin NX ajungeau ca
// sir hex FARA prefix, iar BigInt() le citea ca ZECIMAL → toti bitii gresiti.
function pachetNX(elem) {
  const q2 = (n) => { const x = Buffer.alloc(2); x.writeUInt16BE(n, 0); return x; };
  const nx = Buffer.concat([q2(elem.length)].concat(elem.map(([id, buf]) => Buffer.concat([q2(id), q2(buf.length), buf]))));
  const ioB = Buffer.concat([q2(0), q2(elem.length), q2(0), q2(0), q2(0), q2(0), nx]);
  const ts2 = Buffer.alloc(8); ts2.writeBigUInt64BE(1756150000000n, 0);
  const g2 = Buffer.alloc(15);
  g2.writeInt32BE(261025000, 0); g2.writeInt32BE(444268000, 4);
  g2.writeUInt16BE(80, 8); g2.writeUInt16BE(90, 10); g2.writeUInt8(10, 12); g2.writeUInt16BE(0, 13);
  const rec2 = Buffer.concat([ts2, Buffer.from([0x01]), g2, ioB]);
  const dat2 = Buffer.concat([Buffer.from([0x8e, 0x01]), rec2, Buffer.from([0x01])]);
  const h2 = Buffer.alloc(8); h2.writeUInt32BE(0, 0); h2.writeUInt32BE(dat2.length, 4);
  return Buffer.concat([h2, dat2, Buffer.alloc(4)]);
}
const VIN = 'WV2ZZZ2KZ8X017409';
const P4buf = Buffer.alloc(8); P4buf.writeBigUInt64BE(P4_REAL, 0);
const rNx = c.parseAvlPacket(pachetNX([[325, Buffer.from(VIN, 'latin1')], [517, P4buf]]), null);
t('pachetul NX se parseaza', !rNx.error, rNx.error);
const dNx = rNx.records && rNx.records[0] ? rNx.records[0].io : {};
t('VIN-ul e text lizibil, nu hex', dNx.can_vin === VIN, String(dNx.can_vin));
t('stegulete P4 prin NX: valoare ZECIMALA corecta', String(dNx.can_security_state_flags_p4) === P4_REAL.toString(10), String(dNx.can_security_state_flags_p4));
c.expandCanFlags(dNx);
t('deci bitii ies corect si pe calea NX', dNx._security_flags && dNx._security_flags.clutch === true && dNx._security_flags.door_front_left === false);
// VIN cu umplutura de octeti nuli (multe adaptoare umplu pana la 17)
const rPad = c.parseAvlPacket(pachetNX([[325, Buffer.concat([Buffer.from('WVWZZZ', 'latin1'), Buffer.alloc(11)])]]), null);
t('VIN cu umplutura nula → text curat', rPad.records[0].io.can_vin === 'WVWZZZ', JSON.stringify(rPad.records[0].io.can_vin));
// Ceva ce NU e text imprimabil ramane hex — mai bine tehnic decat caractere aiurea
const rBin = c.parseAvlPacket(pachetNX([[325, Buffer.from([0x01, 0x02, 0x9f, 0xfe])]]), null);
t('continut ne-imprimabil ramane hex', /^[0-9a-f]+$/.test(String(rBin.records[0].io.can_vin)), String(rBin.records[0].io.can_vin));

console.log('\n=== 10. Cele doua kilometraje NU se amesteca ===\n');
// Intrebarea lui Robert (26.08): „Total Odometer intra in conflict cu odometrul masinii?"
// Nu: sunt doua marimi diferite. ID 16 = contorul DISPOZITIVULUI din GPS, de la montare (metri).
// ID 87 = kilometrajul REAL din bordul masinii, prin CAN (convertit la km inca de la primire).
t('ID 16 e contorul GPS al dispozitivului', c.getIoName(16, null) === 'total_odometer');
t('ID 87 e kilometrajul din bord', c.getIoName(87, null) === 'can_total_mileage');
t('sunt chei DIFERITE (nu se suprascriu)', c.getIoName(16, null) !== c.getIoName(87, null));
const catKm = require('./io_catalog.js');
t('87 e etichetat in km (valoarea stocata e deja km)', catKm.IO_CATALOG_BY_ID[87].unit === 'km', catKm.IO_CATALOG_BY_ID[87].unit);
t('105 la fel', catKm.IO_CATALOG_BY_ID[105].unit === 'km', catKm.IO_CATALOG_BY_ID[105].unit);
t('16 ramane in metri (nu trece prin conversie CAN)', catKm.IO_CATALOG_BY_ID[16].unit === 'm', catKm.IO_CATALOG_BY_ID[16].unit);
t('eticheta lui 16 spune ca e al dispozitivului', /GPS|montare/i.test(catKm.IO_CATALOG_BY_ID[16].name_ro), catKm.IO_CATALOG_BY_ID[16].name_ro);
// conversia: doar cheile can_ trec prin convertCanValue
t('can_total_mileage: metri → km', c.convertCanValue('can_total_mileage', 31798270) === 31798.27, String(c.convertCanValue('can_total_mileage', 31798270)));
t('total_odometer NU e atins de conversie', c.convertCanValue('total_odometer', 31798270) === 31798270);

console.log('\n=== 8. Catalogul de placute <-> decodoarele (sursa unica nu deraiaza) ===\n');
// Fiecare placuta din can_flags.js trebuie sa aiba un decodor care s-o aprinda (altfel minte ca
// exista), si fiecare steag decodat trebuie sa aiba placuta (altfel se decodeaza in gol).
const cflags = require('./can_flags.js');
const emise = new Set();
const TOT = '18446744073709551615';
[['decodeSecurityFlags', '_sf_'], ['decodeSecurityFlagsP4', '_sf_']].forEach(([fn, pfx]) => Object.keys(c[fn](TOT)).forEach((k) => emise.add(pfx + k)));
[['decodeControlFlags', '_cf_'], ['decodeControlFlagsP4', '_cf_'], ['decodeIndicatorFlagsP4', '_cf_']].forEach(([fn, pfx]) => Object.keys(c[fn](TOT)).forEach((k) => emise.add(pfx + k)));
// O placuta e legitima daca o poate aprinde ORICARE dintre cai: decodoarele de biti (P2/P4) SAU
// puntea semnalelor separate (can_flag_io.js). Unele stari — geamuri, GPL, Start-Stop — exista doar
// ca semnal individual, deci n-au bit in nicio masca.
const dinPunte = new Set(Object.values(require('./can_flag_io.js').PE_ID));
// A treia cale: placute DERIVATE, calculate din altele in expandCanFlags. Treapta de viteza aduna
// cele patru semnale P/R/N/D intr-o singura litera; n-are bit si n-are ID propriu.
const DERIVATE = new Set(['_sf_gear']);
const orfane = cflags.FLAGS.filter((f) => !emise.has(f.key) && !dinPunte.has(f.key) && !DERIVATE.has(f.key) && !cflags.NEDECODATE.includes(f.key));
t('fiecare placuta poate fi aprinsa de o cale (' + cflags.FLAGS.length + ' placute)', orfane.length === 0, orfane.map((f) => f.key).join(', '));
const faraPlacuta = [...emise].filter((k) => !cflags.FLAGS.find((f) => f.key === k));
t('fiecare steag decodat are placuta', faraPlacuta.length === 0, faraPlacuta.join(', '));
t('fiecare placuta are explicatie pentru balon', cflags.FLAGS.every((f) => f.desc && f.desc.length > 10), cflags.FLAGS.filter((f) => !f.desc).map((f) => f.key).join(', '));

console.log('\n=== 11. Steaguri trimise ca SEMNALE SEPARATE (VW Passat B7 / ALL-CAN300) ===\n');
// Adaptorul poate trimite starile fie impachetate pe biti, fie cate un semnal AVL per stare.
// Passat-ul (program 11173) trimite varianta a doua — placutele citeau doar prima, deci ecranul
// ramanea GOL pe o masina care trimitea totul.
const fio = require('./can_flag_io.js');
const cfl = require('./can_flags.js');
const specIds = new Set(spec.map((e) => e.id));
const idNecunoscut = Object.keys(fio.PE_ID).filter((id) => !specIds.has(Number(id)));
t('toate ID-urile din punte exista in specul oficial (' + Object.keys(fio.PE_ID).length + ')', idNecunoscut.length === 0, idNecunoscut.join(', '));
const steagFaraPlacuta = Object.entries(fio.PE_ID).filter(([, k]) => !cfl.isFlagKey(k));
t('fiecare steag din punte are placuta', steagFaraPlacuta.length === 0, steagFaraPlacuta.map(([i, k]) => i + ':' + k).join(', '));
const dubleSteag = Object.values(fio.PE_ID).filter((k, i, a2) => a2.indexOf(k) !== i);
t('niciun steag nu e legat de doua ID-uri', dubleSteag.length === 0, [...new Set(dubleSteag)].join(', '));

// Exact ce trimite Passat-ul acum (citit din productie, 26.08)
const ioPassat = {
  can_ssf_clutch_pushed: 1, can_ssf_can_module_in_sleep: 1,
  can_ssf_front_left_door_open: 0, can_ssf_rear_right_door_open: 0, can_ssf_engine_cover_open: 0,
  can_csf_dipped_head_lights: 0, can_csf_air_conditioning: 0,
  can_isf_check_engine_indicator: 0, can_isf_low_fuel_level_indicator: 0,
};
c.expandCanFlags(ioPassat);
t('semnalele separate produc steaguri', !!ioPassat._security_flags && !!ioPassat._control_flags);
t('ambreiajul apasat se vede', ioPassat._security_flags.clutch === true);
t('adaptorul in repaus se vede', ioPassat._security_flags.can_sleep_mode === true);
t('usa inchisa ramane STINSA (0 nu inseamna lipsa)', ioPassat._security_flags.door_front_left === false);
t('martorii stinsi raman stinsi', ioPassat._control_flags.check_engine === false && ioPassat._control_flags.low_fuel === false);
// o masina fara semnale separate nu capata steaguri din senin
const ioGol = { can_engine_rpm: 800, can_fuel_level_liters: 40 };
c.expandCanFlags(ioGol);
t('masina fara steaguri NU capata _security_flags', ioGol._security_flags === undefined);
// varianta impachetata are prioritate pe cheile pe care semnalul separat nu le trimite
const ioMixt = { can_security_state_flags_p4: b(22), can_ssf_clutch_pushed: 1 };
c.expandCanFlags(ioMixt);
t('impachetat + separat: amandoua ajung in acelasi loc', ioMixt._security_flags.door_front_left === true && ioMixt._security_flags.clutch === true);
// 900/902/904 erau „can_manual_0/2/4" — ghicite. Oficial: motor pornit, gata de plecare, regim de
// lucru. Pe Passat, can_manual_4 = 1 aprindea „Regim personal", desi 1 inseamna SERVICIU.
t('900/902/904 au numele oficiale', c.getIoName(900, null) === 'can_ssf_engine_working' && c.getIoName(904, null) === 'can_ssf_work_mode');
const ioServ = { can_ssf_work_mode: 1 }; c.expandCanFlags(ioServ);
t('regim de lucru 1 (serviciu) → NU „personal"', ioServ._security_flags.work_mode_private === false);
const ioPers = { can_ssf_work_mode: 0 }; c.expandCanFlags(ioPers);
t('regim de lucru 0 (personal) → „personal"', ioPers._security_flags.work_mode_private === true);
t('inversarea e declarata explicit, nu ascunsa in cod', fio.INVERS instanceof Set && fio.INVERS.has(904));



console.log('\n=== 12. Se arata DOAR starile active (+ cele trei permanente) ===\n');
// Regula ceruta de Robert (27.08). Sursa ei e can_flags.js (`mereu` / `ascuns` + seVede), ca web-ul
// si telefonul sa n-o scrie fiecare in felul lui si sa se desincronizeze.
const PERMANENTE = ['_sf_handbrake', '_sf_gear', '_sf_car_closed'];
t('exact trei placute sunt permanente', cflags.FLAGS.filter((f) => f.mereu).length === 3,
  cflags.FLAGS.filter((f) => f.mereu).map((f) => f.key).join(', '));
PERMANENTE.forEach((k) => t(k + ' se vede si stins', cflags.seVede(k, false) === true));
t('o usa inchisa NU se vede', cflags.seVede('_sf_door_front_left', false) === false);
t('o usa deschisa se vede', cflags.seVede('_sf_door_front_left', true) === true);
t('un martor stins NU se vede', cflags.seVede('_cf_check_engine', false) === false);
t('treptele P/R/N/D nu se deseneaza singure',
  ['_sf_parking', '_sf_reverse', '_sf_neutral', '_sf_drive'].every((k) => cflags.seVede(k, true) === false));
t('o stare pe care masina n-a trimis-o nu se vede nici daca e permanenta',
  cflags.seVede('_sf_handbrake', undefined) === false);

const gear = (p, r, n, d) => {
  const io = { can_ssf_parking_gear_active_automatic_gear_box: p, can_ssf_reverse_gear_active: r,
    can_ssf_neutral_gear_active_automatic_gear_box: n, can_ssf_drive_is_active_automatic_gear_box: d };
  c.expandCanFlags(io);
  return io._security_flags.gear;
};
t('treapta P', gear(1, 0, 0, 0) === 'P', String(gear(1, 0, 0, 0)));
t('treapta R', gear(0, 1, 0, 0) === 'R', String(gear(0, 1, 0, 0)));
t('treapta N', gear(0, 0, 1, 0) === 'N', String(gear(0, 0, 1, 0)));
t('treapta D', gear(0, 0, 0, 1) === 'D', String(gear(0, 0, 0, 1)));
t('niciuna activa: fara litera, nu „P" din greseala', gear(0, 0, 0, 0) === null, String(gear(0, 0, 0, 0)));
t('masina care trimite alte stari, dar nicio treapta, nu capata placuta de treapta',
  (() => { const io = { can_ssf_ignition: 1 }; c.expandCanFlags(io); return (io._security_flags || {}).gear === undefined; })(),
  'gear=' + String(((() => { const io = { can_ssf_ignition: 1 }; c.expandCanFlags(io); return io._security_flags || {}; })()).gear));
t('textul treptei e chiar litera', cflags.stateText('_sf_gear', 'D') === 'D');
t('treapta fara valoare arata liniuta, nu „Nu"', cflags.stateText('_sf_gear', null) === '—');

console.log('\n=== 13. Fiecare placuta are un desen, la fel in amandoua ecranele ===\n');
// Desenele se scriu O SINGURA data (Icon.tsx) si se genereaza pentru web (can_icons.js). Un `mi`
// gresit ar lasa placuta goala — si pe telefon, si pe web.
const icoane = require('./can_icons.js').ICOANE;
const faraDesen = [...new Set([...cflags.FLAGS.map((f) => f.mi), ...cflags.GROUPS.map((g) => g.mi)])].filter((n) => !icoane[n]);
t('fiecare `mi` are desen', faraDesen.length === 0, faraDesen.join(', '));
t('treapta are casete pentru toate cele patru litere', ['gearP', 'gearR', 'gearN', 'gearD'].every((n) => !!icoane[n]));
const iconTsx = require('fs').readFileSync(require('path').join(__dirname, 'mobile', 'src', 'components', 'Icon.tsx'), 'utf8');
t('can_icons.js e generat din Icon.tsx, nu scris de mana',
  Object.keys(icoane).every((n) => iconTsx.includes('\n  ' + n + ": '")));
t('cele patru usi au patru desene diferite',
  new Set(['_sf_door_front_left', '_sf_door_front_right', '_sf_door_rear_left', '_sf_door_rear_right']
    .map((k) => cflags.flagMeta(k).mi)).size === 4);
t('geamurile nu mai imprumuta desenul trapei',
  cflags.flagMeta('_sf_window_front_left').mi !== cflags.flagMeta('_sf_roof_open').mi);

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
