// agents.js — cadru de agenți AI pentru RA Tracks.
// Agenți: RA Watch (monitorizare), RA Care (mentenanță), RA Optimize (eco/costuri),
//         RA Compliance (ore de condus), RA Client (raport zilnic).
// Fiecare run(ctx) întoarce { findings: [...] }. Rezumatul AI se face de către apelant (server).

let segmentTrack = null;
try { segmentTrack = require('./reports').segmentTrack; } catch (e) { segmentTrack = null; }

const SPEED_LIMIT = 90;        // km/h
const IDLE_MIN_MINUTES = 120;  // ralanti prelungit (RA Watch)
const FUEL_DROP_L = 15;        // scădere suspectă combustibil (regulă veche, litri, punct-cu-punct)
const FUEL_DROP_PCT = 5;       // furt: scădere % după pornire care nu revine în 5 min
const FUEL_DROP_THEFT_L = 10;  // furt: scădere litri după pornire care nu revine în 5 min
const FUEL_RETURN_WINDOW_MS = 5 * 60 * 1000; // fereastra în care nivelul ar trebui să revină (5 min)
const FUEL_RETURN_TOL = 1.5;   // toleranță zgomot senzor (procente sau litri)
const OFFLINE_MIN = 60;        // minute fără poziție = offline (>1h; parcate care trimit o dată/oră NU sunt offline)
const FUEL_PRICE = 7.5;        // lei/L (estimare pentru costuri)
const IDLE_BURN_LPH = 1.5;     // L/h consum la ralanti (estimare)

