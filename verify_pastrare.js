// verify_pastrare.js — cât se păstrează istoricul: 12 luni pentru toți, mai mult doar unde s-a plătit.
//
//   node verify_pastrare.js
//
// Decizia (Alin, 24.09), după ce am măsurat costul pe aplicația pornită: 12 luni de istoric sunt
// INCLUSE pentru toți; 24 / 36 de luni (sau alt număr) se vând în ofertă, se scriu pe firmă, se
// facturează și CHIAR se țin. Până atunci aplicația ținea 6 luni pentru toată lumea (o politică
// TimescaleDB de 180 de zile sau `POSITION_RETENTION_DAYS`), iar 24/36 de luni se vindeau, se semnau
// și nu se livrau, nici nu se facturau.
//
// Proba ține legate cele patru locuri care spun aceeași cifră: regula (contracts.js), ecranul de
// ofertă, hârtiile (oferta și contractul) și ștergerea automată — aceasta încercată pe server pornit,
// cu istoric vechi de 1, 7, 13, 25 și 37 de luni la mașini din firme cu reguli diferite.

const fs = require('fs');
const { spawn } = require('child_process');
const C = require('./contracts.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const dbSrc = fs.readFileSync('./db.js', 'utf8');
const PD = fs.readFileSync('./report_export.js', 'utf8');
const fara = (s) => s.replace(/^\s*\/\/.*$/gm, '');   // o probă se uită la COD, nu la comentarii

sect('1. Regula stă într-un singur loc: contracts.js');
T('12 luni incluse pentru toți', C.LUNI_ISTORIC_INCLUSE === 12);
T('cel mult 60 de luni (o greșeală de tastare nu ține date 30 de ani)', C.LUNI_ISTORIC_MAX === 60);
const pf = C.pastrareFirma;
T('firmă fără nimic scris → cele 12 incluse, fără bani', JSON.stringify(pf({})) === JSON.stringify({ luni: 12, pretRON: 0, platita: false }));
T('fără setări deloc → tot 12', pf(null).luni === 12 && pf(undefined).luni === 12);
T('24 de luni plătite, cu prețul lor', pf({ pastrare: { luni: 24, pretRON: 50 } }).luni === 24 && pf({ pastrare: { luni: 24, pretRON: 50 } }).pretRON === 50 && pf({ pastrare: { luni: 24, pretRON: 50 } }).platita);
T('setările ca text JSON se citesc la fel', pf(JSON.stringify({ pastrare: { luni: 36, pretRON: 100 } })).luni === 36);
T('setări STRICATE → null (ștergerea sare peste firmă, nu o coboară la 12)', pf('{nu e json') === null);
T('mai puțin de 12 (o ofertă veche de 6) → urcă la cele 12 incluse', pf({ pastrare: { luni: 6 } }).luni === 12 && !pf({ pastrare: { luni: 6 } }).platita);
T('peste plafon → 60', pf({ pastrare: { luni: 999 } }).luni === 60);
const cp = C.curataPastrare;
T('ce se scrie: null = înapoi la cele incluse', cp(null) === null && cp({ luni: 12 }) === null && cp({ luni: 8 }) === null);
T('ce se scrie: 24 de luni, prețul rotunjit la bani', JSON.stringify(cp({ luni: '24', pretRON: '49.999' })) === JSON.stringify({ luni: 24, pretRON: 50 }));
T('un număr stricat NU se ghicește (undefined → cererea se refuză)', cp({ luni: 'x' }) === undefined && cp({ luni: 999 }) === undefined && cp('24') === undefined);
T('anexa semnată ține câte luni s-au cumpărat', C.facAnexa([], { monthlyTotal: 10, pastrareLuni: 24 }).pastrareLuni === 24);
T('...dar nu și cele 12 incluse (nu e nimic de semnat în plus)', C.facAnexa([], { monthlyTotal: 10, pastrareLuni: 12 }).pastrareLuni === undefined);
T('„Salvează anexa" nu pierde lunile semnate', C.dinAnexaDePastrat({ pastrareLuni: 36, servicii: [] }).pastrareLuni === 36);

sect('2. Ecranul de ofertă spune aceleași cifre ca serverul');
const incEcran = parseInt((html.match(/var _OF_LUNI_INCLUSE = (\d+), _OF_LUNI_MAX = (\d+);/) || [])[1], 10);
const maxEcran = parseInt((html.match(/var _OF_LUNI_INCLUSE = (\d+), _OF_LUNI_MAX = (\d+);/) || [])[2], 10);
T('cele incluse, în pagină = pe server', incEcran === C.LUNI_ISTORIC_INCLUSE, incEcran + ' vs ' + C.LUNI_ISTORIC_INCLUSE);
T('plafonul, în pagină = pe server', maxEcran === C.LUNI_ISTORIC_MAX, maxEcran + ' vs ' + C.LUNI_ISTORIC_MAX);
T('oferta pornește pe „12 luni (incluse)", nu pe 6', /<option value="12">12 luni \(incluse\)<\/option>/.test(html) && !/6 luni \(inclus\)/.test(fara(html)));
T('și nicio ofertă nouă nu se mai naște pe 6', !/retTier: '6'/.test(html) && !/g\('of-ret'\) \|\| '6'/.test(html));
T('12 luni n-au câmp de preț (sunt incluse)', !/'of-ret12'|'of-ret6'/.test(html) && !/\bret6:|\bret12:/.test(html));
T('nici în lista „Prețurile noastre" de pe server', !/'ret6'|'ret12'/.test(fara(server.slice(server.indexOf('const TARIF_CHEI'), server.indexOf('const TARIF_CHEI') + 600))));

// Socoteala, rulată pe cod ADEVĂRAT (decupat din pagină), cu un document de carton.
function decupez(nume) {
  const a = html.indexOf('// ── începe „' + nume + '"'), b = html.indexOf('// ── sfârșit „' + nume + '" ──');
  if (a < 0 || b < 0) { console.log('✗ nu găsesc blocul „' + nume + '"'); process.exit(1); }
  return html.slice(a, b);
}
const _rDe = new Function(html.slice(html.indexOf('function _rDe(n)'), html.indexOf('// Aceleași sume, dar pentru celule de tabel:')) + '\n; return _rDe;')();
const _raxDe = (n) => ' ' + _rDe(n);
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate', '_fxDate', '_fxSursa', '_rDe', '_aiqFond', '_raxDe',
  decupez('Calculatorul de ofertă') + '\n; return { _ofCalc: _ofCalc, _ofRetLuni: _ofRetLuni, _ofRetLabel: _ofRetLabel };');
