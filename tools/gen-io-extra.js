// tools/gen-io-extra.js — generează io_names_extra.js din specul oficial Teltonika (fixture).
//
// De ce generat, nu scris de mână: lista FMC130 are 640 de parametri, iar Passat-ul cu ALL-CAN300
// poate trimite peste 200 dintre ei. O hartă scrisă de mână la scara asta SE VA desincroniza de spec
// (s-a și întâmplat: 29-38 au fost „ghicite" ca FMS și afișau RPM-ul drept temperatură). Generatorul
// pleacă din fixture-ul parsat de pe wiki.teltonika-gps.com și produce mereu același rezultat —
// îl rulezi din nou doar când actualizezi fixture-ul.
//
//   node tools/gen-io-extra.js        → scrie io_names_extra.js (în rădăcină)
//
// REGULĂ: harta scrisă de mână din codec8e.js are PRIORITATE. Aici intră doar ID-urile pe care ea
// nu le acoperă. Numele existente NU se schimbă — datele stocate în io_data depind de ele.
const fs = require('fs');
const path = require('path');

const spec = require('./fixtures/avl-fmc130.json');
const codec = require('../codec8e.js');

// ── Nume alese de noi pentru ID-urile des întâlnite (restul se derivă din numele oficial) ──────
// Motivul: „axis_x" e mai clar decât „axisx", iar `fuel_rate_gps` există DEJA ca așteptare în
// interfața web (IO_CATEGORIES → Combustibil) — numele trebuie să se potrivească cu ea.
const NUME_ALESE = {
  4: 'pulse_counter_din1', 5: 'pulse_counter_din2',
  13: 'fuel_rate_gps', 15: 'eco_score',
  17: 'axis_x', 18: 'axis_y', 19: 'axis_z',
  71: 'dallas_temp_id_4', 72: 'dallas_temp_1', 73: 'dallas_temp_2', 74: 'dallas_temp_3', 75: 'dallas_temp_4',
  76: 'dallas_temp_id_1', 77: 'dallas_temp_id_2', 79: 'dallas_temp_id_3',
  78: 'ibutton',
  116: 'charger_connected', 117: 'charging_current',
  215: 'lls_fuel_temp_5',
  236: 'alarm_event', 237: 'network_type', 238: 'user_id',
  263: 'bt_status', 264: 'barcode_id',
  303: 'instant_movement',
  327: 'ul202_fuel_level', 329: 'ain_speed', 483: 'ul202_sensor_status',
  380: 'digital_output_3', 381: 'ground_sense',
  403: 'driver_name', 404: 'driver_license_type', 405: 'driver_gender', 406: 'driver_card_id',
  407: 'driver_card_expiry', 408: 'driver_card_issue_place', 409: 'driver_status_event',
  636: 'umts_lte_cell_id', 637: 'wake_reason',
  // VIN-ul: oficial ID 325 pe ALL-CAN300 (17 octeti ASCII). Numele `can_vin` fusese luat de ID 217,
  // care in realitate e „Geofence zone 36" — corectat in codec8e, deci numele e liber pentru cel real.
  325: 'can_vin', 217: 'geofence_zone_36',
  // Containere de stegulețe P4 (ALL-CAN300) — decodate bit cu bit în codec8e (expandCanFlags).
  517: 'can_security_state_flags_p4',
  518: 'can_control_state_flags_p4',
  519: 'can_indicator_state_flags_p4',
  520: 'can_agricultural_state_flags_p4',
  521: 'can_utility_state_flags_p4',
  522: 'can_cistern_state_flags_p4',
  // Corectările 29-38: „fms_*" de aici era GHICIT și greșit — pe platforma FMB (FMC130) acestea
  // sunt oficial BLE Battery #1 (29) și elemente OBD (30-38). FMS-ul adevărat (FMC650) folosește
  // harta FMS_NAMES, activată prin can_interface='fms' — nu trece pe aici.
  29: 'ble_battery_1',
  30: 'obd_dtc_count', 31: 'obd_engine_load', 32: 'obd_coolant_temp', 33: 'obd_short_fuel_trim',
  37: 'obd_vehicle_speed', 38: 'obd_timing_advance',
};

// ID-uri pe care generatorul NU are voie să le atingă nici dacă specul le conține: numele curente
// sunt corecte și confirmate live (34/35/36 pe Dacia) sau aliasuri deliberate (85/88, 91-93).
const REZERVATE = new Set([34, 35, 36, 84, 85, 87, 88, 91, 92, 93, 120, 121, 122]);

