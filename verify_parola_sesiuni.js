// verify_parola_sesiuni.js — o parolă schimbată scoate din cont ce era deschis cu cea veche (Robert, 02.11: „rezolvă").
//
//   node verify_parola_sesiuni.js
//
// Până pe 02.11, omul care își schimba parola rămânea intrat peste tot: un telefon pierdut mergea mai departe până la 90 de zile.
// Proba pornește un server adevărat și verifică, cu sesiuni, tokenuri de telefon și legături live adevărate:
//   1. schimbată din pagină: rămâne pagina din care s-a schimbat; altă sesiune și telefoanele ies, iar legăturile lor se închid;
//   2. schimbată de pe telefon: rămâne telefonul acela; restul iese;
//   3. schimbată prin linkul de parolă: iese tot;
//   4. cheia de integrare rămâne (nu ține de parolă), alt om nu e atins, parola greșită nu închide nimic.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { puneParola } = require('./test_parola');

const PORT = 3537, TCP = 5537;
const DIR = path.join(os.tmpdir(), 'rax_parola_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const env = Object.assign({}, process.env, { NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_parola', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR });
delete env.DATABASE_URL;
delete env.BREVO_API_KEY; delete env.SMTP_HOST;   // fără email: linkurile vin în răspuns
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let mort = false; srv.on('exit', () => { mort = true; });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asteapta = async (cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (await cond()) return true; await sleep(50); } return false; };

async function cere(m, url, corp, o) {
  const h = { 'Content-Type': 'application/json' };
  if (o && o.ck) h.Cookie = o.ck;
  if (o && o.key) h['X-API-Key'] = o.key;
  const r = await fetch(B + url, { method: m, headers: h, body: corp ? JSON.stringify(corp) : undefined });
  let d = null; try { d = await r.json(); } catch (e) {}
  return { s: r.status, d, r };
}
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) throw new Error('login ' + u + ': ' + r.status);
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function telefon(u, p, device) {
  const r = await cere('POST', '/api/mobile/login', { username: u, password: p, device: device || 'proba' });
  if (r.s !== 200) throw new Error('mobile login ' + r.s);
  return r.d.token;
}
const merge = async (o) => (await cere('GET', '/api/me', null, o)).s === 200;
function legaturaCookie(ck) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/', { headers: { Cookie: ck } });
  const st = { ws, inchisa: false, init: false };
  ws.on('message', (m) => { try { if (JSON.parse(m).type === 'init') st.init = true; } catch (e) {} });
  ws.on('close', () => { st.inchisa = true; }); ws.on('error', () => { st.inchisa = true; });
  return st;
}
function legaturaToken(t) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/?token=' + encodeURIComponent(t));
  const st = { ws, inchisa: false, init: false };
  ws.on('message', (m) => { try { if (JSON.parse(m).type === 'init') st.init = true; } catch (e) {} });
  ws.on('close', () => { st.inchisa = true; }); ws.on('error', () => { st.inchisa = true; });
  return st;
}

const P0 = 'Str4da-Verde-2026', P1 = 'Alta-Parola-Buna-7', P2 = 'Inca-Una-Lunga-88', P3 = 'A-Patra-Parola-919';
const U = 'parola.proba@test.ro', V = 'vecin.proba@test.ro';

