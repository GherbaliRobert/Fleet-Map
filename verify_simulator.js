// verify_simulator.js — simulatorul de încărcare pe web (pasul 3, 12.10: „cu 3D și greutatea pe osii").
//
//   node verify_simulator.js
//
// Robert (12.10): „vreau să facem un simulator de încărcare marfă pentru transportatori" + „vreau să existe și un buton
// pentru 3D"; ordinea aprobată: „(3) simulatorul pe web, cu 3D și greutatea pe osii".
//
// Ce apără proba:
//   1. regulile (incarcare.js): cum se așază marfa (paleți, straturi, opriri, remorca), greutatea pe osii (fizica e
//      verificată prin echilibru: suma pe axe = tara + marfa), limitele din fișă, textele românești;
//   2. pagina NU socotește: trimite la server și desenează; rândul din meniu, după modul firmei; cele trei vederi;
//      culorile au pereche pe ambele teme;
//   3. serverul: modulul păzește rutele, vehiculul și semiremorca se verifică pe drepturi și pe firmă;
//   4. hârtia (incarcare_pdf.js): aceleași cifre și texte ca simularea, numele casei, o pagină în cazul obișnuit;
//   5. pe server pornit: simularea = regula rulată direct pe aceleași date; drepturile; PDF-ul.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

const ROOT = __dirname;
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);

const html = citeste('public/index.html');
const css = citeste('public/css/app.css');
const server = citeste('server.js');
sect('0. Fișierele');
T('pagina, stilurile, serverul, regulile și hârtia există', [html, css, server, citeste('incarcare.js'), citeste('incarcare_pdf.js')].every(Boolean));

// ─── 1. Regulile ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('1. Regulile (incarcare.js)');
const I = require('./incarcare.js');
const PRELATA = { id: 1, plate: 'B 501 RAT', fel: 'semiremorca', tip: 'prelata', lungime_m: 13.6, latime_m: 2.48, inaltime_m: 2.7, sarcina_kg: 24000, tara_kg: 7000, nr_axe: 3, pivot_axe_m: 7.8, limita_axe_kg: 24000 };
const TRAC = I.vehiculDin({ imei: '1', plate: 'B 101 RAT', vehicle_type: 'Autotractor' });
const SEMI = I.semiDin(PRELATA);
const EUR = (buc, o) => Object.assign({ nume: 'Paleți EUR', lungime: 120, latime: 80, inaltime: 150, kg: 500, buc, oprire: 1, suprapus: false }, o || {});
const sim = (marfa, o) => I.simuleaza(Object.assign({ vehicul: TRAC, semi: SEMI, marfa, mod: 'opriri', opriri: ['Pitești', 'Sibiu', 'Cluj-Napoca'] }, o || {}));
let r = sim([EUR(33)]);
T('33 de paleți EUR încap într-o prelată de 13,6 m (3 pe lat, 11 rânduri)', r.incarcate === 33 && r.marfa[0].incarcate === 33, r.incarcate);
r = sim([EUR(34)]);
T('al 34-lea nu mai încape — și se spune, cu numele mărfii', r.incarcate === 33 && r.mesaje[0].fel === 'rosu' && /^Nu încap 1 colet \(1 × Paleți EUR\)/.test(r.mesaje[0].text), r.mesaje[0] && r.mesaje[0].text);
r = sim([EUR(26, { nume: 'Industriali', latime: 100, inaltime: 120 })]);
T('26 de paleți industriali (2 pe lat, cu latura de 120 de-a curmezișul)', r.incarcate === 26, r.incarcate);
r = sim([EUR(10, { inaltime: 110, suprapus: true })]);
T('„unul peste altul": câte două straturi când încap în înălțime', r.cutii.filter((c) => c.z0 > 0).length === 5 && Math.max(...r.cutii.map((c) => c.x1)) === 240, J(r.cutii.map((c) => [c.x0, c.z0])));
r = sim([EUR(2, { inaltime: 300 })]);
T('un colet mai înalt decât spațiul nu se pune deloc', r.incarcate === 0 && /Nu încap 2 colete/.test(r.mesaje[0].text), r.mesaje[0] && r.mesaje[0].text);
r = sim([EUR(3, { oprire: 1 }), EUR(3, { oprire: 3, nume: 'Cluj' }), EUR(3, { oprire: 2, nume: 'Sibiu' })]);
const xDe = (op) => Math.min(...r.cutii.filter((c) => c.oprire === op).map((c) => c.x0));
T('„după opriri": ultima oprire lângă peretele din față, prima lângă uși', xDe(3) < xDe(2) && xDe(2) < xDe(1), [xDe(3), xDe(2), xDe(1)]);
T('…și ordinea de încărcare e scrisă cu numele opririlor', r.ordineText === 'Se încarcă în ordinea: Cluj-Napoca → Sibiu → Pitești (prima lângă peretele din față).', r.ordineText);
r = sim([EUR(3, { kg: 900, nume: 'Grea' }), EUR(3, { kg: 50, nume: 'Ușoară' })], { mod: 'echilibrat' });
T('„greutate echilibrată": marfa ușoară în față', Math.min(...r.cutii.filter((c) => c.i === 1).map((c) => c.x0)) < Math.min(...r.cutii.filter((c) => c.i === 0).map((c) => c.x0)));

