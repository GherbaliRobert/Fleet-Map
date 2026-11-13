// verify_sold_ai.js — banii pentru AI, la zi (04.11; Alin: „aveți sold de x bani, la zi, cât avem și când ajung clienții să consume 80%
// din plafon… să avem control total pe tokeni și bani, după ce schimbă Robert cheile"; „1. da", „2. da"):
//   1. regula (sold_ai.js): refuzul lui Anthropic, soldul (zilele încheiate: cifra Anthropic sau a aplicației, cea mai mare; azi: a
//      aplicației), reîncărcarea automată, pragurile 14 / 7 / 3 zile, firmele la 80% / 100%, banda de pe „Acasă", blocul din control;
//   2. „Azi la noi": soldul NU mai e un rând (are banda lui), dar banda roșie se numără la „de văzut";
//   3. pagina și stilurile: banda pe „Acasă", „Anthropic, la zi", un singur loc pentru sold, culorile pe ambele teme;
//   4. serverul (sursa): o socoteală, un ascultător, refuzul → reguli;
//   5. pe server pornit, cu Anthropic SIMULAT (mesajele, lista modelelor, raportul de costuri): soldul mutat o dată din „Control costuri",
//      cifrele la zi, refuzul creditului → clientul pe butoane + alarma la noi (o dată) → revenirea; cheia respinsă la verificare;
//      anunțurile 14 / 7 / 3 zile și 80% / 100%; reîncărcarea automată; „Rezumă", asistentul nostru; drepturile.
//
//   node verify_sold_ai.js            (tot)
//   node verify_sold_ai.js --fara-server
'use strict';
const fs = require('fs');
const path = require('path');
const ZI = 86400000;

// Pregătirea (proces separat, pe baza probei, înainte de pornirea serverului): soldul vechi din „Control costuri" (50 $ pe D-2) și unul
// mai vechi în locul unic (30 $ pe D-3) — la pornire câștigă cel mai nou; cheltuieli pe zile, pe Haiku 4.5 (1 $ la un milion de tokeni).
if (process.argv.indexOf('--faza=seed') >= 0) {
  process.env.TZ = 'UTC';
  (async () => {
    const db = require('./db');
    await db.initDb();
    const acum = Date.now(), azi0 = Date.parse(new Date(acum).toISOString().slice(0, 10) + 'T00:00:00Z');
    const zi = (n) => new Date(azi0 - n * ZI).toISOString().slice(0, 10);
    await db.setSetting('anthropic_sold', JSON.stringify({ usd: 30, la: azi0 - 3 * ZI + 3600000 }));
    await db.setSetting('anthropic_credit_usd', '50');
    await db.setSetting('anthropic_credit_date', zi(2));
    const pune = async (ms, tok) => db.pool.query("INSERT INTO ai_usage (company_id, kind, model, input_tokens, output_tokens, created_at) VALUES (NULL, 'proba_modele', 'claude-haiku-4-5', $1, 0, (to_timestamp($2 / 1000.0) AT TIME ZONE 'UTC'))", [tok, ms]);
    await pune(azi0 - 3 * ZI + 10 * 3600000, 5000000);   // D-3: 5 $, înainte de soldul de 50 $ (nu se scade)
    await pune(azi0 - 2 * ZI + 2 * 3600000, 2000000);    // D-2 (ziua scrierii): 2 $ după scriere — socoteala aplicației
    await pune(azi0 - 1 * ZI + 10 * 3600000, 1000000);   // D-1: 1 $ la noi, 3 $ la Anthropic → 3 $
    await pune(acum - 60000, 500000);                     // azi: 0,50 $ — socoteala aplicației
    console.log('SEED ' + JSON.stringify({ azi0, d1: zi(1), d2: zi(2), d3: zi(3) }));
    await db.closeDb();
    process.exit(0);
  })().catch((e) => { console.log('SEED-EROARE ' + ((e && e.stack) || e)); process.exit(1); });
  return;
}

const S0 = require('./sold_ai');
const A = require('./azi_la_noi');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 600) : '')); } };
const sect = (s) => console.log('\n' + s);
const P = (f) => path.join(__dirname, f);
const citeste = (f) => fs.readFileSync(P(f), 'utf8').replace(/\r\n/g, '\n');
const J = (x) => JSON.stringify(x);

