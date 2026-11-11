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
// Din 22.10 (pasul 2) și textele cartonașului de șofer („Da, trece-l") și rândurile din „Azi la tine" („Propunere"), scrise de server;
// tot din 22.10, textele cererilor către noi („Echipa RA Track se ocupă · cererea nr. …"), din cereri_echipa.js.
// Din 23.10 (pasul 2, partea 2) și textele cartonașelor de alertă și de discuție („Da, pune alerta", „Da, notează"), din propuneri.js;
// din 26.10 (partea 3) și ale reviziei, actului și raportului programat („Da, programează", „Da, trec actul"), din programari.js.
// Din 28.10 și numele butonului „Sursă externă" și titlul surselor de sub răspuns („Surse de pe internet"), din sursa_externa.js.
const ECRAN = (PAG + '\n' + JS + '\n' + ['ai_raport.js', 'reports.js', 'soferi_masini.js', 'azi_la_tine.js', 'cereri_echipa.js', 'propuneri.js', 'programari.js', 'sursa_externa.js', 'condus.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n'))
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const pe = (t) => ECRAN.indexOf(t) >= 0;
const SECT = G.publice();

// ─── 1. Numele citate ───────────────────────────────────────────────────────────────────────────────
console.log('1. Fiecare nume citat în ghid există pe ecran');
// Exemple de întrebări (ce scrie omul), nu nume de butoane — și un text cu cifra pusă de aplicație.
const EXEMPLE = {
  // Din 15.10 fila „AI Raport" a ieșit din Rapoarte (exemplele ei au plecat cu ea); rapoartele se cer în cuvinte din RA Insight.
  'fă-mi foaia de parcurs pentru B 154 UIP, săptămâna trecută': 'exemplu de cerere de raport scrisă de om',
  // Partea 3 (26.10): exemple de ce scrie omul ca să programeze revizia, actul, raportul.
  'Programează revizia la Caddy și trimite-mi în fiecare luni raportul de consum': 'exemplu de cerere scrisă de om (macheta M6)',
  'Am făcut ITP la Caddy, expiră pe 26.10.2027': 'exemplu de cerere scrisă de om',
  // Până pe 15.10 le scria și salutul bulei din colț (care nu mai are un chat al ei); în ghid sunt exemple de ce scrie omul.
  'și săptămâna dinainte?': 'exemplu de continuare scrisă de om',
  'câți km azi': 'exemplu de întrebare scrisă de om (răspunsul rapid)',
  'mai are N zile': 'textul are cifra pusă de aplicație (\'mai are \' + zile)',
  'Pune-l pe Mihai Ionescu pe B 77 TIR': 'exemplu de cerere scrisă de om (pasul 2, șoferii pe mașini)',
  'Anunță-mă când Loganul trece de 130 km/h': 'exemplu de cerere scrisă de om (pasul 2, partea 2: alerta)',
  'Notează că am vorbit cu Ion Popescu despre viteză': 'exemplu de cerere scrisă de om (pasul 2, partea 2: „Am vorbit cu el")',
  // Fișa lui RA Insight despre fiecare om (11.11): ce scrie omul în discuție și un nume pe care îl dă el unei mașini.
  'Loganul': 'exemplu de nume dat de om unei mașini (fișa)',
  'ce știi despre mine?': 'exemplu de întrebare scrisă de om (fișa)',
  'uită că ': 'începutul unei cereri scrise de om („uită că …", fișa)',
  'uită că Loganul e B 204 UIP': 'exemplu de cerere scrisă de om (fișa)',
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
  ['o mașină nu transmite, pe cine anunț?', 'suport'],
  ['unde văd cererile mele către echipa RA Track?', 'suport'],
  ['ce înseamnă potrivirea șoferilor pe mașini?', 'soferi_masini'],
  ['unde văd ce mașini au permis nepotrivit?', 'soferi_masini'],
  ['cum notez că am vorbit cu un șofer?', 'alerta_discutie'],
  ['cum pun o alertă din discuție?', 'alerta_discutie'],
  ['poate RA Insight să caute pe internet?', 'sursa_externa'],
  ['ce e sursa externă?', 'sursa_externa'],
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

// ─── 5. Cuvintele noastre nu ajung la client ───────────────────────────────────────────────────────
// Alin, 11.11: „să nu fi scăpat ceva cu tokeni, fără tokeni, gratuit, nu consumă… ghidul să nu ne facă pe noi fondatorii de râs".
// Ce se scade din pachet se spune O dată, pe față, în capitolul RA Insight; în rest: „inclus în pachet", nu „nu se numără".
console.log('\n5. Fără cuvintele noastre („gratuit", „tokeni", „fondul", „nu se numără"…) în ce vede clientul');
const INTERZISE = [/gratuit/i, /gratis/i, /token/i, /nu se num[aă]r/i, /nu se scad/i, /\bfond(ul|ului)?\b/i, /f[aă]r[aă] AI\b/i, /se consume|nu consum/i,
  /\badminul\b/i, /\bmov\b/i, /Haiku|Sonnet|Anthropic|model de limbaj/i, /\bcache\b/i, /pe reguli/i];
const vazute = [];
SECT.forEach((s) => {
  [s.titlu, s.unde].concat(s.pasi).concat([s.detalii || '']).forEach((t) => {
    INTERZISE.forEach((re) => { const m = String(t).match(re); if (m) vazute.push(s.cheie + ': „' + m[0] + '"'); });
  });
});
T('ghidul (titluri, drumuri, pași, amănunte) nu are niciunul dintre cuvintele noastre', vazute.length === 0, vazute.join(' | '));
const REGULA_PACHET = 'Din pachet se scad doar răspunsurile ANALIZĂ; restul e inclus.';
const cuRegula = SECT.filter((s) => [s.unde].concat(s.pasi).concat([s.detalii || '']).join(' ').indexOf(REGULA_PACHET) >= 0).map((s) => s.cheie);
T('ce se scade din pachet se spune o singură dată, în capitolul RA Insight', cuRegula.length === 1 && cuRegula[0] === 'ra_insight', cuRegula.join(','));
T('eticheta ANALIZĂ nu mai e numită „mov" (din 05.11 e în negrul siglei)', SECT.every((s) => !/mov/i.test(s.detalii || '')));
T('capătul lunii: RA Insight răspunde pe loc până pe 1 (nu „se oprește")', /până pe 1 RA Insight răspunde doar pe loc/.test(G.SECTIUNI.find((s) => s.cheie === 'ra_insight').detalii) && SECT.every((s) => !/se oprește până pe 1/.test(s.detalii || '')));
T('fișa: de la pachetul Basic (pe Start RA Insight nu-și face fișă)', /^De la pachetul Basic/.test(G.SECTIUNI.find((s) => s.cheie === 'fisa_insight').pasi[0]));
// Aceleași cuvinte, scoase și de pe ecranele din jurul lui RA Insight, din telefon și de pe hârtiile ofertei / contractului (11.11).
const SCOASE = [
  // (pe ecranele noastre — RA Insight · control — „fondul” rămâne: acolo e vorba între noi)
  ['public/index.html', ['text din PDF, gratuit', "'citire AI'", '(se numără din fondul de întrebări)', 'Fondul lunii s-a terminat: oprit până pe', '„Motorina e 7,30 lei.”']],
  ['mobile/src/components/ActeVehicul.tsx', ['text din PDF, gratuit', "'citire AI'"]],
  ['mobile/src/lib/insight.ts', ['Fondul lunii s-a terminat: oprit până pe']],
  ['mobile/src/screens/Insight.tsx', ['„Motorina e 7,30 lei.”']],
  ['server.js', ['Întrebările rapide rămân gratuite', 'Fondul de întrebări al lunii', 'Nu am putut verifica fondul de întrebări']],
  ['report_export.js', ['Când fondul de întrebări']],
  ['contract_pdf.js', ['într-un fond comun', 'la epuizarea fondului']],
];
const ramase = [];
SCOASE.forEach(([f, texte]) => { const c = fs.readFileSync(path.join(__dirname, f), 'utf8'); texte.forEach((t) => { if (c.indexOf(t) >= 0) ramase.push(f + ': „' + t + '"'); }); });
T('ecranele, telefonul și hârtiile nu mai spun „gratuit" / „fondul de întrebări" / exemplul cu motorina', ramase.length === 0, ramase.join(' | '));

console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
process.exit(rele ? 1 : 0);
