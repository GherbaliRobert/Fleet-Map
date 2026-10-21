// verify_litere.js — orice text scris de AI ajunge la client DOAR cu litere românești (Alin, 20.10: „asigură-te că nu se
// întâmplă… sunt fatale pentru noi").
//
//   node verify_litere.js
//
// Pe 19.10 un răspuns RA Insight a scris „октомбrie 2026". Atunci am pus o rescriere și o curățare DOAR în RA Insight; pe 20.10
// am găsit încă două drumuri pe care textul modelului ajungea la client necurățat: „Rezumă cu RA Insight" (sub un raport) și
// rezumatul agenților. Acum regula stă într-un singur loc (litere.js), iar ai.js o pune pe ORICE răspuns al modelului.
// Aici: regula pe multe cazuri, ai.js cu API-ul simulat în proces, drumurile din server (citite din sursă) și, pe server pornit
// cu modelul simulat (nu se cheltuie nimic), „Rezumă cu RA Insight" și rezumatul agenților cu un răspuns plin de litere rusești.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const L = require('./litere.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
// O literă din alt alfabet decât cel latin (sau o literă latină „lată") — ce nu trebuie să vadă clientul niciodată.
const STRAIN = /(?=\p{L})[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]|[Ａ-Ｚａ-ｚ]/u;

// ─── 1. Regula (litere.js) ────────────────────────────────────────────────────────────────────────
console.log('\n1. Regula (litere.js)');
const CAZURI = [
  ['Consum (октомбrie 2026)', 'Consum (octombrie 2026)'],
  ['Октомбрие', 'Octombrie'],
  ['Пробег за неделю: 120 км', 'Probeg za nedeliu: 120 km'],
  ['viteza 90 км/ч, 2 ч, 18.000 кг, 300 кВт', 'viteza 90 km/h, 2 h, 18.000 kg, 300 kW'],
  ['Ελλάδα', 'Ellada'],
  ['ІЇЄҐ', 'IIiIeG'],
  ['ｏｃｔｏｍｂｒｉｅ', 'octombrie'],
  ['Consum 中文 aici', 'Consum  aici'],
  ['Raport عربي gata', 'Raport  gata'],
  ['Ştefan şi Ţuţu', 'Ștefan și Țuțu'],
];
const nepotrivite = CAZURI.filter(([a, b]) => L.litereRomanesti(a) !== b).map(([a, b]) => a + ' → ' + L.litereRomanesti(a) + ' (aștepta ' + b + ')');
T('chirilicul, grecul și literele late se transcriu, alfabetele care nu se pot transcrie se scot, ş/ţ cu sedilă devin ș/ț', !nepotrivite.length, nepotrivite.join(' | '));
const RAMAN = ['Consum (octombrie 2026): 7,5 l/100 km', 'ș ț ă î â Ș Ț Ă Î Â', 'Škoda Octavia, Müller, Ñandú, Øresund', '23 °C · m² · µm · 1/2 · №5',
  '**Concluzie:** • B 154 UIP — 1.234,5 km', '✓ Cifrele le-am luat din rapoarte', 'RA Insight · ANALIZĂ · 1 întrebare'];
T('textul românesc (cu diacritice, unități, mărci străine cu litere latine, semne) rămâne neatins și nu e socotit străin',
  RAMAN.every((t) => L.litereRomanesti(t) === t && !L.areLitereStraine(t)), RAMAN.filter((t) => L.litereRomanesti(t) !== t || L.areLitereStraine(t)).join(' | '));
const TOATE = ['Пробег', 'Ελλάδα', '中文', 'عربي', 'עברית', 'ქართული', 'Հայերեն', 'हिन्दी', 'ｏｃｔ', 'октомбrie'];
T('orice alfabet străin e recunoscut (rus, grec, chinez, arab, ebraic, georgian, armean, hindi, litere late)', TOATE.every((t) => L.areLitereStraine(t)), TOATE.filter((t) => !L.areLitereStraine(t)).join(', '));
T('…și după curățare nu mai rămâne nicio literă străină, iar a doua curățare nu mai schimbă nimic',
  TOATE.every((t) => !STRAIN.test(L.litereRomanesti(t)) && L.litereRomanesti(L.litereRomanesti(t)) === L.litereRomanesti(t)));
