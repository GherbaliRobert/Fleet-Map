// build_ai_docs.js — PDF „Agenți AI + RA Insight" în stilul RA Tracks (același ca build_docs.js).
// Totul desenat în pdfkit: branding Nunito, iconuri Font Awesome, mockup-uri UI „stil app".
// Fiecare agent: iconița lui, rol, ce face, ce date dă, cum ajută + un mockup din aplicație.
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, 'assets');
// Logo REAL de producție (RGBA, transparent). CLAUDE.md: logo.png = varianta ALBĂ (fundal închis),
// logo-light.png = varianta ÎNCHISĂ (fundal alb). 694x135 → raport ~5.14:1.
const LOGO_DARK = path.join(__dirname, '..', 'public', 'logo.png');        // pe fundal ÎNCHIS (copertă)
const LOGO_LIGHT = path.join(__dirname, '..', 'public', 'logo-light.png'); // pe fundal ALB (antet pagini)

const GREEN = '#3FE07D', GREEN_D = '#16a34a', INK = '#0b1f17', DARK = '#0d1411', DARK2 = '#15241c';
const TXT = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', LIGHT = '#f8fafc';
const AMBER = '#f59e0b', AMBER_D = '#b45309', RED = '#ef4444', BLUE = '#3b82f6';
const _c = h => String.fromCharCode(parseInt(h, 16));
const FA = {
  shield: _c('f3ed'), compass: _c('f14e'), wrench: _c('f0ad'), leaf: _c('f06c'),
  clipboard: _c('f46c'), file: _c('f15c'), wand: _c('e2ca'), robot: _c('f544'),
  check: _c('f00c'), circleCheck: _c('f058'), bolt: _c('f0e7'), gauge: _c('f625'),
  truck: _c('f0d1'), pin: _c('f3c5'), gas: _c('f52f'), clock: _c('f017'), warn: _c('f071'),
  coins: _c('f51e'), route: _c('f4d7'), phone: _c('f095'), trend: _c('e098'), database: _c('f1c0'),
  bell: _c('f0f3'), lock: _c('f023'), sparkle: _c('e2ca'), envelope: _c('f0e0'), globe: _c('f0ac')
};

function reg(doc) {
  doc.registerFont('N', path.join(A, 'Nunito-Regular.ttf'));
  doc.registerFont('NB', path.join(A, 'Nunito-Bold.ttf'));
  doc.registerFont('NX', path.join(A, 'Nunito-ExtraBold.ttf'));
  doc.registerFont('FA', path.join(A, 'fa-solid-900.ttf'));
}
function icon(doc, code, x, y, size, color) { doc.font('FA').fontSize(size).fillColor(color).text(code, x, y, { lineBreak: false }); }
// pdfkit NU acceptă string-uri rgba() (normalizeColor -> null, păstrează culoarea anterioară).
// Deci translucența se face cu fillOpacity/strokeOpacity, resetate explicit la 1 după fiecare desen.
function aFill(doc, x, y, w, h, r, hex, a) { doc.roundedRect(x, y, w, h, r).fillOpacity(a).fillColor(hex).fill().fillOpacity(1); }
function aStroke(doc, x, y, w, h, r, hex, a, lw) { doc.roundedRect(x, y, w, h, r).strokeOpacity(a).strokeColor(hex).lineWidth(lw || 1).stroke().strokeOpacity(1); }

// ─── Șablon pagină (identic cu build_docs.js) ───
function pageHeader(doc, M, sub) {
  try { doc.image(LOGO_LIGHT, M, M + 2, { height: 24 }); } catch (e) {}
  if (sub) doc.font('N').fontSize(9).fillColor(MUTED).text(sub, M, M + 8, { width: doc.page.width - 2 * M, align: 'right', lineBreak: false });
  doc.moveTo(M, M + 32).lineTo(doc.page.width - M, M + 32).strokeColor(GREEN).lineWidth(2).stroke();
}
function pageFooter(doc, M, n) {
  const fy = doc.page.height - M - 12;
  doc.font('N').fontSize(7.5).fillColor(MUTED).text('RA Tracks · Agenți AI & RA Insight · ratrack.ro', M, fy, { lineBreak: false });
  doc.font('N').fontSize(7.5).fillColor(MUTED).text(String(n), doc.page.width - M - 30, fy, { width: 30, align: 'right', lineBreak: false });
}