// Ore zecimale → „Xh Ym" (userul vrea ore+minute peste tot în texte, nu „1.6 h").
function hmH(hours) {
  const s = Math.max(0, Math.round((hours || 0) * 3600));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? (m > 0 ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
}
const SERVICE_SOON_KM = 1500;  // prag „revizie în curând"
const TACHO_GRACE_MIN = 10;    // minute cu contact ON dar zero semnal tahograf = neconfigurat

// Tipuri de vehicul pentru care se aplică legislația tahograf (Reg. EU 561/2006, 165/2014).
const TACHO_TRUCK_TYPES = new Set(['Camion', 'Autobuz', 'Autoutilitară', 'Autoutilitara', 'TIR', 'Truck', 'Bus']);

// AVL IDs Teltonika care indică prezența unui tahograf citit corect (dacă apare oricare valoare ≠ 0, e OK).
// Acoperă: viteză/distanță tahograf (192-194), Driver 1/2 working state (184-187, 122-125),
// Drive Recognize / Tacho timestamp (183, 194), Driver 1/2 ID High/Low (195-198), Card 1/2 Issuing Member (222-223),
// Card presence / status (52), VIN tahograf (231, 233-235), VRN (230, 232).
const TACHO_IO_IDS = [52, 122, 123, 124, 125, 183, 184, 185, 186, 187, 188, 189, 192, 193, 194, 195, 196, 197, 198, 222, 223, 230, 231, 232, 233, 234, 235];
const TACHO_NAMED_KEYS = ['can_tacho_distance', 'can_tacho_speed', 'tacho_driver_card_presence', 'driver_card_id', 'driver_status_event', 'tachograph_total_vehicle_distance'];

// IO: punctele din istoric au `io_data`, pozițiile live au `io` — acoperim ambele.
function io(p) { return (p && (p.io_data || p.io)) || {}; }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function fuelL(p) { const i = io(p); const v = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; }
// Citire combustibil normalizată: { value, unit } unde unit ∈ {'L','pct'}. Preferă litri (sondă/CAN), altfel % (FMS).
function fuelReading(p) {
  const i = io(p);
  const l = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters;
  if (typeof l === 'number' && l > 0) return { value: l, unit: 'L' };
  const pct = i.can_fuel_level_pct;
  if (typeof pct === 'number' && pct >= 0 && pct <= 100) return { value: pct, unit: 'pct' };
  return null;
}
function odoKm(p) { const i = io(p); return num(i.can_total_mileage) != null ? num(i.can_total_mileage) : (num(i.can_total_mileage_counted) != null ? num(i.can_total_mileage_counted) : (num(i.total_odometer) != null ? i.total_odometer / 1000 : null)); }
function nameOf(live, imei) { return (live && (live.name || live.plate)) || imei; }
// Etichetă completă pentru dispecerizare: „Nume (Nr. înmatriculare)" — arată și numărul de înmatriculare.
function labelOf(live, imei) {
  const name = live && live.name ? String(live.name).trim() : '';
  const plate = live && live.plate ? String(live.plate).trim() : '';
  if (name && plate && name.toLowerCase() !== plate.toLowerCase()) return name + ' (' + plate + ')';
  return name || plate || imei;
}
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

// Verifică dacă vehiculul e tip „camion" (intră sub legislația tahografului).
async function _isTruck(ctx, imei) {
  if (!ctx || !ctx.db || !ctx.db.getDeviceFull) return false;
  try { const d = await ctx.db.getDeviceFull(imei); return d && TACHO_TRUCK_TYPES.has(String(d.vehicle_type || '').trim()); }
  catch (e) { return false; }
}

// Verifică dacă pachetul de IO conține VREUN semnal de tahograf valid (≠ 0/null).
function _hasAnyTachoSignal(p) {
  const i = io(p);
  for (const k of TACHO_NAMED_KEYS) {
    const v = i[k];
    if (v != null && v !== 0 && v !== '') return true;
  }
  for (const id of TACHO_IO_IDS) {
    const v = i['io_' + id];
    if (v != null && v !== 0 && v !== '') return true;
  }
  return false;
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
  const fuelDropPct = Number.isFinite(thresholds.fuelDropPct) && thresholds.fuelDropPct > 0 ? thresholds.fuelDropPct : FUEL_DROP_PCT;
  const fuelTheftL = Number.isFinite(thresholds.fuelTheftL) && thresholds.fuelTheftL > 0 ? thresholds.fuelTheftL : FUEL_DROP_THEFT_L;
  const idleMaxMinPrag = Number.isFinite(thresholds.idleMaxMin) && thresholds.idleMaxMin > 0 ? thresholds.idleMaxMin : IDLE_MIN_MINUTES;
  const tachoGraceMin = Number.isFinite(thresholds.tachoGraceMin) && thresholds.tachoGraceMin > 0 ? thresholds.tachoGraceMin : TACHO_GRACE_MIN;
  for (const imei of imeis) {
    const live = livePositions.get(imei);
    const name = nameOf(live, imei);
    // (1) Offline. Garda superioară de 7 zile (era 24h) — nu mai colizionează cu pragul user-ales până la 1440 min.
    if (live && live.timestamp) {
      const ageMin = (now - new Date(live.timestamp).getTime()) / 60000;
      if (ageMin > offlineMin && ageMin < 7 * 24 * 60) {
        const hours = Math.floor(ageMin / 60), mins = Math.round(ageMin % 60);
        const ageStr = hours > 0 ? (hours + 'h ' + mins + 'm') : (Math.round(ageMin) + ' min');
        findings.push({ imei, severity: 'warning', agent: 'watch', fkey: 'offline_' + imei, title: name + ': offline de ' + ageStr, body: 'Vehiculul nu mai trimite poziții de peste ' + Math.round(offlineMin) + ' min. Verifică dispozitivul/alimentarea/sim-ul.' });
      }
    }
    // (4) Tahograf neconfigurat — pentru camioane cu contact pornit dar zero semnal tahograf
    // Apare doar dacă: vehicul tip camion + ONLINE (ageMin <= 5) + ignition=1 + ≥3 puncte recente fără semnal
    // (3 puncte ca anti-fals-pozitiv: un singur pachet pierdut nu declanșează)
    if (live && live.timestamp) {
      const ageMin = (now - new Date(live.timestamp).getTime()) / 60000;
      const ignOn = io(live).ignition === 1;
      if (ageMin <= 5 && ignOn && await _isTruck(ctx, imei)) {
        let anySignal = _hasAnyTachoSignal(live);
        if (!anySignal && ctx.hist) {
          try {
            const pts = await ctx.hist(imei);
            const cutoff = now - tachoGraceMin * 60000;
            const recent = (pts || []).filter(p => new Date(p.timestamp).getTime() >= cutoff && io(p).ignition === 1);
            if (recent.length >= 3) {
              anySignal = recent.some(_hasAnyTachoSignal);
              if (!anySignal) {
                findings.push({
                  imei, severity: 'warning', agent: 'watch', fkey: 'tacho_missing_' + imei,
                  title: name + ': tahograf neconfigurat sau decuplat',
                  body: 'Camion cu contactul pornit de peste ' + Math.round(tachoGraceMin) + ' min, dar nu raportează niciun parametru de tahograf (viteză, distanță, card șofer, VIN). Verifică: 1) cablajul CAN/K-Line la tahograf, 2) cardul de companie introdus în VU, 3) activarea Remote Data Download (D8 pe Stoneridge / Update Card pe VDO).'
                });
              }
            }
          } catch (e) {
            // Eroare tranzitorie la istoric → log observabil (nu mai e silențioasă), continuă bucla.
            if (ctx.db && ctx.db.logError) ctx.db.logError({ level: 'warn', message: 'raWatch tacho hist: ' + (e && e.message), route: 'agents/raWatch', companyId: ctx.companyId, context: { imei, check: 'tacho' } }).catch(() => {});
          }
        }
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

          // (2b) FURT după pornire: oprit la nivel X, după pornire scade și NU revine în 5 min (> fuelDropPct% SAU > fuelTheftL litri).
          // Funcționează și pe FMS (procente), nu doar pe litri. Folosește tranziția contact 0→1 din istoricul zilei.
          let lastValid = null;   // ultima citire validă (orice stare motor)
          let stopLevel = null;   // nivelul cunoscut cât timp e oprit
          let prevIgn = null;
          let theft = null;       // { drop, unit, from, to }
          for (let k = 0; k < pts.length; k++) {
            const p = pts[k];
            const ign = io(p).ignition;
            const r = fuelReading(p);
            if (ign === 1 && prevIgn === 0) { // tocmai a pornit după ce a fost oprit
              // base = nivelul ÎNAINTE de pornire (stopLevel din staționare, sau ultima citire validă) — calculat ÎNAINTE de a actualiza lastValid cu citirea curentă.
              const base = stopLevel || lastValid;
              if (base) {
                const startTs = tms(p);
                let endVal = null; // ultima citire în fereastra de 5 min, în aceeași unitate
                for (let j = k; j < pts.length; j++) {
                  if (tms(pts[j]) > startTs + FUEL_RETURN_WINDOW_MS) break;
                  const rj = fuelReading(pts[j]);
                  if (rj && rj.unit === base.unit) endVal = rj.value;
                }
                if (endVal != null) {
                  const d = base.value - endVal; // scădere care NU a revenit (endVal = nivelul la finalul ferestrei)
                  if (d > FUEL_RETURN_TOL) {
                    const prag = base.unit === 'pct' ? fuelDropPct : fuelTheftL;
                    if (d >= prag && (!theft || d > theft.drop)) theft = { drop: d, unit: base.unit, from: base.value, to: endVal };
                  }
                }
              }
              stopLevel = null; // eveniment consumat
            }
            // Actualizează DUPĂ verificarea tranziției (ca base să fie nivelul de dinainte de pornire).
            if (r) { lastValid = { ...r, ts: tms(p) }; if (ign === 0) stopLevel = { ...r, ts: tms(p) }; }
            if (ign === 0 || ign === 1) prevIgn = ign;
          }
          if (theft) {
            const u = theft.unit === 'pct' ? '%' : ' L';
            findings.push({
              imei, severity: 'critical', agent: 'watch', fkey: 'fuel_theft_' + imei,
              title: name + ': posibil furt combustibil ~' + Math.round(theft.drop) + u + ' după pornire',
              body: 'Nivel la oprire ' + Math.round(theft.from) + u + ', iar la 5 min după pornire ' + Math.round(theft.to) + u + ' (scădere nerevenită). Prag: ' + Math.round(theft.unit === 'pct' ? fuelDropPct : fuelTheftL) + u + '. Verifică opririle/traseul.'
            });
          }
          // (3) Ralanti prelungit (motor pornit + viteză ≤ 3 km/h, neîntrerupt). Gap între puncte > 5min = discontinuitate (anti-fals-pozitiv pe istoric rar).
          const GAP_MAX_MS = 5 * 60 * 1000;
          let idleStart = null, idleLastT = null, idleMaxMin = 0;
          for (const p of pts) {
            const t = tms(p); const idling = io(p).ignition === 1 && (p.speed || 0) <= 3;
            if (idling) {
              if (!idleStart) { idleStart = t; idleLastT = t; }
              else if (idleLastT != null && (t - idleLastT) > GAP_MAX_MS) {
                // gap mare → reset (perioada veche nu mai e relevantă, contează doar continuitatea)
                idleStart = t; idleLastT = t;
              } else { idleLastT = t; }
              idleMaxMin = Math.max(idleMaxMin, (idleLastT - idleStart) / 60000);
            } else { idleStart = null; idleLastT = null; }
          }
          if (idleMaxMin >= idleMaxMinPrag) findings.push({ imei, severity: 'info', agent: 'watch', fkey: 'idle_' + imei, title: name + ': ralanti ~' + Math.round(idleMaxMin) + ' min azi', body: 'Motor pornit, staționat îndelung (peste ' + Math.round(idleMaxMinPrag) + ' min). Combustibil irosit.' });
        }
      } catch (e) {
        // Eroare tranzitorie la istoric (furt/idle) → log observabil; alertele time-sensitive nu mai dispar tăcut.
        if (ctx.db && ctx.db.logError) ctx.db.logError({ level: 'warn', message: 'raWatch fuel/idle hist: ' + (e && e.message), route: 'agents/raWatch', companyId: ctx.companyId, context: { imei, check: 'fuel_idle' } }).catch(() => {});
      }
    }
  }
  return { findings };
}

