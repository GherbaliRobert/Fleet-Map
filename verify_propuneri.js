// verify_propuneri.js — Pasul 2 al Capitolului 2, partea 2 (Alin, 23.10: „da"): „RA Insight face, cu Da-ul tău" — ALERTA DE
// VITEZĂ și „AM VORBIT CU EL". Ce apără:
//   1. regula (propuneri.js, curată): ce e o cerere de alertă / de discuție și ce nu (o întrebare, un raport, timpul trecut),
//      pragul (fără cifrele din numărul sau numele mașinii), „din ultimele 30 de zile" cu regula MOTORULUI de alerte (pragul +
//      marja, o dată la 5 minute pe mașină), cartonașele și textele;
//   2. pagina: cartonașul din rândurile serverului, „Schimbă" / „Lasă cum era", O cerere pentru „Da", butoanele spre Alerte și
//      RA Drive, textele ca TEXT;
//   3. serverul: calea ecranului (db.createAlert pe firma omului; db.adaugaDiscutieSafeDrive), drepturile ecranului pe fiecare
//      fel (`_poateActiunea`), întâia în RA Insight, fără model și fără numărătoare;
//   4. pe server pornit (modelul simulat: orice cerere către el se numără și trebuie să rămână ZERO): propunerea, „Da",
//      „Schimbă", „Nu", „Anulează" (10 minute), drepturile, pachetul, conversația redeschisă.
//
//   node verify_propuneri.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const insight = require('./insight');
const propuneri = require('./propuneri');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const SRV = citeste('server.js'), PAG = citeste('public/index.html'), CSS = citeste('public/css/app.css'), MOD = citeste('propuneri.js');

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Regula (propuneri.js, fără server)');
const fisa = insight.fisaFlotei([
  { imei: '1', name: 'Dacia Logan 3', plate: 'B 154 UIP', group_name: 'Autoturisme' },
  { imei: '2', name: 'VW Caddy', plate: 'B 268 ROY', group_name: 'Dube' },
  { imei: '3', name: 'Iveco Daily 35', plate: 'B 112 RFG', group_name: 'Dube' },
  { imei: '4', name: 'MAN TGX', plate: 'B 77 TIR', group_name: 'Camioane' }], {});
const A = (t) => propuneri.cerereAlerta(t, fisa);
const r1 = A('Anunță-mă când Loganul trece de 130 km/h.');
T('„Anunță-mă când Loganul trece de 130 km/h." → alertă de viteză, 130, pe Logan', r1 && r1.tip === 'overspeed' && r1.prag === 130 && r1.imei === '1', JSON.stringify(r1));
T('„Pune o alertă de viteză pe B 154 UIP: peste 120!" → 120, nu 154 (cifrele numărului ies din text)', (function (x) { return x && x.prag === 120 && x.imei === '1'; })(A('Pune o alertă de viteză pe B 154 UIP: peste 120!')));
T('„Fă-mi o alertă la 100 km/h pentru Iveco Daily 35" → 100, nu 35 (nici cifrele numelui)', (function (x) { return x && x.prag === 100 && x.imei === '3'; })(A('Fă-mi o alertă la 100 km/h pentru Iveco Daily 35')));
T('„Alertează-mă dacă vreo mașină depășește 110 km/oră" → toată flota', (function (x) { return x && x.prag === 110 && x.toataFlota === true; })(A('Alertează-mă dacă vreo mașină depășește 110 km/oră')));
T('o grupă („grupa Dube") → de ales între mașinile ei (o alertă e pe o mașină sau pe toată flota)', (function (x) { return x && x.variante && x.variante.map((v) => v.nr).join() === 'B 268 ROY,B 112 RFG'; })(A('Anunță-mă când grupa Dube trece de 100 km/h')));
T('fără mașină → „Pe ce mașină?"; fără prag → întreabă pragul; pragul în afara 30–250 → spus pe față', A('Vreau să știu când mașina merge cu peste 90').lipsa === 'masina' && A('Anunță-mă când Iveco Daily 35 trece de viteză').prag === null &&
  A('Anunță-mă când loganul trece de 300 km/h').pragGresit === 300);
T('alt fel de alertă (zonă, combustibil, ralanti) → recunoscută, dar se pune din Alerte', A('Anunță-mă când B 268 ROY intră în zona Depozit').altTip === 'zona' && A('Pune o alertă pentru furt de combustibil la Caddy').altTip === 'combustibil' &&
  A('Anunță-mă când Loganul stă cu motorul pornit').altTip === 'ralanti' && /Management › Alerte › Adaugă regulă/.test(propuneri.textAltTip('zona')));
T('NU sunt cereri: o întrebare, timpul trecut, un raport, o cerere de șofer', A('Câte alerte de viteză a avut Loganul luna asta?') === null && A('Anunță-mă când a trecut de 130 Loganul') === null &&
  A('Fă-mi raportul alertelor pe săptămâna trecută') === null && A('Pune-l pe Mihai pe B 77 TIR') === null && A('Ce viteză maximă a avut Loganul?') === null);
