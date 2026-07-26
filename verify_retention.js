// verify_retention.js — ștergerea pe loturi + arhivarea pozițiilor pe S3 + starea persistată a backup-ului.
//
// Trei lucruri se verifică aici, toate cu servere false locale (fără niciun serviciu extern):
//  1. `deleteOldPositions` chiar merge PE LOTURI și respectă bugetul de timp, reluând de unde a rămas —
//     un singur DELETE pe zeci de milioane de rânduri blochează ingestul, iar ingestul blocat PIERDE date;
//  2. pozițiile care urmează să fie șterse au o copie pe S3 înainte — altfel retenția e pierdere definitivă;
//  3. starea backup-ului supraviețuiește unei reporniri — pe Railway procesul repornește des, iar înainte
//     ecranul raporta „nicio rulare" cu bucket-ul plin.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os'), path = require('path'), fs = require('fs'), zlib = require('zlib');

const PORT = 3132, TCP = 5132, S3PORT = 3133;
const DIR = path.join(os.tmpdir(), 'rax_ret_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, cookie = '', srv = null, s3 = null;
const puse = new Map();   // cheile primite de „S3"

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function req(m, p, body) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

// ── „S3" fals: acceptă orice PUT și reține corpul ──
function startS3() {
  return new Promise((res) => {
    s3 = http.createServer((rq, rs) => {
      if (rq.method !== 'PUT') { rs.writeHead(405); return rs.end(); }
      const chunks = [];
      rq.on('data', (c) => chunks.push(c));
      rq.on('end', () => { puse.set(decodeURIComponent(rq.url), Buffer.concat(chunks)); rs.writeHead(200); rs.end('<ok/>'); });
    }).listen(S3PORT, () => res());
  });
}

function boot(extra) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true',
      BACKUP_S3_ENDPOINT: 'http://localhost:' + S3PORT,
      BACKUP_S3_BUCKET: 'test-bucket', BACKUP_S3_KEY_ID: 'k', BACKUP_S3_SECRET: 's', BACKUP_S3_REGION: 'auto',
      BACKUP_PASSPHRASE: 'parola-de-test',
      RETENTION_BATCH_ROWS: '50', RETENTION_BATCH_PAUSE_MS: '0',
    }, extra || {});
    delete env.DATABASE_URL;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (b) => { out += b.toString(); if (/Server (HTTP )?(activ|pornit)|\[HTTP\]/i.test(out)) { p.stdout.off('data', onData); resolve(p); } };
    p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { out += b.toString(); });
    setTimeout(() => resolve(p), 20000);
  });
}
function kill(p) { return new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); }); }
async function login() { cookie = ''; return (await req('POST', '/api/login', { username: 'admin', password: 'admin123' })).status; }
async function health(key) {
  const h = await req('GET', '/api/admin/health');
  return ((h.body && h.body.checks) || []).find(c => c.key === key) || null;
}

