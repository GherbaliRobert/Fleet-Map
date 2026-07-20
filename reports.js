// reports.js — Motor de rapoarte flotă (calcule din tabela positions).
// Toate funcțiile primesc (db, imeis[], from, to, opts) și întorc { columns, rows, summary }.

const IDLE_SPEED = 3;        // km/h sub care vehiculul e considerat oprit
const MAX_STEP_KM = 10;      // ignoră salturi GPS mai mari (puncte aberante)
let geocode = null; try { geocode = require('./geocode'); } catch (e) {} // reverse-geocode (adrese în Foaie de parcurs)
let roadlimits = null; try { roadlimits = require('./roadlimits'); } catch (e) {} // limite reale de viteză din OpenStreetMap (mod OSM la „Depășiri viteză")

function t(p) { return new Date(p.timestamp).getTime(); }
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const DISPLAY_TZ = process.env.DISPLAY_TZ || 'Europe/Bucharest';
function fmtTs(ts) { return ts ? new Date(ts).toLocaleString('ro-RO', { timeZone: DISPLAY_TZ }) : ''; }
function fmtTsMin(ts) { return ts ? new Date(ts).toLocaleString('ro-RO', { timeZone: DISPLAY_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } // dată + oră, fără secunde
function fmtHM(ts) { return ts ? new Date(ts).toLocaleTimeString('ro-RO', { timeZone: DISPLAY_TZ, hour: '2-digit', minute: '2-digit' }) : ''; } // doar ora HH:MM (ziua e deja în coloana „Zi")
// Vechimea unei poziții (ms). isNow=true (raport „până acum") → prefix „acum X" (ex. „acum 12 min");
// isNow=false (raport pe o zi din trecut) → durată simplă „34 min" — fără „acum", ca să nu inducă în eroare.
function _ageStr(ms, isNow) {
  if (ms == null || !isFinite(ms) || ms < 0) return '—';
  const pre = isNow ? 'acum ' : '';
  const s = Math.round(ms / 1000);
  if (s < 60) return pre + s + ' sec';
  const m = Math.round(s / 60);
  if (m < 60) return pre + m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return pre + h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  const d = Math.floor(h / 24);
  return pre + d + (d === 1 ? ' zi' : ' zile');
}
// Calitatea fix-ului GPS după numărul de sateliți (ca userul să înțeleagă coloana „Sateliți").
function _satQ(n) {
  n = Number(n) || 0;
  if (n <= 3) return 'semnal slab';
  if (n <= 6) return 'puțin precisă';
  if (n <= 12) return 'bun';
  return 'excelent';
}
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h > 0) return m > 0 ? (h + 'h ' + m + 'm') : (h + 'h');
  if (m > 0) return m + 'm';
  return s + 's';
}
function loc(p) { return p ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : ''; }
function io(p) { return p && p.io_data ? p.io_data : {}; }
// Odometru (km) din CAN la un punct (start/stop cursă). Fallback null dacă vehiculul n-are CAN.
function odo(p) { const i = io(p); let v = i.can_total_mileage; if (v == null) v = i.can_total_mileage_counted; if (v == null) v = i.total_odometer; const n = parseFloat(v); return (isFinite(n) && n > 0) ? Math.round(n) : null; }
// Odometru REAL din bord = DOAR can_total_mileage (IO 87). NU folosim can_total_mileage_counted (IO 105 = „de la pornire/contor",
// ALT contor cu ALTĂ bază): amestecul lor dădea un index inflat, „din viitor" (ex. 33.158 în loc de 32.685 real din bord — când
// mașina parchează și nu mai trimite can_total_mileage, un ping cu doar _counted „împingea" indexul). Nici total_odometer (contorul
// GPS al device-ului, metri — intră abia la indexul bord+GPS, pasul 2).
// IMPORTANT: valorile CAN pot fi STRINGURI („32685.7") → citim cu != null + parseFloat (ca _odoFromIo din server.js), NU typeof==='number'.
function odoCan(p) { const v = io(p).can_total_mileage; if (v == null) return null; const n = parseFloat(v); return (isFinite(n) && n > 0) ? Math.round(n) : null; }
// Index ore de funcționare (moto-ore) din CAN: total (IO 104, h) preferat; altfel worktime (IO 102/103, minute→h). null dacă lipsește.
function engH(p) { const i = io(p); let h = i.can_engine_total_hours != null ? parseFloat(i.can_engine_total_hours) : (i.can_engine_worktime != null ? parseFloat(i.can_engine_worktime) / 60 : (i.can_engine_worktime_counted != null ? parseFloat(i.can_engine_worktime_counted) / 60 : null)); return (h != null && isFinite(h) && h > 0) ? Math.round(h) : null; }
// Grupare mii stil RO (145320 → „145.320").
function _grp(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// Contorul GPS al device-ului „de la montare" (total_odometer, IO 16, METRI). Baza indexului bord+GPS (pasul 2). null dacă lipsește.
function todo(p) { const i = io(p); if (i.total_odometer == null) return null; const n = parseFloat(i.total_odometer); return (isFinite(n) && n >= 0) ? n : null; }
// Odometru CURENT (km) pt. mentenanța pe km — ca _odoFromIo din server.js: can_total_mileage → _counted → total_odometer/1000.
function _odoNow(io) { if (!io) return null; let km = io.can_total_mileage != null ? parseFloat(io.can_total_mileage) : (io.can_total_mileage_counted != null ? parseFloat(io.can_total_mileage_counted) : (io.total_odometer != null ? parseFloat(io.total_odometer) / 1000 : null)); return (km != null && isFinite(km) && km > 0) ? Math.round(km) : null; }
// Adresă din cache (reverse-geocode); fallback pe coordonate dacă nu e încă rezolvată.
function addr(p) { if (!p) return ''; if (geocode && geocode.peek) { const a = geocode.peek(p.latitude, p.longitude); if (a) return a; } return loc(p); }
// Nivel rezervor (L). `fuel_level_liters` e câmpul REZOLVAT de server (din sonde, deja în litri) — îl citim
// tolerant la string (valorile CAN vin adesea ca stringuri numerice). Fallback `can_fuel_level_liters` DOAR dacă
// e deja număr (normalizat /10 la ingestie); nu forțăm parseFloat pe string acolo (ar ieși ×10).
function fuelL(p) { const i = io(p); if (i.fuel_level_liters != null) { const n = parseFloat(i.fuel_level_liters); if (isFinite(n) && n > 0) return n; } return (typeof i.can_fuel_level_liters === 'number' && i.can_fuel_level_liters > 0) ? i.can_fuel_level_liters : null; }
// Contor CUMULATIV de combustibil consumat (CAN „total fuel used", L). Monoton crescător → delta = consum EXACT,
// chiar și pe distanțe scurte unde nivelul rezervorului nu se mișcă vizibil. Sursă PREFERATĂ pentru consum.
// IO-urile CAN vin adesea ca STRING numeric (ca `can_total_mileage` → vezi _odoFromIo): citim cu != null + parseFloat,
// altfel `typeof === 'number'` respinge stringul și contorul e ignorat (sursa cădea mereu pe Senzor/Estimat).
function fuelCumul(p) { const i = io(p); const raw = i.can_fuel_consumed != null ? i.can_fuel_consumed : (i.can_fuel_consumed_counted != null ? i.can_fuel_consumed_counted : (i.can_engine_total_fuel_used != null ? i.can_engine_total_fuel_used : null)); const v = raw != null ? parseFloat(raw) : NaN; return (isFinite(v) && v > 0) ? v : null; }
function ignOn(p) { return io(p).ignition === 1; }
// Turația CAN (RON: „can_rpm" în raportul CAN, unele parsere „can_engine_rpm"). null dacă lipsește.
function canRpm(p) { const i = io(p); const v = i.can_rpm != null ? i.can_rpm : (i.can_engine_rpm != null ? i.can_engine_rpm : null); const n = v != null ? parseFloat(v) : NaN; return isFinite(n) ? n : null; } // string-tolerant (valorile CAN pot veni ca string)
// Motor pornit dacă RPM-ul CAN o arată (>300) SAU contactul e ON. RPM se ADAUGĂ ca semnal (prinde
// contactul nesigur), NU înlocuiește — altfel o mașină care trimite can_rpm=0/nesigur ar rămâne nedetectată.
function engineRunning(p) { return canRpm(p) > 300 || ignOn(p); }
// Viteză CAN (dacă există) — folosită doar ca semnal suplimentar; GPS rămâne baza pentru „staționat".
function canSpeed(p) { const i = io(p); return (typeof i.can_vehicle_speed === 'number') ? i.can_vehicle_speed : (typeof i.can_tacho_speed === 'number' ? i.can_tacho_speed : (typeof i.can_wheel_speed === 'number' ? i.can_wheel_speed : null)); }
// Rata de consum la RALANTI (L/h) după tipul mașinii — pentru ESTIMARE, când nu avem consumul real din CAN.
// Un motor mare (camion) arde mult mai mult stând pe loc decât un autoturism.
function idleRate(vtype) {
  const t = String(vtype || '').toLowerCase();
  if (/truck|camion|tir|lorry|tractor|autotractor/.test(t)) return 3.0; // camion
  if (/bus|autobuz|autocar/.test(t)) return 3.0;                        // autobuz
  if (/van|dub|autoutil|furgon|utilitar/.test(t)) return 1.2;          // van / dubă
  return 0.8;                                                           // autoturism (mașină mică) / implicit
}
// Preț carburant — media națională auto (setată din server zilnic) + override pe tip via opts.priceByType.
// Lanț: preț pe VEHICUL (c.price) → preț COMPANIE/efectiv (opts.priceByType[tip]) → media națională AUTO → opts.fuelPrice → 7.5.
let _defaultPrices = {};
function setDefaultFuelPrices(p) { if (p && typeof p === 'object') _defaultPrices = p; }
function _ftKey(ft) { const s = String(ft || '').toLowerCase(); if (/benzin|petrol/.test(s)) return 'benzina'; if (/gpl|lpg|gaz/.test(s)) return 'gpl'; return 'motorina'; }
// Factor CO₂ ars (kg / litru), tank-to-wheel — valori standard DEFRA/EPA pe tip de combustibil.
// Diesel 2.68 · Benzină 2.31 · GPL 1.55. (Diesel ≠ GPL: GPL arde ~1.55, nu 2.68.)
const _CO2_PER_L = { motorina: 2.68, benzina: 2.31, gpl: 1.55 };
function co2For(fuelType, opts) { if (opts && opts.co2Factor) return opts.co2Factor; return _CO2_PER_L[_ftKey(fuelType)] || 2.64; }
function resolvePrice(c, opts) {
  if (c && Number.isFinite(c.price)) return c.price;
  const k = _ftKey(c && c.fuelType), pbt = opts && opts.priceByType;
  if (pbt && Number.isFinite(pbt[k])) return pbt[k];
  if (Number.isFinite(_defaultPrices[k])) return _defaultPrices[k];
  return (opts && opts.fuelPrice) || 7.5;
}

async function history(db, imei, from, to) {
  return db.getDeviceHistory(imei, from, to);
}
async function deviceNames(db, imeis) {
  const map = {};
  try {
    const r = await db.pool.query('SELECT d.imei, d.name, d.plate, d.driver_id, d.group_id, d.vehicle_type, d.fuel_type, d.tank_capacity, d.tank_calibration, d.payload, d.temp_min, d.temp_max, d.consumption_idle, d.odo_base_km, d.odo_base_dev_m, dr.name AS driver_name FROM devices d LEFT JOIN drivers dr ON dr.id = d.driver_id');
    r.rows.forEach(d => map[d.imei] = d);
  } catch (e) {}
  return map;
}
function label(devMap, imei) {
  const d = devMap[imei]; if (!d) return imei;
  return (d.name || imei) + (d.plate ? ' (' + d.plate + ')' : '');
}

// ─── Segmentare track: opriri + curse ───
function segmentTrack(pts, stopMinSec) {
  const stops = [], trips = [];
  if (pts.length < 2) return { stops, trips };
  const moving = pts.map(p => (p.speed || 0) > IDLE_SPEED);
  // runs consecutive de aceeași stare. Rupe și la un „salt" spațial într-o serie de opriri: dacă între
  // două puncte oprite consecutive sunt >200m, mașina s-a mutat cu aparatul tăcut (deplasare neînregistrată)
  // → sunt DOUĂ parcări diferite, nu una singură lipită greșit la primul punct (fix „oprire falsă la locul greșit").
  const runs = []; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const jumped = !moving[i] && !moving[i-1] && haversineKm(pts[i-1].latitude, pts[i-1].longitude, pts[i].latitude, pts[i].longitude) > 0.2;
    if (moving[i] !== moving[s] || jumped) { runs.push({ moving: moving[s], s, e: i-1 }); s = i; }
  }
  runs.push({ moving: moving[s], s, e: pts.length-1 });

  const tripDist = (a, b) => { let km = 0; for (let i = a+1; i <= b; i++) { const d = haversineKm(pts[i-1].latitude, pts[i-1].longitude, pts[i].latitude, pts[i].longitude); if (d < MAX_STEP_KM) km += d; } return km; };
  const closeTrip = (trip, endIdx) => {
    const a = trip.startIdx, b = endIdx;
    if (b <= a) return;
    const durSec = (t(pts[b]) - t(pts[a])) / 1000;
    if (durSec < 60) return;
    const km = tripDist(a, b);
    if (km < 0.2) return;
    let maxSpeed = 0, sumSpeed = 0, cnt = 0;
    for (let i = a; i <= b; i++) { const sp = pts[i].speed || 0; if (sp > maxSpeed) maxSpeed = sp; if (sp > IDLE_SPEED) { sumSpeed += sp; cnt++; } }
    trips.push({
      start: pts[a].timestamp, end: pts[b].timestamp, durationSec: durSec,
      distanceKm: Math.round(km * 100) / 100, maxSpeed, avgSpeed: cnt ? Math.round(sumSpeed/cnt) : 0,
      startP: pts[a], endP: pts[b]
    });
  };

  let trip = null;
  for (const run of runs) {
    const durSec = (t(pts[run.e]) - t(pts[run.s])) / 1000;
    if (!run.moving && durSec >= stopMinSec) {
      if (trip) { closeTrip(trip, run.s); trip = null; }
      stops.push({ start: pts[run.s].timestamp, end: pts[run.e].timestamp, durationSec: durSec, p: pts[run.s] });
    } else {
      if (!trip) trip = { startIdx: run.s };
      trip.endIdx = run.e;
    }
  }
  if (trip) closeTrip(trip, trip.endIdx);
  return { stops, trips };
}

// ─── Helpers grafice (charts pentru rapoarte) ───
// Contract: un raport poate întoarce `charts: [{ type, title, labels, datasets:[{label,data}] }]`.
// Frontend-ul (renderReport) le desenează cu Chart.js și aplică paleta automat.
function _dayKeyISO(ts) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date(ts)); } catch (e) { return ''; } } // YYYY-MM-DD în fusul afișat (nu UTC) → atribuire corectă a zilei lângă miezul nopții
function _dayLabel(isoKey) { const p = String(isoKey).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : isoKey; }
function _dayLabelFull(isoKey) { const p = String(isoKey).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : isoKey; } // YYYY-MM-DD → DD.MM.YYYY
// Listă compactă de zile (chei sortate „YYYY-MM-DD") → grupează zilele CONSECUTIVE în intervale: „01–05.07.2026, 08.07.2026".
function _fmtDayRanges(keys) {
  if (!keys || !keys.length) return '';
  const a = keys.map(k => { const q = k.split('-').map(Number); return { y: q[0], m: q[1], d: q[2], ms: Date.UTC(q[0], q[1] - 1, q[2]) }; });
  const g = []; let s = a[0], p = a[0];
  for (let i = 1; i < a.length; i++) { if (a[i].ms - p.ms === 86400000) p = a[i]; else { g.push([s, p]); s = p = a[i]; } }
  g.push([s, p]);
  const z = n => String(n).padStart(2, '0');
  return g.map(([x, y]) => {
    if (x.ms === y.ms) return z(x.d) + '.' + z(x.m) + '.' + x.y;                                  // o singură zi
    if (x.y === y.y && x.m === y.m) return z(x.d) + '–' + z(y.d) + '.' + z(y.m) + '.' + y.y;        // 01–05.07.2026
    if (x.y === y.y) return z(x.d) + '.' + z(x.m) + '–' + z(y.d) + '.' + z(y.m) + '.' + y.y;         // 28.06–02.07.2026
    return z(x.d) + '.' + z(x.m) + '.' + x.y + '–' + z(y.d) + '.' + z(y.m) + '.' + y.y;              // peste an
  }).join(', ');
}
// Grupează pe zi: items[], getTs(item)=timestamp, getVal(item)=valoare numerică (null ⇒ numără). Sortat cronologic.
function _groupByDay(items, getTs, getVal) {
  const m = {};
  for (const it of items) { const k = _dayKeyISO(getTs(it)); if (!k) continue; m[k] = (m[k] || 0) + (getVal ? (Number(getVal(it)) || 0) : 1); }
  const keys = Object.keys(m).sort();
  return { labels: keys.map(_dayLabel), data: keys.map(k => Math.round(m[k] * 10) / 10) };
}
// Histogramă: vals=numere, edges=[50,70,90,110] ⇒ intervale <50, 50–70, 70–90, 90–110, ≥110.
function _histogram(vals, edges) {
  const buckets = new Array(edges.length + 1).fill(0);
  for (const v of vals) { let i = edges.findIndex(e => v < e); if (i === -1) i = edges.length; buckets[i]++; }
  const labels = edges.map((e, i) => i === 0 ? '<' + e : edges[i - 1] + '–' + e); labels.push('≥' + edges[edges.length - 1]);
  return { labels, data: buckets };
}
// Top N după valoare: pairs=[[label,val],...] ⇒ {labels,data} descrescător, primele n.
function _topN(pairs, n) {
  const s = pairs.slice().sort((a, b) => b[1] - a[1]).slice(0, n || 10);
  return { labels: s.map(p => p[0]), data: s.map(p => Math.round(p[1] * 10) / 10) };
}

// ─── Rapoarte ───

// Graficele pentru Foaie de parcurs dintr-un set de curse (folosit pt. toată flota ȘI per vehicul).
function _tripCharts(trips) {
  if (!trips || !trips.length) return [];
  const kmDay = _groupByDay(trips, x => x.start, x => x.distanceKm);
  const nDay = _groupByDay(trips, x => x.start, null);
  const spd = _histogram(trips.map(x => x.maxSpeed), [50, 70, 90, 110]);
  return [
    { type: 'bar',  title: 'Distanță parcursă pe zi (km)',    labels: kmDay.labels, datasets: [{ label: 'km', data: kmDay.data }] },
    { type: 'line', title: 'Curse pe zi',                     labels: nDay.labels,  datasets: [{ label: 'curse', data: nDay.data }] },
    { type: 'bar',  title: 'Distribuție viteză maximă (km/h)', labels: spd.labels,   datasets: [{ label: 'curse', data: spd.data }] }
  ];
}

// perVehicle GENERIC pentru orice raport cu prima coloană „Vehicul" și mai multe rânduri/mașină
// (selector online + sheet/mașină în Excel). Sumar minim: nr. de înregistrări (corect indiferent de raport).
function _genericPerVehicle(result) {
  const cols = result.columns || [], rows = result.rows || [];
  if (!cols.length || String(cols[0]).trim().toLowerCase() !== 'vehicul') return null;
  const groups = {}, order = [];
  for (const r of rows) { const k = String(r[0]); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); }
  if (order.length < 2) return null;            // un singur vehicul → fără selector
  if (rows.length <= order.length) return null; // ~1 rând/vehicul (ex. Costuri/Consum) → inutil
  return order.sort((a, b) => a.localeCompare(b)).map(name => ({
    vehicul: name, summary: [['Înregistrări', groups[name].length]], rows: groups[name]
  }));
}
// Adaugă automat coloana „Șofer" (imediat după „Vehicul") la ORICE raport care începe cu coloana „Vehicul".
// Un singur loc → toate rapoartele despre mașini primesc șoferul alocat, fără să edităm fiecare raport.
function _injectDriverColumn(result, imeis, devMap) {
  const cols = result.columns;
  if (!Array.isArray(cols) || !cols.length || String(cols[0]).trim().toLowerCase() !== 'vehicul') return;
  if (String(cols[1] || '').trim().toLowerCase() === 'șofer') return; // idempotent (nu dubla)
  const l2d = {};
  for (const imei of imeis) { const d = devMap[imei]; if (d) l2d[label(devMap, imei)] = (d.driver_name || '—'); }
  const drv = r => (l2d[String(r && r[0])] || '—');
  result.columns = [cols[0], 'Șofer'].concat(cols.slice(1));
  if (Array.isArray(result.rows)) result.rows = result.rows.map(r => [r[0], drv(r)].concat(r.slice(1)));
  if (Array.isArray(result.perVehicle)) {
    result.perVehicle.forEach(v => {
      if (Array.isArray(v.rows)) v.rows = v.rows.map(r => [r[0], drv(r)].concat(r.slice(1)));
      if (Array.isArray(v.summary)) v.summary = [['Șofer', (l2d[String(v.vehicul)] || '—')]].concat(v.summary);
    });
  }
  if (Array.isArray(result.summaryTotals)) result.summaryTotals = [''].concat(result.summaryTotals); // rândul TOTAL: aliniază cu coloana „Șofer" adăugată în tabelul Sumar
}

async function rTrips(db, imeis, from, to, opts, devMap) { // Foaie de parcurs
  let totalKm = 0, totalDur = 0, count = 0; const all = []; const tripList = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const { trips } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    for (const tr of trips) { tripList.push({ imei, tr }); all.push(tr); totalKm += tr.distanceKm; totalDur += tr.durationSec; count++; }
  }
  // Pre-încarcă adresele (plecare + sosire) în cache; fallback pe coordonate dacă geocoderul (Nominatim ~1/s) nu apucă.
  if (geocode && geocode.warm && tripList.length) {
    const coords = [];
    for (const { tr } of tripList) { if (tr.startP) coords.push({ lat: tr.startP.latitude, lng: tr.startP.longitude }); if (tr.endP) coords.push({ lat: tr.endP.latitude, lng: tr.endP.longitude }); }
    try { await geocode.warm(coords, { maxUnique: 100, budgetMs: imeis.length <= 1 ? 14000 : 6000 }); } catch (e) {}
  }
  const rows = tripList.map(({ imei, tr }) => {
    let ks = odo(tr.startP), ke = odo(tr.endP);
    // Validare anti-zgomot a odometrului CAN, robustă pt. CAN curat:
    //  - monotonic (ke >= ks) și pozitiv;
    //  - diferența start→sosire e în jurul distanței GPS, dar PERMITE odometru mai mare (GPS subestimează la
    //    eșantionare rară): jos ≈ ½·dist, sus ≈ 3·dist; respinge doar paraziții (×10…×1000, cifre în plus).
    // După ce CAN-ul e reparat (odometru curat, crescător), valorile bune trec și se corelează corect.
    const dist = tr.distanceKm, delta = (ks != null && ke != null) ? (ke - ks) : NaN;
    const okKm = ks != null && ke != null && ks > 0 && ke >= ks && delta <= dist * 3 + 5 && delta >= dist * 0.5 - 2;
    if (!okKm) { ks = null; ke = null; }
    return [ label(devMap, imei), fmtTs(tr.start), addr(tr.startP), fmtTs(tr.end), addr(tr.endP), fmtDur(tr.durationSec), dist.toFixed(2),
      ks != null ? ks : '—', ke != null ? ke : '—', tr.avgSpeed, tr.maxSpeed ];
  });
  // Date structurate pe vehicul (pt. export Excel: sheet „Sumar" + un sheet per mașină).
  const byImei = {};
  tripList.forEach(({ imei, tr }, i) => {
    if (!byImei[imei]) byImei[imei] = { name: label(devMap, imei), trips: [], rows: [] };
    byImei[imei].trips.push(tr); byImei[imei].rows.push(rows[i]);
  });
  const perVehicle = Object.keys(byImei).map(imei => {
    const v = byImei[imei];
    const trips = v.trips.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
    const tKm = trips.reduce((s, t) => s + t.distanceKm, 0);
    const f = trips[0], l = trips[trips.length - 1];
    // Index start/stop (odometru) pe toată perioada, cu aceeași validare (corelare cu distanța totală).
    let kmStart = odo(f.startP), kmEnd = odo(l.endP);
    if (!(kmStart != null && kmEnd != null && kmStart > 0 && kmEnd >= kmStart && (kmEnd - kmStart) <= tKm * 3 + 5 && (kmEnd - kmStart) >= tKm * 0.5 - 2)) { kmStart = null; kmEnd = null; }
    return {
      vehicul: v.name,
      summary: [['Prima plecare', fmtTs(f.start)], ['Ultima sosire', fmtTs(l.end)], ['Km totali', Math.round(tKm * 10) / 10], ['Km plecare', kmStart != null ? kmStart : '—'], ['Km sosire', kmEnd != null ? kmEnd : '—'], ['Curse', trips.length]],
      rows: v.rows, charts: _tripCharts(trips)
    };
  }).sort((a, b) => String(a.vehicul).localeCompare(String(b.vehicul)));
  const charts = _tripCharts(all);
  return { columns: ['Vehicul','Plecare','Loc. plecare','Sosire','Loc. sosire','Durată','Distanță (km)','Km plecare','Km sosire','Vit. medie','Vit. max'],
    rows, summary: { 'Curse': count, 'Distanță totală (km)': Math.round(totalKm*10)/10, 'Durată totală': fmtDur(totalDur) }, charts, perVehicle };
}

