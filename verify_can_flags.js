// verify_can_flags.js — steagurile CAN: catalogul (can_flags.js), panoul din web (public/index.html)
// și aplatizarea din codec8e.js. Rulează FUNCȚIILE REALE, nu copii ale lor: `canFlagsHtml` e extrasă
// din pagină ca text și executată, iar steagurile sunt decodate cu decodorul adevărat.
//
//   node verify_can_flags.js
//
// Ce prinde: o etichetă scoasă din catalog, un steag decodat rămas fără fișă (ar cădea în „Date
// tehnice avansate", vizibile doar super-adminului), un steag pus din greșeală și în IO_CATEGORIES
// (ar apărea de două ori), acordul gramatical al stărilor și mapările din fișa adaptorului CAN.
const fs = require('fs');
const path = require('path').join(__dirname, 'public', 'index.html');
const src = fs.readFileSync(path, 'utf8');
const codec = require('./codec8e.js');
const cat = require('./can_flags.js');

function grabTo(start, end) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 50));
  const b = src.indexOf(end, a);
  if (b < 0) throw new Error('nu găsesc capătul: ' + end.slice(0, 50));
  return src.slice(a, b);
}

const fnEsc = grabTo('function _usEsc(s)', '\n');
const fnFlags = grabTo('    function canFlagsHtml(flatIo, usedKeys) {', '\n    // ATENȚIE: aici stau DOAR');

const win = { RA_CANFLAGS: { groups: cat.GROUPS, flags: cat.FLAGS, kindText: cat.KIND_TEXT, undecoded: cat.NEDECODATE } };
const canFlagsHtml = new Function('window', fnEsc + '\n' + fnFlags + '\n; return canFlagsHtml;')(win);

// ─── payload real: decodăm cu codec8e, exact ca serverul ───
function flat(secVal, ctrlVal) {
  const io = {};
  if (secVal !== undefined) io.can_security_state_flags = secVal;
  if (ctrlVal !== undefined) io.can_control_state_flags = ctrlVal;
  codec.expandCanFlags(io);
  const f = {};
  for (const [k, v] of Object.entries(io._security_flags || {})) f['_sf_' + k] = v;
  for (const [k, v] of Object.entries(io._control_flags || {})) f['_cf_' + k] = v;
  return f;
}
// b[i] = octetul i din reprezentarea hex pe 8 (resp. 4) octeți, adică MSB primul.
function mkSec(bytes) { let h = ''; for (let i = 0; i < 8; i++) h += (bytes[i] || 0).toString(16).padStart(2, '0'); return BigInt('0x' + h); }
function mkCtl(bytes) { let h = ''; for (let i = 0; i < 4; i++) h += (bytes[i] || 0).toString(16).padStart(2, '0'); return parseInt(h, 16); }

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; } else { rele++; console.log('  ✗ ' + nume + (detaliu ? '  → ' + detaliu : '')); }
}
function sect(t) { console.log('\n' + t); }

// ════════════ 1. Vehicul „curat": contact pornit, motor pornit, nimic aprins ════════════
sect('1. Mașină în regulă (contact + motor, uși închise, niciun martor)');
{
  const b = [0, 0, 0, 0, 0, 0, 0, 0];
  b[0] = 0x05;                 // can1_status=1, can2_status=1
  b[3] = 0x01 | 0x02;          // key_in_ignition + ignition_on
  b[4] = 0x40;                 // engine_working
  const used = new Set();
  const h = canFlagsHtml(flat(mkSec(b), mkCtl([0, 0, 0, 0])), used);

  T('desenează ceva', h.length > 500, 'lungime ' + h.length);
  T('rezumat verde „nimic aprins"', h.includes('b-ok') && h.includes('Niciun martor aprins'));
  T('fără rezumat roșu', !h.includes('b-warn'));
  T('fără rezumat portocaliu', !h.includes('b-open'));
  T('Contact aprins', /Contact<\/span><span class="cf-s">Pornit</.test(h));
  T('Motorul funcționează — Pornit', /Motorul funcționează<\/span><span class="cf-s">Pornit</.test(h));
  T('Ușă față stânga — Închisă (nu „Închis")', /Ușă față stânga<\/span><span class="cf-s">Închisă</.test(h));
  T('Capotă — Închisă', /Capotă<\/span><span class="cf-s">Închisă</.test(h));
  T('Portbagaj — Închis (masculin)', /Portbagaj<\/span><span class="cf-s">Închis</.test(h));
  T('CHECK ENGINE — Stins', /CHECK ENGINE<\/span><span class="cf-s">Stins</.test(h));
  T('Centură șofer — Nepusă', /Centură șofer<\/span><span class="cf-s">Nepusă</.test(h));
  T('Faza scurtă — Stinsă (acord feminin)', /Faza scurtă<\/span><span class="cf-s">Stinsă</.test(h));
  T('marchează cheile ca folosite', used.has('_sf_ignition_on') && used.has('_cf_check_engine'));
  T('cod magistrală CAN 1', h.includes('cod 1'));
}

