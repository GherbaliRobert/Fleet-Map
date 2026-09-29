// verify_contracte_telefon.js — ecranele „Contracte" de pe telefon spun ACELEAȘI cuvinte ca serverul și web-ul.
//
//   node verify_contracte_telefon.js
//
// Telefonul are o copie a etichetelor (stările contractului, pașii, stările actului adițional, lucrările și
// stările montajului, textele „ce urmează", cuvintele lipsurilor): nu poate cere serverul pentru fiecare desen.
// Copia trebuie să fie IDENTICĂ — altfel un ecran spune „trimis la client" și altul „trimis la semnat". Aceeași
// regulă ca proba `verify_contracte.js`, care păzește copia din index.html.
// Mai verifică și că telefonul NU a copiat reguli de bani (prețul propus pe aparat, tarifele casei) și NU
// descarcă hârtiile ocolind generatorul serverului, plus că ecranele sunt doar ale super-adminului.
// Verifică și că propunerile de preț chiar AJUNG la telefon (serverul le trimite, nu doar telefonul le
// citește), că verdictul „contractul și factura spun același lucru" e identic cu cel de pe web (rulează
// ambele funcții pe aceleași cifre, cu tot cu păstrarea istoricului) și că o anexă nu se salvează cu un aparat
// bifat fără preț.
// Din 24–28.09 (lotul 3): drumul clientului se DESENEAZĂ din ce trimite serverul (nicio copie a pașilor), pasul
// următor și fiecare lipsă au butonul lor cu vorbele web-ului, „Trimite la semnat" nu minte fără SMTP,
// „Completează" scrie doar pe /dosar, textul de după încetare ia cifra de la server, partenerii de montaj stau
// doar în secțiunea Montaj (păzită și ea).
// Din 29.09: „Completează" după un „Trimite" refuzat nu mai lasă o intrare în plus în istoric (butonul „înapoi"),
// „E semnat" nu rescrie cu azi data salvată, dosarul nu pierde ce e scris și nesalvat în formular, iar întrebările
// dosarului se închid la „înapoi".
// Nu pornește niciun server și nu are nevoie de TypeScript: citește fișierele ca text.
const fs = require('fs');
const C = require('./contracts');
const M = require('./montaj');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// Capetele de rând se aduc la „\n": pe Windows, Git scrie fișierele cu CRLF (core.autocrlf), iar tiparele
// de mai jos caută funcții întregi după „\n}". Fără asta proba pica local pe cod bun (29.09) și trecea pe GitHub.
const citesteLF = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const lib = citesteLF('./mobile/src/lib/contracte.ts');
const html = citesteLF('./public/index.html');
const srv = citesteLF('./server.js');
const citeste = (p) => { try { return citesteLF(p); } catch (e) { return ''; } };

// Un obiect/listă literală din sursă, evaluat ca JS. În .ts: `export const NUME: Tip = { … };`
function dinTs(nume, src) {
  // Până la primul „};" / „];" de la capăt de rând (rândurile dinăuntru se termină în „],", nu în „];").
  const m = new RegExp('export const ' + nume + '\\b[^=]*=\\s*([\\[{][\\s\\S]*?[\\]}]);[ \\t]*\\r?\\n').exec(src || lib);
  if (!m) return null;
  try { return new Function('return (' + m[1] + ');')(); } catch (e) { return null; }
}
function dinWeb(nume) {
  const m = new RegExp('var ' + nume + ' = ([\\[{][\\s\\S]*?[\\]}]);').exec(html);
  if (!m) return null;
  try { return new Function('return (' + m[1] + ');')(); } catch (e) { return null; }
}
const J = (x) => JSON.stringify(x);
const ordonat = (o) => J(Object.keys(o || {}).sort().map((k) => [k, o[k]]));

sect('1. Drumul contractului: aceleași stări și aceiași pași ca serverul (contracts.js)');
const STARI = dinTs('CTR_STARI');
T('găsesc etichetele stărilor pe telefon', !!STARI);
if (STARI) {
  T('telefonul cunoaște exact aceleași stări ca serverul',
    Object.keys(STARI).sort().join(',') === Object.keys(C.ETICHETE_STARE).sort().join(','), Object.keys(STARI).join(','));
  Object.keys(C.ETICHETE_STARE).forEach((k) =>
    T('eticheta „' + k + '" e la fel pe telefon', STARI[k] && STARI[k][0] === C.ETICHETE_STARE[k], (STARI[k] || [])[0] + ' ≠ ' + C.ETICHETE_STARE[k]));
  const web = dinWeb('CTR_STARI');
  T('culoarea pastilelor e aceeași ca pe web', !!web && J(web) === J(STARI), J(STARI) + ' ≠ ' + J(web));
}
const PAS = dinTs('CTR_PAS');
T('găsesc pașii pe telefon', !!PAS);
if (PAS) {
  Object.keys(C.URMATORUL_PAS).forEach((k) => {
    const s = C.URMATORUL_PAS[k], t = PAS[k];
    T('după „' + k + '" urmează același pas pe telefon', s == null ? t == null : !!t && t[0] === s[0] && t[1] === s[1], J(t) + ' ≠ ' + J(s));
  });
}
const EXPLIC = dinTs('CTR_EXPLIC'), EXPLIC_WEB = dinWeb('CTR_EXPLIC');
T('găsesc textele „ce urmează" (telefon și web)', !!EXPLIC && !!EXPLIC_WEB);
if (EXPLIC && EXPLIC_WEB) {
  Object.keys(EXPLIC_WEB).forEach((k) => T('„ce urmează" la „' + k + '" e scris la fel', EXPLIC[k] === EXPLIC_WEB[k], J(EXPLIC[k])));
  T('fără texte în plus pe telefon', Object.keys(EXPLIC).length === Object.keys(EXPLIC_WEB).length);
}
const DOS = dinTs('DOSAR_FEL'), DOS_WEB = dinWeb('DOSAR_FEL');
T('culoarea dosarului e aceeași ca pe web', !!DOS && !!DOS_WEB && J(DOS) === J(DOS_WEB), J(DOS) + ' ≠ ' + J(DOS_WEB));

sect('2. Actul adițional: aceleași stări și pași ca pe web');
const AST = dinTs('ACT_STARI_ET'), AST_WEB = dinWeb('ACT_STARI_ET');
T('stările actului sunt la fel', !!AST && !!AST_WEB && J(AST) === J(AST_WEB), J(AST) + ' ≠ ' + J(AST_WEB));
if (AST) Object.keys(AST).forEach((k) => T('starea actului „' + k + '" are același nume ca a contractului', AST[k] === C.ETICHETE_STARE[k], AST[k]));
const APAS = dinTs('ACT_PAS'), APAS_WEB = dinWeb('ACT_PAS');
T('pașii actului sunt la fel', !!APAS && !!APAS_WEB && J(APAS) === J(APAS_WEB), J(APAS) + ' ≠ ' + J(APAS_WEB));

