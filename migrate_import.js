// ─── Import migration_dump.json → PostgreSQL (Railway) ───
// Rulează LOCAL, cu DATABASE_URL spre Postgres-ul Railway (URL-ul PUBLIC, cu SSL):
//   DATABASE_URL="postgres://...rlwy.net.../railway" node migrate_import.js migration_dump.json
// ATENȚIE: GOLEȘTE (TRUNCATE) tabelele țintă înainte de import → DigitalOcean devine sursa de adevăr.
const fs = require('fs');

if (!process.env.DATABASE_URL) {
  console.error('Setează DATABASE_URL spre Postgres-ul Railway (URL public, cu SSL).');
  process.exit(1);
}
const db = require('./db');

// ordine FK-safe: părinții înaintea copiilor
const ORDER = [
  'companies', 'device_groups', 'drivers', 'users', 'devices',
  'geofences', 'alerts', 'alert_history', 'trips', 'maintenance',
  'user_device_access', 'user_group_access', 'api_keys',
  'notifications', 'notification_prefs', 'push_subscriptions',
  'audit_log', 'report_schedules', 'tacho_files', 'etransport',
  'settings', 'agent_findings', 'positions'
];

(async () => {
  const file = process.argv[2] || 'migration_dump.json';
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Import din ${file} (export: ${dump.exportedAt || '?'})`);

  await db.initDb();
  console.log('Schema asigurată pe Postgres.');

  // coloanele + tipurile țintei (pentru filtrare + serializare jsonb)
  const tcols = {};   // tabel → Set(coloane)
  const tjson = {};   // tabel → Set(coloane json/jsonb)
  const targetTables = new Set();
  const ti = await db.pool.query(
    "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public'"
  );
  for (const row of ti.rows) {
    targetTables.add(row.table_name);
    (tcols[row.table_name] = tcols[row.table_name] || new Set()).add(row.column_name);
    if (row.data_type === 'jsonb' || row.data_type === 'json') {
      (tjson[row.table_name] = tjson[row.table_name] || new Set()).add(row.column_name);
    }
  }

  // golește doar tabelele din dump care există în țintă
  const toTruncate = ORDER.filter(t => dump.tables[t] && targetTables.has(t));
  if (toTruncate.length) {
    await db.pool.query(`TRUNCATE TABLE ${toTruncate.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('Golit:', toTruncate.join(', '));
  }

  let grand = 0;
  for (const t of ORDER) {
    const rows = dump.tables[t];
    if (!rows || !rows.length) continue;
    if (!targetTables.has(t)) { console.log(`- ${t}: nu există în țintă (skip)`); continue; }
    const cols = Object.keys(rows[0]).filter(c => tcols[t].has(c));
    if (!cols.length) { console.log(`- ${t}: fără coloane comune (skip)`); continue; }
    const jsonCols = tjson[t] || new Set();
    const BATCH = 200;
    let n = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const params = [];
      const valuesSql = slice.map((row, ri) => {
        const ph = cols.map((c, ci) => `$${ri * cols.length + ci + 1}`);
        cols.forEach(c => {
          let v = row[c];
          if (v === undefined) v = null;
          if (v !== null && jsonCols.has(c) && typeof v !== 'string') v = JSON.stringify(v);
          params.push(v);
        });
        return `(${ph.join(',')})`;
      }).join(',');
      const sql = `INSERT INTO ${t} (${cols.map(c => `"${c}"`).join(',')}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`;
      const r = await db.pool.query(sql, params);
      n += (r.rowCount != null ? r.rowCount : slice.length);
    }
    grand += n;
    console.log(`- ${t}: ${n} rânduri`);

    // resetează secvența id (dacă tabelul are una) ca inserările noi să nu se ciocnească
    if (tcols[t].has('id')) {
      try {
        const sr = await db.pool.query("SELECT pg_get_serial_sequence($1,'id') AS seq", [t]);
        const seq = sr.rows[0] && sr.rows[0].seq;
        if (seq) {
          await db.pool.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}),1), true)`, [seq]);
        }
      } catch (e) { /* fără secvență — ok */ }
    }
  }
  console.log(`\nOK: ${grand} rânduri importate în PostgreSQL.`);
  try { await db.closeDb(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('EROARE import:', e.message); process.exit(1); });
