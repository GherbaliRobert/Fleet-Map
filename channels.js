// channels.js — livrare notificări pe canale externe. TOATE opționale (configurate prin .env).
// Dacă un canal nu e configurat, e pur și simplu ignorat (no-op). Centrul de notificări in-app
// funcționează mereu, local, fără niciun canal extern.

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  return transporter;
}

async function sendEmail(subject, text) {
  const tr = getTransporter();
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!tr || !to) return false;
  await tr.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER || 'gps@local', to, subject, text });
  return true;
}

// Trimite email către un destinatar specific (folosit pentru notificările per-utilizator)
async function sendEmailTo(to, subject, text, attachments) {
  const tr = getTransporter();
  if (!tr || !to) return false;
  const msg = { from: process.env.SMTP_FROM || process.env.SMTP_USER || 'gps@local', to, subject, text };
  if (attachments && attachments.length) msg.attachments = attachments;
  await tr.sendMail(msg);
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
  try { results.email = await sendEmail(n.title || 'Notificare Fleet-Map', text); } catch (e) { results.email = 'err: ' + e.message; }
  try { results.telegram = await sendTelegram(text); } catch (e) { results.telegram = 'err: ' + e.message; }
  try { results.webhook = await sendWebhook(n); } catch (e) { results.webhook = 'err: ' + e.message; }
  return results;
}

function channelsConfigured() {
  return {
    email: !!(process.env.SMTP_HOST && process.env.NOTIFY_EMAIL_TO),
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    webhook: !!process.env.NOTIFY_WEBHOOK_URL
  };
}

module.exports = { dispatchChannels, channelsConfigured, sendWebhook, sendEmailTo, emailConfigured: () => !!process.env.SMTP_HOST };
