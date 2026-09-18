// verify_inventar.js — „Inventar dispozitive" (Gestiune): evidența echipamentelor noastre.
//
//   node verify_inventar.js
//
// Un rând = un aparat GPS: la ce firmă e, pe ce mașină, ce model, ce cartelă, ce semnal dă. Peste
// toate firmele. E registrul MĂRFII noastre, nu al mașinilor clientului.
//
// Ce prinde proba (toate, bube găsite pe 18.09):
//   • căutarea care-și pierde cursorul. Tot tabelul se redesena la fiecare literă, inclusiv caseta în
//     care scriai: din „Alfa" intra doar „A", restul se duceau în gol. Șase casete, toate inutile;
//   • al doilea vocabular pentru semnal. Ecranul avea praguri proprii (24 h / 7 zile) și se contrazicea
//     cu „Aparate GPS" (30 min / 24 h) în 5 din 7 cazuri: un aparat mut de 3 zile era ROȘU acolo și doar
//     portocaliu aici. Acum cheamă aceeași funcție, `agpsStare`;
//   • exportul care nu ținea cont de filtre: filtrai la o firmă, apăsai „Exportă Excel" și primeai TOT;
//   • ecranul care-ți spunea ce lipsește fără să te lase să repari (niciun buton pe rând).
//
// Codul nu se copiază aici: se decupează din sursă și se execută.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

function bloc(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return html.slice(i, j);
}
const B = bloc('// ── începe „inventarul de aparate" ──', '// ── sfârșit „inventarul de aparate" ──');

sect('1. Căutarea nu-și mai pierde cursorul');
T('scheletul se construiește separat de conținut', /function _invSchelet\(host\)/.test(B));
T('și O SINGURĂ dată', /if \(!host\._invGata\) _invSchelet\(host\);/.test(B) && /host\._invGata = true;/.test(B));
T('randarea NU mai rescrie tot ecranul', !/host\.innerHTML = /.test(B.slice(B.indexOf('function _invRender'))));
T('scrie doar în corpul tabelului', /var corp = document\.getElementById\('inv-corp'\);[\s\S]{0,120}corp\.innerHTML = /.test(B));
T('casetele de căutare sunt în schelet, nu în corp',
  /function _invSchelet\(host\)[\s\S]{0,900}class="rax-field inv-cauta"/.test(B));
T('contoarele se schimbă prin text, nu prin redesenare',
  /nr\.textContent = rows\.length/.test(B) && /bs\.style\.display = anyQ/.test(B));
T('săgeata de sortare atinge doar capul de coloană', /a\.innerHTML = \(_invSort\.k === th\.getAttribute\('data-k'\)\)/.test(B));
T('un mesaj pe tot ecranul marchează scheletul ca refăcut',
  /host\.innerHTML = h; host\._invGata = false;/.test(html));
