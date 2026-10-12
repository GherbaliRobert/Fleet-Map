// verify_mail_primite.js — panoul Mail al fondatorilor, etapa 2: „Primite" + „Răspunde" (Robert, 12.10: „hai cu etapa 2").
//
//   node verify_mail_primite.js
//
// Drumul unui email primit: Cloudflare Email Routing → Email Worker (tools/mail-worker.mjs) → POST /api/mail/primeste, cu
// emailul ÎNTREG (MIME), parola comună (X-RA-Secret) și adresa noastră pe care a venit (X-RA-Catre). Proba trimite emailuri
// brute, făcute aici, exact ca Worker-ul. Nu pleacă niciun email adevărat: răspunsurile ajung la un Brevo FALS, local.
// Ce păzește:
//   1. regulile (mail_primit.js): citirea emailului (text, HTML, imaginile din corp, atașamentele, cele prea mari doar cu
//      numele), expeditorul nedovedit, adresa noastră, subiectul „Re:", mesajul citat, anunțul fără date ale omului;
//   2. ușa: fără parolă / cu parolă greșită 401, adresă străină 422, același email de două ori = un singur rând,
//      plafonul pe expeditor (429) — iar Worker-ul duce în căsuța de rezervă orice răspuns care nu e „ok";
//   3. cine vede: adresa comună — toți fondatorii (citit de unul = citit); adresa personală — doar omul ei (404 / 403
//      pentru celălalt, și la atașamente); un administrator de firmă — nimic (403);
//   4. deschis: imaginile din corp puse de server, atașamentul se DESCARCĂ (niciodată deschis în pagină), firma
//      expeditorului recunoscută, avertismentul la expeditorul nedovedit; „necitit", „șterge" (cu rând în audit);
//   5. „Răspunde": pleacă de pe adresa pe care a venit emailul, la adresa de răspuns a omului, cu „Re:", cu antetele de
//      discuție (și fără ele, dacă Brevo le refuză), apare în „Trimise" ca „Răspuns", iar emailul primit spune cine a răspuns;
//   6. anunțul: pe adresa comună la amândoi, pe cea personală doar la om; fără nume și fără subiect;
//   7. pagina, telefonul, Worker-ul și copia: aceleași rute, aceleași cuvinte, cadrul izolat, bulina din meniu.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const mp = require('./mail_primit');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// Un email brut, ca cel pe care îl dă Cloudflare Worker-ului.
let _nr = 0;
function mime(o) {
  const b = 'granita' + (++_nr), r = 'rel' + _nr;
  const L = [];
  (o.antete || []).forEach((h) => L.push(h));
  L.push('From: ' + o.from, 'To: ' + (o.to || 'contact@ratrack.ro'));
  if (o.cc) L.push('Cc: ' + o.cc);
  if (o.replyTo) L.push('Reply-To: ' + o.replyTo);
  L.push('Subject: =?UTF-8?B?' + Buffer.from(o.subiect || '', 'utf8').toString('base64') + '?=');
  L.push('Message-ID: ' + (o.id || '<m' + _nr + '.' + Date.now() + '@proba.ro>'));
  if (o.references) L.push('References: ' + o.references);
  L.push('Date: Mon, 12 Oct 2026 08:30:00 +0000', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + b + '"', '');
  L.push('--' + b, 'Content-Type: multipart/related; boundary="' + r + '"', '');
  L.push('--' + r, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(o.html || '<p>' + (o.text || '') + '</p>', 'utf8').toString('base64'));
  (o.imagini || []).forEach((im) => { L.push('--' + r, 'Content-Type: image/png', 'Content-ID: <' + im.cid + '>', 'Content-Disposition: inline', 'Content-Transfer-Encoding: base64', '', im.b64); });
  L.push('--' + r + '--');
  (o.atas || []).forEach((a) => { L.push('--' + b, 'Content-Type: ' + (a.tip || 'application/pdf') + '; name="' + a.nume + '"', 'Content-Disposition: attachment; filename="' + a.nume + '"', 'Content-Transfer-Encoding: base64', '', a.b64); });
  L.push('--' + b + '--', '');
  return Buffer.from(L.join('\r\n'), 'utf8');
}
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4 contract semnat — proba').toString('base64');

const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    primite.push({ cale: req.url, corp: j });
    // Brevo care NU primește antetele de discuție (nu scrie nicăieri dacă le primește): 400, ca să se vadă a doua încercare.
    if (j.headers && /ANTET/.test(j.subject || '')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":"invalid_parameter","message":"headers not allowed"}'); }
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' }));
  });
});

