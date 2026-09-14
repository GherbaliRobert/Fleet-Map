// verify_insight_panou.js — panoul „RA Insight pe firme" din verticala fondatorilor.
//
//   node verify_insight_panou.js
//
// De ce există: din 11.09 RA Insight se vinde pe CONT, nu pe firmă. Fondul lunii = conturi aprinse ×
// întrebări pe cont, iar factura ia câte conturi a avut firma CEL MULT în luna aia. Panoul ăsta e
// singurul loc din care ne uităm la clienți înainte să iasă facturile — dacă el socotește altfel
// decât factura, aflăm de la client, nu de la noi.
//
// Codul nu se copiază aici: se decupează din server.js și din public/index.html și se EXECUTĂ.
// Ce prinde: fondul socotit greșit, vârful lunii ignorat (un cont stins pe 25 ar scăpa nefacturat),
// vârful unei luni vechi luat drept al lunii curente, un cont pe un om dezactivat pus pe factură,
// contractele vechi cu cotă fixă stricate, o firmă rămasă fără preț pe cont care nu e semnalată,
// cartonașul care nu mai arată amândouă monedele, și oricine ar întreba fără să aibă cont.

const fs = require('fs');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const server = fs.readFileSync('./server.js', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

function taie(sursa, start, capat, unde) {
  const a = sursa.indexOf(start);
  if (a < 0) throw new Error('nu găsesc începutul în ' + unde + ': ' + start.slice(0, 60));
  const b = sursa.indexOf(capat, a);
  if (b < 0) throw new Error('nu găsesc capătul în ' + unde + ': ' + capat.slice(0, 60));
  return sursa.slice(a, b);
}

// ─── Partea 1: socoteala de pe server, rulată cu cifre inventate ────────────────────────────────
const bucataQuota = taie(server, 'function _aiQuotaFromSettings(settings) {', '\n// ─── Câte conturi', 'server.js');
const bucataLuna = taie(server, 'function _lunaAcum()', '\nasync function _urcaSeatsPeak', 'server.js');
const bucataFirma = taie(server, '// ── începe „Socoteala RA Insight pe o firmă"', '// ── sfârșit „Socoteala RA Insight pe o firmă" ──', 'server.js');
const _insightFirma = new Function(bucataQuota + '\n' + bucataLuna + '\n' + bucataFirma + '\n; return _insightFirma;')();

const LUNA = new Date().toISOString().slice(0, 7);
const setari = (o) => ({ ai_quota: o });
const om = (id, nume, loc, activ) => ({ id, full_name: nume, ai_seat: loc, active: activ !== false });

sect('1. Fondul lunii: conturi × întrebări pe cont');
let r = _insightFirma(
  { id: 1, name: 'Transport SRL', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15 }) },
  { questions: 62 },
  [om(10, 'Ion', true), om(11, 'Maria', true), om(12, 'Vasile', true), om(13, 'Gigi', false)],
  { 10: { questions: 28 }, 11: { questions: 34 } },
  { areModul: true, costEur: 0.5 });
T('numără conturile aprinse', r.conturi === 3, String(r.conturi));
T('fondul = conturi × întrebări pe cont', r.fond === 150, String(r.fond));
T('consumul lunii', r.used === 62, String(r.used));
T('procentul din fond', r.pct === 41, String(r.pct));
T('câte au mai rămas', r.ramase === 88, String(r.ramase));
T('nu e epuizat', r.epuizat === false);
T('încasăm conturi × preț', r.venitLei === 45, String(r.venitLei));
T('în listă intră doar cine are cont sau a întrebat', r.oameni.length === 3, JSON.stringify(r.oameni.map(o => o.nume)));
T('primii sunt cei care întreabă cel mai mult', r.oameni[0].nume === 'Maria' && r.oameni[1].nume === 'Ion', JSON.stringify(r.oameni.map(o => o.nume)));
T('un cont plătit și nefolosit e numărat', r.contFaraFolos === 1, String(r.contFaraFolos));

sect('2. Vârful lunii — un cont stins pe parcurs tot se plătește');
r = _insightFirma(
  { id: 2, name: 'X', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15, seatsPeak: { luna: LUNA, n: 4 } }) },
  { questions: 10 }, [om(1, 'A', true), om(2, 'B', true), om(3, 'C', true)], {}, { areModul: true, costEur: 0 });
