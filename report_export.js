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

// ─── PDF: branding + KPI + grafice desenate în pdfkit (fără dependențe native) + tabel ───
const PALETTE = ['#3FE07D', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
function _num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Bar chart: bare verticale + etichete x.
function drawBar(doc, x, y, w, h, c) {
  const labels = c.labels || [], data = ((c.datasets || [])[0] || {}).data || [];
  const n = labels.length; if (!n) return;
  const max = Math.max(1, ...data.map(_num)), padB = 12, plotH = h - padB;
  doc.moveTo(x, y + plotH).lineTo(x + w, y + plotH).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = _num(data[i]), bh = max > 0 ? (v / max) * (plotH - 2) : 0;
    doc.rect(x + i * bw + bw * 0.18, y + plotH - bh, bw * 0.64, Math.max(0, bh)).fillColor(PALETTE[0]).fill();
    doc.fillColor('#6b7280').font('Helvetica').fontSize(5.5).text(String(labels[i]), x + i * bw, y + plotH + 2, { width: bw, align: 'center', lineBreak: false });
  }
}
// Line chart: polilinie + puncte.
function drawLine(doc, x, y, w, h, c) {
  const labels = c.labels || [], data = ((c.datasets || [])[0] || {}).data || [];
  const n = labels.length; if (!n) return;
  const max = Math.max(1, ...data.map(_num)), padB = 12, plotH = h - padB, step = n > 1 ? w / (n - 1) : 0;
  doc.moveTo(x, y + plotH).lineTo(x + w, y + plotH).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
  const pt = i => ({ px: x + (n > 1 ? i * step : w / 2), py: y + plotH - (max > 0 ? (_num(data[i]) / max) * (plotH - 2) : 0) });
  doc.strokeColor(PALETTE[0]).lineWidth(1.5);
  for (let i = 0; i < n; i++) { const p = pt(i); if (i === 0) doc.moveTo(p.px, p.py); else doc.lineTo(p.px, p.py); }
  doc.stroke();
  for (let i = 0; i < n; i++) { const p = pt(i); doc.circle(p.px, p.py, 2).fillColor(PALETTE[0]).fill();
    doc.fillColor('#6b7280').font('Helvetica').fontSize(5.5).text(String(labels[i]), p.px - (step || w) / 2, y + plotH + 2, { width: step || w, align: 'center', lineBreak: false }); }
}
// Pie/doughnut: felii (arc SVG) + legendă.
function drawPie(doc, x, y, w, h, c, doughnut) {
  const labels = c.labels || [], data = ((c.datasets || [])[0] || {}).data || [];
  const total = data.reduce((a, b) => a + _num(b), 0); if (!total) return;
  const r = Math.min(h, w * 0.5) / 2 - 2, cx = x + r + 2, cy = y + h / 2;
  let a0 = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const frac = _num(data[i]) / total; if (frac <= 0) continue;
    const a1 = a0 + frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0), x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    doc.path('M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' Z').fillColor(PALETTE[i % PALETTE.length]).fill();
    a0 = a1;
  }
  if (doughnut) doc.circle(cx, cy, r * 0.55).fillColor('#ffffff').fill();
  let ly = y + 2; const lx = cx + r + 10, lw = x + w - lx;
  for (let i = 0; i < labels.length; i++) {
    if (ly > y + h - 8) break;
    doc.rect(lx, ly + 1, 6, 6).fillColor(PALETTE[i % PALETTE.length]).fill();
    doc.fillColor('#1f2937').font('Helvetica').fontSize(6.5).text(String(labels[i]) + ' (' + (data[i] == null ? '' : data[i]) + ')', lx + 9, ly, { width: lw - 9, lineBreak: false, ellipsis: true });
    ly += 11;
  }
}
function drawChart(doc, c, x, y, w, h) {
  try {
    if (c.type === 'line') drawLine(doc, x, y, w, h, c);
    else if (c.type === 'doughnut' || c.type === 'pie') drawPie(doc, x, y, w, h, c, c.type === 'doughnut');
    else drawBar(doc, x, y, w, h, c);
  } catch (e) { /* un grafic invalid nu trebuie să rupă tot PDF-ul */ }
}

