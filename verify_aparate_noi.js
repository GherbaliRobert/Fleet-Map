// verify_aparate_noi.js — aparatele intră în aplicație O SINGURĂ DATĂ (în Stoc) și anunțul „aparate noi transmit".
//
//   node verify_aparate_noi.js
//
// Alin (30.09): „Aparatele intră o singură dată, în Stoc, cu IMEI-ul, și apar singure la Neasignate? — da. Și apoi le
// dăm instalatorului, primim notificare că au fost instalate, le găsim în Dispozitive și de acolo le asignăm." și
// „Fac anunțul «aparate noi transmit»? — da, pregătește-l ca notificare, să fie funcțional atunci când face Robert."
// Proba ține: regula (montaj.js), ecranul (index.html), serverul (o singură funcție de anunț, lista de acceptate la
// conectare) și tot drumul pe server pornit, cu trackere adevărate pe TCP și cu ceasul mutat.

const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const M = require('./montaj.js');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const J = JSON.stringify;
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

sect('1. Regula (montaj.js)');
T('trackerele transmit (FMC130 / FMC150 / FMC650), modulul LV-CAN nu', M.transmite('fmc130') && M.transmite('fmc150') && M.transmite('fmc650') && !M.transmite('lvcan200') && !M.transmite('nimic'));
const S = require('./stoc.js');
T('din stoc e primit la conectare DOAR ce e încă al nostru și nemontat: depozit, la instalator (montat / returnat / defect / casat — nu)',
  J(S.PRIMITE_LA_CONECTARE) === J(['depozit', 'instalator']) && ['montat', 'retur', 'defect', 'casat'].every((st) => !S.primitLaConectare(st)) && S.primitLaConectare('depozit') && S.primitLaConectare('instalator'));
