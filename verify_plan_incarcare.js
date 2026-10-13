// verify_plan_incarcare.js — planurile de încărcare (simulatorul, pasul 4, 12.10): telefonul, ecranul șoferului,
// „Am încărcat" care anunță dispecerul, „Trimite șoferului" și planurile salvate pe web.
//
//   node verify_plan_incarcare.js
//
// Robert (12.10): „hai cu etapa 4" — ordinea aprobată: „(4) telefonul"; macheta aprobată: artboard-ul „Telefon" = ecranul
// șoferului (planul văzut de sus, ordinea de încărcare, greutatea pe osii, „Am o problemă" / „Am încărcat").
//
// Ce apără proba:
//   1. textele planului (incarcare.js): starea (netrimis / trimis / încărcat / problemă), ora pe ora României, nota de
//      sub plan, pașii (în ordinea în care se încarcă), ce rămâne la rampă, rezumatul osiilor și al spațiului;
//   2. desenul e UNUL: blocul paginii („desenul simulatorului") și copia telefonului (mobile/src/lib/simDesen.ts) dau
//      ACELAȘI SVG pe aceleași simulări (autotractor, camion, camion + remorcă, dubă; trei vederi; zece unghiuri); fiecare
//      piesă are culori pe ambele teme (web + telefon); hârtia PDF pune pe pagină ACELAȘI desen (incarcare_pdf.js);
//   3. pagina: „Trimite șoferului", planurile, fereastra șoferului, anunțurile (notifPlan); pagina nu socotește;
//   4. telefonul: ecranele (simulatorul, planul șoferului, lista), rutele, meniul, adresele (aceleași ca anunțurile),
//      pe aceleași rute ale serverului; telefonul nu socotește; culorile au pereche pe ambele teme (contrast măsurat);
//   5. pe server pornit: salvarea (fără marfă — refuz), trimiterea (doar unui om activ al firmei), șoferul își vede planul
//      FĂRĂ drepturi pe camion, „Am o problemă" (cu text) / „Am încărcat" anunță cine a trimis, rolul „Dispecer" face și
//      trimite planuri, altă firmă și noi (super-admin) nu vedem planurile firmei, planul reluat dispare de la șofer până
//      pleacă din nou, ștergerea, modulul oprit.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

const ROOT = __dirname;
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const taie = (src, de, pana) => { const i = src.indexOf(de); if (i < 0) return ''; const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j); };
const faraComentarii = (s) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');

const html = citeste('public/index.html');
const css = citeste('public/css/app.css');
const server = citeste('server.js');
const db = citeste('db.js');
const F = {
  simulator: 'mobile/src/screens/Simulator.tsx', sofer: 'mobile/src/screens/PlanSofer.tsx', lista: 'mobile/src/screens/PlanuriIncarcare.tsx',
  desen: 'mobile/src/lib/simDesen.ts', inc: 'mobile/src/lib/incarcare.ts', css: 'mobile/src/screens/simulator.css', app: 'mobile/src/App.tsx',
  meniu: 'mobile/src/screens/Menu.tsx', endpoints: 'mobile/src/api/endpoints.ts', push: 'mobile/src/lib/push.ts', tokens: 'mobile/src/theme/tokens.css',
};
const M = {};
Object.keys(F).forEach((k) => { M[k] = citeste(F[k]); });
sect('0. Fișierele');
const lipsa = Object.keys(F).filter((k) => !M[k]);
T('pagina, serverul, regulile și fișierele telefonului există', html && server && citeste('incarcare.js') && !lipsa.length, lipsa.map((k) => F[k]).join(', '));

// ─── 1. Textele planului ─────────────────────────────────────────────────────────────────────────────────────────
sect('1. Textele planului (incarcare.js)');
const I = require('./incarcare.js');
const ACUM = Date.UTC(2026, 9, 12, 13, 32);   // 16:32 pe ora României (ora de vară)
T('ora: azi', I.cand(ACUM - 5 * 60000, ACUM) === 'azi, 16:27', I.cand(ACUM - 5 * 60000, ACUM));
T('ora: după miezul nopții României e „azi" (deși pe ceasul serverului, UTC, e încă ieri)', I.cand(Date.UTC(2026, 9, 11, 21, 30), ACUM) === 'azi, 00:30', I.cand(Date.UTC(2026, 9, 11, 21, 30), ACUM));
T('ora: ieri', I.cand(Date.UTC(2026, 9, 11, 20, 30), ACUM) === 'ieri, 23:30', I.cand(Date.UTC(2026, 9, 11, 20, 30), ACUM));
T('ora: mai demult — ziua și luna', I.cand(Date.UTC(2026, 9, 10, 4, 5), ACUM) === '10.10, 07:05', I.cand(Date.UTC(2026, 9, 10, 4, 5), ACUM));
T('ora: lipsă — nimic', I.cand(null, ACUM) === '' && I.cand(0, ACUM) === '');
const ION = { trimis_catre_nume: 'Ion Popescu' };
let st = I.stareaPlanului({}, ACUM);
T('starea: netrimis (gri)', st.fel === 'gri' && st.cheie === 'ciorna' && st.text === 'Netrimis', J(st));
st = I.stareaPlanului(Object.assign({ trimis_la: ACUM - 60000 }, ION), ACUM);
T('starea: trimis (galben), cu omul, ora și ce așteaptă', st.fel === 'galben' && st.cheie === 'trimis' && st.text === 'Trimis lui Ion Popescu, azi, 16:31 — așteaptă „Am încărcat”', st.text);
st = I.stareaPlanului(Object.assign({ trimis_la: ACUM - 60000, incarcat_la: ACUM }, ION), ACUM);
T('starea: încărcat (verde)', st.fel === 'verde' && st.cheie === 'incarcat' && st.text === 'Încărcat — Ion Popescu, azi, 16:32', st.text);
st = I.stareaPlanului(Object.assign({ trimis_la: ACUM - 9e5, incarcat_la: ACUM - 6e5, problema_la: ACUM, problema_text: 'Au venit 2 paleți în plus' }, ION), ACUM);
T('starea: o problemă DUPĂ „Am încărcat" (roșu), cu textul șoferului', st.fel === 'rosu' && st.cheie === 'problema' && st.text === 'Problemă de la Ion Popescu, azi, 16:32: „Au venit 2 paleți în plus”', st.text);
st = I.stareaPlanului(Object.assign({ trimis_la: ACUM - 9e5, problema_la: ACUM - 6e5, problema_text: 'x', incarcat_la: ACUM }, ION), ACUM);
T('starea: „Am încărcat" DUPĂ o problemă — rezolvat (verde)', st.cheie === 'incarcat', J(st));
T('nota de sub plan: cine l-a trimis, când, și ce face șoferul dacă se schimbă marfa',
  I.notaSofer({ trimis_de_nume: 'Maria Dispecer', trimis_la: ACUM - 3600000 }, ACUM) === 'Trimis de Maria Dispecer azi, 15:32. Dacă se schimbă marfa la rampă, spune-i: reface planul și ți-l trimite din nou.',
  I.notaSofer({ trimis_de_nume: 'Maria Dispecer', trimis_la: ACUM - 3600000 }, ACUM));

