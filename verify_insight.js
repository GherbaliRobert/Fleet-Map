// verify_insight.js — RA Insight recunoaște mașina (număr, nume, șofer, grupă) și ține minte discuția.
//
//   node verify_insight.js
//
// De ce (Alin, 02.10, cu două capturi): „Câți km a făcut B 154 UIP săptămâna trecută?" → „B 154 UIP nu apare
// în flotă"; apoi „Dacia Logan 3" → „ce vrei să afli?". Modelul primea mașinile doar cu numele și fiecare mesaj
// pleca singur. Proba păzește cele două reparații și regulile din jurul lor:
//   1. fișa flotei (insight.js): număr cu/fără spații, pe jumătate, nume cu terminații, șofer, grupă, ambiguități;
//   2. perioadele pe ora României și cum se scriu („21–27 septembrie", „septembrie 2026");
//   3. răspunsul rapid gratuit DOAR la întrebări despre acum (nu la „câți kilometri … săptămâna trecută");
//   4. forma memoriei trimise modelului;
//   5. hârtia și copiile: 12 luni pe pagina de confidențialitate, conversațiile în afara copiilor;
//   6. pe server pornit, cu un model SIMULAT (nu cheltuim nimic): numărul ajunge la unealtă, a doua întrebare
//      vede prima, continuarea fără id, conversația nouă, nimeni altcineva nu vede conversația (nici noi),
//      butoanele de ales, „celălalt", răspunsul rapid pe o mașină, ușa veche a telefonului, fondul, ștergerea la 12 luni;
//   7. pasul 2 (secțiunea proprie): rândul din meniu și secțiunea, notițele firmei (le scrie doar adminul, ajung în
//      contextul întrebării, nu în partea fixă), ghidul (unealta `cauta_in_ghid`), un raport tăiat din rol nu se scoate
//      nici prin RA Insight, statisticile pentru noi numără fără să citească textul conversațiilor.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const I = require('./insight');
const contracte = require('./contracts');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Fișa flotei ─────────────────────────────────────────────────────────────────────────────────
console.log('1. RA Insight recunoaște mașina oricum i-ai spune');
const DEV = [
  { imei: '350000000031001', name: 'Dacia Logan 3', plate: 'B 154 UIP', driver_id: 1, group_name: 'Distribuție' },
  { imei: '350000000031002', name: 'Dacia Logan 2', plate: 'B 155 UIP', driver_id: 2, group_name: 'Distribuție' },
  { imei: '350000000031003', name: 'Dacia Logan 1', plate: 'CJ 12 RAT', driver_id: 3, group_name: 'Cluj' },
  { imei: '350000000031004', name: 'VW Passat B7', plate: 'B 77 RAT', driver_id: 4 },
  { imei: '350000000031005', name: 'VW CADDY', plate: 'IF 01 ABC', driver_id: 5 },
  { imei: '350000000031006', name: 'Camion 1', plate: 'B 999 TIR' },
];
const SOF = { 1: 'Ion Popescu', 2: 'Gheorghe Marin', 3: 'Andrei Stan', 4: 'Maria Ionescu', 5: 'Ion Mare' };
const F = I.fisaFlotei(DEV, SOF);
const gas = (t) => I.gasesteInText(t, F);
const nr = (lista) => lista.map((v) => v.nr).join(',');
const amb = (g) => g.ambigue.map((a) => nr(a.variante)).join(' | ');
const ALIN = 'CATI KILOMETIR MI A FACUT MASINA B 154 UIP, SAPTAMANA TRECUTA SI CE CONSUM A AVUT?';
T('întrebarea lui Alin (tastată în grabă, cu majuscule) găsește B 154 UIP', nr(gas(ALIN).masini) === 'B 154 UIP', nr(gas(ALIN).masini));
T('numărul lipit („b154uip") e același număr', nr(gas('cat a consumat b154uip luna asta').masini) === 'B 154 UIP');
T('numărul fără județ („155 UIP") ajunge la mașina lui', nr(gas('si 155 UIP?').masini) === 'B 155 UIP');
T('numele întreg („Dacia Logan 3") — exact mașina aceea, nu celelalte Logan', nr(gas('Dacia Logan 3').masini) === 'B 154 UIP');
T('numele cu terminație („loganul 2") + cifra aleg mașina', nr(gas('loganul 2 cat a mers ieri').masini) === 'B 155 UIP');
T('„caddy-ul" și „passatului" — terminațiile nu încurcă', nr(gas('unde e caddy-ul?').masini) === 'IF 01 ABC' && nr(gas('passatului ce i s-a intamplat').masini) === 'B 77 RAT');
T('„camionul 1": un nume făcut din cuvinte obișnuite se găsește după cifră', nr(gas('camionul 1 unde e').masini) === 'B 999 TIR');
T('„Logan" singur, cu trei Logan în flotă → îndoială, NU o alegere', amb(gas('Dar celălalt Logan?')) === 'B 154 UIP,B 155 UIP,CJ 12 RAT' && !gas('Dar celălalt Logan?').masini.length, amb(gas('Dar celălalt Logan?')));
T('„mașina lui Ion", cu doi Ion în firmă → îndoială', amb(gas('masina lui Ion')) === 'B 154 UIP,IF 01 ABC', amb(gas('masina lui Ion')));
T('„Loganul lui Ion": cele două îndoieli se taie într-o singură mașină', nr(gas('Loganul lui Ion').masini) === 'B 154 UIP' && !gas('Loganul lui Ion').ambigue.length);
T('numele întreg al șoferului („Ion Popescu") → mașina lui', nr(gas('Ion Popescu cat a condus').masini) === 'B 154 UIP');
T('un cuvânt obișnuit egal cu un nume de familie („consum mare") NU găsește un șofer', !gas('consum mare la flota').masini.length && !gas('consum mare la flota').ambigue.length);
T('„grupa Cluj" / „Distribuție" → grupa, cu mașinile ei', gas('km pe grupa Cluj').grupe.map((g) => g.nume).join() === 'Cluj' && nr(gas('consumul pe Distribuție în septembrie').grupe[0].masini) === 'B 154 UIP,B 155 UIP');
T('o sumă de bani („120 lei") nu e luată drept număr de mașină', !gas('cât costă 120 lei motorina').masini.length);
const DOAR_LOGAN = I.fisaFlotei(DEV.slice(0, 3), SOF);
T('o flotă numai de Logan: „loganul" e îndoială între toate, nu „nimic" (prins pe server)', I.gasesteInText('cat a mers loganul azi', DOAR_LOGAN).ambigue.map((a) => a.variante.length).join() === '3' && I.rezolva('Logan', DOAR_LOGAN).tip === 'ambiguu');
T('…iar „loganul 3" alege tot mașina aceea', I.gasesteInText('cat a mers loganul 3', DOAR_LOGAN).masini.map((v) => v.nr).join() === 'B 154 UIP');
const rz = (q) => I.rezolva(q, F);
T('unealta: „B 154 UIP" → o mașină sigură', rz('B 154 UIP').tip === 'unic' && rz('B 154 UIP').v.nr === 'B 154 UIP');
T('unealta: „Ion" (scris de model) → doi Ion, de întrebat', rz('Ion').tip === 'ambiguu' && rz('Ion').variante.length === 2);
T('unealta: „Ion Mare" → doar mașina lui, nu și a lui Ion Popescu', rz('Ion Mare').tip === 'unic' && rz('Ion Mare').v.nr === 'IF 01 ABC', JSON.stringify(rz('Ion Mare').tip));
T('unealta: „Distribuție" → grupa', rz('Distribuție').tip === 'grupa' && rz('Distribuție').vs.length === 2);
T('unealta: ce nu există → nimic (nu o mașină oarecare)', rz('XYZ 99').tip === 'nimic');
T('eticheta: numărul întâi, apoi numele', I.eticheta(F[0]) === 'B 154 UIP · Dacia Logan 3');
T('titlul conversației: numărul scris ca în aplicație, oricum l-a tastat omul', /B 154 UIP/.test(I.titluDin('cat a consumat b154uip luna asta', gas('cat a consumat b154uip luna asta').masini)) && /^Cati kilometir/.test(I.titluDin(ALIN, gas(ALIN).masini)));