T('și filtrul scris se pune înapoi după refacere',
  /inv-cauta'\)\.forEach\(function \(i\) \{ i\.value = _invQ\[i\.getAttribute\('data-k'\)\] \|\| ''; \}\)/.test(B));

sect('2. Un singur vocabular pentru semnal');
T('există coloana „Semnal"', /\{ k: 'semnal', label: 'Semnal' \}/.test(B));
T('cuvintele vin din „Aparate GPS", nu de aici', /function _invSemnal\(r\)[\s\S]{0,200}agpsStare\(r\.last_tx, Date\.now\(\)\)/.test(B));
T('nu mai există praguri proprii în ecran', !/_invAge/.test(html) && !/168/.test(B));
T('„Ultima transmisie" a rămas o dată simplă, fără a doua părere',
  /function _invData\(t\)/.test(B) && /color:var\(--text-muted\);">' \+ esc\(_invData\(r\.last_tx\)\)/.test(B));
T('sortarea pe „Semnal" merge după ultima transmisie, nu după litere',
  /if \(k === 'last_tx' \|\| k === 'semnal'\)/.test(B));

// Serverul are propria scriere a cuvintelor (pentru fișierul exportat) — nu poate chema funcția din
// pagină. Ca să nu se despartă în timp, le rulăm pe AMÂNDOUĂ peste aceleași vechimi și cerem
// același rezultat. Dacă cineva mută un prag într-o parte, proba pică.
sect('3. Fișierul exportat spune ACELAȘI lucru ca ecranul');
const fnPag = (a) => { const i = html.indexOf(a); return html.slice(i, html.indexOf('\n    }', i) + 6); };
// Și pragurile paginii se iau din sursă, din același motiv.
const declPag = (html.match(/var AGPS_TACUT_MIN = \d+;/) || [''])[0] + (html.match(/var AGPS_MUT_ORE = \d+;/) || [''])[0];
T('pragurile paginii se pot citi din sursă', /AGPS_TACUT_MIN/.test(declPag) && /AGPS_MUT_ORE/.test(declPag), declPag);
const pagina = new Function(
  declPag + '\n' + fnPag('function agpsDeCand(ms)') + '\n' + fnPag('function agpsStare(lastTx, acum)')
  + '; return agpsStare;')();
const iSrv = server.indexOf('function _invSemnalText(lastTx)');
// Pragurile se iau DIN SURSĂ, nu se scriu aici: dacă le-aș fi scris în probă, mutarea unui prag pe
// server ar fi trecut neobservată — exact greșeala pe care proba asta o păzește.
const decl = (server.match(/const INV_TACUT_MIN = \d+, INV_MUT_ORE = \d+;/) || [])[0];
T('pragurile serverului se pot citi din sursă', !!decl, decl);
const srv = new Function(decl + '\n' + server.slice(iSrv, server.indexOf('\n}', iSrv) + 2) + '; return _invSemnalText;')();
T('serverul chiar are funcția lui', typeof srv === 'function');
const ORA = 3600000, acum = Date.now();
const cazuri = [['fără nimic', null], ['5 min', 5 / 60], ['29 min', 29 / 60], ['31 min', 31 / 60], ['3 ore', 3],
                ['23 ore', 23], ['25 ore', 25], ['3 zile', 72], ['40 zile', 960]];
let nepotriviri = [];
for (const [et, ore] of cazuri) {
  const t = ore == null ? null : new Date(acum - ore * ORA).toISOString();
  const a = pagina(t, acum).t, b = srv(t);
  if (a !== b) nepotriviri.push(et + ': ecran „' + a + '" vs. fișier „' + b + '"');
}
T('aceleași cuvinte, pe toate vechimile', nepotriviri.length === 0, nepotriviri.join(' | '));

sect('4. Exportul descarcă exact ce e pe ecran');
T('trimite rândurile filtrate, nu o cerere goală',
  /var imeis = _invFiltered\(\)\.map\(function \(r\) \{ return String\(r\.imei\); \}\);/.test(B));
T('prin POST, ca să încapă oricâte', /method: 'POST'[\s\S]{0,200}JSON\.stringify\(\{ format: fmt, imeis: imeis \}\)/.test(B));
T('serverul primește POST', /app\.post\('\/api\/device-inventory\/export', requireAuth, requireFleet, _inventarExport\)/.test(server));
T('și GET-ul vechi merge mai departe (link direct)', /app\.get\('\/api\/device-inventory\/export', requireAuth, requireFleet, _inventarExport\)/.test(server));
T('păstrează ORDINEA de pe ecran', /pozitie = new Map\(cerute\.map\(\(im, i\) => \[im, i\]\)\)/.test(server));
T('filtrarea NU se rescrie pe server', !/toLowerCase\(\)\.indexOf/.test(server.slice(server.indexOf('async function _inventarExport'), server.indexOf('app.get(\'/api/device-inventory/export\''))));
T('numele fișierului rămâne brandat (trece prin sendReport)', /return reportExport\.sendReport\(res, report, fmt\)/.test(server));
T('și scrie în jurnalul de audit dacă a fost filtrat', /auditReq\(req, 'export', 'device_inventory', null, \{ count: rows\.length, format: fmt, filtrat: doarCeVezi \}\)/.test(server));
T('fișierul spune că e o selecție, nu tot inventarul', /\(selecția de pe ecran\)/.test(server));

sect('5. De pe rând ajungi unde se repară');
T('fiecare rând are buton spre fișa mașinii', /onclick="openEditModal\(\\'' \+ esc\(r\.imei\) \+ '\\'\)"/.test(B));
T('cu explicație pe el', /title="Fișa mașinii — aici se completează modelul și cartela SIM"/.test(B));
T('avertismentul „fără model/SIM" e buton, nu doar text', /id="inv-lipsa" class="rax-btn"[\s\S]{0,120}onclick="raxInvDoarLipsa\(\)"/.test(B));
T('și chiar filtrează la ele', /window\.raxInvDoarLipsa = function \(\) \{ _invDoarLipsa = !_invDoarLipsa;/.test(B)
  && /if \(_invDoarLipsa && !_invLipsa\(r\)\) return false;/.test(B));
T('„Șterge filtrele" golește și casetele, și filtrul de lipsă',
  /_invQ = \{\}; _invDoarLipsa = false;[\s\S]{0,200}i\.value = ''/.test(B));

sect('6. Cuvintele de pe ecran');
T('coloana se numește „Firmă", ca peste tot altundeva', /\{ k: 'company_name', label: 'Firmă' \}/.test(B) && !/label: 'Client'/.test(B));
T('și la fel în fișierul exportat', /'Firmă', 'Nr\. înmatriculare'/.test(server) && !/'Client', 'Nr\. înmatriculare'/.test(server));
T('nota spune cine completează modelul și cartela', /le completăm NOI, în fișa vehiculului/.test(B));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
