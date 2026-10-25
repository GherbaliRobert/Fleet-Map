// verify_efactura_anaf.js — XML-ul e-Factura (efactura.js) pentru un emitent NEPLĂTITOR de TVA, probat la validatorul ANAF.
//
//   node verify_efactura_anaf.js              (offline + validatorul public ANAF — cere internet)
//   node verify_efactura_anaf.js --fara-anaf  (doar partea offline; o spune pe față, nu „trece" în locul ANAF)
//
// DUO BUSINESS CONCEPT S.R.L., emitentul facturilor din ratrack.ro, NU e înregistrată în scopuri de TVA (regim special de
// scutire, art. 310 Cod fiscal). Generatorul scria pentru ea categoria „O" CU cotă pe rânduri, fără motivul de scutire în
// total și cu codurile de TVA ale părților — validatorul ANAF răspundea „nok" cu BR-O-02, BR-O-05 și BR-O-10 (25.10).
// Regulile corecte sunt cele din programul de facturare al DUO, al cărui XML trece validatorul (vezi efactura.js).
//
// Ce păzește proba:
//   1. forma XML-ului, offline: „O" fără cotă și cu VATEX-EU-O, fără coduri de TVA, CUI-ul fără „RO", mențiunea art. 310,
//      IBAN-ul; plătitorul de TVA tot cu „S" + cotă și „Z" la 0%;
//   2. județul și localitatea scoase din adresa clientului (ratrack ține adresa într-un singur text), sectorul la București;
//   3. ce NU pleacă: TVA la un neplătitor, total care nu bate cu rândurile, adresă fără județ / sector, firmă fără CUI;
//   4. fiecare caz trimis la validatorul public ANAF (nu în SPV — nu se depune nimic), cu `stare: ok` cerut; plus un martor:
//      XML-ul cu greșeala veche trebuie respins, ca să știm că validatorul chiar se uită.
// Validatorul nu răspunde → proba o spune clar și iese cu codul 2 (nu 0). Nu e în `npm test`: acolo nu ieșim pe internet.
'use strict';
const ef = require('./efactura.js');

const URL_VALIDATOR = 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1';
const FARA_ANAF = process.argv.includes('--fara-anaf');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// ─── Datele de probă: rândurile și totalurile scrise ca le scrie serverul (`_liniiNormalizate`, `_totaluri`) ───
function rand(desc, qty, pret, cota) {
  const net = Math.round(qty * pret * 100) / 100, vat = Math.round(net * cota) / 100;
  return { desc, qty, unitPrice: pret, vatRate: cota, net, vat, gross: Math.round((net + vat) * 100) / 100 };
}
// Baza de date dă sumele ca TEXT (NUMERIC), nu ca numere — le scriem la fel.
function factura(issuer, client, lines, extra) {
  const sub = Math.round(lines.reduce((s, l) => s + l.net, 0) * 100) / 100;
  const tva = Math.round(lines.reduce((s, l) => s + l.vat, 0) * 100) / 100;
  return Object.assign({
    full_number: 'RAT-2026-00042', type: 'invoice', currency: 'RON',
    issue_date: String(Date.UTC(2026, 9, 20, 9, 0)), due_date: String(Date.UTC(2026, 10, 4, 9, 0)),
    subtotal: sub.toFixed(2), vat_amount: tva.toFixed(2), total: (sub + tva).toFixed(2),
    lines, issuer, client, note: null,
  }, extra || {});
}
const DUO = (o) => Object.assign({ name: 'DUO BUSINESS CONCEPT S.R.L.', cui: '48718634', reg_com: 'J2023005685230',
  address: 'Str. Exemplu nr. 1', city: 'Pantelimon', county: 'RO-IF', iban: 'RO49 AAAA 1B31 0075 9384 0000', bank: 'Banca Exemplu',
  email: 'contact@ratrack.ro', vat_rate: 0, vat_payer: false }, o || {});
const FIRMA_TVA = (o) => Object.assign({ name: 'CLIENT EXEMPLU S.R.L.', cui: 'RO14399840', reg_com: 'J40/1234/2001',
  address: 'Str. Avram Iancu nr. 5, Cluj-Napoca, jud. Cluj', vat_payer: true }, o || {});
