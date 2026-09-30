// verify_abonament.js — de la ce zi plătește clientul, facturile unice, proforma, accesul (Alin, 28.09).
//
//   node verify_abonament.js
//
// Alin: „ce facem după ce contractul e semnat… de când îi facturăm?". Verificând drumul, am găsit trei
// probleme la facturare, probate pe server pornit, și Alin a hotărât (28.09):
//   1:A — abonamentul unei mașini pornește în ziua în care aparatul transmite PRIMA dată pe firma clientului;
//         prima lună se plătește pe zile, pe factura lunii următoare (regula în abonament.js);
//   2   — da: „Plătită" nu mai pornește un ceas „acces până la" care bloca clienți care plătiseră tot;
//         o factură făcută de mână nu mai oprește abonamentul automat al lunii;
//   3   — da: trecerea mai multor aparate pe firmă dintr-o apăsare + factura unică completată din contract
//         (aparatele la cursul înghețat în Anexa nr. 2, montajul din lucrările executate), cu proformă.
// Proba rulează regula curată, bucata de factură decupată din server.js (cu plans.js adevărat), pagina și
// TOT drumul pe server pornit.

const fs = require('fs');
const { spawn } = require('child_process');
const A = require('./abonament.js');
const plans = require('./plans.js');
const contracte = require('./contracts.js');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const server = fs.readFileSync('./server.js', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');
const taie = (sursa, start, capat) => {
  const a = sursa.indexOf(start); if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 60));
  const b = sursa.indexOf(capat, a); if (b < 0) throw new Error('nu găsesc capătul: ' + capat.slice(0, 60));
  return sursa.slice(a, b);
};
const ms = (an, luna, zi) => new Date(an, luna - 1, zi, 10, 0, 0).getTime();

sect('1. Regula pe zile (abonament.js)');
{
  // Factura lui noiembrie 2026: octombrie are 31 de zile.
  const ap = [
    { imei: 'A', tip: 'none', de_la: ms(2026, 6, 3) },    // pornit demult → noiembrie întreg
    { imei: 'B', tip: 'can', de_la: ms(2026, 10, 10) },   // pornit pe 10 octombrie → 22 de zile + noiembrie
    { imei: 'C', tip: 'can', de_la: ms(2026, 10, 10) },   // aceeași zi, același fel → același rând
    { imei: 'D', tip: 'none', de_la: ms(2026, 10, 31) },  // ultima zi a lunii → 1 zi
    { imei: 'E', tip: 'none', de_la: ms(2026, 11, 2) },   // pornit în noiembrie → abia pe factura din decembrie
    { imei: 'F', tip: 'none', de_la: null }               // nepornit (nemontat) → niciodată
  ];
  const i = A.imparte(ap, 2026, 11);
  T('pornit demult: plătește luna întreagă', i.intregi.imei.indexOf('A') >= 0);
  T('pornit luna trecută: plătește luna întreagă ȘI zilele lui', i.intregi.imei.indexOf('B') >= 0 && i.partiale.some((g) => g.imei.indexOf('B') >= 0));
  const g10 = i.partiale.filter((g) => g.zi === 10)[0];
  T('10 octombrie → 22 de zile din 31 (10–31)', g10 && g10.zile === 22 && Math.abs(g10.fractie - 22 / 31) < 1e-9, JSON.stringify(g10));
  T('aceeași zi și același fel de mașină → un singur rând, cu cantitatea lor', g10 && g10.imei.length === 2 && g10.tip === 'can');
  const g31 = i.partiale.filter((g) => g.zi === 31)[0];
  T('ultima zi a lunii → o zi', g31 && g31.zile === 1);
  T('pornit în luna facturii → NU intră (se plătește luna următoare, cu zilele lui)', i.intregi.imei.indexOf('E') < 0 && !i.partiale.some((g) => g.imei.indexOf('E') >= 0));
  T('nepornit (nemontat) → nu intră deloc', i.intregi.imei.indexOf('F') < 0 && !i.partiale.some((g) => g.imei.indexOf('F') >= 0));
  T('numărătoarea pe fel: 2 fără CAN, 2 cu CAN, pe luna întreagă', i.intregi.none === 2 && i.intregi.can === 2, JSON.stringify(i.intregi));
  T('firma a pornit înainte de noiembrie → ce ține de firmă, pe luna întreagă', i.firma.intreaga === true && i.firma.partiala === null);
  // Prima factură a unei firme noi: toate mașinile pornite în octombrie.
  const nou = A.imparte([{ imei: 'X', tip: 'none', de_la: ms(2026, 10, 14) }, { imei: 'Y', tip: 'none', de_la: ms(2026, 10, 10) }], 2026, 11);
  T('firmă nouă: ce ține de firmă pornește cu PRIMA mașină (10 oct.), pe zile', nou.firma.intreaga && nou.firma.partiala && nou.firma.partiala.zi === 10 && nou.firma.partiala.zile === 22, JSON.stringify(nou.firma));
  const nimic = A.imparte([{ imei: 'X', tip: 'none', de_la: ms(2026, 11, 3) }], 2026, 11);
  T('firmă cu mașini pornite abia în luna facturii → nimic de facturat încă', !nimic.firma.intreaga && !nimic.partiale.length && !nimic.intregi.imei.length);
  // Capete de an și februarie.
  const ian = A.imparte([{ imei: 'Z', tip: 'fms', de_la: ms(2026, 12, 20) }], 2027, 1);
  T('factura din ianuarie ia zilele din decembrie anul trecut (20–31 = 12 zile)', ian.partiale[0] && ian.partiale[0].zile === 12 && ian.lunaAnterioara.an === 2026 && ian.lunaAnterioara.luna === 12, JSON.stringify(ian.partiale));
  const mar = A.imparte([{ imei: 'Z', tip: 'none', de_la: ms(2027, 2, 15) }], 2027, 3);
  T('februarie 2027 are 28 de zile → 15 februarie = 14 zile', mar.partiale[0] && mar.partiale[0].zile === 14 && Math.abs(mar.partiale[0].fractie - 14 / 28) < 1e-9);
  T('„10–31.10.2026" pe factură', A.perioadaText(10, 2026, 10, 31) === '10–31.10.2026');
  T('luna se scrie cu numele ei („noiembrie 2026")', A.numeLuna(2026, 11) === 'noiembrie 2026');
  T('cheia lunii „2026-11" se citește înapoi', JSON.stringify(A.dinCheie('2026-11')) === JSON.stringify({ an: 2026, luna: 11 }) && A.dinCheie('2026-13') === null && A.dinCheie('x') === null);
  const sc = A.scaleaza({ desc: 'Abonament', qty: 2, net: 90, vat: 17.1 }, 22 / 31, ' — zile', 19);
  T('un rând pe zile: aceeași cantitate, prețul bucății × fracția (45 × 22/31 = 31,94), valoarea = 2 × 31,94 = 63,88', sc.qty === 2 && sc.unitPrice === 31.94 && sc.net === 63.88 && sc.vat === 12.14, JSON.stringify(sc));
  // Pe factură, cantitatea înmulțită cu prețul TREBUIE să dea valoarea (29.09: scria „10 × 24,68 = 246,77").
  const stramb = [];
  [2, 7, 10, 15, 35].forEach(function (q) { [28, 29, 30, 31].forEach(function (zl) { for (let z = 1; z <= zl; z++) {
    [29, 45, 65, 14.5].forEach(function (pret) {
      const r = A.scaleaza({ desc: 'x', qty: q, net: q * pret }, z / zl, '', 21);
      if (Math.round(r.qty * r.unitPrice * 100) / 100 !== r.net || Math.abs(r.net - q * pret * z / zl) > q * 0.005 + 1e-9) stramb.push(q + '×' + pret + ' ' + z + '/' + zl + ' → ' + r.qty + '×' + r.unitPrice + '=' + r.net);
    });
  } }); });
  T('pe orice rând pe zile (5 cantități × 4 luni × fiecare zi × 4 prețuri): cantitate × preț = valoare, la ban', stramb.length === 0, stramb.slice(0, 5).join(' | '));
}

