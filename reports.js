// reports.js — Motor de rapoarte flotă (calcule din tabela positions).
// Toate funcțiile primesc (db, imeis[], from, to, opts) și întorc { columns, rows, summary }.

const IDLE_SPEED = 3;        // km/h sub care vehiculul e considerat oprit
const MAX_STEP_KM = 10;      // ignoră salturi GPS mai mari (puncte aberante)

function t(p) { return new Date(p.timestamp).getTime(); }
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const DISPLAY_TZ = process.env.DISPLAY_TZ || 'Europe/Bucharest';
function fmtTs(ts) { return ts ? new Date(ts).toLocaleString('ro-RO', { timeZone: DISPLAY_TZ }) : ''; }
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return (h?h+'h ':'') + (m?m+'m ':'') + (h?'':s+'s');
}
function loc(p) { return p ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : ''; }
function io(p) { return p && p.io_data ? p.io_data : {}; }
function fuelL(p) { const i = io(p); const v = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; }
function ignOn(p) { return io(p).ignition === 1; }

async function history(db, imei, from, to) {
  return db.getDeviceHistory(imei, from, to);
}
async function deviceNames(db, imeis) {
  const map = {};
  try {
    const r = await db.pool.query('SELECT imei, name, plate, driver_id, group_id FROM devices');
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
  // runs consecutive de aceeași stare
  const runs = []; let s = 0;
  for (let i = 1; i < pts.length; i++) { if (moving[i] !== moving[s]) { runs.push({ moving: moving[s], s, e: i-1 }); s = i; } }
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

// ─── Rapoarte ───

async function rTrips(db, imeis, from, to, opts, devMap) { // Foaie de parcurs
  const rows = []; let totalKm = 0, totalDur = 0, count = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const { trips } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    for (const tr of trips) {
      rows.push([ label(devMap, imei), fmtTs(tr.start), fmtTs(tr.end), fmtDur(tr.durationSec),
        tr.distanceKm.toFixed(2), tr.avgSpeed, tr.maxSpeed, loc(tr.startP), loc(tr.endP) ]);
      totalKm += tr.distanceKm; totalDur += tr.durationSec; count++;
    }
  }
  return { columns: ['Vehicul','Plecare','Sosire','Durată','Distanță (km)','Vit. medie','Vit. max','Loc. plecare','Loc. sosire'],
    rows, summary: { 'Curse': count, 'Distanță totală (km)': Math.round(totalKm*10)/10, 'Durată totală': fmtDur(totalDur) } };
}

async function rStops(db, imeis, from, to, opts, devMap) { // Opriri / staționări
  const rows = []; let total = 0, totalDur = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const { stops } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    for (const st of stops) {
      rows.push([ label(devMap, imei), fmtTs(st.start), fmtTs(st.end), fmtDur(st.durationSec), loc(st.p) ]);
      total++; totalDur += st.durationSec;
    }
  }
  return { columns: ['Vehicul','Început','Sfârșit','Durată','Locație'], rows,
    summary: { 'Opriri': total, 'Timp staționat total': fmtDur(totalDur) } };
}

async function rSpeeding(db, imeis, from, to, opts, devMap) { // Depășiri viteză
  const limit = opts.limit || 90;
  const rows = []; let events = 0, maxOverall = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let ev = null;
    for (const p of pts) {
      const sp = p.speed || 0;
      if (sp > limit) {
        if (!ev) ev = { start: p.timestamp, max: sp, p };
        else if (sp > ev.max) { ev.max = sp; ev.p = p; }
        ev.end = p.timestamp;
      } else if (ev) {
        rows.push([ label(devMap, imei), fmtTs(ev.start), limit, ev.max, loc(ev.p) ]);
        events++; if (ev.max > maxOverall) maxOverall = ev.max; ev = null;
      }
    }
    if (ev) { rows.push([ label(devMap, imei), fmtTs(ev.start), limit, ev.max, loc(ev.p) ]); events++; if (ev.max > maxOverall) maxOverall = ev.max; }
  }
  return { columns: ['Vehicul','Moment','Limită (km/h)','Viteză max (km/h)','Locație'], rows,
    summary: { 'Depășiri': events, 'Viteză maximă (km/h)': maxOverall, 'Limită folosită': limit } };
}

