// reports.js — Motor de rapoarte flotă (calcule din tabela positions).
// Toate funcțiile primesc (db, imeis[], from, to, opts) și întorc { columns, rows, summary }.

const IDLE_SPEED = 3;        // km/h sub care vehiculul e considerat oprit
const MAX_STEP_KM = 10;      // ignoră salturi GPS mai mari (puncte aberante)
let geocode = null; try { geocode = require('./geocode'); } catch (e) {} // reverse-geocode (adrese în Foaie de parcurs)

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
  if (h > 0) return m > 0 ? (h + 'h ' + m + 'm') : (h + 'h');
  if (m > 0) return m + 'm';
  return s + 's';
}
function loc(p) { return p ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : ''; }
function io(p) { return p && p.io_data ? p.io_data : {}; }
// Odometru (km) din CAN la un punct (start/stop cursă). Fallback null dacă vehiculul n-are CAN.
function odo(p) { const i = io(p); let v = i.can_total_mileage; if (v == null) v = i.can_total_mileage_counted; if (v == null) v = i.total_odometer; const n = parseFloat(v); return (isFinite(n) && n > 0) ? Math.round(n) : null; }
// Adresă din cache (reverse-geocode); fallback pe coordonate dacă nu e încă rezolvată.
function addr(p) { if (!p) return ''; if (geocode && geocode.peek) { const a = geocode.peek(p.latitude, p.longitude); if (a) return a; } return loc(p); }
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

// ─── Helpers grafice (charts pentru rapoarte) ───
// Contract: un raport poate întoarce `charts: [{ type, title, labels, datasets:[{label,data}] }]`.
// Frontend-ul (renderReport) le desenează cu Chart.js și aplică paleta automat.
function _dayKeyISO(ts) { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return ''; } }
function _dayLabel(isoKey) { const p = String(isoKey).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : isoKey; }
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
    try { await geocode.warm(coords, { maxUnique: 50, budgetMs: imeis.length <= 1 ? 8000 : 3000 }); } catch (e) {}
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
      vehicul: v.name, firstDeparture: fmtTs(f.start), lastArrival: fmtTs(l.end),
      totalKm: Math.round(tKm * 10) / 10, kmStart: kmStart != null ? kmStart : '—', kmEnd: kmEnd != null ? kmEnd : '—',
      tripCount: trips.length, rows: v.rows
    };
  }).sort((a, b) => String(a.vehicul).localeCompare(String(b.vehicul)));
  const kmDay = _groupByDay(all, x => x.start, x => x.distanceKm);
  const nDay = _groupByDay(all, x => x.start, null);
  const spd = _histogram(all.map(x => x.maxSpeed), [50, 70, 90, 110]);
  const charts = all.length ? [
    { type: 'bar',  title: 'Distanță parcursă pe zi (km)',    labels: kmDay.labels, datasets: [{ label: 'km', data: kmDay.data }] },
    { type: 'line', title: 'Curse pe zi',                     labels: nDay.labels,  datasets: [{ label: 'curse', data: nDay.data }] },
    { type: 'bar',  title: 'Distribuție viteză maximă (km/h)', labels: spd.labels,   datasets: [{ label: 'curse', data: spd.data }] }
  ] : [];
  return { columns: ['Vehicul','Plecare','Loc. plecare','Sosire','Loc. sosire','Durată','Distanță (km)','Km plecare','Km sosire','Vit. medie','Vit. max'],
    rows, summary: { 'Curse': count, 'Distanță totală (km)': Math.round(totalKm*10)/10, 'Durată totală': fmtDur(totalDur) }, charts, perVehicle };
}

async function rStops(db, imeis, from, to, opts, devMap) { // Opriri / staționări
  const rows = []; let total = 0, totalDur = 0; const all = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const { stops } = segmentTrack(pts, (opts.stopMin || 5) * 60);
    for (const st of stops) {
      rows.push([ label(devMap, imei), fmtTs(st.start), fmtTs(st.end), fmtDur(st.durationSec), loc(st.p) ]);
      total++; totalDur += st.durationSec; all.push(st);
      const nm = label(devMap, imei); perVeh[nm] = (perVeh[nm] || 0) + 1;
    }
  }
  const nDay = _groupByDay(all, x => x.start, null);
  const dur = _histogram(all.map(x => x.durationSec / 60), [15, 30, 60, 120]);
  const topV = _topN(Object.entries(perVeh), 10);
  const charts = all.length ? [
    { type: 'bar',      title: 'Opriri pe zi',                       labels: nDay.labels, datasets: [{ label: 'opriri', data: nDay.data }] },
    { type: 'bar',      title: 'Distribuție durată oprire (min)',    labels: dur.labels,  datasets: [{ label: 'opriri', data: dur.data }] },
    { type: 'doughnut', title: 'Top vehicule după număr de opriri',  labels: topV.labels, datasets: [{ label: 'opriri', data: topV.data }] }
  ] : [];
  return { columns: ['Vehicul','Început','Sfârșit','Durată','Locație'], rows,
    summary: { 'Opriri': total, 'Timp staționat total': fmtDur(totalDur) }, charts };
}

