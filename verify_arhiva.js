// verify_arhiva.js — „Dispozitive arhivate": cimitirul cu bilet de întoarcere.
//
//   node verify_arhiva.js
//
// Un aparat se arhivează când se încheie un contract: nu mai primește date, i se taie conexiunea și
// iese de pe hartă. Istoricul lui se mai ține 30 de zile de la arhivare — cât clientul poate cere
// datele înapoi — apoi se șterge, cum scrie în contract (Anexa GDPR). Până pe 24.09 se ținea 2 ani:
// hârtia promitea una, aplicația făcea alta. Ecranul ăsta e singurul loc de unde ajungi la el.
//
// Ce prinde proba (toate, bube găsite pe 17.09 la analiza cartonașului „Arhivate"):
//   • butonul „Istoric" să nu facă nimic. Scria în selectorul altui panou (Hotspot), iar lista de
//     vehicule oricum ascunde arhivatele — deci pe ecran scria „istoricul rămâne accesibil" și
//     singurul buton care ți-l dădea era mort;
//   • termenul de păstrare socotit în ecran. E regula CONTRACTULUI (`ZILE_DATE_DUPA_INCETARE`, în
//     contracts.js); ecranul doar arată cifra primită, altfel ar apărea a doua regulă;
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

sect('2. Termenul: 30 de zile de la ARHIVARE, cum scrie în contract (24.09)');
const C = require('./contracts.js');
const cpdf = fs.readFileSync(P('contract_pdf.js'), 'utf8');
T('cifra stă într-un singur loc, lângă regulile contractului', C.ZILE_DATE_DUPA_INCETARE === 30, String(C.ZILE_DATE_DUPA_INCETARE));
T('hârtia contractului o citește de acolo (nu „30" scris de mână)',
  /C\.numar\(C\.ZILE_DATE_DUPA_INCETARE, 'zi', 'zile'\) \+ ' de la încetare/.test(cpdf) && !/în termen de 30 de zile de la încetare/.test(cpdf));
T('și serverul o citește de acolo', /const zile = contracte\.ZILE_DATE_DUPA_INCETARE;/.test(server));
T('NU mai e o setare de mediu (e o promisiune semnată)', !/ARCHIVE_RETENTION_DAYS/.test(server.replace(/^\s*\/\/.*$/gm, '')));
T('există funcția care socotește termenul', /function _arhivaTermen\(row\)/.test(server));
T('lista arhivatelor o trece prin ea', /res\.json\(rows\.map\(_arhivaTermen\)\)/.test(server));
T('ecranul NU-și face propria socoteală din zile',
  !/ZILE_DATE_DUPA_INCETARE/.test(blocArhiva) && !/730/.test(blocArhiva) && !/2 ani/.test(blocArhiva));
// decupăm funcția și o rulăm pe cazuri reale
const srcTermen = server.slice(server.indexOf('function _arhivaTermen(row)'), server.indexOf('\n}', server.indexOf('function _arhivaTermen(row)')) + 2);
const _arhivaTermen = new Function('contracte', srcTermen + '; return _arhivaTermen;')(C);
const ZI = 86400000, acum = Date.now();
const arhivat = (zile, sters) => _arhivaTermen({ archived_at: zile == null ? null : acum - zile * ZI, istoric_sters_at: sters ? acum : null });
T('arhivat ieri: 29 de zile de stat', arhivat(1).purge_zile === 29, String(arhivat(1).purge_zile));
T('și spune ziua ștergerii (30 de zile de la arhivare)', Math.round((arhivat(1).purge_la - (acum - ZI)) / ZI) === 30);
T('arhivat acum 25 de zile: 5 rămase', arhivat(25).purge_zile === 5, String(arhivat(25).purge_zile));
T('trecut de termen: zero, nu negativ', arhivat(40).purge_zile === 0, String(arhivat(40).purge_zile));
T('șters: zero și marcat', arhivat(40, true).purge_zile === 0 && arhivat(40, true).istoric_sters === true);
T('fără ziua arhivării: nu inventează un termen', arhivat(null).purge_zile === null);
T('vârsta pozițiilor NU mai contează (se număra de la ultima poziție, 2 ani)',
  _arhivaTermen({ archived_at: acum - ZI, last_ts: new Date(acum - 800 * ZI) }).purge_zile === 29);

sect('3. Ștergerea: tot istoricul aparatului, la termen');
const db = fs.readFileSync(P('db.js'), 'utf8');
T('aparatul își ține ziua arhivării', /ALTER TABLE devices ADD COLUMN IF NOT EXISTS archived_at BIGINT/.test(db));
T('arhivarea o scrie, restaurarea o șterge', /archived_at = \$3, istoric_sters_at = NULL WHERE imei = \$1',\s*\n\s*\[imei, s, s === 'archived' \? Date\.now\(\) : null\]/.test(db));
T('aparatele arhivate de dinainte primesc ziua de AZI (nimic nu se șterge pe nepusă masă)',
  /UPDATE devices SET archived_at = \$1 WHERE status = 'archived' AND archived_at IS NULL/.test(db));
const bucSterge = db.slice(db.indexOf('async function stergeIstoricAparat('), db.indexOf('async function stergeIstoricAparat(') + 1400);
T('se șterg pozițiile VII ale aparatului, nu doar copia din arhivă', /_stergeImeiPeLoturi\('positions', imei\)/.test(bucSterge));
T('și copia din arhivă', /_stergeImeiPeLoturi\('positions_archive', imei\)/.test(bucSterge));
T('și cursele (au locuri și adrese)', /DELETE FROM trips WHERE imei = \$1/.test(bucSterge));
T('și alertele declanșate', /DELETE FROM alert_history WHERE imei = \$1/.test(bucSterge));
T('pe loturi după timp, nu după ctid (pe hypertable ctid nu e unic)', /timestamp <= \$2/.test(db) && !/ctid/.test(bucSterge));
T('marcat „șters" DOAR dacă toate au mers', /if \(!out\.erori\.length\) await pool\.query\('UPDATE devices SET istoric_sters_at/.test(bucSterge));
T('rulează zilnic', /const runArchivePurge = \(\) => stergeIstoricArhivate\(\)/.test(server) && /setInterval\(runArchivePurge, 24 \* 60 \* 60 \* 1000\)/.test(server));
T('și se poate porni de mână (super-admin)', /app\.post\('\/api\/admin\/arhiva\/sterge-istoric', requireAuth, requireSuperadmin/.test(server));
T('fiecare ștergere lasă rând în jurnalul de audit', /entity: 'istoric_aparat'/.test(server));

sect('3b. Ecranul spune ce se pierde și când');
T('pragul de avertizare e scris o dată (ultima săptămână)', /var ARH_PRAG_ZILE = 7;/.test(blocArhiva));
T('cuvintele termenului stau într-un singur loc', /function _arhTermen\(d\)/.test(blocArhiva));
T('„istoricul se șterge pe <zi> (în N zile)"', /'istoricul se șterge pe ' \+ zi \+ ' \(în ' \+ _arhZile\(z\) \+ '\)'/.test(blocArhiva));
T('și „s-a șters", pentru cele trecute', /istoricul s-a șters/.test(blocArhiva));
T('bandă de sus când sunt aparate pe ducă', /arch-note-warn[\s\S]{0,300}istoricul pe ducă/.test(blocArhiva));
T('care spune și cum dai datele înapoi', /Istoric" → Export CSV/.test(blocArhiva));
T('portocaliul e doar pentru ce cere o mișcare, nu pentru o explicație',
  /\.arch-note \{[^}]*background: var\(--bg-dark\)/.test(html) && /\.arch-note-warn \{[^}]*rgba\(245,158,11/.test(html));
T('fișa contractului încheiat amintește de arhivare și de cele 30 de zile', /d\.date_dupa_incetare_zile/.test(html) && /date_dupa_incetare_zile: contracte\.ZILE_DATE_DUPA_INCETARE/.test(server));

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
T('cartonașul nu mai promite „2 ani"', !/istoric păstrat 2 ani/.test(html));
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

// ─── 7. Pe server pornit: arhivez, îmbătrânesc 31 de zile, șterg — și chiar nu mai e nimic ───
const { spawn } = require('child_process');
const PORT = 3222, DIR = '.arh-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234',
  SESSION_SECRET: 'ci_arh', PORT: String(PORT), TCP_PORT: '5222', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('7. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
  const co = (await R('POST', '/api/companies', { name: 'CI Arhivă SRL' })).j;
  const IMEI = '356000000009901', IMEI2 = '356000000009902';
  for (const imei of [IMEI, IMEI2]) {
    await R('POST', '/api/devices', { imei: imei, name: 'Camion ' + imei.slice(-2), company_id: co.id });
    for (let k = 3; k >= 1; k--) await R('POST', '/api/test/simulate', { imei: imei, speed: 40, ts: new Date(Date.now() - k * 3600000).toISOString() });
  }
  const zi0 = new Date(Date.now() - 5 * 3600000).toISOString(), zi1 = new Date().toISOString();
  const istoric = async (imei) => { const r = await R('GET', '/api/history/' + imei + '?from=' + encodeURIComponent(zi0) + '&to=' + encodeURIComponent(zi1)); return Array.isArray(r.j) ? r.j.length : (r.j && Array.isArray(r.j.positions) ? r.j.positions.length : -1); };
  T('aparatul are istoric înainte', await istoric(IMEI) >= 3, String(await istoric(IMEI)));
  for (const imei of [IMEI, IMEI2]) await R('PUT', '/api/devices/' + imei + '/status', { status: 'archived' });
  let lista = (await R('GET', '/api/archived-devices')).j;
  const a1 = lista.find(d => d.imei === IMEI) || {};
  T('arhivat azi: 30 de zile de stat', a1.purge_zile === 30 && a1.purge_total_zile === 30, JSON.stringify({ z: a1.purge_zile, t: a1.purge_total_zile }));
  T('istoricul arhivat se vede în continuare', await istoric(IMEI) >= 3);
  // Primul aparat „a fost arhivat" acum 31 de zile; al doilea, acum 10.
  await R('POST', '/api/test/arhivat-de', { imei: IMEI, zile: 31 });
  await R('POST', '/api/test/arhivat-de', { imei: IMEI2, zile: 10 });
  const rap = (await R('POST', '/api/admin/arhiva/sterge-istoric')).j || {};
  T('ștergerea îl ia doar pe cel trecut de 30 de zile', (rap.sterse || []).length === 1 && rap.sterse[0].imei === IMEI, JSON.stringify(rap.sterse && rap.sterse.map(x => x.imei)));
  T('și îi șterge și pozițiile vii, și copia din arhivă', rap.sterse && rap.sterse[0].pozitii >= 3 && rap.sterse[0].arhiva >= 3, JSON.stringify(rap.sterse && rap.sterse[0]));
  T('după ștergere, istoricul lui e gol', await istoric(IMEI) === 0, String(await istoric(IMEI)));
  T('iar celălalt (10 zile) e neatins', await istoric(IMEI2) >= 3, String(await istoric(IMEI2)));
  lista = (await R('GET', '/api/archived-devices')).j;
  const d1 = lista.find(d => d.imei === IMEI) || {}, d2 = lista.find(d => d.imei === IMEI2) || {};
  T('aparatul rămâne pe listă, marcat „istoric șters"', d1.istoric_sters === true && d1.purge_zile === 0);
  T('celălalt mai are 20 de zile', d2.purge_zile === 20, String(d2.purge_zile));
  T('a doua rulare nu mai șterge nimic', ((await R('POST', '/api/admin/arhiva/sterge-istoric')).j.sterse || []).length === 0);
  await R('PUT', '/api/devices/' + IMEI2 + '/status', { status: 'active' });
  await R('POST', '/api/test/arhivat-de', { imei: IMEI2, zile: 40 });   // n-are voie să conteze: e activ
  T('un aparat restaurat nu se mai șterge (e iar în contract)', ((await R('POST', '/api/admin/arhiva/sterge-istoric')).j.sterse || []).length === 0);
  T('și își păstrează istoricul', await istoric(IMEI2) >= 3);
  gata();
})().catch((e) => { console.log('  ✗ EROARE: ' + e.message); rele++; gata(); });