async function rFuel(db, imeis, from, to, opts, devMap) { // Alimentări & scurgeri/furt
  const refuelMin = opts.refuelMin || 10, dropMin = opts.dropMin || 10;
  const rows = []; let refuels = 0, drops = 0, addedL = 0, lostL = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let prev = null;
    for (const p of pts) {
      const fl = fuelL(p);
      if (fl == null) continue;
      if (prev != null) {
        const delta = fl - prev.v;
        if (delta >= refuelMin) { rows.push([ label(devMap, imei), fmtTs(p.timestamp), 'Alimentare', '+' + delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); refuels++; addedL += delta; }
        else if (delta <= -dropMin) { rows.push([ label(devMap, imei), fmtTs(p.timestamp), 'Scădere/furt', delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); drops++; lostL += -delta; }
      }
      prev = { v: fl };
    }
  }
  return { columns: ['Vehicul','Moment','Tip','Δ Litri','Nivel (L)','Locație'], rows,
    summary: { 'Alimentări': refuels, 'Litri alimentați': Math.round(addedL), 'Scăderi suspecte': drops, 'Litri scăzuți': Math.round(lostL) } };
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
  if (zone.type === 'circle') return haversineKm(lat, lng, zone.center[0], zone.center[1]) * 1000 <= zone.radius;
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

async function rGeofence(db, imeis, from, to, opts, devMap) { // Vizite în zone (geofence)
  const gfs = await db.getGeofences();
  const zones = gfs.map(g => {
    const c = typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : g.coordinates;
    return { name: g.name, type: g.type, center: c && c.center, radius: c && c.radius, coords: Array.isArray(c) ? c : null };
  });
  const rows = []; let total = 0, totalDwell = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    for (const z of zones) {
      const visits = zoneVisits(pts, z);
      for (const v of visits) { rows.push([ label(devMap, imei), z.name, fmtTs(v.enter), fmtTs(v.exit), fmtDur(v.durationSec) ]); total++; totalDwell += v.durationSec; }
    }
  }
  return { columns: ['Vehicul','Zonă','Intrare','Ieșire','Durată'], rows,
    summary: { 'Vizite': total, 'Timp total în zone': fmtDur(totalDwell) } };
}

async function rDriver(db, imeis, from, to, opts, devMap) { // Pontaj șofer (per vehicul/zi)
  const drv = {}; try { (await db.getDrivers()).forEach(d => drv[d.id] = d.name); } catch (e) {}
  const rows = []; let totalKm = 0, totalDrive = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const byDay = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], day = new Date(p.timestamp).toISOString().slice(0,10);
      const d = byDay[day] || (byDay[day] = { first: p.timestamp, last: p.timestamp, km: 0, drive: 0 });
      d.last = p.timestamp;
      if (i > 0) {
        const pr = pts[i-1], dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
        if (dist < MAX_STEP_KM) d.km += dist;
        const dt = (t(p) - t(pr)) / 1000;
        if (dt > 0 && dt < 3600 && (p.speed || 0) > IDLE_SPEED) d.drive += dt;
      }
    }
    const dv = devMap[imei] && devMap[imei].driver_id ? (drv[devMap[imei].driver_id] || '—') : '—';
    for (const day of Object.keys(byDay).sort()) {
      const d = byDay[day];
      rows.push([ dv, label(devMap, imei), day, fmtTs(d.first).split(',')[1] || '', fmtTs(d.last).split(',')[1] || '', fmtDur(d.drive), d.km.toFixed(1) ]);
      totalKm += d.km; totalDrive += d.drive;
    }
  }
  return { columns: ['Șofer','Vehicul','Zi','Prima activ.','Ultima activ.','Timp condus','Km'], rows,
    summary: { 'Zile-vehicul': rows.length, 'Km total': Math.round(totalKm), 'Timp condus total': fmtDur(totalDrive) } };
}