// ─── RA Care — mentenanță predictivă (revizii, ITP, asigurări) ───
// Praguri UNIFICATE cu canalul push (checkExpiries): careDaysLead (def 14 zile) + careKmLead (def 500 km),
// configurabile per companie. serviceSoonKm rămâne DOAR pentru distanța-până-la-service din bord (CAN).
async function raCare(ctx) {
  const { db, imeis, livePositions, companyId } = ctx; const findings = []; const now = Date.now(); const DAY = 86400000;
  const thresholds = (ctx && ctx.alertThresholds) || {};
  const serviceSoonKm = Number.isFinite(thresholds.serviceSoonKm) && thresholds.serviceSoonKm > 0 ? thresholds.serviceSoonKm : SERVICE_SOON_KM;
  const daysLead = Number.isFinite(thresholds.careDaysLead) && thresholds.careDaysLead > 0 ? thresholds.careDaysLead : 14;
  const kmLead = Number.isFinite(thresholds.careKmLead) && thresholds.careKmLead > 0 ? thresholds.careKmLead : 500;
  // Documentele vehiculelor (ITP/RCA/rovinietă…) — o singură citire per rulare, grupate pe imei.
  const docsByImei = new Map();
  try {
    const docs = await db.getVehicleDocuments(null, companyId == null ? null : companyId);
    for (const d of (docs || [])) { if (!d.imei) continue; if (!docsByImei.has(d.imei)) docsByImei.set(d.imei, []); docsByImei.get(d.imei).push(d); }
  } catch (e) {}
  for (const imei of imeis) {
    const live = livePositions.get(imei); const name = nameOf(live, imei);
    // Vechimea odometrului: CAN „sticky" (carry-forward) sau poziție mai veche de 48h → etichetăm estimările pe km.
    const posMs = live && live.timestamp ? new Date(live.timestamp).getTime() : null;
    const odoStale = !!(live && (live.can_stale || (posMs && (now - posMs) > 48 * 3600 * 1000)));
    const staleNote = odoStale ? ' Odometru din ' + roDate(live.can_snapshot_ts || live.timestamp) + ' (vehicul fără date recente).' : '';

    // 1) Distanță până la service din CAN (dacă vehiculul o expune)
    const dts = live ? num(io(live).can_distance_to_service) : null;
    if (dts != null) {
      if (dts <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_service_' + imei, title: name + ': service DEPĂȘIT cu ' + Math.round(-dts) + ' km', body: 'Vehiculul a depășit intervalul de revizie indicat de bord. Programează service-ul urgent.' + staleNote });
      else if (dts <= serviceSoonKm) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_service_' + imei, title: name + ': revizie în ' + Math.round(dts) + ' km', body: 'Se apropie intervalul de service (prag ' + Math.round(serviceSoonKm) + ' km). Programează din timp.' + staleNote });
    }

    // 2) Înregistrări de mentenanță (revizie, distribuție…) — pe dată sau pe km
    let recs = []; try { recs = await db.getMaintenance(imei, companyId == null ? null : companyId); } catch (e) { recs = []; }
    const odo = live ? odoKm(live) : null;
    let hasKmDue = false;
    for (const m of recs) {
      const st = (m.status || '').toLowerCase();
      if (st === 'done' || st === 'completed' || m.done_date) continue;
      const tlabel = m.type || 'Mentenanță';
      if (m.due_date) {
        const days = Math.ceil((new Date(m.due_date).getTime() - now) / DAY);
        if (days <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_due_' + m.id, title: name + ': ' + tlabel + ' scadent', body: (m.description ? m.description + '. ' : '') + 'Termen depășit (' + roDate(m.due_date) + ').' });
        else if (days <= daysLead) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_due_' + m.id, title: name + ': ' + tlabel + ' expiră în ' + days + (days === 1 ? ' zi' : ' zile'), body: (m.description ? m.description + '. ' : '') + 'Scadent la ' + roDate(m.due_date) + '.' });
      }
      if (m.due_km) {
        hasKmDue = true;
        if (odo != null) {
          const left = m.due_km - odo;
          if (left <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_km_' + m.id, title: name + ': ' + tlabel + ' — km depășiți', body: 'Odometru ' + Math.round(odo) + ' km ≥ scadență ' + m.due_km + ' km.' + staleNote });
          else if (left <= kmLead) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_km_' + m.id, title: name + ': ' + tlabel + ' în ' + Math.round(left) + ' km', body: 'Programează service-ul din timp (prag ' + Math.round(kmLead) + ' km).' + staleNote });
        }
      }
    }
    // Scadență pe km dar FĂRĂ odometru → altfel ar fi nesupravegheată în tăcere.
    if (hasKmDue && odo == null) findings.push({ imei, severity: 'info', agent: 'care', fkey: 'care_km_nosrc_' + imei, title: name + ': scadență pe km nesupravegheată', body: 'Există mentenanță cu scadență pe kilometri, dar vehiculul nu transmite odometru (CAN). Verifică interfața CAN sau folosește scadență pe dată.' });

    // 3) Documente (ITP / RCA / rovinietă…) — aceeași fereastră daysLead ca push-ul
    for (const d of (docsByImei.get(imei) || [])) {
      if (!d.expiry_date) continue;
      const days = Math.ceil((new Date(d.expiry_date).getTime() - now) / DAY);
      const dl = String(d.doc_type || 'Document').toUpperCase();
      if (days <= 0) findings.push({ imei, severity: 'critical', agent: 'care', fkey: 'care_doc_' + d.id, title: name + ': ' + dl + ' EXPIRAT' + (days < 0 ? ' de ' + (-days) + ' zile' : ''), body: dl + (d.number ? ' (' + d.number + ')' : '') + ' a expirat la ' + roDate(d.expiry_date) + '. Reînnoiește urgent.' });
      else if (days <= daysLead) findings.push({ imei, severity: 'warning', agent: 'care', fkey: 'care_doc_' + d.id, title: name + ': ' + dl + ' expiră în ' + days + (days === 1 ? ' zi' : ' zile'), body: dl + (d.number ? ' (' + d.number + ')' : '') + ' expiră la ' + roDate(d.expiry_date) + '.' });
    }
  }
  return { findings };
}

// ─── RA Optimize — eco-driving & costuri ───
async function raOptimize(ctx) {
  const { imeis, livePositions } = ctx; const findings = []; let fleetIdleSec = 0, evaluated = 0;
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
    evaluated++; // vehicul care a rulat efectiv azi → chiar a fost evaluat (pt. mesaj cinstit „au condus eco" vs „fără date")
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
    const _fp = (ctx && Number(ctx.fuelPrice) > 0) ? Number(ctx.fuelPrice) : FUEL_PRICE; // prețul REAL al companiei (motorină), fallback 7.5
    const wasteL = fleetIdleH * IDLE_BURN_LPH; const cost = wasteL * _fp;
    findings.push({ imei: null, severity: 'info', agent: 'optimize', fkey: 'opt_fleet_idle', title: 'Flotă: ' + hmH(fleetIdleH) + ' ralanti azi', body: 'Risipă estimată ~' + wasteL.toFixed(1) + ' L (~' + Math.round(cost) + ' lei). Reducerea ralantiului scade direct costurile.' });
  }
  return { findings, evaluated }; // evaluated = câte vehicule au rulat efectiv azi (mesaj cinstit când nu-s semnalări)
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
    if (contH > 4.5) findings.push({ imei, severity: contH > 5.5 ? 'critical' : 'warning', agent: 'compliance', fkey: 'comp_cont_' + imei, title: name + ': conducere continuă ~' + hmH(contH), body: 'Estimativ din GPS. Limita legală: 4h30 de condus fără pauză de 45 min (Reg. CE 561/2006).' });
    if (dailyH > 9) findings.push({ imei, severity: dailyH > 10 ? 'critical' : 'warning', agent: 'compliance', fkey: 'comp_daily_' + imei, title: name + ': conducere zilnică ~' + hmH(dailyH), body: 'Estimativ din GPS. Limita zilnică: 9h (extensibil la 10h de cel mult 2 ori/săptămână).' });
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
  const th = (ctx && ctx.alertThresholds) || {}; // praguri reglabile per companie (fallback la valorile clasice)
  const ONLINE_MS = (Number.isFinite(th.dispOnlineMin) && th.dispOnlineMin > 0 ? th.dispOnlineMin : 65) * 60000;
  const IDLE_HOUR = (Number.isFinite(th.dispIdleHour) && th.dispIdleHour >= 0 && th.dispIdleHour <= 23) ? th.dispIdleHour : 12;
  const IDLE_KM = (Number.isFinite(th.dispIdleKm) && th.dispIdleKm > 0) ? th.dispIdleKm : 1;
  const available = [];
  for (const imei of imeis) {
    const live = livePositions.get(imei); if (!live || !live.timestamp) continue;
    const online = (now - new Date(live.timestamp).getTime()) < ONLINE_MS;
    const stopped = (live.speed || 0) <= 3;
    if (online && stopped) available.push({ imei, name: labelOf(live, imei) });
  }
  if (available.length) {
    const n = available.length;
    const names = available.slice(0, 8).map(a => a.name).join(', ') + (n > 8 ? ' …' : '');
    const noun = n === 1 ? 'vehicul disponibil' : 'vehicule disponibile'; // acord gramatical corect (1 vehicul / N vehicule)
    findings.push({ imei: null, severity: 'info', agent: 'dispatch', fkey: 'disp_available', title: n + ' ' + noun + ' acum pentru curse', body: 'Online și staționate: ' + names + '.' });
  }
  // Subutilizate (după-amiaza): disponibile dar fără rulaj azi → candidate pentru o cursă nouă
  if (new Date().getHours() >= IDLE_HOUR) {
    for (const a of available) {
      const pts = await ctx.hist(a.imei);
      let km = 0;
      for (let i = 1; i < pts.length; i++) { const d = haversineKm(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude); if (d < 10) km += d; }
      if (km < IDLE_KM) findings.push({ imei: a.imei, severity: 'info', agent: 'dispatch', fkey: 'disp_idle_' + a.imei, title: a.name + ': nefolosit azi — disponibil', body: 'Sub ' + IDLE_KM + ' km parcurși azi și staționat acum. Candidat bun pentru o cursă nouă.' });
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
