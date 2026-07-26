// verify_geo.js — geocodarea și rutarea trec prin serverul NOSTRU, cu servere false locale.
//
// Problema reparată: browserul și APK-ul apelau `nominatim.openstreetmap.org` DIRECT — fără throttle
// (politica lor cere ≤1 cerere/s pe aplicație), fără User-Agent identificabil (browserul nici nu-l poate
// seta) și cu un cache separat pe fiecare filă/telefon. `GEOCODE_URL` de pe server nu acoperea nimic din
// traficul acela, deci mutarea pe un furnizor propriu n-ar fi schimbat nimic în practică.
//
// Aici verificăm, fără niciun serviciu extern:
//   · endpoint-ul propriu răspunde și respectă plafonul de puncte;
//   · un eșec temporar (429) NU se memorează permanent — capcana care lăsa celule fără adresă pentru
//     totdeauna, până la repornirea procesului;
//   · cache-ul serverului chiar taie apelurile repetate;
//   · OSRM e OPRIT fără OSRM_URL (nu mai lovim serverul public de demonstrație) și merge cu el setat;
//   · „Stare producție" spune adevărul despre furnizorul folosit.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3134, TCP = 5134, NOMPORT = 3135, OSRMPORT = 3136;
const DIR = path.join(os.tmpdir(), 'rax_geo_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, cookie = '', srv = null, nom = null, osrm = null;
let nomHits = 0, nomUA = null, nom429 = 0, osrmHits = 0;
let nomMode = 'ok';   // 'ok' | '429'

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function req(m, p, body) {
  const r = await fetch(B + p, {
    method: m,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

function startFakes() {
  return new Promise((res) => {
    // „Nominatim" fals: întoarce o adresă derivată din coordonate, ca să putem verifica maparea
    nom = http.createServer((rq, rs) => {
      nomHits++;
      nomUA = rq.headers['user-agent'] || null;
      if (nomMode === '429') { nom429++; rs.writeHead(429); return rs.end('Too Many Requests'); }
      const u = new URL(rq.url, 'http://x');
      const lat = u.searchParams.get('lat'), lon = u.searchParams.get('lon');
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end(JSON.stringify({ address: { road: 'Strada ' + Number(lat).toFixed(2), house_number: '7', city: 'Oraș ' + Number(lon).toFixed(2) } }));
    }).listen(NOMPORT, () => {
      // „OSRM" fals: un `matchings` valid, minim
      osrm = http.createServer((rq, rs) => {
        osrmHits++;
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ code: 'Ok', matchings: [{ geometry: { coordinates: [[21.0, 45.0], [21.001, 45.001], [21.002, 45.002]] } }] }));
      }).listen(OSRMPORT, () => res());
    });
  });
}

function boot(extra) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true',
      GEOCODE_URL: 'http://localhost:' + NOMPORT + '/reverse',
      GEOCODE_MIN_INTERVAL_MS: '0',      // serverul fals n-are limite; testăm logica, nu așteptarea
      GEOCODE_TIMEOUT_MS: '2000',
    }, extra || {});
    delete env.DATABASE_URL;
    if (!(extra && extra.OSRM_URL)) delete env.OSRM_URL;
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (b) => { out += b.toString(); if (/Server (HTTP )?(activ|pornit)|\[HTTP\]/i.test(out)) { p.stdout.off('data', onData); resolve(p); } };
    p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { out += b.toString(); });
    setTimeout(() => resolve(p), 20000);
  });
}
function kill(p) { return new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); }); }
async function login() { cookie = ''; return (await req('POST', '/api/login', { username: 'admin', password: 'admin123' })).status; }
async function health(key) {
  const h = await req('GET', '/api/admin/health');
  return ((h.body && h.body.checks) || []).find(c => c.key === key) || null;
}

