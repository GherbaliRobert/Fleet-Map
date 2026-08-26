// Iconuri inline (SVG, stil Feather) — fără dependență de Font Awesome, ușor + offline.
type P = { name: IconName; size?: number; color?: string; style?: any; class?: string; sw?: number };
export type IconName =
  | 'car' | 'list' | 'chart' | 'bell' | 'search' | 'chevronR' | 'chevronL' | 'navigate'
  | 'route' | 'report' | 'cpu' | 'droplet' | 'disc' | 'clock' | 'gauge' | 'refresh'
  | 'x' | 'check' | 'logout' | 'layers' | 'alert' | 'calendar' | 'zap' | 'mapPin' | 'map' | 'wifiOff'
  | 'menu' | 'moon' | 'sun' | 'headset' | 'settings' | 'wrench' | 'user' | 'truck' | 'robot' | 'flame' | 'fileBar'
  | 'plus' | 'trash' | 'edit' | 'phone' | 'mail' | 'idCard' | 'sparkles' | 'coins' | 'maximize' | 'eye'
  | 'compass'
  // Steaguri CAN (vezi can_flags.js, campul `mi`) — martori de bord, usi, lumini, transmisie.
  | 'key' | 'doorOpen' | 'lock' | 'unlock' | 'bulb' | 'shield' | 'gears' | 'fan' | 'play' | 'ban'
  | 'hand' | 'foot' | 'reverse' | 'parking' | 'circleDot' | 'arrowRight' | 'arrowDown'
  | 'trunk' | 'hood' | 'roof' | 'engine' | 'esp' | 'steering' | 'airbag' | 'belt' | 'snow'
  | 'thermo' | 'oil' | 'battery' | 'pump' | 'filter' | 'fog' | 'glow' | 'tire' | 'plug' | 'alertO'
  // Pictograme de bord, în stilul fișei Teltonika: mai fine și specifice fiecărei stări.
  | 'carDoorFL' | 'carDoorFR' | 'carDoorRL' | 'carDoorRR' | 'carTrunk' | 'carHood' | 'carRoof'
  | 'carWindow' | 'carLocked' | 'carUnlocked' | 'remoteLock' | 'remoteUnlock' | 'remote3x'
  | 'keySlot' | 'ignitionKey' | 'engineBlock' | 'brakeP' | 'brakePedal' | 'clutchPedal'
  | 'gearP' | 'gearR' | 'gearN' | 'gearD' | 'gearBox' | 'hazardTri' | 'beamDip' | 'beamFull'
  | 'beamPark' | 'fogFront' | 'fogRear' | 'seatbeltIcon' | 'absRing' | 'espSkid' | 'airbagIcon'
  | 'oilCanDrop' | 'coolantTemp' | 'batteryPM' | 'tirePress' | 'fuelPumpLow' | 'glowCoil'
  | 'epcText' | 'dpfFilter' | 'wrenchService' | 'bellAlarm' | 'sirenAlarm' | 'acFlake'
  | 'cruiseGauge' | 'washerFluid' | 'adblueDrop' | 'stopHand' | 'warnCircle' | 'steeringEps'
  | 'brakePad' | 'lightBulbOut' | 'personSeat' | 'ptoGear' | 'sleepMoon' | 'startStop'
  | 'gasCanister' | 'plugCharge' | 'trailerHitch' | 'diffLock' | 'lightExtra';

