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
  decupez('Tarife după mărimea flotei') + '\n; return { _aiqFond, _modVeh, MOD_TARIF, _ofHintModul };')(
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
  decupez('Calculatorul de ofertă') + '\n; return { _ofCalc: _ofCalc, _ofReadCfg: _ofReadCfg, _raxOf: _raxOf, _OF_PRETURI_DEF: _OF_PRETURI_DEF };');
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
    'of-aiPachet': 'start', 'of-pPachet': '', 'of-aiAg': false, 'of-tahograf': false, 'of-etransport': false, 'of-agenti': true,
    'of-ret': '6', 'of-retcustom-m': 0, 'of-contract': 12, 'of-notes': '',
    'of-qGps': 0, 'of-qLvCan': 0, 'of-qCanInc': 0, 'of-qFms': 0, 'of-qUninstall': 0, 'of-qReplace': 0, 'of-kmTravel': 0,
    'of-dq130': 0, 'of-dq150': 0, 'of-dq650': 0, 'of-dqLvCan': 0
  }, peste || {});
}
const linie = (r, cuvant) => r.lines.filter(l => l.label.indexOf(cuvant) >= 0)[0];

sect('1. Pachetele RA Insight în ofertă — prețul de listă și „ce rămâne la noi"');
// Din 14.10 RA Insight se vinde în PACHETE fixe pe FIRMĂ (Alin: Start inclus · Basic 10 · Pro 20 · Business 30 de lei), nu pe
// cont după mărimea flotei. Grila veche (cinci trepte pe cont + „cât ne costă o întrebare" măsurat pe Haiku 4.5) a ieșit din
// ofertă. Regula stă în pachete.js; pagina o primește prin meta-ul serverului — ACEEAȘI funcție (`_ofMetaPachete`) pe care o
// dă și socotelii de pe telefon. Proba ia funcția din server.js, ca pagina și serverul să nu se poată despărți.
const pachete = require('./pachete');
const _metaA = server.indexOf('function _ofMetaPachete()');
const META = new Function('pachete', server.slice(_metaA, server.indexOf('\n}\n', _metaA) + 3) + '; return _ofMetaPachete();')(pachete);
const _elPk = { 'of-aiPachet': { value: 'pro' }, 'of-pPachet-wrap': { style: {} }, 'of-mod-hint-aiA': { innerHTML: '' } };
const _winPk = {}, _atinsePk = {}, _propusePk = [];
let _preturiPk = { pkBasic: 10, pkPro: 20, pkBusiness: 30 };
const PK = new Function('document', 'window', '_ofMeta', '_ofAtinse', '_ofPropune', '_ofReadPrices', 'raxOfRecalc', 'esc',
  decupez('pachetele RA Insight în ofertă') + '\n; return { _OF_PK_CHEI, _ofPachetMeta, _ofPachetMarja, _ofPropunePachet, _ofHintPachet };')(
  { getElementById: (id) => _elPk[id] || null }, _winPk, META, _atinsePk, (id, v) => _propusePk.push([id, v]), () => _preturiPk, () => {}, (x) => String(x));
const DEF = calculator(flota())._OF_PRETURI_DEF;
const PLATITE = pachete.PACHETE.filter((p) => p.ai);

T('cheile prețurilor din ofertă (pkBasic / pkPro / pkBusiness) sunt cele din pachete.js',
  JSON.stringify(PK._OF_PK_CHEI) === JSON.stringify(pachete.CHEI_PRET), JSON.stringify(PK._OF_PK_CHEI));
T('prețurile de pornire din ofertă = prețurile pachetelor din pachete.js (10 / 20 / 30)',
  PLATITE.every((p) => DEF[pachete.CHEI_PRET[p.cod]] === p.pret),
  PLATITE.map((p) => p.cod + ' ' + DEF[pachete.CHEI_PRET[p.cod]] + ' vs ' + p.pret).join(', '));
T('meta-ul are toate cele patru pachete, cu descrierea din pachete.js',
  META.pachete.map((p) => p.cod).join(',') === 'start,basic,pro,business'
  && META.pachete.every((m) => m.descriere === pachete.descriere(pachete.dupaCod(m.cod))), META.pachete.map((p) => p.descriere).join(' | '));
T('și costul unei întrebări + plasa, tot de acolo',
  META.pachetCost.intrebareLei === pachete.COST_INTREBARE_LEI && META.pachetCost.plasa === pachete.PLASA, JSON.stringify(META.pachetCost));
