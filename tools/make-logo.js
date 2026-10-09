// tools/make-logo.js — reface cele două logo-uri complete, din marcă + cuvântul scris cu fontul casei.
//
//   node tools/make-logo.js
//
// De ce există: fișierele `public/logo.png` și `public/logo-light.png` ajung pe FIECARE raport PDF, pe fiecare
// Excel, pe oferta, contractul și factura descărcate, adică pe tot ce vede clientul. Până pe 21.09 scriau
// „RA | traks"; între 21.09 și 09.10, „RA | Tracks" (Alin, 21.09). **Din 09.10 numele e „RA Track"**, ca domeniul
// ratrack.ro (Robert, 09.10: „trebuia să fie ratrack nu ratracks… așa avem și domeniul").
//
// Cum se face: marca (`logo-mark*.png`, care are „RA" și bara verde) rămâne exact cum e — e desen, nu text.
// Cuvântul se scrie cu **Nunito ExtraBold**, adică FIX fontul cu care îl scrie aplicația în antet
// (`.ralogo .raw` → Nunito 800).
//
// ⚠ Dimensiunea rămâne **694×135**. Nu e o alegere estetică: `xlPlaceLogo` din `report_export.js` pune imaginea
// în Excel cu o mărime FIXĂ (180×35 = același raport 5,14:1). Alt raport = logo turtit în fiecare Excel.
// ⚠ Mărimea literelor e cea din sigla de pe 21.09 (`MARIME`), NU „cât să umple lățimea": „Track" are o literă mai
// puțin, iar umplut până la margine ar fi ieșit cu litere cât marca de înalte. Rămâne loc gol (transparent) în
// dreapta; unde sigla se centrează (`tools/make-og-cover.js`), se centrează după desen, nu după chenar.
//
// Cum desenează: cu browserul instalat (Edge sau Chrome, fără mod vizibil). Pagina se fotografiază de DOUĂ ori,
// pe negru și pe alb; din diferență ies transparența și culoarea fiecărui pixel (fără fundal). Unealtă de
// DEZVOLTARE, nu parte din aplicație; rezultatul — cele două PNG-uri — intră în repo. După ea rulează și
// `node tools/make-og-cover.js` și copiază monogramele în `mobile/public/` dacă le-ai schimbat.
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const RADACINA = path.join(__dirname, '..');
const PUBLIC = path.join(RADACINA, 'public');
const FONT = path.join(RADACINA, 'fonts', 'Nunito-ExtraBold.ttf');
const LAT = 694, INALT = 135;
const CUVANT = 'Track';
const MARIME = 113.6;   // px — mărimea la care „Tracks" umplea lățimea pe 21.09; literele rămân la fel de mari
const SPATIU = 26;      // px între marcă și cuvânt

// Cele două variante. „Deschis"/„închis" se referă la FUNDAL, nu la culoarea literelor — capcana de
// denumire e veche și e scrisă și în CLAUDE.md: `logo.png` e varianta ALBĂ (pentru fundal închis).
const VARIANTE = [
  { iesire: 'logo.png',       marca: 'logo-mark.png',       culoare: '#FFFFFF', despre: 'litere ALBE, pentru fundal ÎNCHIS (aplicația)' },
  { iesire: 'logo-light.png', marca: 'logo-mark-light.png', culoare: '#0f172a', despre: 'litere ÎNCHISE, pentru fundal ALB (rapoarte, oferte, contracte)' },
];

