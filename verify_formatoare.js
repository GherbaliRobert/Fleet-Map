// verify_formatoare.js — un formatator de dată pe proces, NU unul la fiecare poziție.
//
//   node verify_formatoare.js
//
// Găsit pe 21.10, când Robert a întrebat de ce plătim 18 $ pe lună la Railway cu 3 mașini: `_dayKeyISO` (reports.js)
// făcea un `new Intl.DateTimeFormat(...)` la FIECARE poziție. Un formatator ține ~17 KB pe care procesul nu-i mai dă
// înapoi: „Condus & repaus" pe o lună, 3 mașini, dura 28 s și lăsa ~6 GB ocupați (Situație zilnică: 22 s). Cu UN
// formatator ținut minte: 1,5 s și ~200 MB, rezultatele identice octet cu octet. Robert: „rezolvă acum".
// Același lucru făcea programul de lucru (workschedule.js), la fiecare poziție a unei mașini în mers.
//
// Ce păzește proba:
//   1. locurile din cod care fac formatatoare sunt NUMĂRATE — un loc nou trebuie privit: rulează pe fiecare poziție?
//   2. ziua din rapoarte (`_dayKeyISO`), decupată din reports.js și rulată: un singur formatator, aceleași zile;
//   3. programul de lucru (`isWithin`), rulat: o pereche de formatatoare pe fus, aceleași răspunsuri ca un formatator
//      nou la fiecare apel; un fus greșit tot nu blochează și nu se ține minte.
//
// Se numără CREĂRILE (deterministic), nu memoria — memoria depinde de sistem. Codul se decupează din sursă, nu se copiază.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const P = (f) => path.join(__dirname, f);
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// Un Intl în care fiecare `new DateTimeFormat` se numără. Restul e Intl-ul adevărat.
function intlNumarat() {
  const c = { n: 0 };
  const DTF = function (loc, opt) { const f = new Intl.DateTimeFormat(loc, opt); c.n++; return f; };   // doar cele făcute
  return { c, Intl: Object.assign(Object.create(Intl), { DateTimeFormat: DTF }) };
}

sect('1. Unde se fac formatatoare de dată (numărate)');
// Un formatator făcut o dată (la încărcare, ținut minte) e în regulă; unul făcut la fiecare apel e în regulă DOAR dacă
// funcția nu rulează pe fiecare poziție sau rând. Schimbi un număr de aici → te uiți întâi de unde e chemat locul.
const CUNOSCUTE = {
  'ai_raport.js': 1, 'backup.js': 1, 'cereri_echipa.js': 1, 'condus.js': 1, 'efactura.js': 1, 'insight.js': 1, 'locatie_distribuita.js': 1, 'mail_primit.js': 1, 'pachete.js': 2,
  'probleme.js': 1, 'programari.js': 3, 'ramuri.js': 1, 'report_export.js': 4, 'report_schedules.js': 3, 'reports.js': 2, 'sursa_externa.js': 2, 'workschedule.js': 2,
};
const gasite = {};
fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && !/^(verify_|test_|ci-smoke)|_smoke\.js$/.test(f)).forEach((f) => {
  const n = (fs.readFileSync(P(f), 'utf8').match(/new Intl\.DateTimeFormat\(/g) || []).length;
  if (n) gasite[f] = n;
});
const toate = [...new Set([...Object.keys(CUNOSCUTE), ...Object.keys(gasite)])].sort();
const altfel = toate.filter((f) => (CUNOSCUTE[f] || 0) !== (gasite[f] || 0));
T('locurile care fac formatatoare sunt cele știute', altfel.length === 0,
  altfel.map((f) => f + ': ' + (CUNOSCUTE[f] || 0) + ' → ' + (gasite[f] || 0)).join(', ') +
  ' — rulează locul nou pe fiecare poziție sau rând? Atunci ține formatatorul minte (ca _dayKeyISO), apoi pune cifra aici.');

sect('2. Ziua din rapoarte (_dayKeyISO): un singur formatator, aceleași zile');
const rap = fs.readFileSync(P('reports.js'), 'utf8');
const rand = (s, a) => { const i = s.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a); return s.slice(i, s.indexOf('\n', i)); };
// Fără formatatorul ținut minte (forma veche) proba merge mai departe și pică la numărătoare, cu cifra pe față.
const cod = (rap.indexOf('let _fmtZiISO') >= 0 ? rand(rap, 'let _fmtZiISO') : '') + '\n' + rand(rap, 'function _dayKeyISO(ts)');
const DISPLAY_TZ = 'Europe/Bucharest';
const { c: cZi, Intl: intlZi } = intlNumarat();
const zi = vm.runInNewContext(cod + '\n_dayKeyISO', { Intl: intlZi, Date, DISPLAY_TZ });
const ref = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ });
// Momentele grele: miezul nopții pe ora României și trecerile la ora de vară / de iarnă.
const momente = ['2026-10-24T20:59:59Z', '2026-10-24T21:00:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z',
  '2026-10-25T21:59:59Z', '2026-10-25T22:00:00Z', '2026-03-28T21:59:59Z', '2026-03-28T22:00:00Z', '2026-03-29T00:59:00Z',
  '2026-03-29T01:00:00Z', '2026-12-31T21:59:59Z', '2026-12-31T22:00:00Z'];
