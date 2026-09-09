// verify_companii.js — ecranul „Companii & Dispozitive", verticala fondatorilor.
//
//   node verify_companii.js
//
// Ecranul ăsta e cheia platformei: de aici se deschid firme, se dau drepturi, se adoptă aparatele
// care au început să transmită și se mută vehicule/oameni dintr-o firmă în alta. Trei lucruri nu au
// voie să se strice tăcut:
//   • să ajungă sub ochii cuiva care nu e fondator — pe server FIECARE cale de companie cere
//     dreptul `manageCompanies`, pe care îl are doar super-adminul (proba 1);
//   • starea accesului să se afișeze greșit: „expirat" citit ca „activ" înseamnă un client care
//     folosește platforma neplătit, sau unul plătitor blocat degeaba (proba 2);
//   • listele să-și piardă forma. Rândurile din „Vehicule neasignate" și „Mută între companii"
//     apăreau scrise italic și centrate fiindcă purtau `rax-co-meta` — clasa mesajului de listă
//     GOALĂ — pe containerul întreg. Proba 3 nu mai lasă clasa aia pe containere.
//
// Codul nu se copiază aici: se decupează din public/index.html și se execută.

const fs = require('fs');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

sect('1. Companiile sunt strict ale fondatorilor');
// Pe server: fiecare rută de companie cu :id (sau lista) cere manageCompanies. Excepția e
// /api/companies/me/… — alea sunt reglajele PROPRIEI firme, pentru administratorul clientului.
const RUTE = [...server.matchAll(/app\.(get|post|put|delete|patch)\('(\/api\/companies[^']*)'([^\n]*)/g)]
  .map(m => ({ verb: m[1], cale: m[2], rest: m[3] }));
T('găsesc rutele de companii în server', RUTE.length >= 10, RUTE.length + ' rute');
const alePlatformei = RUTE.filter(r => !r.cale.startsWith('/api/companies/me'));
const scapate = alePlatformei.filter(r => !/requireSuperadmin/.test(r.rest));
T('fiecare rută de companie a platformei cere requireSuperadmin',
  scapate.length === 0, scapate.map(r => r.verb.toUpperCase() + ' ' + r.cale).join(', '));
const aleClientului = RUTE.filter(r => r.cale.startsWith('/api/companies/me'));
T('rutele „me" (firma proprie a clientului) NU cer super-admin, ci manageUsers',
  aleClientului.length > 0 && aleClientului.every(r => /requirePerm\('manageUsers'\)/.test(r.rest)),
  aleClientului.map(r => r.cale).join(', '));

// Dreptul în sine: doar super-adminul îl are. Dacă ajunge pe alt rol, tot ecranul se deschide altcuiva.
const rolCu = [...server.matchAll(/^\s{2}([a-z_]+):\s*\{([^}]*)\}/gm)]
  .filter(m => /manageCompanies:\s*true/.test(m[2])).map(m => m[1]);
T('manageCompanies e doar pe superadmin', rolCu.length === 1 && rolCu[0] === 'superadmin', rolCu.join(', '));

// În interfață: fila se refuză singură dacă nu ai dreptul (nu se bazează doar pe meniu).
T('fila „companies" din panou verifică dreptul înainte să se deschidă',
  /name === 'companies' \|\| name === 'accounts'[^)]*\) && !can\('manageCompanies'\)/.test(html));
T('și butonul din meniu verifică același drept',
  /function goSistem\(tab\) \{ if \(\(tab === 'companies'[^)]*\) && !can\('manageCompanies'\)\) return;/.test(html));

sect('2. Starea accesului se citește corect');
const a1 = html.indexOf('    function _raxAccessCell(c) {');
const a2 = html.indexOf('\n    }', a1) + 6;
T('găsesc funcția care desenează starea', a1 > 0, 'a1=' + a1);
if (a1 > 0) {
  const cel = new Function(html.slice(a1, a2) + '\n; return _raxAccessCell;')();
  const stare = (s, until) => cel({ access: { status: s, access_until: until } });
  // De la 09.09, un client oprit se vede ca SUSPENDAT, cu motivul (abonament / neplată / oprit de
  // noi) — trei cauze care se rezolvă altfel. Roșul rămâne, cuvântul „expirat" nu mai spunea tot.
  T('un client oprit iese roșu', /raco-pill bad/.test(stare('expired')), stare('expired'));
  T('și scrie că e SUSPENDAT, cu motivul', /suspendat/.test(stare('expired')), stare('expired'));
  T('„grație" iese portocaliu (pastila warn)', /raco-pill warn/.test(stare('grace')), stare('grace'));
  T('„activ" iese verde (pastila ok)', /raco-pill ok/.test(stare('active')), stare('active'));
  T('„nelimitat" rămâne neutru', /class="raco-pill "/.test(stare('unlimited')), stare('unlimited'));
  T('o stare necunoscută NU se dă drept activă', !/raco-pill ok/.test(stare('habarnam')), stare('habarnam'));
  T('data până când e valabil apare când există', /până /.test(stare('active', Date.parse('2026-07-10'))), stare('active', Date.parse('2026-07-10')));
  T('și lipsește când nu există', !/până /.test(stare('active')), stare('active'));
  // Fiecare stare pe care o poate trimite serverul trebuie să aibă pastila ei.
  const dinServer = [...server.matchAll(/status\s*[:=]\s*'(unlimited|active|grace|expired)'/g)].map(m => m[1]);
  const unice = [...new Set(dinServer)];
  T('serverul chiar trimite stările astea', unice.length >= 3, unice.join(', '));
  unice.forEach(s => T('starea „' + s + '" are pastila ei', /raco-pill/.test(stare(s)), stare(s)));
}