const PRELATA = { id: 1, plate: 'B 501 RAT', fel: 'semiremorca', tip: 'prelata', lungime_m: 13.6, latime_m: 2.48, inaltime_m: 2.7, sarcina_kg: 24000, tara_kg: 7000, nr_axe: 3, pivot_axe_m: 7.8, limita_axe_kg: 24000 };
const MEGA = Object.assign({}, PRELATA, { id: 3, plate: 'B 503 RAT', tip: 'mega', inaltime_m: 3.0 });
const TRAC = I.vehiculDin({ imei: '1', plate: 'B 101 RAT', vehicle_type: 'Autotractor' });
const CAMION = I.vehiculDin({ imei: '2', plate: 'B 404 RAT', inc_fel: 'camion12' });
const CAMION75 = I.vehiculDin({ imei: '3', plate: 'B 405 RAT', inc_fel: 'camion75' });
const DUBA = I.vehiculDin({ imei: '4', plate: 'B 406 RAT', inc_fel: 'duba35' });
const REM = I.remorcaDin({ id: 2, plate: 'B 601 RAT', fel: 'remorca', tip: 'prelata', lungime_m: 7.7, latime_m: 2.48, inaltime_m: 2.7, sarcina_kg: 11000, tara_kg: 5000, axa_fata_m: 1.6, pivot_axe_m: 4.6, limita_axe_kg: 18000 });
const EUR = (buc, o) => Object.assign({ nume: 'Paleți EUR', lungime: 120, latime: 80, inaltime: 150, kg: 500, buc, oprire: 1, suprapus: false }, o || {});
const MIX = [EUR(12, { kg: 650 }), EUR(10, { nume: 'Colete', kg: 180, inaltime: 110, suprapus: true, oprire: 2 }), EUR(6, { nume: 'Paleți industriali', kg: 520, latime: 100, inaltime: 120, oprire: 3 })];
const OPRIRI = ['Pitești', 'Sibiu', 'Cluj-Napoca'];
let r = I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: MIX, mod: 'opriri', opriri: OPRIRI });
T('pașii: în ordinea încărcării — ultima oprire întâi, lipită de peretele din față; prima oprire ultima, spre uși',
  J(r.pasi.map((x) => x.text)) === J(['Cluj-Napoca — 6 × Paleți industriali', 'Sibiu — 10 × Colete', 'Pitești — 12 × Paleți EUR']) && J(r.pasi.map((x) => x.nr)) === J([1, 2, 3]), J(r.pasi.map((x) => x.text)));
T('…cu amănuntele pe înțelesul șoferului (unde, câte straturi, cât cântărește bucata)',
  r.pasi[0].detaliu === 'Primii, lipiți de peretele din față. 520 kg bucata.' && r.pasi[1].detaliu === 'Câte 2, unul peste altul. 180 kg bucata.' &&
  r.pasi[2].detaliu === 'Ultimii, spre uși: se descarcă primii. 650 kg bucata.', J(r.pasi.map((x) => x.detaliu)));
T('…și culoarea opririi = cea din desen (CULORI_OPRIRI)', r.pasi.every((x) => x.culoare === I.CULORI_OPRIRI[x.oprire - 1]));
T('rezumatul osiilor (exemplul din machetă): în regulă, fiecare axă, totalul',
  r.osiiRezumat.fel === 'verde' && r.osiiRezumat.titlu === 'Greutatea pe osii: în regulă' &&
  r.osiiRezumat.text === 'Axa față 6,4 t din 8,0 t · axa motoare 9,3 t din 11,5 t · axele semiremorcii 11,9 t din 24,0 t · total 27,5 t din 40,0 t', J(r.osiiRezumat));
T('rezumatul șoferului: greutatea, coletele, cât mai e liber din lungime; nimic la rampă',
  J(r.rezumatSofer) === J({ greutate: '12.720 kg · 28 de colete', liber: 'liber 3,4 m', lungime: '13,6 m', ramane: '' }), J(r.rezumatSofer));
r = I.simuleaza({ vehicul: CAMION, remorca: REM, marfa: [EUR(14, { kg: 300 }), EUR(16, { nume: 'Lăzi', kg: 200 }), EUR(80, { nume: 'Prea multe', kg: 10 })] });
T('camion + remorcă: pașii spun unde merge marfa (în camion / în camion și în remorcă / în remorcă) și cât nu încape',
  r.pasi[0].detaliu === 'Primii, lipiți de peretele din față. În camion. 300 kg bucata.' && r.pasi[1].detaliu === 'În camion și în remorcă. 200 kg bucata.' &&
  r.pasi[2].detaliu === 'Ultimii, spre uși: se descarcă primii. În remorcă. 10 kg bucata. Nu încap 77.', J(r.pasi.map((x) => x.detaliu)));
T('…iar ce nu încape e spus și în rezumatul șoferului (rămâne la rampă)', r.rezumatSofer.ramane === 'Rămân la rampă (nu încap): 77 × Prea multe.', r.rezumatSofer.ramane);
r = I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: [EUR(2, { nume: 'Prea înalt', inaltime: 300 }), EUR(3, { oprire: 2 }), EUR(1, { nume: 'Lada', oprire: 1 })], opriri: ['A', 'B'] });
T('un rând care nu încape DELOC nu e un pas — dar șoferul află că rămâne la rampă',
  r.pasi.length === 2 && !r.pasi.some((x) => /Prea înalt/.test(x.text)) && r.rezumatSofer.ramane === 'Rămân la rampă (nu încap): 2 × Prea înalt.', J([r.pasi.map((x) => x.text), r.rezumatSofer.ramane]));
T('o singură bucată se scrie la singular („Ultimul, spre uși: se descarcă primul.")', r.pasi[1].text === 'A — 1 × Lada' && /^Ultimul, spre uși: se descarcă primul\./.test(r.pasi[1].detaliu), r.pasi[1].detaliu);
T('un singur pas cu o singură bucată: „Lipit de peretele din față."', I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: [EUR(1)] }).pasi[0].detaliu === 'Lipit de peretele din față. 500 kg bucata.');
r = I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: [] });
T('fără marfă: niciun pas, osiile gri, „0 kg · 0 colete"', r.pasi.length === 0 && r.osiiRezumat.fel === 'gri' && r.rezumatSofer.greutate === '0 kg · 0 colete', J([r.osiiRezumat, r.rezumatSofer]));
const plin = I.vehiculDin({ imei: '9', plate: 'B 102 RAT', inc_fel: 'autotractor', inc_ampatament: 3.6, inc_sa_axa: 0.6, inc_tara_fata: 5100, inc_tara_spate: 2700, max_axle_loads: { axle1: 7500, axle2: 11500 }, max_weight_legal: 40000 });
r = I.simuleaza({ vehicul: plin, semi: I.semiDin(PRELATA), marfa: [EUR(24, { kg: 1000 })], opriri: ['A'] });
T('peste limită: rezumatul osiilor e roșu, „de corectat"', r.osiiRezumat.fel === 'rosu' && r.osiiRezumat.titlu === 'Greutatea pe osii: de corectat', J(r.osiiRezumat));

