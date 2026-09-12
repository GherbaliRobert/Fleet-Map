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
//   A — o umple cu date care au legături între ele și cu poziții pe două zile; face backup CRIPTAT, unul
//       NECRIPTAT și unul în FORMATUL VECHI; verifică că un backup tăiat e refuzat; arhivează pozițiile pe ore
//       la un „S3" fals pornit în același proces;
//   B — bază goală: rulează scriptul real restore-backup.js, apoi numără și verifică legăturile; îl rulează din
//       nou cu --wipe, pe copia în formatul vechi; apoi pune la loc pozițiile cu restore-positions.js (de două
//       ori, ca să vadă că nu dublează nimic).
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
    // Loturi mici, ca paginarea să ruleze de-adevăratelea (altfel toate tabelele încap într-un singur lot și un
    // `<` scris `<=` sau un `break` pus greșit ar trece neobservate).
    process.env.BACKUP_BATCH = '100';
    process.env.POSITIONS_EXPORT_BATCH = '1000';
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
    // 250 de rânduri în plus: backup-ul le citește pe trei loturi de câte 100.
    await q("INSERT INTO alert_history (alert_id, imei, data) SELECT $1, '350000000000001', '{\"v\":1}' FROM generate_series(1, 250)", [a1]);
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

    // Formatul VECHI (un singur JSON), ca să dovedim că restaurarea citește și copiile făcute înainte.
    const vechi = backup.serialize(await backup.buildDump(db, 'proba-veche'), null);
    fs.writeFileSync(path.join(dirFisiere, 'dump_vechi.' + vechi.ext), vechi.buf);
    // Formatul nou, citit înapoi: exact aceleași rânduri.
    const citit = backup.deserialize(plain.buf, null);
    const v2ok = !!(citit._meta && citit._meta.format === 'ndjson-v2') && TABELE.every((t) => (citit.data[t] || []).length === numar[t]);
    // Un fișier tăiat (fără marcajul de sfârșit) trebuie REFUZAT, nu restaurat pe jumătate.
    const zlib = require('zlib');
    const text = zlib.gunzipSync(plain.buf).toString('utf8');
    let trunchiat = false;
    try { backup.deserialize(zlib.gzipSync(Buffer.from(text.slice(0, text.lastIndexOf('{"_end"')), 'utf8')), null); }
    catch (e) { trunchiat = /incomplet/i.test(e.message); }

    // Poziții în trei ore din două zile trecute, pentru două vehicule, câte trei pe oră
    // (+ una azi, care NU se arhivează: ziua nu s-a încheiat).
    const zile = [3, 2].map((k) => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10));
    let pozitii = 0;
    for (const zi of zile) for (const ora of ['01', '05', '23']) for (const imei of ['350000000000001', '350000000000002']) for (let m = 0; m < 3; m++) {
      await q('INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority, io_data, company_id) VALUES ($1, $2, 45.1, 21.2, 50, 90, 10, 0, $3, $4)',
        [imei, zi + ' ' + ora + ':1' + m + ':00', JSON.stringify({ can_fuel_level_liters: 40 + m, ignition: 1 }), co1]);
      pozitii++;
    }
    // 2500 de poziții într-o singură oră: arhivarea le citește pe trei loturi de câte 1000.
    await q("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority, company_id) SELECT '350000000000003', ($1::timestamp + (g || ' seconds')::interval), 45.3, 21.3, 30, 0, 9, 0, $2 FROM generate_series(0, 2499) g", [zile[1] + ' 09:00:00', co1]);
    pozitii += 2500;
    // O poziție de IERI seara: NU se arhivează încă. Aparatele care își descarcă memoria după miezul nopții scriu pe ieri.
    await q("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ('350000000000002', $1, 45, 21, 0, 0, 10, 0)", [new Date(Date.now() - 86400000).toISOString().slice(0, 10) + ' 22:30:00']);
    await q("INSERT INTO positions (imei, timestamp, latitude, longitude, speed, angle, satellites, priority) VALUES ('350000000000001', NOW(), 45, 21, 0, 0, 10, 0)");
    // „S3" fals, în același proces: primește fișierele și le scrie pe disc, cu cheia drept cale.
    const http = require('http');
    const dirS3 = path.join(dirFisiere, 's3');
    const s3 = http.createServer((rq, rs) => {
      const ch = [];
      rq.on('data', (c) => ch.push(c));
      rq.on('end', () => {
        const p = path.join(dirS3, decodeURIComponent(rq.url.split('?')[0]).replace(/^\/+/, ''));
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, Buffer.concat(ch));
        rs.writeHead(200); rs.end('<ok/>');
      });
    });
    await new Promise((r) => s3.listen(0, '127.0.0.1', r));
    Object.assign(process.env, { BACKUP_S3_ENDPOINT: 'http://127.0.0.1:' + s3.address().port, BACKUP_S3_BUCKET: 'proba', BACKUP_S3_KEY_ID: 'k', BACKUP_S3_SECRET: 's', BACKUP_PASSPHRASE: 'parola-de-proba-foarte-lunga' });
    const exp = await backup.exportPositionsRange(db, { maxDays: 30 });
    s3.close();
    // Un backup cu un tabel marcat INCOMPLET (cum face makeBackup când o citire pică la jumătate).
    const linii = text.split('\n').filter(Boolean);
    const sf = JSON.parse(linii[linii.length - 1]);
    sf._end.tables.device_groups = 'skip: citire întreruptă (simulat)';
    linii[linii.length - 1] = JSON.stringify(sf);
    fs.writeFileSync(path.join(dirFisiere, 'dump_partial.ndjson.gz'), zlib.gzipSync(Buffer.from(linii.join('\n') + '\n', 'utf8')));

    console.log('REZULTAT ' + JSON.stringify({ numar, enc: 'dump.' + enc.ext, plain: 'dump.' + plain.ext, vechi: 'dump_vechi.' + vechi.ext, partial: 'dump_partial.ndjson.gz', criptat: enc.encrypted, v2ok, trunchiat, pozitii, exportRows: exp.rows, exportFiles: exp.files, dirS3 }));

    process.exit(0);
  })().catch((e) => { console.error('seed eșuat:', e); process.exit(1); });
  return;
}

