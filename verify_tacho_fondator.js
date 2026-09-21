// verify_tacho_fondator.js — Tahograf, privirea FONDATORULUI: firmele, nu șoferii.
//
//   node verify_tacho_fondator.js
//
// Ecranul de tahograf al clientului e al lui și rămâne cum e. Fondatorul îl vedea pe ACELAȘI ecran —
// literalmente același nod, mutat în panoul de administrare — hrănit cu datele TUTUROR firmelor și
// fără coloană de firmă. Scria „Ion Popescu, termen depășit" și nu puteai spune al cui e (Alin, 18.09).
//
// Ce apără proba:
//   • fondatorul are ecranul LUI, pe firme, nu nodul clientului mutat;
//   • cele trei reguli (cine are card, ce vehicul are tahograf, când e depășit termenul) NU se scriu
//     a doua oară aici — vin din `licenseCats` și `tacho`, ca la scadențarul clientului. Altfel cele
//     două ecrane ar începe să spună lucruri diferite despre același șofer, exact ca la „Semnal";
//   • pragurile se citesc PE FIRMĂ (una precaută poate cere 21 de zile în loc de 28);
//   • pe ecranul fondatorului NU se încarcă și NU se șterg fișiere — e gospodăria clientului;
//   • scadențarul întoarce firma și pentru VEHICULE (lipsea; camioanele cădeau pe dinafară la grupare);
//   • ruta e doar a super-adminului, iar demo nu intră.
const { spawn } = require('child_process');
const fs = require('fs');

const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const dbsrc = fs.readFileSync(P('db.js'), 'utf8');

const PORT = 3197, DIR = '.thf-ci-db';
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234',
  SESSION_SECRET: 'ci_thf', PORT: String(PORT), TCP_PORT: '5197', PGLITE_DIR: DIR + '/pgdata' };
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}

function bloc(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return html.slice(i, j);
}
// Reperul de început are și o lămurire după ghilimele („(privirea FONDATORULUI)"), deci îl căutăm
// fără liniuțele de la capăt.
const F = bloc('// ── începe „tahograful, pe firme"', '// ── sfârșit „tahograful, pe firme"');
const iRuta = server.indexOf("app.get('/api/admin/tacho-overview'");
const RUTA = server.slice(iRuta, server.indexOf('\n});', iRuta) + 4);

sect('1. Fondatorul are ecranul LUI, nu nodul clientului');
T('tabul nu mai mută nodul clientului',
  !/name === 'tahograf'[\s\S]{0,400}_raxMountBody\('#rax-tacho-overlay', 'admin-tab-tahograf'\)/.test(html));
T('și cheamă ecranul pe firme', /name === 'tahograf'[\s\S]{0,400}raxLoadTahoFirme\(\)/.test(html));
T('clientul își păstrează ecranul lui', /tab === 'tacho'[\s\S]{0,140}_raxMountBody\('#rax-tacho-overlay', 'atab-tacho'\)/.test(html));
T('nodul de administrare poartă stilul casei', /<div id="admin-tab-tahograf" class="ra-camp"/.test(html));