// ─── 2. Desenul e unul: pagina și telefonul ──────────────────────────────────────────────────────────────────────
sect('2. Desenul: pagina și telefonul dau același SVG');
const blocDesen = taie(html, '// ── începe „desenul simulatorului" ──', '// ── sfârșit „desenul simulatorului" ──');
T('desenul paginii stă între repere, ca funcție curată (_simSvg, _simMix)', /function _simSvg\(R, view, yaw, culoare\)/.test(blocDesen) && /function _simMix\(hex, spreAlb, t\)/.test(blocDesen));
const ruleaza = (cod, fisier) => { const m = { exports: {} }; vm.runInNewContext(cod, { module: m, exports: m.exports }, { filename: fisier }); return m.exports; };
let WEB = {}, TEL = {};
try { WEB = ruleaza(blocDesen + '\nmodule.exports = { simSvg: _simSvg, simMix: _simMix };', 'index.html#desenul-simulatorului'); } catch (e) { console.log('    (desenul paginii: ' + e.message + ')'); }
// Telefonul: TypeScript din mobile/node_modules sau de la rădăcină (în CI); fără el, fișierul e oricum JS curat cu un export la coadă.
let ts = null;
try { ts = require(path.join(ROOT, 'mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { ts = null; } }
try {
  const cod = ts ? ts.transpileModule(M.desen, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: 'simDesen.ts' }).outputText
    : M.desen.replace(/export \{ _simSvg as simSvg, _simMix as simMix \};\s*$/, 'module.exports = { simSvg: _simSvg, simMix: _simMix };');
  TEL = ruleaza(cod, 'simDesen.ts');
} catch (e) { console.log('    (simDesen.ts: ' + e.message + ')'); }
T('amândouă se încarcă și desenează', typeof WEB.simSvg === 'function' && typeof TEL.simSvg === 'function');
const culoare = (n) => I.CULORI_OPRIRI[(Math.max(1, n) - 1) % I.CULORI_OPRIRI.length];
const CAZURI = [
  ['autotractor + prelată, trei opriri', I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: MIX, mod: 'opriri', opriri: OPRIRI })],
  ['autotractor + mega, greutate echilibrată', I.simuleaza({ vehicul: TRAC, semi: I.semiDin(MEGA), marfa: MIX, mod: 'echilibrat', opriri: OPRIRI })],
  ['camion 12 t', I.simuleaza({ vehicul: CAMION, marfa: [EUR(9, { kg: 400 })] })],
  ['camion 12 t + remorcă (marfa trece în remorcă)', I.simuleaza({ vehicul: CAMION, remorca: REM, marfa: [EUR(30, { kg: 300 })] })],
  ['dubă 3,5 t', I.simuleaza({ vehicul: DUBA, marfa: [EUR(2, { kg: 300, inaltime: 100 })] })],
  ['camion 7,5 t, marfă care nu încape', I.simuleaza({ vehicul: CAMION75, marfa: [EUR(40)] })],
  ['fără marfă', I.simuleaza({ vehicul: TRAC, semi: I.semiDin(PRELATA), marfa: [] })],
];
const VEDERI = ['lat', 'sus', '3d'], UNGHIURI = [0, 32, 45, 90, 135, 180, 225, 270, 315, 359];
let comparate = 0, diferite = [];
if (WEB.simSvg && TEL.simSvg) {
  CAZURI.forEach(([nume, R]) => VEDERI.forEach((v) => UNGHIURI.forEach((y) => {
    comparate++;
    const a = WEB.simSvg(R, v, y, culoare), b = TEL.simSvg(R, v, y, culoare);
    if (a !== b || !/<polygon /.test(a)) diferite.push(nume + ' / ' + v + ' / ' + y + '°');
  })));
}
T('același desen pe ' + comparate + ' de combinații (7 simulări × 3 vederi × 10 unghiuri)', comparate === 210 && !diferite.length, diferite.slice(0, 6).join('; '));
T('vederea 3D se rotește (alt unghi = alt desen), lateral și de sus nu depind de unghi',
  WEB.simSvg && WEB.simSvg(CAZURI[0][1], '3d', 0, culoare) !== WEB.simSvg(CAZURI[0][1], '3d', 90, culoare) && WEB.simSvg(CAZURI[0][1], 'sus', 0, culoare) === WEB.simSvg(CAZURI[0][1], 'sus', 90, culoare));
T('fără simulare: nimic de desenat (amândouă)', WEB.simSvg && WEB.simSvg(null, 'lat', 0, culoare) === '' && TEL.simSvg(null, 'lat', 0, culoare) === '');
const corp = (s) => faraComentarii(s).replace(/export \{[^}]*\};?/, '').replace(/\s+/g, '');
T('copia telefonului e ÎNTOCMAI blocul paginii (fără comentarii și spații) — schimbi desenul pe web, copiezi blocul aici',
  corp(blocDesen) === corp(M.desen.replace(/^\/\/ @ts-nocheck[^\n]*\n/, '')), 'diferă — copiază blocul „desenul simulatorului" în ' + F.desen);
T('…și spune asta în capul fișierului', /^\/\/ @ts-nocheck — copie întocmai a desenului din pagină/.test(M.desen) && /export \{ _simSvg as simSvg, _simMix as simMix \};\s*$/.test(M.desen));
T('pagina desenează cu aceeași funcție ecranul simulatorului și planul șoferului (văzut de sus)',
  /svg\.innerHTML = _simSvg\(S\.rez, S\.view, S\.yaw, culoare\);/.test(html) && /_simSvg\(R, 'sus', 32, culoare\)/.test(html));
T('culoarea unei opriri se alege la fel pe web și pe telefon (din culorile trimise de server)',
  /const culoare = \(n\) => \{ const c = \(S\.meta && S\.meta\.culoriOpriri\) \|\| \['#3B82F6'\]; return c\[\(Math\.max\(1, n\) - 1\) % c\.length\]; \};/.test(html) &&
  /const culoare = \(n: number\) => \{ const c = \(meta && meta\.culoriOpriri\) \|\| \['#3B82F6'\]; return c\[\(Math\.max\(1, n\) - 1\) % c\.length\]; \};/.test(M.simulator) &&
  /const culoare = \(n: number\) => culori\[\(Math\.max\(1, n\) - 1\) % culori\.length\];/.test(M.sofer) && /m\.culoriOpriri/.test(M.sofer));
