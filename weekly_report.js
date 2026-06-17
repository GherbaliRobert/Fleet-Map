// weekly_report.js — Raport săptămânal de activitate a flotei, per companie.
// Generat automat lunea (perioada = ultima săptămână completă Luni→Luni), analizat cu AI (Claude),
// stocat în DB (weekly_reports) și trimis pe email adminilor companiei (cu link la raportul complet din aplicație).
// Reutilizează reports.fuelStats (consum robust + estimare) și reports.segmentTrack (curse/opriri/timp).

const reports = require('./reports');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function dayKey(ts) { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return null; } }
function roDay(k) { var mo = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec']; var p = String(k).split('-'); return p.length === 3 ? (parseInt(p[2]) + ' ' + (mo[parseInt(p[1]) - 1] || '')) : k; }
function pick(v) { return { imei: v.imei, name: v.name, plate: v.plate, km: v.km, idleH: v.idleH, liters: v.liters, per100: v.per100, movingH: v.movingH }; }

// Perioada „ultima săptămână completă": Luni 00:00 UTC trecut → Luni 00:00 UTC curent.
function lastCompletedWeek(now) {
  const d = new Date(now);
  const day = d.getUTCDay();                 // 0=Dum .. 6=Sâm
  const offsetToMon = (day === 0 ? 6 : day - 1);
  const thisMon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offsetToMon));
  const lastMon = new Date(thisMon.getTime() - 7 * 864e5);
  return { from: lastMon.toISOString(), to: thisMon.toISOString() };
}

// ─── Agregare date flotă pentru perioada dată ───
async function buildWeeklyData(deps, companyId, imeis, from, to) {
  const { db } = deps;
  const fuel = await reports.fuelStats(db, imeis, from, to, {}); // km, consum (cu estimare), idle, per-vehicul, kpi, serie zilnică consum
  const fBy = {}; (fuel.perVehicle || []).forEach(v => { fBy[v.imei] = v; });

  const perVehicle = [];
  const dailyKm = {}, dailyMovingH = {};
  for (const imei of imeis) {
    let pts = [];
    try { pts = await db.getDeviceHistory(imei, from, to); } catch (e) { pts = []; }
    const seg = reports.segmentTrack(pts || [], 180); // opriri ≥ 3 min
    let km = 0, movingSec = 0, maxSpeed = 0;
    seg.trips.forEach(t => {
      km += t.distanceKm; movingSec += t.durationSec; if (t.maxSpeed > maxSpeed) maxSpeed = t.maxSpeed;
      const dk = dayKey(t.start); if (dk) { dailyKm[dk] = (dailyKm[dk] || 0) + t.distanceKm; dailyMovingH[dk] = (dailyMovingH[dk] || 0) + t.durationSec / 3600; }
    });
    let stoppedSec = 0; seg.stops.forEach(s => { stoppedSec += s.durationSec; });
    const fv = fBy[imei] || {};
    perVehicle.push({
      imei, name: fv.name || imei, plate: fv.plate || '',
      km: Math.round(fv.km != null ? fv.km : km),
      movingH: +(movingSec / 3600).toFixed(1),
      stoppedH: +(stoppedSec / 3600).toFixed(1),
      idleH: +(((fv.idleSec || 0) / 3600)).toFixed(1),
      trips: seg.trips.length,
      maxSpeed: Math.round(maxSpeed),
      liters: fv.liters || 0, per100: (fv.per100 != null ? fv.per100 : null), cost: fv.cost || 0, co2Kg: fv.co2Kg || 0,
      estimated: !!fv.estimated, hasFuel: !!fv.hasFuel
    });
  }

  const sum = (k) => perVehicle.reduce((a, v) => a + (Number(v[k]) || 0), 0);
  const active = perVehicle.filter(v => v.km > 0.5).length;
  const kpi = {
    totalKm: Math.round(sum('km')),
    totalMovingH: +sum('movingH').toFixed(1),
    totalStoppedH: +sum('stoppedH').toFixed(1),
    totalIdleH: +sum('idleH').toFixed(1),
    totalTrips: sum('trips'),
    totalFuel: fuel.kpi.totalLiters, fuelCost: fuel.kpi.fuelCost, co2Tons: fuel.kpi.co2Tons,
    avgPer100: fuel.kpi.avgPer100, idleCost: fuel.kpi.idleCost, idleLiters: fuel.kpi.idleLiters,
    vehiclesTotal: imeis.length, vehiclesActive: active, vehiclesInactive: imeis.length - active,
    vehiclesEstimated: fuel.kpi.vehiclesEstimated, vehiclesWithFuelSensor: fuel.kpi.vehiclesWithData
  };

  const days = Object.keys(dailyKm).concat(Object.keys(dailyMovingH)).filter((v, i, a) => a.indexOf(v) === i).sort();
  const series = {
    labels: days.map(roDay),
    km: days.map(d => Math.round(dailyKm[d] || 0)),
    movingH: days.map(d => +((dailyMovingH[d] || 0).toFixed(1))),
    fuelLabels: (fuel.series.labels || []).map(roDay),
    fuelConsumed: fuel.series.consumed || []
  };

  const rankings = {
    topKm: perVehicle.slice().sort((a, b) => b.km - a.km).slice(0, 7).map(pick),
    topIdle: perVehicle.slice().sort((a, b) => b.idleH - a.idleH).slice(0, 7).map(pick),
    topConsum: perVehicle.filter(v => v.liters > 0).sort((a, b) => b.liters - a.liters).slice(0, 7).map(pick),
    inactive: perVehicle.filter(v => v.km <= 0.5).map(pick)
  };

  return { kpi, perVehicle, series, rankings };
}