async function rStops(db, imeis, from, to, opts, devMap) { // Opriri / staționări
  const fromMs = new Date(from).getTime();
  // Caută cu 24h ÎNAINTE de interval: o parcare începută seara dinainte primește ora REALĂ de sosire,
  // nu „primul ping din zi" (fix: „a ajuns la 00:51" era de fapt primul semnal, nu sosirea).
  const lookFrom = new Date(fromMs - 24 * 3600 * 1000).toISOString();
  const items = []; let total = 0, totalDur = 0; const all = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, lookFrom, to);
    const { stops } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    for (const st of stops) {
      if (new Date(st.end).getTime() < fromMs) continue;   // oprire terminată complet înainte de interval → nu ne interesează
      items.push({ imei, st });
      total++; totalDur += st.durationSec; all.push(st);
      const nm = label(devMap, imei);
      const pv = perVeh[nm] || (perVeh[nm] = { n: 0, dur: 0, max: 0 });
      pv.n++; pv.dur += st.durationSec; if (st.durationSec > pv.max) pv.max = st.durationSec;
    }
  }
  // Pre-încarcă adresele opririlor în cache (ca la Foaie de parcurs) → coloana „Locație" = ADRESE, nu coordonate.
  // Locațiile care se repetă (ex. sediul) se deduplică; ce nu apucă în buget rămâne pe coordonate (fallback).
  if (geocode && geocode.warm && items.length) {
    try { await geocode.warm(items.map(x => ({ lat: x.st.p.latitude, lng: x.st.p.longitude })), { maxUnique: 150, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {}
  }
  const rows = items.map(({ imei, st }) => [ label(devMap, imei), fmtTs(st.start), fmtTs(st.end), fmtDur(st.durationSec), addr(st.p) ]);
  // Sumar PE VEHICUL cu sens (Excel „Sumar" + online): Opriri / Timp staționat / Cea mai lungă — nu generic „Înregistrări".
  const names = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (names.length >= 2) {
    const byName = {}, stopsByName = {};
    items.forEach(({ imei, st }, i) => { const nm = label(devMap, imei); (byName[nm] || (byName[nm] = [])).push(rows[i]); (stopsByName[nm] || (stopsByName[nm] = [])).push(st); });
    perVehicle = names.map(nm => {
      const st = stopsByName[nm] || [], nD = _groupByDay(st, x => x.start, null), dr = _histogram(st.map(x => x.durationSec / 60), [15, 30, 60, 120]);
      return {
        vehicul: nm,
        summary: [['Opriri', perVeh[nm].n], ['Timp staționat', fmtDur(perVeh[nm].dur)], ['Cea mai lungă', fmtDur(perVeh[nm].max)]],
        rows: byName[nm] || [],
        charts: st.length ? [ // grafice INDIVIDUALE (la selecția vehiculului)
          { type: 'bar', title: 'Opriri pe zi', labels: nD.labels, datasets: [{ label: 'opriri', data: nD.data }] },
          { type: 'bar', title: 'Distribuție durată oprire (min)', labels: dr.labels, datasets: [{ label: 'opriri', data: dr.data }] }
        ] : []
      };
    });
  }
  const nDay = _groupByDay(all, x => x.start, null);
  const dur = _histogram(all.map(x => x.durationSec / 60), [15, 30, 60, 120]);
  const topV = _topN(names.map(nm => [nm, perVeh[nm].n]), 10);
  const charts = all.length ? [
    { type: 'bar',      title: 'Opriri pe zi',                       labels: nDay.labels, datasets: [{ label: 'opriri', data: nDay.data }] },
    { type: 'bar',      title: 'Distribuție durată oprire (min)',    labels: dur.labels,  datasets: [{ label: 'opriri', data: dur.data }] },
    { type: 'doughnut', title: 'Top vehicule după număr de opriri',  labels: topV.labels, datasets: [{ label: 'opriri', data: topV.data }] }
  ] : [];
  return { columns: ['Vehicul','Început','Sfârșit','Durată','Locație'], rows,
    summary: { 'Opriri': total, 'Timp staționat total': fmtDur(totalDur) }, charts, perVehicle };
}

// Legenda modului „Limite reale (OSM)" — sursă, toleranță și atribuirea ODbL (obligatorie la afișarea datelor OpenStreetMap).
function _speedingOsmLegend(skipped, osmOver) {
  const items = [
    ['Limită drum', 'Limita reală a fiecărui drum, citită din OpenStreetMap (unde lipsește tag-ul, e estimată din tipul drumului).'],
    ['Depășire', 'Viteza a depășit limita drumului cu peste 3 km/h (toleranță pentru zgomotul GPS), grupată în evenimente ca pe hartă.']
  ];
  if (osmOver > 0) items.push(['Prag afișare', 'Arătăm DOAR depășirile de peste +' + osmOver + ' km/h față de limita fiecărui drum — la fel pe orice drum (50, 70, 90...). Așa 75 pe un drum de 70 (doar +5) nu apare, dar 72 pe unul de 50 (+22), da. Reglabil din „Afișează depășirile".']);
  items.push(['© OpenStreetMap contributors', 'Limitele de viteză provin din OpenStreetMap, sub licența ODbL.']);
  if (skipped && skipped.length) items.push(['Vehicule sărite (neanalizate)', skipped.map(s => s.nm + ' — ' + s.reason).join('; ') + '. Apar și în tabel cu „Neanalizat".']);
  return { title: 'Limite reale (OpenStreetMap) — cum se citesc', items };
}

async function rSpeeding(db, imeis, from, to, opts, devMap) { // Depășiri viteză
  const useOsm = !!opts.osm && roadlimits && roadlimits.limitsForPoints; // „Limite reale": compară cu limita reală a fiecărui drum (OSM), nu cu un prag fix
  const limit = opts.limit || 90;   // mod clasic: prag fix pentru toată flota (implicit 90, reglabil din formular)
  const osmOver = useOsm ? (opts.osmOver || 0) : 0; // OSM: prag RELATIV — arătăm doar depășirile de peste atât peste limita drumului (universal, indiferent de drum: 75 pe 70 = +5 mărunt, 72 pe 50 = +22 real)
  const OSM_MAX_VEH = 25;           // plafon interogări OSM per rulare — protejează serviciul gratuit Overpass de supraîncărcare
  const GAP_MS = 3 * 60 * 1000;     // rupe evenimentul la pauze GPS >3 min (ca pe hartă) — nu lega puncte îndepărtate în timp
  const rows = []; let events = 0, maxSpeed = 0, maxOver = 0; const evs = []; const evPts = []; const perVeh = {};
  const skipped = []; let osmOk = 0, osmTried = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    let lims = null;
    if (useOsm) {
      if (pts.length < 2) continue;
      if (osmTried >= OSM_MAX_VEH) { skipped.push({ nm, reason: 'plafon OSM/rulare (restrânge selecția)' }); continue; }
      osmTried++;
      try { const rl = await roadlimits.limitsForPoints(pts.map(p => [p.latitude, p.longitude])); lims = rl.limits; osmOk++; }
      catch (e) { skipped.push({ nm, reason: (e && e.code === 'AREA') ? 'traseu prea întins (restrânge perioada la o zi)' : 'OSM indisponibil momentan' }); continue; }
    }
    let ev = null;
    const flush = () => {
      if (!ev) return;
      if (osmOver > 0 && ev.over <= osmOver) { ev = null; return; } // depășire prea mică față de limita drumului → filtrată (nu o arătăm)
      const durSec = Math.max(0, (ev.endMs - ev.startMs) / 1000);
      rows.push([ nm, fmtTs(ev.start), fmtDur(durSec), ev.lim, Math.round(ev.max), loc(ev.p) ]);
      events++; if (ev.max > maxSpeed) maxSpeed = ev.max; if (ev.over > maxOver) maxOver = ev.over;
      evs.push({ start: ev.start, max: ev.max, over: ev.over, nm }); evPts.push(ev.p);
      perVeh[nm] = (perVeh[nm] || 0) + 1; ev = null;
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], sp = p.speed || 0;
      let thr, roadLim;
      if (useOsm) { const lm = lims[i]; if (typeof lm !== 'number') { flush(); continue; } roadLim = lm; thr = lm + 3; } // fără limită OSM aici → nu judecăm
      else { roadLim = limit; thr = limit; }
      if (useOsm && i > 0 && (t(p) - t(pts[i - 1])) > GAP_MS) flush(); // pauză GPS → eveniment nou
      if (sp > thr) {
        const over = sp - roadLim;
        if (!ev) ev = { start: p.timestamp, startMs: t(p), max: sp, over, lim: roadLim, p };
        else { if (sp > ev.max) { ev.max = sp; ev.p = p; } if (over > ev.over) ev.over = over; if (roadLim < ev.lim) ev.lim = roadLim; }
        ev.end = p.timestamp; ev.endMs = t(p);
      } else flush();
    }
    flush();
  }
  // Adrese exacte în loc de coordonate (ca la restul rapoartelor): pre-încarcă adresele evenimentelor, fallback pe coordonate + completare progresivă pe client.
  if (geocode && geocode.warm && evPts.length) {
    try { await geocode.warm(evPts.map(p => ({ lat: p.latitude, lng: p.longitude })), { maxUnique: 300, budgetMs: opts.geoBudgetMs || (imeis.length <= 1 ? 14000 : 8000) }); } catch (e) {}
  }
  rows.forEach((r, i) => { if (evPts[i]) r[5] = addr(evPts[i]); }); // Locație e col. 5
  // Mașinile care NU au putut fi analizate apar EXPLICIT în tabel — ca să nu fie confundate cu cele „curate" (verificate, fără depășiri).
  skipped.forEach(s => rows.push([ s.nm, '—', '—', '—', '—', 'Neanalizat — ' + s.reason ]));
  const nDay = _groupByDay(evs, x => x.start, null);
  const buckets = useOsm ? [30, 50] : [limit + 10, limit + 20, limit + 35]; // OSM: cu cât s-a depășit (trepte ca pe hartă); clasic: viteză absolută
  const spdTitle = useOsm ? 'Cât s-a depășit limita reală (km/h)' : 'Distribuție viteză depășire (km/h)';
  const spd = _histogram(evs.map(x => useOsm ? x.over : x.max), buckets);
  const topV = _topN(Object.entries(perVeh), 10);
  const charts = evs.length ? [
    { type: 'bar',      title: 'Depășiri pe zi', labels: nDay.labels, datasets: [{ label: 'depășiri', data: nDay.data }] },
    { type: 'bar',      title: spdTitle,         labels: spd.labels,  datasets: [{ label: 'depășiri', data: spd.data }] },
    { type: 'doughnut', title: 'Top vehicule după depășiri', labels: topV.labels, datasets: [{ label: 'depășiri', data: topV.data }] }
  ] : [];
  const evNames = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (evNames.length + skipped.length >= 2) {
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    const evEntries = evNames.map(nm => {
      const ve = evs.filter(e => e.nm === nm), nD = _groupByDay(ve, x => x.start, null), sD = _histogram(ve.map(x => useOsm ? x.over : x.max), buckets);
      return {
        vehicul: nm,
        summary: [['Depășiri', perVeh[nm]], [useOsm ? 'Max peste limită' : 'Viteză max', ve.length ? Math.round(Math.max.apply(null, ve.map(e => useOsm ? e.over : e.max))) : 0]],
        rows: rowsByName[nm] || [],
        charts: ve.length ? [
          { type: 'bar', title: 'Depășiri pe zi', labels: nD.labels, datasets: [{ label: 'depășiri', data: nD.data }] },
          { type: 'bar', title: spdTitle, labels: sD.labels, datasets: [{ label: 'depășiri', data: sD.data }] }
        ] : []
      };
    });
    // Mașinile sărite: aceleași chei de sumar (→ tabelul „Sumar" rămâne aliniat), marcate „neanalizat", cu motivul pe foaia proprie.
    const skipEntries = skipped.map(s => ({
      vehicul: s.nm,
      summary: [['Depășiri', 'neanalizat'], [useOsm ? 'Max peste limită' : 'Viteză max', '—']],
      rows: rowsByName[String(s.nm)] || [],
      charts: []
    }));
    perVehicle = evEntries.concat(skipEntries);
  }
  const columns = ['Vehicul', 'Data', 'Durată', useOsm ? 'Limită drum (km/h)' : 'Limită (km/h)', 'Viteză max (km/h)', 'Locație'];
  const summary = useOsm
    ? { 'Depășiri (vs. limită reală)': events, 'Max peste limită (km/h)': Math.round(maxOver), 'Vehicule verificate': osmOk }
    : { 'Depășiri': events, 'Viteză maximă (km/h)': Math.round(maxSpeed), 'Limită folosită': limit };
  if (useOsm && osmOver > 0) summary['Doar depășiri peste'] = '+' + osmOver + ' km/h';
  if (useOsm && skipped.length) summary['Vehicule sărite'] = skipped.length;
  const result = { columns, rows, summary, charts, perVehicle, summarySheet: true, noFleetTotal: true }; // fără rând TOTAL — ar dubla KPI-urile din capul foii Sumar
  if (useOsm) result.legend = _speedingOsmLegend(skipped, osmOver);
  return result;
}

// Etichete afișate pt. tipul de combustibil (valorile din fișă vin fără diacritice: „Motorina", „Benzina", …).
const _FUEL_LABEL = { motorina: 'Motorină', diesel: 'Motorină', benzina: 'Benzină', 'benzină': 'Benzină', gpl: 'GPL', electric: 'Electric', hibrid: 'Hibrid', altul: 'Altul' };
async function rFuel(db, imeis, from, to, opts, devMap) { // Alimentări & scăderi/furt
  const refuelMin = opts.refuelMin || 5, dropMin = opts.dropMin || 10;
  const rows = []; let refuels = 0, drops = 0, addedL = 0, lostL = 0; const refs = []; const evPts = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    const _ft = devMap[imei] && devMap[imei].fuel_type; // tipul de combustibil din fișa vehiculului (CAN nu-l transmite)
    const ftL = _ft ? (_FUEL_LABEL[String(_ft).toLowerCase()] || _ft) : '—';
    const pv = perVeh[nm] || (perVeh[nm] = { refuels: 0, drops: 0, added: 0, lost: 0, refs: [] });
    let prev = null;
    for (const p of pts) {
      const fl = fuelL(p);
      if (fl == null) continue;
      // Gardă de timp: realimentarea se ia doar din citiri apropiate (<1h). Scăderea e suspectă și peste noapte
      // DACĂ motorul a stat STINS (parcat → nu e consum); cu motorul pornit păstrăm garda de 1h (altfel consumul
      // normal de peste mai multe ore ar apărea ca o „scădere/furt").
      if (prev != null) {
        const delta = fl - prev.v, gapH = (t(p) - prev.ts) / 3600000, ign = ignOn(p) || ignOn(prev.p);
        if (delta >= refuelMin && gapH <= 1) { rows.push([ nm, fmtTs(p.timestamp), 'Alimentare', ftL, +delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); evPts.push(p); refuels++; addedL += delta; refs.push({ ts: p.timestamp, v: delta }); pv.refuels++; pv.added += delta; pv.refs.push({ ts: p.timestamp, v: delta }); }
        else if (delta <= -dropMin && ((!ign && gapH <= 72) || (ign && gapH <= 1))) { rows.push([ nm, fmtTs(p.timestamp), 'Scădere/furt', ftL, +delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); evPts.push(p); drops++; lostL += -delta; pv.drops++; pv.lost += -delta; }
      }
      prev = { v: fl, ts: t(p), p };
    }
  }
  // Adrese exacte în loc de coordonate: pre-încarcă adresele evenimentelor (sparse → puține), fallback pe coordonate
  // + completare progresivă pe client. Umplem în loc (rândurile din perVehicle sunt aceleași referințe → primesc și ele adresa).
  if (geocode && geocode.warm && evPts.length) {
    try { await geocode.warm(evPts.map(p => ({ lat: p.latitude, lng: p.longitude })), { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {}
  }
  rows.forEach((r, i) => { if (evPts[i]) r[6] = addr(evPts[i]); }); // Locație e acum col. 6 (după adăugarea „Combustibil")
  const refDay = _groupByDay(refs, x => x.ts, x => x.v);
  const charts = (refuels || drops) ? [
    { type: 'doughnut', title: 'Alimentări vs. scăderi suspecte', labels: ['Alimentări', 'Scăderi suspecte'], datasets: [{ label: 'evenimente', data: [refuels, drops] }] },
    { type: 'bar',      title: 'Litri alimentați pe zi',          labels: refDay.labels, datasets: [{ label: 'L', data: refDay.data }] }
  ] : [];
  const fNames = Object.keys(perVeh).filter(nm => perVeh[nm].refuels || perVeh[nm].drops).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (fNames.length >= 2) {
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    perVehicle = fNames.map(nm => {
      const pv = perVeh[nm], rD = _groupByDay(pv.refs, x => x.ts, x => x.v);
      return {
        vehicul: nm,
        summary: [['Alimentări', pv.refuels], ['Litri alimentați', Math.round(pv.added)], ['Scăderi suspecte', pv.drops], ['Litri scăzuți', Math.round(pv.lost)]],
        rows: rowsByName[nm] || [],
        charts: [
          { type: 'doughnut', title: 'Alimentări vs. scăderi suspecte', labels: ['Alimentări', 'Scăderi suspecte'], datasets: [{ label: 'evenimente', data: [pv.refuels, pv.drops] }] },
          { type: 'bar', title: 'Litri alimentați pe zi', labels: rD.labels, datasets: [{ label: 'L', data: rD.data }] }
        ]
      };
    });
  }
  const vehRefueled = Object.values(perVeh).filter(v => v.refuels > 0).length; // câte MAȘINI au fost alimentate în perioadă
  return { columns: ['Vehicul','Data','Eveniment','Combustibil','Δ Litri','Nivel (L)','Locație'], rows,
    summary: { 'Vehicule alimentate': vehRefueled, 'Alimentări': refuels, 'Litri alimentați': Math.round(addedL), 'Scăderi suspecte': drops, 'Litri scăzuți': Math.round(lostL) }, charts, perVehicle, summarySheet: true };
}

function pointInPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function insideZone(lat, lng, zone) {
  if (zone.type === 'circle') {
    if (!Array.isArray(zone.center) || zone.center.length < 2 || !(zone.radius > 0)) return false; // zonă circulară malformată → ignoră (nu arunca → nu pică tot raportul)
    return haversineKm(lat, lng, zone.center[0], zone.center[1]) * 1000 <= zone.radius;
  }
  return Array.isArray(zone.coords) && pointInPolygon(lat, lng, zone.coords);
}
// Detectează vizite (intrare→ieșire) ale unui vehicul într-o zonă
function zoneVisits(pts, zone) {
  const visits = []; let cur = null;
  for (const p of pts) {
    const inside = insideZone(p.latitude, p.longitude, zone);
    if (inside && !cur) cur = { enter: p.timestamp, last: p.timestamp };
    else if (inside && cur) cur.last = p.timestamp;
    else if (!inside && cur) { visits.push({ enter: cur.enter, exit: cur.last, durationSec: (new Date(cur.last)-new Date(cur.enter))/1000 }); cur = null; }
  }
  if (cur) visits.push({ enter: cur.enter, exit: cur.last, durationSec: (new Date(cur.last)-new Date(cur.enter))/1000 });
  return visits;
}

async function rGeofence(db, imeis, from, to, opts, devMap, companyId) { // Vizite în zone (geofence)
  // Tenant: doar zonele companiei solicitantului (companyId null = super-admin → toate, by design).
  const gfs = await db.getGeofences(companyId);
  const zones = gfs.map(g => {
    const c = typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : g.coordinates;
    return { name: g.name, type: g.type, center: c && c.center, radius: c && c.radius, coords: Array.isArray(c) ? c : null };
  });
  const minSec = (opts.zoneMin || 0) * 60; // ignoră vizitele mai scurte (trecere pe lângă marginea zonei / zgomot GPS)
  const rows = []; let total = 0, totalDwell = 0; const all = []; const visByZone = {}, dwellByZone = {}; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    for (const z of zones) {
      const visits = zoneVisits(pts, z);
      for (const v of visits) {
        if (v.durationSec < minSec) continue; // sub pragul de durată → nu o socotim vizită
        rows.push([ nm, z.name, fmtTs(v.enter), fmtTs(v.exit), fmtDur(v.durationSec) ]); total++; totalDwell += v.durationSec; all.push(v);
        visByZone[z.name] = (visByZone[z.name] || 0) + 1; dwellByZone[z.name] = (dwellByZone[z.name] || 0) + v.durationSec;
        const pv = perVeh[nm] || (perVeh[nm] = { visits: [], visZ: {}, dwellZ: {}, total: 0, dwell: 0 });
        pv.visits.push(v); pv.total++; pv.dwell += v.durationSec; pv.visZ[z.name] = (pv.visZ[z.name] || 0) + 1; pv.dwellZ[z.name] = (pv.dwellZ[z.name] || 0) + v.durationSec;
      }
    }
  }
  const zVisits = _topN(Object.entries(visByZone), 10);
  const zDwell = _topN(Object.entries(dwellByZone).map(([n, s]) => [n, s / 60]), 10);
  const nDay = _groupByDay(all, x => x.enter, null);
  const charts = all.length ? [
    { type: 'doughnut', title: 'Vizite pe zonă',              labels: zVisits.labels, datasets: [{ label: 'vizite', data: zVisits.data }] },
    { type: 'bar',      title: 'Timp petrecut pe zonă (min)',  labels: zDwell.labels,  datasets: [{ label: 'minute', data: zDwell.data }] },
    { type: 'line',     title: 'Vizite pe zi',                labels: nDay.labels,    datasets: [{ label: 'vizite', data: nDay.data }] }
  ] : [];
  const gNames = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (gNames.length >= 2) {
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    perVehicle = gNames.map(nm => {
      const pv = perVeh[nm], zV = _topN(Object.entries(pv.visZ), 10), zD = _topN(Object.entries(pv.dwellZ).map(([n, s]) => [n, s / 60]), 10), nD = _groupByDay(pv.visits, x => x.enter, null);
      return {
        vehicul: nm,
        summary: [['Vizite', pv.total], ['Timp în zone', fmtDur(pv.dwell)]],
        rows: rowsByName[nm] || [],
        charts: [
          { type: 'doughnut', title: 'Vizite pe zonă', labels: zV.labels, datasets: [{ label: 'vizite', data: zV.data }] },
          { type: 'bar', title: 'Timp petrecut pe zonă (min)', labels: zD.labels, datasets: [{ label: 'minute', data: zD.data }] },
          { type: 'line', title: 'Vizite pe zi', labels: nD.labels, datasets: [{ label: 'vizite', data: nD.data }] }
        ]
      };
    });
  }
  // Fără sumar (la cererea userului): nici KPI-uri online, nici foaie „Sumar" în Excel — doar tabelul + graficele + foile per vehicul.
  return { columns: ['Vehicul','Zonă','Intrare','Ieșire','Durată'], rows,
    summary: {}, charts, perVehicle, noSummarySheet: true };
}

// Raport Hotspot: pentru un hotspot (geofence) ales, defalcă timpul fiecărui vehicul în perimetru
// pe 3 stări (în mișcare / ralanti / motor oprit) + ore de funcționare (mișcare+ralanti).
// Pauzele mari între două puncte aflate în zonă (device adormit) = parcat cu motorul oprit în perimetru.
async function rHotspot(db, imeis, from, to, opts, devMap, companyId) {
  const gid = parseInt((opts && opts.geofenceId) || 0);
  const gfs = await db.getGeofences(companyId);
  const g = gid ? (gfs || []).find(x => x.id === gid) : null;
  if (!g) return { columns: ['Vehicul'], rows: [], summary: { 'Atenție': 'Alege un hotspot (zonă) pentru acest raport.' }, charts: [] };
  const c = typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : g.coordinates;
  const zone = { name: g.name, type: g.type, center: c && c.center, radius: c && c.radius, coords: Array.isArray(c) ? c : null };
  const GAP = 1800; // s — pauză peste 30 min între puncte din zonă = device adormit (parcat, motor oprit)

  const rows = [];
  let T_move = 0, T_idle = 0, T_off = 0, T_total = 0, T_visits = 0, T_km = 0, vehs = 0;
  const fleetDay = {};   // dayKey -> secunde totale în perimetru (grafic pe zi)
  const perVehEng = {};  // nume -> ore de funcționare (grafic pe vehicul)
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    if (!pts.length) continue;
    const nm = label(devMap, imei);
    const byDay = {};    // dayKey -> { move, idle, off, km, visits, first, last }
    const D = ts => { const k = _dayKeyISO(ts); return byDay[k] || (byDay[k] = { move: 0, idle: 0, off: 0, km: 0, visits: 0, first: null, last: null }); };
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i];
      if (!insideZone(pr.latitude, pr.longitude, zone) || !insideZone(p.latitude, p.longitude, zone)) continue;
      const dt = (t(p) - t(pr)) / 1000;
      if (dt <= 0) continue;
      const b = D(pr.timestamp); // atribuie intervalul zilei punctului anterior
      const dkm = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); // km parcurși în perimetru
      if (dkm < MAX_STEP_KM) b.km += dkm;
      if (dt > GAP) b.off += dt;                              // pauză = parcat cu motorul oprit în zonă
      else if ((pr.speed || 0) > IDLE_SPEED) b.move += dt;    // în mișcare
      else if (ignOn(pr)) b.idle += dt;                       // ralanti (motor pornit, pe loc)
      else b.off += dt;                                        // motor oprit
    }
    for (const v of zoneVisits(pts, zone)) { // vizitele, atribuite zilei intrării
      const b = D(v.enter); b.visits++;
      if (!b.first || new Date(v.enter) < new Date(b.first)) b.first = v.enter;
      if (!b.last || new Date(v.exit) > new Date(b.last)) b.last = v.exit;
    }
    const dayKeys = Object.keys(byDay).sort();
    if (!dayKeys.length) continue;
    vehs++; let eng = 0;
    for (const k of dayKeys) {
      const b = byDay[k], total = b.move + b.idle + b.off;
      rows.push([ nm, _dayLabelFull(k), fmtDur(total), fmtDur(b.move), fmtDur(b.idle), fmtDur(b.off), fmtDur(b.move + b.idle), b.km.toFixed(1) + ' km', b.visits, fmtTs(b.first), fmtTs(b.last) ]);
      T_move += b.move; T_idle += b.idle; T_off += b.off; T_total += total; T_visits += b.visits; T_km += b.km;
      fleetDay[k] = (fleetDay[k] || 0) + total; eng += b.move + b.idle;
    }
    perVehEng[nm] = (perVehEng[nm] || 0) + eng;
  }
  const dayKeysAll = Object.keys(fleetDay).sort();
  const topV = _topN(Object.entries(perVehEng).map(([n, s]) => [n, Math.round(s / 360) / 10]), 10);
  const charts = rows.length ? [
    { type: 'bar',      title: 'Timp în perimetru pe zi (h)',       labels: dayKeysAll.map(_dayLabel), datasets: [{ label: 'ore', data: dayKeysAll.map(k => Math.round(fleetDay[k] / 360) / 10) }] },
    { type: 'doughnut', title: 'Timp pe stări (în perimetru)',      labels: ['În mișcare', 'Ralanti', 'Motor oprit'], datasets: [{ label: 'min', data: [Math.round(T_move / 60), Math.round(T_idle / 60), Math.round(T_off / 60)] }] },
    { type: 'bar',      title: 'Ore de funcționare pe vehicul (h)', labels: topV.labels, datasets: [{ label: 'ore', data: topV.data }] }
  ] : [];
  return {
    columns: ['Vehicul', 'Zi', 'Timp în perimetru', 'În mișcare', 'Ralanti', 'Motor oprit', 'Ore funcționare', 'Km parcurși', 'Vizite', 'Prima intrare', 'Ultima ieșire'],
    rows,
    summary: {
      'Hotspot': g.name,
      'Vehicule în perimetru': vehs,
      'Zile cu activitate': dayKeysAll.length,
      'Timp total în perimetru': fmtDur(T_total),
      'În mișcare': fmtDur(T_move),
      'Ralanti': fmtDur(T_idle),
      'Motor oprit': fmtDur(T_off),
      'Ore de funcționare': fmtDur(T_move + T_idle),
      'Km parcurși': T_km.toFixed(1) + ' km',
      'Vizite totale': T_visits
    },
    charts, summarySheet: true, noPerVehicle: true // sumar pe foaie separată; un singur tabel cu rânduri pe zi (fără split per vehicul)
  };
}

