// verify_ecrane.js — Aplicația pe toate mărimile de ecran (26.10, Alin: „aplicația trebuie să fie ok pe toate tipurile de ecrane").
// Măsurat atunci în browser (Chromium), 42 de ecrane — administratorul firmei și fondatorul — pe 12 mărimi, de la 360 la 1920 px:
// ce iese din ecran, ce butoane sunt acoperite, ce e tăiat de o cutie care nu se derulează, ferestrele mai înalte decât ecranul.
// Plus pozele, ecran cu ecran. Au ieșit șase lucruri, reparate aici:
//   1. fișa mașinii pe tabletă (820–834 px) ieșea 38–52 px din ecran și harta dispărea (la 1024 px harta rămânea de 92 px):
//      cât stă fișa deschisă pe hartă, meniul din stânga se strânge singur, iar ☰ îl deschide peste hartă, ca pe telefon;
//   2. în bara de sus, pe tabletă, căsuța de căutare acoperea „Anunță echipa RA Track" și „Temă": bara stă acum în rândul ei;
//   3. fereastra „Anunță echipa RA Track" era de 640 px și pe un telefon de 360 px;
//   4. Vehicule și Șoferi pe telefon: regula de telefon (sus în pagină) era călcată de grila de calculator scrisă mai jos — capul de
//      tabel se vedea, creionul și coșul stăteau peste „Profesionist"; pe tabletă numele șoferilor se tăiau la trei litere;
//   5. Setări → Afișaj pe tabletă: „Tema aplicației" câte un cuvânt pe rând, cu „Închisă" peste titlu;
//   6. cartonașele pe firme ale fondatorilor (Tahograf, e-Transport): „Deschide firma" tăiat cu 16–104 px;
//   7. bara de sus pe telefonul îngust: grupul din dreapta trecea de ecran (360 px; la fondator, cu comutatorul mov, și la 390 px),
//      iar browserul micșora TOATĂ pagina ca s-o încapă (conținut de 386 / 472 px într-un ecran de 360) — textul ieșea mai mic
//      peste tot. Pe telefon, măsoară lățimea paginii (clientWidth), nu innerWidth: cea din urmă devine lățimea micșorată;
//   8. bula RA Insight stătea peste creionul ultimului rând din liste, pe telefon.
// Proba nu pornește un browser (poarta de pe GitHub n-are unul): păzește regulile care au reparat ce s-a măsurat și rulează în
// vm regula „meniul ca sertar". Măsurătoarea întreagă (în browser) nu e în depozit; se reface când se schimbă așezarea ecranelor.
//
//   node verify_ecrane.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const PAG = citeste('public/index.html'), CSS = citeste('public/css/app.css'), MT = citeste('public/css/map-tools.css');

