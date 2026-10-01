// verify_reparatii_lista.js — lista de reparații pe care Alin ne-a dat-o pe 01.10 („Reparații pentru Robert — din
// verificările tale": 26 de puncte, în 4 loturi). Fiecare punct închis își pune aici verificările, pe numărul lui.
//
//   node verify_reparatii_lista.js
//
// Lotul 1 — siguranță (ating toate firmele deodată sau datele lor):
//   1. un .xlsx mic care se umflă la citire e refuzat ÎNAINTE de ExcelJS, pe toate ușile: șablonul mașinilor (web,
//      crud; telefon, base64) și listele Teltonika — altfel un singur fișier oprea serverul tuturor firmelor;
//   2. harta live a unei firme suspendate se închide și când era DEJA deschisă: pe loc la suspendarea de mână, la
//      trecerea de un minut în rest (neplata); pagina web nu mai bate la ușă la fiecare 3 secunde;
//   3. motivul scris de noi la o suspendare de mână nu mai pleacă la oamenii firmei (/api/me, „Facturile mele").
//
// Proba citește codul (fără server) și apoi pornește un server adevărat, cu legături live adevărate.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const WebSocket = require('ws');

// ── Faza „seed" (lotul 2, pct. 7) ────────────────────────────────────────────────────────────────────────────────────
// Facturi VECHI, de dinainte de 28.09 (fără `fel` și fără `luna`), puse direct în baza probei ÎNAINTE de pornirea
// serverului: pe ușa de azi nu se mai poate face una (felul se deduce mereu), iar serverul nu are — și nu trebuie să
// aibă — o ușă pentru asta. Rulată de proba însăși, ca proces separat, pe același dosar de bază.
if (process.argv.indexOf('--faza=seed') >= 0) {
  // Capetele lunilor, socotite ca pe server: server.js își pune singur fusul pe UTC (primul rând). Fără asta, pe un
  // laptop în ora României, factura lui august ar fi început „pe 31 iulie, ora 21" și ar fi acoperit și iulie.
  process.env.TZ = 'UTC';
  (async () => {
    const db = require('./db'), abonament = require('./abonament');
    await db.initDb();
    const co = (await db.pool.query("INSERT INTO companies (name, slug) VALUES ('Firma Veche SRL', 'firma-veche') RETURNING id")).rows[0].id;
    const acum = new Date();
    const luna = (k) => { const d = new Date(acum.getFullYear(), acum.getMonth() - k, 1); return { an: d.getFullYear(), luna: d.getMonth() + 1 }; };
    const iv = (L) => abonament.intervalLuna(L.an, L.luna);
    const L2 = luna(2), L3 = luna(3), L4 = luna(4);
    const veche = (L, nr, linii, stare) => db.createInvoice({ companyId: co, series: 'RAT', number: nr, year: L.an,
      fullNumber: 'RAT-' + L.an + '-' + String(nr).padStart(5, '0'), type: 'invoice', status: stare || 'paid',
      issueDate: iv(L).de + 86400000, dueDate: iv(L).de + 16 * 86400000, periodStart: iv(L).de, periodEnd: iv(L).pana,
      subtotal: 58, vatAmount: 11.02, total: 69.02, lines: linii });
    await veche(L2, 901, [{ desc: 'Abonament monitorizare GPS (fără CAN)', qty: 2, unitPrice: 29, net: 58 }]);   // abonamentul lui L2
    await veche(L3, 902, [{ desc: 'Echipament — Teltonika FMC130', qty: 1, unitPrice: 58, net: 58 }]);           // un aparat, nu abonament
    await veche(L4, 903, [{ desc: 'Abonament monitorizare GPS (fără CAN)', qty: 2, unitPrice: 29, net: 58 }], 'canceled');
    const r = { co, luni: { L2: abonament.cheieLuna(L2.an, L2.luna), L3: abonament.cheieLuna(L3.an, L3.luna), L4: abonament.cheieLuna(L4.an, L4.luna) },
      v2: await db.abonamentVechiLuna(co, iv(L2).de, iv(L2).pana), v3: await db.abonamentVechiLuna(co, iv(L3).de, iv(L3).pana),
      v4: await db.abonamentVechiLuna(co, iv(L4).de, iv(L4).pana), vAlta: await db.abonamentVechiLuna(co + 999, iv(L2).de, iv(L2).pana) };
    console.log('SEED ' + JSON.stringify(r));
    await db.closeDb();
    process.exit(0);
  })().catch((e) => { console.log('SEED-EROARE ' + ((e && e.stack) || e)); process.exit(1); });
  return;
}

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (t) => console.log('\n' + t);
const J = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Sfârșiturile de rând LF, ca pe GitHub: pe Windows depozitul se scoate cu CRLF.
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
function taie(sursa, start, capat) {
  const a = sursa.indexOf(start); if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 70));
  const b = sursa.indexOf(capat, a + start.length); if (b < 0) throw new Error('nu găsesc capătul: ' + capat.slice(0, 70));
  return sursa.slice(a, b + capat.length);
}
const server = citeste('server.js');
const html = citeste('public/index.html');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
sect('1. Excel-ul care se umflă la citire (codul)');
const rutaListe = taie(server, "app.post('/api/admin/masini/liste',", '\n});');
const rutaSablon = taie(server, "app.post('/api/admin/masini/sablon',", '\n});');
T('lista Teltonika: octeții dezarhivați se numără înainte de citire',
  rutaListe.indexOf('_sablonNuSeUmfla(buf, LISTA_MAX_DEZARHIVAT)') > 0 && rutaListe.indexOf('_sablonNuSeUmfla(buf, LISTA_MAX_DEZARHIVAT)') < rutaListe.indexOf('compat.citesteExcel('));
