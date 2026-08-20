// tools/make-og-cover.js — construiește public/og-cover.png (1200×630), imaginea care apare când
// cineva trimite un link către ratrack.ro pe WhatsApp, LinkedIn sau Facebook.
//
// De ce un script și nu un fișier pus o dată de mână: dacă se schimbă logoul sau culoarea de brand,
// coperta se reface cu o comandă, în loc să rămână una veche pe care n-o mai poate reproduce nimeni.
//
// Fără biblioteci de imagini: Node are `zlib`, iar PNG-ul e, în esență, pixeli comprimați cu zlib.
// Decodăm logoul existent, îl așezăm pe fundalul de brand, scriem rezultatul. Tot ce presupunem
// despre formatul logoului e VERIFICAT la citire — dacă nu se potrivește, scriptul spune de ce și
// se oprește, în loc să producă o imagine stricată.
//
//   node tools/make-og-cover.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LAT = 1200, INAL = 630;
const FUNDAL = [0x0B, 0x0E, 0x11];      // --bg din paginile publice
const ACCENT = [0x3F, 0xE0, 0x7D];      // --accent

const RADACINA = path.join(__dirname, '..');
const SURSA_LOGO = path.join(RADACINA, 'public', 'logo.png');   // varianta ALBĂ, pentru fundal închis
const IESIRE = path.join(RADACINA, 'public', 'og-cover.png');

// ─── Citirea unui PNG simplu (8 biți, RGB sau RGBA, neîntrețesut) ────────────────────────────────
function citestePng(fisier) {
  const b = fs.readFileSync(fisier);
  if (b.slice(1, 4).toString() !== 'PNG') throw new Error(fisier + ' nu e PNG');
  let poz = 8, ihdr = null;
  const idat = [];
  while (poz < b.length) {
    const lung = b.readUInt32BE(poz);
    const tip = b.slice(poz + 4, poz + 8).toString('ascii');
    const date = b.slice(poz + 8, poz + 8 + lung);
    if (tip === 'IHDR') {
      ihdr = { lat: date.readUInt32BE(0), inal: date.readUInt32BE(4), adancime: date[8], culoare: date[9], intretesut: date[12] };
    } else if (tip === 'IDAT') idat.push(date);
    else if (tip === 'IEND') break;
    poz += 12 + lung;
  }
  if (!ihdr) throw new Error('PNG fără antet');
  if (ihdr.adancime !== 8) throw new Error('Logoul are ' + ihdr.adancime + ' biți/canal; scriptul știe doar 8.');
  if (ihdr.intretesut) throw new Error('Logoul e întrețesut (interlaced); scriptul nu-l poate citi.');
  if (ihdr.culoare !== 2 && ihdr.culoare !== 6) throw new Error('Logoul e de tip ' + ihdr.culoare + '; scriptul știe RGB (2) și RGBA (6).');

  const canale = ihdr.culoare === 6 ? 4 : 3;
  const brut = zlib.inflateSync(Buffer.concat(idat));
  const peRand = ihdr.lat * canale;
  const px = Buffer.alloc(ihdr.lat * ihdr.inal * 4);

  // Desfacerea filtrelor pe scanlinie — partea în care PNG-ul chiar cere atenție.
  let ant = Buffer.alloc(peRand);
  for (let y = 0; y < ihdr.inal; y++) {
    const f = brut[y * (peRand + 1)];
    const rand = Buffer.from(brut.slice(y * (peRand + 1) + 1, (y + 1) * (peRand + 1)));
    for (let i = 0; i < peRand; i++) {
      const a = i >= canale ? rand[i - canale] : 0;      // pixelul din stânga
      const s = ant[i];                                   // pixelul de sus
      const sa = i >= canale ? ant[i - canale] : 0;       // stânga-sus
      let v = rand[i];
      if (f === 1) v += a;
      else if (f === 2) v += s;
      else if (f === 3) v += (a + s) >> 1;
      else if (f === 4) {
        const p = a + s - sa, pa = Math.abs(p - a), ps = Math.abs(p - s), psa = Math.abs(p - sa);
        v += (pa <= ps && pa <= psa) ? a : (ps <= psa ? s : sa);
      }
      rand[i] = v & 0xFF;
    }
    for (let x = 0; x < ihdr.lat; x++) {
      const s = x * canale, d = (y * ihdr.lat + x) * 4;
      px[d] = rand[s]; px[d + 1] = rand[s + 1]; px[d + 2] = rand[s + 2];
      px[d + 3] = canale === 4 ? rand[s + 3] : 255;
    }
    ant = rand;
  }
  return { lat: ihdr.lat, inal: ihdr.inal, px };
}