(async () => {
  // ─── 1. Regulile ──────────────────────────────────────────────────────────────────────────────────
  console.log('1. Regulile (mail_primit.js)');
  const m1 = await mp.citeste(mime({ from: '"Ion Pop" <ion@client.ro>', replyTo: 'birou@client.ro', subiect: 'Întrebare despre factură',
    html: '<p>Bună ziua, <b>am o întrebare</b>.</p><img src="cid:sigla1">', imagini: [{ cid: 'sigla1', b64: PNG }], atas: [{ nume: 'Contract semnat.pdf', b64: PDF }] }));
  T('citește expeditorul, adresa de răspuns, subiectul (UTF-8), HTML-ul și textul făcut din el',
    m1.de_la === 'ion@client.ro' && m1.de_nume === 'Ion Pop' && m1.raspuns_catre === 'birou@client.ro' && m1.subiect === 'Întrebare despre factură' &&
    /am o întrebare/.test(m1.html) && /am o întrebare/.test(m1.text || ''), JSON.stringify({ de: m1.de_la, r: m1.raspuns_catre, s: m1.subiect, t: m1.text }));
  const tx = mp.textDinHtml('<h3>Logistica Cluj</h3><p>Avem 30 de mașini &amp; 2 remorci.</p><img src="cid:x"><style>p{}</style>');
  T('textul făcut din HTML păstrează literele titlurilor (nu „LOGISTICA CLUJ" în citat), fără imagini și stiluri',
    /^Logistica Cluj\n+Avem 30 de mașini & 2 remorci\.$/.test(tx), JSON.stringify(tx));
  T('imaginea din corp rămâne „cid:" în HTML (o pune serverul la deschidere, nu umflă corpul păstrat)', /src="cid:sigla1"/.test(m1.html) && !/data:image/.test(m1.html));
  const atasPdf = m1.atasamente.filter((a) => a.nume === 'Contract semnat.pdf')[0], atasImg = m1.atasamente.filter((a) => a.cid === 'sigla1')[0];
  T('atașamentele: PDF-ul păstrat cu numele lui; imaginea din corp marcată „în corp"',
    atasPdf && atasPdf.pastrat && atasPdf.tip === 'application/pdf' && Buffer.from(atasPdf.continut).toString('base64') === PDF && atasImg && atasImg.inCorp && m1.intreg,
    JSON.stringify(m1.atasamente.map((a) => ({ n: a.nume, p: a.pastrat, c: a.inCorp }))));
  const mare = Buffer.alloc(mp.ATAS_PASTRAT_MAX + 1000, 7).toString('base64');
  const m2 = await mp.citeste(mime({ from: 'a@b.ro', subiect: 'Mare', text: 'x', atas: [{ nume: 'mic.pdf', b64: PDF }, { nume: 'film.mp4', tip: 'video/mp4', b64: mare }] }));
  const fm = m2.atasamente.filter((a) => a.nume === 'film.mp4')[0];
  T('un atașament peste ' + Math.round(mp.ATAS_PASTRAT_MAX / 1048576) + ' MB rămâne doar cu numele; emailul nu mai e „întreg" (Worker-ul îl trimite și în rezervă)',
    fm && !fm.pastrat && fm.continut === null && m2.atasamente.filter((a) => a.nume === 'mic.pdf')[0].pastrat && m2.intreg === false);
  const lung = await mp.citeste(mime({ from: 'a@b.ro', subiect: 'Buletin', html: '<p>' + 'x'.repeat(mp.HTML_MAX + 10) + '</p>' }));
  T('un HTML prea lung nu se păstrează tăiat: rămâne textul, emailul nu mai e „întreg"', lung.html === null && lung.intreg === false && (lung.text || '').length > 0);
  const AR = (s) => [{ key: 'arc-authentication-results', line: 'ARC-Authentication-Results: i=1; mx.cloudflare.net; ' + s }];
  T('expeditorul: DMARC picat → „picat"; SPF picat fără semnătură → „picat"; semnătură bună → „trecut"; fără antet → nimic',
    mp.verificare(AR('dkim=none; spf=pass; dmarc=fail')) === 'picat' && mp.verificare(AR('dkim=none; spf=softfail; dmarc=none')) === 'picat' &&
    mp.verificare(AR('dkim=pass; spf=fail; dmarc=pass')) === 'trecut' && mp.verificare([]) === null && mp.verificare(AR('spf=none')) === null);
  T('…contează antetul de SUS (al serverului care a primit), nu unul scris mai jos de expeditor',
    mp.verificare(AR('dmarc=fail').concat([{ key: 'authentication-results', line: 'Authentication-Results: fals; dmarc=pass' }])) === 'picat');
  const NOI = ['contact@ratrack.ro', 'robert.gherbali@ratrack.ro'];
  T('adresa noastră: cea spusă de Cloudflare câștigă; una străină → nimic; fără ea, din To/Cc',
    mp.adresaNoastra(NOI, 'Robert.Gherbali@ratrack.ro', null, null) === 'robert.gherbali@ratrack.ro' && mp.adresaNoastra(NOI, 'x@altundeva.ro', { value: [{ address: 'contact@ratrack.ro' }] }, null) === null &&
    mp.adresaNoastra(NOI, '', { value: [{ address: 'cineva@x.ro' }] }, { value: [{ address: 'contact@ratrack.ro' }] }) === 'contact@ratrack.ro');
  T('subiectul răspunsului: „Re:" o singură dată', mp.subiectRaspuns('Ofertă') === 'Re: Ofertă' && mp.subiectRaspuns('RE: Ofertă') === 'RE: Ofertă' && mp.subiectRaspuns('Răspuns: x') === 'Răspuns: x' && mp.subiectRaspuns('') === 'Re: (fără subiect)');
  const c = mp.citat({ de_nume: 'Ion Pop', de_la: 'ion@client.ro', trimis_la: new Date('2026-10-12T08:30:00Z'), text: 'Salut\nAm o întrebare' });
  T('mesajul citat: ziua și ora României, cine a scris, fiecare rând cu „> "', /Pe 12\.10\.2026, la 11:30, Ion Pop <ion@client\.ro> a scris:\n> Salut\n> Am o întrebare$/.test(c), JSON.stringify(c));
  const cl = mp.citat({ de_la: 'a@b.ro', text: 'cuvânt '.repeat(2000) });
  T('…tăiat la ' + mp.CITAT_MAX + ' de caractere, cu „[…]"', cl.length < mp.CITAT_MAX * 1.3 && /\[…\]$/.test(cl));
  const pr = mp.pentruRaspuns({ catre: 'contact@ratrack.ro', de_la: 'ion@client.ro', raspuns_catre: 'birou@client.ro', subiect: 'X', text: 'y' });
  T('răspunsul pleacă de pe adresa pe care a venit emailul, la adresa de răspuns a omului', pr.de_la === 'contact@ratrack.ro' && pr.catre === 'birou@client.ro' && pr.subiect === 'Re: X');
  const h = mp.cuImagini('<img src="cid:a"><img src="cid:b"><img src="cid:c">', [{ cid: 'a', tip: 'image/png', octeti: 10, continut_b64: 'QUJD' },
    { cid: 'b', tip: 'application/pdf', octeti: 10, continut_b64: 'QUJD' }, { cid: 'c', tip: 'image/png', octeti: mp.IMAGINE_IN_CORP_MAX + 1, continut_b64: 'QUJD' }]);
  T('imaginile din corp: doar imagini, doar până la ' + Math.round(mp.IMAGINE_IN_CORP_MAX / 1048576) + ' MB', h === '<img src="data:image/png;base64,QUJD"><img src="cid:b"><img src="cid:c">', h);
  const a1 = mp.anunt('contact@ratrack.ro', 1), a3 = mp.anunt('contact@ratrack.ro', 3), a20 = mp.anunt('contact@ratrack.ro', 20);
  T('anunțul: „Email nou", „3 emailuri noi", „20 de emailuri noi" — fără nume, fără subiect',
    a1.titlu === 'Email nou pe contact@ratrack.ro' && a3.titlu === '3 emailuri noi pe contact@ratrack.ro' && a20.titlu === '20 de emailuri noi pe contact@ratrack.ro' && /ca să le citești/.test(a3.corp));

  // ─── 7. Pagina, telefonul, Worker-ul, copia (fără server) ─────────────────────────────────────────
  console.log('7. Pagina, telefonul, Worker-ul, copia');
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const BLOC = (PAG.match(/── începe „Panoul Mail"[\s\S]*?── sfârșit „Panoul Mail" ──/) || [''])[0];
  T('pagina: filele Primite / Trimise, cu rutele serverului (listă, deschis, necitit, șters, atașament, bulina)',
    ['/api/mail/primite', '/api/mail/necitite', "/necitit'", "'/atasamente/'"].every((r) => BLOC.indexOf(r) >= 0) && /method: 'DELETE'/.test(BLOC) && /window\.raxMailFila = function/.test(BLOC));
  T('pagina: emailul PRIMIT în cadru izolat (fără scripturi), linkurile în altă filă, imaginile din afară oprite până la „Arată imaginile"',
    /if \(primit\) f\.setAttribute\('sandbox', 'allow-popups allow-popups-to-escape-sandbox'\);\s*else f\.setAttribute\('sandbox', ''\);/.test(BLOC) &&
    /img-src ' \+ \(!primit \|\| cuImagini \? 'https: ' : ''\) \+ 'data:/.test(BLOC) && /<base target="_blank">/.test(BLOC) && /raxMailImagini/.test(BLOC));
  T('pagina: „Răspunde" ia adresa, destinatarul, subiectul și citatul de la server (pentruRaspuns) și trimite raspunsLa',
    /m\.pentruRaspuns\.subiect/.test(BLOC) && /corp\.raspunsLa = _mail\.raspunsLa/.test(BLOC) && !/'Re: '/.test(BLOC));
  T('pagina: bulina pe rândul „Mail", pornită doar la fondatori, reîmprospătată de anunț; anunțul duce în Mail → Primite',
    /<span>Mail<\/span><span class="nav-mail-nr" id="nav-mail-nr"/.test(PAG) && /currentUser\.role === 'superadmin' && window\._mailNumara\) \{ window\._mailNumara\(\);/.test(PAG) &&
    /notif\.type === 'mail_nou' && window\._mailNumara\) window\._mailNumara\(\)/.test(PAG) && /_notifDate\[id\]\.mail\) \{ closeNotifications\(\); if \(window\.raxMailFila\) window\.raxMailFila\('primite', true\); goSistem\('mail'\);/.test(PAG));
  T('pagina: atributele cheamă funcții de pe window, nu scriu în variabile', !/on(click|input)="_mail\./.test(BLOC));
  const MOB = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'screens', 'Mail.tsx'), 'utf8');
  const EP = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'api', 'endpoints.ts'), 'utf8');
  const PUSH = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'lib', 'push.ts'), 'utf8');
  T('telefonul: aceleași rute ca pagina', ['/api/mail/primite?pagina=', '/api/mail/primite/${id}', '/api/mail/primite/${id}/necitit', '/api/mail/necitite'].every((r) => EP.indexOf(r) >= 0) &&
    /'\/api\/mail\/primite\/' \+ deschis\.id \+ '\/atasamente\/' \+ a\.id/.test(MOB) && /mailTrimite\(raspunsLa \? \{ \.\.\.rest, atasamente, raspunsLa \}/.test(MOB));
  const CUVINTE = ['Niciun email primit încă.', 'Caută după expeditor sau subiect…', 'Emailurile primite pe adresele de mai jos ajung aici.',
    'Primirea nu e pornită încă: emailurile nu ajung aici până nu se leagă Cloudflare (parola de primire în Railway și în Cloudflare).',
    'Imaginile din afară sunt oprite.', 'Arată imaginile', 'Marchează necitit', 'Răspunde', 'expeditor nedovedit', 'doar numele',
    'Ștergi emailul, cu atașamentele lui? Nu se mai poate recupera.', 'Răspunsul a plecat ✓', 'răspunsul merge la'];
  const lipsa = CUVINTE.filter((t) => MOB.indexOf(t) < 0 || BLOC.indexOf(t) < 0);
  T('telefonul: aceleași cuvinte ca pagina', !lipsa.length, lipsa.join(' | '));
  T('telefonul: emailul primit tot în cadru izolat; imaginile din afară doar la cerere', (MOB.match(/<iframe sandbox=""/g) || []).length === 2 && /srcdoc=\{csp\(imagini\)/.test(MOB));
  T('telefonul: anunțul „Email nou" duce în Mail', /if \(tip === 'mail_nou'\) return '\/admin\/mail';/.test(PUSH) && /TIPURI_CU_LOC = \[[^\]]*'mail_nou'/.test(PUSH));
  const W = fs.readFileSync(path.join(__dirname, 'tools', 'mail-worker.mjs'), 'utf8');
  T('Worker-ul: trimite emailul întreg cu parola și adresa; la orice „nu" (sau „nu întreg") îl duce în rezervă; fără rezervă, îl refuză (expeditorul află)',
    /'X-RA-Secret': env\.RA_SECRET, 'X-RA-Catre': message\.to/.test(W) && /body: raw/.test(W) && /if \(ok && intreg\) return;/.test(W) &&
    /if \(env\.BACKUP\) \{ await message\.forward\(env\.BACKUP\); return; \}/.test(W) && /message\.setReject\(/.test(W));
  const backup = require('./backup');
  T('copia: emailurile primite intră; atașamentele nu (pot ajunge la gigabytes, iar copia se face în memorie) — cu motivul scris',
    backup.BUSINESS_TABLES.includes('mail_primite') && typeof backup.BACKUP_EXCLUDED.mail_atasamente === 'string' && !backup.BUSINESS_TABLES.includes('mail_atasamente'));
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  T('atașamentul se trimite ca fișier de descărcat, nu cu tipul lui (un HTML de la oricine ar rula pe adresa noastră)',
    /app\.get\('\/api\/mail\/primite\/:id\/atasamente\/:aid'[\s\S]{0,700}'Content-Type', 'application\/octet-stream'[\s\S]{0,120}_antetDescarcare/.test(SRV));
  T('ușa de primire: fără parolă setată pe server → 503; parola comparată în timp constant, ÎNAINTE de citirea emailului',
    /if \(!_mailPrimirePornita\(\)\) return res\.status\(503\)/.test(SRV) && /crypto\.timingSafeEqual\(a, b\)/.test(SRV) &&
    /app\.post\('\/api\/mail\/primeste', _mailPrimireUsa, express\.raw\(/.test(SRV));

  // ─── Server pornit ─────────────────────────────────────────────────────────────────────────────────
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';
  const PORT = 3341, TCP = 5341, B = 'http://127.0.0.1:' + PORT;
  const SECRET = 'o-parola-lunga-de-proba-pentru-cloudflare-2026';
  const DIR = path.join(os.tmpdir(), 'rax_mailp_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_mailp', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
    MAIL_INBOUND_SECRET: SECRET, BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
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
  // Ce face Worker-ul: emailul brut, cu parola și adresa noastră.
  const primeste = async (raw, catre, secret) => {
    const h = { 'Content-Type': 'message/rfc822' };
    if (secret !== null) h['X-RA-Secret'] = secret === undefined ? SECRET : secret;
    if (catre) h['X-RA-Catre'] = catre;
    const x = await fetch(B + '/api/mail/primeste', { method: 'POST', headers: h, body: raw });
    let j = {}; try { j = await x.json(); } catch (e) {}
    return { status: x.status, j: j };
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
    return r.j;
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    console.log('\n2–6. Pe server pornit, cu emailuri brute ca de la Cloudflare și Brevo-ul fals');
    const S = await login('admin', 'test1234');
    await contNou(S, { username: 'robert.gherbali@ratrack.ro', email: 'robert.gherbali@ratrack.ro', full_name: 'Robert Gherbali', role: 'superadmin' }, 'Strada-Verde-2026x');
    await contNou(S, { username: 'alin.tilvar@ratrack.ro', email: 'alin.tilvar@ratrack.ro', full_name: 'Alin Tîlvar', role: 'superadmin' }, 'Strada-Rosie-2026x');
    const co = (await json('POST', '/api/companies', S, { name: 'Transport Primit SRL' })).j;
    await contNou(S, { username: 'sef@transport-primit.ro', email: 'sef@transport-primit.ro', full_name: 'Șef Transport', role: 'admin', company_id: co.id }, 'Strada-Galbena-2026x');
    const R = await login('robert.gherbali@ratrack.ro', 'Strada-Verde-2026x');
    const A = await login('alin.tilvar@ratrack.ro', 'Strada-Rosie-2026x');
    const F = await login('sef@transport-primit.ro', 'Strada-Galbena-2026x');
    T('pregătire: doi fondatori pe ratrack.ro și administratorul unei firme, autentificați', !!(R && A && F));
    const a0 = await json('GET', '/api/mail/adrese', R);
    T('panoul spune că primirea e pornită (parola de primire e pusă pe server)', a0.j.primire === true);
    const hl0 = ((await json('GET', '/api/admin/health', R)).j.checks || []).filter((c) => c.key === 'mail_primit')[0] || {};
    T('„Stare producție" are rândul „Email primit": pornit, niciun email încă', hl0.level === 'ok' && /^pornit — niciun email primit încă$/.test(hl0.detail || ''), JSON.stringify(hl0));

    // ─── 2. Ușa ───
    const raw1 = mime({ from: '"Șef Transport" <sef@transport-primit.ro>', replyTo: 'birou@transport-primit.ro', subiect: 'Contractul semnat',
      id: '<contract-1@transport-primit.ro>', html: '<p>Vă trimit contractul semnat.</p><img src="cid:sigla1"><img src="https://tracker.exemplu.ro/pixel.png">',
      imagini: [{ cid: 'sigla1', b64: PNG }], atas: [{ nume: 'Contract semnat.pdf', b64: PDF }] });
    const usa = [await primeste(raw1, 'contact@ratrack.ro', null), await primeste(raw1, 'contact@ratrack.ro', 'alta-parola'), await primeste(raw1, 'cineva@altundeva.ro'),
      await primeste(Buffer.alloc(0), 'contact@ratrack.ro')];
    T('ușa: fără parolă 401, parolă greșită 401, adresă străină 422, email gol 400 — și nu se scrie nimic',
      usa.map((x) => x.status).join(',') === '401,401,422,400' && (await json('GET', '/api/mail/primite', R)).j.mailuri.length === 0, usa.map((x) => x.status).join(','));
    const p1 = await primeste(raw1, 'contact@ratrack.ro');
    const p1b = await primeste(raw1, 'contact@ratrack.ro');
    T('emailul pe contact@ intră (întreg); același email venit a doua oară nu face al doilea rând',
      p1.status === 200 && p1.j.ok && p1.j.intreg === true && p1b.status === 200 && p1b.j.deja === true && p1b.j.id === p1.j.id, JSON.stringify([p1.j, p1b.j]));
    const p2 = await primeste(mime({ from: 'Furnizor <oferte@furnizor.ro>', to: 'robert.gherbali@ratrack.ro', subiect: 'Oferta de aparate', text: 'Prețurile noi.' }), 'robert.gherbali@ratrack.ro');
    const p3 = await primeste(mime({ from: 'Banca <alerta@banca-falsa.ro>', subiect: 'Confirmați contul', text: 'Dați clic aici',
      antete: ['ARC-Authentication-Results: i=1; mx.cloudflare.net; dkim=none; spf=fail; dmarc=fail'] }), 'contact@ratrack.ro');
    T('emailul pe adresa personală și cel cu expeditor nedovedit intră și ele', p2.status === 200 && p3.status === 200);

    // ─── 3. Cine vede ───
    const lR = (await json('GET', '/api/mail/primite', R)).j.mailuri || [], lA = (await json('GET', '/api/mail/primite', A)).j.mailuri || [];
    const sub = (l) => l.map((m) => m.subiect).join(' | ');
    T('Robert vede emailurile de pe contact@ și de pe adresa lui', sub(lR) === 'Confirmați contul | Oferta de aparate | Contractul semnat', sub(lR));
    T('Alin vede doar pe cele de pe contact@ (nu și emailul personal al lui Robert)', sub(lA) === 'Confirmați contul | Contractul semnat', sub(lA));
    const contractR = lR.filter((m) => m.subiect === 'Contractul semnat')[0] || {}, ofertaR = lR.filter((m) => m.subiect === 'Oferta de aparate')[0] || {};
    T('pe rând: expeditorul, firma recunoscută după adresă, atașamentul, necitit', contractR.de_la === 'sef@transport-primit.ro' && contractR.de_nume === 'Șef Transport' &&
      contractR.firma === 'Transport Primit SRL' && contractR.atasamente.length === 1 && contractR.atasamente[0].nume === 'Contract semnat.pdf' && contractR.citit === false,
      JSON.stringify(contractR).slice(0, 300));
    T('emailul cu expeditor nedovedit e semnat pe rând', (lR.filter((m) => m.subiect === 'Confirmați contul')[0] || {}).verificare === 'picat');
    const strain = [await json('GET', '/api/mail/primite/' + ofertaR.id, A), await json('GET', '/api/mail/primite?adresa=robert.gherbali@ratrack.ro', A),
      await json('POST', '/api/mail/primite/' + ofertaR.id + '/necitit', A), await json('DELETE', '/api/mail/primite/' + ofertaR.id, A)];
    const atStrain = await fetch(B + '/api/mail/primite/' + ofertaR.id + '/atasamente/1', { headers: { Cookie: A } });
    T('emailul personal al lui Robert, pentru Alin: deschis / necitit / șters 404, cerut pe adresa lui 403, atașament 404',
      strain.map((x) => x.status).join(',') === '404,403,404,404' && atStrain.status === 404, strain.map((x) => x.status).join(',') + ' ' + atStrain.status);
    const fr = [await json('GET', '/api/mail/primite', F), await json('GET', '/api/mail/primite/' + contractR.id, F), await json('GET', '/api/mail/necitite', F)];
    T('administratorul unei firme nu vede nimic (403)', fr.every((x) => x.status === 403), fr.map((x) => x.status).join(','));
    const nR = (await json('GET', '/api/mail/necitite', R)).j, nA = (await json('GET', '/api/mail/necitite', A)).j;
    const adrR = (await json('GET', '/api/mail/adrese', R)).j.adrese || [];
    T('necititele: Robert 3 (2 pe contact@, 1 pe a lui), Alin 2 — numărate de server, și pe fiecare adresă',
      nR.total === 3 && nA.total === 2 && adrR.filter((a) => a.adresa === 'contact@ratrack.ro')[0].necitite === 2 && adrR.filter((a) => a.adresa === 'robert.gherbali@ratrack.ro')[0].necitite === 1,
      JSON.stringify([nR, nA]));
    T('căutarea după expeditor și după subiect', ((await json('GET', '/api/mail/primite?cauta=furnizor', R)).j.mailuri || []).length === 1 &&
      ((await json('GET', '/api/mail/primite?cauta=contractul', A)).j.mailuri || []).length === 1);

    // ─── 4. Deschis ───
    const d = (await json('GET', '/api/mail/primite/' + contractR.id, R)).j;
    T('deschis: imaginea din corp pusă de server; imaginea din afară lăsată (o oprește ecranul); textul, adresa de răspuns',
      /src="data:image\/png;base64,/.test(d.html || '') && !/cid:sigla1/.test(d.html || '') && /https:\/\/tracker\.exemplu\.ro\/pixel\.png/.test(d.html || '') &&
      /contractul semnat/i.test(d.text || '') && d.raspuns_catre === 'birou@transport-primit.ro', JSON.stringify(d).slice(0, 300));
    T('deschis: lista atașamentelor fără imaginea din corp', (d.atasamente || []).length === 1 && d.atasamente[0].nume === 'Contract semnat.pdf' && d.atasamente[0].pastrat === true);
    T('deschis = citit, o dată pentru toți: la Alin a scăzut și el', (await json('GET', '/api/mail/necitite', A)).j.total === 1 &&
      ((await json('GET', '/api/mail/primite', A)).j.mailuri.filter((m) => m.id === contractR.id)[0] || {}).citit === true);
    const at = await fetch(B + '/api/mail/primite/' + contractR.id + '/atasamente/' + d.atasamente[0].id, { headers: { Cookie: A } });
    const atBuf = Buffer.from(await at.arrayBuffer());
    T('atașamentul se descarcă (și de pe adresa comună, de Alin): fișier de descărcat, cu numele lui, exact octeții primiți',
      at.status === 200 && at.headers.get('content-type') === 'application/octet-stream' && /^attachment;/.test(at.headers.get('content-disposition') || '') &&
      /filename\*=UTF-8''Contract%20semnat\.pdf/.test(at.headers.get('content-disposition') || '') && atBuf.toString('base64') === PDF,
      at.status + ' ' + at.headers.get('content-type') + ' ' + at.headers.get('content-disposition'));
    const dF = (await json('GET', '/api/mail/primite/' + (lR.filter((m) => m.subiect === 'Confirmați contul')[0] || {}).id, A)).j;
    T('expeditorul nedovedit: avertismentul îl scrie serverul', /poate fi fals/.test(dF.avertisment || '') && d.avertisment === null, String(dF.avertisment));
    const nc = await json('POST', '/api/mail/primite/' + contractR.id + '/necitit', A);
    T('„Marchează necitit" (de Alin, pe adresa comună): înapoi necitit pentru toți', nc.status === 200 && (await json('GET', '/api/mail/necitite', R)).j.total === 2);

    // ─── 5. Răspunde ───
    const nB = primite.length;
    const pr0 = d.pentruRaspuns || {};
    T('ce se pune în „Răspunde" vine de la server: de pe contact@, către adresa de răspuns, „Re:", mesajul citat',
      pr0.de_la === 'contact@ratrack.ro' && pr0.catre === 'birou@transport-primit.ro' && pr0.subiect === 'Re: Contractul semnat' && /Șef Transport <sef@transport-primit\.ro> a scris:\n> /.test(pr0.text || ''),
      JSON.stringify(pr0).slice(0, 300));
    const gres = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: pr0.catre, subiect: pr0.subiect, text: 'Mulțumim!' + pr0.text, raspunsLa: contractR.id });
    const strainR = await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: 'oferte@furnizor.ro', subiect: 'Re: x', text: 'y', raspunsLa: ofertaR.id });
    T('răspunsul nu pleacă de pe altă adresă decât cea pe care a venit emailul (400), iar la emailul altuia nu se răspunde (404)',
      gres.status === 400 && strainR.status === 404 && primite.length === nB, gres.status + ' ' + strainR.status);
    const rs = await json('POST', '/api/mail/trimite', A, { de_la: 'contact@ratrack.ro', catre: pr0.catre, subiect: pr0.subiect, text: 'Mulțumim, l-am primit.' + pr0.text, raspunsLa: contractR.id });
    const eR = primite[primite.length - 1] || { corp: {} };
    T('răspunsul pleacă (Alin, de pe contact@), cu antetele de discuție către emailul primit',
      rs.status === 200 && eR.corp.sender.email === 'contact@ratrack.ro' && eR.corp.to[0].email === 'birou@transport-primit.ro' && eR.corp.subject === 'Re: Contractul semnat' &&
      eR.corp.headers && eR.corp.headers['In-Reply-To'] === '<contract-1@transport-primit.ro>' && /<contract-1@transport-primit\.ro>/.test(eR.corp.headers.References || ''),
      JSON.stringify({ st: rs.status, j: rs.j, h: eR.corp.headers }).slice(0, 300));
    const dupa = ((await json('GET', '/api/mail/primite', R)).j.mailuri || []).filter((m) => m.id === contractR.id)[0] || {};
    T('emailul primit spune cine a răspuns și când (văzut și de Robert); e citit', dupa.raspuns && /^Răspuns de Alin Tîlvar, pe \d\d\.\d\d\.\d{4}, la \d\d:\d\d$/.test(dupa.raspuns.text) && dupa.citit === true,
      JSON.stringify(dupa.raspuns));
    const tr = ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).filter((m) => m.subiect === 'Re: Contractul semnat')[0] || {};
    T('în „Trimise": felul „Răspuns", cu firma expeditorului și cu cine l-a scris', tr.fel === 'raspuns' && tr.felText === 'Răspuns' && tr.firma === 'Transport Primit SRL' && tr.cine === 'Alin Tîlvar',
      JSON.stringify(tr).slice(0, 250));
    const nC = primite.length;
    const rs2 = await json('POST', '/api/mail/trimite', R, { de_la: 'robert.gherbali@ratrack.ro', catre: 'oferte@furnizor.ro', subiect: 'Re: ANTET Oferta de aparate', text: 'Mulțumesc.', raspunsLa: ofertaR.id });
    T('Brevo refuză antetele de discuție: răspunsul pleacă din a doua încercare, fără ele',
      rs2.status === 200 && primite.length === nC + 2 && primite[nC].corp.headers && !primite[nC + 1].corp.headers, rs2.status + ' ' + (primite.length - nC));

    // ─── 6. Anunțul ───
    const notR = (await json('GET', '/api/notifications', R)).j, notA = (await json('GET', '/api/notifications', A)).j;
    const mailR = (Array.isArray(notR) ? notR : []).filter((n) => n.type === 'mail_nou'), mailA = (Array.isArray(notA) ? notA : []).filter((n) => n.type === 'mail_nou');
    T('anunțul: pe contact@ la amândoi, pe adresa personală doar la Robert (o dată la 10 minute pe adresă)',
      mailR.some((n) => n.title === 'Email nou pe contact@ratrack.ro') && mailR.some((n) => /pe robert\.gherbali@ratrack\.ro$/.test(n.title)) &&
      mailA.some((n) => n.title === 'Email nou pe contact@ratrack.ro') && !mailA.some((n) => /robert\.gherbali/.test(n.title)) && mailR.length === 2,
      JSON.stringify(mailR.map((n) => n.title)) + ' / ' + JSON.stringify(mailA.map((n) => n.title)));
    T('anunțul nu spune cine a scris și nici subiectul', mailR.every((n) => !/Șef|transport-primit|Contract|Furnizor|Oferta/i.test((n.title || '') + (n.body || ''))));

    // ─── 2'. Plafonul, emailul prea mare, ștergerea, spațiul ───
    const val = [];
    for (let i = 0; i < 31; i++) val.push((await primeste(mime({ from: 'val@spam.ro', subiect: 'Reclamă ' + i, text: 'x' }), 'contact@ratrack.ro')).status);
    T('plafonul pe expeditor: al 31-lea email într-o oră primește 429 (Worker-ul îl duce în rezervă)', val.slice(0, 30).every((s) => s === 200) && val[30] === 429, val.slice(28).join(','));
    const pm = await primeste(mime({ from: 'arhiva@client.ro', subiect: 'Toate pozele', text: 'Vedeți atașat.', atas: [{ nume: 'poze.zip', tip: 'application/zip', b64: mare }] }), 'contact@ratrack.ro');
    const pmD = (await json('GET', '/api/mail/primite/' + pm.j.id, R)).j;
    const pmAt = await fetch(B + '/api/mail/primite/' + pm.j.id + '/atasamente/' + ((pmD.atasamente || [])[0] || {}).id, { headers: { Cookie: R } });
    T('emailul prea mare: intră, răspunde „nu întreg" (ca Worker-ul să-l ducă și în rezervă), atașamentul doar cu numele, textul scris de server',
      pm.status === 200 && pm.j.intreg === false && (pmD.atasamente || [])[0].pastrat === false && /prea mare/.test(pmD.neintreg || '') && pmAt.status === 404,
      JSON.stringify(pm.j) + ' ' + pmAt.status);
    const hl1 = ((await json('GET', '/api/admin/health', R)).j.checks || []).filter((c) => c.key === 'mail_primit')[0] || {};
    T('…iar după primele emailuri, ziua și ora ultimului', /^pornit — ultimul email primit: /.test(hl1.detail || ''), JSON.stringify(hl1));
    const sp = (await json('GET', '/api/mail/adrese', R)).j.spatiu || {};
    T('indicatorul de încărcare numără și emailurile primite (cu atașamentele lor)', sp.numar >= 36 && sp.mailOcteti > 0, JSON.stringify(sp));
    const st = await json('DELETE', '/api/mail/primite/' + (lR.filter((m) => m.subiect === 'Confirmați contul')[0] || {}).id, A);
    const dupaSt = await json('GET', '/api/mail/primite/' + (lR.filter((m) => m.subiect === 'Confirmați contul')[0] || {}).id, R);
    const aud = await json('GET', '/api/audit?limit=200', S);
    const randuri = Array.isArray(aud.j) ? aud.j : (aud.j.rows || aud.j.entries || aud.j.logs || []);
    T('„Șterge" (Alin, pe adresa comună): emailul dispare pentru toți, cu rând în audit (fără conținut)',
      st.status === 200 && dupaSt.status === 404 && randuri.some((r) => r.action === 'mail_primit_sters') && !JSON.stringify(randuri).includes('Dați clic'), st.status + ' ' + dupaSt.status);
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
