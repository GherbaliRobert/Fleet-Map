// verify_alerte_motor.js — Alertele de pornire / oprire a motorului și marja alertelor de viteză (26.10; Alin: „2. da", „1. da").
// Ce apără:
//   1. regula frazei (propuneri.js): când sună de fapt o alertă de viteză (pragul + marja, cel puțin baza + marja) — aceeași frază
//      în cartonașul din RA Insight și pe ecranul Alerte;
//   2. serverul (cod): „Pornire motor" / „Oprire motor" = SCHIMBAREA contactului față de poziția de DINAINTE (citită înainte ca
//      poziția nouă să intre în harta live), record cu record în pachet; răcirea, o singură cifră;
//   3. pagina: nota de sub „Viteză max" (de la server), „sună peste …" pe rândul regulii;
//   4. pe server pornit, cu poziții trimise pe TCP ca de la un aparat adevărat (codec 8): „Pornire motor" sună O DATĂ pe pornire
//      (nu la fiecare răcire cât contactul stă pornit), „Oprire motor" SUNĂ, un pachet cu pornire + oprire le dă pe amândouă,
//      viteza sună abia peste pragul + marja. Răcirea e coborâtă la 1,2 s (ALERTE_RACIRE_MS), ca să se vadă ce sună după ea.
//
//   node verify_alerte_motor.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn } = require('child_process');
const propuneri = require('./propuneri');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const SRV = citeste('server.js'), PAG = citeste('public/index.html');

// ─── 1. Fraza ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Când sună o alertă de viteză (propuneri.js, fără server)');
const marja = { baza: 50, marja: 10 };
T('prag 130 → „sună cu 10 km/h peste prag: când trece de 140 km/h" (aceeași frază ca pe cartonașul din RA Insight)',
  propuneri.textMarjaViteza(130, marja) === 'Ca toate alertele de viteză din aplicație, sună cu 10 km/h peste prag: când trece de 140 km/h.', propuneri.textMarjaViteza(130, marja));
T('prag 30 (sub baza motorului) → „sună când trece de 60 km/h", cu motivul spus pe față (30 + 10 ar fi mințit)',
  propuneri.textMarjaViteza(30, marja) === 'Sună când trece de 60 km/h: pragul cel mai mic al alertelor de viteză e 50 km/h, iar toate sună cu 10 km/h peste prag.', propuneri.textMarjaViteza(30, marja));
T('fără prag (regula de bază a motorului) → tot 60 km/h; fără marjă → nimic de spus peste prag',
  /trece de 60 km\/h/.test(propuneri.textMarjaViteza(null, marja)) && propuneri.textMarjaViteza(90, { baza: 50, marja: 0 }) === '');
T('răcirea, în cuvinte: „cel mult o dată la 5 minute"', propuneri.textRacireViteza() === 'Cât timp mașina merge peste, sună cel mult o dată la 5 minute.', propuneri.textRacireViteza());
const card = propuneri.cardAlerta({ prag: 30, imei: '', optiuni: [], sim: { ori: 0, masini: 0 }, marja, poate: true, acum: Date.now() });
T('cartonașul din RA Insight folosește ACEEAȘI frază (la un prag de 30 spune 60, nu 40)', card.dovezi.some((d) => d.text === propuneri.textMarjaViteza(30, marja)) && !card.dovezi.some((d) => /trece de 40 km/.test(d.text)), JSON.stringify(card.dovezi));

// ─── 2. Serverul (cod) ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Serverul (cod)');
const EVAL = SRV.slice(SRV.indexOf('async function evaluateAlerts('), SRV.indexOf('function haversineDistance('));
const ING = SRV.slice(SRV.indexOf('if (liveRec) {'), SRV.indexOf("socket.on('close'", SRV.indexOf('if (liveRec) {')));
T('motorul de alerte primește schimbarea contactului (al treilea argument), nu o mai caută în harta live',
  /async function evaluateAlerts\(imei, data, contact\)/.test(SRV) && /case 'ignition_on':\s*if \(contact && contact\.pornit\)/.test(EVAL) && /case 'ignition_off':\s*if \(contact && contact\.oprit\)/.test(EVAL) &&
  !/livePositions\.get\(imei\)/.test(EVAL.slice(EVAL.indexOf("case 'ignition_on'"), EVAL.indexOf("case 'dtc_error'"))));
