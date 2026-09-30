// factura_pdf.js — factura și proforma, ca fișier PDF făcut pe server (Alin, 30.09: „de acord, apucă-te").
//
// Până atunci, factura se deschidea într-o fereastră de printare (HTML) din care omul își salva singur un PDF —
// cu numele pe care îl alegea el și cu fontul pe care îl avea browserul. Acum se face aici, ca oferta
// (`report_export.js`) și contractul (`contract_pdf.js`): logo-ul casei pentru fundal alb, fonturile cu
// diacritice și numele „RA-Tracks - Factură RAT-2027-00002 - Transport SRL.pdf". Aceeași hârtie pleacă și
// atașată la email (`server.js` → trimiterea facturii), deci ce vede clientul pe email, în „Facturile mele"
// și ce descărcăm noi e UNUL și același fișier.
//
// Fișierul e CURAT: primește factura (cu emitentul și clientul „înghețați" în ea la emitere) și o desenează.
// Nu atinge baza și nu știe de rute.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const VERDE = '#16a34a', VERDE_INCHIS = '#15803d', VERDE_FUNDAL = '#f0fdf4';
const TEXT = '#1a2235', GRI = '#64748b', GRI_TEXT = '#475569', LINIE = '#e2e8f0', FUNDAL = '#f8fafc', RAND = '#fafcff';
const PORTOCALIU = '#c2410c';   // doar pe previzualizare: să nu poată fi luată drept document emis