T('se facturează vârful, nu ce a rămas', r.deFacturat === 4, String(r.deFacturat));
T('încasarea urmează vârful', r.venitLei === 60, String(r.venitLei));
T('fondul rămâne pe conturile de ACUM (atâtea întrebări are)', r.fond === 150, String(r.fond));
r = _insightFirma(
  { id: 3, name: 'X', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15, seatsPeak: { luna: '2001-01', n: 9 } }) },
  { questions: 0 }, [om(1, 'A', true)], {}, { areModul: true, costEur: 0 });
T('vârful unei luni vechi nu se târăște mai departe', r.deFacturat === 1, String(r.deFacturat));

sect('3. Cine NU se pune pe factură');
r = _insightFirma(
  { id: 4, name: 'X', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15 }) },
  { questions: 0 }, [om(1, 'Activ', true), om(2, 'Dezactivat', true, false)], {}, { areModul: true, costEur: 0 });
T('un cont pe un om dezactivat nu se numără', r.conturi === 1, String(r.conturi));
T('dar se spune, ca să nu pară pierdut', r.contPeInactiv === 1, String(r.contPeInactiv));

sect('4. Găuri pe care vrem să le vedem');
r = _insightFirma(
  { id: 5, name: 'X', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15 }) },
  { questions: 7 }, [om(1, 'Cu cont', true), om(2, 'Fără cont', false)], { 2: { questions: 7 } },
  { areModul: true, costEur: 0 });
T('cine a întrebat fără cont e semnalat', r.folosFaraCont === 1, String(r.folosFaraCont));
T('și apare în listă, nu e ascuns', r.oameni.some(o => o.nume === 'Fără cont' && !o.loc));
r = _insightFirma({ id: 6, name: 'X', settings: setari({ questionsPerSeat: 50 }) }, { questions: 0 },
  [om(1, 'A', true)], {}, { areModul: true, costEur: 0 });
T('fără preț pe cont nu se facturează nimic', r.venitLei === 0 && r.pretCont === 0, JSON.stringify({ v: r.venitLei, p: r.pretCont }));
r = _insightFirma({ id: 7, name: 'X', settings: {} }, { questions: 40 }, [], {}, { areModul: true, costEur: 0 });
T('firmă cu modul dar fără fond = nelimitat, pe banii noștri', r.fond === 0 && r.pct === null, JSON.stringify({ f: r.fond, p: r.pct }));

sect('5. Contractele vechi, cu cotă fixă pe firmă');
r = _insightFirma({ id: 8, name: 'Vechi', settings: setari({ questions: 100 }) }, { questions: 100 },
  [om(1, 'A', false)], {}, { areModul: true, costEur: 0 });
T('cota fixă rămâne fondul lunii', r.fond === 100, String(r.fond));
T('e marcată ca formă veche', r.vechi === true);
T('epuizat când s-a atins fondul', r.epuizat === true);
r = _insightFirma({ id: 9, name: 'Foarte vechi', settings: {}, ai_monthly_limit: 80 }, { questions: 20 }, [], {}, { areModul: true, costEur: 0 });
T('limita veche de pe companie e respectată', r.fond === 80, String(r.fond));

sect('6. Ruta e strict a fondatorilor');
T('cere super-admin', /app\.get\('\/api\/admin\/ai-usage',\s*requireAuth,\s*requireSuperadmin/.test(server));
T('flota demo nu apare între clienți', /companies\.filter\(function \(c\) \{ return !c\.is_demo; \}\)/.test(server));
T('consumul pe om se ia dintr-o singură interogare, nu una pe firmă', /getAiMonthUsageByUserAll/.test(server) && /getAiMonthUsageByUserAll/.test(fs.readFileSync('./db.js', 'utf8')));

// ─── Partea 2: cartonașul din pagină, randat cu aceleași cifre ──────────────────────────────────
sect('7. Cartonașul firmei, așa cum îl vede fondatorul');
const bucataPanou = taie(html, '// ─── începe „Panoul RA Insight pe firme"', '// ─── sfârșit „Panoul RA Insight pe firme" ──', 'index.html');
const fereastra = {
  raFx: function () { return { eur: 5 }; },
  _raxNrI: function (n) { n = Number(n) || 0; var x = Math.abs(n) % 100; return n === 1 ? '1 întrebare' : n + ((x === 0 && n) || x >= 20 ? ' de ' : ' ') + 'întrebări'; }
};
const gata = new Function('window', 'document', 'esc',
  bucataPanou + '\n; return { card: _aiuCard, stare: _aiuStare, socoteala: _aiuSocoteala, lei: _aiuLei, istoric: _aiuIstoric, luna: _aiuLunaNume };')(
  fereastra, { getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; } },
  function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); });

