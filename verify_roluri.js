// verify_roluri.js — „Roluri" (Setări → Oameni și drepturi), pe server pornit.
//
//   node verify_roluri.js
//
// Aici se joacă cine ce are voie să facă. Regula pe care o apărăm e una singură, dar e totul:
//
//   O firmă poate DOAR să scadă din drepturile unui rol. Niciodată să adauge.
//
// De aceea în bază se ține lista celor TĂIATE, nu lista drepturilor. Chiar dacă cineva ar scrie de
// mână în tabelă, sau ar trimite prin API o listă cu „manageCompanies", rezultatul rămâne un rol cu
// mai puține drepturi — nu cu mai multe. Probele de mai jos încearcă exact asta.
//
// Al doilea lucru apărat: tăierea trebuie să AIBĂ EFECT imediat, pe toate căile — și pe rutele care
// verifică dreptul, și pe ce trimitem interfeței. O bifă care se salvează dar nu schimbă nimic e mai
// rea decât lipsa ei: adminul crede că a închis o ușă care de fapt e deschisă.

const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3198, DIR = '.roluri-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_roluri',
  PORT: String(PORT), TCP_PORT: '5198', PGLITE_DIR: DIR + '/pgdata',
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
const login = async (u, p) => {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
};

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }
  const ck = await login('admin', 'test1234');
  if (!ck) { console.log('nu m-am putut autentifica'); return gata(1); }
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b || {}) });
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b) });
  const DEL = (u, c) => fetch(B + u, { method: 'DELETE', headers: { Cookie: c || ck } });

  // O firmă, cu un admin și un manager. Managerul e cobaiul: are din start „vede toată flota",
  // „modifică flota" și „trimite comenzi".
  const co = await (await POST('/api/companies', { name: 'Firma Roluri' })).json();
  await POST('/api/users', { username: 'admin.r@test.ro', password: 'Str4da-Verde-2026', full_name: 'Admin R', role: 'admin', company_id: co.id });
  await POST('/api/users', { username: 'manager.r@test.ro', password: 'Str4da-Verde-2026', full_name: 'Manager R', role: 'manager', company_id: co.id });
  const ckA = await login('admin.r@test.ro', 'Str4da-Verde-2026');
  const ckM = await login('manager.r@test.ro', 'Str4da-Verde-2026');
  T('conturile de probă se autentifică', !!ckA && !!ckM);

  sect('1. Lista de roluri spune ce se poate ajusta');
  const r0 = await GET('/api/company-roles', ckA);
  T('ruta răspunde', r0.status === 200, r0.status);
  const roluri = await r0.json();
  const rolMgr = (roluri || []).find(x => x.rol === 'manager');
  T('managerul e în listă', !!rolMgr, (roluri || []).map(x => x.rol).join(', '));
  T('cu numele lui standard', rolMgr && rolMgr.numeStandard === 'Manager', rolMgr && rolMgr.numeStandard);
  // Adminul NU trebuie să apară: dacă și-ar tăia dreptul de administrare, ar rămâne pe dinafară.
  T('rolul de admin NU se poate ajusta', (roluri || []).every(x => x.rol !== 'admin' && x.rol !== 'company_admin'),
    (roluri || []).map(x => x.rol).join(', '));
  T('drepturile listate sunt cele pe care rolul chiar le are',
    rolMgr && rolMgr.drepturi.every(d => !!d.eticheta) && rolMgr.drepturi.some(d => d.cheie === 'manageFleet'),
    rolMgr && rolMgr.drepturi.map(d => d.cheie).join(', '));
  T('un drept pe care rolul nu-l are nu apare deloc',
    rolMgr && rolMgr.drepturi.every(d => d.cheie !== 'manageUsers'),
    rolMgr && rolMgr.drepturi.map(d => d.cheie).join(', '));
  // Pe ecran apar DOAR drepturi care păzesc ceva pe server. „sendCommands"/„ackAlerts"/„viewAudit"
  // există în tabela de roluri, dar nu păzesc nicio rută — o bifă care nu face nimic e mai rea decât
  // lipsa ei. Dacă vreodată sunt puse la treabă, proba asta pică și le punem la loc pe ecran.
  T('nu oferim bife care nu fac nimic',
    rolMgr && rolMgr.drepturi.every(d => ['sendCommands', 'ackAlerts', 'viewAudit'].indexOf(d.cheie) < 0),
    rolMgr && rolMgr.drepturi.map(d => d.cheie).join(', '));
  T('iar cele oferite chiar păzesc rute',
    rolMgr && rolMgr.drepturi.every(d => ['manageUsers', 'manageFleet', 'viewReports', 'viewAll'].indexOf(d.cheie) >= 0),
    rolMgr && rolMgr.drepturi.map(d => d.cheie).join(', '));

  sect('2. Managerul poate ce trebuie, ÎNAINTE de tăiere');
  const inainte = await GET('/api/devices', ckM);
  T('managerul vede flota', inainte.status === 200, inainte.status);
  const meIn = await (await GET('/api/me', ckM)).json();
  T('și are dreptul „modifică flota"', meIn.permissions && meIn.permissions.manageFleet === true, JSON.stringify(meIn.permissions));

  sect('3. Tăierea unui drept se aplică imediat');
  const sv = await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: ['manageFleet'] }, ckA);
  T('salvarea merge', sv.status === 200, sv.status + ' ' + (await sv.clone().text()).slice(0, 80));
  const dupa = await POST('/api/devices', { imei: '9911000000001', plate: 'RO 01 ROL' }, ckM);
  T('managerul NU mai poate modifica flota', dupa.status === 403, dupa.status);
  const meDupa = await (await GET('/api/me', ckM)).json();
  T('și interfața primește dreptul tăiat, nu unul fals', meDupa.permissions && meDupa.permissions.manageFleet === false,
    JSON.stringify(meDupa.permissions));
  T('fără să se delogheze', !!meDupa.username, meDupa.username);
  T('numele nou al rolului ajunge la interfață', meDupa.roleLabel === 'Operator depou', meDupa.roleLabel);
  // Ce n-a fost tăiat rămâne neatins — altfel am „reparat" o ușă stricând alta.
  T('celelalte drepturi rămân', meDupa.permissions && meDupa.permissions.viewReports === true, JSON.stringify(meDupa.permissions));

  sect('4. Nu se pot ADĂUGA drepturi, oricât ar încerca cineva');
  // Trimitem ca „tăiat" un drept pe care rolul nu-l are: n-are ce face, dar nici nu trebuie să
  // devină cumva un drept în plus.
  const strecurat = await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: ['manageCompanies', 'manageUsers'] }, ckA);
  T('cererea e acceptată, dar filtrată', strecurat.status === 200, strecurat.status);
  const dupaStrecurat = await strecurat.json();
  T('drepturile inexistente sunt aruncate', (dupaStrecurat.taiate || []).length === 0, JSON.stringify(dupaStrecurat.taiate));
  const meStr = await (await GET('/api/me', ckM)).json();
  T('managerul NU a căpătat drepturi noi', meStr.permissions && !meStr.permissions.manageUsers && !meStr.permissions.manageCompanies,
    JSON.stringify(meStr.permissions));
  // Rolurile de administrare nu se ating deloc.
  const peAdmin = await PUT('/api/company-roles/admin', { taiate: ['manageUsers'] }, ckA);
  T('rolul de admin nu se poate ajusta prin API', peAdmin.status === 400, peAdmin.status);
  const peSuper = await PUT('/api/company-roles/superadmin', { taiate: ['manageCompanies'] }, ckA);
  T('nici cel de super-admin', peSuper.status === 400, peSuper.status);

  sect('5. „Vede toată flota" tăiat înseamnă chiar mai puține mașini');
  // Dreptul ăsta nu e o poartă, e un FILTRU: dacă tăierea n-ar ajunge și la lista de vehicule,
  // omul ar continua să vadă toată flota, deși pe ecran scrie că nu are voie.
  await POST('/api/devices', { imei: '9911000000002', plate: 'RO 02 ROL' });
  await PUT('/api/devices/9911000000002/assign-company', { company_id: co.id }).catch(() => {});
  await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: ['viewAll'] }, ckA);
  await sleep(200);
  const listaM = await (await GET('/api/devices', ckM)).json();
  T('managerul nu mai vede mașinile firmei, ci doar ce i s-a atribuit',
    Array.isArray(listaM) && listaM.every(x => x.imei !== '9911000000002'),
    Array.isArray(listaM) ? listaM.map(x => x.imei).join(', ') : JSON.stringify(listaM));

  sect('6. Revenirea la standard chiar readuce drepturile');
  const rst = await DEL('/api/company-roles/manager', ckA);
  T('resetarea merge', rst.status === 200, rst.status);
  const meRst = await (await GET('/api/me', ckM)).json();
  T('managerul își recapătă drepturile', meRst.permissions && meRst.permissions.manageFleet === true && meRst.permissions.viewAll === true,
    JSON.stringify(meRst.permissions));
  T('și numele rolului redevine cel standard', !meRst.roleLabel, meRst.roleLabel);

  sect('7. Fiecare firmă își ajustează doar rolurile ei');
  const co2 = await (await POST('/api/companies', { name: 'Firma Roluri 2' })).json();
  await POST('/api/users', { username: 'admin.r2@test.ro', password: 'Str4da-Verde-2026', full_name: 'Admin R2', role: 'admin', company_id: co2.id });
  const ckA2 = await login('admin.r2@test.ro', 'Str4da-Verde-2026');
  await PUT('/api/company-roles/manager', { nume: 'Sef tura', taiate: ['viewReports'] }, ckA2);
  const laMine = await (await GET('/api/company-roles', ckA)).json();
  const mgrA = (laMine || []).find(x => x.rol === 'manager');
  T('ajustarea altei firme nu se vede la noi', mgrA && !mgrA.nume, mgrA && mgrA.nume);
  const meAltaFirma = await (await GET('/api/me', ckM)).json();
  T('și nu-i taie drepturi managerului nostru', meAltaFirma.permissions && meAltaFirma.permissions.viewReports === true,
    JSON.stringify(meAltaFirma.permissions));

  sect('8. Cine nu administrează firma nu umblă la roluri');
  await POST('/api/users', { username: 'disp.r@test.ro', password: 'Str4da-Verde-2026', full_name: 'Dispecer R', role: 'dispatcher', company_id: co.id });
  const ckD = await login('disp.r@test.ro', 'Str4da-Verde-2026');
  if (ckD) {
    const rd = await GET('/api/company-roles', ckD);
    T('dispecerul nu vede ecranul de roluri', rd.status === 403 || rd.status === 401, rd.status);
    const rp = await PUT('/api/company-roles/viewer', { taiate: ['viewReports'] }, ckD);
    T('și nu poate tăia drepturi', rp.status === 403 || rp.status === 401, rp.status);
  }

  sect('9. Regula „doar scădere" e scrisă în cod, nu doar în ecran');
  const srvTxt = fs.readFileSync('./server.js', 'utf8');
  const i = srvTxt.indexOf('// ── începe „roluri de firmă"');
  const j = srvTxt.indexOf('// ── sfârșit „roluri de firmă" ──', i);
  T('găsesc bucata între repere', i > 0 && j > i, 'i=' + i + ' j=' + j);
  if (i > 0 && j > i) {
    const F = new Function('COMPANY_ASSIGNABLE_ROLES', 'ROLE_PERMISSIONS', 'permsFor', 'db',
      srvTxt.slice(i, j) + '\n; return { efective: drepturiEfective, taiabile: drepturiTaiabile, ajustabil: rolAjustabil };')(
      ['manager', 'dispatcher', 'client', 'viewer'],
      { manager: { manageUsers: false, manageFleet: true, sendCommands: true, viewReports: true, ackAlerts: true, viewAll: true, viewAudit: false } },
      function (r) { return { manageUsers: false, manageFleet: true, sendCommands: true, viewReports: true, ackAlerts: true, viewAll: true, viewAudit: false }; },
      {});

    // Chiar dacă în bază ar ajunge un „drept tăiat" inventat, el nu poate deveni un drept ACORDAT.
    const cuGunoi = F.efective('manager', { manager: { taiate: new Set(['manageUsers', 'manageCompanies']) } });
    T('un drept pe care rolul nu-l are rămâne pe „nu"', cuGunoi.manageUsers === false, JSON.stringify(cuGunoi));
    T('și nu apare de nicăieri unul nou', cuGunoi.manageCompanies === undefined, JSON.stringify(cuGunoi));
    const taiat = F.efective('manager', { manager: { taiate: new Set(['manageFleet']) } });
    T('ce s-a tăiat chiar dispare', taiat.manageFleet === false, JSON.stringify(taiat));
    T('restul rămâne întreg', taiat.viewReports === true && taiat.sendCommands === true, JSON.stringify(taiat));
    const fara = F.efective('manager', null);
    T('fără ajustări, drepturile sunt cele din cod', fara.manageFleet === true && fara.viewAll === true, JSON.stringify(fara));
    T('se pot tăia doar drepturi pe care rolul le are', F.taiabile('manager').indexOf('manageUsers') < 0, F.taiabile('manager').join(', '));
    T('rolurile de administrare nu sunt ajustabile', !F.ajustabil('admin') && !F.ajustabil('superadmin') && !F.ajustabil('company_admin'));
  }

  sect('10. Cardul de pe ecran nu minte despre ce s-a schimbat');
  const htmlTxt = fs.readFileSync('./public/index.html', 'utf8');
  const iu = htmlTxt.indexOf('    // ── începe „Roluri"');
  const ju = htmlTxt.indexOf('    // ── sfârșit „Roluri" ──', iu);
  if (iu > 0 && ju > iu) {
    const escU = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const U = new Function('esc', 'window', 'document', 'fetch',
      htmlTxt.slice(iu, ju) + '\n; return { card: rolCardHtml };')(
      escU, {}, { getElementById: () => null, querySelectorAll: () => [] }, () => Promise.resolve({ json: () => ({}) }));
    const dr = (c, e, are) => ({ cheie: c, eticheta: e, are: are });
    const std = U.card({ rol: 'viewer', numeStandard: 'Viewer', nume: null, drepturi: [dr('viewReports', 'Vede rapoartele', true)] });
    T('un rol neatins scrie „standard"', /standard<\/span>/.test(std) && !/redenumit/.test(std));
    const ren = U.card({ rol: 'client', numeStandard: 'Client', nume: 'Beneficiar', drepturi: [dr('viewReports', 'Vede rapoartele', true)] });
    T('un rol DOAR redenumit nu mai scrie „standard"', /redenumit/.test(ren), ren.slice(0, 200));
    T('și arată de la ce a pornit', /Client/.test(ren));
    const tai = U.card({ rol: 'manager', numeStandard: 'Manager', nume: null, drepturi: [dr('manageFleet', 'Modifică flota', false), dr('viewReports', 'Vede rapoartele', true)] });
    T('un rol cu drepturi tăiate o spune, cu număr', /1 drept tăiat/.test(tai), tai.slice(0, 220));
    T('dreptul tăiat se vede tăiat pe ecran', /rol-d taiat/.test(tai));
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