let _logoBuf = null, _logoTried = false;
// „logo-light.png" e varianta ÎNCHISĂ (pentru fundal deschis) — pe hârtie albă asta se vede (regula casei).
function _logo() {
  if (!_logoTried) { _logoTried = true; try { _logoBuf = fs.readFileSync(path.join(__dirname, 'public', 'logo-light.png')); } catch (e) { _logoBuf = null; } }
  return _logoBuf;
}
// Emiterea și scadența sunt CLIPE: se scriu cu ora României.
function _data(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
}
// Capetele perioadei sunt ZILE din calendar, socotite de server în ora lui (UTC: `process.env.TZ = 'UTC'`):
// sfârșitul lui februarie e 28.02, ora 23:59:59 UTC — care în ora României ar fi deja 01.03. Se scriu în UTC.
function _ziCalendar(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'UTC' });
}
// Sumele se scriu românește: 1.966,90 (punctul e separator de mii). Niciodată prin `toFixed`.
function _bani(n) {
  return (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// CUI-ul, cum se scrie pe factură: cu „RO" în față DOAR la o firmă plătitoare de TVA (atunci e codul ei de TVA),
// fără „RO" la una neplătitoare. Plătitoare = orice în afară de un `false` explicit (așa e și în baza de date).
// Până pe 30.09 se scria exact ce se tastase, iar TVA-ul adus de la ANAF nu se salva nicăieri.
function cuiAfisat(cui, platitorTva) {
  const cifre = String(cui == null ? '' : cui).replace(/\s+/g, '').replace(/^RO/i, '');
  if (!cifre) return null;
  return (platitorTva === false ? '' : 'RO') + cifre;
}

// Numele fișierului, după regula casei (ca rapoartele, ofertele și contractele):
// „RA-Tracks - Factură RAT-2027-00002 - Transport SRL.pdf" / „RA-Tracks - Proformă PF-2027-00001 - …".
// Caracterele interzise în numele de fișier se scot din TOT numele.
function numeFisier(inv) {
  const curat = function (t) { return String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); };
  const cl = (inv && _json(inv.client)) || {};
  const fel = inv && inv.type === 'proforma' ? 'Proformă' : 'Factură';
  const nr = curat(inv && inv.full_number) || 'fără număr';
  const cine = curat(cl.name || (inv && inv.company_name));
  return 'RA-Tracks - ' + fel + ' ' + nr + (cine ? ' - ' + cine : '') + '.pdf';
}

// ⚠ Regula casei (contract_pdf.js): pdfkit ține minte ultima poziție scrisă. FIECARE scriere de aici își dă
// explicit x-ul și lățimea, ca nimic să nu pornească din coloana în care s-a scris ultima dată.
function _ST(doc) { const left = doc.page.margins.left; return { left: left, w: doc.page.width - left - doc.page.margins.right }; }
function _jos(doc) { return doc.page.height - doc.page.margins.bottom; }

// Desenează factura pe un document pdfkit (sau pe orice obiect cu aceleași metode — așa o citește proba).
//   inv: rândul facturii, cu `issuer` și `client` înghețați la emitere, `lines`, totaluri, `note`, `fel`, `type`
//   emitentAcum: „Date emitent" de azi, DOAR ca rezervă pentru facturile vechi fără emitent înghețat
// Coloanele JSON pot veni din bază și ca text (după motor): le citim oricum ar veni.
function _json(v) { if (v && typeof v === 'object') return v; if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch (e) {} } return null; }
function scrieFactura(doc, inv, emitentAcum) {
  inv = inv || {};
  const iss = _json(inv.issuer) || emitentAcum || {};
  const cl = _json(inv.client) || {};
  const linii = Array.isArray(_json(inv.lines)) ? _json(inv.lines) : [];
  const pf = inv.type === 'proforma';
  const { left, w } = _ST(doc);
  const sus = doc.page.margins.top;

  // ── Capul: logo-ul la stânga, felul documentului, numărul și datele la dreapta ──
  const lg = _logo();
  if (lg) { try { doc.image(lg, left, sus, { height: 30 }); } catch (e) {} }
  doc.font('Nunito-Bold').fontSize(7.5).fillColor(GRI).text('MONITORIZARE GPS FLOTĂ', left, sus + 36, { width: 220, characterSpacing: 1 });
  doc.font('Nunito-Bold').fontSize(9).fillColor(GRI).text(pf ? 'FACTURĂ PROFORMĂ' : 'FACTURĂ FISCALĂ', left, sus, { width: w, align: 'right', characterSpacing: 0.5 });
  // Previzualizarea (30.09): aceeași hârtie, fără număr — numărul se ia abia la emitere, ca șirul să nu aibă găuri.
  if (inv.previzualizare) doc.font('Nunito-Bold').fontSize(15).fillColor(PORTOCALIU).text('PREVIZUALIZARE', left, sus + 13, { width: w, align: 'right', characterSpacing: 0.5 });
  else doc.font('Nunito-Bold').fontSize(17).fillColor(TEXT).text(inv.full_number || '—', left, sus + 12, { width: w, align: 'right' });
  doc.font('Nunito').fontSize(9).fillColor(GRI).text('Data emiterii: ' + _data(inv.issue_date), left, sus + 35, { width: w, align: 'right' });
  if (inv.due_date) doc.font('Nunito').fontSize(9).fillColor(GRI).text('Scadență: ' + _data(inv.due_date), left, sus + 47, { width: w, align: 'right' });
  const yLinie = sus + 64;
  doc.moveTo(left, yLinie).lineTo(left + w, yLinie).strokeColor(VERDE).lineWidth(2.5).stroke();

  // ── Părțile: două casete de aceeași înălțime ──
  const gap = 14, bw = (w - gap) / 2, pad = 12, y0 = yLinie + 16;
  const tva = iss.vat_rate != null ? iss.vat_rate : (linii[0] && linii[0].vatRate != null ? linii[0].vatRate : 19);
  const furnizor = [
    iss.cui ? 'CUI: ' + cuiAfisat(iss.cui, iss.vat_payer) + (iss.reg_com ? ' · Reg. Com.: ' + iss.reg_com : '') : null,
    iss.address || null,
    iss.iban ? 'IBAN: ' + iss.iban + (iss.bank ? ' · ' + iss.bank : '') : null,
    'TVA: ' + tva + '%' + (iss.vat_payer === false ? ' · neplătitor de TVA' : ' · plătitor de TVA')
  ].filter(Boolean);
  const client = [
    cl.cui ? 'CUI: ' + cuiAfisat(cl.cui, cl.vat_payer) + (cl.reg_com ? ' · Reg. Com.: ' + cl.reg_com : '') : null,
    cl.address || null,
    cl.email || null,
    cl.phone ? 'Tel: ' + cl.phone : null
  ].filter(Boolean);
  const inaltime = function (nume, randuri) {
    doc.font('Nunito-Bold').fontSize(11);
    let h = pad + 12 + doc.heightOfString(nume || '—', { width: bw - 2 * pad }) + 3;
    doc.font('Nunito').fontSize(8.5);
    randuri.forEach(function (r) { h += doc.heightOfString(r, { width: bw - 2 * pad }) + 2; });
    return h + pad;
  };
  const numeFurnizor = iss.name || '(completează „Date emitent")';
  const numeClient = cl.name || inv.company_name || '—';
  const hBox = Math.max(inaltime(numeFurnizor, furnizor), inaltime(numeClient, client));
  const caseta = function (x, eticheta, nume, randuri) {
    doc.roundedRect(x, y0, bw, hBox, 8).lineWidth(1).fillAndStroke(FUNDAL, LINIE);
    doc.font('Nunito-Bold').fontSize(7.5).fillColor(GRI).text(eticheta, x + pad, y0 + pad, { width: bw - 2 * pad, characterSpacing: 0.6 });
    doc.font('Nunito-Bold').fontSize(11).fillColor(TEXT).text(nume, x + pad, y0 + pad + 12, { width: bw - 2 * pad });
    let y = doc.y + 3;
    randuri.forEach(function (r) {
      doc.font('Nunito').fontSize(8.5).fillColor(GRI_TEXT).text(r, x + pad, y, { width: bw - 2 * pad });
      y = doc.y + 2;
    });
  };
  caseta(left, 'FURNIZOR (EMITENT)', numeFurnizor, furnizor);
  caseta(left + bw + gap, 'CLIENT (BENEFICIAR)', numeClient, client);

  // ── Rândurile ──
  const col = [
    { k: 'nr', et: '#', w: 22, al: 'left' },
    { k: 'desc', et: 'DESCRIERE', w: 0, al: 'left' },
    { k: 'qty', et: 'CANT.', w: 40, al: 'center' },
    { k: 'pu', et: 'PREȚ UNITAR', w: 78, al: 'right' },
    { k: 'net', et: 'VALOARE', w: 72, al: 'right' },
    { k: 'vr', et: 'TVA %', w: 44, al: 'center' },
    { k: 'vat', et: 'TVA', w: 62, al: 'right' }
  ];
  col[1].w = w - col.reduce(function (s, c) { return s + c.w; }, 0);
  const cp = 6;   // spațiul din celulă
  // Capul de tabel își ia înălțimea după eticheta cea mai înaltă: o etichetă care nu încape pe un rând
  // trece pe al doilea ÎNĂUNTRUL capului, nu iese din el.
  const capTabel = function (y) {
    doc.font('Nunito-Bold').fontSize(7.5);
    const hCap = Math.max.apply(null, col.map(function (c) { return doc.heightOfString(c.et, { width: c.w - 2 * cp }); })) + 13;
    doc.rect(left, y, w, hCap).fill(VERDE);
    let x = left;
    col.forEach(function (c) {
      doc.font('Nunito-Bold').fontSize(7.5).fillColor('#ffffff').text(c.et, x + cp, y + 6.5, { width: c.w - 2 * cp, align: c.al });
      x += c.w;
    });
    return y + hCap;
  };
  let y = capTabel(y0 + hBox + 18);
  linii.forEach(function (l, i) {
    const val = {
      nr: String(i + 1), desc: String(l.desc || ''), qty: String(Number(l.qty) || 0),
      pu: _bani(l.unitPrice), net: _bani(l.net), vr: (Number(l.vatRate) || 0) + '%', vat: _bani(l.vat)
    };
    doc.font('Nunito').fontSize(9);
    const hRand = Math.max(14, doc.heightOfString(val.desc, { width: col[1].w - 2 * cp })) + 12;
    if (y + hRand > _jos(doc) - 40) { doc.addPage(); y = capTabel(doc.page.margins.top); }
    if (i % 2 === 1) doc.rect(left, y, w, hRand).fill(RAND);
    let x = left;
    col.forEach(function (c) {
      doc.font('Nunito').fontSize(9).fillColor(TEXT).text(val[c.k], x + cp, y + 6, { width: c.w - 2 * cp, align: c.al });
      x += c.w;
    });
    y += hRand;
    doc.moveTo(left, y).lineTo(left + w, y).strokeColor(LINIE).lineWidth(0.7).stroke();
  });

  // ── Totalurile, la dreapta ──
  if (y + 110 > _jos(doc)) { doc.addPage(); y = doc.page.margins.top; }
  const tw = 270, tx = left + w - tw;
  y += 14;
  const randTotal = function (et, suma) {
    doc.font('Nunito').fontSize(9.5).fillColor(GRI_TEXT).text(et, tx + 12, y, { width: tw - 24, align: 'left' });
    doc.font('Nunito-Bold').fontSize(9.5).fillColor(TEXT).text(suma + ' lei', tx + 12, y, { width: tw - 24, align: 'right' });
    y += 17;
  };
  randTotal('Total fără TVA (net)', _bani(inv.subtotal));
  randTotal('TVA', _bani(inv.vat_amount));
  doc.moveTo(tx, y - 3).lineTo(tx + tw, y - 3).strokeColor(LINIE).lineWidth(0.7).stroke();
  y += 4;
  doc.roundedRect(tx, y, tw, 32, 7).lineWidth(1.5).fillAndStroke(VERDE_FUNDAL, VERDE);
  doc.font('Nunito-Bold').fontSize(12).fillColor(VERDE_INCHIS).text('TOTAL DE PLATĂ', tx + 12, y + 10, { width: tw - 24, align: 'left' });
  doc.font('Nunito-Bold').fontSize(12).fillColor(VERDE_INCHIS).text(_bani(inv.total) + ' lei', tx + 12, y + 10, { width: tw - 24, align: 'right' });
  y += 32 + 18;

  // ── Sub totaluri: perioada (abonament) sau mențiunile (factură unică, proformă); apoi plata ──
  const scrieRand = function (text, bold) {
    doc.font(bold ? 'Nunito-Bold' : 'Nunito').fontSize(9).fillColor(TEXT);
    const h = doc.heightOfString(text, { width: w });
    if (y + h > _jos(doc) - 30) { doc.addPage(); y = doc.page.margins.top; }
    doc.font(bold ? 'Nunito-Bold' : 'Nunito').fontSize(9).fillColor(TEXT).text(text, left, y, { width: w });
    y = doc.y + 5;
  };
  // La factura unică și la proformă, „Perioada" era ziua emiterii de două ori (30.01 → 30.01): acolo stau mențiunile.
  if (inv.fel === 'unica' || pf) {
    if (inv.note) scrieRand('Mențiuni: ' + inv.note);
  } else {
    scrieRand('Perioada: ' + _ziCalendar(inv.period_start) + ' → ' + _ziCalendar(inv.period_end) + (inv.note ? ' · ' + inv.note : ''));
  }
  // Plata se face prin transfer bancar (Stripe a fost scos; nu există plată cu cardul). O factură născută
  // dintr-o proformă încasată e deja plătită, deci nu mai cere nimic.
  if (!inv.din_proforma && inv.due_date) {
    scrieRand('Plata: prin transfer bancar' + (iss.iban ? ', în contul ' + iss.iban + (iss.bank ? ' (' + iss.bank + ')' : '') : '') + ', până la ' + _data(inv.due_date) + '.');
  }

  // ── Josul hârtiei ──
  const subsol = inv.previzualizare
    ? 'PREVIZUALIZARE — documentul nu e emis încă: numărul, data și trimiterea către client se fac la „Emite". Nu are valoare fiscală.'
    : pf
    ? 'Proformă emisă din platforma RA Tracks. Document fără valoare fiscală: factura fiscală se emite la încasare, cu aceleași rânduri.'
    : 'Factură emisă electronic din platforma RA Tracks. Document valabil fără semnătură și ștampilă conform art. 319 alin. (29) Cod fiscal.' +
      (inv.din_proforma ? ' Emisă la încasarea unei proforme.' : '');
  doc.font('Nunito').fontSize(7.5);
  const hSub = doc.heightOfString(subsol, { width: w });
  if (y + 14 + hSub > _jos(doc)) { doc.addPage(); y = doc.page.margins.top; }
  y += 8;
  doc.moveTo(left, y).lineTo(left + w, y).strokeColor(LINIE).lineWidth(0.7).stroke();
  doc.font('Nunito').fontSize(7.5).fillColor('#94a3b8').text(subsol, left, y + 8, { width: w });
  doc.x = left;
}

// Randează factura într-un flux (răspunsul HTTP sau un buffer pentru email). Întoarce documentul.
function facturaPdf(inv, emitentAcum) {
  const pf = inv && inv.type === 'proforma';
  const doc = new PDFDocument({
    size: 'A4', margin: 40,
    info: { Title: (pf ? 'Proformă ' : 'Factură ') + ((inv && inv.full_number) || ''), Author: 'RA Tracks' }
  });
  try {
    doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
  } catch (e) {
    try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
  }
  scrieFactura(doc, inv, emitentAcum);
  doc.end();
  return doc;
}

module.exports = { facturaPdf, scrieFactura, numeFisier, cuiAfisat };
