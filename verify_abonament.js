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
  T('un rând pe zile: aceeași cantitate, valoarea × fracția, rotunjit la ban', sc.qty === 2 && sc.net === 63.87 && sc.unitPrice === 31.94 && sc.vat === 12.14, JSON.stringify(sc));
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
  T('+ cele montate pe 10 oct.: 10 × 45 × 22/31 = 319,35 lei', z10 && z10.qty === 10 && z10.net === 319.35, JSON.stringify(z10));
  const z14 = p.lines.filter((l) => /14–31\.10\.2026 \(18 zile\)/.test(l.desc))[0];
  T('+ cele montate pe 14 oct.: 18 zile („18 zile", fără „de")', z14 && z14.qty === 10 && z14.net === 261.29, JSON.stringify(z14));
  T('octombrie pe zile = 1.451,61 lei, noiembrie = 2.250 lei', Math.abs(p.subtotal - (2250 + 1451.61)) < 0.02, p.subtotal);
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
  T('ecranul spune câte aparate de pe firmă nu transmit încă (și de ce nu intră)', /nu transmit încă: nu intră pe factură/.test(modal));
  T('și avertizează când luna e deja facturată', /Luna asta e deja facturată/.test(modal));
  T('emiterea trimite felul, luna, tipul și lucrările', /fel: _giState\.fel, luna: _giState\.luna, tip: _giState\.fel === 'unica' \? _giTip : 'invoice', lines: lines, montaje:/.test(html));
  T('„Prima factură" din drumul clientului deschide factura unică', /raxOpenGenInvoice\(companyId, 'unica'\)/.test(html));
  T('proforma nu are buton de ANAF și se „încasează", nu se „plătește"', /if \(!pf && v\.status !== 'canceled' && v\.efactura_status !== 'validated'\)/.test(html) && /Încasată — emite factura fiscală/.test(html));
  T('hârtia proformei scrie „FACTURĂ PROFORMĂ" și că nu e document fiscal', /'FACTURĂ PROFORMĂ'/.test(html) && /Document fără valoare fiscală/.test(html));
  T('trecerea în bloc stă în „Neasignate" — adopția rămâne într-un singur loc', /gr\.k === '_neas' \? _raxDevBaraBloc\(gr\.dev\)/.test(html) && (html.match(/\/api\/devices\/company-bulk/g) || []).length === 1);
  T('pe server, unul sau mai mulți trec prin aceeași funcție', (server.match(/await _trecePeFirma\(req, /g) || []).length === 2);
  T('rândul aparatului arată din ce zi plătește clientul, cu corectură', /abonament din ' \+ new Date\(Number\(d\.abonament_de_la\)\)/.test(html) && /raxDevAbonament\(/.test(html));
  T('clientul vede DOCUMENTELE adevărate, nu plăți cu numere inventate', !/function _raxInvNo\(/.test(html) && /_invFiscalHtml\(f, \(_myInvData && _myInvData\.issuer\)/.test(html));
  T('„Prima factură" din drum numără facturi FISCALE, nu proforme', /AND type IS DISTINCT FROM 'proforma' GROUP BY company_id/.test(dbjs));
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
  return async (m, url, body) => {
    const x = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await x.json(); } catch (e) {}
    return { s: x.status, j: j };
  };
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

  // Proforma: serie proprie, fără ANAF, fără „prima factură", la încasare → factură fiscală plătită.
  const pf = await R('POST', '/api/invoices', { companyId: co.id, tip: 'proforma', fel: 'unica', lines: dc.aparate });
  T('proforma are seria ei (PF-…), nu ia numere din șirul facturilor', pf.s === 200 && /^PF-\d{4}-\d{5}$/.test(pf.j.invoice.full_number) && pf.j.invoice.type === 'proforma', pf.j && pf.j.invoice && pf.j.invoice.full_number);
  T('proforma nu se trimite la ANAF și n-are XML', (await R('POST', '/api/invoices/' + pf.j.invoice.id + '/efactura')).s >= 400 && (await R('GET', '/api/invoices/' + pf.j.invoice.id + '/efactura/xml')).s >= 400);
  const inc = await R('PUT', '/api/invoices/' + pf.j.invoice.id + '/status', { status: 'paid' });
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

  // Mutarea pe altă firmă: abonamentul pornește din nou.
  const co2 = (await R('POST', '/api/companies', { name: 'Alt Client SRL' })).j;
  await R('PUT', '/api/devices/' + imeis[1] + '/company', { company_id: co2.id });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('mutat pe altă firmă → ziua de pornire se șterge (pornește la prima transmisie acolo)', dev.company_id === co2.id && dev.abonament_de_la === null, JSON.stringify(dev));
  await R('POST', '/api/test/simulate', { imei: imeis[1] });
  dev = ((await R('GET', '/api/admin/devices')).j || []).filter((x) => x.imei === imeis[1])[0] || {};
  T('…și pornește din nou la prima transmisie pe firma nouă', dev.abonament_de_la != null);

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
