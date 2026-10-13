// verify_flota_incarcare.js — flota pentru simulatorul de încărcare: semiremorcile și remorcile, fila „Încărcare" din fișa
// vehiculului, filtrul pe fel din lista de vehicule (12.10).
//
//   node verify_flota_incarcare.js
//
// Robert (12.10): „să adăugăm semiremorcile în aplicație, ca atunci când faci o simulare să nu fii nevoit să bagi
// dimensiunile de fiecare dată, și să poți alege din flota pe care o ai deja… și pentru camioane, 3,5 t, 7 t" +
// „le diferențiem, și vreau un icon când vedem lista de vehicule, buton de filtrare".
//
// Ce apără proba:
//   1. regulile (incarcare.js): ce se poate scrie la o semiremorcă și în fila „Încărcare", paleții, lista de tipuri;
//   2. baza și copia: coloanele fișei se salvează, semiremorcile intră în copie, pleacă odată cu firma, sunt ale firmei;
//   3. serverul: modulul păzește rutele, scrierea cere „editare vehicule", fila trece prin regulile simulatorului;
//   4. pagina NU scrie cifrele obișnuite (vin de la server); telefonul are aceleași rute și ecranele lui;
//   5. regulile paginii și ale telefonului (fila, semiremorca, felul vehiculului), RULATE pe aceleași cazuri;
//   6. pe server pornit: modulul oprit refuză, firma își vede doar semiremorcile ei, fișa primește doar cifre cu sens,
//      semiremorca ștearsă / mașina mutată pe altă firmă nu rămân legate, o semiremorcă pornește singură simulatorul.
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
const JC = (x) => JSON.stringify(x, function (k, v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce(function (o, kk) { o[kk] = v[kk]; return o; }, {}) : v; });

const html = citeste('public/index.html');
const server = citeste('server.js');
const dbSrc = citeste('db.js');
const backupSrc = citeste('backup.js');
const incSrc = citeste('incarcare.js');
const libTel = citeste('mobile/src/lib/incarcare.ts');
const detTel = citeste('mobile/src/screens/VehicleDetail.tsx');
const remTel = citeste('mobile/src/screens/Remorci.tsx');
const vehTel = citeste('mobile/src/screens/Vehicles.tsx');
const fisaTel = citeste('mobile/src/components/IncarcareFisa.tsx');
const appTel = citeste('mobile/src/App.tsx');
const endpoints = citeste('mobile/src/api/endpoints.ts');
const store = citeste('mobile/src/app/store.ts');

sect('0. Fișierele');
T('toate fișierele citite de probă există', [html, server, dbSrc, backupSrc, incSrc, libTel, detTel, remTel, vehTel, fisaTel, appTel, endpoints, store].every(Boolean));

// ─── 1. Regulile ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('1. Regulile (incarcare.js)');
const inc = require('./incarcare.js');
const meta = Object.assign(inc.meta(), { tipuriCuMarfa: require('./plans.js').TIPURI_CU_MARFA });
T('felurile cu caroserie: autotractor (fără caroserie), dubă 3,5 t, camion 7,5 / 12 / 18 t, altul',
  J(inc.FELURI_VEHICUL.map((f) => f.id)) === J(['autotractor', 'duba35', 'camion75', 'camion12', 'camion18', 'altul']) &&
  inc.FELURI_VEHICUL[0].caroserie === false && inc.FELURI_VEHICUL.slice(1).every((f) => f.caroserie === true));
T('semiremorca și remorca cu proțap sunt deosebite, fiecare cu tipurile ei',
  J(inc.FEL_REMORCA.map((f) => f.id)) === J(['semiremorca', 'remorca']) &&
  inc.TIPURI_REMORCA.semiremorca.length >= 5 && inc.TIPURI_REMORCA.remorca.length >= 3 &&
  inc.TIPURI_REMORCA.semiremorca.every((t) => t.pivotAxe > 0) && inc.TIPURI_REMORCA.remorca.every((t) => t.ampatament > 0 && t.axaFata >= 0));
T('paleți la un rând: prelată 13,6 × 2,48 → 33 EUR / 26 industriali; remorcă 7,7 × 2,48 → 18 / 14; dubă 4,3 × 1,78 → 6 / 3',
  inc.paletiEur(13.6, 2.48) === 33 && inc.paletiInd(13.6, 2.48) === 26 && inc.paletiEur(7.7, 2.48) === 18 && inc.paletiInd(7.7, 2.48) === 14 &&
  inc.paletiEur(4.3, 1.78) === 6 && inc.paletiInd(4.3, 1.78) === 3,
  [inc.paletiEur(13.6, 2.48), inc.paletiInd(13.6, 2.48), inc.paletiEur(7.7, 2.48), inc.paletiInd(7.7, 2.48), inc.paletiEur(4.3, 1.78), inc.paletiInd(4.3, 1.78)]);