async function rDriver(db, imeis, from, to, opts, devMap) { // Pontaj șofer (per vehicul/zi + sumar HR pe șofer)
  const drv = {}; try { (await db.getDrivers()).forEach(d => drv[d.id] = d.name); } catch (e) {}
  const rows = []; let totalKm = 0, totalDrive = 0, totalWorked = 0; const dayDrive = {}; const byDriver = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const dv = devMap[imei] && devMap[imei].driver_id ? (drv[devMap[imei].driver_id] || '—') : '—';
    const nm = label(devMap, imei);
    const byDay = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], day = _dayKeyISO(p.timestamp);
      const d = byDay[day] || (byDay[day] = { km: 0, drive: 0, firstDep: null, lastArr: null });
      if (i > 0) {
        const pr = pts[i-1], dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
        if (dist < MAX_STEP_KM) d.km += dist;
        const dt = (t(p) - t(pr)) / 1000;
        if (dt > 0 && dt < 3600 && (p.speed || 0) > IDLE_SPEED) d.drive += dt;
      }
    }
    // Prima plecare / ultima sosire REALE = prima cursă / ultima cursă din zi (nu primul/ultimul ping)
    const { trips } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    trips.forEach(tr => { const day = _dayKeyISO(tr.start); const d = byDay[day]; if (!d) return; if (d.firstDep == null) d.firstDep = tr.start; d.lastArr = tr.end; });
    for (const day of Object.keys(byDay).sort()) {
      const d = byDay[day];
      // Ore lucrate = tura reală (de la prima plecare la ultima sosire); include pauzele/încărcările din interval — e numărul de pontaj
      const worked = (d.firstDep != null && d.lastArr != null) ? Math.max(0, (new Date(d.lastArr).getTime() - new Date(d.firstDep).getTime()) / 1000) : 0;
      const row = [ dv, nm, day, d.firstDep ? fmtHM(d.firstDep) : '—', d.lastArr ? fmtHM(d.lastArr) : '—', fmtDur(d.drive), d.km.toFixed(1) ];
      rows.push(row);
      totalKm += d.km; totalDrive += d.drive; totalWorked += worked; dayDrive[day] = (dayDrive[day] || 0) + d.drive;
      const b = byDriver[dv] || (byDriver[dv] = { days: new Set(), drive: 0, worked: 0, km: 0, vehicles: new Set(), dd: {}, rows: [] });
      b.days.add(day); b.drive += d.drive; b.worked += worked; b.km += d.km; b.vehicles.add(nm); b.dd[day] = (b.dd[day] || 0) + d.drive; b.rows.push(row);
    }
  }
  const topDrv = _topN(Object.entries(byDriver).map(([n, b]) => [n, b.km]), 10);
  const dayKeys = Object.keys(dayDrive).sort();
  const charts = rows.length ? [
    { type: 'bar', title: 'Km pe șofer',             labels: topDrv.labels,          datasets: [{ label: 'km', data: topDrv.data }] },
    { type: 'bar', title: 'Timp condus pe zi (ore)', labels: dayKeys.map(_dayLabel), datasets: [{ label: 'ore', data: dayKeys.map(k => Math.round(dayDrive[k] / 360) / 10) }] }
  ] : [];
  // Sumar HR pe ȘOFER: zile lucrate / ore lucrate (tura) / ore la volan / km / media pe zi + grafic individual la selecția șoferului
  const dNames = Object.keys(byDriver).sort((a, b) => a.localeCompare(b));
  const totalDays = dNames.reduce((s, n) => s + byDriver[n].days.size, 0);
  let perVehicle;
  if (dNames.length >= 1) { // mereu ≥1 → sumar pe șofer + foaie „Sumar" separată în Excel, chiar și pentru un singur șofer
    perVehicle = dNames.map(dv => {
      const b = byDriver[dv], dks = Object.keys(b.dd).sort();
      return {
        vehicul: dv,
        summary: [
          ['Zile lucrate', b.days.size],
          ['Ore lucrate',  fmtDur(b.worked)],
          ['La volan',     fmtDur(b.drive)],
          ['Km',           Math.round(b.km)],
          ['Media/zi',     b.days.size ? fmtDur(b.worked / b.days.size) : '—']
        ],
        rows: b.rows,
        charts: dks.length ? [{ type: 'bar', title: 'Timp condus pe zi (ore)', labels: dks.map(_dayLabel), datasets: [{ label: 'ore', data: dks.map(k => Math.round(b.dd[k] / 360) / 10) }] }] : []
      };
    });
  }
  return {
    columns: ['Șofer','Vehicul','Zi','Prima activ.','Ultima activ.','Timp condus','Km'], rows,
    summary: { 'Șoferi': dNames.length, 'Zile lucrate': totalDays, 'Ore lucrate': fmtDur(totalWorked), 'La volan': fmtDur(totalDrive), 'Km total': Math.round(totalKm) },
    // TOTAL explicit pt. tabelul „Sumar pe șofer": orele se adună ca durate, Media/zi nu se adună („—") — aliniat la ordinea din summary
    summaryTotals: [ totalDays, fmtDur(totalWorked), fmtDur(totalDrive), Math.round(totalKm), '—' ],
    charts, perVehicle, groupLabel: 'Șofer'
  };
}

// Ore de conducere & repaus (HOS / Reg. CE 561/2006). Sursă: stările tahograf (io 187) + contorul de conducere
// continuă (io 189) dacă vehiculul are tahograf conectat (autoritar); altfel estimare din GPS (mișcare/contact).
// Marchează încălcări: conducere continuă > 4h30 (fără pauză ≥45 min) și conducere zilnică > 9h.
async function rHos(db, imeis, from, to, opts, devMap) {
  const drv = {}; try { (await db.getDrivers()).forEach(d => drv[d.id] = d.name); } catch (e) {}
  const stOf = (p) => { const io = p.io_data || {}; const v = io.tacho_driver1_working_state; return (typeof v === 'number') ? v : null; };
  const contMinOf = (p) => { const io = p.io_data || {}; const v = io.tacho_driver1_continuous_time; return (typeof v === 'number' && v >= 0) ? v : null; };
  const rows = []; let totDrive = 0, totRest = 0, totWork = 0, totInfr = 0; const dayDrive = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    if (pts.length < 2) continue;
    const dvName = devMap[imei] && devMap[imei].driver_id ? (drv[devMap[imei].driver_id] || '—') : '—';
    const useTacho = pts.some((p) => stOf(p) != null);
    const byDay = {}; let contSec = 0, restSec = 0;
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i];
      const dt = (t(p) - t(pr)) / 1000;
      if (!(dt > 0 && dt < 3 * 3600)) { contSec = 0; restSec = 0; continue; }
      const day = _dayKeyISO(pr.timestamp);
      const d = byDay[day] || (byDay[day] = { drive: 0, work: 0, rest: 0, avail: 0, contMax: 0 });
      let kind;
      if (useTacho) { const s = stOf(pr); kind = s === 3 ? 'drive' : s === 2 ? 'work' : s === 1 ? 'avail' : 'rest'; }
      else { kind = (pr.speed || 0) > IDLE_SPEED ? 'drive' : (ignOn(pr) ? 'work' : 'rest'); }
      d[kind] += dt;
      const cm = contMinOf(pr);
      if (cm != null) { if (cm / 60 > d.contMax) d.contMax = cm / 60; }
      else if (kind === 'drive') { contSec += dt; restSec = 0; if (contSec / 3600 > d.contMax) d.contMax = contSec / 3600; }
      else if (kind === 'rest') { restSec += dt; if (restSec >= 45 * 60) contSec = 0; }
    }
    for (const day of Object.keys(byDay).sort()) {
      const d = byDay[day]; const infr = [];
      if (d.contMax > 4.5) infr.push('continuă ' + fmtDur(d.contMax * 3600));
      if (d.drive / 3600 > 9) infr.push('zilnic ' + fmtDur(d.drive));
      rows.push([dvName, label(devMap, imei), day, fmtDur(d.drive), fmtDur(d.work), fmtDur(d.rest), fmtDur(d.contMax * 3600), useTacho ? 'tahograf' : 'GPS (est.)', infr.join('; ') || '✓']);
      totDrive += d.drive; totWork += d.work; totRest += d.rest; totInfr += infr.length;
      dayDrive[day] = (dayDrive[day] || 0) + d.drive;
    }
  }
  const dayKeys = Object.keys(dayDrive).sort();
  const charts = rows.length ? [{ type: 'bar', title: 'Ore conducere pe zi', labels: dayKeys.map(_dayLabel), datasets: [{ label: 'ore', data: dayKeys.map((k) => Math.round(dayDrive[k] / 360) / 10) }] }] : [];
  return {
    columns: ['Șofer', 'Vehicul', 'Zi', 'Condus', 'Muncă', 'Repaus', 'Continuă max', 'Sursă', 'Încălcări (Reg. 561)'],
    rows,
    summary: { 'Zile-vehicul': rows.length, 'Condus total': fmtDur(totDrive), 'Repaus total': fmtDur(totRest), 'Încălcări (561)': totInfr },
    charts,
  };
}

// Tipuri de vehicul care se măsoară în ORE de funcționare (nu km) — ca „în bord": utilaje, tractoare, generatoare etc.
const MACHINE_TYPES = new Set(['utilaj','buldoexcavator','excavator','tractor','motostivuitor','stivuitor','combină agricolă','combina agricola','combină','combina','combine','grup electrogen','generator','automixt','mixer','forklift']);
async function rUtilization(db, imeis, from, to, opts, devMap) { // Index km / ore — istoricul indexului din bord: început → realizat → sfârșit (km la auto, ore la utilaje)
  const items = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let kmGps = 0; // km GPS (fallback + validarea deltei CAN)
    for (let i = 1; i < pts.length; i++) { const pr = pts[i-1], p = pts[i], d = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (d < MAX_STEP_KM) kmGps += d; }
    // Odometru CAN + contor moto-ore CAN: prima/ultima citire validă din interval → index început/sfârșit reale
    let odoFirst = null, odoLast = null, hFirst = null, hLast = null;
    for (let i = 0; i < pts.length; i++) {
      const o = odoCan(pts[i]); if (o != null) { if (odoFirst == null) odoFirst = o; odoLast = o; }
      const h = engH(pts[i]);   if (h != null) { if (hFirst == null) hFirst = h; hLast = h; }
    }
    const dev = devMap[imei] || {};
    const isMachine = MACHINE_TYPES.has(String(dev.vehicle_type || '').toLowerCase().trim());
    // Metru primar = „ce e în bord": utilaj cu contor de ore → ore; altfel km (cu fallback dacă lipsesc datele).
    let unit = (isMachine && hLast != null) ? 'ore' : 'km';
    if (unit === 'km' && odoLast == null && kmGps <= 0 && hLast != null) unit = 'ore';

    let startTxt = '—', realTxt = '—', endTxt = '—', src = '—', sortKey = 0, realKm = 0, realH = 0;
    if (unit === 'km') {
      // Prioritate: „Km la bord" (introdus de operator = citit de pe bord) BATE CAN-ul. Unele mașini au odometrul CAN
      // greșit/învechit (ex. Dacia: CAN dă 32.685 „ultima", dar bordul real e 33.560) → cifra operatorului e autoritară. Apoi CAN, apoi GPS.
      const baseKm = dev.odo_base_km != null ? parseFloat(dev.odo_base_km) : null;
      const baseDev = dev.odo_base_dev_m != null ? parseFloat(dev.odo_base_dev_m) : null;
      let tdFirst = null, tdLast = null;
      for (let i = 0; i < pts.length; i++) { const td = todo(pts[i]); if (td != null) { if (tdFirst == null) tdFirst = td; tdLast = td; } }
      const bordOk = baseKm != null && baseDev != null && tdLast != null && tdLast >= baseDev - 1000; // contor monoton (toleranță zgomot)
      if (bordOk) {
        const endKm = baseKm + Math.max(0, tdLast - baseDev) / 1000;
        const startKm = (tdFirst != null) ? baseKm + Math.max(0, tdFirst - baseDev) / 1000 : null;
        const dlt = (tdFirst != null) ? Math.max(0, tdLast - tdFirst) / 1000 : kmGps;
        startTxt = startKm != null ? _grp(startKm) + ' km' : '—'; realTxt = _grp(dlt) + ' km'; endTxt = _grp(endKm) + ' km'; src = 'bord+GPS'; sortKey = dlt; realKm = dlt;
      }
      else if (odoLast != null) {
        // Index CAN real (din bord) — îl arătăm când există citire. Realizatul: delta CAN dacă e coerentă cu GPS, altfel GPS
        // (contorul CAN vine uneori rar/o singură dată în interval → n-avem delta bună, dar indexul e valid).
        const dCan = (odoFirst != null) ? (odoLast - odoFirst) : null;
        const dOk = dCan != null && dCan >= 0 && dCan >= kmGps * 0.5 && dCan <= kmGps * 3 + 20;
        const realized = dOk ? dCan : Math.round(kmGps);
        const startKm = dOk ? odoFirst : (odoLast - realized); // delta de încredere → start real; altfel proiectăm înapoi din indexul curent (ca să se lege început + realizat = sfârșit)
        startTxt = _grp(startKm) + ' km'; realTxt = _grp(realized) + ' km'; endTxt = _grp(odoLast) + ' km'; src = 'CAN'; sortKey = realized; realKm = realized;
      }
      else { realTxt = _grp(kmGps) + ' km'; src = 'GPS (estimat)'; sortKey = kmGps; realKm = kmGps; } // fără CAN și fără „km la bord" → doar realizatul GPS
    } else { // ore de funcționare (moto-ore)
      if (hFirst != null && hLast != null && hLast >= hFirst) { const dH = hLast - hFirst; startTxt = _grp(hFirst) + ' h'; realTxt = _grp(dH) + ' h'; endTxt = _grp(hLast) + ' h'; src = 'CAN'; sortKey = dH; realH = dH; }
      else if (hLast != null) { endTxt = _grp(hLast) + ' h'; src = 'CAN'; } // avem doar indexul curent, nu și delta
    }
    items.push({ nm: label(devMap, imei), unit, startTxt, realTxt, endTxt, src, sortKey, realKm, realH, isCan: (src === 'CAN') });
  }
  items.sort((a, b) => b.sortKey - a.sortKey);
  const rows = items.map(x => [ x.nm, x.startTxt, x.realTxt, x.endTxt, x.src ]);
  const topKm = _topN(items.filter(x => x.unit === 'km' && x.realKm > 0).map(x => [x.nm, x.realKm]), 10);
  const charts = (topKm.labels && topKm.labels.length) ? [
    { type: 'bar', title: 'Km realizați pe vehicul', labels: topKm.labels, datasets: [{ label: 'km', data: topKm.data }] }
  ] : [];
  // FĂRĂ sumar (cerut explicit): raportul e per-vehicul (index început → realizat → sfârșit + sursă); un bloc de totaluri nu adăuga nimic util.
  return { columns: ['Vehicul','Index început','Realizat','Index sfârșit','Sursă'], rows, charts };
}

async function rLocation(db, imeis, from, to, opts, devMap) { // Ultima locație: unde a STAȚIONAT ultima dată fiecare vehicul (parcarea); dacă încă merge la final → poziția curentă marcată „în mișcare"
  const refMs = Math.min(new Date(to).getTime(), Date.now()); // „staționează de" se măsoară până la ACUM dacă intervalul e curent, altfel până la finalul intervalului
  // 1. Pentru fiecare vehicul: ultima poziție + de când e oprită (coada contiguă de puncte staționare de la final)
  const items = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    if (!pts.length) continue;
    const pLast = pts[pts.length - 1];
    const movingNow = (pLast.speed || 0) > IDLE_SPEED;
    let k = pts.length - 1;                                   // scan înapoi cât timp e oprită → primul punct al staționării curente
    while (k > 0 && (pts[k - 1].speed || 0) <= IDLE_SPEED) k--;
    items.push({ imei, pLast, movingNow, stoppedAt: pts[k].timestamp });
  }
  // 2. Adrese în cache (poziția curentă/parcarea fiecărui vehicul) → coloana „Locație" arată ADRESE, nu coordonate.
  if (geocode && geocode.warm && items.length) {
    try { await geocode.warm(items.map(x => ({ lat: x.pLast.latitude, lng: x.pLast.longitude })), { maxUnique: 100, budgetMs: imeis.length <= 1 ? 12000 : 8000 }); } catch (e) {}
  }
  // 3. Rânduri: parcată → unde/când a oprit + de cât timp stă; în mișcare → poziția curentă marcată.
  const rows = items.map(({ imei, pLast, movingNow, stoppedAt }) => {
    const nm = label(devMap, imei);
    const ign = (pLast.io_data || {}).ignition === 1 ? 'pornit' : 'oprit';
    const sat = pLast.satellites || 0; const satTxt = sat + ' (' + _satQ(sat) + ')';
    if (movingNow) return [ nm, addr(pLast), '—', 'în mișcare', ign, satTxt ];
    return [ nm, addr(pLast), fmtTs(stoppedAt), _ageStr(refMs - new Date(stoppedAt).getTime(), false), ign, satTxt ];
  });
  return {
    columns: ['Vehicul', 'Locație (unde a oprit)', 'A oprit la', 'Staționează de', 'Contact', 'Sateliți'],
    rows
    // fără sumar; antetul arată „Perioada: de la — până la" (intervalul contează acum, căutăm ultima oprire în el)
  };
}

