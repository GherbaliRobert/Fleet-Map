// verify_proba_reparatii.js — cele 10 reparații găsite în proba modelelor (Robert a rulat-o pe ratrack.ro pe 21.10; Alin, 22.10:
// „DA" la reparații) și contorul corecturilor (garanția B; Alin: „hai să mergem pe B, A ne costă").
//
//   node verify_proba_reparatii.js
//
// Ce păzește:
//   1. cele mai mari valori din TOATE rândurile unui raport (modelul vedea doar 25: „cea mai lungă cursă" a rămas fără răspuns);
//   2. RA Insight nu mai citește raportul „Analitic" (lista de 5.000 de poziții: viteza maximă a lunii ieșea 153 în loc de 170);
//   3. combustibilul: unde consumul nu e măsurat, alimentările și scăderile „nu se pot vedea" și norma nu mai e reper;
//   4. pragul vitezei: din fișa mașinii (130 la autoturisme, 90 la camioane) și spus pe față, nu „limita legală";
//   5. verificarea cifrelor acceptă procentul din întrebare („cam 65 de lei" = 10% din 651);
//   6. vorbele despre echipament cer o rescriere (și „De verificat" nu mai trimite clientul la senzor);
//   7. „Salvează"; 8. luna de acum se compară cu aceleași zile din luna dinainte; 9. sumele românești în „RA Insight · control";
//   10. adresa de suport e una pe care o primim (contact@), iar mesajele din fereastra de suport chiar ne ajung;
//   B. contorul corecturilor: câte răspunsuri a rescris aplicația, doar numere, pe pagina noastră.
// Serverul pornește cu modelul SIMULAT (nu se cheltuie nimic) și cu un Brevo fals (nu pleacă niciun email adevărat).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const I = require('./insight.js');
const C = require('./cifre.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// ─── 1. Regulile curate ──────────────────────────────────────────────────────────────────────────────
console.log('1. Regulile: cele mai mari valori, vorbele despre echipament, procentul din întrebare');
const COL = ['Vehicul', 'Plecare', 'Sosire', 'Distanță (km)', 'Durată', 'Vit. max (km/h)'];
const RAND = Array.from({ length: 119 }, (_, k) => ['B 154 UIP', '0' + (k % 9 + 1) + '.09.2026 08:00', 'Olteni', (10 + (k * 7) % 39).toFixed(2), '0h 30m', String(60 + (k * 11) % 80)]);
RAND[73][3] = '49.17'; RAND[73][1] = '22.09.2026 17:02'; RAND[73][2] = 'București, Bulevardul Basarabia 28';
const mari = I.celeMaiMari(COL, RAND, 5);
T('din 119 curse: cea mai lungă (49,17 km, 22.09) e prima la „Distanță (km)", cu tot rândul ei', mari && mari['Distanță (km)'].length === 5 &&
  mari['Distanță (km)'][0]['Distanță (km)'] === '49.17' && /22\.09\.2026/.test(mari['Distanță (km)'][0].Plecare) && /Basarabia/.test(mari['Distanță (km)'][0].Sosire), JSON.stringify(mari && mari['Distanță (km)'][0]));
T('…și cea mai mare viteză (139 km/h) la „Vit. max"; durata (text) nu e coloană cu cifre', mari && mari['Vit. max (km/h)'][0]['Vit. max (km/h)'] === '139' && !mari['Durată']);
T('cu 25 de rânduri sau mai puține, nimic în plus (modelul le vede pe toate)', I.celeMaiMari(COL, RAND.slice(0, 25), 5) === null);

const E = I.vorbeDespreEchipament;
T('prinse: „Mașina nu trimite date despre nivelul din rezervor" (Haiku, întrebarea 16)', E('Atenție: consumul nu este măsurat. Mașina nu trimite date despre nivelul din rezervor, așa că litrii sunt socotiți.').length === 1);
T('prinse: „Mașina nu trimite nivelul din rezervor destul de precis" și „întreabă RA Track cum se trece consumul măsurat" (întrebarea 11)',
  E('Mașina nu trimite nivelul din rezervor destul de precis.').length === 1 && E('Dacă vrei cifre măsurate, întreabă RA Track cum se trece consumul măsurat.').length === 1);
T('prinse: „senzorul e blocat", „verifică aparatul", „verifică dacă are senzor", „montează un senzor"',
  E('Senzorul e blocat pe 25 L.').length && E('Verifică aparatul din mașină.').length && E('Verifică dacă are senzor de combustibil.').length && E('Montează un senzor de nivel.').length);
T('NU prinse faptele și ce face omul singur: „nu transmite de 3 zile", „sună șoferul", „verifică consumul din fișă", „completează fișa"',
  !E('B 268 ROY nu transmite de 3 zile. Dacă ar trebui să fie pe drum, sună șoferul.').length && !E('Verifică consumul trecut în fișa mașinii.').length &&
  !E('Completează în fișa mașinii consumul real.').length && !E('Consumul e socotit din fișă, nu măsurat.').length);

const date651 = { masini: [{ masina: 'B 154 UIP', cost_lei: 651, litri: 138.3, km: 1617 }] };
const R20 = 'Zece la sută din cei 651 de lei de combustibil înseamnă cam 65 de lei.';
T('„cam 65 de lei" = 10% din 651 de lei: bun când întrebarea cere 10%', C.negasite(R20, date651, 'Vreau să reduc costurile cu 10%. De unde să încep?').length === 0, JSON.stringify(C.negasite(R20, date651, 'Vreau să reduc costurile cu 10%.')));
T('…dar negăsit fără procentul din întrebare (verificarea rămâne strictă)', C.negasite(R20, date651, 'Ce costuri am?').join() === '65 de lei', JSON.stringify(C.negasite(R20, date651, 'Ce costuri am?')));
T('…și restul: „ai rămâne cu cam 586 de lei" (651 − 10%)', C.negasite('Ai rămâne cu cam 586 de lei.', date651, 'reduc costurile cu 10 la sută').length === 0);
const dv = C.consumDeVerificat({ l100: 55, km: 600 });
T('„De verificat" la un consum ciudat: fără „senzorul" — doar ce face omul singur (fișa)', dv.length === 1 && !/senzor|contor/i.test(dv[0]) && /fișa mașinii/.test(dv[0]), dv[0]);

// ─── 2. Pagina, ghidul, adresele ─────────────────────────────────────────────────────────────────────
console.log('\n2. Pagina, ghidul și adresele');
T('„Editare vehicul": butonul scrie „Salvează" (era „Salveaza")', /<i class="fas fa-save"><\/i> Salvează\n/.test(html) && !/<i class="fas fa-save"><\/i> Salveaza\b/.test(html));
T('…și ghidul lui RA Insight îl citează la fel', /apasă „Salvează"/.test(fs.readFileSync(path.join(__dirname, 'insight_ghid.js'), 'utf8')));
const mt = fs.readFileSync(path.join(__dirname, 'public', 'js', 'map-tools.js'), 'utf8');
T('fereastra „Suport clienți": contact@ratrack.ro (suport@ nu ne vine), și la integratori, și pe telefon',
  /mailto:contact@ratrack\.ro/.test(mt) && !/suport@ratrack\.ro/.test(mt) && !/suport@ratrack\.ro/.test(fs.readFileSync(path.join(__dirname, 'public', 'api-docs.html'), 'utf8')) &&
  !/suport@ratrack\.ro/.test(fs.readFileSync(path.join(__dirname, 'mobile', 'src', 'screens', 'Menu.tsx'), 'utf8')));
const blocNr = (html.match(/function _aiuNr\(v\) \{[\s\S]*?\n    \}/) || [''])[0];
const ctxNr = {}; vm.createContext(ctxNr); vm.runInContext(blocNr, ctxNr);
T('„RA Insight · control": sumele românești — „0,01", „9,99", „1.234", „45", „-950"',
  ctxNr._aiuNr(0.01) === '0,01' && ctxNr._aiuNr(9.99) === '9,99' && ctxNr._aiuNr(1234) === '1.234' && ctxNr._aiuNr(45) === '45' && ctxNr._aiuNr(-950) === '-950' && ctxNr._aiuNr(1e6) === '1.000.000',
  [0.01, 9.99, 1234, 45, -950, 1e6].map((v) => ctxNr._aiuNr && ctxNr._aiuNr(v)).join(' | '));
T('RA Insight nu primește raportul „Analitic": nici în listă, nici în unealtă', /const RAPOARTE_FARA_MODEL = \['analytic'\];/.test(SRV) &&
  /Object\.entries\(reports\.REPORTS\)\.filter\(\(\[k\]\) => RAPOARTE_FARA_MODEL\.indexOf\(k\) < 0\)/.test(SRV) &&
  /enum: Object\.keys\(reports\.REPORTS\)\.filter\(function \(k\) \{ return RAPOARTE_FARA_MODEL\.indexOf\(k\) < 0; \}\)/.test(SRV));
T('verificarea cifrelor primește întrebarea (procentele)', (SRV.match(/cifre\.negasite\([^)]*, dateCitite, message\)/g) || []).length === 2);
T('pagina noastră: rândul „Corectate singure luna asta", doar numere', /Corectate singure luna asta: /.test(html) && /Textul lor nu-l vedem — doar câte\./.test(html));

// ─── 3. Pe server pornit ─────────────────────────────────────────────────────────────────────────────
const PORT = 3353, TCP = 5353, DIR = path.join(os.tmpdir(), 'rax_reparatii_' + Date.now());
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
// Brevo fals: refuză până la proba suportului, ca invitația contului nou să întoarcă linkul de parolă (test_parola).
const emailuri = [];
let brevoPrimeste = false;
const brevo = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    if (req.url !== '/v3/account' && !brevoPrimeste) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"message":"proba: încă nu"}'); }
    if (req.url !== '/v3/account') emailuri.push(j);
    res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"messageId":"<m@b>"}');
  });
});
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const unealta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
// Rezultatul uneltei, din cererea care urmează după ea (modelul simulat îl primește ca tool_result).
function rezultatUnealta(c) {
  const ms = (c && c.messages) || [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const cont = Array.isArray(ms[i].content) ? ms[i].content : [];
    const tr = cont.find((x) => x && x.type === 'tool_result');
    if (tr) { const t = typeof tr.content === 'string' ? tr.content : (Array.isArray(tr.content) ? tr.content.map((x) => x.text || '').join('') : ''); try { return JSON.parse(t); } catch (e) { return { _text: t }; } }
  }
  return null;
}

