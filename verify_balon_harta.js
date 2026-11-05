// verify_balon_harta.js — balonul de pe hartă (clic pe o mașină, Localizare): numărul de înmatriculare e titlul (05.11).
// Alin, cu o poză: „la titlu apare VW Caddy scris mare — vreau numărul de înmatriculare acolo… o flotă poate avea 10 Caddy,
// omul din grabă nu se mai uită jos să vadă numărul; în locul «Nr. înmatriculare» de mai jos, denumirea mașinii".
//
//   node verify_balon_harta.js
//
// Ce păzește (codul balonului, public/js/vehicle-popup.js, rulat aici cu o hartă de carton — nu copiat):
//   1. titlul = numărul; fără număr, denumirea; fără nimic, IMEI-ul;
//   2. primul rând = „Denumire" (numele din fișă), doar când e altceva decât numărul; rândul „Nr. înmatriculare" nu mai există;
//   3. „Vehicul" (marca + modelul din fișă) nu repetă denumirea („VW Caddy" / „VW Caddy"), nici la deschidere, nici după
//      ce sosește fișa; când spune altceva („Caddy Ion" / „VW Caddy"), rămâne;
//   4. textul din fișă se scrie ca text (fără HTML strecurat);
//   5. banda „Urmărești" (după butonul „Urmărește") scrie tot numărul, cu denumirea după el, stinsă (Alin, 05.11: „fă asta");
//      pe tema deschisă numărul e pe verdele închis al textelor (verdele casei pe alb abia se citește).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 400) : '')); }
}
const SRC = fs.readFileSync(path.join(__dirname, 'public/js/vehicle-popup.js'), 'utf8');

// Deschide balonul pentru o mașină, pe o hartă de carton; `full` = ce întoarce /api/devices/:imei/full.
async function balon(dev, full) {
  const devices = new Map([[dev.imei, dev]]);
  const els = {};
  const creat = [];
  let continut = '';
  const popup = { setLatLng() { return this; }, setContent(h) { continut = h; return this; }, isOpen() { return true; } };
  const harta = { openPopup() {}, on() {}, closePopup() {} };
  const markere = new Map([[dev.imei, { getLatLng() { return [44.4, 26.1]; } }]]);
  const win = { getLeafletMap: () => harta, getMarkersMap: () => markere, getDevicesMap: () => devices, isDeviceOnline: () => true };
  const ctx = {
    window: win,
    document: { getElementById: (id) => els[id] || null, addEventListener() {}, querySelectorAll: () => [], body: { appendChild() {} }, createElement: () => { const e = { style: {} }; creat.push(e); return e; } },
    L: { popup: () => popup },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(full || { error: 'fără fișă' }) }),
    Date, Math, String, Number, isFinite, isNaN, Promise, console,
  };
  vm.runInNewContext(SRC, ctx);
  win.openVehiclePopup(dev.imei);
  const html = continut;
  // Nodurile pe care le atinge balonul după ce sosește fișa: rândul „Vehicul", cu starea lui de la deschidere.
  const rv = new RegExp('<tr id="vp-vehrow-' + dev.imei + '"( style="display:none")?>').exec(html);
  els['vp-vehrow-' + dev.imei] = { style: { display: rv && rv[1] ? 'none' : '' } };
  els['vp-veh-' + dev.imei] = { style: {}, textContent: '' };
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const titlu = (/<div class="vp-name">([^<]*)<\/div>/.exec(html) || [])[1];
  const rand = (et) => { const m = new RegExp('<tr><td>' + et + '</td><td[^>]*>([^<]*)</td></tr>').exec(html); return m ? m[1] : null; };
  return {
    html, titlu, denumire: rand('Denumire'), nrInm: /Nr\. înmatriculare/.test(html),
    win, creat,
    banda: () => { win.vpSetFollow(dev.imei); const b = creat[creat.length - 1]; return b ? String(b.innerHTML || '') : ''; },
    vehLaDeschidere: rv ? (rv[1] ? 'ascuns' : 'vizibil') : 'lipsă',
    vehDupaFisa: els['vp-vehrow-' + dev.imei].style.display === 'none' ? 'ascuns' : 'vizibil',
    vehText: els['vp-veh-' + dev.imei].textContent,
  };
}