async function rSpeeding(db, imeis, from, to, opts, devMap) { // Depășiri viteză
  const limit = opts.limit || 90;
  const rows = []; let events = 0, maxOverall = 0; const evs = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    let ev = null;
    const flush = () => { if (!ev) return; rows.push([ nm, fmtTs(ev.start), limit, ev.max, loc(ev.p) ]); events++; if (ev.max > maxOverall) maxOverall = ev.max; evs.push({ start: ev.start, max: ev.max }); perVeh[nm] = (perVeh[nm] || 0) + 1; ev = null; };
    for (const p of pts) {
      const sp = p.speed || 0;
      if (sp > limit) { if (!ev) ev = { start: p.timestamp, max: sp, p }; else if (sp > ev.max) { ev.max = sp; ev.p = p; } ev.end = p.timestamp; }
      else flush();
    }
    flush();
  }
  const nDay = _groupByDay(evs, x => x.start, null);
  const spd = _histogram(evs.map(x => x.max), [limit + 10, limit + 20, limit + 35]);
  const topV = _topN(Object.entries(perVeh), 10);
  const charts = evs.length ? [
    { type: 'bar',      title: 'Depășiri pe zi',                     labels: nDay.labels, datasets: [{ label: 'depășiri', data: nDay.data }] },
    { type: 'bar',      title: 'Distribuție viteză depășire (km/h)', labels: spd.labels,  datasets: [{ label: 'depășiri', data: spd.data }] },
    { type: 'doughnut', title: 'Top vehicule după depășiri',         labels: topV.labels, datasets: [{ label: 'depășiri', data: topV.data }] }
  ] : [];
  return { columns: ['Vehicul','Moment','Limită (km/h)','Viteză max (km/h)','Locație'], rows,
    summary: { 'Depășiri': events, 'Viteză maximă (km/h)': maxOverall, 'Limită folosită': limit }, charts };
}

