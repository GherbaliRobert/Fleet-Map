// efactura.js — client ANAF RO e-Factura (SPV). Generează factura UBL 2.1 (CIUS-RO) + upload/status/download.
// DORMANT până e setat ANAF_EFACTURA_TOKEN (OAuth din SPV cu certificat digital; refresh ~90 zile). Generarea
// XML (buildUBL) funcționează OFFLINE (fără token) — folosită la preview + validare pe mediul de TEST ANAF.
//
// CONFIG (env):
//   ANAF_EFACTURA_TOKEN — token OAuth (Bearer). FĂRĂ el → transport dormant (XML-ul se poate totuși genera/vedea).
//   ANAF_CIF            — CIF-ul firmei tale (emitent), fără „RO".
//   ANAF_EFACTURA_TEST  — 'true' (implicit) = mediul de TEST ANAF; 'false' = producție (după validare).

function base(test) { return test ? 'https://api.anaf.ro/test/FCTEL/rest' : 'https://api.anaf.ro/prod/FCTEL/rest'; }
function cfg() {
  return {
    token: process.env.ANAF_EFACTURA_TOKEN || null,
    cif: (process.env.ANAF_CIF || '').replace(/^RO/i, '').trim() || null,
    test: String(process.env.ANAF_EFACTURA_TEST || 'true') === 'true',
  };
}
function enabled() { return !!cfg().token; }

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function _num(n) { return _r2(n).toFixed(2); }
// Ziua facturii pe ora ROMÂNIEI, ca pe hârtie (factura_pdf.js). Serverul e pe UTC: o factură emisă la 01:30 (ora noastră)
// ieșea în XML cu ziua de ieri. Un singur formatator, ținut minte.
const _FMT_ZI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' });
function _date(ms) { return _FMT_ZI.format(new Date(Number(ms) || Date.now())); }

// ─── Vânzătorul NEPLĂTITOR de TVA (regim special de scutire, art. 310 Cod fiscal) ───
// Regulile EN 16931 BR-O-* (verificate la validatorul ANAF pe 25.10, ca în programul de facturare al DUO):
//   • categoria „O" (în afara TVA) pe TOATE rândurile și în total, FĂRĂ cotă (BR-O-05) — cu motivul VATEX-EU-O (BR-O-10);
//   • FĂRĂ niciun cod de TVA pe factură, nici al nostru, nici al clientului (BR-O-02): vânzătorul și clientul se
//     recunosc după CUI, scris fără „RO", la „înregistrarea legală";
//   • TVA 0 și mențiunea de scutire, ca notă pe factură.
// Plătitorul de TVA rămâne cum era: „S" cu cota (21 / 11), „Z" la cota 0.
const MENTIUNE_NEPLATITOR = 'Furnizorul nu este înregistrat în scopuri de TVA (regim special de scutire conform art. 310 din Codul fiscal).';
const CNP_NECUNOSCUT = '0000000000000';   // persoana fizică fără CNP (regula ANAF)