// CNP cu cifra de control corectă (ponderile 279146358279), ca validatorul să nu-l respingă pentru cifră.
function cnp(primele12) {
  const p = '279146358279'; let s = 0;
  for (let i = 0; i < 12; i++) s += Number(primele12[i]) * Number(p[i]);
  const c = s % 11; return primele12 + (c === 10 ? 1 : c);
}
const RANDURI_NEPLATITOR = [
  rand('Abonament monitorizare GPS — octombrie 2026', 3, 45, 0),
  rand('Montaj echipament GPS', 1, 150, 0),
];
const CAZURI = [
  { nume: 'neplătitor → firmă plătitoare de TVA', inv: factura(DUO(), FIRMA_TVA(), RANDURI_NEPLATITOR, { note: 'Montaj executat pe 15.10.2026 (1 mașină).' }) },
  { nume: 'neplătitor → persoană fizică fără CNP', inv: factura(DUO(), { name: 'Ion Popescu', address: 'Str. Lungă nr. 3, Brașov', is_person: true }, RANDURI_NEPLATITOR) },
  { nume: 'neplătitor → persoană fizică cu CNP', inv: factura(DUO(), { name: 'Maria Ionescu', cui: cnp('290010140001'), address: 'Str. Mare nr. 7, Pantelimon, jud. Ilfov', vat_payer: false }, RANDURI_NEPLATITOR) },
  { nume: 'neplătitor → client din București (sector, scris de mână)', inv: factura(DUO(), FIRMA_TVA({ name: 'TRANSPORT BUCUREȘTI S.R.L.', address: 'Bd. Unirii nr. 10, Sector 3, București' }), RANDURI_NEPLATITOR) },
  { nume: 'neplătitor → client din București (adresa cum vine de la ANAF)', inv: factura(DUO(), FIRMA_TVA({ name: 'LOGISTIC SRL', vat_payer: false, address: 'MUNICIPIUL BUCUREŞTI, SECTOR 6, STR. VALEA CASCADELOR, NR.21' }), RANDURI_NEPLATITOR) },
  { nume: 'plătitor de TVA, 21% și 11% pe aceeași factură', inv: factura(DUO({ vat_payer: true, vat_rate: 21 }), FIRMA_TVA(), [
    rand('Abonament monitorizare GPS — octombrie 2026', 3, 45, 21),
    rand('Serviciu la cota redusă', 2, 37.5, 11),
    rand('Montaj echipament GPS', 1, 150, 21),
  ]) },
  { nume: 'plătitor de TVA → client neplătitor, cu un rând la 0%', inv: factura(DUO({ vat_payer: true, vat_rate: 21 }), FIRMA_TVA({ vat_payer: false, address: 'JUD. ILFOV, ORŞ. PANTELIMON, STR. BISERICII, NR.5' }), [
    rand('Abonament monitorizare GPS — octombrie 2026', 2, 45, 21),
    rand('Rând scutit cu drept de deducere', 1, 80, 0),
  ]) },
];

// Ajutoare de citit XML-ul (e scris de noi, pe un singur rând, fără prefixe ciudate — regex-ul ajunge).
const elemente = (xml, tag) => xml.match(new RegExp('<' + tag + '[ >][\\s\\S]*?</' + tag + '>', 'g')) || [];
const texte = (xml, tag) => elemente(xml, tag).map((e) => e.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, ''));
const parte = (xml, rol) => elemente(xml, 'cac:' + rol)[0] || '';
const xmlDe = (inv) => { try { return ef.buildUBL(inv); } catch (e) { return 'EROARE: ' + e.message; } };
const eroareDe = (inv) => { try { ef.buildUBL(inv); return null; } catch (e) { return e.message; } };