sect('2. Factura lunii, pe server (bucata adevărată din server.js, cu plans.js adevărat)');
{
  const bucataF = taie(server, 'function buildInvoiceLines(', '\nfunction _clientSnapshot');
  const bucataL = taie(server, 'function _liniiAbonament(', '\nasync function facturaAbonamentLuna');
  const f = new Function('plans', 'contracte', 'abonament', bucataF.split('\n// ─── Factura de ABONAMENT')[0] + '\n' + bucataL + '\nreturn { buildInvoiceLines, _liniiAbonament };')(plans, contracte, A);
  const firma = { id: 1, name: 'Transport SRL', custom_plan: { priceNoneRON: 29, priceCanRON: 45, priceFmsRON: 65 }, settings: {} };
  const feat = plans.featuresFor(firma);
  // Regim: 2 fără CAN + 3 cu CAN, toate pornite demult → EXACT factura dintotdeauna.
  const vechi = [1, 2].map((k) => ({ imei: 'n' + k, tip: 'none', de_la: ms(2026, 1, 5) })).concat([1, 2, 3].map((k) => ({ imei: 'c' + k, tip: 'can', de_la: ms(2026, 2, 5) })));
  const noi = f._liniiAbonament(firma, vechi, 2026, 11, feat, 19, null);
  const dint = f.buildInvoiceLines(firma, { none: 2, can: 3, fms: 0 }, feat, 19);
  T('luna întreagă, toate pornite demult → aceeași sumă ca factura veche (193 lei)', Math.abs(noi.subtotal - dint.subtotal) < 0.005 && noi.subtotal === 193, noi.subtotal + ' vs ' + dint.subtotal);
  T('rândurile poartă luna („— noiembrie 2026")', noi.lines.every((l) => / — noiembrie 2026$/.test(l.desc)), noi.lines.map((l) => l.desc).join(' | '));
  T('și factura știe ce lună acoperă („2026-11")', noi.luna === '2026-11');
  // Exemplul lui Alin: 50 de mașini cu CAN, montate 10–14 octombrie, câte 10 pe zi.
  const flota = [];
  for (let zi = 10; zi <= 14; zi++) for (let k = 0; k < 10; k++) flota.push({ imei: zi + '-' + k, tip: 'can', de_la: ms(2026, 10, zi) });
  const p = f._liniiAbonament(firma, flota, 2026, 11, feat, 19, null);
  T('factura din noiembrie: 50 × 45 lei pe noiembrie întreg', p.lines.some((l) => l.desc === 'Abonament monitorizare GPS cu CAN — noiembrie 2026' && l.qty === 50 && l.net === 2250), JSON.stringify(p.lines[0]));
  const z10 = p.lines.filter((l) => /10–31\.10\.2026 \(22 de zile\)/.test(l.desc))[0];
  T('+ cele montate pe 10 oct.: 10 × (45 × 22/31 = 31,94) = 319,40 lei', z10 && z10.qty === 10 && z10.unitPrice === 31.94 && z10.net === 319.4, JSON.stringify(z10));
  const z14 = p.lines.filter((l) => /14–31\.10\.2026 \(18 zile\)/.test(l.desc))[0];
  T('+ cele montate pe 14 oct.: 18 zile („18 zile", fără „de"), 10 × 26,13 = 261,30', z14 && z14.qty === 10 && z14.unitPrice === 26.13 && z14.net === 261.3, JSON.stringify(z14));
  T('octombrie pe zile = 1.451,60 lei (319,40 + 304,80 + 290,30 + 275,80 + 261,30), noiembrie = 2.250 lei', p.subtotal === 3701.6, p.subtotal);
  T('pe fiecare rând al facturii: cantitate × preț = valoare', p.lines.every((l) => Math.round(l.qty * l.unitPrice * 100) / 100 === l.net), p.lines.map((l) => l.qty + '×' + l.unitPrice + '=' + l.net).join(' | '));
  T('perioada de pe factură începe pe 10 octombrie', new Date(p.periodStart).getDate() === 10 && new Date(p.periodStart).getMonth() === 9);
  const oct = f._liniiAbonament(firma, flota, 2026, 10, feat, 19, null);
  T('factura din octombrie (luna montajului) nu are nimic: zilele merg pe noiembrie', oct.lines.length === 0 && oct.total === 0);
  // Ce ține de firmă: păstrarea istoricului 24 de luni × 50 lei, pornită cu prima mașină (10 oct.).
  const cuPastrare = Object.assign({}, firma, { settings: { pastrare: { luni: 24, pretRON: 50 } } });
  const pp = f._liniiAbonament(cuPastrare, flota, 2026, 11, plans.featuresFor(cuPastrare), 19, null);
  T('păstrarea istoricului: noiembrie întreg (50 lei)…', pp.lines.some((l) => l.desc === 'Păstrarea istoricului — 24 de luni — noiembrie 2026' && l.net === 50));
  T('…și octombrie de la prima mașină (22 de zile = 35,48 lei)', pp.lines.some((l) => /^Păstrarea istoricului — 24 de luni — 10–31\.10\.2026/.test(l.desc) && l.net === 35.48), pp.lines.map((l) => l.desc + '=' + l.net).join(' | '));
  // Tariful fix pe firmă: e al firmei, nu al mașinilor — nu se înmulțește cu grupurile de zile.
  const fix = { id: 2, name: 'Fix SRL', custom_plan: { flatPriceRON: 500 }, settings: {} };
  const px = f._liniiAbonament(fix, flota, 2026, 11, plans.featuresFor(fix), 19, null);
  T('tarif fix: 500 lei pe noiembrie + 500 × 22/31 pe octombrie, o singură dată', px.lines.length === 2 && px.lines[0].net === 500 && px.lines[1].net === 354.84, px.lines.map((l) => l.desc + '=' + l.net).join(' | '));
  T('fără ofertă pe firmă → zero, nu un preț inventat', f._liniiAbonament({ id: 3, name: 'X', settings: {} }, flota, 2026, 11, {}, 19, null).total === 0);
}

