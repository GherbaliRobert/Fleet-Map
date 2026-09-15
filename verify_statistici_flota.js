// verify_statistici_flota.js — ecranul „Statistici flotă" din verticala partenerului.
//
//   node verify_statistici_flota.js
//
// De ce există: în verticala partenerului au stat, pe rând, DOUĂ ecrane care nu-i erau ale lui.
// Întâi tabloul PLATFORMEI (MRR, cheia Anthropic, backup-uri) — un duplicat al celui din
// „Business → Dashboard platformă". Apoi un „dashboard de flotă" construit de noi, care s-a dovedit
// tot un duplicat: repeta cifrele din „Statistici" (aceeași sursă, aceeași zi). Acum e UN ecran, cu
// numele lui, îmbogățit cu ce lipsea.
//
// Ce prinde: oricare din cele două duplicate întors în meniu, media de consum lăsată să scoată
// aberații („153 L/100km" la 35 km și 54 de litri), vehiculele fără semnal rămase iar doar un număr,
// orele de motor ascunse înapoi în text mărunt, și constatările agenților desprinse de AGP_META
// sau lăsate text mort, fără legătură către „Agenți AI".
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
function taie(s, a, b) {
  const i = s.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a.slice(0, 60));
  const j = s.indexOf(b, i); if (j < 0) throw new Error('nu găsesc capătul: ' + b.slice(0, 60));
  return s.slice(i, j);
}

console.log('\n1. Un singur ecran de flotă, cu numele lui');
T('în meniu scrie „Statistici flotă"', /<span>Statistici flotă<\/span>/.test(html));
T('și pe ecran, la fel', /<\/i> Statistici flotă<\/span>/.test(html));
T('nu mai există intrarea „Dashboard" în verticala partenerului', !/id="nav-dashboard"/.test(html));
T('nici containerul dashboard-ului de flotă pe care l-am scos', !/fleet-dash-(modal|body)|raxFleetDash/.test(html));
T('nici containerul tabloului de platformă din verticala partenerului', !/platform-dash-(modal|body)/.test(html));
T('tabloul platformei a rămas la fondator, în Business',
  /data-vert="fondator"[\s\S]{0,2000}goSistem\('dashboard'\)/.test(html));
T('și cere tot super-admin', /raxLoadDashboard\(targetId\) \{\s*\n\s*if \(!\(currentUser && currentUser\.role === 'superadmin'\)\) return;/.test(html));
T('ecranul de flotă își ia datele din calea filtrată pe drepturi',
  /app\.get\('\/api\/dashboard', requireAuth, withScope/.test(server));

console.log('\n2. Media de consum nu mai scoate aberații');
const plasa = taie(html, '// ─── începe „Plasa de la media de consum"', '// ─── sfârșit „Plasa de la media de consum" ──');
const fn = new Function('d', plasa + '\n; return { p: _per100, t: _consPer100 };');
T('la 2 km și 5 litri nu inventează o medie', fn({ totalKm: 2, totalFuel: 5 }).p === null);
T('și spune de ce', /prea puțini km/.test(fn({ totalKm: 2, totalFuel: 5 }).t), fn({ totalKm: 2, totalFuel: 5 }).t);
T('la 100 km și 30 de litri dă 30', Math.round(fn({ totalKm: 100, totalFuel: 30 }).p) === 30, String(fn({ totalKm: 100, totalFuel: 30 }).p));
T('„153 L/100km" nu mai ajunge pe ecran', fn({ totalKm: 35.2, totalFuel: 54 }).p === null, String(fn({ totalKm: 35.2, totalFuel: 54 }).p));
T('iar acolo scrie că datele-s incomplete, nu că ar fi prea puțini km',
  /incomplete/.test(fn({ totalKm: 35.2, totalFuel: 54 }).t), fn({ totalKm: 35.2, totalFuel: 54 }).t);
T('fără litri, o liniuță', fn({ totalKm: 120, totalFuel: 0 }).t === '—');

console.log('\n3. Cine tace, scris pe nume');
const tace = taie(html, '// ─── începe „Cine tace"', '// ─── sfârșit „Cine tace" ──');
const nume = new Function('d', '_dashEsc', tace + '\n; return _subOffline;');
const E = (v) => String(v == null ? '' : v);
T('când toate transmit, o spune',
  nume({ offlineCount: 0, devices: [{ name: 'A', isOnline: true }] }, E) === 'toate transmit');
T('scrie numele celor care nu transmit',
  /Camion A, Camion B/.test(nume({ offlineCount: 2, devices: [{ name: 'Camion A', isOnline: false }, { name: 'Camion B', isOnline: false }] }, E)),
  nume({ offlineCount: 2, devices: [{ name: 'Camion A', isOnline: false }, { name: 'Camion B', isOnline: false }] }, E));
T('la mai mult de trei, le numără pe restul',
  /și încă 2/.test(nume({ offlineCount: 5, devices: [1, 2, 3, 4, 5].map(function (i) { return { name: 'V' + i, isOnline: false }; }) }, E)));
T('cele care n-au transmis niciodată se numără separat',
  /1 n-au transmis niciodată/.test(nume({ offlineCount: 2, devices: [{ name: 'Camion A', isOnline: false }] }, E)),
  nume({ offlineCount: 2, devices: [{ name: 'Camion A', isOnline: false }] }, E));
T('„Fără semnal" e cartonaș mare, nu o notiță', /heroCard\('fa-tower-broadcast'/.test(html));
T('și se face roșu când există', /d\.offlineCount > 0 \? 'var\(--red\)'/.test(html));

console.log('\n4. Timpul de mers a urcat din text mărunt în cartonaș');
T('e cartonaș', /heroCard\('fa-clock'[\s\S]{0,80}'Timp de mers azi'/.test(html));
T('și nu se mai repetă sub bara de stare', !/Ore motor azi/.test(html));

console.log('\n5. Constatările agenților, strânse pe categorii');
const grup = taie(html, '// ─── începe „Constatările, strânse pe categorii"', '// ─── sfârșit „Constatările, strânse pe categorii" ──');
T('numele agenților vin din AGP_META, nu dintr-o listă paralelă',
  /window\.AGP_META/.test(grup) && !/watch: \['RA Watch'/.test(html));
T('se grupează pe agent, nu un rând per constatare', /pe\[k\] \|\| \(pe\[k\] = \{ n: 0/.test(grup));
T('numără și câte vehicule sunt atinse', /vehicule\.length/.test(grup));
T('cele critice urcă primele', /rank\[pe\[a\]\.sev\]/.test(grup));
T('fiecare rând duce în „Agenți AI"', /onclick="showView\(\\'agenti\\'\)"/.test(grup));
T('rândurile folosesc stilul comun, nu unul inventat pe loc',
  /class="fd-rand /.test(grup) && css.indexOf('.fd-rand') > 0);
T('lista lor e o coloană, nu o grilă', /<div id="dash-agents" class="fd-lista">/.test(html));

console.log('\n6. Cele șase cifre mari');
['Total vehicule', 'Fără semnal', 'Km azi', 'Timp de mers azi', 'Consum azi', 'Alerte'].forEach(function (c) {
  T('are cartonașul „' + c + '"', html.indexOf("'" + c + "'") > 0);
});
T('rândul de cartonașe se așază singur (nu forțat pe 4 coloane)',
  /id="dash-hero"[^>]*repeat\(auto-fit,minmax\(190px/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
