// Gardă pe catalogul de rapoarte: FIECARE raport trebuie să aibă descriere (se afișează în catalog și în
// panoul cascadă) și o iconiță PROPRIE în REP_ICONS (public/index.html). Fără asta, un raport nou apare
// cu iconița generică „fa-file-lines" și fără explicație — exact ce s-a întâmplat cu cele 8 rapoarte de
// senzori/CAN adăugate ulterior. Rulează fără server (doar citește sursele).
const fs = require('fs');
const path = require('path');
const reports = require('./reports.js');

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra !== undefined ? ' → ' + extra : '')); } };

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const m = html.match(/const REP_ICONS = \{([\s\S]*?)\};/);

console.log('\n— Catalog rapoarte: descrieri + iconițe —');
if (!m) {
  check('REP_ICONS găsit în public/index.html', false, 'blocul lipsește sau i s-a schimbat forma');
} else {
  const icons = {};
  m[1].replace(/([A-Za-z_][\w]*)\s*:\s*'([^']+)'/g, (_, k, v) => { icons[k] = v; return ''; });
  const types = Object.keys(reports.REPORTS);

  const noDesc = types.filter((t) => !String(reports.REPORTS[t].desc || '').trim());
  check(types.length + ' rapoarte, toate cu descriere', noDesc.length === 0, noDesc.join(', '));

  const noIcon = types.filter((t) => !icons[t]);
  check('toate au iconiță proprie în REP_ICONS', noIcon.length === 0, noIcon.join(', '));

  const byIcon = {};
  types.forEach((t) => { if (icons[t]) (byIcon[icons[t]] = byIcon[icons[t]] || []).push(t); });
  const shared = Object.entries(byIcon).filter(([, ks]) => ks.length > 1);
  check('nicio iconiță refolosită de două rapoarte', shared.length === 0, shared.map(([i, ks]) => i + ' ← ' + ks.join('+')).join('; '));

  const orphan = Object.keys(icons).filter((k) => !reports.REPORTS[k]);
  check('nicio iconiță orfană (raport șters din catalog)', orphan.length === 0, orphan.join(', '));

  const cats = new Set((reports.REPORT_CATEGORIES || []).map((c) => c.key));
  const badCat = types.filter((t) => !cats.has(reports.REPORTS[t].cat));
  check('toate rapoartele au o categorie validă', badCat.length === 0, badCat.join(', '));
}

console.log('\n=== catalog: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