T('la primire, schimbarea se socotește din poziția de DINAINTE (`existing`, citită înainte de livePositions.set) și din tot pachetul',
  /const existing = livePositions\.get\(imei\) \|\| \{\};/.test(ING) && ING.indexOf('const existing = livePositions.get(imei)') < ING.indexOf('livePositions.set(imei, liveData)') &&
  /const _contact = _schimbariContact\(existing, parsed\.records\);/.test(ING) && /evaluateAlerts\(imei, liveData, _contact\)/.test(ING));
T('O singură chemare a motorului de alerte', (SRV.match(/evaluateAlerts\(/g) || []).length === 2);
T('răcirea: O cifră (ALERTE_RACIRE_MS = propuneri.RACIRE_MS, aceeași cu care cartonașul socotește „din ultimele 30 de zile")',
  /const ALERTE_RACIRE_MS = Number\(process\.env\.ALERTE_RACIRE_MS\) > 0 \? Number\(process\.env\.ALERTE_RACIRE_MS\) : propuneri\.RACIRE_MS;/.test(SRV) &&
  (EVAL.match(/< ALERTE_RACIRE_MS/g) || []).length === 2 && !/< 300000/.test(EVAL));
// _schimbariContact, rulată: decupată din server, cu propriii ei ajutori.
const SC = SRV.slice(SRV.indexOf('function _contactDin('), SRV.indexOf('async function evaluateAlerts('));
const sc = new Function(SC + '\nreturn _schimbariContact;')();
const rec = (t, ign) => ({ timestamp: t, io: ign == null ? {} : { ignition: ign } });
T('pornit → oprit în același pachet: amândouă; ordinea e a timpului, nu a pachetului', JSON.stringify(sc({ timestamp: 0, io: { ignition: 0 } }, [rec(20, 0), rec(10, 1)])) === '{"pornit":true,"oprit":true}');
T('contactul stă pornit → nicio pornire; prima poziție după o repornire (fără stare de dinainte) → nimic', JSON.stringify(sc({ timestamp: 5, io: { ignition: 1 } }, [rec(10, 1), rec(20, 1)])) === '{"pornit":false,"oprit":false}' &&
  JSON.stringify(sc({}, [rec(10, 1)])) === '{"pornit":false,"oprit":false}');
T('true/false și "1"/"0" se citesc la fel; un record fără contact nu strică nimic; un record mai vechi decât harta live nu contează',
  JSON.stringify(sc({ timestamp: 5, io: { ignition: false } }, [rec(10, null), rec(12, true)])) === '{"pornit":true,"oprit":false}' &&
  JSON.stringify(sc({ timestamp: 50, io: { ignition: '1' } }, [rec(10, 0), rec(60, '1')])) === '{"pornit":false,"oprit":false}');
T('GET /api/alerts pune pe regula de viteză „suna_peste" (propuneri.pragEfectiv, cu baza și marja motorului)',
  /res\.json\(alerts\.map\(_sunaPeste\)\)/.test(SRV) && /suna_peste: propuneri\.pragEfectiv\(c\.maxSpeed, _MARJA_VITEZA\)/.test(SRV) && /const _MARJA_VITEZA = \{ baza: SPEED_ALERT_BASE, marja: SPEED_ALERT_MARGIN \};/.test(SRV));

// ─── 3. Pagina ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Pagina (ecranul Alerte)');
T('sub „Viteză max": nota, cu fraza de la server (/api/alerts/viteza), refăcută la fiecare cifră și la deschiderea unei reguli',
  /\{k:'maxSpeed',label:'Viteză max \(km\/h\)',def:90,nota:true\}/.test(PAG) && /id="alert-cf-nota" class="alr-cf-nota"/.test(PAG) && /fetch\('\/api\/alerts\/viteza\?prag=' \+ encodeURIComponent\(val \|\| ''\)\)/.test(PAG) &&
  /el\.textContent = r\.ok \? \(j\.text \|\| ''\) : ''/.test(PAG) && /alertCfNota\(\);\s+\/\/ nota de sub prag/.test(PAG));
T('pe rândul regulii: „sună peste … km/h", din cifra serverului (pagina nu socotește marja)',
  /typeof a\.suna_peste === 'number' \? '<span class="alr-suna">sună peste ' \+ a\.suna_peste \+ ' km\/h<\/span>'/.test(PAG) && !/SPEED_ALERT|\+ 10\b/.test(PAG.slice(PAG.indexOf('function alertCfNota'), PAG.indexOf('function alertZonesCount'))));
T('culorile notei: textul secundar al temei (pereche pe ambele teme)', /\.alr-suna \{[^}]*color: var\(--text-secondary\)/.test(PAG) && /\.alr-cf-nota \{[^}]*color: var\(--text-secondary\)/.test(PAG));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3373, TCP = 5373, RACIRE = 1200;
const DIR = path.join(os.tmpdir(), 'rax_alerte_motor_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_alerte_motor', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false', STRICT_DEVICES: 'false',
  ALERTE_RACIRE_MS: String(RACIRE), GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_TIMEOUT_MS: '300',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST', 'SPEED_ALERT_BASE', 'SPEED_ALERT_MARGIN'].forEach((k) => { delete env[k]; });
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, pw) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cine) h.Cookie = cine;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}