// ─── Analiză AI (Claude) — degradează grațios la un rezumat pe reguli dacă nu există cheie ───
async function aiAnalyze(deps, companyName, period, data) {
  const { ai } = deps;
  if (!ai || !ai.hasKey || !ai.hasKey()) return null;
  const k = data.kpi, r = data.rankings;
  const compact = {
    companie: companyName, perioada: period.from.slice(0, 10) + ' … ' + period.to.slice(0, 10),
    flota: { vehicule: k.vehiclesTotal, active: k.vehiclesActive, inactive: k.vehiclesInactive, cu_senzor_combustibil: k.vehiclesWithFuelSensor, consum_estimat_la: k.vehiclesEstimated },
    km_total: k.totalKm, ore_mers: k.totalMovingH, ore_stationat: k.totalStoppedH, ore_ralanti: k.totalIdleH, curse: k.totalTrips,
    consum_litri: k.totalFuel, cost_combustibil_ron: k.fuelCost, consum_mediu_l_100km: k.avgPer100, cost_ralanti_ron: k.idleCost, co2_tone: k.co2Tons,
    top_km: r.topKm.slice(0, 5).map(v => ({ nume: v.name, km: v.km })),
    top_ralanti_ore: r.topIdle.slice(0, 5).map(v => ({ nume: v.name, ore: v.idleH })),
    top_consum: r.topConsum.slice(0, 5).map(v => ({ nume: v.name, litri: v.liters, l_100km: v.per100 })),
    vehicule_inactive: r.inactive.map(v => v.name)
  };
  const system =
    'Ești analist de flotă auto pentru o firmă din România. Primești statisticile săptămânale ale unei flote GPS. ' +
    'Scrie o analiză CONCISĂ și utilă în limba română (140–230 cuvinte), structurată cu exact aceste subtitluri pe linii separate: ' +
    '„Pe scurt:", „Observații:", „Recomandări:". La „Observații" și „Recomandări" folosește 2–4 puncte fiecare (linii care încep cu „- "). ' +
    'Evidențiază: gradul de utilizare (active vs inactive), risipa la ralanti (ore + cost), consumul (precizează dacă e estimat), și vehiculele extreme. ' +
    'Ton profesional și direct. Folosește DOAR cifrele primite, nu inventa date. Nu repeta tot JSON-ul, interpretează-l.';
  const user = 'Statistici flotă (JSON):\n' + JSON.stringify(compact);
  try {
    return await ai.callClaude({ system, messages: [{ role: 'user', content: user }], maxTokens: 700, onUsage: deps.onAiUsage });
  } catch (e) {
    return null;
  }
}

