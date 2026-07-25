// build_docs.js — 2 PDF-uri RA Tracks: (1) "Ce avem ready acum" (status), (2) flyer showcase funcționalități.
// Totul desenat în pdfkit: branding Nunito (full latin), iconuri Font Awesome, grafice + mockup-uri UI „stil app".
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, 'assets');

const GREEN = '#3FE07D', GREEN_D = '#16a34a', INK = '#0b1f17', DARK = '#0d1411', DARK2 = '#15241c';
const TXT = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', LIGHT = '#f8fafc';
const PAL = ['#3FE07D', '#f59e0b', '#3b82f6', '#a855f7', '#14b8a6', '#ec4899'];
const _c = h => String.fromCharCode(parseInt(h, 16));
const FA = { truck:_c('f0d1'), pin:_c('f3c5'), chartLine:_c('f201'), chartBar:_c('f080'), gas:_c('f52f'), gauge:_c('f625'), wrench:_c('f0ad'), shield:_c('f3ed'), file:_c('f15c'), gear:_c('f013'), route:_c('f4d7'), bell:_c('f0f3'), leaf:_c('f06c'), users:_c('f0c0'), mobile:_c('f3cf'), key:_c('f084'), clock:_c('f017'), check:_c('f00c'), bolt:_c('f0e7'), map:_c('f279'), coins:_c('f51e'), flag:_c('f024'), plug:_c('f1e6'), database:_c('f1c0'), satellite:_c('f7c0') };

function reg(doc) {
  doc.registerFont('N', path.join(A, 'Nunito-Regular.ttf'));
  doc.registerFont('NB', path.join(A, 'Nunito-Bold.ttf'));
  doc.registerFont('NX', path.join(A, 'Nunito-ExtraBold.ttf'));
  doc.registerFont('FA', path.join(A, 'fa-solid-900.ttf'));
}
const _num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
function icon(doc, code, x, y, size, color) { doc.font('FA').fontSize(size).fillColor(color).text(code, x, y, { lineBreak: false }); }
function axColor(t) { return t === 'dark' ? '#9fb3aa' : '#6b7280'; }
function photoBanner(doc, img, x, y, w, h, r, op) {
  doc.save(); doc.roundedRect(x, y, w, h, r || 0).clip();
  try { doc.image(path.join(A, img), x, y, { cover: [w, h] }); } catch (e) { doc.rect(x, y, w, h).fillColor('#16241d').fill(); }
  doc.rect(x, y, w, h).fillColor('#04140d').fillOpacity(op == null ? 0.4 : op).fill(); doc.fillOpacity(1);
  doc.restore();
}

