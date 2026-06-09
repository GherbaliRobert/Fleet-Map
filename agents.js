// agents.js — cadru de agenți AI pentru RA Tracks.
// v1: RA Watch (monitorizare 24/7) — detectează anomalii prin euristici, prioritizate opțional cu AI.
// Extensibil: adaugă agenți noi în AGENTS (dispatch, care, client, optimize, compliance).

const SPEED_LIMIT = 90;        // km/h
const IDLE_MIN_MINUTES = 120;  // ralanti prelungit
const FUEL_DROP_L = 15;        // scădere suspectă combustibil
const OFFLINE_MIN = 30;        // minute fără poziție = offline

function io(p) { return p && p.io_data ? p.io_data : {}; }
function fuelL(p) { const i = io(p); const v = (typeof i.fuel_level_liters === 'number') ? i.fuel_level_liters : i.can_fuel_level_liters; return (typeof v === 'number' && v > 0) ? v : null; }

// ─── RA Watch ───
async function raWatch(ctx) {
  const { db, imeis, livePositions, ai } = ctx;
  const findings = [];
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  for (const imei of imeis) {
    const live = livePositions.get(imei);
    const name = (live && (live.name || live.plate)) || imei;

    // 1) Offline neașteptat (a fost activ azi, dar nu mai trimite)
    if (live && live.timestamp) {
      const ageMin = (now - new Date(live.timestamp).getTime()) / 60000;
      if (ageMin > OFFLINE_MIN && ageMin < 24 * 60) {
        findings.push({ imei, severity: 'warning', agent: 'watch', fkey: 'offline_' + imei, title: name + ': offline de ' + Math.round(ageMin) + ' min', body: 'Vehiculul nu mai trimite poziții. Verifică dispozitivul/alimentarea.' });
      }
    }

    let pts = [];
    try { pts = await db.getDeviceHistory(imei, todayStart.toISOString(), new Date().toISOString()); } catch (e) { continue; }
    if (!pts.length) continue;

    // 2) Depășiri de viteză (azi)
    let over = 0, wasOver = false;
    for (const p of pts) { const o = (p.speed || 0) > SPEED_LIMIT; if (o && !wasOver) over++; wasOver = o; }
    if (over >= 3) findings.push({ imei, severity: 'warning', agent: 'watch', fkey: 'speed_' + imei, title: name + ': ' + over + ' depășiri de viteză azi', body: 'Peste ' + SPEED_LIMIT + ' km/h. Recomandare: avertizează șoferul.' });

    // 3) Ralanti prelungit
    let idleStart = null, idleMaxMin = 0;
    for (const p of pts) {
      const idling = io(p).ignition === 1 && (p.speed || 0) <= 3;
      if (idling) { const t = new Date(p.timestamp).getTime(); if (!idleStart) idleStart = t; idleMaxMin = Math.max(idleMaxMin, (t - idleStart) / 60000); }
      else idleStart = null;
    }
    if (idleMaxMin >= IDLE_MIN_MINUTES) findings.push({ imei, severity: 'info', agent: 'watch', fkey: 'idle_' + imei, title: name + ': ralanti ~' + Math.round(idleMaxMin / 60) + 'h azi', body: 'Motor pornit, staționat îndelung — combustibil irosit.' });

    // 4) Scădere suspectă de combustibil
    let prevFuel = null, drop = 0;
    for (const p of pts) { const fl = fuelL(p); if (fl != null) { if (prevFuel != null && (prevFuel - fl) >= FUEL_DROP_L) drop = Math.max(drop, prevFuel - fl); prevFuel = fl; } }
    if (drop) findings.push({ imei, severity: 'critical', agent: 'watch', fkey: 'fuel_' + imei, title: name + ': scădere combustibil ~' + Math.round(drop) + ' L', body: 'Posibil furt sau scurgere. Verifică traseul și opririle.' });
  }

  // Îmbunătățire AI: prioritizează + rezumă (opțional, doar dacă e configurată cheia)
  let aiSummary = null;
  if (ai && ai.aiEnabled() && findings.length) {
    try {
      const system = 'Ești RA Watch, agentul de monitorizare 24/7 al unei flote de transport. Primești o listă de probleme detectate automat. Scrie un rezumat scurt (2-4 propoziții), în limba română, care prioritizează ce e urgent (furt combustibil, offline) și recomandă acțiuni concrete. Fără introduceri lungi.';
      aiSummary = await ai.callClaude({ system, messages: [{ role: 'user', content: 'Probleme detectate azi:\n' + JSON.stringify(findings.map(f => ({ sev: f.severity, t: f.title }))) }], maxTokens: 320 });
    } catch (e) { /* AI opțional */ }
  }
  return { findings, aiSummary };
}

const AGENTS = {
  watch: { name: 'RA Watch', desc: 'Monitorizare 24/7 — detectează anomalii (furt combustibil, depășiri, ralanti, offline) și recomandă acțiuni.', run: raWatch }
};

async function runAgent(key, ctx) {
  const a = AGENTS[key];
  if (!a) throw new Error('Agent necunoscut: ' + key);
  return a.run(ctx);
}

module.exports = { AGENTS, runAgent };
