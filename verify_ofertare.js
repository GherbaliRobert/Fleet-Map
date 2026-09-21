// verify_ofertare.js — Ofertare Live: butonul rupt, banii de la început, pâlnia de oferte.
//
//   node verify_ofertare.js
//
// Trei lucruri găsite pe 21.09, umblând prin secțiune:
//
//   1. Butonul „Aplică RA Insight pe companie" NU FĂCEA NIMIC la ofertele cu pachet de apeluri —
//      adică exact cazul obișnuit. Rămăsese în text „· peste cotă X €/apel", de pe vremea când
//      depășirea se plătea; funcția a fost scoasă deliberat, variabila a plecat cu ea, textul a
//      rămas. Fereastra crăpa cu `priceEur is not defined`. La ofertele „nelimitat" mergea, de-aia
//      n-a sărit în ochi.
//   2. Lista de oferte arăta doar abonamentul lunar. Banii de la ÎNCEPUT (montaj + aparate) —
//      de obicei suma cea mare, 7.000 de lei lângă 290 lei/lună — lipseau cu totul.
//   3. O ofertă n-avea stare și n-avea termen: nu știai care e trimisă, care e moartă de trei luni.
//
// Ce apără proba: cele trei să nu se întoarcă, iar regulile pâlniei (stările, termenul, motivele
// pierderii) să stea ÎNTR-UN SINGUR LOC — pe server — nu scrise a doua oară în pagină.
const { spawn } = require('child_process');
const fs = require('fs');

const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const dbsrc = fs.readFileSync(P('db.js'), 'utf8');

const PORT = 3199, DIR = '.of-ci-db';
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234',
  SESSION_SECRET: 'ci_of', PORT: String(PORT), TCP_PORT: '5199', PGLITE_DIR: DIR + '/pgdata' };
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
function bloc(sursa, a, b) {
  const i = sursa.indexOf(a), j = sursa.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return sursa.slice(i, j);
}
const PAL = bloc(html, '// ── începe „pâlnia de oferte"', '// ── sfârșit „pâlnia de oferte"');
const RUTE = bloc(server, '// ── începe „pâlnia de oferte"', '// ── sfârșit „pâlnia de oferte"');
const faraComentarii = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

sect('1. Butonul „Aplică RA Insight" nu mai e rupt');
// Se caută în TOT fișierul, dar doar în COD: variabila nu trebuie să mai existe nicăieri, nici
// într-o altă copie — iar comentariile o pomenesc firesc, explicând ce s-a stricat.
T('`priceEur` a dispărut din pagină', !/priceEur/.test(faraComentarii(html)));
T('nu mai există preț pe întrebare în fereastră', !/€\/apel/.test(faraComentarii(html)));
T('scrie ce se întâmplă de fapt la epuizare',
  /RA Insight se oprește până luna următoare, fără cost în plus/.test(html));
T('și vorbește pe CONT, cum se vinde din 11.09',
  /întrebări pe cont\/lună/.test(html) && !/apeluri\/lună/.test(faraComentarii(html)));

sect('2. Banii de la ÎNCEPUT se văd în listă');
T('coloana există', /<th class="num">La început<\/th>/.test(html));
T('se salvează ca număr propriu', /once_total: onceLei/.test(html));
T('socotit cu cursul ÎNGHEȚAT în ofertă, nu cu cel de azi',
  /\(r\.hwTotal \|\| 0\) \* \(r\.cfg\.fxRate \|\| _fxRate\)/.test(html));
T('serverul îl primește și îl scrie', /once_total: b\.once_total/.test(server) && /once_total/.test(dbsrc));
T('coloana există în bază', /ALTER TABLE offers ADD COLUMN IF NOT EXISTS once_total/.test(dbsrc));
T('ofertele vechi arată o liniuță, nu „0 lei"',
  /o\.once_total != null && Number\(o\.once_total\) > 0[\s\S]{0,400}>—<\/span>/.test(html));
T('amândouă sumele, în lei ȘI euro', /var bani = function \(lei, fx\)[\s\S]{0,300}' lei<\/b>'[\s\S]{0,200}' €<\/span>'/.test(html));
T('cursul din ofertă, nu cel de azi', /var fxOf = function \(o\) \{ return \(\(o\.config && o\.config\.cfg && o\.config\.cfg\.fxRate\) \|\| _fxRate\); \}/.test(html));

