// verify_poarta.js — poarta de dinaintea livrării trebuie să POATĂ rula.
//
//   node verify_poarta.js
//
// Găsit pe 22.09, uitându-mă de ce nu pot confirma un deploy: pe GitHub, CI-ul era ROȘU la fiecare
// împingere — de 36 de commit-uri, adică o săptămână. Cădea în 20 de secunde, la primul rând:
//
//     node --check billing.js
//     Error: Cannot find module '.../billing.js'
//
// `billing.js` fusese șters deliberat pe 15.09, odată cu Stripe. Numele lui a rămas scris în
// `.github/workflows/ci.yml`. Fiindcă pasul „Lint" cade primul, NIMIC din ce urmează nu s-a mai
// executat: nici probele unitare, nici `npm test`, nici cele treisprezece suite de securitate.
// Poarta arăta ca o poartă, dar nu mai apăra nimic. Al doilea gard mort, găsit în aceeași trecere:
// `tools/gen-can-icons.js` scria CRLF, iar `can_icons.js` e stocat cu LF, deci `--check` pica pe
// orice descărcare curată, comparând 167 de rânduri identice.
//
// Ce apără proba: poarta să nu mai poată muri în tăcere. Fiecare fișier pe care CI-ul îl numește
// trebuie să existe, iar fiecare `require('./…')` dinăuntrul lor trebuie să ducă undeva.
//
// ⚠ NU verifică dacă probele TREC (aia le e treaba lor). Verifică doar că se pot PORNI — adică
// exact felul de defect care nu se vede până nu te uiți pe GitHub.
const fs = require('fs');
const path = require('path');

const P = (f) => path.join(__dirname, f);
const CI = P('.github/workflows/ci.yml');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

sect('1. Fiecare fișier numit în poartă există');
T('fișierul porții există', fs.existsSync(CI));
const ci = fs.existsSync(CI) ? fs.readFileSync(CI, 'utf8') : '';
// Rândurile din `run:` care cheamă o probă. Două forme, amândouă folosite:
//   `node x.js`, `node --check x.js`, `node tools/x.js --check`
//   `s x.js` — ajutorul care rulează TOATE probele pasului și cade abia la final, ca una picată
//              să nu le ascundă pe celelalte.
// Comentariile din YAML (#) se sar: acolo se POMENESC nume șterse, tocmai ca să se știe de ce.
const numite = [];
ci.split('\n').forEach((rand) => {
  const curat = rand.replace(/#.*$/, '');
  const m = curat.match(/^\s*(?:node\s+(?:--check\s+)?|s\s+)([A-Za-z0-9_./-]+\.js)/);
  if (m) numite.push(m[1]);
});
T('poarta chiar cheamă probe (nu s-a golit lista)', numite.length >= 20, numite.length + ' fișiere');
const lipsa = [...new Set(numite)].filter((f) => !fs.existsSync(P(f)));
T('niciun fișier numit în poartă nu lipsește din depozit', lipsa.length === 0, lipsa.join(', '));

sect('2. Și fiecare dintre ele se poate PORNI (modulele lor locale există)');
// `test_billing.js` a supraviețuit ștergerii lui `billing.js` și cerea un modul inexistent: ar fi
// picat la pasul 2 exact cum `--check` pica la pasul 1. Un fișier care există, dar nu pornește,
// omoară poarta la fel de bine.
//
// Comentariile se scot întâi: un modul ȘTERS e pomenit tocmai în comentariul care explică de ce a
// fost scos (chiar și în fișierul ăsta). Un `require` din comentariu nu e o dependință.
const rupte = [];
[...new Set(numite)].filter((f) => fs.existsSync(P(f))).forEach((f) => {
  const src = fs.readFileSync(P(f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const rx = /require\(\s*'(\.[^']+)'\s*\)/g;
  let m;
  while ((m = rx.exec(src))) {
    const tinta = path.join(path.dirname(P(f)), m[1]);
    const gasit = ['', '.js', '.json', '/index.js'].some((ext) => fs.existsSync(tinta + ext));
    if (!gasit) rupte.push(f + ' → ' + m[1]);
  }
});
T('niciun `require` local rupt în probele porții', rupte.length === 0, rupte.join(' · '));

sect('3. Ce s-a scos odată cu Stripe a plecat de tot');
// Regula de fond („RA Tracks NU funcționează pe planuri") e păzită de `verify_fara_planuri.js`.
// Aici se apără doar urma rămasă în poartă — locul care n-a fost curățat atunci.
T('poarta nu mai numește `billing.js`', !/^\s*node\s+(?:--check\s+)?billing\.js/m.test(ci));
T('și nici proba lui', !/^\s*node\s+test_billing\.js/m.test(ci) && !fs.existsSync(P('test_billing.js')));

sect('4. Gardul iconițelor poate trece pe o descărcare curată');
// `can_icons.js` se GENEREAZĂ din aplicația de telefon, iar poarta verifică să fie la zi. Dacă
// unealta scrie alt sfârșit de rând decât ce e în depozit, gardul pică mereu — fără ca desenele
// să difere cu ceva.
const GEN = P('tools/gen-can-icons.js');
T('unealta există', fs.existsSync(GEN));
if (fs.existsSync(GEN)) {
  T('unealta scrie LF, ca tot depozitul', !/join\('\\r\\n'\)/.test(fs.readFileSync(GEN, 'utf8')));
}
if (fs.existsSync(P('can_icons.js'))) {
  const b = fs.readFileSync(P('can_icons.js'));
  T('și fișierul generat e cu LF', b.indexOf('\r\n') < 0,
    b.toString().split('\r\n').length - 1 + ' rânduri CRLF');
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
