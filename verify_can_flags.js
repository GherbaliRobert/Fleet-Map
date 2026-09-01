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
// `cfIcon` desenează pictograma plăcuței din can_icons.js (aceleași desene ca pe telefon). O luăm
// și pe ea, altfel funcția extrasă crapă la prima plăcuță.
const fnIcon = grabTo('    function cfIcon(f, val) {', '\n    function canFlagsHtml');
const fnFlags = grabTo('    function canFlagsHtml(flatIo, usedKeys) {', '\n    // ATENȚIE: aici stau DOAR');

const win = {
  // Pagina primește de la server și funcțiile de decizie (ce se vede, în ce bandă), serializate
  // din can_flags.js. Le atașăm la fel aici — sunt EXACT aceleași funcții, nu copii.
  RA_CANFLAGS: Object.assign(
    { groups: cat.GROUPS, flags: cat.FLAGS, kindText: cat.KIND_TEXT, undecoded: cat.NEDECODATE, stateBand: cat.BANDA_STARE },
    { benzi: cat.benzi, seVede: cat.seVede, stateText: cat.stateText }
  ),
  RA_CANICONS: require('./can_icons.js').ICOANE,
};
const canFlagsHtml = new Function('window', fnEsc + '\n' + fnIcon + '\n' + fnFlags + '\n; return canFlagsHtml;')(win);

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
  T('nu apare bandă de martori', !h.includes('b-martori'));
  T('nu apare bandă „deschis"', !h.includes('b-deschis'));
  T('banda de stare există (frână, treaptă, încuietoare)', h.includes('b-stare'));
  T('Contact aprins', /Contact<\/span><span class="cfb-s">Pornit</.test(h));
  T('Motorul funcționează — Pornit', /Motorul funcționează<\/span><span class="cfb-s">Pornit</.test(h));
  // 27.08 — regula cerută: pe ecran apar DOAR stările active. O mașină în regulă nu mai umple
  // pagina cu zeci de casete stinse; ușa închisă și martorul stins pur și simplu lipsesc.
  T('ușa închisă NU mai apare', !h.includes('>Ușă față stânga<'));
  T('capota închisă NU mai apare', !h.includes('>Capotă<'));
  T('CHECK ENGINE stins NU mai apare', !h.includes('>CHECK ENGINE<'));
  T('faza scurtă stinsă NU mai apare', !h.includes('>Faza scurtă<'));
  T('spune omului de ce sunt puține', h.includes('se arată doar ce e activ acum'));
  // Excepțiile: se văd tot timpul, chiar și „nu".
  T('Frâna de mână se vede și eliberată', /Frână de mână<\/span><span class="cfb-s">Eliberată</.test(h));
  T('Mașina încuiată se vede și descuiată', /Mașina încuiată<\/span><span class="cfb-s">Nu</.test(h));
  // Acordul gramatical al textelor stinse rămâne verificat direct în catalog: se folosește în
  // balonul de pe telefon și la cele trei plăcuțe permanente, chiar dacă nu se mai vede aici.
  T('acord: Ușă … Închisă (nu „Închis")', cat.stateText('_sf_door_front_left', false) === 'Închisă');
  T('acord: Portbagaj … Închis (masculin)', cat.stateText('_sf_trunk_open', false) === 'Închis');
  T('acord: Centură … Nepusă', cat.stateText('_cf_driver_seatbelt', false) === 'Nepusă');
  T('acord: Faza scurtă … Stinsă (feminin)', cat.stateText('_cf_dipped_headlights', false) === 'Stinsă');
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

  T('banda de martori există', h.includes('b-martori'));
  T('martorii sunt numiți, fiecare cu plăcuța lui', h.includes('CHECK ENGINE') && h.includes('ABS') && h.includes('Presiune / nivel ulei'));
  T('banda de martori își spune numărul', /Martori aprinși <span class="cfb-n">3</.test(h));
  T('ce e deschis stă în banda lui', h.indexOf('b-deschis') > 0 && h.indexOf('b-deschis') < h.indexOf('Ușă față stânga') && h.indexOf('b-deschis') < h.indexOf('Capot'));
  T('nu apare mesajul „totul e în regulă"', !h.includes('cfb-ok'));
  T('CHECK ENGINE aprins (clasă lit + k-warn)', /class="cfb-t k-warn lit"/.test(h) && h.includes('CHECK ENGINE</span><span class="cfb-s">Aprins<'));
  T('ușa deschisă are clasa portocalie', /class="cfb-t k-open lit"[\s\S]{0,260}Ușă față stânga/.test(h));
  T('ușa dreapta (închisă) nu se mai desenează deloc', !h.includes('>Ușă față dreapta<'));
  // bulina grupei ia culoarea celui mai serios semnal aprins din ea
  T('banda „Deschis acum" numără 2', /Deschis acum <span class="cfb-n">2</.test(h));
  T('martorii ies vizual din restul (bandă proprie)', /cfb-band b-martori/.test(h));
  T('contactul și motorul stau în banda de stare', h.indexOf('b-stare') > 0 && h.indexOf('b-stare') < h.indexOf('Motorul funcționează') && h.indexOf('Motorul funcționează') < h.indexOf('b-martori'));
  T('o bandă goală nu se desenează deloc', !h.includes('b-camion'));
  // Benzile nu se mai pliază: ce e activ trebuie să se vadă din prima, fără niciun clic.
  T('nu mai sunt secțiuni de deschis cu clicul', !h.includes('<details class="cf-g"'));
  T('ordinea e stare → martori → deschis → active',
    h.indexOf('b-stare') < h.indexOf('b-martori') && h.indexOf('b-martori') < h.indexOf('b-deschis'));
}

