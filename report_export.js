// report_export.js — randează un raport uniform ({ columns, rows, summary, label, from, to })
// în Excel (.xlsx) sau PDF. Folosit de /api/reports/:type?format=xlsx|pdf.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Logo RA Tracks pt. exporturi pe fundal ALB (Excel + PDF). Citit o singură dată din disc.
// ATENȚIE la denumire: „logo.png" e varianta ALBĂ (pt. fundal închis) — invizibilă pe alb;
// „logo-light.png" e varianta ÎNCHISĂ (pt. temă/​fundal deschis) — asta ne trebuie pe alb.
let _logoBuf = null, _logoTried = false;
function _logoBuffer() {
  if (!_logoTried) { _logoTried = true; try { _logoBuf = fs.readFileSync(path.join(__dirname, 'public', 'logo-light.png')); } catch (e) { _logoBuf = null; } }
  return _logoBuf;
}
// Înregistrează imaginea logo în workbook (o dată) → întoarce id-ul refolosibil pe toate foile, sau null.
function xlLogoId(wb) {
  const buf = _logoBuffer(); if (!buf) return null;
  try { return wb.addImage({ buffer: buf, extension: 'png' }); } catch (e) { return null; }
}
// Pune logo-ul pe rândul 1 al foii; întoarce primul rând liber (2 cu logo, 1 fără).
function xlPlaceLogo(ws, logoId) {
  if (logoId == null) return 1;
  try { ws.getRow(1).height = 28; ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 35 } }); } catch (e) { return 1; }
  return 2;
}

const DISPLAY_TZ = process.env.DISPLAY_TZ || 'Europe/Bucharest'; // perioada/ora afișate în fusul local (ca rândurile raportului), nu UTC-ul serverului
function fmtPeriod(from, to) {
  const d = (x) => { try { return x ? new Date(x).toLocaleString('ro-RO', { timeZone: DISPLAY_TZ }) : '?'; } catch (e) { return '?'; } };
  return d(from) + ' — ' + d(to);
}
function safeName(base) {
  // Păstrează spațiile și literele (inclusiv diacritice); scoate doar caracterele nepermise în nume de fișier.
  return String(base || 'Raport').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Raport';
}
function datePart() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(); // data generării (zz.ll.aaaa)
}

