// can_flags.js — steagurile CAN, cu nume pe românește și iconiță. SURSĂ UNICĂ.
//
// De ce există: aceleași steaguri (uși, lumini, martori de bord) erau scrise în trei feluri —
// în panoul CAN din web ca liste de chei, în aplicația de telefon ca text brut („security_flags.
// door_front_left"), iar unele deloc. Aici stau o dată, cu numele și desenul lor, iar cele două
// ecrane le citesc de aici: web prin `/js/can-flags.js` (→ `window.RA_CANFLAGS`), telefonul prin
// `GET /api/can-flags`. NU rescrie liste paralele de etichete în index.html sau în mobile.
//
// Cheile sunt cele produse de codec8e.js: `_sf_*` din Security State Flags (ID 132) și `_cf_*` din
// Control State Flags (ID 123). Ordinea din fiecare grup e cea în care le citește un om, nu cea a
// biților.
//
// Câmpuri:
//   key    — cheia aplatizată din IO (`_sf_…` / `_cf_…`)
//   label  — numele afișat
//   icon   — Font Awesome 6.5.1 FREE-solid (web). Verificat: nu folosi iconițe PRO, nu apar.
//   mi     — numele iconiței din mobile/src/components/Icon.tsx (SVG inline, stil Feather)
//   group  — grupul din GROUPS
//   kind   — CE ÎNSEAMNĂ aprins:
//              'warn' — martor de bord: aprins = ceva e în neregulă (roșu)
//              'open' — deschis/nesigur: ușă, capotă (portocaliu)
//              'on'   — pornit, normal: lumini, contact, aer condiționat (verde)
//              'info' — stare, fără judecată de valoare (neutru)
//              'code' — nu e pornit/oprit, e un cod numeric; se afișează ca atare
//   st     — [text aprins, text stins]; DOAR când textul implicit al lui `kind` nu se acordă
//            gramatical („Faza scurtă — Pornit" ar fi greșit → ['Pornită','Oprită']).

const GROUPS = [
  { key: 'motor',    label: 'Contact și motor',     icon: 'fa-key',                mi: 'key' },
  { key: 'transm',   label: 'Frâne și transmisie',  icon: 'fa-gears',              mi: 'gears' },
  { key: 'usi',      label: 'Uși și capace',        icon: 'fa-door-open',          mi: 'doorOpen' },
  { key: 'inchid',   label: 'Închidere și alarmă',  icon: 'fa-lock',               mi: 'lock' },
  { key: 'lumini',   label: 'Lumini',               icon: 'fa-lightbulb',          mi: 'bulb' },
  { key: 'martori',  label: 'Martori de bord',      icon: 'fa-triangle-exclamation', mi: 'alert' },
  { key: 'confort',  label: 'Confort și siguranță', icon: 'fa-user-shield',        mi: 'shield' },
  { key: 'camion',   label: 'Camion',               icon: 'fa-truck',              mi: 'truck' },
  { key: 'electric', label: 'Electric',             icon: 'fa-bolt',               mi: 'zap' },
  { key: 'stare',    label: 'Starea adaptorului',   icon: 'fa-plug-circle-check',  mi: 'plug' },
];

// Textele implicite pentru fiecare `kind` (masculin singular). Se suprascriu cu `st`.
const KIND_TEXT = {
  warn: ['Aprins', 'Stins'],
  open: ['Deschis', 'Închis'],
  on:   ['Pornit', 'Oprit'],
  info: ['Da', 'Nu'],
};

