// ai.js — integrare AI (Anthropic Claude) prin fetch, fără SDK suplimentar.
// Cheia poate veni din env (ANTHROPIC_API_KEY) SAU setată din UI de super-admin (stocată în settings).
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
// Modelul agentului RA Insight — separat, ca să poată fi urcat pe Sonnet fără a atinge chat-ul rapid. Default = modelul de bază (Haiku).
const AI_AGENT_MODEL = process.env.AI_AGENT_MODEL || AI_MODEL;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

let runtimeKey = process.env.ANTHROPIC_API_KEY || null;
function setKey(k) { runtimeKey = (k && String(k).trim()) || null; }
function hasKey() { return !!runtimeKey; }
function aiEnabled() { return !!runtimeKey; }

async function _rawCall(body) {
  if (!runtimeKey) { const e = new Error('AI neconfigurat (lipsește cheia Anthropic)'); e.code = 'NO_KEY'; throw e; }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': runtimeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error('AI ' + res.status + ': ' + t.slice(0, 300));
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function callClaude({ system, messages, maxTokens = 800, model, onUsage }) {
  const j = await _rawCall({ model: model || AI_MODEL, max_tokens: maxTokens, system, messages });
  if (onUsage && j.usage) { try { onUsage(j.usage); } catch (e) { /* logarea consumului nu trebuie să rupă răspunsul */ } }
  return (j.content && j.content[0] && j.content[0].text) || '';
}

// Agent cu tool-use: rulează bucla model → execută unelte → model, până la stop_reason !== 'tool_use' sau maxIters.
// toolHandlers: { numeUnealtă: async (input) => rezultat } — rezultatul e serializat ca JSON pentru model.
// Întoarce { text, toolCalls: [{name, input}] }. Consumul (tokeni) e raportat per fiecare răspuns prin onUsage.
async function runAgent({ system, messages, tools, toolHandlers, model, maxTokens = 1024, maxIters = 8, onUsage }) {
  const convo = (messages || []).slice();
  const used = [];
  for (let i = 0; i < maxIters; i++) {
    const j = await _rawCall({ model: model || AI_AGENT_MODEL, max_tokens: maxTokens, system, tools, messages: convo });
    if (onUsage && j.usage) { try { onUsage(j.usage); } catch (e) {} }
    const blocks = j.content || [];
    convo.push({ role: 'assistant', content: blocks });
    const toolUses = blocks.filter(b => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { text, toolCalls: used };
    }
    const results = [];
    for (const tu of toolUses) {
      used.push({ name: tu.name, input: tu.input || {} });
      let out;
      try {
        const h = toolHandlers && toolHandlers[tu.name];
        out = h ? await h(tu.input || {}) : { error: 'unealtă necunoscută: ' + tu.name };
      } catch (e) { out = { error: String((e && e.message) || e) }; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
    }
    convo.push({ role: 'user', content: results });
  }
  // Limită de iterații atinsă → cere un răspuns final fără unelte, pe baza a ce s-a adunat.
  const jf = await _rawCall({ model: model || AI_AGENT_MODEL, max_tokens: maxTokens, system: system + '\n\nGata cu interogările. Răspunde acum pe baza datelor deja adunate.', messages: convo });
  if (onUsage && jf.usage) { try { onUsage(jf.usage); } catch (e) {} }
  const text = (jf.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { text, toolCalls: used };
}

module.exports = { aiEnabled, hasKey, setKey, callClaude, runAgent, AI_MODEL, AI_AGENT_MODEL };
