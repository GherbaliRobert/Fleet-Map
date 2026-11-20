#!/usr/bin/env node
'use strict';
// verify_acord.js — un număr lângă cuvântul lui, pe românește (20.11; Alin: „2. DA, fă și A și B”): „1 zi”, „12 zile”, „25 DE zile”,
// „101 zile”, „1.000 de zile”. Până pe 20.11 aplicația scria „30 zile” (butoanele de perioadă, pragurile agenților, termenele) și
// „expirat de 43 zile”, „25 vehicule”, „Generat (120 rânduri)” — peste tot unde cifra vine din date.
//   1. regula: public/js/numar.js (pagina + serverul) = mobile/src/lib/numar.ts (telefonul), pe aceleași cifre;
//   2. vechile ajutoare ale serverului (agents.cate, contracts.numar, `de` / `_de` din module) cheamă regula comună — nu au copia lor;
//   3. pagina o încarcă în <head>, înaintea scripturilor ei, iar cutia în care serverul rulează oferta pentru telefon o are și ea;
//   4. nicio formă veche rămasă: „30 zile” scris fix; `n + ' zile'`, `n + (n === 1 ? ' zi' : ' zile')` în pagină, server și telefon.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, rau = 0;
const T = (nume, cond, extra) => { if (cond) { ok++; console.log('  ✓ ' + nume); } else { rau++; console.log('  ✗ ' + nume + (extra !== undefined ? '  → ' + extra : '')); } };
const P = (f) => path.join(__dirname, f);
const citeste = (f) => fs.readFileSync(P(f), 'utf8');

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. Regula, în pagină, pe server și pe telefon');
const N = require('./public/js/numar.js');
const CAZURI = [[0, '0 zile'], [1, '1 zi'], [2, '2 zile'], [12, '12 zile'], [19, '19 zile'], [20, '20 de zile'], [21, '21 de zile'],
  [25, '25 de zile'], [99, '99 de zile'], [100, '100 de zile'], [101, '101 zile'], [119, '119 zile'], [120, '120 de zile'],
  [1000, '1.000 de zile'], [1001, '1.001 zile'], [1020, '1.020 de zile'], [2.5, '2,5 zile'], [20.5, '20,5 zile'], [-25, '-25 de zile'], ['30', '30 de zile']];
