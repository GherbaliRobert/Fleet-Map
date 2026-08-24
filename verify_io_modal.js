// verify_io_modal.js — fereastra „Ce înseamnă?" (catalogul IO), pe vehiculul deschis.
// Rulează `raxRenderIoDetails` REAL din pagină, cu un DOM fals, pe catalogul REAL din io_catalog.js.
//
//   node verify_io_modal.js
//
// Ce apără: filtrul „doar ce trimite mașina asta", valoarea de acum lângă fiecare cod, codurile
// pe care mașina le trimite dar nu sunt în catalog (marcate „necatalogat"), strângerea ID-urilor
// care duc la același semnal (io_35/85/88 = turația) și căutarea fără diacritice.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');
// Catalogul, exact cum îl compune serverul: intrările din io_catalog.js + cheia internă din codec8e.
const { IO_CATALOG } = require('./io_catalog.js');
const { getIoName } = require('./codec8e.js');
const catalog = IO_CATALOG.map(function (e) {
  return Object.assign({}, e, { key: getIoName(e.id, null) || ('io_' + e.id) });
});

function grabTo(a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('nu găsesc ' + a.slice(0, 40)); return src.slice(i, j); }
const fnRender = grabTo('    window.raxRenderIoDetails = function () {', '\n    window.raxOpenIoEditor');
// Pagina nu mai ține formatarea: deleagă la `window.RA_IOFMT` (io_format.js, servit ca
// /js/io-format.js). Îi dăm modulul REAL — așa proba trece prin exact lanțul din browser.
const ioFormat = require('./io_format.js');
const fnFmtVal = grabTo('    function formatIoValue(key, value) {', '\n    function renderIoPanel');

// DOM fals: doar elementele pe care le atinge funcția
function mkEl(v) { return { value: v, textContent: '', innerHTML: '', dataset: {}, checked: false, style: {} }; }
const els = {
  'rax-io-details-body': mkEl(''),
  'rax-io-details-search': mkEl(''),
  'rax-io-details-cat': mkEl(''),
  'rax-io-doar': mkEl(''),
  'rax-io-nr': mkEl(''),
  'rax-io-veh': mkEl(''),
};
const win = { IO_CAT: catalog, IO_CAT_CATEGORIES: [...new Set(catalog.map(e => e.category))].sort(), _raxIoVeh: null, RA_IOFMT: ioFormat };
const ctx = {
  document: { getElementById: id => els[id] || null },
  esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
};
const render = new Function('window', 'document', 'esc',
  fnFmtVal + '\n' + fnRender + '\n; return window.raxRenderIoDetails;')(win, ctx.document, ctx.esc);

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const sect = t => console.log('\n' + t);
const nrDin = h => { const m = /^<div [^>]*>(\d+) IO-uri/.exec(h); return m ? +m[1] : 0; };

// ── Mașina lui Alin: CAN cu cifre, fără steaguri ──
const masina = {
  nume: 'B 112 RFG',
  chei: { ignition: 0, movement: 0, can_engine_rpm: 679, can_fuel_level_liters: 51.1,
          can_total_mileage: 404795, external_voltage: 12820, battery_voltage: 4080,
          gsm_signal: 4, io_1148: 7 },
};

sect('1. Fără vehicul deschis — dicționarul întreg, ca înainte');
{
  win._raxIoVeh = null; els['rax-io-doar'].checked = false;
  els['rax-io-details-search'].value = ''; els['rax-io-details-cat'].value = '';
  render();
  const h = els['rax-io-details-body'].innerHTML;
  T('arată tot catalogul', nrDin(h) === catalog.length, nrDin(h) + ' / ' + catalog.length);
  T('nicio valoare „acum"', !h.includes('>acum<'));
}

