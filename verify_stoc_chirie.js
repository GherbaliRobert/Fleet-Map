// verify_stoc_chirie.js — stocul nostru de echipamente + închirierea aparatelor (25.09).
//
//   node verify_stoc_chirie.js
//
// Alin (25.09): „dacă un client nu vrea să investească în echipamente și vrea doar să le închirieze de
// la noi pe toată durata contractului" — iar pentru asta „trebuie să avem un stoc de echipamente". Hotărât:
// durata minimă 24 de luni, marja 50%, montajul la semnare, aparatele ne revin la final, chiria pe rând
// separat pe factură, o singură alegere pe ofertă. Proba ține: regula chiriei (aceeași pe server și în
// pagină), oferta (cumpără / închiriază), hârtia ofertei și a contractului, factura și registrul, stocul
// (reguli, ecran, rute) și legătura automată stoc ↔ „Dispozitive" — pe server pornit.

const fs = require('fs');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const C = require('./contracts.js');
const S = require('./stoc.js');
const MJ = require('./montaj.js');

// ─── 1. Regula chiriei ─────────────────────────────────────────────────────────────────────────
sect('1. Regula chiriei: o singură socoteală, aceeași pe server și în pagină');
T('24 de luni minim, 50% marjă, 15 zile de retur — hotărârile lui Alin', C.CHIRIE_LUNI_MIN === 24 && C.CHIRIE_MARJA === 0.5 && C.CHIRIE_ZILE_RETUR === 15);
T('aparat de 225 lei pe 24 de luni → 14 lei/lună', C.chirieLunara(225, 24) === 14, C.chirieLunara(225, 24));
T('aparat + modul de 625 lei pe 24 de luni → 39 lei/lună', C.chirieLunara(625, 24) === 39, C.chirieLunara(625, 24));
T('pe 36 de luni chiria scade (225 lei → 9 lei/lună)', C.chirieLunara(225, 36) === 9, C.chirieLunara(225, 36));
T('sub 24 de luni se socotește tot pe 24 (durata minimă)', C.chirieLunara(225, 12) === 14 && C.chirieLunara(225, 0) === 14);
T('fără cost știut → nicio chirie (nu inventăm una)', C.chirieLunara(0, 24) === null && C.chirieLunara(null, 24) === null && C.chirieLunara('x', 24) === null);
let subCost = [];
[10, 37, 50, 99, 225, 400, 625, 1000].forEach((c) => [24, 30, 36, 48, 60].forEach((n) => {
  const v = C.chirieLunara(c, n);
  if (v < Math.ceil(c / n)) subCost.push(c + '/' + n + '=' + v);
}));
T('rotunjirea nu coboară niciodată chiria sub costul curat pe lună', subCost.length === 0, subCost.join(', '));
const srcCh = html.slice(html.indexOf('function _ofChirieLunara('), html.indexOf('function _ofInchiriere('));
const pagina = new Function('_ofMeta', srcCh + '\n; return _ofChirieLunara;')({ chirie: { luniMin: C.CHIRIE_LUNI_MIN, marja: C.CHIRIE_MARJA } });
let difera = [];
[10, 37, 50, 99, 225, 400, 625, 1000, 1234.5].forEach((c) => [0, 12, 24, 30, 36, 48].forEach((n) => {
  if (pagina(c, n) !== C.chirieLunara(c, n)) difera.push(c + '/' + n + ': pagina ' + pagina(c, n) + ', server ' + C.chirieLunara(c, n));
}));
T('pagina socotește EXACT ca serverul (54 de cazuri)', difera.length === 0, difera.slice(0, 3).join(' | '));
T('fără regulile de la server, pagina nu propune nicio chirie', new Function('_ofMeta', srcCh + '\n; return _ofChirieLunara;')({})(225, 24) === null);
T('cifrele vin de pe server (ruta „meta" a ofertelor)', /chirie: \{ luniMin: contracte\.CHIRIE_LUNI_MIN, marja: contracte\.CHIRIE_MARJA, zileRetur: contracte\.CHIRIE_ZILE_RETUR \}/.test(server));
const blocInch = html.slice(html.indexOf('// ── începe „închirierea aparatelor"'), html.indexOf('// ── sfârșit „închirierea aparatelor" ──'));
const blocInchCod = blocInch.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
T('pagina nu scrie 24 sau 50% de mână (în cod, nu în comentarii)', blocInch.length > 500 && !/luniMin:\s*24|marja:\s*0\.5|\b24 de luni\b|\b50%/.test(blocInchCod));
const mOf = html.match(/var _OF_CHIRIE = \[([\s\S]*?)\];/);
const randPag = mOf ? mOf[1].match(/\['[^\]]+\]/g).map((r) => r.match(/'([^']*)'/g).map((x) => x.slice(1, -1))) : [];
T('cheile chiriei din pagină = cele din montaj.js (chirie / cantitate / preț)', randPag.length === MJ.ECHIPAMENTE.length &&
  MJ.ECHIPAMENTE.every((e, i) => randPag[i] && randPag[i][0] === e.chirie && randPag[i][1] === e.ofertaQ && randPag[i][2] === e.oferta && randPag[i][3] === e.et),
  JSON.stringify(randPag));

// ─── 2. Oferta ─────────────────────────────────────────────────────────────────────────────────
sect('2. Oferta: clientul cumpără sau închiriază');
function decupez(nume) {
  const a = html.indexOf('// ── începe „' + nume + '"'), b = html.indexOf('// ── sfârșit „' + nume + '" ──');
  return (a < 0 || b < 0) ? '' : html.slice(a, b);
}
const _rDe = new Function(html.slice(html.indexOf('function _rDe(n)'), html.indexOf('// Aceleași sume, dar pentru celule de tabel:')) + '\n; return _rDe;')();
const CALC = new Function('document', 'window', 'raxOfRecalc', '_fxRate', '_fxDate', '_fxSursa', '_rDe', '_aiqFond', '_ofMeta',
  decupez('Calculatorul de ofertă') + '\n; return { _ofCalc: _ofCalc };');
function calcul(campuri) {
  const val = Object.assign({
    'of-cl-name': 'Transport Zebra SRL', 'of-nveh': 10, 'of-ncan': 0, 'of-nfms': 0, 'of-agenti': false,
    'of-ret': '12', 'of-contract': 12, 'of-qGps': 10, 'of-dq130': 10, 'of-dFmc130': 55, 'of-mGps': 100, 'of-pPlain': 29
  }, campuri);
  const doc = { getElementById: (id) => (id in val) ? ((typeof val[id] === 'boolean') ? { type: 'checkbox', checked: val[id], value: '' } : { value: String(val[id]) }) : null };
  return CALC(doc, {}, () => {}, 5.0, '25.09.2026', 'BNR', _rDe, () => 0, { chirie: { luniMin: 24, marja: 0.5, zileRetur: 15 } })._ofCalc();
}
const cump = calcul({});
T('CUMPĂRĂ: aparatele sunt cost unic (10 × 55 €)', cump.hwTotal === 550 && cump.deviceLines.length === 1 && !cump.lines.some((l) => l.fel === 'chirie'));
T('CUMPĂRĂ: lunar doar abonamentul (10 × 29 lei)', cump.monthly === 290, cump.monthly);
const inch = calcul({ 'of-echipMod': 'inchiriaza', 'of-chFmc130': 14 });
const rCh = inch.lines.filter((l) => l.fel === 'chirie');
T('ÎNCHIRIAZĂ: aparatele NU mai sunt cost unic', inch.hwTotal === 0 && inch.deviceLines.length === 0);
T('ÎNCHIRIAZĂ: montajul rămâne cost unic, la semnare (10 × 100 lei)', inch.montaj === 1000);
T('ÎNCHIRIAZĂ: chiria intră lunar, pe rândul ei (10 × 14 lei)', rCh.length === 1 && rCh[0].qty === 10 && rCh[0].unit === 14 && rCh[0].total === 140, JSON.stringify(rCh));
T('ÎNCHIRIAZĂ: lunar = abonament + chirie (290 + 140)', inch.monthly === 430, inch.monthly);
T('ÎNCHIRIAZĂ: durata urcă singură la minimul de 24 de luni', inch.cfg.contractMonths === 24 && inch.contractTotal === 430 * 24, inch.cfg.contractMonths);
const faraCh = calcul({ 'of-echipMod': 'inchiriaza' });
T('aparat închiriat fără chirie trecută: NU e socotit la 0 lei, ci semnalat', faraCh.chirieLipsa.indexOf('Teltonika FMC130') >= 0 && !faraCh.lines.some((l) => l.fel === 'chirie') && faraCh.monthly === 290);
T('...iar salvarea și hârtia refuză o astfel de ofertă', /window\.raxOfSave = async function \(\) \{[\s\S]{0,400}if \(!_ofChirieOk\(r\)\) return;/.test(html) && /async function _ofHartie\(r, previzualizare\) \{\s*\n\s*if \(!_ofChirieOk\(r\)\) return;/.test(html));
T('comutatorul „Clientul cumpără / Clientul închiriază" e în cartea 5', /id="of-echipMod" value="cumpara"/.test(html) && /raxOfEchipMod\(\\'inchiriaza\\'\)/.test(html) && /Clientul închiriază/.test(html));
T('fiecare aparat are caseta lui de chirie (lei/lună)', ['of-chFmc130', 'of-chFmc150', 'of-chFmc650', 'of-chLvCan'].every((id) => html.indexOf("chF('" + id + "'") > 0));
T('hârtia află că e închiriere', /inchiriere: !!r\.inchiriere/.test(html));
T('oferta redeschisă revine pe cum s-a salvat', /raxOfEchipMod\(cfg\.echipMod === 'inchiriaza' \? 'inchiriaza' : 'cumpara'\)/.test(html));
T('lista de oferte arată pastila „închiriere"', /areChirie \? '<span[^>]*>închiriere<\/span>'/.test(html));

// ─── 3. Hârtia ofertei ─────────────────────────────────────────────────────────────────────────
sect('3. Hârtia ofertei, la închiriere');
const RE = require('./report_export.js');
function cartonOferta() {
  const texte = [];
  const d = {
    page: { width: 595.28, height: 841.89, margins: { top: 36, bottom: 36, left: 36, right: 36 } }, y: 36, x: 36,
    image() { return d; }, fillColor() { return d; }, font() { return d; }, fontSize() { return d; }, strokeColor() { return d; },
    lineWidth() { return d; }, moveTo() { return d; }, lineTo() { return d; }, stroke() { return d; }, roundedRect() { return d; }, fill() { return d; },
    addPage() { d.y = 36; return d; }, heightOfString() { return 10; },
    text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') d.y = y + 11; else d.y += 11; return d; }
  };
  return { d, texte };
}
function hartie(o) { const c = cartonOferta(); RE.renderOfertaPdf(c.d, o); return c.texte.join(' ¦ '); }
const bazaOf = { client: { name: 'Transport Zebra SRL' }, contractMonths: 24, fxRate: 5, fxSursa: 'BNR', nVeh: 10,
  lines: [{ fel: 'plain', label: 'Vehicule GPS (fără CAN)', qty: 10, unit: 29, total: 290 }], monthly: 290, contractTotal: 6960,
  montajLines: [{ label: 'Instalare dispozitiv GPS', qty: 10, unit: 100, total: 1000 }], montaj: 1000,
  deviceLines: [{ label: 'Teltonika FMC130', qty: 10, unit: 55, total: 550 }], hwTotal: 550, chirieLuniMin: 24, chirieZileRetur: 15 };
const hCump = hartie(bazaOf);
const hInch = hartie(Object.assign({}, bazaOf, { inchiriere: true, deviceLines: [], hwTotal: 0, monthly: 430, contractTotal: 10320,
  lines: bazaOf.lines.concat([{ fel: 'chirie', label: 'Chirie Teltonika FMC130', qty: 10, unit: 14, total: 140 }]) }));
T('CUMPĂRĂ: hârtia rămâne neschimbată (echipamente o singură dată, facturate la livrare)', /ECHIPAMENTE — O SINGURĂ DATĂ/.test(hCump) && /Echipamentele se facturează la livrare/.test(hCump) && !/proprietatea RA Tracks/.test(hCump));
T('ÎNCHIRIAZĂ: tabelul „Chiria echipamentelor — lunar"', /CHIRIA ECHIPAMENTELOR — LUNAR/.test(hInch) && /Chirie Teltonika FMC130/.test(hInch));
T('ÎNCHIRIAZĂ: fără tabel de echipamente vândute', !/ECHIPAMENTE — O SINGURĂ DATĂ/.test(hInch));
T('ÎNCHIRIAZĂ: costul unic e doar instalarea (1.000 lei)', /instalare \(aparatele sunt închiriate\)/.test(hInch) && /1\.000,00 lei/.test(hInch));
T('ÎNCHIRIAZĂ: aparatele rămân proprietatea RA Tracks, chiria pe rând separat', /rămân proprietatea RA Tracks pe toată durata contractului/.test(hInch) && /pe rând separat/.test(hInch));
T('ÎNCHIRIAZĂ: durata minimă de 24 de luni și chiria lunilor rămase', /Durata minimă a contractului este de 24 de luni/.test(hInch) && /lunile rămase până la 24/.test(hInch));
T('ÎNCHIRIAZĂ: returul în 15 zile, nereturnatul se plătește', /demontare în cel mult 15 zile/.test(hInch) && /nereturnate sau deteriorate se plătesc/.test(hInch));
T('ÎNCHIRIAZĂ: nu mai scrie „rămân în proprietatea Beneficiarului"', !/rămân în proprietatea Beneficiarului/.test(hInch));
T('termenele de pe hârtie le pune serverul (ruta PDF)', /o\.chirieLuniMin = contracte\.CHIRIE_LUNI_MIN; o\.chirieZileRetur = contracte\.CHIRIE_ZILE_RETUR;/.test(server));

// ─── 4. Contractul ─────────────────────────────────────────────────────────────────────────────
sect('4. Contractul: clauzele închirierii și lista aparatelor');
const CP = require('./contract_pdf.js');
function cartonContract() {
  const texte = [];
  const A4 = { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } };
  const d = {
    page: A4, x: 50, y: 50, _pagini: 1,
    font() { return d; }, fontSize() { return d; }, fillColor() { return d; }, strokeColor() { return d; }, lineWidth() { return d; },
    moveTo() { return d; }, lineTo() { return d; }, stroke() { return d; }, image() { return d; },
    widthOfString(s) { return String(s == null ? '' : s).length * 4.6; },
    addPage() { d._pagini++; d.y = 50; return d; }, moveDown(n) { d.y += 12 * (n == null ? 1 : n); return d; },
    text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') d.y = y + 11; else d.y += 11; return d; }
  };
  return { d, texte };
}
const zi = Date.parse('2026-09-25T12:00:00Z');
const anexaInch = C.facAnexa([], {
  vehiculeOferta: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 10, pret: 29, total: 290 }],
  servicii: [{ fel: 'chirie', nume: 'Chirie Teltonika FMC130', cant: 10, pret: 14, total: 140 }],
  chirie: { aparate: [{ tip: 'fmc130', nume: 'Teltonika FMC130', cant: 10, chirie: 14, valoare: 275 }] }
});
T('anexa: totalul lunar cuprinde chiria (290 + 140)', anexaInch.monthlyTotal === 430, anexaInch.monthlyTotal);
T('anexa: lista aparatelor închiriate, cu valoarea lor, și durata minimă', anexaInch.chirie && anexaInch.chirie.luniMin === 24 && anexaInch.chirie.aparate[0].valoare === 275);
T('anexa re-salvată (aparatele bifate) păstrează închirierea', C.dinAnexaDePastrat(anexaInch).chirie && C.facAnexa([], C.dinAnexaDePastrat(anexaInch)).chirie.aparate.length === 1);
function contractText(anexa, montaj) {
  const c = cartonContract();
  CP.scrieContract(c.d, {
    contract: { number: 'RAT-C-2026-0009', status: 'aprobat', signed_at: zi, start_at: zi, months: 24, end_at: C.calcSfarsit(zi, 24), auto_renew: true, notice_days: 30,
      gdpr: { kind: 'anexa' }, annex: anexa, montaj: montaj || null },
    firma: { name: 'Transport Zebra SRL', cui: 'RO12345678', address: 'Str. Exemplu 1', payment_term_days: 15, billing_day: 5 },
    emitent: { name: 'RA TRACKS SRL', cui: 'RO44556677', vat_rate: 19 }
  });
  return c.texte.join(' ¦ ');
}
const montajDoar = MJ.facAnexaCosturiUnice(MJ.randuri([{ tip: 'gps', buc: 10, pretClient: 100 }]), [], 5, 'RON');
const ctInch = contractText(anexaInch, montajDoar);
const ctCump = contractText(C.facAnexa([], { vehiculeOferta: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 10, pret: 29, total: 290 }] }));
T('IV: aparatele sunt date în folosință și rămân proprietatea Prestatorului', /rămân proprietatea Prestatorului pe toată durata contractului/.test(ctInch) && /pe rând separat/.test(ctInch));
T('IV: durata minimă de 24 de luni', /Durata minimă a contractului este de 24 de luni/.test(ctInch));
T('VII: plecarea înainte de termen → chiria lunilor rămase', /datorează chiria aparatelor închiriate pentru lunile rămase/.test(ctInch));
T('VII: returul în 15 zile, nerestituitul se plătește la valoarea din anexă', /demontare în cel mult 15 zile/.test(ctInch) && /la valoarea din Anexa nr\. 1/.test(ctInch));
T('Anexa nr. 1: „Aparate închiriate — proprietatea Prestatorului", cu valoarea', /Aparate închiriate — proprietatea Prestatorului/.test(ctInch) && /275,00 RON/.test(ctInch));
T('Anexa nr. 2 fără aparate vândute se numește „Montaj (costuri unice)"', /ANEXA nr\. 2 — Montaj \(costuri unice\)/.test(ctInch) && !/Echipamentele rămân în proprietatea Beneficiarului/.test(ctInch));
T('contractul de CUMPĂRARE nu pomenește închirierea', !/închiriate|Durata minimă/.test(ctCump));