async function rFuel(db, imeis, from, to, opts, devMap) { // Alimentări & scurgeri/furt
  const refuelMin = opts.refuelMin || 10, dropMin = opts.dropMin || 10;
  const rows = []; let refuels = 0, drops = 0, addedL = 0, lostL = 0; const refs = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let prev = null;
    for (const p of pts) {
      const fl = fuelL(p);
      if (fl == null) continue;
      if (prev != null) {
        const delta = fl - prev.v;
        if (delta >= refuelMin) { rows.push([ label(devMap, imei), fmtTs(p.timestamp), 'Alimentare', '+' + delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); refuels++; addedL += delta; refs.push({ ts: p.timestamp, v: delta }); }
        else if (delta <= -dropMin) { rows.push([ label(devMap, imei), fmtTs(p.timestamp), 'Scădere/furt', delta.toFixed(1), prev.v.toFixed(1) + ' → ' + fl.toFixed(1), loc(p) ]); drops++; lostL += -delta; }
      }
      prev = { v: fl };
    }
  }
  const refDay = _groupByDay(refs, x => x.ts, x => x.v);
  const charts = (refuels || drops) ? [
    { type: 'doughnut', title: 'Alimentări vs. scăderi suspecte', labels: ['Alimentări', 'Scăderi suspecte'], datasets: [{ label: 'evenimente', data: [refuels, drops] }] },
    { type: 'bar',      title: 'Litri alimentați pe zi',          labels: refDay.labels, datasets: [{ label: 'L', data: refDay.data }] }
  ] : [];
  return { columns: ['Vehicul','Moment','Tip','Δ Litri','Nivel (L)','Locație'], rows,
    summary: { 'Alimentări': refuels, 'Litri alimentați': Math.round(addedL), 'Scăderi suspecte': drops, 'Litri scăzuți': Math.round(lostL) }, charts };
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

async function rGeofence(db, imeis, from, to, opts, devMap, companyId) { // Vizite în zone (geofence)
  // Tenant: doar zonele companiei solicitantului (companyId null = super-admin → toate, by design).
  const gfs = await db.getGeofences(companyId);
  const zones = gfs.map(g => {
    const c = typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : g.coordinates;
    return { name: g.name, type: g.type, center: c && c.center, radius: c && c.radius, coords: Array.isArray(c) ? c : null };
  });
  const rows = []; let total = 0, totalDwell = 0; const all = []; const visByZone = {}, dwellByZone = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    for (const z of zones) {
      const visits = zoneVisits(pts, z);
      for (const v of visits) { rows.push([ label(devMap, imei), z.name, fmtTs(v.enter), fmtTs(v.exit), fmtDur(v.durationSec) ]); total++; totalDwell += v.durationSec; all.push(v); visByZone[z.name] = (visByZone[z.name] || 0) + 1; dwellByZone[z.name] = (dwellByZone[z.name] || 0) + v.durationSec; }
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
  return { columns: ['Vehicul','Zonă','Intrare','Ieșire','Durată'], rows,
    summary: { 'Vizite': total, 'Timp total în zone': fmtDur(totalDwell) }, charts };
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

  const recs = [];
  let T_move = 0, T_idle = 0, T_off = 0, T_total = 0, T_visits = 0, T_km = 0, vehs = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    if (!pts.length) continue;
    const visits = zoneVisits(pts, zone);
    let move = 0, idle = 0, off = 0, km = 0;
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i];
      if (!insideZone(pr.latitude, pr.longitude, zone) || !insideZone(p.latitude, p.longitude, zone)) continue;
      const dt = (t(p) - t(pr)) / 1000;
      if (dt <= 0) continue;
      const dkm = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); // km parcurși în perimetru
      if (dkm < MAX_STEP_KM) km += dkm;
      if (dt > GAP) off += dt;                              // pauză = parcat cu motorul oprit în zonă
      else if ((pr.speed || 0) > IDLE_SPEED) move += dt;   // în mișcare
      else if (ignOn(pr)) idle += dt;                      // ralanti (motor pornit, pe loc)
      else off += dt;                                       // motor oprit
    }
    const total = move + idle + off;
    if (total <= 0 && !visits.length) continue;
    vehs++; T_move += move; T_idle += idle; T_off += off; T_total += total; T_visits += visits.length; T_km += km;
    recs.push({ name: label(devMap, imei), total, move, idle, off, eng: move + idle, km, visits: visits.length,
      first: visits.length ? visits[0].enter : null, last: visits.length ? visits[visits.length - 1].exit : null });
  }
  recs.sort((a, b) => b.total - a.total);
  const rows = recs.map(r => [ r.name, fmtDur(r.total), fmtDur(r.move), fmtDur(r.idle), fmtDur(r.off), fmtDur(r.eng), r.km.toFixed(1) + ' km', r.visits, fmtTs(r.first), fmtTs(r.last) ]);
  const top = recs.slice(0, 10);
  const charts = recs.length ? [
    { type: 'doughnut', title: 'Timp pe stări (în perimetru)', labels: ['În mișcare', 'Ralanti', 'Motor oprit'], datasets: [{ label: 'min', data: [Math.round(T_move / 60), Math.round(T_idle / 60), Math.round(T_off / 60)] }] },
    { type: 'bar', title: 'Ore de funcționare pe vehicul (h)', labels: top.map(r => r.name), datasets: [{ label: 'ore', data: top.map(r => Math.round(r.eng / 360) / 10) }] }
  ] : [];
  return {
    columns: ['Vehicul', 'Timp în perimetru', 'În mișcare', 'Ralanti', 'Motor oprit', 'Ore funcționare', 'Km parcurși', 'Vizite', 'Prima intrare', 'Ultima ieșire'],
    rows,
    summary: {
      'Hotspot': g.name,
      'Vehicule în perimetru': vehs,
      'Timp total în perimetru': fmtDur(T_total),
      'În mișcare': fmtDur(T_move),
      'Ralanti': fmtDur(T_idle),
      'Motor oprit': fmtDur(T_off),
      'Ore de funcționare': fmtDur(T_move + T_idle),
      'Km parcurși': T_km.toFixed(1) + ' km',
      'Vizite totale': T_visits
    },
    charts
  };
}

