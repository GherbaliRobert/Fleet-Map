// restore-backup.js — restaurează un backup făcut de backup.js (break-glass / disaster recovery).
//
// Utilizare:
//   DATABASE_URL=postgres://...  [BACKUP_PASSPHRASE=...]  node restore-backup.js <fișier> [--wipe]
//     <fișier>  = dump-*.ndjson.gz[.enc] (formatul de acum) sau dump-*.json.gz[.enc] (cel vechi) — din S3 sau prin /api/admin/backup/download
//     --wipe    = golește tabelele din backup ÎNAINTE de inserare (restaurare „curată"). FĂRĂ --wipe = upsert idempotent (ON CONFLICT DO NOTHING).
//
// Ordinea tabelelor o dau cheile străine din bază (vezi backup.restoreOrder), apoi se resetează secvențele id.
// Telemetria (positions) NU e în acest backup: are arhiva ei pe S3, pe zile.
// Verificat cap-coadă de verify_restaurare.js (bază goală, copie criptată și necriptată, cu și fără --wipe).

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
  if (wipe) console.log('[restore] MOD --wipe: golesc tabelele din backup înainte de inserare.');

  await db.initDb();
  const r = await backup.restoreDump(db, dump, { wipe: wipe, log: function (l) { console.log(l); } });
  console.log('[restore] ordinea: ' + r.order.join(' → '));
  console.log('[restore] GATA: ' + r.inserted + ' inserate · ' + r.skipped + ' existau deja · ' + r.errors + ' erori.');
  process.exit(r.errors > 0 ? 2 : 0);
})().catch(function (e) { console.error('[restore] EȘUAT:', e.message); process.exit(1); });