// ════════════ 3. Un singur martor → singular ════════════
sect('3. Acordul la singular');
{
  const h = canFlagsHtml(flat(mkSec([5, 0, 0, 3, 0x40, 0, 0, 0]), mkCtl([0, 0x01, 0, 0])), new Set());
  T('un singur martor → banda numără 1', /Martori aprinși <span class="cfb-n">1</.test(h));
}

// ════════════ 4. Steagurile nedecodate ════════════
sect('4. Steagurile pe care nu le citim încă');
{
  const h = canFlagsHtml(flat(mkSec([5, 0, 0, 3, 0, 0, 0, 0]), mkCtl([0, 0, 0, 0])), new Set());
  // NU număra `necitit<` peste tot: nota explicativă de jos conține și ea cuvântul. Doar plăcuțele.
  // 26.08: din cele 5 nedecodate a rămas UNA (închiderea centralizată). Ambreiajul și telecomanda
  // au acum biți oficiali (P4) și se decodează — deci nu mai apar „necitite", ci ca plăcuțe vii.
  // 27.08: sub regula „doar stările active", plăcuța „necitit" nu se mai desenează — era singura
  // casetă stinsă rămasă pe ecran. Rămâne nota de jos, care spune limpede că lipsește ceva.
  T('nu mai desenăm plăcuțe „necitit"', !/necitit</.test(h.replace(/cfb-note[\s\S]*$/, '')));
  T('dar nota explicativă rămâne', h.includes('nu apare aici'));
  T('nota spune și de ce lipsește', h.includes('preferăm să lipsească decât să arate greșit'));
  T('Închiderea centralizată nu apare ca plăcuță', !h.includes('>Închidere centralizată<'));
  T('Ambreiajul se decodează (P4), deci nu intră la nedecodate', !cat.NEDECODATE.includes('_sf_clutch'));
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
  // 26.08: cheile valabile vin din TOATE decodoarele — P2 și P4 (ALL-CAN300).
  const sf = [...new Set([
    ...Object.keys(codec.decodeSecurityFlags(BigInt(0))),
    ...Object.keys(codec.decodeSecurityFlagsP4('0')),
  ])].map(k => '_sf_' + k);
  const cf = [...new Set([
    ...Object.keys(codec.decodeControlFlags(0)),
    ...Object.keys(codec.decodeControlFlagsP4('0')),
    ...Object.keys(codec.decodeIndicatorFlagsP4('0')),
  ])].map(k => '_cf_' + k);
  const fara = [...sf, ...cf].filter(k => !cat.isFlagKey(k));
  T('toate steagurile decodate au nume + iconiță', fara.length === 0, fara.join(', '));
  // 26.08: o placuta mai poate fi aprinsa si de puntea semnalelor SEPARATE (can_flag_io.js) —
  // asa trimite VW Passat B7. Starile care exista doar acolo (geamuri, GPL, Start-Stop, remorca)
  // n-au bit in nicio masca, deci nu apar in listele sf/cf de mai sus.
  const dinPunte = new Set(Object.values(require('./can_flag_io.js').PE_ID));
  // Treapta de viteză e DERIVATĂ: o calculează expandCanFlags din cele patru semnale P/R/N/D, deci
  // n-are nici bit, nici ID propriu.
  const DERIVATE = new Set(['_sf_gear']);
  const orfane = cat.FLAGS.filter(f => ![...sf, ...cf].includes(f.key) && !dinPunte.has(f.key) && !DERIVATE.has(f.key)).map(f => f.key);
  const neasteptate = orfane.filter(k => !cat.NEDECODATE.includes(k));
  T('nu avem fișe pentru chei inexistente', neasteptate.length === 0, neasteptate.join(', '));

  // fiecare steag decodat ajunge efectiv pe ecran — inclusiv cele P4 (26.08): aprindem și
  // containerele P4 cu totul, exact cum ar veni de la un ALL-CAN300 cu toate semnalele active.
  const b = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const ioTot = { can_security_state_flags: mkSec(b), can_control_state_flags: mkCtl([0xff, 0xff, 0xff, 0xff]),
    can_security_state_flags_p4: '18446744073709551615', can_control_state_flags_p4: '18446744073709551615',
    can_indicator_state_flags_p4: '18446744073709551615' };
  codec.expandCanFlags(ioTot);
  const fTot = {};
  for (const [k, v] of Object.entries(ioTot._security_flags || {})) fTot['_sf_' + k] = v;
  for (const [k, v] of Object.entries(ioTot._control_flags || {})) fTot['_cf_' + k] = v;
  const h = canFlagsHtml(fTot, new Set());
  // Regula de afișare stă într-un singur loc — `seVede` din can_flags.js. Verificăm că ecranul o
  // respectă în amândouă sensurile, nu doar că „apare tot".
  // (Cu toți biții pe 1, câteva stări ies logic STINSE — de pildă „Regim personal", care e inversat
  // în protocol: bitul 1 înseamnă „serviciu". Testul vechi presupunea că 1 = aprins pentru toate.)
  const meta = [...sf, ...cf].map(k => cat.flagMeta(k)).filter(Boolean);
  const lipsa = meta.filter(f => cat.seVede(f.key, fTot[f.key]) && !h.includes('>' + f.label + '<'));
  T('tot ce trebuie să se vadă, se vede', lipsa.length === 0, lipsa.map(f => f.key).join(', '));
  const strecurate = meta.filter(f => !cat.seVede(f.key, fTot[f.key]) && h.includes('>' + f.label + '<'));
  T('nu se strecoară nicio stare inactivă', strecurate.length === 0, strecurate.map(f => f.key).join(', '));
  T('treptele P/R/N/D nu apar una câte una',
    !h.includes('>Cutie în parcare (P)<') && !h.includes('>Cutie în mers (D)<'));
  T('treapta apare o dată, cu litera ei', /Treapta de viteză<\/span><span class="cfb-s">P</.test(h));
  T('desenul treptei e caseta cu litera P', h.includes('>P</text>'));
  T('pictogramele vin din can_icons.js, nu din Font Awesome', (h.match(/<svg class="cf-i"/g) || []).length > 20);
  T('regula de așezare vine de la server, nu e rescrisă în pagină',
    require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8').includes('d.benzi=benzi'));
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

// ════════════ 10. Aplicația de telefon ════════════
// Ăsta e cel mai important din listă. Prima oară am pus plăcuțele într-o ramură pe care N-O DESCHIDE
// NIMIC (`sheet === 'can'` din VehicleDetail — nicăieri nu se cheamă `setSheet('can')`), iar butonul
// „Date CAN" merge de fapt pe altă rută, către CanScreen. Codul se compila, testele treceau, iar pe
// telefon nu se vedea nimic. Deci nu verificăm doar că există componenta, ci că ecranul la care
// AJUNGE omul o desenează.
sect('10. Telefonul — plăcuțele sunt pe ecranul la care se ajunge');
{
  const rd = (f) => fs.readFileSync(require('path').join(__dirname, 'mobile', 'src', f), 'utf8');
  const comp = rd('components/CanFlags.tsx');
  const app = rd('App.tsx');
  const canScr = rd('screens/CanScreen.tsx');
  const vehDet = rd('screens/VehicleDetail.tsx');
  const lib = rd('lib/canflags.ts');
  const ico = rd('components/Icon.tsx');

  T('componenta CanFlags există și e exportată', /export function CanFlags\(/.test(comp));
  T('CanScreen o desenează', /<CanFlags\b/.test(canScr));
  T('CanScreen o importă', /import \{ CanFlags \}/.test(canScr));
  // ruta pe care o deschide butonul „Date CAN" trebuie să ducă exact la ecranul care le desenează
  const ruta = /path="([^"]*\/can)"\s+component=\{(\w+)\}/.exec(app);
  T('ruta /…/can duce la CanScreen', !!ruta && ruta[2] === 'CanScreen', ruta ? ruta[2] : 'rută negăsită');
  T('butonul „Date CAN" merge pe acea rută', new RegExp('/can`\\)').test(vehDet) && /Date CAN/.test(vehDet));

  T('catalogul se ia de la server, nu e rescris local', /\/api\/can-flags/.test(rd('api/endpoints.ts')) && /Api\.canFlags\(\)/.test(lib));
  T('catalogul se ține offline (Preferences)', /Preferences\.(set|get)/.test(lib));
  T('nicio listă paralelă de etichete pentru steaguri în telefon',
    !/_sf_|_cf_/.test(vehDet.slice(vehDet.indexOf('CAN_LABELS'), vehDet.indexOf('function prettyKey'))));
  T('lista brută nu mai repetă steagurile descifrate',
    /k === '_security_flags' \|\| k === '_control_flags'/.test(vehDet));

  // fiecare desen cerut de catalog există CU ADEVĂRAT în Icon.tsx (și în tip, și în harta de desene)
  const harta = ico.slice(ico.indexOf('const P: Record<IconName, string> = {'));
  const desenate = new Set([...harta.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):/gm)].map(m => m[1]));
  const tip = ico.slice(ico.indexOf('export type IconName'), ico.indexOf('const P:'));
  const inTip = new Set([...tip.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(m => m[1]));
  const cerute = [...new Set(cat.FLAGS.map(f => f.mi).concat(cat.GROUPS.map(g => g.mi)))];
  const faraDesen = cerute.filter(n => !desenate.has(n));
  const faraTip = cerute.filter(n => !inTip.has(n));
  T('toate iconițele de telefon au desen în Icon.tsx', faraDesen.length === 0, faraDesen.join(', '));
  T('toate sunt declarate în tipul IconName', faraTip.length === 0, faraTip.join(', '));
  T('stilurile stau lângă componentă', /import '\.\/CanFlags\.css'/.test(comp) &&
    fs.existsSync(require('path').join(__dirname, 'mobile', 'src', 'components', 'CanFlags.css')));
}

