// verify_telefon_lot5.js — telefonul 1.0.7 (lotul 5 de paritate) face ce face web-ul după lucrul lui Alin din 30.09:
// pe aceleași rute, cu aceleași reguli și aceleași cuvinte.
//
//   node verify_telefon_lot5.js
//
// Ce păzește, pe bucăți:
//   0.  TVA de la ANAF (30.09). Pe web, „Client nou" și „Completează" salvează pe firmă dacă e plătitoare de TVA, așa
//       cum a răspuns ANAF (`vat_payer`). El hotărăște „RO" în fața CUI-ului pe factură și codul de TVA din e-Factura.
//       Telefonul arăta statutul, dar nu-l trimitea: firma făcută de pe telefon rămânea „plătitoare" (implicitul din
//       bază), iar factura unei firme neplătitoare pleca la ANAF cu cod de TVA. Regula de pe web: se trimite DOAR când a
//       răspuns ANAF. 0b. O factură ajunsă la ANAF nu se mai anulează (01.10). 0c. Două plase mici din revizia lotului.
//   1.  Facturare — „Generează factură" se deschide PREGĂTITĂ din adresă: proforma aparatelor la „E semnat", factura
//       montajului din anunț (codul paginii, rulat lângă al telefonului, pe aceleași ciorne); „Previzualizează" cu
//       ACELAȘI corp ca „Emite"; secțiunile „Facturi" / „Proforme" / „Montaj de facturat"; nota „La emitere pleacă
//       singură…"; „RO" în fața CUI-ului pe hârtia telefonului; culorile noi, măsurate pe ambele teme.
//   2.  Anunțurile duc la treabă — „aparate noi transmit" → Dispozitive → Neasignate, cu aparatele bifate și firma
//       propusă (banda „Firma e propusă…"); „Montaj de facturat" → factura unică, cu lucrările puse; termenul de
//       montaj → calendarul; push-ul → detaliul anunțului; marcate citite acolo unde detaliul nu se mai desenează.
//   3.  Contractele și fișa firmei — „E semnat" pe un contract cu aparate vândute deschide proforma aparatelor; la un
//       contract semnat, montajul se programează în calendar; banda „Termenul de montaj" pe drum; ✓ „Încasată" pe o
//       proformă spune și ce a plecat (anunțul, emailul, ANAF); „Deschide dosarul clientului" pe rândul ofertei.
//   4.  Montaj — calendarul de montaj (grila lunii, „De programat", formularul, mută / montată / șterge ziua, luna),
//       ritmul instalatorului (lunar / săptămânal), Stocul (nota IMEI, „primite la conectare"); ecranele, desenate.
//
// Regula casei: unde telefonul ține o copie a unei reguli a paginii, proba nu o crede pe cuvânt. Decupează bucata
// paginii (public/index.html) și pe cea a telefonului (TypeScript, tradus), le RULEAZĂ pe aceleași cazuri și cere
// același rezultat.
//
// Pornește UN server (PGlite, port 3480, TCP 5480, baza în .telefon-lot5-db, ștearsă la final și la eroare) pentru
// capetele 1.11, 2.6 și 4.4: firme, contracte, lucrări, facturi și anunțuri adevărate, prin clientul HTTP al
// telefonului, cu trackere adevărate pe TCP. O parte cu server care pică nu le oprește pe celelalte.
//
// În CI (Node 20) compilatorul TypeScript vine de la rădăcină (`npm install --no-save typescript@5`), iar
// mobile/node_modules NU există: modulele telefonului se încarcă atunci cu un preact „de carton", iar verificările care
// chiar DESENEAZĂ un ecran în HTML (preact-render-to-string) se sar, cu un rând „⤼ sărit" pe ecran; restul rulează.
// Pe calculatorul nostru, `PROBA_CA_IN_CI=1 node verify_telefon_lot5.js` face la fel (dosarul nu se atinge).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = __dirname;
// Unele fișiere sunt CRLF pe disc: rândurile se normalizează, ca reperele și expresiile de aici (cu \n) să le prindă.
const citeste = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };

