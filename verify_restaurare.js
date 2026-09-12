// verify_restaurare.js — un backup chiar se poate restaura, cap-coadă, pe o bază goală.
//
//   node verify_restaurare.js
//
// Până acum restaurarea nu fusese încercată niciodată. La prima încercare pe hârtie am găsit de ce n-ar fi
// mers: tabelele se puneau la loc în ordinea din listă, iar lista punea VEHICULELE înaintea GRUPURILOR la care
// trimit. Pe o bază goală, fiecare vehicul dintr-un grup și fiecare drept de acces pe grup ar fi picat. Cu
// `--wipe`, golirea ar fi picat și ea (șoferii și alertele se ștergeau înaintea celor care trimit la ele).
//
// Proba lucrează pe două baze separate (PGlite, fără servicii externe):
//   A — o umple cu date care au legături între ele, face backup CRIPTAT și unul NECRIPTAT;
//   B — bază goală: rulează scriptul real restore-backup.js, apoi numără și verifică legăturile;
//       apoi îl rulează din nou cu --wipe, pe copia necriptată, și verifică iar.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const faza = (process.argv.find((a) => a.startsWith('--faza=')) || '').slice(7);
const TABELE = ['companies', 'device_groups', 'drivers', 'devices', 'users', 'user_group_access', 'user_device_access', 'alerts', 'alert_history', 'invoices', 'invoice_counters'];

// ════════════ Faza „seed": umple baza A și scrie backup-urile ════════════
if (faza === 'seed') {
  (async () => {
    const [dirFisiere] = process.argv.slice(3);
    const db = require('./db');
    const backup = require('./backup');
    await db.initDb();
    const q = (s, p) => db.pool.query(s, p || []);
    const co1 = (await q("INSERT INTO companies (name, slug) VALUES ('Transport Unu SRL', 'unu') RETURNING id")).rows[0].id;
    const co2 = (await q("INSERT INTO companies (name, slug) VALUES ('Logistica Doi SRL', 'doi') RETURNING id")).rows[0].id;
    const g1 = (await q('INSERT INTO device_groups (name, company_id) VALUES ($1, $2) RETURNING id', ['Camioane', co1])).rows[0].id;
    const g2 = (await q('INSERT INTO device_groups (name, company_id) VALUES ($1, $2) RETURNING id', ['Dube', co2])).rows[0].id;
    const d1 = (await q('INSERT INTO drivers (name, company_id) VALUES ($1, $2) RETURNING id', ['Ion Popescu', co1])).rows[0].id;
    const d2 = (await q('INSERT INTO drivers (name, company_id) VALUES ($1, $2) RETURNING id', ['Ana Ionescu', co2])).rows[0].id;
    await q('INSERT INTO devices (imei, name, plate, company_id, group_id, driver_id) VALUES ($1,$2,$3,$4,$5,$6)', ['350000000000001', 'MAN 1', 'B-01-UNU', co1, g1, d1]);
    await q('INSERT INTO devices (imei, name, plate, company_id, group_id, driver_id) VALUES ($1,$2,$3,$4,$5,$6)', ['350000000000002', 'Iveco 2', 'CJ-02-DOI', co2, g2, d2]);
    await q('INSERT INTO devices (imei, name, plate, company_id) VALUES ($1,$2,$3,$4)', ['350000000000003', 'Dacia 3', 'IS-03-UNU', co1]);
    const u1 = (await q("INSERT INTO users (username, password_hash, role, company_id) VALUES ('admin.unu@test.ro', 'x', 'company_admin', $1) RETURNING id", [co1])).rows[0].id;
    const u2 = (await q("INSERT INTO users (username, password_hash, role, company_id) VALUES ('dispecer.doi@test.ro', 'x', 'dispatcher', $1) RETURNING id", [co2])).rows[0].id;
    await q('INSERT INTO user_group_access (user_id, group_id) VALUES ($1, $2)', [u2, g2]);
    await q('INSERT INTO user_device_access (user_id, imei) VALUES ($1, $2)', [u1, '350000000000003']);
    const a1 = (await q("INSERT INTO alerts (name, type, imei, condition, company_id) VALUES ('Viteză', 'overspeed', '350000000000001', '{\"limit\":90}', $1) RETURNING id", [co1])).rows[0].id;
    for (let i = 0; i < 3; i++) await q("INSERT INTO alert_history (alert_id, imei, data) VALUES ($1, '350000000000001', '{\"v\":95}')", [a1]);
    await q("INSERT INTO invoices (company_id, series, number, year, full_number) VALUES ($1, 'RAT', 42, 2026, 'RAT-2026-00042')", [co1]);
    await q("INSERT INTO invoice_counters (series, year, last_number) VALUES ('RAT', 2026, 42) ON CONFLICT (series, year) DO UPDATE SET last_number = 42");

    const numar = {};
    for (const t of TABELE) numar[t] = (await q('SELECT COUNT(*)::int AS n FROM ' + t)).rows[0].n;

    process.env.BACKUP_PASSPHRASE = 'parola-de-proba-foarte-lunga';
    const enc = await backup.makeBackup(db, 'proba');
    fs.writeFileSync(path.join(dirFisiere, 'dump.' + enc.ext), enc.buf);
    delete process.env.BACKUP_PASSPHRASE;
    const plain = await backup.makeBackup(db, 'proba');
    fs.writeFileSync(path.join(dirFisiere, 'dump.' + plain.ext), plain.buf);

    console.log('REZULTAT ' + JSON.stringify({ numar, enc: 'dump.' + enc.ext, plain: 'dump.' + plain.ext, criptat: enc.encrypted }));
    process.exit(0);
  })().catch((e) => { console.error('seed eșuat:', e); process.exit(1); });
  return;
}