// 13.10 (Robert: „mai lucrează la desenul mașinii" + „da" la hârtie): fiecare piesă a desenului are culorile ei pe AMBELE
// teme, pe web și pe telefon (altfel iese neagră), iar hârtia PDF pune pe pagină ACELAȘI desen — citit din pagină, cu
// culorile temei deschise — nu un al doilea.
const claseDesen = {};
if (WEB.simSvg) CAZURI.forEach(([, R]) => VEDERI.forEach((v) => [0, 32, 215, 300].forEach((y) => {
  (WEB.simSvg(R, v, y, culoare).match(/class="sim-[\w-]+"/g) || []).forEach((m) => { claseDesen[m.slice(7, -1)] = 1; });
})));
const CLASE = Object.keys(claseDesen);
const areRegula = (k) => [new RegExp('(^|\\}\\s*|,\\s*)\\.sim-svg \\.' + k + '\\b', 'm').test(css), new RegExp('body\\.dark \\.sim-svg \\.' + k + '\\b').test(css),
  new RegExp('(^|\\}\\s*|,\\s*)\\.ts-svg \\.' + k + '\\b', 'm').test(M.css), new RegExp(':root\\[data-theme="light"\\] \\.ts-svg \\.' + k + '\\b').test(M.css)];
const faraCuloare = CLASE.filter((k) => !areRegula(k).every(Boolean));
T('fiecare piesă a desenului (' + CLASE.length + ' de clase) are culori pe ambele teme, pe web și pe telefon', CLASE.length >= 35 && !faraCuloare.length,
  CLASE.length + ' · ' + faraCuloare.map((k) => k + ' ' + areRegula(k).map((x) => (x ? '✓' : '✗')).join('')).join(', '));
const PDFP = require('./incarcare_pdf.js');
const DP = PDFP.desenPagina();
const faraPeHartie = CLASE.filter((k) => !(DP && DP.stil[k] && (DP.stil[k].fill || DP.stil[k].stroke)));
T('hârtia citește desenul din pagină (blocul „desenul simulatorului") și culorile temei deschise din app.css, pentru fiecare piesă',
  !!DP && typeof DP.simSvg === 'function' && !!DP.stil._fond && !faraPeHartie.length, DP ? faraPeHartie.join(', ') : 'desenul nu s-a încărcat');
