#!/usr/bin/env node
'use strict';
// verify_ghilimele.js — ghilimelele românești se închid cu ” (18.11; Alin: „fă-le cum le-ai propus”, punctul 7 găsit pe drum).
// Site-ul le avea deja „…” (verify_site_public.js, 3f); aplicația (pagina, serverul, telefonul) scria „…" în sute de texte: butoane,
// mesaje, emailuri, hârtii. Acum peste tot „…”, și în comentarii — reperele dintre comentarii („// ── începe „X” ──”) le caută
// probele și serverul după text, deci trebuie scrise la fel peste tot.
//   1. nicio ghilimea deschisă cu „ și închisă cu " în fișierele aplicației și ale probelor;
//   2. textele care contează chiar arată ghilimeaua nouă (câteva, alese din locuri diferite).
const fs = require('fs');
const path = require('path');
let ok = 0, rau = 0;
const T = (nume, cond, extra) => { if (cond) { ok++; console.log('  ✓ ' + nume); } else { rau++; console.log('  ✗ ' + nume + (extra !== undefined ? '  → ' + extra : '')); } };
const R = __dirname;

// Fișierele: codul de la rădăcină (server, module, probe), pagina și scripturile ei, foile de stil, paginile publice, telefonul.
function strange(d, re) {
  return fs.readdirSync(path.join(R, d), { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'vendor') return [];
    return e.isDirectory() ? strange(d + '/' + e.name, re) : (re.test(e.name) ? [d + '/' + e.name] : []);
  });
}
// (fără proba asta: ea scrie forma veche ca exemplu)
const FIS = fs.readdirSync(R).filter((f) => /\.js$/.test(f) && f !== 'verify_ghilimele.js')
  .concat(strange('public/js', /\.js$/), strange('public/css', /\.css$/))
  .concat(fs.readdirSync(path.join(R, 'public')).filter((f) => /\.html$/.test(f) && !/^(debug|font-test)\.html$/.test(f)).map((f) => 'public/' + f))
  .concat(strange('mobile/src', /\.(ts|tsx|css)$/));

console.log('\n1. „…" (închisă drept) nicăieri');
// Textul dintre ghilimele: fără ghilimele, fără rând nou și fără semnele unei expresii regulate ([ ] ^ | \ $ { }) — o clasă de
// caractere ca [^"”] din cod nu e un text.
const RAU = /„([^"”“„\n\\[\]^|${}<>]{1,160}?)"/g;
const gasite = [];
for (const f of FIS) {
  const linii = fs.readFileSync(path.join(R, f), 'utf8').split('\n');
  linii.forEach((l, i) => { if (RAU.test(l)) gasite.push(f + ':' + (i + 1) + '  ' + l.trim().slice(0, 110)); RAU.lastIndex = 0; });
}
T('niciun „…" în ' + FIS.length + ' fișiere (pagină, server, probe, telefon)', gasite.length === 0, '\n      ' + gasite.slice(0, 15).join('\n      '));

console.log('\n2. Textele arată ghilimeaua nouă');
const rd = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const IX = rd('public/index.html'), SRV = rd('server.js'), GHID = rd('insight_ghid.js');
T('pagina: „Salvează” în îndemnuri (ex. „apasă „Salvează” pentru ele”)', /apasă „Salvează” pentru ele/.test(IX));
T('serverul: mesajele către om („Ziua asta e anulată: se reprogramează din „Istoric”.”)', SRV.includes('se reprogramează din „Istoric”.'));
T('ghidul lui RA Insight: numele de pe ecran între „…”', (GHID.match(/„[^"”\n]{2,60}”/g) || []).length > 100);
const tel = strange('mobile/src', /\.tsx$/).map(rd).join('\n');
T('telefonul: textele de pe ecrane („Salvează”, „Trece pe firmă”)', /„Trece pe firmă”/.test(tel));

console.log((rau ? '✗' : '✓') + ' ghilimelele: ' + ok + ' verificări trecute, ' + rau + ' picate');
process.exit(rau ? 1 : 0);
