// verify_email_brevo.js — emailul prin Brevo, pe HTTPS (Robert, 12.10: „am făcut contul, îl putem integra în ratrack?").
//
//   node verify_email_brevo.js
//
// Railway Hobby blochează SMTP, iar aplicația trimitea DOAR prin SMTP — deci nu pleca nimic: nici facturile, nici
// contractele, nici invitațiile. Ce păzește (cu un Brevo FALS, local — nu pleacă niciun email adevărat):
//   1. mailer.js: cu BREVO_API_KEY, emailul pleacă prin API-ul Brevo (cheia în antetul „api-key"), cu expeditorul,
//      destinatarii, adresa de răspuns, PDF-ul atașat în base64; textul simplu devine HTML cu linkurile apăsabile; sigla
//      „în corp" (cid) se cere de pe site, nu se atașează; o eroare Brevo se spune, nu aruncă; Brevo câștigă la SMTP;
//   2. O SINGURĂ cale: channels.js (invitații, linkuri de parolă, rapoarte programate, notificări) trimite prin mailer.js,
//      fără transport SMTP propriu; un email care n-a plecat aruncă (invitația arată atunci linkul pe ecran);
//   3. pe server pornit: invitația unui om nou pleacă prin Brevo, cu linkul de parolă; „Stare producție" spune „Brevo".
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// Brevo fals: ține minte cererile; subiectul cu „EROARE" primește 400, ca de la Brevo.
const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    primite.push({ metoda: req.method, cale: req.url, cheie: req.headers['api-key'], corp: j });
    if (req.url === '/v3/account') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"email":"cont@ratrack.ro"}'); }
    if (/EROARE/.test(j.subject || '')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":"invalid_parameter","message":"sender is invalid / inactive"}'); }
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' }));
  });
});

