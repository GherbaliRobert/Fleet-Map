// verify_mobile_tacho.js — telefonul citește ACELEAȘI reguli ca web-ul, nu o copie a lor.
//
//   node verify_mobile_tacho.js
//
// Nu are nevoie de server: verifică sursele. Riscul pe care îl apără e cel scris în CLAUDE.md — o listă
// paralelă de reguli care începe să se contrazică cu originalul în prima săptămână. Aici e concret:
// dacă ecranul de Tahograf din APK și-ar filtra singur șoferii sau vehiculele, telefonul ar arăta altă
// flotă decât web-ul, iar cineva ar descărca după lista greșită. Filtrarea se face O SINGURĂ DATĂ, în
// `/api/tacho/scadentar`; telefonul doar desenează ce primește.

const fs = require('fs');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const R = (p) => fs.readFileSync(p, 'utf8');

const SRV = R('./server.js');
const MOB = R('./mobile/src/screens/Tahograf.tsx');
const DRV = R('./mobile/src/screens/AdminDrivers.tsx');
const WEB = R('./public/index.html');
const licCats = require('./license_cats.js');
const tacho = require('./tacho.js');

// ─── contractul „excluse": aceleași chei în server, web și telefon ───
sect('1. Cheile trimise de server sunt citite de amândouă interfețele');
const blocExcluse = (() => {
  const i = SRV.indexOf('excluse: {');
  if (i < 0) return null;
  return SRV.slice(i, SRV.indexOf('},', i));
})();
T('găsesc blocul `excluse` în server.js', !!blocExcluse);
const chei = blocExcluse ? (blocExcluse.match(/^\s*(\w+):/gm) || []).map(s => s.trim().replace(':', '')).filter(k => k !== 'excluse') : [];
T('serverul trimite cele trei motive de excludere', chei.length === 3, chei.join(', '));
for (const k of chei) {
  T('web-ul citește `' + k + '`', WEB.indexOf(k) >= 0);
  T('telefonul citește `' + k + '`', MOB.indexOf(k) >= 0);
}

// ─── telefonul NU rejudecă cine intră în listă ───
sect('2. Telefonul nu are o a doua regulă de filtrare');
T('cere scadențarul de la server', /Api\.tachoScadentar\(\)/.test(MOB));
// Un `.filter` pe categorii sau pe tipul vehiculului ar însemna exact regula duplicată de care ne ferim.
T('nu filtrează după categoriile de pe permis', !/license_categories/.test(MOB), 'apare license_categories');
T('nu filtrează după categoria vehiculului', !/vehicle_type/.test(MOB), 'apare vehicle_type');
T('nu-și scoate singur flota demo (o face serverul)', !/DEMO/.test(MOB), 'apare DEMO');
// codurile de categorie apar în telefon DOAR în textul explicativ al golului, nu într-o condiție
const coduriInCod = (MOB.match(/['"](C1E|C1|CE|D1E|D1|DE)['"]/g) || []);
T('nu ține o listă proprie de coduri de categorie', coduriInCod.length === 0, coduriInCod.join(', '));

sect('3. Fișa șoferului ia categoriile de la server, nu din cod');
T('cere catalogul de categorii', /Api\.licenseCats\(\)/.test(DRV));
T('bifele se construiesc din catalog, nu dintr-o listă scrisă de mână', /lic\.categories\.map/.test(DRV));
T('„profesionist" vine din catalog', /lic\.pro/.test(DRV) || /new Set\(lic\.pro/.test(DRV));
T('„card de tahograf" vine din catalog', /lic\.tacho/.test(DRV));
const coduriInFisa = (DRV.match(/['"](AM|A1|A2|B1|BE|C1E|C1|CE|D1E|D1|DE|Tb|Tv)['"]/g) || []);
T('fișa nu conține o listă paralelă de coduri', coduriInFisa.length === 0, coduriInFisa.join(', '));

sect('4. Ruta pentru telefon și cea pentru web servesc același catalog');
T('există ruta JSON pentru telefon', /app\.get\('\/api\/license-cats'/.test(SRV));
const jsonLit = SRV.slice(SRV.indexOf('const _LICENSE_JSON ='), SRV.indexOf('\n', SRV.indexOf('const _LICENSE_JSON =')));
const jsLit = SRV.slice(SRV.indexOf('const _LICENSE_JS ='), SRV.indexOf('}) + \';\'', SRV.indexOf('const _LICENSE_JS =')));
for (const camp of ['categories', 'groups', 'pro', 'tacho']) {
  T('ambele trimit `' + camp + '`', jsonLit.indexOf(camp) >= 0 && jsLit.indexOf(camp) >= 0);
}

// ─── regulile în sine, ca să nu se strice pe tăcute ───
sect('5. Regulile pe care se sprijină tot ecranul');
T('categoriile cu tahograf sunt exact cele de marfă și persoane',
  licCats.TACHO.join(',') === 'C1,C1E,C,CE,D1,D1E,D,DE', licCats.TACHO.join(','));
T('troleibuzul și tramvaiul rămân profesioniste, fără tahograf',
  licCats.PRO.indexOf('Tb') >= 0 && licCats.TACHO.indexOf('Tb') < 0 && licCats.TACHO.indexOf('Tv') < 0);
T('un permis doar de autoturism nu aduce card de tahograf', !licCats.needsTacho('B,BE'));
T('tractorul agricol NU are tahograf, autotractorul are',
  !tacho.vehiculAreTahograf('Tractor') && tacho.vehiculAreTahograf('Autotractor'));

sect('6. Golul își spune motivul pe amândouă ecranele');
for (const [nume, sursa] of [['web', WEB], ['telefon', MOB]]) {
  T(nume + ': golul de la șoferi trimite la categoriile de pe permis',
    /Niciun șofer profesionist/.test(sursa) && /C, C1, CE, D, D1, DE/.test(sursa));
  T(nume + ': golul de la vehicule numește categoriile cu tahograf',
    /Camion, TIR, Autotractor, Autobuz, Autocar/.test(sursa));
  T(nume + ': lista goală nu pretinde că totul e la zi',
    /Nimic de descărcat/.test(sursa));
  // Fraza asta a fost dictată de Alin, cuvânt cu cuvânt. Dacă unul dintre ecrane o rescrie, aceeași
  // flotă ar fi descrisă în două feluri în aceeași aplicație.
  T(nume + ': cei excluși se rezumă cu aceeași frază ca pe celălalt ecran',
    /Acum aveți: /.test(sursa) && /, nimic de descărcat\./.test(sursa));
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
