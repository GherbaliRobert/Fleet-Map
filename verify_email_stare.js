// verify_email_stare.js — emailul care n-a plecat nu mai tace (Alin, 22.10: „programasem un raport foaie de parcurs să-mi vină pe
// mail în fiecare dimineață… a funcționat, apoi nu a mai mers").
//
//   node verify_email_stare.js
//
// Brevo refuza serverul după o publicare (Railway îi schimbă adresa, Brevo blochează din oficiu adresele necunoscute: 401
// „unrecognised IP address"), iar aplicația nu spunea nimănui: raportul programat înghițea eroarea, „Stare producție" era verde.
// Ce păzește (cu un Brevo FALS, local — nu pleacă niciun email adevărat):
//   1. regulile: motivul pe înțeles (IP, cheie, limită, rețea); starea programării după o trimitere (reîncercare după 30, 60,
//      120 de minute, apoi „n-a putut pleca"); textul de pe ecran (amănuntul erorii doar la noi);
//   2. mailer.js ține minte ultimul email plecat și ultimul refuzat;
//   3. pe server pornit: Foaie de parcurs programată la 6, Brevo refuză → reîncercări (raportul o singură dată în Istoric),
//      lista arată de ce, noi primim anunțul (fără email), „Stare producție" e roșie cu ce e de făcut; după 4 încercări,
//      omul află că emailul n-a plecat; a doua zi Brevo primește → „a plecat"; o reîncercare reușită trimite raportul păstrat;
//      clientul nu vede eroarea exactă; „Trimite acum" spune pe față ce s-a întâmplat.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const MESAJ_IP = 'We have detected you are using an unrecognised IP address 34.56.78.90. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips';
let mod = 'ip';
const primite = [];
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
    if (req.url === '/v3/account') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"email":"cont@ratrack.ro"}'); }
    if (mod === 'ip') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: 'unauthorized', message: MESAJ_IP })); }
    primite.push(j);
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<m' + primite.length + '@smtp-brevo.com>' }));
  });
});

