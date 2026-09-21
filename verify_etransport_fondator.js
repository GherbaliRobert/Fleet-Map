// verify_etransport_fondator.js — e-Transport, privirea FONDATORULUI: firmele, nu transporturile.
//
//   node verify_etransport_fondator.js
//
// Ecranul de e-Transport al clientului e al lui și rămâne cum e. Fondatorul îl vedea pe ACELAȘI
// ecran — literalmente același nod, mutat în panoul de administrare — hrănit cu transporturile
// TUTUROR firmelor și fără coloană de firmă: scria „Ford Transit · UIT 3049…" și nu puteai spune al
// cui e (Alin, 18.09).
//
// Mai rău decât la tahograf: pe fiecare rând era buton „Șterge", iar `ownsRow` întoarce `true`
// pentru super-admin — adică se putea șterge dovada de conformitate ANAF a unui client de pe un
// ecran unde nici nu vedeai al cui e. De-aia secțiunea 4 de mai jos e cea care contează cel mai mult.
//
// Ce apără proba:
//   • fondatorul are ecranul LUI, pe firme, nu nodul clientului mutat;
//   • pe ecranul fondatorului NU se adaugă și NU se șterge niciun transport;
//   • regulile (termen UIT, tăcere, stare) NU se scriu a doua oară — vin din `etransport.js`;
//   • nicio durată legală scrisă de mână în ecran (5 / 15 / 15 min / 24 h vin de la server);
//   • transportul e socotit la firma LUI, iar ruta e doar a super-adminului;
//   • banda ANAF e la NOI (tokenul e al platformei), iar cea a clientului nu mai zice „lipsește tokenul".
const { spawn } = require('child_process');
const fs = require('fs');

const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const reguli = fs.readFileSync(P('etransport.js'), 'utf8');

const PORT = 3198, DIR = '.etf-ci-db';
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234',
  SESSION_SECRET: 'ci_etf', PORT: String(PORT), TCP_PORT: '5198', PGLITE_DIR: DIR + '/pgdata' };
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
// Reperul de început are și o lămurire după ghilimele, deci îl căutăm fără liniuțele de la capăt.
const F = bloc('// ── începe „e-Transportul, pe firme"', '// ── sfârșit „e-Transportul, pe firme"');
const iRuta = server.indexOf("app.get('/api/admin/etransport-overview'");
const RUTA = iRuta < 0 ? '' : server.slice(iRuta, server.indexOf('\n});', iRuta) + 4);
// Pragurile se citesc DIN SURSĂ, nu se scriu aici: dacă le-aș scrie, proba ar trece și după ce
// cineva le-ar muta în `etransport.js`, iar cele două ar începe să se contrazică în tăcere.
const nr = (re) => { const m = reguli.match(re); return m ? Number(m[1]) : NaN; };
const ZILE_NATIONAL = nr(/const ZILE_NATIONAL = (\d+)/);
const ZILE_INTRA = nr(/const ZILE_INTRACOMUNITAR = (\d+)/);
const TACERE = nr(/const TACERE_MINUTE = (\d+)/);
const CURAND = nr(/const CURAND_ORE = (\d+)/);
// „Fără cifre scrise de mână" se verifică pe COD, nu pe comentarii: explicațiile pomenesc firesc
// duratele (5 zile, 15 minute), iar o probă naivă s-ar împiedica exact de ele.
const faraComentarii = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

sect('0. Pragurile se citesc din `etransport.js`, nu din probă');
T('am găsit toate cele patru', [ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND].every(Number.isFinite),
  JSON.stringify({ ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND }));