async function rDaily(db, imeis, from, to, opts, devMap) { // Situație zilnică (rezumat pe zi/vehicul)
  const rows = []; let totalKm = 0, totalIdle = 0; const dayKm = {}, dayMove = {}, dayIdle = {}; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const byDay = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], day = _dayKeyISO(p.timestamp);
      const d = byDay[day] || (byDay[day] = { km: 0, move: 0, eng: 0, max: 0, stops: 0, trips: 0, firstDep: null, lastArr: null });
      if ((p.speed || 0) > d.max) d.max = p.speed || 0;
      if (i > 0) {
        const pr = pts[i - 1], dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
        if (dist < MAX_STEP_KM) d.km += dist;
        const dt = (t(p) - t(pr)) / 1000;
        if (dt > 0 && dt < 3600) { if ((p.speed || 0) > IDLE_SPEED) d.move += dt; if (ignOn(pr) && ignOn(p)) d.eng += dt; } // motor pornit = contact ON la AMBELE capete
      }
    }
    const seg = segmentTrack(pts, (opts.stopMin || 5) * 60);
    seg.stops.forEach(s => { const day = _dayKeyISO(s.start); if (byDay[day]) byDay[day].stops++; });
    seg.trips.forEach(tr => { // trips-urile sunt cronologice → primul = prima plecare, ultimul = ultima sosire
      const day = _dayKeyISO(tr.start); const d = byDay[day]; if (!d) return;
      d.trips++; if (d.firstDep == null) d.firstDep = tr.start; d.lastArr = tr.end;
    });
    const nm = label(devMap, imei);
    for (const day of Object.keys(byDay).sort()) {
      const d = byDay[day];
      const eng = Math.max(d.eng, d.move);      // dacă a mers, motorul era pornit (robust la senzor de contact nesigur)
      const idle = eng - d.move;                // ralanti = motor pornit dar oprit din loc
      const activ = (d.firstDep && d.lastArr) ? (fmtHM(d.firstDep) + ' – ' + fmtHM(d.lastArr)) : '—'; // fereastra de activitate a zilei (doar ore)
      rows.push([ nm, day, activ, d.km.toFixed(1), d.trips, fmtDur(d.move), fmtDur(idle), fmtDur(eng), d.stops, Math.round(d.max) ]);
      totalKm += d.km; totalIdle += idle;
      dayKm[day] = (dayKm[day] || 0) + d.km; dayMove[day] = (dayMove[day] || 0) + d.move; dayIdle[day] = (dayIdle[day] || 0) + idle;
      const pv = perVeh[nm] || (perVeh[nm] = { km: 0, move: 0, idle: 0, active: 0, days: {} });
      pv.km += d.km; pv.move += d.move; pv.idle += idle; if (d.km > 0.1) pv.active++;
      pv.days[day] = { km: d.km, move: d.move, idle: idle }; // serie zilnică per vehicul → grafice individuale la selecție
    }
  }
  const dk = Object.keys(dayKm).sort();
  const charts = rows.length ? [
    { type: 'bar',  title: 'Km pe zi (flotă)',         labels: dk.map(_dayLabel), datasets: [{ label: 'km', data: dk.map(k => Math.round(dayKm[k] * 10) / 10) }] },
    { type: 'line', title: 'Timp în mers pe zi (ore)', labels: dk.map(_dayLabel), datasets: [{ label: 'ore', data: dk.map(k => Math.round(dayMove[k] / 360) / 10) }] },
    { type: 'bar',  title: 'Ralanti pe zi (ore)',      labels: dk.map(_dayLabel), datasets: [{ label: 'ore', data: dk.map(k => Math.round((dayIdle[k] || 0) / 360) / 10) }] }
  ] : [];
  // Sumar PE VEHICUL cu sens (Excel „Sumar" + online): Km total / Zile active / Timp mers / Ralanti total.
  const names = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (names.length >= 2) {
    const byName = {}; rows.forEach(r => { (byName[String(r[0])] || (byName[String(r[0])] = [])).push(r); });
    perVehicle = names.map(nm => {
      const pv = perVeh[nm], dks = Object.keys(pv.days).sort();
      return {
        vehicul: nm,
        summary: [['Km total', Math.round(pv.km)], ['Zile active', pv.active], ['Timp mers', fmtDur(pv.move)], ['Ralanti total', fmtDur(pv.idle)]],
        rows: byName[nm] || [],
        // grafice INDIVIDUALE (doar pentru vehiculul selectat) — se afișează în locul celor pe flotă când alegi mașina
        charts: dks.length ? [
          { type: 'bar',  title: 'Km pe zi',            labels: dks.map(_dayLabel), datasets: [{ label: 'km', data: dks.map(k => Math.round(pv.days[k].km * 10) / 10) }] },
          { type: 'line', title: 'Timp în mers pe zi (ore)', labels: dks.map(_dayLabel), datasets: [{ label: 'ore', data: dks.map(k => Math.round(pv.days[k].move / 360) / 10) }] },
          { type: 'bar',  title: 'Ralanti pe zi (ore)', labels: dks.map(_dayLabel), datasets: [{ label: 'ore', data: dks.map(k => Math.round(pv.days[k].idle / 360) / 10) }] }
        ] : []
      };
    });
  }
  return {
    columns: ['Vehicul', 'Zi', 'Interval activ', 'Km', 'Curse', 'Timp mers', 'Ralanti', 'Motor pornit', 'Opriri', 'Vit. max'],
    rows,
    summary: { 'Zile-vehicul': rows.length, 'Km total': Math.round(totalKm), 'Ralanti total (flotă)': fmtDur(totalIdle) },
    charts, perVehicle
  };
}

async function rRoute(db, imeis, from, to, opts, devMap) { // Traseu — jurnal de activitate (deplasări + staționări, cu adrese)
  const perImei = [];
  for (const imei of imeis) {
    perImei.push({ imei, seg: segmentTrack(await history(db, imei, from, to), (opts.stopMin || 5) * 60) });
  }
  // Pre-încarcă adresele (start/stop deplasări + opriri); fallback pe coordonate + completare progresivă pe client.
  if (geocode && geocode.warm) {
    const coords = [];
    for (const { seg } of perImei) {
      seg.trips.forEach(tr => { if (tr.startP) coords.push({ lat: tr.startP.latitude, lng: tr.startP.longitude }); if (tr.endP) coords.push({ lat: tr.endP.latitude, lng: tr.endP.longitude }); });
      seg.stops.forEach(s => { if (s.p) coords.push({ lat: s.p.latitude, lng: s.p.longitude }); });
    }
    try { await geocode.warm(coords, { maxUnique: 100, budgetMs: imeis.length <= 1 ? 14000 : 6000 }); } catch (e) {}
  }
  const rows = [], perVehicle = [];
  let gMove = 0, gStop = 0, gKm = 0, gMoveSec = 0, gStopSec = 0;
  for (const { imei, seg } of perImei) {
    const nm = label(devMap, imei);
    const ev = [];
    let nMove = 0, nStop = 0, km = 0, moveSec = 0, stopSec = 0;
    seg.trips.forEach(tr => { ev.push({ t: new Date(tr.start).getTime(), row: [nm, 'Deplasare', fmtTs(tr.start), fmtTs(tr.end), fmtDur(tr.durationSec), tr.distanceKm.toFixed(1), addr(tr.startP), addr(tr.endP)] }); nMove++; km += tr.distanceKm; moveSec += tr.durationSec; });
    seg.stops.forEach(s => { ev.push({ t: new Date(s.start).getTime(), row: [nm, 'Staționare', fmtTs(s.start), fmtTs(s.end), fmtDur(s.durationSec), '', addr(s.p), ''] }); nStop++; stopSec += s.durationSec; });
    ev.sort((a, b) => a.t - b.t);
    const vrows = ev.map(e => e.row);
    vrows.forEach(r => rows.push(r));
    gMove += nMove; gStop += nStop; gKm += km; gMoveSec += moveSec; gStopSec += stopSec;
    if (vrows.length) perVehicle.push({ vehicul: nm, summary: [['Deplasări', nMove], ['Staționări', nStop], ['Km', Math.round(km * 10) / 10], ['Timp mișcare', fmtDur(moveSec)], ['Timp staționat', fmtDur(stopSec)]], rows: vrows });
  }
  perVehicle.sort((a, b) => String(a.vehicul).localeCompare(String(b.vehicul)));
  return {
    columns: ['Vehicul', 'Tip', 'Început', 'Sfârșit', 'Durată', 'Km', 'De la', 'Până la'], rows,
    summary: { 'Deplasări': gMove, 'Staționări': gStop, 'Km total': Math.round(gKm * 10) / 10, 'Timp mișcare': fmtDur(gMoveSec), 'Timp staționat': fmtDur(gStopSec) },
    perVehicle: perVehicle.length > 1 ? perVehicle : undefined
  };
}

// Legenda coloanei „Sursă" — explică cele 3 metode (CAN > Senzor > Estimat) + varianta „Estimat (nivel CAN)".
// Sursă unică de adevăr: setată pe obiectul raportului → randată identic online, în Excel și în PDF.
const CONSUMPTION_LEGEND = { title: 'Sursa consumului — cum a fost calculat', items: [
  ['CAN', 'Contor CAN: mașina raportează exact litrii consumați. Cea mai precisă metodă.'],
  ['Senzor', 'Nivel rezervor: consum calculat din cât a scăzut nivelul (când senzorul e precis).'],
  ['Estimat (nivel CAN)', 'Mașina are senzor de nivel, dar prea imprecis pe acest interval → consum estimat din consumul mediu al mașinii.'],
  ['Estimat', 'Fără contor sau senzor de încredere → consum estimat din consumul mediu al mașinii.']
] };

async function rConsumption(db, imeis, from, to, opts, devMap) { // Consum carburant (sumar)
  const cm = await _consumptionMap(db, imeis, from, to, opts);
  const rows = []; let tCons = 0, tDist = 0; const vCons = [], vPer = [];
  for (const imei of imeis) {
    const m = cm[imei]; if (!m) continue;
    const nm = label(devMap, imei);
    if (!m.hasFuel && m.consumed <= 0) { rows.push([nm, '—', '—', '—', m.dist.toFixed(0), '—', '—', '—']); continue; }
    rows.push([ nm, m.first != null ? m.first.toFixed(0) + ' L' : '—', m.last != null ? m.last.toFixed(0) + ' L' : '—', Math.round(m.refueled) + ' L', m.dist.toFixed(0), m.consumed.toFixed(0) + ' L', m.per100 != null ? m.per100.toFixed(1) : '—', m.source ]);
    tCons += m.consumed; tDist += m.dist; vCons.push([nm, m.consumed]); if (m.per100) vPer.push([nm, m.per100]);
  }
  const topCons = _topN(vCons, 10), topPer = _topN(vPer, 10);
  const charts = vCons.length ? [
    { type: 'bar', title: 'Consum pe vehicul (L)', labels: topCons.labels, datasets: [{ label: 'L', data: topCons.data }] },
    { type: 'bar', title: 'L/100km pe vehicul',    labels: topPer.labels,  datasets: [{ label: 'L/100km', data: topPer.data }] }
  ] : [];
  // Sumarul pe FOAIE SEPARATĂ în Excel (summarySheet), nu îngrămădit la baza tabelului. Online rămâne ca chips.
  return { columns: ['Vehicul', 'Nivel start', 'Nivel final', 'Alimentat', 'Km', 'Consumat', 'L/100km', 'Sursă'], rows,
    summary: { 'Total vehicule': imeis.length, 'Consum total (L)': Math.round(tCons), 'Km total': Math.round(tDist), 'Mediu L/100km': tDist > 1 ? (tCons / tDist * 100).toFixed(1) : '—' }, charts, summarySheet: true, legend: CONSUMPTION_LEGEND };
}

// Ultima valoare NENULĂ a unei chei din io_data + momentul ei (pt. „citirea" reală a CAN-ului: contorul de km e adesea
// vechi/„stale" pe pingul curent — parcată nu-l mai trimite). Cheile sunt fixe (fără injecție).
async function _lastIo(db, imei, key, to) {
  try {
    const r = await db.pool.query("SELECT io_data->>'" + key + "' AS v, timestamp FROM positions WHERE imei = $1 AND timestamp <= $2 AND io_data->>'" + key + "' IS NOT NULL ORDER BY timestamp DESC LIMIT 1", [imei, to]);
    if (!r.rows[0]) return null; const n = parseFloat(r.rows[0].v); return isFinite(n) ? { v: n, ts: r.rows[0].timestamp } : null;
  } catch (e) { return null; }
}
async function rCan(db, imeis, from, to, opts, devMap) { // Date CAN — instantaneu tehnic pe vehicul (ULTIMELE valori reale)
  const rows = [];
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const r = await db.pool.query('SELECT * FROM positions WHERE imei = $1 AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 1', [imei, to]);
    const p = r.rows[0]; if (!p) { rows.push([nm, '—', '—', '—', '—', '—', 0]); continue; }
    const i = p.io_data || {};
    // Sarcină axe + DTC de pe ultimul ping (string-tolerant: valorile CAN pot veni ca string → altfel se concatenau greșit).
    const axle = [i.can_axle1_load, i.can_axle2_load, i.can_axle3_load, i.can_axle4_load, i.can_axle5_load].reduce((s, v) => s + (parseFloat(v) || 0), 0) || parseFloat(i.can_load_weight) || 0;
    const dtc = parseFloat(i.can_dtc_errors) || 0;
    // Combustibil + odometre citite ca ULTIMA valoare REALĂ (nu de pe pingul parcat, care adesea nu mai trimite CAN → apărea „—").
    const fuel = (await _lastIo(db, imei, 'fuel_level_liters', to)) || (await _lastIo(db, imei, 'can_fuel_level_liters', to));
    const canMil = await _lastIo(db, imei, 'can_total_mileage', to);   // odometru REAL din bord (contorul mașinii)
    const gpsOdo = await _lastIo(db, imei, 'total_odometer', to);      // odometru GPS al device-ului (metri) — de la montaj
    rows.push([
      nm,
      fmtTs(p.timestamp),                                             // Actualizat = ultimul contact cu mașina
      fuel ? fuel.v.toFixed(0) + ' L' : '—',
      canMil ? _grp(canMil.v) + ' km' : '—',                          // Km bord (CAN)
      gpsOdo ? _grp(gpsOdo.v / 1000) + ' km' : '—',                   // Km GPS (device)
      axle ? _grp(axle) + ' kg' : '—',
      dtc
    ]);
  }
  return {
    columns: ['Vehicul', 'Actualizat', 'Combustibil', 'Km bord (CAN)', 'Km GPS (device)', 'Sarcină axe', 'Erori DTC'], rows,
    periodLabel: 'Instantaneu — ultimele valori disponibile până la ' + fmtTs(to),
    summary: { 'Total vehicule': rows.length, 'Cu erori DTC': rows.filter(r => typeof r[6] === 'number' && r[6] > 0).length },
    summarySheet: true,
    legend: { title: 'Date CAN — ce înseamnă coloanele', items: [
      ['Actualizat', 'Când am primit ultima dată date de la mașină (ultimul contact).'],
      ['Km bord (CAN)', 'Kilometrajul REAL din bordul mașinii — contorul mașinii.'],
      ['Km GPS (device)', 'Cât a măsurat trackerul din GPS de la montare — de obicei mai mic (pornește de la 0 la instalare). Diferența față de „Km bord" e normală.'],
      ['Sarcină axe', 'Greutatea pe axe (kg) — doar la camioane cu senzori de sarcină; „—" la mașinile fără.'],
      ['Erori DTC', 'Câte coduri de defect raportează mașina (0 = niciunul). Peste 0 → de verificat la service.']
    ] }
  };
}

// ── Rapoarte CAN/FMS: Supraturații · PTO · Ore motor (gol/sarcină) ─────────────────────────────────
// Prag de supraturație pe tip de combustibil: diesel toarce jos (linie roșie ~2500–3000); benzină/GPL toarcă sus (~6000).
function _revThreshold(fuelType) { return _ftKey(fuelType) === 'motorina' ? 2500 : 4000; }
async function rOverRev(db, imeis, from, to, opts, devMap) { // Supraturații — turația CAN peste prag (adaptat pe tip de combustibil)
  const rows = [], worstPts = []; let fleetEvents = 0;
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const RPM_MAX = opts.rpmMax || _revThreshold(devMap[imei] && devMap[imei].fuel_type); // prag adaptat motorului
    const pts = await history(db, imei, from, to);
    let prevTs = null, over = false, count = 0, overSec = 0, maxRpm = 0, worst = null, hadRpm = false;
    for (const p of pts) {
      const rpm = canRpm(p);
      if (rpm == null) { prevTs = null; over = false; continue; }
      hadRpm = true; if (rpm > maxRpm) maxRpm = rpm;
      const isOver = rpm > RPM_MAX;
      if (isOver && !over) count++;                                   // front crescător = supraturație nouă
      if (isOver && prevTs != null) { const dt = (t(p) - prevTs) / 1000; if (dt > 0 && dt <= 300) overSec += dt; }
      if (isOver && (worst == null || rpm > worst.rpm)) worst = { rpm, ts: p.timestamp, p };
      over = isOver; prevTs = t(p);
    }
    const prag = _grp(RPM_MAX) + ' rpm';
    if (!hadRpm) { rows.push([nm, '—', '—', 'Fără RPM', prag, '—', '—']); worstPts.push(null); continue; } // „Fără RPM" în coloana RPM max (nu în Supraturații)
    if (!count) { rows.push([nm, 0, fmtDur(0), maxRpm ? _grp(maxRpm) + ' rpm' : '—', prag, '—', '—']); worstPts.push(null); continue; }
    fleetEvents += count;
    rows.push([nm, count, fmtDur(Math.round(overSec)), _grp(maxRpm) + ' rpm', prag, fmtTs(worst.ts), loc(worst.p)]);
    worstPts.push(worst.p);
  }
  if (geocode && geocode.warm) { const c = worstPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 100, budgetMs: imeis.length <= 1 ? 12000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (worstPts[i]) r[6] = addr(worstPts[i]); });
  const sk = v => (typeof v === 'number' ? v : -1);
  rows.sort((a, b) => sk(b[1]) - sk(a[1]));                          // cele mai multe supraturații sus
  return {
    columns: ['Vehicul', 'Supraturații', 'Timp', 'RPM max', 'Prag', 'Ultima', 'Locație'], rows,
    summary: { 'Total vehicule': imeis.length, 'Cu supraturații': rows.filter(r => typeof r[1] === 'number' && r[1] > 0).length, 'Supraturații (total)': fleetEvents },
    summarySheet: true,
    legend: { title: 'Supraturații — ce înseamnă', items: [
      ['Supraturație', 'De câte ori turația a depășit pragul mașinii — condus agresiv, treaptă greșită sau uzură de motor.'],
      ['Prag pe combustibil', 'Motorină 2500 rpm (motoare care toarcă jos); Benzină și GPL 4000 rpm (toarcă sus). Setează „Tip combustibil" în fișa mașinii ca pragul să fie corect.'],
      ['Timp', 'Cât timp total a stat motorul peste prag.'],
      ['Fără RPM', 'Mașina nu raportează turația prin CAN — nu poate fi evaluată.']
    ] }
  };
}

async function rPto(db, imeis, from, to, opts, devMap) { // PTO — priza de putere (macara, basculă, frigorific…)
  const rows = [], lastPts = []; let fleetOn = 0;
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const pts = await history(db, imei, from, to);
    let prevTs = null, on = false, count = 0, activeSec = 0, last = null, hadPto = false;
    for (const p of pts) {
      const v = io(p).can_pto_active;
      if (v == null) { prevTs = null; on = false; continue; }
      hadPto = true;
      const isOn = (v === 1 || v === true || v === '1');
      if (isOn && !on) count++;                                       // front crescător = activare nouă
      if (isOn && prevTs != null) { const dt = (t(p) - prevTs) / 1000; if (dt > 0 && dt <= 3600) activeSec += dt; }
      if (isOn) last = { ts: p.timestamp, p };
      on = isOn; prevTs = t(p);
    }
    if (!hadPto) { rows.push([nm, 'Fără PTO', '—', '—', '—']); lastPts.push(null); continue; }
    if (!count) { rows.push([nm, 0, fmtDur(0), '—', '—']); lastPts.push(null); continue; }
    fleetOn += count;
    rows.push([nm, count, fmtDur(Math.round(activeSec)), fmtTs(last.ts), loc(last.p)]);
    lastPts.push(last.p);
  }
  if (geocode && geocode.warm) { const c = lastPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 100, budgetMs: imeis.length <= 1 ? 12000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (lastPts[i]) r[4] = addr(lastPts[i]); });
  const sk = v => (typeof v === 'number' ? v : -1);
  rows.sort((a, b) => sk(b[1]) - sk(a[1]));
  return {
    columns: ['Vehicul', 'Porniri PTO', 'Timp activ', 'Ultima activare', 'Locație'], rows,
    summary: { 'Total vehicule': imeis.length, 'Cu PTO': rows.filter(r => typeof r[1] === 'number' && r[1] > 0).length, 'Porniri (total)': fleetOn },
    summarySheet: true,
    legend: { title: 'PTO — priza de putere', items: [
      ['PTO', 'Priza de putere antrenează un echipament (macara, basculă, betonieră, frigorific) — de regulă cu vehiculul oprit.'],
      ['Porniri PTO', 'De câte ori a fost activată priza în perioadă.'],
      ['Fără PTO', 'Mașina nu raportează starea PTO prin CAN (sau nu are PTO).']
    ] }
  };
}

async function rEngineHours(db, imeis, from, to, opts, devMap) { // Ore motor: gol (ralanti) / mers / cu PTO
  const rows = []; let tEng = 0, tIdle = 0, tMove = 0, tPto = 0;
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const pts = await history(db, imei, from, to);
    let prev = null, engineSec = 0, idleSec = 0, moveSec = 0, ptoSec = 0, hadEngine = false;
    for (const p of pts) {
      const rpm = canRpm(p);
      const on = ignOn(p) || (rpm != null && rpm > 300);              // motor pornit
      if (on) hadEngine = true;
      if (prev != null && prev.on && on) {
        const dt = (t(p) - prev.ts) / 1000;
        if (dt > 0 && dt <= 3600) {
          engineSec += dt;
          const moving = (p.speed || 0) > IDLE_SPEED;
          const pv = io(p).can_pto_active, pto = (pv === 1 || pv === true || pv === '1');
          if (moving) moveSec += dt;                                  // în mers (deplasare)
          else if (pto) ptoSec += dt;                                 // staționat, dar PTO lucrează (macara/basculă)
          else idleSec += dt;                                         // în gol = pornit, staționat, fără PTO
        }
      }
      prev = { ts: t(p), on };
    }
    if (!hadEngine || engineSec < 1) { rows.push([nm, fmtDur(0), fmtDur(0), fmtDur(0), '—', '—']); continue; }
    const pctIdle = Math.round(idleSec / engineSec * 100);
    tEng += engineSec; tIdle += idleSec; tMove += moveSec; tPto += ptoSec;
    rows.push([nm, fmtDur(Math.round(engineSec)), fmtDur(Math.round(idleSec)), fmtDur(Math.round(moveSec)), ptoSec > 0 ? fmtDur(Math.round(ptoSec)) : '—', pctIdle + '%']);
  }
  const pk = r => { const n = parseFloat(r[5]); return isFinite(n) ? n : -1; };
  rows.sort((a, b) => pk(b) - pk(a));                                 // cel mai mare % gol sus (irosire)
  return {
    // Sumar cu TOTALURI care se adună (Ore motor = gol + mers + PTO) — fără procent derivat care se confundă cu media.
    columns: ['Vehicul', 'Ore motor', 'În gol', 'În mers', 'Cu PTO', '% gol'], rows,
    summary: { 'Total vehicule': imeis.length, 'Ore motor (total)': fmtDur(Math.round(tEng)), 'În gol (total)': fmtDur(Math.round(tIdle)), 'În mers (total)': fmtDur(Math.round(tMove)), 'Cu PTO (total)': tPto > 0 ? fmtDur(Math.round(tPto)) : '—' },
    summarySheet: true,
    legend: { title: 'Ore motor — cum se împarte timpul cu motorul pornit', items: [
      ['În gol (ralanti)', 'Staționat, fără PTO — timp și combustibil irosite.'],
      ['În mers', 'Vehiculul se deplasează (condus efectiv). La o mașină obișnuită, ăsta e tot timpul „productiv".'],
      ['Cu PTO', 'Staționat, dar cu priza de putere activă — echipamentul lucrează (macara, basculă, betonieră). „—" la vehiculele fără PTO.'],
      ['% gol', 'Cât din timpul cu motorul pornit a fost irosit la ralanti.']
    ] }
  };
}

// Etichete prietenoase pt. tipurile de alertă (oglindesc ALERT_TYPES din frontend).
const _ALERT_LABELS = {
  overspeed: 'Depășire viteză', fuel_drop: 'Scădere combustibil (furt)', ignition_on: 'Pornire motor', ignition_off: 'Oprire motor',
  geofence_enter: 'Intrare în zonă', geofence_exit: 'Ieșire din zonă', engine_temp: 'Temperatură motor mare', dtc_error: 'Erori motor (DTC)',
  overload_legal: 'Supraîncărcare (legal)', overload_construct: 'Supraîncărcare (constructiv)', axle_overload: 'Supraîncărcare pe axă',
  pto_active: 'PTO activat', brake_pad_wear: 'Uzură plăcuțe frână', service_due: 'Service aproape',
  idle_engine: 'Staționare cu motor pornit (ralanti)', document_expiry: 'Expirare documente'
};
function _alertTypeLabel(v) { return _ALERT_LABELS[v] || v || '—'; }
// Detaliu lizibil per tip (oglindește alertSummary din server.js) — în loc de JSON brut.
function _alertDetail(type, d) {
  d = d || {};
  switch (type) {
    case 'overspeed': return `Viteză ${d.speed} km/h (limită ${d.limit})`;
    case 'fuel_drop': return `Scădere combustibil ${d.drop != null ? Number(d.drop).toFixed(1) : '?'} L`;
    case 'engine_temp': return `Temperatură ${d.temp}°C (limită ${d.limit})`;
    case 'geofence_enter': case 'geofence_exit': return (d.event || _alertTypeLabel(type)) + (d.geofence ? ': ' + d.geofence : '');
    case 'overload_legal': case 'overload_construct': return `Greutate ${d.totalKg} kg (limită ${d.limit})`;
    case 'axle_overload': return d.axle ? `Supraîncărcare axa ${d.axle} (${d.kg} kg)` : 'Supraîncărcare pe axă';
    case 'dtc_error': return `${d.dtcCount != null ? d.dtcCount : '?'} erori motor`;
    case 'idle_engine': return `Ralanti ${d.idleMinutes} min (prag ${d.threshold} min)`;
    default: return d.event || '';
  }
}

