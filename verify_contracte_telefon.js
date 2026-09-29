// verify_contracte_telefon.js — ecranele „Contracte" de pe telefon spun ACELEAȘI cuvinte ca serverul și web-ul.
//
//   node verify_contracte_telefon.js
//
// Telefonul are o copie a etichetelor (stările contractului, pașii, stările actului adițional, lucrările și
// stările montajului, textele „ce urmează"): nu poate cere serverul pentru fiecare desen. Copia trebuie să fie
// IDENTICĂ — altfel un ecran spune „trimis la client" și altul „trimis la semnat". Aceeași regulă ca proba
// `verify_contracte.js`, care păzește copia din index.html.
// Mai verifică și că telefonul NU a copiat reguli de bani (prețul propus pe aparat, tarifele casei) și NU
// descarcă hârtiile ocolind generatorul serverului, plus că ecranele sunt doar ale super-adminului.
// Verifică și că propunerile de preț chiar AJUNG la telefon (serverul le trimite, nu doar telefonul le
// citește), că verdictul „contractul și factura spun același lucru" e identic cu cel de pe web (rulează
// ambele funcții pe aceleași cifre) și că o anexă nu se salvează cu un aparat bifat fără preț.
// Nu pornește niciun server și nu are nevoie de TypeScript: citește fișierele ca text.
const fs = require('fs');
const C = require('./contracts');
const M = require('./montaj');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const lib = fs.readFileSync('./mobile/src/lib/contracte.ts', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const srv = fs.readFileSync('./server.js', 'utf8');
const citeste = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };

// Un obiect/listă literală din sursă, evaluat ca JS. În .ts: `export const NUME: Tip = { … };`
function dinTs(nume) {
  // Până la primul „};" / „];" de la capăt de rând (rândurile dinăuntru se termină în „],", nu în „];").
  const m = new RegExp('export const ' + nume + '\\b[^=]*=\\s*([\\[{][\\s\\S]*?[\\]}]);[ \\t]*\\r?\\n').exec(lib);
  if (!m) return null;
  try { return new Function('return (' + m[1] + ');')(); } catch (e) { return null; }
}
function dinWeb(nume) {
  const m = new RegExp('var ' + nume + ' = ([\\[{][\\s\\S]*?[\\]}]);').exec(html);
  if (!m) return null;
  try { return new Function('return (' + m[1] + ');')(); } catch (e) { return null; }
}
const J = (x) => JSON.stringify(x);

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
const fisiere = ['mobile/src/screens/Contracts.tsx', 'mobile/src/screens/ContractDetail.tsx', 'mobile/src/components/ContractUi.tsx',
  'mobile/src/components/ContractAnexa.tsx', 'mobile/src/components/ContractActe.tsx', 'mobile/src/components/ContractMontaj.tsx',
  'mobile/src/components/ParteneriMontaj.tsx', 'mobile/src/lib/contracte.ts'];