// ─── 2. Perioadele, pe ora României ─────────────────────────────────────────────────────────────────
console.log('\n2. „Azi", „săptămâna trecută", „septembrie" — pe ora României');
const ACUM = Date.parse('2026-10-02T09:56:00Z');   // vineri, 12:56 la București
const P = (p) => I.perioada(p, ACUM);
const E = (p) => { const r = P(p); return I.etichetaPerioadei(r.from, r.to, ACUM); };
T('„azi" începe la miezul nopții ROMÂNIEI (21:00 UTC vara), nu la al serverului', P({ period: 'today' }).from === '2026-10-01T21:00:00.000Z' && E({ period: 'today' }) === 'azi');
T('„ieri" = ziua întreagă de ieri', E({ period: 'yesterday' }) === 'ieri' && P({ period: 'yesterday' }).to === '2026-10-01T21:00:00.000Z');
T('„săptămâna trecută" = luni–duminică: 21–27 septembrie', E({ period: 'last_week' }) === '21–27 septembrie' && P({ period: 'last_week' }).from === '2026-09-20T21:00:00.000Z', E({ period: 'last_week' }));
T('„luna trecută" = septembrie 2026, întreagă', E({ period: 'last_month' }) === 'septembrie 2026');
T('„luna asta" = octombrie, până azi', E({ period: 'this_month' }) === 'octombrie 2026 (până azi)');
T('o lună anume („2026-09") = aceeași lună întreagă', E({ month: '2026-09' }) === 'septembrie 2026' && P({ month: '2026-09' }).to === P({ period: 'last_month' }).to);
T('fără perioadă → ultimele 7 zile', E({}) === '25 septembrie – azi', E({}));
// trecerea la ora de iarnă (25.10.2026): ziua are 25 de ore, iar miezul nopții se mută de la 21:00 la 22:00 UTC
const IARNA = Date.parse('2026-10-26T10:00:00Z');
T('după trecerea la ora de iarnă, „azi" începe la 22:00 UTC', I.perioada({ period: 'today' }, IARNA).from === '2026-10-25T22:00:00.000Z');
T('„săptămâna trecută" peste schimbarea orei: 19–25 octombrie', I.etichetaPerioadei(I.perioada({ period: 'last_week' }, IARNA).from, I.perioada({ period: 'last_week' }, IARNA).to, IARNA) === '19–25 octombrie');
const VARA = Date.parse('2026-03-30T10:00:00Z');   // luni, după trecerea la ora de vară (29.03)
T('după trecerea la ora de vară, „ieri" (29 martie, 23 de ore) se scrie „ieri"', I.etichetaPerioadei(I.perioada({ period: 'yesterday' }, VARA).from, I.perioada({ period: 'yesterday' }, VARA).to, VARA) === 'ieri');

// ─── 3. Răspunsul rapid gratuit: doar despre ACUM ───────────────────────────────────────────────────
console.log('\n3. Răspunsul rapid (gratuit) doar la întrebări despre acum');
const rapid = (t, ctx) => I.potrivitPentruRapid(t, gas(t), !!ctx);
T('„Unde sunt vehiculele?" → rapid', rapid('Unde sunt vehiculele?'));
T('„Câți km azi?" → rapid', rapid('Câți km azi?'));
T('„cum stă flota" / „status flotă" → rapid', rapid('cum sta flota') && rapid('status flota'));
T('întrebarea lui Alin scrisă CORECT („kilometri … săptămâna trecută") → NU rapid (altfel primea km-ii de azi)', !rapid('Câți kilometri a făcut B 154 UIP săptămâna trecută și ce consum a avut?'));
T('„km și consum azi" → NU rapid (răspunsul rapid știe doar km)', !rapid('km si consum azi'));
T('o continuare („și ieri?") într-o discuție → NU rapid', !rapid('si ieri?', true));
T('„unde e Loganul?" cu trei Logan → NU rapid (întâi se lămurește care)', !rapid('unde e loganul?'));

// ─── 4. Memoria trimisă modelului ───────────────────────────────────────────────────────────────────
console.log('\n4. Ce vede modelul din discuție');
const lung = 'x'.repeat(3000);
const ist = I.istoricPentruModel([{ rol: 'user', text: 'a' }, { rol: 'assistant', text: 'b' }, { rol: 'user', text: 'c' }, { rol: 'user', text: 'd' }, { rol: 'assistant', text: lung }], 12, 1500);
T('rolurile alternează (două întrebări la rând se lipesc)', ist.map((m) => m.role).join(',') === 'user,assistant,user,assistant' && ist[2].content === 'c\n\nd');
T('un răspuns lung se taie (memoria rămâne ieftină)', ist[3].content.length < 1600 && /\[…\]$/.test(ist[3].content));
T('se începe cu omul, iar o întrebare rămasă fără răspuns nu se dublează', I.istoricPentruModel([{ rol: 'assistant', text: 'z' }, { rol: 'user', text: 'q' }]).length === 0);
const multe = []; for (let i = 0; i < 40; i++) multe.push({ rol: i % 2 ? 'assistant' : 'user', text: 'm' + i });
T('doar ultimele 12 mesaje', I.istoricPentruModel(multe, 12, 1500).length === 12 && I.istoricPentruModel(multe, 12, 1500)[0].content === 'm28');