// ════════════ 11. Mașină cu adaptor CAN, dar fără steaguri ════════════
// Cazul REAL semnalat de Alin, 22.08: vehicul care trimite turație, combustibil și kilometraj prin
// CAN, dar nu și IO 132/123. Panoul nu desena nimic și părea că aplicația e stricată.
sect('11. Mașină cu CAN, dar care nu trimite steaguri');
{
  const doarCifre = { can_engine_rpm: 679, can_fuel_level_liters: 51.1, can_total_mileage: 404795, ignition: 0 };
  const h = canFlagsHtml(doarCifre, new Set());
  T('nu mai tace — spune de ce lipsesc', h.length > 0);
  T('scrie limpede că mașina NU trimite semnalele', /nu trimite<\/strong> semnalele de stare/.test(h));
  T('nu arată nicio plăcuță', !h.includes('class="cfb-t k-'));
  T('nu arată mesajul verde „totul e în regulă"', !h.includes('cfb-ok'));
  T('are titlu de secțiune', h.includes('Starea mașinii'));

  // vehicul FĂRĂ CAN deloc → tot tăcere, nu vrem mesajul pe fiecare mașină cu GPS simplu
  T('mașină fără CAN → nimic', canFlagsHtml({ ignition: 1, gsm_signal: 4, external_voltage: 12820 }, new Set()) === '');

  // dacă IO-ul brut vine dar decodarea n-a mers, e problema NOASTRĂ și o spunem ca atare
  const h2 = canFlagsHtml({ can_engine_rpm: 800, can_security_state_flags: 12345 }, new Set());
  T('IO brut prezent, nedesfăcut → recunoaștem că e problema noastră', /problemă de-a noastră/.test(h2));
}