// „Ce rămâne la noi": aceeași socoteală în pagină și în pachete.js, pe orice preț negociat.
PLATITE.forEach((p) => {
  [p.pret, 7.5, 15, 25, 50].forEach((pret) => {
    T('ce rămâne la noi, ' + p.nume + ' la ' + pret + ' lei: pagina = pachete.marja',
      JSON.stringify(PK._ofPachetMarja(p.cod, pret)) === JSON.stringify(pachete.marja(p.cod, pret)),
      JSON.stringify(PK._ofPachetMarja(p.cod, pret)) + ' vs ' + JSON.stringify(pachete.marja(p.cod, pret)));
  });
});
T('Start nu are socoteală de marjă (n-are AI, nu ne costă nimic)', PK._ofPachetMarja('start', 0) === null);
// Cifrele pe care le-a văzut Alin în macheta din 14.10 (Haiku 5.5, întrebarea obișnuită la capătul prudent, tot bugetul de
// analiză aprofundată cheltuit): dacă se mută prețul sau costul, proba o spune.
T('la prețul de listă rămân ~9,02 / 12,06 / 17,10 lei pe lună (Basic / Pro / Business)',
  ['basic', 'pro', 'business'].map((c) => pachete.marja(c).obisnuit).join(' / ') === '9.02 / 12.06 / 17.1',
  ['basic', 'pro', 'business'].map((c) => pachete.marja(c).obisnuit).join(' / '));
T('iar în cel mai rău caz (plasa de 80%) rămân 20% din preț',
  PLATITE.every((p) => pachete.marja(p.cod, 40).minim === 8), PLATITE.map((p) => pachete.marja(p.cod, 40).minim).join(', '));
// Alegerea pachetului propune prețul din lista casei, prin `_ofPropune` (care nu calcă ce a scris omul).
_elPk['of-aiPachet'].value = 'pro'; _preturiPk = { pkBasic: 12, pkPro: 22, pkBusiness: 33 };
PK._ofPropunePachet();
T('Pro ales → se propune prețul de listă al lui Pro (din lista casei, nu din cod)',
  JSON.stringify(_propusePk[_propusePk.length - 1]) === JSON.stringify(['of-pPachet', 22]), JSON.stringify(_propusePk));
T('și caseta prețului se arată', _elPk['of-pPachet-wrap'].style.display === 'inline-flex', _elPk['of-pPachet-wrap'].style.display);
const _nPropuse = _propusePk.length;
_elPk['of-aiPachet'].value = 'start'; PK._ofPropunePachet();
T('Start ales → nicio propunere de preț, caseta se ascunde',
  _propusePk.length === _nPropuse && _elPk['of-pPachet-wrap'].style.display === 'none', _elPk['of-pPachet-wrap'].style.display);
_atinsePk['of-pPachet'] = true; _elPk['of-aiPachet'].value = 'business';
_winPk.raxOfPachet();
T('alt pachet ales → prețul scris de mână se uită și se propune cel al pachetului nou',
  _atinsePk['of-pPachet'] === false && JSON.stringify(_propusePk[_propusePk.length - 1]) === JSON.stringify(['of-pPachet', 33]), JSON.stringify(_propusePk));
PK._ofHintPachet({ cfg: { aiPachet: 'pro', aiPachetPret: 20 } });
T('sub alegere: ce primește clientul și, doar pentru noi, ce rămâne la noi',
  /până la 5 conturi · 600 de întrebări pe lună/.test(_elPk['of-mod-hint-aiA'].innerHTML) && /Ce rămâne la noi: ~/.test(_elPk['of-mod-hint-aiA'].innerHTML)
  && /12,06 lei/.test(_elPk['of-mod-hint-aiA'].innerHTML), _elPk['of-mod-hint-aiA'].innerHTML);
PK._ofHintPachet({ cfg: { aiPachet: 'start', aiPachetPret: 0 } });
T('la Start: „inclus în orice contract", fără marjă', /inclus în orice contract/.test(_elPk['of-mod-hint-aiA'].innerHTML) && !/Ce rămâne/.test(_elPk['of-mod-hint-aiA'].innerHTML),
  _elPk['of-mod-hint-aiA'].innerHTML);
T('ce rămâne la noi NU ajunge pe hârtia clientului', !/_ofPachetMarja|Ce rămâne la noi/.test(fs.readFileSync('./report_export.js', 'utf8')));
// Selectorul pornește pe Start (orice firmă pornește pe Start — Alin, 14.10).
T('selectorul de pachet pornește pe Start', /<option value="start" selected>Start — inclus<\/option>/.test(html));

sect('2. Lista casei: prețurile pachetelor se țin minte (și nu pot ieși 0)');
// Prețurile de listă se schimbă din „Prețurile noastre" (rândurile pkBasic / pkPro / pkBusiness) și se citesc peste tot cu
// pachete.preturiLista: oferta, pagina pachetelor din aplicație, fila „Acces" a firmei, pachetul pus de noi fără preț.
T('pachete.preturiLista: un preț salvat câștigă, restul rămân pe cod',
  JSON.stringify(pachete.preturiLista({ pkPro: 25 })) === JSON.stringify({ start: 0, basic: 10, pro: 25, business: 30 }),
  JSON.stringify(pachete.preturiLista({ pkPro: 25 })));