let c = inc.curataRemorca({ fel: 'semiremorca', tip: 'mega', plate: ' tm 12 abc ', lungime_m: '13,62', latime_m: '2.48', inaltime_m: 3, sarcina_kg: '24.000', nr_axe: '3', imei: 'x' });
T('o semiremorcă bună: număr cu litere mari, „13,62" și „24.000" citite corect, IMEI stricat → gol',
  c.rand && c.rand.plate === 'TM 12 ABC' && c.rand.lungime_m === 13.62 && c.rand.sarcina_kg === 24000 && c.rand.nr_axe === 3 && c.rand.imei === null && c.rand.axa_fata_m === null, J(c));
T('fără fel → refuz', !!inc.curataRemorca({ plate: 'X', lungime_m: 13, latime_m: 2.4, inaltime_m: 2.7 }).eroare);
T('fără număr → refuz', /număr/i.test(inc.curataRemorca({ fel: 'remorca', lungime_m: 7, latime_m: 2.4, inaltime_m: 2.7 }).eroare || ''));
T('fără dimensiuni → refuz', /lungimea, lățimea și înălțimea/.test(inc.curataRemorca({ fel: 'remorca', plate: 'X' }).eroare || ''));
T('dimensiune fără sens → refuz pe față („Lungimea: între 1 și 20")', inc.curataRemorca({ fel: 'semiremorca', plate: 'X', lungime_m: 30, latime_m: 2.4, inaltime_m: 2.7 }).eroare === 'Lungimea: între 1 și 20');
T('tip necunoscut → gol, nu refuz (omul poate scrie „Altul")', inc.curataRemorca({ fel: 'semiremorca', tip: 'tren', plate: 'X', lungime_m: 13, latime_m: 2.4, inaltime_m: 2.7 }).rand.tip === null);
c = inc.curataCaroserie({ inc_fel: 'camion12', inc_lungime: '7,2', inc_ampatament: '', inc_tara_fata: '3600', inc_remorca_id: '5' });
T('fila „Încărcare": cifre curățate, gol = gol, semiremorca = număr; ce nu vine nu se atinge',
  c.campuri && c.campuri.inc_fel === 'camion12' && c.campuri.inc_lungime === 7.2 && c.campuri.inc_ampatament === null && c.campuri.inc_tara_fata === 3600 &&
  c.campuri.inc_remorca_id === 5 && !('inc_latime' in c.campuri), J(c));
T('felul necunoscut → refuz; lungime 99 → refuz', !!inc.curataCaroserie({ inc_fel: 'tren' }).eroare && /Lungimea/.test(inc.curataCaroserie({ inc_lungime: 99 }).eroare || ''));
T('coloanele fișei: zece, toate „inc_…"', inc.CAMPURI_CAROSERIE.length === 10 && inc.CAMPURI_CAROSERIE.every((k) => /^inc_/.test(k)));

