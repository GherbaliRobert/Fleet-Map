// verify_tarife.js — tarifele care depind de MĂRIMEA FLOTEI + moneda dublă + flota tăiată.
//
//   node verify_tarife.js
//
// De ce există fișierul ăsta:
//
//   1. Totul avea un preț FIX, la fel la 10 mașini și la 100. Nu e drept nici pentru noi (RA
//      Insight ne costă mai mult la flote mari — măsurat), nici pentru client (la 10 mașini plătea
//      cât unul cu 100). Acum totul se socotește PE VEHICUL. Iar Tahograful și e-Transportul nu mai
//      sunt rânduri separate în ofertă: tariful lor intră în abonamentul lunar al fiecărei mașini
//      („nu le taxăm separat, nu abuzăm" — Alin, 10.09).
//
//   2. Regula casei: ORICE sumă se vede în lei ȘI în euro. Se uita ușor la un rând nou de tabel.
//
//   3. Un răspuns despre „toată flota" era tăiat în tăcere la 80 de vehicule: o firmă cu 200 de
//      mașini primea „Total: 80 vehicule" — un număr pur și simplu greșit. Acum numărul adevărat
//      merge mai departe și, dacă lista e tăiată, SE SPUNE.
//
// Codul nu se copiază aici: se decupează din public/index.html și se execută.

const fs = require('fs');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const fq = require('./fleet_quick');

// ── Decupez blocul de tarife din pagină și îl rulez ─────────────────────────────────────────────
function decupez(nume) {
  const a = html.indexOf('// ── începe „' + nume + '"'), b = html.indexOf('// ── sfârșit „' + nume + '" ──');
  if (a < 0 || b < 0) { console.log('✗ nu găsesc blocul „' + nume + '" în index.html'); process.exit(1); }
  return html.slice(a, b);
}
const M = new Function('document', '_ofN', '_ofPropune', '_ofAtinse', 'raxOfRecalc', '_lei2eur',
  decupez('Tarife după mărimea flotei') + '\n; return { _aiqCost, _aiqPret, _modVeh, AIQ_PE_VEH, AIQ_MIN, MOD_TARIF, AIQ_COST_BAZA, AIQ_COST_VEH, AIQ_GREU, _ofHintModul, _ofHintAiq };')(
  { getElementById: () => null }, (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
  () => {}, {}, () => {}, (v) => v / 5);

// ── Și calculatorul întreg, cu un document de carton: câmpurile sunt o listă de valori ──────────
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate',
  decupez('Calculatorul de ofertă') + '\n; return { _ofCalc: _ofCalc, _raxOf: _raxOf, _OF_PRETURI_DEF: _OF_PRETURI_DEF };');
function calculator(campuri) {
  const val = Object.assign({}, campuri);
  const doc = {
    getElementById: (id) => {
      if (!(id in val)) return null;
      const v = val[id];
      return (typeof v === 'boolean') ? { type: 'checkbox', checked: v, value: '' } : { value: String(v) };
    }
  };
  return CALC(doc, {}, () => {}, 5.0);
}
// O flotă obișnuită, pe care se sprijină probele de mai jos.
function flota(peste) {
  return Object.assign({
    'of-cl-name': 'Transport Zebra SRL', 'of-cl-cui': '', 'of-cl-contact': '', 'of-name': 'Ofertă',
    'of-nveh': 20, 'of-ncan': 20, 'of-nfms': 0,
    'of-aiA': false, 'of-aiAg': false, 'of-tahograf': false, 'of-etransport': false, 'of-agenti': true,
    'of-aiqN': 50, 'of-aiqP': 0.2, 'of-ret': '6', 'of-retcustom-m': 0, 'of-contract': 12, 'of-notes': '',
    'of-qGps': 0, 'of-qLvCan': 0, 'of-qCanInc': 0, 'of-qFms': 0, 'of-qUninstall': 0, 'of-qReplace': 0, 'of-kmTravel': 0,
    'of-dq130': 0, 'of-dq150': 0, 'of-dq650': 0, 'of-dqLvCan': 0
  }, peste || {});
}
const linie = (r, cuvant) => r.lines.filter(l => l.label.indexOf(cuvant) >= 0)[0];

