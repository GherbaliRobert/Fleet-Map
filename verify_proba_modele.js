// verify_proba_modele.js — „Proba modelelor" și modelele noi (Alin, 08.10: „Haiku e slab tare… ce-mi recomanzi după?").
//
//   node verify_proba_modele.js
//
// Ce păzește:
//   1. ai.js, rulat cu un API simulat (nu se cheltuie nimic): prețurile oficiale pe model (Haiku 5.5 = a zecea parte din
//      Haiku 4.5, Sonnet 5.5 = dublu); modelele 5.x primesc gândire adaptivă cu efort „low" și loc pentru ea, Haiku 4.5
//      cererea de până acum; textul se citește pe tip de bloc (un răspuns 5.x poate începe cu „thinking"); refuzul se spune;
//      în bucla cu unelte, la 5.x istoricul NU se atinge (aceleași instrucțiuni, aceleași unelte, nota „gata" adăugată la
//      capăt, `tool_choice: none`), iar Haiku 4.5 merge pe drumul vechi;
//   2. pe server pornit, cu modelul simulat: doar super-adminul pornește proba; răspunde aceeași funcție ca pentru client;
//      modelele cerute chiar sunt chemate, în ordine; costul fiecărui răspuns e pe prețurile modelului; nimic nu ajunge în
//      conversațiile cuiva și nici în fondul firmei; o singură probă deodată; „Oprește" oprește; rând în jurnal;
//   3. pagina: butonul din panoul „Utilizare RA Insight", textul modelului scăpat înainte de afișare, costurile luate de
//      la server.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

