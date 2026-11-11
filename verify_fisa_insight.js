// verify_fisa_insight.js — fișa lui RA Insight despre fiecare om (11.11; fisa_insight.js)
// Alin: „să memoreze cam ce discută fiecare user cu el… să-și facă o idee ce i se potrivește"; fișa rămâne cât omul are cont (nu
// pleacă odată cu conversațiile șterse la 12 luni); ștergerea totală DOAR din Setări → Preferințe, cu confirmare; în discuție doar
// lucruri anume („uită că…"), iar „uită tot" scris într-o discuție NU șterge nimic.
//   1. regulile (fără server): ce se păstrează, numele mașinilor, ce înțelege din discuție, ce scoate „uită că…";
//   2. în cod: unde se citește, unde se scrie, ce se salvează, ce vede pagina;
//   3. pe server pornit, cu modelul simulat (nu se cheltuie nimic): tura de noapte, „ce știi despre mine?", „Unde e Loganul?",
//      „uită că…", „uită tot", butonul din Preferințe, conversațiile șterse la 12 luni, contul scos din firmă, firma pe Start.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const F = require('./fisa_insight.js');
const { puneParola } = require('./test_parola');

let ok = 0, rau = 0;
function T(nume, cond, info) { if (cond) { ok++; console.log('  ✓ ' + nume); } else { rau++; console.log('  ✗ ' + nume + (info != null ? '  → ' + info : '')); } }
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

// ─── 1. Regulile ───────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Regulile fișei (fără server)');
const FLOTA = [{ nr: 'B 154 UIP', nume: 'Dacia Logan 3' }, { nr: 'B 204 UIP', nume: 'Dacia Logan 2' }, { nr: 'B 77 TIR', nume: 'MAN TGX' }];
const fisa = F.curata({
  randuri: ['- Întreabă des de consumul lui B 77 TIR.', 'Vrea răspunsuri scurte, cu tabel.', 'Telefonul lui e 0740 123 456.', 'Email: ion@firma.ro',
    'Ion e bolnav de o săptămână.', 'CNP 1850101123456', 'Vrea răspunsuri scurte, cu tabel.', 'x'.repeat(200)],
  nume: [{ spune: 'Loganul', numar: 'B 204 UIP' }, { spune: 'camionul mare', numar: 'b77tir' }, { spune: 'mașina lui tata', numar: 'B 999 XYZ' }, { spune: 'B 154 UIP', numar: 'B 154 UIP' }]
}, FLOTA.map((x) => x.nr));
T('curata: rămân doar rândurile bune (fără telefon, email, sănătate, CNP, dubluri, rânduri prea lungi)', fisa.randuri.length === 2 && fisa.randuri[0] === 'Întreabă des de consumul lui B 77 TIR.', JSON.stringify(fisa.randuri));
T('curata: numele doar cu mașini ale firmei, scrise cum le scrie aplicația (b77tir → B 77 TIR); numărul nu e un „nume"',
  fisa.nume.length === 2 && fisa.nume[1].numar === 'B 77 TIR' && !fisa.nume.some((x) => x.numar === 'B 999 XYZ'), JSON.stringify(fisa.nume));
const mult = F.curata({ randuri: Array.from({ length: 30 }, (_, i) => 'Rândul numărul ' + (i + 1) + '.') }, []);
T('curata: cel mult ' + F.MAX_RANDURI + ' rânduri', mult.randuri.length === F.MAX_RANDURI);
T('dinRaspuns: JSON-ul și când modelul mai scrie ceva în jur; altfel nimic', !!F.dinRaspuns('Iată:\n{"randuri":["a"]}\n') && F.dinRaspuns('nu știu') === null);

