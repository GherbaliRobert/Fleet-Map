// verify_aparate.js — „Aparate GPS" (Setări → Evidență), pe server pornit.
//
//   node verify_aparate.js
//
// Ecranul ăsta răspunde la o întrebare pe care harta NU o poate răspunde: „mai transmite aparatul?".
// Pe hartă, o mașină tăcută arată exact ca una parcată — omul află că i-a murit un GPS abia când are
// nevoie de traseu, adică prea târziu. De aceea se apără aici două lucruri:
//   • ce trimite serverul: fără parametru → doar aparatele din flotă; cu ?arhivate=1 → și cele scoase,
//     marcate ca atare. Dacă cele arhivate ar intra tăcut în lista principală, omul ar suna
//     instalatorul pentru un aparat pe care l-a demontat singur acum trei luni;
//   • ce scrie pe ecran: pragurile „comunică / tăcut / fără semnal" și textul lor. Un „tăcut de 3 h"
//     afișat pentru 3 zile de tăcere e mai rău decât nimic.

const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3193, DIR = '.aparate-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_aparate',
  PORT: String(PORT), TCP_PORT: '5193', PGLITE_DIR: DIR + '/pgdata',
};
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }
  const lr = await fetch(B + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }),
  });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const GET = (u) => fetch(B + u, { headers: { Cookie: ck } });
  const POST = (u, b) => fetch(B + u, { method: 'POST', headers: H, body: JSON.stringify(b) });
  const PUT = (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: JSON.stringify(b) });

  sect('1. Serverul trimite ce trebuie pentru un ecran de echipamente');
  await POST('/api/devices', { imei: '7711000000001', plate: 'CJ 33 GPS', brand: 'Volvo', model: 'FH', vehicle_type: 'Camion' });
  await POST('/api/devices', { imei: '7711000000002', plate: 'B 44 GPS', brand: 'Ford', model: 'Transit', vehicle_type: 'Autoutilitara' });
  // model de aparat + cartelă: fără ele, ecranul ar fi o listă de IMEI-uri
  await PUT('/api/devices/7711000000001', { gps_model: 'Teltonika FMB920', sim_number: '0740111222' });

  // Capcana găsită chiar aici: PUT-ul care scrie modelul GPS trimitea și name/vehicle_type/plate ca
  // „nedefinite", iar interogarea le scria oricum → un update parțial ȘTERGEA numărul de înmatriculare.
  // Pe ecran ar fi apărut un aparat fără mașină, fără ca cineva să fi șters ceva.
  const r0 = await GET('/api/device-inventory');
  T('ruta răspunde', r0.status === 200, r0.status);
  const inv = await r0.json();
  const gasesc = (l, p) => (l || []).find(x => x.plate === p);
  const cj = gasesc(inv, 'CJ 33 GPS');
  T('aparatul apare în listă', !!cj, JSON.stringify((inv || []).map(x => x.plate)));
  T('cu modelul lui', cj && cj.gps_model === 'Teltonika FMB920', cj && cj.gps_model);
  T('iar numărul de înmatriculare NU s-a pierdut la scrierea modelului', cj && cj.plate === 'CJ 33 GPS', cj && cj.plate);
  T('cu cartela lui', cj && cj.sim_number === '0740111222', cj && cj.sim_number);
  T('și cu starea, ca să știm pe ce filă se duce', cj && cj.status === 'active', cj && cj.status);

  sect('2. Arhivatele NU se amestecă în flotă');
  const ar = await PUT('/api/devices/7711000000002/status', { status: 'archived' });
  T('arhivarea merge', ar.status === 200, ar.status);

  const fara = await (await GET('/api/device-inventory')).json();
  T('fără parametru, aparatul arhivat NU apare', !gasesc(fara, 'B 44 GPS'), (fara || []).map(x => x.plate).join(', '));
  T('dar cel din flotă rămâne', !!gasesc(fara, 'CJ 33 GPS'));

  const cu = await (await GET('/api/device-inventory?arhivate=1')).json();
  const b44 = gasesc(cu, 'B 44 GPS');
  T('cu ?arhivate=1 apare și el', !!b44, (cu || []).map(x => x.plate).join(', '));
  T('și e MARCAT ca arhivat, nu strecurat printre celelalte', b44 && b44.status === 'archived', b44 && b44.status);

  sect('3. Flota demo nu intră în aparatele clientului');
  // Regula din CLAUDE.md: demo-ul e ascuns de flota reală peste tot. Un ecran nou nu e o excepție.
  let demoImeis = [];
  try { demoImeis = require('./demo-sim.js').DEMO_IMEIS || []; } catch (e) {}
  T('niciun IMEI demo în listă', (cu || []).every(x => demoImeis.indexOf(x.imei) < 0),
    (cu || []).map(x => x.imei).filter(i => demoImeis.indexOf(i) >= 0).join(', '));

  sect('4. Ce scrie pe ecran despre starea aparatului');
  const html = fs.readFileSync('./public/index.html', 'utf8');
  const i = html.indexOf('    // ── începe „Aparate GPS"');
  const j = html.indexOf('    // ── sfârșit „Aparate GPS" ──', i);
  T('găsesc codul ecranului între repere', i > 0 && j > i, 'i=' + i + ' j=' + j);
  if (i > 0 && j > i) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const F = new Function('esc', 'window', 'document', 'fetch',
      html.slice(i, j) + '\n; return { stare: agpsStare, deCand: agpsDeCand, potrivit: agpsPotrivit, rand: agpsRandHtml };')(
      esc, {}, { getElementById: () => null }, () => Promise.resolve({ json: () => [] }));

    const ACUM = Date.parse('2026-09-01T12:00:00Z');
    const acu = (min) => new Date(ACUM - min * 60000).toISOString();

    T('un aparat care a transmis acum 5 min „comunică"', F.stare(acu(5), ACUM).k === 'ok', F.stare(acu(5), ACUM).t);
    T('la 29 de minute tot comunică', F.stare(acu(29), ACUM).k === 'ok', F.stare(acu(29), ACUM).t);
    T('la 31 de minute e tăcut', F.stare(acu(31), ACUM).k === 'tacut', F.stare(acu(31), ACUM).t);
    T('și spune de cât timp', /31 min/.test(F.stare(acu(31), ACUM).t), F.stare(acu(31), ACUM).t);
    T('la 23 de ore e tot „tăcut"', F.stare(acu(23 * 60), ACUM).k === 'tacut', F.stare(acu(23 * 60), ACUM).t);
    // Pragul de o zi e cel care schimbă vorba: peste el, omul trebuie să sune pe cineva.
    T('la 25 de ore devine „fără semnal"', F.stare(acu(25 * 60), ACUM).k === 'mut', F.stare(acu(25 * 60), ACUM).t);
    T('și numără în zile, nu în ore', /1 zi/.test(F.stare(acu(25 * 60), ACUM).t), F.stare(acu(25 * 60), ACUM).t);
    T('trei zile se scriu „3 zile"', /3 zile/.test(F.stare(acu(74 * 60), ACUM).t), F.stare(acu(74 * 60), ACUM).t);
    T('un aparat care n-a transmis NICIODATĂ o spune limpede', F.stare(null, ACUM).k === 'niciodata', F.stare(null, ACUM).t);
    // Ceasul unui tracker o poate lua înainte. Fără paza asta ar scrie „tăcut de -5 min".
    T('o oră „din viitor" nu produce timp negativ', F.stare(new Date(ACUM + 3600000).toISOString(), ACUM).k === 'ok',
      F.stare(new Date(ACUM + 3600000).toISOString(), ACUM).t);

    T('90 de minute se scriu „1 oră", nu „1.5 ore"', F.deCand(90 * 60000) === '1 oră', F.deCand(90 * 60000));
    T('două zile se scriu „2 zile"', F.deCand(49 * 3600000) === '2 zile', F.deCand(49 * 3600000));

    const rnd = { plate: 'CJ 33 GPS', imei: '7711000000001', gps_model: 'Teltonika FMB920', sim_number: '0740111222', status: 'active' };
    T('căutarea prinde numărul de înmatriculare', F.potrivit(rnd, 'cj 33'));
    T('și ultimele cifre din IMEI', F.potrivit(rnd, '0001'));
    T('și cartela', F.potrivit(rnd, '0740'));
    T('dar nu returnează orice', !F.potrivit(rnd, 'zzz'));

    const hOk = F.rand(Object.assign({ last_tx: acu(5) }, rnd), ACUM, { sim: true });
    T('pe rând scrie numărul mașinii', /CJ 33 GPS/.test(hOk));
    T('modelul aparatului', /Teltonika FMB920/.test(hOk));
    T('cartela, când o arătăm', /0740111222/.test(hOk));
    T('și starea, cu culoarea ei', /comunică/.test(hOk) && /var\(--accent\)/.test(hOk));
    const hFara = F.rand(Object.assign({ last_tx: acu(5) }, rnd), ACUM, { sim: false });
    T('fără cartelă, când nu o arătăm', !/0740111222/.test(hFara));
    const hArh = F.rand(Object.assign({}, rnd, { last_tx: acu(5), status: 'archived' }), ACUM, { sim: true });
    T('rândul unui aparat arhivat se vede altfel', /ag-rand gri/.test(hArh));
    const hMut = F.rand(Object.assign({}, rnd, { last_tx: acu(50 * 60) }), ACUM, { sim: true });
    T('un aparat mut de două zile o spune, pe roșu', /fără semnal de 2 zile/.test(hMut) && /var\(--red\)/.test(hMut));
  }

  sect('5. Ecranul arhivelor nu se dublează');
  // Arhivele au deja un ecran cu istoric, restaurare și ștergere definitivă. Fila „Arhivate" din
  // Aparate GPS îl ÎMPRUMUTĂ; dacă cineva l-ar rescrie de mână, butoanele alea ar rămâne pe drum.
  T('fila „Arhivate" împrumută ecranul existent', /setImprumuta\('admin-tab-archived'/.test(html));
  T('și îl cheamă pe cel care îl umple', /loadArchivedDevices\(\)/.test(html.slice(i, j)));
  // Redesenarea ștergea nodul împrumutat dacă nu-l trimiteam acasă întâi.
  T('înainte de redesenare, nodul se dă înapoi', /function agpsRender\(\)[\s\S]{0,220}setDaInapoi\(\)/.test(html));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