function oferta(ret, lunialt) {
  const val = { 'of-nveh': 10, 'of-ncan': 0, 'of-nfms': 0, 'of-agenti': true, 'of-ret': ret, 'of-retcustom-m': lunialt || 0, 'of-contract': 12 };
  const doc = { getElementById: (id) => (id in val) ? (typeof val[id] === 'boolean' ? { checked: val[id], value: '' } : { value: String(val[id]) }) : null };
  return CALC(doc, {}, () => {}, 5.0, null, null, _rDe, () => 0, _raxDe)._ofCalc();
}
const retDin = (r) => r.lines.filter((l) => l.fel === 'ret')[0];
const o12 = oferta('12'), o6 = oferta('6'), o24 = oferta('24'), o36 = oferta('36'), oAlt = oferta('custom', 18), oMic = oferta('custom', 8), oMare = oferta('custom', 999);
T('12 luni: niciun rând de plată', !retDin(o12));
T('o ofertă veche pe 6 luni se socotește pe cele 12 incluse, fără bani', !retDin(o6));
T('24 de luni: rândul de plată, cu prețul de listă (50)', !!retDin(o24) && retDin(o24).total === 50 && retDin(o24).label === 'Păstrare date 24 de luni', JSON.stringify(retDin(o24)));
T('...și cu LUNILE pe rând (merg la contract și pe firmă)', !!retDin(o24) && retDin(o24).luni === 24);
T('36 de luni: 100 de lei', !!retDin(o36) && retDin(o36).total === 100 && retDin(o36).luni === 36);
T('alt număr (18): rândul lui, „18 luni"', CALC({ getElementById: () => null }, {}, () => {}, 5, null, null, _rDe, () => 0, _raxDe)._ofRetLabel({ retTier: 'custom', retCustomMonths: 18 }) === '18 luni');
T('alt număr sub 12 → cele 12 incluse, fără bani', !retDin(oMic));
T('alt număr uriaș → plafonul', CALC({ getElementById: () => null }, {}, () => {}, 5, null, null, _rDe, () => 0, _raxDe)._ofRetLuni({ retTier: 'custom', retCustomMonths: 999 }) === 60);
T('prețul lunar crește exact cu prețul păstrării', Math.abs((o24.monthly - o12.monthly) - 50) < 0.001 && !retDin(oAlt) === (Number(oAlt.p.retCustom) > 0 ? false : true));
T('„Client nou din ofertă" duce lunile mai departe', /inclus: !!l\.inclus, luni: l\.luni \|\| null/.test(html));

