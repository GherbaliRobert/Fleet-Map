// verify_auth_hardening.js — cele trei reparații de autentificare din auditul de lansare.
//
// 1. Parola implicită `admin123` pentru contul de super-admin al platformei. Era scrisă public în
//    documentația de deploy, iar contul vede TOATE companiile. Acum: fără implicit — dacă
//    ADMIN_PASSWORD lipsește, se generează una aleatoare, tipărită o singură dată la pornire.
// 2. Patru praguri diferite de parolă (4, 4, 4 și 6 caractere), fără nicio verificare de conținut:
//    un client își putea face cont cu „1234". Acum: o singură regulă, în toate cele patru locuri.
// 3. Antetul CF-Connecting-IP era crezut pe cuvânt. Oricine îl trimite își alege singur „IP-ul" și
//    scapă de limitarea la forța brută. Acum se acceptă doar cu TRUST_CF_IP=true.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3157, TCP = 5157;
const DIR = path.join(os.tmpdir(), 'rax_auth_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jar = () => ({ cookie: '' });
async function req(j, m, p, body, extra) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, j.cookie ? { Cookie: j.cookie } : {}, extra || {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) j.cookie = sc.split(';')[0];
  let out = null; try { out = await r.json(); } catch (e) {}
  return { status: r.status, body: out };
}
// Pornim FĂRĂ NODE_ENV=test, ca să vedem comportamentul REAL de producție la parola de admin.
function boot(env2) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, DEMO_DISABLED: 'true',
    }, env2 || {});
    delete env.DATABASE_URL; delete env.ADMIN_PASSWORD; delete env.NODE_ENV;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { setTimeout(() => resolve({ p, log: () => o }), 1200); p.stdout.off('data', on); } };
    p.stdout.on('data', on); p.stderr.on('data', (b) => { o += b.toString(); });
    setTimeout(() => resolve({ p, log: () => o }), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); });

(async () => {
  console.log('\n══ Întărirea autentificării ══\n');
  let boota = null;
  try {
    boota = await boot(); srv = boota.p; await sleep(4000);

    // ── 1. Parola implicită a dispărut ──
    const vechi = await req(jar(), 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    t('parola publică „admin123" NU mai merge', vechi.status !== 200, 'status ' + vechi.status);

    const log = boota.log();
    const m = /PAROLA CONTULUI[\s\S]*?\n\s{2}([A-Za-z0-9_-]{20,})\s*\n/.exec(log);
    t('s-a generat o parolă aleatoare, tipărită o singură dată', !!m, m ? '(lungime ' + m[1].length + ')' : 'nu apare în log');
    if (!m) throw new Error('fără parola generată nu pot continua');
    const S = jar();
    const cuNoua = await req(S, 'POST', '/api/login', { username: 'admin', password: m[1] });
    t('parola generată chiar funcționează', cuNoua.status === 200, 'status ' + cuNoua.status);

    // ── 2. Politica de parole, pe toate căile ──
    const co = (await req(S, 'POST', '/api/companies', { name: 'Firma Test' })).body;
    const slabe = [
      ['1234', 'prea scurtă'],
      ['parola', 'prea scurtă'],
      ['parola123', 'prea cunoscută'],
      ['aaaaaaaaaaaa', 'un singur caracter repetat'],
      ['abcdefghijkl', 'doar litere mici'],
      ['0123456789', 'secvență de tastatură'],
    ];
    let respinse = 0;
    for (const [p, de_ce] of slabe) {
      const r = await req(S, 'POST', '/api/users', { username: 'u' + Math.round(p.length * 97) + '@t.ro', password: p, role: 'viewer', company_id: co.id, full_name: 'Test User' });
      if (r.status === 400) respinse++;
      else console.log('      ⚠ acceptată: „' + p + '" (' + de_ce + ')');
    }
    t('toate parolele slabe sunt respinse la crearea contului', respinse === slabe.length, respinse + '/' + slabe.length);

    const cuNume = await req(S, 'POST', '/api/users', { username: 'ionpopescu@t.ro', password: 'ionpopescu99', role: 'viewer', company_id: co.id, full_name: 'Ion Popescu' });
    t('parola care conține numele de utilizator e respinsă', cuNume.status === 400, 'status ' + cuNume.status);

    const buna = await req(S, 'POST', '/api/users', { username: 'bun@t.ro', password: 'Curcubeu7Vara', role: 'viewer', company_id: co.id, full_name: 'Om Bun' });
    t('o parolă rezonabilă e ACCEPTATĂ (nu am blocat oamenii)', buna.status === 200 || buna.status === 201, 'status ' + buna.status + ' ' + JSON.stringify(buna.body).slice(0, 90));
    const uid = buna.body && buna.body.id;

    const schimb = await req(S, 'POST', '/api/users/' + uid + '/password', { password: '1234' });
    t('aceeași regulă se aplică și la SCHIMBAREA parolei', schimb.status === 400, 'status ' + schimb.status);

    const nouLogin = await req(jar(), 'POST', '/api/login', { username: 'bun@t.ro', password: 'Curcubeu7Vara' });
    t('contul nou chiar se poate autentifica', nouLogin.status === 200, 'status ' + nouLogin.status);

    // ── 3. Antetul de IP nu mai e crezut pe cuvânt ──
    // Fără TRUST_CF_IP, fiecare cerere trebuie să cadă pe ACELAȘI IP real, indiferent ce antet trimit.
    let blocat = false;
    for (let i = 0; i < 12; i++) {
      const r = await req(jar(), 'POST', '/api/login',
        { username: 'bun@t.ro', password: 'gresit' + i },
        { 'CF-Connecting-IP': '203.0.113.' + i });     // IP diferit la fiecare încercare
      if (r.status === 429 || (r.body && /prea multe|încerc/i.test(JSON.stringify(r.body)))) { blocat = true; break; }
    }
    t('forța brută NU se poate ocoli schimbând antetul CF-Connecting-IP', blocat, 'nu s-a activat limitarea în 12 încercări');

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