sect('3. Montajul: aceleași lucrări și stări ca serverul (montaj.js)');
const TIP = dinTs('MONTAJ_TIPURI');
T('găsesc lucrările pe telefon', Array.isArray(TIP));
if (Array.isArray(TIP)) {
  T('aceleași lucrări, în aceeași ordine', TIP.map((t) => t[0]).join(',') === M.TIPURI.map((t) => t.k).join(','), TIP.map((t) => t[0]).join(','));
  M.TIPURI.forEach((t) => {
    const x = TIP.find((y) => y[0] === t.k) || [];
    T('lucrarea „' + t.k + '": același nume și aceeași unitate', x[1] === t.et && x[2] === t.um, J(x));
  });
}
const MST = dinTs('MONTAJ_STARI');
T('găsesc stările lucrărilor pe telefon', !!MST);
if (MST) {
  T('aceleași stări, în ordinea în care se întâmplă', Object.keys(MST).join(',') === M.STARI.join(','), Object.keys(MST).join(','));
  M.STARI.forEach((k) => T('starea lucrării „' + k + '" e scrisă la fel', MST[k] === M.ETICHETE_STARE[k], MST[k] + ' ≠ ' + M.ETICHETE_STARE[k]));
}

sect('4. „24 DE luni": acordul cu numerele, ca pe hârtie (contracts.numar)');
const fDe = /export function de\(n: any\): string \{([\s\S]*?)\n\}/.exec(lib);
T('găsesc funcția de acord pe telefon', !!fDe);
if (fDe) {
  const de = new Function('n', fDe[1]);
  const gresite = [];
  for (let n = 2; n <= 250; n++) if (n + de(n) + 'luni' !== C.numar(n, 'lună', 'luni')) gresite.push(n);
  T('„N luni" se scrie ca pe hârtie pentru 2…250', !gresite.length, gresite.slice(0, 10).join(','));
}

sect('5. Telefonul nu hotărăște singur bani și nu ocolește generatorul de hârtii');
// Toate ecranele contractelor + secțiunea Montaj (lotul 3): aceleași verificări de bani, linkuri și hârtii.
const fisiere = ['mobile/src/screens/Contracts.tsx', 'mobile/src/screens/ContractDetail.tsx', 'mobile/src/components/ContractUi.tsx',
  'mobile/src/components/ContractAnexa.tsx', 'mobile/src/components/ContractActe.tsx', 'mobile/src/components/ContractMontaj.tsx',
  'mobile/src/components/ParteneriMontaj.tsx', 'mobile/src/lib/contracte.ts',
  'mobile/src/components/ContractDrum.tsx', 'mobile/src/components/ContractPasi.tsx',
  'mobile/src/screens/Montaj.tsx', 'mobile/src/lib/montajSectiune.ts'];
const cod = fisiere.map((p) => [p, citeste(p)]);
cod.forEach(([p, s]) => T('există ' + p, !!s));
const tot = cod.map((x) => x[1]).join('\n');
const anexaTsx = citeste('mobile/src/components/ContractAnexa.tsx'), montajTsx = citeste('mobile/src/components/ContractMontaj.tsx');
const acteTsx = citeste('mobile/src/components/ContractActe.tsx'), partTsx = citeste('mobile/src/components/ParteneriMontaj.tsx');
const uiTsx = citeste('mobile/src/components/ContractUi.tsx');
const drumTsx = citeste('mobile/src/components/ContractDrum.tsx'), pasiTsx = citeste('mobile/src/components/ContractPasi.tsx');
const listTsx = citeste('mobile/src/screens/Contracts.tsx'), detTsx = citeste('mobile/src/screens/ContractDetail.tsx');
const fisaTsx = citeste('mobile/src/screens/CompanySheet.tsx'), mjTsx = citeste('mobile/src/screens/Montaj.tsx');
const mjLib = citeste('mobile/src/lib/montajSectiune.ts'), endp = citeste('mobile/src/api/endpoints.ts');
// Doar ecranele contractelor clienților (fără Montaj, care are partenerii lui).
const totCtr = [listTsx, detTsx, uiTsx, anexaTsx, acteTsx, drumTsx, pasiTsx, lib].join('\n');
// Codul fără comentarii: „nicio copie a regulii" se caută în cod — un comentariu care spune de unde vine
// regula („contracts.drumulClientului", „stareDosar") e bine-venit.
// (Un comentariu începe la început de rând / după spațiu / după „{" din JSX — nu în „image/*" dintr-un `accept=`.)
const faraComentarii = (s) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');
const codCtr = faraComentarii(totCtr + '\n' + fisaTsx);
// Regula „cu CAN → prețul CAN, FMS → prețul FMS" și tarifele casei stau pe server (pret_sugerat / „Prețurile noastre").
['priceCanRON', 'priceNoneRON', 'priceFmsRON', 'pricePerVehicleRON', '_OF_PRETURI_DEF', '_ofTarifeDeBaza'].forEach((k) =>
  T('nicio copie de tarif pe telefon: „' + k + '"', tot.indexOf(k) < 0));
// Numele rândurilor din „Prețurile noastre" (mGps…) pot apărea — telefonul le cere serverului după nume —,
// dar niciodată cu o cifră lângă ele (ar fi o copie a tarifului, care ar rămâne în urmă).
const cifra = /\b(m(Gps|LvCan|CanInc|Fms|Uninstall|Replace|Travel)|p(Plain|Can|Fms))\s*:\s*\d/.exec(tot);
T('niciun tarif scris cu cifre pe telefon', !cifra, cifra && cifra[0]);

// 5a. Prețul propus pe aparat (Anexa nr. 1): îl socotește SERVERUL, din oferta firmei.
T('prețul propus pe aparat vine de la server (pret_sugerat)', /pret_sugerat/.test(anexaTsx));
const iOv = srv.indexOf("app.get('/api/companies/:id/overview'");
const blocOv = iOv >= 0 ? srv.slice(iOv, srv.indexOf('\napp.', iOv + 10)) : '';
T('găsesc /api/companies/:id/overview în server.js', !!blocOv);
T('SERVERUL trimite prețul propus pe fiecare aparat (`pret_sugerat` în vehicles din /overview) — lipsește din server.js',
  /\bpret_sugerat\s*[:=]/.test(blocOv));
// Până atunci (și oricând lipsește prețul): anexa nu pleacă cu un aparat bifat fără preț.
T('„Salvează anexa" refuză un aparat bifat fără preț (Anexa nr. 1)', /faraPret\(rd\)/.test(anexaTsx) && /Scrie abonamentul lunar pentru/.test(anexaTsx));
T('actul adițional refuză un aparat bifat fără preț (anexa nouă)', /Scrie abonamentul lunar pentru/.test(acteTsx));

