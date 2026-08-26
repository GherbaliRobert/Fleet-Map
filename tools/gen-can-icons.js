#!/usr/bin/env node
// tools/gen-can-icons.js — scoate desenele iconițelor din aplicația de telefon și le pune într-un
// fișier pe care îl citește și serverul, ca web-ul să deseneze EXACT aceleași pictograme.
//
// De ce. Plăcuțele de stare (uși, lumini, martori de bord) arătau diferit în cele două locuri: pe
// telefon desene SVG proprii, pe web iconițe Font Awesome. Aceeași mașină, alt desen — și pe web
// patru uși diferite primeau aceeași iconiță, fiindcă Font Awesome n-are una pentru fiecare ușă.
//
// Sursa AUTORULUI rămâne una singură: mobile/src/components/Icon.tsx. De acolo se generează
// can_icons.js. NU edita can_icons.js de mână — se rescrie la următoarea rulare.
//
//   node tools/gen-can-icons.js          scrie can_icons.js
//   node tools/gen-can-icons.js --check  doar verifică dacă e la zi (folosit în CI)

const fs = require('fs');
const path = require('path');

const RADACINA = path.join(__dirname, '..');
const SURSA = path.join(RADACINA, 'mobile', 'src', 'components', 'Icon.tsx');
const IESIRE = path.join(RADACINA, 'can_icons.js');

function citesteDesene() {
  const src = fs.readFileSync(SURSA, 'utf8');
  const m = src.match(/const P: Record<IconName, string> = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('nu găsesc harta de iconițe în ' + SURSA);
  const icoane = {};
  const rx = /^  ([a-zA-Z][a-zA-Z0-9]*): '((?:[^'\\]|\\.)*)',$/gm;
  let g;
  while ((g = rx.exec(m[1]))) icoane[g[1]] = g[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  if (!Object.keys(icoane).length) throw new Error('n-am extras nicio iconiță');
  return icoane;
}

function construieste(icoane) {
  const antet = [
    '// can_icons.js — GENERAT de tools/gen-can-icons.js. NU edita de mână.',
    '//',
    '// Desenele pictogramelor de stare (uși, lumini, martori de bord), scoase din',
    '// mobile/src/components/Icon.tsx ca web-ul să deseneze exact aceleași iconițe ca telefonul.',
    '// Conținutul e corpul unui <svg viewBox="0 0 24 24"> desenat cu contur, nu umplut.',
    '//',
    '// Ca să schimbi un desen: schimbă-l în Icon.tsx, apoi rulează `node tools/gen-can-icons.js`.',
    '',
    'const ICOANE = {',
  ];
  const randuri = Object.keys(icoane).map(n => "  " + n + ": '" + icoane[n].replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',");
  const subsol = [
    '};',
    '',
    '// Un <svg> gata de pus în pagină. `cls` intră pe element, ca să-i putem da dimensiune din CSS.',
    'function svg(nume, cls) {',
    '  const d = ICOANE[nume];',
    '  if (!d) return \'\';',
    '  return \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" \' +',
    '    \'stroke-linecap="round" stroke-linejoin="round"\' + (cls ? \' class="\' + cls + \'"\' : \'\') + \'>\' + d + \'</svg>\';',
    '}',
    '',
    'module.exports = { ICOANE, svg };',
    '',
  ];
  return antet.concat(randuri, subsol).join('\r\n');
}

const continut = construieste(citesteDesene());
const verifica = process.argv.includes('--check');

if (verifica) {
  const vechi = fs.existsSync(IESIRE) ? fs.readFileSync(IESIRE, 'utf8') : '';
  if (vechi !== continut) {
    console.error('can_icons.js NU e la zi cu Icon.tsx — rulează: node tools/gen-can-icons.js');
    process.exit(1);
  }
  console.log('can_icons.js e la zi (' + Object.keys(citesteDesene()).length + ' iconițe)');
} else {
  fs.writeFileSync(IESIRE, continut);
  console.log('scris can_icons.js — ' + Object.keys(citesteDesene()).length + ' iconițe');
}