function browser() {
  const c = [process.env.CHROME,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const b = c.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
  if (!b) { console.error('Nu găsesc Edge sau Chrome. Pune calea în variabila CHROME.'); process.exit(1); }
  return b;
}

function pagina(marcaB64, fontB64, culoare, fundal) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'NunitoX'; src: url(data:font/ttf;base64,${fontB64}) format('truetype'); font-weight: 800; }
    html, body { margin: 0; padding: 0; background: ${fundal}; overflow: hidden; }
    .wrap { width: ${LAT}px; height: ${INALT}px; display: flex; align-items: center; justify-content: flex-start; gap: ${SPATIU}px; }
    .wrap img { height: ${INALT}px; display: block; }
    .wrap span { font-family: 'NunitoX'; font-weight: 800; font-size: ${MARIME}px;
      letter-spacing: -.5px; color: ${culoare}; line-height: 1; white-space: nowrap; display: inline-block; }
  </style></head><body>
    <div class="wrap"><img src="data:image/png;base64,${marcaB64}"><span>${CUVANT}</span></div>
  </body></html>`;
}

// ─── PNG: citire (8 biți, RGB/RGBA, neîntrețesut) și scriere RGBA — fără biblioteci ───
function citestePng(fisier) {
  const b = fs.readFileSync(fisier);
  let poz = 8, ihdr = null; const idat = [];
  while (poz < b.length) {
    const lung = b.readUInt32BE(poz), tip = b.slice(poz + 4, poz + 8).toString('ascii'), date = b.slice(poz + 8, poz + 8 + lung);
    if (tip === 'IHDR') ihdr = { lat: date.readUInt32BE(0), inal: date.readUInt32BE(4), adancime: date[8], culoare: date[9], intretesut: date[12] };
    else if (tip === 'IDAT') idat.push(date); else if (tip === 'IEND') break;
    poz += 12 + lung;
  }
  if (!ihdr || ihdr.adancime !== 8 || ihdr.intretesut || (ihdr.culoare !== 2 && ihdr.culoare !== 6)) throw new Error(fisier + ': PNG neașteptat');
  const can = ihdr.culoare === 6 ? 4 : 3, brut = zlib.inflateSync(Buffer.concat(idat)), peRand = ihdr.lat * can;
  const px = Buffer.alloc(ihdr.lat * ihdr.inal * 4); let ant = Buffer.alloc(peRand);
  for (let y = 0; y < ihdr.inal; y++) {
    const f = brut[y * (peRand + 1)], rand = Buffer.from(brut.slice(y * (peRand + 1) + 1, (y + 1) * (peRand + 1)));
    for (let i = 0; i < peRand; i++) {
      const a = i >= can ? rand[i - can] : 0, s = ant[i], sa = i >= can ? ant[i - can] : 0; let v = rand[i];
      if (f === 1) v += a; else if (f === 2) v += s; else if (f === 3) v += (a + s) >> 1;
      else if (f === 4) { const p = a + s - sa, pa = Math.abs(p - a), ps = Math.abs(p - s), psa = Math.abs(p - sa); v += (pa <= ps && pa <= psa) ? a : (ps <= psa ? s : sa); }
      rand[i] = v & 0xFF;
    }
    for (let x = 0; x < ihdr.lat; x++) { const s = x * can, d = (y * ihdr.lat + x) * 4; px[d] = rand[s]; px[d + 1] = rand[s + 1]; px[d + 2] = rand[s + 2]; px[d + 3] = can === 4 ? rand[s + 3] : 255; }
    ant = rand;
  }
  return { lat: ihdr.lat, inal: ihdr.inal, px };
}
function scriePng(fisier, lat, inal, px) {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  const crc = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const bucata = (tip, date) => { const l = Buffer.alloc(4); l.writeUInt32BE(date.length, 0); const td = Buffer.concat([Buffer.from(tip, 'ascii'), date]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td), 0); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(lat, 0); ihdr.writeUInt32BE(inal, 4); ihdr[8] = 8; ihdr[9] = 6;
  const cuFiltru = Buffer.alloc(inal * (lat * 4 + 1));
  for (let y = 0; y < inal; y++) px.copy(cuFiltru, y * (lat * 4 + 1) + 1, y * lat * 4, (y + 1) * lat * 4);
  fs.writeFileSync(fisier, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), bucata('IHDR', ihdr), bucata('IDAT', zlib.deflateSync(cuFiltru, { level: 9 })), bucata('IEND', Buffer.alloc(0))]));
}

function fotografiaza(br, html, iesire) {
  const tmp = path.join(os.tmpdir(), 'ra-logo-' + process.pid + '.html');
  fs.writeFileSync(tmp, html);
  try { fs.unlinkSync(iesire); } catch (e) {}
  execFileSync(br, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=' + LAT + ',' + INALT, '--virtual-time-budget=3000', '--screenshot=' + iesire, 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  const p = citestePng(iesire);
  if (p.lat !== LAT || p.inal !== INALT) throw new Error('fotografia are ' + p.lat + '×' + p.inal + ', nu ' + LAT + '×' + INALT);
  return p;
}

(function () {
  if (!fs.existsSync(FONT)) { console.error('Lipsește ' + FONT); process.exit(1); }
  const br = browser(), fontB64 = fs.readFileSync(FONT).toString('base64');
  for (const v of VARIANTE) {
    const marcaB64 = fs.readFileSync(path.join(PUBLIC, v.marca)).toString('base64');
    const tmpN = path.join(os.tmpdir(), 'ra-logo-negru.png'), tmpA = path.join(os.tmpdir(), 'ra-logo-alb.png');
    const N = fotografiaza(br, pagina(marcaB64, fontB64, v.culoare, '#000'), tmpN);
    const A = fotografiaza(br, pagina(marcaB64, fontB64, v.culoare, '#fff'), tmpA);
    // Pe negru: culoare × alfa. Pe alb: culoare × alfa + (1 − alfa) × 255. Deci alfa = 1 − (alb − negru) / 255.
    const px = Buffer.alloc(LAT * INALT * 4); let ultimaColoana = 0;
    for (let i = 0; i < LAT * INALT; i++) {
      let dif = 0; for (let c = 0; c < 3; c++) dif += A.px[i * 4 + c] - N.px[i * 4 + c];
      const alfa = Math.max(0, Math.min(1, 1 - dif / 3 / 255));
      for (let c = 0; c < 3; c++) px[i * 4 + c] = alfa > 0.004 ? Math.max(0, Math.min(255, Math.round(N.px[i * 4 + c] / alfa))) : 0;
      px[i * 4 + 3] = Math.round(alfa * 255);
      if (alfa > 0.05) ultimaColoana = Math.max(ultimaColoana, i % LAT);
    }
    scriePng(path.join(PUBLIC, v.iesire), LAT, INALT, px);
    try { fs.unlinkSync(tmpN); fs.unlinkSync(tmpA); } catch (e) {}
    console.log('✓ ' + v.iesire.padEnd(16) + v.despre);
    console.log('   „' + CUVANT + '" la ' + MARIME + 'px; desenul se termină la ' + (ultimaColoana + 1) + 'px din ' + LAT);
  }
})();