async function rEvents(db, imeis, from, to, opts, devMap) { // Evenimente (alerte declanșate)
  // Interogare scopată pe fereastră + vehicule (NU global LIMIT 2000) — altfel, peste 2000 alerte mai noi decât
  // fereastra, TOATE evenimentele din interval erau pierdute silențios (subraportare care se înrăutățește în timp).
  const all = await db.getAlertHistoryRange(imeis, from, to, 5000);
  const rows = []; const evs = []; const byType = {}; const perVeh = {}; const evPts = [];
  for (const e of all) {
    let d = e.data || {}; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = {}; } }
    const typ = e.alert_name || _alertTypeLabel(e.alert_type);   // nume prietenos ca fallback la codul tehnic
    const nm = label(devMap, e.imei);
    const p = (d.lat != null && d.lng != null) ? { latitude: +d.lat, longitude: +d.lng } : null; // locul unde s-a declanșat
    rows.push([ nm, typ, fmtTs(e.triggered_at), _alertDetail(e.alert_type, d), p ? loc(p) : '' ]);
    evPts.push(p);
    evs.push({ ts: e.triggered_at }); byType[typ] = (byType[typ] || 0) + 1;
    const pv = perVeh[nm] || (perVeh[nm] = { evs: [], byType: {}, n: 0 });
    pv.evs.push({ ts: e.triggered_at }); pv.byType[typ] = (pv.byType[typ] || 0) + 1; pv.n++;
  }
  // Adresă la locul alertei (dacă avem coordonate): pre-încarcă + fallback pe coordonate + completare progresivă pe client.
  if (geocode && geocode.warm && evPts.some(Boolean)) {
    try { await geocode.warm(evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })), { maxUnique: 300, budgetMs: opts.geoBudgetMs || (imeis.length <= 1 ? 14000 : 8000) }); } catch (e) {}
  }
  rows.forEach((r, i) => { if (evPts[i]) r[4] = addr(evPts[i]); }); // Locație e col. 4
  const nDay = _groupByDay(evs, x => x.ts, null);
  const topT = _topN(Object.entries(byType), 8);
  const charts = rows.length ? [
    { type: 'line',     title: 'Evenimente pe zi', labels: nDay.labels, datasets: [{ label: 'evenimente', data: nDay.data }] },
    { type: 'doughnut', title: 'Evenimente pe tip', labels: topT.labels, datasets: [{ label: 'evenimente', data: topT.data }] }
  ] : [];
  const eNames = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (eNames.length >= 1) { // fiecare mașină are foaia ei (chiar și una singură)
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    perVehicle = eNames.map(nm => {
      const pv = perVeh[nm], nD = _groupByDay(pv.evs, x => x.ts, null), tT = _topN(Object.entries(pv.byType), 8);
      return {
        vehicul: nm,
        summary: [['Evenimente', pv.n]],
        rows: rowsByName[nm] || [],
        charts: [
          { type: 'line', title: 'Evenimente pe zi', labels: nD.labels, datasets: [{ label: 'evenimente', data: nD.data }] },
          { type: 'doughnut', title: 'Evenimente pe tip', labels: tT.labels, datasets: [{ label: 'evenimente', data: tT.data }] }
        ]
      };
    });
  }
  // Fără sumar (la cererea userului): nici KPI online, nici foaie „Sumar" în Excel — doar o foaie per mașină.
  return { columns: ['Vehicul', 'Eveniment', 'Data', 'Detalii', 'Locație'], rows, summary: {}, charts, perVehicle, noSummarySheet: true };
}

async function rAnalytic(db, imeis, from, to, opts, devMap) { // Analitic (brut, poziție cu poziție) — cu ADRESĂ în loc de lat/lng
  const cap = opts.cap || 5000; let capped = false;
  const sampleSec = parseInt(opts.sampleSec, 10) || 0; // eșantionare: păstrăm 1 poziție la `sampleSec` secunde (0 = toate)
  const items = []; // { nm, p } — colectăm întâi, ca să pre-încărcăm adresele înainte de a construi rândurile
  for (const imei of imeis) {
    if (items.length >= cap) { capped = true; break; }
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    // Combustibilul CAN vine RAR (nu pe fiecare ping) → cărăm ultima valoare cunoscută („sticky"), ca nivelul să fie
    // CONTINUU (nu se teleportează). Seed din ultima citire dinaintea intervalului, ca să nu avem goluri la început.
    let lastFuel = null;
    try {
      const r = await db.pool.query("SELECT io_data FROM positions WHERE imei = $1 AND timestamp < $2 AND (io_data->>'can_fuel_level_liters' IS NOT NULL OR io_data->>'fuel_level_liters' IS NOT NULL) ORDER BY timestamp DESC LIMIT 1", [imei, from]);
      if (r.rows[0]) { const fv = fuelL({ io_data: r.rows[0].io_data }); if (fv != null) lastFuel = fv; }
    } catch (e) {}
    let lastKept = null; // ultimul moment păstrat (pe vehicul) pentru eșantionare
    for (const p of pts) {
      if (items.length >= cap) { capped = true; break; }
      const fv = fuelL(p); if (fv != null) lastFuel = fv; // actualizează pe FIECARE ping (chiar și cel sărit la eșantionare)
      if (sampleSec > 0) { const tms = t(p); if (lastKept != null && (tms - lastKept) < sampleSec * 1000) continue; lastKept = tms; }
      items.push({ nm, p, fuel: lastFuel });
    }
  }
  // Adresa exactă în loc de coordonate: geocodăm TOATE pozițiile pe backend (serviciul public e ~1/s → buget generos,
  // job în fundal). Cu eșantionare (puține rânduri) se umple tot; cache-ul face rapoartele repetate instant.
  // Pentru rapoarte uriașe („Toate", mii de rânduri) plafonul de timp le lasă parțial → restul se completează în frontend.
  if (geocode && geocode.warm && items.length) {
    const budget = Math.min(items.length * 1100 + 4000, opts.geoBudgetMs || 30000);
    try { await geocode.warm(items.map(x => ({ lat: x.p.latitude, lng: x.p.longitude })), { maxUnique: Math.min(items.length, 1000), budgetMs: budget }); } catch (e) {}
  }
  const rows = []; const perVeh = {}; const order = [];
  for (const { nm, p, fuel } of items) {
    const i = p.io_data || {};
    const row = [ nm, fmtTs(p.timestamp), addr(p), Math.round(p.speed || 0), i.ignition === 1 ? 'DA' : 'NU', fuel != null ? fuel : '—', p.satellites || 0 ];
    rows.push(row);
    if (!perVeh[nm]) { perVeh[nm] = []; order.push(nm); }
    perVeh[nm].push(row);
  }
  // Sumar explicit (nu genericul „Înregistrări"): câte poziții GPS are fiecare vehicul.
  let perVehicle;
  if (order.length >= 2) {
    perVehicle = order.slice().sort((a, b) => a.localeCompare(b)).map(nm => ({ vehicul: nm, summary: [['Poziții GPS', perVeh[nm].length]], rows: perVeh[nm] }));
  }
  return { columns: ['Vehicul', 'Moment', 'Locație', 'Viteză', 'Contact', 'Combustibil', 'Sat.'], rows,
    summary: { 'Total poziții GPS': rows.length, 'Plafon atins': capped ? 'da (' + cap + ')' : 'nu' }, perVehicle };
}

// Legenda scorului EcoDrive — explică notele A–E și cum se calculează.
const ECODRIVE_LEGEND = { title: 'Scorul EcoDrive — cum se citește', items: [
  ['A · 90–100', 'Condus foarte bun, defensiv. Puține sau deloc manevre bruște.'],
  ['B · 75–89', 'Condus bun. Ocazional câte o manevră bruscă.'],
  ['C · 60–74', 'Acceptabil. Manevre bruște sau depășiri de viteză frecvente — loc de îmbunătățit.'],
  ['D · 40–59', 'Slab. Condus agresiv — consum și uzură mari, risc crescut.'],
  ['E · sub 40', 'Foarte slab / riscant. Necesită atenție și instruire urgentă.'],
  ['Cum se calculează', 'Pornește de la 100 și scade pentru accelerări/frânări/viraje bruște, timp peste viteză și ralanti (raportat la 100 km).']
] };

async function rEcoDrive(db, imeis, from, to, opts, devMap) { // EcoDrive — scor comportament șofer
  const limit = opts.limit || 90;
  const HARSH_ACCEL = opts.harshAccel || 7; // km/h pe secundă (~1.9 m/s²)
  const HARSH_BRAKE = opts.harshBrake || 9; // km/h pe secundă (~2.5 m/s²)
  const HARSH_TURN = opts.harshTurn || 25;  // grade/secundă la viteză > 25 km/h
  const rows = []; const evPts = []; let fleetScoreW = 0, fleetKm = 0, fleetVeh = 0, totA = 0, totB = 0, totT = 0; const vehScore = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    let km = 0, accel = 0, brake = 0, hardTurn = 0, speedOverSec = 0, idleSec = 0, driveSec = 0;
    const events = []; // jurnal: { ts, type, detail, p }
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i];
      const dt = (t(p) - t(pr)) / 1000;
      if (dt <= 0 || dt > 300) continue; // ignoră doar pauzele mari (acumularea km/timp acceptă intervale rare)
      const dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
      if (dist < MAX_STEP_KM) km += dist;
      const sp = p.speed || 0, spPr = pr.speed || 0;
      if (sp > limit) speedOverSec += dt;
      if (sp > IDLE_SPEED) driveSec += dt; else if (ignOn(p)) idleSec += dt;
      // evenimentele bruște au sens doar pe intervale scurte (accelerația pe gap mare nu e relevantă)
      if (dt <= 30) {
        const a = (sp - spPr) / dt;
        if (a > HARSH_ACCEL) { accel++; events.push({ ts: p.timestamp, type: 'Accelerare bruscă', detail: '+' + Math.round(a) + ' km/h/s (' + Math.round(spPr) + '→' + Math.round(sp) + ')', p }); }
        if (a < -HARSH_BRAKE) { brake++; events.push({ ts: p.timestamp, type: 'Frânare bruscă', detail: Math.round(a) + ' km/h/s (' + Math.round(spPr) + '→' + Math.round(sp) + ')', p }); }
        if (sp > 25) { let da = Math.abs((p.angle || 0) - (pr.angle || 0)); if (da > 180) da = 360 - da; if (da / dt > HARSH_TURN) { hardTurn++; events.push({ ts: p.timestamp, type: 'Viraj brusc', detail: Math.round(da / dt) + '°/s la ' + Math.round(sp) + ' km/h', p }); } }
      }
    }
    if (km < 0.5 && driveSec < 60) continue;
    const per100 = km > 1 ? 100 / km : 0;
    const speedShare = driveSec > 0 ? speedOverSec / driveSec : 0;
    const idleShare = (driveSec + idleSec) > 0 ? idleSec / (driveSec + idleSec) : 0;
    let pen = 0;
    pen += Math.min(30, accel * per100 * 2.5);
    pen += Math.min(35, brake * per100 * 3.0);
    pen += Math.min(20, hardTurn * per100 * 2.0);
    pen += Math.min(25, speedShare * 100);
    pen += Math.min(15, idleShare * 40);
    const score = Math.max(0, Math.round(100 - pen));
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E';
    events.sort((x, y) => t(x.p) - t(y.p));
    for (const ev of events) { rows.push([ nm, fmtTs(ev.ts), ev.type, ev.detail, loc(ev.p) ]); evPts.push(ev.p); }
    perVeh[nm] = { score, grade, accel, brake, turn: hardTurn, speedOverSec, idleShare, km: Math.round(km) };
    const w = Math.max(1, km); fleetScoreW += score * w; fleetKm += w; fleetVeh++; totA += accel; totB += brake; totT += hardTurn; vehScore.push([nm, score]);
  }
  // Adresă la locul fiecărui eveniment brusc (pre-încarcă + fallback pe coordonate + completare progresivă pe client).
  if (geocode && geocode.warm && evPts.length) {
    try { await geocode.warm(evPts.map(p => ({ lat: p.latitude, lng: p.longitude })), { maxUnique: 300, budgetMs: opts.geoBudgetMs || (imeis.length <= 1 ? 14000 : 8000) }); } catch (e) {}
  }
  rows.forEach((r, i) => { if (evPts[i]) r[4] = addr(evPts[i]); }); // Locație e col. 4
  const topS = _topN(vehScore, 10);
  const charts = vehScore.length ? [
    { type: 'bar',      title: 'Scor EcoDrive pe vehicul',  labels: topS.labels, datasets: [{ label: 'scor', data: topS.data }] },
    { type: 'doughnut', title: 'Evenimente bruște (total)', labels: ['Accelerări', 'Frânări', 'Viraje'], datasets: [{ label: 'evenimente', data: [totA, totB, totT] }] }
  ] : [];
  // Deep-dive: Sumar = scoreboard (Scor/Notă separate); o foaie per mașină = jurnalul ei de evenimente bruște.
  const names = Object.keys(perVeh).sort((a, b) => (perVeh[b].score - perVeh[a].score) || a.localeCompare(b));
  let perVehicle;
  if (names.length >= 1) {
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    perVehicle = names.map(nm => {
      const pv = perVeh[nm];
      return {
        vehicul: nm,
        summary: [['Scor', pv.score], ['Notă', pv.grade], ['Accel. bruște', pv.accel], ['Frânări bruște', pv.brake], ['Viraje bruște', pv.turn], ['Timp peste viteză', fmtDur(pv.speedOverSec)], ['Ralanti', Math.round(pv.idleShare * 100) + '%'], ['Km', pv.km]],
        rows: rowsByName[nm] || [],
        charts: [ { type: 'doughnut', title: 'Evenimente bruște', labels: ['Accelerări', 'Frânări', 'Viraje'], datasets: [{ label: 'evenimente', data: [pv.accel, pv.brake, pv.turn] }] } ]
      };
    });
  }
  return {
    columns: ['Vehicul', 'Data', 'Eveniment', 'Detaliu', 'Locație'],
    rows,
    summary: { 'Scor flotă (0-100)': fleetKm > 0 ? Math.round(fleetScoreW / fleetKm) : 0, 'Vehicule evaluate': fleetVeh, 'Accelerări bruște': totA, 'Frânări bruște': totB, 'Viraje bruște': totT },
    charts, perVehicle, noFleetTotal: true, legend: ECODRIVE_LEGEND // scorurile nu se adună → fără rând TOTAL în Sumar
  };
}

// EcoDrive — clasament pe ȘOFER: agregă metricile vehiculelor după șoferul asignat, scor + notă + rang.
async function rEcoDriveDrivers(db, imeis, from, to, opts, devMap) {
  const limit = opts.limit || 90;
  const HARSH_ACCEL = opts.harshAccel || 7, HARSH_BRAKE = opts.harshBrake || 9, HARSH_TURN = opts.harshTurn || 25;
  const driverName = {};
  try { const dr = await db.pool.query('SELECT id, name FROM drivers'); dr.rows.forEach(r => driverName[r.id] = r.name); } catch (e) {}

  const agg = {}; // key -> bucket agregat pe șofer
  for (const imei of imeis) {
    const dev = devMap[imei] || {};
    const key = dev.driver_id != null ? ('d' + dev.driver_id) : 'none';
    const name = dev.driver_id != null ? (driverName[dev.driver_id] || ('Șofer #' + dev.driver_id)) : 'Fără șofer asignat';
    const b = agg[key] || (agg[key] = { name, vehicles: new Set(), km: 0, accel: 0, brake: 0, hardTurn: 0, speedOverSec: 0, idleSec: 0, driveSec: 0 });
    const pts = await history(db, imei, from, to);
    let vehKm = 0, vehDrive = 0;
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i];
      const dt = (t(p) - t(pr)) / 1000;
      if (dt <= 0 || dt > 300) continue;
      const dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
      if (dist < MAX_STEP_KM) { b.km += dist; vehKm += dist; }
      const sp = p.speed || 0, spPr = pr.speed || 0;
      if (sp > limit) b.speedOverSec += dt;
      if (sp > IDLE_SPEED) { b.driveSec += dt; vehDrive += dt; } else if (ignOn(p)) b.idleSec += dt;
      if (dt <= 30) {
        const a = (sp - spPr) / dt;
        if (a > HARSH_ACCEL) b.accel++;
        if (a < -HARSH_BRAKE) b.brake++;
        if (sp > 25) { let da = Math.abs((p.angle || 0) - (pr.angle || 0)); if (da > 180) da = 360 - da; if (da / dt > HARSH_TURN) b.hardTurn++; }
      }
    }
    if (vehKm >= 0.5 || vehDrive >= 60) b.vehicles.add(imei);
  }

  const scored = []; let fleetScoreW = 0, fleetKm = 0, totA = 0, totB = 0;
  for (const key of Object.keys(agg)) {
    const b = agg[key];
    if (b.km < 0.5 && b.driveSec < 60) continue;
    const per100 = b.km > 1 ? 100 / b.km : 0;
    const speedShare = b.driveSec > 0 ? b.speedOverSec / b.driveSec : 0;
    const idleShare = (b.driveSec + b.idleSec) > 0 ? b.idleSec / (b.driveSec + b.idleSec) : 0;
    let pen = 0;
    pen += Math.min(30, b.accel * per100 * 2.5);
    pen += Math.min(35, b.brake * per100 * 3.0);
    pen += Math.min(20, b.hardTurn * per100 * 2.0);
    pen += Math.min(25, speedShare * 100);
    pen += Math.min(15, idleShare * 40);
    const score = Math.max(0, Math.round(100 - pen));
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E';
    const per100ev = Math.round((b.accel + b.brake + b.hardTurn) * per100 * 10) / 10;
    scored.push({ name: b.name, vehicles: b.vehicles.size, score, grade, accel: b.accel, brake: b.brake, hardTurn: b.hardTurn, per100ev, km: Math.round(b.km) });
    const w = Math.max(1, b.km); fleetScoreW += score * w; fleetKm += w; totA += b.accel; totB += b.brake;
  }
  scored.sort((x, y) => y.score - x.score);
  const rows = scored.map((r, i) => [i + 1, r.name, r.vehicles, r.score + ' · ' + r.grade, r.accel, r.brake, r.hardTurn, r.per100ev, r.km]);
  const topS = _topN(scored.map(s => [s.name, s.score]), 10);
  const topE = _topN(scored.map(s => [s.name, s.per100ev]), 10);
  const charts = scored.length ? [
    { type: 'bar', title: 'Scor EcoDrive pe șofer',     labels: topS.labels, datasets: [{ label: 'scor', data: topS.data }] },
    { type: 'bar', title: 'Evenimente bruște / 100 km', labels: topE.labels, datasets: [{ label: 'ev/100km', data: topE.data }] }
  ] : [];
  return {
    columns: ['Rang', 'Șofer', 'Vehicule', 'Scor · Notă', 'Accel. bruște', 'Frânări bruște', 'Viraje bruște', 'Evenim./100km', 'Km'],
    rows,
    summary: { 'Scor mediu flotă (0-100)': fleetKm > 0 ? Math.round(fleetScoreW / fleetKm) : 0, 'Șoferi evaluați': rows.length, 'Accelerări bruște': totA, 'Frânări bruște': totB }, charts
  };
}