// Numărătoarea stătea DOAR în ramura telefonului (base64); calea web, crudă, mergea drept la ExcelJS.
const ramuraB64 = taie(rutaSablon, "typeof buf.b64 === 'string') {", '\n    }');
T('șablonul: numărătoarea e pe AMBELE căi (nu doar în ramura telefonului)',
  ramuraB64.indexOf('_sablonNuSeUmfla') < 0 && rutaSablon.indexOf('_sablonNuSeUmfla(buf, SABLON_MAX_DEZARHIVAT)') > rutaSablon.indexOf(ramuraB64) + ramuraB64.length
  && rutaSablon.indexOf('_sablonNuSeUmfla(buf, SABLON_MAX_DEZARHIVAT)') < rutaSablon.indexOf('compat.citesteSablonExcel('));
T('plafoanele: 50 MB la șablon, 120 MB la liste',
  /const SABLON_MAX_DEZARHIVAT = 50 \* 1024 \* 1024;/.test(server) && /const LISTA_MAX_DEZARHIVAT = 120 \* 1024 \* 1024;/.test(server));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
sect('2. Harta live după suspendare (codul paginii web, rulat)');
{
  const REVENIT = '    function _wsAccesRevenit() {';
  const buc = taie(html, '    var _wsAccesOprit = false, _wsReia = null;', REVENIT).slice(0, -REVENIT.length);
  const revenit = taie(html, REVENIT, '\n    }');
  const socluri = [], timere = [], oprite = [];
  const el = { innerHTML: '', className: '' };
  class WSFals { constructor(u) { this.url = u; socluri.push(this); } close() { this.inchis = true; } }
  const ctx = vm.createContext({
    location: { protocol: 'http:', host: 'proba' }, WebSocket: WSFals, document: { getElementById: () => el },
    setTimeout: (f, ms) => { timere.push(ms); return 'timer' + timere.length; }, clearTimeout: (id) => { oprite.push(id); },
    updateMarker: () => {}, map: { fitBounds: () => {} },
    fetch: () => Promise.resolve({ status: 200 }), appendDebugEntry: () => {}, devices: new Map(), console,
  });
  vm.runInContext(buc + revenit + '\nthis.connectWs = connectWs; this.revenit = _wsAccesRevenit;', ctx);
  ctx.connectWs();
  socluri[0].onmessage({ data: JSON.stringify({ type: 'error', data: { error: 'access_expired' } }) });
  socluri[0].onclose();
  T('după „access_expired", pagina reîncearcă o dată pe minut, nu la fiecare 3 secunde', timere[0] === 60000, timere[0]);
  T('…și scrie de ce harta e oprită', /accesul firmei e suspendat/.test(el.innerHTML), el.innerHTML);
  ctx.revenit();
  T('când profilul spune că accesul a revenit, harta se reconectează PE LOC (nu peste un minut)', socluri.length === 2 && oprite[0] === 'timer1', socluri.length + ' · ' + JSON.stringify(oprite));
  ctx.revenit();
  T('…o singură dată (a doua verificare a profilului nu mai deschide nimic)', socluri.length === 2);
  socluri[1].onmessage({ data: JSON.stringify({ type: 'init', data: [] }) });
  socluri[1].onclose();
  T('după reactivare, o întrerupere obișnuită se reia la 3 secunde', timere[1] === 3000 && /reconectare/.test(el.innerHTML), timere[1] + ' · ' + el.innerHTML);
  ctx.revenit();
  T('…iar verificarea profilului nu grăbește o reconectare obișnuită', socluri.length === 2 && oprite.length === 1);
}
T('banda de acces cheamă reconectarea când accesul nu mai e oprit',
  /if \(\(!a \|\| a\.status !== 'expired'\) && typeof _wsAccesRevenit === 'function'\) _wsAccesRevenit\(\);/.test(taie(html, '    function applyAccessBanner() {', '\n    }')));
T('serverul: trecerea de la un minut închide și firmele cu accesul oprit, cu același cuvânt ca la deschidere',
  /else if \(!isSuper\(u\.role\) && \(await firmaOprita\(c\._companyId\)\)\) motiv = 'access_expired';/.test(taie(server, 'async function _verificaLegaturileLive() {', '\n}')));
T('…iar suspendarea de mână nu așteaptă trecerea', /if \(pornit\) _verificaLegaturileLive\(\)\.catch/.test(taie(server, "app.put('/api/companies/:id/suspend',", '\n});')));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Motivul intern al unei suspendări (regula, rulată)');
{
  const ctx = vm.createContext({ neplata: require('./neplata') });
  vm.runInContext(taie(server, 'function stareAcces(co, facturi, acum) {', '\n}') + '\nthis.stareAcces = stareAcces;', ctx);
  const st = ctx.stareAcces({ suspended_at: Date.now() - 1000, suspend_reason: 'NOTA-INTERNA-CODUL' }, [], Date.now());
  T('o oprire de mână rămâne „expired · manual"', st.status === 'expired' && st.motiv === 'manual', JSON.stringify(st));
  T('…dar starea (care pleacă și la client) nu mai poartă motivul scris de noi', JSON.stringify(st).indexOf('NOTA-INTERNA') < 0 && !('nota' in st), JSON.stringify(st));
  T('nici memoria stării nu-l mai ține', taie(server, 'async function _accessStatusCached(companyId) {', '\n}').indexOf('suspend_reason') < 0);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Lotul 2 — bani (codul, rulat). Pe server pornit, mai jos.
const web = {
  esc: taie(html, '    function esc(s) {', '\n'), luni: (/var _GI_LUNI = \[[^\]]*\];/.exec(html) || [''])[0],
  luna: taie(html, '    function _giLunaText(cheie) {', '\n'), invFmtD: taie(html, '    function _invFmtD(ts) {', '\n'),
  invMoney: taie(html, '    function _invMoney(n) {', '\n'), raxDe: taie(html, '    function _rDe(n) {', '\n    }') + '\n' + taie(html, '    function _raxDe(n) {', '\n'),
  recalc: taie(html, '    function _giRecalcLine(l) {', '\n'), bloc: taie(html, '    // ── începe „factura montajului, strânsă" ──', '    // ── sfârșit „factura montajului, strânsă" ──'),
  surse: taie(html, '    function _giSurseHtml() {', '\n    }'), render: taie(html, '    function _giRenderLines() {', '\n    }'),
};
const libFacturaTel = citeste('mobile/src/lib/factura.ts'), billingTel = citeste('mobile/src/screens/Billing.tsx');

