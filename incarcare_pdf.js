// incarcare_pdf.js — planul de încărcare pe hârtie (simulatorul, pasul 3, 12.10; butonul „Descarcă PDF" din machetă).
//
// Primește REZULTATUL simulării (incarcare.simuleaza, aceleași cifre și texte ca pe ecran) și îl desenează: cifrele de sus,
// desenul văzut de sus și din lateral, marfa, greutatea pe osii și ce e de corectat. Nu socotește nimic: dacă ar socoti,
// hârtia s-ar putea despărți de ecran. Logo-ul casei pentru fundal alb (logo-light.png), fonturile cu diacritice, numele
// după regula casei: „RA-Track - Plan de încărcare B 101 RAT - 12.10.2026.pdf".
//
// Fișierul e CURAT: nu atinge baza și nu știe de rute.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const TEXT = '#1a2235', GRI = '#64748b', LINIE = '#cbd5e1', FUNDAL = '#f8fafc', PODEA = '#eef2f6';
const TON = { verde: '#15803d', galben: '#b45309', rosu: '#b91c1c', gri: '#64748b' };

let _logoBuf = null, _logoTried = false;
function _logo() {
  if (!_logoTried) { _logoTried = true; try { _logoBuf = fs.readFileSync(path.join(__dirname, 'public', 'logo-light.png')); } catch (e) { _logoBuf = null; } }
  return _logoBuf;
}
function _zi(ms) { return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }); }
function _ora(ms) { return new Date(Number(ms)).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' }); }

function numeFisier(rez, ms) {
  const curat = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const v = curat(rez && rez.vehicul && rez.vehicul.plate);
  return 'RA-Track - Plan de încărcare' + (v ? ' ' + v : '') + ' - ' + _zi(ms || Date.now()) + '.pdf';
}

// O culoare mai deschisă (pentru stratul de deasupra, văzut de sus).
function _deschis(hex, t) {
  const a = parseInt(String(hex).slice(1), 16), r = (a >> 16) & 255, g = (a >> 8) & 255, b = a & 255;
  const m = (c) => Math.round(c + (255 - c) * t);
  return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
}

// Desenul: corpurile (spațiile de încărcare), marfa colorată pe opriri, axele, centrul de greutate. `vedere` = 'sus' | 'lateral'.
function _desen(doc, rez, x, y, w, h, vedere) {
  const culori = {};
  (rez.legenda || []).forEach((l) => { culori[l.nr] = l.culoare; });
  const corpuri = rez.corpuri || [];
  const ultim = corpuri[corpuri.length - 1] || { x0: 0, L: 1, W: 1, H: 1 };
  const axeX = (rez.axe || []).map((a) => a.x);
  // Cabina, doar ca reper (ca pe ecran): cuprinde axa din față, se oprește în fața spațiului de încărcare.
  const cabX1 = rez.trac ? -0.45 : -0.12, cabX0 = Math.min(cabX1 - (rez.trac ? 2.3 : 1.8), (axeX.length ? axeX[0] : 0) - 0.8);
  const cabH = rez.trac ? 3.0 : Math.min(((corpuri[0] || {}).H || 2) + 0.25, 2.9);
  const xMin = Math.min(cabX0, ...axeX) - 0.3, xMax = Math.max(ultim.x0 + ultim.L, ...axeX) + 0.4;
  const adanc = vedere === 'sus' ? Math.max(...corpuri.map((B) => B.W)) : Math.max(cabH, ...corpuri.map((B) => B.H));
  const s = Math.min(w / (xMax - xMin), (h - 18) / adanc);
  const X = (m) => x + (m - xMin) * s;
  const bazaY = vedere === 'sus' ? y + 4 : y + 4 + adanc * s;           // la lateral, podeaua e jos
  const Y = (m) => (vedere === 'sus' ? bazaY + m * s : bazaY - m * s);
  doc.save();
  if (vedere === 'sus') doc.rect(X(cabX0), Y(0.03 * corpuri[0].W), (cabX1 - cabX0) * s, 0.94 * corpuri[0].W * s).lineWidth(0.6).fillAndStroke('#e2e8f0', LINIE);
  else doc.rect(X(cabX0), Y(cabH), (cabX1 - cabX0) * s, (cabH - 0.15) * s).lineWidth(0.6).fillAndStroke('#e2e8f0', LINIE);
  corpuri.forEach((B) => {
    const ad = vedere === 'sus' ? B.W : B.H;
    doc.rect(X(B.x0), vedere === 'sus' ? Y(0) : Y(ad), B.L * s, ad * s).fillAndStroke(PODEA, LINIE);
  });
  const cutii = (rez.cutii || []).slice().sort((p, q) => (vedere === 'sus' ? p.z0 - q.z0 : q.y0 - p.y0));
  cutii.forEach((c) => {
    const B = corpuri[c.c] || corpuri[0], baza = culori[c.oprire] || '#3B82F6';
    const x0 = B.x0 + c.x0 / 100, x1 = B.x0 + c.x1 / 100;
    if (vedere === 'sus') {
      const y0 = c.y0 / 100, y1 = c.y1 / 100;
      doc.rect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s).lineWidth(0.4).fillAndStroke(c.z0 > 0 ? _deschis(baza, 0.45) : baza, '#ffffff');
    } else {
      const z0 = c.z0 / 100, z1 = c.z1 / 100;
      doc.rect(X(x0), Y(z1), (x1 - x0) * s, (z1 - z0) * s).lineWidth(0.4).fillAndStroke(baza, '#ffffff');
    }
  });
  // Axele: liniuțe sub podea (lateral) sau punctate de-a curmezișul (de sus).
  doc.lineWidth(0.8).strokeColor(GRI);
  (rez.axe || []).forEach((a) => {
    if (vedere === 'sus') doc.moveTo(X(a.x), y).lineTo(X(a.x), y + adanc * s + 8).dash(2, { space: 2 }).stroke().undash();
    else doc.circle(X(a.x), bazaY + 6, 4.5).fillAndStroke('#ffffff', GRI);
  });
  if (rez.kg > 0) {
    doc.lineWidth(1.2).strokeColor('#15803d');
    if (vedere === 'sus') doc.moveTo(X(rez.xcw), y).lineTo(X(rez.xcw), y + adanc * s + 8).dash(4, { space: 3 }).stroke().undash();
    else doc.moveTo(X(rez.xcw), bazaY).lineTo(X(rez.xcw), bazaY - adanc * s).dash(4, { space: 3 }).stroke().undash();
  }
  doc.restore();
  doc.font('Nunito').fontSize(7).fillColor(GRI);
  doc.text('față', X(cabX0), y - 9, { width: 40, lineBreak: false });
  doc.text('uși', X(ultim.x0 + ultim.L) - 40, y - 9, { width: 40, align: 'right', lineBreak: false });
  return adanc * s + 14;   // cât a ocupat desenul, în înălțime
}