function numeDinOficial(nume, grup) {
  let baza = String(nume).toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const g = String(grup || '');
  let prefix = '';
  if (/OBD OEM/i.test(g)) prefix = 'obd_oem_';
  else if (/OBD/i.test(g)) prefix = 'obd_';
  else if (/Bluetooth/i.test(g)) prefix = 'ble_';
  else if (/LVCAN|ALLCAN|CANCONTROL|CAN adapters/i.test(g)) prefix = 'can_';
  if (prefix && baza.startsWith(prefix)) prefix = '';
  // fără dublări gen can_can_
  return (prefix + baza).replace(/^(can_|obd_|ble_)\1+/, '$1');
}

// ATENȚIE: se citește harta scrisă DE MÂNĂ (numeDeMana), NU getIoName — acela include deja lista
// pe care tocmai o generăm, așa că a doua rulare ar crede că „tot e mapat" și ar produce un fișier
// aproape gol. Generatorul trebuie să dea ACELAȘI rezultat oricâte rulări la rând.
const folosite = new Set();          // nume deja luate (de harta de mână sau de un id anterior)
for (let id = 0; id <= 1300; id++) {
  const n = codec.numeDeMana(id, null);
  if (n) folosite.add(n);
}

const extra = {};
const dubluri = [];
for (const e of spec) {
  if (REZERVATE.has(e.id)) continue;
  const eNemapat = codec.numeDeMana(e.id, null) === null;
  const eCorectie = NUME_ALESE[e.id] !== undefined;
  if (!eNemapat && !eCorectie) continue;      // deja mapat de mână și fără corecție → nu-l atingem
  if (extra[e.id]) continue;                   // specul are dubluri de id între grupuri → primul câștigă

  let nume = NUME_ALESE[e.id] || numeDinOficial(e.nume, e.grup);
  if (folosite.has(nume) && !eCorectie) { dubluri.push({ id: e.id, nume }); nume = nume + '_' + e.id; }
  folosite.add(nume);

  const mult = parseFloat(e.mult);
  const semnat = /signed/i.test(e.tip) && !/unsigned/i.test(e.tip);
  const octeti = parseInt(e.octeti, 10);
  extra[e.id] = {
    name: nume,
    oficial: e.nume,
    ...(Number.isFinite(mult) && mult !== 1 ? { mult } : {}),
    ...(semnat ? { semnat: true } : {}),
    ...(Number.isFinite(octeti) ? { octeti } : {}),
    ...(/ascii/i.test(e.tip) ? { ascii: true } : {}),
    ...(e.unit && e.unit !== '-' ? { unit: e.unit } : {}),
    grup: e.grup.slice(0, 40),
  };
}

const rand = (id) => {
  const x = extra[id];
  const p = [`name: '${x.name}'`];
  if (x.mult !== undefined) p.push(`mult: ${x.mult}`);
  if (x.semnat) p.push(`semnat: true`);
  if (x.octeti !== undefined) p.push(`octeti: ${x.octeti}`);
  if (x.ascii) p.push(`ascii: true`);
  if (x.unit) p.push(`unit: ${JSON.stringify(x.unit)}`);
  return `  ${id}: { ${p.join(', ')} }, // ${x.oficial} [${x.grup}]`;
};

const ids = Object.keys(extra).map(Number).sort((a, b) => a - b);
const corp = ids.map(rand).join('\n');

const iesire = `// io_names_extra.js — GENERAT de tools/gen-io-extra.js din specul oficial Teltonika FMC130.
// NU edita de mână: rulează generatorul după ce actualizezi tools/fixtures/avl-fmc130.json.
// Harta scrisă de mână din codec8e.js are prioritate; aici e restul listei oficiale (${ids.length} ID-uri),
// ca un Passat cu ALL-CAN300 să nu mai apară cu zeci de „io_517" nedescifrate.
// Câmpuri: name (cheia din io_data) · mult (multiplicator afișare/conversie) · semnat (two's complement)
//          · octeti (lățimea valorii) · unit · comentariu = numele oficial + grupul din spec.
module.exports = {
${corp}
};
`;
fs.writeFileSync(path.join(__dirname, '..', 'io_names_extra.js'), iesire);
console.log('io_names_extra.js scris:', ids.length, 'ID-uri');
if (dubluri.length) console.log('nume care s-au ciocnit (sufixate cu id):', dubluri.length, JSON.stringify(dubluri.slice(0, 8)));