const soferi = [{ id: 1, nume: 'Ion Popescu' }, { id: 2, nume: 'Mihai Ionescu' }, { id: 3, nume: 'Ion Marin' }];
const D = (t) => propuneri.cerereDiscutie(t, soferi);
T('„Notează că am vorbit cu Ion Popescu despre viteză." → discuția cu Ion Popescu, „viteză"', (function (x) { return x && x.soferId === 1 && x.despre === 'viteză'; })(D('Notează că am vorbit cu Ion Popescu despre viteză.')));
T('„Am vorbit cu Mihai despre frânările bruște" (spus pe față) → Mihai, „frânările bruște"', (function (x) { return x && x.soferId === 2 && x.despre === 'frânările bruște'; })(D('Am vorbit cu Mihai despre frânările bruște')));
T('„Am vorbit cu Ion…" (doi Ion) → de ales; „Notează discuția cu Ion Marin, legat de ralanti" → Ion Marin', (D('Am vorbit cu Ion despre viteză').ambigui || []).length === 2 && D('Notează discuția cu Ion Marin, legat de ralanti').soferId === 3);
T('NU e cerere: „Ce s-a schimbat de când am vorbit cu Mihai?" (o întrebare: o analizează RA Insight)', D('Ce s-a schimbat de când am vorbit cu Mihai?') === null && D('Cum a condus Ion după ce am vorbit cu el?') === null);
// „Din ultimele 30 de zile", cu regula motorului: pragul 130 + marja 10 → sună peste 140; o dată la 5 minute pe mașină.
const marja = { baza: 50, marja: 10 }, t0 = Date.parse('2026-10-14T14:00:00Z');
const pts = [{ imei: 'a', t: t0, v: 145 }, { imei: 'a', t: t0 + 60000, v: 147 }, { imei: 'a', t: t0 + 6 * 60000, v: 142 }, { imei: 'a', t: t0 + 86400000, v: 141 }, { imei: 'b', t: t0 + 120000, v: 150 }, { imei: 'a', t: t0 + 2 * 86400000, v: 140 }];
const sim = propuneri.simuleazaViteza(pts, 130, marja);
T('ar fi sunat de 4 ori, pe 2 mașini: peste 140 (pragul + marja), cel mult o dată la 5 minute pe mașină (147 la un minut după 145 nu sună; 140 fix nu sună)', sim.ori === 4 && sim.masini === 2 && sim.efectiv === 140 && sim.peMasina.a === 3, JSON.stringify(sim));
T('pragul efectiv nu coboară sub baza motorului (un prag de 30 sună tot peste 60)', propuneri.pragEfectiv(30, marja) === 60 && propuneri.pragEfectiv(130, marja) === 140);
const opt = [{ v: 'a', t: 'B 154 UIP · Dacia Logan 3', scurt: 'B 154 UIP' }, { v: 'b', t: 'B 268 ROY · VW Caddy', scurt: 'B 268 ROY' }, { v: '', t: 'Toată flota', scurt: 'toată flota' }];
const card = propuneri.cardAlerta({ prag: 130, imei: 'a', optiuni: opt, sim: propuneri.simuleazaViteza(pts.filter((p) => p.imei === 'a'), 130, marja), max: { v: 147, t: t0 + 60000, unde: 'Autostrada A2, Fundulea' }, marja, poate: true, cine: 'Ana Pop', acum: Date.parse('2026-10-23T10:00:00Z') });
T('cartonașul alertei (macheta M3): Ce urmăresc / Peste / Pe / Numele alertei, „Da, pune alerta"', card.titlu === 'Pun o alertă de viteză' && card.randuri.map((r) => r.l + '=' + r.v).join(' | ') === 'Ce urmăresc=Depășire viteză | Peste=130 km/h | Pe=B 154 UIP · Dacia Logan 3 | Numele alertei=Viteză peste 130 — B 154 UIP' && card.butonDa === 'Da, pune alerta' && card.ic === 'fa-bell', JSON.stringify(card.randuri));
T('…„Din ultimele 30 de zile": cât ar fi sunat, cea mai mare viteză cu ziua, ora și locul, marja spusă pe față, cui ajunge', card.dovT === 'Din ultimele 30 de zile' &&
  card.dovezi[0].text === 'Ar fi sunat de 3 ori. Cea mai mare viteză: 147 km/h, pe 14.10, la 17:01, Autostrada A2, Fundulea.' &&
  card.dovezi[1].text === 'Ca toate alertele de viteză din aplicație, sună cu 10 km/h peste prag: când trece de 140 km/h.' && card.dovezi[2].text === 'Ajunge la cei care primesc azi alertele firmei, ca orice altă alertă.', JSON.stringify(card.dovezi));
T('…jos, calea ecranului și jurnalul; fără drept, cine aprobă', /^Se face exact ca din Management › Alerte › Adaugă regulă, cu drepturile tale\. În jurnal: „Ana Pop, prin RA Insight”\./.test(card.sub) &&
  propuneri.cardAlerta({ prag: 130, imei: 'a', optiuni: opt, sim: { ori: 0 }, marja, poate: false, aproba: 'administratorul firmei, Ana Pop' }).sub === 'Doar cine poate schimba alertele apasă „Da": administratorul firmei, Ana Pop.');
const des = propuneri.cardAlerta({ prag: 60, imei: 'a', optiuni: opt, sim: { ori: 420, masini: 1 }, max: { v: 118, t: t0 }, marja, poate: true, acum: Date.now() });
T('o alertă care ar suna des o spune („cam 14 anunțuri pe zi"); una care n-ar fi sunat spune și asta', des.dovezi.some((d) => d.text === 'Asta înseamnă cam 14 anunțuri pe zi. Un prag mai mare sună mai rar.') &&
  propuneri.cardAlerta({ prag: 130, imei: 'a', optiuni: opt, sim: { ori: 0, masini: 0 }, max: { v: 118, t: t0 }, marja, acum: Date.now() }).dovezi[0].text === 'N-ar fi sunat niciodată. Cea mai mare viteză: 118 km/h, pe 14.10, la 17:00.');