// ════════════ Faza „numara": ce e acum în baza B ════════════
if (faza === 'numara') {
  (async () => {
    const db = require('./db');
    await db.initDb();
    const q = (s, p) => db.pool.query(s, p || []);
    const numar = {};
    for (const t of TABELE) numar[t] = (await q('SELECT COUNT(*)::int AS n FROM ' + t)).rows[0].n;
    const man = (await q("SELECT d.group_id, g.name AS grup, dr.name AS sofer FROM devices d LEFT JOIN device_groups g ON g.id = d.group_id LEFT JOIN drivers dr ON dr.id = d.driver_id WHERE d.imei = '350000000000001'")).rows[0] || null;
    const acces = (await q("SELECT g.name FROM user_group_access uga JOIN users u ON u.id = uga.user_id JOIN device_groups g ON g.id = uga.group_id WHERE u.username = 'dispecer.doi@test.ro'")).rows.map((r) => r.name);
    const contor = (await q("SELECT last_number FROM invoice_counters WHERE series = 'RAT' AND year = 2026")).rows[0];
    // După restaurare, un grup NOU trebuie să primească un id liber (secvențele resetate), nu să se ciocnească.
    let grupNouOk = false;
    try { await q("INSERT INTO device_groups (name) VALUES ('Grup nou după restaurare')"); grupNouOk = true; } catch (e) { grupNouOk = 'eroare: ' + e.message; }
    await q("DELETE FROM device_groups WHERE name = 'Grup nou după restaurare'");
    console.log('REZULTAT ' + JSON.stringify({ numar, man, acces, contor: contor ? contor.last_number : null, grupNouOk }));
    process.exit(0);
  })().catch((e) => { console.error('numărare eșuată:', e); process.exit(1); });
  return;
}

// ════════════ Orchestratorul ════════════
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const RAD = path.join(os.tmpdir(), 'rax_restaurare_' + Date.now());
const DIR_A = path.join(RAD, 'A'), DIR_B = path.join(RAD, 'B'), FIS = path.join(RAD, 'fisiere');
fs.mkdirSync(FIS, { recursive: true });