sect('3. Hârtia ofertei spune mereu cât se păstrează');
const incluse = new Function('require', 'contracte',
  PD.slice(PD.indexOf('function _ofDe(n)'), PD.indexOf('// ─── Hârtia ───')) + '\n; return _ofIncluse;')(require, C);
const cu = (o) => incluse(Object.assign({}, o)).filter((r) => /^Păstrarea istoricului/.test(r))[0];
T('ofertă fără cifră (ecran vechi) → „12 luni", nu tace', cu({}) === 'Păstrarea istoricului: 12 luni de la înregistrare', cu({}));
T('ofertă de 24 de luni → „24 de luni"', cu({ retentie: '24 de luni' }) === 'Păstrarea istoricului: 24 de luni de la înregistrare');
T('rândul vine imediat după istoricul deplasărilor', (function () { const L = incluse({}); return L.indexOf(cu({})) === L.findIndex((r) => /^Istoricul deplasărilor/.test(r)) + 1; })());
T('nu mai există rândul vechi, condiționat', !/Păstrarea datelor istorice timp de/.test(PD));

sect('4. Contractul spune câte luni — aceeași cifră după care se șterge');
const CP = require('./contract_pdf');
function contractText(firmaSettings, annexExtra) {
  const texte = [];
  const A4 = { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } };
  const doc = {
    page: A4, x: 50, y: 50, _pagini: 1,
    font() { return this; }, fontSize() { return this; }, fillColor() { return this; }, strokeColor() { return this; },
    lineWidth() { return this; }, moveTo() { return this; }, lineTo() { return this; }, stroke() { return this; }, image() { return this; },
    widthOfString(s) { return String(s == null ? '' : s).length * 4.6; },
    addPage() { this._pagini++; this.y = 50; return this; }, moveDown(n) { this.y += 12 * (n == null ? 1 : n); return this; },
    text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') this.y = y + 11; else this.y += 11; return this; }
  };
  const start = Date.parse('2026-09-15T00:00:00Z');
  CP.scrieContract(doc, {
    contract: { number: 'RAT-C-2026-0100', status: 'aprobat', signed_at: start, start_at: start, months: 12, notice_days: 30, gdpr: { kind: 'anexa' },
      annex: Object.assign(C.facAnexa([], { monthlyTotal: 100 }), annexExtra || {}) },
    firma: { name: 'Transport Probă SRL', settings: firmaSettings }, emitent: { name: 'RA TRACKS SRL', vat_rate: 19 }
  });
  return texte.join(' ');
}
T('fără nimic cumpărat: „12 luni"', /istoricul vehiculelor \(pozițiile, cursele și alertele\) se păstrează 12 luni de la înregistrare, apoi se șterge automat/.test(contractText({})));
T('firma cu 24 de luni: „24 de luni"', /se păstrează 24 de luni de la înregistrare/.test(contractText({ pastrare: { luni: 24, pretRON: 50 } })));
T('anexa semnată bate setarea de azi (36 semnate, 24 pe firmă → „36 de luni")', /se păstrează 36 de luni de la înregistrare/.test(contractText({ pastrare: { luni: 24, pretRON: 50 } }, { pastrareLuni: 36 })));
T('și acordul GDPR spune aceeași durată', /Durata: pe toată durata contractului; istoricul se păstrează 24 de luni/.test(contractText({ pastrare: { luni: 24 } })));

