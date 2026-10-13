// verify_mail_dosare.js — panoul Mail, etapa 3 (Robert, 13.10: „la semnătură vreau să fie și funcția și adresa de mail, vreau
// să avem butoanele direct în lista de mail (reply, ștergere și ce mai e), vreau să putem avea acțiuni multiple, de bifare și după
// ștergere, secțiune de spam, vreau să fie un mail cât mai complet"; apoi „1, da · 2. a · 3. a, b, c · 4. da").
//
//   node verify_mail_dosare.js
//
// Ce păzește:
//   1. dosarele Primite · Trimise · Ciorne · Spam · Coș, aceleași pe pagină și pe telefon;
//   2. Spamul („2. a"): în Spam merg singure DOAR emailurile expeditorilor marcați de noi, pe adresa pe care i-am marcat;
//      „Nu e spam" îl scoate de pe listă; un email marcat spam nu mai sună;
//   3. Coșul („1, da"): „Șterge" mută în Coș (se poate recupera, înapoi de unde a venit); „Șterge definitiv" doar din Coș;
//      Coșul și Spamul se golesc singure după 30 de zile (cu atașamentele);
//   4. acțiunile pe mai multe deodată (citit, necitit, stea, spam, nu e spam, șterge, recuperează, definitiv) — O singură funcție
//      pe server, o singură cale pe pagină și pe telefon; facturile, contractele, invitațiile rămân (dovada);
//   5. cine vede ce: adresa comună — toți fondatorii; adresa personală — doar omul ei (nici acțiunile, nici Coșul, nici sugestiile);
//   6. ciornele („3. a"): ale omului, salvate singure, șterse după ce emailul pleacă;
//   7. adresele sugerate („3. b"): cei care ne-au scris, cei cărora le-am scris, firmele, administratorii — fără adresele noastre;
//   8. steaua („3. c"); funcția din fișă / din Contul meu, în semnătură (web + telefon).
// Nu pleacă niciun email adevărat: totul ajunge la un Brevo FALS, local; emailurile primite sunt făcute aici, ca de la Cloudflare.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 700) : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const faza = (process.argv.find((a) => a.indexOf('--faza=') === 0) || '').slice(7);

// ════════════ Faza „golire": funcția din db.js, pe o bază a ei (zilele se pot muta doar direct în bază) ════════════
if (faza === 'golire') {
  (async () => {
    const db = require('./db');
    await db.initDb();
    const q = (s, p) => db.pool.query(s, p || []);
    const pune = async (subiect, dosar, zile, atas) => {
      const r = await db.noteazaMailPrimit({ catre: 'contact@ratrack.ro', de_la: 'x@client.ro', subiect, text: 'x', atasamente: atas ? [{ nume: 'a.pdf', tip: 'application/pdf', octeti: 3, pastrat: true, continut: Buffer.from('abc') }] : [] });
      if (dosar) await q("UPDATE mail_primite SET dosar = $2, dosar_la = NOW() - ($3 || ' days')::interval WHERE id = $1", [r.id, dosar, String(zile)]);
      else await q("UPDATE mail_primite SET primit_la = NOW() - ($2 || ' days')::interval WHERE id = $1", [r.id, String(zile)]);
      return r.id;
    };
    const cosVechi = await pune('cos vechi', 'cos', 31, true), cosNou = await pune('cos nou', 'cos', 29), spamVechi = await pune('spam vechi', 'spam', 45);
    const spamNou = await pune('spam nou', 'spam', 2), primitVechi = await pune('primit vechi', null, 400);
    const tr = async (subiect, dosar, zile) => {
      const id = await db.noteazaMailTrimis({ de_la: 'contact@ratrack.ro', catre: 'x@client.ro', subiect, fel: 'mesaj', text: 'x' });
      await q("UPDATE mail_trimise SET dosar = $2, dosar_la = CASE WHEN $4 THEN NOW() - ($3 || ' days')::interval ELSE NULL END, creat_la = NOW() - ($3 || ' days')::interval WHERE id = $1", [id, dosar, String(zile), dosar === 'cos']);
      return id;
    };
    const trCosVechi = await tr('t cos vechi', 'cos', 40), trVechi = await tr('t vechi', 'trimise', 400);
    const r = await db.stergeMailDosareVechi(30);
    const ramase = (await q('SELECT id FROM mail_primite')).rows.map((x) => Number(x.id));
    const ramaseT = (await q('SELECT id FROM mail_trimise')).rows.map((x) => Number(x.id));
    const atasRamase = (await q('SELECT COUNT(*)::int AS n FROM mail_atasamente WHERE mail_id = $1', [cosVechi])).rows[0].n;
    console.log('REZULTAT ' + JSON.stringify({ r, ramase, ramaseT, atasRamase, cosVechi, cosNou, spamVechi, spamNou, primitVechi, trCosVechi, trVechi }));
    process.exit(0);
  })().catch((e) => { console.error('golire: ' + (e && e.stack || e)); process.exit(1); });
  return;
}