// ─── Excel ───
// Nume de sheet valid Excel (≤31 caractere, fără \ / ? * [ ] :), unic în workbook.
function xlSheetName(name, used) {
  let s = String(name == null ? 'Sheet' : name).replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
  let cand = s, i = 2;
  while (used.has(cand.toLowerCase())) { cand = (s.slice(0, 25) + ' ' + i).trim(); i++; }
  used.add(cand.toLowerCase());
  return cand;
}
// Scrie un tabel uniform într-un worksheet: linii titlu + antet + rânduri + auto-lățime.
function xlWriteTable(ws, titleLines, columns, rows, logoId) {
  const ncol = Math.max(1, columns.length);
  let r = xlPlaceLogo(ws, logoId); // logo pe rândul 1 → titlul/tabelul încep de la rândul 2 (sau 1 fără logo)
  // Fără merge pe titlu/perioadă → textul lung se revarsă în celulele goale din dreapta (vizibil fără să tragi de coloane).
  for (const tl of (titleLines || [])) { const c = ws.getCell(r, 1); c.value = tl.text; c.font = tl.font || { bold: true, size: 13 }; r++; }
  r++;
  const hr = r;
  columns.forEach((c, i) => { const cell = ws.getCell(hr, i + 1); cell.value = c; cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }; });
  r = hr + 1;
  for (const row of (rows || [])) { const xr = ws.getRow(r++); (row || []).forEach((v, i) => { xr.getCell(i + 1).value = (v == null ? '' : v); }); }
  columns.forEach((c, i) => { let w = String(c).length; for (const row of (rows || [])) { const v = row && row[i]; if (v != null) w = Math.max(w, String(v).length); } ws.getColumn(i + 1).width = Math.min(45, Math.max(10, w + 2)); });
  return r; // rândul următor liber (după ultimul rând de date) — ca să putem atașa o legendă sub tabel
}
// Legendă sub tabel (ex. explicația coloanei „Sursă"): titlu îngroșat + „termen | descriere" pe rânduri.
// Descrierea e îmbinată pe coloanele rămase și cu wrap, ca să încapă tot textul. Întoarce rândul următor liber.
function xlWriteLegend(ws, legend, startRow, ncol) {
  let r = startRow;
  const n = Math.max(2, ncol);
  // Lățimea zonei îmbinate (col 2..n) în „unități caracter" — ca să estimăm câte linii se înfășoară și să setăm
  // ÎNĂLȚIMEA rândului. Excel NU auto-fit-ează înălțimea la celule îmbinate → fără asta, liniile 2+ ale unei
  // descrieri lungi se taie la deschidere (rezolvă constatarea review-ului pt. „Estimat (nivel CAN)", 111 car.).
  let mergedW = 0; for (let c = 2; c <= n; c++) { const w = ws.getColumn(c).width; mergedW += (w && w > 0) ? w : 10; }
  const perLine = Math.max(20, mergedW - 2);
  if (legend.title) { ws.mergeCells(r, 1, r, n); const c = ws.getCell(r, 1); c.value = legend.title; c.font = { bold: true, size: 11, color: { argb: 'FF444444' } }; r++; }
  for (const it of (legend.items || [])) {
    const term = ws.getCell(r, 1); term.value = it[0]; term.font = { bold: true };
    ws.mergeCells(r, 2, r, n);
    const desc = ws.getCell(r, 2); desc.value = it[1]; desc.font = { color: { argb: 'FF555555' } }; desc.alignment = { wrapText: true, vertical: 'top' };
    const lines = Math.max(1, Math.ceil(String(it[1] || '').length / perLine));
    ws.getRow(r).height = 14 * lines + 3; // înălțime explicită (celulele îmbinate nu se auto-fit-ează)
    r++;
  }
  return r;
}
// Excel multi-sheet pt. rapoarte cu date pe vehicul (ex. Foaie de parcurs): „Sumar" + un sheet/mașină.
async function toXlsxMultiSheet(report) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'RA Track';
  const used = new Set();
  const period = { text: report.periodLabel || ('Perioada: ' + fmtPeriod(report.from, report.to)), font: { italic: true, size: 10, color: { argb: 'FF777777' } } };
  const pv = report.perVehicle || [];
  const logoId = xlLogoId(wb); // logo RA Tracks, refolosit pe toate foile
  if (!report.noSummarySheet) { // unele rapoarte (ex. Scadențe) vor DOAR foi/mașină, fără foaia „Sumar"
    // Sumar generic: coloanele vin din summary-ul fiecărui vehicul (trips au câmpuri bogate; restul → „Înregistrări").
    const labels = (pv[0] && pv[0].summary) ? pv[0].summary.map(s => s[0]) : [];
    const sumCols = [report.groupLabel || 'Vehicul'].concat(labels); // ex. „Șofer" la Pontaj, „Vehicul" la restul
    const sumRows = pv.map(v => [v.vehicul].concat((v.summary || []).map(s => s[1])));
    const totals = labels.map((lbl, i) => {
      // Coloanele de tip „max" (ex. „Max peste limită", „Viteză max") NU se adună — maximul flotei e cel mai mare, nu suma maximelor.
      const isMax = /\bmax/i.test(String(lbl));
      let allNum = true, any = false, acc = isMax ? -Infinity : 0;
      for (const v of pv) { const val = (v.summary && v.summary[i]) ? v.summary[i][1] : ''; if (val === '' || val === '—' || val == null) continue; const n = _summableNum(val); if (n == null) { allNum = false; break; } any = true; acc = isMax ? Math.max(acc, n) : acc + n; }
      return (allNum && any) ? Math.round(acc * 10) / 10 : '';
    });
    // TOTAL: dacă raportul dă un total explicit (ex. Pontaj: orele se adună ca durate, media nu), îl folosim; altfel suma generică.
    // Unele rapoarte cer să NU aibă rând TOTAL (ex. Depășiri viteză: ar dubla KPI-urile din capul foii) → report.noFleetTotal.
    if (!report.noFleetTotal) {
      const totalsRow = (report.summaryTotals && report.summaryTotals.length) ? report.summaryTotals : totals;
      sumRows.push([report.groupLabel ? 'TOTAL' : 'TOTAL flotă'].concat(totalsRow));
    }
    // KPI pe flotă (report.summary) în capul foii „Sumar" — altfel s-ar pierde complet în exportul multi-sheet
    const kpiLines = Object.entries(report.summary || {}).map(([k, v]) => ({ text: k + ':  ' + (v == null ? '—' : v), font: { size: 11, color: { argb: 'FF444444' } } }));
    const sumWs = wb.addWorksheet(xlSheetName('Sumar', used));
    const sumEnd = xlWriteTable(sumWs, [{ text: (report.label || 'Raport') + ' — Sumar' }, period].concat(kpiLines), sumCols, sumRows, logoId);
    // Legenda raportului (ex. calificativele EcoDrive) — sub tabelul din foaia Sumar (altfel lipsea complet în multi-sheet).
    if (report.legend && report.legend.items && report.legend.items.length) xlWriteLegend(sumWs, report.legend, sumEnd + 2, sumCols.length);
  }
  for (const v of pv) {
    xlWriteTable(wb.addWorksheet(xlSheetName(v.vehicul, used)), [{ text: v.vehicul }, period], report.columns || [], v.rows || [], logoId);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function toXlsx(report) {
  if (report.perVehicle && report.perVehicle.length) return toXlsxMultiSheet(report);
  const cols = report.columns || [];
  const ncol = Math.max(1, cols.length);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RA Track';
  const logoId = xlLogoId(wb);
  // Sumar pe FOAIE SEPARATĂ (opt-in prin report.summarySheet) — KPI-urile flotei, curat, ca primă foaie (nu îngrămădit la baza tabelului).
  if (report.summarySheet && report.summary && Object.keys(report.summary).length) {
    const period = { text: report.periodLabel || ('Perioada: ' + fmtPeriod(report.from, report.to)), font: { italic: true, size: 10, color: { argb: 'FF777777' } } };
    // Valorile pur numerice (inclusiv „8.8" din toFixed) devin NUMERE reale → Excel le aliniază la dreapta
    // ca pe celelalte cifre (751/2/66); textul real („—", etichete) rămâne neschimbat.
    const sumRows = Object.entries(report.summary).map(([k, v]) => { const n = _summableNum(v); return [k, n != null ? n : (v == null ? '' : v)]; });
    xlWriteTable(wb.addWorksheet('Sumar'), [{ text: (report.label || 'Raport') + ' — Sumar' }, period], ['Indicator', 'Valoare'], sumRows, logoId);
  }
  const ws = wb.addWorksheet((report.label || 'Raport').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Raport');
  const base = xlPlaceLogo(ws, logoId); // logo pe rândul 1 → titlul începe de la rândul 2 (sau 1 fără logo)

  // Fără merge pe titlu/perioadă → textul lung se revarsă în celulele goale din dreapta (vizibil fără să tragi de coloane).
  ws.getCell(base, 1).value = report.label || 'Raport';
  ws.getCell(base, 1).font = { bold: true, size: 14 };
  ws.getCell(base + 1, 1).value = report.periodLabel || ('Perioada: ' + fmtPeriod(report.from, report.to));
  ws.getCell(base + 1, 1).font = { italic: true, size: 10, color: { argb: 'FF777777' } };

  const headerRow = base + 3;
  const header = ws.getRow(headerRow);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  let r = headerRow + 1;
  for (const row of (report.rows || [])) {
    const xr = ws.getRow(r++);
    (row || []).forEach((v, i) => { xr.getCell(i + 1).value = (v == null ? '' : v); });
  }

  cols.forEach((c, i) => {
    let w = String(c).length;
    for (const row of (report.rows || [])) { const v = row && row[i]; if (v != null) w = Math.max(w, String(v).length); }
    ws.getColumn(i + 1).width = Math.min(45, Math.max(10, w + 2));
  });

  if (!report.summarySheet && report.summary && Object.keys(report.summary).length) {
    r += 1;
    ws.getCell(r, 1).value = 'Sumar'; ws.getCell(r, 1).font = { bold: true }; r++;
    for (const [k, v] of Object.entries(report.summary)) {
      ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = (v == null ? '' : v); r++;
    }
  }

  // Legendă sub tabel (ex. „Sursa consumului") — sub datele de pe foaia de raport.
  if (report.legend && report.legend.items && report.legend.items.length) {
    xlWriteLegend(ws, report.legend, r + 1, ncol);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── PDF: branding + KPI + grafice desenate în pdfkit (fără dependențe native) + tabel ───
const PALETTE = ['#3FE07D', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
function _num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
// Sumabil DOAR dacă întreg șirul e un singur număr. `parseFloat` ar accepta prefixul unei date
// („01.07.2026, 07:53:31" → 1.07), stricând TOTAL-ul; aici respingem date/ore/„1h 20m". Întoarce număr sau null.
function _summableNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!/^-?\d+(?:[.,]\d+)?$/.test(s)) return null;
  return parseFloat(s.replace(',', '.'));
}

// Valoare compactă pentru axă/etichetă (1.2k, 47, 9.7).
function _fmtTick(v) { v = _num(v); if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; return String(Math.round(v * 10) / 10); }
// Grilă orizontală + valori pe axa Y (4 trepte). Întoarce geometria zonei de plot.
function _gridY(doc, x, y, w, h, max) {
  const gut = 22, padB = 14, plotH = h - padB, plotW = w - gut, x0 = x + gut;
  doc.font('Nunito').fontSize(5.5);
  for (let g = 0; g <= 4; g++) {
    const gy = y + plotH - (plotH - 2) * (g / 4);
    doc.moveTo(x0, gy).lineTo(x0 + plotW, gy).strokeColor(g === 0 ? '#cbd5e1' : '#eef2f6').lineWidth(g === 0 ? 0.8 : 0.5).stroke();
    doc.fillColor('#94a3b8').text(_fmtTick(max * g / 4), x, gy - 3, { width: gut - 3, align: 'right', lineBreak: false });
  }
  return { x0, plotW, plotH };
}
// Bar chart: bare rotunjite colorate + grilă + valori deasupra + etichete x.
function drawBar(doc, x, y, w, h, c) {
  const labels = c.labels || [], data = ((c.datasets || [])[0] || {}).data || [];
  const n = labels.length; if (!n) return;
  const max = Math.max(1, ...data.map(_num));
  const { x0, plotW, plotH } = _gridY(doc, x, y, w, h, max);
  const bw = plotW / n;
  for (let i = 0; i < n; i++) {
    const v = _num(data[i]), bh = max > 0 ? (v / max) * (plotH - 2) : 0;
    const bx = x0 + i * bw + bw * 0.16, by = y + plotH - bh, bwi = bw * 0.68;
    doc.roundedRect(bx, by, bwi, Math.max(0.6, bh), Math.min(3, bwi / 2)).fillColor(PALETTE[i % PALETTE.length]).fill();
    if (n <= 14) doc.fillColor('#334155').font('Nunito-Bold').fontSize(5.5).text(_fmtTick(v), x0 + i * bw, by - 7, { width: bw, align: 'center', lineBreak: false });
    doc.fillColor('#64748b').font('Nunito').fontSize(5.5).text(String(labels[i]), x0 + i * bw, y + plotH + 3, { width: bw, align: 'center', lineBreak: false });
  }
}
// Line chart: arie umplută + polilinie + puncte + grilă.
function drawLine(doc, x, y, w, h, c) {
  const labels = c.labels || [], data = ((c.datasets || [])[0] || {}).data || [];
  const n = labels.length; if (!n) return;
  const max = Math.max(1, ...data.map(_num)), col = PALETTE[0];
  const { x0, plotW, plotH } = _gridY(doc, x, y, w, h, max);
  const step = n > 1 ? plotW / (n - 1) : 0;
  const pt = i => ({ px: x0 + (n > 1 ? i * step : plotW / 2), py: y + plotH - (max > 0 ? (_num(data[i]) / max) * (plotH - 2) : 0) });
  // arie umplută sub linie
  doc.save();
  doc.moveTo(pt(0).px, y + plotH);
  for (let i = 0; i < n; i++) { const p = pt(i); doc.lineTo(p.px, p.py); }
  doc.lineTo(pt(n - 1).px, y + plotH).closePath().fillColor(col).fillOpacity(0.12).fill();
  doc.restore();
  // linia
  doc.strokeColor(col).lineWidth(1.6);
  for (let i = 0; i < n; i++) { const p = pt(i); if (i === 0) doc.moveTo(p.px, p.py); else doc.lineTo(p.px, p.py); }
  doc.stroke();
  // puncte + etichete x
  for (let i = 0; i < n; i++) {
    const p = pt(i); doc.circle(p.px, p.py, 1.9).fillColor(col).fill();
    doc.fillColor('#64748b').font('Nunito').fontSize(5.5).text(String(labels[i]), p.px - (step || plotW) / 2, y + plotH + 3, { width: step || plotW, align: 'center', lineBreak: false });
  }
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
    doc.fillColor('#1f2937').font('Nunito').fontSize(6.5).text(String(labels[i]) + ' (' + (data[i] == null ? '' : data[i]) + ')', lx + 9, ly, { width: lw - 9, lineBreak: false, ellipsis: true });
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

  // 1. Antet brandat — logo REAL RA Tracks (aceeași imagine ca în Excel), la stânga
  const _pdfLogo = _logoBuffer();
  if (_pdfLogo) { try { doc.image(_pdfLogo, left, y, { height: 24 }); } catch (e) {} } // 694×135 → înălț. 24 ⇒ lățime ≈123, proporție păstrată
  doc.fillColor('#111').font('Nunito-Bold').fontSize(13).text(report.label || 'Raport', left, y + 6, { width: usableW, align: 'right', lineBreak: false });
  y += 28;
  doc.moveTo(left, y).lineTo(left + usableW, y).strokeColor('#3FE07D').lineWidth(2).stroke();
  y += 7;
  doc.font('Nunito').fontSize(9).fillColor('#6b7280').text((report.periodLabel || ('Perioadă: ' + fmtPeriod(report.from, report.to))) + '     Generat: ' + new Date().toLocaleString('ro-RO', { timeZone: DISPLAY_TZ }), left, y, { lineBreak: false });
  y += 17;

  // 2. Carduri KPI (din summary)
  const sum = Object.entries(report.summary || {});
  if (sum.length) {
    const per = Math.min(sum.length, 6), cw = (usableW - (per - 1) * 8) / per;
    sum.slice(0, per).forEach(([k, v], i) => {
      const cx = left + i * (cw + 8);
      doc.roundedRect(cx, y, cw, 34, 5).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.rect(cx, y, 3, 34).fillColor('#3FE07D').fill();
      doc.fillColor('#16a34a').font('Nunito-Bold').fontSize(13).text(String(v), cx + 8, y + 5, { width: cw - 12, lineBreak: false, ellipsis: true });
      doc.fillColor('#6b7280').font('Nunito').fontSize(7).text(String(k).toUpperCase(), cx + 8, y + 22, { width: cw - 12, lineBreak: false, ellipsis: true });
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
      doc.fillColor('#111').font('Nunito-Bold').fontSize(9).text(c.title || '', cx + 8, cy + 6, { width: chW - 16, lineBreak: false, ellipsis: true });
      drawChart(doc, c, cx + 8, cy + 20, chW - 16, chH - 2);
    });
    y = startY + rows * (boxH + rowGap) + 4;
  }

  // 4. Tabel (header repetat pe fiecare pagină)
  const ncol = Math.max(1, cols.length), colW = usableW / ncol, rowH = 15;
  if (y + rowH * 2 > bottom) { doc.addPage(); y = doc.page.margins.top; }
  const drawHeader = () => {
    doc.font('Nunito-Bold').fontSize(8).fillColor('#166534');
    cols.forEach((c, i) => doc.text(String(c), left + i * colW + 2, y + 3, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#3FE07D').lineWidth(0.8).stroke();
    y += rowH;
    doc.font('Nunito').fontSize(8).fillColor('#222');
  };
  drawHeader();
  for (const row of (report.rows || [])) {
    if (y + rowH > bottom) { doc.addPage(); y = doc.page.margins.top; drawHeader(); }
    (row || []).forEach((v, i) => doc.text(v == null ? '' : String(v), left + i * colW + 2, y + 2, { width: colW - 4, height: rowH, ellipsis: true, lineBreak: false }));
    doc.moveTo(left, y + rowH).lineTo(left + usableW, y + rowH).strokeColor('#eee').lineWidth(0.5).stroke();
    y += rowH;
  }

  // 5. Legendă sub tabel (ex. explicația coloanei „Sursă") — dacă raportul o are.
  const lg = report.legend;
  if (lg && lg.items && lg.items.length) {
    const lineH = 11;
    const needed = (lg.title ? lineH : 0) + lg.items.length * lineH + 8;
    if (y + needed > bottom) { doc.addPage(); y = doc.page.margins.top; }
    y += 8;
    if (lg.title) { doc.font('Nunito-Bold').fontSize(8).fillColor('#166534').text(String(lg.title), left, y, { width: usableW, lineBreak: false, ellipsis: true }); y += lineH; }
    for (const it of lg.items) {
      doc.font('Nunito-Bold').fontSize(7.5).fillColor('#111').text(String(it[0]) + ':  ', left, y, { continued: true });
      doc.font('Nunito').fillColor('#555').text(String(it[1]));
      y += lineH;
    }
  }
}

function toPdf(report) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, info: { Title: report.label || 'Raport', Author: 'RA Track' } });
      // Font unicode înglobat (DejaVu Sans — glife românești complete Ș/Ț/Ă/ș/ț/ă) sub aliasul intern „Nunito".
      // Helvetica din pdfkit corupea diacriticele. Fallback la Helvetica dacă lipsesc TTF-urile (nu strică PDF-ul).
      try {
        doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
        doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
      } catch (e) {
        try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
      }
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      renderPdf(doc, report);
      doc.end();
    } catch (e) { reject(e); }
  });
}