T('la un GPS, seria e IMEI-ul: altceva se spune pe nume', J(M.seriiFaraImei('fmc130', ['860000000000101', 'SN-123', '12345'])) === J(['SN-123', '12345']));
T('la un modul, orice serie merge', M.seriiFaraImei('lvcan200', ['SN-1', 'X']).length === 0);
const L = [
  { id: 11, company_id: 5, company_name: 'Transport SRL', partener_id: 1, partener_nume: 'Ionescu', zi: '2026-09-30', status: 'programat', masini: 10 },
  { id: 12, company_id: 7, company_name: 'Alfa SRL', partener_id: 2, partener_nume: 'Popescu', zi: '2026-09-29', status: 'programat', masini: 3 },
  { id: 13, company_id: 9, company_name: 'Vechi SRL', partener_id: 1, partener_nume: 'Ionescu', zi: '2026-09-20', status: 'programat', masini: 3 },
  { id: 14, company_id: 9, company_name: 'Vechi SRL', partener_id: 1, partener_nume: 'Ionescu', zi: '2026-09-30', status: 'de_programat', masini: 0 }
];
const azi = (i) => ({ imei: i, zi: '2026-09-30' });
T('aparatul la instalatorul Ionescu → montajul LUI de azi (Transport SRL)', (M.propuneFirma(azi('861'), { stare: 'instalator', partener_id: 1 }, L) || {}).id === 11);
T('aparatul la Popescu → montajul lui de ieri (Alfa SRL): instalatorul poate întârzia o zi-două', (M.propuneFirma(azi('862'), { stare: 'instalator', partener_id: 2 }, L) || {}).id === 12);
T('aparat din depozit, două firme cu montaj în zilele astea → nicio propunere (mai bine nimic decât greșit)', M.propuneFirma(azi('863'), { stare: 'depozit', partener_id: null }, L) === null);
T('stocul spune alt instalator decât calendarul → nicio propunere', M.propuneFirma(azi('864'), { stare: 'instalator', partener_id: 3 }, L) === null);
T('montajul de acum 10 zile nu se mai potrivește (fereastra: azi + ' + M.ZILE_POTRIVIRE_MONTAJ + ' zile înainte)', M.propuneFirma({ imei: 'x', zi: '2026-09-30' }, null, [L[2]]) === null && M.ZILE_POTRIVIRE_MONTAJ === 2);
T('un montaj de azi, fără alt candidat, se propune și fără stoc', (M.propuneFirma(azi('865'), null, [L[0]]) || {}).id === 11);
T('o lucrare nici programată, nici montată (fără zi) nu propune nimic', M.propuneFirma(azi('866'), null, [L[3]]) === null);
const gr = M.grupeazaAparateNoi(['861', '862', '863', '870'].map(azi), { '861': { partener_id: 1 }, '862': { partener_id: 2 }, '870': { partener_id: 1 } }, L);
T('loturi pe firmă propusă, lotul „fără firmă" la urmă', gr.length === 3 && gr[0].company_id === 5 && J(gr[0].imeis) === J(['861', '870']) && gr[1].company_id === 7 && gr[2].company_id === null && J(gr[2].imeis) === J(['863']), J(gr));
T('lotul poartă câte mașini sunt programate în ziua aia (pentru „s-au adunat toate")', gr[0].masini === 10 && gr[0].lucrare_id === 11 && gr[0].zi_lucrare === '2026-09-30');
const t1 = M.anuntAparateNoi({ n: 7, firma: 'Transport SRL', instalator: 'Ionescu', ziLucrare: '2026-09-30', azi: '2026-09-30', sursa: 'semnal' });
T('anunțul: „7 aparate noi transmit — Transport SRL"', t1.titlu === '7 aparate noi transmit — Transport SRL', t1.titlu);
T('…spune montajul din calendar, că sunt deja bifate, cu firma aleasă, și de ce contează', /^Azi e programat montajul la Transport SRL \(Ionescu\)\. Le găsești la Dispozitive → Neasignate: apasă aici și sunt deja bifate, cu firma aleasă\. Verifici și apeși „Trece pe firmă"\. Până atunci clientul nu le vede, iar abonamentul lor nu pornește\.$/.test(t1.corp), t1.corp);
const t2 = M.anuntAparateNoi({ n: 1, firma: 'Transport SRL', ziLucrare: '2026-09-29', azi: '2026-09-30', sursa: 'semnal' });
T('la un aparat: „Un aparat nou transmite", totul la singular, „Ieri a fost programat"', t2.titlu === 'Un aparat nou transmite — Transport SRL' && /^Ieri a fost programat/.test(t2.corp) && /e deja bifat/.test(t2.corp) && /nu-l vede, iar abonamentul lui nu pornește\.$/.test(t2.corp), J(t2));
T('20 → „20 de aparate noi", iar montajul de alaltăieri e „Pe 28.09"', M.anuntAparateNoi({ n: 20, firma: 'X', ziLucrare: '2026-09-28', azi: '2026-09-30' }).titlu === '20 de aparate noi transmit — X' &&
  /^Pe 28\.09 a fost programat montajul la X\./.test(M.anuntAparateNoi({ n: 20, firma: 'X', ziLucrare: '2026-09-28', azi: '2026-09-30' }).corp));
const t3 = M.anuntAparateNoi({ n: 3, sursa: 'semnal' });
T('fără firmă propusă: spune de ce și cere alegerea firmei', t3.titlu === '3 aparate noi transmit' && /^Nu e niciun montaj în calendar, azi sau în ultimele 2 zile, care să li se potrivească\./.test(t3.corp) && /Alegi firma și apeși „Trece pe firmă"/.test(t3.corp), J(t3));
const t4 = M.anuntAparateNoi({ n: 8, nuTransmit: 2, firma: 'Transport SRL', instalator: 'Ionescu', sursa: 'instalator' });
T('raportul instalatorului (Robert): „Ionescu a montat 10 aparate la Transport SRL", iar cele care nu transmit se spun la urmă',
  t4.titlu === 'Ionescu a montat 10 aparate la Transport SRL' && /abonamentul lor nu pornește\. 2 aparate nu transmit încă: apar acolo când pornesc\.$/.test(t4.corp), J(t4));
T('…și când niciunul nu transmite încă', /^Niciunul nu transmite încă/.test(M.anuntAparateNoi({ n: 0, nuTransmit: 10, firma: 'X', instalator: 'Y', sursa: 'instalator' }).corp));

sect('2. Pe ecran');
T('Stoc: la GPS seria e IMEI-ul, iar aparatul nu se mai scrie în Dispozitive', /Seriile, una pe rând — la GPS, IMEI-ul \(15 cifre\)/.test(html) && /nu se mai scrie și în Dispozitive: când e montat și transmite prima dată, apare singur la Dispozitive → Neasignate/.test(html));
T('Stoc: bucata uitată la instalator = „montate și netrecute pe firmă", nu „neînregistrate în Dispozitive"', /montate și netrecute pe firmă \(vezi Dispozitive → Neasignate\)/.test(html) && !/montate și neînregistrate în Dispozitive/.test(html));
const blocBif = html.slice(html.indexOf('// ── începe „aparatele noi, bifate din anunț"'), html.indexOf('// ── sfârșit „aparatele noi, bifate din anunț"'));
T('clicul pe anunț bifează aparatele din el și TOATE cele propuse pentru aceeași firmă (anuntat_firma)', blocBif.length > 300 && /p\.imeis\.indexOf\(String\(d\.imei\)\) >= 0 \|\| \(p\.firma != null && d\.anuntat_firma === Number\(p\.firma\)\)/.test(blocBif) && /_raxDevBucket\(d\) !== 'unassigned'/.test(blocBif));
T('…și alege firma în bara de jos; trecerea rămâne apăsarea TA (nicio cerere spre server din bifare)', /_raxDevBlocFirma = p\.firma != null \? String\(p\.firma\) : ''/.test(blocBif) && !/fetch\(/.test(blocBif));
T('firma aleasă în bară rămâne aleasă când mai bifezi un aparat', /_raxDevCoOptions\(_raxDevBlocFirma\)/.test(html) && /window\.raxDevBlocFirma = function \(v\) \{ _raxDevBlocFirma = v \|\| ''; raxRenderDevices\(\); \}/.test(html));
T('bara spune pe față că firma e propusă din calendar', /Firma e propusă de montajul din calendar: <b>/.test(html) && /\.rax-dev-propus\{/.test(css));
T('anunțurile de lucru duc la treaba lor, nu în modalul cu hartă', /isAparateNoi\s*\n?\s*\? `onclick="notifAparateNoi\(\$\{Number\(n\.id\)\}\)"/.test(html) && /raxDevDeschideNeasignate\(\{ imeis: d\.imeis \|\| \[\], firma: d\.company_id != null \? d\.company_id : null \}\)/.test(html));
// Capcana găsită aici (30.09): un atribut onclick/oninput vede doar `window`. „_raxDevSearch=this.value" scria o
// variabilă nouă pe window (căutarea din Dispozitive nu filtra), „_giState.nota=this.value" arunca la fiecare literă
// (mențiunea corectată nu ajungea pe factură), iar filele din Cereri demo nu filtrau.
const iife = html.slice(html.indexOf('  <script>\n  (function () {\n    var me = null'));
const atribute = iife.match(/on(?:click|change|input|keydown|keyup|blur|focus)=\\?"[^"]{0,200}/g) || [];
const scriu = atribute.filter((a) => /="\s*(?:if\s*\()?\s*_[A-Za-z]\w*(?:\.\w+)*\s*=[^=]/.test(a.replace(/\\"/g, '"')));
T('în panoul de administrare, niciun atribut nu scrie într-o variabilă de-a lui (ar scrie pe window)', scriu.length === 0, J(scriu.slice(0, 4)));
T('căutarea din Dispozitive, mențiunea facturii și filele Cereri demo trec prin funcții', /oninput="raxDevCauta\(this\.value\)"/.test(html) && /oninput="raxGiNota\(this\.value\)"/.test(html) && /onclick="raxDemoReqFiltru\(/.test(html));
// Robert, 30.09 (punctul 13): „Toate" bifa și aparatele ascunse de căutare, iar confirmarea spunea 12 când bara spunea 3.
T('rândurile, „Toate" și „Trece pe firmă" folosesc ACEEAȘI regulă de „ce se vede" (fila + căutarea)',
  /var rows = all\.filter\(_raxDevVizibil\)/.test(html) && /window\.raxDevBifaToate = function \(on\) \{\s*_raxDevNeasVizibile\(\)\.forEach/.test(html) &&
  /var imeis = _raxDevNeasVizibile\(\)\.filter\(function \(d\) \{ return _raxDevSel\[d\.imei\]; \}\)/.test(html));
T('clicul pe anunț golește căutarea, ca aparatele bifate să se vadă', /if \(_raxDevDePus\) _raxDevSearch = '';/.test(html));

sect('3. Pe server');
T('o SINGURĂ funcție anunță aparatele noi (semnalul azi, raportul lui Robert mâine)', (server.match(/_anuntaSuperadmini\(supers, 'aparate_noi'/g) || []).length === 1 && /async function anuntaAparateNoi\(o\)/.test(server));
T('anunțul vechi „Dispozitiv nou conectat" (pe fiecare aparat, pe loc) a plecat — îl înlocuiește ăsta', !/notifyNewDeviceConnected|type: 'device_new'/.test(server));
T('la conectare: primit dacă e în Dispozitive SAU în stoc; străinul și arhivatul — refuzați', /if \(STRICT_DEVICES && registeredLoaded && \(!_imeiPrimit\(imei\) \|\| archivedImeis\.has\(imei\)\)\)/.test(server) &&
  /function _imeiPrimit\(imei\) \{ return registeredImeis\.has\(imei\) \|\| stocImeis\.has\(imei\); \}/.test(server));
T('lista din stoc se ține în pas: intrare, orice mutare (primit doar în depozit / la instalator), corectura seriei, ștergere, legarea de firmă (+ reîncărcare la 2 minute)',
  /serii\.forEach\(function \(s\) \{ stocImeis\.add\(s\); deviceAttempts\.delete\(s\); \}\)/.test(server) &&
  /if \(stocMod\.primitLaConectare\(stare\)\) stocImeis\.add\(x\.serie\); else stocImeis\.delete\(x\.serie\);/.test(server) &&
  /if \(f\.serie && stocMod\.primitLaConectare\(x\.stare\)\) stocImeis\.add\(f\.serie\);/.test(server) &&
  /if \(x\.serie\) stocImeis\.delete\(x\.serie\);   \/\/ trecut din greșeală/.test(server) && /stocImeis\.delete\(String\(imei\)\);   \/\/ montat/.test(server) &&
  /db\.stocImeiuri\([^\n]*stocMod\.PRIMITE_LA_CONECTARE\)/.test(server) && /setInterval\(loadRegisteredImeis, 2 \* 60 \* 1000\)/.test(server));
const rutaSterge = server.slice(server.indexOf("app.delete('/api/devices/:imei'"), server.indexOf("app.delete('/api/devices/:imei'") + 2200);
T('ștergerea definitivă: IMEI-ul iese și din lista stocului, iar bucata încă „în depozit / la instalator" trece pe „defect", cu notă (găsit de Robert, 30.09)',
  /stocImeis\.delete\(imei\);/.test(rutaSterge) && /stocMod\.primitLaConectare\(sb\.stare\) && stocMod\.poateTrece\(sb\.stare, 'defect'\)/.test(rutaSterge) && /șters definitiv din Dispozitive — de verificat/.test(rutaSterge));
T('ce era deja în „Neasignate" nu se anunță ca nou la prima pornire (o singură dată)', /await db\.migreazaAparateNoiAnuntate\(\);/.test(server));
T('rutele de probă (ceasul mutat) există doar sub SEED_TEST și doar pentru noi', /if \(process\.env\.SEED_TEST === '1'\) \{\s*\n\s*\/\/[^\n]*\n\s*app\.post\('\/api\/test\/ceasuri', requireAuth, requireSuperadmin/.test(server));

// ─── 4. Pe server pornit, cu trackere pe TCP ────────────────────────────────────────────────
const PORT = 3241, TCP = 5241, DIR = '.aparate-noi-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_aparate_noi',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST; delete envS.STRICT_DEVICES;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
async function intra(u, p) {
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  return async (m, url, body) => {
    const r = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
}
// Pachet Teltonika Codec 8 (constructorul din verify_ack_durabil.js).
function pachet(ts, lat, lng, viteza) {
  const io = Buffer.concat([Buffer.from([0x00, 1]), Buffer.from([1, 239, 1]), Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(lng * 1e7), 0); gps.writeInt32BE(Math.round(lat * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(viteza, 13);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), Buffer.concat([tsb, Buffer.from([0x01]), gps, io]), Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
// Un tracker se conectează: IMEI-ul, apoi un pachet. → { primit (serverul a zis 0x01), ack (câte recorduri confirmate) }.
function tracker(imei) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0; const out = { primit: false, ack: null };
    const gata2 = () => { try { s.destroy(); } catch (e) {} resolve(out); };
    s.on('connect', () => { const im = Buffer.from(imei, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', (b) => {
      if (pas === 0) { pas = 1; out.primit = b[0] === 1; s.write(pachet(Date.now() - 5000, 45.75, 21.22, 30)); return; }
      out.ack = b.length >= 4 ? b.readUInt32BE(0) : null; gata2();
    });
    s.on('error', () => gata2());
    s.on('close', () => gata2());
    setTimeout(gata2, 4000);
  });
}
// Ziua de azi în calendarul României, și prânzul ei (ca ziua să nu alunece pe fusul orar).
const aziRo = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
const [ay, am, ad] = aziRo.split('-').map(Number);
const pranz = (plus) => Date.UTC(ay, am - 1, ad + (plus || 0), 9, 0);
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('4. Pe server pornit (mod strict, trackere pe TCP)');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  const A = '860000000077001', Bi = '860000000077002', C = '860000000077003', E = '860000000077005', G = '860000000077007', H1 = '860000000077008', H2 = '860000000077009', X = '860000000077666';
  // Aparatele de probă ale serverului (TEST111/222) stau fără firmă și „transmit": le respingem, ca Neasignate să fie gol.
  for (const t of ['TEST111', 'TEST222']) await R('PUT', '/api/devices/' + t + '/status', { status: 'archived' });
  // Firma, contractul semnat și montajul de azi, pentru 2 mașini, la instalatorul Ionescu.
  const part = (await R('POST', '/api/montaj/parteneri', { name: 'Ionescu Montaj SRL', tarife: { gps: 60 } })).j || {};
  const alt = (await R('POST', '/api/montaj/parteneri', { name: 'Alt Instalator SRL', tarife: { gps: 55 } })).j || {};
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Aparate Noi', client_name: 'Transport Nou SRL', monthly_total: 58, currency: 'RON',
    config: { cfg: { nVeh: 2, contractMonths: 12, montaj: { qGps: 2 }, devices: {} }, prices: { pPlain: 29, mGps: 100 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Transport Nou SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO7701', address: 'Str. Montajului 1', legal_rep: { name: 'Ana Transport', role: 'Administrator' } });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 2, pret: 29, total: 58 }], servicii: [] } })).j;
  for (const st of ['aprobat', 'trimis']) await R('PUT', '/api/contracts/' + c.id, { status: st });
  await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
  const prog = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: pranz(0), partener_id: part.id, cate: { gps: 2 } });
  T('montajul de azi e programat (2 mașini, Ionescu)', prog.s === 200 && prog.j.lucrare && prog.j.lucrare.status === 'programat', J(prog));

  // Stocul: GPS-urile intră cu IMEI-ul; o serie care nu e IMEI se refuză.
  const rau = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: '860000000077001\nSN-ABC' });
  T('Stoc: la GPS, o serie care nu e IMEI se refuză pe nume', rau.s === 400 && /„SN-ABC" nu e un IMEI/.test((rau.j || {}).error || ''), J(rau));
  T('Stoc: la modulul LV-CAN, seria rămâne liberă', (await R('POST', '/api/stoc/intrare', { tip: 'lvcan200', serii: 'LVC-0001' })).s === 200);
  const intr = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: [A, Bi, C, E, G, H1].join('\n'), cost_eur: 45 });
  T('Stoc: 6 GPS-uri intră, toate primite la conectare de acum', intr.s === 200 && intr.j.adaugate === 6 && intr.j.primite_la_conectare === 6, J(intr));
  const stoc = ((await R('GET', '/api/stoc')).j || {}).aparate || [];
  const idDe = (s) => (stoc.filter((x) => x.serie === s)[0] || {}).id;
  await R('POST', '/api/stoc/muta', { ids: [idDe(A), idDe(Bi)], stare: 'instalator', partener_id: part.id });
  await R('POST', '/api/stoc/muta', { ids: [idDe(C), idDe(H1)], stare: 'instalator', partener_id: alt.id });
  await R('POST', '/api/stoc/muta', { ids: [idDe(G)], stare: 'casat' });
  const cor = await R('PUT', '/api/stoc/' + idDe(H1), { serie: H2 });
  T('corectura seriei unui GPS: tot IMEI cerut', cor.s === 200 && (await R('PUT', '/api/stoc/' + idDe(H1), { serie: 'GRESIT' })).s === 400, J(cor));

  // Conectările: străinul — refuzat; cele din stoc — primite, fără să fi fost scrise în Dispozitive.
  const x = await tracker(X);
  T('un IMEI străin (nici în Dispozitive, nici în stoc) e refuzat, ca până acum', !x.primit, J(x));
  const ta = await tracker(A), tb = await tracker(Bi), tc = await tracker(C);
  T('GPS-urile din stoc sunt primite și poziția li se confirmă', ta.primit && ta.ack === 1 && tb.primit && tb.ack === 1 && tc.primit, J([ta, tb, tc]));
  T('cel casat nu mai e primit', !(await tracker(G)).primit);
  const th = [await tracker(H1), await tracker(H2)];
  T('după corectura seriei: vechiul IMEI refuzat, cel nou primit', !th[0].primit && th[1].primit, J(th));
  await sleep(600);
  let dev = ((await R('GET', '/api/admin/devices')).j) || [];
  const d = (i) => dev.filter((y) => y.imei === i)[0] || null;
  T('au apărut singure la Neasignate (fără firmă), cu modelul luat din stoc', d(A) && d(A).company_id == null && d(Bi) && d(C) && !d(X), J([d(A), d(X)]));
  const fisa = (await R('GET', '/api/devices/' + A + '/full')).j || {};
  T('…modelul din stoc: „Teltonika FMC130"', fisa.gps_model === 'Teltonika FMC130', J(fisa).slice(0, 300));

  // Ceasul: A și B (la Ionescu, montajul de azi, 2 mașini) sunt „toate" → anunț pe loc; C (alt instalator) așteaptă lotul.
  const notif = async () => ((await R('GET', '/api/notifications?limit=80')).j || []).filter((n) => n.type === 'aparate_noi');
  let k = (await R('POST', '/api/test/ceasuri', { acum: Date.now() })).j || {};
  let an = await notif();
  const nf = an.filter((n) => (n.data || {}).company_id === co.id)[0];
  T('anunț pe loc: s-au adunat toate mașinile programate azi la firmă', nf && nf.title === '2 aparate noi transmit — Transport Nou SRL' && J(((nf.data || {}).imeis || []).sort()) === J([A, Bi].sort()), J(an.map((n) => n.title)));
  T('…cu montajul și instalatorul în text', nf && /^Azi e programat montajul la Transport Nou SRL \(Ionescu Montaj SRL\)\./.test(nf.body || ''), nf && nf.body);
  T('…merge DOAR la noi (notificare de platformă, fără firmă)', nf && nf.company_id == null && nf.user_id == null);
  T('C și H2 (la alt instalator decât cel din calendar) nu intră în lot și nu sunt anunțate încă (așteaptă 20 de minute)', an.length === 1 && !(k.aparateNoi.anuntate || []).some((g) => g.imeis.indexOf(C) >= 0), J(k));
  k = (await R('POST', '/api/test/ceasuri', { acum: Date.now() + 21 * 60000 })).j || {};
  an = await notif();
  const nc = an.filter((n) => J(((n.data || {}).imeis || []).slice().sort()) === J([C, H2].sort()))[0];
  T('după 20 de minute fără alt aparat: „2 aparate noi transmit", fără firmă propusă', nc && nc.title === '2 aparate noi transmit' && (nc.data || {}).company_id == null && /^Nu e niciun montaj în calendar/.test(nc.body || ''), J(an.map((n) => n.title)));
  k = (await R('POST', '/api/test/ceasuri', { acum: Date.now() + 60 * 60000 })).j || {};
  const inainte = an.length;
  an = await notif();
  T('un aparat se anunță o singură dată (al treilea ceas nu mai anunță A, B, C)', an.filter((n) => ((n.data || {}).imeis || []).some((i) => [A, Bi, C].indexOf(i) >= 0)).length === 2 && an.length >= inainte, J(an.map((n) => n.title)));
  dev = ((await R('GET', '/api/admin/devices')).j) || [];
  T('în Dispozitive, A și B poartă firma propusă (ecranul le bifează la un clic, oricâte anunțuri ar fi)', d(A).anuntat_firma === co.id && d(Bi).anuntat_firma === co.id && d(C).anuntat_firma == null, J([d(A), d(C)]));

  // Raportul instalatorului, până îl face Robert: aceeași funcție. E (în stoc) nu s-a conectat încă.
  const rap = await R('POST', '/api/test/aparate-montate', { imeis: [E], company_id: co.id, partener_id: part.id, lucrare_id: prog.j.lucrare.id });
  an = await notif();
  const nr = an.filter((n) => (n.data || {}).sursa === 'instalator')[0];
  T('raportul instalatorului: „Ionescu Montaj SRL a montat 1 aparat la Transport Nou SRL — niciunul nu transmite încă"', rap.s === 200 && nr && nr.title === 'Ionescu Montaj SRL a montat 1 aparat la Transport Nou SRL' && /^Niciunul nu transmite încă/.test(nr.body || ''), J([rap, nr && nr.title, nr && nr.body]));
  T('…iar E, când pornește, e anunțat de semnal (n-a fost bifat ca anunțat)', (await tracker(E)).primit);

  // Trecerea pe firmă: aceeași ușă ca până acum; propunerea se șterge, stocul trece pe „montat la client".
  const tr = await R('PUT', '/api/devices/company-bulk', { company_id: co.id, imeis: [A, Bi] });
  dev = ((await R('GET', '/api/admin/devices')).j) || [];
  const st2 = ((await R('GET', '/api/stoc')).j || {}).aparate || [];
  T('„Trece pe firmă": A și B pe firmă, fără propunere agățată, iar în stoc „montat" la client', tr.s === 200 && tr.j.trecute === 2 && d(A).company_id === co.id && d(A).anuntat_firma == null &&
    (st2.filter((y) => y.serie === A)[0] || {}).stare === 'montat', J([tr.j, d(A)]));

  // Punctul 20 (Robert, 30.09): un aparat șters definitiv revenea singur dacă mai transmitea — IMEI-ul rămânea în stoc.
  await R('PUT', '/api/devices/' + A + '/status', { status: 'archived' });
  const delA = await R('DELETE', '/api/devices/' + A);
  T('A (montat la client) arhivat și șters definitiv → nu mai e primit, deși e încă în stoc', delA.s === 200 && !(await tracker(A)).primit, J(delA));
  await R('PUT', '/api/devices/' + C + '/status', { status: 'archived' });
  const delC = await R('DELETE', '/api/devices/' + C);
  const bucC = ((((await R('GET', '/api/stoc')).j || {}).aparate) || []).filter((y) => y.serie === C)[0] || {};
  T('C (încă „la instalator") șters definitiv → bucata trece pe „defect", cu notă, și nu mai e primit',
    delC.s === 200 && bucC.stare === 'defect' && /șters definitiv din Dispozitive/.test(J(bucC.istoric || [])) && !(await tracker(C)).primit, J([delC.s, bucC.stare]));
  dev = ((await R('GET', '/api/admin/devices')).j) || [];
  T('…și niciunul nu și-a refăcut rândul în Dispozitive', !d(A) && !d(C));

  // Clientul nu vede nimic din toate astea.
  const u = (await R('POST', '/api/users', { username: 'sef@transportnou.ro', full_name: 'Șef Transport', role: 'company_admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  const Cl = await intra('sef@transportnou.ro', 'Str4da-Verde-2026');
  const cn = ((await Cl('GET', '/api/notifications?limit=80')).j || []).filter((n) => n.type === 'aparate_noi');
  T('clientul nu primește anunțurile noastre și nu ajunge la rutele de probă', cn.length === 0 && (await Cl('POST', '/api/test/ceasuri', {})).s === 403 && (await Cl('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: X })).s === 403);
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