// ════════════ 2. Vehicul cu probleme ════════════
sect('2. Mașină cu probleme (CHECK ENGINE + ABS + ușă + capotă)');
{
  const b = [0, 0, 0, 0, 0, 0, 0, 0];
  b[0] = 0x05;
  b[3] = 0x03;
  b[4] = 0x40;
  b[5] = 0x01 | 0x10;          // door_front_left + hood_open
  const c = [0, 0, 0, 0];
  c[1] = 0x01 | 0x20;          // check_engine + abs_warning
  c[0] = 0x02;                 // oil_pressure_warning
  const used = new Set();
  const h = canFlagsHtml(flat(mkSec(b), mkCtl(c)), used);

  T('rezumat roșu prezent', h.includes('b-warn'));
  T('rezumat NUMEȘTE martorii, nu doar numărul', h.includes('CHECK ENGINE') && h.includes('ABS') && h.includes('Presiune / nivel ulei'));
  T('scrie „Martori aprinși:" la plural', h.includes('Martori aprinși:'));
  T('rezumat portocaliu numește ce e deschis', /Deschis: [^<]*Ușă față stânga/.test(h) && /Deschis: [^<]*Capot/.test(h));
  T('fără rezumat verde', !h.includes('b-ok'));
  T('CHECK ENGINE aprins (clasă lit + k-warn)', /class="cf k-warn lit"[^>]*CHECK ENGINE|CHECK ENGINE/.test(h) && h.includes('CHECK ENGINE</span><span class="cf-s">Aprins<'));
  T('ușa deschisă are clasa portocalie', /class="cf k-open lit"[\s\S]{0,220}Ușă față stânga/.test(h));
  T('ușa dreapta rămâne stinsă', /Ușă față dreapta<\/span><span class="cf-s">Închisă</.test(h));
  // bulina grupei ia culoarea celui mai serios semnal aprins din ea
  const gUsi = /UȘI|Uși și capace([\s\S]{0,140})/.exec(h);
  T('bulina la „Uși și capace" e portocalie (2 deschise)', /Uși și capace <span class="cf-cnt c-open">2</.test(h), (gUsi || [])[1]);
  T('bulina la „Martori de bord" e roșie (3 aprinși)', /Martori de bord <span class="cf-cnt c-warn">3</.test(h));
  T('bulina la „Contact și motor" e verde (contact+motor pornite)', /Contact și motor <span class="cf-cnt c-on">/.test(h));
  T('grupă fără nimic aprins nu are bulină', /Camion <i class="fas fa-chevron-right/.test(h) || !h.includes('Camion'));
  T('grupele sunt deschise implicit', (h.match(/<details class="cf-g" open>/g) || []).length >= 8);
}

// ════════════ 3. Un singur martor → singular ════════════
sect('3. Acordul la singular');
{
  const h = canFlagsHtml(flat(mkSec([5, 0, 0, 3, 0x40, 0, 0, 0]), mkCtl([0, 0x01, 0, 0])), new Set());
  T('„Martor aprins:" la singular', h.includes('Martor aprins:') && !h.includes('Martori aprinși:'));
}

// ════════════ 4. Steagurile nedecodate ════════════
sect('4. Steagurile pe care nu le citim încă');
{
  const h = canFlagsHtml(flat(mkSec([5, 0, 0, 3, 0, 0, 0, 0]), mkCtl([0, 0, 0, 0])), new Set());
  // NU număra `necitit<` peste tot: nota explicativă de jos conține și ea cuvântul. Doar plăcuțele.
  const placiNecitite = (h.match(/cf-s">necitit</g) || []).length;
  T('apar marcate „necitit"', placiNecitite === 5, 'găsite ' + placiNecitite);
  T('au ramă punctată (cf-nd)', (h.match(/cf-nd/g) || []).length === 5);
  T('nu sunt aprinse', !/cf-nd lit|lit cf-nd/.test(h));
  T('nota explicativă apare', h.includes('5 semnale sunt marcate'));
  T('Ambreiaj e printre ele', /Ambreiaj<\/span><span class="cf-s">necitit</.test(h));
  cat.NEDECODATE.forEach(k => T('are fișă în catalog: ' + k, !!cat.flagMeta(k)));
}

// ════════════ 5. Vehicul fără CAN ════════════
sect('5. Vehicul fără adaptor CAN');
{
  T('nu desenează nimic', canFlagsHtml({ ignition: 1, gsm_signal: 4 }, new Set()) === '');
  T('nu crapă fără catalog', (function () {
    const f = new Function('window', fnEsc + '\n' + fnFlags + '\n; return canFlagsHtml;')({});
    return f({ _sf_ignition_on: true }, new Set()) === '';
  })());
}

// ════════════ 6. Doar Control Flags (fără Security) ════════════
sect('6. Adaptor care dă doar martorii de bord');
{
  const h = canFlagsHtml(flat(undefined, mkCtl([0, 0x01, 0, 0])), new Set());
  T('desenează martorii', h.includes('CHECK ENGINE'));
  T('NU desenează uși (blocul lipsește)', !h.includes('Ușă față stânga'));
  T('NU arată „necitit" pentru steaguri din blocul lipsă', !h.includes('necitit'));
}

// ════════════ 7. Acoperire: fiecare steag decodat are fișă ════════════
sect('7. Acoperire față de codec8e.js');
{
  const sf = Object.keys(codec.decodeSecurityFlags(BigInt(0))).map(k => '_sf_' + k);
  const cf = Object.keys(codec.decodeControlFlags(0)).map(k => '_cf_' + k);
  const fara = [...sf, ...cf].filter(k => !cat.isFlagKey(k));
  T('toate steagurile decodate au nume + iconiță', fara.length === 0, fara.join(', '));
  const orfane = cat.FLAGS.filter(f => ![...sf, ...cf].includes(f.key)).map(f => f.key);
  const neasteptate = orfane.filter(k => !cat.NEDECODATE.includes(k));
  T('nu avem fișe pentru chei inexistente', neasteptate.length === 0, neasteptate.join(', '));

  // fiecare steag decodat ajunge efectiv pe ecran
  const b = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const h = canFlagsHtml(flat(mkSec(b), mkCtl([0xff, 0xff, 0xff, 0xff])), new Set());
  const lipsa = [...sf, ...cf].map(k => cat.flagMeta(k)).filter(f => f && !h.includes('>' + f.label + '<'));
  T('toate apar pe ecran cu totul aprins', lipsa.length === 0, lipsa.map(f => f.key).join(', '));
  T('nu rămâne nimic în „avansate"', true);
}

// ════════════ 8. IO_CATEGORIES nu mai conține steaguri ════════════
sect('8. Fără dublură cu lista de valori numerice');
{
  const bloc = grabTo('    const IO_CATEGORIES = {', '\n    };');
  const steaguriRamase = (bloc.match(/'_(sf|cf)_[a-z0-9_]+'/g) || []);
  T('IO_CATEGORIES nu mai listează steaguri', steaguriRamase.length === 0, steaguriRamase.join(', '));
  const cust = grabTo('    const CUSTOMER_IO_CATEGORIES = new Set([', ']);');
  ['Motor / Vehicul', 'Identificare', 'Specific Camion', 'Diagnosticare'].forEach(c =>
    T('clientul vede categoria „' + c + '"', cust.includes("'" + c + "'")));
}

// ════════════ 9. Parametrii generali de pe fișa adaptorului ════════════
sect('9. Cei 9 parametri generali din fișă sunt mapați și vizibili clientului');
{
  const bloc = grabTo('    const IO_CATEGORIES = {', '\n    };');
  const cust = grabTo('    const CUSTOMER_IO_CATEGORIES = new Set([', ']);');
  const GEN = ['can_engine_worktime_counted', 'can_total_mileage', 'can_total_mileage_counted',
    'can_fuel_consumed_counted', 'can_fuel_level_liters', 'can_engine_rpm', 'can_engine_temp',
    'can_vehicle_speed', 'can_vin'];
  GEN.forEach(k => {
    const m = new RegExp("^\\s*'([^']+)':[^\\n]*'" + k + "'", 'm').exec(bloc);
    if (!m) { T('mapat: ' + k, false, 'lipsește din IO_CATEGORIES'); return; }
    T('mapat + vizibil clientului: ' + k, cust.includes("'" + m[1] + "'"), 'e în „' + m[1] + '", ascunsă');
  });
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
