// verify_mail.js — panoul Mail al fondatorilor, etapa 1: „Trimise" + „Scrie" (Robert, 12.10: „noi adminii să avem un
// panou de mail"; „1 este ok" — adresa comună o văd toți, adresa personală doar omul ei; „și pe telefon").
//
//   node verify_mail.js
//
// Ce păzește (cu un Brevo FALS, local — nu pleacă niciun email adevărat), pe server pornit:
//   1. adresele: contact@ (comuna, din EMAIL_FROM) + adresa fiecărui fondator pe domeniu; fiecare vede comuna și pe A LUI;
//   2. „Scrie": pleacă prin Brevo de pe adresa aleasă, cu numele omului și răspunsul înapoi la ea; nimeni nu scrie de pe
//      adresa altuia; destinatari, subiect, mesaj și atașamente verificate pe server;
//   3. „Trimise": emailurile NOASTRE se scriu singure (invitațiile, mesajele scrise aici), cu felul lor; unul care n-a
//      plecat apare „n-a plecat", cu motivul; mesajul personal al unui fondator NU se vede la celălalt (nici în listă,
//      nici deschis: 404); rapoartele și alertele unei firme NU intră (nu ne uităm la ce face o companie);
//   4. doar fondatorii: un administrator de firmă primește 403; indicatorul de încărcare vine de la server;
//   5. pagina și telefonul: rândul „Mail" în meniu, același loc, aceleași rute, conținutul HTML în cadru izolat.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    primite.push({ cale: req.url, corp: j });
    if (/EROARE/.test(j.subject || '')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":"invalid_parameter","message":"recipient blocked"}'); }
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' }));
  });
});