// ─── Grafice ───
function chartBar(doc, x, y, w, h, labels, data, t) {
  const n = labels.length, max = Math.max(1, ...data.map(_num)), padB = 13, ph = h - padB;
  doc.moveTo(x, y + ph).lineTo(x + w, y + ph).strokeColor(t === 'dark' ? 'rgba(255,255,255,.12)' : LINE).lineWidth(0.8).stroke();
  const bw = w / n;
  for (let i = 0; i < n; i++) { const v = _num(data[i]), bh = (v / max) * (ph - 2);
    doc.roundedRect(x + i * bw + bw * 0.2, y + ph - bh, bw * 0.6, Math.max(1, bh), 1.5).fillColor(GREEN).fill();
    doc.font('N').fontSize(6).fillColor(axColor(t)).text(String(labels[i]), x + i * bw, y + ph + 3, { width: bw, align: 'center', lineBreak: false }); }
}
function chartLine(doc, x, y, w, h, labels, data, t) {
  const n = labels.length, max = Math.max(1, ...data.map(_num)), padB = 13, ph = h - padB, step = n > 1 ? w / (n - 1) : 0;
  doc.moveTo(x, y + ph).lineTo(x + w, y + ph).strokeColor(t === 'dark' ? 'rgba(255,255,255,.12)' : LINE).lineWidth(0.8).stroke();
  const P = i => ({ px: x + i * step, py: y + ph - (_num(data[i]) / max) * (ph - 2) });
  doc.strokeColor(GREEN).lineWidth(2);
  for (let i = 0; i < n; i++) { const p = P(i); i ? doc.lineTo(p.px, p.py) : doc.moveTo(p.px, p.py); } doc.stroke();
  for (let i = 0; i < n; i++) { const p = P(i); doc.circle(p.px, p.py, 2.4).fillColor(GREEN).fill();
    doc.font('N').fontSize(6).fillColor(axColor(t)).text(String(labels[i]), p.px - step / 2, y + ph + 3, { width: step, align: 'center', lineBreak: false }); }
}
function chartDoughnut(doc, cx, cy, r, data, t, hole) {
  const total = data.reduce((a, b) => a + _num(b), 0) || 1; let a0 = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) { const f = _num(data[i]) / total; if (f <= 0) continue; const a1 = a0 + f * 2 * Math.PI;
    const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0), x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1), lg = (a1 - a0) > Math.PI ? 1 : 0;
    doc.path('M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + lg + ' 1 ' + x2 + ' ' + y2 + ' Z').fillColor(PAL[i % PAL.length]).fill(); a0 = a1; }
  if (hole) doc.circle(cx, cy, r * 0.58).fillColor(t === 'dark' ? DARK2 : '#fff').fill();
}
function gaugeArc(doc, cx, cy, r, score) {
  doc.path('M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy).strokeColor('rgba(255,255,255,.12)').lineWidth(9).stroke();
  doc.strokeColor(GREEN).lineWidth(9);
  const segs = 50; for (let i = 0; i <= segs; i++) { const ai = Math.PI - (Math.PI * score / 100) * (i / segs); const px = cx + r * Math.cos(ai), py = cy - r * Math.sin(ai); i ? doc.lineTo(px, py) : doc.moveTo(px, py); } doc.stroke();
  doc.font('NX').fontSize(28).fillColor('#fff').text(String(score), cx - 40, cy - 24, { width: 80, align: 'center', lineBreak: false });
  doc.font('N').fontSize(7.5).fillColor('#9fb3aa').text('scor EcoDrive', cx - 50, cy + 4, { width: 100, align: 'center', lineBreak: false });
}

// ─── Mockup-uri „stil app" ───
function panel(doc, x, y, w, h, title) {
  doc.roundedRect(x, y, w, h, 10).fillColor(DARK).fill();
  doc.roundedRect(x, y, w, h, 10).strokeColor('rgba(63,224,125,.25)').lineWidth(1).stroke();
  doc.font('NB').fontSize(9).fillColor('#cfe9dd').text(title, x + 14, y + 11, { lineBreak: false });
  doc.circle(x + w - 40, y + 16, 2.6).fillColor(GREEN).fill();
  doc.font('N').fontSize(7).fillColor(GREEN).text('LIVE', x + w - 34, y + 12, { width: 24, lineBreak: false });
}
function mockMap(doc, x, y, w, h) {
  panel(doc, x, y, w, h, 'Localizare live');
  const ix = x + 12, iy = y + 30, iw = w - 24, ih = h - 42;
  doc.save().roundedRect(ix, iy, iw, ih, 7).clip();
  doc.rect(ix, iy, iw, ih).fillColor('#16241d').fill();
  doc.strokeColor('rgba(255,255,255,.06)').lineWidth(2);
  for (let i = 1; i < 7; i++) doc.moveTo(ix, iy + ih * i / 7).lineTo(ix + iw, iy + ih * i / 7).stroke();
  for (let i = 1; i < 11; i++) doc.moveTo(ix + iw * i / 11, iy).lineTo(ix + iw * i / 11, iy + ih).stroke();
  doc.moveTo(ix + iw * .1, iy + ih * .82); doc.bezierCurveTo(ix + iw * .3, iy + ih * .25, ix + iw * .55, iy + ih * .95, ix + iw * .9, iy + ih * .2);
  doc.strokeColor(GREEN).lineWidth(2.8).stroke();
  [[.1, .82], [.45, .58], [.9, .2]].forEach(p => { const px = ix + iw * p[0], py = iy + ih * p[1]; doc.circle(px, py, 7).fillColor(GREEN).fill(); doc.circle(px, py, 7).strokeColor('#06210F').lineWidth(1).stroke(); icon(doc, FA.truck, px - 3.6, py - 3.8, 7, '#06210F'); });
  doc.restore();
}
function mockReport(doc, x, y, w, h) {
  panel(doc, x, y, w, h, 'Rapoarte & analize');
  const ix = x + 14, iy = y + 32, kw = (w - 28) / 3;
  [['16', 'curse'], ['344 km', 'distanță'], ['9h 34m', 'durată']].forEach((k, i) => { const kx = ix + i * kw;
    doc.roundedRect(kx, iy, kw - 8, 26, 5).fillColor(DARK2).fill();
    doc.font('NB').fontSize(11).fillColor(GREEN).text(k[0], kx + 8, iy + 4, { lineBreak: false });
    doc.font('N').fontSize(6.5).fillColor('#8aa89c').text(k[1], kx + 8, iy + 17, { lineBreak: false }); });
  const gy = iy + 36, gw = (w - 28) / 2 - 8, gh = h - (gy - y) - 16;
  chartBar(doc, ix, gy, gw, gh, ['L', 'M', 'M', 'J', 'V', 'S'], [40, 80, 46, 104, 38, 60], 'dark');
  chartDoughnut(doc, ix + gw + 16 + gw / 2, gy + gh / 2, Math.min(gh, gw) / 2 - 4, [40, 30, 18, 12], 'dark', true);
}
function mockFuel(doc, x, y, w, h) {
  panel(doc, x, y, w, h, 'Consum & costuri');
  const ix = x + 14, iy = y + 32, kw = (w - 28) / 3;
  [['7.6 L', 'mediu /100km'], ['1.2 RON', 'cost /km'], ['-12%', 'vs. luna trecută']].forEach((k, i) => { const kx = ix + i * kw;
    doc.roundedRect(kx, iy, kw - 8, 26, 5).fillColor(DARK2).fill();
    doc.font('NB').fontSize(11).fillColor(i === 2 ? GREEN : '#e6f3ec').text(k[0], kx + 8, iy + 4, { lineBreak: false });
    doc.font('N').fontSize(6.5).fillColor('#8aa89c').text(k[1], kx + 8, iy + 17, { lineBreak: false }); });
  chartLine(doc, ix, iy + 36, w - 28, h - (iy + 36 - y) - 16, ['09', '10', '11', '12', '13', '14', '15', '17'], [7.2, 8.1, 6.8, 9.4, 7.0, 7.8, 6.9, 6.2], 'dark');
}
function mockFleet(doc, x, y, w, h) {
  panel(doc, x, y, w, h, 'Management flotă & EcoDrive');
  const rows = [['Dacia Logan 3', 'B 154 UIP · în mișcare', GREEN, 'A'], ['MAN TGS 26.480', 'B 99 MAN · în mișcare', GREEN, 'A'], ['Ford Transit', 'CJ 12 ABC · staționat', '#f59e0b', 'B'], ['VW Crafter', 'B 77 VWC · oprit', '#6b7280', 'C'], ['Iveco Daily', 'TM 04 IVE · în mișcare', GREEN, 'B'], ['Renault Master', 'IS 21 REN · staționat', '#f59e0b', 'A']];
  const colW = (w - 28) / 2;
  rows.forEach((r, idx) => { const col = idx % 2, row = Math.floor(idx / 2); const rx = x + 14 + col * colW, ry = y + 32 + row * 30;
    doc.roundedRect(rx, ry, colW - 8, 26, 5).fillColor(DARK2).fill();
    doc.circle(rx + 12, ry + 13, 3.5).fillColor(r[2]).fill();
    doc.font('NB').fontSize(8.5).fillColor('#e6f3ec').text(r[0], rx + 24, ry + 4, { width: colW - 60, lineBreak: false });
    doc.font('N').fontSize(6.5).fillColor('#8aa89c').text(r[1], rx + 24, ry + 15, { width: colW - 60, lineBreak: false });
    doc.roundedRect(rx + colW - 32, ry + 6, 16, 14, 3).fillColor('rgba(63,224,125,.15)').fill();
    doc.font('NB').fontSize(9).fillColor(GREEN).text(r[3], rx + colW - 32, ry + 8, { width: 16, align: 'center', lineBreak: false }); });
}

// ─── Pagină ───
function pageHeader(doc, M, sub) {
  doc.roundedRect(M, M, 30, 22, 5).fillColor(GREEN).fill();
  doc.font('NX').fontSize(14).fillColor(INK).text('RA', M, M + 4, { width: 30, align: 'center', lineBreak: false });
  doc.font('NX').fontSize(16).fillColor('#111').text('Tracks', M + 36, M + 4, { lineBreak: false });
  if (sub) doc.font('N').fontSize(9).fillColor(MUTED).text(sub, M, M + 6, { width: doc.page.width - 2 * M, align: 'right', lineBreak: false });
  doc.moveTo(M, M + 30).lineTo(doc.page.width - M, M + 30).strokeColor(GREEN).lineWidth(2).stroke();
}
function pageFooter(doc, M, n) {
  const fy = doc.page.height - M - 12;
  doc.font('N').fontSize(7.5).fillColor(MUTED).text('RA Tracks · Monitorizare GPS flotă · ratrack.ro', M, fy, { lineBreak: false });
  doc.font('N').fontSize(7.5).fillColor(MUTED).text(String(n), doc.page.width - M - 30, fy, { width: 30, align: 'right', lineBreak: false });
}
function check(doc, x, y, txt, desc) {
  icon(doc, FA.check, x, y, 9, GREEN_D);
  doc.font('NB').fontSize(9.5).fillColor(TXT).text(txt, x + 14, y - 1, { continued: !!desc, lineBreak: false });
  if (desc) doc.font('N').fontSize(9.5).fillColor(MUTED).text('  —  ' + desc, { lineBreak: false });
}

// ════════ DOC 1 — Ce avem ready ════════
function catBlock(doc, M, y, c) {
  icon(doc, c[0], M, y, 12, GREEN_D);
  doc.font('NX').fontSize(13).fillColor('#111').text(c[1], M + 18, y - 1); y += 19;
  c[2].forEach(f => { check(doc, M + 4, y, f[0], f[1]); y += 15.5; });
  return y + 8;
}
function roadmapBlock(doc, M, y, CW, items) {
  const AMBER = '#f59e0b', AMBER_BG = '#fffbeb', AMBER_LN = '#fcd34d', AMBER_D = '#b45309';
  const h = 48 + items.length * 17 + 8;
  doc.roundedRect(M, y, CW, h, 9).fillColor(AMBER_BG).fill();
  doc.roundedRect(M, y, CW, h, 9).strokeColor(AMBER_LN).lineWidth(1).stroke();
  icon(doc, FA.clock, M + 16, y + 14, 14, AMBER);
  doc.font('NX').fontSize(12).fillColor(AMBER_D).text('ÎN DEZVOLTARE · ÎN CURÂND', M + 38, y + 13, { lineBreak: false });
  doc.font('N').fontSize(8).fillColor('#92722f').text('integrări în lucru — nu sunt încă funcționale în producție', M + 38, y + 28, { lineBreak: false });
  let iy = y + 48;
  items.forEach(function (it) {
    doc.circle(M + 20, iy + 5, 2.5).fillColor(AMBER).fill();
    doc.font('NB').fontSize(9.5).fillColor(TXT).text(it[0], M + 30, iy, { continued: true, lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text('  —  ' + it[1], { lineBreak: false });
    iy += 17;
  });
  return y + h + 10;
}
function buildDoc1() {
  const M = 40, doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: 'RA Tracks - Ce avem ready', Author: 'RA Tracks' } });
  reg(doc); const out = fs.createWriteStream(path.join(__dirname, 'RA-Tracks_Ce-avem-ready.pdf')); doc.pipe(out);
  const CW = doc.page.width - 2 * M;
  pageHeader(doc, M, 'Status platformă · ' + new Date().toLocaleDateString('ro-RO'));
  let y = M + 44;
  doc.font('NX').fontSize(22).fillColor('#111').text('Ce avem gata acum', M, y); y += 30;
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Platformă de monitorizare GPS și management de flotă, funcțională în producție. Mai jos: ce e gata acum — și, separat, ce e în dezvoltare.', M, y, { width: CW }); y += 36;
  [
    [FA.map, 'Localizare & traseu', [['Localizare live', 'poziții în timp real pe 4G, la ~30s'], ['Istoric traseu', 'reluare pe orice interval, snap pe drum (map-matching)'], ['Hartă de căldură', 'unde stau / trec cel mai des vehiculele'], ['Sticky CAN', 'păstrează carburant/odometru când motorul e oprit']]],
    [FA.chartBar, 'Rapoarte & analize', [['32 de tipuri de rapoarte', 'foaie de parcurs, opriri, depășiri, consum, costuri…'], ['Grafice interactive', 'click pe grafic filtrează tabelul; hover evidențiază'], ['Sortare & drill-down', 'sortare pe coloană'], ['Export PDF / Excel', 'PDF brandat cu grafice, pe web și pe mobil'], ['Rapoarte programate', 'trimise automat pe email']]],
    [FA.gas, 'Combustibil & costuri', [['Monitorizare consum', 'din CAN sau sondă litrometrică calibrată'], ['Detecție alimentări & furt', 'sesizează scăderi bruște suspecte'], ['Costuri & L/100km', 'pe vehicul, preț configurabil'], ['Emisii CO2', 'estimate din consum']]],
    [FA.shield, 'Siguranță șoferi', [['EcoDrive', 'scor comportament + clasament pe vehicul și șofer'], ['Depășiri viteză & ralanti', 'cu durate și locații'], ['Alerte automate', 'praguri configurabile']]]
  ].forEach(c => { y = catBlock(doc, M, y, c); });
  pageFooter(doc, M, 1);

  doc.addPage(); pageHeader(doc, M, 'Status platformă'); y = M + 44;
  [
    [FA.truck, 'Management flotă', [['Vehicule, șoferi, grupe', 'fișă bogată per vehicul'], ['Mentenanță & documente', 'service, ITP, RCA, expirări cu alerte'], ['Import / export CSV', 'adaugi flota rapid'], ['Dispozitive arhivate', 'la încheiere contract — oprește ingestul, păstrează istoricul 2 ani']]],
    [FA.database, 'CAN / IO & decodare', [['Decodare Teltonika Codec8E', 'LV-CAN200 (Dacia) + FMS (camioane)'], ['Editor mapări per dispozitiv', 'scale/offset/unitate, cu preview live'], ['Catalog IO', 'sursă unică pentru parametri']]],
    [FA.gear, 'Platformă & integrare', [['Multi-tenant', 'companii izolate, super-admin'], ['Roluri & permisiuni', 'admin, manager, dispecer, client, viewer'], ['API REST + documentație', 'chei API per utilizator, docs în aplicație'], ['Aplicație mobilă', 'Android nativ (Capacitor) — iOS în pregătire'], ['Jurnal audit', 'urmă completă a acțiunilor']]]
  ].forEach(c => { y = catBlock(doc, M, y, c); });
  y = roadmapBlock(doc, M, y + 8, CW, [['e-Transport (ANAF)', 'integrare ANAF în lucru'], ['Tahograf (.DDD)', 'citire reală fișiere .DDD în lucru'], ['E-Toll / Roviniete', 'taxe de drum & viniete']]);
  y += 4; doc.roundedRect(M, y, CW, 60, 8).fillColor('#f0fdf4').fill();
  doc.roundedRect(M, y, CW, 60, 8).strokeColor('rgba(63,224,125,.4)').lineWidth(1).stroke();
  [['32', 'tipuri rapoarte'], ['2 ani', 'retenție arhivă'], ['4G', 'conectivitate'], ['Web + Mobil', 'browser · Android']].forEach((k, i) => { const kx = M + 16 + i * (CW / 4);
    doc.font('NX').fontSize(20).fillColor(GREEN_D).text(k[0], kx, y + 12, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor(MUTED).text(k[1], kx, y + 38, { lineBreak: false }); });
  pageFooter(doc, M, 2);
  doc.end(); return new Promise(r => out.on('finish', r));
}

// ════════ DOC 2 — Flyer ════════
function featurePage(doc, M, f, n) {
  const W = doc.page.width, H = doc.page.height, CW = W - 2 * M;
  doc.rect(0, 0, W, H).fillColor('#fff').fill();
  pageHeader(doc, M, 'Funcționalități');
  let y = M + 46;
  doc.roundedRect(M, y, 40, 40, 9).fillColor('#f0fdf4').fill();
  icon(doc, f.icon, M + 11, y + 11, 18, GREEN_D);
  doc.font('NX').fontSize(20).fillColor('#111').text(f.title, M + 52, y + 2, { width: CW - 52 });
  doc.font('N').fontSize(11).fillColor(MUTED).text(f.lead, M + 52, y + 27, { width: CW - 52 });
  y += 58;
  if (f.photo) { photoBanner(doc, f.photo, M, y, CW, 94, 10); y += 106; }
  f.mock(doc, M, y, CW, 204); y += 218;
  const rows2 = Math.ceil(f.bullets.length / 2), bandH = 28 + rows2 * 22;
  doc.roundedRect(M, y, CW, bandH, 10).fillColor(LIGHT).fill();
  doc.roundedRect(M, y, CW, bandH, 10).strokeColor(LINE).lineWidth(1).stroke();
  doc.font('NX').fontSize(9.5).fillColor(GREEN_D).text('CE OBȚII', M + 16, y + 11, { lineBreak: false });
  f.bullets.forEach((b, i) => { const col = i % 2, row = Math.floor(i / 2); const bx = M + 16 + col * (CW / 2 - 8), by = y + 30 + row * 22;
    icon(doc, FA.check, bx, by + 1, 9, GREEN); doc.font('N').fontSize(9.5).fillColor(TXT).text(b, bx + 15, by, { width: CW / 2 - 36, lineBreak: false }); });
  y += bandH + 16;
  f.stats.forEach((s, i) => { const sx = M + i * (CW / f.stats.length);
    doc.font('NX').fontSize(19).fillColor(GREEN_D).text(s[0], sx, y, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor(MUTED).text(s[1], sx, y + 24, { width: CW / f.stats.length - 8 }); });
  if (f.highlight) { const hy = H - M - 98;
    doc.roundedRect(M, hy, CW, 58, 11).fillColor(DARK).fill();
    doc.rect(M, hy, 5, 58).fillColor(GREEN).fill();
    icon(doc, FA.bolt, M + 22, hy + 21, 16, GREEN);
    doc.font('NB').fontSize(8.5).fillColor(GREEN).text('DE CE CONTEAZĂ', M + 48, hy + 13, { lineBreak: false });
    doc.font('N').fontSize(11.5).fillColor('#e6f3ec').text(f.highlight, M + 48, hy + 28, { width: CW - 72, lineBreak: false }); }
  pageFooter(doc, M, n);
}
function buildDoc2() {
  const M = 40, doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: 'RA Tracks - Flyer', Author: 'RA Tracks' } });
  reg(doc); const out = fs.createWriteStream(path.join(__dirname, 'RA-Tracks_Flyer.pdf')); doc.pipe(out);
  const W = doc.page.width, H = doc.page.height, CW = W - 2 * M;

  doc.rect(0, 0, W, H).fillColor(DARK).fill();
  photoBanner(doc, 'photo_hero.jpg', 0, 0, W, 392, 0, 0.32);
  doc.rect(0, 236, W, 156).fillColor(DARK).fillOpacity(0.55).fill(); doc.fillOpacity(1);
  doc.rect(0, 0, W, 6).fillColor(GREEN).fill();
  doc.roundedRect(M, 40, 40, 30, 7).fillColor(GREEN).fill();
  doc.font('NX').fontSize(19).fillColor(INK).text('RA', M, 47, { width: 40, align: 'center', lineBreak: false });
  doc.font('NX').fontSize(21).fillColor('#fff').text('Tracks', M + 50, 48, { lineBreak: false });
  doc.font('NX').fontSize(34).fillColor('#fff').text('Toată flota ta,', M, 298, { width: CW });
  doc.font('NX').fontSize(34).fillColor(GREEN).text('în timp real.', M, 338, { width: CW });
  doc.rect(0, 392, W, 4).fillColor(GREEN).fill();
  doc.font('N').fontSize(12).fillColor('#c9ddd3').text('Localizare live, rapoarte cu grafice, consum, siguranță și conformitate — totul într-o singură platformă, pe web și pe mobil.', M, 414, { width: CW - 20 });
  mockMap(doc, M, 470, CW, 192);
  [[FA.satellite, 'Live pe 4G', 'poziții în timp real'], [FA.chartLine, 'Rapoarte clare', '32 de tipuri, cu grafice'], [FA.leaf, 'Consum & costuri', 'economisești carburant']].forEach((v, i) => { const vx = M + i * (CW / 3); icon(doc, v[0], vx, 686, 16, GREEN);
    doc.font('NB').fontSize(11).fillColor('#fff').text(v[1], vx + 24, 684, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor('#9fb3aa').text(v[2], vx + 24, 698, { width: CW / 3 - 30 }); });
  doc.font('N').fontSize(9).fillColor('#7e948a').text('Monitorizare GPS & management de flotă · ratrack.ro', M, H - 46, { lineBreak: false });

  const FEATS = [
    { icon: FA.pin, title: 'Localizare live & istoric', lead: 'Vezi exact unde e fiecare vehicul, în timp real. Reluă orice traseu, lipit perfect pe drum.', mock: mockMap, bullets: ['Poziții live pe 4G (la ~30s), contact și viteză', 'Istoric traseu + map-matching pe drum', 'Hartă de căldură: unde stau / trec des', 'Geofence: alerte la intrare/ieșire'], stats: [['4G', 'conectivitate'], ['OSM', 'traseu lipit pe drum'], ['180 zile', 'istoric traseu']], highlight: 'Reduci timpii morți și știi mereu unde e marfa ta — în orice moment.' },
    { icon: FA.chartBar, title: 'Rapoarte & analize cu grafice', lead: 'Peste 30 de tipuri de rapoarte, fiecare cu grafice. Click pe un grafic filtrează tabelul.', mock: mockReport, bullets: ['Foaie de parcurs, opriri, depășiri, utilizare', 'Sortare pe coloană + evidențiere la hover', 'Export PDF brandat (cu grafice) și Excel', 'Trimitere automată pe email, programat'], stats: [['32', 'tipuri de rapoarte'], ['2-3', 'grafice / raport'], ['PDF', 'web + mobil + email']], highlight: 'Exporți orice raport în PDF brandat, cu grafice — gata de trimis clientului.' },
    { icon: FA.gas, title: 'Combustibil, consum & costuri', lead: 'Știi exact cât consumi, cât te costă și unde pierzi carburant.', mock: mockFuel, bullets: ['Consum din CAN sau sondă calibrată', 'Detecție alimentări și furt (scăderi bruște)', 'Cost/km și L/100km pe vehicul', 'Emisii CO2 estimate din consum'], stats: [['CAN', 'sau sondă litrometrică'], ['L/100', 'pe vehicul'], ['RON', 'cost / km']], highlight: 'Identifici risipa și furtul de combustibil — economii reale, lună de lună.' },
    { icon: FA.shield, title: 'Siguranță & management flotă', lead: 'Șoferi mai siguri și o flotă organizată: scor EcoDrive, mentenanță, documente.', mock: mockFleet, bullets: ['EcoDrive: scor pe vehicul și pe șofer', 'Mentenanță: service, ITP, RCA cu alerte', 'Vehicule, șoferi, grupe; import/export CSV', 'Arhivare la încheiere contract (istoric 2 ani)'], stats: [['A-E', 'notă EcoDrive'], ['0', 'expirări ratate'], ['CSV', 'import rapid']], highlight: 'Șoferi mai responsabili: mai puține accidente, amenzi și uzură.' }
  ];
  const PHOTOS = ['photo_road.jpg', 'photo_truck2.jpg', 'photo_fuel.jpg', 'photo_driver.jpg'];
  FEATS.forEach((f, i) => { doc.addPage(); featurePage(doc, M, Object.assign({}, f, { photo: PHOTOS[i] }), i + 2); });

  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Inclus în platformă');
  let y = M + 50;
  doc.font('NX').fontSize(19).fillColor('#111').text('Integrare, mobil și conformitate', M, y); y += 32;
  [[FA.flag, 'e-Transport (ANAF)', 'în curând', 'soon'], [FA.clock, 'Tahograf', 'în curând', 'soon'], [FA.mobile, 'Aplicație mobilă', 'Android nativ — iOS în pregătire'], [FA.key, 'API + documentație', 'integrezi orice sistem'], [FA.users, 'Multi-utilizator', 'roluri & permisiuni'], [FA.bell, 'Alerte automate', 'praguri configurabile']].forEach((g, i) => { const gx = M + (i % 2) * (CW / 2 + 10), gy = y + Math.floor(i / 2) * 72; var soon = g[3] === 'soon', ac = soon ? '#f59e0b' : GREEN, acD = soon ? '#b45309' : GREEN_D, acBg = soon ? '#fffbeb' : '#f0fdf4';
    doc.roundedRect(gx, gy, CW / 2 - 5, 60, 9).strokeColor(soon ? '#fcd34d' : LINE).lineWidth(1).stroke();
    doc.roundedRect(gx, gy, 4, 60, 2).fillColor(ac).fill();
    doc.roundedRect(gx + 14, gy + 13, 26, 26, 6).fillColor(acBg).fill();
    icon(doc, g[0], gx + 21, gy + 19, 14, acD);
    doc.font('NB').fontSize(11.5).fillColor('#111').text(g[1], gx + 50, gy + 13, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor(soon ? acD : MUTED).text(g[2], gx + 50, gy + 29, { width: CW / 2 - 60 }); });
  y += 3 * 72 + 22; doc.roundedRect(M, y, CW, 58, 8).fillColor('#f0fdf4').fill(); doc.roundedRect(M, y, CW, 58, 8).strokeColor('rgba(63,224,125,.4)').lineWidth(1).stroke(); [['32', 'tipuri rapoarte'], ['2 ani', 'retenție arhivă'], ['4G', 'conectivitate'], ['Web + Mobil', 'browser · Android']].forEach((k, i) => { const kx = M + 16 + i * (CW / 4); doc.font('NX').fontSize(18).fillColor(GREEN_D).text(k[0], kx, y + 11, { lineBreak: false }); doc.font('N').fontSize(8).fillColor(MUTED).text(k[1], kx, y + 35, { lineBreak: false }); }); y += 58 + 24;
  doc.roundedRect(M, y, CW, 96, 12).fillColor(DARK).fill(); doc.rect(M, y, 5, 96).fillColor(GREEN).fill();
  doc.font('NX').fontSize(19).fillColor('#fff').text('Gata să-ți pui flota pe hartă?', M + 26, y + 20);
  doc.font('N').fontSize(10.5).fillColor('#c9ddd3').text('Cere o demonstrație — îți arătăm platforma pe vehiculele tale.', M + 26, y + 50, { width: CW - 210 });
  doc.roundedRect(W - M - 160, y + 32, 134, 34, 8).fillColor(GREEN).fill();
  doc.font('NX').fontSize(13).fillColor(INK).text('ratrack.ro', W - M - 160, y + 42, { width: 134, align: 'center', lineBreak: false });
  pageFooter(doc, M, FEATS.length + 2);
  doc.end(); return new Promise(r => out.on('finish', r));
}

(async () => { await buildDoc1(); await buildDoc2(); console.log('DONE'); })();