function fallbackSummary(data) {
  const k = data.kpi, lines = [];
  lines.push('Pe scurt:');
  lines.push(k.vehiclesActive + '/' + k.vehiclesTotal + ' vehicule active, ' + k.totalKm + ' km parcurși, ' + k.totalMovingH + ' h de mers, ' + k.totalStoppedH + ' h staționate și ' + k.totalIdleH + ' h la ralanti.');
  lines.push('');
  lines.push('Observații:');
  if (k.totalFuel) lines.push('- Consum total ' + k.totalFuel + ' L (' + k.fuelCost + ' RON), medie ' + k.avgPer100 + ' L/100km.');
  if (k.idleCost) lines.push('- Costul ralanti-ului: ~' + k.idleCost + ' RON (' + k.totalIdleH + ' h).');
  if (k.vehiclesInactive) lines.push('- ' + k.vehiclesInactive + ' vehicule fără activitate săptămâna aceasta.');
  if (data.rankings.topKm[0]) lines.push('- Cel mai rulat: „' + data.rankings.topKm[0].name + '" (' + data.rankings.topKm[0].km + ' km).');
  lines.push('');
  lines.push('Recomandări:');
  if (data.rankings.topIdle[0] && data.rankings.topIdle[0].idleH >= 3) lines.push('- Verifică ralanti-ul ridicat la „' + data.rankings.topIdle[0].name + '" (' + data.rankings.topIdle[0].idleH + ' h).');
  if (k.vehiclesInactive) lines.push('- Verifică vehiculele inactive (posibil staționare planificată sau tracker fără semnal).');
  lines.push('- Activează asistentul AI pentru analiză și recomandări detaliate.');
  return lines.join('\n');
}

// ─── Generare pentru o companie + salvare ───
async function generateForCompany(deps, company, period) {
  const { db } = deps;
  const imeis = await db.getCompanyImeis(company.id);
  if (!imeis || !imeis.length) return null;
  const data = await buildWeeklyData(deps, company.id, imeis, period.from, period.to);
  let ai_analysis = await aiAnalyze(deps, company.name, period, data);
  if (!ai_analysis) ai_analysis = fallbackSummary(data);
  return db.saveWeeklyReport({ company_id: company.id, period_from: period.from, period_to: period.to, data, ai_analysis, emailed: false });
}

