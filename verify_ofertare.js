// verify_ofertare.js — Ofertare Live: butonul rupt, banii de la început, pâlnia de oferte.
//
//   node verify_ofertare.js
//
// Trei lucruri găsite pe 21.09, umblând prin secțiune:
//
//   1. Butonul „Aplică RA Insight pe companie" NU FĂCEA NIMIC la ofertele cu pachet de apeluri —
//      adică exact cazul obișnuit. Rămăsese în text „· peste cotă X €/apel", de pe vremea când
//      depășirea se plătea; funcția a fost scoasă deliberat, variabila a plecat cu ea, textul a
//      rămas. Fereastra crăpa cu `priceEur is not defined`. La ofertele „nelimitat" mergea, de-aia
//      n-a sărit în ochi.
//   2. Lista de oferte arăta doar abonamentul lunar. Banii de la ÎNCEPUT (montaj + aparate) —
//      de obicei suma cea mare, 7.000 de lei lângă 290 lei/lună — lipseau cu totul.
//   3. O ofertă n-avea stare și n-avea termen: nu știai care e trimisă, care e moartă de trei luni.
//
// Ce apără proba: cele trei să nu se întoarcă, iar regulile pâlniei (stările, termenul, motivele
// pierderii) să stea ÎNTR-UN SINGUR LOC — pe server — nu scrise a doua oară în pagină.
const { spawn } = require('child_process');
const fs = require('fs');

const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const dbsrc = fs.readFileSync(P('db.js'), 'utf8');

const PORT = 3199, DIR = '.of-ci-db';
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234',
  SESSION_SECRET: 'ci_of', PORT: String(PORT), TCP_PORT: '5199', PGLITE_DIR: DIR + '/pgdata' };
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
function bloc(sursa, a, b) {
  const i = sursa.indexOf(a), j = sursa.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('nu găsesc blocul ' + a);
  return sursa.slice(i, j);
}
const PAL = bloc(html, '// ── începe „pâlnia de oferte"', '// ── sfârșit „pâlnia de oferte"');
const RUTE = bloc(server, '// ── începe „pâlnia de oferte"', '// ── sfârșit „pâlnia de oferte"');
const faraComentarii = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

