// verify_arhiva.js — „Dispozitive arhivate": cimitirul cu bilet de întoarcere.
//
//   node verify_arhiva.js
//
// Un aparat se arhivează când se încheie un contract: nu mai primește date, i se taie conexiunea și
// iese de pe hartă — dar istoricul lui de până atunci se copiază deoparte și se ține 2 ani. Ecranul
// ăsta e singurul loc de unde ajungi la el.
//
// Ce prinde proba (toate, bube găsite pe 17.09 la analiza cartonașului „Arhivate"):
//   • butonul „Istoric" să nu facă nimic. Scria în selectorul altui panou (Hotspot), iar lista de
//     vehicule oricum ascunde arhivatele — deci pe ecran scria „istoricul rămâne accesibil" și
//     singurul buton care ți-l dădea era mort;
//   • termenul de păstrare socotit în ecran. E o setare de SERVER (ARCHIVE_RETENTION_DAYS); ecranul
//     doar arată cifra primită, altfel ar apărea a doua regulă, care se desincronizează;
//   • lista plată, fără căutare — la trei aparate merge, la șaizeci nu mai găsești nimic;
//   • portocaliul pus din construcție pe cartonaș: arhivat nu e o problemă, e un capăt normal;
//   • butonul „Restaurează" scris cu text închis pe fundal închis (contrast 1,0, măsurat).
//
// Codul nu se copiază aici: se decupează din sursă și se execută.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

function bloc(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return html.slice(i, j);
}
const blocIstoric = bloc('// ── începe „istoricul unui aparat arhivat" ──', '// ── sfârșit „istoricul unui aparat arhivat" ──');
const blocArhiva = bloc('// ── începe „arhiva, pe firme" ──', '// ── sfârșit „arhiva, pe firme" ──');

