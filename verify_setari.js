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

sect('7. Comutatorul de privire („vezi ca un admin de firmă") — SCHELĂ, SE SCOATE LA LANSARE');
// ⚠ TEMPORAR (03.09.2026): secțiunea asta se șterge odată cu comutatorul din index.html.
// Vezi JURNAL-MODIFICARI.md → „A. Blocante".
// Noi testăm aplicația din două poziții și ne încurcăm între ele. Comutatorul schimbă DOAR ce se
// afișează. Cele două lucruri care nu au voie să se strice niciodată:
//   • privirea împrumutată să nu DEA drepturi cuiva care nu le are (ar fi o gaură, nu o unealtă);
//   • privirea să nu ajungă la server — acolo se cere mereu dreptul REAL.
const k1 = html.indexOf('    // ── începe „Comutatorul de privire"');
const k2 = html.indexOf('    var _setImprumut = {};', k1);
T('găsesc comutatorul între repere', k1 > 0 && k2 > k1, 'k1=' + k1 + ' k2=' + k2);
if (k1 > 0 && k2 > k1) {
  // DOM de carton + un „browser" cu memorie, cât să meargă codul real.
  const noduri = { 'set-nav': { innerHTML: '' }, 'set-banda': { innerHTML: '' } };
  const doc = { getElementById: (id) => noduri[id] || null };
  const memorie = (start) => { let v = start; return { getItem: () => v, setItem: (_, x) => { v = x; } }; };
  const facWin = (v) => ({ localStorage: memorie(v), currentUser: null });

  const prelude = 'var _setCap = "prefs"; var _ultimulTab = null; function usTab(n){ _ultimulTab = n; }\n';
  const cerere = '\n; return { privireCa: setPrivireCa, ochi: setOchiCitit, comutator: setComutatorHtml,' +
    ' banda: setBandaHtml, nav: setRenderNav, privire: window.setPrivire, permCurent: setPermCurent,' +
    ' firme: setFirmeDin, deJucat: setFirmaDeJucat, picker: setFirmaPickerHtml,' +
    ' tab: function(){ return _ultimulTab; } };';
  const fac = (win) => new Function('document', 'window', '_usEsc',
    html.slice(i, j) + prelude + html.slice(k1, k2) + cerere)(doc, win, (s) => String(s == null ? '' : s));

  let W = facWin(null);
  let C = fac(W);

  // a) Privirea nu inventează drepturi.
  T('privirea de firmă scoate steagul de fondator', C.privireCa(SUPER, 'firma').isSuper === false);
  T('pe fondator, „fondator" lasă drepturile exact cum erau', C.privireCa(SUPER, 'fondator') === SUPER);
  T('unui admin de firmă nu i se schimbă nimic, oricare ar fi privirea',
    C.privireCa(ADMIN_FIRMA, 'firma') === ADMIN_FIRMA && C.privireCa(ADMIN_FIRMA, 'fondator') === ADMIN_FIRMA);
  T('unui dispecer nu i se dă nimic pe furiș', C.privireCa(DISPECER, 'firma') === DISPECER);
  T('și nici măcar un obiect gol nu devine ceva', C.privireCa(null, 'firma') === null);

  // b) Ce vede fondatorul cu privirea împrumutată e EXACT ce vede un admin de firmă.
  const imprumutat = chei(C.privireCa(SUPER, 'firma'));
  T('privirea împrumutată dă fix meniul unui admin de firmă',
    imprumutat.join(',') === chei(ADMIN_FIRMA).join(','), imprumutat.join(', '));
  T('deci capitolul nostru dispare din el', imprumutat.indexOf('iocatalog') < 0, imprumutat.join(', '));
  T('și apar „Facturile mele", pe care clientul le are', imprumutat.indexOf('facturi') >= 0, imprumutat.join(', '));

  // c) Memoria browserului: orice altceva decât „firma" înseamnă fondator.
  T('memorie goală → fondator', C.ochi(memorie(null)) === 'fondator');
  T('memorie cu „firma" → firma', C.ochi(memorie('firma')) === 'firma');
  T('memorie cu gunoi → fondator', C.ochi(memorie('ceva')) === 'fondator');
  T('browser care refuză memoria (mod privat) → fondator',
    C.ochi({ getItem: () => { throw new Error('blocat'); } }) === 'fondator');

  // d) Comutatorul și banda se văd DOAR la noi, și doar când e cazul.
  W.currentUser = { isSuper: true, permissions: { manageUsers: true, manageFleet: true } };
  C.nav(C.permCurent());
  T('fondatorul vede comutatorul', /set-ochi/.test(noduri['set-nav'].innerHTML));
  T('fără bandă cât timp e în privirea lui', noduri['set-banda'].innerHTML === '', noduri['set-banda'].innerHTML);
  T('și își vede capitolul de platformă', /data-scap="iocatalog"/.test(noduri['set-nav'].innerHTML));

  W.currentUser = { isSuper: false, permissions: { manageUsers: true, manageFleet: true } };
  C.nav(C.permCurent());
  T('adminul firmei NU vede comutatorul', !/set-ochi/.test(noduri['set-nav'].innerHTML));
  T('și nici banda', noduri['set-banda'].innerHTML === '', noduri['set-banda'].innerHTML);

  // Chiar dacă cineva i-ar pune „firma" în memoria browserului, un client nu capătă comutator.
  W = facWin('firma'); C = fac(W);
  W.currentUser = { isSuper: false, permissions: { manageUsers: true, manageFleet: true } };
  C.nav(C.permCurent());
  T('memoria pusă de mână nu-i dă clientului comutator', !/set-ochi/.test(noduri['set-nav'].innerHTML));
  T('și nici bandă', noduri['set-banda'].innerHTML === '', noduri['set-banda'].innerHTML);

  // e) Fondatorul cu privirea pornită: meniul se schimbă, banda apare, capitolul nostru dispare.
  W.currentUser = { isSuper: true, permissions: { manageUsers: true, manageFleet: true } };
  C.nav(C.permCurent());
  T('privirea ținută minte se aplică la redeschidere', /set-banda-x/.test(noduri['set-banda'].innerHTML));
  T('banda spune limpede că drepturile nu se ating', /drepturile tale rămân întregi/i.test(noduri['set-banda'].innerHTML),
    noduri['set-banda'].innerHTML);
  T('capitolul de platformă e ascuns', !/data-scap="iocatalog"/.test(noduri['set-nav'].innerHTML));
  T('butonul „Admin de firmă" e cel aprins', /set-ochi-b on"[^>]*>Admin de firmă/.test(noduri['set-nav'].innerHTML),
    noduri['set-nav'].innerHTML.slice(0, 300));

  // f) Apăsatul pe comutator: ține minte, redesenează și rămâne pe capitolul deschis.
  C.privire('fondator');
  T('întoarcerea se ține minte', W.localStorage.getItem() === 'fondator');
  T('meniul se redesenează pe loc', /data-scap="iocatalog"/.test(noduri['set-nav'].innerHTML));
  T('banda dispare', noduri['set-banda'].innerHTML === '', noduri['set-banda'].innerHTML);
  T('rămâne pe capitolul deschis', C.tab() === 'prefs', C.tab());
  C.privire('firma');
  T('și înapoi', W.localStorage.getItem() === 'firma' && !/iocatalog/.test(noduri['set-nav'].innerHTML));

  // g) Firma în care „stă" fondatorul cât e în privirea clientului (ecranul Utilizatori).
  const USERI = [
    { id: 1, username: 'noi@ratrack.ro', company_id: null },                                  // cont de platformă
    { id: 2, username: 'a@x.ro', company_id: 7, company_name: 'Transport Zebra' },
    { id: 3, username: 'b@x.ro', company_id: 7, company_name: 'Transport Zebra' },
    { id: 4, username: 'c@y.ro', company_id: 3, company_name: 'Firma de probă' },
  ];
  const firme = C.firme(USERI);
  T('conturile de platformă nu sunt ale niciunei firme', firme.length === 2, JSON.stringify(firme));
  T('firmele ies în ordine alfabetică', firme.map(f => f.nume).join(' | ') === 'Firma de probă | Transport Zebra',
    firme.map(f => f.nume).join(' | '));
  T('se numără oamenii fiecăreia', firme.map(f => f.n).join(',') === '1,2', firme.map(f => f.n).join(','));
  T('fără nimic ținut minte, se ia prima', C.deJucat(firme, null) === '3', C.deJucat(firme, null));
  T('cea ținută minte are întâietate', C.deJucat(firme, '7') === '7', C.deJucat(firme, '7'));
  T('o firmă ștearsă între timp nu blochează ecranul', C.deJucat(firme, '999') === '3', C.deJucat(firme, '999'));
  T('fără nicio firmă, nu inventăm una', C.deJucat([], '7') === null && C.deJucat(null, null) === null);
  const picker = C.picker(firme, '7');
  T('firma în care stai e cea aleasă în listă', /value="7" selected/.test(picker), picker);
  T('și se văd câți oameni are fiecare', /Transport Zebra · 2 oameni/.test(picker) && /Firma de probă · 1 om/.test(picker), picker);
}

