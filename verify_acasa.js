// verify_acasa.js — cartonașele de pe „Acasă" (Administrare) și secțiunea care se deschide sub ele.
//
//   node verify_acasa.js
//
// De ce există: zona de administrare TAIE tot ce iese din ea (are derulare proprie), iar rândul de
// cartonașe începe chiar pe muchia ei. Cartonașul se ridică 2px sub mouse și mai are și un contur
// de 3px cât timp e deschis — fără o pernă cel puțin la fel de mare, marginea lui de sus era
// retezată și cardul arăta rupt. Nu e o chestie de gust: sunt cifre care trebuie să se potrivească.
//
// Ce prinde: perna de sus/dreapta scoasă sau micșorată, un contur mărit fără să crească perna,
// cardul deschis lăsat ridicat (iese din rând, iar pe telefon rămâne așa după atingere), linia de
// legătură care nu mai ajunge la bară sau care redevine un vârf plin ce mușcă din conturul cardului,
// și un cartonaș rămas fără butonul care deschide secțiunea.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');
const html = fs.readFileSync(P('public/index.html'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

// blocul unei reguli CSS, după selector (prima potrivire)
function regula(sursa, selector) {
  const i = sursa.indexOf(selector);
  if (i < 0) return null;
  const a = sursa.indexOf('{', i), b = sursa.indexOf('}', a);
  if (a < 0 || b < 0) return null;
  return sursa.slice(a + 1, b);
}
const px = (bloc, prop) => {
  if (!bloc) return null;
  const m = bloc.match(new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*(-?[\\d.]+)px'));
  return m ? parseFloat(m[1]) : null;
};

console.log('\n1. Perna care ține cartonașele întregi');
const hover = regula(html, '.adash-card:hover');
const ridicare = (() => { const m = (hover || '').match(/translateY\(\s*(-?[\d.]+)px/); return m ? Math.abs(parseFloat(m[1])) : null; })();
const deschis = regula(css, '#admin-dash .adash-card.deschis');
const contur = (() => { const m = (deschis || '').match(/box-shadow\s*:\s*0\s+0\s+0\s+([\d.]+)px/); return m ? parseFloat(m[1]) : null; })();
const zona = regula(css, '#admin-content{');
const pernaSus = px(zona, 'padding-top');
const pernaDreapta = px(zona, 'padding-right');
T('cartonașul se ridică sub mouse (așa a fost gândit)', ridicare !== null && ridicare > 0, String(ridicare));
T('cartonașul deschis are contur în jur', contur !== null && contur > 0, String(contur));
T('zona de administrare are pernă sus', pernaSus !== null && pernaSus > 0, String(pernaSus));
T('zona de administrare are pernă în dreapta', pernaDreapta !== null && pernaDreapta > 0, String(pernaDreapta));
T('perna de sus acoperă și ridicarea, și conturul',
  pernaSus !== null && ridicare !== null && contur !== null && pernaSus >= ridicare + contur,
  'pernă ' + pernaSus + ' vs. ' + ridicare + ' + ' + contur);
T('perna din dreapta acoperă conturul',
  pernaDreapta !== null && contur !== null && pernaDreapta >= contur,
  'pernă ' + pernaDreapta + ' vs. ' + contur);

console.log('\n2. Cardul deschis stă în rând cu vecinii lui');
T('nu rămâne ridicat', /transform\s*:\s*none/.test(deschis || ''), (deschis || '').trim().slice(0, 80));

console.log('\n3. Linia de legătură dintre cartonaș și secțiunea lui');
const linie = regula(css, '#admin-dash .adash-card.deschis:after');
const bara = regula(css, '#adash-bara{');
const randCarduri = regula(html, '.adash-cards {');
const golDeSus = Math.max(px(randCarduri, 'margin-bottom') || 0, px(bara, 'margin-top') || 0); // marginile vecine se contopesc
const hLinie = px(linie, 'height'), josLinie = px(linie, 'bottom'), latLinie = px(linie, 'width');
T('linia ajunge exact până la bară', hLinie !== null && hLinie === golDeSus, hLinie + ' vs. gol ' + golDeSus);
T('pornește de sub cardul întreg, nu peste conturul lui', josLinie !== null && josLinie === -golDeSus, String(josLinie));
T('e o linie subțire, nu un vârf plin care mușcă din card',
  latLinie !== null && latLinie <= 4 && !/rotate\(/.test(linie || ''), String(latLinie));

console.log('\n4. Fiecare cartonaș chiar deschide o secțiune');
const carduri = html.match(/<button class="adash-card[^>]*>/g) || [];
T('sunt cele patru cartonașe', carduri.length === 4, String(carduri.length));
const perechi = carduri.map(b => ({
  card: (b.match(/data-card="([^"]+)"/) || [])[1],
  clic: (b.match(/raxDashCard\('([^']+)'/) || [])[1]
}));
T('fiecare are un nume de secțiune', perechi.every(p => !!p.card), JSON.stringify(perechi));
T('butonul deschide fix secțiunea lui', perechi.every(p => p.card === p.clic), JSON.stringify(perechi));
T('secțiunile chemate există în pagină', perechi.every(p => html.indexOf('id="admin-tab-' + p.card + '"') > 0), JSON.stringify(perechi.map(p => p.card)));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