sect('1. Fondatorul are ecranul LUI, nu nodul clientului');
// Ghilimelele se acceptă de amândouă felurile: prima variantă cerea apostrofuri și trecea liniștită
// peste o mutare scrisă cu ghilimele duble.
T('tabul nu mai mută nodul clientului',
  !/name === 'etransport'[\s\S]{0,500}_raxMountBody\(\s*['"]#rax-et-overlay['"]\s*,\s*['"]admin-tab-etransport['"]/.test(html));
T('și cheamă ecranul pe firme', /name === 'etransport'[\s\S]{0,500}raxLoadEtFirme\(\)/.test(html));
T('clientul își păstrează ecranul lui', /tab === 'etransport'[\s\S]{0,160}_raxMountBody\('#rax-et-overlay', 'atab-etransport'\)/.test(html));
T('ruta fondatorului există', !!RUTA);
T('și e a super-adminului, în scris', /app\.get\('\/api\/admin\/etransport-overview', requireAuth, requireSuperadmin/.test(server));

sect('2. Regulile NU se scriu a doua oară');
T('starea transportului vine din `etransport.js`', /etr\.stareTransport\(t, acum, anafPornit\)/.test(RUTA));
T('și pragurile trimise la ecran, tot de acolo',
  /etr\.TACERE_MINUTE/.test(RUTA) && /etr\.CURAND_ORE/.test(RUTA)
  && /etr\.ZILE_NATIONAL/.test(RUTA) && /etr\.ZILE_INTRACOMUNITAR/.test(RUTA));
T('ruta nu are durate scrise de mână',
  !new RegExp('\\b(' + [ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND].join('|') + ')\\b')
    .test(faraComentarii(RUTA).replace(/etr\.[A-Z_]+/g, '').replace(/86400000/g, '')),
  faraComentarii(RUTA).replace(/etr\.[A-Z_]+/g, '').replace(/86400000/g, '')
    .match(new RegExp('\\b(' + [ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND].join('|') + ')\\b', 'g')));
T('nici ecranul nu-și scrie vreo durată',
  !new RegExp('\\b(' + [ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND].join('|') + ')\\b').test(faraComentarii(F)),
  (faraComentarii(F).match(new RegExp('\\b(' + [ZILE_NATIONAL, ZILE_INTRA, TACERE, CURAND].join('|') + ')\\b', 'g')) || []).join(','));
T('ecranul le ia din răspunsul serverului',
  /pr\.zileNational/.test(F) && /pr\.zileIntracomunitar/.test(F) && /pr\.tacereMinute/.test(F) && /pr\.curandOre/.test(F));

sect('3. Transportul e socotit la firma LUI');
T('gruparea se face pe `company_id`', /perFirma\.get\(t\.company_id\)/.test(RUTA));
T('interogarea întoarce toate firmele', /db\.getEtransportScadentar\(null\)/.test(RUTA));
T('flota demo nu intră', /DEMO_SET\.has\(t\.imei\)/.test(RUTA) && /co\.is_demo \|\| co\.id === demoCompanyId/.test(RUTA));
T('ultima poziție se împerechează cu cea din memorie, ca la client', /livePositions\.get\(t\.imei\)/.test(RUTA));

sect('4. Aici NU se umblă la transporturile clientului');
T('ecranul n-are ștergere', !/raxDelEt/.test(F) && !/Șterge/.test(faraComentarii(F)) && !/fa-trash/.test(F));
T('și nici adăugare', !/raxAddEt|rax-et-add/.test(F) && !/<form/.test(F) && !/method: 'POST'/.test(F));
T('nu cheamă deloc ruta transporturilor', !/\/api\/etransport(?!-overview)/.test(F));
T('singura acțiune pe rând e „Deschide firma"',
  /raxOpenCompanyDetail\(' \+ f\.id \+ '\)"><i class="fas fa-building"><\/i> Deschide firma/.test(F));
T('nu duplică nici comutatorul modulului', !/features/.test(F));

sect('5. Ce spune fiecare rând');
T('semnul firmei e scris într-un singur loc', /function _etfSemn\(f\)/.test(F));
T('amenda bate vânzarea în ordine',
  F.indexOf('if (f.probleme) return') > 0 && F.indexOf('if (f.probleme) return') < F.indexOf('if (f.platitDegeaba)'));
T('„are mașini, n-are modulul" e semnalat', /are mașini, n-are modulul/.test(F));
T('„plătește și n-a introdus niciun cod", la fel', /plătește modulul, n-a introdus niciun cod/.test(F));
T('firmele cu probleme stau primele', /if \(sa\.rau !== sb\.rau\) return sa\.rau \? -1 : 1;/.test(F));
T('există filtru „doar de rezolvat"', /window\.raxEtfProbleme = function \(\)/.test(F));
T('și căutare după firmă', /id="etf-cauta"/.test(F) && /window\.raxEtfCauta = function/.test(F));
T('scheletul se face o singură dată (cursorul nu sare din casetă)',
  /function _etfSchelet\(host\)/.test(F) && /if \(!host\._etfGata\) _etfSchelet\(host\)/.test(F));

sect('5b. Un CARTONAȘ pe firmă, ca la tahograf și la Dispozitive');
T('e o listă de cartonașe', /id="etf-lista"/.test(F) && /class="rax-devgr"/.test(F));
T('cu aceleași chenare', /rax-devgr-h/.test(F) && /rax-devgr-b/.test(F));
T('pe cartonaș scrie câte transporturi active are', /' transport activ' : ' transporturi active'/.test(F));
T('și când a intrat ultimul cod', /ultimul cod ' \+ _raxCand/.test(F));
T('ajutoarele comune nu s-au copiat a doua oară',
  !/function _raxCand\(/.test(F) && !/function _raxNumar\(/.test(F)
  && (html.match(/function _raxCand\(/g) || []).length === 1);

sect('5c. „Afișează mai mult" arată CARE transport e problema');
T('butonul există', /Afișează mai mult/.test(faraComentarii(F)) && /window\.raxEtfMaiMult = function \(id\)/.test(F));
T('apare doar unde chiar e ceva de arătat', /are \? '<button class="rax-btn" onclick="raxEtfMaiMult/.test(F));
T('ce e deschis rămâne deschis la redesenare',
  /_etfDeschise = \{\}/.test(F) && /deschis = !!_etfDeschise\[f\.id\]/.test(F)
  && /_etfDeschise\[id\] = !_etfDeschise\[id\]/.test(F));
T('rândul deschis spune mașina și codul UIT', /esc\(p\.vehicul \|\| '—'\)/.test(F) && /UIT ' \+ esc\(p\.uit/.test(F));
T('și de ce e problemă (motivele vin de la server)', /p\.motive\.join\(' · '\)/.test(F));
T('cuvintele întârzierii stau într-un singur loc', /function _etfProblema\(p\)/.test(F));
T('„fără termen" nu se preface în ore', /if \(p\.ore == null\) return \{ t: 'fără termen'/.test(F));
T('când sunt prea multe, o spune', /și încă ' \+ \(f\.problemeTotal - are\)/.test(F));
T('ruta trimite CARE transporturi sunt', /f\.lista\.push\(\{\s*uit: t\.uit/.test(RUTA));
T('cele mai rele primele', /rang = \{ problema: 0, curand: 1 \}/.test(RUTA));
T('lista e tăiată, cu totalul alături', /lista: f\.lista\.slice\(0, MAX_NUME\)/.test(RUTA) && /problemeTotal/.test(RUTA));

sect('5d. Cifrele de sus urmăresc filtrul');
// Fereastra e largă dinadins: între cele două stă banda ANAF, care se poate lungi. Ce contează e
// ORDINEA — lista filtrată se face ÎNAINTE de socoteala cifrelor de sus, nu invers.
T('se socotesc din firmele ARĂTATE', /var firme = _etfFirme\(\);[\s\S]{0,3000}cuModul: firme\.filter/.test(F));
T('și serverul nu trimite un al doilea sumar', !/sumar:/.test(RUTA) && !/d\.sumar/.test(F));
T('iar când e filtrat o spune limpede, o dată', /thf-filtrat[\s\S]{0,120}doar pentru firmele arătate acum/.test(F));

sect('6. Banda ANAF: tokenul e al NOSTRU, nu al firmei');
T('starea raportării urcă în ecranul fondatorului', /id="etf-anaf"/.test(F) && /d\.anaf && d\.anaf\.pornit/.test(F));
T('și spune limpede că e tokenul nostru', /nu e setat tokenul nostru/.test(F));
// Cu tokenul pornit, ecranul nu are voie să ne liniștească: tokenul ȘI CIF-ul sunt unele singure, pe
// toată platforma, deci am declara pentru toți clienții sub CIF-ul NOSTRU (E.1 din lista de lansare).
T('iar când e pornit, avertizează despre CIF-ul unic',
  /sub UN SINGUR CIF: al nostru/.test(F) && /nu porni modulul la clienți/.test(F));
T('avertismentul e purtat de banda de ATENȚIE, nu de cea verde',
  !/d\.anaf && d\.anaf\.pornit\)\s*\?\s*'<div class="th-b b-ok"/.test(F));
T('ecranul clientului nu mai zice „lipsește tokenul"',
  !/Nu trimitem nimic la ANAF — lipsește tokenul/.test(html));
T('ci îi spune că ne ocupăm noi', /Raportarea către ANAF nu e pornită încă — ne ocupăm noi de ea/.test(html));
T('dar NU i se ascunde că raportarea nu merge', /th-b b-warn[\s\S]{0,200}Raportarea către ANAF nu e pornită/.test(html));

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

  sect('7. Pe server pornit: cifrele ies pe firme');
  const co = async (n) => (await (await POST('/api/companies', { name: n })).json()).id;
  const A = await co('CI Etr Alfa'), Bt = await co('CI Etr Beta'), G = await co('CI Etr Gama');
  await PUT('/api/companies/' + A + '/features', { features: { etransport: true } });
  await PUT('/api/companies/' + G + '/features', { features: { etransport: true } });
  await PUT('/api/companies/' + Bt + '/features', { features: { etransport: false } });
  await POST('/api/devices', { imei: '860000000333101', name: 'TIR A', plate: 'B 10 AAA', company_id: A, vehicle_type: 'truck' });
  await POST('/api/devices', { imei: '860000000333102', name: 'TIR B', plate: 'B 20 BBB', company_id: Bt, vehicle_type: 'truck' });

  // Un transport cu termen DEPĂȘIT (deci „de rezolvat") și unul care expiră curând.
  // Unul cu firma luată de pe VEHICUL, celălalt cu firma spusă explicit — amândouă căile prin care
  // un transport își găsește firma când îl scrie cineva fără companie proprie (super-admin).
  const acum = Date.now(), ZI = 86400000;
  const t1 = await POST('/api/etransport', { uit: 'CI-UIT-EXPIRAT', imei: '860000000333101',
    tip_operatiune: 'national', valabil_pana: new Date(acum - 2 * ZI).toISOString(), status: 'activ' });
  const t2 = await POST('/api/etransport', { uit: 'CI-UIT-CURAND', imei: '860000000333101', company_id: A,
    tip_operatiune: 'national', valabil_pana: new Date(acum + 3 * 3600000).toISOString(), status: 'activ' });
  T('transportul se creează', t1.status === 200 && t2.status === 200, t1.status + '/' + t2.status);
  // Fără vehicul și fără firmă, rândul se scria cu `company_id = NULL` și dispărea din amândouă
  // ecranele. Acum se refuză pe față.
  const orfan = await POST('/api/etransport', { uit: 'CI-UIT-ORFAN', tip_operatiune: 'national' });
  T('un transport fără firmă e refuzat, nu salvat orfan', orfan.status === 400,
    orfan.status + ' ' + JSON.stringify(await orfan.json().catch(() => ({}))));

  const r = await GET('/api/admin/etransport-overview');
  T('ruta răspunde', r.status === 200, 'a dat ' + r.status);
  const d = await r.json();
  const f = (id) => (d.firme || []).find(x => x.id === id) || {};
  T('transporturile cad la firma LOR', f(A).active === 2, JSON.stringify({ a: f(A).active, b: f(Bt).active, g: f(G).active }));
  T('niciunul nu se scurge la altă firmă', (f(Bt).active || 0) === 0 && (f(G).active || 0) === 0);
  T('codul expirat e „de rezolvat"', f(A).probleme >= 1, JSON.stringify({ probleme: f(A).probleme, curand: f(A).curand }));
  T('firma cu mașini și fără modul = de vândut', f(Bt).deVandut === true && f(Bt).modul === false);
  T('firma cu modul și fără niciun cod = plătit degeaba', f(G).platitDegeaba === true);
  T('pragurile ajung la ecran din `etransport.js`',
    d.praguri && d.praguri.zileNational === ZILE_NATIONAL && d.praguri.zileIntracomunitar === ZILE_INTRA
    && d.praguri.tacereMinute === TACERE && d.praguri.curandOre === CURAND, JSON.stringify(d.praguri));
  T('starea raportării ANAF vine ca stare a platformei', d.anaf && typeof d.anaf.pornit === 'boolean');
  // CARE transporturi — ca să nu mai trebuiască să intri în firmă ca să afli
  const li = f(A).lista || [];
  T('trimite și CARE transporturi sunt', li.length >= 1, JSON.stringify(li.map(x => x.uit)));
  T('cu codul UIT și mașina', li.some(x => x.uit === 'CI-UIT-EXPIRAT') && li.every(x => !!x.vehicul),
    JSON.stringify(li.map(x => [x.uit, x.vehicul])));
  T('cel expirat e primul', li[0] && li[0].stare === 'problema', JSON.stringify(li[0]));
  T('totalul e alături, pentru când lista e tăiată', f(A).problemeTotal === li.length, String(f(A).problemeTotal));
  T('demo nu apare printre firme', !(d.firme || []).some(x => /demo/i.test(x.nume || '')),
    (d.firme || []).map(x => x.nume).join(', '));

  sect('8. Ruta e doar a noastră');
  // Contul de probă se face pe traseul REAL (link de parolă), prin ajutorul comun — nu pe o
  // scurtătură scrisă aici. Regula e în CLAUDE.md: nicio portiță „doar pentru teste".
  const { puneParola } = require('./test_parola');
  const cr = await POST('/api/users', { username: 'sef@etf.ro', full_name: 'Șef ETF', role: 'company_admin', company_id: A });
  await puneParola(cr, 'Str4da-Verde-2026', B);
  const l2 = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sef@etf.ro', password: 'Str4da-Verde-2026' }) });
  const ckSef = l2.ok ? (l2.headers.getSetCookie ? l2.headers.getSetCookie() : [l2.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ') : null;
  T('adminul firmei intră în contul lui', !!ckSef, 'login a dat ' + l2.status);
  if (ckSef) T('dar NU vede privirea pe firme', (await GET('/api/admin/etransport-overview', ckSef)).status === 403);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
