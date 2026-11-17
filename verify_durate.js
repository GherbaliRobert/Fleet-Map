#!/usr/bin/env node
'use strict';
// verify_durate.js — duratele se scriu românește: „3 h 10 min", „45 min", „40 s", „2 zile 3 h" (17.11; Alin: „5. da", P18 din
// inventarul site-ului). Până pe 17.11 aplicația scria „3h 10m" — „m" e simbolul metrului — în rapoarte (ecran, Excel, PDF), în fișierul
// de Traseu, pe hartă, la tahograf, în RA Insight și pe telefon; telefonul de pe prima pagină îl copia.
//   1. formele: fmtDur (rapoartele), _dur / _sec (RA Insight pe reguli), hmTraseu / durataDepasiri (fișierul de Traseu), fmtH (tahograf),
//      formatIoValue (orele de motor din CAN);
//   2. sortarea tabelului din Rapoarte recunoaște o durată și în forma nouă, și în cea veche (Istoricul de dinainte de 17.11);
//   3. nicio formă veche rămasă în cod — server, pagină, telefon: `+ 'h ' +`, `+ 'm'`, `}h ${…}m`, `+ 'z '`, „sub 1m", „3min 20s".
const fs = require('fs');
const path = require('path');
let ok = 0, rau = 0;
const T = (nume, cond, extra) => { if (cond) { ok++; console.log('  ✓ ' + nume); } else { rau++; console.log('  ✗ ' + nume + (extra !== undefined ? '  → ' + extra : '')); } };
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

console.log('\n1. Formele');
const REP = require('./reports.js');
const fmtDur = REP._ajutor.fmtDur;
const cazuri = [[0, '0 s'], [40, '40 s'], [60, '1 min'], [2700, '45 min'], [3600, '1 h'], [11400, '3 h 10 min'], [180000, '50 h']];
T('rapoartele (fmtDur): ' + cazuri.map((c) => c[1]).join(' · '), cazuri.every((c) => fmtDur(c[0]) === c[1]), cazuri.map((c) => fmtDur(c[0])).join(' · '));
const AR = require('./ai_raport.js');
T('RA Insight pe reguli scrie ca rapoartele (_dur = fmtDur)', cazuri.every((c) => AR._dur(c[0]) === fmtDur(c[0])), cazuri.map((c) => AR._dur(c[0])).join(' · '));
const citite = [['3 h 10 min', 11400], ['45 min', 2700], ['40 s', 40], ['5 min 30 s', 330], ['3h 10m', 11400], ['2 h', 7200], ['0 s', 0]];
T('…și le citește înapoi (_sec), și pe cele vechi din Istoric', citite.every((c) => AR._sec(c[0]) === c[1]), citite.map((c) => c[0] + '=' + AR._sec(c[0])).join(', '));
const RE = require('./report_export.js');
T('fișierul de Traseu: „1 h 5 min", „45 min" (hmTraseu)', RE.hmTraseu(3900) === '1 h 5 min' && RE.hmTraseu(2700) === '45 min' && RE.hmTraseu(3600) === '1 h', [RE.hmTraseu(3900), RE.hmTraseu(2700), RE.hmTraseu(3600)].join(' · '));
T('…durata depășirilor: „45 s", „3 min 20 s"', RE.durataDepasiri(45) === '45 s' && RE.durataDepasiri(200) === '3 min 20 s', RE.durataDepasiri(45) + ' · ' + RE.durataDepasiri(200));
const TA = require('./tacho.js');
T('tahograful: „4 h 5 min" (fără „4h 05m")', TA._fmtH(245) === '4 h 5 min', TA._fmtH(245));
const IO = require('./io_format.js');
T('orele de motor din CAN: „123 h 4 min"', IO.formatIoValue('can_engine_worktime', 7384) === '123 h 4 min', IO.formatIoValue('can_engine_worktime', 7384));
const legenda = citeste('reports.js').split('const HOS_LEGEND = ')[1] || '';
T('legenda orelor de condus, în cuvinte („Cel mult 9 ore pe zi"), fără „Max 9h/zi"', /Cel mult 9 ore pe zi/.test(legenda) && !/\d+h\b/.test(legenda.split('] };')[0].replace(/4h30/g, '')), legenda.slice(0, 120));

console.log('\n2. Sortarea tabelului din Rapoarte');
const IX = citeste('public/index.html');
const a = IX.indexOf('function _repColKind(rows, ci)'), b = IX.indexOf('function _repSortBy(ci)');
T('găsesc _repColKind / _repCellVal în pagină', a > 0 && b > a);
if (a > 0 && b > a) {
  const f = new Function(IX.slice(a, b) + '; return { _repColKind, _repCellVal };')();
  const rows = [['3 h 10 min'], ['45 min'], ['40 s'], ['5 min 30 s'], ['3h 10m'], ['2 h']];
  const kind = f._repColKind(rows, 0);
  T('o coloană de durate e „dur" și se sortează după secunde', kind === 'dur' && J(rows.map((r) => f._repCellVal(kind, r[0]))) === J([11400, 2700, 40, 330, 11400, 7200]), kind + ' ' + J(rows.map((r) => f._repCellVal(kind, r[0]))));
  T('…numerele simple rămân numere', f._repColKind([['12'], ['14']], 0) === 'num');
}
function J(x) { return JSON.stringify(x); }

console.log('\n3. Nicio formă veche rămasă în cod');
const fisiere = ['server.js', 'reports.js', 'report_export.js', 'ai_raport.js', 'tacho.js', 'io_format.js', 'agents.js', 'fleet_quick.js', 'ramuri.js',
  'public/index.html', 'public/js/vehicle-popup.js', 'public/js/agenti-demo.js', 'public/js/ra-insight-demo.js'];
const tel = (function strange(d) {
  return fs.readdirSync(path.join(__dirname, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? strange(d + '/' + e.name) : (/\.(ts|tsx)$/.test(e.name) ? [d + '/' + e.name] : []));
})('mobile/src');
const VECHI = [
  [/\+\s*['"]h ['"]\s*\+/, '„+ \'h \' +" (3h 10m)'],
  [/\+\s*['"]m['"](?![\w'"])/, '„+ \'m\'" (minute scrise „m")'],
  [/\}h \$\{/, '„${h}h ${m}m"'],
  [/\+\s*['"]z ['"]/, '„2z 3h" (zilele scrise „z")'],
  [/sub 1m['"]/, '„sub 1m"'],
  [/\+\s*['"]min ['"]\s*\+/, '„3min 20s" (lipit)'],
  [/\d+h \d+m\b/, 'o durată scrisă de mână „3h 10m"'],
  [/\+\s*['"]h [a-zăâîșț]|\}h [a-zăâîșț]/, '„38h condus" (ora lipită de cifră)'],
];
const gasite = [];
for (const f of fisiere.concat(tel)) {
  const linii = citeste(f).split('\n');
  linii.forEach((l, i) => {
    const cod = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');   // fără comentarii: acolo se poate pomeni forma veche
    for (const [re, ce] of VECHI) if (re.test(cod)) gasite.push(f + ':' + (i + 1) + ' — ' + ce);
  });
}
T('niciun „3h 10m" / „45m" / „2z 3h" / „3min 20s" în ' + (fisiere.length + tel.length) + ' fișiere (server, pagină, telefon)', gasite.length === 0, '\n      ' + gasite.slice(0, 20).join('\n      '));

console.log((rau ? '✗' : '✓') + ' duratele pe românește: ' + ok + ' verificări trecute, ' + rau + ' picate');
process.exit(rau ? 1 : 0);
