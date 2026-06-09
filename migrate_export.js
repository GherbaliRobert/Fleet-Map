// ─── Export date din PGlite (DigitalOcean) → migration_dump.json ───
// PGlite e single-process: OPREȘTE serverul înainte de export, apoi repornește-l.
//   systemctl stop fleetmap && node migrate_export.js && systemctl start fleetmap
// Implicit NU exportă istoricul de poziții (poate fi uriaș). Ca să-l incluzi:
//   MIGRATE_POSITIONS=1 node migrate_export.js
// (rulează FĂRĂ DATABASE_URL setat → modul PGlite)
const fs = require('fs');
const path = require('path');

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL e setat → ar citi din Postgres, nu din PGlite. Rulează exportul FĂRĂ DATABASE_URL.');
  process.exit(1);
}
const db = require('./db');

// ordine cu părinții înaintea copiilor (contează la import)
const TABLES = [
  'companies', 'device_groups', 'drivers', 'users', 'devices',
  'geofences', 'alerts', 'alert_history', 'trips', 'maintenance',
  'user_device_access', 'user_group_access', 'api_keys',
  'notifications', 'notification_prefs', 'push_subscriptions',
  'audit_log', 'report_schedules', 'tacho_files', 'etransport',
  'settings', 'agent_findings'
];
if (process.env.MIGRATE_POSITIONS === '1') TABLES.push('positions');

function bigintSafe(_k, v) { return typeof v === 'bigint' ? v.toString() : v; }

(async () => {
  const out = { exportedAt: new Date().toISOString(), source: 'pglite', tables: {} };
  const existing = new Set();
  try {
    const r = await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    r.rows.forEach(x => existing.add(x.table_name));
  } catch (e) { console.error('Nu pot citi schema:', e.message); process.exit(1); }

  let total = 0;
  for (const t of TABLES) {
    if (!existing.has(t)) { console.log(`- ${t}: lipsește (skip)`); continue; }
    try {
      const r = await db.pool.query(`SELECT * FROM ${t}`);
      out.tables[t] = r.rows;
      total += r.rows.length;
      console.log(`- ${t}: ${r.rows.length} rânduri`);
    } catch (e) { console.error(`! ${t}: ${e.message}`); out.tables[t] = []; }
  }
  const file = path.join(process.cwd(), 'migration_dump.json');
  fs.writeFileSync(file, JSON.stringify(out, bigintSafe));
  console.log(`\nOK: ${total} rânduri → ${file}`);
  console.log(process.env.MIGRATE_POSITIONS === '1'
    ? '(inclusiv positions)'
    : '(FĂRĂ positions — rulează cu MIGRATE_POSITIONS=1 ca să le incluzi)');
  try { await db.closeDb(); } catch (e) {}
  process.exit(0);
})();