sect('3. Listele nu mai poartă clasa mesajului de listă goală');
// `rax-co-meta` e italic + centrat + gri: bun pentru „Niciun vehicul neasignat", catastrofal pe
// containerul care ține RÂNDURILE (le scria pe toate italic, centrate).
T('„rax-co-meta" chiar e stilul mesajului gol (italic, centrat)',
  /\.empty-state, \.rax-co-meta \{[^}]*font-style: italic/.test(html) && /\.empty-state, \.rax-co-meta \{[^}]*text-align: center/.test(html));
const contUnass = /<div id="rax-co-unassigned"([^>]*)>/.exec(html);
const contMove = /<div id="rax-move-list"([^>]*)>/.exec(html);
T('containerul „Vehicule neasignate" nu mai are clasa', !!contUnass && !/rax-co-meta/.test(contUnass[1]), contUnass && contUnass[1]);
T('containerul „Mută între companii" nu mai are clasa', !!contMove && !/rax-co-meta/.test(contMove[1]), contMove && contMove[1]);
T('dar mesajul de listă goală o folosește în continuare',
  /box\.innerHTML = '<div class="rax-co-meta">Niciun vehicul neasignat/.test(html));
T('rândurile de adopție se desenează cu „raco-row" (nume la stânga)', /class="raco-row"><span class="raco-row-t">/.test(html));
T('rândurile de mutare la fel', /return '<div class="raco-row">' \+\s*\n?\s*'<input type="checkbox"/.test(html));
T('și nu mai există „neasignat" scris italic în rândurile de mutare', !/'<em>neasignat<\/em>'/.test(html));

sect('4. Limbajul vizual al ecranului e într-un singur loc');
// Regulile stau sub `.raco`, pusă pe corpul ecranului. Dacă dispare clasa, ecranul se întoarce
// tăcut la câmpurile palide de dinainte — nimic nu s-ar sparge, doar ar arăta prost.
T('corpul ecranului poartă clasa', /<div class="rax-body raco">/.test(html));
T('și ferestrele lui (Editează / Configurare) poartă aceeași clasă',
  /<div class="rax-body raco" id="rax-coedit-body">/.test(html) && /<div class="rax-body raco" id="rax-cfg-body">/.test(html));
T('regulile există în CSS-ul aplicației, nu împrăștiate în pagină', /\.raco \.raco-card \{/.test(css) && /\.raco \.rax-field \{/.test(css));
T('câmpurile au aceeași formă ca în Setări (1,5px + inel la focus)',
  /\.raco \.rax-field \{[^}]*1\.5px solid var\(--border\)/.test(css) &&
  /\.raco \.rax-field:focus \{[^}]*box-shadow: 0 0 0 3px/.test(css));
// Numărăm doar cartonașele din MARKUP-ul ecranului Companii. Ecranul „Contracte" își construiește
// cartonașul din JavaScript, ca text între ghilimele — de-aia cerem să NU fie precedat de ghilimea.
const carduri = [...html.matchAll(/(?<!')<section class="raco-card">/g)].length;
T('ecranul e împărțit în patru cartonașe', carduri === 4, carduri + ' cartonașe');
const capete = [...html.matchAll(/(?<!')<div class="raco-h"><i class="fas ([a-z-]+)"><\/i> ([^<]+)</g)].map(m => m[2].trim());
T('fiecare cartonaș are titlul lui', capete.length === 4, capete.join(' | '));
// Emoji-ul 🔎 mai trăiește pe alte ecrane ale noastre (Facturare, Control costuri, Dispozitive,
// Rapoarte) — alea nu au fost atinse încă. Aici verificăm doar cele două căutări din Companii.
const cautari = [...html.matchAll(/<input class="rax-field" id="(rax-co-search|rax-move-search)" placeholder="([^"]*)"/g)];
T('ambele căutări din Companii sunt în cutia cu lupă', [...html.matchAll(/(?<!')<div class="raco-search">/g)].length === 2);
T('și niciuna nu mai are emoji în text', cautari.length === 2 && cautari.every(m => !/🔎/.test(m[2])),
  cautari.map(m => m[1] + ': ' + m[2]).join(' | '));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
