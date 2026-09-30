// verify_drum.js — drumul clientului, de la ofertă la prima factură, cu pașii bifați (Alin, 24.09).
//
//   node verify_drum.js
//
// Alin: „pare alambicat: trec din aia, ies în aia; trebuie să ușurăm asta". Drumul avea opt opriri în
// cinci ecrane și nimic nu spunea unde ești pe el. Acum: o linie de pași (ofertă → trimis la semnat →
// semnat → montaj → aparate → prima factură), socotită într-un singur loc (contracts.js →
// `drumulClientului`), arătată în fișa firmei și în lista Contracte, cu butonul pasului următor.
// Proba parcurge TOT drumul pe server pornit și cere, la fiecare pas, butonul potrivit.

const fs = require('fs');
const { spawn } = require('child_process');
const C = require('./contracts.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const dbSrc = fs.readFileSync('./db.js', 'utf8');

sect('1. Regula drumului (contracts.js)');
const D = (contract, extra) => C.drumulClientului(Object.assign({ contract: contract, areOferta: true, montaje: { total: 0, executate: 0 }, aparate: 0, facturi: 0 }, extra || {}));
const stari = (d) => d.pasi.map((p) => p.cheie + ':' + p.stare).join(' ');
T('șase pași, în ordinea drumului', C.PASI_DRUM.map((p) => p[0]).join(',') === 'oferta,trimis,semnat,montaj,aparate,factura');
T('ciornă → pasul următor e „trimis la semnat" (întâi se aprobă)', D({ status: 'ciorna' }).urmatorul === 'trimis' && D({ status: 'ciorna' }).pasi[1].detaliu === 'întâi se aprobă');
T('aprobat → tot „trimis la semnat"', D({ status: 'aprobat' }).urmatorul === 'trimis');
T('trimis → „semnat"', D({ status: 'trimis' }).urmatorul === 'semnat');
const cuMontaj = { status: 'activ', signed_at: Date.now(), montaj: { items: [{ tip: 'gps', buc: 2 }] } };
T('semnat, cu montaj vândut, fără lucrare făcută → „montajul"', D(cuMontaj).urmatorul === 'montaj', stari(D(cuMontaj)));
T('montaj executat, fără aparate → „aparatele la firmă"', D(cuMontaj, { montaje: { total: 1, executate: 1 } }).urmatorul === 'aparate');
T('aparate la firmă, fără factură → „prima factură"', D(cuMontaj, { montaje: { total: 1, executate: 1 }, aparate: 3 }).urmatorul === 'factura');
const tot = D(cuMontaj, { montaje: { total: 1, executate: 1 }, aparate: 3, facturi: 1 });
T('totul făcut → niciun pas următor, 6 din 6', tot.urmatorul === null && tot.gata === 6 && tot.din === 6, stari(tot));
T('fără montaj vândut → montajul „nu e cazul" și nu se numără', D({ status: 'activ' }).pasi[3].stare === 'nu_e_cazul' && D({ status: 'activ' }).din === 5);
T('fără ofertă → oferta „nu e cazul"', D({ status: 'ciorna' }, { areOferta: false }).pasi[0].stare === 'nu_e_cazul');
T('contract încheiat → drumul s-a terminat, niciun buton', D({ status: 'incheiat' }).urmatorul === null);
T('„3 aparate", „1 lucrare executată" — cu numerele spuse românește', D(cuMontaj, { montaje: { total: 1, executate: 1 }, aparate: 3 }).pasi[4].detaliu === '3 aparate' && D(cuMontaj, { montaje: { total: 1, executate: 1 } }).pasi[3].detaliu === '1 lucrare executată');
T('fără contract → fără drum', C.drumulClientului({ contract: null }) === null);

// ─── 1b. Termenul de montaj (Alin, 30.09: „aplicația să numere cele 30 de zile") ───
// Contractul (cap. V) promite montajul în cel mult 30 de zile de la ÎNCASAREA avansului pentru aparate.
// Zilele se socotesc pe ora României (iarna UTC+2): zb(2027, 1, 6, 10) = 6 ianuarie 2027, ora 10 la București.
sect('1b. Termenul de montaj (contracts.js)');
const zb = (y, m, d, h) => Date.UTC(y, m - 1, d, (h == null ? 12 : h) - 2);
const cu50 = { status: 'activ', signed_at: zb(2027, 1, 5), created_at: zb(2027, 1, 4),
  montaj: { items: [{ tip: 'gps', buc: 20 }, { tip: 'lvcan', buc: 50 }, { tip: 'gps', buc: 30 }] } };
T('mașinile de montat = montajele de aparat GPS din Anexa nr. 2 (20 + 30), nu adaptoarele', C.masiniDeMontat(cu50) === 50);
T('anexa venită ca text din bază se citește la fel', C.masiniDeMontat(Object.assign({}, cu50, { montaj: JSON.stringify(cu50.montaj) })) === 50);
T('fără anexă de montaj → 0 mașini', C.masiniDeMontat({ status: 'activ' }) === 0 && C.masiniDeMontat(null) === 0);
const avans = zb(2027, 1, 6, 10);
T('avansul contractului = prima încasare de DUPĂ contract (una veche, de la alt contract, nu se ia)',
  C.avansContract([zb(2025, 3, 1), zb(2027, 1, 20), avans], cu50) === avans);
T('fără încasare de după contract → fără avans (deci fără termen, nu unul inventat)',
  C.avansContract([zb(2025, 3, 1)], cu50) === null && C.avansContract(null, cu50) === null && C.avansContract([], cu50) === null);
const t15 = C.termenMontaj(cu50, avans, 10, zb(2027, 1, 15, 9));
T('avans încasat pe 6 ianuarie → termenul e 5 februarie (30 de zile)', t15 && new Date(t15.pana).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) === '05.02.2027', t15 && new Date(t15.pana).toISOString());
T('pe 15 ianuarie: „mai sunt 21 de zile", în termen', t15.zile === 21 && t15.stare === 'in_termen' && C.termenText(t15) === 'mai sunt 21 de zile', JSON.stringify(t15));
const t29 = C.termenMontaj(cu50, avans, 10, zb(2027, 1, 29, 9));
T('pe 29 ianuarie (7 zile înainte): „mai sunt 7 zile", se aprinde avertizarea', t29.zile === 7 && t29.stare === 'curand' && C.termenText(t29) === 'mai sunt 7 zile', JSON.stringify(t29));
T('pe 28 ianuarie (8 zile): încă în termen, fără avertizare', C.termenMontaj(cu50, avans, 10, zb(2027, 1, 28, 9)).stare === 'in_termen');
T('pe 4 februarie: „mai e o zi"', C.termenText(C.termenMontaj(cu50, avans, 10, zb(2027, 2, 4, 9))) === 'mai e o zi');
// Zile de CALENDAR: și la 00:10 și la 23:50 în ziua termenului scrie „azi e ultima zi", nu „mai e o zi" / „depășit".
T('în ziua termenului, la orice oră: „azi e ultima zi"',
  C.termenText(C.termenMontaj(cu50, avans, 10, zb(2027, 2, 5, 0) + 10 * 60000)) === 'azi e ultima zi' &&
  C.termenText(C.termenMontaj(cu50, avans, 10, zb(2027, 2, 5, 23) + 50 * 60000)) === 'azi e ultima zi');
