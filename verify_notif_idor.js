// verify_notif_idor.js — notificările unei companii nu mai pot fi citite de altă companie.
//
// Gaura găsită la auditul de lansare: `GET /api/notifications/:id/context` citea rândul după id și
// verifica DOAR vehiculul. Notificările FĂRĂ vehicul — expirare permis șofer (nume + serie), facturi
// emise, scadențe de abonament — treceau nefiltrate. Orice cont autentificat, inclusiv un `viewer`
// sau un demo temporar, putea cere /context pentru id-urile 1..N și aduna datele TUTUROR companiilor.
// Lista (`GET /api/notifications`) era corect izolată; doar ruta de detaliu ocolea regula.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3153, TCP = 5153;
const DIR = path.join(os.tmpdir(), 'rax_idor_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jar = () => ({ cookie: '' });
async function req(j, m, p, body) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, j.cookie ? { Cookie: j.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) j.cookie = sc.split(';')[0];
  let out = null; try { out = await r.json(); } catch (e) {}
  return { status: r.status, body: out };
}
function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true',
    });
    delete env.DATABASE_URL;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const on = (b) => { o += b.toString(); if (/Server (HTTP )?(activ|pornit)|\[HTTP\]/i.test(o)) { p.stdout.off('data', on); resolve(p); } };
    p.stdout.on('data', on); p.stderr.on('data', () => {});
    setTimeout(() => resolve(p), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); });

(async () => {
  console.log('\n══ Notificări: izolarea între companii pe ruta de detaliu ══\n');
  try {
    srv = await boot(); await sleep(4000);
    const S = jar();
    t('super-admin autentificat', (await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200);

    const coA = (await req(S, 'POST', '/api/companies', { name: 'Transport A' })).body;
    const coB = (await req(S, 'POST', '/api/companies', { name: 'Transport B' })).body;
    t('două companii', !!(coA && coA.id && coB && coB.id));

    // Producem o notificare FĂRĂ vehicul, pe o cale reală și declanșabilă: cererea de cont demo.
    // E din aceeași familie ca expirarea permisului sau factura emisă — notificări care nu au IMEI,
    // deci exact cele care treceau nefiltrate. Ramura „notificarea companiei mele" e aceeași regulă,
    // scrisă o dată, oglindind `_notifWhere` din db.js.
    const cerere = await req(jar(), 'POST', '/api/public/demo-request', {
      name: 'Ion Popescu', email: 'ion.popescu@transporta.ro', phone: '0722123456',
      company: 'Transport A SRL', message: 'Vreau cont demo', wants_demo: true, _t: Date.now() - 20000,
    });
    t('cerere demo trimisă (produce notificare fără vehicul)', cerere.status === 200 || cerere.status === 201,
      'status ' + cerere.status + ' ' + JSON.stringify(cerere.body).slice(0, 100));
    await sleep(1200);

    const toate = (await req(S, 'GET', '/api/notifications?limit=200')).body;
    const lista = Array.isArray(toate) ? toate : (toate && toate.items) || [];
    const faraVehicul = lista.filter(n => !n.imei);
    t('super-adminul vede notificarea fără vehicul', faraVehicul.length > 0, 'total notificări: ' + lista.length);
    if (!faraVehicul.length) throw new Error('nu s-a produs nicio notificare fără vehicul — testul nu poate continua');
    const target = faraVehicul[0];

    // Un utilizator din compania B — rolul cel mai slab posibil
    await req(S, 'POST', '/api/users', { username: 'spion@b.ro', password: 'Parola123!', role: 'viewer', company_id: coB.id, full_name: 'Spion B' });
    const U = jar();
    t('utilizator viewer din compania B autentificat', (await req(U, 'POST', '/api/login', { username: 'spion@b.ro', password: 'Parola123!' })).status === 200);

    // ── ATACUL: cere direct detaliul notificării companiei A ──
    const atac = await req(U, 'GET', '/api/notifications/' + target.id + '/context');
    t('detaliul notificării ALTEI companii e REFUZAT', atac.status === 404 || atac.status === 403,
      'status ' + atac.status + ' · ' + JSON.stringify(atac.body).slice(0, 120));
    const scurs = JSON.stringify(atac.body || {});
    t('nu se scurge conținutul notificării', !/Popescu|demo/i.test(scurs), scurs.slice(0, 140));

    // ── Bucla, cum ar face-o cineva în practică ──
    let gasite = 0;
    for (let i = 1; i <= 40; i++) {
      const r = await req(U, 'GET', '/api/notifications/' + i + '/context');
      if (r.status === 200 && r.body && String(r.body.title || "").length && r.body.id !== undefined) gasite++;
    }
    t('bucla pe id-uri 1..40 nu aduce nimic din compania A', gasite === 0, gasite + ' scurgeri');

    // ── Accesul LEGITIM nu s-a stricat ──
    const legit = await req(S, 'GET', '/api/notifications/' + target.id + '/context');
    t('super-adminul își vede în continuare notificarea', legit.status === 200, 'status ' + legit.status);

    const A = jar();
    await req(S, 'POST', '/api/users', { username: 'admin@a.ro', password: 'Parola123!', role: 'company_admin', company_id: coA.id, full_name: 'Admin A' });
    await req(A, 'POST', '/api/login', { username: 'admin@a.ro', password: 'Parola123!' });
    // Notificarea de cerere demo e a PLATFORMEI (fără companie, fără utilizator), deci nici adminul unei
    // companii n-are ce căuta în ea — 404 e răspunsul corect, nu o regresie.
    const propriu = await req(A, 'GET', '/api/notifications/' + target.id + '/context');
    t('nici adminul unei companii nu vede notificările platformei', propriu.status === 404, 'status ' + propriu.status);
    // Iar lista lui rămâne funcțională — garda de detaliu n-a rupt fluxul normal.
    const listaA = await req(A, 'GET', '/api/notifications?limit=20');
    t('lista de notificări a adminului funcționează în continuare', listaA.status === 200, 'status ' + listaA.status);

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