// Pachet Teltonika codec 8 cu unul sau mai multe recorduri (constructorul din verify_geo_alerts.js, cu N recorduri).
const IMEI = '860000000033301';
function pachet(recs) {
  const bucati = recs.map((r) => {
    const unu = [[239, r.ign & 0xff]];
    const io = Buffer.concat([Buffer.from([0x00, unu.length, unu.length]), Buffer.concat(unu.map(([id, v]) => Buffer.from([id, v]))), Buffer.from([0, 0, 0])]);
    const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(r.ts), 0);
    const gps = Buffer.alloc(15);
    gps.writeInt32BE(Math.round(r.lng * 1e7), 0); gps.writeInt32BE(Math.round(r.lat * 1e7), 4);
    gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(r.v, 13);
    return Buffer.concat([tsb, Buffer.from([0x01]), gps, io]);
  });
  const data = Buffer.concat([Buffer.from([0x08, recs.length])].concat(bucati).concat([Buffer.from([recs.length])]));
  const cap = Buffer.alloc(8); cap.writeUInt32BE(0, 0); cap.writeUInt32BE(data.length, 4);
  return Buffer.concat([cap, data, Buffer.alloc(4)]);
}
let _ts = Date.now() - 30 * 60000, _lng = 26.10;
function trimite(lista) {   // lista = [[contact, viteză], …] — un pachet cu un record pe element, timpul crescător
  const recs = lista.map(([ign, v]) => { _ts += 20000; _lng += 0.001; return { ts: _ts, lat: 44.43, lng: _lng, v: v || 0, ign: ign ? 1 : 0 }; });
  const pkt = pachet(recs);
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0;
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const len = Buffer.alloc(2); len.writeUInt16BE(im.length, 0); s.write(Buffer.concat([len, im])); });
    s.on('data', () => { if (pas === 0) { pas = 1; s.write(pkt); } else { s.end(); resolve(true); } });
    s.on('error', () => resolve(false));
    setTimeout(() => { try { s.end(); } catch (e) {} resolve(false); }, 4000);
  });
}

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit (poziții pe TCP, codec 8; răcirea coborâtă la ' + RACIRE + ' ms)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const co = (await json('POST', '/api/companies', S, { name: 'Transport Motor SRL' })).j;
  await json('POST', '/api/devices', S, { imei: IMEI, name: 'Dacia Logan', plate: 'B 154 UIP', company_id: co.id });
  const regula = async (name, type, condition) => (await json('POST', '/api/alerts', S, { name, type, imei: IMEI, enabled: true, condition: condition || {}, company_id: co.id })).j;
  const rOn = await regula('Pornire Logan', 'ignition_on'), rOff = await regula('Oprire Logan', 'ignition_off');
  const rV90 = await regula('Viteză 90', 'overspeed', { maxSpeed: 90 }), rV30 = await regula('Viteză 30', 'overspeed', { maxSpeed: 30 }), rV0 = await regula('Viteză fără prag', 'overspeed', { maxSpeed: null });
  T('cinci reguli puse (pornire, oprire, trei de viteză)', [rOn, rOff, rV90, rV30, rV0].every((r) => r && r.id));

  const lst = (await json('GET', '/api/alerts', S)).j;
  const sp = (id) => ((Array.isArray(lst) ? lst : []).find((a) => a.id === id) || {}).suna_peste;
  T('lista regulilor: „sună peste" 100 (prag 90), 60 (prag 30), 60 (fără prag); pe pornire nimic', sp(rV90.id) === 100 && sp(rV30.id) === 60 && sp(rV0.id) === 60 && sp(rOn.id) === undefined, JSON.stringify([sp(rV90.id), sp(rV30.id), sp(rV0.id), sp(rOn.id)]));
  const n130 = await json('GET', '/api/alerts/viteza?prag=130', S), n0 = await json('GET', '/api/alerts/viteza?prag=', S), nx = await json('GET', '/api/alerts/viteza?prag=abc', S);
  T('nota de sub prag (130): sună peste 140, cu marja și răcirea spuse', n130.status === 200 && n130.j.sunaPeste === 140 && n130.j.text === propuneri.textMarjaViteza(130, marja) + ' ' + propuneri.textRacireViteza(), n130.text);
  T('…fără prag: 60; un prag stricat: 400', n0.j.sunaPeste === 60 && nx.status === 400, n0.text + ' ' + nx.status);
  T('…și fără cont: 401', (await json('GET', '/api/alerts/viteza?prag=130', null)).status === 401);

  const cate = async () => {
    const h = (await json('GET', '/api/alerts/history?limit=500', S)).j;
    const c = {};
    (Array.isArray(h) ? h : []).filter((x) => x.imei === IMEI).forEach((x) => { c[x.alert_id] = (c[x.alert_id] || 0) + 1; });
    return { on: c[rOn.id] || 0, off: c[rOff.id] || 0, v90: c[rV90.id] || 0, v30: c[rV30.id] || 0, v0: c[rV0.id] || 0 };
  };
  const pas = async (lista) => { const r = await trimite(lista); await sleep(RACIRE + 500); return r; };

  T('aparatul vorbește (primul pachet, contact oprit, confirmat)', await pas([[0, 0]]));
  let c = await cate();
  T('contact oprit de la început → nicio alertă', c.on === 0 && c.off === 0, JSON.stringify(c));
  await pas([[1, 0]]);
  c = await cate();
  T('PORNIRE (oprit → pornit) → „Pornire motor" o dată', c.on === 1 && c.off === 0, JSON.stringify(c));
  await pas([[1, 20]]); await pas([[1, 40]]); await pas([[1, 30]]);
  c = await cate();
  T('contactul stă pornit, după trei răciri → tot o dată (înainte: încă trei)', c.on === 1, JSON.stringify(c));
  await pas([[0, 0]]);
  c = await cate();
  T('OPRIRE (pornit → oprit) → „Oprire motor" sună (înainte nu suna niciodată)', c.off === 1 && c.on === 1, JSON.stringify(c));
  await pas([[0, 0]]);
  c = await cate();
  T('stă oprit → nimic în plus', c.off === 1 && c.on === 1, JSON.stringify(c));
  await pas([[1, 10], [1, 15], [0, 0]]);
  c = await cate();
  T('un pachet cu pornire ȘI oprire (pornit 40 s, apoi oprit) → amândouă', c.on === 2 && c.off === 2, JSON.stringify(c));

  await pas([[1, 95]]);
  c = await cate();
  T('95 km/h: regula de 90 NU sună (sună peste 100); cele de 30 și fără prag sună (peste 60)', c.v90 === 0 && c.v30 === 1 && c.v0 === 1, JSON.stringify(c));
  await pas([[1, 101]]);
  c = await cate();
  T('101 km/h: regula de 90 sună', c.v90 === 1, JSON.stringify(c));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e)); gata(1); });
