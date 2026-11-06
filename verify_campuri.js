// verify_campuri.js — câmpurile și butoanele din secțiunile deschise de pe „Acasă", sub stilul casei; și, din 06.11, casetele și
// listele derulante din TOATĂ aplicația web, într-un singur fel (Alin: „1 da, 2 da").
//
//   node verify_campuri.js
//
// De ce există: în Companii, Utilizatori, Dispozitive și Arhivate se adunaseră OPT înălțimi de
// control diferite (10px, 14px, 28, 29, 33, 34, 37, 39) și șapte rotunjiri — butoane de 10 pixeli
// lângă altele de 34, bife cenușii ale sistemului lângă câmpuri cu chenar verde. Arăta a greșeală,
// nu a alegere. Acum toate poartă aceeași clasă, `ra-camp`, cu o singură definiție în app.css.
//
// Ce prinde: o secțiune rămasă fără clasă, stilul casei rescris pe alături (exact așa dispăruse
// săgeata select-ului și locul lăsat lupei), scurtătura `background` care șterge săgeata, lanțul
// de `:not(...)` fără `:where(...)` care calcă regulile locale, și ora ultimei poziții care
// redevine „Invalid Date".
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
function regula(sursa, selector) {
  const i = sursa.indexOf(selector);
  if (i < 0) return null;
  const a = sursa.indexOf('{', i), b = sursa.indexOf('}', a);
  return (a < 0 || b < 0) ? null : sursa.slice(a + 1, b);
}

console.log('\n1. Secțiunile poartă clasa stilului de casă');
['companies', 'users', 'devices', 'archived', 'ofertare', 'accounts', 'inventar'].forEach(function (s) {
  const m = html.match(new RegExp('<div id="admin-tab-' + s + '"[^>]*>'));
  T('secțiunea „' + s + '" e sub `ra-camp`', !!m && /class="[^"]*\bra-camp\b/.test(m[0]), m && m[0]);
});

