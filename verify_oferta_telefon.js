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
//      cont, numele ofertei poartă data României, iar un „preț" text din bază nu ajunge să ruleze pe server;
//   7. (lotul 3, 29.09) sugestiile doar pentru noi (pasul 2, pasul 4, comutatorul CAN, „Aplică
//      recomandarea"), „Mașinile clientului" (serverul caută, telefonul arată; „Trece în ofertă"), lista
//      salvată cu oferta EI oricâte cereri ar trece între timp, refuzul hârtiei la chirie lipsă, șablonul
//      mașinilor urcat în JSON — și că telefonul nu hotărăște nimic singur;
//   8. o listă Teltonika nouă, urcată de pe telefon: mărcile și modelele propuse o cuprind (telefonul le cere
//      din nou după încărcare, ca pagina web).
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

  // ─── Lotul 3 (29.09): sugestiile, comutatorul CAN, „Mașinile clientului", închirierea ────────────────
  const calc = (b) => json('POST', '/api/admin/offers/calc', telNou, b);
  const faraCod = (h) => !/onclick=|href=|class="fas |<script/i.test(String(h || ''));
  sect('9. Sugestiile doar pentru noi: pasul 2, pasul 4, comutatorul CAN, „Aplică recomandarea"');
  const s0 = (await calc({ nou: true })).j;
  const s1 = (await calc({ campuri: Object.assign({}, s0.campuri, { nveh: '12', ncan: '5', nfms: '3', qGps: '3' }), atinse: ['qGps'], schimbate: ['nveh', 'ncan', 'nfms'] })).j;
  const sf = String((s1.html && s1.html.sfatFlota) || ''), sm = String((s1.html && s1.html.sfatMontaj) || '');
  T('pasul 2, „Ce recomanzi": un rând pe fel de mașină, scris de pagină (4 fără CAN, 5 cu CAN, 3 camioane)',
    /Ce recomanzi · doar pentru tine, nu apare în ofertă/.test(sf) && /<b>4 fără CAN → FMC130\.<\/b>/.test(sf) && /<b>5 cu CAN → FMC130 \+ modul LV-CAN200\.<\/b>/.test(sf) && /<b>3 camioane cu FMS → FMC650\.<\/b>/.test(sf), sf.slice(0, 160));
  T('pasul 4, „Recomandarea pentru flota asta": tabelul Recomandat / În ofertă, cu diferența marcată', /Recomandarea pentru flota asta · doar pentru tine/.test(sm) && /<th class="num">Recomandat<\/th><th class="num">În ofertă<\/th>/.test(sm)
    && /Instalare dispozitiv GPS<\/td><td class="num"><b>12<\/b><\/td><td class="num dif">3</.test(sm), sm.slice(0, 160));
  T('comutatorul CAN și „Aplică recomandarea" ajung pe telefon ca butoane-semn (fără comenzile paginii)',
    /<button type="button" data-act="canMod" data-val="lvcan" class="rax-btn primary">FMC130 \+ LV-CAN200<\/button>/.test(sm) && /data-act="canMod" data-val="fmc150" class="rax-btn">FMC150 \(CAN integrat\)</.test(sm)
      && /<button type="button" data-act="aplicaRec" class="rax-btn primary">Aplică recomandarea în ofertă<\/button>/.test(sm) && faraCod(sf + sm), sm.slice(sm.indexOf('<div'), sm.indexOf('<div') + 200));
  const s2 = (await calc({ campuri: s1.campuri, atinse: s1.atinse, schimbate: ['canMod'], canMod: 'fmc150' })).j;
  const q2 = s2.campuri || {};
  T('comutatorul pe FMC150: cantitățile neatinse trec pe FMC150 + CAN încorporat, cea scrisă de mână rămâne',
    s2.canMod === 'fmc150' && q2.dq150 === '5' && q2.qCanInc === '5' && q2.dqLvCan === '' && q2.qLvCan === '' && q2.dq130 === '4' && q2.qGps === '3',
    JSON.stringify({ canMod: s2.canMod, d130: q2.dq130, d150: q2.dq150, lv: q2.dqLvCan, qLv: q2.qLvCan, qCi: q2.qCanInc, qGps: q2.qGps }));
  T('...și alegerea se vede plină pe butonul ei', /data-val="fmc150" class="rax-btn primary"/.test(s2.html.sfatMontaj) && /data-val="lvcan" class="rax-btn">/.test(s2.html.sfatMontaj));
  const s3 = (await calc({ campuri: s2.campuri, atinse: s2.atinse, schimbate: [] })).j;
  T('comutatorul nu rămâne agățat în pagina serverului: o cerere fără el pornește pe „FMC130 + LV-CAN200"', s3.canMod === 'lvcan' && /data-val="lvcan" class="rax-btn primary"/.test(s3.html.sfatMontaj), s3.canMod);
  const s4 = (await calc({ campuri: s2.campuri, atinse: s2.atinse, schimbate: [], canMod: 'fmc150', aplicaRecomandarea: true })).j;
  const q4 = s4.campuri || {};
  T('„Aplică recomandarea": pune cantitățile recomandate la pașii 4 și 5 (GPS 12), cu mesajul paginii',
    q4.qGps === '12' && q4.dq150 === '5' && q4.qCanInc === '5' && q4.dq650 === '3' && q4.qFms === '3' && s4.mesaj === 'Recomandarea e în ofertă (pașii 4 și 5) ✓',
    JSON.stringify({ qGps: q4.qGps, d150: q4.dq150, mesaj: s4.mesaj }));
  T('...le ține minte ca „scrise de mână", iar recomandarea spune că oferta o urmează',
    ['dq130', 'dq150', 'dq650', 'dqLvCan', 'qGps', 'qLvCan', 'qCanInc', 'qFms'].every((k) => lista(s4.atinse).includes(k)) && /<div class="ok">Oferta urmează recomandarea\.<\/div>/.test(s4.html.sfatMontaj), JSON.stringify(s4.atinse));
  T('...fără să atingă prețurile', q4.mGps === s2.campuri.mGps && q4.dFmc150 === s2.campuri.dFmc150 && q4.pPlain === s2.campuri.pPlain);
  T('sfaturile NU ajung pe hârtie și nici în salvare', !/Recomand|doar pentru tine|Ce recomanzi|Întrebări de pus/.test(JSON.stringify(s4.hartie) + JSON.stringify(s4.salvare || s4.salvareEroare)));

  sect('10. „Mașinile clientului": serverul caută, telefonul doar arată');
  const MS = [
    { marca: 'Dacia', model: 'Logan 2', an: '2024', combustibil: 'gpl', buc: '3', aparat: '' },
    { marca: 'Volvo', model: 'FH', an: '2020', combustibil: 'motorina', buc: '2', aparat: '' },
    { marca: 'Ford', model: 'Transit', an: '', combustibil: '', buc: '1', aparat: '' },
    { marca: 'VW', model: '', an: '', combustibil: '', buc: '1', aparat: '' },   // pe jumătate scris
  ];
  const m1 = (await calc({ campuri: s0.campuri, atinse: [], schimbate: [], masini: MS, masiniMotor: true, canMod: 'lvcan' })).j;
  const R1 = lista(m1.masini && m1.masini.randuri);
  T('fiecare rând primește rezultatul lui (aparat recomandat + ce a scris pagina sub el)', R1.length === 4 && R1[0].rec && R1[0].rec.aparat === 'fmc130_lvcan' && R1[0].rec.et === 'FMC130 + LV-CAN200'
    && R1[1].rec && R1[1].rec.aparat === 'fmc650' && R1[3].rec === null && /Scrie marca și modelul/.test(R1[3].rez), JSON.stringify(R1.map((x) => x.rec)));
  const pot = await json('POST', '/api/admin/masini/potrivire', S, { pref: 'lvcan', vreaMotor: true, vehicule: MS.map((m) => ({ marca: m.marca, model: m.model, an: Number(m.an) || null, combustibil: m.combustibil })) });
  T('o singură regulă: aparatul e cel dat de ruta de potrivire, pe aceleași mașini', pot.status === 200 && R1.every((x, i) => (x.rec ? x.rec.aparat : null) === ((pot.j.rezultate[i] || {}).rec || {}).aparat || (x.rec === null && pot.j.rezultate[i] === null)),
    JSON.stringify(lista(pot.j.rezultate).map((x) => x && x.rec && x.rec.aparat)));
  const rezTot = R1.map((x) => x.rez).join('');
  T('ce se citește și pe ce rând din listă — în cuvintele paginii', /citește: rezervor ✓/.test(rezTot) && /LV-CAN200: LOGAN \(III\) \(LPG\), din 2021 · program 13732/.test(rezTot) && /class="raof-ms-st nes">de verificat/.test(rezTot), R1[0].rez.slice(0, 200));
  T('„Poate e: …" vine ca semn (modelul propus), nu ca o comandă a paginii', /<a data-act="model" data-val="Logan VAN">Logan VAN<\/a>/.test(rezTot) && faraCod(rezTot), (rezTot.match(/Poate e:[^\n]{0,160}/) || ['—'])[0]);
  T('lista de alegere a aparatului NU vine în HTML (telefonul o face nativă, din `aparate`)', !/raof-ms-alege|<select/.test(rezTot)
    && egal(lista(m1.masini.aparate).map((a) => a.k), ['fmc130', 'fmc130_lvcan', 'fmc150', 'fmc650']) && lista(m1.masini.combustibili).length === 5 && m1.masini.combustibili[2].et === 'benzină + GPL');
  T('sumarul, cu „Trece în ofertă" ca semn: 6 mașini, 4 de verificat', /<b>6 mașini<\/b>: 4 × FMC130 \+ LV-CAN200 · 2 × FMC650 \(camion, FMS\)/.test(m1.masini.sumar) && /4 de verificat/.test(m1.masini.sumar)
    && /<button type="button" data-act="aplicaRec" class="rax-btn primary">Trece în ofertă<\/button>/.test(m1.masini.sumar) && faraCod(m1.masini.sumar), m1.masini.sumar.slice(0, 200));
  T('pașii 2 și 4 citesc din listă când are mașini', /Ce recomanzi, din lista mașinilor/.test(m1.html.sfatFlota) && /Recomandarea din lista mașinilor/.test(m1.html.sfatMontaj) && /pașii 2, 4 și 5/.test(m1.html.sfatMontaj));
  T('rândurile se întorc cum au venit (și cel pe jumătate scris), ca telefonul să le poată arăta', egal(lista(m1.masini.lista).map((x) => [x.marca, x.model, x.an, x.buc]), MS.map((x) => [x.marca, x.model, x.an, x.buc])) && m1.masini.motor === true);
  const m2 = (await calc({ campuri: m1.campuri, atinse: m1.atinse, schimbate: [], masini: MS, masiniMotor: true, canMod: 'lvcan', aplicaRecomandarea: true })).j;
  const c2 = m2.campuri || {};
  T('„Trece în ofertă": pasul 2 din listă (6 mașini, 4 cu CAN, 2 cu FMS), pașii 4 și 5 din aparatele alese',
    c2.nveh === '6' && c2.ncan === '4' && c2.nfms === '2' && c2.dq130 === '4' && c2.dqLvCan === '4' && c2.dq650 === '2' && c2.qGps === '6' && m2.mesaj === 'Mașinile sunt în ofertă (pașii 2, 4 și 5) ✓',
    JSON.stringify({ nveh: c2.nveh, ncan: c2.ncan, nfms: c2.nfms, d130: c2.dq130, lv: c2.dqLvCan, d650: c2.dq650, mesaj: m2.mesaj }));
  const MSmana = MS.map((m, i) => (i === 2 ? Object.assign({}, m, { aparat: 'fmc130' }) : m));
  const m3 = (await calc({ campuri: m1.campuri, atinse: m1.atinse, schimbate: [], masini: MSmana, masiniMotor: true, aplicaRecomandarea: true })).j;
  T('aparatul ales de mână bate recomandarea (Transit → FMC130, doar poziție)', m3.campuri.ncan === '3' && /1 × FMC130 \(doar poziție\)/.test(m3.masini.sumar), m3.campuri.ncan + ' / ' + m3.masini.sumar.slice(0, 120));
  const m4 = (await calc({ campuri: m1.campuri, atinse: m1.atinse, schimbate: [], masini: MS, masiniMotor: false })).j;
  T('„date din motor" oprit: mașina mică primește FMC130 (doar poziție)', lista(m4.masini.randuri)[0].rec.aparat === 'fmc130' && m4.masini.motor === false, JSON.stringify(lista(m4.masini.randuri)[0].rec));
  const otravaMs = [{ marca: '<img src=x onerror=alert(1)>', model: 'X"><script>alert(1)</script>', an: '2020', combustibil: 'kerosen', buc: '-4', aparat: 'rachetă' }];
  const r5 = await calc({ campuri: s0.campuri, atinse: [], schimbate: [], masini: otravaMs });
  const m5 = r5.j;
  const tot5 = JSON.stringify([m5.masini && m5.masini.randuri, m5.masini && m5.masini.sumar, m5.html]);
  const l5 = (m5.masini && m5.masini.lista || [])[0] || {};
  T('ce scrie omul nu ajunge ca HTML: marca și modelul ies scăpate, combustibilul / aparatul străine cad, bucățile urcă la 1',
    r5.status === 200 && !/<img|<script/i.test(tot5) && l5.combustibil === '' && l5.aparat === '' && l5.buc === '1', tot5.slice(0, 200));

  sect('11. Lista mașinilor se salvează cu oferta EI, oricâte cereri ar trece între timp (L5-01)');
  const MSa = [MS[0], MS[1], MS[3]];   // Logan ×3, Volvo ×2 și un rând pe jumătate scris (nu se salvează)
  const pa = (await calc({ campuri: Object.assign({}, s0.campuri, { 'cl-name': 'Firma A' }), atinse: [], schimbate: ['cl-name'], masini: MSa, masiniMotor: false })).j;
  const cfgA = pa.salvare && pa.salvare.corp && pa.salvare.corp.config && pa.salvare.corp.config.cfg;
  T('salvarea duce lista (doar rândurile întregi) și „date din motor"', !!cfgA && lista(cfgA.masini).length === 2 && cfgA.masini[0].model === 'Logan 2' && cfgA.masini[0].buc === 3 && cfgA.masiniMotor === false,
    JSON.stringify(cfgA && { m: cfgA.masini, mo: cfgA.masiniMotor }));
  const idA = (await json('POST', '/api/admin/offers', telNou, pa.salvare.corp)).j.id;
  const pb = (await calc({ campuri: Object.assign({}, s0.campuri, { 'cl-name': 'Firma B' }), atinse: [], schimbate: ['cl-name'], masini: [{ marca: 'Skoda', model: 'Octavia', an: '2021', combustibil: 'benzina', buc: '7' }] })).j;
  const idB = (await json('POST', '/api/admin/offers', telNou, pb.salvare.corp)).j.id;
  const listaA = cfgA.masini;
  const incA2 = (await calc({ offer_id: idA, incarca: true })).j;
  T('oferta redeschisă își aduce lista, cu rezultatele ei', egal(lista(incA2.masini && incA2.masini.lista).map((x) => [x.marca, x.model, x.an, x.buc]), [['Dacia', 'Logan 2', '2024', '3'], ['Volvo', 'FH', '2020', '2']])
    && incA2.masini.motor === false && lista(incA2.masini.randuri)[1].rec.aparat === 'fmc650', JSON.stringify(incA2.masini && incA2.masini.lista));
  // Între deschidere și salvare trece altcineva pe la calculator: „Ofertă nouă"…
  await calc({ nou: true });
  const dupaNou = (await calc({ offer_id: idA, campuri: incA2.campuri, atinse: incA2.atinse, schimbate: [] })).j;   // telefonul 1.0.3: fără `masini`
  const cN = dupaNou.salvare && dupaNou.salvare.corp.config.cfg;
  T('după o „Ofertă nouă" în altă parte, salvarea ofertei A duce tot lista ei (nu una goală)', !!cN && egal(cN.masini, listaA) && cN.masiniMotor === false, JSON.stringify(cN && { m: cN.masini, mo: cN.masiniMotor }));
  // …sau deschide oferta B.
  await calc({ offer_id: idB, incarca: true });
  const dupaB = (await calc({ offer_id: idA, campuri: incA2.campuri, atinse: incA2.atinse, schimbate: [] })).j;
  const cB = dupaB.salvare && dupaB.salvare.corp.config.cfg;
  T('după ce altcineva deschide oferta B, salvarea ofertei A NU duce mașinile lui B', !!cB && egal(cB.masini, listaA) && !/Octavia/.test(JSON.stringify(cB.masini)), JSON.stringify(cB && cB.masini));
  const golita = (await calc({ offer_id: idA, campuri: incA2.campuri, atinse: incA2.atinse, schimbate: [], masini: [], masiniMotor: true })).j;
  T('lista golită chiar de pe telefon rămâne goală (hotărârea omului)', egal(golita.salvare.corp.config.cfg.masini, []) && golita.salvare.corp.config.cfg.masiniMotor === true);
  const s7 = (await json('PUT', '/api/admin/offers/' + idA, telNou, dupaB.salvare.corp));
  const inapoiA = lista((await json('GET', '/api/admin/offers', S)).j).find((o) => o.id === idA) || {};
  // (Baza ține JSON-ul cu cheile în ordinea EI — se compară câmp cu câmp, nu textul.)
  const campuriMs = (l) => lista(l).map((x) => [x.marca, x.model, x.an, x.combustibil, x.buc, x.aparat]);
  T('și, salvată, oferta A își păstrează lista în bază', s7.status === 200 && egal(campuriMs(inapoiA.config && inapoiA.config.cfg && inapoiA.config.cfg.masini), campuriMs(listaA)),
    s7.status + ' ' + diferenta(campuriMs(inapoiA.config && inapoiA.config.cfg && inapoiA.config.cfg.masini), campuriMs(listaA)));

  sect('12. Închirierea: hârtia refuzată spune de ce; șablonul mașinilor de pe telefon');
  const ch = (await calc({ campuri: Object.assign({}, s0.campuri, { echipMod: 'inchiriaza', dq130: '5' }), atinse: ['dq130'], schimbate: ['echipMod'] })).j;
  T('aparate închiriate fără chirie: PDF-ul e refuzat cu mesajul paginii, nu cu unul general', ch.hartie === null && ch.hartieEroare === 'Lipsește chiria pentru: Teltonika FMC130 (pasul 5).', JSON.stringify({ h: ch.hartie, e: ch.hartieEroare }));
  T('...iar o ofertă obișnuită n-are niciun refuz', !!s1.hartie && s1.hartieEroare === null);
  T('„trece cât ne costă", lângă chirie, e un semn spre „Prețurile noastre"', /^<a data-act="preturi"[^>]*>trece cât ne costă<\/a>$/.test(String(ch.chcost && ch.chcost.chFmc130)), ch.chcost && ch.chcost.chFmc130);
  const ExcelJS = require('exceljs');
  const rsab = await fetch(B + '/api/admin/masini/sablon', { headers: { Authorization: 'Bearer ' + tel.token } });
  const cdSab = rsab.headers.get('content-disposition') || '';
  T('telefonul descarcă șablonul de la server, cu numele casei', rsab.status === 200 && decodeURIComponent((cdSab.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || '') === 'RA-Tracks - Șablon mașini client.xlsx', rsab.status + ' ' + cdSab);
  const wbS = new ExcelJS.Workbook(); await wbS.xlsx.load(Buffer.from(await rsab.arrayBuffer()));
  const wsS = wbS.getWorksheet('Mașini');
  let rA = 0; for (let i = 1; i <= 12 && wsS && !rA; i++) if (String(wsS.getCell(i, 1).value) === 'Marcă') rA = i;
  [['Dacia', 'Logan', 2024, 'benzină + GPL', 5], ['Volvo', 'FH', 2020, 'motorină', 2], ['Renault', null, 2020, 'motorină', 1]]
    .forEach((vv, i) => vv.forEach((x, j) => { if (x != null) wsS.getCell(rA + 1 + i, j + 1).value = x; }));
  const b64 = Buffer.from(await wbS.xlsx.writeBuffer()).toString('base64');
  const sj = await json('POST', '/api/admin/masini/sablon', telNou, { fisier: 'Flota Firma A.xlsx', b64 });
  T('șablonul completat urcă de pe telefon în JSON (base64) și se citește cu același cititor', sj.status === 200 && lista(sj.j.masini).length === 2 && sj.j.masini[0].combustibil === 'gpl' && sj.j.masini[0].buc === 5
    && sj.j.probleme.some((x) => x.rand === rA + 3 && /modelul/.test(x.ce)), sj.status + ' ' + sj.text.slice(0, 160));
  const sjRau = await json('POST', '/api/admin/masini/sablon', telNou, { fisier: 'x.xlsx', b64: Buffer.from('nu e excel').toString('base64') });
  const sjGol = await json('POST', '/api/admin/masini/sablon', telNou, { fisier: 'x.xlsx' });
  T('...un fișier care nu e Excel → 400 pe înțeles; fără fișier → 400', sjRau.status === 400 && /șablonul Excel/.test(sjRau.j.error || '') && sjGol.status === 400 && /Alege șablonul/.test(sjGol.j.error || ''), sjRau.text + ' / ' + sjGol.text);
  T('...și tot doar al nostru', (await json('POST', '/api/admin/masini/sablon', { token: telSef.token, app: '1.0.4' }, { fisier: 'x.xlsx', b64 })).status === 403);
  // Un .xlsx e o arhivă: ~300 KB arhivat, 300 MB dezarhivat. Pe calea telefonului se numără octeții dezarhivați
  // înainte de citire — altfel un fișier trimis de un client putea opri serverul (găsit 29.09).
  const JSZipB = require('jszip');
  const zb = new JSZipB();
  zb.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zb.file('xl/umflat.xml', Buffer.alloc(300 * 1024 * 1024, 0x20));
  const bomba = await zb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const tB = Date.now();
  const sjBomba = await json('POST', '/api/admin/masini/sablon', telNou, { fisier: 'flota.xlsx', b64: bomba.toString('base64') });
  T('...un Excel mic care se umflă la dezarhivare e refuzat pe calea telefonului, repede, și serverul răspunde mai departe',
    sjBomba.status === 400 && /șablonul Excel/.test(sjBomba.j.error || '') && Date.now() - tB < 15000 && (await fetch(B + '/api')).ok, sjBomba.status + ' · ' + (Date.now() - tB) + ' ms');

  sect('13. Telefonul arată ce vine de la server — nu hotărăște nimic singur');
  const calcTel2 = citeste('mobile/src/screens/OfferCalc.tsx'), msTel = citeste('mobile/src/components/MasiniClient.tsx');
  const epTel = citeste('mobile/src/api/endpoints.ts'), trimTel = citeste('mobile/src/lib/trimiteFisier.ts');
  T('calculatorul trimite lista, comutatorul și „Aplică recomandarea" la fiecare socoteală',
    /corp\.masini = msRef\.current\.map/.test(calcTel2) && /corp\.masiniMotor = /.test(calcTel2) && /canMod: canModRef\.current/.test(calcTel2) && /corp\.aplicaRecomandarea = true/.test(calcTel2));
  T('...dar NU trimite o listă pe care serverul nu i-a dat-o (una goală ar șterge lista ofertei)', /if \(areListaRef\.current\) \{\s*corp\.masini/.test(calcTel2));
  T('arată sfaturile, refuzul hârtiei și linkul de lângă chirie, din răspunsul serverului',
    /res\.html\.sfatFlota/.test(calcTel2) && /res\.html\.sfatMontaj/.test(calcTel2) && /j\.hartieEroare/.test(calcTel2) && /class="of-eq" onClick=\{laClic\}/.test(calcTel2)
      && /closest\('\[data-act\]'\)/.test(calcTel2) && /act === 'canMod'/.test(calcTel2) && /act === 'aplicaRec'/.test(calcTel2));
  const liWeb = ((HTML.match(/<details class="raof-intrebari">[\s\S]*?<\/details>/) || [''])[0].match(/<li>([^<]*)<\/li>/g) || []).map((x) => x.replace(/<\/?li>/g, ''));
  const liTel = ((calcTel2.match(/<details class="of-intrebari">[\s\S]*?<\/details>/) || [''])[0].match(/<li>([^<]*)<\/li>/g) || []).map((x) => x.replace(/<\/?li>/g, ''));
  T('cele 7 întrebări de pus clientului, cuvânt cu cuvânt ca pe web', liWeb.length === 7 && egal(liTel, liWeb), JSON.stringify(liTel.filter((x) => liWeb.indexOf(x) < 0)));
  const candWeb = (HTML.slice(HTML.indexOf('var montajCard = card('), HTML.indexOf('var deviceCard = card(')).match(/cand\('([^']*)'\)/g) || []).map((x) => x.slice(6, -2));
  T('sub fiecare lucrare de montaj, când se folosește — aceleași 7 texte ca pe web', candWeb.length === 7 && candWeb.every((t) => calcTel2.indexOf("'" + t + "'") >= 0), JSON.stringify(candWeb.filter((t) => calcTel2.indexOf("'" + t + "'") < 0)));
  T('lista mașinilor nu alege aparate și nu caută singură în listele Teltonika (nici potrivire, nici reguli)',
    !!msTel && !/masini\/potrivire|fmc130_lvcan|'fmc650'|_ofRecDinMasini|_ofRecomandare|recomanda\(/.test(msTel + calcTel2));
  T('șablonul: descărcat de la server (numele din antet), urcat în JSON pe ușa lui; lista Teltonika — crud, pe ușa web-ului',
    /salveazaDeLaServer\('\/api\/admin\/masini\/sablon', 'RA-Tracks - Șablon mașini client\.xlsx'\)/.test(msTel) && /masiniSablonCiteste\(/.test(msTel)
      && /masiniSablonCiteste: [\s\S]{0,200}'\/api\/admin\/masini\/sablon', \{ method: 'POST'/.test(epTel) && /trimiteFisierCrud\('\/api\/admin\/masini\/liste'/.test(msTel)
      && /dataType: 'file'/.test(trimTel) && /'X-Fisier': encodeURIComponent\(f\.name\)/.test(msTel));
  T('...și întreabă înainte să înlocuiască o listă începută', /fel: 'inlocuieste'/.test(msTel) && /'Lista are deja ' \+ nrDe\(foaie\.acum, 'mașină', 'mașini'\)/.test(msTel));
  T('lista de oferte arată pastila „închiriere"', /cfg\.echipMod === 'inchiriaza' \? <span class="of-chirie"[^>]*>închiriere<\/span>/.test(citeste('mobile/src/screens/Offers.tsx')));

  // La urmă: o listă nouă schimbă potrivirile, deci n-are voie să atingă verificările de mai sus.
  sect('14. O listă Teltonika nouă, urcată de pe telefon: mărcile și modelele propuse o cuprind');
  // Pe web, `raxOfListaIncarca` uită mărcile și modelele ținute minte și le cere din nou. Telefonul le ținea pe
  // cele de la deschidere: o marcă aflată doar în lista nouă nu era propusă până nu redeschideai calculatorul.
  const incWeb = HTML.slice(HTML.indexOf('window.raxOfListaIncarca = async function'), HTML.indexOf('// ── sfârșit „mașinile clientului" ──'));
  const incTel = msTel.slice(msTel.indexOf('async function incarcaLista('), msTel.indexOf('const inchideFoaia'));
  T('după încărcare, telefonul cere din nou mărcile și uită modelele ținute minte — ca pagina web',
    /_ofMsMarci = null; _ofMsModele = \{\}/.test(incWeb) && /modele\.current = \{\}/.test(incTel) && /incarcaMarci\(\);[\s\S]*p\.onListeNoi\(\)/.test(incTel)
      && /function incarcaMarci\(\) \{[\s\S]{0,120}Api\.masiniMarci\(\)[\s\S]{0,40}g === genMarci\.current/.test(msTel)
      && /c = modele\.current;[\s\S]{0,160}c\[m\] = Array\.isArray/.test(msTel));
  const ANTET_LV = ['NO', 'Brand', 'Model', 'year', 'program №', 'program date', 'Number of CAN BUSes to be connected', 'Flags', 'Ignition',
    'Engine is working on LPG', 'Total mileage of the vehicle (dashboard)', 'Vehicle mileage - (counted)', 'Total fuel consumption',
    'Total fuel consumption - (counted)', 'Fuel level (in percent)', 'Total LPG use – (counted)', 'LPG level (in percent)', 'HV battery level'];
  const wbL = new ExcelJS.Workbook(), wsL = wbL.addWorksheet('Cars');
  wsL.addRow([]); wsL.addRow(ANTET_LV); wsL.addRow([]);
  for (let i = 1; i <= 24; i++) wsL.addRow([i, 'TELPROBA', 'ZETA' + i, '2020>', String(91000 + i), 'from 2026-01-01', '1', '+', '+', '', '+', '', '', '+', '+', '', '', '']);
  const xlsxL = Buffer.from(await wbL.xlsx.writeBuffer());
  const marciInainte = lista((await json('GET', '/api/admin/masini/marci', telNou)).j.marci);
  // Exact cererea telefonului (`trimiteFisierCrud`): crud, cu cheia lui și antetul aplicației, pe ușa web-ului.
  const upL = await fetch(B + '/api/admin/masini/liste', { method: 'POST', body: xlsxL, headers: { 'Content-Type': 'application/octet-stream',
    'X-RA-App': '1.0.4', Authorization: 'Bearer ' + tel.token, 'X-Fisier': encodeURIComponent('LV-CAN200_list_2026_09_01_en.xlsx') } });
  const jL = await upL.json().catch(() => ({}));
  T('lista urcă de pe telefon și răspunsul aduce listele de acum (foaia „Listele Teltonika" se reface din el)',
    upL.status === 200 && jL.tip === 'lvcan' && jL.n === 24 && lista(jL.liste).some((l) => l.tip === 'lvcan' && l.sursa === 'incarcata' && l.n === 24),
    upL.status + ' ' + JSON.stringify(jL).slice(0, 200));
  const marciDupa = lista((await json('GET', '/api/admin/masini/marci', telNou)).j.marci);
  const modeleDupa = lista((await json('GET', '/api/admin/masini/modele?marca=' + encodeURIComponent('Telproba'), telNou)).j.modele);
  T('...mărcile cerute din nou o cuprind pe cea care e doar în lista nouă', !marciInainte.includes('Telproba') && marciDupa.includes('Telproba'),
    JSON.stringify({ inainte: marciInainte.includes('Telproba'), dupa: marciDupa.filter((x) => /^Te/.test(x)) }));
  T('...și modelele ei', modeleDupa.length === 24 && modeleDupa[0] === 'ZETA1' && modeleDupa.includes('ZETA24'), JSON.stringify(modeleDupa.slice(0, 5)));

  console.log('\n' + (rele ? '✗ ' + rele + ' verificări au picat' : '✓ toate cele ' + ok + ' verificări au trecut'));
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