const ch = propuneri.campuriAlerta({ prag: '120', imei: '', nume: card.campuri.nume }, card), ch2 = propuneri.campuriAlerta({ prag: 120, imei: 'b', nume: 'Caddy prea repede' }, card);
T('„Schimbă": pragul și mașina noi; numele pus de aplicație se reface, cel scris de om rămâne', ch.spec.imei === null && ch.spec.condition.maxSpeed === 120 && ch.spec.name === 'Viteză peste 120 — toată flota' && ch2.spec.name === 'Caddy prea repede' && ch2.spec.imei === 'b' && ch.spec.type === 'overspeed' && ch.spec.enabled === true);
T('…pragul în afara 30–250, cu zecimale sau o mașină care nu e pe cartonaș → refuzat, cu motivul', /între 30 și 250/.test(propuneri.campuriAlerta({ prag: 500 }, card).eroare) && /între 30 și 250/.test(propuneri.campuriAlerta({ prag: '12.5' }, card).eroare) &&
  propuneri.campuriAlerta({ imei: 'zzz' }, card).eroare === 'Mașina aleasă nu e printre cele de pe cartonaș.');
const g = propuneri.gataAlerta(ch2.spec, 'Ana Pop', Date.parse('2026-10-23T07:42:00Z'));
T('după „Da": „Gata. Alerta **…** e pornită de azi, 10:42.", jurnalul, butonul spre Alerte', g.text === 'Gata. Alerta **Caddy prea repede** e pornită de azi, 10:42.' && /^În jurnal: „Ana Pop, prin RA Insight: alerta Caddy prea repede” · 23\.10\.2026, 10:42\./.test(g.jurnal) && g.buton.fel === 'ecran' && g.buton.ecran === 'alerts');
const cd = propuneri.cardDiscutie({ sofer: { id: 7, nume: 'Ion Popescu' }, despre: 'viteză', rd: { km: 1240, manevre: 38, laSuta: 3.1, cost: { total: 41.4 }, fata: { fel: 'atentie', text: '+12%' }, discutie: { zi: '2026-10-02', nota: 'frâne', comparatie: { text: 'De atunci, cu 20% mai puține manevre bruște la 100 km.' } } }, poate: true, cine: 'Ana Pop', acum: Date.parse('2026-10-23T10:00:00Z') });
T('cartonașul discuției: Șoferul / Când / Despre, „Da, notează", cifrele lui din RA Drive și ultima discuție', cd.titlu === 'Notez că ai vorbit cu Ion Popescu' && cd.randuri.map((r) => r.l + '=' + r.v).join(' | ') === 'Șoferul=Ion Popescu | Când=azi, din clipa în care apeși Da | Despre=viteză' &&
  cd.dovezi[0].text === 'Luna asta: 1.240 km, 38 de manevre bruște (3,1 la 100 km), 41 de lei în plus (+12% față de luna trecută).' && /^Ultima discuție notată: pe 02\.10 — „frâne”\./.test(cd.dovezi[1].text) &&
  cd.dovezi[2].text === 'De azi, RA Drive compară cum a condus în cele 30 de zile de dinainte și de după discuție.' && cd.butonDa === 'Da, notează' && /Șoferul nu primește niciun mesaj\.$/.test(cd.sub), JSON.stringify(cd.dovezi));
T('…fără RA Drive gata: o spune („încă pregătește luna"), nu inventează cifre', propuneri.cardDiscutie({ sofer: { id: 7, nume: 'Ion' }, pregatire: true }).dovezi[0].text === 'RA Drive încă pregătește luna: discuția se notează oricum.');
T('„Anulează" spune ce a scos (sau că nu mai era); după 10 minute, unde se schimbă', propuneri.anulareAlerta({ name: 'X' }, true) === 'Am anulat: alerta „X” nu mai există.' && propuneri.anulareDiscutie(cd, false) === 'Discuția cu Ion Popescu nu mai era în RA Drive, deci n-am avut ce scoate.' &&
  propuneri.dupaAnulare('alerta') === 'o oprești sau o ștergi din Management › Alerte, ca de obicei.' && propuneri.dupaAnulare('sofer') === 'schimbi din fișa mașinii, ca de obicei.');
