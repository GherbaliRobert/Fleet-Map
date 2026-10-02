// verify_traseu_export.js — ecranul Traseu (verticala clientului), după cele trei necazuri găsite de Alin pe 01.10.
//
//   node verify_traseu_export.js
//
// 1. „Limite reale" spunea „Încarcă întâi un traseu." cu traseul deja pe hartă. La bifarea traseului, pagina
//    reținea traseul (`hpLastData = solo.data`) și ABIA APOI chema `hpClearOsmOverlay()` — care îl golea. La fel
//    „Aliniază pe drumuri". Proba RULEAZĂ cele două funcții decupate din pagină și, ca martor, ordinea veche.
// 2. Butoanele de export stăteau lipite de rândul traseului încărcat: `#hp-export` are acum margine de sus.
// 3. Fișierul descărcat era un CSV cu codurile aparatului („_control_flags", „can_csf_…"), fără numele casei,
//    într-o singură coloană în Excel-ul românesc. Acum: Excel prin `sendReport` (numele casei, logo-ul pe fiecare
//    foaie), cu foaia „Sumar" — ACELEAȘI cifre ca ecranul — și pozițiile pe românește. Proba leagă formele scrise
//    de server de cele ale ecranului (le rulează pe aceleași cazuri), apoi, pe server pornit: numele fișierului,
//    foile, cifrele ecranului în fișier, drepturile (altă firmă, demo), limitele de mărime.
//    KML-ul de alături poartă și el numele casei, la fel pe web și pe telefon (funcțiile rulate pe aceleași cazuri).
// 4. Rapoarte (Alin, 02.10: „da"): butonul „CSV" — aceeași boală, fără numele casei, o singură coloană în Excel-ul
//    românesc — a fost SCOS, cu exportul făcut în pagină din spatele lui. Un raport se descarcă doar prin server.
// 5. „Descarcă tot istoricul" (Alin, 02.10: „O facem acum"), în Dispozitive arhivate: un singur Excel cu TOT istoricul
//    unei mașini, scris în flux (fără limita de 10.000), o foaie pe lună pe ora României, logo-ul casei pe fiecare foaie
//    (pus de mână — varianta în flux nu știe imagini). Proba citește fișierul înapoi (și XML-ul brut), apoi, pe server
//    pornit: arhivat (fără poziții numărate de două ori), numele, drepturile, câte unul deodată.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const ExcelJS = require('exceljs');
const { puneParola } = require('./test_parola');
const re = require('./report_export');

const ROOT = __dirname;
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 600) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// O funcție întreagă: de la reper până la acolada care o închide ('' când reperul lipsește).
function functie(src, reper) {
  const i = src.indexOf(reper); if (i < 0) return '';
  let j = src.indexOf('{', i + reper.length - 1), adanc = 0;
  for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
  return src.slice(i, j + 1);
}
const faraComentarii = (s) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');

const html = citeste('public/index.html');
const css = citeste('public/css/app.css');
const server = citeste('server.js');
const ruta = citeste('mobile/src/screens/RouteScreen.tsx');
const exportTs = citeste('mobile/src/lib/export.ts');

