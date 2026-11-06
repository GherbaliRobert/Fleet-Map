// verify_soferi_istoric.js — șoferul pus pe o mașină și istoricul șoferi ↔ mașini (05.11).
// Alin, cu o poză (B 112 RFG, „Șofer: Nealocat"): „am pus șofer pe mașină în Management → Vehicule… în Șoferi apare, iar pe hartă
// îmi apare șofer nealocat" + „aș vrea ca șoferul să aibă istoric pe ce mașini a fost pus — la fel și în vehicule".
//
//   node verify_soferi_istoric.js
//
// Ce păzește:
//   1. pagina: salvarea fișei CITEȘTE răspunsul atribuirii (refuzul nu mai tace); lista de șoferi / grupe din fișă = ale firmei
//      mașinii; istoricul în fișa mașinii și a șoferului, pus ca text; lista Șoferi nu leagă un șofer de mașina altei firme;
//      telefonul: lista din fișă tot doar cu șoferii firmei; fișa șoferului (06.11, Alin: „când dau să mut șoferul pe altă companie
//      nu mă lasă"): firma schimbată de noi se mută pe calea „Mută între companii", după o întrebare (funcția paginii, rulată);
//      la noi, fișa mașinii spune a cui e lista de șoferi; fișa șoferului rearanjată (06.11): „Companie" sus, „Anulează" + „Salvează"
//      jos, în dreapta;
//   2. textele istoricului (soferi_masini.randIstoric): „de la început → acum", „12.10, 09:14 → acum · 24 de zile", anul altui an;
//   3. pe server pornit: legăturile vechi cu altă firmă se rup la pornire (cu jurnal), refuzul unui șofer din altă firmă, istoricul
//      după două schimbări, mutarea mașinii pe altă firmă (șoferul și grupa firmei vechi pleacă, istoricul se închide), cine vede ce.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = 3542, TCP = 5542, B = 'http://127.0.0.1:' + PORT;
const DIR = process.env.PGLITE_DIR || path.join(os.tmpdir(), 'rax_soferi_istoric_' + process.pid);

