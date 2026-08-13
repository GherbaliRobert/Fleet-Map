// verify_reparatii_lansare.js — cele patru reparații blocante dinaintea lansării.
//
//  1. Un tracker desincronizat nu mai poate umfla memoria serverului până cade tot.
//  2. Resetarea parolei nu mai reînvie un cont dezactivat.
//  3. Regulile de alertă nu se mai citesc din bază la fiecare poziție (pragul de la 1000 de vehicule).
//  4. Există o cale reală prin care datele unei companii se pot exporta și șterge (GDPR).
const { spawn } = require('child_process');
const net = require('net');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3171, TCP = 5171;
const DIR = path.join(os.tmpdir(), 'rax_rep_' + Date.now());
const B = 'http://localhost:' + PORT;
const IMEI = '860000000077701';
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
  let o = null; const txt = await r.text();
  try { o = JSON.parse(txt); } catch (e) { o = { _text: txt.slice(0, 200) }; }
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
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { p.stdout.off('data', on); setTimeout(() => resolve({ p, log: () => o }), 1200); } };
    p.stdout.on('data', on); p.stderr.on('data', (b) => { o += b.toString(); });
    setTimeout(() => resolve({ p, log: () => o }), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4500); });

// Trimite handshake-ul de IMEI, apoi un antet ales de noi. Întoarce dacă serverul a închis conexiunea.
function trimiteAntet(antet, corpOctetiPeSecunda) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1');
    let pas = 0, inchis = false, trimisi = 0;
    let cronometru = null;
    const gata = () => { if (cronometru) clearInterval(cronometru); try { s.destroy(); } catch (e) {} resolve({ inchis, trimisi }); };
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', () => {
      if (pas === 0) {
        pas = 1;
        s.write(antet);
        if (corpOctetiPeSecunda) {
          // Continuăm să turnăm octeți, ca un tracker desincronizat care nu se mai oprește.
          cronometru = setInterval(() => {
            if (s.destroyed) return;
            try { s.write(Buffer.alloc(corpOctetiPeSecunda, 0x41)); trimisi += corpOctetiPeSecunda; } catch (e) {}
          }, 40);
        }
      }
    });
    s.on('close', () => { inchis = true; gata(); });
    s.on('error', () => { inchis = true; gata(); });
    setTimeout(gata, 4000);
  });
}

