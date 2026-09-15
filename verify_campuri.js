// verify_campuri.js — câmpurile și butoanele din secțiunile deschise de pe „Acasă", sub stilul casei.
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
T('tabelul de dispozitive o folosește', /var lp = _raxDataOra\(d\.last_position_time\)/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