sect('1. Cât ne costă o întrebare — crește cu flota');
// Cifrele vin din măsurătoarea din aplicația pornită (flote de 5→200 de vehicule, întrebare grea).
T('la 0 vehicule = costul de bază', Math.abs(M._aiqCost(0) - 0.030) < 1e-9, M._aiqCost(0));
T('la 10 vehicule ≈ 0,033 lei', Math.abs(M._aiqCost(10) - 0.0328) < 0.001, M._aiqCost(10));
T('la 20 vehicule ≈ 0,036 lei', Math.abs(M._aiqCost(20) - 0.0356) < 0.001, M._aiqCost(20));
T('la 50 vehicule ≈ 0,044 lei', Math.abs(M._aiqCost(50) - 0.044) < 0.001, M._aiqCost(50));
T('la 100 vehicule ≈ 0,058 lei', Math.abs(M._aiqCost(100) - 0.058) < 0.001, M._aiqCost(100));
T('e strict crescător', M._aiqCost(100) > M._aiqCost(50) && M._aiqCost(50) > M._aiqCost(10));
T('o flotă de 100 costă de ~1,8 ori cât una de 5', (M._aiqCost(100) / M._aiqCost(5)) > 1.5 && (M._aiqCost(100) / M._aiqCost(5)) < 2.2,
  (M._aiqCost(100) / M._aiqCost(5)).toFixed(2));
T('un număr negativ de vehicule nu scade costul sub bază', M._aiqCost(-50) === M._aiqCost(0));
T('text în loc de număr → costul de bază, nu NaN', M._aiqCost('multe') === M._aiqCost(0));
T('scenariul negru e mai scump, dar nu de 5 ori (aia era presupunerea veche)', M.AIQ_GREU > 1.5 && M.AIQ_GREU < 3, M.AIQ_GREU);

sect('2. Prețul RA Insight — pe vehicul, cu minim');
T('la 5 vehicule intră minimul pachetului de 50', M._aiqPret(50, 5) === M.AIQ_MIN['50'], M._aiqPret(50, 5));
T('la 20 de vehicule trece de minim', M._aiqPret(50, 20) === 30, M._aiqPret(50, 20));
T('pachetul mai mare costă mai mult, la aceeași flotă', M._aiqPret(200, 40) > M._aiqPret(50, 40),
  M._aiqPret(50, 40) + ' vs ' + M._aiqPret(200, 40));
T('flota mai mare costă mai mult, la același pachet', M._aiqPret(100, 100) > M._aiqPret(100, 20),
  M._aiqPret(100, 20) + ' vs ' + M._aiqPret(100, 100));
T('„nelimitat" (0) are cel mai mare tarif pe vehicul', M.AIQ_PE_VEH['0'] > M.AIQ_PE_VEH['200']);
T('un pachet necunoscut nu dă NaN', Number.isFinite(M._aiqPret(77, 10)), M._aiqPret(77, 10));
// Regula de bază a afacerii: prețul cerut trebuie să acopere costul, cu marjă, la orice flotă.
[10, 20, 50, 100, 200].forEach(function (v) {
  [50, 100, 150, 200].forEach(function (n) {
    const cost = n * M._aiqCost(v) * M.AIQ_GREU;
    T('preț > cost la uz intens (' + v + ' vehicule, ' + n + ' întrebări)', M._aiqPret(n, v) > cost * 1.5,
      M._aiqPret(n, v) + ' lei vs cost ' + cost.toFixed(1));
  });
});