// Fizica: suma pe axe = tara + marfa (echilibru), pe toate felurile de vehicule.
const suma = (rr) => rr.osii.reduce((a, x) => a + x.kg, 0);
const CAMION = I.vehiculDin({ imei: '2', plate: 'B 404 RAT', inc_fel: 'camion12' });
const REM = I.remorcaDin({ id: 2, plate: 'B 601 RAT', fel: 'remorca', tip: 'prelata', lungime_m: 7.7, latime_m: 2.48, inaltime_m: 2.7, sarcina_kg: 11000, tara_kg: 5000, axa_fata_m: 1.6, pivot_axe_m: 4.6, limita_axe_kg: 18000 });
const cazuri = [
  ['autotractor + semiremorcă', sim([EUR(20, { kg: 650 })]), TRAC.tare[0] + TRAC.tare[1] + 7000 + 20 * 650],
  ['camion 12 t', I.simuleaza({ vehicul: CAMION, marfa: [EUR(9, { kg: 400 })] }), CAMION.tare[0] + CAMION.tare[1] + 9 * 400],
  ['camion 12 t + remorcă', I.simuleaza({ vehicul: CAMION, remorca: REM, marfa: [EUR(30, { kg: 300 })] }), CAMION.tare[0] + CAMION.tare[1] + 5000 + 30 * 300]
];
cazuri.forEach((c) => T('echilibru — ' + c[0] + ': suma pe axe (' + suma(c[1]) + ') = tara + marfa (' + c[2] + ')', Math.abs(suma(c[1]) - c[2]) <= c[1].osii.length, suma(c[1])));
T('cu remorca, marfa care nu încape în camion trece în remorcă (camionul se umple întâi)',
  cazuri[2][1].cutii.some((c) => c.c === 1) && cazuri[2][1].corpuri[0].folosit >= 6.0 && cazuri[2][1].incarcate === 30, J(cazuri[2][1].corpuri.map((b) => [b.kg, b.folosit])));
r = sim([EUR(12, { kg: 650 }), EUR(10, { kg: 180, inaltime: 110, suprapus: true, oprire: 2 }), EUR(6, { kg: 520, latime: 100, inaltime: 120, oprire: 3 })]);
T('exemplul din machetă: axa față 6,4 t · axa motoare 9,3 t · semiremorca 11,9 t · total 27,5 t',
  J(r.osii.map((a) => a.text)) === J(['6,4 t din 8,0 t', '9,3 t din 11,5 t', '11,9 t din 24,0 t']) && r.masa.text === '27,5 t din 40,0 t', J(r.osii.map((a) => a.text)) + ' ' + r.masa.text);
T('cifrele de sus, scrise românește', J(r.indicatori.map((x) => x.val)) === J(['10,2 m', '12.720 kg', '36,5 m³', '28 din 28']), J(r.indicatori.map((x) => x.val)));
T('vehiculul fără fila „Încărcare": cifrele obișnuite, spuse ca atare', r.mesaje.some((m) => m.fel === 'galben' && /^Cifre obișnuite, nu ale mașinii: .*ampatamentul/.test(m.text)));
const plin = I.vehiculDin({ imei: '3', plate: 'B 102 RAT', inc_fel: 'autotractor', inc_ampatament: 3.6, inc_sa_axa: 0.6, inc_tara_fata: 5100, inc_tara_spate: 2700, max_axle_loads: JSON.stringify({ axle1: 7500, axle2: 11500 }), max_weight_legal: 40000 });
T('vehiculul cu fișa completă: nicio cifră presupusă; limitele din „Config Camion"', plin.presupuse.length === 0 && plin.lim[0] === 7500 && plin.lim[1] === 11500, J(plin.presupuse));
const tandem = I.vehiculDin({ imei: '4', inc_fel: 'camion18', max_axle_loads: { axle1: 7100, axle2: 9500, axle3: 9500 } });
T('axele din spate se adună (tandem: 9.500 + 9.500)', tandem.lim[1] === 19000, tandem.lim[1]);
const greu = I.simuleaza({ vehicul: plin, semi: SEMI, marfa: [EUR(24, { kg: 1000 })], opriri: ['A'] });
T('peste limită: roșu, cu cât și încotro se mută marfa', greu.mesaje.some((m) => m.fel === 'rosu' && /trece cu \d+,\d t peste limită — mută marfa grea spre (spate|față)\./.test(m.text)) && /^De corectat: \d+$/.test(greu.stare.text), J(greu.mesaje));
const spate = I.simuleaza({ vehicul: CAMION, marfa: [EUR(3, { kg: 1800 }), EUR(3, { kg: 1, oprire: 2 })], opriri: ['A', 'B'], mod: 'echilibrat' });
T('axa din față prea descărcată: galben, cu procentul', spate.mesaje.some((m) => m.fel === 'galben' && /^Axa față duce doar \d+% din masa totală/.test(m.text)) || spate.osii[0].kg / spate.masa.kg >= I.AXA_FATA_MIN, J(spate.mesaje));
T('„Altul" fără caroserie în fișă: nu se ghicește, se cere', /^Completează în fișa vehiculului \(fila „Încărcare”\): /.test(I.simuleaza({ vehicul: I.vehiculDin({ imei: '5', inc_fel: 'altul' }), marfa: [] }).eroare || ''));
T('autotractor fără semiremorcă: „Alege semiremorca."', I.simuleaza({ vehicul: TRAC, marfa: [] }).eroare === 'Alege semiremorca.');
const sfat = (v, rr) => (I.simuleaza({ vehicul: v, remorca: rr, marfa: [EUR(60, { kg: 100 })] }).mesaje[0] || {}).text || '';
T('sfatul „adaugă o remorcă" doar când chiar se poate (camion fără remorcă), nu la dubă, la autotractor sau cu remorca pusă',
  /adaugă o remorcă/.test(sfat(CAMION)) && !/remorc/.test(sfat(CAMION, REM)) && !/remorc/.test(sfat(I.vehiculDin({ imei: '7', inc_fel: 'duba35' }))) &&
  !/remorc/.test(sim([EUR(60)]).mesaje[0].text), [sfat(CAMION), sfat(CAMION, REM)].join(' / '));
