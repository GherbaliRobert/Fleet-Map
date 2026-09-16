// verify_dispozitive.js — ecranul „Dispozitive" (verticala fondatorilor) + cine are voie la aparate.
//
//   node verify_dispozitive.js
//
// Ecranul ăsta e registrul NOSTRU de aparate, peste toate firmele. Trei lucruri nu au voie să se
// strice tăcut:
//
//   • SEMNALUL. Coloana „Stare" spune ce am hotărât NOI (activ / neasignat / arhivat) și nu știe
//     nimic despre teren: un aparat mort de o lună scria tot „activ", cu verde. De aceea există a
//     doua coloană, „Semnal" — dar cuvintele și pragurile NU se scriu aici: se ia `agpsStare` din
//     „Aparate GPS", care e scrisă o dată și are probele ei. Două vocabulare pentru același lucru e
//     exact greșeala cu „Admin" / „Admin companie".
//   • GRUPAREA PE FIRME. Vindem pe firme, deci ecranul arată clienți, nu o listă plată de IMEI-uri.
//     Iar un grup cu ceva de rezolvat nu are voie să stea închis: o problemă ascunsă e mai rea decât
//     una scrisă urât.
//   • CINE ÎNREGISTREAZĂ APARATELE. Noi (decizia lui Alin, 16.09). Clientul își vede aparatele și
//     seriile, dar nu le adaugă, nu le importă, nu le arhivează și nu scrie modelul sau cartela.
//     Refuzul vine de la SERVER, nu de la ecranul care ascunde butonul.
//
// Codul nu se copiază aici: se decupează din public/index.html și se execută.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// ── Decupăm din pagină bucățile reale și le rulăm ──────────────────────────────────────────────
function bloc(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return html.slice(i, j);
}
function functie(antet) {
  const i = html.indexOf(antet);
  if (i < 0) throw new Error('nu găsesc funcția ' + antet);
  const j = html.indexOf('\n    }', i);
  return html.slice(i, j + 6);
}
const blocDev = bloc('// ── începe „dispozitivele, pe firme" ──', '// ── sfârșit „dispozitivele, pe firme" ──');
// Starea de semnal vine din „Aparate GPS" — o luăm de acolo, ca să probăm chiar ce rulează.
const fnAgps = functie('    function agpsDeCand(ms) {') + '\n' + functie('    function agpsStare(lastTx, acum) {');
const fnBucket = (function () {
  const i = html.indexOf('    function _raxDevBucket(d) {');
  return html.slice(i, html.indexOf('\n', i));
})();

const mediu = `
  var AGPS_TACUT_MIN = 30, AGPS_MUT_ORE = 24;
  function esc(s) { return String(s == null ? '' : s); }
  function _raxDataOra(v) { return String(v || '—'); }
  function raCauta() { return true; }
  function _raxDevCoOptions() { return ''; }
  var _RAX_IFACE = [['', 'Auto']];
  var _raxDevices = [], _raxDevSearch = '', _raxDevFilter = 'all', _raxStrict = true, _raxAttempts = [];
  var window = {}, document = { getElementById: function () { return null; } };
`;
const U = new Function(mediu + fnAgps + '\n' + fnBucket + '\n' + blocDev +
  '\n; return { _raxDevSemnal: _raxDevSemnal, _raxDevProbleme: _raxDevProbleme, _raxDevGrupuri: _raxDevGrupuri, agpsStare: agpsStare };')();

const acum = Date.now();
const min = (n) => new Date(acum - n * 60000).toISOString();
const ore = (n) => new Date(acum - n * 3600000).toISOString();
const ap = (x) => Object.assign({ imei: '860000000000001', name: 'Dacia Logan', plate: 'B 154 UIP',
  company_id: 7, company_name: 'Transport Rapid SRL', status: 'active', can_type: 'can',
  can_interface: null, last_position_time: min(2), install_issue: null }, x);

sect('1. „Semnal" nu e un vocabular nou — e cel din „Aparate GPS"');
T('funcția de semnal cheamă `agpsStare`, nu scrie praguri proprii',
  /if \(typeof agpsStare === 'function'\) return agpsStare\(d\.last_position_time, Date\.now\(\)\);/.test(html));