// ── Faza 1: legături vechi cu altă firmă, puse direct în bază (cum rămăseseră după mutarea unei mașini) ──
if (process.argv.indexOf('--faza=seed') >= 0) {
  process.env.TZ = 'UTC';
  (async () => {
    const db = require('./db');
    await db.initDb();
    const q = (sql, p) => db.pool.query(sql, p || []);
    const firma = async (nume, slug) => (await q('INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id', [nume, slug])).rows[0].id;
    const fa = await firma('Trans Alfa SRL', 'trans-alfa'), fb = await firma('Beta Logistic SRL', 'beta-logistic');
    const sofer = async (nume, co) => (await q('INSERT INTO drivers (name, company_id) VALUES ($1, $2) RETURNING id', [nume, co])).rows[0].id;
    const da0 = await sofer('Petre Alfa', fa), da1 = await sofer('Ion Alfa', fa), da2 = await sofer('Mihai Alfa', fa), db1 = await sofer('Vasile Beta', fb);
    const grupa = async (nume, co) => (await q('INSERT INTO device_groups (name, company_id) VALUES ($1, $2) RETURNING id', [nume, co])).rows[0].id;
    const ga = await grupa('Dube Alfa', fa), gb = await grupa('Dube Beta', fb), gp = await grupa('Platforma', null);
    // V: mutată de la Alfa la Beta cu codul de dinainte, care lăsa pe ea șoferul și grupa Alfa (legătura veche);
    // W: mașina Alfa, cu grupa platformei (rămâne) și fără niciun șofer până acum.
    await q("INSERT INTO devices (imei, name, plate, company_id, driver_id, group_id) VALUES ('350000000097001', 'VW Passat B7', 'B 112 RFG', $1, $2, $3)", [fb, da0, ga]);
    await q("INSERT INTO devices (imei, name, plate, company_id, driver_id, group_id) VALUES ('350000000097002', 'Dacia Logan', 'B 154 UIP', $1, NULL, $2)", [fa, gp]);
    await q("INSERT INTO istoric_soferi (imei, driver_id, de_la) VALUES ('350000000097001', $1, 0)", [da0]);
    console.log('SEED ' + JSON.stringify({ fa, fb, da0, da1, da2, db1, ga, gb, gp }));
    await db.closeDb();
    process.exit(0);
  })().catch((e) => { console.log('SEED-EROARE ' + ((e && e.stack) || e)); process.exit(1); });
  return;
}

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 400) : '')); }
}
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  console.log('\n1. Pagina și telefonul');
  const PAG = citeste('public/index.html');
  const save = (PAG.match(/async function saveDevice\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  T('salvarea fișei citește răspunsul atribuirii și spune refuzul (fereastra rămâne deschisă)', /const _ra = await fetch\('\/api\/devices\/' \+ imei \+ '\/assign'/.test(save) &&
    /if \(!_ra\.ok\) \{[\s\S]*?alert\(\(_e\.error \|\| 'Șoferul sau grupa nu s-au putut salva\.'\) \+ ' Restul fișei s-a salvat\.'\);\s*return;/.test(save) && !/\n      await fetch\('\/api\/devices\/' \+ imei \+ '\/assign'/.test(save));
  const pop = (PAG.match(/async function populateEditGroupsDrivers\(groupId, driverId, companyId\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  T('fișa mașinii: doar șoferii și grupele firmei ei (grupele platformei doar la noi), numele ca text', pop.length > 100 &&
    /const soferi = co == null \? \[\] : \(Array\.isArray\(drivers\) \? drivers : \[\]\)\.filter\(d => String\(d\.company_id\) === co\);/.test(pop) &&
    /g\.company_id == null \? laNoi : \(co != null && String\(g\.company_id\) === co\)/.test(pop) && /\$\{esc\(d\.name\)\}/.test(pop) && /\$\{esc\(g\.name\)\}/.test(pop) &&
    /populateEditGroupsDrivers\(dev\.group_id, dev\.driver_id, dev\.company_id\)/.test(PAG));
  T('…și spune de ce lista e goală (mașina fără firmă / firma fără șoferi)', /Mașina nu e pe nicio firmă: șoferul se pune după ce o treci pe o firmă\./.test(pop) && /Firma mașinii n-are încă șoferi: îi adaugi din Management → Șoferi\./.test(pop));
  T('…iar la noi (lista Șoferi amestecă firmele) spune a cui e lista și de unde muți un șofer de la altă firmă (06.11)',
    /const firma = laNoi && co != null \? \(\(\(await ensureAdminCompanies\(\)\) \|\| \[\]\)\.find\(c => String\(c\.id\) === co\) \|\| \{\}\)\.name : '';/.test(pop) &&
    /'Apar doar șoferii firmei „' \+ firma \+ '”, a mașinii\. Un șofer de la altă firmă îl muți întâi din fișa lui \(Management → Șoferi → creionul → Companie\)\.'/.test(pop));

  // Fișa șoferului (06.11; Alin: „când dau să mut șoferul pe altă companie nu mă lasă"): caseta „Companie" se vedea la editare, dar
  // firma pleca doar la un șofer nou. Funcția paginii, RULATĂ pe cazuri, cu ce trimite spre server.
  const vm = require('vm');
  const saveDrv = (PAG.match(/async function saveDriver\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  async function salveazaSofer(caz) {
    const el = {};
    const pune = (k, v) => { el[k] = { value: v, style: {} }; };
    pune('drv-id', caz.id); pune('drv-name', 'POPESCU IONUT'); pune('drv-phone', ''); pune('drv-email', ''); pune('drv-license', '1234');
    pune('drv-expiry', ''); pune('drv-photo-data', ''); el['drv-form'] = { style: {} };
    const firme = { 1: 'Compania mea', 2: 'Unitip Test' };
    el['drv-company'] = { value: caz.co, options: [{ text: firme[caz.co] || '' }], selectedIndex: 0 };
    const cereri = [], intrebari = [], alerte = [], mesaje = [];
    const ctx = {
      document: { getElementById: (k) => el[k] || null }, currentUser: { isSuper: !!caz.super }, _drvCats: ['B'],
      _driversAll: [{ id: 7, name: 'POPESCU IONUT', company_id: 2, company_name: 'Unitip Test' }],
      driverVehicles: (id, co) => (String(id) === '7' && String(co) === '2' ? (caz.masini || []).map((m) => ({ label: m })) : []),
      raConfirm: async (t, o) => { intrebari.push([t, o && o.okLabel]); return caz.raspuns !== false; },
      fetch: async (u, o) => { cereri.push({ u, m: o.method, b: JSON.parse(o.body) }); return { ok: true, json: async () => ({ ok: true }) }; },
      alert: (t) => { alerte.push(t); }, resetDriverForm: () => {}, loadDrivers: async () => {}, encodeURIComponent, parseInt, String, JSON,
    };
    ctx.window = { raxToast: (t) => mesaje.push(t) }; ctx.raxToast = ctx.window.raxToast;
    vm.createContext(ctx);
    vm.runInContext(saveDrv + '\nthis.__salveaza = saveDriver;', ctx);
    await ctx.__salveaza();
    return { cereri, intrebari, alerte, mesaje };
  }
  const m1 = await salveazaSofer({ super: true, id: '7', co: '1' });
  T('fișa șoferului, fondatorul, firma schimbată: întâi fișa (fără firmă în ea), apoi mutarea pe calea „Mută între companii"',
    m1.cereri.length === 2 && m1.cereri[0].u === '/api/drivers/7' && m1.cereri[0].m === 'PUT' && !('company_id' in m1.cereri[0].b) &&
    m1.cereri[1].u === '/api/drivers/7/company' && m1.cereri[1].m === 'PUT' && m1.cereri[1].b.company_id === 1 && m1.alerte.length === 0, JSON.stringify(m1));
  T('…după o întrebare care spune de unde și unde („Mută"), iar la capăt „Șoferul e acum la „Compania mea" ✓"', m1.intrebari.length === 1 &&
    m1.intrebari[0][0] === 'Muți șoferul „POPESCU IONUT” de la „Unitip Test” la „Compania mea”? Apoi îl pui pe o mașină a firmei noi, din fișa mașinii.' &&
    m1.intrebari[0][1] === 'Mută' && m1.mesaje[0] === 'Șoferul e acum la „Compania mea” ✓', JSON.stringify([m1.intrebari, m1.mesaje]));
  const m2 = await salveazaSofer({ super: true, id: '7', co: '1', masini: ['B 204 UIP'] });
  T('…un șofer pus pe o mașină: întrebarea spune că iese de pe ea și că mașina rămâne la firma ei',
    m2.intrebari.length === 1 && m2.intrebari[0][0].indexOf(' Iese de pe B 204 UIP (mașina rămâne la firma ei).') > 0, JSON.stringify(m2.intrebari));
  const m3 = await salveazaSofer({ super: true, id: '7', co: '1', raspuns: false });
  T('…„Nu" la întrebare: nu pleacă nimic spre server', m3.cereri.length === 0 && m3.intrebari.length === 1, JSON.stringify(m3));
  const m4 = await salveazaSofer({ super: true, id: '7', co: '2' });
  T('aceeași firmă: doar fișa, fără întrebare și fără mutare', m4.cereri.length === 1 && m4.cereri[0].u === '/api/drivers/7' && m4.intrebari.length === 0, JSON.stringify(m4));
  const m5 = await salveazaSofer({ super: false, id: '7', co: '1' });
  T('clientul (caseta „Companie" nu e a lui): doar fișa, fără firmă', m5.cereri.length === 1 && !('company_id' in m5.cereri[0].b) && m5.intrebari.length === 0, JSON.stringify(m5));
  const m6 = await salveazaSofer({ super: true, id: '', co: '1' });
  T('șofer nou (fondatorul): firma pleacă odată cu el, ca înainte', m6.cereri.length === 1 && m6.cereri[0].u === '/api/drivers' && m6.cereri[0].m === 'POST' && m6.cereri[0].b.company_id === 1, JSON.stringify(m6));
  T('la deschiderea fișei, caseta ia firma de ACUM a șoferului (fără firmă = goală, nu firma celui deschis înainte)',
    /var _coSel = document\.getElementById\('drv-company'\); if \(_coSel\) _coSel\.value = d\.company_id != null \? String\(d\.company_id\) : '';/.test(PAG));
  T('istoricul: în fișa mașinii și în fișa șoferului, desenat ca text (fără innerHTML)', /istoricIncarca\(document\.getElementById\('edit-istoric-soferi'\), '\/api\/devices\/' \+ encodeURIComponent\(imei\) \+ '\/istoric-soferi', 'masina'\)/.test(PAG) &&
    /istoricIncarca\(document\.getElementById\('drv-istoric'\), '\/api\/drivers\/' \+ encodeURIComponent\(d\.id\) \+ '\/istoric-masini', 'sofer'\)/.test(PAG) &&
    /id="edit-istoric-soferi"/.test(PAG) && /id="drv-istoric"/.test(PAG) && !/innerHTML/.test((PAG.match(/function istoricDeseneaza\(box, j, fel\) \{[\s\S]*?\n    \}\n/) || [''])[0]));
  T('lista Șoferi: un șofer nu apare pe mașina altei firme (ca fișa și rapoartele)', /function driverVehicles\(driverId, driverCompanyId\) \{/.test(PAG) && /driverVehicles\(d\.id, d\.company_id\)/.test(PAG) &&
    /if \(driverCompanyId != null && d\.company_id !== undefined && String\(d\.company_id\) !== String\(driverCompanyId\)\) return;/.test(PAG));
  const VD = citeste('mobile/src/screens/VehicleDetail.tsx');
  T('telefonul: lista din fișa mașinii tot doar cu șoferii firmei ei', /soferiFirmei\(drivers, \(full as any\)\?\.company_id\)\.map/.test(VD) && /export function soferiFirmei\(drivers: any\[\], companyId: any\): any\[\] \{/.test(VD));
  const IST = citeste('mobile/src/components/IstoricSoferi.tsx'), AD = citeste('mobile/src/screens/AdminDrivers.tsx'), EP = citeste('mobile/src/api/endpoints.ts');
  T('telefonul: istoricul în fișa mașinii și a șoferului, cu textele serverului (fără titluri scrise în telefon)',
    /<IstoricSoferi cheie=\{imei\} cere=\{\(\) => Api\.istoricSoferiMasina\(imei\)\} fel="masina" \/>/.test(VD) &&
    /\{form\.id != null && <IstoricSoferi cheie=\{String\(form\.id\)\} cere=\{\(\) => Api\.istoricMasiniSofer\(Number\(form\.id\)\)\} fel="sofer" \/>\}/.test(AD) &&
    /istoricSoferiMasina: \(imei: string\) => api<any>\(`\/api\/devices\/\$\{encodeURIComponent\(imei\)\}\/istoric-soferi`\)/.test(EP) &&
    /istoricMasiniSofer: \(id: number\) => api<any>\(`\/api\/drivers\/\$\{id\}\/istoric-masini`\)/.test(EP) && IST.indexOf('Istoricul șoferilor') < 0 && IST.indexOf('Istoricul mașinilor') < 0);
  const CSS = citeste('public/css/app.css');
  T('istoricul pe culorile temei (fără culori de text scrise de mână)', /\.vist \{[^}]*background: var\(--bg-dark\);/.test(CSS) && /\.vist-cine b \{[^}]*color: var\(--text-primary\);/.test(CSS) && /\.vist-cand \{[^}]*color: var\(--text-secondary\);/.test(CSS));

  // Fișa șoferului rearanjată (06.11, Alin: „da" la macheta casetelor): „Companie" sus, „Anulează" + „Salvează" jos, în dreapta.
  const FORM = (PAG.match(/<div class="admin-add" id="drv-form"[\s\S]*?\n {10}<\/div>\n {8}<\/div>/) || [''])[0];
  const iTitlu = FORM.indexOf('id="drv-form-title"'), iFirma = FORM.indexOf('id="drv-company"'), iNume = FORM.indexOf('id="drv-name"'), iJos = FORM.indexOf('class="drv-jos"');
  T('fișa șoferului: „Companie" imediat sub titlu, pe toată lățimea, înaintea numelui (doar la fondator)',
    iTitlu > 0 && iFirma > iTitlu && iFirma < iNume && /<label class="super-only" style="grid-column:1\/-1;"><span>Companie \*<\/span><select id="drv-company"/.test(FORM));
  T('…jos, în dreapta: „Anulează" apoi „Salvează" (fără ↺)', iJos > iNume && /<button type="button" class="btn-sm" id="drv-reset-btn" onclick="anuleazaSofer\(\)">Anulează<\/button>\s*<button type="button" class="btn-sm btn-primary" onclick="saveDriver\(\)"><i class="fas fa-save"><\/i> <span id="drv-btn">Adaugă<\/span><\/button>/.test(FORM) && FORM.indexOf('↺') < 0);
  const anuleaza = (PAG.match(/function anuleazaSofer\(\) \{[\s\S]*?\n {4}\}/) || [''])[0];
  T('…„Anulează" golește fișa și o închide, fără să salveze', /resetDriverForm\(\);/.test(anuleaza) && /f\.style\.display = 'none'/.test(anuleaza) && !/fetch\(/.test(anuleaza));
  T('…rândul de jos: butoane de 42 px, cât jumătate fiecare pe telefon', /#drv-form \.drv-jos \.btn-sm \{ height: 42px;/.test(PAG) && /@media \(max-width: 480px\) \{ #drv-form \.drv-jos \.btn-sm \{ flex: 1 1 0; min-width: 0; \} \}/.test(PAG));
  T('…„Categorii permis" scris ca celelalte etichete ale fișei', /font-size:12\.5px;font-weight:700;color:var\(--text-secondary\);">Categorii permis<\/span>/.test(FORM));

  console.log('\n2. Textele istoricului');
  const S = require('./soferi_masini');
  const a = Date.parse('2026-11-05T13:00:00Z');
  const r1 = S.randIstoric({ de_la: 0, pana_la: null }, a), r2 = S.randIstoric({ de_la: Date.parse('2026-10-12T06:14:00Z'), pana_la: null }, a);
  const r3 = S.randIstoric({ de_la: Date.parse('2025-12-30T06:14:00Z'), pana_la: Date.parse('2026-11-05T12:20:00Z') }, a);
  T('primul șofer: „de la început → acum", fără durată', r1.text === 'de la început → acum' && r1.durata === '' && r1.curent === true, JSON.stringify(r1));
  T('o schimbare din anul ăsta: „12.10, 09:14 → acum" · „24 de zile" (ora României)', r2.text === '12.10, 09:14 → acum' && r2.durata === '24 de zile', JSON.stringify(r2));
  T('din alt an: ziua întreagă; azi: „azi, HH:MM"', r3.text === '30.12.2025 → azi, 14:20' && r3.curent === false, JSON.stringify(r3));
  T('titlurile și nota stau în soferi_masini.js', S.ISTORIC.masina === 'Istoricul șoferilor' && S.ISTORIC.sofer === 'Istoricul mașinilor' && /Primul șofer al unei mașini e socotit „de la început"/.test(S.ISTORIC.nota));

  console.log('\n3. Pe server pornit');
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'soferi-istoric-proba', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false', EUR_RON_RATE: '5', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_TIMEOUT_MS: '300' });
  ['DATABASE_URL', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'ANTHROPIC_API_KEY'].forEach((k) => delete env[k]);
  const curata = () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const seed = spawnSync(process.execPath, [__filename, '--faza=seed'], { cwd: __dirname, env, encoding: 'utf8', timeout: 240000 });
  const ms = /SEED (\{.*\})/.exec(seed.stdout || '');
  T('pregătirea: legătura veche (B 112 RFG mutată la Beta, cu șoferul și grupa Alfa) e în bază', !!ms, String(seed.stdout || '').slice(-400) + String(seed.stderr || '').slice(-400));
  if (!ms) { curata(); return fin(); }
  const SD = JSON.parse(ms[1]);
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; srv.stderr.on('data', (d) => { err += d; });
  const sleep = (t) => new Promise((res) => setTimeout(res, t));
  const cere = async (m, u, ck, body) => { const res = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}), body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await res.json(); } catch (e) {} return { s: res.status, j }; };
  const login = async (u, p) => { const res = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return res.ok ? res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') : null; };
  try {
    let pornit = false;
    for (let i = 0; i < 240 && !pornit; i++) { try { pornit = (await fetch(B + '/api')).ok; } catch (e) {} if (!pornit) await sleep(500); }
    T('serverul pornește', pornit, err.slice(-300));
    if (!pornit) return;
    await sleep(800);
    const S1 = await login('admin', 'test1234');
    const V = '350000000097001', W = '350000000097002';
    const fv = (await cere('GET', '/api/devices/' + V + '/full', S1)).j, fw = (await cere('GET', '/api/devices/' + W + '/full', S1)).j;
    T('la pornire: șoferul și grupa altei firme au plecat de pe B 112 RFG; grupa platformei rămâne pe B 154 UIP',
      fv.driver_id == null && fv.group_id == null && Number(fw.group_id) === Number(SD.gp), JSON.stringify([fv.driver_id, fv.group_id, fw.group_id]));
    const aud = (await cere('GET', '/api/audit?limit=50', S1)).j;
    const randuriAudit = Array.isArray(aud) ? aud : (aud && (aud.rows || aud.items || aud.entries)) || [];
    T('…cu un rând în jurnal (cine: sistem, ce mașini)', JSON.stringify(randuriAudit).indexOf('legaturi_alta_firma') >= 0, JSON.stringify(randuriAudit).slice(0, 300));
    const h0 = (await cere('GET', '/api/devices/' + V + '/istoric-soferi', S1)).j;
    T('istoricul mașinii (acum la Beta) nu arată șoferul Alfa', Array.isArray(h0.randuri) && h0.randuri.length === 0 && h0.gol === S.ISTORIC.golMasina, JSON.stringify(h0));
    // Înapoi la Alfa: istoricul de atunci se vede din nou firmei Alfa (e al ei).
    await cere('PUT', '/api/devices/' + V + '/company', S1, { company_id: SD.fa });
    const hInapoi = (await cere('GET', '/api/devices/' + V + '/istoric-soferi', S1)).j;
    T('înapoi la Alfa: șoferul Alfa de dinainte apare în istoric, închis („de la început → azi, …")', (hInapoi.randuri || []).length === 1 && hInapoi.randuri[0].cine === 'Petre Alfa' &&
      /^de la început → azi, \d\d:\d\d$/.test(hInapoi.randuri[0].text) && hInapoi.randuri[0].curent === false, JSON.stringify(hInapoi.randuri));

    const ref = await cere('PUT', '/api/devices/' + V + '/assign', S1, { driver_id: SD.db1, group_id: null });
    T('atribuirea unui șofer din ALTĂ firmă: 404 cu motivul (pe care pagina îl arată acum)', ref.s === 404 && ref.j.error === 'Șoferul ales nu e în firma acestei mașini.', JSON.stringify(ref));
    const p1 = await cere('PUT', '/api/devices/' + V + '/assign', S1, { driver_id: SD.da1, group_id: SD.ga });
    const f1 = (await cere('GET', '/api/devices/' + V + '/full', S1)).j;
    T('un șofer al firmei: se pune, iar fișa (și balonul hărții) îl arată, nu „Nealocat"', p1.s === 200 && f1.driver_name === 'Ion Alfa', JSON.stringify([p1, f1.driver_name]));
    await sleep(1100);
    await cere('PUT', '/api/devices/' + V + '/assign', S1, { driver_id: SD.da2, group_id: SD.ga });
    const h1 = (await cere('GET', '/api/devices/' + V + '/istoric-soferi', S1)).j;
    const rh = h1.randuri || [];
    T('istoricul mașinii după două schimbări: cel de acum întâi („azi, … → acum"), apoi cei dinainte, cu cât a ținut', rh.length === 3 && rh[0].cine === 'Mihai Alfa' && rh[0].curent === true &&
      /^azi, \d\d:\d\d → acum$/.test(rh[0].text) && rh[1].cine === 'Ion Alfa' && rh[1].curent === false && /^azi, \d\d:\d\d → azi, \d\d:\d\d$/.test(rh[1].text) &&
      rh[1].durata === 'sub un minut' && rh[2].cine === 'Petre Alfa', JSON.stringify(rh));
    await cere('PUT', '/api/devices/' + W + '/assign', S1, { driver_id: SD.da1, group_id: SD.gp });
    const hw = (await cere('GET', '/api/devices/' + W + '/istoric-soferi', S1)).j;
    T('primul șofer al unei mașini fără istoric: „de la început → acum"', (hw.randuri || []).length === 1 && hw.randuri[0].text === 'de la început → acum' && hw.randuri[0].durata === '', JSON.stringify(hw.randuri));
    const hs = (await cere('GET', '/api/drivers/' + SD.da1 + '/istoric-masini', S1)).j;
    T('istoricul șoferului: mașinile (numărul, cu denumirea alături) — cea de acum întâi, apoi cea lăsată', (hs.randuri || []).length === 2 && hs.randuri[0].cine === 'B 154 UIP' && hs.randuri[0].curent === true &&
      hs.randuri[1].cine === 'B 112 RFG' && hs.randuri[1].nume === 'VW Passat B7' && hs.randuri[1].curent === false && hs.titlu === S.ISTORIC.sofer, JSON.stringify(hs.randuri));

    // Clientul firmei Alfa vede istoricul mașinii lui; nu și pe al unui șofer din altă firmă.
    const { puneParola } = require('./test_parola');
    const u = await cere('POST', '/api/users', S1, { username: 'admin@alfa.ro', full_name: 'Ana Alfa', role: 'company_admin', company_id: SD.fa });
    await puneParola(u.j, 'Str4da-Verde-2026', B);
    const C = await login('admin@alfa.ro', 'Str4da-Verde-2026');
    const hc = await cere('GET', '/api/devices/' + V + '/istoric-soferi', C);
    const hx = await cere('GET', '/api/drivers/' + SD.db1 + '/istoric-masini', C);
    T('clientul Alfa: vede istoricul mașinii lui (3 rânduri); șoferul altei firme = 403', hc.s === 200 && (hc.j.randuri || []).length === 3 && hx.s === 403, JSON.stringify([hc.s, (hc.j.randuri || []).length, hx.s]));

    // Mutarea mașinii pe firma Beta: șoferul și grupa Alfa pleacă, rândul deschis se închide; Beta nu vede șoferii Alfa.
    const mv = await cere('PUT', '/api/devices/' + V + '/company', S1, { company_id: SD.fb });
    const f2 = (await cere('GET', '/api/devices/' + V + '/full', S1)).j;
    T('mutată pe altă firmă: fără șoferul și grupa firmei vechi', mv.s === 200 && f2.driver_id == null && f2.group_id == null && Number(f2.company_id) === Number(SD.fb), JSON.stringify([mv.s, f2.driver_id, f2.group_id, f2.company_id]));
    const h2 = (await cere('GET', '/api/devices/' + V + '/istoric-soferi', S1)).j;
    T('…istoricul ei nu-i arată firmei noi șoferii celei vechi', (h2.randuri || []).length === 0, JSON.stringify(h2.randuri));
    const hs2 = (await cere('GET', '/api/drivers/' + SD.da2 + '/istoric-masini', S1)).j;
    T('…iar la șoferul Alfa mașina plecată nu mai apare (e a altei firme)', (hs2.randuri || []).length === 0, JSON.stringify(hs2.randuri));
    const h3 = (await cere('GET', '/api/devices/' + V + '/istoric-soferi', S1)).j;
    T('…și rândul șoferului de atunci s-a închis la mutare (vede din nou Alfa, dacă se întoarce)', h3.randuri && h3.randuri.length === 0, JSON.stringify(h3.randuri));
    const hc2 = await cere('GET', '/api/devices/' + V + '/istoric-soferi', C);
    T('clientul Alfa nu mai vede istoricul mașinii mutate (403)', hc2.s === 403, hc2.s);

    // Firma unui șofer (06.11): o mută doar fondatorul, pe calea pe care o cheamă acum și fișa șoferului; mutat la firma mașinii, se pune.
    const mc = await cere('PUT', '/api/drivers/' + SD.db1 + '/company', C, { company_id: SD.fa });
    T('clientul nu mută șoferi între firme (403)', mc.s === 403, mc.s);
    const inainte = await cere('PUT', '/api/devices/' + W + '/assign', S1, { driver_id: SD.db1, group_id: SD.gp });
    const ms2 = await cere('PUT', '/api/drivers/' + SD.db1 + '/company', S1, { company_id: SD.fa });
    const pw = await cere('PUT', '/api/devices/' + W + '/assign', S1, { driver_id: SD.db1, group_id: SD.gp });
    const fw2 = (await cere('GET', '/api/devices/' + W + '/full', S1)).j;
    T('șoferul altei firme e refuzat pe mașină; mutat la firma ei (cum face acum fișa lui), se pune și fișa mașinii îl arată',
      inainte.s === 404 && ms2.s === 200 && pw.s === 200 && fw2.driver_name === 'Vasile Beta', JSON.stringify([inainte.s, ms2.s, pw.s, fw2.driver_name]));
  } finally {
    try { srv.kill(); } catch (e) {}
    await sleep(700); curata();
  }
  fin();
})();

function fin() {
  console.log('\n' + (rele ? '✗' : '✓') + ' verify_soferi_istoric: ' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
