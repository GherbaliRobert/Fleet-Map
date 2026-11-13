// verify_insight_panou.js — panoul „RA Insight pe firme" din verticala fondatorilor.
//
//   node verify_insight_panou.js
//
// De ce există: RA Insight se vinde pe PACHETE pe firmă (din 14.10; regula veche, „pe cont", a ieșit pe 11.11). Panoul ăsta e
// singurul loc din care ne uităm la clienți înainte să iasă facturile — dacă el socotește altfel decât factura, aflăm de la
// client, nu de la noi.
//
// Codul nu se copiază aici: se decupează din server.js și din public/index.html și se EXECUTĂ.
// Ce prinde: întrebările pachetului socotite greșit, un cont pe un om dezactivat numărat, o firmă cu pachet cu AI la 0 lei
// nesemnalată, rândul firmei care nu mai arată amândouă monedele, și oricine ar întreba fără să aibă cont.

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
const bucataFirma = taie(server, '// ── începe „Socoteala RA Insight pe o firmă"', '// ── sfârșit „Socoteala RA Insight pe o firmă" ──', 'server.js');
const _insightFirma = new Function('pachete', 'plans', bucataFirma + '\n; return _insightFirma;')(require('./pachete'), require('./plans'));

const pk = (cod, pretRON) => ({ ai_pachet: pretRON == null ? { cod } : { cod, pretRON } });
const om = (id, nume, loc, activ) => ({ id, full_name: nume, ai_seat: loc, active: activ !== false });

sect('1. Întrebările lunii: ale pachetului, pe toată firma');
let r = _insightFirma(
  { id: 1, name: 'Transport SRL', settings: pk('pro', 18) },
  { questions: 62 },
  [om(10, 'Ion', true), om(11, 'Maria', true), om(12, 'Vasile', true), om(13, 'Gigi', false)],
  { 10: { questions: 28 }, 11: { questions: 34 } },
  { areModul: true, costEur: 0.5, costPlasaLei: 2.5 });
T('numără conturile date', r.conturi === 3, String(r.conturi));
T('întrebările = ale pachetului (Pro: 600), oricâte conturi', r.fond === 600, String(r.fond));
T('consumul lunii', r.used === 62, String(r.used));
T('procentul din întrebări', r.pct === 10, String(r.pct));
T('câte au mai rămas', r.ramase === 538, String(r.ramase));
T('nu e epuizat', r.epuizat === false);
T('încasăm prețul pachetului, fix pe firmă (18 lei semnați)', r.venitLei === 18, String(r.venitLei));
T('plasa: 80% din preț, din costul real', r.plasa && r.plasa.plafonLei === 14.4 && r.plasa.costLei === 2.5 && r.plasa.procent === 17, JSON.stringify(r.plasa));
T('ne rămân: prețul minus costul real', r.ramanLei === 15.5, String(r.ramanLei));
T('în listă intră doar cine are cont sau a întrebat', r.oameni.length === 3, JSON.stringify(r.oameni.map(o => o.nume)));
T('primii sunt cei care întreabă cel mai mult', r.oameni[0].nume === 'Maria' && r.oameni[1].nume === 'Ion', JSON.stringify(r.oameni.map(o => o.nume)));
T('un cont dat și nefolosit e numărat', r.contFaraFolos === 1, String(r.contFaraFolos));
T('rândul nu mai poartă nimic al regulii vechi (deFacturat, peCont, pretCont, vechi)', !('deFacturat' in r) && !('peCont' in r) && !('pretCont' in r) && !('vechi' in r), Object.keys(r).join(','));

sect('2. Cine NU ține loc în pachet');
r = _insightFirma({ id: 4, name: 'X', settings: pk('basic') }, { questions: 0 }, [om(1, 'Activ', true), om(2, 'Dezactivat', true, false)], {}, { areModul: true, costEur: 0 });
T('un cont pe un om dezactivat nu se numără', r.conturi === 1, String(r.conturi));
T('dar se spune, ca să nu pară pierdut', r.contPeInactiv === 1, String(r.contPeInactiv));

