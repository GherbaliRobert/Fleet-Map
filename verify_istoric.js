// verify_istoric.js — „Istoric activitate" (Setări → Evidență), pe server pornit.
//
//   node verify_istoric.js
//
// Jurnalul exista de mult, dar era al PLATFORMEI: îl vedeam doar noi, super-adminii. Acum îl vede și
// adminul unei firme — pentru firma lui. De aici, două riscuri care se apără aici:
//   • SCURGEREA: un admin de firmă nu are voie să vadă rândurile altei firme și nici rândurile
//     platformei (cele fără companie). Filtrul îl pune SERVERUL, nu ecranul;
//   • MINCIUNA PRIN OMISIUNE: autentificările se scriau fără companie, deci într-un istoric de firmă
//     nu apărea nimeni conectându-se — se vedea doar ce s-a modificat. Ecranul ar fi arătat complet
//     fără să fie.
// Plus partea de limbaj: în bază scrie „update / device / 350317...". Pe ecran trebuie să scrie
// „Ion a modificat mașina CJ 12 ABC", altfel nimeni nu-l citește.

const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3194, DIR = '.istoric-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_istoric',
  PORT: String(PORT), TCP_PORT: '5194', PGLITE_DIR: DIR + '/pgdata',
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
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b) });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b) });

  sect('1. Ruta răspunde și numără');
  await POST('/api/devices', { imei: '8811000000001', plate: 'IS 10 IST', vehicle_type: 'Camion' });
  await PUT('/api/devices/8811000000001', { plate: 'IS 10 IST', name: 'Camion istoric' });
  const r0 = await GET('/api/activity?zile=30');
  T('ruta răspunde', r0.status === 200, r0.status);
  const d0 = await r0.json();
  T('trimite rânduri și un total', Array.isArray(d0.randuri) && typeof d0.total === 'number', JSON.stringify(d0).slice(0, 120));
  T('are ce arăta după două acțiuni', d0.total >= 2, d0.total);

  sect('2. Numărul mașinii vine odată cu rândul');
  // Fără el, ecranul ar scrie „a modificat mașina 8811000000001" — adică nimic pentru un om.
  const rDev = (d0.randuri || []).find(x => x.entity === 'device' && x.entity_id === '8811000000001');
  T('rândul despre mașină există', !!rDev, (d0.randuri || []).map(x => x.action + '/' + x.entity).join(', '));
  T('și aduce numărul de înmatriculare, nu doar IMEI-ul', rDev && rDev.device_plate === 'IS 10 IST', rDev && rDev.device_plate);

  sect('3. Autentificările intră în istoricul FIRMEI');
  // Aici era gaura: login-ul se scria fără companie, deci nu apărea în istoricul niciunei firme.
  const conect = await (await GET('/api/activity?zile=30&familie=conectari')).json();
  T('filtrul „Conectări" răspunde', Array.isArray(conect.randuri), JSON.stringify(conect).slice(0, 100));
  T('și conține DOAR conectări/ieșiri', (conect.randuri || []).every(x => x.action === 'login' || x.action === 'logout'),
    (conect.randuri || []).map(x => x.action).join(', '));
  T('autentificarea de adineauri e acolo', (conect.randuri || []).some(x => x.action === 'login'), conect.total);

  sect('4. Filtrele nu se contrazic cu ce cer');
  const mod = await (await GET('/api/activity?zile=30&familie=modificari')).json();
  T('„Modificări" nu întoarce conectări', (mod.randuri || []).every(x => x.action !== 'login' && x.action !== 'logout'),
    (mod.randuri || []).map(x => x.action).join(', '));
  const nimic = await (await GET('/api/activity?zile=30&familie=descarcari')).json();
  T('„Descărcări" e goală cât timp nimeni n-a descărcat', nimic.total === 0, nimic.total);
  await GET('/api/device-inventory/export?format=xlsx').catch(() => {});
  const dupa = await (await GET('/api/activity?zile=30&familie=descarcari')).json();
  T('după un export, apare în „Descărcări"', dupa.total >= 1, dupa.total);

  sect('5. Un om fără drept de administrare NU vede istoricul');
  // Un cont de firmă are nevoie de firmă: super-adminul e cont de platformă, nu aparține niciuneia.
  const co = await (await POST('/api/companies', { name: 'Firma de probă istoric' })).json();
  const cu = await POST('/api/users', { username: 'dispecer@test.ro', password: 'Str4da-Verde-2026',
    full_name: 'Dispecer Test', role: 'dispatcher', company_id: co && co.id });
  T('contul de dispecer se creează', cu.status === 200, cu.status + ' ' + JSON.stringify(co).slice(0, 80));
  const ckD = await login('dispecer@test.ro', 'Str4da-Verde-2026');
  T('dispecerul se poate autentifica', !!ckD);
  if (ckD) {
    const rd = await GET('/api/activity?zile=30', ckD);
    T('dar la istoric primește refuz', rd.status === 403 || rd.status === 401, rd.status);
  }

  sect('5b. Adminul unei firme vede DOAR firma lui');
  // Riscul cel mai serios al ecranului: jurnalul e comun tuturor. Filtrul pe companie îl pune
  // serverul; dacă s-ar baza pe un parametru din URL, oricine l-ar putea schimba.
  const coB = await (await POST('/api/companies', { name: 'Firma B' })).json();
  await POST('/api/users', { username: 'admin.b@test.ro', password: 'Str4da-Verde-2026',
    full_name: 'Admin B', role: 'admin', company_id: coB && coB.id });
  const ckB = await login('admin.b@test.ro', 'Str4da-Verde-2026');
  T('adminul firmei B se autentifică', !!ckB);
  if (ckB) {
    const rb = await GET('/api/activity?zile=30', ckB);
    T('și are voie la istoric', rb.status === 200, rb.status);
    const db2 = await rb.json();
    T('vede propria autentificare', (db2.randuri || []).some(x => x.action === 'login' && x.username === 'admin.b@test.ro'),
      (db2.randuri || []).map(x => x.username + '/' + x.action).join(', '));
    T('NU vede ce am făcut noi, în cealaltă firmă', (db2.randuri || []).every(x => x.username !== 'admin'),
      (db2.randuri || []).map(x => x.username).join(', '));
    T('și nicio mașină din afara firmei lui', (db2.randuri || []).every(x => x.device_plate !== 'IS 10 IST'),
      (db2.randuri || []).map(x => x.device_plate).filter(Boolean).join(', '));
  }

  sect('6. Limbajul de pe ecran');
  const html = fs.readFileSync('./public/index.html', 'utf8');
  const i = html.indexOf('    // ── începe „Istoric activitate"');
  const j = html.indexOf('    // ── sfârșit „Istoric activitate" ──', i);
  T('găsesc codul ecranului între repere', i > 0 && j > i, 'i=' + i + ' j=' + j);
  if (i > 0 && j > i) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const F = new Function('esc', 'window', 'document', 'fetch',
      html.slice(i, j) + '\n; return { fapta: istFapta, zi: istZi, rand: istRandHtml, VERB: IST_VERB, OBIECT: IST_OBIECT };')(
      esc, {}, { getElementById: () => null }, () => Promise.resolve({ json: () => ({}) }));

    const f1 = F.fapta({ action: 'update', entity: 'device', entity_id: '8811000000001', device_plate: 'IS 10 IST' });
    T('„update/device" devine „a modificat mașina"', f1.verb === 'a modificat' && f1.obiect === 'mașina', f1.verb + ' ' + f1.obiect);
    T('și ținta e numărul, nu IMEI-ul', f1.tinta === 'IS 10 IST', f1.tinta);

    const f2 = F.fapta({ action: 'login', entity: 'session' });
    T('„login" devine „s-a conectat"', f2.verb === 's-a conectat', f2.verb);
    T('și nu inventează un obiect', !f2.obiect && !f2.tinta, f2.obiect + '/' + f2.tinta);

    const f3 = F.fapta({ action: 'delete', entity: 'driver', entity_id: '7', details: { name: 'Ion Popescu' } });
    T('ștergerea unui șofer spune pe cine', f3.verb === 'a șters' && f3.obiect === 'șoferul' && f3.tinta === 'Ion Popescu',
      [f3.verb, f3.obiect, f3.tinta].join(' '));
    T('și e roșie', f3.col === 'var(--red)', f3.col);

    // O mașină ștearsă nu mai are număr. IMEI-ul întreg nu spune nimic; îl scurtăm ca să se vadă că e un aparat.
    const f4 = F.fapta({ action: 'delete', entity: 'device', entity_id: '350317170000101' });
    T('o mașină fără număr arată IMEI-ul scurtat', f4.tinta === '…000101', f4.tinta);

    // Regula care contează cel mai mult: o acțiune pe care nu am botezat-o NU dispare din jurnal.
    const f5 = F.fapta({ action: 'ceva_nou', entity: 'device', device_plate: 'B 99 XYZ' });
    T('o acțiune necunoscută tot apare pe ecran', !!f5.verb && /ceva_nou/.test(f5.verb), f5.verb);

    const ACUM = Date.parse('2026-09-01T12:00:00Z');
    T('ziua de azi scrie „Azi"', F.zi(ACUM - 3600000, ACUM) === 'Azi', F.zi(ACUM - 3600000, ACUM));
    T('ziua de ieri scrie „Ieri"', F.zi(ACUM - 26 * 3600000, ACUM) === 'Ieri', F.zi(ACUM - 26 * 3600000, ACUM));
    T('mai vechi de-atât scrie data', /august/.test(F.zi(Date.parse('2026-08-12T09:00:00Z'), ACUM)), F.zi(Date.parse('2026-08-12T09:00:00Z'), ACUM));

    const rand = F.rand({ action: 'update', entity: 'device', device_plate: 'IS 10 IST', username: 'ion@firma.ro',
      created_at: '2026-09-01T09:30:00Z', ip: '86.120.1.2' }, false);
    T('rândul scrie cine a făcut', /ion@firma\.ro/.test(rand));
    T('rândul scrie ce a făcut, în cuvinte', /a modificat mașina/.test(rand));
    T('IP-ul NU se arată clientului', !/86\.120\.1\.2/.test(rand));
    const randSuper = F.rand({ action: 'update', entity: 'device', device_plate: 'IS 10 IST', username: 'ion@firma.ro',
      created_at: '2026-09-01T09:30:00Z', ip: '86.120.1.2' }, true);
    T('nouă, super-admini, ni se arată', /86\.120\.1\.2/.test(randSuper));
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
