// verify_versiune_noua.js — banda „A apărut o versiune nouă" (14.10, Robert: „vreau doar banda").
//
//   node verify_versiune_noua.js            (partea 4 are nevoie de server pornit: BASE=http://localhost:3199)
//
// La o publicare, cine are aplicația deschisă rămâne pe pagina veche până o reîncarcă. Pagina își știe acum amprenta
// (scrisă de server la încărcare) și o compară cu cea de pe server; când diferă, arată o bandă cu „Reîncarcă".
//
// Ce păzește proba:
//   1. regula ecranului, decupată din pagină și rulată: banda doar când amprentele diferă, NU reîncarcă singură, „×" o
//      ascunde o oră, verificările nu se înghesuie (cel mult una la 15 secunde, afară de ceas);
//   2. pagina e legată: pornește după autentificare, verifică la reconectarea hărții live (o publicare o închide);
//   3. amprenta de pe server, decupată și rulată pe un dosar de probă: se mișcă doar când se schimbă pagina, stilurile
//      sau scripturile — NU la o schimbare doar de server, NU la o imagine; pagina servită o poartă înăuntru;
//   4. pe server pornit: /app și /api/health dau aceeași amprentă.
//
// Codul nu se copiază aici: se decupează din sursă și se execută.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Rândurile se citesc fără CR (depozitul poate avea CRLF pe Windows).
const citeste = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8').replace(/\r\n/g, '\n');
const html = citeste('public', 'index.html');
const srv = citeste('server.js');
const css = citeste('public', 'css', 'app.css');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const intre = (s, a, b) => { const i = s.indexOf(a); if (i < 0) throw new Error('nu găsesc: ' + a); const j = s.indexOf(b, i); if (j < 0) throw new Error('nu găsesc: ' + b); return s.slice(i, j + b.length); };
const tic = () => new Promise((r) => setImmediate(r));

