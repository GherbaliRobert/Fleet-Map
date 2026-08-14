// verify_docscan.js — citirea actelor, cap-coadă pe server pornit.
//
// Ce apără:
//   1. Un PDF cu text (RCA) se citește GRATUIT — fără cheie de AI, deci și fără ea configurată.
//   2. /api/documents/scan NU scrie nimic în bază — doar propune. Omul confirmă.
//   3. Salvarea actului cu fișier atașat merge pe calea existentă, iar fișierul NU apare la listare
//      (l-ar căra checkExpiries pe tot), ci doar la cererea lui explicită.
//   4. Formatele neacceptate și fișierele umflate primesc mesaje de om, nu 500.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');
const PDFDocument = require('pdfkit');

const PORT = 3181, TCP = 5181;
const DIR = path.join(os.tmpdir(), 'rax_scan_' + Date.now());
const B = 'http://localhost:' + PORT;
const IMEI = '860000000088801';
let ok = 0, fail = 0, srv = null;

const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jar = () => ({ cookie: '' });
async function req(j, m, p, body) {
  const r = await fetch(B + p, {
    method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, j.cookie ? { Cookie: j.cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) j.cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  if (!/json/.test(ct)) return { status: r.status, body: null, raw: Buffer.from(await r.arrayBuffer()), ct };
  let o = null; try { o = await r.json(); } catch (e) {}
  return { status: r.status, body: o, ct };
}
function boot() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
      ADMIN_PASSWORD: 'admin123', NODE_ENV: 'test', DEMO_DISABLED: 'true', STRICT_DEVICES: 'false',
    });
    delete env.DATABASE_URL;
    delete env.ANTHROPIC_API_KEY;   // esențial: drumul PDF trebuie să meargă FĂRĂ cheie de AI
    const p = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const on = (b) => { o += b.toString(); if (/\[HTTP\]/.test(o)) { p.stdout.off('data', on); setTimeout(() => resolve(p), 1200); } };
    p.stdout.on('data', on); p.stderr.on('data', () => {});
    setTimeout(() => resolve(p), 40000);
  });
}
const kill = (p) => new Promise((r) => { if (!p) return r(); p.once('exit', () => r()); p.kill(); setTimeout(r, 4500); });

function pdfRca() {
  return new Promise((resolve) => {
    const chunks = []; const doc = new PDFDocument();
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('POLITA DE ASIGURARE RCA');
    doc.text('RASPUNDERE CIVILA AUTO');
    doc.text('OMNIASIG VIENNA INSURANCE GROUP');
    doc.text('Seria RO/22/H22 Nr. 987654321');
    doc.text('Numar de inmatriculare: TM 99 SCN');
    doc.text('Valabilitate: de la 01.09.2026 pana la 28.02.2027');
    doc.end();
  });
}

(async () => {
  console.log('\n══ Citirea actelor: scan → propunere → confirmare ══\n');
  try {
    srv = await boot(); await sleep(3500);
    const S = jar();
    await req(S, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
    await req(S, 'POST', '/api/devices', { imei: IMEI, name: 'Test Scan', plate: 'TM 99 SCN' });

    // ── 1. PDF cu text → gratuit, fără cheie AI ──
    const pdf = await pdfRca();
    const sc1 = await req(S, 'POST', '/api/documents/scan', { b64: pdf.toString('base64'), mime: 'application/pdf' });
    t('scanarea răspunde 200', sc1.status === 200, 'status ' + sc1.status + ' ' + JSON.stringify(sc1.body).slice(0, 120));
    if (sc1.status === 200) {
      t('drumul GRATUIT (pdf-text), fără cheie AI', sc1.body.sursa === 'pdf-text', sc1.body.sursa);
      t('tipul detectat singur: RCA', sc1.body.campuri && sc1.body.campuri.doc_type === 'RCA', JSON.stringify(sc1.body.campuri && sc1.body.campuri.doc_type));
      t('EXPIRAREA extrasă — câmpul care pornește alertele', sc1.body.campuri.expiry_date === '2027-02-28', sc1.body.campuri.expiry_date);
      t('asigurătorul recunoscut', sc1.body.campuri.issuer === 'OMNIASIG', sc1.body.campuri.issuer);
      t('vehiculul identificat din act', sc1.body.campuri.plate === 'TM 99 SCN', sc1.body.campuri.plate);
      t('textul transcris vine pentru ecranul de confirmare', typeof sc1.body.text === 'string' && sc1.body.text.length > 40);
      t('fiecare câmp are grad de încredere', Object.keys(sc1.body.campuri).every(k => typeof sc1.body.incredere[k] === 'number'));
    }

    // ── 2. Scanarea NU scrie nimic ──
    const dupa = await req(S, 'GET', '/api/documents?imei=' + IMEI);
    t('după scan, ZERO documente în bază (doar propune)', Array.isArray(dupa.body) && dupa.body.length === 0, 'găsite: ' + (dupa.body || []).length);

    // ── 3. Confirmarea omului → salvare pe calea existentă, cu fișier ──
    const poza1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sv = await req(S, 'POST', '/api/documents', {
      imei: IMEI, doc_type: 'RCA', number: 'RO/22/H22/987654321', issuer: 'OMNIASIG',
      issue_date: '2026-09-01', expiry_date: '2027-02-28',
      file_b64: poza1x1, file_mime: 'image/png', file_name: 'rca-2027.png',
    });
    t('salvarea cu fișier atașat merge', sv.status === 200, 'status ' + sv.status + ' ' + JSON.stringify(sv.body).slice(0, 100));
    t('răspunsul confirmă fișierul (has_file)', sv.body && sv.body.has_file === true);
    t('răspunsul NU cară base64-ul înapoi', sv.body && sv.body.file_b64 === undefined);

    // ── 4. Listarea nu cară fișierul; fișierul vine doar la cerere ──
    const lst = await req(S, 'GET', '/api/documents?imei=' + IMEI);
    t('actul apare la listare', Array.isArray(lst.body) && lst.body.length === 1);
    const rand = lst.body && lst.body[0];
    t('listarea are has_file, dar NU base64', rand && rand.has_file === true && rand.file_b64 === undefined, JSON.stringify(Object.keys(rand || {})));
    const fis = await req(S, 'GET', '/api/documents/' + rand.id + '/file');
    t('fișierul se descarcă la cerere, ca imagine', fis.status === 200 && /image\/png/.test(fis.ct), fis.ct);
    t('conținutul e chiar poza salvată', fis.raw && fis.raw.equals(Buffer.from(poza1x1, 'base64')));

    // ── 5. Refuzuri cu mesaje de om ──
    const gres = await req(S, 'POST', '/api/documents/scan', { b64: 'AAAA', mime: 'text/plain' });
    t('format neacceptat → 400 cu explicație, nu 500', gres.status === 400 && /neacceptat/i.test(gres.body.error), JSON.stringify(gres.body));
    const gol = await req(S, 'POST', '/api/documents/scan', { mime: 'image/jpeg' });
    t('fără fișier → 400', gol.status === 400);
    const pozaFaraCheie = await req(S, 'POST', '/api/documents/scan', { b64: poza1x1, mime: 'image/png' });
    t('poză fără cheie AI → explică exact ce lipsește', pozaFaraCheie.status === 400 && /cheia AI/i.test(pozaFaraCheie.body.error), JSON.stringify(pozaFaraCheie.body));

  } catch (e) {
    fail++; console.error('  ❌ CRASH:', e.message);
  } finally {
    await kill(srv);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
