// verify_cifre.js — cifrele în care omul trebuie să aibă încredere (etapa B+, Alin, 08.10: „da").
//
//   node verify_cifre.js
//
// Ce păzește:
//   1. regula (cifre.js), rulată: cifrele din răspunsul lui RA Insight se regăsesc în datele citite (ca atare sau socotite:
//      totaluri, diferențe și procente între perioade, litri la 100 km); una inventată e prinsă; datele, orele și numerele de
//      înmatriculare nu se socotesc cifre ale flotei;
//   2. perioada: „1–7 octombrie" e 1–7, în AI Raport ȘI în RA Insight; perioada citită ≠ cea cerută e spusă;
//   3. cifrele greu de crezut (consum, preț pe litru) — „de verificat", cu pragurile din cifre.js;
//   4. pe server pornit, cu modelul simulat (nu se cheltuie nimic): banda „De verificat" sub răspuns (perioada, cifra
//      inventată, consumul greu de crezut), păstrată în conversație; unealta combustibil citește intervalul exact; aceeași
//      mașină e „de verificat" în ramura Combustibil, în raportul Consum (legenda) și în AI Raport;
//   5. pagina: banda și nota din ramură, cu textul pus ca text și culorile cu pereche pe tema deschisă.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./cifre');
const I = require('./insight');
const A = require('./ai_raport');
const R = require('./ramuri');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Cifrele din răspuns ─────────────────────────────────────────────────────────────────────────
console.log('1. Cifrele din răspunsul lui RA Insight, față de datele citite');
// Datele din captura lui Alin (08.10), cum le întoarce unealta combustibil.
const DATE = [{ perioada: 'octombrie 2026 (până azi)', flota: { km: 702, litri: 58, cost: 366, l100: 8.3, masini: 3 }, masini: [
  { masina: 'B 154 UIP (Dacia Logan 3)', km: 496, litri: 42.3, l_la_100_km: 8.5, norma_din_fisa: 10.5, pret_litru_lei: 4.7, cost_lei: 199 },
  { masina: 'B 268 ROY (VW CADDY)', km: 193, litri: 15.1, l_la_100_km: 7.8, pret_litru_lei: 10.93, cost_lei: 165 },
  { masina: 'B112RFG (VW Passat B7)', km: 13, litri: 0.2, l_la_100_km: 1.2, pret_litru_lei: 10, cost_lei: 2 }] }];
const RASP = '**Consum combustibil: octombrie 2026**\nFlota ta are 3 mașini. Datele (1–8 octombrie):\n' +
  '• B 154 UIP (Dacia Logan 3) — 496 km | 8,5 l/100 km | 42,3 litri | 199 lei (la 4,70 lei litrul)\n*Consumul trecut în fișă: 10,5 l/100 km.*\n' +
  '• B 268 ROY — 193 km | 7,8 l/100 km | 15,1 litri | 165 lei\n• B112RFG — 13 km | 1,2 l/100 km | 0,2 litri | 2 lei\n' +
  '**Totalul flotei:** 702 km, 58 litri, 366 lei, consum mediu 8,2 l/100 km. B 154 UIP a făcut 71% din km.';
T('un răspuns scris din date: toate cifrele se regăsesc (și totalurile, media, partea din total)', C.negasite(RASP, DATE).length === 0, JSON.stringify(C.negasite(RASP, DATE)));
const inventat = C.negasite(RASP.replace('702 km', '734 km').replace('42,3 litri', '47,9 litri'), DATE);
T('o cifră inventată e prinsă (734 km, 47,9 litri)', inventat.includes('734 km') && inventat.includes('47,9 litri'), JSON.stringify(inventat));
const DOUA = [{ type: 'utilization', columns: ['Vehicul', 'Șofer', 'Km'], rows: [['B 154 UIP', 'Ion', '538']] }, { type: 'utilization', columns: ['Vehicul', 'Șofer', 'Km'], rows: [['B 154 UIP', 'Ion', '472']] }];
T('o comparație între două perioade: +66 km și +14% se regăsesc', C.negasite('Săptămâna trecută: 538 km, cu 66 km mai mult (+14%) decât în cea dinainte (472 km).', DOUA).length === 0, JSON.stringify(C.negasite('cu 66 km mai mult (+14%)', DOUA)));
T('…dar „+70 km" nu', C.negasite('cu 70 km mai mult', DOUA).includes('70 km'));
T('datele, orele, duratele și numerele de înmatriculare nu se verifică (duratele se scriu în prea multe feluri)', C.negasite('Pe 08.10.2026, la 13:42, B112RFG a stat 45 de minute; B 154 UIP pe 15 septembrie.', DATE).length === 0, JSON.stringify(C.negasite('Pe 08.10.2026, la 13:42, B112RFG a stat 45 de minute', DATE)));
T('prețul pe litru („pret_litru_lei") e preț, nu litri: totalul de litri al listei e 57,6, nu 83,2', C.negasite('57,6 litri', DATE).length === 0 && C.negasite('83,2 litri', DATE).includes('83,2 litri'), JSON.stringify([C.negasite('57,6 litri', DATE), C.negasite('83,2 litri', DATE)]));
T('cifrele mici (până la 12) nu se verifică: „3 mașini", „2 opriri"', C.negasite('3 mașini, 2 opriri, 7 km', []).length === 0);
T('„la 100 km" e mereu pe voie', C.negasite('6,8 L la 100 km', [{ l: 6.8 }]).length === 0);
T('semnele de îngroșare nu ascund cifra și nu se lipesc de unitate („**734** km", „**734 km**" → „734 km")',
  JSON.stringify(C.negasite('**734** km și **734 km**.', DATE)) === '["734 km"]', JSON.stringify(C.negasite('**734** km și **734 km**.', DATE)));