// Diacritice românești → ASCII (pt. fallback-ul filename=", care trebuie să fie ASCII pur).
function _asciiFold(s) {
  const map = { 'ă':'a','â':'a','î':'i','ș':'s','ş':'s','ț':'t','ţ':'t','Ă':'A','Â':'A','Î':'I','Ș':'S','Ş':'S','Ț':'T','Ţ':'T' };
  return String(s || '').replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, c => map[c] || c).replace(/[^\x20-\x7E]/g, '');
}
// Content-Disposition sigur: antetul HTTP acceptă DOAR ASCII, dar labelul poate avea diacritice („Locație",
// „Depășiri") → altfel Node aruncă „Invalid character in header content". Dăm fallback ASCII (filename=")
// + numele real UTF-8 (filename*, RFC 5987) pe care browserele moderne îl afișează cu diacritice.
function contentDisposition(filename) {
  const ascii = _asciiFold(filename).replace(/["\\]/g, '');
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename);
}

// ─── Trimite raportul ca descărcare ───
async function sendReport(res, report, fmt) {
  const name = safeName('RA-Tracks - Raport ' + (report.label || report.type) + ' - ' + datePart()); // ex: „RA-Tracks - Raport Traseu - 06.07.2026"
  if (fmt === 'xlsx') {
    const buf = await toXlsx(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', contentDisposition(name + '.xlsx'));
    return res.send(buf);
  }
  const buf = await toPdf(report);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition(name + '.pdf'));
  return res.send(buf);
}

// ─── începe „oferta, ca fișier descărcat" ────────────────────────────────────────────────────────
// Oferta se „descărca" deschizând o fereastră de printare, din care omul salva singur un PDF. Alin
// (21.09): „vreau să fie la fel ca la rapoarte — să-ți alegi unde o descarci. Asta înseamnă
// descărcare." Deci: PDF făcut aici, pe server, trimis ca fișier, cu numele brandat al casei.
//
// Stă în fișierul ăsta, lângă `sendReport`, ca logo-ul, fonturile și regula de denumire să rămână
// într-un singur loc — nu într-o a doua cale de export care s-ar despărți de ele.
// ─── Sumele, scrise românește ────────────────────────────────────────────────────────────────────
// „2250.00 lei" și „1 € = 5.0000 lei" se citesc GREȘIT în română: punctul e separator de mii, deci
// „5.0000" arată a cinci mii (Alin, 21.09). Scrise cum trebuie: 2.250,00 lei · 1 € = 5,0785 lei.
function _bani(n, moneda, zec) {
  const z = zec == null ? 2 : zec;
  return (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z })
    + (moneda ? ' ' + moneda : '');
}
// Ce include abonamentul, pe fiecare mașină. Lista se scrie AICI, nu în pagină: hârtia clientului
// are un singur autor. Modulele apar doar dacă sunt bifate — altfel am promite ce nu vindem.
function _ofDe(n) {
  const x = Math.abs(Math.round(Number(n) || 0)); if (x === 0) return '';
  const r = x % 100; return (r >= 1 && r <= 19) ? '' : 'de ';
}
function _ofIncluse(o) {
  const L = ['monitorizare GPS în timp real, pe hartă și pe telefon'];
  if (o.cuDateMotor) L.push('date din motorul mașinii (consum, kilometraj, turație)');
  if (o.tahograf) L.push('modulul Tahograf — citirea fișierelor .DDD și termenele legale');
  if (o.etransport) L.push('modulul e-Transport — coduri UIT și raportarea poziției la ANAF');
  if (o.aiA) {
    const n = Math.max(1, Number(o.aiqConturi) || 1), f = Number(o.aiqFond) || 0;
    L.push('RA Insight pe ' + n + ' ' + (n === 1 ? 'cont' : 'conturi')
      + (f > 0 ? ' — ' + f + ' ' + _ofDe(f) + 'întrebări pe lună, dintr-un fond comun al firmei'
               : ' — întrebări nelimitate'));
  }
  if (o.agenti) L.push('cei 6 agenți automați care urmăresc singuri flota și anunță problemele');
  if (o.retentie) L.push('păstrarea datelor pe ' + o.retentie);
  L.push('rapoarte, alerte, actualizări și suport tehnic');
  return L;
}