async function rIdling(db, imeis, from, to, opts, devMap) { // Ralanti (motor pornit + staționat)
  const minSec = (opts.idleMin || 3) * 60;
  const lphOverride = opts.idleLph || null; // rată manuală din opțiuni (dacă e setată, prevalează peste tip)
  let totalIdle = 0, totalEvents = 0, totalFuel = 0; const all = []; const perVeh = {}; const items = [];
  const allNames = [...new Set(imeis.map(imei => label(devMap, imei)))]; // TOATE mașinile, în ordine (ca să apară și cele fără ralanti)
  allNames.forEach(nm => { perVeh[nm] = { dur: 0, fuel: 0, n: 0 }; });
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    const cfg = devMap[imei] || {};
    // Rata de estimare (L/h): override manual > valoarea per-vehicul (consumption_idle) > pe tip de mașină.
    const lphV = lphOverride || (parseFloat(cfg.consumption_idle) > 0 ? parseFloat(cfg.consumption_idle) : idleRate(cfg.vehicle_type));
    let start = null, startP = null, last = null, endP = null;
    const flush = () => {
      if (start) {
        const dur = (new Date(last) - new Date(start)) / 1000;
        if (dur >= minSec) {
          // Combustibil: litri REALI din contorul CAN cumulativ (delta start→final), DAR doar dacă rata implicită
          // e plauzibilă (≥ 0.3 L/h). Sub asta = CAN nu măsoară consumul (ex. mașină pe GPL — canul nu citește gazul,
          // sau senzor lipsă) → estimare (durată × L/h). Un ralanti real arde ≥ 0.5 L/h, deci 0.3 e prag sigur.
          const fs = fuelCumul(startP), fe = fuelCumul(endP), hrs = dur / 3600;
          const delta = (fs != null && fe != null && fe >= fs && (fe - fs) < 30) ? (fe - fs) : null; // <30L gardă anti-reset/glitch
          const real = (delta != null && hrs > 0 && (delta / hrs) >= 0.3) ? delta : null;
          const litri = real != null ? real : (dur / 3600 * lphV);
          items.push({ nm, start, end: last, dur, endP, litri, real: real != null });
          totalIdle += dur; totalEvents++; totalFuel += litri; all.push({ ts: start, dur, nm });
          const pv = perVeh[nm] || (perVeh[nm] = { dur: 0, fuel: 0, n: 0 });
          pv.dur += dur; pv.fuel += litri; pv.n++;
        }
        start = null; startP = null; endP = null;
      }
    };
    for (const p of pts) {
      // Ralanti = MOTOR PORNIT (RPM CAN SAU contact) + STAȚIONAT (GPS ≤ 3 — baza sigură, cea care mergea).
      if (engineRunning(p) && (p.speed || 0) <= IDLE_SPEED) { if (!start) { start = p.timestamp; startP = p; } last = p.timestamp; endP = p; }
      else flush();
    }
    flush();
  }
  // Adrese în loc de coordonate (geocode.warm → addr); fallback pe coordonate dacă Nominatim nu apucă în buget.
  if (geocode && geocode.warm && items.length) {
    try { await geocode.warm(items.filter(x => x.endP).map(x => ({ lat: x.endP.latitude, lng: x.endP.longitude })), { maxUnique: 150, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {}
  }
  // Fiecare mașină apare în raport: cele cu ralanti → rândurile lor; cele FĂRĂ → un rând „0/—"
  // (arată clar că n-a avut ralanti, nu dispare din raport). Combustibil: „(CAN)" = real din contor, „(estimat)" = aproximare.
  const itemsByNm = {}; items.forEach(x => { (itemsByNm[x.nm] || (itemsByNm[x.nm] = [])).push(x); });
  const rows = [];
  for (const nm of allNames) {
    const evs = itemsByNm[nm] || [];
    if (evs.length) evs.forEach(x => rows.push([ nm, fmtTs(x.start), fmtTs(x.end), fmtDur(x.dur), x.litri.toFixed(2) + (x.real ? ' (CAN)' : ' (estimat)'), x.endP ? addr(x.endP) : '' ]));
    else rows.push([ nm, '—', '—', '0m', '0', '—' ]); // fără ralanti în perioada aleasă
  }
  const idleDay = _groupByDay(all, x => x.ts, x => x.dur / 60);
  const topV = _topN(Object.entries(perVeh).map(([n, s]) => [n, s.dur / 60]), 10);
  const charts = all.length ? [
    { type: 'bar',      title: 'Ralanti pe zi (min)',             labels: idleDay.labels, datasets: [{ label: 'min', data: idleDay.data }] },
    { type: 'doughnut', title: 'Top vehicule după ralanti (min)', labels: topV.labels,    datasets: [{ label: 'min', data: topV.data }] }
  ] : [];
  const idNames = Object.keys(perVeh).sort((a, b) => a.localeCompare(b));
  let perVehicle;
  if (idNames.length >= 2) {
    const rowsByName = {}; rows.forEach(r => { (rowsByName[String(r[0])] || (rowsByName[String(r[0])] = [])).push(r); });
    perVehicle = idNames.map(nm => {
      const ai = all.filter(x => x.nm === nm), iD = _groupByDay(ai, x => x.ts, x => x.dur / 60);
      return {
        vehicul: nm,
        summary: [['Evenimente ralanti', perVeh[nm].n], ['Timp ralanti', fmtDur(perVeh[nm].dur)], ['Combustibil irosit (L)', Math.round(perVeh[nm].fuel * 100) / 100]],
        rows: rowsByName[nm] || [],
        charts: ai.length ? [{ type: 'bar', title: 'Ralanti pe zi (min)', labels: iD.labels, datasets: [{ label: 'min', data: iD.data }] }] : []
      };
    });
  }
  return { columns: ['Vehicul', 'Început', 'Sfârșit', 'Durată ralanti', 'Combustibil (L)', 'Locație'], rows,
    summary: { 'Evenimente ralanti': totalEvents, 'Timp ralanti total': fmtDur(totalIdle), 'Combustibil irosit (L)': Math.round(totalFuel * 100) / 100 }, charts, perVehicle };
}

async function rCosts(db, imeis, from, to, opts, devMap) { // Costuri combustibil (din consum + preț/vehicul)
  const cm = await _consumptionMap(db, imeis, from, to, opts);
  const rows = []; let tKm = 0, tCons = 0, tCost = 0; const vCost = [], vPerKm = [];
  for (const imei of imeis) {
    const m = cm[imei]; if (!m) continue;
    const cost = m.consumed * m.price, perKm = m.dist > 1 ? cost / m.dist : 0;
    const nm = label(devMap, imei);
    rows.push([nm, Math.round(m.dist), m.consumed.toFixed(0) + ' L' + (m.estimated ? ' (est.)' : ''), m.price.toFixed(2), Math.round(cost) + ' RON', perKm ? perKm.toFixed(2) + ' RON' : '—']);
    tKm += m.dist; tCons += m.consumed; tCost += cost; vCost.push([nm, cost]); if (perKm) vPerKm.push([nm, perKm]);
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4]));
  const topC = _topN(vCost, 10), topK = _topN(vPerKm, 10);
  const charts = vCost.length ? [
    { type: 'bar', title: 'Cost combustibil pe vehicul (RON)', labels: topC.labels, datasets: [{ label: 'RON', data: topC.data }] },
    { type: 'bar', title: 'Cost pe km (RON)',                  labels: topK.labels, datasets: [{ label: 'RON/km', data: topK.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Km efectuați', 'Consumat', 'Preț (RON/L)', 'Cost combustibil', 'Cost/km'], rows,
    summary: { 'Total vehicule': imeis.length, 'Km total flotă': Math.round(tKm), 'Consum total (L)': Math.round(tCons), 'Cost total (RON)': Math.round(tCost) }, charts, summarySheet: true };
}

// Legenda pt. Emisii CO₂ (setată pe raport → randată online, în Excel și PDF).
const EMISSIONS_LEGEND = { title: 'Cum se calculează CO₂', items: [
  ['Formulă', 'CO₂ = consum (litri) × factorul combustibilului.  CO₂/km = CO₂ ÷ km.'],
  ['Motorină', '2.68 kg CO₂ / litru'],
  ['Benzină', '2.31 kg CO₂ / litru'],
  ['GPL', '1.55 kg CO₂ / litru'],
  ['Sursă', 'CO₂-ul e la fel de exact ca și consumul din care vine: CAN (contor) > Senzor (nivel) > Estimat (din fișă).']
] };
async function rEmissions(db, imeis, from, to, opts, devMap) { // Emisii CO₂ (din consum carburant)
  const cm = await _consumptionMap(db, imeis, from, to, opts);
  const rows = []; let tCo2 = 0, tKm = 0, tCons = 0; const vCo2 = [], vPerKm = [];
  for (const imei of imeis) {
    const m = cm[imei]; if (!m) continue;
    const co2 = m.consumed * co2For(m.fuelType, opts); // factor pe tipul de combustibil (motorină/benzină/GPL)
    const perKm = m.dist > 1 ? co2 / m.dist * 1000 : 0; // g/km
    const nm = label(devMap, imei);
    const ftL = m.fuelType ? (_FUEL_LABEL[String(m.fuelType).toLowerCase()] || m.fuelType) : '—';
    const co2t = co2 / 1000; // kg → TONE (unitatea standard de raportare CO₂: ESG / arobs). Zecimale mai multe sub 1 t.
    rows.push([nm, ftL, Math.round(m.dist), m.consumed.toFixed(0) + ' L', co2t.toFixed(co2t < 1 ? 3 : 2) + ' t', perKm ? Math.round(perKm) + ' g/km' : '—', m.source]);
    tCo2 += co2; tKm += m.dist; tCons += m.consumed; vCo2.push([nm, +co2t.toFixed(3)]); if (perKm) vPerKm.push([nm, perKm]);
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4])); // după CO₂ (col. 4, în tone)
  const topC = _topN(vCo2, 10), topK = _topN(vPerKm, 10);
  const charts = vCo2.length ? [
    { type: 'bar', title: 'CO₂ pe vehicul (t)', labels: topC.labels, datasets: [{ label: 't', data: topC.data }] },
    { type: 'bar', title: 'CO₂ pe km (g/km)',    labels: topK.labels, datasets: [{ label: 'g/km', data: topK.data }] }
  ] : [];
  return {
    columns: ['Vehicul', 'Combustibil', 'Km', 'Consum', 'CO₂ (t)', 'CO₂/km', 'Sursă'], rows,
    summary: { 'CO₂ total (t)': (tCo2 / 1000).toFixed(2), 'Consum total (L)': Math.round(tCons), 'Km total': Math.round(tKm), 'CO₂ mediu (g/km)': tKm > 1 ? Math.round(tCo2 / tKm * 1000) : '—' },
    charts, summarySheet: true, legend: EMISSIONS_LEGEND
  };
}

// Catalog: cat = monitorizare | consum | can | evenimente | siguranta
function fmtDate(d) { try { return new Date(d).toLocaleDateString('ro-RO', { timeZone: DISPLAY_TZ }); } catch (e) { return String(d || ''); } }
function _dueStatus(days) { return days < 0 ? 'Depășit' : days <= 7 ? 'Critic' : days <= 30 ? 'Curând' : 'OK'; }

// ── Model de consum ROBUST (sursă unică pentru Consum / Costuri / Costuri-totale / Emisii) ───────────────
// Senzorul de nivel e folosit DOAR dacă dă un L/100km plauzibil (1..200) pe distanță reală; altfel estimează
// din km × consum-pe-tip + ralanti. Gardă de timp pe distanță (dt<=300s) și pe realimentări (salt după o pauză
// mare = ignorat). Întoarce un map imei -> metrici. Oglindește logica din fuelStats (pagina „Statistici consum").
async function _consumptionMap(db, imeis, from, to, opts) {
  opts = opts || {};
  const refuelMin = opts.refuelMin || 5, idleLph = opts.idleLph || 1.5, MAX_PER100 = 200;
  const cfg = {};
  try { (await db.pool.query('SELECT imei, fuel_price, fuel_type, vehicle_type, consumption_road, consumption_city, consumption_idle FROM devices')).rows.forEach(d => { cfg[d.imei] = { price: parseFloat(d.fuel_price), fuelType: d.fuel_type || null, vtype: d.vehicle_type || null, cRoad: parseFloat(d.consumption_road) || parseFloat(d.consumption_city) || null, cIdle: parseFloat(d.consumption_idle) || null }; }); } catch (e) {}
  const out = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refueled = 0, dist = 0, prevFuel = null, prevFuelTs = 0, idleSec = 0, prevP = null;
    let cumulSum = 0, prevCumul = null, cumulSeen = false, dropSum = 0; // contor incremente + sumă scăderi de nivel
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p), ts = t(p);
      const fc = fuelCumul(p); if (fc != null) { if (prevCumul != null) { const dc = fc - prevCumul; if (dc > 0 && dc < 100) cumulSum += dc; } prevCumul = fc; cumulSeen = true; }
      if (fl != null) {
        if (first == null) first = fl; last = fl;
        if (prevFuel != null && (ts - prevFuelTs) <= 3600 * 1000) { const d = fl - prevFuel; if (d >= refuelMin) refueled += d; const dd = prevFuel - fl; if (dd >= 0.4 && dd < 40) dropSum += dd; }
        prevFuel = fl; prevFuelTs = ts;
      }
      if (i > 0) { const pr = pts[i - 1], dt = (ts - t(pr)) / 1000, dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dt > 0 && dt <= 300 && dd < MAX_STEP_KM) dist += dd; }
      if (ignOn(p) && (p.speed || 0) <= IDLE_SPEED && prevP && ignOn(prevP) && (prevP.speed || 0) <= IDLE_SPEED) { const dt = (new Date(p.timestamp) - new Date(prevP.timestamp)) / 1000; if (dt > 0 && dt < 3600) idleSec += dt; }
      prevP = p;
    }
    const c = cfg[imei] || {};
    const price = resolvePrice(c, opts);
    const cRoad = c.cRoad || defConsumption(c.vtype);
    const idleL = idleSec / 3600 * (c.cIdle || idleLph);
    const hasFuel = first != null;
    // Contor cumulativ (cel mai exact) — preferat înaintea scăderii de nivel.
    const cumulL = (cumulSeen && cumulSum > 0) ? cumulSum : null;
    const cumulPer100 = (cumulL != null && dist > 1) ? (cumulL / dist * 100) : null;
    const cumulOk = cumulL != null && cumulL > 0 && dist > 1 && cumulPer100 >= 1 && cumulPer100 <= MAX_PER100;
    const sensorL = dropSum; // consum din nivel = suma scăderilor reale (gestionează alimentări/grad. automat)
    const sensorPer100 = (sensorL > 0 && dist > 1) ? (sensorL / dist * 100) : null;
    // Prag minim 3 L/100km: sub atât pe distanță reală = ac „gros" (în trepte) care a ratat consum → NU-l credem,
    // trecem pe estimare (evită cifre absurd de mici, gen 1.6 L/100km la Caddy). Contorul CAN cumulativ NU are pragul ăsta (e exact).
    const sensorOk = sensorL > 0 && dist > 1 && sensorPer100 >= 3 && sensorPer100 <= MAX_PER100;
    let consumed = cumulOk ? cumulL : (sensorOk ? sensorL : (dist * cRoad / 100 + idleL));
    if (consumed < idleL) consumed = idleL;
    const per100 = dist > 1 ? +(consumed / dist * 100).toFixed(1) : null;
    // Sursa consumului, în ordinea încrederii: contor cumulativ CAN > nivel rezervor plauzibil > are senzor de nivel
    // CAN dar prea grosier pt. scăderi mici (consum estimat, dar mașina NU e oarbă) > fără nicio dată (pur din fișă).
    const source = cumulOk ? 'CAN' : (sensorOk ? 'Senzor' : (hasFuel ? 'Estimat (nivel CAN)' : 'Estimat'));
    out[imei] = { dist, consumed, refueled, idleSec, idleL, estimated: !(cumulOk || sensorOk), source, hasFuel: hasFuel || cumulL != null, per100, price, first, last, fuelType: c.fuelType || null };
  }
  return out;
}

// ── Raport NOU: Scadențe documente & service (expirări ITP/RCA/roviniete/tahograf + revizii) ─────────────
async function rDocServiceDue(db, imeis, from, to, opts, devMap) {
  // Documente + service, pe DATĂ și pe KM. „Zile rămase" mereu față de AZI. Include ȘI service-ul EFECTUAT (cu data + km).
  const n0 = new Date(); const ref = new Date(n0.getFullYear(), n0.getMonth(), n0.getDate());
  const showAll = !!(opts && opts.all); // „Tot" → fără orizont (arată chiar tot); altfel filtrăm „până la finalul lunii alese"
  const horizon = showAll ? null : (to ? new Date(to) : null); // filtrează doar scadențele pe DATĂ; km + efectuate rămân mereu
  const items = [];
  const rank = { 'Depășit': 0, 'Critic': 1, 'Curând': 2, 'OK': 3, '—': 4, 'Efectuat': 5 };
  const ramasZile = (days) => days < 0 ? Math.abs(days) + ' zile în urmă' : (days === 0 ? 'azi' : days + ' zile');
  // Odometru curent per vehicul (pt. km rămași la service pe km)
  const odoMap = {};
  try {
    const rr = await db.pool.query('SELECT DISTINCT ON (imei) imei, io_data FROM positions WHERE imei = ANY($1) ORDER BY imei, timestamp DESC', [imeis]);
    for (const row of rr.rows) { const km = _odoNow(row.io_data); if (km) odoMap[row.imei] = km; }
  } catch (e) {}
  // Documente (scadență pe DATĂ)
  try {
    const r = await db.pool.query('SELECT imei, doc_type, expiry_date FROM vehicle_documents WHERE imei = ANY($1) AND expiry_date IS NOT NULL', [imeis]);
    for (const d of r.rows) { if (horizon && new Date(d.expiry_date) > horizon) continue; const days = Math.floor((new Date(d.expiry_date) - ref) / 86400000); const st = _dueStatus(days);
      items.push({ sk1: rank[st], sk2: days, row: [ label(devMap, d.imei), 'Document', d.doc_type || '—', fmtDate(d.expiry_date) + ' (' + ramasZile(days) + ')', '—', st ] }); }
  } catch (e) {}
  // Mentenanță — scadente (pe dată / pe km) ȘI efectuate (cu data + km la care s-au făcut)
  try {
    const r = await db.pool.query('SELECT imei, type, due_date, due_km, done_date, done_km, status FROM maintenance WHERE imei = ANY($1)', [imeis]);
    for (const m of r.rows) {
      const nm = label(devMap, m.imei);
      if (m.status === 'done') {
        const scad = m.due_date ? fmtDate(m.due_date) : (m.due_km != null ? 'la ' + _grp(m.due_km) + ' km' : '—');
        const efect = (m.done_date ? fmtDate(m.done_date) : '—') + (m.done_km != null ? ' · ' + _grp(m.done_km) + ' km' : '');
        items.push({ sk1: 5, sk2: -(m.done_date ? new Date(m.done_date).getTime() : 0), row: [ nm, 'Service', m.type || '—', scad, efect, 'Efectuat' ] });
      } else {
        if (m.due_date != null && !(horizon && new Date(m.due_date) > horizon)) { const days = Math.floor((new Date(m.due_date) - ref) / 86400000); const st = _dueStatus(days);
          items.push({ sk1: rank[st], sk2: days, row: [ nm, 'Service', m.type || '—', fmtDate(m.due_date) + ' (' + ramasZile(days) + ')', '—', st ] }); }
        if (m.due_km != null) { const odo = odoMap[m.imei]; const kmLeft = odo != null ? (m.due_km - odo) : null;
          const st = kmLeft == null ? '—' : (kmLeft < 0 ? 'Depășit' : kmLeft <= 500 ? 'Critic' : kmLeft <= 2000 ? 'Curând' : 'OK');
          const detail = kmLeft == null ? 'fără odometru' : (kmLeft < 0 ? '~' + _grp(-kmLeft) + ' km în urmă' : '~' + _grp(kmLeft) + ' km');
          items.push({ sk1: rank[st], sk2: kmLeft == null ? 1e12 : kmLeft, row: [ nm, 'Service (km)', m.type || '—', 'la ' + _grp(m.due_km) + ' km (' + detail + ')', '—', st ] }); }
      }
    }
  } catch (e) {}
  items.sort((a, b) => (a.sk1 - b.sk1) || (a.sk2 - b.sk2)); // scadente după urgență (Depășit→…→OK), efectuatele la final (cele mai recente primele)
  const rows = items.map(x => x.row);
  // Foaie SEPARATĂ per mașină în Excel (+ selector online) — grupăm rândurile pe vehicul. FĂRĂ sumar: nici foaia „Sumar" (noSummarySheet), nici tabelul „Sumar pe vehicul" online (noVehSummary).
  const groups = {}, order = [];
  for (const r of rows) { const k = String(r[0]); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); }
  const perVehicle = order.length >= 2 ? order.sort((a, b) => a.localeCompare(b)).map(nm => ({ vehicul: nm, summary: [], rows: groups[nm] })) : undefined;
  // Etichetă de perioadă cu sens (nu interval de date fals): „Toate scadențele" / „Scadențe până la <dată>".
  const periodLabel = showAll ? ('Toate scadențele (la zi: ' + fmtDate(ref) + ')') : ('Scadențe până la ' + fmtDate(to));
  return { columns: ['Vehicul', 'Categorie', 'Tip', 'Scadență', 'Efectuat', 'Stare'], rows, perVehicle, periodLabel, noSummarySheet: true, noVehSummary: true };
}

// ── Raport: Disponibilitate flotă — zile active/inactive cu DATE exacte, cea mai lungă pauză, ultima poziție, semnal ──
async function rFleetUptime(db, imeis, from, to, opts, devMap) {
  const fromMs = new Date(from).getTime(), toMs = new Date(to).getTime(), span = Math.max(1, toMs - fromMs);
  // Toate zilele calendaristice din interval (chei YYYY-MM-DD în fusul afișat) → pentru a lista exact zilele inactive.
  const uniqDays = []; { const seen = new Set();
    for (let ms = fromMs; ms <= toMs; ms += 86400000) { const k = _dayKeyISO(new Date(ms).toISOString()); if (k && !seen.has(k)) { seen.add(k); uniqDays.push(k); } }
    const kL = _dayKeyISO(new Date(toMs).toISOString()); if (kL && !seen.has(kL)) { seen.add(kL); uniqDays.push(kL); }
  }
  const items = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const moveDays = new Set(); let maxGap = 0, gapStart = null, gapEnd = null, prevTs = fromMs, lastTs = null, satSum = 0, satN = 0;
    for (const p of pts) {
      const ts = t(p); if (ts - prevTs > maxGap) { maxGap = ts - prevTs; gapStart = prevTs; gapEnd = ts; } prevTs = ts; // O SINGURĂ pauză (nu însumată)
      if ((p.speed || 0) > IDLE_SPEED) moveDays.add(_dayKeyISO(p.timestamp));
      const s = p.satellites; if (typeof s === 'number' && s > 0) { satSum += s; satN++; }
      lastTs = ts;
    }
    if (toMs - prevTs > maxGap) { maxGap = toMs - prevTs; gapStart = prevTs; gapEnd = toMs; } // pauză până la finalul perioadei
    // Zile active / inactive cu DATE exacte (DD.MM.YYYY), sortate cronologic.
    const activeKeys = Array.from(moveDays).sort();
    const inactiveKeys = uniqDays.filter(k => !moveDays.has(k));
    const listTxt = (keys) => keys.length ? keys.length + ' zile: ' + keys.map(_dayLabelFull).join(', ') : '0 zile'; // separat, fiecare dată (cerut)
    // Semnal pe perioadă: Inexistent (nimic / tăcut pe a doua jumătate = offline) · Bun (fix GPS bun + transmisie constantă) · Slab (rest).
    const avgSat = satN ? Math.round(satSum / satN) : 0;
    const tailFrac = lastTs ? (toMs - lastTs) / span : 1;
    let signal;
    if (pts.length === 0 || tailFrac > 0.5) signal = 'Inexistent';
    else if (avgSat >= 8 && maxGap <= span * 0.5) signal = 'Bun (' + avgSat + ' sat.)';
    else signal = 'Slab' + (satN ? ' (' + avgSat + ' sat.)' : '');
    const nm = label(devMap, imei);
    items.push({ idle: inactiveKeys.length,
      row: [ nm, listTxt(activeKeys), listTxt(inactiveKeys),
        fmtDur(maxGap / 1000) + (maxGap > 0 && gapStart != null ? '  ·  ' + fmtTsMin(gapStart) + ' → ' + fmtTsMin(gapEnd) : ''),
        lastTs ? fmtTs(new Date(lastTs).toISOString()) : '—', signal ] });
  }
  items.sort((a, b) => b.idle - a.idle); // cele mai inactive primul
  const rows = items.map(x => x.row);
  const topIdle = _topN(items.filter(x => x.idle > 0).map(x => [x.row[0], x.idle]), 10);
  const charts = topIdle.labels.length ? [
    { type: 'bar', title: 'Zile inactive pe vehicul', labels: topIdle.labels, datasets: [{ label: 'zile', data: topIdle.data }] }
  ] : [];
  // FĂRĂ sumar (cerut).
  return { columns: ['Vehicul', 'Zile active', 'Zile inactive', 'Cea mai lungă pauză', 'Ultima poziție', 'Semnal'], rows, charts };
}

// ── Raport NOU: Anomalii combustibil cu scor de încredere (furt vs consum vs zgomot) ────────────────────
// Legenda scorului de suspiciune (setată pe raport → randată identic online, în Excel și PDF).
const ANOMALY_LEGEND = { title: 'Scorul de suspiciune — cum se citește', items: [
  ['Risc ridicat (75–100)', 'Scădere greu de explicat normal: motor stins + staționat + cantitate mare. Merită verificată.'],
  ['Risc mediu (55–74)', 'Scădere suspectă, dar nu certă — poate avea și o cauză normală.'],
  ['Scăderi minore (sub 55)', 'Probabil consum normal sau oscilație de senzor — nealarmant.'],
  ['OK — fără anomalii', 'Mașina raportează nivel prin CAN și nu a avut nicio scădere suspectă.'],
  ['Fără date CAN', 'Mașina nu raportează nivel (ex. pe GPL) — nu poate fi verificată automat aici.']
] };
// Raport de INTEGRITATE combustibil pe flotă: fiecare vehicul apare MEREU cu o stare (chiar dacă e curat) — nu ecran
// gol → crește încrederea userului. O linie/mașină; fiecare scădere primește un scor de suspiciune 0–100.
async function rFuelAnomaly(db, imeis, from, to, opts, devMap) {
  const dropMin = opts.dropMin || 10;
  const rows = [], worstPts = []; // worstPts[i] = punctul celei mai suspecte scăderi a mașinii i (pt. geocodare)
  let high = 0, med = 0, clean = 0, noData = 0;
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const pts = await history(db, imei, from, to);
    let prev = null, hadFuel = false; const events = [];
    for (const p of pts) {
      const fl = fuelL(p); if (fl == null) continue; hadFuel = true;
      if (prev != null) {
        const delta = fl - prev.v, ign = ignOn(p) || ignOn(prev.p), gapH = (t(p) - prev.ts) / 3600000;
        // Motor STINS (parcat) → scăderea e suspectă chiar și peste noapte (până la 72h); pornit → doar citiri apropiate (<1h).
        if (delta <= -dropMin && ((!ign && gapH <= 72) || (ign && gapH <= 1))) {
          const drop = -delta, moving = (p.speed || 0) > IDLE_SPEED;
          let score = 40;
          if (!ign) score += 30;                 // motor stins → nu poate fi consum
          if (!moving) score += 15;              // staționat
          if (drop >= 30) score += 15; else if (drop >= 15) score += 8;
          events.push({ score: Math.min(100, score), drop, ts: p.timestamp, p });
        }
      }
      prev = { v: fl, ts: t(p), p };
    }
    // O linie de STARE per vehicul — mereu, chiar dacă e curat.
    if (!hadFuel) {                          // ex. pe GPL / fără senzor — nu poate fi verificat
      rows.push([nm, 'Fără date CAN', '—', '—', '—', '—', '—']); worstPts.push(null); noData++;
    } else if (!events.length) {             // are date CAN, nicio scădere → curat
      rows.push([nm, 'OK — fără anomalii', 0, '—', '—', '—', '—']); worstPts.push(null); clean++;
    } else {
      events.sort((a, b) => b.score - a.score);
      const worst = events[0], totalDrop = events.reduce((s, e) => s + e.drop, 0);
      const stare = worst.score >= 75 ? 'Risc ridicat' : worst.score >= 55 ? 'Risc mediu' : 'Scăderi minore';
      if (worst.score >= 75) high++; else if (worst.score >= 55) med++; else clean++;
      rows.push([nm, stare, events.length, worst.score, totalDrop.toFixed(1) + ' L', fmtTs(worst.ts), loc(worst.p)]);
      worstPts.push(worst.p);
    }
  }
  // Adresă exactă pt. cea mai suspectă scădere (una/mașină suspectă) — ÎNAINTE de sortare (o „coacem" în r[6]).
  if (geocode && geocode.warm) {
    const coords = worstPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude }));
    if (coords.length) { try { await geocode.warm(coords, { maxUnique: 100, budgetMs: imeis.length <= 1 ? 12000 : 8000 }); } catch (e) {} }
  }
  rows.forEach((r, i) => { if (worstPts[i]) r[6] = addr(worstPts[i]); });
  // Sortare: suspecte (scor mare) sus → OK (scor 0) → Fără date CAN („—") la coadă.
  const sk = v => (v === '—' || v == null ? -1 : Number(v));
  rows.sort((a, b) => sk(b[3]) - sk(a[3]));
  const charts = [{ type: 'doughnut', title: 'Starea flotei', labels: ['Fără probleme', 'Risc mediu', 'Risc ridicat', 'Fără date CAN'], datasets: [{ label: 'vehicule', data: [clean, med, high, noData] }] }];
  return { columns: ['Vehicul', 'Stare', 'Anomalii', 'Scor max', 'Litri scăzuți', 'Data', 'Locație'], rows,
    summary: { 'Total vehicule': imeis.length, 'Fără probleme': clean, 'Risc mediu': med, 'Risc ridicat': high, 'Fără date CAN': noData },
    charts, summarySheet: true, legend: ANOMALY_LEGEND };
}