async function rDriver(db, imeis, from, to, opts, devMap) { // Pontaj șofer (per vehicul/zi)
  const drv = {}; try { (await db.getDrivers()).forEach(d => drv[d.id] = d.name); } catch (e) {}
  const rows = []; let totalKm = 0, totalDrive = 0; const drvKm = {}, dayDrive = {};
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
      drvKm[dv] = (drvKm[dv] || 0) + d.km; dayDrive[day] = (dayDrive[day] || 0) + d.drive;
    }
  }
  const topDrv = _topN(Object.entries(drvKm), 10);
  const dayKeys = Object.keys(dayDrive).sort();
  const charts = rows.length ? [
    { type: 'bar', title: 'Km pe șofer',             labels: topDrv.labels,          datasets: [{ label: 'km', data: topDrv.data }] },
    { type: 'bar', title: 'Timp condus pe zi (ore)', labels: dayKeys.map(_dayLabel), datasets: [{ label: 'ore', data: dayKeys.map(k => Math.round(dayDrive[k] / 360) / 10) }] }
  ] : [];
  return { columns: ['Șofer','Vehicul','Zi','Prima activ.','Ultima activ.','Timp condus','Km'], rows,
    summary: { 'Zile-vehicul': rows.length, 'Km total': Math.round(totalKm), 'Timp condus total': fmtDur(totalDrive) }, charts };
}