const cod = fisiere.map((p) => [p, citeste(p)]);
cod.forEach(([p, s]) => T('există ' + p, !!s));
const tot = cod.map((x) => x[1]).join('\n');
const anexaTsx = citeste('mobile/src/components/ContractAnexa.tsx'), montajTsx = citeste('mobile/src/components/ContractMontaj.tsx');
const acteTsx = citeste('mobile/src/components/ContractActe.tsx'), partTsx = citeste('mobile/src/components/ParteneriMontaj.tsx');
const uiTsx = citeste('mobile/src/components/ContractUi.tsx');
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
T('tarifele de montaj ale casei vin de la server (tarife_montaj)', /tarife_montaj/.test(citeste('mobile/src/screens/ContractDetail.tsx')));
const srvTarife = /\btarife_montaj\s*:/.test(blocOv);
const RAND = dinTs('MONTAJ_RAND_TARIF');
const casaWeb = {};
const mCasa = /function _raxMontTarifeOferta\(\) \{[\s\S]*?var casa = (\{[^}]*\});/.exec(html);
if (mCasa) mCasa[1].replace(/(\w+):\s*p\.(\w+)/g, (_, k, v) => { casaWeb[k] = v; });
const ordonat = (o) => J(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
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

// 5c. Contract ↔ factură: același verdict și aceleași propoziții ca pe web, pe aceleași cifre.
const fWeb = /function _raxCtrComparatie\(cmp\) \{[\s\S]*?\r?\n    \}\r?\n/.exec(html);
const fTel = /export function verdictComparatie\(cmp: any\)[^\n]*\{\n([\s\S]*?)\n\}\n/.exec(lib);
const fNr = /export function nrMasini\(n: any\): string \{([\s\S]*?)\n\}/.exec(lib);
T('găsesc verdictul pe web (_raxCtrComparatie) și pe telefon (verdictComparatie)', !!fWeb && !!fTel && !!fNr && !!fDe);
T('fișa de pe telefon folosește verdictul comun', /verdictComparatie\(cmp\)/.test(anexaTsx) && !/Math\.abs\(/.test(anexaTsx));
['Contractul și factura spun același lucru', 'Contractul și factura nu spun același lucru', 'Anexa nr. 1 e goală', 'Factura pornește după montaj']
  .forEach((t) => T('titlul „' + t + '" e scris la fel', anexaTsx.indexOf(t) >= 0 && html.indexOf(t) >= 0));
if (fWeb && fTel && fNr && fDe) {
  const de = new Function('n', fDe[1]);
  const lei = (v) => '«' + (Number(v) || 0).toFixed(2) + '»';
  let web = null, tel = null;
  try { web = new Function('_lei', 'esc', '_raxDe', '_raxCtr', fWeb[0] + '\nreturn _raxCtrComparatie;')(lei, (x) => String(x), de, { contract: { status: 'activ' } }); } catch (e) { web = null; }
  try {
    const fN = new Function('n', 'de', fNr[1]);
    const nrMasini = (n) => fN(n, de);
    const fV = new Function('cmp', 'lei', 'nrMasini', fTel[1]);
    tel = (c) => fV(c, lei, nrMasini);
  } catch (e) { tel = null; }
  T('funcțiile de verdict se pot rula', !!web && !!tel);
  if (web && tel) {
    const dinWebHtml = (h) => {
      if (!h) return null;
      if (h.indexOf('<strong>Anexa nr. 1 e goală</strong>') >= 0) return { fel: 'gol', probleme: [] };
      if (h.indexOf('<strong>Factura pornește după montaj</strong>') >= 0) return { fel: 'dupaMontaj', probleme: [] };
      const fel = /raco-dosbox ok/.test(h) ? 'bine' : /raco-dosbox warn/.test(h) ? 'diferit' : '?';
      const m = /<div style="margin-top:6px;">([\s\S]*)<\/div><\/div>$/.exec(h);
      return { fel, probleme: m ? m[1].split('<br>').map((x) => x.replace(/^• /, '')) : [] };
    };
    const cazuri = [null, {}, { masini: null }];
    const aiuri = [null,
      { contractPretCont: 19, facturaPretCont: 19, facturaConturi: 2 },
      { contractPretCont: 19, facturaPretCont: 29, facturaConturi: 1 },
      { contractPretCont: 19, facturaPretCont: 19.004, facturaConturi: 0 },
      { contractPretCont: null, facturaPretCont: 29, facturaConturi: 3 }];
    const nefuri = [[], [{ nume: 'Păstrarea datelor 24 de luni', lei: 50 }], [{ nume: 'A', lei: 1 }, { nume: 'B „x"', lei: 2.5 }]];
    [0, 1, 3].forEach((cn) => [0, 90].forEach((cl) => [false, true].forEach((dino) => [0, 1, 3, 5].forEach((fn) =>
      [0, 90, 90.004, 90.02, 135].forEach((fl) => aiuri.forEach((ai) => nefuri.forEach((nef) => [0, 50].forEach((tc) => {
        cazuri.push({ masini: { contract: { lei: cl, nr: cn, dinOferta: dino }, factura: { lei: fl, nr: fn } },
          raInsight: ai, nefacturate: nef, total: { contract: tc, factura: fl } });
      }))))))));
    const gresite = [];
    cazuri.forEach((c) => {
      let a, b;
      try { a = dinWebHtml(web(c)); } catch (e) { a = 'eroare web: ' + e.message; }
      try { b = tel(c); } catch (e) { b = 'eroare telefon: ' + e.message; }
      if (J(a) !== J(b)) gresite.push(J(c) + '\n      web: ' + J(a) + '\n      tel: ' + J(b));
    });
    T('verdictul și propozițiile sunt identice cu web-ul, pe ' + cazuri.length + ' de cazuri', !gresite.length, gresite.length + ' diferite; primul: ' + gresite[0]);
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
const iSuper = menu.indexOf('{u?.isSuper && ('), iRand = menu.indexOf("'Contracte'");
const iSfarsit = menu.indexOf('Cont & setări');
T('rândul „Contracte" din meniu stă sub „Platformă (super-admin)"', iSuper > 0 && iRand > iSuper && iRand < iSfarsit);
['/api/contracts', '/api/contracts/:id', '/api/contracts/:id/reinnoire', '/api/contracts/:id/acte', '/api/acte/:id', '/api/montaj/parteneri', '/api/companies/:id/montaje']
  .forEach((r) => T('serverul păzește ' + r + ' (requireSuperadmin)', new RegExp("app\\.(get|post|put|delete)\\('" + r.replace(/[/:]/g, (x) => '\\' + x) + "', requireAuth, requireSuperadmin").test(srv)));

console.log('\n' + ok + ' ok, ' + rele + ' greșite');
process.exit(rele ? 1 : 0);