const rand = _insightFirma(
  { id: 42, name: 'Transport & Co <SRL>', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15, seatsPeak: { luna: LUNA, n: 4 } }) },
  { questions: 62, last_used: '2026-09-13T10:00:00Z' },
  [om(10, 'Ion', true), om(11, 'Maria', true), om(12, 'Vasile', true)],
  { 10: { questions: 28 }, 11: { questions: 34 } }, { areModul: true, costEur: 1 });
const h = gata.card(rand, true);
T('scrie numele firmei, cu caracterele speciale scăpate', h.indexOf('Transport &amp; Co &lt;SRL&gt;') > 0);
T('spune câte conturi are acum', /3 conturi/.test(h));
T('și câte se facturează, când diferă', /4 de facturat/.test(h));
T('arată consumul din fond', /62<\/b> din 150 de întrebări/.test(h), h.slice(h.indexOf('din 150') - 40, h.indexOf('din 150') + 20));
T('desface socoteala pe rânduri', /3<\/b> conturi × <b>50 de întrebări/.test(h));
T('spune de ce se facturează mai mult', /cel mult<\/b> luna asta/.test(h));
T('arată încasarea, costul și ce rămâne', /încasăm/.test(h) && /ne costă/.test(h) && /rămâne/.test(h));
T('orice sumă e în lei ȘI în euro', (h.match(/ lei /g) || []).length >= 3 && (h.match(/ €\)/g) || []).length >= 3);
T('listează oamenii cu cont', /Ion/.test(h) && /Maria/.test(h) && /Vasile/.test(h));
T('spune cine n-a întrebat deloc', /Vasile[\s\S]{0,200}0 întrebări/.test(h));
T('semnalează contul plătit și nefolosit', /nefolosit/.test(h));
T('nu arată prețuri pe întrebare — nu vindem la bucată', !/lei\s*\/\s*întrebare|pe întrebare/.test(h));

const epuizat = _insightFirma({ id: 43, name: 'Y', settings: setari({ questionsPerSeat: 50, seatPriceRON: 15 }) },
  { questions: 50 }, [om(1, 'A', true)], { 1: { questions: 50 } }, { areModul: true, costEur: 0 });
T('firma cu fondul terminat e strigată', gata.stare(epuizat).t === 'fond terminat', gata.stare(epuizat).t);
T('și i se spune clientului ce urmează', /până pe 1/.test(gata.card(epuizat, true)));
const faraModul = _insightFirma({ id: 44, name: 'Z', settings: {} }, {}, [], {}, { areModul: false, costEur: 0 });
T('firma fără modul e recunoscută', gata.stare(faraModul).t === 'fără RA Insight', gata.stare(faraModul).t);
const faraPret = _insightFirma({ id: 45, name: 'W', settings: setari({ questionsPerSeat: 50 }) }, {}, [om(1, 'A', true)], {}, { areModul: true, costEur: 0 });
T('firma fără preț pe cont e semnalată în socoteală', /Fără preț pe cont/.test(gata.socoteala(faraPret)));
// „0 conturi × 50 de întrebări = 0" e o socoteală care nu spune nimic; adevărul e „n-a dat niciun cont".
const zeroConturi = _insightFirma({ id: 46, name: 'V', settings: setari({ questionsPerSeat: 50, seatPriceRON: 12 }) },
  {}, [om(1, 'A', false)], {}, { areModul: true, costEur: 0 });
T('firma care n-a dat niciun cont e spusă pe nume, nu cu zerouri',
  /nu a dat niciun cont/.test(gata.socoteala(zeroConturi)) && !/0<\/b> conturi ×/.test(gata.socoteala(zeroConturi)),
  gata.socoteala(zeroConturi).slice(0, 120));
T('firma fără RA Insight nu arată bară de fond și bani goi',
  gata.card(faraModul, true).indexOf('aiu-bara') < 0 && gata.card(faraModul, true).indexOf('aiu-bani') < 0);