T('dubele nu trag remorcă cu proțap (o remorcă trimisă e ignorată)', I.simuleaza({ vehicul: I.vehiculDin({ imei: '6', inc_fel: 'duba35' }), remorca: REM, marfa: [EUR(2)] }).cuRemorca === false);
T('felul după tipul din fișă (Autotractor / TIR / Dubă / Camion); un autoturism nu cară marfă',
  I.felDinTip('TIR') === 'autotractor' && I.felDinTip('Dubă') === 'duba35' && I.felDinTip('Camion') === 'camion12' && I.vehiculDin({ vehicle_type: 'Auto' }) === null);
T('marfa: dimensiuni fără sens se refuză pe rând', /^Rândul 1 \(X\): lungimea: între 1 și 1500$/.test(I.curataMarfa([{ nume: 'X', lungime: 0, latime: 80, inaltime: 100 }]).eroare || ''), I.curataMarfa([{ nume: 'X', lungime: 0, latime: 80, inaltime: 100 }]).eroare);
T('marfa: cel mult ' + I.MAX_RANDURI_MARFA + ' de rânduri', /^Cel mult 40 de rânduri/.test(I.curataMarfa(Array.from({ length: 41 }, () => EUR(1))).eroare || ''));
T('opririle: nume curățate, cel mult ' + I.MAX_OPRIRI + ', goale → „Oprirea N"', J(I.curataOpriri(['', ' Sibiu ', 'a', 'b', 'c', 'd'])) === J(['Oprirea 1', 'Sibiu', 'a', 'b', 'c']));
T('fără marfă: starea „Adaugă marfa"', sim([]).stare.text === 'Adaugă marfa');
T('ecranele primesc tot din meta (presetări, moduri, culorile opririlor)', I.meta().presetari.length === 3 && I.meta().moduri.length === 2 && I.meta().culoriOpriri.length === I.MAX_OPRIRI);

