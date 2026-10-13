// incarcare_pdf.js — planul de încărcare pe hârtie (simulatorul, pasul 3, 12.10; butonul „Descarcă PDF" din machetă).
//
// Primește REZULTATUL simulării (incarcare.simuleaza, aceleași cifre și texte ca pe ecran) și îl desenează: cifrele de sus,
// desenul văzut de sus și din lateral (același desen ca ecranul, citit din pagină), marfa, greutatea pe osii și ce e de
// corectat. Nu socotește nimic: dacă ar socoti, hârtia s-ar putea despărți de ecran. Logo-ul casei pentru fundal alb
// (logo-light.png), fonturile cu diacritice, numele după regula casei: „RA-Track - Plan de încărcare B 101 RAT - 12.10.2026.pdf".
//
// Fișierul e CURAT: nu atinge baza și nu știe de rute.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TEXT = '#1a2235', GRI = '#64748b', LINIE = '#cbd5e1', FUNDAL = '#f8fafc';
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

// Desenul de pe hârtie = desenul de pe ecran (Robert, 13.10: „da" la „refac la fel și desenul de pe hârtie?"). Hârtia NU are
// al doilea desen: citește funcția paginii (public/index.html, blocul „desenul simulatorului" — aceeași pe care o copiază și
// telefonul) și culorile temei deschise din public/css/app.css, apoi pune pe hârtie poligoanele, liniile și etichetele pe
// care le-ar pune ecranul. Se citesc o dată, la primul plan; fără ele, hârtia spune că desenul lipsește (nu desenează altul).
const REPER_DESEN = ['// ── începe „desenul simulatorului" ──', '// ── sfârșit „desenul simulatorului" ──'];
let _desenCitit = null;
function desenPagina() {
  if (_desenCitit) return _desenCitit.simSvg ? _desenCitit : null;
  _desenCitit = {};
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const a = html.indexOf(REPER_DESEN[0]), b = html.indexOf(REPER_DESEN[1]);
    if (a < 0 || b < a) return null;
    const m = { exports: {} };
    vm.runInNewContext(html.slice(a, b) + '\nmodule.exports = { simSvg: _simSvg };', { module: m }, { filename: 'index.html#desenul-simulatorului', timeout: 2000 });
    const stil = _stilDesen(fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8'));
    if (typeof m.exports.simSvg === 'function') _desenCitit = { simSvg: m.exports.simSvg, stil };
  } catch (e) { _desenCitit = {}; }
  return _desenCitit.simSvg ? _desenCitit : null;
}

// Culorile temei deschise: regulile „.sim-svg .sim-…" (nu cele cu body.dark); fondul din „.sim-svg { background }".
function _stilDesen(css) {
  const st = { _fond: null };
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^}]*)\}/g, (tot, sel, decl) => {
    const d = {};
    decl.split(';').forEach((x) => { const i = x.indexOf(':'); if (i > 0) d[x.slice(0, i).trim()] = x.slice(i + 1).trim(); });
    sel.split(',').map((s) => s.trim()).forEach((s) => {
      const k = /^\.sim-svg \.(sim-[\w-]+)$/.exec(s);
      if (k) st[k[1]] = Object.assign(st[k[1]] || {}, d);
      else if (s === '.sim-svg' && d.background) st._fond = d.background;
    });
    return tot;
  });
  return st;
}

// O culoare din CSS / SVG pentru PDFKit: { c, a } (a = opacitatea), sau null pentru „none".
function _culoare(c) {
  if (!c || c === 'none' || c === 'transparent') return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) return { c: '#' + (m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]), a: 1 };
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; }
  return { c, a: 1 };
}

// Ce a scris desenul paginii, în ordine: poligoane, linii, etichete.
function _formeSvg(svg) {
  const out = [], at = (s, n) => { const m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(s); return m ? m[1] : null; };
  String(svg || '').replace(/<(polygon|line|text)\s([^>]*)>([^<]*)<\/\1>/g, (tot, el, a, t) => {
    const o = { el, cls: at(a, 'class') };
    if (el === 'polygon') { o.pts = at(a, 'points').split(' ').map((p) => p.split(',').map(Number)); o.fill = at(a, 'fill'); }
    else if (el === 'line') { o.a = [+at(a, 'x1'), +at(a, 'y1')]; o.b = [+at(a, 'x2'), +at(a, 'y2')]; }
    else { o.x = +at(a, 'x'); o.y = +at(a, 'y'); o.anchor = at(a, 'text-anchor'); o.t = t; }
    out.push(o);
    return tot;
  });
  return out;
}