// ─── 5. Stocul: regulile ───────────────────────────────────────────────────────────────────────
sect('5. Stocul: pe unde poate merge o bucată și ce trebuie făcut');
T('depozit → instalator → montat → returnat → depozit', S.poateTrece('depozit', 'instalator') && S.poateTrece('instalator', 'montat') && S.poateTrece('montat', 'retur') && S.poateTrece('retur', 'depozit'));
T('ce nu se poate: casatul nu mai iese, instalatorul nu „returnează", montatul nu sare în depozit', !S.poateTrece('casat', 'depozit') && !S.poateTrece('instalator', 'retur') && !S.poateTrece('montat', 'depozit') && !S.poateTrece('depozit', 'depozit'));
const bucati = [
  { id: 1, tip: 'fmc130', stare: 'depozit', proprietar: 'ra' },
  { id: 2, tip: 'fmc130', stare: 'instalator', proprietar: 'ra', stare_din: Date.now() - 20 * 86400000 },
  { id: 3, tip: 'fmc130', stare: 'montat', proprietar: 'ra', company_id: 7 },
  { id: 4, tip: 'fmc130', stare: 'montat', proprietar: 'client', company_id: 7 },
  { id: 5, tip: 'fmc130', stare: 'casat', proprietar: 'ra' },
  { id: 6, tip: 'lvcan200', stare: 'depozit', proprietar: 'ra' }
];
const sm = S.sumar(bucati);
T('sumarul desparte închiriatele de vândute; casatele nu se numără', sm.fmc130.depozit === 1 && sm.fmc130.instalator === 1 && sm.fmc130.inchiriate === 1 && sm.fmc130.vandute === 1 && sm.lvcan200.depozit === 1, JSON.stringify(sm));
const al = S.alerte(bucati, { minim: { fmc130: 3, lvcan200: 1 }, zileInstalator: 14 }, [7]);
T('sub stocul minim → „e timpul să comanzi" (doar unde chiar e sub)', al.subMinim.length === 1 && al.subMinim[0].tip === 'fmc130' && al.subMinim[0].depozit === 1);
T('la instalator de peste 14 zile → semnalat', al.laInstalator.length === 1 && al.laInstalator[0].id === 2 && al.laInstalator[0].zile === 20);
T('aparat AL NOSTRU la o firmă cu contractul încheiat → de recuperat (cel vândut, nu)', al.deRecuperat.length === 1 && al.deRecuperat[0].id === 3);
T('seriile: una pe rând, fără goluri și fără dubluri', JSON.stringify(S.serii(' 111\n222,333;111\n\n')) === JSON.stringify(['111', '222', '333']));

