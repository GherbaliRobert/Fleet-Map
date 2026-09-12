// restore-positions.js — pune la loc pozițiile GPS din arhiva de pe S3 (fișierele urcate de backup.js).
//
// Utilizare:
//   DATABASE_URL=postgres://...  [BACKUP_PASSPHRASE=...]  node restore-positions.js <fișier sau dosar> [...]
//     Acceptă fișierele pe ore (positions/2026-09-12/03.ndjson.gz[.enc]) și pe cele vechi, pe zi
//     (positions/2026-09-12.ndjson.gz[.enc]). Un dosar e parcurs cu totul, în ordinea numelor.
//     Rulat de două ori pe aceleași fișiere nu dublează nimic (ON CONFLICT pe imei + timestamp).
//
// Verificat cap-coadă de verify_restaurare.js: arhivare reală → „S3" fals → punere la loc într-o bază goală.

const fs = require('fs');
const path = require('path');
const db = require('./db');
const backup = require('./backup');

function fisiere(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  return fs.readdirSync(p).sort().flatMap(function (f) { return fisiere(path.join(p, f)); });
}

(async function () {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Utilizare: node restore-positions.js <fișier sau dosar> [...]'); process.exit(1); }
  if (!process.env.DATABASE_URL) console.warn('[poziții] ATENȚIE: DATABASE_URL nesetat → rulează pe baza locală (PGlite).');
  const lista = args.flatMap(fisiere).filter(function (f) { return /\.ndjson\.gz(\.enc)?$/.test(f); });
  if (!lista.length) { console.error('[poziții] niciun fișier .ndjson.gz[.enc] găsit'); process.exit(1); }

  await db.initDb();
  let rows = 0, inserted = 0, erori = 0;
  for (const f of lista) {
    try {
      const r = await backup.importPositionsBuffer(db, fs.readFileSync(f), process.env.BACKUP_PASSPHRASE || null);
      rows += r.rows; inserted += r.inserted;
      console.log('  ' + path.basename(path.dirname(f)) + '/' + path.basename(f) + ': ' + r.rows + ' rânduri, ' + r.inserted + ' puse la loc');
    } catch (e) {
      erori++;
      console.error('  ' + f + ': EȘUAT — ' + e.message);
    }
  }
  console.log('[poziții] GATA: ' + lista.length + ' fișiere · ' + rows + ' rânduri · ' + inserted + ' puse la loc · ' + erori + ' fișiere cu erori.');
  process.exit(erori ? 2 : 0);
})().catch(function (e) { console.error('[poziții] EȘUAT:', e.message); process.exit(1); });