sect('3. Găuri pe care vrem să le vedem');
r = _insightFirma({ id: 5, name: 'X', settings: pk('basic') }, { questions: 7 }, [om(1, 'Cu cont', true), om(2, 'Fără cont', false)], { 2: { questions: 7 } }, { areModul: true, costEur: 0 });
T('cine a întrebat fără cont e semnalat', r.folosFaraCont === 1, String(r.folosFaraCont));
T('și apare în listă, nu e ascuns', r.oameni.some(o => o.nume === 'Fără cont' && !o.loc));
r = _insightFirma({ id: 6, name: 'X', settings: pk('basic', 0) }, { questions: 0 }, [om(1, 'A', true)], {}, { areModul: true, costEur: 0 });
T('un pachet cu AI pus la 0 lei: nu încasăm nimic', r.venitLei === 0 && r.pachet.ai === true, JSON.stringify({ v: r.venitLei, p: r.pachet }));
r = _insightFirma({ id: 7, name: 'X', settings: {} }, { questions: 40 }, [], {}, { areModul: true, costEur: 0, reguli: 12 });
// Din 14.10, firma fără nimic scris e pe pachetul Start (inclus): 50 de răspunsuri pe butoane, fără AI, 0 lei.
T('firmă fără nimic scris = pachetul Start: 50 de răspunsuri pe butoane (numărate din reguli), 0 lei, fără plasă', r.fond === 50 && r.used === 12 && r.pachet && r.pachet.cod === 'start' && r.venitLei === 0 && r.plasa === null, JSON.stringify({ f: r.fond, u: r.used, p: r.pachet }));

sect('4. Ce rămăsese scris al regulii vechi nu mai contează (scoasă pe 11.11)');
r = _insightFirma({ id: 8, name: 'Vechi', settings: { ai_quota: { questions: 100, questionsPerSeat: 50, seatPriceRON: 15, seatsPeak: { luna: '2026-11', n: 4 } } } }, { questions: 100 }, [om(1, 'A', true)], {}, { areModul: true, costEur: 0, reguli: 3 });
T('o firmă cu `ai_quota` rămas e pe Start: fără cotă fixă, fără conturi facturate', r.pachet.cod === 'start' && r.fond === 50 && r.used === 3 && r.venitLei === 0, JSON.stringify({ p: r.pachet, f: r.fond, v: r.venitLei }));
r = _insightFirma({ id: 9, name: 'Foarte vechi', settings: {}, ai_monthly_limit: 80 }, { questions: 20 }, [], {}, { areModul: true, costEur: 0, reguli: 1 });
T('limita veche de pe companie (ai_monthly_limit) nu mai contează', r.pachet.cod === 'start' && r.fond === 50, String(r.fond));

sect('6. Ruta e strict a fondatorilor');
T('cere super-admin', /app\.get\('\/api\/admin\/ai-usage',\s*requireAuth,\s*requireSuperadmin/.test(server));
T('flota demo nu apare între clienți', /companies\.filter\(function \(c\) \{ return !c\.is_demo; \}\)/.test(server));
T('consumul pe om se ia dintr-o singură interogare, nu una pe firmă', /getAiMonthUsageByUserAll/.test(server) && /getAiMonthUsageByUserAll/.test(fs.readFileSync('./db.js', 'utf8')));

// ─── Partea 2: cartonașul din pagină, randat cu aceleași cifre ──────────────────────────────────
sect('7. Rândul firmei (Firmă cu firmă), cu amănuntul deschis, așa cum îl vede fondatorul');
// Din 19.10 (Alin, punctul 5) pagina are un rând pe firmă; cartonașele pe firme de dinainte („Mai multe cifre") au ieșit.
const bucataPanou = taie(html, '// ─── începe „Panoul RA Insight pe firme"', '// ─── sfârșit „Panoul RA Insight pe firme" ──', 'index.html');
const fereastra = {
  raFx: function () { return { eur: 5 }; },
  _raxNrI: function (n) { n = Number(n) || 0; var x = Math.abs(n) % 100; return n === 1 ? '1 întrebare' : n + ((x === 0 && n) || x >= 20 ? ' de ' : ' ') + 'întrebări'; }
};
const gata = new Function('window', 'document', 'esc',
  bucataPanou + '\n; return { tabel: _aiuTabel, pachete: _aiuPachete, atentie: _aiuAtentie, semnale: _aiuSemnale, unde: _aiuUndeConturi, socoteala: _aiuSocoteala, lei: _aiuLei, istoric: _aiuIstoric, luna: _aiuLunaNume, stat: _aiuStatistici, rgba: _aiuRgba, alerte: _aiuAvertismente };')(
  fereastra, { getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; } },
  function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); });

