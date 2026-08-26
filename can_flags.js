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

  // ── Stegulețele P4 (ALL-CAN300, programele noi de vehicul — ex. VW Passat B7). Decodate din
  //    tabelele oficiale de biți; cheile vin din codec8e (decodeSecurityFlagsP4 & co). ──
  { key: '_sf_standalone_engine', label: 'Motor autonom',            icon: 'fa-gears',               mi: 'engine',     group: 'motor', kind: 'info', st: ['Activ', 'Inactiv'] },
  { key: '_sf_cng_running',       label: 'Merge pe gaz (CNG)',       icon: 'fa-gas-pump',            mi: 'pump',       group: 'motor', kind: 'info', st: ['Da', 'Nu'] },
  { key: '_sf_ready_to_drive',    label: 'Gata de plecare',          icon: 'fa-circle-play',         mi: 'play',       group: 'motor', kind: 'on', st: ['Da', 'Nu'] },
  { key: '_sf_trunk_remote_open', label: 'Portbagaj din telecomandă', icon: 'fa-car-rear',           mi: 'trunk',      group: 'usi', kind: 'info', st: ['Deschis', 'Nu'] },
  { key: '_sf_interlock',         label: 'Interlock (blocaj pornire)', icon: 'fa-ban',               mi: 'ban',        group: 'inchid', kind: 'info', st: ['Activ', 'Inactiv'] },
  { key: '_sf_engine_lock_request', label: 'Cerere blocare motor',   icon: 'fa-ban',                 mi: 'ban',        group: 'inchid', kind: 'info', st: ['Trimisă', 'Nu'] },
  { key: '_sf_rearm_signal',      label: 'Semnal de rearmare',       icon: 'fa-shield-halved',       mi: 'shield',     group: 'inchid', kind: 'info', st: ['Trimis', 'Nu'] },
  { key: '_cf_additional_front_lights', label: 'Lumini suplimentare față', icon: 'fa-lightbulb',     mi: 'bulb',       group: 'lumini', kind: 'on', st: ['Aprinse', 'Stinse'] },
  { key: '_cf_additional_rear_lights',  label: 'Lumini suplimentare spate', icon: 'fa-lightbulb',    mi: 'bulb',       group: 'lumini', kind: 'on', st: ['Aprinse', 'Stinse'] },
  { key: '_cf_light_signal',      label: 'Semnalizare cu farurile',  icon: 'fa-lightbulb',           mi: 'bulb',       group: 'lumini', kind: 'info', st: ['Acum', 'Nu'] },
  { key: '_cf_esp_off',           label: 'ESP dezactivat',           icon: 'fa-car-on',              mi: 'esp',        group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_oil_filter_clogged', label: 'Filtru de ulei înfundat', icon: 'fa-filter',              mi: 'filter',     group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_oil_pressure_low',  label: 'Presiune ulei scăzută',    icon: 'fa-oil-can',             mi: 'oil',        group: 'martori', kind: 'warn' },
  { key: '_cf_oil_temp_high',     label: 'Ulei supraîncălzit',       icon: 'fa-temperature-high',    mi: 'thermo',     group: 'martori', kind: 'warn' },
  { key: '_cf_coolant_low',       label: 'Lichid de răcire puțin',   icon: 'fa-temperature-high',    mi: 'thermo',     group: 'martori', kind: 'warn' },
  { key: '_cf_air_filter_clogged', label: 'Filtru de aer înfundat',  icon: 'fa-filter',              mi: 'filter',     group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_fuel_filter_clogged', label: 'Filtru combustibil înfundat', icon: 'fa-filter',         mi: 'filter',     group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_water_in_fuel',     label: 'Apă în combustibil',       icon: 'fa-droplet',             mi: 'droplet',    group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_brake_filter_clogged', label: 'Filtru frână înfundat', icon: 'fa-filter',              mi: 'filter',     group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_washer_fluid_low',  label: 'Lichid de parbriz puțin',  icon: 'fa-droplet',             mi: 'droplet',    group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_adblue_low',        label: 'AdBlue puțin',             icon: 'fa-droplet',             mi: 'droplet',    group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_cng_low',           label: 'CNG puțin',                icon: 'fa-gas-pump',            mi: 'pump',       group: 'martori', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_seatbelt_rear_left',   label: 'Centură spate stânga',  icon: 'fa-user-shield',         mi: 'belt',       group: 'confort', kind: 'on', st: ['Pusă', 'Nepusă'] },
  { key: '_cf_seatbelt_rear_right',  label: 'Centură spate dreapta', icon: 'fa-user-shield',         mi: 'belt',       group: 'confort', kind: 'on', st: ['Pusă', 'Nepusă'] },
  { key: '_cf_seatbelt_rear_centre', label: 'Centură spate mijloc',  icon: 'fa-user-shield',         mi: 'belt',       group: 'confort', kind: 'on', st: ['Pusă', 'Nepusă'] },
  { key: '_cf_passenger_present', label: 'Pasager față prezent',     icon: 'fa-user',                mi: 'user',       group: 'confort', kind: 'info', st: ['Da', 'Nu'] },
  { key: '_sf_operator_present',  label: 'Operator prezent',         icon: 'fa-user',                mi: 'user',       group: 'camion', kind: 'info', st: ['Da', 'Nu'] },
  { key: '_cf_pto_on',            label: 'Priză de putere (PTO)',    icon: 'fa-gears',               mi: 'gears',      group: 'camion', kind: 'on', st: ['Cuplată', 'Decuplată'] },
  { key: '_cf_diff_front_locked', label: 'Diferențial față blocat',  icon: 'fa-circle-notch',        mi: 'disc',       group: 'camion', kind: 'info', st: ['Blocat', 'Liber'] },
  { key: '_cf_diff_rear_locked',  label: 'Diferențial spate blocat', icon: 'fa-circle-notch',        mi: 'disc',       group: 'camion', kind: 'info', st: ['Blocat', 'Liber'] },
  { key: '_cf_diff_central_locked', label: 'Diferențial central (4HI)', icon: 'fa-circle-notch',     mi: 'disc',       group: 'camion', kind: 'info', st: ['Blocat', 'Liber'] },
  { key: '_cf_diff_central_reductor', label: 'Reductor (4LO)',       icon: 'fa-circle-notch',        mi: 'disc',       group: 'camion', kind: 'info', st: ['Cuplat', 'Nu'] },
  { key: '_cf_trailer_axle1_lift', label: 'Axă remorcă 1 ridicată',  icon: 'fa-truck',               mi: 'truck',      group: 'camion', kind: 'info', st: ['Ridicată', 'Jos'] },
  { key: '_cf_trailer_axle2_lift', label: 'Axă remorcă 2 ridicată',  icon: 'fa-truck',               mi: 'truck',      group: 'camion', kind: 'info', st: ['Ridicată', 'Jos'] },
  { key: '_cf_hydraulic_filter_clogged', label: 'Filtru hidraulic înfundat', icon: 'fa-filter',   mi: 'filter',     group: 'camion', kind: 'warn', st: ['Da', 'Nu'] },
  { key: '_cf_hydraulic_low_pressure', label: 'Presiune hidraulică scăzută', icon: 'fa-oil-can',    mi: 'oil',        group: 'camion', kind: 'warn' },
  { key: '_cf_hydraulic_oil_low', label: 'Ulei hidraulic puțin',     icon: 'fa-oil-can',             mi: 'oil',        group: 'camion', kind: 'warn' },
  { key: '_cf_hydraulic_high_temp', label: 'Hidraulică supraîncălzită', icon: 'fa-temperature-high', mi: 'thermo',     group: 'camion', kind: 'warn' },
  { key: '_cf_hydraulic_oil_overflow', label: 'Ulei hidraulic peste nivel', icon: 'fa-oil-can',      mi: 'oil',        group: 'camion', kind: 'warn' },
  { key: '_cf_trailer_tire_pressure_low', label: 'Presiune anvelope remorcă', icon: 'fa-truck',      mi: 'truck',      group: 'camion', kind: 'warn' },
  { key: '_cf_trailer_brake_wear', label: 'Uzură frâne remorcă',     icon: 'fa-truck',               mi: 'truck',      group: 'camion', kind: 'warn' },
  { key: '_cf_trailer_brake_temp_high', label: 'Frâne remorcă supraîncălzite', icon: 'fa-truck',     mi: 'truck',      group: 'camion', kind: 'warn' },
  { key: '_cf_trailer_pneumatic_bad', label: 'Alimentare pneumatică remorcă', icon: 'fa-truck',      mi: 'truck',      group: 'camion', kind: 'warn' },
  { key: '_sf_can_sleep_mode',    label: 'Adaptor CAN în repaus',    icon: 'fa-moon',                mi: 'moon',       group: 'stare', kind: 'info', st: ['Da', 'Nu'] },
  { key: '_sf_can3_status',       label: 'Magistrala CAN 3',         icon: 'fa-plug-circle-check',   mi: 'plug',       group: 'stare', kind: 'code' },
];