const t8 = C.termenMontaj(cu50, avans, 10, zb(2027, 2, 8, 9));
T('pe 8 februarie: „depășit cu 3 zile"', t8.zile === -3 && t8.stare === 'depasit' && C.termenText(t8) === 'depășit cu 3 zile', JSON.stringify(t8));
T('toate cele 50 montate → gata, oricât de târziu', C.termenMontaj(cu50, avans, 50, zb(2027, 3, 1)).stare === 'gata');
T('fără avans încasat / contract încheiat / fără montaj în anexă → nu e cazul',
  C.termenMontaj(cu50, null, 0, zb(2027, 1, 15)) === null &&
  C.termenMontaj(Object.assign({}, cu50, { status: 'incheiat' }), avans, 0, zb(2027, 1, 15)) === null &&
  C.termenMontaj({ status: 'activ', montaj: { items: [{ tip: 'lvcan', buc: 5 }] } }, avans, 0, zb(2027, 1, 15)) === null);
const dT = (montate, acum) => C.drumulClientului({ contract: cu50, areOferta: true, montaje: { total: 1, executate: montate ? 1 : 0, montate: montate },
  aparate: 0, facturi: 0, avansLa: avans, acum: acum });
T('pe drum: „10 din 50 de mașini montate · termen 05.02.2027, mai sunt 21 de zile"',
  dT(10, zb(2027, 1, 15, 9)).pasi[3].detaliu === '10 din 50 de mașini montate · termen 05.02.2027, mai sunt 21 de zile', dT(10, zb(2027, 1, 15, 9)).pasi[3].detaliu);
