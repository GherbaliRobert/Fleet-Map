// verify_email_raport.js — emailul cu raportul programat (29.10; Alin: „da, e o idee bună").
// Până atunci emailul avea două rânduri și un Excel atașat — forma pe care filtrele de spam o bănuiesc la un expeditor nou
// (raportul lui Alin ajungea în Spam la Yahoo). Acum: ce raport, perioada, mașinile, cifrele de sus (aceeași socoteală ca pe
// cartonașul din RA Insight), linkul „Deschide raportul în aplicație" (spre Istoric) și de ce primește omul emailul.
// Aici: textele (email_raport.js), cifrele de sus (reports.kpiRaport, una pentru email și RA Insight), linkul din pagină
// (/app?raport=<id>, rulat în vm) și emailul adevărat, pe server pornit, cu Brevo fals.
//   node verify_email_raport.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

// ─── 1. Textele (email_raport.js) ───────────────────────────────────────────────────────────────
console.log('\n1. Textele emailului');
const ER = require('./email_raport.js');
T('linkul: raportul din Istoric (doar un număr), altfel aplicația', ER.linkRaport('https://ratrack.ro/', 123) === 'https://ratrack.ro/app?raport=123' &&
  ER.linkRaport('https://ratrack.ro', null) === 'https://ratrack.ro/app' && ER.linkRaport('https://ratrack.ro', 'x<y') === 'https://ratrack.ro/app' && ER.linkRaport(undefined, 7) === 'https://ratrack.ro/app?raport=7');
T('mașinile: una anume cu numele ei, altfel „Toată flota · N mașini" (cu „de" de la 20)', ER.textMasini({ vehicul: 'Dacia Logan 3 · B 154 UIP' }) === 'Dacia Logan 3 · B 154 UIP' &&
  ER.textMasini({ nrMasini: 1 }) === 'Toată flota · 1 mașină' && ER.textMasini({ nrMasini: 5 }) === 'Toată flota · 5 mașini' && ER.textMasini({ nrMasini: 24 }) === 'Toată flota · 24 de mașini' && ER.textMasini({}) === 'Toată flota');
T('de ce primește emailul: programarea, cât de des, ora — și de unde se oprește', ER.textDeCe({ numeProgramare: 'Foaia de dimineață', frecventa: 'daily', ora: 7 }) ===
  'Primești emailul pentru că raportul e programat în RA Track (Rapoarte › Programări: „Foaia de dimineață”, zilnic, la 07:00). Îl poți schimba sau opri de acolo.' &&
  /în fiecare luni, la 18:00/.test(ER.textDeCe({ frecventa: 'weekly', ora: 18 })) && /pe 1 ale fiecărei luni, la 06:00/.test(ER.textDeCe({ frecventa: 'monthly', ora: 6 })));
const c1 = ER.continut({ label: 'Foaie de parcurs', perioada: '28.10.2026', nrMasini: 5, kpi: [{ et: 'Curse', val: '12' }, { et: 'Distanță totală (km)', val: '845' }],
  randuri: 12, link: 'https://ratrack.ro/app?raport=9', format: 'xlsx', numeProgramare: 'Foaia de dimineață', frecventa: 'daily', ora: 7 });
T('subiectul rămâne cel de până acum', c1.subiect === '[RA Track] Foaie de parcurs — 28.10.2026');
T('textul: raportul și perioada, mașinile, „Pe scurt" cu cifrele de sus, fișierul atașat, linkul, de ce', c1.text.split('\n')[0] === 'Raport „Foaie de parcurs” · 28.10.2026' &&
  c1.text.split('\n')[1] === 'Toată flota · 5 mașini' && /Pe scurt:\n• Curse: 12\n• Distanță totală \(km\): 845/.test(c1.text) && /fișierul atașat \(Excel\)/.test(c1.text) &&
  /\nhttps:\/\/ratrack\.ro\/app\?raport=9\n/.test(c1.text) && /Rapoarte › Programări: „Foaia de dimineață”, zilnic, la 07:00/.test(c1.text), c1.text);
T('HTML-ul: butonul „Deschide raportul în aplicație" spre același link, cifrele în tabel, fără scripturi',
  /<a href="https:\/\/ratrack\.ro\/app\?raport=9"[^>]*>Deschide raportul în aplicație<\/a>/.test(c1.html) && /<td[^>]*>Curse<\/td><td[^>]*>12<\/td>/.test(c1.html) && !/<script/i.test(c1.html));
