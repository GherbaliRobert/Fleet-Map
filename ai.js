// ai.js — integrare AI (Anthropic Claude) prin fetch, fără SDK suplimentar.
// Cheia poate veni din env (ANTHROPIC_API_KEY) SAU setată din UI de super-admin (stocată în settings).
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
// Modelul agentului RA Insight — separat, ca să poată fi urcat pe Sonnet fără a atinge chat-ul rapid. Default = modelul de bază (Haiku).
const AI_AGENT_MODEL = process.env.AI_AGENT_MODEL || AI_MODEL;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// ─── Preț tokeni (USD / 1 milion) — implicit Haiku 4.5. Schimbi modelul → schimbi și astea din env. ───
const PRICE_IN = Number(process.env.AI_PRICE_IN_USD_PER_MTOK) || 1.00;
const PRICE_OUT = Number(process.env.AI_PRICE_OUT_USD_PER_MTOK) || 5.00;
const PRICE_CACHE_READ = Number(process.env.AI_PRICE_CACHE_READ_USD_PER_MTOK) || 0.10;  // ~10% din input
const PRICE_CACHE_WRITE = Number(process.env.AI_PRICE_CACHE_WRITE_USD_PER_MTOK) || 1.25; // ~125% din input
const USD_EUR = Number(process.env.USD_EUR_RATE) || 0.92;
// Costul unui răspuns, din `usage`-ul întors de API (tokenii din cache se taxează diferit).
function costUsd(u) {
  if (!u) return 0;
  const inp = Number(u.input_tokens) || 0, out = Number(u.output_tokens) || 0;
  const cr = Number(u.cache_read_input_tokens) || 0, cw = Number(u.cache_creation_input_tokens) || 0;
  return (inp * PRICE_IN + out * PRICE_OUT + cr * PRICE_CACHE_READ + cw * PRICE_CACHE_WRITE) / 1e6;
}
function costEur(u) { return costUsd(u) * USD_EUR; }
// Marchează ultimul bloc pentru cache (prefix-match). Ordinea randării: tools → system → messages,
// deci un semn pe system acoperă și uneltele. Economie ~90% pe partea deja trimisă o dată.
function _cachedSystem(system) {
  if (!system) return system;
  if (Array.isArray(system)) return system;
  return [{ type: 'text', text: String(system), cache_control: { type: 'ephemeral' } }];
}

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
  const j = await _rawCall({ model: model || AI_MODEL, max_tokens: maxTokens, system: _cachedSystem(system), messages });
  if (onUsage && j.usage) { try { onUsage(j.usage); } catch (e) { /* logarea consumului nu trebuie să rupă răspunsul */ } }
  return (j.content && j.content[0] && j.content[0].text) || '';
}

// Agent cu tool-use: rulează bucla model → execută unelte → model, până la stop_reason !== 'tool_use' sau maxIters.
// toolHandlers: { numeUnealtă: async (input) => rezultat } — rezultatul e serializat ca JSON pentru model.
// Întoarce { text, toolCalls: [{name, input}] }. Consumul (tokeni) e raportat per fiecare răspuns prin onUsage.
async function runAgent({ system, messages, tools, toolHandlers, model, maxTokens = 1024, maxIters = 5, onUsage }) {
  const convo = (messages || []).slice();
  const sysCached = _cachedSystem(system); // system + unelte se trimit la FIECARE rundă → merită cache-uite
  const used = [];
  for (let i = 0; i < maxIters; i++) {
    const j = await _rawCall({ model: model || AI_AGENT_MODEL, max_tokens: maxTokens, system: sysCached, tools, messages: convo });
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
    // Cache pe conversația acumulată: doar ULTIMUL rezultat poartă semnul (max 4 semne/cerere),
    // așa că runda următoare recitește ieftin tot ce s-a trimis deja.
    for (const m of convo) if (Array.isArray(m.content)) for (const b of m.content) if (b && b.cache_control) delete b.cache_control;
    results[results.length - 1].cache_control = { type: 'ephemeral' };
    convo.push({ role: 'user', content: results });
  }
  // Limită de iterații atinsă → cere un răspuns final fără unelte, pe baza a ce s-a adunat.
  const jf = await _rawCall({ model: model || AI_AGENT_MODEL, max_tokens: maxTokens, system: _cachedSystem(system + '\n\nGata cu interogările. Răspunde acum pe baza datelor deja adunate.'), messages: convo });
  if (onUsage && jf.usage) { try { onUsage(jf.usage); } catch (e) {} }
  const text = (jf.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { text, toolCalls: used };
}

module.exports = { aiEnabled, hasKey, setKey, callClaude, runAgent, AI_MODEL, AI_AGENT_MODEL, costUsd, costEur, USD_EUR, PRICE_IN, PRICE_OUT };
