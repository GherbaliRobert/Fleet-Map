// verify_preferinte.js — „Setări → Preferințe": contul meu, cum arată aplicația, alertele.
//
//   node verify_preferinte.js
//
// Ecranul ăsta a fost rescris din temelii, iar trei lucruri se pot strica tăcut:
//   • **Parola.** Până acum nu se putea schimba din aplicație deloc. Acum se poate — dar numai
//     dovedind că știi parola de acum. Dacă paza aia cade, o sesiune uitată deschisă pe un
//     calculator străin devine preluarea contului. Aici se probează pe server pornit.
//   • **Catalogul dublu.** Preferințele sunt scrise în DOUĂ locuri: în interfață (ce se vede) și în
//     server (ce se acceptă). Dacă se despart, ori apare pe ecran un buton pe care serverul îl
//     refuză în tăcere, ori invers. Proba compară cele două liste cheie cu cheie.
//   • **Cine hotărăște.** „Filele pentru camioane" nu e gustul unui om, e „firma asta n-are
//     camioane" — n-are ce căuta în contul cuiva. Iar tema sau sunetul sunt invers. Amestecul se
//     vede greu cu ochiul, dar se probează ușor.
// Plus regula din CLAUDE.md: în ecranele clientului nu scriem în limba noastră. Proba caută cuvintele
// pe care le scăpăm cel mai des („heatmap", „reverse-geocode", „default", „marker").

const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3199, DIR = '.pref-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_pref',
  PORT: String(PORT), TCP_PORT: '5199', PGLITE_DIR: DIR + '/pgdata',
};

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;