// ─── 2. Baza și copia ────────────────────────────────────────────────────────────────────────────────────────────
sect('2. Baza: coloanele, tabela, copia, firma');
const iCols = dbSrc.indexOf('const VEHICLE_DETAIL_COLS = [');
const COLS = iCols > 0 ? dbSrc.slice(iCols, dbSrc.indexOf('];', iCols)) : '';
T('fișa salvează toate coloanele „Încărcare" (VEHICLE_DETAIL_COLS)', inc.CAMPURI_CAROSERIE.every((k) => COLS.indexOf("'" + k + "'") >= 0));
T('…cu zecimale unde trebuie (metrii nu se rotunjesc la întreg)', /const DECIMAL_COLS = new Set\(\[[\s\S]{0,200}'inc_lungime', 'inc_latime', 'inc_inaltime', 'inc_ampatament', 'inc_axa_caroserie', 'inc_sa_axa'\]\)/.test(dbSrc));
T('fiecare coloană e creată în bază', inc.CAMPURI_CAROSERIE.every((k) => new RegExp('ADD COLUMN IF NOT EXISTS ' + k + ' ').test(dbSrc)));
T('tabela „remorci" are firma și cifrele de care are nevoie simulatorul', /CREATE TABLE IF NOT EXISTS remorci \([\s\S]{0,700}company_id INTEGER[\s\S]{0,700}pivot_axe_m[\s\S]{0,200}limita_axe_kg/.test(dbSrc));
// Oriunde în listă (alte tabele se adaugă după ea), dar ÎN listă — nu într-un comentariu.
const iBT = backupSrc.indexOf('const BUSINESS_TABLES = [');
const BT = iBT >= 0 ? backupSrc.slice(iBT, backupSrc.indexOf('\n];', iBT)).replace(/\/\/[^\n]*/g, '') : '';
T('semiremorcile intră în copie (BUSINESS_TABLES)', /'remorci',/.test(BT), BT.slice(-200));
T('pleacă odată cu firma', /async function deleteCompany\(id\) \{[\s\S]{0,400}DELETE FROM remorci WHERE company_id = \$1/.test(dbSrc));
T('un rând se verifică pe firmă (getRowCompany știe „remorci")', /const allow = \{[^}]*remorci: 1/.test(dbSrc));
T('ștearsă, nu rămâne legată de nicio mașină', /async function deleteRemorca[\s\S]{0,200}UPDATE devices SET inc_remorca_id = NULL WHERE inc_remorca_id = \$1/.test(dbSrc));
T('mașina mutată pe altă firmă își pierde semiremorca obișnuită (era a firmei vechi)',
  /async function setDeviceCompany[\s\S]{0,500}inc_remorca_id = CASE WHEN company_id IS DISTINCT FROM \$2::int THEN NULL ELSE inc_remorca_id END/.test(dbSrc));
T('semiremorcile pornesc și ele simulatorul (firmeCuFlotaGrea le adună)', /UNION SELECT DISTINCT company_id FROM remorci WHERE company_id IS NOT NULL/.test(dbSrc));

// ─── 3. Serverul ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Serverul: modulul păzește, scrierea cere „editare vehicule"');
const rute = server.match(/app\.(get|post|put|delete)\('\/api\/remorci[^']*'[^\n]*/g) || [];
// Șase din 13.10: lista, adăugarea, schimbarea, ștergerea + ce vehicule se pot alege (cuplare) și atașarea la un vehicul.
T('șase rute pentru semiremorci', rute.length === 6, rute.length);
T('toate cer modulul „incarcare"', rute.every((r) => /requireFeature\('incarcare'\)/.test(r)));
T('scrierea cere „editare vehicule"; citirea, doar firma', rute.filter((r) => /^app\.(post|put|delete)/.test(r)).every((r) => /requireEdit\('vehicule'\)/.test(r)) && rute.filter((r) => /^app\.get/.test(r)).every((r) => !/requireEdit/.test(r)));
T('schimbarea, ștergerea și atașarea verifică firma rândului (ownsRow, 404 ca la un rând care nu există)',
  (server.match(/if \(!\(await ownsRow\(req, 'remorci', req\.params\.id\)\)\) return res\.status\(404\)/g) || []).length === 3);
T('un rând fără firmă se refuză (super-adminul alege firma)', /Semiremorca trebuie să fie a unei firme — alege firma\./.test(server));
T('scrierea trece prin incarcare.curataRemorca', (server.match(/incarcare\.curataRemorca\(req\.body\)/g) || []).length === 2);
T('fila „Încărcare" trece prin incarcare.curataCaroserie, iar semiremorca trebuie să fie a firmei mașinii',
  /const cc = incarcare\.curataCaroserie\(b\);[\s\S]{0,600}Semiremorca aleasă nu e a firmei acestui vehicul\./.test(server));
T('cifrele obișnuite vin de la server, cu felurile care arată fila (tipuriCuMarfa)', /app\.get\('\/api\/incarcare\/meta'[^\n]*incarcare\.meta\(\), \{ tipuriCuMarfa: plans/.test(server));

// ─── 4. Pagina și telefonul: rutele, ecranele, fără cifre scrise de mână ─────────────────────────────────────────
sect('4. Pagina și telefonul: ce e unde');
const bloc = (inc0, sf) => { const a = html.indexOf(inc0), b = html.indexOf(sf); return a > 0 && b > a ? html.slice(a, b + sf.length) : ''; };
const BF = bloc('// ── începe „fila Încărcare" ──', '// ── sfârșit „fila Încărcare" ──');
const BR = bloc('// ── începe „semiremorcile din flotă" ──', '// ── sfârșit „semiremorcile din flotă" ──');
const BV = bloc('// ── începe „felul vehiculului" ──', '// ── sfârșit „felul vehiculului" ──');
T('cele trei blocuri ale paginii sunt între repere', !!BF && !!BR && !!BV);
const zecimale = (s) => (s.replace(/\/\/[^\n]*/g, '').match(/\b\d+\.\d+\b/g) || []);
T('pagina NU scrie cifrele obișnuite (nicio zecimală în blocuri: vin din /api/incarcare/meta)', !zecimale(BF).length && !zecimale(BR).length, J(zecimale(BF).concat(zecimale(BR))));
T('fila „Încărcare" e în fișa vehiculului, cu toate căsuțele coloanelor',
  /data-tab="incarcare" onclick="switchEditTab\('incarcare', this\)"/.test(html) && /id="edit-tab-incarcare"/.test(html) &&
  inc.CAMPURI_CAROSERIE.filter((k) => k !== 'inc_fel' && k !== 'inc_remorca_id').every((k) => html.indexOf('id="edit-' + k.replace(/_/g, '-') + '"') >= 0) &&
  /id="edit-inc-fel"/.test(html) && /id="edit-inc-remorca"/.test(html));
T('fila se vede după modul și fel (aplicaVizibilitateTaburi) și pleacă la salvare (incCulege)',
  /pune\('incarcare', arataInc\);/.test(html) && /Object\.assign\(details, incCulege\(\)\);/.test(html) && /await incUmple\(dev\);/.test(html));
T('salvarea arată refuzul serverului („Lungimea: între 1 și 20"), nu doar „Eroare"', /alert\(_e\.error \|\| 'Eroare la salvare'\)/.test(html));
T('lista de vehicule: filtrul pe fel, rândurile de semiremorci, butoanele „Semiremorcă" / „Remorcă"',
  /id="veh-fel-filter"/.test(html) && /if \(d\._remorca\) return _remRand\(d, esc\);/.test(html) &&
  /onclick="remDeschide\(null, 'semiremorca'\)"/.test(html) && /onclick="remDeschide\(null, 'remorca'\)"/.test(html));
T('fereastra semiremorcii: deasupra listei, firma doar la noi, eroarea serverului pe față',
  /id="rem-modal" class="modal-overlay" style="z-index:2100;"/.test(html) && /coG\.style\.display = super_ && !r \? '' : 'none';/.test(html) && /_remErr\(j\.error \|\| 'Nu s-a putut salva\.'\)/.test(html));
T('eroarea din fereastră are pereche pe tema deschisă', /body:not\(\.dark\) #rem-modal \.rem-err\{color:#b91c1c;\}/.test(html));
T('telefonul: aceleași rute (meta, listă, salvare, ștergere)',
  /incarcareMeta: \(\) => api<IncMeta>\('\/api\/incarcare\/meta'\)/.test(endpoints) && /remorci: \(companyId\?: number \| null\) => api<Remorca\[\]>\('\/api\/remorci'/.test(endpoints) &&
  /salveazaRemorca: \(id: number \| null, b: any\) => api<Remorca>\('\/api\/remorci'/.test(endpoints) && /stergeRemorca: \(id: number\) =>/.test(endpoints));
T('telefonul: secțiunea „Încărcare" în fișă, după modul și fel, trimisă la salvare (incDeTrimis)',
  /arataIncEdit = incPornit && /.test(detTel) && /<IncarcareForm val=\{ef\}/.test(detTel) && /Object\.assign\(spec, incDeTrimis\(ef, /.test(detTel) && /incDinFull\(full\)/.test(detTel));
T('telefonul: ecranul „Semiremorci și remorci" (/remorci), deschis din Vehicule', /<Route path="\/remorci" component=\{P\.remorci\} \/>/.test(appTel) &&
  /remorci: pazit\('vehicule', Remorci,/.test(appTel) && /loc\.route\('\/remorci'\)/.test(vehTel));
T('telefonul: filtrul pe fel în Vehicule (felulVehiculului, din lib/incarcare.ts)', /\.filter\(\(v\) => !fel \|\| felulVehiculului\(v\) === fel\)/.test(vehTel));
T('telefonul păstrează iconița mașinii care n-a transmis încă (altfel filtrul ar grupa altfel decât pagina)', /\n\s+icon: d\.icon,\n/.test(store));

// ─── 5. Regulile paginii și ale telefonului, rulate pe aceleași cazuri ───────────────────────────────────────────
sect('5. Pagina și telefonul, pe aceleași cazuri, același rezultat');
let ts = null;
try { ts = require(path.join(ROOT, 'mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { /* lipsește */ } }
if (!ts) { T('compilatorul TypeScript (npm install în mobile/)', false); console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate'); process.exit(1); }
const mTel = { exports: {} };
vm.runInContext(ts.transpileModule(libTel, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: 'incarcare.ts' }).outputText,
  vm.createContext({ module: mTel, exports: mTel.exports, console }), { filename: 'incarcare.ts' });
const TEL = mTel.exports;
const iMC = html.indexOf('    function markerCategory(dev) {');
const MC = iMC > 0 ? html.slice(iMC, html.indexOf("\n      return 'car';\n    }", iMC) + "\n      return 'car';\n    }".length) : '';
T('markerCategory (pictograma din listă și de pe hartă) se poate citi din pagină', /return 'car';\n    \}$/.test(MC));
const WEB = vm.runInNewContext(BF + '\n' + BR + '\n' + MC + '\n' + BV +
  '\n;({ viz: _incVizibile, obis: _incObisnuite, trimis: _incDeTrimis, remText: _remRandText, remObis: _remObisnuite, fel: _vehFelul, FELURI: _VEH_FELURI })',
  { window: {}, document: {}, console });
T('aceleași grupe de feluri, în aceeași ordine', J(WEB.FELURI) === J(TEL.FELURI_FILTRU), J(WEB.FELURI.map((f) => f[0])) + ' / ' + J(TEL.FELURI_FILTRU.map((f) => f[0])));
const prima = (lista) => { for (const x of lista) if (JC(x.w) !== JC(x.t)) return x; return null; };
const FELURI = ['', 'xyz'].concat(inc.FELURI_VEHICUL.map((f) => f.id));
let dif = prima(FELURI.map((f) => ({ c: f, w: WEB.viz(f, meta), t: TEL.incVizibile(f, meta) })));
T('ce câmpuri arată fiecare fel (' + FELURI.length + ' feluri)', !dif, dif && J(dif));
const fFel = (id) => inc.FELURI_VEHICUL.find((f) => f.id === id) || {};
const VAL = [
  {},
  { inc_lungime: '', inc_latime: '', payload: '' },
  { inc_lungime: '9', inc_latime: '2.2', inc_inaltime: '2', inc_ampatament: '5', inc_axa_caroserie: '1', inc_sa_axa: '0.6', inc_tara_fata: '4000', inc_tara_spate: '3000', payload: '7000' },
].concat(inc.FELURI_VEHICUL.map((f) => ({ inc_lungime: f.lungime != null ? String(f.lungime) : '', inc_latime: f.latime != null ? String(f.latime) : '', inc_inaltime: f.inaltime != null ? String(f.inaltime) : '',
  inc_ampatament: f.ampatament != null ? String(f.ampatament) : '', inc_axa_caroserie: f.axaCaroserie != null ? String(f.axaCaroserie) : '', inc_sa_axa: f.sa != null ? String(f.sa) : '',
  inc_tara_fata: f.taraFata != null ? String(f.taraFata) : '', inc_tara_spate: '2700', payload: f.sarcina != null ? String(f.sarcina) : '', inc_remorca_id: '4' })));
const cazObis = [];
FELURI.forEach((fel) => FELURI.forEach((vechi) => [false, true].forEach((peste) => VAL.forEach((v) => cazObis.push({ c: [fel, vechi, peste, v], w: WEB.obis(v, fel, vechi, peste, meta), t: TEL.incObisnuite(v, fel, vechi, peste, meta) })))));
dif = prima(cazObis);
T('cifrele obișnuite la schimbarea felului (' + cazObis.length + ' cazuri)', !dif, dif && J(dif));
const cazTr = [];
FELURI.forEach((fel) => VAL.concat([{ inc_lungime: ' 7.2 ', inc_remorca_id: 12 }, { inc_lungime: null }]).forEach((v) => cazTr.push({ c: [fel, v], w: WEB.trimis(v, fel, meta), t: TEL.incDeTrimis(v, fel, meta) })));
dif = prima(cazTr);
T('ce pleacă la salvare (' + cazTr.length + ' cazuri)', !dif, dif && J(dif));
// Câteva rezultate, ca regula să fie și cea dorită, nu doar aceeași pe ambele părți:
const r1 = WEB.obis(VAL[VAL.length - 6], 'camion12', 'autotractor', false, meta);   // valorile obișnuite ale autotractorului + tara spate scrisă de om
T('autotractor → camion 12 t: cifrele neatinse se schimbă, cea scrisă de om (tara spate 2700) rămâne',
  r1.inc_ampatament === String(fFel('camion12').ampatament) && r1.inc_tara_fata === String(fFel('camion12').taraFata) && r1.inc_tara_spate === '2700' && r1.inc_lungime === String(fFel('camion12').lungime), J(r1));
T('„Pune cifrele obișnuite" le pune peste tot, dar sarcina utilă doar dacă e goală sau neatinsă',
  WEB.obis(VAL[2], 'duba35', '', true, meta).inc_lungime === String(fFel('duba35').lungime) && WEB.obis(VAL[2], 'duba35', '', true, meta).payload === '7000');
const t1 = WEB.trimis({ inc_lungime: '7', inc_sa_axa: '0.5', inc_remorca_id: '3' }, 'autotractor', meta);
T('autotractorul trimite caroseria goală și șaua; un camion, invers', t1.inc_lungime === null && t1.inc_sa_axa === '0.5' && WEB.trimis({ inc_lungime: '7', inc_sa_axa: '0.5' }, 'camion75', meta).inc_sa_axa === null && WEB.trimis({ inc_lungime: '7' }, 'camion75', meta).inc_lungime === '7');
const REM = [];
inc.FEL_REMORCA.forEach((f) => (inc.TIPURI_REMORCA[f.id].map((t) => t.id).concat([null, 'tren'])).forEach((tip) => [null, 'Schmitz S.CS'].forEach((model) => [true, false].forEach((cuDim) => {
  const r = { fel: f.id, tip, model, lungime_m: cuDim ? 13.62 : null, latime_m: cuDim ? 2.48 : null, inaltime_m: cuDim ? 3 : null };
  REM.push({ c: r, w: WEB.remText(r, meta), t: TEL.remorcaText(r, meta) });
}))));
dif = prima(REM);
T('rândul de sub numărul semiremorcii (' + REM.length + ' cazuri)', !dif, dif && J(dif));
T('…scris românește: „Semiremorcă · Mega · 13,62 × 2,48 × 3 m"', WEB.remText({ fel: 'semiremorca', tip: 'mega', lungime_m: 13.62, latime_m: 2.48, inaltime_m: 3 }, meta) === 'Semiremorcă · Mega · 13,62 × 2,48 × 3 m',
  WEB.remText({ fel: 'semiremorca', tip: 'mega', lungime_m: 13.62, latime_m: 2.48, inaltime_m: 3 }, meta));
const RO = [];
const VALR = [{}, { lungime_m: '', tara_kg: '' }, { lungime_m: '12', latime_m: '2.4', inaltime_m: '2.5', sarcina_kg: '20000', tara_kg: '6000', nr_axe: '2', pivot_axe_m: '7', axa_fata_m: '1', limita_axe_kg: '18000' }];
inc.FEL_REMORCA.forEach((f) => (inc.TIPURI_REMORCA[f.id].map((t) => t.id).concat(['', 'tren'])).forEach((tip) => [true, false].forEach((peste) => VALR.forEach((v) => RO.push({ c: [f.id, tip, peste, v], w: WEB.remObis(v, f.id, tip, peste, meta), t: TEL.remorcaObisnuite(v, f.id, tip, peste, meta) })))));
dif = prima(RO);
T('cifrele obișnuite ale tipului de semiremorcă (' + RO.length + ' cazuri)', !dif, dif && J(dif));
T('la remorca cu proțap, „de la pivot la axe" ia ampatamentul', WEB.remObis({}, 'remorca', 'prelata', true, meta).pivot_axe_m === String(inc.TIPURI_REMORCA.remorca[0].ampatament));
const ICONS = [null, 'car', 'van', 'truck', 'tir', 'bus', 'motorcycle', 'utilaj', 'tractor', 'trailer', 'autotractor', 'trailer_tech', 'excavator', 'forklift', 'combine', 'mixer', 'generator', 'boat', 'ambulance', 'electric', 'phev', 'hybrid', 'cng', 'necunoscut'];
const TIPURI = [null, 'Auto', 'Autotractor', 'Camion', 'TIR', 'Duba', 'Dubă', 'Autobuz', 'Motocicleta', 'Remorca', 'Remorcă tehnologică', 'Tractor', 'Utilaj', 'Buldoexcavator', 'Motostivuitor', 'Combină agricolă', 'Automixt', 'Grup electrogen', 'Barcă', 'Ambulanță', 'Electric', 'Plug-in hibrid', 'Hibrid', 'CNG/GPL', 'Altul'];
const FV = [];
ICONS.forEach((icon) => TIPURI.forEach((vt) => { const d = { icon, vehicle_type: vt }; FV.push({ c: d, w: WEB.fel(d), t: TEL.felulVehiculului(d) }); }));
[{ _remorca: true, fel: 'semiremorca' }, { _remorca: true, fel: 'remorca' }, { _remorca: true }].forEach((d) => FV.push({ c: d, w: WEB.fel(d), t: TEL.felulVehiculului(d) }));
dif = prima(FV);
T('felul fiecărui vehicul (' + FV.length + ' combinații de iconiță și fel)', !dif, dif && J(dif));
T('autotractorul are felul lui (nu „Camioane"), semiremorca fără GPS la fel', WEB.fel({ vehicle_type: 'Autotractor' }) === 'autotractor' && WEB.fel({ _remorca: true, fel: 'semiremorca' }) === 'semiremorca' && WEB.fel({ vehicle_type: 'Remorca' }) === 'remorca');

// ─── 6. Pe server pornit ─────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3489, DIR = '.flota-incarcare-db';
try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', DEMO_DISABLED: 'true',
  SESSION_SECRET: 'ci_flota_incarcare', PORT: String(PORT), TCP_PORT: '5489', PGLITE_DIR: DIR + '/pgdata', DATABASE_URL: '' };
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const cere = (m, u, b) => fetch(B + u, { method: m, headers: H, body: b === undefined ? undefined : J(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  return { GET: (u) => cere('GET', u), POST: (u, b) => cere('POST', u, b), PUT: (u, b) => cere('PUT', u, b), DEL: (u) => cere('DELETE', u) };
}
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const S = await intra('admin', 'test1234');

  sect('6. Pe server pornit');
  const T1 = (await S.POST('/api/companies', { name: 'CI Transport Marfă' })).j.id;
  const T2 = (await S.POST('/api/companies', { name: 'CI Taxi Oraș' })).j.id;
  const T3 = (await S.POST('/api/companies', { name: 'CI Doar Remorci' })).j.id;
  await S.POST('/api/devices', { imei: '861000000340001', name: 'Volvo FH', plate: 'B 01 TIR', company_id: T1, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: '861000000340002', name: 'Logan', plate: 'B 02 TAX', company_id: T2, vehicle_type: 'Auto' });
  const conturi = {};
  for (const [u, rol, co] of [['adm1@ci.ro', 'company_admin', T1], ['vw1@ci.ro', 'viewer', T1], ['adm2@ci.ro', 'company_admin', T2]]) {
    const cr = await S.POST('/api/users', { username: u, full_name: u, role: rol, company_id: co });
    await puneParola(cr.j, 'Str4da-Verde-2026', B);
    conturi[u] = await intra(u, 'Str4da-Verde-2026');
  }
  const A1 = conturi['adm1@ci.ro'], V1 = conturi['vw1@ci.ro'], A2 = conturi['adm2@ci.ro'];

  let r = await A1.GET('/api/incarcare/meta');
  T('cifrele obișnuite vin de la server, cu felurile care arată fila', r.s === 200 && r.j.feluriVehicul && r.j.feluriVehicul.length === 6 && r.j.tipuriCuMarfa.indexOf('Autotractor') >= 0, r.s);
  r = await A2.GET('/api/remorci');
  T('firma fără camioane (modulul oprit): refuz, „feature_disabled"', r.s === 403 && r.j.error === 'feature_disabled', J(r));
  r = await A1.POST('/api/remorci', { fel: 'semiremorca', tip: 'mega', plate: 'b 10 sem', company_id: T2, lungime_m: '13,62', latime_m: 2.48, inaltime_m: 3, sarcina_kg: '24.000', pivot_axe_m: 7.8 });
  const R1 = r.j;
  T('firma cu autotractor își trece o semiremorcă („13,62", „24.000"), în firma EI oricare ar fi cererea',
    r.s === 200 && R1.company_id === T1 && R1.plate === 'B 10 SEM' && R1.lungime_m === 13.62 && R1.sarcina_kg === 24000, J(r));
  r = await A1.POST('/api/remorci', { fel: 'semiremorca', plate: 'X', lungime_m: 30, latime_m: 2.4, inaltime_m: 2.7 });
  T('cifre fără sens: refuz pe față', r.s === 400 && r.j.error === 'Lungimea: între 1 și 20', J(r));
  r = await V1.GET('/api/remorci');
  T('vizualizatorul firmei le vede', r.s === 200 && r.j.length === 1 && r.j[0].id === R1.id, J(r));
  r = await V1.POST('/api/remorci', { fel: 'remorca', plate: 'B 11 REM', lungime_m: 7.7, latime_m: 2.48, inaltime_m: 2.7 });
  T('…dar nu scrie', r.s === 403, r.s);
  await S.PUT('/api/companies/' + T2 + '/features', { features: { incarcare: true } });
  r = await A2.GET('/api/remorci');
  T('altă firmă (cu modulul pornit de noi) nu vede semiremorcile primei', r.s === 200 && r.j.length === 0, J(r));
  r = await A2.PUT('/api/remorci/' + R1.id, { fel: 'semiremorca', plate: 'FURAT', lungime_m: 13, latime_m: 2.4, inaltime_m: 2.7 });
  const r2 = await A2.DEL('/api/remorci/' + R1.id);
  T('…nici n-o schimbă, nici n-o șterge (404, ca un rând care nu există)', r.s === 404 && r2.s === 404, r.s + ' / ' + r2.s);
  r = await S.POST('/api/remorci', { fel: 'remorca', tip: 'box', plate: 'B 12 REM', lungime_m: 7.2, latime_m: 2.48, inaltime_m: 2.6 });
  T('noi fără firmă aleasă: refuz', r.s === 400 && /alege firma/.test(r.j.error || ''), J(r));
  r = await S.POST('/api/remorci', { fel: 'remorca', tip: 'box', plate: 'B 12 REM', company_id: T2, lungime_m: 7.2, latime_m: 2.48, inaltime_m: 2.6 });
  const R2 = r.j;
  T('noi, cu firma aleasă: se scrie acolo', r.s === 200 && R2.company_id === T2, J(r));
  r = await S.GET('/api/remorci?company_id=' + T2);
  T('noi vedem semiremorcile unei firme anume', r.s === 200 && r.j.length === 1 && r.j[0].id === R2.id, J(r));

  const IM = '861000000340001';
  r = await A1.PUT('/api/devices/' + IM + '/details', { inc_fel: 'autotractor', inc_ampatament: '3,7', inc_sa_axa: '0.55', inc_tara_fata: '5200', inc_remorca_id: R1.id });
  let f = (await A1.GET('/api/devices/' + IM + '/full')).j;
  T('fila „Încărcare" se salvează (cu „3,7" citit ca 3,7) și semiremorca obișnuită se leagă',
    r.s === 200 && f.inc_fel === 'autotractor' && Number(f.inc_ampatament) === 3.7 && Number(f.inc_sa_axa) === 0.55 && f.inc_tara_fata === 5200 && f.inc_remorca_id === R1.id, J({ r, f: [f.inc_fel, f.inc_ampatament, f.inc_sa_axa, f.inc_tara_fata, f.inc_remorca_id] }));
  r = await A1.PUT('/api/devices/' + IM + '/details', { inc_remorca_id: R2.id });
  T('semiremorca altei firme: refuz', r.s === 400 && /nu e a firmei acestui vehicul/.test(r.j.error || ''), J(r));
  r = await A1.PUT('/api/devices/' + IM + '/details', { inc_fel: 'tren' });
  const r3 = await A1.PUT('/api/devices/' + IM + '/details', { inc_lungime: 99 });
  T('fel necunoscut / lungime 99: refuz pe față', r.s === 400 && /Felul vehiculului/.test(r.j.error || '') && r3.s === 400 && /Lungimea/.test(r3.j.error || ''), J([r, r3]));
  f = (await A1.GET('/api/devices/' + IM + '/full')).j;
  T('…și nu se scrie nimic din cererea refuzată', f.inc_fel === 'autotractor' && f.inc_lungime == null, J([f.inc_fel, f.inc_lungime]));
  r = await V1.PUT('/api/devices/' + IM + '/details', { inc_fel: 'camion12' });
  T('vizualizatorul nu schimbă fila', r.s === 403, r.s);
  r = await A1.DEL('/api/remorci/' + R1.id);
  f = (await A1.GET('/api/devices/' + IM + '/full')).j;
  T('semiremorca ștearsă nu rămâne legată de autotractor', r.s === 200 && f.inc_remorca_id == null, J([r.s, f.inc_remorca_id]));
  const R3 = (await A1.POST('/api/remorci', { fel: 'semiremorca', tip: 'frigo', plate: 'B 13 FRG', lungime_m: 13.3, latime_m: 2.46, inaltime_m: 2.6 })).j;
  await A1.PUT('/api/devices/' + IM + '/details', { inc_remorca_id: R3.id });
  await S.PUT('/api/devices/' + IM + '/company', { company_id: T2 });
  f = (await S.GET('/api/devices/' + IM + '/full')).j;
  T('autotractorul mutat pe altă firmă își pierde semiremorca firmei vechi (felul și cifrele rămân)', f.company_id === T2 && f.inc_remorca_id == null && f.inc_fel === 'autotractor', J([f.company_id, f.inc_remorca_id, f.inc_fel]));

  let s3 = (await S.GET('/api/companies/' + T3 + '/settings')).j;
  T('firma fără niciun vehicul: simulatorul oprit', s3.features && s3.features.incarcare === false, J(s3.features));
  const R4 = (await S.POST('/api/remorci', { fel: 'semiremorca', plate: 'B 14 SEM', company_id: T3, lungime_m: 13.6, latime_m: 2.48, inaltime_m: 2.7 })).j;
  s3 = (await S.GET('/api/companies/' + T3 + '/settings')).j;
  T('o semiremorcă trecută pornește singură simulatorul', s3.features && s3.features.incarcare === true && s3.flota_grea === true, J({ f: s3.features, g: s3.flota_grea }));
  await S.DEL('/api/remorci/' + R4.id);
  s3 = (await S.GET('/api/companies/' + T3 + '/settings')).j;
  T('…iar ștearsă (fără alt camion), îl oprește la loc', s3.features && s3.features.incarcare === false, J(s3.features));
  fin();
})().catch((e) => { console.log('eroare: ' + e.message); rele++; fin(); });
function fin() {
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
}
