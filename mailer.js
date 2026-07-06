// mailer.js — trimitere email prin SMTP (nodemailer). DORMANT până sunt setate SMTP_HOST + SMTP_USER.
// Env: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ('false'), SMTP_USER, SMTP_PASS, SMTP_FROM (opțional).
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) { /* dep opțional */ }
let _tx = null;

function enabled() { return !!(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER); }
function _transport() {
  if (_tx) return _tx;
  if (!enabled()) return null;
  _tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || 'false') === 'true', // true doar pt. portul 465
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
  });
  return _tx;
}
function fromAddr() { return process.env.SMTP_FROM || ('RA Tracks <' + (process.env.SMTP_USER || 'noreply@ratrack.ro') + '>'); }

// send({to, subject, html, text, attachments}) → { ok, id? , error? }. Nu aruncă (best-effort).
async function send(m) {
  const tx = _transport();
  if (!tx) return { ok: false, error: 'SMTP neconfigurat' };
  if (!m || !m.to) return { ok: false, error: 'Fără destinatar' };
  try {
    const info = await tx.sendMail({ from: fromAddr(), to: m.to, subject: m.subject || '(fără subiect)', html: m.html, text: m.text, attachments: m.attachments });
    return { ok: true, id: info && info.messageId };
  } catch (e) { return { ok: false, error: e.message }; }
}
// Verifică conexiunea SMTP (pentru panoul de config).
async function verify() {
  const tx = _transport(); if (!tx) return { ok: false, error: 'SMTP neconfigurat' };
  try { await tx.verify(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { enabled, send, verify, fromAddr };