T('o lucrare executată NU mai bifează montajul cât mai sunt mașini de montat (10 din 50)',
  dT(10, zb(2027, 1, 15, 9)).urmatorul === 'montaj' && dT(10, zb(2027, 1, 15, 9)).termenMontaj.stare === 'in_termen');
T('toate montate → pas bifat, „50 din 50 de mașini montate", fără termen pe ecran',
  dT(50, zb(2027, 2, 8)).pasi[3].stare === 'gata' && dT(50, zb(2027, 2, 8)).pasi[3].detaliu === '50 din 50 de mașini montate' && dT(50, zb(2027, 2, 8)).termenMontaj === null);
T('fără avans încasat: câte sunt montate, fără termen', C.drumulClientului({ contract: cu50, areOferta: true, montaje: { total: 0, executate: 0, montate: 0 }, aparate: 0, facturi: 0 }).pasi[3].detaliu === '0 din 50 de mașini montate');
T('„0 din 1 mașină montată", „3 din 5 mașini montate", „10 din 20 de mașini montate" — românește',
  C.montateText(0, 1) === '0 din 1 mașină montată' && C.montateText(3, 5) === '3 din 5 mașini montate' && C.montateText(10, 20) === '10 din 20 de mașini montate');
const tmE = dT(10, zb(2027, 2, 8, 9)).termenMontaj;
T('drumul trimite ecranului textele GATA scrise („depășit cu 3 zile", „10 din 50 de mașini montate")',
  tmE && tmE.stare === 'depasit' && tmE.text === 'depășit cu 3 zile' && tmE.cate === '10 din 50 de mașini montate', JSON.stringify(tmE));

