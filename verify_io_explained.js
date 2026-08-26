// verify_io_explained.js — ruta care spune ce trimite un vehicul și ce înseamnă.
//
//   node verify_io_explained.js            (pornește singur un server pe PGlite)
//
// E ruta pe care o folosește fereastra „Ce înseamnă?" din telefon. Toată prelucrarea stă pe server —
// potrivirea cu catalogul, strângerea codurilor care duc la același semnal, formatarea — tocmai ca
// aplicația de telefon să NU-și țină o a doua copie a regulilor. Proba asta apără contractul.
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3197, DIR = '.io-explained-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_io_explained',
  PORT: String(PORT), TCP_PORT: '5197', DEMO_DISABLED: 'true', PGLITE_DIR: DIR + '/pgdata',
};
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;

function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}

(async () => {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }

  // autentificare + cookie
  const lr = await fetch(B + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }),
  });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const GET = (u) => fetch(B + u, { headers: { Cookie: ck } });

  // Un vehicul care trimite EXACT ca mașina din poza lui Alin: cifre CAN, fără steaguri, plus un
  // cod necatalogat. Îl injectăm pe calea normală de ingest (ruta de test), nu direct în memorie.
  const dev = await (await GET('/api/devices')).json();
  const imei = Array.isArray(dev) && dev.length ? (dev[0].imei || dev[0].IMEI) : null;
  if (!imei) { console.log('nu am niciun vehicul de test'); return gata(1); }

  // Codul „pe care nu-l cunoaștem" se alege LA RULARE, nu se scrie de mână: pe 26.08 proba pica
  // fiindcă io_1148 fusese între timp catalogat („Connectivity quality") — adică exact lucrul bun
  // pe care ni-l dorim făcea proba să sune alarma. Luăm primul ID liber din catalog.
  const { IO_CATALOG } = require('./io_catalog.js');
  const idsCunoscute = new Set(IO_CATALOG.map((e) => e.id));
  let idNecunoscut = 9001;
  while (idsCunoscute.has(idNecunoscut)) idNecunoscut++;
  const cheiaNecunoscuta = 'io_' + idNecunoscut;

  const io = {
    ignition: 0, movement: 0, gsm_signal: 4, external_voltage: 12820, battery_voltage: 4080,
    can_engine_rpm: 679, can_fuel_level_liters: 51.1, can_total_mileage: 404795,
    [cheiaNecunoscuta]: 7,
  };
  const pr = await fetch(B + '/api/debug/live-io', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify({ imei, io }),
  });
  if (!pr.ok) {
    console.log('\n⚠ Nu pot injecta o poziție de test (' + pr.status + ') — verific doar contractul rutei.');
  }

  console.log('\n1. Ruta răspunde și respectă forma promisă');
  const r = await GET('/api/devices/' + encodeURIComponent(imei) + '/io-explained');
  T('răspunde 200', r.status === 200, 'a dat ' + r.status);
  const d = await r.json();
  T('are lista de semnale', Array.isArray(d.semnale));
  T('are numărătorile', typeof d.total === 'number' && typeof d.necatalogate === 'number' && typeof d.dinCatalog === 'number');
  T('catalogul are conținut', d.dinCatalog > 100, String(d.dinCatalog));

  if (d.semnale && d.semnale.length) {
    console.log('\n2. Semnalele sunt explicate, nu doar listate');
    const cheiPrezente = new Set(d.semnale.map(s => s.cheie));
    T('prinde turația', cheiPrezente.has('can_engine_rpm'));
    T('prinde tensiunea', cheiPrezente.has('external_voltage'));
    const rpm = d.semnale.find(s => s.cheie === 'can_engine_rpm');
    const volt = d.semnale.find(s => s.cheie === 'external_voltage');
    if (rpm) {
      T('turația are nume pe românește', /tura[țt]ie/i.test(rpm.nume), rpm.nume);
      T('turația e formatată cu unitate', /RPM/.test(rpm.valoare), rpm.valoare);
      T('turația are cod', /^io_\d+$/.test(rpm.cod), rpm.cod);
      T('turația strânge codurile echivalente', Array.isArray(rpm.echivalente) && rpm.echivalente.length >= 1,
        JSON.stringify(rpm.echivalente));
    }
    if (volt) T('tensiunea e în volți, nu milivolți', /12\.82 V/.test(volt.valoare), volt.valoare);

    console.log('\n3. Un semnal apare O SINGURĂ dată');
    const dupaCheie = {};
    d.semnale.forEach(s => { dupaCheie[s.cheie] = (dupaCheie[s.cheie] || 0) + 1; });
    const dubluri = Object.keys(dupaCheie).filter(k => dupaCheie[k] > 1);
    T('fără dubluri pe același semnal', dubluri.length === 0, dubluri.join(', '));
    T('numărul spune adevărul', d.total === d.semnale.length, d.total + ' vs ' + d.semnale.length);

    console.log('\n4. Codurile pe care nu le cunoaștem sunt la vedere');
    const nec = d.semnale.filter(s => s.necatalogat);
    T(cheiaNecunoscuta + ' apare, marcat necatalogat', nec.some(s => s.cheie === cheiaNecunoscuta),
      nec.map(s => s.cheie).join(', ') || 'niciunul');
    T('numărătoarea lor e corectă', d.necatalogate === nec.length);
    if (nec.length) T('are o explicație, nu doar eticheta', /nu știm ce înseamnă/.test(nec[0].descriere));

    console.log('\n5. Nu scapă steagurile decodate în listă');
    T('fără _sf_/_cf_ printre semnale', !d.semnale.some(s => /^_(sf|cf)_/.test(s.cheie)));
  } else {
    // NU sărim peste. Daca injectarea n-a mers, proba nu mai verifica nimic din ce conteaza, iar un
    // „6 verificari trecute" ar fi o minciuna linistitoare. Prima oara chiar asa s-a intamplat: ruta
    // de injectare taia literele din IMEI-ul de proba („TEST222" -> „222"), lista venea goala, si
    // proba raporta succes.
    T('vehiculul de test are semnale (altfel proba nu verifica nimic)', false,
      'lista a venit goala - injectarea a esuat tacut');
  }

  console.log('\n6. Izolare: nu se poate cere IO-ul altui vehicul');
  const r2 = await GET('/api/devices/00000000000000/io-explained');
  T('IMEI necunoscut → 403 sau listă goală, nu date străine', r2.status === 403 || (await r2.json()).total === 0,
    'a dat ' + r2.status);
  const r3 = await fetch(B + '/api/devices/' + encodeURIComponent(imei) + '/io-explained');
  T('fără autentificare → refuzat', r3.status === 401 || r3.status === 403, 'a dat ' + r3.status);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
