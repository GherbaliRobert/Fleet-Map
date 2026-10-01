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

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (t) => console.log('\n' + t);
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pe server pornit.
const PORT = 3271, TCP = 5271;
const DIR = path.join(os.tmpdir(), 'rax_reparatii_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const { puneParola } = require('./test_parola');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_reparatii', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
});
delete env.DATABASE_URL;
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
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
