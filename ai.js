// ai.js — integrare AI (Anthropic Claude) prin fetch, fără SDK suplimentar.
// Necesită ANTHROPIC_API_KEY în env. Model configurabil prin AI_MODEL.
const AI_MODEL = process.env.AI_MODEL || 'claude-3-5-haiku-latest';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function aiEnabled() { return !!process.env.ANTHROPIC_API_KEY; }

async function callClaude({ system, messages, maxTokens = 800 }) {
  if (!aiEnabled()) { const e = new Error('AI neconfigurat (lipsește ANTHROPIC_API_KEY)'); e.code = 'NO_KEY'; throw e; }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
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

module.exports = { aiEnabled, callClaude, AI_MODEL };
