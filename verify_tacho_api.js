// verify_tacho_api.js — secțiunea Tahograf, capăt-la-capăt, pe un server pornit de probă.
//
//   node verify_tacho_api.js
//
// Ce apără: scadențarul de descărcare (28 de zile cardul, 90 memoria vehiculului), legarea fișierului
// de șoferul ALES din aplicație, istoricul cu golurile din arhivă, și — cel mai important — că un
// fișier pe care nu l-am putut citi NU trece drept descărcare valabilă. Dacă ar trece, aplicația ar
// spune „ești în regulă" pe baza unui fișier pe care nu-l înțelege. Ăsta ar fi cel mai rău fel de
// greșeală posibilă aici: liniștitoare și falsă.

const { spawn } = require('child_process');
const fs = require('fs');
const tacho = require('./tacho.js');

const PORT = 3196, DIR = '.tacho-api-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_tacho',
  PORT: String(PORT), TCP_PORT: '5196', DEMO_DISABLED: 'true', PGLITE_DIR: DIR + '/pgdata',
};
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}

// ─── constructor de fișier .DDD (aceeași structură ca în verify_tacho.js) ───
const sch = (min, act) => ((act << 11) | (min & 0x7FF));
function fisierCard(prenume, nume, zile) {
  const bin = []; let ant = 0;
  for (const z of zile) {
    const n = z.s.length, b = Buffer.alloc(12 + n * 2);
    b.writeUInt16BE(ant, 0); b.writeUInt16BE(12 + n * 2, 2);
    b.writeUInt32BE(Math.floor(Date.parse(z.d + 'T00:00:00Z') / 1000), 4);
    b.writeUInt16BE(0, 8); b.writeUInt16BE(z.km || 0, 10);
    z.s.forEach((x, i) => b.writeUInt16BE(x, 12 + i * 2));
    bin.push(b); ant = b.length;
  }
  const inel = Buffer.concat(bin);
  let pNou = 0; for (let i = 0; i < bin.length - 1; i++) pNou += bin[i].length;
  const act = Buffer.alloc(4 + inel.length);
  act.writeUInt16BE(0, 0); act.writeUInt16BE(pNou, 2); inel.copy(act, 4);
  const id = Buffer.alloc(tacho._LEN_IDENTIFICATION, 0);
  id.write('RO', 0, 'latin1'); id[65] = 1; id.write(nume, 66, 'latin1'); id[101] = 1; id.write(prenume, 102, 'latin1');
  const bl = (fid, val, tip) => { const h = Buffer.alloc(5); h.writeUInt16BE(fid, 0); h[2] = tip || 0; h.writeUInt16BE(val.length, 3); return Buffer.concat([h, val]); };
  return Buffer.concat([bl(0x0520, id), bl(0x0504, act)]);
}
const zi = (d, km) => ({ d, km, s: [sch(0, 0), sch(360, 3), sch(600, 0), sch(645, 3), sch(840, 0)] });

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }
  const lr = await fetch(B + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }),
  });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const GET = (u) => fetch(B + u, { headers: { Cookie: ck } });
  const POST = (u, b) => fetch(B + u, { method: 'POST', headers: H, body: JSON.stringify(b) });

  // modulul e per companie; contul de probă e super-admin, deci îl are
  const s0 = await GET('/api/tacho/scadentar');
  if (s0.status === 403) { console.log('\n⚠ Modulul „tahograf" nu e activ pentru contul de probă — nu pot verifica.'); return gata(1); }
  T('scadențarul răspunde', s0.status === 200, 'a dat ' + s0.status);
  const d0 = await s0.json();
  T('pragurile sunt cele legale', d0.praguri && d0.praguri.card === 28 && d0.praguri.vu === 90, JSON.stringify(d0.praguri));

  // ─── un șofer nou ───
  sect('1. Un șofer nou apare imediat ca „niciodată descărcat"');
  const cr = await POST('/api/drivers', { name: 'Vasile Probă', phone: '0700000000' });
  const drv = await cr.json();
  T('șoferul s-a creat', cr.status === 200 && drv.id, JSON.stringify(drv).slice(0, 100));
  const s1 = await (await GET('/api/tacho/scadentar')).json();
  const gasit = (s1.soferi || []).find(x => x.id === drv.id);
  T('apare în scadențar fără să fi încărcat nimic', !!gasit, (s1.soferi || []).map(x => x.nume).join(', '));
  T('starea e „niciodata", nu „ok"', gasit && gasit.stare === 'niciodata', gasit && gasit.stare);
  T('nu pretinde zile rămase', gasit && gasit.zileRamase === null, gasit && gasit.zileRamase);
  T('sumarul îl numără', s1.sumar.niciodata >= 1, JSON.stringify(s1.sumar));

  // ─── încărcare legată de șofer ───
  sect('2. Un fișier citit îl scoate din întârziere');
  const azi = new Date();
  const ziua = (n) => new Date(azi.getTime() - n * 86400000).toISOString().slice(0, 10);
  const buf = fisierCard('VASILE', 'PROBA', [zi(ziua(3), 300), zi(ziua(2), 320), zi(ziua(1), 280)]);
  const up = await POST('/api/tacho/upload', {
    filename: 'card.ddd', b64: buf.toString('base64'), driverId: drv.id,
  });
  const uj = await up.json();
  T('încărcarea reușește', up.status === 200 && uj.id, JSON.stringify(uj).slice(0, 120));
  T('structura s-a verificat', uj.parsed && uj.parsed.incredere === 'confirmat', uj.parsed && uj.parsed.incredere);
  T('numele e citit din card', uj.parsed && uj.parsed.driverName === 'VASILE PROBA', uj.parsed && uj.parsed.driverName);

  const s2 = await (await GET('/api/tacho/scadentar')).json();
  const g2 = (s2.soferi || []).find(x => x.id === drv.id);
  T('nu mai e „niciodată"', g2 && g2.stare === 'ok', g2 && g2.stare);
  T('se socotește de la ULTIMA ZI acoperită, nu de la data încărcării',
    g2 && g2.zileRamase === 28 - 1, g2 && ('rămase ' + g2.zileRamase + ', ultima ' + g2.ultima));
  T('numără fișierul', g2 && g2.fisiere === 1, g2 && g2.fisiere);

  // ─── fișier necitit: NU trebuie să conteze ───
  sect('3. Un fișier pe care nu-l putem citi NU trece drept descărcare');
  const cr2 = await POST('/api/drivers', { name: 'Ion Necitit' });
  const drv2 = await (cr2).json();
  const gunoi = Buffer.from(Array.from({ length: 500 }, (_, i) => (i * 91 + 7) & 0xFF));
  const up2 = await POST('/api/tacho/upload', {
    filename: 'stricat.ddd', b64: gunoi.toString('base64'), driverId: drv2.id,
  });
  const uj2 = await up2.json();
  T('se acceptă la încărcare (se păstrează, ca dovadă)', up2.status === 200, up2.status);
  T('dar e marcat „necitit"', uj2.parsed && uj2.parsed.incredere === 'necitit', uj2.parsed && uj2.parsed.incredere);
  T('nu scoate ore din el', uj2.parsed && (!uj2.parsed.totals || !uj2.parsed.totals.conducereMin));

  const s3 = await (await GET('/api/tacho/scadentar')).json();
  const g3 = (s3.soferi || []).find(x => x.id === drv2.id);
  T('șoferul RĂMÂNE „niciodată descărcat"', g3 && g3.stare === 'niciodata',
    g3 && (g3.stare + ' — un fișier necitit l-a scos fals din întârziere!'));

  // ─── istoric + goluri ───
  sect('4. Istoricul arată ce lipsește din arhivă');
  const vechi = fisierCard('VASILE', 'PROBA', [zi('2026-06-01', 200), zi('2026-06-02', 210)]);
  await POST('/api/tacho/upload', { filename: 'vechi.ddd', b64: vechi.toString('base64'), driverId: drv.id });
  const ist = await (await GET('/api/tacho/istoric?driverId=' + drv.id)).json();
  T('întoarce fișierele', Array.isArray(ist.fisiere) && ist.fisiere.length === 2, ist.fisiere && ist.fisiere.length);
  T('găsește golul dintre cele două perioade', Array.isArray(ist.goluri) && ist.goluri.length === 1,
    JSON.stringify(ist.goluri));
  T('golul are început, sfârșit și număr de zile',
    ist.goluri[0] && ist.goluri[0].de && ist.goluri[0].pana && ist.goluri[0].zile > 0, JSON.stringify(ist.goluri[0]));

  const ist2 = await (await GET('/api/tacho/istoric?driverId=' + drv2.id)).json();
  T('fișierul necitit nu acoperă nicio perioadă', ist2.acoperit === 0, ist2.acoperit);

  // ─── verificări de siguranță ───
  sect('5. Nu se poate lega un fișier de un șofer inexistent');
  const rauId = await POST('/api/tacho/upload', {
    filename: 'x.ddd', b64: buf.toString('base64'), driverId: 999999,
  });
  T('șofer inexistent → refuzat', rauId.status === 400, rauId.status);
  const fara = await fetch(B + '/api/tacho/scadentar');
  T('fără autentificare → refuzat', fara.status === 401 || fara.status === 403, fara.status);
  const istFara = await (await GET('/api/tacho/istoric')).json();
  T('istoric fără șofer și fără vehicul → cere unul', !!istFara.error, JSON.stringify(istFara).slice(0, 80));

  sect('6. Ruta cu nume fix nu e înghițită de /api/tacho/:id');
  const sc = await GET('/api/tacho/scadentar');
  const j = await sc.json();
  T('„scadentar" chiar ajunge la scadențar, nu la un fișier cu id-ul „scadentar"',
    sc.status === 200 && Array.isArray(j.soferi), sc.status + ' · ' + Object.keys(j).join(','));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