// Serie zilnică pt. grafice: ultima/max valoare pe zi, sau nr. pe zi. readings: [{ts, v}] cronologic → {labels, data}.
function _dailySeries(readings, agg) {
  const byDay = {}, order = [];
  for (const r of readings) {
    const k = _dayKeyISO(r.ts); if (!k) continue;
    if (!(k in byDay)) { byDay[k] = (agg === 'count' ? 0 : null); order.push(k); }
    if (agg === 'count') byDay[k] += 1;
    else if (agg === 'max') byDay[k] = (byDay[k] == null ? r.v : Math.max(byDay[k], r.v));
    else byDay[k] = r.v; // 'last'
  }
  order.sort();
  return { labels: order.map(_dayLabel), data: order.map(k => Math.round((byDay[k] || 0) * 10) / 10) };
}

// Grafice pt. rapoartele de senzori: 1 bară „total pe vehicul" + câte o serie zilnică/mașină (max 16).
function _senzChart(vTotal, vSeries, totalTitle, unit, perTitlePrefix, perType) {
  const charts = [];
  if (vTotal.length) { const t = _topN(vTotal, 20); charts.push({ type: 'bar', title: totalTitle, labels: t.labels, datasets: [{ label: unit, data: t.data }] }); }
  vSeries.slice(0, 16).forEach(v => { if (v.s.labels.length) charts.push({ type: perType || 'line', title: perTitlePrefix + v.nm, labels: v.s.labels, datasets: [{ label: unit, data: v.s.data }] }); });
  return charts;
}

// ── Rapoarte SENZORI: sondă litrometrică · greutate · basculare · IoT ──────────────────────────────
// Rărește o serie la ~maxN puncte, uniform, păstrând ultimul.
function _sampleSeries(arr, maxN) {
  if (arr.length <= maxN) return arr;
  const out = [], step = arr.length / maxN;
  for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * step)]);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}
async function rFuelProbe(db, imeis, from, to, opts, devMap) { // Sondă litrometrică — analiză per-mașină (grafic multi-metric + jurnal evenimente)
  const refuelMin = opts.refuelMin || 5, dropMin = opts.dropMin || 10;
  const rows = [], evPts = [], perVehicle = [], vLevel = [];
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const d = devMap[imei] || {};
    const cap = parseFloat(d.tank_capacity) || 0;
    const calRaw = d.tank_calibration;
    const calibrated = !!(calRaw && (Array.isArray(calRaw) ? calRaw.length : (typeof calRaw === 'object' ? Object.keys(calRaw).length : 0)));
    const pts = await history(db, imei, from, to);
    let last = null, tip = null, prevFl = null, prevTs = 0, fills = 0, drops = 0;
    const series = [], vEvRows = [], vEvPts = [];
    for (const p of pts) {
      const i = io(p);
      let fl = null, tp = null;
      if (i.tank_level_liters != null) { fl = parseFloat(i.tank_level_liters); tp = 'Analogică'; }
      else if (i.ble_fuel_level_1 != null) { fl = parseFloat(i.ble_fuel_level_1); tp = 'BLE'; }
      if (fl == null || !isFinite(fl) || fl < 0) continue;
      last = fl; tip = tp;
      series.push({ ts: p.timestamp, fuel: +fl.toFixed(1), speed: Math.round(p.speed || 0) });
      if (prevFl != null) {
        const delta = fl - prevFl, gapH = (t(p) - prevTs) / 3600000, eng = ignOn(p);
        if (delta >= refuelMin && gapH <= 1) { vEvRows.push([nm, fmtTs(p.timestamp), 'Alimentare', '+' + delta.toFixed(1) + ' L', fl.toFixed(0) + ' L', loc(p)]); vEvPts.push(p); fills++; }
        else if (delta <= -dropMin && ((!eng && gapH <= 72) || (eng && gapH <= 1))) { vEvRows.push([nm, fmtTs(p.timestamp), eng ? 'Scădere' : 'Scădere/furt', delta.toFixed(1) + ' L', fl.toFixed(0) + ' L', loc(p)]); vEvPts.push(p); drops++; }
      }
      prevFl = fl; prevTs = t(p);
    }
    if (last == null) { const r = [nm, '—', 'Fără sondă', '—', '—', '—']; rows.push(r); evPts.push(null); perVehicle.push({ vehicul: nm, summary: [['Nivel', '—'], ['Tip sondă', 'Fără sondă'], ['Calibrare', '—'], ['Alimentări', 0], ['Scăderi', 0]], rows: [r], charts: [] }); continue; } // fără sondă → tot cu foaie proprie (structură de sumar identică pt. foaia Sumar)
    if (!vEvRows.length) { const r = [nm, '—', '(fără evenimente)', '—', '—', '—']; vEvRows.push(r); vEvPts.push(null); }
    vEvRows.forEach((r, k) => { rows.push(r); evPts.push(vEvPts[k]); });
    // Grafic multi-metric: Nivel combustibil (stânga) + Viteză (dreapta) în timp.
    const S = _sampleSeries(series, 120), labels = S.map(s => fmtTsMin(s.ts));
    const charts = [{ type: 'line', title: 'Nivel combustibil vs viteză — ' + nm, labels, datasets: [
      { label: 'Nivel combustibil (L)', data: S.map(s => s.fuel), yAxisID: 'y' },
      { label: 'Viteză (km/h)', data: S.map(s => s.speed), yAxisID: 'y1' }
    ] }];
    const pct = cap > 0 ? Math.round(last / cap * 100) : null;
    perVehicle.push({ vehicul: nm, summary: [['Nivel', last.toFixed(0) + ' L' + (pct != null ? ' (' + pct + '%)' : '')], ['Tip sondă', tip], ['Calibrare', tip === 'Analogică' ? (calibrated ? 'Da' : 'Nu') : '—'], ['Alimentări', fills], ['Scăderi', drops]], rows: vEvRows, charts });
    vLevel.push([nm, Math.round(last)]);
  }
  if (geocode && geocode.warm) { const c = evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (evPts[i]) r[5] = addr(evPts[i]); }); // adresele „se coc" în rânduri (perVehicle folosește aceleași referințe)
  const charts = vLevel.length ? [{ type: 'bar', title: 'Nivel curent pe vehicul (L)', labels: _topN(vLevel, 20).labels, datasets: [{ label: 'L', data: _topN(vLevel, 20).data }] }] : [];
  return {
    columns: ['Vehicul', 'Data', 'Eveniment', 'Δ litri', 'Nivel', 'Locație'], rows,
    perVehicle, charts,
    summary: { 'Total vehicule': imeis.length, 'Cu sondă': vLevel.length, 'Necalibrate': perVehicle.filter(v => v.summary.some(s => s[0] === 'Calibrare' && s[1] === 'Nu')).length },
    legend: { title: 'Sondă litrometrică — analiză', items: [
      ['Grafic', 'Nivel combustibil (axa stângă) + Viteză (axa dreaptă) în timp → vezi scăderile corelate cu deplasarea.'],
      ['Alimentare', 'Nivelul a urcat (realimentare).'],
      ['Scădere', 'Nivel scăzut cu motorul PORNIT — de regulă consum normal.'],
      ['Scădere/furt', 'Nivel scăzut cu motorul STINS — suspect (furt/scurgere).'],
      ['Fără sondă', 'Vehiculul nu are sondă litrometrică montată.']
    ] }
  };
}

async function rWeight(db, imeis, from, to, opts, devMap) { // Senzori greutate — analiză per-mașină (jurnal încărcări/descărcări/supraîncărcări + grafic cu limită)
  const wMin = opts.weightMin || 500; // prag pt. eveniment de încărcare/descărcare (kg); sub atât = zgomot
  const rows = [], evPts = [], perVehicle = [], vMax = [];
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const d = devMap[imei] || {};
    const payload = parseFloat(d.payload) || 0; // sarcina utilă (limită) din fișă
    const pts = await history(db, imei, from, to);
    let last = null, max = null, prevW = null, loads = 0, unloads = 0, overs = 0, overNow = false, hadW = false;
    const series = [], vEvRows = [], vEvPts = [];
    for (const p of pts) {
      const i = io(p);
      const present = i.can_load_weight != null || i.can_axle1_load != null || i.can_axle2_load != null || i.can_axle3_load != null || i.can_axle4_load != null || i.can_axle5_load != null;
      if (!present) continue;
      let w = parseFloat(i.can_load_weight);
      if (!isFinite(w)) w = [i.can_axle1_load, i.can_axle2_load, i.can_axle3_load, i.can_axle4_load, i.can_axle5_load].reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (!isFinite(w) || w < 0) continue;
      hadW = true; last = w; if (max == null || w > max) max = w;
      series.push({ ts: p.timestamp, w: Math.round(w) });
      if (prevW != null) {
        const delta = w - prevW;
        if (delta >= wMin) { vEvRows.push([nm, fmtTs(p.timestamp), 'Încărcare', '+' + _grp(Math.round(delta)) + ' kg', _grp(Math.round(w)) + ' kg', loc(p)]); vEvPts.push(p); loads++; }
        else if (delta <= -wMin) { vEvRows.push([nm, fmtTs(p.timestamp), 'Descărcare', '-' + _grp(Math.round(-delta)) + ' kg', _grp(Math.round(w)) + ' kg', loc(p)]); vEvPts.push(p); unloads++; }
      }
      if (payload > 0 && w > payload) { if (!overNow) { vEvRows.push([nm, fmtTs(p.timestamp), 'Supraîncărcare', '+' + _grp(Math.round(w - payload)) + ' kg', _grp(Math.round(w)) + ' kg', loc(p)]); vEvPts.push(p); overs++; overNow = true; } }
      else overNow = false;
      prevW = w;
    }
    if (!hadW) { const r = [nm, '—', 'Fără senzor', '—', '—', '—']; rows.push(r); evPts.push(null); perVehicle.push({ vehicul: nm, summary: [['Greutate', '—'], ['Greutate max', '—'], ['Sarcină utilă', '—'], ['Încărcări', 0], ['Descărcări', 0], ['Supraîncărcări', 0]], rows: [r], charts: [] }); continue; }
    if (!vEvRows.length) { const r = [nm, '—', '(fără evenimente)', '—', '—', '—']; vEvRows.push(r); vEvPts.push(null); }
    vEvRows.forEach((r, k) => { rows.push(r); evPts.push(vEvPts[k]); });
    const S = _sampleSeries(series, 120), labels = S.map(s => fmtTsMin(s.ts));
    const datasets = [{ label: 'Greutate (kg)', data: S.map(s => s.w), yAxisID: 'y' }];
    if (payload > 0) datasets.push({ label: 'Sarcină utilă (kg)', data: S.map(() => payload), yAxisID: 'y' });
    perVehicle.push({ vehicul: nm, summary: [['Greutate', _grp(Math.round(last)) + ' kg'], ['Greutate max', _grp(Math.round(max)) + ' kg'], ['Sarcină utilă', payload > 0 ? _grp(payload) + ' kg' : '—'], ['Încărcări', loads], ['Descărcări', unloads], ['Supraîncărcări', overs]], rows: vEvRows, charts: [{ type: 'line', title: 'Greutate în timp — ' + nm, labels, datasets }] });
    vMax.push([nm, Math.round(max)]);
  }
  if (geocode && geocode.warm) { const c = evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (evPts[i]) r[5] = addr(evPts[i]); });
  const charts = vMax.length ? [{ type: 'bar', title: 'Greutate max pe vehicul (kg)', labels: _topN(vMax, 20).labels, datasets: [{ label: 'kg', data: _topN(vMax, 20).data }] }] : [];
  return {
    columns: ['Vehicul', 'Data', 'Eveniment', 'Δ greutate', 'Greutate', 'Locație'], rows,
    perVehicle, charts,
    summary: { 'Total vehicule': imeis.length, 'Cu senzor greutate': vMax.length, 'Supraîncărcări (total)': perVehicle.reduce((s, v) => s + (v.summary.find(x => x[0] === 'Supraîncărcări') || [0, 0])[1], 0) },
    legend: { title: 'Senzori greutate — analiză', items: [
      ['Grafic', 'Greutatea în timp + linia „Sarcină utilă" (limita din fișă) → vezi unde curba trece de limită (supraîncărcare).'],
      ['Încărcare', 'Greutatea a urcat cu ≥ ' + _grp(wMin) + ' kg (s-a încărcat).'],
      ['Descărcare', 'Greutatea a scăzut cu ≥ ' + _grp(wMin) + ' kg (s-a descărcat).'],
      ['Supraîncărcare', 'Greutatea a depășit sarcina utilă din fișă — risc de amendă / uzură.'],
      ['Fără senzor', 'Vehiculul nu are senzor de greutate montat.']
    ] }
  };
}

async function rTipping(db, imeis, from, to, opts, devMap) { // Senzor de basculare — jurnal per-mașină (nr., oră, durată, unde)
  const DIN = opts.tipDin || 'digital_input_2';
  const dur = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h > 0 ? (h + 'h ' + m + 'm') : (m > 0 ? (m + 'm ' + s + 's') : (s + 's')); };
  const rows = [], evPts = [], perVehicle = [], vCount = [];
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const pts = await history(db, imei, from, to);
    let onStart = null, onStartP = null, had = false; const events = []; // {startTs, dur, p}
    for (const p of pts) {
      const v = io(p)[DIN];
      if (v == null) continue;
      had = true;
      const on = (v === 1 || v === true || v === '1');
      if (on && onStart == null) { onStart = t(p); onStartP = p; }                                   // ridicare benă (front crescător)
      else if (!on && onStart != null) { events.push({ startTs: onStartP.timestamp, dur: (t(p) - onStart) / 1000, p: onStartP }); onStart = null; onStartP = null; } // coborâre → basculare completă
    }
    if (onStart != null && pts.length) events.push({ startTs: onStartP.timestamp, dur: (t(pts[pts.length - 1]) - onStart) / 1000, p: onStartP }); // încă ridicată la finalul perioadei
    if (!had) { const r = [nm, '—', 'Fără senzor', '—', '—']; rows.push(r); evPts.push(null); perVehicle.push({ vehicul: nm, summary: [['Basculări', 0], ['Durată totală', '—'], ['Ultima', '—']], rows: [r], charts: [] }); continue; }
    const vEvRows = [], vEvPts = []; let totDur = 0;
    events.forEach((e, idx) => { vEvRows.push([nm, '#' + (idx + 1), fmtTs(e.startTs), dur(e.dur), loc(e.p)]); vEvPts.push(e.p); totDur += e.dur; });
    if (!vEvRows.length) { const r = [nm, '—', '(fără basculări)', '—', '—']; vEvRows.push(r); vEvPts.push(null); }
    vEvRows.forEach((r, k) => { rows.push(r); evPts.push(vEvPts[k]); });
    const daily = _dailySeries(events.map(e => ({ ts: e.startTs })), 'count');
    perVehicle.push({ vehicul: nm, summary: [['Basculări', events.length], ['Durată totală', events.length ? dur(totDur) : '—'], ['Ultima', events.length ? fmtTs(events[events.length - 1].startTs) : '—']], rows: vEvRows, charts: events.length ? [{ type: 'bar', title: 'Basculări pe zi — ' + nm, labels: daily.labels, datasets: [{ label: 'basculări', data: daily.data }] }] : [] });
    vCount.push([nm, events.length]);
  }
  if (geocode && geocode.warm) { const c = evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (evPts[i]) r[4] = addr(evPts[i]); });
  const charts = vCount.length ? [{ type: 'bar', title: 'Basculări pe vehicul', labels: _topN(vCount, 20).labels, datasets: [{ label: 'basculări', data: _topN(vCount, 20).data }] }] : [];
  return {
    columns: ['Vehicul', 'Nr.', 'Data', 'Durată', 'Locație'], rows,
    perVehicle, charts,
    summary: { 'Total vehicule': imeis.length, 'Cu senzor': vCount.length, 'Basculări (total flotă)': vCount.reduce((s, v) => s + v[1], 0) },
    legend: { title: 'Senzor de basculare — jurnal', items: [
      ['Nr.', 'Numărul basculării în perioada selectată (numerotate per mașină).'],
      ['Durată', 'Cât a stat bena ridicată (de la ridicare la coborâre).'],
      ['Locație', 'Unde s-a basculat (adresă).'],
      ['Fără senzor', 'Vehiculul nu are senzor de basculare pe intrarea digitală configurată (implicit DIN2).']
    ] }
  };
}

async function rArm(db, imeis, from, to, opts, devMap) { // Senzor de braț (utilaje: excavator/macara/încărcător) — jurnal sesiuni de lucru
  const DIN = opts.armDin || 'digital_input_3';
  const dur = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h > 0 ? (h + 'h ' + m + 'm') : (m > 0 ? (m + 'm ' + s + 's') : (s + 's')); };
  const rows = [], evPts = [], perVehicle = [], vHours = []; let fleetSec = 0, fleetSessions = 0;
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const pts = await history(db, imei, from, to);
    let onStart = null, onStartP = null, had = false; const events = [];
    for (const p of pts) {
      const v = io(p)[DIN];
      if (v == null) continue;
      had = true;
      const on = (v === 1 || v === true || v === '1');
      if (on && onStart == null) { onStart = t(p); onStartP = p; }                                   // braț activat
      else if (!on && onStart != null) { events.push({ startTs: onStartP.timestamp, dur: (t(p) - onStart) / 1000, p: onStartP }); onStart = null; onStartP = null; } // dezactivat → sesiune completă
    }
    if (onStart != null && pts.length) events.push({ startTs: onStartP.timestamp, dur: (t(pts[pts.length - 1]) - onStart) / 1000, p: onStartP });
    if (!had) { const r = [nm, '—', 'Fără senzor', '—', '—']; rows.push(r); evPts.push(null); perVehicle.push({ vehicul: nm, summary: [['Sesiuni braț', 0], ['Durată totală', '—'], ['Ore lucru', 0], ['Ultima', '—']], rows: [r], charts: [] }); continue; }
    const vEvRows = [], vEvPts = []; let totDur = 0;
    events.forEach((e, idx) => { vEvRows.push([nm, '#' + (idx + 1), fmtTs(e.startTs), dur(e.dur), loc(e.p)]); vEvPts.push(e.p); totDur += e.dur; });
    if (!vEvRows.length) { const r = [nm, '—', '(fără activări)', '—', '—']; vEvRows.push(r); vEvPts.push(null); }
    vEvRows.forEach((r, k) => { rows.push(r); evPts.push(vEvPts[k]); });
    const dh = {}; events.forEach(e => { const k = _dayKeyISO(e.startTs); dh[k] = (dh[k] || 0) + e.dur / 3600; }); const dhk = Object.keys(dh).sort();
    perVehicle.push({ vehicul: nm, summary: [['Sesiuni braț', events.length], ['Durată totală', events.length ? dur(totDur) : '—'], ['Ore lucru', +(totDur / 3600).toFixed(1)], ['Ultima', events.length ? fmtTs(events[events.length - 1].startTs) : '—']], rows: vEvRows, charts: events.length ? [{ type: 'bar', title: 'Ore lucru pe zi — ' + nm, labels: dhk.map(_dayLabel), datasets: [{ label: 'ore', data: dhk.map(k => +dh[k].toFixed(2)) }] }] : [] });
    vHours.push([nm, +(totDur / 3600).toFixed(1)]); fleetSec += totDur; fleetSessions += events.length;
  }
  if (geocode && geocode.warm) { const c = evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (evPts[i]) r[4] = addr(evPts[i]); });
  const charts = vHours.length ? [{ type: 'bar', title: 'Ore lucru pe vehicul (h)', labels: _topN(vHours, 20).labels, datasets: [{ label: 'ore', data: _topN(vHours, 20).data }] }] : [];
  return {
    columns: ['Vehicul', 'Nr.', 'Data', 'Durată', 'Locație'], rows,
    perVehicle, charts,
    summary: { 'Total vehicule': imeis.length, 'Cu senzor': vHours.length, 'Sesiuni braț (total flotă)': fleetSessions, 'Ore lucru (total flotă)': (fleetSec / 3600).toFixed(1) + ' h' },
    legend: { title: 'Senzor de braț — jurnal', items: [
      ['Nr.', 'Numărul sesiunii de lucru cu brațul, în perioada selectată (per utilaj).'],
      ['Durată', 'Cât a lucrat brațul (de la activare la dezactivare) — util pt. facturare pe ore de lucru.'],
      ['Locație', 'Unde a lucrat utilajul (adresă).'],
      ['Fără senzor', 'Utilajul nu are senzor de braț pe intrarea digitală configurată (implicit DIN3).']
    ] }
  };
}

async function rIoT(db, imeis, from, to, opts, devMap) { // Senzori IoT (frigorific) — temperatură + jurnal de abateri (alarme) + baterie senzor
  const dur = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h > 0 ? (h + 'h ' + m + 'm') : (m > 0 ? (m + 'm ' + s + 's') : (s + 's')); };
  const rows = [], evPts = [], perVehicle = [], vTemp = [];
  for (const imei of imeis) {
    const nm = label(devMap, imei);
    const dd = devMap[imei] || {};
    const tMin = dd.temp_min != null && isFinite(parseFloat(dd.temp_min)) ? parseFloat(dd.temp_min) : null;
    const tMax = dd.temp_max != null && isFinite(parseFloat(dd.temp_max)) ? parseFloat(dd.temp_max) : null;
    const pts = await history(db, imei, from, to);
    let lastTemp = null, minT = null, maxT = null, batt = null, had = false;
    const series = [], events = []; let exStart = null, exStartP = null, exPeak = null, exPeakDev = -1;
    for (const p of pts) {
      const i = io(p);
      let temp = null;
      for (const k of ['ble_fuel_temp_1', 'ble_fuel_temp_2', 'ble_fuel_temp_3', 'ble_fuel_temp_4']) { if (i[k] != null) { const v = parseFloat(i[k]); if (isFinite(v)) { temp = v; break; } } }
      const b = i.ble_battery_voltage_1 != null ? parseFloat(i.ble_battery_voltage_1) : null;
      if (b != null && isFinite(b)) { batt = b; had = true; }
      if (temp == null) continue;
      had = true; lastTemp = temp;
      if (minT == null || temp < minT) minT = temp;
      if (maxT == null || temp > maxT) maxT = temp;
      series.push({ ts: p.timestamp, temp: +temp.toFixed(1) });
      const dev = (tMax != null && temp > tMax) ? (temp - tMax) : (tMin != null && temp < tMin ? (tMin - temp) : 0);
      if (dev > 0) { if (exStart == null) { exStart = t(p); exStartP = p; exPeak = temp; exPeakDev = dev; } else if (dev > exPeakDev) { exPeak = temp; exPeakDev = dev; } }
      else if (exStart != null) { events.push({ startTs: exStartP.timestamp, dur: (t(p) - exStart) / 1000, peak: exPeak, p: exStartP }); exStart = null; exStartP = null; exPeak = null; exPeakDev = -1; }
    }
    if (exStart != null && pts.length) events.push({ startTs: exStartP.timestamp, dur: (t(pts[pts.length - 1]) - exStart) / 1000, peak: exPeak, p: exStartP });
    const interval = (tMin != null || tMax != null) ? ((tMin != null ? tMin : '−∞') + '…' + (tMax != null ? tMax : '+∞') + ' °C') : '—';
    if (!had) { const r = [nm, '—', 'Fără senzori IoT', '—', '—', '—']; rows.push(r); evPts.push(null); perVehicle.push({ vehicul: nm, summary: [['Temp curentă', '—'], ['Min', '—'], ['Max', '—'], ['Interval', '—'], ['Abateri', 0], ['Baterie', '—']], rows: [r], charts: [] }); continue; }
    const vEvRows = [], vEvPts = [];
    events.forEach((e, idx) => { vEvRows.push([nm, '#' + (idx + 1), fmtTs(e.startTs), dur(e.dur), (e.peak != null ? e.peak.toFixed(1) + ' °C' : '—'), loc(e.p)]); vEvPts.push(e.p); });
    if (!vEvRows.length) { const r = [nm, '—', (tMin != null || tMax != null) ? '(fără abateri)' : '(interval nesetat în fișă)', '—', '—', '—']; vEvRows.push(r); vEvPts.push(null); }
    vEvRows.forEach((r, k) => { rows.push(r); evPts.push(vEvPts[k]); });
    const S = _sampleSeries(series, 120), labels = S.map(s => fmtTsMin(s.ts));
    const datasets = [{ label: 'Temperatură (°C)', data: S.map(s => s.temp), yAxisID: 'y' }];
    if (tMin != null) datasets.push({ label: 'Min admis', data: S.map(() => tMin), yAxisID: 'y' });
    if (tMax != null) datasets.push({ label: 'Max admis', data: S.map(() => tMax), yAxisID: 'y' });
    perVehicle.push({ vehicul: nm, summary: [['Temp curentă', lastTemp != null ? lastTemp.toFixed(1) + ' °C' : '—'], ['Min', minT != null ? minT.toFixed(1) + ' °C' : '—'], ['Max', maxT != null ? maxT.toFixed(1) + ' °C' : '—'], ['Interval', interval], ['Abateri', events.length], ['Baterie', batt != null ? batt.toFixed(2) + ' V' : '—']], rows: vEvRows, charts: series.length ? [{ type: 'line', title: 'Temperatură în timp — ' + nm, labels, datasets }] : [] });
    if (lastTemp != null) vTemp.push([nm, +lastTemp.toFixed(1)]);
  }
  if (geocode && geocode.warm) { const c = evPts.filter(Boolean).map(p => ({ lat: p.latitude, lng: p.longitude })); if (c.length) { try { await geocode.warm(c, { maxUnique: 200, budgetMs: imeis.length <= 1 ? 14000 : 8000 }); } catch (e) {} } }
  rows.forEach((r, i) => { if (evPts[i]) r[5] = addr(evPts[i]); });
  const charts = vTemp.length ? [{ type: 'bar', title: 'Temperatură curentă pe vehicul (°C)', labels: _topN(vTemp, 20).labels, datasets: [{ label: '°C', data: _topN(vTemp, 20).data }] }] : [];
  return {
    columns: ['Vehicul', 'Nr.', 'Data', 'Durată', 'Vârf', 'Locație'], rows,
    perVehicle, charts,
    summary: { 'Total vehicule': imeis.length, 'Cu senzori IoT': vTemp.length, 'Abateri (total flotă)': perVehicle.reduce((s, v) => s + (v.summary.find(x => x[0] === 'Abateri') || [0, 0])[1], 0) },
    legend: { title: 'Senzori IoT — temperatură & alarme', items: [
      ['Grafic', 'Temperatura în timp + liniile „Min/Max admis" (intervalul din fișă) → vezi când iese din interval.'],
      ['Abatere', 'Cât timp temperatura a fost în afara intervalului sigur (prea cald/prea rece) — alarmă lanț frig.'],
      ['Vârf', 'Cea mai extremă temperatură atinsă în timpul abaterii.'],
      ['Interval', 'Intervalul sigur (min…max °C) din fișa vehiculului. Fără el nu se pot detecta abateri.'],
      ['Fără senzori IoT', 'Vehiculul nu are senzori wireless (temperatură/baterie) conectați.']
    ] }
  };
}