const c2 = ER.continut({ label: 'Opriri <b>', perioada: '28.10.2026', vehicul: 'Duba <img src=x> & Co', kpi: [{ et: 'Opriri "lungi"', val: '<3>' }], randuri: 1, format: 'pdf' });
T('HTML-ul nu lasă să treacă nimic din date ca cod (numele mașinii, al raportului, cifrele)', !/<img src=x>/.test(c2.html) && /Duba &lt;img src=x&gt; &amp; Co/.test(c2.html) &&
  /Opriri &lt;b&gt;/.test(c2.html) && /&lt;3&gt;/.test(c2.html) && /Opriri &quot;lungi&quot;/.test(c2.html) && /fișierul atașat \(PDF\)/.test(c2.html));
const c3 = ER.continut({ label: 'Foaie de parcurs', perioada: '28.10.2026', nrMasini: 2, kpi: [], randuri: 0, format: 'xlsx' });
T('fără nimic în perioadă: „Nicio înregistrare în perioada asta." (text și HTML), linkul spre aplicație', /• Nicio înregistrare în perioada asta\./.test(c3.text) && /Nicio înregistrare în perioada asta\./.test(c3.html) &&
  /\nhttps:\/\/ratrack\.ro\/app\n/.test(c3.text));
const c4 = ER.continut({ label: 'Traseu', perioada: 'x', kpi: [], randuri: 1, format: 'xlsx' });
T('…iar fără sumar, dar cu rânduri: câte rânduri are raportul („1 rând" / „25 de rânduri")', /• 1 rând în raport\./.test(c4.text) && /• 25 de rânduri în raport\./.test(ER.continut({ kpi: [], randuri: 25 }).text));
T('cel mult 4 cifre de sus (ca pe cartonașul din RA Insight)', (ER.continut({ kpi: [1, 2, 3, 4, 5, 6].map((i) => ({ et: 'K' + i, val: String(i) })), randuri: 3 }).text.match(/^• K/gm) || []).length === 4);

