// verify_can_report.js — raportul „CAN detaliat": catalogul de semnale, poarta contra injecției și
// lanțul complet pachet → istoric → raport.
//
// De ce există. Raportul lasă OMUL să aleagă ce chei se citesc din baza de date. Asta e o cale nouă
// prin care un text venit din interfață ajunge într-o interogare, deci poarta care validează cheile
// trebuie apărată de un test, nu de bună-credință. Al doilea rost: unitățile. `io_signals.js` spune
// „external_voltage se împarte la 1000 și e în volți", iar `io_format.js` spune același lucru în
// felul lui. Dacă cele două o iau razna, raportul arată 14210 V și nimeni nu observă imediat.
//
//   node verify_can_report.js
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const HTTP = 3015, TCP = 5043;
const BASE = 'http://localhost:' + HTTP;
const TMP = path.join(os.tmpdir(), 'rax_canrep_' + Date.now());

let pass = 0, fail = 0;
function check(nume, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + nume); }
  else { fail++; console.log('  ❌ ' + nume + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════ 1. Catalogul de semnale (fără server) ═══════════════
const ioSig = require('./io_signals.js');
const ioFmt = require('./io_format.js');

console.log('\n1. Catalogul de semnale');
check('are semnale', ioSig.SEMNALE.length >= 30, ioSig.SEMNALE.length);
check('fiecare semnal are grup cunoscut',
  ioSig.SEMNALE.every((s) => ioSig.GRUPURI.some((g) => g.cheie === s.grup)),
  ioSig.SEMNALE.filter((s) => !ioSig.GRUPURI.some((g) => g.cheie === s.grup)).map((s) => s.cheie));
check('fiecare semnal are unitate', ioSig.SEMNALE.every((s) => !!s.unitate));
check('nicio cheie dublă', new Set(ioSig.SEMNALE.map((s) => s.cheie)).size === ioSig.SEMNALE.length);
check('semnalele implicite există în catalog', ioSig.IMPLICITE.every((k) => ioSig.permis(k)));

console.log('\n2. Poarta contra injecției (cheile ajung într-o interogare)');
check('cheie inventată → aruncată', !ioSig.permis("io_data'; DROP TABLE positions; --"));
check('cheie cu ghilimele → aruncată', !ioSig.permis("can_engine_rpm' OR '1'='1"));
check('curata() păstrează doar ce e cunoscut',
  JSON.stringify(ioSig.curata(['can_engine_rpm', "x'; DROP TABLE positions; --", 'can_engine_temp'])) === JSON.stringify(['can_engine_rpm', 'can_engine_temp']));
check('curata() fără nimic valid → semnalele implicite',
  JSON.stringify(ioSig.curata(['inventat', 'altul'])) === JSON.stringify(ioSig.IMPLICITE));
check('curata() plafonează numărul de coloane', ioSig.curata(ioSig.SEMNALE.map((s) => s.cheie), 4).length === 4);
check('curata() elimină dublurile', ioSig.curata(['can_engine_rpm', 'can_engine_rpm']).length === 1);

console.log('\n3. Unitățile se acordă cu formatarea din aplicație');
// `formatIoValue` scrie valoarea pe ecran („14.21 V"). `io_signals.valoare` o dă ca număr, pentru
// tabel și grafic. Trebuie să spună ACELAȘI lucru — altfel raportul arată volți în milivolți.
const PROBE = { external_voltage: 14210, battery_voltage: 4050, can_engine_rpm: 1480, can_engine_temp: 87,
  can_fuel_level_liters: 38.4, can_total_mileage: 184374.2, total_odometer: 9123456, can_fuel_rate: 7.1,
  can_engine_load: 52, can_outside_temp: 17.5, can_axle1_load: 5400 };
let nepotrivite = [];
for (const [k, brut] of Object.entries(PROBE)) {
  const nostru = ioSig.valoare(k, brut);
  const scris = String(ioFmt.formatIoValue(k, brut));
  const m = /^(-?\d+(?:[.,]\d+)?)/.exec(scris);
  if (!m) continue;                                  // formatare fără număr la început (ore, coduri)
  const alLor = parseFloat(m[1].replace(',', '.'));
  if (Math.abs(alLor - nostru) > Math.max(0.02, Math.abs(alLor) * 0.001)) nepotrivite.push(k + ': raport ' + nostru + ' vs afișaj ' + scris);
}
check('valorile din raport se potrivesc cu cele afișate în aplicație', nepotrivite.length === 0, nepotrivite);
check('unitatea apare și în textul afișat',
  Object.keys(PROBE).every((k) => {
    const u = ioSig.semnal(k).unitate;
    const scris = String(ioFmt.formatIoValue(k, PROBE[k]));
    return u === '/5' || u === 'sat.' || u === 'erori' || scris.indexOf(u) >= 0;
  }),
  Object.keys(PROBE).filter((k) => String(ioFmt.formatIoValue(k, PROBE[k])).indexOf(ioSig.semnal(k).unitate) < 0));
check('un zero rămâne zero, nu „lipsă"', ioSig.valoare('can_engine_rpm', 0) === 0);
check('text neconvertibil → null (nu NaN în tabel)', ioSig.valoare('can_engine_rpm', 'abc') === null);
check('valoare venită ca TEXT se convertește (CAN trimite uneori string)', ioSig.valoare('can_engine_rpm', '1480') === 1480);

// ═══════════════ 4. Lanțul complet, cu server adevărat ═══════════════
function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of sc) { const m = /connect\.sid=[^;]+/.exec(c); if (m) return m[0]; }
  return null;
}
async function api(method, cale, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (opts.cookie) h.Cookie = opts.cookie;
  const r = await fetch(BASE + cale, { method, headers: h, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, cookie: cookieFrom(r) };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PGLITE_DIR: TMP, ADMIN_PASSWORD: 'admin123', SESSION_SECRET: 'can_report_test',
      PORT: String(HTTP), TCP_PORT: String(TCP), DATABASE_URL: '', DEMO_DISABLED: 'true', SEED_TEST: '1',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});

  let gata = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { gata = true; break; } } catch { /* pornește */ }
    await sleep(1000);
  }
  console.log('\n4. Lanțul complet: pachete → istoric → raport');
  check('serverul a pornit', gata);
  if (!gata) { srv.kill(); process.exit(1); }

  const login = await api('POST', '/api/login', { body: { username: 'admin', password: 'admin123' } });
  const A = { cookie: login.cookie };
  const IMEI = '350424067777001';
  await api('POST', '/api/devices', { cookie: A.cookie, body: { imei: IMEI, name: 'Probă CAN', plate: 'B-77-CAN' } });

  // 40 de poziții pe ultima oră, cu valori care variază (turație, temperatură, carburant).
  const t0 = Date.now() - 40 * 60 * 1000;
  for (let i = 0; i < 40; i++) {
    await api('POST', '/api/test/simulate', {
      cookie: A.cookie,
      body: { imei: IMEI, name: 'Probă CAN', speed: 40 + i, ts: new Date(t0 + i * 60000).toISOString(),
        io: { ignition: 1, can_engine_rpm: 1000 + i * 10, can_engine_temp: 70 + (i % 20), can_fuel_level_liters: 50 - i * 0.2, external_voltage: 14000 + i } },
    });
  }
  const from = new Date(t0 - 60000).toISOString(), to = new Date().toISOString();

  const sig = await api('GET', '/api/can-signals?imei=' + IMEI + '&from=' + from + '&to=' + to, A);
  check('ruta de semnale răspunde', sig.status === 200, sig.status);
  const vazute = (sig.body.signals || []).filter((x) => x.seen).map((x) => x.key);
  check('știe ce trimite mașina', vazute.includes('can_engine_rpm') && vazute.includes('can_engine_temp'), vazute);
  check('NU marchează ca trimise semnale pe care mașina nu le are', !vazute.includes('can_axle1_load'), vazute);
  check('trimite și grupurile, pentru bife', Array.isArray(sig.body.groups) && sig.body.groups.length > 0);

  const rep = await api('GET', '/api/reports/can_detail?imei=' + IMEI + '&from=' + from + '&to=' + to + '&signals=can_engine_rpm,can_engine_temp', A);
  check('raportul răspunde', rep.status === 200, rep.status);
  const d = rep.body || {};
  check('are rânduri', (d.rows || []).length > 5, (d.rows || []).length);
  check('o coloană pentru fiecare semnal bifat',
    (d.columns || []).some((c) => /Turatie|Turație/i.test(c)) && (d.columns || []).some((c) => /racire|răcire/i.test(c)), d.columns);
  check('rezumatul dă minim / mediu / maxim',
    Object.values(d.summary || {}).some((v) => typeof v === 'string' && /min .* mediu .* max/.test(v)), d.summary);
  check('spune pe ce interval s-a grupat', !!(d.summary && d.summary['Interval de grupare']), d.summary);
  check('are grafice', (d.charts || []).length >= 1, (d.charts || []).length);
  check('legenda explică celula goală',
    (d.legend && d.legend.items || []).some((x) => /goal|goul|gol/i.test(x[1] || '')), (d.legend || {}).items);

  const rau = await api('GET', '/api/reports/can_detail?imei=' + IMEI + '&from=' + from + '&to=' + to + "&signals=can_engine_rpm,x'; DROP TABLE positions; --", A);
  check('cheia inventată nu ajunge în interogare', rau.status === 200 && (rau.body.columns || []).length <= 4, rau.body && rau.body.columns);
  const dupa = await api('GET', '/api/reports/can_detail?imei=' + IMEI + '&from=' + from + '&to=' + to + '&signals=can_engine_rpm', A);
  check('baza de date e intactă după încercare', dupa.status === 200 && (dupa.body.rows || []).length > 5);

  const impl = await api('GET', '/api/reports/can_detail?imei=' + IMEI + '&from=' + from + '&to=' + to, A);
  check('fără bife → semnalele implicite, nu tabel gol', (impl.body.rows || []).length > 5, (impl.body.rows || []).length);

  console.log('\n5. Raport PROGRAMAT — bifele chiar se păstrează');
  const prog = await api('POST', '/api/report-schedules', {
    cookie: A.cookie,
    body: { name: 'CAN săptămânal', report_type: 'can_detail', imei: IMEI, period: 'yesterday', frequency: 'weekly', hour: 7, format: 'pdf', recipients: '', opts: { signals: 'can_engine_rpm,can_engine_temp' } },
  });
  check('programarea se creează', prog.status === 200, prog.status);
  const lista = await api('GET', '/api/report-schedules', A);
  const gasit = (Array.isArray(lista.body) ? lista.body : []).find((x) => x.report_type === 'can_detail');
  const optsSalvate = gasit && (typeof gasit.opts === 'string' ? JSON.parse(gasit.opts) : gasit.opts);
  check('semnalele bifate rămân în programare', !!(optsSalvate && optsSalvate.signals === 'can_engine_rpm,can_engine_temp'), optsSalvate);

  console.log('\n──────────────────────────────');
  console.log(pass + ' verificări trecute, ' + fail + ' picate');
  srv.kill();
  await sleep(400);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* rămâne în temp */ }
  process.exit(fail ? 1 : 0);
})();