const REPORTS = {
  trips:       { label: 'Foaie de parcurs',     cat: 'monitorizare', desc: 'Cursele oficiale (plecare–sosire, km, durată, șofer) — pentru decont.', fn: rTrips },
  route:       { label: 'Traseu',                cat: 'monitorizare', desc: 'Deplasările și opririle pe hartă: unde, când, câți km.', fn: rRoute },
  location:    { label: 'Ultima locație',         cat: 'monitorizare', desc: 'Unde a parcat ultima dată fiecare mașină și de cât timp.', fn: rLocation },
  stops:       { label: 'Staționări',            cat: 'monitorizare', desc: 'Opririle fiecărei mașini: locul și cât a stat.', fn: rStops },
  daily:       { label: 'Situație zilnică',       cat: 'monitorizare', desc: 'Sinteză zi cu zi: km, timp de mers și de staționat.', fn: rDaily },
  idling:      { label: 'Ralanti',                cat: 'monitorizare', desc: 'Timp și consum irosit cu motorul pornit, fără deplasare.', fn: rIdling },
  driver:      { label: 'Pontaj șofer',           cat: 'monitorizare', desc: 'Orele de lucru pe fiecare șofer.', fn: rDriver },
  utilization: { label: 'Index km / ore',         cat: 'monitorizare', desc: 'Indexul din bord: cât avea, cât a făcut, cât are (km sau ore).', fn: rUtilization },
  analytic:    { label: 'Analitic',               cat: 'monitorizare', desc: 'Date brute, poziție cu poziție: adresă, viteză, combustibil.', fn: rAnalytic },
  uptime:      { label: 'Disponibilitate flotă',  cat: 'monitorizare', desc: 'Zile active/inactive, cea mai lungă pauză, starea semnalului.', fn: rFleetUptime },
  due:         { label: 'Scadențe documente & service', cat: 'monitorizare', desc: 'Expirări (ITP, RCA…) + revizii scadente și efectuate.', fn: rDocServiceDue },
  consumption: { label: 'Consum carburant',       cat: 'consum',       desc: 'Cât a consumat fiecare mașină: litri, medie la 100 km, sursa datelor.', fn: rConsumption },
  fuel:        { label: 'Alimentări & scăderi',   cat: 'consum',       desc: 'Unde, când și ce combustibil s-a alimentat + scăderi suspecte.', fn: rFuel },
  fuel_anomaly:{ label: 'Anomalii combustibil (scor)', cat: 'consum',  desc: 'Starea fiecărei mașini: risc de scurgeri sau pierderi de combustibil (scor).', fn: rFuelAnomaly },
  costs:       { label: 'Costuri combustibil',    cat: 'consum',       desc: 'Banii cheltuiți pe carburant, pe fiecare vehicul și pe total.', fn: rCosts },
  emissions:   { label: 'Emisii CO₂',             cat: 'consum',       desc: 'Amprenta de carbon a flotei, calculată din consum.', fn: rEmissions },
  can:         { label: 'Date CAN',               cat: 'can',          desc: 'Instantaneu tehnic pe mașină: combustibil, kilometraj real (bord + GPS), erori de defect.', fn: rCan },
  overrev:     { label: 'Supraturații',           cat: 'can',          desc: 'De câte ori și cât timp turația a depășit pragul — condus agresiv / uzură motor.', fn: rOverRev },
  pto:         { label: 'PTO (priză de putere)',  cat: 'can',          desc: 'Timp și porniri cu priza de putere activă (macara, basculă, frigorific).', fn: rPto },
  enginehours: { label: 'Ore motor',              cat: 'can',          desc: 'Orele motorului împărțite: ralanti (gol), în mers, și cu PTO (lucru la utilaje).', fn: rEngineHours },
  fuelprobe:   { label: 'Sondă litrometrică',      cat: 'senzori',      desc: 'Analiză din sonda de combustibil (analogică sau BLE): nivel, alimentări, scăderi și furt — separat de CAN.', fn: rFuelProbe },
  weight:      { label: 'Senzori greutate',        cat: 'senzori',      desc: 'Jurnal de încărcări, descărcări și supraîncărcări (kg), comparat cu sarcina utilă din fișă.', fn: rWeight },
  tipping:     { label: 'Senzor de basculare',     cat: 'senzori',      desc: 'Jurnal complet al basculărilor: număr, oră, durată și unde — dintr-un senzor pe intrare digitală.', fn: rTipping },
  arm:         { label: 'Senzor de braț',          cat: 'senzori',      desc: 'Sesiunile de lucru cu brațul (excavator/macara/încărcător): număr, durată, ore de lucru și unde — pentru facturare.', fn: rArm },
  iot:         { label: 'Senzori IoT',             cat: 'senzori',      desc: 'Monitorizare temperatură marfă (frigorific): abateri de la intervalul admis și starea senzorilor wireless.', fn: rIoT },
  speeding:    { label: 'Depășiri viteză',        cat: 'evenimente',   desc: 'Unde, când, cât a durat și cu cât s-a depășit limita — cu prag fix sau limitele reale ale drumului (OSM).', fn: rSpeeding },
  geofence:    { label: 'Vizite în zone',         cat: 'evenimente',   desc: 'Intrările și ieșirile din zonele definite: când și cât a stat, fără trecerile scurte.', fn: rGeofence },
  hotspot:     { label: 'Raport Hotspot',         cat: 'evenimente',   desc: 'Activitatea flotei într-un hotspot ales, pe zile: timp în mișcare/ralanti/oprit, ore, km și vizite.', fn: rHotspot },
  events:      { label: 'Evenimente (alerte)',    cat: 'evenimente',   desc: 'Toate alertele declanșate, pe vehicul: ce, când, unde și detaliile evenimentului.', fn: rEvents },
  ecodrive:    { label: 'EcoDrive (comportament)', cat: 'siguranta',   desc: 'Stil de condus: accelerări/frânări bruște, scor pe vehicul.', fn: rEcoDrive },
  ecodrive_drivers: { label: 'EcoDrive — clasament șoferi', cat: 'siguranta', desc: 'Clasamentul șoferilor după scorul de condus.', fn: rEcoDriveDrivers },
  hos:         { label: 'Ore conducere & repaus (HOS, Reg. 561)', cat: 'siguranta', desc: 'Timpii de conducere și pauzele față de Regulamentul 561.', fn: rHos }
};
const REPORT_CATEGORIES = [
  { key: 'monitorizare', label: 'Monitorizare' },
  { key: 'consum', label: 'Consum carburant' },
  { key: 'can', label: 'Date CAN' },
  { key: 'senzori', label: 'Senzori' },
  { key: 'evenimente', label: 'Evenimente & zone' },
  { key: 'siguranta', label: 'Siguranță & EcoDrive' }
];

// Statistici consum agregate (flotă + per vehicul + trend) — numeric, pentru pagina „Statistici consum".
// Refolosește EXACT helperii de combustibil (fuelL, haversineKm, ignOn, IDLE_SPEED, MAX_STEP_KM) ca rapoartele,
// ca să nu dublăm logica. Întoarce { range, kpi, series, topConsumers, perVehicle } într-un singur apel.
function _bucketKey(ts, bucket) { const s = new Date(ts).toISOString(); return bucket === 'month' ? s.slice(0, 7) : s.slice(0, 10); }
// Consum implicit (L/100km) după tipul vehiculului, folosit la ESTIMARE când nu e configurat pe vehicul.
function defConsumption(vtype) {
  const t = String(vtype || '').toLowerCase();
  if (/truck|camion|tir|lorry|tractor|autotractor/.test(t)) return 30;
  if (/bus|autobuz|autocar/.test(t)) return 28;
  if (/van|dub|autoutil|furgon|utilitar/.test(t)) return 12;
  return 9; // autoturism / implicit
}

async function fuelStats(db, imeis, from, to, opts) {
  opts = opts || {};
  const refuelMin = opts.refuelMin || 5, idleLph = opts.idleLph || 1.5, co2Factor = opts.co2Factor || 2.64;
  const MAX_PER100 = 200; // peste atât, semnalul de nivel e zgomot → folosim estimarea
  const bucket = opts.bucket === 'month' ? 'month' : 'day';
  const devMap = await deviceNames(db, imeis);
  const cfg = {};
  try { (await db.pool.query('SELECT imei, fuel_price, fuel_type, vehicle_type, consumption_road, consumption_city, consumption_idle FROM devices')).rows.forEach(d => { cfg[d.imei] = { price: parseFloat(d.fuel_price), fuelType: d.fuel_type || null, vtype: d.vehicle_type || null, cRoad: parseFloat(d.consumption_road) || null, cCity: parseFloat(d.consumption_city) || null, cIdle: parseFloat(d.consumption_idle) || null }; }); } catch (e) {}
  const perVehicle = [], seriesMap = {};
  let kL = 0, kKm = 0, kCost = 0, kIdleL = 0, kIdleSec = 0, kCo2 = 0, kIdleCost = 0, vWith = 0, vEst = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refueled = 0, dist = 0, prev = null, idleSec = 0, prevP = null;
    let cumulSum = 0, prevCumul = null, cumulSeen = false, dropSum = 0; // contor incremente + sumă scăderi de nivel
    const bF = {}, bL = {}, bPrev = {}, bRefuel = {}, bIdle = {}, bDist = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p), bk = _bucketKey(p.timestamp, bucket);
      const fc = fuelCumul(p); if (fc != null) { if (prevCumul != null) { const dc = fc - prevCumul; if (dc > 0 && dc < 100) cumulSum += dc; } prevCumul = fc; cumulSeen = true; }
      if (fl != null) {
        if (first == null) first = fl; last = fl;
        if (prev != null) { const d = fl - prev; if (d >= refuelMin) refueled += d; const dd = prev - fl; if (dd >= 0.4 && dd < 40) dropSum += dd; }
        prev = fl;
        if (bF[bk] === undefined) bF[bk] = fl; bL[bk] = fl;
        if (bPrev[bk] !== undefined) { const d = fl - bPrev[bk]; if (d >= refuelMin) bRefuel[bk] = (bRefuel[bk] || 0) + d; }
        bPrev[bk] = fl;
      }
      if (i > 0) { const pr = pts[i - 1], dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dd < MAX_STEP_KM) { dist += dd; bDist[bk] = (bDist[bk] || 0) + dd; } }
      if (ignOn(p) && (p.speed || 0) <= IDLE_SPEED && prevP && ignOn(prevP) && (prevP.speed || 0) <= IDLE_SPEED) { const dt = (new Date(p.timestamp) - new Date(prevP.timestamp)) / 1000; if (dt > 0 && dt < 3600) { idleSec += dt; bIdle[bk] = (bIdle[bk] || 0) + dt; } }
      prevP = p;
    }
    const c = cfg[imei] || {};
    const price = resolvePrice(c, opts);
    const cRoad = c.cRoad || c.cCity || defConsumption(c.vtype);  // L/100km pentru estimare
    const cIdleLph = c.cIdle || idleLph;                          // L/h ralanti
    const idleH = idleSec / 3600, idleL = idleH * cIdleLph;
    // Consum din senzorul de nivel (sondă/CAN): scădere netă + realimentări detectate (salturi ≥ refuelMin).
    const hasFuel = first != null;
    // Contor cumulativ CAN (consum exact, merge și pe distanțe scurte) — preferat înaintea scăderii de nivel.
    const cumulL = (cumulSeen && cumulSum > 0) ? cumulSum : null;
    const cumulPer100 = (cumulL != null && dist > 1) ? (cumulL / dist * 100) : null;
    const cumulOk = cumulL != null && cumulL > 0 && dist > 1 && cumulPer100 >= 1 && cumulPer100 <= MAX_PER100;
    const sensorL = dropSum; // consum din nivel = suma scăderilor reale (gestionează alimentări/scăderi graduale automat)
    const sensorPer100 = (sensorL > 0 && dist > 1) ? (sensorL / dist * 100) : null;
    // Senzorul de nivel e „de încredere" doar dacă dă consum > 0 pe distanță reală și un L/100km plauzibil ≥3
    // (sub atât = ac grosier care a ratat consum → estimăm). Ține pasul cu _consumptionMap (raportul Consum carburant).
    const sensorOk = sensorL > 0 && dist > 1 && sensorPer100 >= 3 && sensorPer100 <= MAX_PER100;
    // Estimare din config (sau implicit pe tip) + km + ralanti — folosită când nu există nici contor, nici senzor fiabil.
    const estL = dist * cRoad / 100 + idleL;
    let liters = cumulOk ? cumulL : (sensorOk ? sensorL : estL);
    if (liters < idleL) liters = idleL;            // totalul include MEREU ralanti-ul (fizic, e parte din total)
    const estimated = !(cumulOk || sensorOk);
    const per100 = dist > 1 ? +(liters / dist * 100).toFixed(1) : null;
    const cost = liters * price;
    const vCo2F = co2For(c.fuelType, opts); // factor CO₂ pe tipul de combustibil al vehiculului
    perVehicle.push({ imei, name: (devMap[imei] && devMap[imei].name) || imei, plate: (devMap[imei] && devMap[imei].plate) || '', km: Math.round(dist), liters: +liters.toFixed(1), per100, cost: Math.round(cost), idleLiters: +idleL.toFixed(1), idleSec: Math.round(idleSec), co2Kg: Math.round(liters * vCo2F), price: +price.toFixed(2), fuelType: c.fuelType || null, estimated, hasFuel });
    kKm += dist; kIdleSec += idleSec; kIdleL += idleL; kIdleCost += idleL * price; kCo2 += liters * vCo2F;
    kL += liters; kCost += cost;
    if (hasFuel) vWith++;
    if (estimated && (dist > 1 || idleL > 0)) vEst++;
    // Serie pe bucket: consum MĂSURAT dacă senzorul e fiabil, altfel ESTIMAT (km + ralanti pe bucket) → trend consistent cu KPI.
    const bkeys = new Set([].concat(Object.keys(bDist), Object.keys(bIdle), Object.keys(bF)));
    bkeys.forEach(bk => {
      if (!seriesMap[bk]) seriesMap[bk] = { consumed: 0, idle: 0, cost: 0 };
      const bIdleL = (bIdle[bk] || 0) / 3600 * cIdleLph;
      let bc = (sensorOk && bF[bk] !== undefined) ? Math.max(0, (bF[bk] - bL[bk]) + (bRefuel[bk] || 0)) : ((bDist[bk] || 0) * cRoad / 100 + bIdleL);
      if (bc < bIdleL) bc = bIdleL;
      seriesMap[bk].consumed += bc;
      seriesMap[bk].idle += bIdleL;
      seriesMap[bk].cost += bc * price;
    });
  }
  const keys = Object.keys(seriesMap).sort();
  const series = { labels: keys, consumed: keys.map(k => +seriesMap[k].consumed.toFixed(1)), idle: keys.map(k => +seriesMap[k].idle.toFixed(1)), cost: keys.map(k => Math.round(seriesMap[k].cost)) };
  const topConsumers = perVehicle.filter(v => v.liters > 0).sort((a, b) => b.liters - a.liters).slice(0, 10).map(v => ({ imei: v.imei, name: v.name, plate: v.plate, liters: v.liters, per100: v.per100, km: v.km, estimated: v.estimated }));
  const kpi = { totalLiters: +kL.toFixed(1), totalKm: Math.round(kKm), avgPer100: kKm > 1 ? +(kL / kKm * 100).toFixed(1) : 0, fuelCost: Math.round(kCost), idleLiters: +kIdleL.toFixed(1), idleSec: Math.round(kIdleSec), idlePct: kL > 0 ? Math.round(kIdleL / kL * 100) : 0, idleCost: Math.round(kIdleCost), co2Tons: +(kCo2 / 1000).toFixed(2), vehiclesWithData: vWith, vehiclesTotal: imeis.length, vehiclesEstimated: vEst };
  return { range: { from, to, bucket }, kpi, series, topConsumers, perVehicle };
}

// ─── Filtru zile-din-săptămână / interval orar (Europe/Bucharest) ───
// Aplicat prin ÎNVELIREA obiectului db: pozițiile GPS (getDeviceHistory) și alertele (getAlertHistoryRange)
// sunt filtrate ÎNAINTE să ajungă la funcțiile de raport. NU se aplică la: due (documente/service)
// și can (snapshot direct din pool).
// (Mobilul își păstrează builderul propriu — filtrul e expus doar în layoutul cascadă de pe web.)
function _tfMatcher(tf) {
  const daySet = tf.days && tf.days.length ? new Set(tf.days) : null;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tf.tz || 'Europe/Bucharest', weekday: 'short', hour: '2-digit', hour12: false });
  const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fromM = hm(tf.from), toM = hm(tf.to);
  const cache = new Map(); // bucket oră UTC -> {wd, hh}: offsetul RO e în ore întregi, DST comută pe granițe de oră → sigur
  return (ts) => {
    const ms = new Date(ts).getTime(); if (!isFinite(ms)) return true;
    const bucket = Math.floor(ms / 3600000);
    let b = cache.get(bucket);
    if (!b) {
      const parts = fmt.formatToParts(ms);
      const g = t => { const p = parts.find(x => x.type === t); return p ? p.value : ''; };
      b = { wd: g('weekday').toLowerCase().slice(0, 3), hh: parseInt(g('hour')) || 0 };
      cache.set(bucket, b);
    }
    if (daySet && !daySet.has(b.wd)) return false;
    if (fromM == null || toM == null) return true;
    const mins = b.hh * 60 + Math.floor((ms % 3600000) / 60000);
    return fromM <= toM ? (mins >= fromM && mins <= toM) : (mins >= fromM || mins <= toM); // interval peste miezul nopții (ex. 22:00-06:00)
  };
}
function _tfWrapDb(db, tf) {
  const match = _tfMatcher(tf);
  const w = Object.create(db);
  w.getDeviceHistory = async (imei, from, to, limit) => (await db.getDeviceHistory(imei, from, to, limit)).filter(p => match(p.timestamp));
  w.getAlertHistoryRange = async (imeis, from, to, limit) => (await db.getAlertHistoryRange(imeis, from, to, limit)).filter(a => match(a.triggered_at));
  return w;
}
function _tfLabel(tf) {
  const RO = { mon: 'Lu', tue: 'Ma', wed: 'Mi', thu: 'Jo', fri: 'Vi', sat: 'Sâ', sun: 'Du' };
  const d = tf.days && tf.days.length ? tf.days.map(x => RO[x] || x).join(',') : 'toate zilele';
  return d + (tf.from ? (' · ' + tf.from + '–' + tf.to) : '');
}

async function runReport(db, type, imeis, from, to, opts, companyId) {
  const def = REPORTS[type];
  if (!def) throw new Error('Tip de raport necunoscut: ' + type);
  const devMap = await deviceNames(db, imeis);
  // Filtru zile/ore (cascadă): învelim db-ul → toate rapoartele pe poziții/alerte îl respectă automat.
  const _tf = opts && opts.timeFilter;
  const dbx = _tf ? _tfWrapDb(db, _tf) : db;
  // companyId (null = super/toate) e propagat la fn-urile care citesc definiții scopabile pe companie (ex: geofence).
  const result = await def.fn(dbx, imeis, from, to, opts || {}, devMap, companyId);
  if (_tf && result && result.summary) result.summary['Filtru zile/ore'] = _tfLabel(_tf); // vizibil în UI, istoric și exporturi
  result.type = type; result.label = def.label; result.from = from; result.to = to;
  if (!result.perVehicle && !result.noPerVehicle) { try { const pv = _genericPerVehicle(result); if (pv) result.perVehicle = pv; } catch (e) {} }
  try { _injectDriverColumn(result, imeis, devMap); } catch (e) {} // coloană „Șofer" la orice raport pe vehicule (după perVehicle → prinde și sumarele)
  return result;
}

// ─── Hotspot: puncte pentru heatmap ───
// mode: 'positions' (densitate) | 'stops' (ponderat după staționare)
async function hotspot(db, imeis, from, to, opts) {
  const mode = opts.mode || 'stops';
  const points = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    if (mode === 'stops') {
      const { stops } = segmentTrack(pts, (opts.stopMin || 5) * 60);
      for (const st of stops) {
        const w = Math.min(1, st.durationSec / 3600); // pondere după ore staționate (cap 1)
        points.push([st.p.latitude, st.p.longitude, Math.max(0.2, w)]);
      }
    } else {
      // eșantionează ca să nu trimitem prea multe puncte
      const step = Math.max(1, Math.floor(pts.length / 4000));
      for (let i = 0; i < pts.length; i += step) {
        const p = pts[i]; if ((p.speed||0) <= IDLE_SPEED) points.push([p.latitude, p.longitude, 0.5]);
      }
    }
  }
  return points;
}

// ─── Analiză zonă desenată ad-hoc ───
async function analyzeZone(db, imeis, from, to, zone) {
  const devMap = await deviceNames(db, imeis);
  const rows = []; let totalVisits = 0, totalDwell = 0; const vehiclesWithVisit = new Set();
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const visits = zoneVisits(pts, zone);
    if (!visits.length) continue;
    vehiclesWithVisit.add(imei);
    let dwell = 0; visits.forEach(v => dwell += v.durationSec);
    rows.push([ label(devMap, imei), visits.length, fmtDur(dwell), fmtTs(visits[0].enter), fmtTs(visits[visits.length-1].exit) ]);
    totalVisits += visits.length; totalDwell += dwell;
  }
  rows.sort((a, b) => b[1] - a[1]);
  return { columns: ['Vehicul','Vizite','Timp total','Prima intrare','Ultima ieșire'], rows,
    summary: { 'Vehicule care au intrat': vehiclesWithVisit.size, 'Vizite totale': totalVisits, 'Timp total în zonă': fmtDur(totalDwell) },
    label: 'Analiză zonă', from, to };
}

module.exports = { runReport, fuelStats, REPORTS, REPORT_CATEGORIES, hotspot, analyzeZone, segmentTrack, setDefaultFuelPrices };