T('dar firma CU modul le arată', gata.card(rand, true).indexOf('aiu-bara') > 0 && gata.card(rand, true).indexOf('aiu-bani') > 0);
T('suma se scrie în amândouă monedele', /^45 lei <span[^>]*>\(9 €\)<\/span>$/.test(gata.lei(45)), gata.lei(45));
T('sumele mici păstrează banii', /^3\.5 lei /.test(gata.lei(3.5)) && /\(0\.7 €\)/.test(gata.lei(3.5)), gata.lei(3.5));
T('fără zerouri de umplutură', !/\.00/.test(gata.lei(100)), gata.lei(100));

sect('8. Cartonașele au stil, nu doar marcaj');
['.aiu-lista', '.aiu-card', '.aiu-cap', '.aiu-pastila', '.aiu-det', '.aiu-card.deschis .aiu-sageata']
  .forEach(function (s) { T('există stilul ' + s, css.indexOf(s) > 0); });
T('se strâng și se desfac toate dintr-un buton', /window\.raxAiToate\s*=/.test(html) && /id="aiu-toate"/.test(html));
T('un clic pe cartonaș îl desface', /window\.raxAiFirma\s*=/.test(html) && /onclick="raxAiFirma\(/.test(html));

// ─── Partea 3: istoricul, citit din facturi ─────────────────────────────────────────────────────
sect('9. Istoricul lună de lună');
const bucataIstoric = taie(server, '// ── începe „Istoricul RA Insight"', '// ── sfârșit „Istoricul RA Insight" ──', 'server.js');
const ist = new Function(bucataIstoric + '\n; return { luni: _insightIstoric, firme: _insightPeFirme };')();
const ms = (an, luna, zi) => Date.UTC(an, luna - 1, zi || 10);
const acum = new Date();
const cheieLuna = (inapoi) => new Date(Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - inapoi, 1)).toISOString().slice(0, 7);
const msLuna = (inapoi) => Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - inapoi, 10);
const linieRa = (net, qty) => ({ desc: 'RA Insight — conturi (' + (qty || 3) + ' × 15.00 lei)', qty: qty || 3, net: net, vat: 0, gross: net });
const linieGps = (net) => ({ desc: 'Abonament monitorizare GPS', qty: 5, net: net, vat: 0, gross: net });

let L = ist.luni([], [], { luni: 12 });
T('scheletul are 12 luni, în ordine', L.length === 12 && L[11].luna === cheieLuna(0) && L[0].luna === cheieLuna(11), L.length + ' ' + L[0].luna + '→' + L[11].luna);
T('lunile goale sunt zero, nu lipsesc', L[0].facturatLei === 0 && L[0].intrebari === 0);

L = ist.luni(
  [{ luna: cheieLuna(1), questions: 40, firme: 2 }, { luna: cheieLuna(0), questions: 62, firme: 1 }],
  [
    { company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(1), lines: [linieGps(500), linieRa(45, 3)] },
    { company_id: 2, type: 'invoice', status: 'issued', period_start: msLuna(1), lines: [linieRa(19, 1)] },
    { company_id: 1, type: 'invoice', status: 'issued', period_start: msLuna(0), lines: [linieRa(60, 4)] }
  ], { luni: 12, cost: function () { return 0.5; } });
const lunaTrecuta = L[10], lunaAsta = L[11];
T('facturatul lunii trecute adună rândurile RA Insight', lunaTrecuta.facturatLei === 64, String(lunaTrecuta.facturatLei));
T('abonamentul GPS NU intră în socoteala RA Insight', lunaTrecuta.facturatLei !== 564, String(lunaTrecuta.facturatLei));
T('încasat = doar ce e marcat plătit', lunaTrecuta.incasatLei === 45, String(lunaTrecuta.incasatLei));
T('conturile facturate se adună', lunaTrecuta.conturi === 4, String(lunaTrecuta.conturi));
T('numără firmele facturate în luna aia', lunaTrecuta.firmeFacturate === 2, String(lunaTrecuta.firmeFacturate));
T('întrebările lunii vin din consum', lunaTrecuta.intrebari === 40 && lunaAsta.intrebari === 62);
T('costul lunii e socotit cu costul real', lunaTrecuta.costEur === 0.5, String(lunaTrecuta.costEur));
T('luna curentă e separată', lunaAsta.facturatLei === 60 && lunaAsta.incasatLei === 0, JSON.stringify({ f: lunaAsta.facturatLei, i: lunaAsta.incasatLei }));

