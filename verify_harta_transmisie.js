// verify_harta_transmisie.js — harta (Localizare): când a transmis mașina ultima dată.
//
//   node verify_harta_transmisie.js
//
// Bubă găsită pe 08.10, în capturile pentru etapa B a capitolului AI: o mașină care n-a transmis NICIODATĂ (aparatul
// pus, montajul încă nefăcut) apărea în lista hărții cu „⚠️ acum 20734 zile", iar în fișa ei cu „01.01.1970" și
// „Ultima interogare · acum 20734 zile". Cauza: new Date(null) e 1 ianuarie 1970. Alin: „rezolvă acum".
//
// Ce păzește proba:
//   1. regula (`candATransmis` / `ziuaTransmisiei`), decupată din pagină și rulată: fără oră → „fără transmisie" / „—";
//   2. lista hărții, fereastra grupei și fișa mașinii (starea + „Ultima interogare") trec TOATE prin ea;
//   3. nicăieri în pagină o oră a ultimei transmisii nu mai ajunge în new Date(...) fără să fie verificată întâi.
//
// Codul nu se copiază aici: se decupează din sursă și se execută.
'use strict';
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// ─── 1. Regula, rulată ──────────────────────────────────────────────────────────────────────────────
console.log('1. Regula: fără nicio poziție → „fără transmisie", nu „acum 20734 zile"');
const rand = (a) => { const i = html.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a); return html.slice(i, html.indexOf('\n', i)); };
const fnPag = (a) => { const i = html.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a); return html.slice(i, html.indexOf('\n    }', i) + 6); };
const R = new Function(
  fnPag('function getTimeAgo(date)') + '\n' + rand('function timeAgoPhrase(date)') + '\n' +
  rand('function candATransmis(ts)') + '\n' + rand('function ziuaTransmisiei(ts)') +
  '\nreturn { candATransmis, ziuaTransmisiei };')();
const MIN = 60000, acum = Date.now();
for (const [et, v] of [['null', null], ['undefined', undefined], ['șir gol', '']]) {
  T('fără oră (' + et + ') → „fără transmisie"', R.candATransmis(v) === 'fără transmisie', R.candATransmis(v));
  T('fără oră (' + et + ') → ziua „—"', R.ziuaTransmisiei(v) === '—', R.ziuaTransmisiei(v));
}
T('acum 4 minute → „acum 4 min"', R.candATransmis(new Date(acum - 4 * MIN).toISOString()) === 'acum 4 min', R.candATransmis(new Date(acum - 4 * MIN).toISOString()));
T('acum 3 zile → „acum 3 zile"', R.candATransmis(new Date(acum - 3 * 1440 * MIN).toISOString()) === 'acum 3 zile', R.candATransmis(new Date(acum - 3 * 1440 * MIN).toISOString()));
T('o oră știută → ziua scrisă românește', R.ziuaTransmisiei('2026-10-08T05:47:00Z') === new Date('2026-10-08T05:47:00Z').toLocaleString('ro-RO'));
const nicio = [null, undefined, ''].map((v) => R.candATransmis(v) + ' ' + R.ziuaTransmisiei(v)).join(' | ');
T('nicăieri 1970 sau 20734', !/1970|20734/.test(nicio), nicio);

// ─── 2. Toate locurile trec prin regulă ─────────────────────────────────────────────────────────────
console.log('\n2. Lista hărții, fereastra grupei și fișa mașinii folosesc aceeași regulă');
T('regula e scrisă O SINGURĂ dată', (html.match(/function candATransmis\(/g) || []).length === 1 && (html.match(/function ziuaTransmisiei\(/g) || []).length === 1);
T('lista din stânga a hărții', /const timeAgo = candATransmis\(d\.timestamp\);/.test(html));
T('fereastra grupei (bula de pe hartă)', /<i class="far fa-clock"><\/i> ' \+ candATransmis\(d\.timestamp\) \+ '<\/span>/.test(html));
T('fișa: fără nicio poziție scrie „Fără transmisie", nu „Oprit"',
  /statusText = data\.timestamp \? '⚠️ Oprit \(fără semnal\)' : '⚠️ Fără transmisie';/.test(html) &&
  /statusDetail = data\.timestamp \? 'ultima actualizare · ' \+ candATransmis\(data\.timestamp\) : 'n-a trimis încă nicio poziție';/.test(html));
T('fișa: „Ultima interogare" — ziua și „de când"',
  /' \+ ziuaTransmisiei\(data\.timestamp\) \+ '<\/div>/.test(html) && /">Ultima interogare · ' \+ candATransmis\(data\.timestamp\) \+ '<\/div>/.test(html));

// ─── 3. Nicio oră a transmisiei nu mai ajunge neverificată în new Date ─────────────────────────────
console.log('\n3. Nicio oră a ultimei transmisii nu mai ajunge neverificată în new Date(...)');
// Fiecare timeAgoPhrase(new Date(X)) trebuie să aibă, pe același rând, „X ? " înainte (cum fac regula și lista
// de vehicule din Management, care scrie „niciodată").
const rele3 = [];
html.split('\n').forEach((l, i) => {
  const re = /timeAgoPhrase\(new Date\(([\w.]+)\)\)/g; let m;
  while ((m = re.exec(l))) { if (l.slice(0, m.index).indexOf(m[1] + ' ? ') < 0) rele3.push((i + 1) + ': ' + l.trim().slice(0, 110)); }
});
T('orice „acum …" are întâi verificarea că există o oră', rele3.length === 0, rele3.join(' | '));
const directe = html.match(/new Date\((?:d|data|device)\.timestamp\)\.toLocaleString\(/g) || [];
T('nicio zi a transmisiei scrisă direct din new Date(...timestamp)', directe.length === 0, directe.join(' | '));

console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
process.exit(rele ? 1 : 0);