const rand = _insightFirma(
  { id: 42, name: 'Transport & Co <SRL>', settings: pk('pro', 20) },
  { questions: 62, last_used: '2026-09-13T10:00:00Z' },
  [om(10, 'Ion', true), om(11, 'Maria', true), om(12, 'Vasile', true)],
  { 10: { questions: 28 }, 11: { questions: 34 } }, { areModul: true, costEur: 1, costPlasaLei: 4 });
const h = gata.tabel([rand]);
T('scrie numele firmei, cu caracterele speciale scăpate', h.indexOf('Transport &amp; Co &lt;SRL&gt;') > 0);
T('un singur rând pe firmă, care se desface la clic', (h.match(/class="aiu-tr"/g) || []).length === 1 && /onclick="raxAiRand\(42\)"/.test(h) && /id="aiu-det-42"/.test(h));
T('arată pachetul pe rând', /<td>Pro<\/td>/.test(h));
T('arată consumul din întrebările pachetului', /62 din 600/.test(h), (h.match(/\d+ din \d+/) || [''])[0]);
T('desface socoteala: pachetul, întrebările, câte conturi a dat', /Pachet <b>Pro<\/b>: <b>600 de întrebări<\/b> pe lună, pentru toată firma \(3 conturi date\)/.test(h));
T('…și prețul fix, cu plasa de 80%', /Prețul pachetului: [\s\S]{0,140} pe lună, fix pe firmă\. Plasa: RA Insight trece pe butoane când costul real ajunge la 80% din preț\./.test(h));
T('arată ce ne costă și ce ne rămâne, din plasă', /Ne costă|ne rămân/.test(h) && /4 lei/.test(h) && /16 lei/.test(h));
T('orice sumă e în lei ȘI în euro', (h.match(/ lei /g) || []).length >= 3 && (h.match(/ €\)/g) || []).length >= 3);
T('listează oamenii cu cont', /Ion/.test(h) && /Maria/.test(h) && /Vasile/.test(h));
T('spune cine n-a întrebat deloc', /Vasile[\s\S]{0,200}0 întrebări/.test(h));
T('semnalează contul dat și nefolosit', /cont dat, nefolosit/.test(h));
T('nu arată prețuri pe întrebare — nu vindem la bucată', !/lei\s*\/\s*întrebare|pe întrebare/.test(h));
T('nimic al regulii vechi în rând („conturi ×", „Se facturează N conturi", „Fără preț pe cont")', !/conturi × |Se facturează <b>|Fără preț pe cont|regula veche/.test(h));
// De unde dă firma conturile (Alin, 19.10): din „Pachet și conturi" (din 15.10); Utilizatori nu mai dă conturi (bagheta a ieșit pe 11.11).
T('conturile se dau din RA Insight → „Pachet și conturi”, nu din Utilizatori', /din RA Insight → „Pachet și conturi”/.test(h) && !/din Utilizatori/.test(h));
const peProA = _insightFirma({ id: 47, name: 'Pro SRL', settings: { ai_pachet: { cod: 'pro', pretRON: 20 } } }, { questions: 10 }, [om(1, 'A', true)], { 1: { questions: 10 } }, { areModul: true, costEur: 0.1 });
T('pe orice pachet cu AI: din RA Insight → „Pachet și conturi”, nu din Utilizatori', /din RA Insight → „Pachet și conturi”/.test(gata.tabel([peProA])) && !/din Utilizatori/.test(gata.tabel([peProA])));
const peStart = _insightFirma({ id: 48, name: 'Start SRL', settings: {} }, { questions: 0 }, [], {}, { areModul: true, costEur: 0, reguli: 3 });
T('pe Start: întreabă doar administratorul', /pe Start întreabă doar administratorul firmei/.test(gata.tabel([peStart])));