(async () => {
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';

  // ─── 1. mailer.js ──────────────────────────────────────────────────────────────────────────────────
  console.log('1. mailer.js trimite prin Brevo');
  for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_FROM', 'EMAIL_FROM', 'BASE_URL', 'NOTIFY_EMAIL_TO']) delete process.env[k];
  process.env.BREVO_API_KEY = 'xkeysib-proba-fara-retea';
  process.env.BREVO_API_URL = URL_FALS;
  const mailer = require('./mailer');
  T('cu BREVO_API_KEY (fără SMTP), emailul e pornit, pe calea Brevo', mailer.enabled() === true && mailer.fel() === 'brevo');
  T('expeditorul implicit: „RA Track <noreply@ratrack.ro>"', mailer.fromAddr() === 'RA Track <noreply@ratrack.ro>', mailer.fromAddr());

  const PDF = Buffer.from('%PDF-1.4 proba');
  let r = await mailer.send({ to: 'ana@firma.ro, ion@firma.ro', replyTo: 'Office RA Track <office@ratrack.ro>', subject: 'Factura RAT-2026-0001',
    text: 'Bună ziua,\nLinkul: https://ratrack.ro/set-password.html?token=abc&x=1\n— RA Track', attachments: [{ filename: 'RA-Track - Factură RAT-2026-0001.pdf', content: PDF }] });
  let c = primite[primite.length - 1];
  T('pleacă: răspunsul Brevo (201) dă id-ul mesajului', r.ok === true && /^<m\d+@smtp-brevo\.com>$/.test(r.id), JSON.stringify(r));
  T('cererea: POST pe /v3/smtp/email, cu cheia în antetul „api-key"', c.metoda === 'POST' && c.cale === '/v3/smtp/email' && c.cheie === 'xkeysib-proba-fara-retea');
  T('expeditor, destinatari (despărțiți la virgulă), adresa de răspuns',
    c.corp.sender && c.corp.sender.email === 'noreply@ratrack.ro' && c.corp.sender.name === 'RA Track' &&
    JSON.stringify(c.corp.to) === JSON.stringify([{ email: 'ana@firma.ro' }, { email: 'ion@firma.ro' }]) &&
    c.corp.replyTo && c.corp.replyTo.email === 'office@ratrack.ro' && c.corp.replyTo.name === 'Office RA Track', JSON.stringify(c.corp).slice(0, 300));
  T('PDF-ul atașat, cu numele lui și conținutul în base64', (c.corp.attachment || []).length === 1 && c.corp.attachment[0].name === 'RA-Track - Factură RAT-2026-0001.pdf' &&
    c.corp.attachment[0].content === PDF.toString('base64'));
  T('textul simplu devine HTML cu rândurile păstrate și linkul apăsabil (și textul simplu rămâne)',
    /white-space:pre-wrap/.test(c.corp.htmlContent) && c.corp.htmlContent.indexOf('<a href="https://ratrack.ro/set-password.html?token=abc&amp;x=1">') >= 0 &&
    /Linkul: https:\/\/ratrack\.ro/.test(c.corp.textContent), c.corp.htmlContent.slice(0, 200));

  const LOGO = { filename: 'logo.png', path: path.join(__dirname, 'public', 'logo.png'), cid: 'logo@ratrack.ro', contentType: 'image/png' };
  r = await mailer.send({ to: 'ana@firma.ro', subject: 'Cu sigla', html: '<div><img src="cid:logo@ratrack.ro" alt="RA Track"></div>', attachments: [{ filename: 'f.pdf', content: PDF }, LOGO] });
  c = primite[primite.length - 1];
  T('sigla „în corp" (cid) se cere de pe site (Brevo nu primește cid) și NU apare ca atașament',
    r.ok && /src="https:\/\/ratrack\.ro\/logo\.png"/.test(c.corp.htmlContent) && !/cid:/.test(c.corp.htmlContent) &&
    (c.corp.attachment || []).map((a) => a.name).join(',') === 'f.pdf', c.corp.htmlContent);

  r = await mailer.send({ to: 'ana@firma.ro', subject: 'EROARE de probă', text: 'x' });
  T('o eroare Brevo se spune (cu motivul lor), nu aruncă', r.ok === false && /Brevo 400: sender is invalid/.test(r.error), JSON.stringify(r));
  r = await mailer.send({ to: '  ', subject: 'fără', text: 'x' });
  T('fără destinatar: refuzat înainte să plece', r.ok === false);
  T('verificarea legăturii întreabă contul Brevo', (await mailer.verify()).ok === true && primite[primite.length - 1].cale === '/v3/account');

  process.env.EMAIL_FROM = 'Facturi RA Track <facturi@ratrack.ro>';
  await mailer.send({ to: 'ana@firma.ro', subject: 'Expeditor ales', text: 'x' });
  c = primite[primite.length - 1];
  T('EMAIL_FROM alege expeditorul', c.corp.sender.email === 'facturi@ratrack.ro' && c.corp.sender.name === 'Facturi RA Track', JSON.stringify(c.corp.sender));
  delete process.env.EMAIL_FROM;
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_USER = 'proba';
  T('cu Brevo ȘI SMTP setate, câștigă Brevo (SMTP e blocat pe Railway Hobby)', mailer.fel() === 'brevo');
  delete process.env.BREVO_API_KEY;
  T('fără Brevo, cu SMTP: calea SMTP, ca până acum', mailer.fel() === 'smtp' && mailer.enabled());
  delete process.env.SMTP_HOST; delete process.env.SMTP_USER;
  T('fără niciuna: emailul e oprit, send() spune de ce', mailer.enabled() === false && (await mailer.send({ to: 'a@b.ro', subject: 's', text: 't' })).ok === false);
  process.env.BREVO_API_KEY = 'xkeysib-proba-fara-retea';

  // ─── 2. O singură cale ──────────────────────────────────────────────────────────────────────────────
  console.log('\n2. O singură cale: channels.js trimite prin mailer.js');
  const CH = fs.readFileSync(path.join(__dirname, 'channels.js'), 'utf8');
  T('channels.js nu mai are transport SMTP propriu (nici nodemailer, nici createTransport)', !/nodemailer|createTransport|sendMail/.test(CH.replace(/\/\/.*$/gm, '')));
  const channels = require('./channels');
  T('invitațiile și rapoartele văd același „e email pe server?" ca facturile', channels.emailConfigured() === true);
  const n0 = primite.length;
  const okCh = await channels.sendEmailTo('dispecer@firma.ro', 'Invitație RA Track', 'Setează-ți parola:\nhttps://ratrack.ro/set-password.html?token=t1', [{ filename: 'raport.xlsx', content: Buffer.from('xlsx') }]);
  c = primite[primite.length - 1];
  T('un email din channels.js (invitație, raport) pleacă prin Brevo, cu atașamentul lui', okCh === true && primite.length === n0 + 1 &&
    c.corp.to[0].email === 'dispecer@firma.ro' && (c.corp.attachment || [])[0].name === 'raport.xlsx');
  let aruncat = null; try { await channels.sendEmailTo('dispecer@firma.ro', 'EROARE invitație', 't'); } catch (e) { aruncat = e.message; }
  T('un email care n-a plecat aruncă (invitația arată atunci linkul pe ecran)', /Brevo 400/.test(aruncat || ''), aruncat);
  process.env.NOTIFY_EMAIL_TO = 'noi@ratrack.ro';
  const dis = await channels.dispatchChannels({ title: 'Alertă', body: 'text', severity: 'warn' });
  T('notificările pe email (NOTIFY_EMAIL_TO) pleacă tot prin Brevo', dis.email === true && primite[primite.length - 1].corp.to[0].email === 'noi@ratrack.ro', JSON.stringify(dis));
  delete process.env.NOTIFY_EMAIL_TO;

  // ─── 3. Pe server pornit ────────────────────────────────────────────────────────────────────────────
  console.log('\n3. Pe server pornit, cu Brevo-ul fals');
  const PORT = 3330, TCP = 5330, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_brevo_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_brevo', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba-fara-retea', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <noreply@ratrack.ro>',
    BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'NOTIFY_EMAIL_TO']) delete env[k];
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { fals.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800); };
  srv.on('exit', (cod) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + cod + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const json = async (m, u, ck, body) => {
    const x = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: x.status, j: j || {}, t };
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
    const S = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Brevo SRL' })).j;
    const n1 = primite.length;
    const u = await json('POST', '/api/users', S, { username: 'sef@firma-brevo.ro', email: 'sef@firma-brevo.ro', full_name: 'Sef Brevo', role: 'admin', company_id: co.id });
    for (let i = 0; i < 20 && primite.length === n1; i++) await sleep(200);
    const inv = primite.slice(n1).filter((x) => x.corp && x.corp.to && x.corp.to[0] && x.corp.to[0].email === 'sef@firma-brevo.ro')[0];
    T('contul nou: invitația pleacă prin Brevo, cu linkul de parolă apăsabil', u.status === 200 && !!inv && inv.cheie === 'xkeysib-proba-fara-retea' &&
      /<a href="https:\/\/ratrack\.ro\/set-password\.html\?token=/.test(inv.corp.htmlContent), JSON.stringify({ st: u.status, r: u.j, n: primite.length - n1 }).slice(0, 300));
    T('…iar ecranul nu mai primește linkul de copiat (emailul a plecat)', !(u.j && u.j.link), JSON.stringify(u.j).slice(0, 200));
    const h = await json('GET', '/api/admin/health', S);
    T('„Stare producție": emailul e activ, prin Brevo, cu expeditorul', h.status === 200 && /activ — Brevo, de la RA Track <noreply@ratrack\.ro>/.test(h.t), h.t.slice(0, 200));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
