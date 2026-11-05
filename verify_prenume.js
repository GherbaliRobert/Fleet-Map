// verify_prenume.js — prenumele din salut („Salut, Alin!" în RA Insight, „Bună dimineața, Alin!" la asistentul nostru), 05.11.
// Alin: „îmi apare «Salut! Cu ce te pot ajuta?»… aș vrea să-i apară prenumele, la fel și în asistentul fondatorilor".
//
//   node verify_prenume.js
//
// Ce păzește:
//   1. regula (prenume.js): cuvântul din nume care e un prenume știut („Tilvar Alin" → „Alin"), altfel primul cuvânt, fără nume din
//      adresa de email („alin.tilvar@…" → „Alin"), niciodată „Office" / „Admin"; MAJUSCULELE și literele mici se îndreaptă;
//   2. O SINGURĂ regulă: serverul o dă în /api/me (`prenume`), pagina și telefonul doar o scriu, salutul asistentului nostru
//      (azi_la_noi.salut) o folosește pe aceeași; nicăieri altundeva nu se mai taie „primul cuvânt din nume" pentru un salut.
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./prenume');
const A = require('./azi_la_noi');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 300) : '')); }
}
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

console.log('\n1. Regula');
const CAZURI = [
  [['Tilvar Alin'], 'Alin', 'numele de familie întâi, ca în acte'],
  [['Alin Tilvar'], 'Alin', 'prenumele întâi'],
  [['TILVAR ALIN'], 'Alin', 'scris cu majuscule'],
  [['ion popescu'], 'Ion', 'scris cu litere mici'],
  [['Gherbali Robert'], 'Robert', 'Robert, cu numele de familie întâi'],
  [['Popescu Ionuț'], 'Ionuț', 'cu diacritice'],
  [['Pop Ana-Maria'], 'Ana-Maria', 'prenume cu cratimă'],
  [['Kovács István'], 'István', 'prenume maghiar'],
  [['Jonas Weber'], 'Jonas', 'un prenume pe care lista nu-l știe: primul cuvânt'],
  [['Mihai'], 'Mihai', 'un singur cuvânt'],
  [['Administrator'], '', 'un cuvânt de birou nu e prenume'],
  [['Dispecer Tura 2'], '', 'nici „Dispecer"'],
  [['', 'alin.tilvar@ratrack.ro'], 'Alin', 'fără nume: din adresa de email'],
  [['alin.tilvar@ratrack.ro', 'x'], 'Alin', 'numele e chiar adresa de email'],
  [['', 'ionut.popescu@firma.ro'], 'Ionuț', 'din email, cu diacriticele prenumelui'],
  [['', 'admin'], '', 'contul „admin": fără prenume („Salut!")'],
  [['', 'office@firma.ro'], '', 'o adresă de birou: fără prenume'],
  [['   ', null], '', 'nimic'],
];
CAZURI.forEach(([arg, asteptat, ce]) => {
  const r = P.prenumeDin(arg[0], arg[1]);
  T(ce + ': ' + JSON.stringify(arg) + ' → „' + asteptat + '"', r === asteptat, r);
});
T('lista are prenumele noastre (Alin, Robert) și nu are cuvinte obișnuite de birou', P.estePrenume('Alin') && P.estePrenume('robert') && !P.estePrenume('office') && !P.estePrenume('admin') && !P.estePrenume('dispecer'));

console.log('\n2. O singură regulă: serverul o dă, ecranele doar o scriu');
const SRV = citeste('server.js'), PAG = citeste('public/index.html');
T('/api/me dă `prenume` din regulă (numele din fișă + adresa de autentificare)', /prenume: prenumeMod\.prenumeDin\(fullName, a\.username\),/.test(SRV) && /const prenumeMod = require\('\.\/prenume'\);/.test(SRV));
const fPren = (PAG.match(/function prenume\(\) \{[^\n]*\}/) || [''])[0];
T('pagina (RA Insight) scrie prenumele primit, nu-l mai taie din nume', /return String\(u\.prenume \|\| ''\)\.trim\(\);/.test(fPren) && !/full_name/.test(fPren), fPren);
T('telefonul la fel: „Salut, …" din `prenume` (fără regula lui)', /<h2>\{textSalut\(u\?\.prenume\)\}<\/h2>/.test(citeste('mobile/src/screens/Insight.tsx')) && !/prenumeDin/.test(citeste('mobile/src/lib/insight.ts')) && /prenume\?: string;/.test(citeste('mobile/src/api/endpoints.ts')));
T('asistentul nostru (azi_la_noi.salut): aceeași regulă, cu adresa omului', /function prenume\(nume, email\) \{ return require\('\.\/prenume'\)\.prenumeDin\(nume, email\); \}/.test(citeste('azi_la_noi.js')) &&
  /salut: salut\(d\.nume, acum, d\.email\)/.test(citeste('azi_la_noi.js')) && /email: email, ai: bandaAi/.test(SRV));
const dimineata = Date.parse('2026-11-05T07:30:00Z');
T('…„Bună dimineața, Alin!" pentru „Tilvar Alin" și pentru contul fără nume, după email', A.salut('Tilvar Alin', dimineata) === '**Bună dimineața, Alin!** Iată cum stăm azi.' &&
  A.salut('', dimineata, 'alin.tilvar@ratrack.ro') === '**Bună dimineața, Alin!** Iată cum stăm azi.' && A.salut('', dimineata, 'admin') === '**Bună dimineața!** Iată cum stăm azi.', A.salut('Tilvar Alin', dimineata));
T('nicio altă tăiere „primul cuvânt din nume" pentru un salut în pagină', !/Salut, ' \+ String\([^)]*full_name/.test(PAG) && !/full_name \|\| ''\)\.trim\(\)\.split\(\/\\s\+\/\)\[0\]/.test(PAG));

console.log('\n' + (rele ? '✗' : '✓') + ' verify_prenume: ' + ok + ' trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
