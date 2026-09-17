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
//   • listele să-și piardă forma. Rândurile din „Mută între companii" apăreau scrise italic și
//     centrate fiindcă purtau `rax-co-meta` — clasa mesajului de listă GOALĂ — pe containerul
//     întreg. Proba 3 nu mai lasă clasa aia pe containere.
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
const contMove = /<div id="rax-move-list"([^>]*)>/.exec(html);
T('containerul „Mută între companii" nu mai are clasa', !!contMove && !/rax-co-meta/.test(contMove[1]), contMove && contMove[1]);
T('dar mesajul de listă goală o folosește în continuare',
  /'<div class="rax-co-meta">Se încarcă…<\/div>'/.test(html));
T('rândurile se desenează cu „raco-row" (nume la stânga)', /class="raco-row"><span class="raco-row-t">/.test(html));
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
// DOUĂ. Au fost patru, apoi trei, acum două, și de fiecare dată din același motiv — ecranul face un
// singur lucru: ține evidența firmelor. „Client nou" a devenit buton în capul listei (deschizi un
// client o dată pe săptămână, lista o citești zilnic), iar „Vehicule neasignate" a plecat de tot în
// „Dispozitive" (Alin, 17.09): era a doua cale de adopție, mai săracă, rămasă de pe vremea când
// ecranul se numea „Companii & Dispozitive". A rămas doar banda de sus, care trimite acolo —
// regula stă în `verify_dispozitive.js`, la „într-un singur loc".
const carduri = [...html.matchAll(/(?<!')<section class="raco-card"[ >]/g)].length;
T('ecranul e împărțit în două cartonașe', carduri === 2, carduri + ' cartonașe');
const capete = [...html.matchAll(/(?<!')<div class="raco-h">\s*(?:<span>)?<i class="fas ([a-z-]+)"><\/i> ([^<]+)</g)].map(m => m[2].trim());
T('fiecare cartonaș are titlul lui', capete.length === 2, capete.join(' | '));
T('„Client nou" e buton în capul listei, nu cartonaș separat',
  /id="rax-conou-btn"[^>]*onclick="raxCoNouToggle\(\)"/.test(html) && /window\.raxCoNouToggle\s*=/.test(html));
// Emoji-ul 🔎 mai trăiește pe alte ecrane ale noastre (Facturare, Control costuri, Dispozitive,
// Rapoarte) — alea nu au fost atinse încă. Aici verificăm doar cele două căutări din Companii.
const cautari = [...html.matchAll(/<input class="rax-field" id="(rax-co-search|rax-move-search)" placeholder="([^"]*)"/g)];
T('ambele căutări din Companii sunt în cutia cu lupă', [...html.matchAll(/(?<!')<div class="raco-search">/g)].length === 2);
T('și niciuna nu mai are emoji în text', cautari.length === 2 && cautari.every(m => !/🔎/.test(m[2])),
  cautari.map(m => m[1] + ': ' + m[2]).join(' | '));

sect('5. Registrul de clienți: filtre, căutare, bani, activitate');
// Codul se DECUPEAZĂ din pagină și se execută — nu se rescrie aici.
function taie(sursa, start, capat) {
  const a = sursa.indexOf(start); if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 50));
  const b = sursa.indexOf(capat, a); if (b < 0) throw new Error('nu găsesc capătul: ' + capat.slice(0, 50));
  return sursa.slice(a, b);
}
const bucataCo = taie(html, '// ─── începe „Lista de companii"', '// ─── sfârșit „Lista de companii" ──');
const co = new Function('window', 'document', 'esc', '$', 'companiesCache', 'dosarPastila', '_raxAccessCell', '_raxDataOra',
  bucataCo + '\n; return { faraContract: _coEsteFaraContract, restanta: _coEsteRestanta, suspendata: _coEsteSuspendata,' +
  ' cauta: _coCauta, valoare: _coValoare, activitate: _coActivitate, lunar: _coLunar, filtre: CO_FILTRE, zile: CO_ZILE_LINISTE };')(
  {}, { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  (x) => String(x == null ? '' : x), () => null, [], () => '', () => '', (v) => String(v));

const F = (o) => Object.assign({ id: 1, name: 'Transport Rapid SRL', plan: 'standard', device_count: 2,
  user_count: 1, paid_total: 0, is_demo: false, access: { status: 'active' }, dosar: null, neplata: null,
  ultimaActivitate: Date.now() }, o);
T('firma cu dosarul incomplet se recunoaște', co.faraContract(F({ dosar: { text: 'contractul' } })) === true);
T('cea cu dosarul complet, nu', co.faraContract(F({ dosar: { eticheta: 'complet' } })) === false);
T('demo-ul nu intră la „fără contract"', co.faraContract(F({ is_demo: true, dosar: { text: 'x' } })) === false);
T('restanța în derulare se recunoaște', co.restanta(F({ neplata: { faza: 'avertisment', zilePanaLaSuspendare: 5 } })) === true);
T('suspendarea se recunoaște', co.suspendata(F({ access: { status: 'expired' } })) === true);
const filtruLiniste = co.filtre.filter(f => f.id === 'liniste')[0].f;
T('firma fără semnal de 20 de zile e prinsă', filtruLiniste(F({ ultimaActivitate: Date.now() - 20 * 86400000 })) === true);
T('cea care a transmis azi, nu', filtruLiniste(F({ ultimaActivitate: Date.now() })) === false);
T('firma fără vehicule nu e „fără semnal" (n-are ce transmite)', filtruLiniste(F({ device_count: 0, ultimaActivitate: null })) === false);
T('pragul de liniște e 14 zile', co.zile === 14, String(co.zile));

const cautabil = F({ cui: 'RO11112222', contact_email: 'office@rapid.ro', phone: '0722111222',
  admin: { nume: 'Ion Popescu', email: 'ion@rapid.ro', telefon: '0733444555' } });
T('căutarea găsește după nume', co.cauta(cautabil, 'rapid') === true);
T('după CUI', co.cauta(cautabil, 'ro1111') === true);
T('după emailul firmei', co.cauta(cautabil, 'office@') === true);
T('după telefonul firmei', co.cauta(cautabil, '0722') === true);
T('după numele administratorului', co.cauta(cautabil, 'popescu') === true);
T('după telefonul administratorului', co.cauta(cautabil, '0733444555') === true);
T('și nu găsește ce nu e', co.cauta(cautabil, 'altceva') === false);

T('sortarea după vehicule citește numărul', co.valoare(F({ device_count: 7 }), 'devices') === 7);
T('sortarea după nume nu ține cont de majuscule', co.valoare(F({ name: 'ABC' }), 'name') === 'abc');
T('„azi" se scrie ca azi', /azi/.test(co.activitate(F({ ultimaActivitate: Date.now() }))));
T('liniștea lungă se scrie portocaliu', /var\(--orange\)/.test(co.activitate(F({ ultimaActivitate: Date.now() - 30 * 86400000 }))));
T('firma care n-a transmis niciodată e strigată', /niciodată/.test(co.activitate(F({ ultimaActivitate: null }))));
T('firma fără vehicule nu e trasă la răspundere', /fără vehicule/.test(co.activitate(F({ device_count: 0 }))));

sect('6. Venitul lunar — aceeași socoteală ca pe factură');
const bucataQ = taie(server, 'function _aiQuotaFromSettings(settings) {', '\n// ─── Câte conturi');
const bucataL = taie(server, 'function _lunaAcum()', '\nasync function _urcaSeatsPeak');
const bucataV = taie(server, '// ── începe „Venitul lunar pe firmă"', '// ── sfârșit „Venitul lunar pe firmă" ──');
const _venitLunar = new Function('plans', bucataQ + '\n' + bucataL + '\n' + bucataV + '\n; return _venitLunar;')(require('./plans.js'));
const LUNA = new Date().toISOString().slice(0, 7);
const firmaPret = (o) => ({ id: 1, name: 'X', custom_plan: o, settings: {} });
T('preț pe vehicul × vehicule', _venitLunar(firmaPret({ priceNoneRON: 30 }), { none: 3, can: 0, fms: 0 }, 0) === 90,
  String(_venitLunar(firmaPret({ priceNoneRON: 30 }), { none: 3, can: 0, fms: 0 }, 0)));
T('vehiculele cu CAN au prețul lor', _venitLunar(firmaPret({ priceNoneRON: 30, priceCanRON: 45 }), { none: 1, can: 2, fms: 0 }, 0) === 120,
  String(_venitLunar(firmaPret({ priceNoneRON: 30, priceCanRON: 45 }), { none: 1, can: 2, fms: 0 }, 0)));
// Fără OFERTĂ, firma n-are preț — deci ZERO, nu un preț implicit inventat dintr-un tabel de planuri.
// (Cât timp exista tabelul, o firmă nouă apărea în registru cu 29 lei/vehicul pe care nu-i cerea nimeni.)
T('fără ofertă, firma nu aduce nimic',
  _venitLunar({ id: 2, settings: {} }, { none: 5, can: 0, fms: 0 }, 0) === 0,
  String(_venitLunar({ id: 2, settings: {} }, { none: 5, can: 0, fms: 0 }, 0)));
T('nici măcar dacă are vehicule și un plan scris în coloană',
  _venitLunar({ id: 2, plan: 'premium', settings: {} }, { none: 5, can: 2, fms: 1 }, 0) === 0);
const cuInsight = { id: 3, custom_plan: { priceNoneRON: 30 }, settings: { ai_quota: { questionsPerSeat: 50, seatPriceRON: 15 } } };
T('conturile de RA Insight se adaugă', _venitLunar(cuInsight, { none: 2, can: 0, fms: 0 }, 3) === 105,
  String(_venitLunar(cuInsight, { none: 2, can: 0, fms: 0 }, 3)));
const cuVarf = { id: 4, custom_plan: { priceNoneRON: 30 }, settings: { ai_quota: { questionsPerSeat: 50, seatPriceRON: 15, seatsPeak: { luna: LUNA, n: 4 } } } };
T('se ia vârful lunii, ca pe factură', _venitLunar(cuVarf, { none: 2, can: 0, fms: 0 }, 2) === 120,
  String(_venitLunar(cuVarf, { none: 2, can: 0, fms: 0 }, 2)));
T('clasificatorul de CAN e cel adevărat, nu o copie',
  /classifyDeviceCan\(\{ can_interface: b\.can_interface/.test(server));
T('ruta de bani e declarată ÎNAINTEA rutelor cu :id (altfel „mrr" ar fi luat drept un id)',
  server.indexOf("app.get('/api/companies/mrr'") < server.indexOf("app.get('/api/companies/:id"));

sect('7. Exportul listei de clienți');
const bucataE = taie(server, '// ── începe „Lista de clienți, pe hârtie"', '// ── sfârșit „Lista de clienți, pe hârtie" ──');
const _randuri = new Function(bucataE + '\n; return _randuriExportCompanii;')();
const acumE = Date.UTC(2026, 8, 15, 12, 0, 0);
const rExp = _randuri([
  { id: 1, name: 'Transport Rapid SRL', cui: 'RO111', plan: 'standard', is_demo: false,
    access: { status: 'active' }, dosar: { text: 'contractul' }, device_count: 3, user_count: 2,
    paid_total: 1200, ultimaActivitate: acumE - 3 * 86400000, admin: { nume: 'Ion', email: 'ion@x.ro', telefon: '0722' } },
  { id: 9, name: 'RA Track Demo', is_demo: true }
], { 1: 135 }, acumE);
T('demo-ul nu iese niciodată în export', rExp.length === 1, String(rExp.length));
T('rândul are toate coloanele', rExp[0].length === 13, String(rExp[0].length));
T('și cifra de bani lunari', rExp[0][6] === 135, String(rExp[0][6]));
T('dosarul incomplet se scrie pe litere', /lipsește: contractul/.test(rExp[0][3]), rExp[0][3]);
T('zilele de liniște se socotesc', rExp[0][9] === 3, String(rExp[0][9]));
T('contactul administratorului e în fișier', rExp[0][10] === 'Ion' && rExp[0][11] === 'ion@x.ro', JSON.stringify(rExp[0].slice(10)));
const susp = _randuri([{ id: 2, name: 'Y', is_demo: false, access: { status: 'expired', motiv: 'neplata' }, dosar: null }], {}, acumE);
T('suspendarea pentru neplată se scrie limpede', /suspendat — neplată/.test(susp[0][2]), susp[0][2]);
T('exportul cere super-admin pe SERVER, nu doar ascunde butonul',
  /app\.get\('\/api\/companies\/export',\s*requireAuth,\s*requireSuperadmin/.test(server));
T('și lasă un rând în jurnalul de audit', /auditReq\(req, 'export', 'companies'/.test(server));
T('fișierul trece prin regula casei (nume + logo)', /reportExport\.sendReport\(res, report, 'xlsx'\)/.test(server) &&
  /label: 'Companii'/.test(server));

sect('8. Cartonașul de pe „Acasă" spune starea');
T('serverul trimite câte firme n-au contract și câte au restanță',
  /companies_fara_contract/.test(server) && /companies_restante/.test(server));
T('pagina le scrie sub cifră', /adash-s-companies/.test(html) && /fără contract/.test(html));
T('și zice „toate în regulă" când nu e nimic de rezolvat', /toate în regulă/.test(html));

sect('9. Stilul listei');
['.raco-filtre', '.raco-mrr', '.raco-sort', '.raco-subrand', '.raco-lista'].forEach(function (x) {
  T('există stilul ' + x, css.indexOf(x) > 0);
});
T('pe telefon lista devine cartonașe', /@media \(max-width: 860px\)\{[\s\S]{0,700}\.raco-lista thead\{ display:none/.test(css));
T('și fiecare cifră își spune ce e', /\.raco-lista td:before\{ content:attr\(data-et\)/.test(css));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
