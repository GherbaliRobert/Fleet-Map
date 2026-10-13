// verify_mail_raspuns.js — panoul Mail, 13.10 (Robert: „vreau să facem și un template de mail cu logo, vreau să putem face și
// forward, reply la mail, reply all, ștergere"; apoi „1, b · 2 da pentru robert 0729699847, trebuie să avem în fișă numărul de
// telefon · 3. da · 4. da").
//
//   node verify_mail_raspuns.js
//
// Ce păzește:
//   1. chenarul casei (mailer.js): sigla pe bandă închisă + linia verde + rândul cu ratrack.ro, pe TOATE emailurile care pleacă
//      din aplicație (text sau HTML); emailul care își are deja sigla (factura) nu-l primește a doua oară; la Brevo sigla se
//      cere de pe site (nu cid, nu ca atașament);
//   2. semnătura: numele și telefonul din fișa omului (pe adresa personală), „Echipa RA Track" pe cea comună; pusă sub textul
//      omului și DEASUPRA mesajului citat / redirecționat;
//   3. „Răspunde tuturor": Cc = toți din „Către" și „Cc", fără adresele noastre, fără expeditor, fără dubluri;
//   4. „Redirecționează": un email primit (cu atașamentele lui păstrate) sau unul trimis (doar textul), „Fwd:" o dată;
//   5. „Șterge" în „Trimise": doar emailurile scrise de mână (merg în Coș — vezi verify_mail_dosare.js); facturile,
//      contractele, invitațiile rămân; ale altuia — 404;
//   6. pagina și telefonul: aceleași rute, butoanele, semnătura arătată sub mesaj.
// Nu pleacă niciun email adevărat: totul ajunge la un Brevo FALS, local; emailurile primite sunt făcute aici, ca de la Cloudflare.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 700) : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  // ─── 1–4. Regulile ───────────────────────────────────────────────────────────────────────────────
  console.log('1. Chenarul și semnătura (mailer.js)');
  process.env.BASE_URL = 'https://ratrack.ro';
  const mailer = require('./mailer');
  const mp = require('./mail_primit');
  const c = mailer.cadru('<p>Bună ziua</p>');
  T('chenarul: sigla (cid), bandă închisă cu linia verde, conținutul pe alb, rândul cu ratrack.ro',
    /<img src="cid:logo@ratrack\.ro" width="180" height="35" alt="RA Track"/.test(c) && /background:#0B0E11/.test(c) && /border-bottom:3px solid #3FE07D/.test(c) &&
    /background:#ffffff[^"]*">\s*<p>Bună ziua<\/p>/.test(c) && /<a href="https:\/\/ratrack\.ro"[^>]*>ratrack\.ro<\/a>/.test(c), c.slice(0, 200));
  let m = mailer._cuCadru({ to: 'a@b.ro', subject: 's', text: 'Linkul: https://ratrack.ro/x?a=1&b=2' });
  T('un email doar text primește chenarul (cu textul păstrat și linkul apăsabil) și sigla ca imagine din corp',
    /cid:logo@ratrack\.ro/.test(m.html) && /white-space:pre-wrap/.test(m.html) && m.html.indexOf('<a href="https://ratrack.ro/x?a=1&amp;b=2">') >= 0 &&
    (m.attachments || []).some((a) => a.cid === 'logo@ratrack.ro' && /logo\.png$/.test(a.path)));
  m = mailer._cuCadru({ to: 'a@b.ro', subject: 's', html: '<p>Contractul</p>' });
  T('un email HTML fără siglă (contractele, avertismentele) primește chenarul', /background:#0B0E11/.test(m.html) && /<p>Contractul<\/p>/.test(m.html));
  const factura = '<div><img src="cid:logo@ratrack.ro" alt="RA Track"><h2>Factura RAT-1</h2></div>';
  T('emailul care își are deja sigla (factura) NU primește chenarul a doua oară; `cadru: false` îl oprește',
    mailer._cuCadru({ to: 'a@b.ro', html: factura }).html === factura && mailer._cuCadru({ to: 'a@b.ro', text: 'x', cadru: false }).html === undefined);
  const srvSrc = citeste('server.js');
  T('…iar emailul cu factura chiar are sigla (cid:logo@ratrack.ro), deci rămâne cu antetul lui', /'<img src="cid:' \+ EMAIL_LOGO\.cid \+ '"/.test(srvSrc) && /cid: 'logo@ratrack\.ro'/.test(srvSrc));
  const pb = mailer._pentruBrevo(mailer._cuCadru({ to: 'a@b.ro', cc: 'c@d.ro, e@f.ro', subject: 's', text: 'x', attachments: [{ filename: 'f.pdf', content: Buffer.from('%PDF') }] }));
  T('la Brevo: sigla cerută de pe site, nu cid și nu ca atașament; Cc-ul trimis separat',
    /src="https:\/\/ratrack\.ro\/logo\.png"/.test(pb.htmlContent) && !/cid:/.test(pb.htmlContent) && pb.attachment.map((a) => a.name).join(',') === 'f.pdf' &&
    JSON.stringify(pb.cc) === JSON.stringify([{ email: 'c@d.ro' }, { email: 'e@f.ro' }]), JSON.stringify({ cc: pb.cc, at: pb.attachment.map((a) => a.name) }));
  let s = mailer.semnatura({ nume: 'Robert Gherbali', functie: 'Director general', telefon: '0729699847', email: 'Robert.Gherbali@ratrack.ro' });
  T('semnătura pe adresa personală (Robert, 13.10: „și funcția și adresa de mail"): numele; funcția · RA Track; adresa · ratrack.ro; telefonul pe grupe',
    s.text === '\n\n--\nRobert Gherbali\nDirector general · RA Track\nrobert.gherbali@ratrack.ro · ratrack.ro\nTel. 0729 699 847' &&
    s.rand === 'Robert Gherbali · Director general · RA Track · robert.gherbali@ratrack.ro · ratrack.ro · Tel. 0729 699 847' &&
    /<b style="color:#1a2235;">Robert Gherbali<\/b><br>Director general · RA Track<br><a href="mailto:robert\.gherbali@ratrack\.ro"/.test(s.html) && /Tel\. 0729 699 847/.test(s.html), JSON.stringify(s));
  s = mailer.semnatura({ nume: 'Echipa RA Track', email: 'contact@ratrack.ro' });
  T('pe adresa comună: „Echipa RA Track · contact@ratrack.ro · ratrack.ro", fără funcție și fără telefon',
    s.rand === 'Echipa RA Track · contact@ratrack.ro · ratrack.ro' && !/Tel\./.test(s.text), s.rand);
  T('fără funcție / telefon în fișă: rândurile lor lipsesc; un telefon scris altfel rămâne cum e',
    mailer.semnatura({ nume: 'Alin Tîlvar', email: 'alin.tilvar@ratrack.ro' }).rand === 'Alin Tîlvar · RA Track · alin.tilvar@ratrack.ro · ratrack.ro' &&
    mailer.semnatura({ nume: 'X', telefon: '+40 729 699 847' }).rand === 'X · RA Track · ratrack.ro · Tel. +40 729 699 847');
  T('numele, funcția și adresa se scriu curățate în HTML', /&lt;script&gt;/.test(mailer.semnatura({ nume: '<script>' }).html) &&
    /&lt;b&gt;/.test(mailer.semnatura({ nume: 'X', functie: '<b>' }).html) && !/<b>/.test(mailer.semnatura({ nume: 'X', functie: '<b>' }).html.replace(/<b style/g, '')));
  const semn = mailer.semnatura({ nume: 'Robert Gherbali', functie: 'Director general', telefon: '0729699847', email: 'robert.gherbali@ratrack.ro' });
  const citatX = '\n\nPe 12.10.2026, la 11:30, Ion <ion@x.ro> a scris:\n> Bună ziua\n> Aveți oferte?';
  let cs = mailer.cuSemnatura('Mulțumim, revin azi.' + citatX, citatX, semn);
  T('semnătura sub textul omului și DEASUPRA mesajului citat (text și HTML)',
    cs.text === 'Mulțumim, revin azi.' + semn.text + '\n\n' + citatX.trim() && cs.html.indexOf('Robert Gherbali') < cs.html.indexOf('a scris:') &&
    /border-left:3px solid #e2e8f0/.test(cs.html), JSON.stringify(cs.text));
  cs = mailer.cuSemnatura('Mulțumim.\n\n(am scurtat citatul)', citatX, semn);
  T('citatul schimbat de om: semnătura merge la capăt', cs.text === 'Mulțumim.\n\n(am scurtat citatul)' + semn.text, JSON.stringify(cs.text));

  console.log('\n2. „Răspunde tuturor" și „Redirecționează" (mail_primit.js)');
  T('adresele dintr-un antet', JSON.stringify(mp.adreseDin('"Ion Pop" <Ion@X.ro>, b@y.ro; Contact <contact@ratrack.ro>')) === JSON.stringify(['ion@x.ro', 'b@y.ro', 'contact@ratrack.ro']));
  const primit = { catre: 'contact@ratrack.ro', de_la: 'sef@client.ro', de_nume: 'Șef', subiect: 'Oferta', text: 'Bună ziua', primit_la: new Date(Date.UTC(2026, 9, 12, 8, 30)),
    antet_catre: 'contact@ratrack.ro, Ana <ana@client.ro>', antet_cc: 'robert.gherbali@ratrack.ro, ana@client.ro, sef@client.ro, contabil@client.ro' };
  const rt = mp.pentruRaspunsTuturor(primit, ['contact@ratrack.ro', 'robert.gherbali@ratrack.ro', 'alin.tilvar@ratrack.ro']);
  T('Răspunde tuturor: la expeditor, iar în Cc ceilalți — fără adresele noastre, fără expeditor, fără dubluri',
    rt.catre === 'sef@client.ro' && rt.cc === 'ana@client.ro, contabil@client.ro' && rt.de_la === 'contact@ratrack.ro' && rt.subiect === 'Re: Oferta' && /a scris:\n> Bună ziua/.test(rt.text), JSON.stringify(rt));
  T('…cu adresa de răspuns a omului, dacă a pus una', mp.pentruRaspunsTuturor(Object.assign({}, primit, { raspuns_catre: 'birou@client.ro' }), ['contact@ratrack.ro']).catre === 'birou@client.ro');
  T('…și fără nimeni în plus: Cc gol (ecranul nu arată butonul)', mp.pentruRaspunsTuturor({ catre: 'contact@ratrack.ro', de_la: 'a@b.ro', antet_catre: 'contact@ratrack.ro', text: 'x' }, ['contact@ratrack.ro']).cc === '');
  T('„Fwd:" o singură dată', mp.subiectRedirectionare('Oferta') === 'Fwd: Oferta' && mp.subiectRedirectionare('Fwd: Oferta') === 'Fwd: Oferta' && mp.subiectRedirectionare('FW: x') === 'FW: x' && mp.subiectRedirectionare('') === 'Fwd: (fără subiect)');
  const rd = mp.pentruRedirectionare(primit);
  T('redirecționarea unui email primit: de pe adresa pe care a venit, cu antetul mesajului și textul lui',
    rd.de_la === 'contact@ratrack.ro' && rd.catre === '' && rd.subiect === 'Fwd: Oferta' &&
    rd.text === '\n\n---------- Mesaj redirecționat ----------\nDe la: Șef <sef@client.ro>\nData: 12.10.2026, la 11:30\nSubiect: Oferta\nCătre: contact@ratrack.ro, Ana <ana@client.ro>\nCc: robert.gherbali@ratrack.ro, ana@client.ro, sef@client.ro, contabil@client.ro\n\nBună ziua', JSON.stringify(rd.text));
  const rdt = mp.pentruRedirectionareTrimis({ de_la: 'robert.gherbali@ratrack.ro', catre: 'x@y.ro', cc: null, subiect: 'Re: Oferta', text: null, html: '<p>Textul <b>nostru</b></p>', creat_la: new Date(Date.UTC(2026, 9, 13, 7, 0)) });
  T('…și a unui email trimis (textul din HTML, dacă n-are text)', rdt.de_la === 'robert.gherbali@ratrack.ro' && rdt.subiect === 'Fwd: Re: Oferta' && /\nCătre: x@y\.ro\n\nTextul nostru$/.test(rdt.text), JSON.stringify(rdt.text));
  T('un mesaj redirecționat foarte lung se taie la ' + mp.REDIR_MAX + ' de caractere', mp.blocRedirectionat({ text: 'cuvânt '.repeat(10000) }).length < mp.REDIR_MAX + 400);

  // ─── 5. Pagina și telefonul ────────────────────────────────────────────────────────────────────────
  console.log('\n3. Pagina și telefonul');
  const PAG = citeste('public/index.html');
  const a = PAG.indexOf('// ── începe „Panoul Mail"'), b = PAG.indexOf('// ── sfârșit „Panoul Mail" ──');
  const BLOC = a > 0 && b > a ? PAG.slice(a, b) : '';
  T('pagina: butoanele noi pe emailul primit (Răspunde tuturor doar cu cineva în plus) și pe cel trimis (Șterge doar unde spune serverul)',
    /m\.pentruRaspunsTuturor && m\.pentruRaspunsTuturor\.cc \? '<button class="rax-btn" onclick="raxMailRaspundeTuturor\(\)"/.test(BLOC) &&
    /onclick="raxMailRedirectioneaza\(\\'primit\\'\)"/.test(BLOC) && /onclick="raxMailRedirectioneaza\(\\'trimis\\'\)"/.test(BLOC) &&
    /\(m\.sePoateSterge \? '<button class="rax-btn" onclick="raxMailStergeTrimis\(/.test(BLOC));
  T('pagina: Cc, redirecționarea și semnătura (scrisă de server) în fereastra de scris',
    /corp\.redirectioneazaPrimit = _mail\.redir\.primit/.test(BLOC) && /corp\.redirectioneazaTrimis = _mail\.redir\.trimis/.test(BLOC) && /cc: \$\('mail-cc'\)\.value/.test(BLOC) &&
    /Semnătura se adaugă singură: <b>' \+ esc\(a\.semnatura/.test(BLOC) && /window\.raxMailStergeTrimis = function \(id\) \{ raxMailActiune\('sterge', \[\{ sursa: 'trimis', id: Number\(id\) \}\]\); \};/.test(BLOC));
  T('pagina nu-și scrie nici semnătura, nici „Fwd:" (le dă serverul)', !/'Fwd: '|Echipa RA Track|0729/.test(BLOC));
  const MOB = citeste('mobile/src/screens/Mail.tsx'), EP = citeste('mobile/src/api/endpoints.ts');
  T('telefonul: aceleași butoane și aceeași fereastră de scris (Cc, redirecționarea, semnătura)',
    /deschis\.pentruRaspunsTuturor\?\.cc \? <button/.test(MOB) && /onClick=\{\(\) => redirectioneaza\(\)\}/.test(MOB) &&
    /deschis\.sePoateSterge \? <button class="btn" onClick=\{\(\) => actiune\('sterge', \[\{ sursa: 'trimis', id: Number\(deschis\.id\) \}\]\)\}/.test(MOB) &&
    /redirectioneazaPrimit: redir\.primit/.test(MOB) && /redirectioneazaTrimis: redir\.trimis/.test(MOB) && /Semnătura se adaugă singură: <b/.test(MOB) && /a\.semnatura/.test(MOB));
  T('telefonul: ștergerea unui email trimis trece prin ruta acțiunilor (în Coș), ca pe web',
    /mailActiune: \(actiune: string, elemente: \{ sursa: string; id: number \}\[\]\) => api<[^>]*>\('\/api\/mail\/actiune', \{ method: 'POST', body: \{ actiune, elemente \} \}\)/.test(EP) && !/mailStergeTrimis/.test(EP + MOB));
  T('telefonul nu-și scrie nici semnătura, nici „Fwd:"', !/'Fwd: '|Echipa RA Track|0729/.test(MOB));
  T('serverul: ce se poate șterge din „Trimise" stă într-o singură listă (rândul, ruta veche, acțiunea)', /const MAIL_TRIMISE_STERGIBILE = \['mesaj', 'raspuns', 'redirectionat'\];/.test(srvSrc) &&
    (srvSrc.match(/MAIL_TRIMISE_STERGIBILE\.indexOf/g) || []).length === 3 && (srvSrc.match(/\['mesaj', 'raspuns'/g) || []).length === 1);

  // ─── Server pornit ─────────────────────────────────────────────────────────────────────────────────
  const primite = [];
  const fals = http.createServer((req, res) => {
    let x = ''; req.on('data', (ch) => { x += ch; });
    req.on('end', () => { let j = {}; try { j = JSON.parse(x || '{}'); } catch (e) {} primite.push({ cale: req.url, corp: j });
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' })); });
  });
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const PORT = 3343, B = 'http://127.0.0.1:' + PORT, SECRET = 'o-parola-lunga-de-proba-raspuns-2026';
  const DIR = path.join(os.tmpdir(), 'rax_mailr_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_mailr', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: '5343', PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email',
    EMAIL_FROM: 'RA Track <contact@ratrack.ro>', MAIL_INBOUND_SECRET: SECRET, BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'NOTIFY_EMAIL_TO', 'SUPPORT_EMAIL']) delete env[k];
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { fals.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800); };
  srv.on('exit', (cod) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + cod + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const login = async (u, p) => {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
  };
  const json = async (meth, u, ck, body) => {
    const x = await fetch(B + u, { method: meth, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: x.status, j: j || {} };
  };
  const contNou = async (S, corp, parola) => {
    const n0 = primite.length;
    const r = await json('POST', '/api/users', S, corp);
    for (let i = 0; i < 25 && !primite.slice(n0).some((x) => x.corp.to && x.corp.to[0].email === corp.username); i++) await sleep(200);
    const inv = primite.slice(n0).filter((x) => x.corp.to && x.corp.to[0].email === corp.username)[0];
    const tok = inv && (String(inv.corp.textContent || '').match(/token=([A-Za-z0-9_-]+)/) || [])[1];
    if (!tok) throw new Error('fără invitație pentru ' + corp.username + ': ' + JSON.stringify(r.j).slice(0, 200));
    const p = await fetch(B + '/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: parola }) });
    if (!p.ok) throw new Error('set-password: ' + p.status);
    return { u: r.j, invitatie: inv.corp };
  };
  // Un email brut, ca de la Cloudflare Worker.
  const PDF = Buffer.from('%PDF-1.4 comanda semnata').toString('base64');
  let nr = 0;
  const mime = (o) => {
    const g = 'g' + (++nr);
    const L = ['From: ' + o.from, 'To: ' + o.to];
    if (o.cc) L.push('Cc: ' + o.cc);
    L.push('Subject: ' + o.subiect, 'Message-ID: <r' + nr + '.' + Date.now() + '@client.ro>', 'Date: Tue, 13 Oct 2026 07:30:00 +0000', 'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + g + '"', '', '--' + g, 'Content-Type: text/plain; charset=utf-8', '', o.text);
    (o.atas || []).forEach((x) => L.push('--' + g, 'Content-Type: application/pdf; name="' + x + '"', 'Content-Disposition: attachment; filename="' + x + '"', 'Content-Transfer-Encoding: base64', '', PDF));
    L.push('--' + g + '--', '');
    return Buffer.from(L.join('\r\n'), 'utf8');
  };
  const primeste = async (raw, catre) => {
    const x = await fetch(B + '/api/mail/primeste', { method: 'POST', headers: { 'Content-Type': 'message/rfc822', 'X-RA-Secret': SECRET, 'X-RA-Catre': catre }, body: raw });
    let j = {}; try { j = await x.json(); } catch (e) {}
    return { status: x.status, j: j };
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    console.log('\n4. Pe server pornit, cu Brevo-ul fals');
    const S = await login('admin', 'test1234');
    const rob = await contNou(S, { username: 'robert.gherbali@ratrack.ro', email: 'robert.gherbali@ratrack.ro', full_name: 'Robert Gherbali', role: 'superadmin', phone: '0729699847' }, 'Strada-Verde-2026x');
    await contNou(S, { username: 'alin.tilvar@ratrack.ro', email: 'alin.tilvar@ratrack.ro', full_name: 'Alin Tîlvar', role: 'superadmin' }, 'Strada-Rosie-2026x');
    const R = await login('robert.gherbali@ratrack.ro', 'Strada-Verde-2026x');
    const A = await login('alin.tilvar@ratrack.ro', 'Strada-Rosie-2026x');
    T('pregătire: doi fondatori pe ratrack.ro (Robert cu telefonul în fișă), autentificați', !!(R && A));
    T('invitația (un email al aplicației, doar text) pleacă în chenarul casei, cu sigla de pe site și linkul apăsabil',
      /src="https:\/\/ratrack\.ro\/logo\.png"/.test(rob.invitatie.htmlContent || '') && /background:#0B0E11/.test(rob.invitatie.htmlContent || '') &&
      /<a href="https:\/\/ratrack\.ro\/set-password\.html\?token=/.test(rob.invitatie.htmlContent || '') && !(rob.invitatie.attachment || []).length, String(rob.invitatie.htmlContent || '').slice(0, 300));
    const fR = await json('PUT', '/api/me/profile', R, { functie: 'Director general' });
    T('Robert își pune funcția din Contul meu', fR.status === 200 && fR.j.functie === 'Director general', JSON.stringify(fR.j));
    const adrR = (await json('GET', '/api/mail/adrese', R)).j.adrese || [], adrA = (await json('GET', '/api/mail/adrese', A)).j.adrese || [];
    const per = (l, e) => l.filter((x) => x.adresa === e)[0] || {};
    T('panoul arată semnătura fiecărei adrese: Robert cu funcția, adresa și telefonul din fișă, comuna „Echipa RA Track · contact@…"; Alin fără funcție și telefon — i se spune de unde le pune',
      per(adrR, 'robert.gherbali@ratrack.ro').semnatura === 'Robert Gherbali · Director general · RA Track · robert.gherbali@ratrack.ro · ratrack.ro · Tel. 0729 699 847' &&
      per(adrR, 'robert.gherbali@ratrack.ro').faraTelefon === false && per(adrR, 'robert.gherbali@ratrack.ro').faraFunctie === false &&
      per(adrR, 'contact@ratrack.ro').semnatura === 'Echipa RA Track · contact@ratrack.ro · ratrack.ro' &&
      per(adrA, 'alin.tilvar@ratrack.ro').faraTelefon === true && per(adrA, 'alin.tilvar@ratrack.ro').faraFunctie === true, JSON.stringify(adrR));

    let n0 = primite.length;
    const s1 = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: 'sef@client.ro', subiect: 'Oferta RA Track', text: 'Bună ziua,\nvă trimit oferta.',
      atasamente: [{ nume: 'Oferta.pdf', b64: PDF }] });
    const e1 = (primite[n0] || {}).corp || {};
    T('un email scris de Robert: în chenar, cu semnătura lui (numele, funcția, adresa, telefonul) sub text — în HTML și în text',
      s1.status === 200 && /background:#0B0E11/.test(e1.htmlContent || '') && /Robert Gherbali<\/b><br>Director general · RA Track/.test(e1.htmlContent || '') &&
      /mailto:robert\.gherbali@ratrack\.ro/.test(e1.htmlContent || '') && /Tel\. 0729 699 847/.test(e1.htmlContent || '') &&
      e1.textContent === 'Bună ziua,\nvă trimit oferta.\n\n--\nRobert Gherbali\nDirector general · RA Track\nrobert.gherbali@ratrack.ro · ratrack.ro\nTel. 0729 699 847' && !e1.cc, JSON.stringify({ st: s1.status, t: e1.textContent }));

    // Un email primit pe contact@, cu oameni în Cc (unul e Robert, unul e chiar expeditorul) și un atașament.
    const pr = await primeste(mime({ from: 'Șef Client <sef@client.ro>', to: 'contact@ratrack.ro, Ana <ana@client.ro>', cc: 'robert.gherbali@ratrack.ro, sef@client.ro, contabil@client.ro',
      subiect: 'Comanda semnata', text: 'Vă trimit comanda semnată.', atas: ['Comanda.pdf'] }), 'contact@ratrack.ro');
    const dP = await json('GET', '/api/mail/primite/' + pr.j.id, A);
    const prt = dP.j.pentruRaspunsTuturor || {}, prd = dP.j.pentruRedirectionare || {};
    T('emailul primit, deschis: „Răspunde tuturor" la expeditor, cu Ana și contabilul în Cc (fără noi și fără expeditor)',
      pr.status === 200 && dP.status === 200 && prt.catre === 'sef@client.ro' && prt.cc === 'ana@client.ro, contabil@client.ro' && prt.subiect === 'Re: Comanda semnata', JSON.stringify(prt).slice(0, 300));
    T('…și „Redirecționează", cu atașamentul care merge mai departe', prd.subiect === 'Fwd: Comanda semnata' && prd.de_la === 'contact@ratrack.ro' &&
      JSON.stringify((prd.atasamente || []).map((x) => x.nume)) === '["Comanda.pdf"]' && /---------- Mesaj redirecționat ----------\nDe la: Șef Client <sef@client.ro>/.test(prd.text || ''), JSON.stringify(prd).slice(0, 300));

    n0 = primite.length;
    const rt2 = await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: prt.catre, cc: prt.cc, subiect: prt.subiect, text: 'Am primit-o, mulțumim!' + prt.text, raspunsLa: pr.j.id });
    const e2 = (primite[n0] || {}).corp || {};
    const t2 = String(e2.textContent || '');
    T('„Răspunde tuturor" pleacă: la expeditor, cu Cc-ul, semnătura echipei DEASUPRA mesajului citat',
      rt2.status === 200 && e2.to && e2.to[0].email === 'sef@client.ro' && JSON.stringify(e2.cc) === JSON.stringify([{ email: 'ana@client.ro' }, { email: 'contabil@client.ro' }]) &&
      t2.indexOf('Am primit-o, mulțumim!\n\n--\nEchipa RA Track\ncontact@ratrack.ro · ratrack.ro') === 0 && t2.indexOf('Echipa RA Track') < t2.indexOf('a scris:') &&
      (e2.htmlContent || '').indexOf('Echipa RA Track') < (e2.htmlContent || '').indexOf('a scris:'), JSON.stringify({ st: rt2.status, j: rt2.j, cc: e2.cc, t: t2.slice(0, 160) }));
    const lista = (await json('GET', '/api/mail/trimise', A)).j.mailuri || [];
    const rand2 = lista.filter((x) => x.subiect === 'Re: Comanda semnata')[0] || {};
    T('în „Trimise": răspunsul cu Cc-ul lui', rand2.fel === 'raspuns' && rand2.cc === 'ana@client.ro, contabil@client.ro', JSON.stringify(rand2).slice(0, 250));

    n0 = primite.length;
    const fw = await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'contabilitate@noi.ro', subiect: prd.subiect, text: 'Pentru dosar.' + prd.text, redirectioneazaPrimit: pr.j.id });
    const e3 = (primite[n0] || {}).corp || {};
    T('„Redirecționează" un email primit: pleacă cu atașamentul lui, „Fwd:", semnătura deasupra mesajului redirecționat',
      fw.status === 200 && e3.subject === 'Fwd: Comanda semnata' && JSON.stringify((e3.attachment || []).map((x) => x.name)) === '["Comanda.pdf"]' &&
      Buffer.from((e3.attachment || [{}])[0].content || '', 'base64').toString() === '%PDF-1.4 comanda semnata' &&
      String(e3.textContent || '').indexOf('Echipa RA Track') < String(e3.textContent || '').indexOf('Mesaj redirecționat'), JSON.stringify({ st: fw.status, j: fw.j, s: e3.subject }));
    const lista2 = (await json('GET', '/api/mail/trimise', A)).j.mailuri || [];
    const rand3 = lista2.filter((x) => x.subiect === 'Fwd: Comanda semnata')[0] || {};
    T('în „Trimise": felul „Redirecționat", cu atașamentul (numele)', rand3.fel === 'redirectionat' && rand3.felText === 'Redirecționat' && (rand3.atasamente || [])[0].nume === 'Comanda.pdf', JSON.stringify(rand3).slice(0, 250));

    const mesajR = ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).filter((x) => x.subiect === 'Oferta RA Track')[0] || {};
    const dT = await json('GET', '/api/mail/trimise/' + mesajR.id, R);
    T('emailul trimis, deschis: „Redirecționează" (doar textul — atașamentele trimise nu se păstrează) și „Șterge" (e scris de mână)',
      dT.j.pentruRedirectionare && dT.j.pentruRedirectionare.subiect === 'Fwd: Oferta RA Track' && dT.j.pentruRedirectionare.faraAtasamente === true && dT.j.sePoateSterge === true &&
      /\nDe la: robert\.gherbali@ratrack\.ro\n/.test(dT.j.pentruRedirectionare.text || ''), JSON.stringify(dT.j.pentruRedirectionare || {}).slice(0, 250));
    n0 = primite.length;
    const fw2 = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: 'alt@client.ro', subiect: dT.j.pentruRedirectionare.subiect, text: dT.j.pentruRedirectionare.text, redirectioneazaTrimis: mesajR.id });
    const e4 = (primite[n0] || {}).corp || {};
    T('„Redirecționează" un email trimis: pleacă fără atașamente, cu textul lui și semnătura', fw2.status === 200 && !(e4.attachment || []).length && /vă trimit oferta/.test(e4.textContent || '') &&
      /^--\nRobert Gherbali/.test(String(e4.textContent || '').trim()), JSON.stringify({ st: fw2.status, j: fw2.j, t: String(e4.textContent || '').slice(0, 120) }));
    const nuR = [await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'x@y.ro', subiect: 's', text: 't', redirectioneazaTrimis: mesajR.id }),
      await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'x@y.ro', subiect: 's', text: 't', redirectioneazaPrimit: 999999 })];
    T('nimeni nu redirecționează emailul altuia (al lui Robert, de pe adresa lui) și nici unul care nu există: 404', nuR.every((x) => x.status === 404), nuR.map((x) => x.status).join(','));
    const refuzuri = [await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'x@y.ro', subiect: 's', text: 't', raspunsLa: pr.j.id, redirectioneazaPrimit: pr.j.id }),
      await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'x@y.ro', cc: 'nu-e-adresa', subiect: 's', text: 't' }),
      await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'x@y.ro', cc: Array.from({ length: 20 }, (_, i) => 'om' + i + '@x.ro').join(','), subiect: 's', text: 't' })];
    T('refuzuri pe față: răspuns ȘI redirecționare deodată, Cc greșit, peste 20 de destinatari cu tot cu Cc (400)', refuzuri.every((x) => x.status === 400 && x.j.error), refuzuri.map((x) => x.status + ' ' + (x.j.error || '')).join(' | '));

    // „Șterge" în „Trimise".
    const invitatie = ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).filter((x) => x.fel === 'invitatie')[0] || {};
    const sI = await json('DELETE', '/api/mail/trimise/' + invitatie.id, R);
    const sStrain = await json('DELETE', '/api/mail/trimise/' + mesajR.id, A);
    T('invitația (email al aplicației) NU se șterge (403, cu motivul); emailul personal al lui Robert nu-l șterge Alin (404)',
      sI.status === 403 && /dovada/.test(sI.j.error || '') && sStrain.status === 404 && (await json('GET', '/api/mail/trimise/' + invitatie.id, R)).status === 200, sI.status + ' ' + sStrain.status);
    const sR = await json('DELETE', '/api/mail/trimise/' + mesajR.id, R);
    const dinCos = (await json('GET', '/api/mail/trimise/' + mesajR.id, R)).j;
    const inTrimise = ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).some((x) => x.id === mesajR.id);
    T('Robert își șterge emailul scris de mână: pleacă din „Trimise" în Coș (se poate recupera)',
      sR.status === 200 && dinCos.dosar === 'cos' && !inTrimise && /mutat în Coș/.test(sR.j.text || ''), JSON.stringify(sR.j) + ' ' + dinCos.dosar);
    const sDef = await json('DELETE', '/api/mail/trimise/' + mesajR.id + '?definitiv=1', R);
    T('…iar din Coș, „Șterge definitiv": nu mai există', sDef.status === 200 && (await json('GET', '/api/mail/trimise/' + mesajR.id, R)).status === 404, JSON.stringify(sDef.j));
    const sRasp = await json('DELETE', '/api/mail/trimise/' + rand2.id, A);
    const sRaspDef = await json('DELETE', '/api/mail/trimise/' + rand2.id + '?definitiv=1', A);
    const dupa = ((await json('GET', '/api/mail/primite', A)).j.mailuri || []).filter((x) => x.id === pr.j.id)[0] || {};
    T('șters definitiv răspunsul: emailul primit tot spune că i s-a răspuns (s-a întâmplat), doar legătura se golește',
      sRasp.status === 200 && sRaspDef.status === 200 && dupa.raspuns && /^Răspuns de Alin Tîlvar/.test(dupa.raspuns.text || ''), JSON.stringify(dupa.raspuns));
    const audit = (await json('GET', '/api/audit?limit=50', R)).j;
    const randuri = Array.isArray(audit) ? audit : (audit.rows || audit.items || []);
    T('ștergerea și ștergerea definitivă intră în jurnal (fără conținut)', JSON.stringify(randuri).indexOf('mail_sterge') >= 0 && JSON.stringify(randuri).indexOf('mail_definitiv') >= 0
      && JSON.stringify(randuri).indexOf(mesajR.subiect || '§§') < 0, JSON.stringify(randuri).slice(0, 200));
  } catch (e) { rele++; console.log('  ✗ eroare: ' + e.message); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})();
