// verify_paritate_telefon.js — ce apără serverul pentru aplicația de telefon (inclusiv cea VECHE).
//
//   node verify_paritate_telefon.js
//
// Telefoanele clienților păstrează săptămâni întregi o versiune veche a aplicației. Tot ce ține de bani,
// de drepturi sau de date pierdute trebuie deci păzit pe SERVER, nu doar în codul nou de pe telefon.
// Proba pornește serverul adevărat (PGlite, NODE_ENV=test) și verifică:
//   1. o zonă modificată parțial (doar culoarea / numele) își păstrează descrierea, categoria, grupa,
//      regiunea și adresa; formularul întreg al web-ului le golește în continuare; o zonă pe străzi nu
//      mai poate fi transformată în cerc de pe telefon;
//   2. lista de utilizatori spune cine are rol PROPRIU, iar o salvare care nu schimbă rolul nu-l mai
//      mută pe rolul standard (cu mai multe drepturi); o schimbare reală de rol merge ca înainte;
//   3. RA Insight: omul fără acces primește motivul adevărat; „Asistent AI" (/api/ai/chat) respectă
//      fondul firmei exact ca RA Insight și nicio întrebare peste fond nu pleacă spre model fără acord;
//   4. tokenii și modelul AI nu ajung la un client;
//   5. găurile găsite la integrare: fișierul unui act al unei mașini la care omul NU are acces nu se mai
//      deschide după număr; un agent live rulat singur (ca din APK-ul vechi) nu mai cumpără rezumat AI;
//      un om creat direct pe un rol propriu îl primește; locurile RA Insight se numără în firma omului;
//   6. revizia de integrare: un rol propriu fără „Vede toată flota" chiar vede doar mașinile atribuite; un om
//      promovat super-admin nu mai rămâne în firmă (adminul ei nu-i mai poate schimba parola); un acceptExtra
//      trimis cu fond disponibil nu scrie acordul pe lună; „Rezumat raport" peste fond cere și el acordul.
//
// Modelul AI NU e chemat de-adevăratelea: serverul pornește cu un mic „-r" care răspunde în locul
// api.anthropic.com și numără apelurile. Tot restul internetului e închis, ca proba să nu depindă de rețea.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { puneParola } = require('./test_parola');

const PORT = 3247, TCP = 5247; // proprii
const DIR = path.join(os.tmpdir(), 'rax_paritate_' + Date.now());
const PRELOAD = DIR + '_fetch.js';
const AI_LOG = DIR + '_ai.log';
const DB_FLAG = DIR + '_db.flag';
const B = 'http://127.0.0.1:' + PORT;

fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, '1\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
  // Două „defecte" pornite dintr-un fișier-steag, doar în serverul probei:
  //   cade:<funcție>  → citirea aceea din bază eșuează (ca o sughițare a bazei);
  //   mutare-veche    → mutarea unui om în altă firmă se face ca înainte de reparație (date VECHI).
  "const Module = require('module');",
  'const _load = Module._load;',
  "function steag() { try { return fs.readFileSync(process.env.PROBA_DB_FLAG, 'utf8').trim(); } catch (e) { return ''; } }",
  'Module._load = function (request) {',
  '  const out = _load.apply(this, arguments);',
  "  if (request === './db' && out && !out.__proba) {",
  '    out.__proba = true;',
  "    for (const fn of ['getAiMonthUsage', 'getAiSeats']) {",
  '      const orig = out[fn];',
  "      out[fn] = function () { if (steag() === 'cade:' + fn) return Promise.reject(new Error('proba: baza nu raspunde')); return orig.apply(this, arguments); };",
  '    }',
  '    const mutare = out.setUserCompany;',
  '    out.setUserCompany = async function (id, companyId) {',
  "      if (steag() === 'promovare-veche') return;   // ca înainte de reparație: promovarea nu scotea omul din firmă",
  "      if (steag() !== 'mutare-veche') return mutare.apply(this, arguments);",
  "      await out.pool.query('UPDATE users SET company_id = $2 WHERE id = $1', [id, companyId]);",
  '    };',
  '  }',
  '  return out;',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
fs.writeFileSync(DB_FLAG, '');

