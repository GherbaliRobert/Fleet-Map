// verify_pornire.js — pornirea serverului și rezistența la o bază care nu răspunde. Rulează FUNCȚIILE
// REALE, nu copii ale lor: cele trei cache-uri de configurație sunt decupate din server.js ca text și
// executate cu o bază falsă care întâi merge, apoi dă eroare.
//
//   node verify_pornire.js
//
// Ce prinde:
//   1. o migrare grea strecurată înapoi pe drumul pornirii (UPDATE peste `positions` în initDb) — exact
//      bomba măsurată: pe blocurile comprimate TimescaleDB, serverul nu mai pornea deloc;
//   2. citirea ultimelor poziții rămasă fără fereastră de timp (pornire de zeci de secunde pe bază mare);
//   3. revenirea la vechiul comportament în care o EROARE de citire era memorată ca „vehiculul n-are
//      configurație" — un minut întreg de CAN și carburant decodate greșit, scrise definitiv în istoric;
//   4. o excepție de la îmbogățirea cu identitatea vehiculului care oprește harta live și detectoarele.
const fs = require('fs');
const path = require('path');
const RAD = __dirname;
const dbSrc = fs.readFileSync(path.join(RAD, 'db.js'), 'utf8');
const svSrc = fs.readFileSync(path.join(RAD, 'server.js'), 'utf8');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? ' → ' + JSON.stringify(detaliu) : '')); }
}
function decupeaza(src, start, end) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 60));
  const b = src.indexOf(end, a);
  if (b < 0) throw new Error('nu găsesc capătul: ' + end.slice(0, 60));
  return src.slice(a, b + end.length);
}