// ─── 1. Regula ecranului, rulată ────────────────────────────────────────────────────────────────────
console.log('1. Banda: doar când pagina e alta decât cea de pe server; nu reîncarcă singură');
const BLOC = intre(html, '// ═══ banda „A apărut o versiune nouă" (14.10, Robert) — început ═══', '// ═══ banda „A apărut o versiune nouă" — sfârșit ═══');
function mediu(peMeta, peServer) {
  const st = { ceas: 1800000000000, server: peServer, cereri: 0, reincarcat: 0, ids: {} };
  const document = {
    visibilityState: 'visible',
    querySelector: (s) => (s === 'meta[name="ra-pagina"]' ? { content: peMeta } : null),
    getElementById: (id) => st.ids[id] || null,
    createElement: () => ({ style: {}, setAttribute() {} }),
    body: { appendChild: (e) => { st.ids[e.id] = e; } },
    addEventListener: () => {}
  };
  const window = {};
  const location = { reload: () => { st.reincarcat++; } };
  const fetch = (url) => { st.cereri++; st.url = url; return Promise.resolve({ json: () => Promise.resolve({ pagina: st.server }) }); };
  const Data = { now: () => st.ceas };
  const R = new Function('document', 'window', 'location', 'fetch', 'Date', 'setInterval',
    BLOC + '\nreturn { verDeArata, verVerifica, verArata, verPorneste, _ver, VER_ASCUNSA_MS, VER_PAUZA_MS, VER_PAS_MS };')(
    document, window, location, fetch, Data, () => 0);
  return { R, st, window, banda: () => st.ids['ver-noua'] || null };
}
{
  const { R } = mediu('a', 'a');
  const MIN = 60000, acum = 1800000000000;
  T('aceeași amprentă → fără bandă', R.verDeArata('a', 'a', 0, acum) === false);
  T('altă amprentă → banda', R.verDeArata('a', 'b', 0, acum) === true);
  T('fără amprentă pe una din părți → fără bandă (nu ghicim)', R.verDeArata('', 'b', 0, acum) === false && R.verDeArata('a', '', 0, acum) === false && R.verDeArata('a', null, 0, acum) === false);
  T('ascunsă acum 10 minute → nu revine încă', R.verDeArata('a', 'b', acum - 10 * MIN, acum) === false);
  T('ascunsă acum 61 de minute → revine', R.verDeArata('a', 'b', acum - 61 * MIN, acum) === true);
  T('„×" ține o oră, verificarea merge la 5 minute, pauza dintre verificări e 15 secunde',
    R.VER_ASCUNSA_MS === 60 * MIN && R.VER_PAS_MS === 5 * MIN && R.VER_PAUZA_MS === 15000);
}
(async () => {
  {
    const m = mediu('a', 'b');
    m.R.verVerifica(true); await tic(); await tic();
    const b = m.banda();
    T('pagina veche, server nou → banda apare', !!b && b.style.display === 'flex', b && b.style.display);
    T('…cere amprenta de la /api/health', m.st.url === '/api/health');
    T('…și NU reîncarcă singură', m.st.reincarcat === 0);
    T('textul și butoanele cheamă funcții de pe window (nu scriu în variabile)', /A apărut o versiune nouă a aplicației\./.test(b.innerHTML) &&
      /onclick="verReincarca\(\)"/.test(b.innerHTML) && /onclick="verAscunde\(\)"/.test(b.innerHTML) && />Reîncarcă</.test(b.innerHTML), b.innerHTML);
    m.window.verAscunde();
    T('„×" o ascunde', b.style.display === 'none');
    m.st.ceas += 20000; m.R.verVerifica(true); await tic(); await tic();
    T('…și nu revine la următoarea verificare', b.style.display === 'none');
    m.st.ceas += 61 * 60000; m.R.verVerifica(true); await tic(); await tic();
    T('…revine după o oră, cât pagina e tot veche', b.style.display === 'flex');
    m.window.verReincarca();
    T('„Reîncarcă" reîncarcă pagina', m.st.reincarcat === 1);
  }
  {
    const m = mediu('a', 'a');
    m.R.verVerifica(true); await tic(); await tic();
    T('aceeași versiune → nicio bandă', m.banda() === null);
  }
  {
    const m = mediu('', 'x');
    m.R.verVerifica(true); await tic(); await tic();
    T('pagina fără amprentă (copia offline) → ia amprenta serverului, fără bandă', m.banda() === null && m.R._ver.pagina === 'x');
    m.st.server = 'y'; m.st.ceas += 6 * 60000; m.R.verVerifica(true); await tic(); await tic();
    T('…iar la următoarea publicare banda apare', !!m.banda() && m.banda().style.display === 'flex');
  }
  {
    const m = mediu('a', 'a');
    m.R.verVerifica(false); m.R.verVerifica(false); m.R.verVerifica(false);
    T('trei verificări în aceeași clipă (filă + reconectare) → o singură cerere', m.st.cereri === 1, m.st.cereri);
    m.st.ceas += 16000; m.R.verVerifica(false);
    T('…după 15 secunde, încă una', m.st.cereri === 2, m.st.cereri);
    m.R.verVerifica(true);
    T('…ceasul de 5 minute nu așteaptă pauza', m.st.cereri === 3, m.st.cereri);
    m.R.verPorneste(); m.R.verPorneste();
    T('pornită de două ori → tot o dată (o singură verificare la pornire)', m.st.cereri === 4, m.st.cereri);
  }

  // ─── 2. Legăturile din pagină ─────────────────────────────────────────────────────────────────────
  console.log('2. Pagina: pornește după autentificare, verifică la reconectarea hărții live');
  T('locul amprentei e în <head>, gol (îl umple serverul)', /<head>[\s\S]*<meta name="ra-pagina" content="">[\s\S]*<\/head>/.test(html));
  T('pornește lângă înregistrarea service worker-ului (după autentificare)', /navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]{0,600}verPorneste\(\);/.test(html));
  const ws = intre(html, 'function connectWs() {', 'ws.onerror = () => ws.close();');
  T('legătura căzută se ține minte', /ws\.onclose = \(\) => \{[\s\S]*?_wsCazuta = true;/.test(ws));
  T('la revenirea ei, pagina întreabă de versiune', /ws\.onopen = \(\) => \{[\s\S]*?if \(_wsCazuta\) \{ _wsCazuta = false; if \(typeof verVerifica === 'function'\) verVerifica\(false\); \}/.test(ws));
  T('o singură bandă în pagină (o singură funcție o desenează)', (html.match(/el\.id = 'ver-noua'/g) || []).length === 1);
  T('nicio reîncărcare automată în bloc (doar butonul)', (BLOC.match(/location\.reload\(\)/g) || []).length === 1 && /window\.verReincarca = function \(\) \{ location\.reload\(\); \};/.test(BLOC));
  T('stilul ei e în foaia de stil, cu pereche pe tema întunecată', /\.ver-noua \{[^}]*position: fixed/.test(css) && /body\.dark \.ver-noua > i \{/.test(css) && /\.ver-noua-btn \{[^}]*background: #3FE07D;[^}]*color: #06210F;/.test(css));

  // ─── 3. Amprenta de pe server, rulată pe un dosar de probă ────────────────────────────────────────
  console.log('3. Amprenta: se mișcă doar când se schimbă ce încarcă pagina');
  const SRV = intre(srv, "const _PAGINA_META = '<meta name=\"ra-pagina\" content=\"\">';", "return _pagina.html.replace(_PAGINA_META, '<meta name=\"ra-pagina\" content=\"' + amprentaPaginii() + '\">');\n}");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-versiune-'));
  const scrie = (rel, s) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  scrie('public/index.html', '<html><head><meta name="ra-pagina" content=""></head><body>pagina</body></html>');
  scrie('public/css/app.css', 'body{color:red}');
  scrie('public/js/map-tools.js', 'var a=1;');
  scrie('public/vendor/leaflet-heat.js', 'var h=1;');
  scrie('public/logo.png', 'imagine');
  scrie('public/models/camion.glb', 'model');
  scrie('server.js', '// serverul');
  const S = new Function('path', 'fs', 'crypto', '__dirname', '_LICENSE_JS', '_MAINT_JS', '_CANFLAGS_JS', '_CANICONS_JS', '_IOFMT_JS',
    SRV + '\nreturn { amprentaPaginii, _paginaCuAmprenta };')(path, fs, crypto, dir, 'L', 'M', 'C', 'I', 'F');
  // Pe disc, două scrieri în aceeași milisecundă pot păstra ora; mărimea diferită o face oricum vizibilă.
  const a0 = S.amprentaPaginii();
  T('amprenta are 12 caractere hexazecimale', /^[0-9a-f]{12}$/.test(a0), a0);
  scrie('server.js', '// serverul, schimbat — o regulă nouă de facturare');
  T('o schimbare DOAR pe server nu o mișcă (fără bandă degeaba)', S.amprentaPaginii() === a0);
  scrie('public/logo.png', 'imagine schimbata');
  scrie('public/models/camion.glb', 'model schimbat');
  T('nici o imagine sau un model 3D', S.amprentaPaginii() === a0);
  scrie('public/css/app.css', 'body{color:green}  ');
  const a1 = S.amprentaPaginii();
  T('o schimbare în stiluri o mișcă', a1 !== a0);
  scrie('public/js/map-tools.js', 'var a=2; // nou');
  const a2 = S.amprentaPaginii();
  T('o schimbare într-un script o mișcă', a2 !== a1);
  scrie('public/vendor/leaflet-heat.js', 'var h=2; // nou');
  const a3 = S.amprentaPaginii();
  T('…și în cele din vendor', a3 !== a2);
  scrie('public/index.html', '<html><head><meta name="ra-pagina" content=""></head><body>pagina noua</body></html>');
  const a4 = S.amprentaPaginii();
  T('o schimbare în pagină o mișcă', a4 !== a3);
  const pag = S._paginaCuAmprenta();
  T('pagina servită poartă amprenta de acum înăuntru', pag.indexOf('<meta name="ra-pagina" content="' + a4 + '">') >= 0 && pag.indexOf('pagina noua') >= 0, pag.slice(0, 120));
  const S2 = new Function('path', 'fs', 'crypto', '__dirname', '_LICENSE_JS', '_MAINT_JS', '_CANFLAGS_JS', '_CANICONS_JS', '_IOFMT_JS',
    SRV + '\nreturn { amprentaPaginii };')(path, fs, crypto, dir, 'L', 'M', 'C2', 'I', 'F');
  T('scripturile făcute de server din module (steagurile CAN, categoriile…) intră și ele', S2.amprentaPaginii() !== a4);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  T('/app trimite pagina cu amprenta, /api/health o dă la cerere', /app\.get\('\/app', \(req, res\) => \{ res\.set\('Cache-Control', NO_CACHE\); res\.type\('html'\); res\.send\(_paginaCuAmprenta\(\)\); \}\);/.test(srv) &&
    /pagina: \(function \(\) \{ try \{ return amprentaPaginii\(\); \} catch \(e\) \{ return null; \} \}\)\(\)/.test(srv));

  // ─── 4. Pe server pornit ──────────────────────────────────────────────────────────────────────────
  const BASE = process.env.BASE;
  if (!BASE) console.log('4. (sar: BASE nesetat — rulează din npm test sau cu BASE=http://localhost:PORT)');
  else {
    console.log('4. Pe server pornit: aceeași amprentă în pagină și la /api/health');
    const rp = await fetch(BASE + '/app');
    const txt = await rp.text();
    const m = txt.match(/<meta name="ra-pagina" content="([0-9a-f]{12})">/);
    const h = await (await fetch(BASE + '/api/health')).json();
    T('/app poartă amprenta', rp.status === 200 && !!m, rp.status + ' ' + (txt.match(/<meta name="ra-pagina"[^>]*>/) || [''])[0]);
    T('…fără cache (altfel ar rămâne amprenta veche)', /no-store|no-cache/.test(rp.headers.get('cache-control') || ''), rp.headers.get('cache-control'));
    T('/api/health dă aceeași amprentă', !!m && h.pagina === m[1], JSON.stringify({ pagina: h.pagina, meta: m && m[1] }));
  }

  console.log('\n──────────────────────────────\n' + ok + ' verificări trecute, ' + rele + ' picate');
  // `exitCode`, nu `process.exit()`: pe Windows, o ieșire forțată cu conexiuni fetch încă deschise crapă în libuv
  // (cod 127) și o probă trecută ar părea picată (ca la verify_site_public.js). Procesul se închide singur.
  process.exitCode = rele ? 1 : 0;
})().catch((e) => { console.error('✗ proba a crăpat: ' + (e && e.stack || e)); process.exitCode = 1; });