// ─── 2. Cifrele de sus: O socoteală ─────────────────────────────────────────────────────────────
console.log('\n2. Cifrele de sus: aceeași socoteală pentru email și pentru RA Insight');
const reports = require('./reports.js');
const k1 = reports.kpiRaport({ summary: [['Curse', 12], ['Distanță totală (km)', 845.25], ['Atenție', 'x'], ['Gol', ''], ['Timp de mers', '14h 20m'], ['A', 1], ['B', 2]] });
T('reports.kpiRaport: fără „Atenție" și fără goluri, cel mult 4, numerele pe românește', JSON.stringify(k1) === JSON.stringify([{ et: 'Curse', val: '12' }, { et: 'Distanță totală (km)', val: '845,3' }, { et: 'Timp de mers', val: '14h 20m' }, { et: 'A', val: '1' }]), JSON.stringify(k1));
T('…și sumarul scris ca obiect', JSON.stringify(reports.kpiRaport({ summary: { Curse: 3, Opriri: 0 } })) === JSON.stringify([{ et: 'Curse', val: '3' }, { et: 'Opriri', val: '0' }]) && reports.kpiRaport(null).length === 0);
const SRV = citeste('server.js'), RS = citeste('report_schedules.js');
T('serverul (cartonașul din RA Insight) cheamă aceeași funcție — nu mai are o copie a ei', /function _kpiRaport\(report\) \{ return reports\.kpiRaport\(report\); \}/.test(SRV) && !/const perechi = Array\.isArray\(s\)/.test(SRV));
T('programarea ia cifrele tot de acolo (deps.reports.kpiRaport) și textele din email_raport.js', /deps\.reports\.kpiRaport\(report\)/.test(RS) && /emailRaport\.continut\(/.test(RS) && /emailRaport\.linkRaport\(process\.env\.BASE_URL, extra\.historyId\)/.test(RS));
T('…pe ambele drumuri: trimiterea și reîncercarea (raportul păstrat în Istoric, cu id-ul lui)', (RS.match(/await _pentruEmail\(/g) || []).length === 2 && /_pentruEmail\(s, report, h\.vehicle_count, h\.id, deps\)/.test(RS) && /_pentruEmail\(s, report, imeis\.length, historyId, deps\)/.test(RS));
T('emailul pleacă și cu HTML-ul lui (chenarul casei îl pune mailer.js)', /channels\.sendEmailTo\(rcp, subject, text, attachments, em\.html,/.test(RS));

// ─── 3. Pagina: linkul /app?raport=<id> ─────────────────────────────────────────────────────────
console.log('\n3. Pagina: linkul din email deschide raportul, după autentificare');
const PAG = citeste('public/index.html');
const i0 = PAG.indexOf('    function _raportDinAdresa() {'), i1 = PAG.indexOf('    function vertAterizeaza(ecranAles) {');
T('linkul se citește la aterizare, ÎNAINTEA ecranului de pornire (după preferințe)', i0 > 0 && i1 > i0 && /function vertAterizeaza\(ecranAles\) \{\n      if \(_raportDinAdresa\(\)\) return;/.test(PAG));
const fRaport = PAG.slice(i0, i1);
function ruleaza(cautare, o) {
  o = o || {};
  const ctx = { location: { search: cautare, pathname: '/app', hash: '' }, history: { replaceState: function (a, b, u) { ctx._adresa = u; } }, _adresa: null, _deschis: [], _vert: 0,
    window: {}, currentUser: o.super ? { isSuper: true } : { isSuper: false }, SET_OCHI_CHEIE: 'ra_set_ochi', _ls: {} };
  ctx.window.localStorage = { setItem: function (k, v) { ctx._ls[k] = v; }, getItem: function (k) { return ctx._ls[k]; } };
  ctx.window.insightDeschideRaport = function (id) { ctx._deschis.push(id); };
  ctx.window.currentUser = ctx.currentUser;
  ctx.can = function (p) { return p === 'viewReports' ? o.rapoarte !== false : false; };
  ctx.vertCurenta = function () { return o.vert || 'firma'; };
  ctx.setOchiCitit = function () { return o.vert || 'firma'; };
  ctx.vertAplica = function () { ctx._vert++; };
  vm.createContext(ctx);
  vm.runInContext(fRaport + '\n_rez = _raportDinAdresa();', ctx);
  return ctx;
}
let r = ruleaza('?raport=123');
T('/app?raport=123 → deschide raportul 123 din Istoric și scoate numărul din adresă', r._rez === true && r._deschis.length === 1 && r._deschis[0] === 123 && r._adresa === '/app');
r = ruleaza('');
T('fără link: aterizarea obișnuită', r._rez === false && r._deschis.length === 0 && r._adresa === null);
r = ruleaza('?raport=12abc');
T('…și fără nimic altceva decât un număr (nici „12abc")', r._rez === false && r._deschis.length === 0);
r = ruleaza('?raport=55', { rapoarte: false });
T('omul fără rapoarte în rol: aterizarea obișnuită (adresa tot se curăță)', r._rez === false && r._deschis.length === 0 && r._adresa === '/app');
r = ruleaza('?x=1&raport=77', { super: true, vert: 'fondator' });
T('fondatorul trece pe verticala Partener (acolo stau Rapoartele), apoi raportul', r._rez === true && r._deschis[0] === 77 && r._ls.ra_set_ochi === 'firma' && r._vert === 1);

// ─── 4. Pe server pornit, cu Brevo fals ─────────────────────────────────────────────────────────
console.log('\n4. Pe server pornit: emailul raportului programat, cu Brevo fals');
const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const J = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/v3/account') return J(200, { email: 'cont@ratrack.ro' });
    if (u.pathname === '/v3/smtp/statistics/events') return J(200, { events: [] });
    if (u.pathname === '/v3/smtp/email') { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {} primite.push(j); return J(201, { messageId: '<m' + primite.length + '@smtp-brevo.com>' }); }
    J(404, {});
  });
});
(async () => {
  await new Promise((x) => fals.listen(0, '127.0.0.1', x));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';
  const PORT = 3396, TCP = 5396, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_emailraport_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_emailraport', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba-fara-retea', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <noreply@ratrack.ro>',
    BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300', RATE_LIMIT_ENABLED: 'false' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'NOTIFY_EMAIL_TO']) delete env[k];
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { fals.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800); };
  srv.on('exit', (cod) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + cod + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const json = async (m, u, ck, body) => {
    const x = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: x.status, j: j == null ? {} : j, t };
  };
  const login = async (u, p) => {
    const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    return (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('  ✗ serverul nu a pornit'); return gata(1); }
    const S = await login('admin', 'test1234');
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Email Raport SRL' })).j;
    const IMEI = '862129084939961', IMEI2 = '862129084939962';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: IMEI, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }, { imei: IMEI2, nume: 'Duba <b>x</b>', nr_inmatriculare: 'B 99 DUB' }] });
    for (const im of [IMEI, IMEI2]) await json('PUT', '/api/devices/' + im + '/company', S, { company_id: co.id });
    const tick = async (t) => json('POST', '/api/test/ceasuri', S, { acum: t, rapoarte: true });
    const programeaza = async (o) => (await json('POST', '/api/report-schedules', S, Object.assign({ report_type: 'trips', period: 'yesterday', frequency: 'daily', hour: 7, format: 'xlsx' }, o))).j;
    const randul = async (id) => ((await json('GET', '/api/report-schedules', S)).j || []).filter((x) => x.id === id)[0] || {};

    // a) Toată flota
    const s1 = await programeaza({ name: 'Foaia de dimineață', imei: '', recipients: 'alin@firma-email.ro' });
    let p = await randul(s1.id);
    const t0 = new Date(p.next_run).getTime() + 60000;
    let n0 = primite.length;
    await tick(t0);
    const em = primite.slice(n0).filter((x) => x.to && x.to[0] && x.to[0].email === 'alin@firma-email.ro')[0] || {};
    const ist = ((await json('GET', '/api/reports/history?limit=50', S)).j || []).filter((x) => x.report_type === 'trips');
    const hid = ist.length ? ist[0].id : null;
    T('a) emailul pleacă, cu Foaia de parcurs atașată (numele casei) și subiectul de până acum', !!em.subject && /^\[RA Track\] Foaie de parcurs — \d{2}\.\d{2}\.\d{4}$/.test(em.subject) &&
      /^RA-Track - Raport Foaie de parcurs/.test(((em.attachment || [])[0] || {}).name || ''), JSON.stringify({ s: em.subject, a: (em.attachment || []).map((x) => x.name) }));
    const txt = String(em.textContent || ''), htm = String(em.htmlContent || '');
    // „Toată flota" a fondatorului = toate mașinile platformei, fără arhivate (cum citește programarea).
    const nrFlota = ((await json('GET', '/api/devices', S)).j || []).filter((d) => d && d.status !== 'archived').length;
    T('…textul: raportul, „' + ER.textMasini({ nrMasini: nrFlota }) + '", „Pe scurt", linkul spre raportul din Istoric', nrFlota >= 2 && hid &&
      txt.indexOf('Raport „Foaie de parcurs” · ') === 0 && txt.split('\n')[1] === ER.textMasini({ nrMasini: nrFlota }) && /\n\nPe scurt:\n/.test(txt) &&
      txt.indexOf('https://ratrack.ro/app?raport=' + hid + '\n') > 0, txt.slice(0, 400));
    // Raportul salvat stă ca JSONB, care își așază cheile altfel: cifrele se compară una câte una, nu în ordine.
    const h = await json('GET', '/api/reports/history/' + hid, S);
    const salvate = reports.kpiRaport(h.j.report || {}).map((k) => '• ' + k.et + ': ' + k.val);
    const dinEmail = ((txt.split('Pe scurt:\n')[1] || '').split('\n\n')[0] || '').split('\n').filter(Boolean);
    T('…cifrele de sus sunt chiar ale raportului salvat (aceeași socoteală ca RA Insight)', salvate.length > 0 && dinEmail.length === salvate.length &&
      dinEmail.every((x) => salvate.indexOf(x) >= 0), JSON.stringify({ salvate, dinEmail }));
    T('…HTML-ul: chenarul casei (sigla de pe site), butonul spre același raport, de ce primește emailul', /logo\.png/.test(htm) && htm.indexOf('href="https://ratrack.ro/app?raport=' + hid + '"') > 0 &&
      /Deschide raportul în aplicație/.test(htm) && /Rapoarte › Programări: „Foaia de dimineață”, zilnic, la 07:00/.test(htm), htm.slice(0, 300));
    T('…rândul programării: „a plecat pe email" (ca înainte)', /a plecat pe email/.test((await randul(s1.id)).stare_text || ''));

    // b) O mașină anume, cu un nume care ar putea fi cod
    const s2 = await programeaza({ name: 'Duba', imei: IMEI2, recipients: 'dispecer@firma-email.ro', format: 'pdf' });
    p = await randul(s2.id);
    n0 = primite.length;
    await tick(new Date(p.next_run).getTime() + 60000);
    const em2 = primite.slice(n0).filter((x) => x.to && x.to[0] && x.to[0].email === 'dispecer@firma-email.ro')[0] || {};
    T('b) o mașină anume: numele și numărul ei, iar în HTML numele nu trece drept cod', /^Raport „Foaie de parcurs” · .*\nDuba <b>x<\/b> · B 99 DUB\n/.test(String(em2.textContent || '')) &&
      /Duba &lt;b&gt;x&lt;\/b&gt; · B 99 DUB/.test(String(em2.htmlContent || '')) && !/Duba <b>x<\/b>/.test(String(em2.htmlContent || '')) && /fișierul atașat \(PDF\)/.test(String(em2.textContent || '')),
      String(em2.textContent || '').slice(0, 200));
  } catch (e) { T('proba pe server a mers până la capăt', false, (e && e.stack) || e); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})();