async function rUtilization(db, imeis, from, to, opts, devMap) { // Utilizare flotă
  const rows = []; let totalKm = 0, totalEng = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let km = 0, eng = 0, maxSpeed = 0; const days = new Set();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if ((p.speed||0) > maxSpeed) maxSpeed = p.speed || 0;
      if (i > 0) {
        const pr = pts[i-1], dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
        if (dist < MAX_STEP_KM) km += dist;
        const dt = (t(p) - t(pr)) / 1000;
        if (dt > 0 && dt < 3600 && (ignOn(pr) || ignOn(p))) eng += dt;
        if ((p.speed||0) > IDLE_SPEED) days.add(new Date(p.timestamp).toISOString().slice(0,10));
      }
    }
    rows.push([ label(devMap, imei), Math.round(km), fmtDur(eng), days.size, Math.round(maxSpeed), pts.length ]);
    totalKm += km; totalEng += eng;
  }
  rows.sort((a, b) => b[1] - a[1]);
  return { columns: ['Vehicul','Km','Ore motor','Zile active','Vit. max','Puncte GPS'], rows,
    summary: { 'Vehicule': imeis.length, 'Km total': Math.round(totalKm), 'Ore motor total': fmtDur(totalEng) } };
}

async function rLocation(db, imeis, from, to, opts, devMap) { // Locație (ultima poziție până la 'to')
  const rows = [];
  for (const imei of imeis) {
    const r = await db.pool.query('SELECT * FROM positions WHERE imei = $1 AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 1', [imei, to]);
    const p = r.rows[0]; if (!p) continue;
    const i = p.io_data || {};
    rows.push([ label(devMap, imei), fmtTs(p.timestamp), loc(p), Math.round(p.speed || 0), i.ignition === 1 ? 'pornit' : 'oprit', p.satellites || 0 ]);
  }
  return { columns: ['Vehicul', 'Moment', 'Locație', 'Viteză', 'Contact', 'Sateliți'], rows, summary: { 'Vehicule': rows.length } };
}

async function rDaily(db, imeis, from, to, opts, devMap) { // Situație zilnică
  const rows = []; let totalKm = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const byDay = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], day = new Date(p.timestamp).toISOString().slice(0, 10);
      const d = byDay[day] || (byDay[day] = { km: 0, move: 0, eng: 0, max: 0, first: p.timestamp, last: p.timestamp });
      d.last = p.timestamp; if ((p.speed || 0) > d.max) d.max = p.speed || 0;
      if (i > 0) {
        const pr = pts[i - 1], dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude);
        if (dist < MAX_STEP_KM) d.km += dist;
        const dt = (t(p) - t(pr)) / 1000;
        if (dt > 0 && dt < 3600) { if ((p.speed || 0) > IDLE_SPEED) d.move += dt; if (ignOn(pr) || ignOn(p)) d.eng += dt; }
      }
    }
    const seg = segmentTrack(pts, (opts.stopMin || 5) * 60);
    seg.stops.forEach(s => { const day = new Date(s.start).toISOString().slice(0, 10); if (byDay[day]) byDay[day].stops = (byDay[day].stops || 0) + 1; });
    for (const day of Object.keys(byDay).sort()) {
      const d = byDay[day];
      rows.push([ label(devMap, imei), day, d.km.toFixed(1), fmtDur(d.move), fmtDur(d.eng), d.stops || 0, Math.round(d.max) ]);
      totalKm += d.km;
    }
  }
  return { columns: ['Vehicul', 'Zi', 'Km', 'Timp mers', 'Ore motor', 'Opriri', 'Vit. max'], rows, summary: { 'Zile-vehicul': rows.length, 'Km total': Math.round(totalKm) } };
}

async function rRoute(db, imeis, from, to, opts, devMap) { // Traseu (jurnal cronologic deplasări + staționări)
  const rows = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const seg = segmentTrack(pts, (opts.stopMin || 5) * 60);
    const ev = [];
    seg.trips.forEach(tr => ev.push({ t: new Date(tr.start).getTime(), row: [label(devMap, imei), 'Deplasare', fmtTs(tr.start), fmtTs(tr.end), fmtDur(tr.durationSec), tr.distanceKm.toFixed(1), loc(tr.startP) + ' → ' + loc(tr.endP)] }));
    seg.stops.forEach(s => ev.push({ t: new Date(s.start).getTime(), row: [label(devMap, imei), 'Staționare', fmtTs(s.start), fmtTs(s.end), fmtDur(s.durationSec), '', loc(s.p)] }));
    ev.sort((a, b) => a.t - b.t);
    ev.forEach(e => rows.push(e.row));
  }
  return { columns: ['Vehicul', 'Tip', 'Start', 'Stop', 'Durată', 'Km', 'Locație'], rows, summary: { 'Înregistrări': rows.length } };
}

