// verify_oferta_telefon.js — calculatorul de ofertă de pe telefon socotește cu pagina web, pe server.
//
//   node verify_oferta_telefon.js
//
// Lotul 2b (24.09): „Ofertare Live" ajunge pe telefon. Regula casei: nicio regulă de bani scrisă a doua
// oară. Așa că telefonul NU are socoteala lui — trimite câmpurile la `POST /api/admin/offers/calc`, iar
// serverul rulează chiar bucățile din public/index.html (calculatorul, grila RA Insight, formularul,
// rezumatul, plicul hârtiei) pe un DOM de carton.
//
// Proba pornește serverul adevărat (PGlite, NODE_ENV=test, fără rețea) și verifică:
//   1. ruta întoarce EXACT ce întoarce blocul web rulat direct (ca în verify_tarife.js), pentru mai
//      multe oferte: rândurile, totalurile, plicul PDF-ului, corpul salvării;
//   2. completarea automată merge ca pe web: cantitățile din flotă, prețul contului RA Insight din grilă,
//      numele ofertei, fraza cu valabilitatea — și NU atinge ce a scris omul;
//   3. poarta: aplicația veche (1.0.1/1.0.2, fără antet) tot nu scrie oferte — cu același mesaj;
//      aplicația 1.0.3 scrie; web-ul (cookie) e neschimbat;
//   4. o ofertă salvată se redeschide cu prețurile negociate „scrise de mână", iar hârtia ei, contractul
//      făcut din ea și „Prețurile noastre" vin tot din pagină;
//   5. ruta e doar a noastră (un administrator de firmă primește 403);
//   6. (revizia din 24.09) modulele vândute se redeschid bifate, „Aplică prețul propus" pune prețul unui
//      cont, numele ofertei poartă data României, iar un „preț" text din bază nu ajunge să ruleze pe server.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { puneParola } = require('./test_parola');

const PORT = 3263, TCP = 5263; // proprii
const DIR = path.join(os.tmpdir(), 'rax_oferta_tel_' + Date.now());
const PRELOAD = DIR + '_fararetea.js';
const B = 'http://127.0.0.1:' + PORT;

// Fără internet: BNR-ul nu se cere de-adevăratelea (cursul îl punem noi, ca sumele să fie previzibile).
fs.writeFileSync(PRELOAD, [
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));

