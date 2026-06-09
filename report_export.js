// report_export.js — randează un raport uniform ({ columns, rows, summary, label, from, to })
// în Excel (.xlsx) sau PDF. Folosit de /api/reports/:type?format=xlsx|pdf.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function fmtPeriod(from, to) {
  const d = (x) => { try { return x ? new Date(x).toLocaleString('ro-RO') : '?'; } catch (e) { return '?'; } };
  return d(from) + ' — ' + d(to);
}
function safeName(base) {
  return String(base || 'raport').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 60) || 'raport';
}
function datePart(report) {
  try { return report.from ? new Date(report.from).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10); }
  catch (e) { return ''; }
}

// ─── Excel ───
async function toXlsx(report) {
  const cols = report.columns || [];
  const ncol = Math.max(1, cols.length);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RA Track';
  const ws = wb.addWorksheet((report.label || 'Raport').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Raport');

  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell(1, 1).value = report.label || 'Raport';
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, ncol);
  ws.getCell(2, 1).value = 'Perioada: ' + fmtPeriod(report.from, report.to);
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: 'FF777777' } };

  const header = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  let r = 5;
  for (const row of (report.rows || [])) {
    const xr = ws.getRow(r++);
    (row || []).forEach((v, i) => { xr.getCell(i + 1).value = (v == null ? '' : v); });
  }

  cols.forEach((c, i) => {
    let w = String(c).length;
    for (const row of (report.rows || [])) { const v = row && row[i]; if (v != null) w = Math.max(w, String(v).length); }
    ws.getColumn(i + 1).width = Math.min(45, Math.max(10, w + 2));
  });

  if (report.summary && Object.keys(report.summary).length) {
    r += 1;
    ws.getCell(r, 1).value = 'Sumar'; ws.getCell(r, 1).font = { bold: true }; r++;
    for (const [k, v] of Object.entries(report.summary)) {
      ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = (v == null ? '' : v); r++;
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── PDF ───
function renderPdf(doc, report) {
  const cols = report.columns || [];
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111').text(report.label || 'Raport', { lineBreak: true });
  doc.font('Helvetica').fontSize(9).fillColor('#666').text('Perioada: ' + fmtPeriod(report.from, report.to));
  doc.moveDown(0.4);

  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const ncol = Math.max(1, cols.length);
  const colW = usableW / ncol;
  const rowH = 15;
  let y = doc.y;

  const drawHeader = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
    cols.forEach((c, i) => doc.text(String(c), left + i * colW + 2, y + 3, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#888').lineWidth(0.6).stroke();
    y += rowH;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
  };
  drawHeader();

  for (const row of (report.rows || [])) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage(); y = doc.page.margins.top; drawHeader();
    }
    (row || []).forEach((v, i) => doc.text(v == null ? '' : String(v), left + i * colW + 2, y + 2, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#eee').lineWidth(0.5).stroke();
    y += rowH;
  }

  doc.x = left; doc.y = y + 6; doc.fillColor('#000');
  if (report.summary && Object.keys(report.summary).length) {
    if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).text('Sumar');
    doc.font('Helvetica').fontSize(9).fillColor('#222');
    for (const [k, v] of Object.entries(report.summary)) doc.text(k + ': ' + (v == null ? '' : v));
  }
}

function toPdf(report) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, info: { Title: report.label || 'Raport', Author: 'RA Track' } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      renderPdf(doc, report);
      doc.end();
    } catch (e) { reject(e); }
  });
}

// ─── Trimite raportul ca descărcare ───
async function sendReport(res, report, fmt) {
  const base = safeName(report.type || report.label);
  const name = base + '_' + datePart(report);
  if (fmt === 'xlsx') {
    const buf = await toXlsx(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '.xlsx"');
    return res.send(buf);
  }
  const buf = await toPdf(report);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + name + '.pdf"');
  return res.send(buf);
}

module.exports = { toXlsx, toPdf, sendReport };
