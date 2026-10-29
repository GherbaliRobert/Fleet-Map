// ai.js — integrare AI (Anthropic Claude) prin fetch, fără SDK suplimentar.
// Cheia poate veni din env (ANTHROPIC_API_KEY) SAU setată din UI de super-admin (stocată în settings).
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
// Modelul agentului RA Insight — separat, ca să poată fi urcat pe Sonnet fără a atinge chat-ul rapid. Default = modelul de bază (Haiku).
const AI_AGENT_MODEL = process.env.AI_AGENT_MODEL || AI_MODEL;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELE_URL = 'https://api.anthropic.com/v1/models/';
// Orice text scris de model ajunge la om DOAR cu litere românești (Alin, 20.10: „sunt fatale pentru noi"): callClaude și
// runAgent îl curăță aici, o dată pentru toate drumurile (litere.js). `brut: true` îl lasă cum e — doar RA Insight îl cere,
// ca să ceară întâi o rescriere, și îl curăță el la capăt.
const litere = require('./litere.js');
function _curat(t, brut) { return brut ? t : litere.litereRomanesti(t); }

// ─── Modelele pe care le știm, cu prețurile OFICIALE (USD / milion de tokeni), citite de pe
// platform.claude.com/docs/en/about-claude/pricing pe 08.10.2026. Haiku 5.5: prețul cererilor sub 100.000 de tokeni
// (ale noastre au câteva mii). `gandire` = modelele 5.x gândesc „adaptiv": li se spune cât (`effort`), iar istoricul
// unei bucle cu unelte NU se mai atinge (vezi runAgent). Un model necunoscut ia prețurile din env (mai jos).
const MODELE = {
  'claude-haiku-4-5':  { nume: 'Haiku 4.5',  in: 1.00, out: 5.00,  cacheRead: 0.10, cacheWrite: 1.25,  gandire: false },
  'claude-haiku-5-5':  { nume: 'Haiku 5.5',  in: 0.10, out: 0.50,  cacheRead: 0.01, cacheWrite: 0.125, gandire: true },
  'claude-sonnet-5-5': { nume: 'Sonnet 5.5', in: 2.00, out: 10.00, cacheRead: 0.10, cacheWrite: 2.50,  gandire: true },
};
// Cât de mult gândesc modelele 5.x la noi: puțin („low" — ce recomandă Anthropic pentru chat). Gândirea intră în
// max_tokens, deci li se dă loc în plus (GANDIRE_LOC); se plătește doar ce se folosește.
const EFORT = process.env.AI_EFFORT || 'low';
const GANDIRE_LOC = 2000;
// ─── Prețul unui model necunoscut (USD / 1 milion) — implicit Haiku 4.5, din env. ───
const PRICE_IN = Number(process.env.AI_PRICE_IN_USD_PER_MTOK) || 1.00;
const PRICE_OUT = Number(process.env.AI_PRICE_OUT_USD_PER_MTOK) || 5.00;
const PRICE_CACHE_READ = Number(process.env.AI_PRICE_CACHE_READ_USD_PER_MTOK) || 0.10;  // ~10% din input
const PRICE_CACHE_WRITE = Number(process.env.AI_PRICE_CACHE_WRITE_USD_PER_MTOK) || 1.25; // ~125% din input
const USD_EUR = Number(process.env.USD_EUR_RATE) || 0.92;
// „Sursă externă" (28.10): căutarea pe internet se plătește separat de tokeni — 10 $ la 1.000 de căutări, plus paginile găsite,
// socotite ca text citit (platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, citit pe 28.10). O căutare cu
// eroare nu se plătește. Schimbi prețul doar după pagina oficială.
const PRET_CAUTARE_USD = 0.01;
function pret(model) {
  return MODELE[model || AI_MODEL] || { nume: String(model || AI_MODEL), in: PRICE_IN, out: PRICE_OUT, cacheRead: PRICE_CACHE_READ, cacheWrite: PRICE_CACHE_WRITE, gandire: false };
}
// Costul unui răspuns, din `usage`-ul întors de API (tokenii din cache se taxează diferit), pe prețurile modelului
// care a răspuns (fără model = modelul de bază — cel cu care s-au scris rândurile vechi din consum).
function costUsd(u, model) {
  if (!u) return 0;
  const p = pret(model);
  const inp = Number(u.input_tokens) || 0, out = Number(u.output_tokens) || 0;
  const cr = Number(u.cache_read_input_tokens) || 0, cw = Number(u.cache_creation_input_tokens) || 0;
  const cautari = Number(u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return (inp * p.in + out * p.out + cr * p.cacheRead + cw * p.cacheWrite) / 1e6 + cautari * PRET_CAUTARE_USD;
}
function costEur(u, model) { return costUsd(u, model) * USD_EUR; }
// Cererea către API, pe felul modelului: la 5.x, gândire adaptivă cu efortul nostru și loc pentru ea în max_tokens.
// Haiku 4.5 primește cererea de până acum, neschimbată. `_efort` (28.10, analiza atentă a lui RA Insight): o întrebare grea
// („de ce", „compară", „ce să fac") gândește mai mult — „medium" — cu loc dublu pentru gândire; câmpul nu pleacă spre API.
function _corp(b) {
  const p = pret(b.model);
  const ef = b._efort || EFORT;
  const c = Object.assign({}, b); delete c._efort;
  if (!p.gandire) return c;
  return Object.assign(c, { max_tokens: (Number(b.max_tokens) || 1024) + (ef === 'low' ? GANDIRE_LOC : GANDIRE_LOC * 2), thinking: { type: 'adaptive' }, output_config: { effort: ef } });
}
// Textul răspunsului: blocurile `text`, în ordine. La modelele 5.x răspunsul poate începe cu un bloc `thinking`, deci
// NU se citește „primul bloc".
function _text(j) { return ((j && j.content) || []).filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim(); }
// Refuzul modelului (`stop_reason: "refusal"`, la modelele 5.x) se spune pe față, nu ca un răspuns gol.
const TEXT_REFUZ = 'Nu pot răspunde la întrebarea asta. Încearcă s-o formulezi altfel.';
// Marchează ultimul bloc pentru cache (prefix-match). Ordinea randării: tools → system → messages,
// deci un semn pe system acoperă și uneltele. Economie ~90% pe partea deja trimisă o dată.
function _cachedSystem(system) {
  if (!system) return system;
  if (Array.isArray(system)) return system;
  return [{ type: 'text', text: String(system), cache_control: { type: 'ephemeral' } }];
}
// O notă adăugată la sfârșitul instrucțiunilor — merge și pe text simplu, și pe blocuri (partea fixă,
// păstrată în cache, + partea care se schimbă la fiecare întrebare, ca la RA Insight).
function _cuNota(system, nota) {
  if (Array.isArray(system)) return system.concat([{ type: 'text', text: nota }]);
  return _cachedSystem(String(system || '') + '\n\n' + nota);
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
    body: JSON.stringify(_corp(body))
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error('AI ' + res.status + ': ' + t.slice(0, 300));
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function callClaude({ system, messages, maxTokens = 800, model, onUsage, brut }) {
  const m = model || AI_MODEL;
  const j = await _rawCall({ model: m, max_tokens: maxTokens, system: _cachedSystem(system), messages });
  if (onUsage && j.usage) { try { onUsage(j.usage, m); } catch (e) { /* logarea consumului nu trebuie să rupă răspunsul */ } }
  if (j.stop_reason === 'refusal') return '';
  return _curat(_text(j), brut);
}

// Citirea unei IMAGINI (poză de talon, CIV, RCA…). Până aici tot fișierul vorbea doar text; blocul
// de imagine e singura noutate. Modelul primește poza + o instrucțiune și întoarce DOAR textul
// transcris de pe document — extragerea câmpurilor rămâne în docparse.js, pe reguli, gratuit.
// De ce așa și nu „modelul completează direct câmpurile": transcrierea e sarcina la care modelul
// greșește cel mai puțin, iar regulile noastre sunt verificabile și testate (test_docparse.js).
// mediaType: 'image/jpeg' | 'image/png' | 'image/webp'.
async function readImage({ b64, mediaType, prompt, maxTokens = 1500, model, onUsage }) {
  const m = model || AI_MODEL;
  const j = await _rawCall({
    model: m,
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  if (onUsage && j.usage) { try { onUsage(j.usage, m); } catch (e) {} }
  if (j.stop_reason === 'refusal') return '';
  return _text(j);
}

// Agent cu tool-use: rulează bucla model → execută unelte → model, până la stop_reason !== 'tool_use' sau maxIters.
// toolHandlers: { numeUnealtă: async (input) => rezultat } — rezultatul e serializat ca JSON pentru model.
// Întoarce { text, toolCalls: [{name, input}] }. Consumul (tokeni) e raportat per fiecare răspuns prin onUsage(usage, model).
//
// La modelele 5.x (`gandire`) istoricul buclei NU se atinge: blocurile de gândire sunt legate de tot ce a fost înaintea
// lor (instrucțiuni, unelte, mesaje), iar o schimbare în urmă le invalidează (pe conturile noi, eroare 400). Deci acolo:
// cache-ul cozii îl pune API-ul singur (`cache_control` pe cerere), nu mutăm semne pe rezultatele vechi, iar la capăt
// nu schimbăm instrucțiunile — nota „gata" se adaugă după ultimele rezultate și se cere răspunsul fără unelte
// (`tool_choice: none`, uneltele rămân aceleași). Haiku 4.5 merge pe drumul de până acum, neschimbat.
const NOTA_GATA = 'Gata cu interogările. Răspunde acum pe baza datelor deja adunate.';
async function runAgent({ system, messages, tools, toolHandlers, model, maxTokens = 1024, maxIters = 5, onUsage, brut, efort }) {
  const m = model || AI_AGENT_MODEL;
  const ef = efort || undefined;   // același efort pe toată bucla unei întrebări (istoricul buclei nu se atinge)
  const cuGandire = pret(m).gandire;
  const convo = (messages || []).slice();
  const sysCached = _cachedSystem(system); // system + unelte se trimit la FIECARE rundă → merită cache-uite
  const used = [];
  for (let i = 0; i < maxIters; i++) {
    const corp = { model: m, max_tokens: maxTokens, system: sysCached, tools, messages: convo, _efort: ef };
    if (cuGandire) corp.cache_control = { type: 'ephemeral' };
    const j = await _rawCall(corp);
    if (onUsage && j.usage) { try { onUsage(j.usage, m); } catch (e) {} }
    if (j.stop_reason === 'refusal') return { text: TEXT_REFUZ, toolCalls: used, refuz: true };
    const blocks = j.content || [];
    convo.push({ role: 'assistant', content: blocks });   // tot, cu blocurile de gândire, neschimbat
    const toolUses = blocks.filter(b => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !toolUses.length) return { text: _curat(_text(j), brut), toolCalls: used };
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
    if (cuGandire) {
      if (i === maxIters - 1) results.push({ type: 'text', text: NOTA_GATA });
    } else {
      // Cache pe conversația acumulată: doar ULTIMUL rezultat poartă semnul (max 4 semne/cerere),
      // așa că runda următoare recitește ieftin tot ce s-a trimis deja.
      for (const mm of convo) if (Array.isArray(mm.content)) for (const b of mm.content) if (b && b.cache_control) delete b.cache_control;
      results[results.length - 1].cache_control = { type: 'ephemeral' };
    }
    convo.push({ role: 'user', content: results });
  }
  // Limită de iterații atinsă → cere un răspuns final fără unelte, pe baza a ce s-a adunat.
  const jf = cuGandire
    ? await _rawCall({ model: m, max_tokens: maxTokens, system: sysCached, tools, tool_choice: { type: 'none' }, messages: convo, cache_control: { type: 'ephemeral' }, _efort: ef })
    : await _rawCall({ model: m, max_tokens: maxTokens, system: _cuNota(system, NOTA_GATA), messages: convo });
  if (onUsage && jf.usage) { try { onUsage(jf.usage, m); } catch (e) {} }
  if (jf.stop_reason === 'refusal') return { text: TEXT_REFUZ, toolCalls: used, refuz: true };
  return { text: _curat(_text(jf), brut), toolCalls: used };
}

// ─── „Sursă externă" (28.10; Alin: „da — dar nu-l numim internet, îl numim sursă externă") ───────────────────────────────
// Căutarea pe internet, într-un apel SEPARAT de RA Insight: primește doar textul căutării (verificat înainte cu
// sursa_externa.verifica) și instrucțiunile ei — nimic din flotă, nimic din discuție. Unealta de bază, `web_search_20250305`
// (cea cu „filtrare dinamică" cere execuție de cod, pe care modelele mici n-o au), cel mult `maxCautari` căutări, rezultatele pe
// România. La `pause_turn` (API-ul oprește o căutare lungă) se trimite înapoi, neschimbat, ce a scris modelul până acolo.
// Întoarce blocurile răspunsului (le citește sursa_externa.citesteRaspuns); consumul, cu numărul de căutări, prin onUsage.
// Modelul: AI_MODEL_SURSA, altfel modelul lui RA Insight.
const AI_SURSA_MODEL = process.env.AI_MODEL_SURSA || AI_AGENT_MODEL;
const CAUTARE_UNEALTA = 'web_search_20250305';
// Locul căutării: doar fusul orar. Țara „RO" NU e primită de motorul de căutare al Anthropic (29.10, la prima probă adevărată a lui
// Alin: 400 „Country code RO is not supported"; documentația: `user_location.country` = doar țările motorului lor). Fără țară, căutarea
// pleacă tot în română (textul ei) și cu ora României.
const LOC_CAUTARE = { type: 'approximate', timezone: 'Europe/Bucharest' };
// O cerere refuzată pentru loc (țara, fusul, orașul) se trimite O DATĂ din nou, fără loc — căutarea merge și așa.
function _refuzLoc(e) { return !!(e && e.status === 400 && /user_location|country|timezone|city|region/i.test(String((e && e.message) || ''))); }
async function cautaExtern({ cautare, instructiuni, model, maxCautari, onUsage }) {
  const m = model || AI_SURSA_MODEL;
  let cuLoc = true;
  const unealta = () => [Object.assign({ type: CAUTARE_UNEALTA, name: 'web_search', max_uses: Math.max(1, Math.min(5, Number(maxCautari) || 3)) },
    cuLoc ? { user_location: LOC_CAUTARE } : {})];
  const intrebare = { role: 'user', content: String(cautare || '') };
  let blocuri = [];
  for (let i = 0; i < 3; i++) {
    const messages = blocuri.length ? [intrebare, { role: 'assistant', content: blocuri }] : [intrebare];
    const cerere = () => _rawCall({ model: m, max_tokens: 900, system: instructiuni ? [{ type: 'text', text: String(instructiuni) }] : undefined, tools: unealta(), messages });
    let j;
    try { j = await cerere(); } catch (e) { if (!(cuLoc && _refuzLoc(e))) throw e; cuLoc = false; j = await cerere(); }
    if (onUsage && j.usage) { try { onUsage(j.usage, m); } catch (e) {} }
    if (j.stop_reason === 'refusal') return { blocuri: [], refuz: true, model: m };
    blocuri = blocuri.concat(j.content || []);
    if (j.stop_reason !== 'pause_turn') break;
  }
  return { blocuri: blocuri, model: m };
}
// Primește modelul căutarea pe internet? Anthropic o spune în Models API: capabilities.server_tools.web_search.supported
// (citit pe 28.10 de pe platform.claude.com/docs/en/models/overview). Cererea nu costă nimic și nu trimite nimic din aplicație.
// { model, ok: true | false | null, eroare } — null = nu s-a putut afla (fără cheie, rețea, răspuns fără câmp).
async function modelPrimesteCautarea(model) {
  const m = model || AI_SURSA_MODEL;
  if (!runtimeKey) return { model: m, ok: null, eroare: 'cheia Anthropic lipsește' };
  try {
    const res = await fetch(ANTHROPIC_MODELE_URL + encodeURIComponent(m), { method: 'GET', headers: { 'x-api-key': runtimeKey, 'anthropic-version': '2023-06-01' } });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { model: m, ok: null, eroare: 'Anthropic ' + res.status + ': ' + t.slice(0, 200) }; }
    const j = await res.json();
    const ws = j && j.capabilities && j.capabilities.server_tools && j.capabilities.server_tools.web_search;
    if (!ws || typeof ws.supported !== 'boolean') return { model: m, ok: null, eroare: 'răspunsul Anthropic nu spune' };
    return { model: m, ok: ws.supported };
  } catch (e) { return { model: m, ok: null, eroare: String((e && e.message) || e).slice(0, 200) }; }
}

module.exports = { aiEnabled, hasKey, setKey, callClaude, readImage, runAgent, AI_MODEL, AI_AGENT_MODEL, costUsd, costEur, USD_EUR, PRICE_IN, PRICE_OUT,
  MODELE, pret, EFORT, _corp, _text, PRET_CAUTARE_USD, AI_SURSA_MODEL, CAUTARE_UNEALTA, LOC_CAUTARE, cautaExtern, modelPrimesteCautarea };
