// mailer.js — trimiterea emailului, pe O SINGURĂ cale pentru toată aplicația: contracte, facturi, avertismentele de
// neplată, invitații și linkuri de parolă, rapoarte programate, notificări (channels.js trece tot pe aici).
// Două feluri, alese din variabilele de mediu:
//   • Brevo, prin API-ul lor pe HTTPS: BREVO_API_KEY. Merge și pe Railway Hobby, care blochează SMTP (Robert, 12.10:
//     „am făcut contul, îl putem integra?"). Câștigă dacă sunt setate amândouă.
//   • SMTP (nodemailer): SMTP_HOST + SMTP_USER (+ SMTP_PORT, SMTP_SECURE, SMTP_PASS), ca până acum.
// Expeditorul: EMAIL_FROM, apoi SMTP_FROM, apoi „RA Track <noreply@ratrack.ro>" (la Brevo, adresa trebuie să fie pe
// un domeniu autentificat în contul Brevo — ratrack.ro, cu înregistrările lor în Cloudflare).
// DORMANT fără niciuna: send() întoarce { ok: false } și ecranele spun „serverul n-are email".
const fs = require('fs');
const path = require('path');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) { /* dep opțional */ }
let _tx = null;

const BREVO_URL_IMPLICIT = 'https://api.brevo.com/v3/smtp/email';
const PUBLIC_DIR = path.join(__dirname, 'public');

function _brevoKey() { return String(process.env.BREVO_API_KEY || '').trim() || null; }
function _smtpGata() { return !!(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER); }
// Pe ce cale pleacă emailul acum: 'brevo' | 'smtp' | null.
function fel() { return _brevoKey() ? 'brevo' : (_smtpGata() ? 'smtp' : null); }
function enabled() { return fel() !== null; }

function _transport() {
  if (_tx) return _tx;
  if (!_smtpGata()) return null;
  _tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || 'false') === 'true', // true doar pt. portul 465
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
  });
  return _tx;
}
function fromAddr() {
  const scris = process.env.EMAIL_FROM || process.env.SMTP_FROM;
  if (scris) return scris;
  return 'RA Track <' + ((fel() === 'smtp' && process.env.SMTP_USER) || 'noreply@ratrack.ro') + '>';
}

