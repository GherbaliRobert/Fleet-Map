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
// `_fxDate` / `_fxSursa` stau, ca `_fxRate`, în afara blocului decupat: oferta îngheață nu doar
// CIFRA cursului, ci și ziua și sursa lui (22.09). Fără ele aici, decupajul cade cu
// „_fxDate is not defined" — semn că blocul a început să citească o variabilă nouă din pagină.
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate', '_fxDate', '_fxSursa', '_rDe', '_aiqFond',
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
  return CALC(doc, {}, () => {}, 5.0, '21.09.2026', 'BNR', _rDe, M._aiqFond);
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
// ── Hârtia clientului s-a mutat pe SERVER (21.09): se descarcă un fișier, nu se mai deschide o
// fereastră de printare. Cerințele de CONȚINUT au rămas aceleași — doar locul s-a schimbat, deci
// probele se uită acum în `report_export.js`. Ce NU mai are sens sunt regulile CSS de rupere între
// pagini (`page-break-inside`): în PDF paginile le face `spatiu()`, care mută blocul întreg pe
// pagina următoare dacă nu încape. Acolo se uită proba acum.
const PD = (function () {
  const rex = fs.readFileSync('./report_export.js', 'utf8');
  const a = rex.indexOf('// ─── începe „oferta, ca fișier descărcat"');
  const b = rex.indexOf('// ─── sfârșit „oferta, ca fișier descărcat"');
  if (a < 0 || b < 0) throw new Error('nu găsesc blocul hârtiei în report_export.js');
  return rex.slice(a, b);
})();
// Hârtia a fost REGÂNDITă pe 21.09, după ce Alin s-a uitat la ea: „«La semnarea contractului o
// singură dată» și «apoi în fiecare lună» nu sună deloc profesional. Trebuie împărțită cât mai
// simplu: cât îl costă pe lună și cât îl costă o dată." Deci: două cifre mari sus, detalierea la
// mijloc, explicațiile („ce include", „condiții") la FINAL, ca note. Cerințele de CONȚINUT au
// rămas toate — doar locul și cuvintele s-au schimbat.
T('hârtia începe cu RĂSPUNSUL: cât pe lună, cât o singură dată',
  /'Cost lunar'/.test(PD) && /'Cost unic, o singură dată'/.test(PD));
T('și spune cât face pe toată durata contractului', /Total pe durata contractului/.test(PD));
T('condițiile de plată sunt scrise, la final', /CONDIȚII/.test(PD)
  && /Echipamentele se facturează la livrare/.test(PD)
  && /se facturează în fiecare lună, pe toată durata contractului/.test(PD));