sect('1. Neplătitor de TVA: categoria „O", fără cote și fără coduri de TVA');
for (const c of CAZURI.filter((x) => x.inv.issuer.vat_payer === false)) {
  const xml = xmlDe(c.inv), n = c.nume;
  T(n + ': se scrie', !xml.startsWith('EROARE'), xml.slice(0, 200));
  T(n + ': nicio cotă (BR-O-05)', !/<cbc:Percent>/.test(xml));
  T(n + ': toate rândurile „O"', elemente(xml, 'cac:ClassifiedTaxCategory').length === c.inv.lines.length &&
    elemente(xml, 'cac:ClassifiedTaxCategory').every((e) => /<cbc:ID>O<\/cbc:ID>/.test(e)));
  const sub = elemente(xml, 'cac:TaxSubtotal');
  T(n + ': un singur total „O", cu VATEX-EU-O (BR-O-10)', sub.length === 1 && /<cbc:ID>O<\/cbc:ID><cbc:TaxExemptionReasonCode>VATEX-EU-O</.test(sub[0]), sub.join(' '));
  T(n + ': niciun cod de TVA pe factură (BR-O-02)', !/PartyTaxScheme/.test(xml));
  T(n + ': TVA 0', texte(xml, 'cbc:TaxAmount').every((t) => t === '0.00'), texte(xml, 'cbc:TaxAmount').join(','));
  T(n + ': de plată = totalul fără TVA', texte(xml, 'cbc:PayableAmount')[0] === c.inv.subtotal, texte(xml, 'cbc:PayableAmount')[0]);
  T(n + ': emitentul = CUI-ul fără „RO"', /<cbc:CompanyID>48718634<\/cbc:CompanyID>/.test(parte(xml, 'AccountingSupplierParty')));
  T(n + ': mențiunea art. 310', texte(xml, 'cbc:Note').some((t) => /art\. 310 din Codul fiscal/.test(t)));
}
{
  const xml = xmlDe(CAZURI[0].inv);
  T('clientul firmă: CUI-ul fără „RO" la înregistrarea legală', /<cac:PartyLegalEntity><cbc:RegistrationName>CLIENT EXEMPLU S.R.L.<\/cbc:RegistrationName><cbc:CompanyID>14399840<\/cbc:CompanyID>/.test(xml));
  T('mențiunea facturii merge și ea ca notă, înaintea celei de scutire', texte(xml, 'cbc:Note').join(' | ') ===
    'Montaj executat pe 15.10.2026 (1 mașină). | Furnizorul nu este înregistrat în scopuri de TVA (regim special de scutire conform art. 310 din Codul fiscal).', texte(xml, 'cbc:Note').join(' | '));
  T('notele stau după tipul facturii, înaintea monedei (ordinea UBL)', /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode><cbc:Note>/.test(xml) && /<\/cbc:Note><cbc:DocumentCurrencyCode>/.test(xml));
  T('plata în cont: codul 42 și IBAN-ul fără spații', /<cbc:PaymentMeansCode>42<\/cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>RO49AAAA1B31007593840000<\/cbc:ID><cbc:Name>Banca Exemplu<\/cbc:Name>/.test(xml));
  T('emitentul: Pantelimon, RO-IF', /<cbc:CityName>Pantelimon<\/cbc:CityName><cbc:CountrySubentity>RO-IF</.test(parte(xml, 'AccountingSupplierParty')));
  T('clientul: Cluj-Napoca, RO-CJ (din adresă)', /<cbc:CityName>Cluj-Napoca<\/cbc:CityName><cbc:CountrySubentity>RO-CJ</.test(parte(xml, 'AccountingCustomerParty')));
  const xp = xmlDe(CAZURI[1].inv), xc = xmlDe(CAZURI[2].inv);
  T('persoana fizică fără CNP: 13 zerouri', /<cbc:CompanyID>0000000000000<\/cbc:CompanyID>/.test(parte(xp, 'AccountingCustomerParty')));
  T('persoana fizică cu CNP: CNP-ul', parte(xc, 'AccountingCustomerParty').includes('<cbc:CompanyID>' + CAZURI[2].inv.client.cui + '</cbc:CompanyID>'));
  T('București scris de mână: SECTOR3, RO-B', /<cbc:CityName>SECTOR3<\/cbc:CityName><cbc:CountrySubentity>RO-B</.test(parte(xmlDe(CAZURI[3].inv), 'AccountingCustomerParty')));
  T('București de la ANAF (cu „Ş"): SECTOR6, RO-B', /<cbc:CityName>SECTOR6<\/cbc:CityName><cbc:CountrySubentity>RO-B</.test(parte(xmlDe(CAZURI[4].inv), 'AccountingCustomerParty')));
}

