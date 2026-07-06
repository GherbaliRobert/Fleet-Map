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
function _num(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
function _date(ms) { const d = new Date(Number(ms) || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// Cod județ ISO 3166-2:RO (ex. „B"→„RO-B", „CJ"→„RO-CJ", „RO-IF" rămâne). Implicit RO-B (București).
function _county(c) {
  let v = String(c || '').trim().toUpperCase();
  if (!v) return 'RO-B';
  if (/^RO-[A-Z]{1,2}$/.test(v)) return v;
  return 'RO-' + v.replace(/^RO-?/, '');
}

// Construiește factura UBL 2.1 conformă CIUS-RO din `inv` (invoice cu issuer + client snapshots + lines + totaluri).
// SCHEMĂ DE VALIDAT pe mediul de TEST ANAF (validatorul CIUS-RO) — structura urmează specificația, dar pot fi ajustări.
function buildUBL(inv) {
  const iss = inv.issuer || {}, cl = inv.client || {};
  const cur = inv.currency || 'RON';
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  // TaxSubtotal per cotă de TVA (CIUS-RO grupează pe cotă).
  const byRate = {};
  lines.forEach(function (l) { const r = Number(l.vatRate) || 0; if (!byRate[r]) byRate[r] = { net: 0, vat: 0 }; byRate[r].net += Number(l.net) || 0; byRate[r].vat += Number(l.vat) || 0; });
  const supplierVat = (iss.vat_payer !== false && iss.cui) ? ('RO' + String(iss.cui).replace(/^RO/i, '')) : null;
  const clientVat = (cl.vat_payer !== false && cl.cui) ? ('RO' + String(cl.cui).replace(/^RO/i, '')) : null;
  const party = function (p, vatId) {
    const legalId = String(p.reg_com || p.cui || '').replace(/^RO/i, '') || '-';
    return '<cac:PostalAddress>' +
        '<cbc:StreetName>' + _esc(p.address || '-') + '</cbc:StreetName>' +
        '<cbc:CityName>' + _esc(p.city || 'SECTOR1') + '</cbc:CityName>' +
        '<cbc:CountrySubentity>' + _county(p.county) + '</cbc:CountrySubentity>' +
        '<cac:Country><cbc:IdentificationCode>' + _esc(p.country || 'RO') + '</cbc:IdentificationCode></cac:Country>' +
      '</cac:PostalAddress>' +
      (vatId ? '<cac:PartyTaxScheme><cbc:CompanyID>' + _esc(vatId) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>' : '') +
      '<cac:PartyLegalEntity><cbc:RegistrationName>' + _esc(p.name || '-') + '</cbc:RegistrationName>' +
        '<cbc:CompanyID>' + _esc(legalId) + '</cbc:CompanyID>' +
      '</cac:PartyLegalEntity>';
  };
  const taxSubtotals = Object.keys(byRate).map(function (r) {
    const b = byRate[r], hasVat = Number(r) > 0;
    return '<cac:TaxSubtotal><cbc:TaxableAmount currencyID="' + cur + '">' + _num(b.net) + '</cbc:TaxableAmount>' +
      '<cbc:TaxAmount currencyID="' + cur + '">' + _num(b.vat) + '</cbc:TaxAmount>' +
      '<cac:TaxCategory><cbc:ID>' + (hasVat ? 'S' : 'O') + '</cbc:ID><cbc:Percent>' + _num(r) + '</cbc:Percent>' +
      '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>';
  }).join('');
  const invLines = lines.map(function (l, i) {
    const r = Number(l.vatRate) || 0;
    return '<cac:InvoiceLine><cbc:ID>' + (i + 1) + '</cbc:ID>' +
      '<cbc:InvoicedQuantity unitCode="C62">' + (Number(l.qty) || 0) + '</cbc:InvoicedQuantity>' +
      '<cbc:LineExtensionAmount currencyID="' + cur + '">' + _num(l.net) + '</cbc:LineExtensionAmount>' +
      '<cac:Item><cbc:Name>' + _esc((l.desc || '-').slice(0, 200)) + '</cbc:Name>' +
        '<cac:ClassifiedTaxCategory><cbc:ID>' + (r > 0 ? 'S' : 'O') + '</cbc:ID><cbc:Percent>' + _num(r) + '</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>' +
      '<cac:Price><cbc:PriceAmount currencyID="' + cur + '">' + _num(l.unitPrice) + '</cbc:PriceAmount></cac:Price></cac:InvoiceLine>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">' +
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>' +
    '<cbc:ID>' + _esc(inv.full_number || '') + '</cbc:ID>' +
    '<cbc:IssueDate>' + _date(inv.issue_date) + '</cbc:IssueDate>' +
    (inv.due_date ? '<cbc:DueDate>' + _date(inv.due_date) + '</cbc:DueDate>' : '') +
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>' +
    '<cbc:DocumentCurrencyCode>' + cur + '</cbc:DocumentCurrencyCode>' +
    '<cac:AccountingSupplierParty><cac:Party>' + party(iss, supplierVat) + '</cac:Party></cac:AccountingSupplierParty>' +
    '<cac:AccountingCustomerParty><cac:Party>' + party(cl, clientVat) + '</cac:Party></cac:AccountingCustomerParty>' +
    (iss.iban ? '<cac:PaymentMeans><cbc:PaymentMeansCode>42</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>' + _esc(iss.iban) + '</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>' : '') +
    '<cac:TaxTotal><cbc:TaxAmount currencyID="' + cur + '">' + _num(inv.vat_amount) + '</cbc:TaxAmount>' + taxSubtotals + '</cac:TaxTotal>' +
    '<cac:LegalMonetaryTotal>' +
      '<cbc:LineExtensionAmount currencyID="' + cur + '">' + _num(inv.subtotal) + '</cbc:LineExtensionAmount>' +
      '<cbc:TaxExclusiveAmount currencyID="' + cur + '">' + _num(inv.subtotal) + '</cbc:TaxExclusiveAmount>' +
      '<cbc:TaxInclusiveAmount currencyID="' + cur + '">' + _num(inv.total) + '</cbc:TaxInclusiveAmount>' +
      '<cbc:PayableAmount currencyID="' + cur + '">' + _num(inv.total) + '</cbc:PayableAmount>' +
    '</cac:LegalMonetaryTotal>' +
    invLines +
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