// h) Cârligele din ecranul Utilizatori: fără ele, tot ce e mai sus rămâne teorie.
T('ecranul Utilizatori chiar se strânge la firma privită',
  /setPrivescCaFirma\(\)[\s\S]{0,500}?users = users\.filter\(/.test(html));
T('și se desenează ca pentru un admin de firmă, nu ca pentru noi',
  /setPrivescCaFirma\(\)[\s\S]{0,600}?isSuper = false;/.test(html));
T('formularul de cont nou nu mai oferă rolul de platformă în privirea clientului',
  /var _priv = sup && setPrivescCaFirma\(\);\s*\n\s*if \(_priv\) sup = false;/.test(html));

// g) Drepturile cu care se ÎNCARCĂ ecranul rămân cele reale — privirea e doar la desenat.
T('Setările se încarcă pe drepturile reale, nu pe cele împrumutate',
  /var perm = setPermCurent\(\);/.test(html) && !/setPrivireCa\(perm/.test(html.slice(html.indexOf('async function loadSettingsTab'))));
// Cea mai importantă: privirea nu pleacă NICIODATĂ la server.
T('serverul nu știe și nu poate ști de comutator',
  !/ra_set_ochi|setPrivireCa/.test(fs.readFileSync('./server.js', 'utf8')));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