function renderPdf(doc, report) {
  const cols = report.columns || [];
  const left = doc.page.margins.left;
  const usableW = doc.page.width - left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  let y = doc.page.margins.top;

  // 1. Antet brandat
  doc.roundedRect(left, y, 30, 22, 4).fillColor('#3FE07D').fill();
  doc.fillColor('#06210F').font('Helvetica-Bold').fontSize(14).text('RA', left, y + 5, { width: 30, align: 'center', lineBreak: false });
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(16).text('Tracks', left + 36, y + 4, { lineBreak: false });
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(13).text(report.label || 'Raport', left, y + 4, { width: usableW, align: 'right', lineBreak: false });
  y += 26;
  doc.moveTo(left, y).lineTo(left + usableW, y).strokeColor('#3FE07D').lineWidth(2).stroke();
  y += 7;
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Perioadă: ' + fmtPeriod(report.from, report.to) + '     Generat: ' + new Date().toLocaleString('ro-RO'), left, y, { lineBreak: false });
  y += 17;

  // 2. Carduri KPI (din summary)
  const sum = Object.entries(report.summary || {});
  if (sum.length) {
    const per = Math.min(sum.length, 6), cw = (usableW - (per - 1) * 8) / per;
    sum.slice(0, per).forEach(([k, v], i) => {
      const cx = left + i * (cw + 8);
      doc.roundedRect(cx, y, cw, 34, 5).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.rect(cx, y, 3, 34).fillColor('#3FE07D').fill();
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(13).text(String(v), cx + 8, y + 5, { width: cw - 12, lineBreak: false, ellipsis: true });
      doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text(String(k).toUpperCase(), cx + 8, y + 22, { width: cw - 12, lineBreak: false, ellipsis: true });
    });
    y += 44;
  }

  // 3. Grafice (2 pe rând) — desenate din report.charts
  const charts = (report.charts || []).filter(c => c && Array.isArray(c.labels) && c.labels.length);
  if (charts.length) {
    const perRow = 2, gap = 12, rowGap = 12, chW = (usableW - (perRow - 1) * gap) / perRow, chH = 124, boxH = chH + 22;
    const rows = Math.ceil(charts.length / perRow);
    if (y + boxH > bottom) { doc.addPage(); y = doc.page.margins.top; }
    const startY = y;
    charts.forEach((c, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      const cx = left + col * (chW + gap), cy = startY + row * (boxH + rowGap);
      doc.roundedRect(cx, cy, chW, boxH, 5).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text(c.title || '', cx + 8, cy + 6, { width: chW - 16, lineBreak: false, ellipsis: true });
      drawChart(doc, c, cx + 8, cy + 20, chW - 16, chH - 2);
    });
    y = startY + rows * (boxH + rowGap) + 4;
  }

  // 4. Tabel (header repetat pe fiecare pagină)
  const ncol = Math.max(1, cols.length), colW = usableW / ncol, rowH = 15;
  if (y + rowH * 2 > bottom) { doc.addPage(); y = doc.page.margins.top; }
  const drawHeader = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#166534');
    cols.forEach((c, i) => doc.text(String(c), left + i * colW + 2, y + 3, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#3FE07D').lineWidth(0.8).stroke();
    y += rowH;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
  };
  drawHeader();
  for (const row of (report.rows || [])) {
    if (y + rowH > bottom) { doc.addPage(); y = doc.page.margins.top; drawHeader(); }
    (row || []).forEach((v, i) => doc.text(v == null ? '' : String(v), left + i * colW + 2, y + 2, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#eee').lineWidth(0.5).stroke();
    y += rowH;
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