let ok = 0, rele = 0, sarite = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Unelte de decupat ───────────────────────────────────────────────────────────────────────────────────────────
// Bucata dintre două repere: de la `de` (inclus) până la `pana` (exclus); '' când lipsește vreunul.
function taie(src, de, pana) {
  const i = src.indexOf(de); if (i < 0) return '';
  const j = src.indexOf(pana, i + de.length); return j < 0 ? '' : src.slice(i, j);
}
// O funcție întreagă: de la reper până la acolada care o închide; '' când reperul lipsește. Numără acoladele fără să
// sară peste șiruri — dinadins: `esc` din pagină are ghilimele într-o expresie regulată. Bucățile decupate aici n-au
// acolade în șiruri.
function functie(src, reper) {
  const i = src.indexOf(reper); if (i < 0) return '';
  let j = src.indexOf('{', i + reper.length - 1), adanc = 0;
  for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
  return src.slice(i, j + 1);
}
// Fără comentariile JS/TS care încep după un spațiu, un început de rând sau o acoladă (nu și `//` dintr-o adresă).
const faraComentarii = (s) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[\s;{}(])\/\/[^\n]*/g, '$1');
const faraComentariiCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ─── TypeScript și preact: din mobile/node_modules, care în CI NU există ─────────────────────────────────────────
// CI-ul (.github/workflows/ci.yml) nu instalează aplicația de telefon: pune doar compilatorul, la rădăcină.
// PROBA_CA_IN_CI=1 face proba să se poarte la fel pe calculatorul nostru: nu ia nimic din mobile/node_modules.
const CA_IN_CI = process.env.PROBA_CA_IN_CI === '1';
const NM = path.join(ROOT, 'mobile/node_modules');
const dinMobile = (id) => { if (CA_IN_CI) return null; try { return require(path.join(NM, id)); } catch (e) { return null; } };
let ts = dinMobile('typescript'), tsDe = 'din mobile/node_modules';
if (!ts) { try { ts = require('typescript'); tsDe = 'de la rădăcină'; } catch (e) { /* lipsește */ } }
// Doar în proba „ca în CI" de pe calculator: compilatorul există și în CI (la rădăcină), deci nu-l ascundem.
if (!ts && CA_IN_CI) { try { ts = require(path.join(NM, 'typescript')); tsDe = 'din mobile/node_modules (în CI vine de la rădăcină)'; } catch (e) { /* lipsește */ } }
function tsJs(cod, fisier, jsx) {
  const o = { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
  if (jsx) { o.jsx = ts.JsxEmit.ReactJSX; o.jsxImportSource = 'preact'; }
  return ts.transpileModule(cod, { compilerOptions: o, fileName: fisier }).outputText;
}
// preact și desenul lui în HTML (preact-render-to-string): ori toate patru, ori niciunul.
const PREACT = (() => {
  const preact = dinMobile('preact'), hooks = dinMobile('preact/hooks'), jsxRt = dinMobile('preact/jsx-runtime'), rts = dinMobile('preact-render-to-string');
  return preact && hooks && jsxRt && rts ? { preact, hooks, jsxRt, rts } : null;
})();
// Fără ele: un preact „de carton", doar cât să se încarce modulele telefonului. Nodurile au forma celor din preact
// ({ type, props }, copiii în props.children); cârligele dau valoarea de pornire și nu rulează efectele — adică exact
// primul desen, ca pe server. Un ecran desenat în HTML nu iese din el: verificarea aceea se SARE.
const jsxCarton = { jsx: (type, props, key) => ({ type, props: props || {}, key }), Fragment: (p) => p && p.children };
jsxCarton.jsxs = jsxCarton.jsx;
const preactCarton = {
  h: (type, props, ...copii) => ({ type, props: Object.assign({}, props, copii.length ? { children: copii.length > 1 ? copii : copii[0] } : {}) }),
  Fragment: jsxCarton.Fragment,
};
const hooksCarton = {
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useRef: (v) => ({ current: v }),
  useMemo: (f) => f(), useCallback: (f) => f, useEffect: () => {}, useLayoutEffect: () => {},
};
const FARA_DESEN = CA_IN_CI ? 'PROBA_CA_IN_CI=1: mobile/node_modules ascuns, ca în CI' : 'mobile/node_modules nu e instalat — în CI nu se instalează';
// O verificare care chiar are nevoie de ce lipsește se SARE, cu un rând pe ecran: nici nu trece, nici nu pică.
const SARI = (n, motiv) => { sarite++; console.log('  ⤼ sărit: ' + n + '  (' + motiv + ')'); };
console.log('(' + (ts ? 'TypeScript ' + ts.version + ' ' + tsDe : 'fără TypeScript') + '; ' +
  (PREACT ? 'preact din mobile/node_modules: ecranele se desenează' : 'fără preact: ecranele nu se desenează — ' + FARA_DESEN) + ')');

const html = citeste('public/index.html');
const server = citeste('server.js');
const db = citeste('db.js');

sect('0. TVA de la ANAF: telefonul îl salvează pe firmă, ca web-ul');
{
  const clientNou = citeste('mobile/src/screens/ClientNou.tsx');
  const pasi = citeste('mobile/src/components/ContractPasi.tsx');
  const endpoints = citeste('mobile/src/api/endpoints.ts');

  // Web — regula de la care pornim (dacă se schimbă pe web, proba pică și ne spune).
  T('web, „Client nou": trimite vat_payer DOAR când a răspuns ANAF',
    /\(s\.firma\.anaf && !s\.firma\.anaf\.eroare\) \? \{ vat_payer: !!s\.firma\.anaf\.vat_payer \} : \{\}/.test(html));
  T('web, „Completează": ține ce a răspuns ANAF (_dzTva) și îl trimite doar dacă e da/nu',
    /_dzTva = !!a\.vat_payer;/.test(html) && /if \(_dzTva === true \|\| _dzTva === false\) corp\.vat_payer = _dzTva;/.test(html));
  // Serverul primește câmpul pe amândouă căile (nu-l inventăm pe telefon).
  T('serverul primește vat_payer pe PUT /api/companies/:id (updateCompany) și pe /dosar',
    /if \(are\('vat_payer'\) && \(d\.vat_payer === true \|\| d\.vat_payer === false\)\) pune\('vat_payer=\?', d\.vat_payer\);/.test(db)
    && /if \(b\.vat_payer === true \|\| b\.vat_payer === false\) d\.vat_payer = b\.vat_payer;/.test(server));

  // Telefon — „Client nou".
  T('telefon, „Client nou": trimite vat_payer DOAR când a răspuns ANAF (aceeași condiție ca pe web)',
    /\.\.\.\(firma\.anaf && !firma\.anaf\.eroare \? \{ vat_payer: !!firma\.anaf\.vat_payer \} : \{\}\)/.test(clientNou));
  T('…și îl ia din răspunsul ANAF, cum îl arată pe ecran', /anaf: \{ vat_payer: !!j\.vat_payer, inactiva: !!j\.inactiva, radiata: !!j\.radiata \}/.test(clientNou)
    && /Preluat de la ANAF\{a\.vat_payer \? ' · plătitoare de TVA' : ' · neplătitoare de TVA'\}/.test(clientNou));

  // Telefon — „Completează" (fereastra din ContractPasi).
  const i = pasi.indexOf('function CompleteazaFirma('), completeaza = i >= 0 ? pasi.slice(i) : '';
  T('telefon, „Completează": ține ce a răspuns ANAF (null = n-am întrebat)',
    /const \[tva, setTva\] = useState<boolean \| null>\(null\);/.test(completeaza) && /setTva\(!!a\.vat_payer\);/.test(completeaza));
  T('…îl spune pe ecran, ca pe web („plătitoare" / „neplătitoare de TVA")',
    /'Preluat de la ANAF' \+ \(a\.vat_payer \? ' · plătitoare de TVA' : ' · neplătitoare de TVA'\)/.test(completeaza));
  T('…îl trimite doar dacă e da/nu, înainte de „n-ai schimbat nimic" (ANAF singur tot se poate salva)',
    /if \(tva === true \|\| tva === false\) corp\.vat_payer = tva;\n\s*if \(!Object\.keys\(corp\)\.length\)/.test(completeaza));
  T('…și nu-l pierde la închidere fără întrebare', /const schimbat = JSON\.stringify\(f\) !== JSON\.stringify\(start\) \|\| tva !== null;/.test(completeaza));
  T('tipul cererii /dosar are vat_payer', /completeazaDosar: \(companyId: number, b: \{[^\n]*vat_payer\?: boolean \}\) =>/.test(endpoints));
}

sect('0b. O factură ajunsă la ANAF nu se mai anulează — ca pe web (Alin, 01.10)');
{
  const doc = citeste('mobile/src/components/DocumentFactura.tsx');
  T('serverul pune `la_anaf` pe rândurile listei, dintr-o singură regulă (_laAnaf)',
    /function _laAnaf\(inv\) \{ return !!inv && inv\.type !== 'proforma' && \(inv\.efactura_status === 'uploaded' \|\| inv\.efactura_status === 'validated'\); \}/.test(server)
    && /la_anaf: _laAnaf\(v\)/.test(server));
  T('web: „Anulează" doar fără la_anaf', /if \(v\.status !== 'paid' && v\.status !== 'canceled' && !v\.la_anaf\) act \+= '<button class="rax-ico-btn danger" title="Anulează"/.test(html));
  T('telefon: „Anulează" doar fără la_anaf (de pe documentul întreg sau de pe rândul din listă)',
    /inv\.status !== 'paid' && inv\.status !== 'canceled' && !\(inv\.la_anaf \|\| \(inv0 && inv0\.la_anaf\)\) && <button class="btn btn-danger-ghost"[^>]*onClick=\{\(\) => act\('cancel'\)\}>Anulează<\/button>/.test(doc));
}

sect('0c. Revizia lotului 5 (01.10): două plase mici');
{
  const det = citeste('mobile/src/screens/NotifDetail.tsx');
  const bill = citeste('mobile/src/screens/Billing.tsx');
  const efect = (det.match(/useEffect\(\(\) => \{\n[\s\S]*?\n  \}, \[id\]\);/) || [''])[0];
  T('detaliul anunțului nu mai mută adresa dacă omul a plecat între timp (let viu … if (!viu) return … viu = false)',
    /let viu = true;/.test(efect) && /Api\.notifContext\(id\)\.then\(\(x: any\) => \{\n\s*if \(!viu\) return;/.test(efect) && /return \(\) => \{ viu = false; \};/.test(efect));
  T('„Montaj de facturat" căzut spune eroarea, nu „· 0" și „nimic de facturat"',
    /\.catch\(\(e: any\) => \(\{ __eroare: \(e && e\.message\) \|\| 'eroare' \}\)\)/.test(bill) && /setMfErr\(String\(\(md as any\)\.__eroare\)\)/.test(bill)
    && /k === 'montaj' && mfErr \? 'Montaj de facturat' : etichetaSectiune\(k, numere\)/.test(bill)
    && /\{err \? <div class="bill-avert rau">Nu s-a putut încărca montajul de facturat: \{err\}<\/div>/.test(bill));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. Facturare (Billing.tsx, lib/factura.ts, lib/descarcaPost.ts, DocumentFactura.tsx) — id-urile din inventarul lotului:
//   L4 / L9 (partea din Facturare) — adresa „/billing?factura=…&fel=unica&tip=proforma&aparate=1" sau „…&lucrari=12,13"
//        se citește înapoi (pregatireDinAdresa), iar fereastra se deschide PREGĂTITĂ exact ca pe web: codul paginii
//        (raxProformaLaSemnare, raxFacturaMontaj, raxGenDraft, raxGiTip, _giPuneContract, _giPuneLucrare, _giCorp) RULAT
//        în vm, lângă pregatesteCiorna + corpEmitere de pe telefon, pe aceleași ciorne.
//   L5  — „Previzualizează": ACELAȘI corp ca „Emite", pe ruta paginii; lib/descarcaPost.ts deschide PDF-ul ca „Vezi".
//   L6  — secțiunile „Facturi · N" / „Proforme · N (M de încasat)" / „Montaj de facturat · N": raxRenderInvoices rulat.
//   L7  — „Montaj de facturat": _raxMontajFactHtml rulat, lângă randuriMontajFact și cuvintele telefonului.
//   L12 — nota „La emitere pleacă singură…": _giRenderLines rulat, lângă notaLaEmitere.
//   Mărunțiș — „RO" în fața CUI-ului pe hârtia telefonului: cuiAfisat din factura_pdf.js rulat, lângă cel al telefonului.
//   Pe server (1.11): o firmă cu contract (aparate în Anexa nr. 2) și lucrări montate → „Montaj de facturat" → adresa
//   din anunț → ciorna → pregatesteCiorna → corpEmitere → previzualizare (PDF, niciun document nou) → emitere
//   (lucrările trec pe „facturat clientului") → anunțul vechi spune că nu mai sunt de facturat; apoi proforma
//   aparatelor, la fel.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function parteaFacturare() {
  sect('1. Facturare: fereastra pregătită din adresă, „Previzualizează", secțiunile, „Montaj de facturat"');
  // O componentă TSX întreagă: semnătura poate avea acolade (parametrii destructurați, tipul lor), deci corpul începe la
  // acolada de după „) {" de la capătul semnăturii.
  function corpTsx(src, reper) {
    const i = src.indexOf(reper); if (i < 0) return '';
    const re = /\)(?:\s*:\s*[^{\n]+)?\s*\{\n/g; re.lastIndex = i;
    const x = re.exec(src); if (!x) return '';
    let j = x.index + x[0].length - 2, adanc = 0;
    for (; j < src.length; j++) { if (src[j] === '{') adanc++; else if (src[j] === '}') { adanc--; if (!adanc) break; } }
    return src.slice(i, j + 1);
  }
  const dezEsc = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // TypeScript-ul telefonului, tradus și rulat în vm.
  function modul(cod, fisier, cereri) {
    const m = { exports: {} };
    const ctx = vm.createContext({ module: m, exports: m.exports, console,
      require: (id) => { if (cereri && Object.prototype.hasOwnProperty.call(cereri, id)) return cereri[id]; throw new Error('require neașteptat în ' + fisier + ': ' + id); } });
    vm.runInContext(cod, ctx, { filename: fisier });
    return m.exports;
  }

  const libFactura = citeste('mobile/src/lib/factura.ts');
  const billing = citeste('mobile/src/screens/Billing.tsx');
  const billingCss = citeste('mobile/src/screens/billing.css');
  const docFactura = citeste('mobile/src/components/DocumentFactura.tsx');
  const endpoints = citeste('mobile/src/api/endpoints.ts');
  const descarcaPost = citeste('mobile/src/lib/descarcaPost.ts');
  const exportTs = citeste('mobile/src/lib/export.ts');

  let numar = {}, F = {};
  try { numar = modul(tsJs(citeste('mobile/src/lib/numar.ts'), 'numar.ts'), 'lib/numar.ts'); } catch (e) { console.log('    (numar.ts: ' + e.message + ')'); }
  try { F = modul(tsJs(libFactura, 'factura.ts'), 'lib/factura.ts', { './numar': numar }); } catch (e) { console.log('    (factura.ts: ' + e.message + ')'); }
  const FUNCTII = ['rutaFactura', 'pregatireDinAdresa', 'pregatesteCiorna', 'lucrariLipsaText', 'notaLaEmitere', 'numereSectiuni', 'etichetaSectiune',
    'documenteSectiune', 'golSectiune', 'randuriMontajFact', 'cuiAfisat', 'corpEmitere', 'ciornaDinRaspuns', 'montajeDeTrimis'];
  T('lib/factura.ts se traduce și rulează, cu funcțiile lotului 5', FUNCTII.every((k) => typeof F[k] === 'function'), FUNCTII.filter((k) => typeof F[k] !== 'function').join(', '));
  // money2 din hârtia documentului (aceeași funcție pe care o folosește secțiunea montajului).
  let money2 = null;
  try { const c = vm.createContext({}); vm.runInContext(tsJs(((/export const money2 = [^\n]*;/.exec(docFactura) || [''])[0]).replace('export ', ''), 'money2.ts') + '\nthis.f = money2;', c); money2 = c.f; } catch (e) { console.log('    (money2: ' + e.message + ')'); }
  T('găsesc money2 în DocumentFactura.tsx', typeof money2 === 'function');

  // Bucățile paginii.
  const W = {
    esc: functie(html, 'function esc(s) {'),
    rDe: functie(html, 'function _rDe(n) {'),
    raxDe: functie(html, 'function _raxDe(n) {'),
    luni: (/var _GI_LUNI = \[[^\]]*\];/.exec(html) || [''])[0],
    luna: functie(html, 'function _giLunaText(cheie) {'),
    invFmtD: functie(html, 'function _invFmtD(ts) {'),
    invMoney: functie(html, 'function _invMoney(n) {'),
    recalc: functie(html, 'function _giRecalcLine(l) {'),
    bloc: taie(html, '// ── începe „factura montajului, strânsă" ──', '// ── sfârșit „factura montajului, strânsă" ──'),
    genDraft: functie(html, 'window.raxGenDraft = async function () {'),
    giTip: functie(html, 'window.raxGiTip = function (t) {'),
    puneContract: functie(html, 'window._giPuneContract = function (ce) {'),
    puneLucrare: functie(html, 'window._giPuneLucrare = function (id) {'),
    proformaLaSemnare: functie(html, 'window.raxProformaLaSemnare = async function (companyId) {'),
    facturaMontaj: functie(html, 'window.raxFacturaMontaj = async function (companyId, lucrari, dinAnunt) {'),
    corp: functie(html, 'function _giCorp() {'),
    openGen: functie(html, 'window.raxOpenGenInvoice = function (companyId, fel) {'),
    render: functie(html, 'window.raxRenderInvoices = function () {'),
    mfHtml: functie(html, 'function _raxMontajFactHtml() {'),
    hartieBtns: functie(html, 'function _invHartieBtns(url, pf) {'),
    invSt: (/var _INV_ST = \{[^\n]*\};/.exec(html) || [''])[0],
    surse: functie(html, 'function _giSurseHtml() {'),
    renderLines: functie(html, 'function _giRenderLines() {'),
    previz: functie(html, 'window.raxGenPrevizualizare = async function (btn) {'),
    issue: functie(html, 'window.raxGenIssue = async function (btn) {'),
  };
  const lipsaW = Object.keys(W).filter((k) => !W[k]);
  T('găsesc în pagină toate bucățile de rulat', !lipsaW.length, lipsaW.join(', '));
  const Q = (u) => Object.fromEntries(new URL('http://x' + u).searchParams);

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function adresa() {
    sect('1.1 Adresa: rutaFactura → pregatireDinAdresa (lotul 5, capătul din Facturare)');
    {
      const cazuri = [
        ['proforma aparatelor (la „E semnat")', F.rutaFactura(7, 'unica', { tip: 'proforma', aparate: true }), { tip: 'proforma', aparate: true, lucrari: [] }],
        ['factura montajului (anunțul)', F.rutaFactura(7, 'unica', { lucrari: [12, 13] }), { tip: 'invoice', aparate: false, lucrari: [12, 13] }],
        ['lucrări stricate în adresă se aruncă', F.rutaFactura(7, 'unica', { lucrari: ['5', 'x', 0, -2, 9] }), { tip: 'invoice', aparate: false, lucrari: [5, 9] }],
        ['adresa de dinainte (unica, fără nimic) → nimic de pregătit', F.rutaFactura(7, 'unica'), null],
        ['abonamentul nu se pregătește niciodată', F.rutaFactura(7, 'abonament', { tip: 'proforma', aparate: true, lucrari: [1] }), null],
        ['fără fel', F.rutaFactura(7), null],
        ['„tip" și „aparate" fără fel=unica (adresă scrisă de mână) → nimic', '/billing?factura=7&tip=proforma&aparate=1', null],
        ['aparate=0 → nimic', '/billing?factura=7&fel=unica&aparate=0', null],
        ['doar tip=proforma → proforma, fără nimic pus', '/billing?factura=7&fel=unica&tip=proforma', { tip: 'proforma', aparate: false, lucrari: [] }],
      ];
      cazuri.forEach(([nume, adr, astept]) => T(nume + ' (' + adr + ')', J(F.pregatireDinAdresa(Q(adr))) === J(astept), J(F.pregatireDinAdresa(Q(adr)))));
      T('adresa fără `opt` a rămas exact cea de dinainte', F.rutaFactura(7, 'unica') === '/billing?factura=7&fel=unica' && F.rutaFactura(7) === '/billing?factura=7');
      T('pregatireDinAdresa nu cade pe o adresă goală', F.pregatireDinAdresa(undefined) === null && F.pregatireDinAdresa({}) === null);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  async function fereastraPregatita() {
    sect('1.2 Fereastra deschisă pregătită: telefonul = pagina (raxProformaLaSemnare / raxFacturaMontaj, rulate)');
    // Ce face raxOpenGenInvoice cu STAREA (DOM-ul lui nu contează aici): felul, factura fiscală, ciorna golită.
    T('pe web, raxOpenGenInvoice: _giFel din felul cerut, _giTip = factură fiscală, ciorna golită',
      /_giFel = fel === 'unica' \? 'unica' : 'abonament'; _giTip = 'invoice'; _giState = null;/.test(W.openGen));
    function webFereastra(draft) {
      const el = {};
      const nou = (id) => (el[id] = el[id] || { id, value: '', innerHTML: '', style: {}, disabled: false });
      const ctx = vm.createContext({ console, JSON, Math, Number, String, Date, Array, Object, Promise, parseInt });
      ctx.window = ctx;
      ctx.document = { getElementById: (id) => el[id] || null, querySelectorAll: () => [] };
      ctx.companiesCache = [{ id: 7, name: 'Transport SRL' }, { id: 8, name: 'Alta SRL' }];
      ctx._CERERI = [];
      ctx.fetch = async (url, o) => { ctx._CERERI.push({ url, body: o && o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => JSON.parse(JSON.stringify(draft)) }; };
      ctx._NOU = nou;
      vm.runInContext([
        'var _giState = null, _giFel = "abonament", _giTip = "invoice", _raxInvSect = "facturi";',
        'function _giArataFel() {}', 'function raxAdminTab() {}',
        // _giRenderLines desenează fereastra; aici contează doar că de acum există locul mesajului (#rax-gi-msg).
        'function _giRenderLines() { _NOU("rax-gi-msg"); }',
        'window.raxOpenGenInvoice = function (companyId, fel) { var co = companiesCache.filter(function (c) { return String(c.id) === String(companyId); })[0] || companiesCache[0]; _NOU("rax-gi-co").value = String(co.id); _NOU("rax-gi-result"); _giFel = fel === "unica" ? "unica" : "abonament"; _giTip = "invoice"; _giState = null; };',
        W.esc, W.rDe, W.raxDe, W.invFmtD, W.invMoney, W.recalc, W.bloc, W.genDraft, W.giTip, W.puneContract, W.puneLucrare,
        W.proformaLaSemnare, W.facturaMontaj, W.corp, 'this._corp = _giCorp;',
      ].join('\n'), ctx);
      ctx._msg = () => (el['rax-gi-msg'] ? dezEsc(el['rax-gi-msg'].innerHTML) : '');
      return ctx;
    }
    const rand = (l) => [l.desc, Number(l.qty), Number(l.unitPrice), l.net, l.vat];
    const zi = (an, l, z) => new Date(an, l - 1, z, 19, 0).getTime();
    const iss = { name: 'RA TRACKS SRL', cui: 'RO999' };
    const L = (id, d, n, gps, can) => ({ id, data: d, status: 'executat', partener: 'Montaj Vest', masini: n,
      linii: [{ desc: 'Instalare dispozitiv GPS', qty: n, unitPrice: gps }].concat(can ? [{ desc: 'Instalare modul LV-CAN', qty: n, unitPrice: can }] : []),
      total: n * gps + (can ? n * can : 0) });
    const aparate = [{ desc: 'Echipament — Teltonika FMC130', qty: 3, unitPrice: 279.32, pretEur: 55 }, { desc: 'Echipament — LV-CAN200', qty: 3, unitPrice: 304.71, pretEur: 60 }];
    const dcPlin = { contract: { id: 3, number: 'RAT-C-2027-0001', status: 'activ' }, curs: 5.0785, aparate, montaj: [{ desc: 'Instalare dispozitiv GPS', qty: 3, unitPrice: 100 }],
      lucrari: [L(15, zi(2027, 1, 15), 10, 100, 60), L(30, zi(2027, 1, 30), 15, 100, 60), L(40, zi(2027, 2, 10), 5, 90, 0)] };
    const draft = (dc, rata) => ({ fel: 'unica', luna: null, lines: [], issuer: iss, vatRate: rata == null ? 19 : rata, client: { name: 'Transport SRL' }, dinContract: dc });
    let nCazuri = 0;
    async function compara(nume, d, fel, arg) {
      nCazuri++;
      const w = webFereastra(d);
      let adresa;
      if (fel === 'proforma') { await w.raxProformaLaSemnare(7); adresa = F.rutaFactura(7, 'unica', { tip: 'proforma', aparate: true }); }
      else { await w.raxFacturaMontaj(7, arg, true); adresa = F.rutaFactura(7, 'unica', { lucrari: arg }); }
      const p = F.pregatireDinAdresa(Q(adresa));
      const r = F.pregatesteCiorna(F.ciornaDinRaspuns(JSON.parse(JSON.stringify(d)), 7, 'unica'), p);
      const S = r.S, WS = w._giState || { lines: [], montaje: [], nota: '' };
      T(nume + ': aceeași ciornă cerută (firma și factura unică)', w._CERERI.length === 1 && J(w._CERERI[0].body) === J({ companyId: 7, fel: 'unica' }) &&
        /fel === 'unica' \? \{ companyId, fel \}/.test(endpoints), J(w._CERERI.map((x) => x.body)));
      T(nume + ': același document (' + w._giTip + ')', w._giTip === p.tip, w._giTip + ' ≠ ' + p.tip);
      T(nume + ': aceleași rânduri', J(WS.lines.map(rand)) === J(S.lines.map(rand)), J(WS.lines.map(rand)) + ' ≠ ' + J(S.lines.map(rand)));
      T(nume + ': aceeași mențiune', (WS.nota || '') === (S.nota || ''), J(WS.nota) + ' ≠ ' + J(S.nota));
      // Din 01.10 (lista lui Robert, pct. 6) pagina nu mai ține o listă de lucrări separată: `montaje` iese din _giCorp, din
      // lucrările aflate întregi pe factură — ca pe telefon.
      const montajeWeb = w._giState ? (w._corp().montaje || []) : [];
      T(nume + ': aceleași lucrări pleacă în `montaje`', J(montajeWeb.slice().sort()) === J(F.montajeDeTrimis(S).slice().sort()), J(montajeWeb) + ' ≠ ' + J(F.montajeDeTrimis(S)));
      const mesajTel = r.lipsa ? F.lucrariLipsaText(r.lipsa) : '';
      T(nume + ': același mesaj despre lucrările care nu mai sunt de facturat: ' + J(mesajTel), w._msg() === mesajTel, J(w._msg()) + ' ≠ ' + J(mesajTel));
      // Corpul care pleacă la „Previzualizează" și la „Emite": _giCorp (pagina) = corpEmitere (telefonul).
      const cw = w._corp(), ct = F.corpEmitere(S, p.tip);
      const esential = (b) => ({ companyId: b.companyId, fel: b.fel, luna: b.luna, tip: b.tip, note: b.note, montaje: (b.montaje || []).slice().sort(),
        lines: (b.lines || []).map((l) => [l.desc, Number(l.qty), Number(l.unitPrice), l.net, l.vat]) });
      T(nume + ': același corp la previzualizare și la emitere', J(esential(cw)) === J(esential(ct)), J(esential(cw)) + ' ≠ ' + J(esential(ct)));
    }
    const pasi = [
      ['proforma, contract cu aparate', draft(dcPlin), 'proforma'],
      ['proforma, contract fără aparate în Anexa nr. 2', draft(Object.assign({}, dcPlin, { aparate: [] })), 'proforma'],
      ['proforma, firmă fără contract', draft(null), 'proforma'],
      ['proforma, TVA 21%', draft(dcPlin, 21), 'proforma'],
      ['montaj: două zile, cerute în altă ordine', draft(dcPlin), 'montaj', [30, 15]],
      ['montaj: trei zile, una cu alt preț (rând separat)', draft(dcPlin), 'montaj', [15, 40, 30]],
      ['montaj: una facturată între timp', draft(dcPlin), 'montaj', [15, 99]],
      ['montaj: niciuna nu mai e de facturat', draft(dcPlin), 'montaj', [98, 99]],
      ['montaj: aceeași lucrare cerută de două ori', draft(dcPlin), 'montaj', [15, 15]],
      ['montaj: firmă fără contract (nicio lucrare în ciornă)', draft(null), 'montaj', [15, 30]],
      ['montaj: ciornă fără lucrări', draft(Object.assign({}, dcPlin, { lucrari: [] })), 'montaj', [15]],
    ];
    for (const [n, d, fel, arg] of pasi) await compara(n, d, fel, arg);
    T('pagina și telefonul, pe ' + nCazuri + ' cazuri (proformă + montaj)', nCazuri === pasi.length);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function sectiunile() {
    sect('1.3 Secțiunile listei: „Facturi · N" / „Proforme · N (M de încasat)" / „Montaj de facturat · N" (raxRenderInvoices, rulat)');
    function webLista(docs, mf, sectiune) {
      const box = { innerHTML: '' };
      const ctx = vm.createContext({ console, JSON, Math, Number, String, Date, _DOCS: docs, _MF: mf, _SECT: sectiune });
      ctx.window = ctx;
      ctx.document = { getElementById: (id) => (id === 'rax-invoices' ? box : null) };
      vm.runInContext([W.esc, W.luni, W.luna, W.invFmtD, W.invMoney, W.hartieBtns, W.invSt,
        'var _raxInvoices = _DOCS, _raxMontajFact = _MF, _raxInvSect = _SECT;', W.mfHtml, W.render, 'raxRenderInvoices();'].join('\n'), ctx);
      return box.innerHTML;
    }
    const ZI = 864e5, acum = Date.now();
    const d = (id, nr, type, status, extra) => Object.assign({ id, full_number: nr, type, status, company_id: 7, company_name: 'Transport SRL',
      issue_date: acum - id * ZI, due_date: acum + ZI, subtotal: 100, vat_amount: 19, total: 119, fel: type === 'proforma' ? 'unica' : 'abonament', luna: '2026-09' }, extra || {});
    const seturi = [
      ['gol', []],
      ['doar facturi', [d(1, 'RAT-2026-00001', 'invoice', 'issued'), d(2, 'RAT-2026-00002', 'invoice', 'paid')]],
      ['doar proforme, una de încasat', [d(3, 'PF-2026-00001', 'proforma', 'issued'), d(4, 'PF-2026-00002', 'proforma', 'paid', { factura_id: 9 }), d(5, 'PF-2026-00003', 'proforma', 'canceled')]],
      ['amestecat (storno, anulate, proforme încasate)', [d(1, 'RAT-2026-00001', 'invoice', 'issued'), d(3, 'PF-2026-00001', 'proforma', 'issued'),
        d(6, 'RAT-2026-00003', 'credit_note', 'issued'), d(7, 'PF-2026-00004', 'proforma', 'sent'), d(8, 'RAT-2026-00004', 'invoice', 'canceled'), d(4, 'PF-2026-00002', 'proforma', 'paid', { factura_id: 9 })]],
    ];
    const mfuri = [{ gata: [], inCurs: [] }, { gata: [{ company_id: 7, lucrari: [1] }, { company_id: 8, lucrari: [2, 3] }], inCurs: [{ company_id: 9, lucrari: [4] }] }, null];
    let n = 0;
    for (const [nume, docs] of seturi) for (const mf of mfuri) for (const k of ['facturi', 'proforme', 'montaj']) {
      const h = webLista(docs, mf || { gata: [], inCurs: [] }, k);
      const et = {}; for (const m of h.matchAll(/onclick="raxInvSectiune\('(\w+)'\)">([^<]*)<\/button>/g)) et[m[1]] = m[2];
      const nr = F.numereSectiuni(docs, mf);
      const eticheteTel = {}; F.SECTIUNI.forEach((s) => { eticheteTel[s] = F.etichetaSectiune(s, nr); });
      T(nume + ' / ' + (mf ? mf.gata.length + ' firme cu montaj' : 'montaj necitit') + ' / ' + k + ': aceleași trei etichete, în aceeași ordine',
        J(Object.keys(et)) === J(F.SECTIUNI) && J(et) === J(eticheteTel), J(et) + ' ≠ ' + J(eticheteTel));
      if (k !== 'montaj') {
        const tbody = (h.split('<tbody>')[1] || '').split('</tbody>')[0];
        const nrW = tbody.split('</tr>').filter((x) => x.indexOf('<tr>') >= 0).map((x) => dezEsc((/<td[^>]*>([\s\S]*?)<\/td>/.exec(x) || [])[1] || ''));
        const nrT = F.documenteSectiune(docs, k).map((v) => v.full_number);
        T(nume + ' / ' + k + ': aceleași documente, în aceeași ordine', J(nrW) === J(nrT), J(nrW) + ' ≠ ' + J(nrT));
        if (!nrT.length) {
          const gol = dezEsc((/<div class="rax-co-meta" style="padding:12px;">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '');
          T(nume + ' / ' + k + ': același text pe lista goală: ' + J(F.golSectiune(k)), gol === F.golSectiune(k), J(gol));
        }
      }
      n++;
    }
    T('etichetele, pe ' + n + ' de liste', n === seturi.length * mfuri.length * 3);
    T('„Montaj de facturat · N" numără FIRMELE gata (nu lucrările, nu „în curs")', F.etichetaSectiune('montaj', F.numereSectiuni([], mfuri[1])) === 'Montaj de facturat · 2');

    sect('1.4 „Montaj de facturat": aceleași rânduri și aceleași cuvinte (_raxMontajFactHtml, rulat)');
    const g = (id, nume, text, total, lucrari) => ({ company_id: id, company_name: nume, text, total, lucrari, masini: 3 });
    const mfCazuri = [
      ['gol', { gata: [], inCurs: [] }],
      ['doar gata', { gata: [g(7, 'Transport SRL', '3 mașini montate în august 2026 (facturare lunară)', 480, [1, 2]), g(8, null, 'Lucrări de montaj în august 2026 (Montaj Vest · facturare lunară)', 1234.5, [3])], inCurs: [] }],
      ['gata și în curs, cu nume care se scapă (&, <)', { gata: [g(7, 'A & B <SRL>', '1 mașină montată în 21–27.09.2026 (Montaj Vest · facturare săptămânală)', 160, [1])],
        inCurs: [g(9, 'Firma „Nouă"', '2 mașini montate în septembrie 2026 (facturare lunară) — se facturează de pe 01.10.2026', 320.4, [5, 6])] }],
      ['doar în curs', { gata: [], inCurs: [g(9, 'Firma C', 'x', 0, [5])] }],
    ];
    for (const [nume, mf] of mfCazuri) {
      const h = webLista([], mf, 'montaj');
      const sub = dezEsc((/<div class="rax-mf-sub">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '');
      T(nume + ': explicația de sus e aceeași', sub === F.MONTAJ_FACT_SUB, J(sub));
      const randuriW = [...h.matchAll(/<div class="rax-mf-rand( curs)?"><div class="rax-mf-t"><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/div><div class="rax-mf-s">([\s\S]*?) lei <span>fără TVA<\/span><\/div><button class="rax-btn( primary)?" onclick="raxFacturaMontaj\((\d+), \[([\d,]*)\]\)"><i class="fas fa-file-invoice-dollar"><\/i> ([^<]*)<\/button><\/div>/g)]
        .map((m) => ({ curs: !!m[1], nume: dezEsc(m[2]), text: dezEsc(m[3]), suma: m[4], primar: !!m[5], companyId: Number(m[6]), lucrari: m[7] ? m[7].split(',').map(Number) : [], buton: m[8] }));
      const R = F.randuriMontajFact(mf), randuriT = R.gata.concat(R.inCurs).map((r) => ({ curs: r.curs, nume: r.nume, text: r.text, suma: money2 ? money2(r.total) : '?', primar: !r.curs, companyId: r.companyId, lucrari: r.lucrari, buton: r.buton }));
      T(nume + ': aceleași rânduri (firma, textul, suma fără TVA, butonul, lucrările), în aceeași ordine', J(randuriW) === J(randuriT), J(randuriW) + ' ≠ ' + J(randuriT));
      const antet = dezEsc((/<div class="rax-mf-h">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '');
      T(nume + ': antetul „în curs" doar când sunt rânduri în curs, cu aceleași cuvinte', mf.inCurs.length ? antet === F.MONTAJ_FACT_IN_CURS : antet === '', J(antet));
      const gol = dezEsc((/<div class="rax-co-meta" style="padding:8px 0 12px;">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '');
      T(nume + ': textul „nimic gata" doar fără rânduri gata', mf.gata.length ? gol === '' : gol === F.MONTAJ_FACT_GOL, J(gol));
      if (mf.inCurs.length && mf.gata.length) T(nume + ': întâi cele gata, apoi antetul, apoi cele în curs', h.indexOf('rax-mf-rand"') < h.indexOf('rax-mf-h') && h.indexOf('rax-mf-h') < h.indexOf('rax-mf-rand curs'));
    }
    // Pe telefon: ecranul desenează din randuriMontajFact, cu cuvintele din lib/factura.ts, în aceeași ordine.
    const mfT = corpTsx(billing, 'function MontajDeFacturat(');
    T('Billing.tsx: MontajDeFacturat desenează din randuriMontajFact (nicio listă de cuvinte a lui)', /const \{ gata, inCurs \} = randuriMontajFact\(d\);/.test(mfT) &&
      /\{money2\(r\.total\)\} lei <span>fără TVA<\/span>/.test(mfT) && /\{r\.buton\}/.test(mfT) && /\{r\.nume\}/.test(mfT) && /\{r\.text\}/.test(mfT));
    T('Billing.tsx: explicația, rândurile gata, antetul „în curs", rândurile în curs — în ordinea paginii',
      mfT.indexOf('{MONTAJ_FACT_SUB}') > 0 && mfT.indexOf('{MONTAJ_FACT_SUB}') < mfT.indexOf('gata.map(rand)') && mfT.indexOf('gata.map(rand)') < mfT.indexOf('{MONTAJ_FACT_IN_CURS}') &&
      mfT.indexOf('{MONTAJ_FACT_IN_CURS}') < mfT.indexOf('inCurs.map(rand)') && /\{MONTAJ_FACT_GOL\}/.test(mfT));
    T('Billing.tsx: butonul plin (verde) doar pe rândurile gata, ca pe web; cel „în curs" e chenar punctat', /class=\{'btn bill-mf-b' \+ \(r\.curs \? '' : ' btn-primary'\)\}/.test(mfT) &&
      /class=\{'bill-mf' \+ \(r\.curs \? ' curs' : ''\)\}/.test(mfT) && /\.bill-mf\.curs \{ border-style: dashed; background: transparent; \}/.test(billingCss));
    T('„Pregătește factura" deschide fereastra facturii pe firma rândului, factură unică, cu lucrările rândului (ca raxFacturaMontaj)',
      /function facturaMontaj\(r: RandMontajFact\) \{\s*if \(!\(companies \|\| \[\]\)\.some\(\(c\) => c\.id === r\.companyId\)\) \{ showToast\('Firma nu se găsește în lista de facturare\.', true\); return; \}\s*setPreg\(\{ tip: 'invoice', aparate: false, lucrari: r\.lucrari \}\);\s*setGen\(\{ cid: r\.companyId, fel: 'unica' \}\);/.test(billing) &&
      /<MontajDeFacturat d=\{mf\} err=\{mfErr\} onFactura=\{facturaMontaj\} \/>/.test(billing));
    T('…iar pe web „Pregătește factura" / „Facturează acum" cheamă aceeași funcție ca anunțul (raxFacturaMontaj)', /onclick="raxFacturaMontaj\(' \+ Number\(g\.company_id\) \+ ', \[' \+ \(g\.lucrari \|\| \[\]\)\.map\(Number\)\.join\(','\) \+ '\]\)"/.test(W.mfHtml));
    T('Facturare cere „Montaj de facturat" de la server la fiecare încărcare (ca raxLoadInvoices), fără să cadă dacă ruta nu răspunde',
      // Revizia lotului 5 (01.10): ruta căzută NU se mai arată ca „0" și „nimic de facturat" (pe web, da) — se spune eroarea.
      /Api\.montajDeFacturat\(\)\.catch\(\(e: any\) => \(\{ __eroare: \(e && e\.message\) \|\| 'eroare' \}\)\)/.test(billing)
      && /if \(md && \(md as any\)\.__eroare\) \{ setMfErr\(String\(\(md as any\)\.__eroare\)\); setMf\(\{ gata: \[\], inCurs: \[\] \}\); \}/.test(billing)
      && /else \{ setMfErr\(''\); setMf\(\{ gata: \(md && \(md as any\)\.gata\) \|\| \[\], inCurs: \(md && \(md as any\)\.inCurs\) \|\| \[\] \}\); \}/.test(billing)
      && /\{err \? <div class="bill-avert rau">Nu s-a putut încărca montajul de facturat: \{err\}<\/div>/.test(billing) &&
      /montajDeFacturat: \(\) => api<\{ gata: any\[\]; inCurs: any\[\] \}>\('\/api\/montaj\/de-facturat'\),/.test(endpoints) &&
      /fetch\('\/api\/montaj\/de-facturat'/.test(functie(html, 'window.raxLoadInvoices = async function () {')) &&
      /app\.get\('\/api\/montaj\/de-facturat', requireAuth, requireSuperadmin,/.test(server));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function restul() {
    sect('1.5 Secțiunile pe ecran (Billing.tsx): titlul paginii, pastilele, lista pe secțiune');
    const sup = corpTsx(billing, 'function SuperBilling(');
    T('titlul listei e cel de pe web: „Facturi și proforme" (nu „Facturi fiscale")', /<div class="mn-sec">Facturi și proforme<\/div>/.test(sup) && !/Facturi fiscale<\/div>/.test(billing) &&
      /Facturi și proforme <span id="rax-ef-status"/.test(html));
    T('trei pastile, din SECTIUNI, cu eticheta din etichetaSectiune; cea aleasă e „on" și spusă cititorului de ecran',
      /\{SECTIUNI\.map\(\(k\) => \(\s*<button type="button" class=\{'fd-chip' \+ \(sect === k \? ' on' : ''\)\} aria-pressed=\{sect === k\} onClick=\{\(\) => alegeSect\(k\)\}>\{k === 'montaj' && mfErr \? 'Montaj de facturat' : etichetaSectiune\(k, numere\)\}<\/button>/.test(sup) &&
      /const numere = numereSectiuni\(invoices, mf\);/.test(sup));
    T('lista arată documentele secțiunii (documenteSectiune) și textul listei goale (golSectiune); montajul are rândurile lui',
      /const docsSect = documenteSectiune\(invoices, sect\);/.test(sup) && /\{golSectiune\(sect\)\}/.test(sup) && /sect === 'montaj'\s*\? <MontajDeFacturat/.test(sup) &&
      /docsSect\.map\(\(v\) => <FiscalRow v=\{v\} onClick=\{\(\) => setFview\(v\)\} \/>\)/.test(sup));
    T('secțiunea aleasă se ține cât trăiește aplicația (ca _raxInvSect pe web)', /let sectiuneaAleasa: Sectiune = 'facturi';/.test(billing) &&
      /const \[sect, setSect\] = useState<Sectiune>\(sectiuneaAleasa\);/.test(sup) && /const alegeSect = \(k: Sectiune\) => \{ sectiuneaAleasa = k; setSect\(k\); \};/.test(sup) &&
      /var _raxInvSect = 'facturi';/.test(html));
    T('pastilele sunt .fd-chip (fondator.css, cu perechea pe tema luminoasă), iar Facturare încarcă fondator.css', /import '\.\/fondator\.css';/.test(billing) &&
      /\.fd-chip\.on \{[^}]*color: var\(--fd-ok\)/.test(citeste('mobile/src/screens/fondator.css')));

    sect('1.6 Adresa → fereastra pregătită (Billing.tsx): o singură dată, adresa curățată întâi, pe firma din listă');
    const bil = corpTsx(billing, 'export function Billing() {');
    T('Billing citește pregătirea din adresă (pregatireDinAdresa), doar la noi, și o dă ecranului',
      /const facturaPregatire = isSuper \? pregatireDinAdresa\(q\) : null;/.test(bil) && /<SuperBilling facturaPentru=\{facturaPentru\} facturaFel=\{facturaFel\} facturaPregatire=\{facturaPregatire\} \/>/.test(bil));
    const efect = taie(sup, 'useEffect(() => {\n    if (!facturaPentru', '}, [facturaPentru, companies]);');
    T('efectul: adresa se curăță ÎNAINTE, firma trebuie să fie în listă, apoi pregătirea, apoi fereastra',
      efect.indexOf("loc.route('/billing', true);") > 0 && efect.indexOf("loc.route('/billing', true);") < efect.indexOf('companies.some((c) => c.id === facturaPentru)') &&
      efect.indexOf('companies.some((c) => c.id === facturaPentru)') < efect.indexOf('setPreg(facturaPregatire);') &&
      efect.indexOf('setPreg(facturaPregatire);') < efect.indexOf('setGen({ cid: facturaPentru, fel: facturaFel });'), efect.slice(0, 300));
    T('sub fereastră, Facturarea stă pe secțiunea documentului pregătit (montajul, ca pe web; proformele, unde apare proforma emisă)',
      /if \(facturaPregatire && facturaPregatire\.lucrari\.length\) alegeSect\('montaj'\);\s*else if \(facturaPregatire && facturaPregatire\.tip === 'proforma'\) alegeSect\('proforme'\);/.test(efect) &&
      /if \(dinAnunt && window\.raxAdminTab\) \{ _raxInvSect = 'montaj';/.test(W.facturaMontaj));
    T('pregătirea ajunge în fereastră și se golește la orice închidere (X, emisă, „Date emitent"); „Generează factură" de sus o golește',
      /felInitial=\{gen\.fel\} pregatire=\{preg\}/.test(sup) && /const inchideGen = \(\) => \{ setGen\(null\); setPreg\(null\); \};/.test(sup) &&
      /onClose=\{inchideGen\} onIssued=\{\(\) => \{ inchideGen\(\); reload\(\); \}\}/.test(sup) && /onIssuer=\{\(\) => \{ inchideGen\(\); setEditIss\(true\); \}\}/.test(sup) &&
      /onClick=\{\(\) => \{ setPreg\(null\); setGen\(\{ cid: null, fel: 'abonament' \}\); \}\}/.test(sup));
    const gen = taie(billing, 'function GenerateInvoiceSheet', '\n// Un rând din registrul încasărilor');
    T('fereastra pornește pe documentul cerut (proformă la „E semnat")', /useState<Tip>\(pregatire && pregatire\.tip === 'proforma' \? 'proforma' : 'invoice'\)/.test(gen));
    T('deschisă pregătită, cere rândurile SINGURĂ, o singură dată, doar la factura unică și doar pe firma cerută',
      /useEffect\(\(\) => \{ if \(pregatire && felInitial === 'unica' && preset != null && ales === preset\) pregateste\(pregatire\); \}, \[\]\);/.test(gen) &&
      /const ales = preset != null && opts\.some\(\(c: any\) => c\.id === preset\) \? preset : \(opts\[0\] && opts\[0\]\.id\);/.test(gen));
    T('ciorna trece prin pregatesteCiorna; „cum a venit" = după ce a pus fereastra (închisă neatinsă, nu întreabă)',
      /const r = pregatesteCiorna\(ciornaDinRaspuns\(d, id, fel\), p \|\| null\);\s*startAmp\.current = amp\(r\.S\);\s*setS\(r\.S\);/.test(gen));
    T('lucrările care nu mai sunt de facturat se spun pe ecran (lucrariLipsaText), și se șterg la golirea ciornei',
      /if \(r\.lipsa\) setLipsa\(lucrariLipsaText\(r\.lipsa\)\);/.test(gen) && /\{lipsa \? <div class="bill-avert">⚠ \{lipsa\}<\/div> : null\}/.test(gen) &&
      /cerere\.current\+\+; setS\(null\); setEroare\(''\); setLipsa\(''\);/.test(gen));
    T('„Pregătește din nou" aduce ciorna goală (ca pe web): butonul nu dă evenimentul drept pregătire', /onClick=\{\(\) => pregateste\(\)\}/.test(gen) && !/onClick=\{pregateste\}/.test(gen));
    T('NU emite nimic singură: emiterea rămâne doar pe butonul „Emite"', (gen.match(/Api\.issueInvoice\(/g) || []).length === 1 && /onClick=\{emite\}/.test(gen) &&
      !/useEffect\([^\n]*emite\(/.test(gen));

    sect('1.7 „Previzualizează" (L5) și nota de emitere (L12)');
    // Pagina: _giRenderLines, rulat pe abonament și pe factura unică, factură și proformă.
    function webRand(stare, tip) {
      const res = { innerHTML: '' };
      const ctx = vm.createContext({ console, JSON, Math, Number, String, Date, _S: stare, _T: tip });
      ctx.document = { getElementById: (id) => (id === 'rax-gi-result' ? res : null) };
      vm.runInContext([W.esc, W.luni, W.luna, W.invFmtD, W.invMoney, W.raxDe, W.recalc, W.bloc, W.surse, W.renderLines, 'var _giState = _S, _giTip = _T;', '_giRenderLines();'].join('\n'), ctx);
      return res.innerHTML;
    }
    const baza = { companyId: 7, luna: '2026-10', lines: [{ desc: 'x', qty: 1, unitPrice: 10, net: 10, vat: 1.9 }], issuer: {}, vatRate: 19, client: { name: 'T' }, deja: null,
      aparateIntregi: 1, aparatePeZile: 0, aparateNepornite: 0, dinContract: { aparate: [], lucrari: [], montaj: [] }, adaugate: [], nota: '' };
    for (const [fel, tip] of [['abonament', 'invoice'], ['unica', 'invoice'], ['unica', 'proforma']]) {
      const h = webRand(Object.assign({}, baza, { fel }), tip);
      const nota = dezEsc((/La emitere pleacă singură:[^<]*/.exec(h) || [''])[0]);
      const tipTel = fel === 'unica' ? tip : 'invoice';
      T(fel + ' / ' + tip + ': nota de emitere e aceeași: ' + J(F.notaLaEmitere(tipTel)), nota === F.notaLaEmitere(tipTel), J(nota));
      T(fel + ' / ' + tip + ': pe web, „Previzualizează" stă lângă „Emite" și cheamă raxGenPrevizualizare', /onclick="raxGenPrevizualizare\(this\)"><i class="fas fa-eye"><\/i> Previzualizează<\/button>/.test(h));
      const gol = webRand(Object.assign({}, baza, { fel, lines: [] }), tip);
      T(fel + ' / ' + tip + ': fără rânduri, „Previzualizează" e oprit pe web', /onclick="raxGenPrevizualizare\(this\)" disabled>/.test(gol));
    }
    T('telefonul: nota, sub rânduri, înainte de butoane, pe documentul care pleacă (abonamentul = factură fiscală)',
      /\{notaLaEmitere\(unica \? tip : 'invoice'\)\}/.test(gen) && gen.indexOf('notaLaEmitere(unica') < gen.indexOf("'Previzualizează'") &&
      gen.indexOf('Proforma nu e factură fiscală') < gen.indexOf('notaLaEmitere(unica'));
    T('telefonul: „Previzualizează" lângă „Emite", cu ochiul, oprit fără rânduri (ca pe web), cât se emite și pe o lună care n-a început (01.10)',
      /<button class="btn" style=\{sec\} disabled=\{vede \|\| saving \|\| !S\.lines\.length \|\| \(!unica && !!S\.preaDevreme\)\} onClick=\{previzualizeaza\}><Icon name="eye" size=\{16\} \/> \{vede \? 'Se deschide…' : 'Previzualizează'\}<\/button>/.test(gen) &&
      gen.indexOf('onClick={previzualizeaza}') < gen.indexOf('onClick={emite}') && /<div class="bill-emite">/.test(gen));
    const prev = functie(gen, 'async function previzualizeaza() {'), emite = functie(gen, 'async function emite() {');
    T('ACELAȘI corp la „Previzualizează" și la „Emite": corpEmitere(S, tip) — ca _giCorp pe web', /const corp = corpEmitere\(S, tip\);/.test(prev) && /const corp = corpEmitere\(S, tip\);/.test(emite) &&
      /var body = _giCorp\(\);/.test(W.previz) && /var body = _giCorp\(\), lines = body\.lines;/.test(W.issue));
    T('previzualizarea merge pe ruta paginii (POST /api/invoices/previzualizare), prin descărcarea POST, deschisă ca „Vezi"',
      F.RUTA_PREVIZUALIZARE === '/api/invoices/previzualizare' && /fetch\('\/api\/invoices\/previzualizare', \{ method: 'POST'/.test(W.previz) &&
      /await salveazaPostDeLaServer\(RUTA_PREVIZUALIZARE, corp, 'previzualizare\.pdf', \{ deschide: true \}\);/.test(prev) &&
      /import \{ salveazaPostDeLaServer \} from '\.\.\/lib\/descarcaPost';/.test(billing) &&
      /app\.post\('\/api\/invoices\/previzualizare', requireAuth, requireSuperadmin,/.test(server));
    T('fără rânduri valide, nu pleacă (ca pe web: „Adaugă cel puțin o linie validă")', /if \(!corp\.lines\.length\) \{ showToast\('Adaugă cel puțin o linie validă', true\); return; \}/.test(prev) &&
      /Adaugă cel puțin o linie validă\./.test(W.previz));
    T('refuzul serverului (ex. „Date emitent", luna deja facturată) ajunge pe ecran cu vorbele lui', /catch \(e: any\) \{ showToast\(e\?\.message \|\| 'Previzualizarea nu s-a deschis', true\); \}/.test(prev));
    T('Billing.tsx nu scrie nicio adresă /api/ de mână (rutele stau în endpoints.ts și lib/factura.ts)', !/['"`]\/api\//.test(faraComentarii(billing)));

    sect('1.8 lib/descarcaPost.ts: „deschide" ca salveazaDeLaServer (export.ts)');
    T('semnătura: al patrulea argument, opțional (apelurile vechi rămân la fel)', /export async function salveazaPostDeLaServer\(path: string, body: any, numeImplicit: string, opt: \{ deschide\?: boolean \} = \{\}\): Promise<string> \{/.test(descarcaPost));
    T('pe telefon: aceeași foaie, cu titlul „Deschide cu…" la deschidere — ca export.ts',
      /dialogTitle: opt\.deschide \? 'Deschide cu…' : 'Salvează sau trimite'/.test(descarcaPost) && /dialogTitle: opt\.deschide \? 'Deschide cu…' : 'Salvează sau trimite'/.test(exportTs));
    T('în browser (dezvoltare): se deschide într-o filă, nu se descarcă — ca export.ts', /if \(opt\.deschide\) window\.open\(u, '_blank'\);/.test(descarcaPost) && /if \(opt\.deschide\) window\.open\(u, '_blank'\);/.test(exportTs));
    T('cererea rămâne POST, cu tokenul, prin stratul nativ', /CapacitorHttp\.request\(\{ url, method: 'POST', headers, data: body, responseType: 'blob'/.test(descarcaPost) && /headers\.Authorization = 'Bearer ' \+ token;/.test(descarcaPost));

    sect('1.9 „RO" în fața CUI-ului pe hârtia telefonului (ca factura_pdf.js)');
    const pdfSrc = citeste('factura_pdf.js');
    const cuiW = functie(pdfSrc, 'function cuiAfisat(cui, platitorTva) {');
    let CW = null;
    try { const c = vm.createContext({}); vm.runInContext(cuiW + '\nthis.f = cuiAfisat;', c); CW = c.f; } catch (e) { console.log('    (' + e.message + ')'); }
    T('găsesc cuiAfisat în factura_pdf.js', typeof CW === 'function');
    const cazuri = [['12345678', true], ['12345678', false], ['RO12345678', undefined], ['ro 123 456', null], [' RO123 ', false], ['RO 999', true],
      ['', true], [null, true], [undefined, false], ['RO', true], [12345678, true], ['12345678', 'false'], ['12345678', 0]];
    let laFel = 0;
    cazuri.forEach(([c, p]) => { if (CW && J(CW(c, p)) === J(F.cuiAfisat(c, p))) laFel++; else console.log('    ≠ ' + J([c, p]) + ': ' + J(CW && CW(c, p)) + ' / ' + J(F.cuiAfisat(c, p))); });
    T('telefonul scrie CUI-ul ca hârtia serverului, pe ' + cazuri.length + ' cazuri (plătitor / neplătitor / fără cifre)', laFel === cazuri.length, laFel + '/' + cazuri.length);
    T('hârtia telefonului: CUI-ul furnizorului ȘI al clientului prin cuiAfisat, cu TVA-ul fiecăruia; rândul lipsește fără cifre',
      /const cuiIss = cuiAfisat\(iss\.cui, iss\.vat_payer\), cuiCl = cuiAfisat\(cl\.cui, cl\.vat_payer\);/.test(docFactura) &&
      /\{cuiIss \? <div>CUI: \{cuiIss\}<\/div> : null\}/.test(docFactura) && /\{cuiCl \? <div>CUI: \{cuiCl\}<\/div> : null\}/.test(docFactura) &&
      !/CUI: \{(iss|cl)\.cui\}/.test(docFactura) && /import \{[^}]*\bcuiAfisat\b[^}]*\} from '\.\.\/lib\/factura';/.test(docFactura));
    T('…iar serverul pune TVA-ul clientului în fotografia de pe factură (vat_payer, false doar explicit)', /vat_payer: co\.vat_payer !== false \};/.test(server) &&
      /cuiAfisat\(iss\.cui, iss\.vat_payer\)/.test(pdfSrc) && /cuiAfisat\(cl\.cui, cl\.vat_payer\)/.test(pdfSrc));

    sect('1.10 billing.css: clasele noi, culorile temei, contrastul măsurat pe amândouă temele');
    const clase = new Set();
    (billing.match(/class=\{?["'`][^"'`]*["'`]/g) || []).forEach((m) => (m.match(/bill-[a-z-]+/g) || []).forEach((c) => clase.add(c)));
    (billing.match(/'bill-[a-z-]+/g) || []).forEach((m) => clase.add(m.slice(1)));
    const lipsaCss = [...clase].filter((c) => !new RegExp('\\.' + c + '\\b').test(billingCss));
    T('fiecare clasă bill-… folosită are regula ei în billing.css', lipsaCss.length === 0, J(lipsaCss));
    ['bill-sect', 'bill-emite', 'bill-mf', 'bill-mf-t', 'bill-mf-s', 'bill-mf-b', 'bill-mf-sub', 'bill-mf-h'].forEach((c) => T('.' + c + ' are regula ei', new RegExp('\\.' + c + ' \\{').test(billingCss)));
    T('fără verde/portocaliu pe TEXT în billing.css (--accent / --orange / #3FE07D / #f59e0b)', !/(^|[^-])color:\s*(var\(--accent\)|var\(--orange\)|#3FE07D|#f59e0b)/im.test(faraComentariiCss(billingCss)));
    // Contrastul, din tokeni.
    const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const amesteca = (c, p, f) => c.map((x, i) => x * p + f[i] * (1 - p));
    const tokeni = (bloc) => { const o = {}; for (const m of bloc.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) o[m[1]] = m[2]; return o; };
    const tk = citeste('mobile/src/theme/tokens.css'), fdCss = citeste('mobile/src/screens/fondator.css');
    const tD = tokeni(tk.slice(tk.indexOf(':root, :root[data-theme="dark"]'), tk.indexOf(':root[data-theme="light"]')));
    const tL = Object.assign({}, tD, tokeni(tk.slice(tk.indexOf(':root[data-theme="light"]'))));
    tD['--fd-ok'] = tD['--accent'];   // fondator.css: --fd-ok: var(--accent) pe tema închisă
    Object.assign(tL, tokeni((fdCss.match(/:root\[data-theme="light"\] \{[^}]*\}/) || [''])[0]));
    T('fondator.css: --fd-ok e verdele accentului pe tema închisă și unul închis pe cea luminoasă', /:root \{ --fd-ok: var\(--accent\);/.test(fdCss) && /^#/.test(tL['--fd-ok'] || '') && tL['--fd-ok'] !== tD['--accent']);
    for (const [tema, t] of [['închisă', tD], ['luminoasă', tL]]) {
      const c = (k) => hex(t[k]);
      const perechi = [
        ['scrisul mic al rândului de montaj (.bill-mf-t span, .bill-mf-s span) pe panou', c('--text-secondary'), c('--bg-panel')],
        ['explicația și antetul „în curs" (.bill-mf-sub, .bill-mf-h) pe pagină', c('--text-secondary'), c('--bg-darkest')],
        ['rândul „în curs" (fără fundal) pe pagină', c('--text-secondary'), c('--bg-darkest')],
        ['firma și suma (.bill-mf-t, .bill-mf-s) pe panou', c('--text-primary'), c('--bg-panel')],
        ['butonul „Facturează acum" (.bill-mf-b fără fundal verde)', c('--text-primary'), c('--bg-dark')],
        ['butonul plin (verde) — „Pregătește factura", „Emite"', hex('#06210F'), c('--accent')],
        ['pastila neapăsată (.fd-chip) pe panou', c('--text-secondary'), c('--bg-panel')],
        ['pastila aleasă (.fd-chip.on): --fd-ok pe verdele de 12% peste pagină', c('--fd-ok'), amesteca(c('--accent'), 0.12, c('--bg-darkest'))],
        ['pastila aleasă fără color-mix (WebView vechi): --fd-ok pe panou', c('--fd-ok'), c('--bg-panel')],
        ['mesajul „N din lucrări…" (.bill-avert) pe fundalul lui', c('--text-primary'), amesteca(hex('#f59e0b'), 0.10, c('--bg-dark'))],
      ];
      perechi.forEach(([nume, a, b]) => { const k = contrast(a, b); T('tema ' + tema + ', ' + nume + ': ' + k.toFixed(1) + ':1 (≥ 4,5)', k >= 4.5); });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  async function facturarePeServer({ R, ck }) {
    sect('1.11 Pe server pornit: montajul de facturat și proforma aparatelor, capăt la capăt');
    const fisier = async (url, body) => {
      const x = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify(body) });
      const buf = Buffer.from(await x.arrayBuffer());
      let j = null; if (!/pdf/.test(x.headers.get('content-type') || '')) { try { j = JSON.parse(buf.toString('utf8')); } catch (e) { /* */ } }
      return { s: x.status, ct: x.headers.get('content-type') || '', cd: x.headers.get('content-disposition') || '', inceput: buf.slice(0, 5).toString('latin1'), j };
    };
    const nrDoc = async () => ((((await R('GET', '/api/invoices?limit=1000')).j || {}).invoices) || []).length;

    await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 19 } });
    // Oferta cu aparate + montaj → firma → contractul (Anexa nr. 2 cu aparatele, la cursul înghețat).
    const cfg = { nVeh: 3, nCan: 3, nFms: 0, contractMonths: 24, fxRate: 5.0785, devices: { d130: 3, lvcan: 3 }, montaj: { qGps: 3, qLvCan: 3 } };
    const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Probă', client_name: 'Montaj Probă SRL', monthly_total: 135, currency: 'RON',
      config: { cfg, prices: { pPlain: 29, pCan: 45, dFmc130: 55, dLvCan: 60, mGps: 100, mLvCan: 60 } } })).j;
    const co = (await R('POST', '/api/companies', { name: 'Montaj Probă SRL' })).j;
    await R('PUT', '/api/companies/' + co.id + '/oferta', { oferta: { name: 'Ofertă', priceNoneRON: 29, priceCanRON: 45, priceFmsRON: 65 } });
    const ct = await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of && of.id, months: 24,
      din_oferta: { unitati: { plain: 29, can: 45, fms: 65 }, vehicule: [{ fel: 'can', nume: 'Vehicule GPS cu CAN', cant: 3, pret: 45, total: 135 }], servicii: [] } });
    T('firma de probă, cu contract din ofertă (aparate în Anexa nr. 2)', !!(co && co.id) && ct.s === 200 && ct.j.montaj && (ct.j.montaj.echipamente.items || []).length === 2, J(ct.j && ct.j.montaj));
    if (!(co && co.id) || ct.s !== 200) return;
    // Două lucrări montate în luni încheiate (gata de facturat) + una azi (în curs).
    const ZI = 864e5, acum = Date.now();
    const lucrare = async (zileInUrma, gps, can) => (await R('POST', '/api/companies/' + co.id + '/montaje', { contract_id: ct.j.id, status: 'executat', data_lucrare: acum - zileInUrma * ZI,
      items: [{ tip: 'gps', buc: gps, pretClient: 100, costPartener: 60 }].concat(can ? [{ tip: 'lvcan', buc: can, pretClient: 60, costPartener: 30 }] : []) })).j;
    const l1 = await lucrare(45, 2, 2), l2 = await lucrare(38, 1, 0), l3 = await lucrare(0, 1, 0);
    T('trei lucrări montate (două în luni încheiate, una azi)', !!(l1 && l1.id && l2 && l2.id && l3 && l3.id), J([l1, l2, l3].map((x) => x && x.id)));

    // „Montaj de facturat": ce vede Facturare (aceeași rută ca pagina).
    const mf = (await R('GET', '/api/montaj/de-facturat')).j || {};
    const g = (mf.gata || []).filter((x) => x.company_id === co.id)[0];
    const gc = (mf.inCurs || []).filter((x) => x.company_id === co.id)[0];
    T('„Montaj de facturat": firma e GATA cu cele două lucrări vechi, iar cea de azi e ÎN CURS', !!g && J(g.lucrari) === J([l1.id, l2.id].sort((a, b) => a - b)) && !!gc && J(gc.lucrari) === J([l3.id]), J(mf));
    if (!g) return;
    const rT = F.randuriMontajFact(mf);
    const rG = rT.gata.filter((r) => r.companyId === co.id)[0];
    T('rândul telefonului: firma, textul serverului, suma fără TVA (2×100 + 2×60 + 1×100 = 420), „Pregătește factura"', !!rG && rG.nume === 'Montaj Probă SRL' && rG.text === g.text && rG.total === 420 &&
      rG.buton === 'Pregătește factura' && !rG.curs && money2(rG.total) === '420,00', J(rG));
    T('„Montaj de facturat · N" numără firma o dată', F.etichetaSectiune('montaj', F.numereSectiuni([], mf)) === 'Montaj de facturat · ' + (mf.gata || []).length);

    // Anunțul / „Pregătește factura": adresa făcută de telefon → pregătirea → ciorna serverului → rândurile puse.
    const adr = F.rutaFactura(co.id, 'unica', { lucrari: rG.lucrari });
    const p = F.pregatireDinAdresa(Q(adr));
    T('adresa din anunț se citește înapoi: factură fiscală, cu lucrările gata', J(p) === J({ tip: 'invoice', aparate: false, lucrari: rG.lucrari }), adr);
    const dr = await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' });   // Api.invoiceDraft(id, undefined, 'unica')
    T('ciorna facturii unice vine (cu lucrările executate în dinContract)', dr.s === 200 && ((dr.j.dinContract || {}).lucrari || []).length === 3, J(dr.j && dr.j.dinContract));
    const r = F.pregatesteCiorna(F.ciornaDinRaspuns(dr.j, co.id, 'unica'), p);
    const gps = r.S.lines.filter((l) => /GPS/i.test(l.desc))[0], can = r.S.lines.filter((l) => /CAN/i.test(l.desc))[0];
    T('rândurile puse singure: montajul GPS strâns pe un rând (2 + 1 = 3 × 100), LV-CAN 2 × 60; nimic lipsă', r.lipsa === 0 && r.S.lines.length === 2 && gps && gps.qty === 3 && gps.unitPrice === 100 && can && can.qty === 2,
      J(r.S.lines.map((l) => [l.desc, l.qty, l.unitPrice])));
    T('lucrarea de azi (în curs) NU e pusă', F.montajeDeTrimis(r.S).indexOf(l3.id) < 0 && J(F.montajeDeTrimis(r.S).slice().sort((a, b) => a - b)) === J(rG.lucrari));
    T('mențiunea spune zilele de montaj, cu mașinile lor', /^Montaj executat pe \d\d\.\d\d\.\d{4} \(2 mașini\) și \d\d\.\d\d\.\d{4} \(1 mașină\)\.$/.test(r.S.nota), r.S.nota);
    const corp = F.corpEmitere(r.S, p.tip);
    // „Previzualizează": același corp, PDF-ul serverului, fără niciun document nou.
    const inainte = await nrDoc();
    const pv = await fisier(F.RUTA_PREVIZUALIZARE, corp);
    T('„Previzualizează": un PDF, „RA-Tracks - Previzualizare factură - …", și NICIUN document nou', pv.s === 200 && /application\/pdf/.test(pv.ct) && pv.inceput === '%PDF-' &&
      /Previzualizare%20factur%C4%83/.test(pv.cd) && (await nrDoc()) === inainte, J({ s: pv.s, ct: pv.ct, cd: pv.cd, j: pv.j }));
    // „Emite": același corp → lucrările trec pe „facturat clientului".
    const em = await R('POST', '/api/invoices', corp);
    T('„Emite factura": factura fiscală, cu cele două lucrări trecute pe „facturat clientului"', em.s === 200 && em.j.invoice.type === 'invoice' && em.j.invoice.fel === 'unica' && em.j.montajeFacturate === 2,
      J(em.j && { s: em.s, n: em.j.invoice && em.j.invoice.full_number, m: em.j.montajeFacturate, e: em.j.error }));
    T('…cu mențiunea zilelor pe ea', em.s === 200 && em.j.invoice.note === r.S.nota, em.j && em.j.invoice && em.j.invoice.note);
    const mf2 = (await R('GET', '/api/montaj/de-facturat')).j || {};
    T('după emitere, firma nu mai e „gata" (rămâne doar lucrarea de azi, în curs)', !(mf2.gata || []).some((x) => x.company_id === co.id) &&
      (mf2.inCurs || []).some((x) => x.company_id === co.id && J(x.lucrari) === J([l3.id])), J(mf2));
    // Un anunț vechi, apăsat după ce s-a facturat: fereastra spune că lucrările nu mai sunt de facturat și nu pune nimic.
    const dr2 = await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' });
    const r2 = F.pregatesteCiorna(F.ciornaDinRaspuns(dr2.j, co.id, 'unica'), p);
    T('anunțul vechi: „2 din lucrări nu mai sunt de facturat (poate au fost facturate între timp)." și niciun rând', r2.lipsa === 2 && r2.S.lines.length === 0 &&
      F.lucrariLipsaText(r2.lipsa) === '2 din lucrări nu mai sunt de facturat (poate au fost facturate între timp).', J({ lipsa: r2.lipsa, l: r2.S.lines.length }));

    // Proforma aparatelor, la „E semnat": adresa → aparatele din Anexa nr. 2 puse, pe proformă.
    const adrP = F.rutaFactura(co.id, 'unica', { tip: 'proforma', aparate: true });
    const pp = F.pregatireDinAdresa(Q(adrP));
    const rp = F.pregatesteCiorna(F.ciornaDinRaspuns(dr2.j, co.id, 'unica'), pp);
    const ap = (dr2.j.dinContract || {}).aparate || [];
    T('„E semnat" → proforma, cu aparatele din Anexa nr. 2 puse (la cursul înghețat)', pp && pp.tip === 'proforma' && ap.length === 2 &&
      J(rp.S.lines.map((l) => [l.desc, l.qty, l.unitPrice])) === J(ap.map((l) => [l.desc, l.qty, l.unitPrice])), J({ pp, linii: rp.S.lines.map((l) => [l.desc, l.qty, l.unitPrice]), ap }));
    const corpP = F.corpEmitere(rp.S, pp.tip);
    const pvP = await fisier(F.RUTA_PREVIZUALIZARE, corpP);
    T('previzualizarea proformei: „RA-Tracks - Previzualizare proformă - …"', pvP.s === 200 && pvP.inceput === '%PDF-' && /Previzualizare%20proform%C4%83/.test(pvP.cd), J({ s: pvP.s, cd: pvP.cd, j: pvP.j }));
    const emP = await R('POST', '/api/invoices', corpP);
    T('„Emite proforma": seria PF, fără ANAF', emP.s === 200 && /^PF-/.test(emP.j.invoice.full_number) && emP.j.trimisa && emP.j.trimisa.anaf === 'nu_se_trimite', J(emP.j && { n: emP.j.invoice && emP.j.invoice.full_number, t: emP.j.trimisa, e: emP.j.error }));
    // Lista: secțiunile numără ce a venit de la server.
    const toate = (((await R('GET', '/api/invoices?limit=1000')).j || {}).invoices) || [];
    const nr = F.numereSectiuni(toate, mf2);
    T('secțiunile, pe lista serverului: o factură, o proformă de încasat', nr.facturi === 1 && nr.proforme === 1 && nr.deIncasat === 1 &&
      F.etichetaSectiune('proforme', nr) === 'Proforme · 1 (1 de încasat)' && F.documenteSectiune(toate, 'proforme')[0].full_number === emP.j.invoice.full_number, J(nr));
    T('o nouă factură unică avertizează că aparatele sunt deja pe proformă', J(F.aparateDejaPe(toate, co.id, dr2.j.dinContract)) === J([emP.j.invoice.full_number]));
    // Previzualizarea spune aceleași refuzuri ca emiterea (fără rânduri).
    const pvGol = await fisier(F.RUTA_PREVIZUALIZARE, F.corpEmitere(F.ciornaDinRaspuns(dr2.j, co.id, 'unica'), 'invoice'));
    T('previzualizarea fără rânduri → refuzul serverului, cu vorbele lui', pvGol.s === 400 && /Adaugă cel puțin un rând/.test((pvGol.j || {}).error || ''), J(pvGol));
  }

  for (const [nume, f] of [['adresa', adresa], ['fereastra pregătită', fereastraPregatita], ['secțiunile', sectiunile], ['restul', restul]]) {
    // O bucată care crapă se numără ca picată și nu le ascunde pe celelalte.
    try { await f(); } catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
  return facturarePeServer;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Anunțuri și Dispozitive (lib/push.ts, NotifDetail.tsx, Notifications.tsx, AdminDevices.tsx, aparate.css) — R1,
//    L8, L9 (partea de anunț), telefonul lângă web:
//   2.1 Unde duce un anunț (mobile/src/lib/push.ts, bucata „unde duce un anunț", RULATĂ): „aparate noi transmit" →
//       Dispozitive → Neasignate cu aparatele bifate și firma propusă; „Montaj de facturat" → factura unică cu lucrările
//       puse (rutaFactura); termenul de montaj → calendarul; restul → null (detaliul, ca până acum). Push-ul:
//       anunțurile noastre → /notif/<id>.
//   2.2 Web alături: notifAparateNoi + raxDevDeschideNeasignate + _raxDevPuneAnuntul și notifMontajDeFacturat, decupate
//       din public/index.html și RULATE pe aceleași cazuri — aceleași aparate bifate, aceeași firmă, aceleași lucrări.
//   2.3 Dispozitive (AdminDevices.tsx): bucata „aparatele noi, bifate din anunț" rulată; banda „Firma e propusă…" cu
//       aceleași cuvinte ca pe web, dar DOAR pentru firma propusă și aparatele din anunț (pe web apare și la firma aleasă
//       de mână); invariantele lotului 4 (verify_facturare_telefon, secțiunea 4) rămân în picioare.
//   2.4 Detaliul, lista, push-ul: marcate citite acolo unde detaliul nu se mai desenează.
//   2.5 CSS: .ap-propus pe variabilele temei, contrastul MĂSURAT pe amândouă temele.
//   2.6 Pe server: trackere adevărate pe TCP, anunțuri adevărate, prin clientul HTTP al telefonului — lista, detaliul și
//       web-ul dau aceleași bife și aceeași factură.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function parteaAnunturi() {
  sect('2. Anunțuri și Dispozitive: anunțul duce la treabă (aparate noi → Neasignate, montaj de facturat → factura)');
  // TypeScript-ul telefonului, tradus și rulat în vm.
  function modul(cod, fisier, cereri, globale) {
    const m = { exports: {} };
    const ctx = vm.createContext(Object.assign({
      module: m, exports: m.exports, console, setTimeout, clearTimeout, URL, AbortController,
      require: (id) => {
        if (cereri && Object.prototype.hasOwnProperty.call(cereri, id)) return cereri[id];
        if (/\.css$/.test(id)) return {};
        throw new Error('require neașteptat în ' + fisier + ': ' + id);
      },
    }, globale || {}));
    vm.runInContext(cod, ctx, { filename: fisier });
    return { exp: m.exports, ctx };
  }

  // Contrastul (WCAG), ca în verify_facturare_telefon.js.
  const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const amesteca = (c, p, fundal) => c.map((x, i) => x * p + fundal[i] * (1 - p));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.0 Fișierele');
  const FIS = {
    html: 'public/index.html', server: 'server.js', push: 'mobile/src/lib/push.ts', factura: 'mobile/src/lib/factura.ts',
    contracte: 'mobile/src/lib/contracte.ts', numar: 'mobile/src/lib/numar.ts', client: 'mobile/src/api/client.ts',
    endpoints: 'mobile/src/api/endpoints.ts', detaliu: 'mobile/src/screens/NotifDetail.tsx', lista: 'mobile/src/screens/Notifications.tsx',
    dev: 'mobile/src/screens/AdminDevices.tsx', css: 'mobile/src/screens/aparate.css', tokens: 'mobile/src/theme/tokens.css',
    fondator: 'mobile/src/screens/fondator.css', app: 'mobile/src/App.tsx',
  };
  const S = {};
  Object.keys(FIS).forEach((k) => { S[k] = citeste(FIS[k]); });
  const lipsa = Object.keys(FIS).filter((k) => !S[k]);
  T('toate fișierele citite de probă există', !lipsa.length, lipsa.map((k) => FIS[k]).join(', '));

  let numar = {}, F = {}, CTR = {}, P = {};
  try { numar = modul(tsJs(S.numar, 'numar.ts'), 'numar.ts').exp; } catch (e) { console.log('    (numar.ts: ' + e.message + ')'); }
  try { F = modul(tsJs(S.factura, 'factura.ts'), 'factura.ts', { './numar': numar }).exp; } catch (e) { console.log('    (factura.ts: ' + e.message + ')'); }
  try { CTR = modul(tsJs(S.contracte, 'contracte.ts'), 'contracte.ts').exp; } catch (e) { console.log('    (contracte.ts: ' + e.message + ')'); }
  // push.ts ÎNTREG, cu importurile lui adevărate (factura, contracte) și cu Capacitor / Api / store de carton.
  // Adresa calendarului (lib/calendarMontaj.ts): rândul ei ADEVĂRAT, decupat din sursă (modulul întreg trage clientul HTTP).
  let CAL = {};
  try {
    const r = (citeste('mobile/src/lib/calendarMontaj.ts').match(/export const rutaCalendarMontaj = [^\n]+\n/) || [''])[0];
    CAL = modul(tsJs(r, 'calendarMontaj-ruta.ts'), 'calendarMontaj-ruta.ts').exp;
  } catch (e) { console.log('    (calendarMontaj.ts: ' + e.message + ')'); }
  try {
    P = modul(tsJs(S.push.split('(import.meta as any).env').join('({})'), 'push.ts'), 'push.ts', {
      '@capacitor/core': { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } },
      '../api/endpoints': { Api: {} }, '../app/store': { showToast: () => {} },
      './factura': F, './contracte': CTR, './calendarMontaj': CAL,
    }).exp;
  } catch (e) { console.log('    (push.ts: ' + e.message + ')'); }
  T('lib/push.ts se traduce și rulează, cu importurile lui (rutaFactura, RUTA_NEASIGNATE)',
    ['adresaAnunt', 'anuntDinAdresa', 'adresaFaraAnunt', 'adresaPush', 'dateAnunt'].every((k) => typeof P[k] === 'function') && Array.isArray(P.TIPURI_CU_LOC) &&
    typeof F.rutaFactura === 'function' && CTR.RUTA_NEASIGNATE === '/admin/devices?filtru=neasignate');
  T('push.ts își ia adresele din locul lor (nu le scrie a doua oară)', /import \{ rutaFactura \} from '\.\/factura';/.test(S.push) && /import \{ RUTA_NEASIGNATE \} from '\.\/contracte';/.test(S.push) &&
    !/'\/admin\/devices\?filtru=/.test(S.push) && !/'\/billing\?factura=/.test(S.push));

  // Adresa, citită ca preact-iso (Object.fromEntries(new URL(url).searchParams)).
  const citita = (u) => { const x = new URL(u, 'http://tel.local'); return { path: x.pathname, query: Object.fromEntries(x.searchParams) }; };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.1 Unde duce un anunț (lib/push.ts, rulat)');
  const A1 = '860000000000001', A2 = '860000000000002';
  T('„aparate noi" cu firmă: Neasignate, aparatele bifate, firma aleasă',
    P.adresaAnunt('aparate_noi', { imeis: [A1, A2], company_id: 42 }) === '/admin/devices?filtru=neasignate&bifate=' + A1 + ',' + A2 + '&firma=42',
    P.adresaAnunt('aparate_noi', { imeis: [A1, A2], company_id: 42 }));
  T('…aceeași adresă când `data` vine ca text JSON (ca pe web, loadNotifications)',
    P.adresaAnunt('aparate_noi', J({ imeis: [A1, A2], company_id: 42 })) === P.adresaAnunt('aparate_noi', { imeis: [A1, A2], company_id: 42 }));
  T('…fără firmă propusă: doar aparatele', P.adresaAnunt('aparate_noi', { imeis: [A1], company_id: null }) === '/admin/devices?filtru=neasignate&bifate=' + A1);
  T('…fără aparate și fără firmă: doar Neasignate (ca raxDevDeschideNeasignate fără nimic de pus)', P.adresaAnunt('aparate_noi', { imeis: [], company_id: null }) === CTR.RUTA_NEASIGNATE && P.adresaAnunt('aparate_noi', null) === CTR.RUTA_NEASIGNATE);
  T('„Montaj de facturat": factura unică cu lucrările puse — exact adresa lui rutaFactura (lib/factura.ts)',
    P.adresaAnunt('montaj_de_facturat', { company_id: 7, lucrari: [13, 12] }) === F.rutaFactura(7, 'unica', { lucrari: [13, 12] }) &&
    P.adresaAnunt('montaj_de_facturat', { company_id: 7, lucrari: [13, 12] }) === '/billing?factura=7&fel=unica&lucrari=13,12',
    P.adresaAnunt('montaj_de_facturat', { company_id: 7, lucrari: [13, 12] }));
  T('…fără lucrări: tot factura unică a firmei', P.adresaAnunt('montaj_de_facturat', { company_id: 7 }) === '/billing?factura=7&fel=unica');
  T('…fără firmă (n-ar trebui să se întâmple): Facturare, nu o factură pe nicio firmă', P.adresaAnunt('montaj_de_facturat', { lucrari: [1] }) === '/billing');
  // „Cerere demo" → Cereri demo, ca pe web (în lista de notificări: onclick="goSistem('demoreq')"); ruta ecranului pe telefon.
  T('„Cerere demo" duce în Cereri demo, ca pe web', P.adresaAnunt('demo_request', { id: 5 }) === '/admin/demo-requests'
    && /isDemoReq\s*\n?\s*\? `onclick="goSistem\('demoreq'\)"/.test(S.html) && /<Route path="\/admin\/demo-requests" component=\{P\.demoRequests\} \/>/.test(S.app));
  const altele = ['alert', 'overspeed', 'report_ready', 'report_error', 'contract_expira', 'document_expiry', 'maintenance_due', '', undefined, null];
  T('restul anunțurilor: null — se deschid ca până acum (detaliul, rapoartele, contractul)', altele.every((t) => P.adresaAnunt(t, { imeis: [A1], company_id: 1, lucrari: [1] }) === null));
  // Termenul de montaj (anunț din 30.09, datele au contractId) → calendarul, pe contractul lui (revizia lotului 5, 01.10).
  T('termenul de montaj duce în calendar, pe contractul din anunț; fără contract, în calendar',
    P.adresaAnunt('montaj_termen', { contractId: 17, companyId: 4 }) === '/admin/montaj?fila=calendar&contract=17'
    && P.adresaAnunt('montaj_termen', {}) === '/admin/montaj?fila=calendar'
    && /_anuntaSuperadmini\(supers, 'montaj_termen'[\s\S]{0,200}\{ key: cheie, contractId: c\.id, companyId: c\.company_id/.test(S.server));
  T('TIPURI_CU_LOC = exact felurile care au adresă', J(P.TIPURI_CU_LOC.slice().sort()) === J(['aparate_noi', 'demo_request', 'montaj_de_facturat', 'montaj_termen']) &&
    P.TIPURI_CU_LOC.every((t) => P.adresaAnunt(t, { company_id: 3 }) !== null));
  {
    const u = P.adresaAnunt('aparate_noi', { imeis: [A1, A2, 'TEST111'], company_id: 42 });
    const c = citita(u);
    T('adresa se citește înapoi ca pe telefon: Dispozitive, filtrul „neasignate", aparatele, firma',
      c.path === '/admin/devices' && c.query.filtru === 'neasignate' && J(P.anuntDinAdresa(c.query)) === J({ imeis: [A1, A2, 'TEST111'], firma: 42 }), J([c, P.anuntDinAdresa(c.query)]));
    T('filtrul „neasignate" e cel pe care Dispozitive îl știe', /neasignate:\s*'unassigned'/.test(S.dev) && /DIN_ADRESA\[String\(\(\(loc\.query \|\| \{\}\) as any\)\.filtru \|\| ''\)\]/.test(S.dev));
  }
  T('adresa fără nimic de pus → null (doar filtrul); firmă greșită sau zero → nu se alege', P.anuntDinAdresa({}) === null && P.anuntDinAdresa({ filtru: 'neasignate' }) === null &&
    P.anuntDinAdresa({ bifate: ',, ,' }) === null && P.anuntDinAdresa({ firma: 'abc' }) === null && P.anuntDinAdresa({ firma: '0' }) === null &&
    J(P.anuntDinAdresa({ firma: '42' })) === J({ imeis: [], firma: 42 }));
  // Push: serverul trimite pe telefon { type, notifId } (FCM le face text).
  T('serverul: anunțurile noastre pleacă pe push cu felul și id-ul notificării',
    /sendPushToUser\(u\.id, \{ title: n\.title, body: n\.body, data: \{ type: n\.type, notifId: n\.id \} \}\)/.test(functie(S.server, 'async function _anuntaSuperadmini(')) &&
    /_anuntaSuperadmini\(supers, 'aparate_noi'/.test(S.server) && /_anuntaSuperadmini\(supers, 'montaj_de_facturat'/.test(S.server));
  T('push „aparate noi" / „Montaj de facturat" → detaliul lor (/notif/<id>), care duce mai departe',
    P.adresaPush({ type: 'aparate_noi', notifId: '55' }) === '/notif/55' && P.adresaPush({ type: 'montaj_de_facturat', notifId: '9' }) === '/notif/9' && P.adresaPush({ type: 'aparate_noi', notifId: 55 }) === '/notif/55');
  T('restul push-urilor ca până acum: mașina → fișa ei, altfel Notificări',
    P.adresaPush({ type: 'overspeed', imei: A1 }) === '/vehicles/' + A1 && P.adresaPush({ type: 'overspeed', imei: '' }) === '/notifications' &&
    P.adresaPush({ type: 'contract_expira', notifId: '3' }) === '/notifications' && P.adresaPush({ type: 'aparate_noi' }) === '/notifications' &&
    P.adresaPush({ type: 'aparate_noi', notifId: 'x' }) === '/notifications' && P.adresaPush(null) === '/notifications' && P.adresaPush({}) === '/notifications');
  T('apăsarea pe push trece prin adresaPush', /addListener\('pushNotificationActionPerformed', \(action\) => \{\n\s*window\.location\.href = adresaPush\(action\.notification\?\.data \|\| \{\}\);/.test(S.push));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.2 Web alături: bucățile paginii, rulate pe aceleași cazuri');
  const web = {
    notifAp: functie(S.html, 'function notifAparateNoi(id) {'),
    notifMont: functie(S.html, 'function notifMontajDeFacturat(id) {'),
    deschide: functie(S.html, 'window.raxDevDeschideNeasignate = function (pune) {'),
    bloc: taie(S.html, '// ── începe „aparatele noi, bifate din anunț"', '// ── sfârșit „aparatele noi, bifate din anunț"'),
    bucket: functie(S.html, 'function _raxDevBucket(d) {'),
  };
  T('găsesc bucățile paginii (notifAparateNoi, notifMontajDeFacturat, raxDevDeschideNeasignate, _raxDevPuneAnuntul, _raxDevBucket)',
    Object.keys(web).every((k) => web[k].length > 40), Object.keys(web).filter((k) => web[k].length <= 40).join(', '));
  T('pe web, felurile sunt aceleași (isAparateNoi / isMontajFact)', /const isAparateNoi = \(n\.type === 'aparate_noi'\), isMontajFact = \(n\.type === 'montaj_de_facturat'\);/.test(S.html));
  // Web: anunțul (data), apoi lista venită → ce e bifat, ce firmă e aleasă, ce filtru.
  function webAparate(data, lista) {
    const ctx = { console, closeNotifications() {}, showView() {}, raxAdminTab() {}, setTimeout: (fn) => fn() };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(['var _raxDevices = [], _raxDevFilter = "all", _raxDevSel = {};', web.bucket, web.bloc, web.deschide + ';', 'var _notifDate = {};', web.notifAp].join('\n'), ctx, { filename: 'index.html#anunt' });
    ctx._notifDate[5] = data;
    ctx.notifAparateNoi(5);
    ctx._raxDevices = lista;
    vm.runInContext('_raxDevPuneAnuntul();', ctx);
    return { bife: Object.keys(ctx._raxDevSel).filter((k) => ctx._raxDevSel[k]).sort(), firma: ctx._raxDevBlocFirma, filtru: ctx._raxDevFilter };
  }
  function webMontaj(data) {
    const apeluri = [];
    const ctx = { console, closeNotifications() {}, showView() {}, setTimeout: (fn) => fn(), raxFacturaMontaj: (c, l, a) => { apeluri.push([c, l, a]); } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(['var _notifDate = {};', web.notifMont].join('\n'), ctx, { filename: 'index.html#montaj' });
    ctx._notifDate[9] = data;
    ctx.notifMontajDeFacturat(9);
    return apeluri[0] || null;
  }
  // Dispozitive pe telefon: cele două bucăți fără JSX (trecerea în bloc + aparatele noi), rulate împreună.
  const blocBloc = taie(S.dev, '// ── începe „trecerea în bloc și ziua abonamentului', '// ── sfârșit „trecerea în bloc și ziua abonamentului');
  const blocAnunt = taie(S.dev, '// ── începe „aparatele noi, bifate din anunț"', '// ── sfârșit „aparatele noi, bifate din anunț"');
  let D = {};
  try {
    const ctx = vm.createContext({ api: async () => ({}), nrDe: numar.nrDe, console });
    vm.runInContext(tsJs(blocBloc + '\n' + blocAnunt, 'AdminDevices-blocuri.ts'), ctx, { filename: 'AdminDevices.tsx#blocuri' });
    D = ctx;
  } catch (e) { console.log('    (AdminDevices, bucățile: ' + e.message + ')'); }
  T('găsesc și rulez bucata telefonului „aparatele noi, bifate din anunț" (lângă cea a trecerii în bloc)',
    blocAnunt.length > 200 && ['bifeDinAnunt', 'firmaPropusa', 'neasignatViu'].every((k) => typeof D[k] === 'function'));
  T('din bifare nu pleacă nicio cerere spre server (trecerea rămâne apăsarea „Trece pe firmă")', !/\bapi\(|fetch\(|treceInBloc\(|Api\./.test(blocAnunt));
  // Telefonul: adresa făcută de push.ts, citită de Dispozitive, apoi bifele pe lista venită.
  function telAparate(data, lista) {
    const u = P.adresaAnunt('aparate_noi', data);
    const c = citita(u);
    const a = P.anuntDinAdresa(c.query);
    const b = D.bifeDinAnunt(lista, a);
    return { bife: Object.keys(b).filter((k) => b[k]).sort(), firma: a && a.firma != null ? String(a.firma) : '', filtru: c.query.filtru === 'neasignate' ? 'unassigned' : c.query.filtru };
  }
  const lista = [
    { imei: 'A', company_id: null, status: 'active', anuntat_firma: 42 },
    { imei: 'B', company_id: null, anuntat_firma: 42 },                         // venit din lista „neasignate" (fără stare)
    { imei: 'C', company_id: null, status: 'active', anuntat_firma: 42 },       // propus aceleiași firme, în alt anunț
    { imei: 'D', company_id: null, status: 'active', anuntat_firma: 43 },       // propus ALTEI firme
    { imei: 'E', company_id: 42, status: 'active', anuntat_firma: null },       // deja trecut pe firmă
    { imei: 'F', company_id: null, status: 'archived', anuntat_firma: 42 },     // respins între timp
    { imei: 'G', company_id: null, status: 'active', anuntat_firma: null },     // neasignat, neanunțat
    { imei: 'TEST111', company_id: null, status: 'active' },
  ];
  const cazuri = [
    ['anunțul cu firmă: aparatele lui + toate cele propuse aceleiași firme', { imeis: ['A', 'B'], company_id: 42 }],
    ['anunțul fără firmă: doar aparatele lui', { imeis: ['A', 'G'], company_id: null }],
    ['doar firma (niciun aparat nu transmite încă)', { imeis: [], company_id: 42 }],
    ['un aparat din anunț a fost trecut pe firmă, altul respins între timp', { imeis: ['E', 'F', 'B'], company_id: 42 }],
    ['altă firmă propusă', { imeis: ['D'], company_id: 43 }],
    ['IMEI cu litere (aparatele de probă)', { imeis: ['TEST111'], company_id: null }],
    ['firmă fără niciun aparat propus în listă', { imeis: ['G'], company_id: 99 }],
  ];
  cazuri.forEach(([nume, data]) => {
    const w = webAparate(data, lista), t = telAparate(data, lista);
    T('aparate noi — ' + nume + ': aceleași bife, aceeași firmă, același filtru ca pe web', J(w) === J(t), 'web ' + J(w) + ' / tel ' + J(t));
  });
  {
    const w = webAparate({ imeis: [], company_id: null }, lista);
    const u = P.adresaAnunt('aparate_noi', { imeis: [], company_id: null });
    T('anunțul gol: pe web nimic bifat, nicio firmă, doar filtrul — pe telefon, adresa fără nimic de pus',
      J(w) === J({ bife: [], firma: '', filtru: 'unassigned' }) && P.anuntDinAdresa(citita(u).query) === null && J(D.bifeDinAnunt(lista, null)) === '{}', J(w));
  }
  [[{ company_id: 7, lucrari: [12, 13] }, 'două lucrări'], [{ company_id: 7, lucrari: [] }, 'fără lucrări'], [{ company_id: 15, lucrari: [40] }, 'o lucrare']].forEach(([data, nume]) => {
    const w = webMontaj(data);
    const c = citita(P.adresaAnunt('montaj_de_facturat', data));
    const lucr = c.query.lucrari ? c.query.lucrari.split(',').map(Number) : [];
    T('Montaj de facturat — ' + nume + ': aceeași firmă și aceleași lucrări ca pe web (raxFacturaMontaj), pe factura unică',
      !!w && w[0] === Number(c.query.factura) && J(w[1]) === J(lucr) && w[2] === true && c.path === '/billing' && c.query.fel === 'unica', J([w, c]));
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.3 Dispozitive (AdminDevices.tsx): banda, adresa curățată, legăturile ecranului');
  const firme = [{ value: '42', label: 'Transport SRL' }, { value: '43', label: 'Alfa SRL' }];
  const an = { imeis: ['A'], firma: 42 };
  T('banda: firma propusă, încă aleasă, cu un aparat din anunț bifat → numele firmei', D.firmaPropusa(an, '42', ['A'], { A: true }, firme) === 'Transport SRL');
  T('…firma schimbată de mână în bară → fără bandă (pe web ar spune tot „propusă de montajul din calendar")', D.firmaPropusa(an, '43', ['A'], { A: true }, firme) === null);
  T('…nimic bifat, sau bifate doar aparate puse de mână → fără bandă', D.firmaPropusa(an, '42', [], { A: true }, firme) === null && D.firmaPropusa(an, '42', ['G'], { A: true }, firme) === null);
  T('…firma nu (mai) e în listă (ștearsă, demo) → fără bandă; anunț fără firmă sau fără anunț → fără bandă',
    D.firmaPropusa({ imeis: ['A'], firma: 77 }, '77', ['A'], { A: true }, firme) === null && D.firmaPropusa({ imeis: ['A'], firma: null }, '', ['A'], { A: true }, firme) === null &&
    D.firmaPropusa(null, '42', ['A'], { A: true }, firme) === null);
  T('adresa curățată după ce anunțul s-a pus: fără bifate și firmă, cu filtrul',
    P.adresaFaraAnunt('/admin/devices', { filtru: 'neasignate', bifate: 'A,B', firma: '42' }) === '/admin/devices?filtru=neasignate' && P.adresaFaraAnunt('/admin/devices', { bifate: 'A' }) === '/admin/devices' &&
    P.adresaFaraAnunt('/admin/devices', citita(P.adresaAnunt('aparate_noi', { imeis: ['A'], company_id: 42 })).query) === CTR.RUTA_NEASIGNATE &&
    P.adresaFaraAnunt('', { filtru: 'neasignate', bifate: 'A' }) === CTR.RUTA_NEASIGNATE);
  // Textul benzii: aceleași cuvinte ca pe web.
  const mBanda = /'<div class="rax-dev-propus"><i class="fas fa-calendar-check"><\/i> (Firma e propusă de montajul din calendar: <b>)' \+ esc\(propusa\.name\) \+ '(<\/b>\. Verifică aparatele bifate și apasă „Trece pe firmă"\.)<\/div>'/.exec(S.html);
  T('banda are exact cuvintele de pe web (rax-dev-propus)', !!mBanda && S.dev.indexOf(mBanda[1] + '{propusa}' + mBanda[2]) > 0, mBanda ? mBanda[1] + '…' + mBanda[2] : 'nu găsesc banda pe web');
  T('banda stă în bara din Neasignate, sub „Trece pe firmă", pe clasa ei (ap-propus), cu iconița calendarului',
    /const propusa = firmaPropusa\(anunt, firmaBloc, alese, dinAnunt, companies\);/.test(S.dev) && /\{propusa && \(\n\s*<div class="ap-propus">\n\s*<Icon name="calendar" size=\{14\} \/>/.test(S.dev) &&
    S.dev.indexOf('<div class="ap-propus">') > S.dev.indexOf('Trece pe firmă\n          </button>') && S.dev.indexOf('<div class="ap-propus">') < S.dev.indexOf('{ascunse > 0 && ('));
  T('adresa se citește O dată, la deschidere: anunțul și firma propusă aleasă în bară',
    /const \[anunt\] = useState\(\(\) => anuntDinAdresa\(loc\.query\)\);/.test(S.dev) && /const anuntDePus = useRef\(!!anunt\);/.test(S.dev) &&
    /const \[firmaBloc, setFirmaBloc\] = useState\(\(\) => \(anunt && anunt\.firma != null \? String\(anunt\.firma\) : ''\)\);/.test(S.dev) &&
    /import \{ anuntDinAdresa, adresaFaraAnunt \} from '\.\.\/lib\/push';/.test(S.dev));
  T('bifele se pun O dată, pe prima listă venită',
    /if \(anunt && anuntDePus\.current\) \{\n\s*anuntDePus\.current = false;\n\s*const b = bifeDinAnunt\(lista, anunt\);\n\s*setBife\(b\);\n\s*setDinAnunt\(b\);\n\s*\}/.test(S.dev) &&
    (S.dev.match(/bifeDinAnunt\(/g) || []).length === 2 && (S.dev.match(/setDinAnunt\(/g) || []).length === 1);
  T('adresa se curăță la deschidere (înlocuită, nu adăugată în istoric) — nu din răspunsul listei, care poate veni după ce ai plecat',
    /useEffect\(\(\) => \{ if \(anunt\) loc\.route\(adresaFaraAnunt\(loc\.path, loc\.query\), true\); \}, \[\]\);/.test(S.dev) &&
    (S.dev.match(/adresaFaraAnunt\(/g) || []).length === 1 && /import \{ anuntDinAdresa, adresaFaraAnunt \} from '\.\.\/lib\/push';/.test(S.dev) &&
    !/loc\.route\(/.test(functie(S.dev, 'function reload() {')));
  T('lista din bară arată „— alege firma —" cât firma aleasă nu e în listă (aceeași regulă ca „Trece pe firmă")',
    /const firmaVazuta = companies\.some\(\(c\) => c\.value === firmaBloc\) \? firmaBloc : '';/.test(S.dev) && /<select class="ap-sel" value=\{firmaVazuta\}/.test(S.dev) &&
    /if \(!Number\.isFinite\(coId\) \|\| !co\) \{ showToast\('Alege firma\.', true\); return; \}/.test(S.dev));

  // Invariantele lotului 4 (verify_facturare_telefon.js, secțiunea 4.1 și 4.2), aceleași expresii: nu le-am stricat.
  const tel = S.dev;
  const inv4 = [
    ['ecranul își ia CSS-ul lui (aparate.css)', /import '\.\/aparate\.css';/.test(tel)],
    ['bara „Trece pe firmă" stă DOAR în grupul „Neasignate"', /\{g\.k === '_neas' && baraBloc\(vazute\)\}/.test(tel) && (tel.match(/baraBloc\(/g) || []).length === 2],
    ['bifele: doar pe rândurile din „Neasignate", alături de rând', /g\.k === '_neas' \? randCuBifa\(d\)/.test(tel) && (tel.match(/randCuBifa\(/g) || []).length === 2 && /<label class="ap-bifa">/.test(tel)],
    ['ziua abonamentului: doar pe aparatele active de pe o firmă', /galeata\(d\) === 'active' \? randPeFirma\(d\)/.test(tel) && (tel.match(/randPeFirma\(/g) || []).length === 2 && /d\.company_id == null \? 'unassigned' : 'active'/.test(tel)],
    ['„Toate" bifează doar rândurile desenate pe ecran', /const vazute = g\.dev\.slice\(0, lim\);/.test(tel) && /const vii = vazute\.filter\(neasignatViu\);/.test(tel) && /bifeazaVazute\(b, vii, on\)/.test(tel) && /Toate \(\{vii\.length\}\)/.test(tel)],
    ['pleacă doar ce se vede bifat', /const alese = bifateVazute\(bife, vii\);/.test(tel) && /cereTrecerea\(alese\)/.test(tel) && /setIntreb\(\{ imeis: alese, coId, firma: co\.label \}\)/.test(tel) && /treceInBloc\(coId, imeis\)/.test(tel)],
    ['bifele ascunse se spun pe ecran, nu se trimit', /const ascunse = bifateAscunse\(bife, toate, vii\);/.test(tel) && /\{ascunse > 0 && \(/.test(tel)],
    ['firma aleasă nu se golește la o bifă (o singură scriere)', (tel.match(/setFirmaBloc\(/g) || []).length === 1 && /onChange=\{\(e: any\) => setFirmaBloc\(e\.target\.value\)\}/.test(tel)],
    ['firma demo nu apare în listă', /\.filter\(\(c: any\) => !c\.is_demo\)/.test(tel)],
    ['fără firmă aleasă nu pleacă nimic', /if \(!Number\.isFinite\(coId\) \|\| !co\) \{ showToast\('Alege firma\.', true\); return; \}/.test(tel)],
    ['întrebarea de confirmare vine ÎNAINTE de trimitere', /<Confirma title="Trece pe firmă" text=\{intrebareBloc\(intreb\.imeis\.length, intreb\.firma\)\}/.test(tel) && /onOk=\{executaTrecerea\}/.test(tel)],
    ['ce a sărit serverul stă pe ecran', /setRezBloc\(\{ text, sarite: sar\.map\(\(i\) => \(\{ imei: i, motiv: motivSarit\(i, proaspat\) \}\)\) \}\)/.test(tel) && /onClick=\{\(\) => setRezBloc\(null\)\}/.test(tel)],
    ['rutele noi o singură dată, prin api', (tel.match(/'\/api\/devices\/company-bulk'/g) || []).length === 1 && (tel.match(/'\/abonament'/g) || []).length === 1 && /import \{ api \} from '\.\.\/api\/client';/.test(tel)],
    ['mutarea veche în lot nu e atinsă', !/moveDevicesBulk|company\/bulk/.test(tel)],
    ['banda de sus spune cum se adoptă', /'\} mai jos, în grupul Neasignate, alege firma și apasă „Trece pe firmă"/.test(tel) && !/alege-i firma din fișa aparatului/.test(tel) && /nrDe\(counts\.unassigned, 'aparat neasignat s-a conectat', 'aparate neasignate s-au conectat'\)/.test(tel)],
    ['banda de sus la singular/plural', tel.indexOf("{counts.unassigned === 1 ? 'Ca să-l adopți: bifează-l' : 'Ca să le adopți: bifează-le'} mai jos, în grupul Neasignate") > 0 && tel.indexOf("s-au conectat')}. Ca să le adopți") < 0],
    ['fereastra zilei abonamentului', /type="date" value=\{abo\.v\} max=\{ziInput\(Date\.now\(\)\)\}/.test(tel) && /disabled=\{savingAbo \|\| inViitor\(abo\.v\)\}/.test(tel) && /puneAbonament\(abo\.d\.imei, v \|\| null\)/.test(tel)],
    ['bucata lotului 4 rulează cu vecinii ei de atunci (api, nrDe) — mai are toate funcțiile', ['bifeazaVazute', 'bifateVazute', 'bifateAscunse', 'intrebareBloc', 'treceInBloc', 'motivSarit', 'mesajBloc', 'ziInput', 'aboText', 'intrebareAbo', 'inViitor', 'puneAbonament', 'mesajAbo'].every((k) => typeof D[k] === 'function')],
  ];
  const inv4Rele = inv4.filter((x) => !x[1]).map((x) => x[0]);
  T('invariantele lotului 4 din Dispozitive stau în picioare (' + inv4.length + ' verificări, aceleași expresii ca verify_facturare_telefon)', !inv4Rele.length, inv4Rele.join(' | '));
  T('verify_contracte_telefon: „Adoptă aparatele" duce tot în Neasignate (RUTA_NEASIGNATE + neasignate: \'unassigned\')',
    /export const RUTA_NEASIGNATE = '\/admin\/devices\?filtru=neasignate'/.test(S.contracte) && /neasignate:\s*'unassigned'/.test(S.dev));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.4 Detaliul, lista, push-ul: drept la treaba de făcut, marcate citite');
  const det = S.detaliu, lst = S.lista;
  const iSpre = det.indexOf('const spre = x ? adresaAnunt(x.type, x.data) : null;'), iSetD = det.indexOf('setD(x); setAcked(!!x.acknowledged);');
  T('detaliul: anunțul cu loc → îl marchează citit și înlocuiește adresa, ÎNAINTE să se deseneze',
    iSpre > 0 && iSetD > iSpre && /if \(spre\) \{\n\s*if \(!x\.acknowledged\) Api\.ackNotification\(Number\(id\)\)\.then\(\(\) => refreshUnread\(\)\)\.catch\(\(\) => \{\}\);\n\s*loc\.route\(spre, true\);\n\s*return;\n\s*\}/.test(det.slice(iSpre, iSetD)) &&
    /import \{ adresaAnunt \} from '\.\.\/lib\/push';/.test(det));
  const iCtr = det.indexOf("x.type === 'contract_expira'");
  T('verify_contracte_telefon: „contract care expiră" tot se marchează citit înainte de mutare (neatins)',
    iCtr > 0 && /Api\.ackNotification\(Number\(id\)\)/.test(det.slice(iCtr, iCtr + 400)) && /refreshUnread\(\)/.test(det.slice(iCtr, iCtr + 400)) && iCtr < iSpre);
  const tap = functie(lst, 'function tap(n: NotificationItem) {');
  T('lista: atingerea unui anunț cu loc duce drept acolo și îl marchează citit (nu mai trece prin detaliul gol)',
    /const spre = adresaAnunt\(n\.type, n\.data\);\n\s*if \(spre\) \{\n\s*if \(!n\.acknowledged\) Api\.ackNotification\(n\.id\)\.then\(\(\) => refreshUnread\(\)\)\.catch\(\(\) => \{\}\);\n\s*loc\.route\(spre\);\n\s*return;\n\s*\}/.test(tap) &&
    tap.indexOf('adresaAnunt(') < tap.indexOf("loc.route('/notif/' + n.id)") && /import \{ adresaAnunt \} from '\.\.\/lib\/push';/.test(lst));
  T('o singură scriere a adresei unui anunț în telefon (lib/push.ts): nici lista, nici detaliul, nici Dispozitive nu și-o fac',
    !/filtru=neasignate|bifate=|rutaFactura\(/.test(det + lst) && !/'bifate'|bifate=|'firma'\)/.test(S.dev));
  T('rutele pe care le cheamă telefonul sunt cele din Api (endpoints.ts): lista, detaliul, „citit", Dispozitive',
    /notifications: \(\) => api<NotificationItem\[\]>\('\/api\/notifications'\)/.test(S.endpoints) && /ackNotification: \(id: number\) => api\(`\/api\/notifications\/\$\{id\}\/ack`, \{ method: 'POST' \}\)/.test(S.endpoints) &&
    /notifContext: \(id: number \| string\) => api<any>\(`\/api\/notifications\/\$\{id\}\/context`\)/.test(S.endpoints) && /adminDevices: \(\) => api<any\[\]>\('\/api\/admin\/devices'\)/.test(S.endpoints));
  T('Dispozitive și Facturare au rutele lor pe telefon (păzite doar pentru noi)', /<Route path="\/admin\/devices" component=\{P\.devices\} \/>/.test(S.app) && /devices: doarSuper\(AdminDevices,/.test(S.app) &&
    /<Route path="\/billing" component=\{Billing\} \/>/.test(S.app) && /<Route path="\/notif\/:id" component=\{NotifDetail\} \/>/.test(S.app));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('2.5 aparate.css: .ap-propus pe variabilele temei, contrastul măsurat pe amândouă temele');
  const cssFara = faraComentariiCss(S.css);
  T('culori doar din temă, fără alt font', !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(cssFara) && !/monospace/.test(cssFara) && (cssFara.match(/font-family:\s*[^;]+;/g) || []).every((x) => /inherit/.test(x)));
  const selectori = cssFara.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  T('fiecare regulă e pe o clasă „ap-…" (nu rescrie clasele comune)', selectori.every((s) => s.split(',').every((x) => /\.ap-/.test(x))), selectori.filter((s) => !s.split(',').every((x) => /\.ap-/.test(x))).join(' | '));
  {
    const blocVar = (src, sel) => { const i = src.indexOf(sel + ' {'); if (i < 0) throw new Error('nu găsesc ' + sel); const o = {}; src.slice(i, src.indexOf('}', i)).replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); }); return o; };
    let teme = null;
    try {
      teme = {
        intunecata: Object.assign({}, blocVar(S.tokens, ':root, :root[data-theme="dark"]'), blocVar(S.fondator, ':root')),
        deschisa: Object.assign({}, blocVar(S.tokens, ':root, :root[data-theme="dark"]'), blocVar(S.tokens, ':root[data-theme="light"]'), blocVar(S.fondator, ':root'), blocVar(S.fondator, ':root[data-theme="light"]')),
      };
    } catch (e) { console.log('    (' + e.message + ')'); }
    const rgb = (t, v) => {
      v = String(v).trim(); let m = /^var\((--[\w-]+)\)$/.exec(v); if (m) return rgb(t, t[m[1]]);
      m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16));
      m = /^#([0-9a-f]{3})$/i.exec(v); if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
      throw new Error('culoare necunoscută: ' + v);
    };
    const culoareRegula = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*?(?:^|[;{\\s])color:\\s*(var\\(--[\\w-]+\\))').exec(cssFara); return m ? m[1] : null; };
    const fundalBara = /\.ap-bloc \{[^}]*background:\s*color-mix\(in srgb, (var\(--[\w-]+\)) (\d+)%, transparent\)/.exec(cssFara);
    T('banda stă în bara .ap-bloc (fundal ușor colorat din temă, citit de acolo)', !!fundalBara);
    const slabe = [];
    if (teme && fundalBara) {
      for (const numeT of Object.keys(teme)) {
        const t = teme[numeT];
        const bara = amesteca(rgb(t, fundalBara[1]), Number(fundalBara[2]) / 100, rgb(t, 'var(--bg-panel)'));
        for (const [sel, prag] of [['.ap-propus', 4.5], ['.ap-propus b', 4.5], ['.ap-propus > svg', 3]]) {
          const c = culoareRegula(sel);
          if (!c) { slabe.push(sel + ': fără culoare'); continue; }
          const r = contrast(rgb(t, c), bara);
          if (r < prag) slabe.push(numeT + ' ' + sel + ' ' + c + ' = ' + r.toFixed(2) + ' (< ' + prag + ')');
        }
      }
    } else slabe.push('temele nu s-au citit');
    T('textul benzii (≥ 4,5:1) și iconița (≥ 3:1) se citesc pe AMÂNDOUĂ temele', !slabe.length, slabe.join(' | '));
  }

  // Pe server pornit: un tracker de probă pe TCP (Codec 8, un singur pachet), ca un aparat montat care tocmai a pornit.
  function pachet(ts, lat, lng, viteza) {
    const io = Buffer.concat([Buffer.from([0x00, 1]), Buffer.from([1, 239, 1]), Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
    const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
    const gps = Buffer.alloc(15);
    gps.writeInt32BE(Math.round(lng * 1e7), 0); gps.writeInt32BE(Math.round(lat * 1e7), 4);
    gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(viteza, 13);
    const data = Buffer.concat([Buffer.from([0x08, 0x01]), Buffer.concat([tsb, Buffer.from([0x01]), gps, io]), Buffer.from([0x01])]);
    const head = Buffer.alloc(8); head.writeUInt32BE(0, 0); head.writeUInt32BE(data.length, 4);
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  }
  function tracker(imei) {
    return new Promise((resolve) => {
      const s = net.connect(TCP, '127.0.0.1'); let pas = 0; const out = { primit: false, ack: null };
      const gata2 = () => { try { s.destroy(); } catch (e) {} resolve(out); };
      s.on('connect', () => { const im = Buffer.from(imei, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
      s.on('data', (b) => {
        if (pas === 0) { pas = 1; out.primit = b[0] === 1; s.write(pachet(Date.now() - 5000, 45.75, 21.22, 30)); return; }
        out.ack = b.length >= 4 ? b.readUInt32BE(0) : null; gata2();
      });
      s.on('error', () => gata2());
      s.on('close', () => gata2());
      setTimeout(gata2, 4000);
    });
  }
  const aziRo = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  const ziLa = (zi, oraUtc, minUtc) => { const p = zi.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2], oraUtc, minUtc || 0); };

  async function anunturiPeServer({ R, ck }) {
    sect('2.6 Pe server pornit: anunțuri adevărate, prin clientul HTTP al telefonului');
    // Clientul HTTP ADEVĂRAT al telefonului (mobile/src/api/client.ts, în browser — fără Capacitor), cu sesiunea noastră.
    const hook = {};
    const client = modul(tsJs(S.client.split('(import.meta as any).env').join('({})'), 'client.ts'), 'client.ts',
      { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } },
      { fetch: (...a) => hook.fetch(...a) }).exp;
    hook.fetch = (url, op) => fetch(BASE + url, Object.assign({}, op, { headers: Object.assign({}, op && op.headers, { Cookie: ck }) }));
    const api = client.api;

    // Aparatele de probă ale serverului stau fără firmă: le respingem, ca „Neasignate" să fie doar al nostru.
    for (const t of ['TEST111', 'TEST222']) await R('PUT', '/api/devices/' + t + '/status', { status: 'archived' });
    const co = (await R('POST', '/api/companies', { name: 'Transport Anunț SRL' })).j || {};
    T('firma de probă', !!co.id, J(co));
    const A = '860000000472001', B = '860000000472002', C = '860000000472003', Dd = '860000000472004', Z = '860000000472009';
    for (const i of [A, B, C, Dd, Z]) await R('POST', '/api/devices', { imei: i });
    const tr = [await tracker(A), await tracker(B), await tracker(C), await tracker(Dd)];
    T('patru trackere se conectează pe TCP și transmit (al cincilea tace)', tr.every((x) => x.primit && x.ack === 1), J(tr));
    await sleep(400);
    // Raportul instalatorului (ruta de probă = aceeași funcție de anunț ca semnalul): A+B la firmă; apoi C, alt lot, aceeași firmă; D fără firmă.
    const r1 = await R('POST', '/api/test/aparate-montate', { imeis: [A, B, Z], company_id: co.id });
    const r2 = await R('POST', '/api/test/aparate-montate', { imeis: [C], company_id: co.id });
    const r3 = await R('POST', '/api/test/aparate-montate', { imeis: [Dd] });
    T('trei anunțuri „aparate noi" (două pe firmă, unul fără)', r1.s === 200 && r1.j.anuntate === 2 && r2.s === 200 && r2.j.anuntate === 1 && r3.s === 200 && r3.j.anuntate === 1, J([r1, r2, r3]));

    const toate = await api('/api/notifications');
    const ap = (toate || []).filter((n) => n.type === 'aparate_noi');
    const n1 = ap.filter((n) => { const d = P.dateAnunt(n.data); return (d.imeis || []).indexOf(A) >= 0; })[0];
    const n3 = ap.filter((n) => { const d = P.dateAnunt(n.data); return (d.imeis || []).indexOf(Dd) >= 0; })[0];
    T('lista telefonului primește anunțurile, cu aparatele și firma în `data`', !!n1 && !!n3 && P.dateAnunt(n1.data).company_id === co.id && P.dateAnunt(n3.data).company_id == null, J(ap.map((n) => [n.title, n.data])));
    if (!n1 || !n3) return;
    const u1 = P.adresaAnunt(n1.type, n1.data);
    T('din listă: „' + n1.title + '" → Neasignate, cu A și B bifate și firma aleasă (Z nu transmite, nu e în anunț)',
      u1 === '/admin/devices?filtru=neasignate&bifate=' + [A, B].join(',') + '&firma=' + co.id || u1 === '/admin/devices?filtru=neasignate&bifate=' + [B, A].join(',') + '&firma=' + co.id, u1);
    const ctx1 = await api('/api/notifications/' + n1.id + '/context');
    T('din detaliu (ce citește NotifDetail): aceeași adresă ca din listă', P.adresaAnunt(ctx1.type, ctx1.data) === u1 && ctx1.acknowledged === false, J([ctx1.type, ctx1.data]));
    const lst1 = await api('/api/admin/devices');
    const w1 = webAparate(P.dateAnunt(n1.data), lst1), t1 = telAparate(P.dateAnunt(n1.data), lst1);
    T('bifele din anunț: A, B și C (propus aceleiași firme în alt anunț) — ca pe web', J(t1) === J(w1) && J(t1.bife) === J([A, B, C].sort()) && t1.firma === String(co.id), 'web ' + J(w1) + ' / tel ' + J(t1));
    const w3 = webAparate(P.dateAnunt(n3.data), lst1), t3 = telAparate(P.dateAnunt(n3.data), lst1);
    T('anunțul fără firmă: doar D, nicio firmă aleasă — ca pe web', J(t3) === J(w3) && J(t3.bife) === J([Dd]) && t3.firma === '', 'web ' + J(w3) + ' / tel ' + J(t3));
    const bife1 = D.bifeDinAnunt(lst1, P.anuntDinAdresa(citita(u1).query));
    const alese1 = D.bifateVazute(bife1, lst1.filter(D.neasignatViu));
    T('banda pe ecran: „Firma e propusă de montajul din calendar: ' + co.name + '"', D.firmaPropusa(P.anuntDinAdresa(citita(u1).query), String(co.id), alese1, bife1, [{ value: String(co.id), label: co.name }]) === co.name);

    // „Trece pe firmă" pentru A (apăsarea omului) → la al doilea clic pe același anunț, A nu mai e bifat.
    const tb = await api('/api/devices/company-bulk', { method: 'PUT', body: { company_id: co.id, imeis: [A] } });
    const lst2 = await api('/api/admin/devices');
    const w2 = webAparate(P.dateAnunt(n1.data), lst2), t2 = telAparate(P.dateAnunt(n1.data), lst2);
    T('după „Trece pe firmă" pentru A, același anunț bifează doar B și C — ca pe web', tb && tb.trecute === 1 && J(t2) === J(w2) && J(t2.bife) === J([B, C].sort()), 'web ' + J(w2) + ' / tel ' + J(t2));

    // „Citit": ce face telefonul când detaliul nu se mai desenează.
    const nr0 = ((await api('/api/notifications/unread-count')) || {}).count;
    await api('/api/notifications/' + n1.id + '/ack', { method: 'POST' });
    const ctx1b = await api('/api/notifications/' + n1.id + '/context');
    const nr1 = ((await api('/api/notifications/unread-count')) || {}).count;
    T('marcat citit prin aceeași rută ca pe telefon: detaliul îl vede citit, numărul scade cu 1', ctx1b.acknowledged === true && nr1 === nr0 - 1, J([nr0, nr1, ctx1b.acknowledged]));

    // „Montaj de facturat": contractul semnat, montajul de azi, montat; ceasul mutat în ziua în care se încheie luna.
    await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 21 } });
    const part = (await R('POST', '/api/montaj/parteneri', { name: 'Ionescu Montaj SRL', tarife: { gps: 60 } })).j || {};
    const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Anunț', client_name: co.name, monthly_total: 58, currency: 'RON',
      config: { cfg: { nVeh: 2, contractMonths: 12, montaj: { qGps: 2 }, devices: {} }, prices: { pPlain: 29, mGps: 150 } } })).j || {};
    await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO7472', address: 'Str. Anunțului 5', legal_rep: { name: 'Ana Anunț', role: 'Administrator' } });
    const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
      din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 2, pret: 29, total: 58 }], servicii: [] } })).j || {};
    for (const st of ['aprobat', 'trimis']) await R('PUT', '/api/contracts/' + c.id, { status: st });
    await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
    const luc = ((await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: ziLa(aziRo, 9), partener_id: part.id, cate: { gps: 2 } })).j || {}).lucrare || {};
    const mont = await R('POST', '/api/montaje/' + luc.id + '/montata', { masini: 2 });
    T('montajul de azi: programat și montat (2 mașini)', !!luc.id && mont.s === 200, J([luc, mont]));
    const gataDin = (require('./montaj.js').perioadaFacturare(aziRo, 'lunar') || {}).gataDin;
    const k = (await R('POST', '/api/test/ceasuri', { acum: ziLa(gataDin, 7) })).j || {};
    const nm = ((await api('/api/notifications')) || []).filter((n) => n.type === 'montaj_de_facturat' && P.dateAnunt(n.data).company_id === co.id)[0];
    T('anunțul „Montaj de facturat" a plecat (ceasul mutat pe ' + gataDin + ')', !!nm && J(P.dateAnunt(nm.data).lucrari) === J([luc.id]), J([k, nm && nm.data]));
    if (nm) {
      const um = P.adresaAnunt(nm.type, nm.data);
      const cm = await api('/api/notifications/' + nm.id + '/context');
      T('din listă și din detaliu: factura unică a firmei, cu lucrarea pusă (rutaFactura)', um === F.rutaFactura(co.id, 'unica', { lucrari: [luc.id] }) && P.adresaAnunt(cm.type, cm.data) === um, um);
      const wm = webMontaj(P.dateAnunt(nm.data));
      const q = citita(um).query;
      T('…aceeași firmă și aceleași lucrări pe care le pune web-ul (raxFacturaMontaj)', !!wm && wm[0] === Number(q.factura) && J(wm[1]) === J(q.lucrari.split(',').map(Number)) && wm[2] === true, J([wm, q]));
      const dr = await api('/api/invoices/draft', { method: 'POST', body: { companyId: co.id, fel: 'unica' } });
      const propuse = ((dr && dr.dinContract && dr.dinContract.lucrari) || []).map((j) => j.id);
      T('…și fereastra facturii chiar le poate pune: ciorna unică le propune pe toate', q.lucrari.split(',').map(Number).every((id) => propuse.indexOf(id) >= 0), J(propuse));
    }
    // Push: ce primește telefonul pentru un anunț (FCM face textul) → detaliul lui, care duce mai departe.
    T('push-ul anunțului (FCM: { type, notifId } ca text) → /notif/<id> → aceeași adresă ca din listă',
      P.adresaPush({ type: String(n1.type), notifId: String(n1.id) }) === '/notif/' + n1.id);
  }
  return anunturiPeServer;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Contracte și fișa firmei (ContractPasi.tsx, ContractDetail.tsx, ContractDrum.tsx, ContractMontaj.tsx,
//    CompanySheet.tsx, Offers.tsx) fac ce face web-ul după lucrul lui Alin din 30.09:
//   R4/L4  „E semnat" pe un contract cu aparate VÂNDUTE → proforma aparatelor, gata pregătită (raxProformaLaSemnare)
//   R2/L2  „Programează montajul" (drum) și „Programează în calendar" (dosar) → calendarul, la un contract semnat;
//          la unul nesemnat, formularul lucrării din dosar rămâne (el scrie Anexa nr. 2)
//   L3     banda „Termenul de montaj" pe drum: portocaliu aproape, roșu depășit, cu textele de pe web
//   L13    după ✓ „Încasată" pe o proformă, din fișa firmei: și ce a plecat (anunțul, emailul, ANAF)
//   L14    pe rândul ofertei, butonul cu nume „Deschide dosarul clientului"
// Fără server. Rulează bucățile paginii (decupate, în vm) și pe ale telefonului (TypeScript tradus, modulele ADEVĂRATE,
// desenate cu preact-render-to-string) pe aceleași cazuri; drumurile le face regula adevărată a serverului
// (contracts.drumulClientului). Fără preact-render-to-string (CI), banda din 3.3 — citită din desen — se sare.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function parteaContracte() {
  sect('3. Contracte și fișa firmei: proforma la semnare, montajul în calendar, termenul de montaj, „Încasată", dosarul');
  const C = require('./contracts');
  const deHtml = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // Contrastul (WCAG) și o culoare pusă cu transparență peste fundal.
  const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const amesteca = (c, p, fundal) => c.map((x, i) => x * p + fundal[i] * (1 - p));
  const hex = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };

  // preact-ul adevărat din mobile/node_modules; fără el (CI), cel „de carton" de sus.
  const preact = PREACT ? PREACT.preact : preactCarton, hooks = PREACT ? PREACT.hooks : hooksCarton;
  const jsxRt = PREACT ? PREACT.jsxRt : jsxCarton, rts = PREACT ? PREACT.rts : null;
  const h = jsxRt.jsx;
  function rezolva(dela, id) {
    const baza = path.posix.join(path.posix.dirname(dela), id);
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(path.join(ROOT, baza + ext))) return baza + ext;
    throw new Error('nu găsesc ' + id + ' (din ' + dela + ')');
  }
  // `stubs`: ce se dă în locul unui import (după textul lui exact); restul importurilor relative se încarcă ADEVĂRATE.
  function incarca(rel, stubs, globale) {
    const js = ts.transpileModule(citeste(rel), { fileName: path.basename(rel), compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'preact' } }).outputText;
    const m = { exports: {} };
    const ctx = vm.createContext(Object.assign({
      module: m, exports: m.exports, console, setTimeout, clearTimeout,
      require: (id) => {
        if (stubs && Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
        if (/\.css$/.test(id)) return {};
        if (id === 'preact') return preact;
        if (id === 'preact/hooks') return hooks;
        if (id === 'preact/jsx-runtime') return jsxRt;
        if (id.charAt(0) === '.') return incarca(rezolva(rel, id), stubs, globale).exp;
        throw new Error('require neașteptat în ' + rel + ': ' + id);
      },
    }, globale || {}));
    vm.runInContext(js, ctx, { filename: rel });
    return { exp: m.exports, ctx };
  }
  // Textul unui arbore de VNode-uri și butoanele din el (ca să apăsăm „onClick"-ul adevărat).
  function textVNode(v) {
    if (v == null || v === false || v === true) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(textVNode).join('');
    return textVNode(v.props && v.props.children);
  }
  function butoane(v, out) {
    out = out || [];
    if (v == null || typeof v !== 'object') return out;
    if (Array.isArray(v)) { v.forEach((x) => butoane(x, out)); return out; }
    if (v.type === 'button') out.push({ text: textVNode(v).trim(), props: v.props });
    butoane(v.props && v.props.children, out);
    return out;
  }

  const pasiSrc = citeste('mobile/src/components/ContractPasi.tsx');
  const detSrc = citeste('mobile/src/screens/ContractDetail.tsx');
  const drumSrc = citeste('mobile/src/components/ContractDrum.tsx');
  const montSrc = citeste('mobile/src/components/ContractMontaj.tsx');
  const fisaSrc = citeste('mobile/src/screens/CompanySheet.tsx');
  const ofSrc = citeste('mobile/src/screens/Offers.tsx');
  const cssCtr = citeste('mobile/src/screens/contracte.css');
  const tokens = citeste('mobile/src/theme/tokens.css');
  const appCss = citeste('public/css/app.css');
  const inapoiSrc = citeste('mobile/src/lib/inapoiFoaie.ts');

  // Modulele telefonului de care e nevoie, cu ce ține de ecran înlocuit (API, mesaje, foi, iconițe, router).
  const toasturi = [];
  const drumuri = [];
  const loc = { route: (u, inlocuieste) => drumuri.push([u, !!inlocuieste]), query: {} };
  const STUB = {
    '../api/endpoints': { Api: {} }, '../api/client': { api: () => Promise.resolve({}) },
    '../app/store': { showToast: (t) => toasturi.push(t) }, '../lib/inapoiFoaie': { useInapoiInchide: () => {} },
    './ContractUi': { AlegeFisier: () => null }, './FlotaUi': { Confirma: () => null },
    './Icon': { Icon: (p) => h('i', { 'data-ic': p.name, class: p.class }) }, 'preact-iso': { useLocation: () => loc },
  };
  let P = null, D = null, F = null, CO = null, MJ = null;
  try { F = incarca('mobile/src/lib/factura.ts', STUB).exp; } catch (e) { console.log('    (lib/factura.ts: ' + e.message + ')'); }
  try { CO = incarca('mobile/src/lib/companii.ts', STUB).exp; } catch (e) { console.log('    (lib/companii.ts: ' + e.message + ')'); }
  try { P = incarca('mobile/src/components/ContractPasi.tsx', STUB, { history: { state: null } }); } catch (e) { console.log('    (ContractPasi.tsx: ' + e.message + ')'); }
  try { D = incarca('mobile/src/components/ContractDrum.tsx', STUB).exp; } catch (e) { console.log('    (ContractDrum.tsx: ' + e.message + ')'); }
  try { MJ = incarca('mobile/src/lib/calendarMontaj.ts', STUB).exp; } catch (e) { console.log('    (lib/calendarMontaj.ts: ' + e.message + ')'); }
  sect('3.0 Modulele telefonului se traduc și rulează');
  T('lib/factura, lib/companii, lib/calendarMontaj, ContractPasi și ContractDrum se încarcă (module adevărate)',
    !!F && !!CO && !!P && !!D && !!MJ && typeof P.exp.usePasiContract === 'function' && typeof D.DrumClient === 'function');

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.1 R4/L4 — „E semnat" cu aparate vândute deschide proforma aparatelor (web: raxProformaLaSemnare)');
  // 3.1.1 Regula web-ului, citită din pagină (dacă se schimbă acolo, proba spune).
  const webAre = functie(html, 'function _areAparateVandute(c) {');
  const webSemnat = functie(html, 'window.raxCtreSemnat = async function (id) {');
  const webTreci = functie(html, 'window.raxCtrTreci = async function (stareNoua) {');
  const webProforma = functie(html, 'window.raxProformaLaSemnare = async function (companyId) {');
  T('pe web: „E semnat" din listă/drum → proforma, DOAR după ce serverul a primit semnarea și doar cu aparate vândute',
    /if \(await _ctrePut\(id, \{ status: 'activ', signed_at: ms \}, 'Contract semnat și în dosar ✓'\) && _areAparateVandute\(c\)\) raxProformaLaSemnare\(c\.company_id\);/.test(webSemnat));
  T('pe web: butonul mare din fișă („Contractul e semnat") → la fel, pe contractul de dinainte de salvare',
    /var cSemnat = stareNoua === 'activ' && window\._raxCtr \? \{ companyId: _raxCtr\.id, contract: _raxCtr\.contract \} : null;/.test(webTreci) &&
    /if \(okS && cSemnat && _areAparateVandute\(cSemnat\.contract\)\) raxProformaLaSemnare\(cSemnat\.companyId\);/.test(webTreci));
  T('pe web: proforma = „Generează factură" pe factura unică, tip proformă, cu aparatele din contract puse (nu se emite singură)',
    /raxOpenGenInvoice\(companyId, 'unica'\);/.test(webProforma) && /raxGiTip\('proforma'\);/.test(webProforma) && /_giPuneContract\('aparate'\)/.test(webProforma) &&
    !/raxGenIssue|\/api\/invoices['"]\s*,\s*\{\s*method: 'POST'/.test(webProforma));

  // 3.1.2 Aceeași regulă „are aparate vândute", RULATĂ pe amândouă.
  let areWeb = null;
  try { areWeb = new Function(webAre + '\nreturn _areAparateVandute;')(); } catch (e) { areWeb = null; }
  const areTel = P && P.exp.areAparateVandute;
  T('găsesc și pot rula _areAparateVandute (web) și areAparateVandute (telefon)', typeof areWeb === 'function' && typeof areTel === 'function');
  if (typeof areWeb === 'function' && typeof areTel === 'function') {
    const eq = { echipamente: { items: [{ tip: 'fmc130', buc: 3, pretEur: 55 }], totalLei: 800 }, items: [{ tip: 'gps', buc: 3 }] };
    const cazuri = [undefined, null, {}, { montaj: null }, { montaj: {} }, { montaj: { items: [{ tip: 'gps', buc: 2 }] } },
      { montaj: { echipamente: {} } }, { montaj: { echipamente: { items: [] } } }, { montaj: { echipamente: { items: null } } },
      { montaj: eq }, { montaj: JSON.stringify(eq) }, { montaj: '{' }, { montaj: 'null' }, { montaj: '"x"' }, { montaj: '' },
      // Aparate închiriate: montajul e în anexă, dar echipamentele vândute lipsesc (nu există avans).
      { montaj: { items: [{ tip: 'gps', buc: 4 }], echipamente: { items: [], totalLei: 0 } } },
      { montaj: JSON.stringify({ items: [{ tip: 'gps', buc: 4 }], echipamente: { items: [] } }) },
      { montaj: JSON.stringify({ items: [{ tip: 'gps', buc: 5 }] }) }, { status: 'trimis', company_id: 5, montaj: eq }];
    const dif = cazuri.filter((c) => areWeb(c) !== areTel(c)).map((c) => J(c));
    T('„are aparate vândute" dă același răspuns ca pe web, pe ' + cazuri.length + ' cazuri (anexă lipsă, text din bază, stricată, doar montaj…)', !dif.length, dif.join(' | '));
    T('… și chiar deosebește: aparate vândute → da; doar montaj / aparate închiriate / anexă goală / stricată → nu',
      areTel({ montaj: eq }) === true && areTel({ montaj: JSON.stringify(eq) }) === true && areTel({ montaj: { items: [{ tip: 'gps', buc: 2 }] } }) === false &&
      areTel({ montaj: { items: [{ tip: 'gps', buc: 4 }], echipamente: { items: [], totalLei: 0 } } }) === false &&
      areTel({ montaj: '{' }) === false && areTel(null) === false);
  }

  // 3.1.3 Adresa: aceeași fereastră ca pe web, prin rutaFactura (lib/factura.ts) — fără a doua adresă scrisă de mână.
  T('proforma se deschide pe adresa făcută de rutaFactura (factura unică, tip proformă, aparatele puse)',
    /export const rutaProformaLaSemnare = \(companyId: any\) => rutaFactura\(companyId, 'unica', \{ tip: 'proforma', aparate: true \}\);/.test(pasiSrc) &&
    !/['"`]\/billing/.test(faraComentarii(pasiSrc + '\n' + detSrc)));
  if (P && F) {
    const u = String(P.exp.rutaProformaLaSemnare(5)), q = new URLSearchParams(u.split('?')[1] || '');
    T('adresa proformei, rulată: /billing, firma, fel=unica, tip=proforma, aparate=1', u.indexOf('/billing?') === 0 && q.get('factura') === '5' &&
      q.get('fel') === 'unica' && q.get('tip') === 'proforma' && q.get('aparate') === '1' && F.felDinAdresa(q.get('fel')) === 'unica', u);
    T('… identică cu rutaFactura(…, \'unica\', { tip: \'proforma\', aparate: true }) din lib/factura.ts', u === F.rutaFactura(5, 'unica', { tip: 'proforma', aparate: true }), u);
  }

  // 3.1.4 Istoricul („înapoi" pe Android): cât stă deschisă foaia/întrebarea (păzită), ultima intrare e a ei; adresa
  // proformei o ÎNLOCUIEȘTE, ca „înapoi" din Facturare să aducă pe ecranul contractului, nu pe o intrare goală.
  T('lib/inapoiFoaie.ts își marchează intrarea cu `raFoaie` și n-o mai scoate când s-a plecat de pe ea (legătura cu spreProforma)',
    /history\.pushState\(\{ raFoaie: id \}, '', location\.href\)/.test(inapoiSrc) && /return !!\(s && s\.raFoaie === id\);/.test(inapoiSrc) &&
    /if \(armat && aNoastra\(id\)\) scoateIntrarea\(\);/.test(inapoiSrc));
  if (P) {
    const stare = (s) => { P.ctx.history = { state: s }; drumuri.length = 0; P.exp.spreProforma(loc, 5); return drumuri[0] || []; };
    const a = stare({ raFoaie: 'foaie-7' }), b = stare(null), c2 = stare({});
    T('spreProforma, rulată: pe intrarea foii → ÎNLOCUIEȘTE; fără ea → adaugă, ca de obicei', a[1] === true && b[1] === false && c2[1] === false &&
      a[0] === P.exp.rutaProformaLaSemnare(5) && b[0] === a[0], J([a, b, c2]));
    // Istoricul, pas cu pas: [ecran] → foaia își pune intrarea → „E semnat" → proforma → „înapoi".
    const stiva = [['/admin/contracts', null]];
    stiva.push(['/admin/contracts', { raFoaie: 'foaie-1' }]);
    P.ctx.history = { get state() { return stiva[stiva.length - 1][1]; } };
    const locIst = { route: (u, inl) => { if (inl) stiva[stiva.length - 1] = [u, null]; else stiva.push([u, null]); } };
    P.exp.spreProforma(locIst, 5);
    const inFacturare = stiva[stiva.length - 1][0];
    stiva.pop();
    T('„înapoi" din Facturare aduce pe ecranul de unde s-a semnat (nu pe intrarea rămasă a foii)', /^\/billing\?/.test(inFacturare) && stiva.length === 1 && stiva[0][0] === '/admin/contracts', J(stiva));
    P.ctx.history = { state: null };
  }

  // 3.1.5 Pe telefon: aceleași trei locuri ca pe web (listă, drumul din fișa firmei, dosar) — și doar după semnare.
  T('foaia „E semnat" spune dacă serverul a primit semnarea (abia atunci `semnat = true`)',
    /await Api\.updateContract\(Number\(c\.id\), \{ status: 'activ', signed_at: ziLaPranz\(ziS\) \|\| Date\.now\(\) \}\);\s*semnat = true;/.test(pasiSrc) &&
    /let semnat = false;/.test(pasiSrc) && /onGata\(semnat\);/.test(pasiSrc) &&
    /catch \(e: any\) \{ setBusy\(false\); showToast\(e\?\.message \|\| 'Eroare', true\); return; \}/.test(pasiSrc));
  T('după foaie: semnat + aparate vândute → proforma; altfel închide și reîncarcă (listă, drumul din fișa firmei, dosar — aceeași funcție)',
    /function dupaSemnare\(c: any, semnat: boolean\) \{\s*if \(semnat && areAparateVandute\(c\)\) \{ spreProforma\(loc, c\.company_id\); setDlg\(null\); return; \}\s*setDlg\(null\);\s*o\.laSchimbat\(\);\s*\}/.test(pasiSrc) &&
    /\{dlg\.fel === 'semnat' && <SemnatFoaie c=\{dlg\.c\} onInchide=\{\(\) => setDlg\(null\)\} onGata=\{\(semnat\) => dupaSemnare\(dlg\.c, semnat\)\} \/>\}/.test(pasiSrc));
  const fnSalv = functie(detSrc, 'async function salveaza(stareNoua?: string, motiv?: string | null, semnatAzi?: string): Promise<any | null> {');
  const iUpd = fnSalv.indexOf('await Api.updateContract(Number(c.id), trup);');
  const iCatch = fnSalv.indexOf('return null;', iUpd);
  const iPro = fnSalv.indexOf("if (stareNoua === 'activ' && areAparateVandute(c)) { spreProforma(loc, companyId); setDialog(''); setBusy(false); return null; }");
  const iDlg = fnSalv.indexOf("setDialog('');\n    try { return await incarca(); } finally { setBusy(false); }");
  T('în dosar, butonul mare („Contractul e semnat"): proforma DUPĂ salvarea reușită, ÎNAINTE de a închide întrebarea (ca raxCtrTreci)',
    iUpd > 0 && iCatch > iUpd && iPro > iCatch && iDlg > iPro, [iUpd, iCatch, iPro, iDlg].join(','));
  T('… întrebarea „Contractul e semnat?" trece prin salvarea cu starea „activ"', /onOk=\{\(\) => \{ const z = form && form\.signed \? undefined : azi\(\); if \(z\) sf\('signed', z\); salveaza\('activ', null, z\); \}\}/.test(detSrc));
  T('niciun document emis de telefon la semnare (doar se deschide fereastra; emiterea rămâne a omului)',
    !/invoiceCreate|createInvoice|\/api\/invoices['"`]/.test(faraComentarii(pasiSrc + detSrc)));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.2 R2/L2 — la un contract semnat, montajul se programează în CALENDAR (web: raxDrumMontaj)');
  const calSrc = citeste('mobile/src/lib/calendarMontaj.ts');
  T('adresa calendarului e UNA, în lib/calendarMontaj.ts; drumul și dosarul o importă',
    /export const rutaCalendarMontaj = /.test(calSrc) && /import \{ rutaCalendarMontaj \} from '\.\.\/lib\/calendarMontaj';/.test(pasiSrc) &&
    /import \{ rutaCalendarMontaj \} from '\.\.\/lib\/calendarMontaj';/.test(montSrc) && !/export const rutaCalendarMontaj/.test(pasiSrc + montSrc));
  if (P && MJ) {
    // Butonul ADEVĂRAT al drumului, apăsat: hook-ul rulat într-o componentă desenată, onClick-ul lui chemat.
    const rand = { id: 42, company_id: 5, status: 'activ', montaj: { items: [{ tip: 'gps', buc: 2 }] },
      drum: C.drumulClientului({ contract: { status: 'activ', montaj: { items: [{ tip: 'gps', buc: 2 }] } }, areOferta: true, montaje: { total: 0, executate: 0 }, aparate: 0, facturi: 0 }) };
    let prins = null;
    const Test = () => { const p = P.exp.usePasiContract({ trimitePeEmail: true, laSchimbat: () => {} }); prins = { drum: p.butonDrum('montaj', rand), pas: p.pas(rand) }; return null; };
    // Fără preact-render-to-string (CI) cârligul rulează ca la primul desen, cu cârligele „de carton" de sus.
    try { if (rts) rts.renderToString(h(Test, {})); else Test(); } catch (e) { console.log('    (' + e.message + ')'); }
    const bDrum = prins && butoane(prins.drum)[0];
    drumuri.length = 0;
    if (bDrum) bDrum.props.onClick();
    const u = drumuri[0] && drumuri[0][0], q = new URLSearchParams(String(u || '').split('?')[1] || '');
    T('„Programează montajul" (drum, fișa firmei, dosar), apăsat: duce în calendar, pe contractul clientului',
      !!bDrum && bDrum.text === 'Programează montajul' && String(u).indexOf('/admin/montaj?') === 0 && q.get('fila') === 'calendar' && q.get('contract') === '42' &&
      drumuri[0][1] === false && u === MJ.rutaCalendarMontaj(42), J(drumuri) + ' / ' + (bDrum && bDrum.text));
    // Rândul din lista Contracte: după semnare, pasul drumului („urmează: montajul · …") cu același buton.
    const bPas = prins && butoane(prins.pas).filter((b) => b.text === 'Programează montajul')[0];
    drumuri.length = 0;
    if (bPas) bPas.props.onClick();
    T('… și de pe rândul din lista Contracte („urmează: montajul")', !!bPas && drumuri.length === 1 && drumuri[0][0] === MJ.rutaCalendarMontaj(42) &&
      /urmează: montajul/.test(textVNode(prins.pas)), J(drumuri));
  }
  T('calea veche a plecat: niciun `?lucrare=noua`, niciun formular de lucrare deschis din drum',
    !/lucrare=noua|montajNou|deschideNoua|biletFolosit|setBilet|\.lucrare\b/.test(faraComentarii(pasiSrc + detSrc + montSrc + fisaSrc)));
  // Dosarul, sub lucrări: aceeași condiție ca pe web (raxMontajRandeaza, rulat pe fiecare stare a contractului).
  const fnRand = functie(html, 'window.raxMontajRandeaza = function () {');
  const mProg = /export const programeazaInCalendar = \(contract: any\): boolean => ([^;\n]+);/.exec(montSrc);
  let progTel = null; try { progTel = mProg ? new Function('contract', 'return ' + mProg[1] + ';') : null; } catch (e) { progTel = null; }
  const subLucrariWeb = (contract) => {
    const box = { innerHTML: '' };
    const W = { _raxMont: { companyId: 5, lucrari: [], parteneri: [], edit: null }, _raxCtr: contract === undefined ? null : { contract },
      document: { getElementById: () => box }, esc: (x) => String(x == null ? '' : x), _zile: () => '', _lei: (v) => String(v), MONTAJ_STARI: {}, window: {} };
    new Function(...Object.keys(W), fnRand + '\nwindow.raxMontajRandeaza();')(...Object.values(W));
    return /onclick="raxDrumMontaj\(5\)"><i class="fas fa-calendar-plus"><\/i> Programează în calendar<\/button>/.test(box.innerHTML) ? 'calendar'
      : /onclick="raxMontajEdit\(0\)"><i class="fas fa-plus"><\/i> Lucrare de montaj<\/button>/.test(box.innerHTML) ? 'formular' : '?';
  };
  T('găsesc și pot rula raxMontajRandeaza (web) și programeazaInCalendar (telefon)', !!fnRand && typeof progTel === 'function');
  if (fnRand && progTel) {
    const stari = [undefined, null, {}, { status: 'ciorna' }, { status: 'aprobat' }, { status: 'trimis' }, { status: 'activ' }, { status: 'incheiat' }];
    const rez = stari.map((k) => { let w; try { w = subLucrariWeb(k); } catch (e) { w = 'eroare: ' + e.message; } return [J(k), w, progTel(k) ? 'calendar' : 'formular']; });
    T('sub lucrări, pe fiecare stare: semnat („activ") → „Programează în calendar"; altfel → „Lucrare de montaj", ca pe web',
      rez.every((r) => r[1] === r[2]) && rez.filter((r) => r[2] === 'calendar').length === 1, J(rez));
  }
  T('butonul din dosar duce pe ACEEAȘI adresă a calendarului, cu contractul; formularul unei lucrări noi se deschide doar pe cealaltă ramură',
    /\{programeazaInCalendar\(contract\)\s*\?\s*<button class="ctr-btn pri"[^\n]*onClick=\{\(\) => loc\.route\(rutaCalendarMontaj\(contract\.id\)\)\}><Icon name="calendar" size=\{16\} \/> Programează în calendar<\/button>\s*:\s*<button class="ctr-btn"[^\n]*onClick=\{\(\) => deschide\(null\)\}>/.test(montSrc) &&
    (montSrc.match(/deschide\(null\)/g) || []).length === 1);

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.3 L3 — banda „Termenul de montaj" pe drum (web: _raxDrumHtml)');
  // Pagina: drumul întreg, desenat de _raxDrumHtml, cu vecinii lui.
  const webDrum = [
    (/function esc\(s\) \{[^\n]*\n/.exec(html) || [''])[0],
    (/var DRUM_IC = \{[^\n]*\};/.exec(html) || [''])[0],
    functie(html, 'function _drumButon(cheie, c, companyId, inFisa) {'),
    functie(html, 'function _raxDrumHtml(dr, c, companyId) {'),
  ].join('\n');
  let drumWeb = null;
  try { drumWeb = new Function('_raxCtre', webDrum + '\nreturn _raxDrumHtml;')({ trimite: false }); } catch (e) { console.log('    (' + e.message + ')'); }
  T('găsesc și pot rula _raxDrumHtml (web) și DrumClient + termenMontajText (telefon)', typeof drumWeb === 'function' && !!D && typeof D.termenMontajText === 'function' && !!CO);
  // Banda din fiecare desen: felul (curand/depasit), iconița și textul; și locul ei (după pași, înainte de „Pasul următor").
  const bandaWeb = (hh) => {
    const m = /<div class="drum-termen (\w+)"><i class="fas fa-([\w-]+)"><\/i> ([\s\S]*?)<\/div>/.exec(hh);
    if (!m) return null;
    const iB = hh.indexOf('<div class="drum-termen'), iP = hh.lastIndexOf('<div class="drum-pas '), iU = hh.indexOf('<div class="drum-urm">');
    return { fel: m[1], ic: m[2], text: deHtml(m[3]), loc: iP < iB && iB < iU };
  };
  const bandaTel = (hh) => {
    const m = /<div class="ctr-drum-termen (\w+)"><i data-ic="(\w+)" class="ic"><\/i><span>([\s\S]*?)<\/span><\/div>/.exec(hh);
    if (!m) return null;
    const iB = hh.indexOf('<div class="ctr-drum-termen'), iP = hh.lastIndexOf('<div class="ctr-drum-pas '), iU = hh.indexOf('<div class="ctr-drum-urm">');
    return { fel: m[1], ic: m[2], text: deHtml(m[3]), loc: iP < iB && iB < iU };
  };
  const IC = { 'hourglass-half': 'clock', 'circle-exclamation': 'alertO' };
  if (typeof drumWeb === 'function' && D && CO) {
    // Drumuri făcute de regula ADEVĂRATĂ a serverului (contracts.drumulClientului), ca în verify_drum.js: ora României.
    const zb = (y, m, d, hh) => Date.UTC(y, m - 1, d, (hh == null ? 12 : hh) - 2);
    const cu = (buc) => ({ id: 9, company_id: 5, status: 'activ', signed_at: zb(2027, 1, 5), created_at: zb(2027, 1, 4), montaj: { items: [{ tip: 'gps', buc }] } });
    const drumLa = (contract, montate, avansLa, acum) => C.drumulClientului({ contract, areOferta: true,
      montaje: { total: 1, executate: montate ? 1 : 0, montate }, aparate: 0, facturi: 0, avansLa, acum });
    const avans = zb(2027, 1, 6, 10);
    const avansNoapte = zb(2027, 1, 6, 0) + 30 * 60000; // 00:30 la București = încă 5 ianuarie în UTC
    const cazuri = [
      ['în termen (21 de zile)', drumLa(cu(50), 10, avans, zb(2027, 1, 15, 9)), null],
      ['aproape: mai sunt 7 zile', drumLa(cu(50), 10, avans, zb(2027, 1, 29, 9)), 'curand'],
      ['aproape: mai e o zi', drumLa(cu(50), 0, avans, zb(2027, 2, 4, 9)), 'curand'],
      ['aproape: azi e ultima zi', drumLa(cu(50), 49, avans, zb(2027, 2, 5, 23)), 'curand'],
      ['depășit cu 3 zile', drumLa(cu(50), 10, avans, zb(2027, 2, 8, 9)), 'depasit'],
      ['depășit cu 21 de zile, o mașină („0 din 1 mașină montată")', drumLa(cu(1), 0, avans, zb(2027, 2, 26, 9)), 'depasit'],
      ['depășit, 21 de mașini', drumLa(cu(21), 20, avans, zb(2027, 3, 10, 9)), 'depasit'],
      ['avans plătit la 00:30 (ziua se scrie pe ora României)', drumLa(cu(50), 10, avansNoapte, zb(2027, 2, 1, 9)), 'curand'],
      ['toate montate → fără bandă', drumLa(cu(50), 50, avans, zb(2027, 3, 1)), null],
      ['fără avans încasat → fără bandă', drumLa(cu(50), 10, null, zb(2027, 2, 8)), null],
    ];
    // Banda telefonului se citește din DESENUL lui (preact-render-to-string): fără el (CI), verificarea se sare.
    if (!rts) SARI('banda: același fel, același text, aceeași iconiță și același loc ca pe web, pe ' + cazuri.length + ' drumuri făcute de server', FARA_DESEN);
    else {
      const dif = [];
      let cuBanda = 0;
      cazuri.forEach(([nume, dr, felAsteptat]) => {
        const cc = { id: 9, status: 'activ' };
        let hw = '', ht = '';
        try { hw = drumWeb(dr, cc, 5); } catch (e) { hw = 'eroare web: ' + e.message; }
        try { ht = rts.renderToString(h(D.DrumClient, { drum: dr, buton: () => null })); } catch (e) { ht = 'eroare telefon: ' + e.message; }
        const w = bandaWeb(hw), t = bandaTel(ht);
        const fn = D.termenMontajText(dr.termenMontaj, CO.dataRo);
        if (felAsteptat == null) {
          if (w || t || fn) dif.push(nume + ': apare o bandă → web ' + J(w) + ' / tel ' + J(t));
          return;
        }
        cuBanda++;
        if (!w || !t) { dif.push(nume + ': lipsește banda → web ' + J(w) + ' / tel ' + J(t)); return; }
        if (w.fel !== felAsteptat || t.fel !== w.fel) dif.push(nume + ': felul ' + w.fel + ' / ' + t.fel);
        if (w.text !== t.text) dif.push(nume + ':\n      web: ' + w.text + '\n      tel: ' + t.text);
        if (fn !== t.text) dif.push(nume + ': termenMontajText ≠ desenul (' + fn + ')');
        if (IC[w.ic] !== t.ic) dif.push(nume + ': iconița ' + w.ic + ' → ' + t.ic);
        if (!w.loc || !t.loc) dif.push(nume + ': locul benzii (după pași, înainte de „Pasul următor") web ' + w.loc + ' / tel ' + t.loc);
      });
      T('banda: același fel, același text, aceeași iconiță și același loc ca pe web, pe ' + cazuri.length + ' drumuri făcute de server (' + cuBanda + ' cu bandă)',
        !dif.length && cuBanda === 7, dif.join('\n    '));
    }
    const d8 = drumLa(cu(50), 10, avans, zb(2027, 2, 8, 9));
    T('textul de la depășire, desenat: termenul, „depășit cu 3 zile", câte s-au montat și regula din contract',
      D.termenMontajText(d8.termenMontaj, CO.dataRo) === 'Termenul de montaj a trecut: 05.02.2027 (depășit cu 3 zile) · 10 din 50 de mașini montate. Dacă mașinile n-au fost aduse de client, termenul se prelungește (contract, cap. V).',
      D.termenMontajText(d8.termenMontaj, CO.dataRo));
    T('fără drum / fără termen → nimic (nicio cifră inventată pe telefon)', D.termenMontajText(null, CO.dataRo) === '' && D.termenMontajText(undefined, CO.dataRo) === '' &&
      D.termenMontajText({ stare: 'in_termen', pana: 1, text: 'x', cate: 'y' }, CO.dataRo) === '' && D.termenMontajText({ stare: 'gata' }, CO.dataRo) === '');
  }
  T('telefonul nu socotește termenul: zilele și „câte montate" vin gata scrise de la server (text, cate), ziua cu dataRo',
    !/MONTAJ_ZILE_DUPA_AVANS|MONTAJ_AVERTIZARE_ZILE|termenText|montateText|86400000|\* ZI\b/.test(faraComentarii(drumSrc)) &&
    /ziText\(tm\.pana\) \+ ' \(' \+ s\(tm\.text\) \+ '\) · ' \+ s\(tm\.cate\) \+ '\.'/.test(drumSrc) && /termenMontajText\(tm, dataRo\)/.test(drumSrc));
  T('serverul trimite termenul pe drum, cu textele gata scrise, în listă și în fișă (același _drumContract)',
    /avansLa: contracte\.avansContract\(\(dd\.avans \|\| \{\}\)\[c\.company_id\], c\), acum: Date\.now\(\)/.test(server) &&
    /termenMontaj: termen && termen\.stare !== 'gata'/.test(citeste('contracts.js')) && /text: termenText\(termen\), cate: montateText\(termen\.montate, termen\.deMontat\)/.test(citeste('contracts.js')));
  T('banda se vede în dosar și în fișa firmei (aceeași bucată, DrumClient)', /<DrumClient drum=\{d\.drum\}/.test(detSrc) && /<DrumClient drum=\{o\.drum\}/.test(fisaSrc));
  // Culorile: aceleași ca pe web, pe variabilele temei, MĂSURATE pe amândouă temele (banda stă pe --bg-panel, în .ctr-drum).
  // Valoarea unei variabile din blocul cu EXACT selectorul dat (primul bloc de felul ăsta care o are).
  const varDin = (css, sel, nume) => {
    const re = new RegExp('(^|[}\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    let b;
    while ((b = re.exec(css))) { const m = new RegExp('--' + nume + ':\\s*([^;]+);').exec(b[2]); if (m) return m[1].trim(); }
    return null;
  };
  const culori = {
    inchisa: { curand: varDin(cssCtr, ':root', 'ctr-termen-curand'), depasit: varDin(cssCtr, ':root', 'ctr-termen-depasit'), fundal: varDin(tokens, ':root, :root[data-theme="dark"]', 'bg-panel') },
    deschisa: { curand: varDin(cssCtr, ':root[data-theme="light"]', 'ctr-termen-curand'), depasit: varDin(cssCtr, ':root[data-theme="light"]', 'ctr-termen-depasit'), fundal: varDin(tokens, ':root[data-theme="light"]', 'bg-panel') },
  };
  const fundalBanda = (fel) => { const m = new RegExp('\\.ctr-drum-termen\\.' + fel + ' \\{[^}]*background: rgba\\((\\d+), (\\d+), (\\d+), ([.\\d]+)\\)').exec(cssCtr); return m ? { c: [+m[1], +m[2], +m[3]], p: +m[4] } : null; };
  const webCul = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{ color: (#[0-9a-fA-F]{6});').exec(appCss); return m ? m[1].toLowerCase() : null; };
  T('culorile benzii sunt cele de pe web (#fb923c / #f87171 pe tema închisă, #9a3412 / #b91c1c pe cea deschisă)',
    culori.inchisa.curand === webCul('.raco .drum-termen.curand') && culori.inchisa.depasit === webCul('.raco .drum-termen.depasit') &&
    culori.deschisa.curand === webCul('body:not(.dark) .raco .drum-termen.curand') && culori.deschisa.depasit === webCul('body:not(.dark) .raco .drum-termen.depasit'), J(culori));
  T('scrisul benzii folosește variabilele temei (nicio culoare scrisă direct pe text)',
    /\.ctr-drum-termen\.curand \{ color: var\(--ctr-termen-curand\);/.test(cssCtr) && /\.ctr-drum-termen\.depasit \{ color: var\(--ctr-termen-depasit\);/.test(cssCtr) &&
    !/#[0-9a-fA-F]{3,6}\b/.test(faraComentarii(drumSrc)));
  const masurat = [];
  ['inchisa', 'deschisa'].forEach((tema) => ['curand', 'depasit'].forEach((fel) => {
    const f = fundalBanda(fel), cul = culori[tema][fel], fund = culori[tema].fundal;
    if (!f || !cul || !fund) { masurat.push([tema, fel, null]); return; }
    masurat.push([tema, fel, Math.round(contrast(hex(cul), amesteca(f.c, f.p, hex(fund))) * 100) / 100]);
  }));
  T('contrastul scrisului benzii, MĂSURAT: cel puțin 4,5:1 pe ambele teme, la ambele feluri', masurat.every((m) => m[2] != null && m[2] >= 4.5), J(masurat));
  console.log('    (contrast măsurat: ' + masurat.map((m) => m[0] + '/' + m[1] + ' ' + m[2] + ':1').join(', ') + ')');
  T('iconițele benzii există pe telefon (clock, alertO)', /^\s*clock:/m.test(citeste('mobile/src/components/Icon.tsx')) && /^\s*alertO:/m.test(citeste('mobile/src/components/Icon.tsx')));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.4 L13 — fișa firmei, ✓ „Încasată" pe o proformă: spune și ce a plecat (web: raxInvoiceMarkPaid)');
  const webMark = functie(html, 'window.raxInvoiceMarkPaid = async function (id, proforma) {');
  const webTrimisa = functie(html, 'function _invTrimisaText(t, pf) {');
  const fnPlatita = functie(fisaSrc, 'async function platita(f: any) {');
  T('găsesc raxInvoiceMarkPaid + _invTrimisaText (web) și platita (fișa de pe telefon)', !!webMark && !!webTrimisa && !!fnPlatita);
  async function toastWeb(j, pf) {
    const t = [];
    const W = { window: { raxToast: 1 }, raConfirm: async () => true, fetch: async () => ({ ok: true, json: async () => j }),
      raxToast: (m) => t.push(m), raxLoadBilling: () => {}, raxOpenCompanyDetail: () => {}, document: { getElementById: () => null } };
    await new Function(...Object.keys(W), webTrimisa + '\n' + webMark + '\nreturn window.raxInvoiceMarkPaid(11, ' + (pf ? 'true' : 'false') + ');')(...Object.values(W));
    return t[0];
  }
  let platitaTel = null;
  try {
    const js = ts.transpileModule('module.exports = function (Api, showToast, trimisaText, setBusy, setIntreb, onReload) { let busy = false; ' + fnPlatita + ' return platita; };',
      { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    const m = { exports: {} };
    vm.runInNewContext(js, { module: m });
    platitaTel = m.exports;
  } catch (e) { console.log('    (' + e.message + ')'); }
  async function toastTel(j, pf) {
    const t = [];
    const Api = { invoiceSetStatus: async (id, st) => (id === 11 && st === 'paid' ? j : { eroare: 'altă cerere: ' + id + ' ' + st }) };
    const f = platitaTel(Api, (m) => t.push(m), F.trimisaText, () => {}, () => {}, () => {});
    await f({ id: 11, type: pf ? 'proforma' : 'invoice' });
    return t[0];
  }
  if (webMark && webTrimisa && platitaTel && F) {
    const trimise = [undefined, null,
      { notificare: true, email: true, anaf: 'uploaded' },
      { notificare: true, email: false, emailMotiv: 'SMTP nu e configurat pe server', anaf: 'error' },
      { notificare: false, email: false, anaf: null },
      { notificare: true, email: true },
      { email: true, anaf: 'uploaded' }];
    const dif = [];
    for (const tr of trimise) {
      const j = { ok: true, invoice: { full_number: 'RAT-2026-0022' }, payment: {}, dinProforma: 11, trimisa: tr };
      const w = await toastWeb(j, true), t = await toastTel(j, true);
      if (w !== t) dif.push(J(tr) + '\n      web: ' + w + '\n      tel: ' + t);
    }
    T('„Proformă încasată → factura N" + ce a plecat: identic cu web-ul, pe ' + trimise.length + ' răspunsuri ale serverului', !dif.length, dif.join('\n    '));
    const plin = await toastTel({ invoice: { full_number: 'RAT-2026-0022' }, trimisa: { notificare: true, email: true, anaf: 'uploaded' } }, true);
    T('… adică: „Proformă încasată → factura RAT-2026-0022 · clientul e anunțat în aplicație · emailul a plecat, cu PDF-ul · trimisă la ANAF ✓"',
      plin === 'Proformă încasată → factura RAT-2026-0022 · clientul e anunțat în aplicație · emailul a plecat, cu PDF-ul · trimisă la ANAF ✓', plin);
    // Fără numărul facturii (ex. proforma era deja încasată de altcineva): telefonul nu lasă un loc gol în text.
    const fara = await toastTel({ ok: true, already: true, invoice: null }, true);
    T('fără numărul facturii, fără un loc gol în text („Proformă încasată ✓")', fara === 'Proformă încasată ✓', fara);
    const fw = await toastWeb({ ok: true, payment: {} }, false), ft = await toastTel({ ok: true, payment: {} }, false);
    T('factura fiscală: „Factură plătită ✓", ca pe web', fw === ft && ft === 'Factură plătită ✓', fw + ' / ' + ft);
  }
  T('fișa ia „ce a plecat" din lib/factura.ts (trimisaText, legat de _invTrimisaText), fără a doua scriere a vorbelor',
    /import \{[^}]*\btrimisaText\b[^}]*\} from '\.\.\/lib\/factura'/.test(fisaSrc) && /trimisaText\(j && j\.trimisa, false\)/.test(fisaSrc) &&
    !/clientul e anunțat|emailul a plecat|trimisă la ANAF/.test(fisaSrc));
  T('după ✓ fișa se reîncarcă tot (și după o eroare)', /onReload\(\);\n  \}/.test(fnPlatita));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.5 L14 — rândul ofertei: „Deschide dosarul clientului" (web: raxOfRenderList)');
  const webLista = functie(html, 'window.raxOfRenderList = function () {');
  T('pe web: un singur nume, cu text, pe ambele butoane (înainte și după ce oferta a devenit client)',
    (webLista.match(/<\/i> Deschide dosarul clientului<\/button>'/g) || []).length === 2 &&
    /var devenit = !!o\.contract_id;/.test(webLista) && /onclick="raxOpenCompanyDetail\(' \+ o\.company_id \+ ', \\'contract\\'\)"/.test(webLista) &&
    /onclick="coNouDinOferta\(' \+ o\.id \+ '\)"/.test(webLista));
  T('pe telefon: aceleași două butoane, cu același nume, butoane principale (ca rax-btn primary)',
    (ofSrc.match(/<button class="of-b pri" onClick=\{[^\n]*\/> Deschide dosarul clientului<\/button>/g) || []).length === 2);
  T('… cel de după → fișa firmei, fila Contract (ca raxOpenCompanyDetail(id, \'contract\')); cel dinainte → Client nou din ofertă (ca coNouDinOferta)',
    /const devenit = !!o\.contract_id;/.test(ofSrc) &&
    /\{dosar\s*\?\s*<button class="of-b pri" onClick=\{\(\) => loc\.route\(rutaFisa\(o\.company_id, 'contract'\)\)\}>/.test(ofSrc) &&
    /: devenit \? null : <button class="of-b pri" onClick=\{\(\) => loc\.route\('\/admin\/client-nou\?oferta=' \+ o\.id\)\}>/.test(ofSrc));
  if (CO) {
    const u = CO.rutaFisa(9, 'contract');
    T('adresa fișei, rulată: /admin/companies/9?tab=contract (fișa citește `tab`, Client nou citește `oferta`)',
      u === '/admin/companies/9?tab=contract' && /\(\(loc\.query \|\| \{\}\) as any\)\.tab/.test(fisaSrc) &&
      /\(\(loc\.query \|\| \{\}\) as any\)\.oferta/.test(citeste('mobile/src/screens/ClientNou.tsx')), u);
  }
  T('numele vechi au plecat („Dosarul clientului", „Client nou" pe rând)', !/> Dosarul clientului</.test(ofSrc) && !/\/> Client nou<\/button>/.test(ofSrc));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('3.6 Ce nu trebuia atins');
  // („Completează": statutul de TVA de la ANAF a rămas întocmai — păzit în secțiunea 0, cu aceleași cinci expresii.)
  T('„Emite prima factură" a rămas pe factura unică (rutaPrimaFactura), cu importul din lib/factura.ts neschimbat',
    /export const rutaPrimaFactura = \(companyId: any\) => rutaFactura\(companyId, 'unica'\);/.test(pasiSrc) && /import \{ rutaFactura \} from '\.\.\/lib\/factura';/.test(pasiSrc));
  // (Dosarul și ofertele au adrese /api/ pentru hârtii — prin salveazaDeLaServer / salveazaPostDeLaServer, ca până acum.)
  T('nicio cerere fetch() în fișierele atinse; nicio adresă /api/ scrisă de mână în drum, pași, montaj și fișa firmei',
    !/\bfetch\(/.test(faraComentarii(pasiSrc + detSrc + drumSrc + montSrc + fisaSrc + ofSrc)) && !/['"`]\/api\//.test(faraComentarii(pasiSrc + drumSrc + montSrc + fisaSrc)));
  T('zilele din texte se acordă prin server/nrDe: niciun „N zile" compus pe telefon în fișierele atinse',
    !/\+ ' zile'|\+ ' de zile'/.test(faraComentarii(drumSrc + pasiSrc + montSrc)));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Montaj, Calendar, Stoc (lib/calendarMontaj.ts, CalendarMontaj.tsx, Montaj.tsx, ParteneriMontaj.tsx,
//    lib/montajSectiune.ts, StocEchipamente.tsx). Ce leagă (regula casei: o regulă copiată din pagină nu se crede pe
//    cuvânt — se RULEAZĂ bucata paginii și a telefonului pe aceleași cazuri și se cere același rezultat):
//   4.1 L1 — calendarul: blocul „calendarul de montaj" din public/index.html (decupat între sentinele, rulat în vm) și
//       lib/calendarMontaj.ts (tradus): grila lunii, etichetele zilelor, filtrul pe instalator, „De programat"
//       (termenul și culoarea lui, rândul, stocul), formularul (ce se propune, ce pleacă la server), ziua programată
//       (mută / montată / șterge — întrebările, cererile, mesajele), luna ‹ / › / Azi, cifra filei, venitul din drum
//       (`?contract=`).
//   4.2 L15 — ritmul instalatorului: rândul partenerului, nota de sub „Ne facturează", cartea contractului, bifa
//       „Reia…", subtitlul filei Lucrări. L16 — Stoc: nota de sub casetă și mesajul după intrare (`primite_la_conectare`).
//   4.3 Ecranele (TSX), desenate cu preact-render-to-string pe date de probă: nimic „undefined"/„NaN", ce e pe web e și
//       aici (fără el, în CI, desenul se sare); plus ce trebuie să NU facă (fetch direct, prețuri socotite, rute
//       ghicite). Culorile noi, MĂSURATE pe ambele teme (≥ 4,5:1).
//   4.4 Pe server, prin clientul HTTP ADEVĂRAT al telefonului: contract semnat → programează (și peste rest: refuz),
//       mută, montată cu mai puține (restul înapoi la „De programat"), șterge ziua; nesemnat → refuz și numele firmei;
//       stoc cu `primite_la_conectare`; partener „săptămânal" pe rând și în contract.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function parteaMontaj() {
  sect('4. Montaj, Calendar, Stoc: calendarul de montaj, ritmul instalatorului, stocul');
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const optiuni = (h) => { const r = []; const re = /<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g; let m; while ((m = re.exec(h || ''))) r.push({ v: unesc(m[1]), sel: !!m[2], t: unesc(m[3]) }); return r; };
  const aleasa = (opts) => { const s = opts.filter((o) => o.sel)[0]; return s ? s.v : (opts[0] ? opts[0].v : ''); };

  // ─── Contrastul (WCAG) ───
  const lum = (c) => { const f = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function culoare(s) {
    s = String(s || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    return null;
  }
  const peste = (c, fundal) => (c[3] >= 1 ? c : [0, 1, 2].map((i) => c[i] * c[3] + fundal[i] * (1 - c[3])).concat([1]));
  function variabile(css, selector) {
    const out = {};
    const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    let m; while ((m = re.exec(css))) m[1].replace(/--([\w-]+)\s*:\s*([^;]+);/g, (x, k, v) => { out[k] = v.trim(); return x; });
    return out;
  }

  // TypeScript-ul telefonului, tradus și rulat în vm.
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

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  sect('4.0 Fișierele și bucățile comune');
  const F = {
    html: 'public/index.html', srv: 'server.js', calLib: 'mobile/src/lib/calendarMontaj.ts', calTsx: 'mobile/src/components/CalendarMontaj.tsx',
    mj: 'mobile/src/screens/Montaj.tsx', mjCss: 'mobile/src/screens/montaj.css', part: 'mobile/src/components/ParteneriMontaj.tsx',
    mjLib: 'mobile/src/lib/montajSectiune.ts', stoc: 'mobile/src/screens/StocEchipamente.tsx', stocCss: 'mobile/src/screens/stoc.css',
    numar: 'mobile/src/lib/numar.ts', ctrLib: 'mobile/src/lib/contracte.ts', client: 'mobile/src/api/client.ts', tokens: 'mobile/src/theme/tokens.css',
    ctrCss: 'mobile/src/screens/contracte.css',
  };
  const lipsa = Object.keys(F).filter((k) => !fs.existsSync(path.join(ROOT, F[k])));
  T('toate fișierele citite de probă există', !lipsa.length, lipsa.map((k) => F[k]).join(', '));
  const S = {}; Object.keys(F).forEach((k) => { S[k] = citeste(F[k]); });

  const apiLog = [];
  let apiRaspuns = () => ({ ok: true });
  const apiStub = { api: async (p, o) => { apiLog.push({ p, o: o || {} }); return apiRaspuns(p, o || {}); } };
  let numar = {}, ctrLib = {}, CAL = {}, MS = {};
  try { numar = modul(tsJs(S.numar, 'numar.ts'), 'lib/numar.ts').exp; } catch (e) { console.log('    (numar.ts: ' + e.message + ')'); }
  try { ctrLib = modul(tsJs(S.ctrLib, 'contracte.ts'), 'lib/contracte.ts').exp; } catch (e) { console.log('    (contracte.ts: ' + e.message + ')'); }
  const calCereri = (client) => ({ '../api/client': client, './contracte': ctrLib, './numar': numar });
  try { CAL = modul(tsJs(S.calLib, 'calendarMontaj.ts'), 'lib/calendarMontaj.ts', calCereri(apiStub)).exp; } catch (e) { console.log('    (calendarMontaj.ts: ' + e.message + ')'); }
  try { MS = modul(tsJs(S.mjLib, 'montajSectiune.ts'), 'lib/montajSectiune.ts', { './contracte': ctrLib, './numar': numar }).exp; } catch (e) { console.log('    (montajSectiune.ts: ' + e.message + ')'); }
  const FN_CAL = ['ziRo', 'masini', 'esteMontata', 'ceSeMonteaza', 'grilaLunii', 'lucrariPeZi', 'titluLucrare', 'instalatoriFiltru', 'lunaText',
    'lunaAlaturata', 'termenFel', 'termenPastila', 'termenLinie', 'detaliiContract', 'stocText', 'deProgramatActive', 'contractulFormularului',
    'formNou', 'cuClient', 'cuMasini', 'corpProgramare', 'toastProgramat', 'dinContract', 'formLucrare', 'corpMutare', 'corpMontata',
    'intrebareMontata', 'toastMutat', 'toastMontata', 'eroarea', 'calendarMontaj', 'programeazaMontaj', 'mutaLucrarea', 'lucrareMontata',
    'stergeZiua', 'numeFirmaContract', 'rutaCalendarMontaj', 'optiuneClient', 'instalatoriActivi', 'instalatoriLucrare', 'faraClientText', 'ziCuNume'];
  T('lib/calendarMontaj.ts se traduce și are toate regulile', FN_CAL.every((k) => typeof CAL[k] === 'function') && !!CAL.CAL_TEXT,
    FN_CAL.filter((k) => typeof CAL[k] !== 'function').join(', '));
  T('lib/montajSectiune.ts se traduce (cifraFilei, ritmText, subPartener, bifaRetarif, NOTA_RITM)',
    ['cifraFilei', 'ritmText', 'subPartener', 'bifaRetarif', 'mjStare', 'ziLaPranz'].every((k) => typeof MS[k] === 'function') && typeof MS.NOTA_RITM === 'string');

  const html = S.html;
  const W = {
    esc: functie(html, 'function esc(s) {'), rDe: functie(html, 'function _rDe(n) {'), raxDe: functie(html, 'function _raxDe(n) {'),
    zi: functie(html, 'function _zi(v) {'), tipuri: (/var MONTAJ_TIPURI = \[[\s\S]*?\];/.exec(html) || [''])[0],
    ctrStari: (/var CTR_STARI = \{[\s\S]*?\};/.exec(html) || [''])[0],
    bloc: taie(html, '// ── începe „calendarul de montaj"', '// ── sfârșit „calendarul de montaj"'),
    fileVar: (/var MJ_FILE = \[[^\n]*\];/.exec(html) || [''])[0],
    deseneaza: functie(html, 'function _mjDeseneaza() {'),
    pre: functie(html, 'if (_raxMj.cal.pre) {'),
    ctrPart: functie(html, 'function _mjContractulPartenerului(pid) {'), stare: functie(html, 'function _mjStare(status) {'),
    partCorp: functie(html, 'function _raxParteneriCorp() {'), edit: functie(html, 'function _mjEditHtml(c) {'),
    lucrari: functie(html, 'function _mjLucrariHtml() {'), mjContracte: functie(html, 'function _mjContracteHtml() {'),
    stocIntrare: functie(html, 'window.raxStocIntrare = async function () {'),
  };
  T('găsesc în pagină bucățile (esc, _rDe, _raxDe, _zi, MONTAJ_TIPURI, CTR_STARI, blocul calendarului, MJ_FILE, _mjDeseneaza, pre, partenerii, _mjEditHtml, _mjLucrariHtml, raxStocIntrare)',
    Object.keys(W).every((k) => !!W[k]), Object.keys(W).filter((k) => !W[k]).join(', '));

  // Pagina, rulată: blocul calendarului + ce-i trebuie în jur (DOM, fetch, raConfirm, raxToast — de carton). Tot ce e
  // global în pagină e o proprietate a contextului, deci se poate înlocui din probă (ex. _mjDeseneaza, _f).
  function webNou(cal) {
    const ctx = {
      console, __el: {}, __qsa: {}, __fetch: [], __confirm: [], __toast: [], __da: true, __desenat: 0, __deschis: [],
      __raspuns: () => ({ ok: true }), __ok: true, companiesCache: [],
      _raxMj: { fila: 'calendar', contracte: [], faraContract: [], lucrari: [], stari: {}, trimite: false, editC: null, fStare: '', fPart: '',
        cal: Object.assign({ luna: null, data: null, part: '', form: null, sel: null, pre: null }, cal || {}) },
      _raxPart: { lista: [], edit: null },
    };
    ctx.window = ctx;
    ctx.document = { getElementById: (id) => ctx.__el[id] || null, querySelectorAll: (sel) => ctx.__qsa[sel] || [] };
    ctx.fetch = async (url, op) => {
      ctx.__fetch.push({ url, op: op || {} });
      const j = ctx.__raspuns(url, op || {});
      return { ok: ctx.__ok, status: ctx.__ok ? 200 : 400, json: async () => j };
    };
    ctx.raConfirm = async (m, op) => { ctx.__confirm.push({ m, op }); return ctx.__da; };
    ctx.raxToast = (m) => { ctx.__toast.push(m); };
    ctx.raxOpenCompanyDetail = (id, fila) => { ctx.__deschis.push([id, fila]); };
    ctx._mjDeseneaza = () => { ctx.__desenat++; };
    vm.createContext(ctx);
    vm.runInContext([W.esc, W.rDe, W.raxDe, W.zi, W.tipuri, W.ctrStari, W.bloc, W.ctrPart, W.stare, W.partCorp, W.edit, W.lucrari,
      'this.__pre = function () { ' + W.pre + ' };',
      'this.W = { ziRo: _mjcZiRo, masini: _mjcMasini, montata: _mjcMontata, ce: _mjcCeSeMonteaza, cal: _mjcCalendarHtml, dp: _mjcDeProgramatHtml,' +
      ' form: _mjcFormHtml, luc: _mjcLucrareHtml, partCorp: _raxParteneriCorp, edit: _mjEditHtml, lucrari: _mjLucrariHtml };'].join('\n'), ctx);
    return ctx;
  }
  // _mjDeseneaza din pagină (filele, cu cifrele lor), rulată pe un nod de carton.
  function filePagina(ctx) {
    const file = { innerHTML: '' }, corp = { innerHTML: '' };
    ctx.__el['mj-file'] = file; ctx.__el['mj-corp'] = corp;
    ctx._raxParteneriCorp = () => '';
    vm.runInContext(W.fileVar + '\n(' + W.deseneaza.replace('function _mjDeseneaza()', 'function ()') + ')();', ctx);
    const r = []; const re = /<button class="rax-btn( primary)?" onclick="raxMjFila\('(\w+)'\)">([^<]*)<\/button>/g; let m;
    while ((m = re.exec(file.innerHTML))) r.push({ k: m[2], t: unesc(m[3]) });
    return r;
  }

  // ─── Datele de probă ───
  const STARI = { de_programat: 'de programat', programat: 'programat', executat: 'executat', facturat_de_partener: 'partenerul ne-a facturat', facturat_clientului: 'facturat clientului' };
  const PART = [{ id: 7, name: 'Instal Vest SRL', active: true }, { id: 8, name: 'Montaj „Est" & <Co>', active: false }, { id: 9, name: "Nord GPS d'Or", active: true }];
  function lucrariProba(luna) {
    return [
      { id: 101, company_id: 1, company_name: 'Calendar SRL', contract_id: 11, partener_id: 7, partener_nume: 'Instal Vest SRL', zi: luna + '-03', status: 'programat', masini: 3, items: [{ tip: 'gps', buc: 3 }, { tip: 'lvcan', buc: 2 }] },
      { id: 102, company_id: 2, company_name: 'Alfa & <Beta>', contract_id: 12, partener_id: null, partener_nume: null, zi: luna + '-03', status: 'executat', masini: 1, items: [{ tip: 'gps', buc: 1 }] },
      { id: 103, company_id: 1, company_name: 'Calendar SRL', contract_id: 11, partener_id: 9, partener_nume: "Nord GPS d'Or", zi: luna + '-03', status: 'facturat_clientului', masini: 20, items: [{ tip: 'gps', buc: 20 }, { tip: 'fms', buc: 20 }, { tip: 'deplasare', buc: 40 }] },
      { id: 104, company_id: 3, company_name: '', contract_id: 13, partener_id: 8, partener_nume: 'Montaj „Est" & <Co>', zi: luna + '-15', status: 'de_programat', masini: 21, items: [{ tip: 'gps', buc: 21 }, { tip: 'necunoscut', buc: 2 }] },
      { id: 105, company_id: 4, company_name: 'Zeta', contract_id: 14, partener_id: 9, partener_nume: "Nord GPS d'Or", zi: luna + '-28', status: 'facturat_de_partener', masini: 101, items: [] },
    ];
  }
  const tip = (t, n, p, m, peMasina) => ({ tip: t, eticheta: ({ gps: 'Instalare dispozitiv GPS', lvcan: 'Instalare modul LV-CAN', caninc: 'Instalare CAN încorporat', fms: 'Instalare FMS (tahograf)' })[t], inAnexa: n, programate: p, montate: m, ramase: Math.max(0, n - p - m), pretClient: 100, peMasina });
  const ACUM = Date.UTC(2027, 2, 10, 10);
  function contracteProba() {
    return [
      { contract_id: 11, company_id: 1, company_name: 'Calendar SRL', number: 'RAT-1', termen: { pana: ACUM - 3 * 86400000, deMontat: 50, montate: 20, zile: -3, stare: 'depasit', text: 'depășit cu 3 zile' },
        text: '20 din 50 de mașini montate', masini: 50, programate: 10, montate: 20, ramase: 20, tipuri: [tip('gps', 50, 10, 20, 1), tip('lvcan', 30, 6, 12, 0.6), tip('fms', 7, 0, 0, 0.14)] },
      { contract_id: 12, company_id: 2, company_name: 'Alfa & <Beta>', number: 'RAT-2', termen: { pana: Date.UTC(2027, 2, 14, 21, 30), deMontat: 5, montate: 0, zile: 4, stare: 'curand', text: 'mai sunt 4 zile' },
        text: '0 din 5 mașini montate', masini: 5, programate: 0, montate: 0, ramase: 5, tipuri: [tip('gps', 5, 0, 0, 1), tip('caninc', 5, 0, 0, 1)] },
      { contract_id: 13, company_id: 3, company_name: null, number: 'RAT-3', termen: { pana: Date.UTC(2027, 3, 1), deMontat: 1, montate: 0, zile: 22, stare: 'in_termen', text: 'mai sunt 22 de zile' },
        text: '0 din 1 mașină montată', masini: 1, programate: 0, montate: 0, ramase: 1, tipuri: [tip('gps', 1, 0, 0, 1)] },
      { contract_id: 14, company_id: 4, company_name: 'Zeta', number: 'RAT-4', termen: null, text: '100 din 121 de mașini montate', masini: 121, programate: 21, montate: 100, ramase: 0, tipuri: [tip('gps', 121, 21, 100, 1)] },
    ];
  }
  const STOC = [{ tip: 'fmc130', eticheta: 'Teltonika FMC130', depozit: 12, instalator: 3 }, { tip: 'lvcan200', eticheta: 'Modul LV-CAN200 & <x>', depozit: 4, instalator: 0 }];
  function dateProba(luna, azi, peste_) {
    return Object.assign({ luna, azi, lucrari: lucrariProba(luna), deProgramat: contracteProba(), stari: STARI, parteneri: PART, stoc: STOC }, peste_ || {});
  }
  // „De programat" din pagină, citit înapoi în rânduri.
  function randuriDp(h) {
    const r = []; const re = /<div class="raco-row"><span class="raco-row-t"><strong>([^<]*)<\/strong>(?: <span class="raco-pill ([a-z]*)">([^<]*)<\/span>)?<span class="raco-row-s">([^<]*)<\/span><\/span>(?:<button class="rax-btn primary ctre-pas" onclick="raxMjCalProgrameaza\((\d+)\)">)?/g; let m;
    while ((m = re.exec(h))) r.push({ nume: unesc(m[1]), fel: m[3] != null ? m[2] : null, pastila: m[3] != null ? unesc(m[3]) : null, sub: unesc(m[4]), buton: m[5] ? +m[5] : null });
    return r;
  }
  const randuriDpTel = (lista) => lista.map((c) => ({ nume: c.company_name || '—', fel: c.termen ? CAL.termenFel(c.termen) : null, pastila: c.termen ? CAL.termenPastila(c.termen) : null,
    sub: CAL.detaliiContract(c), buton: c.ramase > 0 ? c.contract_id : null }));

  async function pachetCalendar() {
    sect('4.1 L1 — calendarul: telefonul dă ACELAȘI rezultat ca pagina (codul ei, rulat)');
    const w = webNou();
    // 4.1.1 Mărunțișurile
    const zile = ['2027-03-10', '2026-12-01', '', null, 'x', '2027-3-1', '2027-03'];
    T('ziua scrisă românește (_mjcZiRo)', zile.every((z) => w.W.ziRo(z) === CAL.ziRo(z)), J(zile.map((z) => [w.W.ziRo(z), CAL.ziRo(z)])));
    const difM = []; for (let n = 0; n <= 250; n++) if (w.W.masini(n) !== CAL.masini(n)) difM.push(n + ': ' + w.W.masini(n) + ' / ' + CAL.masini(n));
    T('„N mașini" cu „de" după cifră, 0–250 (_mjcMasini ↔ nrDe)', !difM.length, difM.slice(0, 5).join('; '));
    const st = Object.keys(STARI).concat(['altceva', '', null]);
    T('ce înseamnă „montată" (_mjcMontata)', st.every((s) => w.W.montata(s) === CAL.esteMontata(s)));
    const itemsC = [[], null, [{ tip: 'gps', buc: 3 }, { tip: 'lvcan', buc: 2 }], [{ tip: 'deplasare', buc: 40 }, { tip: 'necunoscut', buc: 2 }, { tip: 'fms' }]];
    T('ce se montează (_mjcCeSeMonteaza)', itemsC.every((x) => w.W.ce(x) === CAL.ceSeMonteaza(x)), J(itemsC.map((x) => [w.W.ce(x), CAL.ceSeMonteaza(x)])));

    // 4.1.2 Grila lunii: căsuțe goale, zile, weekend, azi, etichetele lucrărilor, cu și fără instalator ales
    const luni = [['2027-02', '2027-02-14'], ['2028-02', '2028-02-29'], ['2026-11', '2026-10-30'], ['2027-08', '2027-08-01'], ['2026-06', '2026-06-30'], ['2027-12', '2027-12-25']];
    let grOk = true, grD = '', optOk = true, optD = '';
    luni.forEach(([luna, azi]) => {
      ['', '7', '8', '9', '999'].forEach((part) => {
        const d = dateProba(luna, azi);
        const x = webNou({ luna, data: d, part });
        const h = x.W.cal();
        const gol = (h.match(/class="mjc-zi gol"/g) || []).length;
        const zileW = []; const re = /<div class="mjc-zi( wk)?( azi)?" role="button" tabindex="0" aria-label="Programează pe ([^"]*)" onclick="raxMjCalZi\('([^']*)'\)"[^>]*><span class="mjc-nr">(\d+)<\/span>([\s\S]*?)<\/div>/g; let m;
        while ((m = re.exec(h))) {
          const chips = []; const rc = /<button type="button" class="mjc-l (mjc-mont|mjc-prog)" title="([^"]*)" onclick="event\.stopPropagation\(\);raxMjCalLucrare\((\d+)\)"><b>([^<]*)<\/b> <span class="mjc-cl">([^<]*)<\/span><\/button>/g; let c;
          while ((c = rc.exec(m[6]))) chips.push({ cls: c[1], titlu: unesc(c[2]), id: +c[3], n: c[4], nume: unesc(c[5]) });
          zileW.push({ zi: m[4], nr: +m[5], wk: !!m[1], azi: !!m[2], data: m[3], chips });
        }
        const g = CAL.grilaLunii(luna, azi), pe = CAL.lucrariPeZi(d.lucrari, part);
        const zileT = g.zile.map((z) => ({ zi: z.zi, nr: z.nr, wk: z.wk, azi: z.azi, data: CAL.ziRo(z.zi),
          chips: (pe[z.zi] || []).map((l) => ({ cls: CAL.esteMontata(l.status) ? 'mjc-mont' : 'mjc-prog', titlu: CAL.titluLucrare(l, d.stari), id: l.id, n: String(l.masini), nume: l.company_name || '' })) }));
        if (gol !== g.gol || J(zileW) !== J(zileT)) { grOk = false; grD = luna + '/' + part + ': gol ' + gol + '≠' + g.gol + ' ' + J(zileW).slice(0, 300) + ' ≠ ' + J(zileT).slice(0, 300); }
        const lunaW = unesc((/<strong class="mjc-luna">([^<]*)<\/strong>/.exec(h) || [])[1] || '');
        if (lunaW !== CAL.lunaText(luna)) { grOk = false; grD = 'luna: ' + lunaW + ' ≠ ' + CAL.lunaText(luna); }
        const optW = optiuni((/onchange="raxMjCalPart\(this\.value\)">([\s\S]*?)<\/select>/.exec(h) || [])[1]);
        const optT = [{ v: '', sel: false, t: 'toți' }].concat(CAL.instalatoriFiltru(d.parteneri, part).map((p) => ({ v: String(p.id), sel: String(p.id) === part, t: p.name })));
        if (J(optW) !== J(optT)) { optOk = false; optD = 'instalatori ' + part + ': ' + J(optW) + ' ≠ ' + J(optT); }
      });
    });
    T('grila: aceleași căsuțe goale, zile, weekend, „azi", aceleași lucrări pe zi (clasă, cifră, client, eticheta întreagă) — 6 luni × 5 filtre, cu luna scrisă la fel', grOk, grD);
    T('filtrul pe instalator: „toți" + activii + cel ales (chiar inactiv) — același ca pe web', optOk, optD);
    const hC = webNou({ luna: '2027-03', data: dateProba('2027-03', '2027-03-10') }).W.cal();
    T('textul de sub titlu e cel de pe web', unesc((/Calendarul montajului<\/div><div class="raco-sub">([^<]*)<\/div>/.exec(hC) || [])[1] || '') === CAL.CAL_TEXT.sub);
    T('legenda: „programat", „montat", „cifra = câte mașini" (ca pe web)', /<b>10<\/b> programat/.test(hC) && /<b>10<\/b> montat/.test(hC) && /cifra = câte mașini/.test(hC) &&
      /<b>10<\/b> programat<\/span>/.test(S.calTsx) && /<b>10<\/b> montat<\/span>/.test(S.calTsx) && /<span>cifra = câte mașini<\/span>/.test(S.calTsx));
    T('luna stricată → „Se încarcă…" pe web, null pe telefon', /Se încarcă…/.test(webNou({ luna: '', data: dateProba('', '') }).W.cal()) && CAL.grilaLunii('', '') === null && CAL.grilaLunii('abc', '') === null);
    T('zilele săptămânii, în aceeași ordine (L … D)', J((/var MJC_ZILE = (\[[^\]]*\]);/.exec(W.bloc) || [])[1] ? eval((/var MJC_ZILE = (\[[^\]]*\]);/.exec(W.bloc))[1]) : null) === J(CAL.MJC_ZILE) &&
      J(eval((/var MJC_LUNI = (\[[^\]]*\]);/.exec(W.bloc) || [0, 'null'])[1])) === J(CAL.MJC_LUNI));

    // 4.1.3 „De programat": rândul, termenul (culoare + text), butonul, stocul, golul
    let dpOk = true, dpD = '';
    [contracteProba(), [], contracteProba().slice(2)].forEach((lista, i) => {
      [STOC, [], [STOC[1]]].forEach((stoc) => {
        const d = dateProba('2027-03', '2027-03-10', { deProgramat: lista, stoc });
        const h = webNou({ luna: '2027-03', data: d }).W.dp();
        const r = randuriDp(h), t = randuriDpTel(lista);
        if (J(r) !== J(t)) { dpOk = false; dpD = 'caz ' + i + ': ' + J(r) + ' ≠ ' + J(t); }
        const stW = (/<b>Aparate în stoc:<\/b> ([^<]*)<\/div>/.exec(h) || [])[1];
        if ((stW == null ? '' : unesc(stW)) !== (stoc.length ? CAL.stocText(stoc) : '')) { dpOk = false; dpD = 'stoc: ' + stW + ' ≠ ' + CAL.stocText(stoc); }
        if (!lista.length && h.indexOf(CAL.CAL_TEXT.golDeProgramat) < 0) { dpOk = false; dpD = 'golul'; }
        const subW = unesc((/De programat<\/div><div class="raco-sub">([^<]*)<\/div>/.exec(h) || [])[1] || '');
        if (subW !== CAL.CAL_TEXT.subDeProgramat) { dpOk = false; dpD = 'sub: ' + subW; }
      });
    });
    T('„De programat": același rând (client, termen cu culoarea lui: roșu depășit / portocaliu curând / neutru, rest, buton doar cu mașini rămase), același stoc, același gol', dpOk, dpD);
    const C = require('./contracts.js');
    T('„30 de zile" din textul de sub „De programat" e cifra din contracts.js (MONTAJ_ZILE_DUPA_AVANS)', CAL.CAL_TEXT.subDeProgramat.indexOf(C.MONTAJ_ZILE_DUPA_AVANS + ' de zile') >= 0, C.MONTAJ_ZILE_DUPA_AVANS);
    const pana = [Date.UTC(2027, 2, 14, 21, 30), Date.UTC(2027, 2, 14, 22, 30), Date.UTC(2027, 9, 30, 21, 59), Date.UTC(2027, 9, 30, 23, 1), ACUM];
    T('ziua termenului, în ora României (și aproape de miezul nopții, și la schimbarea orei)', pana.every((p) => {
      const t = { pana: p, stare: 'curand', text: 'x' };
      const d = dateProba('2027-03', '2027-03-10', { deProgramat: [Object.assign(contracteProba()[1], { termen: t })] });
      const h = webNou({ luna: '2027-03', data: d }).W.dp();
      return unesc((/<span class="raco-pill warn">([^<]*)<\/span>/.exec(h) || [])[1] || '') === CAL.termenPastila(t);
    }));

    // 4.1.4 Formularul „Programează": ce se propune, la fiecare contract / zi / instalator
    const d0 = dateProba('2027-03', '2027-03-10');
    let fOk = true, fD = '';
    [[null, null, null], [11, '2027-03-20', 7], [12, null, 8], [13, '2027-04-01', 9], [14, null, null], [999, null, 7]].forEach(([cid, zi, pid]) => {
      const x = webNou({ luna: '2027-03', data: d0, form: { zi, contract_id: cid, n: null, partener_id: pid } });
      const h = x.W.form();
      const f = CAL.formNou(d0, zi, cid, pid == null ? null : String(pid));
      const c = CAL.contractulFormularului(d0, cid);
      const cW = optiuni((/id="mjc-ctr"[^>]*>([\s\S]*?)<\/select>/.exec(h) || [])[1]);
      const cT = CAL.deProgramatActive(d0).map((y) => ({ v: String(y.contract_id), sel: y.contract_id === c.contract_id, t: CAL.optiuneClient(y) }));
      const ziW = (/id="mjc-zi" value="([^"]*)"/.exec(h) || [])[1];
      const g = /<span>Câte mașini \(din (\d+) rămase\)<\/span><input class="rax-field" type="number" id="mjc-gps" min="1" max="(\d+)" step="1" value="([^"]*)"/.exec(h) || [];
      const pW = optiuni((/id="mjc-part">([\s\S]*?)<\/select>/.exec(h) || [])[1]);
      const pT = [{ v: '', t: '— îl aleg mai târziu —' }].concat(CAL.instalatoriActivi(d0.parteneri).map((p) => ({ v: String(p.id), t: p.name })));
      const alteW = []; const re = /<span>([^<]*) \(din (\d+) rămase\)<\/span><input class="rax-field" type="number" min="0" max="(\d+)" step="1" data-mjc-tip="([^"]*)" data-pe-masina="([^"]*)" value="([^"]*)"/g; let m;
      while ((m = re.exec(h))) alteW.push({ et: unesc(m[1]), max: +m[3], tip: m[4], v: m[6] });
      const alteT = CAL.alteTipuri(c).map((t) => ({ et: t.eticheta, max: t.ramase, tip: t.tip, v: f.alte[t.tip] }));
      const termW = unesc((/<div class="raco-sub">(Termenul din contract: [^<]*)<\/div>/.exec(h) || [])[1] || '');
      const rez = J([cW, ziW, g[1], g[3], pW.map((o) => ({ v: o.v, t: o.t })), aleasa(pW), alteW, termW]);
      const tel = J([cT, f.zi, String(CAL.tipGps(c).ramase), f.n, pT, f.part, alteT, c.termen ? CAL.termenLinie(c.termen) : '']);
      if (rez !== tel || f.contract_id !== c.contract_id) { fOk = false; fD = cid + '/' + zi + '/' + pid + ': ' + rez + ' ≠ ' + tel; }
    });
    T('formularul: aceiași clienți (cel cerut sau primul), aceeași zi, „din N rămase", aceiași instalatori (activi) și cel propus, aceleași adaptoare propuse, același termen', fOk, fD);
    const dGol = dateProba('2027-03', '2027-03-10', { deProgramat: contracteProba().slice(3) });
    const hN = webNou({ luna: '2027-03', data: dGol, form: { zi: null, contract_id: null } }).W.form();
    T('„Nimic de programat: …" (niciun contract cu mașini rămase) — același text, iar telefonul nu face formular',
      unesc((/<div class="raco-msg">([^<]*)<\/div>/.exec(hN) || [])[1] || '') === CAL.CAL_TEXT.nimic && CAL.formNou(dGol, null, null, null) === null);
    const hF = webNou({ luna: '2027-03', data: d0, form: { faraClient: 'Beta & <Co>' } }).W.form();
    T('„… n-are nimic de programat acum: …" — același text', unesc((/<div class="raco-msg">([^<]*)<\/div>/.exec(hF) || [])[1] || '') === CAL.faraClientText('Beta & <Co>'));

    // 4.1.5 Alt client, alte mașini (propunerea adaptoarelor, cât timp nu le-ai scris tu)
    {
      const x = webNou({ luna: '2027-03', data: d0, form: { zi: '2027-03-20', contract_id: 11, n: null, partener_id: 7 } });
      x.__el['mjc-zi'] = { value: '2027-03-22' }; x.__el['mjc-part'] = { value: '9' };
      x.raxMjCalClient('12');
      const h = x.W.form();
      const f1 = CAL.formNou(d0, '2027-03-20', 11, '7');
      const f2 = CAL.cuClient(d0, Object.assign({}, f1, { zi: '2027-03-22', part: '9' }), 12);
      const g = /id="mjc-gps" min="1" max="(\d+)" step="1" value="([^"]*)"/.exec(h) || [];
      const alteW = []; const re = /data-mjc-tip="([^"]*)" data-pe-masina="[^"]*" value="([^"]*)"/g; let m; while ((m = re.exec(h))) alteW.push([m[1], m[2]]);
      T('alt client: ziua și instalatorul rămân, mașinile și adaptoarele pornesc de la ce i-a rămas lui (raxMjCalClient)',
        (/id="mjc-zi" value="([^"]*)"/.exec(h) || [])[1] === f2.zi && aleasa(optiuni((/id="mjc-part">([\s\S]*?)<\/select>/.exec(h) || [])[1])) === f2.part &&
        g[2] === f2.n && J(alteW) === J(Object.keys(f2.alte).map((k) => [k, f2.alte[k]])) && f2.contract_id === 12, J([f2, alteW, g]));
      const c = CAL.contractulFormularului(d0, 11);
      let catOk = true, catD = '';
      ['0', '1', '7', '10', '20', '', 'abc', '35'].forEach((n) => {
        [{}, { lvcan: true }, { fms: true }, { lvcan: true, fms: true }].forEach((atinse) => {
          const inputs = CAL.alteTipuri(c).map((t) => {
            const attrs = { 'data-mjc-tip': t.tip, max: String(t.ramase), 'data-pe-masina': String(t.peMasina) };
            if (atinse[t.tip]) attrs['data-atins'] = '1';
            return { value: '5', getAttribute: (k) => (k in attrs ? attrs[k] : null) };
          });
          const y = webNou({ luna: '2027-03', data: d0 });
          y.__el['mjc-gps'] = { value: n }; y.__qsa['#mjc-form input[data-mjc-tip]'] = inputs;
          y.raxMjCalCate();
          const fT = CAL.cuMasini(c, { zi: 'z', contract_id: 11, n: '10', part: '', alte: { lvcan: '5', fms: '5' }, atinse }, n);
          const w1 = inputs.map((i) => String(i.value)), t1 = CAL.alteTipuri(c).map((t) => fT.alte[t.tip]);
          if (J(w1) !== J(t1) || fT.n !== n) { catOk = false; catD = n + ' ' + J(atinse) + ': ' + J(w1) + ' ≠ ' + J(t1); }
        });
      });
      T('„câte mașini" → adaptoarele propuse din nou, ca pe web (raxMjCalCate); cele scrise de mână rămân', catOk, catD);
    }

    // 4.1.6 „Programează" (raxMjCalSalveaza): aceeași cerere, același mesaj; fără zi, refuz; refuzul serverului, ca atare
    {
      let sOk = true, sD = '';
      for (const [cid, zi, part, n, alte] of [[11, '2027-03-20', '7', '10', { lvcan: '6', fms: '1' }], [12, '2027-04-02', '', '5', { caninc: '5' }], [13, '2027-03-11', '9', '', {}], [11, '2027-03-12', '', 'x', { lvcan: '', fms: 'y' }]]) {
        const x = webNou({ luna: '2027-03', data: d0, form: { zi, contract_id: cid, n: null, partener_id: part ? +part : null } });
        x.__el['mjc-zi'] = { value: zi }; x.__el['mjc-gps'] = { value: n }; x.__el['mjc-part'] = { value: part }; x.__el['mjc-msg'] = { textContent: '' };
        const c = CAL.contractulFormularului(d0, cid);
        x.__qsa['#mjc-form input[data-mjc-tip]'] = CAL.alteTipuri(c).map((t) => ({ value: alte[t.tip] == null ? '' : alte[t.tip], getAttribute: (k) => (k === 'data-mjc-tip' ? t.tip : null) }));
        x.__raspuns = (url) => (/calendar/.test(url) ? d0 : { ok: true, lucrare: { id: 1 } });
        await x.raxMjCalSalveaza();
        const f = { zi, contract_id: cid, n, part, alte: Object.assign({}, alte), atinse: {} };
        apiLog.length = 0; await CAL.programeazaMontaj(CAL.corpProgramare(c, f));
        const a = x.__fetch[0] || { op: {} }, b = apiLog[0] || { o: {} };
        const la = a.url === b.p && a.op.method === b.o.method && a.op.body === J(b.o.body) && x.__toast[0] === CAL.toastProgramat(c, parseInt(n, 10) || 0, zi) &&
          (x.__fetch[1] || {}).url === '/api/montaj/calendar?luna=' + zi.slice(0, 7);
        if (!la) { sOk = false; sD = J([a.url, a.op.body, x.__toast[0]]) + ' ≠ ' + J([b.p, J(b.o.body), CAL.toastProgramat(c, parseInt(n, 10) || 0, zi)]); }
      }
      T('„Programează": aceeași cerere (POST /api/montaj/programeaza, aceleași cifre, ziua la miezul nopții local), același mesaj, luna zilei reîncărcată', sOk, sD);
      T('pe telefon, după programare se reîncarcă luna zilei programate (onSchimbat(f.zi.slice(0, 7)))', /onSchimbat\(f\.zi\.slice\(0, 7\)\)/.test(S.calTsx) && /onSchimbat\(f\.mzi\.slice\(0, 7\)\)/.test(S.calTsx));
      const x = webNou({ luna: '2027-03', data: d0, form: { zi: '', contract_id: 11 } });
      x.__el['mjc-zi'] = { value: '' }; x.__el['mjc-msg'] = { textContent: '' };
      await x.raxMjCalSalveaza();
      T('fără zi: „Alege ziua montajului." și nicio cerere (și pe telefon, înainte de cerere)', x.__el['mjc-msg'].textContent === CAL.CAL_TEXT.faraZi && !x.__fetch.length &&
        /if \(!f\.zi\) \{ setMsg\(CAL_TEXT\.faraZi\); return; \}/.test(S.calTsx));
      const y = webNou({ luna: '2027-03', data: d0, form: { zi: '2027-03-20', contract_id: 11 } });
      y.__el['mjc-zi'] = { value: '2027-03-20' }; y.__el['mjc-gps'] = { value: '99' }; y.__el['mjc-part'] = { value: '' }; y.__el['mjc-msg'] = { textContent: '' };
      y.__ok = false; y.__raspuns = () => ({ error: 'Au mai rămas de programat doar 20 de mașini.' });
      await y.raxMjCalSalveaza();
      const z = webNou({ luna: '2027-03', data: d0, form: { zi: '2027-03-20', contract_id: 11 } });
      z.__el['mjc-zi'] = { value: '2027-03-20' }; z.__el['mjc-gps'] = { value: '1' }; z.__el['mjc-part'] = { value: '' }; z.__el['mjc-msg'] = { textContent: '' };
      z.__ok = false; z.__raspuns = () => ({});
      await z.raxMjCalSalveaza();
      T('refuzul serverului: vorbele lui; fără vorbe, „Nu s-a putut programa." (și pe telefon)',
        y.__el['mjc-msg'].textContent === CAL.eroarea({ status: 400, message: 'Au mai rămas de programat doar 20 de mașini.' }, 'Nu s-a putut programa.') &&
        z.__el['mjc-msg'].textContent === CAL.eroarea({ status: 400, message: 'Eroare 400' }, 'Nu s-a putut programa.'), y.__el['mjc-msg'].textContent + ' / ' + z.__el['mjc-msg'].textContent);
    }

    // 4.1.7 O zi programată: panoul (_mjcLucrareHtml), mută, montată, șterge
    {
      const d = dateProba('2027-03', '2027-03-10');
      let lOk = true, lD = '';
      d.lucrari.forEach((l) => {
        const h = webNou({ luna: '2027-03', data: d, sel: l.id }).W.luc();
        const prog = !CAL.esteMontata(l.status);
        const f = CAL.formLucrare(d.parteneri, l);
        const titlu = unesc((/<div class="mjc-panou"><div class="raco-h2">([^<]*)<\/div>/.exec(h) || [])[1] || '');
        const sub = /<div class="raco-sub">([^<]*)<br>([^<]*)<\/div>/.exec(h) || [];
        const mont = /id="mjc-mont" min="1" max="(\d+)" step="1" value="([^"]*)"/.exec(h);
        const mzi = (/id="mjc-mzi" value="([^"]*)"/.exec(h) || [])[1];
        const pW = optiuni((/id="mjc-mpart">([\s\S]*?)<\/select>/.exec(h) || [])[1]);
        const pT = [{ v: '', t: '— neales —' }].concat(CAL.instalatoriLucrare(d.parteneri, l).map((p) => ({ v: String(p.id), t: p.name })));
        const rez = J([titlu, unesc(sub[1] || ''), unesc(sub[2] || ''), !!mont, mont ? [mont[1], mont[2]] : null, mzi || null, prog ? pW.map((o) => ({ v: o.v, t: o.t })) : null, prog ? aleasa(pW) : null,
          /raxMjCalSterge\(/.test(h), +((/raxMjCalLaClient\((\d+)\)/.exec(h) || [])[1])]);
        const tel = J([(l.company_name || '—') + ' · ' + CAL.ziRo(l.zi), CAL.masini(l.masini) + ' · ' + (l.partener_nume || 'instalator neales') + ' · ' + CAL.stareText(l, d.stari),
          CAL.ceSeMonteaza(l.items), prog, prog ? [String(l.masini), f.mont] : null, prog ? f.mzi : null, prog ? pT : null, prog ? f.mpart : null, prog, l.company_id]);
        if (rez !== tel) { lOk = false; lD = l.id + ': ' + rez + ' ≠ ' + tel; }
        if (prog && unesc((/<div class="raco-sub">(Dacă s-au montat[^<]*)<\/div>/.exec(h) || [])[1] || '') !== CAL.CAL_TEXT.maiPutine) { lOk = false; lD = 'maiPutine'; }
      });
      T('ziua programată: același titlu, aceeași descriere (mașini · instalator · stare, ce se montează), „S-a montat?" / „Mută" / „Șterge ziua" doar cât e programată, aceiași instalatori', lOk, lD);
      const lx = Object.assign({}, d.lucrari[0], { partener_id: 55 });
      T('instalator dispărut de pe listă → „— neales —" (nu trimite la server un instalator care nu mai e)', CAL.formLucrare(d.parteneri, lx).mpart === '' &&
        aleasa(optiuni((/id="mjc-mpart">([\s\S]*?)<\/select>/.exec(webNou({ luna: '2027-03', data: Object.assign({}, d, { lucrari: [lx] }), sel: lx.id }).W.luc()) || [])[1])) === '');
      // Mută
      let mOk = true, mD = '';
      for (const [zi, part] of [['2027-03-15', '7'], ['2027-04-01', ''], ['2026-12-31', '9']]) {
        const x = webNou({ luna: '2027-03', data: d, sel: 101 });
        x.__el['mjc-mzi'] = { value: zi }; x.__el['mjc-mpart'] = { value: part }; x.__el['mjc-msg'] = { textContent: '' };
        x.__raspuns = (url) => (/calendar/.test(url) ? d : { ok: true });
        await x.raxMjCalMuta(101);
        apiLog.length = 0; await CAL.mutaLucrarea(101, CAL.corpMutare({ mont: '3', mzi: zi, mpart: part }));
        const a = x.__fetch[0] || { op: {} }, b = apiLog[0] || { o: {} };
        if (!(a.url === b.p && a.op.method === b.o.method && a.op.body === J(b.o.body) && x.__toast[0] === CAL.toastMutat(zi) && (x.__fetch[1] || {}).url === '/api/montaj/calendar?luna=' + zi.slice(0, 7))) {
          mOk = false; mD = J([a, x.__toast]) + ' ≠ ' + J([b, CAL.toastMutat(zi)]);
        }
      }
      T('„Mută": aceeași cerere (POST /api/montaje/:id/muta, ziua + instalatorul, gol = null), același mesaj, luna zilei noi reîncărcată', mOk, mD);
      const x0 = webNou({ luna: '2027-03', data: d, sel: 101 }); x0.__el['mjc-mzi'] = { value: '' }; x0.__el['mjc-msg'] = { textContent: '' };
      await x0.raxMjCalMuta(101);
      T('„Mută" fără zi: „Alege ziua." și nicio cerere (și pe telefon)', x0.__el['mjc-msg'].textContent === CAL.CAL_TEXT.faraZiMuta && !x0.__fetch.length &&
        /if \(!f\.mzi\) \{ setMsg\(CAL_TEXT\.faraZiMuta\); return; \}/.test(S.calTsx));
      // Montată
      let tOk = true, tD = '';
      for (const l of d.lucrari.filter((y) => !CAL.esteMontata(y.status))) {
        for (let n = 0; n <= l.masini + 1 && tOk; n++) {
          for (const inapoi of [0, 1, 2, 20, 21]) {
            const x = webNou({ luna: '2027-03', data: d, sel: l.id });
            x.__el['mjc-mont'] = { value: String(n) }; x.__el['mjc-msg'] = { textContent: '' };
            x.__raspuns = (url) => (/calendar/.test(url) ? d : { ok: true, inapoi_la_programat: inapoi });
            await x.raxMjCalMontata(l.id);
            apiLog.length = 0; apiRaspuns = () => ({ ok: true, inapoi_la_programat: inapoi });
            const j = await CAL.lucrareMontata(l.id, CAL.corpMontata({ mont: String(n), mzi: l.zi, mpart: '' }));
            apiRaspuns = () => ({ ok: true });
            const a = x.__fetch[0] || { op: {} }, b = apiLog[0] || { o: {} };
            const la = (x.__confirm[0] || {}).m === CAL.intrebareMontata(l, n) && a.url === b.p && a.op.method === b.o.method && a.op.body === J(b.o.body) && x.__toast[0] === CAL.toastMontata(j);
            if (!la) { tOk = false; tD = l.id + '/' + n + '/' + inapoi + ': ' + J([(x.__confirm[0] || {}).m, a.url, a.op.body, x.__toast[0]]) + ' ≠ ' + J([CAL.intrebareMontata(l, n), b.p, J(b.o.body), CAL.toastMontata(j)]); break; }
          }
        }
      }
      T('„Montată": aceeași întrebare (câte, la cine, câte se întorc la „De programat"), aceeași cerere, același mesaj („1 mașină" / „20 de mașini")', tOk, tD);
      const xr = webNou({ luna: '2027-03', data: d, sel: 101 }); xr.__el['mjc-mont'] = { value: '3' }; xr.__el['mjc-msg'] = { textContent: '' }; xr.__da = false;
      await xr.raxMjCalMontata(101);
      T('„Montată" cu „Renunță": nicio cerere (pe telefon întrebarea e o foaie; „Renunță" te întoarce în ziua ei)', !xr.__fetch.length &&
        /if \(x\.fel === 'intreb'\) \{ setFoaie\(\{ fel: 'lucrare', id: x\.id, f: x\.f, start: x\.start \}\); return false; \}/.test(S.calTsx));
      const xs = webNou({ luna: '2027-03', data: d, sel: 101 }); xs.__el['mjc-msg'] = { textContent: '' };
      xs.__raspuns = (url) => (/calendar/.test(url) ? d : { ok: true });
      await xs.raxMjCalSterge(101);
      apiLog.length = 0; await CAL.stergeZiua(101);
      const a = xs.__fetch[0] || { op: {} }, b = apiLog[0] || { o: {} };
      T('„Șterge ziua": aceeași întrebare și aceeași cerere (DELETE /api/montaje/:id), fără mesaj', (xs.__confirm[0] || {}).m === CAL.CAL_TEXT.sterge &&
        a.url === b.p && a.op.method === b.o.method && !xs.__toast.length, J([xs.__confirm[0], a, b]));
      const xc = webNou({ luna: '2027-03', data: d }); xc.raxMjCalLaClient(4);
      T('„La client" pe web deschide firma pe fila Contract; pe telefon, dosarul ei (rutaDosar), din foaie', J(xc.__deschis[0]) === J([4, 'contract']) &&
        /onClient=\{\(id\) => loc\.route\(rutaDosar\(id\), true\)\}/.test(S.mj) && /onClient=\{\(\) => onClient\(lucrareDeschisa\.company_id\)\}/.test(S.calTsx));
    }

    // 4.1.8 Luna: ‹ / › / Azi (raxMjCalLuna) → aceeași cerere
    {
      let lOk = true, lD = '';
      for (const luna of ['2027-01', '2026-12', '2027-06', '2028-02']) {
        for (const pas of [-1, 0, 1]) {
          const d = dateProba(luna, '2026-09-30');
          const x = webNou({ luna, data: d });
          x.__raspuns = () => d;
          await x.raxMjCalLuna(pas);
          apiLog.length = 0; apiRaspuns = () => d; await CAL.calendarMontaj(CAL.lunaAlaturata(luna, pas, d.azi)); apiRaspuns = () => ({ ok: true });
          if ((x.__fetch[0] || {}).url !== (apiLog[0] || {}).p) { lOk = false; lD = luna + '/' + pas + ': ' + (x.__fetch[0] || {}).url + ' ≠ ' + (apiLog[0] || {}).p; }
        }
      }
      T('luna trecută / viitoare / azi: aceeași cerere ca pe web (și peste an, și din februarie bisect)', lOk, lD);
      apiLog.length = 0; await CAL.calendarMontaj(null);
      T('fără lună: /api/montaj/calendar, fără ?luna (serverul pune luna de azi)', (apiLog[0] || {}).p === '/api/montaj/calendar');
    }

    // 4.1.9 Cifra filei „Calendar" (_mjDeseneaza) și venitul din drum (raxLoadMontaj cu `pre`)
    {
      let cOk = true, cD = '';
      [contracteProba(), [], contracteProba().slice(3), contracteProba().slice(0, 1)].forEach((lista) => {
        [[], [{ id: 1 }], [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]].forEach((alte) => {
          const d = dateProba('2027-03', '2027-03-10', { deProgramat: lista });
          const x = webNou({ luna: '2027-03', data: d });
          x._raxMj.fila = 'parteneri'; x._raxPart.lista = alte; x._raxMj.contracte = alte; x._raxMj.lucrari = alte;
          const wF = filePagina(x);
          const nr = { calendar: CAL.deProgramatActive(d).length, parteneri: alte.length, contracte: alte.length, lucrari: alte.length };
          const et = { calendar: 'Calendar', parteneri: 'Parteneri', contracte: 'Contracte cu partenerii', lucrari: 'Lucrări' };
          const tF = ['calendar', 'parteneri', 'contracte', 'lucrari'].map((k) => { const n = MS.cifraFilei(k, nr[k]); return { k, t: et[k] + (n != null ? ' · ' + n : '') }; });
          if (J(wF) !== J(tF)) { cOk = false; cD = J(wF) + ' ≠ ' + J(tF); }
        });
      });
      T('filele: aceeași ordine (Calendar întâi) și aceleași cifre — „Calendar" fără cifră când nu e nimic de programat', cOk, cD);
      T('pe telefon, filele în aceeași ordine ca MJ_FILE de pe web', /const MJ_FILE: \[Fila, string\]\[\] = \[\['calendar', 'Calendar'\], \['parteneri', 'Parteneri'\], \['contracte', 'Contracte cu partenerii'\], \['lucrari', 'Lucrări'\]\];/.test(S.mj) &&
        /var MJ_FILE = \[\['calendar', 'Calendar'\], \['parteneri', 'Parteneri'\], \['contracte', 'Contracte cu partenerii'\], \['lucrari', 'Lucrări'\]\];/.test(html));
      T('filele desenate cu cifraFilei („Calendar" fără „· 0")', /const n = cifraFilei\(k, nr\[k\]\);/.test(S.mj) && /\{et\}\{n != null && <> · <b>\{n\}<\/b><\/>\}/.test(S.mj));
      let pOk = true, pD = '';
      [contracteProba(), contracteProba().slice(3), []].forEach((lista) => {
        contracteProba().forEach((c) => {
          const d = dateProba('2027-03', '2027-03-10', { deProgramat: lista });
          const x = webNou({ luna: '2027-03', data: d, pre: c.company_id });
          x.companiesCache = [{ id: c.company_id, name: c.company_name || 'Firmă fără nume' }];
          x.__pre();
          const fW = x._raxMj.cal.form;
          const r = CAL.dinContract(d, c.contract_id);
          let tel;
          if ('contract_id' in r) tel = { contract_id: r.contract_id, zi: d.azi, partener_id: null };
          else tel = { mesaj: !CAL.deProgramatActive(d).length ? CAL.CAL_TEXT.nimic : CAL.faraClientText(r.faraClient || (c.company_name || 'Firmă fără nume')) };
          let web;
          if (fW && fW.contract_id != null) web = { contract_id: fW.contract_id, zi: fW.zi, partener_id: fW.partener_id };
          else web = { mesaj: unesc((/<div class="raco-msg">([^<]*)<\/div>/.exec(x.W.form()) || [])[1] || '') };
          if (J(web) !== J(tel)) { pOk = false; pD = c.contract_id + ': ' + J(web) + ' ≠ ' + J(tel); }
        });
      });
      T('venit din drum: același contract pregătit (ziua de azi, fără instalator) sau același „n-are nimic de programat" / „Nimic de programat"', pOk, pD);
      T('adresa din drum: /admin/montaj?fila=calendar&contract=<id>', CAL.rutaCalendarMontaj(42) === '/admin/montaj?fila=calendar&contract=42');
      const efPre = taie(S.calTsx, 'if (pre == null || !d) return;', '}, [pre, d]);');
      T('pe telefon, venitul din drum: formularul fără instalator (ca pe web), „Nimic…" înaintea lui „n-are…", apoi numele din lista contractelor',
        /deschideProg\(d\.azi, r\.contract_id, null\)/.test(efPre) && efPre.indexOf('CAL_TEXT.nimic') < efPre.indexOf('faraClientText(r.faraClient)') &&
        /numeFirmaContract\(pre\)/.test(efPre) && /'Firma asta'/.test(efPre), efPre.slice(0, 200));
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  async function pachetTexte() {
    sect('4.2 L15 — ritmul instalatorului; L16 — Stocul');
    const parteneri = [
      { id: 1, name: 'A', cui: 'RO1', zona: 'Timiș', email: 'a@a.ro', tarife: { gps: 60 }, ritm_facturare: 'saptamanal' },
      { id: 2, name: 'B', cui: null, zona: '', email: null, tarife: {}, ritm_facturare: null },
      { id: 3, name: 'C & <D>', cui: 'RO3', tarife: { gps: 1, lvcan: 2, fms: 3 }, ritm_facturare: 'lunar', active: false },
      { id: 4, name: 'E', tarife: { gps: 1, lvcan: 2 }, ritm_facturare: 'altceva' },
    ];
    const x = webNou(); x._raxPart.lista = parteneri; x._raxMj.contracte = [];
    const h = x.W.partCorp();
    const subs = []; const re = /<span class="raco-row-s">([^<]*)<\/span>/g; let m;
    while ((m = re.exec(h))) subs.push(unesc(m[1]).split(' · ').map((p) => (p === '1 tarife scrise' ? '1 tarif scris' : p)).join(' · '));
    T('rândul partenerului: CUI · zonă · email · tarife · „ne facturează lunar / săptămânal" — ca pe web (doar „1 tarif scris" e mai corect)',
      J(subs) === J(parteneri.map(MS.subPartener)), J(subs) + ' ≠ ' + J(parteneri.map(MS.subPartener)));
    T('ParteneriMontaj scrie rândul cu subPartener', /const sub = subPartener\(p\);/.test(S.part));
    const notaW = (/<div class="raco-sub" style="margin-top:-2px;color:var\(--text-secondary\);">(Montajul făcut de el[^<]*)<\/div>/.exec(html) || [])[1];
    T('nota de sub „Ne facturează" = cea de pe web, și e chiar sub casetă', !!notaW && unesc(notaW) === MS.NOTA_RITM &&
      /<option value="saptamanal">săptămânal<\/option>\s*<\/select>\s*<div class="mj-nota">\{NOTA_RITM\}<\/div>/.test(S.part));
    T('câmpul „Ne facturează" scris de Alin a rămas (lunar / săptămânal, trimis ca ritm_facturare)', /<label>Ne facturează<\/label>/.test(S.part) &&
      /ritm_facturare: edit\.ritm === 'saptamanal' \? 'saptamanal' : 'lunar'/.test(S.part));
    const expr = (/'<span class="raco-until">ne facturează ' \+ (\(c\.ritm_facturare === 'saptamanal' \? 'săptămânal' : 'lunar'\)) \+ '<\/span>/.exec(W.mjContracte) || [])[1];
    const fw = expr ? new Function('c', 'return ' + expr) : null;
    T('cartea contractului cu partenerul: „ne facturează …", cu ritmul înghețat în contract (ca pe web)', !!fw &&
      ['saptamanal', 'lunar', null, 'x'].every((r) => fw({ ritm_facturare: r }) === MS.ritmText(r)) &&
      /<span class="ctr-small">ne facturează \{ritmText\(c\.ritm_facturare\)\}<\/span>/.test(S.mj) && /\{ritm\}<\/>/.test(S.mj));
    const xe = webNou(); xe._ctrLuniOptiuni = () => ''; xe._f = () => '';
    let bOk = true, bD = '';
    [{ ritm_facturare: 'saptamanal' }, { ritm_facturare: 'lunar' }, {}].forEach((c) => {
      const eh = xe.W.edit(Object.assign({ id: 1, number: 'RAT-M-1', partener_name: 'P' }, c));
      const t = unesc((/id="mj-retarif"> ([^<]*)<\/label>/.exec(eh) || [])[1] || '');
      if (t !== MS.bifaRetarif(c)) { bOk = false; bD = t + ' ≠ ' + MS.bifaRetarif(c); }
    });
    T('bifa „Reia din fișa partenerului tarifele … și cât de des ne facturează (acum: …)" — ca pe web', bOk && /<span>\{bifaRetarif\(c\)\}<\/span>/.test(S.mj), bD);
    T('întrebarea „Reia tarifele" (butonul din „Ce lipsește") spune și ea că se reia ritmul — serverul chiar îl reia',
      /'\) și cât de des ne facturează \(acum: ' \+ ritmText\(dlg\.c\.ritm_facturare\) \+ '\)\?'/.test(S.mj) &&
      /b\.ritm_facturare = montaj\.ritmFacturare\(p && p\.ritm_facturare\);/.test(S.srv));
    const xl = webNou(); xl._raxMj.lucrari = []; xl._raxMj.stari = {}; xl._raxPart.lista = [];
    const lh = xl.W.lucrari();
    const subW = unesc((/<div class="raco-sub">(Toate lucrările[^<]*)<\/div>/.exec(lh) || [])[1] || '');
    const subT = (/<div class="ctr-sub">(Toate lucrările[^<]*)<\/div>/.exec(S.mj) || [])[1];
    T('subtitlul filei Lucrări: „… Se programează în Calendar; se editează din fișa clientului (fila Contract)." — ca pe web', !!subW && subW === subT, subW + ' ≠ ' + subT);

    // L16 — Stoc
    const notaImeiW = (/<div class="raco-sub" style="margin-top:-2px;color:var\(--text-secondary\);">(Un GPS trecut aici[^<]*)<\/div>/.exec(html) || [])[1];
    const notaImeiT = (/export const NOTA_IMEI = '([^']*)';/.exec(S.stoc) || [])[1];
    T('Stoc: nota de sub caseta seriilor = cea de pe web, chiar sub casetă', !!notaImeiW && unesc(notaImeiW) === notaImeiT &&
      /<textarea class="st-serii"[^\n]*\/>\s*<div class="st-nota">\{NOTA_IMEI\}<\/div>/.test(S.stoc));
    const mesT = taie(S.stoc, 'export function mesajIntrare(', '\n}\n') + '\n}';
    let mesaj = null;
    try { mesaj = modul(tsJs(mesT.replace(/^export /, ''), 'mesaj.ts') + '\nmodule.exports = mesajIntrare;', 'mesajIntrare', {}, { nrDe: numar.nrDe }).exp; } catch (e) { console.log('    (mesajIntrare: ' + e.message + ')'); }
    let sOk = typeof mesaj === 'function', sD = sOk ? '' : 'mesajIntrare lipsește';
    for (const a of [1, 2, 5, 19, 20, 21, 100, 101, 120]) {
      for (const p of [undefined, 0, 1, 2, 20, 21]) {
        if (!sOk) break;
        const r = { ok: true, adaugate: a, ids: [], primite_la_conectare: p };
        const y = webNou();
        y.__el['stoc-tip'] = { value: 'fmc130' };
        y._stocCere = async () => ({ ok: true, j: r });
        y._raxStoc = { panou: 'intrare' }; y.raxLoadStoc = () => {};
        vm.runInContext(W.stocIntrare, y);
        await y.raxStocIntrare();
        if (y.__toast[0] !== mesaj(r)) { sOk = false; sD = J(r) + ': ' + y.__toast[0] + ' ≠ ' + mesaj(r); }
      }
    }
    T('Stoc: mesajul după intrare = cel de pe web („· GPS-urile pot transmite de îndată ce sunt montate"), pe cifrele serverului', sOk, sD);
    T('Stoc: intrarea arată mesajul (și citește primite_la_conectare din răspuns)', /showToast\(mesajIntrare\(r\)\)/.test(S.stoc) && /primite_la_conectare\?: number \} = await Api\.stocIntrare\(/.test(S.stoc));
    T('Stoc: textele scrise de Alin azi au rămas', S.stoc.indexOf('montate și netrecute pe firmă (vezi Dispozitive → Neasignate), sau uitate') > 0 &&
      S.stoc.indexOf('Aparatele GPS intră în aplicație o singură dată, aici, cu IMEI-ul') > 0 && S.stoc.indexOf('Seriile, una pe rând — la GPS, IMEI-ul (15 cifre)') > 0);
    return mesaj;
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function pachetEcrane() {
    sect('4.3 Ecranele: desenate pe date de probă, ce NU fac, culorile măsurate');
    // preact și desenul lui în HTML, din mobile/node_modules (în CI lipsesc: ecranul nu se desenează, vezi sus).
    const preact = PREACT && PREACT.preact, hooks = PREACT && PREACT.hooks, jsxRt = PREACT && PREACT.jsxRt, rts = PREACT && PREACT.rts;
    const render = rts && (rts.render || rts.renderToString || rts.default || rts);
    if (PREACT) T('preact și preact-render-to-string se încarcă din mobile/node_modules', !!(preact && hooks && jsxRt && typeof render === 'function'));
    else SARI('preact și preact-render-to-string se încarcă din mobile/node_modules', FARA_DESEN);
    let CM = {};
    const toasts = [];
    // Fără preact (CI), ecranul se încarcă cu preact-ul „de carton": ca să se vadă că se traduce și ce exportă.
    try {
      CM = modul(tsJs(S.calTsx, 'CalendarMontaj.tsx', true), 'CalendarMontaj.tsx', {
        'preact/hooks': hooks || hooksCarton, 'preact/jsx-runtime': jsxRt || jsxCarton, '../app/store': { showToast: (t, e) => toasts.push([t, !!e]) },
        '../lib/inapoiFoaie': { useInapoiInchide: () => {} }, '../lib/calendarMontaj': CAL,
        './FlotaUi': { Confirma: (p) => (preact || preactCarton).h('div', { class: 'confirma-proba' }, p.title, ' | ', p.text) }, './Icon': { Icon: () => null },
      }).exp;
    } catch (e) { console.log('    (CalendarMontaj.tsx: ' + e.message + ')'); }
    T('CalendarMontaj.tsx se traduce și exportă ecranul și foile (CalendarMontaj, DeProgramat, FoaieProgramare, FoaieLucrare)',
      ['CalendarMontaj', 'DeProgramat', 'FoaieProgramare', 'FoaieLucrare'].every((k) => typeof CM[k] === 'function'));
    if (typeof CM.CalendarMontaj === 'function' && typeof render === 'function') {
      const h = preact.h;
      const text = (s) => unesc(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
      const rau = (s) => /undefined|NaN|\[object /.test(s);
      let totOk = true, totD = '';
      for (const [luna, azi, part] of [['2027-03', '2027-03-10', ''], ['2028-02', '2028-02-29', ''], ['2026-11', '2026-10-30', '9']]) {
        const d = dateProba(luna, azi);
        const out = render(h(CM.CalendarMontaj, { d, onLuna() {}, onSchimbat() {}, onClient() {} }));
        const g = CAL.grilaLunii(luna, azi), pe = CAL.lucrariPeZi(d.lucrari, '');
        const zileBtn = (out.match(/<button type="button" class="mjc-zi( wk)?( azi)?"/g) || []).length;
        const gol = (out.match(/class="mjc-zi gol"/g) || []).length;
        const etGrila = g.zile.reduce((s, z) => s + Math.min(2, (pe[z.zi] || []).length), 0);
        const etGasite = ((out.split('class="mjc-grila"')[1] || '').split('class="mjc-leg"')[0].match(/class="mjc-l mjc-(prog|mont)"/g) || []).length;
        const randuri = (out.match(/class="mjc-rand"/g) || []).length;
        const nLuc = d.lucrari.filter((l) => l.zi.slice(0, 7) === luna).length;
        const t = text(out);
        const bine = zileBtn === g.zile.length && gol === g.gol && etGrila === etGasite && randuri === nLuc && t.indexOf(CAL.lunaText(luna)) >= 0 &&
          (out.match(/class="mjc-zs"/g) || []).length === 7 && t.indexOf('+1') >= 0 &&
          contracteProba().every((c) => t.indexOf(CAL.detaliiContract(c)) >= 0 && (!c.termen || t.indexOf(CAL.termenPastila(c.termen)) >= 0)) &&
          t.indexOf(CAL.stocText(STOC)) >= 0 && t.indexOf(CAL.CAL_TEXT.subDeProgramat) >= 0 && t.indexOf(CAL.CAL_TEXT.sub) >= 0 &&
          d.lucrari.filter((l) => l.zi.slice(0, 7) === luna).every((l) => t.indexOf(CAL.masini(l.masini) + ' · ' + (l.partener_nume || 'instalator neales') + ' · ' + CAL.stareText(l, d.stari)) >= 0) &&
          (out.match(/class="ctr-btn pri"/g) || []).length === CAL.deProgramatActive(d).length && !rau(out) &&
          (out.match(/class="ctr-pill mjc-termen bad"/g) || []).length === 1 && (out.match(/class="ctr-pill mjc-termen warn"/g) || []).length === 1;
        if (!bine) { totOk = false; totD = luna + ': zile ' + zileBtn + '/' + g.zile.length + ', gol ' + gol + '/' + g.gol + ', etichete ' + etGasite + '/' + etGrila + ', rânduri ' + randuri + '/' + nLuc + ', rău ' + rau(out); }
      }
      T('calendarul desenat: luna, 7 zile ale săptămânii, toate zilele, etichetele (cel mult 2 pe zi + „+1"), zilele cu montaj cu clientul, „De programat" cu termenele colorate și butoanele, stocul — fără „undefined"/„NaN"', totOk, totD);
      const gol = render(h(CM.CalendarMontaj, { d: dateProba('2027-03', '2027-03-10', { lucrari: [], deProgramat: [], stoc: [] }), onLuna() {}, onSchimbat() {}, onClient() {} }));
      T('luna goală: „Nicio zi de montaj în luna asta." și golul de la „De programat"', text(gol).indexOf('Nicio zi de montaj în luna asta.') >= 0 && text(gol).indexOf(CAL.CAL_TEXT.golDeProgramat) >= 0 && !rau(gol));
      const inc = render(h(CM.CalendarMontaj, { d: null, onLuna() {}, onSchimbat() {}, onClient() {} }));
      const err = render(h(CM.CalendarMontaj, { d: null, err: 'Acces interzis.', onLuna() {}, onSchimbat() {}, onClient() {} }));
      T('fără date: se încarcă (rotița); căzut: eroarea', /class="spin"/.test(inc) && text(err).indexOf('Acces interzis.') >= 0);
      const incLuna = render(h(CM.CalendarMontaj, { d: dateProba('2027-03', '2027-03-10'), incarcand: true, onLuna() {}, onSchimbat() {}, onClient() {} }));
      T('altă lună pe drum: săgețile și „Azi" așteaptă (dezactivate), cu rotița lângă lună', (incLuna.match(/<button type="button" class="ctr-btn( mjc-sag)?" disabled/g) || []).length === 3 && /mjc-spin/.test(incLuna));
      // Foile
      const d = dateProba('2027-03', '2027-03-10');
      const f = CAL.formNou(d, '2027-03-20', 11, '7');
      const fp = render(h(CM.FoaieProgramare, { d, f, msg: 'Refuzul serverului', busy: false, onF() {}, onClose: () => true, onSalveaza() {} }));
      const tp = text(fp);
      T('foaia „Programează montajul": clientul, ziua, „Câte mașini (din 20 rămase)", cine montează, adaptoarele, termenul, refuzul',
        tp.indexOf('Câte mașini (din 20 rămase)') >= 0 && tp.indexOf('Instalare modul LV-CAN (din 12 rămase)') >= 0 && tp.indexOf('Instalare FMS (tahograf) (din 7 rămase)') >= 0 &&
        tp.indexOf(CAL.termenLinie(CAL.contractulFormularului(d, 11).termen)) >= 0 && tp.indexOf('— îl aleg mai târziu —') >= 0 && tp.indexOf('Refuzul serverului') >= 0 &&
        (fp.match(/<option /g) || []).length === CAL.deProgramatActive(d).length + 1 + CAL.instalatoriActivi(d.parteneri).length && !rau(fp) && /value="2027-03-20"/.test(fp), tp.slice(0, 400));
      const fn = render(h(CM.FoaieProgramare, { d: dateProba('2027-03', '2027-03-10', { deProgramat: [] }), f, msg: '', busy: false, onF() {}, onClose: () => true, onSalveaza() {} }));
      T('foaia fără nimic de programat: „Nimic de programat: …"', text(fn).indexOf(CAL.CAL_TEXT.nimic) >= 0);
      const lp = d.lucrari[0], lm = d.lucrari[1];
      const fl = render(h(CM.FoaieLucrare, { d, l: lp, f: CAL.formLucrare(d.parteneri, lp), msg: '', busy: false, onF() {}, onClose: () => true, onMontata() {}, onMuta() {}, onSterge() {}, onClient() {} }));
      const fm = render(h(CM.FoaieLucrare, { d, l: lm, f: CAL.formLucrare(d.parteneri, lm), msg: '', busy: false, onF() {}, onClose: () => true, onMontata() {}, onMuta() {}, onSterge() {}, onClient() {} }));
      const tl = text(fl), tm = text(fm);
      T('ziua programată: „S-a montat?", „Montată", „Altă zi sau alt instalator", „Mută", „La client", „Șterge ziua" și ce se montează',
        ['S-a montat?', 'Montată', 'Altă zi sau alt instalator', 'Mută', 'La client', 'Șterge ziua', CAL.CAL_TEXT.maiPutine, CAL.ceSeMonteaza(lp.items), 'Calendar SRL · ' + CAL.ziRo(lp.zi)].every((s) => tl.indexOf(s) >= 0) && !rau(fl));
      T('ziua deja montată: doar „La client" (nu se mai mută, nu se șterge)', tm.indexOf('La client') >= 0 && tm.indexOf('S-a montat?') < 0 && tm.indexOf('Șterge ziua') < 0 && tm.indexOf('Mută') < 0 && !rau(fm));
    } else if (typeof render !== 'function') {
      // Fără preact-render-to-string (CI) ecranul nu se poate desena: verificările desenului (aceleași nume ca mai sus) se sar.
      ['calendarul desenat: luna, 7 zile ale săptămânii, toate zilele, etichetele (cel mult 2 pe zi + „+1"), zilele cu montaj cu clientul, „De programat" cu termenele colorate și butoanele, stocul — fără „undefined"/„NaN"',
        'luna goală: „Nicio zi de montaj în luna asta." și golul de la „De programat"',
        'fără date: se încarcă (rotița); căzut: eroarea',
        'altă lună pe drum: săgețile și „Azi" așteaptă (dezactivate), cu rotița lângă lună',
        'foaia „Programează montajul": clientul, ziua, „Câte mașini (din 20 rămase)", cine montează, adaptoarele, termenul, refuzul',
        'foaia fără nimic de programat: „Nimic de programat: …"',
        'ziua programată: „S-a montat?", „Montată", „Altă zi sau alt instalator", „Mută", „La client", „Șterge ziua" și ce se montează',
        'ziua deja montată: doar „La client" (nu se mai mută, nu se șterge)'].forEach((n) => SARI(n, FARA_DESEN));
    }

    // Ce NU face ecranul
    const cod = faraComentarii(S.calTsx) + faraComentarii(S.calLib);
    T('nicio cerere fetch() ocolind clientul API; niciun preț sau termen socotit pe telefon', !/\bfetch\(/.test(cod) && !/pretClient\s*[*+]|costPartener|termenMontaj\(|MONTAJ_ZILE/.test(cod));
    T('rutele calendarului sunt cele ale serverului (și toate sunt doar pentru noi)', ['/api/montaj/calendar', '/api/montaj/programeaza', '/api/montaje/:id/muta', '/api/montaje/:id/montata'].every((r) =>
      new RegExp("app\\.(get|post)\\('" + r.replace(/[/:]/g, (c) => '\\' + c) + "', requireAuth, requireSuperadmin").test(S.srv)) &&
      /app\.delete\('\/api\/montaje\/:id', requireAuth, requireSuperadmin/.test(S.srv));
    T('foile calendarului sunt păzite la „înapoi" (o singură pază, pe foaia deschisă) și întreabă înainte să piardă ce ai ales',
      /useInapoiInchide\(!!foaie, inchide\)/.test(S.calTsx) && /Închizi fără să salvezi\?/.test(S.calTsx));
    T('Montaj: fila ținută minte pornește pe Calendar, adresa ?fila= / ?contract= se citește și se curăță',
      /let filaTinuta: Fila = 'calendar';/.test(S.mj) && /parseInt\(String\(q\.contract \|\| ''\), 10\)/.test(S.mj) && /loc\.route\('\/admin\/montaj', true\)/.test(S.mj) &&
      /<CalendarMontaj d=\{cal\}/.test(S.mj));
    T('Montaj.tsx: datele partenerilor tot la prânz, nicio zi la miezul nopții (regula din verify_contracte_telefon)', /ziLaPranz\(/.test(S.mj) && !/(^|[^\w])zi\(/.test(S.mj));
    T('grila încape la 375px: 7 coloane care se strâng (minmax(0, 1fr)), căsuța fără lățime minimă, nicio lățime fixă mare',
      /\.mjc-grila \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/.test(S.mjCss) && /\.mjc-zi \{ min-width: 0;/.test(S.mjCss) &&
      !/(^|[^-])(min-)?width:\s*(\d{3,})px/.test(S.mjCss.replace(/\/\*[\s\S]*?\*\//g, '')));

    // Culorile noi, măsurate pe ambele teme
    const tokD = variabile(S.tokens, ':root, :root[data-theme="dark"]');
    const tokL = Object.assign({}, tokD, variabile(S.tokens, ':root[data-theme="light"]'));
    const mjD = variabile(S.mjCss, ':root'), mjL = Object.assign({}, mjD, variabile(S.mjCss, ':root[data-theme="light"]'));
    const ctrD = variabile(S.ctrCss, ':root'), ctrL = Object.assign({}, ctrD, variabile(S.ctrCss, ':root[data-theme="light"]'));
    const rezolva = (v, tok) => { const m = /^var\(--([\w-]+)\)$/.exec(String(v || '').trim()); return m ? tok[m[1]] : v; };
    let cOk = true; const cD = [];
    [['întunecată', tokD, mjD, ctrD], ['deschisă', tokL, mjL, ctrL]].forEach(([tema, tok, mj, ctr]) => {
      const fund = { 'căsuță': culoare(tok['bg-card']), 'weekend': culoare(tok['bg-dark']), 'panou': culoare(tok['bg-panel']) };
      const masura = (nume, text, bg, fundal) => {
        const tc = culoare(text), bc = culoare(bg);
        if (!tc || !bc || !fundal) { cOk = false; cD.push(tema + ' ' + nume + ': culoare necitită (' + text + ' / ' + bg + ')'); return; }
        const r = contrast(peste(tc, fundal), peste(bc, fundal));
        if (r < 4.5) { cOk = false; cD.push(tema + ' ' + nume + ' = ' + r.toFixed(2)); }
      };
      Object.keys(fund).forEach((k) => {
        masura('programat pe ' + k, mj['mjc-prog'], mj['mjc-prog-bg'], fund[k]);
        masura('montat pe ' + k, mj['mjc-mont'], mj['mjc-mont-bg'], fund[k]);
      });
      masura('termen curând', mj['mjc-prog'], mj['mjc-prog-bg'], fund.panou);
      masura('termen depășit', mj['mjc-rau'], mj['mjc-rau-bg'], fund.panou);
      masura('ziua din lună (căsuță)', tok['text-secondary'], tok['bg-card'], fund['căsuță']);
      masura('ziua din lună (weekend)', tok['text-secondary'], tok['bg-dark'], fund.weekend);
      masura('ziua de azi', rezolva(ctr['ctr-ok'], tok), tok['bg-card'], fund['căsuță']);
      masura('notele (--text-secondary pe foaie)', tok['text-secondary'], tok['bg-panel'], fund.panou);
    });
    T('culorile calendarului (programat, montat, termen curând / depășit, ziua, azi, notele): ≥ 4,5:1 pe AMBELE teme, și pe weekend', cOk, cD.join('; '));
    T('culorile noi stau în variabile de temă, cu pereche pe tema deschisă', ['mjc-prog', 'mjc-prog-bg', 'mjc-mont', 'mjc-mont-bg', 'mjc-rau', 'mjc-rau-bg'].every((k) => mjD[k] && variabile(S.mjCss, ':root[data-theme="light"]')[k]) &&
      !/#[0-9a-f]{3,6}/i.test(S.calTsx) && !/#[0-9a-f]{3,6}\b/i.test(S.mjCss.replace(/:root[^{]*\{[^}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  async function pachetServer({ R, ck }, mesaj) {
    sect('4.4 Pe server pornit: calendarul, prin clientul HTTP adevărat al telefonului');
    // Clientul HTTP al telefonului (api/client.ts, ca în browser), cu sesiunea super-adminului.
    const hook = {};
    const client = modul(tsJs(S.client.split('(import.meta as any).env').join('({})'), 'client.ts'), 'api/client.ts',
      { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} } }, { fetch: (...a) => hook.fetch(...a) });
    hook.fetch = (url, op) => fetch(BASE + url, Object.assign({}, op, { headers: Object.assign({}, op && op.headers, { Cookie: ck }) }));
    const K = modul(tsJs(S.calLib, 'calendarMontaj.ts'), 'lib/calendarMontaj.ts', calCereri(client.exp)).exp;
    const apiTel = client.exp.api;

    // Un contract semnat, din ofertă: 5 mașini, 3 adaptoare LV-CAN (ca în verify_montaj_calendar).
    const part = (await R('POST', '/api/montaj/parteneri', { name: 'Instal Vest SRL', tarife: { gps: 60, lvcan: 40 } })).j || {};
    const partS = (await R('POST', '/api/montaj/parteneri', { name: 'Montaj Săptămânal SRL', tarife: { gps: 55 }, ritm_facturare: 'saptamanal' })).j || {};
    const oferta = async (client_name, qGps, qLvCan) => (await R('POST', '/api/admin/offers', { name: 'Ofertă ' + client_name, client_name, monthly_total: 29 * qGps, currency: 'RON',
      config: { cfg: { nVeh: qGps, contractMonths: 12, montaj: { qGps, qLvCan }, devices: {} }, prices: { pPlain: 29, mGps: 100, mLvCan: 60 } } })).j;
    const contract = async (nume, qGps, qLvCan, semneaza) => {
      const of = await oferta(nume, qGps, qLvCan);
      const co = (await R('POST', '/api/companies', { name: nume })).j;
      await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO' + (100 + co.id), address: 'Str. Probei ' + co.id, legal_rep: { name: 'Ana Proba', role: 'Administrator' } });
      const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
        din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: qGps, pret: 29, total: 29 * qGps }], servicii: [] } })).j;
      if (semneaza) {
        await R('PUT', '/api/contracts/' + c.id, { status: 'aprobat' });
        await R('PUT', '/api/contracts/' + c.id, { status: 'trimis' });
        await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
      }
      return { co, c };
    };
    const A = await contract('Calendar Telefon SRL', 5, 3, true);
    const N = await contract('Nesemnat Telefon SRL', 2, 0, false);
    T('contractele de probă (unul semnat, unul nu)', !!(A.c && A.c.id && N.c && N.c.id), J([A.c, N.c]));
    const LUNA = '2027-03';
    let d = await K.calendarMontaj(LUNA);
    const alLui = (x, id) => (x.deProgramat || []).filter((y) => y.contract_id === id)[0] || null;
    let cA = alLui(d, A.c.id);
    T('telefonul citește calendarul lunii: luna, azi, instalatorii, stările, contractul semnat la „De programat" (5 mașini, 3 adaptoare)', d.luna === LUNA && /^\d{4}-\d{2}-\d{2}$/.test(d.azi) &&
      d.parteneri.some((p) => p.id === part.id && p.active) && d.stari.programat === 'programat' && !!cA && cA.ramase === 5 &&
      J(cA.tipuri.map((t) => t.tip + ':' + t.ramase + ':' + t.peMasina)) === J(['gps:5:1', 'lvcan:3:0.6']), J(cA));
    T('cifra filei „Calendar" numără și contractul ăsta', MS.cifraFilei('calendar', K.deProgramatActive(d).length) >= 1);
    T('pagina desenează „De programat" pe datele serverului exact ca telefonul', J(randuriDp(webNou({ luna: LUNA, data: d }).W.dp())) === J(randuriDpTel(d.deProgramat)));
    const pre = K.dinContract(d, A.c.id);
    T('venit din drum cu ?contract=: formularul pe contractul lui', pre.contract_id === A.c.id);
    let f = K.formNou(d, LUNA + '-10', A.c.id, String(part.id));
    T('formularul propune: toate cele 5 mașini, 3 adaptoare, instalatorul ales sus', f.n === '5' && f.alte.lvcan === '3' && f.part === String(part.id), J(f));
    f = K.cuMasini(cA, f, '3');
    T('3 mașini → 2 adaptoare (0,6 pe mașină), propuse singure', f.alte.lvcan === '2', J(f));
    let e = null, r = null;
    try { r = await K.programeazaMontaj(K.corpProgramare(cA, f)); } catch (x) { e = x; }
    T('programează: serverul primește ce trimite telefonul (3 GPS + 2 adaptoare, prețul din contract, costul din tarifele instalatorului)', !e && r && r.ok &&
      Number(r.lucrare.total_client) === 420 && Number(r.lucrare.total_partener) === 260, e ? e.message : J(r));
    d = await K.calendarMontaj(LUNA); cA = alLui(d, A.c.id);
    const l1 = d.lucrari.filter((l) => l.contract_id === A.c.id)[0] || {};
    const pe = K.lucrariPeZi(d.lucrari, '');
    T('ziua apare în calendar pe 10.03, cu 3 mașini, clientul și instalatorul (și în grilă, și în lista zilelor)', l1.zi === LUNA + '-10' && l1.masini === 3 &&
      (pe[LUNA + '-10'] || []).some((x) => x.id === l1.id) && K.titluLucrare(l1, d.stari) === 'Calendar Telefon SRL · 3 mașini · Instal Vest SRL · programat', J(l1));
    T('„De programat": „0 din 5 mașini montate · 3 mașini programate · 2 mașini de programat"', K.detaliiContract(cA) === '0 din 5 mașini montate · 3 mașini programate · 2 mașini de programat', K.detaliiContract(cA));
    T('pe datele serverului, pagina și telefonul desenează la fel grila (etichetele lucrării)', (() => {
      const hh = webNou({ luna: LUNA, data: d }).W.cal();
      return unesc((/title="([^"]*)" onclick="event\.stopPropagation\(\);raxMjCalLucrare\(/.exec(hh) || [])[1] || '') === K.titluLucrare(l1, d.stari);
    })());
    // Peste ce a rămas → refuz, cu vorbele serverului
    let f2 = K.formNou(d, LUNA + '-12', A.c.id, null);
    T('rămân 2 mașini (și 1 adaptor) de propus', f2.n === '2' && f2.alte.lvcan === '1', J(f2));
    f2 = K.cuMasini(cA, f2, '3');
    e = null; try { await K.programeazaMontaj(K.corpProgramare(cA, f2)); } catch (x) { e = x; }
    T('peste ce a rămas → refuz: „Au mai rămas de programat doar 2 mașini." (vorbele serverului, pe foaie)', !!e && e.status === 400 &&
      K.eroarea(e, 'Nu s-a putut programa.') === 'Au mai rămas de programat doar 2 mașini.', e && e.message);
    f2 = K.cuMasini(cA, f2, '2');
    e = null; try { r = await K.programeazaMontaj(K.corpProgramare(cA, f2)); } catch (x) { e = x; }
    d = await K.calendarMontaj(LUNA);
    const l2 = d.lucrari.filter((l) => l.contract_id === A.c.id && l.id !== l1.id)[0] || {};
    T('fără instalator ales se poate programa („instalator neales")', !e && l2.partener_id == null && K.titluLucrare(l2, d.stari).indexOf('instalator neales') > 0, e ? e.message : J(l2));
    T('toate programate: contractul nu mai e în lista „Clientul", dar rămâne la „De programat" (fără buton)', !K.deProgramatActive(d).some((x) => x.contract_id === A.c.id) &&
      !!alLui(d, A.c.id) && randuriDpTel([alLui(d, A.c.id)])[0].buton === null);
    // Mută (cu instalator → costul din tarifele lui)
    e = null; try { r = await K.mutaLucrarea(l2.id, K.corpMutare({ mont: '2', mzi: LUNA + '-15', mpart: String(part.id) })); } catch (x) { e = x; }
    d = await K.calendarMontaj(LUNA);
    const m2 = d.lucrari.filter((l) => l.id === l2.id)[0] || {};
    T('mută pe 15.03 cu instalatorul ales (costul din tarifele lui)', !e && m2.zi === LUNA + '-15' && m2.partener_id === part.id && Number(r.lucrare.total_partener) === 160 &&
      K.toastMutat(LUNA + '-15') === 'Mutat pe 15.03.2027 ✓', e ? e.message : J([m2, r]));
    // Montată cu mai puține → restul se întoarce la „De programat"
    const fl = K.formLucrare(d.parteneri, l1);
    T('„S-a montat?" pornește de la toate mașinile zilei (3), iar instalatorul e cel de pe zi', fl.mont === '3' && fl.mpart === String(part.id), J(fl));
    T('întrebarea: „Treci lucrarea ca montată: 2 mașini la Calendar Telefon SRL? Celelalte 1 mașină se întorc la „De programat". …"',
      K.intrebareMontata(l1, 2) === 'Treci lucrarea ca montată: 2 mașini la Calendar Telefon SRL? Celelalte 1 mașină se întorc la „De programat". Aparatele le treci apoi pe firmă din Dispozitive → Neasignate.');
    let j = null; e = null; try { j = await K.lucrareMontata(l1.id, K.corpMontata(Object.assign({}, fl, { mont: '2' }))); } catch (x) { e = x; }
    d = await K.calendarMontaj(LUNA); cA = alLui(d, A.c.id);
    const m1 = d.lucrari.filter((l) => l.id === l1.id)[0] || {};
    T('montată 2 din 3: mesajul „Montată ✓ · 1 mașină înapoi la „De programat"", ziua verde, una înapoi la programat', !e && j.inapoi_la_programat === 1 &&
      K.toastMontata(j) === 'Montată ✓ · 1 mașină înapoi la „De programat"' && K.esteMontata(m1.status) && m1.masini === 2 &&
      cA.montate === 2 && cA.programate === 2 && cA.ramase === 1 && K.detaliiContract(cA) === '2 din 5 mașini montate · 2 mașini programate · 1 mașină de programat', e ? e.message : J([j, m1, cA]));
    e = null; try { await K.lucrareMontata(l1.id, { masini: 1 }); } catch (x) { e = x; }
    T('a doua oară „montată" → refuz, cu vorbele serverului', !!e && e.status === 400 && K.eroarea(e, 'Nu s-a putut salva.') === 'Lucrarea e deja trecută ca montată.', e && e.message);
    e = null; try { await K.mutaLucrarea(l1.id, K.corpMutare({ mont: '2', mzi: LUNA + '-20', mpart: '' })); } catch (x) { e = x; }
    T('una montată nu se mai mută → refuz, cu vorbele serverului', !!e && e.status === 400 && /deja montată/.test(K.eroarea(e, 'Nu s-a putut muta.')), e && e.message);
    e = null; try { await K.lucrareMontata(l2.id, { masini: 3 }); } catch (x) { e = x; }
    T('„montată" cu mai multe decât erau programate → refuz: „Între 1 și 2."', !!e && e.status === 400 && /Între 1 și 2\./.test(e.message), e && e.message);
    // Șterge ziua
    e = null; try { await K.stergeZiua(l2.id); } catch (x) { e = x; }
    d = await K.calendarMontaj(LUNA); cA = alLui(d, A.c.id);
    T('șterge ziua programată → mașinile ei se întorc la „De programat" (3 de programat)', !e && !d.lucrari.some((l) => l.id === l2.id) && cA.programate === 0 && cA.ramase === 3, e ? e.message : J(cA));
    // Nesemnat
    e = null; try { await K.programeazaMontaj({ contract_id: N.c.id, data_lucrare: Date.now(), partener_id: null, cate: { gps: 1 } }); } catch (x) { e = x; }
    T('contract nesemnat → refuz: „Montajul se programează după semnare…"', !!e && e.status === 400 && /după semnare/.test(e.message), e && e.message);
    const dn = K.dinContract(d, N.c.id);
    const nume = await K.numeFirmaContract(N.c.id);
    T('venit din drum cu un contract nesemnat: numele firmei din lista contractelor → „Nesemnat Telefon SRL n-are nimic de programat acum: …"',
      'faraClient' in dn && dn.faraClient === null && nume === 'Nesemnat Telefon SRL' && K.faraClientText(nume).indexOf('Nesemnat Telefon SRL n-are nimic de programat acum') === 0, J([dn, nume]));
    T('un contract care nu există: numele nu se găsește (ecranul scrie „Firma asta")', (await K.numeFirmaContract(999999)) === null);
    // Luna: ‹ / ›
    const dUrm = await K.calendarMontaj(K.lunaAlaturata(LUNA, 1, d.azi));
    const dAzi = await K.calendarMontaj(K.lunaAlaturata(LUNA, 0, d.azi));
    const dRau = await K.calendarMontaj('2027-13');
    T('luna viitoare (aprilie, fără montaje), „Azi" (luna de azi), o lună greșită (serverul o pune pe cea de azi)', dUrm.luna === '2027-04' && !dUrm.lucrari.length &&
      dAzi.luna === d.azi.slice(0, 7) && dRau.luna === d.azi.slice(0, 7) && K.lunaText(dUrm.luna) === 'aprilie 2027');
    // Stocul: primite la conectare
    let st = null; e = null;
    try { st = await apiTel('/api/stoc/intrare', { method: 'POST', body: { tip: 'fmc130', serii: '864275071234561\n864275071234562', buc: '', cost_eur: '45', furnizor: 'Teltonika' } }); } catch (x) { e = x; }
    T('stoc: 2 GPS-uri intră, serverul spune că le primește la conectare → „2 bucăți au intrat în stoc · GPS-urile pot transmite de îndată ce sunt montate ✓"', !e && st.primite_la_conectare === 2 &&
      typeof mesaj === 'function' && mesaj(st) === '2 bucăți au intrat în stoc · GPS-urile pot transmite de îndată ce sunt montate ✓', e ? e.message : J(st));
    let st2 = null; e = null;
    try { st2 = await apiTel('/api/stoc/intrare', { method: 'POST', body: { tip: 'lvcan200', serii: 'LV-0001', buc: '', cost_eur: '', furnizor: '' } }); } catch (x) { e = x; }
    T('stoc: un modul LV-CAN (nu transmite) → „1 bucată a intrat în stoc ✓", fără fraza despre transmis', !e && st2.primite_la_conectare === 0 && typeof mesaj === 'function' && mesaj(st2) === '1 bucată a intrat în stoc ✓', e ? e.message : J(st2));
    e = null; try { await apiTel('/api/stoc/intrare', { method: 'POST', body: { tip: 'fmc130', serii: 'ABC-1', buc: '', cost_eur: '', furnizor: '' } }); } catch (x) { e = x; }
    T('stoc: un GPS fără IMEI → refuzul serverului, arătat în foaie („La aparatele GPS, seria e IMEI-ul…")', !!e && e.status === 400 && /seria e IMEI-ul/.test(e.message), e && e.message);
    d = await K.calendarMontaj(LUNA);
    T('calendarul arată stocul: „Teltonika FMC130 — 2 în depozit · Modul LV-CAN200 — 1 în depozit"', K.stocText(d.stoc) === 'Teltonika FMC130 — 2 în depozit · Modul LV-CAN200 — 1 în depozit', K.stocText(d.stoc));
    // Ritmul instalatorului: pe rând și în contract
    const lp = (await R('GET', '/api/montaj/parteneri')).j || [];
    const pS = lp.filter((p) => p.id === partS.id)[0] || {}, pL = lp.filter((p) => p.id === part.id)[0] || {};
    T('rândul partenerului: „… · ne facturează săptămânal" / „… · ne facturează lunar"', /ne facturează săptămânal$/.test(MS.subPartener(pS)) && /ne facturează lunar$/.test(MS.subPartener(pL)), MS.subPartener(pS) + ' / ' + MS.subPartener(pL));
    await R('POST', '/api/montaj/contracte', { partener_id: partS.id, months: 12, auto_renew: true, notice_days: 30, plata_zile: 30 });
    const mc = (((await R('GET', '/api/montaj/contracte')).j || {}).contracte || []).filter((c) => c.partener_id === partS.id)[0] || {};
    T('contractul cu partenerul săptămânal: bifa spune „(acum: săptămânal)", cartea „ne facturează săptămânal"', /\(acum: săptămânal\)$/.test(MS.bifaRetarif(mc)) &&
      MS.ritmText(mc.ritm_facturare) === 'săptămânal', J(mc && mc.ritm_facturare));
  }

  let mesaj = null;
  for (const [nume, f] of [['calendarul', pachetCalendar], ['ritmul și stocul', async () => { mesaj = await pachetTexte(); }], ['ecranele', pachetEcrane]]) {
    // O bucată care crapă se numără ca picată și nu le ascunde pe celelalte.
    try { await f(); } catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
  return (o) => pachetServer(o, mesaj);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Serverul probei: UNUL pentru toate capetele cu server (1.11, 2.6, 4.4), pornit la început (se încălzește cât rulează
// bucățile fără server), oprit la final — și la eroare sau la Ctrl+C —, cu baza ștearsă.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PORT = 3480, TCP = 5480, DIR = '.telefon-lot5-db';
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
    NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_telefon_lot5',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR + '/pgdata',
  });
  // Nimic din afară (model AI, bază externă, email); aparatele pe lista celor acceptate, ca în producție (modul strict).
  delete env.ANTHROPIC_API_KEY; delete env.DATABASE_URL; delete env.SMTP_HOST; delete env.STRICT_DEVICES;
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  srv.stderr.on('data', (x) => { jurnal = (jurnal + x).slice(-4000); });
  srv.on('error', (e) => { if (srvIesit === null) srvIesit = 'nu a pornit: ' + e.message; });
  srv.on('exit', (c, s) => { srvIesit = c != null ? c : (s || 'oprit'); });
}
// Capetele cu server, pe rând, cu aceeași sesiune de super-admin. Facturarea e prima: ea numără TOATE documentele de
// pe server. Anunțurile rulează o dată cele două ceasuri noi cu ceasul mutat (/api/test/ceasuri) — nu-l lasă mutat.
async function peServer(parti) {
  if (!parti.length) return;
  sect('Serverul probei (port ' + PORT + ', TCP ' + TCP + ', baza în ' + DIR + ', ștearsă la final)');
  let pornit = false;
  // Până la 4 minute: o bază pornită la rece (schema de la zero) poate lua ~90 de secunde pe o mașină obișnuită.
  for (let i = 0; i < 480 && srvIesit === null; i++) {
    try { if ((await fetch(BASE + '/api')).ok) { pornit = true; break; } } catch (e) { /* încă pornește */ }
    await sleep(500);
  }
  T('serverul pornește', pornit, (srvIesit !== null ? 's-a oprit singur (' + srvIesit + '). ' : '') + jurnal.slice(-1500));
  if (!pornit) { console.log('  ✗ fără server nu rulează: ' + parti.map((p) => p[0]).join(', ')); return; }
  let ck = '';
  try {
    const r0 = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
    ck = (r0.headers.getSetCookie ? r0.headers.getSetCookie() : [r0.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
    T('intrare ca super-admin', r0.ok && !!ck);
  } catch (e) { T('intrare ca super-admin', false, e.message); }
  if (!ck) { console.log('  ✗ fără sesiune nu rulează: ' + parti.map((p) => p[0]).join(', ')); return; }
  const R = async (m, url, body) => {
    const x = await fetch(BASE + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) { /* fără corp */ }
    return { s: x.status, j };
  };
  for (const [nume, f] of parti) {
    // Un server căzut între timp nu se mai așteaptă: partea rămasă se spune picată, pe nume.
    if (srvIesit !== null) { rele++; console.log('  ✗ „' + nume + '" nu a rulat pe server: serverul s-a oprit (' + srvIesit + '). ' + jurnal.slice(-800)); continue; }
    try { await f({ R, ck }); } catch (e) { rele++; console.log('  ✗ EROARE pe server, în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
}

let terminat = false;
function gata() {
  if (terminat) return; terminat = true;
  const final = () => {
    stergeBaza();
    console.log('\n' + '─'.repeat(30));
    if (sarite) console.log(sarite + (sarite % 100 >= 1 && sarite % 100 <= 19 ? ' ' : ' de ') + (sarite === 1 ? 'verificare sărită' : 'verificări sărite') + ' (' + FARA_DESEN + ')');
    console.log(ok + ' verificări trecute, ' + rele + ' picate');
    process.exit(rele ? 1 : 0);
  };
  if (!srv || srvIesit !== null) return final();
  let dus = false;
  const dupa = () => { if (dus) return; dus = true; setTimeout(final, 300); };
  srv.once('exit', dupa);
  try { srv.kill(); } catch (e) { dupa(); }
  // Plasă: un server care nu se oprește la cerere e oprit cu forța — după probă nu rămâne niciun port deschis.
  setTimeout(() => { if (dus) return; try { srv.kill('SIGKILL'); } catch (e) { /* deja oprit */ } setTimeout(dupa, 1000); }, 8000);
}
// O eroare scăpată (ex. într-un răspuns venit târziu) sau o oprire de mână nu lasă serverul pornit și nu trece drept reușită.
process.on('uncaughtException', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });
process.on('unhandledRejection', (e) => { rele++; console.log('  ✗ EROARE neprinsă: ' + ((e && e.stack) || e)); gata(); });
for (const semnal of ['SIGINT', 'SIGTERM']) process.on(semnal, () => { rele++; console.log('\n  ✗ proba a fost oprită (' + semnal + ')'); gata(); });

(async () => {
  if (!ts) {
    T('compilatorul TypeScript se încarcă', false, 'rulează o dată `npm install` în mobile/ (în CI îl pune pasul de instalare, la rădăcină)');
    return;
  }
  pornesteServerul();   // se încălzește cât rulează bucățile fără server
  const dePeServer = [];
  for (const [nume, f] of [['Facturare', parteaFacturare], ['Anunțuri și Dispozitive', parteaAnunturi], ['Contracte și fișa firmei', parteaContracte], ['Montaj, Calendar, Stoc', parteaMontaj]]) {
    // O parte care crapă se numără ca picată și nu le ascunde pe celelalte.
    try { const r = await f(); if (typeof r === 'function') dePeServer.push([nume, r]); }
    catch (e) { rele++; console.log('  ✗ EROARE în „' + nume + '": ' + ((e && e.stack) || e)); }
  }
  await peServer(dePeServer);
})().catch((e) => { rele++; console.log('  ✗ EROARE: ' + ((e && e.stack) || e)); }).then(gata);