// ─── Email (HTML) către adminii companiei, cu link la raportul complet din aplicație ───
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function buildEmailHtml(company, saved, period, baseUrl) {
  const k = saved.data.kpi;
  const link = (baseUrl || '') + '/app#weekly-report';
  const kpiRow = (label, val) => '<tr><td style="padding:6px 10px;color:#555;">' + esc(label) + '</td><td style="padding:6px 10px;font-weight:700;text-align:right;">' + esc(val) + '</td></tr>';
  const aiHtml = esc(saved.ai_analysis || '').replace(/\n/g, '<br>');
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">' +
    '<h2 style="color:#0b8a4b;">Raport săptămânal flotă — ' + esc(company.name || '') + '</h2>' +
    '<p style="color:#555;">Perioada: <b>' + period.from.slice(0, 10) + '</b> … <b>' + period.to.slice(0, 10) + '</b></p>' +
    '<table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">' +
    kpiRow('Vehicule active', k.vehiclesActive + ' / ' + k.vehiclesTotal) +
    kpiRow('Distanță totală', k.totalKm + ' km') +
    kpiRow('Ore în mers', k.totalMovingH + ' h') +
    kpiRow('Ore staționate', k.totalStoppedH + ' h') +
    kpiRow('Ore ralanti', k.totalIdleH + ' h') +
    (k.totalFuel ? kpiRow('Consum total', k.totalFuel + ' L · ' + k.fuelCost + ' RON' + (k.vehiclesEstimated ? ' (parțial estimat)' : '')) : '') +
    '</table>' +
    '<h3 style="margin-top:22px;">Analiză automată</h3>' +
    '<div style="background:#f0fdf4;border-left:4px solid #0b8a4b;padding:10px 14px;border-radius:4px;line-height:1.5;">' + aiHtml + '</div>' +
    '<p style="margin-top:24px;"><a href="' + link + '" style="background:#0b8a4b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:700;">Vezi raportul complet cu grafice</a></p>' +
    '<p style="color:#9ca3af;font-size:12px;margin-top:20px;">RA Track — raport generat automat. Un administrator îl poate dezactiva din Setări.</p>' +
    '</div>';
}
function htmlToText(saved, company, period) {
  const k = saved.data.kpi;
  return 'Raport săptămânal flotă — ' + (company.name || '') + '\nPerioada: ' + period.from.slice(0, 10) + ' … ' + period.to.slice(0, 10) +
    '\n\nVehicule active: ' + k.vehiclesActive + '/' + k.vehiclesTotal + '\nDistanță: ' + k.totalKm + ' km\nOre mers: ' + k.totalMovingH +
    '\nOre ralanti: ' + k.totalIdleH + (k.totalFuel ? ('\nConsum: ' + k.totalFuel + ' L (' + k.fuelCost + ' RON)') : '') +
    '\n\n' + (saved.ai_analysis || '') + '\n\n— RA Track (raport automat)';
}
async function emailReport(deps, company, saved, period, settings) {
  const { db, channels } = deps;
  if (!channels || !channels.emailConfigured || !channels.emailConfigured()) return false;
  let recips = (settings && settings.weekly_report && Array.isArray(settings.weekly_report.recipients)) ? settings.weekly_report.recipients.slice() : [];
  recips = recips.map(x => String(x).trim()).filter(Boolean);
  if (!recips.length) { try { recips = await db.getCompanyAdminEmails(company.id); } catch (e) { recips = []; } }
  if (!recips.length) return false;
  const subject = '[RA Track] Raport săptămânal flotă — ' + period.from.slice(0, 10) + ' … ' + period.to.slice(0, 10);
  const html = buildEmailHtml(company, saved, period, deps.appBaseUrl);
  const text = htmlToText(saved, company, period);
  let sent = false;
  for (const r of recips) { try { const ok = await channels.sendEmailTo(r, subject, text, null, html); sent = sent || ok; } catch (e) {} }
  if (sent) { try { await db.markWeeklyReportEmailed(saved.id); } catch (e) {} }
  return sent;
}

// ─── Tick săptămânal: generează (catch-up) pentru fiecare companie cu funcția activă, dacă nu există deja ───
async function tickWeekly(deps, now) {
  now = now || new Date();
  const period = lastCompletedWeek(now);
  let companies = [];
  try { companies = await deps.db.getCompanies(); } catch (e) { return []; }
  const out = [];
  for (const co of companies) {
    try {
      let s = {};
      try { s = await deps.db.getCompanySettings(co.id) || {}; } catch (e) { s = {}; }
      if (s.weekly_report && s.weekly_report.enabled === false) continue;   // dezactivat de admin
      if (await deps.db.weeklyReportExists(co.id, period.from)) continue;    // deja generat
      const saved = await generateForCompany(deps, co, period);
      if (!saved) { out.push({ company: co.id, skipped: 'fără vehicule' }); continue; }
      const emailed = await emailReport(deps, co, saved, period, s);
      out.push({ company: co.id, ok: true, emailed });
    } catch (e) { out.push({ company: co.id, error: e.message }); }
  }
  return out;
}

module.exports = { lastCompletedWeek, buildWeeklyData, aiAnalyze, fallbackSummary, generateForCompany, emailReport, tickWeekly };
