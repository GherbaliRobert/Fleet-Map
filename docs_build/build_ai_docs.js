// build_ai_docs.js — PDF „Agenți AI + RA Insight" în stilul RA Tracks (același ca build_docs.js).
// Totul desenat în pdfkit: branding Nunito, iconuri Font Awesome, mockup-uri UI „stil app".
// Fiecare agent: iconița lui, rol, ce face, ce date dă, cum ajută + un mockup din aplicație.
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, 'assets');

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
  bell: _c('f0f3'), lock: _c('f023'), sparkle: _c('e2ca')
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
  doc.roundedRect(M, M, 30, 22, 5).fillColor(GREEN).fill();
  doc.font('NX').fontSize(14).fillColor(INK).text('RA', M, M + 4, { width: 30, align: 'center', lineBreak: false });
  doc.font('NX').fontSize(16).fillColor('#111').text('Tracks', M + 36, M + 4, { lineBreak: false });
  if (sub) doc.font('N').fontSize(9).fillColor(MUTED).text(sub, M, M + 6, { width: doc.page.width - 2 * M, align: 'right', lineBreak: false });
  doc.moveTo(M, M + 30).lineTo(doc.page.width - M, M + 30).strokeColor(GREEN).lineWidth(2).stroke();
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
  appPanel(doc, x, y, w, h, 'RA Watch · flota reală');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, RED, '2 semnalări'); iy += 24;
  findRow(doc, ix, iy, iw, RED, 'Ford Transit — B 77 VWC', 'Offline de 3h 12m · ultima poziție: Otopeni'); iy += 34;
  findRow(doc, ix, iy, iw, AMBER, 'MAN TGS 26.480 — B 99 MAN', 'Scădere combustibil −18 L în 6 min · posibil furt');
}
function mockDispatch(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Dispatch · disponibile acum');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, GREEN, '2 disponibile'); iy += 24;
  findRow(doc, ix, iy, iw, GREEN, 'VW Caddy — B 154 UIP', 'Online · staționat de 22 min · Militari'); iy += 34;
  findRow(doc, ix, iy, iw, GREEN, 'Dacia Logan 3 — IF 08 RAT', 'Online · staționat de 40 min · Pipera'); iy += 36;
  doc.font('N').fontSize(7).fillColor('#8aa89c').text('Cel mai apropiat de Str. Fabricii 20: VW Caddy · ~9 min', ix, iy, { width: iw, lineBreak: false });
}
function mockCare(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Care · scadențe');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  statusPill(doc, ix, iy, AMBER, '2 scadențe'); iy += 24;
  findRow(doc, ix, iy, iw, AMBER, 'ITP — Iveco Daily · TM 04 IVE', 'Expiră în 8 zile (14.08.2026)'); iy += 34;
  findRow(doc, ix, iy, iw, BLUE, 'Revizie — Renault Master · IS 21 REN', 'În 900 km până la următorul service');
}
function mockOptimize(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Optimize · scor eco');
  const ix = x + 12; const cx = ix + 34, cy = y + 74, r = 26;
  // gauge semicerc
  doc.path('M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy).strokeOpacity(0.12).strokeColor('#ffffff').lineWidth(6).stroke().strokeOpacity(1);
  const score = 62, segs = 40; doc.strokeColor(AMBER).lineWidth(6);
  for (let i = 0; i <= segs; i++) { const ai = Math.PI - (Math.PI * score / 100) * (i / segs); const px = cx + r * Math.cos(ai), py = cy - r * Math.sin(ai); i ? doc.lineTo(px, py) : doc.moveTo(px, py); } doc.stroke();
  doc.font('NX').fontSize(17).fillColor('#fff').text(String(score), cx - 26, cy - 16, { width: 52, align: 'center', lineBreak: false });
  doc.font('N').fontSize(6.5).fillColor('#8aa89c').text('/100 azi', cx - 26, cy + 2, { width: 52, align: 'center', lineBreak: false });
  const tx = ix + 78, tw = w - (tx - x) - 12; let ty = y + 34;
  doc.font('NB').fontSize(8).fillColor('#e6f3ec').text('Dacia Logan 3 · B 154 UIP', tx, ty, { width: tw, lineBreak: false }); ty += 14;
  ['3 frânări bruște', '2 accelerări bruște', '14 min ralanti'].forEach(function (s) {
    doc.circle(tx + 3, ty + 4, 1.6).fillColor(AMBER).fill();
    doc.font('N').fontSize(7.5).fillColor('#b9cec4').text(s, tx + 10, ty, { width: tw - 10, lineBreak: false }); ty += 12;
  });
  doc.font('N').fontSize(7).fillColor(GREEN).text('Sugestie: instruire frânare anticipată', tx, ty + 2, { width: tw, lineBreak: false });
}
function mockCompliance(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Compliance · ore de condus');
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
  [['344 km', 'azi', GREEN], ['6/8', 'active', '#e6f3ec'], ['+12%', 'vs. ieri', GREEN]].forEach(function (k, i) {
    const kx = ix + i * (kw + 8);
    doc.roundedRect(kx, iy, kw, 30, 5).fillColor(DARK2).fill();
    doc.font('NX').fontSize(11).fillColor(k[2]).text(k[0], kx + 8, iy + 4, { lineBreak: false });
    doc.font('N').fontSize(6.5).fillColor('#8aa89c').text(k[1], kx + 8, iy + 19, { lineBreak: false });
  });
  iy += 40;
  doc.font('NB').fontSize(7.5).fillColor(AMBER).text('DE VERIFICAT', ix, iy, { lineBreak: false }); iy += 12;
  ['RA Watch: 1 vehicul offline > 3h', 'RA Care: ITP Iveco Daily în 8 zile'].forEach(function (s) {
    doc.circle(ix + 3, iy + 4, 1.6).fillColor(AMBER).fill();
    doc.font('N').fontSize(7.5).fillColor('#b9cec4').text(s, ix + 10, iy, { width: iw - 10, lineBreak: false }); iy += 13;
  });
}
function mockInsight(doc, x, y, w, h) {
  appPanel(doc, x, y, w, h, 'RA Insight · asistentul flotei');
  const ix = x + 12, iw = w - 24; let iy = y + 30;
  // contorul de apeluri (ca la Claude)
  doc.roundedRect(ix, iy, iw, 30, 6).fillColor(DARK2).fill();
  doc.font('NB').fontSize(8).fillColor('#e6f3ec').text('Îți mai rămân 7 din 50 apeluri', ix + 10, iy + 5, { lineBreak: false });
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
  doc.font('N').fontSize(7.5).fillColor('#b9cec4').text('MAN TGS 26.480 — 9.4 L/100km, cu 21% peste media flotei. Recomand verificarea presiunii și a stilului de condus.', ix + 20, iy + 5, { width: iw * 0.8 - 28 });
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
  doc.roundedRect(M, 44, 40, 30, 7).fillColor(GREEN).fill();
  doc.font('NX').fontSize(19).fillColor(INK).text('RA', M, 51, { width: 40, align: 'center', lineBreak: false });
  doc.font('NX').fontSize(21).fillColor('#fff').text('Tracks', M + 50, 52, { lineBreak: false });
  doc.font('NB').fontSize(10).fillColor(GREEN).text('INTELIGENȚĂ ARTIFICIALĂ PENTRU FLOTA TA', M, 150, { characterSpacing: 1 });
  doc.font('NX').fontSize(36).fillColor('#fff').text('6 agenți AI', M, 172, { width: CW });
  doc.font('NX').fontSize(36).fillColor(GREEN).text('+ RA Insight', M, 214, { width: CW });
  doc.font('N').fontSize(12).fillColor('#c9ddd3').text('Șase agenți care veghează flota non-stop — și un asistent AI care răspunde la orice întrebare despre ea. Fiecare cu rolul lui, direct în aplicație.', M, 268, { width: CW - 30 });

  // constelația celor 6 agenți (grilă de iconițe)
  const agIcons = [[FA.shield, 'Watch'], [FA.compass, 'Dispatch'], [FA.wrench, 'Care'], [FA.leaf, 'Optimize'], [FA.clipboard, 'Compliance'], [FA.file, 'Client']];
  const gy = 330, gcw = CW / 3;
  agIcons.forEach(function (g, i) {
    const gx = M + (i % 3) * gcw, gyy = gy + Math.floor(i / 3) * 92;
    doc.roundedRect(gx, gyy, gcw - 14, 78, 11).fillColor(DARK2).fill();
    aStroke(doc, gx, gyy, gcw - 14, 78, 11, GREEN, 0.25, 1);
    aFill(doc, gx + 14, gyy + 14, 32, 32, 8, GREEN, 0.16);
    icon(doc, g[0], gx + 22, gyy + 22, 16, GREEN);
    doc.font('NB').fontSize(11).fillColor('#fff').text('RA ' + g[1], gx + 54, gyy + 20, { lineBreak: false });
    doc.font('N').fontSize(7.5).fillColor('#8aa89c').text('rule-based · 0 tokeni', gx + 54, gyy + 36, { width: gcw - 70, lineBreak: false });
  });

  // banda RA Insight (vedeta)
  const iy = gy + 2 * 92 + 6;
  doc.roundedRect(M, iy, CW, 88, 12).fillColor('#12251b').fill();
  doc.rect(M, iy, 5, 88).fillColor(GREEN).fill();
  aFill(doc, M + 22, iy + 24, 40, 40, 10, GREEN, 0.18);
  icon(doc, FA.wand, M + 33, iy + 33, 20, GREEN);
  doc.font('NX').fontSize(15).fillColor('#fff').text('RA Insight — asistentul AI al flotei', M + 78, iy + 22, { lineBreak: false });
  doc.font('N').fontSize(9.5).fillColor('#c9ddd3').text('Singurul cu AI generativ (Claude Haiku). Întrebi în limbaj natural, îți răspunde despre flota ta și îți rezumă rapoartele. Se vinde cu pachet de apeluri, cu contor vizibil.', M + 78, iy + 42, { width: CW - 100 });

  doc.font('N').fontSize(9).fillColor('#7e948a').text('Monitorizare GPS & management de flotă · ratrack.ro', M, H - 46, { lineBreak: false });

  // ══════ P2 — Ce sunt agenții AI ══════
  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Agenți AI · concept');
  let y = M + 48;
  doc.font('NX').fontSize(22).fillColor('#111').text('Cum lucrează agenții', M, y); y += 32;
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Agenții sunt „angajați digitali" care verifică flota automat, din oră în oră, fiecare pe specialitatea lui. Când găsesc ceva, îți arată exact ce și unde — nu un istoric, ci starea de acum.', M, y, { width: CW }); y += 40;

  // 3 diferențiatori
  [[FA.bolt, 'Rulează singuri', 'automat, din oră în oră — plus rulare manuală oricând, cu un click'],
   [FA.circleCheck, 'Zero tokeni AI', 'funcționează pe reguli, nu pe modele — nu te costă nimic per verificare'],
   [FA.bell, 'Îți spun doar ce contează', 'când e „totul în regulă", tac; când apare o problemă, o semnalează']
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

  // distincție cheie: 6 rule-based vs RA Insight
  doc.roundedRect(M, y, CW, 96, 11).fillColor(DARK).fill();
  doc.rect(M, y, 5, 96).fillColor(GREEN).fill();
  icon(doc, FA.bolt, M + 22, y + 20, 15, GREEN);
  doc.font('NB').fontSize(9).fillColor(GREEN).text('DIFERENȚA IMPORTANTĂ', M + 46, y + 15, { lineBreak: false });
  doc.font('N').fontSize(10.5).fillColor('#e6f3ec').text('Cei 6 agenți sunt incluși în platformă și nu consumă AI — sunt reguli care veghează non-stop. RA Insight e singurul cu inteligență artificială reală (răspunde la întrebări în limbaj natural), de aceea se vinde separat, cu pachet de apeluri.', M + 46, y + 32, { width: CW - 70 });
  y += 96 + 20;
  doc.font('N').fontSize(9.5).fillColor(MUTED).text('Pe paginile următoare: fiecare agent cu rolul lui, ce face, ce date îți dă și cum te ajută — cu un exemplu real din aplicație.', M, y, { width: CW });
  pageFooter(doc, M, 2);

  // ══════ P3-P5 — cei 6 agenți, 2 per pagină ══════
  const AGENTS = [
    { icon: FA.shield, name: 'RA Watch', role: 'Paznic 24/7', mock: mockWatch,
      does: 'Veghează flota non-stop. Sesizează vehicule rămase offline, scăderi bruște de combustibil (posibil furt), ralanti prelungit și camioane cu tahograful neconfigurat.',
      data: 'Ce vehicul a dispărut de pe hartă și de cât timp, unde a fost văzut ultima dată, câți litri s-au pierdut și în cât timp.',
      helps: 'Afli imediat, nu la sfârșitul zilei, când un vehicul se oprește din raportat sau pierde combustibil — poți reacționa pe loc.' },
    { icon: FA.compass, name: 'RA Dispatch', role: 'Dispecerat', mock: mockDispatch,
      does: 'Găsește vehiculele disponibile chiar acum pentru o cursă și le arată pe cele subutilizate azi. Poate alege și cel mai apropiat de o destinație.',
      data: 'Vehicule online și staționate, cu numărul de înmatriculare, de cât timp stau, plus cel mai apropiat de adresa cursei și timpul estimat.',
      helps: 'Aloci cursa celui mai potrivit vehicul în câteva secunde, fără să suni pe rând fiecare șofer să afli unde e.' },
    { icon: FA.wrench, name: 'RA Care', role: 'Mentenanță', mock: mockCare,
      does: 'Urmărește toate scadențele flotei: ITP, RCA, revizii și intervale de service — calculate pe dată sau pe kilometri.',
      data: 'Ce expiră și când, pe fiecare vehicul: zile rămase până la ITP/RCA sau kilometri rămași până la următoarea revizie.',
      helps: 'Nu mai ratezi un ITP sau o revizie: eviți amenzile, imobilizările și reparațiile scumpe cauzate de service-ul sărit.' },
    { icon: FA.leaf, name: 'RA Optimize', role: 'Eco-driving', mock: mockOptimize,
      does: 'Calculează scorul eco al fiecărui vehicul din frânări și accelerări bruște, viteză și risipa la ralanti — și dă sugestii concrete de instruire.',
      data: 'Scor pe 100 per vehicul, ce anume a tras scorul jos azi (câte frânări/accelerări bruște, câte minute de ralanti) și ce să corectezi.',
      helps: 'Șoferi mai economici și mai siguri înseamnă mai puțin combustibil ars, uzură redusă și mai puține riscuri de accident.' },
    { icon: FA.clipboard, name: 'RA Compliance', role: 'Ore de condus', mock: mockCompliance,
      does: 'Urmărește orele de condus (continuu și zilnic, Reg. CE 561) și avertizează ÎNAINTE de depășire. Doar pentru vehiculele cu tahograf — camioane, nu turisme.',
      data: 'Timpul de condus continuu și zilnic per camion, cu avertisment când se apropie de limita legală, nu doar după ce a depășit-o.',
      helps: 'Eviți amenzile usturătoare la controlul ISCTR și protejezi șoferul de oboseală — prevenire, nu constatare.' },
    { icon: FA.file, name: 'RA Client', role: 'Sinteza zilei', mock: mockClient,
      does: 'Adună toată ziua într-un singur raport: kilometri, vehicule active, comparație cu ieri și concluziile celorlalți cinci agenți, într-un singur loc.',
      data: 'Km totali azi, câte vehicule au fost active vs. nefolosite, procentul față de ieri, vehiculul de top și lista scurtă „de verificat".',
      helps: 'În 30 de secunde știi cum a mers ziua în flotă, fără să deschizi cinci ecrane diferite — ideal pentru raportul de seară.' }
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
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Singurul agent cu inteligență artificială reală. Îl întrebi orice despre flotă, în limbaj natural — el caută în date și îți răspunde. Tot el rezumă rapoartele într-un paragraf clar.', M + 56, y + 28, { width: CW - 56 });
  y += 66;
  mockInsight(doc, M, y, CW, 158); y += 172;

  doc.font('NX').fontSize(13).fillColor('#111').text('Cum se vinde — pe pachet de apeluri', M, y); y += 22;
  // tabel pachete
  const pk = [['50', '19 lei', 'client mic'], ['100', '29 lei', 'uz mediu'], ['150', '49 lei', 'uz intens'], ['200', '59 lei', 'flotă mare']];
  const cw4 = CW / 4;
  pk.forEach(function (p, i) {
    const px = M + i * cw4;
    doc.roundedRect(px, y, cw4 - 10, 62, 9).fillColor(LIGHT).fill();
    doc.roundedRect(px, y, cw4 - 10, 62, 9).strokeColor(LINE).lineWidth(1).stroke();
    doc.font('NX').fontSize(17).fillColor(GREEN_D).text(p[0], px + 12, y + 10, { lineBreak: false });
    doc.font('N').fontSize(7.5).fillColor(MUTED).text('apeluri/lună', px + 12, y + 30, { lineBreak: false });
    doc.font('NB').fontSize(11).fillColor('#111').text(p[1], px + 12, y + 40, { lineBreak: false });
  });
  y += 62 + 8;
  pk.forEach(function (p, i) { const px = M + i * cw4; doc.font('N').fontSize(7.5).fillColor(MUTED).text(p[2], px + 12, y, { width: cw4 - 16, lineBreak: false }); });
  y += 22;

  // 3 puncte cheie despre facturare
  [[FA.gauge, 'Contor vizibil clientului', 'vede oricând câte apeluri i-au mai rămas din luna curentă, exact ca la Claude'],
   [FA.coins, 'Depășire ca la telefon', 'când termină pachetul, îi apare automat costul suplimentar pe apel — nu se blochează brusc'],
   [FA.trend, 'Profit garantat', 'un apel ne costă ~0,04 lei; pachetul e calculat să rămână profitabil chiar și la uz intens']
  ].forEach(function (d, i) {
    const cy2 = y + i * 46;
    doc.roundedRect(M + 14, cy2 + 2, 28, 28, 7).fillColor('#f0fdf4').fill();
    icon(doc, d[0], M + 21, cy2 + 8, 14, GREEN_D);
    doc.font('NB').fontSize(11).fillColor('#111').text(d[1], M + 52, cy2 + 2, { lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text(d[2], M + 52, cy2 + 17, { width: CW - 66, lineBreak: false });
  });
  y += 3 * 46 + 8;
  doc.roundedRect(M, y, CW, 44, 9).fillColor(DARK).fill();
  doc.rect(M, y, 5, 44).fillColor(GREEN).fill();
  icon(doc, FA.bolt, M + 20, y + 15, 13, GREEN);
  doc.font('N').fontSize(10).fillColor('#e6f3ec').text('Întrebările predefinite rămân gratuite. Se taxează doar chat-ul liber — controlat, cu limită lunară pe care o vede clientul.', M + 44, y + 14, { width: CW - 64 });
  pageFooter(doc, M, 6);

  // ══════ P7 — Închidere ══════
  doc.addPage(); doc.rect(0, 0, W, H).fillColor('#fff').fill(); pageHeader(doc, M, 'Pe scurt');
  y = M + 50;
  doc.font('NX').fontSize(20).fillColor('#111').text('Șapte instrumente AI, un singur ecran', M, y); y += 34;
  doc.font('N').fontSize(10.5).fillColor(MUTED).text('Toți agenții trăiesc în pagina „Agenți AI" din aplicație. Fiecare card arată pe scurt starea; îl deschizi și vezi detaliile.', M, y, { width: CW }); y += 34;

  // recap rânduri
  const recap = [[FA.shield, 'RA Watch', 'offline, furt combustibil, ralanti, tahograf'], [FA.compass, 'RA Dispatch', 'vehicule libere acum + cel mai apropiat de cursă'], [FA.wrench, 'RA Care', 'ITP, RCA, revizii — pe dată sau pe km'], [FA.leaf, 'RA Optimize', 'scor eco + sugestii de instruire'], [FA.clipboard, 'RA Compliance', 'ore de condus (Reg. 561) — doar camioane'], [FA.file, 'RA Client', 'sinteza zilei + concluziile celorlalți'], [FA.wand, 'RA Insight', 'asistent AI — întrebi orice despre flotă']];
  recap.forEach(function (r, i) {
    const ry = y + i * 34;
    doc.roundedRect(M, ry, CW, 28, 7).fillColor(i === 6 ? '#f0fdf4' : LIGHT).fill();
    if (i === 6) aStroke(doc, M, ry, CW, 28, 7, GREEN, 0.5, 1);
    if (i === 6) { aFill(doc, M + 8, ry + 5, 20, 18, 5, GREEN, 0.18); } else { doc.roundedRect(M + 8, ry + 5, 20, 18, 5).fillColor('#eef2f0').fill(); }
    icon(doc, r[0], M + 13, ry + 8, 11, GREEN_D);
    doc.font('NB').fontSize(10.5).fillColor('#111').text(r[1], M + 38, ry + 8, { width: 120, lineBreak: false });
    doc.font('N').fontSize(9.5).fillColor(MUTED).text(r[2], M + 164, ry + 8, { width: CW - 180, lineBreak: false });
    if (i === 6) { doc.font('NB').fontSize(8).fillColor(GREEN_D).text('cu plată', M + CW - 60, ry + 9, { width: 52, align: 'right', lineBreak: false }); }
    else { doc.font('N').fontSize(8).fillColor(MUTED).text('inclus', M + CW - 60, ry + 9, { width: 52, align: 'right', lineBreak: false }); }
  });
  y += recap.length * 34 + 14;

  // stats
  doc.roundedRect(M, y, CW, 58, 8).fillColor('#f0fdf4').fill();
  aStroke(doc, M, y, CW, 58, 8, GREEN, 0.5, 1);
  [['6', 'agenți incluși'], ['0', 'tokeni / verificare'], ['24/7', 'supraveghere'], ['1', 'asistent AI']].forEach(function (k, i) {
    const kx = M + 16 + i * (CW / 4);
    doc.font('NX').fontSize(20).fillColor(GREEN_D).text(k[0], kx, y + 11, { lineBreak: false });
    doc.font('N').fontSize(8.5).fillColor(MUTED).text(k[1], kx, y + 37, { lineBreak: false });
  });
  y += 58 + 22;

  // CTA
  doc.roundedRect(M, y, CW, 90, 12).fillColor(DARK).fill(); doc.rect(M, y, 5, 90).fillColor(GREEN).fill();
  doc.font('NX').fontSize(18).fillColor('#fff').text('Flota ta, supravegheată de AI.', M + 26, y + 20);
  doc.font('N').fontSize(10.5).fillColor('#c9ddd3').text('Cei 6 agenți sunt deja incluși. Activează RA Insight când vrei un asistent care răspunde la orice întrebare.', M + 26, y + 48, { width: CW - 210 });
  doc.roundedRect(W - M - 160, y + 30, 134, 34, 8).fillColor(GREEN).fill();
  doc.font('NX').fontSize(13).fillColor(INK).text('ratrack.ro', W - M - 160, y + 40, { width: 134, align: 'center', lineBreak: false });
  pageFooter(doc, M, 7);

  doc.end();
  return new Promise(function (r) { out.on('finish', r); });
}

build().then(function () { console.log('DONE: RA-Tracks_Agenti-AI.pdf'); });