(async () => {
  console.log('\n1. Titlul = numărul de înmatriculare (cazul din poza lui Alin)');
  const a = await balon({ imei: '861', name: 'VW Caddy', plate: 'B 268 ROY', vehicle_type: 'Dubă' }, { brand: 'VW', model: 'Caddy', driver_name: 'Tilvar Alin' });
  T('titlul scrie „B 268 ROY", nu „VW Caddy"', a.titlu === 'B 268 ROY', a.titlu);
  T('primul rând: „Denumire: VW Caddy"', a.denumire === 'VW Caddy' && a.html.indexOf('<tr><td>Denumire</td>') === a.html.indexOf('<tr>'), a.denumire);
  T('rândul „Nr. înmatriculare" nu mai există', !a.nrInm);
  T('„Vehicul" („VW Caddy" din fișă) nu repetă denumirea, după ce sosește fișa', a.vehDupaFisa === 'ascuns' && a.vehText === 'VW Caddy', JSON.stringify([a.vehLaDeschidere, a.vehDupaFisa, a.vehText]));

  console.log('\n2. Denumirea spune altceva decât marca: rămân amândouă');
  const b = await balon({ imei: '862', name: 'Caddy Ion', plate: 'B 77 ION' }, { brand: 'VW', model: 'Caddy' });
  T('titlul „B 77 ION", „Denumire: Caddy Ion", „Vehicul: VW Caddy" la vedere', b.titlu === 'B 77 ION' && b.denumire === 'Caddy Ion' && b.vehDupaFisa === 'vizibil' && b.vehText === 'VW Caddy', JSON.stringify([b.titlu, b.denumire, b.vehDupaFisa, b.vehText]));

  console.log('\n3. Fără număr, fără nume, numele = numărul');
  const c = await balon({ imei: '863', name: 'VW Caddy', plate: '' }, { brand: 'VW', model: 'Caddy' });
  T('fără număr: titlul e denumirea, fără rândul „Denumire", iar „Vehicul" nu o repetă', c.titlu === 'VW Caddy' && c.denumire === null && c.vehDupaFisa === 'ascuns', JSON.stringify([c.titlu, c.denumire, c.vehDupaFisa]));
  const d = await balon({ imei: '864', name: '', plate: '' }, { vehicle_type: 'Camion' });
  T('fără număr și fără nume: titlul e IMEI-ul; „Vehicul: Camion" la vedere', d.titlu === '864' && d.denumire === null && d.vehDupaFisa === 'vizibil' && d.vehText === 'Camion', JSON.stringify([d.titlu, d.denumire, d.vehDupaFisa, d.vehText]));
  const e = await balon({ imei: '865', name: 'b 268  roy', plate: 'B 268 ROY' }, { brand: 'Dacia', model: 'Logan' });
  T('numele scris ca numărul (alte litere, alte spații): fără rândul „Denumire"', e.titlu === 'B 268 ROY' && e.denumire === null && e.vehDupaFisa === 'vizibil', JSON.stringify([e.titlu, e.denumire]));
  const f = await balon({ imei: '866', name: 'Logan', plate: 'CJ 01 ABC', vehicle_type: 'Auto' }, null);
  T('fișa nu vine: „Vehicul" rămâne cu felul mașinii, la vedere', f.titlu === 'CJ 01 ABC' && f.denumire === 'Logan' && f.vehLaDeschidere === 'vizibil' && f.vehDupaFisa === 'vizibil', JSON.stringify([f.titlu, f.denumire, f.vehLaDeschidere]));

  console.log('\n4. Textul din fișă se scrie ca text');
  const g = await balon({ imei: '867', name: 'Duba <b>1</b>', plate: 'B <i>2</i>' }, null);
  T('fără HTML strecurat în titlu sau în „Denumire"', g.html.indexOf('<b>1</b>') < 0 && g.html.indexOf('<i>2</i>') < 0 && /B &lt;i&gt;2&lt;\/i&gt;/.test(g.html) && /Duba &lt;b&gt;1&lt;\/b&gt;/.test(g.html), g.titlu);

  console.log('\n5. Banda „Urmărești": numărul, apoi denumirea');
  const ba = (await balon({ imei: '871', name: 'VW CADDY', plate: 'B 268 ROY' }, null)).banda();
  T('„Urmărești: B 268 ROY · VW CADDY" (numărul îngroșat, denumirea stinsă după el)', /Urmărești: <b>B 268 ROY<\/b><small class="vp-fb-nume"> · VW CADDY<\/small>/.test(ba), ba);
  const bb = (await balon({ imei: '872', name: 'Logan', plate: '' }, null)).banda();
  T('fără număr: „Urmărești: Logan", fără a doua parte', /Urmărești: <b>Logan<\/b><\/span>/.test(bb) && bb.indexOf('vp-fb-nume') < 0, bb);
  const bc = (await balon({ imei: '873', name: 'B 268 ROY', plate: 'B 268 ROY' }, null)).banda();
  T('numele = numărul: o singură dată', /Urmărești: <b>B 268 ROY<\/b><\/span>/.test(bc) && bc.indexOf('vp-fb-nume') < 0, bc);
  const bd = (await balon({ imei: '874', name: 'Duba <b>1</b>', plate: 'B <i>2</i>' }, null)).banda();
  T('și aici textul din fișă se scrie ca text', bd.indexOf('<i>2</i>') < 0 && bd.indexOf('<b>1</b>') < 0, bd);
  const CSS = fs.readFileSync(path.join(__dirname, 'public/css/vehicle-popup.css'), 'utf8');
  T('pe tema deschisă numărul din bandă e pe verdele închis (#166534), denumirea pe culoarea stinsă a temei',
    /body:not\(\.dark\) \.vp-follow-badge b \{ color: #166534; \}/.test(CSS) && /\.vp-follow-badge \.vp-fb-nume \{[^}]*color: var\(--text-muted\);/.test(CSS));

  console.log('\n' + (rele ? '✗' : '✓') + ' verify_balon_harta: ' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
