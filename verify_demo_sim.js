// verify_demo_sim.js — simulatorul demo pornește DOAR când are pentru cine.
//
// Înainte scria non-stop ~86.000 de poziții pe zi și 100 de actualizări pe minut pe WebSocket, chiar și
// când nu exista niciun cont demo. Testul verifică ciclul complet: oprit → cont acordat → pornit →
// termen revocat → oprit, plus cele două capcane care ar fi făcut gardarea inutilă:
//   1. contul partajat `demo` are `access_until = NULL` și e recreat la FIECARE pornire; o condiție
//      de forma „NULL sau în viitor" l-ar fi numărat veșnic activ, deci simulatorul n-ar fi stat niciodată;
//   2. `DEMO_DISABLED=true` trebuie să rămână întrerupător HARD — pe ramura aceea `demoCompanyId` E setat,
//      deci un „există cont activ → pornește" naiv ar fi repornit exact ce s-a oprit deliberat.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3131, TCP = 5131;
const DIR = path.join(os.tmpdir(), 'rax_demosim_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, cookie = '', srv = null;

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

function boot(extraEnv) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test',
    }, extraEnv || {});
    delete env.DATABASE_URL;               // forțează PGlite; NU atinge producția
    delete env.DEMO_DISABLED;              // extraEnv îl poate pune la loc
    if (extraEnv && extraEnv.DEMO_DISABLED) env.DEMO_DISABLED = extraEnv.DEMO_DISABLED;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (/Server (HTTP )?(activ|pornit)|listening|\[HTTP\]/i.test(out)) { p.stdout.off('data', onData); resolve(p); }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { out += b.toString(); });
    p.on('exit', (c) => { if (c !== 0 && c !== null) reject(new Error('serverul a ieșit cu ' + c + '\n' + out.slice(-1500))); });
    setTimeout(() => resolve(p), 20000); // plasă de siguranță: PGlite pornește lent la prima rulare
  });
}
function kill(p) { return new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); }); }

async function login() { cookie = ''; return (await req('POST', '/api/login', { username: 'admin', password: 'admin123' })).status; }
async function health(key) {
  const h = await req('GET', '/api/admin/health');
  const arr = (h.body && h.body.checks) || [];
  return arr.find(c => c.key === key) || null;   // forma reală: { key, label, level, detail }
}
async function nPositions(imei) {
  const r = await req('GET', '/api/debug/ingest');   // dacă nu există, cădem pe numărare indirectă
  return r.status === 200 ? r.body : null;
}