async function rConsumption(db, imeis, from, to, opts, devMap) { // Consum carburant (sumar)
  const rows = []; let tCons = 0, tDist = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refueled = 0, dist = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p);
      if (fl != null) { if (first == null) first = fl; last = fl; if (prev != null) { const dlt = fl - prev; if (dlt >= (opts.refuelMin || 10)) refueled += dlt; } prev = fl; }
      if (i > 0) { const pr = pts[i - 1], dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dd < MAX_STEP_KM) dist += dd; }
    }
    if (first == null) { rows.push([label(devMap, imei), '—', '—', '—', dist.toFixed(0), '—', '—']); continue; }
    const consumed = Math.max(0, (first - last) + refueled);
    const per100 = dist > 1 ? (consumed / dist * 100) : 0;
    rows.push([ label(devMap, imei), first.toFixed(0) + ' L', last.toFixed(0) + ' L', refueled.toFixed(0) + ' L', dist.toFixed(0), consumed.toFixed(0) + ' L', per100 ? per100.toFixed(1) : '—' ]);
    tCons += consumed; tDist += dist;
  }
  return { columns: ['Vehicul', 'Nivel start', 'Nivel final', 'Alimentat', 'Km', 'Consumat', 'L/100km'], rows,
    summary: { 'Consum total (L)': Math.round(tCons), 'Km total': Math.round(tDist), 'Mediu L/100km': tDist > 1 ? (tCons / tDist * 100).toFixed(1) : '—' } };
}

async function rCan(db, imeis, from, to, opts, devMap) { // Date CAN (snapshot ultim)
  const rows = [];
  for (const imei of imeis) {
    const r = await db.pool.query('SELECT * FROM positions WHERE imei = $1 AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 1', [imei, to]);
    const p = r.rows[0]; if (!p) continue;
    const i = p.io_data || {};
    const axle = [i.can_axle1_load, i.can_axle2_load, i.can_axle3_load, i.can_axle4_load, i.can_axle5_load].reduce((s, v) => s + (v || 0), 0) || i.can_load_weight || 0;
    rows.push([
      label(devMap, imei), fmtTs(p.timestamp),
      i.can_fuel_level_liters != null ? i.can_fuel_level_liters + ' L' : '—',
      i.can_engine_temp != null ? i.can_engine_temp + '°C' : '—',
      i.can_rpm != null ? i.can_rpm : '—',
      i.can_total_mileage != null ? Math.round(i.can_total_mileage) + ' km' : '—',
      axle ? axle + ' kg' : '—',
      i.can_dtc_errors || 0
    ]);
  }
  return { columns: ['Vehicul', 'Moment', 'Combustibil', 'Temp. motor', 'RPM', 'Total km', 'Sarcină axe', 'Erori DTC'], rows, summary: { 'Vehicule': rows.length } };
}

async function rEvents(db, imeis, from, to, opts, devMap) { // Evenimente (alerte declanșate)
  const all = await db.getAlertHistory(2000);
  const fromT = new Date(from).getTime(), toT = new Date(to).getTime();
  const set = new Set(imeis);
  const rows = [];
  for (const e of all) {
    const tt = new Date(e.triggered_at).getTime();
    if (tt < fromT || tt > toT) continue;
    if (!set.has(e.imei)) continue;
    rows.push([ label(devMap, e.imei), e.alert_name || e.alert_type || '—', fmtTs(e.triggered_at), e.data ? JSON.stringify(e.data).slice(0, 90) : '' ]);
  }
  return { columns: ['Vehicul', 'Eveniment', 'Moment', 'Detalii'], rows, summary: { 'Evenimente': rows.length } };
}