// ─── 5. Hârtia și copiile ───────────────────────────────────────────────────────────────────────────
console.log('\n5. Promisiunea scrisă: 12 luni, doar omul lor, nu în copii');
const CONF = fs.readFileSync(path.join(__dirname, 'public', 'confidentialitate.html'), 'utf8');
T('pagina de confidențialitate spune cât se țin conversațiile, cu cifra din cod', new RegExp('Conversațiile cu RA Insight[^<]*le vede doar omul care le-a scris; <b>' + contracte.LUNI_CONVERSATII_AI + ' luni</b>').test(CONF));
T('cifra din cod e 12', contracte.LUNI_CONVERSATII_AI === 12);
const BK = fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8');
T('conversațiile NU intră în copiile de siguranță (ar trăi mai mult decât promitem)', /ai_conversatii:\s*'/.test(BK) && /ai_mesaje:\s*'/.test(BK));
const HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const ACT = fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'lib', 'activitate.ts'), 'utf8');
T('„Istoric activitate" scrie românește descărcarea istoricului complet (web și telefon, la fel)', /device_history: 'istoricul complet al mașinii'/.test(HTML) && /device_history: 'istoricul complet al mașinii'/.test(ACT));
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
T('uneltele de rapoarte se dau doar cui are dreptul la rapoarte', /if \(cuRapoarte\) tools\.push\(\{\s*name: 'run_report'/.test(SRV));
T('ușa nouă a secțiunii stă sub plafonul de întrebări AI pe minut', /const isAi = p\.indexOf\('\/api\/ai\/'\) === 0 \|\| p === '\/api\/insight\/intreaba';/.test(SRV));
T('„Asistent AI" de pe telefonul vechi trece prin ACELAȘI RA Insight', /app\.post\('\/api\/ai\/chat',[^\n]*_raInsight\(req, res/.test(SRV));
T('o singură funcție răspunde (trei uși, un asistent)', (SRV.match(/_raInsight\(req, res, \{/g) || []).length === 3, (SRV.match(/_raInsight\(req, res, \{/g) || []).length);

// ─── 6. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3291, TCP = 5291;
const DIR = path.join(os.tmpdir(), 'rax_insight_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json';
const B = 'http://127.0.0.1:' + PORT;
// Modelul simulat: fiecare cerere se scrie (JSON pe rând), iar răspunsul vine din coadă (sau un text de rezervă).
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
  "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
  "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
  "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada));",
  "    r.usage = { input_tokens: 100, output_tokens: 20 };",
  "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
fs.writeFileSync(AI_COADA, '[]');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_insight', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA,
});
delete env.DATABASE_URL;
delete env.ANTHROPIC_API_KEY;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() {
  for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} }
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function loginTelefon(u, p) {
  const r = await fetch(B + '/api/mobile/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p, device: 'proba' }) });
  const j = await r.json().catch(() => ({}));
  return j.token ? { token: j.token } : null;
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (typeof cine === 'string') h.Cookie = cine; else if (cine && cine.token) h.Authorization = 'Bearer ' + cine.token;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const unealta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const textulCererii = (c) => (c.messages || []).map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
const contextul = (c) => (Array.isArray(c.system) ? c.system.map((b) => b.text).join('\n') : String(c.system || ''));

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n6. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const PAROLA = 'Str4da-Verde-2026';
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Insight SRL' })).j;
  const co2 = (await json('POST', '/api/companies', S, { name: 'Alta Firma Insight SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  await json('PUT', '/api/companies/' + co2.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  const cheie = await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  T('pregătire: două firme cu RA Insight, cheie de probă', !!co.id && !!co2.id && cheie.status === 200);
  async function om(username, role, companyId) {
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    if (r.j && r.j.id) await json('PUT', '/api/users/' + r.j.id + '/ai-seat', S, { on: true });
    return r.j;
  }
  const sef = await om('sef@insight.ro', 'admin', co.id);
  const coleg = await om('coleg@insight.ro', 'manager', co.id);
  await om('sef@alta-insight.ro', 'admin', co2.id);
  const ckSef = await login('sef@insight.ro', PAROLA), ckColeg = await login('coleg@insight.ro', PAROLA), ckAlt = await login('sef@alta-insight.ro', PAROLA);
  const telSef = await loginTelefon('sef@insight.ro', PAROLA);
  T('pregătire: șeful, un coleg (amândoi cu RA Insight) și șeful altei firme intră', !!(sef.id && coleg.id && ckSef && ckColeg && ckAlt && telSef));
  // Mașinile le înregistrăm NOI (super-admin) și le dăm pe firmă; șoferii și grupele sunt ale firmei.
  // Importul citește coloanele pe românește (ca fișierul CSV): „nume", „nr_inmatriculare".
  await json('POST', '/api/devices/import', S, { rows: DEV.slice(0, 3).map((d) => ({ imei: d.imei, nume: d.name, nr_inmatriculare: d.plate })) });
  for (const d of DEV.slice(0, 3)) await json('PUT', '/api/devices/' + d.imei + '/company', S, { company_id: co.id });
  const sof1 = (await json('POST', '/api/drivers', ckSef, { name: 'Ion Popescu' })).j;
  const grupa = (await json('POST', '/api/groups', ckSef, { name: 'Distribuție' })).j;
  await json('PUT', '/api/devices/' + DEV[0].imei + '/assign', ckSef, { driver_id: sof1.id, group_id: grupa.id });
  const dev = (await json('GET', '/api/devices', ckSef)).j;
  const lista = Array.isArray(dev) ? dev : (dev.devices || []);
  T('pregătire: trei Logan pe firmă, B 154 UIP cu șofer și grupă', lista.length === 3 && lista.some((d) => d.plate === 'B 154 UIP' && d.driver_id === sof1.id), lista.length);
  // O poziție live pentru B 154 UIP, ca răspunsul rapid să aibă ce arăta.
  await json('POST', '/api/test/simulate', S, { imei: DEV[0].imei, name: DEV[0].name, speed: 0, io: { ignition: 0 } });
  const folosite = async () => (await json('GET', '/api/ai/quota', ckSef)).j.used;

  // a) prima întrebare: numărul ajunge la unealtă
  coada([unealta('run_report', { type: 'utilization', vehicle: 'B154UIP', period: 'last_week' }), text('**B 154 UIP (Dacia Logan 3)** — 538 km săptămâna trecută.')]);
  const q1 = await json('POST', '/api/ai/reports-agent', ckSef, { message: ALIN });
  const c1 = cereri();
  T('prima întrebare primește răspunsul modelului', q1.status === 200 && /538 km/.test(q1.j.reply || ''), q1.status + ' ' + q1.text.slice(0, 120));
  T('modelul a fost chemat de două ori (unealta, apoi răspunsul)', c1.length === 2, c1.length);
  T('instrucțiunile vin în două bucăți: partea fixă (în cache) + contextul întrebării', Array.isArray(c1[0].system) && c1[0].system.length === 2 && !!c1[0].system[0].cache_control && !c1[0].system[1].cache_control);
  T('contextul îi spune modelului ce mașină a pomenit omul, cu număr, nume, șofer și grupă', /B 154 UIP = „Dacia Logan 3" \(șofer Ion Popescu, grupa Distribuție\)/.test(contextul(c1[0])), contextul(c1[0]).slice(0, 300));
  T('unealta de rapoarte primește numărul cum l-a scris omul și știe și „month"', (c1[0].tools || []).some((t) => t.name === 'run_report' && t.input_schema.properties.month && t.input_schema.properties.group));
  const rez = (c1[1].messages || []).slice(-1)[0];
  T('raportul a rulat pe B 154 UIP („B154UIP" a fost recunoscut), nu „nu apare"', JSON.stringify(rez).indexOf('B 154 UIP · Dacia Logan 3') >= 0 && JSON.stringify(rez).indexOf('Nicio mașină') < 0, JSON.stringify(rez).slice(0, 200));
  T('sursa: Index km / ore, pe B 154 UIP, săptămâna trecută', (q1.j.sources || []).length === 1 && q1.j.sources[0].imei === DEV[0].imei && q1.j.sources[0].label === 'Index km / ore' && /septembrie|octombrie/.test(q1.j.sources[0].perioada || ''), JSON.stringify(q1.j.sources));
  const inteles1 = (q1.j.inteles || []).map((x) => x.tip + ':' + x.text);
  T('„Am înțeles": mașina, perioada și raportul', inteles1.includes('masina:B 154 UIP · Dacia Logan 3') && inteles1.some((x) => /^perioada:\d/.test(x)) && inteles1.includes('subiect:Index km / ore'), inteles1.join(' | '));
  T('conversația s-a păstrat (are id)', Number(q1.j.conversatieId) > 0 && Number(q1.j.mesajId) > 0);
  T('întrebarea se numără o singură dată din fond, deși modelul a lucrat în doi pași', (await folosite()) === 1);
  // Chatul modern (08.10): sub răspunsul cu un raport, întrebările de continuare — ACEEAȘI regulă ca AI Raport (aiRaport.urmari).
  T('sub răspuns, întrebările de continuare din raportul citit: „Și săptămâna dinainte?", „Și consumul?", „Și pe toată flota?"', (q1.j.urmari || []).map((x) => x.text).join(' | ') === 'Și săptămâna dinainte? | Și consumul? | Și pe toată flota?', JSON.stringify(q1.j.urmari));

  // b) continuarea, cu id: modelul vede discuția
  coada([text('Față de 14–20 septembrie: +66 km.')]);
  const q2 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Și față de săptămâna dinainte?', conversatieId: q1.j.conversatieId });
  const c2 = cereri().slice(-1)[0];
  T('a doua întrebare rămâne în aceeași conversație', q2.status === 200 && q2.j.conversatieId === q1.j.conversatieId);
  T('modelul vede întrebarea și răspunsul de dinainte (memoria)', (c2.messages || []).length === 3 && textulCererii(c2).indexOf('KILOMETIR') >= 0 && textulCererii(c2).indexOf('538 km') >= 0, (c2.messages || []).map((m) => m.role).join(','));
  T('și știe ce s-a discutat: mașina, perioada, raportul', /Din discuția de până acum — mașina: B 154 UIP · Dacia Logan 3; perioada: \d+[^;]*; rapoarte: Index km \/ ore/.test(contextul(c2)), contextul(c2).split('\n').slice(-1)[0]);

  // c) fără id, imediat după: se continuă ultima conversație (telefonul vechi și bula nu trimit id)
  coada([text('Dacia Logan 3 a consumat 36,6 litri.')]);
  const q3 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Dacia Logan 3' });
  const c3 = cereri().slice(-1)[0];
  T('„Dacia Logan 3" trimis singur continuă discuția (nu mai întreabă „ce vrei să afli")', q3.j.conversatieId === q1.j.conversatieId && (c3.messages || []).length === 5, q3.j.conversatieId + ' / ' + (c3.messages || []).length);

  // d) conversație nouă la cerere
  coada([text('Bună!')]);
  const q4 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Ce probleme are flota?', nou: true });
  const c4 = cereri().slice(-1)[0];
  T('„Conversație nouă" pornește de la zero', q4.j.conversatieId && q4.j.conversatieId !== q1.j.conversatieId && (c4.messages || []).length === 1);

  // e) lista și citirea
  const l1 = await json('GET', '/api/insight/conversatii', ckSef);
  T('lista: două conversații, cea mai nouă întâi; titlul cu numărul scris ca în aplicație', l1.status === 200 && l1.j.conversatii.length === 2 && l1.j.conversatii[0].id === q4.j.conversatieId && /B 154 UIP/.test(l1.j.conversatii[1].titlu || ''), JSON.stringify(l1.j.conversatii.map((c) => c.titlu)));
  T('lista spune și cât se păstrează (12 luni)', l1.j.pastrareLuni === 12);
  const cit = await json('GET', '/api/insight/conversatii/' + q1.j.conversatieId, ckSef);
  T('conversația se redeschide: 3 întrebări + 3 răspunsuri, cu „Am înțeles" la răspuns', cit.status === 200 && cit.j.mesaje.length === 6 && cit.j.mesaje[1].rol === 'assistant' && (cit.j.mesaje[1].extra.inteles || []).length >= 3, cit.status + ' ' + (cit.j.mesaje || []).length);
  T('…și cu întrebările de continuare păstrate (se arată sub ultimul răspuns când o redeschizi)', (cit.j.mesaje[1].extra.urmari || []).length === 3);
  const cauta = await json('GET', '/api/insight/conversatii?q=36,6', ckSef);
  T('căutarea găsește și în textul răspunsurilor', cauta.j.conversatii.length === 1 && cauta.j.conversatii[0].id === q1.j.conversatieId);

  // f) nimeni altcineva nu o vede — nici colegul, nici altă firmă, nici noi
  const idC = q1.j.conversatieId;
  for (const [cine, ck] of [['colegul din aceeași firmă', ckColeg], ['șeful altei firme', ckAlt], ['super-adminul (noi)', S]]) {
    const g = await json('GET', '/api/insight/conversatii/' + idC, ck);
    const d = await json('DELETE', '/api/insight/conversatii/' + idC, ck);
    const p = await json('PUT', '/api/insight/conversatii/' + idC, ck, { titlu: 'furat' });
    const f = await json('POST', '/api/insight/mesaje/' + q1.j.mesajId + '/feedback', ck, { valoare: -1 });
    const l = await json('GET', '/api/insight/conversatii', ck);
    T(cine + ': nu o citește, nu o șterge, nu o redenumește, nu o notează, nu o vede în listă', g.status === 404 && d.status === 404 && p.status === 404 && f.status === 404 && !(l.j.conversatii || []).some((c) => c.id === idC), [g.status, d.status, p.status, f.status].join(','));
    coada([text('x')]);
    const furt = await json('POST', '/api/ai/reports-agent', ck, { message: 'continuă', conversatieId: idC });
    T(cine + ': nu poate nici continua conversația altuia', furt.status === 404, furt.status);
  }
  const dupa = await json('GET', '/api/insight/conversatii/' + idC, ckSef);
  T('conversația a rămas întreagă, cu titlul ei', dupa.j.mesaje.length === 6 && dupa.j.conversatie.titlu !== 'furat');

  // g) 👍 / 👎
  const fb = await json('POST', '/api/insight/mesaje/' + q1.j.mesajId + '/feedback', ckSef, { valoare: 1 });
  const dupaFb = await json('GET', '/api/insight/conversatii/' + idC, ckSef);
  T('👍 pe un răspuns se ține minte', fb.status === 200 && dupaFb.j.mesaje.find((m) => m.id === q1.j.mesajId).feedback === 1);
  const fbQ = await json('POST', '/api/insight/mesaje/' + (q1.j.mesajId - 1) + '/feedback', ckSef, { valoare: 1 });
  T('dar nu pe o întrebare (doar răspunsurile se notează)', fbQ.status === 404);

  // h) îndoială: unealta întoarce variantele, ecranul primește butoane
  coada([unealta('run_report', { type: 'utilization', vehicle: 'Logan', period: 'today' }), text('Care Logan? B 154 UIP, B 155 UIP sau CJ 12 RAT?')]);
  const q5 = await json('POST', '/api/insight/intreaba', ckSef, { message: 'cât a mers loganul azi', nou: true });
  const c5 = cereri().slice(-1)[0];
  T('unealta nu alege la întâmplare: îi spune modelului că sunt mai multe', JSON.stringify(c5.messages.slice(-1)[0]).indexOf('ambiguu') >= 0);
  T('răspunsul are butoane cu cele trei Logan (de apăsat în loc de scris)', (q5.j.alege || []).map((a) => a.trimite).sort().join(',') === 'B 154 UIP,B 155 UIP,CJ 12 RAT', JSON.stringify(q5.j.alege));
  T('și nu s-a rulat niciun raport (nici continuări: întâi alege mașina)', !(q5.j.sources || []).length && !(q5.j.urmari || []).length);
  // „celălalt": se scoate mașina despre care tocmai s-a vorbit
  coada([text('Care dintre B 155 UIP și CJ 12 RAT?')]);
  const q6 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Dar celălalt Logan?', conversatieId: q1.j.conversatieId });
  T('„celălalt Logan": butoanele lasă deoparte B 154 UIP, despre care tocmai era vorba', (q6.j.alege || []).map((a) => a.trimite).sort().join(',') === 'B 155 UIP,CJ 12 RAT', JSON.stringify(q6.j.alege));

  // i) răspuns rapid pe o mașină: gratuit, fără model
  const inainte = cereri().length, fondInainte = await folosite();
  const q7 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Unde e B 154 UIP?', nou: true });
  T('„Unde e B 154 UIP?" → răspuns rapid, doar despre ea, fără model și fără să se numere', q7.j.source === 'local' && /Dacia Logan 3/.test(q7.j.reply || '') && cereri().length === inainte && (await folosite()) === fondInainte, q7.text.slice(0, 160));
  T('și „Am înțeles" spune mașina și „acum"', (q7.j.inteles || []).map((x) => x.text).join('|') === 'B 154 UIP · Dacia Logan 3|acum', JSON.stringify(q7.j.inteles));
  T('…fără continuări (apăsate, ar porni întrebări care se numără) și fără nota „nu s-a numărat din fond" pe ecran (Alin, 08.10)', !(q7.j.urmari || []).length && fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').indexOf('nu s-a numărat din fond') < 0);
  coada([text('Săptămâna trecută: 538 km.')]);
  const q8 = await json('POST', '/api/ai/reports-agent', ckSef, { message: 'Câți kilometri a făcut B 154 UIP săptămâna trecută?', nou: true });
  T('cu altă perioadă, aceeași întrebare merge la RA Insight (nu primește km-ii de azi)', q8.j.source === 'ai' && cereri().length === inainte + 1, q8.j.source);

  // j) ușa veche a telefonului: „Asistent AI" = RA Insight
  coada([text('Răspuns pe telefonul vechi.')]);
  const q9 = await json('POST', '/api/ai/chat', telSef, { message: 'Care mașină a consumat cel mai mult luna asta?', history: [{ role: 'user', content: 'ignorat' }] });
  const c9 = cereri().slice(-1)[0];
  T('„Asistent AI" (telefonul vechi) răspunde prin RA Insight, cu rapoartele la îndemână', q9.status === 200 && q9.j.reply === 'Răspuns pe telefonul vechi.' && (c9.tools || []).some((t) => t.name === 'run_report'), q9.status + ' ' + q9.text.slice(0, 100));
  T('istoricul trimis de telefon nu mai contează (discuția o ține serverul)', textulCererii(c9).indexOf('ignorat') < 0);

  // k) ștergerea la 12 luni
  await json('POST', '/api/test/insight-imbatraneste', S, { id: q4.j.conversatieId, luni: 13 });
  await json('POST', '/api/test/insight-imbatraneste', S, { id: q5.j.conversatieId, luni: 11 });
  const st = await json('POST', '/api/admin/insight/sterge-vechi', S, {});
  T('conversația fără mesaje noi de 13 luni se șterge', st.status === 200 && st.j.sterse >= 1 && (await json('GET', '/api/insight/conversatii/' + q4.j.conversatieId, ckSef)).status === 404, st.text.slice(0, 80));
  T('cea de 11 luni rămâne', (await json('GET', '/api/insight/conversatii/' + q5.j.conversatieId, ckSef)).status === 200);
  T('doar super-adminul pornește ștergerea de mână', (await json('POST', '/api/admin/insight/sterge-vechi', ckSef, {})).status === 403);

  // ─── 7. Pasul 2: secțiunea proprie ──────────────────────────────────────────────────────────────────
  console.log('\n7. Pasul 2: secțiunea din meniu, notițele firmei, ghidul, drepturile din rol, statisticile fără text');
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  T('rândul „RA Insight" din meniu (cu eticheta NOU) și secțiunea lui', /id="nav-insight"[^>]*data-view="insight"[^>]*onclick="showView\('insight'\)"/.test(PAG) && /<div id="insight-view" class="modal-overlay"><\/div>/.test(PAG) && /insight: 'insight-view'/.test(PAG) && /insight: 'renderInsightPage'/.test(PAG));
  T('pagina Agenți AI nu mai are jumătatea „RA Insight răspunde" (RA Insight are secțiunea lui)', PAG.indexOf('RA Insight răspunde') < 0);
  // Ramurile livrate (pasul 3: Safe Drive; pasul 4: Combustibil, Mentenanță & acte…) se arată și au pagina lor;
  // cele încă nelivrate (gata: false) rămân ascunse.
  const RAM = [...PAG.matchAll(/\{ k: '(\w+)', et: '[^']+', ic: 'fa-[\w-]+', gata: (true|false) \}/g)].map((m) => ({ k: m[1], gata: m[2] === 'true' }));
  // Chatul modern (08.10): discuția („general") se deschide din „Conversație nouă" și din listă — nu mai stă printre ramuri.
  T('ramurile livrate se arată și au pagina lor (Safe Drive, Combustibil, Mentenanță & acte); cele nelivrate nu; discuția nu e printre ele', RAM.length === 7 &&
    ['safedrive', 'combustibil', 'mentenanta'].every((k) => RAM.some((r) => r.k === k && r.gata)) &&
    RAM.filter((r) => r.gata && r.k !== 'general').every((r) => new RegExp("if \\(S\\.ramura === '" + r.k + "'\\) return deseneaza").test(PAG)) &&
    (PAG.match(/RAMURI\.filter\(function \(r\) \{ return r\.gata && r\.k !== 'general'; \}\)/g) || []).length === 2 && PAG.indexOf('return r.gata; })') < 0, JSON.stringify(RAM));
  T('chatul modern: caseta cu Mașina / Perioada / Ramuri și butonul rotund; „Conversație nouă" și ☰ / ✎ pentru telefon', /onclick="insightAlegeMasina\(this\)"/.test(PAG) && /onclick="insightAlegePerioada\(this\)"/.test(PAG) && /onclick="insightAlegeRamura\(this\)"/.test(PAG) &&
    /id="insp-trimite" class="chat-trimite gol"/.test(PAG) && /class="insp-nou" onclick="insightNou\(\)"/.test(PAG) && /chat-ib insp-meniu/.test(PAG) && /chat-ib insp-nou-tel/.test(PAG));
  T('piesele chatului sunt scrise O DATĂ și folosite de secțiune, bula din colț și AI Raport (continuările, Copiază, Mașina, Perioada)', (PAG.match(/window\._chatUrmari = function/g) || []).length === 1 && (PAG.match(/window\._chatUrmari\(/g) || []).length >= 4 &&
    (PAG.match(/window\._chatActiuni = function/g) || []).length === 1 && (PAG.match(/window\._chatActiuni\(/g) || []).length >= 3 && (PAG.match(/window\._CHAT_PERIOADE = \[/g) || []).length === 1 && (PAG.match(/window\._CHAT_PERIOADE,/g) || []).length >= 3);
  T('discuția din secțiune e ACEEAȘI cu bula din colț (o singură conversație curentă)', (PAG.match(/window\._raxConvId/g) || []).length >= 4);
  // notițele firmei
  const n0 = await json('GET', '/api/insight/notite', ckSef);
  T('notițele firmei: goale la început, plafon de 1.500 de caractere, șeful le poate scrie', n0.status === 200 && n0.j.text === '' && n0.j.max === 1500 && n0.j.poateScrie === true, n0.text.slice(0, 120));
  const NOTITA = 'La noi săptămâna e de luni până sâmbătă.\u0007 Motorina o plătim 7,30 lei.';
  const n1 = await json('PUT', '/api/insight/notite', ckSef, { text: NOTITA + ' ' + 'x'.repeat(2000) });
  T('șeful le scrie; caracterele de control se scot, textul se taie la 1.500', n1.status === 200 && n1.j.text.length === 1500 && n1.j.text.indexOf('\u0007') < 0 && n1.j.text.indexOf('Motorina o plătim 7,30 lei.') > 0, n1.status + ' ' + (n1.j.text || '').length);
  await json('PUT', '/api/insight/notite', ckSef, { text: NOTITA });
  const nColeg = await json('PUT', '/api/insight/notite', ckColeg, { text: 'șters de coleg' });
  const nColegG = await json('GET', '/api/insight/notite', ckColeg);
  T('colegul (manager) le citește, dar nu le poate schimba', nColeg.status === 403 && nColegG.j.poateScrie === false && /sâmbătă/.test(nColegG.j.text || ''), nColeg.status + ' ' + nColegG.text.slice(0, 80));
  T('altă firmă nu le vede', (await json('GET', '/api/insight/notite', ckAlt)).j.text === '');
  coada([text('Am ținut cont de regulile firmei.')]);
  await json('POST', '/api/insight/intreaba', ckSef, { message: 'Ce probleme are flota săptămâna asta?', nou: true });
  const cN = cereri().slice(-1)[0];
  T('RA Insight citește notițele la fiecare întrebare — în contextul întrebării, nu în partea fixă (cache-ul rămâne)', contextul(cN).indexOf('Motorina o plătim 7,30 lei.') > 0 && String(cN.system[0].text).indexOf('Motorina') < 0);
  // ghidul aplicației
  const gh = await json('GET', '/api/insight/ghid', ckSef);
  T('ghidul aplicației: peste 20 de capitole, fiecare cu pași', gh.status === 200 && gh.j.sectiuni.length >= 20 && gh.j.sectiuni.every((x) => x.titlu && Array.isArray(x.pasi) && x.pasi.length), (gh.j.sectiuni || []).length);
  coada([unealta('cauta_in_ghid', { intrebare: 'cum adaug un șofer nou' }), text('Management → Șoferi → „Adaugă șofer".')]);
  const qg = await json('POST', '/api/insight/intreaba', ckSef, { message: 'cum adaug un șofer nou?', nou: true });
  const cg = cereri().slice(-1)[0];
  const rezG = JSON.stringify((cg.messages || []).slice(-1)[0]);
  T('„cum fac…?" → unealta ghidului; modelul primește pașii capitolului despre șoferi', qg.status === 200 && rezG.indexOf('Un șofer nou și mașina lui') >= 0 && rezG.indexOf('Adaugă șofer') >= 0, rezG.slice(0, 200));
  T('…iar „Am înțeles" spune că a citit ghidul', (qg.j.inteles || []).some((x) => x.text === 'ghidul aplicației'), JSON.stringify(qg.j.inteles));
  T('instrucțiunile îi cer să răspundă la „cum fac" DOAR din ghid (nu din memorie)', /GHIDUL: la întrebări despre CUM se folosește aplicația, cheamă cauta_in_ghid și răspunde DOAR cu pașii de acolo/.test(String(cg.system[0].text)));
  // Safe Drive (pasul 3, 06.10): RA Insight primește ACEEAȘI lună ca pagina (aceeași funcție pe server), fără coordonate
  coada([unealta('safe_drive', {}), text('**Safe Drive** — luna asta, costul condusului.')]);
  const qs = await json('POST', '/api/insight/intreaba', ckSef, { message: 'cât ne-a costat condusul luna asta?', nou: true });
  const cs = cereri().slice(-1)[0];
  const rezS = JSON.stringify((cs.messages || []).slice(-1)[0]);
  const pagS = await json('GET', '/api/insight/safe-drive', ckSef);
  T('„cât ne-a costat condusul" → unealta safe_drive; modelul primește costul pe feluri, mașinile și spusa „estimate"', qs.status === 200 && /cost_lei/.test(rezS) && /combustibil_accelerari/.test(rezS) && /ESTIMATE/.test(rezS) && !/latitude|"lat"|"lng"/.test(rezS), rezS.slice(0, 240));
  T('…cu aceeași lună și aceleași mașini ca pagina Safe Drive', pagS.status === 200 && rezS.indexOf(pagS.j.eticheta) >= 0 && (pagS.j.masini || []).every((m) => rezS.indexOf(m.eticheta) >= 0), pagS.status + ' ' + (pagS.j.eticheta || pagS.text.slice(0, 120)));
  T('…iar „Am înțeles" spune Safe Drive și luna', (qs.j.inteles || []).some((x) => x.text === 'Safe Drive & costuri') && (qs.j.inteles || []).some((x) => x.tip === 'perioada' && x.text === pagS.j.eticheta), JSON.stringify(qs.j.inteles));
  T('pagina și RA Insight cer luna prin ACEEAȘI funcție (_sdLuna: pagina, unealta, numărul ramurii)', (SRV.match(/await _sdLuna\(req, /g) || []).length === 3 && /UNELTE:[\s\S]*safe_drive — Safe Drive & costuri/.test(String(cs.system[0].text)));
  // Combustibil (pasul 4): ACEEAȘI funcție ca pagina (_ramCombustibil), fără coordonate. Întâi un drum scurt pentru
  // B 154 UIP (8 km, în ultimele minute); luna se ia din ceasul ADEVĂRAT, pe ora României — luna drumului.
  const t0 = Date.now() - 9 * 60000;
  for (let k = 0; k < 9; k++) await json('POST', '/api/test/simulate', S, { imei: DEV[0].imei, name: DEV[0].name, speed: 60, io: { ignition: 1 }, ts: new Date(t0 + k * 60000).toISOString(), lat: 45.75 + k * 0.009, lng: 21.23 });
  const lunaDrum = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(new Date(t0 + 8 * 60000));
  coada([unealta('combustibil', { month: lunaDrum }), text('**Combustibil** — luna asta.')]);
  const qc = await json('POST', '/api/insight/intreaba', ckSef, { message: 'cât am dat pe motorină luna asta?', nou: true });
  const cc = cereri().slice(-1)[0];
  const rezC = JSON.stringify((cc.messages || []).slice(-1)[0]);
  const pagC = await json('GET', '/api/insight/combustibil?luna=' + lunaDrum, ckSef);
  T('„cât am dat pe motorină" → unealta combustibil; modelul primește litrii, costul, sursa și spusa „estimați"', qc.status === 200 && /cost_lei/.test(rezC) && /l_la_100_km/.test(rezC) && /sursa/.test(rezC) && /estima/i.test(rezC) && !/latitude|"lat"|"lng"|\\"lat\\"|\\"lng\\"/.test(rezC), rezC.slice(0, 240));
  T('…cu aceeași lună și aceleași mașini ca pagina Combustibil', pagC.status === 200 && !pagC.j.pregatire && rezC.indexOf(pagC.j.eticheta) >= 0 && (pagC.j.masini || []).length > 0 && (pagC.j.masini || []).every((m) => rezC.indexOf(m.eticheta) >= 0), pagC.status + ' ' + (pagC.j.eticheta || pagC.text.slice(0, 120)));
  T('…iar „Am înțeles" spune Combustibil și luna', (qc.j.inteles || []).some((x) => x.text === 'Combustibil') && (qc.j.inteles || []).some((x) => x.tip === 'perioada' && x.text === pagC.j.eticheta), JSON.stringify(qc.j.inteles));
  T('pagina și RA Insight cer cifrele prin ACEEAȘI funcție (_ramCombustibil: pagina, unealta, numărul ramurii, scrisoarea de luni)', (SRV.match(/await _ramCombustibil\(req, /g) || []).length === 4 && /UNELTE:[\s\S]*combustibil — /.test(String(cc.system[0].text)));
  // Ore de condus (pasul 4): ACEEAȘI funcție ca pagina (_ramOreCondus), din raportul „Condus & repaus"
  coada([unealta('ore_condus', {}), text('**Ore de condus** — săptămâna asta.')]);
  const qh = await json('POST', '/api/insight/intreaba', ckSef, { message: 'câte ore a condus Ion săptămâna asta?', nou: true });
  const ch = cereri().slice(-1)[0];
  const rezH = JSON.stringify((ch.messages || []).slice(-1)[0]);
  const pagH = await json('GET', '/api/insight/ore-condus', ckSef);
  T('„câte ore a condus" → unealta ore_condus; modelul primește perioada, orele pe șofer, încălcările și spusa „estimat din GPS"', qh.status === 200 && /perioada/.test(rezH) && /reg561_se_aplica|soferi/.test(rezH) && /incalcari/.test(rezH) && /estimat din GPS/.test(rezH) && !/latitude|"lat"|"lng"|\\"lat\\"|\\"lng\\"/.test(rezH), rezH.slice(0, 240));
  T('…cu aceeași săptămână și aceiași șoferi ca pagina Ore de condus', pagH.status === 200 && !pagH.j.pregatire && rezH.indexOf(pagH.j.eticheta) >= 0 && (pagH.j.soferi || []).every((x) => rezH.indexOf(x.nume) >= 0), pagH.status + ' ' + (pagH.j.eticheta || pagH.text.slice(0, 120)));
  T('…iar „Am înțeles" spune Ore de condus și săptămâna', (qh.j.inteles || []).some((x) => x.text === 'Ore de condus') && (qh.j.inteles || []).some((x) => x.tip === 'perioada' && x.text === pagH.j.eticheta), JSON.stringify(qh.j.inteles));
  T('instrucțiunile numesc unealta și când se alege (ore de condus / Reg. 561 / tahograf)', /UNELTE:[\s\S]*ore_condus — /.test(String(ch.system[0].text)) && /Reg\. 561 \/ tahograf" → ore_condus/.test(String(ch.system[0].text)));
  // Mentenanță & acte (pasul 4): ACEEAȘI listă ca pagina (_ramMentenanta)
  coada([unealta('mentenanta_acte', {}), text('**Mentenanță & acte** — ce urmează.')]);
  const qm = await json('POST', '/api/insight/intreaba', ckSef, { message: 'ce acte expiră curând?', nou: true });
  const cm = cereri().slice(-1)[0];
  const rezM = JSON.stringify((cm.messages || []).slice(-1)[0]);
  T('„ce acte expiră" → unealta mentenanta_acte; modelul primește ce a trecut de termen, ce urmează și preavizul', qm.status === 200 && /trecute_de_termen/.test(rezM) && /urmeaza/.test(rezM) && /preaviz/.test(rezM), rezM.slice(0, 240));
  T('…iar „Am înțeles" spune Mentenanță & acte', (qm.j.inteles || []).some((x) => x.text === 'Mentenanță & acte'), JSON.stringify(qm.j.inteles));
  T('pagina și RA Insight citesc lista prin ACEEAȘI funcție (_ramMentenanta: pagina, unealta, numărul ramurii, scrisoarea de luni)', (SRV.match(/await _ramMentenanta\(req\)/g) || []).length === 4);
  // un raport tăiat din rol nu se scoate nici prin RA Insight
  await json('PUT', '/api/company-roles/manager', ckSef, { nume: 'Manager', taiate: [], rapoarte: ['consumption'] });
  coada([unealta('run_report', { type: 'consumption', vehicle: 'B 154 UIP', period: 'last_week' }), text('Nu ai acces la raportul de consum.')]);
  const qr = await json('POST', '/api/insight/intreaba', ckColeg, { message: 'cât a consumat B 154 UIP săptămâna trecută?', nou: true });
  const cr = cereri().slice(-1)[0];
  const rezR = JSON.stringify((cr.messages || []).slice(-1)[0]);
  T('managerul cu „Consum carburant" tăiat din rol: RA Insight nu-l rulează (unealta refuză)', qr.status === 200 && /l-a tăiat firma din rolul lui/.test(rezR) && !(qr.j.sources || []).length, rezR.slice(0, 200));
  await json('PUT', '/api/company-roles/manager', ckSef, { nume: 'Manager', taiate: [], rapoarte: [] });
  // statisticile pentru noi: numere, fără textul conversațiilor
  const stt = await json('GET', '/api/admin/insight/statistici?zile=30', S);
  T('statisticile (doar noi): câte răspunsuri, 👍/👎, conversații, ce rapoarte a rulat', stt.status === 200 && stt.j.raspunsuri >= 5 && stt.j.sus >= 1 && stt.j.conversatii >= 2 && Array.isArray(stt.j.rapoarte) && stt.j.rapoarte.some((x) => x.tip === 'utilization'), stt.text.slice(0, 200));
  T('…fără niciun text din conversații', ['KILOMETIR', '538 km', 'Ce probleme', 'Motorina', 'șofer nou'].every((w) => stt.text.indexOf(w) < 0), stt.text.slice(0, 300));
  T('clientul nu are acces la statistici', (await json('GET', '/api/admin/insight/statistici', ckSef)).status === 403);

  // ─── 8. Scrisoarea de luni, cu modelul simulat: RA Insight o scrie DOAR din fapte; o cifră inventată → textul pe reguli ───
  console.log('\n8. Scrisoarea de luni: scrisă de RA Insight din fapte, cu paza cifrelor, fără să se scadă din fond');
  const SDj = require('./safe_drive'), Cj = require('./condus');
  const ziP = (z, n) => { const d = new Date(z + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const aziS = Cj.zi(Date.now()), luniS = ziP(aziS, -Cj.ziSapt(aziS)), luniTrec = ziP(luniS, -7);
  // B 154 UIP a mers și săptămâna trecută (marți, 20 de minute).
  const tT = SDj.inceput(ziP(luniTrec, 1)) + 10 * 3600000;
  for (let k = 0; k < 20; k++) await json('POST', '/api/test/simulate', S, { imei: DEV[0].imei, name: DEV[0].name, speed: 70, io: { ignition: 1 }, ts: new Date(tT + k * 60000).toISOString(), lat: 45.6 + k * 0.01, lng: 21.2 });
  const folositeInainte = await folosite();
  const acum1 = SDj.inceput(luniS) + 8 * 3600000 + 60000;   // lunea asta la 8 și un minut (scrisoarea pleacă doar lunea)
  coada([text('Săptămâna trecută flota a mers bine. Ai economisit 999 de lei la combustibil și nicio problemă la orele de condus. De făcut săptămâna asta:\n• Nimic urgent.\n• Uită-te la Safe Drive.')]);
  const nCereri1 = cereri().length;
  const tk1 = await json('POST', '/api/test/ceasuri', S, { acum: acum1, scrisori: true });
  const cS = cereri().slice(nCereri1);
  const ls1 = await json('GET', '/api/insight/scrisori', ckSef);
  const sc1 = ls1.j.scrisori && ls1.j.scrisori.find((x) => x.saptamana === luniTrec);
  const sc1d = sc1 ? (await json('GET', '/api/insight/scrisori/' + sc1.id, ckSef)).j : {};
  T('RA Insight primește FAPTELE săptămânii trecute (o singură cerere pentru oamenii cu aceleași mașini), cu instrucțiunile scrisorii', tk1.status === 200 && cS.length === 1 && /Scrisoarea de luni/.test(contextul(cS[0])) && /FAPTELE \(JSON\)/.test(textulCererii(cS[0])) && textulCererii(cS[0]).indexOf(sc1d.eticheta || '#') >= 0, JSON.stringify([tk1.j.scrisori, cS.length]));
  T('o cifră care nu e în fapte („999 de lei") → scrisoarea rămâne cea pe reguli, cu cifrele aplicației', !!sc1 && sc1d.scrisDe === 'reguli' && (sc1d.text || '').indexOf('999') < 0 && /^Săptămâna trecută \(/.test(sc1d.text || '') && tk1.j.scrisori.reguli >= 1 && tk1.j.scrisori.model === 0, JSON.stringify([sc1d.scrisDe, (sc1d.text || '').slice(0, 120)]));
  // Săptămâna de acum, ca și cum ar fi lunea viitoare la 8: RA Insight scrie fără cifre străine → scrisoarea lui.
  const acum2 = SDj.inceput(ziP(luniS, 7)) + 8 * 3600000 + 60000;
  const etS = I.etichetaPerioadei(new Date(SDj.inceput(luniS)).toISOString(), new Date(SDj.inceput(ziP(luniS, 7))).toISOString(), acum2);
  const BUN = 'Săptămâna ' + etS + ' a fost liniștită pentru flotă: n-au fost încălcări ale orelor de condus și nimic neobișnuit la combustibil.\n\nDe făcut săptămâna asta:\n• Aruncă o privire în Safe Drive.\n• Verifică actele care urmează.';
  coada([text(BUN)]);
  const tk2 = await json('POST', '/api/test/ceasuri', S, { acum: acum2, scrisori: true });
  const ls2 = await json('GET', '/api/insight/scrisori', ckSef);
  const sc2 = ls2.j.scrisori && ls2.j.scrisori.find((x) => x.saptamana === luniS);
  const sc2d = sc2 ? (await json('GET', '/api/insight/scrisori/' + sc2.id, ckSef)).j : {};
  T('fără cifre străine → scrisoarea e cea scrisă de RA Insight, întocmai', tk2.status === 200 && !!sc2 && sc2d.scrisDe === 'model' && sc2d.text === BUN && tk2.j.scrisori.model >= 1, JSON.stringify([tk2.j.scrisori, sc2d.scrisDe, etS]));
  T('colegul (aceleași mașini) primește aceeași scrisoare, fără o a doua cerere către model', ((await json('GET', '/api/insight/scrisori', ckColeg)).j.scrisori || []).length === 2);
  T('scrisorile NU se scad din fondul de întrebări al firmei (le plătim noi)', (await folosite()) === folositeInainte, folositeInainte + ' → ' + (await folosite()));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