(async () => {
  // ─── 1. ai.js, cu API-ul simulat în același proces ─────────────────────────────────────────────────
  console.log('1. Modelele: prețuri, cererea, citirea răspunsului, bucla cu unelte');
  const ai = require('./ai');
  ai.setKey('sk-ant-proba-fara-retea');
  const trimise = []; let raspunsuri = [];
  const fetchVechi = globalThis.fetch;
  globalThis.fetch = async function (url, opts) {
    trimise.push(JSON.parse(opts.body));
    const r = raspunsuri.shift() || { content: [{ type: 'text', text: 'gata' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const M = { input_tokens: 1e6 }, O = { output_tokens: 1e6 }, CR = { cache_read_input_tokens: 1e6 };
  T('prețurile oficiale (08.10): Haiku 4.5 = 1 $ / 5 $, Haiku 5.5 = 0,10 $ / 0,50 $, Sonnet 5.5 = 2 $ / 10 $ pe milion de tokeni',
    ai.costUsd(M, 'claude-haiku-4-5') === 1 && ai.costUsd(O, 'claude-haiku-4-5') === 5 && Math.abs(ai.costUsd(M, 'claude-haiku-5-5') - 0.1) < 1e-12 &&
    Math.abs(ai.costUsd(O, 'claude-haiku-5-5') - 0.5) < 1e-12 && ai.costUsd(M, 'claude-sonnet-5-5') === 2 && ai.costUsd(O, 'claude-sonnet-5-5') === 10);
  T('…și cache-ul citit: 0,10 $ / 0,01 $ / 0,10 $', Math.abs(ai.costUsd(CR, 'claude-haiku-4-5') - 0.1) < 1e-12 && Math.abs(ai.costUsd(CR, 'claude-haiku-5-5') - 0.01) < 1e-12 && Math.abs(ai.costUsd(CR, 'claude-sonnet-5-5') - 0.1) < 1e-12);
  T('fără model = modelul de bază (rândurile vechi din consum se socotesc ca până acum)', ai.costUsd(M) === ai.costUsd(M, ai.AI_MODEL));
  T('un model necunoscut ia prețurile din env (implicit 1 $ / 5 $)', ai.costUsd(M, 'claude-necunoscut') === 1 && ai.costUsd(O, 'claude-necunoscut') === 5 && ai.pret('claude-necunoscut').gandire === false);
  const c4 = ai._corp({ model: 'claude-haiku-4-5', max_tokens: 700 }), c55 = ai._corp({ model: 'claude-sonnet-5-5', max_tokens: 700 }), h55 = ai._corp({ model: 'claude-haiku-5-5', max_tokens: 700 });
  T('Haiku 4.5 primește cererea de până acum (fără gândire, fără efort)', !c4.thinking && !c4.output_config && c4.max_tokens === 700);
  T('Sonnet 5.5 și Haiku 5.5: gândire adaptivă, efort „low", loc în plus pentru gândire', [c55, h55].every((c) => c.thinking && c.thinking.type === 'adaptive' && c.output_config && c.output_config.effort === 'low' && c.max_tokens === 2700), JSON.stringify(c55));
  raspunsuri = [{ content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Răspunsul.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  T('textul se citește pe tip de bloc (răspunsul 5.x poate începe cu „thinking")', (await ai.callClaude({ system: 's', messages: [{ role: 'user', content: 'q' }], model: 'claude-sonnet-5-5' })) === 'Răspunsul.');
  raspunsuri = [{ content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } }];
  T('refuzul nu se dă drept răspuns', (await ai.callClaude({ system: 's', messages: [{ role: 'user', content: 'q' }], model: 'claude-sonnet-5-5' })) === '');
  let vazut = null;
  raspunsuri = [{ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 4 } }];
  await ai.callClaude({ system: 's', messages: [{ role: 'user', content: 'q' }], model: 'claude-haiku-5-5', onUsage: (u, m) => { vazut = m; } });
  T('consumul pleacă împreună cu modelul care a răspuns (onUsage(usage, model))', vazut === 'claude-haiku-5-5');

  // Bucla cu unelte, două runde și răspunsul final cerut după limită (maxIters = 2).
  const unealta = (id) => ({ content: [{ type: 'thinking', thinking: '', signature: 'sig' + id }, { type: 'tool_use', id: 'tu' + id, name: 'u', input: { k: id } }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } });
  const bucla = async (model) => {
    trimise.length = 0;
    raspunsuri = [unealta(1), unealta(2), { content: [{ type: 'text', text: 'Final.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
    const r = await ai.runAgent({ system: [{ type: 'text', text: 'fix', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'context' }], messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'u', description: 'd', input_schema: { type: 'object', properties: {} } }], toolHandlers: { u: async (i) => ({ ok: i.k }) }, model, maxIters: 2 });
    return { r, c: trimise.slice() };
  };
  const s = await bucla('claude-sonnet-5-5');
  const prefixNeatins = s.c.every((cer, k) => k === 0 || JSON.stringify(cer.messages.slice(0, s.c[k - 1].messages.length)) === JSON.stringify(s.c[k - 1].messages));
  T('5.x: istoricul buclei nu se atinge — fiecare cerere = cea dinainte + ce s-a adăugat', s.c.length === 3 && prefixNeatins, s.c.map((c) => c.messages.length).join(','));
  T('5.x: blocurile de gândire se trimit înapoi neschimbate', JSON.stringify(s.c[1].messages[1].content[0]) === JSON.stringify({ type: 'thinking', thinking: '', signature: 'sig1' }));
  T('5.x: aceleași instrucțiuni și aceleași unelte în TOATE cererile (și în cea finală)', s.c.every((c) => JSON.stringify(c.system) === JSON.stringify(s.c[0].system) && JSON.stringify(c.tools) === JSON.stringify(s.c[0].tools)));
  const ultimaUser = s.c[2].messages[s.c[2].messages.length - 1];
  T('5.x: răspunsul final se cere cu `tool_choice: none`, iar nota „gata" e după ultimele rezultate', s.c[2].tool_choice && s.c[2].tool_choice.type === 'none' &&
    ultimaUser.content[ultimaUser.content.length - 1].type === 'text' && /Gata cu interogările/.test(ultimaUser.content[ultimaUser.content.length - 1].text) && s.r.text === 'Final.', JSON.stringify(s.c[2].tool_choice));
  T('5.x: cache-ul cozii îl pune API-ul (cache_control pe cerere), fără semne mutate pe rezultatele vechi', s.c.every((c) => c.cache_control && c.cache_control.type === 'ephemeral') &&
    !JSON.stringify(s.c.map((c) => c.messages)).includes('"cache_control"'));
  const h = await bucla('claude-haiku-4-5');
  T('Haiku 4.5 rămâne pe drumul vechi (semnul de cache mutat pe ultimul rezultat, nota în instrucțiuni la final)',
    h.c.length === 3 && !h.c[0].cache_control && /Gata cu interogările/.test(JSON.stringify(h.c[2].system)) && !h.c[2].tool_choice && !h.c[2].tools &&
    JSON.stringify(h.c[1].messages[2].content).includes('"cache_control"'));
  raspunsuri = [{ content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } }];
  const rf = await ai.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [], toolHandlers: {}, model: 'claude-sonnet-5-5' });
  T('refuzul în buclă: un text pe față, nu un răspuns gol', rf.refuz === true && /Nu pot răspunde/.test(rf.text));
  globalThis.fetch = fetchVechi;

  // ─── 3. Pagina ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\n3. Pagina');
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const bloc = (PAG.match(/─── Proba modelelor \(Alin, 08\.10[\s\S]*?─── sfârșit „Proba modelelor" ──/) || [''])[0];
  T('butonul „Proba modelelor" stă în panoul „Utilizare RA Insight" (al nostru)', /onclick="raxProbaModele\(\)"[^>]*><i class="fas fa-flask"><\/i> Proba modelelor/.test(PAG) &&
    (PAG.match(/raxProbaModele\(\)/g) || []).length === 1 && /window\.raxLoadAiUsage = async function \(\) \{[\s\S]{0,2600}raxProbaModele\(\)/.test(PAG));
  T('textul modelului e scăpat înainte de afișare (e text străin)', /function _pmText\(t\) \{ return esc\(t\)\.replace/.test(bloc) && /_pmText\(x\.text\)/.test(bloc));
  T('costurile vin de la server (pagina doar le adună pe model)', /x\.costLei/.test(bloc) && !/costUsd|cacheRead \*|PRICE/.test(bloc));
  T('pornirea cere confirmarea, cu firma și câte întrebări × modele', /raConfirm\('Pornesc proba: '/.test(bloc));

  // ─── 2. Pe server pornit ─────────────────────────────────────────────────────────────────────────────
  const PORT = 3300, TCP = 5300;
  const DIR = path.join(os.tmpdir(), 'rax_pm_' + Date.now());
  const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
  const B = 'http://127.0.0.1:' + PORT;
  // Modelul simulat: răspunde cu text, întârziat (ca să se vadă proba „în lucru"), cu un consum fix și mare, ca diferențele
  // de preț să se vadă după rotunjire.
  fs.writeFileSync(PRELOAD, [
    "const fs = require('fs');", 'const orig = globalThis.fetch;',
    'globalThis.fetch = async function (url, opts) {', "  const u = String((url && url.url) || url);",
    "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
    "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
    "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
    "    await new Promise(function (r) { setTimeout(r, Number(process.env.PROBA_AI_MS || 0)); });",
    "    const r = { content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Răspuns de probă de la ' + corp.model + '.' }], stop_reason: 'end_turn', usage: { input_tokens: 10000, output_tokens: 2000 } };",
    "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });", '  }',
    "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
    '  return orig.apply(this, arguments);', '};'].join('\n'));
  fs.writeFileSync(AI_LOG, '');
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_pm', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_MS: '400', EUR_RON_RATE: '5',
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY; delete env.AI_MODEL; delete env.AI_AGENT_MODEL;
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const curata = () => { for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const login = async (u, p) => {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  };
  const json = async (m, u, ck, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: r.status, j: j || {} };
  };
  const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    console.log('\n2. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
    const S = await login('admin', 'test1234');
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Proba SRL' })).j;
    const gol = (await json('POST', '/api/companies', S, { name: 'Firma Fara Masini SRL' })).j;
    await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
    await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const u = (await json('POST', '/api/users', S, { username: 'sef@proba.ro', full_name: 'Sef Proba', role: 'admin', company_id: co.id })).j;
    await puneParola(u, 'Str4da-Verde-2026', B);
    await json('PUT', '/api/users/' + u.id + '/ai-seat', S, { on: true });
    const ck = await login('sef@proba.ro', 'Str4da-Verde-2026');
    await json('POST', '/api/devices/import', S, { rows: [{ imei: '862129084940001', nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }, { imei: '862129084940002', nume: 'VW Caddy', nr_inmatriculare: 'B 268 ROY' }] });
    for (const imei of ['862129084940001', '862129084940002']) await json('PUT', '/api/devices/' + imei + '/company', S, { company_id: co.id });
    // O mașină a ALTEI firme: proba nu trebuie s-o vadă (super-adminul le vede pe toate, proba doar pe cele ale firmei alese).
    const alta = (await json('POST', '/api/companies', S, { name: 'Alta Firma SRL' })).j;
    await json('POST', '/api/devices/import', S, { rows: [{ imei: '862129084940003', nume: 'Camion Altii', nr_inmatriculare: 'B 999 ALT' }] });
    await json('PUT', '/api/devices/862129084940003/company', S, { company_id: alta.id });
    T('pregătire: o firmă cu două mașini, una fără mașini, administratorul firmei', !!(co.id && gol.id && ck));

    const meta = await json('GET', '/api/admin/insight/proba-modele', S);
    T('meta: cele trei modele, cu „cel de azi" Haiku 4.5, și 20 de întrebări de pornire', meta.status === 200 && (meta.j.modele || []).map((m) => m.id).join(',') === 'claude-haiku-4-5,claude-haiku-5-5,claude-sonnet-5-5' &&
      meta.j.modelAzi === 'claude-haiku-4-5' && (meta.j.intrebari || []).length === 20 && meta.j.maxIntrebari === 20, JSON.stringify(meta.j.modele));
    T('…cu întrebarea despre o perioadă anume („între 1 și 7 …" a lunii trecute)', (meta.j.intrebari || []).some((q) => /^Ce consum am avut între 1 și 7 [a-zăâîșț]+\?$/.test(q)));
    const nuNoi = [await json('GET', '/api/admin/insight/proba-modele', ck), await json('POST', '/api/admin/insight/proba-modele', ck, { companyId: co.id, modele: ['claude-haiku-4-5'], intrebari: ['x'] })];
    T('administratorul unei firme NU poate porni și nici vedea proba (403)', nuNoi.every((r) => r.status === 403), nuNoi.map((r) => r.status).join(','));
    const fara = [await json('POST', '/api/admin/insight/proba-modele', S, { modele: ['claude-haiku-4-5'], intrebari: ['x'] }),
      await json('POST', '/api/admin/insight/proba-modele', S, { companyId: gol.id, modele: ['claude-haiku-4-5'], intrebari: ['x'] }),
      await json('POST', '/api/admin/insight/proba-modele', S, { companyId: co.id, modele: ['gpt-9'], intrebari: ['x'] }),
      await json('POST', '/api/admin/insight/proba-modele', S, { companyId: co.id, modele: ['claude-haiku-4-5'], intrebari: ['  '] })];
    T('refuzuri pe față: fără firmă, firmă fără mașini, model necunoscut, fără întrebări (400)', fara.every((r) => r.status === 400 && r.j.error), fara.map((r) => r.status + ' ' + r.j.error).join(' | '));

    fs.writeFileSync(AI_LOG, '');
    const MODELE = ['claude-haiku-4-5', 'claude-haiku-5-5', 'claude-sonnet-5-5'];
    const st = await json('POST', '/api/admin/insight/proba-modele', S, { companyId: co.id, modele: MODELE, intrebari: ['Câți km a făcut {masina} ieri?', 'Compară {masina} cu {masina2}.'] });
    T('pornește: id, estimarea de dinainte (în lei, mai mare ca zero)', st.status === 200 && st.j.id && st.j.estimatLei > 0, JSON.stringify(st.j).slice(0, 160));
    const doua = await json('POST', '/api/admin/insight/proba-modele', S, { companyId: co.id, modele: MODELE, intrebari: ['x'] });
    T('o singură probă deodată (a doua: 409)', doua.status === 409, doua.status);
    let p = null;
    for (let i = 0; i < 120; i++) { p = (await json('GET', '/api/admin/insight/proba-modele/' + st.j.id, S)).j; if (p.gata) break; await sleep(500); }
    T('proba se termină: 2 întrebări × 3 modele = 6 răspunsuri', p && p.gata && p.facute === 6 && p.total === 6 && (p.rezultate || []).every((x) => !x.eroare && /Răspuns de probă/.test(x.text)), JSON.stringify(p && p.rezultate && p.rezultate.map((x) => x.eroare || x.text)));
    const log = cereri();
    T('modelele cerute chiar sunt chemate, întrebare cu întrebare, în ordine', log.map((c) => c.model).join(',') === MODELE.concat(MODELE).join(','), log.map((c) => c.model).join(','));
    T('5.x primesc gândirea adaptivă cu efort „low"; Haiku 4.5 cererea de până acum', log.every((c) => (c.model === 'claude-haiku-4-5') === !c.thinking) &&
      log.filter((c) => c.thinking).every((c) => c.thinking.type === 'adaptive' && c.output_config && c.output_config.effort === 'low'));
    T('„{masina}" și „{masina2}" se înlocuiesc cu mașinile firmei', /Câți km a făcut B 154 UIP ieri\?/.test(JSON.stringify(log[0].messages)) && /Compară B 154 UIP cu B 268 ROY\./.test(JSON.stringify(log[3].messages)));
    const sys0 = (Array.isArray(log[0].system) ? log[0].system : [{ text: String(log[0].system) }]).map((b) => b.text).join('\n');
    T('răspunde ACEEAȘI funcție ca pentru client: instrucțiunile lui RA Insight, cu regulile de scris', /Ești „RA Insight"/.test(sys0) && /SCRISUL: română corectă și simplă/.test(sys0), sys0.slice(0, 80));
    T('…și vede DOAR mașinile firmei alese (2, nu și mașina altei firme)', /Flota la care are acces omul: 2 mașini\./.test(sys0), (sys0.match(/Flota la care are acces omul: [^.]*\./) || [''])[0]);
    const cost = {}; (p.rezultate || []).forEach((x) => { cost[x.model] = x.costLei; });
    // 10.000 de tokeni la intrare + 2.000 la ieșire, la 0,92 €/$ și 5 lei/€: Haiku 4.5 = 0,02 $ = 0,092 lei
    T('costul fiecărui răspuns, pe prețurile modelului: Haiku 4.5 0,092 lei, Haiku 5.5 0,0092 lei, Sonnet 5.5 0,184 lei',
      cost['claude-haiku-4-5'] === 0.092 && cost['claude-haiku-5-5'] === 0.0092 && cost['claude-sonnet-5-5'] === 0.184, JSON.stringify(cost));
    T('totalul probei = suma răspunsurilor', Math.abs(p.costLei - 2 * (0.092 + 0.0092 + 0.184)) < 0.01, p.costLei);
    const conv = await json('GET', '/api/insight/conversatii', ck);
    T('nimic în conversațiile cuiva (lista administratorului firmei e goală)', conv.status === 200 && JSON.stringify(conv.j).indexOf('Câți km') < 0 && ((conv.j.conversatii || conv.j || []).length === 0), JSON.stringify(conv.j).slice(0, 160));
    const us = await json('GET', '/api/admin/ai-usage', S);
    const rand = (us.j.rows || []).filter((r) => String(r.company_id || r.id) === String(co.id))[0] || {};
    T('fondul firmei neatins: 0 întrebări folosite luna asta', (Number(rand.used) || 0) === 0 && (Number(rand.questions) || 0) === 0, JSON.stringify(rand).slice(0, 200));
    const aud = await json('GET', '/api/audit?limit=50', S);
    const lista = Array.isArray(aud.j) ? aud.j : (aud.j.rows || aud.j.entries || aud.j.logs || []);
    T('rând în jurnal: cine a rulat proba, pe ce firmă, cu ce modele și cât a costat', lista.some((r) => r.action === 'ai_proba_modele'), JSON.stringify(lista.slice(0, 3)).slice(0, 200));

    // Oprește: o probă lungă, oprită după primul răspuns.
    const lung = await json('POST', '/api/admin/insight/proba-modele', S, { companyId: co.id, modele: MODELE, intrebari: ['a', 'b', 'c', 'd'] });
    await sleep(700);
    await json('POST', '/api/admin/insight/proba-modele/' + lung.j.id + '/opreste', S);
    let q = null;
    for (let i = 0; i < 60; i++) { q = (await json('GET', '/api/admin/insight/proba-modele/' + lung.j.id, S)).j; if (q.gata) break; await sleep(300); }
    T('„Oprește" oprește proba (mai puține răspunsuri decât 12, marcată „oprită")', q && q.gata && q.oprita && q.facute < 12, JSON.stringify(q && { facute: q.facute, oprita: q.oprita }));
    const strain = await json('GET', '/api/admin/insight/proba-modele/nu-exista', S);
    T('o probă care nu există: 404', strain.status === 404);
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
