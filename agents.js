// agents.js — cadru de agenți AI pentru RA Tracks.
// Agenți: RA Watch (monitorizare), RA Care (mentenanță), RA Optimize (eco/costuri),
//         RA Compliance (ore de condus), RA Client (raport zilnic).
// Fiecare run(ctx) întoarce { findings: [...] }. Rezumatul AI se face de către apelant (server).

let segmentTrack = null;
try { segmentTrack = require('./reports').segmentTrack; } catch (e) { segmentTrack = null; }

const SPEED_LIMIT = 90;        // km/h
const IDLE_MIN_MINUTES = 120;  // ralanti prelungit (RA Watch)
const FUEL_DROP_L = 15;        // scădere suspectă combustibil
const OFFLINE_MIN = 60;        // minute fără poziție = offline (>1h; parcate care trimit o dată/oră NU sunt offline)
const FUEL_PRICE = 7.5;        // lei/L (estimare pentru costuri)
const IDLE_BURN_LPH = 1.5;     // L/h consum la ralanti (estimare)
const SERVICE_SOON_KM = 1500;  // prag „revizie în curând"

// IO: punctele din istoric au `io_data`, pozițiile live au `io` — acoperim ambele.
function io(p) { return (p && (p.io_data || p.io)) || {}; }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function fuelL(p) { const i = io(p); const v = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; }
function odoKm(p) { const i = io(p); return num(i.can_total_mileage) != null ? num(i.can_total_mileage) : (num(i.can_total_mileage_counted) != null ? num(i.can_total_mileage_counted) : (num(i.total_odometer) != null ? i.total_odometer / 1000 : null)); }
function nameOf(live, imei) { return (live && (live.name || live.plate)) || imei; }
function tms(p) { return new Date(p.timestamp).getTime(); }
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function roDate(d) { try { return new Date(d).toLocaleDateString('ro-RO'); } catch (e) { return '' + d; } }

// Limita de viteză efectivă: per-vehicul dacă există, altfel fallback SPEED_LIMIT.
async function _vehLimit(ctx, imei) {
  const fallback = (ctx && Number(ctx.defaultSpeedLimit) > 0) ? Number(ctx.defaultSpeedLimit) : SPEED_LIMIT; // implicit din Setări sistem, altfel 90
  if (!ctx || !ctx.db || !ctx.db.getDeviceFull) return fallback;
  try { const d = await ctx.db.getDeviceFull(imei); return (d && d.speed_limit) ? Number(d.speed_limit) : fallback; } catch (e) { return fallback; }
}