const FLAGS = [
  // ── Contact și motor ──
  { key: '_sf_ignition_on',       label: 'Contact',                  icon: 'fa-key',                 mi: 'key',        group: 'motor', kind: 'on' },
  { key: '_sf_key_in_ignition',   label: 'Cheia în contact',         icon: 'fa-key',                 mi: 'key',        group: 'motor', kind: 'info' },
  { key: '_sf_engine_working',    label: 'Motorul funcționează',     icon: 'fa-fan',                 mi: 'fan',        group: 'motor', kind: 'on' },
  { key: '_cf_ready_to_drive',    label: 'Gata de plecare',          icon: 'fa-circle-play',         mi: 'play',       group: 'motor', kind: 'on', st: ['Da', 'Nu'] },
  { key: '_sf_dynamic_ignition',  label: 'Contact dinamic',          icon: 'fa-wave-square',         mi: 'zap',        group: 'motor', kind: 'info' },
  { key: '_sf_webasto',           label: 'Încălzire staționară',     icon: 'fa-fire',                mi: 'flame',      group: 'motor', kind: 'on', st: ['Pornită', 'Oprită'] },
  { key: '_sf_electric_engine',   label: 'Motor electric',           icon: 'fa-charging-station',    mi: 'plug',       group: 'motor', kind: 'info' },

  // ── Frâne și transmisie ──
  { key: '_sf_handbrake',         label: 'Frână de mână',            icon: 'fa-hand',                mi: 'hand',       group: 'transm', kind: 'info', st: ['Trasă', 'Eliberată'] },
  { key: '_sf_footbrake',         label: 'Frână de picior',          icon: 'fa-shoe-prints',         mi: 'foot',       group: 'transm', kind: 'info', st: ['Apăsată', 'Eliberată'] },
  { key: '_sf_clutch',            label: 'Ambreiaj',                 icon: 'fa-circle-half-stroke',  mi: 'disc',       group: 'transm', kind: 'info', st: ['Apăsat', 'Eliberat'] },
  { key: '_sf_reverse',           label: 'Marșarier',                icon: 'fa-arrow-rotate-left',   mi: 'reverse',    group: 'transm', kind: 'info', st: ['Cuplat', 'Nu'] },
  { key: '_sf_parking',           label: 'Cutie în parcare (P)',     icon: 'fa-square-parking',      mi: 'parking',    group: 'transm', kind: 'info' },
  { key: '_sf_neutral',           label: 'Cutie în neutru (N)',      icon: 'fa-circle-dot',          mi: 'circleDot',  group: 'transm', kind: 'info' },
  { key: '_sf_drive',             label: 'Cutie în mers (D)',        icon: 'fa-arrow-right',         mi: 'arrowRight', group: 'transm', kind: 'info' },

  // ── Uși și capace ──
  { key: '_sf_door_front_left',   label: 'Ușă față stânga',          icon: 'fa-door-open',           mi: 'doorOpen',   group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },
  { key: '_sf_door_front_right',  label: 'Ușă față dreapta',         icon: 'fa-door-open',           mi: 'doorOpen',   group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },
  { key: '_sf_door_rear_left',    label: 'Ușă spate stânga',         icon: 'fa-door-open',           mi: 'doorOpen',   group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },
  { key: '_sf_door_rear_right',   label: 'Ușă spate dreapta',        icon: 'fa-door-open',           mi: 'doorOpen',   group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },
  { key: '_sf_trunk_open',        label: 'Portbagaj',                icon: 'fa-car-rear',            mi: 'trunk',      group: 'usi', kind: 'open' },
  { key: '_sf_hood_open',         label: 'Capotă',                   icon: 'fa-car-side',            mi: 'hood',       group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },
  { key: '_sf_roof_open',         label: 'Trapă / plafon',           icon: 'fa-window-maximize',     mi: 'roof',       group: 'usi', kind: 'open', st: ['Deschisă', 'Închisă'] },

  // ── Închidere și alarmă ──
  { key: '_sf_car_closed',        label: 'Mașina încuiată',          icon: 'fa-lock',                mi: 'lock',       group: 'inchid', kind: 'on', st: ['Da', 'Nu'] },
  { key: '_sf_closed_by_remote',  label: 'Încuiată din telecomandă', icon: 'fa-lock',                mi: 'lock',       group: 'inchid', kind: 'on', st: ['Da', 'Nu'] },
  { key: '_sf_central_lock',      label: 'Închidere centralizată',   icon: 'fa-lock-open',           mi: 'unlock',     group: 'inchid', kind: 'on', st: ['Activă', 'Inactivă'] },
  { key: '_sf_remote_close',      label: 'Telecomandă — închide',    icon: 'fa-lock',                mi: 'lock',       group: 'inchid', kind: 'info', st: ['Apăsat', 'Nu'] },
  { key: '_sf_remote_open',       label: 'Telecomandă — deschide',   icon: 'fa-lock-open',           mi: 'unlock',     group: 'inchid', kind: 'info', st: ['Apăsat', 'Nu'] },
  { key: '_sf_remote_arm3x',      label: 'Telecomandă — armare 3x',  icon: 'fa-shield-halved',       mi: 'shield',     group: 'inchid', kind: 'info', st: ['Apăsat', 'Nu'] },
  { key: '_sf_factory_armed',     label: 'Alarmă de fabrică armată', icon: 'fa-shield-halved',       mi: 'shield',     group: 'inchid', kind: 'on', st: ['Armată', 'Dezarmată'] },
  { key: '_sf_factory_alarm',     label: 'Alarmă de fabrică pornită', icon: 'fa-bell',               mi: 'bell',       group: 'inchid', kind: 'warn', st: ['Sună', 'Liniște'] },
  { key: '_sf_alarm_emulated',    label: 'Alarmă emulată',           icon: 'fa-bell',                mi: 'bell',       group: 'inchid', kind: 'warn', st: ['Sună', 'Liniște'] },
  { key: '_sf_engine_lock',       label: 'Motor blocat (imobilizator)', icon: 'fa-ban',              mi: 'ban',        group: 'inchid', kind: 'info', st: ['Blocat', 'Liber'] },

  // ── Lumini ──
  { key: '_cf_parking_lights',    label: 'Lumini de poziție',        icon: 'fa-lightbulb',           mi: 'bulb',       group: 'lumini', kind: 'on', st: ['Aprinse', 'Stinse'] },
  { key: '_cf_dipped_headlights', label: 'Faza scurtă',              icon: 'fa-lightbulb',           mi: 'bulb',       group: 'lumini', kind: 'on', st: ['Aprinsă', 'Stinsă'] },
  { key: '_cf_full_beam',         label: 'Faza lungă',               icon: 'fa-sun',                 mi: 'sun',        group: 'lumini', kind: 'on', st: ['Aprinsă', 'Stinsă'] },
  { key: '_cf_front_fog_lights',  label: 'Proiectoare ceață față',   icon: 'fa-smog',                mi: 'fog',        group: 'lumini', kind: 'on', st: ['Aprinse', 'Stinse'] },
  { key: '_cf_rear_fog_lights',   label: 'Lumini ceață spate',       icon: 'fa-smog',                mi: 'fog',        group: 'lumini', kind: 'on', st: ['Aprinse', 'Stinse'] },
  { key: '_sf_hazard_lights',     label: 'Avarii',                   icon: 'fa-triangle-exclamation', mi: 'alert',     group: 'lumini', kind: 'warn', st: ['Pornite', 'Oprite'] },
  // „Bec ars — Stins" ar suna a bec, nu a martor. Da/Nu nu lasă loc de interpretare.
  { key: '_cf_lights_failure',    label: 'Bec ars',                  icon: 'fa-lightbulb',           mi: 'bulb',       group: 'lumini', kind: 'warn', st: ['Da', 'Nu'] },

  // ── Martori de bord ──
  { key: '_cf_check_engine',      label: 'CHECK ENGINE',             icon: 'fa-car-burst',           mi: 'engine',     group: 'martori', kind: 'warn' },
  { key: '_cf_stop_indicator',    label: 'STOP (oprește motorul)',   icon: 'fa-hand',                mi: 'hand',       group: 'martori', kind: 'warn' },
  { key: '_cf_oil_pressure_warning', label: 'Presiune / nivel ulei', icon: 'fa-oil-can',             mi: 'oil',        group: 'martori', kind: 'warn' },
  { key: '_cf_coolant_warning',   label: 'Lichid de răcire',         icon: 'fa-temperature-high',    mi: 'thermo',     group: 'martori', kind: 'warn' },
  { key: '_cf_battery_warning',   label: 'Încărcare baterie',        icon: 'fa-car-battery',         mi: 'battery',    group: 'martori', kind: 'warn' },
  { key: '_cf_abs_warning',       label: 'ABS',                      icon: 'fa-circle-notch',        mi: 'disc',       group: 'martori', kind: 'warn' },
  { key: '_cf_esp_warning',       label: 'ESP (control stabilitate)', icon: 'fa-car-on',             mi: 'esp',        group: 'martori', kind: 'warn' },
  { key: '_cf_eps_warning',       label: 'Servodirecție',            icon: 'fa-life-ring',           mi: 'steering',   group: 'martori', kind: 'warn' },
  { key: '_cf_airbag_warning',    label: 'AIRBAG',                   icon: 'fa-person-falling-burst', mi: 'airbag',    group: 'martori', kind: 'warn' },
  { key: '_cf_handbrake_warning', label: 'Martor frână de mână',     icon: 'fa-circle-exclamation',  mi: 'alertO',     group: 'martori', kind: 'warn' },
  { key: '_cf_brake_pad_wear',    label: 'Uzură plăcuțe frână',      icon: 'fa-record-vinyl',        mi: 'disc',       group: 'martori', kind: 'warn' },
  { key: '_cf_low_tire_pressure', label: 'Presiune scăzută în anvelope', icon: 'fa-circle-notch',    mi: 'tire',       group: 'martori', kind: 'warn' },
  { key: '_cf_low_fuel',          label: 'Rezervă combustibil',      icon: 'fa-gas-pump',            mi: 'pump',       group: 'martori', kind: 'warn' },
  { key: '_cf_glow_plug',         label: 'Bujii incandescente',      icon: 'fa-fire-flame-simple',   mi: 'glow',       group: 'martori', kind: 'info', st: ['Aprinse', 'Stinse'] },
  { key: '_cf_epc_warning',       label: 'EPC (control electronic motor)', icon: 'fa-microchip',     mi: 'cpu',        group: 'martori', kind: 'warn' },
  { key: '_cf_dpf_warning',       label: 'Filtru de particule (DPF)', icon: 'fa-filter',             mi: 'filter',     group: 'martori', kind: 'warn' },
  { key: '_cf_maintenance',       label: 'Revizie necesară',         icon: 'fa-wrench',              mi: 'wrench',     group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_general_warning',   label: 'Avertisment general',      icon: 'fa-circle-exclamation',  mi: 'alertO',     group: 'martori', kind: 'warn' },

  // ── Confort și siguranță ──
  { key: '_cf_driver_seatbelt',   label: 'Centură șofer',            icon: 'fa-user-shield',         mi: 'belt',       group: 'confort', kind: 'on', st: ['Pusă', 'Nepusă'] },
  { key: '_cf_passenger_seatbelt', label: 'Centură pasager',         icon: 'fa-user-shield',         mi: 'belt',       group: 'confort', kind: 'on', st: ['Pusă', 'Nepusă'] },
  { key: '_cf_air_conditioning',  label: 'Aer condiționat',          icon: 'fa-snowflake',           mi: 'snow',       group: 'confort', kind: 'on' },
  { key: '_cf_cruise_control',    label: 'Pilot automat',            icon: 'fa-gauge-simple-high',   mi: 'gauge',      group: 'confort', kind: 'on' },
  { key: '_cf_esp_active',        label: 'ESP intervine',            icon: 'fa-car-on',              mi: 'esp',        group: 'confort', kind: 'info', st: ['Acum', 'Nu'] },

  // ── Camion ──
  { key: '_cf_auto_retarder',     label: 'Retarder automat',         icon: 'fa-down-long',           mi: 'arrowDown',  group: 'camion', kind: 'info', st: ['Activ', 'Inactiv'] },
  { key: '_cf_manual_retarder',   label: 'Retarder manual',          icon: 'fa-down-long',           mi: 'arrowDown',  group: 'camion', kind: 'info', st: ['Activ', 'Inactiv'] },

  // ── Electric ──
  { key: '_sf_battery_charging',  label: 'Baterie în încărcare',     icon: 'fa-battery-half',        mi: 'battery',    group: 'electric', kind: 'on', st: ['Da', 'Nu'] },
  { key: '_sf_charging_cable',    label: 'Cablu de încărcare',       icon: 'fa-plug',                mi: 'plug',       group: 'electric', kind: 'info', st: ['Conectat', 'Deconectat'] },

  // ── Starea adaptorului ──
  { key: '_sf_work_mode_private', label: 'Regim personal',           icon: 'fa-user',                mi: 'user',       group: 'stare', kind: 'info', st: ['Personal', 'Serviciu'] },
  { key: '_sf_can1_status',       label: 'Magistrala CAN 1',         icon: 'fa-plug-circle-check',   mi: 'plug',       group: 'stare', kind: 'code' },
  { key: '_sf_can2_status',       label: 'Magistrala CAN 2',         icon: 'fa-plug-circle-check',   mi: 'plug',       group: 'stare', kind: 'code' },
];

// Steagurile pe care fișa Teltonika le listează, dar pe care NU le decodăm încă: nu știm poziția
// bitului în mască, iar ghicitul ar aprinde martori greșiți — mai rău decât să lipsească.
// Se afișează stinse, cu semnul „necitit", ca să se vadă că adaptorul le poate da, nu că sunt OK.
// Se completează când avem specificația de biți a adaptorului sau un vehicul pe care să le probăm.
const NEDECODATE = ['_sf_clutch', '_sf_central_lock', '_sf_remote_close', '_sf_remote_open', '_sf_remote_arm3x'];

const _byKey = {};
FLAGS.forEach(f => { _byKey[f.key] = f; });
const _nedecodate = new Set(NEDECODATE);

function flagMeta(key) { return _byKey[key] || null; }
function isFlagKey(key) { return !!_byKey[key]; }

// Textul de stare pentru un steag: „Deschisă" / „Închisă", „Aprins" / „Stins" etc.
function stateText(key, on) {
  const f = _byKey[key];
  if (!f) return on ? 'Da' : 'Nu';
  const t = f.st || KIND_TEXT[f.kind] || KIND_TEXT.info;
  return on ? t[0] : t[1];
}

// Aprins = merită atenție? Doar 'warn' și 'open'. Folosit pentru rezumatul de sus.
function isAlarming(key, on) {
  if (!on) return false;
  const f = _byKey[key];
  return !!f && (f.kind === 'warn' || f.kind === 'open');
}

// Toate steagurile, grupate — pentru ecranele care desenează secțiuni.
function grouped() {
  return GROUPS.map(g => ({ ...g, flags: FLAGS.filter(f => f.group === g.key) })).filter(g => g.flags.length);
}

module.exports = { GROUPS, FLAGS, KIND_TEXT, NEDECODATE, flagMeta, isFlagKey, stateText, isAlarming, grouped, _nedecodate };
