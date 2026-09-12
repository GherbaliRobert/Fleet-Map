// verify_acces_revocat.js — accesul unui om se taie PE LOC, și în sesiunile deja deschise.
//
//   node verify_acces_revocat.js
//
// Gaura reparată: dezactivarea sau ștergerea unui cont nu închidea nimic. Cookie-ul de 24h rămânea valid,
// verificarea de la fiecare cerere nu se uita dacă omul mai e activ (și, la un cont șters, mergea pe rolul
// vechi din sesiune), iar legătura live a hărții se verifica o singură dată, la deschidere. Un om plecat din
// firmă își păstra harta, rapoartele și datele până îi expira sesiunea singură.
//
// Proba pornește un server adevărat, se autentifică, deschide legături live adevărate și verifică:
//   1. dezactivarea închide pe loc legătura live și sesiunea (cererile următoare iau 401);
//   2. ștergerea la fel;
//   3. un termen de acces care expiră singur e prins de trecerea periodică;
//   4. un rol schimbat reface legătura, cu drepturile noi — iar un cont neatins NU e deranjat;
//   5. pagina web duce omul la autentificare, în loc să se reconecteze la nesfârșit.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3196, TCP = 5196;
const DIR = path.join(os.tmpdir(), 'rax_revocat_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_revocat', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
});
delete env.DATABASE_URL;
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata(code) {
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800);
}
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
const cerere = (m, u, ck, body) => fetch(B + u, {
  method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}),
  body: body ? JSON.stringify(body) : undefined,
});
async function asteapta(cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(100); }
  return cond();
}
// O legătură live adevărată, cu cookie-ul omului. Ține minte ce a primit și dacă s-a închis.
function legatura(ck) {
  const st = { init: false, inchisa: false, eroare: null };
  const s = new WebSocket('ws://127.0.0.1:' + PORT + '/', { headers: { Cookie: ck } });
  s.on('message', (d) => {
    try {
      const m = JSON.parse(d.toString());
      if (m.type === 'init') st.init = true;
      if (m.type === 'error') st.eroare = m.data && m.data.error;
    } catch (e) {}
  });
  s.on('close', () => { st.inchisa = true; });
  s.on('error', () => {});
  st.sock = s;
  return st;
}

(async () => {
  let pornit = false;
  for (let i = 0; i < 240 && !pornit; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {}
    if (!pornit) await sleep(500);
  }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }

  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const co = await (await cerere('POST', '/api/companies', S, { name: 'Firma Revocare SRL' })).json();
  const PAROLA = 'Str4da-Verde-2026';
  async function om(nume) {
    const r = await cerere('POST', '/api/users', S, { username: nume + '@revocare.ro', password: PAROLA, full_name: nume, role: 'viewer', company_id: co.id });
    const b = await r.json();
    const ck = await login(nume + '@revocare.ro', PAROLA);
    return { id: b.id, ck };
  }

  console.log('\n1. Dezactivarea închide totul pe loc');
  const plecat = await om('plecat');
  T('omul se autentifică la început', !!plecat.ck && (await cerere('GET', '/api/me', plecat.ck)).status === 200);
  const L1 = legatura(plecat.ck);
  T('și are harta live', await asteapta(() => L1.init, 8000));
  await cerere('PUT', '/api/users/' + plecat.id, S, { active: false });
  T('legătura live se închide imediat după dezactivare', await asteapta(() => L1.inchisa, 4000));
  T('cu motivul „Neautorizat"', L1.eroare === 'Neautorizat', L1.eroare);
  T('cererile cu sesiunea veche iau 401', (await cerere('GET', '/api/me', plecat.ck)).status === 401);
  T('inclusiv poziţiile live', (await cerere('GET', '/api/live', plecat.ck)).status === 401);
  const L1b = legatura(plecat.ck);
  T('o legătură NOUĂ cu cookie-ul vechi e refuzată', await asteapta(() => L1b.inchisa, 6000) && !L1b.init);

  console.log('\n2. Ștergerea la fel');
  const sters = await om('sters');
  const L2 = legatura(sters.ck);
  T('omul are harta live', await asteapta(() => L2.init, 8000));
  const del = await cerere('DELETE', '/api/users/' + sters.id, S);
  T('ștergerea reușește', del.status === 200, del.status);
  T('legătura live se închide imediat', await asteapta(() => L2.inchisa, 4000));
  T('sesiunea veche nu mai merge (nici pe rolul din sesiune)', (await cerere('GET', '/api/me', sters.ck)).status === 401);

  console.log('\n3. Un termen care expiră singur e prins de trecerea periodică');
  const temporar = await om('temporar');
  const L3 = legatura(temporar.ck);
  T('omul are harta live', await asteapta(() => L3.init, 8000));
  const ramas = await om('ramas');                 // cont neatins, ca martor
  const L4 = legatura(ramas.ck);
  T('martorul are harta live', await asteapta(() => L4.init, 8000));
  await cerere('PUT', '/api/users/' + temporar.id + '/access-until', S, { until: Date.now() + 2000 });
  await sleep(2600);
  const sw = await (await cerere('POST', '/api/debug/ws-sweep', S)).json();
  T('trecerea închide legătura celui expirat', await asteapta(() => L3.inchisa, 3000), JSON.stringify(sw));
  T('martorul NU e deranjat', !L4.inchisa);

  console.log('\n4. Un rol schimbat reface legătura cu drepturile noi');
  await cerere('PUT', '/api/users/' + ramas.id, S, { role: 'manager' });
  await (await cerere('POST', '/api/debug/ws-sweep', S)).json();
  T('legătura veche se închide', await asteapta(() => L4.inchisa, 3000));
  T('motivul e reconectarea, nu delogarea', L4.eroare === 'reautentificare', L4.eroare);
  const L4b = legatura(ramas.ck);
  T('reconectarea merge, cu contul încă valid', await asteapta(() => L4b.init, 8000));
  const sw2 = await (await cerere('POST', '/api/debug/ws-sweep', S)).json();
  await sleep(300);
  T('a doua trecere nu mai închide nimic', !L4b.inchisa && sw2.inchise === 0, JSON.stringify(sw2));

  console.log('\n5. Pagina web');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  T('la „Neautorizat" pagina întreabă /api/me și duce la autentificare',
    /msg\.data\.error === 'Neautorizat'[\s\S]{0,200}fetch\('\/api\/me'[\s\S]{0,120}r\.status === 401\) location\.href = '\/'/.test(html));
  T('super-adminul își păstrează sesiunea', (await cerere('GET', '/api/me', S)).status === 200);

  for (const L of [L1b, L4b]) { try { L.sock.close(); } catch (e) {} }
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); gata(1); });