sect('2. Plătitor de TVA: „S" cu cota, „Z" la 0%, codurile de TVA rămân');
{
  const xml = xmlDe(CAZURI[5].inv);
  const sub = elemente(xml, 'cac:TaxSubtotal');
  T('două totaluri: 21% apoi 11%', sub.length === 2 && /<cbc:ID>S<\/cbc:ID><cbc:Percent>21\.00</.test(sub[0]) && /<cbc:ID>S<\/cbc:ID><cbc:Percent>11\.00</.test(sub[1]), sub.join(' '));
  T('baza și TVA-ul pe cote: 285,00 / 59,85 și 75,00 / 8,25', /TaxableAmount currencyID="RON">285\.00<.*TaxAmount currencyID="RON">59\.85</.test(sub[0]) && /TaxableAmount currencyID="RON">75\.00<.*TaxAmount currencyID="RON">8\.25</.test(sub[1]), sub.join(' '));
  T('TVA total 68,10, de plată 428,10', /<cac:TaxTotal><cbc:TaxAmount currencyID="RON">68\.10</.test(xml) && texte(xml, 'cbc:PayableAmount')[0] === '428.10', texte(xml, 'cbc:PayableAmount')[0]);
  T('codul de TVA al emitentului: RO48718634', /<cac:PartyTaxScheme><cbc:CompanyID>RO48718634</.test(parte(xml, 'AccountingSupplierParty')));
  T('emitentul plătitor: Reg. Com. la înregistrarea legală', /<cbc:CompanyID>J2023005685230</.test(parte(xml, 'AccountingSupplierParty')));
  T('codul de TVA al clientului plătitor: RO14399840', /<cac:PartyTaxScheme><cbc:CompanyID>RO14399840</.test(parte(xml, 'AccountingCustomerParty')));
  T('fără mențiunea de scutire la plătitor', !/art\. 310/.test(xml));
  const xz = xmlDe(CAZURI[6].inv), subz = elemente(xz, 'cac:TaxSubtotal');
  T('rândul la 0%: „Z" cu cota 0, fără motiv de scutire', subz.length === 2 && /<cbc:ID>Z<\/cbc:ID><cbc:Percent>0\.00<\/cbc:Percent><cac:TaxScheme>/.test(subz[1]), subz.join(' '));
  T('nicio categorie „O" la plătitor', !/<cbc:ID>O<\/cbc:ID>/.test(xz));
  T('clientul neplătitor al unui plătitor: fără cod de TVA, cu CUI-ul', !/PartyTaxScheme/.test(parte(xz, 'AccountingCustomerParty')) && /<cbc:CompanyID>14399840</.test(parte(xz, 'AccountingCustomerParty')));
  T('adresa ANAF „JUD. ILFOV, ORŞ. PANTELIMON": PANTELIMON, RO-IF', /<cbc:CityName>PANTELIMON<\/cbc:CityName><cbc:CountrySubentity>RO-IF</.test(parte(xz, 'AccountingCustomerParty')), parte(xz, 'AccountingCustomerParty'));
}

