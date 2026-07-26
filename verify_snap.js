// verify_snap.js — alinierea traseului pe drumuri FĂRĂ OSRM, folosind datele OpenStreetMap pe care modulul
// de limite de viteză le descarcă oricum de la Overpass.
//
// Nu e map-matching adevărat: mută fiecare punct pe cel mai apropiat drum, dar nu reconstruiește traseul
// DINTRE puncte. Testul verifică exact ce promite, și mai ales unde REFUZĂ să pretindă că a aliniat.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3137, TCP = 5137, OVPORT = 3138;
const DIR = path.join(os.tmpdir(), 'rax_snap_' + Date.now());
const B = 'http://localhost:' + PORT;
let ok = 0, fail = 0, cookie = '', srv = null, ov = null, ovHits = 0;

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

// „Overpass" fals: un singur drum PERFECT DREPT pe paralela 45.7500, de la lng 21.20 la 21.30.
// Orice punct de test cade lângă el, deci proiecția trebuie să-l aducă exact pe 45.7500.
const DRUM_LAT = 45.75;
function startOverpass() {
  return new Promise((res) => {
    ov = http.createServer((rq, rs) => {
      ovHits++;
      const geom = [];
      for (let i = 0; i <= 100; i++) geom.push({ lat: DRUM_LAT, lon: 21.20 + i * 0.001 });
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end(JSON.stringify({ elements: [{ type: 'way', tags: { highway: 'primary', maxspeed: '50' }, geometry: geom }] }));
    }).listen(OVPORT, () => res());
  });
}

function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true',
      OVERPASS_URL: 'http://localhost:' + OVPORT + '/api/interpreter',
    });
    delete env.DATABASE_URL; delete env.OSRM_URL;   // fără OSRM: exact scenariul real
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (b) => { out += b.toString(); if (/Server (HTTP )?(activ|pornit)|\[HTTP\]/i.test(out)) { p.stdout.off('data', onData); resolve(p); } };
    p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { out += b.toString(); });
    setTimeout(() => resolve(p), 20000);
  });
}
function kill(p) { return new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4000); }); }
const metri = (a, b) => Math.abs(a - b) * 111320;   // diferență de latitudine → metri

(async () => {
  console.log('\n══ Aliniere pe drumuri fără OSRM (date OpenStreetMap) ══\n');
  try {
    await startOverpass();
    srv = await boot();
    await sleep(2500);
    cookie = '';
    t('serverul pornește (fără OSRM_URL)', (await req('POST', '/api/login', { username: 'admin', password: 'admin123' })).status === 200);

    // ── 1. Puncte la ~15 m de drum → trebuie mutate EXACT pe el ──
    ovHits = 0;
    const aproape = [[45.75013, 21.2100], [45.74987, 21.2150], [45.75011, 21.2200], [45.74990, 21.2250]];
    const r1 = await req('POST', '/api/match', { points: aproape });
    t('răspunde cu traseul aliniat', r1.body && Array.isArray(r1.body.matched) && r1.body.matched.length === 4, JSON.stringify(r1.body).slice(0, 200));
    t('spune ce metodă a folosit („osm")', r1.body && r1.body.source === 'osm', r1.body && r1.body.source);
    t('include atribuirea ODbL (obligatorie pentru date OSM)', r1.body && /OpenStreetMap/.test(r1.body.attribution || ''), r1.body && r1.body.attribution);
    if (r1.body && r1.body.matched) {
      const abateri = r1.body.matched.map(p => metri(p[0], DRUM_LAT));
      t('fiecare punct a ajuns pe carosabil (sub 1 m de axa drumului)', abateri.every(d => d < 1), 'abateri: ' + abateri.map(d => d.toFixed(2) + 'm').join(', '));
      const lngPastrat = r1.body.matched.every((p, i) => Math.abs(p[1] - aproape[i][1]) < 0.0002);
      t('poziția de-a lungul drumului se păstrează (nu se rearanjează punctele)', lngPastrat, JSON.stringify(r1.body.matched));
    }
    t('a interogat Overpass o singură dată', ovHits === 1, 'interogări=' + ovHits);

    // ── 2. Cache: aceleași puncte → zero interogări noi ──
    ovHits = 0;
    const r2 = await req('POST', '/api/match', { points: aproape });
    t('al doilea apel vine din cache (zero interogări externe)', ovHits === 0 && r2.body && r2.body.matched, 'interogări=' + ovHits);

    // ── 3. Puncte DEPARTE de orice drum → NU pretinde că a aliniat ──
    // (deplasare în afara drumurilor, zonă fără acoperire OSM: mai bine „nu pot" decât puncte mutate aiurea)
    const departe = [[45.9000, 21.2100], [45.9001, 21.2150], [45.9002, 21.2200]];
    const r3 = await req('POST', '/api/match', { points: departe });
    t('puncte fără drum aproape → refuză, nu inventează', r3.body && r3.body.matched === null, JSON.stringify(r3.body).slice(0, 150));
    t('și spune de ce', r3.body && r3.body.reason === 'fara_drumuri', r3.body && r3.body.reason);

    // ── 4. Traseu prea întins → limita Overpass, raportată ca atare ──
    const urias = [[44.0, 21.0], [48.0, 27.0]];
    const r4 = await req('POST', '/api/match', { points: urias });
    t('traseu prea întins → mesaj acționabil, nu eroare generică', r4.body && r4.body.reason === 'zona_prea_mare', JSON.stringify(r4.body).slice(0, 150));

    // ── 5. Apelul AUTOMAT (la deschiderea unui traseu) NU trebuie să lovească Overpass ──
    // Politica Overpass interzice interogări la fiecare vizualizare; metoda gratuită e doar la cerere.
    ovHits = 0;
    const r5 = await req('POST', '/api/match', { points: [[45.75014, 21.2400], [45.74986, 21.2450]], auto: true });
    t('apelul automat NU interoghează Overpass', ovHits === 0, 'interogări=' + ovHits);
    t('și explică de ce n-a aliniat', r5.body && r5.body.matched === null && r5.body.reason === 'osrm_neconfigurat', JSON.stringify(r5.body));

    // ── 6. „Limite reale" folosește ACELEAȘI date descărcate → fără interogare nouă ──
    ovHits = 0;
    const r6 = await req('POST', '/api/road-limits', { points: aproape });
    t('„Limite reale" pe același traseu refolosește cache-ul', ovHits === 0, 'interogări=' + ovHits);
    t('și întoarce limita drumului (50 km/h)', r6.body && (r6.body.limits || []).every(l => l === 50), JSON.stringify(r6.body && r6.body.limits));

    // ── 7. Serviciul OSM picat ≠ „nu există drumuri pe acolo" ──
    // Instanțele publice Overpass chiar cad des (504 / timeout). Dacă spunem greșit, operatorul caută vina
    // în datele lui, nu în serviciu.
    const ovOk = ov; ov.close(); ov = null;
    const r7 = await req('POST', '/api/match', { points: [[45.75014, 21.2600], [45.74986, 21.2650], [45.75005, 21.2700]] });
    t('serviciu OSM picat → motiv distinct, nu „fără drumuri"', r7.body && r7.body.reason === 'osm_indisponibil', JSON.stringify(r7.body));
    void ovOk;

    // ── 8. Autentificare obligatorie ──
    cookie = '';
    const anon = await req('POST', '/api/match', { points: aproape });
    t('endpoint-ul cere autentificare', anon.status === 401 || anon.status === 403, 'status ' + anon.status);

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message, e.stack && e.stack.split('\n')[1]);
  } finally {
    await kill(srv);
    if (ov) try { ov.close(); } catch (e) {}
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