sect('5. Ștergerea: după firmă, fără politica veche de 180 de zile');
const tsBloc = fara(dbSrc.slice(dbSrc.indexOf("CREATE EXTENSION IF NOT EXISTS timescaledb"), dbSrc.indexOf("_timescale = { attempted: true, enabled: false")));
T('politica TimescaleDB veche se SCOATE la pornire', /remove_retention_policy\('positions', if_exists => TRUE\)/.test(tsBloc));
T('și nu se mai pune alta (o singură vârstă pentru toți)', !/add_retention_policy/.test(fara(dbSrc)));
T('dacă nu se poate scoate, se spune pe ecran (roșu), nu tace', /politicaVeche/.test(tsBloc) && /ts\.politicaVeche\) \? 'crit'/.test(server));
T('POSITION_RETENTION_DAYS nu mai hotărăște nimic', !/parseInt\(process\.env\.POSITION_RETENTION_DAYS\)/.test(fara(server)) && !/POSITION_RETENTION_DAYS/.test(fara(dbSrc)));
T('...dar dacă a rămas setată, „Stare producție" o arată', /isSet\(process\.env\.POSITION_RETENTION_DAYS\)/.test(server));
T('ștergerea rulează MEREU (nu doar cu o variabilă setată)', /const runPastrare = \(\) => stergeIstoriculVechi\(\)/.test(server) && /setInterval\(runPastrare, 6 \* 60 \* 60 \* 1000\)/.test(server));
const fnSterg = dbSrc.slice(dbSrc.indexOf('async function stergeIstoricMaiVechiDe('), dbSrc.indexOf('async function scoateBucatiMaiVechiDe('));
T('mașină cu mașină, după IMEI (coloana după care se comprimă)', /WHERE imei = \$1 AND timestamp </.test(fnSterg));
T('pe loturi după TIMP, nu după ctid (pe hypertable ctid nu e unic)', !/ctid/.test(fara(fnSterg)));
T('și curse, și alerte, cu același prag', /DELETE FROM trips WHERE imei = \$1 AND start_time </.test(fnSterg) && /DELETE FROM alert_history WHERE imei = \$1 AND triggered_at </.test(fnSterg));
const fnDel = dbSrc.slice(dbSrc.indexOf('async function deleteDeviceCompletely('), dbSrc.indexOf('// Coloane editabile din fișa vehiculului'));
T('„Șterge definitiv" un aparat nu mai atinge pozițiile ALTOR mașini (fără ctid)', !/ctid/.test(fara(fnDel)) && /_stergeImeiPeLoturi\(t, imei\)/.test(fnDel));
const fnJob = server.slice(server.indexOf('async function stergeIstoriculVechi('), server.indexOf("app.post('/api/admin/istoric/sterge-vechi'"));
T('setări stricate → firma e SĂRITĂ, nu coborâtă la 12', /if \(!p\) \{ raport\.sarite\+\+/.test(fnJob));
T('bucățile întregi se scot doar după o trecere completă', /if \(!raport\.epuizat && raport\.aparate\)/.test(fnJob));
T('ștergerea lasă urmă în jurnalul de audit', /entity: 'istoric_vechi'/.test(fnJob));

sect('6. Pe firmă și pe factură');
T('păstrarea se scrie doar de super-admin (ca RA Insight)', /if \(body\.pastrare !== undefined && opts && opts\.allowFeatures\)/.test(server));
T('o coborâre se scrie în audit de la cât la cât', /det\.pastrare = \{ de: pastrareInainte/.test(server));
T('oferta acceptată o scrie singură pe firmă', /const pastrare = _pastrareDinOferta\(oferta, dinOferta\);/.test(server) && /if \(pastrare\) patch\.pastrare = pastrare;/.test(server));
T('...și în anexa contractului', /pastrareLuni: \(_pastrareDinOferta\(oferta, dinOferta\) \|\| \{\}\)\.luni \|\| null/.test(server));
T('ecranul cere confirmare la o coborâre (șterge date)', /if \(luni < inainte\.luni\) \{/.test(html) && /okLabel: 'Scad și șterg'/.test(html));
T('contractul și factura se compară și la păstrare', /var ps = cmp\.pastrare;/.test(html) && /pastrare: \(retContract\.length/.test(server));
T('păstrarea NU mai apare ca „în contract, dar nu pe factură"', /x\.fel !== 'ai' && x\.fel !== 'ret'/.test(server));

// ─── 7. Pe server pornit ─────────────────────────────────────────────────────────────────────
// Variabila veche e SETATĂ la 180, dinadins: istoricul de 7 luni trebuie să rămână (12 luni incluse),
// iar „Stare producție" trebuie să spună că variabila nu mai e folosită.
const PORT = 3224, DIR = '.pastrare-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', STRICT_DEVICES: 'false',
  SESSION_SECRET: 'ci_past', PORT: String(PORT), TCP_PORT: '5224', PGLITE_DIR: DIR + '/pgdata', POSITION_RETENTION_DAYS: '180' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('7. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };

  // Trei firme: una pe cele 12 incluse, una cu 24 de luni, una cu 36. Plus un aparat fără firmă.
  const fA = (await R('POST', '/api/companies', { name: 'Păstrare 12 SRL' })).j;
  const fB = (await R('POST', '/api/companies', { name: 'Păstrare 24 SRL' })).j;
  const fC = (await R('POST', '/api/companies', { name: 'Păstrare 36 SRL' })).j;
  T('regula se refuză dacă nu e un număr de luni', (await R('PUT', '/api/companies/' + fB.id + '/settings', { pastrare: { luni: 'x' } })).s === 400);
  T('...sau dacă trece de plafon', (await R('PUT', '/api/companies/' + fB.id + '/settings', { pastrare: { luni: 999 } })).s === 400);
  const sB = await R('PUT', '/api/companies/' + fB.id + '/settings', { pastrare: { luni: 24, pretRON: 50 } });
  T('24 de luni, 50 lei, se scriu pe firmă', sB.s === 200 && sB.j.pastrare && sB.j.pastrare.luni === 24 && sB.j.pastrare.pretRON === 50, JSON.stringify(sB.j));
  await R('PUT', '/api/companies/' + fC.id + '/settings', { pastrare: { luni: 36, pretRON: 100 } });
  const ovB = (await R('GET', '/api/companies/' + fB.id + '/overview')).j || {};
  T('fișa firmei arată regula și cifrele ei (de la server)', ovB.pastrare && ovB.pastrare.luni === 24 && ovB.pastrare_regula && ovB.pastrare_regula.incluse === 12 && ovB.pastrare_regula.max === 60);

  const imei = { A: '869100000000001', B: '869100000000002', C: '869100000000003', U: '869100000000004' };
  await R('POST', '/api/devices', { imei: imei.A, name: 'A1', company_id: fA.id });
  await R('POST', '/api/devices', { imei: imei.B, name: 'B1', company_id: fB.id });
  await R('POST', '/api/devices', { imei: imei.C, name: 'C1', company_id: fC.id });
  await R('POST', '/api/devices', { imei: imei.U, name: 'U1' });
  // Istoric de acum 1, 7, 13, 25 și 37 de luni: câte 20 de poziții, o cursă și o alertă fiecare.
  for (const k of Object.keys(imei)) for (const luni of [1, 7, 13, 25, 37]) await R('POST', '/api/test/istoric-vechi', { imei: imei[k], luni: luni, n: 20 });
  const nr = async (k) => (await R('POST', '/api/test/istoric-numar', { imei: imei[k] })).j || {};
  T('istoricul de probă e pus (5 vârste × 20 de poziții)', (await nr('A')).pozitii === 100, JSON.stringify(await nr('A')));

  const rap = (await R('POST', '/api/admin/istoric/sterge-vechi')).j || {};
  const a = await nr('A'), b = await nr('B'), c = await nr('C'), u = await nr('U');
  T('firma pe 12 luni: rămân doar 1 și 7 luni (40 de poziții, 2 curse, 2 alerte)', a.pozitii === 40 && a.curse === 2 && a.alerte === 2, JSON.stringify(a));
  T('...deci POSITION_RETENTION_DAYS=180 NU a mai șters cele de 7 luni', a.pozitii >= 40);
  T('firma cu 24 de luni: rămâne și anul trecut (13 luni)', b.pozitii === 60 && b.curse === 3 && b.alerte === 3, JSON.stringify(b));
  T('firma cu 36 de luni: rămân și 25 de luni', c.pozitii === 80 && c.curse === 4 && c.alerte === 4, JSON.stringify(c));
  T('aparatul fără firmă: cele 12 incluse', u.pozitii === 40, JSON.stringify(u));
  T('raportul numără exact ce s-a șters', rap.pozitii === 60 + 40 + 20 + 60 && rap.curse === 9 && rap.alerte === 9, JSON.stringify(rap));
  T('...și știe câte firme plătesc mai mult și cea mai lungă păstrare', rap.firmePlatite === 2 && rap.maxLuni === 36, rap.firmePlatite + ' / ' + rap.maxLuni);
  T('a doua rulare nu mai are ce șterge', ((await R('POST', '/api/admin/istoric/sterge-vechi')).j || {}).pozitii === 0);

  // Coborâre: firma B trece înapoi pe cele 12 incluse → anul ei trecut se șterge la rularea următoare.
  const jos = await R('PUT', '/api/companies/' + fB.id + '/settings', { pastrare: null });
  T('înapoi pe cele 12 incluse', jos.s === 200 && jos.j.pastrare.luni === 12 && jos.j.pastrare.platita === false);
  await R('POST', '/api/admin/istoric/sterge-vechi');
  T('...iar istoricul de 13 luni al firmei se șterge', (await nr('B')).pozitii === 40);
  T('firma cu 36 de luni nu e atinsă de coborârea alteia', (await nr('C')).pozitii === 80);

  // Factura: C are 36 de luni la 100 de lei → rândul ei.
  const dr = (await R('POST', '/api/invoices/draft', { companyId: fC.id })).j || {};
  const rP = (dr.lines || []).filter((l) => /^Păstrarea istoricului/.test(l.desc))[0];
  T('pe factură: „Păstrarea istoricului — 36 de luni", 100 de lei', !!rP && rP.desc === 'Păstrarea istoricului — 36 de luni' && rP.net === 100, JSON.stringify(dr.lines));
  const drA = (await R('POST', '/api/invoices/draft', { companyId: fA.id })).j || {};
  T('firma pe cele 12 incluse n-are rând de păstrare', !(drA.lines || []).some((l) => /^Păstrarea istoricului/.test(l.desc)));

  // Oferta de 24 de luni → firmă + contract: se scriu singure, fără retastare.
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă 24', client_name: 'Din Ofertă SRL', monthly_total: 340, currency: 'RON',
    config: { cfg: { nVeh: 10, retTier: '24', contractMonths: 24, montaj: {}, devices: {} }, prices: { pPlain: 29, ret24: 50 } } })).j;
  const fD = (await R('POST', '/api/companies', { name: 'Din Ofertă SRL' })).j;
  const cD = await R('POST', '/api/companies/' + fD.id + '/contract', { offer_id: of.id, months: 24,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 },
      vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 10, pret: 29, total: 290 }],
      servicii: [{ fel: 'ret', luni: 24, nume: 'Păstrare date 24 de luni', cant: 1, pret: 50, total: 50 }] } });
  T('contractul din ofertă ține cele 24 de luni în anexă', cD.s === 200 && cD.j.annex && cD.j.annex.pastrareLuni === 24, cD.s + ' ' + JSON.stringify(cD.j && cD.j.annex));
  const ovD = (await R('GET', '/api/companies/' + fD.id + '/overview')).j || {};
  T('...și firma le primește singură, cu prețul din ofertă', ovD.pastrare && ovD.pastrare.luni === 24 && ovD.pastrare.pretRON === 50, JSON.stringify(ovD.pastrare));
  T('contract, firmă și factură spun același lucru', ovD.comparatie && ovD.comparatie.pastrare && ovD.comparatie.pastrare.contractLuni === 24 &&
    ovD.comparatie.pastrare.firmaLuni === 24 && ovD.comparatie.pastrare.facturaLei === 50 && ovD.comparatie.pastrare.contractLei === 50,
    JSON.stringify(ovD.comparatie && ovD.comparatie.pastrare));
  T('păstrarea nu mai stă la „nefacturate"', ovD.comparatie && !(ovD.comparatie.nefacturate || []).some((x) => /Păstrare/.test(x.nume)));

  // Stare producție
  const h = (await R('GET', '/api/admin/health')).j || {};
  const rd = (h.checks || []).filter((x) => x.key === 'retention')[0];
  T('„Stare producție" spune regula și ultima rulare', !!rd && /12 luni pentru toți, incluse/.test(rd.detail) && /ultima rulare acum/.test(rd.detail), rd && rd.detail);
  const re = (h.checks || []).filter((x) => x.key === 'retention_env')[0];
  T('...și că POSITION_RETENTION_DAYS a rămas degeaba (portocaliu)', !!re && re.level === 'warn' && /nu mai e folosită/.test(re.detail));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