(async () => {
  // ─── 5. Pagina și telefonul (fără server) ─────────────────────────────────────────────────────────
  console.log('5. Pagina și telefonul');
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  T('rândul „Mail" stă în Business, imediat după „Cereri demo", și cheamă goSistem(\'mail\')',
    /goSistem\('demoreq'\);[^\n]*\n\s*<button class="nav-item nav-sub" data-super onclick="navGo\(this, function\(\)\{ goSistem\('mail'\); \}\)"><i class="fas fa-envelope"><\/i><span>Mail<\/span>/.test(PAG));
  T('secțiunea e în listele unice (_RAX_TABURI / _RAX_NUME) și se deschide cu raxLoadMail',
    /mail: 'admin-tab-mail'/.test(PAG) && /mail: 'Mail'/.test(PAG) && /name === 'mail'\) \{\s*if \(window\.raxLoadMail\) window\.raxLoadMail\(\);/.test(PAG) && /<div id="admin-tab-mail"/.test(PAG));
  const BLOC = (PAG.match(/── începe „Panoul Mail"[\s\S]*?── sfârșit „Panoul Mail" ──/) || [''])[0];
  T('ecranul cere totul de la server (adrese, listă, deschidere, trimitere) — nu ține liste de adrese scrise de mână',
    /\/api\/mail\/adrese/.test(BLOC) && /\/api\/mail\/trimise/.test(BLOC) && /\/api\/mail\/trimite'/.test(BLOC) && !/ratrack\.ro/.test(BLOC));
  T('conținutul HTML al unui email se arată într-un cadru izolat (sandbox gol: fără scripturi)', /setAttribute\('sandbox', ''\)/.test(BLOC) && /f\.srcdoc = /.test(BLOC));
  T('căutarea redesenează doar lista, nu caseta (cursorul rămâne)', /window\.raxMailCauta = function/.test(BLOC) && /_mailIncarcaLista\(false\)/.test(BLOC));
  T('atributele cheamă funcții de pe window, nu scriu în variabile', !/on(click|input)="_mail\./.test(BLOC));
  const MOB = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'screens', 'Mail.tsx'), 'utf8');
  const EP = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'api', 'endpoints.ts'), 'utf8');
  const APP = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'App.tsx'), 'utf8');
  const MENU = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'screens', 'Menu.tsx'), 'utf8');
  T('telefonul: ecranul „Mail", doar pentru fondatori, pe ruta /admin/mail, în meniu după „Cereri demo"',
    /mail: doarSuper\(Mail, 'Mail'\)/.test(APP) && /<Route path="\/admin\/mail" component=\{P\.mail\} \/>/.test(APP) &&
    /'Cereri demo', \(\) => loc\.route\('\/admin\/demo-requests'\)[\s\S]{0,700}item\('mail', 'Mail', \(\) => loc\.route\('\/admin\/mail'\)\)/.test(MENU));
  T('telefonul folosește aceleași rute ca pagina', ['/api/mail/adrese', '/api/mail/trimise', '/api/mail/trimite'].every((r) => EP.indexOf("'" + r) >= 0 || EP.indexOf('`' + r) >= 0));
  T('telefonul: aceleași cuvinte ca pagina (spațiul, starea, lista goală, „n-a plecat")',
    ['Mailul ocupă', 'toată baza:', 'Serverul n-are email configurat: nu pleacă nimic până nu se pune cheia Brevo în Railway.', 'Niciun email trimis încă.', 'Nimic găsit.', 'n-a plecat', 'Caută după destinatar sau subiect…']
      .every((t) => MOB.indexOf(t) >= 0 && BLOC.indexOf(t) >= 0));
  T('telefonul: HTML-ul tot într-un cadru izolat', /<iframe sandbox=""/.test(MOB));
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const RS = fs.readFileSync(path.join(__dirname, 'report_schedules.js'), 'utf8');
  T('rapoartele programate ale unei firme NU intră în „Trimise" (fără jurnal)', /channels\.sendEmailTo\(rcp, subject, text, attachments\)/.test(RS) && !/jurnal/.test(RS));
  T('toate emailurile noastre poartă felul lor (factură, neplată, contract, invitație, formular, suport, mesaj; din 13.10 și redirecționat)',
    ['factura', 'neplata', 'contract', 'contract_montaj', 'invitatie', 'formular', 'suport', 'mesaj'].every((f) => SRV.indexOf("fel: '" + f + "'") >= 0 || (f === 'factura' && /fel: pf \? 'proforma' : 'factura'/.test(SRV)) || (f === 'invitatie' && /fel: opts\.invite \? 'invitatie' : 'parola'/.test(SRV)) || (f === 'mesaj' && /const fel = primit \? 'raspuns' : \(redirPrimit \|\| redirTrimis\) \? 'redirectionat' : 'mesaj';/.test(SRV) && /jurnal: \{ fel: fel, userId: uid/.test(SRV))));

  // ─── Server pornit ─────────────────────────────────────────────────────────────────────────────────
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';
  const PORT = 3340, TCP = 5340, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_mail_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_mail', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
    BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
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
  const json = async (m, u, ck, body) => {
    const x = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: x.status, j: j || {} };
  };
  // Un cont nou primește invitația pe email (Brevo fals): linkul de parolă se ia din emailul primit, ca un om adevărat.
  const contNou = async (S, corp, parola) => {
    const n0 = primite.length;
    const r = await json('POST', '/api/users', S, corp);
    for (let i = 0; i < 25 && !primite.slice(n0).some((x) => x.corp.to && x.corp.to[0].email === corp.username); i++) await sleep(200);
    const inv = primite.slice(n0).filter((x) => x.corp.to && x.corp.to[0].email === corp.username)[0];
    const tok = inv && (String(inv.corp.textContent || '').match(/token=([A-Za-z0-9_-]+)/) || [])[1];
    if (!tok) throw new Error('fără invitație pentru ' + corp.username + ': ' + JSON.stringify(r.j).slice(0, 200));
    const p = await fetch(B + '/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: parola }) });
    if (!p.ok) throw new Error('set-password: ' + p.status);
    return r.j;
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    console.log('\n1–4. Pe server pornit, cu Brevo-ul fals');
    const S = await login('admin', 'test1234');
    await contNou(S, { username: 'robert.gherbali@ratrack.ro', email: 'robert.gherbali@ratrack.ro', full_name: 'Robert Gherbali', role: 'superadmin' }, 'Strada-Verde-2026x');
    await contNou(S, { username: 'alin.tilvar@ratrack.ro', email: 'alin.tilvar@ratrack.ro', full_name: 'Alin Tîlvar', role: 'superadmin' }, 'Strada-Rosie-2026x');
    const R = await login('robert.gherbali@ratrack.ro', 'Strada-Verde-2026x');
    const A = await login('alin.tilvar@ratrack.ro', 'Strada-Rosie-2026x');
    T('pregătire: doi fondatori cu adrese pe ratrack.ro, autentificați (parola pusă din invitația primită pe email)', !!(R && A));

    const aR = await json('GET', '/api/mail/adrese', R), aA = await json('GET', '/api/mail/adrese', A);
    const lista = (x) => (x.j.adrese || []).map((a) => a.adresa + (a.comuna ? '*' : '') + (a.aMea ? '!' : '')).join(',');
    T('Robert vede adresa comună (contact@) și pe A LUI — nu și pe a lui Alin', aR.status === 200 && lista(aR) === 'contact@ratrack.ro*,robert.gherbali@ratrack.ro!', lista(aR));
    T('Alin vede adresa comună și pe a lui', lista(aA) === 'contact@ratrack.ro*,alin.tilvar@ratrack.ro!', lista(aA));
    T('emailul e activ, prin Brevo; indicatorul de încărcare vine de la server (mail, baza, discul de 5 GB)',
      aR.j.activ === true && aR.j.cale === 'brevo' && aR.j.spatiu && aR.j.spatiu.mailOcteti > 0 && aR.j.spatiu.bazaOcteti > 0 && aR.j.spatiu.capOcteti === 5 * 1024 * 1024 * 1024,
      JSON.stringify(aR.j.spatiu));

    // „Scrie": de pe adresa lui, cu un atașament
    const n1 = primite.length;
    const PDF = Buffer.from('%PDF-1.4 oferta');
    const s1 = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: 'sef@client.ro, contabil@client.ro', subiect: 'Oferta RA Track',
      text: 'Bună ziua,\nvă trimit oferta.\nRobert', atasamente: [{ nume: 'Oferta.pdf', b64: PDF.toString('base64') }] });
    const e1 = primite[primite.length - 1];
    T('„Scrie" de pe adresa lui: pleacă prin Brevo, cu numele lui urmat de „| RA Track" (Robert, 14.10), răspunsul înapoi la el, doi destinatari și PDF-ul',
      s1.status === 200 && primite.length === n1 + 1 && e1.corp.sender.email === 'robert.gherbali@ratrack.ro' && e1.corp.sender.name === 'Robert Gherbali | RA Track' &&
      e1.corp.replyTo && e1.corp.replyTo.email === 'robert.gherbali@ratrack.ro' && e1.corp.to.length === 2 && e1.corp.attachment[0].name === 'Oferta.pdf',
      JSON.stringify({ st: s1.status, j: s1.j, s: e1 && e1.corp.sender }).slice(0, 250));
    const s2 = await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'client@firma.ro', subiect: 'Programare montaj', text: 'Vă confirmăm ziua.' });
    T('…și de pe adresa comună (Alin), cu numele firmei', s2.status === 200 && primite[primite.length - 1].corp.sender.email === 'contact@ratrack.ro' && primite[primite.length - 1].corp.sender.name === 'RA Track');

    const n2 = primite.length;
    const nu = [await json('POST', '/api/mail/trimite', R, { de_la: 'alin.tilvar@ratrack.ro', catre: 'x@y.ro', subiect: 's', text: 't' }),
      await json('POST', '/api/mail/trimite', R, { de_la: 'cineva@altundeva.ro', catre: 'x@y.ro', subiect: 's', text: 't' })];
    T('nimeni nu scrie de pe adresa altuia (nici a celuilalt fondator, nici una străină): 403', nu.every((x) => x.status === 403) && primite.length === n2, nu.map((x) => x.status).join(','));
    const multi = Array.from({ length: 21 }, (_, i) => 'om' + i + '@x.ro').join(',');
    const rele400 = [
      await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'nu-e-adresa', subiect: 's', text: 't' }),
      await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'a@b.ro', subiect: '', text: 't' }),
      await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'a@b.ro', subiect: 's', text: '   ' }),
      await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: multi, subiect: 's', text: 't' }),
      await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'a@b.ro', subiect: 's', text: 't', atasamente: [{ nume: 'mare.bin', b64: Buffer.alloc(4200000).toString('base64') }] })];
    T('refuzuri pe față: adresă greșită, fără subiect, fără mesaj, peste 20 de destinatari, atașamente peste 4 MB (400)',
      rele400.every((x) => x.status === 400 && x.j.error) && primite.length === n2, rele400.map((x) => x.status + ' ' + (x.j.error || '')).join(' | '));
    const s3 = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: 'blocat@client.ro', subiect: 'EROARE de livrare', text: 'x' });
    T('Brevo refuză: răspunsul spune motivul (502)', s3.status === 502 && /recipient blocked/.test(s3.j.error || ''), JSON.stringify(s3.j));

    // „Trimise"
    const tR = await json('GET', '/api/mail/trimise', R), tA = await json('GET', '/api/mail/trimise', A);
    const subR = (tR.j.mailuri || []).map((m) => m.subiect);
    const subA = (tA.j.mailuri || []).map((m) => m.subiect);
    const mesajR = (tR.j.mailuri || []).filter((m) => m.subiect === 'Oferta RA Track')[0] || {};
    T('Robert își vede mesajul: felul „Mesaj", scris de el, cu atașamentul, „trimis"',
      mesajR.felText === 'Mesaj' && mesajR.cine === 'Robert Gherbali' && mesajR.stare === 'trimis' && (mesajR.atasamente || [])[0].nume === 'Oferta.pdf' &&
      mesajR.de_la === 'robert.gherbali@ratrack.ro' && mesajR.catre === 'sef@client.ro, contabil@client.ro', JSON.stringify(mesajR).slice(0, 250));
    const esuat = (tR.j.mailuri || []).filter((m) => m.subiect === 'EROARE de livrare')[0] || {};
    T('emailul refuzat apare „n-a plecat", cu motivul', esuat.stare === 'esuat' && /recipient blocked/.test(esuat.eroare || ''), JSON.stringify(esuat).slice(0, 200));
    const inv = (tR.j.mailuri || []).filter((m) => m.fel === 'invitatie');
    T('invitațiile (emailuri ale aplicației, de pe contact@) apar singure, cu felul „Invitație", la amândoi',
      inv.length >= 2 && inv.every((m) => m.de_la === 'contact@ratrack.ro' && m.felText === 'Invitație' && m.cine === 'aplicația') &&
      (tA.j.mailuri || []).filter((m) => m.fel === 'invitatie').length === inv.length, JSON.stringify(inv.map((m) => m.catre)));
    T('mesajul lui Alin de pe adresa comună se vede la amândoi', subR.indexOf('Programare montaj') >= 0 && subA.indexOf('Programare montaj') >= 0);
    T('mesajele PERSONALE ale lui Robert NU se văd la Alin', subA.indexOf('Oferta RA Track') < 0 && subA.indexOf('EROARE de livrare') < 0, subA.join(' | '));
    const d404 = await json('GET', '/api/mail/trimise/' + mesajR.id, A);
    const filtruStrain = await json('GET', '/api/mail/trimise?adresa=robert.gherbali@ratrack.ro', A);
    T('…nici deschis (404, ca unul care nu există), nici cerut pe adresa lui (403)', d404.status === 404 && filtruStrain.status === 403, d404.status + ' ' + filtruStrain.status);
    const d = await json('GET', '/api/mail/trimise/' + mesajR.id, R);
    T('deschis de el: textul întreg', d.status === 200 && /vă trimit oferta/.test(d.j.text || ''), JSON.stringify(d.j).slice(0, 160));
    const doarAl = await json('GET', '/api/mail/trimise?adresa=robert.gherbali@ratrack.ro', R);
    T('filtrul pe adresă: doar ce a plecat de pe ea', (doarAl.j.mailuri || []).length >= 2 && doarAl.j.mailuri.every((m) => m.de_la === 'robert.gherbali@ratrack.ro'));
    const cautat = await json('GET', '/api/mail/trimise?cauta=contabil@client', R);
    T('căutarea după destinatar găsește emailul', (cautat.j.mailuri || []).length === 1 && cautat.j.mailuri[0].subiect === 'Oferta RA Track', JSON.stringify((cautat.j.mailuri || []).map((m) => m.subiect)));

    // Doar fondatorii
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Mail SRL' })).j;
    await contNou(S, { username: 'sef@firma-mail.ro', email: 'sef@firma-mail.ro', full_name: 'Sef Firma', role: 'admin', company_id: co.id }, 'Strada-Galbena-2026x');
    const F = await login('sef@firma-mail.ro', 'Strada-Galbena-2026x');
    const fr = [await json('GET', '/api/mail/adrese', F), await json('GET', '/api/mail/trimise', F), await json('POST', '/api/mail/trimite', F, { de_la: 'contact@ratrack.ro', catre: 'a@b.ro', subiect: 's', text: 't' })];
    T('administratorul unei firme nu are panou de mail (403 peste tot)', fr.every((x) => x.status === 403), fr.map((x) => x.status).join(','));
    const invF = (await json('GET', '/api/mail/trimise', R)).j.mailuri.filter((m) => m.catre === 'sef@firma-mail.ro')[0] || {};
    T('invitația lui apare la noi cu firma lui', invF.fel === 'invitatie' && invF.firma === 'Firma Mail SRL', JSON.stringify(invF).slice(0, 200));
    const aud = await json('GET', '/api/audit?limit=100', S);
    const randuri = Array.isArray(aud.j) ? aud.j : (aud.j.rows || aud.j.entries || aud.j.logs || []);
    T('rând în jurnalul de audit pentru fiecare email scris (fără conținut)', randuri.some((r) => r.action === 'mail_trimis') && !JSON.stringify(randuri).includes('vă trimit oferta'));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