T('cifrele cu unitate se recunosc: km, l/100 km, litri, lei, %', C.cifreleRaspunsului('8,5 l/100 km, 42,3 litri, 199 lei, +14%, 1.234,5 km').map((c) => c.fel).join(',') === 'l100,litri,lei,pct,km');
T('Scrisoarea de luni citește cifrele cu același cititor (cifre.numere)', /const _numere = require\('\.\/cifre'\)\.numere;/.test(fs.readFileSync(path.join(__dirname, 'ramuri.js'), 'utf8')) &&
  R.textulTrece('Săptămâna trecută flota a mers 538 km și a consumat 36,6 litri. '.repeat(3), { km: 538, litri: 36.6 }).ok &&
  !R.textulTrece('Săptămâna trecută flota a mers 999 km și a consumat 36,6 litri. '.repeat(3), { km: 538, litri: 36.6 }).ok);

// ─── 2. Perioada ───────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Perioada: „1–7 octombrie" e 1–7');
const ACUM = Date.parse('2026-10-08T10:00:00Z');
const per = (q) => { const p = A.perioadaDin(I.norm(q), ACUM); return p ? p.eticheta : null; };
[['pe intervalul 01.10.2026-07.10.2026', '1–7 octombrie'], ['consumul din 1-7 octombrie', '1–7 octombrie'], ['consumul din 1–7 octombrie', '1–7 octombrie'],
 ['de pe 1 până pe 7 octombrie', '1–7 octombrie'], ['între 1 și 7 octombrie', '1–7 octombrie'], ['din 28 septembrie până pe 4 octombrie', '28 septembrie – 4 octombrie'],
 ['de pe 1 octombrie până azi', 'octombrie 2026 (până azi)'], ['km 28.12-03.01', '28 decembrie – 3 ianuarie'],
 ['săptămâna trecută', '28 septembrie – 4 octombrie'], ['pe 15.09', '15 septembrie'], ['în septembrie', 'septembrie 2026']].forEach(([q, e]) => {
  T('„' + q + '" → ' + e, per(q) === e, per(q));
});
T('„1-7 octombrie" nu mai iese „1 iulie" (citit ca o zi: 1.7)', per('consumul din 1-7 octombrie') !== '1 iulie');
const zile = I.perioada({ from: '2026-10-01', to: '2026-10-07' }, ACUM);
T('o perioadă dată pe zile („2026-10-01" … „2026-10-07"): ultima zi intră întreagă', I.etichetaPerioadei(zile.from, zile.to, ACUM) === '1–7 octombrie', JSON.stringify(zile));
const ceruta = A.perioadaDin(I.norm('consumul din 1-7 octombrie'), ACUM);
const luna = I.perioada({ month: '2026-10' }, ACUM);
T('a cerut 1–7, s-a citit toată luna → spus', C.perioadaDiferita(ceruta, [{ from: luna.from, to: luna.to, eticheta: 'octombrie 2026 (până azi)' }], ACUM) === 'Ai cerut 1–7 octombrie; cifrele sunt pentru octombrie 2026 (până azi).');
T('a cerut 1–7, s-a citit 1–7 → nimic de spus', C.perioadaDiferita(ceruta, [{ from: zile.from, to: zile.to, eticheta: '1–7 octombrie' }], ACUM) === null);
T('a cerut luna asta, s-a citit luna asta (până acum) → nimic de spus', C.perioadaDiferita(A.perioadaDin('luna asta', ACUM), [{ from: luna.from, to: ACUM, eticheta: 'x' }], ACUM) === null);
T('fără perioadă în întrebare → nimic de spus', C.perioadaDiferita(null, [{ from: luna.from, to: luna.to, eticheta: 'x' }], ACUM) === null);