// ── 1. Drumul pornirii e liber ─────────────────────────────────────────────────────────────────────
console.log('\n1. Pornirea nu mai plimbă tot istoricul');
{
  // initDb: UPDATE-ul peste `positions` nu mai are voie să ruleze necondiționat.
  const initDb = decupeaza(dbSrc, 'async function initDb()', '\nasync function ');
  const updPositions = /UPDATE positions SET company_id/.test(initDb);
  T('UPDATE-ul de company_id nu mai e necondiționat în initDb',
    !updPositions || /BACKFILL_POSITIONS_COMPANY/.test(initDb));
  T('dacă totuși e pornit manual, nu mai poate opri serverul (are try/catch)',
    !updPositions || /BACKFILL_POSITIONS_COMPANY[\s\S]{0,200}try \{/.test(initDb));

  // getLastPositions: fereastră de timp obligatorie.
  const glp = decupeaza(dbSrc, 'async function getLastPositions(', '\n}');
  T('getLastPositions primește o fereastră de zile', /function getLastPositions\(\s*\w+/.test(glp));
  T('fereastra chiar ajunge în SQL', /WHERE timestamp > NOW\(\) - INTERVAL/.test(glp));
  T('există o valoare implicită dacă nu i se dă nimic', /\|\|\s*7\b/.test(glp));

  // server.js: cheamă interogarea CU fereastra și o leagă de măturarea hărții live.
  T('serverul calculează fereastra de pornire (BOOT_SEED_DAYS)', /const BOOT_SEED_DAYS = /.test(svSrc));
  T('fereastra ține cont de LIVE_PURGE_MS (altfel ar încărca vehicule care se șterg imediat)',
    /BOOT_SEED_DAYS[\s\S]{0,400}LIVE_PURGE_MS/.test(svSrc));
  T('pornirea cheamă getLastPositions CU fereastra', /getLastPositions\(BOOT_SEED_DAYS\)/.test(svSrc));
  T('nu mai există niciun apel fără fereastră', !/getLastPositions\(\)/.test(svSrc));
}

// ── 2. O bază care nu răspunde nu mai strică datele ────────────────────────────────────────────────
console.log('\n2. Citirile de configurație eșuate nu mai intră în cache');
{
  // Decupăm blocul REAL cu cele trei cache-uri și îl rulăm cu un ceas fals (ca să nu așteptăm minute)
  // și o bază falsă. `Date` e dat ca parametru, deci umbrește globalul din interiorul blocului.
  // Capătul feliei e `dbRef()` — getFuelSensors îl folosește, iar fără el blocul decupat crapă la primul apel.
  const bloc = decupeaza(svSrc,
    '// Cache pentru calibrare sonda combustibil per vehicul (voltage -> liters)',
    'function dbRef() { return db; }');

  const ceas = { t: 1000000 };
  class DataFalsa extends Date { static now() { return ceas.t; } }

  const stats = { cfg_read_fails: 0, enrich_fails: 0 };
  const baza = {
    tank: [{ voltage: 0, liters: 0 }, { voltage: 5, liters: 100 }],
    iface: 'fms',
    sonde: [{ tip: 'lls', adresa: 0 }],
    crapa: false,
    pool: {
      query: async function () {
        if (baza.crapa) throw new Error('conexiune pierdută (simulat)');
        return { rows: [{ tank_calibration: baza.tank }] };
      },
    },
    getDeviceCanInterface: async function () {
      if (baza.crapa) throw new Error('conexiune pierdută (simulat)');
      return baza.iface;
    },
    getFuelSensorsRow: async function () {
      if (baza.crapa) throw new Error('conexiune pierdută (simulat)');
      return baza.sonde;
    },
  };

  const f = new Function('db', 'ingestStats', 'Date', 'console',
    bloc + '\nreturn { getTankCalibration, getDeviceIface, getFuelSensors };');
  const M = f(baza, stats, DataFalsa, { warn: function () {}, log: function () {} });

  (async () => {
    const IMEI = '350424070000001';

    // a) calibrarea rezervorului
    const cal1 = await M.getTankCalibration(IMEI);
    T('calibrarea se citește normal', Array.isArray(cal1) && cal1.length === 2);
    ceas.t += 61000;                       // cache expirat
    baza.crapa = true;                     // baza cade
    const cal2 = await M.getTankCalibration(IMEI);
    T('la eroare rămâne ultima calibrare bună (nu „fără calibrare")', Array.isArray(cal2) && cal2.length === 2, cal2);
    T('eșecul e numărat pentru consola /debug', stats.cfg_read_fails === 1, stats.cfg_read_fails);
    ceas.t += 1000;                        // în interiorul pauzei de reîncercare
    await M.getTankCalibration(IMEI);
    T('nu batem baza căzută la fiecare pachet (pauză între reîncercări)', stats.cfg_read_fails === 1, stats.cfg_read_fails);
    ceas.t += 3000;                        // pauza a trecut
    baza.crapa = false;
    baza.tank = [{ voltage: 0, liters: 0 }, { voltage: 5, liters: 200 }];
    const cal3 = await M.getTankCalibration(IMEI);
    T('după ce baza revine, se ia valoarea nouă', cal3[1].liters === 200, cal3);

    // b) interfața CAN — aici greșeala costă cel mai mult (camion FMS decodat ca LV-CAN)
    ceas.t += 61000;
    const if1 = await M.getDeviceIface(IMEI);
    T('interfața CAN se citește normal', if1 === 'fms', if1);
    ceas.t += 61000;
    baza.crapa = true;
    const if2 = await M.getDeviceIface(IMEI);
    T('la eroare NU devine „fără interfață CAN"', if2 === 'fms', if2);

    // c) sondele de combustibil
    ceas.t += 61000;
    baza.crapa = false;
    const s1 = await M.getFuelSensors(IMEI);
    T('sondele se citesc normal', Array.isArray(s1) && s1.length === 1);
    ceas.t += 61000;
    baza.crapa = true;
    const s2 = await M.getFuelSensors(IMEI);
    T('la eroare rămân sondele știute', Array.isArray(s2) && s2.length === 1, s2);

    // d) vehicul nou, fără nicio valoare bună în cache: eșecul NU se memorează
    const NOU = '350424070000002';
    const n1 = await M.getDeviceIface(NOU);
    T('vehicul necunoscut + bază căzută → null (nu avem ce inventa)', n1 === null, n1);
    baza.crapa = false;
    const n2 = await M.getDeviceIface(NOU);            // imediat, fără să treacă timpul
    T('eșecul nu e memorat: următorul pachet reîncearcă pe loc', n2 === 'fms', n2);

    // ── 3. Fluxul de recepție nu mai pierde harta și alertele ────────────────────────────────────
    console.log('\n3. O eroare de identitate nu mai oprește harta live și detectoarele');
    const ingest = decupeaza(svSrc, '        let devInfo = {};', 'catch (_eEnrich) { _enrichFail(imei, _eEnrich); }');
    T('citirea identității e izolată în try/catch', /try \{ devInfo = \(await getLiveEnrichMap\(\)\)/.test(ingest));
    T('nu mai există varianta fără plasă', !/const devInfo = \(await getLiveEnrichMap\(\)\)/.test(svSrc));
    const enrich = decupeaza(svSrc, 'async function getLiveEnrichMap()', '\nfunction invalidateLiveEnrichCache');
    T('harta de identitate servește ultima variantă bună la eroare',
      /catch \(e\) \{[\s\S]{0,400}return _liveEnrichCache\.map;/.test(enrich));
    T('contoarele noi ajung în consola /debug',
      /cfg_read_fails/.test(svSrc) && /enrich_fails/.test(svSrc)
      && /cfg_read_fails/.test(fs.readFileSync(path.join(RAD, 'public', 'debug.html'), 'utf8')));

    console.log('\n──────────────────────────────');
    console.log(ok + ' verificări trecute, ' + rele + ' picate');
    process.exit(rele ? 1 : 0);
  })().catch((e) => { console.error('EROARE în probă:', e); process.exit(1); });
}