if (DP && WEB.simSvg) {
  const PDFDocument = require('pdfkit');
  const cate = (s, el) => (s.match(new RegExp('<' + el + ' ', 'g')) || []).length;
  const rau = [];
  CAZURI.forEach(([nume, R]) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    doc.registerFont('Nunito', path.join(ROOT, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(ROOT, 'fonts', 'DejaVuSans-Bold.ttf'));
    let poli = 0, pagini = 1;
    const p0 = doc.polygon.bind(doc);
    doc.polygon = function () { poli++; return p0.apply(null, arguments); };
    doc.on('pageAdded', () => { pagini++; });
    PDFP.scriePlan(doc, R, { generatLa: ACUM });
    doc.end();
    const astept = cate(WEB.simSvg(R, 'sus', 32, culoare), 'polygon') + cate(WEB.simSvg(R, 'lat', 32, culoare), 'polygon');
    if (poli !== astept || pagini !== 1) rau.push(nume + ': ' + poli + ' poligoane (ecranul: ' + astept + '), ' + pagini + ' pagini');
  });
  T('hârtia pune pe pagină exact poligoanele ecranului (de sus + lateral), pe o pagină, pe toate cele ' + CAZURI.length + ' simulări', !rau.length, rau.join('; '));
}
T('hârtia nu mai are al doilea desen (cabina dreptunghi, axele cerc, scara proprie)', !/doc\.rect\(X\(|doc\.circle\(X\(|const cabX1 = rez\.trac/.test(citeste('incarcare_pdf.js')));

// ─── 3. Pagina ───────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Pagina: „Trimite șoferului", planurile, fereastra șoferului, anunțurile');
const BS = taie(html, '// ── începe „simulatorul de încărcare" ──', '// ── sfârșit „simulatorul de încărcare" ──');
T('butonul „Trimite șoferului" e în capul simulatorului, lângă „Planuri" și PDF', /id="sim-trimite"[^>]*onclick="simTrimite\(\)"[^>]*>[\s\S]{0,80}Trimite șoferului/.test(BS) && /onclick="simPlanuri\(\)"/.test(BS));
T('„Trimite șoferului" salvează întâi (nou → POST, deschis → PUT), apoi cere oamenii firmei și trimite',
  /fetch\('\/api\/incarcare\/planuri' \+ \(S\.planId \? '\/' \+ encodeURIComponent\(S\.planId\) : ''\), \{ method: S\.planId \? 'PUT' : 'POST'/.test(BS) &&
  /fetch\('\/api\/incarcare\/destinatari/.test(BS) && /'\/trimite', \{ method: 'POST'/.test(BS));
T('funcțiile planurilor sunt pe window (le cheamă butoanele din atribute)',
  ['simTrimite', 'simTrimiteLa', 'simPlanuri', 'simDeschidePlan', 'simStergePlan', 'simPlanSofer', 'simIncarcat', 'simProblema', 'simPlanNou'].every((f) => new RegExp('window\\.' + f + ' = ').test(BS)),
  ['simTrimite', 'simTrimiteLa', 'simPlanuri', 'simDeschidePlan', 'simStergePlan', 'simPlanSofer', 'simIncarcat', 'simProblema', 'simPlanNou'].filter((f) => !new RegExp('window\\.' + f + ' = ').test(BS)).join(', '));
T('fereastra șoferului: textele vin de la server (pașii, osiile, ce rămâne la rampă, nota, starea) și butoanele doar pentru el',
  /R\.pasi\.map/.test(BS) && /R\.osiiRezumat\.titlu/.test(BS) && /R\.rezumatSofer\.ramane/.test(BS) && /j\.notaSofer/.test(BS) && /st\.text/.test(BS) &&
  /\(p\.alMeu \? '<div class="sim-chips"[\s\S]{0,200}simProblema\(' \+ p\.id \+ '\)[\s\S]{0,200}simIncarcat\(' \+ p\.id \+ '\)/.test(BS));
T('pagina nu socotește starea planului și nici ora (stareaPlanului / cand stau pe server)', !/function (stareaPlanului|cand|notaSofer)\b/.test(BS) && /p\.stare|plan\.stare|S\.plan\.stare/.test(BS));
T('rolul omului din listă vine scris de server (pagina nu-și ține a doua listă de nume)', /esc\(o\.rol\)/.test(BS) && !/ROLE_LABELS\[o\.rol\]/.test(BS));
T('anunțurile planurilor: „Plan de încărcare" deschide planul șoferului, „Încărcat" / „Problemă" — planul în simulator',
  /const isPlan = \/\^plan_\(incarcare\|incarcat\|problema\)\$\/\.test\(n\.type\);/.test(html) && /function notifPlan\(id, tip\)/.test(html) &&
  /if \(tip === 'plan_incarcare'\) \{ if \(window\.simPlanSofer\) window\.simPlanSofer\(d\.planId\); \}/.test(html) && /window\.simDeschidePlan\(d\.planId\)/.test(html));
T('fereastra și butonul plin au stilurile lor (.sim-ov peste tot, .sim-pri pe verde, pașii numerotați)',
  /\.sim-ov \{ position: fixed; inset: 0; z-index: 2200;/.test(css) && /\.sim \.sim-btn\.sim-pri \{ background: var\(--accent\); border-color: var\(--accent\); color: #06210F; \}/.test(css) && /\.sim-pnr \{/.test(css));

// ─── 4. Telefonul ────────────────────────────────────────────────────────────────────────────────────────────────
sect('4. Telefonul: ecranele, rutele, meniul, aceleași rute ale serverului');
let INC = {};
try {
  const cod = ts ? ts.transpileModule(M.inc, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: 'incarcare.ts' }).outputText : null;
  if (cod) INC = ruleaza(cod, 'incarcare.ts');
} catch (e) { console.log('    (incarcare.ts: ' + e.message + ')'); }
if (ts) {
  T('adresele planurilor (lib/incarcare.ts): planul șoferului, planul în simulator, lista',
    INC.rutaPlanSofer(35) === '/incarcare/plan/35' && INC.rutaPlanSimulator(35) === '/incarcare?plan=35' && INC.RUTA_PLANURI === '/incarcare/planuri',
    [INC.rutaPlanSofer && INC.rutaPlanSofer(35), INC.rutaPlanSimulator && INC.rutaPlanSimulator(35), INC.RUTA_PLANURI].join(' | '));
} else console.log('  ⤼ sărit: adresele rulate (fără TypeScript)');
T('rutele ecranelor sunt cele trei adrese (App.tsx)',
  /<Route path="\/incarcare" component=\{Simulator\} \/>/.test(M.app) && /<Route path="\/incarcare\/planuri" component=\{PlanuriIncarcare\} \/>/.test(M.app) &&
  /<Route path="\/incarcare\/plan\/:id" component=\{PlanSofer\} \/>/.test(M.app));
T('simulatorul de pe telefon deschide planul din adresă (?plan=), ca anunțurile', /\(\(loc\.query \|\| \{\}\) as any\)\.plan/.test(M.simulator) && /Api\.planIncarcare\(Number\(planDinAdresa\)\)/.test(M.simulator));
T('meniul: „Simulator încărcare" pentru cine face planuri (ca pe web), „Planurile de încărcare" pentru oricine din firmă',
  /modulIncarcare\(u\) && \(u\?\.isSuper \|\| perms\.manageFleet \|\| u\?\.role === 'dispatcher'\) && item\('boxes', 'Simulator încărcare', \(\) => loc\.route\('\/incarcare'\)\)/.test(M.meniu) &&
  /modulIncarcare\(u\) && item\('clipboard', 'Planurile de încărcare', \(\) => loc\.route\(RUTA_PLANURI\)\)/.test(M.meniu));
T('…iar regula „cine face planuri" e aceeași pe server, pe web și pe telefon (cine modifică flota sau e dispecer)',
  /const _incDispecer = \(req\) => req\.isSuper \|\| permReq\(req, 'manageFleet'\) \|\| getAuth\(req\)\.role === 'dispatcher';/.test(server) &&
  /\(\(me\.permissions && me\.permissions\.manageFleet\) \|\| me\.role === 'dispatcher'\)/.test(html) &&
  /const dispecer = !!\(me\.value\?\.isSuper \|\| me\.value\?\.permissions\?\.manageFleet \|\| me\.value\?\.role === 'dispatcher'\);/.test(M.lista));
// Fiecare apel al telefonului are ruta lui pe server (aceeași cale, aceeași metodă).
const RUTE_TEL = [
  ['incarcareFlota', "'/api/incarcare/flota'", 'get', '/api/incarcare/flota'],
  ['simuleaza', "'/api/incarcare/simuleaza', { method: 'POST'", 'post', '/api/incarcare/simuleaza'],
  ['planuriIncarcare', "'/api/incarcare/planuri')", 'get', '/api/incarcare/planuri'],
  ['planIncarcare', "'/api/incarcare/planuri/' + encodeURIComponent(String(id)))", 'get', '/api/incarcare/planuri/:id'],
  ['salveazaPlan', "{ method: id ? 'PUT' : 'POST', body: b }", 'put', '/api/incarcare/planuri/:id'],
  ['stergePlan', "{ method: 'DELETE' }", 'delete', '/api/incarcare/planuri/:id'],
  ['destinatariPlan', "'/api/incarcare/destinatari'", 'get', '/api/incarcare/destinatari'],
  ['trimitePlan', "'/trimite', { method: 'POST', body: { user_id: userId } }", 'post', '/api/incarcare/planuri/:id/trimite'],
  ['planIncarcat', "'/incarcat', { method: 'POST'", 'post', '/api/incarcare/planuri/:id/incarcat'],
  ['planProblema', "'/problema', { method: 'POST', body: { text } }", 'post', '/api/incarcare/planuri/:id/problema'],
];
const randEp = (k) => (M.endpoints.match(new RegExp('\\n  ' + k + ': [^\\n]+')) || [''])[0];
const lipsesc = RUTE_TEL.filter(([k, bucata, met, ruta]) => randEp(k).indexOf(bucata) < 0 || server.indexOf("app." + met + "('" + ruta + "', requireAuth, withScope, requireFeature('incarcare')") < 0);
T('fiecare apel al telefonului (' + RUTE_TEL.length + ') are ruta lui pe server, cu drepturile și modulul', !lipsesc.length, lipsesc.map((x) => x[0]).join(', '));
T('…și salvarea planului nou merge pe POST /api/incarcare/planuri', server.indexOf("app.post('/api/incarcare/planuri', requireAuth, withScope, requireFeature('incarcare')") >= 0);
T('hârtia de pe telefon = aceeași rută ca pe web (POST /api/incarcare/pdf), salvată cu numele din antet', /salveazaPostDeLaServer\('\/api\/incarcare\/pdf', corp\(\)/.test(M.simulator));
const TEL_ECRANE = M.simulator + M.sofer + M.lista;
T('telefonul nu așază marfa, nu socotește osii și nici starea planului (le primește de la server)',
  !/aranjeaza|osii\(|PIVOT|PARTE_TARA|stareaPlanului|notaSofer\(|function cand/.test(TEL_ECRANE) && /R\.pasi\.map/.test(M.sofer) && /R\.osiiRezumat/.test(M.sofer) &&
  /R\.rezumatSofer\.ramane/.test(M.sofer) && /j\.notaSofer/.test(M.sofer) && /p\.stare/.test(M.lista));
T('desenul de pe telefon e copia (simSvg), pus cu aceleași trei vederi și rotit cu butoanele sau trăgând cu degetul',
  /import \{ simSvg \} from '\.\.\/lib\/simDesen';/.test(M.simulator) && /simSvg\(R, view, yaw, culoare\)/.test(M.simulator) &&
  /\[\['lat', 'Lateral'\], \['sus', 'De sus'\], \['3d', '3D'\]\]/.test(M.simulator) && /onPointerMove=/.test(M.simulator) && /simSvg\(R, 'sus', 32, culoare\)/.test(M.sofer));
T('ecranul șoferului: „Am o problemă" (cu text, obligatoriu) și „Am încărcat" — doar pe planul trimis LUI',
  /\{p && p\.alMeu && \(\s*<div class="ts-jos">/.test(M.sofer) && /Api\.planIncarcat\(id\)/.test(M.sofer) && /Api\.planProblema\(id, text\)/.test(M.sofer) &&
  /disabled=\{lucru \|\| !problema\.trim\(\)\}/.test(M.sofer));
T('„Ai schimbat planul" se socotește din ce e pe ecran față de planul salvat (nu se ține minte)',
  /const modificat = !!\(planId && plan && semn\(/.test(M.simulator) && !/setModificat/.test(M.simulator));
T('lista: ce e trimis MIE se deschide ca la șofer, restul (la dispecer) în simulator', /p\.alMeu \|\| !dispecer \? rutaPlanSofer\(p\.id\) : rutaPlanSimulator\(p\.id\)/.test(M.lista));
T('planul în lucru stă în telefon cu try/catch (o comoditate, nu o salvare)', /try \{ localStorage\.setItem\(CHEIE/.test(M.simulator) && /try \{ t = JSON\.parse\(localStorage\.getItem\(CHEIE/.test(M.simulator));
// Culorile: perechi pe ambele teme, contrastul măsurat din CSS (tonul pe fundalul lui).
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const amesteca = (c, p, fundal) => c.map((x, i) => x * p + fundal[i] * (1 - p));
const ia = (re, src) => { const m = (src || M.css).match(re); return m ? m.slice(1) : null; };
const tok = (nume, light) => { const bloc = light ? taie(M.tokens, ':root[data-theme="light"] {', '}') : taie(M.tokens, ':root, :root[data-theme="dark"] {', '}'); const m = bloc.match(new RegExp('--' + nume + ': (#[0-9a-fA-F]{6})')); return m ? hex(m[1]) : null; };
const TON_I = { verde: ia(/\.ts-pad \.ton-verde, \.sheet \.ton-verde \{ color: (#[0-9a-fA-F]{6}); \}/), galben: ia(/\.ts-pad \.ton-galben, \.sheet \.ton-galben \{ color: (#[0-9a-fA-F]{6}); \}/), rosu: ia(/\.ts-pad \.ton-rosu, \.sheet \.ton-rosu \{ color: (#[0-9a-fA-F]{6}); \}/) };
const TON_D = { verde: ia(/:root\[data-theme="light"\] \.ts-pad \.ton-verde, :root\[data-theme="light"\] \.sheet \.ton-verde \{ color: (#[0-9a-fA-F]{6}); \}/),
  galben: ia(/:root\[data-theme="light"\] \.ts-pad \.ton-galben, :root\[data-theme="light"\] \.sheet \.ton-galben \{ color: (#[0-9a-fA-F]{6}); \}/),
  rosu: ia(/:root\[data-theme="light"\] \.ts-pad \.ton-rosu, :root\[data-theme="light"\] \.sheet \.ton-rosu \{ color: (#[0-9a-fA-F]{6}); \}/) };
const MSG_I = { verde: ia(/\.ts-msg\.ton-verde \{ border-color: #[0-9a-fA-F]{6}; background: (#[0-9a-fA-F]{6}); \}/), galben: ia(/\.ts-msg\.ton-galben \{ border-color: #[0-9a-fA-F]{6}; background: (#[0-9a-fA-F]{6}); \}/), rosu: ia(/\.ts-msg\.ton-rosu \{ border-color: #[0-9a-fA-F]{6}; background: (#[0-9a-fA-F]{6}); \}/) };
const MSG_D = { verde: ia(/:root\[data-theme="light"\] \.ts-msg\.ton-verde \{ border-color: #[0-9a-fA-F]{6}; background: rgba\((\d+), (\d+), (\d+), (\.\d+)\); \}/),
  galben: ia(/:root\[data-theme="light"\] \.ts-msg\.ton-galben \{ border-color: #[0-9a-fA-F]{6}; background: rgba\((\d+), (\d+), (\d+), (\.\d+)\); \}/),
  rosu: ia(/:root\[data-theme="light"\] \.ts-msg\.ton-rosu \{ border-color: #[0-9a-fA-F]{6}; background: rgba\((\d+), (\d+), (\d+), (\.\d+)\); \}/) };
const GALBEN_MSG_D = ia(/:root\[data-theme="light"\] \.ts-pad \.ts-msg\.ton-galben, :root\[data-theme="light"\] \.sheet \.ts-msg\.ton-galben \{ color: (#[0-9a-fA-F]{6}); \}/);
const toate = [TON_I.verde, TON_I.galben, TON_I.rosu, TON_D.verde, TON_D.galben, TON_D.rosu, MSG_I.verde, MSG_I.galben, MSG_I.rosu, MSG_D.verde, MSG_D.galben, MSG_D.rosu, GALBEN_MSG_D];
T('tonurile au pereche pe fiecare temă (cifrele, mesajele)', toate.every(Boolean) && tok('bg-card', false) && tok('bg-card', true) && tok('bg-darkest', true), toate.map((x) => !!x).join(','));
if (toate.every(Boolean) && tok('bg-card', true)) {
  const cInchis = tok('bg-card', false), cDeschis = tok('bg-card', true), ecranDeschis = tok('bg-darkest', true);
  const masurat = [];
  ['verde', 'galben', 'rosu'].forEach((k) => {
    masurat.push(['cifra ' + k + ' (închisă)', contrast(hex(TON_I[k][0]), cInchis)]);
    masurat.push(['cifra ' + k + ' (deschisă)', contrast(hex(TON_D[k][0]), cDeschis)]);
    masurat.push(['mesaj ' + k + ' (închisă)', contrast(hex(TON_I[k][0]), hex(MSG_I[k][0]))]);
    const fd = amesteca([+MSG_D[k][0], +MSG_D[k][1], +MSG_D[k][2]], +MSG_D[k][3], ecranDeschis);
    masurat.push(['mesaj ' + k + ' (deschisă)', contrast(hex(k === 'galben' ? GALBEN_MSG_D[0] : TON_D[k][0]), fd)]);
  });
  const sub = masurat.filter((x) => x[1] < 4.5);
  T('contrastul tonurilor e ≥ 4,5 pe ambele teme (cifrele pe card, mesajele pe fundalul lor)', !sub.length, sub.map((x) => x[0] + ' = ' + x[1].toFixed(2)).join('; '));
}
T('desenul de pe telefon are culorile lui pe ambele teme (structura, roțile, centrul de greutate)',
  ['sim-cab1', 'sim-podea', 'sim-perete', 'sim-contur', 'sim-roata', 'sim-axa', 'sim-cg', 'sim-tl'].every((k) => new RegExp('\\.ts-svg \\.' + k + '\\b').test(M.css) && new RegExp(':root\\[data-theme="light"\\] \\.ts-svg \\.' + k + '\\b').test(M.css)));
T('butonul plin are textul închis al casei pe verde (#06210F), ca pe web', /\.ts-btn\.pri \{ background: var\(--accent\); border-color: var\(--accent\); color: #06210F; \}/.test(M.css));
// Robert, 13.10 (captura): „butoanele trebuie să fie la marginea de jos" — stăteau ridicate cât bara de file, pe ecrane fără ea.
const _fileApp = (M.app.match(/const showTabs = [^;]*;/) || [''])[0];
T('bara cu butoanele (simulatorul, planul șoferului) stă la marginea de jos: ecranele astea n-au bara de file',
  /\.ts-jos \{ position: fixed; left: 0; right: 0; bottom: 0;[^}]*padding: 10px 14px calc\(10px \+ var\(--sab, 0px\)\);/.test(M.css) &&
  !/\.ts-jos \{[^}]*tabbar-h/.test(M.css) && _fileApp.length > 20 && !/incarcare/.test(_fileApp), _fileApp);

// ─── 5. Pe server pornit ─────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3495, DIR = '.plan-incarcare-db';
try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', DEMO_DISABLED: 'true',
  SESSION_SECRET: 'ci_plan_incarcare', PORT: String(PORT), TCP_PORT: '5495', PGLITE_DIR: DIR + '/pgdata', DATABASE_URL: '' };
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
  const js = async (m, u, bb) => { const x = await fetch(B + u, { method: m, headers: H, body: bb === undefined ? undefined : J(bb) }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  return { GET: (u) => js('GET', u), POST: (u, bb) => js('POST', u, bb === undefined ? {} : bb), PUT: (u, bb) => js('PUT', u, bb), DEL: (u) => js('DELETE', u) };
}
const anunturi = async (cont) => { const x = await cont.GET('/api/notifications'); return (Array.isArray(x.j) ? x.j : []).filter((n) => /^plan_/.test(n.type)); };
const dateN = (n) => { let d = n && n.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } } return d || {}; };
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const S = await intra('admin', 'test1234');
  sect('5. Pe server pornit');
  const T1 = (await S.POST('/api/companies', { name: 'CI Transport Marfă' })).j.id;
  const T2 = (await S.POST('/api/companies', { name: 'CI Alt Transport' })).j.id;
  const T3 = (await S.POST('/api/companies', { name: 'CI Taxi' })).j.id;
  await S.POST('/api/devices', { imei: '861000000470001', name: 'Volvo FH', plate: 'B 01 TIR', company_id: T1, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: '861000000470002', name: 'Scania', plate: 'B 02 TIR', company_id: T2, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: '861000000470003', name: 'Logan', plate: 'B 03 TAX', company_id: T3, vehicle_type: 'Auto' });
  const semi = (await S.POST('/api/remorci', Object.assign({}, PRELATA, { company_id: T1, plate: 'B 50 SEM' }))).j;
  const conturi = {}, ids = {};
  for (const [u, nume, rol, co] of [['adm1@ci.ro', 'Admin Unu', 'company_admin', T1], ['disp1@ci.ro', 'Dispecer Unu', 'dispatcher', T1], ['ion@ci.ro', 'Ion Șofer', 'viewer', T1],
    ['vasile@ci.ro', 'Vasile Șofer', 'viewer', T1], ['plecat@ci.ro', 'Om Plecat', 'viewer', T1], ['adm2@ci.ro', 'Admin Doi', 'company_admin', T2], ['adm3@ci.ro', 'Admin Trei', 'company_admin', T3]]) {
    const cr = await S.POST('/api/users', { username: u, full_name: nume, role: rol, company_id: co });
    ids[u] = cr.j.id;
    await puneParola(cr.j, 'Str4da-Verde-2026', B);
    conturi[u] = await intra(u, 'Str4da-Verde-2026');
  }
  const A1 = conturi['adm1@ci.ro'], D1 = conturi['disp1@ci.ro'], V1 = conturi['ion@ci.ro'], V2 = conturi['vasile@ci.ro'], A2 = conturi['adm2@ci.ro'], A3 = conturi['adm3@ci.ro'];
  await A1.PUT('/api/users/' + ids['disp1@ci.ro'] + '/access', { devices: ['861000000470001'], groups: [] });   // dispecerul vede doar ce i s-a dat
  await A1.PUT('/api/users/' + ids['plecat@ci.ro'], { active: false });
  const cerere = { imei: '861000000470001', remorca_id: semi.id, mod: 'opriri', opriri: OPRIRI, marfa: MIX };

  let x = await D1.POST('/api/incarcare/planuri', Object.assign({}, cerere, { marfa: [] }));
  T('planul fără marfă nu se salvează', x.s === 400 && x.j.error === 'Adaugă marfa înainte să salvezi planul.', J(x));
  x = await V1.POST('/api/incarcare/planuri', cerere);
  T('șoferul (Viewer) nu face planuri', x.s === 403, x.s);
  x = await D1.POST('/api/incarcare/planuri', cerere);
  const plan = x.j;
  T('rolul „Dispecer" face planul (netrimis, făcut de el, pe camionul firmei)', x.s === 200 && plan.id && plan.stare.cheie === 'ciorna' && plan.creat_de_nume === 'Dispecer Unu' && plan.vehicul === 'B 01 TIR', J(x));
  x = await D1.GET('/api/incarcare/destinatari');
  const oameni = Array.isArray(x.j) ? x.j : [];
  T('oamenii cărora le poate trimite: cei activi ai firmei, cu rolul scris pe înțelesul omului, fără conturile noastre și fără alte firme',
    x.s === 200 && J(oameni.map((o) => o.nume + ' / ' + o.rol)) === J(['Admin Unu / Admin companie', 'Dispecer Unu / Dispecer', 'Ion Șofer / Viewer', 'Vasile Șofer / Viewer']), J(oameni));
  T('șoferul nu cere lista de oameni', (await V1.GET('/api/incarcare/destinatari')).s === 403);
  x = await D1.POST('/api/incarcare/planuri/' + plan.id + '/trimite', { user_id: ids['adm2@ci.ro'] });
  T('nu se trimite unui om al altei firme', x.s === 400 && x.j.error === 'Alege un om din firmă, cu cont activ.', J(x));
  x = await D1.POST('/api/incarcare/planuri/' + plan.id + '/trimite', { user_id: ids['plecat@ci.ro'] });
  T('nu se trimite unui cont dezactivat', x.s === 400, J(x));
  x = await D1.POST('/api/incarcare/planuri/' + plan.id + '/trimite', { user_id: ids['ion@ci.ro'] });
  T('se trimite șoferului: „Trimis lui Ion Șofer…"', x.s === 200 && x.j.stare.cheie === 'trimis' && /^Trimis lui Ion Șofer, /.test(x.j.stare.text), J(x));
  let an = await anunturi(V1);
  T('șoferul primește anunțul: „Plan de încărcare: B 01 TIR", de la cine, cât cântărește; cu planul în date',
    an.length === 1 && an[0].type === 'plan_incarcare' && an[0].title === 'Plan de încărcare: B 01 TIR' &&
    an[0].body === 'De la Dispecer Unu · 12.720 kg · 28 de colete. Deschide-l pentru ordinea de încărcare.' && Number(dateN(an[0]).planId) === plan.id, J(an));
  T('…altă firmă nu-l vede', (await anunturi(A2)).length === 0);
  x = await V1.POST('/api/incarcare/simuleaza', cerere);
  T('șoferul n-are drepturi pe camion (nu simulează pe el)…', x.s === 403, x.s);
  x = await V1.GET('/api/incarcare/planuri');
  T('…dar își vede planul în listă, ca al lui', x.s === 200 && x.j.length === 1 && x.j[0].id === plan.id && x.j[0].alMeu === true, J(x.j));
  const vs = await V1.GET('/api/incarcare/planuri/' + plan.id);
  const directa = await D1.POST('/api/incarcare/simuleaza', cerere);
  T('…și îl deschide: pașii, osiile și rezumatul = simularea dispecerului pe aceleași date; nota „Trimis de Dispecer Unu…"; fără drept de schimbat',
    vs.s === 200 && vs.j.rezultat && J(vs.j.rezultat.pasi) === J(directa.j.pasi) && J(vs.j.rezultat.osiiRezumat) === J(directa.j.osiiRezumat) &&
    J(vs.j.rezultat.rezumatSofer) === J(directa.j.rezumatSofer) && /^Trimis de Dispecer Unu /.test(vs.j.notaSofer) && vs.j.poateEdita === false, J(vs.j).slice(0, 400));
  x = await V2.POST('/api/incarcare/planuri/' + plan.id + '/incarcat');
  T('alt șofer al firmei nu apasă pe planul lui Ion (nu-l vede deloc)', x.s === 404 && (await V2.GET('/api/incarcare/planuri/' + plan.id)).s === 404, x.s);
  x = await V1.POST('/api/incarcare/planuri/' + plan.id + '/problema', { text: '   ' });
  T('„Am o problemă" cere un text', x.s === 400 && x.j.error === 'Scrie pe scurt ce s-a întâmplat.', J(x));
  x = await V1.POST('/api/incarcare/planuri/' + plan.id + '/problema', { text: 'Au venit 2 paleți în plus' });
  an = await anunturi(D1);
  T('„Am o problemă": planul e roșu, iar dispecerul primește anunțul cu textul șoferului',
    x.s === 200 && x.j.stare.cheie === 'problema' && an.some((n) => n.type === 'plan_problema' && n.severity === 'warning' && n.title === 'Problemă la încărcare: B 01 TIR' &&
      n.body === 'Ion Șofer: „Au venit 2 paleți în plus”' && Number(dateN(n).planId) === plan.id), J([x.j.stare, an]));
  x = await V1.POST('/api/incarcare/planuri/' + plan.id + '/incarcat');
  an = await anunturi(D1);
  T('„Am încărcat": planul e verde, iar dispecerul primește anunțul',
    x.s === 200 && x.j.stare.cheie === 'incarcat' && an.some((n) => n.type === 'plan_incarcat' && n.title === 'Încărcat: B 01 TIR' && n.body === 'Ion Șofer a apăsat „Am încărcat”.'), J([x.j.stare, an]));
  x = await A1.GET('/api/incarcare/planuri');
  T('adminul firmei vede planul (planurile sunt ale firmei) și îl poate schimba', x.s === 200 && x.j.some((p) => p.id === plan.id) && (await A1.GET('/api/incarcare/planuri/' + plan.id)).j.poateEdita === true, J(x));
  x = await A2.GET('/api/incarcare/planuri');
  const a2 = [await A2.GET('/api/incarcare/planuri/' + plan.id), await A2.PUT('/api/incarcare/planuri/' + plan.id, cerere), await A2.DEL('/api/incarcare/planuri/' + plan.id),
    await A2.POST('/api/incarcare/planuri/' + plan.id + '/trimite', { user_id: ids['adm2@ci.ro'] })];
  T('altă firmă: nu-l vede în listă, nu-l deschide, nu-l schimbă, nu-l șterge, nu-l trimite (404, ca unul care nu există)',
    x.s === 200 && !x.j.some((p) => p.id === plan.id) && a2.every((y) => y.s === 404), J(a2.map((y) => y.s)));
  x = await S.GET('/api/incarcare/planuri');
  const s4 = [await S.GET('/api/incarcare/planuri/' + plan.id), await S.PUT('/api/incarcare/planuri/' + plan.id, cerere), await S.DEL('/api/incarcare/planuri/' + plan.id)];
  T('noi (super-admin) nu vedem planurile firmei (Robert: „nu vrem să vedem ce face o companie")',
    x.s === 200 && !x.j.some((p) => p.id === plan.id) && s4.every((y) => y.s === 404), J([x.j.map((p) => p.id), s4.map((y) => y.s)]));
  x = await D1.PUT('/api/incarcare/planuri/' + plan.id, Object.assign({}, cerere, { marfa: MIX.slice(0, 2) }));
  T('dispecerul reface planul trimis: redevine netrimis', x.s === 200 && x.j.stare.cheie === 'ciorna', J(x));
  x = await V1.GET('/api/incarcare/planuri/' + plan.id);
  const v1l = await V1.GET('/api/incarcare/planuri');
  const v1i = await V1.POST('/api/incarcare/planuri/' + plan.id + '/incarcat');
  T('…iar șoferul nu-l mai are până pleacă din nou: nu e în listă, iar deschis îi spune că se reface (nu „nu există")',
    x.s === 404 && x.j.error === 'Dispecerul reface planul — ți-l trimite din nou când e gata.' && v1l.j.length === 0 && v1i.s === 404 && v1i.j.error === x.j.error, J([x, v1l.j, v1i]));
  x = await D1.POST('/api/incarcare/planuri/' + plan.id + '/trimite', { user_id: ids['vasile@ci.ro'] });
  const v2 = await V2.GET('/api/incarcare/planuri');
  const v1 = await V1.GET('/api/incarcare/planuri/' + plan.id);
  T('trimis altui șofer: Vasile îl vede, Ion nu (acum chiar „nu există" pentru el)',
    x.s === 200 && v2.j.length === 1 && v2.j[0].alMeu === true && v1.s === 404 && v1.j.error === 'Planul nu există.', J([x.s, v2.j, v1]));
  x = await D1.DEL('/api/incarcare/planuri/' + plan.id);
  T('ștergerea: planul dispare și de la șofer', x.s === 200 && (await V2.GET('/api/incarcare/planuri/' + plan.id)).s === 404 && (await D1.GET('/api/incarcare/planuri')).j.length === 0, J(x));
  x = await S.POST('/api/incarcare/planuri', cerere);
  const alNostru = x.j;
  const sl = await S.GET('/api/incarcare/planuri');
  T('un plan făcut de noi îl vedem doar pe al nostru; firma îl vede (e pe camionul ei)',
    x.s === 200 && sl.j.length === 1 && sl.j[0].id === alNostru.id && (await A1.GET('/api/incarcare/planuri')).j.some((p) => p.id === alNostru.id), J([x.s, sl.j]));
  x = await A3.GET('/api/incarcare/planuri');
  T('firma fără camioane (modulul oprit): planurile nu se deschid', x.s === 403 && x.j.error === 'feature_disabled', J(x));
  fin();
})().catch((e) => { console.log('eroare: ' + e.message); rele++; fin(); });
function fin() {
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
}