const pe = (f) => CAZURI.map((c) => f(c[0], 'zi', 'zile'));
const asteptat = CAZURI.map((c) => c[1]);
T('serverul (require): ' + asteptat.slice(0, 9).join(' · ') + ' …', JSON.stringify(pe(N.nrDe)) === JSON.stringify(asteptat), pe(N.nrDe).join(' · '));
// Pagina o încarcă ca script obișnuit: nrDe / deNr / nrRo ajung pe window.
const win = {};
vm.runInNewContext(citeste('public/js/numar.js'), { window: win });
T('pagina (window.nrDe), aceleași texte', typeof win.nrDe === 'function' && JSON.stringify(pe(win.nrDe)) === JSON.stringify(asteptat), typeof win.nrDe);
T('…și window.deNr / nrRo / RaNumar', typeof win.deNr === 'function' && typeof win.nrRo === 'function' && win.RaNumar && win.RaNumar.nrDe === win.nrDe);
T('deNr: „ ” sau „ de ”', N.deNr(5) === ' ' && N.deNr(20) === ' de ' && N.deNr(0) === ' ' && N.deNr(118) === ' ' && N.deNr(2.5) === ' ');
let ts = null;
try { ts = require(P('mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { /* lipsește */ } }
if (!ts) T('compilatorul TypeScript (npm install în mobile/)', false);
else {
  const js = ts.transpileModule(citeste('mobile/src/lib/numar.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports });
  T('telefonul (lib/numar.ts), aceleași texte', JSON.stringify(pe(m.exports.nrDe)) === JSON.stringify(asteptat), pe(m.exports.nrDe).join(' · '));
  T('…și deNr la fel', [0, 1, 19, 20, 101, 120, 2.5].every((x) => m.exports.deNr(x) === N.deNr(x)));
}

// ─── 2. Vechile ajutoare ale serverului ─────────────────────────────────────────────────────────────────────────
console.log('\n2. Ajutoarele vechi cheamă regula comună');
const ag = require('./agents.js');
const cate = ag._ajutor && ag._ajutor.cate ? ag._ajutor.cate : null;
const contracte = require('./contracts.js');
T('contracts.numar = regula („1.000 de întrebări”, „15 întrebări”, „0 zile”)',
  contracte.numar(1000, 'întrebare', 'întrebări') === '1.000 de întrebări' && contracte.numar(15, 'x', 'întrebări') === '15 întrebări' && contracte.numar(0, 'zi', 'zile') === '0 zile');
T('agents.js: cate(…) cheamă regula comună', /function cate\(n, unu, multe\) \{\s*return _numarRo\.nrDe\(/.test(citeste('agents.js')) && (!cate || cate(25, 'zi', 'zile') === '25 de zile'));
const MODULE = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^(verify_|test_|seed_)/.test(f));
// O copie a regulii = o funcție mică de „de” care socotește singură `% 100`.
const COPIE = /(function\s+_?(?:de|deNr|deN|_ofDe|_mailDe|_ofDe)\s*\(n\)\s*\{[^}\n]*%\s*100|const\s+_?de\s*=\s*(?:function\s*)?\(n\)\s*(?:=>)?\s*\{?[^}\n]*%\s*100)/;
const cuCopie = MODULE.filter((f) => COPIE.test(citeste(f)));
T('niciun modul al serverului nu-și mai ține copia lui (doar public/js/numar.js)', cuCopie.length === 0, cuCopie.join(', '));
T('server.js cere regula (_nrDe) și o dă cutiei ofertei', /const _numarRo = require\('\.\/public\/js\/numar\.js'\)/.test(citeste('server.js')) &&
  /\.\.\.require\('\.\/public\/js\/numar\.js'\)/.test(citeste('server.js')));

// ─── 3. Pagina ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Pagina o încarcă înaintea scripturilor ei');
const html = citeste('public/index.html');
const iNr = html.indexOf('<script src="/js/numar.js"></script>');
const iPrimul = html.search(/<script>(?!\s*<\/script>)/);
T('<script src="/js/numar.js"> în <head>, înaintea primului script al paginii', iNr > 0 && iNr < html.indexOf('</head>') && (iPrimul < 0 || iNr < iPrimul), iNr + ' / ' + iPrimul);

// ─── 4. Forma veche ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. Nicio formă veche rămasă');
const PLURALE = ['zile', 'luni', 'ore', 'minute', 'secunde', 'săptămâni', 'ani', 'vehicule', 'mașini', 'șoferi', 'poziții', 'rânduri', 'puncte',
  'aparate', 'rapoarte', 'întrebări', 'răspunsuri', 'conturi', 'utilizatori', 'grupe', 'curse', 'emailuri', 'bucăți', 'alerte', 'lucrări', 'firme',
  'cereri', 'constatări', 'caractere', 'litri', 'evenimente', 'facturi', 'documente', 'depășiri', 'camioane', 'contracte', 'module', 'ture',
  'mesaje', 'conversații', 'opriri', 'zone', 'oameni', 'acte', 'fișiere', 'destinatari', 'remorci', 'semiremorci', 'colete', 'companii', 'ciorne'];
const W = '(?:' + PLURALE.join('|') + ')(?![\\wăâîșțĂÂÎȘȚ=])';
const FIX = new RegExp('(?<![\\d.,])(\\d{2,})\\s+(' + W + ')', 'g');          // „30 zile” scris fix
const LIPIT = new RegExp("[\\w$\\]\\)]\\s*\\+\\s*['\"`] ?" + W);               // n + ' zile'
const PERECHE = new RegExp("(===?|==) ?1 \\? ?['\"][^'\"]*['\"] ?: ?['\"] ?" + W);   // n + (n === 1 ? ' zi' : ' zile')
const JSX = new RegExp('\\{[\\w$.()\\[\\]+ |-]+\\} ' + W);                      // {n} zile
// „de” pus deja de regulă înaintea cuvântului: `… + _raxDe(n) + 'zile'`, `… + de(n) + (n === 1 ? 'zi' : 'zile')`, `{de(n)}{n === 1 ? …}`.
const _DE_FN = '(?:De|\\bde|deNr|deN|_rDe|_raxDe|_de|deRo|_ofDe|_mailDe|_deNr|_deNrC|nrDe|_nrDe|cate|numar)\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\)';
const _DE_STR = "(?:' de ' : ' '\\)|' ' : ' de '\\)|\\? ' de' : ''\\)|'de ' : ''\\)|\\+ de)";
const CU_DE = new RegExp('(?:' + _DE_FN + '|' + _DE_STR + ')\\s*\\}?\\s*\\+?\\s*[({]?[\\w$.()\\s*/|+-]*$');
const deVerificat = ['public/index.html'].concat(
  fs.readdirSync(P('public/js')).filter((f) => /\.js$/.test(f)).map((f) => 'public/js/' + f),
  MODULE,
  (function tot(d) { return fs.readdirSync(P(d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? tot(d + '/' + e.name) : /\.tsx?$/.test(e.name) ? [d + '/' + e.name] : []); })('mobile/src'));
// Rândurile de jurnal ale serverului (doar pentru noi, în consola Railway) și uneltele de probă nu sunt texte pentru om.
const NU_E_TEXT = /console\.|logger\.|\[DEMO\]|\[AUDIT\]|\[SOFERI\]|\[MAIL\]|\[ISTORIC|\[RESTRARE\]|\[ARHIVA|SLOW QUERY|BOOT_SEED|_log\(/;
// Lăsate dinadins, cu motivul lor. Cifrele de aici sunt fixe și sub 20, iar paginile în care stau NU încarcă js/numar.js:
const LASATE = [
  ["public/js/agenti-demo.js", "ZILE_ITP + ' zile'"],   // telefonul de pe prima pagină (12 zile) — legat de agenți prin verify_agenti_demo.js
  ["public/js/agenti-demo.js", "ZILE_RCA + ' zile'"],   // (19 zile)
  ["public/js/parola.js", "MIN + ' caractere'"],        // „Setează-ți parola” (10 caractere)
  ["mobile/src/lib/parola.ts", "MIN + ' caractere'"],   // copia telefonului, legată de cea de pe web prin verify_utilizatori.js
  ["pachete.js", "nr(p.intrebari) + 'întrebări"],       // `nr` = cifra + deNr (rândul de deasupra)
];
const lasat = (f, cod) => LASATE.some((x) => x[0] === f && cod.indexOf(x[1]) >= 0);
const gasite = [];
for (const f of deVerificat) {
  if (/^(catalog_smoke|smoke_reports)\.js$/.test(f)) continue;
  const rand = citeste(f).split('\n');
  rand.forEach((l, i) => {
    const s = l.trim();
    if (!s || s.startsWith('//') || s.startsWith('*') || s.startsWith('/*') || s.startsWith('{/*') || NU_E_TEXT.test(l)) return;
    const cod = l.replace(/\s\/\/\s.*$/, '');
    if (lasat(f, cod)) return;
    let m;
    FIX.lastIndex = 0;
    while ((m = FIX.exec(cod))) {
      const x = Number(m[1]), r = x % 100;
      if (x >= 20 && !(r >= 1 && r <= 19)) gasite.push(f + ':' + (i + 1) + '  ' + m[0]);
    }
    const inainte = i > 0 ? rand[i - 1].replace(/\s\/\/\s.*$/, '').trim() + ' ' : '';   // „de” pus pe rândul de deasupra
    for (const re of [LIPIT, PERECHE, JSX]) {
      const g = new RegExp(re.source, 'g'); let k;
      while ((k = g.exec(cod))) {
        // LIPIT începe pe ultima literă a cifrei (`n` din `n + ' zile'`), celelalte pe `===` / `{`.
        const ctx = (inainte + cod).slice(0, inainte.length + k.index + (re === LIPIT ? 1 : 0));
        if (CU_DE.test(ctx.slice(-160))) continue;
        gasite.push(f + ':' + (i + 1) + '  ' + cod.slice(Math.max(0, k.index - 40), k.index + k[0].length).trim());
      }
    }
  });
}
T('nicio cifră lângă un cuvânt fără regula comună (' + deVerificat.length + ' fișiere)', gasite.length === 0, '\n      ' + gasite.slice(0, 25).join('\n      ') + (gasite.length > 25 ? '\n      … și încă ' + (gasite.length - 25) : ''));

console.log('\n' + ok + ' verificări trecute, ' + rau + ' picate');
process.exit(rau ? 1 : 0);