async function rAnalytic(db, imeis, from, to, opts, devMap) { // Analitic (brut, punct-cu-punct)
  const cap = opts.cap || 5000; const rows = []; let capped = false;
  for (const imei of imeis) {
    if (rows.length >= cap) { capped = true; break; }
    const pts = await history(db, imei, from, to);
    for (const p of pts) {
      if (rows.length >= cap) { capped = true; break; }
      const i = p.io_data || {};
      rows.push([ label(devMap, imei), fmtTs(p.timestamp), p.latitude.toFixed(5), p.longitude.toFixed(5), Math.round(p.speed || 0), i.ignition === 1 ? 'DA' : 'NU', i.can_fuel_level_liters != null ? i.can_fuel_level_liters : '', p.satellites || 0 ]);
    }
  }
  return { columns: ['Vehicul', 'Moment', 'Lat', 'Lng', 'Viteză', 'Contact', 'Combustibil', 'Sat.'], rows, summary: { 'Puncte': rows.length, 'Plafon atins': capped ? 'da (' + cap + ')' : 'nu' } };
}

async function rEcoDrive(db, imeis, from, to, opts, devMap) { // EcoDrive — scor comportament șofer
  const limit = opts.limit || 90;
  const HARSH_ACCEL = opts.harshAccel || 7; // km/h pe secundă (~1.9 m/s²)
  const HARSH_BRAKE = opts.harshBrake || 9; // km/h pe secundă (~2.5 m/s²)
  const HARSH_TURN = opts.harshTurn || 25;  // grade/secundă la viteză > 25 km/h
  const rows = []; let fleetScoreW = 0, fleetKm = 0, fleetVeh = 0, totA = 0, totB = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let km = 0, accel = 0, brake = 0, hardTurn = 0, speedOverSec = 0, idleSec = 0, driveSec = 0;
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
        if (a > HARSH_ACCEL) accel++;
        if (a < -HARSH_BRAKE) brake++;
        if (sp > 25) { let da = Math.abs((p.angle || 0) - (pr.angle || 0)); if (da > 180) da = 360 - da; if (da / dt > HARSH_TURN) hardTurn++; }
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
    rows.push([label(devMap, imei), score + ' · ' + grade, accel, brake, hardTurn, fmtDur(speedOverSec), Math.round(idleShare * 100) + '%', Math.round(km)]);
    const w = Math.max(1, km); fleetScoreW += score * w; fleetKm += w; fleetVeh++; totA += accel; totB += brake;
  }
  rows.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));
  return {
    columns: ['Vehicul', 'Scor · Notă', 'Accel. bruște', 'Frânări bruște', 'Viraje bruște', 'Timp peste viteză', 'Ralanti', 'Km'],
    rows,
    summary: { 'Scor flotă (0-100)': fleetKm > 0 ? Math.round(fleetScoreW / fleetKm) : 0, 'Vehicule evaluate': fleetVeh, 'Accelerări bruște': totA, 'Frânări bruște': totB }
  };
}

async function rIdling(db, imeis, from, to, opts, devMap) { // Ralanti (motor pornit + staționat)
  const minSec = (opts.idleMin || 3) * 60;
  const lph = opts.idleLph || 1.5; // L/h consumați la ralanti (estimare)
  const rows = []; let totalIdle = 0, totalEvents = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let start = null, last = null;
    const flush = (endLoc) => { if (start) { const dur = (new Date(last) - new Date(start)) / 1000; if (dur >= minSec) { rows.push([label(devMap, imei), fmtTs(start), fmtDur(dur), endLoc]); totalIdle += dur; totalEvents++; } start = null; } };
    for (const p of pts) {
      if (ignOn(p) && (p.speed || 0) <= IDLE_SPEED) { if (!start) start = p.timestamp; last = p.timestamp; }
      else flush(loc(p));
    }
    flush('');
  }
  return { columns: ['Vehicul', 'Început', 'Durată ralanti', 'Locație'], rows,
    summary: { 'Evenimente ralanti': totalEvents, 'Timp ralanti total': fmtDur(totalIdle), 'Combustibil estimat irosit (L)': Math.round(totalIdle / 3600 * lph) } };
}