sect('3. Tahograf și e-Transport intră ÎN abonamentul mașinii, nu ca linie separată');
// Hotărârea lui Alin (10.09): „nu le taxăm separat, nu abuzăm". Deci tariful lor pe vehicul se
// adaugă în prețul lunar al mașinii, iar în ofertă NU apare niciun rând de „modul".
T('Tahograf: 5 lei/vehicul', M.MOD_TARIF.tahograf.peVeh === 5);
T('e-Transport: 4 lei/vehicul', M.MOD_TARIF.etransport.peVeh === 4);
T('nu mai există minim pe modul (nu mai e linie de sine stătătoare)',
  M.MOD_TARIF.tahograf.min === undefined && M.MOD_TARIF.etransport.min === undefined);

const fara = calculator(flota())._ofCalc();
T('fără module: 20 × 45 = 900 lei', fara.monthly === 900, fara.monthly);
T('și prețul pe mașină e tariful gol', linie(fara, 'CAN').unit === 45, linie(fara, 'CAN').unit);
T('fără module nu scrie „include" nimic', !linie(fara, 'CAN').extra);

const cuEt = calculator(flota({ 'of-etransport': true }))._ofCalc();
T('cu e-Transport, mașina costă 45 + 4 = 49 lei', linie(cuEt, 'CAN').unit === 49, linie(cuEt, 'CAN').unit);
T('totalul lunar e 20 × 49 = 980 lei', cuEt.monthly === 980, cuEt.monthly);
T('NU apare o linie separată de modul', !cuEt.lines.some(l => /Modul e-Transport/.test(l.label)),
  cuEt.lines.map(l => l.label).join(' | '));
T('dar scrie sub mașină ce include', /e-Transport/.test(linie(cuEt, 'CAN').extra || ''), linie(cuEt, 'CAN').extra);

// Tahograful ține de camioane. Cu camioane trecute, urcă DOAR prețul lor.
const cuTh = calculator(flota({ 'of-nveh': 20, 'of-ncan': 12, 'of-nfms': 8, 'of-tahograf': true }))._ofCalc();
T('camionul cu tahograf costă 65 + 5 = 70 lei', linie(cuTh, 'FMS').unit === 70, linie(cuTh, 'FMS').unit);
T('mașina fără tahograf rămâne la 45 lei', linie(cuTh, 'CAN').unit === 45, linie(cuTh, 'CAN').unit);
T('totalul: 12 × 45 + 8 × 70 = 1100 lei', cuTh.monthly === 1100, cuTh.monthly);
T('scrie „include tahograf" doar la camioane',
  /tahograf/.test(linie(cuTh, 'FMS').extra || '') && !/tahograf/.test(linie(cuTh, 'CAN').extra || ''));
T('nicio linie de „Modul Tahograf"', !cuTh.lines.some(l => /Modul Tahograf/.test(l.label)));

// Dacă bifezi tahograful fără să treci camioane, se pune pe toată flota — altfel ai bifat degeaba.
const thGol = calculator(flota({ 'of-nfms': 0, 'of-tahograf': true }))._ofCalc();
T('tahograf bifat fără camioane → se pune pe toată flota', linie(thGol, 'CAN').unit === 50, linie(thGol, 'CAN').unit);
T('și se vede în total', thGol.monthly === 1000, thGol.monthly);

// Amândouă odată
const ambele = calculator(flota({ 'of-tahograf': true, 'of-etransport': true }))._ofCalc();
T('cu amândouă: 45 + 5 + 4 = 54 lei/mașină', linie(ambele, 'CAN').unit === 54, linie(ambele, 'CAN').unit);
T('scrie amândouă sub mașină', /tahograf și e-Transport/.test(linie(ambele, 'CAN').extra || ''), linie(ambele, 'CAN').extra);