function scriePlan(doc, rez, o) {
  o = o || {};
  const left = doc.page.margins.left, W = doc.page.width - left - doc.page.margins.right;
  let y = doc.page.margins.top;
  const logo = _logo();
  if (logo) { try { doc.image(logo, left, y, { width: 120 }); } catch (e) {} }
  doc.font('Nunito-Bold').fontSize(16).fillColor(TEXT).text('Plan de încărcare', left + 140, y + 2, { width: W - 140 });
  doc.font('Nunito').fontSize(9).fillColor(GRI)
    .text((rez.vehicul ? rez.vehicul.plate + ' · ' + rez.vehicul.felEt + ' — ' : '') + (rez.titlu || ''), left + 140, y + 22, { width: W - 140 })
    .text((rez.dimensiuni || '') + (o.generatLa ? ' · generat ' + _ora(o.generatLa) : ''), left + 140, y + 34, { width: W - 140 });
  const st = rez.stare || {};
  doc.font('Nunito-Bold').fontSize(10).fillColor(TON[st.fel] || TEXT).text(st.text || '', left, y + 2, { width: W, align: 'right' });
  y += 56;

  // Cifrele de sus, în patru casete.
  const ind = rez.indicatori || [], cw = (W - 3 * 8) / 4;
  ind.forEach((it, i) => {
    const cx = left + i * (cw + 8);
    doc.roundedRect(cx, y, cw, 44, 4).fillAndStroke(FUNDAL, LINIE);
    doc.font('Nunito').fontSize(7).fillColor(GRI).text(String(it.et).toUpperCase(), cx + 8, y + 6, { width: cw - 16, lineBreak: false });
    doc.font('Nunito-Bold').fontSize(12).fillColor(TON[it.ton] || TEXT).text(it.val, cx + 8, y + 17, { width: cw - 16, lineBreak: false });
    doc.font('Nunito').fontSize(7.5).fillColor(GRI).text(it.tot, cx + 8, y + 32, { width: cw - 16, lineBreak: false });
  });
  y += 54;

  // Desenele: de sus și din lateral.
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Văzut de sus', left, y, { width: W });
  y += 20 + _desen(doc, rez, left, y + 20, W, 84, 'sus');
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Văzut din lateral', left, y, { width: W });
  y += 20 + _desen(doc, rez, left, y + 20, W, 92, 'lateral') + 2;
  // Legenda opririlor + ordinea de încărcare.
  let lx = left;
  (rez.legenda || []).forEach((l) => {
    doc.rect(lx, y + 1, 8, 8).fill(l.culoare);
    const t = 'Oprirea ' + l.nr + ' · ' + l.nume;
    doc.font('Nunito').fontSize(8).fillColor(TEXT).text(t, lx + 12, y, { lineBreak: false });
    lx += 12 + doc.widthOfString(t) + 16;
  });
  y += 14;
  doc.font('Nunito').fontSize(8).fillColor(GRI).text([rez.ordineText, rez.xcwText].filter(Boolean).join(' '), left, y, { width: W });
  y = doc.y + 8;
  // Marfa și osiile nu se rup între pagini: dacă nu încap sub desene, trec pe pagina a doua.
  const colO0 = W - W * 0.6 - 16;
  doc.font('Nunito').fontSize(7.5);
  const hMesaje = (rez.mesaje || []).reduce((a, m) => a + doc.heightOfString(m.text, { width: colO0 }) + 4, 0);
  const nevoie = Math.max(25 + (rez.marfa || []).length * 11, 14 + (rez.osii || []).length * 12 + 18 + hMesaje);
  if (y + nevoie > doc.page.height - doc.page.margins.bottom - 14) { doc.addPage(); y = doc.page.margins.top; }

  // Marfa (stânga) și osiile (dreapta).
  const colM = W * 0.6, colO = W - colM - 16, ox = left + colM + 16;
  let ym = y;
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Marfa', left, ym, { width: colM });
  ym += 14;
  const cap = [['Marfa', 0.34], ['Dimensiuni', 0.22], ['Greutate', 0.16], ['Bucăți', 0.12], ['Oprirea', 0.16]];
  let cx = left;
  doc.font('Nunito-Bold').fontSize(7.5).fillColor(GRI);
  cap.forEach((c) => { doc.text(c[0], cx, ym, { width: colM * c[1] - 4, lineBreak: false }); cx += colM * c[1]; });
  ym += 11;
  doc.moveTo(left, ym - 2).lineTo(left + colM, ym - 2).lineWidth(0.5).strokeColor(LINIE).stroke();
  (rez.marfa || []).forEach((it) => {
    const cel = [it.nume, it.dims, it.kgText, it.incarcate === it.buc ? String(it.buc) : it.incarcate + ' din ' + it.buc, it.oprireText.replace(/^Oprirea \d+ · /, '')];
    cx = left;
    doc.font('Nunito').fontSize(7.5).fillColor(it.incarcate === it.buc ? TEXT : TON.rosu);
    cel.forEach((t, i) => { doc.text(t, cx, ym, { width: colM * cap[i][1] - 4, lineBreak: false, ellipsis: true }); cx += colM * cap[i][1]; });
    ym += 11;
  });
  let yo = y;
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Greutatea pe osii', ox, yo, { width: colO });
  yo += 14;
  (rez.osii || []).forEach((a) => {
    doc.font('Nunito').fontSize(8).fillColor(TEXT).text(a.nume + ' · ' + a.sub, ox, yo, { width: colO * 0.55, lineBreak: false });
    doc.font('Nunito-Bold').fontSize(8).fillColor(TON[a.ton] || TEXT).text(a.text, ox + colO * 0.55, yo, { width: colO * 0.45, align: 'right', lineBreak: false });
    yo += 12;
  });
  if (rez.masa) {
    doc.moveTo(ox, yo).lineTo(ox + colO, yo).lineWidth(0.5).strokeColor(LINIE).stroke();
    yo += 4;
    doc.font('Nunito').fontSize(8).fillColor(TEXT).text('Masa totală', ox, yo, { width: colO * 0.55, lineBreak: false });
    doc.font('Nunito-Bold').fontSize(8).fillColor(TON[rez.masa.ton] || TEXT).text(rez.masa.text, ox + colO * 0.55, yo, { width: colO * 0.45, align: 'right', lineBreak: false });
    yo += 14;
  }
  (rez.mesaje || []).forEach((m) => {
    doc.font('Nunito').fontSize(7.5).fillColor(TON[m.fel] || TEXT).text(m.text, ox, yo, { width: colO });
    yo = doc.y + 4;
  });
  doc.font('Nunito').fontSize(7).fillColor(GRI)
    .text('Plan făcut în RA Track · ratrack.ro. Greutatea pe osii e o estimare din cifrele din fișa vehiculului; cântarul are ultimul cuvânt.',
      left, doc.page.height - doc.page.margins.bottom - 10, { width: W, lineBreak: false });
}

function planPdf(rez, o) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, info: { Title: 'Plan de încărcare', Author: 'RA Track' } });
  try {
    doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
  } catch (e) {
    try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
  }
  scriePlan(doc, rez, o);
  doc.end();
  return doc;
}

module.exports = { planPdf, scriePlan, numeFisier };