sect('1. Butonul „Istoric" duce chiar la istoric');
// (căutăm CODUL, nu comentariul de deasupra — el pomenește `#hs-imei` tocmai ca să explice buba)
T('nu mai scrie în selectorul altui panou', !/getElementById\('hs-imei'\)/.test(blocIstoric));
T('cere vehiculul anume, prin `_hpCerut`', /window\._hpCerut = String\(imei\)/.test(blocIstoric));
T('și deschide ecranul Traseu', /showView\('traseu'\)/.test(blocIstoric));
// lista de vehicule a ecranului Traseu
const fnFill = html.slice(html.indexOf('async function fillHistoryVehicle()'), html.indexOf('async function fillHistoryVehicle()') + 2200);
T('lista Traseului ia vehiculul cerut din `_hpCerut`', /const cerut = window\._hpCerut \? String\(window\._hpCerut\) : null;/.test(fnFill));
T('și cere arhivatele DOAR pentru el', /fetch\('\/api\/devices' \+ \(cerut \? '\?includeArchived=1' : ''\)\)/.test(fnFill));
T('nu lasă cererea agățată pentru data viitoare', /window\._hpCerut = null;/.test(fnFill));
T('îl și selectează', /if \(cerut && list\.some\([\s\S]{0,80}selectedImei = cerut/.test(fnFill));
T('scrie pe rând că e arhivat (altfel n-ai ști de ce n-are date noi)',
  /d\.status === 'archived' \? ' \(arhivat\)' : ''/.test(fnFill));
T('serverul chiar știe să includă arhivatele', /if \(!req\.query\.includeArchived\) devices = devices\.filter\(d => d\.status !== 'archived'\)/.test(server));

sect('2. Termenul de păstrare e socotit pe SERVER, nu în ecran');
T('există funcția care-l socotește', /function _arhivaTermen\(row\)/.test(server));
T('și citește setarea de mediu', /parseInt\(process\.env\.ARCHIVE_RETENTION_DAYS\) \|\| 730/.test(server));
T('lista arhivatelor o trece prin ea', /res\.json\(rows\.map\(_arhivaTermen\)\)/.test(server));
T('ecranul NU-și face propria socoteală din zile',
  !/ARCHIVE_RETENTION_DAYS/.test(blocArhiva) && !/730/.test(blocArhiva));
// decupăm funcția și o rulăm pe cazuri reale
const srcTermen = server.slice(server.indexOf('function _arhivaTermen(row)'), server.indexOf('\n}', server.indexOf('function _arhivaTermen(row)')) + 2);
const _arhivaTermen = new Function('process', srcTermen + '; return _arhivaTermen;')({ env: { ARCHIVE_RETENTION_DAYS: '730' } });
const ZI = 86400000, acum = Date.now();
const rand = (zileNou, zileVechi) => ({ last_ts: zileNou == null ? null : new Date(acum - zileNou * ZI), first_ts: zileVechi == null ? null : new Date(acum - zileVechi * ZI) });
const proaspat = _arhivaTermen(rand(1, 30));
const peDuca = _arhivaTermen(rand(700, 740));   // cea mai veche poziție a TRECUT de termen → se șterge deja
const gata = _arhivaTermen(rand(800, 900));
const fara = _arhivaTermen(rand(null, null));
T('aparat proaspăt arhivat: ~2 ani de stat', proaspat.purge_zile === 729, String(proaspat.purge_zile));
T('și nu i s-a șters nimic încă', proaspat.purge_inceput === false);
T('aparat vechi: puține zile rămase', peDuca.purge_zile === 30, String(peDuca.purge_zile));
T('iar partea veche se șterge deja', peDuca.purge_inceput === true);
T('trecut de termen: zero, nu negativ', gata.purge_zile === 0, String(gata.purge_zile));
T('fără nicio poziție păstrată: nu inventează un termen', fara.purge_zile === null, String(fara.purge_zile));

sect('3. Ecranul spune ce se pierde și când');
T('pragul de avertizare e scris o dată', /var ARH_PRAG_ZILE = 60;/.test(blocArhiva));
T('cuvintele termenului stau într-un singur loc', /function _arhTermen\(d\)/.test(blocArhiva));
T('„istoricul se șterge în N zile"', /istoricul se șterge în ' \+ z/.test(blocArhiva));
T('și „s-a șters", pentru cele trecute de termen', /istoricul s-a șters/.test(blocArhiva));
T('bandă de sus când sunt aparate pe ducă', /arch-note-warn[\s\S]{0,300}istoricul pe ducă/.test(blocArhiva));
T('care spune și ce ai de făcut', /scoate-le acum dintr-un raport/.test(blocArhiva));
T('portocaliul e doar pentru ce cere o mișcare, nu pentru o explicație',
  /\.arch-note \{[^}]*background: var\(--bg-dark\)/.test(html) && /\.arch-note-warn \{[^}]*rgba\(245,158,11/.test(html));

sect('4. Grupate pe firme, cu căutare');
T('grupurile se fac pe firmă', /function _arhGrupuri\(rows\)/.test(blocArhiva));
T('„Fără firmă" stă la urmă, restul alfabetic', /if \(a\.k === '_fara'\) return 1;[\s\S]{0,120}localeCompare\(b\.nume, 'ro'\)/.test(blocArhiva));
T('poartă același chenar ca „Dispozitive"', /rax-devgr/.test(blocArhiva));
T('fiecare grup are sumar', /' aparat' : ' aparate'/.test(blocArhiva));
T('și buton „Deschide firma"', /Deschide firma/.test(blocArhiva));
T('un grup cu ceva de rezolvat stă MEREU deschis', /var deschis = !!q \|\| pb > 0/.test(blocArhiva));
T('există căutare', /rax-dev-search[\s\S]{0,140}_arhCautaSet/.test(blocArhiva));
T('care caută și după firmă', /raCauta\(q, d\.name, d\.plate, d\.imei, d\.company_name\)/.test(blocArhiva));
T('lista nu mai are derulare proprie (bară în bară)', !/\.arch-list \{[^}]*overflow-y: auto/.test(html));
T('când e goală, te trimite în „Dispozitive", nu la vechiul loc',
  /Niciun aparat arhivat[\s\S]{0,900}raxAdminTab\(\\'devices\\'\)[\s\S]{0,80}Deschide Dispozitive/.test(blocArhiva) &&
  !/Management → Vehicule/.test(blocArhiva));

sect('5. Cartonașul „Arhivate" nu mai e portocaliu din construcție');
const cardArh = (html.match(/<button class="adash-card[^"]*" data-card="archived"[\s\S]*?<\/button>/) || [])[0] || '';
T('cartonașul există', !!cardArh);
T('și NU poartă „adash-warn" scris în pagină', !/adash-warn/.test(cardArh), cardArh.slice(0, 60));
T('are rândul de stare, ca celelalte', /adash-sub" id="adash-s-archived"/.test(cardArh));
T('portocaliul se aprinde din cod, doar când e ceva', /if \(peDucă\) \{[\s\S]{0,260}classList\.add\('adash-warn'\)/.test(html));
T('și se stinge la fel de ușor', /if \(card\) card\.classList\.remove\('adash-warn'\);/.test(html));
T('lista mare se cere DOAR dacă există arhivate', /if \(!n \|\| !sub\) return;/.test(html));

sect('6. Butonul „Restaurează" chiar se vede');
// `.ra-camp .btn-sm { background: transparent }` + regula globală care forțează textul închis
// (`.btn-primary { color:#06210F !important }`) dădeau text închis pe fundal închis: contrast 1,0.
T('scrierea veche a butonului principal e în familia casei',
  /\.ra-camp \.rax-btn\.primary, \.ra-camp \.btn-sm\.btn-primary,[^{]*\{[^}]*background:var\(--accent\)/.test(css));
T('și la hover', /\.ra-camp \.rax-btn\.primary:hover, \.ra-camp \.btn-sm\.btn-primary:hover/.test(css));
T('regula care le face transparente e tot acolo (deci fără ea n-ar avea rost)',
  /\.ra-camp \.rax-btn, \.ra-camp \.btn-sm,[^{]*\{[\s\S]{0,320}background:transparent/.test(css));
T('ecranul arhivei chiar e „ra-camp"', /<div id="admin-tab-archived" class="ra-camp"/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
