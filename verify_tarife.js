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
  decupez('Tarife după mărimea flotei') + '\n; return { _aiqCost, _aiqPretLoc, _aiqFond, _modVeh, AIQ_PRET_LOC, MOD_TARIF, AIQ_COST_BAZA, AIQ_COST_VEH, AIQ_GREU, _ofHintModul, _ofHintAiq };')(
  { getElementById: () => null }, (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
  () => {}, {}, () => {}, (v) => v / 5);

// ── Și calculatorul întreg, cu un document de carton: câmpurile sunt o listă de valori ──────────
// „de" din „20 de vehicule" și fondul de întrebări stau în afara blocului decupat (în aplicație sunt
// în aceeași pagină); aici se dau ca argumente, ca socoteala să ruleze la fel.
const _rDe = new Function(html.slice(html.indexOf('function _rDe(n)'), html.indexOf('// Aceleași sume, dar pentru celule de tabel:')) + '\n; return _rDe;')();
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate', '_rDe', '_aiqFond',
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
  return CALC(doc, {}, () => {}, 5.0, _rDe, M._aiqFond);
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

sect('2. RA Insight se vinde pe CONT, iar prețul unui cont crește cu flota');
// Hotărât cu Alin, 11.09: 1 cont = 15 lei, 3 conturi = 45. Întrebările conturilor intră într-un
// FOND COMUN al firmei, ca să nu rămână unul blocat în timp ce colegul are cota nefolosită.
T('la 8 vehicule, un cont costă 12 lei', M._aiqPretLoc(8) === 12, M._aiqPretLoc(8));
T('la 20 de vehicule, 15 lei', M._aiqPretLoc(20) === 15, M._aiqPretLoc(20));
T('la 50, 19 lei', M._aiqPretLoc(50) === 19, M._aiqPretLoc(50));
T('la 100, 25 lei', M._aiqPretLoc(100) === 25, M._aiqPretLoc(100));
T('peste 100, 35 lei', M._aiqPretLoc(250) === 35, M._aiqPretLoc(250));
T('prețul unui cont nu scade niciodată când crește flota',
  [0, 5, 10, 11, 25, 26, 50, 51, 100, 101, 500].every(function (v, i, a2) { return i === 0 || M._aiqPretLoc(v) >= M._aiqPretLoc(a2[i - 1]); }));
T('fără vehicule, tot are un preț (nu 0)', M._aiqPretLoc(0) > 0, M._aiqPretLoc(0));
T('text în loc de număr nu dă NaN', Number.isFinite(M._aiqPretLoc('multe')));
// Fondul comun
T('3 conturi × 50 = 150 de întrebări pe lună', M._aiqFond(3, 50) === 150, M._aiqFond(3, 50));
T('un cont singur = 50', M._aiqFond(1, 50) === 50);
T('„nelimitat" (0 pe cont) nu dă fond', M._aiqFond(3, 0) === 0);
T('conturi lipsă nu dau fond negativ', M._aiqFond(-2, 50) === 0, M._aiqFond(-2, 50));
// Regula de bază a afacerii: ce cerem acoperă ce ne costă, la orice flotă și oricâte conturi.
[10, 20, 50, 100, 200].forEach(function (v) {
  [1, 3, 5].forEach(function (c) {
    const fond = M._aiqFond(c, 50);
    const cost = fond * M._aiqCost(v) * M.AIQ_GREU;
    const pret = M._aiqPretLoc(v) * c;
    T('preț > cost la uz intens (' + v + ' vehicule, ' + c + ' conturi)', pret > cost * 1.5,
      pret + ' lei vs cost ' + cost.toFixed(1));
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
T('și scrie câte CONTURI se vând', /RA Insight — 1 cont/.test(linie(cuAi, 'RA Insight').label), linie(cuAi, 'RA Insight').label);
T('iar dedesubt, fondul comun de întrebări',
  /50 de întrebări pe lună, în comun/.test(linie(cuAi, 'RA Insight').extra || ''), linie(cuAi, 'RA Insight').extra);
// Mai multe conturi: prețul se înmulțește, fondul la fel.
const cuAi3 = calculator(flota({ 'of-aiA': true, 'of-aiqSeats': 3 }))._ofCalc();
T('3 conturi × 15 lei = 45 lei/lună', linie(cuAi3, 'RA Insight').total === 45, linie(cuAi3, 'RA Insight').total);
T('și fondul devine 150 de întrebări', /150 de întrebări/.test(linie(cuAi3, 'RA Insight').extra || ''), linie(cuAi3, 'RA Insight').extra);
T('eticheta zice „3 conturi", nu „3 cont"', /3 conturi/.test(linie(cuAi3, 'RA Insight').label));
T('totalul lunar crește cu cele 3 conturi', cuAi3.monthly === cuAi.monthly + 30, cuAi.monthly + ' → ' + cuAi3.monthly);
// „Nelimitat" (0 întrebări pe cont) se vede ca atare, nu ca „0 întrebări".
const cuAiNel = calculator(flota({ 'of-aiA': true, 'of-aiqN': 0 }))._ofCalc();
T('„nelimitat" scrie nelimitat', /nelimitate/.test(linie(cuAiNel, 'RA Insight').extra || ''), linie(cuAiNel, 'RA Insight').extra);
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

sect('3c-bis. RA Insight pe hârtia clientului');
T('scrie pe câte CONTURI se dă', /RA Insight pe ' \+ nLocP/.test(PD), 'lipsește numărul de conturi');
T('și cât e fondul comun de întrebări', /dintr-un fond comun al firmei/.test(PD));
T('prețul peste fond e scris pe hârtie (altfel nu-l putem factura)',
  /se facturează separat, la/.test(PD) && /aiqP/.test(PD));
T('și scrie că se pot da/retrage conturi oricând', /se pot da sau retrage oricând/.test(PD));
T('nota apare DOAR dacă există fond și preț', /r\.cfg\.aiA && fondP > 0 && Number\(r\.cfg\.aiqP\) > 0/.test(PD));

sect('3d. Hârtia se ține pe o pagină');
T('răspunsul („cum se plătește") vine ÎNAINTEA tabelelor',
  PD.indexOf('Cum se plătește') < PD.indexOf('Detaliere abonament lunar'), 'ordinea secțiunilor');
T('costurile unice sunt sub un singur titlu', /<h2>Detaliere costuri unice<\/h2>/.test(PD));
T('fiecare bucată care se citește împreună e marcată', (PD.match(/impreuna/g) || []).length >= 6,
  String((PD.match(/impreuna/g) || []).length));
T('marcajul chiar oprește ruperea între pagini', /\.impreuna\{page-break-inside:avoid;break-inside:avoid;\}/.test(PD));
T('un titlu nu rămâne singur la baza paginii', /h2\{page-break-after:avoid;break-after:avoid;\}/.test(PD));
T('regulile de pagină NU stau doar în @media print (le sare pdf-ul din browser)',
  PD.indexOf('.impreuna{page-break-inside') < PD.indexOf('@media print'));
T('nu se mai repetă „Anual / Contract N luni" (e deja în caseta de plată)', !/Anual: ' \+ r\.annual/.test(PD));

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
T('totalul lunar din PDF are și euro', /Total lunar: ' \+ dubluLei\(r\.monthly\)/.test(pdf));
T('și fiecare sumă de pe hârtie trece prin dubluLei (lei + euro)',
  /var dubluLei = function \(v\) \{ return v\.toFixed\(2\) \+ ' lei[\s\S]{0,90}_fxRate/.test(pdf));
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

sect('6b. Ce s-a vândut se și activează pe firmă');
// Gaura: un client deschis DIN OFERTĂ primea contractul cu prețul corect, dar în fișa firmei nu se
// scria nimic — fără cotă înseamnă NELIMITAT. Vindeai 50 de întrebări/lună și livrai nelimitat.
T('există o singură funcție care duce oferta pe firmă', /async function _aplicaOfertaPeFirma\(companyId, oferta\)/.test(server));
T('contractul făcut din ofertă o cheamă', /_aplicaOfertaPeFirma\(id, oferta\)/.test(server));
T('și butonul „Aplică" din lista de oferte folosește ACEEAȘI funcție',
  /_aplicaOfertaPeFirma\(companyId, offer\)/.test(server));
T('nu mai există o a doua listă paralelă de setări',
  (server.match(/questionsPerSeat: n, seatPriceRON: seatPrice/g) || []).length === 1,
  String((server.match(/questionsPerSeat: n, seatPriceRON: seatPrice/g) || []).length));
T('cota vândută ajunge pe firmă, ca întrebări PE CONT', /patch\.ai_quota = n > 0/.test(server) && /questionsPerSeat: n/.test(server));
T('și prețul unui cont merge cu ea', /seatPriceRON: seatPrice/.test(server));
T('„nelimitat" în ofertă (0) rămâne fără plafon', /patch\.ai_quota = n > 0[\s\S]{0,160}: null;/.test(server));
T('prețul peste cotă negociat în ofertă merge și el', /overagePriceEur: priceEur/.test(server));
T('RA Insight se aprinde odată cu cota', /patch\.features = \{ ai_assistant: true \}/.test(server));
// Dar modulele demonstrative NU se aprind singure — decizie veche, rămâne.
T('Tahograful și e-Transportul NU se aprind singure',
  !/features\.tahograf = true/.test(server) && !/features\.etransport = true/.test(server));
T('dar nu se trec sub tăcere: rămân pe o listă de pornit manual', /deAprinsManual\.push\('tahograf'\)/.test(server));
T('și primim o notificare cu firma și modulul', /type: 'module_de_pornit'/.test(server));

sect('6c. Pe server: fondul lunii vine din LOCURI');
T('fondul = locuri × întrebări pe loc',
  /const fond = q\.questionsPerSeat > 0 \? seats \* q\.questionsPerSeat : q\.questions;/.test(server));
T('locurile se numără din conturile aprinse', /await db\.getAiSeats\(companyId\)/.test(server));
T('doar conturile ACTIVE țin loc (unul dezactivat nu se facturează)',
  /ai_seat = true AND active IS NOT false/.test(fs.readFileSync('./db.js', 'utf8')));
T('RA Insight se deschide doar cui are loc', /function requireAiSeat\(req, res, next\)/.test(server));
T('poarta e pusă pe amândouă căile de AI',
  (server.match(/requireFeature\('ai_assistant'\), requireAiSeat/g) || []).length === 2,
  String((server.match(/requireFeature\('ai_assistant'\), requireAiSeat/g) || []).length));
T('mesajul spune cine poate porni contul', /Administratorul firmei îl poate porni din Utilizatori/.test(server));
T('super-adminul nu e îngrădit', /if \(req\.isSuper \|\| req\.companyId == null\) return next\(\);[\s\S]{0,120}getUserById/.test(server));
T('bara omului primește și consumul LUI', /aiQuotaState\(a\.companyId, a\.userId\)/.test(server));
T('consumul se scrie pe om la toate felurile de întrebări',
  (server.match(/recordAiUsage\(req\.companyId, '(insight|chat|report)', [^)]*req\.auth && req\.auth\.userId\)/g) || []).length === 3,
  String((server.match(/recordAiUsage\(req\.companyId, '(insight|chat|report)', [^)]*req\.auth && req\.auth\.userId\)/g) || []).length));
// Factura
T('factura are rândul de conturi', /RA Insight — conturi \(/.test(server));
T('și rândul de depășire, separat', /RA Insight — întrebări peste cota lunii/.test(server));
T('depășirea se facturează DOAR dacă firma avea voie să depășească',
  /overageCount: \(st\.overage \? \(st\.overageCount \|\| 0\) : 0\)/.test(server));
T('prețul depășirii se trece în lei, la cursul zilei', /overagePriceRON: Math\.round\(\(st\.overagePriceEur/.test(server));
T('forma veche („Asistent AI", sumă fixă) rămâne pentru clienții vechi',
  /add\('Asistent AI', 1, bd\.aiAssistant\);   \/\/ forma veche/.test(server));

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