(async () => {
  await new Promise((r) => brevo.listen(0, '127.0.0.1', r));
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_reparatii', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA, RATE_LIMIT_ENABLED: 'false',
    BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + brevo.address().port + '/v3/smtp/email', EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SUPPORT_EMAIL']) delete env[k];
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const curata = () => { for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { brevo.close(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); };
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
    return { status: r.status, j: j || {}, text: t };
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    console.log('\n3. Pe server pornit, cu modelul simulat și un Brevo fals');
    const S = await login('admin', 'test1234');
    await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Reparații SRL' })).j;
    await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'pro' } });
    const LOG = '862129084939501';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: LOG, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP', consum_afara: '7.5', consum_oras: '8.5' }] });
    await json('PUT', '/api/devices/' + LOG + '/company', S, { company_id: co.id });
    const u = await json('POST', '/api/users', S, { username: 'sef@reparatii.ro', email: 'sef@reparatii.ro', full_name: 'Șef Reparații', role: 'company_admin', company_id: co.id });
    await puneParola(u.j, 'Str4da-Verde-2026', B);
    await json('PUT', '/api/users/' + u.j.id + '/ai-seat', S, { on: true });
    const ck = await login('sef@reparatii.ro', 'Str4da-Verde-2026');
    // Un drum ieri, cu 120 km/h la vârf, fără nivel în rezervor (consumul se socotește din fișă)
    const ieri = Date.now() - 86400000;
    let lng = 26.1;
    for (let k = 0; k < 40; k++) {
      const v = k === 20 ? 120 : 70;
      await json('POST', '/api/test/simulate', S, { imei: LOG, ts: new Date(ieri + k * 30000).toISOString(), lat: 44.4, lng, speed: v, io: { ignition: 1 } });
      lng += (v / 3600 * 30) / 80;
    }
    T('pregătire: firma pe Pro, B 154 UIP cu un drum ieri, administratorul cu RA Insight', !!(co.id && ck));

    // 4 + 2: vitezele (pragul din fișă) și „Analitic" refuzat
    const n0 = cereri().length;
    coada([unealta('run_report', { type: 'speeding', vehicle: 'B 154 UIP', period: 'yesterday' }), text('B 154 UIP n-a trecut ieri de 130 km/h.')]);
    await json('POST', '/api/insight/intreaba', ck, { message: 'A depășit B 154 UIP viteza ieri?', nou: true });
    const c1 = cereri().slice(n0);
    const enumTip = (((c1[0] || {}).tools || []).find((t) => t.name === 'run_report') || {}).input_schema;
    T('unealta run_report nu mai oferă „analytic"', enumTip && Array.isArray(enumTip.properties.type.enum) && enumTip.properties.type.enum.indexOf('analytic') < 0 && enumTip.properties.type.enum.indexOf('speeding') >= 0);
    const r1 = rezultatUnealta(c1[1]);
    T('vitezele la un autoturism: pragul din fișă, 130 km/h, spus pe față („nu e limita legală")', r1 && /^Pragul raportului: 130 km\/h, același pe orice drum/.test(r1.prag_raport || '') && /NU e limita legală/.test(r1.prag_raport || ''), JSON.stringify(r1 && r1.prag_raport));
    const n1 = cereri().length;
    coada([unealta('run_report', { type: 'analytic', vehicle: 'B 154 UIP', period: 'last_30_days' }), text('Am citit alt raport.')]);
    await json('POST', '/api/insight/intreaba', ck, { message: 'Care a fost viteza maximă luna asta?' });
    const r2 = rezultatUnealta(cereri()[n1 + 1]);
    T('cerut totuși de model, „analytic" e refuzat, cu raportul potrivit spus', r2 && /lista poziție cu poziție/.test(r2.error || '') && /speeding/.test(r2.error || ''), JSON.stringify(r2).slice(0, 200));

    // 3 + 8: combustibilul — ce nu se vede; luna de acum față de aceleași zile ale lunii dinainte
    const zi = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
    const azi = zi(Date.now());
    const n2 = cereri().length;
    coada([unealta('combustibil', { from: azi.slice(0, 8) + '01', to: azi }), text('Consumul e socotit din fișă.')]);
    await json('POST', '/api/insight/intreaba', ck, { message: 'Ce consum am avut luna asta?' });
    const r3 = rezultatUnealta(cereri()[n2 + 1]) || {};
    const m3 = (r3.masini || [])[0] || {};
    T('consumul nemăsurat: „alimentările și scăderile nu se pot vedea", fără normă de comparat', m3.consum_masurat === false && /nu se pot vedea/.test(m3.alimentari_si_scaderi || '') &&
      m3.norma_din_fisa === undefined && (r3.alimentari_si_scaderi_nu_se_vad_la || []).length === 1 && /nu se pot vedea/.test(r3.atentie || ''), JSON.stringify(r3).slice(0, 400));
    const L = I.LUNI, lunaI = (Number(azi.slice(5, 7)) + 10) % 12;
    const etI = (r3.perioada_dinainte || {}).eticheta || '';
    T('de pe 1 până azi: comparat cu aceleași zile din luna dinainte (de pe 1)', azi.slice(8) === '01' || new RegExp('^1(–\\d+)? ' + L[lunaI]).test(etI), JSON.stringify(r3.perioada_dinainte));

    // 6 + B: o frază despre aparat → rescriere, iar contorul o numără (doar câte)
    const n3 = cereri().length;
    coada([text('Consumul nu este măsurat. Mașina nu trimite date despre nivelul din rezervor.'), text('Consumul nu este măsurat: e socotit din fișa mașinii.')]);
    const q4 = await json('POST', '/api/insight/intreaba', ck, { message: 'De ce nu e măsurat consumul?' });
    const c4 = cereri().slice(n3);
    T('o frază care pune vina pe aparat cere o rescriere, iar clientul primește răspunsul rescris', c4.length === 2 && /pune vina pe aparat/.test(JSON.stringify(c4[1].messages.slice(-1))) &&
      q4.j.reply === 'Consumul nu este măsurat: e socotit din fișa mașinii.', JSON.stringify({ n: c4.length, r: q4.j.reply }));
    const au = await json('GET', '/api/admin/ai-usage', S);
    const cor = (au.j.pachete || {}).corecturi || {};
    T('contorul corecturilor (doar numere): 1 rescris, din cauza aparatului, 0 ajunse la client cu o cifră negăsită', cor.rescrise === 1 && cor.echipament === 1 && cor.ramase === 0 && cor.cifre === 0, JSON.stringify(cor));

    // 10: fereastra de suport chiar ne trimite mesajul, la contact@, cu răspunsul spre om
    brevoPrimeste = true;
    const ne = emailuri.length;
    const sp = await json('POST', '/api/support', ck, { message: 'Nu-mi vine raportul pe email.' });
    for (let i = 0; i < 20 && emailuri.length === ne; i++) await sleep(150);
    const em = emailuri.slice(ne).find((x) => /Mesaj suport/.test(x.subject || '')) || {};
    T('„Suport clienți": mesajul pleacă la contact@ratrack.ro, cu „Răspuns la" = omul care a scris', sp.status === 200 && (em.to || [])[0] && em.to[0].email === 'contact@ratrack.ro' &&
      em.replyTo && em.replyTo.email === 'sef@reparatii.ro' && /Nu-mi vine raportul/.test(em.textContent || ''), JSON.stringify(em).slice(0, 300));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
