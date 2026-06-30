// restore-backup.js — restaurează un backup făcut de backup.js (break-glass / disaster recovery).
//
// Utilizare:
//   DATABASE_URL=postgres://...  [BACKUP_PASSPHRASE=...]  node restore-backup.js <fișier> [--wipe]
//     <fișier>  = dump-*.json.gz  sau  dump-*.json.gz.enc  (descărcat din S3 sau prin /api/admin/backup/download)
//     --wipe    = golește fiecare tabel ÎNAINTE de inserare (restaurare „curată"). FĂRĂ --wipe = upsert idempotent (ON CONFLICT DO NOTHING).
//
// Inserează în ordinea dependențelor (companies întâi), apoi resetează secvențele id. Telemetria (positions) NU e în backup.

const fs = require('fs');
const db = require('./db');
const backup = require('./backup');

(async function () {
  const file = process.argv[2];
  if (!file) { console.error('Utilizare: node restore-backup.js <fișier> [--wipe]'); process.exit(1); }
  const wipe = process.argv.indexOf('--wipe') >= 0;
  if (!process.env.DATABASE_URL) console.warn('[restore] ATENȚIE: DATABASE_URL nesetat → rulează pe baza locală (PGlite).');

  const buf = fs.readFileSync(file);
  const dump = backup.deserialize(buf, process.env.BACKUP_PASSPHRASE || null);
  console.log('[restore] backup din ' + (dump._meta && dump._meta.at) + ' (mode ' + (dump._meta && dump._meta.mode) + ', versiune ' + (dump._meta && dump._meta.version) + ')');
  if (wipe) console.log('[restore] MOD --wipe: golesc tabelele înainte de inserare.');

  await db.initDb();
  let totIns = 0, totSkip = 0, totErr = 0;
  for (const t of backup.BUSINESS_TABLES) {
    const rows = (dump.data && dump.data[t]) || [];
    if (!rows.length) continue;
    if (wipe) { try { await db.pool.query('DELETE FROM ' + t); } catch (e) { console.warn('  [' + t + '] wipe eșuat: ' + e.message.slice(0, 100)); } }
    let ins = 0, skip = 0, err = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(function (c) { const v = row[c]; return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v; });
      const ph = cols.map(function (_, i) { return '$' + (i + 1); }).join(',');
      const sql = 'INSERT INTO ' + t + ' (' + cols.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + ph + ') ON CONFLICT DO NOTHING';
      try { const r = await db.pool.query(sql, vals); if (r.rowCount > 0) ins++; else skip++; } catch (e) { err++; if (err <= 3) console.warn('  [' + t + '] rând eșuat: ' + e.message.slice(0, 120)); }
    }
    console.log('  ' + t + ': +' + ins + ' inserate · ' + skip + ' existau · ' + err + ' erori  (din ' + rows.length + ')');
    totIns += ins; totSkip += skip; totErr += err;
  }
  // Resetează secvențele id (postgres) ca să nu coliziune la următorul INSERT
  for (const t of backup.BUSINESS_TABLES) {
    try { await db.pool.query("SELECT setval(pg_get_serial_sequence('" + t + "','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM " + t + "), 1))"); } catch (e) { /* tabel fără id serial / PGlite */ }
  }
  console.log('[restore] GATA: ' + totIns + ' inserate · ' + totSkip + ' existau deja · ' + totErr + ' erori.');
  process.exit(totErr > 0 ? 2 : 0);
})().catch(function (e) { console.error('[restore] EȘUAT:', e.message); process.exit(1); });
