// verify_conexiuni.js — recepția are conexiunile ei la bază, iar publicările nu mai pornesc pentru documente.
//
//   node verify_conexiuni.js
//
// Ce prinde:
//   1. o scriere de poziție (sau o citire făcută ÎNAINTE de confirmarea către aparat) mutată înapoi pe
//      conexiunile obișnuite — atunci un raport greu sau valul de pagini de după un deploy țin aparatele pe loc;
//   2. limita de timp pusă pe conexiunile OBIȘNUITE — migrările de la pornire și copiile zilnice ar pica;
//   3. railway.json și railway.toml care se contrazic din nou (Railway citește unul dintre ele, iar
//      documentația lor nu spune care câștigă);
//   4. regulile de publicare: codul serverului TREBUIE să pornească o publicare, documentele NU.
const fs = require('fs');
const path = require('path');
const os = require('os');
const RAD = __dirname;
const dbSrc = fs.readFileSync(path.join(RAD, 'db.js'), 'utf8');
const svSrc = fs.readFileSync(path.join(RAD, 'server.js'), 'utf8');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? ' → ' + JSON.stringify(detaliu) : '')); }
}
function functia(src, nume) {
  const a = src.indexOf('async function ' + nume + '(');
  if (a < 0) return '';
  const b = src.indexOf('\nasync function ', a + 10);
  const c = src.indexOf('\nfunction ', a + 10);
  const sf = [b, c].filter((x) => x > 0).sort((x, y) => x - y)[0] || src.length;
  return src.slice(a, sf);
}

