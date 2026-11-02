// verify_index_pozitii.js — un singur index pe (imei, timestamp) la poziții (Robert, 02.11: „acum").
//
//   node verify_index_pozitii.js
//
// Două indexuri țineau aceleași rânduri: cel UNIQUE (imei, timestamp), care oprește dublurile la o retrimitere,
// și cel vechi (imei, timestamp DESC). Un index se citește în ambele sensuri, deci ajunge unul. Capcana: „ultima
// poziție pe mașină" se cerea `ORDER BY imei, timestamp DESC` (sensuri amestecate), pe care indexul UNIQUE nu-l
// poate da — fără cel vechi, baza ar fi citit și ar fi sortat toate pozițiile, chiar la pornirea serverului. De aceea
// s-a schimbat și cererea: `ORDER BY imei DESC, timestamp DESC`.
//
// Proba pune cererile pe aceeași bază (PGlite: același planificator ca PostgreSQL), o dată cu forma veche și o dată
// cu cea nouă: aceleași rânduri, fără sortare, și pornește db.js ca să vadă că indexul vechi chiar pleacă.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const fara = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const dbSrc = fara(fs.readFileSync('./db.js', 'utf8'));
const repSrc = fara(fs.readFileSync('./reports.js', 'utf8'));
const srvSrc = fara(fs.readFileSync('./server.js', 'utf8'));

(async () => {
  sect('1. În cod: o singură formă a cererii, iar indexul vechi doar ca rezervă');
  for (const [nume, s] of [['db.js', dbSrc], ['reports.js', repSrc], ['server.js', srvSrc]]) {
    T(nume + ': nicio cerere pe positions cu sensuri amestecate (imei, timestamp DESC)', !/ORDER BY (?:\w+\.)?imei(?: ASC)?, (?:\w+\.)?timestamp DESC/.test(s));
  }
  const iDrop = dbSrc.indexOf('DROP INDEX IF EXISTS idx_positions_imei_ts');
  const iUniq = dbSrc.indexOf('idx_positions_imei_ts_uniq');
  T('indexul vechi se scoate după ce s-a încercat cel UNIQUE', iUniq > 0 && iDrop > iUniq);
  T('se face doar dacă lipsește cel UNIQUE (o singură dată în cod)', (dbSrc.match(/CREATE INDEX IF NOT EXISTS idx_positions_imei_ts\b/g) || []).length === 1
    && /else \{\s*await client\.query\('CREATE INDEX IF NOT EXISTS idx_positions_imei_ts\b/.test(dbSrc));
  T('scoaterea nu blochează pornirea: așteaptă cel mult câteva secunde', /SET LOCAL lock_timeout = '3s'/.test(dbSrc));

  sect('2. Pe aceeași bază: forma veche cu două indexuri, forma nouă cu unul');
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE positions (id BIGSERIAL, imei VARCHAR(20), timestamp TIMESTAMP NOT NULL, speed INT, io_data JSONB)`);
  await pg.exec(`CREATE UNIQUE INDEX idx_positions_imei_ts_uniq ON positions (imei, timestamp)`);
  await pg.exec(`CREATE INDEX idx_positions_imei_ts ON positions (imei, timestamp DESC)`);
  await pg.exec(`INSERT INTO positions (imei, timestamp, speed, io_data)
    SELECT lpad((i % 40)::text, 15, '0'), TIMESTAMP '2026-10-01' + (i || ' seconds')::interval, i % 90,
           jsonb_build_object('total_odometer', i)
    FROM generate_series(1, 60000) AS i`);
  await pg.exec('ANALYZE positions');

  const VECHE = `SELECT DISTINCT ON (imei) imei, timestamp, speed, io_data FROM positions WHERE timestamp > TIMESTAMP '2026-09-01' ORDER BY imei, timestamp DESC`;
  const NOUA = `SELECT DISTINCT ON (imei) imei, timestamp, speed, io_data FROM positions WHERE timestamp > TIMESTAMP '2026-09-01' ORDER BY imei DESC, timestamp DESC`;
  const peMasina = (rows) => JSON.stringify(rows.map((r) => [r.imei, String(r.timestamp), r.speed]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const t0 = Date.now(); const a = (await pg.query(VECHE)).rows; const tVeche = Date.now() - t0;
  const plan = async (q) => (await pg.query('EXPLAIN ' + q)).rows.map((r) => r['QUERY PLAN']).join('\n');

  await pg.exec('DROP INDEX idx_positions_imei_ts');
  const t1 = Date.now(); const b = (await pg.query(NOUA)).rows; const tNoua = Date.now() - t1;
  T('aceeași ultimă poziție pe fiecare din cele 40 de mașini', a.length === 40 && b.length === 40 && peMasina(a) === peMasina(b));
  const pNoua = await plan(NOUA);
  T('forma nouă citește indexul invers, fără sortare', /Index Scan Backward using idx_positions_imei_ts_uniq/.test(pNoua) && !/Sort/.test(pNoua), pNoua);
  const pMasina = await plan(`SELECT timestamp FROM positions WHERE imei = '000000000000007' ORDER BY timestamp DESC LIMIT 1`);
  T('ultima poziție a unei mașini: tot din el, fără sortare', /Index .*Scan Backward using idx_positions_imei_ts_uniq/.test(pMasina) && !/Sort/.test(pMasina), pMasina);
  const pAny = await plan(`SELECT DISTINCT ON (imei) imei, io_data FROM positions WHERE imei = ANY(ARRAY['000000000000001','000000000000002']) ORDER BY imei DESC, timestamp DESC`);
  T('raportul „Scadențe” (mai multe mașini): tot din el', /idx_positions_imei_ts_uniq/.test(pAny), pAny);
  const pVecheFara = await plan(VECHE);
  T('martor: forma veche, fără indexul vechi, ar fi sortat tot', /Sort/.test(pVecheFara), pVecheFara);
  await pg.close();
  console.log('  (timpi pe 60.000 de poziții: veche ' + tVeche + ' ms, nouă ' + tNoua + ' ms)');

  sect('3. Pe o bază adevărată: pornirea lui db.js scoate indexul vechi');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-idx-'));
  const cod = `
    const db = require(${JSON.stringify(path.resolve('./db.js'))});
    (async () => {
      await db.initDb();
      const r = await db.pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'positions'");
      console.log('INDEXURI=' + r.rows.map((x) => x.indexname).sort().join(','));
      process.exit(0);
    })().catch((e) => { console.log('EROARE=' + e.message); process.exit(1); });`;
  const env = { ...process.env, PGLITE_DIR: path.join(dir, 'pgdata'), SESSION_SECRET: 'ci_idx' };
  delete env.DATABASE_URL;
  const faza = (n) => {
    const r = spawnSync(process.execPath, ['-e', cod], { env, encoding: 'utf8', timeout: 180000 });
    const m = /INDEXURI=(.*)/.exec(r.stdout || '');
    T('pornirea ' + n + ' a mers până la capăt', r.status === 0 && !!m, (r.stdout || '').slice(-300) + (r.stderr || '').slice(-300));
    return m ? m[1].split(',') : [];
  };
  const prima = faza('întâi');
  T('are cel UNIQUE', prima.includes('idx_positions_imei_ts_uniq'), prima.join(','));
  T('nu are cel vechi', !prima.includes('idx_positions_imei_ts'), prima.join(','));
  const aDoua = faza('a doua');
  T('nici la a doua pornire nu se întoarce', aDoua.includes('idx_positions_imei_ts_uniq') && !aDoua.includes('idx_positions_imei_ts'), aDoua.join(','));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

  console.log('\n' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