const amb = { masini: [], ambigue: [{ cheie: 'logan' }] };
const nm = (q, g) => F.aplicaNume(q, fisa, FLOTA, g || amb).text;
T('aplicaNume: „Unde e Loganul?" → B 204 UIP (și „Loganului", „Loganu\'")',
  nm('Unde e Loganul?') === 'Unde e B 204 UIP?' && nm('Câți km a făcut Loganului ieri?') === 'Câți km a făcut B 204 UIP ieri?' && nm("Unde e Loganu' acum") === 'Unde e B 204 UIP acum');
T('aplicaNume: un nume din mai multe cuvinte („camionul mare")', nm('Unde e camionul mare?') === 'Unde e B 77 TIR?');
T('aplicaNume: un număr scris în text câștigă („Loganul B 154 UIP")', nm('Unde e Loganul B 154 UIP?') === 'Unde e Loganul B 154 UIP?');
T('aplicaNume: o mașină numită limpede („Dacia Logan 3") rămâne a ei', F.aplicaNume('Dacia Logan 3 unde e?', fisa, FLOTA, { masini: [{}], ambigue: [] }).text === 'Dacia Logan 3 unde e?');
T('aplicaNume: doar mașinile la care omul are acces', F.aplicaNume('Unde e Loganul?', fisa, FLOTA.filter((x) => x.nr !== 'B 204 UIP'), amb).text === 'Unde e Loganul?');