// „Nume <adresa@x.ro>" sau „adresa@x.ro" → { name?, email }.
function _adresa(s) {
  const t = String(s || '').trim();
  const m = t.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (m) { const o = { email: m[2].trim() }; if (m[1].trim()) o.name = m[1].trim().slice(0, 70); return o; }
  return { email: t };
}
function _destinatari(to) {
  const lista = Array.isArray(to) ? to : String(to || '').split(/[,;]/);
  return lista.map(function (x) { return typeof x === 'object' && x && x.email ? { email: String(x.email) } : _adresa(x); })
    .filter(function (x) { return x.email; });
}
function _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Brevo cere conținut HTML. Un email scris doar ca text (invitațiile, rapoartele) devine HTML cu același text, rândurile
// păstrate și linkurile apăsabile (linkul de parolă trebuie să se poată apăsa).
function _htmlDinText(text) {
  const e = _esc(text || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;">' + e + '</div>';
}
function _baza() { return String(process.env.BASE_URL || 'https://ratrack.ro').replace(/\/$/, ''); }

// ─── Chenarul casei (Robert, 13.10: „un template de mail cu logo" — „1, b": pe TOATE emailurile care pleacă din aplicație) ───
// Ca emailul cu factura: bandă închisă cu sigla (imaginea albă) și linia verde, textul pe alb, un rând cu ratrack.ro dedesubt.
// Se pune singur în send(): invitații, linkuri de parolă, contracte, avertismente, rapoarte, panoul Mail. Un email care își
// are deja antetul cu sigla (factura) nu-l mai primește a doua oară; `cadru: false` îl oprește dinadins.
// Sigla vine „în corp" (cid); la Brevo, care nu primește cid, _pentruBrevo o cere de pe site (public/logo.png).
const LOGO_CID = 'logo@ratrack.ro';
const LOGO = { filename: 'logo.png', path: path.join(PUBLIC_DIR, 'logo.png'), cid: LOGO_CID, contentType: 'image/png' };
function cadru(continut) {
  return '<div style="background:#f1f5f9;padding:24px 10px;">'
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a2235;">'
      + '<div style="background:#0B0E11;padding:18px 20px 16px;border-radius:10px 10px 0 0;border-bottom:3px solid #3FE07D;">'
        + '<img src="cid:' + LOGO_CID + '" width="180" height="35" alt="RA Track" style="display:block;border:0;color:#fff;font:bold 20px Arial,Helvetica,sans-serif;"></div>'
      + '<div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2235;">'
        + continut + '</div>'
      + '<div style="text-align:center;font-size:12px;color:#475569;padding:12px 8px 0;">RA Track · monitorizare GPS pentru flote · '
        + '<a href="' + _baza() + '" style="color:#15803d;text-decoration:none;">ratrack.ro</a></div>'
    + '</div></div>';
}
function _cuCadru(m) {
  if (m.cadru === false) return m;
  const html = m.html || _htmlDinText(m.text);
  if (html.indexOf('cid:' + LOGO_CID) >= 0) return m;   // își are deja antetul cu sigla (emailul cu factura)
  return Object.assign({}, m, { html: cadru(html), attachments: (m.attachments || []).concat([LOGO]) });
}

// ─── Semnătura (Robert, 13.10: „2 da pentru robert 0729699847, trebuie să avem în fișă numărul de telefon"; apoi „la
// semnătură vreau să fie și funcția și adresa de mail") ───
// Doar pe emailurile scrise din panoul Mail. Numele, funcția și telefonul din fișa omului (users.full_name / functie / phone),
// adresa de pe care pleacă; pe adresa comună, „Echipa RA Track", fără funcție și telefon. Un număr românesc de 10 cifre se
// scrie pe grupe: „0729 699 847".
function _tel(t) {
  const s = String(t || '').trim(), c = s.replace(/[\s.\-()]/g, '');
  return /^0\d{9}$/.test(c) ? c.slice(0, 4) + ' ' + c.slice(4, 7) + ' ' + c.slice(7) : s;
}
function semnatura(o) {
  o = o || {};
  const nume = String(o.nume || '').trim() || 'Echipa RA Track';
  const functie = String(o.functie || '').trim();
  const tel = _tel(o.telefon);
  const email = String(o.email || '').trim().toLowerCase();
  const echipa = /RA Track/.test(nume);
  const rand2 = echipa ? '' : (functie ? functie + ' · RA Track' : 'RA Track');
  const rand3 = (email ? email + ' · ' : '') + 'ratrack.ro';
  const randuri = [nume].concat(rand2 ? [rand2] : [], [rand3], tel ? ['Tel. ' + tel] : []);
  const link = '<a href="' + _baza() + '" style="color:#15803d;text-decoration:none;">ratrack.ro</a>';
  return {
    text: '\n\n--\n' + randuri.join('\n'),
    rand: randuri.join(' · '),   // cum se arată pe ecran, sub mesaj
    html: '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.5;color:#475569;">'
      + '<b style="color:#1a2235;">' + _esc(nume) + '</b>'
      + (rand2 ? '<br>' + _esc(rand2) : '')
      + '<br>' + (email ? '<a href="mailto:' + _esc(email) + '" style="color:#15803d;text-decoration:none;">' + _esc(email) + '</a> · ' : '') + link
      + (tel ? '<br>Tel. ' + _esc(tel) : '') + '</div>',
  };
}
// Mesajul scris de om + semnătura: sub textul lui și DEASUPRA mesajului citat / redirecționat, când acela e încă în text
// (neschimbat); altfel, la capăt. Citatul iese în HTML cu o linie gri în stânga.
function cuSemnatura(text, citat, semn) {
  const t = String(text || '');
  const c = String(citat || '').trim();
  const i = c ? t.lastIndexOf(c) : -1;
  const sus = (i >= 0 ? t.slice(0, i) : t).replace(/\s+$/, '');
  const jos = i >= 0 ? t.slice(i) : '';
  return {
    text: sus + semn.text + (jos ? '\n\n' + jos : ''),
    html: (sus ? _htmlDinText(sus) : '') + semn.html
      + (jos ? '<div style="margin-top:18px;padding-left:12px;border-left:3px solid #e2e8f0;color:#64748b;">' + _htmlDinText(jos) + '</div>' : ''),
  };
}

// Atașamentele în forma nodemailer ({ filename, content | path, cid, encoding }) → forma Brevo ({ name, content base64 }).
// Brevo NU primește imagini „în corp" (cid): una din public/ (sigla din emailul cu factura) se cere de pe site, de la
// aceeași adresă; altfel imaginea lipsește și rămâne textul ei (alt). Nu se trimite ca atașament: ar apărea ca fișier.
function _pentruBrevo(m) {
  let html = m.html || _htmlDinText(m.text);
  const atas = [];
  (m.attachments || []).forEach(function (a) {
    if (!a) return;
    if (a.cid) {
      const p = a.path ? path.resolve(a.path) : null;
      const url = p && p.indexOf(PUBLIC_DIR + path.sep) === 0 ? _baza() + '/' + path.relative(PUBLIC_DIR, p).split(path.sep).join('/') : '';
      html = html.split('cid:' + a.cid).join(url);
      return;
    }
    let b64 = null;
    if (Buffer.isBuffer(a.content)) b64 = a.content.toString('base64');
    else if (typeof a.content === 'string') b64 = a.encoding === 'base64' ? a.content : Buffer.from(a.content, a.encoding || 'utf8').toString('base64');
    else if (a.path) b64 = fs.readFileSync(a.path).toString('base64');
    if (b64 == null) return;
    atas.push({ name: String(a.filename || (a.path ? path.basename(a.path) : 'atasament')), content: b64 });
  });
  const corp = {
    sender: (function () { const s = _adresa(m.from || fromAddr()); if (!s.name) s.name = 'RA Track'; return s; })(),
    to: _destinatari(m.to),
    subject: m.subject || '(fără subiect)',
    htmlContent: html,
  };
  if (m.text) corp.textContent = String(m.text);
  if (m.cc) { const cc = _destinatari(m.cc); if (cc.length) corp.cc = cc; }   // „Răspunde tuturor" (13.10)
  if (m.replyTo) corp.replyTo = _adresa(m.replyTo);
  if (atas.length) corp.attachment = atas;
  // Un răspuns din panoul Mail (etapa 2) spune la ce email răspunde, ca programul omului să-l pună în aceeași discuție.
  if (m.inReplyTo) corp.headers = { 'In-Reply-To': String(m.inReplyTo), References: String(m.references || m.inReplyTo) };
  return corp;
}

async function _postBrevo(corp) {
  const r = await fetch(process.env.BREVO_API_URL || BREVO_URL_IMPLICIT, {
    method: 'POST',
    headers: { 'api-key': _brevoKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corp),
    signal: AbortSignal.timeout(20000),
  });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  return { r: r, t: t, j: j };
}
async function _trimiteBrevo(m) {
  const corp = _pentruBrevo(m);
  if (!corp.to.length) return { ok: false, error: 'Fără destinatar' };
  try {
    let x = await _postBrevo(corp);
    // Brevo nu spune în documentație dacă primește antetele de discuție. Dacă le refuză, emailul pleacă fără ele —
    // răspunsul ajunge oricum, cu „Re:" și cu mesajul citat dedesubt.
    if (x.r.status === 400 && corp.headers) { delete corp.headers; x = await _postBrevo(corp); }
    if (x.r.ok) return { ok: true, id: x.j.messageId || (x.j.messageIds && x.j.messageIds[0]) || null };
    return { ok: false, error: 'Brevo ' + x.r.status + ': ' + (x.j.message || x.t || 'eroare').toString().slice(0, 300) };
  } catch (e) { return { ok: false, error: 'Brevo: ' + e.message }; }
}

// ─── Jurnalul „Trimise" din panoul Mail (12.10) ───
// Un email cu `jurnal: { fel, companyId, userId }` se scrie, după trimitere (reușită sau nu), prin funcția pusă de server
// (`setJurnal`) — mailer.js nu știe de bază. Fără `jurnal`, emailul NU se scrie: rapoartele și alertele pe care o firmă și
// le trimite singură oamenilor ei nu intră în „Trimise" (hotărât: nu ne uităm la ce face o companie).
let _jurnal = null;
function setJurnal(fn) { _jurnal = typeof fn === 'function' ? fn : null; }
async function _noteaza(m, r) {
  if (!m.jurnal || !_jurnal) return null;
  try {
    return await _jurnal({
      de_la: _adresa(m.from || fromAddr()).email.toLowerCase(),
      catre: _destinatari(m.to).map(function (x) { return x.email; }).join(', '),
      cc: m.cc ? _destinatari(m.cc).map(function (x) { return x.email; }).join(', ') || null : null,
      subiect: m.subject || '(fără subiect)', text: m.text || null, html: m.html || null,
      atasamente: (m.attachments || []).filter(function (a) { return a && !a.cid; }).map(function (a) {
        const n = Buffer.isBuffer(a.content) ? a.content.length : (typeof a.content === 'string' ? Buffer.byteLength(a.content, a.encoding || 'utf8') : null);
        return { nume: String(a.filename || (a.path ? path.basename(a.path) : 'atasament')), octeti: n };
      }),
      fel: m.jurnal.fel || null, companyId: m.jurnal.companyId != null ? m.jurnal.companyId : null,
      userId: m.jurnal.userId != null ? m.jurnal.userId : null,
      stare: r.ok ? 'trimis' : 'esuat', eroare: r.ok ? null : (r.error || null), cale: fel(), mesajId: r.id || null,
      raspunsPentru: m.jurnal.raspunsPentru != null ? m.jurnal.raspunsPentru : null,
    });
  } catch (e) { return null; /* jurnalul nu are voie să strice trimiterea */ }
}

// ─── Starea trimiterii (22.10, Alin: „mailul nu mai funcționează… a funcționat, apoi nu a mai mers") ───
// Brevo refuza serverul după o publicare (adresa lui nouă nu era autorizată), iar aplicația nu spunea nimănui: rândul „Email" din
// „Stare producție" era verde fiindcă cheia era pusă. Acum ultimul email plecat și ultimul refuzat se țin minte aici; serverul
// le scrie în bază, le arată și ne anunță (setLaRezultat). `motiv` spune pe înțeles ce s-a întâmplat și ce e de făcut.
let _stare = { reusitLa: null, esuatLa: null, eroare: null };
let _laRezultat = null;
function setLaRezultat(fn) { _laRezultat = typeof fn === 'function' ? fn : null; }
function stare() { return Object.assign({}, _stare); }
function motiv(eroare) {
  const e = String(eroare || '');
  if (/unrecogni[sz]ed ip|ip address|authori[sz]ed ip|not verified/i.test(e)) return {
    fel: 'ip', scurt: 'Brevo refuză adresa serverului nostru: Railway o schimbă la fiecare publicare, iar Brevo blochează din oficiu adresele necunoscute.',
    ceFaceti: 'În Brevo: Settings › Security › Authorised IPs — opriți blocarea adreselor necunoscute (o adresă adăugată de mână nu ține: după următoarea publicare vine alta).'
  };
  if (/brevo 40[13]\b/i.test(e)) return { fel: 'cheie', scurt: 'Brevo nu primește cheia serverului (cheie schimbată sau ștearsă, ori cont suspendat).', ceFaceti: 'Verificați în Brevo contul și cheia API, apoi BREVO_API_KEY din Railway.' };
  if (/brevo 402\b|credit|quota|limit/i.test(e)) return { fel: 'limita', scurt: 'Brevo: s-a terminat numărul de emailuri al contului (planul gratuit: 300 pe zi).', ceFaceti: 'Verificați planul în Brevo.' };
  if (/timeout|abort|fetch failed|enotfound|econnreset|eai_again/i.test(e)) return { fel: 'retea', scurt: 'Serverul de email n-a răspuns la timp.', ceFaceti: 'De obicei trece singur; dacă ține, verificați starea Brevo.' };
  return { fel: 'alta', scurt: 'Emailul a fost refuzat.', ceFaceti: 'Mesajul exact e mai jos.' };
}

// send({to, cc?, subject, html, text, attachments, replyTo, from?, inReplyTo?, references?, jurnal?, cadru?}) → { ok, id?, error?, jurnalId? }. Nu aruncă (best-effort).
// Chenarul casei se pune aici (_cuCadru), o dată pentru toate căile; „Trimise" ține emailul fără el (conținutul scris).
// `replyTo`: unde ajunge răspunsul omului (ex. contractul trimis înapoi semnat) — adresa noastră, nu noreply.
// `from`: altă adresă de-a noastră decât cea implicită (panoul Mail: robert.gherbali@…); o verifică serverul, nu aici.
async function send(m) {
  if (!m || !m.to) return { ok: false, error: 'Fără destinatar' };
  const scris = m;   // ce a scris omul / aplicația — așa intră în „Trimise"
  m = _cuCadru(m);
  let r;
  if (fel() === 'brevo') r = await _trimiteBrevo(m);
  else {
    const tx = _transport();
    if (!tx) r = { ok: false, error: 'Email neconfigurat (nici Brevo, nici SMTP)' };
    else {
      try {
        const info = await tx.sendMail({ from: m.from || fromAddr(), to: m.to, cc: m.cc || undefined, replyTo: m.replyTo || undefined, subject: m.subject || '(fără subiect)', html: m.html, text: m.text, attachments: m.attachments,
          inReplyTo: m.inReplyTo || undefined, references: m.inReplyTo ? (m.references || m.inReplyTo) : undefined });
        r = { ok: true, id: info && info.messageId };
      } catch (e) { r = { ok: false, error: e.message }; }
    }
  }
  if (r.ok) _stare.reusitLa = Date.now();
  else { _stare.esuatLa = Date.now(); _stare.eroare = String(r.error || 'eroare').slice(0, 500); }
  r.cale = fel();
  // Serverul primește și emailul (destinatarii, `livrare` / `jurnal`), ca să poată întreba Brevo, mai târziu, dacă a ajuns (28.10).
  if (_laRezultat) { try { _laRezultat(r, scris); } catch (e) { /* starea nu are voie să strice trimiterea */ } }
  const jid = await _noteaza(scris, r);
  if (jid != null) r.jurnalId = jid;   // rândul din „Trimise" (răspunsul se leagă de emailul primit)
  return r;
}
// Adresa de bază a API-ului Brevo (din adresa de trimitere, ca probele să-l poată muta pe un server fals cu BREVO_API_URL).
function _brevoBaza() { return String(process.env.BREVO_API_URL || BREVO_URL_IMPLICIT).replace(/\/smtp\/email\/?$/, ''); }
async function _getBrevo(cale, metoda) {
  const r = await fetch(_brevoBaza() + cale, { method: metoda || 'GET', headers: { 'api-key': _brevoKey(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  return { r: r, t: t, j: j };
}
// Verifică legătura, FĂRĂ să trimită vreun email: la Brevo, contul (aceeași cheie și aceeași adresă a serverului ca la trimitere —
// deci un refuz al adresei serverului se vede aici, la pornire, nu abia la primul email); la SMTP, conexiunea. Eroarea poartă
// mesajul lui Brevo, ca `motiv` să poată spune ce e de făcut.
async function verify() {
  if (fel() === 'brevo') {
    try {
      const x = await _getBrevo('/account');
      return x.r.ok ? { ok: true } : { ok: false, error: 'Brevo ' + x.r.status + ': ' + String(x.j.message || x.t || 'eroare').slice(0, 300) };
    } catch (e) { return { ok: false, error: 'Brevo: ' + e.message }; }
  }
  const tx = _transport(); if (!tx) return { ok: false, error: 'Email neconfigurat' };
  try { await tx.verify(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}
// Evenimentele unui email trimis prin Brevo (livrat, amânat, refuzat, blocat, spam…), după id-ul pe care l-a dat Brevo la trimitere.
// Doar citește. Un răspuns neașteptat = { ok: false } — serverul încearcă din nou mai târziu și nu spune nimic ce nu știe.
async function evenimente(mesajId, catre) {
  if (fel() !== 'brevo' || !mesajId) return { ok: false, error: 'fără Brevo' };
  const q = function (extra) {
    return '/smtp/statistics/events?limit=100&sort=desc&messageId=' + encodeURIComponent(mesajId) + (catre ? '&email=' + encodeURIComponent(catre) : '') + (extra || '');
  };
  try {
    let x = await _getBrevo(q());
    if (x.r.status === 400) x = await _getBrevo(q('&days=7'));   // dacă cere o perioadă, i-o dăm pe cea mai scurtă care ne ajunge
    if (!x.r.ok) return { ok: false, error: 'Brevo ' + x.r.status + ': ' + String(x.j.message || x.t || 'eroare').slice(0, 300) };
    return { ok: true, evenimente: Array.isArray(x.j.events) ? x.j.events : [] };
  } catch (e) { return { ok: false, error: 'Brevo: ' + e.message }; }
}
// Scoate o adresă de pe lista Brevo de adrese blocate (după un refuz definitiv sau o reclamație de spam Brevo nu mai trimite acolo).
async function deblocheaza(email) {
  if (fel() !== 'brevo') return { ok: false, error: 'Emailul nu merge prin Brevo' };
  const e = _adresa(email).email;
  if (!e || e.indexOf('@') < 1) return { ok: false, error: 'Adresă de email greșită' };
  try {
    const x = await _getBrevo('/smtp/blockedContacts/' + encodeURIComponent(e), 'DELETE');
    if (x.r.ok || x.r.status === 404) return { ok: true, eraBlocata: x.r.status !== 404 };
    return { ok: false, error: 'Brevo ' + x.r.status + ': ' + String(x.j.message || x.t || 'eroare').slice(0, 300) };
  } catch (err) { return { ok: false, error: 'Brevo: ' + err.message }; }
}

module.exports = { enabled, send, verify, fromAddr, fel, setJurnal, adresa: _adresa, _pentruBrevo, cadru, semnatura, cuSemnatura, LOGO_CID, _cuCadru,
  stare, setLaRezultat, motiv, evenimente, deblocheaza };