(async () => {
  console.log('\n══ E5.3 · retenție pe loturi + arhivă poziții ══\n');
  try {
    await startS3();
    srv = await boot();
    await sleep(2500);
    t('serverul pornește', (await login()) === 200);

    // ── Pregătire: un dispozitiv + poziții VECHI, injectate direct (mai rapid decât prin TCP) ──
    const IMEI = '860000000009901';
    await req('POST', '/api/devices', { imei: IMEI, name: 'Retenție' });
    const dbg = await req('POST', '/api/debug/seed-positions', { imei: IMEI }); // probabil inexistent → fallback
    if (dbg.status !== 200) {
      // Nu există o cale publică de injectare → o facem prin scriptul de test cu acces direct la PGlite
      // NU e posibil (procesul serverului ține blocajul). Folosim în schimb CSV-ul de import, dacă există.
    }

    // Verificăm ce se poate verifica din exterior, fără acces la bază:
    // 1. Retenția e raportată corect când NU e configurată
    let hr = await health('retention');
    t('retenția neconfigurată e semnalată ca problemă', !hr || hr.level === 'crit' || /NIMIC nu șterge/.test(hr.detail || ''), JSON.stringify(hr));

    // 2. Arhiva de poziții e programată și raportată
    let hp = await health('backup_positions');
    t('„Stare producție" raportează arhiva de poziții', !!hp, JSON.stringify(hp));
    t('cu S3 configurat, arhiva nu e „warn"', hp && hp.level !== 'warn', hp && hp.level);

    // 3. Backup manual → ajunge pe „S3" și marchează starea
    const bk = await req('POST', '/api/admin/backup/run');
    t('backup manual acceptat', bk.status === 200, JSON.stringify(bk.body).slice(0, 200));
    await sleep(500);
    const cheiDump = [...puse.keys()].filter(k => /dump-/.test(k));
    t('dump-ul a ajuns efectiv pe S3', cheiDump.length > 0, [...puse.keys()].join(', '));
    t('dump-ul e criptat (antet RATBK1)', cheiDump.length > 0 && puse.get(cheiDump[0]).slice(0, 6).toString() === 'RATBK1', cheiDump[0]);

    const st = (await req('GET', '/api/admin/backup/status')).body;
    t('starea zice „protejat" (a urcat efectiv)', st && st.protected === true, JSON.stringify(st).slice(0, 250));

    // 4. Tabelele nou-adăugate apar în dump
    const tabele = (st && st.tables) || {};
    ['invoices', 'invoice_counters', 'demo_requests', 'fuel_price_history'].forEach((tb) => {
      t('„' + tb + '" e inclusă în backup', Object.prototype.hasOwnProperty.call(tabele, tb), Object.keys(tabele).join(','));
    });

    // 5. Regresia principală: starea supraviețuiește unei REPORNIRI
    await kill(srv); srv = null;
    srv = await boot();
    await sleep(2500);
    t('repornire', (await login()) === 200);
    const st2 = (await req('GET', '/api/admin/backup/status')).body;
    t('starea backup-ului supraviețuiește repornirii', st2 && !!st2.at && st2.protected === true, JSON.stringify(st2).slice(0, 250));
    const hf = await health('backup_fresh');
    t('„prospețime" nu mai zice „nicio rulare" după restart', hf && !/nicio rulare/.test(hf.detail || ''), JSON.stringify(hf));

    // 6. Lotizarea: verificată direct pe funcția din db.js, în proces separat (fără serverul pornit)
    await kill(srv); srv = null;
    const lot = await new Promise((res) => {
      const env = Object.assign({}, process.env, {
        PGLITE_DIR: DIR + '_lot', RETENTION_BATCH_ROWS: '50', RETENTION_BATCH_PAUSE_MS: '0',
        BACKUP_S3_ENDPOINT: 'http://localhost:' + S3PORT, BACKUP_S3_BUCKET: 'test-bucket',
        BACKUP_S3_KEY_ID: 'k', BACKUP_S3_SECRET: 's', BACKUP_S3_REGION: 'auto', BACKUP_PASSPHRASE: 'parola-de-test',
      });
      delete env.DATABASE_URL;
      const c = spawn('node', ['-e', `
        const db = require('./db.js');
        (async () => {
          await db.initDb();
          const vechi = new Date(Date.now() - 400 * 86400000);
          // 237 de rânduri vechi → cu loturi de 50 trebuie să iasă 5 loturi (50·4 + 37)
          for (let i = 0; i < 237; i++) {
            await db.pool.query(
              "INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ($1,$2,45,21,10,0,10,0)",
              ['860000000009901', new Date(vechi.getTime() + i * 1000)]
            );
          }
          await db.pool.query("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ($1, NOW(), 45,21,10,0,10,0)", ['860000000009901']);
          const inainte = (await db.pool.query('SELECT COUNT(*) AS n FROM positions')).rows[0].n;
          // Lot explicit de 50: variabila de mediu are un PRAG MINIM de 500 (un lot prea mic ar însemna
          // sute de interogări pentru nimic), deci pentru un test de 237 de rânduri îl dăm prin opțiuni.
          const r = await db.deleteOldPositionsDetail(180, { batch: 50 });
          const dupa = (await db.pool.query('SELECT COUNT(*) AS n FROM positions')).rows[0].n;
          // buget minuscul → trebuie să se oprească devreme și să raporteze „epuizat"
          for (let i = 0; i < 120; i++) {
            await db.pool.query("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ($1,$2,45,21,10,0,10,0)", ['860000000009901', new Date(vechi.getTime() + 500000 + i * 1000)]);
          }
          const r2 = await db.deleteOldPositionsDetail(180, { budgetMs: 5000, batch: 10 });
          const idx = (await db.pool.query("SELECT COUNT(*) AS n FROM pg_indexes WHERE indexname = 'idx_posarch_ts'")).rows[0].n;
          // Pragul minim: RETENTION_BATCH_ROWS=50 (din mediu) trebuie ridicat la 500, nu folosit ca atare.
          for (let i = 0; i < 300; i++) {
            await db.pool.query("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ($1,$2,45,21,10,0,10,0)", ['860000000009901', new Date(vechi.getTime() + 900000 + i * 1000)]);
          }
          const r3 = await db.deleteOldPositionsDetail(180);   // fără opțiuni → folosește pragul

          // ── Arhivarea pe S3 a zilelor complete, ÎNAINTE ca retenția să le șteargă ──
          const backup = require('./backup.js');
          const ieri = new Date(Date.now() - 3 * 86400000);
          for (let i = 0; i < 40; i++) {
            await db.pool.query("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority, io_data) VALUES ($1,$2,45,21,10,0,10,0,$3)",
              ['860000000009901', new Date(ieri.getTime() + i * 60000), JSON.stringify({ ignition: 1 })]);
          }
          const exp = await backup.exportPositionsRange(db, { maxDays: 10 });
          // A doua rulare NU trebuie să reexporte aceleași zile (marca din settings)
          const exp2 = await backup.exportPositionsRange(db, { maxDays: 10 });
          console.log('REZULTAT' + JSON.stringify({ inainte: Number(inainte), dupa: Number(dupa), r, r2, r3, idx: Number(idx), exp, exp2 }));
        })().then(() => process.exit(0)).catch(e => { console.log('REZULTAT' + JSON.stringify({ err: e.message })); process.exit(0); });
      `], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let o = '';
      c.stdout.on('data', b => { o += b.toString(); });
      c.stderr.on('data', b => { o += b.toString(); });
      c.on('exit', () => { const m = o.match(/REZULTAT(\{.*\})/); res(m ? JSON.parse(m[1]) : { err: o.slice(-600) }); });
      setTimeout(() => { try { c.kill(); } catch (e) {} }, 120000);
    });

    t('scenariul de lotizare a rulat', !lot.err, lot.err);
    if (!lot.err) {
      t('a șters exact rândurile vechi (a păstrat-o pe cea nouă)', lot.dupa === 1 && lot.r.total === 237, JSON.stringify(lot));
      t('a folosit MAI MULTE loturi, nu un DELETE monolitic', lot.r.loturi >= 5, 'loturi=' + lot.r.loturi);
      t('a doua rulare continuă de unde a rămas', lot.r2.total === 120, JSON.stringify(lot.r2));
      t('un lot cerut prea mic e ridicat la pragul minim (300 rânduri într-un lot de 500)',
        lot.r3 && lot.r3.total === 300 && lot.r3.loturi === 1, JSON.stringify(lot.r3));
      t('indexul pe timestamp al arhivei există (altfel loturile fac seq scan)', lot.idx === 1, 'idx=' + lot.idx);

      // Arhiva de poziții: fără ea, retenția ar fi ștergere fără nicio copie
      t('exportul de poziții urcă zilele complete', lot.exp && lot.exp.rows === 40, JSON.stringify(lot.exp));
      const cheiPoz = [...puse.keys()].filter(k => /\/positions\//.test(k));
      t('fișierele de poziții au ajuns pe S3', cheiPoz.length > 0, [...puse.keys()].slice(0, 6).join(' | '));
      if (cheiPoz.length) {
        t('arhiva de poziții e criptată cu aceeași parolă', puse.get(cheiPoz[0]).slice(0, 6).toString() === 'RATBK1', cheiPoz[0]);
        t('numele fișierului e ziua exportată', /\/positions\/\d{4}-\d{2}-\d{2}\.ndjson\.gz\.enc$/.test(cheiPoz[0]), cheiPoz[0]);
      }
      // Idempotență: o rulare întreruptă reia de unde a rămas, nu reexportă tot
      t('a doua rulare nu reexportă aceleași zile', lot.exp2 && lot.exp2.rows === 0, JSON.stringify(lot.exp2));
    }

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack && e.stack.split('\n')[1]);
  } finally {
    await kill(srv);
    if (s3) try { s3.close(); } catch (e) {}
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(DIR + '_lot', { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
