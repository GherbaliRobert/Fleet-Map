// verify_follow.js — matematica ecranului „Merg după el".
//
// Ecranul arată trei lucruri: cât mai e până la mașină, încotro e, și dacă te apropii. Toate trei
// ies din două funcții (distanță + direcție). Dacă ele greșesc, ecranul minte cu încredere — iar
// omul care se uită la el CONDUCE. De aceea sunt verificate pe cazuri cu răspuns cunoscut dinainte.
//
// Funcțiile se EXTRAG din FollowScreen.tsx, nu se copiază: dacă cineva le schimbă acolo, testul
// vede noua versiune, nu una veche care ar trece degeaba.
const fs = require('fs'), path = require('path');

const SRC = path.join(__dirname, 'mobile', 'src', 'screens', 'FollowScreen.tsx');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// Extrage o funcție după acolade echilibrate și curăță adnotările de tip DOAR din lista de parametri
// (corpul rămâne neatins — altfel se strică obiectele returnate).
function extrage(nume) {
  const i = src.indexOf('function ' + nume + '(');
  if (i < 0) throw new Error('Funcția „' + nume + '" nu mai există în FollowScreen.tsx — a fost redenumită?');
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { j = k; break; } }
  }
  const cod = src.slice(i, j + 1);
  const p0 = cod.indexOf('('), p1 = cod.indexOf(')');
  const par = cod.slice(p0 + 1, p1).replace(/:\s*[A-Za-z<>\[\]|\s]+/g, '');
  return cod.slice(0, p0 + 1) + par + cod.slice(p1);
}

const F = new Function(
  ['distantaM', 'directie', 'distText', 'vechime'].map(extrage).join('\n')
  + '; return { distantaM, directie, distText, vechime };'
)();

let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

console.log('\n══ „Merg după el": distanța, direcția, formatarea ══\n');

// ── Distanța, pe repere reale ──
const dTA = F.distantaM(45.7489, 21.2087, 46.1866, 21.3123);   // Timișoara → Arad
t('Timișoara→Arad ≈ 50 km în linie dreaptă', Math.abs(dTA / 1000 - 49.5) < 3, (dTA / 1000).toFixed(1) + ' km');
t('același punct → exact 0', F.distantaM(45, 21, 45, 21) === 0);
// Un grad de latitudine = ~111 km, oriunde pe glob.
t('1° latitudine ≈ 111 km', Math.abs(F.distantaM(45, 21, 46, 21) / 1000 - 111.2) < 1, (F.distantaM(45, 21, 46, 21) / 1000).toFixed(1) + ' km');
// Distanță de trafic: 500 m
t('500 m se măsoară corect', Math.abs(F.distantaM(45.7489, 21.2087, 45.7534, 21.2087) - 500) < 12);

// ── Direcția: cele patru puncte cardinale ──
t('spre NORD → 0°', F.directie(45, 21, 46, 21) < 0.5 || F.directie(45, 21, 46, 21) > 359.5, F.directie(45, 21, 46, 21).toFixed(1));
t('spre EST → 90°', Math.abs(F.directie(45, 21, 45, 22) - 90) < 1, F.directie(45, 21, 45, 22).toFixed(1));
t('spre SUD → 180°', Math.abs(F.directie(45, 21, 44, 21) - 180) < 1, F.directie(45, 21, 44, 21).toFixed(1));
t('spre VEST → 270°', Math.abs(F.directie(45, 21, 45, 20) - 270) < 1, F.directie(45, 21, 45, 20).toFixed(1));
t('direcția e mereu între 0 și 360', [[46, 22], [44, 20], [46, 20], [44, 22]].every(([la, lo]) => { const a = F.directie(45, 21, la, lo); return a >= 0 && a < 360; }));

// ── Formatarea: ce se citește dintr-o privire, la volan ──
t('sub 1 km → metri, rotunjit la 10', F.distText(487).u === 'm' && Number(F.distText(487).v) % 10 === 0, F.distText(487).v + ' ' + F.distText(487).u);
t('999 m rămâne în metri', F.distText(999).u === 'm');
t('2340 m → „2.3 km"', F.distText(2340).u === 'km' && F.distText(2340).v === '2.3', F.distText(2340).v);
t('peste 10 km → fără zecimale', F.distText(23400).v === '23', F.distText(23400).v);

// ── Vechimea informației: un ecran care arată „acum" de trei minute e mai rău decât unul gol ──
t('sub 15 s → „acum"', F.vechime(9000) === 'acum', F.vechime(9000));
t('40 s → „acum 40 s"', F.vechime(40000) === 'acum 40 s', F.vechime(40000));
t('3 min → „acum 3 min"', F.vechime(180000) === 'acum 3 min', F.vechime(180000));
t('timp negativ (ceas nesincronizat) nu produce aiureli', F.vechime(-5000) === 'acum', F.vechime(-5000));

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