const P: Record<IconName, string> = {
  car: '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14M5 11v6m14-6v6M6 17h2m8 0h2M7 14h.01M17 14h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chevronR: '<path d="M9 18l6-6-6-6"/>',
  chevronL: '<path d="M15 18l-6-6 6-6"/>',
  navigate: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h7"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  droplet: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gauge: '<path d="M12 13l4-4M3.5 18a9 9 0 1 1 17 0z"/>',
  refresh: '<path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L21 8M20.5 15a9 9 0 0 1-14.8 3.4L3 16"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15"/>',
  wifiOff: '<path d="M1 1l22 22M16.7 11.1A6 6 0 0 1 19 13M5 13a10 10 0 0 1 5.2-2.7M2 8.8a16 16 0 0 1 4.5-2.6M12 20h.01"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM20 14h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1zM17 19a3 3 0 0 1-3 2h-2"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20.5 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 4h6M8.5 14h.01M15.5 14h.01M9 17h6"/>',
  flame: '<path d="M12 2c2 4 6 5 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2.5-4.5 0 2 1 3 2 3 0-3 .5-6 1.5-8.5z"/>',
  fileBar: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 18v-3M12 18v-6M15 18v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  idCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M7 15h4M7 7h.01"/>',
  sparkles: '<path d="M12 3 L13.8 7.9 L18.7 9.7 L13.8 11.5 L12 16.4 L10.2 11.5 L5.3 9.7 L10.2 7.9 Z"/><path d="M19 13 L19.7 14.8 L21.5 15.5 L19.7 16.2 L19 18 L18.3 16.2 L16.5 15.5 L18.3 14.8 Z"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',

  // ─── Bord: uși și capace (mașina văzută de sus, ca în fișa Teltonika) ───
  // Caroseria e aceeași în toate patru; se schimbă doar ușa deschisă, ca ochiul să prindă imediat
  // CARE ușă e. Text explicit în balon, deci nu ne bazăm doar pe desen.
  carDoorFL: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M7 8.5 2.5 6.5v4.5z"/><path d="M10 6h4"/>',
  carDoorFR: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M17 8.5 21.5 6.5v4.5z"/><path d="M10 6h4"/>',
  carDoorRL: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M7 15.5 2.5 13.5v4.5z"/><path d="M10 18h4"/>',
  carDoorRR: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M17 15.5 21.5 13.5v4.5z"/><path d="M10 18h4"/>',
  carTrunk: '<rect x="6" y="7" width="12" height="14" rx="2.5"/><path d="M6 9.5 3 5.5h18l-3 4"/>',
  carHood: '<rect x="6" y="3" width="12" height="14" rx="2.5"/><path d="M6 14.5 3 18.5h18l-3-4"/>',
  carRoof: '<rect x="5.5" y="2.5" width="13" height="19" rx="4"/><rect x="8.5" y="6" width="7" height="6.5" rx="1.5"/><path d="M8.5 15.5h7"/>',
  carWindow: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 12h16"/><path d="M8 15h3"/>',

  // ─── Închidere ───
  carLocked: '<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"/><circle cx="12" cy="15.5" r="1.3"/>',
  carUnlocked: '<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 6.7-1.4"/><circle cx="12" cy="15.5" r="1.3"/>',
  remoteLock: '<rect x="6" y="11.5" width="12" height="9" rx="2.5"/><path d="M9 11.5V8.5a3 3 0 0 1 6 0v3"/><path d="M4 5.5h4M6 3.5v4"/>',
  remoteUnlock: '<rect x="6" y="11.5" width="12" height="9" rx="2.5"/><path d="M9 11.5V8.5a3 3 0 0 1 5.7-1.2"/><path d="M4 5.5h4M6 3.5v4"/>',
  remote3x: '<rect x="7" y="12" width="11" height="8.5" rx="2.5"/><path d="M9.7 12V9.2a2.8 2.8 0 0 1 5.6 0V12"/><path d="M2 8.5h4.5M2 5.5h4.5M2 11.5h4.5"/>',

  // ─── Contact și motor ───
  keySlot: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M18 12v3M15 12v2.5"/>',
  ignitionKey: '<circle cx="12" cy="12" r="8.5"/><circle cx="10" cy="12" r="2"/><path d="M12 12h5M15.5 12v2"/>',
  engineBlock: '<path d="M3.5 11h1.8V8.6h2.3V6.5h4.2l1.8 2.1h2V7h2v1.6h1.4a1.6 1.6 0 0 1 1.6 1.6v3.6a1.6 1.6 0 0 1-1.6 1.6h-1.8v2.1H9.6l-1.9-2.1H5.3V13H3.5z"/>',
  brakeP: '<circle cx="12" cy="12" r="7.5"/><path d="M10 16V8h2.6a2.4 2.4 0 0 1 0 4.8H10"/>',
  brakePedal: '<circle cx="12" cy="12" r="7.5"/><path d="M8.6 12c1.2-1.6 2.2-1.6 3.4 0s2.2 1.6 3.4 0"/><path d="M2.5 7.5C1.7 9 1.7 15 2.5 16.5M21.5 7.5c.8 1.5.8 7.5 0 9"/>',
  clutchPedal: '<path d="M8 3.5h4.2a2 2 0 0 1 2 2v3a2 2 0 0 1-1.1 1.8L10 12v8.5"/><path d="M7 20.5h6"/><path d="M9.2 4.8h2"/>',

  // ─── Treapta de viteză: litera, ca în bord ───
  gearP: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none">P</text>',
  gearR: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none">R</text>',
  gearN: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none">N</text>',
  gearD: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none">D</text>',
  gearBox: '<path d="M6 5v8M12 5v8M18 5v10M6 9h12M12 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><circle cx="6" cy="4" r="1.3"/><circle cx="12" cy="4" r="1.3"/><circle cx="18" cy="4" r="1.3"/>',

  // ─── Lumini (glifele clasice de bord) ───
  hazardTri: '<path d="M12 4.5 21 19H3z"/><path d="M12 10v4M12 16.3h.01"/>',
  beamDip: '<path d="M12 5.5a6.5 6.5 0 0 1 0 13H8a6.5 6.5 0 0 1 0-13z"/><path d="M15 8.5l4.5 2M15 12h4.5M15 15.5l4.5-2"/>',
  beamFull: '<path d="M12 5.5a6.5 6.5 0 0 1 0 13H8a6.5 6.5 0 0 1 0-13z"/><path d="M15 8h5M15 12h5M15 16h5"/>',
  beamPark: '<path d="M11 6.5a5.5 5.5 0 0 1 0 11H8a5.5 5.5 0 0 1 0-11z"/><path d="M14.5 9h2M14.5 12h2M14.5 15h2"/>',
  fogFront: '<path d="M11 6.5a5.5 5.5 0 0 1 0 11H8a5.5 5.5 0 0 1 0-11z"/><path d="M14 9.5h5.5M14 14.5h5.5M15 12h3.5"/><path d="M16 12h-.01"/>',
  fogRear: '<path d="M13 6.5a5.5 5.5 0 0 0 0 11h3a5.5 5.5 0 0 0 0-11z"/><path d="M10 9.5H4.5M10 14.5H4.5M9 12H5.5"/>',
  lightExtra: '<path d="M12 6.5a5.5 5.5 0 0 1 0 11H9a5.5 5.5 0 0 1 0-11z"/><path d="M15.5 9.5h5M15.5 14.5h5"/><path d="M18 3.5v2M21.5 5.5l-1.4 1.4"/>',
  lightBulbOut: '<path d="M9.5 18.5h5M10.5 21h3M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1.1 2h4.4c.1-.8.5-1.5 1.1-2A5.5 5.5 0 0 0 12 3.5z"/><path d="M4 4l16 16"/>',

  // ─── Martori de bord ───
  absRing: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="2 2.4"/><text x="12" y="14.6" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor" stroke="none">ABS</text>',
  espSkid: '<path d="M4 14.5h16M6 14.5l1.5-4h9l1.5 4"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/><path d="M3 20c1.2-1 2.4-1 3.6 0M17.4 20c1.2-1 2.4-1 3.6 0"/>',
  airbagIcon: '<circle cx="7.5" cy="6" r="2.4"/><path d="M4.5 20.5v-4.2a3 3 0 0 1 3-3h1.6"/><circle cx="16" cy="14.5" r="5.5"/><path d="M11 20.5h-6"/>',
  oilCanDrop: '<path d="M3.5 13.5l2-3.5h7.5l2 2H21l-2.5 6.5H6.5z"/><path d="M8 8h4.5M10 8v2"/><path d="M18.5 4.5c1 1.5 1.8 2.5 1.8 3.3a1.8 1.8 0 1 1-3.6 0c0-.8.8-1.8 1.8-3.3z"/>',
  coolantTemp: '<path d="M11 4.5v8.2a3 3 0 1 0 2.2 0V4.5a1.1 1.1 0 0 0-2.2 0z"/><path d="M13.2 7.5H16M13.2 10.5H16"/><path d="M3 20c1.2-.9 2.4-.9 3.6 0M17.4 20c1.2-.9 2.4-.9 3.6 0"/>',
  batteryPM: '<rect x="2.5" y="7.5" width="19" height="11" rx="2"/><path d="M6.5 7.5V5.5h3v2M14.5 7.5V5.5h3v2"/><path d="M6 13h3.5M7.75 11.2v3.6M14.5 13H18"/>',
  tirePress: '<path d="M2.5 6.5h19"/><path d="M4.5 8h15v5.5a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6z"/><path d="M12 10.2v3.6M12 16.4h.01"/>',
  fuelPumpLow: '<path d="M4 20.5V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 12 5v15.5z"/><path d="M4 20.5h8"/><path d="M12 9h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V8l-2.5-2.5"/><path d="M6 8.5h4"/>',
  glowCoil: '<path d="M4 9c1.6 0 1.6 6 3.2 6S8.8 9 10.4 9s1.6 6 3.2 6S15.2 9 16.8 9s1.6 6 3.2 6"/>',
  epcText: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><text x="12" y="15" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">EPC</text>',
  dpfFilter: '<path d="M4 5.5h16l-6 7v6l-4 2v-8z"/><path d="M9 8.5h6"/>',
  wrenchService: '<path d="M20 5.5a4.5 4.5 0 0 1-6 6L6 19.5a2.1 2.1 0 0 1-3-3l8-8a4.5 4.5 0 0 1 6-6l-3 3 3 3z"/>',
  stopHand: '<path d="M8.8 13.6V6.9a1.3 1.3 0 0 1 2.6 0v5"/><path d="M11.4 11.9V5.4a1.3 1.3 0 0 1 2.6 0v6.5"/><path d="M14 11.9V7.3a1.3 1.3 0 0 1 2.6 0v7.2a5.5 5.5 0 0 1-5.5 5.5h-.8a4 4 0 0 1-3.3-1.8l-2.2-3.3a1.35 1.35 0 0 1 2.2-1.6l1.8 2.3"/>',
  warnCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.3h.01"/>',
  steeringEps: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 9V3.5M9.6 13.6 4.5 18.6M14.4 13.6l5.1 5"/>',
  brakePad: '<circle cx="10.3" cy="12" r="6.4"/><circle cx="10.3" cy="12" r="1.8"/><path d="M17.4 8.4h2.3a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7h-2.3z"/>',
  washerFluid: '<path d="M5 20.5V11l3-4h6l3 4v9.5z" /><path d="M9 7V4h4v3"/><path d="M8.5 12.5h7"/><path d="M20.5 6.5c.8 1.2 1.4 2 1.4 2.6a1.4 1.4 0 1 1-2.8 0c0-.6.6-1.4 1.4-2.6z"/>',
  adblueDrop: '<path d="M12 3.5c2.6 3.8 4.4 6.2 4.4 8.2a4.4 4.4 0 1 1-8.8 0c0-2 1.8-4.4 4.4-8.2z"/><text x="12" y="14.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="currentColor" stroke="none">AD</text>',
  gasCanister: '<rect x="6" y="4.5" width="12" height="15" rx="3"/><path d="M9.5 4.5V3h5v1.5"/><text x="12" y="14.5" text-anchor="middle" font-size="6" font-weight="700" fill="currentColor" stroke="none">GAS</text>',

  // ─── Confort și diverse ───
  seatbeltIcon: '<circle cx="12" cy="4.6" r="2.5"/><path d="M8 20.5v-6.4A4 4 0 0 1 12 10h1.6"/><path d="M18.6 7.6 9.4 20.5"/><path d="M6.6 20.5h9"/>',
  personSeat: '<circle cx="12" cy="5.5" r="2.6"/><path d="M8 20.5v-6a4 4 0 0 1 4-4 4 4 0 0 1 4 4v6"/><path d="M6.5 20.5h11"/>',
  acFlake: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8"/><path d="M12 6l-2.2-2.2M12 6l2.2-2.2M12 18l-2.2 2.2M12 18l2.2 2.2"/>',
  cruiseGauge: '<path d="M3.5 16.5a9 9 0 1 1 17 0"/><path d="M12 16.5 16 10"/><circle cx="12" cy="16.5" r="1.3"/>',
  ptoGear: '<circle cx="12" cy="12" r="3.1"/><circle cx="12" cy="12" r="7.2"/><path d="M12 4.8V2.6M12 21.4v-2.2M4.8 12H2.6M21.4 12h-2.2M6.9 6.9 5.3 5.3M18.7 18.7l-1.6-1.6M17.1 6.9l1.6-1.6M5.3 18.7l1.6-1.6"/>',
  sleepMoon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  startStop: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v5"/><path d="M8.5 8.5a5 5 0 1 0 7 0"/>',
  plugCharge: '<path d="M9 3.5v5M15 3.5v5"/><path d="M6.5 8.5h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17.5v3"/><path d="M13.5 12.5 11 15.5h2.5L11 18.5"/>',
  trailerHitch: '<rect x="9" y="7" width="12" height="8" rx="1.5"/><path d="M9 13H4.5a2 2 0 0 1-2-2"/><circle cx="12.5" cy="17.5" r="2"/><circle cx="18" cy="17.5" r="2"/>',
  diffLock: '<circle cx="12" cy="12" r="4"/><path d="M4 12h4M16 12h4"/><circle cx="3" cy="12" r="1.6"/><circle cx="21" cy="12" r="1.6"/><path d="M12 4.5V8"/><rect x="10" y="2" width="4" height="3" rx="1"/>',
  bellAlarm: '<path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  sirenAlarm: '<path d="M6 9.5h3l4-3.5v12l-4-3.5H6a1.5 1.5 0 0 1-1.5-1.5v-2A1.5 1.5 0 0 1 6 9.5z"/><path d="M16.5 8.8a4.5 4.5 0 0 1 0 6.4M19 6.3a8 8 0 0 1 0 11.4"/>',

  // ─── Steaguri CAN ─────────────────────────────────────────────────────────
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 20 3M17 6l3 3M14 9l2.5 2.5"/>',
  doorOpen: '<path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M2 21h20M12.5 12h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 2a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1.1 2.2h5c.1-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 2z"/>',
  shield: '<path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5z"/>',
  // Schema în H a schimbătorului de viteze. NU o roată dințată: desenată la 17px ieșea identică cu
  // `sun`, care e chiar alături în același panou („Faza lungă").
  gears: '<path d="M6 4v8M18 4v8M6 8h12M12 8v10"/><circle cx="12" cy="20" r="2"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-8 4-8 2 0 3 2 2 4-.8 1.6-3 3-6 4M14 12c4 0 8 1 8 4 0 2-2 3-4 2-1.6-.8-3-3-4-6M12 14c0 4-1 8-4 8-2 0-3-2-2-4 .8-1.6 3-3 6-4M10 12c-4 0-8-1-8-4 0-2 2-3 4-2 1.6.8 3 3 4 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 16 12l-6 3.5z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>',
  hand: '<path d="M18 11V6.5a1.5 1.5 0 0 0-3 0M15 10.5v-6a1.5 1.5 0 0 0-3 0M12 10.5v-5a1.5 1.5 0 0 0-3 0V13M9 12.5V9a1.5 1.5 0 0 0-3 0v6a7 7 0 0 0 7 7h1a7 7 0 0 0 7-7v-3.5a1.5 1.5 0 0 0-3 0"/>',
  foot: '<path d="M7 3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7z"/><path d="M10 15v4a2 2 0 0 0 2 2h5"/>',
  reverse: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.5 17V7h3.2a3 3 0 0 1 0 6H9.5"/>',
  circleDot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  arrowRight: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  arrowDown: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  trunk: '<path d="M3 17v-4l2-4h14l2 4v4M3 17h18M6 17v2M18 17v2M8 13h8"/>',
  hood: '<path d="M2 18h20M4 18v-4l4-1 2-3h4l2 3 4 1v4"/><path d="M8 10 6 4h5"/>',
  roof: '<rect x="5" y="3" width="14" height="18" rx="4"/><rect x="8" y="6" width="8" height="6" rx="1"/>',
  engine: '<path d="M4 12v4h2l2 3h8v-3h2l2-3v-3h-2l-2-3H9v3H6l-2 2z"/><path d="M10 6V4h4v2"/>',
  esp: '<path d="M4 15v-3l2-1 2-3h8l2 3 2 1v3M4 15h16"/><path d="M7 19c1-1 2-1 3 0s2 1 3 0 2-1 3 0"/>',
  steering: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 9V3M9.5 13.5 4.5 18M14.5 13.5 19.5 18"/>',
  airbag: '<circle cx="8" cy="6" r="2.5"/><path d="M5 21v-4a3 3 0 0 1 3-3h1"/><circle cx="16" cy="14.5" r="5.5"/>',
  belt: '<path d="M6 3 16 17"/><rect x="12.5" y="15" width="7.5" height="5" rx="1.5"/><path d="M4 21h6"/>',
  snow: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a5 5 0 1 0 4 0z"/><path d="M12 9v7"/>',
  // Picătură peste linia de nivel. Bidonul de ulei, desenat mic, ieșea un nor — la fel ca `hood`.
  oil: '<path d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9z"/><path d="M4 21h16"/>',
  battery: '<rect x="2" y="8" width="18" height="10" rx="2"/><path d="M22 11v4M6 5v3M16 5v3M5 13h4M13 13h4M15 11v4"/>',
  pump: '<path d="M3 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h12M5 9h6"/><path d="M13 8h3a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V9l-3-3"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  fog: '<path d="M5 7h14M3 11h18M4 15h16M6 19h12"/>',
  glow: '<path d="M12 2v4M8 8h8M9 11h6M10 14h4M11 17h2M12 20v2"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
  alertO: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
};

// `sw` = grosimea conturului. Implicit 2, ca până acum. Pictogramele de bord (uși, martori,
// trepte) se desenează cu 1.7 — au mai multe linii, iar la 2 se împăstau între ele.
export function Icon({ name, size = 22, color = 'currentColor', style, class: cls, sw = 2 }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} stroke-width={sw} stroke-linecap="round" stroke-linejoin="round"
      class={cls} style={style}
      dangerouslySetInnerHTML={{ __html: P[name] }}
    />
  );
}
