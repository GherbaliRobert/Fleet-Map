// billing.js — integrare Stripe prin REST (fără SDK, ca ai.js). Se activează doar dacă
// STRIPE_SECRET_KEY e setat; altfel toate funcțiile răspund „nedisponibil" elegant.
const crypto = require('crypto');

const SECRET = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const API = 'https://api.stripe.com/v1';

function enabled() { return !!SECRET; }

// serializează un obiect imbricat în form-urlencoded stil Stripe (a[b][c]=v, a[0][b]=v)
function toForm(obj, prefix, out) {
  out = out || [];
  for (const k in obj) {
    if (obj[k] == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof obj[k] === 'object') toForm(obj[k], key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[k]));
  }
  return out;
}

async function stripe(method, pathName, body) {
  if (!SECRET) throw new Error('Stripe neconfigurat (STRIPE_SECRET_KEY)');
  const res = await fetch(API + pathName, {
    method,
    headers: {
      'Authorization': 'Bearer ' + SECRET,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body ? toForm(body).join('&') : undefined
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Stripe ' + res.status + ': ' + ((j.error && j.error.message) || 'eroare'));
  return j;
}

// Checkout pentru abonament per-vehicul (quantity = nr. vehicule)
async function createCheckout({ priceId, quantity, customerEmail, customerId, successUrl, cancelUrl, trialDays, companyId }) {
  if (!priceId) throw new Error('Lipsește priceId (configurează STRIPE_PRICE_* sau creează prețurile în Stripe)');
  const body = {
    mode: 'subscription',
    'line_items': { '0': { price: priceId, quantity: Math.max(1, quantity || 1) } },
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: companyId != null ? String(companyId) : undefined,
    allow_promotion_codes: 'true'
  };
  if (customerId) body.customer = customerId; else if (customerEmail) body.customer_email = customerEmail;
  if (trialDays) body['subscription_data'] = { trial_period_days: trialDays };
  const s = await stripe('POST', '/checkout/sessions', body);
  return { id: s.id, url: s.url };
}

// Portal de self-service (schimbă card, anulează, vezi facturi)
async function createPortal({ customerId, returnUrl }) {
  const s = await stripe('POST', '/billing_portal/sessions', { customer: customerId, return_url: returnUrl });
  return { url: s.url };
}

// Verifică semnătura webhook-ului Stripe pe body-ul RAW (Buffer/string)
function verifyWebhook(rawBody, sigHeader) {
  if (!WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET neconfigurat');
  if (!sigHeader) throw new Error('Lipsește semnătura');
  const parts = {};
  String(sigHeader).split(',').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) throw new Error('Semnătură invalidă');
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(t + '.' + payload).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Semnătură nevalidă');
  // protecție anti-replay: 5 minute
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(t)) > 300) throw new Error('Eveniment expirat');
  return JSON.parse(payload);
}

module.exports = { enabled, createCheckout, createPortal, verifyWebhook };