// ─── 6. Ecranul ────────────────────────────────────────────────────────────────────────────────
sect('6. Ecranul „Stoc echipamente" și locul lui');
T('rând în meniul Gestiune, sub „Inventar dispozitive", doar pentru noi', /goSistem\('inventar'\); \}\)"><i class="fas fa-clipboard-list"><\/i><span>Inventar dispozitive<\/span><\/button>\s*\n\s*<button class="nav-item nav-sub" data-super onclick="navGo\(this, function\(\)\{ goSistem\('stoc'\); \}\)"><i class="fas fa-boxes-stacked"><\/i><span>Stoc echipamente<\/span>/.test(html));
T('numele secțiunii = numele rândului, containerul și încărcarea', /stoc: 'Stoc echipamente'/.test(html) && /stoc: 'admin-tab-stoc'/.test(html) && /<div id="admin-tab-stoc" class="ra-camp" style="display:none;"><\/div>/.test(html) && /name === 'stoc'\) \{\s*\n\s*if \(window\.raxLoadStoc\)/.test(html));
T('e strict a fondatorilor (și pe ecran)', /name === 'montaj' \|\| name === 'stoc'\) && !can\('manageCompanies'\)/.test(html));
['/api/stoc', '/api/stoc/intrare', '/api/stoc/muta', '/api/stoc/praguri', '/api/stoc/:id'].forEach((r) => {
  T('ruta ' + r + ' e doar a noastră', new RegExp("app\\.(get|post|put|delete)\\('" + r.replace(/\//g, '\\/') + "', requireAuth, requireSuperadmin").test(server));
});
T('„/api/stoc/praguri" stă înaintea „/api/stoc/:id" (altfel „praguri" ar fi citit ca id)', server.indexOf("app.put('/api/stoc/praguri'") > 0 && server.indexOf("app.put('/api/stoc/praguri'") < server.indexOf("app.put('/api/stoc/:id'"));
const cauta = html.slice(html.indexOf('window.raxStocCauta = function'), html.indexOf('window.raxStocAlege = function'));
T('căutarea redesenează DOAR tabelul (caseta nu-și pierde cursorul)', /stoc-tabel/.test(cauta) && !/_stocDeseneaza\(\)/.test(cauta));
T('stocul intră în copia de siguranță', require('./backup.js').BUSINESS_TABLES.indexOf('stoc_echipamente') >= 0);
T('aparatul legat de o firmă în „Dispozitive" mută stocul singur (adopție + înregistrare)', (server.match(/await _stocLaFirma\(/g) || []).length === 3);
T('fișa firmei arată chiria (doar de citit)', /html \+= _raxChirieHtml\(s\);/.test(html) && /chirie: contracte\.chirieFirma\(company\.settings\)/.test(server));

// ─── 7. Pe server pornit ───────────────────────────────────────────────────────────────────────
const PORT = 3231, DIR = '.stoc-chirie-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_stoc',
  PORT: String(PORT), TCP_PORT: '5231', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null;
function gata() {
  try { srv && srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
(async () => {
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('7. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j, h: r.headers };
  };
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', vat_rate: 19 } });
  const meta = (await R('GET', '/api/admin/offers/meta')).j || {};
  T('ruta „meta" dă regulile închirierii', meta.chirie && meta.chirie.luniMin === 24 && meta.chirie.marja === 0.5 && meta.chirie.zileRetur === 15, JSON.stringify(meta.chirie));

  // Stocul
  T('intrare fără model → refuzată', (await R('POST', '/api/stoc/intrare', { serii: '111' })).s === 400);
  T('intrare fără serii și fără bucăți → refuzată', (await R('POST', '/api/stoc/intrare', { tip: 'fmc130' })).s === 400);
  const in1 = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: '860000000000101\n860000000000102\n860000000000103', cost_eur: 45, furnizor: 'Distribuitor X' });
  T('intrare: 3 FMC130 cu seriile lor, la 45 €', in1.s === 200 && in1.j.adaugate === 3, JSON.stringify(in1.j));
  const dubla = await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: '860000000000102' });
  T('o serie deja în stoc → refuzată, pe nume', dubla.s === 409 && /860000000000102/.test(dubla.j.error || ''), JSON.stringify(dubla.j));
  T('module fără serie: pe bucăți', (await R('POST', '/api/stoc/intrare', { tip: 'lvcan200', buc: 2, cost_eur: 40 })).j.adaugate === 2);
  let st = (await R('GET', '/api/stoc')).j || {};
  T('sumarul: 3 FMC130 și 2 LV-CAN în depozit', st.sumar && st.sumar.fmc130.depozit === 3 && st.sumar.lvcan200.depozit === 2, JSON.stringify(st.sumar));
  T('fiecare bucată își ține istoricul de la intrare', (st.aparate || []).every((x) => (x.istoric || []).length === 1 && x.istoric[0].stare === 'depozit'));
  await R('PUT', '/api/stoc/praguri', { minim: { fmc130: 5 }, zileInstalator: 14 });
  st = (await R('GET', '/api/stoc')).j || {};
  T('stoc minim 5 la FMC130 → „e timpul să comanzi"', (st.alerte.subMinim || []).some((x) => x.tip === 'fmc130' && x.depozit === 3), JSON.stringify(st.alerte));
  const buc = (serie) => (st.aparate || []).filter((x) => x.serie === serie)[0] || {};
  const p = (await R('POST', '/api/montaj/parteneri', { name: 'Instal GPS Vest SRL' })).j;
  T('mutare „la instalator" fără instalator → refuzată', (await R('POST', '/api/stoc/muta', { ids: [buc('860000000000101').id], stare: 'instalator' })).s === 400);
  const laInst = await R('POST', '/api/stoc/muta', { ids: [buc('860000000000101').id], stare: 'instalator', partener_id: p.id, nota: 'proces-verbal 12' });
  T('predată la instalator', laInst.s === 200 && laInst.j.mutate === 1, JSON.stringify(laInst.j));
  const gresit = await R('POST', '/api/stoc/muta', { ids: [buc('860000000000101').id], stare: 'retur' });
  T('de la instalator nu poate ajunge „returnat" (n-a fost la client) — spus pe nume', gresit.s === 400 && /la instalator/.test(gresit.j.error || ''), JSON.stringify(gresit.j));

  // Oferta cu închiriere → contract → firmă → factură
  const cfg = { echipMod: 'inchiriaza', nVeh: 3, nCan: 0, nFms: 0, contractMonths: 24, fxRate: 5, retTier: '12',
    client: { name: 'Transport Zebra SRL' }, devices: { d130: 3 }, montaj: { qGps: 3 } };
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Zebra (închiriere)', client_name: 'Transport Zebra SRL',
    config: { cfg: cfg, prices: { pPlain: 29, chFmc130: 14, dFmc130: 55, mGps: 100 } }, monthly_total: 129, once_total: 300, currency: 'RON' })).j || {};
  T('oferta cu închiriere se salvează', of.id > 0, JSON.stringify(of));
  const co = (await R('POST', '/api/companies', { name: 'Transport Zebra SRL' })).j;
  const dinOf = { unitati: { plain: 29, can: 45, fms: 65 },
    vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 3, pret: 29, total: 87 }],
    servicii: [{ fel: 'chirie', nume: 'Chirie Teltonika FMC130', cant: 3, pret: 14, total: 42 }] };
  const scurt = await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12, din_oferta: dinOf });
  T('contract de 12 luni pe o ofertă cu închiriere → refuzat (minim 24)', scurt.s === 400 && /24 de luni/.test(scurt.j.error || ''), JSON.stringify(scurt.j));
  const ct = await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 24, din_oferta: dinOf });
  T('contract de 24 de luni → se face', ct.s === 200, JSON.stringify(ct.j));
  const c = ct.j || {};
  T('anexa nr. 1: chiria pe rândul ei, în totalul lunar (87 + 42)', c.annex && c.annex.monthlyTotal === 129 && (c.annex.servicii || []).some((r) => r.fel === 'chirie' && r.total === 42), JSON.stringify(c.annex));
  T('anexa nr. 1: aparatele închiriate, cu valoarea lor (55 € × 5 = 275 lei)', c.annex && c.annex.chirie && c.annex.chirie.aparate[0].cant === 3 && c.annex.chirie.aparate[0].valoare === 275);
  T('anexa nr. 2: doar montajul — aparatele nu se vând', c.montaj && (c.montaj.items || []).length === 1 && !((c.montaj.echipamente || {}).items || []).length, JSON.stringify(c.montaj));
  const ov = (await R('GET', '/api/companies/' + co.id + '/overview')).j || {};
  T('pe firmă: chiria scrisă din contract (3 × 14 = 42 lei/lună)', ov.chirie && ov.chirie.totalRON === 42 && ov.chirie.randuri[0].cant === 3, JSON.stringify(ov.chirie));
  const fa = (await R('POST', '/api/invoices/draft', { companyId: co.id })).j || {};
  const rf = (fa.lines || []).filter((l) => /^Chirie echipament — Teltonika FMC130/.test(l.desc))[0];
  T('factura: rând separat „Chirie echipament", 3 × 14 lei', rf && rf.qty === 3 && rf.net === 42, JSON.stringify(fa.lines));
  const mrr = (await R('GET', '/api/companies/mrr')).j || {};
  const venit = mrr.firme ? mrr.firme[co.id] : undefined;
  const sumaFact = (fa.lines || []).reduce((t, l) => t + l.net, 0);
  T('registrul de venituri = factura (aceeași chirie)', venit != null && Math.abs(Number(venit.lei != null ? venit.lei : venit) - sumaFact) < 0.01, JSON.stringify({ venit, sumaFact }));
  const pdf = await fetch(B + '/api/contracts/' + c.id + '/pdf', { headers: { Cookie: ck } });
  T('contractul cu închiriere se descarcă (PDF)', pdf.status === 200 && /application\/pdf/.test(pdf.headers.get('content-type') || ''));
  const ofPdf = await fetch(B + '/api/admin/offers/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify(Object.assign({}, bazaOf, { inchiriere: true, deviceLines: [], hwTotal: 0 })) });
  T('oferta cu închiriere se descarcă (PDF)', ofPdf.status === 200 && /application\/pdf/.test(ofPdf.headers.get('content-type') || ''));

  // Legătura automată stoc ↔ „Dispozitive"
  const reg = await R('POST', '/api/devices', { imei: '860000000000102', company_id: co.id, name: 'Camion 1' });
  T('aparatul se înregistrează pe firmă', reg.s === 200, JSON.stringify(reg.j));
  st = (await R('GET', '/api/stoc')).j || {};
  const b2 = buc('860000000000102');
  T('...și în stoc trece SINGUR pe „montat la client", al NOSTRU (firma închiriază)', b2.stare === 'montat' && b2.proprietar === 'ra' && b2.company_id === co.id, JSON.stringify(b2));
  T('...cu rândul lui în istoric', (b2.istoric || []).length === 2 && /Dispozitive/.test(b2.istoric[1].nota || ''));
  const co2 = (await R('POST', '/api/companies', { name: 'Cumpărător SRL' })).j;
  await R('POST', '/api/devices', { imei: '860000000000103', company_id: co2.id, name: 'Duba 1' });
  st = (await R('GET', '/api/stoc')).j || {};
  T('la o firmă care CUMPĂRĂ, aparatul trece „vândut clientului"', buc('860000000000103').stare === 'montat' && buc('860000000000103').proprietar === 'client');
  await R('POST', '/api/devices', { imei: '860000000000999', company_id: co2.id, name: 'Fără stoc' });
  T('un aparat necunoscut stocului se înregistrează normal (stocul nu e poartă)', (await R('GET', '/api/stoc')).j.aparate.length === 5);
  st = (await R('GET', '/api/stoc')).j || {};
  T('sumarul: 1 închiriat, 1 vândut, 1 la instalator', st.sumar.fmc130.inchiriate === 1 && st.sumar.fmc130.vandute === 1 && st.sumar.fmc130.instalator === 1, JSON.stringify(st.sumar.fmc130));

  // Ștergerea: doar o bucată trecută din greșeală
  const cuIstoric = buc('860000000000102');
  T('o bucată care a fost pe undeva NU se șterge', (await R('DELETE', '/api/stoc/' + cuIstoric.id)).s === 400);
  const noua = (st.aparate || []).filter((x) => x.tip === 'lvcan200')[0];
  T('una trecută din greșeală (în depozit, fără mutări) se șterge', (await R('DELETE', '/api/stoc/' + noua.id)).s === 200);
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
