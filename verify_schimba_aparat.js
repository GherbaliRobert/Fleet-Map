// verify_schimba_aparat.js — „Schimbă aparatul": aparatul nou preia mașina, istoricul rămâne (Robert, 29.10: „1 da, 2 acum").
//
//   node verify_schimba_aparat.js
//
// Robert (29.10): „avem o logică în spate în cazul în care un dispozitiv se defectează, încât să rămânem și cu istoricul
// acelei mașini?" — nu aveam: mașina ERA aparatul (cheia ei e IMEI-ul), deci un aparat nou însemna o mașină nouă, goală, iar
// cea veche ori se plătea de două ori, ori se arhiva și își pierdea istoricul în 30 de zile. Acum aparatul nou PREIA mașina.
// Proba ține: regula (aparat_schimbat.js), codul (serverul, baza, pagina) și tot drumul pe server pornit, în mod strict, cu
// trackere adevărate pe TCP: aparatul vechi refuzat, cel nou pe aceeași mașină, contorul de km continuat, „Neasignate" mutat,
// stocul, abonamentul neatins, refuzurile, întoarcerea la aparatul de la montaj.

const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const A = require('./aparat_schimbat.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const J = JSON.stringify;
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

sect('1. Regula (aparat_schimbat.js)');
const h = A.harta([{ imei: '111', aparat_imei: '222' }, { imei: '333', aparat_imei: null }, { imei: '444', aparat_imei: '111' }, { imei: '555', aparat_imei: '555' }]);
T('aparatul nou scrie pe mașina lui (cheia rămâne cea de la montaj)', A.vehiculPentru('222', h) === '111');
T('aparatul scos nu mai e primit…', A.vehiculPentru('555', h) === '555' && A.vehiculPentru('333', h) === '333');
T('…dar mutat pe altă mașină, scrie acolo (harta câștigă, chiar dacă IMEI-ul lui e cheia celei dintâi)', A.vehiculPentru('111', h) === '444');
const h2 = A.harta([{ imei: '111', aparat_imei: '222' }]);
T('o mașină cu aparatul schimbat refuză aparatul ei de la montaj', A.vehiculPentru('111', h2) === null);
T('aparatul fără schimbare merge ca până acum', A.vehiculPentru('999', h2) === '999' && A.vehiculPentru('999', null) === '999');
T('mașina → aparatul montat acum (stocul are seria aparatului)', A.aparatPeMasina('111', h2) === '222' && A.aparatPeMasina('333', h2) === '333');
T('aparatAl: aparatul de acum, altfel cheia', A.aparatAl({ imei: '1', aparat_imei: '2' }) === '2' && A.aparatAl({ imei: '1' }) === '1' && A.aparatAl(null) === null);
const rec = (t, o) => ({ timestamp: t, io: o == null ? {} : { total_odometer: o } });
let st = { ajustare: null, vechi: 100000 };
let r1 = [rec(2000, 5200), rec(1000, 5000), rec(3000)];
T('contorul: diferența se află din poziția CEA MAI VECHE a aparatului nou', A.continuaContorul(r1, st).nou === true && st.ajustare === 95000 && st.vechi === null, J(st));
T('…și se adună pe toate pozițiile cu contor (fără salt față de aparatul vechi)', r1[0].io.total_odometer === 100200 && r1[1].io.total_odometer === 100000 && r1[2].io.total_odometer === undefined, J(r1));
let r2 = [rec(4000, 6000)];
T('la pachetul următor nu se mai socotește, doar se adună', A.continuaContorul(r2, st).nou === false && r2[0].io.total_odometer === 101000);
T('fără contor la aparatul vechi nu se atinge nimic', (function () { const s = { ajustare: null, vechi: null }; const r = [rec(1, 50)]; A.continuaContorul(r, s); return r[0].io.total_odometer === 50 && s.ajustare === null; })());
T('pachet fără contor: așteaptă primul care are', (function () { const s = { ajustare: null, vechi: 10 }; const r = [rec(1)]; const x = A.continuaContorul(r, s); return !x.nou && s.vechi === 10; })());
const cand = A.candidati({
  aparatAcum: '860000000000001',
  ocupate: new Set(['860000000000009']),
  modele: { fmc130: 'Teltonika FMC130', fmc650: 'Teltonika FMC650' },
  acum: Date.now(),
  stoc: [{ serie: '860000000000002', tip: 'fmc130', stare: 'depozit' }, { serie: '860000000000003', tip: 'fmc650', stare: 'instalator', partener_nume: 'Ionescu' },
    { serie: '860000000000009', tip: 'fmc130', stare: 'depozit' }, { serie: '860000000000001', tip: 'fmc130', stare: 'depozit' },
    { serie: 'SN-1', tip: 'fmc130', stare: 'depozit' }, { serie: '860000000000004', tip: 'fmc130', stare: 'montat' }, { serie: '860000000000005', tip: 'fmc130', stare: 'instalator' }],
  neasignate: [{ imei: '860000000000005', gps_model: null, last_tx: new Date().toISOString() }, { imei: 'TEST111' }],
});
T('candidații: din stoc nemontat + din „Neasignate"; fără cel de acum, fără cele ocupate, fără ce nu e IMEI, fără ce e montat',
  J(cand.map((c) => c.imei)) === J(['860000000000005', '860000000000002', '860000000000003']), J(cand));
T('…cel din „Neasignate" e primul (cel mai probabil chiar aparatul montat azi) și primește modelul din stoc', cand[0].sursa === 'neasignat' && cand[0].model === 'Teltonika FMC130' && /^transmite deja, din „Neasignate” \(ultima poziție azi, \d\d:\d\d\)$/.test(cand[0].unde), J(cand[0]));
T('…unde stă cel din stoc: „în depozit" / „la instalator · Ionescu"', cand[1].unde === 'în depozit' && cand[2].unde === 'la instalator · Ionescu' && cand[2].model === 'Teltonika FMC650');
const veh = { imei: '860000000000001', plate: 'B 77 TIR', name: 'Actros' };
const tc = A.textConfirmare({ vehicul: veh, candidat: cand[0], aparatAcum: '860000000000001', vechiul: 'defect', vechiInStoc: true });
T('confirmarea: mașina, aparatul nou, istoricul rămâne, ce trece din „Neasignate", aparatul vechi în stoc',
  /^B 77 TIR \(Actros\) primește aparatul 860000000000005 \(Teltonika FMC130\)\.\nIstoricul mașinii rămâne întreg/.test(tc) && /abonamentul merg mai departe\./.test(tc) &&
  /„Neasignate” trece pe mașină/.test(tc) && /Aparatul vechi \(860000000000001\) nu mai e primit; în stoc trece pe „defect”\.$/.test(tc), tc);
T('…„retur" când merge, iar fără bucată în stoc spune că acolo nu se schimbă nimic',
  /în stoc trece pe „retur”/.test(A.textConfirmare({ vehicul: veh, candidat: cand[1], aparatAcum: 'x', vechiul: 'retur', vechiInStoc: true })) &&
  /nu e în stocul nostru, deci acolo nu se schimbă nimic\.$/.test(A.textConfirmare({ vehicul: veh, candidat: cand[1], aparatAcum: 'x', vechiul: 'defect', vechiInStoc: false })));
T('după: „3 poziții", „20 de poziții", „o poziție"', /3 poziții trimise din „Neasignate” au trecut/.test(A.textDupa({ vehicul: veh, nou: 'n', pozitiiMutate: 3 })) &&
  /20 de poziții trimise/.test(A.textDupa({ vehicul: veh, nou: 'n', pozitiiMutate: 20 })) && /1 poziție trimisă din „Neasignate” a trecut/.test(A.textDupa({ vehicul: veh, nou: 'n', pozitiiMutate: 1 })) &&
  !/poziți/.test(A.textDupa({ vehicul: veh, nou: 'n', pozitiiMutate: 0 })));
T('rândul din fișă (îl vede și clientul): data și că istoricul a rămas; fără schimbări — nimic',
  /^Aparatul GPS a fost schimbat pe \d\d\.\d\d\.\d{4}\. Istoricul de dinainte rămâne pe mașină\.$/.test(A.notaFisa([{ la: Date.now() }], veh)) && A.notaFisa([], veh) === null);
T('ce se întâmplă cu aparatul vechi: doar stările în care stocul îl lasă să treacă din „montat"', J(A.VECHIUL.map((v) => v.k)) === J(['defect', 'retur']) &&
  A.VECHIUL.every((v) => require('./stoc.js').poateTrece('montat', v.k)) && A.vechiulValid('retur') && !A.vechiulValid('casat'));

sect('2. Codul (server, bază, pagină)');
const iHand = server.indexOf("const vehicul = aparatSchimbat.vehiculPentru(imeiAparat, _aparate);");
const iStrict = server.indexOf('if (STRICT_DEVICES && registeredLoaded && (!_imeiPrimit(imei)');
T('la conectare, IMEI-ul aparatului se traduce în cheia mașinii ÎNAINTE de verificarea strictă', iHand > 0 && iStrict > iHand && /imei = vehicul;/.test(server.slice(iHand, iStrict)));
T('…aparatul scos e refuzat în ORICE mod (nu doar strict) și nu intră la „încercări"', /if \(vehicul == null\) \{[\s\S]{0,400}reason: 'aparat_inlocuit'[\s\S]{0,80}socket\.destroy\(\);/.test(server.slice(iHand, iStrict)) && !/logDeviceAttempt/.test(server.slice(iHand, iStrict)));
T('harta se încarcă ÎNAINTE ca serverul TCP să primească pe cineva (în lista de acceptate)', /await _aparateReincarca\(\);[^\n]*\n\s*registeredLoaded = true;/.test(server));
const iCont = server.indexOf('aparatSchimbat.continuaContorul(parsed.records, _st)'), iIns = server.indexOf('await db.insertPositions(imei, parsed.records)');
T('contorul continuă ÎNAINTE de scriere și de harta live', iCont > 0 && iIns > iCont);
T('O SINGURĂ cale de schimbare (db.schimbaAparat, chemată o dată, din ruta noastră)', (server.match(/db\.schimbaAparat\(/g) || []).length === 1 && /async function schimbaAparat\(o\)/.test(dbjs));
T('rutele sunt doar ale noastre (super-admin)', /app\.get\('\/api\/devices\/:imei\/schimba-aparat', requireAuth, requireSuperadmin,/.test(server) && /app\.post\('\/api\/devices\/:imei\/schimba-aparat', requireAuth, requireSuperadmin,/.test(server));
T('trecerea pe firmă leagă în stoc APARATUL montat acum, nu cheia mașinii', /_stocLaFirma\(aparatSchimbat\.aparatPeMasina\(imei, _aparate\), companyId, _cine\(req\)\)/.test(server));
T('…și ștergerea definitivă se uită la aparatul montat acum', /const _aparatSters = aparatSchimbat\.aparatAl\(dev\) \|\| imei;/.test(server));
T('arhivarea, restaurarea și ștergerea reîncarcă harta', (server.match(/await _aparateReincarca\(\);/g) || []).length >= 5);
T('baza: un aparat pe O SINGURĂ mașină (index unic) + istoricul schimbărilor', /CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_aparat ON devices\(aparat_imei\) WHERE aparat_imei IS NOT NULL/.test(dbjs) && /CREATE TABLE IF NOT EXISTS schimbari_aparat/.test(dbjs));
T('…istoricul intră în copii (BUSINESS_TABLES)', require('./backup.js').BUSINESS_TABLES.indexOf('schimbari_aparat') >= 0 || /'schimbari_aparat'/.test(fs.readFileSync('./backup.js', 'utf8')));
T('…mutarea din „Neasignate" nu numără cu rowCount (lipsește în PGlite): RETURNING id', /ON CONFLICT DO NOTHING RETURNING id/.test(dbjs.slice(dbjs.indexOf('async function schimbaAparat'))));
const bloc = html.slice(html.indexOf('// ── începe „Schimbă aparatul"'), html.indexOf('// ── sfârșit „Schimbă aparatul"'));
T('fișa: cheia mașinii (edit-imei) e ascunsă, pe ecran stă aparatul montat acum', /<input type="hidden" id="edit-imei">/.test(html) && /id="edit-imei-aparat" disabled/.test(html) && /aparatInFisa\(dev\);/.test(html));
T('…butonul „Schimbă aparatul" doar la noi, pe mașina unei firme, nearhivată', /currentUser\.role === 'superadmin' && dev && dev\.company_id != null && dev\.status !== 'archived'/.test(bloc));
T('…la deschiderea altei mașini, nota și butonul celei dinainte nu rămân', /aparatInFisa\(\{ imei: imei \}\);/.test(html));
T('pagina nu verifică și nu socotește: doar cele două rute, textele de la server cu textContent', bloc.length > 2000 &&
  (bloc.match(/fetch\(/g) || []).length === 2 && !/\.innerHTML = (?!'<i class="fas fa-right-left"><\/i> ')/.test(bloc) && /ales\.confirmare\[vechiul\]/.test(bloc));
T('listele arată IMEI-ul aparatului montat acum (Inventar, Aparate GPS, Dispozitive) și caută după el',
  /if \(k === 'imei'\) return r\.aparat_imei \|\| r\.imei \|\| '';/.test(html) && /'IMEI ' \+ \(r\.aparat_imei \|\| r\.imei\)/.test(html) &&
  /esc\(d\.aparat_imei \|\| d\.imei\) \+ '<\/td><td>'/.test(html) && /raCauta\(q, d\.name, d\.plate, d\.imei, d\.aparat_imei, d\.company_name\)/.test(html) &&
  /r\.aparat_imei \|\| r\.imei, r\.gps_model/.test(server));
const tel = fs.readFileSync('./mobile/src/components/SchimbaAparat.tsx', 'utf8');
const telDisp = fs.readFileSync('./mobile/src/screens/AdminDevices.tsx', 'utf8');
T('telefonul: aceeași fereastră, pe aceleași rute, cu confirmarea serverului (nu socotește nimic)',
  (tel.match(/'\/api\/devices\/' \+ encodeURIComponent\(imei\) \+ '\/schimba-aparat'/g) || []).length === 2 && /ales\.confirmare\[/.test(tel) && /<SchimbaAparat imei=\{schimb\}/.test(telDisp));
T('…butonul doar pe mașina unei firme, nearhivată; listele de pe telefon arată aparatul montat acum',
  /\{!arhivat\(sel\) && sel\.company_id != null && \(/.test(telDisp) && /IMEI \{d\.aparat_imei \|\| d\.imei\}/.test(telDisp) &&
  /r\.aparat_imei \|\| r\.imei/.test(fs.readFileSync('./mobile/src/screens/DeviceInventory.tsx', 'utf8')) && /r\.aparat_imei \|\| r\.imei/.test(fs.readFileSync('./mobile/src/screens/AparateGps.tsx', 'utf8')));
T('culorile ferestrei vin din variabilele temei (pereche pe ambele teme), butonul plin cu text închis', /\.apsch-ok \{[^}]*background: var\(--accent\); color: #06210F;/.test(css) && /\.apsch-card \{[^}]*background: var\(--bg-card\); color: var\(--text-primary\)/.test(css));

// ─── 3. Pe server pornit (mod strict, trackere pe TCP) ───────────────────────────────────────
const PORT = 3511, TCP = 5511, DIR = '.schimba-aparat-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_schimba_aparat',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST; delete envS.STRICT_DEVICES; delete envS.BREVO_API_KEY;
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
// Pachet Teltonika Codec 8 cu contactul (IO 239) și contorul aparatului (IO 16, 4 octeți, metri).
function pachet(ts, odoM) {
  const n4 = odoM == null ? Buffer.from([0]) : (function () { const b = Buffer.alloc(6); b.writeUInt8(1, 0); b.writeUInt8(16, 1); b.writeUInt32BE(odoM, 2); return b; })();
  const io = Buffer.concat([Buffer.from([0x00, odoM == null ? 1 : 2]), Buffer.from([1, 239, 1]), Buffer.from([0]), n4, Buffer.from([0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(21.22 * 1e7), 0); gps.writeInt32BE(Math.round(45.75 * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(30, 13);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), Buffer.concat([tsb, Buffer.from([0x01]), gps, io]), Buffer.from([0x01])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
// Un tracker sună: IMEI-ul, apoi un pachet. → { primit (serverul a zis 0x01), ack (câte recorduri confirmate) }.
function tracker(imei, ts, odoM) {
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0; const out = { primit: false, ack: null };
    const gata2 = () => { try { s.destroy(); } catch (e) {} resolve(out); };
    s.on('connect', () => { const im = Buffer.from(imei, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', (b) => {
      if (pas === 0) { pas = 1; out.primit = b[0] === 1; s.write(pachet(ts, odoM)); return; }
      out.ack = b.length >= 4 ? b.readUInt32BE(0) : null; gata2();
    });
    s.on('error', () => gata2());
    s.on('close', () => gata2());
    setTimeout(gata2, 4000);
  });
}
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('3. Pe server pornit (mod strict, trackere pe TCP)');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  const K = '860000000088001', Y = '860000000088002', Z = '860000000088003', V2 = '860000000088004', X = '860000000088777';
  const acum = Date.now();
  const co = (await R('POST', '/api/companies', { name: 'Transport Schimb SRL' })).j || {};
  // Stocul: aparatul de la montaj (K), unul de rezervă în depozit (Y), unul la instalator care va transmite din „Neasignate" (Z)
  // și aparatul altei mașini (V2).
  const intr = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: [K, Y, Z, V2].join('\n'), cost_eur: 45 });
  T('stocul: 4 trackere intră', intr.s === 200 && intr.j.adaugate === 4, J(intr));
  const mk = await R('POST', '/api/devices', { imei: K, company_id: co.id, name: 'Actros', plate: 'TM 77 SCH', sim_number: '0700111222' });
  const mv = await R('POST', '/api/devices', { imei: V2, company_id: co.id, name: 'Alt camion', plate: 'TM 88 ALT' });
  T('două mașini pe firmă (aparatele lor trec în stoc pe „montat")', mk.s === 200 && mv.s === 200, J([mk, mv]));
  const tk1 = await tracker(K, acum - 600000, 100000);
  T('aparatul de la montaj transmite (contor 100 km)', tk1.primit && tk1.ack === 1, J(tk1));
  await sleep(400);
  const aboInainte = (((await R('GET', '/api/admin/devices')).j || []).filter((d) => d.imei === K)[0] || {}).abonament_de_la;
  T('abonamentul mașinii a pornit la prima transmisie', !!aboInainte, String(aboInainte));

  const g1 = await R('GET', '/api/devices/' + K + '/schimba-aparat');
  const imeisCand = ((g1.j || {}).candidati || []).map((c) => c.imei);
  T('fereastra: aparatul de acum, cartela, aparatul vechi e în stoc', g1.s === 200 && g1.j.aparatAcum === K && g1.j.sim === '0700111222' && g1.j.vechiInStoc === true && !g1.j.nuSePoate, J(g1.j).slice(0, 300));
  T('…candidații: din stoc Y și Z; nu K (cel de acum), nu V2 (pe altă mașină)', imeisCand.indexOf(Y) >= 0 && imeisCand.indexOf(Z) >= 0 && imeisCand.indexOf(K) < 0 && imeisCand.indexOf(V2) < 0, J(imeisCand));
  T('…cu confirmarea gata scrisă de server, pentru „defect" și pentru „retur"', ((g1.j.candidati || [])[0] || {}).confirmare && /primește aparatul/.test(g1.j.candidati[0].confirmare.defect) && /„retur”/.test(g1.j.candidati[0].confirmare.retur));

  // Refuzurile, înainte de orice schimbare.
  const ref = [
    await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: V2 }),
    await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: X }),
    await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: K }),
    await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: 'abc' }),
    await R('POST', '/api/devices/TEST111/schimba-aparat', { nou: Y }),
  ];
  T('refuzuri: aparatul altei mașini (409), unul care nu e în stoc (400), chiar cel de acum (400), fără aparat (400), mașina fără firmă (400)',
    ref[0].s === 409 && /e pe mașina unei firme/.test(ref[0].j.error) && ref[1].s === 400 && /nu e în stocul nostru/.test(ref[1].j.error) &&
    ref[2].s === 400 && /chiar cel montat acum/.test(ref[2].j.error) && ref[3].s === 400 && ref[4].s === 400 && /nu e încă pe nicio firmă/.test(ref[4].j.error), J(ref.map((x) => [x.s, (x.j || {}).error])));

  // Prima schimbare: din stoc (Y), aparatul vechi s-a stricat.
  const s1 = await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: Y, vechiul: 'defect', sim: '0700333444', motiv: 'nu mai pornește' });
  T('schimbarea din stoc: gata, cu textul serverului', s1.s === 200 && /^Gata: TM 77 SCH \(Actros\) are acum aparatul 860000000088002\./.test(s1.j.text) && /Aparatul vechi a trecut în stoc pe „defect”\./.test(s1.j.text), J(s1));
  let fisa = (await R('GET', '/api/devices/' + K + '/full')).j || {};
  T('fișa: aceeași mașină (nume, număr), aparatul nou, cartela nouă, modelul din stoc, rândul „schimbat pe…"',
    fisa.imei === K && fisa.plate === 'TM 77 SCH' && fisa.name === 'Actros' && fisa.aparat_acum === Y && fisa.aparat_imei === Y && fisa.sim_number === '0700333444' &&
    fisa.gps_model === 'Teltonika FMC130' && /^Aparatul GPS a fost schimbat pe /.test(fisa.aparat_nota || ''), J({ a: fisa.aparat_acum, s: fisa.sim_number, m: fisa.gps_model, n: fisa.aparat_nota }));
  let stoc = ((await R('GET', '/api/stoc')).j || {}).aparate || [];
  const stare = (s) => (stoc.filter((x) => x.serie === s)[0] || {}).stare;
  T('stocul: aparatul nou „montat", cel vechi „defect"', stare(Y) === 'montat' && stare(K) === 'defect', J([stare(Y), stare(K)]));

  const tkVechi = await tracker(K, acum - 300000, 100500);
  T('aparatul vechi nu mai e primit (n-ar mai scrie pe mașină în același timp cu cel nou)', !tkVechi.primit, J(tkVechi));
  const ty1 = await tracker(Y, acum - 240000, 5000), ty2 = await tracker(Y, acum - 180000, 6000);
  T('aparatul nou e primit și pozițiile i se confirmă', ty1.primit && ty1.ack === 1 && ty2.primit && ty2.ack === 1, J([ty1, ty2]));
  await sleep(400);
  const ist = (j) => (j || []).map((p) => (p.io_data || {}).total_odometer);
  let pozK = (await R('GET', '/api/history/' + K + '?from=' + encodeURIComponent(new Date(acum - 3600000).toISOString()) + '&to=' + encodeURIComponent(new Date(acum + 60000).toISOString()))).j;
  T('istoricul mașinii: poziția aparatului vechi + ale celui nou, pe ACEEAȘI mașină', Array.isArray(pozK) && pozK.length === 3, J(pozK && pozK.length));
  T('…contorul continuă fără salt: 100 km → 100 km → 101 km (nu 5 km)', J(ist(pozK)) === J([100000, 100000, 101000]), J(ist(pozK)));
  const pozY = (await R('GET', '/api/history/' + Y + '?from=' + encodeURIComponent(new Date(acum - 3600000).toISOString()))).j;
  T('…și nimic pe o „mașină nouă" cu IMEI-ul aparatului nou', !Array.isArray(pozY) || pozY.length === 0, J(pozY));
  const devs = (await R('GET', '/api/admin/devices')).j || [];
  T('nicio mașină nouă în Dispozitive pentru aparatul nou, iar abonamentul mașinii rămâne cel de la început',
    !devs.some((d) => d.imei === Y) && (devs.filter((d) => d.imei === K)[0] || {}).abonament_de_la === aboInainte, J(devs.map((d) => d.imei)));
  const inv = ((await R('GET', '/api/device-inventory')).j || []).filter((r) => r.imei === K)[0] || {};
  T('Inventar: rândul mașinii spune aparatul montat acum', inv.aparat_imei === Y, J(inv));

  // A doua schimbare: aparatul nou a fost montat ÎNAINTE să apăsăm — transmite deja din „Neasignate".
  const tz1 = await tracker(Z, acum - 120000, 2000);
  T('aparatul Z, din stoc, sună și ajunge la „Neasignate"', tz1.primit && tz1.ack === 1, J(tz1));
  await sleep(400);
  T('…ca rând fără firmă', ((await R('GET', '/api/admin/devices')).j || []).some((d) => d.imei === Z && d.company_id == null));
  const g2 = await R('GET', '/api/devices/' + K + '/schimba-aparat');
  const cz = ((g2.j || {}).candidati || []).filter((c) => c.imei === Z)[0];
  T('fereastra îl pune primul, „transmite deja, din Neasignate"', cz && g2.j.candidati[0].imei === Z && cz.sursa === 'neasignat' && /^transmite deja, din „Neasignate”/.test(cz.unde) && /„Neasignate” trece pe mașină/.test(cz.confirmare.defect), J(g2.j && g2.j.candidati));
  T('…și istoricul schimbărilor', (g2.j.istoric || []).length === 1 && new RegExp(K + ' → ' + Y + ' · admin · aparatul vechi: defect · „nu mai pornește”').test(g2.j.istoric[0]), J(g2.j.istoric));
  const s2 = await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: Z, vechiul: 'retur' });
  T('schimbarea din „Neasignate": o poziție trece pe mașină', s2.s === 200 && /1 poziție trimisă din „Neasignate” a trecut pe mașină\./.test(s2.j.text) && /„retur”/.test(s2.j.text), J(s2));
  T('…rândul lui din „Neasignate" a dispărut', !((await R('GET', '/api/admin/devices')).j || []).some((d) => d.imei === Z));
  const tz2 = await tracker(Z, acum - 60000, 2500);
  T('Z sună din nou și scrie pe mașină', tz2.primit && tz2.ack === 1, J(tz2));
  T('Y (scos, „retur") nu mai e primit', !(await tracker(Y, acum - 50000, 7000)).primit);
  await sleep(400);
  pozK = (await R('GET', '/api/history/' + K + '?from=' + encodeURIComponent(new Date(acum - 3600000).toISOString()) + '&to=' + encodeURIComponent(new Date(acum + 60000).toISOString()))).j;
  T('istoricul: 5 poziții, cu contorul continuat și peste a doua schimbare (101 km → 101 km → 101,5 km)', J(ist(pozK)) === J([100000, 100000, 101000, 101000, 101500]), J(ist(pozK)));
  stoc = ((await R('GET', '/api/stoc')).j || {}).aparate || [];
  T('stocul: Z „montat", Y „retur"', stare(Z) === 'montat' && stare(Y) === 'retur', J([stare(Z), stare(Y)]));

  // Înapoi la aparatul de la montaj, reparat: întâi în depozit, apoi „Schimbă aparatul".
  const inapoiRefuz = await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: K });
  T('aparatul de la montaj, încă „defect", nu se poate pune înapoi', inapoiRefuz.s === 400 && /nu e în stocul nostru/.test(inapoiRefuz.j.error), J(inapoiRefuz));
  await R('POST', '/api/stoc/muta', { ids: [((stoc.filter((x) => x.serie === K)[0]) || {}).id], stare: 'depozit' });
  const s3 = await R('POST', '/api/devices/' + K + '/schimba-aparat', { nou: K });
  fisa = (await R('GET', '/api/devices/' + K + '/full')).j || {};
  T('reparat și pus în depozit: se întoarce pe mașină (fără aparat schimbat)', s3.s === 200 && fisa.aparat_imei == null && fisa.aparat_acum === K, J([s3, fisa.aparat_imei]));
  const tkInapoi = await tracker(K, acum - 30000, 101800), tzScos = await tracker(Z, acum - 20000, 3000);
  T('…K e primit din nou, Z nu', tkInapoi.primit && tkInapoi.ack === 1 && !tzScos.primit, J([tkInapoi, tzScos]));
  T('fereastra ține minte toate trei schimbările', (((await R('GET', '/api/devices/' + K + '/schimba-aparat')).j || {}).istoric || []).length === 3);

  // Mașina arhivată: fereastra spune de ce nu, ruta refuză.
  await R('PUT', '/api/devices/' + V2 + '/status', { status: 'archived' });
  const gArh = await R('GET', '/api/devices/' + V2 + '/schimba-aparat');
  const pArh = await R('POST', '/api/devices/' + V2 + '/schimba-aparat', { nou: Y });
  T('mașina arhivată: „Restaureaz-o întâi", la fereastră și la schimbare', /Restaureaz-o întâi/.test((gArh.j || {}).nuSePoate || '') && pArh.s === 400 && /Restaureaz-o întâi/.test(pArh.j.error), J([gArh.j && gArh.j.nuSePoate, pArh]));
  gata();
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); rele++; gata(); });