// Desenul unei vederi ('sus' | 'lateral') într-o casetă w × h, cu fondul ecranului; desenul își păstrează proporțiile și
// stă la mijloc. Întoarce înălțimea casetei.
function _desen(doc, rez, x, y, w, h, vedere) {
  const D = desenPagina();
  if (!D) { doc.font('Nunito').fontSize(8).fillColor(GRI).text('Desenul nu s-a putut încărca.', x, y + 4, { width: w, lineBreak: false }); return 18; }
  const culori = {};
  (rez.legenda || []).forEach((l) => { culori[l.nr] = l.culoare; });
  const forme = _formeSvg(D.simSvg(rez, vedere === 'sus' ? 'sus' : 'lat', 32, (n) => culori[n] || '#3B82F6'));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const ia = (p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
  forme.forEach((f) => {
    if (f.pts) f.pts.forEach(ia);
    else if (f.a) { ia(f.a); ia(f.b); }
    else { const l = f.anchor === 'end' ? -30 : (f.anchor === 'middle' ? -15 : 0); ia([f.x + l, f.y - 11]); ia([f.x + l + 30, f.y + 2]); }
  });
  const pad = 8, k = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0));
  const dx = x + (w - (x1 - x0) * k) / 2 - x0 * k, dy = y + (h - (y1 - y0) * k) / 2 - y0 * k;
  const P = (p) => [dx + p[0] * k, dy + p[1] * k];
  const fond = _culoare(D.stil._fond);
  doc.save();
  if (fond) doc.roundedRect(x, y, w, h, 6).fillColor(fond.c, fond.a).fill();
  const linie = (s) => {
    doc.lineWidth(Math.max(0.25, (parseFloat(s['stroke-width']) || 1) * k)).lineJoin('round');
    const d = String(s['stroke-dasharray'] || '').split(/[\s,]+/).map(parseFloat).filter((v) => v > 0);
    if (d.length) doc.dash(d[0] * k, { space: (d[1] || d[0]) * k }); else doc.undash();
  };
  forme.forEach((f) => {
    const s = D.stil[f.cls] || {};
    if (f.el === 'polygon') {
      const fill = _culoare(f.fill || s.fill || '#000000'), stroke = _culoare(s.stroke);
      doc.polygon(...f.pts.map(P));
      if (fill && stroke) { linie(s); doc.fillColor(fill.c, fill.a).strokeColor(stroke.c, stroke.a).fillAndStroke(); }
      else if (fill) doc.fillColor(fill.c, fill.a).fill();
      else if (stroke) { linie(s); doc.strokeColor(stroke.c, stroke.a).stroke(); }
    } else if (f.el === 'line') {
      const stroke = _culoare(s.stroke);
      if (!stroke) return;
      linie(s);
      doc.moveTo(...P(f.a)).lineTo(...P(f.b)).strokeColor(stroke.c, stroke.a).stroke();
    } else {
      const fill = _culoare(s.fill) || { c: GRI, a: 1 }, fs2 = (parseFloat(s['font-size']) || 12) * k;
      doc.font('Nunito-Bold').fontSize(fs2).fillColor(fill.c, fill.a);
      const tw = doc.widthOfString(f.t), p = P([f.x, f.y]);
      doc.text(f.t, p[0] - (f.anchor === 'end' ? tw : (f.anchor === 'middle' ? tw / 2 : 0)), p[1] - fs2 * 0.8, { lineBreak: false });
    }
  });
  doc.undash();
  doc.restore();
  doc.fillOpacity(1).strokeOpacity(1);
  return h;
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

  // Desenele, unul lângă altul: de sus și din lateral — aceleași ca pe ecran.
  const colD = (W - 12) / 2, hD = 140;
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Văzut de sus', left, y, { width: colD, lineBreak: false });
  doc.font('Nunito-Bold').fontSize(9).fillColor(TEXT).text('Văzut din lateral', left + colD + 12, y, { width: colD, lineBreak: false });
  _desen(doc, rez, left, y + 14, colD, hD, 'sus');
  _desen(doc, rez, left + colD + 12, y + 14, colD, hD, 'lateral');
  y += 14 + hD + 10;
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

module.exports = { planPdf, scriePlan, numeFisier, desenPagina };