const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_oferta_tel', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
});
delete env.DATABASE_URL;
delete env.ANTHROPIC_API_KEY;
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() {
  try { fs.rmSync(PRELOAD, { force: true }); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
function gata(code) {
  terminat = true;
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { curata(); process.exit(code); }, 800);
}
async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function loginTelefon(u, p) {
  const r = await fetch(B + '/api/mobile/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p, device: 'proba' }) });
  const j = await r.json().catch(() => ({}));
  return j.token ? { token: j.token } : null;
}
// `cine` = cookie de web (string), { token } = telefonul vechi, { token, app } = telefonul cu antetul X-RA-App.
function cerere(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (typeof cine === 'string') h.Cookie = cine;
  else if (cine && cine.cookie) h.Cookie = cine.cookie;
  else if (cine && cine.token) h.Authorization = 'Bearer ' + cine.token;
  if (cine && cine.app) h['X-RA-App'] = cine.app;
  return fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
}
async function json(m, u, cine, body) {
  const r = await cerere(m, u, cine, body);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text, antet: r.headers };
}
const lista = (x) => (Array.isArray(x) ? x : []);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Prima diferență dintre două obiecte, ca mesajul să spună UNDE s-au despărțit.
function diferenta(a, b, cale) {
  cale = cale || '';
  if (egal(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const chei = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    for (const k of chei) { const d = diferenta(a[k], b[k], cale + '.' + k); if (d) return d; }
  }
  return cale + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
}

// ─── Blocul web, rulat DIRECT (fără server), ca în verify_tarife.js ─────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
function decupez(nume) {
  const a = HTML.indexOf('// ── începe „' + nume + '"'), b = HTML.indexOf('// ── sfârșit „' + nume + '" ──');
  if (a < 0 || b < 0) { console.log('✗ nu găsesc blocul „' + nume + '" în index.html'); process.exit(1); }
  return HTML.slice(a, b);
}
function bucata(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b, i + 1);
  if (i < 0 || j < 0) { console.log('✗ nu găsesc în index.html: ' + a); process.exit(1); }
  return HTML.slice(i, j);
}
const M = new Function('document', '_ofN', '_ofPropune', '_ofAtinse', 'raxOfRecalc', '_lei2eur',
  decupez('Tarife după mărimea flotei') + '\n; return { _aiqPretLoc, _aiqFond, _aiqAplicaLista };')(
  { getElementById: () => null }, (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
  () => {}, {}, () => {}, (v) => v / 5);
const _rDe = new Function(bucata('function _rDe(n)', '// Aceleași sume, dar pentru celule de tabel:') + '\n; return _rDe;')();
const _raxDe = new Function('_rDe', bucata('function _raxDe(n) {', '\n') + '\n; return _raxDe;')(_rDe);
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate', '_fxDate', '_fxSursa', '_rDe', '_raxDe', '_aiqFond',
  decupez('Calculatorul de ofertă') + '\n;' + decupez('Oferta pe hârtie') + '\n;'
  + bucata('function _coSocotealaOfertei(o)', '// Durata în lista de alegere:')
  + '\n; return { _ofCalc: _ofCalc, _ofPayload: _ofPayload, _coSocotealaOfertei: _coSocotealaOfertei };');
let FX = { eur: 5, date: '', sursa: '' };
function calculator(campuri) {
  const val = Object.assign({}, campuri);
  const doc = {
    getElementById: (id) => {
      if (!(id in val)) return null;
      const v = val[id];
      return (typeof v === 'boolean') ? { type: 'checkbox', checked: v, value: '' } : { value: String(v) };
    },
  };
  return CALC(doc, {}, () => {}, FX.eur, FX.date, FX.sursa, _rDe, _raxDe, M._aiqFond);
}
// Aceeași flotă ca în verify_tarife.js; telefonul trimite aceleași câmpuri, fără prefixul „of-".
function flota(peste) {
  return Object.assign({
    'of-cl-name': 'Transport Zebra SRL', 'of-cl-cui': 'RO123', 'of-cl-contact': 'ion@zebra.ro', 'of-name': 'Ofertă Zebra',
    'of-nveh': 20, 'of-ncan': 20, 'of-nfms': 0,
    'of-aiA': false, 'of-tahograf': false, 'of-etransport': false, 'of-agenti': true,
    // `of-pAiA` e mereu în formularul web (umplut din grilă): `cfg.aiqSeat` se citește din el chiar și
    // cu RA Insight oprit. Fără el aici, blocul direct ar citi 0, iar pagina (și ruta) 14.
    'of-pAiA': 14, 'of-aiqN': 100, 'of-aiqSeats': 1, 'of-ret': '12', 'of-retcustom-m': 0, 'of-contract': 12, 'of-notes': 'Ofertă valabilă 30 de zile de la trimitere.',
    'of-qGps': 0, 'of-qLvCan': 0, 'of-qCanInc': 0, 'of-qFms': 0, 'of-qUninstall': 0, 'of-qReplace': 0, 'of-kmTravel': 0,
    'of-dq130': 0, 'of-dq150': 0, 'of-dq650': 0, 'of-dqLvCan': 0,
  }, peste || {});
}
const faraPrefix = (o) => { const x = {}; Object.keys(o).forEach((k) => { x[k.replace(/^of-/, '')] = o[k]; }); return x; };

(async () => {
  let pornit = false;
  for (let i = 0; i < 480 && !pornit; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {}
    if (!pornit) await sleep(500);
  }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }

  const S = await login('admin', 'test1234');
  const tel = await loginTelefon('admin', 'test1234');
  if (!S || !tel) { console.log('nu m-am putut autentifica ca super-admin (web + telefon)'); return gata(1); }
  const telNou = { token: tel.token, app: '1.0.3' };
  const telVechi = { token: tel.token };          // 1.0.1 / 1.0.2: fără antet
  const tel102 = { token: tel.token, app: '1.0.2' };

  // Cursul îl punem noi: sumele în euro și data de pe hârtie devin previzibile.
  const curs = await json('PUT', '/api/admin/system-settings', S, { curs_eur: 5.1 });
  T('cursul nostru se pune (5,1)', curs.status === 200 && curs.j.settings && curs.j.settings.curs_eur === 5.1, curs.text.slice(0, 120));

  sect('1. Ruta socotește EXACT ca pagina web');
  const nou = await json('POST', '/api/admin/offers/calc', telNou, { nou: true });
  T('„Ofertă nouă" răspunde', nou.status === 200 && !!nou.j.r && !!nou.j.campuri, nou.status + ' ' + nou.text.slice(0, 160));
  T('cursul e cel pus de noi, cu sursa lui', nou.j.fx && nou.j.fx.eur === 5.1 && nou.j.fx.sursa === 'manual' && /^\d\d\.\d\d\.\d{4}$/.test(nou.j.fx.date || ''), JSON.stringify(nou.j.fx));
  T('ruta își spune versiunea calculatorului', /^[0-9a-f]{10}$/.test(nou.j.calcVer || ''), nou.j.calcVer);
  FX = { eur: nou.j.fx.eur, date: nou.j.fx.date, sursa: nou.j.fx.sursa };

  const oferte = [
    ['o flotă obișnuită (20 cu CAN)', flota()],
    ['cu tahograf și e-Transport', flota({ 'of-tahograf': true, 'of-etransport': true })],
    ['camioane + RA Insight 3 conturi + păstrare 24 luni + 24 de luni', flota({ 'of-nveh': 20, 'of-ncan': 12, 'of-nfms': 8, 'of-tahograf': true, 'of-aiA': true, 'of-aiqSeats': 3, 'of-pAiA': 17, 'of-ret': '24', 'of-contract': 24 })],
    ['nelimitat + montaj + aparate + păstrare custom + preț cu bani', flota({ 'of-aiA': true, 'of-aiqN': 0, 'of-qGps': 20, 'of-qLvCan': 20, 'of-kmTravel': 150, 'of-dq650': 20, 'of-dqLvCan': 20, 'of-ret': 'custom', 'of-retcustom-m': 18, 'of-retCustom': 30, 'of-pPlain': 31.5, 'of-mGps': 112.5 })],
    ['flotă mică, doar GPS, FMC130', flota({ 'of-nveh': 3, 'of-ncan': 0, 'of-qGps': 3, 'of-dq130': 3, 'of-dFmc130': 49.9, 'of-agenti': false, 'of-contract': 36 })],
  ];
  let primaSalvare = null;
  const salvari = {};   // corpul salvării fiecărei oferte, ca să le putem redeschide mai jos
  for (const [nume, f] of oferte) {
    const direct = calculator(f);
    const rDirect = JSON.parse(JSON.stringify(direct._ofCalc()));
    const hDirect = JSON.parse(JSON.stringify(direct._ofPayload(direct._ofCalc())));
    const rt = await json('POST', '/api/admin/offers/calc', telNou, { campuri: faraPrefix(f), atinse: [], schimbate: [] });
    T(nume + ': aceleași rânduri și sume ca pagina', rt.status === 200 && egal(rt.j.r, rDirect), rt.status === 200 ? diferenta(rt.j.r, rDirect) : rt.text.slice(0, 160));
    T(nume + ': același plic pentru PDF', egal(rt.j.hartie, hDirect), diferenta(rt.j.hartie, hDirect));
    const s = rt.j.salvare || {};
    const c = s.corp || {};
    const once = Math.round(((rDirect.montaj || 0) + (rDirect.hwTotal || 0) * FX.eur) * 100) / 100;
    T(nume + ': salvarea duce sumele socotite (lunar ' + rDirect.monthly + ', la început ' + once + ')',
      s.metoda === 'POST' && s.url === '/api/admin/offers' && c.monthly_total === rDirect.monthly && c.once_total === once
        && egal(c.config && c.config.cfg, rDirect.cfg) && egal(c.config && c.config.prices, rDirect.p) && c.currency === 'RON',
      JSON.stringify({ metoda: s.metoda, url: s.url, lunar: c.monthly_total, once: c.once_total }));
    if (!primaSalvare) primaSalvare = { corp: c, r: rDirect, hartie: rt.j.hartie };
    salvari[nume] = { corp: c, r: rDirect };
  }
  T('rezumatul vine din pagină (Total lunar, Cum se plătește, Ce rămâne la noi, cursul)',
    /Total lunar/.test(nou.j.html.rezumat) && /Cum se plătește/.test(nou.j.html.rezumat) && /Ce rămâne la noi/.test(nou.j.html.rezumat) && /Cursul tău: 1 € = 5,1000 lei/.test(nou.j.html.rezumat),
    nou.j.html.rezumat.slice(0, 120));
  T('fără onclick-uri și fără iconițe Font Awesome în HTML-ul trimis telefonului',
    !/onclick=|href=|class="fas /.test(JSON.stringify(nou.j.html)) && /data-act="preturi"/.test(nou.j.html.rezumat));
  T('opțiunile listelor vin din formularul web (pachetele RA Insight, păstrarea datelor)',
    egal((nou.j.formular.find((x) => x.k === 'aiqN') || {}).optiuni, [{ v: '50', et: '50 / lună' }, { v: '100', et: '100 / lună' }, { v: '150', et: '150 / lună' }, { v: '200', et: '200 / lună' }, { v: '0', et: 'nelimitat' }])
      // păstrarea: 12 luni (incluse), 24, 36, alt număr — fără „6 luni" (24.09)
      && egal(((nou.j.formular.find((x) => x.k === 'ret') || {}).optiuni || []).map((o) => o.v), ['12', '24', '36', 'custom']),
    JSON.stringify((nou.j.formular.find((x) => x.k === 'aiqN') || {}).optiuni));
  T('câmpurile de preț primesc zecimale (pasul web 0,01), iar cele atinse de mână se știu',
    (nou.j.formular.find((x) => x.k === 'pPlain') || {}).pas === '0.01' && (nou.j.formular.find((x) => x.k === 'qGps') || {}).atinge === true
      && (nou.j.formular.find((x) => x.k === 'nveh') || {}).atinge === false);
  const cuVirgula = await json('POST', '/api/admin/offers/calc', telNou, { campuri: { nveh: '5', pPlain: '12,5' }, atinse: [], schimbate: [] });
  T('un preț scris cu virgulă nu trece drept număr (ca în câmpul web de tip număr)', cuVirgula.j.campuri && cuVirgula.j.campuri.pPlain === '', cuVirgula.j.campuri && cuVirgula.j.campuri.pPlain);

  sect('2. Ce se completează singur — și ce nu');
  const c0 = nou.j.campuri;
  // 28.09 (Alin: „DA"): la mașini se propune FMC130 (cu LV-CAN200 la cele cu CAN); FMC650 doar la camioane.
  T('oferta nouă pornește cu 10 vehicule și propunerile din ele (10 × FMC130, niciun FMC650)', c0.nveh === '10' && c0.qGps === '10' && c0.dq130 === '10' && !Number(c0.dq650) && c0.qLvCan === '' && c0.pAiA === '14', JSON.stringify({ nveh: c0.nveh, qGps: c0.qGps, dq130: c0.dq130, dq650: c0.dq650, pAiA: c0.pAiA }));
  T('fraza cu valabilitatea se scrie singură, din termenul serverului', c0.notes === 'Ofertă valabilă 30 de zile de la trimitere.', c0.notes);
  T('„Salvează oferta" fără client și fără nume: mesajul paginii', nou.j.salvare === null && nou.j.salvareEroare === 'Pune un nume de client sau de ofertă', nou.j.salvareEroare);
  const ev = await json('POST', '/api/admin/offers/calc', telNou, {
    campuri: Object.assign({}, c0, { nveh: '20', ncan: '5', qGps: '3', 'cl-name': 'Zebra' }), atinse: [], schimbate: ['qGps', 'nveh', 'ncan', 'cl-name'] });
  const c1 = ev.j.campuri || {};
  T('mașinile schimbate completează cantitățile neatinse (LV-CAN 5, FMC130 20, LV-CAN200 5)', c1.qLvCan === '5' && c1.dq130 === '20' && !Number(c1.dq650) && c1.dqLvCan === '5', JSON.stringify({ qLvCan: c1.qLvCan, dq130: c1.dq130, dq650: c1.dq650, dqLvCan: c1.dqLvCan }));
  T('dar „Instalare GPS", scris de mână (3), rămâne 3', c1.qGps === '3' && lista(ev.j.atinse).includes('qGps'), c1.qGps + ' / ' + JSON.stringify(ev.j.atinse));
  T('prețul contului RA Insight urcă pe treapta flotei (20 de mașini → 17 lei)', c1.pAiA === '17', c1.pAiA);
  // Data de AZI la noi, nu a serverului (care merge pe UTC): între 00:00 și 03:00, ora României, ar fi ieșit ieri.
  const aziRo = new Date().toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
  T('numele ofertei se scrie din client și data de azi, după ora României', c1.name === 'Ofertă Zebra · ' + aziRo, c1.name + ' vs ' + aziRo);
  const ev2 = await json('POST', '/api/admin/offers/calc', telNou, { campuri: Object.assign({}, c1, { pAiA: '30', nveh: '60' }), atinse: lista(ev.j.atinse).concat(['pAiA']), schimbate: ['nveh'] });
  T('un preț RA Insight negociat nu mai e călcat de numărul de mașini', ev2.j.campuri.pAiA === '30' && ev2.j.campuri.dq130 === '60', ev2.j.campuri.pAiA + ' / ' + ev2.j.campuri.dq130);
  const ev3 = await json('POST', '/api/admin/offers/calc', telNou, { campuri: Object.assign({}, ev2.j.campuri, { aiA: true, aiqN: '50' }), atinse: ev2.j.atinse, schimbate: ['aiA', 'aiqN'] });
  T('alt pachet de întrebări = altă propunere de preț (ca pe web): 60 de mașini → 25 lei', ev3.j.campuri.pAiA === '25' && !lista(ev3.j.atinse).includes('pAiA'), ev3.j.campuri.pAiA + ' / ' + JSON.stringify(ev3.j.atinse));
  T('costul RA Insight și profitul vin din pagină, doar pentru noi', /Ne costă/.test(ev3.j.html.aiqCost) && /Profitul nostru/.test(ev3.j.html.aiqCost) && ev3.j.arata.aiq === true, ev3.j.html.aiqCost.slice(0, 120));
  T('și sub RA Insight scrie cât iese pe lună', /lei × 1 cont = /.test(ev3.j.html.aiA), ev3.j.html.aiA);
  const CTR = require('./contracts');
  const inch = await json('POST', '/api/admin/offers/calc', telNou, { campuri: Object.assign(faraPrefix(flota({ 'of-dq130': 20 })), { echipMod: 'inchiriaza', contract: '12' }), atinse: [], schimbate: ['echipMod'] });
  const ic = (inch.j && inch.j.campuri) || {};
  T('„Clientul închiriază": durata urcă la minimul închirierii, ca la apăsarea butonului pe web', inch.status === 200 && ic.echipMod === 'inchiriaza' && ic.contract === String(CTR.CHIRIE_LUNI_MIN) && inch.j.arata && inch.j.arata.inchiriere === true,
    inch.status + ' ' + JSON.stringify({ mod: ic.echipMod, contract: ic.contract, arata: inch.j.arata }));
  T('explicația închirierii vine din pagină, cu durata minimă', /Închiriere:/.test((inch.j.html && inch.j.html.chirieHint) || '') && new RegExp(CTR.CHIRIE_LUNI_MIN + ' de luni').test(inch.j.html.chirieHint), (inch.j.html && inch.j.html.chirieHint || '').slice(0, 120));
  T('fără costul aparatului, chiria nu se inventează: lângă ea scrie ce lipsește', ic.chFmc130 === '' && /trece cât ne costă/.test((inch.j.chcost && inch.j.chcost.chFmc130) || ''), JSON.stringify({ ch: ic.chFmc130, cost: inch.j.chcost && inch.j.chcost.chFmc130 }));
  const cump = await json('POST', '/api/admin/offers/calc', telNou, { campuri: Object.assign({}, ic, { echipMod: 'cumpara' }), atinse: inch.j.atinse, schimbate: ['echipMod'] });
  T('și înapoi la „Clientul cumpără"', cump.j.campuri && cump.j.campuri.echipMod === 'cumpara' && cump.j.arata.inchiriere === false && !cump.j.html.chirieHint, cump.j.campuri && cump.j.campuri.echipMod);
  T('lângă fiecare preț, echivalentul în euro', /€/.test(ev3.j.echiv.pPlain || '') && /lei/.test(ev3.j.echiv.dFmc650 || ''), JSON.stringify(ev3.j.echiv).slice(0, 120));
  // „Aplică prețul propus" pune în câmp prețul unui CONT (câmpul e lei/cont), nu totalul pe toate conturile.
  const trei = await json('POST', '/api/admin/offers/calc', telNou, { campuri: faraPrefix(flota({ 'of-aiA': true, 'of-aiqSeats': 3, 'of-pAiA': 14 })), atinse: [], schimbate: [] });
  const linkPret = String((trei.j.html && trei.j.html.aiqCost) || '');
  T('3 conturi: „Aplică prețul propus" pune 17 lei/cont (nu 51), iar eticheta spune și totalul',
    /data-act="pret" data-val="17"/.test(linkPret) && /17 lei\/cont \(51 lei pe 3 conturi\)/.test(linkPret), (linkPret.match(/<a[^>]*data-act="pret"[^>]*>[^<]*/) || ['— fără link'])[0]);
  const apasat = await json('POST', '/api/admin/offers/calc', telNou, { campuri: Object.assign({}, trei.j.campuri, { pAiA: '17' }), atinse: trei.j.atinse, schimbate: [] });
  const linieAi = lista(apasat.j.r && apasat.j.r.lines).find((l) => l.fel === 'ai') || {};
  T('și după apăsare, RA Insight = 3 × 17 = 51 lei pe lună', linieAi.qty === 3 && linieAi.unit === 17 && linieAi.total === 51, JSON.stringify(linieAi));
  T('„Salvează ca tarifele noastre" trimite prețurile de pe ecran', ev3.j.salvareTarife && ev3.j.salvareTarife.tarife_lista && ev3.j.salvareTarife.tarife_lista.pPlain === 29, JSON.stringify(ev3.j.salvareTarife).slice(0, 120));

  sect('3. Poarta: aplicația veche nu scrie oferte, cea nouă da, web-ul ca înainte');
  const corp = primaSalvare.corp;
  const vechi = await json('POST', '/api/admin/offers', telVechi, corp);
  const v102 = await json('POST', '/api/admin/offers', tel102, corp);
  T('telefonul fără antet (1.0.1): 409, cu explicația de până acum', vechi.status === 409 && vechi.j.error === 'Ofertele se fac acum din aplicația web. Pe telefon doar le vezi — actualizează aplicația.', vechi.status + ' ' + vechi.text.slice(0, 120));
  T('telefonul 1.0.2: tot 409', v102.status === 409, v102.status);
  const scris = await json('POST', '/api/admin/offers', telNou, corp);
  T('telefonul 1.0.3 salvează oferta', scris.status === 200 && !!scris.j.id, scris.status + ' ' + scris.text.slice(0, 120));
  T('cu sumele socotite de pagină', Number(scris.j.monthly_total) === primaSalvare.r.monthly && Number(scris.j.once_total) === corp.once_total, scris.j.monthly_total + ' / ' + scris.j.once_total);
  const idTel = scris.j.id;
  const putVechi = await json('PUT', '/api/admin/offers/' + idTel, telVechi, Object.assign({}, corp, { name: 'Călcată de telefonul vechi' }));
  const putNou = await json('PUT', '/api/admin/offers/' + idTel, telNou, Object.assign({}, corp, { name: 'Ofertă Zebra (telefon)' }));
  T('PUT din aplicația veche: 409; din 1.0.3: 200', putVechi.status === 409 && putNou.status === 200 && putNou.j.name === 'Ofertă Zebra (telefon)', putVechi.status + ' / ' + putNou.status);
  const web = await json('POST', '/api/admin/offers', S, Object.assign({}, corp, { name: 'Ofertă de pe web' }));
  const webPut = await json('PUT', '/api/admin/offers/' + web.j.id, S, Object.assign({}, corp, { name: 'Ofertă de pe web, schimbată' }));
  T('web-ul (cookie) salvează și modifică la fel ca înainte, fără antet', web.status === 200 && webPut.status === 200 && webPut.j.name === 'Ofertă de pe web, schimbată', web.status + ' / ' + webPut.status);
  T('un antet cu versiunea pe web nu schimbă nimic', (await json('POST', '/api/admin/offers', { cookie: S, app: '0.0.1' }, Object.assign({}, corp, { name: 'web+antet' }))).status === 200);

  sect('4. O ofertă salvată: creionul, hârtia, contractul');
  // Prețuri negociate, salvate în ofertă: la redeschidere sunt „scrise de mână".
  const negociat = Object.assign({}, corp, { config: { cfg: corp.config.cfg, prices: Object.assign({}, corp.config.prices, { pCan: 41, mGps: 90 }) } });
  await json('PUT', '/api/admin/offers/' + idTel, telNou, negociat);
  const inc = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idTel, incarca: true, hartie: true, contract: true });
  const ci = inc.j.campuri || {};
  T('creionul pune oferta în formular (flotă, client, prețuri negociate)', inc.status === 200 && ci.nveh === '20' && ci.ncan === '20' && ci['cl-name'] === 'Transport Zebra SRL' && ci.pCan === '41' && ci.mGps === '90',
    inc.status + ' ' + JSON.stringify({ nveh: ci.nveh, pCan: ci.pCan, mGps: ci.mGps, cl: ci['cl-name'] }));
  T('și le marchează „scrise de mână"', ['nveh', 'qGps', 'pCan', 'mGps', 'dq650', 'name', 'notes'].every((k) => lista(inc.j.atinse).includes(k)), JSON.stringify(inc.j.atinse));
  T('salvarea devine „Actualizează": PUT pe oferta ei', inc.j.salvare && inc.j.salvare.metoda === 'PUT' && inc.j.salvare.url === '/api/admin/offers/' + idTel, JSON.stringify(inc.j.salvare && { m: inc.j.salvare.metoda, u: inc.j.salvare.url }));
  const dupaMasini = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idTel, campuri: Object.assign({}, ci, { nveh: '30' }), atinse: inc.j.atinse, schimbate: ['nveh'] });
  T('schimbi numărul de mașini pe oferta deschisă: cantitățile și prețurile ei rămân', dupaMasini.j.campuri.qGps === ci.qGps && dupaMasini.j.campuri.pCan === '41' && dupaMasini.j.campuri.dq650 === ci.dq650,
    JSON.stringify({ qGps: dupaMasini.j.campuri.qGps, pCan: dupaMasini.j.campuri.pCan, dq650: dupaMasini.j.campuri.dq650 }));
  // Hârtia ofertei SALVATE: din ce s-a salvat, la cursul ei înghețat — aceeași socoteală ca pe web.
  const salvata = (lista((await json('GET', '/api/admin/offers', S)).j).find((o) => o.id === idTel)) || {};
  const cfgS = Object.assign({ nVeh: 0, nCan: 0, nFms: 0, retTier: '12', contractMonths: 12 }, salvata.config.cfg);
  const pS = Object.assign({}, calculator({})._ofCalc().p, salvata.config.prices);
  const dirS = calculator({});
  const hS = JSON.parse(JSON.stringify(dirS._ofPayload(dirS._ofCalc(cfgS, pS))));
  T('„Vezi hârtia" din listă = plicul socotit din oferta salvată', egal(inc.j.hartieSalvata, hS), diferenta(inc.j.hartieSalvata, hS));
  T('cu prețul negociat pe hârtie (41 lei mașina cu CAN)', (lista(inc.j.hartieSalvata && inc.j.hartieSalvata.lines).find((l) => l.fel === 'can') || {}).unit === 41);
  const ctrDirect = JSON.parse(JSON.stringify(calculator({})._coSocotealaOfertei(JSON.parse(JSON.stringify(salvata)))));
  T('ce duce contractul făcut din ofertă = socoteala paginii (preț pe mașină + anexa)', egal(inc.j.pentruContract, ctrDirect) && inc.j.pentruContract.unitati.can === 41, diferenta(inc.j.pentruContract, ctrDirect));
  const pdf = await cerere('POST', '/api/admin/offers/pdf', telNou, inc.j.hartieSalvata);
  const buf = Buffer.from(await pdf.arrayBuffer());
  const cd = pdf.headers.get('content-disposition') || '';
  T('PDF-ul ofertei salvate iese de la generatorul serverului, cu numele lui', pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF' && /filename\*=UTF-8''RA-Tracks/.test(cd),
    pdf.status + ' ' + cd);
  // Modulele vândute se redeschid bifate: altfel „Actualizează" scria un abonament mai mic (Tahograf și
  // e-Transport dispăreau fără niciun mesaj — și din contractul făcut apoi din ofertă).
  const cuModule = salvari['cu tahograf și e-Transport'];
  const scrisM = await json('POST', '/api/admin/offers', telNou, cuModule.corp);
  const incM = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: scrisM.j.id, incarca: true });
  const cM = incM.j.campuri || {};
  const corpM = (incM.j.salvare && incM.j.salvare.corp) || {};
  T('o ofertă cu Tahograf și e-Transport se redeschide cu ele bifate', incM.status === 200 && cM.tahograf === true && cM.etransport === true && cM.agenti === true,
    JSON.stringify({ th: cM.tahograf, et: cM.etransport, ag: cM.agenti }));
  T('iar „Actualizează" o salvează cu același abonament (' + cuModule.r.monthly + ' lei/lună), nu mai mic',
    Number(scrisM.j.monthly_total) === cuModule.r.monthly && corpM.monthly_total === cuModule.r.monthly
      && !!(corpM.config && corpM.config.cfg && corpM.config.cfg.tahograf === true && corpM.config.cfg.etransport === true),
    scrisM.j.monthly_total + ' → ' + corpM.monthly_total);
  const faraAgenti = salvari['flotă mică, doar GPS, FMC130'];
  const scrisA = await json('POST', '/api/admin/offers', telNou, faraAgenti.corp);
  const incA = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: scrisA.j.id, incarca: true });
  T('și una fără cei 6 agenți se redeschide fără ei', incA.status === 200 && (incA.j.campuri || {}).agenti === false && (incA.j.campuri || {}).tahograf === false, JSON.stringify(incA.j.campuri && incA.j.campuri.agenti));
  const doarHartie = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idTel, hartie: true });
  T('hârtia se poate cere singură, fără formular', doarHartie.status === 200 && egal(doarHartie.j.hartieSalvata, hS) && !doarHartie.j.campuri);
  T('o ofertă care nu există: 404', (await json('POST', '/api/admin/offers/calc', telNou, { offer_id: 999999, hartie: true })).status === 404);

  sect('5. „Prețurile noastre" și lista casei');
  const pr = await json('POST', '/api/admin/offers/calc', telNou, { preturi: true });
  const gr = lista(pr.j.preturi && pr.j.preturi.grupuri);
  T('grupurile vin din pagină (curs, abonament, păstrare, RA Insight, montaj, aparate)', gr.length === 6 && gr[0].curs === true && gr[0].randuri[0][0] === 'cursEur' && gr[3].randuri.length === 5, gr.map((g) => g.t).join(' | '));
  const vl = (pr.j.preturi && pr.j.preturi.valori) || { tp: {}, tc: {} };
  T('valorile de acum: cursul nostru, tarifele, grila RA Insight', vl.tp.cursEur === 5.1 && vl.tp.pPlain === 29 && vl.tp.aiqPana10 === 14 && vl.tp.dFmc650 === 120, JSON.stringify(vl.tp).slice(0, 160));
  T('costurile netrecute rămân necunoscute (null), nu zero', Object.keys(vl.tc).length === 12 && Object.values(vl.tc).every((v) => v === null), JSON.stringify(vl.tc));
  // Salvăm lista casei ca telefonul: TOATE cheile (costurile se rescriu de la zero la fiecare salvare).
  const tarife = {}, costuri = {};
  gr.forEach((g) => g.randuri.forEach((r) => { if (r[0] && r[0] !== 'cursEur') tarife[r[0]] = vl.tp[r[0]]; if (r[2]) costuri[r[2]] = vl.tc[r[2]]; }));
  tarife.aiqPana10 = 22; costuri.mGps = 70; costuri.cVehLuna = 6; costuri.dFmc650 = 80;
  const salvP = await json('PUT', '/api/admin/system-settings', telNou, { tarife_lista: tarife, costuri_noastre: costuri, curs_eur: '5.1' });
  T('„Gata" salvează prețurile de pe telefon', salvP.status === 200 && salvP.j.settings.tarife_lista.aiqPana10 === 22 && salvP.j.settings.costuri_noastre.mGps === 70, salvP.status + ' ' + salvP.text.slice(0, 100));
  const nou2 = await json('POST', '/api/admin/offers/calc', telNou, { nou: true });
  T('o ofertă NOUĂ pornește de la lista schimbată (cont RA Insight 22 lei)', nou2.j.campuri && nou2.j.campuri.pAiA === '22', nou2.j.campuri && nou2.j.campuri.pAiA);
  const inc2 = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idTel, incarca: true });
  T('iar oferta salvată își păstrează prețurile ei', inc2.j.campuri && inc2.j.campuri.pCan === '41' && inc2.j.campuri.pAiA === ci.pAiA, inc2.j.campuri && (inc2.j.campuri.pCan + ' / ' + inc2.j.campuri.pAiA));
  T('„Ce rămâne la noi": cu costul mașinii trecut, oferta fără aparate își arată profitul',
    /Lunar, încasăm/.test(inc2.j.html.rezumat) && !/Nu pot socoti profitul/.test(inc2.j.html.rezumat), (inc2.j.html.rezumat.match(/Ce rămâne la noi[\s\S]{0,200}/) || ['—'])[0]);
  const cuModul = await json('POST', '/api/admin/offers/calc', telNou, { campuri: faraPrefix(flota({ 'of-dqLvCan': 20, 'of-qGps': 20 })), atinse: [], schimbate: [] });
  T('iar fără costul modulului LV-CAN200 spune ce lipsește — nu inventează un profit',
    /Nu pot socoti profitul/.test(cuModul.j.html.rezumat) && /Modul LV-CAN200/.test(cuModul.j.html.rezumat) && !/Lunar, încasăm/.test(cuModul.j.html.rezumat),
    (cuModul.j.html.rezumat.match(/Nu pot socoti[^<]*<b>[^<]*/) || ['—'])[0]);

  sect('6. Doar noi');
  const co = (await json('POST', '/api/companies', S, { name: 'Firma Oferte SRL' })).j;
  const creat = await json('POST', '/api/users', S, { username: 'sef@oferte.ro', full_name: 'Sef', role: 'admin', company_id: co.id });
  if (creat.j && creat.j.link) await puneParola(creat.j, 'Str4da-Verde-2026', B);
  const ckSef = await login('sef@oferte.ro', 'Str4da-Verde-2026');
  const telSef = await loginTelefon('sef@oferte.ro', 'Str4da-Verde-2026');
  T('administratorul firmei intră', !!ckSef && !!telSef);
  T('dar calculatorul (cu costurile noastre) îi e închis — web și telefon',
    (await json('POST', '/api/admin/offers/calc', ckSef, { nou: true })).status === 403
      && (await json('POST', '/api/admin/offers/calc', { token: telSef.token, app: '1.0.3' }, { preturi: true })).status === 403);
  T('și nici cu antetul nu scrie oferte', (await json('POST', '/api/admin/offers', { token: telSef.token, app: '1.0.3' }, corp)).status === 403);
  T('câmpuri stricate: 400, nu o socoteală pe jumătate', (await json('POST', '/api/admin/offers/calc', telNou, { campuri: [1, 2] })).status === 400);

  sect('7. Aplicația de telefon: se prezintă și nu socotește singură');
  const citeste = (f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch (e) { return ''; } };
  const client = citeste('mobile/src/api/client.ts'), gradle = citeste('mobile/android/variables.gradle');
  const verApp = (client.match(/APP_VERSIUNE = '([\d.]+)'/) || [])[1] || '';
  const verGradle = (gradle.match(/appVersionName = '([\d.]+)'/) || [])[1] || '';
  T('telefonul își trimite versiunea în X-RA-App, la fiecare cerere', /'X-RA-App': APP_VERSIUNE/.test(client), verApp);
  T('versiunea din antet e cea a aplicației (android/variables.gradle), nu rămâne în urmă', !!verApp && verApp === verGradle, verApp + ' vs ' + verGradle);
  const calcTel = citeste('mobile/src/screens/OfferCalc.tsx'), listaTel = citeste('mobile/src/screens/Offers.tsx');
  T('calculatorul de pe telefon cere socoteala serverului și salvează corpul primit de acolo',
    /Api\.offerCalc\(/.test(calcTel) && /createOffer\(j\.salvare\.corp\)/.test(calcTel) && /updateOffer\(Number\(m\[1\]\), j\.salvare\.corp\)/.test(calcTel));
  T('și nu are nicio socoteală a ofertei (nici `_ofCalc`, nici totaluri compuse)',
    !/_ofCalc|monthly_total\s*:|once_total\s*:|\.reduce\(/.test(calcTel + listaTel));
  T('hârtia ofertei salvate vine de la server, nu se desenează pe telefon',
    /hartie: true/.test(listaTel) && /\/api\/admin\/offers\/pdf/.test(listaTel) && !/jspdf|pdfmake|window\.print/i.test(calcTel + listaTel));

  sect('8. Un „preț" care nu e număr nu se rulează pe server');
  // Pagina scrie prețul în formular fără să-l curețe (`value="…"`). Un „preț" care închide ghilimelele își
  // aduce propriul `oninput` — iar calculatorul de pe server rulează `oninput`-urile câmpurilor atinse.
  const otrava = '1" oninput="document.getElementById(\'of-cl-name\').value=\'PRINS\'';
  const cuOtrava = Object.assign({}, corp, { name: 'Otrava', config: { cfg: corp.config.cfg, prices: Object.assign({}, corp.config.prices, { pPlain: otrava, pCan: '41', mGps: null }) } });
  const scrisO = await json('POST', '/api/admin/offers', telNou, cuOtrava);
  const pO = (scrisO.j.config && scrisO.j.config.prices) || {};
  T('salvarea ține din prețuri doar numerele: textul cade, „41" devine 41, golul rămâne gol',
    scrisO.status === 200 && !('pPlain' in pO) && pO.pCan === 41 && pO.mGps === null, scrisO.status + ' ' + JSON.stringify({ pPlain: pO.pPlain, pCan: pO.pCan, mGps: pO.mGps }));
  // O ofertă scrisă ÎNAINTE de curățare (aici: configurația trimisă ca text, pe care salvarea n-o desface):
  // otrava ajunge în bază, deci doar calculatorul o mai poate opri.
  const vecheO = await json('POST', '/api/admin/offers', telNou, Object.assign({}, corp, { name: 'Otrava veche',
    config: JSON.stringify({ cfg: corp.config.cfg, prices: Object.assign({}, corp.config.prices, { pPlain: otrava }) }) }));
  const randV = lista((await json('GET', '/api/admin/offers', S)).j).find((o) => o.id === vecheO.j.id) || {};
  T('(proba mușcă: otrava chiar stă în bază)', typeof randV.config === 'string' && /oninput/.test(randV.config), typeof randV.config);
  for (const [cum, idO] of [['salvată azi', scrisO.j.id], ['salvată înainte', vecheO.j.id]]) {
    const incO = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idO, incarca: true });
    const apasO = await json('POST', '/api/admin/offers/calc', telNou, { offer_id: idO, campuri: Object.assign({}, incO.j.campuri, { pPlain: '30' }), atinse: incO.j.atinse, schimbate: ['pPlain'] });
    const ci0 = incO.j.campuri || {}, ca0 = apasO.j.campuri || {};
    T('oferta ' + cum + ': se deschide cu tariful casei în loc de text, iar prețul atins NU rulează comanda străină',
      incO.status === 200 && ci0.pPlain === '29' && apasO.status === 200 && ca0['cl-name'] === 'Transport Zebra SRL' && ca0.pPlain === '30',
      incO.status + '/' + apasO.status + ' ' + JSON.stringify({ pPlain: ci0.pPlain, client: ca0['cl-name'], err: apasO.j.error }));
  }
  // A doua plasă, direct pe funcția din server.js: o comandă care nu e în lista formularului curat nu se rulează.
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\r\n/g, '\n');   // Windows: CRLF
  const iH = SRV.indexOf('function _ofHandler(ctx, cod) {'), jH = SRV.indexOf('\n}\n', iH);
  const vm = require('vm');
  const comenzi = new WeakMap();
  const _ofHandler = new Function('_ofVm', '_ofHandlere', '_ofComenzi', SRV.slice(iH, jH + 2) + '\nreturn _ofHandler;')(vm, new Map(), comenzi);
  const ctxP = vm.createContext({ raxOfRecalc() {} });
  comenzi.set(ctxP, new Set(['raxOfRecalc()']));
  const refuza = (c, cod) => { try { _ofHandler(c, cod); return false; } catch (e) { return /refuzat/.test(e.message); } };
  T('comanda paginii trece; una străină (sau un vm necunoscut) e refuzată, nu rulată',
    iH > 0 && typeof _ofHandler(ctxP, 'raxOfRecalc()') === 'function'
      && refuza(ctxP, "this.constructor.constructor('return process')()") && refuza(vm.createContext({}), 'raxOfRecalc()'));
  // Data din numele ofertei, pe UTC (ca serverul): 23.09, 22:30 UTC e deja 24.09 la București.
  const oraRo = (SRV.match(/const _OF_ORA_RO = ("[^\n]*");\n/) || [])[1];
  const tzInainte = process.env.TZ;
  process.env.TZ = 'UTC';
  let zi = '', ziFara = '';
  try {
    const cu = vm.createContext({}); vm.runInContext(JSON.parse(oraRo), cu);
    zi = vm.runInContext("new Date('2026-09-23T22:30:00Z').toLocaleDateString('ro-RO')", cu);
    ziFara = vm.runInContext("new Date('2026-09-23T22:30:00Z').toLocaleDateString('ro-RO')", vm.createContext({}));
  } catch (e) { zi = 'eroare: ' + e.message; }
  finally { if (tzInainte === undefined) delete process.env.TZ; else process.env.TZ = tzInainte; }
  T('pe un server UTC, la 01:30 ora României, pagina scrie data de azi (24.09), nu de ieri', zi === '24.09.2026' && ziFara === '23.09.2026', zi + ' / fără: ' + ziFara);

  console.log('\n' + (rele ? '✗ ' + rele + ' verificări au picat' : '✓ toate cele ' + ok + ' verificări au trecut'));
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