(async () => {
  // ─── 1. Pagina și telefonul (fără server) ─────────────────────────────────────────────────────────
  console.log('1. Pagina și telefonul');
  const PAG = citeste('public/index.html');
  const BLOC = (PAG.match(/── începe „Panoul Mail"[\s\S]*?── sfârșit „Panoul Mail" ──/) || [''])[0];
  const MOB = citeste('mobile/src/screens/Mail.tsx'), EP = citeste('mobile/src/api/endpoints.ts');
  const SRV = citeste('server.js'), DB = citeste('db.js');
  const fileWeb = ((BLOC.match(/var _MAIL_FILE = (\[[^\n]*\]);/) || [])[1] || '').match(/\['(\w+)', 'fa-[\w-]+', '([^']+)'\]/g) || [];
  const fileMob = ((MOB.match(/const DOSARE: \[Dosar, string\]\[\] = (\[[^\n]*\]);/) || [])[1] || '').match(/\['(\w+)', '([^']+)'\]/g) || [];
  const perechi = (l) => l.map((x) => x.replace(/'fa-[\w-]+', /, '').replace(/\s+/g, ''));
  T('dosarele: Primite · Trimise · Ciorne · Spam · Coș, în aceeași ordine pe pagină și pe telefon',
    JSON.stringify(perechi(fileWeb)) === JSON.stringify(perechi(fileMob)) && JSON.stringify(perechi(fileMob)) === JSON.stringify(["['primite','Primite']", "['trimise','Trimise']", "['ciorne','Ciorne']", "['spam','Spam']", "['cos','Coș']"]),
    JSON.stringify([perechi(fileWeb), perechi(fileMob)]));
  T('pagina: o SINGURĂ cerere către ruta acțiunilor (raxMailActiune), folosită de rând, de bara bifelor și de fereastra emailului',
    (BLOC.match(/fetch\('\/api\/mail\/actiune'/g) || []).length === 1 && /window\.raxMailBulk = function/.test(BLOC) && /function _mailActeDeschis\(m, su\)/.test(BLOC) &&
    (BLOC.match(/raxMailActiune\(\\'sterge\\'/g) || []).length >= 3);
  T('pagina: „Șterge" nu mai întreabă (merge în Coș); „Șterge definitiv" întreabă, cu „Nu se mai poate recupera."',
    /if \(act === 'definitiv' && !await raConfirm\(/.test(BLOC) && !/raConfirm\('Ștergi emailul/.test(BLOC) && /' Nu se mai poate recupera\.'/.test(BLOC));
  T('pagina: butoanele de pe rând apar la trecerea mouse-ului, iar pe un ecran tactil stau mereu',
    /\.mail-rand:hover \.mail-rapid,\.mail-rand:focus-within \.mail-rapid\{display:flex\}/.test(PAG) && /@media \(hover:none\)\{\.mail-rand\{flex-wrap:wrap\}\.mail-rapid\{display:flex;position:static/.test(PAG));
  T('pagina: ciorna se salvează singură (1,5 s după ultima literă), la închidere, iar la trimitere pleacă `ciorna`',
    /setTimeout\(function \(\) \{ _mail\.ciornaT = null; _mailSalveazaCiorna\(\); \}, 1500\)/.test(BLOC) && /if \(_mail\.ciornaId\) corp\.ciorna = _mail\.ciornaId;/.test(BLOC) &&
    /window\.raxMailInchide = function \(\) \{\s*if \(_mail\.ciornaT\)/.test(BLOC));
  T('pagina: sugestiile la „Către" și „Cc", cerute serverului după ultima adresă scrisă', /fetch\('\/api\/mail\/sugestii\?q=' \+ encodeURIComponent\(tok\)/.test(BLOC) &&
    /id="mail-catre"[^>]*oninput="raxMailSug\(this\)"/.test(BLOC) && /id="mail-cc"[^>]*oninput="raxMailSug\(this\)"/.test(BLOC));
  T('pagina: atributele cheamă funcții de pe window, nu scriu în variabile', !/on(click|input|change)="_mail\./.test(BLOC));
  T('pagina nu socotește zilele Coșului: le ia de la server (dosare.zile, golitText)', /var z = _mail\.dosare\.zile;/.test(BLOC) && !/30 de zile/.test(BLOC) && /m\.golitText/.test(BLOC));
  T('telefonul: aceleași rute (acțiunile, Coșul, ciornele, sugestiile, Spamul ca dosar al celor primite)',
    /'\/api\/mail\/actiune'/.test(EP) && /'\/api\/mail\/cos\?pagina='/.test(EP) && /'\/api\/mail\/ciorne'/.test(EP) && /`\/api\/mail\/ciorne\/\$\{id\}`/.test(EP) &&
    /'\/api\/mail\/sugestii\?q='/.test(EP) && /\(q\.dosar \? '&dosar=' \+ q\.dosar : ''\)/.test(EP) && /\(q\.stea \? '&stea=1' : ''\)/.test(EP));
  T('telefonul: o singură funcție de acțiuni, cu aceeași întrebare la „Șterge definitiv"', (MOB.match(/Api\.mailActiune\(/g) || []).length === 1 &&
    /if \(act === 'definitiv' && !confirm\(/.test(MOB) && /' Nu se mai poate recupera\.'/.test(MOB));
  T('telefonul: ciorna se salvează singură, la închidere, și pleacă la trimitere', /ciornaT\.current = setTimeout\(\(\) => \{ ciornaT\.current = null; salveazaCiorna\(\); \}, 1500\);/.test(MOB) &&
    /const cuCiorna = ciornaId\.current \? \{ ciorna: ciornaId\.current \} : \{\};/.test(MOB) && /async function inchideScrie\(\)/.test(MOB));
  const CUVINTE = ['Selectează tot', 'Cu stea', 'Recuperează', 'Șterge definitiv', 'Nu e spam', 'Nicio ciornă.', 'Spamul e gol.', 'Coșul e gol.',
    'Aici ajung singure emailurile expeditorilor pe care i-ați marcat ca spam', '. „Nu e spam" le mută înapoi în Primite.', 'Emailurile șterse stau aici',
    '. „Recuperează" le pune înapoi de unde au venit.', 'Ciornele se salvează singure cât scrii (fără atașamente) și sunt doar ale tale.',
    'Ce scrii se salvează singur în Ciorne (fără atașamente).', 'Ciornă deschisă: se salvează singură cât scrii.', 'Ciornă salvată la ', 'Ciorna nu s-a putut salva.',
    'Ciorna a fost ștearsă.', ' ciorne șterse.', 'Ștergi definitiv emailul, cu atașamentele lui?', ' emailuri, cu atașamentele lor?', 'Funcția și telefonul se iau', 'Funcția se ia',
    ' din fișa ta (Gestiune → Utilizatori → rândul tău) sau din Setări → Contul meu.', 'Marchează citit', 'Marchează necitit', 'Scoate steaua', 'Pune stea', 'selectat', 'selectate', 'Renunță'];
  const lipsa = CUVINTE.filter((t) => MOB.indexOf(t) < 0 || BLOC.indexOf(t) < 0);
  T('telefonul: aceleași cuvinte ca pagina', !lipsa.length, lipsa.join(' | '));
  // Acțiunile din bara bifelor, pe fiecare dosar: aceleași pe pagină și pe telefon.
  const bulkWeb = {}, bulkMob = {};
  ((BLOC.match(/function _mailBulk\(\) \{[\s\S]*?\n    \}/) || [''])[0].match(/f === '(\w+)'\) act = \[([^\]]*)\]/g) || []).forEach((x) => {
    const k = x.match(/f === '(\w+)'/)[1]; bulkWeb[k] = (x.match(/act = \[([^\]]*)\]/)[1].match(/'(\w+)'\)/g) || []).map((y) => y.slice(1, -2));
  });
  const mb = (MOB.match(/const bulk: \[string, string\]\[\] = [\s\S]*?;\n/) || [''])[0];
  [['primite', /tab === 'primite' \? (\[[^\n]*\])\n/], ['spam', /tab === 'spam' \? (\[[^\n]*\])\n/], ['trimise', /tab === 'trimise' \? (\[[^\n]*\])\n/], ['cos', /tab === 'cos' \? (\[[^\n]*\])\n/]].forEach(([k, re]) => {
    bulkMob[k] = ((mb.match(re) || [])[1] || '').match(/\['(\w+)', /g) ? ((mb.match(re) || [])[1].match(/\['(\w+)', /g) || []).map((y) => y.slice(2, -3)) : [];
  });
  T('bara pentru cele bifate: aceleași acțiuni pe fiecare dosar, pe pagină și pe telefon', ['primite', 'spam', 'trimise', 'cos'].every((k) => JSON.stringify(bulkWeb[k]) === JSON.stringify(bulkMob[k])) &&
    JSON.stringify(bulkWeb.primite) === JSON.stringify(['citit', 'necitit', 'stea', 'spam', 'sterge']) && JSON.stringify(bulkWeb.cos) === JSON.stringify(['recupereaza', 'definitiv']),
    JSON.stringify({ bulkWeb, bulkMob }));
  T('funcția: în fișa omului și în Contul meu (web și telefon)', /id="ue-functie"/.test(PAG) && /const ueBody = \{ role, active, full_name, email, phone, functie \};/.test(PAG) &&
    /camp\('pref-functie', 'Funcția'/.test(PAG) && /JSON\.stringify\(\{ full_name: nume, phone: tel, functie: functie \}\)/.test(PAG) &&
    /id="cm-functie"/.test(citeste('mobile/src/screens/ContulMeu.tsx')) && /functie: String\(form\.functie \|\| ''\)\.trim\(\)/.test(citeste('mobile/src/screens/AdminUsers.tsx')));
  // ─── 2. Serverul, citit ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. Serverul (citit)');
  T('o SINGURĂ funcție face acțiunile: ruta acțiunilor și cele două rute vechi de ștergere', (SRV.match(/await _mailActiune\(req, /g) || []).length === 3 &&
    /const MAIL_ACTIUNI = \['citit', 'necitit', 'stea', 'farastea', 'spam', 'nuspam', 'sterge', 'recupereaza', 'definitiv'\];/.test(SRV));
  T('Spamul: primirea se uită pe lista expeditorilor marcați (pe adresa noastră); un email marcat spam nu sună',
    /if \(m\.de_la && await db\.mailEsteSpam\(catre, m\.de_la\)\) m\.dosar = 'spam';/.test(SRV) && /if \(!r\.deja && m\.dosar !== 'spam'\) \{ try \{ await _anuntaMailPrimit/.test(SRV));
  T('Coșul și Spamul se golesc zilnic, după MAIL_ZILE_DOSARE = 30', /const MAIL_ZILE_DOSARE = 30;/.test(SRV) && /setInterval\(runMailPurge, 24 \* 60 \* 60 \* 1000\)/.test(SRV) &&
    /db\.stergeMailDosareVechi\(MAIL_ZILE_DOSARE\)/.test(SRV));
  const blocDb = (DB.match(/\/\/ Mută emailuri între dosare[\s\S]*?async function numarMailCiorne/) || [''])[0];
  T('numărătorile din db.js vin din RETURNING (rowCount lipsește în PGlite: altfel textul de după ar fi „Nimic de schimbat")', blocDb.length > 500 && !/\.rowCount/.test(blocDb) && (blocDb.match(/RETURNING id/g) || []).length >= 10);
  const backup = require('./backup');
  T('copia: lista expeditorilor marcați și ciornele intră în copie', backup.BUSINESS_TABLES.includes('mail_spam_expeditori') && backup.BUSINESS_TABLES.includes('mail_ciorne'));
  T('sugestiile: dintre conturi doar administratorii firmelor (restul oamenilor unei firme e treaba ei)', /AND role IN \('superadmin', 'company_admin', 'admin'\) AND \(LOWER\(COALESCE\(email/.test(DB));

  // ─── 3. Golirea după 30 de zile (pe o bază a ei) ─────────────────────────────────────────────────
  console.log('\n3. Golirea Coșului și a Spamului');
  const DIRG = path.join(os.tmpdir(), 'rax_maild_g_' + Date.now());
  const g = spawnSync(process.execPath, [__filename, '--faza=golire'], { cwd: __dirname, encoding: 'utf8', timeout: 240000,
    env: Object.assign({}, process.env, { PGLITE_DIR: DIRG, DATABASE_URL: '', NODE_ENV: 'test' }) });
  try { fs.rmSync(DIRG, { recursive: true, force: true }); } catch (e) {}
  const gr = (() => { try { return JSON.parse(((g.stdout || '').match(/REZULTAT (.*)/) || [])[1]); } catch (e) { return null; } })();
  T('pleacă doar ce stă în Coș / Spam de peste 30 de zile (primite și trimise), cu atașamentele; restul — nu, oricât de vechi',
    !!gr && gr.r.primite === 2 && gr.r.trimise === 1 && gr.ramase.indexOf(gr.cosVechi) < 0 && gr.ramase.indexOf(gr.spamVechi) < 0 && gr.ramase.indexOf(gr.cosNou) >= 0 &&
    gr.ramase.indexOf(gr.spamNou) >= 0 && gr.ramase.indexOf(gr.primitVechi) >= 0 && gr.ramaseT.indexOf(gr.trCosVechi) < 0 && gr.ramaseT.indexOf(gr.trVechi) >= 0 && gr.atasRamase === 0,
    gr ? JSON.stringify(gr) : (g.stderr || '').slice(-600));

  // ─── 4. Server pornit ─────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Server pornit');
  const trimise = [];
  const fals = http.createServer((req, res) => {
    let x = ''; req.on('data', (ch) => { x += ch; });
    req.on('end', () => { let j = {}; try { j = JSON.parse(x || '{}'); } catch (e) {} trimise.push({ cale: req.url, corp: j });
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + trimise.length + '@smtp-brevo.com>' })); });
  });
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const PORT = 3345, B = 'http://127.0.0.1:' + PORT, SECRET = 'o-parola-lunga-de-proba-dosare-2026';
  const DIR = path.join(os.tmpdir(), 'rax_maild_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_maild', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: '5345', PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email',
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
    const n0 = trimise.length;
    const r = await json('POST', '/api/users', S, corp);
    for (let i = 0; i < 25 && !trimise.slice(n0).some((x) => x.corp.to && x.corp.to[0].email === corp.username); i++) await sleep(200);
    const inv = trimise.slice(n0).filter((x) => x.corp.to && x.corp.to[0].email === corp.username)[0];
    const tok = inv && (String(inv.corp.textContent || '').match(/token=([A-Za-z0-9_-]+)/) || [])[1];
    if (!tok) throw new Error('fără invitație pentru ' + corp.username + ': ' + JSON.stringify(r.j).slice(0, 200));
    const p = await fetch(B + '/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: parola }) });
    if (!p.ok) throw new Error('set-password: ' + p.status);
    return r.j;
  };
  let nr = 0;
  const mime = (o) => {
    const gr2 = 'g' + (++nr);
    const L = ['From: ' + o.from, 'To: ' + o.to, 'Subject: ' + o.subiect, 'Message-ID: <d' + nr + '.' + Date.now() + '@x.ro>', 'Date: Tue, 13 Oct 2026 07:30:00 +0000', 'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + gr2 + '"', '', '--' + gr2, 'Content-Type: text/plain; charset=utf-8', '', o.text || 'x'];
    if (o.atas) L.push('--' + gr2, 'Content-Type: application/pdf; name="' + o.atas + '"', 'Content-Disposition: attachment; filename="' + o.atas + '"', 'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-1.4 x').toString('base64'));
    L.push('--' + gr2 + '--', '');
    return Buffer.from(L.join('\r\n'), 'utf8');
  };
  const primeste = async (o, catre) => {
    const x = await fetch(B + '/api/mail/primeste', { method: 'POST', headers: { 'Content-Type': 'message/rfc822', 'X-RA-Secret': SECRET, 'X-RA-Catre': catre }, body: mime(Object.assign({ to: catre }, o)) });
    let j = {}; try { j = await x.json(); } catch (e) {}
    return { status: x.status, j: j };
  };
  const act = (ck, actiune, el) => json('POST', '/api/mail/actiune', ck, { actiune, elemente: el });
  const P = (id) => ({ sursa: 'primit', id: id }), TR = (id) => ({ sursa: 'trimis', id: id });
  const lista = async (ck, q) => ((await json('GET', '/api/mail/primite' + (q || ''), ck)).j.mailuri || []);
  const cos = async (ck) => ((await json('GET', '/api/mail/cos', ck)).j.mailuri || []);
  const dosare = async (ck) => (await json('GET', '/api/mail/adrese', ck)).j.dosare || {};
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    const S = await login('admin', 'test1234');
    await contNou(S, { username: 'robert.gherbali@ratrack.ro', email: 'robert.gherbali@ratrack.ro', full_name: 'Robert Gherbali', role: 'superadmin', phone: '0729699847' }, 'Strada-Verde-2026x');
    const alin = await contNou(S, { username: 'alin.tilvar@ratrack.ro', email: 'alin.tilvar@ratrack.ro', full_name: 'Alin Tîlvar', role: 'superadmin' }, 'Strada-Rosie-2026x');
    const R = await login('robert.gherbali@ratrack.ro', 'Strada-Verde-2026x');
    const A = await login('alin.tilvar@ratrack.ro', 'Strada-Rosie-2026x');
    T('pregătire: doi fondatori pe ratrack.ro, autentificați', !!(R && A));

    // Funcția: din fișa omului (PUT /api/users/:id) și din Contul meu.
    const fa = await json('PUT', '/api/users/' + alin.id, S, { functie: 'Director tehnic' });
    await json('PUT', '/api/me/profile', R, { functie: 'Director general' });
    const me = (await json('GET', '/api/me', A)).j;
    const adrA = (await json('GET', '/api/mail/adrese', A)).j.adrese || [];
    const alinA = adrA.filter((x) => x.adresa === 'alin.tilvar@ratrack.ro')[0] || {};
    T('funcția pusă din fișa omului ajunge în profil și în semnătura de pe adresa lui', fa.status === 200 && me.functie === 'Director tehnic' &&
      alinA.semnatura === 'Alin Tîlvar · Director tehnic · RA Track · alin.tilvar@ratrack.ro · ratrack.ro' && alinA.faraFunctie === false && alinA.faraTelefon === true, JSON.stringify(alinA));
    const d0 = await dosare(R);
    T('panoul: dosarele cu numărul lor și zilele scrise de server', d0.spam === 0 && d0.cos === 0 && d0.ciorne === 0 && d0.zile === 30, JSON.stringify(d0));

    // Emailuri primite.
    const e1 = (await primeste({ from: 'Ion Client <ion@client.ro>', subiect: 'Comanda 1', atas: 'comanda.pdf' }, 'contact@ratrack.ro')).j.id;
    const e2 = (await primeste({ from: 'ion@client.ro', subiect: 'Comanda 2' }, 'contact@ratrack.ro')).j.id;
    const r1 = await primeste({ from: 'Reclame <oferte@reclame.ro>', subiect: 'Super ofertă' }, 'contact@ratrack.ro');
    const pers = (await primeste({ from: 'oferte@reclame.ro', subiect: 'Pentru Robert' }, 'robert.gherbali@ratrack.ro')).j.id;
    const persIon = (await primeste({ from: 'Vasile <vasile@partener.ro>', subiect: 'Personal' }, 'robert.gherbali@ratrack.ro')).j.id;
    T('pregătire: emailuri pe adresa comună și pe cea a lui Robert', !!(e1 && e2 && r1.j.id && pers && persIon) && r1.j.spam === false, JSON.stringify(r1.j));

    // Spamul.
    const sp = await act(A, 'spam', [P(r1.j.id)]);
    const inPr = (await lista(A)).some((m) => m.id === r1.j.id), inSp = (await lista(A, '?dosar=spam')).some((m) => m.id === r1.j.id && m.dosar === 'spam');
    T('„Spam": emailul pleacă din Primite în Spam, cu textul scris de server', sp.status === 200 && sp.j.facute === 1 && sp.j.text === '1 email mutat în Spam.' && !inPr && inSp,
      JSON.stringify(sp.j));
    const r2 = await primeste({ from: 'oferte@reclame.ro', subiect: 'Încă o ofertă' }, 'contact@ratrack.ro');
    const r3 = await primeste({ from: 'oferte@reclame.ro', subiect: 'Pentru Robert 2' }, 'robert.gherbali@ratrack.ro');
    T('„2. a": următorul email al expeditorului marcat merge singur în Spam — doar pe adresa pe care l-am marcat', r2.j.spam === true && r3.j.spam === false &&
      (await lista(A, '?dosar=spam')).some((m) => m.id === r2.j.id) && (await lista(R)).some((m) => m.id === r3.j.id), JSON.stringify([r2.j, r3.j]));
    const nec = (await json('GET', '/api/mail/necitite', R)).j;
    const dsp = await dosare(R);
    T('Spamul nu se numără la necitite; are numărul lui', dsp.spam === 2 && nec.peAdresa && nec.peAdresa['contact@ratrack.ro'] === 2, JSON.stringify({ dsp, nec }));
    const ns = await act(R, 'nuspam', [P(r2.j.id)]);
    const r4 = await primeste({ from: 'oferte@reclame.ro', subiect: 'A treia' }, 'contact@ratrack.ro');
    T('„Nu e spam" (Robert, pe comuna): emailul se întoarce în Primite, iar expeditorul iese de pe listă', ns.j.facute === 1 && r4.j.spam === false &&
      (await lista(R)).some((m) => m.id === r2.j.id), JSON.stringify([ns.j, r4.j]));

    // Cine vede ce.
    const strain = await act(A, 'sterge', [P(pers)]);
    const strainSt = await act(A, 'stea', [P(persIon)]);
    T('Alin nu poate face nimic pe emailurile adresei lui Robert (nici Coș, nici stea): „negăsite"', strain.j.facute === 0 && strain.j.negasite === 1 && strainSt.j.facute === 0 &&
      (await lista(R)).some((m) => m.id === pers && !m.stea), JSON.stringify([strain.j, strainSt.j]));
    const refuz = [await json('POST', '/api/mail/actiune', A, { actiune: 'arunca', elemente: [P(e1)] }), await json('POST', '/api/mail/actiune', A, { actiune: 'sterge', elemente: [] }),
      await json('POST', '/api/mail/actiune', A, { actiune: 'sterge', elemente: Array.from({ length: 201 }, (_, i) => P(i + 1)) })];
    T('refuzuri pe față: acțiune necunoscută, nimic ales, peste 200 deodată (400)', refuz.every((x) => x.status === 400 && x.j.error), refuz.map((x) => x.status).join(','));

    // Acțiuni pe mai multe deodată.
    const ci = await act(A, 'citit', [P(e1), P(e2)]);
    const ne = await act(A, 'necitit', [P(e1)]);
    const st = await act(A, 'stea', [P(e1), P(e2)]);
    const cuStea = (await lista(R, '?stea=1')).map((m) => m.id).sort();
    T('bife: citit (2), necitit (1), stea (2) — „Cu stea" arată doar cele două, la toți cei care văd adresa',
      ci.j.text === '2 emailuri marcate citite.' && ne.j.text === '1 email marcat necitit.' && st.j.facute === 2 && JSON.stringify(cuStea) === JSON.stringify([e1, e2].sort()),
      JSON.stringify([ci.j, ne.j, st.j, cuStea]));
    await act(A, 'farastea', [P(e2)]);

    // Coșul.
    const sterg = await act(A, 'sterge', [P(e1), P(e2)]);
    const c1 = await cos(R);
    const d1 = await dosare(R);
    const golit = (c1.filter((m) => m.id === e1)[0] || {}).golitText || '';
    const peste30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' });
    T('„Șterge" pe două: amândouă în Coș (Robert le vede), cu ziua în care se șterg singure (peste 30 de zile)', sterg.j.text === '2 emailuri mutate în Coș.' &&
      c1.filter((m) => m.sursa === 'primit' && (m.id === e1 || m.id === e2)).length === 2 && d1.cos === 2 && golit === 'se șterge singur pe ' + peste30 &&
      !(await lista(R)).some((m) => m.id === e1 || m.id === e2), JSON.stringify({ t: sterg.j.text, golit, d1 }));
    T('Coșul lui Alin nu are emailurile adresei lui Robert; filtrul pe o adresă merge', !(await cos(A)).some((m) => m.id === pers) &&
      ((await json('GET', '/api/mail/cos?adresa=robert.gherbali@ratrack.ro', A)).j.mailuri || []).length === 0);
    const defNu = await act(A, 'definitiv', [P(r4.j.id)]);
    T('„Șterge definitiv" doar din Coș: un email din Primite rămâne', defNu.j.facute === 0 && (await lista(A)).some((m) => m.id === r4.j.id), JSON.stringify(defNu.j));
    const rec = await act(A, 'recupereaza', [P(e2)]);
    T('„Recuperează": înapoi în Primite (cu steaua și starea lui)', rec.j.text === '1 email recuperat.' && (await lista(A)).some((m) => m.id === e2), JSON.stringify(rec.j));
    await act(A, 'sterge', [P(r1.j.id)]);
    await act(A, 'recupereaza', [P(r1.j.id)]);
    T('…un email șters din Spam se întoarce în Spam', (await lista(A, '?dosar=spam')).some((m) => m.id === r1.j.id));
    const atasId = (((await json('GET', '/api/mail/primite/' + e1, R)).j.atasamente || [])[0] || {}).id;
    const def = await act(R, 'definitiv', [P(e1)]);
    const dupa = await json('GET', '/api/mail/primite/' + e1, R);
    const at = await fetch(B + '/api/mail/primite/' + e1 + '/atasamente/' + atasId, { headers: { Cookie: R } });
    T('„Șterge definitiv" din Coș: emailul și atașamentul nu mai există', def.j.text === '1 email șters definitiv.' && dupa.status === 404 && at.status === 404 && !!atasId,
      JSON.stringify(def.j) + ' ' + dupa.status + ' ' + at.status);

    // Trimise: stea, Coș, dovada.
    const s1 = await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'ion@client.ro', subiect: 'Oferta noastră', text: 'Bună ziua' });
    const tl = (await json('GET', '/api/mail/trimise', R)).j.mailuri || [];
    const mesaj = tl.filter((x) => x.subiect === 'Oferta noastră')[0] || {}, inv = tl.filter((x) => x.fel === 'invitatie')[0] || {};
    const stT = await act(R, 'stea', [TR(mesaj.id)]);
    const cuSteaT = ((await json('GET', '/api/mail/trimise?stea=1', R)).j.mailuri || []).map((x) => x.id);
    T('steaua și pe emailurile trimise', s1.status === 200 && stT.j.facute === 1 && JSON.stringify(cuSteaT) === JSON.stringify([mesaj.id]), JSON.stringify([s1.j, cuSteaT]));
    const stDov = await act(R, 'sterge', [TR(mesaj.id), TR(inv.id)]);
    T('„Șterge" pe un mesaj și o invitație: mesajul în Coș, invitația rămâne (dovada) — și se spune', stDov.j.facute === 1 && stDov.j.dovada === 1 &&
      /1 email n-a fost șters: facturile, contractele, avertismentele și invitațiile rămân/.test(stDov.j.text) &&
      (await cos(R)).some((m) => m.sursa === 'trimis' && m.id === mesaj.id) && ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).some((x) => x.id === inv.id), JSON.stringify(stDov.j));
    const recT = await act(R, 'recupereaza', [TR(mesaj.id)]);
    T('…și se recuperează înapoi în Trimise', recT.j.facute === 1 && ((await json('GET', '/api/mail/trimise', R)).j.mailuri || []).some((x) => x.id === mesaj.id));

    // Ciornele.
    const c0 = await json('POST', '/api/mail/ciorne', R, { de_la: 'contact@ratrack.ro', catre: '', cc: '', subiect: '', text: '' });
    const cr = await json('POST', '/api/mail/ciorne', R, { de_la: 'contact@ratrack.ro', catre: 'ion@client.ro', subiect: 'Revin', text: 'Bună ziua, rev' });
    const cr2 = await json('POST', '/api/mail/ciorne', R, { id: cr.j.id, de_la: 'contact@ratrack.ro', catre: 'ion@client.ro', subiect: 'Revin', text: 'Bună ziua, revin mâine.' });
    const lc = (await json('GET', '/api/mail/ciorne', R)).j.ciorne || [], lcA = (await json('GET', '/api/mail/ciorne', A)).j.ciorne || [];
    const altuia = [await json('DELETE', '/api/mail/ciorne/' + cr.j.id, A), await json('POST', '/api/mail/ciorne', A, { id: cr.j.id, catre: 'x@y.ro', text: 'furat' })];
    T('ciornele: o fereastră goală nu face ciornă; a doua salvare o rescrie pe aceeași; ale lui Robert nu le vede, nu le șterge și nu le rescrie Alin (404)',
      c0.j.id === null && cr.j.id && cr2.j.id === cr.j.id && lc.length === 1 && lc[0].text === 'Bună ziua, revin mâine.' && !lcA.length && altuia.every((x) => x.status === 404) &&
      (await dosare(R)).ciorne === 1 && (await dosare(A)).ciorne === 0, JSON.stringify({ c0: c0.j, cr: cr.j, cr2: cr2.j, alt: altuia.map((x) => x.status) }));
    const cRasp = await json('POST', '/api/mail/ciorne', R, { de_la: 'contact@ratrack.ro', catre: 'ion@client.ro', subiect: 'Re: Comanda 2', text: 'Mulțumim', raspunsLa: e2 });
    const lc2 = (await json('GET', '/api/mail/ciorne', R)).j.ciorne || [];
    T('…ciorna unui răspuns își ține minte emailul la care răspunde', (lc2.filter((x) => x.id === cRasp.j.id)[0] || {}).raspunsLa === e2);
    const trimC = await json('POST', '/api/mail/trimite', R, { de_la: 'contact@ratrack.ro', catre: 'ion@client.ro', subiect: 'Revin', text: 'Bună ziua, revin mâine.', ciorna: cr.j.id });
    T('după ce emailul pleacă, ciorna lui se șterge (o face serverul)', trimC.status === 200 && !((await json('GET', '/api/mail/ciorne', R)).j.ciorne || []).some((x) => x.id === cr.j.id));
    const stC = await json('DELETE', '/api/mail/ciorne/' + cRasp.j.id, R);
    T('Robert își șterge ciorna', stC.status === 200 && (await dosare(R)).ciorne === 0);

    // Sugestiile.
    const sg = async (ck, q) => ((await json('GET', '/api/mail/sugestii?q=' + encodeURIComponent(q), ck)).j.sugestii || []);
    const sIon = await sg(R, 'ion'), sScurt = await sg(R, 'i'), sNoi = await sg(R, 'ratrack'), sVas = await sg(A, 'vasile'), sVasR = await sg(R, 'vasile');
    T('sugestiile: cine ne-a scris (cu numele) și cui i-am scris; fără adresele noastre; de la 2 litere',
      sIon.some((x) => x.adresa === 'ion@client.ro') && sVasR.some((x) => x.adresa === 'vasile@partener.ro' && x.nume === 'Vasile' && x.sursa === 'a scris') &&
      !sScurt.length && !sNoi.some((x) => /@ratrack\.ro$/.test(x.adresa)), JSON.stringify({ sIon, sVasR, sNoi }));
    T('…cei care au scris pe adresa lui Robert nu-i apar lui Alin', !sVas.length && sVasR.some((x) => x.adresa === 'vasile@partener.ro'), JSON.stringify({ sVas, sVasR }));

    // Golirea de mână (nimic nou nu pleacă) și jurnalul.
    await act(R, 'sterge', [P(r4.j.id)]);
    const gm = await json('POST', '/api/admin/mail/goleste-vechi', R);
    T('golirea de mână: nimic de sub 30 de zile nu pleacă', gm.status === 200 && gm.j.zile === 30 && gm.j.primite === 0 && gm.j.trimise === 0 && (await cos(R)).some((m) => m.id === r4.j.id), JSON.stringify(gm.j));
    const aud = await json('GET', '/api/audit?limit=300', S);
    const randuri = Array.isArray(aud.j) ? aud.j : (aud.j.rows || aud.j.entries || aud.j.logs || []);
    const acts = randuri.map((r) => r.action);
    T('acțiunile intră în jurnal, fără conținut (subiecte, texte)', ['mail_spam', 'mail_nuspam', 'mail_citit', 'mail_stea', 'mail_sterge', 'mail_recupereaza', 'mail_definitiv'].every((a) => acts.indexOf(a) >= 0) &&
      !/Comanda 1|Super ofertă|revin mâine/.test(JSON.stringify(randuri.filter((r) => /^mail_/.test(r.action || '')))), acts.filter((a) => /^mail_/.test(a || '')).join(','));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