// ─── Hârtia ──────────────────────────────────────────────────────────────────────────────────────
// Structura e cea cerută de Alin (21.09): întâi CÂT COSTĂ — lunar și o singură dată, două cifre
// mari, atât. Apoi detalierea fiecăreia. Iar explicațiile („ce include", „cum se plătește") la
// FINAL, ca note — nu înaintea cifrelor, unde stăteau și făceau oferta greoaie.
//
// ⚠ Fiecare sumă apare în LEI și în EURO, peste tot, în aceeași ordine. Înainte abonamentul și
// montajul erau în lei cu o coloană „≈ EUR", iar aparatele invers (euro cu „≈ lei") — pe aceeași
// hârtie, două convenții. Acum: lei mare, euro dedesubt, în toate tabelele.
function renderOfertaPdf(doc, o) {
  const left = doc.page.margins.left;
  const W = doc.page.width - left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const fx = Number(o.fxRate) || 5;
  const lei2eur = (v) => (Number(v) || 0) / fx;
  const eur2lei = (v) => (Number(v) || 0) * fx;
  let y = doc.page.margins.top;
  const spatiu = (h) => { if (y + h > bottom) { doc.addPage(); y = doc.page.margins.top; } };
  const luni = Math.max(1, Number(o.contractMonths) || 12);
  const unicLei = (Number(o.montaj) || 0) + eur2lei(o.hwTotal);

  // 1. Antet brandat — logo REAL, varianta pentru fundal alb.
  const logo = _logoBuffer();
  if (logo) { try { doc.image(logo, left, y, { height: 22 }); } catch (e) {} }
  doc.fillColor('#111').font('Nunito-Bold').fontSize(15).text('OFERTĂ', left, y + 3, { width: W, align: 'right', lineBreak: false });
  y += 26;
  doc.moveTo(left, y).lineTo(left + W, y).strokeColor('#3FE07D').lineWidth(2).stroke();
  y += 8;
  const azi = new Date();
  const dz = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  const pana = Number(o.valabilZile) > 0 ? new Date(azi.getTime() + Number(o.valabilZile) * 86400000) : null;
  doc.font('Nunito').fontSize(8.5).fillColor('#6b7280')
    .text('Data: ' + dz(azi) + (pana ? '     Valabilă până: ' + dz(pana) : ''), left, y, { lineBreak: false });
  y += 16;

  // 2. Cui îi e adresată
  const cl = o.client || {};
  if (cl.name || cl.cui || cl.contact) {
    doc.roundedRect(left, y, W, 34, 5).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.fillColor('#111').font('Nunito-Bold').fontSize(11).text(cl.name || '—', left + 9, y + 6, { width: W - 18, lineBreak: false, ellipsis: true });
    doc.fillColor('#6b7280').font('Nunito').fontSize(8)
      .text([cl.cui ? 'CUI ' + cl.cui : null, cl.contact || null].filter(Boolean).join('     ') || ' ', left + 9, y + 21, { width: W - 18, lineBreak: false, ellipsis: true });
    y += 42;
  }

  // 3. RĂSPUNSUL, în două cifre: cât dă lunar, cât dă o singură dată. Nimic altceva.
  const caseta = (x, w, titlu, lei, subtitlu, verde) => {
    doc.roundedRect(x, y, w, 62, 6).fillColor(verde ? '#f0fdf4' : '#f8fafc').fill();
    doc.roundedRect(x, y, w, 62, 6).strokeColor(verde ? '#bbf7d0' : '#e5e7eb').lineWidth(1).stroke();
    doc.fillColor('#6b7280').font('Nunito-Bold').fontSize(8)
      .text(String(titlu).toUpperCase(), x + 11, y + 9, { width: w - 22, lineBreak: false });
    doc.fillColor(verde ? '#16a34a' : '#111').font('Nunito-Bold').fontSize(17)
      .text(_bani(lei, 'lei'), x + 11, y + 22, { width: w - 22, lineBreak: false, ellipsis: true });
    doc.fillColor('#6b7280').font('Nunito').fontSize(8.5)
      .text(_bani(lei2eur(lei), '€'), x + 11, y + 42, { width: w - 22, lineBreak: false });
    doc.fillColor('#9ca3af').font('Nunito').fontSize(7)
      .text(subtitlu, x + 11, y + 52, { width: w - 22, lineBreak: false, ellipsis: true });
  };
  const gol = 10, wc = (W - gol) / 2;
  spatiu(76);
  caseta(left, wc, 'Cost lunar', o.monthly,
    'abonament pentru ' + (o.nVeh || 0) + ' ' + _ofDe(o.nVeh) + 'vehicule', true);
  caseta(left + wc + gol, wc, 'Cost unic, o singură dată', unicLei, 'echipamente și instalare', false);
  y += 70;
  doc.fillColor('#4b5563').font('Nunito').fontSize(8.5)
    .text('Total pe durata contractului (' + luni + ' ' + _ofDe(luni) + 'luni): '
      + _bani(o.contractTotal, 'lei') + ' (' + _bani(lei2eur(o.contractTotal), '€') + ') + costul unic de mai sus.',
      left, y, { width: W, lineBreak: false, ellipsis: true });
  y += 18;

  // Un tabel, o singură dată scris. ORICE sumă, în lei și în euro — lei sus, euro dedesubt, în
  // toate tabelele. `moneda` spune doar în ce monedă vin cifrele, nu cum se afișează.
  const tabel = (titlu, randuri, moneda) => {
    if (!randuri.length) return;
    spatiu(52);
    doc.fillColor('#16a34a').font('Nunito-Bold').fontSize(9).text(String(titlu).toUpperCase(), left, y, { lineBreak: false });
    y += 13;
    const cw = [W - 220, 46, 87, 87];
    const x = [left, left + cw[0], left + cw[0] + cw[1], left + cw[0] + cw[1] + cw[2]];
    ['Denumire', 'Cant.', 'Preț unitar', 'Total'].forEach((c, i) =>
      doc.font('Nunito-Bold').fontSize(7).fillColor('#6b7280').text(c, x[i], y, { width: cw[i], align: i ? 'right' : 'left', lineBreak: false }));
    y += 10;
    doc.moveTo(left, y).lineTo(left + W, y).strokeColor('#e5e7eb').lineWidth(0.7).stroke();
    y += 5;
    randuri.forEach((r) => {
      spatiu(24);
      const uLei = moneda === 'EUR' ? eur2lei(r.unit) : r.unit;
      const tLei = moneda === 'EUR' ? eur2lei(r.total) : r.total;
      doc.font('Nunito').fontSize(8.5).fillColor('#1f2937').text(String(r.label || ''), x[0], y, { width: cw[0] - 6, lineBreak: false, ellipsis: true });
      doc.text(String(r.qty || 0) + (r.perKm ? ' km' : ''), x[1], y, { width: cw[1], align: 'right', lineBreak: false });
      doc.text(_bani(uLei, 'lei') + (r.perKm ? '/km' : ''), x[2], y, { width: cw[2], align: 'right', lineBreak: false });
      doc.font('Nunito-Bold').text(_bani(tLei, 'lei'), x[3], y, { width: cw[3], align: 'right', lineBreak: false });
      doc.font('Nunito').fontSize(7).fillColor('#9ca3af')
        .text(_bani(lei2eur(uLei), '€'), x[2], y + 10, { width: cw[2], align: 'right', lineBreak: false })
        .text(_bani(lei2eur(tLei), '€'), x[3], y + 10, { width: cw[3], align: 'right', lineBreak: false });
      y += 19;
      if (r.extra) {
        doc.fillColor('#9ca3af').fontSize(7).text(String(r.extra), x[0] + 6, y - 7, { width: cw[0] - 12, lineBreak: false, ellipsis: true });
        y += 6;
      }
    });
    y += 8;
  };

  tabel('Abonament lunar', o.lines || [], 'RON');
  // Ordinea e aceeași ca în anexele contractului: întâi marfa, apoi manopera.
  tabel('Echipamente — o singură dată', o.deviceLines || [], 'EUR');
  tabel('Instalare și punere în funcțiune — o singură dată', o.montajLines || [], 'RON');

  // 4. Explicațiile, la FINAL. Cifrele au fost deja date; astea le lămuresc.
  const incluse = _ofIncluse(o);
  spatiu(28 + incluse.length * 10);
  doc.fillColor('#16a34a').font('Nunito-Bold').fontSize(9)
    .text('CE INCLUDE ABONAMENTUL LUNAR, PENTRU FIECARE VEHICUL', left, y, { lineBreak: false });
  y += 13;
  incluse.forEach((t) => {
    spatiu(12);
    doc.fillColor('#374151').font('Nunito').fontSize(8).text('•  ' + t, left + 4, y, { width: W - 8, lineBreak: false, ellipsis: true });
    y += 10;
  });
  y += 8;

  const conditii = [
    // Nu la semnarea contractului — Alin, 21.09: „costul unic nu-l facturăm la semnare, ci după ce
    // vin echipamentele și după ce le instalăm". Aceeași formulare ca în anexa contractului
    // („la livrare și la execuție"), ca actele noastre să nu se contrazică.
    'Echipamentele se facturează la livrare, iar instalarea după punerea în funcțiune. Costul unic nu face parte din abonamentul lunar.',
    'Abonamentul lunar se facturează în fiecare lună, pe toată durata contractului (' + luni + ' ' + _ofDe(luni) + 'luni).',
    'Echipamentele rămân în proprietatea Beneficiarului după achitarea lor. Instalarea o executăm noi, la sediul Beneficiarului.',
    // „Cursul BNR" se scrie DOAR dacă de la BNR vine. Când n-a putut fi preluat, folosim o valoare
    // de rezervă — și atunci hârtia spune „curs de referință", nu pune numele BNR pe o cifră care nu e
    // a lui. Pe ecran, fondatorul vede un avertisment înainte să trimită oferta.
    (o.fxSursa === 'BNR'
      ? 'Facturarea se face în lei. Sumele în euro sunt informative, la cursul BNR'
        + (o.fxDate ? ' din ' + o.fxDate : '') + ': 1 € = ' + _bani(fx, 'lei', 4) + '.'
      : 'Facturarea se face în lei. Sumele în euro sunt orientative, la un curs de referință de 1 € = '
        + _bani(fx, 'lei', 4) + '.')
  ];
  if (o.aiA && Number(o.pretCont) > 0) {
    conditii.splice(2, 0, 'Prețul unui cont de RA Insight este ' + _bani(o.pretCont, 'lei')
      + '/lună. Numărul de conturi se modifică oricând din aplicație, iar factura urmează numărul de conturi active în luna respectivă. '
      + 'Când fondul de întrebări al lunii se termină, RA Insight se oprește până la reînnoire — nu există costuri suplimentare.');
  }
  spatiu(26);
  doc.fillColor('#16a34a').font('Nunito-Bold').fontSize(9).text('CONDIȚII', left, y, { lineBreak: false });
  y += 13;
  doc.font('Nunito').fontSize(7.5);
  conditii.forEach((t) => {
    const h = doc.heightOfString('•  ' + t, { width: W - 8 });
    spatiu(h + 4);
    doc.fillColor('#4b5563').font('Nunito').fontSize(7.5).text('•  ' + t, left + 4, y, { width: W - 8 });
    y = doc.y + 3;
  });

  if (o.notes) {
    y += 6;
    const h = doc.heightOfString(String(o.notes), { width: W });
    spatiu(h + 20);
    doc.fillColor('#16a34a').font('Nunito-Bold').fontSize(9).text('OBSERVAȚII', left, y, { lineBreak: false });
    y += 13;
    doc.fillColor('#374151').font('Nunito').fontSize(8).text(String(o.notes), left, y, { width: W });
    y = doc.y;
  }
}

function ofertaToPdf(o) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: 'Ofertă RA Tracks', Author: 'RA Track' } });
      try {
        doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
        doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
      } catch (e) {
        try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
      }
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      renderOfertaPdf(doc, o || {});
      doc.end();
    } catch (e) { reject(e); }
  });
}
// Numele fișierului urmează regula casei, ca la rapoarte: „RA-Tracks - Ofertă {client} - {data}".
async function sendOfertaPdf(res, o) {
  const cine = (o && ((o.client && o.client.name) || o.offerName)) || 'client';
  const name = safeName('RA-Tracks - Ofertă ' + cine + ' - ' + datePart());
  const buf = await ofertaToPdf(o);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition(name + '.pdf'));
  return res.send(buf);
}
// ─── sfârșit „oferta, ca fișier descărcat" ──

module.exports = { toXlsx, toPdf, sendReport, ofertaToPdf, sendOfertaPdf };
