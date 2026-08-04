// verify_alerts_scope.js — alertele create de super-admin aparțin unei COMPANII anume.
//
// Situația reală care a declanșat asta: platformă cu mai multe companii, câte un vehicul în fiecare.
// Super-adminul crea o regulă „Toate vehiculele" și, pentru că el n-are companie, regula se salva cu
// company_id NULL. Efectul, în motorul de alerte (server.js, evaluateAlerts):
//     if (alert.imei) { ... } else if (alert.company_id != null && ...) continue;
// o regulă fără vehicul ȘI fără companie nu intră pe nicio ramură de excludere → se declanșează pentru
// vehiculele TUTUROR companiilor. Iar `getAlerts` filtrează pe company_id, deci administratorii acelor
// companii nici măcar nu vedeau regula care le trimitea notificări.
//
// Testul reproduce exact configurația din producție (2 companii × 1 vehicul) și verifică și premisa
// pe care se sprijină întreaga interfață: super-adminul chiar vede vehiculele TUTUROR companiilor.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3139, TCP = 5139;
const DIR = path.join(os.tmpdir(), 'rax_alerts_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function mkJar() { return { cookie: '' }; }
async function req(jar, m, p, body) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, jar.cookie ? { Cookie: jar.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) jar.cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true',
    });
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

