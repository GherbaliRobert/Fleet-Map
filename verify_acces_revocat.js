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

const PORT = 3186, TCP = 5186; // proprii: 3196/5196 sunt ale lui verify_tacho_api.js
const DIR = path.join(os.tmpdir(), 'rax_revocat_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_revocat', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
});
delete env.DATABASE_URL;
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
// Dacă serverul probei moare, nu vrem ca verificările să meargă mai departe pe ALT server de pe același port.
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); process.exit(1); } });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata(code) {
  terminat = true;
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

// Legătură live deschisă cu o CHEIE (ca telefonul), nu cu cookie.
function legaturaToken(cheie) {
  const st = { init: false, inchisa: false, eroare: null };
  const s = new WebSocket('ws://127.0.0.1:' + PORT + '/?token=' + encodeURIComponent(cheie));
  s.on('message', (d) => { try { const m = JSON.parse(d.toString()); if (m.type === 'init') st.init = true; if (m.type === 'error') st.eroare = m.data && m.data.error; } catch (e) {} });
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

  console.log('\n5. Fiecare plasă, verificată separat (fără ștergerea sesiunilor)');
  // Dezactivarea normală șterge sesiunile și închide legăturile deodată — și așa le ascunde pe celelalte plase. Aici
  // contul e dezactivat DIRECT în bază, iar sesiunile rămân: fiecare verificare trebuie să-l prindă singură.
  const tacut = await om('tacut');
  const ck2 = await login('tacut@revocare.ro', PAROLA);
  const ck3 = await login('tacut@revocare.ro', PAROLA);
  const L5 = legatura(ck3);
  T('omul are harta live', await asteapta(() => L5.init, 8000));
  const dz = await cerere('POST', '/api/debug/dezactiveaza-fara-sesiuni', S, { id: tacut.id });
  T('contul e dezactivat direct în bază, sesiunile rămân', dz.status === 200, dz.status);
  // Căile cu MAJUSCULE: înainte, verificările de la fiecare cerere se uitau doar la „/api" și le săreau, dar rutele
  // răspundeau pe rolul din sesiune. Nu contează codul exact (404), contează că datele nu mai ies.
  const rMare = await cerere('GET', '/API/me', tacut.ck);
  const tMare = await rMare.text();
  T('„/API/me" scris cu majuscule nu mai dă datele contului', !(rMare.status === 200 && /"username"|"role"/.test(tMare)), rMare.status + ' ' + tMare.slice(0, 80));
  const rLive = await cerere('GET', '/API/live', tacut.ck);
  const tLive = await rLive.text();
  T('„/API/live" scris cu majuscule nu mai dă pozițiile', !(rLive.status === 200 && tLive.trim().charAt(0) === '['), rLive.status + ' ' + tLive.slice(0, 60));
  T('verificarea de la fiecare cerere îl oprește singură (401)', (await cerere('GET', '/api/me', tacut.ck)).status === 401);
  const L5b = legatura(ck2);
  T('legătura live nouă e refuzată de verificarea de la deschidere', (await asteapta(() => L5b.inchisa, 6000)) && !L5b.init);
  const sw3 = await (await cerere('POST', '/api/debug/ws-sweep', S)).json();
  T('trecerea periodică închide legătura rămasă deschisă', await asteapta(() => L5.inchisa, 3000), JSON.stringify(sw3));

  console.log('\n6. O cheie revocată închide legătura live deschisă cu ea');
  const cheiat = await om('cheiat');
  const cr = await (await cerere('POST', '/api/apikeys', S, { userId: cheiat.id, name: 'proba revocare' })).json();
  T('cheia se creează', !!cr.key && !!cr.id, JSON.stringify(cr).slice(0, 90));
  const L6 = legaturaToken(cr.key);
  T('legătura deschisă cu cheia primește harta live', await asteapta(() => L6.init, 8000));
  const rv = await cerere('DELETE', '/api/apikeys/' + cr.id, S);
  T('revocarea reușește', rv.status === 200, rv.status);
  T('legătura se închide pe loc, nu la următoarea trecere', await asteapta(() => L6.inchisa, 3000));
  const L6b = legaturaToken(cr.key);
  T('cheia revocată nu mai deschide o legătură nouă', (await asteapta(() => L6b.inchisa, 6000)) && !L6b.init);

  console.log('\n7. Drepturile tăiate ajung și în harta live deja deschisă');
  // Administratorul firmei adaugă un vehicul (intră în firma lui) și îi dă unui dispecer drept DOAR pe el.
  await cerere('POST', '/api/users', S, { username: 'sef@revocare.ro', password: PAROLA, full_name: 'Sef', role: 'company_admin', company_id: co.id });
  const ckSef = await login('sef@revocare.ro', PAROLA);
  const IMEI_P = '350000000009911';
  const imp = await cerere('POST', '/api/devices/import', ckSef, { rows: [{ imei: IMEI_P, name: 'Proba drepturi', plate: 'B-99-DRP' }] });
  T('administratorul firmei adaugă vehiculul', imp.status === 200, imp.status + ' ' + (await imp.clone().text()).slice(0, 120));
  const disp = await (await cerere('POST', '/api/users', S, { username: 'dispecer@revocare.ro', password: PAROLA, full_name: 'Dispecer', role: 'dispatcher', company_id: co.id })).json();
  const acc1 = await cerere('PUT', '/api/users/' + disp.id + '/access', ckSef, { devices: [IMEI_P], groups: [] });
  T('dispecerul primește drept pe vehicul', acc1.status === 200, acc1.status);
  const ckDisp = await login('dispecer@revocare.ro', PAROLA);
  const L7 = legatura(ckDisp);
  T('dispecerul are harta live', await asteapta(() => L7.init, 8000));
  const scop = async () => {
    const lst = await (await cerere('GET', '/api/debug/ws-clients', S)).json();
    const c = (lst.clients || []).find((x) => x.userId === disp.id && x.open);
    return c ? c.scope : null;
  };
  const inainte = await scop();
  T('legătura lui vede exact vehiculul primit', inainte === '1 imei', inainte);
  const acc2 = await cerere('PUT', '/api/users/' + disp.id + '/access', ckSef, { devices: [], groups: [] });
  T('dreptul i se taie', acc2.status === 200, acc2.status);
  await sleep(1200);
  const dupa = await scop();
  T('legătura DESCHISĂ nu mai vede vehiculul, fără reconectare', dupa === '0 imei', dupa);
  T('și a rămas deschisă (e aceeași legătură, nu una nouă)', !L7.inchisa);


  console.log('\n8. Pagina web');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  T('la „Neautorizat" pagina întreabă /api/me și duce la autentificare',
    /msg\.data\.error === 'Neautorizat'[\s\S]{0,200}fetch\('\/api\/me'[\s\S]{0,120}r\.status === 401\) location\.href = '\/'/.test(html));
  T('super-adminul își păstrează sesiunea', (await cerere('GET', '/api/me', S)).status === 200);

  for (const L of [L1b, L4b, L5b, L6b, L7]) { try { L.sock.close(); } catch (e) {} }
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); gata(1); });
