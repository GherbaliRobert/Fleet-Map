// verify_facturare_telefon.js — facturarea lui Alin din 29.09, pe telefon (aplicația 1.0.5): telefonul face ce face
// web-ul, pe aceleași rute, cu aceleași reguli și aceleași cuvinte.
//
//   node verify_facturare_telefon.js
//
// Ce păzește, pe bucăți (câte una pentru fiecare pachet al lotului 4 de paritate):
//   1. Facturare — factura UNICĂ și PROFORMA, lângă abonamentul unei luni; montajul STRÂNS (lucrările adunate pe
//      rânduri, zilele lor în „Mențiuni"), legat de pagină; felul și luna care pleacă la emitere vin din CIORNA
//      serverului, nu din selector; hârtia documentului (una singură, și pentru fișa firmei); „Încasată" pe proformă.
//   2. Fișa firmei — fila „Facturi" (documentele cu „Ce e", starea și ✓, apoi încasările); „Abonament & plăți" →
//      „Deschide fila Facturi"; drumul clientului → „Emite prima factură" deschide factura UNICĂ.
//   3. Client nou — „Factura automată e pornită", linkul de parolă când emailul n-a plecat, „Mai departe" pe felul
//      contractului (aparate vândute / închiriate / fără aparate), legat de hârtia contractului.
//   4. Dispozitive → Neasignate — bife și „Trece pe firmă" în bloc; ziua din care plătește clientul, cu corectura ✎.
//   5. Banda de restanță / suspendare, pentru TOȚI oamenii unei firme (dispecer, șofer, cine doar vede harta).
//
// Regula casei: unde telefonul ține o copie a unei reguli de bani sau de text a paginii, proba nu o crede pe cuvânt.
// Decupează bucata paginii (public/index.html, între repere) și pe cea a telefonului (TypeScript, tradus cu
// compilatorul din mobile/node_modules sau cu cel pus de CI), le RULEAZĂ pe aceleași cazuri și cere același
// rezultat. Unde telefonul face altfel DINADINS — greșelile găsite pe web în revizia lucrului din 29.09: montajul
// șters de pe factură rămânea „facturat" și scris în mențiuni, bara din Neasignate golea firma aleasă la fiecare
// bifă și trimitea și aparatele ascunse de căutare, „Mai departe" promitea proformă și la aparatele închiriate, nota
// noastră internă de suspendare ajungea la oamenii clientului —, verificările sunt scrise pe regula cea bună.
//
// Pornește UN server (PGlite, port 3466, TCP 5466, baza în .facturare-tel-db, ștearsă la final) pentru bucățile 4
// și 5: trecerea în bloc și ziua abonamentului prin clientul HTTP adevărat al telefonului, apoi o firmă cu o
// factură restantă, suspendată, reactivată și plătită, văzută de dispecer și de administrator ca de pe telefon.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
// Unele fișiere sunt CRLF pe disc: rândurile se normalizează, ca reperele și expresiile de aici (cu \n) să le prindă.
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 700) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Unelte de decupat ───────────────────────────────────────────────────────────────────────────────────────────
// Bucata dintre două repere: de la `de` (inclus) până la `pana` (exclus); '' când lipsește vreunul.
function taie(src, de, pana) {
  const i = src.indexOf(de); if (i < 0) return '';
  const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j);
}
// O funcție întreagă: de la reper până la acolada care o închide; '' când reperul lipsește. Numără acoladele fără
// să sară peste șiruri — dinadins: `esc` din pagină are ghilimele într-o expresie regulată, de care un cititor de
// șiruri s-ar împiedica. Bucățile decupate aici n-au acolade în șiruri.
function functie(src, reper) {
  const i = src.indexOf(reper); if (i < 0) return '';
  let j = src.indexOf('{', i + reper.length - 1), adanc = 0;
  for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
  return src.slice(i, j + 1);
}
// Fără comentariile JS/TS care încep după un spațiu, un început de rând sau o acoladă (nu și `//` dintr-o adresă).
const faraComentarii = (s) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');
const faraComentariiCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ─── Contrastul (WCAG), pentru culorile citite din CSS și din temă ──────────────────────────────────────────────
const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Culoarea `c` pusă în proporția `p` peste `fundal` (ce face color-mix sau o transparență).
const amesteca = (c, p, fundal) => c.map((x, i) => x * p + fundal[i] * (1 - p));

