// verify_locatie_distribuita.js — „Distribuie locația" (Robert, 21.10): linkul public al unei mașini, ca locația live
// de pe WhatsApp.
//
//   node verify_locatie_distribuita.js
//
// Robert (21.10): „când selectezi o mașină să poți da share location pentru oricine, timp de x timp, ca pe WhatsApp…
// să poată să vadă oricine are acel link… după ce expiră acel timp, să nu mai existe acel link… să poată fi responsive".
//
// Ce apără proba:
//   1. regulile (locatie_distribuita.js): duratele, tokenul (192 de biți, în bază doar amprenta), textele („încă 14
//      minute", „Oprit", „În mers · 54 km/h", „Fără semnal …"), ce pleacă spre public (fără IMEI, fără șofer);
//   2. pagina publică (public/locatie.html): Nunito, sigla casei, telefon (viewport, cartonaș jos) + calculator, fără
//      indexare, fără cookie-uri, textul pus cu textContent, mașina dispare când linkul nu mai e bun; serviciul offline
//      nu o ține în cache;
//   3. aplicația (web și telefon): butonul din fișa mașinii (doar cui îl poate folosi), fereastra / foaia, duratele și
//      textele luate de la server;
//   4. pe server pornit: cine poate (admin, dispecer) și cine nu (vizualizatorul, altă firmă), linkul văzut FĂRĂ cont,
//      un link inventat = unul expirat, „Oprește", expirarea (rândul se șterge), plafonul pe mașină, mașina arhivată sau
//      mutată pe altă firmă oprește linkul pe loc.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');

const ROOT = __dirname;
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const taie = (src, de, pana) => { const i = src.indexOf(de); if (i < 0) return ''; const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j); };

const L = require('./locatie_distribuita.js');
const html = citeste('public/index.html');
const css = citeste('public/css/app.css');
const pagina = citeste('public/locatie.html');
const server = citeste('server.js');
const db = citeste('db.js');
const sw = citeste('public/sw.js');
const backup = citeste('backup.js');

// ─── 1. Regulile ──────────────────────────────────────────────────────────────────────────────────────────────────
sect('1. Regulile (locatie_distribuita.js)');
T('duratele, ca pe WhatsApp: 15 minute, 1 oră, 8 ore', J(L.DURATE.map((d) => d.minute)) === '[15,60,480]' && J(L.DURATE.map((d) => d.text)) === J(['15 minute', '1 oră', '8 ore']), J(L.DURATE));
T('o durată necunoscută nu se primește', L.durata(60).minute === 60 && L.durata('480').minute === 480 && L.durata(7) === null && L.durata(undefined) === null && L.durata(60 * 24 * 365) === null);
const tk = L.tokenNou(), tk2 = L.tokenNou();
T('tokenul: 32 de caractere care merg într-o adresă, de fiecare dată altul', L.tokenBun(tk) && L.tokenBun(tk2) && tk !== tk2 && /^[A-Za-z0-9_-]{32}$/.test(tk), tk);
T('tokenul stricat nu trece', !L.tokenBun('') && !L.tokenBun(tk + 'a') && !L.tokenBun(tk.slice(1)) && !L.tokenBun('../../etc/passwd/aaaaaaaaaaaaaaaaaaa') && !L.tokenBun(null));
T('în bază stă amprenta (64 de caractere), nu tokenul', /^[0-9a-f]{64}$/.test(L.amprenta(tk)) && L.amprenta(tk) !== L.amprenta(tk2) && L.amprenta(tk) === L.amprenta(tk));
const ACUM = Date.UTC(2026, 9, 21, 13, 0);   // 16:00 pe ora României (ora de vară)
T('activ până în clipa expirării, nu și după', L.activ({ expira_la: ACUM + 1 }, ACUM) && !L.activ({ expira_la: ACUM }, ACUM) && !L.activ(null, ACUM));
const R = [[ACUM + 14 * 60000, 'încă 14 minute'], [ACUM + 60000, 'încă 1 minut'], [ACUM + 30000, 'încă 1 minut'], [ACUM + 20 * 60000, 'încă 20 de minute'],
  [ACUM + 60 * 60000, 'încă 1 oră'], [ACUM + 479 * 60000, 'încă 7 ore și 59 de minute'], [ACUM + 61 * 60000, 'încă 1 oră și 1 minut'], [ACUM, 's-a încheiat'], [ACUM - 5000, 's-a încheiat']];
