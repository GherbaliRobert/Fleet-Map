// verify_adrese.js — „Adrese de email" (Setări → Notificări), pe server pornit.
//
//   node verify_adrese.js
//
// Ecranul ăsta atinge singurul lucru pe care nu-l putem repara cu un deploy: REPUTAȚIA domeniului de
// pe care trimitem. Dacă o adresă adăugată de un client începe să primească fără să fi confirmat
// nimeni, atunci oricine își face cont poate trimite emailuri de pe serverul nostru către orice
// adresă — iar noi ajungem pe liste negre și nu mai livrăm nici rapoartele clienților corecți.
// De aceea proba insistă pe:
//   • o adresă NOUĂ nu e confirmată și NU intră în listele de trimitere;
//   • confirmarea se face doar cu jetonul primit pe email, o singură dată, și expiră;
//   • fiecare firmă își vede DOAR agenda ei;
//   • contul demo nu poate adăuga adrese (altfel demo-ul devine releu de spam — regula din CLAUDE.md).

const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3197, DIR = '.adrese-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_adrese',
  PORT: String(PORT), TCP_PORT: '5197', PGLITE_DIR: DIR + '/pgdata',
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

  // Agenda e a unei FIRME. Super-adminul e cont de platformă, deci lucrăm cu un admin de firmă.
  const coA = await (await POST('/api/companies', { name: 'Firma A adrese' })).json();
  await POST('/api/users', { username: 'admin.a@test.ro', password: 'Str4da-Verde-2026', full_name: 'Admin A', role: 'admin', company_id: coA.id });
  const ckA = await login('admin.a@test.ro', 'Str4da-Verde-2026');
  const coB = await (await POST('/api/companies', { name: 'Firma B adrese' })).json();
  await POST('/api/users', { username: 'admin.b2@test.ro', password: 'Str4da-Verde-2026', full_name: 'Admin B', role: 'admin', company_id: coB.id });
  const ckB = await login('admin.b2@test.ro', 'Str4da-Verde-2026');

  sect('1. O adresă nouă NU e confirmată');
  T('adminii de firmă se autentifică', !!ckA && !!ckB);
  const r1 = await POST('/api/company-emails', { email: 'Dispecerat@Firma-A.RO', eticheta: 'Dispecerat' }, ckA);
  T('adresa se adaugă', r1.status === 200, r1.status + ' ' + (await r1.clone().text()).slice(0, 90));
  const a1 = await r1.json();
  T('adresa se salvează cu litere mici', a1.email === 'dispecerat@firma-a.ro', a1.email);
  T('și NU e confirmată', !a1.confirmed_at, a1.confirmed_at);
  // Fără SMTP configurat, emailul nu pleacă — iar ecranul TREBUIE să afle, ca omul să nu aștepte degeaba.
  T('serverul spune dacă emailul de confirmare a plecat sau nu', typeof a1.confirmareTrimisa === 'boolean', a1.confirmareTrimisa);

  sect('2. Neconfirmată = nu primește nimic');
  // Lista REALĂ de trimitere se citește prin ruta de probă (baza serverului nu se poate deschide
  // din altă parte: PGlite are un singur scriitor).
  const lista = async (scop) => await (await GET('/api/debug/email-list?company=' + coA.id + '&scop=' + scop)).json();
  const inainte = await lista('alerte');
  T('nu intră în lista de trimitere cât timp nu e confirmată', inainte.indexOf('dispecerat@firma-a.ro') < 0, inainte.join(', '));

  sect('3. Confirmarea se face cu jetonul, o singură dată');
  const jeton = (await (await GET('/api/debug/email-token?id=' + a1.id)).json()).token;
  T('jetonul există cât timp adresa nu e confirmată', !!jeton && jeton.length > 20, jeton && jeton.length);
  const gresit = await fetch(B + '/api/email/confirm?token=jetoninventat');
  T('un jeton inventat e refuzat', gresit.status === 400, gresit.status);
  const bun = await fetch(B + '/api/email/confirm?token=' + jeton);
  T('jetonul bun confirmă adresa', bun.status === 200, bun.status);
  const pag = await bun.text();
  T('și răspunde cu o pagină pentru om, nu cu JSON', /Adres/.test(pag) && /<html/.test(pag), pag.slice(0, 60));
  const dupa = await lista('alerte');
  T('acum intră în lista de trimitere', dupa.indexOf('dispecerat@firma-a.ro') >= 0, dupa.join(', '));
  const dinNou = await fetch(B + '/api/email/confirm?token=' + jeton);
  T('același link nu mai merge a doua oară', dinNou.status === 400, dinNou.status);

  sect('4. Bifele spun ce primește adresa');
  const up = await PUT('/api/company-emails/' + a1.id, { la_alerte: false }, ckA);
  T('bifa se poate schimba', up.status === 200, up.status);
  const faraAlerte = await lista('alerte');
  T('debifată de la alerte, nu mai primește alerte', faraAlerte.indexOf('dispecerat@firma-a.ro') < 0, faraAlerte.join(', '));
  const totRapoarte = await lista('rapoarte');
  T('dar rămâne pe rapoarte', totRapoarte.indexOf('dispecerat@firma-a.ro') >= 0, totRapoarte.join(', '));

  sect('5. Fiecare firmă își vede doar agenda ei');
  const listaB = await (await GET('/api/company-emails', ckB)).json();
  T('firma B nu vede adresele firmei A', (listaB || []).every(x => x.email !== 'dispecerat@firma-a.ro'),
    (listaB || []).map(x => x.email).join(', '));
  const stergeStrain = await DEL('/api/company-emails/' + a1.id, ckB);
  T('și nu poate șterge o adresă străină', stergeStrain.status === 404, stergeStrain.status);
  const dupaIncercare = await (await GET('/api/company-emails', ckA)).json();
  T('adresa firmei A a rămas la locul ei', (dupaIncercare || []).some(x => x.id === a1.id));

  sect('6. Aceeași adresă nu se adaugă de două ori');
  const dubla = await POST('/api/company-emails', { email: 'dispecerat@firma-a.ro' }, ckA);
  T('a doua oară e refuzată, cu explicație', dubla.status === 400, dubla.status);
  const gresita = await POST('/api/company-emails', { email: 'nu-e-adresa' }, ckA);
  T('o adresă fără @ e refuzată', gresita.status === 400, gresita.status);

  sect('7. Cine nu administrează firma nu umblă în agendă');
  await POST('/api/users', { username: 'disp.a@test.ro', password: 'Str4da-Verde-2026', full_name: 'Dispecer A', role: 'dispatcher', company_id: coA.id });
  const ckD = await login('disp.a@test.ro', 'Str4da-Verde-2026');
  if (ckD) {
    const rd = await GET('/api/company-emails', ckD);
    T('dispecerul nu vede agenda', rd.status === 403 || rd.status === 401, rd.status);
    const rp = await POST('/api/company-emails', { email: 'x@y.ro' }, ckD);
    T('și nu poate adăuga adrese', rp.status === 403 || rp.status === 401, rp.status);
  }

  sect('8. Ecranul spune ce e neconfirmat');
  const html = fs.readFileSync('./public/index.html', 'utf8');
  const i = html.indexOf('    // ── începe „Adrese de email"');
  const j = html.indexOf('    // ── sfârșit „Adrese de email" ──', i);
  T('găsesc codul ecranului între repere', i > 0 && j > i, 'i=' + i + ' j=' + j);
  if (i > 0 && j > i) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const F = new Function('esc', 'window', 'document', 'fetch', 'confirm',
      html.slice(i, j) + '\n; return { stare: adrStare, rand: adrRandHtml };')(
      esc, {}, { getElementById: () => null }, () => Promise.resolve({ json: () => ({}) }), () => true);

    const conf = F.stare({ confirmed_at: '2026-08-30T10:00:00Z' });
    T('o adresă confirmată o spune, pe verde', conf.ok && /confirmat/.test(conf.t) && conf.c === 'var(--accent)', conf.t);
    const nec = F.stare({ confirmed_at: null });
    T('una neconfirmată o spune, pe portocaliu', !nec.ok && /așteaptă/.test(nec.t) && nec.c === 'var(--orange)', nec.t);

    const rnd = F.rand({ id: 3, email: 'dispecerat@firma.ro', eticheta: 'Dispecerat', la_alerte: true, la_rapoarte: false, confirmed_at: null });
    T('rândul arată adresa', /dispecerat@firma\.ro/.test(rnd));
    T('și eticheta ei', /Dispecerat/.test(rnd));
    T('marchează vizual că nu e confirmată', /adr-rand neconf/.test(rnd));
    T('oferă retrimiterea confirmării', /adrRetrimite\(3\)/.test(rnd));
    const rndOk = F.rand({ id: 4, email: 'a@b.ro', la_alerte: true, la_rapoarte: true, confirmed_at: '2026-08-30T10:00:00Z' });
    T('la una confirmată NU mai oferă retrimiterea', !/adrRetrimite/.test(rndOk));
  }

  sect('9. Alertele chiar ajung la agendă, o singură dată pe eveniment');
  // Nu trimitem emailuri în probă (n-avem SMTP), dar apărăm forma: livrarea către firmă e chemată
  // O DATĂ pe eveniment, în afara buclei pe oameni — altfel dispecerat@ primea o copie de fiecare om.
  const srvTxt = fs.readFileSync('./server.js', 'utf8');
  T('există o livrare separată către adresele firmei', /async function deliverCompanyEvent/.test(srvTxt));
  T('e chemată în afara buclei pe utilizatori',
    /for \(const u of users\)[\s\S]{0,900}?\}\s*\n\s*\/\/[\s\S]{0,240}?await deliverCompanyEvent\(/.test(srvTxt));
  T('demo-ul nu trimite emailuri nici pe calea asta', /deliverCompanyEvent[\s\S]{0,600}?demoCompanyId/.test(srvTxt));
  T('adresa comună are propria răcire, cheiată pe firmă', /userCooldownOk\('co' \+ coId/.test(srvTxt));
  // Conturile demo nu trimit emailuri prin serverul nostru (regula din CLAUDE.md). Nu putem juca un
  // admin de firmă demo prin API, dar ne asigurăm că ruta de adăugare trece prin poarta demo.
  // Bifa „Rapoarte" trebuie să facă ceva: rapoartele programate citesc agenda, pe lângă lista scrisă
  // de mână. O bifă care nu face nimic e mai rea decât lipsa ei.
  const rsTxt = fs.readFileSync('./report_schedules.js', 'utf8');
  T('rapoartele programate citesc agenda firmei', /getConfirmedCompanyEmails\(s\.company_id, 'rapoarte'\)/.test(rsTxt));
  T('și nu trimit de două ori la aceeași adresă', /vazute\.has\(String\(a\)\.toLowerCase\(\)\)/.test(rsTxt));
  T('adăugarea unei adrese trece prin regula demo',
    /app\.post\('\/api\/company-emails'[\s\S]{0,200}?_demoBlocked\(req, res\)/.test(srvTxt));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