function ruleaza(args, dirDb, envExtra) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, { PGLITE_DIR: dirDb, DEMO_DISABLED: 'true' }, envExtra || {});
    delete env.DATABASE_URL;
    if (!envExtra || !envExtra.BACKUP_PASSPHRASE) delete env.BACKUP_PASSPHRASE;
    const p = spawn(process.execPath, args, { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => {
      const m = out.match(/REZULTAT (\{.*\})/);
      resolve({ code, out, rez: m ? JSON.parse(m[1]) : null });
    });
  });
}
function gata(code) {
  try { fs.rmSync(RAD, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}

(async () => {
  console.log('\n1. Baza A: date cu legături între ele + două backup-uri');
  const A = await ruleaza([__filename, '--faza=seed', FIS], DIR_A);
  T('baza A s-a umplut și backup-urile s-au scris', A.code === 0 && !!A.rez, A.out.slice(-300));
  if (!A.rez) return gata(1);
  T('backup-ul cu parolă e chiar criptat', A.rez.criptat === true);

  console.log('\n2. Baza B, goală: restaurare din copia criptată, cu scriptul real');
  const R1 = await ruleaza(['restore-backup.js', path.join(FIS, A.rez.enc)], DIR_B, { BACKUP_PASSPHRASE: 'parola-de-proba-foarte-lunga' });
  T('restaurarea se termină fără erori', R1.code === 0, 'cod ' + R1.code + ' · ' + R1.out.split('\n').filter((l) => /erori|eșuat|EȘUAT/.test(l)).slice(-4).join(' | '));
  const B1 = await ruleaza([__filename, '--faza=numara'], DIR_B);
  T('baza B se poate citi după restaurare', B1.code === 0 && !!B1.rez, B1.out.slice(-300));
  if (!B1.rez) return gata(1);
  for (const t of TABELE) T('„' + t + '": ' + A.rez.numar[t] + ' rânduri, câte erau', B1.rez.numar[t] === A.rez.numar[t], 'în B: ' + B1.rez.numar[t]);
  T('vehiculul își păstrează grupul și șoferul', B1.rez.man && B1.rez.man.grup === 'Camioane' && B1.rez.man.sofer === 'Ion Popescu', JSON.stringify(B1.rez.man));
  T('dispecerul își păstrează dreptul pe grup', B1.rez.acces.length === 1 && B1.rez.acces[0] === 'Dube', JSON.stringify(B1.rez.acces));
  T('contorul de facturi continuă de la 42 (nu repornește seria fiscală)', B1.rez.contor === 42, B1.rez.contor);
  T('un rând nou după restaurare primește un id liber', B1.rez.grupNouOk === true, B1.rez.grupNouOk);

  console.log('\n3. Din nou peste B, cu --wipe, din copia NECRIPTATĂ');
  const R2 = await ruleaza(['restore-backup.js', path.join(FIS, A.rez.plain), '--wipe'], DIR_B);
  T('restaurarea „curată" se termină fără erori', R2.code === 0, 'cod ' + R2.code + ' · ' + R2.out.split('\n').filter((l) => /erori|eșuat|EȘUAT/.test(l)).slice(-4).join(' | '));
  // Numărătoarea de mai jos poate ieși bine și din noroc: datele erau deja în B din pasul 2, deci o golire
  // care pică pe o cheie străină lasă rândurile vechi pe loc și totul „se potrivește". Cerem explicit ca
  // golirea să nu fi eșuat NICIUNDE.
  const golireRatata = R2.out.split('\n').filter((l) => /wipe eșuat|golire eșuată/.test(l));
  T('golirea nu pică pe nicio legătură între tabele', golireRatata.length === 0, golireRatata.slice(0, 3).join(' | '));
  const B2 = await ruleaza([__filename, '--faza=numara'], DIR_B);
  if (!B2.rez) { T('baza B se poate citi după --wipe', false, B2.out.slice(-300)); return gata(1); }
  const diferente = TABELE.filter((t) => B2.rez.numar[t] !== A.rez.numar[t]);
  T('după --wipe, fiecare tabel are exact rândurile din backup (nu dublate, nu lipsă)', diferente.length === 0, diferente.map((t) => t + ' ' + B2.rez.numar[t] + '≠' + A.rez.numar[t]).join(', '));
  T('și legăturile sunt tot la locul lor', B2.rez.man && B2.rez.man.grup === 'Camioane' && B2.rez.acces[0] === 'Dube');

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); gata(1); });