T('și nu are numere de prag scrise în ea', !/_raxDevSemnal[\s\S]{0,400}(1440|86400000|24 \* 3600)/.test(html));
T('un aparat care a transmis acum 2 minute comunică', U._raxDevSemnal(ap({})).k === 'ok', U._raxDevSemnal(ap({})).t);
T('la 3 ore e tăcut, nu „fără semnal"', U._raxDevSemnal(ap({ last_position_time: ore(3) })).k === 'tacut',
  U._raxDevSemnal(ap({ last_position_time: ore(3) })).t);
T('peste 24 de ore e fără semnal', U._raxDevSemnal(ap({ last_position_time: ore(50) })).k === 'mut',
  U._raxDevSemnal(ap({ last_position_time: ore(50) })).t);
T('și textul spune de cât timp', /2 zile/.test(U._raxDevSemnal(ap({ last_position_time: ore(50) })).t));
T('cine n-a transmis niciodată e altceva decât cine a amuțit',
  U._raxDevSemnal(ap({ last_position_time: null })).k === 'niciodata');

sect('2. „Stare" și „Semnal" rămân două lucruri diferite');
T('tabelul are amândouă coloanele', /<th>Stare<\/th><th>Semnal<\/th>/.test(html));
T('starea e tot cea administrativă', /function _raxDevBucket\(d\) \{ if \(d\.status === 'archived'\)/.test(html));
T('un aparat ACTIV poate fi fără semnal — nu se contrazic',
  U._raxDevSemnal(ap({ last_position_time: ore(50) })).k === 'mut' && (function () {
    const B = new Function(fnBucket + '; return _raxDevBucket;')();
    return B(ap({ last_position_time: ore(50) })) === 'active';
  })());
T('la un aparat arhivat nu scriem „fără semnal" (l-am oprit noi)',
  /b === 'archived'[\s\S]{0,120}rax-dev-sem/.test(html) || /\(b === 'archived'\)\s*\n?\s*\? '<span style="color:var\(--text-muted\)">/.test(html));

sect('3. Pastila „Fără semnal"');
T('există, lângă celelalte', /chip\('nosignal', 'Fără semnal', 'atentie'\)/.test(html));
T('numără doar aparatele care NU sunt arhivate',
  /if \(_raxDevBucket\(d\) !== 'archived' && _raxDevSemnal\(d\)\.k === 'mut'\) counts\.nosignal\+\+;/.test(html));
T('și filtrează pe același criteriu', /_raxDevFilter === 'nosignal'/.test(html));
T('se vede caldă când are pe cine număra', /\.rax-dev-chip\.atentie:not\(\.on\)/.test(html));

sect('4. Grupate pe firme');
const lot = [
  ap({ imei: '1', company_id: null, company_name: null }),                                   // neasignat
  ap({ imei: '2', company_id: 9, company_name: 'Zebra SRL' }),
  ap({ imei: '3', company_id: 7, company_name: 'Alfa SRL' }),
  ap({ imei: '4', company_id: 7, company_name: 'Alfa SRL', last_position_time: ore(50) }),   // fără semnal
  ap({ imei: '5', company_id: 9, company_name: 'Zebra SRL', status: 'archived' })
];
const gr = U._raxDevGrupuri(lot);
T('neasignatele stau primele — ele așteaptă ceva de la tine', gr[0].nume === 'Neasignate', gr.map(g => g.nume).join(' | '));
T('firmele vin alfabetic', gr[1].nume === 'Alfa SRL' && gr[2].nume === 'Zebra SRL', gr.map(g => g.nume).join(' | '));
T('arhivatele stau la urmă', gr[gr.length - 1].nume === 'Arhivate', gr.map(g => g.nume).join(' | '));
T('fiecare firmă își ține aparatele ei', gr[1].dev.length === 2 && gr[2].dev.length === 1);
T('grupul unei firme știe și id-ul ei (pentru butonul care o deschide)', gr[1].coId === 7);
T('grupurile speciale n-au firmă de deschis', gr[0].coId === null && gr[gr.length - 1].coId === null);
T('o firmă fără nume nu rămâne fără etichetă',
  U._raxDevGrupuri([ap({ company_id: 12, company_name: null })])[0].nume === 'Firma #12');

sect('5. Câte are de rezolvat fiecare firmă');
T('un aparat fără semnal se numără', U._raxDevProbleme([ap({ last_position_time: ore(50) })]) === 1);
T('unul care n-a transmis niciodată, la fel', U._raxDevProbleme([ap({ last_position_time: null })]) === 1);
T('o problemă la montaj, la fel', U._raxDevProbleme([ap({ install_issue: { note: 'cablaj' } })]) === 1);
T('un aparat care comunică nu e o problemă', U._raxDevProbleme([ap({})]) === 0);
T('iar arhivatele nu se numără — nu mai transmit din voia noastră',
  U._raxDevProbleme([ap({ status: 'archived', last_position_time: ore(500) })]) === 0);

sect('6. Ce stă deschis și ce stă închis');
T('„Neasignate" e mereu deschis', /gr\.k === '_neas'\) \? true/.test(html));
T('„Arhivate" e mereu închis', /\(gr\.k === '_arh'\) \? false/.test(html));
T('o firmă cu ceva de rezolvat rămâne deschisă, oricâte firme ar fi', /pb > 0 \|\| grupuri\.length <= 5/.test(html));
T('și când ai căutat ceva, se vede ce a rămas', /!!q \|\| pb > 0/.test(html));
T('sumarul spune câte are și câte-s de rezolvat', /de rezolvat/.test(html));

sect('7. Butonul care duce la firmă');
T('există pe rândul firmei', /raxOpenCompanyDetail\(' \+ gr\.coId \+ '\)/.test(html));
T('și nu închide grupul când îl apeși', /event\.stopPropagation\(\);raxOpenCompanyDetail/.test(html));
['.rax-devgr', '.rax-devgr-h', '.rax-devgr-n', '.rax-devgr-b', '.rax-dev-sem']
  .forEach(function (c) { T('stilul ' + c, html.indexOf(c) >= 0); });

sect('8. Aparatele le înregistrăm NOI (decizia lui Alin, 16.09)');
T('adăugarea unui aparat cere super-admin',
  /app\.post\('\/api\/devices', requireAuth, requireSuperadmin, withCompany|app\.post\('\/api\/devices', requireAuth, requireSuperadmin, withScope/.test(server));
T('importul din fișier, la fel',
  /app\.post\('\/api\/devices\/import', requireAuth, requireSuperadmin/.test(server));
T('arhivarea/restaurarea, la fel',
  /app\.put\('\/api\/devices\/:imei\/status', requireAuth, requireSuperadmin/.test(server));
T('ștergerea era deja a noastră', /app\.delete\('\/api\/devices\/:imei', requireAuth, requireSuperadmin/.test(server));
T('modelul aparatului și cartela SIM se scriu doar de noi',
  /if \(req\.isSuper && \(req\.body\.gps_model !== undefined \|\| req\.body\.sim_number !== undefined\)\)/.test(server));
T('și se aruncă din fișa vehiculului, dacă le trimite altcineva',
  /delete b\.gps_model; delete b\.sim_number;/.test(server));
T('dar clientul le VEDE — nu i le ascundem, doar nu le scrie',
  /setv\('edit-gps-model', dev\.gps_model\)/.test(html) && /el\.readOnly = true/.test(html));
T('ecranul lui nu mai promite ce serverul refuză (adaugă / importă / arhivează)',
  /btn-sm btn-primary super-only" onclick="toggleVehAdd\(\)/.test(html) &&
  /btn-sm super-only" onclick="document\.getElementById\('veh-import-file'\)/.test(html) &&
  /btn-sm super-only \$\{archived \? 'btn-primary' : 'btn-danger'\}/.test(html));
T('ce ține de VEHICUL îi rămâne (nume, nr., șofer, grupă) — e flota lui',
  /app\.put\('\/api\/devices\/:imei\/group', requireAuth, requireEdit\('vehicule'\)/.test(server) &&
  /app\.put\('\/api\/devices\/:imei\/assign', requireAuth, requireEdit\('vehicule'\)/.test(server) &&
  /app\.put\('\/api\/devices\/:imei\/details', requireAuth, requireEdit\('vehicule'\)/.test(server));

// ── Partea a doua: pe server PORNIT ───────────────────────────────────────────
// Un buton ascuns tot poate fi apăsat de cine îi știe adresa. Aici se probează că REFUZUL vine de la
// server, cu contul unui admin de firmă adevărat.
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const PORT = 3211, DIR = '.dispozitive-db';
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_dispozitive',
  PORT: String(PORT), TCP_PORT: '5211', PGLITE_DIR: DIR + '/pgdata'
});
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: env, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const somn = (ms) => new Promise(r => setTimeout(r, ms));
function gata(cod) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(cod);
}

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await somn(500);
  }
  const intra = async (u, p) => {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
  };
  const ck = await intra('admin', 'test1234');
  if (!ck) { console.log('\nnu m-am putut autentifica pe serverul de probă'); return gata(1); }
  const cere = (met, cale, body, cine) => fetch(B + cale, {
    method: met, headers: { 'Content-Type': 'application/json', Cookie: cine || ck },
    body: body ? JSON.stringify(body) : undefined
  });

  sect('9. Pe server pornit: clientul nu înregistrează aparate');
  const co = await (await cere('POST', '/api/companies', { name: 'Firma Dispozitive' })).json();
  const sef = await (await cere('POST', '/api/users', { username: 'sef@dispoz.ro', full_name: 'Sef Firma', role: 'admin', company_id: co.id })).json();
  await puneParola(sef, 'Str4da-Verde-2026', B);
  const ckSef = await intra('sef@dispoz.ro', 'Str4da-Verde-2026');
  T('adminul firmei intră în contul lui', !!ckSef);

  const IMEI = '860000000099001';
  T('NOI putem înregistra un aparat', (await cere('POST', '/api/devices', { imei: IMEI, name: 'Camion 1', company_id: co.id })).status === 200);
  T('el NU poate adăuga un aparat', (await cere('POST', '/api/devices', { imei: '860000000099002', name: 'Al lui' }, ckSef)).status === 403);
  T('nici să importe din fișier', (await cere('POST', '/api/devices/import', { rows: [{ imei: '860000000099003', name: 'Din fișier' }] }, ckSef)).status === 403);
  T('nici să arhiveze un aparat al lui', (await cere('PUT', '/api/devices/' + IMEI + '/status', { status: 'archived' }, ckSef)).status === 403);
  T('și nici să șteargă', (await cere('DELETE', '/api/devices/' + IMEI, null, ckSef)).status === 403);

  sect('10. Seria și cartela: le vede, nu le scrie');
  await cere('PUT', '/api/devices/' + IMEI, { name: 'Camion 1', gps_model: 'FMC650', sim_number: '0740111222' });
  const vedeEl = ((await (await cere('GET', '/api/devices', null, ckSef)).json()) || []).find(d => d.imei === IMEI) || {};
  T('el VEDE modelul aparatului', vedeEl.gps_model === 'FMC650', vedeEl.gps_model);
  T('și cartela', vedeEl.sim_number === '0740111222', vedeEl.sim_number);
  await cere('PUT', '/api/devices/' + IMEI, { name: 'Camion 1', gps_model: 'ALTCEVA', sim_number: '0000000000' }, ckSef);
  await cere('PUT', '/api/devices/' + IMEI + '/details', { gps_model: 'ALTCEVA2', sim_number: '1111111111' }, ckSef);
  const dupa = ((await (await cere('GET', '/api/devices', null, ck)).json()) || []).find(d => d.imei === IMEI) || {};
  T('dar ce scrie el se aruncă — pe amândouă căile', dupa.gps_model === 'FMC650' && dupa.sim_number === '0740111222',
    dupa.gps_model + ' / ' + dupa.sim_number);

  sect('11. Ce ține de VEHICUL îi rămâne — e flota lui');
  T('îi poate schimba numele și numărul',
    (await cere('PUT', '/api/devices/' + IMEI, { name: 'Camionul lui', plate: 'B 01 ABC' }, ckSef)).status === 200);
  const alLui = ((await (await cere('GET', '/api/devices', null, ck)).json()) || []).find(d => d.imei === IMEI) || {};
  T('și chiar se salvează', alLui.name === 'Camionul lui' && alLui.plate === 'B 01 ABC', alLui.name + ' / ' + alLui.plate);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