async function rCosts(db, imeis, from, to, opts, devMap) { // Costuri combustibil (din consum + preț/vehicul)
  const priceMap = {}; try { (await db.pool.query('SELECT imei, fuel_price FROM devices')).rows.forEach(d => priceMap[d.imei] = parseFloat(d.fuel_price)); } catch (e) {}
  const rows = []; let tKm = 0, tCons = 0, tCost = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refuel = 0, dist = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p);
      if (fl != null) { if (first == null) first = fl; last = fl; if (prev != null) { const d = fl - prev; if (d >= (opts.refuelMin || 10)) refuel += d; } prev = fl; }
      if (i > 0) { const pr = pts[i - 1], dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dd < MAX_STEP_KM) dist += dd; }
    }
    const consumed = first != null ? Math.max(0, (first - last) + refuel) : 0;
    const price = priceMap[imei] || opts.fuelPrice || 7.5;
    const cost = consumed * price, perKm = dist > 1 ? cost / dist : 0;
    rows.push([label(devMap, imei), Math.round(dist), consumed.toFixed(0) + ' L', price.toFixed(2), Math.round(cost) + ' RON', perKm ? perKm.toFixed(2) + ' RON' : '—']);
    tKm += dist; tCons += consumed; tCost += cost;
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4]));
  return { columns: ['Vehicul', 'Km', 'Consumat', 'Preț (RON/L)', 'Cost combustibil', 'Cost/km'], rows,
    summary: { 'Km total': Math.round(tKm), 'Consum total (L)': Math.round(tCons), 'Cost total (RON)': Math.round(tCost) } };
}

// Catalog: cat = monitorizare | consum | can | evenimente | siguranta
const REPORTS = {
  trips:       { label: 'Foaie de parcurs',     cat: 'monitorizare', fn: rTrips },
  route:       { label: 'Traseu',                cat: 'monitorizare', fn: rRoute },
  location:    { label: 'Locație',               cat: 'monitorizare', fn: rLocation },
  stops:       { label: 'Staționări',            cat: 'monitorizare', fn: rStops },
  daily:       { label: 'Situație zilnică',       cat: 'monitorizare', fn: rDaily },
  idling:      { label: 'Ralanti',                cat: 'monitorizare', fn: rIdling },
  driver:      { label: 'Pontaj șofer',           cat: 'monitorizare', fn: rDriver },
  utilization: { label: 'Index km / ore',         cat: 'monitorizare', fn: rUtilization },
  analytic:    { label: 'Analitic',               cat: 'monitorizare', fn: rAnalytic },
  consumption: { label: 'Consum carburant',       cat: 'consum',       fn: rConsumption },
  fuel:        { label: 'Alimentări & scurgeri',  cat: 'consum',       fn: rFuel },
  costs:       { label: 'Costuri combustibil',    cat: 'consum',       fn: rCosts },
  can:         { label: 'Date CAN',               cat: 'can',          fn: rCan },
  speeding:    { label: 'Depășiri viteză',        cat: 'evenimente',   fn: rSpeeding },
  geofence:    { label: 'Vizite în zone',         cat: 'evenimente',   fn: rGeofence },
  events:      { label: 'Evenimente (alerte)',    cat: 'evenimente',   fn: rEvents },
  ecodrive:    { label: 'EcoDrive (comportament)', cat: 'siguranta',   fn: rEcoDrive }
};
const REPORT_CATEGORIES = [
  { key: 'monitorizare', label: 'Monitorizare' },
  { key: 'consum', label: 'Consum carburant' },
  { key: 'can', label: 'Date CAN' },
  { key: 'evenimente', label: 'Evenimente & zone' },
  { key: 'siguranta', label: 'Siguranță & EcoDrive' }
];

async function runReport(db, type, imeis, from, to, opts) {
  const def = REPORTS[type];
  if (!def) throw new Error('Tip de raport necunoscut: ' + type);
  const devMap = await deviceNames(db, imeis);
  const result = await def.fn(db, imeis, from, to, opts || {}, devMap);
  result.type = type; result.label = def.label; result.from = from; result.to = to;
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

module.exports = { runReport, REPORTS, REPORT_CATEGORIES, hotspot, analyzeZone, segmentTrack };