sect('2. Pe ecran');
T('fișa firmei, fila Contract, pornește cu drumul', /h \+= _raxDrumHtml\(d\.drum, c, co\.id\);/.test(html));
T('lista Contracte arată pasul următor și după semnare', /var dr = c\.drum; if \(!dr \|\| !dr\.urmatorul\) return '';/.test(html));
const fnBtn = html.slice(html.indexOf('function _drumButon('), html.indexOf('// Linia de pași din fila Contract'));
// De pe 30.09 montajul se programează DOAR în calendar (Business → Montaj), cu fereastra deschisă pe clientul ăsta.
T('montaj → „Programează montajul" (duce în calendar, pe clientul ăsta)', /raxDrumMontaj\(/.test(fnBtn) &&
  /_raxMj\.cal\.pre = companyId;[\s\S]*raxAdminTab\('montaj'\)/.test(html.slice(html.indexOf('window.raxDrumMontaj'), html.indexOf('window.raxDrumAparate'))));
T('aparate → „Adoptă aparatele", tot prin SINGURUL loc de adopție (decizie 17.09)',
  /raxDrumAparate\(\)/.test(fnBtn) && /raxDevDeschideNeasignate\(\)/.test(html.slice(html.indexOf('window.raxDrumAparate'), html.indexOf('window.raxDrumFactura'))) &&
  !/\/company'/.test(html.slice(html.indexOf('function _drumButon('), html.indexOf('window.raxDrumFactura'))));
// De pe 28.09 prima factură se deschide pe „factură unică" (aparate + montaj, din contract): abonamentul
// pleacă singur, luna următoare, cu zilele de la montaj.
T('factura → „Emite prima factură", cu firma deja aleasă, pe factura unică', /raxOpenGenInvoice\(companyId, 'unica'\)/.test(html.slice(html.indexOf('window.raxDrumFactura'), html.indexOf('window.raxDrumFactura') + 700)));
T('„Aprobă" din fișă salvează întâi formularul (raxCtrTreci)', /inFisa \? 'raxCtrTreci\(\\'aprobat\\'\)'/.test(fnBtn));
const fnDrum = html.slice(html.indexOf('function _raxDrumHtml('), html.indexOf('window.raxDrumMontaj'));
T('termenul de montaj se arată pe drum DOAR când se apropie sau a trecut, cu textele venite de la server',
  /tm && \(tm\.stare === 'curand' \|\| tm\.stare === 'depasit'\)/.test(fnDrum) && /esc\(tm\.text\)/.test(fnDrum) && /esc\(tm\.cate\)/.test(fnDrum) &&
  !/'mai sunt |tm\.montate \+|tm\.deMontat \+/.test(fnDrum));   // nicio a doua scriere a textelor în pagină (comentariile nu contează)
T('butoanele din fișă reîmprospătează fișa, nu doar lista', /function _ctreDupa\(\)/.test(html) && /raxOpenCompanyDetail\(_raxCtr\.id, 'contract'\)/.test(html.slice(html.indexOf('function _ctreDupa()'), html.indexOf('function _ctreDupa()') + 400)));

sect('3. Pe server');
T('lista și fișa folosesc aceeași regulă (_drumContract)', /drum: _drumContract\(c, drumDate\)/.test(server) && /drum: contract && contract\.status !== 'incheiat' \? _drumContract\(contract,/.test(server));
const fnDD = dbSrc.slice(dbSrc.indexOf('async function drumDateToate('), dbSrc.indexOf('// Firmele care n-au NICIUN contract'));
T('aparatele arhivate nu se numără', /status IS DISTINCT FROM 'archived'/.test(fnDD));
T('facturile ciornă și anulate nu se numără', /status IS DISTINCT FROM 'draft' AND status IS DISTINCT FROM 'canceled'/.test(fnDD));
T('lista, fișa și anunțul zilnic iau avansul PE CONTRACT, prin aceeași funcție',
  (server.match(/contracte\.avansContract\(\(dd\.avans \|\| \{\}\)\[c\.company_id\], c\)/g) || []).length === 2);
T('anunțul zilnic are contractul cu ziua lui de naștere (fără ea, avansul unui contract vechi s-ar lua pe cel nou)',
  /c\.notice_days, c\.montaj, c\.created_at,/.test(dbSrc.slice(dbSrc.indexOf('async function contracteInVigoare('), dbSrc.indexOf('async function contracteInVigoare(') + 600)));

// ─── 3b. Anunțul zilnic către noi, pe bucata ADEVĂRATĂ din server.js, cu ceasul pus pe zilele contractului ───
sect('3b. Anunțul zilnic de termen de montaj (bucata din server.js, cu ceasul mutat)');
let tickGata = Promise.resolve();
{
  const i0 = server.indexOf('async function contractExpiryTick(');
  const fnTick = server.slice(i0, server.indexOf('\n// Escape HTML minimal', i0));
  const chei = new Set(), anunturi = [];
  let ceas = 0;
  class Ceas extends Date { constructor(...a) { if (a.length) super(...a); else super(ceas); } static now() { return ceas; } }
  const dd = { montaje: { 7: { total: 1, executate: 1, montate: 10 } }, avans: { 3: [avans] }, aparate: {}, facturi: {}, oferte: {} };
  const contract = Object.assign({ id: 7, company_id: 3, company_name: 'Montaj SRL', number: 'RAT-2027-0001', auto_renew: true,
    start_at: zb(2027, 1, 5), months: 24, notice_days: 30 }, cu50);
  const db = {
    contracteInVigoare: async () => [contract],
    getAllActiveUsers: async () => [{ id: 1, role: 'superadmin' }, { id: 2, role: 'company_admin' }],
    drumDateToate: async () => dd,
    notificationKeyExists: async (k) => chei.has(k),
    createNotification: async () => { throw new Error('anunțul de expirare nu trebuia să pornească'); }
  };
  const anunta = async (supers, tip, grav, titlu, corp, date) => { anunturi.push({ supers: supers.map((u) => u.id), tip, grav, titlu, corp, date }); chei.add(date.key); return {}; };
  const tick = new Function('db', 'contracte', '_anuntaSuperadmini', 'broadcastWsToUser', 'sendPushToUser', 'Date', fnTick + '\nreturn contractExpiryTick;')(
    db, C, anunta, () => {}, async () => {}, Ceas);
  const zi = async (t) => { ceas = t; const n = anunturi.length; const r = await tick(); return { r, noi: anunturi.slice(n) }; };
  tickGata = (async () => {
    let z = await zi(zb(2027, 1, 15, 9));
    T('15 ianuarie (21 de zile rămase): niciun anunț', z.noi.length === 0 && z.r.montaj.length === 0, JSON.stringify(z.noi));
    z = await zi(zb(2027, 1, 29, 9));
    const a = z.noi[0] || {};
    T('29 ianuarie: UN anunț, „Montaj, mai sunt 7 zile: Montaj SRL", avertizare', z.noi.length === 1 && a.titlu === 'Montaj, mai sunt 7 zile: Montaj SRL' && a.grav === 'warning' && a.tip === 'montaj_termen', JSON.stringify(z.noi));
    T('anunțul spune câte, până când și ce e de făcut', /Montaj SRL: 10 din 50 de mașini montate\. Termenul din contract \(30 de zile de la încasarea avansului\) e 05\.02\.2027\. Programează restul/.test(a.corp || ''), a.corp);
    T('merge DOAR la noi (super-admin), nu la administratorul firmei', JSON.stringify(a.supers) === '[1]');
    z = await zi(zb(2027, 1, 30, 9));
    T('30 ianuarie: nu se repetă (o dată pe termen)', z.noi.length === 0, JSON.stringify(z.noi));
    z = await zi(zb(2027, 2, 6, 9));
    const b = z.noi[0] || {};
    T('6 februarie: „Termenul de montaj a trecut: Montaj SRL", critic', z.noi.length === 1 && b.titlu === 'Termenul de montaj a trecut: Montaj SRL' && b.grav === 'critical', JSON.stringify(z.noi));
    T('la depășire amintește că mașinile neaduse prelungesc termenul (cap. V)', /a fost 05\.02\.2027\. Dacă mașinile n-au fost aduse de client, termenul se prelungește/.test(b.corp || ''), b.corp);
    z = await zi(zb(2027, 2, 7, 9));
    T('7 februarie: nu se repetă', z.noi.length === 0);
    dd.montaje[7].montate = 50; chei.clear();
    z = await zi(zb(2027, 2, 9, 9));
    T('toate montate → niciun anunț, oricât de târziu', z.noi.length === 0);
    dd.montaje[7].montate = 10; dd.avans[3] = [zb(2025, 3, 1)];
    z = await zi(zb(2027, 2, 9, 9));
    T('avansul unui contract VECHI nu pornește termenul contractului nou', z.noi.length === 0, JSON.stringify(z.noi));
  })().catch((e) => T('anunțul zilnic rulează', false, e && e.stack));
}

// ─── 4. Pe server pornit: tot drumul, pas cu pas ────────────────────────────────────────────
const PORT = 3226, DIR = '.drum-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_drum',
  PORT: String(PORT), TCP_PORT: '5226', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
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
(async () => {
  await tickGata;
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('4. Pe server pornit: tot drumul');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 19 } });
  // Oferta cu montaj → firma → contractul din ofertă.
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Drum', client_name: 'Drum SRL', monthly_total: 58, currency: 'RON',
    config: { cfg: { nVeh: 2, contractMonths: 12, montaj: { qGps: 2 }, devices: {} }, prices: { pPlain: 29, mGps: 100 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Drum SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO777', address: 'Str. Drumului 1', legal_rep: { name: 'Ana Drum', role: 'Administrator' } });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 2, pret: 29, total: 58 }], servicii: [] } })).j;
  const drumLista = async () => ((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c.id)[0] || {}).drum || {};
  const drumFisa = async () => (((await R('GET', '/api/companies/' + co.id + '/overview')).j || {}).drum) || {};
  let d = await drumLista();
  T('contractul din ofertă: oferta bifată, pasul următor „trimis la semnat"', d.pasi && d.pasi[0].stare === 'gata' && d.urmatorul === 'trimis', JSON.stringify(d.pasi && d.pasi.map((p) => p.stare)));
  T('montajul vândut în ofertă se așteaptă pe drum', d.pasi && d.pasi[3].stare === 'urmeaza');
  T('fișa firmei spune același drum ca lista', JSON.stringify(await drumFisa()) === JSON.stringify(d));
  await R('PUT', '/api/contracts/' + c.id, { status: 'aprobat' });
  T('aprobat → tot „trimis la semnat"', (await drumLista()).urmatorul === 'trimis');
  await R('PUT', '/api/contracts/' + c.id, { status: 'trimis' });
  T('trimis → „semnat"', (await drumLista()).urmatorul === 'semnat');
  await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
  T('semnat → „montajul"', (await drumLista()).urmatorul === 'montaj');
  const m = await R('POST', '/api/companies/' + co.id + '/montaje', { contract_id: c.id, status: 'programat', items: [{ tip: 'gps', buc: 2, pretClient: 100, costPartener: 60 }] });
  T('o lucrare doar programată nu bifează montajul', m.s === 200 && (await drumLista()).urmatorul === 'montaj', m.s + ' ' + JSON.stringify(m.j && m.j.error));
  await R('POST', '/api/companies/' + co.id + '/montaje', { id: m.j && m.j.id, contract_id: c.id, status: 'executat', items: [{ tip: 'gps', buc: 2, pretClient: 100, costPartener: 60 }] });
  d = await drumLista();
  T('lucrarea executată bifează montajul → „aparatele la firmă"', d.urmatorul === 'aparate', JSON.stringify(d.pasi && d.pasi[3]));
  await R('POST', '/api/devices', { imei: '869400000000001', name: 'D1', company_id: co.id });
  d = await drumLista();
  T('un aparat la firmă → „prima factură"', d.urmatorul === 'factura' && d.pasi[4].detaliu === '1 aparat', JSON.stringify(d.pasi && d.pasi[4]));
  const f = await R('POST', '/api/invoices', { companyId: co.id, lines: [{ desc: 'Abonament', qty: 1, unitPrice: 29 }] });
  d = await drumLista();
  T('prima factură emisă → drumul e gata (6 din 6)', f.s === 200 && d.urmatorul === null && d.gata === 6 && d.din === 6, f.s + ' ' + JSON.stringify(d));

  // ─── 5. Termenul de montaj pe server pornit: avansul încasat pornește cele 30 de zile ───
  sect('5. Termenul de montaj, pe server pornit (30.09)');
  const of2 = (await R('POST', '/api/admin/offers', { name: 'Ofertă Termen', client_name: 'Termen SRL', monthly_total: 58, currency: 'RON',
    config: { cfg: { nVeh: 2, contractMonths: 12, montaj: { qGps: 2 }, devices: {} }, prices: { pPlain: 29, mGps: 100 } } })).j;
  const co2 = (await R('POST', '/api/companies', { name: 'Termen SRL' })).j;
  await R('PUT', '/api/companies/' + co2.id + '/dosar', { cui: 'RO778', address: 'Str. Termenului 2', legal_rep: { name: 'Ion Termen', role: 'Administrator' } });
  const c2 = (await R('POST', '/api/companies/' + co2.id + '/contract', { offer_id: of2.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 2, pret: 29, total: 58 }], servicii: [] } })).j;
  await R('PUT', '/api/contracts/' + c2.id, { status: 'aprobat' });
  await R('PUT', '/api/contracts/' + c2.id, { status: 'trimis' });
  await R('PUT', '/api/contracts/' + c2.id, { status: 'activ', signed_at: Date.now() });
  const drum2 = async () => ((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c2.id)[0] || {}).drum || {};
  let d2 = await drum2();
  T('semnat, avansul neîncasat: „0 din 2 mașini montate", fără termen', d2.pasi && d2.pasi[3].detaliu === '0 din 2 mașini montate' && !d2.termenMontaj, JSON.stringify(d2.pasi && d2.pasi[3]));
  const pf2 = await R('POST', '/api/invoices', { companyId: co2.id, tip: 'proforma', fel: 'unica', lines: [{ desc: 'Echipament — Teltonika FMC130', qty: 2, unitPrice: 500 }] });
  d2 = await drum2();
  T('proforma doar emisă (neîncasată) nu pornește termenul', pf2.s === 200 && !d2.termenMontaj, pf2.s + ' ' + JSON.stringify(d2.termenMontaj));
  const inc2 = await R('PUT', '/api/invoices/' + (pf2.j && pf2.j.invoice && pf2.j.invoice.id) + '/status', { status: 'paid' });
  d2 = await drum2();
  const azi30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
  T('proforma încasată → pe drum: „0 din 2 mașini montate · termen <azi + 30>, mai sunt 30 de zile"',
    inc2.s === 200 && d2.pasi && d2.pasi[3].detaliu === '0 din 2 mașini montate · termen ' + azi30 + ', mai sunt 30 de zile' && d2.termenMontaj && d2.termenMontaj.stare === 'in_termen',
    inc2.s + ' ' + JSON.stringify(d2.pasi && d2.pasi[3]));
  T('fișa firmei spune același termen ca lista', JSON.stringify(((await R('GET', '/api/companies/' + co2.id + '/overview')).j || {}).drum) === JSON.stringify(d2));
  const chk = await R('POST', '/api/admin/contracts/check-expiry');
  T('în termen → anunțul zilnic tace', chk.s === 200 && Array.isArray(chk.j.montaj) && chk.j.montaj.indexOf(c2.id) < 0, JSON.stringify(chk.j));
  await R('POST', '/api/companies/' + co2.id + '/montaje', { contract_id: c2.id, status: 'executat', items: [{ tip: 'gps', buc: 1, pretClient: 100, costPartener: 60 }] });
  d2 = await drum2();
  T('o mașină montată: „1 din 2", montajul încă nebifat', d2.pasi[3].stare !== 'gata' && /^1 din 2 mașini montate · termen /.test(d2.pasi[3].detaliu), JSON.stringify(d2.pasi[3]));
  await R('POST', '/api/companies/' + co2.id + '/montaje', { contract_id: c2.id, status: 'executat', items: [{ tip: 'gps', buc: 1, pretClient: 100, costPartener: 60 }] });
  d2 = await drum2();
  T('și a doua → montajul bifat, „2 din 2 mașini montate", termenul dispare', d2.pasi[3].stare === 'gata' && d2.pasi[3].detaliu === '2 din 2 mașini montate' && !d2.termenMontaj, JSON.stringify(d2.pasi[3]));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