// ─── RA Watch — monitorizare 24/7 (anomalii operaționale) ───
// RA Watch — alerte de monitorizare:
//  (1) Offline > OFFLINE_MIN (implicit 60 min, max 24h)
//  (2) Scădere combustibil > prag (implicit FUEL_DROP_L = 15L)
//  (3) Ralanti prelungit > prag (implicit IDLE_MIN_MINUTES = 120 min)
// Toate pragurile configurabile per companie prin ctx.alertThresholds (cu fallback la constantele globale).
async function raWatch(ctx) {
  const { imeis, livePositions } = ctx; const findings = []; const now = Date.now();
  const thresholds = (ctx && ctx.alertThresholds) || {};
  const offlineMin = Number.isFinite(thresholds.offlineMin) && thresholds.offlineMin > 0 ? thresholds.offlineMin : OFFLINE_MIN;
  const fuelDropL = Number.isFinite(thresholds.fuelDropL) && thresholds.fuelDropL > 0 ? thresholds.fuelDropL : FUEL_DROP_L;
  const idleMaxMinPrag = Number.isFinite(thresholds.idleMaxMin) && thresholds.idleMaxMin > 0 ? thresholds.idleMaxMin : IDLE_MIN_MINUTES;
  for (const imei of imeis) {
    const live = livePositions.get(imei);
    const name = nameOf(live, imei);
    // (1) Offline
    if (live && live.timestamp) {
      const ageMin = (now - new Date(live.timestamp).getTime()) / 60000;
      if (ageMin > offlineMin && ageMin < 24 * 60) {
        const hours = Math.floor(ageMin / 60), mins = Math.round(ageMin % 60);
        const ageStr = hours > 0 ? (hours + 'h ' + mins + 'm') : (Math.round(ageMin) + ' min');
        findings.push({ imei, severity: 'warning', agent: 'watch', fkey: 'offline_' + imei, title: name + ': offline de ' + ageStr, body: 'Vehiculul nu mai trimite poziții de peste ' + Math.round(offlineMin) + ' min. Verifică dispozitivul/alimentarea/sim-ul.' });
      }
    }
    // (2) Scădere combustibil (peste pragul configurat, în istoricul zilei curente)
    if (ctx.hist) {
      try {
        const pts = await ctx.hist(imei);
        if (pts && pts.length) {
          let prevFuel = null, drop = 0;
          for (const p of pts) {
            const fl = fuelL(p);
            if (fl != null) {
              if (prevFuel != null && (prevFuel - fl) >= fuelDropL) drop = Math.max(drop, prevFuel - fl);
              prevFuel = fl;
            }
          }
          if (drop) findings.push({ imei, severity: 'critical', agent: 'watch', fkey: 'fuel_' + imei, title: name + ': scădere combustibil ~' + Math.round(drop) + ' L', body: 'Posibil furt sau scurgere (prag ' + Math.round(fuelDropL) + ' L). Verifică traseul și opririle.' });
          // (3) Ralanti prelungit (motor pornit + viteză ≤ 3 km/h, neîntrerupt)
          let idleStart = null, idleMaxMin = 0;
          for (const p of pts) {
            const idling = io(p).ignition === 1 && (p.speed || 0) <= 3;
            if (idling) { const t = tms(p); if (!idleStart) idleStart = t; idleMaxMin = Math.max(idleMaxMin, (t - idleStart) / 60000); }
            else idleStart = null;
          }
          if (idleMaxMin >= idleMaxMinPrag) findings.push({ imei, severity: 'info', agent: 'watch', fkey: 'idle_' + imei, title: name + ': ralanti ~' + Math.round(idleMaxMin) + ' min azi', body: 'Motor pornit, staționat îndelung (peste ' + Math.round(idleMaxMinPrag) + ' min). Combustibil irosit.' });
        }
      } catch (e) { /* lipsă date istoric — fără alertă */ }
    }
  }
  return { findings };
}