(async () => {
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';

  // ─── 1. Regulile ─────────────────────────────────────────────────────────────────────────────────────
  console.log('1. Regulile: motivul, starea programării, textul');
  for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_FROM', 'EMAIL_FROM', 'NOTIFY_EMAIL_TO']) delete process.env[k];
  process.env.BREVO_API_KEY = 'xkeysib-proba-fara-retea';
  process.env.BREVO_API_URL = URL_FALS;
  const mailer = require('./mailer');
  const rs = require('./report_schedules');
  const mIp = mailer.motiv('Brevo 401: ' + MESAJ_IP);
  T('Brevo 401 „unrecognised IP" → motivul: adresa serverului, cu ce e de făcut în Brevo', mIp.fel === 'ip' && /Railway/.test(mIp.scurt) && /Authorised IPs/.test(mIp.ceFaceti), JSON.stringify(mIp));
  T('alt 401 → cheia sau contul', mailer.motiv('Brevo 401: Key not found').fel === 'cheie');
  T('rețeaua → „n-a răspuns la timp"', mailer.motiv('Brevo: The operation was aborted due to timeout').fel === 'retea');
  T('limita contului → planul Brevo', mailer.motiv('Brevo 402: not enough credits').fel === 'limita');

  const s = { id: 7, frequency: 'daily', hour: 6, report_type: 'trips', email_raport_id: null };
  const acum = new Date('2026-10-22T03:01:00Z');   // 06:01 în România (vara)
  const picat = { ok: true, recipients: ['alin@firma.ro'], emailSent: false, emailError: 'Brevo 401: ' + MESAJ_IP, historyId: 55 };
  const st1 = rs.stareDupa(picat, 0, acum, s);
  T('prima încercare picată → reîncercare peste 30 de minute, cu raportul din Istoric ținut minte',
    st1.stare === 'reincercare' && st1.reincercari === 1 && st1.raportId === 55 && st1.next.getTime() === acum.getTime() + 30 * 60000, JSON.stringify(st1));
  const st2 = rs.stareDupa(Object.assign({}, picat, { historyId: 55 }), 1, acum, s), st3 = rs.stareDupa(picat, 2, acum, s);
  T('a doua → peste 60, a treia → peste 120 de minute', st2.next.getTime() === acum.getTime() + 60 * 60000 && st2.reincercari === 2 &&
    st3.next.getTime() === acum.getTime() + 120 * 60000 && st3.reincercari === 3);
  const st4 = rs.stareDupa(picat, 3, acum, s);
  T('a patra picată → „n-a putut pleca", se renunță până mâine la 6', st4.stare === 'esuat' && st4.renunta === true && st4.reincercari === 0 &&
    st4.next.toISOString() === '2026-10-23T03:00:00.000Z', JSON.stringify(st4));
  T('a plecat → „trimis"; fără destinatar → doar în Istoric; fără mașini; eroare la raport',
    rs.stareDupa({ ok: true, recipients: ['a@b.ro'], emailSent: true }, 0, acum, s).stare === 'trimis' &&
    rs.stareDupa({ ok: true, recipients: [], emailSent: false }, 0, acum, s).stare === 'fara_destinatar' &&
    rs.stareDupa({ ok: false, reason: 'fără vehicule accesibile' }, 0, acum, s).stare === 'fara_vehicule' &&
    rs.stareDupa({ ok: false, error: 'x' }, 0, acum, s).stare === 'eroare');
  const rand = { ultima_stare: 'reincercare', ultima_eroare: 'Brevo 401: ' + MESAJ_IP, last_run: acum.toISOString(), next_run: st1.next.toISOString() };
  const tCl = rs.textStare(rand, false), tNoi = rs.textStare(rand, true);
  T('textul pentru client: n-a plecat, ora reîncercării, raportul e în Istoric — fără Brevo', /n-a plecat; încercăm din nou la 06:31/.test(tCl) && /Istoric/.test(tCl) && !/Brevo|401/.test(tCl), tCl);
  T('textul pentru noi: și eroarea exactă', /unrecognised IP/.test(tNoi), tNoi);
  const tEs = rs.textStare({ ultima_stare: 'esuat', ultima_eroare: 'Brevo 401', last_run: acum.toISOString() }, false);
  T('„n-a putut pleca": raportul e în Istoric, echipa RA Track a fost anunțată', /n-a putut pleca/.test(tEs) && /Echipa RA Track a fost anunțată/.test(tEs) && !/Brevo/.test(tEs), tEs);
  T('o programare fără stare (de dinainte de 22.10) → fără text', rs.textStare({ last_run: acum.toISOString() }, true) === null);

  // ─── 2. mailer.js ține minte ─────────────────────────────────────────────────────────────────────────
  console.log('\n2. mailer.js ține minte ultimul email plecat și ultimul refuzat');
  let vazut = null; mailer.setLaRezultat(function (r) { vazut = r; });
  mod = 'ip';
  let r = await mailer.send({ to: 'alin@firma.ro', subject: 'Raport', text: 't' });
  let sm = mailer.stare();
  T('refuzat de Brevo: eroarea întreagă, cu ora, iar serverul e anunțat', r.ok === false && /unrecognised IP/.test(sm.eroare) && sm.esuatLa > 0 && vazut && vazut.ok === false, JSON.stringify(sm).slice(0, 200));
  mod = 'ok';
  r = await mailer.send({ to: 'alin@firma.ro', subject: 'Raport', text: 't' });
  sm = mailer.stare();
  T('apoi plecat: ultima reușită e mai nouă decât ultima eroare', r.ok === true && sm.reusitLa >= sm.esuatLa && vazut.ok === true);
  mailer.setLaRezultat(null);

  // ─── 3. Pe server pornit ─────────────────────────────────────────────────────────────────────────────
  console.log('\n3. Pe server pornit: Foaie de parcurs programată la 6, cu Brevo care refuză serverul');
  const PORT = 3352, TCP = 5352, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_emailstare_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_emailstare', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba-fara-retea', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <noreply@ratrack.ro>',
    BASE_URL: 'https://ratrack.ro', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300', RATE_LIMIT_ENABLED: 'false' });
  for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'NOTIFY_EMAIL_TO']) delete env[k];
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} try { fals.close(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 800); };
  srv.on('exit', (cod) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + cod + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const json = async (m, u, ck, body) => {
    const x = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: x.status, j: j == null ? {} : j, t };
  };
  const login = async (u, p) => {
    const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    return (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((x) => x.split(';')[0]).join('; ');
  };
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(B + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
    const S = await login('admin', 'test1234');
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Raport SRL' })).j;
    const IMEI = '862129084939901';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: IMEI, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }] });
    await json('PUT', '/api/devices/' + IMEI + '/company', S, { company_id: co.id });
    const sc = await json('POST', '/api/report-schedules', S, { name: 'Foaia de dimineață', report_type: 'trips', imei: IMEI, period: 'yesterday', frequency: 'daily', hour: 6, format: 'xlsx', recipients: 'alin@firma-raport.ro' });
    T('programarea: Foaie de parcurs, zilnic la 6, pe email', sc.status === 200 && sc.j && sc.j.id, sc.t.slice(0, 200));
    const id = sc.j.id;
    const rand0 = async () => ((await json('GET', '/api/report-schedules', S)).j || []).filter((x) => x.id === id)[0] || {};
    const tick = async (t) => json('POST', '/api/test/ceasuri', S, { acum: t, rapoarte: true });
    const istoric = async () => ((await json('GET', '/api/reports/history?limit=200', S)).j || []).filter((x) => x.report_type === 'trips').length;
    let p = await rand0();
    const t0 = new Date(p.next_run).getTime() + 60000;

    mod = 'ip';
    const n0 = primite.length;
    let k = await tick(t0);
    p = await rand0();
    T('Brevo refuză → stare „reincercare", următoarea încercare peste 30 de minute', p.ultima_stare === 'reincercare' && Number(p.email_reincercari) === 1 &&
      new Date(p.next_run).getTime() === t0 + 30 * 60000, JSON.stringify({ k: k.j, p }).slice(0, 400));
    T('lista arată de ce (la noi, cu eroarea exactă)', /n-a plecat; încercăm din nou la/.test(p.stare_text || '') && /unrecognised IP/.test(p.stare_text || '') && /unrecognised IP/.test(p.ultima_eroare || ''), p.stare_text);
    T('raportul e în Istoric o singură dată', (await istoric()) === 1);
    const notif = ((await json('GET', '/api/notifications?limit=50', S)).j || []).filter((x) => x.type === 'email_esuat');
    T('noi primim anunțul „Emailurile nu pleacă", cu ce e de făcut în Brevo', notif.length === 1 && /Railway/.test(notif[0].body) && /Authorised IPs/.test(notif[0].body), JSON.stringify(notif).slice(0, 300));
    const h = await json('GET', '/api/admin/health', S);
    T('„Stare producție": roșu — emailul e pus, DAR ultimul n-a plecat, cu motivul și ce e de făcut',
      /DAR ultimul email n-a plecat/.test(h.t) && /Authorised IPs/.test(h.t), h.t.slice(0, 300));
    T('nicio încercare n-a plecat spre Brevo cu succes', primite.length === n0);

    await tick(t0 + 30 * 60000);
    p = await rand0();
    T('a doua încercare picată → peste încă 60 de minute', p.ultima_stare === 'reincercare' && Number(p.email_reincercari) === 2 && new Date(p.next_run).getTime() === t0 + 90 * 60000, JSON.stringify(p).slice(0, 300));
    await tick(t0 + 90 * 60000);
    p = await rand0();
    T('a treia → peste încă 120 de minute', Number(p.email_reincercari) === 3 && new Date(p.next_run).getTime() === t0 + 210 * 60000);
    await tick(t0 + 210 * 60000);
    p = await rand0();
    // Ora 6 a zilei următoare o socotește aplicația (pe 25.10 se trece la ora de iarnă: +24 h n-ar fi ora 6).
    T('a patra picată → „n-a putut pleca", următoarea rulare mâine dimineață', p.ultima_stare === 'esuat' && Number(p.email_reincercari) === 0 &&
      new Date(p.next_run).getTime() === rs.computeNextRun('daily', 6, new Date(t0 + 210 * 60000)).getTime(), JSON.stringify(p).slice(0, 300));
    T('…și tot un singur raport în Istoric (reîncercările l-au refolosit)', (await istoric()) === 1);
    const notif2 = ((await json('GET', '/api/notifications?limit=50', S)).j || []);
    T('omul care a programat află: „Emailul cu raportul n-a putut pleca", echipa RA Track a fost anunțată',
      notif2.some((x) => x.type === 'report_email_esuat' && /echipa RA Track a fost anunțată/.test(x.body)));
    T('anunțul nostru nu se repetă la fiecare email (cel mult unul la 6 ore)', notif2.filter((x) => x.type === 'email_esuat').length === 1);

    // A doua zi, Brevo primește din nou
    mod = 'ok';
    const t1 = new Date(p.next_run).getTime() + 60000;
    const n1 = primite.length;
    await tick(t1);
    p = await rand0();
    const em = primite.slice(n1)[0] || {};
    T('a doua zi: emailul pleacă, cu Foaia de parcurs atașată', p.ultima_stare === 'trimis' && em.to && em.to[0].email === 'alin@firma-raport.ro' &&
      /^RA-Track - Raport Foaie de parcurs/.test(((em.attachment || [])[0] || {}).name || ''), JSON.stringify({ p, em: em.subject }).slice(0, 300));
    T('…lista spune „a plecat pe email"', /a plecat pe email/.test(p.stare_text || ''), p.stare_text);
    const h2 = await json('GET', '/api/admin/health', S);
    T('„Stare producție" redevine verde, cu ultimul email plecat', /activ — Brevo, de la RA Track <noreply@ratrack\.ro> · ultimul email plecat:/.test(h2.t) && !/DAR ultimul email/.test(h2.t), h2.t.slice(0, 300));

    // A treia zi: prima încercare pică, reîncercarea reușește — și trimite raportul păstrat, fără să-l facă din nou
    mod = 'ip';
    const t2 = new Date(p.next_run).getTime() + 60000;
    await tick(t2);
    const ist2 = await istoric();
    mod = 'ok';
    const n2 = primite.length;
    await tick(t2 + 30 * 60000);
    p = await rand0();
    const em2 = primite.slice(n2)[0] || {};
    T('reîncercarea reușită: emailul pleacă, starea e „trimis", rularea următoare e mâine', p.ultima_stare === 'trimis' && Number(p.email_reincercari) === 0 &&
      (em2.attachment || []).length === 1 && new Date(p.next_run).getTime() === rs.computeNextRun('daily', 6, new Date(t2 + 30 * 60000)).getTime(), JSON.stringify({ st: p.ultima_stare, rc: p.email_reincercari, err: p.ultima_eroare, lr: p.last_run, nr: p.next_run, t2: new Date(t2).toISOString(), at: (em2.attachment || []).length, n: primite.length - n2 }));
    T('…cu raportul din Istoric, nu unul nou', (await istoric()) === ist2);

    // „Trimite acum", cu Brevo care refuză
    mod = 'ip';
    const urm = p.next_run;
    const ra = await json('POST', '/api/report-schedules/' + id + '/run', S);
    T('„Trimite acum": spune pe față că emailul n-a plecat și de ce (la noi)', ra.status === 200 && /^emailul n-a plecat: Brevo 401/.test(ra.j.emailText || ''), JSON.stringify(ra.j).slice(0, 300));
    p = await rand0();
    T('…și starea programării se schimbă („n-a putut pleca"), fără să mute rularea de mâine', p.ultima_stare === 'esuat' && p.next_run === urm);

    // Clientul: fără eroarea exactă
    const { puneParola } = require('./test_parola');
    const u = await json('POST', '/api/users', S, { username: 'sef@firma-raport.ro', email: 'sef@firma-raport.ro', full_name: 'Șef Raport', role: 'company_admin', company_id: co.id });
    await puneParola(u.j, 'Str4da-Verde-2026', B);
    const C = await login('sef@firma-raport.ro', 'Str4da-Verde-2026');
    const scC = await json('POST', '/api/report-schedules', C, { name: 'Foaia firmei', report_type: 'trips', imei: IMEI, period: 'yesterday', frequency: 'daily', hour: 6, format: 'xlsx', recipients: 'sef@firma-raport.ro' });
    const idC = scC.j && scC.j.id;
    const rC = async () => ((await json('GET', '/api/report-schedules', C)).j || []).filter((x) => x.id === idC)[0] || {};
    let pc = await rC();
    await tick(new Date(pc.next_run).getTime() + 60000);
    pc = await rC();
    T('clientul vede starea pe înțeles, fără eroarea exactă', !!idC && pc.ultima_stare === 'reincercare' && /n-a plecat; încercăm din nou la/.test(pc.stare_text || '') &&
      !/Brevo|401|unrecognised/.test(JSON.stringify(pc)), JSON.stringify({ sc: scC.t.slice(0, 120), pc }).slice(0, 300));
    const rc = await json('POST', '/api/report-schedules/' + idC + '/run', C);
    T('„Trimite acum" la client: „echipa RA Track a fost anunțată", fără Brevo', rc.status === 200 && rc.j.emailText === 'emailul n-a plecat; echipa RA Track a fost anunțată' &&
      !/Brevo|401/.test(JSON.stringify(rc.j)), JSON.stringify(rc.j).slice(0, 300));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