// ─── 3. Cifrele greu de crezut ─────────────────────────────────────────────────────────────────────
console.log('\n3. Cifrele greu de crezut — „de verificat"');
const dv = (o) => C.consumDeVerificat(o);
T('1,2 l/100 km pe 13 km → „prea puțin drum"', /1,2 l\/100 km pe doar 13 km — prea puțin drum/.test(dv({ l100: 1.2, km: 13 }).join()), dv({ l100: 1.2, km: 13 }).join());
T('1,2 l/100 km pe 200 km → „neobișnuit de mic", cu ce e de verificat', /^1,2 l\/100 km — neobișnuit de mic; verifică senzorul, contorul sau consumul din fișă$/.test(dv({ l100: 1.2, km: 200 }).join()), dv({ l100: 1.2, km: 200 }).join());
T('45 l/100 km la un autoturism → „neobișnuit de mare"; la un camion e în regulă', /neobișnuit de mare/.test(dv({ l100: 45, km: 300 }).join()) && dv({ l100: 45, km: 300, camion: true }).length === 0);
T('75 l/100 km la un camion → „de verificat"', dv({ l100: 75, km: 300, camion: true }).length === 1);
T('8,5 l/100 km → nimic', dv({ l100: 8.5, km: 496, pret: 7.3 }).length === 0);
T('prețul pe litru 25 lei sau 2 lei → „pare greșit"; 4,70 (GPL) și 7,30 → în regulă', /pare greșit/.test(dv({ pret: 25 }).join()) && /pare greșit/.test(dv({ pret: 2 }).join()) && dv({ pret: 4.7 }).length === 0 && dv({ pret: 7.3 }).length === 0);
T('o mașină electrică nu se măsoară în litri', dv({ l100: 0.5, km: 300, pret: 1.2, electric: true }).length === 0);
T('pragurile stau într-un singur loc (cifre.js): 3 / 40, camion 10 / 70, preț 3 / 12 lei', C.CONSUM.min === 3 && C.CONSUM.max === 40 && C.CONSUM_CAMION.min === 10 && C.CONSUM_CAMION.max === 70 && C.PRET.min === 3 && C.PRET.max === 12);
const REP = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
T('rapoartele de consum, costuri și emisii pun „De verificat" în legendă (ecran, Excel, PDF) — din același calcul',
  /cifre\.consumDeVerificat\(\{ l100: per100, km: dist, pret: price, camion: tacho\.vehiculAreTahograf\(c\.vtype\)/.test(REP) &&
  (REP.match(/_legendaCuDeVerificat\(/g) || []).length === 4);

// ─── 5. Pagina ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. Pagina: banda „De verificat" și nota din ramura Combustibil');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
T('banda e o singură piesă (_insightExtra, partea „verificare"), cu textul pus ca text', /parte === 'verificare'/.test(PAG) && /li\.textContent = t;/.test(PAG) && /tt\.textContent = 'De verificat';/.test(PAG));
T('o folosesc secțiunea RA Insight și bula din colț', /_insightExtra\(\{ verificare: x\.verificare \}, null, 'verificare'\)/.test(PAG) && /_insightExtra\(j, null, 'verificare'\)/.test(PAG));
// Scăparea din 08.10, prinsă de capturi: răspunsul proaspăt din secțiune nu ducea banda mai departe (apărea doar la redeschidere).
T('…și pe răspunsul PROASPĂT din secțiune, nu doar la redeschiderea conversației', /extra: \{ sources: j\.sources, inteles: j\.inteles, alege: j\.alege, source: j\.source, urmari: j\.urmari, verificare: j\.verificare \}/.test(PAG));
T('ramura Combustibil spune „De verificat" sub mașină', /' De verificat: ' \+ m\.deVerificat\.join\('; '\)/.test(PAG));
T('textul benzii are culoarea textului (contrast sigur pe ambele teme); chihlimbarul doar pe chenar și iconiță, cu pereche pe tema întunecată',
  /\.chat-verif \{[^}]*color: var\(--text-primary\)/.test(CSS) && /\.chat-verif > i \{ color: #b45309;/.test(CSS) && /body\.dark \.chat-verif > i \{ color: #fbbf24; \}/.test(CSS));

// ─── 4. Pe server pornit ───────────────────────────────────────────────────────────────────────────
const PORT = 3299, TCP = 5299;
const DIR = path.join(os.tmpdir(), 'rax_cifre_' + Date.now());
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
const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_cifre', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA,
  GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG, AI_COADA]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, ck, body) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
const unealta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit, cu modelul simulat (nu se cheltuie nimic)');
  const S = await login('admin', 'test1234');
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Cifre SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const u = (await json('POST', '/api/users', S, { username: 'sef@cifre.ro', full_name: 'Sef Cifre', role: 'admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  await json('PUT', '/api/users/' + u.id + '/ai-seat', S, { on: true });
  const ck = await login('sef@cifre.ro', 'Str4da-Verde-2026');
  // Două mașini: un Logan cu fișa obișnuită și o dubă cu „consum afară" de 1 l/100 km trecut din greșeală în fișă.
  const LOGAN = '862129084930001', DUBA = '862129084930002';
  await json('POST', '/api/devices/import', S, { rows: [{ imei: LOGAN, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP', consum_afara: '6.5', consum_oras: '8' },
    { imei: DUBA, nume: 'Duba depozit', nr_inmatriculare: 'B 999 TST', consum_afara: '1', consum_oras: '1' }] });
  for (const imei of [LOGAN, DUBA]) await json('PUT', '/api/devices/' + imei + '/company', S, { company_id: co.id });
  T('pregătire: firma cu RA Insight, omul cu loc, două mașini (una cu consum de 1 l/100 km în fișă)', !!(co.id && ck));
  // Drum în primele trei zile ale săptămânii trecute (intervalul întrebat) și joi (în afara lui). Zilele, față de AZI.
  const sapt = I.perioada({ period: 'last_week' }, Date.now());
  const luni = Date.parse(sapt.from), zi = 86400000;
  const drum = async (imei, t0, km) => {
    let lat = 44.40;
    for (let k = 0; k <= km / 2; k++) { await json('POST', '/api/test/simulate', S, { imei, ts: new Date(t0 + k * 120000).toISOString(), lat: lat + k * 2 / 111, lng: 26.10, speed: 60, io: { ignition: 1 } }); }
  };
  for (const d of [0, 1, 2]) { await drum(LOGAN, luni + d * zi + 8 * 3600000, 60); await drum(DUBA, luni + d * zi + 9 * 3600000, 60); }
  await drum(LOGAN, luni + 3 * zi + 8 * 3600000, 60);
  const fmt = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const dd = (ms) => fmt(ms).slice(8, 10) + '.' + fmt(ms).slice(5, 7);
  const intreb = 'Ce consum am avut pe intervalul ' + dd(luni) + '-' + dd(luni + 2 * zi) + '?';
  const etCeruta = A.perioadaDin(I.norm(intreb), Date.now()).eticheta;

  // a) RA Insight citește toată luna (greșit) și scrie o cifră inventată → banda spune amândouă. Luna = cea a zilei de luni,
  //    ca drumurile dubei să fie în ce citește (săptămâna trecută poate începe în luna dinainte).
  coada([unealta('combustibil', { month: fmt(luni).slice(0, 7) }), text('Consumul pe ' + etCeruta + ': flota a mers 734 km.')]);
  const q1 = await json('POST', '/api/insight/intreaba', ck, { message: intreb, nou: true });
  const v1 = q1.j.verificare || {};
  T('banda spune că s-a citit altă perioadă decât cea cerută', /^Ai cerut .+; cifrele sunt pentru .+\.$/.test(v1.perioada || '') && (v1.perioada || '').indexOf(etCeruta) > 0, v1.perioada);
  T('…și cifra inventată (734 km)', (v1.cifre || []).includes('734 km'), JSON.stringify(v1.cifre));
  T('…și consumul greu de crezut al dubei, cu motivul', (v1.deVerificat || []).some((t) => /B 999 TST/.test(t) && /neobișnuit de mic/.test(t)), JSON.stringify(v1.deVerificat));
  const conv = await json('GET', '/api/insight/conversatii/' + q1.j.conversatieId, ck);
  const ultimul = ((conv.j.mesaje || []).filter((m) => m.rol === 'ai' || m.rol === 'assistant').slice(-1)[0]) || {};
  T('banda rămâne în conversație (se vede și la redeschidere)', !!(ultimul.extra && ultimul.extra.verificare && ultimul.extra.verificare.perioada), JSON.stringify(ultimul.extra && ultimul.extra.verificare));

  // b) RA Insight citește EXACT intervalul cerut → nimic de spus despre perioadă
  coada([unealta('combustibil', { from: fmt(luni), to: fmt(luni + 2 * zi) }), text('Consumul pe ' + etCeruta + '.')]);
  const q2 = await json('POST', '/api/insight/intreaba', ck, { message: intreb, nou: true });
  // ce a primit modelul înapoi de la unealtă (rezultatul e un JSON scris ca text în mesaj)
  const msg2 = (cereri().slice(-1)[0].messages || []).slice(-1)[0] || {};
  const tr2 = (Array.isArray(msg2.content) ? msg2.content : []).filter((c) => c.type === 'tool_result')[0] || {};
  let rez2 = {}; try { rez2 = JSON.parse(typeof tr2.content === 'string' ? tr2.content : JSON.stringify(tr2.content)); } catch (e) {}
  T('unealta combustibil citește exact intervalul cerut („' + etCeruta + '"), nu luna', rez2.perioada === etCeruta, JSON.stringify(rez2).slice(0, 220));
  T('…deci banda nu mai spune nimic despre perioadă', !(q2.j.verificare && q2.j.verificare.perioada), JSON.stringify(q2.j.verificare));
  const m2 = rez2.masini || [];
  T('unealta spune modelului prețul pe litru și sursa pe înțelesul omului', m2.length === 2 && m2.every((m) => typeof m.pret_litru_lei === 'number') &&
    m2.every((m) => /^estimat din consumul trecut în fișă/.test(m.sursa || '')), JSON.stringify(m2.map((m) => [m.masina, m.pret_litru_lei, m.sursa])));
  T('…și cifra greu de crezut a dubei, lângă mașina ei (de_verificat)', m2.some((m) => /B 999 TST/.test(m.masina) && (m.de_verificat || []).some((t) => /neobișnuit de mic/.test(t))) &&
    !m2.some((m) => /B 154 UIP/.test(m.masina) && m.de_verificat), JSON.stringify(m2.map((m) => [m.masina, m.de_verificat])));
  T('instrucțiunile cer perioada exactă și cifrele „de_verificat" spuse lângă cifra lor', /\(8\) Perioada: citește EXACT perioada cerută/.test(JSON.stringify(cereri().slice(-1)[0].system)) && /de_verificat/.test(JSON.stringify(cereri().slice(-1)[0].system)));

  // c) aceeași dubă, „de verificat" peste tot: ramura, raportul Consum, AI Raport
  const cb = await json('GET', '/api/insight/combustibil?luna=' + fmt(luni).slice(0, 7), ck);
  const duba = (cb.j.masini || []).filter((m) => /B 999 TST/.test(m.eticheta))[0] || {};
  T('ramura Combustibil: duba are „de verificat"', (duba.deVerificat || []).some((t) => /neobișnuit de mic/.test(t)), JSON.stringify(duba.deVerificat));
  const rc = await json('GET', '/api/reports/consumption?from=' + encodeURIComponent(new Date(luni).toISOString()) + '&to=' + encodeURIComponent(new Date(luni + 3 * zi).toISOString()), ck);
  const leg = ((rc.j.legend || {}).items || []).filter((x) => x[0] === 'De verificat');
  T('raportul Consum: „De verificat" în legendă (ecran, Excel, PDF), pe dubă', leg.length === 1 && /B 999 TST/.test(leg[0][1]), JSON.stringify(leg));
  const rcLogan = ((rc.j.legend || {}).items || []).some((x) => x[0] === 'De verificat' && /B 154 UIP/.test(x[1]));
  T('…Loganul (8 l/100 km) nu e marcat', !rcLogan);
  const ar = await json('POST', '/api/reports/ai-raport', ck, { text: 'consumul pe intervalul ' + dd(luni) + '-' + dd(luni + 2 * zi) });
  T('AI Raport înțelege intervalul („' + etCeruta + '")', ((ar.j.inteles || []).some((x) => x.text === etCeruta)), JSON.stringify(ar.j.inteles));
  T('AI Raport spune „De verificat" la dubă', ((ar.j.raspuns || ar.j).sugestii || []).some((x) => /^De verificat — .*B 999 TST/.test(x.text)), JSON.stringify((ar.j.raspuns || ar.j).sugestii));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); gata(1); });