console.log('\n1. Fișa mașinii pe tabletă (769–1100 px)');
const media = CSS.slice(CSS.indexOf('@media (min-width: 769px) and (max-width: 1100px) {'));
T('cât stă fișa deschisă pe hartă, meniul din stânga se strânge (lățime 0), iar deschis cu ☰ stă PESTE hartă, cu fundalul întunecat',
  /body\.detail-open:has\(#view-localizare\.active\) #navrail:not\(\.open\) \{ width: 0 !important; min-width: 0 !important;/.test(media) &&
  /body\.detail-open:has\(#view-localizare\.active\) #navrail\.open \{ position: fixed;/.test(media) && /body\.detail-open:has\(#view-localizare\.active\) \.navrail-backdrop\.visible \{ display: block;/.test(media));
T('fișa rămâne de 320 px până la 900 px și de 380 px peste (cu meniul strâns: lista + fișa + harta încap de la 769 px)',
  /@media \(max-width: 900px\) \{\s*#detail-panel\.open \{ width: 320px; min-width: 320px; \}/.test(CSS) && /--detail-width: 380px;/.test(CSS) && /--sidebar-width: 340px;/.test(CSS));
// Regula „meniul ca sertar", rulată.
const fNav = PAG.slice(PAG.indexOf('function _navCaSertar() {'), PAG.indexOf('function toggleNavrail() {'));
const sertar = (latime, fisa, harta) => {
  const ctx = { window: { innerWidth: latime }, document: { body: { classList: { contains: (c) => c === 'detail-open' && fisa } }, getElementById: (id) => id === 'view-localizare' ? { classList: { contains: (c) => c === 'active' && harta } } : null } };
  return vm.runInNewContext(fNav + '; _navCaSertar()', ctx);
};
T('meniul e sertar: pe telefon mereu; pe tabletă doar cu fișa deschisă pe hartă; pe calculator niciodată',
  sertar(390, false, true) === true && sertar(834, true, true) === true && sertar(1100, true, true) === true && sertar(834, false, true) === false &&
  sertar(834, true, false) === false && sertar(1101, true, true) === false && sertar(1366, true, true) === false);
T('☰ folosește regula; o alegere din meniu și închiderea fișei închid sertarul (nu rămâne deschis peste hartă)',
  /function toggleNavrail\(\) \{\n {6}if \(_navCaSertar\(\)\) \{/.test(PAG) && /if \(window\.innerWidth <= 1100\) closeNavrail\(\);/.test(PAG) &&
  /document\.body\.classList\.remove\('detail-open'\);\n {6}if \(window\.innerWidth > 768\) closeNavrail\(\);/.test(PAG));
T('bula RA Insight: pe tabletă se ascunde cât stă fișa deschisă (harta e îngustă); pe calculator trece în stânga fișei',
  /@media \(max-width: 1100px\) \{ body\.detail-open:has\(#view-localizare\.active\) #rax-fabs \{ display: none !important; \} \}/.test(PAG) &&
  /@media \(min-width: 1101px\) \{ body\.detail-open:has\(#view-localizare\.active\) #rax-fabs \{ right: calc\(var\(--detail-width\) \+ 16px/.test(PAG));

console.log('\n2. Bara de sus pe tabletă');
const mt = MT.slice(MT.indexOf('@media (min-width: 769px) and (max-width: 1100px) {'));
T('căutarea stă în rândul barei (nu centrată peste ea) și se strânge cât e loc; numele și rolul omului pleacă până la 900 px',
  /\.topbar-center \{ position: static; transform: none; flex: 1 1 auto; min-width: 0; max-width: none;/.test(mt) && /\.msb-search \{ min-width: 0; flex: 1 1 auto; max-width: 300px; \}/.test(mt) &&
  /@media \(min-width: 769px\) and \(max-width: 900px\) \{ \.topbar-user-info \{ display: none; \} \}/.test(MT));
T('pe calculator rămâne centrată, ca înainte; pe telefon plutește sub bară, ca înainte',
  /\.topbar-center \{\n {2}position: absolute; left: 50%; transform: translateX\(-50%\);/.test(MT) && /@media \(max-width: 768px\) \{\n {2}\/\* Pe mobil topbar-ul nu are loc/.test(MT));

console.log('\n3. Fereastra „Anunță echipa RA Track" pe telefon');
T('cel mult 640 px, dar niciodată mai lată decât ecranul (grila cu o coloană creștea după conținut)', /\.ce-win \{ width: min\(640px, calc\(100vw - 32px\)\); max-width: 100%;/.test(CSS));

console.log('\n4. Vehicule și Șoferi: regula de telefon stă DUPĂ grila de calculator (câștigă cea scrisă ultima)');
const bloc = (id) => { const i = PAG.indexOf('<style id="' + id + '">'); return i < 0 ? '' : PAG.slice(i, PAG.indexOf('</style>', i)); };
const VEH = bloc('veh-cards-css'), DRV = bloc('drv-cards-css');
const iVehGrid = VEH.indexOf('.veh-colh, .veh-row { display: grid;'), iVehTel = VEH.indexOf('@media (max-width: 900px) {\n            .veh-colh { display: none; }');
const iDrvGrid = DRV.indexOf('.drv-colh, .drv-row { display: grid;'), iDrvTel = DRV.indexOf('@media (max-width: 1024px) {\n            .drv-colh { display: none; }');
T('vehiculele: cardul pliat (≤ 900 px) e în blocul lor, după grila cu 6–7 coloane; grila fără „Companie" (selector mai tare) doar de la 901 px',
  iVehGrid > 0 && iVehTel > iVehGrid && /@media \(min-width: 901px\) \{\n {12}body:not\(\.is-super\) \.veh-colh, body:not\(\.is-super\) \.veh-row \{ grid-template-columns:/.test(VEH), iVehGrid + ' / ' + iVehTel);
T('șoferii: cardul pliat (≤ 1024 px) e în blocul lor, după grila cu 6 coloane; fără capul de tabel, lista își pune marginea de sus',
  iDrvGrid > 0 && iDrvTel > iDrvGrid && /\.drv-list \{ border-top: 1px solid var\(--border\); border-radius: 10px; \}/.test(DRV.slice(iDrvTel)), iDrvGrid + ' / ' + iDrvTel);
T('nicio regulă de telefon pentru ele rămasă mai sus în pagină (ar fi iar călcată)', (PAG.match(/\.veh-colh \{ display: none; \}/g) || []).length === 1 &&
  (PAG.match(/\.drv-colh \{ display: none; \}/g) || []).length === 1 && (PAG.match(/grid-template-areas: "av who act"/g) || []).length === 1 && (PAG.match(/grid-template-areas: "pic veh act"/g) || []).length === 1);
T('numele șoferului trece pe două rânduri (nu se mai taie cu „…"), eticheta rămâne întreagă',
  /\.drv-nm \{ flex-wrap: wrap; gap: 3px 7px; \}/.test(DRV) && /\.drv-nm-t \{ white-space: normal; overflow-wrap: anywhere; \}/.test(DRV));

console.log('\n5. Rânduri care se strâng: Setări → Afișaj, cartonașele pe firme ale fondatorilor');
T('Setări: textul păstrează 200 px, butoanele trec dedesubt; pe coloană cei 200 px nu devin înălțime',
  /\.pref-r \{ display: flex; flex-wrap: wrap;/.test(CSS) && /\.pref-txt \{ flex: 1 1 200px; min-width: 0; \}/.test(CSS) &&
  /\.pref-r-w \.pref-txt \{ flex: 0 0 auto; \}/.test(CSS) && /@media \(max-width: 620px\) \{[^}]*\}\s*\.pref-r \.pref-txt \{ flex: 0 0 auto; \}/.test(CSS));
T('fondatori: rândul firmei se rupe pe două rânduri (cutia taie ce iese), sumarul se poate rupe',
  /\.rax-devgr-h \{ flex-wrap: wrap; row-gap: 6px; \}/.test(PAG) && /\.rax-devgr-n \{ white-space: normal; text-align: right; min-width: 0; \}/.test(PAG) &&
  PAG.indexOf('.rax-devgr-h { flex-wrap: wrap;') > PAG.indexOf('.rax-devgr-n { margin-left: auto;'));

console.log('\n6. Bara de sus pe telefonul îngust (≤ 420 px) și locul de sub ultimul rând');
const mic = CSS.slice(CSS.indexOf('@media (max-width: 420px) {'));
T('iconițele rămân de 36 px (ținta de atingere), golurile scad la 4 px, marginile barei la 10 px; comutatorul mov se strânge (cu #topbar, fiindcă regulile lui stau mai jos în fișier)',
  CSS.indexOf('@media (max-width: 420px) {') > 0 && /#topbar \{ padding-left: 10px; padding-right: 10px; \}/.test(mic) && /\.topbar-left, \.topbar-right \{ gap: 4px; \}/.test(mic) &&
  /\.topbar-icon \{ width: 36px; height: 36px; \}/.test(mic) && /\.topbar-user \{ gap: 4px; padding-left: 6px; margin-left: 0; \}/.test(mic) &&
  /#topbar \.vert-com \{ margin-right: 0; gap: 2px; padding: 2px; \}/.test(mic) && CSS.indexOf('@media (max-width: 420px) {') > CSS.indexOf('.topbar-icon {') && CSS.indexOf('@media (max-width: 420px) {') > CSS.indexOf('.topbar-user {'));
// MĂSURAT în browser (26.10, după reparație): la 360 px bara clientului și a fondatorului încap (fără micșorarea paginii); înainte
// conținutul avea 386 px (client) și 472 px (fondator). Lățimea siglei depinde de font, deci aici nu se socotește — se măsoară.
T('comutatorul mov se strânge încă puțin, iar sub 380 px „Track" din siglă scade la 18 px (aceeași siglă, mai mică)',
  /#topbar \.vert-b \{ padding: 6px 5px; \}/.test(mic) && /@media \(max-width: 380px\) \{\s*#topbar \.ralogo \.raw \{ font-size: 18px !important; \}/.test(CSS));
T('fondatorul nu trimite cereri echipei: pe telefon iconița cu căști pleacă (loc pentru comutator)',
  /<button class="topbar-icon topbar-echipa" onclick="openSupport\(\)"/.test(PAG) && /body\.is-super \.topbar-echipa \{ display: none; \}/.test(CSS.slice(CSS.indexOf('@media (max-width: 768px) {'), CSS.indexOf('@media (max-width: 420px) {'))));
T('pe telefon, sub ultimul rând e loc cât bula RA Insight (creionul ultimului vehicul se poate apăsa)', /\.modal-overlay\.as-view \{ padding-bottom: 96px; \}/.test(CSS));

console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
process.exit(rele ? 1 : 0);