// ─── Locul unei părți: județul și localitatea ───
// CIUS-RO cere, pentru o adresă din România, județul ca cod ISO 3166-2 („RO-CJ") și, la București, localitatea ca
// „SECTOR1"…„SECTOR6". Emitentul are oraș și județ în „Date emitent"; clientul are doar ADRESA, într-un singur text — cum
// vine de la ANAF („MUNICIPIUL BUCUREŞTI, SECTOR 3, STR. …", „JUD. ILFOV, ORŞ. PANTELIMON, STR. …") sau scrisă de mână
// („Str. …, Cluj-Napoca, jud. Cluj"). Se iau întâi câmpurile, apoi adresa. Ce nu se poate afla NU se ghicește (până pe
// 25.10 orice client fără județ pleca „RO-B, SECTOR1"): factura nu pleacă, iar eroarea spune ce lipsește și unde se scrie.
const JUDETE = {
  'ALBA': 'AB', 'ARAD': 'AR', 'ARGES': 'AG', 'BACAU': 'BC', 'BIHOR': 'BH', 'BISTRITA NASAUD': 'BN', 'BOTOSANI': 'BT',
  'BRAILA': 'BR', 'BRASOV': 'BV', 'BUCURESTI': 'B', 'BUZAU': 'BZ', 'CALARASI': 'CL', 'CARAS SEVERIN': 'CS', 'CLUJ': 'CJ',
  'CONSTANTA': 'CT', 'COVASNA': 'CV', 'DAMBOVITA': 'DB', 'DOLJ': 'DJ', 'GALATI': 'GL', 'GIURGIU': 'GR', 'GORJ': 'GJ',
  'HARGHITA': 'HR', 'HUNEDOARA': 'HD', 'IALOMITA': 'IL', 'IASI': 'IS', 'ILFOV': 'IF', 'MARAMURES': 'MM', 'MEHEDINTI': 'MH',
  'MURES': 'MS', 'NEAMT': 'NT', 'OLT': 'OT', 'PRAHOVA': 'PH', 'SALAJ': 'SJ', 'SATU MARE': 'SM', 'SIBIU': 'SB',
  'SUCEAVA': 'SV', 'TELEORMAN': 'TR', 'TIMIS': 'TM', 'TULCEA': 'TL', 'VALCEA': 'VL', 'VASLUI': 'VS', 'VRANCEA': 'VN',
};
const CODURI_JUDET = new Set(Object.keys(JUDETE).map(function (k) { return JUDETE[k]; }));
// Fără diacritice (și cu sedilă: „Ş"), cu majuscule, spațiile strânse — doar pentru COMPARAT, nu pentru scris în XML.
function _fara(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
// „RO-CJ", „CJ", „Cluj", „jud. Cluj", „Județul Cluj", „Municipiul București" → „CJ" / „B"; altceva → null.
function _codJudet(v) {
  const t = _fara(v); if (!t) return null;
  const m = /^(?:RO-?)?([A-Z]{1,2})$/.exec(t);
  if (m && CODURI_JUDET.has(m[1])) return m[1];
  const nume = t.replace(/^(?:JUD(?:ETUL|\.)?|MUN(?:ICIPIUL|\.)?)\s*/, '').replace(/\s*-\s*/g, ' ').replace(/\.$/, '').trim();
  return JUDETE[nume] || null;
}
const _STRADA = /^(?:STR|STRADA|BD|BLD|BLVD|BULEVARDUL|B-DUL|CALEA|SOS|SOSEAUA|ALEEA|AL|PIATA|SPLAIUL|INTRAREA|DRUMUL|NR|BL|BLOC|SC|SCARA|ET|ETAJ|AP|CP|COD|CORP|LOT)\b/;
const _PREFIX_LOC = /^(?:mun(?:icipiul)?|or(?:a)?[sșş](?:ul)?|com(?:una)?|sat(?:ul)?|loc(?:alitatea)?)\.?\s+/i;
// Din adresa scrisă într-un singur text: { judet: 'CJ' | null, sector: '3' | null, localitate: 'Cluj-Napoca' | null }.
function _dinAdresa(text) {
  const brut = String(text == null ? '' : text).normalize('NFC').split(',').map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  const parti = brut.map(_fara);
  const out = { judet: null, sector: null, localitate: null };
  const ms = /\bSECT(?:OR(?:UL)?)?\.?\s*([1-6])\b/.exec(parti.join(', '));
  if (ms) out.sector = ms[1];
  let iJud = -1, peFata = false;
  // 1) „jud. X" / „județul X", oriunde într-o bucată (și cu ce urmează lipit: „jud. Ilfov 077145").
  for (let i = 0; i < parti.length && iJud < 0; i++) {
    const m = /\bJUD(?:ETUL|\.)?\s*([A-Z][A-Z\- ]*[A-Z])/.exec(parti[i]);
    if (!m) continue;
    const cuv = m[1].replace(/-/g, ' ').split(' ');
    for (let n = cuv.length; n > 0 && iJud < 0; n--) {
      const cod = JUDETE[cuv.slice(0, n).join(' ')];
      if (cod) { out.judet = cod; iJud = i; peFata = true; }
    }
    // „Pantelimon, jud. Ilfov" are localitatea în bucata de dinainte; „Pantelimon jud. Ilfov", în aceeași bucată.
    const inainte = brut[i].slice(0, brut[i].search(/\bjud/i)).trim();
    if (iJud === i && inainte && !_STRADA.test(_fara(inainte)) && !/\d/.test(inainte)) out.localitate = inainte.replace(_PREFIX_LOC, '');
  }
  // 2) O bucată care E un județ („…, Cluj" / „MUNICIPIUL BUCUREŞTI" / „București 030167").
  for (let i = 0; i < parti.length && iJud < 0; i++) {
    const cod = _codJudet(parti[i].replace(/\b\d+\b/g, ' '));
    if (cod) { out.judet = cod; iJud = i; }
  }
  // 3) Codul scris („RO-CJ"), apoi sectorul singur (e doar la București).
  if (!out.judet) { const mc = /\bRO-([A-Z]{1,2})\b/.exec(parti.join(', ')); if (mc && CODURI_JUDET.has(mc[1])) out.judet = mc[1]; }
  if (!out.judet && out.sector) out.judet = 'B';
  // Localitatea: o bucată cu „Mun." / „Orș." / „Com." / „Sat"; altfel bucata dinaintea județului, dacă nu e o stradă sau un
  // număr; altfel numele scris ca județ („Str. Lungă 5, Iași" — orașul și județul au același nume).
  if (!out.localitate) {
    for (let i = 0; i < brut.length && !out.localitate; i++) {
      if (i !== iJud && _PREFIX_LOC.test(brut[i]) && !/^\d/.test(brut[i].replace(_PREFIX_LOC, ''))) out.localitate = brut[i].replace(_PREFIX_LOC, '').trim();
    }
  }
  if (!out.localitate && iJud > 0 && !_STRADA.test(parti[iJud - 1]) && !/\d/.test(parti[iJud - 1])) out.localitate = brut[iJud - 1];
  if (!out.localitate && iJud >= 0 && !peFata) out.localitate = brut[iJud].replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim().replace(_PREFIX_LOC, '');
  return out;
}
// Locul de scris în XML: { tara, judet: 'RO-CJ' | null, oras }. `cine` = 'emitent' | 'client' (pentru mesajul de eroare).
function _locul(p, cine) {
  const tara = String(p.country || 'RO').trim().toUpperCase() || 'RO';
  const oras = String(p.city || '').replace(/\s+/g, ' ').trim();
  const dinAdresa = _dinAdresa(p.address), dinOras = _dinAdresa(oras);
  if (tara !== 'RO') return { tara: tara, judet: null, oras: oras || dinAdresa.localitate || '-' };
  const unde = cine === 'emitent' ? '„Date emitent" (Facturare)' : 'fișa firmei (Companii → firma → Detalii)';
  const al = cine === 'emitent' ? 'emitentului' : 'clientului';
  const adr = String(p.address || '').trim();
  const judet = _codJudet(p.county) || dinAdresa.judet || dinOras.judet;
  if (!judet) {
    throw new Error('Adresa ' + al + (adr ? ' („' + adr + '”)' : '') + ' nu spune județul, iar e-Factura îl cere. Scrie-o întreagă în ' + unde +
      ' — de ex. „Str. Exemplu 1, Cluj-Napoca, jud. Cluj” — și trimite din nou.');
  }
  if (judet === 'B') {
    const sector = dinOras.sector || dinAdresa.sector;
    if (!sector) throw new Error('Adresa ' + al + (adr ? ' („' + adr + '”)' : '') + ' e în București, dar nu spune sectorul (ex. „Sector 3”), iar e-Factura îl cere. Completează-l în ' + unde + '.');
    return { tara: tara, judet: 'RO-B', oras: 'SECTOR' + sector };
  }
  const loc = oras || dinAdresa.localitate;
  if (!loc) throw new Error('Adresa ' + al + (adr ? ' („' + adr + '”)' : '') + ' nu spune localitatea, iar e-Factura o cere. Scrie-o în ' + unde + ' — de ex. „Str. Exemplu 1, Cluj-Napoca, jud. Cluj”.');
  return { tara: tara, judet: 'RO-' + judet, oras: loc };
}

function _cif(v) { return String(v == null ? '' : v).replace(/\s+/g, '').replace(/^RO/i, ''); }
function _partea(p, loc, tvaId, idLegal) {
  return '<cac:PostalAddress>' +
      '<cbc:StreetName>' + _esc(String(p.address || '-').slice(0, 150)) + '</cbc:StreetName>' +
      '<cbc:CityName>' + _esc(loc.oras.slice(0, 50)) + '</cbc:CityName>' +
      (loc.judet ? '<cbc:CountrySubentity>' + loc.judet + '</cbc:CountrySubentity>' : '') +
      '<cac:Country><cbc:IdentificationCode>' + _esc(loc.tara) + '</cbc:IdentificationCode></cac:Country>' +
    '</cac:PostalAddress>' +
    (tvaId ? '<cac:PartyTaxScheme><cbc:CompanyID>' + _esc(tvaId) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>' : '') +
    '<cac:PartyLegalEntity><cbc:RegistrationName>' + _esc(String(p.name || '-').slice(0, 200)) + '</cbc:RegistrationName>' +
      (idLegal ? '<cbc:CompanyID>' + _esc(idLegal) + '</cbc:CompanyID>' : '') +
    '</cac:PartyLegalEntity>';
}
// Categoria de TVA a unui rând (`ClassifiedTaxCategory`) sau a unui total pe categorie (`TaxCategory`, cu motivul la „O").
function _categoria(tag, cat, cota) {
  return '<cac:' + tag + '><cbc:ID>' + cat + '</cbc:ID>' +
    (cat === 'O' ? (tag === 'TaxCategory' ? '<cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>' : '') : '<cbc:Percent>' + _num(cota) + '</cbc:Percent>') +
    '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:' + tag + '>';
}

// Construiește factura UBL 2.1 conformă CIUS-RO din `inv` (factura salvată: emitentul și clientul fotografiați la emitere,
// rândurile, totalurile). Aruncă o eroare pe înțeles când factura nu se poate scrie corect (județ lipsă, TVA la un
// neplătitor, total care nu bate cu rândurile) — mai bine nicio e-Factura decât una care spune altceva decât hârtia.
// Probat la validatorul public ANAF: `verify_efactura_anaf.js`.
function buildUBL(inv) {
  const iss = inv.issuer || {}, cl = inv.client || {};
  const cur = inv.currency || 'RON';
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  const nr = inv.full_number || 'fără număr';
  const neplatitor = iss.vat_payer === false;
  if (neplatitor && (lines.some(function (l) { return Number(l.vat) > 0; }) || Number(inv.vat_amount) > 0)) {
    throw new Error('Emitentul nu e plătitor de TVA, dar factura ' + nr + ' are TVA pe rânduri (' + _num(inv.vat_amount) + ' ' + cur +
      '). O factură fără TVA se emite cu „Cotă TVA” 0 în „Date emitent”.');
  }
  // Rândurile, cu categoria lor: la neplătitor „O" fără cotă; la plătitor „S" cu cota, „Z" la 0%.
  const linii = lines.map(function (l) {
    const cota = neplatitor ? 0 : (Number(l.vatRate) || 0);
    return { l: l, net: _r2(l.net), tva: neplatitor ? 0 : _r2(l.vat), cota: cota, cat: neplatitor ? 'O' : (cota > 0 ? 'S' : 'Z') };
  });
  // Totalul pe categorie și cotă (21% înaintea lui 11%, „Z" la urmă). TVA-ul categoriei = suma TVA-ului de pe rânduri, ca
  // pe hârtie; regula EN 16931 (BR-S-09) primește diferența de rotunjire.
  const grupe = [];
  linii.forEach(function (x) {
    let g = grupe.find(function (y) { return y.cat === x.cat && y.cota === x.cota; });
    if (!g) { g = { cat: x.cat, cota: x.cota, net: 0, tva: 0 }; grupe.push(g); }
    g.net = _r2(g.net + x.net); g.tva = _r2(g.tva + x.tva);
  });
  grupe.sort(function (a, b) { return b.cota - a.cota; });
  const net = _r2(linii.reduce(function (s, x) { return s + x.net; }, 0));
  const tva = _r2(grupe.reduce(function (s, g) { return s + g.tva; }, 0));
  const brut = _r2(net + tva);
  if (inv.total != null && Math.abs(_r2(inv.total) - brut) > 0.005) {
    throw new Error('Totalul facturii ' + nr + ' (' + _num(inv.total) + ' ' + cur + ') nu se potrivește cu rândurile ei (' + _num(brut) + ' ' + cur +
      '): e-Factura ar spune altă sumă decât hârtia.');
  }

  // Vânzătorul: plătitorul cu codul de TVA („RO…") și Reg. Com.; neplătitorul doar cu CUI-ul, fără „RO".
  const cuiEm = _cif(iss.cui);
  if (!cuiEm) throw new Error('Emitentul n-are CUI în „Date emitent" (Facturare) — e-Factura nu se poate face fără el.');
  const locEm = _locul(iss, 'emitent');
  const vanzator = neplatitor
    ? _partea(iss, locEm, null, cuiEm)
    : _partea(iss, locEm, (locEm.tara === 'RO' && /^\d+$/.test(cuiEm) ? 'RO' : '') + cuiEm, String(iss.reg_com || '').trim() || cuiEm);
  // Cumpărătorul: persoana fizică cu CNP-ul (sau 13 zerouri); firma cu codul de TVA doar dacă AMÂNDOI sunt plătitori
  // (BR-O-02), altfel cu CUI-ul, fără „RO". O firmă fără CUI nu se poate recunoaște la ANAF: factura nu pleacă.
  const cuiCl = _cif(cl.cui);
  const persoana = cl.is_person === true || /^\d{13}$/.test(cuiCl);
  const locCl = _locul(cl, 'client');
  let cumparator;
  if (persoana) cumparator = _partea(cl, locCl, null, /^\d{13}$/.test(cuiCl) ? cuiCl : CNP_NECUNOSCUT);
  else {
    if (!cuiCl) throw new Error('Clientul „' + (cl.name || '—') + '” n-are CUI în fișa firmei — e-Factura nu se poate face fără el.');
    cumparator = (!neplatitor && cl.vat_payer !== false)
      ? _partea(cl, locCl, (locCl.tara === 'RO' && /^\d+$/.test(cuiCl) ? 'RO' : '') + cuiCl, String(cl.reg_com || '').trim() || cuiCl)
      : _partea(cl, locCl, null, cuiCl);
  }
  // Notele: mențiunile facturii (un rând = o notă) și, la neplătitor, mențiunea de scutire. CIUS-RO: cel mult 20, de câte 300.
  const note = String(inv.note || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, neplatitor ? 19 : 20);
  if (neplatitor) note.push(MENTIUNE_NEPLATITOR);

  const subtotaluri = grupe.map(function (g) {
    return '<cac:TaxSubtotal><cbc:TaxableAmount currencyID="' + cur + '">' + _num(g.net) + '</cbc:TaxableAmount>' +
      '<cbc:TaxAmount currencyID="' + cur + '">' + _num(g.tva) + '</cbc:TaxAmount>' + _categoria('TaxCategory', g.cat, g.cota) + '</cac:TaxSubtotal>';
  }).join('');
  const randuri = linii.map(function (x, i) {
    const l = x.l, nume = String(l.desc || '-').trim() || '-';
    return '<cac:InvoiceLine><cbc:ID>' + (i + 1) + '</cbc:ID>' +
      '<cbc:InvoicedQuantity unitCode="C62">' + (Number(l.qty) || 0) + '</cbc:InvoicedQuantity>' +
      '<cbc:LineExtensionAmount currencyID="' + cur + '">' + _num(x.net) + '</cbc:LineExtensionAmount>' +
      // Numele are cel mult 100 de caractere (CIUS-RO); unul mai lung merge întreg în descriere.
      '<cac:Item>' + (nume.length > 100 ? '<cbc:Description>' + _esc(nume.slice(0, 200)) + '</cbc:Description>' : '') +
        '<cbc:Name>' + _esc(nume.slice(0, 100)) + '</cbc:Name>' + _categoria('ClassifiedTaxCategory', x.cat, x.cota) + '</cac:Item>' +
      '<cac:Price><cbc:PriceAmount currencyID="' + cur + '">' + _num(l.unitPrice) + '</cbc:PriceAmount></cac:Price></cac:InvoiceLine>';
  }).join('');
  const iban = String(iss.iban || '').replace(/\s+/g, '');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">' +
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>' +
    '<cbc:ID>' + _esc(inv.full_number || '') + '</cbc:ID>' +
    '<cbc:IssueDate>' + _date(inv.issue_date) + '</cbc:IssueDate>' +
    (inv.due_date ? '<cbc:DueDate>' + _date(inv.due_date) + '</cbc:DueDate>' : '') +
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>' +
    note.map(function (n) { return '<cbc:Note>' + _esc(n.slice(0, 300)) + '</cbc:Note>'; }).join('') +
    '<cbc:DocumentCurrencyCode>' + cur + '</cbc:DocumentCurrencyCode>' +
    '<cac:AccountingSupplierParty><cac:Party>' + vanzator + '</cac:Party></cac:AccountingSupplierParty>' +
    '<cac:AccountingCustomerParty><cac:Party>' + cumparator + '</cac:Party></cac:AccountingCustomerParty>' +
    (iban ? '<cac:PaymentMeans><cbc:PaymentMeansCode>42</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>' + _esc(iban) + '</cbc:ID>' +
      (iss.bank ? '<cbc:Name>' + _esc(iss.bank) + '</cbc:Name>' : '') + '</cac:PayeeFinancialAccount></cac:PaymentMeans>' : '') +
    '<cac:TaxTotal><cbc:TaxAmount currencyID="' + cur + '">' + _num(tva) + '</cbc:TaxAmount>' + subtotaluri + '</cac:TaxTotal>' +
    '<cac:LegalMonetaryTotal>' +
      '<cbc:LineExtensionAmount currencyID="' + cur + '">' + _num(net) + '</cbc:LineExtensionAmount>' +
      '<cbc:TaxExclusiveAmount currencyID="' + cur + '">' + _num(net) + '</cbc:TaxExclusiveAmount>' +
      '<cbc:TaxInclusiveAmount currencyID="' + cur + '">' + _num(brut) + '</cbc:TaxInclusiveAmount>' +
      '<cbc:PayableAmount currencyID="' + cur + '">' + _num(brut) + '</cbc:PayableAmount>' +
    '</cac:LegalMonetaryTotal>' +
    randuri +
    '</Invoice>';
}

// ─── Transport SPV (Bearer OAuth). Toate întorc { ok, ... } — dormant fără token. ───
async function _req(method, path, test, extraHeaders, body) {
  const c = cfg();
  const headers = Object.assign({ Authorization: 'Bearer ' + c.token }, extraHeaders || {});
  const res = await fetch(base(test) + path, { method: method, headers: headers, body: body });
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, buf: buf, text: buf.toString('utf8') };
}
// Upload UBL → index_incarcare. inv = invoice; opts.cif override.
async function uploadInvoice(inv, opts) {
  const c = cfg(); opts = opts || {};
  if (!c.token) return { ok: false, error: 'ANAF_EFACTURA_TOKEN nesetat (integrarea e dormantă)' };
  const cif = (opts.cif || c.cif); if (!cif) return { ok: false, error: 'ANAF_CIF nesetat' };
  try {
    const xml = buildUBL(inv);
    const r = await _req('POST', '/upload?standard=UBL&cif=' + encodeURIComponent(cif), c.test, { 'Content-Type': 'text/plain' }, xml);
    const idm = r.text.match(/index_incarcare\s*=\s*"(\d+)"/i);
    if (idm) return { ok: true, index: idm[1], raw: r.text };
    const err = (r.text.match(/errorMessage\s*=\s*"([^"]+)"/i) || [])[1];
    return { ok: false, error: err || ('ANAF HTTP ' + r.status), raw: r.text.slice(0, 500) };
  } catch (e) { return { ok: false, error: e.message }; }
}
// Starea unei încărcări → { stare: 'in prelucrare'|'ok'|'nok', idDescarcare }.
async function checkStatus(index, opts) {
  const c = cfg(); opts = opts || {};
  if (!c.token) return { ok: false, error: 'dormant' };
  try {
    const r = await _req('GET', '/stareMesaj?id_incarcare=' + encodeURIComponent(index), c.test);
    const stare = (r.text.match(/stare\s*=\s*"([^"]+)"/i) || [])[1] || null;
    const idDesc = (r.text.match(/id_descarcare\s*=\s*"(\d+)"/i) || [])[1] || null;
    return { ok: true, stare: stare, idDescarcare: idDesc, raw: r.text.slice(0, 500) };
  } catch (e) { return { ok: false, error: e.message }; }
}
// Descarcă ZIP-ul semnat de ANAF (XML original + semnătura). Întoarce buffer.
async function download(idDescarcare, opts) {
  const c = cfg();
  if (!c.token) return { ok: false, error: 'dormant' };
  try { const r = await _req('GET', '/descarcare?id=' + encodeURIComponent(idDescarcare), c.test); return { ok: r.ok, buf: r.buf, status: r.status }; }
  catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { buildUBL, uploadInvoice, checkStatus, download, enabled, cfg };
