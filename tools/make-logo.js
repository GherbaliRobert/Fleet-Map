// tools/make-logo.js — reface cele două logo-uri complete, din marcă + cuvântul scris cu fontul casei.
//
//   node tools/make-logo.js
//
// De ce există: fișierele `public/logo.png` și `public/logo-light.png` scriau **„RA | traks"**, nu
// „RA Tracks" — și ele ajung pe FIECARE raport PDF, pe fiecare Excel și pe oferta descărcată, adică
// pe tot ce vede clientul. În aplicație scrie „Tracks" peste tot, iar domeniul e ratrack.ro
// (Alin, 21.09: „«RA Tracks» trebuie să scrie").
//
// Cum se face: marca (`logo-mark*.png`, care are „RA" și bara verde) rămâne exact cum e — e desen,
// nu text. Cuvântul se scrie cu **Nunito ExtraBold**, adică FIX fontul cu care îl scrie aplicația în
// antet (`.ralogo .raw` → Nunito 800). Așa logo-ul din fișier și cel din pagină sunt același lucru.
//
// ⚠ Dimensiunea rămâne **694×135**, ca înainte. Nu e o alegere estetică: `xlPlaceLogo` din
// `report_export.js` pune imaginea în Excel cu o mărime FIXĂ (180×35 = același raport 5,14:1). Dacă
// schimbi raportul, logo-ul din Excel iese turtit. Deci cuvântul se potrivește în lățimea rămasă,
// nu invers.
//
// ⚠ Unealtă de DEZVOLTARE, nu parte din aplicație: are nevoie de un Chromium, pe care îl aduce
// Playwright. Nu e dependință a proiectului (ca și `tools/make-og-cover.js`, care scrie PNG-uri cu
// mâna, din module Node). Se rulează o dată, când se schimbă marca sau cuvântul; rezultatul —
// cele două PNG-uri — intră în repo.
const path = require('path');
const fs = require('fs');
let chromium = null;
for (const m of ['playwright', 'playwright-core']) {
  try { chromium = require(m).chromium; break; } catch (e) {}
}
if (!chromium) {
  console.error('Îmi trebuie Playwright ca să desenez logo-ul:  npm i -D playwright');
  console.error('(Unealtă de dezvoltare. Logo-urile gata făcute sunt deja în public/ — rulează asta');
  console.error(' doar dacă schimbi marca sau cuvântul.)');
  process.exit(1);
}

const RADACINA = path.join(__dirname, '..');
const PUBLIC = path.join(RADACINA, 'public');
const FONT = path.join(RADACINA, 'fonts', 'Nunito-ExtraBold.ttf');
const LAT = 694, INALT = 135;
const CUVANT = 'Tracks';

// Cele două variante. „Deschis"/„închis" se referă la FUNDAL, nu la culoarea literelor — capcana de
// denumire e veche și e scrisă și în CLAUDE.md: `logo.png` e varianta ALBĂ (pentru fundal închis).
const VARIANTE = [
  { iesire: 'logo.png',       marca: 'logo-mark.png',       culoare: '#FFFFFF', despre: 'litere ALBE, pentru fundal ÎNCHIS (aplicația)' },
  { iesire: 'logo-light.png', marca: 'logo-mark-light.png', culoare: '#0f172a', despre: 'litere ÎNCHISE, pentru fundal ALB (rapoarte, oferte, contracte)' },
];

function pagina(marcaB64, fontB64, culoare, marime, spatiu) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'NunitoX'; src: url(data:font/ttf;base64,${fontB64}) format('truetype'); font-weight: 800; }
    html, body { margin: 0; padding: 0; background: transparent; }
    .wrap { width: ${LAT}px; height: ${INALT}px; display: flex; align-items: center; justify-content: flex-start; gap: ${spatiu}px; }
    .wrap img { height: ${INALT}px; display: block; }
    .wrap span { font-family: 'NunitoX'; font-weight: 800; font-size: ${marime}px;
      letter-spacing: -.5px; color: ${culoare}; line-height: 1; white-space: nowrap;
      display: inline-block; }
  </style></head><body>
    <div class="wrap"><img id="m" src="data:image/png;base64,${marcaB64}"><span id="w">${CUVANT}</span></div>
  </body></html>`;
}

(async () => {
  if (!fs.existsSync(FONT)) { console.error('Lipsește ' + FONT); process.exit(1); }
  const fontB64 = fs.readFileSync(FONT).toString('base64');
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const v of VARIANTE) {
    const marcaB64 = fs.readFileSync(path.join(PUBLIC, v.marca)).toString('base64');
    const pg = await br.newPage({ viewport: { width: LAT, height: INALT }, deviceScaleFactor: 1 });

    // Mărimea literelor se CAUTĂ, nu se ghicește: cuvântul trebuie să încapă exact în lățimea rămasă
    // după marcă. „Tracks" are o literă în plus față de „traks", deci o mărime scrisă de mână ar
    // ieși din chenar la prima schimbare de cuvânt.
    let marime = 96, spatiu = 26, latimeTotala = 0;
    for (let i = 0; i < 40; i++) {
      await pg.setContent(pagina(marcaB64, fontB64, v.culoare, marime, spatiu), { waitUntil: 'load' });
      await pg.evaluate(() => document.fonts.ready);
      const m = await pg.evaluate(() => {
        const img = document.getElementById('m'), w = document.getElementById('w');
        return { img: img.getBoundingClientRect().width, txt: w.getBoundingClientRect().width };
      });
      latimeTotala = m.img + spatiu + m.txt;
      const ramas = LAT - latimeTotala;
      if (Math.abs(ramas) <= 1.5) break;
      // Corecție proporțională, dar mică: mărimea literelor duce aproape toată lățimea.
      marime = Math.max(20, marime + ramas * 0.55);
    }

    await pg.screenshot({ path: path.join(PUBLIC, v.iesire), omitBackground: true });
    await pg.close();
    console.log('✓ ' + v.iesire.padEnd(16) + v.despre);
    console.log('   ' + CUVANT + ' scris la ' + marime.toFixed(1) + 'px, lățime totală ' + latimeTotala.toFixed(1) + 'px din ' + LAT);
  }
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