T('un preț golit, pus pe 0 sau pe text se întoarce la cod — NU dă un pachet pe gratis',
  JSON.stringify(pachete.preturiLista({ pkBasic: 0, pkPro: '', pkBusiness: 'abc' })) === JSON.stringify({ start: 0, basic: 10, pro: 20, business: 30 }),
  JSON.stringify(pachete.preturiLista({ pkBasic: 0, pkPro: '', pkBusiness: 'abc' })));
T('fără listă = prețurile din cod', JSON.stringify(pachete.preturiLista(null)) === JSON.stringify({ start: 0, basic: 10, pro: 20, business: 30 }));
T('pachetul pus fără preț ia prețul de listă de azi; unul negociat rămâne al lui',
  pachete.curataPachet({ cod: 'pro' }, { pro: 25 }).pretRON === 25 && pachete.curataPachet({ cod: 'pro', pretRON: 18 }, { pro: 25 }).pretRON === 18
  && pachete.curataPachet({ cod: 'pro' }).pretRON === 20);
// Patru locuri (pasul 6): pagina pachetelor, prețurile pe firmă (`_preturiPachetFirma`, pentru trecere), fila „Acces”, pachetul
// pus de noi fără preț — toate prin aceeași funcție.
T('serverul citește lista prin `_preturiPachete` în toate cele patru locuri (pagina pachetelor, prețurile firmei, fila „Acces”, pachetul pus de noi)',
  (server.match(/await _preturiPachete\(\)/g) || []).length === 4 && /async function _preturiPachetFirma\(co\) \{\s*const out = Object\.assign\(\{\}, await _preturiPachete\(\)\);/.test(server),
  String((server.match(/await _preturiPachete\(\)/g) || []).length));
const _tarifChei = (server.match(/const TARIF_CHEI = \[([\s\S]*?)\];/) || ['', ''])[1];
T('serverul ține minte prețurile pachetelor', ['pkBasic', 'pkPro', 'pkBusiness'].every((k) => _tarifChei.indexOf("'" + k + "'") >= 0), _tarifChei);
T('iar grila veche pe cont (aiqPana…) și rândul mort (pAiA) nu mai sunt în listă', !/aiqPana|aiqPeste|'pAiA'/.test(_tarifChei));
T('„Prețurile noastre" are rândurile pachetelor', /\['pkBasic', 'Basic — /.test(html) && /\['pkPro', 'Pro — /.test(html) && /\['pkBusiness', 'Business — /.test(html));
// Etichetele rândurilor spun ce primește pachetul: legate de pachete.js (câte întrebări), ca să nu rămână în urmă.
PLATITE.forEach((p) => {
  const et = (html.match(new RegExp("\\['" + pachete.CHEI_PRET[p.cod] + "', '([^']+)'")) || [, ''])[1];
  T('rândul „' + p.nume + '" din „Prețurile noastre" spune câte întrebări are (' + p.intrebari + ')',
    et.indexOf(p.nume + ' — ') === 0 && et.indexOf(Number(p.intrebari).toLocaleString('ro-RO') + ' de întrebări') > 0, et);
});
T('grila pe cont a plecat din pagină și de pe server (nu mai propune nimic pe tăcute)',
  !/AIQ_PRET_LOC|_aiqAplicaLista|_aiqPretLoc|_aiqCost|_ofHintAiq|raxOfAiqPreset/.test(html) && !/_aiqAplicaLista/.test(server));
// `pAiA` rămâne DOAR pentru ofertele vechi (pe cont), redeschise: se socotesc cum s-au vândut.
T('pAiA rămâne doar ca prețul ofertelor VECHI, pe cont', /^\s*pAiA: 14,\s+\/\/ DOAR pentru ofertele VECHI/m.test(html));

// Serverul NU rescrie toată lista la fiecare salvare: sunt două căi (tabloul și butonul din cărți), care trimit chei diferite.
const curat = new Function('TARIF_CHEI', server.slice(server.indexOf('function _tarifeCurate('),
  server.indexOf('\n}', server.indexOf('function _tarifeCurate(')) + 2) + '; return _tarifeCurate;')(
  eval((server.match(/const TARIF_CHEI = (\[[\s\S]*?\]);/) || [, '[]'])[1]));
const salvat = curat({ pkPro: 22, pPlain: 31 }, {});
const apoi = curat({ pPlain: 33, mGps: 120 }, salvat);
T('o salvare care nu trimite prețurile pachetelor NU le șterge', apoi.pkPro === 22, JSON.stringify(apoi.pkPro));
T('dar schimbă ce i s-a trimis', apoi.pPlain === 33 && apoi.mGps === 120, apoi.pPlain + ' / ' + apoi.mGps);
T('iar o cheie trimisă GOALĂ se întoarce la cod', curat({ pkPro: '' }, apoi).pkPro === null);
T('cheile vechi (pAiA, aiqPana10) cad la prima salvare', !('pAiA' in curat({}, { pAiA: 15, pPlain: 29 })) && !('aiqPana10' in curat({}, { aiqPana10: 22, pPlain: 29 })));

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

// RA Insight = UN rând pe FIRMĂ: pachetul ales, cu prețul lui (din lista casei, negociabil) — nu pe cont, nu pe mașină.
const cuAi = calculator(flota({ 'of-aiPachet': 'pro', 'of-pPachet': 20 }))._ofCalc();
const lPro = linie(cuAi, 'RA Insight');
T('pachetul ales e un rând de sine stătător, „RA Insight Pro"', !!lPro && lPro.label === 'RA Insight Pro', cuAi.lines.map(l => l.label).join(' | '));
T('cu prețul pachetului, o singură dată (cantitate 1, nu conturi)', lPro && lPro.qty === 1 && lPro.unit === 20 && lPro.total === 20, JSON.stringify(lPro));
T('rândul știe ce pachet e (contractul și firma îl citesc de aici)', lPro && lPro.fel === 'ai' && lPro.pachet === 'pro');
T('totalul lunar crește exact cu prețul pachetului', cuAi.monthly === fara.monthly + 20, fara.monthly + ' → ' + cuAi.monthly);
const negociat = calculator(flota({ 'of-aiPachet': 'pro', 'of-pPachet': 17.5 }))._ofCalc();
T('un preț negociat se păstrează (17,50 lei)', linie(negociat, 'RA Insight').total === 17.5, linie(negociat, 'RA Insight').total);
// ⚠ Plasa: prețul golit NU dă 0 lei (un pachet pe gratis) și nici NaN — cade pe prețul de listă al pachetului.
const golit = calculator(flota({ 'of-aiPachet': 'business', 'of-pPachet': '' }))._ofCalc();
T('prețul golit cade pe prețul de listă al pachetului (Business 30), nu pe 0 și nu pe NaN',
  linie(golit, 'RA Insight').total === 30 && Number.isFinite(golit.monthly), linie(golit, 'RA Insight').total + ' / ' + golit.monthly);
const cuStart = calculator(flota())._ofCalc();
const lStart = linie(cuStart, 'RA Insight');
T('Start apare pe ofertă cu 0 lei — clientul află că îl are, inclus',
  !!lStart && lStart.label === 'RA Insight Start — inclus' && lStart.total === 0 && lStart.inclus === true, JSON.stringify(lStart));
T('și nu schimbă totalul (20 × 45 = 900)', cuStart.monthly === 900, cuStart.monthly);
// O ofertă VECHE (pe cont), redeschisă din listă: se socotește cum s-a vândut, din ce s-a salvat (`_ofCalc(cfg, p)`).
const _cv = calculator(flota());
const cfgVechi = Object.assign(_cv._ofReadCfg(), { aiA: true, aiqSeats: 3, aiqN: 50 }); delete cfgVechi.aiPachet; delete cfgVechi.aiPachetPret;
const vechi = _cv._ofCalc(cfgVechi, Object.assign({}, _cv._OF_PRETURI_DEF, { pAiA: 15 }));
T('oferta veche pe cont: „RA Insight — 3 conturi", 3 × 15 = 45 lei, fondul de 150 de întrebări',
  linie(vechi, 'RA Insight') && /RA Insight — 3 conturi/.test(linie(vechi, 'RA Insight').label) && linie(vechi, 'RA Insight').total === 45
  && /150 de întrebări/.test(linie(vechi, 'RA Insight').extra || ''), JSON.stringify(linie(vechi, 'RA Insight')));
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
  && /Echipamentele se plătesc integral în avans, pe proformă/.test(PD)
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

// ── Lista bogată (23.09) — Alin: „oare să mai adăugăm chestii? reale bineîntelese. Să nu pară
// săracă oferta?" Lista a trecut de la 8 la 16 rânduri. Regula: fiecare rând trebuie să existe în
// aplicație ASTĂZI — e o promisiune într-un act semnat, nu un text de reclamă.
[
  ['Istoricul deplasărilor', 'ecranul Traseu + rapoartele Traseu/Staționări'],
  ['Rapoarte programate', 'report_schedules.js'],
  ['Zone pe hartă', 'geofence + raportul Vizite în zone'],
  ['Evidența actelor', 'Documente + Mentenanță + alerta document_expiry'],
  ['Conturi pentru oamenii firmei', 'rolurile + ACL pe vehicule/grupe'],
  ['Aplicație de telefon (Android)', 'mobile/ (Capacitor + Android)'],
].forEach(([t, de]) => T('scrie „' + t + '…" (' + de + ')', _inc.indexOf(t) > 0));

// Ce NU promitem, deliberat. Taxa de drum: modulul e scris, dar grila legală s-a mutat de trei ori
// și încă nu e în vigoare — pe o hârtie semnată n-are ce căuta ceva ce poate lipsi la semnare.
T('NU promite taxa de drum pe hârtia clientului', !/[Tt]ollRo|taxa de drum|Taxa de drum/.test(_inc));

// ⚠ Cifrele din listă NU se scriu de mână. Numărul de rapoarte se NUMARĂ din catalog: dacă mai
// adăugăm sau scoatem rapoarte, hârtia urmează singură, iar rotunjirea în JOS o ține cinstită.
T('numărul de rapoarte se numără din catalog, nu se scrie',
  /Object\.keys\(require\('\.\/reports\.js'\)\.REPORTS \|\| \{\}\)\.length/.test(PD));
T('și se rotunjește în JOS, ca „peste N" să rămână adevărat', /Math\.floor\(n \/ 10\) \* 10/.test(PD));
T('iar dacă catalogul nu se poate citi, rândul LIPSEȘTE (nu se inventează o cifră)',
  /catch \(e\) \{ return 0; \}/.test(PD) && /if \(nR\) L\.push/.test(PD));
const nRapCatalog = Object.keys(require('./reports.js').REPORTS || {}).length;
T('catalogul are cel puțin atâtea rapoarte cât scrie hârtia', nRapCatalog >= 30, nRapCatalog + ' rapoarte');

// Alertele NU se pot număra de pe server: `ALERT_TYPES` trăiește în pagină. Deci cifra e scrisă o
// dată, într-o constantă, ȘI LEGATĂ AICI de lista adevărată — dacă adăugăm un tip de alertă și
// uităm hârtia, proba pică.
const nAlerteEcran = ((html.match(/const ALERT_TYPES = \[([\s\S]*?)\n\s*\];/) || [, ''])[1]
  .match(/\{ v:'/g) || []).length;
const nAlerteHartie = parseInt((PD.match(/const N_ALERTE = (\d+);/) || [, '0'])[1], 10);
T('cifra alertelor de pe hârtie e ACEEAȘI cu lista din aplicație',
  nAlerteEcran >= 10 && nAlerteHartie === nAlerteEcran,
  nAlerteHartie + ' pe hârtie vs ' + nAlerteEcran + ' în aplicație');

// Rândurile se încadrează, nu se taie. Erau desenate cu `ellipsis: true` și un pas fix de 10pt:
// la prima propoziție mai lungă, clientul ar fi primit o promisiune retezată cu „…".
// Comentariile se scot: cel care explică DE CE am renunțat la tăiere pomenește chiar cuvintele
// tăierii (`ellipsis: true`). A treia oară când mă lovește asta — o probă se uită la COD, nu la note.
const _desen = PD.slice(PD.indexOf('const incluse = _ofIncluse(o)'), PD.indexOf("const conditii = ["))
  .replace(/^\s*\/\/.*$/gm, '');
T('rândurile listei se încadrează, nu se taie cu „…"',
  /heightOfString/.test(_desen) && !/ellipsis: true/.test(_desen) && !/lineBreak: false, ellipsis/.test(_desen));
T('și fiecare ÎȘI cere locul, după înălțimea lui măsurată', /spatiu\(h \+ 2\)/.test(_desen));
T('fontul se pune ÎNAINTE de măsurat (altfel locul cerut nu e locul ocupat)',
  /doc\.font\('Nunito'\)\.fontSize\(8\);\s*\n\s*const h = doc\.heightOfString/.test(_desen));
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

sect('3c-bis. RA Insight pe hârtia clientului — pachetul, prețurile și clauza de trecere');
// Din 14.10 (pasul 5): ce primește pachetul, din pachete.js; condiția cu prețul pachetului ales, ale celorlalte și clauza
// trecerii din aplicație (aceeași frază ca în contract, CLAUZA_TRECERE). Ofertele VECHI, pe cont, își păstrează textul lor.
T('„ce include" scrie pachetul cu descrierea lui din pachete.js',
  /L\.push\('RA Insight ' \+ pkO\.nume \+ ': ' \+ require\('\.\/pachete'\)\.descriere\(pkO\)/.test(PD));
T('condiția: pachetul ales, toate prețurile pachetelor și clauza de trecere din pachete.js',
  /'RA Insight: pachetul ' \+ pkC\.nume \+ '\. Pachetele: ' \+ toate\.join\(' · '\)/.test(PD) && /PKc\.CLAUZA_TRECERE/.test(PD));
T('ofertele vechi (pe cont) își păstrează textul: prețul unui cont, fondul comun',
  /\} else if \(o\.aiA && Number\(o\.pretCont\) > 0\) \{/.test(PD) && /Prețul unui cont de RA Insight este /.test(PD)
  && /'RA Insight, pe ' \+ n \+ ' ' \+ \(n === 1 \? 'cont' : 'conturi'\)/.test(PD));
T('pagina trimite pachetul spre hârtie (cod, prețul de pe rând, lista casei), din rândul ofertei',
  /aiPachet: lpk \? \{ cod: lpk\.pachet, pretRON: lpk\.total, lista: \{ basic: Number\(r\.p\.pkBasic\)/.test(html)
  && /aiA: !lpk && !!r\.cfg\.aiA/.test(html));

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
['pPlain', 'pCan', 'pFms', 'pPachet', 'pTahograf', 'pEtransport', 'mGps', 'mTravel'].forEach(function (k) {
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
// Alin, 29.09 („1.A, 2.DA"): aparatele se plătesc integral în AVANS, pe proformă, iar termenul nostru de
// livrare și montaj curge de la ÎNCASARE; instalarea se facturează după punerea în funcțiune. (A înlocuit
// regula din 21.09, „echipamentele la livrare": nu comandăm aparate pe banii noștri.) Aceeași formulare ca
// în anexa contractului, ca actele să nu se bată cap în cap.
T('aparatele în avans, pe proformă; termenul de la încasare; instalarea după punerea în funcțiune',
  /Echipamentele se plătesc integral în avans, pe proformă, la semnarea contractului; livrarea și montajul se fac în cel mult /.test(pdf)
  && /zile de la încasare\. Instalarea se facturează după punerea în funcțiune, pe mașinile montate efectiv/.test(pdf)
  && /contracte\.MONTAJ_ZILE_DUPA_AVANS/.test(pdf)
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
T('prețul pachetului se propune prin _ofPropune (care respectă ce e scris de mână)',
  /function _ofPropunePachet\(\) \{[\s\S]{0,400}_ofPropune\('of-pPachet', Number\(p\[k\]\) \|\| 0\)/.test(html));
// Prețul unui pachet NU mai depinde de flotă (14.10): schimbarea numărului de vehicule nu-l mai atinge.
T('schimbarea numărului de vehicule nu mai rescrie prețul RA Insight', !/_ofPropuneTarife/.test(html));
T('la o ofertă DESCHISĂ pentru editare nu se propune nimic',
  /if \(_raxOf\.editingId == null\) _ofCompleteazaDinVehicule\(\);/.test(html));
T('prețurile salvate în ofertă se marchează ca scrise de mână',
  /Object\.keys\(prices \|\| \{\}\)\.forEach\(function \(k\) \{ _ofAtinse\['of-' \+ k\] = true; \}\);/.test(html));
T('la desenarea formularului, urmele vechi se șterg', /_ofAtinse = \{\};/.test(html));
T('alegerea altui pachet lasă propunerea să scrie iar prețul',
  /window\.raxOfPachet = function \(\) \{\s*_ofAtinse\['of-pPachet'\] = false;\s*_ofPropunePachet\(\);/.test(html));
T('o ofertă redeschisă își păstrează prețul negociat al pachetului',
  /if \(cfg\.aiPachetPret > 0\) \{ set\('of-pPachet', cfg\.aiPachetPret\); _ofAtinse\['of-pPachet'\] = true; \}/.test(html));
T('iar una VECHE (pe cont) se redeschide ca Basic — cel mai apropiat pachet', /set\('of-aiPachet', cfg\.aiPachet \|\| \(cfg\.aiA \? 'basic' : 'start'\)\)/.test(html));

sect('6b. Ce s-a vândut se și activează pe firmă');
// Gaura: un client deschis DIN OFERTĂ primea contractul cu prețul corect, dar în fișa firmei nu se
// scria nimic — fără cotă înseamnă NELIMITAT. Vindeai 50 de întrebări/lună și livrai nelimitat.
T('există o singură funcție care duce oferta pe firmă', /async function _aplicaOfertaPeFirma\(companyId, oferta, dinOferta\)/.test(server));
T('contractul făcut din ofertă o cheamă', /_aplicaOfertaPeFirma\(id, oferta, dinOferta\)/.test(server));
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
// Pachetul (14.10): oferta nouă scrie PACHETUL pe firmă (cu prețul negociat), dar DOAR dacă firma n-are deja un pachet cu AI
// — unul negociat separat nu se calcă. Ofertele vechi (pe cont) — ca înainte, ramura de mai sus.
T('oferta nouă scrie pachetul pe firmă, cu prețul negociat', /patch\.ai_pachet = \{ cod: _pkOf\.cod, pretRON: /.test(server));
T('dar nu calcă un pachet cu AI pe care firma îl are deja', /const areDeja = _pachetCo\(coPk\);\s*if \(!\(areDeja && areDeja\.ai\)\) \{/.test(server));
T('și ramura veche (pe cont) rămâne doar pentru ofertele vechi', /if \(!_pkOf && cfg\.aiA\) \{/.test(server));
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
// Din 02.10 RA Insight e UN SINGUR asistent (_raInsight), cu trei uși: secțiunea, Rapoarte și „Asistent AI" de pe
// telefonul vechi. Regula de azi: poarta contului stă pe FIECARE ușă și pe conversațiile omului (nu mai sunt „două căi").
const usiAi = server.split('\n').filter((l) => /_raInsight\(req, res, \{/.test(l));
T('poarta e pusă pe toate ușile lui RA Insight (secțiunea, Rapoarte, „Asistent AI" vechi)',
  usiAi.length === 3 && usiAi.every((l) => /requireFeature\('ai_assistant'\), requireAiSeat/.test(l)), usiAi.length + ' uși');
T('și pe „Rezumă raportul" (se numără din întrebările firmei; până pe 14.10 îl putea cere și omul fără cont)',
  /app\.post\('\/api\/ai\/report-summary', requireAuth, requirePerm\('viewReports'\), withScope, requireFeature\('ai_assistant'\), requireAiSeat,/.test(server));
T('și pe conversațiile omului (listă, citire, redenumire, ștergere, 👍/👎)',
  (server.match(/app\.\w+\('\/api\/insight\/(conversatii|mesaje)[^']*', requireAuth, withScope, requireFeature\('ai_assistant'\), requireAiSeat/g) || []).length === 5);
T('mesajul spune cine poate porni contul', /Administratorul firmei îl poate porni din Utilizatori/.test(server));
T('super-adminul nu e îngrădit', /if \(req\.isSuper \|\| req\.companyId == null\) return next\(\);[\s\S]{0,120}getUserById/.test(server));
T('bara omului primește și consumul LUI', /aiQuotaState\(a\.companyId, a\.userId\)/.test(server));
T('consumul se scrie pe om la toate felurile de întrebări (RA Insight, oricare ușă, și rezumatul de raport)',
  /const userId = req\.auth && req\.auth\.userId != null \? req\.auth\.userId : null;/.test(server) &&
  /db\.recordAiUsage\(req\.companyId, 'insight', _agg, userId, model\)/.test(server) &&
  /recordAiUsage\(req\.companyId, 'report', [^)]*req\.auth && req\.auth\.userId, m\)/.test(server));
T('„Asistent AI" nu mai scrie un fel separat de consum — e tot RA Insight', !/recordAiUsage\(req\.companyId, 'chat'/.test(server));
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
const corpInsight = (server.match(/async function _raInsight\([\s\S]*?\n\}\n/) || [''])[0];
// Din 08.10 singura ocolire e proba modelelor (`o.proba`): costul ei e al NOSTRU, nu al firmei, și o pornește doar
// super-adminul (ruta /api/admin/insight/proba-modele, requireSuperadmin) — păzit și în verify_proba_modele.js.
T('poarta fondului e chemată din toate căile de AI (RA Insight, cu toate ușile lui, și rezumatul de raport)',
  /async function _regulileFonduluiAi\(req, res\)/.test(server) &&
  /if \(!o\.proba && await _regulileFonduluiAi\(req, res\)\) return;/.test(corpInsight) && usiAi.length === 3 &&
  (server.match(/if \((!o\.proba && )?await _regulileFonduluiAi\(req, res\)\) return;/g) || []).length === 2 &&
  (server.match(/proba: \{ model: m \}/g) || []).length === 1,
  String((server.match(/if \((!o\.proba && )?await _regulileFonduluiAi\(req, res\)\) return;/g) || []).length));
T('dacă fondul nu se poate citi, întrebarea NU pleacă', /Nu am putut verifica fondul de întrebări/.test(server));
// Pe ecran, bara nu mai spune „la epuizare se oprește" sec, ci ce poate face omul
T('bara propune contul în plus', /'Un cont în plus aduce încă ' \+ window\._raxNrI\(peCont\)/.test(html));
// ⚠ Dar DOAR pe regula pe cont. Pe cota fixă veche, un cont în plus nu aduce nimic — iar „|| 50"-ul
// de rezervă promitea tocmai asta, și pe web, și pe server, și pe telefon (găsit 23.09).
T('și numai unde e adevărat (regula pe cont), fără „50" pus de rezervă',
  /var inPlus = peCont > 0 \?/.test(html) && !/questionsPerSeat \|\| 50/.test(html)
  && !/questionsPerSeat \|\| 50/.test(server)
  && !/perSeat \|\| 50/.test(fs.readFileSync('./mobile/src/components/ChatScreen.tsx', 'utf8')));
// „extra" era eticheta de pe vremea când, peste fond, clientul PLĂTEA în plus. Acum nu mai plătește
// nimic — RA Insight se oprește. Citit de un client, „extra" suna a factură în plus.
T('la fond epuizat, clientul vede „oprit", nu „extra"',
  !/fa-circle-exclamation"><\/i> extra</.test(html) && /oprit până pe ' \+ reset/.test(html));
T('și i se spune că NU plătește nimic în plus', /fără niciun cost în plus/.test(html));
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
T('doar la APRINDERE, nu și la stingere — și doar pe regula pe cont (pe un pachet prețul e fix pe firmă, 14.10)', /if \(on && !pT\) \{[\s\S]{0,900}ai_seat_on/.test(server));
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
T('și vine din ofertă — doar la ofertele vechi, pe cont', /aiSeatPriceRON: !_cfgOf\.aiPachet && _cfgOf\.aiA \?/.test(server));
// Pachetul (14.10): în anexă intră pachetul ales, cu prețul negociat, și prețurile celorlalte la data ofertei — se semnează.
T('pachetul intră în anexă, cu prețurile celorlalte de la data ofertei',
  /aiPachet: _cfgOf\.aiPachet \? \{ cod: _cfgOf\.aiPachet, pretRON: _cfgOf\.aiPachetPret,\s*lista: \{ basic: _prOf\.pkBasic, pro: _prOf\.pkPro, business: _prOf\.pkBusiness \} \} : null/.test(server));
T('anexa îl îngheață (contracts.js) și „Salvează anexa" nu-l pierde',
  /out\.aiPachet = \{ cod: pk\.cod, nume: pk\.nume, pretRON: /.test(ctr) && /'aiQuestionsPerSeat', 'aiPachet', 'pastrareLuni'/.test(ctr));
T('contractul scrie pachetul, prețurile celorlalte și clauza de trecere (aceeași frază ca oferta)',
  /'RA Insight: pachetul ' \+ pk\.nume \+ ' \(' \+ PK\.descriere\(pk\) \+ '\)'/.test(cpdf) && /PK\.CLAUZA_TRECERE/.test(cpdf));
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
T('caseta prețului pachetului se arată doar la un pachet plătit (nu la Start)',
  /w\.style\.display = \(r\.cfg\.aiPachet && r\.cfg\.aiPachet !== 'start'\) \? 'inline-flex' : 'none'/.test(html));

sect('6f. Ofertare Live — limbajul vizual e într-un singur loc');
const css = fs.readFileSync('./public/css/app.css', 'utf8');
T('există blocul .raof în foaia de stil', /\.raof-card\{/.test(css) && /\.raof-rez\{/.test(css));
T('ecranul are un antet care spune ce e', /raof-head/.test(html) && /Calculatorul din care iese oferta/.test(html));
T('și pașii, ca să știi pe unde merge oferta', /raof-pasi/.test(html) && /Deschizi clientul din ea/.test(html));
T('cărțile sunt numerotate', /1\. Clientul/.test(html) && /2\. Flota clientului/.test(html) &&
  /3\. Ce mai primește clientul/.test(html) && /4\. Montajul/.test(html) && /5\. Aparatele/.test(html));
T('fiecare carte are o propoziție care o explică', /function card\(title, inner, desc\)/.test(html) && /raof-d/.test(html));
T('rândurile nu mai au stiluri scrise pe fiecare element', /function row\(label, inner, hint\) \{ return '<div class="raof-r">/.test(html));
T('caseta veche a conturilor pe cont a plecat, cu tot cu stilul ei (RA Insight se alege dintr-o listă de pachete, 14.10)',
  !/raof-q3|of-aiq-wrap|of-aiqSeats/.test(html) && !/\.raof-q3\{/.test(css));

sect('7. Flota tăiată nu mai minte');
T('plafonul nu mai e 80 înfipt în cod', !/positions\.slice\(0, 80\)/.test(server));
T('există un plafon cu nume și cu variabilă de mediu', /FLOTA_IN_RASPUNS = parseInt\(process\.env\.AI_FLEET_MAX\)/.test(server));
T('numărul adevărat al flotei merge mai departe', /Object\.defineProperty\(out, 'totalFlota'/.test(server));
T('proprietatea e ne-enumerabilă (nu strică JSON-ul trimis la model)', /totalFlota'[\s\S]{0,60}enumerable: false/.test(server));
T('unealta „starea live" spune modelului câte vehicule are flota', /total_flota: snap\.totalFlota/.test(server));
T('și îl avertizează când lista e tăiată', /out\.atentie = 'Flota are '/.test(server));
T('răspunsurile rapide primesc numărul adevărat (o singură cale, în RA Insight)', (server.match(/total: snap(shot)?\.totalFlota/g) || []).length === 1 && /total: snap\.totalFlota/.test((server.match(/async function _raInsight\([\s\S]*?\n\}\n/) || [''])[0]),
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
