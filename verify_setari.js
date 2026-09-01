// verify_setari.js — ecranul „Administrare → Setări", casa clientului.
//
//   node verify_setari.js
//
// Setările au devenit locul unde clientul își administrează firma. Două lucruri se pot strica tăcut,
// și amândouă sunt urâte:
//   • un capitol ajunge sub ochii cui nu are voie (sau, invers, dispecerul rămâne fără preferințele
//     lui) — de asta „cine ce vede" e o funcție pură, `setCapitole`, verificată aici pe roluri reale;
//   • ecranele „Utilizatori" și „Facturile mele" există O SINGURĂ dată în pagină. Setările le
//     ÎMPRUMUTĂ (mută nodul). Dacă panoul de administrare nu le cere înapoi, el deschide o filă
//     GOALĂ, fără nicio eroare în consolă. Proba de la punctul 3 apără exact asta.
//
// Codul nu se copiază aici: se decupează din public/index.html între reperele din fișier și se
// execută. Dacă cineva schimbă catalogul de capitole, proba vede schimbarea.

const fs = require('fs');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const html = fs.readFileSync('./public/index.html', 'utf8');

sect('1. Catalogul de capitole se poate citi din interfață');
const i = html.indexOf('    // ── începe catalogul de capitole');
const j = html.indexOf('    // ── sfârșit catalogul de capitole ──', i);
T('găsesc catalogul între repere', i > 0 && j > i, 'i=' + i + ' j=' + j);
if (i < 0 || j < i) { console.log('\n' + ok + ' verificări trecute, ' + (rele + 1) + ' picate'); process.exit(1); }

const M = new Function(html.slice(i, j) + '\n; return { SET_MENIU: SET_MENIU, setCapitole: setCapitole };')();
const nume = (p) => M.setCapitole(p).map(x => x.grup || x.et);
const chei = (p) => M.setCapitole(p).filter(x => x.k).map(x => x.k);

// Rolurile, exact ca în server.js (ROLE_PERMS).
const VIEWER = { manageUsers: false, manageFleet: false, isSuper: false };
const DISPECER = { manageUsers: false, manageFleet: false, isSuper: false };
const MANAGER = { manageUsers: false, manageFleet: true, isSuper: false };
const ADMIN_FIRMA = { manageUsers: true, manageFleet: true, isSuper: false };
const SUPER = { manageUsers: true, manageFleet: true, isSuper: true };

sect('2. Fiecare rol vede exact ce e al lui');
// Dispecerul e cazul care ne-a scos problema la iveală: până acum nu ajungea DELOC la Setări, deși
// fila „Preferințe" scrie negru pe alb „se aplică doar contului tău".
T('dispecerul ajunge la preferințele lui', chei(DISPECER).indexOf('prefs') >= 0, chei(DISPECER).join(', '));
T('și la NIMIC altceva', chei(DISPECER).length === 1, chei(DISPECER).join(', '));
T('viewer-ul la fel', chei(VIEWER).join(',') === 'prefs', chei(VIEWER).join(', '));

T('managerul (fără drept pe utilizatori) NU vede lista de utilizatori', chei(MANAGER).indexOf('utilizatori') < 0, chei(MANAGER).join(', '));
T('dar vede prețurile la combustibil', chei(MANAGER).indexOf('combustibil') >= 0, chei(MANAGER).join(', '));
T('și nu vede regulile firmei', chei(MANAGER).indexOf('reguli') < 0 && chei(MANAGER).indexOf('program') < 0, chei(MANAGER).join(', '));

const A = chei(ADMIN_FIRMA);
['prefs', 'utilizatori', 'reguli', 'program', 'combustibil', 'facturi', 'api'].forEach(k =>
  T('adminul firmei are „' + k + '"', A.indexOf(k) >= 0, A.join(', ')));
T('adminul firmei NU vede catalogul de coduri (e global, al platformei)', A.indexOf('iocatalog') < 0, A.join(', '));

const S = chei(SUPER);
T('noi vedem catalogul de coduri', S.indexOf('iocatalog') >= 0, S.join(', '));
// „Facturile mele" e factura pe care i-o emitem NOI clientului. La noi n-are ce căuta: avem Facturarea întreagă.
T('noi NU avem „Facturile mele"', S.indexOf('facturi') < 0, S.join(', '));