const html = fs.readFileSync('./public/index.html', 'utf8');
const srvSrc = fs.readFileSync('./server.js', 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
sect('1. Catalogul din interfață se poate citi');
const i1 = html.indexOf('    // ── începe „Preferințele mele"');
const i2 = html.indexOf('    // ── sfârșit „Preferințele mele" ──', i1);
T('găsesc catalogul între repere', i1 > 0 && i2 > i1, 'i1=' + i1 + ' i2=' + i2);
if (i1 < 0 || i2 < i1) { console.log('\n' + ok + ' verificări trecute, ' + (rele + 1) + ' picate'); process.exit(1); }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = new Function('_usEsc', html.slice(i1, i2) +
  '\n; return { T: US_TOGGLES, GR: PREF_GRUPE, pers: prefPersonale, firma: prefAleFirmei, sursa: prefSursa,' +
  ' ctrl: prefControl, rand: prefRand, randF: prefRandFirma, ecran: prefEcranHtml, cont: prefContHtml };')(esc);

sect('2. Catalogul din server se poate citi');
const j1 = srvSrc.indexOf('// ── începe „Catalogul de preferințe"');
const j2 = srvSrc.indexOf('// ── sfârșit „Catalogul de preferințe" ──', j1);
T('găsesc catalogul între repere', j1 > 0 && j2 > j1, 'j1=' + j1 + ' j2=' + j2);
const S = new Function(srvSrc.slice(j1, j2) +
  '\n; return { P: UI_PREFS, KEYS: UI_PREF_KEYS, DEF: UI_PREF_DEFAULTS, filtru: _filterUiKeys, chei: _cheiPentru };')();

// ─────────────────────────────────────────────────────────────────────────────
sect('3. Cele două cataloage spun același lucru');
// Cea mai importantă probă din fișier: dacă cineva adaugă o preferință într-un singur loc, aici pică.
const cheiUI = C.T.map(t => t.k).sort();
const cheiSrv = S.KEYS.slice().sort();
T('aceleași chei în interfață și în server', cheiUI.join(',') === cheiSrv.join(','),
  'doar în UI: ' + cheiUI.filter(k => cheiSrv.indexOf(k) < 0).join(',') + ' | doar în server: ' + cheiSrv.filter(k => cheiUI.indexOf(k) < 0).join(','));
C.T.forEach(function (t) {
  const p = S.P.filter(x => x.k === t.k)[0];
  if (!p) return;
  T('„' + t.k + '": același stăpân în ambele', p.unde === t.unde, 'server=' + p.unde + ' ui=' + t.unde);
  T('„' + t.k + '": același fel', (p.tip === 'bifa') === (t.tip === 'bifa'), 'server=' + p.tip + ' ui=' + t.tip);
  if (t.tip === 'lista') {
    const aUI = t.valori.map(v => v[0]).sort().join(',');
    T('„' + t.k + '": aceleași variante', aUI === (p.valori || []).slice().sort().join(','), 'ui=' + aUI + ' server=' + (p.valori || []).join(','));
  }
});

sect('4. Cine hotărăște ce');
const pers = C.pers().map(t => t.k), fir = C.firma().map(t => t.k);
T('filele pentru camioane NU sunt în contul omului', pers.indexOf('tab_camion') < 0, pers.join(', '));
T('nici filele pentru sonde', pers.indexOf('tab_sonde') < 0, pers.join(', '));
T('dar sunt la regulile firmei', fir.indexOf('tab_camion') >= 0 && fir.indexOf('tab_sonde') >= 0, fir.join(', '));
T('tema e numai a omului', fir.indexOf('tema') < 0 && pers.indexOf('tema') >= 0);
T('sunetul alertelor e numai al omului', fir.indexOf('sunet_alerte') < 0 && pers.indexOf('sunet_alerte') >= 0);
['overspeed_heatmap', 'replay_marker', 'geocoded_address', 'show_driver_names'].forEach(k =>
  T('„' + k + '" se vede în ambele ecrane', pers.indexOf(k) >= 0 && fir.indexOf(k) >= 0));

sect('5. Fără limba noastră pe ecranul clientului');
// Regula din CLAUDE.md. Cuvintele astea chiar erau pe ecran înainte de rescriere.
const JARGON = ['heatmap', 'reverse-geocode', 'nominatim', 'replay', 'marker', 'default', 'config', 'toggle', 'cache'];
C.T.forEach(function (t) {
  const text = (t.label + ' ' + t.desc + ' ' + (t.valori || []).map(v => v[1]).join(' ')).toLowerCase();
  const gasit = JARGON.filter(w => text.indexOf(w) >= 0);
  T('„' + t.k + '" e scris pe românește', !gasit.length, gasit.join(', '));
});
C.T.forEach(t => T('„' + t.k + '" are și explicație, nu doar titlu', !!(t.desc && t.desc.length > 25), t.desc));
C.T.forEach(t => T('„' + t.k + '" stă într-un grup care există', C.GR.some(g => g.g === t.g) || t.unde === 'firma', t.g));

sect('6. Sursa valorii, pe înțelesul omului');
T('„setată de tine"', C.sursa('user')[0] === 'setată de tine', C.sursa('user')[0]);
T('„hotărâtă de firmă"', C.sursa('company')[0] === 'hotărâtă de firmă', C.sursa('company')[0]);
T('„așa e din fabrică" (nu „default aplicație")', C.sursa('app')[0] === 'așa e din fabrică', C.sursa('app')[0]);

sect('7. Comenzile de pe ecran arată valoarea curentă');
const tTema = C.T.filter(t => t.k === 'tema')[0];
const segTema = C.ctrl(tTema, 'deschisa', 'usSetPref');
T('alegerea curentă e cea aprinsă', /class="pref-sg on"[^>]*>Deschisă/.test(segTema), segTema);
T('și numai ea', (segTema.match(/pref-sg on/g) || []).length === 1);
T('toate variantele sunt pe ecran, nu ascunse într-o listă', (segTema.match(/<button/g) || []).length === 3);
const bifa = C.ctrl(C.T.filter(t => t.k === 'sunet_alerte')[0], true, 'usSetPref');
T('bifa pornită se vede pornită', /<input[^>]* checked/.test(bifa));
T('bifa oprită nu', !/<input[^>]* checked/.test(C.ctrl(C.T.filter(t => t.k === 'sunet_alerte')[0], false, 'usSetPref')));

sect('8. Butonul „înapoi la regula firmei" apare doar unde are sens');
T('apare la o preferință pe care firma o poate hotărî, setată de om',
  /pref-reset/.test(C.rand(C.T.filter(t => t.k === 'overspeed_heatmap')[0], true, 'user')));
T('NU apare când valoarea vine de la firmă',
  !/pref-reset/.test(C.rand(C.T.filter(t => t.k === 'overspeed_heatmap')[0], true, 'company')));
// Tema e numai a omului: „înapoi la regula firmei" n-ar avea la ce să se întoarcă.
T('NU apare la o preferință pur personală', !/pref-reset/.test(C.rand(tTema, 'inchisa', 'user')));

sect('9. Ecranul întreg');
const ecran = C.ecran({ tema: 'inchisa', sunet_alerte: true, overspeed_heatmap: true }, { tema: 'user' });
C.GR.forEach(g => T('grupul „' + g.et + '" apare', ecran.indexOf(g.et) >= 0));
T('filele pentru camioane NU ajung în ecranul personal', ecran.indexOf('Fila „Camion"') < 0);
T('niciun grup rămas gol', !/pref-gr"><div class="set-sec-h">[^<]*<\/div><p[^>]*><\/p><\/div>/.test(ecran));
T('ecranul de pornire se poate scoate din listă', C.ecran({}, {}, false).indexOf('Ecranul cu care se deschide') < 0);

sect('10. „Contul meu"');
const cont = C.cont({ full_name: 'Ion Popescu', phone: '0722111222', username: 'ion@transport.ro' });
T('are numele', /id="pref-nume"[^>]*value="Ion Popescu"/.test(cont));
T('are telefonul', /id="pref-tel"[^>]*value="0722111222"/.test(cont));
T('arată adresa de email', cont.indexOf('ion@transport.ro') > 0);
T('dar NU o lasă schimbată de aici', /id="pref-mail"[^>]*disabled/.test(cont));
T('are cele trei câmpuri de parolă', /pref-p0/.test(cont) && /pref-p1/.test(cont) && /pref-p2/.test(cont));
T('cere parola de acum', cont.indexOf('Parola de acum') > 0);
// Numele vine din baza de date, deci trece prin ecran: dacă nu e escapat, un nume pus de un
// administrator devine cod în pagina altcuiva.
const rau = C.cont({ full_name: '"><img src=x onerror=alert(1)>', username: 'x@y.ro' });
T('un nume cu ghilimele nu sparge pagina', rau.indexOf('<img src=x') < 0, rau.slice(0, 160));

sect('11. Serverul primește doar ce e în catalog');
T('cheile necunoscute cad', Object.keys(S.filtru({ inventata: 1, tema: 'inchisa' }, 'user')).join(',') === 'tema');
T('bifele devin adevărat/fals', S.filtru({ sunet_alerte: 'da' }, 'user').sunet_alerte === true);
T('o valoare din afara listei e refuzată', S.filtru({ tema: 'roz' }, 'user').tema === undefined);
T('una din listă e primită', S.filtru({ tema: 'sistem' }, 'user').tema === 'sistem');
T('omul nu poate seta regulile firmei', S.filtru({ tab_camion: false }, 'user').tab_camion === undefined);
T('firma nu poate seta tema omului', S.filtru({ tema: 'deschisa' }, 'firma').tema === undefined);
T('dar poate seta ce e al ei', S.filtru({ tab_camion: false }, 'firma').tab_camion === false);
T('fiecare cheie are valoare din fabrică', S.KEYS.every(k => S.DEF[k] !== undefined),
  S.KEYS.filter(k => S.DEF[k] === undefined).join(', '));

// ─────────────────────────────────────────────────────────────────────────────
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
const login = async (u, p) => {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
};

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }
  const ck = await login('admin', 'test1234');
  if (!ck) { console.log('nu m-am putut autentifica'); return gata(1); }
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b || {}) });
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b) });

  const co = await (await POST('/api/companies', { name: 'Firma preferințe' })).json();
  await POST('/api/users', { username: 'disp@pref.ro', password: 'Str4da-Verde-2026', full_name: 'Dispecer Vechi', role: 'dispatcher', company_id: co.id });
  let ckD = await login('disp@pref.ro', 'Str4da-Verde-2026');

  sect('12. Preferințele se salvează pe cont');
  T('dispecerul intră în cont', !!ckD);
  let r = await PUT('/api/me/ui-prefs', { tema: 'deschisa', harta: 'sat', sunet_alerte: false }, ckD);
  T('își poate pune preferințele', r.status === 200, r.status);
  let d = await (await GET('/api/me/ui-prefs', ckD)).json();
  T('tema aleasă se întoarce', d.effective.tema === 'deschisa', d.effective.tema);
  T('harta la fel', d.effective.harta === 'sat', d.effective.harta);
  T('sunetul oprit rămâne oprit', d.effective.sunet_alerte === false, String(d.effective.sunet_alerte));
  T('și scrie că el le-a pus', d.source.tema === 'user', d.source.tema);
  T('ce n-a atins vine din fabrică', d.source.cat_sta_alerta === 'app' && d.effective.cat_sta_alerta === '15', d.effective.cat_sta_alerta);

  r = await PUT('/api/me/ui-prefs', { tema: 'roz-bombon' }, ckD);
  d = await (await GET('/api/me/ui-prefs', ckD)).json();
  T('o valoare inventată nu strică ce era', d.effective.tema === 'deschisa', d.effective.tema);
  await PUT('/api/me/ui-prefs', { tab_camion: false }, ckD);
  d = await (await GET('/api/me/ui-prefs', ckD)).json();
  T('un om nu-și poate scoate singur filele hotărâte de firmă', d.effective.tab_camion === true, String(d.effective.tab_camion));

  // Preferințele sunt ale OMULUI: nu se scurg la vecin.
  await POST('/api/users', { username: 'disp2@pref.ro', password: 'Str4da-Verde-2026', full_name: 'Alt Dispecer', role: 'dispatcher', company_id: co.id });
  const ckD2 = await login('disp2@pref.ro', 'Str4da-Verde-2026');
  const d2 = await (await GET('/api/me/ui-prefs', ckD2)).json();
  T('alt om nu moștenește preferințele lui', d2.effective.tema === 'inchisa' && d2.effective.harta === 'auto',
    d2.effective.tema + '/' + d2.effective.harta);

  sect('13. Contul meu: nume și telefon');
  r = await PUT('/api/me/profile', { full_name: 'Dispecer Nou', phone: '0722 111 222' }, ckD);
  T('își schimbă numele și telefonul', r.status === 200, r.status);
  let me = await (await GET('/api/me', ckD)).json();
  T('numele nou se vede', me.full_name === 'Dispecer Nou', me.full_name);
  T('telefonul la fel', me.phone === '0722 111 222', me.phone);
  // Regresia care ne-a mai costat o dată: cu COALESCE, un câmp golit însemna „lasă-l cum era".
  r = await PUT('/api/me/profile', { phone: '' }, ckD);
  me = await (await GET('/api/me', ckD)).json();
  T('își poate ȘTERGE telefonul', !me.phone, me.phone);
  T('iar numele rămâne neatins', me.full_name === 'Dispecer Nou', me.full_name);
  r = await PUT('/api/me/profile', { phone: 'nu e telefon' }, ckD);
  T('un telefon aiurea e refuzat', r.status === 400, r.status);

  sect('14. Parola: se schimbă singur, dar numai cu cea veche');
  r = await POST('/api/me/password', { veche: 'gresita', noua: 'Alt4-Parola-Buna' }, ckD);
  T('cu parola greșită nu merge', r.status === 400, r.status);
  T('și spune de ce, pe românește', /Parola de acum nu e bună/.test(await r.text()));
  r = await POST('/api/me/password', { veche: 'Str4da-Verde-2026', noua: '1234' }, ckD);
  let txt = await r.text();
  T('o parolă slabă e refuzată', r.status === 400 && /minim|prea/.test(txt), r.status + ' ' + txt.slice(0, 90));
  r = await POST('/api/me/password', { veche: 'Str4da-Verde-2026', noua: 'Str4da-Verde-2026' }, ckD);
  txt = await r.text();
  T('nu poți pune aceeași parolă', r.status === 400 && /aceeași/.test(txt), r.status + ' ' + txt.slice(0, 90));
  r = await POST('/api/me/password', { veche: 'Str4da-Verde-2026', noua: 'Alt4-Parola-Buna' }, ckD);
  T('cu parola de acum, merge', r.status === 200, r.status + ' ' + (await r.text()).slice(0, 120));
  T('vechea parolă nu mai intră în cont', !(await login('disp@pref.ro', 'Str4da-Verde-2026')));
  const ckNou = await login('disp@pref.ro', 'Alt4-Parola-Buna');
  T('cea nouă, da', !!ckNou);
  // Un dispecer NU administrează utilizatori — dar pe a lui trebuie să și-o poată schimba.
  T('și n-a avut nevoie de administrator', (await (await GET('/api/me', ckNou)).json()).permissions.manageUsers !== true);

  sect('15. Parola altuia rămâne a altuia');
  r = await POST('/api/me/password', { veche: 'Alt4-Parola-Buna', noua: 'Inca-O-Parola-9' }, ckD2);
  T('parola vecinului nu merge pe contul meu', r.status === 400, r.status);
  T('iar contul lui e neatins', !!(await login('disp@pref.ro', 'Alt4-Parola-Buna')));

  sect('16. Ghicitul parolei se oprește');
  const ckD3 = await login('disp2@pref.ro', 'Str4da-Verde-2026');
  let blocat = 0;
  for (let k = 0; k < 8; k++) {
    const rr = await POST('/api/me/password', { veche: 'x' + k, noua: 'Alt4-Parola-Buna' }, ckD3);
    if (rr.status === 429) blocat++;
  }
  T('după câteva încercări greșite, se oprește', blocat > 0, 'refuzuri: ' + blocat);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + (e && e.stack || e)); gata(1); });