T('fiecare literă rusă, ucraineană și greacă are transcriere (nu dispare din cuvânt; doar semnul moale ь e mut)', (() => {
  const lit = [];
  for (let c = 0x0410; c <= 0x044F; c++) lit.push(String.fromCharCode(c));          // А…я
  lit.push('Ё', 'ё', 'Є', 'є', 'І', 'і', 'Ї', 'ї', 'Ґ', 'ґ');
  for (let c = 0x0391; c <= 0x03A9; c++) if (c !== 0x03A2) lit.push(String.fromCharCode(c));   // Α…Ω
  for (let c = 0x03B1; c <= 0x03C9; c++) lit.push(String.fromCharCode(c));          // α…ω
  const lipsa = lit.filter((c) => c.toLowerCase() !== 'ь' && !L.litereRomanesti(c));
  return lipsa.length === 0 || (console.log('     fără transcriere: ' + lipsa.join(' ')), false);
})());
const SRC_L = fs.readFileSync(path.join(__dirname, 'litere.js'), 'utf8');
T('litere.js e curat (fără bază, fără rețea, fără model) și fără caractere de control', !/require\('\.\/db|require\('pg|fetch\(|callClaude/.test(SRC_L) && !/[\x00-\x08]/.test(SRC_L));
const I = require('./insight.js');
T('RA Insight folosește ACEEAȘI regulă (insight.js o dă mai departe, n-are tabelul lui)',
  I.areLitereStraine === L.areLitereStraine && I.litereRomanesti === L.litereRomanesti && !/const CHIRILIC|const TRANSCRIERE/.test(fs.readFileSync(path.join(__dirname, 'insight.js'), 'utf8')));
const alte = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && f !== 'litere.js' && !/^verify_|^test_/.test(f))
  .filter((f) => /\\u0400-\\u04FF|ш: 'ș'|щ: 'șt'/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
T('nicio altă scriere a regulii în aplicație (un singur tabel de transcriere)', alte.length === 0, alte.join(', '));

// ─── 2. ai.js: orice răspuns al modelului e curățat, cu API-ul simulat în proces ─────────────────────
console.log('\n2. ai.js: orice răspuns al modelului trece prin litere.js');
(async () => {
  const AI = require('./ai.js');
  AI.setKey('sk-ant-proba-fara-retea');
  const orig = globalThis.fetch;
  let urmatorul = null;
  globalThis.fetch = async function () {
    const r = urmatorul || { content: [{ type: 'text', text: 'Consum pe октомбrie: 7,5 l/100 km.' }], stop_reason: 'end_turn' };
    r.usage = { input_tokens: 10, output_tokens: 5 };
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const t1 = await AI.callClaude({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    T('callClaude: răspunsul vine cu litere românești („октомбrie" → „octombrie")', t1 === 'Consum pe octombrie: 7,5 l/100 km.', t1);
    const t2 = await AI.callClaude({ system: 's', messages: [{ role: 'user', content: 'x' }], brut: true });
    T('…`brut: true` îl lasă cum l-a scris modelul (doar RA Insight îl cere, ca să ceară întâi o rescriere)', t2 === 'Consum pe октомбrie: 7,5 l/100 km.', t2);
    const r3 = await AI.runAgent({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], toolHandlers: {} });
    T('runAgent: la fel', r3.text === 'Consum pe octombrie: 7,5 l/100 km.', r3.text);
    const r4 = await AI.runAgent({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], toolHandlers: {}, brut: true });
    T('…și `brut: true` la fel ca la callClaude', r4.text === 'Consum pe октомбrie: 7,5 l/100 km.', r4.text);
    urmatorul = { content: [{ type: 'text', text: 'Ştiu: 中文 и всё.' }], stop_reason: 'end_turn' };
    const t5 = await AI.callClaude({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    T('…orice alfabet (aici chinez și rus) și sedila', !STRAIN.test(t5) && /^Știu:/.test(t5), t5);
    urmatorul = { content: [{ type: 'text', text: 'Asigurător: Ромашка SRL' }], stop_reason: 'end_turn' };
    const t6 = await AI.readImage({ b64: 'AA==', mediaType: 'image/png', prompt: 'transcrie' });
    T('readImage (transcrierea unui act al clientului) rămâne întocmai: nu e text scris de noi', t6 === 'Asigurător: Ромашка SRL', t6);
  } catch (e) { T('ai.js cu API-ul simulat', false, e.message); }
  globalThis.fetch = orig;

  // ─── 3. Drumurile din server (citite din sursă) ────────────────────────────────────────────────────
  console.log('\n3. Drumurile din server');
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const AIJ = fs.readFileSync(path.join(__dirname, 'ai.js'), 'utf8');
  T('ai.js curăță la fiecare ieșire a lui callClaude și runAgent (trei locuri), nu și la readImage',
    (AIJ.match(/_curat\(_text\(j?f?\), brut\)/g) || []).length === 3 && /function readImage[\s\S]*?return _text\(j\);\n\}/.test(AIJ));
  T('serverul nu vorbește singur cu modelul: totul trece prin ai.js', !/api\.anthropic\.com\/v1\/messages/.test(SRV));
  const iRa = SRV.indexOf('async function _raInsight('), iDupa = SRV.indexOf('\nasync function ', iRa + 10);
  const bruturi = []; let k = -1; while ((k = SRV.indexOf('brut: true', k + 1)) >= 0) bruturi.push(k);
  T('`brut: true` stă DOAR în RA Insight (răspunsul dintâi și rescrierea), care curăță el la capăt, mereu',
    bruturi.length === 2 && bruturi.every((x) => x > iRa && x < iDupa) && /\n    reply = insight\.litereRomanesti\(reply\);/.test(SRV.slice(iRa, iDupa)), JSON.stringify({ n: bruturi.length }));
  T('„Rezumă cu RA Insight" și rezumatul agenților primesc regulile de scris ale lui RA Insight (litere românești, echipamentul e treaba noastră)',
    (SRV.match(/insight\.SCRISUL, insight\.ECHIPAMENTUL\]\.join\('\\n\\n'\)/g) || []).length === 2);
  T('Scrisoarea de luni: aceleași reguli, plus curățarea ei', /require\('\.\/insight'\)\.ECHIPAMENTUL/.test(fs.readFileSync(path.join(__dirname, 'ramuri.js'), 'utf8')) &&
    /text: insight\.litereRomanesti\(String\(text\)\.trim\(\)\), scrisDe: 'model'/.test(SRV));
  T('mesajele salvate înainte (ca cel cu „октомбrie" din poza lui Alin) se curăță la citire; ce a scris omul rămâne', /if \(m\.rol !== 'user'\) m\.text = insight\.litereRomanesti\(m\.text\);/.test(SRV) &&
    /text: insight\.litereRomanesti\(x\.text\), fapte: x\.fapte/.test(SRV));
  T('…și nu mai ajung nici în istoricul pe care îl citește modelul la întrebarea următoare',
    I.istoricPentruModel([{ rol: 'user', text: 'consum?' }, { rol: 'assistant', text: 'Pe октомбrie: 7 l.' }, { rol: 'user', text: 'și ieri?' }])[1].content === 'Pe octombrie: 7 l.');

  // ─── 4. Pe server pornit, cu modelul simulat ─────────────────────────────────────────────────────
  const PORT = 3298, TCP = 5298;
  const DIR = path.join(os.tmpdir(), 'rax_litere_' + Date.now());
  const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json';
  const B = 'http://127.0.0.1:' + PORT;
  fs.writeFileSync(PRELOAD, [
    "const fs = require('fs');", 'const orig = globalThis.fetch;',
    'globalThis.fetch = async function (url, opts) {', "  const u = String((url && url.url) || url);",
    "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
    "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
    "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
    "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
    "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
    "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada)); r.usage = { input_tokens: 100, output_tokens: 20 };",
    "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });", '  }',
    "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
    '  return orig.apply(this, arguments);', '};'].join('\n'));
  fs.writeFileSync(AI_LOG, ''); fs.writeFileSync(AI_COADA, '[]');
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_litere', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA, RATE_LIMIT_ENABLED: 'false',
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY; delete env.BREVO_API_KEY; delete env.SMTP_HOST;
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const curata = () => { for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
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
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j: j || {}, text };
  };
  const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
  const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
  const sistem = (c) => (Array.isArray(c.system) ? c.system.map((b) => b.text || '').join('\n') : String(c.system || ''));

  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
  try {
    const S = await login('admin', 'test1234');
    await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Litere SRL' })).j;
    await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
    const IM = '862129084933001';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: IM, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }] });
    await json('PUT', '/api/devices/' + IM + '/company', S, { company_id: co.id });
    // o poziție veche de două zile: RA Watch găsește mașina care nu mai transmite (o constatare pentru rezumat)
    await json('POST', '/api/test/simulate', S, { imei: IM, ts: new Date(Date.now() - 2 * 86400000).toISOString(), lat: 44.43, lng: 26.1, speed: 0, io: { ignition: 0 } });
    const u = (await json('POST', '/api/users', S, { username: 'sef@litere.ro', full_name: 'Om Probă', role: 'company_admin', company_id: co.id })).j;
    await puneParola(u, 'Str4da-Verde-2026', B);
    await json('PUT', '/api/users/' + u.id + '/ai-seat', S, { on: true });
    const ck = await login('sef@litere.ro', 'Str4da-Verde-2026');
    T('pregătire: firma pe Pro, o mașină, administratorul cu RA Insight', !!(co.id && ck));

    const n1 = cereri().length;
    coada([text('**Rezumat:** • B 154 UIP a mers 120 км pe октомбrie. • Ştiu că 中文 consumul e bun.')]);
    const rz = await json('POST', '/api/ai/report-summary', ck, { type: 'utilization', report: { title: 'Utilizare', columns: ['Vehicul', 'Km'], rows: [['B 154 UIP', '120']] } });
    const c1 = cereri().slice(n1)[0] || {};
    T('„Rezumă cu RA Insight": modelul a scris cu litere rusești și chinezești, clientul primește numai litere românești',
      rz.status === 200 && !STRAIN.test(rz.j.summary || '') && /octombrie/.test(rz.j.summary || '') && /Știu/.test(rz.j.summary || ''), JSON.stringify({ s: rz.status, t: rz.j.summary, e: rz.j.error }));
    T('…iar modelul a primit regulile de scris (numai litere românești, echipamentul e treaba noastră)', /numai cu litere românești/.test(sistem(c1)) && /ECHIPAMENTUL:/.test(sistem(c1)), sistem(c1).slice(0, 160));

    const n2 = cereri().length;
    coada([text('Prioritate: B 154 UIP nu transmite de 2 zile — октомбrie. Sunați șoferul.')]);
    const ag = await json('POST', '/api/agents/run', ck, { agent: 'all' });
    const c2 = cereri().slice(n2)[0] || {};
    T('rezumatul agenților: la fel, numai litere românești', ag.status === 200 && !!ag.j.aiSummary && !STRAIN.test(ag.j.aiSummary) && /octombrie/.test(ag.j.aiSummary),
      JSON.stringify({ s: ag.status, n: (ag.j.findings || []).length, t: ag.j.aiSummary, e: ag.j.error }));
    T('…cu aceleași reguli de scris', /numai cu litere românești/.test(sistem(c2)) && /ECHIPAMENTUL:/.test(sistem(c2)), sistem(c2).slice(0, 160));

    const n3 = cereri().length;
    coada([text('Consum (октомбrie 2026): nimic neobișnuit.'), text('Tot pe октомбrie: nimic neobișnuit.')]);
    const q = await json('POST', '/api/insight/intreaba', ck, { message: 'care e consumul la B 154 UIP pe octombrie, de ce?', nou: true });
    T('RA Insight: o rescriere, apoi curățarea — clientul nu vede nicio literă străină', q.status === 200 && !STRAIN.test(q.j.reply || '') && /octombrie/.test(q.j.reply || '') && cereri().length - n3 === 2,
      JSON.stringify({ s: q.status, n: cereri().length - n3, r: q.j.reply }));
    const cv = q.j.conversatieId ? await json('GET', '/api/insight/conversatii/' + q.j.conversatieId, ck) : { j: {} };
    T('…și conversația salvată, redeschisă, la fel', (cv.j.mesaje || []).length >= 2 && (cv.j.mesaje || []).every((m) => m.rol === 'user' || !STRAIN.test(m.text || '')), JSON.stringify((cv.j.mesaje || []).map((m) => m.text)));
  } catch (e) { T('serverul cu modelul simulat', false, e.stack); }

  console.log('\n' + ok + '/' + (ok + rele) + ' verificări trecute');
  gata(rele ? 1 : 0);
})();
