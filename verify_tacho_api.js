// verify_tacho_api.js — secțiunea Tahograf, capăt-la-capăt, pe un server pornit de probă.
//
//   node verify_tacho_api.js
//
// Ce apără: scadențarul de descărcare (28 de zile cardul, 90 memoria vehiculului), legarea fișierului
// de șoferul ALES din aplicație, istoricul cu golurile din arhivă, și — cel mai important — că un
// fișier pe care nu l-am putut citi NU trece drept descărcare valabilă. Dacă ar trece, aplicația ar
// spune „ești în regulă" pe baza unui fișier pe care nu-l înțelege. Ăsta ar fi cel mai rău fel de
// greșeală posibilă aici: liniștitoare și falsă.
//
// Și apără CINE intră în listă: doar șoferii cu card de tahograf, doar vehiculele care au tahograf,
// niciodată flota demo. Serverul de probă pornește ANUME cu demo-ul activ (fără DEMO_DISABLED), ca
// DEMO0001..5 să existe cu adevărat în bază — altfel „nu apar" ar fi trecut degeaba, pe o bază goală.

const { spawn } = require('child_process');
const fs = require('fs');
const tacho = require('./tacho.js');

const PORT = 3196, DIR = '.tacho-api-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_tacho',
  PORT: String(PORT), TCP_PORT: '5196', PGLITE_DIR: DIR + '/pgdata',
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
  // categoriile NU sunt decor: în tahograf intră doar șoferii cu card, adică cei cu C*/D* pe permis
  const cr = await POST('/api/drivers', { name: 'Vasile Probă', phone: '0700000000', license_categories: 'B,C,CE' });
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
  const cr2 = await POST('/api/drivers', { name: 'Ion Necitit', license_categories: 'C' });
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

  // Un fișier nelegat de nimeni rămâne în bază fără să conteze pentru vreun termen: o descărcare
  // făcută, dar invizibilă în scadențar. Regula stătea doar în pagina web — de când încarcă și
  // telefonul, e pe server. Dacă s-ar întoarce în interfață, ar trebui scrisă de două ori.
  const faraLegatura = await POST('/api/tacho/upload', { filename: 'orfan.ddd', b64: buf.toString('base64') });
  const jOrfan = await faraLegatura.json();
  T('fără șofer ȘI fără vehicul → refuzat de SERVER, nu doar de pagină', faraLegatura.status === 400, faraLegatura.status);
  T('și explică de ce', /scadențar/.test(jOrfan.error || ''), jOrfan.error);
  const imeiRau = await POST('/api/tacho/upload', { filename: 'x.ddd', b64: buf.toString('base64'), imei: '000000000000000' });
  T('vehicul inexistent → refuzat (altfel aceeași legătură moartă)', imeiRau.status === 400, imeiRau.status);
  const dupaOrfan = await (await GET('/api/tacho')).json();
  T('niciunul dintre cele refuzate n-a ajuns în bază',
    !dupaOrfan.some(f => f.filename === 'orfan.ddd'), dupaOrfan.map(f => f.filename).join(', '));
  const fara = await fetch(B + '/api/tacho/scadentar');
  T('fără autentificare → refuzat', fara.status === 401 || fara.status === 403, fara.status);
  const istFara = await (await GET('/api/tacho/istoric')).json();
  T('istoric fără șofer și fără vehicul → cere unul', !!istFara.error, JSON.stringify(istFara).slice(0, 80));

  sect('6. Ruta cu nume fix nu e înghițită de /api/tacho/:id');
  const sc = await GET('/api/tacho/scadentar');
  const j = await sc.json();
  T('„scadentar" chiar ajunge la scadențar, nu la un fișier cu id-ul „scadentar"',
    sc.status === 200 && Array.isArray(j.soferi), sc.status + ' · ' + Object.keys(j).join(','));

  // ─── CINE intră în listă ─────────────────────────────────────────────────────────────────────
  // Ecranul e util doar dacă e curat. Un scadențar plin de autoturisme, de oameni cu permis de B și
  // de vehicule demo sună alarme false permanent, iar omul se învață să nu se mai uite la el.
  sect('7. Doar șoferii cu card de tahograf apar în listă');
  const drvB = await (await POST('/api/drivers', { name: 'Marcel Doar B', license_categories: 'B,BE' })).json();
  const drvGol = await (await POST('/api/drivers', { name: 'Necompletat Necompletat' })).json();
  const drvD = await (await POST('/api/drivers', { name: 'Dorel Autobuz', license_categories: 'B,D' })).json();
  const s7 = await (await GET('/api/tacho/scadentar')).json();
  const nume7 = (s7.soferi || []).map(x => x.nume);
  T('șoferul cu permis doar de autoturism NU apare', nume7.indexOf('Marcel Doar B') < 0, nume7.join(', '));
  T('șoferul fără nicio categorie NU apare', nume7.indexOf('Necompletat Necompletat') < 0, nume7.join(', '));
  T('șoferul de autobuz (D) APARE', nume7.indexOf('Dorel Autobuz') >= 0, nume7.join(', '));
  T('șoferul de camion (C, CE) APARE', nume7.indexOf('Vasile Probă') >= 0, nume7.join(', '));
  T('categoriile ajung în listă, curățate și sortate',
    (s7.soferi.find(x => x.nume === 'Vasile Probă') || {}).categorii === 'B,C,CE',
    (s7.soferi.find(x => x.nume === 'Vasile Probă') || {}).categorii);

  // Cel exclus pentru că n-are categorii completate NU dispare tăcut: e numit pe nume, ca să se
  // poată repara. Ăsta e singurul caz în care lipsa din listă poate ascunde un profesionist real.
  T('cel fără categorii e numit în „excluse", ca să nu dispară în tăcere',
    (s7.excluse && (s7.excluse.soferiFaraCategorie || []).indexOf('Necompletat Necompletat') >= 0),
    JSON.stringify(s7.excluse));
  T('cel cu permis de B e doar numărat, nu numit', s7.excluse && s7.excluse.soferiNeprofesionisti >= 1,
    JSON.stringify(s7.excluse));
  T('cel cu categorii completate nu e trecut la „fără categorii"',
    (s7.excluse.soferiFaraCategorie || []).indexOf('Marcel Doar B') < 0, JSON.stringify(s7.excluse.soferiFaraCategorie));

  sect('8. Doar vehiculele care CHIAR au tahograf');
  const veh = [
    { imei: '8811000000001', plate: 'TM 01 CAM', vehicle_type: 'Camion', apare: true },
    { imei: '8811000000002', plate: 'TM 02 CAP', vehicle_type: 'Autotractor', apare: true },
    { imei: '8811000000003', plate: 'TM 03 BUS', vehicle_type: 'Autobuz', apare: true },
    // capcana: „Tractor" e tractorul AGRICOL, n-are tahograf. O potrivire pe conținut („/tractor/i")
    // l-ar fi prins odată cu „Autotractor" și ar fi băgat utilaje agricole în scadențar.
    { imei: '8811000000004', plate: 'TM 04 TRA', vehicle_type: 'Tractor', apare: false },
    { imei: '8811000000005', plate: 'TM 05 DUB', vehicle_type: 'Duba', apare: false },
    { imei: '8811000000006', plate: 'TM 06 AUT', vehicle_type: 'Auto', apare: false },
    { imei: '8811000000007', plate: 'TM 07 UTI', vehicle_type: 'Buldoexcavator', apare: false },
  ];
  for (const v of veh) await POST('/api/devices', { imei: v.imei, plate: v.plate, vehicle_type: v.vehicle_type });
  const s8 = await (await GET('/api/tacho/scadentar')).json();
  const imei8 = (s8.vehicule || []).map(x => x.imei);
  for (const v of veh) {
    T((v.apare ? 'APARE: ' : 'nu apare: ') + v.vehicle_type,
      (imei8.indexOf(v.imei) >= 0) === v.apare, v.plate + ' → ' + (imei8.indexOf(v.imei) >= 0 ? 'în listă' : 'lipsă'));
  }
  T('vehiculele fără tahograf sunt numărate, nu ascunse fără urmă',
    s8.excluse && s8.excluse.vehiculeFaraTahograf >= 4, JSON.stringify(s8.excluse));

  sect('9. Flota demo nu intră în scadențarul unei flote reale');
  const demoImeis = require('./demo-sim.js').DEMO_IMEIS;
  // Proba asta trece degeaba dacă demo-ul n-a fost semănat — „nu apar" e adevărat și pe o bază goală.
  // De-aia întâi DOVEDIM că vehiculele demo chiar sunt în bază (`/api/companies` le numără per companie,
  // fără filtrul de demo), și abia apoi verificăm că scadențarul nu le arată.
  const cos = await (await GET('/api/companies')).json();
  const coDemo = (Array.isArray(cos) ? cos : []).find(c => c.slug === 'demo');
  T('compania demo există', !!coDemo, JSON.stringify((cos || []).map(c => c.slug)));
  T('și are cele 5 vehicule sintetice în bază (altfel proba n-ar verifica nimic)',
    coDemo && Number(coDemo.device_count) === demoImeis.length,
    coDemo && (coDemo.device_count + ' vehicule — pornește serverul de probă FĂRĂ DEMO_DISABLED'));

  const s9 = await (await GET('/api/tacho/scadentar')).json();
  const imei9 = (s9.vehicule || []).map(x => x.imei);
  T('niciun IMEI demo în listă', demoImeis.every(i => imei9.indexOf(i) < 0),
    imei9.filter(i => demoImeis.indexOf(i) >= 0).join(', '));
  T('niciun nume DEMO-x în listă', (s9.vehicule || []).every(v => !/^DEMO-\d/.test(String(v.nume))),
    (s9.vehicule || []).map(v => v.nume).join(', '));
  // Sumarul se calculează din aceleași liste — dacă s-ar socoti din altă parte, ar renumăra demo-ul.
  const nic9 = (s9.soferi || []).concat(s9.vehicule || []).filter(x => x.stare === 'niciodata').length;
  T('sumarul numără exact ce e afișat, nu altceva', s9.sumar.niciodata === nic9,
    s9.sumar.niciodata + ' în sumar vs ' + nic9 + ' pe ecran');

  // ─── de la răspunsul serverului până la ce scrie pe ecran ────────────────────────────────────
  // Rutele pot fi corecte și ecranul tot să mintă. Aici luăm răspunsul REAL primit mai sus și îl dăm
  // funcțiilor REALE de randare din public/index.html — aceleași care rulează în browser.
  sect('10. Ecranul spune de ce lipsește cineva');
  const html = fs.readFileSync('./public/index.html', 'utf8');
  const _de = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); return (i < 0 || j < 0) ? null : html.slice(i, j); };
  const codUI = _de('    var _thTab = ', '    // ── e-Transport (ANAF) ──');
  T('găsesc codul ecranului în index.html', !!codUI);
  if (codUI) {
    const nod = () => ({ innerHTML: '', textContent: '', value: '', style: {}, classList: { toggle() {}, add() {} }, scrollIntoView() {} });
    const noduri = { 'th-body': nod(), 'th-sumar': nod(), 'rax-tacho-detail': nod(), 'th-drv': nod(), 'th-veh': nod() };
    const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ui = new Function('window', 'document', 'esc', '$', 'fetch',
      codUI + '\n; return { render: raxTachoRender, set: (d) => { _thDate = d; _thTab = "due"; } };')(
      {}, { getElementById: (i) => noduri[i] || null, querySelectorAll: () => [] },
      escHtml, (i) => noduri[i] || null, () => Promise.resolve({ json: () => ({}) }));
    const rand = (d) => { noduri['th-body'].innerHTML = ''; noduri['th-sumar'].innerHTML = ''; ui.set(d); ui.render(); return noduri['th-sumar'].innerHTML + noduri['th-body'].innerHTML; };

    const ec = rand(s9);
    T('pe ecran nu ajunge niciun vehicul demo', ec.indexOf('DEMO-') < 0 && ec.indexOf('DEMO0') < 0);
    T('șoferul profesionist e pe ecran', ec.indexOf('Vasile Probă') >= 0);
    T('cel cu permis doar de B nu e pe ecran', ec.indexOf('Marcel Doar B') < 0);
    T('cel fără categorii e NUMIT pe ecran, nu doar scos', ec.indexOf('Necompletat Necompletat') >= 0);

    // Cazul lui azi: nimic de descărcat. Nu are voie să scrie „totul e la zi" — n-ar fi fals liniștitor
    // din greșeală, ci exact pe ecranul care există ca să te avertizeze.
    const gol = rand(Object.assign({}, s9, { soferi: [], vehicule: [] }));
    T('lista goală NU spune „toate descărcările sunt la zi"', gol.indexOf('la zi') < 0, gol.slice(0, 160));
    T('lista goală spune că nu e nimic de descărcat', gol.indexOf('Nimic de descărcat') >= 0);
    T('golul explică ce categorie de permis aduce un șofer aici', gol.indexOf('CE') >= 0 && gol.indexOf('permis') >= 0);
    T('golul explică ce categorie de vehicul are tahograf', gol.indexOf('Camion') >= 0 && gol.indexOf('Autotractor') >= 0);
  }

  // Legătura dintre regula de pe server și bifele din fișa șoferului: aceeași listă, un singur loc.
  const licJs = await (await GET('/js/license-cats.js')).text();
  const lic = JSON.parse(licJs.replace(/^window\.RA_LICENSE=/, '').replace(/;\s*$/, ''));
  const licSursa = require('./license_cats.js');
  T('interfața primește lista categoriilor cu tahograf',
    Array.isArray(lic.tacho) && lic.tacho.join(',') === licSursa.TACHO.join(','), JSON.stringify(lic.tacho));
  T('troleibuzul și tramvaiul sunt profesioniste, dar FĂRĂ tahograf',
    lic.pro.indexOf('Tb') >= 0 && lic.tacho.indexOf('Tb') < 0 && lic.tacho.indexOf('Tv') < 0);

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