sect('1. Regula (sold_ai.js)');
const CREDIT = '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';
T('refuzul: creditul terminat (400)', S0.felRefuz(400, CREDIT) === 'credit');
T('refuzul: limita de cheltuieli', S0.felRefuz(400, 'You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.') === 'limita');
T('refuzul: cheia respinsă (401)', S0.felRefuz(401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}') === 'cheie');
T('refuzul: contul oprit', S0.felRefuz(403, 'This organization has been disabled.') === 'cont');
T('NU sunt refuzuri: prea multe cereri, serverul ocupat, o cerere greșită', S0.felRefuz(429, 'rate_limit_error: Number of request tokens has exceeded your per-minute rate limit') === null &&
  S0.felRefuz(529, 'overloaded_error') === null && S0.felRefuz(400, 'messages: text content blocks must be non-empty') === null && S0.felRefuz(500, '') === null);
const TC = S0.TEXT_CLIENT + ' ' + S0.TEXT_REZUMAT + ' ' + S0.TEXT_POZA;
T('clientul nu află cauza (nici „credit", nici „Anthropic", nici „cheie"), doar că am fost anunțați', !/credit|anthropic|cheie|sold|limit/i.test(TC) && /echipa RA Track a fost anunțată/.test(S0.TEXT_CLIENT) && /butoane/.test(S0.TEXT_CLIENT), TC);
const ACUM = Date.parse('2026-11-04T12:00:00Z');
const ch = S0.cheltuitDeLa({ la: Date.parse('2026-10-31T09:00:00Z'), acum: ACUM,
  noi: { '2026-10-30': 9, '2026-10-31': 1, '2026-11-01': 2, '2026-11-02': 1, '2026-11-03': 0.5, '2026-11-04': 0.25 },
  real: { '2026-10-31': 7, '2026-11-01': 1.5, '2026-11-02': 3, '2026-11-04': 99 } });
T('cheltuit de la scriere: ziua scrierii și azi = aplicația; zilele încheiate = cea mai mare; înainte de scriere nu intră', Math.abs(ch.usd - (1 + 2 + 3 + 0.5 + 0.25)) < 1e-9 && ch.dinAnthropic === true, J(ch));
T('fără cifra Anthropic: doar aplicația', Math.abs(S0.cheltuitDeLa({ la: Date.parse('2026-11-02T00:00:00Z'), acum: ACUM, noi: { '2026-11-02': 1, '2026-11-03': 2 }, real: null }).usd - 3) < 1e-9);
T('ritmul: cea mai mare dintre aplicație (7 × 24 h) și Anthropic (ultimele 7 zile încheiate)', Math.abs(S0.ritmPeZi({ acum: ACUM, noi7: 7, real: { '2026-10-28': 7, '2026-11-03': 7, '2026-11-04': 70, '2026-10-20': 70 } }) - 2) < 1e-9 &&
  Math.abs(S0.ritmPeZi({ acum: ACUM, noi7: 21, real: { '2026-11-03': 7 } }) - 3) < 1e-9);
const so = S0.sold({ scris: 20, la: ACUM - 2 * ZI, acum: ACUM, noiPeZi: { '2026-11-02': 1, '2026-11-03': 2, '2026-11-04': 1 }, realPeZi: null, noi7: 14 });
T('soldul: 20 − 4 = 16 $, la 2 $ pe zi → 8 zile', so.usd === 16 && so.zile === 8 && so.peZi === 2 && so.reincarcare === null, J(so));
const sr = S0.sold({ scris: 6, la: ACUM - 2 * ZI, acum: ACUM, noiPeZi: { '2026-11-03': 4 }, realPeZi: null, noi7: 14, reincarcare: { sub: 5, cumpara: 20 } });
T('reîncărcarea automată: soldul ar fi trecut sub 5 $ → +20 $; „nu se termină" (fără zile)', sr.usd === 22 && sr.reincarcari === 1 && sr.zile === null && S0.pragSold(sr) === null, J(sr));
const cu = (zile, usd) => ({ usd: usd == null ? 10 : usd, zile, la: 1 });
T('pragurile: 15 → nimic, 14 → 14, 8 → 14, 7 → 7, 4 → 7, 3 → 3, 0 (dar mai sunt bani) → 3, terminat → 0, fără ritm → nimic',
  [S0.pragSold(cu(15)), S0.pragSold(cu(14)), S0.pragSold(cu(8)), S0.pragSold(cu(7)), S0.pragSold(cu(4)), S0.pragSold(cu(3)), S0.pragSold(cu(0)), S0.pragSold(cu(5, 0)), S0.pragSold(cu(null))].join() === ',14,14,7,7,3,3,0,', [S0.pragSold(cu(15)), S0.pragSold(cu(14)), S0.pragSold(cu(8)), S0.pragSold(cu(7)), S0.pragSold(cu(4)), S0.pragSold(cu(3)), S0.pragSold(cu(0)), S0.pragSold(cu(5, 0)), S0.pragSold(cu(null))].join());
T('o scădere direct la 3 zile nu mai anunță după aceea 7 sau 14', S0.cheiSold({ la: 5 }, 3).join() === '5|3,5|7,5|14' && S0.cheiSold({ la: 5 }, 0).length === 4 && S0.cheiSold({ la: 5 }, 14).join() === '5|14');
const as = S0.anuntSold({ usd: 6.2, scris: 50, la: ACUM - 9 * ZI, peZi: 1.2, zile: 5 }, 7, 4.6);
T('anunțul de 7 zile: titlul cu zilele, suma în dolari și în lei, ce e de făcut', as.titlu === 'Creditul Anthropic mai ajunge ~5 zile' && /~6,20 \$ \(≈ 29 lei\)/.test(as.text) && /Settings → Billing/.test(as.text) && as.nivel === 'warning', J(as));
T('…la 3 zile, „critical"; terminat: alt titlu', S0.anuntSold({ usd: 1, scris: 50, la: ACUM, peZi: 1, zile: 1 }, 3, 4.6).nivel === 'critical' && S0.anuntSold({ usd: 0, scris: 50, la: ACUM, zile: 0 }, 0, 4.6).titlu === 'Creditul Anthropic s-a terminat');
const fa = S0.firmeAproape([{ id: 1, name: 'Agro Nord', nume: 'Basic', folosite: 159, intrebari: 200 }, { id: 2, name: 'Bravo', nume: 'Pro', folosite: 450, intrebari: 600 }, { id: 3, name: 'Cargo', nume: 'Pro', folosite: 600, intrebari: 600 }, { id: 4, name: 'Delta', nume: 'Basic', folosite: 5, intrebari: 0 }]);
T('firmele la 80%: rotunjit ca bara din tabel (159 din 200 = 80%), 75% nu, cea mai sus întâi', fa.map((f) => f.name + ':' + f.pct).join() === 'Cargo:100,Agro Nord:80', J(fa));
T('anunțul firmei: 80% → „info"; 100% → „warning", „până pe 1 doar pe butoane"', S0.anuntIntrebari(fa[1]).titlu === 'RA Insight: Agro Nord a folosit 80% din întrebările lunii' &&
  S0.anuntIntrebari(fa[1]).text === '159 din 200 de întrebări (pachet Basic). La 100%, RA Insight trece pe butoane până pe 1.' && S0.anuntIntrebari(fa[0]).nivel === 'warning' && /doar pe butoane/.test(S0.anuntIntrebari(fa[0]).text), J(S0.anuntIntrebari(fa[1])));
const at = S0.atentieIntrebari(fa.concat([]));
T('„Ce cere atenție": doar cele între 80% și 99% (cele de la 100% au deja rândul lor)', at.length === 1 && at[0].id === 1 && /^\*\*Agro Nord\*\* a folosit 80% din întrebările lunii \(159 din 200 de întrebări, pachet Basic\)/.test(at[0].t), J(at));

// Anunțul pentru administratorul FIRMEI la 80% (13.11, Alin: „1. DA"): textele stau în pachete.js (clientul le citește).
const PK = require('./pachete');
const N13 = Date.UTC(2026, 10, 13, 10);
const aP = PK.anuntAproape({ cod: 'pro', nume: 'Pro', intrebari: 600, folosite: 480 }, N13);
T('administratorul firmei, la 80%: procentul ca bara (159 din 200 = 80%), pragul 80', PK.procentFolosit(159, 200) === 80 && PK.procentFolosit(0, 0) === 0 && PK.PROCENT_ANUNT_FIRMA === 80);
T('…Pro, 480 din 600: „au mai rămas 120 de întrebări în noiembrie", „info", când se reîncarcă, ce face la capăt, drumul spre un pachet mai mare',
  aP.nivel === 'info' && aP.titlu === 'RA Insight: au mai rămas 120 de întrebări în noiembrie' &&
  aP.text === 'Ați folosit 480 din cele 600 de întrebări ale pachetului Pro. Se reîncarcă pe 1 decembrie, fără niciun cost în plus. Dacă se termină înainte, RA Insight răspunde până atunci la întrebările de pe butoane: unde e o mașină, km, staționări, rapoarte. Pentru mai multe întrebări pe lună, puteți trece la un pachet mai mare, din „Vezi pachetele”.', J(aP));
const aB = PK.anuntAproape({ cod: 'business', intrebari: 1000, folosite: 812 }, N13);
T('…Business: „1.000", fără drum spre alt pachet (e cel mai mare)', /cele 1\.000 de întrebări ale pachetului Business\./.test(aB.text) && !/Vezi pachetele/.test(aB.text), J(aB));
T('…o singură rămasă: „a mai rămas 1 întrebare"', PK.anuntAproape({ cod: 'pro', intrebari: 600, folosite: 599 }, N13).titlu === 'RA Insight: a mai rămas 1 întrebare în noiembrie');
const aT = PK.anuntAproape({ cod: 'basic', intrebari: 200, folosite: 200 }, N13);
T('…sărit direct la capăt: „s-au terminat întrebările din noiembrie", „warning", până pe 1 pe butoane', aT.nivel === 'warning' && aT.titlu === 'RA Insight: s-au terminat întrebările din noiembrie' &&
  /^Ați folosit cele 200 de întrebări ale pachetului Basic\. Se reîncarcă pe 1 decembrie, fără niciun cost în plus\. Până atunci, RA Insight răspunde la întrebările de pe butoane/.test(aT.text), J(aT));
const aS = PK.anuntAproape({ cod: 'start', intrebari: 50, folosite: 40 }, N13);
T('…Start, 40 din 50: răspunsurile pe butoane, RA Insight nu mai răspunde la întrebări la capăt, drumul spre Basic', aS.titlu === 'RA Insight: au mai rămas 10 răspunsuri în noiembrie' &&
  /^Ați folosit 40 din cele 50 de răspunsuri pe butoane ale pachetului Start\./.test(aS.text) && /RA Insight nu mai răspunde la întrebări până atunci\./.test(aS.text) && /Cu Basic/.test(aS.text), J(aS));
T('…fără cuvintele noastre (gratuit, tokeni, fond, „nu se numără", „fără AI", adminul)', [aP, aB, aT, aS].every((a) => !/gratuit|token|\bfond|nu se num|nu se scade|fără AI|adminul/i.test(a.titlu + ' ' + a.text)));
const B0 = (o) => S0.banda(Object.assign({ cheie: true, leiPeDolar: 4.6, acum: ACUM }, o));
let b = B0({ sold: Object.assign({}, so, { zile: 30 }) });
T('banda: soldul la zi, cu lei, zilele și ritmul; spre „RA Insight · control"', b.nivel === 'ok' && b.randuri.length === 1 && b.randuri[0].text === '**Sold Anthropic, la zi: ~16,00 $** (≈ 74 lei) · ajunge ~30 de zile, la ~2,00 $ pe zi.' && b.tinta.tab === 'agents', J(b));
b = B0({ sold: so });
T('…sub 14 zile (aici 8): portocalie, cu ce e de făcut', b.nivel === 'w' && /Cumpărați credite din contul Anthropic \(Settings → Billing\)\.$/.test(b.randuri[0].text), J(b));
b = B0({ sold: Object.assign({}, so, { zile: 2 }) });
T('…la 3 zile și mai puțin: roșie', b.nivel === 'r');
T('…terminat: roșie, „s-a terminat"', B0({ sold: Object.assign({}, so, { usd: 0 }) }).randuri[0].text.indexOf('**Soldul Anthropic s-a terminat**') === 0);
T('…nescris: portocalie, „scrieți-l"', B0({ sold: null }).nivel === 'w' && /Soldul Anthropic nu e scris/.test(B0({ sold: null }).randuri[0].text));
T('…fără cheie: roșie', B0({ cheie: false }).nivel === 'r' && /Cheia Anthropic nu e pusă/.test(B0({ cheie: false }).randuri[0].text));
b = B0({ sold: so, refuz: { fel: 'credit', la: ACUM - 3600000, refuzate: 4 } });
T('…Anthropic refuză: roșie, cauza, de când, câte, ce e de făcut, clienții pe butoane', b.nivel === 'r' && b.randuri[0].text === '**Anthropic refuză întrebările: creditul s-a terminat.** De la azi, ' + A.ora(ACUM - 3600000) + ', 4 cereri refuzate. ' + S0.REFUZ.credit.ceFaci + ' ' + S0.PE_BUTOANE, J(b));
b = B0({ sold: sr });
T('…cu reîncărcarea automată: verde, „se reîncarcă singur"', b.nivel === 'ok' && /se reîncarcă singur, cu 20,00 \$, când scade sub 5,00 \$/.test(b.randuri[0].text), J(b));
b = B0({ sold: so, firme: fa });
T('…și firmele trecute de 80%: al doilea rând, portocaliu când una a ajuns la 100%', b.randuri.length === 2 && b.nivel === 'w' && b.randuri[1].text === '**Întrebările clienților:** 2 firme au trecut de 80% din întrebările lunii (una și-a terminat întrebările); cea mai aproape: Cargo (100%).', J(b));
T('…o singură firmă: numele, procentul, cât din cât, pachetul', B0({ sold: so, firme: [fa[1]] }).randuri[1].text === '**Întrebările clienților:** Agro Nord a folosit 80% din întrebările lunii (159 din 200 de întrebări, pachet Basic).');
const ct = S0.cartonas(so);
T('cartonașul din control: cifra și rândul de sub', ct.cifra === '~16,00 $' && /^ajunge ~8 zile · din 20,00 \$ scriși pe /.test(ct.sub) && S0.cartonas(null).sub === 'nescris', J(ct));
const pa = S0.panou({ sold: so, cheie: true, okLa: ACUM - 60000, adminCheie: false, luna: { anthropic: null, noi: 3.2 }, acum: ACUM, leiPeDolar: 4.6,
  peFel: [{ kind: 'asistent', calls: 3, input_tokens: 9000, output_tokens: 900, cost_usd: 0.4 }, { kind: 'insight', calls: 120, input_tokens: 1250000, output_tokens: 50000, cache_read_tokens: 3000000, cost_usd: 2.8 }] });
const kk = pa.randuri.map((r) => r.k);
T('blocul „Anthropic, la zi": soldul, cât mai ajunge, de unde vin cifrele, luna, tokenii, cheia, anunțurile', kk.join('|') === 'Sold, la zi|Cât mai ajunge|De unde vin cifrele|Luna asta|Tokeni luna asta|Cheia|Anunțurile' && !pa.alarma, kk.join('|'));
T('…fără cheia de administrare: „aplicația" și ce cheie ar aduce cifra lor', pa.randuri[2].v === 'aplicația' && /ANTHROPIC_ADMIN_KEY/.test(pa.randuri[2].s));
T('…tokenii adunați pe toate felurile („1,3 mil.")', pa.randuri[4].v === '1,3 mil. citiți · 50.900 scriși' && /^3 mil\. citiți din cache/.test(pa.randuri[4].s), pa.randuri[4].v + ' / ' + pa.randuri[4].s);
T('…pe ce s-au dus banii: cel mai scump întâi, cu numele pe înțeles', pa.peFel.map((x) => x.nume).join('|') === 'Întrebările clienților (RA Insight)|Asistentul nostru' && pa.peFel[0].cost === '2,80 $' && pa.peFel[0].cereri === '120 de cereri', J(pa.peFel));
const pr = S0.panou({ sold: so, cheie: true, refuz: { fel: 'cheie', la: ACUM - 120000, ultimaLa: ACUM - 60000, refuzate: 2 }, adminCheie: true, luna: { anthropic: 9.4, noi: 3 }, acum: ACUM, peFel: [] });
T('…cu refuzul: alarma sus și cheia „refuzată"; luna după Anthropic, cu diferența spusă', pr.alarma && pr.alarma.titlu === 'Anthropic nu primește cheia aplicației' && /2 cereri refuzate/.test(pr.alarma.text) && pr.randuri[5].v === 'refuzată' &&
  pr.randuri[3].v === '9,40 $ (Anthropic)' && /în afara aplicației/.test(pr.randuri[3].s), J(pr));
const tot = J([S0.REFUZ, TC, B0({ sold: so, firme: fa }), pa, as]);
T('textele: diacritice cu virgulă (ș, ț), fără sedilă', !/[şţŞŢ]/.test(tot));

sect('2. „Azi la noi"');
let r = A.randuri({ acum: ACUM, firma: { emitentLipsa: [] }, ai: { nivel: 'ok', randuri: [] } });
T('soldul NU mai e un rând: are banda lui (`ai`), dată mai departe', r.randuri.length === 0 && r.ai && r.ai.nivel === 'ok' && r.deVazutText === 'totul e în regulă' && typeof A.ZILE_SOLD === 'undefined', J(r));
r = A.randuri({ acum: ACUM, ai: { nivel: 'r', randuri: [{ text: 'x' }] } });
T('…banda roșie se numără la „de văzut", iar lista goală spune „Altceva nu cere atenție azi."', r.deVazut === 1 && r.deVazutText === '1 de văzut' && r.gol === 'Altceva nu cere atenție azi.', J(r));
T('…cea albastră (doar firmele la 80%) nu se numără', A.randuri({ acum: ACUM, ai: { nivel: 'b' } }).deVazut === 0);

sect('3. Pagina și stilurile');
const html = citeste('public/index.html'), css = citeste('public/css/app.css');
const blocAsf = html.slice(html.indexOf('// ── începe „asistentul fondatorilor" ──'), html.indexOf('// ── sfârșit „asistentul fondatorilor" ──'));
const fb = blocAsf.slice(blocAsf.indexOf('function bandaAi('), blocAsf.indexOf('function aziLaNoi('));
T('„Acasă": banda sub cele patru cifre, înainte de „Azi la noi"', /cifre\(b\.bub, lista\);\s*if \(j\.ai\) bandaAi\(b\.bub, j\.ai\);\s*aziLaNoi\(b\.bub, j\);/.test(blocAsf));
T('…textele de la server puse ca TEXT (textGros), clicul prin _asfDu, fără innerHTML cu textul serverului', fb.length > 200 && /textGros\(r\.text\)/.test(fb) && /window\._asfDu\(a\.tinta/.test(fb) && !/innerHTML = [^'"]*\b(a|r)\.(text|buton)/.test(fb), fb.slice(0, 300));
const ctl = html.slice(html.indexOf('function _aiuPachete(p)'), html.indexOf('window.raxLoadAiUsage = async function'));
T('control: cartonașul soldului din textele serverului (cifra, rândul de sub)', /esc\(sold\.cifra\)/.test(ctl) && /esc\(sold\.sub\)/.test(ctl) && ctl.indexOf("' de' : '') + ' zile'") < 0);
T('control: blocul „Anthropic, la zi" (_aiuBani), cu esc pe fiecare text, între cartonașe și „Ce cere atenție"', /function _aiuBani\(b\)/.test(html) && /_aiuPachete\(d\.pachete\)\s*\+ _aiuBani\(d\.bani\)\s*\+ _aiuAtentie\(d\.pachete, s, rows\)/.test(html) && /esc\(r\.k\)[\s\S]{0,80}esc\(r\.v\)[\s\S]{0,80}esc\(r\.s\)/.test(html));
T('control: firmele la 80–99% din `p.aproape` (de la server)', /\(Array\.isArray\(p\.aproape\) \? p\.aproape : \[\]\)\.forEach/.test(ctl));
T('un singur loc pentru sold: „Control costuri" nu mai scrie credite, deschide aceeași fereastră', html.indexOf('anthropic_credit_usd') < 0 && html.indexOf('raxSaveAnthropicCredit') < 0 && /raxAiSold\(raxOpenAnthropicDetail\)/.test(html) &&
  (html.match(/fetch\('\/api\/admin\/insight\/sold'/g) || []).length === 2, (html.match(/fetch\('\/api\/admin\/insight\/sold'/g) || []).length);
T('caseta din chat: la refuzul lui Anthropic (`faraModel`) fără „Vezi pachetele" — pe web și pe telefon', /if \(esteAdmin\(\) && !x\.faraModel\) \{ var bv = el\('button', 'chat-pas ins'\)/.test(html) && /faraModel: j\.faraModel \} \};\s*S\.mesaje\.push\(m\);/.test(html) &&
  /faraPachete: !!x\.faraModel/.test(citeste('mobile/src/lib/insight.ts')) && /l\.pachete && !faraPachete \?/.test(citeste('mobile/src/components/InsightBula.tsx')));
T('reîncărcarea automată se scrie pe aceeași rută (raxAiReincarcare → /api/admin/insight/sold)', /window\.raxAiReincarcare = async function/.test(html) && /reincarcare: nr\.length === 2/.test(html));
// Culorile: perechi pe ambele teme, măsurate (≥ 4,5 pe textul mic).
function rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); }
function lum(h) { return rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function varTema(nume, dark) {
  const re = dark ? /body\.dark\s*\{([^}]*)\}/g : /:root\s*\{([^}]*)\}/g;
  let m, v = null; while ((m = re.exec(css))) { const x = new RegExp('--' + nume + '\\s*:\\s*(#[0-9a-fA-F]{3,6})').exec(m[1]); if (x) v = x[1]; }
  return v;
}
const panLight = varTema('bg-panel', false), panDark = varTema('bg-panel', true), drkLight = varTema('bg-dark', false), drkDark = varTema('bg-dark', true);
T('culorile temelor se citesc din CSS', !!(panLight && panDark && drkLight && drkDark), [panLight, panDark, drkLight, drkDark].join());
if (panLight && panDark && drkLight && drkDark) {
  const perechi = [['„RA Insight · control ›" pe bandă (luminoasă)', '#166534', panLight], ['…întunecată', '#4ade80', panDark],
    ['cifra portocalie (luminoasă)', '#b45309', drkLight], ['…întunecată', '#fbbf24', drkDark], ['cifra roșie (luminoasă)', '#b91c1c', drkLight], ['…întunecată', '#f87171', drkDark]];
  perechi.forEach((p) => T('contrast ≥ 4,5: ' + p[0], contrast(p[1], p[2]) >= 4.5, contrast(p[1], p[2]).toFixed(2)));
}
T('stilurile: banda (.asf-ai) cu pereche pe tema întunecată și pe telefon; blocul (.aiu-bani)', /^\.asf-ai \{/m.test(css) && /body\.dark \.asf-ai \.sg \{ color: #4ade80; \}/.test(css) && /@media \(max-width: 600px\) \{ \.asf-ai \{/.test(css) &&
  /^\.aiu-bani \{/m.test(css) && /body\.dark \.aiu-bani-r\.warn \.v/.test(css) && /\.aiu-bani-r\.warn \.v \{ color: #b45309; \}/.test(css) && /\.aiu-bani-r\.bad \.v \{ color: #b91c1c; \}/.test(css));
const tel = citeste('mobile/src/components/insightBani.ts');
T('telefonul ia cartonașul soldului gata scris de server (sold.cifra / sold.sub)', /typeof sold\.sub === 'string'\) return sold\.sub/.test(tel) && /typeof sold\.cifra === 'string' \? sold\.cifra/.test(tel));

sect('4. Serverul (sursa)');
const SRV = citeste('server.js'), AIJ = citeste('ai.js');
T('ai.js: refuzul se recunoaște o dată, la sursa tuturor cererilor (_rawCall), cu felul pe eroare', /const fel = soldAi\.felRefuz\(res\.status, t\);\s*if \(fel\) \{ e\.refuzAnthropic = fel; _stare\(\{ refuz: fel/.test(AIJ) && /_stare\(\{ ok: true \}\);\s*return res\.json\(\);/.test(AIJ));
T('…verificarea cheii (lista modelelor, gratuit) și un singur ascultător', /async function verificaCheia\(\)/.test(AIJ) && (SRV.match(/ai\.setLaStare\(/g) || []).length === 1 && /ai\.setLaStare\(_dupaAnthropic\)/.test(SRV));
T('o socoteală a soldului: doar _soldAnthropic citește `anthropic_sold` (+ mutarea o dată), „Control costuri" o cheamă', (SRV.match(/getSetting\('anthropic_sold'\)/g) || []).length === 2 &&
  (SRV.match(/getSetting\('anthropic_credit_usd'\)/g) || []).length === 1 && /const so = await _soldAnthropic\(\);\s*res\.json\(Object\.assign\(\{\}, spend/.test(SRV) && SRV.indexOf("setSetting('anthropic_credit_usd'") < 0);
T('o socoteală a firmelor la 80%: _intrebariFirmeAi, în anunț, pe „Acasă" și în control', (SRV.match(/await _intrebariFirmeAi\(\)/g) || []).length === 3);
T('RA Insight: refuzul → reguli (fără să se numere), cu textul pentru client', /if \(e && e\.refuzAnthropic && !o\.proba\) \{[\s\S]{0,900}faraModel: soldAi\.TEXT_CLIENT/.test(SRV) && /if \(sp && !x\.faraModel\) pachetInfo = await _numaraRaspunsReguli/.test(SRV));
T('„Rezumă", citirea pozei, asistentul nostru: textul lor la refuz', /e\.refuzAnthropic\) \{ const rep = [\s\S]{0,120}soldAi\.TEXT_REZUMAT/.test(SRV) && /err\.refuzAnthropic \? soldAi\.TEXT_POZA/.test(SRV) && /asistentF\.eroareModel\(refuz \? soldAi\.textRefuz\(refuz\)/.test(SRV));
T('ceasurile: anunțurile la 15 minute; cheia la pornire și din oră în oră, în probe doar cu AI_VERIFICARE_LA_MS', /setInterval\(\(\) => soldAnuntTick\(\)\.catch\(\(\) => \{\}\), 15 \* 60 \* 1000\)/.test(SRV) && /process\.env\.AI_VERIFICARE_LA_MS\) \{\s*setTimeout\(\(\) => _verificaCheiaAnthropic\(\)/.test(SRV));
T('administratorul firmei la 80%: chemat din aceeași trecere de 15 minute, o socoteală cu a noastră, doar administratorii, o dată pe lună',
  /try \{ out\.admini = await anuntAdminiAproapeTick\(\); \}/.test(SRV) && /async function _intrebariFirmeAi\(\) \{ return \(await _folositeFirme\(\)\)\.filter/.test(SRV) &&
  /_incAnunta\(u\.id, f\.id, 'ai_intrebari_firma', a\.nivel, a\.titlu, a\.text, \{ pachet: true, procent: pct \}\)/.test(SRV) &&
  /filter\(function \(u\) \{ return pachete\.esteAdmin\(u\.role\); \}\)/.test(SRV) && /'ai_anunturi_admini'/.test(SRV));
T('„Stare producție": rândul cheii spune refuzul și soldul (textele benzii)', /add\('ai', 'Cheie AI \(Anthropic\)', 'crit', soldAi\.randSold\(/.test(SRV));

if (process.argv.indexOf('--fara-server') >= 0) { gata(); return; }

(async () => {
  try { await peServer(); } catch (e) { T('serverul: fără excepții', false, (e && e.stack) || e); }
  gata();
})();

function gata() {
  console.log('\n' + (rele ? '✗ ' + rele + ' picate, ' : '✓ ') + ok + ' trecute');
  process.exitCode = rele ? 1 : 0;
}

async function peServer() {
  sect('5. Pe server pornit (Anthropic simulat: mesajele, lista modelelor, costurile)');
  const os = require('os');
  const { spawn, spawnSync } = require('child_process');
  const { puneParola } = require('./test_parola');
  const PORT = 3623, TCP = 5623, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_sold_' + process.pid + '_' + Date.now());
  const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json', CHEIE = DIR + '_cheie.txt', COST = DIR + '_cost.json';
  // Anthropic simulat: mesajele dintr-o coadă ({ refuz: 'credit' | 'cheie' } = refuzul cu textul adevărat), lista modelelor după fișierul
  // CHEIE („buna" / „rea"), raportul de costuri din COST ({ zi: cenți }, doar zilele cerute). Orice altă rețea, oprită.
  fs.writeFileSync(PRELOAD, [
    "const fs = require('fs');", 'const orig = globalThis.fetch;',
    'const raspuns = (j, s) => new Response(JSON.stringify(j), { status: s || 200, headers: { "content-type": "application/json" } });',
    'globalThis.fetch = async function (url, opts) {', "  const u = String((url && url.url) || url);",
    "  if (u.indexOf('https://api.anthropic.com/v1/organizations/cost_report') === 0) {",
    "    const q = new URL(u), de = q.searchParams.get('starting_at'), pana = q.searchParams.get('ending_at');",
    "    let c = {}; try { c = JSON.parse(fs.readFileSync(process.env.PROBA_COST, 'utf8') || '{}'); } catch (e) {}",
    "    fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify({ cost: [de, pana] }) + '\\n');",
    "    const data = Object.keys(c).filter((z) => z + 'T00:00:00Z' >= de && z + 'T00:00:00Z' < pana).map((z) => ({ starting_at: z + 'T00:00:00Z', results: [{ amount: String(c[z]), currency: 'USD' }] }));",
    '    return raspuns({ data: data, has_more: false });', '  }',
    "  if (u.indexOf('https://api.anthropic.com/v1/models') === 0) {",
    "    let k = 'buna'; try { k = fs.readFileSync(process.env.PROBA_CHEIE, 'utf8').trim(); } catch (e) {}",
    "    if (k === 'rea') return raspuns({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);",
    "    return raspuns({ data: [], id: 'claude-haiku-4-5', capabilities: { server_tools: { web_search: { supported: true } } } });", '  }',
    "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
    "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
    "    fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify({ mesaj: true, model: corp.model }) + '\\n');",
    "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
    "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
    "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada));",
    "    if (r.refuz === 'credit') return raspuns({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }, 400);",
    "    if (r.refuz === 'cheie') return raspuns({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);",
    "    r.usage = { input_tokens: 100, output_tokens: 20 };",
    '    return raspuns(r);', '  }',
    "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
    '  return orig.apply(this, arguments);', '};'].join('\n'));
  fs.writeFileSync(AI_LOG, ''); fs.writeFileSync(AI_COADA, '[]'); fs.writeFileSync(CHEIE, 'buna');
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'sold-ai-proba',
    DEMO_DISABLED: 'true', PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false', EUR_RON_RATE: '5',
    ANTHROPIC_ADMIN_KEY: 'sk-ant-admin01-proba', PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA, PROBA_CHEIE: CHEIE, PROBA_COST: COST,
    GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  ['DATABASE_URL', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_VERIFICARE_LA_MS'].forEach((k) => delete env[k]);
  const curata = () => { for (const f of [PRELOAD, AI_LOG, AI_COADA, CHEIE, COST]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const seed = spawnSync(process.execPath, [__filename, '--faza=seed'], { cwd: __dirname, env, encoding: 'utf8', timeout: 240000 });
  const ms = /SEED (\{.*\})/.exec(seed.stdout || '');
  T('pregătirea: soldurile și cheltuielile sunt în bază', !!ms, String(seed.stdout || '').slice(-400) + String(seed.stderr || '').slice(-400));
  if (!ms) { curata(); return; }
  const SD = JSON.parse(ms[1]);
  // Anthropic: D-3 1 $, D-2 9 $ (toată ziua — dar e ziua scrierii: se ia socoteala aplicației), D-1 3 $ (mai mult decât aplicația: 1 $).
  fs.writeFileSync(COST, JSON.stringify({ [SD.d3]: 100, [SD.d2]: 900, [SD.d1]: 300 }));
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; srv.stderr.on('data', (d) => { err += d; });
  const sleep = (t) => new Promise((res) => setTimeout(res, t));
  const cere = async (m, u, ck, body) => { const res = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}), body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await res.json(); } catch (e) {} return { s: res.status, j }; };
  const login = async (u, p) => { const res = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return res.ok ? res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') : null; };
  const log = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const coada = (l) => fs.writeFileSync(AI_COADA, JSON.stringify(l));
  const anunturi = async (S, tip) => ((await cere('GET', '/api/notifications?limit=200', S)).j.notifications || (await cere('GET', '/api/notifications?limit=200', S)).j || []).filter((n) => n && n.type === tip);
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { pornit = (await fetch(B + '/api')).ok; } catch (e) {} if (!pornit) await sleep(500); }
    T('serverul pornește', pornit, err.slice(-600));
    if (!pornit) return;
    const S = await login('admin', 'test1234');
    T('fondatorul intră', !!S);
    await cere('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const leiPeDolar = require('./ai').USD_EUR * 5;

    // ── Soldul: mutat o dată din „Control costuri", la zi ──
    let u = await cere('GET', '/api/admin/ai-usage', S);
    const so1 = (u.j.pachete || {}).sold || {};
    T('soldul scris în „Control costuri" (50 $ pe D-2, mai nou) a trecut în locul unic, o dată', so1.scris === 50 && so1.la === SD.azi0 - 2 * ZI, J(so1));
    T('cheltuit de atunci: 2 $ (ziua scrierii, aplicația) + 3 $ (D-1, Anthropic — mai mult ca aplicația) + 0,50 $ (azi) = 5,50 $ → 44,50 $', so1.cheltuit === 5.5 && so1.usd === 44.5 && so1.dinAnthropic === true, J(so1));
    T('ritmul: Anthropic pe ultimele 7 zile încheiate (13 $ ÷ 7) bate aplicația (8,50 $ ÷ 7) → 23 de zile', Math.abs(so1.peZi - 13 / 7) < 0.0001 && so1.zile === 23, J(so1));
    T('…iar Anthropic a fost întrebat doar de zilele încheiate (până azi la 00:00)', log().some((x) => x.cost && x.cost[1] === new Date(SD.azi0).toISOString().replace(/\.\d{3}Z$/, 'Z')), J(log().filter((x) => x.cost)));
    T('cartonașul din control, gata scris', so1.cifra === '~44,50 $' && /^ajunge ~23 de zile · din 50,00 \$ scriși pe /.test(so1.sub || ''), J([so1.cifra, so1.sub]));
    const bani = u.j.bani || {};
    T('„Anthropic, la zi": de unde vin cifrele = Anthropic + aplicația; luna după Anthropic', (bani.randuri || [])[2] && bani.randuri[2].v === 'Anthropic + aplicația' && /\(Anthropic\)$/.test(bani.randuri[3].v), J(bani.randuri));
    T('…pe ce s-au dus banii (proba modelelor, din pregătire)', (bani.peFel || []).some((x) => x.nume === 'Proba modelelor'), J(bani.peFel));
    const cc = await cere('GET', '/api/admin/costs/anthropic', S);
    T('„Control costuri" arată ACELAȘI sold (nu o a doua socoteală)', cc.s === 200 && cc.j.soldRemaining === 44.5 && cc.j.sold && cc.j.sold.cifra === '~44,50 $' && cc.j.creditUsd === 50, J([cc.s, cc.j.soldRemaining, cc.j.creditUsd]));
    let a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('„Acasă": banda cu soldul la zi, în lei, zilele', a.s === 200 && a.j.ai && a.j.ai.nivel === 'ok' && a.j.ai.randuri[0].text === '**Sold Anthropic, la zi: ~44,50 $** (≈ ' + A.lei(44.5 * leiPeDolar) + ') · ajunge ~23 de zile, la ~1,86 $ pe zi.', J(a.j.ai));
    T('…și soldul nu mai e un rând în „Azi la noi"', !(a.j.randuri || []).some((x) => /Anthropic/.test(x.text)));

    // ── Clientul pe Basic ──
    const PAROLA = 'Str4da-Verde-2026';
    const co = (await cere('POST', '/api/companies', S, { name: 'Agro Nord SRL' })).j;
    await cere('POST', '/api/devices/import', S, { rows: [{ imei: '350000000077001', nume: 'Dacia Logan', nr_inmatriculare: 'B 77 AGR' }] });
    await cere('PUT', '/api/devices/350000000077001/company', S, { company_id: co.id });
    await cere('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
    const uC = (await cere('POST', '/api/users', S, { username: 'sef@agro.ro', full_name: 'Ion Agro', role: 'company_admin', company_id: co.id })).j;
    await puneParola(uC, PAROLA, B);
    const C = await login('sef@agro.ro', PAROLA);
    await cere('PUT', '/api/users/' + uC.id + '/ai-seat', S, { on: true });
    T('pregătire: firma pe Basic, administratorul cu cont RA Insight', !!(co.id && C));
    // Un manager al aceleiași firme: anunțul de 80% e doar al administratorilor (13.11).
    const uM = (await cere('POST', '/api/users', S, { username: 'disp@agro.ro', full_name: 'Dan Agro', role: 'manager', company_id: co.id })).j;
    await puneParola(uM, PAROLA, B);
    const M = await login('disp@agro.ro', PAROLA);
    const folosite = async () => ((await cere('GET', '/api/ai/quota', C)).j || {}).used;
    const f0 = await folosite();

    // ── Anthropic refuză: creditul terminat ──
    coada([{ refuz: 'credit' }]);
    const q1 = await cere('POST', '/api/insight/intreaba', C, { message: 'Spune-mi ceva interesant despre flota mea, te rog.', nou: true });
    T('clientul NU primește o eroare: răspuns pe reguli, cu textul fără cauză deasupra', q1.s === 200 && q1.j.source === 'reguli' && q1.j.pachetMesaj === S0.TEXT_CLIENT && String(q1.j.reply || '').indexOf(S0.TEXT_CLIENT) === 0 && !/credit|Anthropic/i.test(q1.j.reply), q1.s + ' ' + J(q1.j).slice(0, 300));
    T('…și nu i se numără (e vina noastră), iar caseta nu-l trimite la pachete (`faraModel`)', (await folosite()) === f0 && q1.j.faraModel === true && !q1.j.limita, f0 + ' ' + J([q1.j.faraModel, q1.j.limita]));
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('noi aflăm pe loc: banda roșie pe „Acasă", cu cauza și ce e de făcut', a.j.ai && a.j.ai.nivel === 'r' && /^\*\*Anthropic refuză întrebările: creditul s-a terminat\.\*\* De la azi, \d{2}:\d{2}, 1 cerere refuzată\./.test(a.j.ai.randuri[0].text) && a.j.deVazut >= 1, J(a.j.ai));
    let an = await anunturi(S, 'ai_refuz');
    T('…și un anunț (în aplicație + telefon), „critical"', an.length === 1 && an[0].severity === 'critical' && an[0].title === 'Anthropic refuză întrebările: creditul s-a terminat', J(an));
    coada([{ refuz: 'credit' }]);
    const q2 = await cere('POST', '/api/insight/intreaba', C, { message: 'De ce a crescut consumul la B 77 AGR?', nou: true });
    T('a doua întrebare refuzată: tot pe reguli, fără al doilea anunț (cel mult unul la 6 ore)', q2.s === 200 && q2.j.source === 'reguli' && (await anunturi(S, 'ai_refuz')).length === 1, q2.s + ' ' + J(q2.j).slice(0, 200));
    u = await cere('GET', '/api/admin/ai-usage', S);
    T('„RA Insight · control": alarma sus, cu cele 2 cereri refuzate', u.j.bani && u.j.bani.alarma && /2 cereri refuzate/.test(u.j.bani.alarma.text) && u.j.bani.randuri.find((x) => x.k === 'Cheia').v === 'refuzată', J(u.j.bani && u.j.bani.alarma));
    const h = await cere('GET', '/api/admin/health', S);
    const ra = (h.j.checks || []).find((x) => x.key === 'ai');
    T('„Stare producție": rândul cheii, roșu, cu cauza', ra && ra.level === 'crit' && /creditul s-a terminat/.test(ra.detail), J(ra));
    coada([{ refuz: 'credit' }]);
    const rz = await cere('POST', '/api/ai/report-summary', C, { type: 'utilization', report: { columns: ['Vehicul', 'Km'], rows: [['B 77 AGR', '47 km'], ['B 78 AGR', '12 km']] } });
    T('„Rezumă cu RA Insight" la refuz: rezumatul pe reguli, cu textul pentru client', rz.s === 200 && rz.j.reguli === true && String(rz.j.summary || '').indexOf(S0.TEXT_REZUMAT) === 0 && /59 km/.test(rz.j.summary), rz.s + ' ' + J(rz.j).slice(0, 200));
    coada([{ refuz: 'credit' }]);
    const as1 = await cere('POST', '/api/admin/asistent/intreaba', S, { text: 'Ce părere ai despre piața GPS din România?' });
    T('asistentul nostru: fondatorul află cauza și ce e de făcut', as1.s === 200 && String(as1.j.text || '').indexOf(S0.REFUZ.credit.scurt + ' ' + S0.REFUZ.credit.ceFaci) === 0, J(as1.j).slice(0, 300));

    // ── Revenirea ──
    coada([{ content: [{ type: 'text', text: 'Flota merge bine.' }], stop_reason: 'end_turn' }]);
    const q3 = await cere('POST', '/api/insight/intreaba', C, { message: 'Spune-mi ceva interesant despre flota mea, te rog.', nou: true });
    T('primul răspuns bun: RA Insight răspunde iar cu AI', q3.s === 200 && q3.j.source === 'ai' && /Flota merge bine/.test(q3.j.reply || ''), q3.s + ' ' + J(q3.j).slice(0, 200));
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    an = await anunturi(S, 'ai_refuz_gata');
    T('…alarma se stinge singură (banda revine la sold) și ne anunță o dată', a.j.ai && a.j.ai.nivel === 'ok' && an.length === 1 && /Refuzate între timp: 4 cereri/.test(an[0].body || ''), J([a.j.ai, an]));

    // ── Cheia respinsă (după o schimbare de chei) ──
    fs.writeFileSync(CHEIE, 'rea');
    const v1 = (await cere('POST', '/api/test/ceasuri', S, { cheie: true })).j.cheie || {};
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('verificarea cheii (lista modelelor): cheia respinsă → banda roșie, „Anthropic nu primește cheia aplicației"', v1.ok === false && v1.fel === 'cheie' && a.j.ai.nivel === 'r' && /Anthropic nu primește cheia aplicației/.test(a.j.ai.randuri[0].text), J([v1, a.j.ai]));
    T('…anunțul cheii (fel nou: pe loc)', (await anunturi(S, 'ai_refuz')).some((x) => x.title === 'Anthropic nu primește cheia aplicației'));
    fs.writeFileSync(CHEIE, 'buna');
    await cere('POST', '/api/test/ceasuri', S, { cheie: true });
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('cheia bună din nou: alarma cheii se stinge la verificare', a.j.ai.nivel === 'ok', J(a.j.ai));

    // ── Anunțurile: soldul la 14 / 7 / 3 zile ──
    await cere('PUT', '/api/admin/insight/sold', S, { usd: 20 });   // 20 $ la 13 / 7 $ pe zi ≈ 1,86 → 10 zile
    let t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j.sold || {};
    an = await anunturi(S, 'ai_sold');
    T('soldul nou de 20 $ (~10 zile): anunțul de 14 zile, o dată', t1.sold === 14 && an.length === 1 && /^Creditul Anthropic mai ajunge ~10 zile$/.test(an[0].title) && an[0].severity === 'warning', J([t1, an]));
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j.sold || {};
    T('…a doua trecere nu-l repetă', t1.sold == null && (await anunturi(S, 'ai_sold')).length === 1, J(t1));
    await cere('PUT', '/api/admin/insight/sold', S, { usd: 4 });     // ~2 zile
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j.sold || {};
    T('soldul de 4 $ (~2 zile): anunțul de 3 zile, „critical"', t1.sold === 3 && (await anunturi(S, 'ai_sold')).some((x) => x.severity === 'critical'), J(t1));
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('…și banda roșie pe „Acasă", cu ce e de făcut', a.j.ai.nivel === 'r' && /Cumpărați credite din contul Anthropic/.test(a.j.ai.randuri[0].text), J(a.j.ai));

    // ── Reîncărcarea automată ──
    const re0 = await cere('PUT', '/api/admin/insight/sold', S, { reincarcare: { sub: 'x', cumpara: 20 } });
    T('reîncărcarea: sume greșite → 400', re0.s === 400);
    const re1 = await cere('PUT', '/api/admin/insight/sold', S, { reincarcare: { sub: 5, cumpara: 20 } });
    T('reîncărcarea pornită (sub 5 $ cumpără 20 $): soldul de 4 $ devine 24 $, „se reîncarcă singur"; soldul scris rămâne', re1.s === 200 && re1.j.sold && re1.j.sold.usd === 24 && re1.j.sold.reincarcari === 1 && re1.j.sold.zile === null && re1.j.sold.scris === 4, J(re1.j.sold));
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('…banda verde, fără anunțuri de zile', a.j.ai.nivel === 'ok' && /se reîncarcă singur/.test(a.j.ai.randuri[0].text) && ((await cere('POST', '/api/test/ceasuri', S, { sold: true })).j.sold || {}).sold == null, J(a.j.ai));
    await cere('PUT', '/api/admin/insight/sold', S, { reincarcare: null });
    T('…oprită (null): soldul revine la 4 $', ((await cere('GET', '/api/admin/ai-usage', S)).j.pachete.sold || {}).usd === 4);

    // ── Firmele la 80% / 100% din întrebări ──
    for (let i = 0; i < 160; i++) await cere('POST', '/api/test/ai-usage', S, { companyId: co.id, userId: uC.id, kind: 'insight' });
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j;
    an = await anunturi(S, 'ai_intrebari');
    T('Agro Nord la 81% (161 din 200: 160 de probă + întrebarea bună de mai sus; cele refuzate nu se numără): anunțul de 80%, „info"', (t1.sold || {}).firme && t1.sold.firme.length === 1 && an.length === 1 && an[0].title === 'RA Insight: Agro Nord SRL a folosit 81% din întrebările lunii' && an[0].severity === 'info', J([t1.sold, an]));
    // Administratorul firmei (13.11): UN anunț, în contul lui; nici la noi, nici la manager. În primele ore din 1 ale lunii (ora
    // României), cât baza numără încă luna trecută (UTC), anunțul așteaptă — proba merge pe ceasul adevărat.
    const golLuna = PK.ziuaRo(Date.now()).luna !== new Date().getUTCMonth() + 1;
    const luna = PK.reincarcare(Date.now()).luna;
    let anC = await anunturi(C, 'ai_intrebari_firma');
    if (golLuna) T('(primele ore din 1 ale lunii: anunțul administratorului așteaptă)', !((t1.sold || {}).admini || []).length && !anC.length, J(anC));
    else {
      T('administratorul firmei: anunțul lui, la 81% — „au mai rămas 39 de întrebări", „info", clic → „Pachet și conturi"', ((t1.sold || {}).admini || []).length === 1 && t1.sold.admini[0].id === co.id && t1.sold.admini[0].admini === 1 &&
        anC.length === 1 && anC[0].title === 'RA Insight: au mai rămas 39 de întrebări în ' + luna && anC[0].severity === 'info' && /^Ați folosit 161 din cele 200 de întrebări ale pachetului Basic\./.test(anC[0].body) &&
        ((typeof anC[0].data === 'string' ? JSON.parse(anC[0].data) : anC[0].data) || {}).pachet === true, J([t1.sold && t1.sold.admini, anC]));
    }
    T('…nu ajunge la noi și nici la managerul firmei', !(await anunturi(S, 'ai_intrebari_firma')).length && !!M && !(await anunturi(M, 'ai_intrebari_firma')).length);
    a = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('…pe „Acasă", al doilea rând al benzii', a.j.ai.randuri[1] && /^\*\*Întrebările clienților:\*\* Agro Nord SRL a folosit 81% din întrebările lunii \(161 din 200 de întrebări, pachet Basic\)\.$/.test(a.j.ai.randuri[1].text), J(a.j.ai));
    u = await cere('GET', '/api/admin/ai-usage', S);
    T('…în „Ce cere atenție" (control), cu firma de deschis', (u.j.pachete.aproape || []).length === 1 && u.j.pachete.aproape[0].id === co.id, J(u.j.pachete.aproape));
    for (let i = 0; i < 40; i++) await cere('POST', '/api/test/ai-usage', S, { companyId: co.id, userId: uC.id, kind: 'insight' });
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j;
    an = await anunturi(S, 'ai_intrebari');
    T('la 100%: al doilea anunț, „warning"; a treia trecere nu mai anunță', an.length === 2 && an.some((x) => /și-a terminat întrebările lunii/.test(x.title) && x.severity === 'warning') &&
      !(((await cere('POST', '/api/test/ceasuri', S, { sold: true })).j.sold || {}).firme || []).length, J(an));
    T('…și iese din „Ce cere atenție" la 80–99% (are rândul lui de 100%)', !((await cere('GET', '/api/admin/ai-usage', S)).j.pachete.aproape || []).length);
    T('administratorul firmei: tot un singur anunț în lună (nu și la 100%)', (await anunturi(C, 'ai_intrebari_firma')).length === (golLuna ? 0 : 1));
    // Pe Start: răspunsurile pe butoane (50). 39 = 78% → nimic; 40 = 80% → anunțul, cu drumul spre Basic.
    const coS = (await cere('POST', '/api/companies', S, { name: 'Start Mic SRL' })).j;
    const uS = (await cere('POST', '/api/users', S, { username: 'sef@startmic.ro', full_name: 'Ana Start', role: 'company_admin', company_id: coS.id })).j;
    await puneParola(uS, PAROLA, B);
    const CS = await login('sef@startmic.ro', PAROLA);
    await cere('POST', '/api/test/ai-reguli', S, { companyId: coS.id, userId: uS.id, n: 39 });
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j;
    T('Start, 39 din 50 (78%): niciun anunț', !!CS && !((t1.sold || {}).admini || []).length && !(await anunturi(CS, 'ai_intrebari_firma')).length, J(t1.sold && t1.sold.admini));
    await cere('POST', '/api/test/ai-reguli', S, { companyId: coS.id, userId: uS.id, n: 1 });
    t1 = (await cere('POST', '/api/test/ceasuri', S, { sold: true })).j;
    const anS = await anunturi(CS, 'ai_intrebari_firma');
    T('Start, 40 din 50 (80%): „au mai rămas 10 răspunsuri", cu drumul spre Basic', golLuna ? !anS.length : (anS.length === 1 && anS[0].title === 'RA Insight: au mai rămas 10 răspunsuri în ' + luna && /Cu Basic/.test(anS[0].body)), J(anS));

    // ── Drepturile ──
    T('clientul nu scrie soldul și nu vede banii (403)', (await cere('PUT', '/api/admin/insight/sold', C, { usd: 1 })).s === 403 && (await cere('GET', '/api/admin/ai-usage', C)).s === 403);
    T('clientul nu primește banda (doar fondatorii)', (await cere('GET', '/api/admin/azi-la-noi', C)).s === 403);
    T('serverul a rămas fără erori', !/TypeError|ReferenceError|is not a function/.test(err), err.slice(-500));
  } finally {
    srv.kill();
    await new Promise((res) => setTimeout(res, 300));
    curata();
  }
}