// ── Ce înseamnă fiecare steag — textul din balonul care se deschide la atingerea pictogramei ──
// (cerut de Robert, 26.08: „apeși pe pictogramă și îți apare un balon cu informația"). Pe scurt și
// pe înțelesul oricui; starea („Aprins/Stins") vine separat, din `stateText`.
const DESC = {
  _sf_ignition_on: 'Contactul e pus (poziția ON). Vine direct din CAN-ul mașinii, nu din firele dispozitivului.',
  _sf_key_in_ignition: 'Cheia se află în contact, indiferent dacă e răsucită sau nu.',
  _sf_engine_working: 'Motorul funcționează în acest moment.',
  _cf_ready_to_drive: 'Mașina e gata de plecare — toate sistemele au terminat verificările.',
  _sf_ready_to_drive: 'Mașina e gata de plecare — toate sistemele au terminat verificările.',
  _sf_dynamic_ignition: 'Contact „dinamic": mașina consideră contactul pus după alte semnale (ex. motor pornit), nu după cheie.',
  _sf_webasto: 'Încălzitorul staționar (Webasto) e pornit — încălzește motorul sau cabina fără ca motorul să meargă.',
  _sf_electric_engine: 'Motorul electric e cel care lucrează acum (la hibride și electrice).',
  _sf_standalone_engine: 'Motor care funcționează independent (utilaje / agregate auxiliare).',
  _sf_cng_running: 'Motorul merge acum pe gaz (CNG), nu pe benzină.',
  _sf_handbrake: 'Frâna de mână e trasă. Dacă mașina se mișcă având-o trasă, e semn rău — verifică.',
  _sf_footbrake: 'Pedala de frână e apăsată în acest moment.',
  _sf_clutch: 'Pedala de ambreiaj e apăsată în acest moment.',
  _sf_reverse: 'Cutia e în marșarier.',
  _sf_parking: 'Cutia automată e în poziția P (parcare).',
  _sf_neutral: 'Cutia e în neutru (N).',
  _sf_drive: 'Cutia automată e în poziția D (mers înainte).',
  _sf_door_front_left: 'Ușa din față stânga (șoferul). Colorată = deschisă chiar acum.',
  _sf_door_front_right: 'Ușa din față dreapta (pasagerul). Colorată = deschisă chiar acum.',
  _sf_door_rear_left: 'Ușa din spate stânga. Colorată = deschisă chiar acum.',
  _sf_door_rear_right: 'Ușa din spate dreapta. Colorată = deschisă chiar acum.',
  _sf_trunk_open: 'Portbagajul. Colorat = deschis chiar acum.',
  _sf_hood_open: 'Capota motorului. Colorată = deschisă chiar acum — atenție la intervenții neautorizate.',
  _sf_roof_open: 'Trapa sau plafonul decapotabil. Colorat = deschis.',
  _sf_trunk_remote_open: 'Portbagajul a fost deschis din telecomandă.',
  _sf_car_closed: 'Mașina e închisă (încuiată). Semnal din închiderea centralizată, prin CAN.',
  _sf_closed_by_remote: 'Mașina a fost încuiată din telecomandă (nu din cheie sau buton).',
  _sf_central_lock: 'Starea închiderii centralizate. Adaptorul o listează, dar mașina nu o transmite separat — rămâne necitită.',
  _sf_remote_close: 'S-a apăsat butonul de ÎNCHIDERE pe telecomanda din fabrică.',
  _sf_remote_open: 'S-a apăsat butonul de DESCHIDERE pe telecomanda din fabrică.',
  _sf_remote_arm3x: 'Butonul de închidere a fost apăsat de 3 ori — la unele mărci activează paza extinsă.',
  _sf_factory_armed: 'Alarma din fabrică e armată (mașina păzită).',
  _sf_factory_alarm: 'Alarma din fabrică SUNĂ chiar acum. Verifică vehiculul!',
  _sf_alarm_emulated: 'Alarma emulată de adaptor sună — declanșată de un eveniment de securitate.',
  _sf_engine_lock: 'Imobilizatorul ține motorul blocat — mașina nu poate porni.',
  _sf_engine_lock_request: 'S-a cerut blocarea motorului; se activează la următoarea încercare de pornire.',
  _sf_interlock: 'Blocajul de pornire (interlock) e activ — motorul nu pornește până nu se ridică.',
  _sf_rearm_signal: 'Mașina a trimis semnalul de rearmare a alarmei.',
  _cf_parking_lights: 'Luminile de poziție sunt aprinse.',
  _cf_dipped_headlights: 'Faza scurtă e aprinsă.',
  _cf_full_beam: 'Faza lungă e aprinsă.',
  _cf_front_fog_lights: 'Proiectoarele de ceață din față sunt aprinse.',
  _cf_rear_fog_lights: 'Lampa de ceață din spate e aprinsă.',
  _sf_hazard_lights: 'Luminile de avarie sunt pornite.',
  _cf_lights_failure: 'Un bec de pe mașină e ars sau circuitul lui are o problemă.',
  _cf_additional_front_lights: 'Luminile suplimentare din față (bară LED / proiectoare auxiliare) sunt aprinse.',
  _cf_additional_rear_lights: 'Luminile suplimentare din spate sunt aprinse.',
  _cf_light_signal: 'Șoferul a semnalizat cu farurile (flash).',
  _cf_check_engine: 'Martorul CHECK ENGINE e aprins — motorul a înregistrat o defecțiune. De citit cu testerul.',
  _cf_stop_indicator: 'Martorul STOP e aprins — problemă gravă: oprește motorul cât mai repede și în siguranță.',
  _cf_oil_pressure_warning: 'Presiunea sau nivelul uleiului e în afara limitelor. Continuarea mersului poate distruge motorul.',
  _cf_oil_pressure_low: 'Presiunea uleiului e scăzută — oprește motorul și verifică.',
  _cf_oil_temp_high: 'Uleiul e supraîncălzit — lasă motorul să se răcească.',
  _cf_oil_filter_clogged: 'Filtrul de ulei e înfundat — de schimbat la service.',
  _cf_coolant_warning: 'Temperatura sau nivelul lichidului de răcire e în afara limitelor — risc de supraîncălzire.',
  _cf_coolant_low: 'Lichidul de răcire e puțin — de completat.',
  _cf_battery_warning: 'Bateria nu se încarcă (alternator sau curea). Mașina poate rămâne pe drum.',
  _cf_abs_warning: 'ABS-ul are o problemă — frânele merg, dar fără antiblocare.',
  _cf_esp_warning: 'Sistemul de stabilitate (ESP) are o problemă.',
  _cf_esp_off: 'ESP-ul a fost DEZACTIVAT (din buton). Mașina nu mai corectează derapajele.',
  _cf_eps_warning: 'Servodirecția electrică are o problemă — volanul poate deveni greu.',
  _cf_airbag_warning: 'Sistemul de airbag are o problemă — poate să nu se declanșeze la impact.',
  _cf_handbrake_warning: 'Martorul frânei de mână e aprins (trasă sau nivel lichid frână scăzut).',
  _cf_brake_pad_wear: 'Plăcuțele de frână sunt uzate — de programat schimbul.',
  _cf_brake_filter_clogged: 'Filtrul sistemului de frânare e înfundat (camioane cu frânare pneumatică).',
  _cf_low_tire_pressure: 'Presiune scăzută într-una sau mai multe anvelope.',
  _cf_low_fuel: 'Rezerva de combustibil e aprinsă.',
  _cf_glow_plug: 'Bujiile incandescente (diesel) sunt în preîncălzire; dacă rămâne aprins în mers, e o problemă.',
  _cf_epc_warning: 'Controlul electronic al motorului (EPC) a detectat o problemă — putere redusă posibilă.',
  _cf_dpf_warning: 'Filtrul de particule (DPF) cere regenerare — de regulă un drum mai lung la turație constantă.',
  _cf_maintenance: 'Mașina cere revizie (mesajul de service din bord).',
  _cf_general_warning: 'Avertisment general din bord — verifică afișajul mașinii pentru detalii.',
  _cf_air_filter_clogged: 'Filtrul de aer e înfundat — motorul „respiră" greu, consum mai mare.',
  _cf_fuel_filter_clogged: 'Filtrul de combustibil e înfundat — de schimbat.',
  _cf_water_in_fuel: 'S-a detectat apă în combustibil — de golit separatorul (frecvent la diesel).',
  _cf_washer_fluid_low: 'Lichidul de parbriz e pe terminate.',
  _cf_adblue_low: 'AdBlue puțin — fără el, motorul refuză pornirea după un număr de kilometri.',
  _cf_cng_low: 'Rezerva de gaz (CNG) e scăzută.',
  _cf_driver_seatbelt: 'Centura șoferului. Colorată = pusă.',
  _cf_passenger_seatbelt: 'Centura pasagerului din față. Colorată = pusă.',
  _cf_seatbelt_rear_left: 'Centura din spate stânga. Colorată = pusă.',
  _cf_seatbelt_rear_right: 'Centura din spate dreapta. Colorată = pusă.',
  _cf_seatbelt_rear_centre: 'Centura din spate mijloc. Colorată = pusă.',
  _cf_passenger_present: 'Senzorul din scaun spune că pasagerul din față e prezent.',
  _cf_air_conditioning: 'Aerul condiționat e pornit.',
  _cf_cruise_control: 'Pilotul automat (tempomatul) e activ.',
  _cf_esp_active: 'ESP-ul INTERVINE chiar acum — mașina corectează un derapaj.',
  _sf_operator_present: 'Operatorul utilajului e la post (scaun/prezență).',
  _cf_pto_on: 'Priza de putere (PTO) e cuplată — basculantă, macara, pompă etc.',
  _cf_auto_retarder: 'Retarderul automat (frâna de încetinire) e activ.',
  _cf_manual_retarder: 'Retarderul manual e activ.',
  _cf_diff_front_locked: 'Diferențialul din față e blocat (teren greu).',
  _cf_diff_rear_locked: 'Diferențialul din spate e blocat.',
  _cf_diff_central_locked: 'Diferențialul central (4HI) e blocat.',
  _cf_diff_central_reductor: 'Reductorul (4LO) e cuplat — viteză mică, forță mare.',
  _cf_trailer_axle1_lift: 'Prima axă a remorcii e ridicată (mers fără încărcătură).',
  _cf_trailer_axle2_lift: 'A doua axă a remorcii e ridicată.',
  _sf_battery_charging: 'Bateria se încarcă în acest moment.',
  _sf_charging_cable: 'Cablul de încărcare e conectat la mașină.',
  _sf_work_mode_private: 'Regimul de utilizare setat: personal sau serviciu.',
  _sf_can1_status: 'Starea magistralei CAN 1: 0/1 = conectată (fără date / cu date), 2 = lipsește deși ar trebui, 3 = nefolosită.',
  _sf_can2_status: 'Starea magistralei CAN 2 — aceleași coduri ca la CAN 1.',
  _sf_can3_status: 'Starea magistralei CAN 3 — aceleași coduri ca la CAN 1.',
  _sf_can_sleep_mode: 'Adaptorul CAN a intrat în repaus (mașina parcată de ceva timp).',
  _cf_hydraulic_filter_clogged: 'Filtrul sistemului hidraulic e înfundat (utilaje/camioane cu instalație hidraulică).',
  _cf_hydraulic_low_pressure: 'Presiunea din sistemul hidraulic e scăzută.',
  _cf_hydraulic_oil_low: 'Uleiul hidraulic e sub nivel.',
  _cf_hydraulic_high_temp: 'Sistemul hidraulic e supraîncălzit.',
  _cf_hydraulic_oil_overflow: 'Ulei peste nivel în camera hidraulică.',
  _cf_trailer_tire_pressure_low: 'Presiune scăzută în anvelopele remorcii.',
  _cf_trailer_brake_wear: 'Frânele remorcii sunt uzate.',
  _cf_trailer_brake_temp_high: 'Frânele remorcii s-au supraîncălzit — oprește și lasă-le să se răcească.',
  _cf_trailer_pneumatic_bad: 'Alimentarea pneumatică a remorcii e incorectă (presiune/legături).',
};
FLAGS.forEach(f => { if (DESC[f.key]) f.desc = DESC[f.key]; });

// Steagurile pe care fișa Teltonika le listează, dar pe care NU le decodăm încă.
// 26.08: lista s-a golit aproape de tot — ambreiajul și telecomanda au acum poziții de biți din
// tabelele oficiale „State Flags P4" (wiki Teltonika, fixture: tools/fixtures/p4-flags.json) și
// se decodează în codec8e (decodeSecurityFlagsP4). A rămas doar închiderea centralizată, care nu
// are bit propriu în niciunul dintre protocoale.
const NEDECODATE = ['_sf_central_lock'];

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
