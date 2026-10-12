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
  if (m.replyTo) corp.replyTo = _adresa(m.replyTo);
  if (atas.length) corp.attachment = atas;
  return corp;
}

async function _trimiteBrevo(m) {
  const corp = _pentruBrevo(m);
  if (!corp.to.length) return { ok: false, error: 'Fără destinatar' };
  try {
    const r = await fetch(process.env.BREVO_API_URL || BREVO_URL_IMPLICIT, {
      method: 'POST',
      headers: { 'api-key': _brevoKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corp),
      signal: AbortSignal.timeout(20000),
    });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
    if (r.ok) return { ok: true, id: j.messageId || (j.messageIds && j.messageIds[0]) || null };
    return { ok: false, error: 'Brevo ' + r.status + ': ' + (j.message || t || 'eroare').toString().slice(0, 300) };
  } catch (e) { return { ok: false, error: 'Brevo: ' + e.message }; }
}

// ─── Jurnalul „Trimise" din panoul Mail (12.10) ───
// Un email cu `jurnal: { fel, companyId, userId }` se scrie, după trimitere (reușită sau nu), prin funcția pusă de server
// (`setJurnal`) — mailer.js nu știe de bază. Fără `jurnal`, emailul NU se scrie: rapoartele și alertele pe care o firmă și
// le trimite singură oamenilor ei nu intră în „Trimise" (hotărât: nu ne uităm la ce face o companie).
let _jurnal = null;
function setJurnal(fn) { _jurnal = typeof fn === 'function' ? fn : null; }
async function _noteaza(m, r) {
  if (!m.jurnal || !_jurnal) return;
  try {
    await _jurnal({
      de_la: _adresa(m.from || fromAddr()).email.toLowerCase(),
      catre: _destinatari(m.to).map(function (x) { return x.email; }).join(', '),
      subiect: m.subject || '(fără subiect)', text: m.text || null, html: m.html || null,
      atasamente: (m.attachments || []).filter(function (a) { return a && !a.cid; }).map(function (a) {
        const n = Buffer.isBuffer(a.content) ? a.content.length : (typeof a.content === 'string' ? Buffer.byteLength(a.content, a.encoding || 'utf8') : null);
        return { nume: String(a.filename || (a.path ? path.basename(a.path) : 'atasament')), octeti: n };
      }),
      fel: m.jurnal.fel || null, companyId: m.jurnal.companyId != null ? m.jurnal.companyId : null,
      userId: m.jurnal.userId != null ? m.jurnal.userId : null,
      stare: r.ok ? 'trimis' : 'esuat', eroare: r.ok ? null : (r.error || null), cale: fel(), mesajId: r.id || null,
    });
  } catch (e) { /* jurnalul nu are voie să strice trimiterea */ }
}

// send({to, subject, html, text, attachments, replyTo, from?, jurnal?}) → { ok, id? , error? }. Nu aruncă (best-effort).
// `replyTo`: unde ajunge răspunsul omului (ex. contractul trimis înapoi semnat) — adresa noastră, nu noreply.
// `from`: altă adresă de-a noastră decât cea implicită (panoul Mail: robert.gherbali@…); o verifică serverul, nu aici.
async function send(m) {
  if (!m || !m.to) return { ok: false, error: 'Fără destinatar' };
  let r;
  if (fel() === 'brevo') r = await _trimiteBrevo(m);
  else {
    const tx = _transport();
    if (!tx) r = { ok: false, error: 'Email neconfigurat (nici Brevo, nici SMTP)' };
    else {
      try {
        const info = await tx.sendMail({ from: m.from || fromAddr(), to: m.to, replyTo: m.replyTo || undefined, subject: m.subject || '(fără subiect)', html: m.html, text: m.text, attachments: m.attachments });
        r = { ok: true, id: info && info.messageId };
      } catch (e) { r = { ok: false, error: e.message }; }
    }
  }
  await _noteaza(m, r);
  return r;
}
// Verifică legătura (pentru panoul de config): la Brevo, cheia (contul); la SMTP, conexiunea.
async function verify() {
  if (fel() === 'brevo') {
    try {
      const u = String(process.env.BREVO_API_URL || BREVO_URL_IMPLICIT).replace(/\/smtp\/email\/?$/, '/account');
      const r = await fetch(u, { headers: { 'api-key': _brevoKey(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      return r.ok ? { ok: true } : { ok: false, error: 'Brevo ' + r.status };
    } catch (e) { return { ok: false, error: 'Brevo: ' + e.message }; }
  }
  const tx = _transport(); if (!tx) return { ok: false, error: 'Email neconfigurat' };
  try { await tx.verify(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { enabled, send, verify, fromAddr, fel, setJurnal, adresa: _adresa, _pentruBrevo };
