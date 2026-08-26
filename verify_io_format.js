// verify_io_format.js — dovada că mutarea formatării în `io_format.js` n-a schimbat NIMIC.
//
//   node verify_io_format.js
//
// Cele ~300 de rânduri care spun cum se scrie o valoare de IO stăteau în `public/index.html`. Le-am
// scos într-un modul, ca să le poată folosi și serverul (deci și telefonul), nu ca să le rescriu.
// Proba compară versiunea DE DINAINTE, luată din git, cu modulul de acum, pe fiecare cheie din
// catalog și pe o grămadă de valori. Orice diferență = am stricat ceva la mutare.
//
// Când nu există istoric git (arhivă descărcată), proba sare peste comparație și o spune — nu se
// preface că a trecut.
const { execFileSync } = require('child_process');
const path = require('path');
const fmt = require('./io_format.js');
const { IO_CATALOG } = require('./io_catalog.js');
const { getIoName, decodeSecurityFlags, decodeControlFlags } = require('./codec8e.js');

let ok = 0, rele = 0;
function T(n, c, d) { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } }

// ── versiunea veche, din ultimul commit în care pagina încă le conținea ──
function versiuneaVeche() {
  let sursa = null;
  for (const ref of ['HEAD', 'HEAD~1', 'HEAD~2', 'HEAD~3']) {
    let txt;
    try {
      txt = execFileSync('git', ['show', ref + ':public/index.html'], {
        cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) { return null; }
    const a = txt.indexOf('    function formatIoValue(key, value) {');
    const b = txt.indexOf('    function renderIoPanel(imei, io) {');
    if (a < 0 || b < 0 || b - a < 5000) continue;   // deja mutate în commit-ul ăsta
    sursa = txt.slice(a, b);
    break;
  }
  if (!sursa) return null;
  const win = { IO_CAT_BY_ID: null };
  return new Function('window', sursa + '\n; return { v: formatIoValue, l: formatIoLabel };')(win);
}

const vechi = versiuneaVeche();
if (!vechi) {
  console.log('\n⚠ Nu găsesc versiunea de dinainte în git — comparația NU s-a făcut.');
  console.log('  (normal într-o arhivă fără istoric; într-un depozit clonat, e un semn de întrebare)');
} else {
  console.log('\n1. Valorile ies identic cu versiunea de dinainte');
  // toate cheile pe care le poate produce parserul + cele din catalog + steagurile decodate
  const chei = new Set();
  IO_CATALOG.forEach(e => { chei.add(getIoName(e.id, null) || ('io_' + e.id)); chei.add('io_' + e.id); });
  Object.keys(decodeSecurityFlags(BigInt(0))).forEach(k => chei.add('_sf_' + k));
  Object.keys(decodeControlFlags(0)).forEach(k => chei.add('_cf_' + k));
  ['external_voltage', 'battery_voltage', 'gsm_signal', 'ignition', 'movement', 'trip', 'sleep_mode',
   'data_mode', 'gnss_status', 'gnss_pdop', 'digital_input_1', 'digital_output_2', 'analog_input_1',
   'ble_battery_voltage_1', 'lls_fuel_level_1', 'total_odometer', 'ceva_necunoscut'].forEach(k => chei.add(k));

  const valori = [0, 1, 2, 3, 4, 5, 7, 10, 42, 100, 255, 679, 1000, 4080, 12820, 65535, 404795,
                  -1, -40, 0.5, 51.1, 12.82, 3600, 86400, true, false, null, undefined, '', 'text'];

  let perechi = 0, dif = [];
  for (const k of chei) {
    for (const v of valori) {
      perechi++;
      let a, b;
      try { a = vechi.v(k, v); } catch (e) { a = 'EROARE:' + e.message; }
      try { b = fmt.formatIoValue(k, v); } catch (e) { b = 'EROARE:' + e.message; }
      if (String(a) !== String(b) && dif.length < 6) dif.push(k + '(' + String(v) + '): vechi=' + a + ' nou=' + b);
    }
  }
  T(perechi + ' perechi cheie/valoare, identice', dif.length === 0, dif.join(' | '));

  console.log('\n2. Numele ies identic');
  let difL = [];
  for (const k of chei) {
    const a = vechi.l(k), b = fmt.formatIoLabel(k, null);
    if (a !== b && difL.length < 6) difL.push(k + ': vechi=' + a + ' nou=' + b);
  }
  T(chei.size + ' chei, aceleași denumiri', difL.length === 0, difL.join(' | '));
}

console.log('\n3. Catalogul completează numele codurilor brute');
{
  const byId = {}; IO_CATALOG.forEach(e => { byId[e.id] = e; });
  T('io_35 ia numele din catalog', fmt.formatIoLabel('io_35', byId) === 'Turație motor', fmt.formatIoLabel('io_35', byId));
  T('fără catalog rămâne înfrumusețat', fmt.formatIoLabel('io_35', null) === 'Io 35');
  // io_1148 are nume din 26.08 (catalogul acoperă toată lista oficială Teltonika) → un id inventat
  T('cod necunoscut, cu catalog', fmt.formatIoLabel('io_9999', byId) === 'Io 9999');
  T('cheile numite nu trec prin catalog', fmt.formatIoLabel('_sf_hood_open', byId) === 'Capota motor');
}

console.log('\n4. Capcana multiplicatorului');
{
  // De-aia formatarea e scrisă pe chei, nu calculată din `multiplier`: unele valori sunt DEJA
  // convertite de codec8e la parsare, altele nu. Aplicat orbește, ar împărți de două ori.
  T('tensiunea vine în mV și se împarte', fmt.formatIoValue('external_voltage', 12820) === '12.82 V');
  T('combustibilul vine deja în litri, NU se mai împarte', /^51\.1 L$/.test(fmt.formatIoValue('can_fuel_level_liters', 51.1)),
    fmt.formatIoValue('can_fuel_level_liters', 51.1));
}

console.log('\n5. Pagina nu-și mai ține copia proprie');
{
  const src = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const a = src.indexOf('    function formatIoValue(key, value) {');
  const b = src.indexOf('    function renderIoPanel(imei, io) {');
  T('formatarea nu mai stă în pagină', a > 0 && b > a && (b - a) < 1600, 'blocul are ' + (b - a) + ' caractere');
  T('pagina deleagă la window.RA_IOFMT', src.includes('window.RA_IOFMT'));
  T('pagina încarcă /js/io-format.js', src.includes('<script src="/js/io-format.js">'));
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