async function rUtilization(db, imeis, from, to, opts, devMap) { // Utilizare flotă
  const rows = []; let totalKm = 0, totalEng = 0; const vehKm = [], vehEng = [];
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
    const nm = label(devMap, imei);
    rows.push([ nm, Math.round(km), fmtDur(eng), days.size, Math.round(maxSpeed), pts.length ]);
    totalKm += km; totalEng += eng; vehKm.push([nm, km]); vehEng.push([nm, eng / 3600]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  const topKm = _topN(vehKm, 10), topEng = _topN(vehEng, 10);
  const charts = rows.length ? [
    { type: 'bar', title: 'Km pe vehicul',        labels: topKm.labels,  datasets: [{ label: 'km', data: topKm.data }] },
    { type: 'bar', title: 'Ore motor pe vehicul', labels: topEng.labels, datasets: [{ label: 'ore', data: topEng.data }] }
  ] : [];
  return { columns: ['Vehicul','Km','Ore motor','Zile active','Vit. max','Puncte GPS'], rows,
    summary: { 'Vehicule': imeis.length, 'Km total': Math.round(totalKm), 'Ore motor total': fmtDur(totalEng) }, charts };
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
  const rows = []; let totalKm = 0; const dayKm = {}, dayMove = {};
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
      totalKm += d.km; dayKm[day] = (dayKm[day] || 0) + d.km; dayMove[day] = (dayMove[day] || 0) + d.move;
    }
  }
  const dk = Object.keys(dayKm).sort();
  const charts = rows.length ? [
    { type: 'bar',  title: 'Km pe zi (flotă)',         labels: dk.map(_dayLabel), datasets: [{ label: 'km', data: dk.map(k => Math.round(dayKm[k] * 10) / 10) }] },
    { type: 'line', title: 'Timp în mers pe zi (ore)', labels: dk.map(_dayLabel), datasets: [{ label: 'ore', data: dk.map(k => Math.round(dayMove[k] / 360) / 10) }] }
  ] : [];
  return { columns: ['Vehicul', 'Zi', 'Km', 'Timp mers', 'Ore motor', 'Opriri', 'Vit. max'], rows, summary: { 'Zile-vehicul': rows.length, 'Km total': Math.round(totalKm) }, charts };
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
  const rows = []; let tCons = 0, tDist = 0; const vCons = [], vPer = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refueled = 0, dist = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p);
      if (fl != null) { if (first == null) first = fl; last = fl; if (prev != null) { const dlt = fl - prev; if (dlt >= (opts.refuelMin || 10)) refueled += dlt; } prev = fl; }
      if (i > 0) { const pr = pts[i - 1], dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dd < MAX_STEP_KM) dist += dd; }
    }
    const nm = label(devMap, imei);
    if (first == null) { rows.push([nm, '—', '—', '—', dist.toFixed(0), '—', '—']); continue; }
    const consumed = Math.max(0, (first - last) + refueled);
    const per100 = dist > 1 ? (consumed / dist * 100) : 0;
    rows.push([ nm, first.toFixed(0) + ' L', last.toFixed(0) + ' L', refueled.toFixed(0) + ' L', dist.toFixed(0), consumed.toFixed(0) + ' L', per100 ? per100.toFixed(1) : '—' ]);
    tCons += consumed; tDist += dist; vCons.push([nm, consumed]); if (per100) vPer.push([nm, per100]);
  }
  const topCons = _topN(vCons, 10), topPer = _topN(vPer, 10);
  const charts = vCons.length ? [
    { type: 'bar', title: 'Consum pe vehicul (L)', labels: topCons.labels, datasets: [{ label: 'L', data: topCons.data }] },
    { type: 'bar', title: 'L/100km pe vehicul',    labels: topPer.labels,  datasets: [{ label: 'L/100km', data: topPer.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Nivel start', 'Nivel final', 'Alimentat', 'Km', 'Consumat', 'L/100km'], rows,
    summary: { 'Consum total (L)': Math.round(tCons), 'Km total': Math.round(tDist), 'Mediu L/100km': tDist > 1 ? (tCons / tDist * 100).toFixed(1) : '—' }, charts };
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
  const rows = []; const evs = []; const byType = {};
  for (const e of all) {
    const tt = new Date(e.triggered_at).getTime();
    if (tt < fromT || tt > toT) continue;
    if (!set.has(e.imei)) continue;
    const typ = e.alert_name || e.alert_type || '—';
    rows.push([ label(devMap, e.imei), typ, fmtTs(e.triggered_at), e.data ? JSON.stringify(e.data).slice(0, 90) : '' ]);
    evs.push({ ts: e.triggered_at }); byType[typ] = (byType[typ] || 0) + 1;
  }
  const nDay = _groupByDay(evs, x => x.ts, null);
  const topT = _topN(Object.entries(byType), 8);
  const charts = rows.length ? [
    { type: 'line',     title: 'Evenimente pe zi', labels: nDay.labels, datasets: [{ label: 'evenimente', data: nDay.data }] },
    { type: 'doughnut', title: 'Evenimente pe tip', labels: topT.labels, datasets: [{ label: 'evenimente', data: topT.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Eveniment', 'Moment', 'Detalii'], rows, summary: { 'Evenimente': rows.length }, charts };
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
  const rows = []; let fleetScoreW = 0, fleetKm = 0, fleetVeh = 0, totA = 0, totB = 0, totT = 0; const vehScore = [];
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
    const w = Math.max(1, km); fleetScoreW += score * w; fleetKm += w; fleetVeh++; totA += accel; totB += brake; totT += hardTurn; vehScore.push([label(devMap, imei), score]);
  }
  rows.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));
  const topS = _topN(vehScore, 10);
  const charts = vehScore.length ? [
    { type: 'bar',      title: 'Scor EcoDrive pe vehicul',  labels: topS.labels, datasets: [{ label: 'scor', data: topS.data }] },
    { type: 'doughnut', title: 'Evenimente bruște (total)', labels: ['Accelerări', 'Frânări', 'Viraje'], datasets: [{ label: 'evenimente', data: [totA, totB, totT] }] }
  ] : [];
  return {
    columns: ['Vehicul', 'Scor · Notă', 'Accel. bruște', 'Frânări bruște', 'Viraje bruște', 'Timp peste viteză', 'Ralanti', 'Km'],
    rows,
    summary: { 'Scor flotă (0-100)': fleetKm > 0 ? Math.round(fleetScoreW / fleetKm) : 0, 'Vehicule evaluate': fleetVeh, 'Accelerări bruște': totA, 'Frânări bruște': totB }, charts
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
  const lph = opts.idleLph || 1.5; // L/h consumați la ralanti (estimare)
  const rows = []; let totalIdle = 0, totalEvents = 0; const all = []; const perVeh = {};
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    const nm = label(devMap, imei);
    let start = null, last = null;
    const flush = (endLoc) => { if (start) { const dur = (new Date(last) - new Date(start)) / 1000; if (dur >= minSec) { rows.push([nm, fmtTs(start), fmtDur(dur), endLoc]); totalIdle += dur; totalEvents++; all.push({ ts: start, dur }); perVeh[nm] = (perVeh[nm] || 0) + dur; } start = null; } };
    for (const p of pts) {
      if (ignOn(p) && (p.speed || 0) <= IDLE_SPEED) { if (!start) start = p.timestamp; last = p.timestamp; }
      else flush(loc(p));
    }
    flush('');
  }
  const idleDay = _groupByDay(all, x => x.ts, x => x.dur / 60);
  const topV = _topN(Object.entries(perVeh).map(([n, s]) => [n, s / 60]), 10);
  const charts = all.length ? [
    { type: 'bar',      title: 'Ralanti pe zi (min)',             labels: idleDay.labels, datasets: [{ label: 'min', data: idleDay.data }] },
    { type: 'doughnut', title: 'Top vehicule după ralanti (min)', labels: topV.labels,    datasets: [{ label: 'min', data: topV.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Început', 'Durată ralanti', 'Locație'], rows,
    summary: { 'Evenimente ralanti': totalEvents, 'Timp ralanti total': fmtDur(totalIdle), 'Combustibil estimat irosit (L)': Math.round(totalIdle / 3600 * lph) }, charts };
}

async function rCosts(db, imeis, from, to, opts, devMap) { // Costuri combustibil (din consum + preț/vehicul)
  const priceMap = {}; try { (await db.pool.query('SELECT imei, fuel_price FROM devices')).rows.forEach(d => priceMap[d.imei] = parseFloat(d.fuel_price)); } catch (e) {}
  const rows = []; let tKm = 0, tCons = 0, tCost = 0; const vCost = [], vPerKm = [];
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
    const nm = label(devMap, imei);
    rows.push([nm, Math.round(dist), consumed.toFixed(0) + ' L', price.toFixed(2), Math.round(cost) + ' RON', perKm ? perKm.toFixed(2) + ' RON' : '—']);
    tKm += dist; tCons += consumed; tCost += cost; vCost.push([nm, cost]); if (perKm) vPerKm.push([nm, perKm]);
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4]));
  const topC = _topN(vCost, 10), topK = _topN(vPerKm, 10);
  const charts = vCost.length ? [
    { type: 'bar', title: 'Cost combustibil pe vehicul (RON)', labels: topC.labels, datasets: [{ label: 'RON', data: topC.data }] },
    { type: 'bar', title: 'Cost pe km (RON)',                  labels: topK.labels, datasets: [{ label: 'RON/km', data: topK.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Km', 'Consumat', 'Preț (RON/L)', 'Cost combustibil', 'Cost/km'], rows,
    summary: { 'Km total': Math.round(tKm), 'Consum total (L)': Math.round(tCons), 'Cost total (RON)': Math.round(tCost) }, charts };
}

async function rCostsTotal(db, imeis, from, to, opts, devMap) { // Costuri totale: combustibil (auto din telemetrie) + service (mentenanță) + acte (documente)
  const d0 = String(from).slice(0, 10), d1 = String(to).slice(0, 10);
  const priceMap = {}; try { (await db.pool.query('SELECT imei, fuel_price FROM devices')).rows.forEach(d => priceMap[d.imei] = parseFloat(d.fuel_price)); } catch (e) {}
  const svcMap = {}; try {
    const r = await db.pool.query("SELECT imei, COALESCE(SUM(cost),0)::float AS c FROM maintenance WHERE status='done' AND imei = ANY($1) AND COALESCE(done_date, done_at::date) BETWEEN $2 AND $3 GROUP BY imei", [imeis, d0, d1]);
    r.rows.forEach(x => svcMap[x.imei] = x.c);
  } catch (e) {}
  const docMap = {}; try {
    const r = await db.pool.query("SELECT imei, COALESCE(SUM(cost),0)::float AS c FROM vehicle_documents WHERE imei = ANY($1) AND issue_date BETWEEN $2 AND $3 GROUP BY imei", [imeis, d0, d1]);
    r.rows.forEach(x => docMap[x.imei] = x.c);
  } catch (e) {}
  const rows = []; let tFuel = 0, tSvc = 0, tDoc = 0, tKm = 0; const vTotal = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refuel = 0, dist = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p);
      if (fl != null) { if (first == null) first = fl; last = fl; if (prev != null) { const dd = fl - prev; if (dd >= (opts.refuelMin || 10)) refuel += dd; } prev = fl; }
      if (i > 0) { const pr = pts[i - 1], dk = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dk < MAX_STEP_KM) dist += dk; }
    }
    const consumed = first != null ? Math.max(0, (first - last) + refuel) : 0;
    const fuelCost = consumed * (priceMap[imei] || opts.fuelPrice || 7.5);
    const svc = svcMap[imei] || 0, doc = docMap[imei] || 0;
    const total = fuelCost + svc + doc, perKm = dist > 1 ? total / dist : 0;
    const nm = label(devMap, imei);
    rows.push([nm, Math.round(fuelCost) + ' RON', Math.round(svc) + ' RON', Math.round(doc) + ' RON', Math.round(total) + ' RON', perKm ? perKm.toFixed(2) + ' RON' : '—']);
    tFuel += fuelCost; tSvc += svc; tDoc += doc; tKm += dist; if (total) vTotal.push([nm, total]);
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4]));
  const grand = tFuel + tSvc + tDoc;
  const topT = _topN(vTotal, 10);
  const charts = grand ? [
    { type: 'doughnut', title: 'Costuri pe categorie (RON)', labels: ['Combustibil', 'Service', 'Acte'], datasets: [{ label: 'RON', data: [Math.round(tFuel), Math.round(tSvc), Math.round(tDoc)] }] },
    { type: 'bar', title: 'Cost total pe vehicul (RON)', labels: topT.labels, datasets: [{ label: 'RON', data: topT.data }] }
  ] : [];
  return { columns: ['Vehicul', 'Combustibil', 'Service', 'Acte', 'Total', 'Cost/km'], rows,
    summary: { 'Combustibil (RON)': Math.round(tFuel), 'Service (RON)': Math.round(tSvc), 'Acte (RON)': Math.round(tDoc), 'TOTAL (RON)': Math.round(grand), 'Km total': Math.round(tKm) }, charts };
}

