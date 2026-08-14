// verify_expirari.js — alertele de expirare a actelor devin adevărate.
//
// Trei boli reparate, fiecare cu proba ei:
//   1. Pragul era bătut în cuie la 7 zile, deși interfața promitea careDaysLead (30) în trei locuri.
//      → acum careDaysLead setat pe companie mută pragul documentelor; nesetat, rămâne 7.
//   2. Un act expirat suna O DATĂ PE ZI, LA NESFÂRȘIT (dedup implicit 20h pe un bucket fără sfârșit).
//      → acum: o alertă per prag + memento săptămânal după expirare. La fel permisele de șofer.
//   3. Un act FĂRĂ dată de expirare era sărit tăcut — proprietarul credea că e acoperit.
//      → acum compania primește UN rezumat pe săptămână: „N acte fără dată — nu ești alertat".
//
// Rulările repetate folosesc declanșatorul manual POST /api/notifications/check-expiries.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3191, TCP = 5191;
const DIR = path.join(os.tmpdir(), 'rax_exp_' + Date.now());
const B = 'http://localhost:' + PORT;
const IMEI = '860000000066601';
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
function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true', STRICT_DEVICES: 'false',
    });
    delete env.DATABASE_URL;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { p.stdout.off('data', on); setTimeout(() => resolve(p), 1200); } };
    p.stdout.on('data', on); p.stderr.on('data', () => {});
    setTimeout(() => resolve(p), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4500); });

const ziPeste = (n) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);

(async () => {
  console.log('\n══ Alertele de expirare devin adevărate ══\n');
  try {
    srv = await boot(); await sleep(3500);
    const S = jar();
    await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    const co = await req(S, 'POST', '/api/companies', { name: 'Flota Expirari SRL', slug: 'exp-' + Date.now() });
    const coId = co.body && co.body.id;
    t('companie de probă', !!coId);
    // Vehiculul intră DIRECT în companie la creare (super-adminul poate da company_id).
    // Nu prin PUT /api/devices/:imei — acela e formularul de nume/număr și, chemat doar cu
    // company_id, ștergea numele și numărul (updateDeviceInfo cu undefined). Lecție: în teste,
    // folosește ruta pe care o folosește și interfața, nu una care pare echivalentă.
    await req(S, 'POST', '/api/devices', { imei: IMEI, name: 'Camion Probe', plate: 'TM 55 EXP', company_id: coId });
    // Adminul companiei — pragurile per companie se setează prin /api/companies/me/settings,
    // de către UN OM DIN COMPANIE (exact ca în producție), nu de super-admin pe altă rută.
    await req(S, 'POST', '/api/users', { username: 'admin@expirari.ro', password: 'Curcubeu7Vara', role: 'company_admin', company_id: coId, full_name: 'Admin Expirari' });
    const CA = jar();
    const laC = await req(CA, 'POST', '/api/login', { username: 'admin@expirari.ro', password: 'Curcubeu7Vara' });
    t('adminul companiei se autentifică', laC.status === 200, 'status ' + laC.status);

    const ruleaza = () => req(S, 'POST', '/api/notifications/check-expiries');
    const notificari = async (filtru) => {
      const r = await req(S, 'GET', '/api/notifications?limit=100');
      const list = Array.isArray(r.body) ? r.body : (r.body && r.body.rows) || [];
      return list.filter(n => n.type === 'document_expiry' && (!filtru || JSON.stringify(n).includes(filtru)));
    };

    // ── 1. Implicitul neschimbat: act care expiră în 15 zile → NIMIC (pragul implicit e 7) ──
    await req(S, 'POST', '/api/documents', { imei: IMEI, doc_type: 'RCA', expiry_date: ziPeste(15), issuer: 'OMNIASIG' });
    let r1 = await ruleaza();
    t('declanșatorul manual răspunde', r1.status === 200, 'status ' + r1.status);
    await sleep(1200);
    t('15 zile + prag implicit (7) → nicio alertă', (await notificari('RCA')).length === 0,
      JSON.stringify((await notificari('RCA')).map(n => n.title)));

    // ── 2. careDaysLead=30 pe companie → același act ALERTEAZĂ acum ──
    const setat = await req(CA, 'PUT', '/api/companies/me/settings', { alert_thresholds: { careDaysLead: 30 } });
    t('careDaysLead=30 setat pe companie', setat.status === 200, 'status ' + setat.status);
    await ruleaza(); await sleep(1200);
    const dupaPrag = await notificari('RCA');
    t('cu careDaysLead=30, actul la 15 zile ALERTEAZĂ', dupaPrag.length === 1, 'găsite: ' + dupaPrag.length);

    // ── 3. Dedup: a doua rulare NU dublează ──
    await ruleaza(); await sleep(1200);
    t('a doua rulare nu dublează alerta (dedup pe banda lead)', (await notificari('RCA')).length === 1,
      'găsite: ' + (await notificari('RCA')).length);

    // ── 4. Act EXPIRAT → o alertă, iar rulările următoare NU o repetă (memento e la 7 zile) ──
    await req(S, 'POST', '/api/documents', { imei: IMEI, doc_type: 'ITP', expiry_date: ziPeste(-10) });
    await ruleaza(); await sleep(1200);
    const exp1 = await notificari('ITP');
    t('actul expirat alertează (critic)', exp1.length === 1 && exp1[0].severity === 'critical',
      'găsite: ' + exp1.length + ' sev: ' + (exp1[0] && exp1[0].severity));
    await ruleaza(); await sleep(800); await ruleaza(); await sleep(1200);
    t('încă două rulări → tot O alertă (nu una pe zi, la nesfârșit)', (await notificari('ITP')).length === 1,
      'găsite: ' + (await notificari('ITP')).length);

    // ── 5. Act fără dată → rezumat vizibil, nu tăcere ──
    await req(S, 'POST', '/api/documents', { imei: IMEI, doc_type: 'CASCO' });   // fără expiry_date
    await ruleaza(); await sleep(1200);
    const faraData = await notificari('fără dată');
    t('actul fără dată produce rezumatul „nu ești alertat"', faraData.length === 1, 'găsite: ' + faraData.length);
    t('rezumatul numește actul și vehiculul', faraData.length && /CASCO/.test(faraData[0].body) && /TM 55 EXP/.test(faraData[0].body),
      faraData.length ? faraData[0].body.slice(0, 120) : '(lipsă)');
    await ruleaza(); await sleep(1200);
    t('rezumatul nu se repetă la fiecare rulare (săptămânal)', (await notificari('fără dată')).length === 1,
      'găsite: ' + (await notificari('fără dată')).length);

    // ── 6. Permisul de șofer: aceeași disciplină ──
    await req(S, 'POST', '/api/drivers', { name: 'Ion Probă', license_number: 'B123', license_expiry: ziPeste(-5), company_id: coId });
    await ruleaza(); await sleep(800); await ruleaza(); await sleep(1200);
    const drv = await notificari('Permis');
    t('permis expirat → O alertă după două rulări, nu două', drv.length === 1, 'găsite: ' + drv.length);

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