// ─── Cadru mockup „stil app" (panou închis, ca în aplicație) ───
function appPanel(doc, x, y, w, h, title, live) {
  doc.roundedRect(x, y, w, h, 10).fillColor(DARK).fill();
  aStroke(doc, x, y, w, h, 10, GREEN, 0.28, 1);
  doc.font('NB').fontSize(8.5).fillColor('#cfe9dd').text(title, x + 13, y + 11, { lineBreak: false });
  if (live !== false) {
    doc.circle(x + w - 38, y + 15.5, 2.6).fillColor(GREEN).fill();
    doc.font('N').fontSize(6.5).fillColor(GREEN).text('LIVE', x + w - 32, y + 12, { width: 24, lineBreak: false });
  }
}
// rând de semnalare în card (bulină colorată + titlu + detaliu)
function findRow(doc, x, y, w, col, title, detail) {
  doc.roundedRect(x, y, w, 30, 6).fillColor(DARK2).fill();
  doc.rect(x, y, 3, 30).fillColor(col).fill();
  doc.circle(x + 15, y + 15, 3).fillColor(col).fill();
  doc.font('NB').fontSize(8.5).fillColor('#e6f3ec').text(title, x + 26, y + 6, { width: w - 40, lineBreak: false });
  doc.font('N').fontSize(7).fillColor('#8aa89c').text(detail, x + 26, y + 17, { width: w - 40, lineBreak: false });
}
function statusPill(doc, x, y, col, txt) {
  const tw = doc.font('NB').fontSize(8).widthOfString(txt) + 16;
  aFill(doc, x, y, tw, 16, 8, col, 0.16);
  doc.font('NB').fontSize(8).fillColor(col).text(txt, x + 8, y + 4, { lineBreak: false });
  return tw;
}