// RA Insight RĂMÂNE linie separată — e un pachet de întrebări, cu cotă lunară.
const cuAi = calculator(flota({ 'of-aiA': true }))._ofCalc();
T('RA Insight rămâne linie de sine stătătoare', !!linie(cuAi, 'RA Insight'), cuAi.lines.map(l => l.label).join(' | '));
T('și spune câte întrebări are în ea', /50 apeluri/.test(linie(cuAi, 'RA Insight').label));
T('agenții apar cu 0 lei', linie(cuAi, 'Agenți') && linie(cuAi, 'Agenți').total === 0);

sect('3b. Pe ce vehicule se socotește fiecare modul');
T('tahograful se socotește pe camioanele cu tahograf, dacă sunt trecute',
  M._modVeh({ nVeh: 30, nFms: 12 }).tahograf === 12, JSON.stringify(M._modVeh({ nVeh: 30, nFms: 12 })));
T('dacă nu sunt trecute camioane cu FMS, se socotește pe toată flota',
  M._modVeh({ nVeh: 30, nFms: 0 }).tahograf === 30);
T('nu poate ieși mai mult decât are flota', M._modVeh({ nVeh: 10, nFms: 99 }).tahograf === 10);
T('e-Transport și RA Insight merg pe toată flota',
  M._modVeh({ nVeh: 30, nFms: 12 }).etransport === 30 && M._modVeh({ nVeh: 30, nFms: 12 }).aiA === 30);