for (let i = 0; i < 2000; i++) momente.push(new Date(Date.UTC(2026, 0, 1) + i * 4321987).toISOString());
const diferite = momente.filter((m) => zi(m) !== ref.format(new Date(m)));
T('aceleași zile ca un formatator nou (' + momente.length + ' de momente, cu trecerile de oră)', diferite.length === 0, diferite.slice(0, 3).join(', '));
T('și cu milisecunde, nu doar cu text', zi(Date.UTC(2026, 9, 24, 21, 0)) === '2026-10-25');
T('o dată stricată dă tot gol, ca înainte', zi('nu e dată') === '' && zi(NaN) === '');
T('un SINGUR formatator pentru toate apelurile', cZi.n === 1, cZi.n + ' formatatoare');
// Martorul: forma de dinainte de 21.10 face câte unul la fiecare apel — numărătoarea chiar vede problema.
const { c: cVechi, Intl: intlVechi } = intlNumarat();
const vechi = vm.runInNewContext("(function (ts) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date(ts)); } catch (e) { return ''; } })",
  { Intl: intlVechi, Date, DISPLAY_TZ });
for (let i = 0; i < 500; i++) vechi(momente[i]);
T('martor: forma veche făcea un formatator la fiecare apel', cVechi.n === 500, cVechi.n);
// Locurile care merg poziție cu poziție chiar folosesc funcția (nu și-au scris altă socoteală a zilei).
T('rapoartele poziție cu poziție cer ziua prin _dayKeyISO', (rap.match(/_dayKeyISO\(/g) || []).length >= 15);

sect('3. Programul de lucru (isWithin): o pereche de formatatoare pe fus, aceleași răspunsuri');
// Fișierul se rulează ca script: funcțiile lui sunt atunci pe obiectul global al contextului, deci `_formatatoare` se
// poate înlocui cu forma veche (formatatoare noi la fiecare apel) — referința cu care se compară răspunsurile.
const ws = fs.readFileSync(P('workschedule.js'), 'utf8');
const incarca = () => {
  const n = intlNumarat();
  const ctx = { Intl: n.Intl, Date, module: { exports: {} }, parseInt, Math, Array, String, Map };
  vm.runInNewContext(ws, ctx);
  return { ctx, c: n.c, ws: ctx.module.exports };
};
const NOU = incarca(), REF = incarca();
REF.ctx._formatatoare = function (tz) {
  return { ora: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    zi: new Intl.DateTimeFormat('en-CA', { timeZone: tz }) };
};
const program = (tz) => NOU.ws.sanitize({ enabled: true, tz, tolerance_min: 10,
  days: { mon: [{ from: '08:00', to: '12:00' }, { from: '13:00', to: '17:00' }], tue: [{ from: '08:00', to: '17:00' }],
    wed: [{ from: '06:30', to: '22:15' }], thu: [{ from: '00:00', to: '23:59' }], fri: [{ from: '08:00', to: '16:00' }], sat: [], sun: [] },
  holidays: ['2026-10-26', '2026-12-25'] });
const programe = [program('Europe/Bucharest'), program('Europe/London'), program('America/New_York')];
let difWs = 0, adevarate = 0, total = 0;
programe.forEach((s) => {
  for (let i = 0; i < 3000; i++) {
    const ms = Date.UTC(2026, 9, 19) + i * 487123;   // ~17 zile, cu trecerea la ora de iarnă și sărbătoarea din 26.10
    const a = NOU.ws.isWithin(s, ms), b = REF.ws.isWithin(s, ms);
    total++; if (a !== b) difWs++; if (a) adevarate++;
  }
});
T('aceleași răspunsuri ca un formatator nou la fiecare apel (' + total + ' de momente, 3 fusuri)', difWs === 0, difWs + ' diferite');
T('proba chiar are și „în program", și „în afara"', adevarate > 0 && adevarate < total, adevarate + ' din ' + total);
T('o pereche de formatatoare pe fus (3 fusuri → 6), nu una la fiecare apel', NOU.c.n === 6, NOU.c.n + ' formatatoare');
const stricat = NOU.ws.sanitize({ enabled: true, tz: 'Nu/Exista', days: { mon: [{ from: '08:00', to: '09:00' }] } });
T('un fus greșit nu blochează (în program, ca înainte)', NOU.ws.isWithin(stricat, Date.now()) === true && NOU.ws.isWithin(stricat, Date.now()) === true);
let tinute = null;
try { tinute = vm.runInContext('[_fmtPeFus.has("Nu/Exista"), _fmtPeFus.size]', NOU.ctx); } catch (e) { /* forma veche: nu ține nimic minte */ }
T('un fus greșit nu se ține minte (se țin doar cele 3 bune)', !!tinute && tinute[0] === false && tinute[1] === 3, JSON.stringify(tinute));

console.log('\n' + (rele ? '✗ ' + rele + ' picate, ' + ok + ' trecute' : '✓ toate ' + ok + ' trecute'));
process.exit(rele ? 1 : 0);
