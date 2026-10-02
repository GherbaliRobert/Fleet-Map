// verify_insight_ghid.js — „Ghidul aplicației" (ramura din RA Insight + unealta `cauta_in_ghid`) spune pașii ADEVĂRAȚI.
//
//   node verify_insight_ghid.js
//
// De ce: RA Insight răspunde la „cum fac…?" DOAR din ghid, ca să nu inventeze meniuri. Un ghid rămas în urmă e la fel
// de rău ca un model care ghicește: omul caută un buton care nu există. Proba păzește:
//   1. fiecare nume citat în ghid („Adaugă șofer", „Programări"…) există azi pe ecran (pagina sau scripturile ei);
//      excepțiile sunt doar exemplele de întrebări (listate mai jos, cu motivul);
//   2. fiecare drum din „unde" (Meniu → Rapoarte, Management → Șoferi, Setări → Utilizatori) duce la rânduri care
//      există în meniu / în file;
//   3. căutarea găsește capitolul potrivit pentru întrebările obișnuite;
//   4. ghidul e gratuit de citit (ruta nu cere loc RA Insight) și e același pentru ecran și pentru RA Insight.
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('./insight_ghid');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const JS = fs.readdirSync(path.join(__dirname, 'public', 'js')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, 'public', 'js', f), 'utf8')).join('\n');
// Ce vede omul pe ecran: pagina, scripturile ei, plus textele pe care serverul le trimite gata scrise ecranului
// (întrebările gata făcute din AI Raport, numele rapoartelor din catalog).
const ECRAN = (PAG + '\n' + JS + '\n' + fs.readFileSync(path.join(__dirname, 'ai_raport.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8'))
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const pe = (t) => ECRAN.indexOf(t) >= 0;
const SECT = G.publice();

// ─── 1. Numele citate ───────────────────────────────────────────────────────────────────────────────
console.log('1. Fiecare nume citat în ghid există pe ecran');
// Exemple de întrebări (ce scrie omul), nu nume de butoane — și un text cu cifra pusă de aplicație.
const EXEMPLE = {
  'consumul lui B 154 UIP luna trecută': 'exemplu de întrebare scrisă de om',
  'și august?': 'exemplu de continuare scrisă de om',
  'dar B 155 UIP?': 'exemplu de continuare scrisă de om',
  'mai are N zile': 'textul are cifra pusă de aplicație (\'mai are \' + zile)',
};
const citate = [];
SECT.forEach((s) => {
  const txt = [s.unde].concat(s.pasi).concat([s.detalii || '']).join('\n');
  const re = /„([^"”\n]{1,80})["”]/g; let m;
  while ((m = re.exec(txt))) citate.push({ cheie: s.cheie, t: m[1].replace(/\s+/g, ' ').trim().replace(/…$/, '') });
});
const lipsa = citate.filter((c) => !EXEMPLE[c.t] && !pe(c.t));
T('ghidul citează peste 100 de nume de pe ecran', citate.length > 100, citate.length);
T('toate există pe ecran, exact așa (afară de exemplele de întrebări)', lipsa.length === 0, lipsa.map((c) => c.cheie + ': „' + c.t + '"').join(' | '));
T('excepțiile chiar apar în ghid (lista nu putrezește)', Object.keys(EXEMPLE).every((e) => citate.some((c) => c.t === e)), Object.keys(EXEMPLE).filter((e) => !citate.some((c) => c.t === e)).join(' | '));
T('„mai are N zile": aplicația chiar scrie zilele rămase așa', /'mai are ' \+/.test(PAG));

// ─── 2. Drumurile din „unde" ────────────────────────────────────────────────────────────────────────
console.log('\n2. Fiecare „unde" duce la rânduri care există');
const drumuri = [];
SECT.forEach((s) => {
  String(s.unde).split(';').forEach((bucata) => {
    // „mașina se alege în Management → Vehicule": drumul pornește de la ultimul loc de pornire din prima bucată.
    const pasi = bucata.replace(/\([^)]*\)/g, '').split('→').map((x) => x.replace(/[„"”]/g, '').replace(/^\s*(fila|butonul)\s+/i, '').trim()).filter(Boolean);
    if (pasi.length) { const m0 = pasi[0].match(/(Meniu|Management|Setări)\s*$/); if (m0) pasi[0] = m0[1]; }
    if (pasi.length >= 2) drumuri.push({ cheie: s.cheie, pasi });
  });
});
// Primul pas e locul de pornire: meniul din stânga, Management sau Setări — trebuie să existe și el ca rând.
const START = { 'Meniu': null, 'Management': 'Management', 'Setări': 'Setări' };
const rau = [];
drumuri.forEach((d) => {
  if (!(d.pasi[0] in START)) rau.push(d.cheie + ': nu pornește din Meniu / Management / Setări (' + d.pasi[0] + ')');
  if (START[d.pasi[0]] && !pe(START[d.pasi[0]])) rau.push(d.cheie + ': „' + d.pasi[0] + '" lipsește');
  d.pasi.slice(1).forEach((p) => { if (!pe(p)) rau.push(d.cheie + ': „' + p + '"'); });
});
T('ghidul are drumuri pentru aproape toate capitolele', drumuri.length >= SECT.length - 3, drumuri.length + ' din ' + SECT.length);
T('toate rândurile din drumuri există în meniu / în file', rau.length === 0, rau.join(' | '));

// ─── 3. Căutarea ────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Căutarea găsește capitolul potrivit');
const CAZURI = [
  ['cum adaug un șofer nou?', 'soferi'],
  ['cum programez un raport să vină singur pe email?', 'programate'],
  ['unde văd pe unde a fost mașina ieri?', 'traseu'],
  ['cum descarc un raport în excel?', 'rapoarte'],
  ['cum pun ITP-ul și RCA-ul?', 'documente'],
  ['cum fac o alertă de viteză?', 'alerte'],
  ['cum adaug un coleg în aplicație?', 'utilizatori'],
  ['cum schimb tema aplicației?', 'preferinte'],
  ['cum pun prețul motorinei?', 'combustibil'],
  ['unde găsesc facturile?', 'facturi'],
  ['am o problemă, cu cine vorbesc?', 'suport'],
];
CAZURI.forEach(([q, k]) => {
  const g = G.cauta(q, 3);
  T('„' + q + '" → ' + k, g.length && g[0].cheie === k, g.map((x) => x.cheie).join(','));
});
T('o întrebare fără legătură nu primește un capitol la întâmplare', G.cauta('care e capitala Franței', 3).length === 0, G.cauta('care e capitala Franței', 3).map((x) => x.cheie).join(','));

// ─── 4. Gratuit și același peste tot ───────────────────────────────────────────────────────────────
console.log('\n4. Ghidul: gratuit de citit, același pentru ecran și pentru RA Insight');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
T('ruta ghidului cere doar să fii autentificat (nu loc RA Insight, nu fond)', /app\.get\('\/api\/insight\/ghid', requireAuth, \(req, res\) => \{\s*res\.json\(\{ sectiuni: insightGhid\.publice\(\) \}\);/.test(SRV));
T('unealta lui RA Insight caută în ACELAȘI ghid', /const gasite = insightGhid\.cauta\(/.test(SRV) && (SRV.match(/require\('\.\/insight_ghid'\)/g) || []).length === 1);
T('ecranul ghidului citește ruta (nu are o copie a textelor)', /\/api\/insight\/ghid/.test(PAG) && PAG.indexOf('Un șofer nou și mașina lui') < 0);
T('fiecare capitol are titlu, loc, cel puțin doi pași și cuvinte de căutare', SECT.every((s) => s.titlu && s.unde && s.pasi.length >= 2) && G.SECTIUNI.every((s) => (s.cuvinte || []).length >= 3));

console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
process.exit(rele ? 1 : 0);