sect('3c. Cum se plătește — scris ca într-o ofertă, nu ca o listă de sume');
const PL = html.slice(html.indexOf('function _ofBlocPlata'), html.indexOf('window.raxOfRecalc = function'));
T('în aplicație: două blocuri, o dată și lunar', /La semnare, o singură dată/.test(PL) && /Apoi, lunar/.test(PL));
T('spune că se facturează o singură dată, la semnare', /Se facturează o singură dată, la semnarea contractului/.test(PL));
T('spune că abonamentul e lunar, pe toată durata contractului', /facturat în fiecare lună, pe toată durata contractului/.test(PL));
T('și cât face pe tot contractul', /Pe ' \+ luni \+ ' ' \+ _rDe\(luni\) \+ 'luni/.test(PL));
const PD = html.slice(html.indexOf('window.raxOfExportPdf'), html.indexOf('window.raxDeleteCompany'));
T('pe hârtie: „Cum se plătește", nu „Cât plătiți"', /<h2>Cum se plătește<\/h2>/.test(PD) && !/<h2>Cât plătiți<\/h2>/.test(PD));
T('pasul 1 e la semnarea contractului', /La semnarea contractului, o singură dată/.test(PD));
T('pasul 2 e lunar, cu totalul pe contract', /Apoi, în fiecare lună/.test(PD) && /Total pe ' \+ luni/.test(PD));
T('scrie că echipamentele rămân ale clientului', /rămân proprietatea clientului/.test(PD));
T('și înșiră ce include abonamentul, pe fiecare mașină', /Abonamentul lunar include, pentru fiecare mașină/.test(PD));
T('lista de incluse pornește de la monitorizarea GPS', /monitorizare GPS în timp real/.test(PD));
T('și pomenește modulele doar dacă sunt bifate',
  /if \(r\.cfg\.tahograf\) incl\.push/.test(PD) && /if \(r\.cfg\.etransport\) incl\.push/.test(PD));
T('blocurile nu se mai rup între pagini', /\.plata\{page-break-inside:avoid;break-inside:avoid;\}|table,\.box,\.plata\{page-break-inside:avoid/.test(PD + html));
T('nici titlul nu rămâne singur la baza paginii', /h2\{page-break-after:avoid/.test(html));
// „20 de vehicule", dar „12 luni"
const DE = new Function(html.slice(html.indexOf('function _rDe(n)'), html.indexOf('// Aceleași sume, dar pentru celule de tabel:')) + '\n; return _rDe;')();
T('„20 de vehicule"', DE(20) === 'de ');
T('„12 luni", fără „de"', DE(12) === '');
T('„100 de vehicule"', DE(100) === 'de ');
T('„101 vehicule", fără „de"', DE(101) === '');
T('„1 vehicul"', DE(1) === '');
T('zero nu devine „0 de vehicule"', DE(0) === '');

sect('4. Moneda dublă — nicio sumă singură pe ecran');
// Celulele de tabel din rezumat trebuie să treacă prin _celLei/_celEur (care scriu ambele monede).
const rez = html.slice(html.indexOf('window.raxOfRecalc = function'), html.indexOf('// ─── Inventar dispozitive GPS'));
T('rândurile de abonament au ambele monede', /_celLei\(l\.total\)/.test(rez));
T('și prețul unitar de abonament', /_celLei\(l\.unit, true\)/.test(rez));
T('rândurile de montaj au ambele monede', (rez.match(/_celLei\(l\.total\)/g) || []).length >= 2);
T('rândurile de echipamente au ambele monede', /_celEur\(l\.total\)/.test(rez) && /_celEur\(l\.unit, true\)/.test(rez));
T('nu mai există subtotal scris singur, fără monedă',
  !/<b>' \+ l\.total\.toFixed\(0\) \+ '<\/b>/.test(rez));
T('tarifele editabile primesc echivalentul lângă ele', /_ofEuroLangaTarife\(\)/.test(rez));
const celLei = html.slice(html.indexOf('function _celLei('), html.indexOf('function _celEur('));
T('_celLei scrie și euro', /_lei2eur/.test(celLei) && /lei/.test(celLei));
// Lista câmpurilor cu echivalent: toate prețurile din formular trebuie să fie acolo
const listaLei = (html.match(/var _OF_CAMP_LEI = \[([\s\S]*?)\];/) || [])[1] || '';
const listaEur = (html.match(/var _OF_CAMP_EUR = \[([\s\S]*?)\];/) || [])[1] || '';
['pPlain', 'pCan', 'pFms', 'pAiA', 'pTahograf', 'pEtransport', 'mGps', 'mTravel'].forEach(function (k) {
  T('câmpul „' + k + '" are echivalent în euro', listaLei.indexOf("'" + k + "'") >= 0);
});
['dFmc130', 'dFmc150', 'dFmc650', 'dLvCan'].forEach(function (k) {
  T('aparatul „' + k + '" are echivalent în lei', listaEur.indexOf("'" + k + "'") >= 0);
});
// Pe hârtia clientului (PDF-ul ofertei): coloană de euro la fiecare tabel + cursul scris jos
const pdf = html.slice(html.indexOf('window.raxOfExportPdf'), html.indexOf('window.raxDeleteCompany'));
T('PDF-ul are coloană „≈ EUR" la abonament', /≈ EUR/.test(pdf));
T('PDF-ul are coloană „≈ RON" la echipamente', /≈ RON/.test(pdf));
T('totalul lunar din PDF are și euro', /Total lunar[\s\S]{0,200}_fxRate/.test(pdf));
T('PDF-ul spune cursul folosit și că se facturează în lei', /facturarea se face în lei/.test(pdf));

sect('5. Un singur loc pentru tarifele de pornire');
T('există _OF_PRETURI_DEF', /var _OF_PRETURI_DEF = \{/.test(html));
T('„Ofertă nouă" folosește aceeași listă, nu una paralelă',
  /raxOfReset = function[\s\S]{0,200}_OF_PRETURI_DEF/.test(html) && !/raxOfReset = function[\s\S]{0,300}pAiA: 150/.test(html));
T('lista de pornire are și prețurile modulelor',
  /_OF_PRETURI_DEF[\s\S]{0,400}pTahograf/.test(html) && /_OF_PRETURI_DEF[\s\S]{0,400}pEtransport/.test(html));

sect('6. Propunerea nu calcă ce ai scris tu');
T('propunerea de tarife trece prin _ofPropune (care respectă ce e scris de mână)',
  /_ofPropuneTarife[\s\S]{0,700}_ofPropune\('of-pAiA'/.test(html));
T('schimbarea numărului de vehicule reface propunerea',
  /_ofCompleteazaDinVehicule[\s\S]{0,900}_ofPropuneTarife\(\)/.test(html));
T('la o ofertă DESCHISĂ pentru editare nu se propune nimic',
  /if \(_raxOf\.editingId == null\) _ofCompleteazaDinVehicule\(\);/.test(html));
T('prețurile salvate în ofertă se marchează ca scrise de mână',
  /Object\.keys\(prices \|\| \{\}\)\.forEach\(function \(k\) \{ _ofAtinse\['of-' \+ k\] = true; \}\);/.test(html));
T('la desenarea formularului, urmele vechi se șterg', /_ofAtinse = \{\};/.test(html));
T('alegerea altui pachet lasă propunerea să scrie iar prețul',
  /raxOfAiqPreset = function[\s\S]{0,220}_ofAtinse\['of-pAiA'\] = false/.test(html));

sect('7. Flota tăiată nu mai minte');
T('plafonul nu mai e 80 înfipt în cod', !/positions\.slice\(0, 80\)/.test(server));
T('există un plafon cu nume și cu variabilă de mediu', /FLOTA_IN_RASPUNS = parseInt\(process\.env\.AI_FLEET_MAX\)/.test(server));
T('numărul adevărat al flotei merge mai departe', /Object\.defineProperty\(out, 'totalFlota'/.test(server));
T('proprietatea e ne-enumerabilă (nu strică JSON-ul trimis la model)', /totalFlota'[\s\S]{0,60}enumerable: false/.test(server));
T('unealta „starea live" spune modelului câte vehicule are flota', /total_flota: snap\.totalFlota/.test(server));
T('și îl avertizează când lista e tăiată', /out\.atentie = 'Flota are '/.test(server));
T('răspunsurile rapide primesc numărul adevărat', (server.match(/total: snap(shot)?\.totalFlota/g) || []).length === 2,
  (server.match(/total: snap(shot)?\.totalFlota/g) || []).join(' | '));

// Răspunsurile locale (gratuite): „Status flotă" trebuie să spună numărul ADEVĂRAT
const acum = Date.now();
const veh = (i) => ({ imei: 'i' + i, nume: 'Camion ' + i, nr: 'TM 01 AAA', viteza_kmh: i % 2 ? 60 : 0,
  ultima_actualizare: new Date(acum - 60000).toISOString(), locatie: 'Timișoara' });
const lista80 = Array.from({ length: 80 }, (_, i) => veh(i));
const rTaiat = fq.answer('status', { snapshot: lista80, today: [], now: acum, total: 200 });
T('„Status flotă" spune 200, nu 80', /Total: \*\*200\*\*/.test(rTaiat.reply), rTaiat.reply.split('\n')[2]);
T('și spune limpede că defalcarea e pe o parte', /primele 80/.test(rTaiat.reply));
T('nota de tăiere apare la final', /Flota are 200 vehicule/.test(rTaiat.reply));
const rIntreg = fq.answer('status', { snapshot: lista80, today: [], now: acum, total: 80 });
T('la o flotă întreagă nu apare nicio notă', !/primele/.test(rIntreg.reply) && /Total: \*\*80\*\*/.test(rIntreg.reply));
T('fără „total" dat, se poartă ca înainte', !/primele/.test(fq.answer('status', { snapshot: lista80, today: [], now: acum }).reply));
const rOprite = fq.answer('stopped', { snapshot: lista80, today: [], now: acum, total: 200 });
T('și listele (oprite) spun că sunt doar o parte', /Flota are 200 vehicule/.test(rOprite.reply));
T('răspunsul „reformulează" rămâne curat', fq.answer('habarnam', { snapshot: lista80, now: acum, total: 200 }).reply === 'Reformulează, te rog.');

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