const Rr = R.filter(([t, e]) => L.ramas(t, ACUM) !== e);
T('cât mai ține: „încă 14 minute", „încă 7 ore și 59 de minute", cu „de" la 20', !Rr.length, Rr.map(([t, e]) => e + ' ≠ ' + L.ramas(t, ACUM)).join(' | '));
T('ora pe ora României', L.ora(ACUM + 60 * 60000) === '17:00', L.ora(ACUM + 60 * 60000));
const V = [[ACUM - 5000, 'acum câteva secunde'], [ACUM - 2 * 60000, 'acum 2 minute'], [ACUM - 3600000, 'acum 1 oră'], [ACUM - 25 * 3600000, 'acum 1 zi'], [ACUM - 21 * 60000, 'acum 21 de minute']];
const Vr = V.filter(([t, e]) => L.vechime(t, ACUM) !== e);
T('de când e poziția', !Vr.length, Vr.map(([t, e]) => e + ' ≠ ' + L.vechime(t, ACUM)).join(' | '));
T('numele mașinii: nume · număr, fără dublură, „Vehicul" fără nimic', L.numeMasina('Volvo FH', 'B 01 TIR') === 'Volvo FH · B 01 TIR' && L.numeMasina('B 01 TIR', 'b 01 tir') === 'B 01 TIR' && L.numeMasina('', 'B 1 X') === 'B 1 X' && L.numeMasina(null, null) === 'Vehicul');
T('mesajul care pleacă cu linkul', L.mesaj('Volvo FH · B 01 TIR', ACUM + 3600000, 'https://ratrack.ro/locatie/x') === 'Urmărește live Volvo FH · B 01 TIR pe hartă, până la 17:00: https://ratrack.ro/locatie/x', L.mesaj('Volvo FH · B 01 TIR', ACUM + 3600000, 'https://ratrack.ro/locatie/x'));
const LINK = { id: 1, imei: '861000000123456', company_id: 4, creat_de: 9, creat_la: ACUM - 60000, expira_la: ACUM + 14 * 60000 };
const POZ = { latitude: 45.75, longitude: 21.23, speed: 54.4, angle: 90, timestamp: new Date(ACUM - 4000).toISOString(), imei: '861000000123456', driver_name: 'Ion', io: { x: 1 } };
let p = L.pentruPagina({ link: LINK, poz: POZ, nume: 'Volvo FH', numar: 'B 01 TIR', firma: 'CI Transport', semnal: null }, ACUM);
T('în mers: „În mers · 54 km/h", poziția, unghiul, „Poziție acum câteva secunde"', p.activ && p.inMers && !p.tacut && p.stare === 'În mers · 54 km/h' && p.actualizat === 'Poziție acum câteva secunde'
  && p.pozitie.lat === 45.75 && p.pozitie.lng === 21.23 && p.pozitie.unghi === 90 && p.pozitie.viteza === 54 && p.pana === '16:14' && p.ramas === 'încă 14 minute', J(p));
const CHEI = ['activ', 'vehicul', 'firma', 'expiraLa', 'pana', 'ramas', 'reimprospatare', 'pozitie', 'stare', 'actualizat', 'tacut', 'inMers'];
T('spre public pleacă DOAR cheile știute — fără IMEI, fără șofer, fără semnalele mașinii', Object.keys(p).every((k) => CHEI.indexOf(k) >= 0) && J(Object.keys(p.pozitie)) === J(['lat', 'lng', 'unghi', 'viteza', 'ts'])
  && J(p).indexOf('861000000123456') < 0 && J(p).indexOf('Ion') < 0 && J(p).indexOf('"io"') < 0, J(p));
p = L.pentruPagina({ link: LINK, poz: Object.assign({}, POZ, { speed: 2 }), nume: 'Volvo FH', numar: 'B 01 TIR', semnal: null }, ACUM);
T('sub 3 km/h: „Oprit"', !p.inMers && p.stare === 'Oprit' && p.firma === null, J(p));
p = L.pentruPagina({ link: LINK, poz: POZ, nume: 'Volvo FH', semnal: 'fără semnal de 2 ore' }, ACUM);
T('mașina tace: „Fără semnal de 2 ore — ultima poziție cunoscută" (cuvintele Inventarului), nu „în mers"', p.tacut && !p.inMers && p.stare === 'Fără semnal de 2 ore — ultima poziție cunoscută', J(p));
p = L.pentruPagina({ link: LINK, poz: POZ, nume: 'Volvo FH', semnal: 'tăcut de 45 min' }, ACUM);
T('„tăcut de 45 min" → „Fără semnal de 45 min — …"', p.stare === 'Fără semnal de 45 min — ultima poziție cunoscută', p.stare);
p = L.pentruPagina({ link: LINK, poz: null, nume: 'Volvo FH' }, ACUM);
T('fără nicio poziție: o spune, nu inventează un loc', p.pozitie === null && p.stare === 'Mașina n-a transmis încă nicio poziție.' && p.actualizat === null, J(p));
T('textul pentru un link care nu mai e bun', L.TITLU_INCHEIAT === 'Locația nu mai e distribuită' && L.TEXT_INCHEIAT === 'Linkul a expirat sau a fost oprit.');
// „Prelungește" (Robert, 23.10: „da" la varianta c): aceleași durate, adăugate la ora de final, cel mult 8 ore înainte de acum.
let pr = L.prelungire(ACUM + 15 * 60000, 60, ACUM);
T('prelungirea se ADAUGĂ la ora de final: 16:15 + 1 oră = 17:15', pr.gata && pr.expiraLa === ACUM + 75 * 60000 && !pr.taiat
  && pr.text === 'Linkul merge acum până la 17:15. Cine îl are vede singur noua oră.', J(pr));
pr = L.prelungire(ACUM + 7 * 3600000, 480, ACUM);
T('cel mult 8 ore înainte de acum: 23:00 + 8 ore → 00:00, și o spune', pr.gata && pr.expiraLa === ACUM + 8 * 3600000 && pr.taiat
  && pr.text === 'Linkul merge acum până la 00:00 (cel mult 8 ore de acum). Cine îl are vede singur noua oră.', J(pr));
pr = L.prelungire(ACUM + 8 * 3600000, 15, ACUM);
T('deja la 8 ore înainte: nu se prelungește, cu motivul', !pr.gata && pr.text === 'Linkul merge deja până la 00:00: mai mult de 8 ore înainte nu se poate.', J(pr));
T('un link expirat nu se prelungește (se face altul)', !L.prelungire(ACUM, 60, ACUM).gata && L.prelungire(ACUM - 1, 60, ACUM).text === L.TEXT_PRELUNGIRE_EXPIRAT
  && L.TEXT_PRELUNGIRE_EXPIRAT === 'Linkul nu mai există: a expirat sau a fost oprit. Fă altul.');