async function rEmissions(db, imeis, from, to, opts, devMap) { // Emisii CO₂ (din consum carburant)
  const FACTOR = opts.co2Factor || 2.64; // kg CO₂ / litru motorină
  const rows = []; let tCo2 = 0, tKm = 0, tCons = 0; const vCo2 = [], vPerKm = [];
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refuel = 0, dist = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p);
      if (fl != null) { if (first == null) first = fl; last = fl; if (prev != null) { const d = fl - prev; if (d >= (opts.refuelMin || 10)) refuel += d; } prev = fl; }
      if (i > 0) { const pr = pts[i - 1], dd = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dd < MAX_STEP_KM) dist += dd; }
    }
    const consumed = first != null ? Math.max(0, (first - last) + refuel) : 0;
    const co2 = consumed * FACTOR;
    const perKm = dist > 1 ? co2 / dist * 1000 : 0; // g/km
    const nm = label(devMap, imei);
    rows.push([nm, Math.round(dist), consumed.toFixed(0) + ' L', (co2 / 1000).toFixed(2) + ' t', perKm ? Math.round(perKm) + ' g/km' : '—']);
    tCo2 += co2; tKm += dist; tCons += consumed; vCo2.push([nm, co2]); if (perKm) vPerKm.push([nm, perKm]);
  }
  rows.sort((a, b) => parseFloat(b[3]) - parseFloat(a[3]));
  const topC = _topN(vCo2, 10), topK = _topN(vPerKm, 10);
  const charts = vCo2.length ? [
    { type: 'bar', title: 'CO₂ pe vehicul (kg)', labels: topC.labels, datasets: [{ label: 'kg', data: topC.data }] },
    { type: 'bar', title: 'CO₂ pe km (g/km)',    labels: topK.labels, datasets: [{ label: 'g/km', data: topK.data }] }
  ] : [];
  return {
    columns: ['Vehicul', 'Km', 'Consum', 'CO₂', 'CO₂/km'], rows,
    summary: { 'CO₂ total (t)': (tCo2 / 1000).toFixed(2), 'Consum total (L)': Math.round(tCons), 'Km total': Math.round(tKm), 'Factor (kg/L)': FACTOR }, charts
  };
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
  costs_total: { label: 'Costuri totale (toate)', cat: 'consum',       fn: rCostsTotal },
  emissions:   { label: 'Emisii CO₂',             cat: 'consum',       fn: rEmissions },
  can:         { label: 'Date CAN',               cat: 'can',          fn: rCan },
  speeding:    { label: 'Depășiri viteză',        cat: 'evenimente',   fn: rSpeeding },
  geofence:    { label: 'Vizite în zone',         cat: 'evenimente',   fn: rGeofence },
  hotspot:     { label: 'Raport Hotspot',         cat: 'evenimente',   fn: rHotspot },
  events:      { label: 'Evenimente (alerte)',    cat: 'evenimente',   fn: rEvents },
  ecodrive:    { label: 'EcoDrive (comportament)', cat: 'siguranta',   fn: rEcoDrive },
  ecodrive_drivers: { label: 'EcoDrive — clasament șoferi', cat: 'siguranta', fn: rEcoDriveDrivers }
};
const REPORT_CATEGORIES = [
  { key: 'monitorizare', label: 'Monitorizare' },
  { key: 'consum', label: 'Consum carburant' },
  { key: 'can', label: 'Date CAN' },
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
  const refuelMin = opts.refuelMin || 10, idleLph = opts.idleLph || 1.5, co2Factor = opts.co2Factor || 2.64;
  const MAX_PER100 = 200; // peste atât, semnalul de nivel e zgomot → folosim estimarea
  const bucket = opts.bucket === 'month' ? 'month' : 'day';
  const devMap = await deviceNames(db, imeis);
  const cfg = {};
  try { (await db.pool.query('SELECT imei, fuel_price, fuel_type, vehicle_type, consumption_road, consumption_city, consumption_idle FROM devices')).rows.forEach(d => { cfg[d.imei] = { price: parseFloat(d.fuel_price) || opts.fuelPrice || 7.5, fuelType: d.fuel_type || null, vtype: d.vehicle_type || null, cRoad: parseFloat(d.consumption_road) || null, cCity: parseFloat(d.consumption_city) || null, cIdle: parseFloat(d.consumption_idle) || null }; }); } catch (e) {}
  const perVehicle = [], seriesMap = {};
  let kL = 0, kKm = 0, kCost = 0, kIdleL = 0, kIdleSec = 0, kCo2 = 0, kIdleCost = 0, vWith = 0, vEst = 0;
  for (const imei of imeis) {
    const pts = await history(db, imei, from, to);
    let first = null, last = null, refueled = 0, dist = 0, prev = null, idleSec = 0, prevP = null;
    const bF = {}, bL = {}, bPrev = {}, bRefuel = {}, bIdle = {}, bDist = {};
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], fl = fuelL(p), bk = _bucketKey(p.timestamp, bucket);
      if (fl != null) {
        if (first == null) first = fl; last = fl;
        if (prev != null) { const d = fl - prev; if (d >= refuelMin) refueled += d; }
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
    const price = c.price || 7.5;
    const cRoad = c.cRoad || c.cCity || defConsumption(c.vtype);  // L/100km pentru estimare
    const cIdleLph = c.cIdle || idleLph;                          // L/h ralanti
    const idleH = idleSec / 3600, idleL = idleH * cIdleLph;
    // Consum din senzorul de nivel (sondă/CAN): scădere netă + realimentări detectate (salturi ≥ refuelMin).
    const hasFuel = first != null;
    const sensorL = hasFuel ? Math.max(0, (first - last) + refueled) : 0;
    const sensorPer100 = (hasFuel && dist > 1) ? (sensorL / dist * 100) : null;
    // Senzorul e „de încredere" doar dacă dă consum > 0 pe distanță reală și un L/100km plauzibil (filtrăm zgomotul).
    const sensorOk = hasFuel && sensorL > 0 && dist > 1 && sensorPer100 >= 1 && sensorPer100 <= MAX_PER100;
    // Estimare din config (sau implicit pe tip) + km + ralanti — folosită când nu există senzor fiabil.
    const estL = dist * cRoad / 100 + idleL;
    let liters = sensorOk ? sensorL : estL;
    if (liters < idleL) liters = idleL;            // totalul include MEREU ralanti-ul (fizic, e parte din total)
    const estimated = !sensorOk;
    const per100 = dist > 1 ? +(liters / dist * 100).toFixed(1) : null;
    const cost = liters * price;
    perVehicle.push({ imei, name: (devMap[imei] && devMap[imei].name) || imei, plate: (devMap[imei] && devMap[imei].plate) || '', km: Math.round(dist), liters: Math.round(liters), per100, cost: Math.round(cost), idleLiters: +idleL.toFixed(1), idleSec: Math.round(idleSec), co2Kg: Math.round(liters * co2Factor), price: +price.toFixed(2), fuelType: c.fuelType || null, estimated, hasFuel });
    kKm += dist; kIdleSec += idleSec; kIdleL += idleL; kIdleCost += idleL * price; kCo2 += liters * co2Factor;
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
  const series = { labels: keys, consumed: keys.map(k => Math.round(seriesMap[k].consumed)), idle: keys.map(k => +seriesMap[k].idle.toFixed(1)), cost: keys.map(k => Math.round(seriesMap[k].cost)) };
  const topConsumers = perVehicle.filter(v => v.liters > 0).sort((a, b) => b.liters - a.liters).slice(0, 10).map(v => ({ imei: v.imei, name: v.name, plate: v.plate, liters: v.liters, per100: v.per100, km: v.km, estimated: v.estimated }));
  const kpi = { totalLiters: Math.round(kL), totalKm: Math.round(kKm), avgPer100: kKm > 1 ? +(kL / kKm * 100).toFixed(1) : 0, fuelCost: Math.round(kCost), idleLiters: +kIdleL.toFixed(1), idleSec: Math.round(kIdleSec), idlePct: kL > 0 ? Math.round(kIdleL / kL * 100) : 0, idleCost: Math.round(kIdleCost), co2Tons: +(kCo2 / 1000).toFixed(2), vehiclesWithData: vWith, vehiclesTotal: imeis.length, vehiclesEstimated: vEst };
  return { range: { from, to, bucket }, kpi, series, topConsumers, perVehicle };
}

async function runReport(db, type, imeis, from, to, opts, companyId) {
  const def = REPORTS[type];
  if (!def) throw new Error('Tip de raport necunoscut: ' + type);
  const devMap = await deviceNames(db, imeis);
  // companyId (null = super/toate) e propagat la fn-urile care citesc definiții scopabile pe companie (ex: geofence).
  const result = await def.fn(db, imeis, from, to, opts || {}, devMap, companyId);
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

module.exports = { runReport, fuelStats, REPORTS, REPORT_CATEGORIES, hotspot, analyzeZone, segmentTrack };