// ─── 2. Pagina ───────────────────────────────────────────────────────────────────────────────────────────────────
sect('2. Pagina: desenează ce primește, nu socotește');
const a = html.indexOf('// ── începe „simulatorul de încărcare" ──'), b = html.indexOf('// ── sfârșit „simulatorul de încărcare" ──');
const BS = a > 0 && b > a ? html.slice(a, b) : '';
T('blocul paginii e între repere', !!BS);
T('o singură cerere de simulare și una de hârtie', (BS.match(/fetch\('\/api\/incarcare\/simuleaza'/g) || []).length === 1 && (BS.match(/fetch\('\/api\/incarcare\/pdf'/g) || []).length === 1);
T('pagina nu așază marfa și nu socotește osii (nicio regulă de-a lui incarcare.js)', !/_orient|aranjeaza|osii\(|PIVOT|PARTE_TARA|\.sa \/|\.wb\b|kp \*|axTr/.test(BS));
T('textele (stare, cifre, osii, mesaje, ordinea) vin de la server', /R\.stare\.text/.test(BS) && /x\.val/.test(BS) && /a\.text/.test(BS) && /m\.text/.test(BS) && /R\.ordineText/.test(BS));
T('presetările, modurile și culorile opririlor vin din /api/incarcare/meta', /S\.meta\.presetari/.test(BS) && /S\.meta\.moduri/.test(BS) && /S\.meta\.culoriOpriri/.test(BS) && !/#3B82F6', '#F59E0B/.test(BS));
T('cele trei vederi: Lateral, De sus, 3D (rotit cu butoanele sau trăgând cu mouse-ul)',
  /\[\['lat', 'Lateral'\], \['sus', 'De sus'\], \['3d', '3D'\]\]/.test(BS) && /simRoteste\(-45\)/.test(BS) && /addEventListener\('pointermove'/.test(BS));
T('planul în lucru se ține în browser cu try/catch (o comoditate, nu o salvare)', /try \{ localStorage\.setItem\(CHEIE/.test(BS) && /try \{ const j = JSON\.parse\(localStorage\.getItem\(CHEIE/.test(BS));
T('rândul din meniu poartă data-view și se arată doar cu modulul firmei, celui care face planuri (modifică flota sau e dispecer; pasul 4) — noi îl vedem mereu',
  /id="nav-incarcare" data-view="incarcare" onclick="showView\('incarcare'\)"/.test(html) &&
  /nc\.style\.display = \(me\.isSuper \|\| \(feats\.incarcare === true && \(\(me\.permissions && me\.permissions\.manageFleet\) \|\| me\.role === 'dispatcher'\)\)\)/.test(html));
T('vederea e înregistrată (VIEW_PANELS + VIEW_OPENERS)', /incarcare: 'incarcare-view'/.test(html) && /incarcare: 'renderIncarcarePage'/.test(html) && /<div id="incarcare-view" class="modal-overlay"><\/div>/.test(html));
T('PDF-ul se descarcă cu numele din antet (_numeDinAntet)', /window\._numeDinAntet\(r, /.test(BS));
T('desenul are pereche de culori pe tema închisă (structura, roțile, centrul de greutate)',
  ['sim-cab1', 'sim-podea', 'sim-perete', 'sim-contur', 'sim-roata', 'sim-axa', 'sim-cg', 'sim-tl'].every((k) => new RegExp('body\\.dark \\.sim-svg \\.' + k + '\\b').test(css)));
T('tonurile (verde / galben / roșu) au pereche pe fiecare temă; verdele de pe alb e cel închis (#166534)',
  /\.sim \.ton-verde \{ color: #166534; \}/.test(css) && /body\.dark \.sim \.ton-verde \{ color: #3FE07D; \}/.test(css) && /body\.dark \.sim \.ton-rosu/.test(css));
T('fără grile scrise în atribut (pe telefon le-ar strica regula globală)', !/style="[^"]*grid-template-columns/.test(BS));

// ─── 3. Serverul ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Serverul: modulul, drepturile, firma');
const rute = server.match(/app\.(get|post)\('\/api\/incarcare\/(flota|simuleaza|pdf)'[^\n]*/g) || [];
T('trei rute ale simulatorului, toate cu drepturile pe vehicule (withScope) și modulul „incarcare"', rute.length === 3 && rute.every((x) => /withScope, requireFeature\('incarcare'\)/.test(x)), rute.length);
T('vehiculul: drepturile pe el (canAccessImei), nu arhivat, care cară marfă',
  /if \(!imei \|\| !canAccessImei\(req, imei\)\) return \{ status: 403/.test(server) && /if \(!dev \|\| dev\.status === 'archived'\) return \{ status: 404/.test(server) && /Vehiculul ăsta nu cară marfă/.test(server));
T('semiremorca / remorca: a firmei vehiculului, de felul potrivit', /Semiremorca aleasă nu e a firmei vehiculului\./.test(server) && /La autotractor se cuplează o semiremorcă/.test(server));
T('flota simulatorului: fără demo (în afara contului demo), fără arhivate', /async function _incFlota\(req\) \{[\s\S]{0,500}DEMO_SET\.has[\s\S]{0,200}d\.status !== 'archived'/.test(server));
// Pasul 4: și salvarea planului trece pe acolo; planul deschis / trimis se socotește prin _incSimulareDin, pe care o
// cheamă și _incSimulare — o singură regulă, oricare ar fi ușa.
T('ecranul, hârtia și salvarea planului trec prin ACEEAȘI simulare (_incSimulare, de trei ori), care cheamă _incSimulareDin',
  (server.match(/await _incSimulare\(req\)/g) || []).length === 3 && /return _incSimulareDin\(await db\.getDeviceFull\(imei\), b\);/.test(server),
  (server.match(/await _incSimulare\(req\)/g) || []).length);
T('descărcarea hârtiei intră în jurnal (export plan_incarcare)', /auditReq\(req, 'export', 'plan_incarcare'/.test(server));

// ─── 4. Hârtia ───────────────────────────────────────────────────────────────────────────────────────────────────
sect('4. Hârtia (incarcare_pdf.js): aceleași cifre, numele casei');
const P = require('./incarcare_pdf.js');
const PDFDocument = require('pdfkit');
r = sim([EUR(12, { kg: 650 }), EUR(10, { kg: 180, inaltime: 110, suprapus: true, oprire: 2 }), EUR(6, { kg: 520, latime: 100, inaltime: 120, oprire: 3 })]);
const scris = [];
const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
doc.registerFont('Nunito', path.join(ROOT, 'fonts', 'DejaVuSans.ttf'));
doc.registerFont('Nunito-Bold', path.join(ROOT, 'fonts', 'DejaVuSans-Bold.ttf'));
const text0 = doc.text.bind(doc);
doc.text = function (t) { scris.push(String(t)); return text0.apply(null, arguments); };
let pagini = 1;
doc.on('pageAdded', () => { pagini++; });
P.scriePlan(doc, r, { generatLa: Date.UTC(2026, 9, 12, 9, 0) });
doc.end();
const tot = scris.join(' | ');
T('titlul, vehiculul și semiremorca', /Plan de încărcare/.test(tot) && tot.indexOf('B 101 RAT · Autotractor — Semiremorca · B 501 RAT (Prelată standard)') >= 0);
T('cifrele de sus = ale simulării', r.indicatori.every((x) => scris.indexOf(x.val) >= 0 && scris.indexOf(x.tot) >= 0));
T('osiile, masa totală și mesajele = ale simulării', r.osii.every((x) => scris.indexOf(x.text) >= 0) && scris.indexOf(r.masa.text) >= 0 && r.mesaje.every((m) => scris.indexOf(m.text) >= 0));
T('marfa: fiecare rând, cu dimensiunile și oprirea', r.marfa.every((m) => scris.indexOf(m.nume) >= 0 && scris.indexOf(m.dims) >= 0));
T('ordinea de încărcare și starea', tot.indexOf(r.ordineText) >= 0 && scris.indexOf(r.stare.text) >= 0);
T('cazul obișnuit încape pe o pagină', pagini === 1, pagini);
T('numele fișierului: „RA-Track - Plan de încărcare B 101 RAT - 12.10.2026.pdf"', P.numeFisier(r, Date.UTC(2026, 9, 12, 9, 0)) === 'RA-Track - Plan de încărcare B 101 RAT - 12.10.2026.pdf', P.numeFisier(r, Date.UTC(2026, 9, 12, 9, 0)));
const PS = citeste('incarcare_pdf.js');
T('hârtia nu socotește (nicio regulă de-a lui incarcare.js) și folosește logo-ul pentru fundal alb', !/aranjeaza|osii\(|simuleaza\(/.test(PS) && /logo-light\.png/.test(PS));

// ─── 4b. Ce se cuplează la un vehicul (13.10, Robert: „am adăugat o remorcă dar tot nu-mi apare în simulator") ───
// O remorcă trecută dispărea pe tăcute când era de alt fel sau din altă firmă. Acum: o regulă (remorciPentru), lista și
// motivul vin de la server, iar ecranele doar le arată.
sect('4b. Ce se cuplează la un vehicul');
{
  const trac = { tip: 'trac', company_id: 1, company_name: 'Alfa' }, cam = { tip: 'rigid', carlig: true, company_id: 1 }, duba = { tip: 'rigid', carlig: false, company_id: 1 };
  const R1 = { id: 1, fel: 'remorca', plate: 'B 1 REM', company_id: 1 }, S1 = { id: 2, fel: 'semiremorca', plate: 'B 2 SEM', company_id: 1 };
  const S2 = { id: 3, fel: 'semiremorca', plate: 'B 3 SEM', company_id: 2, company_name: 'Beta' };
  let p = I.remorciPentru(trac, [R1, S1, S2]);
  T('autotractorul primește doar semiremorcile firmei lui', J(p) === J({ ids: [2], mesaj: null, gol: false }), J(p));
  p = I.remorciPentru(cam, [R1, S1, S2]);
  T('camionul primește doar remorcile cu proțap ale firmei lui', J(p.ids) === J([1]) && p.mesaj === null, J(p));
  p = I.remorciPentru(trac, [R1]);
  T('autotractor + doar o remorcă cu proțap: se spune de ce lipsește',
    p.ids.length === 0 && p.mesaj === 'B 1 REM e trecută ca remorcă cu proțap — la autotractor se cuplează doar o semiremorcă. Dacă e de fapt semiremorcă, schimbă-i felul din fișa ei.', J(p));
  p = I.remorciPentru(cam, [S1, Object.assign({}, S1, { id: 9, plate: 'B 9 SEM' })]);
  T('camion + doar semiremorci (cazul lui Robert, un TIR trecut „Camion"): se spune de ce, la plural',
    p.ids.length === 0 && /^B 2 SEM, B 9 SEM sunt trecute ca semiremorci — ele se cuplează doar la un autotractor\. Dacă vehiculul ăsta e de fapt autotractor, schimbă-i felul în fișa lui/.test(p.mesaj || ''), J(p));
  p = I.remorciPentru(trac, [S2]);
  T('semiremorca altei firme (doar la noi se vede): se spune firma ei și firma vehiculului',
    p.ids.length === 0 && p.mesaj === 'B 3 SEM e trecută la firma „Beta”, nu la firma acestui vehicul („Alfa”). O remorcă se cuplează doar în firma ei.', J(p));
  p = I.remorciPentru(duba, [R1]);
  T('duba: nu cuplează nimic, iar o remorcă trecută primește motivul', p.ids.length === 0 && /^La o dubă de 3,5 t nu se cuplează remorci \(B 1 REM\)/.test(p.mesaj || ''), J(p));
  T('fără nicio remorcă de felul potrivit, nicăieri: „gol" (fiecare ecran spune unde se adaugă); duba fără remorci: nimic',
    J(I.remorciPentru(trac, [])) === J({ ids: [], mesaj: null, gol: true }) && J(I.remorciPentru(cam, [])) === J({ ids: [], mesaj: null, gol: true }) &&
    J(I.remorciPentru(duba, [])) === J({ ids: [], gol: false, mesaj: null }));
  T('firma se compară ca număr (din bază poate veni și ca text)', I.remorcaPotrivita(trac, Object.assign({}, S1, { company_id: '1' })) && !I.remorcaPotrivita(trac, Object.assign({}, S1, { company_id: null })));
  T('serverul: flota pune pe fiecare vehicul lista și motivul (remorciPentru), iar simularea verifică cu ACEEAȘI regulă',
    /const p = incarcare\.remorciPentru\(v, brute\);\s*v\.remorci_ids = p\.ids; v\.remorci_mesaj = p\.mesaj; v\.remorci_gol = p\.gol;/.test(server) &&
    /if \(!incarcare\.remorcaPotrivita\(vf, r\)\)/.test(server));
  // Invers, din fișa remorcii (13.10, Robert: „buton … de atașare la un vehicul"): la ce vehicule se poate atașa.
  const VEH = [{ imei: 'L', plate: 'B 154 UIP', tip: null, company_id: 1 }, { imei: 'T', plate: 'B 01 TIR', tip: 'trac', company_id: 1 },
    { imei: 'C', plate: 'B 03 CAM', tip: 'rigid', carlig: true, company_id: 1 }, { imei: 'X', plate: 'B 09 ALT', tip: 'trac', company_id: 2 }];
  p = I.vehiculePentruRemorca(S1, VEH);
  T('semiremorca: doar autotractoarele firmei ei (nu și ale altei firme)', J(p) === J({ imeis: ['T'], mesaj: null }), J(p));
  p = I.vehiculePentruRemorca(R1, VEH);
  T('remorca cu proțap: doar camioanele firmei ei', J(p.imeis) === J(['C']), J(p));
  p = I.vehiculePentruRemorca(R1, [VEH[0]]);
  T('firma cu doar un autoturism (captura lui Robert): nimic de ales, și se spune de ce',
    p.imeis.length === 0 && p.mesaj === 'Firma n-are niciun camion în flotă — remorca cu proțap se atașează doar la un camion (autoturismele și dubele nu trag remorci în simulator). Felul se alege în fișa vehiculului, fila „Încărcare”.', J(p));
  p = I.vehiculePentruRemorca(S1, [VEH[2]]);
  T('semiremorca la o firmă cu doar camioane: motivul numește camioanele', /^Semiremorca se atașează doar la un autotractor, iar firma are doar camioane \(B 03 CAM\)\./.test(p.mesaj || ''), J(p));
  T('atașarea și lista simulatorului folosesc ACEEAȘI regulă (remorcaPotrivita)', /function vehiculePentruRemorca[\s\S]{0,400}remorcaPotrivita\(v, r\)/.test(citeste('incarcare.js')) &&
    /if \(!incarcare\.remorcaPotrivita\(v, r\)\)/.test(server));
  const BR = (html.match(/── începe „semiremorcile din flotă"[\s\S]*?── sfârșit „semiremorcile din flotă" ──/) || [''])[0];
  T('pagina: rândul remorcii are „Șterge" și spune la ce vehicul e atașată; fereastra cere lista de la server și atașează',
    /onclick="remSterge\(\$\{Number\(r\.id\)\}\)"/.test(BR) && /atașată la \$\{esc\(r\.atasata_plate\)\}/.test(BR) && /fetch\('\/api\/remorci\/cuplare\?' \+ q\)/.test(BR) &&
    /'\/atasare', \{ method: 'PUT'/.test(BR) && /<select id="rem-atasare"><\/select>/.test(html) && /window\.simDeschideVehicul\(imei, id\)/.test(BR) && /window\.simDeschideVehicul = async function/.test(html));
  const telRem = citeste('mobile/src/screens/Remorci.tsx');
  T('telefonul: aceeași listă și aceeași atașare, plus „Deschide în simulator" pe vehiculul ei',
    /Api\.remorciCuplare\(/.test(telRem) && /Api\.atasezaRemorca\(rid, atas \|\| null\)/.test(telRem) && /loc\.route\('\/incarcare\?vehicul=' \+ encodeURIComponent\(atasInit\) \+ '&remorca='/.test(telRem) &&
    /atașată la \{r\.atasata_plate\}/.test(telRem) && /\.vehicul \|\| ''\), remDinAdresa = String\(\(\(loc\.query \|\| \{\}\) as any\)\.remorca/.test(citeste('mobile/src/screens/Simulator.tsx')));
  const tel = citeste('mobile/src/screens/Simulator.tsx');
  T('pagina și telefonul nu mai filtrează singure remorcile: iau lista de la server și arată motivul',
    /const ids = \(v\.remorci_ids \|\| \[\]\)\.map\(String\);/.test(html) && !/r\.fel === fel && r\.company_id === v\.company_id/.test(html) && /esc\(v\.remorci_mesaj\)/.test(html) &&
    /\(vv\.remorci_ids \|\| \[\]\)\.map\(String\)/.test(tel) && !/r\.company_id === v\.company_id && r\.fel ===/.test(tel) && !/r\.company_id === prim\.company_id/.test(tel) &&
    (tel.match(/v\.remorci_mesaj/g) || []).length >= 2);
}

// ─── 5. Pe server pornit ─────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3490, DIR = '.simulator-db';
try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', DEMO_DISABLED: 'true',
  SESSION_SECRET: 'ci_simulator', PORT: String(PORT), TCP_PORT: '5490', PGLITE_DIR: DIR + '/pgdata', DATABASE_URL: '' };
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 400);
}
async function intra(user, parola) {
  const lr = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: user, password: parola }) });
  if (!lr.ok) throw new Error('nu m-am putut autentifica ca ' + user + ' (' + lr.status + ')');
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const cere = (m, u, bb) => fetch(B + u, { method: m, headers: H, body: bb === undefined ? undefined : J(bb) });
  const js = async (m, u, bb) => { const x = await cere(m, u, bb); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  return { GET: (u) => js('GET', u), POST: (u, bb) => js('POST', u, bb), PUT: (u, bb) => js('PUT', u, bb), RAW: cere };
}
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const S = await intra('admin', 'test1234');
  sect('5. Pe server pornit');
  const T1 = (await S.POST('/api/companies', { name: 'CI Transport Marfă' })).j.id;
  const T2 = (await S.POST('/api/companies', { name: 'CI Taxi' })).j.id;
  await S.POST('/api/devices', { imei: '861000000350001', name: 'Volvo FH', plate: 'B 01 TIR', company_id: T1, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: '861000000350002', name: 'Logan', plate: 'B 02 AUT', company_id: T1, vehicle_type: 'Auto' });
  await S.POST('/api/devices', { imei: '861000000350003', name: 'Logan', plate: 'B 03 TAX', company_id: T2, vehicle_type: 'Auto' });
  const semi = (await S.POST('/api/remorci', Object.assign({}, PRELATA, { company_id: T1, plate: 'B 50 SEM' }))).j;
  const conturi = {}, ids = {};
  for (const [u, rol, co] of [['adm1@ci.ro', 'company_admin', T1], ['vw1@ci.ro', 'viewer', T1], ['adm2@ci.ro', 'company_admin', T2]]) {
    const cr = await S.POST('/api/users', { username: u, full_name: u, role: rol, company_id: co });
    ids[u] = cr.j.id;
    await puneParola(cr.j, 'Str4da-Verde-2026', B);
    conturi[u] = await intra(u, 'Str4da-Verde-2026');
  }
  const A1 = conturi['adm1@ci.ro'], V1 = conturi['vw1@ci.ro'], A2 = conturi['adm2@ci.ro'];
  await A1.PUT('/api/devices/861000000350001/details', { inc_fel: 'autotractor', inc_ampatament: 3.6, inc_sa_axa: 0.6, inc_tara_fata: 5100, inc_tara_spate: 2700, inc_remorca_id: semi.id });

  let x = await A1.GET('/api/incarcare/flota');
  T('flota simulatorului: autotractorul (cu semiremorca lui obișnuită), fără autoturism; semiremorca firmei',
    x.s === 200 && x.j.vehicule.length === 1 && x.j.vehicule[0].imei === '861000000350001' && x.j.vehicule[0].remorca_id === semi.id &&
    x.j.remorci.length === 1 && x.j.remorci[0].id === semi.id, J(x.j));
  const marfa = [EUR(12, { kg: 650 }), EUR(10, { kg: 180, inaltime: 110, suprapus: true, oprire: 2 }), EUR(6, { kg: 520, latime: 100, inaltime: 120, oprire: 3 })];
  const cerere = { imei: '861000000350001', remorca_id: semi.id, mod: 'opriri', opriri: ['Pitești', 'Sibiu', 'Cluj-Napoca'], marfa };
  x = await A1.POST('/api/incarcare/simuleaza', cerere);
  const full = (await A1.GET('/api/devices/861000000350001/full')).j;
  const direct = I.simuleaza({ vehicul: I.vehiculDin(full), semi: I.semiDin(semi), marfa: I.curataMarfa(marfa).marfa, mod: 'opriri', opriri: cerere.opriri });
  T('simularea serverului = regula rulată direct pe aceleași date (cifre, osii, mesaje, colete)',
    x.s === 200 && J(x.j.indicatori) === J(direct.indicatori) && J(x.j.osii) === J(direct.osii) && J(x.j.mesaje) === J(direct.mesaje) && x.j.cutii.length === direct.cutii.length, J(x.j).slice(0, 300));
  x = await V1.POST('/api/incarcare/simuleaza', cerere);
  T('vizualizatorul fără mașini atribuite nu simulează pe camionul firmei (vede doar ce i s-a dat)', x.s === 403, x.s);
  await A1.PUT('/api/users/' + ids['vw1@ci.ro'] + '/access', { devices: ['861000000350001'], groups: [] });
  x = await V1.POST('/api/incarcare/simuleaza', cerere);
  T('…iar cu autotractorul atribuit, simulează (nu schimbă nimic)', x.s === 200, x.s);
  x = await A2.GET('/api/incarcare/flota');
  T('firma fără camioane și fără semiremorci (modulul oprit): refuz', x.s === 403 && x.j.error === 'feature_disabled', J(x));
  const altaSemi = (await S.POST('/api/remorci', Object.assign({}, PRELATA, { company_id: T2, plate: 'B 51 SEM' }))).j;
  x = await A2.GET('/api/incarcare/flota');
  T('o semiremorcă trecută îi pornește singură simulatorul (fără vehicule care să o tragă, deocamdată)', x.s === 200 && x.j.vehicule.length === 0 && x.j.remorci.length === 1, J(x));
  x = await A2.POST('/api/incarcare/simuleaza', cerere);
  T('altă firmă nu simulează pe vehiculul primei (403)', x.s === 403, x.s);
  x = await A1.POST('/api/incarcare/simuleaza', Object.assign({}, cerere, { remorca_id: altaSemi.id }));
  T('semiremorca altei firme: refuz pe față', x.s === 400 && x.j.error === 'Semiremorca aleasă nu e a firmei vehiculului.', J(x));
  // Cazul lui Robert (13.10): un TIR trecut „Camion" + o semiremorcă. Înainte, simulatorul nu arăta nimic și nu spunea nimic.
  await S.POST('/api/devices', { imei: '861000000350004', name: 'MAN TGX', plate: 'B 04 CAM', company_id: T2, vehicle_type: 'Camion' });
  x = await A2.GET('/api/incarcare/flota');
  const cam2 = (x.j.vehicule || []).filter((v) => v.imei === '861000000350004')[0] || {};
  T('flota: camionul nu primește semiremorca firmei, dar află de ce (felul vehiculului)', x.s === 200 && J(cam2.remorci_ids) === '[]' &&
    /^B 51 SEM e trecută ca semiremorcă — ea se cuplează doar la un autotractor\./.test(cam2.remorci_mesaj || ''), J(cam2));
  x = await A2.POST('/api/incarcare/simuleaza', { imei: '861000000350004', remorca_id: altaSemi.id, marfa: [EUR(2)] });
  T('…iar simularea o refuză cu aceeași regulă', x.s === 400 && x.j.error === 'La vehiculul ăsta nu se poate cupla remorca aleasă.', J(x));
  await A2.PUT('/api/devices/861000000350004/details', { inc_fel: 'autotractor', inc_ampatament: 3.7, inc_sa_axa: 0.6 });
  x = await A2.GET('/api/incarcare/flota');
  const trac2 = (x.j.vehicule || []).filter((v) => v.imei === '861000000350004')[0] || {};
  T('trecut pe „Autotractor" în fila Încărcare: semiremorca apare în simulator', J(trac2.remorci_ids) === J([altaSemi.id]) && trac2.remorci_mesaj === null, J(trac2));
  x = await S.GET('/api/incarcare/flota');
  const trac1 = (x.j.vehicule || []).filter((v) => v.imei === '861000000350001')[0] || {};
  T('la noi (toate firmele): fiecare vehicul primește doar remorcile firmei lui', J(trac1.remorci_ids) === J([semi.id]), J(trac1));
  x = await A1.POST('/api/incarcare/simuleaza', Object.assign({}, cerere, { imei: '861000000350002' }));
  T('un autoturism: „nu cară marfă"', x.s === 400 && /nu cară marfă/.test(x.j.error || ''), J(x));
  x = await A1.POST('/api/incarcare/simuleaza', Object.assign({}, cerere, { marfa: [{ nume: 'X', lungime: 0, latime: 80, inaltime: 100 }] }));
  T('marfă fără sens: refuz pe față, pe rând', x.s === 400 && /^Rândul 1 \(X\)/.test(x.j.error || ''), J(x));
  const pr = await A1.RAW('POST', '/api/incarcare/pdf', cerere);
  const buf = Buffer.from(await pr.arrayBuffer());
  T('hârtia: PDF, cu numele casei în antet', pr.status === 200 && pr.headers.get('content-type') === 'application/pdf' && buf.slice(0, 4).toString() === '%PDF' &&
    /filename\*=UTF-8''RA-Track%20-%20Plan%20de%20%C3%AEnc%C4%83rcare%20B%2001%20TIR%20-%20/.test(pr.headers.get('content-disposition') || ''), pr.headers.get('content-disposition'));
  // Atașarea din fișa remorcii (13.10)
  let rr = (await A1.GET('/api/remorci')).j;
  T('lista remorcilor spune la ce vehicul e atașată (cea pusă din fila „Încărcare" a vehiculului)',
    ((rr || []).find((r) => r.id === semi.id) || {}).atasata_imei === '861000000350001' && ((rr || []).find((r) => r.id === semi.id) || {}).atasata_plate === 'B 01 TIR', J(rr));
  x = await A1.GET('/api/remorci/cuplare?id=' + semi.id);
  T('cuplarea unei semiremorci: autotractorul firmei (nu și autoturismul), cu atașarea de acum',
    x.s === 200 && J(x.j.vehicule.map((v) => v.imei)) === J(['861000000350001']) && x.j.atasata && x.j.atasata.imei === '861000000350001' && x.j.mesaj === null, J(x));
  const rem1 = (await A1.POST('/api/remorci', { fel: 'remorca', tip: 'prelata', plate: 'B 52 REM', lungime_m: 7.7, latime_m: 2.48, inaltime_m: 2.7 })).j;
  x = await A1.GET('/api/remorci/cuplare?id=' + rem1.id);
  T('o remorcă cu proțap, într-o firmă cu doar autotractor: nimic de ales, cu motivul', x.s === 200 && x.j.vehicule.length === 0 &&
    /^Remorca cu proțap se atașează doar la un camion, iar firma are doar autotractoare \(B 01 TIR\)\./.test(x.j.mesaj || ''), J(x));
  x = await A1.PUT('/api/remorci/' + rem1.id + '/atasare', { imei: '861000000350001' });
  T('…iar atașarea ei la autotractor e refuzată pe față', x.s === 400 && x.j.error === 'Remorca cu proțap se atașează doar la un camion.', J(x));
  x = await A1.PUT('/api/remorci/' + semi.id + '/atasare', { imei: '861000000350002' });
  T('nici semiremorca la autoturism', x.s === 400 && x.j.error === 'Semiremorca se atașează doar la un autotractor.', J(x));
  x = await A2.PUT('/api/remorci/' + semi.id + '/atasare', { imei: null });
  T('altă firmă nu umblă la remorca primei (404)', x.s === 404, J(x));
  x = await V1.PUT('/api/remorci/' + semi.id + '/atasare', { imei: null });
  T('vizualizatorul nu atașează (cere „editare vehicule")', x.s === 403, J(x));
  x = await A1.PUT('/api/remorci/' + semi.id + '/atasare', { imei: null });
  let fl = (await A1.GET('/api/incarcare/flota')).j;
  T('desprinsă: vehiculul nu o mai are, lista o arată neatașată', x.s === 200 && x.j.atasata === null &&
    (fl.vehicule.find((v) => v.imei === '861000000350001') || {}).remorca_id === null, J(x));
  await S.POST('/api/devices', { imei: '861000000350005', name: 'Scania R', plate: 'B 05 TIR', company_id: T1, vehicle_type: 'Autotractor' });
  await A1.PUT('/api/devices/861000000350001/details', { inc_remorca_id: semi.id });
  x = await A1.PUT('/api/remorci/' + semi.id + '/atasare', { imei: '861000000350005' });
  fl = (await A1.GET('/api/incarcare/flota')).j;
  const f1 = fl.vehicule.find((v) => v.imei === '861000000350001') || {}, f5 = fl.vehicule.find((v) => v.imei === '861000000350005') || {};
  T('atașată la alt autotractor: se desprinde de primul; simulatorul o pune singur la vehiculul nou', x.s === 200 && x.j.atasata.imei === '861000000350005' &&
    f1.remorca_id === null && f5.remorca_id === semi.id && J(f5.remorci_ids) === J([semi.id]), J([x.j, f1.remorca_id, f5.remorca_id]));
  await S.PUT('/api/devices/861000000350001/status', { status: 'archived' });
  x = await A1.POST('/api/incarcare/simuleaza', cerere);
  T('vehiculul arhivat nu se mai simulează', x.s === 403 || x.s === 404, x.s);
  fin();
})().catch((e) => { console.log('eroare: ' + e.message); rele++; fin(); });
function fin() {
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
}