sect('4. TVA: cota doar din „Date emitent", implicit cea legală de azi (21%)');
{
  const ctx = vm.createContext({});
  vm.runInContext(taie(server, 'const COTA_TVA_IMPLICITA = 21;', '\n') + taie(server, 'function _issuerVatRate(iss) {', '\n') +
    taie(server, 'function _liniiNormalizate(brute, vr) {', '\n}') + '\nthis.cota = _issuerVatRate; this.linii = _liniiNormalizate;', ctx);
  T('fără cotă în „Date emitent" → 21%, nu 19%', ctx.cota({}) === 21 && ctx.cota(null) === 21 && ctx.cota({ vat_rate: '' }) === 21, ctx.cota({}));
  T('o cotă scrisă de noi rămâne (și 0, la neplătitor); una stricată → 21%', ctx.cota({ vat_rate: 0 }) === 0 && ctx.cota({ vat_rate: '9' }) === 9 && ctx.cota({ vat_rate: 120 }) === 21);
  const L = ctx.linii([{ desc: 'Montaj GPS', qty: 2, unitPrice: 100, vatRate: 19 }, { desc: 'Aparat', qty: 1, unitPrice: 50, vatRate: 5 }], 21);
  T('cota trimisă de ecran pe rând NU mai contează: toate rândurile iau cota emitentului', L.every((l) => l.vatRate === 21) && L[0].vat === 42 && L[1].vat === 10.5, JSON.stringify(L));
  T('…și la salvarea „Date emitent" fără cotă se scrie 21', /: COTA_TVA_IMPLICITA;\s*\n\s*const clean = \{ name: S\(i\.name, 160\)/.test(server));
  const pdf = citeste('factura_pdf.js');
  T('hârtia scrie cota APLICATĂ pe rânduri, apoi a emitentului, apoi 21 — nu 19', /const tva = \(linii\[0\] && linii\[0\]\.vatRate != null\) \? linii\[0\]\.vatRate : \(iss\.vat_rate != null \? iss\.vat_rate : 21\);/.test(pdf) && !/: 19\)/.test(pdf));
  T('pagina web: „Date emitent" propune 21 (și scrie 21 când caseta e goală), ciorna fără cotă ia 21',
    /'rax-iss-vat', \(iss\.vat_rate != null \? iss\.vat_rate : 21\), 'ex\. 21'\)/.test(html) && /\.value \|\| '21'\)\) \|\| 0,/.test(html) && /vatRate: d\.vatRate != null \? d\.vatRate : 21,/.test(html));
  T('telefonul la fel: ciorna fără cotă ia 21, „Date emitent" pornește de la 21',
    /const rata = d\.vatRate != null \? Number\(d\.vatRate\) : 21;/.test(libFacturaTel) && /vat_rate: 21, vat_payer: true/.test(billingTel));
}

sect('9. Abonamentul unei luni se emite de pe 1 ale ei (codul, rulat)');
{
  const abonament = require('./abonament');
  const ctx = vm.createContext({ abonament });
  vm.runInContext(taie(server, 'function _abonamentPreaDevreme(L, acum) {', '\n}') + '\nthis.f = _abonamentPreaDevreme;', ctx);
  const acum = new Date(2026, 9, 28, 12, 0).getTime();   // 28.10.2026
  const msg = ctx.f({ an: 2026, luna: 11 }, acum);
  T('pe 28.10, abonamentul pe noiembrie e refuzat, cu motivul spus', typeof msg === 'string' && /se emite de pe 1 noiembrie/.test(msg) && /n-ar mai ajunge pe nicio factură/.test(msg), msg);
  T('…dar octombrie (luna în curs) și lunile trecute se emit', ctx.f({ an: 2026, luna: 10 }, acum) === null && ctx.f({ an: 2026, luna: 8 }, acum) === null);
  T('…iar pe 1 noiembrie, la miezul nopții, noiembrie se emite', ctx.f({ an: 2026, luna: 11 }, new Date(2026, 10, 1, 0, 0).getTime()) === null);
  // Fereastra web cu o lună neîncepută: refuzul sus, butoanele stinse (serverul refuză oricum).
  const res = { innerHTML: '' };
  const c2 = vm.createContext({ console, JSON, Math, Number, String, Date, _S: { companyId: 7, fel: 'abonament', luna: '2026-11', lines: [{ desc: 'Abonament', qty: 1, unitPrice: 29, net: 29, vat: 6.09 }],
    issuer: {}, vatRate: 21, client: { name: 'T' }, deja: null, preaDevreme: msg, aparateIntregi: 1, aparatePeZile: 0, aparateNepornite: 0, dinContract: null, adaugate: [], nota: '' } });
  c2.document = { getElementById: (id) => (id === 'rax-gi-result' ? res : null) };
  vm.runInContext([web.esc, web.luni, web.luna, web.invFmtD, web.invMoney, web.raxDe, web.recalc, web.bloc, web.surse, web.render,
    'var _giState = _S, _giTip = "invoice";', '_giRenderLines();'].join('\n'), c2);
  T('pagina: refuzul serverului sus, iar „Previzualizează" și „Emite" sunt stinse',
    res.innerHTML.indexOf('se emite de pe 1 noiembrie') >= 0 && /onclick="raxGenPrevizualizare\(this\)" disabled>/.test(res.innerHTML) && /onclick="raxGenIssue\(this\)" disabled>/.test(res.innerHTML));
  T('telefonul: același refuz, din ciornă (nu socotit pe telefon), iar butoanele se sting',
    /preaDevreme: d\.preaDevreme \|\| null,/.test(libFacturaTel) && /\{S\.preaDevreme \? <div class="bill-avert rau">⚠ \{S\.preaDevreme\}<\/div> : null\}/.test(billingTel) &&
    /disabled=\{saving \|\| !S\.lines\.length \|\| \(!unica && \(!!S\.deja \|\| !!S\.preaDevreme\)\)\}/.test(billingTel));
}