const epuizat = _insightFirma({ id: 43, name: 'Y', settings: pk('basic', 10) },
  { questions: 200 }, [om(1, 'A', true)], { 1: { questions: 200 } }, { areModul: true, costEur: 0 });
T('firma cu fondul terminat e strigată sus, în „Ce cere atenție”', /<b>Y<\/b>: întrebările lunii s-au terminat/.test(gata.atentie({}, {}, [epuizat])));
T('și în rând bara e roșie, iar amănuntul spune ce urmează', /background:var\(--red\)/.test(gata.tabel([epuizat])) && /până pe 1/.test(gata.tabel([epuizat])));
const faraModul = _insightFirma({ id: 44, name: 'Z', settings: {} }, {}, [], {}, { areModul: false, costEur: 0 });
const hz = gata.tabel([faraModul, rand]);
T('firma fără RA Insight nu primește rând de tabel cu bară și bani goi', (hz.match(/class="aiu-tr"/g) || []).length === 1);
T('dar e spusă pe nume, sub tabel', /1 firmă fără RA Insight: Z/.test(hz));
T('fără nicio firmă cu RA Insight, o propoziție, nu un tabel gol', /Nicio firmă cu RA Insight/.test(gata.tabel([faraModul])) && !/<table/.test(gata.tabel([faraModul])));
const zeroConturi = _insightFirma({ id: 46, name: 'V', settings: pk('pro') }, {}, [om(1, 'A', false)], {}, { areModul: true, costEur: 0 });
T('firma care n-a dat niciun cont: socoteala o spune („0 conturi date”), fără înmulțiri cu conturi',
  /\(0 conturi date\)/.test(gata.socoteala(zeroConturi)) && !/conturi ×/.test(gata.socoteala(zeroConturi)), gata.socoteala(zeroConturi).slice(0, 160));
T('suma se scrie în amândouă monedele', /^45 lei <span[^>]*>\(9 €\)<\/span>$/.test(gata.lei(45)), gata.lei(45));
// Românește (22.10, Alin: „DA" la reparațiile din proba modelelor): virgula zecimală, punctul miilor.
T('sumele mici păstrează banii, scrise românește', /^3,5 lei /.test(gata.lei(3.5)) && /\(0,7 €\)/.test(gata.lei(3.5)), gata.lei(3.5));
T('…iar cele mari au punctul miilor', /^1\.234 lei /.test(gata.lei(1234)), gata.lei(1234));
T('fără zerouri de umplutură', !/[.,]00\b/.test(gata.lei(100)), gata.lei(100));

sect('8. Tabelul are stil, iar panoul vechi pe cartonașe nu mai e');
['.aiu-tab', '.aiu-tr', '.aiu-ch', '.aiu-det-in', '.aiu-bar', '.aiu-pk', '.aiu-at', '.aiu-ctl']
  .forEach(function (s) { T('există stilul ' + s, css.indexOf(s) > 0); });