sect('3. Meniul nu are titluri goale');
[VIEWER, DISPECER, MANAGER, ADMIN_FIRMA, SUPER].forEach(function (p, k) {
  const lista = M.setCapitole(p);
  let gol = null;
  lista.forEach(function (x, idx) {
    if (!x.grup) return;
    const urm = lista[idx + 1];
    if (!urm || urm.grup) gol = x.grup;
  });
  T('rolul #' + (k + 1) + ' nu vede un titlu de grup fără nimic sub el', !gol, gol);
});
T('un rol fără drepturi vede un singur titlu', M.setCapitole(VIEWER).filter(x => x.grup).length === 1,
  M.setCapitole(VIEWER).filter(x => x.grup).map(x => x.grup).join(', '));

sect('4. Fiecare capitol are un panou, și fiecare panou un capitol');
const panouri = (html.match(/data-spanel="(\w+)"/g) || []).map(x => x.replace(/.*="|"/g, ''));
const capitole = M.SET_MENIU.filter(x => x.k).map(x => x.k);
const faraPanou = capitole.filter(k => panouri.indexOf(k) < 0);
const faraCapitol = panouri.filter(k => capitole.indexOf(k) < 0);
T('niciun capitol nu duce în gol', !faraPanou.length, faraPanou.join(', '));
T('niciun panou rătăcit, fără capitol', !faraCapitol.length, faraCapitol.join(', '));

sect('5. Ecranele împrumutate se dau înapoi');
// „Utilizatori" și „Facturile mele" trăiesc în panoul de administrare. Setările mută nodul la ele;
// dacă panoul nu-l cere înapoi, el arată o filă goală și nimeni nu vede nicio eroare.
const i2 = html.indexOf('    var _setImprumut = {};');
const j2 = html.indexOf("    var _setCap = 'prefs';", i2);
T('găsesc codul de împrumut', i2 > 0 && j2 > i2, 'i=' + i2 + ' j=' + j2);
if (i2 > 0 && j2 > i2) {
  // DOM de carton: doar cât îi trebuie codului real (getElementById, parentNode, appendChild, style).
  const nod = (id) => ({ id, parentNode: null, style: {}, appendChild(n) { n.parentNode = this; } });
  const panou = nod('admin-content'), gazda = nod('set-host-users'), lista = nod('admin-tab-users');
  panou.appendChild(lista);
  const doc = { getElementById: (id) => ({ 'admin-tab-users': lista, 'set-host-users': gazda, 'admin-content': panou }[id] || null) };
  const win = {};
  const F = new Function('document', 'window', html.slice(i2, j2) + '\n; return { ia: setImprumuta, da: window.setDaInapoi };')(doc, win);

  F.ia('admin-tab-users', 'set-host-users');
  T('Setările împrumută ecranul', lista.parentNode === gazda);
  T('și îl fac vizibil la ele', lista.style.display === 'block', lista.style.display);
  F.da();
  T('panoul îl primește înapoi', lista.parentNode === panou);
  T('ascuns, ca panoul să-l arate el când vrea', lista.style.display === 'none', lista.style.display);
  F.da();
  T('a doua cerere nu strică nimic', lista.parentNode === panou);
}
// Cârligul din panou: fără el, tot ce e mai sus e teorie.
T('panoul de administrare chiar cere ecranele înapoi',
  /raxAdminTab = function[\s\S]{0,400}?setDaInapoi\(\)/.test(html));

sect('6. Setările nu mai sunt ascunse rolurilor mici');
// Grupul „Administrare" era marcat fleet-only → un dispecer nu vedea nici măcar butonul.
const grupAdm = html.slice(html.indexOf('data-group="administrare"') - 60, html.indexOf('data-group="administrare"') + 40);
T('grupul „Administrare" nu mai e doar pentru cine administrează flota', !/fleet-only/.test(grupAdm), grupAdm.trim());
T('„Utilizatori" nu mai are a doua ușă în meniu', !/goSistem\('users'\)/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