T('cu cât: doar duratele din listă', !L.prelungire(ACUM + 60000, 7, ACUM).gata && L.prelungire(ACUM + 60000, 7, ACUM).text === 'Alege cu cât: 15 minute, 1 oră, 8 ore.');
T('butonul „Prelungește" doar cât mai e de câștigat cel puțin un minut', L.poatePrelungi(ACUM + 60000, ACUM) && L.poatePrelungi(ACUM + 479 * 60000, ACUM)
  && !L.poatePrelungi(ACUM + 479.5 * 60000, ACUM) && !L.poatePrelungi(ACUM + 8 * 3600000, ACUM) && !L.poatePrelungi(ACUM, ACUM));
T('nota de sub linkuri, din cifra codului (8 ore)', L.MAX_INAINTE_MINUTE === 480 && L.TEXT_PRELUNGIRE === 'Poți prelungi un link de câte ori vrei, cel mult 8 ore înainte.', L.TEXT_PRELUNGIRE);

// ─── 2. Pagina publică ────────────────────────────────────────────────────────────────────────────────────────────
sect('2. Pagina publică (public/locatie.html)');
T('pagina există', pagina.length > 2000);
T('Nunito, din Google Fonts, cu greutățile casei', pagina.indexOf('family=Nunito:wght@400;500;600;700;800') >= 0 && /font:[^;]*'Nunito'/.test(pagina));
T('fără alt font de text (nici monospace, nici Inter)', !/monospace|'Inter'|"Inter"/.test(pagina));
T('sigla oficială: monograma + „Track"', /<img src="\/logo-mark\.png" alt="RA"><span class="raw">Track<\/span>/.test(pagina));
T('nu se indexează (meta + antetul serverului)', /<meta name="robots" content="noindex, nofollow">/.test(pagina) && /X-Robots-Tag', 'noindex, nofollow'/.test(server));
T('merge pe telefon: viewport, marginile ecranului (safe-area), cartonașul jos; pe calculator plutește în stânga',
  /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/.test(pagina) && /safe-area-inset-bottom/.test(pagina)
  && /\.fisa\{position:fixed;[^}]*bottom:0/.test(pagina) && /@media \(min-width:760px\)\{\s*\.fisa\{left:16px;right:auto;bottom:16px;width:360px/.test(pagina));
T('butoanele se apasă cu degetul (cel puțin 44 px)', /\.btn\{[^}]*min-height:44px/.test(pagina));
T('fără cookie-uri și fără analiză de trafic (nici consent.js, nici Google Analytics)', !/consent\.js|googletagmanager|gtag\(/.test(pagina) && /credentials: 'omit'/.test(pagina));
const scriptPag = taie(pagina, "(function () {\n    'use strict';", '})();');
T('cere poziția de la ruta publică, la câte secunde spune serverul', /fetch\('\/api\/public\/locatie\/' \+ encodeURIComponent\(token\)/.test(scriptPag) && /j\.reimprospatare/.test(scriptPag));
T('ce vine de la server se scrie cu textContent (nu innerHTML)', scriptPag.length > 1000 && !/\.innerHTML\s*=/.test(scriptPag) && /\$\('vehicul'\)\.textContent = /.test(scriptPag));
T('linkul care nu mai e bun: mașina și urma dispar de pe hartă și nu se mai cere nimic', /function termina\(j\) \{[\s\S]*?incheiat = true;[\s\S]*?removeLayer\(marker\)[\s\S]*?removeLayer\(urma\)[\s\S]*?\$\('fisa'\)\.hidden = true/.test(scriptPag)
  && /r\.status === 404/.test(scriptPag));
T('fila ascunsă nu mai cere (bateria telefonului); la întoarcere cere pe loc', /visibilitychange[\s\S]{0,160}clearTimeout\(timer\)[\s\S]{0,80}cere\(\)/.test(scriptPag));
T('urma de pe hartă = doar ce s-a văzut de când e deschisă pagina (serverul nu dă istoric)', /puncte\.push\(tinta\)/.test(scriptPag) && J(CHEI).indexOf('istoric') < 0);
T('„Centrează" și harta mutată de om (nu-l trage înapoi)', /harta\.on\('dragstart', function \(\) \{ urmareste = false;/.test(scriptPag));
T('Leaflet 1.9.4, ca aplicația', /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/.test(pagina) && /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css/.test(pagina));
T('serviciul offline nu ține pagina în cache (linkul trăiește cel mult 8 ore)', /url\.pathname\.startsWith\('\/locatie\/'\)\) return;/.test(sw));

// ─── 3. Aplicația ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Aplicația (fișa mașinii)');
const blocApp = taie(html, '// ── începe „Distribuie locația” (21.10) ──', '// ── sfârșit „Distribuie locația” ──');
T('blocul există', blocApp.length > 2000);
T('butonul „Distribuie" stă în fișa mașinii, ascuns până știm că omul îl poate folosi',
  /<div class="detail-actions">[\s\S]{0,900}id="detail-share-btn" onclick="locDistribuie\(\)" style="display:none"/.test(html) && /b\.style\.display = \(u && u\.poateDistribuiLocatia\) \? '' : 'none'/.test(blocApp));
T('butonul se potrivește la fiecare mașină deschisă', /detailPanelImei = imei;\n\s*locButon\(\);/.test(html));
T('regula „cine poate" e a serverului: /api/me dă poateDistribuiLocatia, cu aceeași funcție ca rutele',
  /poateDistribuiLocatia: _poateDistribuiLocatia\(req\)/.test(server) && (server.match(/if \(!_poateDistribuiLocatia\(req\)\) return res\.status\(403\)/g) || []).length === 4);   // lista, facerea, „Oprește", „Prelungește"
T('fereastra: alegerea duratei, linkul, Copiază, WhatsApp, linkurile active cu „Oprește"',
  /id="loc-modal"/.test(html) && /id="loc-durate"/.test(html) && /onclick="locCopiaza\(\)"/.test(html) && /onclick="locWhatsapp\(\)"/.test(html) && /id="loc-active"/.test(html) && /x\.textContent = 'Oprește'/.test(blocApp));
T('duratele vin de la server (pagina nu le scrie)', /_loc\.durate = x\.j\.durate/.test(blocApp) && !/'15 minute'|'8 ore'|480/.test(blocApp));
T('mesajul pentru WhatsApp e cel al serverului', /wa\.me\/\?text=' \+ encodeURIComponent\(_loc\.mesaj\)/.test(blocApp) && /_loc\.mesaj = x\.j\.mesaj/.test(blocApp));
T('textele de la server se pun cu textContent', !/innerHTML/.test(blocApp));
T('„Oprește" întreabă întâi', /raConfirm\('Oprești linkul\? Cine îl are nu mai vede mașina\.'/.test(blocApp));
T('„Prelungește": pe rândul linkului, doar când serverul spune că se poate; „Cu cât?" = duratele serverului',
  /if \(l\.poatePrelungi\) \{[\s\S]{0,200}pr\.textContent = 'Prelungește';/.test(blocApp) && /_loc\.durate\.forEach\(function \(d\) \{[\s\S]{0,160}o\.textContent = '\+' \+ d\.text;/.test(blocApp)
  && /'\/prelungire', \{\s*method: 'POST'/.test(blocApp) && /body: JSON\.stringify\(\{ minute: minute \}\)/.test(blocApp));
T('după prelungire: textul serverului; nota de sub linkuri vine tot de la server', /_locBine\(j\.text \|\| ''\)/.test(blocApp) && /nota\.textContent = x\.j\.prelungire \|\| ''/.test(blocApp)
  && /id="loc-ok" role="status"/.test(html) && /id="loc-prel-nota" hidden/.test(html));
const clase = ['loc-modal', 'loc-masina', 'loc-intro', 'loc-et', 'loc-durate', 'loc-dur', 'loc-link-rand', 'loc-btn', 'loc-trimite', 'loc-nota', 'loc-err', 'loc-active-cap', 'loc-act', 'loc-act-t', 'loc-act-a', 'loc-act-b', 'loc-stop',
  'loc-act-bt', 'loc-prel', 'loc-prel-alege', 'loc-prel-et', 'loc-prel-d', 'loc-ok'];
const faraStil = clase.filter((c) => css.indexOf('.' + c + ' ') < 0 && css.indexOf('.' + c + '.') < 0 && css.indexOf('.' + c + ':') < 0 && css.indexOf('.' + c + ',') < 0);
T('fiecare piesă a ferestrei are stil în app.css (pe variabilele temei)', !faraStil.length, faraStil.join(', '));
T('durata aleasă: fundal verde, text închis (regula casei)', /\.loc-dur\.on \{ background: var\(--accent\); border-color: var\(--accent\); color: #06210F; \}/.test(css));

// ─── 3c. Telefonul ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('3c. Telefonul (fișa mașinii, APK)');
const tFoaie = citeste('mobile/src/components/DistribuieLocatia.tsx'), tCss = citeste('mobile/src/components/distribuieLocatia.css');
const tFisa = citeste('mobile/src/screens/VehicleDetail.tsx'), tApi = citeste('mobile/src/api/endpoints.ts'), tIcon = citeste('mobile/src/components/Icon.tsx');
T('foaia există și e deschisă din fișa mașinii, doar cui poate (poateDistribuiLocatia de la server)',
  tFoaie.length > 2000 && /me\.value\?\.poateDistribuiLocatia && <button class="d-act" onClick=\{\(\) => setDistribuie\(true\)\}>/.test(tFisa) && /<DistribuieLocatia imei=\{imei\}/.test(tFisa) && /poateDistribuiLocatia\?: boolean/.test(tApi));
T('aceleași rute ca pagina web', /'\/api\/devices\/' \+ encodeURIComponent\(imei\) \+ '\/locatie-distribuita'/.test(tApi) && /method: 'POST', body: \{ minute \}/.test(tApi) && /'\/locatie-distribuita\/' \+ encodeURIComponent\(String\(id\)\), \{ method: 'DELETE' \}/.test(tApi));
T('duratele și mesajul vin de la server (telefonul nu le scrie)', /setDurate\(d\)/.test(tFoaie) && /mesaj: r\.mesaj/.test(tFoaie) && !/'15 minute'|'8 ore'|480/.test(tFoaie));
T('„Trimite” = foaia de partajare a telefonului; „Oprește” întreabă întâi', /Share\.share\(\{ title: 'Locație live', text: facut\.mesaj \}\)/.test(tFoaie) && /Oprești linkul\?/.test(tFoaie) && /Cine îl are nu mai vede mașina\./.test(tFoaie));
T('„înapoi” pe Android închide întâi întrebarea, apoi foaia', /useInapoiInchide\(true, \(\) => \{ if \(deOprit\) \{ setDeOprit\(null\); return true; \} onClose\(\); return true; \}\)/.test(tFoaie));
T('alt vehicul deschis → foaia se închide', /setShowMap\(false\); setDistribuie\(false\);/.test(tFisa));
T('iconița „share” există', /\| 'share';/.test(tIcon) && /\n  share: '<circle/.test(tIcon));
T('„Prelungește” pe telefon: aceeași rută, doar când serverul spune că se poate, duratele și textele serverului',
  /'\/prelungire', \{ method: 'POST', body: \{ minute \} \}/.test(tApi) && /poatePrelungi\?: boolean/.test(tApi) && /\{l\.poatePrelungi && \(/.test(tFoaie)
  && /Api\.prelungesteLocatieDistribuita\(imei, l\.id, m\)/.test(tFoaie) && /showToast\(r\.text \|\| /.test(tFoaie) && /setNotaPrel\(r\.prelungire \|\| ''\)/.test(tFoaie)
  && /\{'\+' \+ d\.text\}/.test(tFoaie));
const tClase = ['dl-sheet', 'dl-masina', 'dl-intro', 'dl-et', 'dl-durate', 'dl-dur', 'dl-fa', 'dl-link', 'dl-nota', 'dl-err', 'dl-cap', 'dl-act', 'dl-act-t', 'dl-act-a', 'dl-act-b', 'dl-stop',
  'dl-act-bt', 'dl-prel', 'dl-prel-et', 'dl-prel-d'];
const tFara = tClase.filter((c) => tCss.indexOf('.' + c + ' ') < 0 && tCss.indexOf('.' + c + '.') < 0);
T('fiecare clasă a foii are stil; durata aleasă: fundal verde, text închis', !tFara.length && /\.dl-dur\.on \{ background: var\(--accent\); border-color: var\(--accent\); color: #06210F; \}/.test(tCss), tFara.join(', '));
T('clasele foii nu se bat cu cele ale hărții din Flotă (loc-)', !/\.loc-/.test(tCss) && !/class="loc-|'loc-/.test(tFoaie));
const vGr = (citeste('mobile/android/variables.gradle').match(/appVersionName = '([^']+)'/) || [])[1], vCl = (citeste('mobile/src/api/client.ts').match(/APP_VERSIUNE = '([^']+)'/) || [])[1];
T('versiunea aplicației e aceeași în build și în ce trimite serverului (1.0.21+, cu „Prelungește”)', vGr && vGr === vCl && vGr.localeCompare('1.0.21', undefined, { numeric: true }) >= 0, vGr + ' / ' + vCl);

// ─── 3b. Baza și copiile ──────────────────────────────────────────────────────────────────────────────────────────
sect('3b. Baza, copiile, jurnalul');
T('tabela ține amprenta, nu tokenul', /CREATE TABLE IF NOT EXISTS locatii_distribuite \(\s*id SERIAL PRIMARY KEY,\s*token_hash CHAR\(64\) NOT NULL UNIQUE/.test(db) && !/locatii_distribuite[^;]*\btoken\b(?!_hash)/.test(taie(db, 'CREATE TABLE IF NOT EXISTS locatii_distribuite', ')')));
T('serverul scrie în bază doar amprenta', /amprenta: locatieDistribuita\.amprenta\(token\)/.test(server) && !/creeazaLocatieDistribuita\(\{[^}]*\btoken\b[,}]/.test(server));
T('copiile nu țin linkurile (trăiesc cel mult 8 ore)', /locatii_distribuite:/.test(taie(backup, 'BACKUP_EXCLUDED', '};')));
T('curățenia la minut + în jurnalul de audit facerea și oprirea', /setInterval\(\(\) => db\.stergeLocatiiDistribuiteExpirate\(Date\.now\(\)\)\.catch\(\(\) => \{\}\), 60 \* 1000\)/.test(server)
  && /auditReq\(req, 'create', 'locatie_distribuita'/.test(server) && /auditReq\(req, 'delete', 'locatie_distribuita'/.test(server)
  && /auditReq\(req, 'update', 'locatie_distribuita', imei, \{ id: l\.id, minute: Number\(minute\), de_la: /.test(server));
T('prelungirea scrie în bază doar dacă linkul e cel citit (două apăsări deodată nu trec de plafon)',
  /UPDATE locatii_distribuite SET expira_la = \$4 WHERE id = \$1 AND imei = \$2 AND expira_la = \$3 RETURNING/.test(db));

// ─── 4. Pe server pornit ──────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3497, DIR = '.locatie-distribuita-db';
try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', DEMO_DISABLED: 'true', BASE_URL: 'https://ratrack.ro',
  SESSION_SECRET: 'ci_locatie_distribuita', PORT: String(PORT), TCP_PORT: '5497', PGLITE_DIR: DIR + '/pgdata', DATABASE_URL: '' };
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 400);
}
async function intra(user, parola) {
  const lr = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: user, password: parola }) });
  if (!lr.ok) throw new Error('nu m-am putut autentifica ca ' + user + ' (' + lr.status + ')');
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const js = async (m, u, bb) => { const x = await fetch(B + u, { method: m, headers: H, body: bb === undefined ? undefined : J(bb) }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  return { GET: (u) => js('GET', u), POST: (u, bb) => js('POST', u, bb === undefined ? {} : bb), PUT: (u, bb) => js('PUT', u, bb), DEL: (u) => js('DELETE', u) };
}
// Publicul: fără cookie, fără nimic.
const pub = async (token) => { const x = await fetch(B + '/api/public/locatie/' + token); return { s: x.status, h: x.headers, j: await x.json().catch(() => ({})) }; };
const tokenDin = (link) => String(link || '').split('/locatie/')[1] || '';
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const S = await intra('admin', 'test1234');
  sect('4. Pe server pornit');
  const T1 = (await S.POST('/api/companies', { name: 'CI Transport Live' })).j.id;
  const T2 = (await S.POST('/api/companies', { name: 'CI Alt Transport' })).j.id;
  const IM1 = '861000000480001', IM2 = '861000000480002', IM3 = '861000000480003';
  await S.POST('/api/devices', { imei: IM1, name: 'Volvo FH', plate: 'B 01 LIV', company_id: T1, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: IM2, name: 'Scania', plate: 'B 02 LIV', company_id: T2, vehicle_type: 'Autotractor' });
  await S.POST('/api/devices', { imei: IM3, name: 'Logan', plate: 'B 03 LIV', company_id: T1, vehicle_type: 'Auto' });
  const conturi = {}, ids = {};
  for (const [u, nume, rol, co] of [['adm1@ci.ro', 'Admin Unu', 'company_admin', T1], ['disp1@ci.ro', 'Dispecer Unu', 'dispatcher', T1],
    ['ion@ci.ro', 'Ion Vizualizator', 'viewer', T1], ['adm2@ci.ro', 'Admin Doi', 'company_admin', T2]]) {
    const cr = await S.POST('/api/users', { username: u, full_name: nume, role: rol, company_id: co });
    ids[u] = cr.j.id;
    await puneParola(cr.j, 'Str4da-Verde-2026', B);
    conturi[u] = await intra(u, 'Str4da-Verde-2026');
  }
  const A1 = conturi['adm1@ci.ro'], D1 = conturi['disp1@ci.ro'], V1 = conturi['ion@ci.ro'], A2 = conturi['adm2@ci.ro'];
  await A1.PUT('/api/users/' + ids['disp1@ci.ro'] + '/access', { devices: [IM1], groups: [] });
  await A1.PUT('/api/users/' + ids['ion@ci.ro'] + '/access', { devices: [IM1, IM3], groups: [] });
  await S.POST('/api/test/simulate', { imei: IM1, speed: 54, angle: 90, lat: 45.7489, lng: 21.2087 });

  // cine poate
  const me = await Promise.all([S, A1, D1, V1].map((c) => c.GET('/api/me')));
  T('/api/me: noi, adminul și dispecerul pot; vizualizatorul nu', me[0].j.poateDistribuiLocatia === true && me[1].j.poateDistribuiLocatia === true && me[2].j.poateDistribuiLocatia === true && me[3].j.poateDistribuiLocatia === false, J(me.map((x) => x.j.poateDistribuiLocatia)));
  let x = await V1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  const xv = await V1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 60 });
  T('vizualizatorul: 403 cu motivul, și nu poate face link', x.s === 403 && xv.s === 403 && /administratorul, managerul sau dispecerul/.test(x.j.error), J([x, xv]));
  x = await A2.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  const x2 = await A2.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 60 });
  T('altă firmă: 404 (mașina „nu există")', x.s === 404 && x2.s === 404, J([x.s, x2.s]));
  x = await D1.POST('/api/devices/' + IM3 + '/locatie-distribuita', { minute: 60 });
  T('dispecerul doar pe mașinile date lui', x.s === 404, x.s);
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  T('lista: duratele serverului, nimic activ', x.s === 200 && J(x.j.durate) === J(L.DURATE) && Array.isArray(x.j.active) && x.j.active.length === 0 && x.j.max === L.MAX_ACTIVE_PE_MASINA, J(x));
  x = await A1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 7 });
  T('o durată care nu e în listă: 400, cu duratele pe nume', x.s === 400 && x.j.error === 'Alege cât timp: 15 minute, 1 oră, 8 ore.', J(x));

  // linkul
  const f = await A1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 60 });
  const tok = tokenDin(f.j.link);
  T('linkul: pe adresa site-ului, cu tokenul de 32 de caractere', f.s === 200 && /^https:\/\/ratrack\.ro\/locatie\/[A-Za-z0-9_-]{32}$/.test(f.j.link) && f.j.durata === '1 oră' && f.j.ramas === 'încă 1 oră', J(f));
  T('mesajul pentru WhatsApp: mașina, ora, linkul', f.j.mesaj === 'Urmărește live Volvo FH · B 01 LIV pe hartă, până la ' + f.j.pana + ': ' + f.j.link, f.j.mesaj);
  let pb = await pub(tok);
  T('oricine are linkul vede mașina, FĂRĂ cont', pb.s === 200 && pb.j.activ === true && pb.j.vehicul === 'Volvo FH · B 01 LIV' && pb.j.firma === 'CI Transport Live'
    && pb.j.stare === 'În mers · 54 km/h' && Math.abs(pb.j.pozitie.lat - 45.7489) < 1e-6 && Math.abs(pb.j.pozitie.lng - 21.2087) < 1e-6 && pb.j.pozitie.unghi === 90 && pb.j.reimprospatare === 5, J(pb.j));
  T('publicul nu primește IMEI-ul, șoferul sau alte chei', J(pb.j).indexOf(IM1) < 0 && Object.keys(pb.j).every((k) => CHEI.indexOf(k) >= 0), J(pb.j));
  T('răspunsul public: fără cache, fără indexare', /no-store/.test(pb.h.get('cache-control') || '') && pb.h.get('x-robots-tag') === 'noindex, nofollow', J([pb.h.get('cache-control'), pb.h.get('x-robots-tag')]));
  await S.POST('/api/test/simulate', { imei: IM1, speed: 0, angle: 180, lat: 45.75, lng: 21.21 });
  pb = await pub(tok);
  T('poziția nouă se vede la următoarea cerere („live")', pb.j.stare === 'Oprit' && Math.abs(pb.j.pozitie.lat - 45.75) < 1e-6 && pb.j.pozitie.unghi === 180, J(pb.j));
  const pg = await fetch(B + '/locatie/' + tok);
  const pgt = await pg.text();
  T('pagina /locatie/<token>: se deschide fără cont, fără indexare', pg.status === 200 && /Locație live/.test(pgt) && pg.headers.get('x-robots-tag') === 'noindex, nofollow' && /no-store/.test(pg.headers.get('cache-control') || ''), pg.status);
  const inventat = await pub(L.tokenNou()), stricat = await pub('abc'), gol = await pub('%20');
  T('un link inventat sau stricat arată ca unul expirat (nu spune nimic în plus)', inventat.s === 404 && stricat.s === 404 && gol.s === 404
    && J(inventat.j) === J({ activ: false, titlu: L.TITLU_INCHEIAT, text: L.TEXT_INCHEIAT }) && J(stricat.j) === J(inventat.j), J([inventat, stricat]));
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  T('lista arată linkul activ: până când, cât mai ține, făcut de tine', x.j.active.length === 1 && x.j.active[0].id === f.j.id && x.j.active[0].alMeu === true && x.j.active[0].creatDe === 'Admin Unu' && x.j.active[0].ramas === 'încă 1 oră', J(x.j.active));
  T('lista nu mai arată linkul (se vede o singură dată, când e făcut)', J(x.j).indexOf(tok) < 0 && J(x.j).indexOf('/locatie/') < 0, J(x.j));
  const fd = await D1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 15 });
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  const deDisp = x.j.active.find((l) => l.id === fd.j.id);
  T('dispecerul face și el link; adminul îl vede cu numele lui', fd.s === 200 && x.j.active.length === 2 && deDisp && deDisp.creatDe === 'Dispecer Unu' && deDisp.alMeu === false, J(x.j.active));

  // „Oprește"
  x = await A1.DEL('/api/devices/' + IM3 + '/locatie-distribuita/' + fd.j.id);
  T('„Oprește" pe altă mașină decât a linkului: 404', x.s === 404, x.s);
  x = await V1.DEL('/api/devices/' + IM1 + '/locatie-distribuita/' + fd.j.id);
  T('vizualizatorul nu oprește', x.s === 403, x.s);
  x = await A1.DEL('/api/devices/' + IM1 + '/locatie-distribuita/' + fd.j.id);
  pb = await pub(tokenDin(fd.j.link));
  T('„Oprește": linkul nu mai merge din clipa aceea', x.s === 200 && /Linkul s-a oprit/.test(x.j.text) && pb.s === 404 && pb.j.activ === false, J([x, pb]));
  x = await A1.DEL('/api/devices/' + IM1 + '/locatie-distribuita/' + fd.j.id);
  T('a doua oprire: 404 cu motivul', x.s === 404 && /a expirat sau a fost oprit/.test(x.j.error), J(x));

  // „Prelungește" (23.10)
  const fp = await A1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 15 });
  const tokP = tokenDin(fp.j.link), urlP = '/api/devices/' + IM1 + '/locatie-distribuita/' + fp.j.id + '/prelungire';
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  const rp = x.j.active.find((l) => l.id === fp.j.id);
  T('lista: linkul de 15 minute se poate prelungi; nota serverului', rp && rp.poatePrelungi === true && x.j.prelungire === L.TEXT_PRELUNGIRE, J(x.j));
  x = await V1.POST(urlP, { minute: 60 });
  const xp2 = await A2.POST(urlP, { minute: 60 });
  const xp3 = await A1.POST('/api/devices/' + IM3 + '/locatie-distribuita/' + fp.j.id + '/prelungire', { minute: 60 });
  T('vizualizatorul nu prelungește (403); altă firmă și altă mașină: 404', x.s === 403 && xp2.s === 404 && xp3.s === 404, J([x.s, xp2.s, xp3.s]));
  x = await A1.POST(urlP, { minute: 7 });
  T('cu cât: o durată din afara listei → 400, cu duratele pe nume', x.s === 400 && x.j.error === 'Alege cu cât: 15 minute, 1 oră, 8 ore.', J(x));
  const inainte = (await pub(tokP)).j.expiraLa;
  x = await A1.POST(urlP, { minute: 60 });
  pb = await pub(tokP);
  T('+1 oră: ora de final se mută cu o oră, pe ACELAȘI link; pagina publică vede singură ora nouă',
    x.s === 200 && pb.s === 200 && pb.j.expiraLa === inainte + 3600000 && pb.j.pana === x.j.pana && x.j.text === 'Linkul merge acum până la ' + x.j.pana + '. Cine îl are vede singur noua oră.'
    && x.j.taiat === false && x.j.poatePrelungi === true, J([x, pb.j.expiraLa - inainte]));
  x = await D1.POST(urlP, { minute: 480 });
  pb = await pub(tokP);
  T('dispecerul prelungește și el; +8 ore se oprește la 8 ore de acum și o spune', x.s === 200 && x.j.taiat === true && /\(cel mult 8 ore de acum\)/.test(x.j.text)
    && Math.abs(pb.j.expiraLa - (Date.now() + 8 * 3600000)) < 60000 && x.j.poatePrelungi === false, J([x, pb.j.expiraLa - Date.now()]));
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  const xp4 = await A1.POST(urlP, { minute: 15 });
  T('la plafon: fără „Prelungește" în listă, iar o cerere tot trimisă → 409 cu motivul', x.j.active.find((l) => l.id === fp.j.id).poatePrelungi === false
    && xp4.s === 409 && /mai mult de 8 ore înainte nu se poate/.test(xp4.j.error), J([x.j.active, xp4]));
  x = await A1.DEL('/api/devices/' + IM1 + '/locatie-distribuita/' + fp.j.id);
  const xp5 = await A1.POST(urlP, { minute: 15 });
  T('oprit → nu se mai prelungește (404, „fă altul")', x.s === 200 && xp5.s === 404 && xp5.j.error === L.TEXT_PRELUNGIRE_EXPIRAT && (await pub(tokP)).s === 404, J(xp5));

  // expirarea
  const f15 = await A1.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 15 });
  T('linkul de 15 minute merge acum', (await pub(tokenDin(f15.j.link))).s === 200);
  x = await S.POST('/api/test/ceasuri', { acum: Date.now() + 16 * 60000, locatii: true });
  pb = await pub(tokenDin(f15.j.link));
  const pb60 = await pub(tok);
  T('după 15 minute: rândul se șterge, linkul nu mai există; cel de o oră merge încă', x.s === 200 && x.j.locatiiSterse === 1 && pb.s === 404 && pb60.s === 200, J([x.j.locatiiSterse, pb.s, pb60.s]));
  x = await S.POST('/api/test/ceasuri', { acum: Date.now() + 61 * 60000, locatii: true });
  pb = await pub(tok);
  T('după o oră: și cel de o oră s-a dus', x.j.locatiiSterse === 1 && pb.s === 404, J([x.j.locatiiSterse, pb.s]));
  x = await A1.POST('/api/devices/' + IM1 + '/locatie-distribuita/' + f.j.id + '/prelungire', { minute: 60 });
  T('expirat → nu se prelungește (404)', x.s === 404 && x.j.error === L.TEXT_PRELUNGIRE_EXPIRAT, J(x));
  x = await A1.GET('/api/devices/' + IM1 + '/locatie-distribuita');
  T('lista e goală din nou', x.j.active.length === 0, J(x.j.active));

  // plafonul pe mașină
  const facute = [];
  for (let i = 0; i < L.MAX_ACTIVE_PE_MASINA; i++) facute.push(await A2.POST('/api/devices/' + IM2 + '/locatie-distribuita', { minute: 15 }));
  x = await A2.POST('/api/devices/' + IM2 + '/locatie-distribuita', { minute: 15 });
  T('cel mult ' + L.MAX_ACTIVE_PE_MASINA + ' linkuri active pe o mașină, al unsprezecelea: 409', facute.every((r) => r.s === 200) && x.s === 409 && /deja 10 linkuri active/.test(x.j.error), J([facute.map((r) => r.s), x]));

  // mașina mutată pe altă firmă / arhivată
  const fm = await A1.POST('/api/devices/' + IM3 + '/locatie-distribuita', { minute: 60 });
  await S.POST('/api/test/simulate', { imei: IM3, speed: 10, lat: 44.43, lng: 26.1 });
  T('linkul mașinii care va fi mutată merge', (await pub(tokenDin(fm.j.link))).s === 200);
  await S.PUT('/api/devices/' + IM3 + '/company', { company_id: T2 });
  pb = await pub(tokenDin(fm.j.link));
  T('mașina mutată pe altă firmă: linkul făcut de firma veche se oprește pe loc', pb.s === 404, pb.s);
  x = await S.POST('/api/devices/' + IM3 + '/locatie-distribuita/' + fm.j.id + '/prelungire', { minute: 60 });
  T('linkul firmei vechi nu se prelungește nici de noi (404)', x.s === 404, J(x));
  const tokArh = tokenDin(facute[0].j.link);
  T('linkul mașinii care va fi arhivată merge', (await pub(tokArh)).s === 200);
  await S.PUT('/api/devices/' + IM2 + '/status', { status: 'archived' });
  pb = await pub(tokArh);
  x = await S.POST('/api/devices/' + IM2 + '/locatie-distribuita', { minute: 15 });
  T('mașina arhivată: linkurile se opresc pe loc și nu se mai fac altele', pb.s === 404 && x.s >= 400, J([pb.s, x.s]));
  x = await S.POST('/api/devices/' + IM2 + '/locatie-distribuita/' + facute[1].j.id + '/prelungire', { minute: 15 });
  T('mașina arhivată: linkurile ei nu se prelungesc', x.s === 400 && /arhivată/.test(x.j.error), J(x));
  // noi (super-admin) facem link pe orice mașină a unei firme, iar el arată firma mașinii
  const fs1 = await S.POST('/api/devices/' + IM1 + '/locatie-distribuita', { minute: 15 });
  pb = await pub(tokenDin(fs1.j.link));
  T('noi facem link pe mașina unei firme; publicul vede firma mașinii', fs1.s === 200 && pb.s === 200 && pb.j.firma === 'CI Transport Live', J([fs1.s, pb.j.firma]));

  console.log('\n' + ok + ' trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba s-a oprit: ' + (e && e.stack || e)); gata(1); });
