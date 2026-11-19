// verify_coloane_ms.js — termenul linkului de parolă (și al accesului) se scrie în MILISECUNDE, pe orice bază.
//
//   node verify_coloane_ms.js
//
// 19.11, Alin, pe ratrack.ro, la „Aprobă” în Cereri demo: „Contul e activ, dar linkul de parolă NU a plecat pe email (date/time
// field value out of range: "1795691771321")”. Codul scrie `users.reset_expires` în milisecunde (BIGINT), dar baza de pe
// server o avea ca DATĂ — `ADD COLUMN IF NOT EXISTS … BIGINT` nu schimbă o coloană care există deja. Probele n-au văzut nimic:
// PGlite face singur dată dintr-un număr; Postgres-ul de pe server primește numărul ca text și îl refuză. Orice link de
// parolă pica (invitații, „Trimite link de parolă”, conturile demo).
//
// Proba face o bază VECHE (coloanele ca dată), arată că scrierea pică exact ca pe server (numărul trimis ca text, cum îl
// trimite biblioteca `pg`), apoi pornește db.js pe ea: coloanele devin BIGINT, valorile rămân aceleași clipe, linkul merge.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const fara = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const dbSrc = fara(fs.readFileSync('./db.js', 'utf8'));

const TERMEN = '2026-11-26T11:16:11.000Z', TERMEN_MS = Date.parse(TERMEN);
const ACCES = '2026-12-19T10:00:00.000Z', ACCES_MS = Date.parse(ACCES);

(async () => {
  sect('1. În cod: coloanele în milisecunde se aduc la BIGINT la pornire');
  const iAdd = dbSrc.indexOf('ADD COLUMN IF NOT EXISTS reset_expires BIGINT');
  const iFix = dbSrc.indexOf("for (const col of ['reset_expires', 'access_until'])");
  T('după ce se adaugă coloanele, nu înainte', iAdd > 0 && iFix > iAdd);
  T('se uită la tipul de acum (information_schema) și schimbă doar o coloană de dată', /information_schema\.columns WHERE table_schema = current_schema\(\) AND table_name = 'users' AND column_name = \$1/.test(dbSrc)
    && /if \(tip && \/\^\(timestamp\|date\)\/\.test\(tip\)\)/.test(dbSrc));
  T('valorile se păstrează: din dată în milisecunde', /ALTER COLUMN \$\{col\} TYPE BIGINT USING \(EXTRACT\(EPOCH FROM \$\{col\}\) \* 1000\)::BIGINT/.test(dbSrc));
  T('o eroare aici nu oprește pornirea', /catch \(e\) \{ console\.warn\(`\[DB\] users\.\$\{col\}: n-am putut-o aduce la BIGINT/.test(dbSrc));
  T('linkul de parolă se scrie tot în milisecunde', /UPDATE users SET reset_token = \$2, reset_expires = \$3 WHERE id = \$1/.test(dbSrc));

  sect('2. O bază veche: coloanele ca dată, scrierea pică exact ca pe server');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-ms-'));
  const pgdata = path.join(dir, 'pgdata');
  const { PGlite } = await import('@electric-sql/pglite');
  const vechi = new PGlite(pgdata);
  await vechi.exec(`CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer', created_at TIMESTAMP DEFAULT NOW(), reset_token VARCHAR(64), reset_expires TIMESTAMPTZ, access_until TIMESTAMPTZ)`);
  await vechi.query(`INSERT INTO users (username, password_hash, role, reset_token, reset_expires, access_until) VALUES ('om@firma.ro', 'x', 'viewer', $1, $2, $3)`,
    ['a'.repeat(64), TERMEN, ACCES]);
  let martor = null;
  try { await vechi.query('UPDATE users SET reset_expires = $1 WHERE id = 1', [String(TERMEN_MS)]); } catch (e) { martor = e.message; }
  T('martor: milisecundele trimise ca text, într-o coloană de dată → eroarea de pe ratrack.ro', /date\/time field value out of range/.test(martor || ''), martor);
  await vechi.close();

  sect('3. Pornirea lui db.js pe baza veche: BIGINT, aceleași clipe, linkul merge');
  const cod = `
    const db = require(${JSON.stringify(path.resolve('./db.js'))});
    (async () => {
      await db.initDb();
      const tip = async (c) => (await db.pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = $1", [c])).rows[0].data_type;
      const r = (await db.pool.query("SELECT reset_expires, access_until FROM users WHERE username = 'om@firma.ro'")).rows[0];
      let scris = 'ok'; try { await db.pool.query('UPDATE users SET reset_expires = $1 WHERE username = $2', ['${TERMEN_MS}', 'om@firma.ro']); } catch (e) { scris = e.message; }
      const u = (await db.pool.query("SELECT id FROM users WHERE username = 'om@firma.ro'")).rows[0];
      await db.setUserResetToken(u.id, 'b'.repeat(64), Date.now() + 3600 * 1000);
      const gasit = await db.getUserByResetToken('b'.repeat(64));
      console.log('REZ=' + JSON.stringify({ tipReset: await tip('reset_expires'), tipAcces: await tip('access_until'), reset: Number(r.reset_expires), acces: Number(r.access_until), scris, gasit: !!(gasit && gasit.id === u.id) }));
      process.exit(0);
    })().catch((e) => { console.log('EROARE=' + e.message); process.exit(1); });`;
  const env = { ...process.env, PGLITE_DIR: pgdata, SESSION_SECRET: 'ci_ms' };
  delete env.DATABASE_URL;
  const faza = (n) => {
    const r = spawnSync(process.execPath, ['-e', cod], { env, encoding: 'utf8', timeout: 240000 });
    const m = /REZ=(.*)/.exec(r.stdout || '');
    T('pornirea ' + n + ' a mers până la capăt', r.status === 0 && !!m, (r.stdout || '').slice(-400) + (r.stderr || '').slice(-400));
    return { rez: m ? JSON.parse(m[1]) : {}, iesire: (r.stdout || '') + (r.stderr || '') };
  };
  const a = faza('întâi');
  T('reset_expires a devenit BIGINT', a.rez.tipReset === 'bigint', a.rez.tipReset);
  T('access_until a devenit BIGINT', a.rez.tipAcces === 'bigint', a.rez.tipAcces);
  T('termenul linkului e aceeași clipă, în milisecunde', a.rez.reset === TERMEN_MS, a.rez.reset + ' ≠ ' + TERMEN_MS);
  T('termenul accesului e aceeași clipă, în milisecunde', a.rez.acces === ACCES_MS, a.rez.acces + ' ≠ ' + ACCES_MS);
  T('scrierea care pica pe server merge acum', a.rez.scris === 'ok', a.rez.scris);
  T('linkul de parolă se scrie și se găsește (setUserResetToken → getUserByResetToken)', a.rez.gasit === true);
  T('pornirea spune în jurnal ce a schimbat', /users\.reset_expires era „timestamp with time zone” — adusă la BIGINT/.test(a.iesire) && /users\.access_until era/.test(a.iesire));
  const b = faza('a doua');
  T('a doua pornire nu mai schimbă nimic', b.rez.tipReset === 'bigint' && b.rez.tipAcces === 'bigint' && b.rez.acces === ACCES_MS && !/adusă la BIGINT/.test(b.iesire), b.iesire.slice(-300));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

  console.log('\n' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
