const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, 'public', 'icon.svg'));
const out = [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'icon-180.png']];
Promise.all(out.map(([s, f]) =>
  sharp(svg, { density: 384 }).resize(s, s).png().toFile(path.join(__dirname, 'public', f))
)).then(() => console.log('ICONS_OK')).catch(e => { console.error('ERR ' + e.message); process.exit(1); });