(async () => {
  console.log('\n══ E5.1 · geocodare și rutare prin serverul propriu ══\n');
  try {
    await startFakes();
    srv = await boot();
    await sleep(2500);
    t('serverul pornește', (await login()) === 200);

    // ── 1. Endpoint-ul propriu răspunde și cheamă furnizorul configurat, nu Nominatim public ──
    nomHits = 0;
    const g1 = await req('POST', '/api/geocode/reverse', { points: [[45.75, 21.23]] });
    t('/api/geocode/reverse răspunde', g1.status === 200 && Array.isArray(g1.body.labels), JSON.stringify(g1.body));
    t('a întors adresa furnizorului configurat', g1.body.labels[0] && /Strada 45\.75/.test(g1.body.labels[0]), JSON.stringify(g1.body.labels));
    t('a chemat furnizorul din GEOCODE_URL', nomHits === 1, 'apeluri=' + nomHits);
    t('trimite un User-Agent care identifică aplicația', !!nomUA && /RA-Tracks/.test(nomUA) && /ratrack\.ro/.test(nomUA), String(nomUA));

    // ── 2. Cache: al doilea apel pe aceleași coordonate NU mai iese în rețea ──
    nomHits = 0;
    const g2 = await req('POST', '/api/geocode/reverse', { points: [[45.75, 21.23]] });
    t('al doilea apel vine din cache (zero cereri externe)', nomHits === 0 && g2.body.labels[0] === g1.body.labels[0], 'apeluri=' + nomHits);

    // Rotunjirea la ~110 m: coordonate foarte apropiate cad pe aceeași cheie
    nomHits = 0;
    await req('POST', '/api/geocode/reverse', { points: [[45.7504, 21.2302]] });
    t('coordonate la câțiva metri distanță refolosesc aceeași intrare', nomHits === 0, 'apeluri=' + nomHits);

    // ── 3. Plafonul de puncte per cerere ──
    const multe = []; for (let i = 0; i < 300; i++) multe.push([44 + i / 1000, 26 + i / 1000]);
    const g3 = await req('POST', '/api/geocode/reverse', { points: multe });
    t('plafonează cererea la 200 de puncte', g3.body.labels.length === 200, 'primite=' + g3.body.labels.length);

    // ── 4. CAPCANA: un 429 NU trebuie memorat permanent ──
    nomMode = '429'; nom429 = 0;
    const g4 = await req('POST', '/api/geocode/reverse', { points: [[46.11, 22.22]] });
    t('la 429 întoarce null, nu o adresă inventată', g4.body.labels[0] === null, JSON.stringify(g4.body.labels));
    t('serverul fals chiar a răspuns 429', nom429 > 0, 'nr=' + nom429);
    nomMode = 'ok'; nomHits = 0;
    const g5 = await req('POST', '/api/geocode/reverse', { points: [[46.11, 22.22]] });
    t('după ce furnizorul revine, REÎNCEARCĂ (eșecul nu s-a memorat)', nomHits === 1 && !!g5.body.labels[0], 'apeluri=' + nomHits + ' label=' + g5.body.labels[0]);

    // ── 5. „Stare producție" spune ce furnizor folosim ──
    const hg = await health('geocode');
    t('„Stare producție" raportează geocodarea', !!hg, JSON.stringify(hg));
    t('recunoaște că NU e Nominatim public', hg && /furnizor propriu/.test(hg.detail || ''), hg && hg.detail);
    t('numără și eșecurile (429-ul de mai sus)', hg && /refuzate pentru depășirea limitei/.test(hg.detail || ''), hg && hg.detail);

    // ── 6. OSRM: FĂRĂ OSRM_URL funcția e oprită, nu lovim serverul public ──
    osrmHits = 0;
    const m1 = await req('POST', '/api/match', { points: [[45, 21], [45.001, 21.001], [45.002, 21.002]] });
    t('fără OSRM_URL, map-matching-ul e oprit', m1.body && m1.body.matched === null && m1.body.reason === 'osrm_neconfigurat', JSON.stringify(m1.body));
    t('și NU a plecat nicio cerere externă', osrmHits === 0, 'apeluri=' + osrmHits);
    const ho = await health('osrm');
    t('„Stare producție" explică de ce e oprit', ho && /OSRM_URL nesetat/.test(ho.detail || ''), ho && ho.detail);

    // ── 7. Cu OSRM_URL setat, merge ──
    await kill(srv); srv = null;
    srv = await boot({ OSRM_URL: 'http://localhost:' + OSRMPORT });
    await sleep(2500);
    t('repornire cu OSRM_URL setat', (await login()) === 200);
    osrmHits = 0;
    const m2 = await req('POST', '/api/match', { points: [[45, 21], [45.001, 21.001], [45.002, 21.002]] });
    t('map-matching-ul întoarce geometrie', m2.body && Array.isArray(m2.body.matched) && m2.body.matched.length >= 2, JSON.stringify(m2.body).slice(0, 200));
    t('a folosit serverul propriu', osrmHits >= 1, 'apeluri=' + osrmHits);
    const ho2 = await health('osrm');
    t('„Stare producție" arată serverul propriu', ho2 && /server propriu/.test(ho2.detail || ''), ho2 && ho2.detail);

    // ── 8. Fără autentificare, endpoint-ul nu e deschis (altfel devine proxy gratuit de geocodare) ──
    cookie = '';
    const anon = await req('POST', '/api/geocode/reverse', { points: [[45, 21]] });
    t('endpoint-ul cere autentificare', anon.status === 401 || anon.status === 403, 'status ' + anon.status);

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack && e.stack.split('\n')[1]);
  } finally {
    await kill(srv);
    if (nom) try { nom.close(); } catch (e) {}
    if (osrm) try { osrm.close(); } catch (e) {}
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