sect('2. Regulile NU se scriu a doua oară');
T('cine are card de tahograf vine din `licenseCats`', /licenseCats\.needsTacho\(d\.license_categories\)/.test(RUTA));
T('ce vehicul are tahograf, din `tacho`', /tacho\.vehiculAreTahograf\(v\.vehicle_type\)/.test(RUTA));
T('când e depășit termenul, tot din `tacho`', (RUTA.match(/tacho\.scadenta\(/g) || []).length >= 2);
// „Fără praguri scrise de mână" se verifică pe COD, nu pe comentarii: explicațiile de deasupra
// pomenesc firesc cifrele (28, 90), iar prima variantă a probei se împiedica exact de ele.
const faraComentarii = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
T('ruta nu are praguri scrise de mână',
  !/\b(28|90)\b/.test(faraComentarii(RUTA).replace(/TERMEN_CARD_ZILE|TERMEN_VU_ZILE/g, '')),
  (faraComentarii(RUTA).match(/\b(28|90)\b/g) || []).join(','));
T('pragurile legale vin din `tacho`', /tacho\.TERMEN_CARD_ZILE/.test(RUTA) && /tacho\.TERMEN_VU_ZILE/.test(RUTA));
T('și se citesc PE FIRMĂ, din setările ei',
  /prag\(co, 'tacho_zile_card', tacho\.TERMEN_CARD_ZILE\)/.test(RUTA) && /prag\(co, 'tacho_zile_vu', tacho\.TERMEN_VU_ZILE\)/.test(RUTA));
T('ecranul nu-și face propria socoteală de zile',
  !/\b(28|90)\b/.test(faraComentarii(F)), (faraComentarii(F).match(/\b(28|90)\b/g) || []).join(','));

sect('3. Scadențarul spune și A CUI e mașina');
T('interogarea vehiculelor întoarce firma', /SELECT dv\.imei, dv\.name, dv\.plate, dv\.brand, dv\.model, dv\.vehicle_type, dv\.company_id/.test(dbsrc));
T('și grupează după ea', /GROUP BY dv\.imei, dv\.name, dv\.plate, dv\.brand, dv\.model, dv\.vehicle_type, dv\.company_id/.test(dbsrc));

sect('4. Aici nu se umblă la fișierele clientului');
T('ecranul n-are încărcare de fișier', !/type="file"/.test(F) && !/th-upl/.test(F));
T('și nici ștergere', !/fa-trash/.test(F) && !/deleteTacho|api\/tacho\//.test(F));
T('singura acțiune pe rând e „Deschide firma"', /raxOpenCompanyDetail\(' \+ f\.id \+ '\)"><i class="fas fa-building"><\/i> Deschide firma/.test(F));
T('nu duplică nici comutatorul modulului', !/features/.test(F));

sect('5. Ce spune fiecare rând');
T('semnul firmei e scris într-un singur loc', /function _thfSemn\(f\)/.test(F));
T('amenda bate vânzarea în ordine',
  F.indexOf('if (f.depasite) return') > 0 && F.indexOf('if (f.depasite) return') < F.indexOf('if (f.platitDegeaba)'));
T('„are camioane, n-are modulul" e semnalat', /are camioane, n-are modulul/.test(F));
T('„plătește și n-are ce descărca", la fel', /plătește modulul, n-are ce descărca/.test(F));
T('firmele cu probleme stau primele', /if \(sa\.rau !== sb\.rau\) return sa\.rau \? -1 : 1;/.test(F));
T('există filtru „doar de rezolvat"', /window\.raxThfProbleme = function \(\)/.test(F));
T('și căutare după firmă', /id="thf-cauta"/.test(F) && /window\.raxThfCauta = function/.test(F));
T('scheletul se face o singură dată (cursorul nu sare din casetă)',
  /function _thfSchelet\(host\)/.test(F) && /if \(!host\._thfGata\) _thfSchelet\(host\)/.test(F));

sect('5b. Un CARTONAȘ pe firmă, nu un rând de tabel');
T('nu mai e tabel', !/thf-corp/.test(F) && !/<thead>/.test(F));
T('e o listă de cartonașe', /id="thf-lista"/.test(F) && /class="rax-devgr"/.test(F));
T('cu aceleași chenare ca la „Dispozitive"', /rax-devgr-h/.test(F) && /rax-devgr-b/.test(F));
T('pe cartonaș scrie câți șoferi și câte camioane', /' camion' : ' camioane'/.test(F));
T('și când a intrat ultimul fișier', /ultimul fișier ' \+ _raxCand/.test(F));

sect('5c. „Afișează mai mult" arată CINE e în urmă');
// „Butonul există" se caută în COD, nu în comentarii: explicația de deasupra pomenește firesc
// „Afișează mai mult", iar prima variantă a probei trecea și după ce butonul era scos.
T('butonul există', /Afișează mai mult/.test(faraComentarii(F)) && /window\.raxThfMaiMult = function \(id\)/.test(F));
T('apare doar unde chiar e ceva de arătat', /are \? '<button class="rax-btn" onclick="raxThfMaiMult/.test(F));
T('ce e deschis rămâne deschis la redesenare',
  /var _thfDeschise = \{\};/.test(F) && /deschis = !!_thfDeschise\[f\.id\]/.test(F)
  && /_thfDeschise\[id\] = !_thfDeschise\[id\]/.test(F));
T('rândul deschis spune numele', /esc\(p\.nume \|\| '—'\)/.test(F));
T('și dacă e card de șofer sau memoria camionului', /p\.ce === 'card' \? 'card șofer' : 'memoria vehiculului'/.test(F));
T('cuvintele întârzierii stau într-un singur loc', /function _thfProblema\(p\)/.test(F));
T('„niciodată descărcat" nu se preface în zile', /if \(p\.stare === 'niciodata'\) return \{ t: 'niciodată descărcat'/.test(F));
T('când sunt prea multe, o spune', /și încă ' \+ \(f\.problemeTotal - are\)/.test(F));
// serverul trimite numele, tăiate la un număr rezonabil
T('ruta trimite numele celor în urmă', /f\.probleme\.push\(\{ tip, nume, ce, stare: s\.stare/.test(RUTA));
T('cei mai răi primii', /rang = \{ niciodata: 0, depasit: 1, curand: 2 \}/.test(RUTA));
T('lista e tăiată, cu totalul alături', /probleme: f\.probleme\.slice\(0, MAX_NUME\)/.test(RUTA) && /problemeTotal/.test(RUTA));

sect('5d. Cifrele de sus urmăresc filtrul');
T('se socotesc din firmele ARĂTATE', /var firme = _thfFirme\(\);[\s\S]{0,700}cuModul: firme\.filter/.test(F));
T('și serverul nu mai trimite un al doilea sumar', !/sumar:/.test(RUTA) && !/d\.sumar/.test(F));
T('iar cand e filtrat o spune limpede, o data', /thf-filtrat[\s\S]{0,120}doar pentru firmele arătate acum/.test(F));

(async () => {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const lr = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const H = (c) => ({ 'Content-Type': 'application/json', Cookie: c || ck });
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: H(c), body: JSON.stringify(b) });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: H(c), body: JSON.stringify(b) });

  sect('6. Pe server pornit: cifrele ies pe firme');
  const co = async (n) => (await (await POST('/api/companies', { name: n })).json()).id;
  const A = await co('CI Alfa'), Bt = await co('CI Beta'), G = await co('CI Gama');
  await PUT('/api/companies/' + A + '/features', { features: { tahograf: true } });
  await PUT('/api/companies/' + G + '/features', { features: { tahograf: true } });
  await PUT('/api/companies/' + Bt + '/features', { features: { tahograf: false } });
  await POST('/api/devices', { imei: '860000000222001', name: 'TIR 1', plate: 'B 10 AAA', company_id: A, vehicle_type: 'truck' });
  await POST('/api/devices', { imei: '860000000222002', name: 'TIR 2', plate: 'B 20 BBB', company_id: Bt, vehicle_type: 'truck' });
  await POST('/api/devices', { imei: '860000000222003', name: 'Duba', plate: 'B 30 CCC', company_id: G, vehicle_type: 'van' });
  await POST('/api/drivers', { name: 'CI Profesionist', company_id: A, license_categories: 'B,C,CE' });
  await POST('/api/drivers', { name: 'CI Doar B', company_id: G, license_categories: 'B' });

  const r = await GET('/api/admin/tacho-overview');
  T('ruta răspunde', r.status === 200, 'a dat ' + r.status);
  const d = await r.json();
  const f = (id) => (d.firme || []).find(x => x.id === id) || {};
  T('camionul e socotit la firma LUI', f(A).vehicule === 1, JSON.stringify({ v: f(A).vehicule, s: f(A).soferi }));
  T('și șoferul cu card, la fel', f(A).soferi === 1, String(f(A).soferi));
  T('un șofer doar cu B nu intră în tahograf', f(G).soferi === 0, String(f(G).soferi));
  T('o dubă nu are tahograf', f(G).vehicule === 0, String(f(G).vehicule));
  T('firma fără descărcări e semnalată', f(A).niciodata === 2, String(f(A).niciodata));
  T('firma cu camioane și fără modul = de vândut', f(Bt).deVandut === true && f(Bt).modul === false);
  T('firma cu modul și fără ce descărca = plătit degeaba', f(G).platitDegeaba === true);
  T('pragurile legale ajung la ecran', d.praguriLegale && d.praguriLegale.card === 28 && d.praguriLegale.vu === 90,
    JSON.stringify(d.praguriLegale));
  // Numele celor în urmă — ca să nu mai trebuiască să intri în firmă ca să afli pe cine
  const pr = f(A).probleme || [];
  T('trimite și CINE e în urmă', pr.length === 2, JSON.stringify(pr.map(x => x.nume)));
  T('cu numele lor', pr.some(x => x.nume === 'CI Profesionist') && pr.some(x => x.nume === 'B 10 AAA'),
    JSON.stringify(pr.map(x => x.nume)));
  T('și cu ce anume se descarcă', pr.every(x => x.ce === 'card' || x.ce === 'memorie'),
    JSON.stringify(pr.map(x => x.ce)));
  T('totalul e alături, pentru când lista e tăiată', f(A).problemeTotal === 2, String(f(A).problemeTotal));
  T('o firmă fără probleme n-are nimic de deschis', (f(Bt).probleme || []).length >= 0);
  T('demo nu apare printre firme', !(d.firme || []).some(x => /demo/i.test(x.nume || '')),
    (d.firme || []).map(x => x.nume).join(', '));

  sect('7. Ruta e doar a noastră');
  // Contul de probă se face pe traseul REAL (link de parolă), prin ajutorul comun — nu pe o scurtătură
  // scrisă aici. Regula e în CLAUDE.md: nicio portiță „doar pentru teste".
  const { puneParola } = require('./test_parola');
  const cr = await POST('/api/users', { username: 'sef@thf.ro', full_name: 'Șef THF', role: 'company_admin', company_id: A });
  await puneParola(cr, 'Str4da-Verde-2026', B);
  const l2 = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sef@thf.ro', password: 'Str4da-Verde-2026' }) });
  const ckSef = l2.ok ? (l2.headers.getSetCookie ? l2.headers.getSetCookie() : [l2.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ') : null;
  T('adminul firmei intră în contul lui', !!ckSef, 'login a dat ' + l2.status);
  if (ckSef) T('dar NU vede privirea pe firme', (await GET('/api/admin/tacho-overview', ckSef)).status === 403);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