// ─── Mockup-uri per agent ───
function mockWatch(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Watch · verificat acum 12 min', false); // rulează din oră în oră, nu „live”
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, RED, '2 semnalări'); iy += 24;
  findRow(doc, ix, iy, iw, RED, 'Ford Transit — B 77 VWC', 'Offline de 3h 12m · verifică aparatul și SIM-ul'); iy += 34;
  findRow(doc, ix, iy, iw, AMBER, 'MAN TGS 26.480 — B 99 MAN', 'Scădere de ~18 L · posibil furt sau scurgere');
}
function mockDispatch(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Dispatch · disponibile acum');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, GREEN, '2 disponibile'); iy += 24;
  findRow(doc, ix, iy, iw, GREEN, 'VW Caddy — B 21 RAT', 'Disponibil · 6 km · ~9 min'); iy += 34;
  findRow(doc, ix, iy, iw, GREEN, 'Dacia Logan 3 — IF 08 RAT', 'Disponibil · 11 km · ~17 min'); iy += 36;
  doc.font('N').fontSize(7).fillColor('#8aa89c').text('Locul ales pe hartă: Str. Fabricii 20 · timp orientativ', ix, iy, { width: iw, lineBreak: false });
}
function mockCare(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Care · scadențe');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, AMBER, '2 scadențe'); iy += 24;
  findRow(doc, ix, iy, iw, AMBER, 'ITP — Iveco Daily · TM 04 IVE', 'Expiră în 8 zile'); iy += 34;
  findRow(doc, ix, iy, iw, BLUE, 'Revizie — Renault Master · IS 21 REN', 'Mai sunt 420 km până la revizie');
}
function mockOptimize(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Optimize · scor eco');
  const ix = x + 12; const cx = ix + 34, cy = y + 74, r = 26;
  // gauge semicerc
  doc.path('M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy).strokeOpacity(0.12).strokeColor('#ffffff').lineWidth(6).stroke().strokeOpacity(1);
  const score = 54, segs = 40; // agentul arată doar mașinile sub 60 doc.strokeColor(AMBER).lineWidth(6);
  for (let i = 0; i <= segs; i++) { const ai = Math.PI - (Math.PI * score / 100) * (i / segs); const px = cx + r * Math.cos(ai), py = cy - r * Math.sin(ai); i ? doc.lineTo(px, py) : doc.moveTo(px, py); } doc.stroke();
  doc.font('NX').fontSize(17).fillColor('#fff').text(String(score), cx - 26, cy - 16, { width: 52, align: 'center', lineBreak: false });
  doc.font('N').fontSize(6.5).fillColor('#8aa89c').text('/100 azi', cx - 26, cy + 2, { width: 52, align: 'center', lineBreak: false });
  const tx = ix + 78, tw = w - (tx - x) - 12; let ty = y + 34;
  doc.font('NB').fontSize(8).fillColor('#e6f3ec').text('Dacia Logan 3 · IF 08 RAT', tx, ty, { width: tw, lineBreak: false }); ty += 14;
  ['3 frânări bruște', '2 accelerări bruște', 'timp mult la ralanti'].forEach(function (s) {
    doc.circle(tx + 3, ty + 4, 1.6).fillColor(AMBER).fill();
    doc.font('N').fontSize(7.5).fillColor('#b9cec4').text(s, tx + 10, ty, { width: tw - 10, lineBreak: false }); ty += 12;
  });
  doc.font('N').fontSize(7).fillColor(GREEN).text('Sugestie: frânează lin, din timp', tx, ty + 2, { width: tw, lineBreak: false });
}
function mockCompliance(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Compliance · estimare din GPS');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, AMBER, 'aproape de limită'); iy += 24;
  // bară condus continuu
  function bar(label, val, max, col, note) {
    doc.font('N').fontSize(7.5).fillColor('#b9cec4').text(label, ix, iy, { lineBreak: false });
    doc.font('NB').fontSize(7.5).fillColor(col).text(note, ix, iy, { width: iw, align: 'right', lineBreak: false }); iy += 12;
    doc.roundedRect(ix, iy, iw, 7, 3.5).fillColor(DARK2).fill();
    doc.roundedRect(ix, iy, iw * Math.min(1, val / max), 7, 3.5).fillColor(col).fill(); iy += 18;
  }
  doc.font('NB').fontSize(8).fillColor('#e6f3ec').text('MAN TGS 26.480 · B 99 MAN · cu tahograf', ix, iy, { lineBreak: false }); iy += 15;
  bar('Condus continuu', 255, 270, AMBER, '4h 15m / 4h 30m');
  bar('Condus zilnic', 470, 540, GREEN, '7h 50m / 9h 00m');
}
function mockClient(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Client · sinteza zilei');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  const kw = (iw - 16) / 3;
  [['344 km', 'azi', GREEN], ['6/8', 'active', '#e6f3ec'], ['+12%', 'față de ieri', GREEN]].forEach(function (k, i) {
    const kx = ix + i * (kw + 8);
    doc.roundedRect(kx, iy, kw, 30, 5).fillColor(DARK2).fill();
    doc.font('NX').fontSize(11).fillColor(k[2]).text(k[0], kx + 8, iy + 4, { lineBreak: false });
    doc.font('N').fontSize(6.5).fillColor('#8aa89c').text(k[1], kx + 8, iy + 19, { lineBreak: false });
  });
  iy += 40;
  doc.font('NB').fontSize(7.5).fillColor(AMBER).text('DE VERIFICAT', ix, iy, { lineBreak: false }); iy += 12;
  ['RA Watch: 1 alertă de monitorizare', 'RA Care: 1 scadență'].forEach(function (s) {
    doc.circle(ix + 3, iy + 4, 1.6).fillColor(AMBER).fill();
    doc.font('N').fontSize(7.5).fillColor('#b9cec4').text(s, ix + 10, iy, { width: iw - 10, lineBreak: false }); iy += 13;
  });
}
function mockInsight(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Insight · asistentul flotei');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  // contorul de apeluri (ca la Claude)
  doc.roundedRect(ix, iy, iw, 30, 6).fillColor(DARK2).fill();
  doc.font('NB').fontSize(8).fillColor('#e6f3ec').text('Întrebări luna asta: 86 din 100 rămase', ix + 10, iy + 5, { lineBreak: false });
  aFill(doc, ix + 10, iy + 20, iw - 20, 5, 2.5, '#ffffff', 0.1);
  doc.roundedRect(ix + 10, iy + 20, (iw - 20) * 0.86, 5, 2.5).fillColor(GREEN).fill();
  iy += 40;
  // întrebare user
  aFill(doc, ix + iw * 0.28, iy, iw * 0.72, 22, 6, GREEN, 0.16);
  doc.font('N').fontSize(7.5).fillColor('#e6f3ec').text('Care vehicul a consumat cel mai mult săptămâna asta?', ix + iw * 0.28 + 8, iy + 5, { width: iw * 0.72 - 16, lineBreak: false });
  iy += 28;
  // răspuns agent
  doc.roundedRect(ix, iy, iw * 0.8, 30, 6).fillColor(DARK2).fill();
  icon(doc, FA.wand, ix + 8, iy + 6, 8, GREEN);
  doc.font('N').fontSize(7.5).fillColor('#b9cec4').text('Cel mai mult: B 99 MAN (MAN TGS 26.480) — 412 L, 34,2 L/100 km, cu 9% peste norma mașinii. Merită o discuție cu șoferul.', ix + 20, iy + 5, { width: iw * 0.8 - 28 });
}

// ─── Bloc agent (text stânga + mockup dreapta) ───
function agentBlock(doc, M, y, CW, a) {
  const colW = CW * 0.52, mockX = M + colW + 16, mockW = CW - colW - 16, blockH = 196;
  // antet: iconiță + nume + rol
  doc.roundedRect(M, y, 38, 38, 9).fillColor('#f0fdf4').fill();
  icon(doc, a.icon, M + 10, y + 10, 18, GREEN_D);
  doc.font('NX').fontSize(15).fillColor('#111').text(a.name, M + 48, y + 2, { lineBreak: false });
  // badge rol
  const rw = doc.font('NB').fontSize(8).widthOfString(a.role) + 16;
  doc.roundedRect(M + 48, y + 22, rw, 15, 7).fillColor('#f0fdf4').fill();
  aStroke(doc, M + 48, y + 22, rw, 15, 7, GREEN_D, 0.3, 0.8);
  doc.font('NB').fontSize(8).fillColor(GREEN_D).text(a.role, M + 56, y + 26, { lineBreak: false });
  let ty = y + 48;
  // secțiuni ce face / ce date / cum ajută
  [['CE FACE', a.does], ['CE DATE ÎȚI DĂ', a.data], ['CUM TE AJUTĂ', a.helps]].forEach(function (s) {
    doc.font('NX').fontSize(7.5).fillColor(GREEN_D).text(s[0], M, ty, { lineBreak: false }); ty += 11;
    doc.font('N').fontSize(9).fillColor(TXT).text(s[1], M, ty, { width: colW - 6 });
    ty = doc.y + 7;
  });
  // mockup dreapta
  a.mock(doc, mockX, y + 4, mockW, blockH - 4);
  return y + blockH + 14;
}

function build() {
  const M = 40, doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: 'RA Tracks - Agenți AI & RA Insight', Author: 'RA Tracks' } });
  reg(doc);
  const out = fs.createWriteStream(path.join(__dirname, 'RA-Tracks_Agenti-AI.pdf')); doc.pipe(out);
  const W = doc.page.width, H = doc.page.height, CW = W - 2 * M;

  // ══════ COPERTĂ (dark, ca flyer-ul) ══════
  doc.rect(0, 0, W, H).fillColor(DARK).fill();
  doc.rect(0, 0, W, 6).fillColor(GREEN).fill();
  try { doc.image(LOGO_DARK, M, 42, { height: 40 }); } catch (e) {}
  doc.font('NB').fontSize(10).fillColor(GREEN).text('INTELIGENȚĂ ARTIFICIALĂ PENTRU FLOTA TA', M, 150, { characterSpacing: 1 });
  doc.font('NX').fontSize(36).fillColor('#fff').text('6 agenți AI', M, 172, { width: CW });
  doc.font('NX').fontSize(36).fillColor(GREEN).text('+ RA Insight', M, 214, { width: CW });
  doc.font('N').fontSize(12).fillColor('#c9ddd3').text('Șase agenți care verifică flota după reguli clare — RA Watch în fiecare oră, ceilalți cinci când le deschizi pagina — și un asistent pe care îl întrebi orice despre flotă.', M, 268, { width: CW - 30 });

  // constelația celor 6 agenți (grilă de iconițe)
  const agIcons = [[FA.shield, 'Watch', 'La fiecare oră'], [FA.compass, 'Dispatch', 'Dispecerat'], [FA.wrench, 'Care', 'Mentenanță'], [FA.leaf, 'Optimize', 'Condus economic'], [FA.clipboard, 'Compliance', 'Ore de condus'], [FA.file, 'Client', 'Sinteza zilei']];
  const gy = 330, gcw = CW / 3;
  agIcons.forEach(function (g, i) {
    const gx = M + (i % 3) * gcw, gyy = gy + Math.floor(i / 3) * 92;
    doc.roundedRect(gx, gyy, gcw - 14, 78, 11).fillColor(DARK2).fill();
    aStroke(doc, gx, gyy, gcw - 14, 78, 11, GREEN, 0.25, 1);
    aFill(doc, gx + 14, gyy + 14, 32, 32, 8, GREEN, 0.16);
    icon(doc, g[0], gx + 22, gyy + 22, 16, GREEN);
    doc.font('NB').fontSize(11).fillColor('#fff').text('RA ' + g[1], gx + 54, gyy + 20, { lineBreak: false });
    doc.font('N').fontSize(7.5).fillColor('#8aa89c').text(g[2], gx + 54, gyy + 36, { width: gcw - 70, lineBreak: false });
  });

  // banda RA Insight (vedeta)
  const iy = gy + 2 * 92 + 6;
  doc.roundedRect(M, iy, CW, 88, 12).fillColor('#12251b').fill();
  doc.rect(M, iy, 5, 88).fillColor(GREEN).fill();
  aFill(doc, M + 22, iy + 24, 40, 40, 10, GREEN, 0.18);
  icon(doc, FA.wand, M + 33, iy + 33, 20, GREEN);
  doc.font('NX').fontSize(15).fillColor('#fff').text('RA Insight — asistentul AI al flotei', M + 78, iy + 22, { lineBreak: false });
  doc.font('N').fontSize(9.5).fillColor('#c9ddd3').text('Asistentul care leagă tot. Îl întrebi orice despre flotă, în limbaj natural, și îți răspunde pe loc — plus rezumate de rapoarte, la cerere.', M + 78, iy + 42, { width: CW - 100 });

  doc.font('N').fontSize(9).fillColor('#7e948a').text('Monitorizare GPS & management de flotă · ratrack.ro', M, H - 46, { lineBreak: false });

  // ══════ P2 — Ce sunt agenții AI ══════
  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Agenți AI · concept');
  let y = M + 48;
  doc.font('NX').fontSize(22).fillColor('#111').text('Cum lucrează agenții', M, y); y += 32;
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Fiecare agent verifică flota după reguli clare, pe specialitatea lui: RA Watch singur, în fiecare oră; ceilalți cinci pe loc, când le deschizi pagina.', M, y, { width: CW }); y += 40;

  // 3 diferențiatori
  [[FA.bolt, 'Când lucrează', 'RA Watch singur, din oră în oră; ceilalți când le deschizi pagina sau apeși „Rulează acum”'],
   [FA.circleCheck, 'Incluși în abonament', 'cei șase agenți nu costă nimic în plus — fac parte din aplicație'],
   [FA.bell, 'Fără avalanșă de mesaje', 'ce găsește RA Watch reapare abia după 12 ore, sau dacă se agravează']
  ].forEach(function (d, i) {
    const cy2 = y + i * 62;
    doc.roundedRect(M, cy2, CW, 54, 10).fillColor(LIGHT).fill();
    doc.roundedRect(M, cy2, CW, 54, 10).strokeColor(LINE).lineWidth(1).stroke();
    doc.roundedRect(M + 14, cy2 + 13, 30, 30, 7).fillColor('#f0fdf4').fill();
    icon(doc, d[0], M + 21, cy2 + 20, 15, GREEN_D);
    doc.font('NX').fontSize(12.5).fillColor('#111').text(d[1], M + 56, cy2 + 12, { lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text(d[2], M + 56, cy2 + 30, { width: CW - 70, lineBreak: false });
  });
  y += 3 * 62 + 12;

  // distincție cheie: supraveghere automată (cei 6) vs. răspuns la cerere (RA Insight) — pe COMPORTAMENT, nu pe tokeni
  doc.roundedRect(M, y, CW, 96, 11).fillColor(DARK).fill();
  doc.rect(M, y, 5, 96).fillColor(GREEN).fill();
  icon(doc, FA.bolt, M + 22, y + 20, 15, GREEN);
  doc.font('NB').fontSize(9).fillColor(GREEN).text('VERIFICĂRI + RĂSPUNS LA CERERE', M + 46, y + 15, { lineBreak: false });
  doc.font('N').fontSize(10.5).fillColor('#e6f3ec').text('Cei șase agenți verifică flota după reguli fixe și îți arată ce au găsit în pagina „Agenți AI” — nu îți trimit notificări pe telefon. RA Insight e altfel: îl întrebi tu, în limba română, orice despre flotă, și îți răspunde pe loc.', M + 46, y + 32, { width: CW - 70 });
  y += 96 + 20;
  doc.font('N').fontSize(9.5).fillColor(MUTED).text('Pe paginile următoare: fiecare agent cu rolul lui, ce face, ce date îți dă și cum te ajută — cu un exemplu de cum arată în aplicație (date de probă).', M, y, { width: CW });
  pageFooter(doc, M, 2);

  // ══════ P3-P5 — cei 6 agenți, 2 per pagină ══════
  const AGENTS = [
    { icon: FA.shield, name: 'RA Watch', role: 'Paznicul', mock: mockWatch,
      does: 'Din oră în oră caută mașinile care nu mai transmit de peste o oră, scăderile bruște de combustibil, ralantiul lung și camioanele fără date de la tahograf.',
      data: 'Ce mașină nu mai transmite și de cât timp, câți litri au scăzut din rezervor și cât a stat cu motorul pornit pe loc.',
      helps: 'Afli în cel mult o oră, din pagina agenților, că o mașină nu mai transmite sau a pierdut combustibil — nu la sfârșitul zilei.' },
    { icon: FA.compass, name: 'RA Dispatch', role: 'Dispecerat', mock: mockDispatch,
      does: 'Îți arată ce mașini sunt libere acum și, după prânz, pe cele care n-au mers aproape deloc azi. Pentru o cursă, alegi locul pe hartă.',
      data: 'Mașinile libere acum, cu nume și număr, iar pentru locul ales pe hartă: distanța până la fiecare și un timp estimat, orientativ.',
      helps: 'Aloci cursa celui mai potrivit vehicul în câteva secunde, fără să suni pe rând fiecare șofer să afli unde e.' },
    { icon: FA.wrench, name: 'RA Care', role: 'Mentenanță', mock: mockCare,
      does: 'Strânge într-o listă tot ce se apropie de termen, din ce ai trecut în aplicație: ITP, RCA, asigurări și revizii pe dată sau pe kilometri.',
      data: 'Ce expiră și când, pe fiecare vehicul: zile rămase până la ITP/RCA sau kilometri rămași până la următoarea revizie.',
      helps: 'Afli din timp ce urmează — actele cu 30 de zile înainte, reviziile cu 14 zile sau 500 km — și eviți amenzile și mașinile oprite.' },
    { icon: FA.leaf, name: 'RA Optimize', role: 'Condus economic', mock: mockOptimize,
      does: 'Calculează scorul eco al fiecărui vehicul din frânări și accelerări bruște, viteză și risipa la ralanti — și dă sugestii concrete de instruire.',
      data: 'Scorul pe 100 al mașinilor sub prag, ce l-a tras în jos azi (frânări sau accelerări bruște, viteză, ralanti) și ce să corecteze șoferul.',
      helps: 'Vezi pe ce mașini se conduce agresiv. Clasamentul șoferilor îl găsești în raportul „EcoDrive — clasament șoferi”.' },
    { icon: FA.clipboard, name: 'RA Compliance', role: 'Ore de condus', mock: mockCompliance,
      does: 'La camioane și autobuze estimează din GPS condusul de azi: cel mult 4h30 fără o pauză de 45 de minute și 9 ore pe zi.',
      data: 'Camioanele care se apropie de limită sau au trecut-o azi, cu timpul estimat de condus și ce e de făcut (de pildă pauza).',
      helps: 'Dispecerul vede din timp cine trebuie să oprească. E o estimare: pentru control rămâne tahograful.' },
    { icon: FA.file, name: 'RA Client', role: 'Sinteza zilei', mock: mockClient,
      does: 'Strânge ziua flotei într-un singur loc: kilometri, mașini active și nefolosite, comparația cu ieri la aceeași oră și ce au găsit ceilalți agenți.',
      data: 'Km totali azi, câte vehicule au fost active vs. nefolosite, procentul față de ieri, vehiculul de top și lista scurtă „de verificat".',
      helps: 'Dintr-o privire știi cum merge ziua, fără să deschizi mai multe ecrane. Unde scrie „De verificat”, deschizi agentul respectiv.' }
  ];
  for (let i = 0; i < AGENTS.length; i++) {
    if (i % 2 === 0) { doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Agenți AI · ' + (i / 2 + 1) + ' din 3'); y = M + 48; }
    y = agentBlock(doc, M, y, CW, AGENTS[i]);
    if (i % 2 === 0) { doc.moveTo(M, y - 6).lineTo(W - M, y - 6).strokeColor(LINE).lineWidth(1).dash(3, { space: 3 }).stroke().undash(); }
    if (i % 2 === 1) pageFooter(doc, M, 2 + Math.ceil((i + 1) / 2));
  }

  // ══════ P6 — RA Insight (vedeta, pagină întreagă) ══════
  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'RA Insight · asistentul AI');
  y = M + 48;
  doc.roundedRect(M, y, 44, 44, 10).fillColor('#f0fdf4').fill();
  icon(doc, FA.wand, M + 12, y + 12, 20, GREEN_D);
  doc.font('NX').fontSize(22).fillColor('#111').text('RA Insight', M + 56, y + 2, { lineBreak: false });
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Asistentul care leagă tot. Îl întrebi orice despre flotă, în limba română — caută în datele tale și îți răspunde pe loc: de la poziții și consum la acte, revizii și ore de condus. Vede doar ce vede contul care întreabă.', M + 56, y + 28, { width: CW - 56 });
  y += 72;
  mockInsight(doc, M, y, CW, 158); y += 172;

  // ce obții cu RA Insight (valoare, fără mecanica de vânzare)
  [[FA.wand, 'Întrebi în limba română', 'nu înveți rapoarte — scrii întrebarea ca unui coleg și primești răspunsul'],
   [FA.file, 'Rezumate de rapoarte', 'pe calculator, un raport lung devine câteva puncte clare'],
   [FA.gauge, 'Fără surprize', 'vezi câte întrebări mai are firma; la final se oprește, fără cost în plus']
  ].forEach(function (d, i) {
    const cy2 = y + i * 44;
    doc.roundedRect(M + 14, cy2 + 2, 28, 28, 7).fillColor('#f0fdf4').fill();
    icon(doc, d[0], M + 21, cy2 + 8, 14, GREEN_D);
    doc.font('NB').fontSize(11).fillColor('#111').text(d[1], M + 52, cy2 + 2, { lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text(d[2], M + 52, cy2 + 17, { width: CW - 66, lineBreak: false });
  });
  y += 3 * 44 + 10;

  // ofertă personalizată + contact (fără prețuri/mecanica de vânzare)
  doc.roundedRect(M, y, CW, 92, 12).fillColor(DARK).fill();
  doc.rect(M, y, 5, 92).fillColor(GREEN).fill();
  doc.font('NX').fontSize(14).fillColor('#fff').text('Ofertă personalizată', M + 26, y + 18, { lineBreak: false });
  doc.font('N').fontSize(10).fillColor('#c9ddd3').text('Prețul se stabilește în funcție de flota și de nevoile tale. Spune-ne ce ai și îți pregătim o ofertă pe măsură.', M + 26, y + 40, { width: CW * 0.52 });
  const cxx = M + CW * 0.60;
  // Fără email și telefon (09.10): adresa de email nu primește încă nimic, iar numărul era un șablon. Oferta se cere din
  // formularul de pe site, care chiar ajunge la noi.
  icon(doc, FA.globe, cxx, y + 28, 12, GREEN);
  doc.font('NB').fontSize(12).fillColor('#fff').text('ratrack.ro', cxx + 22, y + 26, { lineBreak: false });
  doc.font('N').fontSize(9.5).fillColor('#c9ddd3').text('Cere oferta din formularul de pe site.', cxx, y + 50, { width: CW * 0.38 });
  pageFooter(doc, M, 6);

  // ══════ P7 — Închidere ══════
  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Pe scurt');
  y = M + 50;
  doc.font('NX').fontSize(20).fillColor('#111').text('Șase agenți și un asistent', M, y); y += 34;
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Cei șase agenți stau în pagina „Agenți AI”: fiecare card arată pe scurt starea, iar când îl deschizi vezi detaliile. RA Insight are rândul lui în meniu.', M, y, { width: CW }); y += 34;

  // recap rânduri
  // [iconiță, nume, ce face, eticheta din dreapta, evidențiat]. „AI Raport" (Rapoarte, pe calculator) e gratuit, pe reguli.
  const recap = [[FA.shield, 'RA Watch', 'din oră în oră: offline, combustibil, ralanti, tahograf', 'inclus'], [FA.compass, 'RA Dispatch', 'mașini libere acum + cele mai apropiate de locul ales', 'inclus'], [FA.wrench, 'RA Care', 'ITP, RCA, revizii — pe dată sau pe km', 'inclus'], [FA.leaf, 'RA Optimize', 'scor eco pe mașină + sfaturi pentru șofer', 'inclus'], [FA.clipboard, 'RA Compliance', 'condusul de azi, estimat din GPS — camioane, autobuze', 'inclus'], [FA.file, 'RA Client', 'sinteza zilei + concluziile celorlalți', 'inclus'], [FA.wand, 'RA Insight', 'asistent AI — întrebi orice despre flotă', 'cu plată', true], [FA.file, 'AI Raport', 'în Rapoarte: întrebări despre rapoarte, pe calculator', 'gratuit']];
  recap.forEach(function (r, i) {
    const ry = y + i * 34;
    const ev = !!r[4];
    doc.roundedRect(M, ry, CW, 28, 7).fillColor(ev ? '#f0fdf4' : LIGHT).fill();
    if (ev) aStroke(doc, M, ry, CW, 28, 7, GREEN, 0.5, 1);
    if (ev) { aFill(doc, M + 8, ry + 5, 20, 18, 5, GREEN, 0.18); } else { doc.roundedRect(M + 8, ry + 5, 20, 18, 5).fillColor('#eef2f0').fill(); }
    icon(doc, r[0], M + 13, ry + 8, 11, GREEN_D);
    doc.font('NB').fontSize(10.5).fillColor('#111').text(r[1], M + 38, ry + 8, { width: 120, lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text(r[2], M + 164, ry + 8, { width: CW - 180, lineBreak: false });
    doc.font(ev ? 'NB' : 'N').fontSize(8).fillColor(ev ? GREEN_D : MUTED).text(r[3], M + CW - 60, ry + 9, { width: 52, align: 'right', lineBreak: false });
  });
  y += recap.length * 34 + 14;

  // stats
  doc.roundedRect(M, y, CW, 58, 8).fillColor('#f0fdf4').fill();
  aStroke(doc, M, y, CW, 58, 8, GREEN, 0.5, 1);
  [['6', 'agenți incluși'], ['1 oră', 'între verificări RA Watch'], ['1', 'asistent AI'], ['0 lei', 'în plus pentru agenți']].forEach(function (k, i) {
    const kx = M + 16 + i * (CW / 4);
    doc.font('NX').fontSize(20).fillColor(GREEN_D).text(k[0], kx, y + 11, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor(MUTED).text(k[1], kx, y + 37, { lineBreak: false });
  });
  y += 58 + 22;

  // CTA
  doc.roundedRect(M, y, CW, 90, 12).fillColor(DARK).fill(); doc.rect(M, y, 5, 90).fillColor(GREEN).fill();
  doc.font('NX').fontSize(18).fillColor('#fff').text('Agenții verifică. Tu întrebi.', M + 26, y + 20);
  doc.font('N').fontSize(10.5).fillColor('#c9ddd3').text('Agenții sunt incluși în abonament. RA Insight îl ceri în ofertă, pe conturile alese de firmă.', M + 26, y + 48, { width: CW - 210 });
  doc.roundedRect(W - M - 160, y + 30, 134, 34, 8).fillColor(GREEN).fill();
  doc.font('NX').fontSize(13).fillColor(INK).text('ratrack.ro', W - M - 160, y + 40, { width: 134, align: 'center', lineBreak: false });
  pageFooter(doc, M, 7);

  doc.end();
  return new Promise(function (r) { out.on('finish', r); });
}

build().then(function () { console.log('DONE: RA-Tracks_Agenti-AI.pdf'); });