L = ist.luni([], [
  { company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(0), lines: [linieRa(60, 4)] },
  { company_id: 1, type: 'credit_note', status: 'paid', period_start: msLuna(0), lines: [linieRa(15, 1)] }
], { luni: 12 });
T('storno-ul scade, nu se adună', L[11].facturatLei === 45 && L[11].conturi === 3, JSON.stringify({ f: L[11].facturatLei, c: L[11].conturi }));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', issue_date: msLuna(2), lines: [linieRa(30, 2)] }], { luni: 12 });
T('fără perioadă, luna se ia după data emiterii', L[9].facturatLei === 30, JSON.stringify(L.map(m => m.facturatLei)));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', period_start: ms(2001, 5), lines: [linieRa(30, 2)] }], { luni: 12 });
T('o factură din afara ferestrei nu intră nicăieri', L.every(m => m.facturatLei === 0));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(0), lines: [{ desc: 'Asistent AI', qty: 1, net: 29 }] }], { luni: 12 });
T('forma VECHE din factură („Asistent AI") e recunoscută', L[11].facturatLei === 29, String(L[11].facturatLei));
const dbSrc = fs.readFileSync('./db.js', 'utf8');
T('ciornele și facturile anulate nu ajung de la bază', /status NOT IN \('draft','canceled'\)/.test(dbSrc));
T('nici proformele — altfel am număra de două ori', /type <> 'proforma'/.test(dbSrc));

const peFirme = ist.firme([
  { company_id: 7, type: 'invoice', status: 'paid', period_start: msLuna(1), lines: [linieRa(45, 3)] },
  { company_id: 7, type: 'invoice', status: 'issued', period_start: msLuna(0), lines: [linieRa(60, 4)] },
  { company_id: 8, type: 'invoice', status: 'issued', period_start: msLuna(0), lines: [linieGps(300)] }
]);
T('pe firmă: facturat cumulat', peFirme[7] && peFirme[7].facturatLei === 105, JSON.stringify(peFirme[7]));
T('pe firmă: încasat doar ce e plătit', peFirme[7] && peFirme[7].incasatLei === 45, JSON.stringify(peFirme[7]));
T('firma fără rând RA Insight nu apare', !peFirme[8]);

sect('10. Istoricul, așa cum se vede în pagină');
const tabel = gata.istoric([
  { luna: cheieLuna(2), intrebari: 0, firme: 0, costEur: 0, facturatLei: 0, incasatLei: 0, conturi: 0, firmeFacturate: 0 },
  { luna: cheieLuna(1), intrebari: 40, firme: 2, costEur: 0.5, facturatLei: 64, incasatLei: 45, conturi: 4, firmeFacturate: 2 },
  { luna: cheieLuna(0), intrebari: 62, firme: 1, costEur: 0.27, facturatLei: 60, incasatLei: 0, conturi: 4, firmeFacturate: 1 }
], 5);
T('are cap de tabel cu ce ne interesează', /Facturat/.test(tabel) && /Încasat/.test(tabel) && /Rămas la noi/.test(tabel));
const corp = (tabel.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
T('lunile goale de la început nu se arată', (corp.match(/<tr>/g) || []).length === 2, String((corp.match(/<tr>/g) || []).length));
T('scrie luna pe nume, nu ca un cod', new RegExp(gata.luna(cheieLuna(0))).test(tabel), gata.luna(cheieLuna(0)));
T('are rând de total', /<tfoot>[\s\S]*Total/.test(tabel));
T('totalul adună facturatul', /124 lei/.test(tabel), (tabel.match(/\d+ lei/g) || []).join(' '));
T('spune ce a rămas neîncasat', /neîncasați/.test(tabel));
T('sumele din istoric tot în două monede', (tabel.match(/ €\)/g) || []).length >= 4);
T('spune de unde vin cifrele', /facturile emise/.test(tabel));
const gol = gata.istoric([{ luna: cheieLuna(0), intrebari: 0, firme: 0, costEur: 0, facturatLei: 0, incasatLei: 0, conturi: 0, firmeFacturate: 0 }], 5);
T('fără istoric, spune omenește că încă nu e nimic', /Încă nu e nimic/.test(gol) && !/<table/.test(gol));
T('butonul de desfăcut/strâns e verde', /id="aiu-toate" class="rax-btn primary"/.test(html));
T('cartonașul firmei arată ce i-am facturat', /Ce am facturat pe RA Insight/.test(html));
T('sus apar și facturatul, și încasatul', /Facturat pe RA Insight/.test(html) && /Din care încasat/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
