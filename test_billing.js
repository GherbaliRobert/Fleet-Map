// test_billing.js — unit tests pentru billing.js (fără rețea/Stripe).
// Focus: verifyWebhook (semnătură HMAC-SHA256 + anti-replay 5 min) — partea critică de securitate.
// IMPORTANT: env-urile sunt citite la require → le setăm ÎNAINTE.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
const crypto = require('crypto');
const billing = require('./billing.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
function throws(fn, re, m) {
  try { fn(); fail++; console.log('  FAIL ' + m + ' (nu a aruncat)'); }
  catch (e) { ok(re ? re.test(e.message) : true, m + (re ? ' [' + e.message + ']' : '')); }
}

const SECRET = 'whsec_test_secret';
function sign(payload, t) { return crypto.createHmac('sha256', SECRET).update(t + '.' + payload).digest('hex'); }

console.log('\n— enabled() —');
ok(billing.enabled() === true, 'enabled() true când STRIPE_SECRET_KEY e setat');

console.log('\n— verifyWebhook: semnătură validă —');
{
  const payload = JSON.stringify({ type: 'charge.succeeded', id: 'evt_1', data: { object: { amount: 4500 } } });
  const t = Math.floor(Date.now() / 1000);
  const header = 't=' + t + ',v1=' + sign(payload, t);
  let parsed = null;
  try { parsed = billing.verifyWebhook(payload, header); } catch (e) { /* */ }
  ok(parsed && parsed.type === 'charge.succeeded', 'semnătură validă → întoarce evenimentul parsat');
  ok(parsed && parsed.data.object.amount === 4500, 'payload-ul e parsat corect');
}

console.log('\n— verifyWebhook: respinge semnături greșite —');
{
  const payload = JSON.stringify({ type: 'x' });
  const t = Math.floor(Date.now() / 1000);
  // Semnătură calculată pentru ALT payload → tampering
  const badSig = sign(JSON.stringify({ type: 'altered' }), t);
  throws(() => billing.verifyWebhook(payload, 't=' + t + ',v1=' + badSig), /nevalid/i, 'payload modificat → respins');
}
{
  const payload = JSON.stringify({ type: 'x' });
  const t = Math.floor(Date.now() / 1000);
  throws(() => billing.verifyWebhook(payload, 't=' + t), /invalid/i, 'lipsă v1 → respins');
}
{
  const payload = JSON.stringify({ type: 'x' });
  const t = Math.floor(Date.now() / 1000);
  const wrongSig = crypto.createHmac('sha256', 'alt_secret').update(t + '.' + payload).digest('hex');
  throws(() => billing.verifyWebhook(payload, 't=' + t + ',v1=' + wrongSig), /nevalid/i, 'secret greșit → respins');
}

console.log('\n— verifyWebhook: anti-replay (5 min) —');
{
  const payload = JSON.stringify({ type: 'x' });
  const tOld = Math.floor(Date.now() / 1000) - 400; // 6.6 min în trecut
  const header = 't=' + tOld + ',v1=' + sign(payload, tOld); // semnătură CORECTĂ, dar veche
  throws(() => billing.verifyWebhook(payload, header), /expirat/i, 'eveniment vechi de 400s → respins (anti-replay)');
}

console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