sect('5–6. Aparatele și lucrările deja facturate (codul)');
T('5: ciorna facturii unice scade aparatele aflate deja pe un document al contractului (și spune unde sunt)',
  /const dejaPe = await _aparateDejaFacturate\(companyId, c, out\.aparate\);/.test(server) && /out\.aparateDejaPe = dejaPe\.documente;/.test(server));
T('5: pagina și telefonul spun unde sunt aparatele, în locul butonului',
  /sunt deja pe ' \+ dc\.aparateDejaPe\.map\(esc\)\.join\(', '\)/.test(html) && /sunt deja pe \{dc\.aparateDejaPe\.join\(', '\)\}/.test(billingTel));
T('6: pagina trimite în `montaje` doar lucrările întregi pe factură (legat de telefon în verify_facturare_telefon.js)',
  /montaje: _giState\.fel === 'unica' \? _giMontajeDeTrimis\(_giState\) : \[\],/.test(html));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pe server pornit.
const PORT = 3271, TCP = 5271;
const DIR = path.join(os.tmpdir(), 'rax_reparatii_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const { puneParola } = require('./test_parola');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_reparatii', DEMO_DISABLED: 'true', SEED_TEST: '1',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
});
delete env.DATABASE_URL;
// Întâi facturile vechi (lotul 2, pct. 7), în aceeași bază, de un proces separat; abia apoi serverul.
const seed = require('child_process').spawnSync(process.execPath, [__filename, '--faza=seed'], { cwd: __dirname, env, encoding: 'utf8', timeout: 240000 });
const SEED = (function () {
  const l = String(seed.stdout || '').split('\n').filter((x) => x.indexOf('SEED ') === 0)[0];
  try { return l ? JSON.parse(l.slice(5)) : null; } catch (e) { return null; }
})();
T('pregătirea bazei probei: trei facturi vechi (fără `fel`), puse înainte de pornirea serverului', !!SEED, String(seed.stdout || '').slice(-400) + String(seed.stderr || '').slice(-400));
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); process.exit(1); } });
function gata(code) {
  terminat = true;
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800);
}
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function cerere(m, u, ck, body, antete) {
  const brut = Buffer.isBuffer(body);
  const r = await fetch(B + u, {
    method: m, headers: Object.assign({ 'Content-Type': brut ? 'application/octet-stream' : 'application/json' }, ck ? { Cookie: ck } : {}, antete || {}),
    body: body == null ? undefined : (brut ? body : JSON.stringify(body)),
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { j = null; }
  return { s: r.status, j: j || {}, text };
}
async function asteapta(cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(100); }
  return cond();
}
// O legătură live adevărată (cookie, ca pagina web — sau cheie, ca telefonul). Ține minte ce a primit.
function legatura(ck, cheie) {
  const st = { init: false, inchisa: false, eroare: null };
  const s = cheie ? new WebSocket('ws://127.0.0.1:' + PORT + '/?token=' + encodeURIComponent(cheie))
    : new WebSocket('ws://127.0.0.1:' + PORT + '/', { headers: { Cookie: ck } });
  s.on('message', (d) => { try { const m = JSON.parse(d.toString()); if (m.type === 'init') st.init = true; if (m.type === 'error') st.eroare = m.data && m.data.error; } catch (e) {} });
  s.on('close', () => { st.inchisa = true; });
  s.on('error', () => {});
  st.sock = s;
  return st;
}
const viu = async () => { try { return (await fetch(B + '/api')).ok; } catch (e) { return false; } };

// Un .xlsx adevărat (făcut cu ExcelJS), plus o intrare care se umflă la dezarhivare la `mb` MB. Arhivat are câteva sute
// de KB. Fără numărătoare, ExcelJS ar dezarhiva tot în memorie, în procesul care primește pozițiile GPS.
async function excelUmflat(mb) {
  const ExcelJS = require('exceljs');
  const JSZip = require('jszip');
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Foaie').addRow(['Nimic de citit aici']);
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
  zip.file('xl/umflat.xml', Buffer.alloc(mb * 1024 * 1024, 0x20));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

(async () => {
  let pornit = false;
  for (let i = 0; i < 240 && !pornit; i++) { if (await viu()) pornit = true; else await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }

  sect('1. Excel-ul care se umflă la citire (pe server pornit)');
  const MSG_LISTA = 'Nu pot deschide fișierul: trebuie să fie lista Excel (.xlsx) de la Teltonika.';
  const MSG_SABLON = 'Nu pot deschide fișierul: trebuie să fie șablonul Excel (.xlsx) descărcat din calculator.';
  const bomba130 = await excelUmflat(130);
  T('fișierul de probă e mic arhivat (sub 1 MB) — trece de limita de 15 MB a încărcării', bomba130.length < 1024 * 1024, bomba130.length);
  let t0 = Date.now();
  const rL = await cerere('POST', '/api/admin/masini/liste', S, bomba130, { 'X-Fisier': 'LV-CAN200_list_2026_09_01_en.xlsx' });
  T('lista Teltonika care se umflă peste 120 MB: refuzată de numărătoare, nu de ExcelJS', rL.s === 400 && rL.j.error === MSG_LISTA, rL.s + ' ' + rL.text.slice(0, 160));
  T('…repede, iar serverul răspunde mai departe', Date.now() - t0 < 15000 && (await viu()), (Date.now() - t0) + ' ms');
  const rL2 = await cerere('POST', '/api/admin/masini/liste', S, await excelUmflat(20), { 'X-Fisier': 'lista.xlsx' });
  T('…o listă care crește doar la 20 MB trece de numărătoare (o refuză abia citirea, că nu e listă)', rL2.s === 400 && rL2.j.error && rL2.j.error !== MSG_LISTA, rL2.s + ' ' + rL2.text.slice(0, 160));

  const bomba60 = await excelUmflat(60);
  t0 = Date.now();
  const rS = await cerere('POST', '/api/admin/masini/sablon', S, bomba60);
  T('șablonul încărcat din pagina web (crud), umflat peste 50 MB: refuzat de numărătoare', rS.s === 400 && rS.j.error === MSG_SABLON, rS.s + ' ' + rS.text.slice(0, 160));
  T('…repede, iar serverul răspunde mai departe', Date.now() - t0 < 15000 && (await viu()), (Date.now() - t0) + ' ms');
  const rS2 = await cerere('POST', '/api/admin/masini/sablon', S, await excelUmflat(40));
  T('…un fișier care crește doar la 40 MB trece de numărătoare (îl refuză citirea: n-are capul de tabel)', rS2.s === 400 && /capul de tabel/.test(rS2.j.error || ''), rS2.s + ' ' + rS2.text.slice(0, 160));
  const rS3 = await cerere('POST', '/api/admin/masini/sablon', S, { fisier: 'flota.xlsx', b64: bomba60.toString('base64') });
  T('calea telefonului (base64) rămâne păzită la fel', rS3.s === 400 && rS3.j.error === MSG_SABLON, rS3.s + ' ' + rS3.text.slice(0, 160));

  // Firmele, oamenii și legăturile lor live.
  const PAROLA = 'Str4da-Verde-2026';
  const firma = async (nume) => (await cerere('POST', '/api/companies', S, { name: nume })).j;
  async function om(nume, co, rol) {
    const b = (await cerere('POST', '/api/users', S, { username: nume + '@reparatii.ro', full_name: nume, role: rol, company_id: co.id })).j;
    await puneParola(b, PAROLA, B);
    return { id: b.id, ck: await login(nume + '@reparatii.ro', PAROLA) };
  }
  const coX = await firma('Firma Oprită SRL'), coY = await firma('Firma Martor SRL');
  const sef = await om('sef', coX, 'company_admin');
  const disp = await om('dispecer', coX, 'dispatcher');
  const martor = await om('martor', coY, 'viewer');
  const cheie = (await cerere('POST', '/api/apikeys', S, { userId: disp.id, name: 'telefon probă' })).j.key;
  T('pregătirea: două firme, oameni autentificați, o cheie de telefon', !!(coX.id && coY.id && sef.ck && disp.ck && martor.ck && cheie));

  sect('2. Harta live a unei firme suspendate (pe server pornit)');
  const LA = legatura(sef.ck), LT = legatura(null, cheie), LM = legatura(martor.ck), LS = legatura(S);
  T('toate patru legăturile primesc harta', await asteapta(() => LA.init && LT.init && LM.init && LS.init, 10000), JSON.stringify([LA.init, LT.init, LM.init, LS.init]));
  // Firma se oprește FĂRĂ închiderea pe loc (ca o neplată care trece de a 15-a zi): trebuie s-o prindă trecerea.
  const sfl = await cerere('POST', '/api/debug/suspenda-fara-legaturi', S, { id: coX.id });
  T('firma e oprită direct în bază (ca la neplată), fără să se închidă nimic pe loc', sfl.s === 200, sfl.s);
  await cerere('POST', '/api/debug/ws-sweep', S);
  T('trecerea de la un minut închide harta deschisă înainte (web)', await asteapta(() => LA.inchisa, 3000));
  T('…cu „access_expired" (telefonul aprinde banda roșie, pagina nu mai bate la ușă)', LA.eroare === 'access_expired', LA.eroare);
  T('…și legătura telefonului (deschisă cu cheia), cu același cuvânt', await asteapta(() => LT.inchisa, 3000) && LT.eroare === 'access_expired', LT.eroare);
  await sleep(300);
  T('martorul din altă firmă NU e deranjat', !LM.inchisa);
  T('super-adminul NU e deranjat', !LS.inchisa);
  const LA2 = legatura(sef.ck);
  T('o legătură nouă e refuzată la deschidere, cu același cuvânt', (await asteapta(() => LA2.inchisa, 6000)) && !LA2.init && LA2.eroare === 'access_expired', LA2.eroare);

  await cerere('PUT', '/api/companies/' + coX.id + '/suspend', S, { suspend: false });
  const LA3 = legatura(sef.ck), LT3 = legatura(null, cheie);
  T('după reactivare, harta pornește din nou (web și telefon)', await asteapta(() => LA3.init && LT3.init, 10000));
  const NOTA = 'NOTA-INTERNA-PROBA restanță veche, discutat la telefon';
  const sus = await cerere('PUT', '/api/companies/' + coX.id + '/suspend', S, { suspend: true, reason: NOTA });
  T('suspendarea de mână reușește', sus.s === 200 && sus.j.access && sus.j.access.status === 'expired', sus.s + ' ' + sus.text.slice(0, 120));
  T('harta deschisă se închide PE LOC, fără să aștepte trecerea de la un minut', await asteapta(() => LA3.inchisa, 3000) && LA3.eroare === 'access_expired', LA3.eroare);
  T('…și cea a telefonului', await asteapta(() => LT3.inchisa, 3000) && LT3.eroare === 'access_expired', LT3.eroare);
  await sleep(300);
  T('martorul și super-adminul rămân conectați', !LM.inchisa && !LS.inchisa);

  sect('3. Motivul intern al suspendării nu pleacă la client (pe server pornit)');
  const me = await cerere('GET', '/api/me', sef.ck);
  T('adminul firmei își vede starea („expired · manual") în /api/me', me.s === 200 && me.j.access && me.j.access.status === 'expired' && me.j.access.motiv === 'manual', me.s + ' ' + me.text.slice(0, 160));
  T('…dar fără motivul scris de noi', me.text.indexOf('NOTA-INTERNA') < 0 && !('nota' in (me.j.access || {})), JSON.stringify(me.j.access));
  const fm = await cerere('GET', '/api/billing/my-invoices', sef.ck);
  T('„Facturile mele": starea da, motivul nu', fm.s === 200 && fm.j.access && fm.j.access.status === 'expired' && fm.text.indexOf('NOTA-INTERNA') < 0, fm.s + ' ' + fm.text.slice(0, 160));
  const ov = await cerere('GET', '/api/companies/' + coX.id + '/overview', S);
  T('noi îl vedem mai departe, în fișa firmei', ov.s === 200 && ov.j.company && ov.j.company.suspend_reason === NOTA, ov.s + ' ' + JSON.stringify(ov.j.company && ov.j.company.suspend_reason));
  const lst = await cerere('GET', '/api/companies', S);
  T('…și în lista de firme', Array.isArray(lst.j) && lst.j.some((c) => c.id === coX.id && c.suspend_reason === NOTA));

  for (const L of [LM, LS]) { try { L.sock.close(); } catch (e) {} }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Lotul 2 — bani, pe server pornit.
  const R = (m, u, b) => cerere(m, u, S, b);
  const SIM = (imei) => R('POST', '/api/test/simulate', { imei, io: {} });
  const aparat = async (imei) => (((await R('GET', '/api/admin/devices')).j) || []).filter((d) => d.imei === imei)[0] || null;

  sect('4. TVA (pe server pornit)');
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro' } });
  const setari = (await R('GET', '/api/admin/system-settings')).j || {};
  T('„Date emitent" salvat fără cotă → cota 21', setari.invoice_issuer && Number(setari.invoice_issuer.vat_rate) === 21, JSON.stringify(setari.invoice_issuer));
  const coTva = await firma('Firma TVA SRL');
  const fTva = await R('POST', '/api/invoices', { companyId: coTva.id, fel: 'unica', lines: [{ desc: 'Montaj GPS', qty: 2, unitPrice: 100, vatRate: 5 }, { desc: 'Aparat', qty: 1, unitPrice: 50, vatRate: 19 }] });
  const lt = (fTva.j.invoice && fTva.j.invoice.lines) || [];
  T('factura ia cota emitentului (21%) pe toate rândurile, oricare ar fi cea trimisă de ecran',
    fTva.s === 200 && lt.length === 2 && lt.every((l) => Number(l.vatRate) === 21) && Number(fTva.j.invoice.vat_amount) === 52.5, fTva.s + ' ' + JSON.stringify(lt.map((l) => l.vatRate)) + ' ' + (fTva.j.invoice && fTva.j.invoice.vat_amount));

  sect('5. Aparatele din contract, deja pe un document, nu se mai propun (pe server pornit)');
  const cfg = { nVeh: 3, nCan: 3, nFms: 0, contractMonths: 24, fxRate: 5.0785, devices: { d130: 3, lvcan: 3 }, montaj: { qGps: 3, qLvCan: 3 } };
  const of5 = (await R('POST', '/api/admin/offers', { name: 'Ofertă Aparate', client_name: 'Aparate SRL', monthly_total: 135, currency: 'RON',
    config: { cfg: cfg, prices: { pPlain: 29, pCan: 45, dFmc130: 55, dLvCan: 60, mGps: 100, mLvCan: 60 } } })).j;
  const co5 = await firma('Aparate SRL');
  const ct5 = await R('POST', '/api/companies/' + co5.id + '/contract', { offer_id: of5.id, months: 24,
    din_oferta: { unitati: { plain: 29, can: 45, fms: 65 }, vehicule: [{ fel: 'can', nume: 'Vehicule GPS cu CAN', cant: 3, pret: 45, total: 135 }], servicii: [] } });
  T('pregătirea: contract cu 3 FMC130 + 3 LV-CAN în Anexa nr. 2', ct5.s === 200 && ct5.j.montaj && (ct5.j.montaj.echipamente.items || []).length === 2, ct5.s + ' ' + ct5.text.slice(0, 160));
  const ciorna = async () => ((await R('POST', '/api/invoices/draft', { companyId: co5.id, fel: 'unica' })).j.dinContract) || {};
  const nr = (dc, re) => ((dc.aparate || []).filter((a) => re.test(a.desc))[0] || {}).qty || 0;
  let dc5 = await ciorna();
  T('înainte de orice document: se propun toate (3 + 3)', nr(dc5, /FMC130/) === 3 && nr(dc5, /LV-CAN/) === 3 && !(dc5.aparateDejaPe || []).length, JSON.stringify(dc5.aparate));
  // Un singur FMC130 pe o factură (neplătită, deci se poate anula): restul de 2 se propune mai departe.
  const una = await R('POST', '/api/invoices', { companyId: co5.id, fel: 'unica', lines: [Object.assign({}, dc5.aparate.filter((a) => /FMC130/.test(a.desc))[0], { qty: 1 })] });
  dc5 = await ciorna();
  T('un singur FMC130 facturat → se propun restul de 2 (și toate cele 3 LV-CAN), cu documentul spus pe nume',
    una.s === 200 && nr(dc5, /FMC130/) === 2 && nr(dc5, /LV-CAN/) === 3 && J(dc5.aparateDejaPe) === J([una.j.invoice.full_number]), JSON.stringify(dc5));
  const anul = await R('PUT', '/api/invoices/' + una.j.invoice.id + '/status', { status: 'canceled' });
  dc5 = await ciorna();
  T('factura anulată le eliberează: se propun din nou toate', anul.s === 200 && nr(dc5, /FMC130/) === 3 && nr(dc5, /LV-CAN/) === 3 && !(dc5.aparateDejaPe || []).length, anul.s + ' ' + JSON.stringify(dc5.aparate));
  const pf5 = await R('POST', '/api/invoices', { companyId: co5.id, tip: 'proforma', fel: 'unica', lines: dc5.aparate });
  dc5 = await ciorna();
  T('după proforma aparatelor: nu se mai propun, iar ciorna spune pe ce document sunt',
    pf5.s === 200 && (dc5.aparate || []).length === 0 && J(dc5.aparateDejaPe) === J([pf5.j.invoice.full_number]), JSON.stringify(dc5));
  const inc5 = await R('PUT', '/api/invoices/' + pf5.j.invoice.id + '/status', { status: 'paid' });
  dc5 = await ciorna();
  T('…și după „Încasată": documentul e acum factura fiscală a proformei (proforma încasată nu se mai numără a doua oară)',
    inc5.s === 200 && (dc5.aparate || []).length === 0 && J(dc5.aparateDejaPe) === J([inc5.j.invoice.full_number]), JSON.stringify(dc5.aparateDejaPe));

  sect('7. Lunile de dinainte de 28.09 nu se mai facturează de două ori (pe server pornit)');
  if (SEED) {
    T('baza: factura veche de abonament acoperă luna ei', SEED.v2 && SEED.v2.veche === true && /-00901$/.test(SEED.v2.full_number), JSON.stringify(SEED.v2));
    T('…una veche DOAR cu un aparat nu ține loc de abonament', SEED.v3 === null, JSON.stringify(SEED.v3));
    T('…una veche ANULATĂ nu contează', SEED.v4 === null, JSON.stringify(SEED.v4));
    T('…și nu se vede la altă firmă', SEED.vAlta === null);
    const dv = (await R('POST', '/api/invoices/draft', { companyId: SEED.co, luna: SEED.luni.L2 })).j || {};
    T('ciorna lunii vechi spune că e deja facturată (factura veche)', dv.deja && /-00901$/.test(dv.deja.full_number || ''), JSON.stringify(dv.deja));
    const dublu = await R('POST', '/api/invoices', { companyId: SEED.co, fel: 'abonament', luna: SEED.luni.L2, lines: [{ desc: 'Abonament monitorizare GPS', qty: 2, unitPrice: 29 }] });
    T('emiterea a doua oară pe luna veche → refuzată (409), cu numărul facturii vechi', dublu.s === 409 && /-00901/.test(dublu.j.error || '') && /de dinainte de 28\.09/.test(dublu.j.error || ''), dublu.s + ' ' + dublu.text.slice(0, 200));
    const l3 = await R('POST', '/api/invoices', { companyId: SEED.co, fel: 'abonament', luna: SEED.luni.L3, lines: [{ desc: 'Abonament monitorizare GPS', qty: 2, unitPrice: 29 }] });
    const l4 = await R('POST', '/api/invoices', { companyId: SEED.co, fel: 'abonament', luna: SEED.luni.L4, lines: [{ desc: 'Abonament monitorizare GPS', qty: 2, unitPrice: 29 }] });
    T('…dar luna cu doar un aparat vechi și luna cu abonamentul vechi anulat se facturează', l3.s === 200 && l4.s === 200, l3.s + ' ' + l3.text.slice(0, 200) + ' / ' + l4.s + ' ' + l4.text.slice(0, 200));
  }

  sect('9. Abonamentul pe luna viitoare (pe server pornit)');
  const azi = new Date(), urm = new Date(azi.getFullYear(), azi.getMonth() + 1, 1);
  const cheieL = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const dUrm = (await R('POST', '/api/invoices/draft', { companyId: co5.id, luna: cheieL(urm) })).j || {};
  T('ciorna lunii viitoare poartă refuzul, gata scris', typeof dUrm.preaDevreme === 'string' && /se emite de pe 1 /.test(dUrm.preaDevreme), JSON.stringify(dUrm.preaDevreme));
  T('…ciorna lunii în curs nu', ((await R('POST', '/api/invoices/draft', { companyId: co5.id, luna: cheieL(azi) })).j || {}).preaDevreme === null);
  const eUrm = await R('POST', '/api/invoices', { companyId: co5.id, fel: 'abonament', luna: cheieL(urm), lines: [{ desc: 'Abonament monitorizare GPS', qty: 1, unitPrice: 29 }] });
  const pUrm = await R('POST', '/api/invoices/previzualizare', { companyId: co5.id, fel: 'abonament', luna: cheieL(urm), lines: [{ desc: 'Abonament monitorizare GPS', qty: 1, unitPrice: 29 }] });
  T('emiterea și previzualizarea pe luna viitoare → refuzate (400), cu același motiv', eUrm.s === 400 && eUrm.j.preaDevreme === true && pUrm.s === 400 && eUrm.j.error === dUrm.preaDevreme, eUrm.s + ' / ' + pUrm.s + ' ' + eUrm.text.slice(0, 160));

  sect('10, 13. „Lunar" și „Contract ↔ factură" numără doar mașinile pornite; chiria nu e „nefacturată" (pe server pornit)');
  const ofCh = (await R('POST', '/api/admin/offers', { name: 'Ofertă închiriere', client_name: 'Chirie SRL',
    config: { cfg: { echipMod: 'inchiriaza', nVeh: 3, nCan: 0, nFms: 0, contractMonths: 24, fxRate: 5, retTier: '12', devices: { d130: 3 }, montaj: { qGps: 3 } },
      prices: { pPlain: 29, chFmc130: 14, dFmc130: 55, mGps: 100, mUninstall: 60 } }, monthly_total: 129, once_total: 300, currency: 'RON' })).j || {};
  const dinOf = { unitati: { plain: 29, can: 45, fms: 65 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 3, pret: 29, total: 87 }],
    servicii: [{ fel: 'chirie', nume: 'Chirie Teltonika FMC130', cant: 3, pret: 14, total: 42 }] };
  const coZ = await firma('Chirie Zeta SRL'), coW = await firma('Chirie Wolf SRL');
  const ctZ = await R('POST', '/api/companies/' + coZ.id + '/contract', { offer_id: ofCh.id, months: 24, din_oferta: dinOf });
  const ctW = await R('POST', '/api/companies/' + coW.id + '/contract', { offer_id: ofCh.id, months: 24, din_oferta: dinOf });
  T('pregătirea: două firme care închiriază (29 lei mașina + 42 lei chiria)', ctZ.s === 200 && ctW.s === 200, ctZ.s + ' / ' + ctW.s + ' ' + ctZ.text.slice(0, 120));
  for (const im of ['869100000000001', '869100000000002']) await R('POST', '/api/devices', { imei: im, company_id: coZ.id, name: 'Z' + im.slice(-1) });
  await R('POST', '/api/devices', { imei: '869100000000003', company_id: coW.id, name: 'W3' });
  await SIM('869100000000001');   // la Zeta transmite (e montată) DOAR una din două; la Wolf, niciuna
  const pornitZ = await aparat('869100000000001');
  T('pregătirea: prima transmisie a pornit abonamentul unei singure mașini', pornitZ && pornitZ.abonament_de_la != null && (await aparat('869100000000002')).abonament_de_la == null);
  const mrr = (await R('GET', '/api/companies/mrr')).j || {};
  T('„Lunar" la Zeta: o mașină pornită (29) + chiria (42) = 71 lei, nu 100 (cu mașina nemontată)', Number((mrr.firme || {})[coZ.id]) === 71, JSON.stringify(mrr.firme && mrr.firme[coZ.id]));
  T('„Lunar" la Wolf: nicio mașină pornită → 0 lei, ca factura (nu 71)', Number((mrr.firme || {})[coW.id]) === 0, JSON.stringify(mrr.firme && mrr.firme[coW.id]));
  const ovZ = (await R('GET', '/api/companies/' + coZ.id + '/overview')).j || {};
  const cmp = ovZ.comparatie || {};
  T('„Contract ↔ factură": pe factură, mașinile PORNITE (1, 29 lei), nu toate aparatele de pe firmă (2)',
    cmp.masini && cmp.masini.factura.nr === 1 && cmp.masini.factura.lei === 29, JSON.stringify(cmp.masini));
  T('…iar chiria NU mai apare „în contract, dar nu pe factură" (ajunge pe factură)', Array.isArray(cmp.nefacturate) && !cmp.nefacturate.some((x) => /Chirie/.test(x.nume)), JSON.stringify(cmp.nefacturate));
  T('…și totalul de pe factură e cel al facturii (29 + 42 = 71)', cmp.total && cmp.total.factura === 71, JSON.stringify(cmp.total));
  const ovW = (await R('GET', '/api/companies/' + coW.id + '/overview')).j || {};
  T('„Contract ↔ factură" la Wolf: nicio mașină pornită → nimic pe factură', ovW.comparatie && ovW.comparatie.total.factura === 0 && ovW.comparatie.masini.factura.nr === 0, JSON.stringify(ovW.comparatie && ovW.comparatie.total));

  sect('12. Aparat șters definitiv și înregistrat din nou: abonamentul pornește iar (pe server pornit)');
  const IM12 = '869100000000003';
  await SIM(IM12);
  T('pregătirea: aparatul de la Wolf transmite → pornit', (await aparat(IM12)).abonament_de_la != null);
  await R('PUT', '/api/devices/' + IM12 + '/status', { status: 'archived' });
  const del12 = await R('DELETE', '/api/devices/' + IM12);
  T('arhivat și șters definitiv', del12.s === 200 && !(await aparat(IM12)), del12.s + ' ' + del12.text.slice(0, 120));
  const re12 = await R('POST', '/api/devices', { imei: IM12, company_id: coW.id, name: 'W3 din nou' });
  T('înregistrat din nou pe firmă: încă nepornit (nu transmisese pe rândul nou)', re12.s === 200 && (await aparat(IM12)).abonament_de_la == null, re12.s + ' ' + re12.text.slice(0, 120));
  await SIM(IM12);
  T('prima transmisie pe rândul nou pornește abonamentul (până pe 01.10: abia după repornirea serverului)', (await aparat(IM12)).abonament_de_la != null, JSON.stringify(await aparat(IM12)));

  sect('14. Telefoanele vechi: „Înregistrează plata + extinde accesul" (pe server pornit)');
  const vechi14 = await R('POST', '/api/companies/' + coZ.id + '/payment', { months: 1, amount: '71', method: 'transfer' });
  T('cererea veche (cu „luni") → refuzată, cu drumul bun spus', vechi14.s === 400 && vechi14.j.aplicatieVeche === true && /„Încasată"/.test(vechi14.j.error || ''), vechi14.s + ' ' + vechi14.text.slice(0, 160));
  const nou14 = await R('POST', '/api/companies/' + coZ.id + '/payment', { amount: '71', method: 'transfer' });
  T('încasarea fără factură de azi (web, telefon nou) merge ca înainte', nou14.s === 200 && nou14.j.ok === true, nou14.s);

  sect('15. „Mută între companii": bucata din stoc se mută cu aparatul (pe server pornit)');
  const IM15 = '869100000000015';
  const in15 = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: IM15, cost_eur: 45 });
  await R('POST', '/api/devices', { imei: IM15, name: 'Mutat' });
  await R('PUT', '/api/devices/' + IM15 + '/company', { company_id: coZ.id });
  const bucata = async () => ((((await R('GET', '/api/stoc')).j || {}).aparate) || []).filter((x) => x.serie === IM15)[0] || {};
  const b0 = await bucata();
  T('pregătirea: bucata din stoc e „montat" la Zeta (care închiriază → a noastră)', in15.s === 200 && b0.stare === 'montat' && Number(b0.company_id) === coZ.id && b0.proprietar === 'ra', JSON.stringify(b0));
  const mut = await R('PUT', '/api/devices/company/bulk', { company_id: coW.id, imeis: [IM15] });
  const b1 = await bucata();
  const ultim = (b1.istoric || [])[(b1.istoric || []).length - 1] || {};
  T('mutată pe Wolf: bucata e acum la Wolf, tot „montat", tot a noastră', mut.s === 200 && b1.stare === 'montat' && Number(b1.company_id) === coW.id && b1.proprietar === 'ra', JSON.stringify(b1));
  T('…cu rând în istoric, de unde și unde', (b1.istoric || []).length === (b0.istoric || []).length + 1 && /mutat de la „Chirie Zeta SRL" pe „Chirie Wolf SRL"/.test(ultim.nota || ''), JSON.stringify(ultim));
  const mut2 = await R('PUT', '/api/devices/company/bulk', { company_id: coW.id, imeis: [IM15] });
  T('…iar o „mutare" pe aceeași firmă nu scrie nimic în plus', mut2.s === 200 && ((await bucata()).istoric || []).length === (b1.istoric || []).length);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
