// verify_demo.js — contul demo (19.11; Alin: „după ce îi dăm cont demo, poate accesa RA Insight?… cel de pe Start”;
// „1. varianta 2” — flota de probă ca pe site; „agenții… texte despre mașinile demo”; „3. cele găsite pe drum rezolvă acum”).
//
//   node verify_demo.js
//
// Ce păzește:
//   1. flota de probă (demo_flota.js): mașinile și modelele de pe site, zilele mereu aceleași, ce se întâmplă „azi” nu mută
//      kilometrajul și motorina zilei de mâine, pozițiile au sens; AGENȚII ADEVĂRAȚI găsesc pe ea, la 15:00 într-o zi de lucru,
//      ce promite emailul (motorina de noapte, ralantiul, actele, revizia, scorul de condus, orele de condus, mașina liberă);
//   2. textele contului demo (cont_demo.js): „30 de zile”, „1 cont demo activ”, banda, emailul (e un cont DEMO, nu „administrezi”);
//   3. pagina, telefonul, site-ul: banda „Cont demo”, „Prelungește”, „Email” la autentificare, „Vizualizare”, „?oferta=1”;
//   4. pe server pornit (Brevo fals, FĂRĂ cheie de AI): cererea → aprobarea → emailul de demo → parola → contul vede cele 8 mașini,
//      șoferii, actele; RA Insight răspunde pe butoane (Start), numărat PE CONT; agenții găsesc actele; „Prelungește”.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const P = (f) => path.join(__dirname, f);
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); } };
const sect = (s) => console.log('\n' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const flota = require('./demo_flota');
const cont = require('./cont_demo');

(async () => {
  try {
    sect('1. Flota de probă');
    const site = fs.readFileSync(P('public/js/ra-insight-demo.js'), 'utf8');
    T('8 mașini, cu numere DEMO000N', flota.MASINI.length === 8 && flota.IMEIS.every((x, i) => x === 'DEMO000' + (i + 1)));
    for (const nr of ['B 204 RAT', 'B 77 TIR', 'B 31 LOG']) {
      const m = flota.MASINI.find((x) => x.nr === nr);
      T('„' + nr + '” e pe site cu același model („' + (m && m.nume) + '”)', !!m && new RegExp(nr + ' · ' + m.nume.replace(/^VW/, 'VW')).test(site), m && m.nume);
    }
    T('demo-sim folosește aceeași listă de mașini', JSON.stringify(require('./demo-sim').DEMO_IMEIS) === JSON.stringify(flota.IMEIS));
    // o zi de lucru fixă (ultima miercuri), ca proba să nu depindă de ziua în care rulează
    let azi = flota.ziuaLa(Date.now());
    while (flota.ziSaptamana(azi) !== 3) azi--;
    const a1 = JSON.stringify(flota.punctePeZi('DEMO0002', azi, azi)), a2 = JSON.stringify(flota.punctePeZi('DEMO0002', azi, azi));
    T('aceeași zi dă mereu aceleași poziții', a1 === a2 && a1.length > 1000);
    let neutre = true, rupte = [];
    for (const m of flota.MASINI) {
      const cu = flota._plan(m, azi, azi), fara = flota._plan(m, azi, -1);
      if (Math.abs(cu.km - fara.km) > 0.01 || Math.abs(cu.litri1 - fara.litri1) > 0.01) { neutre = false; rupte.push(m.nr + ' km ' + cu.km.toFixed(1) + '/' + fara.km.toFixed(1) + ' l ' + cu.litri1.toFixed(1) + '/' + fara.litri1.toFixed(1)); }
    }
    T('ce se întâmplă „azi” nu schimbă km și motorina de la capătul zilei (ziua de mâine pleacă de unde trebuie)', neutre, rupte.join('; '));
    // trecerea dintre zile, pe 30 de zile: fără salt de kilometraj sau de motorină la miezul nopții
    let salt = [];
    for (const m of flota.MASINI) {
      for (let i = azi - 29; i < azi; i++) {
        const z = flota.punctePeZi(m.imei, i, -1), u = flota.punctePeZi(m.imei, i + 1, -1);
        if (!z.length || !u.length) { salt.push(m.nr + ' ziua ' + i + ' goală'); continue; }
        const x = z[z.length - 1].io, y = u[0].io;
        if (Math.abs(y.total_odometer - x.total_odometer) > 1000 || Math.abs(y.fuel_level_liters - x.fuel_level_liters) > 0.5) salt.push(m.nr + ' ' + flota.dataZi(i + 1));
      }
    }
    T('nicio zi nu sare la miezul nopții (kilometraj, motorină), pe 30 de zile', salt.length === 0, salt.slice(0, 5));
    let strica = [];
    for (const m of flota.MASINI) {
      const pts = flota.punctePeZi(m.imei, azi, azi), z0 = flota.inceputZi(azi), z1 = flota.inceputZi(azi + 1);
      pts.forEach((p, i) => {
        if (p.t < z0 || p.t >= z1) strica.push(m.nr + ' în afara zilei');
        if (i && Math.floor(p.t / 1000) <= Math.floor(pts[i - 1].t / 1000)) strica.push(m.nr + ' ordine/dublură');
        if (!(p.v >= 0) || [0, 1].indexOf(p.io.ignition) < 0 || !(p.io.fuel_level_liters >= 0) || p.io.fuel_level_liters > m.rezervor) strica.push(m.nr + ' valoare');
      });
    }
    T('pozițiile zilei au sens (în zi, în ordine, viteză, contact, motorină în rezervor)', strica.length === 0, strica.slice(0, 5));
    T('harta live și istoricul spun același lucru (stareaLa = punctul planului)', (() => {
      const pts = flota.punctePeZi('DEMO0001', azi, azi); const x = pts[Math.floor(pts.length / 2)]; const y = flota.stareaLa('DEMO0001', x.t, azi);
      return Math.abs(x.lat - y.lat) < 1e-9 && Math.abs(x.lng - y.lng) < 1e-9 && x.io.ignition === y.io.ignition;
    })());

    sect('1b. Agenții adevărați, pe ziua de lucru, la 15:00');
    const agents = require('./agents'), reports = require('./reports');
    const now = flota.inceputZi(azi) + 15 * 3600000;
    const ist = {};
    for (const m of flota.MASINI) ist[m.imei] = flota.punctePeZi(m.imei, azi, azi).filter((p) => p.t <= now)
      .map((p) => ({ imei: m.imei, timestamp: new Date(p.t).toISOString(), latitude: p.lat, longitude: p.lng, speed: p.v, angle: p.unghi, io_data: p.io }));
    const live = new Map(flota.MASINI.map((m) => { const p = flota.stareaLa(m.imei, now, azi); return [m.imei, { imei: m.imei, timestamp: new Date(now).toISOString(), latitude: p.lat, longitude: p.lng, speed: p.v, angle: p.unghi, io: p.io, name: m.nume, plate: m.nr }]; }));
    const acte = flota.acte(now).map((a, i) => Object.assign({ id: i + 1 }, a)), rev = flota.revizii(now).map((r, i) => Object.assign({ id: 100 + i, status: 'pending' }, r));
    const km = (imei, from, to) => reports.segmentTrack(ist[imei].filter((p) => p.timestamp >= from && p.timestamp <= to), 300).trips.reduce((s, t) => s + t.distanceKm, 0);
    const db = {
      getDeviceHistory: async (imei, from, to) => (ist[imei] || []).filter((p) => p.timestamp >= from && p.timestamp <= to),
      getDeviceFull: async (imei) => { const m = flota.MASINI.find((x) => x.imei === imei); return m ? { vehicle_type: m.tip, speed_limit: m.limita } : null; },
      getVehicleDocuments: async () => acte, getMaintenance: async (imei) => rev.filter((r) => r.imei === imei),
      getTripsSummaryForImeis: async (imeis, from, to) => imeis.map((i) => ({ imei: i, km: km(i, from, to) }))
    };
    const real = Date.now; Date.now = () => now;
    let gas = [];
    try { gas = (await agents.runAll({ db, imeis: flota.IMEIS, livePositions: live, companyId: 1, alertThresholds: {} })).findings; } finally { Date.now = real; }
    const are = (ag, re) => gas.some((f) => f.agent === ag && re.test(f.title));
    const titluri = gas.map((f) => f.agent + ': ' + f.title);
    T('RA Watch: motorina scăzută noaptea la B 90 CTR (~38 L)', are('watch', /Iveco Eurocargo \(B 90 CTR\): scădere combustibil ~38 L/), titluri);
    T('RA Watch: ralantiul frigorificului (B 63 FRG, peste 2 ore)', are('watch', /Mercedes Sprinter \(B 63 FRG\): ralanti ~1\d\d min azi/), titluri);
    T('RA Care: ITP-ul la B 77 TIR în 12 zile, RCA la B 204 RAT în 19, rovinieta expirată la B 18 VAN', are('care', /B 77 TIR\): ITP expiră în 12 zile/) && are('care', /B 204 RAT\): RCA expiră în 19 zile/) && are('care', /B 18 VAN\): ROVINIETĂ EXPIRAT de 3 zile/), titluri);
    T('RA Care: revizia pe km la B 90 CTR și anvelopele la B 52 DUB', are('care', /B 90 CTR\): Revizie generală în 320 km/) && are('care', /B 52 DUB\): Anvelope expiră în 9 zile/), titluri);
    T('RA Optimize: scor eco sub prag la B 204 RAT', are('optimize', /VW Caddy \(B 204 RAT\): scor eco [1-5]\d\/100/), titluri);
    T('RA Compliance: condus continuu peste 4h30 la B 77 TIR', are('compliance', /Iveco Stralis \(B 77 TIR\): conducere continuă ~4 h \d+ min — limită depășită/), titluri);
    T('RA Dispatch: mașina de rezervă, nefolosită azi', are('dispatch', /Skoda Octavia \(B 88 AUT\): nefolosit azi/), titluri);
    T('RA Client: sinteza zilei, cu 7 din 8 mașini active', are('client', /^Azi: [\d.]+ km · 7\/8 active/), titluri);

    sect('2. Textele contului demo');
    T('„30 de zile”, „20 de ore”, „1 zi”, „7 zile”, „2 ore”, „2 zile și 6 ore”', cont.durata(720) === '30 de zile' && cont.durata(20) === '20 de ore' && cont.durata(24) === '1 zi' && cont.durata(168) === '7 zile' && cont.durata(2) === '2 ore' && cont.durata(54) === '2 zile și 6 ore');
    T('„1 cont demo activ”, „2 conturi demo active”, „20 de conturi demo active”', cont.conturiActive(1) === '1 cont demo activ' && cont.conturiActive(2) === '2 conturi demo active' && cont.conturiActive(20) === '20 de conturi demo active');
    const z0 = flota.inceputZi(flota.ziuaLa(Date.now()));
    const b = cont.banda(z0 + 7 * 86400000 + 8 * 3600000, z0 + 10 * 3600000);
    T('banda: „Cont demo · îl ai până pe ZZ.LL, ora 08:00 (încă 6 zile și 22 de ore).” + „Cere ofertă”', !!b && /^Cont demo · îl ai până pe \d\d\.\d\d, ora 08:00 \(încă 6 zile și 22 de ore\)\.$/.test(b.text) && b.buton === 'Cere ofertă' && b.link === '/?oferta=1#contact', b);
    // Abia aprobat pe 7 zile, banda spune 7 zile (până pe 19.11 tăia în jos: „încă 6 zile”); restul, cât arată data din fața ei.
    const aprobat = z0 + 10 * 3600000 + 1234, ramasTxt = function (msInainte) { const x = cont.banda(aprobat + msInainte, aprobat); return x && (x.text.match(/\((încă [^)]+)\)/) || [])[1]; };
    T('banda, abia aprobat: 7 zile → „încă 7 zile”, 30 de zile → „încă 30 de zile”, 24 de ore → „încă 1 zi”',
      ramasTxt(7 * 86400000 - 5000) === 'încă 7 zile' && ramasTxt(30 * 86400000 - 5000) === 'încă 30 de zile' && ramasTxt(86400000 - 5000) === 'încă 1 zi',
      [ramasTxt(7 * 86400000 - 5000), ramasTxt(30 * 86400000 - 5000), ramasTxt(86400000 - 5000)]);
    T('banda, mai târziu: „încă 2 zile și 3 ore”, „încă 20 de ore”, „încă 3 ore”, „încă 90 de minute”, „încă 1 minut”',
      ramasTxt(51 * 3600000 + 10 * 60000) === 'încă 2 zile și 3 ore' && ramasTxt(20 * 3600000) === 'încă 20 de ore' && ramasTxt(3 * 3600000 - 60000) === 'încă 3 ore' &&
      ramasTxt(90 * 60000 + 20000) === 'încă 90 de minute' && ramasTxt(30000) === 'încă 1 minut',
      [ramasTxt(51 * 3600000 + 10 * 60000), ramasTxt(20 * 3600000), ramasTxt(3 * 3600000 - 60000), ramasTxt(90 * 60000 + 20000), ramasTxt(30000)]);
    T('banda nu se arată după termen', cont.banda(Date.now() - 1000, Date.now()) === null);
    const e = cont.email({ nume: 'Andrei Pop', email: 'andrei@exemplu.ro', ore: 168, pana: z0 + 7 * 86400000, linkOre: 168, link: 'https://ratrack.ro/set-password.html?token=x', aplicatie: 'https://ratrack.ro/app' });
    T('emailul spune că e un cont demo, cât ține și ce poate încerca (nu „administrezi”)', e.subiect === 'Contul tău demo RA Track' && /^Bună, Andrei!/.test(e.text) && /Îl ai 7 zile, până pe/.test(e.text) && /RA Insight, pe butoane/.test(e.text) && /set-password/.test(e.text) && !/administrezi/.test(e.text), e.text);
    // 19.11, „Cannot GET /app,” pe telefon: adresa aplicației stă la capăt de rând, fără punctuație după ea.
    const ep2 = cont.emailPrelungire({ nume: 'Andrei Pop', email: 'andrei@exemplu.ro', pana: z0 + 86400000, aplicatie: 'https://ratrack.ro/app' });
    T('adresa aplicației, la capăt de rând, fără „.” sau „,” după ea (emailul contului și al prelungirii)',
      /\nApoi intri în aplicație: https:\/\/ratrack\.ro\/app\n/.test(e.text) && /\nIntri cu aceeași adresă și aceeași parolă: https:\/\/ratrack\.ro\/app\n/.test(ep2.text)
      && !/https:\/\/ratrack\.ro\/app[.,;:]/.test(e.text + ep2.text), e.text + '\n---\n' + ep2.text);
    const e2 = cont.email({ nume: '', email: 'office@firma.ro', ore: 720, pana: z0 + 30 * 86400000, linkOre: 168, link: 'L', aplicatie: 'A' });
    T('la 30 de zile, emailul spune că linkul ține 7 zile', /linkul e valabil 7 zile/.test(e2.text) && /^Bună ziua!/.test(e2.text), e2.text.slice(0, 200));

    sect('3. Pagina, telefonul, site-ul');
    const html = fs.readFileSync(P('public/index.html'), 'utf8'), css = fs.readFileSync(P('public/css/app.css'), 'utf8');
    T('banda „Cont demo” vine de la server și se pune cu textContent', /function applyDemoBanner\(\)/.test(html) && /currentUser && currentUser\.demo/.test(html) && /t\.textContent = d\.text/.test(html));
    T('Cereri demo: „30 de zile”, „Prelungește”, „1 cerere”', /<option value="720">30 de zile<\/option>/.test(html) && !/<option value="720">30 zile</.test(html) && /raxDemoReqPrelungeste/.test(html) && /_raxDe\(list\.length\) \+ \(list\.length === 1 \? 'cerere' : 'cereri'\)/.test(html));
    T('autentificarea cere „Email”', /<label>Email<\/label>/.test(html) && !/<label>Username<\/label>/.test(html));
    // contrastul benzii, pe ambele teme
    const lum = (h) => { const n = parseInt(h.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const con = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    T('banda se citește pe tema închisă și pe cea deschisă (≥ 4,5)', /\.demo-banda \{[^}]*background: #0f2a1b; color: #d1fae5;/.test(css) && /body:not\(\.dark\) \.demo-banda \{ background: #ecfdf5; color: #14532d;/.test(css)
      && con('#d1fae5', '#0f2a1b') >= 4.5 && con('#14532d', '#ecfdf5') >= 4.5 && con('#06210F', '#3FE07D') >= 4.5);
    T('banda stă înaintea blocului „Casetele și listele derulante” (care rămâne ultimul)', css.indexOf('.demo-banda {') > 0 && css.indexOf('.demo-banda {') < css.indexOf('═══ Casetele și listele derulante'));
    const land = fs.readFileSync(P('public/landing.html'), 'utf8');
    T('„Cere ofertă” (/?oferta=1) scoate bifa de cont demo din formular', /get\('oferta'\) === '1'/.test(land) && /d\.checked = false/.test(land));
    const tel = fs.readFileSync(P('mobile/src/screens/DemoRequests.tsx'), 'utf8'), ep = fs.readFileSync(P('mobile/src/api/endpoints.ts'), 'utf8');
    T('telefonul: „24 de ore”, „30 de zile”, „Prelungește”', /label: '24 de ore'/.test(tel) && /label: '30 de zile'/.test(tel) && /Prelungește/.test(tel) && /prelungesteDemoRequest/.test(ep));
    const menu = fs.readFileSync(P('mobile/src/screens/Menu.tsx'), 'utf8');
    T('telefonul: rolul „Vizualizare”', /viewer: 'Vizualizare'/.test(menu) && !/'Viewer'/.test(menu));
    // 19.11, pe ratrack.ro: linkul de parolă n-a plecat la aprobare, iar mesajul îl trimitea pe fondator în Utilizatori — unde el vede
    // doar colegii noștri, nu și conturile demo. Acum „Prelungește” îi trimite omului care n-a intrat încă un link nou.
    const srvSrc = fs.readFileSync(P('server.js'), 'utf8');
    T('aprobarea fără link trimite la „Prelungește”, nu în Utilizatori', /Apasă „Prelungește” pe cerere: cât omul n-a intrat în cont, primește din nou linkul\./.test(srvSrc)
      && !/Trimite-i-l din Utilizatori, cu „Trimite link de parolă”/.test(srvSrc));
    T('fereastra „Prelungește” nu mai promite „aceeași parolă” (web și telefon)', /Dacă n-a intrat încă în cont, primește și un link nou de parolă\./.test(html) && /Dacă n-a intrat încă în cont, primește și un link nou de parolă\./.test(tel)
      && !/aceeași adresă și aceeași parolă; îi scriem/.test(html) && !/cu aceeași adresă și aceeași parolă\. Îi scriem/.test(tel));
    T('linkul nou care n-a plecat pe email se arată pe loc (web) / se copiază (telefon)', /if \(j\.link && window\._usrAratLinkul\) \{ raxToast\(j\.text \|\| 'Prelungit'/.test(html) && /navigator\.clipboard\.writeText\(r\.link\)/.test(tel));
    T('textul de după: „N-a intrat încă în cont: i-am trimis pe email un link nou de parolă.”',
      /N-a intrat încă în cont: i-am trimis pe email un link nou de parolă\.$/.test(cont.dupaPrelungire({ nume: 'Ion', pana: z0 + 86400000, trimis: true, linkNou: true }))
      && /N-a intrat încă în cont: emailul n-a plecat; trimite-i tu linkul nou de parolă\.$/.test(cont.dupaPrelungire({ nume: 'Ion', pana: z0 + 86400000, trimis: false, linkNou: true }))
      && /I-am scris pe email\.$/.test(cont.dupaPrelungire({ nume: 'Ion', pana: z0 + 86400000, trimis: true })));

    // 20.11: contul demo expirat se șterge după ZILE_DUPA_EXPIRARE zile — pagina de confidențialitate spune ACEEAȘI cifră.
    const conf = fs.readFileSync(P('public/confidentialitate.html'), 'utf8');
    const mz = conf.match(/<li>Contul demonstrativ: cât ține accesul primit, plus <b>(\d+) de zile<\/b> după ce expiră, apoi se șterge automat/);
    T('Confidențialitatea spune câte zile se mai ține contul demo expirat (= cont_demo.ZILE_DUPA_EXPIRARE) și că devine contul tău la semnare',
      !!mz && Number(mz[1]) === cont.ZILE_DUPA_EXPIRARE && /Dacă devii client, contul tău nou îl înlocuiește\./.test(conf), mz && mz[1]);
    T('ștergerea rulează zilnic, pe o singură cale cu înlocuirea (_stergeContDemo)', /const runDemoPurge = \(\) => stergeConturiDemoExpirate\(\)/.test(srvSrc)
      && /setInterval\(runDemoPurge, 24 \* 60 \* 60 \* 1000\)/.test(srvSrc) && (srvSrc.match(/await _stergeContDemo\(u\)/g) || []).length === 2
      && (srvSrc.match(/await _faLocContuluiNou\(req, username\)/g) || []).length === 2);
    T('ecranele arată nota de la server (web: Utilizatori, „Client nou”, administratorii firmei; telefon: aceleași trei)',
      (html.match(/\.nota/g) || []).length >= 5 && /a\.nota/.test(fs.readFileSync(P('mobile/src/screens/ClientNou.tsx'), 'utf8'))
      && /j\.nota/.test(fs.readFileSync(P('mobile/src/screens/CompanySheet.tsx'), 'utf8')) && /created\.nota/.test(fs.readFileSync(P('mobile/src/screens/AdminUsers.tsx'), 'utf8')));

    sect('4. Pe server pornit (fără cheie de AI, Brevo fals)');
    await peServer();
  } catch (e) { rele++; console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();

async function peServer() {
  const PORT = 3743, TCP = 5743, DIR = path.join(os.tmpdir(), 'rax_demo_' + Date.now()), B = 'http://127.0.0.1:' + PORT;
  const emailuri = [];
  const fals = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
      if (req.url.indexOf('/v3/smtp/email') === 0) { emailuri.push(j); res.writeHead(201, { 'content-type': 'application/json' }); return res.end('{"messageId":"<m@b>"}'); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"email":"cont@ratrack.ro","events":[]}');
    });
  });
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_demo', PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR,
    RATE_LIMIT_ENABLED: 'false', GEOCODE_URL: 'http://127.0.0.1:9/reverse', EMAIL_FROM: 'RA Track <contact@ratrack.ro>', BASE_URL: B, DEMO_ISTORIC_ZILE: '2',
    BREVO_API_KEY: 'xkeysib-proba', BREVO_API_URL: 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_FROM', 'DEMO_DISABLED', 'SUPPORT_EMAIL', 'DEMO_REQUEST_EMAIL']) delete env[k];
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'ignore'] });
  let mort = false; srv.on('exit', () => { mort = true; });
  const J = async (m, u, ck, body) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}), body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  const login = async (u, pw) => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) }); return r.ok ? r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') : null; };
  const cerere = (nume, email) => J('POST', '/api/public/demo-request', null, { name: nume, company: 'Transport Pop SRL', email, message: 'Vrem să vedem aplicația.', wants_demo: true, consent: true, ts: Date.now() - 8000 });
  try {
    let gata = false;
    for (let i = 0; i < 240 && !mort; i++) { try { if ((await fetch(B + '/api/health')).ok) { gata = true; break; } } catch (e) {} await sleep(250); }
    if (!gata) throw new Error('serverul n-a pornit');
    await sleep(1200);
    const S = await login('admin', 'test1234');
    T('fără conturi demo, simulatorul stă', ((await J('GET', '/api/admin/demo-sim', S)).j || {}).running === false);
    // Linkurile din emailurile trimise înainte de 19.11 („…/app,” „…/app.”) duc tot în aplicație.
    const rv = await fetch(B + '/app,', { redirect: 'manual' }), rp = await fetch(B + '/app.', { redirect: 'manual' }), ra = await fetch(B + '/app', { redirect: 'manual' });
    T('„/app,” și „/app.” (din emailurile vechi) duc în aplicație; „/app” rămâne pagina', rv.status === 301 && /\/app$/.test(rv.headers.get('location') || '') && rp.status === 301 && ra.status === 200,
      [rv.status, rv.headers.get('location'), rp.status, ra.status]);
    await cerere('Andrei Pop', 'andrei@transportpop.ro');
    let lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    const id1 = (lst.find((r) => r.email === 'andrei@transportpop.ro') || {}).id;
    const ap = await J('POST', '/api/admin/demo-requests/' + id1 + '/approve', S, { hours: 168 });
    T('aprobarea: 7 zile, emailul a plecat', ap.s === 200 && ap.j.duration === '7 zile' && ap.j.invited === true, ap.j);
    await sleep(800);
    const inv = emailuri.find((x) => (x.to || []).some((t) => t.email === 'andrei@transportpop.ro'));
    const txt = inv ? String(inv.textContent || '') : '';
    T('omul primește emailul contului DEMO (subiect, cât ține, RA Insight, linkul)', !!inv && inv.subject === 'Contul tău demo RA Track' && /Îl ai 7 zile/.test(txt) && /RA Insight, pe butoane/.test(txt) && /set-password\.html\?token=/.test(txt) && !/administrezi/.test(txt), inv && inv.subject);
    const token = (txt.match(/token=([0-9a-f]+)/) || [])[1];
    T('își pune parola din link', (await J('POST', '/api/auth/set-password', null, { token, password: 'Camion-Verde-2026!' })).s === 200);
    const D = await login('andrei@transportpop.ro', 'Camion-Verde-2026!');
    const me = (await J('GET', '/api/me', D)).j || {};
    T('/api/me: are RA Insight (aiCont) și banda „Cont demo”', me.aiCont === true && me.demo && /^Cont demo · îl ai până /.test(me.demo.text) && me.demo.buton === 'Cere ofertă', { aiCont: me.aiCont, demo: me.demo });
    let st = null;
    for (let i = 0; i < 180; i++) { st = (await J('GET', '/api/admin/demo-sim', S)).j; if (st && st.istoric && st.istoric.gata) break; await sleep(500); }
    T('simulatorul pornește („1 cont demo activ”) și umple istoricul', st && st.running === true && st.reason === '1 cont demo activ' && st.istoric && st.istoric.gata && st.istoric.umplute > 500 && !st.istoric.eroare, st);
    const dev = (await J('GET', '/api/devices', D)).j || [];
    T('contul demo vede cele 8 mașini, cu numele și numărul de pe site', dev.length === 8 && flota.MASINI.every((m) => dev.some((d) => d.imei === m.imei && d.plate === m.nr && d.name === m.nume && d.vehicle_type === m.tip)), dev.map((d) => [d.imei, d.name, d.plate]));
    T('… cu grupele lor', dev.filter((d) => d.group_name).length === 8);
    const sof = (await J('GET', '/api/drivers', D)).j || [];
    T('șoferii flotei de probă (7)', flota.SOFERI.every((s) => sof.some((d) => d.name === s.nume)), sof.map((d) => d.name));
    const doc = (await J('GET', '/api/documents', D)).j || [];
    T('actele flotei de probă (ITP, RCA, rovinietă…)', Array.isArray(doc) && doc.length >= flota.ACTE.length, Array.isArray(doc) ? doc.length : doc);
    const de = new Date(Date.now() - 2 * 86400000).toISOString(), pana = new Date().toISOString();
    let nCurse = 0; for (const m of flota.MASINI) { const t = (await J('GET', '/api/trips/' + m.imei + '?from=' + encodeURIComponent(de) + '&to=' + encodeURIComponent(pana), D)).j; nCurse += Array.isArray(t) ? t.length : 0; }
    T('cursele zilelor de probă sunt socotite', nCurse > 0, nCurse);
    // RA Insight, ca pe Start: pe butoane, fără model, numărat pe cont
    const q = async (ck, text) => { const r = await J('POST', '/api/insight/intreaba', ck, { message: text, nou: true }); return r.j || {}; };
    const r1 = await q(D, 'Câți km a făcut B 77 TIR ieri?');
    T('RA Insight răspunde pe butoane (Start, fără model)', r1.source === 'reguli' && r1.insigna && r1.insigna.eticheta === 'Instant' && r1.pachet && r1.pachet.cod === 'start' && r1.pachet.ramase === 49, { src: r1.source, ins: r1.insigna, pachet: r1.pachet, reply: String(r1.reply || '').slice(0, 160) });
    const r2 = await q(D, 'De ce a consumat mult B 90 CTR?');
    T('o întrebare liberă primește mesajul de Start (de la Basic), nu modelul', /răspund la ea de la pachetul \*\*Basic\*\*/.test(String(r2.reply || '')), String(r2.reply || '').slice(0, 160));
    const azi = await J('GET', '/api/insight/azi', D);
    T('„Azi la tine” se deschide (nu mai e „cere-i acces administratorului”)', azi.s === 200 && Array.isArray(azi.j && azi.j.randuri), azi.s);
    // al doilea cont demo: cele 50 ale lui
    await cerere('Maria Ionescu', 'maria@exemplu.ro');
    lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    const id2 = (lst.find((r) => r.email === 'maria@exemplu.ro') || {}).id;
    await J('POST', '/api/admin/demo-requests/' + id2 + '/approve', S, { hours: 24 });
    await sleep(800);
    const inv2 = emailuri.find((x) => (x.to || []).some((t) => t.email === 'maria@exemplu.ro'));
    const tok2 = (String(inv2 && inv2.textContent || '').match(/token=([0-9a-f]+)/) || [])[1];
    await J('POST', '/api/auth/set-password', null, { token: tok2, password: 'Duba-Rosie-2026!' });
    const M = await login('maria@exemplu.ro', 'Duba-Rosie-2026!');
    const r3 = await q(M, 'Câți km a făcut B 204 RAT ieri?');
    T('fiecare cont demo are cele 50 de răspunsuri ale lui (al doilea: tot 49)', r3.pachet && r3.pachet.ramase === 49, r3.pachet);
    T('„2 conturi demo active”', ((await J('GET', '/api/admin/demo-sim', S)).j || {}).reason === '2 conturi demo active');
    // agenții, pe datele din bază: actele și reviziile (nu depind de ora probei)
    const run = await J('POST', '/api/agents/run', D, { agent: 'all' });
    const ft = ((run.j && run.j.findings) || []).map((f) => f.title);
    T('agenții găsesc pe flota demo actele și revizia (ITP B 77 TIR, rovinieta B 18 VAN, revizia B 90 CTR)', run.s === 200 && ft.some((t) => /B 77 TIR\): ITP expiră în 12 zile/.test(t)) && ft.some((t) => /B 18 VAN\): ROVINIETĂ EXPIRAT/.test(t)) && ft.some((t) => /B 90 CTR\): Revizie generală în \d+ km/.test(t)), ft);
    // „Prelungește”
    T('„Prelungește” cere super-admin', (await J('POST', '/api/admin/demo-requests/' + id1 + '/prelungeste', D, { hours: 720 })).s === 403);
    const pr = await J('POST', '/api/admin/demo-requests/' + id1 + '/prelungeste', S, { hours: 720 });
    T('„Prelungește” cu 30 de zile: contul și cererea au data nouă, omul primește email', pr.s === 200 && pr.j.duration === '30 de zile' && pr.j.email === true && Math.abs(pr.j.accessUntil - (Date.now() + 720 * 3600000)) < 60000 && /merge până pe/.test(pr.j.text), pr.j);
    await sleep(500);
    T('emailul prelungirii', emailuri.some((x) => x.subject === 'Contul tău demo RA Track a fost prelungit' && (x.to || []).some((t) => t.email === 'andrei@transportpop.ro')));
    lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    T('lista „Cereri demo” arată noua dată', Math.abs(Number((lst.find((r) => r.id === id1) || {}).access_until) - pr.j.accessUntil) < 5);
    await cerere('Ion Nou', 'ion@nou.ro');
    lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    const id3 = (lst.find((r) => r.email === 'ion@nou.ro') || {}).id;
    T('o cerere neaprobată nu se prelungește (400)', (await J('POST', '/api/admin/demo-requests/' + id3 + '/prelungeste', S, { hours: 24 })).s === 400);
    // Omul care n-a intrat încă (linkul n-a ajuns ori a expirat): „Prelungește” îi trimite din nou emailul contului demo, cu un link NOU.
    T('„Prelungește” la omul care a intrat deja: emailul prelungirii, fără link nou', pr.j.linkNou === false, pr.j);
    const ap3 = await J('POST', '/api/admin/demo-requests/' + id3 + '/approve', S, { hours: 24 });
    T('a treia cerere, aprobată pe 24 de ore', ap3.s === 200 && ap3.j.invited === true, ap3.j);
    const inainte = emailuri.length;
    const pr3 = await J('POST', '/api/admin/demo-requests/' + id3 + '/prelungeste', S, { hours: 168 });
    await sleep(500);
    const nou3 = emailuri.slice(inainte).filter((x) => (x.to || []).some((t) => t.email === 'ion@nou.ro'));
    const tok3 = nou3[0] ? (String(nou3[0].textContent || '').match(/token=([0-9a-f]+)/) || [])[1] : null;
    T('„Prelungește” la omul care n-a intrat încă: emailul contului demo, cu un link NOU de parolă', pr3.s === 200 && pr3.j.linkNou === true && pr3.j.email === true
      && nou3.length === 1 && nou3[0].subject === 'Contul tău demo RA Track' && /Îl ai 7 zile/.test(String(nou3[0].textContent || '')) && !!tok3
      && /N-a intrat încă în cont: i-am trimis pe email un link nou de parolă\./.test(pr3.j.text), { j: pr3.j, subiecte: nou3.map((x) => x.subject) });
    T('linkul nou merge: își pune parola și intră', !!tok3 && (await J('POST', '/api/auth/set-password', null, { token: tok3, password: 'Duba-Verde-2026!' })).s === 200
      && !!(await login('ion@nou.ro', 'Duba-Verde-2026!')));

    // 20.11 (Alin: „3. da”): contul demo expirat de peste 30 de zile se șterge; cel expirat de mai puțin rămâne (îl putem prelungi).
    lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    const uMaria = (lst.find((r) => r.id === id2) || {}).user_id, uIon = (lst.find((r) => r.id === id3) || {}).user_id;
    const ZI = 86400000;
    await J('PUT', '/api/users/' + uMaria + '/access-until', S, { until: Date.now() - (cont.ZILE_DUPA_EXPIRARE + 1) * ZI });
    await J('PUT', '/api/users/' + uIon + '/access-until', S, { until: Date.now() - 10 * ZI });
    T('ștergerea conturilor expirate cere super-admin', (await J('POST', '/api/admin/demo/sterge-expirate', D)).s === 403);
    const sx = await J('POST', '/api/admin/demo/sterge-expirate', S);
    lst = (await J('GET', '/api/admin/demo-requests', S)).j || [];
    const rqMaria = lst.find((r) => r.id === id2) || {}, rqIon = lst.find((r) => r.id === id3) || {};
    T('expirat de 31 de zile → șters (cererea rămâne, fără cont și fără „Prelungește”); expirat de 10 zile → rămâne',
      sx.s === 200 && sx.j.sterse === 1 && sx.j.zile === 30 && rqMaria.id === id2 && rqMaria.user_id == null && rqIon.user_id === uIon
      && (await J('POST', '/api/admin/demo-requests/' + id2 + '/prelungeste', S, { hours: 24 })).s === 400, { sx: sx.j, maria: rqMaria.user_id, ion: rqIon.user_id });
    T('…iar contul șters nu mai intră', !(await login('maria@exemplu.ro', 'Duba-Rosie-2026!')));
    const jur = (await J('GET', '/api/audit?limit=50', S)).j || [];
    const rj = (Array.isArray(jur) ? jur : (jur.rows || jur.items || [])).find((a) => a.entity === 'conturi_demo_expirate');
    T('rând în jurnal cu câte au plecat, fără nume sau adrese', !!rj && !/maria/i.test(JSON.stringify(rj)), rj);

    // 20.11 (Alin: „4. o rezolvăm acum”): contul adevărat pe adresa unui cont demo — contul demo pleacă, cel nou îi ia locul.
    const firma = (await J('POST', '/api/companies', S, { name: 'Transport Pop SRL' })).j || {};
    const inainteAdm = emailuri.length;
    const adm = await J('POST', '/api/companies/' + firma.id + '/admin', S, { username: 'andrei@transportpop.ro', full_name: 'Andrei Pop' });
    T('administratorul firmei, pe adresa contului demo: se face (nu mai „Există deja un cont”) și o spune',
      adm.s === 200 && adm.j.demoInlocuit === true && adm.j.nota === cont.TEXT_INLOCUIT && adm.j.role === 'company_admin' && adm.j.company_id === firma.id, adm.j);
    T('…contul demo a plecat: sesiunea lui nu mai merge, cererea rămâne fără cont', (await J('GET', '/api/me', D)).s === 401
      && (((await J('GET', '/api/admin/demo-requests', S)).j || []).find((r) => r.id === id1) || {}).user_id == null);
    await sleep(500);
    T('…omul primește invitația de administrator (nu emailul contului demo)', emailuri.slice(inainteAdm).some((x) => (x.to || []).some((t) => t.email === 'andrei@transportpop.ro') && /^Invitație RA Track/.test(x.subject || '')));
    T('pe un cont ADEVĂRAT refuzul rămâne (409), oricât s-ar încerca', (await J('POST', '/api/companies/' + firma.id + '/admin', S, { username: 'andrei@transportpop.ro' })).s === 409
      && (await J('POST', '/api/users', S, { username: 'andrei@transportpop.ro', full_name: 'Andrei', role: 'viewer', company_id: firma.id })).s === 409);
    const om = await J('POST', '/api/users', S, { username: 'ion@nou.ro', full_name: 'Ion Nou', role: 'dispatcher', company_id: firma.id });
    T('la fel din Utilizatori: contul demo al lui Ion e înlocuit de contul lui în firmă', om.s === 200 && om.j.demoInlocuit === true && om.j.company_id === firma.id
      && (((await J('GET', '/api/admin/demo-requests', S)).j || []).find((r) => r.id === id3) || {}).user_id == null, om.j);
    T('fără conturi demo, simulatorul se oprește', ((await J('GET', '/api/admin/demo-sim', S)).j || {}).running === false);
  } finally {
    try { srv.kill(); } catch (e) {}
    try { fals.close(); } catch (e) {}
    await sleep(400);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
}
