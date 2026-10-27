// verify_alerte_stare.js — Alertele „de stare" sună la apariție, nu la fiecare 5 minute (27.10; Alin: „da" la punctele 1, 3, 4).
// Ce apără:
//   1. regula (alerte_stare.js), rulată pe zile întregi de poziții: plăcuțele sub prag 8 ore = UN anunț (înainte ~96); cât ține,
//      o amintire la 24 de ore; „pâlpâitul" sub 30 de minute nu sună din nou; revenirea după 30 de minute de normal sună; o poziție
//      fără datele motorului nu schimbă nimic; după o repornire, ultima sonerie din istoric oprește un anunț dublu;
//   2. ce citește regula din datele aparatului — aceleași câmpuri în anunț ca înainte de 27.10;
//   3. serverul (cod): cele 8 tipuri trec prin regula asta, se citesc la fiecare poziție, ultima sonerie din istoric doar la nevoie;
//      ecranul Alerte primește „cum sună" de la server;
//   4. pagina: rândul regulii și fraza din fereastră (de la server), câmpul „Vehicul" corect la „Modifică", pastila pragului lizibilă
//      pe tema deschisă (contrastul socotit din culorile din CSS);
//   5. pe server pornit, cu poziții pe TCP ca de la un aparat (codec 8, datele motorului): erorile de motor și plăcuțele sună O DATĂ,
//      chiar după mai multe răciri; o poziție fără datele motorului nu schimbă nimic; după o REPORNIRE a serverului nu sună din nou.
//      Răcirea e coborâtă la 0,8 s (ALERTE_RACIRE_MS): pe regula veche s-ar fi văzut un anunț la fiecare pachet.
//
//   node verify_alerte_stare.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn } = require('child_process');
const A = require('./alerte_stare');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const SRV = citeste('server.js'), PAG = citeste('public/index.html'), CSS = citeste('public/css/app.css');
const MIN = 60000, ORA = 60 * MIN;

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Regula (alerte_stare.js, fără server)');
// O zi de poziții la 30 de secunde: f(t) dă starea (true / false / null) la minutul t. Întoarce minutele la care a sunat.
function zi(minute, f, s0) {
  const s = s0 || A.stareNoua(null), sunat = [];
  for (let t = 0; t <= minute; t += 0.5) { if (A.suna(s, f(t), t * MIN)) sunat.push(t); }
  return sunat;
}
const opt = zi(8 * 60, () => true);
T('plăcuțele sub prag 8 ore de mers (o poziție la 30 s) → UN anunț, la început (pe regula veche: ~96)', opt.length === 1 && opt[0] === 0, JSON.stringify(opt));
const doua = zi(25 * 60, () => true);
T('starea ține 25 de ore → al doilea anunț abia după 24 de ore (amintirea zilnică)', doua.length === 2 && doua[1] === 24 * 60, JSON.stringify(doua));
const palp = zi(3 * 60, (t) => Math.floor(t / 10) % 2 === 0);
T('„pâlpâie" (10 minute da, 10 minute nu, 3 ore) → tot UN anunț: o revenire sub 30 de minute e aceeași stare', palp.length === 1, JSON.stringify(palp));
const rev = zi(3 * 60, (t) => t < 20 || t >= 60);
T('trece și revine după 40 de minute de normal → sună din nou (o stare nouă)', JSON.stringify(rev) === '[0,60]', JSON.stringify(rev));
const goale = zi(3 * 60, (t) => (t < 10 ? true : (t < 100 ? null : true)));
T('poziții fără datele motorului (90 de minute, motorul oprit) nu „termină" starea → la revenire nu sună iar', goale.length === 1, JSON.stringify(goale));
const nimic = zi(60, () => false).concat(zi(60, () => null));
T('normal sau fără date → niciun anunț', nimic.length === 0);
T('după o REPORNIRE: ultima sonerie din istoric acum 2 ore → nu sună; acum 25 de ore → sună',
  zi(30, () => true, A.stareNoua(-2 * ORA)).length === 0 && zi(30, () => true, A.stareNoua(-25 * ORA)).length === 1);
T('după o repornire, o stare care TRECE și revine după 30 de minute sună (chiar dacă a sunat de curând)',
  JSON.stringify(zi(80, (t) => !(t >= 5 && t < 45), A.stareNoua(-ORA))) === '[45]');