(async () => {
  console.log('\n══ Alerte: domeniul regulii pentru super-admin ══\n');
  try {
    srv = await boot();
    await sleep(2500);
    const S = mkJar();
    t('super-admin autentificat', (await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200);

    // ── Configurația din producție: două companii, câte un vehicul ──
    const coA = (await req(S, 'POST', '/api/companies', { name: 'Compania mea' })).body;
    const coB = (await req(S, 'POST', '/api/companies', { name: 'Unitip Test' })).body;
    t('două companii create', !!(coA && coA.id && coB && coB.id));

    const IMEI_A = '860000000011101', IMEI_B = '860000000011102';
    await req(S, 'POST', '/api/devices', { imei: IMEI_A, name: 'VW CADDY', plate: 'B 268 ROY', company_id: coA.id });
    await req(S, 'POST', '/api/devices', { imei: IMEI_B, name: 'Dacia Logan', plate: 'B 154 UIP', company_id: coB.id });

    // ── Premisa interfeței: super-adminul vede vehiculele TUTUROR companiilor ──
    const dev = (await req(S, 'GET', '/api/devices')).body || [];
    const nume = dev.map(d => d.name).sort().join(', ');
    t('super-adminul vede vehiculele AMBELOR companii', dev.length === 2 && /CADDY/.test(nume) && /Logan/.test(nume), nume || '(gol)');
    t('fiecare vehicul își poartă compania (pentru eticheta din selector)',
      dev.every(d => !!d.company_name), dev.map(d => d.name + '→' + d.company_name).join(' | '));

    // ── Vehicul NEASIGNAT: trebuie să rămână vizibil, nu să dispară din toate listele ──
    const IMEI_X = '860000000011103';
    await req(S, 'POST', '/api/devices', { imei: IMEI_X, name: 'Fara companie', plate: 'B 999 XXX' });
    const dev2 = (await req(S, 'GET', '/api/devices')).body || [];
    const orphanDev = dev2.find(d => d.imei === IMEI_X);
    t('vehiculul fără companie apare în listă (nu e înghițit de JOIN)', !!orphanDev, dev2.length + ' vehicule');
    t('vehiculul fără companie e recunoscut ca atare', orphanDev && orphanDev.company_id == null,
      orphanDev && JSON.stringify(orphanDev.company_id));

    // ── Regula creată de super-admin PENTRU o companie ──
    const r1 = await req(S, 'POST', '/api/alerts', { name: 'Ralanti Unitip', type: 'idle_engine', imei: null, condition: { minutes: 5 }, enabled: true, company_id: coB.id });
    t('regulă creată pe compania aleasă', r1.status === 200 && r1.body && Number(r1.body.company_id) === Number(coB.id), JSON.stringify(r1.body));

    // ── Adminul companiei o VEDE (înainte era invizibilă) ──
    await req(S, 'POST', '/api/users', { username: 'admin.unitip@test.ro', password: 'Parola123!', role: 'company_admin', company_id: coB.id, full_name: 'Admin Unitip' });
    const U = mkJar();
    t('adminul companiei se autentifică', (await req(U, 'POST', '/api/login', { username: 'admin.unitip@test.ro', password: 'Parola123!' })).status === 200);
    const seen = (await req(U, 'GET', '/api/alerts')).body || [];
    t('adminul companiei VEDE regula creată de platformă', seen.some(a => a.name === 'Ralanti Unitip'), seen.map(a => a.name).join(', ') || '(gol)');

    // ── Nu vede regulile ALTEI companii ──
    await req(S, 'POST', '/api/alerts', { name: 'Viteza Compania mea', type: 'speed', imei: null, condition: { speed: 90 }, enabled: true, company_id: coA.id });
    const seen2 = (await req(U, 'GET', '/api/alerts')).body || [];
    t('nu vede regulile altei companii', !seen2.some(a => a.name === 'Viteza Compania mea'), seen2.map(a => a.name).join(', '));

    // ── Vehicul dintr-o companie + altă companie aleasă = refuzat ──
    const bad = await req(S, 'POST', '/api/alerts', { name: 'Gresit', type: 'speed', imei: IMEI_A, condition: { speed: 90 }, enabled: true, company_id: coB.id });
    t('vehicul care nu e al companiei alese → refuzat', bad.status === 400, 'status ' + bad.status + ' ' + JSON.stringify(bad.body));

    // ── „Toată platforma" rămâne posibilă, dar EXPLICIT ──
    const glob = await req(S, 'POST', '/api/alerts', { name: 'Global', type: 'speed', imei: null, condition: { speed: 130 }, enabled: true, company_id: null });
    t('regula pe toată platforma rămâne posibilă, cerută explicit', glob.status === 200 && glob.body.company_id == null, JSON.stringify(glob.body));
    const seen3 = (await req(U, 'GET', '/api/alerts')).body || [];
    t('regula globală NU apare la adminul companiei (de aceea e semnalată în interfață)',
      !seen3.some(a => a.name === 'Global'), seen3.map(a => a.name).join(', '));

    // ── Adminul de companie nu-și poate muta regula la altă companie ──
    const steal = await req(U, 'POST', '/api/alerts', { name: 'Furt', type: 'speed', imei: null, condition: { speed: 80 }, enabled: true, company_id: coA.id });
    t('adminul companiei nu poate crea reguli pentru ALTĂ companie',
      steal.status === 200 && Number(steal.body.company_id) === Number(coB.id), JSON.stringify(steal.body));

    // ── Repararea regulilor VECHI, salvate fără companie ──
    // Simulez o regulă dinainte de fix: pe un vehicul, dar cu company_id NULL. La repornirea serverului,
    // migrarea trebuie să-i pună compania vehiculului.
    const orphan = (await req(S, 'POST', '/api/alerts', { name: 'Veche pe vehicul', type: 'speed', imei: IMEI_B, condition: { speed: 100 }, enabled: true, company_id: null })).body;
    const orphanGlobal = (await req(S, 'POST', '/api/alerts', { name: 'Veche fara vehicul', type: 'speed', imei: null, condition: { speed: 100 }, enabled: true, company_id: null })).body;
    t('pregătire: două reguli fără companie', orphan && orphan.company_id == null && orphanGlobal && orphanGlobal.company_id == null);

    await kill(srv); srv = await boot(); await sleep(2500);   // repornire → rulează migrarea
    const S2 = mkJar();
    await req(S2, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    const after = (await req(S2, 'GET', '/api/alerts')).body || [];
    const fixed = after.find(a => a.id === orphan.id);
    const left = after.find(a => a.id === orphanGlobal.id);
    t('regula veche PE UN VEHICUL a primit compania vehiculului',
      fixed && Number(fixed.company_id) === Number(coB.id), JSON.stringify(fixed && fixed.company_id));
    // Regresia care a dat peste cap testul întâi: ensureTenancy rula la FIECARE pornire și, dacă exista
    // măcar un vehicul fără companie, muta în „Compania mea" toate rândurile fără companie din șapte
    // tabele — inclusiv alertele pe toată platforma. Un vehicul nou adoptat rescria tăcut reguli
    // care n-aveau nicio legătură cu el.
    t('regula veche FĂRĂ vehicul rămâne neatinsă (nu se ghicește compania)',
      left && left.company_id == null, JSON.stringify(left && left.company_id));
    const stillOrphan = (await req(S2, 'GET', '/api/devices')).body.find(d => d.imei === IMEI_X);
    t('vehiculul neasignat NU e mutat automat într-o companie la repornire',
      stillOrphan && stillOrphan.company_id == null, stillOrphan && JSON.stringify(stillOrphan.company_id));

    const U2 = mkJar();
    await req(U2, 'POST', '/api/login', { username: 'admin.unitip@test.ro', password: 'Parola123!' });
    const mine = (await req(U2, 'GET', '/api/alerts')).body || [];
    t('adminul companiei vede acum regula reparată', mine.some(a => a.id === orphan.id), mine.map(a => a.name).join(', '));

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack && e.stack.split('\n')[1]);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
