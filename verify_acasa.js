// verify_acasa.js — cartonașele de pe „Acasă" (Administrare): sumar care duce în pagină.
//
//   node verify_acasa.js
//
// Cum e gândit ecranul (decizia lui Alin, 17.09): cartonașele sunt **sumar**, nu loc de lucru. Cifra
// și starea stau pe cartonaș, iar „Vezi detalii" te duce în pagina secțiunii — aceeași pagină la care
// ajungi și din meniul din stânga. Așa o secțiune se deschide într-un SINGUR fel.
//
// Înainte exista și a doua cale: secțiunea se deschidea chiar sub cartonașe. Motivul era că altfel
// „cifrele dispăreau" — dar între timp fiecare pagină și-a căpătat propriul sumar (pastile cu numere,
// venitul lunar, contorul de conturi), deci motivul a dispărut. Iar a doua cale costa: aplicația
// trebuia să țină minte în care din ele e deschisă o secțiune, și de acolo a venit bug-ul cu
// „Dispozitive" rămas agățat sub cartonașe după ce apăsai „Acasă".
//
// Ce prinde proba asta:
//   • perna de sus/dreapta scoasă (cartonașul se ridică sub mouse, iar zona taie ce iese din ea);
//   • un cartonaș rămas fără „Vezi detalii", sau care duce în altă secțiune decât a lui;
//   • reîntoarcerea mecanismului de „deschide sub cartonașe";
//   • listele de secțiuni scrise de mână — cele trei care au dus la bug.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');
const html = fs.readFileSync(P('public/index.html'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// blocul unei reguli CSS, după selector (prima potrivire)
function regula(sursa, selector) {
  const i = sursa.indexOf(selector);
  if (i < 0) return null;
  const a = sursa.indexOf('{', i), b = sursa.indexOf('}', a);
  if (a < 0 || b < 0) return null;
  return sursa.slice(a + 1, b);
}
const px = (bloc, prop) => {
  if (!bloc) return null;
  const m = bloc.match(new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*(-?[\\d.]+)px'));
  return m ? parseFloat(m[1]) : null;
};

console.log('\n1. Perna care ține cartonașele întregi');
// Zona de administrare TAIE tot ce iese din ea (are derulare proprie), iar rândul de cartonașe
// începe chiar pe muchia ei. Cartonașul se ridică sub mouse → fără pernă, marginea lui de sus era
// retezată și cardul arăta rupt.
const hover = regula(html, '.adash-card:hover');
const ridicare = (() => { const m = (hover || '').match(/translateY\(\s*(-?[\d.]+)px/); return m ? Math.abs(parseFloat(m[1])) : null; })();
const zona = regula(css, '#admin-content{');
const pernaSus = px(zona, 'padding-top');
const pernaDreapta = px(zona, 'padding-right');
T('cartonașul se ridică sub mouse (așa a fost gândit)', ridicare !== null && ridicare > 0, String(ridicare));
T('zona de administrare are pernă sus', pernaSus !== null && pernaSus > 0, String(pernaSus));
T('zona de administrare are pernă în dreapta', pernaDreapta !== null && pernaDreapta > 0, String(pernaDreapta));
T('perna de sus acoperă ridicarea', pernaSus !== null && ridicare !== null && pernaSus >= ridicare,
  'pernă ' + pernaSus + ' vs. ridicare ' + ridicare);

console.log('\n2. Cartonașul e SUMAR și spune unde duce');
const carduri = html.match(/<button class="adash-card[^>]*>[\s\S]*?<\/button>/g) || [];
T('sunt cele patru cartonașe', carduri.length === 4, String(carduri.length));
T('fiecare are cifra lui', carduri.every(c => /class="adash-num"/.test(c)));
T('și fiecare spune „Vezi detalii"', carduri.every(c => /adash-go">Vezi detalii/.test(c)),
  carduri.filter(c => !/adash-go/.test(c)).length + ' fără');
T('semnul „duce undeva" e o săgeată, nu un cuvânt inventat', carduri.every(c => /fa-arrow-right/.test(c)));
T('stilul lui există', /#admin-dash \.adash-go\{/.test(css));
const perechi = carduri.map(b => ({
  card: (b.match(/data-card="([^"]+)"/) || [])[1],
  clic: (b.match(/raxDashCard\('([^']+)'/) || [])[1]
}));
T('fiecare are un nume de secțiune', perechi.every(p => !!p.card), JSON.stringify(perechi));
T('și duce fix în secțiunea lui', perechi.every(p => p.card === p.clic), JSON.stringify(perechi));
T('secțiunile chemate există în pagină', perechi.every(p => html.indexOf('id="admin-tab-' + p.card + '"') > 0), JSON.stringify(perechi.map(p => p.card)));
T('cartonașul întreg rămâne apăsabil, nu doar rândul de jos', carduri.every(c => /onclick="raxDashCard\(/.test(c)));

console.log('\n3. O secțiune se deschide într-un SINGUR fel');
// Cartonașul cheamă exact ce cheamă și meniul din stânga: `raxAdminTab(nume)`. Nicio a doua cale.
T('cartonașul cheamă aceeași funcție ca meniul',
  /window\.raxDashCard = function \(name\) \{[\s\S]{0,200}raxAdminTab\(name\);/.test(html));
T('deschiderea unei secțiuni ascunde cartonașele (nu le lasă deasupra)',
  /var dash = document\.getElementById\('admin-dash'\); if \(dash\) dash\.style\.display = 'none';/.test(html));
T('nu mai există „deschide sub cartonașe"', !/subCarduri/.test(html));
T('nici bara cu numele secțiunii de sub ele', !/adash-bara/.test(html) && !/adash-bara/.test(css));
T('nici cutia care continua chenarul', !/adash-continua/.test(html) && !/adash-continua/.test(css));
T('și nici marcajul de „cartonaș deschis"', !/adash-card\.deschis/.test(css));
T('textul de sub cartonașe spune ce fac ele', /Cifrele de mai sus sunt un sumar/.test(html));

console.log('\n4. O SINGURĂ listă de secțiuni — nu trei scrise de mână');
// Bug găsit de Alin (17.09): intrai în „Dispozitive" din meniu, apăsai „Acasă" — și tabelul rămânea
// deschis sub cartonașe. Cauza: TREI liste de id-uri de secțiuni, scrise separat în `raxAdminTab`,
// `raxDashCard` și `raxAdminHome`; a treia rămăsese fără `devices` și `inventar`.
T('există o singură listă, cu numele ei', /const _RAX_TABURI = \{/.test(html));
T('și conține ȘI dispozitivele, ȘI inventarul',
  /_RAX_TABURI = \{[\s\S]{0,700}devices: 'admin-tab-devices'/.test(html) &&
  /_RAX_TABURI = \{[\s\S]{0,700}inventar: 'admin-tab-inventar'/.test(html));
T('ascunderea secțiunilor se face într-un singur loc', /function _raxAscundeTaburile\(deschisId\)/.test(html));
T('și ambele căi o folosesc', (html.match(/_raxAscundeTaburile\(/g) || []).length >= 3,
  String((html.match(/_raxAscundeTaburile\(/g) || []).length));
T('nu mai există nicio listă scrisă de mână de id-uri „admin-tab-…"',
  !/\['admin-tab-[a-z]+',\s*'admin-tab-/.test(html));
T('„Acasă" închide orice secțiune rămasă deschisă',
  /window\.raxAdminHome = function \(\) \{[\s\S]{0,260}_raxAscundeTaburile\(null\)/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