T('cifrele: o amintire la 24 de ore, revenirea după 30 de minute; tipurile „de stare" sunt cele 8', A.AMINTIRE_MS === 24 * ORA && A.REARMARE_MS === 30 * MIN &&
  A.DE_STARE.join() === 'dtc_error,engine_temp,overload_legal,overload_construct,axle_overload,pto_active,brake_pad_wear,service_due' &&
  !A.eDeStare('overspeed') && !A.eDeStare('ignition_on') && !A.eDeStare('geofence_enter') && !A.eDeStare('idle_engine') && !A.eDeStare('fuel_drop'));

// ─── 2. Ce citește din datele aparatului ────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Ce citește regula din datele aparatului');
const sd = (tip, io, cond) => JSON.stringify(A.stareDin(tip, io, cond));
T('erori de motor: 2 → în stare (dtcCount 2, ca în anunțul vechi); 0 → normal; lipsă → nu știm',
  sd('dtc_error', { can_dtc_errors: 2 }) === '{"stare":true,"date":{"dtcCount":2}}' && sd('dtc_error', { can_dtc_errors: 0 }) === '{"stare":false}' && sd('dtc_error', {}) === '{"stare":null}');
T('temperatura: 110 peste 105 → în stare; 90 → normal; fără prag („gol = dezactivat") sau fără valoare → nu știm',
  sd('engine_temp', { can_engine_temp: 110 }, { maxTemp: 105 }) === '{"stare":true,"date":{"temp":110,"limit":105}}' && sd('engine_temp', { can_engine_temp: 90 }, { maxTemp: 105 }) === '{"stare":false}' &&
  sd('engine_temp', { can_engine_temp: 110 }, { maxTemp: null }) === '{"stare":null}' && sd('engine_temp', {}, { maxTemp: 105 }) === '{"stare":null}');
T('suprasarcina: suma axelor peste limită → în stare, cu axele; fără greutăți → nu știm',
  sd('overload_legal', { can_axle1_load: 21000, can_axle2_load: 22000 }, { maxKg: 40000 }) === '{"stare":true,"date":{"totalKg":43000,"limit":40000,"axles":[21000,22000,0,0,0]}}' &&
  sd('overload_construct', { can_load_weight: 30000 }, { maxKg: 44000 }) === '{"stare":false}' && sd('overload_legal', {}, { maxKg: 40000 }) === '{"stare":null}');
T('o axă peste limita ei → în stare (axa, sarcina, limita); axele cunoscute sub limită → normal; fără nicio axă cu limită → nu știm',
  sd('axle_overload', { can_axle2_load: 12000 }, { axleLimits: { axle2: 11500 } }) === '{"stare":true,"date":{"axle":2,"load":12000,"limit":11500}}' &&
  sd('axle_overload', { can_axle2_load: 9000 }, { axleLimits: { axle2: 11500 } }) === '{"stare":false}' && sd('axle_overload', { can_axle2_load: 9000 }, { axleLimits: {} }) === '{"stare":null}');
T('priza de putere: 1 / true → în stare; 0 → normal; lipsă → nu știm',
  sd('pto_active', { can_pto_active: 1 }) === '{"stare":true,"date":{"event":"PTO activat"}}' && sd('pto_active', { can_pto_active: true }).indexOf('"stare":true') > 0 &&
  sd('pto_active', { can_pto_active: 0 }) === '{"stare":false}' && sd('pto_active', {}) === '{"stare":null}');
T('plăcuțele: 15% sub pragul de 20 → în stare (axa, uzura, pragul); 50% → normal; null nu mai înseamnă „sub prag" (pe regula veche suna)',
  sd('brake_pad_wear', { can_brake_pad_axle1: 15 }, { minPercent: 20 }) === '{"stare":true,"date":{"axle":1,"wear":15,"threshold":20}}' &&
  sd('brake_pad_wear', { can_brake_pad_axle1: 50 }, {}) === '{"stare":false}' && sd('brake_pad_wear', { can_brake_pad_axle1: null }, {}) === '{"stare":null}');
T('revizia: 600 km sub 1.000 → în stare; 5.000 → normal; null / lipsă → nu știm',
  sd('service_due', { can_distance_to_service: 600 }, {}) === '{"stare":true,"date":{"distanceToService":600,"threshold":1000}}' &&
  sd('service_due', { can_distance_to_service: 5000 }, {}) === '{"stare":false}' && sd('service_due', { can_distance_to_service: null }, {}) === '{"stare":null}');