sect('1. Butonul ✨ „Aplică RA Insight pe companie" a fost SCOS de tot');
// Pe 21.09 a fost reparat (crăpa cu `priceEur is not defined`). Pe 22.09 a plecat cu totul: era o a
// DOUA cale spre ceva ce se întâmplă singur la semnare — contractul făcut din ofertă aprinde ce s-a
// vândut (`_aplicaOfertaPeFirma`) — iar el o cerea pe un ecran unde clientul de obicei nici nu
// există încă în aplicație. Deci ori nu-l găseai în listă, ori aplicai oferta altcuiva (Alin, 22.09).
T('butonul nu mai e pe rândul ofertei', !/raxOfApply/.test(html));
T('și nici fereastra lui', !/ra-of-apply/.test(html));
T('ruta de pe server a plecat odată cu el', !/apply-to-company/.test(faraComentarii(server)));
// Regula pentru care a existat proba asta rămâne: când scoți o funcție, îi scoți și CUVINTELE.
T('`priceEur` a dispărut din pagină', !/priceEur/.test(faraComentarii(html)));
T('nu mai există preț pe întrebare nicăieri', !/€\/apel/.test(faraComentarii(html)));
// Pastila „AI" de pe rând rămâne — ea doar SPUNE că oferta include RA Insight, nu face nimic.
T('pastila „AI" rămâne pe rând', /hasAi \? '<span[\s\S]{0,220}>AI<\/span>/.test(html));
// (23.09) Se aprinde când contractul se face DIN ofertă — ca ciornă, nu abia la semnare — și primește
// acum și socoteala ofertei (prețul pe mașină), ca să scrie pe firmă și prețul de facturare.
T('iar ce s-a vândut se aprinde când contractul se face din ofertă, într-un singur loc',
  /await _aplicaOfertaPeFirma\(id, oferta, dinOferta\)/.test(server)
  && (server.match(/_aplicaOfertaPeFirma\(/g) || []).length === 2);

sect('2. Banii de la ÎNCEPUT se văd în listă');
T('coloana există', /<th class="num">La început<\/th>/.test(html));
T('se salvează ca număr propriu', /once_total: onceLei/.test(html));
T('socotit cu cursul ÎNGHEȚAT în ofertă, nu cu cel de azi',
  /\(r\.hwTotal \|\| 0\) \* \(r\.cfg\.fxRate \|\| _fxRate\)/.test(html));
T('serverul îl primește și îl scrie', /once_total: b\.once_total/.test(server) && /once_total/.test(dbsrc));
T('coloana există în bază', /ALTER TABLE offers ADD COLUMN IF NOT EXISTS once_total/.test(dbsrc));
T('ofertele vechi arată o liniuță, nu „0 lei"',
  /o\.once_total != null && Number\(o\.once_total\) > 0[\s\S]{0,400}>—<\/span>/.test(html));
T('amândouă sumele, în lei ȘI euro', /var bani = function \(lei, fx\)[\s\S]{0,300}' lei<\/b>'[\s\S]{0,200}' €<\/span>'/.test(html));
T('cursul din ofertă, nu cel de azi', /var fxOf = function \(o\) \{ return \(\(o\.config && o\.config\.cfg && o\.config\.cfg\.fxRate\) \|\| _fxRate\); \}/.test(html));

sect('3. Pâlnia: stările stau ÎNTR-UN SINGUR loc, pe server');
T('serverul are lista de stări', /const OFERTA_STARI = \['ciorna', 'trimisa', 'acceptata', 'pierduta'\]/.test(RUTE));
T('și termenul implicit', /const OFERTA_VALABIL_ZILE = \d+/.test(RUTE));
T('și motivele pentru care se pierde o ofertă', /const OFERTA_MOTIVE_PIERDUT = \[/.test(RUTE));
T('ecranul le CERE de la server, nu le scrie',
  /\/api\/admin\/offers\/meta/.test(PAL) && !/OFERTA_MOTIVE_PIERDUT/.test(PAL));
T('ecranul nu-și scrie lista de motive', !/A ales alt furnizor/.test(PAL) && /A ales alt furnizor/.test(RUTE));
// Fereastra „ultima lună" (30 de zile) e altceva decât termenul ofertei — e o fereastră de
// privit, nu o regulă de afacere. De-aia se scoate din căutare, ca să nu dea alarmă falsă.
T('ecranul nu-și scrie termenul', !/\b30\b/.test(faraComentarii(PAL).replace(/30 \* 86400000/g, '')),
  (faraComentarii(PAL).replace(/30 \* 86400000/g, '').match(/\b30\b/g) || []).join(','));
T('și nici nu ține o valoare „de rezervă" pentru el', /valabilZile: null/.test(PAL));
// Orice stare pe care o scrie serverul trebuie să aibă un cuvânt pe ecran, altfel apare o pastilă goală.
const stariServer = (RUTE.match(/const OFERTA_STARI = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
T('fiecare stare de pe server are un cuvânt pe ecran',
  stariServer.length === 4 && stariServer.every(s => new RegExp('\\b' + s + ':\\s*\\{').test(PAL)),
  stariServer.join(','));

sect('4. „Expirată" se socotește, nu se ține în bază');
T('starea arătată se face dintr-o singură funcție', /function _ofStare\(o\)/.test(PAL));
T('și „expirată" iese din termen, nu din coloană',
  /s === 'trimisa' && o\.valid_until && Number\(o\.valid_until\) < Date\.now\(\)[\s\S]{0,40}'expirata'/.test(PAL));
T('serverul NU cunoaște starea „expirata"', !/'expirata'/.test(RUTE) && !/expirata/.test(dbsrc));

sect('5. Ce poți face cu o ofertă, după starea ei');
T('butoanele se aleg din stare', /function _ofButoaneStare\(o\)/.test(PAL));
T('o ciornă nu se poate pierde — n-ai trimis-o', /if \(s === 'ciorna'\) return b\('raxOfTrimisa'/.test(PAL));
T('una trimisă sau expirată se acceptă sau se pierde',
  /if \(s === 'trimisa' \|\| s === 'expirata'\) return b\('raxOfAcceptata'[\s\S]{0,120}raxOfPierduta/.test(PAL));
T('una decisă se poate redeschide', /return b\('raxOfRedeschide'/.test(PAL));
T('„Pierdută" cere un motiv', /window\.raxOfPierduta = function \(id\)[\s\S]{0,700}ra-of-dlg-motiv/.test(PAL));
T('fereastra e una singură, refolosită', /function _ofFereastra\(titlu, ic, corp, onOk\)/.test(PAL)
  && (PAL.match(/_ofFereastra\(/g) || []).length >= 3);

sect('5b. „Ce rămâne la noi" — profitul, fără să inventeze cifre');
const PROF = bloc(html, '// ── începe „ce rămâne la noi"', '// ── sfârșit „ce rămâne la noi"');
const COST = bloc(server, '// ── începe „costurile noastre"', '// ── sfârșit „costurile noastre"');
T('serverul ține cheile costurilor', /const COST_CHEI_EUR = \[/.test(COST) && /const COST_CHEI_LEI = \[/.test(COST));
// Regula care contează: o cifră netrecută rămâne GOALĂ, nu zero. „Nu știm cât ne costă" și „ne costă
// zero" sunt două lucruri diferite — amestecate, un aparat fără preț ar arăta profit 100%.
T('o cifră netrecută rămâne GOALĂ, nu zero', /o\[k\] = null;/.test(COST) && /=== ''[\s\S]{0,80}return;\s*\/\/ rămâne „nu știm"/.test(COST));
T('valorile se curăță la intrare', /function _costuriCurate\(b\)/.test(COST) && /n >= 0 && n <= 1000000/.test(COST));
T('se salvează doar de super-admin',
  /app\.put\('\/api\/admin\/system-settings', requireAuth, requireSuperadmin/.test(server)
  && /b\.costuri_noastre !== undefined[\s\S]{0,200}setSetting\('costuri_noastre'/.test(server));
T('ecranul cere cifrele exact pentru oferta de față', /function _ofCostLipsa\(r, c\)/.test(PROF));
T('și refuză să socotească până nu le are',
  /if \(lipsa\.length\)[\s\S]{0,300}Nu pot socoti profitul până nu știu cât ne costă pe noi/.test(PROF));
T('socoteala stă într-un singur loc', /function _ofProfit\(r, c\)/.test(PROF));
T('aparatele se socotesc la cursul din OFERTĂ', /var fx = r\.cfg\.fxRate \|\| _fxRate/.test(PROF));
T('RA Insight nu se numără de două ori',
  /RA Insight[\s\S]{0,120}var incasamLunar = \(r\.monthly \|\| 0\) - lunarAi/.test(PROF));
T('spune în cât timp ne scoatem banii', /recuperare:/.test(PROF));
// Partea cea mai importantă: pe hârtia CLIENTULUI n-are ce căuta. Din 21.09 hârtia se face pe
// SERVER (`renderOfertaPdf`), deci acolo se uită proba — plus la ce TRIMITE ecranul: dacă profitul
// n-ajunge în pachet, n-are cum să apară pe hârtie.
const PDFSRV = bloc(fs.readFileSync(P('report_export.js'), 'utf8'),
  '// ─── începe „oferta, ca fișier descărcat"', '// ─── sfârșit „oferta, ca fișier descărcat"');
const PDFOF = bloc(html, '// ── începe „Oferta pe hârtie"', '// ── sfârșit „Oferta pe hârtie"');
// „Detaliere costuri unice" sunt costurile CLIENTULUI — alea au ce căuta pe hârtie. Se caută
// exact ce NU trebuie să ajungă acolo: cifrele NOASTRE. (Prima variantă căuta doar „costuri" și
// se împiedica de titlul de secțiune.)
T('hârtia nu știe nimic despre costurile noastre',
  !/_costNoastre|costuri_noastre|cVehLuna|profit|rămâne la noi|ne costă/i.test(PDFSRV));
T('și ecranul nici nu i le trimite',
  !/costuri|profit|cVehLuna/i.test(PDFOF));

sect('5c. Calculatorul: butonul cinstit, textele care se scriu singure, tarifele care rămân');
const TXT = bloc(html, '// ── începe „textele care se scriu singure"', '// ── sfârșit „textele care se scriu singure"');
const TAR = bloc(html, '// ── începe „tarifele de listă"', '// ── sfârșit „tarifele de listă"');
const TARS = bloc(server, '// ── începe „tarifele de listă"', '// ── sfârșit „tarifele de listă"');
// Butonul zicea „Trimite clientului (PDF)" și NU trimitea nimic nimănui — deschide o fereastră de
// printare. Clientul nici nu există încă la noi (Alin, 21.09).
T('butonul spune ce face: descarcă', /Descarcă oferta \(PDF\)/.test(html));
T('și nu mai promite că trimite', !/Trimite clientului/.test(faraComentarii(html)));
T('scrie unde s-a dus ciorna, cu link la listă',
  /intră în <a[^>]*raxOfLaLista\(\)[^>]*>Oferte salvate<\/a>/.test(html) && /window\.raxOfLaLista = function/.test(html));
T('numele ofertei se scrie singur din client', /window\.raxOfNumeAuto = function/.test(TXT) && /'Ofertă ' \+ cl\.trim\(\)/.test(TXT));
T('dar se oprește dacă scrie omul', /function _ofPropuneText\(id, val\)[\s\S]{0,200}if \(_ofAtinse\[id\]\) return;/.test(TXT));
T('fraza de valabilitate vine de la server, nu e scrisă aici',
  /var z = _ofMeta\.valabilZile;/.test(TXT) && !/\b30\b/.test(faraComentarii(TXT)));
T('și hârtia folosește ACEEAȘI cifră (o pune serverul, din constantă)',
  /o\.valabilZile = OFERTA_VALABIL_ZILE;/.test(server) && !/30 \* 86400000/.test(faraComentarii(PDFSRV)));
T('pasul 2 explică CAN vs FMS', /priza standard de camion/.test(html) && /modul LV-CAN200<\/b>, cumpărat și montat separat/.test(html));
T('și de ce o mașină cu CAN are două linii de montaj', /mai are o linie de montaj deasupra — munca în plus/.test(html));
T('serverul ține tarifele de listă', /const TARIF_CHEI = \[/.test(TARS) && /function _tarifeCurate\(b, existent\)/.test(TARS));
// ⚠ Și le ÎMBINĂ, nu le rescrie: o cheie netrimisă își păstrează valoarea. Sunt două căi de salvare
// (tabloul „Prețurile noastre" și butonul din cărți) cu chei diferite; rescrierea făcea ca a doua să
// șteargă pe tăcute ce salvase prima — de pildă grila RA Insight (23.09).
T('și le ÎMBINĂ: o cheie netrimisă își păstrează valoarea',
  /if \(!\(k in b\)\) \{ out\[k\] = \(vechi\[k\] != null/.test(TARS));
T('un tarif netrecut înseamnă „ia-l din cod", nu zero',
  /out\[k\] = null; return;/.test(TARS) && /: null;\s*\n\s*\}\);/.test(TARS));
T('ecranul le cere și le îmbină peste cele din cod',
  /function _ofTarifeDeBaza\(\)[\s\S]{0,140}Object\.assign\(\{\}, _OF_PRETURI_DEF, _tarifeCurateLocal\(_tarifeLista\)\)/.test(TAR));
T('„Ofertă nouă" pornește de la tarifele NOASTRE, nu de la cele din cod',
  /raxOfReset = function[\s\S]{0,140}_raxOf\.prices = _ofTarifeDeBaza\(\)/.test(html));
T('există butonul care le face tarifele casei',
  /window\.raxOfSalveazaTarife = async function/.test(TAR) && /Salvează ca tarifele noastre/.test(html));
T('o ofertă deschisă din listă își ține prețurile ei negociate',
  /if \(_raxOf\.editingId == null\) _raxOf\.prices = _ofTarifeDeBaza\(\);/.test(html));

sect('5d. Oferta se DESCARCĂ, ca un raport');
// Se „descărca" deschizând o fereastră de printare din care salvai tu un PDF. Nu era o descărcare,
// era o rugăminte către browser (Alin, 21.09: „asta înseamnă descărcare").
T('nu mai deschide o fereastră de printare', !/window\.open/.test(PDFOF) && !/window\.print/.test(PDFOF));
T('cere fișierul de la server', /fetch\('\/api\/admin\/offers\/pdf'/.test(PDFOF));
T('și îl salvează ca fișier', /a\.download = nume/.test(PDFOF) && /URL\.createObjectURL\(blob\)/.test(PDFOF));
T('numele vine din antetul răspunsului, nu inventat în pagină', /_numeDinAntet\(resp, 'ofertă\.pdf'\)/.test(PDFOF));
// Antetul poartă numele de două ori: unul curățat de diacritice (pentru browsere vechi) și cel
// adevărat, `filename*=UTF-8''`. Regula veche prindea prima potrivire, deci fișierul se salva
// „RA-Tracks - Oferta …" în loc de „Ofertă". Un singur cititor, folosit și de Inventar.
T('și se citește cu UN singur cititor, care cere ÎNTÂI varianta cu diacritice',
  /function _numeDinAntet\(resp, implicit\)/.test(html)
  && /cd\.match\(\/filename\\\*=\\s\*UTF-8''\(\[\^;\]\+\)\/i\)/.test(html)
  // Patru locuri: cititorul însuși, Inventarul, hârtia ofertei și hârtia contractelor (23.09).
  && (html.match(/_numeDinAntet\(/g) || []).length === 4
  && !/filename\\\*\?=\(\?:UTF-8/.test(html));
T('hârtia se face pe server, lângă cea a rapoartelor', /function sendOfertaPdf\(res, o\)/.test(PDFSRV));
T('și poartă numele brandat al casei', /'RA-Tracks - Ofertă ' \+ cine \+ ' - ' \+ datePart\(\)/.test(PDFSRV));
T('cu logo-ul pentru fundal alb, ca rapoartele', /const logo = _logoBuffer\(\)/.test(PDFSRV));
T('fără termen știut, hârtia NU inventează unul',
  /Number\(o\.valabilZile\) > 0 \? new Date/.test(PDFSRV) && /pana \? '     Valabilă până: '/.test(PDFSRV));
T('ruta e doar a noastră',
  /app\.post\('\/api\/admin\/offers\/pdf', requireAuth, requireSuperadmin/.test(server));
T('termenul îl pune SERVERUL, din aceeași constantă', /o\.valabilZile = OFERTA_VALABIL_ZILE;/.test(server));

sect('5d-bis. „Vezi hârtia": te uiți la ofertă fără s-o descarci (22.09)');
// Butonul de previzualizare din lista de oferte. Regula: previzualizarea NU are voie să deseneze
// altceva decât fișierul care pleacă la client — deci trece prin ACEEAȘI funcție și aceeași rută.
T('butonul e pe rândul ofertei', /onclick="raxOfPreview\(' \+ o\.id \+ '\)"/.test(html));
T('descărcarea și previzualizarea sunt aceeași cale, cu două capete',
  /async function _ofHartie\(r, previzualizare\)/.test(PDFOF)
  && /window\.raxOfExportPdf = function \(\) \{ return _ofHartie\(_ofCalc\(\), false\); \}/.test(PDFOF)
  && /return _ofHartie\(_ofCalc\(cfg, p\), true\)/.test(PDFOF));
// O singură cerere de PDF în toată pagina: dacă apare a doua, previzualizarea s-ar putea despărți
// de descărcare exact cum s-au despărțit cândva cele două căi de export.
T('o SINGURĂ cerere de PDF în pagină',
  (html.match(/fetch\('\/api\/admin\/offers\/pdf'/g) || []).length === 1);
T('și cifrele se compun într-un singur loc', /function _ofPayload\(r\)/.test(PDFOF)
  && (PDFOF.match(/_ofPayload\(/g) || []).length === 2);
// Previzualizarea unei oferte din listă NU are voie să calce oferta din formular.
T('socotește din oferta SALVATĂ, nu din ecran', /function _ofCalc\(cfgIn, pIn\)/.test(html)
  && /var p = pIn \|\| _ofReadPrices\(\); var cfg = cfgIn \|\| _ofReadCfg\(\);/.test(html));
T('un tarif lipsă dintr-o ofertă veche se ia din lista casei, nu iese NaN',
  /Object\.assign\(\{\}, _ofTarifeDeBaza\(\), \(o\.config && o\.config\.prices\) \|\| \{\}\)/.test(PDFOF));
// ⚠ Politica de securitate a aplicației N-AVEA `frame-src`, deci cadrele cădeau pe
// `default-src 'self'` — care nu cuprinde `blob:`. Fereastra rămânea o cutie goală în ORICE
// browser, nu doar în cel de probe (găsit 22.09, uitându-mă de ce nu se desena hârtia).
T('politica de securitate lasă hârtia să se vadă în pagină',
  /"frame-src 'self' blob:"/.test(server));
T('dar nu ne face și pe noi încadrabili de alții', /"frame-ancestors 'none'"/.test(server));
// Plasa, pentru browserele care nu desenează PDF-uri deloc: o ancoră obișnuită, nu o fereastră
// deschisă din cod (regula „oferta se descarcă, nu se printează" rămâne în picioare).
T('și, dacă tot nu se vede, un link către o filă nouă',
  /deschide-o într-o filă nouă/.test(PDFOF) && /target="_blank" rel="noopener"/.test(PDFOF));
T('fereastra se închide și eliberează fișierul din memorie',
  /URL\.revokeObjectURL\(url\)/.test(PDFOF) && /e\.key === 'Escape'/.test(PDFOF));
// Oferta își îngheață și ZIUA cursului, nu doar cifra: altfel, deschisă peste o lună, hârtia ar
// pune data de azi lângă un curs de acum o lună.
T('oferta îngheață ziua și sursa cursului, nu doar cifra',
  /fxRate: _fxRate, fxDate: _fxDate \|\| null, fxSursa: _fxSursa \|\| null,/.test(html));
T('iar hârtia le ia din ofertă, nu de pe ecran',
  /fxDate: r\.cfg\.fxDate \|\| null, fxSursa: r\.cfg\.fxSursa \|\| null,/.test(PDFOF));

sect('5d-ter. Pastila „AI" stă pe mijlocul numelui');
// Cu `vertical-align:middle`, o pastilă de 9,5px cu chenar cade vizibil sub linia numelui: acel
// „middle" e față de linia de bază plus jumătate din litera mică, nu față de mijlocul rândului.
T('numele și pastila stau într-o cutie flex, aliniate pe mijloc',
  /display:inline-flex;align-items:center;gap:6px;"><b>' \+ esc\(o\.name/.test(html));
T('pastila nu se mai sprijină pe `vertical-align`',
  !/border-radius:4px;padding:0 4px;vertical-align:middle;">AI</.test(html));

sect('5e. Tarifele se schimbă acolo unde se folosesc');
T('cantitatea și prețul stau pe același rând', /function qp\(idQ, idP, pret, um, umPret\)/.test(html));
T('montajul are prețul lângă cantitate', /row\('Instalare dispozitiv GPS', qp\('of-qGps', 'of-mGps'/.test(html));
T('aparatele, la fel', /row\('Teltonika FMC650', qp\('of-dq650', 'of-dFmc650'/.test(html));
T('prețurile primesc pas zecimal (altfel browserul refuză „12,50")',
  /fNum\(idP, pret, '', 78, 0\.01\)/.test(html));
T('butonul de salvare e scris o dată și refolosit',
  /function butonTarife\(text\)/.test(html) && (html.match(/butonTarife\(deTarife\)/g) || []).length >= 3);
// Mutarea, nu copierea: două casete cu același nume ar face `_ofReadPrices` să citească prima găsită.
const deDouaOri = ['mGps', 'mLvCan', 'mCanInc', 'mFms', 'mUninstall', 'mReplace', 'mTravel',
  'dFmc130', 'dFmc150', 'dFmc650', 'dLvCan', 'pPlain', 'pCan', 'pFms']
  .filter(k => (html.match(new RegExp("'of-" + k + "'", 'g')) || []).length !== 1);
T('niciun câmp de preț nu apare de două ori', deDouaOri.length === 0, deDouaOri.join(','));
// ⚠ Prima variantă a probei căuta textul „Tarife lunare (editabile)" — care a rămas în comentariul
// care explică de ce panoul a fost scos. Trecea degeaba. Acum se verifică LOCUL fiecărui preț:
// trebuie să fie în cartea lucrului pe care-l prețuiește, iar panoul pliat să nu mai existe deloc.
// ⚠ Se caută ÎNCEPÂND de la cartea respectivă, nu de la capul fișierului: `of-pAiA` apare întâi
// în `_ofReadCfg`, cu mii de rânduri mai sus, iar un `indexOf` de la zero găsea acolo și striga
// degeaba. Ce ne interesează e unde e DESENAT câmpul.
const carte = (nume) => html.indexOf('var ' + nume + ' = card(');
const undeE = (id, de) => html.indexOf("'of-" + id + "'", carte(de));
const PASI = [
  ['pPlain', 'vehCard', 'featCard'], ['pCan', 'vehCard', 'featCard'], ['pFms', 'vehCard', 'featCard'],
  ['pAiA', 'featCard', 'montajCard'], ['ret12', 'featCard', 'montajCard'], ['ret24', 'featCard', 'montajCard'],
  ['ret36', 'featCard', 'montajCard'], ['retCustom', 'featCard', 'montajCard'],
  ['mGps', 'montajCard', 'deviceCard'], ['mLvCan', 'montajCard', 'deviceCard'],
  ['mCanInc', 'montajCard', 'deviceCard'], ['mFms', 'montajCard', 'deviceCard'],
  ['mUninstall', 'montajCard', 'deviceCard'], ['mReplace', 'montajCard', 'deviceCard'],
  ['mTravel', 'montajCard', 'deviceCard'],
];
const razlete = PASI.filter(([id, de, pana]) => { const i = undeE(id, de); return !(i > carte(de) && i < carte(pana)); });
T('fiecare preț stă în cartea lucrului pe care-l prețuiește', razlete.length === 0,
  razlete.map(x => x[0]).join(','));
T('prețurile aparatelor stau la pasul 5', ['dFmc130', 'dFmc150', 'dFmc650', 'dLvCan']
  .every(k => { const i = undeE(k, 'deviceCard'); return i > carte('deviceCard') && i < html.indexOf('var priceCard'); }));
T('panoul pliat cu tarife a dispărut cu totul', /var priceCard = '';/.test(html) && !/<details[^>]*>[\s\S]{0,200}Tarife lunare/.test(html));

sect('5f. Lista de oferte e SUS, și te duce la ea după salvare');
// ⚠ `indexOf` întoarce -1 când nu găsește — iar -1 e „mai mic" decât orice. Prima variantă a probei
// trecea liniștită și dacă lista dispărea cu totul. De-aia se cere ÎNTÂI ca amândouă să existe.
const iLista = html.indexOf("'<div id=\"rax-of-list\" style=\"margin-bottom:22px;\"></div>' +");
const iGrila = html.indexOf("'<div class=\"raof-grid\">' +");
T('lista se desenează înaintea calculatorului', iLista >= 0 && iGrila >= 0 && iLista < iGrila,
  'listă la ' + iLista + ', grilă la ' + iGrila);
T('după salvare sare la ea', /raxOfLoadList\(\);[\s\S]{0,220}raxOfLaLista\(\);/.test(html));

sect('5f-bis. „Prețurile noastre": tot ce cerem și tot ce ne costă, într-un tablou');
// În ofertă schimbi un preț la locul lui (pașii 2–5). Dar când îți ACTUALIZEZI lista („am găsit
// aparate mai ieftine"), vrei să le vezi pe toate deodată, cu ce ne costă alături (Alin, 21.09).
T('lista de prețuri e scrisă într-un singur loc', /var _PRET_GRUPURI = \[/.test(PROF));
const grupuri = (PROF.match(/\{ t: '/g) || []).length;
// Cinci grupuri de tarife + rândul special al cursului (de pe 22.09), care nu e nici tarif, nici cost.
T('cu cele cinci grupuri de tarife, plus cursul', grupuri === 6, String(grupuri));
T('iar cursul stă PRIMUL, că mișcă toate celelalte cifre',
  PROF.indexOf("{ t: 'Curs euro'") > 0
  && PROF.indexOf("{ t: 'Curs euro'") < PROF.indexOf("{ t: 'Abonament lunar, pe mașină'"));
T('un rând e [cât cerem, eticheta, cât ne costă]', /\['pPlain', 'Vehicul fără CAN', null\]/.test(PROF)
  && /\['mGps', 'Instalare dispozitiv GPS', 'mGps'\]/.test(PROF));
T('numele din „nu pot socoti profitul" vin din ACEEAȘI listă',
  /function _costNume\(\)/.test(PROF) && /var nume = _costNume\(\);/.test(PROF));
T('tabloul salvează prețurile, costurile ȘI cursul într-o singură apăsare',
  /body: JSON\.stringify\(\{ tarife_lista: tarife, costuri_noastre: costuri, curs_eur: cursNou \}\)/.test(PROF));
T('cât rămâne se socotește pe loc, nu se ține minte', /window\.raxOfPretMarja = function/.test(PROF)
  && !/marja_/.test(html));
T('iar unde nu știm costul, NU se scrie nicio marjă',
  /if \(vp == null \|\| vc == null[\s\S]{0,120}b\.textContent = ''/.test(PROF));
// Casetele tabloului au nume proprii (`tp-` / `tc-`): dacă ar folosi `of-…`, ar fi două casete cu
// același id cât timp fereastra e deschisă, iar `_ofReadPrices` ar citi-o pe prima găsită.
T('casetele tabloului nu se ciocnesc cu cele din formular',
  /'tp-' \+ kP/.test(PROF) && /'tc-' \+ kC/.test(PROF) && !/id="of-/.test(PROF));
T('o ofertă deschisă din listă NU-și pierde prețurile negociate când se schimbă lista',
  /if \(_raxOf\.editingId == null\) raxLoadOfertare\(\); else raxOfRecalc\(\);/.test(PROF));
T('se ajunge la el dintr-un buton, din capul secțiunii',
  /<button class="rax-btn" onclick="raxOfPreturi\(\)">/.test(html));
// Regula casei: nicio sumă nu stă singură pe ecran. În formular o pune `_ofEuroLangaTarife`; în
// tablou, fiecare cifră își poartă echivalentul dedesubt (Alin, 21.09).
T('fiecare cifră din tablou are loc pentru echivalent', /<em id="eq-' \+ id \+ '"><\/em>/.test(PROF));
T('și se socotește în cealaltă monedă, după moneda grupului',
  /um === '€'[\s\S]{0,140}_eur2lei\(v\)[\s\S]{0,120}_lei2eur\(v\)/.test(PROF));
T('zero n-are echivalent de arătat', /if \(!Number\.isFinite\(v\) \|\| v <= 0\) \{ e\.textContent = ''; return; \}/.test(PROF));
T('și coloana rămâne dreaptă, oricât de lung ar fi textul',
  /\.rax-pret-c\{[^}]*flex-direction:column/.test(fs.readFileSync(P('public/css/app.css'), 'utf8')));

sect('5f-ter. Cursul: românește, și cinstit despre unde vine');
// „1 € = 5.0000 lei" e scris greșit (punctul e separator de MII în română) ȘI e o cifră de
// rezervă purtând numele BNR. Amândouă reparate (Alin, 21.09).
T('ecranul știe de unde vine cursul', /var _fxSursa = localStorage\.getItem\('raFxSursa'\)/.test(html)
  && /_fxSursa = f\.source \|\| ''/.test(html));
T('și îl trimite mai departe, către hârtie', /fxSursa: _fxSursa \|\| null/.test(html));
T('când nu e de la BNR, ecranul te avertizează îNAINTE să trimiți oferta',
  /Cursul BNR nu a putut fi preluat[\s\S]{0,240}curs de rezervă/.test(html));
// Și nu te lasă doar cu avertismentul: îți dă și ce ai de făcut, pe loc.
T('și îți arată pe loc ce ai de făcut', /Cursul BNR nu a putut fi preluat[\s\S]{0,420}Pune cursul tău/.test(html));
T('sumele de pe ecran se scriu românește (6.240, nu 6240)',
  /function _roNum\(v, zec\)/.test(html) && /toLocaleString\('ro-RO'/.test(html));
T('și nicio celulă de bani nu mai scapă prin `toFixed\(0\)`',
  !/function _fmtLei\(v\) \{ return \(Number\(v\) \|\| 0\)\.toFixed\(0\)/.test(html)
  && !/var sus = \(Number\(v\) \|\| 0\)\.toFixed\(0\)/.test(html));
// De pe 22.09 cursul poate fi AL NOSTRU: pus de mână, ținut minte pe server, rămâne până îl
// schimbăm (Alin: „lasă BNR, nu poți pune un alt curs care să rămână?"). BNR rămâne rezerva.
T('serverul ține minte cursul nostru, cu ziua în care l-am pus',
  /curs_eur: \(Number\(curs\) > 1 && Number\(curs\) < 100\)/.test(server)
  && /setSetting\('curs_eur_data'/.test(server));
T('`/api/fx` îl dă înaintea celui de la BNR',
  /if \(man > 1 && man < 100\) return res\.json\(\{ eur: man[\s\S]{0,90}source: 'manual'/.test(server));
T('dar trimite BNR alături, ca REPER — să se vadă dacă al nostru a rămas în urmă',
  /const reper = f\.source === 'BNR' \? \{ eur: f\.eur, date: f\.date \} : null/.test(server));
T('ecranul spune al CUI e cursul — nu pune numele BNR pe al nostru',
  /_fxSursa === 'manual'[\s\S]{0,180}Cursul tău: 1 € = /.test(html));
T('și se pune din tabloul de prețuri, primul rând',
  /\{ t: 'Curs euro'[\s\S]{0,420}\['cursEur'/.test(html));
T('cursul nu pleacă în `tarife_lista`, are cheia lui',
  /if \(r\[0\] === 'cursEur'\)[\s\S]{0,900}curs_eur: cursNou/.test(html)
  && !/tarife\[r\[0\]\][\s\S]{0,40}cursEur/.test(html));
// ⚠ Rândul cursului a scris „NaN" o zi întreagă: un „+" rămas la capătul rândului de dinainte,
// peste „+" -ul de la începutul ăstuia — adică `a + +('<div…>')`, plus UNAR pe un șir. Se prinde
// căutând forma, nu locul: în pagină nu există rând care se termină cu „+" urmat de rând care începe cu „+".
T('niciun „+" rămas peste altul (așa s-a născut „NaN"-ul de sub rezumat)',
  !/\+[ \t]*\r?\n\s*\+[^+]/.test(html.replace(/^\s*\/\/.*$/gm, '')));

sect('5f-quater. „Client nou din ofertă" chiar DESCHIDE formularul');
// Butonul din lista de oferte te ducea în Companii și te lăsa acolo: pașii se desenau, cu datele
// ofertei deja puse, dar într-o cutie cu `display:none`. Adică exact ce spunea Alin pe 22.09 —
// „mă duce în companii, dar mai departe tot manual configurez".
T('fila Companii pornește cu cutia strânsă (așa e gândită)',
  /raxAdminTab = function[\s\S]{0,900}window\.raxCoNouToggle\(false\)/.test(html));
T('deci traseul din ofertă o deschide DUPĂ ce a schimbat fila',
  /coNouStart\(offerId\);[\s\S]{0,260}raxCoNouToggle\(true\)/.test(html));
T('și nu mai ghicește un număr de milisecunde',
  !/setTimeout\(function \(\) \{ coNouStart\(offerId\); \}, \d+\)/.test(html));
T('iar formularul ajunge sub ochii tăi, fără să derulezi',
  /getElementById\('rax-conou-box'\);[\s\S]{0,200}scrollIntoView/.test(html));

sect('5g. Marca de pe hârtie: scrie „RA Tracks"');
// Fișierele de logo scriau „RA | traks", nu „RA Tracks" — și ele ajung pe FIECARE raport PDF, pe
// fiecare Excel și pe oferta descărcată (găsit 21.09, uitându-mă la PDF-ul ofertei; hotărât de Alin:
// „«RA Tracks» trebuie să scrie"). Refăcute cu `tools/make-logo.js`, din marcă + Nunito ExtraBold —
// fix fontul cu care aplicația scrie cuvântul în antet.
T('unealta care le desenează există', fs.existsSync(P('tools/make-logo.js')));
const MKLOGO = fs.readFileSync(P('tools/make-logo.js'), 'utf8');
T('și scrie „Tracks", nu altceva', /const CUV[A-ZÂ]+ = 'Tracks';/.test(MKLOGO), (MKLOGO.match(/const CUV\S* = '[^']*'/) || [])[0]);
T('cuvântul se scrie cu fontul casei (Nunito ExtraBold), ca în antetul aplicației',
  /Nunito-ExtraBold\.ttf/.test(MKLOGO) && fs.existsSync(P('fonts/Nunito-ExtraBold.ttf')));
T('marca („RA" + bara verde) rămâne desenul original, nu se rescrie',
  /logo-mark\.png/.test(MKLOGO) && /logo-mark-light\.png/.test(MKLOGO));
// ⚠ Raportul 694×135 (5,14:1) NU e estetică: `xlPlaceLogo` pune imaginea în Excel cu mărime FIXĂ
// (180×35). Alt raport = logo turtit în fiecare fișier Excel trimis unui client.
const pngDim = (f) => { const d = fs.readFileSync(P(f)).slice(16, 24); return [d.readUInt32BE(0), d.readUInt32BE(4)]; };
['public/logo.png', 'public/logo-light.png'].forEach((f) => {
  const [w, h] = pngDim(f);
  T(f.replace('public/', '') + ' are 694×135, ca așezarea din Excel să rămână dreaptă', w === 694 && h === 135, w + '×' + h);
});
T('Excel-ul pune logo-ul la același raport', /ext: \{ width: 180, height: 35 \}/.test(fs.readFileSync(P('report_export.js'), 'utf8')));

sect('6. Cifrele de sus urmăresc ofertele arătate');
T('se socotesc din rândurile primite', /function _ofPalnieHtml\(rows\)/.test(PAL) && /rows\.filter/.test(PAL));
T('serverul nu trimite un al doilea sumar', !/sumar/.test(RUTE));
T('etichetele nu se strică la unu', /acceptate === 1 \? 'acceptată' : 'acceptate'/.test(PAL));

(async () => {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const lr = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const H = (c) => ({ 'Content-Type': 'application/json', Cookie: c || ck });
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: H(c), body: JSON.stringify(b) });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: H(c), body: JSON.stringify(b) });

  sect('7. Pe server pornit: traseul unei oferte');
  const mr = await GET('/api/admin/offers/meta');
  T('cuvintele ajung la ecran', mr.status === 200, 'a dat ' + mr.status);
  const meta = await mr.json();
  T('cu toate patru stările', (meta.stari || []).length === 4, JSON.stringify(meta.stari));
  T('cu termenul implicit', Number(meta.valabilZile) > 0, String(meta.valabilZile));
  T('și cu motivele pierderii', (meta.motivePierdut || []).length >= 5, String((meta.motivePierdut || []).length));

  const mk = async (n) => (await (await POST('/api/admin/offers',
    { name: n, client_name: 'CI ' + n, monthly_total: 290, once_total: 7000, currency: 'RON',
      config: { cfg: { nVeh: 10, fxRate: 5.05 }, prices: {} } })).json());
  const o1 = await mk('CI Ofertă A');
  T('o ofertă nouă se naște ciornă', o1.status === 'ciorna', o1.status);
  T('și banii de la început se scriu', Number(o1.once_total) === 7000, String(o1.once_total));

  const t1 = await (await PUT('/api/admin/offers/' + o1.id + '/stare', { status: 'trimisa' })).json();
  T('„trimisă" pune singură un termen', !!t1.valid_until, String(t1.valid_until));
  T('și data trimiterii o scrie SERVERUL', !!t1.sent_at, String(t1.sent_at));
  const zile = Math.round((Number(t1.valid_until) - Date.now()) / 86400000);
  T('termenul e cel din server, nu altul', zile === meta.valabilZile, zile + ' vs ' + meta.valabilZile);

  const fp = await PUT('/api/admin/offers/' + o1.id + '/stare', { status: 'pierduta' });
  T('nu poți pierde o ofertă fără să spui de ce', fp.status === 400, String(fp.status));
  const p1 = await (await PUT('/api/admin/offers/' + o1.id + '/stare',
    { status: 'pierduta', lost_reason: 'A ales alt furnizor — la 24 lei/mașină' })).json();
  T('cu motiv, se poate', p1.status === 'pierduta' && /alt furnizor/.test(p1.lost_reason || ''), JSON.stringify(p1.lost_reason));
  T('și se scrie când s-a decis', !!p1.decided_at, String(p1.decided_at));

  const o2 = await mk('CI Ofertă B');
  await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'trimisa' });
  const a2 = await (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'acceptata' })).json();
  T('„acceptată" curăță motivul pierderii', a2.status === 'acceptata' && !a2.lost_reason, JSON.stringify(a2.lost_reason));
  const r2 = await (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'ciorna' })).json();
  T('„redeschide" o întoarce în ciornă, fără dată de decizie', r2.status === 'ciorna' && !r2.decided_at, JSON.stringify(r2.decided_at));

  const rau = await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'expirata' });
  T('o stare inventată e refuzată', rau.status === 400, String(rau.status));
  // „Expirată" nu se scrie NICIODATĂ în bază: o ofertă trimisă cu termen trecut rămâne „trimisa",
  // iar ecranul o arată expirată. Altfel starea s-ar învechi dacă nu trece nimeni pe la ecran.
  const o3 = await mk('CI Ofertă C');
  const vechi = await (await PUT('/api/admin/offers/' + o3.id + '/stare',
    { status: 'trimisa', valid_until: Date.now() - 4 * 86400000 })).json();
  T('o ofertă cu termen trecut rămâne „trimisa" în bază', vechi.status === 'trimisa', vechi.status);
  T('dar poartă termenul depășit', Number(vechi.valid_until) < Date.now());

  sect('7b. Costurile noastre, pe server pornit');
  const s0 = await (await GET('/api/admin/system-settings')).json();
  const c0 = s0.costuri_noastre || {};
  T('la început nu știm niciun cost', Object.keys(c0).length === 12 && Object.values(c0).every(v => v === null),
    JSON.stringify(c0));
  await PUT('/api/admin/system-settings', { costuri_noastre: { dFmc650: 78, mGps: 55, cVehLuna: 6, dFmc130: '' } });
  const c1 = (await (await GET('/api/admin/system-settings')).json()).costuri_noastre || {};
  T('ce am trecut se ține minte', c1.dFmc650 === 78 && c1.mGps === 55 && c1.cVehLuna === 6, JSON.stringify(c1));
  T('iar ce am lăsat gol rămâne NECUNOSCUT, nu zero', c1.dFmc130 === null, JSON.stringify(c1.dFmc130));
  await PUT('/api/admin/system-settings', { costuri_noastre: { dFmc650: -5, mGps: 'abc' } });
  const c2 = (await (await GET('/api/admin/system-settings')).json()).costuri_noastre || {};
  T('o cifră fără sens nu intră', c2.dFmc650 === null && c2.mGps === null, JSON.stringify([c2.dFmc650, c2.mGps]));

  sect('7c. Tarifele noastre de listă rămân scrise');
  const tar0 = (await (await GET('/api/admin/system-settings')).json()).tarife_lista || {};
  T('la început nu e trecut niciun tarif', Object.keys(tar0).length === 0 || Object.values(tar0).every(v => v === null),
    JSON.stringify(tar0).slice(0, 120));
  await PUT('/api/admin/system-settings', { tarife_lista: { dFmc650: 133, mGps: 111, pPlain: '', pCan: 'abc' } });
  const tar1 = (await (await GET('/api/admin/system-settings')).json()).tarife_lista || {};
  T('ce am trecut rămâne', tar1.dFmc650 === 133 && tar1.mGps === 111, JSON.stringify({ d: tar1.dFmc650, m: tar1.mGps }));
  T('ce am lăsat gol înseamnă „ia-l din cod", nu 0 lei', tar1.pPlain === null, JSON.stringify(tar1.pPlain));
  T('și o cifră fără sens, la fel', tar1.pCan === null, JSON.stringify(tar1.pCan));
  // Două căi de salvare, chei diferite: tabloul „Prețurile noastre" (cu grila RA Insight) și butonul
  // „Salvează ca tarifele noastre" din cărți (fără ea). A doua NU are voie s-o șteargă pe prima.
  await PUT('/api/admin/system-settings', { tarife_lista: { aiqPana10: 22, aiqPana25: 18 } });
  await PUT('/api/admin/system-settings', { tarife_lista: { pPlain: 31, mGps: 115 } });   // ca din cărți
  const tar2 = (await (await GET('/api/admin/system-settings')).json()).tarife_lista || {};
  T('grila RA Insight din tablou supraviețuiește unei salvări din cărți',
    tar2.aiqPana10 === 22 && tar2.aiqPana25 === 18, JSON.stringify({ a10: tar2.aiqPana10, a25: tar2.aiqPana25 }));
  T('iar salvarea din cărți și-a scris cifrele ei', tar2.pPlain === 31 && tar2.mGps === 115,
    JSON.stringify({ p: tar2.pPlain, m: tar2.mGps }));
  T('și ce se salvase înainte, netrimis acum, a rămas', tar2.dFmc650 === 133, JSON.stringify(tar2.dFmc650));
  T('prețul unic vechi al contului (pAiA) nu mai e în listă', !('pAiA' in tar2));

  sect('7d. Pe server pornit: oferta chiar vine ca fișier');
  const pdfResp = await POST('/api/admin/offers/pdf', {
    client: { name: 'CI Transbet SRL', cui: 'RO123', contact: 'birou@ci.ro' },
    notes: 'Ofertă valabilă 30 de zile de la trimitere.', contractMonths: 12, fxRate: 5.05,
    lines: [{ label: 'Vehicule GPS (fără CAN)', qty: 10, unit: 29, total: 290 }],
    monthly: 290, annual: 3480, contractTotal: 3480,
    montajLines: [{ label: 'Instalare dispozitiv GPS', qty: 10, unit: 100, total: 1000 }], montaj: 1000,
    deviceLines: [{ label: 'Teltonika FMC650', qty: 10, unit: 120, total: 1200 }], hwTotal: 1200
  });
  T('ruta răspunde', pdfResp.status === 200, 'a dat ' + pdfResp.status);
  // Și pe server PORNIT: antetul chiar iese cu `frame-src`, nu doar scris în cod.
  const antetCsp = (await GET('/app')).headers.get('content-security-policy') || '';
  T('antetul trimis de server lasă hârtia în cadru', /frame-src [^;]*blob:/.test(antetCsp),
    (antetCsp.match(/frame-src[^;]*/) || ['lipsește'])[0]);
  T('trimite un PDF', /application\/pdf/.test(pdfResp.headers.get('content-type') || ''),
    pdfResp.headers.get('content-type'));
  const cd = pdfResp.headers.get('content-disposition') || '';
  T('ca DESCĂRCARE, nu ca pagină deschisă', /^attachment;/.test(cd), cd.slice(0, 60));
  T('cu numele brandat al casei', /RA-Tracks - Ofert/.test(cd) && /CI Transbet SRL/.test(decodeURIComponent(cd)),
    cd.slice(0, 120));
  const buf = Buffer.from(await pdfResp.arrayBuffer());
  T('și e un PDF adevărat, nu o pagină de eroare', buf.slice(0, 5).toString() === '%PDF-' && buf.length > 3000,
    buf.slice(0, 5).toString() + ' · ' + buf.length + ' octeți');

  sect('8. Ruta e doar a noastră');
  const { puneParola } = require('./test_parola');
  const co = (await (await POST('/api/companies', { name: 'CI Ofertare' })).json()).id;
  const cr = await POST('/api/users', { username: 'sef@of.ro', full_name: 'Șef OF', role: 'company_admin', company_id: co });
  await puneParola(cr, 'Str4da-Verde-2026', B);
  const l2 = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sef@of.ro', password: 'Str4da-Verde-2026' }) });
  const ckSef = l2.ok ? (l2.headers.getSetCookie ? l2.headers.getSetCookie() : [l2.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ') : null;
  T('adminul firmei intră în contul lui', !!ckSef, 'login a dat ' + l2.status);
  if (ckSef) {
    T('dar nu vede ofertele', (await GET('/api/admin/offers', ckSef)).status === 403);
    T('nici cuvintele pâlniei', (await GET('/api/admin/offers/meta', ckSef)).status === 403);
    T('și nu poate muta o ofertă în altă stare',
      (await PUT('/api/admin/offers/' + o2.id + '/stare', { status: 'acceptata' }, ckSef)).status === 403);
    // Cât ne costă pe NOI un aparat e cel mai sensibil număr din aplicație.
    T('și nu află cât ne costă pe noi aparatele',
      (await GET('/api/admin/system-settings', ckSef)).status === 403);
    T('și nu-și poate scoate singur o ofertă pe hârtie',
      (await POST('/api/admin/offers/pdf', { client: { name: 'X' } }, ckSef)).status === 403);
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
