// verify_fisa_vehicul.js — fișa vehiculului pe file (Alin, 10.11: „1. da, 2. da, 3. da" la macheta cu filele în stânga).
//
//   node verify_fisa_vehicul.js
//
// Ce păzește:
//   1. pagina: filele, în ordinea aprobată, fiecare cu fila ei de conținut; câmpurile pe filele lor (aparatul GPS — IMEI, modelul,
//      cartela — în „General"); fiecare câmp citit de salvare există o singură dată; „Anulează" + „Salvează" o singură dată, jos, în
//      familia butoanelor casei; fereastra fără lățimea scrisă pe element; numele vechi („Detalii vehicul", „Config Camion") nu mai
//      apar pe ecran; drumul vechi („basic") duce la „General";
//   2. în browser (Chromium; se sare dacă lipsește), pe ambele teme, cu foaia de stil a aplicației și piesele paginii:
//      pe calculator (1366 × 860) și pe telefon (390 × 844) „Salvează" se vede fără derulare, fereastra încape în ecran, se vede o
//      singură filă; „Ai modificări nesalvate" după o literă, nota proprie pe „Documente"; pe telefon filele sunt un rând care se
//      derulează și pagina nu iese din ecran; contrastul filei alese și al notei de jos ≥ 4,5.
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 500) : '')); }
}
function gata() {
  console.log('\n──────────────────────────────\n' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const PAG = citeste('public/index.html');
const CSS = citeste('public/css/app.css');

// ── Bucățile paginii ──
const a = PAG.indexOf('  <!-- Edit Device Modal -->'), b = PAG.indexOf('  <!-- Semiremorcă / remorcă (simulatorul de încărcare');
const FISA = a >= 0 && b > a ? PAG.slice(a, b) : '';
const ja = PAG.indexOf('    // ─── Fișa vehiculului pe file (Alin, 10.11'), jb = PAG.indexOf('    // ─── Documente & service per vehicul ───');
const JS = ja >= 0 && jb > ja ? PAG.slice(ja, jb) : '';
const ca = CSS.indexOf('/* ═══ Fișa vehiculului pe file');
const BLOC = ca >= 0 ? CSS.slice(ca) : '';
const fila = (k) => { const i = FISA.indexOf('id="edit-tab-' + k + '"'); if (i < 0) return ''; const j = FISA.indexOf('id="edit-tab-', i + 10); return FISA.slice(i, j < 0 ? undefined : j); };

console.log('\n1. Pagina');
T('fișa, piesele ei de cod și stilul ei se găsesc între repere', !!FISA && !!JS && !!BLOC);
const FILE = ['general', 'tehnice', 'consum', 'administrativ', 'truck', 'incarcare', 'calibration', 'sensors', 'documents', 'service', 'workschedule'];
const NUME = ['General', 'Date tehnice', 'Consum și limite', 'Administrativ', 'Camion', 'Încărcare', 'Sonda combustibil', 'Sonde (avansat)', 'Documente', 'Service', 'Program de lucru'];
const butoane = [...FISA.matchAll(/<button type="button" class="edit-tab[^"]*" data-tab="([a-z]+)"[^>]*>.*?<span>([^<]+)<\/span><\/button>/g)].map((m) => [m[1], m[2]]);
T('filele, în ordinea aprobată (Mașina: General, Date tehnice, Consum și limite, Administrativ; Mai mult: Camion … Program de lucru)',
  JSON.stringify(butoane.map((x) => x[0])) === JSON.stringify(FILE) && JSON.stringify(butoane.map((x) => x[1])) === JSON.stringify(NUME), JSON.stringify(butoane));
T('două grupe, „Mașina" și „Mai mult", cu despărțitorul între ele',
  /<div class="vf-grup">Mașina<\/div>[\s\S]*data-tab="administrativ"[\s\S]*<span class="vf-desp"[^>]*><\/span>\s*<div class="vf-grup">Mai mult<\/div>\s*<button[^>]*data-tab="truck"/.test(FISA));
T('fiecare filă are fila ei de conținut (o singură dată), iar „General" e cea deschisă la început',
  FILE.every((k) => (FISA.match(new RegExp('id="edit-tab-' + k + '"', 'g')) || []).length === 1) &&
  /id="edit-tab-general" class="edit-tab-content">/.test(FISA) && /class="edit-tab active" data-tab="general"/.test(FISA));
const pe = (k, ids) => { const f = fila(k); return ids.filter((id) => f.indexOf('id="' + id + '"') < 0); };
const LOC = {
  general: ['edit-name', 'edit-plate', 'edit-vin', 'edit-vehicle-type', 'edit-group', 'edit-driver', 'edit-istoric-soferi', 'edit-imei', 'edit-imei-aparat',
    'edit-schimba-aparat', 'edit-gps-model', 'edit-sim-number', 'edit-ignition-source', 'edit-can-interface'],
  tehnice: ['edit-brand', 'edit-model', 'edit-year', 'edit-fuel-type', 'edit-displacement', 'edit-power-kw', 'edit-engine-serial', 'edit-emission-class', 'edit-tire-size', 'edit-passenger-seats'],
  consum: ['edit-cons-city', 'edit-cons-road', 'edit-cons-idle', 'edit-tank-capacity', 'edit-lpg-volume', 'edit-speed-limit', 'edit-payload', 'edit-temp-min', 'edit-temp-max', 'edit-road-tax', 'edit-odo-base'],
  administrativ: ['edit-cost-center', 'edit-inventory', 'edit-icon', 'edit-color', 'edit-show-transport', 'edit-notes'],
  truck: ['edit-tare', 'edit-max-legal', 'edit-max-construct', 'edit-fuel-price', 'edit-axle1', 'edit-axle2', 'edit-axle3', 'edit-axle4', 'edit-axle5', 'edit-cost-tonkm'],
};
const lipsa = Object.keys(LOC).map((k) => [k, pe(k, LOC[k])]).filter((x) => x[1].length);
T('câmpurile stau pe filele lor; aparatul GPS (IMEI, modelul, cartela SIM) e în „General" (Alin, 10.11: „2. da")', !lipsa.length, JSON.stringify(lipsa));
T('„Aparatul GPS" e o secțiune a filei „General", după „Identificare" și „Șofer și grupă"',
  /<div class="vf-sect">Identificare<\/div>[\s\S]*<div class="vf-sect">Șofer și grupă<\/div>[\s\S]*<div class="vf-sect">Aparatul GPS<\/div>/.test(fila('general')));
// Ce citește salvarea: fiecare câmp există o singură dată în toată pagina (două casete cu același id = se citește prima găsită).
const sd = PAG.indexOf('    async function saveDevice() {'), sdEnd = PAG.indexOf('\n    }\n', sd);
const SAVE = sd >= 0 ? PAG.slice(sd, sdEnd) : '';
const citite = [...new Set([...SAVE.matchAll(/(?:getElementById|numOrNull|strOrNull)\('(edit-[a-z0-9-]+)'\)/g)].map((m) => m[1]))];
const nuUnul = citite.filter((id) => (PAG.match(new RegExp('id="' + id + '"', 'g')) || []).length !== 1);
T('fiecare câmp citit de „Salvează" (' + citite.length + ') există o singură dată în pagină, în fișă', citite.length > 35 && !nuUnul.length && citite.every((id) => FISA.indexOf('id="' + id + '"') >= 0), JSON.stringify(nuUnul));
T('„Anulează" și „Salvează" stau o singură dată, jos, în butoanele casei (`.ra-camp` + `.rax-btn.primary`)',
  (FISA.match(/onclick="saveDevice\(\)"/g) || []).length === 1 &&
  /<div class="vf-jos ra-camp">\s*<div class="vf-jos-txt" id="vf-jos-txt"[^>]*><\/div>\s*<button type="button" class="rax-btn vf-anul" onclick="closeEditModal\(\)">Anulează<\/button>\s*<button type="button" class="rax-btn primary vf-salv" onclick="saveDevice\(\)">\s*<i class="fas fa-save"><\/i> Salvează\n/.test(FISA));
T('fereastra n-are lățimea / derularea scrise pe element (le dă foaia de stil): se derulează doar fila',
  /<div class="modal vf" role="dialog"[^>]*>/.test(FISA) && !/<div class="modal vf"[^>]*style=/.test(FISA) &&
  /#edit-modal > \.modal\.vf \{[^}]*height: min\(86vh, 760px\);[^}]*overflow: hidden;[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;/.test(BLOC) &&
  /#edit-modal \.vf-main \{[^}]*overflow-y: auto;/.test(BLOC));
T('sus, ce mașină editezi: numărul (îngroșat), apoi numele — pus ca text, din fișa venită de la server',
  /function _vfSub\(plate, name\)/.test(JS) && /b\.textContent = nr \|\| nume/.test(JS) && !/innerHTML/.test(JS) && /_vfSub\(dev\.plate, dev\.name\);/.test(PAG));
T('se deschide mereu pe „General", fără „modificări" rămase de la mașina dinainte (Alin, 10.11: „3. da")',
  /_vfSchimbat = false;\s*_vfSub\('', ''\);\s*switchEditTab\('general'\);/.test(PAG));
T('drumul vechi („basic", din legăturile de dinainte) duce la „General"', /if \(tab === 'basic'\) tab = 'general';/.test(JS) && !/data-tab="basic"/.test(PAG));
T('pictograma aleasă și câmpurile completate din act aprind „Ai modificări nesalvate"',
  /function pickIcon\(val\) \{[\s\S]{0,200}window\._vfAtins\(\)/.test(PAG) && /el\.classList\.add\('scan-filled'\);\s*if \(window\._vfAtins\) window\._vfAtins\(\);/.test(PAG));
const vizibil = PAG.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
T('pe ecran nu mai scrie „Detalii vehicul" sau „Config Camion" (numele vechi ale filelor)',
  !/Detalii vehicul/.test(FISA) && !/Config Camion/.test(vizibil) && !/Config Camion/.test(citeste('insight_ghid.js')) && !/Detalii vehicul/.test(citeste('insight_ghid.js')) && !/Detalii vehicul/.test(citeste('probleme.js')));
T('textele fișei au diacritice („Configureaza", „Adauga punct", „Limite per axa" au plecat)',
  !/Configureaza|Adauga punct|Limite per axa|Cost per tona|interpolare liniara|Calibrare sonda litrometrica/.test(FISA));
T('casetele fișei n-au mărimi scrise în linie (axele aveau 12 px și 6 px de margine)', !/id="edit-axle\d" [^>]*style=/.test(FISA) && !/<label style="font-size:10px;">/.test(FISA));
T('pe telefon (≤ 768 px): foaie de jos de 90% din ecran, filele un rând de butoane rotunde, butoanele jos pe jumătate',
  /@media \(max-width: 768px\) \{[\s\S]*height: 90dvh; max-height: 90dvh !important;[\s\S]*padding: 0 !important;[\s\S]*#edit-modal \.vf-nav \{[\s\S]*flex-direction: row; overflow-x: auto;[\s\S]*#edit-modal \.vf-jos \.rax-btn, #edit-modal \.vf-jos \.rax-btn\.primary \{ flex: 1 1 0; min-width: 0; \}/.test(BLOC));

(async () => {
  console.log('\n2. În browser: calculator și telefon, ambele teme');
  let pw = null; try { pw = require('playwright'); } catch (e) {}
  let br = null; if (pw) { try { br = await pw.chromium.launch(); } catch (e) { br = null; } }
  if (!br) { console.log('  (fără Chromium: partea din browser se sare)'); return gata(); }
  // Pagina de probă: foaia de stil a aplicației, fișa așa cum e în pagină, piesele ei de cod. Restul aplicației — doar cât trebuie.
  // ⚠ Tema se pune pe <body> prin locul ei (@@CORP@@): foaia de stil are chiar textul „<body>" într-un comentariu, iar un
  // replace('<body>', …) l-ar schimba pe acela — proba ar fi măsurat de două ori tema deschisă (prins pe 11.11).
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + CSS + '</style></head><body@@CORP@@>' +
    FISA.replace('class="modal-overlay"', 'class="modal-overlay visible"') +
    '<script>var _inc = 0, _docs = 0; function loadVehicleDocuments() { _docs++; } function loadVehicleService() {} function closeEditModal() {} function saveDevice() {}\n' +
    JS + '\nswitchEditTab("general"); _vfSub("B 77 TIR", "MAN TGX 18.510");</script></body></html>';
  const masura = () => {
    const r = (e) => e.getBoundingClientRect();
    const m = document.querySelector('#edit-modal > .modal'), s = document.querySelector('.vf-salv'), a = document.querySelector('.vf-anul');
    const vazute = [...document.querySelectorAll('#edit-modal .edit-tab-content')].filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.id);
    const inEcran = (e) => { const x = r(e); return x.top >= 0 && x.left >= 0 && x.bottom <= innerHeight + 0.5 && x.right <= document.documentElement.clientWidth + 0.5 && x.height > 30; };
    const nav = document.querySelector('.vf-nav');
    return { m: { w: Math.round(r(m).width), h: Math.round(r(m).height) }, salvInEcran: inEcran(s), anulInEcran: inEcran(a), vazute,
      salvW: Math.round(r(s).width), anulW: Math.round(r(a).width), salvH: Math.round(r(s).height),
      navDir: getComputedStyle(nav).flexDirection, navDerulat: nav.scrollWidth > nav.clientWidth + 1,
      pagLata: document.documentElement.scrollWidth > document.documentElement.clientWidth, ecranH: innerHeight, ecranW: document.documentElement.clientWidth,
      sub: document.getElementById('vf-sub').textContent };
  };
  const lum = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/) || String(c).match(/color\(srgb ([^)]+)\)/);
    if (!m) return null;
    let p = m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (/color\(srgb/.test(c)) p = p.map((x) => x * 255);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  };
  const contrast = (c1, c2) => { const a = lum(c1), b = lum(c2); if (a == null || b == null) return 0; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  for (const [nume, ctxO] of [['calculator', { viewport: { width: 1366, height: 860 } }], ['telefon', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }]]) {
    for (const tema of ['deschisă', 'închisă']) {
      const ctx = await br.newContext(ctxO); const pg = await ctx.newPage();
      await pg.setContent(html.replace('<body@@CORP@@>', tema === 'închisă' ? '<body class="dark">' : '<body>'));
      await pg.waitForTimeout(150);
      const m0 = await pg.evaluate(masura);
      T('pagina de probă e chiar pe tema ' + tema, (await pg.evaluate(() => document.body.classList.contains('dark'))) === (tema === 'închisă'));
      const eticheta = nume + ', tema ' + tema;
      T(eticheta + ': „Salvează" și „Anulează" se văd fără derulare; fereastra încape în ecran; o singură filă deschisă (General)',
        m0.salvInEcran && m0.anulInEcran && m0.salvH >= 40 && JSON.stringify(m0.vazute) === '["edit-tab-general"]' && !m0.pagLata && m0.sub === 'B 77 TIR · MAN TGX 18.510', JSON.stringify(m0));
      if (nume === 'calculator') {
        T(eticheta + ': fereastra e lată (1040 px), filele în stânga, în coloană', m0.m.w === 1040 && m0.navDir === 'column', JSON.stringify(m0));
      } else {
        T(eticheta + ': foaie de jos de 90% din ecran, filele un rând care se derulează, butoanele pe jumătate fiecare',
          Math.abs(m0.m.h - Math.round(m0.ecranH * 0.9)) <= 2 && m0.m.w === m0.ecranW && m0.navDir === 'row' && m0.navDerulat && Math.abs(m0.salvW - m0.anulW) <= 2, JSON.stringify(m0));
      }
      // O literă scrisă → „Ai modificări nesalvate"; pe „Documente", nota ei; „basic" → General.
      const st = await pg.evaluate(() => {
        const nota = () => { const t = document.getElementById('vf-jos-txt'); return { t: t.textContent, s: t.classList.contains('schimbat'), vazut: getComputedStyle(t).display !== 'none' }; };
        const inainte = nota();
        switchEditTab('consum');
        const c = document.getElementById('edit-cons-road'); c.value = '29'; c.dispatchEvent(new Event('input', { bubbles: true }));
        const dupa = nota(), vazute = [...document.querySelectorAll('#edit-modal .edit-tab-content')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.id);
        const activ = document.querySelector('#edit-modal .edit-tab.active').getAttribute('data-tab');
        switchEditTab('documents'); const docs = nota(); const nDocs = _docs;
        switchEditTab('basic'); const inapoi = document.querySelector('#edit-modal .edit-tab.active').getAttribute('data-tab');
        const t = document.getElementById('vf-jos-txt'), fund = getComputedStyle(document.querySelector('.vf-jos')).backgroundColor;
        switchEditTab('consum');
        const tab = document.querySelector('#edit-modal .edit-tab.active');
        return { inainte, dupa, vazute, activ, docs, nDocs, inapoi, culoareNota: getComputedStyle(t).color, fundNota: fund,
          tabCul: getComputedStyle(tab).color, tabFund: getComputedStyle(tab).backgroundColor };
      });
      T(eticheta + ': o literă scrisă → „Ai modificări nesalvate."; „Documente" își spune nota și își încarcă actele; „basic" → General',
        st.dupa.t === 'Ai modificări nesalvate.' && st.dupa.s && st.dupa.vazut && JSON.stringify(st.vazute) === '["edit-tab-consum"]' && st.activ === 'consum' &&
        /^Actele se salvează din fereastra lor\./.test(st.docs.t) && st.nDocs === 1 && st.inapoi === 'general' &&
        (nume === 'calculator' ? st.inainte.vazut && /^„Salvează" păstrează toate filele deodată\.$/.test(st.inainte.t) : !st.inainte.vazut), JSON.stringify(st));
      const cNota = contrast(st.culoareNota, st.fundNota), cTab = contrast(st.tabCul, st.tabFund);
      T(eticheta + ': contrastul notei „Ai modificări nesalvate" (' + cNota.toFixed(2) + ') și al filei alese (' + cTab.toFixed(2) + ') ≥ 4,5',
        cNota >= 4.5 && cTab >= 4.5, JSON.stringify([st.culoareNota, st.fundNota, st.tabCul, st.tabFund]));
      await ctx.close();
    }
  }
  await br.close();
  gata();
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + ((e && e.stack) || e)); process.exit(1); });