// ─── 3. Serverul (cod) ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Serverul (cod)');
const EVAL = SRV.slice(SRV.indexOf('async function evaluateAlerts('), SRV.indexOf('function haversineDistance('));
const CAZ = EVAL.slice(EVAL.indexOf("case 'dtc_error':"), EVAL.indexOf("case 'geofence_exit':"));
T('cele 8 tipuri „de stare" sunt UN singur caz, care cheamă regula (alerteStare.stareDin + _stareSuna)',
  ['dtc_error', 'engine_temp', 'overload_legal', 'overload_construct', 'axle_overload', 'pto_active', 'brake_pad_wear', 'service_due'].every((t) => (EVAL.match(new RegExp("case '" + t + "':", 'g')) || []).length === 1 && CAZ.indexOf("case '" + t + "':") >= 0) &&
  /const r = alerteStare\.stareDin\(alert\.type, io, cond\);\s+if \(await _stareSuna\(cooldownKey, alert\.id, imei, r\.stare\)\)/.test(CAZ));
T('se citesc la FIECARE poziție (răcirea de 5 minute de la intrare nu le sare), ca sfârșitul stării să fie văzut',
  /if \(!_isGeo && !alerteStare\.eDeStare\(alert\.type\)\) \{\s+const lastTriggered = alertCooldowns\.get\(cooldownKey\);/.test(EVAL));
const SS = SRV.slice(SRV.indexOf('async function _stareSuna('), SRV.indexOf('function _contactDin('));
T('după o repornire, ultima sonerie se citește din istoric O DATĂ pe regulă și mașină, doar când starea e de față',
  /if \(stare === true\) \{ try \{ sunatLa = await db\.ultimaAlertaSunata\(alertId, imei\); \}/.test(SS) && /_stariAlerte\.set\(cheie, s\);/.test(SS) &&
  /return alerteStare\.suna\(s, stare, Date\.now\(\)\);/.test(SS) && /async function ultimaAlertaSunata\(alertId, imei\)/.test(citeste('db.js')));
T('starea neatinsă de o săptămână iese din memorie (curățenia de la ceas)', /for \(const \[k, s\] of _stariAlerte\) if \(now - \(s\.atins \|\| 0\) > 7 \* 24 \* 3600000\) _stariAlerte\.delete\(k\);/.test(SRV));
T('ecranul Alerte: „cum sună" pe fiecare regulă „de stare" și fraza pentru fereastră — de la server',
  /if \(alerteStare\.eDeStare\(a\.type\)\) return Object\.assign\(\{\}, a, \{ cum_suna: alerteStare\.RAND \}\);/.test(SRV) &&
  /app\.get\('\/api\/alerts\/cum-suna', requireAuth, \(req, res\) => \{\s+res\.json\(\{ deStare: alerteStare\.DE_STARE, text: alerteStare\.TEXT \}\);/.test(SRV));

// ─── 4. Pagina ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. Pagina (ecranul Alerte)');
T('rândul regulii: „sună la apariție, apoi o dată pe zi" (textul serverului, cu esc)', /\(a\.cum_suna \? '<span class="alr-suna">' \+ esc\(a\.cum_suna\) \+ '<\/span>' : ''\)/.test(PAG));
T('fereastra regulii: fraza de la server sub câmpuri, doar la tipurile „de stare" (cerută o dată; o eroare nu rămâne ținută minte)',
  /const cs = await _alertCumSunaIa\(\);/.test(PAG) && /cs\.deStare\.indexOf\(type\) >= 0/.test(PAG) && /n\.id = 'alert-cf-stare'; n\.className = 'alr-cf-nota'; n\.textContent = cs\.text \|\| '';/.test(PAG) &&
  /fetch\('\/api\/alerts\/cum-suna'\)/.test(PAG) && /if \(!j\) _alertCumSuna = null;/.test(PAG) && !/Sună când apare/.test(PAG));
const EDIT = PAG.slice(PAG.indexOf('async function editAlert(a)'), PAG.indexOf('async function saveAlert()'));
const RESET = PAG.slice(PAG.indexOf('function resetAlertForm(close)'), PAG.indexOf('async function editAlert(a)'));
T('„Modifică": după ce pune mașina regulii, câmpul vizibil se sincronizează (arăta „Toate vehiculele"); la „Regulă nouă" la fel',
  /g\('alert-imei'\)\.value = a\.imei \|\| '';[\s\S]{0,400}if \(g\('alert-imei'\)\._ssSync\) g\('alert-imei'\)\._ssSync\(\);/.test(EDIT) &&
  /g\('alert-imei'\)\.value = ''; if \(g\('alert-imei'\)\._ssSync\) g\('alert-imei'\)\._ssSync\(\);/.test(RESET));
// Pastila pragului: contrastul pe tema deschisă, socotit din culorile scrise în pagină și fundalul rândului (--bg-dark, tema deschisă).
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const radacina = CSS.slice(CSS.indexOf(':root'), CSS.indexOf('}', CSS.indexOf(':root')));
const bgDark = (radacina.match(/--bg-dark:\s*(#[0-9a-fA-F]{6})/) || [])[1];
const fam = {};
for (const m of PAG.matchAll(/\.f-(\w+)\s*\{\s*--fc:\s*(#[0-9A-Fa-f]{6});\s*--fb:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)) fam[m[1]] = { fb: [+m[3], +m[4], +m[5]], a: +m[6] };
for (const m of PAG.matchAll(/\.f-(\w+) \{ --ft: (#[0-9A-Fa-f]{6}); \}/g)) if (fam[m[1]]) fam[m[1]].ft = m[2];
const valori = Object.keys(fam).map((k) => {
  const f = fam[k], baza = hex(bgDark || '#F1F5F9'), fond = f.fb.map((v, i) => Math.round(v * f.a + baza[i] * (1 - f.a)));
  return [k, f.ft ? contrast(hex(f.ft), fond) : 0];
});
T('pastila pragului pe tema deschisă: fiecare familie de culoare ≥ 4,5 pe fundalul rândului (roșul era 3,73)',
  bgDark && valori.length === 6 && valori.every(([, c]) => c >= 4.5) && /body:not\(\.dark\) \.alr-prag \{ color: var\(--ft\); \}/.test(PAG),
  JSON.stringify(valori.map(([k, c]) => k + ' ' + c.toFixed(2))) + ' fundal ' + bgDark);

// ─── 5. Pe server pornit ────────────────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3377, TCP = 5377, RACIRE = 800;
const DIR = path.join(os.tmpdir(), 'rax_alerte_stare_' + Date.now());
const B = 'http://127.0.0.1:' + PORT;
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_alerte_stare', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false', STRICT_DEVICES: 'false',
  ALERTE_RACIRE_MS: String(RACIRE), GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_TIMEOUT_MS: '300',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
let srv = null, terminat = false;
function pornesteServer() {
  srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  srv.on('exit', (c) => { if (!terminat && !srv._oprit) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function asteaptaServer() { for (let i = 0; i < 360; i++) { try { if ((await fetch(B + '/api')).ok) return true; } catch (e) {} await sleep(500); } return false; }
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

// Pachet Teltonika codec 8: contactul (239) și, dacă sunt date, erorile de motor (160 = can_dtc_errors) și plăcuțele axei 1
// (195 = can_brake_pad_axle1) — harta implicită a adaptorului CAN (codec8e.js).
const IMEI = '860000000044401';
function pachet(r) {
  const unu = [[239, 1]];
  if (r.dtc != null) unu.push([160, r.dtc & 0xff]);
  if (r.pad != null) unu.push([195, r.pad & 0xff]);
  const io = Buffer.concat([Buffer.from([0x00, unu.length, unu.length]), Buffer.concat(unu.map(([id, v]) => Buffer.from([id, v]))), Buffer.from([0, 0, 0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(r.ts), 0);
  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(r.lng * 1e7), 0); gps.writeInt32BE(Math.round(44.43 * 1e7), 4);
  gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(40, 13);
  const data = Buffer.concat([Buffer.from([0x08, 1]), tsb, Buffer.from([0x01]), gps, io, Buffer.from([1])]);
  const cap = Buffer.alloc(8); cap.writeUInt32BE(0, 0); cap.writeUInt32BE(data.length, 4);
  return Buffer.concat([cap, data, Buffer.alloc(4)]);
}
let _ts = Date.now() - 60 * MIN, _lng = 26.10;
function trimite(dtc, pad) {
  _ts += 30000; _lng += 0.0005;
  const pkt = pachet({ ts: _ts, lng: _lng, dtc, pad });
  return new Promise((resolve) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0;
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const len = Buffer.alloc(2); len.writeUInt16BE(im.length, 0); s.write(Buffer.concat([len, im])); });
    s.on('data', () => { if (pas === 0) { pas = 1; s.write(pkt); } else { s.end(); resolve(true); } });
    s.on('error', () => resolve(false));
    setTimeout(() => { try { s.end(); } catch (e) {} resolve(false); }, 4000);
  });
}

(async () => {
  pornesteServer();
  if (!(await asteaptaServer())) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n5. Pe server pornit (poziții pe TCP, codec 8; răcirea coborâtă la ' + RACIRE + ' ms)');
  let S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  const co = (await json('POST', '/api/companies', S, { name: 'Transport Stare SRL' })).j;
  await json('POST', '/api/devices', S, { imei: IMEI, name: 'MAN TGX', plate: 'B 77 TIR', company_id: co.id });
  const regula = async (name, type, condition) => (await json('POST', '/api/alerts', S, { name, type, imei: IMEI, enabled: true, condition: condition || {}, company_id: co.id })).j;
  const rDtc = await regula('Erori motor TIR', 'dtc_error'), rPad = await regula('Plăcuțe TIR', 'brake_pad_wear', { minPercent: 20 });
  T('două reguli „de stare" puse (erori de motor, plăcuțe)', rDtc && rDtc.id && rPad && rPad.id);
  const lst = (await json('GET', '/api/alerts', S)).j;
  const cs = (id) => ((Array.isArray(lst) ? lst : []).find((a) => a.id === id) || {}).cum_suna;
  T('lista regulilor: „sună la apariție, apoi o dată pe zi" pe amândouă', cs(rDtc.id) === A.RAND && cs(rPad.id) === A.RAND, JSON.stringify([cs(rDtc.id), cs(rPad.id)]));
  const cum = await json('GET', '/api/alerts/cum-suna', S);
  T('fraza pentru fereastra regulii, de la server (și fără cont: 401)', cum.status === 200 && cum.j.text === A.TEXT && Array.isArray(cum.j.deStare) && cum.j.deStare.length === 8 &&
    (await json('GET', '/api/alerts/cum-suna', null)).status === 401, cum.text.slice(0, 200));

  const cate = async (cine) => {
    const h = (await json('GET', '/api/alerts/history?limit=500', cine)).j;
    const c = {};
    (Array.isArray(h) ? h : []).filter((x) => x.imei === IMEI).forEach((x) => { c[x.alert_id] = (c[x.alert_id] || 0) + 1; });
    return { dtc: c[rDtc.id] || 0, pad: c[rPad.id] || 0 };
  };
  const pas = async (dtc, pad) => { const r = await trimite(dtc, pad); await sleep(RACIRE + 400); return r; };

  T('aparatul vorbește (motor fără erori, plăcuțe 60%)', await pas(0, 60));
  let c = await cate(S);
  T('normal → nicio alertă', c.dtc === 0 && c.pad === 0, JSON.stringify(c));
  await pas(2, 15);
  c = await cate(S);
  T('apar 2 erori de motor și plăcuțele scad la 15% → câte UN anunț', c.dtc === 1 && c.pad === 1, JSON.stringify(c));
  await pas(2, 15); await pas(3, 14); await pas(2, 15);
  c = await cate(S);
  T('starea ține, după trei răciri → tot câte unul (pe regula veche: încă trei din fiecare)', c.dtc === 1 && c.pad === 1, JSON.stringify(c));
  await pas(null, null);
  c = await cate(S);
  T('o poziție fără datele motorului → nimic', c.dtc === 1 && c.pad === 1, JSON.stringify(c));
  await pas(0, 15); await pas(2, 15);
  c = await cate(S);
  T('erorile dispar și revin în câteva minute → tot unul (aceeași stare, sub 30 de minute)', c.dtc === 1 && c.pad === 1, JSON.stringify(c));

  // Repornirea: același folder de bază, alt proces — starea din memorie se pierde, ultima sonerie rămâne în istoric.
  srv._oprit = true; try { srv.kill(); } catch (e) {}
  await sleep(1500);
  pornesteServer();
  if (!(await asteaptaServer())) { console.log('serverul nu a repornit'); return gata(1); }
  S = await login('admin', 'test1234');
  await pas(2, 15);
  c = await cate(S);
  T('după o REPORNIRE a serverului, cu starea încă de față → nu sună din nou (ultima sonerie, din istoric, e de acum câteva minute)', c.dtc === 1 && c.pad === 1, JSON.stringify(c));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e)); gata(1); });
