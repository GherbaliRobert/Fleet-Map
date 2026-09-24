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

sect('2. Pe ecran');
T('fișa firmei, fila Contract, pornește cu drumul', /h \+= _raxDrumHtml\(d\.drum, c, co\.id\);/.test(html));
T('lista Contracte arată pasul următor și după semnare', /var dr = c\.drum; if \(!dr \|\| !dr\.urmatorul\) return '';/.test(html));
const fnBtn = html.slice(html.indexOf('function _drumButon('), html.indexOf('// Linia de pași din fila Contract'));
T('montaj → „Programează montajul" (deschide formularul lucrării)', /raxDrumMontaj\(/.test(fnBtn) && /raxMontajEdit\(0\)/.test(html.slice(html.indexOf('window.raxDrumMontaj'), html.indexOf('window.raxDrumAparate'))));
T('aparate → „Adoptă aparatele", tot prin SINGURUL loc de adopție (decizie 17.09)',
  /raxDrumAparate\(\)/.test(fnBtn) && /raxDevDeschideNeasignate\(\)/.test(html.slice(html.indexOf('window.raxDrumAparate'), html.indexOf('window.raxDrumFactura'))) &&
  !/\/company'/.test(html.slice(html.indexOf('function _drumButon('), html.indexOf('window.raxDrumFactura'))));
T('factura → „Emite prima factură", cu firma deja aleasă', /raxOpenGenInvoice\(companyId\)/.test(html.slice(html.indexOf('window.raxDrumFactura'), html.indexOf('window.raxDrumFactura') + 500)));
T('„Aprobă" din fișă salvează întâi formularul (raxCtrTreci)', /inFisa \? 'raxCtrTreci\(\\'aprobat\\'\)'/.test(fnBtn));
T('butoanele din fișă reîmprospătează fișa, nu doar lista', /function _ctreDupa\(\)/.test(html) && /raxOpenCompanyDetail\(_raxCtr\.id, 'contract'\)/.test(html.slice(html.indexOf('function _ctreDupa()'), html.indexOf('function _ctreDupa()') + 400)));

sect('3. Pe server');
T('lista și fișa folosesc aceeași regulă (_drumContract)', /drum: _drumContract\(c, drumDate\)/.test(server) && /drum: contract && contract\.status !== 'incheiat' \? _drumContract\(contract,/.test(server));
const fnDD = dbSrc.slice(dbSrc.indexOf('async function drumDateToate('), dbSrc.indexOf('// Firmele care n-au NICIUN contract'));
T('aparatele arhivate nu se numără', /status IS DISTINCT FROM 'archived'/.test(fnDD));
T('facturile ciornă și anulate nu se numără', /status IS DISTINCT FROM 'draft' AND status IS DISTINCT FROM 'canceled'/.test(fnDD));

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
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
