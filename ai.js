// ai.js — integrare AI (Anthropic Claude) prin fetch, fără SDK suplimentar.
// Cheia poate veni din env (ANTHROPIC_API_KEY) SAU setată din UI de super-admin (stocată în settings).
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

let runtimeKey = process.env.ANTHROPIC_API_KEY || null;
function setKey(k) { runtimeKey = (k && String(k).trim()) || null; }
function hasKey() { return !!runtimeKey; }
function aiEnabled() { return !!runtimeKey; }

async function callClaude({ system, messages, maxTokens = 800 }) {
  if (!runtimeKey) { const e = new Error('AI neconfigurat (lipsește cheia Anthropic)'); e.code = 'NO_KEY'; throw e; }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': runtimeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error('AI ' + res.status + ': ' + t.slice(0, 300));
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  return (j.content && j.content[0] && j.content[0].text) || '';
}

module.exports = { aiEnabled, hasKey, setKey, callClaude, AI_MODEL };