const cer = (q) => JSON.stringify(F.cerere(q));
T('cerere: „ce știi despre mine?" în mai multe forme', ['Ce știi despre mine?', 'ce mai stii tu despre mine', 'Ce ai reținut despre mine?', 'te rog ce știi despre mine'].every((q) => (F.cerere(q) || {}).fel === 'ce_stii'));
T('cerere: „uită tot" NU e o ștergere (doar trimite la Preferințe)', ['Uită tot', 'uită tot ce știi despre mine', 'Te rog să uiți tot'].every((q) => (F.cerere(q) || {}).fel === 'uita_tot'), cer('Te rog să uiți tot'));
T('cerere: „uită asta" / „șterge discuția asta" = discuția de acum', ['Uită asta', 'uită discuția asta', 'Șterge conversația asta', 'uită ce ți-am spus'].every((q) => (F.cerere(q) || {}).fel === 'uita_discutia'));
T('cerere: „uită că …" = ceva anume', (F.cerere('Te rog uită că Loganul e B 204') || {}).fel === 'uita' && (F.cerere('Nu mai ține minte că vreau tabel') || {}).fel === 'uita');
T('cerere: „uită-te la…" (= privește) nu e o cerere; nici o întrebare obișnuită', F.cerere('Uită-te la consumul lui B 77 TIR') === null && F.cerere('Uitați-vă la Logan') === null && F.cerere('Câți km a făcut Loganul?') === null);
const u1 = F.uita(fisa, 'Loganul e B 204');
T('uita: scoate doar ce se potrivește (numele „Loganul"), restul rămâne', u1.scoase.length === 1 && u1.fisa.nume.length === 1 && u1.fisa.randuri.length === 2, JSON.stringify(u1.scoase));
T('uita: nimic potrivit → nimic scos, iar textul o spune', F.uita(fisa, 'Mihai e șef de tură').scoase.length === 0 && /Nu găsesc/.test(F.textUitat(F.uita(fisa, 'Mihai e șef de tură'))));
T('textCeStii: rândurile, numele, și cum uiți ceva anume / tot', /Când spui „Loganul", te referi la B 204 UIP/.test(F.textCeStii(fisa)) && /Setări → Preferințe/.test(F.textCeStii(fisa)) && /Încă nu știu nimic/.test(F.textCeStii(null)));
const INS = F.instructiuni();
T('instrucțiunile de noapte: fără cifrele flotei, fără date personale, „nu pune înapoi" ce i s-a cerut să uite, doar JSON',
  /cifrele flotei/.test(INS) && /CNP/.test(INS) && /nu-l pune înapoi/.test(INS) && /DOAR cu JSON/.test(INS));
T('cererea de noapte: fișa veche, mașinile firmei, discuțiile (răspunsurile lungi tăiate)',
  (() => { const c = F.cerereNoapte(fisa, FLOTA, [{ rol: 'user', text: 'Unde e Loganul?' }, { rol: 'assistant', text: 'y'.repeat(1000) }]); return /FIȘA DE PÂNĂ ACUM/.test(c) && /B 204 UIP — Dacia Logan 2/.test(c) && /Omul: Unde e Loganul\?/.test(c) && c.indexOf('y'.repeat(F.MAX_TEXT_MESAJ + 1)) < 0; })());

// ─── 2. În cod ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Unde se citește, unde se scrie, ce vede pagina');
const RA = SRV.slice(SRV.indexOf('async function _raInsight('), SRV.indexOf('async function _raInsight(') + 30000);
T('RA Insight: numele omului se pun în text ÎNAINTE de căutarea mașinii; se salvează ce a scris omul', /const cuNume = fisaInsight\.aplicaNume\(mesajOm, fisaOm, fisa, gasiteOm\);\s*const message = cuNume\.text;/.test(RA) && /adaugaMesajAi\(conv\.id, 'user', mesajOm, null\)/.test(RA));
T('RA Insight: cererile fișei („ce știi", „uită") vin înaintea tuturor celorlalte drumuri, pe reguli', RA.indexOf('fisaInsight.cerere(mesajOm)') > 0 && RA.indexOf('fisaInsight.cerere(mesajOm)') < RA.indexOf('_insightProgramari('));
T('RA Insight: fișa intră în CONTEXTUL întrebării (nu în partea fixă din cache)', /_insightContext\(fisa, gasite, ctx, peImei, notite, fisaOm\)/.test(SRV) && /fisaInsight\.pentruModel\(fisaOm\)/.test(SRV));
T('instrucțiunile fixe: corectura (scuze + răspunsul exact) și fișa = ca să-l înțelegi, nu sursă de cifre', /CORECTURILE:[\s\S]{0,200}cere-ți scuze/.test(SRV) && /niciodată ca sursă de cifre/.test(SRV));
T('tura de noapte: doar firmele cu AI, doar cu cont RA Insight, fără demo și fără noi; consumul = „fisa"',
  /_firmaAreAi\(co\)/.test(SRV.slice(SRV.indexOf('async function _scrieFisa('), SRV.indexOf('async function _scrieFisa(') + 1500)) && /u\.ai_seat/.test(SRV) && /recordAiUsage\(companyId, 'fisa'/.test(SRV));
T('ștergerea din Preferințe: rută a omului (requireAuth), cu rând în jurnal', /app\.delete\('\/api\/insight\/fisa', requireAuth/.test(SRV) && /'ai_fisa_stearsa'/.test(SRV));
T('baza: fișa pleacă odată cu contul (ON DELETE CASCADE), nu e în copii, costul ei intră în „Ne costă"',
  /CREATE TABLE IF NOT EXISTS ai_fise \(\s*user_id INTEGER PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/.test(fs.readFileSync('db.js', 'utf8')) &&
  /ai_fise:/.test(fs.readFileSync('backup.js', 'utf8')) && /AI_KINDS_COST_FIRMA = [^\n]*'fisa'/.test(fs.readFileSync('db.js', 'utf8')));
T('pagina: blocul din Setări → Preferințe, doar cu cont RA Insight, textele de la server, confirmarea înainte de ștergere',
  /<div id="pref-insight"><\/div>/.test(HTML) && /if \(!u\.aiCont\)/.test(HTML) && /Șterge tot ce știe despre mine/.test(HTML) &&
  /raConfirm\(\(box && box\._confirmare\)/.test(HTML) && /fetch\('\/api\/insight\/fisa', \{ method: 'DELETE'/.test(HTML) && /pref-ins-t'\)\.textContent = j\.explicatie/.test(HTML));
T('„Scoate din firmă": spune că pleacă și discuțiile cu RA Insight, și ce a învățat despre om', /Discuțiile lui cu RA Insight și ce a învățat RA Insight despre el se șterg și ele\./.test(HTML));
T('Confidențialitate: fișa, cine o vede, ce nu intră, cât se păstrează, cum se șterge',
  (() => { const c = fs.readFileSync('public/confidentialitate.html', 'utf8'); return /Ce ține minte RA Insight/.test(c) && /Fișa lui RA Insight despre un utilizator: cât timp utilizatorul are cont/.test(c) && /Setări → Preferințe/.test(c); })());

// ─── 3. Pe server pornit ───────────────────────────────────────────────────────────────────────────
const PORT = 3297, TCP = 5297;
const DIR = path.join(os.tmpdir(), 'rax_fisa_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json';
const B = 'http://127.0.0.1:' + PORT;
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
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_fisa', DEMO_DISABLED: 'true', RATE_LIMIT_ENABLED: 'false',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA,
  GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300'
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'AI_AGENT_MODEL', 'AI_MODEL'].forEach((k) => delete env[k]);
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
async function json(m, u, ck, body) {
  const h = { 'Content-Type': 'application/json' }; if (ck) h.Cookie = ck;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const contextul = (c) => (Array.isArray(c.system) ? c.system.map((b) => b.text).join('\n') : String(c.system || ''));
const mesajeCererii = (c) => (c.messages || []).map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n3. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
  try {
    const S = await login('admin', 'test1234');
    await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const co = (await json('POST', '/api/companies', S, { name: 'Trans SRL', cui: 'RO12345678', address: 'Str. Fabricii 10, Cluj-Napoca, jud. Cluj', contact_email: 'office@transsrl.ro' })).j;
    await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
    const MAS = [['350000000097001', 'Dacia Logan 3', 'B 154 UIP'], ['350000000097002', 'Dacia Logan 2', 'B 204 UIP'], ['350000000097003', 'MAN TGX', 'B 77 TIR']];
    await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
    for (let i = 0; i < MAS.length; i++) {
      await json('PUT', '/api/devices/' + MAS[i][0] + '/company', S, { company_id: co.id });
      await json('POST', '/api/test/simulate', S, { imei: MAS[i][0], ts: new Date(Date.now() - 120000).toISOString(), lat: 46.77 + i * 0.01, lng: 23.59, speed: 0, io: { ignition: 0, external_voltage: 13900 } });
    }
    const uS = await json('POST', '/api/users', S, { username: 'sorin@transsrl.ro', full_name: 'Sorin Matei', role: 'company_admin', company_id: co.id });
    await puneParola(uS.j, 'Str4da-Verde-2026', B);
    const uA = await json('POST', '/api/users', S, { username: 'andrei@transsrl.ro', full_name: 'Andrei Ionescu', role: 'manager', company_id: co.id });
    await puneParola(uA.j, 'Str4da-Verde-2027', B);
    const idS = uS.j.id || (uS.j.user && uS.j.user.id), idA = uA.j.id || (uA.j.user && uA.j.user.id);
    const C = await login('sorin@transsrl.ro', 'Str4da-Verde-2026');
    for (const id of [idS, idA]) await json('PUT', '/api/users/' + id + '/ai-seat', C, { on: true });
    const A = await login('andrei@transsrl.ro', 'Str4da-Verde-2027');
    T('pregătire: o firmă pe Basic, doi oameni cu cont RA Insight, trei mașini (două Logan)', !!co.id && !!C && !!A && !!idS && !!idA);

    const intreaba = (ck, q, conv) => json('POST', '/api/insight/intreaba', ck, Object.assign({ message: q }, conv ? { conversatieId: conv } : { nou: true }));
    // Discuția de azi: o întrebare pe loc (fără model).
    const q1 = await intreaba(C, 'Unde e B 154 UIP?');
    // Răspunsul pe loc scrie mașina cum o știe harta vie (în probă, poziția simulată poate purta doar IMEI-ul): numărul SAU IMEI-ul ei.
    const eMasina = (t, i) => new RegExp(MAS[i][2] + '|' + MAS[i][0]).test(t || '');
    T('o întrebare pe loc, înainte de fișă', q1.status === 200 && eMasina(q1.j.reply, 0), q1.status + ' ' + (q1.j.reply || q1.text).slice(0, 120));
    const conv1 = q1.j.conversatieId;

    // ── Tura de noapte ──
    const fisaJson = JSON.stringify({ randuri: ['Întreabă des unde e B 154 UIP.', 'Vrea răspunsuri scurte.', 'Telefonul lui e 0740 123 456.'],
      nume: [{ spune: 'Loganul', numar: 'B 204 UIP' }, { spune: 'mașina lui tata', numar: 'B 999 XYZ' }] });
    coada([text(fisaJson)]);
    const nCereri0 = cereri().length;
    const n1 = await json('POST', '/api/test/fise-noaptea', S, { acum: Date.now() + 86400000 });
    const cNoapte = cereri().slice(nCereri0);
    T('noaptea: un om cu discuții, o fișă scrisă, o singură cerere către model', n1.status === 200 && n1.j.oameni === 1 && n1.j.scrise === 1 && cNoapte.length === 1, JSON.stringify(n1.j) + ' · cereri ' + cNoapte.length);
    T('noaptea: modelul primește instrucțiunile fișei, mașinile firmei și discuția omului',
      cNoapte.length === 1 && /Îți ții o fișă scurtă/.test(contextul(cNoapte[0])) && /B 204 UIP — Dacia Logan 2/.test(mesajeCererii(cNoapte[0])) && /Omul: Unde e B 154 UIP\?/.test(mesajeCererii(cNoapte[0])));
    let fS = (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa;
    T('fișa scrisă: telefonul și mașina străină (B 999 XYZ) n-au intrat', fS && fS.randuri.length === 2 && fS.nume.length === 1 && fS.nume[0].numar === 'B 204 UIP', JSON.stringify(fS));
    const n2 = await json('POST', '/api/test/fise-noaptea', S, { acum: Date.now() + 86400000 });
    T('a doua oară în aceeași noapte: nimic de citit (pragul ține minte până unde a citit)', n2.j.oameni === 0 && cereri().length === nCereri0 + 1, JSON.stringify(n2.j));

    // ── În discuție ──
    const nC = cereri().length;
    const ce = await intreaba(C, 'Ce știi despre mine?');
    T('„Ce știi despre mine?": rândurile fișei și numele „Loganul", pe loc', ce.status === 200 && /Vrea răspunsuri scurte\./.test(ce.j.reply || '') && /„Loganul", te referi la B 204 UIP/.test(ce.j.reply || '') && ce.j.source === 'fisa', (ce.j.reply || ce.text).slice(0, 200));
    T('…cu insigna „Instant · din ce știu despre tine" și fără nicio cerere către model', ce.j.insigna && ce.j.insigna.fel === 'instant' && ce.j.insigna.detaliu === 'din ce știu despre tine' && cereri().length === nC);
    const lg = await intreaba(C, 'Unde e Loganul?');
    T('„Unde e Loganul?" → B 204 UIP (numele din fișă), nu B 154 UIP, pe loc', lg.status === 200 && eMasina(lg.j.reply, 1) && !eMasina(lg.j.reply, 0) && cereri().length === nC, (lg.j.reply || lg.text).slice(0, 200));
    const cv = await json('GET', '/api/insight/conversatii/' + lg.j.conversatieId, C);
    const textOm = ((cv.j.mesaje || []).find((m) => m.rol === 'user') || {}).text;
    T('în conversație rămâne ce a scris omul („Unde e Loganul?"), nu textul cu numărul', textOm === 'Unde e Loganul?', textOm);
    const tot = await intreaba(C, 'Uită tot ce știi despre mine');
    fS = (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa;
    T('„Uită tot" scris în discuție: NU șterge nimic, îi spune unde e butonul', /Setări → Preferințe/.test(tot.j.reply || '') && fS.randuri.length === 2 && fS.nume.length === 1, (tot.j.reply || '').slice(0, 160));
    const asta = await intreaba(C, 'Uită asta');
    T('„Uită asta": cum șterge discuția de acum (coșul din stânga), fără să atingă fișa', /coșul/.test(asta.j.reply || '') && (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa.randuri.length === 2);
    const ui = await intreaba(C, 'Uită că Loganul e B 204 UIP');
    fS = (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa;
    T('„Uită că Loganul e B 204 UIP": scoate doar numele, rândurile rămân', /Am uitat/.test(ui.j.reply || '') && fS.nume.length === 0 && fS.randuri.length === 2, (ui.j.reply || '').slice(0, 160) + ' · ' + JSON.stringify(fS));

    // ── Întrebarea care merge la model: fișa e în context, corectura în instrucțiuni ──
    coada([text('Pe scurt: B 77 TIR a consumat mai mult din cauza vitezei.')]);
    const nM = cereri().length;
    const de = await intreaba(C, 'De ce a consumat mai mult B 77 TIR luna asta?');
    const cM = cereri().slice(nM);
    T('la model: fișa omului e în contextul întrebării, corectura în partea fixă', de.status === 200 && cM.length >= 1 && /FIȘA OMULUI/.test(contextul(cM[0])) && /Vrea răspunsuri scurte\./.test(contextul(cM[0])) && /CORECTURILE/.test(contextul(cM[0])),
      de.status + ' · cereri ' + cM.length);

    // ── Andrei: fișa lui e a lui ──
    const qa = await intreaba(A, 'Unde e B 77 TIR?');
    coada([text(JSON.stringify({ randuri: ['Urmărește B 77 TIR.'], nume: [] }))]);
    const n3 = await json('POST', '/api/test/fise-noaptea', S, { acum: Date.now() + 2 * 86400000 });
    const fA = (await json('GET', '/api/test/fisa/' + idA, S)).j.fisa;
    const ceA = await intreaba(A, 'Ce știi despre mine?');
    T('fiecare om cu fișa lui: Andrei vede doar ce știe RA Insight despre el', qa.status === 200 && n3.j.scrise >= 1 && fA && fA.randuri[0] === 'Urmărește B 77 TIR.' && /Urmărește B 77 TIR\./.test(ceA.j.reply || '') && !/Vrea răspunsuri scurte/.test(ceA.j.reply || ''), JSON.stringify(n3.j) + ' · ' + (ceA.j.reply || '').slice(0, 120));

    // ── Butonul din Preferințe ──
    const g1 = await json('GET', '/api/insight/fisa', C);
    T('Preferințe: blocul știe dacă există fișă și are textele de la server', g1.status === 200 && g1.j.are === true && /O vede doar el/.test(g1.j.explicatie || '') && /Discuțiile tale rămân/.test(g1.j.confirmare || ''));
    const d1 = await json('DELETE', '/api/insight/fisa', C);
    fS = (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa;
    T('„Șterge tot ce știe despre mine": fișa se golește, cu mesajul de la server', d1.status === 200 && d1.j.sters === true && /a uitat tot/.test(d1.j.mesaj || '') && fS.randuri.length === 0 && fS.nume.length === 0);
    const d2 = await json('DELETE', '/api/insight/fisa', C);
    T('a doua apăsare: „nu era nimic de șters"', d2.status === 200 && d2.j.sters === false && /Nu era nimic/.test(d2.j.mesaj || ''));
    T('fișa lui Andrei n-a fost atinsă', ((await json('GET', '/api/test/fisa/' + idA, S)).j.fisa || {}).randuri.length === 1);
    // Discuțiile de dinainte de ștergere nu mai intră; doar ce vine după.
    await sleep(1100);
    const q2 = await intreaba(C, 'Unde e B 77 TIR acum?');
    coada([text(JSON.stringify({ randuri: ['Întreabă unde e B 77 TIR.'], nume: [] }))]);
    const n4c = cereri().length;
    const n4 = await json('POST', '/api/test/fise-noaptea', S, { acum: Date.now() + 3 * 86400000 });
    const c4 = cereri().slice(n4c).map(mesajeCererii).join('\n');
    T('după ștergere, noaptea citește doar discuțiile de după (nu revine ce s-a uitat)', q2.status === 200 && n4.j.scrise >= 1 && /Unde e B 77 TIR acum\?/.test(c4) && !/Unde e B 154 UIP\?/.test(c4) && !/Ce știi despre mine/.test(c4), JSON.stringify(n4.j));

    // ── Conversațiile șterse la 12 luni: fișa rămâne ──
    const lista = (await json('GET', '/api/insight/conversatii', C)).j;
    const convs = (lista.conversatii || lista.lista || lista || []).map((c) => c.id).filter(Boolean);
    for (const id of convs) await json('POST', '/api/test/insight-imbatraneste', S, { id: id, luni: 13 });
    const sv = await json('POST', '/api/admin/insight/sterge-vechi', S, {});
    fS = (await json('GET', '/api/test/fisa/' + idS, S)).j.fisa;
    T('conversațiile de peste 12 luni se șterg, fișa rămâne (cât omul are cont)', sv.status === 200 && sv.j.sterse >= 1 && fS && fS.randuri.length === 1, JSON.stringify(sv.j) + ' · ' + JSON.stringify(fS));

    // ── Contul scos din firmă: fișa pleacă cu el ──
    const del = await json('DELETE', '/api/users/' + idA, C);
    const fA2 = (await json('GET', '/api/test/fisa/' + idA, S)).j.fisa;
    T('contul scos din firmă: fișa lui pleacă odată cu el', del.status === 200 && fA2 === null, del.status + ' ' + JSON.stringify(fA2));

    // ── O firmă pe Start (fără AI): noaptea n-o atinge ──
    const co2 = (await json('POST', '/api/companies', S, { name: 'Start SRL', cui: 'RO87654321', address: 'Str. Lungă 1, Brașov, jud. Brașov', contact_email: 'office@start.ro' })).j;
    await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000097009', nume: 'Ford Transit', nr_inmatriculare: 'BV 11 STA' }] });
    await json('PUT', '/api/devices/350000000097009/company', S, { company_id: co2.id });
    await json('POST', '/api/test/simulate', S, { imei: '350000000097009', ts: new Date(Date.now() - 120000).toISOString(), lat: 45.65, lng: 25.6, speed: 0, io: { ignition: 0 } });
    const uP = await json('POST', '/api/users', S, { username: 'ion@start.ro', full_name: 'Ion Start', role: 'company_admin', company_id: co2.id });
    await puneParola(uP.j, 'Str4da-Verde-2028', B);
    const P = await login('ion@start.ro', 'Str4da-Verde-2028');
    const idP = uP.j.id || (uP.j.user && uP.j.user.id);
    await json('GET', '/api/ai/quota', P);   // pe Start, administratorul își primește singur locul
    await intreaba(P, 'Unde e BV 11 STA?');
    const nP = cereri().length;
    await json('POST', '/api/test/fise-noaptea', S, { acum: Date.now() + 4 * 86400000 });
    T('firma pe Start (fără AI): nicio fișă, nicio cerere către model', (await json('GET', '/api/test/fisa/' + idP, S)).j.fisa === null && cereri().length === nP);
  } catch (e) {
    rau++; console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e));
  }
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rau + ' picate');
  gata(rau ? 1 : 0);
})();
