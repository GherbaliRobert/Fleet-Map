// verify_admin_retras.js — contul de instalare „admin" se retrage singur, dar NU vă închide afară.
//
// Decizie 2026-08-11 (Robert): contul „admin" nu mai trebuie să funcționeze. E un cont cu nume
// previzibil, cunoscut public din documentația de deploy, care administrează TOATE companiile.
//
// Riscul evident al unei asemenea cereri e blocarea proprietarului în afara propriei platforme.
// De aceea retragerea are O SINGURĂ condiție: să existe alt super-admin ACTIV. Testul verifică
// ambele fețe — că se retrage când trebuie, și că NU se retrage când ar rămâne nimeni.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3163, TCP = 5163;
const DIR = path.join(os.tmpdir(), 'rax_adm_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jar = () => ({ cookie: '' });
async function req(j, m, p, body) {
  const r = await fetch(B + p, {
    method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, j.cookie ? { Cookie: j.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) j.cookie = sc.split(';')[0];
  let o = null; try { o = await r.json(); } catch (e) {}
  return { status: r.status, body: o };
}
// Aceeași bază între reporniri (PGLITE_DIR fix) — altfel n-am putea testa efectul asupra unei
// platforme deja instalate, care e exact situația din producție.
function boot(env2) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      NODE_ENV: 'test', DEMO_DISABLED: 'true', ADMIN_PASSWORD: 'admin123',
    }, env2 || {});
    delete env.DATABASE_URL;
    if (env2 && env2._faraAdminPass) delete env.ADMIN_PASSWORD;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { p.stdout.off('data', on); setTimeout(() => resolve({ p, log: () => o }), 1200); } };
    p.stdout.on('data', on); p.stderr.on('data', (b) => { o += b.toString(); });
    setTimeout(() => resolve({ p, log: () => o }), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4500); });

(async () => {
  console.log('\n══ Contul de instalare „admin" se retrage ══\n');
  try {
    // ── Prima pornire: platformă nouă, „admin" e singurul super-admin ──
    let b = await boot(); srv = b.p; await sleep(3500);
    const S = jar();
    t('la instalare, „admin" funcționează (e singurul super-admin)',
      (await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200);
    t('serverul avertizează că „admin" e încă activ', /ÎNCĂ activ|se va retrage/i.test(b.log()), '(fără avertisment în log)');

    // Îmi fac contul personal de super-admin, exact ca fondatorii
    const creat = await req(S, 'POST', '/api/users', {
      username: 'robert@unitip.ro', password: 'Curcubeu7Vara', role: 'superadmin', full_name: 'Robert G',
    });
    t('cont personal de super-admin creat', creat.status === 200 || creat.status === 201,
      'status ' + creat.status + ' ' + JSON.stringify(creat.body).slice(0, 110));
    const P = jar();
    t('contul personal se autentifică', (await req(P, 'POST', '/api/login', { username: 'robert@unitip.ro', password: 'Curcubeu7Vara' })).status === 200);

    // ── A doua pornire: acum EXISTĂ alt super-admin → „admin" trebuie să se retragă ──
    // Pornim FĂRĂ ADMIN_PASSWORD: variabila e calea de recuperare, ar ține contul în viață intenționat.
    await kill(srv);
    b = await boot({ _faraAdminPass: true }); srv = b.p; await sleep(3500);
    t('serverul anunță retragerea contului de instalare', /DEZACTIVAT/i.test(b.log()), '(fără anunț în log)');

    const dupa = await req(jar(), 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    t('„admin" NU se mai poate autentifica', dupa.status !== 200, 'status ' + dupa.status + ' ' + JSON.stringify(dupa.body).slice(0, 80));

    const P2 = jar();
    const eu = await req(P2, 'POST', '/api/login', { username: 'robert@unitip.ro', password: 'Curcubeu7Vara' });
    t('contul personal funcționează în continuare', eu.status === 200, 'status ' + eu.status);
    const me = await req(P2, 'GET', '/api/me');
    t('și are în continuare drepturi de super-admin', !!(me.body && me.body.isSuper), JSON.stringify(me.body && me.body.role));

    // ── Recuperarea de avarie: ADMIN_PASSWORD readuce contul ──
    await kill(srv);
    b = await boot({ ADMIN_PASSWORD: 'Recuperare9Acum' }); srv = b.p; await sleep(3500);
    const rec = await req(jar(), 'POST', '/api/login', { username: 'admin', password: 'Recuperare9Acum' });
    t('ADMIN_PASSWORD readuce contul (cale de avarie)', rec.status === 200, 'status ' + rec.status);

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