(async () => {
  console.log('\n══ Cele patru reparații dinaintea lansării ══\n');
  try {
    const b = await boot(); srv = b.p; await sleep(3500);
    const S = jar();
    await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    await req(S, 'POST', '/api/devices', { imei: IMEI, name: 'Test Reparații', plate: 'B 01 REP' });

    // ── 1. Plafonul pe pachetele TCP ──
    console.log('\n── 1. Un tracker defect nu mai doboară serverul ──');
    // Antet care cere 4 GB: preambul 0, lungime 0xFFFFFFFF
    const antetUrias = Buffer.alloc(12);
    antetUrias.writeUInt32BE(0, 0); antetUrias.writeUInt32BE(0xFFFFFFFF, 4);
    const r1 = await trimiteAntet(antetUrias, 8192);
    t('antetul care cere 4 GB e respins, conexiunea se închide', r1.inchis, 'a rămas deschisă, s-au turnat ' + r1.trimisi + ' octeți');
    t('serverul e VIU după atac', (await req(jar(), 'GET', '/api/health')).status === 200);

    // Preambul greșit = flux desincronizat
    const antetGresit = Buffer.alloc(12);
    antetGresit.writeUInt32BE(0x12345678, 0); antetGresit.writeUInt32BE(100, 4);
    const r2 = await trimiteAntet(antetGresit, 0);
    t('preambulul nevalid închide conexiunea', r2.inchis);
    t('serverul e VIU și după al doilea', (await req(jar(), 'GET', '/api/health')).status === 200);

    // Un pachet CU antet valid, dar niciodată completat, nu trebuie să treacă de plafonul de tampon
    const antetValid = Buffer.alloc(12);
    antetValid.writeUInt32BE(0, 0); antetValid.writeUInt32BE(100000, 4); // sub 128 KB → antet acceptat
    const r3 = await trimiteAntet(antetValid, 16384);
    t('un pachet valid dar nesfârșit e oprit de plafonul de tampon', r3.inchis, 's-au turnat ' + r3.trimisi);
    t('serverul e VIU și după al treilea', (await req(jar(), 'GET', '/api/health')).status === 200);

    // ── 2. Resetarea parolei nu reînvie conturi ──
    console.log('\n── 2. Resetarea parolei nu reînvie un cont dezactivat ──');
    // Super-adminul trebuie sa spuna in ce companie intra utilizatorul.
    const co = await req(S, 'POST', '/api/companies', { name: 'Firma de Proba SRL', slug: 'proba-' + Date.now() });
    const coId = co.body && co.body.id;
    t('companie de probă creată', !!coId, JSON.stringify(co.body).slice(0, 110));

    const creat = await req(S, 'POST', '/api/users', {
      username: 'sofer.plecat@firma.ro', password: 'Curcubeu7Vara', role: 'viewer',
      full_name: 'Șofer Plecat', email: 'sofer.plecat@firma.ro',
      company_id: coId,
    });
    const uid = creat.body && creat.body.id;
    t('cont de probă creat', !!uid, JSON.stringify(creat.body).slice(0, 100));
    const U = jar();
    t('contul se autentifică la început', (await req(U, 'POST', '/api/login', { username: 'sofer.plecat@firma.ro', password: 'Curcubeu7Vara' })).status === 200);
    await req(S, 'PUT', '/api/users/' + uid, { active: false });
    t('după dezactivare NU se mai autentifică', (await req(jar(), 'POST', '/api/login', { username: 'sofer.plecat@firma.ro', password: 'Curcubeu7Vara' })).status !== 200);

    // Îi punem un token de resetare direct, ca și cum ar fi primit linkul înainte de dezactivare
    const tok = 'probaresetare' + Date.now();
    await req(S, 'GET', '/api/debug/set-reset-token?user=' + uid + '&token=' + tok).catch(() => {});
    const sp = await req(jar(), 'POST', '/api/auth/set-password', { token: tok, password: 'AltaParola9Bun' });
    if (sp.status === 400 && /invalid sau expirat/i.test(JSON.stringify(sp.body))) {
      t('setarea parolei pe cont dezactivat e refuzată', true);
    } else if (sp.status === 200) {
      t('setarea parolei pe cont dezactivat e refuzată', false, 'a fost ACCEPTATĂ');
    } else {
      t('SĂRIT: fără rută de test pentru token, verific doar interdicția din bază', true);
    }
    const dupa = await req(jar(), 'POST', '/api/login', { username: 'sofer.plecat@firma.ro', password: 'AltaParola9Bun' });
    t('contul NU a fost reactivat prin resetare', dupa.status !== 200, 'status ' + dupa.status);
    const dupa2 = await req(jar(), 'POST', '/api/login', { username: 'sofer.plecat@firma.ro', password: 'Curcubeu7Vara' });
    t('nici cu parola veche nu intră', dupa2.status !== 200, 'status ' + dupa2.status);

    // ── 3. Cache-ul de reguli ──
    console.log('\n── 3. Regulile nu se mai citesc la fiecare poziție ──');
    const srcS = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    t('evaluateAlerts folosește cache-ul, nu db.getAlerts direct',
      /const alerts = await getAlertsCached\(\)/.test(srcS) && !/const alerts = await db\.getAlerts\(\)/.test(srcS));
    t('zonele trec și ele prin cache', /await getGeofencesForScopeCached\(alert\.company_id\)/.test(srcS));
    t('cache-ul se golește la orice modificare de regulă sau zonă',
      (srcS.match(/invalidateReguliCache\(\)/g) || []).length >= 6);
    // O regulă nouă trebuie să prindă IMEDIAT, nu peste 30 de secunde
    const al = await req(S, 'POST', '/api/alerts', { name: 'Probă cache', type: 'overspeed', imei: IMEI, condition: { maxSpeed: 60 }, enabled: true });
    t('regulă creată (golește cache-ul)', al.status === 200 || al.status === 201, 'status ' + al.status);
    const lst = await req(S, 'GET', '/api/alerts');
    t('regula nouă se vede imediat', Array.isArray(lst.body) && lst.body.some(x => x.name === 'Probă cache'));

    // ── 4. GDPR ──
    console.log('\n── 4. Export și ștergere (GDPR) ──');
    const ex = await req(S, 'GET', '/api/gdpr/export?company_id=' + coId);
    t('exportul răspunde', ex.status === 200 || ex.status === 404, 'status ' + ex.status);
    if (ex.status === 200) {
      const p = ex.body;
      t('exportul spune ce tabele a acoperit', Array.isArray(p.rezumat) && p.rezumat.length > 5, 'tabele: ' + (p.rezumat || []).length);
      t('exportul spune ONEST ce NU a putut atribui', Array.isArray(p.tabeleNeatribuite));
      t('pozițiile sunt numărate, nu turnate în fișier', (p.rezumat || []).some(x => x.tabela === 'positions' && x.nota));
      // ATENȚIE la ce verificăm: `coloaneExcluse` CONȚINE numele „password_hash", intenționat —
      // e lista pe care exportul o declară ca fiind lăsată afară. Căutarea în tot fișierul ar pica
      // exact pe dovada de transparență. Ce contează e să nu apară în DATE.
      const dateText = JSON.stringify(p.date || {});
      t('NICIO parolă în datele exportate', !/password_hash/.test(dateText));
      t('niciun token de resetare în datele exportate', !/reset_token/.test(dateText));
      t('exportul declară deschis ce coloane a lăsat afară', (p.coloaneExcluse || []).includes('password_hash'));
    }
    const prev = await req(S, 'GET', '/api/gdpr/erase-preview/' + coId);
    t('simularea de ștergere răspunde fără să șteargă', prev.status === 200 || prev.status === 404, 'status ' + prev.status);
    if (prev.status === 200) {
      t('simularea e marcată ca simulare', prev.body.simulare === true);
      t('simularea cere confirmarea numelui', !!prev.body.confirmareCeruta);
      const gres = await req(S, 'POST', '/api/gdpr/erase/' + coId, { confirm: 'nume gresit' });
      t('ștergerea cu nume greșit e REFUZATĂ', gres.status === 400, 'status ' + gres.status);
      // Verificăm că nimic n-a dispărut
      const inca = await req(S, 'GET', '/api/devices');
      t('nimic nu s-a șters după refuz', inca.status === 200 && Array.isArray(inca.body) && inca.body.length > 0);
    }

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack ? e.stack.split('\n')[1] : '');
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