sect('3. Pâlnia: stările stau ÎNTR-UN SINGUR loc, pe server');
T('serverul are lista de stări', /const OFERTA_STARI = \['ciorna', 'trimisa', 'acceptata', 'pierduta'\]/.test(RUTE));
T('și termenul implicit', /const OFERTA_VALABIL_ZILE = \d+/.test(RUTE));
T('și motivele pentru care se pierde o ofertă', /const OFERTA_MOTIVE_PIERDUT = \[/.test(RUTE));
T('ecranul le CERE de la server, nu le scrie',
  /\/api\/admin\/offers\/meta/.test(PAL) && !/OFERTA_MOTIVE_PIERDUT/.test(PAL));
T('ecranul nu-și scrie lista de motive', !/A ales alt furnizor/.test(PAL) && /A ales alt furnizor/.test(RUTE));
// Fereastra „ultima lună" (30 de zile) e altceva decât termenul ofertei — e o fereastră de
// privit, nu o regulă de afacere. De-aia se scoate din căutare, ca să nu dea alarmă falsă.
T('ecranul nu-și scrie termenul', !/\b30\b/.test(faraComentarii(PAL).replace(/30 \* 86400000/g, '')),
  (faraComentarii(PAL).replace(/30 \* 86400000/g, '').match(/\b30\b/g) || []).join(','));
T('și nici nu ține o valoare „de rezervă" pentru el', /valabilZile: null/.test(PAL));
// Orice stare pe care o scrie serverul trebuie să aibă un cuvânt pe ecran, altfel apare o pastilă goală.
const stariServer = (RUTE.match(/const OFERTA_STARI = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
T('fiecare stare de pe server are un cuvânt pe ecran',
  stariServer.length === 4 && stariServer.every(s => new RegExp('\\b' + s + ':\\s*\\{').test(PAL)),
  stariServer.join(','));

sect('4. „Expirată" se socotește, nu se ține în bază');
T('starea arătată se face dintr-o singură funcție', /function _ofStare\(o\)/.test(PAL));
T('și „expirată" iese din termen, nu din coloană',
  /s === 'trimisa' && o\.valid_until && Number\(o\.valid_until\) < Date\.now\(\)[\s\S]{0,40}'expirata'/.test(PAL));
T('serverul NU cunoaște starea „expirata"', !/'expirata'/.test(RUTE) && !/expirata/.test(dbsrc));

sect('5. Ce poți face cu o ofertă, după starea ei');
T('butoanele se aleg din stare', /function _ofButoaneStare\(o\)/.test(PAL));
T('o ciornă nu se poate pierde — n-ai trimis-o', /if \(s === 'ciorna'\) return b\('raxOfTrimisa'/.test(PAL));
T('una trimisă sau expirată se acceptă sau se pierde',
  /if \(s === 'trimisa' \|\| s === 'expirata'\) return b\('raxOfAcceptata'[\s\S]{0,120}raxOfPierduta/.test(PAL));
T('una decisă se poate redeschide', /return b\('raxOfRedeschide'/.test(PAL));
T('„Pierdută" cere un motiv', /window\.raxOfPierduta = function \(id\)[\s\S]{0,700}ra-of-dlg-motiv/.test(PAL));
T('fereastra e una singură, refolosită', /function _ofFereastra\(titlu, ic, corp, onOk\)/.test(PAL)
  && (PAL.match(/_ofFereastra\(/g) || []).length >= 3);

sect('6. Cifrele de sus urmăresc ofertele arătate');
T('se socotesc din rândurile primite', /function _ofPalnieHtml\(rows\)/.test(PAL) && /rows\.filter/.test(PAL));
T('serverul nu trimite un al doilea sumar', !/sumar/.test(RUTE));
T('etichetele nu se strică la unu', /acceptate === 1 \? 'acceptată' : 'acceptate'/.test(PAL));

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

  sect('7. Pe server pornit: traseul unei oferte');
  const mr = await GET('/api/admin/offers/meta');
  T('cuvintele ajung la ecran', mr.status === 200, 'a dat ' + mr.status);
  const meta = await mr.json();
  T('cu toate patru stările', (meta.stari || []).length === 4, JSON.stringify(meta.stari));
  T('cu termenul implicit', Number(meta.valabilZile) > 0, String(meta.valabilZile));
  T('și cu motivele pierderii', (meta.motivePierdut || []).length >= 5, String((meta.motivePierdut || []).length));

  const mk = async (n) => (await (await POST('/api/admin/offers',
    { name: n, client_name: 'CI ' + n, monthly_total: 290, once_total: 7000, currency: 'RON',
      config: { cfg: { nVeh: 10, fxRate: 5.05 }, prices: {} } })).json());
  const o1 = await mk('CI Ofertă A');
  T('o ofertă nouă se naște ciornă', o1.status === 'ciorna', o1.status);
  T('și banii de la început se scriu', Number(o1.once_total) === 7000, String(o1.once_total));

  const t1 = await (await PUT('/api/admin/offers/' + o1.id + '/stare', { status: 'trimisa' })).json();
  T('„trimisă" pune singură un termen', !!t1.valid_until, String(t1.valid_until));
  T('și data trimiterii o scrie SERVERUL', !!t1.sent_at, String(t1.sent_at));
  const zile = Math.round((Number(t1.valid_until) - Date.now()) / 86400000);
  T('termenul e cel din server, nu altul', zile === meta.valabilZile, zile + ' vs ' + meta.valabilZile);

  const fp = await PUT('/api/admin/offers/' + o1.id + '/stare', { status: 'pierduta' });
  T('nu poți pierde o ofertă fără să spui de ce', fp.status === 400, String(fp.status));
  const p1 = await (await PUT('/api/admin/offers/' + o1.id + '/stare',
    { status: 'pierduta', lost_reason: 'A ales alt furnizor — la 24 lei/mașină' })).json();
  T('cu motiv, se poate', p1.status === 'pierduta' && /alt furnizor/.test(p1.lost_reason || ''), JSON.stringify(p1.lost_reason));
  T('și se scrie când s-a decis', !!p1.decided_at, String(p1.decided_at));

  const o2 = await mk('CI Ofertă B');
  await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'trimisa' });
  const a2 = await (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'acceptata' })).json();
  T('„acceptată" curăță motivul pierderii', a2.status === 'acceptata' && !a2.lost_reason, JSON.stringify(a2.lost_reason));
  const r2 = await (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'ciorna' })).json();
  T('„redeschide" o întoarce în ciornă, fără dată de decizie', r2.status === 'ciorna' && !r2.decided_at, JSON.stringify(r2.decided_at));

  const rau = await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'expirata' });
  T('o stare inventată e refuzată', rau.status === 400, String(rau.status));
  // „Expirată" nu se scrie NICIODATĂ în bază: o ofertă trimisă cu termen trecut rămâne „trimisa",
  // iar ecranul o arată expirată. Altfel starea s-ar învechi dacă nu trece nimeni pe la ecran.
  const o3 = await mk('CI Ofertă C');
  const vechi = await (await PUT('/api/admin/offers/' + o3.id + '/stare',
    { status: 'trimisa', valid_until: Date.now() - 4 * 86400000 })).json();
  T('o ofertă cu termen trecut rămâne „trimisa" în bază', vechi.status === 'trimisa', vechi.status);
  T('dar poartă termenul depășit', Number(vechi.valid_until) < Date.now());

  sect('8. Ruta e doar a noastră');
  const { puneParola } = require('./test_parola');
  const co = (await (await POST('/api/companies', { name: 'CI Ofertare' })).json()).id;
  const cr = await POST('/api/users', { username: 'sef@of.ro', full_name: 'Șef OF', role: 'company_admin', company_id: co });
  await puneParola(cr, 'Str4da-Verde-2026', B);
  const l2 = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sef@of.ro', password: 'Str4da-Verde-2026' }) });
  const ckSef = l2.ok ? (l2.headers.getSetCookie ? l2.headers.getSetCookie() : [l2.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ') : null;
  T('adminul firmei intră în contul lui', !!ckSef, 'login a dat ' + l2.status);
  if (ckSef) {
    T('dar nu vede ofertele', (await GET('/api/admin/offers', ckSef)).status === 403);
    T('nici cuvintele pâlniei', (await GET('/api/admin/offers/meta', ckSef)).status === 403);
    T('și nu poate muta o ofertă în altă stare',
      (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'acceptata' }, ckSef)).status === 403);
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