T('modulul e curat: fără bază, fără server, fără model, fără formatatoare noi', !/require\('\.\/(db|server|ai)'\)/.test(MOD) && !/callClaude|runAgent|fetch\(/.test(MOD) && !/new Intl\.DateTimeFormat\(/.test(MOD));
T('butoanele de alegere scriu cereri pe care regula le înțelege din nou (o mașină, un prag, un șofer)', A(propuneri.cerereText('B 268 ROY', 110)).imei === '2' && A(propuneri.cerereText('B 268 ROY', 110)).prag === 110 &&
  A(propuneri.cerereText(null, 90)).toataFlota === true && D(propuneri.discutieText('Ion Marin', 'viteză')).soferId === 3);

// ─── 2. Pagina ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Pagina');
T('cartonașul desenează rândurile serverului (alertă, discuție) ca TEXT; iconița doar din „fa-…"', /var desenRanduri = function \(\) \{ g\.innerHTML = ''; \(p\.randuri \|\| \[\]\)\.forEach\(function \(r\) \{ rand\(r\.l, r\.b \? el\('b', null, r\.v \|\| ''\) : document\.createTextNode\(r\.v \|\| ''\)\); \}\); \};/.test(PAG) &&
  /var ic = \/\^fa-\[a-z-\]\+\$\/\.test\(p\.ic \|\| ''\) \? p\.ic :/.test(PAG));
T('„Schimbă" face casete (pragul, mașina, numele / „despre ce"), „Lasă cum era" le pune la loc; „Da" trimite `campuri`', /var bEd = butonProp\('Schimbă', 'fa-pen'\), bLasa = butonProp\('Lasă cum era', 'fa-rotate-left'\);/.test(PAG) &&
  /bLasa\.onclick = function \(\) \{ ed = null; desenRanduri\(\); if \(dv\) \{ desenDovezi\(p\.dovezi\); dv\.classList\.remove\('vechi'\); \} bLasa\.replaceWith\(bEd\); \};/.test(PAG) && /var corp = p\.randuri \? \(ed \? \{ campuri: ed\(\) \} : \{\}\) :/.test(PAG) && /f\.nume\.placeholder = 'Îl scriu eu, după prag și mașină'/.test(PAG));
T('la „Schimbă" pe alertă, „din ultimele 30 de zile" se socotește din nou pe server pentru pragul și mașina alese (palid până vine)', /'\/api\/insight\/actiuni\/' \+ encodeURIComponent\(p\.id\) \+ '\/dovezi', \{ prag: f\.prag\.value, imei: f\.imei\.value \}/.test(PAG) &&
  /dv\.classList\.add\('vechi'\)/.test(PAG) && /\.chat-prop-dov\.vechi \{ opacity: \.55; \}/.test(CSS) && /if \(dv\) \{ desenDovezi\(p\.dovezi\); dv\.classList\.remove\('vechi'\); \}/.test(PAG));
T('O singură cerere pentru „Da", comună șoferului, alertei și discuției', (PAG.match(/'\/api\/insight\/actiuni\/' \+ encodeURIComponent\(p\.id\) \+ '\/aplica'/g) || []).length === 1);
T('după „Da", butonul vine de la server (Vezi alertele / Vezi RA Drive); la șofer rămâne fișa mașinii', /var bF = p\.gata\.buton \? butonProp\(p\.gata\.buton\.text \|\| ''/.test(PAG) && /window\.insightProblemaButon\(p\.gata\.buton \|\| \{ fel: 'fisa', imei: p\.imei \}\)/.test(PAG));
T('„Deschide Alerte" / „Vezi alertele" → Management › Alerte; „Vezi RA Drive" → ramura', /if \(b\.fel === 'ecran'\) \{ if \(typeof goManage === 'function'\) goManage\(String\(b\.ecran \|\| ''\)\); return; \}/.test(PAG) &&
  /if \(b\.fel === 'ramura'\) \{ if \(typeof window\.insightRamura === 'function'\) window\.insightRamura\(String\(b\.ramura \|\| ''\)\); return; \}/.test(PAG) && /if \(Array\.isArray\(x\.actiuni\) && x\.actiuni\.length\)/.test(PAG));
T('casetele noi iau culorile din temă (aceleași pe amândouă temele) și fontul paginii', /\.chat-prop-in \{ padding: 6px 9px; border-radius: 8px; border: 1px solid var\(--border-light\); background: var\(--bg-darkest\); color: var\(--text-primary\); font: inherit;/.test(CSS) && /\.chat-prop-in::placeholder \{ color: var\(--text-secondary\); \}/.test(CSS));

// ─── 3. Serverul (din cod) ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Serverul: calea ecranului, drepturile, întâia în RA Insight, fără model');
const BLOC = (SRV.split('// ─── Pasul 2, partea 2 (23.10')[1] || '').split('// Ce au găsit agenții, pe mașinile omului')[0];
T('alerta pe calea ecranului Alerte: db.createAlert pe firma omului + reîncărcarea regulilor motorului + jurnalul „prin RA Insight"', /al = await db\.createAlert\(spec, req\.companyId\); invalidateReguliCache\(\);/.test(BLOC) && /auditReq\(req, 'create', 'alert', al\.id, \{ type: spec\.type, company_id: req\.companyId, prin: 'RA Insight'/.test(BLOC));
T('…verificată pe starea de ACUM: mașina la îndemâna omului și a firmei; toată flota doar cine vede toată flota', /if \(!canAccessImei\(req, spec\.imei\)\) return res\.status\(403\)/.test(BLOC) && /const devCo = await getDeviceCompanyCached\(spec\.imei\);/.test(BLOC) && /else if \(!_veziToataFlota\(req\)\) return res\.status\(403\)/.test(BLOC) &&
  /function _veziToataFlota\(req\) \{ return req\.allowedImeis == null \|\| !!permReq\(req, 'viewAll'\); \}/.test(BLOC));
T('discuția pe calea RA Drive: db.adaugaDiscutieSafeDrive, șoferul tot al firmei; „Anulează" o scoate (stergeDiscutieSafeDrive)', /d = await db\.adaugaDiscutieSafeDrive\(\{ companyId: sofer\.company_id, driverId: sofer\.id, imei: null, la: prins\.aplicat_la, nota: nota, userId: userId \}\)/.test(BLOC) &&
  /if \(!sofer \|\| Number\(sofer\.company_id\) !== Number\(req\.companyId\)\)/.test(BLOC) && /await db\.stergeDiscutieSafeDrive\(id, req\.companyId\)/.test(BLOC));
T('drepturile ecranului, pe fiecare fel: alerta = modifică flota + editarea alertelor + ecranul Alerte; discuția = modifică flota', /if \(fel === 'alerta'\) return !!\(permReq\(req, 'manageFleet'\) && poateEditare\(req, 'alerte'\) && poateEcran\(req, 'alerte'\)\);/.test(SRV) && /if \(fel === 'discutie'\) return !!permReq\(req, 'manageFleet'\);/.test(SRV));
T('cererea e întâia în RA Insight (înaintea șoferilor și a rapoartelor), o singură dată; fără model și fără numărătoare', (SRV.match(/await _insightPropuneri\(req, res, /g) || []).length === 1 && SRV.indexOf('await _insightPropuneri(req, res, ') < SRV.indexOf('await _insightSoferi(req, res, ') &&
  !/(_numaraRaspunsReguli|callClaude|runAgent)/.test(BLOC));
T('„din ultimele 30 de zile" citește doar pozițiile peste pragul efectiv (scurt, și pe o flotă întreagă), cu marja motorului', /db\.pozitiiPesteViteza\(imeis, de, pana, propuneri\.pragEfectiv\(prag, marja\), 50000\)/.test(BLOC) && /const marja = \{ baza: SPEED_ALERT_BASE, marja: SPEED_ALERT_MARGIN \};/.test(BLOC));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3367, TCP = 5367;
const DIR = path.join(os.tmpdir(), 'rax_propuneri_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, String((opts && opts.body) || '').slice(0, 200) + '\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_propuneri', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
  GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST', 'SPEED_ALERT_BASE', 'SPEED_ALERT_MARGIN'].forEach((k) => { delete env[k]; });
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, pw) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cine) h.Cookie = cine;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const nModel = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;
const ziRO = (ms) => new Date(ms).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit' });
const oraRO = (ms) => new Date(ms).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit (modelul simulat: orice cerere către el se numără; trebuie să rămână ZERO)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const PAROLA = 'Str4da-Verde-2026';
  async function om(username, fullName, role, companyId) {
    const r = await json('POST', '/api/users', S, { username, full_name: fullName, role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
  }
  const co = (await json('POST', '/api/companies', S, { name: 'Transport Ionescu SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
  const MAS = [['350000000091001', 'Dacia Logan 3', 'B 154 UIP', 'Auto'], ['350000000091002', 'VW Caddy', 'B 268 ROY', 'Duba'], ['350000000091003', 'MAN TGX', 'B 77 TIR', 'Autotractor']];
  await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
  for (const m of MAS) { await json('PUT', '/api/devices/' + m[0] + '/company', S, { company_id: co.id }); await json('PUT', '/api/devices/' + m[0] + '/details', S, { name: m[1], plate: m[2], vehicle_type: m[3] }); }
  const sofer = async (name) => (await json('POST', '/api/drivers', S, { name, license_categories: 'B,C,CE', license_expiry: '2031-03-14', company_id: co.id })).j;
  const ion = await sofer('Ion Popescu'), mihai = await sofer('Mihai Ionescu'), marin = await sofer('Ion Marin');
  await json('PUT', '/api/devices/' + MAS[0][0] + '/assign', S, { driver_id: ion.id, group_id: null });
  // Drumurile Loganului: peste 140 de trei ori în 30 de zile (a doua poziție e la un minut după prima: nu mai sună), 135 nu sună,
  // iar cele 160 de acum 40 de zile ies din perioadă. Caddy: 125 (sună doar pe un prag de 110).
  const acum = Date.now(), Z = 86400000;
  const drum = [[0, -5 * Z, 145, 44.40], [0, -5 * Z + 60000, 147, 44.41], [0, -5 * Z + 7 * 60000, 142, 44.42], [0, -3 * Z, 150, 44.43], [0, -2 * Z, 135, 44.44], [0, -40 * Z, 160, 44.45], [1, -4 * Z, 125, 44.46]];
  for (const d of drum) await json('POST', '/api/test/simulate', S, { imei: MAS[d[0]][0], name: MAS[d[0]][1], speed: d[2], io: { ignition: 1 }, ts: new Date(acum + d[1]).toISOString(), lat: d[3], lng: 26.1 });
  const ana = await om('ana.pop@ionescu.ro', 'Ana Pop', 'company_admin', co.id);
  const dan = await om('dan@ionescu.ro', 'Dan Dispecer', 'dispatcher', co.id);
  await json('PUT', '/api/users/' + ana.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/access', S, { devices: MAS.map((m) => m[0]), groups: [] });
  T('pregătire: firma pe Basic, trei mașini cu drumuri, trei șoferi, administratorul și dispecerul cu RA Insight', !!(co.id && ion.id && marin.id && ana.ck && dan.ck));
  const q0 = (await json('GET', '/api/ai/quota', ana.ck)).j;
  const alerte = async () => { const l = (await json('GET', '/api/alerts', ana.ck)).j; return Array.isArray(l) ? l : []; };

  // a) alerta: propunerea
  const r1 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Anunță-mă când Loganul trece de 130 km/h.', nou: true });
  const pc = r1.j.propunere || {};
  T('„Anunță-mă când Loganul trece de 130 km/h." → cartonașul alertei, pe reguli, insigna „INSTANT · propunere"', r1.status === 200 && r1.j.source === 'reguli' && pc.id > 0 && pc.fel === 'alerta' && pc.stare === 'propusa' &&
    r1.j.reply === 'Am pregătit alerta. Uite ce pun — apeși **Da** și o pornesc.' && r1.j.insigna && r1.j.insigna.detaliu === 'propunere' && pc.poate === true, r1.text.slice(0, 400));
  const ziMax = ziRO(acum - 3 * Z), oraMax = oraRO(acum - 3 * Z);
  T('…„Din ultimele 30 de zile": de 3 ori (peste 140, o dată la 5 minute), cea mai mare viteză 150 km/h pe ' + ziMax + ' (cele 160 de acum 40 de zile nu intră)',
    (pc.dovezi || [])[0] && pc.dovezi[0].text === 'Ar fi sunat de 3 ori. Cea mai mare viteză: 150 km/h, pe ' + ziMax + ', la ' + oraMax + '.' && (pc.dovezi || []).some((d) => d.text === 'Ca toate alertele de viteză din aplicație, sună cu 10 km/h peste prag: când trece de 140 km/h.'), JSON.stringify(pc.dovezi));
  T('…„Pe": mașinile omului (Loganul întâi) și toată flota, pentru „Schimbă"', pc.campuri && pc.campuri.prag === 130 && pc.campuri.imei === MAS[0][0] && pc.campuri.optiuni[0].v === MAS[0][0] && pc.campuri.optiuni.some((o) => o.v === '' && o.t === 'Toată flota') && pc.campuri.optiuni.length === 4, JSON.stringify(pc.campuri));
  T('…și nimic nu s-a pus încă', (await alerte()).length === 0);
  const cid = r1.j.conversatieId;
  const rDa = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'da', conversatieId: cid });
  T('un „da" scris aduce din nou cartonașul, cu butonul — nu pune nimic', rDa.status === 200 && (rDa.j.propunere || {}).id === pc.id && /Apasă \*\*Da, pune alerta\*\*/.test(rDa.j.reply || '') && (await alerte()).length === 0, rDa.text.slice(0, 200));
  // dispecerul (fără dreptul de a modifica flota)
  const rD = await json('POST', '/api/insight/intreaba', dan.ck, { message: 'Anunță-mă când B 154 UIP trece de 130 km/h', nou: true });
  T('dispecerul vede propunerea, dar „Da" e oprit și află cine aprobă', rD.status === 200 && (rD.j.propunere || {}).poate === false && /Doar cine poate schimba alertele apasă „Da": administratorul firmei, Ana Pop\./.test((rD.j.propunere || {}).sub || ''), JSON.stringify(rD.j.propunere || {}).slice(0, 300));
  T('…dacă apasă totuși: 403, ca pe ecran; propunerea Anei nu există pentru el (404)', (await json('POST', '/api/insight/actiuni/' + rD.j.propunere.id + '/aplica', dan.ck, {})).status === 403 &&
    (await json('POST', '/api/insight/actiuni/' + pc.id + '/aplica', dan.ck, {})).status === 404 && (await alerte()).length === 0);
  // „Da"
  const a1 = await json('POST', '/api/insight/actiuni/' + pc.id + '/aplica', ana.ck, {});
  const l1 = await alerte(), al = l1[0] || {};
  let cond = al.condition; if (typeof cond === 'string') { try { cond = JSON.parse(cond); } catch (e) {} }
  T('„Da": alerta e în Alerte, ca din „Adaugă regulă" — viteză, pe Logan, peste 130, pornită, a firmei', a1.status === 200 && l1.length === 1 && al.type === 'overspeed' && al.imei === MAS[0][0] && cond && cond.maxSpeed === 130 && al.enabled === true &&
    Number(al.company_id) === Number(co.id) && al.name === 'Viteză peste 130 — B 154 UIP', a1.status + ' ' + JSON.stringify(al));
  T('…„Gata. Alerta **Viteză peste 130 — B 154 UIP** e pornită de azi, …", „Anulează" cu aproape 10 minute, butonul spre Alerte', /^Gata\. Alerta \*\*Viteză peste 130 — B 154 UIP\*\* e pornită de azi, \d{2}:\d{2}\.$/.test(((a1.j.propunere || {}).gata || {}).text || '') &&
    a1.j.propunere.stare === 'aplicata' && a1.j.propunere.ramasMs > 9 * 60000 && a1.j.propunere.gata.buton.ecran === 'alerts' && a1.j.propunere.randuri[3].v === 'Viteză peste 130 — B 154 UIP', JSON.stringify(a1.j.propunere || {}).slice(0, 400));
  const au = (await json('GET', '/api/audit?limit=60', S)).j;
  const rand = (Array.isArray(au) ? au : []).filter((x) => x.action === 'create' && x.entity === 'alert' && x.details && x.details.prin === 'RA Insight')[0];
  T('…în jurnal: „create" pe alertă, „prin RA Insight", de Ana', !!rand && rand.username === 'ana.pop@ionescu.ro' && rand.details.text === 'alerta Viteză peste 130 — B 154 UIP', JSON.stringify(rand));
  T('al doilea „Da": 409; alerta e tot una', (await json('POST', '/api/insight/actiuni/' + pc.id + '/aplica', ana.ck, {})).status === 409 && (await alerte()).length === 1);
  const conv = await json('GET', '/api/insight/conversatii/' + cid, ana.ck);
  T('conversația redeschisă: cartonașul arată „Ai apăsat Da", „Gata" și cât mai ține „Anulează"', (conv.j.mesaje || []).some((m) => m.extra && m.extra.propunere && m.extra.propunere.id === pc.id && m.extra.propunere.stare === 'aplicata' && m.extra.propunere.gata && m.extra.propunere.ramasMs > 0));
  const an1 = await json('POST', '/api/insight/actiuni/' + pc.id + '/anuleaza', ana.ck);
  T('„Anulează": alerta nu mai e în Alerte; textul o spune', an1.status === 200 && (await alerte()).length === 0 && an1.j.text === 'Am anulat: alerta „Viteză peste 130 — B 154 UIP” nu mai există.' && an1.j.propunere.stare === 'anulata', an1.text.slice(0, 300));
  T('…a doua oară: 409', (await json('POST', '/api/insight/actiuni/' + pc.id + '/anuleaza', ana.ck)).status === 409);
  // „Schimbă": toată flota, pragul 110, numele pus de aplicație se reface
  const r2 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Anunță-mă când Loganul trece de 130 km/h', conversatieId: cid });
  T('„Schimbă" cu un prag greșit sau o mașină care nu e pe cartonaș: 400, nimic pus', (await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/aplica', ana.ck, { campuri: { prag: 400 } })).status === 400 &&
    (await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/aplica', ana.ck, { campuri: { imei: '999' } })).status === 400 && (await alerte()).length === 0);
  const dv2 = await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/dovezi', ana.ck, { prag: '110', imei: '' });
  T('„Schimbă" pe 110 / toată flota → „din ultimele 30 de zile" socotit din nou: de 5 ori, pe 2 mașini (nimic pus)', dv2.status === 200 && ((dv2.j.dovezi || [])[0] || {}).text === 'Ar fi sunat de 5 ori, pe 2 mașini. Cea mai mare viteză: 150 km/h (B 154 UIP), pe ' + ziMax + ', la ' + oraMax + '.' && (await alerte()).length === 0, dv2.text.slice(0, 300));
  T('…cu un prag greșit: 400; propunerea altcuiva: 404', (await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/dovezi', ana.ck, { prag: 999 })).status === 400 && (await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/dovezi', dan.ck, { prag: 110 })).status === 404);
  const a2 = await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/aplica', ana.ck, { campuri: { prag: '110', imei: '', nume: '' } });
  const al2 = (await alerte())[0] || {};
  let cond2 = al2.condition; if (typeof cond2 === 'string') { try { cond2 = JSON.parse(cond2); } catch (e) {} }
  T('„Schimbă" → toată flota, peste 110: alerta fără mașină anume, cu numele refăcut', a2.status === 200 && al2.imei == null && cond2 && cond2.maxSpeed === 110 && al2.name === 'Viteză peste 110 — toată flota' && a2.j.propunere.randuri[2].v === 'Toată flota', a2.text.slice(0, 300) + ' ' + JSON.stringify(al2));
  await json('POST', '/api/test/actiune-veche', S, { id: r2.j.propunere.id, minute: 11 });
  const an2 = await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/anuleaza', ana.ck);
  T('după cele 10 minute, „Anulează" e refuzat: alerta se oprește din Alerte', an2.status === 409 && /Au trecut cele 10 minute: o oprești sau o ștergi din Management › Alerte/.test(an2.j.error || '') && (await alerte()).length === 1, an2.text.slice(0, 200));
  // pe toată flota, din discuție: de câte ori ar fi sunat pe toate mașinile
  const r3 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Alertează-mă dacă vreo mașină depășește 110 km/h', nou: true });
  T('pe toată flota: ar fi sunat de 5 ori, pe 2 mașini; cea mai mare viteză cu mașina ei', (r3.j.propunere || {}).fel === 'alerta' && ((r3.j.propunere.dovezi || [])[0] || {}).text === 'Ar fi sunat de 5 ori, pe 2 mașini. Cea mai mare viteză: 150 km/h (B 154 UIP), pe ' + ziMax + ', la ' + oraMax + '.', JSON.stringify((r3.j.propunere || {}).dovezi));
  const nu = await json('POST', '/api/insight/actiuni/' + r3.j.propunere.id + '/refuza', ana.ck);
  T('„Nu": nimic pus, „Ai apăsat Nu", iar „Da" după el e refuzat', nu.status === 200 && nu.j.propunere.stare === 'refuzata' && (await json('POST', '/api/insight/actiuni/' + r3.j.propunere.id + '/aplica', ana.ck, {})).status === 409 && (await alerte()).length === 1);
  // întrebări de lămurit și cereri care nu sunt ale ei
  const r4 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Anunță-mă când Loganul trece de viteză', nou: true });
  T('fără prag → „Peste câți km/h să sune?", cu 90 / 110 / 130 (butoanele scriu cererea întreagă)', r4.j.reply === 'Peste câți km/h să sune?' && (r4.j.alege || []).map((a) => a.text).join() === 'Peste 90 km/h,Peste 110 km/h,Peste 130 km/h' && /^Anunță-mă când B 154 UIP trece de 110 km\/h$/.test(r4.j.alege[1].trimite), JSON.stringify(r4.j.alege));
  const r5 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Anunță-mă când B 268 ROY intră în zona Depozit', nou: true });
  T('o alertă de zonă → se pune din Alerte, cu butonul „Deschide Alerte"; fără cartonaș', !r5.j.propunere && /doar \*\*alerte de viteză\*\*/.test(r5.j.reply || '') && (r5.j.actiuni || [])[0] && r5.j.actiuni[0].ecran === 'alerts', r5.text.slice(0, 300));

  // b) „Am vorbit cu el"
  const d1 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Am vorbit cu Ion despre viteză', nou: true });
  T('„Am vorbit cu Ion…" cu doi Ion → de ales, cu cererea întreagă pe buton', (d1.j.alege || []).map((a) => a.text).sort().join() === 'Ion Marin,Ion Popescu' && /^Notează că am vorbit cu Ion (Popescu|Marin) despre viteză$/.test(d1.j.alege[0].trimite), JSON.stringify(d1.j.alege));
  const d2 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Notează că am vorbit cu Ion Popescu despre viteză.', nou: true });
  const pd = d2.j.propunere || {};
  T('„Notează că am vorbit cu Ion Popescu despre viteză." → cartonașul discuției, „Da, notează", cu rândul RA Drive', d2.status === 200 && pd.fel === 'discutie' && pd.titlu === 'Notez că ai vorbit cu Ion Popescu' &&
    pd.randuri.map((r) => r.l + '=' + r.v).join(' | ') === 'Șoferul=Ion Popescu | Când=azi, din clipa în care apeși Da | Despre=viteză' && pd.butonDa === 'Da, notează' &&
    (pd.dovezi || []).some((d) => d.text === 'De azi, RA Drive compară cum a condus în cele 30 de zile de dinainte și de după discuție.') && r1.j.insigna.eticheta === d2.j.insigna.eticheta, d2.text.slice(0, 400));
  T('…dispecerul (fără „modifică flota") vede propunerea, fără „Da"', ((await json('POST', '/api/insight/intreaba', dan.ck, { message: 'Notează că am vorbit cu Ion Popescu', nou: true })).j.propunere || {}).poate === false);
  const da2 = await json('POST', '/api/insight/actiuni/' + pd.id + '/aplica', ana.ck, { campuri: { nota: 'viteză pe A2' } });
  const sd = await json('GET', '/api/insight/safe-drive', ana.ck);
  const disc = (await json('GET', '/api/audit?limit=60', S)).j.filter((x) => x.action === 'create' && x.entity === 'safe_drive_discutie' && x.details && x.details.prin === 'RA Insight')[0];
  T('„Da" (cu „Schimbă": „viteză pe A2"): discuția e în RA Drive, pe Ion, cu nota; în jurnal „prin RA Insight"', da2.status === 200 && /^Gata\. Am notat discuția cu \*\*Ion Popescu\*\* de azi, \d{2}:\d{2}\.$/.test(da2.j.propunere.gata.text) &&
    da2.j.propunere.randuri[2].v === 'viteză pe A2' && da2.j.propunere.gata.buton.ramura === 'safedrive' && !!disc && Number(disc.details.sofer) === ion.id, da2.text.slice(0, 300) + ' ' + JSON.stringify(disc));
  T('…RA Drive o vede (aceeași tabelă ca butonul „Am vorbit cu el")', sd.status === 200 && (sd.j.pregatire || (sd.j.soferi || []).some((s) => s.id === ion.id && s.discutie && s.discutie.nota === 'viteză pe A2')), JSON.stringify((sd.j.soferi || []).map((s) => [s.nume, s.discutie])).slice(0, 300));
  const an3 = await json('POST', '/api/insight/actiuni/' + pd.id + '/anuleaza', ana.ck);
  const sd2 = await json('GET', '/api/insight/safe-drive', ana.ck);
  T('„Anulează": discuția iese din RA Drive', an3.status === 200 && an3.j.text === 'Am anulat: discuția cu Ion Popescu nu mai e în RA Drive.' && (sd2.j.pregatire || !(sd2.j.soferi || []).some((s) => s.id === ion.id && s.discutie)), an3.text.slice(0, 200));

  // c) pachetul și fondatorul
  const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start SRL' })).j;
  await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000091101', nume: 'Dacia Logan', nr_inmatriculare: 'B 101 STA' }] });
  await json('PUT', '/api/devices/350000000091101/company', S, { company_id: coS.id });
  const st = await om('sef@start.ro', 'Șef Start', 'company_admin', coS.id);
  await json('PUT', '/api/users/' + st.id + '/ai-seat', S, { on: true });
  const rs = await json('POST', '/api/insight/intreaba', st.ck, { message: 'Anunță-mă când B 101 STA trece de 130 km/h', nou: true });
  T('pe Start: fără cartonaș — „de la pachetul Basic în sus"', rs.status === 200 && !rs.j.propunere && /de la pachetul Basic în sus/.test(rs.j.reply || ''), rs.text.slice(0, 300));
  const rf = await json('POST', '/api/insight/intreaba', S, { message: 'Anunță-mă când B 154 UIP trece de 130 km/h', nou: true });
  T('contul de fondator n-are o flotă: o spune, fără cartonaș', !rf.j.propunere && /contul de fondator n-are una/.test(rf.j.reply || ''), rf.text.slice(0, 300));
  const q1 = (await json('GET', '/api/ai/quota', ana.ck)).j;
  T('nimic nu s-a numărat (propunerea și „Da" sunt pe reguli) și ZERO cereri către model', JSON.stringify(q1.folosite != null ? q1.folosite : q1.used) === JSON.stringify(q0.folosite != null ? q0.folosite : q0.used) && nModel() === 0, JSON.stringify({ q0, q1, model: nModel() }).slice(0, 300));

  // La urmă (după numărătoare): o întrebare adevărată merge la RA Insight — se numără, ca orice întrebare; nu e o propunere.
  T('„Câte alerte a avut Loganul luna asta?" nu e o propunere (merge mai departe, la rapoarte / RA Insight)', !(await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Câte alerte de viteză a avut Loganul luna asta?', nou: true })).j.propunere);

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e)); gata(1); });
