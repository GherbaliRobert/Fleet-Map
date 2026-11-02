// verify_formular_site.js — formularul de pe site e calea publică de contact (Robert, 02.11: „nu punem nimic public… solicitările
// ne vin pe mailul de contact").
//
//   node verify_formular_site.js
//
// Până pe 02.11, cererea intra în „Cereri demo", dar emailul pleca doar cu SUPPORT_EMAIL / DEMO_REQUEST_EMAIL setate pe server, iar
// „Răspunde" nu ajungea la cel care a scris. Proba pornește un server adevărat, FĂRĂ acele adrese, cu un Brevo fals, și verifică:
//   1. mesajul și cererea de cont demo ajung la contact@, cu „Răspuns la" = omul, cu tot ce a scris;
//   2. capcana pentru roboți nu trimite nimic; un email care nu pleacă nu pierde cererea;
//   3. pe site nu e niciun telefon public.
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 3539, TCP = 5539;
const DIR = path.join(os.tmpdir(), 'rax_formular_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    primite.push({ cale: req.url, corp: j });
    if (req.url === '/v3/account') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"email":"cont@ratrack.ro"}'); }
    if (/EROARE/.test(j.subject || '')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":"invalid_parameter","message":"refuzat"}'); }
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' }));
  });
});
let srv = null, mort = false;
const trimise = () => primite.filter((p) => p.cale === '/v3/smtp/email');
const asteapta = async (cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { const v = cond(); if (v) return v; await sleep(50); } return null; };
const formular = async (corp) => {
  const r = await fetch(B + '/api/public/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ consent: true, ts: Date.now() - 8000 }, corp)) });
  let d = null; try { d = await r.json(); } catch (e) {}
  return { s: r.status, d };
};

(async () => {
  try {
    await new Promise((r) => fals.listen(0, '127.0.0.1', r));
    const env = Object.assign({}, process.env, { NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_formular', DEMO_DISABLED: 'true',
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email',
      EMAIL_FROM: 'RA Track <noreply@ratrack.ro>', BASE_URL: 'http://127.0.0.1:' + PORT });
    for (const k of ['DATABASE_URL', 'SUPPORT_EMAIL', 'DEMO_REQUEST_EMAIL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_FROM']) delete env[k];
    srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'ignore'] });
    srv.on('exit', () => { mort = true; });
    let gata = false;
    for (let i = 0; i < 240 && !mort; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) { gata = true; break; } } catch (e) {} await sleep(250); }
    if (!gata) throw new Error('serverul n-a pornit');

    sect('1. Mesajul și cererea de cont demo ajung la contact@');
    let r = await formular({ name: 'Maria Pop', company: 'Transport Pop SRL', email: 'maria@transportpop.ro', phone: '0700 111 222', message: 'Am 12 camioane. Ce oferte aveți?', wants_demo: false });
    T('vizitatorul primește „ok”', r.s === 200 && r.d && r.d.ok === true, JSON.stringify(r));
    let m = await asteapta(() => trimise().find((x) => /Mesaj din site/.test(x.corp.subject || '')));
    T('emailul pleacă, deși SUPPORT_EMAIL nu e setat', !!m);
    if (m) {
      T('la contact@ratrack.ro (noreply@ nu primește nimic)', (m.corp.to || []).length === 1 && m.corp.to[0].email === 'contact@ratrack.ro', JSON.stringify(m.corp.to));
      T('„Răspunde” ajunge la cel care a scris', m.corp.replyTo && m.corp.replyTo.email === 'maria@transportpop.ro', JSON.stringify(m.corp.replyTo));
      T('subiectul spune firma', /Transport Pop SRL/.test(m.corp.subject), m.corp.subject);
      const text = String(m.corp.textContent || '') + String(m.corp.htmlContent || '');
      T('are tot ce a scris omul', ['Maria Pop', 'Transport Pop SRL', 'maria@transportpop.ro', '0700 111 222', 'Am 12 camioane'].every((x) => text.indexOf(x) >= 0), text.slice(0, 300));
    }
    r = await formular({ name: 'Ion Rus', company: '', email: 'ion@rus.ro', message: 'Vreau să văd aplicația.', wants_demo: true });
    m = await asteapta(() => trimise().find((x) => /Cerere de cont demo/.test(x.corp.subject || '')));
    T('cererea de cont demo pleacă și ea', !!m && m.corp.to[0].email === 'contact@ratrack.ro' && m.corp.replyTo.email === 'ion@rus.ro');
    T('fără firmă, subiectul spune numele', !!m && /Ion Rus/.test(m.corp.subject), m && m.corp.subject);
    T('spune de unde se aprobă', !!m && /Cereri demo/.test(String(m.corp.textContent || '') + String(m.corp.htmlContent || '')));

    sect('2. Roboții nu trimit nimic; un email care nu pleacă nu pierde cererea');
    const inainte = trimise().length;
    r = await formular({ name: 'Bot', email: 'bot@spam.ro', message: 'x', website: 'http://spam' });
    T('capcana: răspunde „ok”, ca robotul să nu reîncerce', r.s === 200);
    r = await formular({ name: 'Bot2', email: 'bot2@spam.ro', message: 'x', ts: Date.now() });
    T('completat instant: răspunde „ok”', r.s === 200);
    await sleep(400);
    T('niciunul nu trimite email', trimise().length === inainte, trimise().length - inainte);
    r = await formular({ name: 'Ana', company: 'EROARE SRL', email: 'ana@eroare.ro', message: 'Brevo refuză acest email.' });
    T('vizitatorul primește „ok” și când emailul e refuzat', r.s === 200 && r.d.ok === true);
    await asteapta(() => trimise().find((x) => /EROARE/.test(x.corp.subject || '')));
    const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
    const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
    const lst = await (await fetch(B + '/api/admin/demo-requests', { headers: { Cookie: ck } })).json();
    const randuri = Array.isArray(lst) ? lst : (lst.requests || lst.rows || []);
    T('toate trei sunt în „Cereri demo”, și cea cu emailul refuzat', ['maria@transportpop.ro', 'ion@rus.ro', 'ana@eroare.ro'].every((e) => randuri.some((x) => x.email === e)), JSON.stringify(randuri.map((x) => x.email)));
    T('roboții nu sunt', !randuri.some((x) => /spam\.ro/.test(x.email)));

    sect('3. Pe site nu e niciun telefon public');
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const pagini = Array.from(src.matchAll(/fisier: '([a-z0-9-]+\.html)'/g)).map((x) => x[1]);
    T('lista paginilor publice s-a citit', pagini.length >= 8, pagini.join());
    for (const p of pagini) {
      const h = fs.readFileSync(path.join(__dirname, 'public', p), 'utf8');
      T(p + ': fără link de telefon, fără număr scris', !/href="tel:|fa-phone|\+40 ?7|\b07\d{2}[ .]?\d{3}[ .]?\d{3}\b/.test(h));
    }
    const land = fs.readFileSync(path.join(__dirname, 'public/landing.html'), 'utf8');
    T('prima pagină are emailul de contact', /mailto:contact@ratrack\.ro/.test(land));
    T('formularul cere telefonul omului (e al lui, nu al nostru)', /id="cf-phone"/.test(land));
  } catch (e) { rele++; console.log('  ✗ proba a crăpat: ' + (e && e.message)); }
  try { if (srv) srv.kill(); } catch (e) {}
  try { fals.close(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