// ════════════ Faza „strain": un rând în B care NU e în backup ════════════
if (faza === 'strain') {
  (async () => {
    const db = require('./db');
    await db.initDb();
    await db.pool.query("INSERT INTO device_groups (name) VALUES ('rest din B, nu e în backup')");
    console.log('REZULTAT {"ok":true}');
    process.exit(0);
  })().catch((e) => { console.error('strain eșuat:', e); process.exit(1); });
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
    const strain = (await q("SELECT COUNT(*)::int AS n FROM device_groups WHERE name = 'rest din B, nu e în backup'")).rows[0].n;
    console.log('REZULTAT ' + JSON.stringify({ numar, man, acces, contor: contor ? contor.last_number : null, grupNouOk, strain }));
    process.exit(0);
  })().catch((e) => { console.error('numărare eșuată:', e); process.exit(1); });
  return;
}

// ════════════ Faza „pozitii": câte poziții sunt în baza B și dacă o valoare CAN a ajuns întreagă ════════════
if (faza === 'pozitii') {
  (async () => {
    const db = require('./db');
    await db.initDb();
    const n = (await db.pool.query('SELECT COUNT(*)::int AS n FROM positions')).rows[0].n;
    const r = (await db.pool.query("SELECT io_data FROM positions WHERE imei = '350000000000001' ORDER BY timestamp LIMIT 1 OFFSET 2")).rows[0];
    const io = r ? (typeof r.io_data === 'string' ? JSON.parse(r.io_data) : r.io_data) : null;
    console.log('REZULTAT ' + JSON.stringify({ n, fuel: io ? io.can_fuel_level_liters : null }));
    process.exit(0);
  })().catch((e) => { console.error('numărarea pozițiilor a eșuat:', e); process.exit(1); });
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
  T('backup-ul cu parolă e chiar criptat (antetul RATBK1 în fișier, nu doar steagul)', A.rez.criptat === true && fs.readFileSync(path.join(FIS, A.rez.enc)).slice(0, 6).toString() === 'RATBK1');

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

  console.log('\n3. Din nou peste B, cu --wipe, dintr-o copie NECRIPTATĂ în formatul VECHI');
  // Un rând care NU e în backup: după --wipe trebuie să dispară. Altfel proba trecea și dacă golirea nu se făcea deloc.
  await ruleaza([__filename, '--faza=strain'], DIR_B);
  const R2 = await ruleaza(['restore-backup.js', path.join(FIS, A.rez.vechi), '--wipe'], DIR_B);
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
  T('golirea chiar a scos ce nu era în backup', B2.rez.strain === 0, B2.rez.strain);

  console.log('\n3b. Un backup cu un tabel INCOMPLET nu golește tabelul și nu iese „reușit"');
  await ruleaza([__filename, '--faza=strain'], DIR_B);
  const R3 = await ruleaza(['restore-backup.js', path.join(FIS, A.rez.partial), '--wipe'], DIR_B);
  T('restaurarea raportează eroare (cod 2), nu succes', R3.code === 2, 'cod ' + R3.code);
  T('și spune că tabelul e incomplet', /INCOMPLET/.test(R3.out), R3.out.split('\n').filter((l) => /device_groups/.test(l)).slice(0, 2).join(' | '));
  const B3 = await ruleaza([__filename, '--faza=numara'], DIR_B);
  T('tabelul incomplet NU a fost golit (rândul din B a rămas)', !!B3.rez && B3.rez.strain === 1, B3.rez && B3.rez.strain);


  console.log('\n4. Formatul nou se citește înapoi întreg, iar un fișier tăiat e refuzat');
  T('backup-ul de acum (rând cu rând) se citește înapoi cu exact aceleași rânduri', A.rez.v2ok === true);
  T('un backup tăiat e refuzat, nu restaurat pe jumătate', A.rez.trunchiat === true);

  console.log('\n5. Pozițiile: arhivă pe ore, apoi puse la loc într-o bază goală');
  T('arhiva a urcat exact pozițiile zilelor încheiate (nu și pe cea de azi)', A.rez.exportRows === A.rez.pozitii, A.rez.exportRows + ' din ' + A.rez.pozitii);
  const toate = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? toate(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
  const fisPoz = toate(A.rez.dirS3).filter((f) => /[\\/]positions[\\/]/.test(f));
  T('câte un fișier pe fiecare oră cu date: 2 zile × 3 ore + ora cu 2500 de poziții', fisPoz.length === 7 && A.rez.exportFiles === 7, fisPoz.length + ' fișiere, raportate ' + A.rez.exportFiles);
  T('fișierele se numesc zi/oră și sunt criptate', fisPoz.length > 0 && fisPoz.every((f) => /\d{4}-\d{2}-\d{2}[\\/]\d{2}\.ndjson\.gz\.enc$/.test(f) && fs.readFileSync(f).slice(0, 6).toString() === 'RATBK1'),
    fisPoz.map((f) => path.basename(path.dirname(f)) + '/' + path.basename(f)).join(', '));
  const P1 = await ruleaza(['restore-positions.js', A.rez.dirS3], DIR_B, { BACKUP_PASSPHRASE: 'parola-de-proba-foarte-lunga' });
  T('punerea la loc a pozițiilor se termină fără erori', P1.code === 0, 'cod ' + P1.code + ' · ' + P1.out.slice(-300));
  const BP = await ruleaza([__filename, '--faza=pozitii'], DIR_B);
  T('baza B are toate pozițiile din arhivă', !!BP.rez && BP.rez.n === A.rez.pozitii, BP.rez ? BP.rez.n : BP.out.slice(-200));
  T('iar valorile CAN ale unei poziții sunt intacte', !!BP.rez && BP.rez.fuel === 42, BP.rez && BP.rez.fuel);
  await ruleaza(['restore-positions.js', A.rez.dirS3], DIR_B, { BACKUP_PASSPHRASE: 'parola-de-proba-foarte-lunga' });
  const BP2 = await ruleaza([__filename, '--faza=pozitii'], DIR_B);
  T('rulată de două ori, nu dublează nimic', !!BP2.rez && BP2.rez.n === A.rez.pozitii, BP2.rez && BP2.rez.n);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); gata(1); });
