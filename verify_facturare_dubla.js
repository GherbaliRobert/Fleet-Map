// verify_facturare_dubla.js — nimic nu se facturează de două ori (01.10, punctele 18 și 19 din verificarea lui Robert).
//
//   node verify_facturare_dubla.js
//
// 18. „Încasată" pe o proformă, apăsată de două ori (web + telefon, în aceeași secundă), făcea DOUĂ facturi fiscale —
//     și, de pe 30.09, amândouă plecau singure la client, pe email și la ANAF. O eroare la mijloc lăsa o factură
//     fiscală neplătită, care pornea neplata. Acum totul se scrie într-o singură tranzacție (`db.incaseazaProforma`).
// 19. „Montaj de facturat" propunea din nou un montaj deja facturat: pus pe o proformă (proforma nu marca nimic, nici la
//     încasare) sau redeschis cu „partenerul ne-a facturat". Acum lucrarea ține minte documentul (`factura_client`,
//     `proforma_client`), iar „liberă de facturat" e O SINGURĂ regulă, în db.js (`_MONTAJ_LIBER`).
// Proba citește codul, rulează funcția din db.js pe o bază adevărată (cu o cădere provocată la mijloc) și parcurge
// tot drumul pe server pornit, cu cinci apăsări deodată.

const fs = require('fs');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const server = fs.readFileSync('./server.js', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const billingTel = fs.readFileSync('./mobile/src/screens/Billing.tsx', 'utf8');
const taie = (sursa, start, capat) => {
  const a = sursa.indexOf(start); if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 60));
  const b = sursa.indexOf(capat, a + start.length); if (b < 0) throw new Error('nu găsesc capătul: ' + capat.slice(0, 60));
  return sursa.slice(a, b);
};
const faraComentarii = (s) => s.split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');