console.log('\n2. Stilul e definit o singură dată, și e complet');
const camp = regula(css, '.ra-camp .rax-field{');
const generic = regula(css, '.ra-camp input:where(');
const bifa = regula(css, '.ra-camp input[type=checkbox]{');
const buton = regula(css, '.ra-camp .rax-btn, .ra-camp .btn-sm');
T('câmpurile cu clasă au chipul casei', !!camp && /border-radius:10px/.test(camp) && /1\.5px solid var\(--border\)/.test(camp));
T('și cele fără clasă, la fel', !!generic && /border-radius:10px/.test(generic));
T('bifele sunt ale noastre, nu ale sistemului', !!bifa && /appearance:none/.test(bifa) && /var\(--accent\)/.test(regula(css, '.ra-camp input[type=checkbox]:checked{') || ''));
T('butoanele sunt o singură familie', !!buton && /min-height:34px/.test(buton) && /border-radius:10px/.test(buton));
T('butonul principal e verde, plin', /\.ra-camp \.rax-btn\.primary[^{]*\{[^}]*background:var\(--accent\)/.test(css));
T('cel periculos e roșu de la bun început', /\.ra-camp \.rax-btn\.danger[^{]*\{[^}]*var\(--red\)/.test(css));
T('câmpul în care scrii are marginea verde', /\.ra-camp input:where\(:not\(\[type=checkbox\]\)\):focus[\s\S]{0,200}border-color:var\(--accent\)/.test(css));

console.log('\n3. Capcanele care ne-au mușcat deja o dată');
T('fundalul se pune cu `background-color`, nu cu scurtătura care șterge săgeata',
  !!generic && /background-color:var\(--bg-panel\)/.test(generic) && !/[^-]background:var\(--bg-panel\)/.test(generic));
T('select-ul are săgeată desenată de noi',
  /\.ra-camp select\{[\s\S]{0,400}?background-image:linear-gradient/.test(css) && /\.ra-camp select\{[\s\S]{0,400}?appearance:none/.test(css));
T('regula generală folosește `:where(...)`, ca să nu calce regulile locale',
  /\.ra-camp input:where\(:not\(\[type=checkbox\]\)/.test(css));
T('formularul „Adaugă utilizator" nu-și mai ține un stil paralel',
  !/#users-modal \.add-user-form input/.test(html));
T('filtrul de companii din Utilizatori folosește clasa casei, nu stil scris de mână',
  /<select class="rax-field" onchange="_usersFilter/.test(html));

console.log('\n4. Ora ultimei poziții — nu mai scrie „Invalid Date"');
const bucata = (function () {
  const a = html.indexOf('// ── începe „Ora ultimei poziții"');
  const b = html.indexOf('// ── sfârșit „Ora ultimei poziții" ──', a);
  if (a < 0 || b < 0) throw new Error('nu găsesc funcția orei');
  return html.slice(a, b);
})();
const _raxDataOra = new Function(bucata + '\n; return _raxDataOra;')();
const acum = Date.UTC(2026, 8, 15, 8, 30, 0);
T('din epoch (număr) iese o dată', /2026/.test(_raxDataOra(acum)), _raxDataOra(acum));
T('din epoch scris ca text, la fel', _raxDataOra(String(acum)) === _raxDataOra(acum), _raxDataOra(String(acum)));
T('din text ISO iese tot o dată', /2026/.test(_raxDataOra('2026-09-15T08:30:00Z')), _raxDataOra('2026-09-15T08:30:00Z'));
T('din gol iese liniuță', _raxDataOra(null) === '—' && _raxDataOra('') === '—' && _raxDataOra(undefined) === '—');
T('din gunoi iese tot liniuță, nu „Invalid Date"', _raxDataOra('cine știe ce') === '—', _raxDataOra('cine știe ce'));
T('tabelul de dispozitive o folosește', /_raxDataOra\(d\.last_position_time\)/.test(html));

// ═══ Din 06.11: casetele și listele derulante, un singur fel în toată aplicația ═══════════════════════════════════════════
// Alin, cu trei poze (fișa șoferului, „Companie", „Tip combustibil"): „hai să le modernizăm, că sunt din anii 2000". Măsurat
// înainte: 56 de feluri de casete, lista albastră a sistemului, casetele gri ale sistemului pe tema închisă (Alerte, Mentenanță).
const JS = fs.readFileSync(P('public/js/campuri.js'), 'utf8');
const BLOC = (function () {
  const a = css.indexOf('/* ═══ Casetele și listele derulante: UN SINGUR FEL');
  return a < 0 ? '' : css.slice(a);
})();
const FARA_COM = BLOC.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n5. Forma comună (app.css, blocul „Casetele și listele derulante")');
T('blocul există, la capătul foii de stil (bate ce e scris înainte)', BLOC.length > 2000 && css.trim().endsWith(BLOC.trim()));
T('42 px în formulare, colțuri de 10 px', /--camp-h:\s*42px/.test(BLOC) && /--camp-r:\s*10px/.test(BLOC));
const PREF = ':is(#ra-campuri, html) :is(#ra-campuri, body)';
const regulileBlocului = FARA_COM.split('\n').filter((l) => /\{\s*$/.test(l) && !/^\s*(&|@|:root|body\.dark|\})/.test(l));
T('fiecare regulă de sus cântărește cât DOUĂ id-uri (bate `#admin-modal input`, `#alert-form input`… fără !important)',
  regulileBlocului.length >= 5 && regulileBlocului.every((l) => l.trim().startsWith(PREF)), regulileBlocului.filter((l) => !l.trim().startsWith(PREF)).join(' | '));
const exceptii = FARA_COM.match(/:where\(:not\(\.chat-caseta \*[^)]*\)\)/g) || [];
T('lista casetelor care își păstrează forma e ACEEAȘI în toate locurile (4)', exceptii.length === 4 && new Set(exceptii).size === 1, exceptii.length + ' locuri, ' + new Set(exceptii).size + ' variante');
['.chat-caseta *', '.msb-search *', '.vp-search *', '.mnt-search *', '.sim-oprire *', '.tr-grid *', '.flatpickr-calendar *', '.camp-liber'].forEach(function (x) {
  T('…printre ele: ' + x, (exceptii[0] || '').indexOf(x) >= 0);
});
T('caseta: fundalul panoului (cu background-color, nu cu scurtătura care ar șterge iconițele din casete), chenar 1,5 px, valoarea îngroșată',
  /background-color: var\(--bg-panel\); border: 1\.5px solid var\(--border-light\); border-radius: var\(--camp-r\);/.test(BLOC) && /font-weight: 600;/.test(BLOC) &&
  !/^\s*:is\(#ra-campuri, html\)[^{]*\{[^}]*\bbackground:/m.test(FARA_COM.split('@supports')[0]));
T('inelul verde când scrii', /&:focus \{ border-color: var\(--accent\); box-shadow: 0 0 0 4px color-mix\(in srgb, var\(--accent\) 22%, transparent\); \}/.test(BLOC));
T('stările „deschis" ale listei cu căutare și ale calendarului, cu aceeași greutate', /:is\(\.ss-wrap\.ss-open \.ss-input, \.rep-dt-input\.active\)/.test(BLOC));
T('caseta calendarului (flatpickr o face „doar citire") NU arată stinsă', /\[readonly\]:not\(\.flatpickr-input \+ input\):not\(\.rep-dt-input\)/.test(BLOC));
T('săgeata listei: a noastră, pe ambele teme, iar locul ei bate și o margine scrisă în linie',
  (BLOC.match(/--camp-sageata: url\(/g) || []).length === 2 && /stroke='%2364748b'/.test(BLOC) && /stroke='%238A93A3'/.test(BLOC) && /padding-right: 36px !important/.test(BLOC));
T('lista care se deschide: DOAR unde browserul o știe (@supports), cu „::picker(select)"',
  /@supports \(appearance: base-select\) \{[\s\S]*&, &::picker\(select\) \{ appearance: base-select; \}/.test(BLOC) && !/base-select/.test(FARA_COM.split('@supports (appearance: base-select)')[0]));
T('…bifa verde pe ce e ales, pe ambele teme (#166534 pe alb, #3FE07D pe negru)',
  /--camp-ales: #166534/.test(BLOC) && /--camp-ales: #3FE07D/.test(BLOC) && /& option:checked \{[^}]*color: var\(--camp-ales\)/.test(BLOC) && /& option::checkmark \{[^}]*var\(--camp-bifa\)/.test(BLOC));
T('…fără lista calendarului și fără listele cu mai multe rânduri', /select:not\(\[multiple\]\):not\(\[size\]\):not\(\.flatpickr-monthDropdown-months\)/.test(BLOC));
T('…butonul dinăuntru taie textul lung cu „…", iar măsura ține lățimea celei mai lungi opțiuni',
  /& > button\.camp-sel > selectedcontent \{[^}]*text-overflow: ellipsis/.test(BLOC) && /& > button\.camp-sel > \.camp-sel-m \{[^}]*visibility: hidden; height: 0/.test(BLOC));
T('…„mai puțină mișcare" oprește animațiile', (BLOC.match(/prefers-reduced-motion: reduce/g) || []).length >= 2);
T('în formulare: 42 px; caseta cu iconiță (lista cu căutare, calendarul) își păstrează locul iconiței',
  /height: var\(--camp-h\); min-height: var\(--camp-h\)/.test(BLOC) && /&:is\(input\):not\(\.ss-input\):not\(\.rep-dt-input\) \{ padding-left: 14px; padding-right: 14px; \}/.test(BLOC));
T('…formularele: fișa mașinii și a șoferului, Alerte / Mentenanță / Documente, Utilizatori, programări, Setări, „Anunță echipa"',
  /:is\(\.form-group, \.admin-add, \.add-user-form, \.doc-form, \.sch-form, \.pref-f, \.ce-win, #user-edit-modal, #apikeys-modal\)/.test(BLOC));

console.log('\n6. Butonul din listele derulante (js/campuri.js)');
const head = html.slice(0, html.indexOf('</head>'));
T('se încarcă în <head>, înaintea scripturilor paginii (prinde listele de la început)', /<script src="\/js\/campuri\.js"><\/script>/.test(head) && head.indexOf('/js/campuri.js') < html.indexOf('<script>'));
T('nu face nimic unde browserul n-are lista nouă', /CSS\.supports\('appearance', 'base-select'\)/.test(JS));
T('ține minte butonul pe listă și îl pune ÎNAPOI pe același (un <selectedcontent> nou rămâne gol în Chrome)', /s\._campSel/.test(JS) && /s\.replaceChild\(b, f\)/.test(JS) && /s\.insertBefore\(b, s\.firstChild\)/.test(JS));
T('aceleași liste ca foaia de stil (fără cele cu mai multe rânduri, fără lista calendarului, fără cea ascunsă a listei cu căutare)',
  /!s\.multiple && !\(s\.size > 1\) && !s\.classList\.contains\('ss-native'\) && !s\.classList\.contains\('flatpickr-monthDropdown-months'\)/.test(JS));
T('urmărește listele făcute mai târziu (MutationObserver), o listă o singură dată pe tură', /new MutationObserver/.test(JS) && /new Set\(\)/.test(JS));

console.log('\n7. Fără aspect scris de mână pe casete (stilul în linie bate orice foaie de stil)');
const inLinie = [];
const reIn = /<(input|textarea|select)\b([^>]*?)style="([^"]*)"/g; let mm;
while ((mm = reIn.exec(html))) {
  const tip = (mm[2].match(/type="([^"]+)"/) || [])[1] || '';
  if (/checkbox|radio|color|range|file|hidden/.test(tip)) continue;
  const id = (mm[2].match(/id="([^"]+)"/) || [])[1] || '';
  const decl = mm[3].split(';').map((d) => d.trim()).filter(Boolean);
  const rau = decl.filter((d) => /^(background|background-color|border|border-radius|font-family)\s*:/.test(d) || (/^color\s*:/.test(d) && id !== 'edit-imei-aparat'));
  if (rau.length) inLinie.push((id || mm[1]) + ': ' + rau.join(';'));
}
T('nicio casetă cu fundal / chenar / colțuri / culoare / font în linie', inLinie.length === 0, inLinie.slice(0, 4).join(' | '));
T('nici în stilurile făcute din variabile (senzorii de combustibil, filtrul paginilor)',
  /const _fsInput = 'padding:7px 10px;'/.test(html) && /var ss = 'padding-top:7px;padding-bottom:7px;font-size:13px;cursor:pointer;min-width:220px;'/.test(html));
const selPad = [];
const reSel = /<select\b([^>]*?)style="([^"]*)"/g;
while ((mm = reSel.exec(html))) if (/(^|;)\s*padding\s*:/.test(mm[2])) selPad.push(((mm[1].match(/id="([^"]+)"/) || [])[1] || '?') + ': ' + mm[2]);
T('pe liste, marginea scrisă în linie e doar sus / jos (cea din dreapta e a săgeții)', selPad.length === 0, selPad.slice(0, 3).join(' | '));
T('etichetele câmpurilor de la Alerte (viteza, axele) ca celelalte etichete ale formularului',
  !/<label style="font-size:11px;color:var\(--text-muted\);display:flex;flex-direction:column;gap:3px;"><span>\$\{f\.label\}<\/span>/.test(html) &&
  !/<label style="font-size:11px;color:var\(--text-muted\);display:flex;flex-direction:column;gap:3px;"><span>Limită axa/.test(html));

(async () => {
  console.log('\n8. În browser: forma, lista care se deschide, butonul dinăuntru (ambele teme)');
  let pw = null; try { pw = require('playwright'); } catch (e) {}
  let br = null; if (pw) { try { br = await pw.chromium.launch(); } catch (e) { br = null; } }
  if (!br) { console.log('  (fără Chromium: partea din browser se sare)'); return gata(); }
  const pg = await br.newPage({ viewport: { width: 900, height: 700 } });
  // Ca în pagină: app.css întâi, apoi o regulă veche scrisă pe id-ul ferestrei (cum sunt cele din index.html), apoi scriptul.
  await pg.setContent('<!doctype html><html><head><style>' + css + '</style><style>' +
    '#admin-modal input, #admin-modal select { background: var(--bg-dark); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; font-size: 13px; }' +
    '</style><script>' + JS + '</script></head><body><div id="admin-modal">' +
    '<div class="admin-add" style="display:grid;grid-template-columns:1fr 1fr;width:420px">' +
    '<label><span>Nume</span><input id="nume" type="text" value="Gherbali Robert"></label>' +
    '<label><span>Companie</span><select id="firma"><option value="">— alege —</option><option value="1">Compania mea</option><option value="2" selected>Construcții Vest Logistic Internațional SRL</option></select></label>' +
    '</div>' +
    '<p><select id="auto"><option>Scurt</option><option>O opțiune mult mai lungă</option></select> <span id="dupa">după</span></p>' +
    '<p><input id="cauta" type="search" placeholder="Caută" style="width:200px"></p>' +
    '<p><input type="hidden" class="flatpickr-input"><input id="zi" type="text" readonly value="06.11.2026"> <input id="link" type="text" readonly value="https://ratrack.ro/locatie/x"></p>' +
    '</div></body></html>');
  await pg.waitForTimeout(150); await pg.mouse.move(890, 690);
  const st = (id) => pg.evaluate((i) => { const e = document.getElementById(i), c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), rad: c.borderTopLeftRadius, bw: c.borderTopWidth, bc: c.borderTopColor, bg: c.backgroundColor, fw: c.fontWeight, ap: c.appearance }; }, id);
  const n = await st('nume'), f = await st('firma');
  // Chenarul: 1,5 px în foaia de stil; Chrome 141 îl desenează (și îl raportează) de 1 px — se verifică doar că nu e 0 și nici 2.
  T('în formular: 42 px, colțuri de 10 px, chenar subțire — chiar sub o regulă veche pe id-ul ferestrei', n.h === 42 && f.h === 42 && n.rad === '10px' && f.rad === '10px' && /^1(\.5)?px$/.test(n.bw), JSON.stringify([n, f]));
  T('fundalul panoului, nu cel gri de dinainte (tema deschisă: alb)', n.bg === 'rgb(255, 255, 255)' && f.bg === 'rgb(255, 255, 255)', n.bg);
  T('valoarea îngroșată', n.fw === '600' && f.fw === '600');
  const supporta = await pg.evaluate(() => CSS.supports('appearance', 'base-select'));
  if (!supporta) console.log('  (browserul n-are lista nouă: se verifică doar caseta)');
  else {
    T('lista e „base-select"', f.ap === 'base-select', f.ap);
    const b = await pg.evaluate(() => { const s = document.getElementById('firma'), b = s.firstElementChild, sc = b && b.querySelector('selectedcontent');
      return { tag: b && b.tagName, cls: b && b.className, txt: sc && sc.textContent, el: sc && getComputedStyle(sc).textOverflow, cut: sc && sc.scrollWidth > sc.clientWidth }; });
    T('lista are butonul nostru, cu textul ales', b.tag === 'BUTTON' && b.cls === 'camp-sel' && b.txt === 'Construcții Vest Logistic Internațional SRL', JSON.stringify(b));
    T('textul lung NU iese din chenar: se taie cu „…", lista rămâne de 42 px', b.cut === true && b.el === 'ellipsis' && f.h === 42, JSON.stringify(b));
    await pg.evaluate(() => { document.getElementById('firma').value = '1'; });
    T('valoarea pusă din cod se vede în listă', (await pg.evaluate(() => document.querySelector('#firma selectedcontent').textContent)) === 'Compania mea');
    await pg.evaluate(() => { document.getElementById('firma').innerHTML = '<option value="7">Unitip Test</option><option value="8" selected>Ford Trans SRL</option>'; });
    await pg.waitForTimeout(60);
    const dupa = await pg.evaluate(() => { const s = document.getElementById('firma'); return { primul: s.firstElementChild.tagName, txt: (s.querySelector('selectedcontent') || {}).textContent, n: s.querySelectorAll('button.camp-sel').length }; });
    T('opțiunile refăcute din cod (innerHTML): același buton, pus la loc, cu textul nou', dupa.primul === 'BUTTON' && dupa.n === 1 && dupa.txt === 'Ford Trans SRL', JSON.stringify(dupa));
    await pg.evaluate(() => { document.getElementById('firma').value = '7'; });
    T('…și urmează alegerile de după', (await pg.evaluate(() => document.querySelector('#firma selectedcontent').textContent)) === 'Unitip Test');
    const w1 = (await st('auto')).w; await pg.evaluate(() => { document.getElementById('auto').selectedIndex = 1; }); const w2 = (await st('auto')).w;
    T('o listă fără lățime scrisă are lățimea celei mai lungi opțiuni: nu sare bara când alegi altceva', w1 === w2 && w1 > 150, w1 + ' / ' + w2);
    await pg.click('#firma'); await pg.waitForTimeout(250);
    const pk = await pg.evaluate(() => { const s = document.getElementById('firma'); const c = getComputedStyle(s, '::picker(select)'); const o = s.querySelector('option:checked'); const co = getComputedStyle(o);
      return { deschis: s.matches(':open'), rad: c.borderTopLeftRadius, bg: c.backgroundColor, culoare: co.color, fw: co.fontWeight }; });
    T('lista se deschide desenată de aplicație: colțuri de 12 px, fundalul panoului', pk.deschis && pk.rad === '12px' && pk.bg === 'rgb(255, 255, 255)', JSON.stringify(pk));
    T('ce e ales: verde închis, îngroșat (tema deschisă)', pk.culoare === 'rgb(22, 101, 52)' && pk.fw === '700', JSON.stringify(pk));
    await pg.keyboard.press('Escape');
  }
  const zi = await st('zi'), link = await st('link');
  T('caseta calendarului („doar citire" pentru flatpickr) arată ca una obișnuită', zi.bg === 'rgb(255, 255, 255)', zi.bg);
  T('o casetă „doar citire" adevărată (linkul de copiat) e stinsă', link.bg === 'rgb(241, 245, 249)', link.bg);
  // Culorile trec la tema nouă în 0,15 s (tranziția casetei) — se măsoară după.
  await pg.evaluate(() => document.body.classList.add('dark')); await pg.waitForTimeout(400);
  const nd = await st('nume'), fd = await st('firma');
  T('tema închisă: fundalul panoului (#15181D), chenarul #313842 — nu casetele gri ale sistemului', nd.bg === 'rgb(21, 24, 29)' && fd.bg === 'rgb(21, 24, 29)' && nd.bc === 'rgb(49, 56, 66)', JSON.stringify([nd, fd]));
  if (supporta) {
    await pg.click('#firma'); await pg.waitForTimeout(250);
    const pd = await pg.evaluate(() => { const s = document.getElementById('firma'); const o = s.querySelector('option:checked'); return { bg: getComputedStyle(s, '::picker(select)').backgroundColor, culoare: getComputedStyle(o).color }; });
    T('tema închisă: lista deschisă pe fundalul panoului, ce e ales în verdele casei', pd.bg === 'rgb(21, 24, 29)' && pd.culoare === 'rgb(63, 224, 125)', JSON.stringify(pd));
    await pg.keyboard.press('Escape');
  }
  await br.close();
  gata();
})();

function gata() {
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