// ─── RA Care — mentenanță predictivă (revizii, ITP, asigurări) ───
async function raCare(ctx) {
  const { db, imeis, livePositions, companyId } = ctx; const findings = []; const now = Date.now(); const DAY = 86400000;
  const thresholds = (ctx && ctx.alertThresholds) || {};
  const serviceSoonKm = Number.isFinite(thresholds.serviceSoonKm) && thresholds.serviceSoonKm > 0 ? thresholds.serviceSoonKm : SERVICE_SOON_KM;
  for (const imei of imeis) {
    const live = livePositions.get(imei); const name = nameOf(live, imei);

    // 1) Distanță până la service din CAN (dacă vehiculul o expune)
    const dts = live ? num(io(live).can_distance_to_service) : null;
    if (dts != null) {
      if (dts <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_service_' + imei, title: name + ': service DEPĂȘIT cu ' + Math.round(-dts) + ' km', body: 'Vehiculul a depășit intervalul de revizie indicat de bord. Programează service-ul urgent.' });
      else if (dts <= serviceSoonKm) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_service_' + imei, title: name + ': revizie în ' + Math.round(dts) + ' km', body: 'Se apropie intervalul de service (prag ' + Math.round(serviceSoonKm) + ' km). Programează din timp.' });
    }

    // 2) Înregistrări de mentenanță (ITP, asigurare, revizie) — pe dată sau pe km
    let recs = []; try { recs = await db.getMaintenance(imei, companyId == null ? null : companyId); } catch (e) { recs = []; }
    const odo = live ? odoKm(live) : null;
    for (const m of recs) {
      const st = (m.status || '').toLowerCase();
      if (st === 'done' || st === 'completed' || m.done_date) continue;
      const tlabel = m.type || 'Mentenanță';
      if (m.due_date) {
        const days = Math.ceil((new Date(m.due_date).getTime() - now) / DAY);
        if (days <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_due_' + m.id, title: name + ': ' + tlabel + ' scadent', body: (m.description ? m.description + '. ' : '') + 'Termen depășit (' + roDate(m.due_date) + ').' });
        else if (days <= 30) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_due_' + m.id, title: name + ': ' + tlabel + ' expiră în ' + days + ' zile', body: (m.description ? m.description + '. ' : '') + 'Scadent la ' + roDate(m.due_date) + '.' });
      }
      if (m.due_km && odo != null) {
        const left = m.due_km - odo;
        if (left <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_km_' + m.id, title: name + ': ' + tlabel + ' — km depășiți', body: 'Odometru ' + Math.round(odo) + ' km ≥ scadență ' + m.due_km + ' km.' });
        else if (left <= serviceSoonKm) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_km_' + m.id, title: name + ': ' + tlabel + ' în ' + Math.round(left) + ' km', body: 'Programează service-ul din timp (prag ' + Math.round(serviceSoonKm) + ' km).' });
      }
    }
  }
  return { findings };
}

// ─── RA Optimize — eco-driving & costuri ───
async function raOptimize(ctx) {
  const { imeis, livePositions } = ctx; const findings = []; let fleetIdleSec = 0;
  const thresholds = (ctx && ctx.alertThresholds) || {};
  const ecoScoreMin = Number.isFinite(thresholds.ecoScoreMin) && thresholds.ecoScoreMin >= 0 && thresholds.ecoScoreMin <= 100 ? thresholds.ecoScoreMin : 60;
  for (const imei of imeis) {
    const live = livePositions.get(imei); const name = nameOf(live, imei);
    const pts = await ctx.hist(imei); if (pts.length < 5) continue;
    const limit = await _vehLimit(ctx, imei);
    let km = 0, accel = 0, brake = 0, hardTurn = 0, speedOverSec = 0, idleSec = 0, driveSec = 0;
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i - 1], p = pts[i]; const dt = (tms(p) - tms(pr)) / 1000;
      if (dt <= 0 || dt > 300) continue;
      const dist = haversineKm(pr.latitude, pr.longitude, p.latitude, p.longitude); if (dist < 10) km += dist;
      const sp = p.speed || 0, spPr = pr.speed || 0;
      if (sp > limit) speedOverSec += dt;
      if (sp > 3) driveSec += dt; else if (io(p).ignition === 1) idleSec += dt;
      if (dt <= 30) { const a = (sp - spPr) / dt; if (a > 7) accel++; if (a < -9) brake++; if (sp > 25) { let da = Math.abs((p.angle || 0) - (pr.angle || 0)); if (da > 180) da = 360 - da; if (da / dt > 25) hardTurn++; } }
    }
    fleetIdleSec += idleSec;
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
    if (score < ecoScoreMin) findings.push({ imei, severity: 'warning', agent: 'optimize', fkey: 'opt_eco_' + imei, title: name + ': scor eco ' + score + '/100', body: 'Conducere agresivă azi (' + accel + ' accel. bruște, ' + brake + ' frânări, ' + hardTurn + ' viraje). Prag alertă: sub ' + ecoScoreMin + '. Recomandă instruire șofer.' });
  }
  // Cost ralanti la nivel de flotă (o singură constatare, distinctă de RA Watch)
  const fleetIdleH = fleetIdleSec / 3600;
  if (fleetIdleH >= 2) {
    const wasteL = fleetIdleH * IDLE_BURN_LPH; const cost = wasteL * FUEL_PRICE;
    findings.push({ imei: null, severity: 'info', agent: 'optimize', fkey: 'opt_fleet_idle', title: 'Flotă: ' + fleetIdleH.toFixed(1) + ' h ralanti azi', body: 'Risipă estimată ~' + wasteL.toFixed(1) + ' L (~' + Math.round(cost) + ' lei). Reducerea ralantiului scade direct costurile.' });
  }
  return { findings };
}

// ─── RA Compliance — ore de condus (estimativ din GPS, Reg. CE 561/2006) ───
async function raCompliance(ctx) {
  const { imeis, livePositions } = ctx; const findings = [];
  if (!segmentTrack) return { findings };
  for (const imei of imeis) {
    const live = livePositions.get(imei); const name = nameOf(live, imei);
    const pts = await ctx.hist(imei); if (pts.length < 5) continue;
    const { trips } = segmentTrack(pts, 45 * 60); // o oprire ≥45 min = pauză legală (separă cursele)
    if (!trips.length) continue;
    let daily = 0, cont = 0, maxCont = 0;
    for (let i = 0; i < trips.length; i++) {
      if (i > 0) { const gap = (new Date(trips[i].start).getTime() - new Date(trips[i - 1].end).getTime()) / 1000; if (gap >= 45 * 60) cont = 0; else cont += gap; }
      cont += trips[i].durationSec; daily += trips[i].durationSec; maxCont = Math.max(maxCont, cont);
    }
    const contH = maxCont / 3600, dailyH = daily / 3600;
    if (contH > 4.5) findings.push({ imei, severity: contH > 5.5 ? 'critical' : 'warning', agent: 'compliance', fkey: 'comp_cont_' + imei, title: name + ': conducere continuă ~' + contH.toFixed(1) + ' h', body: 'Estimativ din GPS. Limita legală: 4h30 de condus fără pauză de 45 min (Reg. CE 561/2006).' });
    if (dailyH > 9) findings.push({ imei, severity: dailyH > 10 ? 'critical' : 'warning', agent: 'compliance', fkey: 'comp_daily_' + imei, title: name + ': conducere zilnică ~' + dailyH.toFixed(1) + ' h', body: 'Estimativ din GPS. Limita zilnică: 9h (extensibil la 10h de cel mult 2 ori/săptămână).' });
  }
  return { findings };
}

// ─── RA Client — raport zilnic automat pentru clienți (sinteză flotă) ───
async function raClient(ctx) {
  const { db, imeis, livePositions, todayStart, toIso } = ctx; const findings = [];
  let summ = []; try { summ = await db.getTripsSummaryForImeis(imeis, todayStart.toISOString(), toIso); } catch (e) { summ = []; }
  let totalKm = 0, active = 0, top = null;
  for (const s of summ) { const km = parseFloat(s.km) || 0; totalKm += km; if (km > 0.5) active++; if (!top || km > (parseFloat(top.km) || 0)) top = s; }
  const fleetSize = imeis.length;
  const topKm = top ? (parseFloat(top.km) || 0) : 0;
  const topName = top ? nameOf(livePositions.get(top.imei), top.imei) : '—';
  const body = 'Vehicule în flotă: ' + fleetSize + ' · active azi: ' + active + ' · distanță totală: ' + Math.round(totalKm) + ' km' + (topKm > 0 ? ' · cel mai activ: ' + topName + ' (' + Math.round(topKm) + ' km)' : '') + '.';
  findings.push({ imei: null, severity: 'info', agent: 'client', fkey: 'client_digest', title: 'Raport zilnic flotă — ' + Math.round(totalKm) + ' km, ' + active + '/' + fleetSize + ' active', body });
  return { findings };
}

// ─── RA Dispatch — alocare curse (disponibilitate + echilibrare flotă) ───
async function raDispatch(ctx) {
  const { imeis, livePositions } = ctx; const findings = []; const now = Date.now();
  const ONLINE_MS = 65 * 60000; // 1h + tampon (parcate care trimit o dată/oră rămân disponibile)
  const available = [];
  for (const imei of imeis) {
    const live = livePositions.get(imei); if (!live || !live.timestamp) continue;
    const online = (now - new Date(live.timestamp).getTime()) < ONLINE_MS;
    const stopped = (live.speed || 0) <= 3;
    if (online && stopped) available.push({ imei, name: nameOf(live, imei) });
  }
  if (available.length) {
    const names = available.slice(0, 8).map(a => a.name).join(', ') + (available.length > 8 ? ' …' : '');
    findings.push({ imei: null, severity: 'info', agent: 'dispatch', fkey: 'disp_available', title: available.length + ' vehicule disponibile acum pentru curse', body: 'Online și staționate: ' + names + '. Deschide „Dispecerizare" ca să găsești cel mai apropiat vehicul de o destinație.' });
  }
  // Subutilizate (după-amiaza): disponibile dar fără rulaj azi → candidate pentru o cursă nouă
  if (new Date().getHours() >= 12) {
    for (const a of available) {
      const pts = await ctx.hist(a.imei);
      let km = 0;
      for (let i = 1; i < pts.length; i++) { const d = haversineKm(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude); if (d < 10) km += d; }
      if (km < 1) findings.push({ imei: a.imei, severity: 'info', agent: 'dispatch', fkey: 'disp_idle_' + a.imei, title: a.name + ': nefolosit azi — disponibil', body: 'Sub 1 km parcurși azi și staționat acum. Candidat bun pentru o cursă nouă.' });
    }
  }
  return { findings };
}

const AGENTS = {
  watch: { name: 'RA Watch', desc: 'Monitorizare — vehicule offline (> prag minute) + scădere combustibil (> prag litri). Pragurile sunt configurabile per companie în Setări.', run: raWatch },
  dispatch: { name: 'RA Dispatch', desc: 'Alocare curse — vehicule disponibile acum + cel mai apropiat de o destinație.', run: raDispatch },
  care: { name: 'RA Care', desc: 'Mentenanță predictivă — revizii, ITP și asigurări scadente (pe dată sau pe km).', run: raCare },
  optimize: { name: 'RA Optimize', desc: 'Eco-driving & costuri — scor șofer, frânări/accelerări bruște, risipă la ralanti.', run: raOptimize },
  compliance: { name: 'RA Compliance', desc: 'Ore de condus — conducere continuă/zilnică (estimativ GPS, Reg. CE 561/2006).', run: raCompliance },
  client: { name: 'RA Client', desc: 'Raport zilnic automat — sinteză flotă pentru clienți (km, vehicule active, top).', run: raClient }
};

// Context comun cu cache de istoric (azi) partajat între agenți, ca să nu reinterogăm DB.
function buildCtx(base) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const fromIso = todayStart.toISOString(), toIso = new Date().toISOString();
  const cache = {};
  const hist = async (imei) => {
    if (cache[imei]) return cache[imei];
    let r = []; try { r = await base.db.getDeviceHistory(imei, fromIso, toIso); } catch (e) { r = []; }
    cache[imei] = r; return r;
  };
  return Object.assign({}, base, { hist, todayStart, fromIso, toIso });
}

async function runAgent(key, base) {
  const a = AGENTS[key];
  if (!a) throw new Error('Agent necunoscut: ' + key);
  return a.run(buildCtx(base));
}

// Rulează toți agenții (sau doar cei din `allowedKeys` dacă e setat) pe același context. Un agent care eșuează nu blochează restul.
async function runAll(base, allowedKeys) {
  const ctx = buildCtx(base); const all = [];
  const keys = Array.isArray(allowedKeys) ? allowedKeys.filter(k => AGENTS[k]) : Object.keys(AGENTS);
  for (const key of keys) {
    try { const r = await AGENTS[key].run(ctx); if (r && r.findings) all.push.apply(all, r.findings); }
    catch (e) { /* izolează eșecul unui agent */ }
  }
  return { findings: all };
}

module.exports = { AGENTS, runAgent, runAll };