sect('1. Codul: o singură regulă, o singură tranzacție');
{
  const liber = (dbjs.match(/\$\{_MONTAJ_LIBER\}/g) || []).length;
  T('„liberă de facturat" e scrisă O dată (`_MONTAJ_LIBER`) și folosită peste tot: listă, refuz, marcare, rezervare, „Montaj de facturat"',
    (dbjs.match(/const _MONTAJ_LIBER = /g) || []).length === 1 && liber >= 5, liber);
  const vechi = (faraComentarii(dbjs + server).match(/status IN \('executat', 'facturat_de_partener'\)/g) || []).length;
  T('nicio altă scriere a regulii („status IN executat, facturat_de_partener") în afara ei', vechi === 1, vechi);
  T('ciorna facturii unice NU mai filtrează pe stare, ci pe regula din db.js', !/\['executat', 'facturat_de_partener'\]\.indexOf/.test(server) && /if \(!j\.liber_de_facturat\) return;/.test(server));
  const ramura = taie(server, "if (inv.type === 'proforma') {\n        if (inv.status === 'paid') return res.json({ ok: true, already: true",
    "if (inv.status === 'paid') return res.json({ ok: true, already: true });");
  T('„Încasată" pe proformă trece DOAR prin `db.incaseazaProforma` (fără pașii separați de dinainte)',
    /db\.incaseazaProforma\(/.test(ramura) && !/createInvoice|payInvoiceAtomic|nextInvoiceNumber|updateInvoice/.test(ramura));
  T('…și trimite factura DUPĂ ce totul e scris (un email nu se poate întoarce odată cu o tranzacție)',
    ramura.indexOf('db.incaseazaProforma(') < ramura.indexOf('_trimiteFactura('));
  const fn = taie(dbjs, 'async function incaseazaProforma(', '\n}\n');
  const pas = (re) => fn.search(re);
  T('în tranzacție, ordinea: revendicarea proformei → numărul → plata → factura → legătura → lucrările → COMMIT',
    pas(/BEGIN/) < pas(/UPDATE invoices SET status = 'paid'/) && pas(/UPDATE invoices SET status = 'paid'/) < pas(/INSERT INTO invoice_counters/) &&
    pas(/INSERT INTO invoice_counters/) < pas(/INSERT INTO payments/) && pas(/INSERT INTO payments/) < pas(/INSERT INTO invoices/) &&
    pas(/INSERT INTO invoices/) < pas(/SET factura_id/) && pas(/SET factura_id/) < pas(/UPDATE montaje/) && pas(/UPDATE montaje/) < pas(/COMMIT/));
  T('revendicarea cere ca proforma să nu fie deja încasată sau anulată (a doua apăsare nu găsește nimic de luat)',
    /WHERE id = \$1 AND type = 'proforma' AND factura_id IS NULL\s+AND status IS DISTINCT FROM 'paid' AND status IS DISTINCT FROM 'canceled'/.test(fn));
  T('totul pe aceeași legătură (`client.query`), nimic pe lângă ea', !/pool\.query/.test(fn) && /ROLLBACK/.test(fn));
  T('anularea unei facturi îi eliberează lucrările', /elibereazaMontajeleFacturii\(inv\.id\)/.test(server));
  T('emiterea refuză un montaj deja pe alt document (și previzualizarea, prin aceeași compunere)', /montajeNelibere\(id, montajeCerute\)/.test(taie(server, 'async function _compuneFactura(', "app.post('/api/invoices', ")));
  T('pagina: rândul lucrării spune documentul, iar starea unei lucrări facturate e încuiată',
    /function _raxMontDoc\(m\)/.test(html) && /id="mo-stare"' \+ \(e\.factura_client != null \? ' disabled' : ''\)/.test(html));
  T('pagina: „Încasată" apăsată a doua oară spune „era deja încasată", nu „factură emisă"', /Proforma era deja încasată/.test(html));
  T('telefonul nu mai spune că montajul de pe o proformă „va fi propus din nou" (nu mai e adevărat)', !/nici când proforma se încasează/.test(billingTel));
}

// ─── 2. Funcția din db.js, pe o bază adevărată (PGlite), cu o cădere provocată la mijloc ─────────────────
async function dbParte() {
  const db = require('./db.js');
  await db.initDb();
  const n = async (sql, a) => Number((await db.pool.query(sql, a || [])).rows[0].n);
  const out = {};
  const co = await db.createCompany({ name: 'Atomic SRL' });
  const pf = await db.createInvoice({ companyId: co.id, series: 'PF', number: 1, year: 2026, fullNumber: 'PF-2026-00001', type: 'proforma',
    status: 'issued', subtotal: 1000, vatAmount: 210, total: 1210, lines: [{ desc: 'Montaj GPS', qty: 10, unitPrice: 100 }], fel: 'unica' });
  const mo = (await db.pool.query(`INSERT INTO montaje (company_id, items, total_client, status, proforma_client, created_at, updated_at)
      VALUES ($1, '[{"tip":"gps","buc":10,"pretClient":100}]', 1000, 'executat', $2, 1, 1) RETURNING id`, [co.id, pf.id])).rows[0].id;
  const iss = { name: 'RA TRACKS SRL', cui: 'RO999' };
  const contor = () => n("SELECT COALESCE(MAX(last_number), 0) AS n FROM invoice_counters WHERE series = 'RAT'");
  const inainte = { contor: await contor(), plati: await n('SELECT COUNT(*) AS n FROM payments') };
  let eroare = null;
  try {
    await db.incaseazaProforma(pf.id, { series: 'RAT', iss: iss, client: { toJSON() { throw new Error('cădere la mijloc'); } }, method: 'transfer' });
  } catch (e) { eroare = e.message; }
  const dupaCadere = await db.getInvoice(pf.id);
  out.cadere = { eroare: eroare, status: dupaCadere.status, factura_id: dupaCadere.factura_id, contor: await contor(), contorInainte: inainte.contor,
    plati: await n('SELECT COUNT(*) AS n FROM payments'), platiInainte: inainte.plati,
    facturi: await n('SELECT COUNT(*) AS n FROM invoices WHERE din_proforma = $1', [pf.id]),
    montaj: (await db.pool.query('SELECT status, factura_client FROM montaje WHERE id = $1', [mo])).rows[0] };
  // Martorul: pașii SEPARAȚI de dinainte (citește proforma → număr → factură → plată → leagă), rulați la fel, de cinci
  // ori deodată, pe altă proformă și în altă serie. Dacă ei fac mai multe facturi, proba chiar prinde o dublură.
  const pfM = await db.createInvoice({ companyId: co.id, series: 'PF', number: 2, year: 2026, fullNumber: 'PF-2026-00002', type: 'proforma',
    status: 'issued', subtotal: 100, vatAmount: 21, total: 121, lines: [{ desc: 'Echipament', qty: 1, unitPrice: 100 }], fel: 'unica' });
  const pasiVechi = async () => {
    const inv = await db.getInvoice(pfM.id);
    if (inv.status === 'paid') return { deja: true };
    const num = await db.nextInvoiceNumber('MRT', new Date().getFullYear());
    const f = await db.createInvoice({ companyId: inv.company_id, series: num.series, number: num.number, year: num.year, fullNumber: num.full,
      type: 'invoice', status: 'issued', subtotal: Number(inv.subtotal), vatAmount: Number(inv.vat_amount), total: Number(inv.total), lines: inv.lines, fel: 'unica', dinProforma: inv.id });
    await db.payInvoiceAtomic(f.id, { companyId: inv.company_id, amountRon: Number(f.total) }, {});
    await db.updateInvoice(inv.id, { status: 'paid', paidAt: Date.now(), facturaId: f.id });
    return { invoice: f };
  };
  await Promise.all([1, 2, 3, 4, 5].map(pasiVechi));
  out.martor = { facturi: await n('SELECT COUNT(*) AS n FROM invoices WHERE din_proforma = $1', [pfM.id]) };
  const platiDupaMartor = await n('SELECT COUNT(*) AS n FROM payments');
  out.cadere.platiDupaMartor = platiDupaMartor;
  const rez = await Promise.all([1, 2, 3, 4, 5].map(() => db.incaseazaProforma(pf.id, { series: 'RAT', iss: iss, client: { name: 'Atomic SRL' }, method: 'transfer' })));
  const facuta = rez.filter((r) => r.invoice)[0];
  const pfDupa = await db.getInvoice(pf.id);
  out.cinci = { facute: rez.filter((r) => r.invoice).length, deja: rez.filter((r) => r.deja).length,
    facturi: await n('SELECT COUNT(*) AS n FROM invoices WHERE din_proforma = $1', [pf.id]), plati: await n('SELECT COUNT(*) AS n FROM payments'),
    numar: facuta && facuta.invoice.full_number, contor: await contor(), stare: facuta && facuta.invoice.status, platita: !!(facuta && facuta.invoice.payment_id),
    legata: pfDupa.factura_id === (facuta && facuta.invoice.id) && pfDupa.status === 'paid', montajeTrecute: facuta && facuta.montaje,
    montaj: (await db.pool.query('SELECT status, factura_client FROM montaje WHERE id = $1', [mo])).rows[0], facturaId: facuta && facuta.invoice.id };
  console.log('REZULTAT ' + JSON.stringify(out));
  process.exit(0);
}

const DIRDB = '.facturare-dubla-db';
try { fs.rmSync(DIRDB, { recursive: true, force: true }); } catch (e) {}
const dbRez = new Promise((res) => {
  const env = Object.assign({}, process.env, { PGLITE_DIR: DIRDB + '/pgdata' });
  delete env.DATABASE_URL;
  const c = spawn(process.execPath, ['-e', '(' + dbParte.toString() + ')().catch((e) => { console.log("EROARE " + e.message); process.exit(1); })'], { env: env, cwd: __dirname });
  let txt = '';
  c.stdout.on('data', (d) => { txt += d; });
  c.stderr.on('data', () => {});
  c.on('exit', () => {
    try { fs.rmSync(DIRDB, { recursive: true, force: true }); } catch (e) {}
    const r = txt.split('\n').filter((x) => x.indexOf('REZULTAT ') === 0)[0];
    res(r ? JSON.parse(r.slice(9)) : { lipsa: txt.slice(-400) });
  });
});

// ─── 3. Pe server pornit: tot drumul ─────────────────────────────────────────────────────────
const PORT = 3253, DIR = '.facturare-dubla-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_dubla',
  PORT: String(PORT), TCP_PORT: '5253', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST; delete envS.ANAF_EFACTURA_TOKEN;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (x) => new Promise((r) => setTimeout(r, x));
let srv = null;
function gata() {
  try { if (srv) srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
async function intra(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  return async (m, url, body) => {
    const x = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) {}
    return { s: x.status, j: j };
  };
}

(async () => {
  sect('2. Funcția din db.js, pe o bază adevărată');
  const d = await dbRez;
  const c = d.cadere || {}, k = d.cinci || {};
  T('o cădere la mijlocul încasării întoarce TOT: proforma rămâne neîncasată, fără factură, fără plată, fără număr luat',
    /cădere la mijloc/.test(c.eroare || '') && c.status === 'issued' && c.factura_id == null && c.facturi === 0 && c.plati === c.platiInainte && c.contor === c.contorInainte, J(d.cadere || d));
  T('…iar lucrarea de pe proformă nu trece pe „facturat"', c.montaj && c.montaj.status === 'executat' && c.montaj.factura_client == null, J(c.montaj));
  T('martorul — pașii separați de dinainte, de cinci ori deodată — face MAI MULTE facturi din aceeași proformă (așa era)',
    d.martor && d.martor.facturi > 1, J(d.martor));
  T('cinci apăsări deodată, prin funcția nouă: O factură fiscală și o plată; celelalte patru găsesc proforma deja încasată',
    k.facute === 1 && k.deja === 4 && k.facturi === 1 && k.plati === c.platiDupaMartor + 1, J(k));
  T('numărul facturii e primul din șir (căderea de dinainte n-a „mâncat" niciunul)', k.numar === 'RAT-' + new Date().getFullYear() + '-00001' && k.contor === 1, k.numar);
  T('factura e plătită (cu plata legată), iar proforma e încasată și legată de ea', k.stare === 'paid' && k.platita && k.legata, J(k));
  T('lucrarea de pe proformă trece pe „facturat clientului", pe factura nouă', k.montajeTrecute === 1 && k.montaj && k.montaj.status === 'facturat_clientului' && k.montaj.factura_client === k.facturaId, J(k.montaj));

  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('3. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 21 } });
  const co = (await R('POST', '/api/companies', { name: 'Montaj SRL' })).j;
  const azi = new Date(), lunaTrecuta = new Date(azi.getFullYear(), azi.getMonth() - 1, 15, 10).getTime();
  const lucrare = async (buc, extra) => (await R('POST', '/api/companies/' + co.id + '/montaje', Object.assign({ status: 'executat', data_lucrare: lunaTrecuta,
    items: [{ tip: 'gps', buc: buc, pretClient: 100, costPartener: 60 }] }, extra || {}))).j;
  const L1 = await lucrare(10), L2 = await lucrare(5);
  const liniiDe = (L) => [{ desc: 'Instalare dispozitiv GPS', qty: L.items[0].buc, unitPrice: 100 }];
  const propuse = async () => ((((await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' })).j || {}).dinContract || {}).lucrari || []).map((x) => x.id).sort();
  const deFacturat = async () => { const x = (await R('GET', '/api/montaj/de-facturat')).j || {}; return [].concat(x.gata || [], x.inCurs || []).filter((g) => g.company_id === co.id).reduce((a, g) => a.concat(g.lucrari), []).sort(); };
  const lucr = async (id) => ((await R('GET', '/api/companies/' + co.id + '/montaje')).j || []).filter((m) => m.id === id)[0] || {};
  T('la început: amândouă lucrările sunt propuse, în fereastra facturii și în „Montaj de facturat"',
    J(await propuse()) === J([L1.id, L2.id].sort()) && J(await deFacturat()) === J([L1.id, L2.id].sort()), J({ p: await propuse(), d: await deFacturat() }));

  // 19a: montajul pus pe o proformă nu se mai propune, iar la încasare trece pe factură.
  const pf = await R('POST', '/api/invoices', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: liniiDe(L1), montaje: [L1.id] });
  T('proforma cu montajul din ' + new Date(lunaTrecuta).toLocaleDateString('ro-RO') + ': lucrarea rămâne rezervată pe ea', pf.s === 200 && pf.j.montajePeProforma === 1, J(pf.j));
  T('…și nu mai e propusă: nici în fereastra facturii, nici în „Montaj de facturat"', J(await propuse()) === J([L2.id]) && J(await deFacturat()) === J([L2.id]), J({ p: await propuse(), d: await deFacturat() }));
  const l1pf = await lucr(L1.id);
  T('rândul lucrării spune proforma pe care stă', l1pf.proforma_client_nr === pf.j.invoice.full_number && l1pf.liber_de_facturat === false, J({ nr: l1pf.proforma_client_nr, l: l1pf.liber_de_facturat }));
  const dublu = await R('POST', '/api/invoices', { companyId: co.id, tip: 'invoice', fel: 'unica', lines: liniiDe(L1), montaje: [L1.id] });
  T('o fereastră rămasă deschisă de dinainte nu mai poate pune același montaj pe o factură: refuz, cu proforma pe nume',
    dublu.s === 409 && new RegExp('proforma ' + pf.j.invoice.full_number).test(dublu.j.error || '') && J(dublu.j.montajeOcupate) === J([L1.id]), J(dublu));
  const pv = await R('POST', '/api/invoices/previzualizare', { companyId: co.id, tip: 'invoice', fel: 'unica', lines: liniiDe(L1), montaje: [L1.id] });
  T('previzualizarea spune același refuz (ce vezi e ce pleacă)', pv.s === 409, pv.s);
  T('lucrarea de pe o proformă nu se șterge', (await R('DELETE', '/api/montaje/' + L1.id)).s === 409);

  // 18: cinci apăsări pe „Încasată" deodată.
  const toate = await Promise.all([1, 2, 3, 4, 5].map(() => R('PUT', '/api/invoices/' + pf.j.invoice.id + '/status', { status: 'paid' })));
  const facute = toate.filter((r) => r.s === 200 && !r.j.already), deja = toate.filter((r) => r.s === 200 && r.j.already);
  const facturi = (((await R('GET', '/api/invoices?company_id=' + co.id)).j || {}).invoices || []);
  const dinPf = facturi.filter((v) => v.din_proforma === pf.j.invoice.id);
  T('cinci apăsări pe „Încasată" deodată: O SINGURĂ factură fiscală', facute.length === 1 && deja.length === 4 && dinPf.length === 1,
    J({ facute: facute.length, deja: deja.length, dinPf: dinPf.map((v) => v.full_number) }));
  T('…trimisă o singură dată (doar prima apăsare trimite; celelalte primesc factura făcută de ea)',
    facute[0] && facute[0].j.trimisa && deja.every((r) => !r.j.trimisa && r.j.invoice && r.j.invoice.id === facute[0].j.invoice.id), J(deja.map((r) => r.j)));
  const l1 = await lucr(L1.id);
  T('montajul de pe proformă trece pe „facturat clientului", pe factura fiscală', facute[0] && facute[0].j.montajeFacturate === 1 && l1.status === 'facturat_clientului' &&
    l1.factura_client === facute[0].j.invoice.id && l1.factura_client_nr === facute[0].j.invoice.full_number, J({ st: l1.status, f: l1.factura_client_nr }));
  T('…și nu mai e propus nicăieri', J(await propuse()) === J([L2.id]) && J(await deFacturat()) === J([L2.id]));

  // 19b: „partenerul ne-a facturat" nu mai redeschide o lucrare facturată clientului.
  const redeschide = await R('POST', '/api/companies/' + co.id + '/montaje', { id: L1.id, status: 'facturat_de_partener', factura_partener: 'X-2026-118', items: l1.items });
  T('„partenerul ne-a facturat" pe o lucrare facturată clientului → refuz, cu factura noastră pe nume și unde se scrie a lui',
    redeschide.s === 409 && new RegExp(facute[0].j.invoice.full_number).test(redeschide.j.error || '') && /Nr\. facturii de la partener/.test(redeschide.j.error || ''), J(redeschide));
  const cuFacturaLui = await R('POST', '/api/companies/' + co.id + '/montaje', { id: L1.id, status: 'facturat_clientului', factura_partener: 'X-2026-118', items: l1.items });
  T('factura partenerului se scrie alături, iar starea rămâne „facturat clientului"', cuFacturaLui.s === 200 && cuFacturaLui.j.status === 'facturat_clientului' && cuFacturaLui.j.factura_partener === 'X-2026-118', J(cuFacturaLui.j));
  const faraStare = await R('POST', '/api/companies/' + co.id + '/montaje', { id: L1.id, items: l1.items, notes: 'fără stare trimisă' });
  T('o salvare fără stare (telefon vechi) nu o mai coboară la „de programat"', faraStare.s === 200 && faraStare.j.status === 'facturat_clientului', faraStare.j && faraStare.j.status);
  T('o lucrare facturată nu se șterge', (await R('DELETE', '/api/montaje/' + L1.id)).s === 409);
  T('tot nu e propusă', J(await propuse()) === J([L2.id]) && J(await deFacturat()) === J([L2.id]));
  T('a altei firme: 404, nu salvare', (await R('POST', '/api/companies/' + (co.id + 999) + '/montaje', { id: L1.id, status: 'executat', items: l1.items })).s === 404);

  // Proforma anulată eliberează; factura anulată eliberează, întorcând starea de dinainte.
  const pf2 = await R('POST', '/api/invoices', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: liniiDe(L2), montaje: [L2.id] });
  T('a doua lucrare, pe o proformă: nu mai e propusă', pf2.s === 200 && (await propuse()).length === 0);
  await R('PUT', '/api/invoices/' + pf2.j.invoice.id + '/status', { status: 'canceled' });
  T('proforma anulată o eliberează: e propusă din nou', J(await propuse()) === J([L2.id]) && J(await deFacturat()) === J([L2.id]));
  const f3 = await R('POST', '/api/invoices', { companyId: co.id, tip: 'invoice', fel: 'unica', lines: liniiDe(L2), montaje: [L2.id] });
  T('pe o factură fiscală: trece pe „facturat clientului"', f3.s === 200 && f3.j.montajeFacturate === 1 && (await lucr(L2.id)).status === 'facturat_clientului');
  const an3 = await R('PUT', '/api/invoices/' + f3.j.invoice.id + '/status', { status: 'canceled' });
  const l2 = await lucr(L2.id);
  T('factura anulată o eliberează: înapoi la „executat", propusă din nou', an3.s === 200 && an3.j.montajeEliberate === 1 && l2.status === 'executat' && l2.factura_client == null &&
    J(await propuse()) === J([L2.id]), J({ an: an3.j, st: l2.status }));
  await R('POST', '/api/companies/' + co.id + '/montaje', { id: L2.id, status: 'facturat_de_partener', factura_partener: 'P-7', items: l2.items });
  const f4 = await R('POST', '/api/invoices', { companyId: co.id, tip: 'invoice', fel: 'unica', lines: liniiDe(L2), montaje: [L2.id] });
  await R('PUT', '/api/invoices/' + f4.j.invoice.id + '/status', { status: 'canceled' });
  T('…iar una pe care partenerul ne-o facturase se întoarce la „partenerul ne-a facturat"', (await lucr(L2.id)).status === 'facturat_de_partener');
  const pf5 = await R('POST', '/api/invoices', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: liniiDe(L2), montaje: [L2.id] });
  const inc5 = await R('PUT', '/api/invoices/' + pf5.j.invoice.id + '/status', { status: 'paid' });
  const din5 = ((((await R('GET', '/api/invoices?company_id=' + co.id)).j || {}).invoices) || []).filter((v) => v.din_proforma === pf5.j.invoice.id);
  T('o singură apăsare, ca de obicei: factura fiscală, plătită, cu lucrarea pe ea', inc5.s === 200 && !inc5.j.already && inc5.j.invoice.status === 'paid' && din5.length === 1 &&
    (await lucr(L2.id)).factura_client === inc5.j.invoice.id, J(inc5.j && inc5.j.invoice));
  T('a doua apăsare, mai târziu: „era deja încasată", aceeași factură', (await R('PUT', '/api/invoices/' + pf5.j.invoice.id + '/status', { status: 'paid' })).j.already === true);
  gata();
})().catch((e) => { console.log('EROARE: ' + e.stack); rele++; gata(); });