(async () => {
  // ═══ 1. „Limite reale" și „Aliniază pe drumuri" lucrează pe traseul bifat ═══════════════════════════════════
  sect('1. „Limite reale" lucrează pe traseul deja încărcat (funcțiile paginii, rulate)');
  const fSel = functie(html, 'function hpApplySelection() {');
  const fClr = functie(html, 'function hpClearOsmOverlay() {');
  T('găsesc în pagină hpApplySelection și hpClearOsmOverlay', fSel.length > 200 && fClr.length > 40, fSel.length + '/' + fClr.length);
  T('hpClearOsmOverlay golește traseul reținut (de-asta contează ordinea)', /hpLastData\s*=\s*null/.test(fClr));
  // Rulează selecția ca pe ecran: un traseu încărcat și bifat. Restul ecranului (hartă, sumar, redare) e de carton.
  const ruleaza = (codSel) => {
    const el = () => ({ style: {}, classList: { add() {}, remove() {} }, value: '', innerHTML: '' });
    const ctx = {
      document: { getElementById: el }, console: { warn() {} },
      map: { removeLayer() {} }, hpOsmLayer: { strat: 1 }, hpLastData: null, hpActive: null, selectedImei: null, hpSpeedLimit: null, hpMarker: null,
      hpLoaded: new Map(), hpDrawVehicle() {}, hpSetVehicleLabel() {}, hpRenderSummary() {}, hpRenderPill() {}, hpInit() {},
      hpRenderTabs() {}, hpVehRender() {}, hpStop() {}, _routePillHide() {}, hpRenderPillMulti() {}
    };
    vm.createContext(ctx);
    vm.runInContext(fClr + '\n' + codSel, ctx);
    return ctx;
  };
  const date = [{ latitude: 44.39, longitude: 26.32, speed: 0 }, { latitude: 44.40, longitude: 26.31, speed: 62 }, { latitude: 44.41, longitude: 26.30, speed: 75 }];
  if (fSel && fClr) {
    const c1 = ruleaza(fSel);
    c1.hpLoaded.set('A', { imei: 'A', visible: true, data: date, speedLimit: 50, snapped: false });
    vm.runInContext('hpApplySelection()', c1);
    T('un traseu bifat → „Limite reale" îl are (nu mai spune „Încarcă întâi un traseu.")', c1.hpLastData === date, J(c1.hpLastData));
    T('și stratul de limite al traseului de dinainte s-a curățat', c1.hpOsmLayer === null);
    T('garda butoanelor trece: traseul are cel puțin două puncte', !!(c1.hpLastData && c1.hpLastData.length >= 2));
    // Două trasee bifate: butoanele se ascund, iar traseul reținut se golește (n-ar ști pe care să-l coloreze).
    const c2 = ruleaza(fSel);
    c2.hpLoaded.set('A', { imei: 'A', visible: true, data: date }); c2.hpLoaded.set('B', { imei: 'B', visible: true, data: date });
    vm.runInContext('hpApplySelection()', c2);
    T('două trasee bifate → niciun traseu reținut (butoanele sunt ascunse)', c2.hpLastData === null, J(c2.hpLastData));
    // Martorul: ordinea de până pe 01.10. Proba trebuie să-l prindă — altfel n-ar păzi nimic.
    const vechi = fSel.replace(/hpClearOsmOverlay\(\);\s*\n(\s*)hpLastData = solo\.data;[^\n]*/, 'hpLastData = solo.data;\n$1hpClearOsmOverlay();');
    T('(martor) am refăcut ordinea veche', vechi !== fSel);
    const c3 = ruleaza(vechi);
    c3.hpLoaded.set('A', { imei: 'A', visible: true, data: date });
    vm.runInContext('hpApplySelection()', c3);
    T('(martor) în ordinea veche traseul se pierdea — exact eroarea lui Alin', c3.hpLastData === null, J(c3.hpLastData));
  }
  const fOsm = html.slice(html.indexOf('window.hpToggleOsmLimits = async function'), html.indexOf('window.hpToggleOsmLimits = async function') + 600);
  T('„Limite reale" citește traseul reținut (hpLastData)', /if \(!hpLastData \|\| hpLastData\.length < 2\)/.test(fOsm));

  // ═══ 2. Spațiul dintre rândul traseului și butoane ════════════════════════════════════════════════════════════
  sect('2. Butoanele de export nu mai stau lipite de rândul traseului');
  const iTabs = html.indexOf('<div id="hp-tabs"'), iExp = html.indexOf('<div id="hp-export"');
  T('butoanele stau imediat sub lista traseelor încărcate', iTabs > 0 && iExp > iTabs && iExp - iTabs < 120, iTabs + '/' + iExp);
  const mExp = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#hp-export\s*\{[^}]*margin-top:\s*(\d+)px/);
  T('#hp-export are margine de sus (cel puțin 8px)', !!mExp && Number(mExp[1]) >= 8, mExp && mExp[0]);

  // ═══ 3. Pagina: Excel în locul CSV-ului, KML cu numele casei ═══════════════════════════════════════════════════
  sect('3. Pagina: Excel cu numele casei, în locul CSV-ului cu coduri');
  const blocExp = html.slice(iExp, html.indexOf('</div>', iExp));
  T('butonul spune „Excel" și cheamă exportTraseuExcel', /onclick="exportTraseuExcel\(\)"[^>]*>[\s\S]*?Excel<\/button>/.test(blocExp), blocExp.slice(0, 300));
  T('butonul „CSV" a plecat de pe ecran', !/>\s*(<i[^>]*><\/i>\s*)?CSV\s*<\/button>/.test(blocExp) && !/exportCSV\(\)/.test(html));
  const htmlCod = faraComentarii(html);
  T('pagina nu mai deschide CSV-ul brut (rămâne doar în documentația API)', !/(fetch|window\.open)\(\s*['"]\/api\/export\//.test(htmlCod) && !/'\/api\/export\/'\s*\+/.test(htmlCod));
  T('o SINGURĂ cerere către /api/traseu/excel în pagină', (htmlCod.match(/fetch\('\/api\/traseu\/excel/g) || []).length === 1);
  const fExcel = functie(html, 'async function exportTraseuExcel() {');
  T('numele fișierului se citește din antet (_numeDinAntet), nu se compune în pagină', /_numeDinAntet\(r,/.test(fExcel), fExcel.slice(0, 200));
  T('_numeDinAntet e pus și pe window (ecranul Traseu stă în afara panoului de administrare)', /window\._numeDinAntet = _numeDinAntet;/.test(html));
  T('descarcă traseele BIFATE (_hpDeExportat), iar din fișa vehiculului vehiculul ales', /_hpDeExportat\(\)/.test(fExcel) &&
    /hpLoaded\.forEach\(function \(st\) \{ if \(st\.visible\) vis\.push\(st\.imei\); \}\)/.test(functie(html, 'function _hpDeExportat() {')));
  T('exportul din fișa vehiculului trece pe aceeași cale', /exportTraseuExcel\(\);/.test(functie(html, 'function exportCSVFromDetail() {')));
  const fKml = functie(html, 'function _numeKmlTraseu(vehicul, azi) {');
  T('găsesc _numeKmlTraseu în pagină', fKml.length > 50);
  T('exportKML își ia numele de la _numeKmlTraseu', /const fname = _numeKmlTraseu\(/.test(html));
  let kmlWeb = null;
  try { kmlWeb = new Function(fKml + '\nreturn _numeKmlTraseu;')(); } catch (e) { T('_numeKmlTraseu rulează', false, e.message); }
  const AZI = new Date(2026, 9, 1);
  if (kmlWeb) {
    T('KML: „RA-Tracks - Traseu {vehicul} - {zi}.kml"', kmlWeb('Dacia Logan 3 · B 154 UIP', AZI) === 'RA-Tracks - Traseu Dacia Logan 3 · B 154 UIP - 01.10.2026.kml', kmlWeb('Dacia Logan 3 · B 154 UIP', AZI));
    T('KML: caracterele interzise în nume de fișier se scot', kmlWeb('Camion 3/4: "Volvo"', AZI) === 'RA-Tracks - Traseu Camion 3 4 Volvo - 01.10.2026.kml', kmlWeb('Camion 3/4: "Volvo"', AZI));
  }

  // ═══ 4. Telefonul: același fișier, același nume ═══════════════════════════════════════════════════════════════
  sect('4. Telefonul: Excel de la server, KML cu același nume ca pe web');
  const rutaCod = faraComentarii(ruta);
  T('telefonul cere /api/traseu/excel', /'\/api\/traseu\/excel'/.test(rutaCod));
  T('telefonul nu mai cere CSV-ul brut', !/\/api\/export\//.test(rutaCod));
  T('foaia „Exportă traseul" spune Excel, nu CSV', /<b>Excel<\/b>/.test(ruta) && !/<b>CSV<\/b>/.test(ruta));
  T('KML-ul telefonului își ia numele de la numeKmlTraseu', /const fname = numeKmlTraseu\(/.test(ruta));
  let ts = null;
  try { ts = require(path.join(ROOT, 'mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { /* lipsește */ } }
  T('compilatorul TypeScript e la îndemână (în CI îl pune pasul de instalare)', !!ts);
  const fKmlTs = functie(exportTs, 'export function numeKmlTraseu(');
  T('găsesc numeKmlTraseu în lib/export.ts', fKmlTs.length > 50);
  if (ts && fKmlTs && kmlWeb) {
    const js = ts.transpileModule(fKmlTs.replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
    const kmlTel = new Function(js + '\nreturn numeKmlTraseu;')();
    const cazuri = [['Dacia Logan 3', 'B 154 UIP'], ['Dacia Logan 3', null], ['B 154 UIP', 'B 154 UIP'], ['Camion 3/4: "Volvo"', 'TM 01 ABC'], ['862129084852924', ''], ['  Ford  Transit ', 'B 22 FRD']];
    const dif = cazuri.filter(([n, p]) => kmlTel(n, p, AZI) !== kmlWeb(n + (p && p !== n ? ' · ' + p : ''), AZI));
    T('telefonul și pagina dau ACELAȘI nume de KML (' + cazuri.length + ' cazuri)', dif.length === 0, J(dif.map(([n, p]) => [kmlTel(n, p, AZI), kmlWeb(n + (p && p !== n ? ' · ' + p : ''), AZI)])));
  }

  // ═══ 5. Regulile fișierului (report_export.js), legate de ecran ═══════════════════════════════════════════════
  sect('5. Fișierul spune cifrele la fel ca ecranul');
  const fSum = functie(html, 'function hpRenderSummary(st) {');
  const mHm = fSum.match(/var _hm = (function \(sec\) \{[^\n]*\});/), mGrp = fSum.match(/var _grp = (function \(n\) \{[^\n]*\});/), mDur = fSum.match(/var durStr = ([^;]+);/);
  T('găsesc în sumarul ecranului _hm, _grp și durStr', !!(mHm && mGrp && mDur));
  if (mHm && mGrp && mDur) {
    const hmEcran = new Function('return ' + mHm[1])(), grpEcran = new Function('return ' + mGrp[1])(), durEcran = new Function('dur', 'return ' + mDur[1]);
    const secunde = [0, 1, 29, 30, 59, 60, 89, 90, 600, 3540, 3569, 3570, 3599, 3600, 3629, 3630, 5400, 7199, 7230, 86399, 90061, null, undefined, -5];
    const difHm = secunde.filter((s) => re.hmTraseu(s) !== hmEcran(s));
    T('durata („1h 05m" / „45 min") — identică cu ecranul pe ' + secunde.length + ' cazuri', difHm.length === 0, J(difHm.map((s) => [s, re.hmTraseu(s), hmEcran(s)])));
    const km = [0, 0.4, 4.6, 999.4, 999.5, 1000, 1250.4, 12345.6, 1234567];
    const difKm = km.filter((k) => re.kmTraseu(k) !== grpEcran(k) + ' km');
    T('distanța („1.250 km") — identică cu ecranul pe ' + km.length + ' cazuri', difKm.length === 0, J(difKm.map((k) => [k, re.kmTraseu(k), grpEcran(k)])));
    const dur = [0, 1, 45, 59, 60, 61, 200, 3725];
    const difDur = dur.filter((d) => re.durataDepasiri(d) !== durEcran(d));
    T('durata depășirilor („3min 20s") — identică cu ecranul pe ' + dur.length + ' cazuri', difDur.length === 0, J(difDur.map((d) => [d, re.durataDepasiri(d), durEcran(d)])));
  }
  T('direcția: 0° → N, 44° → NE, 90° → E, 180° → S, 225° → SV, 270° → V, 359° → N, fără unghi → gol',
    ['N', 'NE', 'E', 'S', 'SV', 'V', 'N', '', ''].join() === [0, 44, 90, 180, 225, 270, 359, null, 'x'].map(re.directieTraseu).join(),
    [0, 44, 90, 180, 225, 270, 359, null, 'x'].map(re.directieTraseu).join());

  // Un traseu mic, scris de mână: vara (UTC+3) și iarna (UTC+2) — ora din fișier e ora României, nu a serverului.
  const istoric = [
    { timestamp: '2026-10-01T05:30:00Z', latitude: 44.3945, longitude: 26.3205, speed: 0, angle: 0, altitude: 81, satellites: 11, io_data: { ignition: 0 } },
    { timestamp: '2026-10-01T05:31:00Z', latitude: 44.3952, longitude: 26.3199, speed: 64.6, angle: 315, altitude: 82, satellites: 12, io_data: { ignition: 1 } },
    { timestamp: '2026-12-01T05:30:00Z', latitude: 44.4, longitude: 26.3, speed: 2, angle: null, altitude: null, satellites: null, io_data: {} }
  ];
  const sum0 = { distanceKm: 1250.4, movingSec: 3630, stationarySec: 45, fuelLiters: 6.04, fuelEstimated: true, overspeedCount: 3, maxOverKmh: 14.6, overspeedDurationSec: 200 };
  const v1 = re.traseuVehicul({ imei: '862129084852924', dev: { name: 'Dacia Logan 3', plate: 'B 154 UIP' }, history: istoric, limit: 50, sum: sum0 });
  T('vehiculul se numește „nume · număr"', v1.vehicul === 'Dacia Logan 3 · B 154 UIP', v1.vehicul);
  T('rândul de vară: ora României (08:30, nu 05:30 a serverului)', J(v1.rows[0].slice(0, 2)) === J(['01.10.2026', '08:30:00']), J(v1.rows[0].slice(0, 2)));
  T('rândul de iarnă: ora României (07:30)', J(v1.rows[2].slice(0, 2)) === J(['01.12.2026', '07:30:00']), J(v1.rows[2].slice(0, 2)));
  T('starea, viteza, contactul, direcția — pe românește', J(v1.rows[1].slice(2, 6)) === J(['În mers', 65, 'Pornit', 'NV']) && J(v1.rows[0].slice(2, 6)) === J(['Staționare', 0, 'Oprit', 'N']), J([v1.rows[0].slice(2, 6), v1.rows[1].slice(2, 6)]));
  T('fără contact citit → celula goală, nu „Oprit"', v1.rows[2][4] === '' && v1.rows[2][5] === '' && v1.rows[2][6] === '' && v1.rows[2][7] === '', J(v1.rows[2]));
  T('coordonatele, într-o singură celulă, și linkul „Vezi pe hartă"', v1.rows[1][8] === '44.395200, 26.319900' && v1.rows[1][9] && v1.rows[1][9].text === 'Vezi pe hartă' &&
    v1.rows[1][9].hyperlink === 'https://www.google.com/maps?q=44.395200,26.319900', J(v1.rows[1].slice(8)));
  T('nicio celulă nu e un cod brut sau „[object Object]"', v1.rows.every((r) => r.every((c) => typeof c !== 'string' || !/object Object|_control_flags|can_/.test(c))));
  const sumarV1 = Object.fromEntries(v1.sumar);
  T('sumarul are etichete fixe, în ordine', J(v1.sumar.map((x) => x[0])) === J(['Distanță', 'Timp în deplasare', 'Timp staționar', 'Consum', 'Viteză maximă', 'Limita de viteză a mașinii', 'Depășiri ale limitei', 'Depășirea cea mai mare', 'Durata depășirilor', 'Poziții GPS']), J(v1.sumar.map((x) => x[0])));
  T('sumarul: 1.250 km · 1h 01m · 1 min · 6,0 L (estimat)', sumarV1['Distanță'] === '1.250 km' && sumarV1['Timp în deplasare'] === '1h 01m' && sumarV1['Timp staționar'] === '1 min' && sumarV1['Consum'] === '6,0 L (estimat)', J(v1.sumar));
  T('sumarul: limita 50 km/h, 3 depășiri, +15 km/h, 3min 20s, viteza maximă 65 km/h, 3 poziții',
    sumarV1['Limita de viteză a mașinii'] === '50 km/h' && sumarV1['Depășiri ale limitei'] === 3 && sumarV1['Depășirea cea mai mare'] === '+15 km/h' &&
    sumarV1['Durata depășirilor'] === '3min 20s' && sumarV1['Viteză maximă'] === '65 km/h' && sumarV1['Poziții GPS'] === 3, J(v1.sumar));
  const v2 = re.traseuVehicul({ imei: '862129084800001', dev: { name: 'Ford Transit', plate: 'B 22 FRD' }, history: istoric.slice(0, 2), limit: null, sum: {} });
  const sumarV2 = Object.fromEntries(v2.sumar);
  T('fără limită pe mașină: o spune, iar depășirile sunt „—", nu 0', /^nesetată/.test(sumarV2['Limita de viteză a mașinii']) && sumarV2['Depășiri ale limitei'] === '—' && sumarV2['Durata depășirilor'] === '—', J(v2.sumar));
  T('fără distanță / consum: „—", nu un număr inventat', sumarV2['Distanță'] === '—' && sumarV2['Consum'] === '—', J(v2.sumar));

  const r1 = re.traseuCaRaport([v1], '2026-10-01T00:00:00Z', '2026-10-01T20:00:00Z');
  T('un vehicul: „Traseu Dacia Logan 3 · B 154 UIP", foile „Sumar" + „Poziții"', r1.label === 'Traseu Dacia Logan 3 · B 154 UIP' && r1.sheetName === 'Poziții' && r1.summarySheet === true, J([r1.label, r1.sheetName, r1.summarySheet]));
  T('sumarul începe cu vehiculul și numărul de înmatriculare', J(Object.keys(r1.summary).slice(0, 2)) === J(['Vehicul', 'Număr de înmatriculare']) && r1.summary['Vehicul'] === 'Dacia Logan 3', J(Object.keys(r1.summary)));
  const r2 = re.traseuCaRaport([v1, v2], '2026-10-01T00:00:00Z', '2026-10-01T20:00:00Z');
  T('mai multe vehicule: „Traseu 2 vehicule", câte o foaie pe vehicul, fără rând TOTAL', r2.label === 'Traseu 2 vehicule' && r2.perVehicle.length === 2 && r2.noFleetTotal === true, J([r2.label, r2.perVehicle && r2.perVehicle.length]));

  T('limita de mărime: 10.000 de poziții încap', re.TRASEU_MAX_POZITII === 10000 && re.traseuPreaMare(10000) === null && re.traseuPreaMare(0) === null, re.TRASEU_MAX_POZITII);
  T('peste ea, fraza spune ce să faci, cu „10.000 de poziții"', /peste 10\.000 de poziții/.test(re.traseuPreaMare(10001) || '') && /perioadă mai scurtă sau mai puține mașini/.test(re.traseuPreaMare(10001) || ''), re.traseuPreaMare(10001));

  // Excel-ul scris, citit înapoi.
  const wb1 = new ExcelJS.Workbook(); await wb1.xlsx.load(await re.toXlsx(r1));
  T('Excel (un vehicul): foile „Sumar" și „Poziții"', J(wb1.worksheets.map((w) => w.name)) === J(['Sumar', 'Poziții']), J(wb1.worksheets.map((w) => w.name)));
  T('logo-ul casei pe AMBELE foi', wb1.worksheets.every((w) => w.getImages().length === 1), J(wb1.worksheets.map((w) => w.getImages().length)));
  const poz = wb1.getWorksheet('Poziții');
  let rCap = 0; poz.eachRow((row, i) => { if (!rCap && row.getCell(1).value === 'Data') rCap = i; });
  T('capul de tabel: ' + re.TRASEU_COLOANE.join(' · '), rCap > 0 && J(re.TRASEU_COLOANE.map((c, i) => poz.getRow(rCap).getCell(i + 1).value)) === J(re.TRASEU_COLOANE), rCap);
  const link = poz.getRow(rCap + 1).getCell(10);
  T('„Vezi pe hartă" e un link adevărat, albastru și subliniat', link.value && link.value.hyperlink && link.font && link.font.underline === true && /0563C1/.test(J(link.font)), J([link.value, link.font]));
  T('coloana linkului are lățimea textului, nu a obiectului', poz.getColumn(10).width <= 16, poz.getColumn(10).width);
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await re.toXlsx(r2));
  T('Excel (două vehicule): „Sumar" + o foaie pe vehicul, logo pe fiecare', J(wb2.worksheets.map((w) => w.name)) === J(['Sumar', 'Dacia Logan 3 · B 154 UIP', 'Ford Transit · B 22 FRD']) &&
    wb2.worksheets.every((w) => w.getImages().length === 1), J(wb2.worksheets.map((w) => [w.name, w.getImages().length])));

  // ═══ 6. Serverul: o singură socoteală a sumarului, aceleași drepturi ca traseul ═══════════════════════════════
  sect('6. Serverul: o singură socoteală a sumarului, aceleași drepturi ca traseul');
  const srvCod = faraComentarii(server);
  T('_sumarTraseu: definită o dată, folosită de ecran ȘI de fișier', (srvCod.match(/_sumarTraseu\(/g) || []).length === 3, (srvCod.match(/_sumarTraseu\(/g) || []).length);
  const iRuta = server.indexOf("app.get('/api/traseu/excel'"), fRuta = iRuta < 0 ? '' : server.slice(iRuta, server.indexOf('\n});', iRuta) + 4);
  T('găsesc ruta /api/traseu/excel', fRuta.length > 500, fRuta.length);
  T('ruta cere autentificare și verifică fiecare mașină (canAccessImei)', /requireAuth, withScope/.test(fRuta) && /canAccessImei\(req, imei\)/.test(fRuta));
  T('ruta trece prin sendReport (numele casei, logo-ul) — nu are cale proprie de export', /reportExport\.sendReport\(res, reportExport\.traseuCaRaport\(/.test(fRuta) && !/setHeader\(/.test(fRuta));
  T('ruta numără pozițiile pe măsură ce citește (traseuPreaMare)', /reportExport\.traseuPreaMare\(total\)/.test(fRuta));
  T('CSV-ul brut rămâne pentru integrările prin API', /app\.get\('\/api\/export\/:imei'/.test(server));

  // ═══ 6b. Rapoarte: descărcarea doar prin server ═══════════════════════════════════════════════════════════════
  sect('6b. Rapoarte: Excel și PDF prin server, fără „CSV" făcut în pagină');
  const iDesc = html.indexOf('>Descarcă:</span>'), randDesc = iDesc < 0 ? '' : html.slice(iDesc, html.indexOf('</div>', iDesc));
  T('găsesc rândul „Descarcă:" din Rapoarte', randDesc.length > 50);
  T('rândul are exact Excel și PDF, amândouă prin server (repExport)', J(randDesc.match(/onclick="[^"]+"/g)) === J(['onclick="repExport(\'xlsx\')"', 'onclick="repExport(\'pdf\')"']), J(randDesc.match(/onclick="[^"]+"/g)));
  T('butonul „CSV" și stilul lui au plecat', !/rep-dl-csv/.test(html) && !/>\s*(<i[^>]*><\/i>\s*)?CSV\s*<\/button>/.test(randDesc));
  T('exportul făcut în pagină a plecat cu el (nu mai rămâne cod la care nu duce nimic)', !/exportReport\(/.test(htmlCod) && !/function printReportData\(/.test(htmlCod) && !/_pdfChartImage/.test(htmlCod));

  // ═══ 6c. Istoricul complet, scris în flux ═════════════════════════════════════════════════════════════════════
  sect('6c. „Descarcă tot istoricul": un Excel scris în flux, o foaie pe lună, logo pe fiecare');
  T('o SINGURĂ scriere a rândului (traseuRand), pentru Traseu și pentru istoricul complet', (faraComentarii(citeste('report_export.js')).match(/traseuRand\(/g) || []).length === 3,
    (faraComentarii(citeste('report_export.js')).match(/traseuRand\(/g) || []).length);
  T('coloanele = cele de la Traseu, fără „Pe hartă" (Excel nu primește peste 65.530 de linkuri într-o foaie)', J(re.ISTORIC_COLOANE) === J(re.TRASEU_COLOANE.slice(0, -1)));
  const Lp = (iso) => re.lunaPozitiei(iso);
  T('31.10.2026, 23:59:59 ora României (ora de iarnă, 21:59:59 UTC) → „Octombrie 2026"', Lp('2026-10-31T21:59:59Z').cheie === '2026-10' && Lp('2026-10-31T21:59:59Z').nume === 'Octombrie 2026', J(Lp('2026-10-31T21:59:59Z')));
  T('… o secundă mai târziu → „Noiembrie 2026"', Lp('2026-10-31T22:00:00Z').cheie === '2026-11' && Lp('2026-10-31T22:00:00Z').nume === 'Noiembrie 2026', J(Lp('2026-10-31T22:00:00Z')));
  T('vara (UTC+3): 30.06, 21:00 UTC e deja 1 iulie → „Iulie 2026"', Lp('2026-06-30T21:00:00Z').cheie === '2026-07', J(Lp('2026-06-30T21:00:00Z')));
  // 1.680 de poziții, din oră în oră, de pe 30.06, 23:00 (ora României): 1 în iunie, 744 în iulie, 744 în august, 191 în septembrie.
  const T0 = Date.parse('2026-06-30T20:00:00Z'), NI = 1680;
  const paginaProba = (dupa, lim, cuDate) => {
    const start = dupa == null ? 0 : (Math.round((Date.parse(dupa) - T0) / 3600000) + 1), out = [];
    for (let i = start; i < Math.min(NI, start + lim); i++) {
      const ts = new Date(T0 + i * 3600000), p = { timestamp: ts, cheie: ts.toISOString() };
      if (cuDate) Object.assign(p, { latitude: 44.4 + i * 1e-4, longitude: 26.1, altitude: 80, angle: 90, speed: i % 2 ? 50 : 0, satellites: 11, io_data: { ignition: i % 2 } });
      out.push(p);
    }
    return Promise.resolve(out);
  };
  const sumarP = await re.istoricPeLuni((d) => paginaProba(d, 500, false));
  T('numărătoarea pe luni, pe ora României: iunie 1 · iulie 744 · august 744 · septembrie 191', J(sumarP.luni.map((l) => [l.nume, l.n])) === J([['Iunie 2026', 1], ['Iulie 2026', 744], ['August 2026', 744], ['Septembrie 2026', 191]]) && sumarP.total === NI, J(sumarP.luni));
  const { PassThrough } = require('stream');
  const bucati = [], tub = new PassThrough(); tub.on('data', (b) => bucati.push(b));
  await re.istoricCompletXlsx(tub, { vehicul: 'Dacia Logan 3 · B 154 UIP', firma: 'Proba Traseu SRL', sumar: sumarP, pagina: (d) => paginaProba(d, 500, true) });
  const bufX = Buffer.concat(bucati);
  const wbX = new ExcelJS.Workbook(); await wbX.xlsx.load(bufX);
  T('foile: „Sumar", apoi câte una pe lună, în ordine', J(wbX.worksheets.map((w) => w.name)) === J(['Sumar', 'Iunie 2026', 'Iulie 2026', 'August 2026', 'Septembrie 2026']), J(wbX.worksheets.map((w) => w.name)));
  T('logo-ul casei pe FIECARE foaie', wbX.worksheets.every((w) => w.getImages().length === 1), J(wbX.worksheets.map((w) => w.getImages().length)));
  const sumX = {}; wbX.getWorksheet('Sumar').eachRow((row) => { sumX[row.getCell(1).value] = row.getCell(2).value; });
  T('„Sumar": vehiculul, firma și câte poziții pe fiecare lună, cu totalul', /Istoricul complet — Dacia Logan 3 · B 154 UIP/.test(J(wbX.getWorksheet('Sumar').getRow(2).values)) &&
    /Firma: Proba Traseu SRL/.test(J(wbX.getWorksheet('Sumar').getRow(3).values)) && sumX['Iulie 2026'] === 744 && sumX['Septembrie 2026'] === 191 && sumX['Total'] === NI, J(sumX));
  const iul = wbX.getWorksheet('Iulie 2026');
  T('capul de tabel pe rândul 5, înghețat (rămâne sus la derulare)', J(re.ISTORIC_COLOANE.map((c, i) => iul.getRow(5).getCell(i + 1).value)) === J(re.ISTORIC_COLOANE) && iul.views[0].state === 'frozen' && iul.views[0].ySplit === 5, J(iul.views));
  T('prima poziție din iulie: 01.07.2026, 00:00:00 (ora României), pe românește', J(iul.getRow(6).values.slice(1)) === J(['01.07.2026', '00:00:00', 'În mers', 50, 'Pornit', 'E', 80, 11, '44.400100, 26.100000']), J(iul.getRow(6).values.slice(1)));
  T('câte un rând pe poziție (744 în iulie)', iul.rowCount === 5 + 744, iul.rowCount);
  let JSZip = null; try { JSZip = require('jszip'); } catch (e) { /* vine cu exceljs */ }
  T('pot citi XML-ul brut al fișierului (jszip, adus de exceljs)', !!JSZip);
  if (JSZip) {
    const z = await JSZip.loadAsync(bufX), nume = Object.keys(z.files);
    const ia = async (re_) => { const n = nume.find((x) => re_.test(x)); return n ? z.file(n).async('string') : ''; };
    const ct = await ia(/\[Content_Types\]\.xml$/);
    T('fiecare desen e anunțat în [Content_Types].xml (altfel Excel „repară" fișierul)', (ct.match(/drawing\+xml/g) || []).length === 5, (ct.match(/drawing\+xml/g) || []).length);
    const sh = await ia(/xl\/worksheets\/sheet3\.xml$/);
    T('în foaie, desenul stă după <pageSetup>, unde îl pune și Excel-ul obișnuit', /<pageSetup[^>]*\/>(<headerFooter[^>]*\/>)?<drawing r:id="rId\d+"\/><\/worksheet>\s*$/.test(sh), sh.slice(-260));
    const rels = await Promise.all(nume.filter((x) => /worksheets\/_rels\/.*\.rels$/.test(x)).map((x) => z.file(x).async('string')));
    T('nicio foaie nu are linkuri; fiecare are desenul ei', rels.length === 5 && rels.every((x) => !/relationships\/hyperlink/.test(x) && /relationships\/drawing/.test(x)), rels.length);
  }

  // ═══ 7. Pe server pornit ══════════════════════════════════════════════════════════════════════════════════════
  sect('7. Pe server pornit: numele, foile, cifrele ecranului, drepturile, limitele');
  const PORT = 3283, DIR = '.traseu-export-ci-db';
  const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_traseu_export',
    PORT: String(PORT), TCP_PORT: '5283', PGLITE_DIR: DIR + '/pgdata' };
  delete env.DATABASE_URL; delete env.SMTP_HOST; delete env.ANTHROPIC_API_KEY;
  try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
  const gata = (cod) => { try { srv.kill(); } catch (e) {} try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
    console.log('\n──────────────────────────────'); console.log(ok + ' verificări trecute, ' + rele + ' picate'); process.exit(cod); };
  try {
    const B = 'http://127.0.0.1:' + PORT;
    let pornit = false;
    for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
    T('serverul pornește', pornit); if (!pornit) return gata(1);
    const login = async (u, p) => {
      const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: u, password: p }) });
      if (!r.ok) return null;
      return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
    };
    const ck = await login('admin', 'test1234');
    T('super-adminul se autentifică', !!ck); if (!ck) return gata(1);
    const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
    const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c || ck }, body: J(b) });
    const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: c || ck }, body: J(b) });

    const coA = await (await POST('/api/companies', { name: 'Proba Traseu A SRL' })).json();
    const coB = await (await POST('/api/companies', { name: 'Proba Traseu B SRL' })).json();
    const A1 = '862129084852924', A2 = '862129084800002', B1 = '862129084800003';
    await POST('/api/devices', { imei: A1, name: 'Dacia Logan 3', plate: 'B 154 UIP', company_id: coA.id });
    await POST('/api/devices', { imei: A2, name: 'Ford Transit', plate: 'B 22 FRD', company_id: coA.id });
    await POST('/api/devices', { imei: B1, name: 'Mașina firmei B', plate: 'CJ 01 BBB', company_id: coB.id });
    const rl = await PUT('/api/devices/' + A1 + '/details', { speed_limit: 50 });
    T('limita de viteză se pune pe mașină', rl.status === 200, rl.status);
    // Un traseu de azi, cu minute întregi: oprit, apoi pornit, câteva depășiri de 50 km/h, oprit iar.
    const zi0 = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 6, 0, 0);
    let lat = 44.3945, lng = 26.3205;
    for (let i = 0; i < 40; i++) {
      const sp = i < 4 || i > 34 ? 0 : (i % 6 === 0 ? 72 : 38);
      if (sp) { lat += 0.0007; lng -= 0.0006; }
      await POST('/api/test/simulate', { imei: A1, ts: new Date(zi0 + i * 60000).toISOString(), lat, lng, speed: sp, io: { ignition: sp ? 1 : 0 } });
    }
    for (let i = 0; i < 12; i++) await POST('/api/test/simulate', { imei: A2, ts: new Date(zi0 + i * 60000).toISOString(), lat: 45.75 + i * 0.001, lng: 21.21, speed: i ? 40 : 0, io: { ignition: 1 } });
    const from = new Date(zi0 - 3600000).toISOString(), to = new Date(zi0 + 3 * 3600000).toISOString();
    const q = (imeis) => '/api/traseu/excel?imeis=' + encodeURIComponent(imeis) + '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    const azi = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear(); })();
    const numeDin = (r) => { const cd = r.headers.get('content-disposition') || '', m = cd.match(/filename\*=UTF-8''([^;]+)/i); return m ? decodeURIComponent(m[1]) : cd; };

    const ecr = await (await GET('/api/history/' + A1 + '?ext=1&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))).json();
    T('ecranul are traseul (40 de poziții, cu depășiri)', ecr.points && ecr.points.length === 40 && ecr.summary && ecr.summary.overspeedCount > 0, J(ecr.summary));

    const x1 = await GET(q(A1));
    T('Excel-ul unui vehicul se descarcă', x1.status === 200 && /spreadsheetml/.test(x1.headers.get('content-type') || ''), x1.status + ' ' + x1.headers.get('content-type'));
    T('numele: „RA-Tracks - Raport Traseu Dacia Logan 3 · B 154 UIP - ' + azi + '.xlsx"', numeDin(x1) === 'RA-Tracks - Raport Traseu Dacia Logan 3 · B 154 UIP - ' + azi + '.xlsx', numeDin(x1));
    if (x1.status === 200) {
      const w = new ExcelJS.Workbook(); await w.xlsx.load(Buffer.from(await x1.arrayBuffer()));
      T('foile „Sumar" și „Poziții", logo pe amândouă', J(w.worksheets.map((s) => s.name)) === J(['Sumar', 'Poziții']) && w.worksheets.every((s) => s.getImages().length === 1), J(w.worksheets.map((s) => [s.name, s.getImages().length])));
      const s = {}; w.getWorksheet('Sumar').eachRow((row) => { s[row.getCell(1).value] = row.getCell(2).value; });
      const e = ecr.summary;
      T('Sumar = ecranul: distanța, timpii, depășirile, pozițiile',
        s['Distanță'] === (e.distanceKm != null ? re.kmTraseu(e.distanceKm) : '—') && s['Timp în deplasare'] === re.hmTraseu(e.movingSec) && s['Timp staționar'] === re.hmTraseu(e.stationarySec) &&
        s['Depășiri ale limitei'] === e.overspeedCount && s['Durata depășirilor'] === re.durataDepasiri(e.overspeedDurationSec) && s['Poziții GPS'] === ecr.points.length && s['Limita de viteză a mașinii'] === '50 km/h',
        J({ fisier: s, ecran: e }));
      const p = w.getWorksheet('Poziții'); let cap = 0, n = 0; const stari = new Set(), contact = new Set();
      p.eachRow((row, i) => { if (!cap && row.getCell(1).value === 'Data') { cap = i; return; } if (cap && i > cap) { n++; stari.add(row.getCell(3).value); contact.add(row.getCell(5).value); } });
      T('„Poziții": câte un rând pe poziție, sub capul de tabel', cap > 0 && n === ecr.points.length, cap + '/' + n);
      T('starea și contactul, în cuvinte', [...stari].every((x) => x === 'În mers' || x === 'Staționare') && [...contact].every((x) => x === 'Pornit' || x === 'Oprit'), J([[...stari], [...contact]]));
    }

    const x2 = await GET(q(A1 + ',' + A2));
    T('două vehicule: un fișier, „RA-Tracks - Raport Traseu 2 vehicule - ' + azi + '.xlsx"', x2.status === 200 && numeDin(x2) === 'RA-Tracks - Raport Traseu 2 vehicule - ' + azi + '.xlsx', x2.status + ' ' + numeDin(x2));
    if (x2.status === 200) {
      const w = new ExcelJS.Workbook(); await w.xlsx.load(Buffer.from(await x2.arrayBuffer()));
      T('„Sumar" + câte o foaie pe vehicul', J(w.worksheets.map((s) => s.name)) === J(['Sumar', 'Dacia Logan 3 · B 154 UIP', 'Ford Transit · B 22 FRD']), J(w.worksheets.map((s) => s.name)));
    }

    // Drepturile: aceleași ca la traseul de pe ecran.
    const cu = await POST('/api/users', { username: 'admin.traseu.b@test.ro', full_name: 'Admin B', role: 'company_admin', company_id: coB.id });
    await puneParola(cu, 'Str4da-Verde-2026', B);
    const ckB = await login('admin.traseu.b@test.ro', 'Str4da-Verde-2026');
    T('adminul firmei B se autentifică', !!ckB);
    if (ckB) {
      T('firma B NU poate descărca traseul unei mașini a firmei A', (await GET(q(A1), ckB)).status === 403);
      T('nici amestecat cu o mașină a ei', (await GET(q(B1 + ',' + A1), ckB)).status === 403);
      const xb = await GET(q(B1), ckB);
      T('mașina ei, fără poziții în interval → 404 cu mesaj', xb.status === 404 && /Nu sunt date/.test((await xb.json()).error || ''), xb.status);
    }
    T('mașinile demo nu se descarcă din flota reală (nici de noi)', (await GET(q('DEMO0001'))).status === 403);

    // Limitele: vehicule, perioadă, poziții.
    T('fără vehicul → 400', (await GET('/api/traseu/excel?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))).status === 400);
    T('peste 20 de vehicule → 400', (await GET(q(Array.from({ length: 21 }, (_, i) => '86212908480' + String(1000 + i)).join(',')))).status === 400);
    const lung = await GET('/api/traseu/excel?imeis=' + A1 + '&from=' + encodeURIComponent(new Date(zi0 - 100 * 86400000).toISOString()) + '&to=' + encodeURIComponent(to));
    T('perioadă peste 92 de zile → 400', lung.status === 400, lung.status);
    // 5.000 + 5.000 + 5 poziții: a treia mașină trece de 10.000 → refuz, înainte de a face vreun Excel.
    const C = ['862129084800011', '862129084800012', '862129084800013'];
    for (const [k, imei] of C.entries()) {
      await POST('/api/devices', { imei, name: 'Mare ' + (k + 1), plate: 'B 0' + (k + 1) + ' MAR', company_id: coA.id });
      await POST('/api/test/istoric-vechi', { imei, luni: 0, n: k < 2 ? 5000 : 5 });
    }
    const qMare = '/api/traseu/excel?imeis=' + C.join(',') + '&from=' + encodeURIComponent(new Date(Date.now() - 6 * 86400000).toISOString()) + '&to=' + encodeURIComponent(new Date().toISOString());
    const t0 = Date.now(), mare = await GET(qMare), jm = await mare.json().catch(() => ({}));
    T('peste 10.000 de poziții → 400, cu fraza care spune ce să faci', mare.status === 400 && jm.preaMare === true && jm.error === re.traseuPreaMare(10005), mare.status + ' ' + J(jm));
    T('refuzul vine repede (fără să facă fișierul): ' + (Date.now() - t0) + ' ms', Date.now() - t0 < 8000, Date.now() - t0);
    const csv = await GET('/api/export/' + A1 + '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
    T('CSV-ul brut pentru API răspunde ca înainte', csv.status === 200 && /csv/.test(csv.headers.get('content-type') || ''), csv.status + ' ' + csv.headers.get('content-type'));

    // ── 7b. „Descarcă tot istoricul", pe server pornit ──
    sect('7b. „Descarcă tot istoricul" pe server pornit: arhivat, numele, drepturile, câte unul deodată');
    const H1 = '862129084800021';
    await POST('/api/devices', { imei: H1, name: 'Camion arhivat', plate: 'TM 21 ARH', company_id: coA.id });
    for (const luni of [0, 1]) await POST('/api/test/istoric-vechi', { imei: H1, luni: luni, n: 3000 });
    await POST('/api/test/simulate', { imei: H1, ts: new Date(Date.now() - 3600000).toISOString(), lat: 45.7, lng: 21.2, speed: 50, io: { ignition: 1 } });
    // Arhivarea copiază istoricul în arhivă: pozițiile stau în DOUĂ locuri, iar fișierul nu le numără de două ori.
    const arhv = await PUT('/api/devices/' + H1 + '/status', { status: 'archived' });
    T('aparatul se arhivează', arhv.status === 200, arhv.status);
    const xh = await GET('/api/devices/' + H1 + '/istoric-complet');
    T('istoricul complet se descarcă', xh.status === 200 && /spreadsheetml/.test(xh.headers.get('content-type') || ''), xh.status + ' ' + xh.headers.get('content-type'));
    T('numele: „RA-Tracks - Istoric complet Camion arhivat · TM 21 ARH - ' + azi + '.xlsx"', numeDin(xh) === 'RA-Tracks - Istoric complet Camion arhivat · TM 21 ARH - ' + azi + '.xlsx', numeDin(xh));
    if (xh.status === 200) {
      const w = new ExcelJS.Workbook(); await w.xlsx.load(Buffer.from(await xh.arrayBuffer()));
      const sm = {}; let lunile = 0;
      w.getWorksheet('Sumar').eachRow((row) => { const k = row.getCell(1).value, v = row.getCell(2).value; sm[k] = v; if (/^[A-ZĂÎÂȘȚ][a-zăîâșț]+ \d{4}$/.test(String(k)) && typeof v === 'number') lunile++; });
      T('6.001 de poziții (3.000 + 3.000 + 1), deși jumătate stau și în arhivă', sm['Total'] === 6001, J(sm));
      T('„Sumar" + câte o foaie pentru fiecare lună din sumar, cu logo pe fiecare', w.worksheets.length === 1 + lunile && lunile >= 2 && w.worksheets.every((x) => x.getImages().length === 1), w.worksheets.map((x) => x.name).join(' | '));
      const randuri = w.worksheets.slice(1).reduce((a, x) => a + x.rowCount - 5, 0);
      T('rândurile din foile lunilor = totalul din „Sumar"', randuri === 6001, randuri);
      T('firma e cea a mașinii', /Firma: Proba Traseu A SRL/.test(J(w.getWorksheet('Sumar').getRow(3).values)), J(w.getWorksheet('Sumar').getRow(3).values));
    }
    const act = await (await GET('/api/activity?zile=1&familie=descarcari')).json().catch(() => ({}));
    T('descărcarea intră în jurnal, la „Descărcări", cu numărul mașinii', (act.randuri || []).some((x) => x.entity === 'device_history' && x.details && x.details.plate === 'TM 21 ARH'), J((act.randuri || []).map((x) => x.entity)));
    // Câte UNUL deodată: al doilea, venit cât primul încă lucrează, primește 429 cu mesaj; primul se termină bine.
    const pA = GET('/api/devices/' + H1 + '/istoric-complet');
    await sleep(40);
    const rB = await GET('/api/devices/' + H1 + '/istoric-complet'), jB = await rB.json().catch(() => ({}));
    const rA = await pA; await rA.arrayBuffer();
    T('câte unul deodată: al doilea primește 429, cu fraza pentru om', rB.status === 429 && jB.ocupat === true && /peste un minut/.test(jB.error || ''), rB.status + ' ' + J(jB));
    T('… iar primul se termină bine', rA.status === 200, rA.status);
    const H2 = '862129084800022';
    await POST('/api/devices', { imei: H2, name: 'Fără istoric', plate: 'TM 22 ARH', company_id: coA.id });
    const gol = await GET('/api/devices/' + H2 + '/istoric-complet'), jg = await gol.json().catch(() => ({}));
    T('mașină fără istoric → 404, cu mesaj', gol.status === 404 && /nu mai are istoric/.test(jg.error || ''), gol.status + ' ' + J(jg));
    T('după un refuz, următoarea descărcare merge (lacătul s-a deschis)', (await GET('/api/devices/' + H1 + '/istoric-complet').then(async (x) => { await x.arrayBuffer(); return x.status; })) === 200);
    if (ckB) T('clientul NU poate descărca istoricul complet (doar noi)', (await GET('/api/devices/' + B1 + '/istoric-complet', ckB)).status === 403);
    T('mașinile demo nu se descarcă', (await GET('/api/devices/DEMO0001/istoric-complet')).status === 403);
  } catch (e) { T('proba pe server pornit a mers până la capăt', false, e && e.stack); }
  gata(rele ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