console.log('\n1. Recepția scrie și citește pe conexiunile ei');
{
  T('există o rezervă de conexiuni pentru recepție', /poolIngest = new Pool\(/.test(dbSrc));
  T('pe PGlite rezerva e aceeași conexiune (nu există alta)', /poolIngest = pool;/.test(dbSrc));
  T('e exportată pentru server', /module\.exports = \{\s*pool,\s*poolIngest,/.test(dbSrc));
  const ins = functia(dbSrc, 'insertPositions');
  T('scrierea pozițiilor merge pe rezervă', /await poolIngest\.query\(query, params\)/.test(ins));
  T('și compania vehiculului, citită înainte de scriere', /poolIngest\.query\('SELECT company_id FROM devices/.test(ins));
  T('nicio altă cerere din insertPositions pe conexiunile obișnuite', !/[^t]pool\.query\(/.test(ins.replace(/poolIngest\.query/g, '')));
  T('interfața CAN (citită înainte de confirmare) merge pe rezervă', /poolIngest\.query/.test(functia(dbSrc, 'getDeviceCanInterface')));
  T('sondele de combustibil (citite înainte de confirmare) merg pe rezervă', /poolIngest\.query/.test(functia(dbSrc, 'getFuelSensorsRow')));
  T('calibrarea rezervorului (server.js) merge pe rezervă', /\(db\.poolIngest \|\| db\.pool\)\.query\('SELECT tank_calibration/.test(svSrc));
}

console.log('\n2. Limita de timp stă DOAR pe rezerva recepției');
{
  const aparitii = dbSrc.split('statement_timeout').length - 1;
  T('limita de timp apare o singură dată în db.js', aparitii === 1, aparitii);
  const blocRezerva = dbSrc.slice(dbSrc.indexOf('poolIngest = new Pool('), dbSrc.indexOf('});', dbSrc.indexOf('poolIngest = new Pool(')));
  T('și e în configurația rezervei', /statement_timeout/.test(blocRezerva));
  const blocPrincipal = dbSrc.slice(dbSrc.indexOf('pool = new Pool('), dbSrc.indexOf('});', dbSrc.indexOf('pool = new Pool(')));
  T('conexiunile obișnuite NU au limită (migrările și copiile pot dura minute)', !/statement_timeout/.test(blocPrincipal));
  T('„Stare producție" arată cele două rezerve', /add\('pool', 'Conexiuni la bază'/.test(svSrc) && /poolIngestStats/.test(svSrc));
}

console.log('\n3. railway.json și railway.toml spun același lucru');
const rj = JSON.parse(fs.readFileSync(path.join(RAD, 'railway.json'), 'utf8'));
{
  // Cititor minimal de TOML, suficient pentru fișierul nostru: secțiuni, șiruri, numere, liste de șiruri.
  const tomlTxt = fs.readFileSync(path.join(RAD, 'railway.toml'), 'utf8');
  const toml = {}; let sect = null;
  for (const linie of tomlTxt.split(/\r?\n/)) {
    const l = linie.trim();
    if (!l || l.startsWith('#')) continue;
    const s = l.match(/^\[(\w+)\]$/); if (s) { sect = toml[s[1]] = {}; continue; }
    const kv = l.match(/^(\w+)\s*=\s*(.+)$/); if (!kv || !sect) continue;
    let v = kv[2].trim();
    if (v.startsWith('[')) v = JSON.parse(v);
    else if (v.startsWith('"')) v = JSON.parse(v);
    else v = Number(v);
    sect[kv[1]] = v;
  }
  // TOATE cheile din ambele fișiere, nu o listă fixă: un startCommand sau un numReplicas pus doar într-unul trebuie prins.
  const chei = [];
  for (const s of ['build', 'deploy']) for (const k of new Set(Object.keys(rj[s] || {}).concat(Object.keys(toml[s] || {})))) chei.push([s, k]);
  for (const [s, k] of chei) {
    const a = JSON.stringify((rj[s] || {})[k]), b = JSON.stringify((toml[s] || {})[k]);
    T(s + '.' + k + ' identic în ambele', a === b && a !== undefined, 'json=' + a + ' toml=' + b);
  }
  T('se construiește din Dockerfile (cum spune DEPLOY_RAILWAY.md)', rj.build.builder === 'DOCKERFILE');
}

console.log('\n4. Ce pornește o publicare și ce nu');
{
  // Regulile Railway sunt în stilul .gitignore: ultima regulă care se potrivește decide, „!" exclude,
  // „/" la început ancorează la rădăcina depozitului. O schimbare care nu se potrivește cu nimic NU publică.
  const reguli = (rj.build.watchPatterns || []).map((p) => {
    const neg = p.startsWith('!');
    let corp = neg ? p.slice(1) : p;
    const ancorat = corp.startsWith('/');
    if (ancorat) corp = corp.slice(1);
    const re = corp.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*');
    return { neg, re: new RegExp((ancorat ? '^' : '(^|/)') + re + '$') };
  });
  const publica = (f) => { let d = false; for (const r of reguli) if (r.re.test(f)) d = !r.neg; return d; };

  T('există reguli de publicare', reguli.length > 0);
  for (const f of ['server.js', 'db.js', 'backup.js', 'reports.js', 'codec8e.js', 'public/index.html', 'public/css/app.css', 'public/sw.js', 'Dockerfile', 'package.json', 'package-lock.json', 'railway.json']) {
    T('„' + f + '" pornește o publicare', publica(f));
  }
  for (const f of ['JURNAL-MODIFICARI.md', 'CLAUDE.md', 'DEPLOY_RAILWAY.md', 'docs/RA-Track-Manual.pdf', 'docs_promo/img/harta.png', 'docs_audit/raport.md', 'verify_pornire.js', 'verify_conexiuni.js', 'rbac_smoke.js', '.github/workflows/ci.yml']) {
    T('„' + f + '" NU pornește o publicare', !publica(f));
  }
  T('un .md din public/ (servit de aplicație) pornește o publicare', publica('public/ajutor.md'));
  // Dacă aplicația mobilă nu publică (oricum ar fi scrisă regula), serverul chiar nu trebuie să citească nimic de acolo.
  if (!publica('mobile/x')) {
    // Excluderea e sigură doar dacă serverul nu citește nimic din mobile/ la rulare.
    const folosesc = fs.readdirSync(RAD).filter((f) => f.endsWith('.js') && !/^verify_|_smoke\.js$|^ci-smoke\.js$/.test(f))
      .filter((f) => /['"`]\.?\/?mobile\/|['"`]mobile['"`]\s*,/.test(fs.readFileSync(path.join(RAD, f), 'utf8')));
    T('aplicația mobilă nu pornește publicări, iar serverul nu citește nimic din mobile/', !publica('mobile/src/screens/Reports.tsx') && folosesc.length === 0, folosesc.join(', '));
  }
}


console.log('\n6. Pe PostgreSQL, rezerva e chiar alt set de conexiuni');
// PGlite are o singură conexiune, deci secțiunea 5 nu poate dovedi separarea. Aici încărcăm db.js într-un proces copil
// cu un „pg" fals care ține minte ce configurație primește fiecare Pool: fără bază adevărată, dar pe codul real.
{
  const { spawnSync } = require('child_process');
  const cod = [
    "const cfg = [];",
    "class PoolFals { constructor(c) { cfg.push(c); this.c = c; this.totalCount = 0; this.idleCount = 0; this.waitingCount = 0; }",
    "  query() { return Promise.resolve({ rows: [], rowCount: 0 }); }",
    "  connect() { return Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release() {} }); }",
    "  on() { return this; } end() { return Promise.resolve(); } }",
    "const p = require.resolve('pg');",
    "require.cache[p] = { id: p, filename: p, loaded: true, exports: { Pool: PoolFals, types: { setTypeParser() {} } } };",
    "process.env.DATABASE_URL = 'postgres://fals:fals@127.0.0.1:1/fals';",
    "const db = require('./db');",
    "console.log('REZULTAT ' + JSON.stringify({ doua: db.poolIngest !== db.pool, n: cfg.length,",
    "  principal: { max: db.pool.c && db.pool.c.max, timeout: !!(db.pool.c && db.pool.c.statement_timeout) },",
    "  receptie: { max: db.poolIngest.c && db.poolIngest.c.max, timeout: db.poolIngest.c && db.poolIngest.c.statement_timeout } }));",
    "process.exit(0);",
  ].join('\n');
  const env = Object.assign({}, process.env);
  delete env.PG_POOL_MAX; delete env.PG_POOL_INGEST_MAX; delete env.INGEST_STATEMENT_TIMEOUT_MS;
  const r = spawnSync(process.execPath, ['-e', cod], { cwd: RAD, env, encoding: 'utf8', timeout: 60000 });
  const m = /REZULTAT (\{.*\})/.exec(r.stdout || '');
  const rez = m ? JSON.parse(m[1]) : null;
  T('db.js se încarcă în modul PostgreSQL', !!rez, (r.stderr || r.stdout || '').slice(-300));
  if (rez) {
    T('recepția și paginile au seturi DIFERITE de conexiuni', rez.doua === true && rez.n === 2, JSON.stringify(rez));
    T('rezerva recepției are 12 conexiuni (cât folosea recepția la vârf înainte)', rez.receptie.max === 12, rez.receptie.max);
    T('limita de timp e DOAR pe rezerva recepției', rez.receptie.timeout === 15000 && rez.principal.timeout === false, JSON.stringify(rez));
  }
}


console.log('\n5. Pe bază locală (PGlite) rezerva chiar funcționează');
(async () => {
  const dir = path.join(os.tmpdir(), 'rax_conexiuni_' + Date.now());
  process.env.PGLITE_DIR = dir;
  delete process.env.DATABASE_URL;
  const db = require('./db');
  T('pe PGlite rezerva e chiar conexiunea principală', db.poolIngest === db.pool);
  let merge = false;
  try { merge = (await db.poolIngest.query('SELECT 1 AS unu')).rows[0].unu === 1; } catch (e) { merge = e.message; }
  T('și răspunde la cereri', merge === true, merge);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} process.exit(rele ? 1 : 0); }, 300);
})().catch((e) => { console.error('EROARE în probă:', e); process.exit(1); });