// 5b. Tariful casei la montaj: /overview (`tarife_montaj`) SAU „Prețurile noastre" din calculatorul serverului.
T('tarifele de montaj ale casei vin de la server (tarife_montaj)', /tarife_montaj/.test(detTsx));
const srvTarife = /\btarife_montaj\s*:/.test(blocOv);
const RAND = dinTs('MONTAJ_RAND_TARIF');
const casaWeb = {};
const mCasa = /function _raxMontTarifeOferta\(\) \{[\s\S]*?var casa = (\{[^}]*\});/.exec(html);
if (mCasa) mCasa[1].replace(/(\w+):\s*p\.(\w+)/g, (_, k, v) => { casaWeb[k] = v; });
T('găsesc potrivirea lucrare → tarif pe web (_raxMontTarifeOferta)', Object.keys(casaWeb).length > 0);
T('potrivirea lucrare → rândul din „Prețurile noastre" e aceeași ca pe web', !!RAND && ordonat(RAND) === ordonat(casaWeb), ordonat(RAND) + ' ≠ ' + ordonat(casaWeb));
if (RAND) {
  T('fiecare lucrare de montaj are rândul ei de tarif', M.TIPURI.every((t) => !!RAND[t.k]), M.TIPURI.map((t) => t.k).filter((k) => !RAND[k]).join(','));
  Object.keys(RAND).forEach((k) => T('rândul „' + RAND[k] + '" există în „Prețurile noastre" (web)', new RegExp("\\['" + RAND[k] + "',").test(html)));
}
const calcPreturi = /if \(b\.preturi\)/.test(srv) && /out\.preturi = \{ grupuri/.test(srv);
const telCere = /Api\.offerCalc\(\{ preturi: true \}\)/.test(montajTsx) && /tarifeMontajCasa\(/.test(montajTsx);
T('tariful casei AJUNGE la telefon: /overview trimite `tarife_montaj` SAU fișa îl cere calculatorului de pe server (`preturi`)',
  srvTarife || (calcPreturi && telCere), 'overview: ' + srvTarife + ' · calculator: ' + calcPreturi + ' · telefonul îl cere: ' + telCere);
T('„Salvează lucrarea" refuză un rând cu bucăți și fără preț pentru client', /Scrie prețul pentru client la/.test(montajTsx));

// 5c. Contract ↔ factură: același verdict, aceleași propoziții și același rând al păstrării ca pe web, pe aceleași cifre.
const fWeb = /function _raxCtrComparatie\(cmp\) \{[\s\S]*?\r?\n    \}\r?\n/.exec(html);
const fTel = /export function verdictComparatie\(cmp: any\)[^\n]*\{\n([\s\S]*?)\n\}\n/.exec(lib);
const fNr = /export function nrMasini\(n: any\): string \{([\s\S]*?)\n\}/.exec(lib);
const fLuni = /export function luniText\(n: any\): string \{ ([^\n]*) \}/.exec(lib);
T('găsesc verdictul pe web (_raxCtrComparatie) și pe telefon (verdictComparatie)', !!fWeb && !!fTel && !!fNr && !!fDe && !!fLuni);
T('fișa de pe telefon folosește verdictul comun', /verdictComparatie\(cmp\)/.test(anexaTsx) && !/Math\.abs\(/.test(anexaTsx));
['Contractul și factura spun același lucru', 'Contractul și factura nu spun același lucru', 'Anexa nr. 1 e goală', 'Factura pornește după montaj']
  .forEach((t) => T('titlul „' + t + '" e scris la fel', anexaTsx.indexOf(t) >= 0 && html.indexOf(t) >= 0));
// Păstrarea istoricului (24.09): rândul ei apare și în cutia „după montaj", și în cea obișnuită; cutia de dinainte
// de montaj se face portocalie DOAR când păstrarea nu se potrivește — ca pe web.
T('rândul „Păstrarea istoricului" e în ambele cutii ale comparației', (anexaTsx.match(/<RandPastrare t=\{v\.pastrare\} \/>/g) || []).length === 2);
T('cutia „Factura pornește după montaj" se face portocalie la o păstrare nepotrivită',
  /v\.fel === 'dupaMontaj'[\s\S]{0,200}'ctr-band' \+ \(v\.probleme\.length \? ' warn' : ''\)/.test(anexaTsx));
// Ce ajunge pe factură spune serverul (`nefacturate`): telefonul nu scoate și nu adaugă rânduri (ex. chiria).
T('telefonul nu alege singur ce rânduri se facturează', !/fel\s*[!=]==?\s*'(chirie|ret|ai)'/.test(codCtr));
if (fWeb && fTel && fNr && fDe && fLuni) {
  const de = new Function('n', fDe[1]);
  const lei = (v) => '«' + (Number(v) || 0).toFixed(2) + '»';
  let web = null, tel = null;
  try { web = new Function('_lei', 'esc', '_raxDe', '_raxCtr', fWeb[0] + '\nreturn _raxCtrComparatie;')(lei, (x) => String(x), de, { contract: { status: 'activ' } }); } catch (e) { web = null; }
  try {
    const fN = new Function('n', 'de', fNr[1]);
    const nrMasini = (n) => fN(n, de);
    const fL = new Function('n', 'de', fLuni[1]);
    const luniText = (n) => fL(n, de);
    const fV = new Function('cmp', 'lei', 'nrMasini', 'luniText', fTel[1]);
    tel = (c) => fV(c, lei, nrMasini, luniText);
  } catch (e) { tel = null; }
  T('funcțiile de verdict se pot rula', !!web && !!tel);
  if (web && tel) {
    // Din HTML-ul web-ului, în forma telefonului: { fel, probleme, pastrare } — rândul păstrării cu ** în loc de <b>.
    const dinWebHtml = (h) => {
      if (!h) return null;
      if (h.indexOf('<strong>Anexa nr. 1 e goală</strong>') >= 0) return { fel: 'gol', probleme: [], pastrare: '' };
      const mP = /<div>(Păstrarea istoricului: [\s\S]*?)<\/div>/.exec(h);
      const pastrare = mP ? mP[1].replace(/<\/?b>/g, '**') : '';
      const mPr = /<div style="margin-top:6px;">([\s\S]*)<\/div><\/div>$/.exec(h);
      const probleme = mPr ? mPr[1].split('<br>').map((x) => x.replace(/^• /, '')) : [];
      if (h.indexOf('<strong>Factura pornește după montaj</strong>') >= 0) {
        // Telefonul face cutia portocalie când are probleme; web-ul, când are probleme de păstrare. Trebuie să fie același lucru.
        const portocalie = /raco-dosbox warn/.test(h);
        return { fel: portocalie === (probleme.length > 0) ? 'dupaMontaj' : 'dupaMontaj (altă culoare)', probleme, pastrare };
      }
      const fel = /raco-dosbox ok/.test(h) ? 'bine' : /raco-dosbox warn/.test(h) ? 'diferit' : '?';
      return { fel, probleme, pastrare };
    };
    const cazuri = [null, {}, { masini: null }];
    const aiuri = [null,
      { contractPretCont: 19, facturaPretCont: 19, facturaConturi: 2 },
      { contractPretCont: 19, facturaPretCont: 29, facturaConturi: 1 },
      { contractPretCont: 19, facturaPretCont: 19.004, facturaConturi: 0 },
      { contractPretCont: null, facturaPretCont: 29, facturaConturi: 3 }];
    const nefuri = [[], [{ nume: 'Serviciu lunar', lei: 50 }], [{ nume: 'A', lei: 1 }, { nume: 'B „x"', lei: 2.5 }]];
    // Păstrarea istoricului (comparatie.pastrare): lipsă; firma ține MAI PUȚIN decât contractul (s-ar șterge mai
    // devreme — cazul din audit); totul la fel; firma ține mai mult și factura pune în plus; setări stricate pe firmă
    // (`firmaLuni: null`) cu o diferență sub un ban; doar banii diferă.
    const pastrari = [undefined,
      { contractLuni: 24, contractLei: 50, firmaLuni: 12, facturaLei: 0 },
      { contractLuni: 24, contractLei: 50, firmaLuni: 24, facturaLei: 50 },
      { contractLuni: 12, contractLei: 0, firmaLuni: 36, facturaLei: 80 },
      { contractLuni: 36, contractLei: 75, firmaLuni: null, facturaLei: 75.004 },
      { contractLuni: 24, contractLei: 50, firmaLuni: 24, facturaLei: 49.5 }];
    [0, 1, 3].forEach((cn) => [0, 90].forEach((cl) => [false, true].forEach((dino) => [0, 1, 3, 5].forEach((fn) =>
      [0, 90, 90.004, 90.02, 135].forEach((fl) => aiuri.forEach((ai) => nefuri.forEach((nef) => [0, 50].forEach((tc) => pastrari.forEach((ps) => {
        const c = { masini: { contract: { lei: cl, nr: cn, dinOferta: dino }, factura: { lei: fl, nr: fn } },
          raInsight: ai, nefacturate: nef, total: { contract: tc, factura: fl } };
        if (ps !== undefined) c.pastrare = ps;
        cazuri.push(c);
      })))))))));
    const gresite = [];
    let cuPastrare = 0, dupaMontajRau = 0;
    cazuri.forEach((c) => {
      let a, b;
      try { a = dinWebHtml(web(c)); } catch (e) { a = 'eroare web: ' + e.message; }
      try { b = tel(c); } catch (e) { b = 'eroare telefon: ' + e.message; }
      if (J(a) !== J(b)) gresite.push(J(c) + '\n      web: ' + J(a) + '\n      tel: ' + J(b));
      if (b && b.pastrare) cuPastrare++;
      if (b && b.fel === 'dupaMontaj' && b.probleme.length) dupaMontajRau++;
    });
    T('verdictul, propozițiile și rândul păstrării sunt identice cu web-ul, pe ' + cazuri.length + ' de cazuri', !gresite.length, gresite.length + ' diferite; primul: ' + gresite[0]);
    // Proba chiar a atins ramurile noi (nu doar a trecut pe lângă ele).
    T('cazurile au rândul păstrării și cutii „după montaj" portocalii', cuPastrare > 1000 && dupaMontajRau > 100, cuPastrare + ' / ' + dupaMontajRau);
    // Cazul din audit: firma ține 12 luni, contractul promite 24 — nu are voie să spună „același lucru".
    const audit = tel({ masini: { contract: { lei: 90, nr: 3 }, factura: { lei: 90, nr: 3 } }, raInsight: null, nefacturate: [],
      total: { contract: 140, factura: 90 }, pastrare: { contractLuni: 24, contractLei: 50, firmaLuni: 12, facturaLei: 0 } });
    T('„firma ține mai puțin decât s-a semnat" iese NEPOTRIVIRE, nu „spun același lucru"', audit && audit.fel === 'diferit' && audit.probleme.length === 2, J(audit));
  }
}

// 5d. Hârtiile (contract, act, scan): prin `salveazaDeLaServer` — un <a href> nu cară tokenul, un fetch e blocat de CORS.
T('niciun link direct spre /api/ în ecranele de contracte', !/href=\{?['"`][^'"`]*\/api\//.test(tot));
T('nicio cerere fetch() ocolind clientul API', !/\bfetch\(/.test(tot));
T('Vezi/Descarcă trec prin salveazaDeLaServer', /salveazaDeLaServer\(/.test(uiTsx));
T('niciun PDF desenat pe telefon', !/jspdf|pdfkit|new jsPDF/i.test(tot));
T('„s-a descărcat" nu se spune pe telefon, unde foaia de partajare poate fi închisă fără salvare',
  /spuneDescarcat = !Capacitor\.isNativePlatform\(\)/.test(uiTsx) &&
  (uiTsx.match(/showToast\([^;]*s-a descărcat/g) || []).length === (uiTsx.match(/spuneDescarcat\) showToast\(ce \+ ' s-a descărcat/g) || []).length);

sect('5e. Foile de lucru nu se pierd la „înapoi" (Android) și fișa rămâne la zi');
[['actul adițional', acteTsx], ['lucrarea de montaj', montajTsx], ['partenerul de montaj', partTsx]].forEach(([n, s]) =>
  T('foaia pentru ' + n + ' e păzită la „înapoi"', /useInapoiInchide\(!!(form|edit), inchide\)/.test(s) && /Închizi fără să salvezi\?/.test(s)));
T('foile „E semnat" și „Completează" (lista și dosarul) sunt păzite la „înapoi"',
  /function SemnatFoaie[\s\S]*?useInapoiInchide\(true, inchide\)/.test(pasiTsx) && /function CompleteazaFirma[\s\S]*?useInapoiInchide\(true, inchide\)/.test(pasiTsx) &&
  /Închizi fără să salvezi\?/.test(pasiTsx));
T('întrebările de pe rând (Aprobă, Trimite, Pune data…) se închid la „înapoi", nu pleacă din ecran', /useInapoiInchide\(!!dlg && /.test(pasiTsx));
T('întrebările dosarului (semnat, încheiat, șterge, scoate fișierul) se închid la „înapoi", nu pleacă din dosar',
  /useInapoiInchide\(!!dialog, \(\) => \{ if \(busy\) return false; setDialog\(''\); return true; \}\)/.test(detTsx));
T('foile secțiunii Montaj (editarea contractului, „E semnat") sunt păzite la „înapoi"',
  /function EditContract[\s\S]*?useInapoiInchide\(/.test(mjTsx) && /function SemnatFoaie[\s\S]*?useInapoiInchide\(/.test(mjTsx));
T('un act de prelungire salvat / șters / trecut mai departe reîncarcă toată fișa',
  (acteTsx.match(/if \(prelungire\) onFisa\(\); else incarca\(\);/g) || []).length >= 2 && /ePrelungire\(a\)\) onFisa\(\)/.test(acteTsx));
const notif = citeste('mobile/src/screens/NotifDetail.tsx');
const iCtr = notif.indexOf("x.type === 'contract_expira'");
T('notificarea „contract care expiră" se marchează citită înainte de mutarea în fișă',
  iCtr > 0 && /Api\.ackNotification\(Number\(id\)\)/.test(notif.slice(iCtr, iCtr + 400)) && /refreshUnread\(\)/.test(notif.slice(iCtr, iCtr + 400)));

sect('6. Doar super-adminul ajunge aici');
const app = citeste('mobile/src/App.tsx'), menu = citeste('mobile/src/screens/Menu.tsx');
T('ruta listei e păzită (doarSuper)', /doarSuper\(Contracts,/.test(app) && /path="\/admin\/contracts" component=\{P\.contracts\}/.test(app));
T('ruta fișei e păzită (doarSuper)', /doarSuper\(ContractDetail,/.test(app) && /path="\/admin\/contracts\/:companyId" component=\{P\.contractDetail\}/.test(app));
T('ruta secțiunii Montaj e păzită (doarSuper)', /doarSuper\(Montaj,/.test(app) && /path="\/admin\/montaj" component=\{P\.montaj\}/.test(app));
const iSuper = menu.indexOf('{u?.isSuper && ('), iRand = menu.indexOf("'Contracte'");
const iSfarsit = menu.indexOf('Cont & setări');
T('rândul „Contracte" din meniu stă sub „Platformă (super-admin)"', iSuper > 0 && iRand > iSuper && iRand < iSfarsit);
const iComp = menu.indexOf("'Companii'"), iMontaj = menu.indexOf("'Montaj'");
T('rândul „Montaj" stă imediat sub „Companii", doar la super-admin (ca pe web)',
  iSuper > 0 && iComp > iSuper && iMontaj > iComp && iMontaj < iSfarsit && (menu.slice(iComp, iMontaj).match(/item\(/g) || []).length === 1);
['/api/contracts', '/api/contracts/:id', '/api/contracts/:id/reinnoire', '/api/contracts/:id/acte', '/api/acte/:id', '/api/montaj/parteneri', '/api/companies/:id/montaje',
  '/api/contracts/:id/trimite', '/api/contracts/:id/file', '/api/companies/:id/dosar', '/api/companies/:id/overview',
  '/api/montaj/contracte', '/api/montaj/contracte/:id', '/api/montaj/contracte/:id/pdf', '/api/montaj/contracte/:id/file',
  '/api/montaj/contracte/:id/trimite', '/api/montaj/lucrari', '/api/montaj/parteneri/:id']
  .forEach((r) => T('serverul păzește ' + r + ' (requireSuperadmin)', new RegExp("app\\.(get|post|put|delete)\\('" + r.replace(/[/:]/g, (x) => '\\' + x) + "', requireAuth, requireSuperadmin").test(srv)));

sect('7. Drumul clientului: se desenează din ce trimite serverul, cu butonul pasului următor (24.09)');
T('drumul se desenează din `drum.pasi` al serverului, cu „gata din din"', /drum\.pasi/.test(drumTsx) && /drum\.gata/.test(drumTsx) && /drum\.din/.test(drumTsx));
const etPasi = C.PASI_DRUM.map((p) => p[1]);
const copii = etPasi.filter((e) => new RegExp("['\"`]" + e + "['\"`]").test(codCtr));
T('nicio etichetă de pas scrisă pe telefon (vin din contracts.PASI_DRUM, prin server)', !copii.length, copii.join(', '));
T('nicio socoteală a drumului pe telefon', !/drumulClientului|PASI_DRUM|MONTAJ_EXECUTAT|drumDateToate/.test(codCtr));
T('dosarul și fișa firmei desenează drumul primit de la server', /<DrumClient drum=\{d\.drum\}/.test(detTsx) && /<DrumClient drum=\{o\.drum\}/.test(fisaTsx));
const iDr = detTsx.indexOf('<DrumClient'), iCap = detTsx.indexOf('<div class="ctr-cap">'), iCut = detTsx.lastIndexOf('{cutieDosar}', iDr);
T('în dosar, drumul stă între cutia dosarului și capul contractului (ca pe web)', iCut > 0 && iCut < iDr && iDr < iCap);
T('serverul trimite același drum în listă și în fișă (_drumContract)', /drum: _drumContract\(c, drumDate\)/.test(srv) && /drum: contract && contract\.status !== 'incheiat' \? _drumContract\(contract,/.test(srv));
const fnBtnWeb = html.slice(html.indexOf('function _drumButon('), html.indexOf('// Linia de pași din fila Contract'));
['Aprobă contractul', 'Trimite la semnat', 'Am trimis-o', 'E semnat', 'Programează montajul', 'Adoptă aparatele', 'Emite prima factură'].forEach((t) =>
  T('butonul drumului „' + t + '" e scris la fel ca pe web (_drumButon)', fnBtnWeb.indexOf(t) >= 0 && pasiTsx.indexOf("'" + t + "'") >= 0));
T('pe web și pe telefon, „Pasul următor" / „Toți pașii sunt făcuți"', html.indexOf('Pasul următor: <strong>') >= 0 && /Pasul următor: <b>/.test(drumTsx) &&
  html.indexOf('Toți pașii sunt făcuți.') >= 0 && drumTsx.indexOf('Toți pașii sunt făcuți.') >= 0);
const mRuta = /export const RUTA_NEASIGNATE = '([^']+)'/.exec(lib);
const devTsx = citeste('mobile/src/screens/AdminDevices.tsx');
T('„Adoptă aparatele" duce în Dispozitive → Neasignate, cu filtrul pus înainte (ecranul îl citește)',
  !!mRuta && mRuta[1] === '/admin/devices?filtru=neasignate' && /neasignate:\s*'unassigned'/.test(devTsx));
T('drumul și anexa goală folosesc aceeași adresă', /loc\.route\(RUTA_NEASIGNATE\)/.test(pasiTsx) && /loc\.route\(RUTA_NEASIGNATE\)/.test(anexaTsx));
T('nicio adopție de aparat din ecranele de contract (adopția stă DOAR în Dispozitive, decizia din 17.09)', !/moveDevice|\/company['`]/.test(codCtr));
const billTsx = citeste('mobile/src/screens/Billing.tsx');
T('„Emite prima factură" deschide „Generează factură" cu firma aleasă (/billing?factura=)',
  /'\/billing\?factura='/.test(pasiTsx) && /query[^;\n]*\.factura/.test(billTsx) && /GenerateInvoiceSheet[^\n]*preset=/.test(billTsx));
T('„Programează montajul" din listă / fișa firmei duce în dosar cu `?lucrare=noua`', /rutaDosar\(companyId\) \+ '\?lucrare=noua'/.test(pasiTsx));
T('dosarul citește `?lucrare=noua` și deschide formularul lucrării (biletul → ContractMontaj)',
  /\.lucrare \|\| ''\) === 'noua'/.test(detTsx) && /deschideNoua=\{bilet\}/.test(detTsx) && /deschideNoua === biletFolosit/.test(montajTsx) && /if \(!edit\) deschide\(null\)/.test(montajTsx));
T('în dosar, „Programează montajul" deschide formularul pe loc, iar „Aprobă contractul" salvează întâi formularul (ca raxCtrTreci)',
  /montajNou: \(\) => setBilet\(Date\.now\(\)\)/.test(detTsx) && /aproba: \(\) => treci\('aprobat'\)/.test(detTsx));

sect('7b. Dosarul nu pierde ce ai scris în „Datele contractului" (29.09)');
// „Trimite la semnat" emailează PDF-ul din contractul SALVAT, iar „E semnat" îl încuie: ce era scris și nesalvat
// pleca greșit la client, respectiv se pierdea pentru totdeauna (după semnare, doar act adițional).
T('în dosar, „Trimite la semnat" / „Am trimis-o" / „E semnat" salvează întâi formularul, fără să-i schimbe starea',
  /\bsalveazaIntai,/.test(detTsx) && /async function salveazaIntai\(rand: any\)[^\n]*\{\s*if \(!nesalvat\(\)\) return rand;\s*const o = await salveaza\(c\.status\);/.test(detTsx) &&
  /function nesalvat\(\): boolean \{[\s\S]{0,200}formDin\(c, \[\]\)[\s\S]{0,200}k !== 'status' && form\[k\] !== s\[k\]/.test(detTsx));
T('… iar în foaie, cele trei trec toate prin salvarea de dinainte (deschide → o.salveazaIntai), pe contractul proaspăt',
  /r = await o\.salveazaIntai\(c\)/.test(pasiTsx) && /if \(r\) setDlg\(\{ fel, c: r \}\)/.test(pasiTsx) &&
  /buton\('mail', 'Trimite la semnat', \(\) => deschide\('trimite', c\)\)/.test(pasiTsx) && /buton\('mail', 'Am trimis-o', \(\) => deschide\('amtrimis', c\)\)/.test(pasiTsx) &&
  /buton\('fileSignature', 'E semnat', \(\) => deschide\('semnat', c\)\)/.test(pasiTsx) && !/setDlg\(\{ fel: '(trimite|amtrimis|semnat)'/.test(pasiTsx));
T('salvarea dosarului întoarce fișa proaspătă (pasul de după nu lucrează pe contractul vechi)', /try \{ return await incarca\(\); \} finally \{ setBusy\(false\); \}/.test(detTsx));
T('reîncărcarea după montaj, anexă, „Completează", un act sau un fișier păstrează ce ai scris (reincarca), nu golește formularul',
  /laSchimbat: reincarca/.test(detTsx) && /<AnexaEditor[^\n]*onSalvat=\{reincarca\}/.test(detTsx) && /<ContractMontaj[^\n]*onSalvat=\{reincarca\}/.test(detTsx) &&
  /<ContractActe[^\n]*onFisa=\{reincarca\}/.test(detTsx) && !/onSalvat=\{incarca\}|onFisa=\{incarca\}|laSchimbat: incarca\b/.test(detTsx));
const fCu = /function cuCeAiScris\(nou: any, acum: any, vechi: any\): Form \{\n([\s\S]*?)\n\}/.exec(detTsx);
T('găsesc cuCeAiScris în dosar', !!fCu);
if (fCu) {
  let cu = null; try { cu = new Function('nou', 'acum', 'vechi', fCu[1]); } catch (e) { cu = null; }
  T('cuCeAiScris se poate rula', !!cu);
  if (cu) {
    // Venise: C-1, 12 luni, starea „aprobat". Omul a scris C-7 și a mutat lista „Unde e contractul" pe „în lucru".
    // Între timp serverul spune: data semnării pusă, 24 de luni, starea „trimis" (pasul a trecut).
    const vechi = { nr: 'C-1', signed: '', months: '12', rep: 'Ion', status: 'aprobat' };
    const acum = { nr: 'C-7', signed: '', months: '12', rep: 'Ion', status: 'ciorna' };
    const nou = { nr: 'C-1', signed: '2026-09-20', months: '24', rep: 'Ion', status: 'trimis' };
    const r = cu(nou, acum, vechi);
    T('păstrează ce a scris omul și ia de la server câmpurile neatinse', r.nr === 'C-7' && r.signed === '2026-09-20' && r.months === '24' && r.rep === 'Ion', J(r));
    T('starea vine MEREU de la server (o stare veche ținută pe ecran ar întoarce contractul din drum)', r.status === 'trimis', J(r));
    T('nu atinge formularul de dinainte', acum.nr === 'C-7' && nou.nr === 'C-1');
  }
}

sect('8. Pasul următor pe rând și „Trimite la semnat" (24.09)');
T('„Trimite la semnat" cere serverului (Api.trimiteContract → POST /api/contracts/:id/trimite)',
  /trimiteContract:[\s\S]{0,200}`\/api\/contracts\/\$\{id\}\/trimite`, \{ method: 'POST'/.test(endp) && /Api\.trimiteContract\(/.test(pasiTsx));
T('lista păstrează `trimite_pe_email` de la server', /trimite: !!\(j && j\.trimite_pe_email\)/.test(listTsx) && /trimite_pe_email\?: boolean/.test(endp));
T('fără SMTP butonul nu minte: „Trimite la semnat" DOAR cu `trimite_pe_email`, altfel „Am trimis-o" (în listă, dosar și fișă)',
  /trimiteSauAmTrimis = \(c: any\) => \(o\.trimitePeEmail\s*\?\s*buton\('mail', 'Trimite la semnat'[^\n]*\n\s*:\s*<>\{buton\('mail', 'Am trimis-o'/.test(pasiTsx) &&
  /o\.trimitePeEmail \? buton\('refresh', 'Retrimite'/.test(pasiTsx) && (pasiTsx.match(/'Trimite la semnat'/g) || []).length === 1 &&
  /trimitePeEmail: !!\(d && d\.trimite_pe_email\)/.test(detTsx) && /trimitePeEmail: !!o\.trimite_pe_email/.test(fisaTsx));
T('pasul următor și lipsurile sunt pe fiecare rând din listă; întrebările lor sunt pe ecran (listă, dosar, fișă)',
  /\{pasi\.pas\(c\)\}/.test(listTsx) && /const linii = pasi\.lipsuri\(c\);/.test(listTsx) &&
  /\{pasi\.ui\}/.test(listTsx) && /\{pasi\.ui\}/.test(detTsx) && /\{pasi\.ui\}/.test(fisaTsx));
// „Completează" se deschide DUPĂ ce s-a închis întrebarea „Trimite", nu în locul ei (29.09): două foi păzite schimbate
// în aceeași randare lăsau în istoric intrarea întrebării (foaia nouă, copil, își punea intrarea înaintea curățeniei
// ei), iar după ce închideai „Completează", următorul „înapoi" de pe Android nu mai făcea nimic.
// (Încercat pe Preact-ul aplicației, cu inapoiFoaie.ts adevărat: schimbul în aceeași randare lasă intrarea; închis
// întâi și deschis în randarea următoare, nu.)
const fnTrimite = (/async function trimite\(c: any[\s\S]*?\n  \}\n/.exec(pasiTsx) || [''])[0];
T('„Trimite" refuzat pentru goluri pe hârtie deschide „Completează" (ca pe web)',
  /e\?\.status === 400 && lipsuriFirma\(c\)\.length\) setDupa\(\{ fel: 'completeaza'/.test(fnTrimite));
T('… abia după ce s-a închis întrebarea: foaia nu ia locul întrebării în aceeași randare, ci se deschide din efect, doar fără întrebare deschisă',
  !!fnTrimite && /setDlg\(null\);/.test(fnTrimite) && !/setDlg\(\{ fel: 'completeaza'/.test(fnTrimite) &&
  /useInapoiInchide\(!!dlg && /.test(pasiTsx) && /useEffect\(\(\) => \{\s*if \(!dupa \|\| dlg\) return;\s*setDlg\(dupa\);\s*setDupa\(null\);\s*\}, \[dupa, dlg\]\);/.test(pasiTsx));
T('„E semnat" propune ziua deja scrisă în contract, apoi azi (nu rescrie cu azi data salvată)',
  /function SemnatFoaie[\s\S]*?useState\(\(\) => inputZi\(c\.signed_at\) \|\| azi\(\)\)/.test(pasiTsx));
T('fără SMTP (503) ecranul se reîncarcă, ca butonul să devină „Am trimis-o"', /e\?\.status === 503\) o\.laSchimbat\(\)/.test(pasiTsx));
T('după semnare, rândul spune pasul drumului („urmează: … · N/M pași"), ca pe web',
  /urmează: ' \+ esc\(String\(p\.eticheta \|\| ''\)\.toLowerCase\(\)\) \+ ' · ' \+ dr\.gata \+ '\/' \+ dr\.din \+ ' pași/.test(html) &&
  /'urmează: ' \+ String\(p\.eticheta \|\| ''\)\.toLowerCase\(\) \+ ' · ' \+ dr\.gata \+ '\/' \+ dr\.din \+ ' pași'/.test(pasiTsx));
T('„trimis pe … la …" sub stare, ca pe web', /trimis pe ' \+ _zile\(c\.sent_at\) \+ \(c\.sent_to \? ' la ' \+ esc\(c\.sent_to\)/.test(html) &&
  /'trimis pe ' \+ zile\(c\.sent_at\) \+ \(c\.sent_to \? ' la ' \+ c\.sent_to/.test(pasiTsx));
['Aprobi contractul ', 'Din clipa asta hârtia nu mai e ciornă: se poate trimite la semnat.',
  'L-ai trimis tu clientului (email, WhatsApp)?\\n\\nContractul trece pe „trimis la client". Când vine semnat, apeși „E semnat" și îl încarci.',
  ' pleacă pe email, cu PDF-ul atașat, ca să-l semneze. Răspunsul lor — contractul semnat — vine la adresa noastră.\\n\\nCând îl primești, apeși „E semnat" și îl încarci.',
  'Ce zi a fost semnat contractul?',
  ' e semnat de amândoi?\\n\\nAlegi fișierul semnat primit de la client. Din clipa asta contractul nu se mai modifică: orice schimbare se face prin act adițional.',
  'Contract aprobat ✓ — urmează „Trimite la semnat"', 'Marcat „trimis la client" ✓', 'Data semnării pusă ✓', 'Contract semnat și în dosar ✓',
  'Datele firmei sunt în dosar ✓', ' e în dosar ✓', 'Adresa clientului', 'Da, l-am trimis', 'Alege fișierul semnat']
  .forEach((t) => T('„' + t.replace(/\\n/g, ' ').trim().slice(0, 60) + '…" e scris la fel ca pe web', html.indexOf(t) >= 0 && pasiTsx.indexOf(t) >= 0));
T('ziua semnării din listă se scrie la prânz, ca pe web (Date.parse(zi + "T12:00:00"), un singur ajutor)',
  /ziLaPranz\(/.test(pasiTsx) && !/(^|[^\w])zi\(/.test(pasiTsx) && /Date\.parse\(v \+ 'T12:00:00'\)/.test(mjLib) && !/export function ziPranz/.test(lib));

sect('9. Butonul fiecărei lipse și „Completează" (24.09)');
const ET = dinTs('LIPSA_ET');
const mEt = /var etich = function \(k\) \{ return \((\{[^}]*\})\)\[k\] \|\| k; \};/.exec(html);
let etWeb = null; try { etWeb = mEt ? new Function('return (' + mEt[1] + ');')() : null; } catch (e) { etWeb = null; }
T('cuvintele lipsurilor sunt aceleași ca pe web (etich din _ctreLipsuriHtml)', !!ET && !!etWeb && ordonat(ET) === ordonat(etWeb), ordonat(ET) + ' ≠ ' + ordonat(etWeb));
const FIRMA = dinTs('LIPSA_FIRMA'), FIRMA_WEB = dinWeb('CTRE_FIRMA');
T('„Completează" acoperă aceleași lipsuri ca pe web (CTRE_FIRMA)', !!FIRMA && !!FIRMA_WEB && J(FIRMA) === J(FIRMA_WEB), J(FIRMA) + ' ≠ ' + J(FIRMA_WEB));
T('… adică exact golurile pentru care serverul refuză „Trimite la semnat"', /\['cui', 'sediu', 'reprezentant'\]\.indexOf\(k\) >= 0/.test(srv) && J(FIRMA) === J(['cui', 'sediu', 'reprezentant']));
const fnLipsWeb = html.slice(html.indexOf('function _ctreLipsuriHtml('), html.indexOf('// ─── Drumul clientului, cu pașii bifați'));
['lipsește data semnării', 'lipsește contractul semnat (PDF)', 'lipsește acordul GDPR semnat', 'Completează', 'Pune data', 'Încarcă semnat', 'Încarcă acordul']
  .forEach((t) => T('„' + t + '" e pe rând, scris ca pe web', fnLipsWeb.indexOf(t) >= 0 && pasiTsx.indexOf(t) >= 0));
T('ce lipsește spune DOAR serverul (`dosar.lipsuri`), nimic socotit pe telefon', /c\.dosar && c\.dosar\.lipsuri/.test(pasiTsx) && !/stareDosar|\bLIPSURI\b/.test(codCtr));
T('la un contract nesemnat, „Dosar" arată doar lipsurile (fără pastila „lipsește ceva")', listTsx.indexOf('lipsește ceva') < 0 && /pasi\.lipsuri\(c\)/.test(listTsx));
T('„Completează" scrie pe ruta /dosar (doar cheile trimise), NU pe PUT /api/companies/:id (care golește ce vine gol)',
  /Api\.completeazaDosar\(/.test(pasiTsx) && !/Api\.updateCompany\(/.test(codCtr) &&
  /completeazaDosar:[\s\S]{0,300}`\/api\/companies\/\$\{companyId\}\/dosar`, \{ method: 'PUT'/.test(endp));
T('„Completează" trimite doar ce s-a schimbat (legal_rep = null când numele se golește)',
  /if \(t\(f\.cui\) !== t\(start\.cui\)\) corp\.cui/.test(pasiTsx) && /if \(t\(f\.name\) !== t\(start\.name\)\) corp\.name/.test(pasiTsx) &&
  /corp\.legal_rep = t\(f\.rep\) \? \{ name: t\(f\.rep\), role: t\(f\.reprole\) \} : null/.test(pasiTsx));
T('„Completează" are „ANAF" și spune pe față o firmă radiată / inactivă',
  /Api\.anafFirma\(/.test(pasiTsx) && pasiTsx.indexOf('firma apare RADIATĂ la ANAF') >= 0 && pasiTsx.indexOf('firma e declarată INACTIVĂ') >= 0 &&
  html.indexOf('firma apare RADIATĂ la ANAF') >= 0);
['Datele firmei pentru contract', 'Email (aici pleacă contractul)', 'Reprezentant legal', 'Nr. Reg. Com.'].forEach((t) =>
  T('„Completează": „' + t + '", ca pe web', html.indexOf(t) >= 0 && pasiTsx.indexOf(t) >= 0));
T('„Completează" se deschide și din cutia dosarului (dosar + fișa firmei)', /pasi\.completeaza\(rand\)/.test(detTsx) && /pasi\.completeaza\(rand\)/.test(fisaTsx));

sect('10. La încheiere: „arhivează aparatele" — cifra vine de la server (24.09)');
const fDI = /export function dupaIncetare\(n: any\): string \{\n([\s\S]*?)\n\}/.exec(lib);
const fDIC = /export function dupaIncetareConfirm\(n: any\): string \{\n([\s\S]*?)\n\}/.exec(lib);
const mW1 = /explic \+= '( Arhivează aparatele[^']*)' \+\s*d\.date_dupa_incetare_zile \+ _raxDe\(d\.date_dupa_incetare_zile\) \+ '([^']*)';/.exec(html);
const mW2 = /zDate \? '(\\n\\nApoi arhivează[^']*)' \+ zDate \+ _raxDe\(zDate\) \+ '([^']*)' : ''/.exec(html);
T('găsesc textele pe web (_raxCtrActiuni, raxCtrTreci) și pe telefon (dupaIncetare, dupaIncetareConfirm)', !!fDI && !!fDIC && !!mW1 && !!mW2 && !!fDe);
if (fDI && fDIC && mW1 && mW2 && fDe) {
  const de = new Function('n', fDe[1]);
  const di = new Function('n', 'de', fDI[1]), dic = new Function('n', 'de', fDIC[1]);
  const unesc = (s) => s.replace(/\\n/g, '\n');
  const gresite = [];
  [1, 2, 19, 20, 21, 30, 45, 101, 120].forEach((n) => {
    if (di(n, de) !== mW1[1] + n + de(n) + mW1[2]) gresite.push('cutia la ' + n);
    if (dic(n, de) !== unesc(mW2[1]) + n + de(n) + mW2[2]) gresite.push('întrebarea la ' + n);
  });
  T('„ce urmează" și întrebarea de la „Încheie contractul" spun ce spune web-ul, pentru orice cifră', !gresite.length, gresite.join(', '));
  T('fără cifră de la server nu se scrie nimic (nu se inventează „30")', di(undefined, de) === '' && dic(null, de) === '' && di(0, de) === '');
}
T('dosarul ia cifra de la server (date_dupa_incetare_zile), fără „30 de zile" scris de mână',
  /dupaIncetare\(d\.date_dupa_incetare_zile\)/.test(detTsx) && /dupaIncetareConfirm\(d && d\.date_dupa_incetare_zile\)/.test(detTsx) &&
  !/\b30 de zile\b/.test(codCtr));
T('fișa firmei o spune la un contract încheiat', /dupaIncetare\(o\.date_dupa_incetare_zile\)/.test(fisaTsx));
T('serverul trimite cifra din contracts.js (o singură cifră, și pe hârtie)', /date_dupa_incetare_zile: contracte\.ZILE_DATE_DUPA_INCETARE/.test(srv));

sect('11. Aparate închiriate: durata minimă o spune serverul (25.09)');
T('dosarul arată durata minimă a chiriei cu cifra din anexă (annex.chirie.luniMin), fără „24" scris de mână',
  /c\.annex\.chirie\.luniMin/.test(detTsx) && !/cel puțin 24/.test(detTsx));

sect('12. Montaj: partenerii stau DOAR în secțiunea lor; aceleași vorbe ca pe web (24.09)');
T('„Contracte" nu mai desenează partenerii de montaj', !/ParteneriMontaj/.test(listTsx));
T('partenerii sunt în secțiunea Montaj', /<ParteneriMontaj/.test(mjTsx));
const fMj = /export function mjStare\(status: string\): \[string, string\] \{\n([\s\S]*?)\n\}/.exec(mjLib);
const fMjWeb = /function _mjStare\(status\) \{([\s\S]*?)\n    \}/.exec(html);
T('găsesc starea contractului cu partenerul (telefon: mjStare, web: _mjStare)', !!fMj && !!fMjWeb && !!STARI);
if (fMj && fMjWeb && STARI) {
  const tel = new Function('status', 'CTR_STARI', fMj[1]), web = new Function('status', 'CTR_STARI', fMjWeb[1]);
  const CS_WEB = dinWeb('CTR_STARI');
  const toate = Object.keys(C.ETICHETE_STARE).concat(['necunoscut']);
  const dif = toate.filter((k) => J(tel(k, STARI)) !== J(web(k, CS_WEB)));
  T('stările contractului cu partenerul se scriu ca pe web, pentru toate stările', !dif.length, dif.join(','));
  T('„trimis la partener" (nu „la client"), fără să se atingă CTR_STARI', tel('trimis', STARI)[0] === 'trimis la partener' && STARI.trimis[0] === 'trimis la client');
}
const MJL = dinTs('MJ_LIPSA', mjLib), MJL_WEB = dinWeb('MJ_LIPSA');
T('lipsurile contractului cu partenerul se scriu ca pe web (MJ_LIPSA)', !!MJL && !!MJL_WEB && ordonat(MJL) === ordonat(MJL_WEB), ordonat(MJL) + ' ≠ ' + ordonat(MJL_WEB));
T('la „Cine execută", un partener inactiv rămâne doar pe lucrările lui', /p\.active !== false \|\| String\(p\.id\) === edit\.p0/.test(montajTsx));
T('fișa partenerului trimite „Stare" (active) și spune că pleacă și contractele lui nesemnate',
  /\bactive:/.test(partTsx) && partTsx.indexOf('contractele lui nesemnate se șterg') >= 0 && html.indexOf('contractele lui nesemnate se șterg') >= 0);
T('datele contractelor cu partenerii se scriu la prânz (ziLaPranz), nu la miezul nopții',
  /ziLaPranz\(/.test(mjTsx) && !/(^|[^\w])zi\(/.test(mjTsx) && /T12:00:00/.test(mjLib));

console.log('\n' + ok + ' ok, ' + rele + ' greșite');
process.exit(rele ? 1 : 0);
