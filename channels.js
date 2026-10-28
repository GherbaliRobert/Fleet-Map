// channels.js — livrare notificări pe canale externe. TOATE opționale (configurate prin .env).
// Dacă un canal nu e configurat, e pur și simplu ignorat (no-op). Centrul de notificări in-app
// funcționează mereu, local, fără niciun canal extern.

// Emailul pleacă pe O SINGURĂ cale, a lui mailer.js (Brevo pe HTTPS sau SMTP — 12.10). Aici era un al doilea
// transport SMTP, cu alt expeditor; pe Railway Hobby, unde SMTP e blocat, invitațiile și rapoartele n-ar fi plecat
// nici după ce emailul facturilor mergea. NU pune înapoi un transport propriu.
const mailer = require('./mailer');

async function sendEmail(subject, text) {
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!mailer.enabled() || !to) return false;
  const r = await mailer.send({ to, subject, text });
  if (!r.ok) throw new Error(r.error || 'emailul n-a plecat');
  return true;
}

// Trimite email către un destinatar specific (folosit pentru notificările per-utilizator)
// html (opțional) → email HTML cu fallback text. Fără email pe server → false; emailul care n-a plecat → aruncă (cine
// cheamă hotărăște: invitația arată atunci linkul pe ecran).
// `opts.jurnal` ({ fel, companyId, userId }): emailul intră în „Trimise" din panoul Mail. Îl pun doar emailurile NOASTRE
// (invitații, linkuri de parolă, cererile din formular, suportul) — nu și rapoartele / alertele unei firme.
async function sendEmailTo(to, subject, text, attachments, html, opts) {
  if (!mailer.enabled() || !to) return false;
  const msg = { to, subject, text };
  if (html) msg.html = html;
  if (attachments && attachments.length) msg.attachments = attachments;
  if (opts && opts.jurnal) msg.jurnal = opts.jurnal;
  if (opts && opts.livrare) msg.livrare = opts.livrare;   // serverul întreabă apoi Brevo dacă emailul a ajuns (28.10)
  const r = await mailer.send(msg);
  if (!r.ok) throw new Error(r.error || 'emailul n-a plecat');
  return true;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text })
  });
  return true;
}

async function sendWebhook(payload) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return true;
}

async function dispatchChannels(n) {
  const text = `[${(n.severity || 'info').toUpperCase()}] ${n.title || n.type}\n${n.body || ''}`.trim();
  const results = {};
  try { results.email = await sendEmail(n.title || 'Notificare RA Track', text); } catch (e) { results.email = 'err: ' + e.message; }
  try { results.telegram = await sendTelegram(text); } catch (e) { results.telegram = 'err: ' + e.message; }
  try { results.webhook = await sendWebhook(n); } catch (e) { results.webhook = 'err: ' + e.message; }
  return results;
}

function channelsConfigured() {
  return {
    email: !!(mailer.enabled() && process.env.NOTIFY_EMAIL_TO),
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    webhook: !!process.env.NOTIFY_WEBHOOK_URL
  };
}

module.exports = { dispatchChannels, channelsConfigured, sendWebhook, sendEmailTo, emailConfigured: () => mailer.enabled() };