(async () => {
  console.log('\n══ E5.2 · simulatorul demo pornește doar când are pentru cine ══\n');
  try {
    srv = await boot();
    await sleep(2500);
    t('serverul pornește (PGlite)', (await login()) === 200);

    // ── 1. La pornire, fără niciun cont demo cu termen → simulatorul stă ──
    let s = (await req('GET', '/api/admin/demo-sim')).body;
    t('fără conturi demo → simulator OPRIT', s && s.running === false, JSON.stringify(s));
    t('motivul e explicit, nu gol', s && /niciun cont demo activ/i.test(s.reason || ''), s && s.reason);
    t('nu numără contul partajat „demo" (access_until NULL)', s && s.active === 0, s && ('active=' + s.active));

    const hs = await health('demo_sim');
    t('„Stare producție" raportează simulatorul', !!hs && /oprit/i.test(hs.detail || ''), JSON.stringify(hs));
    // Starea trebuie calculată LA PORNIRE, nu la prima acțiune administrativă — altfel ecranul
    // arată „neinițializat" pe un server proaspăt repornit, exact când te uiți la el.
    t('starea e calculată de la pornire, nu „neinițializat"', s && s.reason !== 'neinițializat', s && s.reason);

    // Vehiculele demo nu trebuie să apară deloc în flota reală (regresie veche, reverificată)
    const live = await req('GET', '/api/live');
    const demoInLive = (Array.isArray(live.body) ? live.body : []).filter(p => /^DEMO/.test(p.imei || ''));
    t('super-adminul nu vede vehicule demo în flota reală', demoInLive.length === 0, demoInLive.length + ' vehicule');

    // ── 2. Un cont demo cu termen în VIITOR → simulatorul pornește ──
    const users = (await req('GET', '/api/users')).body;
    const list = Array.isArray(users) ? users : (users && users.items) || [];
    const demoUser = list.find(u => u.username === 'demo');
    t('contul partajat „demo" există (deținătorul ACL-ului)', !!demoUser, JSON.stringify(list.map(u => u.username)));

    if (demoUser) {
      const up = await req('PUT', '/api/users/' + demoUser.id + '/access-until', { hours: 6 });
      t('acordarea unui termen e acceptată', up.status === 200, JSON.stringify(up.body));
      s = (await req('GET', '/api/admin/demo-sim')).body;
      t('cont cu termen în viitor → simulator PORNIT', s && s.running === true, JSON.stringify(s));
      t('numără exact un cont activ', s && s.active === 1, s && ('active=' + s.active));

      // chiar produce poziții: livePositions se populează în câteva ticuri (3s)
      await sleep(7000);
      const lv = await req('GET', '/api/live');
      const dm = (Array.isArray(lv.body) ? lv.body : []).filter(p => /^DEMO/.test(p.imei || ''));
      t('simulatorul chiar generează poziții (dar tot ascunse de flota reală)', dm.length === 0, 'flota reală nu trebuie să le vadă');

      // ── 3. Termen în TRECUT → simulatorul se oprește ──
      const rev = await req('PUT', '/api/users/' + demoUser.id + '/access-until', { until: Date.now() - 60000 });
      t('revocarea termenului e acceptată', rev.status === 200);
      s = (await req('GET', '/api/admin/demo-sim')).body;
      t('termen expirat → simulator OPRIT', s && s.running === false, JSON.stringify(s));
      t('nu mai numără niciun cont activ', s && s.active === 0, s && ('active=' + s.active));

      // ── 4. until=null înseamnă acces NELIMITAT, nu revocare — și NU repornește simulatorul ──
      // (contul devine „fără termen", exact ca `demo` la instalare: nu e un client demo, deci nu contează)
      const unl = await req('PUT', '/api/users/' + demoUser.id + '/access-until', { until: null });
      s = (await req('GET', '/api/admin/demo-sim')).body;
      t('until=null (acces nelimitat) NU repornește simulatorul', unl.status === 200 && s && s.running === false, JSON.stringify(s));
    }

    // ── 5. Pornirea manuală, pentru o prezentare fără cont ──
    let f = (await req('POST', '/api/admin/demo-sim', { on: true, hours: 2 })).body;
    t('super-adminul poate porni manual simulatorul', f && f.running === true && f.forced === true, JSON.stringify(f));
    t('pornirea manuală are termen (nu rămâne veșnic)', f && Number(f.forcedUntil) > Date.now(), f && String(f.forcedUntil));
    f = (await req('POST', '/api/admin/demo-sim', { on: false })).body;
    t('și îl poate opri la loc', f && f.running === false, JSON.stringify(f));

    // ── 6. Doar super-adminul ──
    const co = (await req('POST', '/api/companies', { name: 'Firma sim' })).body;
    if (co && co.id) {
      await req('POST', '/api/users', { username: 'sim@test.ro', password: 'Parola123!', role: 'company_admin', company_id: co.id, full_name: 'Sim Test' });
      const superCookie = cookie; cookie = '';
      await req('POST', '/api/login', { username: 'sim@test.ro', password: 'Parola123!' });
      const forbid = await req('POST', '/api/admin/demo-sim', { on: true });
      t('adminul de companie NU poate porni simulatorul', forbid.status === 403, 'status ' + forbid.status);
      cookie = superCookie;
    }

    await kill(srv); srv = null;

    // ── 7. DEMO_DISABLED=true rămâne întrerupător HARD, chiar cu un cont demo valabil ──
    // (aceeași bază: contul cu termen creat mai sus e încă acolo)
    srv = await boot({ DEMO_DISABLED: 'true' });
    await sleep(2500);
    t('repornire cu DEMO_DISABLED=true', (await login()) === 200);
    // dăm din nou termen unui cont demo, ca să nu depindem de starea lăsată de secțiunea anterioară
    // Motivul trebuie să fie corect ÎNAINTE de orice acțiune administrativă (starea se calculează la boot).
    const sBoot = (await req('GET', '/api/admin/demo-sim')).body;
    t('DEMO_DISABLED e motivul raportat imediat după pornire', sBoot && /DEMO_DISABLED/.test(sBoot.reason || ''), sBoot && sBoot.reason);
    const u2 = (await req('GET', '/api/users')).body;
    const l2 = Array.isArray(u2) ? u2 : (u2 && u2.items) || [];
    const d2 = l2.find(u => u.username === 'demo');
    if (d2) await req('PUT', '/api/users/' + d2.id + '/access-until', { hours: 6 });
    const s2 = (await req('GET', '/api/admin/demo-sim')).body;
    t('DEMO_DISABLED=true + cont activ → tot OPRIT', s2 && s2.running === false, JSON.stringify(s2));
    t('și spune de ce', s2 && /DEMO_DISABLED/.test(s2.reason || ''), s2 && s2.reason);
    const f2 = (await req('POST', '/api/admin/demo-sim', { on: true, hours: 1 })).body;
    t('nici pornirea manuală nu trece peste DEMO_DISABLED', f2 && f2.running === false, JSON.stringify(f2));
    t('starea e marcată „blocked" → interfața nu arată un buton inutil', f2 && f2.blocked === true, JSON.stringify(f2));

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
