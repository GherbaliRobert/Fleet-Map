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

console.log('\n5. Pagina se numește ca rândul din meniu — nu altfel');
// Bug găsit de Alin (17.09): apăsai „Companii" și ajungeai într-o pagină numită „Companii &
// Dispozitive" (nume rămas de pe vremea când secțiunea le ținea pe amândouă); „Dispozitive" se
// numea „Dispozitive (super-admin)" — jargon de-al nostru pe ecran; iar „Inventar dispozitive"
// lipsea din listă, deci pagina lui se numea „Administrare". Trei nume scrise separat de meniu.
T('numele secțiunilor stau într-o singură listă', /const _RAX_NUME = \{/.test(html));
T('și titlul paginii se ia de acolo',
  /textContent = _RAX_NUME\[name\] \|\| 'Administrare'/.test(html));
T('nu mai există o listă de titluri scrisă separat', !/var titles = \{/.test(html));

// citim lista din sursă și o comparăm cu rândurile din meniul din stânga
const dinLista = (nume) => {
  const b = (html.match(new RegExp('const ' + nume + ' = \\{([\\s\\S]*?)\\n    \\};')) || [])[1] || '';
  const o = {};
  b.replace(/([a-z]+)\s*:\s*'([^']*)'/g, (_, k, v) => { o[k] = v; return ''; });
  return o;
};
const TABURI = dinLista('_RAX_TABURI'), NUME = dinLista('_RAX_NUME');
T('lista de nume e citibilă', Object.keys(NUME).length > 10, String(Object.keys(NUME).length));
T('fiecare secțiune are un nume', Object.keys(TABURI).every(k => !!NUME[k]),
  Object.keys(TABURI).filter(k => !NUME[k]).join(', ') || '—');
T('și niciun nume în plus, fără secțiune', Object.keys(NUME).every(k => !!TABURI[k]),
  Object.keys(NUME).filter(k => !TABURI[k]).join(', ') || '—');
T('niciun nume nu poartă jargon de-al nostru pe ecran',
  Object.values(NUME).every(v => !/super[- ]?admin|tab|admin-tab/i.test(v)),
  Object.entries(NUME).filter(([, v]) => /super[- ]?admin|tab/i.test(v)).map(([k]) => k).join(', ') || '—');

// rândurile din meniul din stânga: `goSistem('x')` + eticheta scrisă pe ele
const MENIU = {};
(html.match(/<button class="nav-item nav-sub[\s\S]{0,220}?<\/button>/g) || []).forEach(b => {
  const k = (b.match(/goSistem\('([a-z]+)'\)/) || [])[1];
  const et = (b.match(/<span>([^<]+)<\/span>/) || [])[1];
  if (k && et) MENIU[k] = et.replace(/&amp;/g, '&').trim();
});
T('rândurile din meniu se pot citi', Object.keys(MENIU).length >= 12, Object.keys(MENIU).join(', '));
const nepotrivite = Object.keys(MENIU).filter(k => TABURI[k] && NUME[k] !== MENIU[k])
  .map(k => k + ': meniu „' + MENIU[k] + '" vs. pagină „' + NUME[k] + '"');
T('pagina poartă exact numele rândului din meniu', nepotrivite.length === 0, nepotrivite.join(' | '));

console.log('\n6. Cartonașul spune UNDE te duce');
T('eticheta de pe cartonaș se ia din aceeași listă',
  /function _raxDashEtichete\(\)[\s\S]{0,420}_RAX_NUME\[b\.getAttribute\('data-card'\)\]/.test(html));
T('și scrie „Vezi detalii în <secțiune>"', /'Vezi detalii în ' \+ nume/.test(html));
T('se pune de fiecare dată când intri pe „Acasă"',
  /window\.raxAdminHome = function \(\) \{[\s\S]{0,320}_raxDashEtichete\(\)/.test(html));
T('și fiecare cartonaș arată spre o secțiune care are nume',
  perechi.every(p => !!NUME[p.card]), perechi.map(p => p.card + '→' + (NUME[p.card] || '?')).join(', '));

console.log('\n7. Cele patru cartonașe arată la fel');
// Erau aliniate la stânga, iar iconița din etichetă împingea textul cu câțiva pixeli — marginea
// din stânga ieșea zimțată. Mai rău: cartonașele FĂRĂ rândul de stare (Dispozitive active,
// Arhivate) aveau „Vezi detalii" cu 19px mai sus decât celelalte două — măsurat în browser
// (233 vs. 214). Alin: „aliniază textele din carduri să fie la fel pe toate, centrare."
const cardRegula = regula(html, '.adash-card {');
T('conținutul cartonașului e centrat', /align-items: center/.test(cardRegula || ''), cardRegula);
T('și textul la fel', /text-align: center/.test(cardRegula || ''));
T('„Vezi detalii" e împins la fundul cartonașului', /#admin-dash \.adash-go\{[^}]*margin-top:auto/.test(css));
T('deci stă pe aceeași linie oricâte rânduri are deasupra',
  !/#admin-dash \.adash-go\{[^}]*margin-top:\s*\d/.test(css));
T('rândul de stare dispare când e gol (altfel ar împinge degeaba)', /\.adash-sub:empty \{ display: none/.test(html));

console.log('\n8. Verdele din meniu stă pe pagina deschisă');
// Bug găsit de Alin (17.09): apăsai „Vezi detalii în Companii", ajungeai în Companii — și în meniu
// rămânea aprins „Acasă". Erau două meniuri în cod: cel vechi, dinăuntrul panoului (`#admin-side`,
// ascuns azi), și cel adevărat, din bara din stânga. Cartonașul îl aprindea doar pe primul.
// Pe deasupra, în verticala CLIENTULUI verdele nu se muta NICIODATĂ: șase rânduri chemau direct
// `showView(...)`, fără să treacă prin `navGo`, deci rămânea pe „Localizare" orice ai fi deschis.
T('există un singur loc care mută verdele', /window\._navAprinde = function \(el\) \{/.test(html));
T('și toate căile trec prin el',
  /function navGo\(btn, fn\) \{[\s\S]{0,140}window\._navAprinde\(btn\)/.test(html) &&
  /function _raxSideActive\(name\)[\s\S]{0,700}window\._navAprinde\(tinta\)/.test(html) &&
  /window\._navAprinde\(document\.querySelector\('#navrail \.nav-item\[data-view="' \+ name \+ '"\]'\)\)/.test(html));
T('nimeni nu mai umblă la „active" pe lângă el',
  (html.match(/#navrail \.nav-item'\)\.forEach\(function \(n\) \{ n\.classList\.remove\('active'\)/g) || []).length === 1);
T('un rând ascuns nu se aprinde, și atunci nu se stinge nimic',
  /_navAprinde = function \(el\) \{\s*\n\s*if \(!el \|\| el\.style\.display === 'none' \|\| el\.closest\('\.vert-ascuns'\)\) return false;/.test(html));
T('secțiunile de administrare se recunosc după ce cheamă rândul',
  /var cheama = \(name === 'dash'\) \? "showView\('administrare'\)" : "goSistem\('" \+ name \+ "'\)";/.test(html));

// fiecare rând din verticala clientului trebuie să fie recognoscibil: ori prin `navGo`, ori prin `data-view`
const rail = html.slice(html.indexOf('<nav id="navrail"'), html.indexOf('</nav>', html.indexOf('<nav id="navrail"')));
const randuri = (rail.match(/<button[^>]*class="[^"]*nav-item[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [])
  .filter(b => !/nav-group-head/.test(b));
const orfane = randuri.filter(b => !/navGo\(this/.test(b) && !/data-view="/.test(b))
  .map(b => (b.match(/<span>([^<]*)<\/span>/) || [])[1] || '?');
T('niciun rând din meniu nu rămâne pe dinafară', orfane.length === 0, orfane.join(', '));
T('„Setări" e și el recunoscut (nu trecea prin navGo)', /id="nav-setari"[^>]*data-view="settings"/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