T('scrie că echipamentele rămân ale clientului', /rămân în proprietatea Beneficiarului după achitarea lor/.test(PD));
T('și înșiră ce include abonamentul, pe fiecare mașină', /CE INCLUDE ABONAMENTUL LUNAR, PENTRU FIECARE VEHICUL/.test(PD));
T('lista de incluse pornește de la monitorizarea GPS', /Monitorizare GPS în timp real/.test(PD));
// Fiecare rând e o propoziție de sine stătătoare, cu MAJUSCULĂ la început — e o ofertă comercială
// trimisă unui client, nu o listă de bifat (Alin, 22.09). Se verifică DOAR textele care ÎNCEP un
// rând (primul din listă + primul argument al fiecărui `L.push`), nu bucățile lipite după ele.
const _inc = (PD.match(/function _ofIncluse\(o\) \{[\s\S]*?\n\}/) || [''])[0];
const _incStart = [(_inc.match(/const L = \['([^']+)'/) || [, ''])[1]]
  .concat([...(_inc.matchAll(/L\.push\('([^']{6,})'/g))].map((m) => m[1]))
  .filter(Boolean);
T('fiecare rând din „ce include" începe cu majusculă',
  _incStart.length >= 7 && _incStart.every((s) => /^[A-ZĂÂÎȘȚ]/.test(s)),
  _incStart.filter((s) => !/^[A-ZĂÂÎȘȚ]/.test(s)).join(' · ') || (_incStart.length + ' rânduri'));
T('și pomenește modulele doar dacă sunt bifate',
  /if \(o\.tahograf\) L\.push/.test(PD) && /if \(o\.etransport\) L\.push/.test(PD));
T('blocurile nu se rup între pagini (în PDF o face `spatiu`)',
  /const spatiu = \(h\) => \{ if \(y \+ h > bottom\) \{ doc\.addPage\(\)/.test(PD));
T('și fiecare bucată care se citește împreună cere loc ÎNAINTE să se deseneze',
  (PD.match(/spatiu\(/g) || []).length >= 6, String((PD.match(/spatiu\(/g) || []).length));

// „20 de vehicule", dar „12 luni"
const DE = new Function(html.slice(html.indexOf('function _rDe(n)'), html.indexOf('// Aceleași sume, dar pentru celule de tabel:')) + '\n; return _rDe;')();
T('„20 de vehicule"', DE(20) === 'de ');
T('„12 luni", fără „de"', DE(12) === '');
T('„100 de vehicule"', DE(100) === 'de ');
T('„101 vehicule", fără „de"', DE(101) === '');
T('„1 vehicul"', DE(1) === '');
T('zero nu devine „0 de vehicule"', DE(0) === '');

sect('3c-bis. RA Insight pe hârtia clientului');
T('scrie pe câte CONTURI se dă', /'RA Insight, pe ' \+ n \+ ' ' \+ \(n === 1 \? 'cont' : 'conturi'\)/.test(PD), 'lipsește numărul de conturi');
T('și cât e fondul comun de întrebări', /dintr-un fond comun al companiei/.test(PD));
T('scrie prețul unui cont, ca regula să fie pe hârtie', /Prețul unui cont de RA Insight este /.test(PD));
T('și că numărul de conturi se schimbă din aplicație', /Numărul de conturi se modifică oricând din aplicație/.test(PD));
T('și că la epuizare se oprește, fără costuri suplimentare', /nu există costuri suplimentare/.test(PD));
T('nota apare DOAR dacă s-a vândut RA Insight', /if \(o\.aiA && Number\(o\.pretCont\) > 0\)/.test(PD));

sect('3d. Hârtia se ține pe o pagină');
T('răspunsul (cele două cifre) vine ÎNAINTEA tabelelor',
  PD.indexOf("'Cost lunar'") < PD.indexOf("tabel('Abonament lunar'"), 'ordinea secțiunilor');
T('iar explicațiile vin DUPĂ ele, la final',
  PD.indexOf("tabel('Abonament lunar'") < PD.indexOf('CE INCLUDE ABONAMENTUL')
  && PD.indexOf('CE INCLUDE ABONAMENTUL') < PD.indexOf("'CONDIȚII'"), 'ordinea explicațiilor');
T('costurile unice au titlurile lor, separat',
  /tabel\('Echipamente — o singură dată'/.test(PD)
  && /tabel\('Instalare și punere în funcțiune — o singură dată'/.test(PD));
T('și un tabel gol nu se desenează deloc', /if \(!randuri\.length\) return;/.test(PD));
T('nu se mai repetă „Anual / Contract N luni" (e deja în casete)', !/Anual \(×12\)/.test(PD));

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
// Pe hârtia clientului: coloană de euro la fiecare tabel + cursul scris jos. Hârtia se face din
// 21.09 pe server, deci `pdf` e chiar blocul de acolo (`PD`, decupat mai sus).
const pdf = PD;
// Alin, 21.09: „de ce la ultimele e în euro trecut prețul și la unele în lei? Nu e profesional."
// Abonamentul și montajul erau în lei cu o coloană „≈ EUR", iar aparatele invers. Acum, în TOATE
// tabelele: lei sus, euro dedesubt. `moneda` spune doar în ce vin cifrele, nu cum se afișează.
// Se caută în COD, nu în comentarii: explicația de deasupra pomenește firesc vechile coloane.
const _faraCom = (x) => x.replace(/^\s*\/\/.*$/gm, '');
T('nu mai există două convenții pe aceeași hârtie',
  !/≈ EUR/.test(_faraCom(pdf)) && !/≈ RON/.test(_faraCom(pdf)));
T('în fiecare tabel, prețul unitar are și lei și euro',
  /_bani\(uLei, 'lei'\)/.test(pdf) && /_bani\(lei2eur\(uLei\), '€'\)/.test(pdf));
T('și totalul, la fel', /_bani\(tLei, 'lei'\)/.test(pdf) && /_bani\(lei2eur\(tLei\), '€'\)/.test(pdf));
T('aparatele se întorc în lei, ca restul', /moneda === 'EUR' \? eur2lei\(r\.unit\) : r\.unit/.test(pdf));
T('și cele două cifre mari au amb ele monede', /_bani\(lei, 'lei'\)/.test(pdf) && /_bani\(lei2eur\(lei\), '€'\)/.test(pdf));
// „2250.00 lei" și „1 € = 5.0000 lei" se citesc GREȘIT în română: punctul e separator de MII.
T('sumele se scriu românește (2.250,00 lei, nu 2250.00)',
  /function _bani\(n, moneda, zec\)/.test(pdf) && /toLocaleString\('ro-RO'/.test(pdf));
T('și nicio sumă nu mai scapă prin `toFixed`', !/toFixed\(2\) \+ ' lei'/.test(pdf) && !/toFixed\(2\) \+ ' €'/.test(pdf));
T('cursul se scrie cu 4 zecimale, românește', /_bani\(fx, 'lei', 4\)/.test(pdf));
T('și se spune DIN CE ZI e cursul, dacă îl știm', /o\.fxDate \? ' din ' \+ o\.fxDate : ''/.test(pdf));
T('PDF-ul spune cursul folosit și că se facturează în lei', /Facturarea se face în lei/.test(pdf));
// Alin, 21.09: „costul unic nu-l facturăm la semnarea contractului, ci după ce vin echipamentele
// și după ce le instalăm". Aceeași formulare ca în anexa contractului, ca actele să nu se bat cap în cap.
T('costul unic se facturează la LIVRARE și la punerea în funcțiune, nu la semnare',
  /Echipamentele se facturează la livrare, iar instalarea după punerea în funcțiune/.test(pdf)
  && !/se facturează integral la semnarea contractului/.test(pdf));
T('și spune că nu intră în abonament', /nu face parte din abonamentul lunar/.test(pdf));
// „Cursul BNR" se scrie DOAR dacă de la BNR vine. Altfel am pune numele BNR pe o cifră de rezervă.
T('numele BNR se pune doar pe un curs luat CHIAR de la BNR',
  /o\.fxSursa === 'BNR'[\s\S]{0,200}la cursul BNR/.test(pdf));
T('iar când nu e de la BNR, hârtia zice „curs de referință"',
  /la un curs de referință de 1 € = /.test(pdf));

sect('5. Un singur loc pentru tarifele de pornire');
T('există _OF_PRETURI_DEF', /var _OF_PRETURI_DEF = \{/.test(html));
// Din 21.09, „Ofertă nouă" nu mai ia direct cifrele din cod: trece prin `_ofTarifeDeBaza()`, care e
// `_OF_PRETURI_DEF` PLUS tarifele noastre salvate pe server. Lanțul rămâne unul singur — proba îl
// urmărește până la capăt, ca să nu apară pe drum o listă paralelă scrisă de mână.
T('„Ofertă nouă" folosește aceeași listă, nu una paralelă',
  /raxOfReset = function[\s\S]{0,200}_ofTarifeDeBaza\(\)/.test(html)
  && /function _ofTarifeDeBaza\(\)[\s\S]{0,160}_OF_PRETURI_DEF/.test(html)
  && !/raxOfReset = function[\s\S]{0,300}pAiA: 150/.test(html));
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
// Și e SINGURUL loc care o cheamă (de pe 22.09). Butonul ✨ din lista de oferte era al doilea: o
// aplica pe o firmă aleasă dintr-o listă, pe un ecran unde clientul de obicei nici nu există încă.
// A plecat cu tot cu ruta lui — ce s-a vândut se aprinde la SEMNARE, nu dintr-un buton.
T('și e singurul loc care o cheamă — nu mai există un al doilea buton',
  (server.match(/_aplicaOfertaPeFirma\(/g) || []).length === 2
  && !/apply-to-company/.test(server.replace(/^\s*\/\/.*$/gm, '')),
  String((server.match(/_aplicaOfertaPeFirma\(/g) || []).length) + ' apeluri');
T('nu mai există o a doua listă paralelă de setări',
  (server.match(/questionsPerSeat: n, seatPriceRON: seatPrice/g) || []).length === 1,
  String((server.match(/questionsPerSeat: n, seatPriceRON: seatPrice/g) || []).length));
T('cota vândută ajunge pe firmă, ca întrebări PE CONT', /patch\.ai_quota = n > 0/.test(server) && /questionsPerSeat: n/.test(server));
T('și prețul unui cont merge cu ea', /seatPriceRON: seatPrice/.test(server));
T('„nelimitat" în ofertă (0) rămâne fără plafon', /patch\.ai_quota = n > 0[\s\S]{0,160}: null;/.test(server));
T('prețul unui cont negociat în ofertă merge și el', /seatPriceRON: seatPrice/.test(server));
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
T('forma veche („Asistent AI", sumă fixă) rămâne pentru clienții vechi',
  /add\('Asistent AI', 1, bd\.aiAssistant\);   \/\/ forma veche/.test(server));

sect('6d. NU există cost suplimentar — la epuizare se oprește');
// Hotărât cu Alin (14.09). Motivul, scris ca să nu se răzgândească nimeni din greșeală: cu cost
// suplimentar aveam de socotit pe fiecare firmă câte întrebări au trecut peste fond, la ce preț,
// cine a acceptat și în ce lună. Patru lucruri de calculat, patru de explicat, patru de greșit.
// Singurul loc unde mai apar numele vechi e linia care le ȘTERGE din baza de date.
const _fara = server.replace(/\['overage', 'overagePriceEur', 'extraAcceptedMonth'\][^\n]*\n/, '');
T('nu mai există preț pe întrebare nicăieri pe server',
  !/overagePriceEur|AI_OVERAGE_PRICE_EUR/.test(_fara));
T('nici mecanismul de acord', !/_cereAcordCostExtra|_acceptaCostExtra|extraAcceptedMonth/.test(_fara));
T('nici pe ecran', !/overage|needsExtraConsent|acceptExtra/.test(html));
T('câmpurile vechi se aruncă din baza de date la prima salvare',
  /\['overage', 'overagePriceEur', 'extraAcceptedMonth'\]\.forEach\(function \(k\) \{ delete q\[k\]; \}\);/.test(server));
T('fondul epuizat = blocat', /blocked: used >= fond,/.test(server));
T('și se explică, nu se dă doar o eroare', /async function _fondEpuizat\(req\)/.test(server));
T('spune câte întrebări erau incluse', /Firma a folosit toate cele/.test(server));
T('spune când se reînnoiește', /Se reînnoiește pe/.test(server));
T('spune ce rămâne gratuit', /Întrebările rapide rămân gratuite/.test(server));
T('propune un CONT în plus', /Un cont în plus aduce încă/.test(server));
T('și NU pomenește niciun preț',
  !/lei/.test((server.match(/async function _fondEpuizat[\s\S]*?\n\}/) || [''])[0]));
// Poarta e una singură și e folosită de toate căile de AI (scrisă la paritatea telefonului).
T('poarta fondului e chemată din toate căile de AI',
  /async function _regulileFonduluiAi\(req, res\)/.test(server) &&
  (server.match(/if \(await _regulileFonduluiAi\(req, res\)\) return;/g) || []).length >= 3,
  String((server.match(/if \(await _regulileFonduluiAi\(req, res\)\) return;/g) || []).length));
T('dacă fondul nu se poate citi, întrebarea NU pleacă', /Nu am putut verifica fondul de întrebări/.test(server));
// Pe ecran, bara nu mai spune „la epuizare se oprește" sec, ci ce poate face omul
T('bara propune contul în plus', /Un cont în plus aduce încă ' \+ window\._raxNrI\(q\.questionsPerSeat \|\| 50\)/.test(html));
T('oferta acceptată nu mai scrie niciun preț pe întrebare',
  /patch\.ai_quota = n > 0 \? \{ questionsPerSeat: n, seatPriceRON: seatPrice \} : null;/.test(server));
T('factura are UN singur rând de RA Insight', /RA Insight — conturi \(/.test(server) &&
  !/RA Insight — întrebări peste cota lunii/.test(server));

sect('6d-bis. Factura ia CÂTE CONTURI a avut cel mult luna asta');
T('vârful lunii se ține minte', /async function _urcaSeatsPeak\(companyId, seats\)/.test(server));
T('urcă la ORICE schimbare de conturi, nu doar la aprindere',
  /await _urcaSeatsPeak\(tinta\.company_id, Math\.max\(seatsInainte, seats\)\)/.test(server));
T('la stingere se plătește numărul de DINAINTE (altfel ultimele zile ar fi gratis)',
  /const seatsInainte = await db\.getAiSeats\(tinta\.company_id\);/.test(server));
T('se resetează la lună nouă', /p2\.luna === _lunaAcum\(\)/.test(server));
T('factura ia maximul dintre vârf și câte sunt acum',
  /seats: Math\.max\(st\.seats \|\| 0, _seatsPeakLuna\(company\)\)/.test(server));
T('și spune pe factură când numărul e mai mare decât cel de azi',
  /cel mult active în luna aceasta/.test(server));
T('vârful se scrie doar de aplicație, cu formatul verificat',
  /q\.seatsPeak = \{ luna: String\(vf\.luna\), n: Math\.max\(0, Math\.round\(Number\(vf\.n\)\)\) \};/.test(server));

sect('6d-ter. Aflăm și noi când un client mai aprinde un cont');
T('se creează o notificare la aprindere', /type: 'ai_seat_on', severity: 'info'/.test(server));
T('ajunge DOAR la noi (fără companie)', /type: 'ai_seat_on'[\s\S]{0,80}companyId: null/.test(server));
T('spune firma, omul și câte conturi are acum',
  /a activat încă un cont/.test(server) && /Firma are acum ' \+ seats/.test(server));
T('spune și cât face pe factură', /factura lunii: ' \+ \(seats \* pret\)/.test(server));
T('spune că accesul e deja activ și cum se retrage', /Accesul e deja activ/.test(server));
T('doar la APRINDERE, nu și la stingere', /if \(on\) \{[\s\S]{0,900}ai_seat_on/.test(server));
T('din notificare se ajunge în fișa firmei',
  /d\.type === 'ai_seat_on'[\s\S]{0,300}raxOpenCompanyDetail/.test(html));
T('pe fila de abonament', /raxOpenCompanyDetail\(' \+ Number\(d\.data\.company_id\) \+ ', \\'abonament\\'\)/.test(html));

sect('6d-quater. Regula, scrisă în contract și în ofertă');
const cpdf = fs.readFileSync('./contract_pdf.js', 'utf8');
T('contractul spune prețul unui cont', /Prețul unui cont de RA Insight este de/.test(cpdf));
T('și că numărul se schimbă din aplicație', /Numărul de conturi se modifică oricând de către Beneficiar/.test(cpdf));
T('și că factura urmează conturile active', /factura urmează numărul de conturi active în luna respectivă/.test(cpdf));
T('și că la epuizare se oprește, fără costuri suplimentare', /fără costuri suplimentare/.test(cpdf));
T('clauza apare doar dacă s-a vândut RA Insight', /if \(Number\(anexa\.aiSeatPriceRON\) > 0\)/.test(cpdf));
const ctr = fs.readFileSync('./contracts.js', 'utf8');
T('prețul contului se îngheață în anexă', /out\.aiSeatPriceRON = Math\.round/.test(ctr));
T('împreună cu câte întrebări aduce', /out\.aiQuestionsPerSeat = /.test(ctr));
T('și vine din ofertă', /aiSeatPriceRON: _cfgOf\.aiA \?/.test(server));
// Regula stă pe hârtia clientului, care din 21.09 se face pe server.
T('aceeași regulă e scrisă și pe ofertă', /Prețul unui cont de RA Insight este /.test(PD) &&
  /nu există costuri suplimentare/.test(PD));

sect('6e. Ofertare Live — câmpuri, bife și butoane');
const css2 = fs.readFileSync('./public/css/app.css', 'utf8');
// Stilul s-a mutat din `#admin-tab-ofertare` în clasa comună `ra-camp`: aceeași rețetă, dar acum e
// una singură pentru toată Administrarea (vezi verify_campuri.js). Ofertare o poartă și el.
T('câmpurile ecranului au stilul casei', /\.ra-camp \.rax-field\{/.test(css2)
  && /<div id="admin-tab-ofertare" class="[^"]*\bra-camp\b/.test(html));
T('cifrele se citesc pe coloană (aliniate la dreapta)', /input\[type=number\]\.rax-field\{ text-align:right/.test(css2));
T('fără săgeți de „number" (nu se schimbă valoarea din rotița mouse-ului)',
  /-webkit-appearance:none; margin:0;/.test(css2) && /-moz-appearance:textfield/.test(css2));
T('câmpul activ se vede', /\.ra-camp \.rax-field:focus\{/.test(css2));
T('bifele sunt verzi când sunt pornite', /\.ra-camp input\[type=checkbox\]:checked\{ background:var\(--accent\)/.test(css2));
T('butoanele au ierarhie: unul plin, restul cu contur', /\.raof-act \.rax-btn:not\(\.primary\)\{ background:transparent/.test(css2));
T('caseta cotei se desface pe toată lățimea', /aq\.style\.display = r\.cfg\.aiA \? 'block' : 'none'/.test(html));

sect('6f. Ofertare Live — limbajul vizual e într-un singur loc');
const css = fs.readFileSync('./public/css/app.css', 'utf8');
T('există blocul .raof în foaia de stil', /\.raof-card\{/.test(css) && /\.raof-rez\{/.test(css));
T('ecranul are un antet care spune ce e', /raof-head/.test(html) && /Calculatorul din care iese oferta/.test(html));
T('și pașii, ca să știi pe unde merge oferta', /raof-pasi/.test(html) && /Deschizi clientul din ea/.test(html));
T('cărțile sunt numerotate', /1\. Clientul/.test(html) && /2\. Flota clientului/.test(html) &&
  /3\. Ce mai primește clientul/.test(html) && /4\. Montajul/.test(html) && /5\. Aparatele/.test(html));
T('fiecare carte are o propoziție care o explică', /function card\(title, inner, desc\)/.test(html) && /raof-d/.test(html));
T('rândurile nu mai au stiluri scrise pe fiecare element', /function row\(label, inner, hint\) \{ return '<div class="raof-r">/.test(html));
T('caseta cotei e o grilă, nu un rând care se rupe', /raof-q3/.test(html) && /\.raof-q3\{ display:grid/.test(css));

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