T('un clic pe rând îl desface', /window\.raxAiRand\s*=/.test(html) && /onclick="raxAiRand\(/.test(bucataPanou));
T('panoul vechi a ieșit: nici cartonașele pe firme, nici cele șase cifre, nici „Mai multe cifre”',
  !/function _aiuCard|function _aiuKpiuri|aiu-mai-box|raxAiMaiMulte|raxAiToate|Mai multe cifre<\/button>/.test(html) && !/\.aiu-card[\s{.,]/.test(css));

// ─── Partea 3: istoricul, citit din facturi ─────────────────────────────────────────────────────
sect('9. Istoricul lună de lună');
const bucataIstoric = taie(server, '// ── începe „Istoricul RA Insight"', '// ── sfârșit „Istoricul RA Insight" ──', 'server.js');
const ist = new Function(bucataIstoric + '\n; return { luni: _insightIstoric, firme: _insightPeFirme };')();
const ms = (an, luna, zi) => Date.UTC(an, luna - 1, zi || 10);
const acum = new Date();
const cheieLuna = (inapoi) => new Date(Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - inapoi, 1)).toISOString().slice(0, 7);
const msLuna = (inapoi) => Date.UTC(acum.getUTCFullYear(), acum.getUTCMonth() - inapoi, 10);
const linieRa = (net) => ({ desc: 'RA Insight Pro', qty: 1, net: net, vat: 0, gross: net });
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
T('istoricul nu mai numără „conturi facturate" (regula veche a ieșit pe 11.11)', !('conturi' in lunaTrecuta), Object.keys(lunaTrecuta).join(','));
T('numără firmele facturate în luna aia', lunaTrecuta.firmeFacturate === 2, String(lunaTrecuta.firmeFacturate));
T('întrebările lunii vin din consum', lunaTrecuta.intrebari === 40 && lunaAsta.intrebari === 62);
T('costul lunii e socotit cu costul real', lunaTrecuta.costEur === 0.5, String(lunaTrecuta.costEur));
T('luna curentă e separată', lunaAsta.facturatLei === 60 && lunaAsta.incasatLei === 0, JSON.stringify({ f: lunaAsta.facturatLei, i: lunaAsta.incasatLei }));

L = ist.luni([], [
  { company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(0), lines: [linieRa(60, 4)] },
  { company_id: 1, type: 'credit_note', status: 'paid', period_start: msLuna(0), lines: [linieRa(15, 1)] }
], { luni: 12 });
T('storno-ul scade, nu se adună', L[11].facturatLei === 45, JSON.stringify({ f: L[11].facturatLei }));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', issue_date: msLuna(2), lines: [linieRa(30, 2)] }], { luni: 12 });
T('fără perioadă, luna se ia după data emiterii', L[9].facturatLei === 30, JSON.stringify(L.map(m => m.facturatLei)));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', period_start: ms(2001, 5), lines: [linieRa(30, 2)] }], { luni: 12 });
T('o factură din afara ferestrei nu intră nicăieri', L.every(m => m.facturatLei === 0));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(0), lines: [{ desc: 'RA Insight — trecerea la pachetul Pro, 14–30.11.2026 (17 zile)', qty: 1, net: 5.67 }] }], { luni: 12 });
T('și rândul trecerii la un pachet mai mare (pe zile) intră la RA Insight', L[11].facturatLei === 5.67, String(L[11].facturatLei));
L = ist.luni([], [{ company_id: 1, type: 'invoice', status: 'paid', period_start: msLuna(0), lines: [{ desc: 'Asistent AI', qty: 1, net: 29 }] }], { luni: 12 });
T('rândul vechi „Asistent AI" (suma fixă, scoasă pe 11.11) nu mai e citit ca RA Insight', L[11].facturatLei === 0, String(L[11].facturatLei));
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
T('are cap de tabel cu ce ne interesează', /Facturat/.test(tabel) && /Intrat în cont/.test(tabel) && /Profit/.test(tabel));
T('nu mai scrie „rămas la noi" — e profit, pe nume', !/Rămas la noi/.test(tabel));
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
T('istoricul are butonul lui de pornit/oprit', /id="aiu-istoric-btn"/.test(html) && /window\.raxAiIstoric\s*=/.test(html));
T('alegerea se ține minte pe calculatorul ăsta', /localStorage\.setItem\('raAiuIstoric'/.test(html) && /localStorage\.getItem\('raAiuIstoric'/.test(html));
T('oprit, graficul nici nu se mai desenează', /if \(pornit\) \{ try \{ _aiuDeseneaza/.test(html));
T('la deschiderea panoului se aplică alegerea de data trecută', /raxAiIstoric\(_aiuIstoricPornit\(\)\)/.test(html));
T('rândul firmei arată ce i-am facturat', /Ce am facturat pe RA Insight/.test(bucataPanou));
T('sus apar și facturatul, și cât a intrat', /cap: 'Facturat'/.test(html) && /cap: 'Intrat în cont'/.test(html));
T('cifra de încasări își spune rostul, nu „încasat tot"', /încă neplătiți de clienți/.test(html) && /tot ce am facturat a fost plătit/.test(html));
T('profitul e numit profit', /cap: 'Profit'/.test(html));
T('și e limpede că e profitul din RA Insight, nu al firmei: pagina se cheamă „RA Insight · control”', /agents: 'RA Insight · control'/.test(html));

sect('11. Dashboard: statistici și luna curentă, estimată');
const M = (luna, o) => Object.assign({ luna: luna, intrebari: 0, firme: 0, costEur: 0, facturatLei: 0, incasatLei: 0, conturi: 0, firmeFacturate: 0, estimatLei: 0 }, o);
let S = gata.stat([
  M(cheieLuna(1), { facturatLei: 100, incasatLei: 100, costEur: 2, conturi: 5 }),
  M(cheieLuna(0), { facturatLei: 150, incasatLei: 60, costEur: 3, conturi: 10 })
], 5);
T('creșterea față de luna trecută', S.crestere === 50, String(S.crestere));
T('rata de încasare pe toată perioada', S.rataIncasare === 64, String(S.rataIncasare));   // 160/250
T('marja după plata modelului', S.marja === 90, String(S.marja));                          // (250-25)/250
T('nu mai socotește „cât aduce un cont" (regula veche a ieșit pe 11.11)', !('peCont' in S), Object.keys(S).join(','));
T('nu e marcată ca estimare când s-a facturat', S.estimata === false);
S = gata.stat([M(cheieLuna(1), { facturatLei: 100, incasatLei: 100, costEur: 2 }), M(cheieLuna(0), { estimatLei: 120, costEur: 2 })], 5);
T('luna nefacturată intră în creștere cu estimarea', S.crestere === 20, String(S.crestere));
T('și e marcată ca estimare', S.estimata === true);
// Marja pe aceeași perioadă: 220 lei (100 facturați + 120 estimați) față de 20 lei cost = 91%.
// Dacă am socoti-o doar pe facturat, costul lunii curente ar cădea peste venitul lunii trecute → 80%.
T('marja nu pune costul lunii curente peste venitul lunii trecute', S.marja === 91, String(S.marja));
T('rata de încasare rămâne pe facturat — nu poți încasa ce n-ai facturat', S.rataIncasare === 100, String(S.rataIncasare));
S = gata.stat([M(cheieLuna(0), { estimatLei: 50 })], 5);
T('fără lună anterioară, creșterea nu se inventează', S.crestere === null, String(S.crestere));

const cuEstimare = gata.istoric([
  M(cheieLuna(1), { intrebari: 40, costEur: 0.5, facturatLei: 64, incasatLei: 64, conturi: 4 }),
  M(cheieLuna(0), { intrebari: 62, costEur: 0.27, estimatLei: 79, conturi: 0 })
], 5);
T('luna nefacturată apare cu estimarea', /79 lei/.test(cuEstimare) && /estimat — încă nefacturat/.test(cuEstimare));
T('rândul estimat e marcat, ca să nu fie luat drept bani', /<tr class="est">/.test(cuEstimare));
T('estimarea NU intră în totalul facturat', /<tfoot>[\s\S]*?<b>64 lei/.test(cuEstimare), (cuEstimare.match(/<tfoot>[\s\S]*<\/tfoot>/) || [''])[0].slice(0, 200));
T('nota explică regula estimării', /estimată<\/b> din pachetele firmelor/.test(cuEstimare) && /NU intră în total/.test(cuEstimare));
T('fără bibliotecă de grafice, nu lăsăm o gaură goală în pagină',
  !/aiu-graf/.test(cuEstimare) && /<table/.test(cuEstimare));
fereastra.Chart = {};   // ca și cum biblioteca s-ar fi încărcat
const cuGrafic = gata.istoric([
  M(cheieLuna(1), { intrebari: 40, costEur: 0.5, facturatLei: 64, incasatLei: 64, conturi: 4 }),
  M(cheieLuna(0), { intrebari: 62, costEur: 0.27, estimatLei: 79 })
], 5);
delete fereastra.Chart;
T('dashboard-ul are și grafic, nu doar tabel', /aiu-graf/.test(cuGrafic) && /id="aiu-canvas"/.test(cuGrafic));
T('istoricul are cele trei cifre mari ale lui', /Facturat/.test(cuEstimare) && /Intrat în cont/.test(cuEstimare)
  && /Profit/.test(cuEstimare) && /rată de încasare/.test(cuEstimare));
const golDash = gata.istoric([M(cheieLuna(0), {})], 5);
T('gol, dar explicat: se umple singur', /Se umple singur/.test(golDash) && /luna curentă<\/b> apare imediat/.test(golDash));

T('culorile graficului se iau din temă, nu sunt bătute în cuie', /cssVar\('--accent'\)/.test(bucataPanou));
T('graficul folosește ajutorul comun al aplicației', /createChart\('aiu-canvas'/.test(bucataPanou));
T('fără bibliotecă de grafice, desenul e sărit', /typeof window\.Chart === 'undefined'/.test(bucataPanou));
T('graficele scriu cu Nunito, ca tot restul', /Chart\.defaults\.font\.family\s*=\s*"'Nunito'/.test(html));
T('culoarea se traduce corect pentru pânză', gata.rgba('#3fe07d', .3) === 'rgba(63,224,125,0.3)', gata.rgba('#3fe07d', .3));
T('și dacă tema dă o culoare pe care n-o știm, nu crapă', /^rgba\(/.test(gata.rgba('cine-stie', .3)), gata.rgba('cine-stie', .3));
['.aiu-kpiuri', '.aiu-kpi', '.aiu-grup', '.aiu-alerta', '.aiu-graf', '.aiu-ist tr.est'].forEach(function (s) { T('există stilul ' + s, css.indexOf(s) > 0); });

sect('12. Cele patru cifre de sus (pachetele)');
// Pachetele, aceleași cu ale ecranului pentru clienți. Totalurile le dă serverul (/api/admin/ai-usage → pachete); pagina doar le arată.
const F = (o) => Object.assign({ id: 1, name: 'F', enabled: true, conturi: 3, fond: 600, used: 60,
  pachet: { cod: 'pro', nume: 'Pro', pretRON: 20, ai: true }, venitLei: 20, costEur: 0.2, oameni: [] }, o);
const SUM = (o) => Object.assign({ companies: 4, withFeature: 3, active: 2, conturi: 5, fond: 200,
  totalCalls: 112, epuizate: 0, totalCostEur: 0.27, totalVenitLei: 79 }, o);
// Soldul vine de la server cu textele cartonașului gata scrise (sold_ai.cartonas, 04.11); pagina doar le arată.
const soldAi = require('./sold_ai');
const cuCartonas = (x) => Object.assign({}, x, soldAi.cartonas(x));
let K = gata.pachete({ peCod: { start: 5, basic: 1, pro: 2 }, venitLei: 50, costLei: 4.2, sold: cuCartonas({ usd: 12.5, scris: 20, cheltuit: 7.5, zile: 40, ritmZile: 7, la: Date.UTC(2026, 9, 17) }) });
T('sunt exact patru cifre', (K.match(/class="aiu-pk-t"/g) || []).length === 4, String((K.match(/class="aiu-pk-t"/g) || []).length));
T('„Încasăm luna asta”, în două monede', /Încasăm luna asta[\s\S]{0,200}50 lei[\s\S]{0,80}\(10 €\)/.test(K), K.slice(0, 300));
T('și din ce pachete vin banii', /5 Start · 1 Basic · 2 Pro/.test(K));
T('„Ne costă (real)”: plata către model (fără partea „analiză aprofundată” — Sonnet scos pe 28.10)', /Ne costă \(real\)[\s\S]{0,200}plata către model/.test(K) && !/aprofundat/.test(K));
T('„Ne rămân” e verde când rămân bani și spune cât din încasări', /Ne rămân[\s\S]{0,140}color:var\(--accent\);">46 lei/.test(K) && /92% din încasări/.test(K));
T('„Sold Anthropic”: cât a RĂMAS, la zi (serverul scade ce s-a cheltuit de la scriere), zilele și butonul', /~12,50 \$/.test(K) && /ajunge ~40 de zile/.test(K) && />schimbă</.test(K), K.slice(K.indexOf('Sold Anthropic'), K.indexOf('Sold Anthropic') + 400));
T('… și din ce sumă scrisă, în ce zi (ca omul să știe că cifra mare e socotită)', /din 20,00 \$ scriși pe 17 octombrie/.test(K), K.slice(K.indexOf('Sold Anthropic'), K.indexOf('Sold Anthropic') + 400));
T('fără cheltuieli în ultimele 7 zile, o spune (nu inventează zile)', /fără cheltuieli în ultimele 7 zile/.test(gata.pachete({ peCod: {}, venitLei: 0, costLei: 0, sold: cuCartonas({ usd: 20, scris: 20, zile: null, ritmZile: 7, la: Date.UTC(2026, 9, 17) }) })));
K = gata.pachete({ peCod: {}, venitLei: 0, costLei: 0.4 });
T('fără nicio firmă pe pachet, o spune', /nicio firmă pe un pachet încă/.test(K));
T('fără încasări, „Ne rămân” e roșu și fără procent inventat', /Ne rămân[\s\S]{0,140}color:var\(--red\)/.test(K) && /<div class="s">—<\/div>/.test(K));
T('soldul nescris se poate scrie de aici', /nescris/.test(K) && />scrie-l</.test(K));
T('fără date de la server, nimic (nu cifre inventate)', gata.pachete(null) === '');

sect('13. Ce nu e în regulă se spune tare, sus');
const LA0 = { cod: 'pro', nume: 'Pro', pretRON: 0, ai: true };
let A = gata.alerte(SUM({ totalCalls: 47, totalCostEur: 0.16 }), [F({ pachet: LA0, venitLei: 0 }), F({ id: 2, pachet: LA0, venitLei: 0 })]);
T('nimeni nu plătește → se scrie răspicat', /Nicio firmă nu plătește RA Insight/.test(A));
T('și se spune cât ne costă degeaba', /47 de întrebări/.test(A) && /0,8 lei/.test(A), A.slice(0, 220));
T('și unde se pune prețul: fila „Acces" a firmei', /Prețul pachetului se pune pe fiecare firmă, din fila <b>„Acces”<\/b>/.test(A) && !/Conturi &amp; Abonamente|pe cont/.test(A));
A = gata.alerte(SUM(), [F(), F({ id: 2, pachet: LA0, venitLei: 0 })]);
T('doar unele cu AI la 0 lei → altă alertă, mai blândă', /1 firmă are un pachet RA Insight cu AI la 0 lei/.test(A) && !/Nicio firmă nu plătește/.test(A));
T('Start (inclus, fără AI) nu e o gaură', gata.alerte(SUM(), [F(), F({ id: 2, pachet: { cod: 'start', nume: 'Start', pretRON: 0, ai: false }, venitLei: 0 })]) === '');
A = gata.alerte(SUM({ epuizate: 2 }), [F()]);
T('firmele cu întrebările terminate sunt strigate', /2 firme și-au terminat întrebările lunii/.test(A) && !/fondul/.test(A));
T('când e totul în regulă, nu apare nicio bandă', gata.alerte(SUM(), [F()]) === '');

// (Tendința, fostă secțiunea 14, e acum în verify_insight_bani.js: din 19.10 doar telefonul o mai arată.)
sect('14. Graficul cade pe întrebări când n-avem bani');
T('știe să deseneze și doar întrebările', /Întrebări pe lună — bani n-avem încă de arătat/.test(bucataPanou));
T('alege singur, după ce există în luni', /var areBani = l\.some/.test(bucataPanou));

sect('15. Istoricul e OPRIT din start — buton de activare');
T('implicit oprit', /localStorage\.getItem\('raAiuIstoric'\) === '1'/.test(bucataPanou));
T('dar alegerea se ține minte', /localStorage\.setItem\('raAiuIstoric'/.test(bucataPanou));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