// ─── TypeScript-ul telefonului, tradus și rulat în vm ────────────────────────────────────────────────────────────
let ts = null;
try { ts = require(path.join(ROOT, 'mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { /* lipsește */ } }
if (!ts) {
  console.log('  ✗ lipsește compilatorul TypeScript: rulează o dată `npm install` în mobile/ (în CI îl pune pasul de instalare)');
  console.log('\n0 verificări trecute, 1 picate');
  process.exit(1);
}
function tsJs(cod, fisier, jsx) {
  const o = { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
  if (jsx) { o.jsx = ts.JsxEmit.ReactJSX; o.jsxImportSource = 'preact'; }
  return ts.transpileModule(cod, { compilerOptions: o, fileName: fisier }).outputText;
}
// Un modul tradus, rulat în vm, cu `require` de carton: doar ce primește în `cereri` (un .css nu aduce nimic).
function modul(cod, fisier, cereri, globale) {
  const m = { exports: {} };
  const ctx = vm.createContext(Object.assign({
    module: m, exports: m.exports, console, setTimeout, clearTimeout, AbortController,
    require: (id) => {
      if (cereri && Object.prototype.hasOwnProperty.call(cereri, id)) return cereri[id];
      if (/\.css$/.test(id)) return {};
      throw new Error('require neașteptat în ' + fisier + ': ' + id);
    },
  }, globale || {}));
  vm.runInContext(cod, ctx, { filename: fisier });
  return { exp: m.exports, ctx };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 0. Fișierele și bucățile comune
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
sect('0. Fișierele și bucățile comune');
const FISIERE = ['public/index.html', 'server.js', 'contract_pdf.js', 'montaj.js', 'contracts.js', 'neplata.js', 'test_parola.js',
  'mobile/src/lib/factura.ts', 'mobile/src/lib/numar.ts', 'mobile/src/api/endpoints.ts', 'mobile/src/api/client.ts',
  'mobile/src/components/DocumentFactura.tsx', 'mobile/src/screens/Billing.tsx', 'mobile/src/screens/billing.css',
  'mobile/src/screens/CompanySheet.tsx', 'mobile/src/screens/CompanyAbonament.tsx', 'mobile/src/components/ContractPasi.tsx',
  'mobile/src/components/ContractDrum.tsx', 'mobile/src/screens/ClientNou.tsx', 'mobile/src/screens/clientnou.css',
  'mobile/src/screens/AdminUsers.tsx', 'mobile/src/screens/ContractDetail.tsx', 'mobile/src/screens/AdminDevices.tsx',
  'mobile/src/screens/aparate.css', 'mobile/src/theme/tokens.css', 'mobile/src/theme/global.css', 'mobile/src/screens/fondator.css',
  'mobile/src/screens/flota.css', 'mobile/src/App.tsx', 'mobile/src/app/store.ts', 'mobile/src/components/BandaAcces.tsx',
  'mobile/src/components/bandaAcces.css', 'mobile/src/components/Icon.tsx', 'mobile/src/screens/Menu.tsx'];
const lipsaFis = FISIERE.filter((f) => !fs.existsSync(path.join(ROOT, f)));
T('toate fișierele citite de probă există', !lipsaFis.length, lipsaFis.join(', '));

const html = citeste('public/index.html');
const server = citeste('server.js');
const libFactura = citeste('mobile/src/lib/factura.ts');
const endpoints = citeste('mobile/src/api/endpoints.ts');
const docFactura = citeste('mobile/src/components/DocumentFactura.tsx');

// Sursele telefonului (.ts / .tsx / .css din mobile/src), citite o dată, pentru verificările „într-un singur loc".
const fisiereTel = [];
(function umbla(d) {
  let intrari = [];
  try { intrari = fs.readdirSync(path.join(ROOT, d)); } catch (e) { return; }
  intrari.forEach((f) => {
    const rel = d + '/' + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) umbla(rel);
    else if (/\.(tsx?|css)$/.test(f)) fisiereTel.push({ rel, src: citeste(rel) });
  });
})('mobile/src');
const surseTs = fisiereTel.filter((x) => /\.tsx?$/.test(x.rel));

// lib/numar.ts („de" după cifră) și lib/factura.ts (regulile Facturării de pe telefon), traduse și încărcate o dată.
let numar = {}, F = {};
try { numar = modul(tsJs(citeste('mobile/src/lib/numar.ts'), 'numar.ts'), 'lib/numar.ts').exp; } catch (e) { console.log('    (lib/numar.ts: ' + e.message + ')'); }
try { F = modul(tsJs(libFactura, 'factura.ts'), 'lib/factura.ts', { './numar': numar }).exp; } catch (e) { console.log('    (lib/factura.ts: ' + e.message + ')'); }
T('lib/numar.ts și lib/factura.ts se traduc și rulează', typeof numar.nrDe === 'function' &&
  ['lunaText', 'stareClient', 'rutaFactura', 'felDinAdresa', 'ceEste', 'metodaText', 'puneLucrare', 'corpEmitere'].every((k) => typeof F[k] === 'function'));

// Bucățile paginii folosite de mai multe secțiuni.
const web = {
  esc: functie(html, 'function esc(s) {'),
  rDe: functie(html, 'function _rDe(n) {'),
  raxDe: functie(html, 'function _raxDe(n) {'),
  luni: (/var _GI_LUNI = \[[^\]]*\];/.exec(html) || [''])[0],
  luna: functie(html, 'function _giLunaText(cheie) {'),
  stare: functie(html, 'function _myInvStare(f) {'),
  markPaid: functie(html, 'window.raxInvoiceMarkPaid = async function (id, proforma) {'),
};
T('găsesc în pagină bucățile comune (esc, _rDe, _raxDe, _GI_LUNI, _giLunaText, _myInvStare, raxInvoiceMarkPaid)', Object.keys(web).every((k) => !!web[k]),
  Object.keys(web).filter((k) => !web[k]).join(', '));

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. Facturare (screens/Billing.tsx + lib/factura.ts + components/DocumentFactura.tsx)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function pachetFacturare() {
  sect('1. Facturare — factura unică și proforma, montajul strâns, luna din ciornă');
  const billing = citeste('mobile/src/screens/Billing.tsx');
  const css = citeste('mobile/src/screens/billing.css');

  // Fereastra „Generează factură" a paginii (montajul strâns, rândul, luna) și lista documentelor, rulate în vm.
  const bloc = taie(html, '// ── începe „factura montajului, strânsă" ──', '// ── sfârșit „factura montajului, strânsă" ──');
  const recalcWeb = functie(html, 'function _giRecalcLine(l) {');
  const invFmtD = functie(html, 'function _invFmtD(ts) {');
  const ceEWeb = functie(html, 'var ceE = function (v) {');
  T('găsesc în pagină fereastra facturii (montajul strâns, _giRecalcLine, _invFmtD) și „Ce e" din listă', !!(bloc && recalcWeb && invFmtD && ceEWeb));
  function webNou(vatRate) {
    const ctx = vm.createContext({ _giState: { lines: [], vatRate: vatRate, zileMontaj: [], nota: '' } });
    vm.runInContext([web.esc, web.luni, web.luna, invFmtD, web.rDe, web.raxDe, recalcWeb, bloc, ceEWeb, web.stare,
      'this.W = { strange: _giStrangeLucrarea, nota: _giNotaMontaj, luna: _giLunaText, ceE: ceE, stare: _myInvStare };'].join('\n'), ctx);
    return ctx;
  }
  const W = webNou(21).W;
  const zi = (an, l, z) => new Date(an, l - 1, z, 19, 0).getTime();
  const fara = (s) => String(s).replace(/<[^>]*>/g, '');

  sect('1.1 Factura montajului strânsă: telefonul dă ACELAȘI rezultat ca pagina (codul ei, rulat)');
  {
    let id = 0;
    const lucr = (d, n, pretGps) => ({ id: ++id, data: d, masini: n, total: n * ((pretGps || 100) + 60), partener: 'Montaj Vest',
      linii: [{ desc: 'Instalare dispozitiv GPS', qty: n, unitPrice: pretGps || 100 }, { desc: 'Instalare modul LV-CAN', qty: n, unitPrice: 60 }] });
    const cazuri = [
      ['trei zile, apăsate în altă ordine', [lucr(zi(2027, 1, 30), 15), lucr(zi(2027, 1, 15), 10), lucr(zi(2027, 1, 25), 10)]],
      ['o zi cu alt preț rămâne pe rândul ei', [lucr(zi(2027, 1, 15), 10), lucr(zi(2027, 2, 10), 20, 90)]],
      ['o singură zi, o mașină', [lucr(zi(2027, 3, 1), 1)]],
      ['„de" după cifră: 20, 21, 101, 119, 120 de mașini', [lucr(zi(2027, 4, 1), 20), lucr(zi(2027, 4, 2), 21), lucr(zi(2027, 4, 3), 101), lucr(zi(2027, 4, 4), 119), lucr(zi(2027, 4, 5), 120)]],
      ['o lucrare fără număr de mașini (fără paranteză)', [Object.assign(lucr(zi(2027, 5, 1), 4), { masini: null }), lucr(zi(2027, 5, 2), 3)]],
    ];
    cazuri.forEach(([nume, lucrari]) => {
      const w = webNou(21);
      lucrari.forEach((j) => w.W.strange(w._giState, j));
      let S = F.ciornaDinRaspuns({ vatRate: 21, fel: 'unica', lines: [], dinContract: { lucrari } }, 7, 'unica');
      lucrari.forEach((j) => { S = F.puneLucrare(S, j); });
      const rw = w._giState.lines.map((l) => [l.desc, l.qty, l.unitPrice, l.net, l.vat]);
      const rt = S.lines.map((l) => [l.desc, l.qty, l.unitPrice, l.net, l.vat]);
      T(nume + ': aceleași rânduri', J(rw) === J(rt), J(rw) + ' ≠ ' + J(rt));
      T(nume + ': aceeași mențiune', w._giState.nota === S.nota, w._giState.nota + ' ≠ ' + S.nota);
      T(nume + ': toate lucrările pleacă în `montaje`', J(F.montajeDeTrimis(S).sort()) === J(lucrari.map((j) => j.id).sort()));
    });
    // Mențiunea singură, pe liste de zile scrise direct.
    [[{ data: zi(2027, 1, 15), masini: 10 }], [{ data: zi(2027, 1, 15), masini: 1 }, { data: zi(2027, 1, 16), masini: 100 }], [], [{ data: null, masini: 4 }]].forEach((z, i) => {
      T('mențiunea, cazul ' + (i + 1), W.nota(z) === F.notaMontaj(z), W.nota(z) + ' ≠ ' + F.notaMontaj(z));
    });
  }

  sect('1.2 Luna, „Ce e" și starea clientului: aceleași vorbe ca pagina');
  {
    ['2026-01', '2026-10', '2027-12', '', null, 'x'].forEach((k) => T('luna ' + J(k), W.luna(k) === F.lunaText(k), W.luna(k) + ' ≠ ' + F.lunaText(k)));
    const docs = [
      { type: 'proforma', status: 'issued' }, { type: 'proforma', status: 'paid', factura_id: 9 }, { type: 'proforma', status: 'paid' },
      { type: 'invoice', fel: 'abonament', luna: '2026-10' }, { type: 'invoice', fel: 'unica' }, { type: 'invoice', fel: 'unica', din_proforma: 3 },
      { type: 'invoice', fel: null }, { type: 'invoice' },
    ];
    docs.forEach((v) => T('„Ce e" pentru ' + J(v), fara(W.ceE(v)) === F.ceEste(v), fara(W.ceE(v)) + ' ≠ ' + F.ceEste(v)));
    const acum = Date.now();
    const stari = [
      { type: 'invoice', status: 'paid' }, { type: 'proforma', status: 'paid' }, { type: 'invoice', status: 'canceled' },
      { type: 'invoice', status: 'issued', due_date: acum - 86400000 }, { type: 'invoice', status: 'sent', due_date: acum + 86400000 },
      { type: 'proforma', status: 'issued', due_date: acum - 1000 }, { type: 'invoice', status: 'issued' },
    ];
    stari.forEach((f) => T('starea clientului pentru ' + J(f), W.stare(f)[0] === F.stareClient(f)[0], W.stare(f)[0] + ' ≠ ' + F.stareClient(f)[0]));
    const stareSrc = taie(libFactura, 'export function stareClient', '\n}');
    T('culorile stărilor pe telefon sunt cele lizibile pe ambele teme (--fl-ok / --fd-warn / --red), nu --accent / --orange',
      !!stareSrc && !/--accent|--orange/.test(stareSrc));
  }

  sect('1.3 Ce face telefonul ALTFEL decât pagina, dinadins (revizia din 29.09)');
  {
    const j15 = { id: 15, data: zi(2027, 1, 15), masini: 10, linii: [{ desc: 'Instalare dispozitiv GPS', qty: 10, unitPrice: 100 }, { desc: 'Instalare modul LV-CAN', qty: 10, unitPrice: 60 }] };
    const j30 = { id: 30, data: zi(2027, 1, 30), masini: 15, linii: [{ desc: 'Instalare dispozitiv GPS', qty: 15, unitPrice: 100 }, { desc: 'Instalare modul LV-CAN', qty: 15, unitPrice: 60 }] };
    const baza = () => F.puneLucrare(F.puneLucrare(F.ciornaDinRaspuns({ vatRate: 19, fel: 'unica', lines: [] }, 7, 'unica'), j15), j30);
    const S = baza();
    T('două zile pe aceleași două rânduri (25 + 25)', S.lines.length === 2 && S.lines[0].qty === 25 && S.lines[1].qty === 25);

    // Cantitatea scăzută pe un rând comun: ziua cea dintâi rămâne, cea de pe 30.01 NU mai pleacă în `montaje`.
    let A = F.editeazaLinie(S, 0, 'qty', 10);
    T('25 → 10 pe rândul GPS: lucrarea din 15.01 rămâne întreagă, cea din 30.01 iese din `montaje`',
      J(F.montajeDeTrimis(A)) === '[15]' && F.acoperire(A)[30] === 'partiala', J(F.acoperire(A)));
    A = F.editeazaLinie(A, 1, 'qty', 10);
    T('… și după ce scazi și rândul LV-CAN, 30.01 e scoasă de tot', F.acoperire(A)[30] === 'scoasa' && J(F.montajeDeTrimis(A)) === '[15]');
    T('… iar mențiunea automată spune doar ziua rămasă', A.nota === 'Montaj executat pe 15.01.2027 (10 mașini).', A.nota);

    // Rândul șters: lucrările lui nu mai pleacă facturate.
    const B = F.stergeLinie(S, 0);
    T('rândul GPS șters: nicio lucrare nu mai e întreagă pe factură → `montaje` gol', F.montajeDeTrimis(B).length === 0, J(F.acoperire(B)));
    T('… și nicio zi nu mai e scrisă singură în mențiune', B.nota === '', B.nota);
    T('corpul emiterii nu trimite lucrări care nu sunt pe factură', F.corpEmitere(B, 'invoice').montaje.length === 0);

    // „Scoate" pe o lucrare: ia exact cât adusese ea.
    const C = F.scoateLucrare(S, 30);
    T('„Scoate" 30.01: rândurile scad la 10 + 10, iar în `montaje` rămâne doar 15.01',
      C.lines.length === 2 && C.lines[0].qty === 10 && C.lines[1].qty === 10 && J(F.montajeDeTrimis(C)) === '[15]');
    T('după „Scoate", lucrarea se poate pune din nou (butonul ei se reaprinde)', F.acoperire(F.puneLucrare(C, j30))[30] === 'intreaga');
    T('o lucrare deja pusă nu se pune a doua oară', J(F.puneLucrare(S, j30).lines) === J(S.lines));
    const D = F.scoateLucrare(F.scoateLucrare(S, 30), 15);
    T('scoase amândouă: nu rămâne niciun rând gol pe factură', D.lines.length === 0);

    // Corectura de mână rămâne: o lucrare nouă nu se varsă peste un rând corectat.
    const j40 = { id: 40, data: zi(2027, 2, 10), masini: 5, linii: [{ desc: 'Instalare dispozitiv GPS', qty: 5, unitPrice: 100 }] };
    const E0 = F.editeazaLinie(S, 0, 'qty', 26);   // omul a pus o mașină în plus, de mână
    const E = F.puneLucrare(E0, j40);
    T('rândul GPS corectat de mână (26) rămâne 26 după ce pui o lucrare nouă, iar lucrarea nouă are rândul ei',
      E.lines[0].qty === 26 && E.lines.length === 3 && E.lines[2].qty === 5 && F.acoperire(E)[40] === 'intreaga', J(E.lines.map((l) => l.qty)));
    T('pe un rând NEATINS, lucrarea nouă se adună (ca pe web)', F.puneLucrare(S, j40).lines[0].qty === 30);

    // Mențiunea scrisă de om nu se rescrie.
    const G = F.puneLucrare(F.puneNota(S, 'Montaj conform comenzii nr. 12.'), j40);
    T('mențiunea scrisă de mână rămâne după ce mai pui o lucrare', G.nota === 'Montaj conform comenzii nr. 12.', G.nota);
    const G2 = F.puneLucrare(F.puneNota(F.scoateLucrare(S, 30), ''), j30);
    T('mențiunea golită de mână rămâne goală (omul a hotărât), nu se rescrie singură', G2.nota === '', G2.nota);
    T('mențiunea se taie la 500 de caractere (ca serverul)', F.puneNota(S, 'x'.repeat(700)).nota.length === 500);

    // Sursele din contract: aparatele o singură dată, butonul se reaprinde dacă le ștergi.
    const dc = { curs: 5.0785, aparate: [{ desc: 'Echipament — FMC130', qty: 10, unitPrice: 507.85 }], montaj: [] };
    const H = F.puneContract(F.ciornaDinRaspuns({ vatRate: 19, fel: 'unica', lines: [], dinContract: dc }, 7, 'unica'), 'aparate');
    T('aparatele din contract se pun o dată (10 × 507,85 = 5.078,50)', H.lines.length === 1 && H.lines[0].net === 5078.5 && F.sursaPusa(H, 'aparate'));
    T('a doua apăsare nu le mai pune', F.puneContract(H, 'aparate').lines.length === 1);
    T('șterse de pe factură, butonul se reaprinde', !F.sursaPusa(F.stergeLinie(H, 0), 'aparate'));

    // Aparatele deja facturate pe alt document al firmei (proforma de avans) — avertisment.
    const docs = [
      { company_id: 7, full_number: 'PF-2027-0001', type: 'proforma', status: 'paid', factura_id: 12, lines: [{ desc: 'Echipament — FMC130' }] },
      { company_id: 7, full_number: 'RAT-2027-0012', type: 'invoice', status: 'paid', lines: JSON.stringify([{ desc: 'Echipament — FMC130' }]) },
      { company_id: 7, full_number: 'RAT-2027-0013', type: 'invoice', status: 'canceled', lines: [{ desc: 'Echipament — FMC130' }] },
      { company_id: 8, full_number: 'RAT-2027-0014', type: 'invoice', status: 'issued', lines: [{ desc: 'Echipament — FMC130' }] },
      { company_id: 7, full_number: 'PF-2027-0002', type: 'proforma', status: 'issued', lines: [{ desc: 'Echipament — FMC130' }] },
    ];
    T('aparatele apar deja pe RAT-2027-0012 și PF-2027-0002 (nu pe cea anulată, nu la altă firmă, nu pe proforma încasată)',
      J(F.aparateDejaPe(docs, 7, dc)) === J(['RAT-2027-0012', 'PF-2027-0002']), J(F.aparateDejaPe(docs, 7, dc)));
    T('fără aparate în contract, niciun avertisment', F.aparateDejaPe(docs, 7, { aparate: [] }).length === 0);

    // Luna care n-a început.
    const azi = new Date(2026, 8, 30).getTime();
    T('luna care n-a început se recunoaște (octombrie, văzut pe 30.09)', F.lunaViitoare('2026-10', azi) && !F.lunaViitoare('2026-09', azi) && !F.lunaViitoare('2025-12', azi) && !F.lunaViitoare(null, azi));
    T('metoda încasării, pe înțelesul omului: numerar, transfer bancar; fără metodă sau „manual" → altă metodă',
      F.metodaText('cash') === 'numerar' && F.metodaText('transfer') === 'transfer bancar' && F.metodaText(undefined) === 'altă metodă' &&
      F.metodaText(null) === 'altă metodă' && F.metodaText('manual') === 'altă metodă');
  }

  sect('1.4 Emiterea: aceeași formă ca pe web (raxGenIssue), cu felul și luna din CIORNĂ');
  {
    // 30.09: corpul emiterii stă în `_giCorp` (același pentru „Previzualizează" și „Emite").
    const corpWeb = (/function _giCorp\(\) \{[\s\S]*?return \{ companyId: _giState\.companyId,([^;]*?)\};/.exec(html) || ['', ''])[0];
    const cheiWeb = (corpWeb.match(/([a-zA-Z]+):/g) || []).map((x) => x.slice(0, -1)).filter((k, i, a) => a.indexOf(k) === i && ['companyId', 'fel', 'luna', 'tip', 'lines', 'montaje', 'note'].includes(k));
    const S = F.ciornaDinRaspuns({ vatRate: 19, fel: 'abonament', luna: '2026-10', lines: [{ desc: 'Abonament GPS — octombrie 2026', qty: 3, unitPrice: 45 }] }, 7, 'abonament');
    const b = F.corpEmitere(S, 'proforma');
    T('aceleași chei ca pe web: companyId, fel, luna, tip, lines, montaje, note', cheiWeb.length === 7 && J(Object.keys(b).sort()) === J(cheiWeb.slice().sort()), J(cheiWeb) + ' / ' + J(Object.keys(b)));
    T('luna vine din răspunsul ciornei (2026-10), felul la fel', b.luna === '2026-10' && b.fel === 'abonament');
    T('la abonament: document = factură fiscală (niciodată proformă), fără mențiuni, fără lucrări', b.tip === 'invoice' && b.note === null && b.montaje.length === 0);
    T('rândurile emise: 3 × 45 = 135', b.lines.length === 1 && b.lines[0].net === 135);
    T('fără perioadă trimisă (o pune serverul)', !('periodStart' in b) && !('periodEnd' in b));
    let U = F.ciornaDinRaspuns({ vatRate: 19, fel: 'unica', lines: [] }, 7, 'unica');
    U = F.adaugaLinie(U); U = F.editeazaLinie(U, 0, 'desc', 'Echipament — FMC130'); U = F.adaugaLinie(U);
    U = F.puneNota(U, '  Avans pentru aparate.  ');
    const bu = F.corpEmitere(U, 'proforma');
    T('la factura unică: proforma pleacă proformă, luna goală, mențiunea curățată', bu.tip === 'proforma' && bu.luna === null && bu.note === 'Avans pentru aparate.');
    T('rândul fără denumire nu pleacă', bu.lines.length === 1);
    T('felul cerut rămâne dacă serverul nu-l spune', F.ciornaDinRaspuns({}, 7, 'unica').fel === 'unica');
  }

  sect('1.5 Ecranul Facturare (sursa): fereastra, lista, starea firmelor');
  {
    const gen = taie(billing, 'function GenerateInvoiceSheet', '\n// Un rând din registrul încasărilor');
    T('găsesc fereastra „Generează factură" (GenerateInvoiceSheet)', gen.length > 500);
    T('fereastra alege „Ce facturezi" (abonamentul unei luni / factură unică)', /Abonamentul unei luni/.test(gen) && /Factură unică/.test(gen) && /setFel\('unica'\)/.test(gen));
    T('la factura unică: „Document" = factură fiscală sau proformă', /Factură fiscală/.test(gen) && /setTip\('proforma'\)/.test(gen) && /merge la ANAF/.test(gen));
    T('ciorna se cere cu felul ales și cu luna doar la abonament', /Api\.invoiceDraft\(id, fel === 'abonament' \? cheieLuna\(yr, mon\) : undefined, fel\)/.test(gen));
    T('schimbi firma, luna sau anul → ciorna se golește', (gen.match(/if \(goleste\(\)\) set(Cid|Mon|Yr)\(v\)/g) || []).length === 3);
    T('schimbi felul → ciorna se golește', /fel !== 'abonament' && goleste\(\)/.test(gen) && /!unica && goleste\(\)/.test(gen));
    T('un răspuns întârziat al unei ciorne vechi nu se mai pune', /if \(nr !== cerere\.current\) return;/.test(gen) && /cerere\.current\+\+/.test(gen));
    T('emiterea trimite corpul din ciornă (corpEmitere), fără perioada din selector', /Api\.issueInvoice\(corp\)/.test(gen) && /corpEmitere\(S, tip\)/.test(gen) && !/periodStart/.test(gen));
    T('butonul spune „Emite proforma" la proformă', /'Emite proforma'/.test(gen));
    T('nota proformei: nu e factură fiscală, nu merge la ANAF, „Încasată" o face factură', /Proforma nu e factură fiscală: are serie proprie și nu merge la ANAF/.test(gen));
    T('mențiunile pe factură, doar la factura unică, cel mult 500', /Mențiuni pe factură \(apar sub rânduri\)/.test(gen) && /maxLength=\{500\}/.test(gen));
    T('abonamentul: câte mașini intră și cum, cu „de" după cifră', /nrDe\(S\.aparateIntregi, 'mașină', 'mașini'\)/.test(gen) && /cu zilele de la montaj/.test(gen));
    T('abonamentul: aparatele nepornite se spun', /nrDe\(S\.aparateNepornite, 'aparat e', 'aparate sunt'\)/.test(gen) && /nu transmit încă/.test(gen));
    // La UN aparat, toată fraza la singular („nu transmite", „Pornește singur"), nu doar subiectul.
    T('abonamentul: la un singur aparat nepornit, fraza e toată la singular',
      gen.indexOf("Number(S.aparateNepornite) === 1\n                      ? '1 aparat e pe firmă, dar nu transmite încă: nu intră pe factură. Pornește singur la montaj, la prima transmisie.'") > 0 &&
      gen.indexOf("'aparate sunt') + ' pe firmă, dar nu transmit încă: nu intră pe factură. Pornesc singure la montaj, la prima transmisie.'") > 0);
    T('abonamentul: „(pornită luna trecută)" la o singură mașină pe zile', gen.indexOf("(Number(S.aparatePeZile) === 1 ? 'pornită' : 'pornite')") > 0);
    T('abonamentul: banda „Luna asta e deja facturată" + butonul oprit', /Luna asta e deja facturată/.test(gen) && /\(!unica && !!S\.deja\)/.test(gen));
    T('abonamentul: „Nimic de facturat pe luna asta" la zero rânduri, butonul oprit', /Nimic de facturat pe luna asta/.test(gen) && /!S\.lines\.length/.test(gen));
    T('fără „+ Dispozitiv" / „+ Montaj" scrise de mână (montajul ajungea pe abonament); rămâne „Linie liberă"', !/\+ Dispozitiv|\+ Montaj/.test(billing) && /\+ Linie liberă/.test(gen));
    T('sursele din contract: aparatele, lucrările executate, montajul din contract (doar fără lucrări)',
      /puneContract\(S, 'aparate'\)/.test(gen) && /puneLucrare\(S, j\)/.test(gen) && /areMontaj = !areLucrari &&/.test(gen) && /Firma n-are încă un contract/.test(gen));
    T('o lucrare pusă se poate scoate („Scoate"), iar cea pusă doar în parte o spune', /scoateLucrare\(S, j\.id\)/.test(gen) && /doar o parte e pe factură/.test(gen));
    T('toast-ul emiterii spune numărul și lucrările trecute pe „facturat clientului"', /'Proformă emisă: ' : 'Factură emisă: '/.test(gen) && /montajeFacturate/.test(gen));
    T('409 (abonamentul dublu): se arată mesajul serverului, care are numărul facturii', /showToast\(e\?\.message \|\| 'Eroare la emitere', true\)/.test(gen));
    T('Date emitent lipsă: se spune înainte de rânduri, cu buton spre „Date emitent"', /Completează întâi <b>Date emitent<\/b>/.test(gen) && /onIssuer\(\)/.test(gen));

    const rand = taie(billing, 'function FiscalRow', '\n// „Generează factură"');
    T('lista: „Ce e" + ziua emiterii la noi; ziua și scadența la client', /ceEste\(v\)/.test(rand) && /scadentă \{fmtD\(v\.due_date\)\}/.test(rand) && /stareClient\(v\)/.test(rand));
    T('lista: la proformă, e-Factura „nu se trimite"', /e-Factura: nu se trimite/.test(docFactura) && /efOf\(v\)/.test(rand));
    T('„Facturile mele": banda cu vorbele web-ului', /Plățile sunt la zi/.test(billing) && /Aveți o factură restantă/.test(billing) && /Accesul este suspendat/.test(billing));
    T('„Plăți / încasări": metoda pe rând și „Total încasat" deasupra', /Metodă: \{metodaText\(p\.method\)\}/.test(billing) && /Total încasat:/.test(billing) && /setPaysTotal\(Number\(pj && \(pj as any\)\.total\) \|\| 0\)/.test(billing));
    T('„Status facturare companii": „Total plătit" (paid_total)', /Total plătit:/.test(billing) && /c\.paid_total/.test(billing));
    // Pe rândul firmei, „Facturile firmei" (fișa, fila Facturi), ca pe web; NU „Încasare", care înregistra o încasare
    // fără factură și lăsa factura restantă „emisă".
    const lista = taie(billing, '<div class="mn-sec">Status facturare companii</div>', '<div class="mn-sec">Facturi fiscale</div>');
    T('rândul firmei: „Facturile firmei" → fișa, fila Facturi (rutaFisa)', lista.indexOf("onClick={() => loc.route(rutaFisa(c.id, 'facturi'))}>Facturile firmei</button>") > 0 &&
      billing.indexOf("import { rutaFisa } from '../lib/companii';") > 0);
    T('rândul firmei nu mai are „Încasare" (încasarea fără factură rămâne doar pe „+" de sus)', !!lista && lista.indexOf('setPay({ companyId') < 0 && lista.indexOf('>Încasare<') < 0 &&
      billing.indexOf('onClick={() => setPay({})} aria-label="Încasare fără factură"') > 0);
    T('pe web, rândul are „Facturile firmei" → raxOpenCompanyDetail(id, \'facturi\')', html.indexOf("onclick=\"raxOpenCompanyDetail(' + c.id + ', \\'facturi\\')\"><i class=\"fas fa-file-invoice-dollar\"></i> Facturile firmei") > 0);
    T('starea firmei nu mai repetă numărul facturii (are rândul ei)', billing.indexOf("' · factura ' + np.factura.numar") < 0 && lista.indexOf('Factura restantă: {restantaOf(c)}') > 0);
    // „Factura restantă": bucata paginii (restanta, din raxLoadBillingStatus) și a telefonului (restantaOf), RULATE.
    {
      const webR = functie(html, 'var restanta = function (a) {');
      const iR = html.indexOf('var restanta = function (a) {');
      const webF = (/var fmtD = function \(ts\) \{[^\n]*\};/.exec(html.slice(Math.max(0, iR - 1500), iR)) || [''])[0];
      const telR = functie(billing, 'function restantaOf(c: any): string {');
      const telF = ((/export const fmtD = [^\n]*;/.exec(docFactura) || [''])[0]).replace('export ', '');
      T('găsesc „Factura restantă" pe web și pe telefon', webR.length > 60 && !!webF && telR.length > 60 && !!telF);
      let Wr = null, Tr = null;
      try { const c = vm.createContext({}); vm.runInContext(web.esc + '\n' + webF + '\n' + webR + '\nthis.r = restanta;', c); Wr = c.r; } catch (e) { console.log('    (web: ' + e.message + ')'); }
      try { const c = vm.createContext({}); vm.runInContext(tsJs(telF + '\n' + telR, 'restanta.ts') + '\nthis.r = restantaOf;', c); Tr = c.r; } catch (e) { console.log('    (telefon: ' + e.message + ')'); }
      const Z = Date.UTC(2026, 9, 15, 10);
      const cazuri = [
        {}, { neplata: null }, { neplata: { faza: 'avertisment', zilePanaLaSuspendare: 6 } },
        { status: 'grace', neplata: { faza: 'avertisment', factura: { numar: 'RAT-2026-0012', due_date: Z } } },
        { status: 'expired', motiv: 'neplata', neplata: { factura: { numar: 'RAT-2026-0003', due_date: Z - 20 * 864e5 } } },
        { status: 'grace', neplata: { factura: { numar: null, due_date: Z } } },
      ];
      cazuri.forEach((a, i) => {
        const w = Wr ? Wr(a) : '?', t = Tr ? Tr({ access: a }) : '!';
        T('„Factura restantă" #' + i + ' ca pe web: ' + w, w === t, J(t));
      });
    }
    T('„Rulează acum" nu mai spune „nu au deja factură pe luna curentă" (regula veche)', !/nu au deja factură pe luna curentă/.test(billing));
  }

  sect('1.6 Hârtia documentului: UNA singură (components/DocumentFactura.tsx), pentru Facturare și pentru fișa firmei');
  {
    const doc = docFactura;
    T('Facturare folosește hârtia comună (DocumentFactura), nu una a ei', !/function FiscalInvoiceSheet/.test(billing) &&
      /<DocumentFactura inv=\{fview\} privire="noi"/.test(billing) && /<DocumentFactura inv=\{view\} privire="client"/.test(billing));
    T('„Încasată" pe proformă: toast cu numărul facturii născute; întrebarea vine din lib/factura.ts', /'Proformă încasată'/.test(doc) && /r\.invoice && r\.invoice\.full_number/.test(doc) &&
      /confirm\(pf \? INTREB_PROFORMA : INTREB_FACTURA\)/.test(doc) && /Proforma rămâne legată de ea\./.test(F.INTREB_PROFORMA));
    T('întrebările de dinainte de ✓ sunt scrise O dată pe telefon (lib/factura.ts)',
      surseTs.filter((x) => x.src.indexOf('Proforma e ÎNCASATĂ?') >= 0).length === 1 && surseTs.filter((x) => x.src.indexOf('Marchezi factura ca PLĂTITĂ?') >= 0).length === 1 &&
      libFactura.indexOf('Proforma e ÎNCASATĂ?') >= 0);
    const qW = /\? '([^']+)'\s*: '([^']+)';/.exec(web.markPaid) || [];
    T('întrebările din lib/factura.ts = cele de pe web (raxInvoiceMarkPaid)', !!qW[1] && F.INTREB_PROFORMA === qW[1] && F.INTREB_FACTURA === qW[2], qW[1]);
    T('anularea vorbește de „document"', /Anulezi acest document\?/.test(doc) && /'Document anulat'/.test(doc));
    T('„Verifică status ANAF" pe facturile trimise (nu pe proformă)', /!pf && inv\.efactura_status === 'uploaded'/.test(doc) && /Api\.invoiceEfacturaStatus\(inv\.id\)/.test(doc));
    T('proforma nu se trimite la ANAF', /!pf && inv\.status !== 'canceled' && inv\.efactura_status !== 'validated'/.test(doc));
    // 30.09: factura pleacă singură la ANAF la emitere. Butonul rămâne doar pe cea netrimisă sau respinsă — ca pe web.
    T('„Trimite ANAF" nu apare pe o factură aflată deja la ANAF (ar dubla-o în SPV) — aceeași regulă ca pe web',
      /inv\.efactura_status !== 'validated' && inv\.efactura_status !== 'uploaded' && <button/.test(doc) &&
      /v\.efactura_status !== 'validated' && v\.efactura_status !== 'uploaded'\) act \+= /.test(html));
    T('hârtia arată tot: ziua emiterii, furnizorul cu IBAN, rândurile, TVA, totalul, scadența, perioada, mențiunile, nota proformei',
      /Emisă pe/.test(doc) && /IBAN: \{iss\.iban\}/.test(doc) && /lines\.map/.test(doc) && /inv\.vat_amount/.test(doc) && /Total de plată/.test(doc) &&
      /Scadență/.test(doc) && /Perioada/.test(doc) && /Mențiuni/.test(doc) && /document fără valoare fiscală/.test(doc) && /Emisă la încasarea unei proforme\./.test(doc));
    T('„Emisă la încasarea unei proforme" nu se spune a doua oară când mențiunea o spune deja', /inv\.din_proforma && !dinProformaSpus/.test(doc));
    T('clientul și fișa văd starea pe limba clientului (stareClient, ca _raxCodFacturi); butoanele doar la noi, în Facturare',
      /privire === 'noi' \? stareNoi\(inv\) : stareClient\(inv\)/.test(doc) && /const actiuni = privire === 'noi' && !!plin;/.test(doc) && /\{actiuni && <div class="frm-actions"/.test(doc));
    T('hârtia cere documentul întreg (GET /api/invoices/:id) când lista n-are rândurile — dar nu la client (ruta e a noastră)',
      /const eIntreg = \(v: any\) => !!v && Array\.isArray\(json\(v\.lines\)\);/.test(doc) && /Api\.invoice\(Number\(inv0\.id\)\)/.test(doc) &&
      /if \(privire === 'client'\) \{ setPlin\(inv0\); return; \}/.test(doc));
    T('hârtia se închide la „înapoi" și nu scrie un răspuns venit după închidere', /useInapoiInchide\(true/.test(doc) && /let viu = true/.test(doc) && /viu = false/.test(doc));
  }

  sect('1.6b PDF-ul de pe server („Vezi" / „Descarcă") și ce a plecat odată cu documentul — ca pe web (30.09)');
  {
    const doc = docFactura;
    // Ce a plecat (anunțul, emailul, ANAF): _invTrimisaText din pagină, RULATĂ, pe aceleași răspunsuri ca telefonul.
    const trimisaWeb = functie(html, 'function _invTrimisaText(t, pf) {');
    let TW = null;
    try { const c = vm.createContext({}); vm.runInContext(trimisaWeb + '\nthis.f = _invTrimisaText;', c); TW = c.f; } catch (e) { console.log('    (pagina: ' + e.message + ')'); }
    T('găsesc _invTrimisaText în pagină și trimisaText în telefon', typeof TW === 'function' && typeof F.trimisaText === 'function');
    const raspunsuri = [null, undefined, {}, { notificare: true }, { notificare: true, email: true }, { email: false, emailMotiv: 'serverul n-are email' },
      { notificare: true, anaf: 'uploaded' }, { anaf: 'error' }, { anaf: null }, { notificare: true, email: true, emailMotiv: 'x', anaf: 'uploaded' }];
    let laFel = 0, total = 0;
    for (const t of raspunsuri) for (const pf of [true, false]) { total++; if (TW && TW(t, pf) === F.trimisaText(t, pf)) laFel++; }
    T('ce a plecat: aceleași cuvinte ca pe web, pe ' + total + ' de răspunsuri (factură și proformă)', laFel === total, laFel + '/' + total);
    T('după „Emite": mesajul spune ce a plecat (felul documentului contează: proforma nu merge la ANAF)',
      /trimisaText\(r && r\.trimisa, corp\.tip === 'proforma'\)/.test(billing));
    T('după „Încasată" pe proformă: la fel, pentru factura fiscală născută', /trimisaText\(r && r\.trimisa, false\)/.test(doc));
    // PDF-ul: aceleași rute ca pe web (la noi / la client), iar serverul le are, fiecare cu ușa ei.
    T('rutele PDF-ului = cele din pagină: la noi /api/invoices/:id/pdf, la client /api/billing/my-invoices/:id/pdf',
      F.rutaPdfFactura(7, false) === '/api/invoices/7/pdf' && F.rutaPdfFactura(7, true) === '/api/billing/my-invoices/7/pdf'
      && html.indexOf("_invHartieBtns('/api/invoices/' + f.id + '/pdf'") >= 0 && html.indexOf("_invHartieBtns('/api/billing/my-invoices/' + f.id + '/pdf'") >= 0);
    T('…iar serverul le are: a noastră doar pentru super-admin, a clientului doar pe firma lui',
      /app\.get\('\/api\/invoices\/:id\/pdf', requireAuth, requireSuperadmin,/.test(server) && /app\.get\('\/api\/billing\/my-invoices\/:id\/pdf', requireAuth, requirePerm\('manageUsers'\), withCompany,/.test(server));
    T('hârtia documentului are „Vezi" și „Descarcă" pe PDF-ul serverului, în toate cele trei priviri (ruta clientului la client)',
      /<HartieBtns path=\{rutaPdfFactura\(inv\.id, privire === 'client'\)\} ce=\{pf \? 'Proforma' : 'Factura'\}/.test(doc) && /import \{ HartieBtns \} from '\.\/ContractUi';/.test(doc));
  }

  sect('1.7 Adresa „/billing?factura=…" și cererile spre server');
  {
    const u = new URL('http://x' + F.rutaFactura(42, 'unica'));
    T('rutaFactura(42, "unica") → /billing?factura=42&fel=unica', F.rutaFactura(42, 'unica') === '/billing?factura=42&fel=unica' && u.searchParams.get('factura') === '42');
    T('rutaFactura(42, "abonament") → /billing?factura=42 (felul implicit)', F.rutaFactura(42, 'abonament') === '/billing?factura=42' && F.rutaFactura(42) === '/billing?factura=42');
    T('felDinAdresa: „unica" → unica; „abonament", gol sau altceva → abonament',
      F.felDinAdresa('unica') === 'unica' && F.felDinAdresa('abonament') === 'abonament' && F.felDinAdresa(undefined) === 'abonament' && F.felDinAdresa('x') === 'abonament');
    T('ecranul citește felul din adresă și îl dă ferestrei', /const facturaFel = felDinAdresa\(q\.fel\)/.test(billing) && /setGen\(\{ cid: facturaPentru, fel: facturaFel \}\)/.test(billing) && /felInitial=\{gen\.fel\}/.test(billing));
    const cuAdresa = surseTs.filter((x) => /['"`]\/billing\?factura=/.test(x.src)).map((x) => x.rel);
    T('adresa „/billing?factura=" e scrisă într-un singur loc (lib/factura.ts)', cuAdresa.length === 1 && cuAdresa[0] === 'mobile/src/lib/factura.ts', J(cuAdresa));

    T('invoiceDraft trimite felul (și luna doar la abonament)', /fel === 'unica' \? \{ companyId, fel \} : \{ companyId, fel, luna \}/.test(endpoints));
    T('„Verifică status ANAF" cheamă GET /api/invoices/:id/efactura/status', /invoiceEfacturaStatus: \(id: number\) => api<[^>]*>\(`\/api\/invoices\/\$\{id\}\/efactura\/status`\)/.test(endpoints));
    T('facturile se cer până la 1000 (ca pe web)', /'\/api\/invoices\?limit=1000'/.test(endpoints));
    T('apelul spre ruta ștearsă (PUT /api/companies/:id/access) a plecat și nu-l cheamă nimeni',
      !/setCompanyAccess/.test(surseTs.map((x) => x.src).join('\n')) && !/companies\/\$\{id\}\/access`/.test(endpoints));
    T('serverul chiar nu mai are ruta aceea', !/app\.put\('\/api\/companies\/:id\/access'/.test(server));
  }

  sect('1.8 billing.css');
  {
    const clase = new Set();
    (billing.match(/class=\{?["'`][^"'`]*["'`]/g) || []).forEach((m) => (m.match(/bill-[a-z-]+/g) || []).forEach((c) => clase.add(c)));
    (billing.match(/'bill-[a-z-]+/g) || []).forEach((m) => clase.add(m.slice(1)));
    const lipsa = [...clase].filter((c) => !new RegExp('\\.' + c + '\\b').test(css));
    T('fiecare clasă bill-… folosită are regula ei în billing.css', lipsa.length === 0, J(lipsa));
    T('textul avertismentelor și al surselor e pe variabilele temei (fără verde/portocaliu pe text în billing.css)',
      !/(^|[^-])color:\s*(var\(--accent\)|var\(--orange\)|#3FE07D|#f59e0b)/im.test(faraComentariiCss(css)));
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Fișa firmei (screens/CompanySheet.tsx, CompanyAbonament.tsx, components/ContractPasi.tsx)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function pachetFisa() {
  sect('2. Fișa firmei — fila „Facturi", „Abonament & plăți", drumul clientului → factura unică');
  const fisa = citeste('mobile/src/screens/CompanySheet.tsx');
  const abo = citeste('mobile/src/screens/CompanyAbonament.tsx');
  const pasi = citeste('mobile/src/components/ContractPasi.tsx');
  const drum = citeste('mobile/src/components/ContractDrum.tsx');

  // Pagina: fila „Facturi" a fișei (_raxCodFacturi), cu vecinii ei.
  const W = vm.createContext({ Date, Number, String, Math, JSON });
  const invMoney = functie(html, 'function _invMoney(n) {');
  const codFacturi = functie(html, 'function _raxCodFacturi(d) {');
  // „Vezi" / „Descarcă" pe fiecare document (30.09): hârtia e PDF-ul de pe server, butoanele le face _invHartieBtns.
  const hartieBtns = functie(html, 'function _invHartieBtns(url, pf) {');
  T('găsesc în pagină _invMoney, _invHartieBtns și _raxCodFacturi', !!(invMoney && hartieBtns && codFacturi));
  let webOk = true;
  try { vm.runInContext([web.esc, invMoney, hartieBtns, web.luni, web.luna, web.stare, codFacturi].join('\n'), W); } catch (e) { webOk = false; console.log('    (pagina: ' + e.message + ')'); }
  T('bucățile din pagină rulează', webOk);

  // Telefonul: blocul dintre sentinele din fișă (+ bani2, legatura), cu lunaText din lib/factura.ts.
  const blocTel = taie(fisa, '// ── începe „documentele firmei" ──', '// ── sfârșit „documentele firmei" ──');
  T('fișa are blocul „documentele firmei" între sentinele', !!blocTel);
  const bani2Src = (/const bani2 = [^\n]*;/.exec(fisa) || [''])[0];
  const legSrc = functie(fisa, 'function legatura(f: any, docs: any[]): string {');
  const Tel = {};
  let telOk = true;
  try {
    vm.runInNewContext(tsJs(blocTel + '\n' + bani2Src + '\n' + legSrc +
      '\nOUT.ceEDocumentul = ceEDocumentul; OUT.bani2 = bani2; OUT.legatura = legatura;', 'CompanySheet-bloc.ts'),
    { OUT: Tel, lunaText: F.lunaText, Number, String });
  } catch (e) { telOk = false; console.log('    (fișa: ' + e.message + ')'); }
  T('blocul din fișă (+ bani2, legatura) se traduce și rulează', telOk && typeof Tel.ceEDocumentul === 'function');
  // Întrebarea de dinainte de ✓ și butonul ei stau O dată pe telefon, în lib/factura.ts (numărat la 1.6); fișa le importă.
  T('fișa ia întrebarea și butonul ✓ din lib/factura.ts (INTREB_* / OK_*)',
    /import \{[^}]*\bINTREB_PROFORMA, INTREB_FACTURA, OK_PROFORMA, OK_FACTURA\b[^}]*\} from '\.\.\/lib\/factura'/.test(fisa));

  sect('2.1 Fila „Facturi": aceleași documente, același „Ce e", aceeași stare, același ✓ ca pe web (_raxCodFacturi)');
  const ZI = 86400000, acum = Date.now();
  const docs = [
    { id: 11, full_number: 'PF-2026-0003', type: 'proforma', fel: 'unica', luna: null, status: 'issued', issue_date: acum - 3 * ZI, due_date: acum + 12 * ZI, total: 6779.85 },
    { id: 12, full_number: 'PF-2026-0002', type: 'proforma', fel: 'unica', luna: null, status: 'paid', issue_date: acum - 40 * ZI, due_date: acum - 25 * ZI, total: 1200, factura_id: 13 },
    { id: 13, full_number: 'RAT-2026-0021', type: 'invoice', fel: 'unica', luna: null, status: 'paid', issue_date: acum - 20 * ZI, due_date: acum - 20 * ZI, total: 1200, din_proforma: 12 },
    { id: 14, full_number: 'RAT-2026-0020', type: 'invoice', fel: 'abonament', luna: '2026-09', status: 'issued', issue_date: acum - 29 * ZI, due_date: acum - 14 * ZI, total: 2708.1 },
    { id: 15, full_number: 'RAT-2026-0019', type: 'invoice', fel: 'abonament', luna: '2026-01', status: 'issued', issue_date: acum - 2 * ZI, due_date: acum + 13 * ZI, total: 1966.9 },
    { id: 16, full_number: 'RAT-2026-0018', type: 'invoice', fel: 'unica', luna: null, status: 'canceled', issue_date: acum - 60 * ZI, due_date: acum - 45 * ZI, total: 250 },
    { id: 17, full_number: 'RAT-2026-0004', type: 'invoice', fel: null, luna: null, status: 'issued', issue_date: acum - 90 * ZI, due_date: null, total: 86 },
    { id: 18, full_number: 'RAT-2026-0003', type: 'invoice', fel: 'abonament', luna: null, status: 'paid', issue_date: acum - 100 * ZI, due_date: acum - 85 * ZI, total: 221 },
    { id: 19, full_number: 'RAT-2026-0005', type: 'invoice', fel: 'abonament', luna: '2026-12', status: 'issued', issue_date: acum - 1 * ZI, due_date: acum + 14 * ZI, total: 0.5 },
  ];
  const plati = [{ amount_ron: 1200, paid_at: acum - 20 * ZI, note: 'Factură RAT-2026-0021 (proforma PF-2026-0002)', method: 'transfer' }, { amount_ron: 500, paid_at: acum - 5 * ZI, note: null, method: null }];
  const dezEsc = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  let hW = '';
  try { hW = W._raxCodFacturi({ company: { id: 5, name: 'Firma X' }, facturi: docs, payments: plati }); } catch (e) { console.log('    (' + e.message + ')'); }
  T('pagina desenează fila Facturi cu documentele', hW.indexOf('<table') >= 0);
  const tbody = (hW.split('<tbody>')[1] || '').split('</tbody>')[0];
  const randuri = tbody.split('</tr>').filter((x) => x.indexOf('<tr>') >= 0);
  T('pagina desenează câte un rând pe document', randuri.length === docs.length, randuri.length + ' / ' + docs.length);
  // Culorile de pe web și perechea lor pe telefon, lizibilă pe ambele teme.
  const CULORI = { 'var(--accent)': 'var(--fl-ok)', 'var(--text-muted)': 'var(--text-muted)', 'var(--red)': 'var(--red)', 'var(--orange)': 'var(--fd-warn)' };
  docs.forEach((f, i) => {
    const r = randuri[i] || '';
    const td = r.split('</td>').map((x) => x.replace(/^[\s\S]*<td[^>]*>/, ''));
    const ceWeb = dezEsc(td[1] || ''), stWeb = dezEsc(td[4] || '');
    const culWeb = (/<span style="color:([^;]+);/.exec(td[4] || '') || [])[1];
    const bifaWeb = /fa-check/.test(r), titluWeb = (/title="([^"]+)" onclick="raxInvoiceMarkPaid/.exec(r) || [])[1] || '';
    const st = F.stareClient(f, Date.now());
    const ceTel = telOk ? Tel.ceEDocumentul(f) : '';
    const deschisTel = f.status !== 'paid' && f.status !== 'canceled';
    T(f.full_number + ': „Ce e" ca pe web', ceTel === ceWeb, J(ceTel) + ' / ' + J(ceWeb));
    T(f.full_number + ': starea ca pe web', st[0] === stWeb, st[0] + ' / ' + stWeb);
    T(f.full_number + ': culoarea stării e perechea celei de pe web, pe variabilele temei', CULORI[culWeb] === st[1], culWeb + ' → ' + st[1]);
    T(f.full_number + ': ✓ apare exact când apare pe web', deschisTel === bifaWeb);
    if (bifaWeb) T(f.full_number + ': titlul ✓ e scris la fel', titluWeb === (f.type === 'proforma' ? 'Încasată — emite factura fiscală' : 'Marchează plătită'), titluWeb);
    if (telOk) T(f.full_number + ': totalul se scrie ca pe web', Tel.bani2(f.total) === W._invMoney(f.total) + ' lei', Tel.bani2(f.total));
  });
  T('pe telefon, ✓ poartă titlurile de pe web', fisa.indexOf("title={pf ? 'Încasată — emite factura fiscală' : 'Marchează plătită'}") > 0);
  T('pe telefon, ✓ se arată doar pe documentele deschise (neplătite, neanulate)', /const deschis = f\.status !== 'paid' && f\.status !== 'canceled';/.test(fisa) && /\{deschis && \(\s*<button class="fm-btn acc"/.test(fisa));
  // Starea „Restantă" vine din scadență (serverul n-o scrie pe factură): pe o factură fără scadență, niciodată.
  T('„Restantă" doar cu scadența trecută', F.stareClient({ status: 'issued', due_date: acum - ZI }, acum)[0] === 'Restantă' &&
    F.stareClient({ status: 'issued', due_date: acum + ZI }, acum)[0] === 'De plată' && F.stareClient({ status: 'issued', due_date: null }, acum)[0] === 'De plată');
  T('o proformă plătită e „Încasată", o factură plătită „Plătită"', F.stareClient({ status: 'paid', type: 'proforma' }, acum)[0] === 'Încasată' && F.stareClient({ status: 'paid', type: 'invoice' }, acum)[0] === 'Plătită');
  T('fișa NU are a doua scriere a stării sau a lunii (le ia din lib/factura.ts)',
    /import \{[^}]*\bstareClient\b[^}]*\} from '\.\.\/lib\/factura'/.test(fisa) && /import \{[^}]*\blunaText\b[^}]*\} from '\.\.\/lib\/factura'/.test(fisa) &&
    !/function (stareDocument|lunaText|stareClient)\(/.test(fisa) && !/_GI_LUNI|LUNI\s*=\s*\[/.test(fisa));
  // Legătura proformă ↔ factură (doar pe telefon, din datele serverului; nu e o regulă a paginii).
  if (telOk) {
    T('proforma încasată arată factura născută din ea, factura arată proforma', Tel.legatura(docs[1], docs) === 'a devenit factura RAT-2026-0021' && Tel.legatura(docs[2], docs) === 'din proforma PF-2026-0002');
    T('fără perechea în listă, nicio legătură (nu inventăm un număr)', Tel.legatura({ type: 'proforma', factura_id: 999 }, docs) === '' && Tel.legatura(docs[3], docs) === '');
  }

  sect('2.2 ✓ „Marchează plătită" / „Încasată": aceeași întrebare, aceeași cerere, același răspuns ca pe web (raxInvoiceMarkPaid)');
  const markWeb = web.markPaid;
  const okW = /okLabel: proforma \? '([^']+)' : '([^']+)'/.exec(markWeb) || [];
  T('butonul întrebării e scris la fel (Încasată — emite factura / Marchează plătită)', F.OK_PROFORMA === okW[1] && F.OK_FACTURA === okW[2], okW.slice(1).join(' | '));
  T('întrebarea se pune ÎNAINTE de cerere (Confirma → platita), nu la atingere', /onClick=\{\(\) => setIntreb\(f\)\}/.test(fisa) && /onOk=\{\(\) => platita\(intreb\)\}/.test(fisa));
  T('aceeași cerere: PUT /api/invoices/:id/status {paid} (Api.invoiceSetStatus)', /Api\.invoiceSetStatus\(Number\(f\.id\), 'paid'\)/.test(fisa) &&
    /invoiceSetStatus: \(id: number, status: string\) => api<[^\n]*`\/api\/invoices\/\$\{id\}\/status`, \{ method: 'PUT', body: \{ status \} \}/.test(endpoints) &&
    /body: JSON\.stringify\(\{ status: 'paid' \}\)/.test(markWeb));
  T('mesajul de după, ca pe web: „Proformă încasată → factura N ✓" / „Factură plătită ✓"',
    markWeb.indexOf("'Proformă încasată → factura '") >= 0 && markWeb.indexOf("'Factură plătită ✓'") >= 0 &&
    fisa.indexOf("'Proformă încasată → factura ' + nr + ' ✓'") > 0 && fisa.indexOf("'Factură plătită ✓'") > 0);
  T('după ✓ fișa se reîncarcă (starea accesului și lista vin proaspete de la server — nu rămâne „Suspendat")', /onReload\(\);\n  \}/.test(functie(fisa, 'async function platita(f: any) {')));
  T('„înapoi" pe Android închide întrebarea, nu fișa, și nu în timpul cererii', /useInapoiInchide\(!!intreb, \(\) => \{ if \(busy\) return false; setIntreb\(null\); return true; \}\)/.test(fisa));
  T('fișa nu ocolește clientul API (fără fetch, fără adrese /api/ scrise de mână)', !/\bfetch\(/.test(fisa) && !/['"`]\/api\//.test(faraComentarii(fisa)));

  sect('2.3 „Vezi": hârtia comună cu Facturare, doar de citit');
  T('fișa nu-și mai desenează o a doua hârtie (DocFoaie a plecat)', !/function DocFoaie/.test(fisa) && !/<DocFoaie/.test(fisa));
  T('„Vezi" deschide DocumentFactura în privirea fișei, cu legătura proformă ↔ factură ca notă',
    fisa.indexOf('{vezi && <DocumentFactura inv={vezi} privire="fisa" nota={notaLegatura(vezi, docs)} onClose={() => setVezi(null)} />}') > 0 &&
    /import \{ DocumentFactura \} from '\.\.\/components\/DocumentFactura';/.test(fisa));
  if (telOk) {
    const notaSrc = functie(fisa, 'function notaLegatura(f: any, docs: any[]): string {');
    const N = {};
    try { vm.runInNewContext(tsJs(legSrc + '\n' + notaSrc + '\nOUT.n = notaLegatura;', 'notaLegatura.ts'), { OUT: N, Number, String }); } catch (e) { console.log('    (' + e.message + ')'); }
    T('nota legăturii, rulată: „Din proforma PF-2026-0002." / „A devenit factura RAT-2026-0021." / nimic fără pereche',
      !!N.n && N.n(docs[2], docs) === 'Din proforma PF-2026-0002.' && N.n(docs[1], docs) === 'A devenit factura RAT-2026-0021.' && N.n(docs[3], docs) === '');
  }

  sect('2.4 Suma pe rândul documentului nu se rupe');
  T('suma stă întreagă (nowrap), pe rândul ei; butoanele „Vezi" / ✓ dedesubt, în fm-btns',
    fisa.indexOf('<div class="s" style="margin-top:6px"><b style="font-size:15px;white-space:nowrap;color:var(--text-primary)">{bani2(f.total)}</b></div>\n                <div class="fm-btns" style="margin-top:8px">\n                  <button class="fm-btn" onClick={() => setVezi(f)}>') > 0);
  T('suma nu mai stă în `.a` lângă butoane (unde `.co-row .a b` are flex:1 și overflow-wrap:anywhere)', !/<div class="a" style="margin-top:8px;flex-wrap:wrap">/.test(fisa));

  sect('2.5 Butoanele de emis și încasările, ca pe web');
  T('pe web: „Factură unică / proformă" → unica, „Abonamentul unei luni" → abonament',
    hW.indexOf("raxOpenGenInvoice(5, 'unica')\"><i class=\"fas fa-file-invoice\"></i> Factură unică / proformă") > 0 && hW.indexOf("raxOpenGenInvoice(5, 'abonament')\"><i class=\"fas fa-calendar-check\"></i> Abonamentul unei luni") > 0);
  T('pe telefon, aceleași două butoane, pe adresa făcută de rutaFactura (lib/factura.ts)',
    /loc\.route\(rutaFactura\(c\.id, 'unica'\)\)\}><Icon name="report" size=\{15\} \/> Factură unică \/ proformă<\/button>/.test(fisa) &&
    /loc\.route\(rutaFactura\(c\.id, 'abonament'\)\)\}><Icon name="calendar" size=\{15\} \/> Abonamentul unei luni<\/button>/.test(fisa) &&
    /import \{[^}]*\brutaFactura\b[^}]*\} from '\.\.\/lib\/factura'/.test(fisa));
  T('compania demo n-are butoane de emis (Facturare n-o are în listă) și are textul ei', /\{!c\.is_demo && \(\s*<div class="fm-btns"/.test(fisa) && fisa.indexOf("'Compania demo nu se facturează.'") > 0);
  T('lista goală: „Niciun document emis", ca pe web', html.indexOf('<b>Niciun document emis</b>') > 0 && fisa.indexOf('<b>Niciun document emis</b>') > 0);
  T('textul vechi a plecat: „Nicio plată înregistrată" / „Plata se trece din Abonament & plăți"', fisa.indexOf('Nicio plată înregistrată') < 0 && !/Plata se trece din/.test(fisa) && fisa.indexOf('Perioadă:') < 0);
  // Pe web metoda apare ca cod („cash", „manual"); pe telefon, pe înțelesul omului, cu ACEEAȘI funcție ca în Facturare (1.3, 1.5).
  T('încasările: „încasare fără factură" ca pe web; metoda pe românește (metodaText)',
    hW.indexOf('încasare fără factură') > 0 && fisa.indexOf("(p.note || 'încasare fără factură') + ' · ' + metodaText(p.method)") > 0 && fisa.indexOf("p.method || 'manual'") < 0);
  T('fila citește documentele trimise de server în /overview (facturi, fără ciorne) și plățile',
    /const docs: any\[\] = o\.facturi \|\| \[\];/.test(fisa) && /const pl: any\[\] = o\.payments \|\| \[\];/.test(fisa) &&
    /res\.json\(\{ company, access: [^\n]*payments, facturi,/.test(server) && /filter\(function \(f\) \{ return f\.status !== 'draft'; \}\)/.test(server));
  T('întâi documentele, apoi încasările (ordinea de pe web)', fisa.indexOf('<h3>Documente</h3>') > 0 && fisa.indexOf('<h3>Documente</h3>') < fisa.indexOf('<h3>Încasări</h3>') &&
    hW.indexOf('<tbody>') < hW.indexOf('Încasări'));

  sect('2.6 „Abonament & plăți" → „Deschide fila Facturi" (web: raxCodTab(\'facturi\'))');
  T('pe web, cartea „Plăți" are butonul „Deschide fila Facturi"', /onclick="raxCodTab\(\\'facturi\\'\)"><i class="fas fa-file-invoice-dollar"><\/i> Deschide fila Facturi/.test(html));
  T('pe telefon, același buton, care cheamă fișa (onFacturi)', /<button class="fm-btn" onClick=\{onFacturi\}><Icon name="report" size=\{15\} \/> Deschide fila Facturi<\/button>/.test(abo) &&
    /onFacturi\?: \(\) => void/.test(abo));
  T('fișa îi dă butonului schimbarea filei (alegeFila(\'facturi\'), cu fila în adresă) și arată fila de sus',
    /<CompanyAbonament ov=\{o\} onReload=\{incarca\} onFacturi=\{deschideFacturi\} \/>/.test(fisa) &&
    /const deschideFacturi = \(\) => \{ alegeFila\('facturi'\); if \(cont\.current\) cont\.current\.scrollTop = 0; \};/.test(fisa) &&
    /<div class="content co-page" ref=\{cont\}>/.test(fisa));
  T('textul cărții „Plăți" trimite în fila Facturi (nu în „Facturare → factura")', /Plata se trece pe factură, din fila „Facturi"/.test(abo) && abo.indexOf('Facturare → factura') < 0);

  sect('2.7 Drumul clientului → „Emite prima factură" deschide factura UNICĂ (web: raxDrumFactura)');
  const webDrum = functie(html, 'window.raxDrumFactura = async function (companyId) {');
  T('pe web: raxOpenGenInvoice(companyId, \'unica\')', /raxOpenGenInvoice\(companyId, 'unica'\)/.test(webDrum));
  T('pe telefon: rutaPrimaFactura = rutaFactura(companyId, \'unica\'), din lib/factura.ts, fără a doua adresă scrisă de mână',
    /export const rutaPrimaFactura = \(companyId: any\) => rutaFactura\(companyId, 'unica'\);/.test(pasi) &&
    /import \{ rutaFactura \} from '\.\.\/lib\/factura';/.test(pasi) && !/['"`]\/billing/.test(faraComentarii(pasi)) && !/export const rutaFactura/.test(pasi));
  T('butonul drumului rămâne „Emite prima factură" și duce pe rutaPrimaFactura', /buton\('report', 'Emite prima factură', \(\) => loc\.route\(rutaPrimaFactura\(c\.company_id\)\)\)/.test(pasi));
  T('drumul se desenează tot din ce trimite serverul (ContractDrum neatins de reguli)', /drum\.pasi/.test(drum) && !/PASI_DRUM|drumulClientului/.test(faraComentarii(drum)));
  T('comentariul vechi „raxOpenGenInvoice(companyId)" (fără felul) a plecat din ContractPasi', pasi.indexOf('raxOpenGenInvoice(companyId))') < 0);

  sect('2.8 Culori și cuvinte');
  const filaF = taie(fisa, '// ─── Facturi (_raxCodFacturi)', '// ─── Contract: rezumatul dosarului');
  T('fila Facturi folosește doar variabilele temei pentru culori (fără culori scrise de mână)', !!filaF && !/#[0-9a-fA-F]{3,6}\b/.test(filaF.replace(/\/\/[^\n]*/g, '')));
  T('variabilele stărilor au pereche pe tema deschisă (--fl-ok, --fd-warn)', /:root\[data-theme="light"\] \{ --fl-ok: #0E7A3C;/.test(citeste('mobile/src/screens/flota.css')) &&
    /:root\[data-theme="light"\] \{ --fd-ok: #0E7A3C; --fd-warn: #b45309;/.test(citeste('mobile/src/screens/fondator.css')));
  T('fără jargon pe ecran (status/issued/paid/invoice/draft scrise în text)', !!filaF && !/>\s*(issued|paid|canceled|invoice|draft)\s*</i.test(filaF));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Client nou (screens/ClientNou.tsx), panoul de final
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function pachetClientNou() {
  sect('3. Client nou — panoul de final');
  const tel = citeste('mobile/src/screens/ClientNou.tsx');
  const pdf = citeste('contract_pdf.js');
  const css = citeste('mobile/src/screens/clientnou.css');

  // Bucata curată a telefonului, între sentinele, rulată.
  const blocTel = taie(tel, '// ── începe „panoul de final"', '// ── sfârșit „panoul de final" ──');
  T('bucata „panoul de final" se găsește între sentinele', blocTel.length > 200);
  let C = null;
  try {
    C = new Function(tsJs(blocTel, 'ClientNou-bloc.ts') + '\nreturn { CN_AUTO_FACTURA: CN_AUTO_FACTURA, cnMotivLink: cnMotivLink, cnDrum: cnDrum, cnMaiDeparte: cnMaiDeparte };')();
  } catch (e) { T('bucata telefonului rulează', false, e.message); }
  T('bucata e curată: nu cheamă ecranul, rețeaua sau alte module', !!blocTel && !/\bimport\b|\bApi\.|\bset[A-Z]\w*\(|\brequire\(|document\.|window\./.test(blocTel));

  sect('3.1 „Factura automată e pornită"');
  {
    const mWeb = /\(g\.autoFactura \? '<li>([^<']*)<\/li>' : ''\)/.exec(html);
    T('pagina are fraza (coNouGataHtml)', !!mWeb);
    T('telefonul scrie fraza paginii, cuvânt cu cuvânt', !!(C && mWeb) && C.CN_AUTO_FACTURA === mWeb[1], C && C.CN_AUTO_FACTURA);
    T('serverul trimite `auto_factura: true` doar când a pornit factura automată', /res\.json\(autoFactura \? Object\.assign\(\{\}, c, \{ auto_factura: true \}\) : c\)/.test(server));
    T('telefonul citește `auto_factura` din răspunsul contractului', /autoFactura = !!ct\.auto_factura/.test(tel));
    T('rândul apare DOAR când a venit (ca pe web)', /\{gata\.autoFactura && <li>\{CN_AUTO_FACTURA\}<\/li>\}/.test(tel));
    T('„autoFactura" pleacă în starea panoului', /autoFactura, drum: cnDrum\(ctRasp\)/.test(tel));
  }

  sect('3.2 Linkul de parolă, când emailul n-a plecat');
  {
    const mMotiv = /adminMotiv = (a\.inviteEmailConfigured \? '[^']*' : '[^']*');/.exec(html);
    T('pagina alege motivul după `inviteEmailConfigured` (coNouCreeaza)', !!mMotiv);
    if (mMotiv && C) {
      const webMotiv = new Function('a', 'return ' + mMotiv[1] + ';');
      const cazuri = [{ inviteEmailConfigured: true }, { inviteEmailConfigured: false }, {}, { inviteEmailConfigured: 1 }, { inviteEmailConfigured: '' }];
      const nep = cazuri.filter((a) => webMotiv(a) !== C.cnMotivLink(a)).map((a) => J(a) + ': web „' + webMotiv(a) + '" vs telefon „' + C.cnMotivLink(a) + '"');
      T('același motiv ca pagina, pe toate cazurile (cu / fără email pe server)', nep.length === 0, nep.join(' | '));
      T('fără răspuns deloc, telefonul nu crapă', typeof C.cnMotivLink(null) === 'string');
    }
    T('serverul trimite `inviteEmailConfigured` și `link` la adăugarea administratorului',
      /inviteEmailConfigured: !!\(channels\.emailConfigured && channels\.emailConfigured\(\)\)/.test(server) && /link: rez\.link \|\| undefined/.test(server));
    T('motivul fix de dinainte („Emailul de invitație NU a plecat") a ieșit', !/Emailul de invitație NU a plecat/.test(tel));
    T('telefonul ia motivul din regulă: adminMotiv = cnMotivLink(a)', /adminMotiv = cnMotivLink\(a\)/.test(tel));
    // Contul există și când emailul n-a plecat: panoul nu are voie să scrie „Fără administrator încă" atunci.
    T('contul se ține minte oricum a plecat invitația (adminCont = email, înainte de a citi `invited`)',
      /const a: any = await Api\.addCompanyAdmin\(id, \{ username: email \}\);\s*adminCont = email;\s*if \(a && a\.invited\) adminInvitat = true;\s*else if \(a && a\.link\) \{ adminLink = String\(a\.link\); adminMotiv = cnMotivLink\(a\); \}/.test(tel));
    T('„Fără administrator încă" doar când nu există cont', /\{!gata\.admin\s*\? 'Fără administrator încă\.'/.test(tel));
    T('ACEEAȘI foaie ca peste tot (LinkParolaSheet + pregatesteLinkul), nu una nouă',
      /import \{ LinkParolaSheet, pregatesteLinkul, type LinkParola \} from '\.\.\/components\/LinkParolaSheet'/.test(tel) &&
      /<LinkParolaSheet data=\{link\} onClose=\{\(\) => setLink\(null\)\} \/>/.test(tel) && !/class="sheet(-ov)?"/.test(tel));
    T('foaia primește emailul, linkul și motivul (ca _usrAratLinkul(g.admin, g.adminLink, g.adminMotiv))',
      /pregatesteLinkul\(\{ email: g\.admin \|\| undefined, link: g\.adminLink, motiv: g\.adminMotiv \|\| undefined \}\)/.test(tel) &&
      /window\._usrAratLinkul\(g\.admin, g\.adminLink, g\.adminMotiv\)/.test(html));
    T('se deschide o dată singură, după creare (ca pe web: if (adminLink) coNouArataLinkul())',
      /if \(g\.adminLink\) arataLinkul\(g\);/.test(tel) && /if \(adminLink\) window\.coNouArataLinkul\(\);/.test(html));
    T('butonul „Arată linkul de parolă" o redeschide oricând, doar când există link',
      /\{gata\.adminLink && \(\s*<button[^>]*onClick=\{\(\) => arataLinkul\(gata\)\}>[\s\S]{0,80}Arată linkul de parolă<\/button>/.test(tel) &&
      /Arată linkul de parolă/.test(taie(html, 'function coNouGataHtml()', 'window.coNouStart')));
    T('linkul clientului de dinainte nu mai apare după „Deschid alt client"',
      /if \(gataAcum\.current === g\.id\) setLink\(l\);/.test(tel) && /gataAcum\.current = null;\s*setGata\(null\); setLink\(null\);/.test(tel));
    // Nota de jos trimite unde chiar există butonul: Utilizatori → omul → „Trimite link de parolă".
    const users = citeste('mobile/src/screens/AdminUsers.tsx');
    T('nota trimite la „Trimite link de parolă" din Utilizatori, care chiar există pe telefon',
      /Utilizatori: alegi firma, deschizi omul și apeși „Trimite link de parolă”/.test(tel) && /Trimite link de parolă<\/span>/.test(users) && /Api\.linkParola\(u\.id\)/.test(users));
    T('nota veche (linkul „oricând în fișa firmei → Utilizatori", unde nu e) a ieșit', !/îl găsești oricând în fișa firmei/.test(tel));
  }

  sect('3.3 Felul contractului: telefonul = hârtia contractului, pe contracte făcute de funcțiile serverului');
  {
    // Criteriul hârtiei, decupat rând cu rând din contract_pdf.js (scrieContract) și rulat.
    const rand = (re) => { const m = re.exec(pdf); return m ? m[0] : null; };
    const rPdf = [
      rand(/const anexa = contract\.annex \|\| \{[^\n]*\};/),
      rand(/const mont = contract\.montaj;/),
      rand(/const echip = mont && mont\.echipamente;/),
      rand(/const areEchip = [^\n]*;/),
      rand(/const areMontaj = !!\(mont && [^\n]*;/),
      rand(/const chirieA = anexa\.chirie [^\n]*;/),
    ];
    T('găsesc criteriul hârtiei (areEchip / areMontaj / chirieA)', rPdf.every(Boolean), J(rPdf));
    const hartie = rPdf.every(Boolean)
      ? new Function('contract', rPdf.join('\n') + '\nreturn { areEchip: areEchip, areMontaj: areMontaj, chirie: !!chirieA };')
      : null;
    // Funcțiile serverului care fac Anexa nr. 2 și chiria din ofertă (POST /api/companies/:id/contract).
    const fnSrv = (nume) => { const i = server.indexOf('function ' + nume + '(oferta) {'); if (i < 0) return ''; const j = server.indexOf('\n}\n', i); return j < 0 ? '' : server.slice(i, j + 2); };
    const sMont = fnSrv('_montajDinOferta'), sCh = fnSrv('_chirieDinOferta');
    T('găsesc _montajDinOferta și _chirieDinOferta în server', !!sMont && !!sCh);
    let S = null;
    try { S = new Function('montaj', 'process', sMont + '\n' + sCh + '\nreturn { m: _montajDinOferta, ch: _chirieDinOferta };')(require('./montaj'), { env: {} }); }
    catch (e) { T('funcțiile serverului rulează', false, e.message); }
    const Cc = require('./contracts');
    // Contractul, cum îl face ruta din ofertă (anexa nr. 1 cu chiria, anexa nr. 2 cu montajul), trecut prin JSON ca din bază.
    const contractDin = (of) => {
      const ch = S.ch(of);
      const c = { montaj: S.m(of), annex: Cc.facAnexa([], { monthlyTotal: 500, currency: 'RON', chirie: ch ? { aparate: ch.aparate, tarifDemontare: ch.tarifDemontare } : null }) };
      return JSON.parse(JSON.stringify(c));
    };
    const pret = { mGps: 100, mLvCan: 60, mFms: 80, mUninstall: 50, dFmc130: 45, dFmc650: 120, dLvCan: 40, chFmc130: 12, chFmc650: 25, chLvCan: 8 };
    const of = (cfg, prices) => ({ config: { cfg: Object.assign({ fxRate: 5 }, cfg), prices: prices || pret } });
    const cazuri = [
      ['vândute, cu montaj', of({ echipMod: 'cumpara', montaj: { qGps: 10, qLvCan: 3 }, devices: { d130: 7, d650: 3, lvcan: 3 } }), 'cumparate', true],
      ['vândute, fără rânduri de montaj', of({ echipMod: 'cumpara', montaj: {}, devices: { d130: 5 } }), 'cumparate', true],
      ['închiriate, cu montaj', of({ echipMod: 'inchiriaza', montaj: { qGps: 10 }, devices: { d130: 10 } }), 'inchiriate', true],
      ['închiriate, fără montaj', of({ echipMod: 'inchiriaza', montaj: {}, devices: { d650: 2 } }), 'inchiriate', false],
      ['închiriere fără chirie trecută (aparatele nu intră nicăieri)', of({ echipMod: 'inchiriaza', montaj: { qGps: 4 }, devices: { d150: 4 } }), 'fara-aparate', true],
      ['doar montaj (aparatele sunt ale clientului)', of({ echipMod: 'cumpara', montaj: { qGps: 6 }, devices: {} }), 'fara-aparate', true],
      ['nimic unic (doar abonament)', of({ echipMod: 'cumpara', montaj: {}, devices: {} }), 'fara-aparate', false],
    ];
    if (S && hartie && C) {
      const nep = [], asteptat = [];
      for (const [n, o, fel, montaj] of cazuri) {
        const c = contractDin(o), h = hartie(c), d = C.cnDrum(c);
        const felHartie = h.areEchip ? 'cumparate' : (h.chirie ? 'inchiriate' : 'fara-aparate');
        if (d.fel !== felHartie || d.montaj !== h.areMontaj) nep.push(n + ': telefon ' + J(d) + ' vs hârtie ' + J(h));
        if (d.fel !== fel || d.montaj !== montaj) asteptat.push(n + ': ' + J(d) + ', așteptat ' + fel + '/' + montaj);
      }
      // Contract făcut fără ofertă: fără anexa nr. 2 și fără chirie.
      const gol = { montaj: null, annex: null }, hg = hartie(gol), dg = C.cnDrum(gol);
      if (dg.fel !== 'fara-aparate' || dg.montaj !== hg.areMontaj || hg.areEchip || hg.chirie) nep.push('fără ofertă: ' + J(dg) + ' vs ' + J(hg));
      // Amestec (serverul nu-l face din ofertă, dar o anexă se poate scrie de mână): aparatele VÂNDUTE cer proforma,
      // deci bat chiria — hârtia tipărește clauza de avans oricum.
      const mixt = { montaj: { items: [], echipamente: { items: [{ tip: 'fmc130', buc: 2, pretEur: 45 }] } }, annex: { chirie: { aparate: [{ nume: 'FMC650', cant: 1, chirie: 25 }] } } };
      const hm = hartie(mixt), dm = C.cnDrum(mixt);
      if (!(hm.areEchip && hm.chirie) || dm.fel !== 'cumparate' || dm.montaj !== hm.areMontaj) nep.push('amestec: ' + J(dm) + ' vs ' + J(hm));
      T('pe toate cele ' + (cazuri.length + 2) + ' contracte, telefonul vede același fel de aparate și același montaj ca hârtia', nep.length === 0, nep.join(' | '));
      T('și felul e cel așteptat pe fiecare ofertă', asteptat.length === 0, asteptat.join(' | '));
      T('fără contract (nu s-a salvat / n-a fost cerut) → „fără contract"', C.cnDrum(null).fel === 'fara-contract');
    }
    T('„Mai departe" se scrie din contractul ÎNTORS de server, nu presupus din ofertă', /ctRasp = ct;/.test(tel) && /drum: cnDrum\(ctRasp\)/.test(tel));
  }

  sect('3.4 „Mai departe": drumul de azi, pe felul contractului');
  if (C) {
    const pasi = (fel, montaj) => C.cnMaiDeparte({ fel, montaj });
    const tot = (fel, montaj) => pasi(fel, montaj).join(' ');
    const feluri = [['cumparate', true], ['inchiriate', true], ['inchiriate', false], ['fara-aparate', true], ['fara-aparate', false], ['fara-contract', false]];
    T('drumul VECHI (adopția înainte de semnare) a ieșit din ecran', !/adoptă aparatele clientului/.test(tel) && !/treci-le în anexa contractului/.test(tel));
    T('proforma și avansul DOAR la aparatele vândute (web-ul le scria și la închiriere / fără aparate — greșeala din revizie)',
      /proforma pentru aparate/.test(tot('cumparate', true)) && /în avans/.test(tot('cumparate', true)) &&
      feluri.filter(([f]) => f !== 'cumparate').every(([f, m]) => !/proforma pentru|plătește în avans|„Încasată”/.test(tot(f, m))));
    T('la închiriere spune pe față: fără proformă și fără avans; chiria pe factura lunară',
      /fără proformă și fără avans/.test(tot('inchiriate', true)) && /Chiria vine pe factura lunară/.test(tot('inchiriate', false)) && !/Chiria/.test(tot('cumparate', true)));
    T('ordinea la vândute: semnat → proforma → montajul după încasare → aparatele pe firmă → factura montajului',
      (() => { const s = tot('cumparate', true); const i = ['trimite-l la semnat', 'proforma pentru aparate', 'avansul e încasat: montajul', 'Aparatele le treci pe firmă', 'factura montajului'].map((x) => s.indexOf(x)); return i.every((v, k) => v >= 0 && (k === 0 || v > i[k - 1])); })(),
      tot('cumparate', true));
    T('la vândute, factura montajului NU mai ia aparatele (sunt pe factura avansului)', /Aparatele nu mai intră pe ea/.test(tot('cumparate', true)) && !/Aparatele nu mai intră pe ea/.test(tot('fara-aparate', true)));
    T('factura montajului doar când contractul are montaj', feluri.every(([f, m]) => /factura montajului/.test(tot(f, m)) === !!m));
    T('„aparatele le treci pe firmă abia după ce sunt montate" — mereu, cu vorbele paginii',
      feluri.every(([f, m]) => pasi(f, m).indexOf('Aparatele le treci pe firmă abia după ce sunt montate.') >= 0) &&
      /aparatele le treci pe firmă abia după ce sunt montate/.test(html));
    T('abonamentul pornește la prima transmisie — mereu, ultimul pas', feluri.every(([f, m]) => /transmite prima dată\.$/.test(pasi(f, m)[pasi(f, m).length - 1])));
    T('fără contract: primul pas e „Fă un contract", butonul pe care dosarul de pe telefon chiar îl are',
      /„Fă un contract”/.test(pasi('fara-contract', false)[0]) && !/aprobă contractul și/.test(tot('fara-contract', false)) &&
      /Fă un contract \(/.test(citeste('mobile/src/screens/ContractDetail.tsx')));
    // Hârtia documentului e deschisă din Facturare (1.6); aici doar că butonul pomenit în pași chiar există.
    T('butonul „Încasată" de pe proformă, pomenit în pași, chiar există pe telefon (hârtia documentului)', /\? 'Încasată' : 'Plătită'/.test(docFactura));
    T('nicio cifră scrisă în pași (termenele stau în contracts.js și pe hârtie)', feluri.every(([f, m]) => !/\d/.test(tot(f, m))));
    T('fără jargon și fără „plan"', feluri.every(([f, m]) => !/\b(plan|IMEI|anexa nr|status|draft|workflow)\b/i.test(tot(f, m))));
    // Ce spune ecranul are acoperire pe hârtia semnată (dacă hârtia se schimbă, proba o prinde).
    T('hârtia: aparatele vândute se plătesc în avans, pe proformă', /se plătesc integral în avans, pe baza facturii proforme/.test(pdf));
    T('hârtia: montajul se facturează după executare, pe vehiculele montate efectiv', /Montajul se facturează după executare, pentru vehiculele montate efectiv\./.test(pdf));
    T('hârtia: livrarea și montajul curg de la încasarea avansului', /de la încasarea avansului/.test(pdf));
    T('hârtia: abonamentul pornește la prima transmisie', /Abonamentul fiecărui vehicul începe din ziua în care echipamentul montat pe acesta transmite prima dată/.test(pdf));
    T('hârtia: la închiriere chiria apare pe factură pe rând separat', /apare pe factură pe rând separat/.test(pdf));
    T('pașii se desenează ca listă numerotată', /<ol>\{cnMaiDeparte\(gata\.drum\)\.map\(\(t\) => <li>\{t\}<\/li>\)\}<\/ol>/.test(tel));
    T('„Deschide dosarul" duce în dosarul firmei (acolo e și „Fă un contract")', /onClick=\{\(\) => loc\.route\(rutaDosar\(gata\.id\)\)\}><Icon name="fileSignature" size=\{16\} color="#06210F" \/> Deschide dosarul<\/button>/.test(tel));
  }

  sect('3.5 Limba, culorile, fișierele');
  {
    T('„de" după cifră prin nrDe (lib/numar.ts), nu „N lei" scris de mână', /nrDe\(Math\.round\(gata\.offerTotal\), 'leu', 'lei'\)/.test(tel) && !/offerTotal\) \+ ' lei/.test(tel));
    const n = numar.nrDe;
    T('„290 de lei", „15 lei", „101 lei", „120 de lei"', !!n && n(290, 'leu', 'lei') === '290 de lei' && n(15, 'leu', 'lei') === '15 lei' && n(101, 'leu', 'lei') === '101 lei' && n(120, 'leu', 'lei') === '120 de lei');
    T('clientnou.css: culorile doar din temă (var(--…)), fără culori scrise de mână', !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css) && /var\(--text-primary\)/.test(css) && /var\(--text-secondary\)/.test(css));
    T('clientnou.css: fără font propriu (se moștenește Nunito)', !/font-family/.test(css));
    T('clasele noi (cn-link, cn-mai, cn-mai-t) sunt în clientnou.css și folosite în ecran',
      ['cn-link', 'cn-mai', 'cn-mai-t'].every((k) => new RegExp('\\.' + k + '\\b').test(css) && new RegExp('class="[^"]*\\b' + k + '\\b').test(tel)));
    // Stilul e doar al acestui ecran: niciun alt ecran nu-l importă.
    const importuri = surseTs.filter((x) => /clientnou\.css/.test(x.src)).map((x) => x.rel);
    T('clientnou.css e importat DOAR de ClientNou.tsx', J(importuri) === J(['mobile/src/screens/ClientNou.tsx']), J(importuri));
    T('butonul verde are textul închis de pe fundal verde (color="#06210F"), iar butonul linkului e contur (fm-btn acc)',
      /class="btn btn-primary"[^>]*>[^<]*<Icon name="fileSignature" size=\{16\} color="#06210F"/.test(tel) && /class="fm-btn acc cn-link"/.test(tel));
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Dispozitive → Neasignate (screens/AdminDevices.tsx + aparate.css)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// În „Neasignate", bife + bara „Trece pe firmă" (PUT /api/devices/company-bulk), FĂRĂ cele două greșeli ale barei
// web din revizie (firma aleasă se golea la fiecare bifă, iar „Toate" bifa și aparatele ascunse de căutare — și le
// trimitea); pe rândul unui aparat de pe firmă, ziua din care plătește clientul, cu corectura ✎
// (PUT /api/devices/:imei/abonament; golită = pornește la următoarea transmisie).
async function pachetNeasignate() {
  sect('4. Dispozitive → Neasignate — trecerea în bloc și ziua din care plătește clientul');
  const tel = citeste('mobile/src/screens/AdminDevices.tsx');
  const css = citeste('mobile/src/screens/aparate.css');

  // Bucata telefonului: fără JSX, fără stare — cuvintele și cererile ecranului.
  const blocTel = taie(tel, '// ── începe „trecerea în bloc și ziua abonamentului', '// ── sfârșit „trecerea în bloc și ziua abonamentului');
  function telefon(api) {
    const ctx = vm.createContext({ api, nrDe: numar.nrDe, console });
    vm.runInContext(tsJs(blocTel, 'AdminDevices-bloc.ts'), ctx, { filename: 'AdminDevices.tsx#bloc' });
    return ctx;
  }
  function apiInreg(raspuns) {
    const cereri = [];
    const api = async (p, o) => { cereri.push({ p, o: JSON.parse(JSON.stringify(o || {})) }); return typeof raspuns === 'function' ? raspuns(p, o) : raspuns; };
    return { api, cereri };
  }

  // Bucățile paginii, rulate cu vecinii lor de carton.
  const bucketSrc = functie(html, 'function _raxDevBucket(d) {');
  // (01.10) Pagina trimite acum, ca telefonul, DOAR bifele vizibile: „ce se vede" e o regulă a ei (fila + căutarea).
  const vizibilSrc = functie(html, 'function _raxDevVizibil(d) {') + '\n' + functie(html, 'function _raxDevNeasVizibile() {');
  const treceSrc = taie(html, 'window.raxDevTreceBloc = async function () {', '// Corectura zilei de pornire a abonamentului');
  const aboSrc = taie(html, 'window.raxDevAbonament = async function (imei) {', 'window.raxDevSetCompany');
  const randAboSrc = taie(html, "var abo = (b === 'active' && d.company_id != null)", '\n        var co = ');
  T('găsesc bucata telefonului (între sentinele) și bucățile paginii (_raxDevBucket, „ce se vede", raxDevTreceBloc, raxDevAbonament, rândul)',
    !!(blocTel && bucketSrc && vizibilSrc.length > 200 && treceSrc && aboSrc && randAboSrc));
  async function webTrece(o) {
    const rec = { confirm: [], toast: [], fetch: [], incarcat: 0 };
    const ctx = {
      _raxDevices: o.devices, _raxDevSel: o.sel, companiesCache: o.companies, console,
      // Vecinii de carton ai lui „ce se vede": fila Neasignate, căutarea (goală dacă nu se dă), semnalul.
      _raxDevFilter: 'unassigned', _raxDevSearch: o.cauta || '', _raxDevSemnal: () => ({ k: '' }),
      raCauta: (q, ...v) => v.some((x) => String(x == null ? '' : x).toLowerCase().indexOf(q) >= 0),
      document: { getElementById: (id) => (id === 'rax-dev-bulk-co' ? { value: String(o.cid) } : null) },
      raConfirm: async (m, op) => { rec.confirm.push({ m, op }); return o.confirm; },
      raxToast: (m, k) => { rec.toast.push({ m, k }); },
      fetch: async (url, op) => { rec.fetch.push({ url, op }); return { ok: true, status: 200, json: async () => o.resp }; },
      raxLoadDevices: () => { rec.incarcat++; },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext([web.rDe, web.raxDe, bucketSrc, vizibilSrc, treceSrc].join('\n'), ctx, { filename: 'index.html#raxDevTreceBloc' });
    await ctx.raxDevTreceBloc();
    return rec;
  }
  async function webAbo(o) {
    const rec = { confirm: [], act: [], incarcat: 0 };
    const ctx = {
      _raxDevices: o.devices, console,
      raConfirm: async (m, op) => { rec.confirm.push({ m, op }); return o.raspuns; },
      _raxDevAction: async (url, op, msg) => { rec.act.push({ url, op, msg }); return true; },
      raxLoadDevices: () => { rec.incarcat++; },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(aboSrc, ctx, { filename: 'index.html#raxDevAbonament' });
    await ctx.raxDevAbonament(o.imei);
    return rec;
  }
  function webRandAbo(d) {
    const ctx = vm.createContext({ d, esc: (x) => String(x) });
    vm.runInContext(bucketSrc + '\nvar b = _raxDevBucket(d);\n' + randAboSrc + '\n;__r = abo;', ctx, { filename: 'index.html#randHtml' });
    return String(ctx.__r).replace(/<[^>]+>/g, '');
  }

  sect('4.1 Pe telefon: unde stau lucrurile');
  T('ecranul își ia CSS-ul lui (aparate.css)', /import '\.\/aparate\.css';/.test(tel));
  T('bara „Trece pe firmă" stă DOAR în grupul „Neasignate" (adopția într-un singur loc)',
    /\{g\.k === '_neas' && baraBloc\(vazute\)\}/.test(tel) && (tel.match(/baraBloc\(/g) || []).length === 2);
  T('bifele: doar pe rândurile din „Neasignate", alături de rând (nu buton în buton)',
    /g\.k === '_neas' \? randCuBifa\(d\)/.test(tel) && (tel.match(/randCuBifa\(/g) || []).length === 2 && /<label class="ap-bifa">/.test(tel));
  T('ziua abonamentului: doar pe aparatele active de pe o firmă (ca pe web)',
    /galeata\(d\) === 'active' \? randPeFirma\(d\)/.test(tel) && (tel.match(/randPeFirma\(/g) || []).length === 2 && /d\.company_id == null \? 'unassigned' : 'active'/.test(tel));
  T('„Toate" bifează doar rândurile desenate pe ecran (după căutare, pastilă și „și încă N")',
    /const vazute = g\.dev\.slice\(0, lim\);/.test(tel) && /const vii = vazute\.filter\(neasignatViu\);/.test(tel) && /bifeazaVazute\(b, vii, on\)/.test(tel) && /Toate \(\{vii\.length\}\)/.test(tel));
  T('pleacă doar ce se vede bifat', /const alese = bifateVazute\(bife, vii\);/.test(tel) && /cereTrecerea\(alese\)/.test(tel) && /setIntreb\(\{ imeis: alese, coId, firma: co\.label \}\)/.test(tel) && /treceInBloc\(coId, imeis\)/.test(tel));
  T('bifele ascunse se spun pe ecran, nu se trimit', /const ascunse = bifateAscunse\(bife, toate, vii\);/.test(tel) && /\{ascunse > 0 && \(/.test(tel));
  T('firma aleasă nu se golește la o bifă (o singură scriere: lista de firme din bară)', (tel.match(/setFirmaBloc\(/g) || []).length === 1 && /onChange=\{\(e: any\) => setFirmaBloc\(e\.target\.value\)\}/.test(tel));
  T('firma demo nu apare în listă (ca pe web)', /\.filter\(\(c: any\) => !c\.is_demo\)/.test(tel));
  T('fără firmă aleasă (sau ștearsă între timp) nu pleacă nimic: „Alege firma."', /if \(!Number\.isFinite\(coId\) \|\| !co\) \{ showToast\('Alege firma\.', true\); return; \}/.test(tel));
  T('întrebarea de confirmare vine ÎNAINTE de trimitere', /<Confirma title="Trece pe firmă" text=\{intrebareBloc\(intreb\.imeis\.length, intreb\.firma\)\}/.test(tel) && /onOk=\{executaTrecerea\}/.test(tel));
  T('ce a sărit serverul stă pe ecran, cu motivul, până îl închizi', /setRezBloc\(\{ text, sarite: sar\.map\(\(i\) => \(\{ imei: i, motiv: motivSarit\(i, proaspat\) \}\)\) \}\)/.test(tel) && /onClick=\{\(\) => setRezBloc\(null\)\}/.test(tel));
  T('fiecare rută nouă apare o singură dată în ecran, prin clientul HTTP comun (api)',
    (tel.match(/'\/api\/devices\/company-bulk'/g) || []).length === 1 && (tel.match(/'\/abonament'/g) || []).length === 1 && /import \{ api \} from '\.\.\/api\/client';/.test(tel),
    J([(tel.match(/'\/api\/devices\/company-bulk'/g) || []).length, (tel.match(/'\/abonament'/g) || []).length]));
  T('mutarea veche în lot (Mută între companii) nu e atinsă de ecranul ăsta', !/moveDevicesBulk|company\/bulk/.test(tel));
  T('banda de sus spune cum se adoptă acum (bifele + „Trece pe firmă"), cu acordul cifrei',
    /'\} mai jos, în grupul Neasignate, alege firma și apasă „Trece pe firmă"/.test(tel) && !/alege-i firma din fișa aparatului/.test(tel) && /nrDe\(counts\.unassigned, 'aparat neasignat s-a conectat', 'aparate neasignate s-au conectat'\)/.test(tel));
  // La UN aparat, și a doua jumătate a frazei e la singular („Ca să-l adopți: bifează-l").
  T('banda: la un singur aparat, „Ca să-l adopți: bifează-l"; la mai multe, „Ca să le adopți: bifează-le"',
    tel.indexOf("{counts.unassigned === 1 ? 'Ca să-l adopți: bifează-l' : 'Ca să le adopți: bifează-le'} mai jos, în grupul Neasignate") > 0 &&
    tel.indexOf("s-au conectat')}. Ca să le adopți") < 0);
  T('fereastra zilei: câmp de dată cu maximul azi, salvare oprită pe o zi din viitor, golul trimis ca null',
    /type="date" value=\{abo\.v\} max=\{ziInput\(Date\.now\(\)\)\}/.test(tel) && /disabled=\{savingAbo \|\| inViitor\(abo\.v\)\}/.test(tel) && /puneAbonament\(abo\.d\.imei, v \|\| null\)/.test(tel));

  sect('4.2 aparate.css: clase noi, culorile temei, contrastul măsurat pe amândouă temele');
  const cssFara = faraComentariiCss(css);
  T('culori doar din temă (fără coduri scrise de mână)', !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(cssFara));
  T('fontul rămâne cel moștenit (Nunito): fără alt font, fără monospace', !/monospace/.test(cssFara) && (cssFara.match(/font-family:\s*[^;]+;/g) || []).every((x) => /inherit/.test(x)));
  const selectori = cssFara.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  T('fiecare regulă e pe o clasă nouă „ap-…" (nu rescrie clasele comune)', selectori.length > 0 && selectori.every((s) => s.split(',').every((x) => /\.ap-/.test(x))), selectori.filter((s) => !s.split(',').every((x) => /\.ap-/.test(x))).join(' | '));

  const tok = citeste('mobile/src/theme/tokens.css'), fnd = citeste('mobile/src/screens/fondator.css');
  const blocVar = (src, sel) => { const i = src.indexOf(sel + ' {'); if (i < 0) throw new Error('nu găsesc ' + sel); const o = {}; src.slice(i, src.indexOf('}', i)).replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); }); return o; };
  const teme = {
    intunecata: Object.assign({}, blocVar(tok, ':root, :root[data-theme="dark"]'), blocVar(fnd, ':root')),
    deschisa: Object.assign({}, blocVar(tok, ':root, :root[data-theme="dark"]'), blocVar(tok, ':root[data-theme="light"]'), blocVar(fnd, ':root'), blocVar(fnd, ':root[data-theme="light"]')),
  };
  const rgb = (t, v) => {
    v = String(v).trim(); let m = /^var\((--[\w-]+)\)$/.exec(v); if (m) return rgb(t, t[m[1]]);
    m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16));
    m = /^#([0-9a-f]{3})$/i.exec(v); if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
    throw new Error('culoare necunoscută: ' + v);
  };
  // Culoarea textului unei reguli, citită din aparate.css (nu scrisă în probă).
  const culoareRegula = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*?(?:^|[;{\\s])color:\\s*(var\\(--[\\w-]+\\))').exec(cssFara); return m ? m[1] : null; };
  const fundalBara = /\.ap-bloc \{[^}]*background:\s*color-mix\(in srgb, (var\(--[\w-]+\)) (\d+)%, transparent\)/.exec(cssFara);
  T('bara are un fundal ușor colorat din temă (îl citesc de acolo pentru măsurare)', !!fundalBara);
  const perechi = [
    ['.ap-toate', 'bara'], ['.ap-cate', 'bara'], ['.ap-bloc-nota', 'bara'],
    ['.ap-abo', 'panou'], ['.ap-abo.nepornit', 'panou'], ['.ap-text', 'panou'], ['.ap-eroare', 'panou'], ['.ap-sel', 'camp'],
    ['.ap-rez-s', 'banda-warn'], ['.ap-rez-s', 'banda-ok'],
  ];
  const slabe = [];
  for (const numeT of Object.keys(teme)) {
    const t = teme[numeT];
    const panou = rgb(t, 'var(--bg-panel)'), pagina = rgb(t, 'var(--bg-darkest)');
    const fundaluri = {
      bara: fundalBara ? amesteca(rgb(t, fundalBara[1]), Number(fundalBara[2]) / 100, panou) : panou,
      panou, camp: rgb(t, 'var(--bg-dark)'),
      'banda-warn': amesteca(rgb(t, 'var(--orange)'), 0.10, pagina),   // .fd-band.warn (fondator.css), peste pagină
      'banda-ok': amesteca(rgb(t, 'var(--accent)'), 0.09, pagina),     // .fd-band.ok
    };
    for (const [sel, unde] of perechi) {
      const c = culoareRegula(sel);
      if (!c) { slabe.push(sel + ': fără culoare în CSS'); continue; }
      const r = contrast(rgb(t, c), fundaluri[unde]);
      if (r < 4.5) slabe.push(numeT + ' ' + sel + ' ' + c + ' pe ' + unde + ' = ' + r.toFixed(2));
    }
  }
  T('fiecare text nou trece de 4,5:1 pe AMÂNDOUĂ temele (măsurat din CSS + temă)', slabe.length === 0, slabe.join(' | '));

  sect('4.3 Bifele telefonului (bucata decupată, rulată): „Toate" = ce se vede, pleacă doar ce se vede');
  const P = telefon(apiInreg({}).api);
  const A = { imei: '860000000000001', company_id: null, status: 'active' };
  const Bd = { imei: '860000000000002', company_id: null };            // venit din lista „neasignate" (fără stare)
  const C = { imei: '860000000000003', company_id: null, status: 'active' };
  const D = { imei: '860000000000004', company_id: null, status: 'archived' };
  const E = { imei: '860000000000005', company_id: 7, status: 'active' };
  const toate = [A, Bd, C, D, E];
  const chei = (o) => J(Object.keys(o).sort());
  T('„Toate" bifează doar ce se vede (căutarea a ascuns un aparat)', chei(P.bifeazaVazute({}, [A, Bd], true)) === J([A.imei, Bd.imei].sort()));
  T('debifarea „Toate" scoate doar ce se vede; bifa ascunsă rămâne (și se spune)', chei(P.bifeazaVazute({ [A.imei]: true, [Bd.imei]: true, [C.imei]: true }, [A, Bd], false)) === J([C.imei]));
  T('pleacă doar bifele vizibile, nu și cea ascunsă de căutare', J(P.bifateVazute({ [A.imei]: true, [C.imei]: true }, [A, Bd])) === J([A.imei]));
  T('bifele ascunse se numără, ca ecranul să le spună', P.bifateAscunse({ [A.imei]: true, [C.imei]: true }, toate, [A, Bd]) === 1);
  T('un aparat arhivat sau deja pe firmă nu se bifează și nu pleacă', Object.keys(P.bifeazaVazute({}, [D, E], true)).length === 0 && P.bifateVazute({ [D.imei]: true, [E.imei]: true }, [D, E]).length === 0);

  sect('4.4 Telefonul lângă pagina web (bucățile paginii rulate, pe aceleași cazuri): aceleași cuvinte, aceleași cereri');
  const firme = [{ id: 42, name: 'Transport SRL' }];
  const aparate = (n) => Array.from({ length: n }, (_, i) => ({ imei: String(861000000000000 + i), company_id: null, status: 'active' }));
  const toateBifate = (l) => { const s = {}; l.forEach((d) => { s[d.imei] = true; }); return s; };

  let aceleasi = true, dif = '';
  for (const n of [1, 2, 3, 19, 20, 21, 99, 100, 101, 119, 120, 1000]) {
    const l = aparate(n);
    const w = await webTrece({ devices: l, sel: toateBifate(l), cid: 42, companies: firme, confirm: false, resp: {} });
    const t = P.intrebareBloc(n, 'Transport SRL');
    if (!w.confirm[0] || w.confirm[0].m !== t) { aceleasi = false; dif = n + ': web «' + (w.confirm[0] && w.confirm[0].m) + '» / tel «' + t + '»'; }
  }
  T('„Treci N aparate pe firma X?" — aceleași cuvinte ca pe web, pe 12 numere (1, 20, 101, 1000…)', aceleasi, dif);

  {
    const l = aparate(3);
    const w = await webTrece({ devices: l, sel: toateBifate(l), cid: 42, companies: firme, confirm: true, resp: { ok: true, trecute: 3, sarite: [] } });
    const x = apiInreg({ ok: true, trecute: 3, sarite: [] });
    const r = await telefon(x.api).treceInBloc(42, l.map((d) => d.imei));
    const cw = w.fetch[0], ct = x.cereri[0];
    T('aceeași cerere ca pe web: PUT /api/devices/company-bulk { company_id, imeis }',
      !!cw && !!ct && cw.url === ct.p && cw.op.method === ct.o.method && J(JSON.parse(cw.op.body)) === J(ct.o.body),
      J({ web: cw && [cw.url, cw.op.method, cw.op.body], tel: ct }));
    T('răspunsul serverului ajunge neatins la ecran', r && r.trecute === 3);
  }
  {
    // (01.10) Căutarea ascunde un aparat bifat: pagina trimite acum, ca telefonul, DOAR bifele vizibile.
    const l = aparate(3); l[2].imei = '861999999999999';
    const w = await webTrece({ devices: l, sel: toateBifate(l), cid: 42, companies: firme, confirm: true, cauta: '86100000000000', resp: { ok: true, trecute: 2, sarite: [] } });
    const trimise = w.fetch[0] ? JSON.parse(w.fetch[0].op.body).imeis : null;
    T('căutarea ascunde un aparat bifat → pagina trimite doar bifele vizibile, ca telefonul (bifateVazute)',
      !!trimise && J(trimise) === J(P.bifateVazute(toateBifate(l), l.slice(0, 2))), J(trimise));
  }

  aceleasi = true; dif = '';
  for (const n of [1, 2, 19, 20, 21, 101]) {
    const l = aparate(n);
    const w = await webTrece({ devices: l, sel: toateBifate(l), cid: 42, companies: firme, confirm: true, resp: { ok: true, trecute: n, sarite: [] } });
    const t = P.mesajBloc({ trecute: n, sarite: [] }, 'Transport SRL', n) + ' ✓';
    if (!w.toast[0] || w.toast[0].m !== t) { aceleasi = false; dif = n + ': web «' + (w.toast[0] && w.toast[0].m) + '» / tel «' + t + '»'; }
  }
  T('mesajul de după (nimic sărit) — aceleași cuvinte ca pe web (1, 2, 19, 20, 21, 101)', aceleasi, dif);
  {
    const l = aparate(5);
    const w = await webTrece({ devices: l, sel: toateBifate(l), cid: 42, companies: firme, confirm: true, resp: { ok: true, trecute: 3, sarite: [l[3].imei, l[4].imei] } });
    const t = P.mesajBloc({ trecute: 3, sarite: [l[3].imei, l[4].imei] }, 'Transport SRL', 5);
    T('cu aparate sărite: aceeași primă parte ca pe web, iar telefonul spune câte au sărit (cu acordul cifrei)',
      !!w.toast[0] && w.toast[0].m.split(' · ')[0] === t.split(' · ')[0] && / · 2 aparate sărite$/.test(t), (w.toast[0] && w.toast[0].m) + ' / ' + t);
  }
  T('acordul cifrei pe telefon: „1 aparat sărit", „20 de aparate sărite", „21 de aparate trecute"',
    / · 1 aparat sărit$/.test(P.mesajBloc({ trecute: 2, sarite: ['1'] }, 'X', 3)) && / · 20 de aparate sărite$/.test(P.mesajBloc({ trecute: 0, sarite: Array(20).fill('1') }, 'X', 20)) &&
    /^21 de aparate trecute pe X$/.test(P.mesajBloc({ trecute: 21, sarite: [] }, 'X', 21)));
  T('IMEI-urile lăsate deoparte fără număr de server se spun și ele', P.mesajBloc({ trecute: 1, sarite: [] }, 'X', 3) === '1 aparat trecut pe X · 2 IMEI-uri nerecunoscute');
  T('motivul unui aparat sărit: arhivat între timp / nu mai există / (fără listă) arhivat sau inexistent',
    P.motivSarit(D.imei, toate) === 'arhivat între timp' && P.motivSarit('869999999999999', toate) === 'nu mai există în aplicație' && P.motivSarit(D.imei, null) === 'arhivat sau inexistent');

  // Ziua abonamentului: rândul, întrebarea, câmpul, cererea, mesajul — lângă web.
  const zile = [null, new Date(2026, 2, 5).getTime(), new Date(2026, 2, 5, 23, 59).getTime(), new Date(2025, 11, 31, 12).getTime(), new Date(2026, 8, 30).getTime(), new Date(2027, 0, 1, 0, 30).getTime()];
  const nume = [['B 10 ABC', 'Camion'], [null, 'Dacia Logan'], [null, null]];
  let r1 = true, r2 = true, r3 = true, d1 = '';
  for (const ms of zile) for (const [plate, name] of nume) {
    const d = { imei: '862000000000001', company_id: 5, status: 'active', plate, name, abonament_de_la: ms };
    const w = await webAbo({ devices: [d], imei: d.imei, raspuns: false });
    if (!w.confirm[0] || w.confirm[0].m !== P.intrebareAbo(d)) { r1 = false; d1 = 'întrebare ' + ms + '/' + plate; }
    if (!w.confirm[0] || String(w.confirm[0].op.field.value) !== P.ziInput(ms)) { r2 = false; d1 = 'câmp ' + ms + ': web ' + (w.confirm[0] && w.confirm[0].op.field.value) + ' / tel ' + P.ziInput(ms); }
    if (webRandAbo(d) !== P.aboText(d)) { r3 = false; d1 = 'rând ' + ms + ': web «' + webRandAbo(d) + '» / tel «' + P.aboText(d) + '»'; }
  }
  T('întrebarea „Din ce zi plătește clientul…" — aceleași cuvinte ca pe web (număr, nume sau IMEI)', r1, d1);
  T('câmpul pornește pe aceeași zi ca pe web (AAAA-LL-ZZ, inclusiv 23:59 și 00:30)', r2, d1);
  T('rândul spune la fel ca pe web: „abonament din ZZ.LL.AAAA" / „abonamentul pornește la prima transmisie"', r3, d1);
  T('pe web, ziua nu se arată pe un aparat neasignat sau arhivat — nici pe telefon', webRandAbo({ imei: '1', company_id: null, abonament_de_la: 1 }) === '' && webRandAbo({ imei: '1', company_id: 5, status: 'archived', abonament_de_la: 1 }) === '');

  let s1 = true, ds = '';
  for (const v of ['2026-03-12', '2025-12-31', '']) {
    const d = { imei: '862000000000001', company_id: 5, status: 'active', plate: 'B 10 ABC', abonament_de_la: new Date(2026, 0, 3).getTime() };
    const w = await webAbo({ devices: [d], imei: d.imei, raspuns: v });
    const x = apiInreg({ ok: true });
    await telefon(x.api).puneAbonament(d.imei, v || null);
    const a = w.act[0], c = x.cereri[0];
    const la = !!a && !!c && a.url === c.p && a.op.method === c.o.method && J(JSON.parse(a.op.body)) === J(c.o.body) && a.msg === P.mesajAbo(v || null);
    if (!la) { s1 = false; ds = J({ v, web: a && [a.url, a.op.method, a.op.body, a.msg], tel: c && [c.p, c.o, P.mesajAbo(v || null)] }); }
  }
  T('salvarea: aceeași cerere (PUT …/abonament { de_la }) și același mesaj ca pe web; golul pleacă null', s1, ds);
  const acum = new Date();
  const zi = (plus) => P.ziInput(new Date(acum.getFullYear(), acum.getMonth(), acum.getDate() + plus).getTime());
  T('fără zile din viitor: azi și ieri merg, mâine și poimâine nu, golul merge', !P.inViitor(zi(0)) && !P.inViitor(zi(-1)) && P.inViitor(zi(1)) && P.inViitor(zi(2)) && !P.inViitor(''));
  T('refuzul spune exact cuvintele serverului', /'Abonamentul nu poate porni în viitor\.'/.test(server) && (tel.match(/Abonamentul nu poate porni în viitor\./g) || []).length >= 2);

  // Pe server pornit: trecerea în bloc și ziua abonamentului, prin clientul HTTP ADEVĂRAT al telefonului
  // (mobile/src/api/client.ts, în browser — fără Capacitor), cu sesiunea super-adminului.
  return async function peServerNeasignate({ R, ck }) {
    sect('4.5 Pe server pornit: trecerea în bloc și ziua abonamentului, prin clientul HTTP adevărat al telefonului');
    const hook = {};
    const client = modul(tsJs(citeste('mobile/src/api/client.ts').split('(import.meta as any).env').join('({})'), 'client.ts'), 'api/client.ts',
      { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } },
      { fetch: (...a) => hook.fetch(...a) });
    hook.fetch = (url, op) => fetch(BASE + url, Object.assign({}, op, { headers: Object.assign({}, op && op.headers, { Cookie: ck }) }));
    const Pn = telefon(client.exp.api);

    const co = (await R('POST', '/api/companies', { name: 'Transport Bloc SRL' })).j || {};
    T('firma de probă', !!co.id, J(co));
    const im = ['869464000000001', '869464000000002', '869464000000003', '869464000000004'];
    for (const i of im) await R('POST', '/api/devices', { imei: i, name: 'Bloc-' + i.slice(-1) });
    await R('PUT', '/api/devices/' + im[3] + '/status', { status: 'archived' });
    const inexistent = '869464000000099';
    const lista = async () => ((await R('GET', '/api/admin/devices')).j || []).filter((d) => im.indexOf(d.imei) >= 0 || d.imei === inexistent);
    const cu = (l, i) => l.filter((d) => d.imei === i)[0] || {};
    const l0 = await lista();
    T('trei aparate în „Neasignate", unul arhivat', l0.filter((d) => d.company_id == null && d.status !== 'archived').length === 3 && cu(l0, im[3]).status === 'archived', J(l0.map((d) => [d.imei.slice(-1), d.company_id, d.status])));

    // Căutarea arată doar primele două; al treilea rămăsese bifat dinainte. „Toate" pe ecranul căutat.
    const vazute = l0.filter((d) => d.imei === im[0] || d.imei === im[1]);
    const bife = Pn.bifeazaVazute({ [im[2]]: true }, vazute, true);
    const pleaca = Pn.bifateVazute(bife, vazute);
    T('telefonul trimite doar cele două de pe ecran (nu și bifa ascunsă)', J(pleaca.slice().sort()) === J([im[0], im[1]]) && Pn.bifateAscunse(bife, l0, vazute) === 1);
    let rb = null, eb = null;
    try { rb = await Pn.treceInBloc(co.id, pleaca.concat([im[3], inexistent])); } catch (e) { eb = e; }
    T('serverul răspunde cu { trecute, sarite }, exact ce citește telefonul', !eb && rb && rb.trecute === 2 && Array.isArray(rb.sarite) && rb.sarite.length === 2 && rb.sarite.indexOf(im[3]) >= 0 && rb.sarite.indexOf(inexistent) >= 0, eb ? eb.message : J(rb));
    const l1 = (await R('GET', '/api/admin/devices')).j || [];
    T('motivul fiecărui aparat sărit, din lista proaspătă: arhivat / nu mai există', Pn.motivSarit(im[3], l1) === 'arhivat între timp' && Pn.motivSarit(inexistent, l1) === 'nu mai există în aplicație');
    T('mesajul de după, cu cifrele serverului', !!rb && Pn.mesajBloc(rb, co.name, 4) === '2 aparate trecute pe Transport Bloc SRL · 2 aparate sărite', rb && Pn.mesajBloc(rb, co.name, 4));
    T('cele două au trecut pe firmă; cel ascuns de căutare a rămas în „Neasignate"', cu(l1, im[0]).company_id === co.id && cu(l1, im[1]).company_id === co.id && cu(l1, im[2]).company_id == null);
    T('pe firmă, fără transmisie: rândul spune că abonamentul pornește la prima transmisie', cu(l1, im[0]).abonament_de_la === null && Pn.aboText(cu(l1, im[0])) === 'abonamentul pornește la prima transmisie', J(cu(l1, im[0])));

    // Prima transmisie pe firmă pune ziua singură; rândul o citește.
    await R('POST', '/api/test/simulate', { imei: im[1] });
    const azi = Pn.ziInput(Date.now()), ro = (z) => z.split('-').reverse().join('.');
    const l2 = await lista();
    T('prima transmisie pune ziua singură — rândul o arată', Pn.ziInput(cu(l2, im[1]).abonament_de_la) === azi && Pn.aboText(cu(l2, im[1])) === 'abonament din ' + ro(azi), J(cu(l2, im[1])));

    // Corectura ✎.
    const t = new Date(), vechi = Pn.ziInput(new Date(t.getFullYear(), t.getMonth() - 3, 12).getTime());
    let c1 = null; try { c1 = await Pn.puneAbonament(im[0], vechi); } catch (e) { c1 = e; }
    const l3 = await lista();
    T('corectura: ziua plecată ca AAAA-LL-ZZ se întoarce aceeași pe rând', c1 && c1.ok && Pn.ziInput(cu(l3, im[0]).abonament_de_la) === vechi && Pn.aboText(cu(l3, im[0])) === 'abonament din ' + ro(vechi), J([c1 && (c1.message || c1), cu(l3, im[0])]));
    let c2 = null; try { c2 = await Pn.puneAbonament(im[0], null); } catch (e) { c2 = e; }
    const l4 = await lista();
    T('golită → pornește din nou la următoarea transmisie', c2 && c2.ok && cu(l4, im[0]).abonament_de_la === null, J([c2 && (c2.message || c2), cu(l4, im[0])]));
    const poimaine = Pn.ziInput(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2).getTime());
    let refuz = null; try { await Pn.puneAbonament(im[0], poimaine); } catch (e) { refuz = e; }
    T('o zi din viitor: serverul o refuză cu cuvintele pe care le scrie și telefonul (care o oprește înainte)', refuz && refuz.status === 400 && refuz.message === 'Abonamentul nu poate porni în viitor.' && Pn.inViitor(poimaine), refuz && refuz.message);
    let c3 = null; try { c3 = await Pn.puneAbonament(im[0], azi); } catch (e) { c3 = e; }
    T('azi: primită și de telefon, și de server', c3 && c3.ok && !Pn.inViitor(azi), c3 && (c3.message || J(c3)));

    // Firma demo: telefonul n-o pune în listă, iar serverul o refuză oricum.
    const cos = (await R('GET', '/api/companies')).j;
    const demo = (Array.isArray(cos) ? cos : (cos && cos.companies) || []).filter((c) => c.is_demo)[0];
    if (demo) {
      let ed = null; try { await Pn.treceInBloc(demo.id, [im[2]]); } catch (e) { ed = e; }
      T('firma demo e refuzată de server, cu motivul', ed && ed.status === 400 && /Firmă inexistentă/.test(ed.message), ed && ed.message);
    } else console.log('  (fără firmă demo în baza de probă — verificarea ei sare)');
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5. Banda de restanță / suspendare (components/BandaAcces.tsx, App.tsx, app/store.ts)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Leagă: hotărârea benzii de pe telefon (bandaAcces) de cea de pe web (applyAccessBanner, decupată și RULATĂ), pe
// stările făcute de serverul adevărat (stareAcces, decupată din server.js și rulată cu neplata.js); textele
// (restanța = textul serverului; suspendarea = textul de pe web; nota noastră nu apare); fluxul live (applyWs din
// store.ts, rulat); verificarea de la un minut; așezarea și culorile, MĂSURATE pe ambele teme.
async function pachetBanda() {
  sect('5. Banda de restanță / suspendare, pentru toți oamenii unei firme');
  const app = citeste('mobile/src/App.tsx'), store = citeste('mobile/src/app/store.ts'), banda = citeste('mobile/src/components/BandaAcces.tsx');
  const css = citeste('mobile/src/components/bandaAcces.css');
  const shell = functie(app, 'function Shell()');

  // Store: blocul accesului (tipul, accesFirma, MESAJ_ACCES_SUSPENDAT), exact cum e scris.
  const iAcc = store.indexOf('export interface AccesFirma'), iOff = store.indexOf('export const offlineMinutes');
  const blocAcces = iAcc >= 0 && iOff > iAcc ? store.slice(iAcc, iOff) : '';
  const ST = modul(tsJs(blocAcces, 'store-acces.ts'), 'store-acces.ts').exp;
  // Componenta, cu store-ul de mai sus în locul celui întreg (care trage Capacitor & co.).
  const jsxRt = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
  const IconStub = function Icon() { return null; };
  const bandaJs = tsJs(banda, 'BandaAcces.tsx', true);
  // lab = { me, token, cereri, apeluri, raspuns(), document } — profilul, cheia și serverul „de carton" ale unei încercări.
  function incarcaBanda(lab) {
    const st = Object.assign({}, ST, { me: lab.me, token: lab.token, refreshMe: async () => { lab.cereri++; } });
    const api = { Api: { me: async () => { lab.apeluri++; return lab.raspuns(); } } };
    return modul(bandaJs, 'BandaAcces.tsx', { 'preact/jsx-runtime': jsxRt, './Icon': { Icon: IconStub }, '../app/store': st, '../api/endpoints': api },
      lab.document ? { document: lab.document } : {}).exp;
  }
  function labNou(profil, raspuns, cheie) {
    return { me: { value: profil }, token: { value: cheie === undefined ? 'k1' : cheie }, cereri: 0, apeluri: 0, raspuns: raspuns || (() => profil) };
  }
  const BA = incarcaBanda(labNou(null));

  // Web: applyAccessBanner, rulată pe un DOM de carton. Întoarce ce se VEDE: null sau { fel, text }.
  const webCod = functie(html, 'function applyAccessBanner()');
  function webBanda() {
    const els = {};
    const gazda = { insertBefore(el) { els[el.id] = el; } };
    const ctx = {
      currentUser: null,
      document: {
        getElementById: (id) => els[id] || (id === 'app' || id === 'topbar' ? gazda : null),
        createElement: (tag) => ({ tag, id: '', style: {}, textContent: '' }),
        body: { insertBefore(el) { els[el.id] = el; }, firstChild: null },
      },
    };
    vm.runInNewContext(webCod + '\nthis.__run = function (u) { currentUser = u; applyAccessBanner(); };', ctx);
    return function (u) {
      ctx.__run(u);
      const el = els['access-banner'];
      if (!el || el.style.display !== 'block') return null;
      const fel = el.style.background === '#f59e0b' ? 'restanta' : el.style.background === '#ef4444' ? 'suspendat' : 'altceva:' + el.style.background;
      return { fel, text: String(el.textContent).replace(/^(⚠|🚫)\s/u, '') };
    };
  }

  // Server: stareAcces, rulată cu neplata.js — stările ADEVĂRATE pe care le poate primi telefonul.
  const serverCtx = { neplata: require('./neplata.js') };
  vm.runInNewContext(functie(server, 'function stareAcces(co, facturi, acum)'), serverCtx);
  const stareAcces = serverCtx.stareAcces;
  T('găsesc bucățile: applyAccessBanner (pagina), stareAcces (server), blocul accesului (store.ts), Shell (App.tsx)',
    !!(webCod && typeof stareAcces === 'function' && typeof ST.accesFirma === 'function' && shell));

  sect('5.1 Banda: telefonul hotărăște ca pagina web, pe stările făcute de server');
  const ZI = 86400000, ACUM = Date.now();
  const fact = (o) => Object.assign({ id: 7, full_number: 'RAT-2026-00007', type: 'invoice', status: 'issued', total: 1234.5, currency: 'RON' }, o);
  const scenarii = [
    ['fără facturi', {}, []],
    ['factura încă n-a ajuns la scadență', {}, [fact({ due_date: ACUM + 3 * ZI })]],
    ['restantă de o oră', {}, [fact({ due_date: ACUM - 3600000 })]],
    ['restantă de 3 zile', {}, [fact({ due_date: ACUM - 3 * ZI })]],
    ['restantă de 15 zile (ultima zi de grație)', {}, [fact({ due_date: ACUM - 15 * ZI - 3600000 })]],
    ['restantă de 16 zile → suspendată pentru neplată', {}, [fact({ due_date: ACUM - 16 * ZI - 3600000 })]],
    ['plătită', {}, [fact({ due_date: ACUM - 20 * ZI, status: 'paid' })]],
    ['proformă restantă (nu obligă)', {}, [fact({ due_date: ACUM - 20 * ZI, type: 'proforma' })]],
    ['oprită de noi, cu notă internă', { suspended_at: ACUM - 5000, suspend_reason: 'NOTA-INTERNA-PROBA client dificil' }, []],
    ['oprită de noi ȘI cu restanță', { suspended_at: ACUM - 5000, suspend_reason: 'NOTA-INTERNA-PROBA' }, [fact({ due_date: ACUM - 2 * ZI })]],
  ];
  const runWeb = webBanda();
  const stari = {};
  for (const [nume, co, facturi] of scenarii) {
    const acc = stareAcces(co, facturi, ACUM);
    stari[nume] = acc;
    for (const [rol, isSuper] of [['om al firmei', false], ['super-admin', true]]) {
      const m = { username: 'x', isSuper, access: acc };
      const w = runWeb(m), t = BA.bandaAcces(m);
      T(nume + ' · ' + rol + ': ' + (t ? t.fel : 'fără bandă') + ' — la fel ca pe web', J(w) === J(t), 'web=' + J(w) + ' telefon=' + J(t));
    }
  }
  const g3 = stari['restantă de 3 zile'];
  T('restanța: telefonul arată EXACT textul serverului (neplata.mesajClient), cu factura și zilele lui',
    g3.status === 'grace' && BA.bandaAcces({ access: g3 }).text === g3.mesaj && /RAT-2026-00007/.test(g3.mesaj) && /achitați în \d+ zile/.test(g3.mesaj), J(g3));
  for (const nume of ['oprită de noi, cu notă internă', 'oprită de noi ȘI cu restanță', 'restantă de 16 zile → suspendată pentru neplată']) {
    const b = BA.bandaAcces({ access: stari[nume] });
    T('„' + nume + '": banda roșie, cu textul de pe web, fără nota noastră', b && b.fel === 'suspendat' && b.text === ST.MESAJ_ACCES_SUSPENDAT && !/NOTA-INTERNA/.test(b.text), J(b));
  }
  // Formele ciudate: tot ca pe web.
  const ciudate = [null, {}, { access: null }, { access: {} }, { access: { status: 'grace' } }, { access: { status: 'grace', mesaj: '' } },
    { access: { status: 'active' } }, { access: { status: 'ceva-nou' } }, { access: 'x' }, { isSuper: true, access: { status: 'expired' } },
    { access: { status: 'expired', motiv: 'manual', nota: 'NOTA-INTERNA-PROBA' } }];
  for (const m of ciudate) {
    const w = runWeb(m), t = BA.bandaAcces(m);
    T('forma ' + J(m) + ' → la fel ca pe web', J(w) === J(t), 'web=' + J(w) + ' telefon=' + J(t));
  }
  // Trecerile, în aceeași pagină: restanță → suspendat → activ (banda se stinge) → restanță.
  const runW2 = webBanda(), sir = ['restantă de 3 zile', 'oprită de noi, cu notă internă', 'fără facturi', 'restantă de o oră'];
  T('trecerile (restanță → suspendat → la zi → restanță) dau aceeași bandă, pas cu pas',
    sir.every((n) => J(runW2({ access: stari[n] })) === J(BA.bandaAcces({ access: stari[n] }))));

  sect('5.2 Textele');
  T('textul de suspendare = cel de pe web (rulat), fără „abonament"', runWeb({ access: { status: 'expired' } }).text === ST.MESAJ_ACCES_SUSPENDAT && !/abonament/i.test(ST.MESAJ_ACCES_SUSPENDAT));
  T('rezerva la o restanță fără text = cea de pe web (rulată)', runWeb({ access: { status: 'grace' } }).text === BA.TEXT_RESTANTA_REZERVA);
  const bandaCod = faraComentarii(banda);
  T('telefonul nu socotește nimic din neplată (nicio zi, dată, sumă)', !/Date\b|86400000|toLocale|zile|ZILE|suspendareLa|zilePana/.test(bandaCod));
  T('nota noastră (access.nota) nu e citită nicăieri pe telefon', !/\.nota\b/.test(bandaCod) && !/\.nota\b/.test(faraComentarii(store)) && !/\.nota\b/.test(faraComentarii(app)));
  T('vorbele vechi „verifică factura/abonamentul" nu mai sunt în telefon', !fisiereTel.some((x) => /verifică factura\/abonamentul/.test(x.src)));

  sect('5.2b La pornire, contul unei firme oprite iese din aplicație — ca pe web (checkAuth, rulată; hotărât pe 30.09)');
  // Web: checkAuth, rulată cu un fetch „de carton": cere /api/me; la o firmă oprită cheamă /api/logout și scrie
  // mesajul pe ecranul de autentificare, fără să intre în aplicație (showApp).
  const pornireCod = functie(html, 'async function checkAuth()');
  async function webPornire(data) {
    const cereri = [], el = { textContent: '', style: {} };
    const ctx = {
      fetch: async (url) => { cereri.push(url); return url === '/api/me' ? { ok: true, json: async () => data } : { ok: true, json: async () => ({}) }; },
      document: { getElementById: (id) => (id === 'login-error' ? el : null) },
      intrat: false,
    };
    ctx.showApp = () => { ctx.intrat = true; };
    vm.runInNewContext(pornireCod + '\nthis.__run = checkAuth;', ctx);
    await ctx.__run();
    return { iese: cereri.indexOf('/api/logout') >= 0, intra: ctx.intrat, mesaj: el.style.display === 'block' ? el.textContent : '' };
  }
  T('găsesc checkAuth în pagină; accesOprit și mesajul de la pornire în telefon',
    !!pornireCod && typeof ST.accesOprit === 'function' && typeof ST.MESAJ_SUSPENDAT_LA_INTRARE === 'string' && ST.MESAJ_SUSPENDAT_LA_INTRARE.length > 0);
  for (const [nume] of scenarii) {
    for (const [rol, isSuper] of [['om al firmei', false], ['super-admin', true]]) {
      const m = { username: 'x', isSuper, access: stari[nume] };
      const w = await webPornire(m), iese = ST.accesOprit(m);
      T('pornire · ' + nume + ' · ' + rol + ': ' + (iese ? 'iese, cu mesajul' : 'intră') + ' — la fel ca pe web',
        w.iese === iese && w.intra === !iese && (iese ? w.mesaj === ST.MESAJ_SUSPENDAT_LA_INTRARE : w.mesaj === ''), J(w));
    }
  }
  for (const m of ciudate) {
    if (m == null) continue;   // un profil lipsă nu scoate pe nimeni (pe telefon, pornirea fără rețea)
    const w = await webPornire(m);
    T('pornire · forma ' + J(m) + ' → la fel ca pe web', w.iese === ST.accesOprit(m), J(w));
  }
  const mesajServer = (/const MESAJ_SUSPENDAT = '([^']+)';/.exec(server) || [])[1];
  T('mesajul de la pornire = cel cu care serverul refuză intrarea (MESAJ_SUSPENDAT) = cel de pe web',
    !!mesajServer && mesajServer === ST.MESAJ_SUSPENDAT_LA_INTRARE && (await webPornire({ access: { status: 'expired' } })).mesaj === mesajServer, mesajServer);
  const boot = functie(store, 'export async function bootstrap()');
  const iMe = boot.indexOf('proaspat = await Api.me();'), iOprit = boot.indexOf('if (proaspat && accesOprit(proaspat)) {');
  const ramura = iOprit >= 0 ? functie(boot.slice(iOprit), 'if (proaspat && accesOprit(proaspat))') : '';
  const pas = (s) => ramura.indexOf(s);
  T('pornirea: DOAR profilul proaspăt (de la server) scoate contul — nu copia de pe telefon; înainte de preferințe și de primul ecran',
    /let proaspat: Me \| null = null;/.test(boot) && iMe > 0 && iOprit > iMe && boot.indexOf('syncUiPrefs(true)') > iOprit
    && !/proaspat = await loadUser/.test(boot));
  T('…și scoate cum trebuie: se deloghează, lasă mesajul pentru ecranul de autentificare, termină pornirea, iese',
    pas('await logout();') > 0 && pas('mesajLaIntrare.value = MESAJ_SUSPENDAT_LA_INTRARE;') > pas('await logout();')
    && pas('authReady.value = true;') > pas('mesajLaIntrare.value') && pas('return;') > pas('authReady.value = true;'), ramura);
  const ecranLogin = citeste('mobile/src/screens/Login.tsx');
  T('ecranul de autentificare arată mesajul o singură dată (îl ia la deschidere, apoi îl golește)',
    /const \[err, setErr\] = useState\(mesajLaIntrare\.value \|\| ''\);/.test(ecranLogin) && /useEffect\(\(\) => \{ mesajLaIntrare\.value = null; \}, \[\]\);/.test(ecranLogin)
    && /\{err && <div/.test(ecranLogin));

  // Componenta desenată (vnode-uri): clasa, rolul, iconița, textul, butonul.
  function text(v) { if (v == null || v === false || v === true) return ''; if (typeof v === 'string' || typeof v === 'number') return String(v); if (Array.isArray(v)) return v.map(text).join(''); return text(v.props && v.props.children); }
  function gaseste(v, f) { if (!v || typeof v !== 'object') return null; if (Array.isArray(v)) { for (const x of v) { const r = gaseste(x, f); if (r) return r; } return null; } if (f(v)) return v; return gaseste(v.props && v.props.children, f); }
  const vR = BA.BandaAcces({ banda: BA.bandaAcces({ access: g3 }) });
  const vRb = BA.BandaAcces({ banda: BA.bandaAcces({ access: g3 }), onFacturi: () => 'ok' });
  const vS = BA.BandaAcces({ banda: BA.bandaAcces({ access: stari['oprită de noi, cu notă internă'] }) });
  T('fără bandă nu se desenează nimic', BA.BandaAcces({ banda: null }) === null);
  T('restanța: portocaliu (ba-restanta), anunț liniștit (role=status), iconița „alert", textul serverului, fără buton când nu i se dă',
    / ba-restanta$/.test(vR.props.class) && vR.props.role === 'status' && !!gaseste(vR, (x) => x.type === IconStub && x.props.name === 'alert')
    && text(vR) === g3.mesaj && !gaseste(vR, (x) => x.type === 'button'), J(vR).slice(0, 400));
  const btn = gaseste(vRb, (x) => x.type === 'button');
  T('suspendat: roșu (ba-suspendat), anunț urgent (role=alert), iconița „ban", textul de pe web, fără buton (ca pe web)', / ba-suspendat$/.test(vS.props.class) && vS.props.role === 'alert'
    && !!gaseste(vS, (x) => x.type === IconStub && x.props.name === 'ban') && text(vS) === ST.MESAJ_ACCES_SUSPENDAT && !gaseste(vS, (x) => x.type === 'button'));
  T('butonul spre facturi (pe restanță) spune ce face („Vezi facturile") și cheamă ce i s-a dat', btn && text(btn) === 'Vezi facturile' && btn.props.onClick() === 'ok' && btn.props.type === 'button');
  const icoane = citeste('mobile/src/components/Icon.tsx');
  T('iconițele folosite există în Icon.tsx', /\|\s*'ban'/.test(icoane) && /\|\s*'alert'/.test(icoane) && /\bban:\s*'/.test(icoane) && /\balert:\s*'/.test(icoane));

  sect('5.3 Fluxul live (applyWs din store.ts, rulat): „acces oprit" reîmprospătează profilul o dată; reactivarea stinge banda');
  function wsLab() {
    const ctx = {
      me: { value: null }, livePos: { value: [] }, vehiclesLoading: { value: true }, roster: { value: [] }, unread: { value: 0 }, lastNotif: { value: null },
      upsertVehicle() {}, refreshMe() { ctx.cereri++; }, showToast(t, e) { ctx.anunturi.push([t, e]); },
      accesFirma: ST.accesFirma, MESAJ_ACCES_SUSPENDAT: ST.MESAJ_ACCES_SUSPENDAT, cereri: 0, anunturi: [],
    };
    vm.runInNewContext('var _wsAccessMsgShown = false;\n' + tsJs(functie(store, 'function applyWs(msg: any)'), 'applyWs.ts') + '\nthis.__applyWs = applyWs;', ctx);
    return ctx;
  }
  const EROARE = { type: 'error', data: { error: 'access_expired' } };
  const w = wsLab();
  w.me.value = { access: g3 };
  w.__applyWs(EROARE);
  T('profil în restanță + flux refuzat → profilul se cere din nou, anunțul spune textul de azi', w.cereri === 1 && w.anunturi.length === 1 && w.anunturi[0][0] === ST.MESAJ_ACCES_SUSPENDAT && w.anunturi[0][1] === true, J([w.cereri, w.anunturi]));
  w.__applyWs(EROARE);
  T('o reconectare refuzată din nou: fără al doilea anunț', w.anunturi.length === 1);
  w.me.value = { access: stari['oprită de noi, cu notă internă'] };
  const inainte = w.cereri;
  w.__applyWs(EROARE); w.__applyWs(EROARE);
  T('cât profilul spune deja „suspendat", reconectările nu mai cer nimic', w.cereri === inainte);
  w.__applyWs({ type: 'init', data: [{ imei: '1' }] });
  T('fluxul primit iar (firma reactivată) cu profilul încă „suspendat" → profilul se cere, ca banda roșie să nu rămână agățată', w.cereri === inainte + 1 && w.livePos.value.length === 1 && w.vehiclesLoading.value === false);
  w.me.value = { access: stareAcces({}, [], ACUM) };
  w.__applyWs({ type: 'init', data: [] });
  T('fluxul primit cu profilul la zi → nicio cerere în plus', w.cereri === inainte + 1);
  w.me.value = { access: stari['oprită de noi, cu notă internă'] };
  w.__applyWs(EROARE);
  T('o suspendare NOUĂ, după reactivare, se anunță din nou', w.anunturi.length === 2);
  const ramuraErr = functie(store, 'function applyWs(msg: any)').split("msg.data.error === 'access_expired'")[1] || '';
  T('ramura „acces oprit" de pe flux nu mai spune „abonament"', !!ramuraErr && !/abonament/i.test(faraComentarii(ramuraErr.slice(0, ramuraErr.indexOf('return;')))));
  T('autentificarea păstrează `access` din răspuns (banda apare din prima)', /features: res\.features, access: accesFirma\(res\) \} as Me/.test(store));

  sect('5.4 Cu aplicația deschisă: o dată pe minut, profilul se reîncarcă DOAR când accesul s-a schimbat');
  {
    const restanta = { username: 'd', isSuper: false, access: g3 };
    const suspendat = { username: 'd', isSuper: false, access: stari['oprită de noi, cu notă internă'] };
    let L = labNou(restanta, () => JSON.parse(JSON.stringify(restanta)));
    T('accesul neschimbat → întreabă, dar nu reîncarcă nimic (niciun ecran nu se redesenează)', (await incarcaBanda(L).verificaAccesul()) === false && L.apeluri === 1 && L.cereri === 0);
    L = labNou(restanta, () => suspendat);
    T('accesul schimbat (suspendat între timp) → profilul se reîncarcă pe calea obișnuită', (await incarcaBanda(L).verificaAccesul()) === true && L.cereri === 1);
    L = labNou(suspendat, () => ({ username: 'd', access: stareAcces({}, [], ACUM) }));
    T('plătit / reactivat între timp → la fel (banda se stinge)', (await incarcaBanda(L).verificaAccesul()) === true && L.cereri === 1);
    L = labNou({ username: 's', isSuper: true, access: null });
    T('contul de platformă nu întreabă deloc', (await incarcaBanda(L).verificaAccesul()) === false && L.apeluri === 0);
    L = labNou(null);
    T('fără profil nu întreabă', (await incarcaBanda(L).verificaAccesul()) === false && L.apeluri === 0);
    L = labNou(restanta, null, null);
    T('fără cheie (delogat) nu întreabă', (await incarcaBanda(L).verificaAccesul()) === false && L.apeluri === 0);
    L = labNou(restanta, () => { L.token.value = 'k2'; return suspendat; });
    T('contul schimbat cât răspunsul era pe drum → nu pune starea altui cont', (await incarcaBanda(L).verificaAccesul()) === false && L.cereri === 0);
    L = labNou(restanta, () => { throw new Error('fără rețea'); });
    T('fără rețea → rămâne ce era, fără eroare', (await incarcaBanda(L).verificaAccesul()) === false && L.cereri === 0);
    L = labNou(restanta, () => suspendat); L.document = { visibilityState: 'hidden' };
    T('aplicația ascunsă (în fundal) → nu întreabă', (await incarcaBanda(L).verificaAccesul()) === false && L.apeluri === 0);
    L = labNou(restanta, () => suspendat); L.document = { visibilityState: 'visible' };
    T('aplicația la vedere → întreabă', (await incarcaBanda(L).verificaAccesul()) === true && L.apeluri === 1);
    T('App: verificarea pornește cu contul, la ACCES_VERIFICARE_MS (un minut), și se oprește la ieșire',
      /const accesTimer = setInterval\(verificaAccesul, ACCES_VERIFICARE_MS\);/.test(shell) && /clearInterval\(accesTimer\)/.test(shell)
      && shell.indexOf('if (!token.value) return;') < shell.indexOf('const accesTimer') && BA.ACCES_VERIFICARE_MS === 60000);
  }

  sect('5.5 Așezarea (în flux, ramele mereu acolo) și culorile, măsurate');
  T('banda se desenează doar DUPĂ ecranul de autentificare (pe Login nu apare)', shell.indexOf('if (!token.value) return <Login />;') > 0 && shell.indexOf('<BandaAcces banda=') > shell.indexOf('if (!token.value) return <Login />;'));
  // Când banda apare/dispare, ecranul se strânge fără ca fereastra să se schimbe: hărțile primesc „resize".
  const iEfect = shell.indexOf("useEffect(() => { try { window.dispatchEvent(new Event('resize')); } catch { /* */ } }, [areBanda]);");
  T('la apariția / dispariția benzii, hărțile primesc „resize" (o dată, pe schimbare), iar cârligul stă ÎNAINTEA ieșirilor timpurii',
    iEfect > 0 && iEfect < shell.indexOf('if (!authReady.value) return <Splash />;') && /const areBanda = !!banda;/.test(shell) && shell.indexOf('const banda = bandaAcces(me.value);') < iEfect);
  // Leaflet ascultă singur „resize" pe fereastră (trackResize). Sursa lui stă în mobile/node_modules, pe care CI nu-l
  // instalează: acolo se verifică doar partea noastră (niciun ecran nu oprește ascultarea).
  const nimeniNuOpreste = !surseTs.some((x) => /trackResize/.test(x.src));
  const leafletP = 'mobile/node_modules/leaflet/dist/leaflet-src.js';
  if (fs.existsSync(path.join(ROOT, leafletP))) {
    const leaflet = citeste(leafletP);
    T('…și Leaflet chiar ascultă „resize" pe fereastră (trackResize implicit), iar niciun ecran nu-l oprește',
      /trackResize: true/.test(leaflet) && /onOff\(window, 'resize', this\._onResize, this\)/.test(leaflet) && nimeniNuOpreste);
  } else {
    T('…niciun ecran nu oprește ascultarea „resize" a hărților (trackResize)', nimeniNuOpreste);
    console.log('  (Leaflet nu e instalat aici — lipsește mobile/node_modules —, deci sursa lui nu se poate citi; restul verificării a rulat)');
  }
  T('ramele stau MEREU (nu depind de bandă): cadru → bandă → corp → Router → închideri → bara de jos',
    /return \(\n\s*<>\n\s*<div class="ba-cadru">\n\s*<BandaAcces banda=\{banda\} onFacturi=\{spreFacturi\} \/>\n\s*<div class=\{'ba-corp' \+ \(banda \? ' sub-banda' : ''\)\}>\n\s*<Router>/.test(shell)
    && /<\/Router>\n\s*<\/div>\{\/\* \.ba-corp \*\/\}\n\s*<\/div>\{\/\* \.ba-cadru \*\/\}\n\s*\{showTabs && <TabBar \/>\}/.test(shell));
  T('importul componentei în App', /import \{ BandaAcces, bandaAcces, verificaAccesul, ACCES_VERIFICARE_MS \} from '\.\/components\/BandaAcces';/.test(app));
  const meniu = citeste('mobile/src/screens/Menu.tsx');
  T('butonul spre facturi: DOAR pe banda de restanță (pe cea roșie nu, ca pe web), cu aceeași condiție ca rândul „Facturile mele" din meniu, și nu când ești deja acolo',
    /perms\.manageUsers && !u\?\.isSuper && item\('report', 'Facturile mele', \(\) => loc\.route\('\/billing'\)\)/.test(meniu)
    && /const spreFacturi = banda && banda\.fel === 'restanta' && me\.value\?\.permissions\?\.manageUsers && path !== '\/billing' \? \(\) => loc\.route\('\/billing'\) : undefined;/.test(shell));
  const cssFara = faraComentariiCss(css);
  T('nimic din bandă nu plutește peste ecran (fără fixed/absolute)', !/position\s*:\s*(fixed|absolute|sticky)/.test(cssFara));
  T('fără culori scrise de mână, fără alt font', !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(cssFara) && !/font-family/.test(cssFara));
  T('bara telefonului e acoperită o singură dată: banda o ține, ecranul de sub ea nu', /\.ba-banda \{[^}]*padding-top: var\(--sat\)/.test(cssFara) && /\.ba-corp\.sub-banda \{ --sat: 0px; \}/.test(cssFara)
    && /\.app-header \{[^}]*height: calc\(var\(--header-h\) \+ var\(--sat\)\); padding: var\(--sat\) 14px 0;/.test(citeste('mobile/src/theme/global.css').replace(/\n\s*/g, ' ')));
  T('cadrul e coloană pe toată înălțimea, corpul ia restul', /\.ba-cadru \{ height: 100%; display: flex; flex-direction: column; \}/.test(cssFara) && /\.ba-corp \{ flex: 1 1 0; min-height: 0; position: relative; \}/.test(cssFara));

  // Contrastul, din valorile tokenilor (tokens.css + flota.css) și din procentele din bandaAcces.css.
  const tokeni = (bloc) => { const o = {}; for (const m of bloc.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) o[m[1]] = m[2]; return o; };
  const tk = citeste('mobile/src/theme/tokens.css'), fl = citeste('mobile/src/screens/flota.css');
  const tDark = tokeni(tk.slice(tk.indexOf(':root, :root[data-theme="dark"]'), tk.indexOf(':root[data-theme="light"]')));
  const tLight = Object.assign({}, tDark, tokeni(tk.slice(tk.indexOf(':root[data-theme="light"]'))));
  Object.assign(tDark, tokeni((fl.match(/:root \{[^}]*\}/) || [''])[0]));
  Object.assign(tLight, tokeni((fl.match(/:root\[data-theme="light"\] \{[^}]*\}/) || [''])[0]));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const pct = (tok) => { const m = cssFara.match(new RegExp('color-mix\\(in srgb, var\\(' + tok + '\\) (\\d+)%, var\\(--bg-panel\\)\\)')); return m ? Number(m[1]) / 100 : null; };
  for (const [tema, t] of [['închisă', tDark], ['deschisă', tLight]]) {
    for (const [fel, tok] of [['restanță', '--fl-warn'], ['suspendat', '--red']]) {
      const p = pct(tok), culoare = t[tok] && hex(t[tok]), panou = hex(t['--bg-panel']), scris = hex(t['--text-primary']);
      if (p == null || !culoare) { T('tema ' + tema + ', ' + fel + ': culorile se pot citi', false, 'p=' + p + ' ' + tok + '=' + t[tok]); continue; }
      const fundal = amesteca(culoare, p, panou);
      const cT = contrast(scris, fundal), cI = contrast(culoare, fundal), cF = contrast(scris, panou), cM = contrast(culoare, panou);
      T('tema ' + tema + ', ' + fel + ': scrisul ' + cT.toFixed(1) + ':1 (≥ 7), iconița și chenarul ' + cI.toFixed(1) + ':1 pe bandă / ' + cM.toFixed(1) + ':1 pe panou (≥ 3)',
        cT >= 7 && cI >= 3 && cM >= 3, J({ fundal: fundal.map(Math.round), cT, cI, cM }));
      // Fără color-mix (WebView vechi) fundalul rămâne panoul: scrisul și butonul (tot --text-primary pe panou).
      T('tema ' + tema + ', ' + fel + ': fără color-mix (WebView vechi) scrisul și butonul rămân ' + cF.toFixed(1) + ':1 (≥ 7)', cF >= 7);
    }
  }

  // Pe server pornit: dispecerul și adminul unei firme cu o factură restantă, apoi suspendată, reactivată și plătită —
  // ce primește telefonul pe /api/me, la autentificare și pe fluxul live.
  const APP_VER = (/export const APP_VERSIUNE = '([^']+)';/.exec(citeste('mobile/src/api/client.ts')) || [])[1] || '1.0.5';
  const WS = globalThis.WebSocket || require('ws');   // Node 20 (CI) n-are WebSocket global; serverul are `ws`.
  // Ca telefonul: cheia în antetul Authorization (api/client.ts).
  const caTelefonul = (token) => async (m, url, body) => {
    const x = await fetch(BASE + url, { method: m, headers: { 'Content-Type': 'application/json', 'X-RA-App': APP_VER, Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) { /* fără corp */ }
    return { s: x.status, j };
  };
  async function autentificareTelefon(u, p) {
    const x = await fetch(BASE + '/api/mobile/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RA-App': APP_VER }, body: JSON.stringify({ username: u, password: p, device: 'android' }) });
    let j = null; try { j = await x.json(); } catch (e) { /* fără corp */ }
    return { s: x.status, j };
  }
  // Primul mesaj care contează de pe fluxul live (init sau eroare), ca pe telefon (?token=…).
  function fluxLive(token, ms) {
    return new Promise((resolve) => {
      let gataF = false, ws = null;
      const fin = (v) => { if (gataF) return; gataF = true; clearTimeout(t); try { ws.close(); } catch (e) { /* deja închis */ } resolve(v); };
      const t = setTimeout(() => fin(null), ms || 10000);
      ws = new WS('ws://127.0.0.1:' + PORT + '/?token=' + encodeURIComponent(token));
      ws.onmessage = (ev) => { let m = null; try { m = JSON.parse(ev.data); } catch (e) { /* nu e JSON */ } if (m && (m.type === 'init' || m.type === 'error')) fin(m); };
      ws.onerror = () => {};
      ws.onclose = () => fin(null);
    });
  }

  return async function peServerBanda({ R }) {
    sect('5.6 Pe server pornit: o firmă cu factură restantă, suspendată, reactivată și plătită, văzută de pe telefon');
    await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 19 } });
    const co = (await R('POST', '/api/companies', { name: 'Restanța Probă SRL' })).j;
    // Termen de plată 0 zile: factura emisă acum e restantă imediat — ziua 0 a neplății, adică restanța.
    await R('PUT', '/api/companies/' + co.id + '/billing-config', { payment_term_days: 0 });
    const { puneParola } = require('./test_parola.js');
    const PAROLA = 'Str4da-Verde-2026';
    const adm = await R('POST', '/api/users', { username: 'admin.restanta@exemplu.ro', full_name: 'Admin Restanță', role: 'company_admin', company_id: co.id });
    const dis = await R('POST', '/api/users', { username: 'dispecer.restanta@exemplu.ro', full_name: 'Dispecer Restanță', role: 'dispatcher', company_id: co.id });
    await puneParola(adm.j, PAROLA, BASE); await puneParola(dis.j, PAROLA, BASE);
    const fac = await R('POST', '/api/invoices', { companyId: co.id, fel: 'unica', lines: [{ desc: 'Montaj GPS', qty: 1, unitPrice: 100 }] });
    T('factura emisă, cu scadența azi', fac.s === 200 && fac.j && fac.j.invoice && fac.j.invoice.id, J(fac.j).slice(0, 300));
    await sleep(50);
    await R('PUT', '/api/companies/' + co.id + '/suspend', { suspend: false }); // golește memoria stării, ca să se vadă factura
    const runWS = webBanda();

    // Restanța: dispecerul (fără drept de facturi) și adminul firmei.
    const lD = await autentificareTelefon('dispecer.restanta@exemplu.ro', PAROLA);
    const lA = await autentificareTelefon('admin.restanta@exemplu.ro', PAROLA);
    T('restanță: dispecerul intră pe telefon, iar autentificarea aduce deja `access` (restanță)', lD.s === 200 && lD.j.access && lD.j.access.status === 'grace', J(lD.j).slice(0, 300));
    const D = caTelefonul(lD.j.token), A = caTelefonul(lA.j.token);
    const meD = (await D('GET', '/api/me')).j, meA = (await A('GET', '/api/me')).j;
    const bD = BA.bandaAcces(meD), bA = BA.bandaAcces(meA);
    T('restanță, dispecer: banda portocalie, cu textul serverului — la fel ca pe web', bD && bD.fel === 'restanta' && bD.text === meD.access.mesaj && J(runWS(meD)) === J(bD), J(meD && meD.access));
    T('restanță, admin: aceeași bandă (orice rol)', bA && J(bA) === J(bD));
    T('provizoriul de la autentificare dă aceeași bandă ca /api/me', J(BA.bandaAcces({ isSuper: lD.j.isSuper, access: ST.accesFirma(lD.j) })) === J(bD));
    T('restanța nu oprește nimic: fluxul live pornește (init)', ((await fluxLive(lD.j.token)) || {}).type === 'init');
    T('super-adminul n-are bandă', BA.bandaAcces((await R('GET', '/api/me')).j) === null);
    T('butonul spre facturi: dispecerul n-are dreptul (nici meniul, nici serverul nu-i dau „Facturile mele")',
      !(meD.permissions || {}).manageUsers && (await D('GET', '/api/billing/my-invoices')).s === 403);
    T('…adminul îl are, iar facturile i se deschid', !!(meA.permissions || {}).manageUsers && (await A('GET', '/api/billing/my-invoices')).s === 200);

    // Suspendarea (de noi, cu notă), pe sesiunea DEJA deschisă a telefonului.
    const sus = await R('PUT', '/api/companies/' + co.id + '/suspend', { suspend: true, reason: 'NOTA-INTERNA-PROBA probă' });
    T('firma suspendată de noi', sus.s === 200 && sus.j.access && sus.j.access.status === 'expired');
    const meD2 = (await D('GET', '/api/me'));
    const bD2 = BA.bandaAcces(meD2.j);
    T('suspendat: /api/me rămâne deschis telefonului și aduce starea', meD2.s === 200 && meD2.j.access && meD2.j.access.status === 'expired');
    T('suspendat: banda roșie, cu textul de pe web, fără nota noastră', bD2 && bD2.fel === 'suspendat' && bD2.text === ST.MESAJ_ACCES_SUSPENDAT
      && J(runWS(meD2.j)) === J(bD2) && !/NOTA-INTERNA/.test(J(bD2)), J(meD2.j.access));
    const live = await D('GET', '/api/live');
    T('suspendat: restul ecranelor primesc refuz (402) — banda e explicația', live.s === 402 && live.j && live.j.access_expired === true);
    T('suspendat, cu aplicația deschisă: adminul își poate deschide facturile (din meniu)', (await A('GET', '/api/billing/my-invoices')).s === 200);
    T('suspendat: la următoarea pornire, profilul proaspăt îl scoate din aplicație (ca pe web)', ST.accesOprit(meD2.j) === true && ST.accesOprit(meD) === false);
    const msgS = await fluxLive(lD.j.token);
    T('suspendat: fluxul live răspunde „access_expired"', msgS && msgS.type === 'error' && msgS.data && msgS.data.error === 'access_expired', J(msgS));
    const w2 = wsLab(); w2.me.value = meD; // profilul vechi, din restanță
    w2.__applyWs(msgS);
    T('…telefonul (profil vechi) cere profilul din nou și anunță cu textul de azi', w2.cereri === 1 && w2.anunturi.length === 1 && w2.anunturi[0][0] === ST.MESAJ_ACCES_SUSPENDAT);
    w2.me.value = meD2.j; w2.__applyWs(msgS);
    T('…iar cu profilul nou („suspendat") nu mai cere nimic', w2.cereri === 1);
    // Legătura live DEJA deschisă nu primește vestea; verificarea de la un minut, pe serverul adevărat, o prinde.
    let LV = labNou(meD, async () => (await D('GET', '/api/me')).j);
    T('aplicația rămasă deschisă (profil din restanță): verificarea de la un minut vede suspendarea și reîncarcă profilul',
      (await incarcaBanda(LV).verificaAccesul()) === true && LV.cereri === 1);
    LV = labNou(meD2.j, async () => (await D('GET', '/api/me')).j);
    T('…iar cu profilul la zi nu reîncarcă nimic', (await incarcaBanda(LV).verificaAccesul()) === false && LV.cereri === 0);
    const lD3 = await autentificareTelefon('dispecer.restanta@exemplu.ro', PAROLA);
    T('suspendat: o autentificare NOUĂ e refuzată cu mesajul serverului (ecranul de autentificare îl arată)', lD3.s === 402 && lD3.j && typeof lD3.j.error === 'string' && lD3.j.error.length > 0);
    T('…același mesaj pe care telefonul îl arată când pornirea scoate contul', lD3.j && lD3.j.error === ST.MESAJ_SUSPENDAT_LA_INTRARE, lD3.j && lD3.j.error);

    // Reactivarea: banda roșie nu rămâne agățată.
    await R('PUT', '/api/companies/' + co.id + '/suspend', { suspend: false });
    const msgR = await fluxLive(lD.j.token);
    T('reactivată: fluxul live pornește din nou (init)', msgR && msgR.type === 'init');
    const w3 = wsLab(); w3.me.value = meD2.j; // telefonul încă ține profilul „suspendat"
    w3.__applyWs(msgR);
    const meD3 = (await D('GET', '/api/me')).j;
    T('…telefonul cere profilul, iar noul profil stinge banda roșie (rămâne restanța)', w3.cereri === 1 && (BA.bandaAcces(meD3) || {}).fel === 'restanta');
    T('reactivată: pornirea nu mai scoate pe nimeni', ST.accesOprit(meD3) === false);

    // Plata: nicio bandă.
    const pl = await R('PUT', '/api/invoices/' + fac.j.invoice.id + '/status', { status: 'paid' });
    const meD4 = (await D('GET', '/api/me')).j;
    T('factura plătită → la zi → nicio bandă, nici pe web', pl.s === 200 && meD4.access && meD4.access.status === 'active' && BA.bandaAcces(meD4) === null && runWS(meD4) === null, J(meD4 && meD4.access));
    LV = labNou(meD, async () => (await D('GET', '/api/me')).j); // telefonul încă ține restanța
    T('…și telefonul rămas deschis o stinge în cel mult un minut (verificarea vede plata)', (await incarcaBanda(LV).verificaAccesul()) === true && LV.cereri === 1);
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Serverul probei: unul singur, pornit la început (se încălzește cât rulează bucățile fără server), oprit la final.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PORT = 3466, TCP = 5466, DIR = '.facturare-tel-db';
const BASE = 'http://127.0.0.1:' + PORT;
let srv = null, jurnal = '', srvIesit = null;

function stergeBaza() {
  const d = path.join(ROOT, DIR);
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(d, { recursive: true, force: true }); if (!fs.existsSync(d)) return; } catch (e) { /* încă ținut de server */ }
    const t = Date.now(); while (Date.now() - t < 300) { /* Windows: fișierele se eliberează greu după oprire */ }
  }
  if (fs.existsSync(d)) console.log('  ! nu am putut șterge ' + d + ' — șterge-l de mână');
}
function pornesteServerul() {
  stergeBaza();
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_facturare_tel',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR + '/pgdata',
  });
  delete env.ANTHROPIC_API_KEY; delete env.DATABASE_URL; delete env.SMTP_HOST;
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  srv.stderr.on('data', (x) => { jurnal = (jurnal + x).slice(-4000); });
  srv.on('exit', (c, s) => { srvIesit = c != null ? c : (s || 'oprit'); });
}
async function peServer(dePeServer) {
  if (!dePeServer.length) return;
  sect('Serverul probei (port ' + PORT + ', baza în ' + DIR + ')');
  let pornit = false;
  // Până la 4 minute: o bază pornită la rece (schema de la zero) poate lua ~90 de secunde pe o mașină obișnuită.
  for (let i = 0; i < 480 && srvIesit === null; i++) {
    try { if ((await fetch(BASE + '/api')).ok) { pornit = true; break; } } catch (e) { /* încă pornește */ }
    await sleep(500);
  }
  T('serverul pornește', pornit, (srvIesit !== null ? 's-a oprit singur (' + srvIesit + '). ' : '') + jurnal.slice(-1500));
  if (!pornit) return;
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  T('intrare ca super-admin', r.ok && !!ck);
  if (!ck) return;
  const R = async (m, url, body) => {
    const x = await fetch(BASE + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) { /* fără corp */ }
    return { s: x.status, j };
  };
  for (const [nume, f] of dePeServer) {
    try { await f({ R, ck }); } catch (e) { rele++; console.log('  ✗ EROARE pe server, în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
}

let terminat = false;
function gata() {
  if (terminat) return; terminat = true;
  const final = () => {
    console.log('\n──────────────────────────────');
    console.log(ok + ' verificări trecute, ' + rele + ' picate');
    process.exit(rele ? 1 : 0);
  };
  if (!srv || srvIesit !== null) { stergeBaza(); return final(); }
  let dus = false;
  const dupa = () => { if (dus) return; dus = true; setTimeout(() => { stergeBaza(); final(); }, 300); };
  srv.once('exit', dupa);
  try { srv.kill(); } catch (e) { dupa(); }
  setTimeout(dupa, 8000);
}
// O eroare scăpată (ex. într-un răspuns venit târziu) nu lasă serverul probei pornit și nu trece drept „reușită".
process.on('uncaughtException', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });
process.on('unhandledRejection', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });

(async () => {
  pornesteServerul();
  const dePeServer = [];
  for (const [nume, f] of [['Facturare', pachetFacturare], ['Fișa firmei', pachetFisa], ['Client nou', pachetClientNou], ['Neasignate', pachetNeasignate], ['Banda de acces', pachetBanda]]) {
    // O bucată care crapă se numără ca picată și nu le ascunde pe celelalte.
    try { const r = await f(); if (typeof r === 'function') dePeServer.push([nume, r]); }
    catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
  await peServer(dePeServer);
})().catch((e) => { rele++; console.log('  ✗ EROARE: ' + ((e && e.stack) || e)); }).then(gata);
