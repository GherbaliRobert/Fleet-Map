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

  sect('10. Ajustările fine: ecrane, editări, rapoarte');
  // Bifele astea trebuie să păzească RUTE, nu doar să se salveze frumos.
  const rolFin = await (await GET('/api/company-roles', ckA)).json();
  const mgr = (rolFin || []).find(x => x.rol === 'manager');
  T('rolul aduce lista de ecrane', mgr && mgr.ecrane && mgr.ecrane.length > 5, mgr && (mgr.ecrane || []).length);
  T('și lista de rapoarte, din catalogul real', mgr && mgr.rapoarte && mgr.rapoarte.length > 20, mgr && (mgr.rapoarte || []).length);
  T('și ce poate edita', mgr && mgr.editari && mgr.editari.length > 3, mgr && (mgr.editari || []).length);
  const viewer = (rolFin || []).find(x => x.rol === 'viewer');
  T('un rol care nu modifică nimic nu primește bife de editare', viewer && (viewer.editari || []).length === 0,
    viewer && (viewer.editari || []).length);

  // RAPOARTE: tăiat = refuzat pe ruta care generează raportul ȘI la programare.
  await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: [], rapoarte: ['trips'] }, ckA);
  const rapTaiat = await GET('/api/reports/trips?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z', ckM);
  T('un raport tăiat NU se mai poate scoate', rapTaiat.status === 403, rapTaiat.status);
  const rapOk = await GET('/api/reports/stops?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z', ckM);
  T('dar celelalte rapoarte merg mai departe', rapOk.status === 200, rapOk.status);
  const progr = await POST('/api/report-schedules', { report_type: 'trips', period: 'day', frequency: 'daily', hour: 6, format: 'pdf' }, ckM);
  T('și nici programat pe email nu se poate scoate', progr.status === 403, progr.status);

  // ECRANE: tăiat = ruta ecranului răspunde „acces interzis", nu doar se ascunde din meniu.
  await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: [], ecrane: ['soferi'] }, ckA);
  const ecrTaiat = await GET('/api/drivers', ckM);
  T('un ecran tăiat e închis și pe server', ecrTaiat.status === 403, ecrTaiat.status);
  const ecrOk = await GET('/api/alerts', ckM);
  T('celelalte ecrane rămân deschise', ecrOk.status === 200, ecrOk.status);

  // EDITARE: tăiat = nu mai poate SCRIE, dar poate în continuare să VADĂ.
  await PUT('/api/company-roles/manager', { nume: 'Operator depou', taiate: [], editari: ['soferi'] }, ckA);
  const vedeSoferi = await GET('/api/drivers', ckM);
  T('cu editarea tăiată, tot vede lista', vedeSoferi.status === 200, vedeSoferi.status);
  const scrieSofer = await POST('/api/drivers', { name: 'Ion Probă' }, ckM);
  T('dar nu mai poate adăuga', scrieSofer.status === 403, scrieSofer.status);
  const scrieAlta = await PUT('/api/company/fuel-prices', { motorina: 7.4 }, ckM);
  T('iar ce n-a fost tăiat merge mai departe', scrieAlta.status === 200, scrieAlta.status);

  // Și în meniu: un ecran tăiat nu trebuie să rămână ca buton care răspunde „acces interzis".
  const htmlMeniu = fs.readFileSync('./public/index.html', 'utf8');
  T('butoanele din meniu știu de ce ecran aparțin', (htmlMeniu.match(/data-ecran=/g) || []).length >= 14,
    (htmlMeniu.match(/data-ecran=/g) || []).length);
  T('și se ascund după ce trimite serverul', /ecraneAscunse/.test(htmlMeniu) && /function ascundeEcraneTaiate/.test(htmlMeniu));
  T('iar o grupă rămasă goală dispare și ea', /vizibile\.length \? '' : 'none'/.test(htmlMeniu));

  sect('11. Nici pe calea asta nu se pot ADĂUGA drepturi');
  const gunoi = await PUT('/api/company-roles/manager', { nume: 'Operator depou',
    ecrane: ['inventat'], editari: ['facturare'], rapoarte: ['nu_exista'] }, ckA);
  const gj = await gunoi.json();
  T('cheile inventate sunt aruncate',
    (gj.ecrane || []).length === 0 && (gj.editari || []).length === 0 && (gj.rapoarte || []).length === 0,
    JSON.stringify([gj.ecrane, gj.editari, gj.rapoarte]));
  // Un rol care NU modifică flota nu poate primi tăieri de editare — n-ar însemna nimic.
  const peViewer = await PUT('/api/company-roles/viewer', { editari: ['soferi'] }, ckA);
  const pv = await peViewer.json();
  T('un rol fără drept de modificare nu capătă bife de editare', (pv.editari || []).length === 0, JSON.stringify(pv.editari));

  sect('12. Rol nou: pornește dintr-un șablon și nu-l poate depăși');
  const nou = await POST('/api/company-roles', { nume: 'Operator depou', baza: 'dispatcher' }, ckA);
  T('rolul nou se creează', nou.status === 200, nou.status + ' ' + (await nou.clone().text()).slice(0, 80));
  const nj = await nou.json();
  T('și primește un slug propriu', !!nj.rol && nj.rol !== 'dispatcher', nj.rol);
  const faraBaza = await POST('/api/company-roles', { nume: 'Sef peste tot', baza: 'admin' }, ckA);
  T('nu poate porni de la un rol de administrare', faraBaza.status === 400, faraBaza.status);
  const faraNume = await POST('/api/company-roles', { baza: 'viewer' }, ckA);
  T('și are nevoie de nume', faraNume.status === 400, faraNume.status);

  // Atribuirea rolului propriu unui om: drepturile lui vin din șablon minus tăierile rolului propriu.
  const useri = await (await GET('/api/users', ckA)).json();
  const mgrUser = (useri || []).find(u => u.username === 'manager.r@test.ro');
  const atrib = await PUT('/api/users/' + mgrUser.id, { role: nj.rol }, ckA);
  T('omul poate fi mutat pe rolul propriu', atrib.status === 200, atrib.status);
  const meNou = await (await GET('/api/me', ckM)).json();
  T('și capătă numele rolului propriu', meNou.roleLabel === 'Operator depou', meNou.roleLabel);
  T('cu drepturile ȘABLONULUI, nu ale rolului vechi', meNou.permissions && meNou.permissions.manageFleet === false,
    JSON.stringify(meNou.permissions));
  const rolInexistent = await PUT('/api/users/' + mgrUser.id, { role: 'rol_inventat' }, ckA);
  T('un rol inventat e refuzat', rolInexistent.status === 400, rolInexistent.status);

  sect('12b. Oameni adăugați prin adresa de email, cu rol de la bun început');
  // Fluxul cerut de Alin: adminul firmei scrie adresa colegului, alege rolul, iar omul își pune
  // singur parola din emailul primit. Fără SMTP în probă, invitația NU pleacă — și tocmai asta
  // trebuie să spună serverul, ca ecranul să nu promită un email care n-a plecat.
  const faraSmtp = await POST('/api/users', { username: 'razvan.popescu@transport.ro',
    full_name: 'Razvan Popescu', role: 'dispatcher', company_id: co.id }, ckA);
  T('fără email configurat, invitația e refuzată cu explicație', faraSmtp.status === 400, faraSmtp.status);
  const mesaj = (await faraSmtp.json()).error || '';
  T('și explicația spune ce să facă omul', /parol/i.test(mesaj), mesaj);
  // Cu parolă scrisă de mână, calea veche merge neschimbată.
  const cuParola = await POST('/api/users', { username: 'sorin.ionut@transport.ro', password: 'Str4da-Verde-2026',
    full_name: 'Sorin Ionut', role: 'manager', company_id: co.id }, ckA);
  T('cu parolă, contul se creează ca înainte', cuParola.status === 200, cuParola.status);
  const listaU = await (await GET('/api/users', ckA)).json();
  const sorin = (listaU || []).find(u => u.username === 'sorin.ionut@transport.ro');
  T('și primește rolul ales din prima', sorin && sorin.role === 'manager', sorin && sorin.role);
  T('în firma adminului care l-a adăugat', sorin && sorin.company_id === co.id, sorin && sorin.company_id);

  sect('12c. Lanțul complet: noi dăm contul de admin, el își face echipa');
  // Așa arată realitatea la semnarea unui contract. Verificăm capătul care contează: adminul primit
  // de la noi POATE să-și facă oameni și roluri, dar NU poate face alți administratori.
  const coNou = await (await POST('/api/companies', { name: 'Transport SRL' })).json();
  T('noi creăm compania', !!coNou.id, JSON.stringify(coNou).slice(0, 80));
  const adminFirma = await POST('/api/companies/' + coNou.id + '/admin',
    { username: 'patron@transport-srl.ro', password: 'Str4da-Verde-2026' });
  T('și îi dăm un cont de administrator', adminFirma.status === 200, adminFirma.status);
  const ckP = await login('patron@transport-srl.ro', 'Str4da-Verde-2026');
  T('adminul firmei intră în contul lui', !!ckP);
  if (ckP) {
    const meP = await (await GET('/api/me', ckP)).json();
    T('are drepturi depline în firma lui', meP.permissions && meP.permissions.manageUsers && meP.permissions.manageFleet,
      JSON.stringify(meP.permissions));
    T('dar NU e cont de platformă', meP.isSuper === false, meP.isSuper);
    // Își face echipa singur.
    const disp = await POST('/api/users', { username: 'razvan.popescu@transport-srl.ro', password: 'Str4da-Verde-2026',
      full_name: 'Razvan Popescu', role: 'dispatcher' }, ckP);
    T('își adaugă singur un dispecer', disp.status === 200, disp.status + ' ' + (await disp.clone().text()).slice(0, 70));
    // …dar nu poate crea alți administratori. Asta rămâne la noi, la semnarea contractului.
    const altAdmin = await POST('/api/users', { username: 'sef2@transport-srl.ro', password: 'Str4da-Verde-2026',
      full_name: 'Sef Doi', role: 'admin' }, ckP);
    const aj = await altAdmin.json();
    T('nu poate face alt ADMIN peste el', altAdmin.status !== 200 || aj.role !== 'admin', altAdmin.status + ' ' + aj.role);
    const superNou = await POST('/api/users', { username: 'hacker@transport-srl.ro', password: 'Str4da-Verde-2026',
      full_name: 'Nimeni', role: 'superadmin' }, ckP);
    const sj = await superNou.json();
    T('și cu atât mai puțin un cont de platformă', superNou.status !== 200 || sj.role !== 'superadmin', superNou.status + ' ' + sj.role);
    T('rolul cerut cade pe cel mai mic, nu pe cel cerut', !sj.role || sj.role === 'viewer', sj.role);
    // Și își face rolurile lui, fără să ne întrebe.
    const rolPropriu = await POST('/api/company-roles', { nume: 'Operator depou', baza: 'dispatcher' }, ckP);
    T('își face singur roluri proprii', rolPropriu.status === 200, rolPropriu.status);
  }

  sect('13. Un rol propriu nu se șterge de sub picioarele oamenilor');
  const stergeFolosit = await DEL('/api/company-roles/' + nj.rol, ckA);
  T('ștergerea e oprită cât timp e folosit', stergeFolosit.status === 400, stergeFolosit.status);
  await PUT('/api/users/' + mgrUser.id, { role: 'manager' }, ckA);
  const stergeLiber = await DEL('/api/company-roles/' + nj.rol, ckA);
  T('după ce nu-l mai are nimeni, se șterge', stergeLiber.status === 200, stergeLiber.status);

  sect('14. „Rol nou": fereastra aplicației, nu a browserului');
  // Erau două `prompt()`-uri de browser, iar în al doilea omul trebuia să SCRIE „manager",
  // „dispatcher" sau „viewer". Adică trebuia să ghicească niște cuvinte englezești pe care nu le
  // văzuse nicăieri. Acum alege dintr-o listă în care scrie ce poate fiecare.
  const html = htmlMeniu;
  const q1 = html.indexOf('    // ── Rol nou: fereastra aplicației');
  const q2 = html.indexOf('    window.rolNou = function () {', q1);
  T('găsesc fereastra în cod', q1 > 0 && q2 > q1, 'q1=' + q1 + ' q2=' + q2);
  if (q1 > 0 && q2 > q1) {
    const N = new Function('esc', html.slice(q1, q2) + '\n; return { BAZE: ROL_BAZE, html: rolNouHtml };')(
      (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

    T('nu se mai deschide nicio fereastră de browser pentru rol nou',
      !/window\.rolNou = async function \(\) \{\s*\n\s*var nume = prompt/.test(html));
    T('cele trei șabloane sunt exact rolurile pe care firma le poate da',
      N.BAZE.map(b => b[0]).join(',') === 'manager,dispatcher,viewer', N.BAZE.map(b => b[0]).join(','));
    N.BAZE.forEach(b => T('„' + b[1] + '" spune pe ecran ce poate face', b[2].length > 30, b[2]));

    const h = N.html({ nume: '', baza: 'dispatcher' });
    T('are câmp pentru nume', /id="rol-nm-nume"/.test(h));
    T('are cele trei șabloane ca butoane', (h.match(/rol-nm-b[ "]/g) || []).length >= 3, h.slice(0, 200));
    T('cel ales e aprins, și numai el', (h.match(/rol-nm-b on/g) || []).length === 1);
    T('scrie negru pe alb că poți doar să tai', /poți doar să tai/.test(h));
    T('nu cere nimănui să scrie „dispatcher"', !/Scrie: manager/.test(h) && !/scrie.{0,12}dispatcher/i.test(h), h);
    T('numele scris de om nu sparge fereastra',
      N.html({ nume: '"><img src=x onerror=alert(1)>', baza: 'manager' }).indexOf('<img src=x') < 0);
    T('cât se creează, butonul nu se poate apăsa de două ori', /disabled/.test(N.html({ nume: 'X', baza: 'viewer', lucrez: true })));
    T('eroarea de la server se vede în fereastră, nu într-un alert',
      N.html({ nume: 'X', baza: 'viewer', eroare: 'Există deja un rol cu numele ăsta.' }).indexOf('Există deja') > 0);
  }
  // Parola pusă de administrator: tot fereastra aplicației, și fără regula falsă de dinainte.
  T('resetarea parolei nu mai trece prin prompt-ul browserului',
    !/var np = prompt\('Parolă nouă pentru/.test(html));
  T('și nu mai promite „minim 4 caractere", când serverul cere 8',
    !/min 4 caractere/.test(html) && /minim 8 caractere/.test(html));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
