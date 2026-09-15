// verify_flota_dash.js — „Flota mea, pe scurt": dashboard-ul din verticala PARTENERULUI.
//
//   node verify_flota_dash.js
//
// De ce există: în verticala partenerului stătea, sub numele „Dashboard", tabloul PLATFORMEI —
// MRR, ARR, cheia Anthropic, backup-urile, starea de producție. Adică ecranul fondatorului, pus în
// verticala greșită, și pe deasupra un duplicat al celui din „Business → Dashboard platformă"
// (aceeași funcție, alt container). Acum acolo e starea flotei, care e treaba partenerului.
//
// Ce prinde: tabloul platformei întors în verticala partenerului, dashboard-ul flotei rămas fără
// una din cele trei secțiuni, cifrele luate din altă parte decât căile existente (care sunt deja
// filtrate pe drepturile omului), și media de consum lăsată să scoată aberații la început de zi.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
function taie(s, a, b) {
  const i = s.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a.slice(0, 50));
  const j = s.indexOf(b, i); if (j < 0) throw new Error('nu găsesc capătul: ' + b.slice(0, 50));
  return s.slice(i, j);
}

console.log('\n1. Fiecare tablou la verticala lui');
const navDash = (html.match(/<button data-vert="partener"[^>]*id="nav-dashboard"[^>]*>/) || [])[0] || '';
T('„Dashboard" e în verticala partenerului', /data-vert="partener"/.test(navDash), navDash.slice(0, 90));
T('și deschide dashboard-ul FLOTEI, nu tabloul platformei',
  /dashboard: 'fleet-dash-modal'/.test(html) && /dashboard: 'raxFleetDash'/.test(html));
T('tabloul platformei a rămas doar la fondator, în Business',
  /data-vert="fondator"[\s\S]{0,2000}goSistem\('dashboard'\)/.test(html));
T('nu mai există un al doilea container pentru tabloul platformei', !/platform-dash-(modal|body)/.test(html));
T('tabloul platformei cere tot super-admin', /raxLoadDashboard\(targetId\) \{\s*\n\s*if \(!\(currentUser && currentUser\.role === 'superadmin'\)\) return;/.test(html));
T('salvarea cheii AI reîmprospătează ecranul unde chiar a fost desenat',
  /_raxDashUnde/.test(html) && /raxLoadDashboard\(_raxDashUnde\)/.test(html));

console.log('\n2. Dashboard-ul flotei nu-și inventează datele');
const bloc = taie(html, '// ─── începe „Flota mea, pe scurt"', '// ─── sfârșit „Flota mea, pe scurt" ──');
T('starea flotei vine din /api/dashboard (cale existentă, filtrată pe drepturi)', /\/api\/dashboard/.test(bloc));
T('„de rezolvat" vine din constatările agenților', /\/api\/agents\/findings/.test(bloc));
T('ambele căi sunt filtrate pe compania și vehiculele omului',
  /app\.get\('\/api\/dashboard', requireAuth, withScope/.test(server) &&
  /app\.get\('\/api\/agents\/findings', requireAuth, withScope/.test(server));
T('numele agenților vin din AGP_META, sursa unică', /window\.AGP_META/.test(bloc));
T('nicio cale nouă inventată pentru el', !/fetch\('\/api\/(fleet|flota)/.test(bloc));

console.log('\n3. Ce scrie pe el');
['Acum', 'Azi', 'De rezolvat'].forEach(function (g) {
  T('are secțiunea „' + g + '"', new RegExp('aiu-grup">' + g + '<').test(bloc));
});
['În mișcare', 'Oprite', 'Fără semnal', 'Kilometri', 'Timp de mers', 'Combustibil'].forEach(function (c) {
  T('are cartonașul „' + c + '"', bloc.indexOf("cap: '" + c + "'") > 0);
});
T('fără semnal se colorează roșu când există', /ton: offline \? 'bad' : 'ok'/.test(bloc));
T('spune pe nume cine nu transmite', /fara\.slice\(0, 3\)/.test(bloc));
T('și numără separat cele care n-au transmis niciodată', /n-au transmis niciodată/.test(bloc));
T('trimite la Statistici pentru grafice', /Analize statistice → Statistici/.test(bloc));
T('cartonașul cu mișcarea duce la hartă', /showView\('localizare'\)/.test(bloc));
// Ne uităm la ce AJUNGE pe ecran, nu la comentariile din cod (care explică tocmai de ce nu mai e).
const afisat = bloc.split('\n').filter(function (r) { return !/^\s*\/\//.test(r); }).join('\n');
// „ARR" singur ar prinde și cuvântul `Array` din cod — căutăm termenii ca atare.
const deFondator = /\bMRR\b|\bARR\b|Anthropic|backup|abonamente active|cost ai/i;
T('nu are nimic de fondator pe el', !deFondator.test(afisat), (afisat.match(deFondator) || [''])[0]);

console.log('\n4. Media de consum nu scoate aberații');
const fn = new Function(taie(bloc, 'var per100 =', 'box.innerHTML =').replace(/^/, 'return function (km, lit) { ') + ' return per100; };')();
T('la 2 km și 5 litri nu inventează o medie', fn(2, 5) === null, String(fn(2, 5)));
T('la 100 km și 30 de litri dă 30', Math.round(fn(100, 30)) === 30, String(fn(100, 30)));
T('o valoare imposibilă (peste 100 L/100km) se ascunde', fn(50, 80) === null, String(fn(50, 80)));
T('fără litri, nimic', fn(120, 0) === null);
T('și se explică de ce lipsește', /prea puțini km azi pentru o medie/.test(bloc));

console.log('\n5. Stilul');
['.fd-lista', '.fd-rand', '.fd-liniste', '.aiu-kpi-link'].forEach(function (x) {
  T('există stilul ' + x, css.indexOf(x) > 0);
});
T('rândurile „de rezolvat" duc undeva, nu sunt text mort', /onclick="showView\(\\'agenti\\'\)"/.test(bloc));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