// ════════════ 12. Catalogul IO se reîncarcă după autentificare ════════════
// Ruta /api/io-catalog cere autentificare, dar `loadIoCatalog()` rula la încărcarea paginii, cu
// ecranul de login încă pe ecran → 401 înghițit, catalog gol pe veci („Niciun IO găsit").
sect('12. Catalogul IO nu mai rămâne gol după login');
{
  T('se reîncearcă la deschiderea ferestrei', /if \(!\(window\.IO_CAT \|\| \[\]\)\.length\)[\s\S]{0,400}loadIoCatalog\(\)/.test(src));
  T('se încarcă și la autentificare', /applyPermissionsUI\(\);[\s\S]{0,300}window\.loadIoCatalog\(\)/.test(src));
  T('mesaj de eroare dacă tot nu merge', /Nu am putut încărca catalogul/.test(src));
}

sect('13. Banda de martori de sub hartă (telefon) + paritatea regulii de așezare');
{
  const rd = (f) => fs.readFileSync(require('path').join(__dirname, 'mobile', 'src', f), 'utf8');
  const lib = rd('lib/canflags.ts');
  const tt = rd('components/CanTellTales.tsx');
  const comp = rd('components/CanFlags.tsx');
  const vehDet = rd('screens/VehicleDetail.tsx');
  const srv = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');

  T('banda de martori există', /export function CanTellTales\(/.test(tt));
  T('e desenată pe ecranul cu harta vehiculului', /<CanTellTales\b/.test(vehDet) && /import \{ CanTellTales \}/.test(vehDet));
  // Trebuie să stea SUB hartă și DEASUPRA butoanelor — acolo a cerut-o Robert.
  T('stă între hartă și butoane', vehDet.indexOf('<CanTellTales') > vehDet.indexOf('class="d-map"') && vehDet.indexOf('<CanTellTales') < vehDet.indexOf('class="d-actions"'));
  T('ecranul detaliat rămâne (nu l-am înlocuit)', /export function CanFlags\(/.test(comp));

  // Paritatea regulii: ordinea benzii de stare NU se scrie a doua oară în telefon.
  T('serverul trimite ordinea benzii de stare', srv.includes('stateBand: canFlags.BANDA_STARE'));
  T('telefonul o citește de la server, nu o rescrie', lib.includes('cat.stateBand') && !/_sf_handbrake['\"]\s*,\s*['\"]_sf_gear/.test(lib));
  T('clasificarea e aceeași ca pe server', /kind === 'warn' \? 'martori' : f\.kind === 'open' \? 'deschis' : 'active'/.test(lib));
  const srvReg = fs.readFileSync(require('path').join(__dirname, 'can_flags.js'), 'utf8');
  T('și pe server clasificarea e scrisă la fel', /kind === 'warn' \? 'martori' : f\.kind === 'open' \? 'deschis' : 'active'/.test(srvReg));

  // Aceleași patru benzi, cu aceleași nume, în amândouă ecranele.
  const benziWeb = ['stare', 'martori', 'deschis', 'active'];
  T('web-ul desenează cele patru benzi', benziWeb.every((b) => src.includes("banda('" + b + "'")));
  T('telefonul desenează aceleași patru benzi', benziWeb.every((b) => comp.includes('cheie="' + b + '"')));

  // Ordinea din bandă: întâi ce cere atenție.
  T('sub hartă apar întâi martorii, apoi ce e deschis, apoi starea', /\.\.\.b\.martori, \.\.\.b\.deschis, \.\.\.b\.stare/.test(tt));
  T('luminile aprinse NU urcă sub hartă (nu e nimic de făcut cu ele)', !/b\.active/.test(tt));
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