(async () => {
  try {
    let gata = false;
    for (let i = 0; i < 240 && !mort; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) { gata = true; break; } } catch (e) {} await sleep(250); }
    if (!gata) throw new Error('serverul n-a pornit');
    const S = await login('admin', 'test1234');
    const co = (await cere('POST', '/api/companies', { name: 'Firma Parola SRL' }, { ck: S })).d;
    const fac = async (u) => {
      const c = await cere('POST', '/api/users', { username: u, full_name: u.split('.')[0], role: 'company_admin', company_id: co.id || (co.company && co.company.id) }, { ck: S });
      if (c.s >= 300) throw new Error('cont ' + u + ': ' + JSON.stringify(c.d));
      await puneParola(c.d, P0, B);
      return c.d;
    };
    const om = await fac(U); const vecin = await fac(V);

    sect('1. Schimbată din pagină');
    let web1 = await login(U, P0), web2 = await login(U, P0);
    let tel1 = await telefon(U, P0, 'telefon-pierdut'), tel2 = await telefon(U, P0, 'al-doilea');
    const vecinWeb = await login(V, P0), vecinTel = await telefon(V, P0);
    const integrare = await cere('POST', '/api/apikeys', { name: 'integrare-erp', userId: om.id }, { ck: web1 });
    T('o cheie de integrare se poate face', integrare.s < 300 && !!(integrare.d && (integrare.d.key || integrare.d.token)), JSON.stringify(integrare.d));
    const cheie = integrare.d && (integrare.d.key || integrare.d.token);
    let w1 = legaturaCookie(web1), w2 = legaturaCookie(web2), wt = legaturaToken(tel1), wv = legaturaCookie(vecinWeb);
    await asteapta(async () => w1.init && w2.init && wt.init && wv.init);
    T('toate legăturile live s-au deschis', w1.init && w2.init && wt.init && wv.init, [w1.init, w2.init, wt.init, wv.init].join());

    const gresita = await cere('POST', '/api/me/password', { veche: 'nu-e-asta-parola', noua: P1 }, { ck: web1 });
    T('parola greșită e refuzată și nu închide nimic', gresita.s === 400 && await merge({ ck: web2 }) && await merge({ key: tel1 }), gresita.s);

    const sch = await cere('POST', '/api/me/password', { veche: P0, noua: P1 }, { ck: web1 });
    T('parola se schimbă', sch.s === 200 && sch.d.ok === true, JSON.stringify(sch.d));
    T('serverul spune câte s-au închis: o sesiune, două telefoane', sch.d && sch.d.inchise && sch.d.inchise.sesiuni === 1 && sch.d.inchise.telefoane === 2, JSON.stringify(sch.d && sch.d.inchise));
    T('mesajul spune că celelalte au ieșit', /Celelalte dispozitive au ieșit din cont/.test(sch.d && sch.d.mesaj), sch.d && sch.d.mesaj);
    T('pagina din care s-a schimbat rămâne în cont', await merge({ ck: web1 }));
    T('cealaltă sesiune iese', !(await merge({ ck: web2 })));
    T('telefonul pierdut iese', !(await merge({ key: tel1 })));
    T('celălalt telefon iese', !(await merge({ key: tel2 })));
    T('cheia de integrare rămâne', await merge({ key: cheie }));
    T('legătura live a celeilalte sesiuni se închide', await asteapta(async () => w2.inchisa));
    T('legătura live a telefonului se închide', await asteapta(async () => wt.inchisa));
    T('legătura live a paginii rămâne deschisă', !w1.inchisa && w1.ws.readyState === WebSocket.OPEN);
    T('vecinul nu e atins (sesiune, telefon, legătură)', await merge({ ck: vecinWeb }) && await merge({ key: vecinTel }) && !wv.inchisa);
    T('parola veche nu mai merge', (await cere('POST', '/api/login', { username: U, password: P0 })).s === 401);
    T('un token vechi nu mai deschide legătura live', await (async () => { const x = legaturaToken(tel1); return asteapta(async () => x.inchisa); })());

    sect('2. Schimbată de pe telefon');
    web1 = await login(U, P1); web2 = await login(U, P1);
    tel1 = await telefon(U, P1, 'telefonul-meu'); tel2 = await telefon(U, P1, 'alt-telefon');
    const sch2 = await cere('POST', '/api/me/password', { veche: P1, noua: P2 }, { key: tel1 });
    T('parola se schimbă de pe telefon', sch2.s === 200, JSON.stringify(sch2.d));
    T('telefonul de pe care s-a schimbat rămâne în cont', await merge({ key: tel1 }));
    T('celălalt telefon iese', !(await merge({ key: tel2 })));
    T('sesiunile web ies', !(await merge({ ck: web1 })) && !(await merge({ ck: web2 })));
    T('cheia de integrare rămâne', await merge({ key: cheie }));

    sect('3. Schimbată prin linkul de parolă (parolă uitată)');
    web1 = await login(U, P2); tel2 = await telefon(U, P2, 'inca-unul');
    const adm = await cere('POST', '/api/users/' + om.id + '/link-parola', {}, { ck: S });
    T('linkul vine în răspuns (fără email)', !!(adm.d && adm.d.link), JSON.stringify(adm.d));
    await puneParola(adm.d, P3, B);
    T('sesiunea web iese', !(await merge({ ck: web1 })));
    T('toate telefoanele ies', !(await merge({ key: tel1 })) && !(await merge({ key: tel2 })));
    T('cheia de integrare rămâne', await merge({ key: cheie }));
    T('parola nouă merge', !!(await login(U, P3)));
    T('vecinul tot nu e atins', await merge({ ck: vecinWeb }) && await merge({ key: vecinTel }));

    sect('4. În pagină și pe telefon');
    const pag = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
    T('pagina arată mesajul serverului', /zi\(\(d\.mesaj \|\| 'Parola a fost schimbată'\) \+ ' ✓', true\)/.test(pag));
    const tel = fs.readFileSync(path.join(__dirname, 'mobile/src/screens/ContulMeu.tsx'), 'utf8');
    T('telefonul arată mesajul serverului', /r\.mesaj \|\| 'Parola a fost schimbată'/.test(tel));

    [w1, w2, wt, wv].forEach((x) => { try { x.ws.close(); } catch (e) {} });
  } catch (e) { rele++; console.log('  ✗ proba a crăpat: ' + (e && e.message)); }
  try { srv.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