sect('3. Accesul: DOAR neplata sau oprirea de mână (ceasul „acces până la" a plecat)');
{
  const fn = taie(server, 'function stareAcces(', '// +n luni calendaristice');
  const neplata = require('./neplata.js');
  const stareAcces = new Function('neplata', fn + '\nreturn stareAcces;')(neplata);
  const ZI = 86400000, acum = Date.now();
  const plata = (zileDeLaScadenta) => [{ id: 1, full_number: 'RAT-2026-00001', type: 'invoice', status: 'issued', due_date: acum - zileDeLaScadenta * ZI, total: 100 }];
  T('fără nimic restant → activ', stareAcces({}, [], acum).status === 'active');
  T('o firmă cu „acces până la" expirat demult, dar fără restanțe → ACTIVĂ (ceasul vechi nu mai taie)', stareAcces({ access_until: acum - 90 * ZI }, [], acum).status === 'active');
  T('factură trecută de scadență cu 3 zile → restanță, cu mesajul clientului', stareAcces({}, plata(3), acum).status === 'grace' && /Factura RAT-2026-00001/.test(stareAcces({}, plata(3), acum).mesaj || ''));
  T('a 16-a zi după scadență → suspendat pentru neplată', stareAcces({}, plata(16), acum).status === 'expired' && stareAcces({}, plata(16), acum).motiv === 'neplata');
  T('o PROFORMĂ neplătită nu suspendă pe nimeni (e cerere de plată, nu factură)',
    stareAcces({}, [{ id: 2, full_number: 'PF-2026-00001', type: 'proforma', status: 'issued', due_date: acum - 40 * ZI, total: 100 }], acum).status === 'active');
  T('oprit de noi → suspendat, cu motivul', stareAcces({ suspended_at: acum - ZI, suspend_reason: 'x' }, [], acum).motiv === 'manual');
  T('„Plătită" nu mai scrie nicio dată de acces (plata e atomică, cu factura)', !/setCompanyAccessUntil/.test(dbjs) && /payInvoiceAtomic\(inv\.id,/.test(server));
  T('ruta care punea de mână „acces până la" a fost ștearsă', !/app\.put\('\/api\/companies\/:id\/access'/.test(server));
}

sect('4. Pe ecran');
{
  const modal = taie(html, 'window.raxOpenGenInvoice = function (companyId, fel)', 'window.raxGenIssue');
  T('„Generează factură": abonamentul unei luni SAU o factură unică', /data-fel="abonament"/.test(modal) && /data-fel="unica"/.test(modal));
  T('la factura unică: factură fiscală SAU proformă', /data-tip="invoice"/.test(modal) && /data-tip="proforma"/.test(modal));
  T('rândurile unice se iau din contract și din lucrările executate', /_giPuneContract\('aparate'\)/.test(modal) && /_giPuneLucrare\(/.test(modal));
  T('un buton apăsat o dată se stinge (aceleași aparate de două ori ar fi o greșeală)', /puse\[cheie\] \? 'disabled/.test(modal));
  // Hotărârea lui Alin (29.09, „da"): factura montajului STRÂNSĂ — un rând pe fel de lucrare, zilele dedesubt.
  // Codul adevărat din pagină, decupat și rulat pe cele trei zile de montaj din exemplu (apăsate în altă ordine).
  {
    const bloc = taie(html, '// ── începe „factura montajului, strânsă" ──', '// ── sfârșit „factura montajului, strânsă" ──');
    const zi = (an, l, z) => new Date(an, l - 1, z, 19, 0).getTime();
    const fmtD = (t) => { const d = new Date(Number(t)); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };
    const de = (n) => { const r = n % 100; return ' ' + ((r >= 1 && r <= 19) ? '' : 'de '); };
    const S = { lines: [], vatRate: 21 };
    const f = new Function('_giState', '_invFmtD', '_raxDe',
      'function _giRecalcLine(l) { var vr = (_giState.vatRate || 0); l.net = Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * 100) / 100; l.vat = Math.round(l.net * vr) / 100; }\n' +
      bloc + '\nreturn { _giStrangeLucrarea: _giStrangeLucrarea, _giNotaMontaj: _giNotaMontaj };')(S, fmtD, de);
    const lucr = (d, n, pretGps) => ({ data: d, masini: n, linii: [{ desc: 'Instalare dispozitiv GPS', qty: n, unitPrice: pretGps || 100 }, { desc: 'Instalare modul LV-CAN', qty: n, unitPrice: 60 }] });
    [lucr(zi(2027, 1, 30), 15), lucr(zi(2027, 1, 15), 10), lucr(zi(2027, 1, 25), 10)].forEach((j) => f._giStrangeLucrarea(S, j));
    T('trei zile de montaj → DOUĂ rânduri: 35 × montaj GPS și 35 × montaj LV-CAN (5.600 lei)',
      S.lines.length === 2 && S.lines[0].qty === 35 && S.lines[0].net === 3500 && S.lines[1].qty === 35 && S.lines[1].net === 2100, JSON.stringify(S.lines));
    T('zilele merg dedesubt, în ordinea lor, cu câte mașini: „15.01.2027 (10 mașini), 25.01.2027 (10 mașini) și 30.01.2027 (15 mașini)"',
      S.nota === 'Montaj executat pe 15.01.2027 (10 mașini), 25.01.2027 (10 mașini) și 30.01.2027 (15 mașini).', S.nota);
    f._giStrangeLucrarea(S, lucr(zi(2027, 2, 10), 20, 90));
    T('o zi cu alt preț rămâne pe rândul ei (nu amestecăm 100 și 90 de lei), iar „20 de mașini" se scrie cu „de"',
      S.lines.length === 3 && S.lines[0].qty === 35 && S.lines[2].unitPrice === 90 && S.lines[2].qty === 20 && / și 10\.02\.2027 \(20 de mașini\)\.$/.test(S.nota), JSON.stringify(S.lines.map((l) => l.qty + '×' + l.unitPrice)) + ' | ' + S.nota);
    T('o singură zi: „Montaj executat pe 15.01.2027 (10 mașini)."', f._giNotaMontaj([{ data: zi(2027, 1, 15), masini: 10 }]) === 'Montaj executat pe 15.01.2027 (10 mașini).');
  }
  T('mențiunea se poate corecta în fereastră și pleacă odată cu factura', /id="rax-gi-nota"/.test(modal + html) && /note: \(_giState\.fel === 'unica' && String\(_giState\.nota \|\| ''\)\.trim\(\)\)/.test(html));
  // Hârtia facturii, desenată pe un „carton" care ține minte doar textul (ce citește clientul).
  {
    const FP = require('./factura_pdf.js');
    const carton = () => {
      const texte = [];
      const d = {
        page: { width: 595.28, height: 841.89, margins: { top: 40, bottom: 40, left: 40, right: 40 } }, x: 40, y: 40,
        font() { return d; }, fontSize() { return d; }, fillColor() { return d; }, strokeColor() { return d; }, lineWidth() { return d; },
        moveTo() { return d; }, lineTo() { return d; }, stroke() { return d; }, image() { return d; }, roundedRect() { return d; }, rect() { return d; },
        fill() { return d; }, fillAndStroke() { return d; }, heightOfString() { return 10; }, addPage() { d.y = 40; return d; },
        text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') d.y = y + 11; else d.y += 11; return d; }
      };
      return { d, texte };
    };
    const hartie = (inv) => { const c = carton(); FP.scrieFactura(c.d, inv, null); return c.texte.join(' ¦ '); };
    const emit = { name: 'RA TRACKS SRL', cui: '12345678', reg_com: 'J35/1/2025', iban: 'RO49AAAA1B31007593840000', bank: 'Banca', vat_rate: 21 };
    const client = (tva) => ({ name: 'Transport SRL', cui: 'RO11111111', reg_com: 'J35/2/2020', vat_payer: tva });
    const linii = [{ desc: 'Instalare dispozitiv GPS', qty: 35, unitPrice: 100, net: 3500, vatRate: 21, vat: 735 }];
    const montajInv = { full_number: 'RAT-2027-00002', type: 'invoice', fel: 'unica', issue_date: Date.UTC(2027, 0, 30, 19), due_date: Date.UTC(2027, 1, 14, 19),
      period_start: Date.UTC(2027, 0, 30, 19), period_end: Date.UTC(2027, 0, 30, 19), subtotal: 3500, vat_amount: 735, total: 4235, lines: linii, issuer: emit, client: client(false),
      note: 'Montaj executat pe 15.01.2027 (10 mașini).' };
    const tm = hartie(montajInv);
    const prev = hartie(Object.assign({}, montajInv, { full_number: null, previzualizare: true, type: 'proforma' }));
    T('previzualizarea: aceeași hârtie, dar scrie „PREVIZUALIZARE" în locul numărului și, jos, că nu e emisă',
      /PREVIZUALIZARE ¦/.test(prev) && /PREVIZUALIZARE — documentul nu e emis încă/.test(prev) && !/RAT-2027-00002/.test(prev) && /FACTURĂ PROFORMĂ/.test(prev), prev);
    T('pe hârtie, factura unică: „Mențiuni" (zilele montajului), nu „Perioada" (o perioadă de o zi n-avea sens)',
      /Mențiuni: Montaj executat pe 15\.01\.2027 \(10 mașini\)\./.test(tm) && !/Perioada:/.test(tm), tm);
    T('clientul NEPLĂTITOR de TVA: CUI fără „RO" (chiar dacă s-a tastat cu RO); noi, plătitori: cu „RO"',
      /CUI: 11111111 · Reg\. Com\.: J35\/2\/2020/.test(tm) && /CUI: RO12345678/.test(tm), tm);
    T('clientul plătitor de TVA: CUI cu „RO"', /CUI: RO11111111/.test(hartie(Object.assign({}, montajInv, { client: client(true) }))));
    T('plata: prin transfer, în contul nostru, până la scadență; sume românești (3.500,00)',
      /Plata: prin transfer bancar, în contul RO49AAAA1B31007593840000 \(Banca\), până la 14\.02\.2027\./.test(tm) && /3\.500,00/.test(tm), tm);
    const abo = hartie(Object.assign({}, montajInv, { full_number: 'RAT-2027-00003', fel: 'abonament', note: 'Factură lunară automată',
      period_start: Date.UTC(2027, 0, 15), period_end: Date.UTC(2027, 1, 28, 23, 59, 59, 999) }));
    T('abonamentul: „Perioada: 15.01.2027 → 28.02.2027" — sfârșitul lunii NU sare pe 01.03 (zile de calendar, nu ora României)',
      /Perioada: 15\.01\.2027 → 28\.02\.2027 · Factură lunară automată/.test(abo), abo);
    const pfh = hartie(Object.assign({}, montajInv, { full_number: 'PF-2027-00001', type: 'proforma', note: null }));
    T('proforma: „FACTURĂ PROFORMĂ" și „fără valoare fiscală"; fără „Perioada"', /FACTURĂ PROFORMĂ/.test(pfh) && /Document fără valoare fiscală/.test(pfh) && !/Perioada:/.test(pfh), pfh);
    const dinPf = hartie(Object.assign({}, montajInv, { din_proforma: 7, note: 'Emisă la încasarea proformei PF-2027-00001' }));
    T('factura născută din proformă nu mai cere plată și spune de unde vine', !/Plata: prin transfer/.test(dinPf) && /Emisă la încasarea unei proforme\./.test(dinPf), dinPf);
    T('numele fișierului, regula casei: „RA-Tracks - Factură RAT-2027-00002 - Transport SRL.pdf" / „… Proformă PF-…"',
      FP.numeFisier(montajInv) === 'RA-Tracks - Factură RAT-2027-00002 - Transport SRL.pdf' &&
      FP.numeFisier({ full_number: 'PF-2027-00001', type: 'proforma', client: { name: 'Trans/Port: SRL' } }) === 'RA-Tracks - Proformă PF-2027-00001 - Trans-Port- SRL.pdf');
    T('logo-ul pentru fundal alb (logo-light.png) și fonturile cu diacritice, ca oferta și contractul',
      /logo-light\.png/.test(fs.readFileSync('./factura_pdf.js', 'utf8')) && /DejaVuSans\.ttf/.test(fs.readFileSync('./factura_pdf.js', 'utf8')));
  }
  T('serverul spune câte mașini s-au montat în fiecare zi (pentru mențiune)', /linii: linii, masini: masini \|\| null,/.test(server));
  T('ecranul spune câte aparate de pe firmă nu transmit încă (și de ce nu intră)', /nu transmit încă: nu intră pe factură/.test(modal));
  T('și avertizează când luna e deja facturată', /Luna asta e deja facturată/.test(modal));
  T('emiterea trimite felul, luna, tipul și lucrările', /fel: _giState\.fel, luna: _giState\.luna, tip: _giState\.fel === 'unica' \? _giTip : 'invoice', lines: lines, montaje:/.test(html));
  T('„Prima factură" din drumul clientului deschide factura unică', /raxOpenGenInvoice\(companyId, 'unica'\)/.test(html));
  T('proforma nu are buton de ANAF și se „încasează", nu se „plătește"', /if \(!pf && v\.status !== 'canceled' && v\.efactura_status !== 'validated' && v\.efactura_status !== 'uploaded'\)/.test(html) && /Încasată — emite factura fiscală/.test(html));
  // Hârtia facturii e UNA, pe server (factura_pdf.js). Pagina nu mai are un șablon al ei, care s-ar
  // despărți de cel descărcat — exact ce spune regula rapoartelor. Textul proformei îl probează 4b, desenat.
  const fpSrc = fs.readFileSync('./factura_pdf.js', 'utf8');
  T('hârtia facturii și a proformei se face DOAR pe server: pagina nu mai scrie „FACTURĂ FISCALĂ" / „FACTURĂ PROFORMĂ"',
    /'FACTURĂ PROFORMĂ' : 'FACTURĂ FISCALĂ'/.test(fpSrc) && /Document fără valoare fiscală/.test(fpSrc) &&
    !/FACTURĂ PROFORMĂ|FACTURĂ FISCALĂ|fără valoare fiscală/.test(html));
  T('trecerea în bloc stă în „Neasignate" — adopția rămâne într-un singur loc', /gr\.k === '_neas' \? _raxDevBaraBloc\(gr\.dev\)/.test(html) && (html.match(/\/api\/devices\/company-bulk/g) || []).length === 1);
  T('pe server, toate cele trei uși (unul, mai mulți, „Mută între companii") trec prin aceeași funcție',
    (server.match(/await _trecePeFirma\(req, /g) || []).length === 3 && !/setDevicesCompanyBulk/.test(server + dbjs));
  T('rândul aparatului arată din ce zi plătește clientul, cu corectură', /abonament din ' \+ new Date\(Number\(d\.abonament_de_la\)\)/.test(html) && /raxDevAbonament\(/.test(html));
  T('clientul vede DOCUMENTELE adevărate, nu plăți cu numere inventate — și le descarcă în PDF, doar pe ale lui',
    !/function _raxInvNo\(/.test(html) && /_invHartieBtns\('\/api\/billing\/my-invoices\/' \+ f\.id \+ '\/pdf', f\.type === 'proforma'\)/.test(html));
  T('o singură hârtie a facturii: PDF-ul de pe server (șablonul HTML și fereastra de printare au plecat)',
    !/function _invFiscalHtml\(/.test(html) && !/raxPrintFiscalInvoice|raxPrintMyInvoice|_raxOpenInvoiceWindow/.test(html) && (html.match(/_invHartieBtns\(/g) || []).length === 4);
  T('fereastra „Generează factură" spune ce pleacă singur la emitere', /La emitere pleacă singură: clientul e anunțat în aplicație și o primește pe email/.test(html));
  T('după emitere și după „Încasată", mesajul spune ce a plecat și ce nu', (html.match(/_invTrimisaText\(j\.trimisa/g) || []).length === 2);
  T('pe server, toate felurile de documente pleacă prin ACEEAȘI funcție (automată, de mână, din proformă)',
    (server.match(/await _trimiteFactura\(/g) || []).length === 3 && !/title: 'Factură nouă: ' \+ num\.full/.test(server));
  // Factura pleacă singură la ANAF la emitere: o a doua trimitere ar dubla-o în SPV-ul clientului.
  const rutaEf = server.slice(server.indexOf("app.post('/api/invoices/:id/efactura'"), server.indexOf("app.get('/api/invoices/:id/efactura/status'"));
  T('o factură aflată deja la ANAF (trimisă sau validată) NU se mai trimite a doua oară — nici din pagină, nici pe server',
    /if \(inv\.efactura_status === 'uploaded' \|\| inv\.efactura_status === 'validated'\) \{\s*return res\.status\(409\)/.test(rutaEf) &&
    rutaEf.indexOf("efactura_status === 'uploaded'") < rutaEf.indexOf('efactura.uploadInvoice(') &&
    /v\.efactura_status !== 'validated' && v\.efactura_status !== 'uploaded'\) act \+= /.test(html));
  T('„Prima factură" din drum numără facturi FISCALE, nu proforme', /AND type IS DISTINCT FROM 'proforma' GROUP BY company_id/.test(dbjs));
  // Punctul 6 (Alin, 30.09): previzualizare înainte de emitere, proforma gata la semnare, secțiuni, butonul cu nume.
  T('„Previzualizează" și „Emite" trimit ACELAȘI corp (_giCorp) — ce vezi e ce pleacă',
    (html.match(/var body = _giCorp\(\)/g) || []).length === 2 && (html.match(/\/api\/invoices\/previzualizare/g) || []).length === 1 &&
    /onclick="raxGenPrevizualizare\(this\)"/.test(html) && /<i class="fas fa-eye"><\/i> Previzualizează<\/button>/.test(html));
  const rutaPrev = server.slice(server.indexOf("app.post('/api/invoices/previzualizare'"), server.indexOf("// Stare document: 'paid' | 'canceled'."));
  T('pe server, emiterea și previzualizarea compun documentul prin ACEEAȘI funcție; previzualizarea nu salvează, nu ia număr, nu trimite',
    (server.match(/await _compuneFactura\(/g) || []).length === 2 && rutaPrev.length > 200 &&
    !/createInvoice|nextInvoiceNumber|_trimiteFactura/.test(rutaPrev) && /previzualizare: true/.test(rutaPrev) && /requireSuperadmin/.test(rutaPrev));
  const fnSemnat = html.slice(html.indexOf('window.raxCtreSemnat'), html.indexOf('window.raxCtreData'));
  T('la „E semnat" (din listă și din fișă), proforma aparatelor se deschide gata făcută — doar la aparate VÂNDUTE, fără să emită',
    /_areAparateVandute\(c\)\) raxProformaLaSemnare\(c\.company_id\)/.test(fnSemnat) &&
    /if \(okS && cSemnat && _areAparateVandute\(cSemnat\.contract\)\) raxProformaLaSemnare\(cSemnat\.companyId\);/.test(html) &&
    /raxOpenGenInvoice\(companyId, 'unica'\);\s*raxGiTip\('proforma'\);\s*await raxGenDraft\(\);/.test(fnSemnat) && !/raxGenIssue/.test(fnSemnat));
  T('Facturare are două secțiuni: „Facturi" și „Proforme" (cu câte sunt de încasat)',
    /window\.raxInvSectiune = function/.test(html) && /Proforme · ' \+ nrPf \+ \(deIncasat \? ' \(' \+ deIncasat \+ ' de încasat\)' : ''\)/.test(html));
  T('pe rândul ofertei: un buton cu nume, „Deschide dosarul clientului" — și înainte, și după ce a devenit client',
    (html.match(/<\/i> Deschide dosarul clientului<\/button>'/g) || []).length === 2);
  T('fără „acces până la" și fără „Nelimitat" pe ecranele de facturare', !/Acces până/.test(html) && !/∞ Nelimitat/.test(html));
}

sect('5. Pe hârtie: contractul și oferta spun regula');
{
  const cpdf = fs.readFileSync('./contract_pdf.js', 'utf8');
  const rep = fs.readFileSync('./report_export.js', 'utf8');
  T('contractul: abonamentul pornește la prima transmisie, prima lună pe zile', /Abonamentul fiecărui vehicul începe din ziua în care echipamentul montat pe acesta transmite prima dată/.test(cpdf) && /proporțional cu zilele rămase din lună/.test(cpdf));
  T('oferta: aceeași regulă, în condiții', /Abonamentul fiecărei mașini începe din ziua în care aparatul montat pe ea transmite prima dată; prima lună se plătește pe zile/.test(rep));
}

sect('5b. Plata aparatelor și montajul (Alin, 29.09: „1.A, 2.DA, 3.DA")');
{
  const CP = require('./contract_pdf.js');
  const RE = require('./report_export.js');
  const MJ = require('./montaj.js');
  T('cifrele stau într-un singur loc: 30 de zile de la încasare, 30 de zile pentru avans',
    contracte.MONTAJ_ZILE_DUPA_AVANS === 30 && contracte.AVANS_ZILE_RENUNTARE === 30);
  // Hârtiile se desenează pe un „carton" care ține minte doar textul — ce ar citi clientul.
  const carton = () => {
    const texte = [];
    const d = {
      page: { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } }, x: 50, y: 50,
      font() { return d; }, fontSize() { return d; }, fillColor() { return d; }, strokeColor() { return d; }, lineWidth() { return d; },
      moveTo() { return d; }, lineTo() { return d; }, stroke() { return d; }, image() { return d; }, roundedRect() { return d; }, fill() { return d; },
      widthOfString(x) { return String(x == null ? '' : x).length * 4.6; }, heightOfString() { return 10; },
      addPage() { d.y = 50; return d; }, moveDown(n) { d.y += 12 * (n == null ? 1 : n); return d; },
      text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') d.y = y + 11; else d.y += 11; return d; }
    };
    return { d, texte };
  };
  const zi = Date.parse('2026-10-01T09:00:00Z');
  const contract = (montaj) => {
    const c = carton();
    CP.scrieContract(c.d, {
      contract: { number: 'RAT-C-2026-0050', status: 'aprobat', signed_at: zi, start_at: zi, months: 24, end_at: contracte.calcSfarsit(zi, 24), auto_renew: true, notice_days: 30,
        gdpr: { kind: 'anexa' }, annex: contracte.facAnexa([], { vehiculeOferta: [{ fel: 'can', nume: 'Vehicule GPS cu CAN', cant: 50, pret: 45, total: 2250 }] }), montaj: montaj || null },
      firma: { name: 'Transport SRL', cui: 'RO12345678', address: 'Str. Exemplu 1', payment_term_days: 15, billing_day: 1 },
      emitent: { name: 'RA TRACKS SRL', cui: 'RO44556677', vat_rate: 19 }
    });
    return c.texte.join(' ¦ ');
  };
  const cuAparate = MJ.facAnexaCosturiUnice(MJ.randuri([{ tip: 'gps', buc: 50, pretClient: 100 }, { tip: 'lvcan', buc: 50, pretClient: 60 }, { tip: 'deplasare', buc: 120, pretClient: 2 }]),
    MJ.randuriEchip([{ tip: 'fmc130', buc: 50, pretEur: 55 }, { tip: 'lvcan200', buc: 50, pretEur: 60 }]), 5, 'RON');
  const doarMontaj = MJ.facAnexaCosturiUnice(MJ.randuri([{ tip: 'gps', buc: 50, pretClient: 100 }]), [], 5, 'RON');
  const tA = contract(cuAparate), tM = contract(doarMontaj), t0 = contract(null);
  T('IV: aparatele integral în avans, pe proformă, în 15 zile de la semnare; factura fiscală la încasare',
    /Echipamentele din Anexa nr\. 2 se plătesc integral în avans, pe baza facturii proforme emise la semnarea contractului, în termen de 15 zile de la semnare; factura fiscală se emite la încasare\./.test(tA));
  T('IV: montajul după executare, pe vehiculele montate efectiv', /Montajul se facturează după executare, pentru vehiculele montate efectiv\./.test(tA));
  T('V: livrarea și montajul în 30 de zile de la ÎNCASAREA avansului (nu de la semnare)',
    /livrează și montează echipamentele din Anexa nr\. 2 în cel mult 30 de zile de la încasarea avansului/.test(tA));
  T('V: vehiculul neadus la montaj → termenul se prelungește, drumul în plus la tariful din anexă (2 lei/km)',
    /Dacă un vehicul nu este disponibil, termenul de montaj se prelungește cu zilele de întârziere/.test(tA) && /la tariful de 2,00 RON pe kilometru, fără TVA/.test(tA));
  T('V: și abonamentul unei mașini nemontate nu începe', /Abonamentul vehiculelor nemontate nu începe până la montaj/.test(tA));
  T('VII: avansul neplătit în 30 de zile → oricare parte poate renunța, fără penalități',
    /Dacă avansul pentru echipamente nu este plătit în 30 de zile de la semnare, oricare parte poate renunța la contract, fără penalități/.test(tA));
  T('Anexa nr. 2: aparatele (A) în avans, pe proformă; montajul (B) după executare',
    /echipamentele \(A\), integral în avans, pe baza facturii proforme; montajul \(B\), după executare/.test(tA));
  T('fără aparate vândute (doar montaj): fără avans, fără termen de la încasare, fără renunțare — dar cu mașinile neaduse',
    !/integral în avans/.test(tM) && !/de la încasarea avansului/.test(tM) && !/Dacă avansul/.test(tM)
    && /Dacă un vehicul nu este disponibil/.test(tM) && /deplasarea suplimentară a echipei de montaj se facturează separat\./.test(tM)
    && /se plătesc O SINGURĂ DATĂ, după executare, pentru vehiculele montate efectiv/.test(tM));
  T('fără montaj deloc: nicio clauză de montaj', !/Dacă un vehicul nu este disponibil|integral în avans|Dacă avansul/.test(t0));
  // Oferta spune aceleași lucruri, cu aceleași cifre.
  const oferta = (o) => { const c = carton(); RE.renderOfertaPdf(c.d, o); return c.texte.join(' ¦ '); };
  const baza = { client: { name: 'Transport SRL' }, contractMonths: 24, fxRate: 5, fxSursa: 'BNR', nVeh: 50,
    lines: [{ fel: 'can', label: 'Vehicule GPS cu CAN', qty: 50, unit: 45, total: 2250 }], monthly: 2250, contractTotal: 54000,
    montajLines: [{ label: 'Instalare dispozitiv GPS', qty: 50, unit: 100, total: 5000 }], montaj: 5000,
    deviceLines: [{ label: 'Teltonika FMC130', qty: 50, unit: 55, total: 2750 }], hwTotal: 2750, chirieLuniMin: 24, chirieZileRetur: 15 };
  const oC = oferta(baza);
  const oFaraMontaj = oferta(Object.assign({}, baza, { montajLines: [], montaj: 0 }));
  const oInch = oferta(Object.assign({}, baza, { inchiriere: true, tarifDemontare: 60, deviceLines: [], hwTotal: 0 }));
  T('oferta: aparatele în avans, pe proformă; montajul în 30 de zile de la încasare',
    /Echipamentele se plătesc integral în avans, pe proformă, la semnarea contractului; livrarea și montajul se fac în cel mult 30 de zile de la încasare\./.test(oC));
  T('oferta: mașinile neaduse la montaj, imediat după plata costului unic',
    /Mașinile se pun la dispoziție în zilele de montaj stabilite\. Dacă o mașină lipsește, termenul se prelungește/.test(oC)
    && oC.indexOf('Echipamentele se plătesc integral în avans') < oC.indexOf('Mașinile se pun la dispoziție') && oC.indexOf('Mașinile se pun la dispoziție') < oC.indexOf('Abonamentul fiecărei mașini începe'));
  T('oferta fără montaj: fără clauza mașinilor neaduse', !/Mașinile se pun la dispoziție/.test(oFaraMontaj));
  T('oferta cu închiriere: fără avans pentru aparate, dar cu mașinile neaduse (are montaj)', !/se plătesc integral în avans/.test(oInch) && /Mașinile se pun la dispoziție/.test(oInch));
}

// ─── 6. Pe server pornit: tot drumul ────────────────────────────────────────────────────────
const PORT = 3237, DIR = '.abonament-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_abonament',
  PORT: String(PORT), TCP_PORT: '5237', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (x) => new Promise((r) => setTimeout(r, x));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
async function intra(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const f = async (m, url, body) => {
    const x = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) {}
    return { s: x.status, j: j };
  };
  // Un fișier (PDF-ul facturii): starea, felul, numele din antet și primii octeți.
  f.fisier = async (url, body) => {
    const x = await fetch(B + url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify(body) } : { headers: { Cookie: ck } });
    const buf = Buffer.from(await x.arrayBuffer());
    return { s: x.status, ct: x.headers.get('content-type') || '', cd: x.headers.get('content-disposition') || '', inceput: buf.slice(0, 5).toString('latin1'), marime: buf.length };
  };
  return f;
}
const cheie = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('6. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 19 } });
  const azi = new Date(), urm = new Date(azi.getFullYear(), azi.getMonth() + 1, 1);

  // Oferta cu aparate + montaj → firma → contractul (Anexa nr. 2 cu cursul înghețat la 5,0785).
  const cfg = { nVeh: 3, nCan: 3, nFms: 0, contractMonths: 24, fxRate: 5.0785, devices: { d130: 3, lvcan: 3 }, montaj: { qGps: 3, qLvCan: 3 } };
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Transport', client_name: 'Transport SRL', monthly_total: 135, currency: 'RON',
    config: { cfg: cfg, prices: { pPlain: 29, pCan: 45, dFmc130: 55, dLvCan: 60, mGps: 100, mLvCan: 60 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Transport SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/oferta', { oferta: { name: 'Ofertă', priceNoneRON: 29, priceCanRON: 45, priceFmsRON: 65 } });
  const ct = await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 24,
    din_oferta: { unitati: { plain: 29, can: 45, fms: 65 }, vehicule: [{ fel: 'can', nume: 'Vehicule GPS cu CAN', cant: 3, pret: 45, total: 135 }], servicii: [] } });
  T('contractul din ofertă (cu aparate și montaj în Anexa nr. 2)', ct.s === 200 && ct.j.montaj && (ct.j.montaj.echipamente.items || []).length === 2, JSON.stringify(ct.j && ct.j.montaj));

  // Aparatele: înregistrate în „Neasignate", trecute în bloc pe firmă.
  const imeis = ['869500000000001', '869500000000002', '869500000000003'];
  for (const i of imeis) await R('POST', '/api/devices', { imei: i, name: 'M' + i.slice(-1) });
  const bloc = await R('PUT', '/api/devices/company-bulk', { company_id: co.id, imeis: imeis });
  T('trecere în bloc: 3 aparate pe Transport SRL dintr-o apăsare', bloc.s === 200 && bloc.j.trecute === 3, JSON.stringify(bloc.j));
  T('fără firmă aleasă → refuzat, cu motivul', (await R('PUT', '/api/devices/company-bulk', { imeis: imeis })).s === 400);
  T('fără aparate bifate → refuzat', (await R('PUT', '/api/devices/company-bulk', { company_id: co.id, imeis: [] })).s === 400);
  let dr = (await R('POST', '/api/invoices/draft', { companyId: co.id })).j;
  T('înainte de montaj: nimic de facturat, iar ciorna spune că 3 aparate nu transmit încă', dr.lines.length === 0 && dr.aparateNepornite === 3, JSON.stringify({ l: dr.lines.length, n: dr.aparateNepornite }));

  // Montajul: două mașini transmit.
  for (const i of imeis.slice(0, 2)) await R('POST', '/api/test/simulate', { imei: i, io: { can_speed: 50 } });
  let dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => imeis.indexOf(x.imei) >= 0);
  const pornite = dev.filter((x) => x.abonament_de_la);
  T('prima transmisie pune singură ziua de pornire (azi), doar pe cele montate', pornite.length === 2 && new Date(pornite[0].abonament_de_la).toDateString() === azi.toDateString(), dev.map((x) => x.imei.slice(-1) + ':' + x.abonament_de_la).join(' '));
  dr = (await R('POST', '/api/invoices/draft', { companyId: co.id })).j;
  T('luna montajului: tot nimic — zilele merg pe factura lunii viitoare', dr.lines.length === 0);
  dr = (await R('POST', '/api/invoices/draft', { companyId: co.id, luna: cheie(urm) })).j;
  const zile = new Date(azi.getFullYear(), azi.getMonth() + 1, 0).getDate() - azi.getDate() + 1;
  T('luna viitoare: 2 mașini pe luna întreagă + zilele de acum până la capătul lunii', dr.lines.length === 2 && dr.aparateIntregi === 2 && dr.aparatePeZile === 2 &&
    dr.lines.some((l) => new RegExp('\\(' + contracte.numar(zile, 'zi', 'zile').replace(/ /g, ' ') + '\\)$').test(l.desc)), dr.lines.map((l) => l.desc + '=' + l.net).join(' | '));

  // Corectura noastră: prima mașină „pornită" acum trei luni.
  const vechi = new Date(azi.getFullYear(), azi.getMonth() - 3, 12);
  const zi3 = vechi.getFullYear() + '-' + String(vechi.getMonth() + 1).padStart(2, '0') + '-12';
  const cor = await R('PUT', '/api/devices/' + imeis[0] + '/abonament', { de_la: zi3 });
  T('corectura zilei de pornire (de mână, cu rând în audit)', cor.s === 200 && new Date(Number(cor.j.abonament_de_la)).getDate() === 12);
  T('o zi din viitor → refuzată', (await R('PUT', '/api/devices/' + imeis[0] + '/abonament', { de_la: (azi.getFullYear() + 1) + '-01-01' })).s === 400);

  // Problema 2: o factură unică în lună NU mai oprește abonamentul automat.
  const unica = await R('POST', '/api/invoices', { companyId: co.id, fel: 'unica', lines: [{ desc: 'Echipament — Teltonika FMC130', qty: 1, unitPrice: 279.32 }] });
  T('factura unică se emite ca „unică"', unica.s === 200 && unica.j.invoice.fel === 'unica');
  const tu = unica.j.trimisa || {};
  T('factura făcută de mână pleacă singură: clientul e anunțat; fără email și token pe server, spune pe față de ce n-a plecat',
    tu.notificare === true && tu.email === false && tu.emailMotiv === 'serverul n-are email' && tu.anaf === 'fara_token', JSON.stringify(tu));
  await R('PUT', '/api/companies/' + co.id + '/billing-config', { auto_invoice: true, billing_day: 1 });
  const run = (await R('POST', '/api/admin/billing/run-auto')).j;
  let facturi = ((await R('GET', '/api/invoices?company_id=' + co.id)).j || {}).invoices || [];
  const aboLuna = facturi.filter((v) => v.fel === 'abonament' && v.luna === cheie(azi))[0];
  T('abonamentul lunii pleacă ȘI după o factură unică emisă în aceeași lună', run.issued.length === 1 && aboLuna, JSON.stringify(run));
  T('pe el: doar mașina pornită de dinainte de lună, luna întreagă (45 lei)', aboLuna && Math.abs(Number(aboLuna.subtotal) - 45) < 0.005, aboLuna && aboLuna.subtotal);
  const run2 = (await R('POST', '/api/admin/billing/run-auto')).j;
  T('a doua rulare nu mai emite nimic (o singură factură de abonament pe lună)', run2.issued.length === 0);
  const dublu = await R('POST', '/api/invoices', { companyId: co.id, fel: 'abonament', luna: cheie(azi) });
  T('a doua factură de abonament pe aceeași lună, de mână → refuzată, cu numărul celei existente', dublu.s === 409 && /deja facturat/.test(dublu.j.error || '') && dublu.j.deja && dublu.j.deja.full_number === aboLuna.full_number);
  await R('PUT', '/api/invoices/' + aboLuna.id + '/status', { status: 'canceled' });
  const refacuta = await R('POST', '/api/invoices', { companyId: co.id, fel: 'abonament', luna: cheie(azi) });
  T('după anulare, abonamentul lunii se poate reface de mână', refacuta.s === 200 && refacuta.j.invoice.fel === 'abonament' && refacuta.j.invoice.luna === cheie(azi));
  T('dar ceasul automat nu-l reface singur peste ce ai anulat tu', ((await R('POST', '/api/admin/billing/run-auto')).j.issued || []).length === 0);

  // Factura unică din contract: aparatele la cursul înghețat, montajul din lucrarea executată.
  const lucrare = await R('POST', '/api/companies/' + co.id + '/montaje', { contract_id: ct.j.id, status: 'executat', items: [{ tip: 'gps', buc: 2, pretClient: 100, costPartener: 60 }] });
  const du = (await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' })).j;
  const dc = du.dinContract || {};
  const a130 = (dc.aparate || []).filter((x) => /FMC130/.test(x.desc))[0];
  T('aparatele din contract: 3 × 55 € la 5,0785 lei = 279,32 lei bucata', a130 && a130.qty === 3 && a130.unitPrice === 279.32, JSON.stringify(dc.aparate));
  T('montajul se ia din lucrarea EXECUTATĂ (2 bucăți montate, nu 3 din contract)', (dc.lucrari || []).length === 1 && dc.lucrari[0].linii[0].qty === 2 && dc.lucrari[0].total === 200, JSON.stringify(dc.lucrari));
  const cuMontaj = await R('POST', '/api/invoices', { companyId: co.id, fel: 'unica', tip: 'invoice', montaje: [lucrare.j.id],
    lines: dc.lucrari[0].linii });
  const lucrareDupa = ((await R('GET', '/api/companies/' + co.id + '/montaje')).j || []).filter((m) => m.id === lucrare.j.id)[0] || {};
  T('lucrarea pusă pe o factură fiscală trece pe „facturat clientului"', cuMontaj.s === 200 && cuMontaj.j.montajeFacturate === 1 && lucrareDupa.status === 'facturat_clientului', lucrareDupa.status);
  T('…și nu mai e propusă a doua oară', (((await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' })).j.dinContract || {}).lucrari || []).length === 0);

  // Previzualizarea (30.09): hârtia exactă, fără număr, fără nimic salvat sau trimis.
  const inainte = (((await R('GET', '/api/invoices?limit=1000')).j || {}).invoices || []).length;
  const pv = await R.fisier('/api/invoices/previzualizare', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: dc.aparate });
  const dupaPv = (((await R('GET', '/api/invoices?limit=1000')).j || {}).invoices || []).length;
  T('previzualizarea proformei: un PDF, cu numele „RA-Tracks - Previzualizare proformă - …", și NICIUN document nou',
    pv.s === 200 && /application\/pdf/.test(pv.ct) && pv.inceput === '%PDF-' && /Previzualizare%20proform%C4%83/.test(pv.cd) && dupaPv === inainte, JSON.stringify({ s: pv.s, cd: pv.cd, inainte, dupaPv }));
  const pvGol = await R('POST', '/api/invoices/previzualizare', { companyId: co.id, tip: 'invoice', fel: 'unica', lines: [] });
  T('previzualizarea spune aceleași refuzuri ca emiterea (fără rânduri → „Adaugă cel puțin un rând")', pvGol.s === 400 && /Adaugă cel puțin un rând/.test((pvGol.j || {}).error || ''), JSON.stringify(pvGol));
  // Proforma: serie proprie, fără ANAF, fără „prima factură", la încasare → factură fiscală plătită.
  const pf = await R('POST', '/api/invoices', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: dc.aparate });
  T('după o previzualizare, proforma emisă ia primul număr liber (previzualizarea n-a „mâncat" niciunul)', pf.s === 200 && /^PF-\d{4}-00001$/.test(pf.j.invoice.full_number), pf.j && pf.j.invoice && pf.j.invoice.full_number);
  T('proforma are seria ei (PF-…), nu ia numere din șirul facturilor', pf.s === 200 && /^PF-\d{4}-\d{5}$/.test(pf.j.invoice.full_number) && pf.j.invoice.type === 'proforma', pf.j && pf.j.invoice && pf.j.invoice.full_number);
  T('proforma nu se trimite la ANAF și n-are XML', (await R('POST', '/api/invoices/' + pf.j.invoice.id + '/efactura')).s >= 400 && (await R('GET', '/api/invoices/' + pf.j.invoice.id + '/efactura/xml')).s >= 400);
  T('proforma se anunță, dar nu merge la ANAF', pf.j.trimisa && pf.j.trimisa.notificare === true && pf.j.trimisa.anaf === 'nu_se_trimite', JSON.stringify(pf.j.trimisa));
  const inc = await R('PUT', '/api/invoices/' + pf.j.invoice.id + '/status', { status: 'paid' });
  T('factura fiscală din proforma încasată pleacă și ea (anunț; ANAF doar cu token)', inc.j && inc.j.trimisa && inc.j.trimisa.notificare === true && inc.j.trimisa.anaf === 'fara_token', JSON.stringify(inc.j && inc.j.trimisa));
  T('„Încasată" → factura fiscală, în seria RAT, marcată plătită, legată de proformă', inc.s === 200 && /^RAT-/.test(inc.j.invoice.full_number) && inc.j.invoice.status === 'paid' && inc.j.invoice.din_proforma === pf.j.invoice.id, JSON.stringify(inc.j && inc.j.invoice && { n: inc.j.invoice.full_number, s: inc.j.invoice.status, d: inc.j.invoice.din_proforma }));
  const pfDupa = (await R('GET', '/api/invoices/' + pf.j.invoice.id)).j;
  T('proforma rămâne „încasată", cu legătura spre factură', pfDupa.status === 'paid' && pfDupa.factura_id === inc.j.invoice.id);
  T('o a doua apăsare nu face a doua factură', (await R('PUT', '/api/invoices/' + pf.j.invoice.id + '/status', { status: 'paid' })).j.already === true);
  T('proforma încasată nu se mai anulează (se face storno pe factură)', (await R('PUT', '/api/invoices/' + pf.j.invoice.id + '/status', { status: 'canceled' })).s === 400);

  // Problema 1: un client care a plătit tot NU se blochează.
  const u = (await R('POST', '/api/users', { username: 'sef@transport.ro', full_name: 'Șef Transport', role: 'company_admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  const C = await intra('sef@transport.ro', 'Str4da-Verde-2026');
  const trecuta = new Date(azi.getFullYear(), azi.getMonth() - 2, 1);
  const veche = await R('POST', '/api/invoices', { companyId: co.id, fel: 'abonament', luna: cheie(trecuta), lines: [{ desc: 'Abonament monitorizare GPS', qty: 1, unitPrice: 29 }] });
  await R('PUT', '/api/invoices/' + veche.j.invoice.id + '/status', { status: 'paid' });
  await sleep(21000);   // starea de acces stă 20 de secunde în memorie
  T('factură pe o lună trecută, PLĂTITĂ → clientul intră (până pe 28.09 era blocat pe loc)', (await C('GET', '/api/devices')).s === 200);
  const my = (await C('GET', '/api/billing/my-invoices')).j || {};
  T('clientul își vede documentele adevărate, cu numărul lor (facturi și proforma)', (my.invoices || []).some((f) => f.type === 'proforma' && /^PF-/.test(f.full_number)) && (my.invoices || []).some((f) => f.full_number === veche.j.invoice.full_number));
  T('și starea plăților, fără „acces până la"', my.access && my.access.status === 'active' && my.access.access_until === undefined);
  // Hârtia facturii, descărcată: noi orice factură, clientul doar pe ale lui (același 404 pentru „nu există" și „nu e a ta").
  const nrInc = inc.j.invoice.full_number;
  const pdfNoi = await R.fisier('/api/invoices/' + inc.j.invoice.id + '/pdf');
  T('noi descărcăm factura ca PDF, cu numele casei în antet (UTF-8: „Factură")',
    pdfNoi.s === 200 && /application\/pdf/.test(pdfNoi.ct) && pdfNoi.inceput === '%PDF-' &&
    pdfNoi.cd.indexOf("filename*=UTF-8''" + encodeURIComponent('RA-Tracks - Factură ' + nrInc + ' - Transport SRL.pdf')) >= 0, JSON.stringify({ s: pdfNoi.s, ct: pdfNoi.ct, cd: pdfNoi.cd }));
  const pdfClient = await C.fisier('/api/billing/my-invoices/' + inc.j.invoice.id + '/pdf');
  T('clientul își descarcă propria factură', pdfClient.s === 200 && pdfClient.inceput === '%PDF-', pdfClient.s);
  const coStrain = (await R('POST', '/api/companies', { name: 'Străin SRL' })).j;
  const fStrain = await R('POST', '/api/invoices', { companyId: coStrain.id, fel: 'unica', lines: [{ desc: 'Echipament', qty: 1, unitPrice: 100 }] });
  const pdfStrain = await C.fisier('/api/billing/my-invoices/' + fStrain.j.invoice.id + '/pdf');
  T('…dar nu pe a altei firme: 404, ca pentru una care nu există', pdfStrain.s === 404 && (await C.fisier('/api/billing/my-invoices/99999999/pdf')).s === 404, pdfStrain.s);
  T('și nici ruta noastră (doar super-admin)', (await C.fisier('/api/invoices/' + inc.j.invoice.id + '/pdf')).s === 403);
  const notC = (((await C('GET', '/api/notifications?limit=40')).j) || []).map((n) => n.title);
  T('clientul găsește în aplicație „Factură nouă" pentru factura făcută de mână și „Proformă nouă" pentru proformă',
    notC.indexOf('Factură nouă: ' + unica.j.invoice.full_number) >= 0 && notC.indexOf('Proformă nouă: ' + pf.j.invoice.full_number) >= 0 && notC.indexOf('Factură nouă: ' + nrInc) >= 0, JSON.stringify(notC));
  // TVA-ul de la ANAF se SALVEAZĂ (până pe 30.09 se arăta și se pierdea; toate firmele erau socotite plătitoare).
  const dz = await R('PUT', '/api/companies/' + co.id + '/dosar', { vat_payer: false });
  let ovT = (await R('GET', '/api/companies/' + co.id + '/overview')).j || {};
  T('„Completează" (cu ANAF) salvează: neplătitoare de TVA', dz.s === 200 && dz.j.company.vat_payer === false && ovT.company.vat_payer === false, JSON.stringify(dz.j && dz.j.company));
  await R('PUT', '/api/companies/' + co.id, { vat_payer: true });
  ovT = (await R('GET', '/api/companies/' + co.id + '/overview')).j || {};
  T('„Client nou" (cu ANAF) salvează: plătitoare de TVA', ovT.company.vat_payer === true);
  await R('PUT', '/api/companies/' + co.id, { vat_payer: 'poate' });
  ovT = (await R('GET', '/api/companies/' + co.id + '/overview')).j || {};
  T('altceva decât da/nu nu atinge câmpul', ovT.company.vat_payer === true);

  // Mutarea pe altă firmă: abonamentul pornește din nou.
  const co2 = (await R('POST', '/api/companies', { name: 'Alt Client SRL' })).j;
  await R('PUT', '/api/devices/' + imeis[1] + '/company', { company_id: co2.id });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('mutat pe altă firmă → ziua de pornire se șterge (pornește la prima transmisie acolo)', dev.company_id === co2.id && dev.abonament_de_la === null, JSON.stringify(dev));
  await R('POST', '/api/test/simulate', { imei: imeis[1] });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('…și pornește din nou la prima transmisie pe firma nouă', dev.abonament_de_la != null);
  // Aceeași regulă și pe a treia ușă: Companii → „Mută între companii" (și „Bifează tot" de pe telefon). Până pe 30.09
  // ea scria doar firma, iar mașina ajungea pe factura firmei noi cu ziua de pornire de la cea veche.
  const coMut = (await R('POST', '/api/companies', { name: 'Mutare SRL' })).j;
  const mut = await R('PUT', '/api/devices/company/bulk', { company_id: coMut.id, imeis: [imeis[1]] });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('„Mută între companii": ziua de pornire se șterge și aici (pornește la prima transmisie pe firma nouă)',
    mut.s === 200 && mut.j.moved === 1 && dev.company_id === coMut.id && dev.abonament_de_la === null, JSON.stringify({ r: mut.j, dev: { co: dev.company_id, de_la: dev.abonament_de_la } }));
  await R('POST', '/api/test/simulate', { imei: imeis[1] });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('…și pornește din nou la prima transmisie acolo', dev.abonament_de_la != null);

  // „Prima factură" din drumul clientului: o proformă singură NU o bifează.
  const co3 = (await R('POST', '/api/companies', { name: 'Doar Proformă SRL' })).j;
  const ct3 = await R('POST', '/api/companies/' + co3.id + '/contract', { months: 12 });
  await R('PUT', '/api/contracts/' + ct3.j.id, { status: 'activ', signed_at: Date.now() });
  await R('POST', '/api/devices', { imei: '869500000000009', name: 'P9', company_id: co3.id });
  await R('POST', '/api/invoices', { companyId: co3.id, tip: 'proforma', fel: 'unica', lines: [{ desc: 'Echipament — Teltonika FMC130', qty: 1, unitPrice: 279.32 }] });
  const d3 = ((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === ct3.j.id)[0] || {}).drum || {};
  const pasF = (d3.pasi || []).filter((p) => p.cheie === 'factura')[0] || {};
  T('drumul clientului: o proformă singură nu bifează „Prima factură"', pasF.stare && pasF.stare !== 'gata', JSON.stringify(pasF));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