sect('3. Județul și localitatea, din adresa clientului');
{
  const ADRESE = [
    ['Str. Avram Iancu 5, Cluj-Napoca, Cluj, 400000', 'Cluj-Napoca', 'RO-CJ'],
    ['Str. Bisericii, nr. 5, Oraş Pantelimon, Ilfov, 077145', 'Pantelimon', 'RO-IF'],
    ['JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. MEMORANDUMULUI, NR.28', 'CLUJ-NAPOCA', 'RO-CJ'],
    ['Str. Lungă 12, Iași', 'Iași', 'RO-IS'],
    ['Calea Victoriei 1, sector 1, Bucuresti', 'SECTOR1', 'RO-B'],
    ['Str. Mihai Viteazu 3, Pantelimon jud. Ilfov', 'Pantelimon', 'RO-IF'],
    ['Str. București nr. 5, Ploiești, județul Prahova', 'Ploiești', 'RO-PH'],
    ['Bd. Republicii 10, Satu Mare, jud. Satu Mare', 'Satu Mare', 'RO-SM'],
    ['Str. Gării 2, Bistrița, jud. Bistrița-Năsăud', 'Bistrița', 'RO-BN'],
    ['Str. Judecătoriei 4, Com. Florești, jud. Cluj', 'Florești', 'RO-CJ'],
  ];
  for (const [adr, oras, judet] of ADRESE) {
    const x = parte(xmlDe(factura(DUO(), FIRMA_TVA({ address: adr }), RANDURI_NEPLATITOR)), 'AccountingCustomerParty');
    T('„' + adr + '" → ' + oras + ', ' + judet, x.includes('<cbc:CityName>' + oras + '</cbc:CityName><cbc:CountrySubentity>' + judet + '</cbc:CountrySubentity>'), x.slice(0, 220));
  }
  // Emitentul: câmpurile din „Date emitent" bat adresa; județul scris ca nume, sectorul din câmpul de oraș.
  const em = (o) => parte(xmlDe(factura(DUO(o), FIRMA_TVA(), RANDURI_NEPLATITOR)), 'AccountingSupplierParty');
  T('emitentul cu județul scris ca nume („Ilfov")', /<cbc:CountrySubentity>RO-IF</.test(em({ county: 'Ilfov' })));
  T('emitentul fără județ, dar cu el în adresă', /<cbc:CityName>Pantelimon<\/cbc:CityName><cbc:CountrySubentity>RO-IF</.test(em({ county: '', city: '', address: 'Str. Exemplu 1, Pantelimon, jud. Ilfov' })));
  T('emitentul din București: „Sector 2" în câmpul de oraș → SECTOR2', /<cbc:CityName>SECTOR2<\/cbc:CityName><cbc:CountrySubentity>RO-B</.test(em({ county: 'RO-B', city: 'Sector 2' })));
}

sect('4. Ce NU pleacă (mai bine nicio e-Factura decât una greșită)');
{
  const cuTva = factura(DUO({ vat_rate: 21 }), FIRMA_TVA(), [rand('Abonament', 1, 100, 21)]);
  T('neplătitor cu TVA pe rânduri → refuz, spune de „Cotă TVA"', /nu e plătitor de TVA.*Cotă TVA/.test(eroareDe(cuTva) || ''), eroareDe(cuTva));
  const stricat = factura(DUO(), FIRMA_TVA(), RANDURI_NEPLATITOR, { total: '999.00' });
  T('total care nu bate cu rândurile → refuz', /nu se potrivește cu rândurile/.test(eroareDe(stricat) || ''), eroareDe(stricat));
  const faraJudet = factura(DUO(), FIRMA_TVA({ address: 'Str. Mare 5, Pantelimon' }), RANDURI_NEPLATITOR);
  T('adresa clientului fără județ → refuz (nu mai pleacă „RO-B, SECTOR1")', /clientului.*nu spune județul.*fișa firmei/.test(eroareDe(faraJudet) || ''), eroareDe(faraJudet));
  const faraSector = factura(DUO(), FIRMA_TVA({ address: 'Calea Victoriei 12, București' }), RANDURI_NEPLATITOR);
  T('București fără sector → refuz', /București, dar nu spune sectorul/.test(eroareDe(faraSector) || ''), eroareDe(faraSector));
  const faraCui = factura(DUO(), FIRMA_TVA({ cui: '' }), RANDURI_NEPLATITOR);
  T('firmă fără CUI → refuz (nu pleacă drept „persoană fizică")', /n-are CUI/.test(eroareDe(faraCui) || ''), eroareDe(faraCui));
  const emFaraJudet = factura(DUO({ county: '', address: 'Str. Exemplu 1' }), FIRMA_TVA(), RANDURI_NEPLATITOR);
  T('emitentul fără județ → refuz, spune de „Date emitent"', /emitentului.*Date emitent/.test(eroareDe(emFaraJudet) || ''), eroareDe(emFaraJudet));
}