const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_paritate', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_DB_FLAG: DB_FLAG,
});
delete env.DATABASE_URL;
delete env.ANTHROPIC_API_KEY;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() {
  for (const f of [PRELOAD, AI_LOG, DB_FLAG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} }
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
function gata(code) {
  terminat = true;
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { curata(); process.exit(code); }, 800);
}
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
// Autentificarea telefonului: cheie „gpsk_…" trimisă ca Bearer.
async function loginTelefon(u, p) {
  const r = await fetch(B + '/api/mobile/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p, device: 'proba' }) });
  const j = await r.json().catch(() => ({}));
  return j.token ? { token: j.token } : null;
}
// `cine` = cookie de web (string) sau { token } de telefon.
function cerere(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (typeof cine === 'string') h.Cookie = cine;
  else if (cine && cine.token) h.Authorization = 'Bearer ' + cine.token;
  return fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
}
async function json(m, u, cine, body) {
  const r = await cerere(m, u, cine, body);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const apeluriAi = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;
const chei = (o) => Object.keys(o || {}).sort().join(',');
const steag = (s) => fs.writeFileSync(DB_FLAG, s || '');

// ─── Formularul web de editare a unui om, rulat de-adevăratelea ───
// Funcțiile openUserEdit / saveUserEdit / rolAplicaNume se scot din index.html și rulează într-un vm, pe un
// DOM minim (doar câmpurile formularului), cu fetch-ul trimis la serverul probei, pe sesiunea dată. Așa proba
// vede ce ALEGE formularul și ce TRIMITE, nu doar cum arată codul.
const HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
function functiaDinHtml(semn) {
  const i = HTML.indexOf(semn);
  if (i < 0) throw new Error('nu găsesc în index.html: ' + semn);
  for (let k = HTML.indexOf('{', i), n = 0; k < HTML.length; k++) {
    if (HTML[k] === '{') n++;
    else if (HTML[k] === '}' && --n === 0) return HTML.slice(i, k + 1);
  }
  throw new Error('funcție neînchisă: ' + semn);
}
const SURSA_FORMULAR = ['async function openUserEdit(', 'async function saveUserEdit(', 'function rolAplicaNume('].map(functiaDinHtml).join('\n');
function formularWeb(cookie, eSuper, proprii) {
  function optiune() {
    const atr = {};
    const o = { value: '', textContent: '', dataset: {}, parinte: null,
      setAttribute(k, v) { atr[k] = String(v); }, hasAttribute(k) { return k in atr; },
      remove() { if (o.parinte) o.parinte.scoate(o); } };
    return o;
  }
  // <select> cu regulile browserului: după innerHTML e aleasă prima opțiune; o valoare care nu există → nimic ales.
  const sel = { options: [], selectedIndex: -1, onchange: null,
    set innerHTML(h) {
      sel.options = [];
      const re = /<option value="([^"]*)">([^<]*)<\/option>/g; let m;
      while ((m = re.exec(h))) { const o = optiune(); o.value = m[1]; o.textContent = m[2]; o.parinte = sel; sel.options.push(o); }
      sel.selectedIndex = sel.options.length ? 0 : -1;
    },
    get value() { return sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].value : ''; },
    set value(v) { sel.selectedIndex = sel.options.findIndex((o) => o.value === String(v)); },
    appendChild(o) { o.parinte = sel; sel.options.push(o); if (sel.selectedIndex < 0) sel.selectedIndex = 0; return o; },
    scoate(o) { const ales = sel.options[sel.selectedIndex]; sel.options = sel.options.filter((x) => x !== o); sel.selectedIndex = ales ? sel.options.indexOf(ales) : -1; },
    querySelectorAll(q) { return q === 'option[data-propriu]' ? sel.options.filter((o) => o.hasAttribute('data-propriu')) : []; },
  };
  const camp = () => ({ value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
  const el = { 'ue-role': sel };
  for (const id of ['ue-id', 'ue-title', 'ue-active', 'ue-fullname', 'ue-email', 'ue-phone', 'ue-password', 'ue-devices', 'ue-groups', 'user-edit-modal', 'ue-access-wrap']) el[id] = camp();
  const alerte = [];
  const ctx = {
    document: {
      getElementById: (id) => el[id] || null,
      createElement: () => optiune(),
      querySelectorAll: (q) => (q === '#new-role option, #ue-role option' ? sel.options.slice() : []),
    },
    currentUser: { isSuper: eSuper }, ueUsersCache: [], RA_ROL_NUME: {}, RA_ROL_PROPRII: proprii || [],
    alert: (m) => alerte.push(String(m)),
    fetch: (url, opts) => {
      const o = Object.assign({}, opts);
      o.headers = Object.assign({}, (opts || {}).headers, { Cookie: cookie });
      return fetch(B + url, o);
    },
    ueToggleAccessVisibility() {}, closeUserEdit() {}, loadUsers: async () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SURSA_FORMULAR, ctx);
  return { ctx, el, sel, alerte };
}

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {}
    if (!pornit) await sleep(500);
  }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }

  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const PAROLA = 'Str4da-Verde-2026';
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Paritate SRL' })).j;
  const co2 = (await json('POST', '/api/companies', S, { name: 'Alta Firma SRL' })).j;
  T('companiile de probă se creează', !!co.id && !!co2.id);
  const cfg = await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 2, overage: false } });
  T('firma are RA Insight, 2 întrebări pe cont, fără depășire', cfg.status === 200, cfg.status + ' ' + cfg.text.slice(0, 80));
  const cheie = await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  T('asistentul AI e „configurat" (cheie de probă)', cheie.status === 200 && cheie.j.enabled === true, cheie.text.slice(0, 80));

  // Contul se naște FĂRĂ parolă (CLAUDE.md): serverul întoarce linkul, iar omul își pune parola
  // singur. Proba trece pe același traseu ca un om adevărat.
  async function om(username, role, companyId, cine) {
    const r = await json('POST', '/api/users', cine || S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    return r.j;
  }
  const sef = await om('sef@paritate.ro', 'admin', co.id);
  const ckSef = await login('sef@paritate.ro', PAROLA);
  const telSef = await loginTelefon('sef@paritate.ro', PAROLA);
  T('administratorul firmei intră pe web și pe telefon', !!sef.id && !!ckSef && !!telSef);
  await om('sef@alta.ro', 'admin', co2.id);
  const ckAlt = await login('sef@alta.ro', PAROLA);
  T('administratorul altei firme intră pe web', !!ckAlt);
  // Fără niciun vehicul, RA Insight se oprește înainte de model („n-am ce analiza") și proba n-ar
  // mai vedea regula fondului pe calea aceea.
  //
  // ⚠ Aparatul îl înregistrăm NOI și îl dăm pe firmă (decizia lui Alin, 16.09 — GPS-ul e marfa
  // noastră, `POST /api/devices/import` e `requireSuperadmin`). Proba îl cerea de pe contul
  // ADMINULUI FIRMEI și aștepta 200; de pe 16.09 răspunsul corect e 403, iar de-aici cădea tot
  // restul suitei — mașini, acte, agenți — 30 de verificări dintr-un singur rând de pregătire.
  const imp = await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000024701', name: 'Camion Paritate', plate: 'AR-01-PAR' }] });
  await json('PUT', '/api/devices/350000000024701/company', S, { company_id: co.id });
  T('firma are un vehicul (RA Insight are ce analiza)', imp.status === 200, imp.status + ' ' + imp.text.slice(0, 80));

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n1. Zonele: modificarea parțială nu mai șterge nimic');
  const grupa = (await json('POST', '/api/groups', ckSef, { name: 'Grupa Vest' })).j;
  T('grupa de probă se creează', !!grupa.id, JSON.stringify(grupa).slice(0, 80));
  const zc = await json('POST', '/api/geofences', ckSef, {
    name: 'Depozit Arad', type: 'circle', coordinates: { center: [46.18, 21.31], radius: 300 }, color: '#2563eb',
    description: 'Rampa 3', category: 'depozit', group_id: grupa.id, is_region: true, address: 'Str. Probei 1, Arad',
  });
  T('zona se creează de pe web, cu toate câmpurile', zc.status === 200 && !!zc.j.id, zc.text.slice(0, 100));
  const zona = async (id) => ((await json('GET', '/api/geofences', ckSef)).j || []).find((x) => x.id === id) || {};
  const pastrate = (z) => z.description === 'Rampa 3' && z.category === 'depozit' && z.group_id === grupa.id && z.is_region === true;

  let r = await json('PUT', '/api/geofences/' + zc.j.id, ckSef, { color: '#16a34a' });
  let z = await zona(zc.j.id);
  T('doar culoarea trimisă → culoarea se schimbă', r.status === 200 && z.color === '#16a34a', r.status + ' ' + z.color);
  T('iar descrierea, categoria, grupa și regiunea rămân', pastrate(z), JSON.stringify(z).slice(0, 220));
  T('adresa rămâne (forma nu s-a mutat)', z.address === 'Str. Probei 1, Arad', z.address);
  T('tipul și forma rămân', z.type === 'circle' && z.coordinates && z.coordinates.radius === 300, JSON.stringify(z.coordinates));

  r = await json('PUT', '/api/geofences/' + zc.j.id, telSef, { name: 'Depozit Arad Nord' });
  z = await zona(zc.j.id);
  T('doar numele, de pe telefon → numele se schimbă, restul rămâne', r.status === 200 && z.name === 'Depozit Arad Nord' && pastrate(z) && z.color === '#16a34a', JSON.stringify(z).slice(0, 200));

  // Exact corpul trimis de aplicația VECHE: nume, tip, culoare, formă — nimic altceva.
  r = await json('PUT', '/api/geofences/' + zc.j.id, telSef, { name: 'Depozit Arad Nord', type: 'circle', color: '#16a34a', coordinates: { center: [46.2, 21.33], radius: 500 } });
  z = await zona(zc.j.id);
  T('corpul telefonului vechi (formă nouă) nu mai șterge descrierea, categoria, grupa, regiunea', r.status === 200 && pastrate(z) && z.coordinates.radius === 500, JSON.stringify(z).slice(0, 200));
  T('iar centrul zonei se recalculează după mutare', Math.abs(Number(z.center_lat) - 46.2) < 1e-6, z.center_lat);

  // Formularul web: trimite TOT, cu câmpurile golite.
  r = await json('PUT', '/api/geofences/' + zc.j.id, ckSef, { name: 'Depozit Arad', color: '#16a34a', description: null, category: null, group_id: null, is_region: false, type: 'circle', coordinates: { center: [46.2, 21.33], radius: 500 } });
  z = await zona(zc.j.id);
  T('formularul întreg al web-ului golește în continuare câmpurile', r.status === 200 && z.description == null && z.category == null && z.group_id == null && z.is_region === false, JSON.stringify(z).slice(0, 200));

  const cor = await json('POST', '/api/geofences', ckSef, {
    name: 'Traseu DN6', type: 'corridor', coordinates: { line: [[45.75, 21.22], [45.76, 21.25], [45.78, 21.3]], width: 30 },
    color: '#f59e0b', description: 'Pe străzi', category: 'traseu', address: 'DN6',
  });
  T('zona pe străzi se creează de pe web', cor.status === 200 && !!cor.j.id, cor.text.slice(0, 80));
  r = await json('PUT', '/api/geofences/' + cor.j.id, telSef, { name: 'Traseu DN6', type: 'circle', color: '#f59e0b', coordinates: { center: [45.76, 21.25], radius: 500 } });
  z = await zona(cor.j.id);
  T('telefonul vechi NU mai poate transforma zona pe străzi în cerc', r.status === 400 && z.type === 'corridor' && z.coordinates && Array.isArray(z.coordinates.line) && z.coordinates.line.length === 3, r.status + ' ' + JSON.stringify(z.coordinates));
  T('și primește explicația pe românește', /web/.test(r.j.error || '') && /numele și culoarea/.test(r.j.error || ''), r.j.error);
  r = await json('PUT', '/api/geofences/' + cor.j.id, telSef, { color: '#ef4444' });
  z = await zona(cor.j.id);
  T('telefonul nou (doar culoarea) → zona rămâne pe străzi, cu toată forma', r.status === 200 && z.color === '#ef4444' && z.type === 'corridor' && z.coordinates.line.length === 3 && z.coordinates.width === 30, r.status + ' ' + JSON.stringify(z).slice(0, 160));
  T('cu descrierea, categoria și adresa neatinse', z.description === 'Pe străzi' && z.category === 'traseu' && z.address === 'DN6', JSON.stringify(z).slice(0, 200));
  r = await json('PUT', '/api/geofences/' + cor.j.id, ckSef, { name: 'Traseu DN6 v2', color: '#ef4444', description: 'Pe străzi', category: 'traseu', group_id: null, is_region: false, type: 'corridor', coordinates: { line: [[45.75, 21.22], [45.76, 21.25], [45.78, 21.3]], width: 30 } });
  z = await zona(cor.j.id);
  T('web-ul modifică zona pe străzi ca înainte', r.status === 200 && z.name === 'Traseu DN6 v2' && z.type === 'corridor', r.status + ' ' + z.name);
  r = await json('PUT', '/api/geofences/' + cor.j.id, ckAlt, { color: '#000000' });
  T('altă firmă nu poate modifica zona', r.status === 403, r.status);

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n2. Rolul propriu nu se mai pierde la o salvare oarecare');
  const rolNou = (await json('POST', '/api/company-roles', ckSef, { nume: 'Operator depou', baza: 'dispatcher' })).j;
  T('firma își face un rol propriu', !!rolNou.rol && rolNou.rol !== 'dispatcher', JSON.stringify(rolNou).slice(0, 80));
  const disp = await om('dispecer@paritate.ro', 'dispatcher', co.id, ckSef);
  T('adminul firmei adaugă un dispecer', !!disp.id, JSON.stringify(disp).slice(0, 80));
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
  T('și îl mută pe rolul propriu (ca pe web)', r.status === 200, r.status + ' ' + r.text.slice(0, 80));
  const omul = async (cine) => ((await json('GET', '/api/users', cine || ckSef)).j || []).find((u) => u.id === disp.id) || {};
  let u = await omul();
  T('lista de utilizatori spune rolul propriu', u.role_slug === rolNou.rol && u.role === 'dispatcher', u.role + ' / ' + u.role_slug);
  T('și numele lui', u.role_slug_name === 'Operator depou', u.role_slug_name);

  r = await json('PUT', '/api/users/' + disp.id, ckSef, { phone: '0722000111' });
  u = await omul();
  T('doar telefonul schimbat → rolul propriu rămâne', r.status === 200 && u.role_slug === rolNou.rol && u.phone === '0722000111', r.status + ' ' + u.role_slug);
  // Exact corpul telefonului vechi: trimite MEREU rolul standard, oricare ar fi schimbarea.
  r = await json('PUT', '/api/users/' + disp.id, telSef, { role: 'dispatcher', full_name: 'Dispecer Proba', email: 'dispecer@paritate.ro', phone: '0722000222', active: true });
  u = await omul();
  T('telefonul vechi trimite rolul standard → rolul propriu rămâne', r.status === 200 && u.role_slug === rolNou.rol && u.phone === '0722000222', r.status + ' ' + u.role_slug + ' ' + r.text.slice(0, 60));
  const ckDisp = await login('dispecer@paritate.ro', PAROLA);
  const meDisp = (await json('GET', '/api/me', ckDisp)).j;
  T('iar omul lucrează în continuare pe rolul propriu', meDisp.roleLabel === 'Operator depou', meDisp.roleLabel);

  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: 'manager' });
  u = await omul();
  T('o schimbare REALĂ de rol scoate rolul propriu', r.status === 200 && u.role === 'manager' && u.role_slug == null, u.role + ' / ' + u.role_slug);
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
  u = await omul();
  T('rolul propriu se poate pune din nou', r.status === 200 && u.role_slug === rolNou.rol && u.role === 'dispatcher', u.role + ' / ' + u.role_slug);
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: 'dispatcher', role_slug: null });
  u = await omul();
  T('„înapoi pe rolul standard" (role_slug: null, cum trimite web-ul) merge', r.status === 200 && u.role === 'dispatcher' && u.role_slug == null, u.role + ' / ' + u.role_slug);

  // Rol vechi, pe care adminul firmei nu-l mai poate da („client"): o salvare fără schimbare nu mai e refuzată…
  const vechi = await om('client.vechi@paritate.ro', 'client', co.id);
  r = await json('PUT', '/api/users/' + vechi.id, ckSef, { role: 'client', phone: '0700000001' });
  T('un om cu rol vechi („client") se poate salva fără „Rol invalid"', r.status === 200, r.status + ' ' + r.text.slice(0, 60));
  // …dar rolul nu poate fi DAT cuiva care nu-l are.
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: 'client' });
  T('rolul acela nu poate fi dat altcuiva', r.status === 400, r.status);
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: 'admin' });
  T('nici un rol de administrare', r.status === 400, r.status);

  const rolStrain = (await json('POST', '/api/company-roles', ckAlt, { nume: 'Rol Strain Proba', baza: 'viewer' })).j;
  r = await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolStrain.rol });
  T('rolul propriu al ALTEI firme nu se poate da', !!rolStrain.rol && r.status === 400, r.status + ' ' + rolStrain.rol);
  r = await json('PUT', '/api/users/' + disp.id, ckAlt, { phone: '0799999999' });
  T('altă firmă nu poate modifica omul', r.status === 403, r.status);
  T('și nu-l vede în lista ei', !((await json('GET', '/api/users', ckAlt)).j || []).some((x) => x.id === disp.id));

  // Formularul web, rulat de-adevăratelea (vezi formularWeb).
  const PROPRII = [{ rol: rolNou.rol, nume: 'Operator depou' }];
  await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
  let f = formularWeb(ckSef, false, PROPRII);
  await f.ctx.openUserEdit(disp.id);
  T('formularul web deschide omul cu rolul propriu ales', f.sel.value === rolNou.rol, f.sel.value);
  f.el['ue-phone'].value = '0733000333';
  await f.ctx.saveUserEdit();
  u = await omul();
  T('salvat din formular cu alt număr → rolul propriu rămâne', !f.alerte.length && u.role_slug === rolNou.rol && u.phone === '0733000333', f.alerte.join(' | ') + ' ' + u.role_slug);
  f = formularWeb(ckSef, false, PROPRII);
  await f.ctx.openUserEdit(disp.id);
  f.sel.value = 'dispatcher';                       // rolul standard din care derivă, ales de mână
  await f.ctx.saveUserEdit();
  u = await omul();
  T('ales rolul standard în formular → omul iese de pe rolul propriu', !f.alerte.length && u.role === 'dispatcher' && u.role_slug == null, f.alerte.join(' | ') + ' ' + u.role_slug);

  // Mutarea într-o altă firmă scoate rolul propriu al firmei vechi…
  await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
  r = await json('PUT', '/api/users/' + disp.id + '/company', S, { company_id: co2.id });
  u = await omul(S);
  T('mutat în altă firmă → rolul propriu al firmei vechi pleacă', r.status === 200 && u.company_id === co2.id && u.role_slug == null && u.role === 'dispatcher', r.status + ' ' + u.company_id + ' / ' + u.role_slug);
  // …dar oamenii mutați ÎNAINTE de reparație îl au încă (date vechi, refăcute aici cu mutarea de atunci).
  await json('PUT', '/api/users/' + disp.id + '/company', S, { company_id: co.id });
  await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
  steag('mutare-veche');
  r = await json('PUT', '/api/users/' + disp.id + '/company', S, { company_id: co2.id });
  steag('');
  u = await omul(S);
  T('(date vechi) omul mutat de mult are încă rolul firmei vechi', r.status === 200 && u.role_slug === rolNou.rol && u.role_slug_name == null, u.role_slug + ' / ' + u.role_slug_name);
  f = formularWeb(S, true, []);
  await f.ctx.openUserEdit(disp.id);
  T('formularul nu mai alege un rol care nu există în firma omului', f.sel.value === 'dispatcher' && !f.sel.options.some((o) => o.value === rolNou.rol), f.sel.value + ' / ' + f.sel.options.map((o) => o.value).join(','));
  await f.ctx.saveUserEdit();
  u = await omul(S);
  T('iar salvarea merge (fără „Rol invalid") și curăță rolul rămas', !f.alerte.length && u.role === 'dispatcher' && u.role_slug == null, f.alerte.join(' | ') + ' ' + u.role_slug);
  // Aceleași date vechi, trimise de o aplicație care pune rolul propriu în `role` (sau în `role_slug`).
  for (const corp of [{ role: rolNou.rol, phone: '0744000444' }, { role: 'dispatcher', role_slug: rolNou.rol, phone: '0744000555' }]) {
    await json('PUT', '/api/users/' + disp.id + '/company', S, { company_id: co.id });
    await json('PUT', '/api/users/' + disp.id, ckSef, { role: rolNou.rol });
    steag('mutare-veche');
    await json('PUT', '/api/users/' + disp.id + '/company', S, { company_id: co2.id });
    steag('');
    r = await json('PUT', '/api/users/' + disp.id, S, corp);
    u = await omul(S);
    T('serverul: rolul rămas trimis înapoi (' + Object.keys(corp).join('+') + ') nu mai e „Rol invalid", se curăță', r.status === 200 && u.role === 'dispatcher' && u.role_slug == null && u.phone === corp.phone, r.status + ' ' + r.text.slice(0, 60) + ' ' + u.role_slug);
  }
  r = await json('PUT', '/api/users/' + disp.id, S, { role: 'rnuexista123' });
  T('un rol propriu care nu e al omului rămâne „Rol invalid"', r.status === 400, r.status);

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n3. RA Insight și „Asistent AI": aceleași reguli, pe web și pe telefon');
  const Q = 'Scrie o analiza despre eficienta echipei noastre';
  const fara = await om('fara.acces@paritate.ro', 'manager', co.id, ckSef);
  const ckFara = await login('fara.acces@paritate.ro', PAROLA);
  const telFara = await loginTelefon('fara.acces@paritate.ro', PAROLA);
  T('omul fără RA Insight intră pe web și pe telefon', !!fara.id && !!ckFara && !!telFara);
  for (const cale of ['/api/ai/chat', '/api/ai/reports-agent']) {
    const w = await json('POST', cale, ckFara, { message: Q });
    T(cale + ', web: refuz cu motivul adevărat (contul, nu planul)',
      w.status === 403 && w.j.error === 'ai_seat_missing' && /contul tău nu are încă acces/.test(w.j.message || '') && /Administratorul firmei îl poate porni din Utilizatori/.test(w.j.message || '') && !/planul/.test(w.text),
      w.status + ' ' + w.text.slice(0, 120));
    T(cale + ', mesajul nu spune de două ori același lucru', (w.j.message || '').split(/administrator/i).length === 2, w.j.message);
    T(cale + ', web: textul e și în „reply" (web-ul îl afișează de acolo)', w.j.reply === w.j.message);
    const t = await json('POST', cale, telFara, { message: Q });
    T(cale + ', telefon: motivul ajunge în „reply", singurul câmp citit de aplicația veche',
      t.status === 200 && t.j.seatMissing === true && /Administratorul firmei îl poate porni din Utilizatori/.test(t.j.reply || ''), t.status + ' ' + t.text.slice(0, 120));
  }
  T('nimic nu a ajuns la model', apeluriAi() === 0, apeluriAi());

  const ion = await om('ion@paritate.ro', 'manager', co.id, ckSef);
  const loc = await json('PUT', '/api/users/' + ion.id + '/ai-seat', ckSef, { on: true });
  T('adminul îi dă RA Insight lui Ion → fondul firmei = 1 cont × 2 întrebări', loc.status === 200 && loc.j.seats === 1, loc.text.slice(0, 80));
  const ckIon = await login('ion@paritate.ro', PAROLA);
  const telIon = await loginTelefon('ion@paritate.ro', PAROLA);
  const folosite = async () => (await json('GET', '/api/ai/quota', ckIon)).j.used;

  r = await json('POST', '/api/ai/chat', telIon, { message: Q });
  await sleep(400);
  T('cu fond disponibil, „Asistent AI" răspunde', r.status === 200 && r.j.reply === 'RASPUNS_DE_PROBA', r.status + ' ' + r.text.slice(0, 80));
  T('și întrebarea se numără din fondul firmei', apeluriAi() === 1 && (await folosite()) === 1, apeluriAi() + ' / ' + (await folosite()));

  await json('POST', '/api/test/ai-usage', S, { companyId: co.id, userId: ion.id, kind: 'insight' });
  T('fondul lunii s-a terminat (2 din 2)', (await folosite()) === 2, await folosite());

  // Firma NU are voie să depășească: se oprește, cu explicația.
  const opritChat = await json('POST', '/api/ai/chat', telIon, { message: Q });
  const opritInsight = await json('POST', '/api/ai/reports-agent', ckIon, { message: Q });
  T('„Asistent AI" se oprește la epuizare, cu explicația fondului', opritChat.j.limited === true && !!opritChat.j.fondEpuizat && /Fondul de întrebări/.test(opritChat.j.reply || ''), opritChat.text.slice(0, 120));
  T('exact ca RA Insight (aceleași câmpuri)', chei(opritChat.j) === chei(opritInsight.j) && !!opritInsight.j.fondEpuizat, chei(opritChat.j) + ' | ' + chei(opritInsight.j));
  T('nu mai scrie „contactați administratorul platformei"', !/administratorul platformei/.test(opritChat.text));
  T('nimic nu pleacă spre model, nimic nu se numără', apeluriAi() === 1 && (await folosite()) === 2, apeluriAi() + ' / ' + (await folosite()));

  // Firma ARE voie să depășească: se cere acordul înainte de orice cost.
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_quota: { overage: true } });
  const acordWeb = await json('POST', '/api/ai/chat', ckIon, { message: Q });
  T('„Asistent AI" (web) cere acordul, ca RA Insight', acordWeb.j.needsExtraConsent === true && acordWeb.j.reply === null && acordWeb.j.cost && acordWeb.j.cost.pretLei > 0, acordWeb.text.slice(0, 160));
  const acordTel = await json('POST', '/api/ai/chat', telIon, { message: Q, history: [{ role: 'user', content: 'salut' }] });
  T('pe telefon cere tot acordul', acordTel.j.needsExtraConsent === true && !!acordTel.j.cost, acordTel.text.slice(0, 120));
  T('iar aplicația veche primește în „reply" o explicație pe românește', typeof acordTel.j.reply === 'string' && /acordul/.test(acordTel.j.reply) && /nu a fost trimisă/.test(acordTel.j.reply), acordTel.j.reply);
  const acordInsightTel = await json('POST', '/api/ai/reports-agent', telIon, { message: Q });
  const acordInsightWeb = await json('POST', '/api/ai/reports-agent', ckIon, { message: Q });
  T('RA Insight pe telefon: același răspuns', acordInsightTel.j.needsExtraConsent === true && typeof acordInsightTel.j.reply === 'string' && chei(acordInsightTel.j) === chei(acordTel.j), chei(acordInsightTel.j) + ' | ' + chei(acordTel.j));
  T('RA Insight pe web: neschimbat (caseta, fără text)', acordInsightWeb.j.needsExtraConsent === true && acordInsightWeb.j.reply === null && chei(acordInsightWeb.j) === chei(acordWeb.j), acordInsightWeb.text.slice(0, 100));
  for (let i = 0; i < 3; i++) await json('POST', '/api/ai/chat', telIon, { message: Q + ' ' + i });
  T('fără acord, nicio întrebare peste fond nu ajunge la model și nu se facturează', apeluriAi() === 1 && (await folosite()) === 2, apeluriAi() + ' / ' + (await folosite()));

  r = await json('POST', '/api/ai/chat', telIon, { message: Q, acceptExtra: true });
  await sleep(400);
  T('cu acordul dat (acceptExtra), întrebarea pleacă', r.j.reply === 'RASPUNS_DE_PROBA', r.text.slice(0, 80));
  T('și abia acum se numără peste fond', apeluriAi() === 2 && (await folosite()) === 3, apeluriAi() + ' / ' + (await folosite()));
  const notif = await json('GET', '/api/notifications', ckSef);
  T('acordul lasă notificarea pentru cine plătește', /ai_cost_extra|fondul lunii s-a terminat/i.test(notif.text), notif.status + ' ' + notif.text.slice(0, 80));
  r = await json('POST', '/api/ai/reports-agent', ckIon, { message: Q });
  await sleep(400);
  T('acordul ține pe firmă toată luna, pe ambele căi (regula de pe RA Insight)', r.j.reply === 'RASPUNS_DE_PROBA' && apeluriAi() === 3, apeluriAi() + ' ' + r.text.slice(0, 80));
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_quota: { extraAcceptedMonth: '2020-01' } });
  r = await json('POST', '/api/ai/chat', telIon, { message: Q });
  T('luna nouă → acordul se cere din nou', r.j.needsExtraConsent === true && apeluriAi() === 3, apeluriAi() + ' ' + r.text.slice(0, 80));

  // Baza nu răspunde când se citește fondul (firma e peste fond, fără acord luna asta). Înainte, o citire
  // eșuată arăta „fond gol = nelimitat" și întrebarea pleca spre model și pe factură.
  const inainte = await folosite();
  for (const fn of ['getAiMonthUsage', 'getAiSeats']) {
    steag('cade:' + fn);
    const a = await json('POST', '/api/ai/chat', telIon, { message: Q });
    const b = await json('POST', '/api/ai/reports-agent', ckIon, { message: Q });
    steag('');
    T('fondul nu se poate citi (' + fn + ') → „încearcă din nou", pe ambele căi', a.status === 503 && b.status === 503 && /Încearcă din nou/.test(a.j.reply || '') && /Încearcă din nou/.test(b.j.error || ''), a.status + ' ' + a.text.slice(0, 80) + ' | ' + b.status);
  }
  await sleep(400);
  T('și întrebarea nu ajunge la model și nu se numără', apeluriAi() === 3 && (await folosite()) === inainte, apeluriAi() + ' / ' + (await folosite()) + ' (înainte ' + inainte + ')');
  r = await json('POST', '/api/ai/chat', telIon, { message: Q });
  T('când baza își revine, regula obișnuită (acordul) e la loc', r.j.needsExtraConsent === true, r.text.slice(0, 80));

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Tokenii și modelul AI rămân la fondatori');
  const modelSuper = (await json('GET', '/api/ai/status', S)).j.model;
  T('super-adminul vede modelul', typeof modelSuper === 'string' && modelSuper.length > 3, modelSuper);
  const usSuper = await json('GET', '/api/ai/usage-stats?days=30', S);
  T('și consumul pe tokeni', usSuper.status === 200 && usSuper.j.model === modelSuper && (usSuper.j.usage || []).some((x) => x.input_tokens != null), usSuper.text.slice(0, 120));
  for (const [eticheta, cine] of [['web', ckIon], ['telefon', telIon], ['administratorul firmei', ckSef]]) {
    const st = await json('GET', '/api/ai/status', cine);
    T(eticheta + ': /api/ai/status spune doar dacă AI-ul e pornit', st.status === 200 && st.j.enabled === true && !('model' in st.j), st.text);
    const us = await json('GET', '/api/ai/usage-stats?days=30', cine);
    T(eticheta + ': /api/ai/usage-stats nu are tokeni, apeluri sau model', us.status === 200 && Array.isArray(us.j.usage) && us.j.usage.length === 0 &&
      !/tokens|calls/.test(us.text) && !('model' in us.j) && us.text.indexOf(modelSuper) < 0, us.status + ' ' + us.text.slice(0, 120));
    T(eticheta + ': dar răspunde, ca ecranul vechi „Asistenți AI" să nu cadă (butonul spre Agenți AI rămâne)', typeof us.j.days === 'number');
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n5. Găurile găsite la integrare: acte, agenți live, roluri la creare, locuri RA Insight');
  const lista = (x) => (Array.isArray(x) ? x : []);
  const imp2 = await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000024702', name: 'Duba Paritate', plate: 'AR-02-PAR' }] });
  await json('PUT', '/api/devices/350000000024702/company', S, { company_id: co.id });
  T('firma are și a doua mașină', imp2.status === 200, imp2.status + ' ' + imp2.text.slice(0, 80));
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // Actul primei mașini e expirat intenționat: îl folosește și RA Care, mai jos.
  const act1 = await json('POST', '/api/documents', ckSef, { imei: '350000000024701', doc_type: 'RCA', expiry_date: '2020-01-01', file_b64: PNG, file_mime: 'image/png', file_name: 'rca.png' });
  const act2 = await json('POST', '/api/documents', ckSef, { imei: '350000000024702', doc_type: 'ITP', expiry_date: '2099-01-01', file_b64: PNG, file_mime: 'image/png', file_name: 'itp.png' });
  T('câte un act cu poză pe fiecare mașină', act1.status === 200 && act1.j.has_file === true && act2.status === 200 && act2.j.has_file === true, act1.status + ' ' + act1.text.slice(0, 80));
  const vaz = await om('vazator@paritate.ro', 'viewer', co.id, ckSef);
  const acc = await json('PUT', '/api/users/' + vaz.id + '/access', ckSef, { devices: ['350000000024702'], groups: [] });
  const ckVaz = await login('vazator@paritate.ro', PAROLA);
  const telVaz = await loginTelefon('vazator@paritate.ro', PAROLA);
  T('un viewer primește acces doar la a doua mașină', acc.status === 200 && !!ckVaz && !!telVaz, acc.status + ' ' + acc.text.slice(0, 60));
  T('în lista lui de acte nu apare actul primei mașini (ca înainte)', !lista((await json('GET', '/api/documents', ckVaz)).j).some((d) => d.id === act1.j.id));
  for (const [et, cine] of [['web', ckVaz], ['telefon', telVaz]]) {
    const bun = await cerere('GET', '/api/documents/' + act2.j.id + '/file', cine);
    T(et + ': actul mașinii LUI se deschide', bun.status === 200 && /image\/png/.test(bun.headers.get('content-type') || ''), bun.status);
    const strain = await cerere('GET', '/api/documents/' + act1.j.id + '/file', cine);
    T(et + ': actul mașinii la care n-are acces, cerut după număr, e refuzat', strain.status === 403, strain.status);
  }
  const fisSef = await cerere('GET', '/api/documents/' + act1.j.id + '/file', ckSef);
  T('adminul firmei îl deschide în continuare', fisSef.status === 200, fisSef.status);
  T('altă firmă nu-l găsește', (await cerere('GET', '/api/documents/' + act1.j.id + '/file', ckAlt)).status === 404);

  // Agenții live: APK-ul vechi apasă „Rulează" pe unul singur → nu mai cumpără rezumat AI.
  const agSet = await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { agents: true, ai_assistant: true }, enabled_agents: ['care'] });
  T('firma are RA Care pornit', agSet.status === 200, agSet.status + ' ' + agSet.text.slice(0, 80));
  const inainteAg = apeluriAi();
  const unu = await json('POST', '/api/agents/run', ckSef, { agent: 'care' });
  await sleep(400);
  T('RA Care rulat singur găsește actul expirat', unu.status === 200 && lista(unu.j.findings).some((x) => x.agent === 'care'), unu.status + ' ' + unu.text.slice(0, 120));
  T('dar nu mai cumpără rezumat AI', apeluriAi() === inainteAg && unu.j.aiSummary == null, apeluriAi() + ' / ' + inainteAg);
  const toti = await json('POST', '/api/agents/run', ckSef, { agent: 'all' });
  await sleep(400);
  T('rularea tuturor agenților își păstrează rezumatul (proba chiar vede apelul)', toti.status === 200 && apeluriAi() === inainteAg + 1 && toti.j.aiSummary === 'RASPUNS_DE_PROBA', apeluriAi() + ' ' + toti.text.slice(0, 120));

  // Om creat direct pe rolul propriu al firmei (formularul de pe web îl oferă și la adăugare).
  const peRol = await json('POST', '/api/users', ckSef, { username: 'depou@paritate.ro', password: PAROLA, full_name: 'Om Depou', role: rolNou.rol });
  const toti2 = lista((await json('GET', '/api/users', ckSef)).j);
  const peRolL = toti2.find((x) => x.id === peRol.j.id) || {};
  T('omul creat pe rolul propriu îl primește (nu mai devine tăcut „viewer")', peRol.status === 200 && peRolL.role === 'dispatcher' && peRolL.role_slug === rolNou.rol, peRol.status + ' ' + peRolL.role + ' / ' + peRolL.role_slug);
  const peStrain = await json('POST', '/api/users', ckSef, { username: 'strain@paritate.ro', password: PAROLA, full_name: 'Om Strain', role: rolStrain.rol });
  const peStrainL = lista((await json('GET', '/api/users', ckSef)).j).find((x) => x.id === peStrain.j.id) || {};
  T('rolul propriu al ALTEI firme nu se poate folosi la creare', peStrainL.role_slug == null && peStrainL.role === 'viewer', peStrainL.role + ' / ' + peStrainL.role_slug);

  // Locurile RA Insight: contul de platformă nu ocupă loc; numărul e al firmei omului.
  const adminPlat = lista((await json('GET', '/api/users', S)).j).find((x) => x.username === 'admin') || {};
  const locPlat = await json('PUT', '/api/users/' + adminPlat.id + '/ai-seat', S, { on: true });
  T('contul de platformă nu primește loc RA Insight', !!adminPlat.id && locPlat.status === 400, adminPlat.id + ' ' + locPlat.status + ' ' + locPlat.text.slice(0, 80));
  const locS = await json('PUT', '/api/users/' + ion.id + '/ai-seat', S, { on: true });
  T('super-adminul vede locurile FIRMEI omului, nu ale platformei', locS.status === 200 && locS.j.seats === 1, locS.text.slice(0, 80));

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n6. Revizia de integrare: roluri proprii, conturi de platformă, acordul, rezumatul');
  // Rol propriu din Manager, cu „Vede toată flota" tăiat: omul trebuie să vadă DOAR mașinile atribuite.
  const sefTura = (await json('POST', '/api/company-roles', ckSef, { nume: 'Sef tura', baza: 'manager' })).j;
  const taiere = await json('PUT', '/api/company-roles/' + sefTura.rol, ckSef, { nume: 'Sef tura', taiate: ['viewAll'] });
  T('firma face rolul propriu „Sef tura" din Manager, fără „Vede toată flota"', !!sefTura.rol && taiere.status === 200 && lista(taiere.j.taiate).indexOf('viewAll') >= 0, taiere.status + ' ' + taiere.text.slice(0, 100));
  const tura = await json('POST', '/api/users', ckSef, { username: 'tura@paritate.ro', full_name: 'Sef Tura', role: sefTura.rol });
  await puneParola(tura.j, PAROLA, B);
  const accTura = await json('PUT', '/api/users/' + tura.j.id + '/access', ckSef, { devices: ['350000000024702'], groups: [] });
  const ckTura = await login('tura@paritate.ro', PAROLA);
  const telTura = await loginTelefon('tura@paritate.ro', PAROLA);
  T('omul e creat pe rolul propriu, cu o singură mașină atribuită', tura.status === 200 && accTura.status === 200 && !!ckTura && !!telTura, tura.status + ' ' + accTura.status);
  for (const [et, cine] of [['web', ckTura], ['telefon', telTura]]) {
    const dv = lista((await json('GET', '/api/devices', cine)).j).map((d) => d.imei);
    T(et + ': vede DOAR mașina atribuită, nu toată flota', dv.length === 1 && dv[0] === '350000000024702', dv.join(','));
  }
  T('și nu deschide actul celeilalte mașini', (await cerere('GET', '/api/documents/' + act1.j.id + '/file', ckTura)).status === 403);
  const turaSef = lista((await json('GET', '/api/users', ckSef)).j).find((x) => x.id === tura.j.id) || {};
  const turaSuper = lista((await json('GET', '/api/users?company=' + co.id, S)).j).find((x) => x.id === tura.j.id) || {};
  const ionSuper = lista((await json('GET', '/api/users?company=' + co.id, S)).j).find((x) => x.id === ion.id) || {};
  T('lista de utilizatori spune „nu vede toată flota" (adminul firmei și super-adminul)', turaSef.sees_all === false && turaSuper.sees_all === false && ionSuper.sees_all === true, turaSef.sees_all + ' / ' + turaSuper.sees_all + ' / ' + ionSuper.sees_all);

  // Om al firmei promovat super-admin: iese din firmă, iar adminul firmei nu mai are putere asupra lui.
  const promovat = await om('promovat@paritate.ro', 'manager', co.id, ckSef);
  const pr = await json('PUT', '/api/users/' + promovat.id, S, { role: 'superadmin' });
  const prL = lista((await json('GET', '/api/users', S)).j).find((x) => x.id === promovat.id) || {};
  T('om al firmei promovat super-admin → nu mai e legat de firmă', pr.status === 200 && prL.role === 'superadmin' && prL.company_id == null, pr.status + ' ' + prL.role + ' / ' + prL.company_id);
  // Parola nu se mai scrie de nimeni (CLAUDE.md): ce se putea fura acum e LINKUL de parolă.
  const furt = await json('POST', '/api/users/' + promovat.id + '/link-parola', ckSef, {});
  T('adminul firmei nu-i mai poate cere link de parolă contului de platformă', furt.status === 403, furt.status + ' ' + furt.text.slice(0, 60));
  T('nici emailul', (await json('PUT', '/api/users/' + promovat.id, ckSef, { email: 'eu@hacker.ro' })).status === 403);
  // Date VECHI: un super-admin promovat înainte de reparație, cu firma rămasă în bază. Garda trebuie să-l apere singură.
  const vechiSuper = await om('vechi.super@paritate.ro', 'manager', co.id, ckSef);
  steag('promovare-veche');
  await json('PUT', '/api/users/' + vechiSuper.id, S, { role: 'superadmin' });
  steag('');
  const vsL = lista((await json('GET', '/api/users', S)).j).find((x) => x.id === vechiSuper.id) || {};
  T('(date vechi) super-adminul are încă firma în bază', vsL.role === 'superadmin' && vsL.company_id === co.id, vsL.role + ' / ' + vsL.company_id);
  T('adminul firmei nu-i poate cere link de parolă', (await json('POST', '/api/users/' + vechiSuper.id + '/link-parola', ckSef, {})).status === 403);
  T('nici emailul, nici accesul pe vehicule, nici să-l șteargă',
    (await json('PUT', '/api/users/' + vechiSuper.id, ckSef, { email: 'eu@hacker.ro' })).status === 403 &&
    (await json('PUT', '/api/users/' + vechiSuper.id + '/access', ckSef, { devices: [], groups: [] })).status === 403 &&
    (await json('DELETE', '/api/users/' + vechiSuper.id, ckSef)).status === 403);
  T('și nu apare în lista de utilizatori a firmei', !lista((await json('GET', '/api/users', ckSef)).j).some((x) => x.id === vechiSuper.id));

  // Zona ștearsă iese din regulile de alertă care o urmăreau (cealaltă zonă rămâne).
  const zSters = (await json('POST', '/api/geofences', ckSef, { name: 'Zona de sters', type: 'circle', coordinates: { center: [46.1, 21.2], radius: 200 }, color: '#000000' })).j;
  const zRamas = (await json('POST', '/api/geofences', ckSef, { name: 'Zona ramasa', type: 'circle', coordinates: { center: [46.12, 21.22], radius: 200 }, color: '#111111' })).j;
  const regZ = (await json('POST', '/api/alerts', ckSef, { name: 'Intrare zone proba', type: 'geofence_enter', condition: { geofenceIds: [zSters.id, zRamas.id] }, enabled: true })).j;
  const delZ = await json('DELETE', '/api/geofences/' + zSters.id, ckSef);
  const regDupa = lista((await json('GET', '/api/alerts', ckSef)).j).find((x) => x.id === regZ.id) || {};
  const condDupa = typeof regDupa.condition === 'string' ? JSON.parse(regDupa.condition) : (regDupa.condition || {});
  const idsDupa = (condDupa.geofenceIds || []).map(Number);
  T('zona ștearsă iese din regula care o urmărea, cealaltă rămâne', !!regZ.id && delZ.status === 200 && idsDupa.length === 1 && idsDupa[0] === zRamas.id, delZ.status + ' ' + JSON.stringify(condDupa));

  // Acordul se scrie DOAR când e cerut: un acceptExtra trimis cu fond disponibil nu pre-aprobă luna.
  await json('PUT', '/api/companies/' + co2.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 1, overage: true } });
  const sefAlt = lista((await json('GET', '/api/users', ckAlt)).j).find((x) => x.username === 'sef@alta.ro') || {};
  const locAlt = await json('PUT', '/api/users/' + sefAlt.id + '/ai-seat', ckAlt, { on: true });
  const inainteB = apeluriAi();
  const primul = await json('POST', '/api/ai/chat', ckAlt, { message: Q, acceptExtra: true });
  await sleep(500);
  T('acceptExtra cu fond disponibil: întrebarea merge ca inclusă', locAlt.status === 200 && primul.j.reply === 'RASPUNS_DE_PROBA' && apeluriAi() === inainteB + 1, locAlt.status + ' ' + primul.text.slice(0, 80));
  const alDoilea = await json('POST', '/api/ai/chat', ckAlt, { message: Q });
  T('dar acordul NU s-a scris: la epuizare caseta se cere, nimic nu trece tăcut pe factură', alDoilea.j.needsExtraConsent === true && apeluriAi() === inainteB + 1, alDoilea.text.slice(0, 100));

  // „Rezumat raport" se numără în fond: peste fond, fără acord, nu pleacă spre model.
  const RAP = { type: 'tabel', report: { columns: ['Vehicul', 'Km'], rows: [['AR-01-PAR', '120']] } };
  const inainteR = apeluriAi();
  const rez = await json('POST', '/api/ai/report-summary', ckIon, RAP);
  await sleep(300);
  T('„Rezumat raport" peste fond cere acordul, ca întrebările', rez.j.needsExtraConsent === true && !!rez.j.cost && apeluriAi() === inainteR, rez.status + ' ' + rez.text.slice(0, 120));
  const rezOk = await json('POST', '/api/ai/report-summary', ckIon, Object.assign({ acceptExtra: true }, RAP));
  await sleep(500);
  T('cu acordul dat, rezumatul se face', rezOk.j.summary === 'RASPUNS_DE_PROBA' && apeluriAi() === inainteR + 1, rezOk.text.slice(0, 80));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); gata(1); });