// ─── Scrierea unui PNG RGBA ──────────────────────────────────────────────────────────────────────
function scriePng(fisier, lat, inal, px) {
  const crcTab = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    return t;
  })();
  const crc = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const bucata = (tip, date) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(date.length, 0);
    const td = Buffer.concat([Buffer.from(tip, 'ascii'), date]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td), 0);
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lat, 0); ihdr.writeUInt32BE(inal, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // Filtru 0 pe fiecare rând: imaginea e mică și simplă, nu merită optimizare.
  const cuFiltru = Buffer.alloc(inal * (lat * 4 + 1));
  for (let y = 0; y < inal; y++) {
    cuFiltru[y * (lat * 4 + 1)] = 0;
    px.copy(cuFiltru, y * (lat * 4 + 1) + 1, y * lat * 4, (y + 1) * lat * 4);
  }
  fs.writeFileSync(fisier, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bucata('IHDR', ihdr),
    bucata('IDAT', zlib.deflateSync(cuFiltru, { level: 9 })),
    bucata('IEND', Buffer.alloc(0)),
  ]));
}

// ─── Compunerea ──────────────────────────────────────────────────────────────────────────────────
const panza = Buffer.alloc(LAT * INAL * 4);
for (let i = 0; i < LAT * INAL; i++) {
  panza[i * 4] = FUNDAL[0]; panza[i * 4 + 1] = FUNDAL[1]; panza[i * 4 + 2] = FUNDAL[2]; panza[i * 4 + 3] = 255;
}
// Bară de accent jos: dă imaginii un reper de brand chiar și la dimensiune mică, în listă de chat.
for (let y = INAL - 10; y < INAL; y++) {
  for (let x = 0; x < LAT; x++) {
    const d = (y * LAT + x) * 4;
    panza[d] = ACCENT[0]; panza[d + 1] = ACCENT[1]; panza[d + 2] = ACCENT[2];
  }
}

const logo = citestePng(SURSA_LOGO);
// Logoul ocupă ~46% din lățime, centrat, puțin deasupra mijlocului — restul rămâne aer.
const scara = (LAT * 0.46) / logo.lat;
const lLat = Math.round(logo.lat * scara), lInal = Math.round(logo.inal * scara);
const x0 = Math.round((LAT - lLat) / 2), y0 = Math.round(INAL * 0.40 - lInal / 2);
for (let y = 0; y < lInal; y++) {
  for (let x = 0; x < lLat; x++) {
    // Eșantionare pe cel mai apropiat pixel: logoul se micșorează, deci nu apar trepte vizibile.
    const sx = Math.min(logo.lat - 1, Math.floor(x / scara));
    const sy = Math.min(logo.inal - 1, Math.floor(y / scara));
    const s = (sy * logo.lat + sx) * 4;
    const a = logo.px[s + 3] / 255;
    if (a <= 0.01) continue;
    const d = ((y0 + y) * LAT + (x0 + x)) * 4;
    if (d < 0 || d + 3 >= panza.length) continue;
    for (let c = 0; c < 3; c++) panza[d + c] = Math.round(logo.px[s + c] * a + panza[d + c] * (1 - a));
  }
}

scriePng(IESIRE, LAT, INAL, panza);

// Verificarea: recitim ce am scris. Un encoder care produce un fișier pe care nu-l poate reciti
// nimeni e mai rău decât lipsa fișierului — s-ar vedea abia în previzualizarea de pe WhatsApp.
const inapoi = citestePng(IESIRE);
if (inapoi.lat !== LAT || inapoi.inal !== INAL) throw new Error('imaginea scrisă nu se recitește corect');
// Numărăm pixelii care nu sunt fundal în zona logoului. Verificarea pe UN singur pixel din centru
// dădea alarme false: centrul geometric poate cădea exact între două litere.
let pixeliDesenati = 0;
for (let y = y0; y < y0 + lInal; y++) {
  for (let x = x0; x < x0 + lLat; x++) {
    const d = (y * LAT + x) * 4;
    if (inapoi.px[d] !== FUNDAL[0] || inapoi.px[d + 1] !== FUNDAL[1] || inapoi.px[d + 2] !== FUNDAL[2]) pixeliDesenati++;
  }
}
const areLogo = pixeliDesenati > (lLat * lInal) * 0.03;
console.log('og-cover.png scris: ' + LAT + 'x' + INAL + ', ' + Math.round(fs.statSync(IESIRE).size / 1024) + ' KB');
console.log(areLogo ? '  ✅ logoul e desenat (' + pixeliDesenati + ' pixeli)' : '  ⚠ zona logoului e goală — verifică sursa');
if (!areLogo) process.exit(1);