sect('5. Ziua facturii pe ora României; numele lungi');
{
  // 24.10, 22:30 UTC = 25.10, 01:30 la noi. Pe hârtie scrie 25.10; serverul e pe UTC.
  const x = xmlDe(factura(DUO(), FIRMA_TVA(), RANDURI_NEPLATITOR, { issue_date: String(Date.UTC(2026, 9, 24, 22, 30)), due_date: String(Date.UTC(2026, 10, 8, 22, 30)) }));
  T('data emiterii = ziua din România', /<cbc:IssueDate>2026-10-25<\/cbc:IssueDate><cbc:DueDate>2026-11-09</.test(x), texte(x, 'cbc:IssueDate')[0]);
  const lung = 'Abonament monitorizare GPS cu agenți AI și RA Insight pentru toată flota clientului, perioada 01.10.2026 – 31.10.2026, 12 vehicule';
  const xl = xmlDe(factura(DUO(), FIRMA_TVA(), [rand(lung, 1, 100, 0)]));
  T('numele unui rând: cel mult 100 de caractere, întreg în descriere', texte(xl, 'cbc:Name').every((t) => t.length <= 100) && texte(xl, 'cbc:Description')[0] === lung);
}

// ─── Validatorul ANAF ───
async function laAnaf(xml) {
  const ctrl = new AbortController(), stop = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(URL_VALIDATOR, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: xml, signal: ctrl.signal });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    if (!r.ok || !j || !j.stare) return { indisponibil: 'HTTP ' + r.status + ' — ' + text.replace(/\s+/g, ' ').slice(0, 200) };
    return { stare: String(j.stare).toLowerCase(), mesaje: (j.Messages || []).map((m) => m.message || JSON.stringify(m)) };
  } catch (e) {
    return { indisponibil: e.name === 'AbortError' ? 'n-a răspuns în 30 de secunde' : (e.cause && e.cause.code) || e.message };
  } finally { clearTimeout(stop); }
}
const scurt = (m) => { const c = /codEroare=([^;]+)/.exec(m), t = /textEroare=([^;]+)/.exec(m); return c ? c[1] + ' ' + (t ? t[1].slice(0, 160) : '') : m.slice(0, 200); };

(async () => {
  let indisponibil = null;
  if (FARA_ANAF) {
    sect('6. Validatorul ANAF — NEÎNTREBAT (--fara-anaf). Proba de mai sus NU spune că ANAF primește XML-ul.');
  } else {
    sect('6. Validatorul public ANAF (' + URL_VALIDATOR + ')');
    for (const c of CAZURI) {
      const xml = xmlDe(c.inv);
      if (xml.startsWith('EROARE')) { T('ANAF · ' + c.nume + ': XML-ul nu s-a putut face', false, xml); continue; }
      const r = await laAnaf(xml);
      if (r.indisponibil) { indisponibil = r.indisponibil; break; }
      console.log('  ANAF · ' + c.nume + ': ' + r.stare);
      T('ANAF · ' + c.nume + ': stare ok', r.stare === 'ok', r.mesaje.map(scurt).join(' | '));
    }
    // Martorul: greșeala de dinainte de 25.10 (cotă pe rândurile „O") trebuie respinsă — altfel validatorul nu se uită.
    if (!indisponibil) {
      const vechi = xmlDe(CAZURI[0].inv).replace(/<cac:ClassifiedTaxCategory><cbc:ID>O<\/cbc:ID>/g, '<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cbc:Percent>0.00</cbc:Percent>');
      const r = await laAnaf(vechi);
      if (r.indisponibil) indisponibil = r.indisponibil;
      else {
        console.log('  ANAF · martor (cotă pe „O", ca înainte): ' + r.stare + (r.mesaje.length ? ' — ' + r.mesaje.map(scurt).map((m) => m.split(' ')[0]).join(', ') : ''));
        T('martor: ANAF respinge greșeala veche cu BR-O-05', r.stare === 'nok' && r.mesaje.some((m) => /BR-O-05/.test(m)), r.mesaje.map(scurt).join(' | '));
      }
    }
    if (indisponibil) {
      console.log('\n  ⚠ VALIDATORUL ANAF NU E ACCESIBIL: ' + indisponibil);
      console.log('  ⚠ Partea ANAF NU a rulat până la capăt — rezultatul de mai jos NU spune că XML-ul trece. Reia când ai internet.');
    }
  }
  console.log('\n' + ok + ' trecute, ' + rele + ' picate' + (indisponibil ? ', validatorul ANAF indisponibil' : '') + (FARA_ANAF ? ', fără ANAF (la cerere)' : '') + '.');
  process.exit(rele ? 1 : (indisponibil ? 2 : 0));
})();