sect('2. Cu vehicul deschis, bifat „doar ce trimite"');
{
  win._raxIoVeh = masina; els['rax-io-doar'].checked = true;
  els['rax-io-details-search'].value = ''; els['rax-io-details-cat'].value = '';
  render();
  const h = els['rax-io-details-body'].innerHTML;
  const n = nrDin(h);
  T('lista se scurtează mult', n > 0 && n < 30, n + ' intrări');
  T('conține turația (cheie internă)', h.includes('can_engine_rpm') || /Turați/i.test(h));
  T('arată valoarea de acum', h.includes('>acum<'));
  T('valoarea turației e formatată', h.includes('679 RPM'), h.match(/679[^<]*/));
  T('tensiunea e în volți, nu mV', h.includes('12.82 V'));
  T('prinde și codul brut io_1148', h.includes('io_1148'));
  T('rama e accentuată pe cele trimise', h.includes('border:1px solid var(--accent)'));
  T('contorul spune câte semnale', /\d+ semnale/.test(els['rax-io-nr'].textContent), els['rax-io-nr'].textContent);
  T('contorul spune câte n-au nume', /fără nume/.test(els['rax-io-nr'].textContent), els['rax-io-nr'].textContent);
  T('io_1148 e marcat necatalogat', h.includes('Necatalogat'));
  // nu trebuie să apară coduri pe care mașina NU le trimite
  T('nu arată AdBlue (mașina nu-l trimite)', !/adblue/i.test(h));
}

sect('3. Debifat — tot catalogul, dar cu valorile marcate');
{
  els['rax-io-doar'].checked = false;
  render();
  const h = els['rax-io-details-body'].innerHTML;
  T('revine la catalogul întreg', nrDin(h) === catalog.length, nrDin(h) + '');
  T('păstrează valorile „acum" pe cele trimise', h.includes('>acum<'));
  T('are și intrări fără valoare', h.includes('border:1px solid var(--border)'));
}

sect('4. Căutarea lucrează împreună cu filtrul');
{
  els['rax-io-doar'].checked = true; els['rax-io-details-search'].value = 'turatie';
  render();
  const h = els['rax-io-details-body'].innerHTML;
  T('caută fără diacritice („turatie’ găsește „Turație’)', nrDin(h) === 1, nrDin(h) + '');
  els['rax-io-details-search'].value = 'TURAȚIE'; render();
  T('nu-i pasă de majuscule sau diacritice', nrDin(els['rax-io-details-body'].innerHTML) === 1);
  els['rax-io-details-search'].value = 'turatie'; render();
  els['rax-io-details-search'].value = 'adblue';
  render();
  T('mesaj util când filtrul golește lista',
    /nu trimite niciun cod/.test(els['rax-io-details-body'].innerHTML));
  els['rax-io-details-search'].value = '';
}

sect('5. Mașină care nu trimite nimic util');
{
  win._raxIoVeh = null; els['rax-io-doar'].checked = true;
  render();
  T('fără vehicul, bifa nu filtrează nimic', nrDin(els['rax-io-details-body'].innerHTML) === catalog.length);
}

sect('6. Pagina chiar deleagă formatarea, nu-și ține copie');
{
  // sectiunea 5 a golit vehiculul; il punem la loc, altfel nu se randeaza nicio valoare
  win._raxIoVeh = masina;
  els['rax-io-doar'].checked = true; els['rax-io-details-search'].value = ''; render();
  const cu = els['rax-io-details-body'].innerHTML;
  // fără modul, delegarea trebuie să cadă pe valoarea brută — dovada că formatarea vine de-acolo
  const winFara = Object.assign({}, win, { RA_IOFMT: null });
  const rFara = new Function('window', 'document', 'esc',
    fnFmtVal + '\n' + fnRender + '\n; return window.raxRenderIoDetails;')(winFara, ctx.document, ctx.esc);
  rFara();
  const fara = els['rax-io-details-body'].innerHTML;
  T('cu modul, valorile sunt formatate', cu.includes('679 RPM') && cu.includes('12.82 V'));
  T('fără modul, rămân brute (deci nu există copie ascunsă)', !fara.includes('679 RPM') && !fara.includes('12.82 V'));
  render();
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
