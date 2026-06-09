// Construiește monograma "RA |" (din imaginea reală a userului) + iconurile PWA.
// Cuvântul "Tracks" se redă ca TEXT în HTML (control pe scriere + temă), nu aici.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, 'public');
const SRC = path.join(PUB, '_logo-ref-fix.png');
const DARK = { r: 11, g: 14, b: 17 };
const DK = { r: 21, g: 24, b: 29 }; // #15181D pentru tema light

// Asigură imaginea sursă: dacă lipsește, o extrage din transcriptul sesiunii
function ensureSource() {
  if (fs.existsSync(SRC)) return;
  const JSONL = 'C:/Users/robert.gherbali/.claude/projects/C--Users-robert-gherbali-Desktop-GPS-Unitip-APP/c9e02c01-74a5-45b1-8c8e-d3f2856ea71d.jsonl';
  const lines = fs.readFileSync(JSONL, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let o; try { o = JSON.parse(lines[i]); } catch (e) { continue; }
    const m = o.message; if (!m || m.role !== 'user' || !Array.isArray(m.content)) continue;
    const txt = m.content.filter(b => b && b.type === 'text').map(b => b.text).join(' ');
    const img = m.content.find(b => b && b.type === 'image' && b.source && b.source.data);
    if (img && txt.includes('FIX acelasi')) { fs.writeFileSync(SRC, Buffer.from(img.source.data, 'base64')); return; }
  }
  throw new Error('Nu am găsit imaginea sursă în transcript');
}

function alphaFromLum(lum) { const lo = 12, hi = 62; if (lum <= lo) return 0; if (lum >= hi) return 255; return Math.round(((lum - lo) / (hi - lo)) * 255); }

async function transparent(buf, darkText) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const a = alphaFromLum(lum); data[i + 3] = a;
    if (darkText && a > 0) { const isGreen = g > r + 18 && g > b + 8; if (!isGreen) { data[i] = DK.r; data[i + 1] = DK.g; data[i + 2] = DK.b; } }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png();
}

(async () => {
  ensureSource();
  const trimmed = await sharp(SRC).trim({ threshold: 18 }).toBuffer();
  const tMeta = await sharp(trimmed).metadata();
  const W = tMeta.width, H = tMeta.height;

  // Monograma "RA |" = partea stângă (R + A verde + divider), FĂRĂ "traks"
  const markCrop = await sharp(trimmed).extract({ left: 0, top: 0, width: Math.round(W * 0.47), height: H }).trim({ threshold: 18 }).toBuffer();
  await (await transparent(markCrop, false)).toFile(path.join(PUB, 'logo-mark.png'));        // R alb (pt. dark)
  await (await transparent(markCrop, true)).toFile(path.join(PUB, 'logo-mark-light.png'));   // R închis (pt. light)
  const mkMeta = await sharp(path.join(PUB, 'logo-mark.png')).metadata();
  console.log('logo-mark:', mkMeta.width + 'x' + mkMeta.height);

  // Icon PWA = doar "RA" (R + A), pătrat pe fundal închis
  const raCrop = await sharp(trimmed).extract({ left: 0, top: 0, width: Math.round(W * 0.40), height: H }).trim({ threshold: 18 }).toBuffer();
  const raT = await (await transparent(raCrop, false)).toBuffer();
  const raMeta = await sharp(raT).metadata();
  const side = Math.round(Math.max(raMeta.width, raMeta.height) * 1.6);
  const iconBuf = await sharp({ create: { width: side, height: side, channels: 4, background: { ...DARK, alpha: 1 } } }).composite([{ input: raT, gravity: 'center' }]).png().toBuffer();
  for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'icon-180.png']]) {
    await sharp(iconBuf).resize(size, size).png().toFile(path.join(PUB, name));
  }
  const b64 = iconBuf.toString('base64');
  fs.writeFileSync(path.join(PUB, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${b64}"/></svg>`);
  console.log('icons + icon.svg regenerate');
  console.log('DONE');
})().catch(e => { console.error('ERR', e); process.exit(1); });
