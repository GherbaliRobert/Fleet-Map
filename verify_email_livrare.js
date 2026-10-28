// verify_email_livrare.js — emailul care a plecat, dar n-a ajuns, nu mai tace (Alin, 28.10, cu o captură: „programarea… e încă activă,
// eu nu primesc nimic. Și nici nu văd motivul și nici nu știu unde să mă uit").
//
//   node verify_email_livrare.js
//
// Aplicația îl preda lui Brevo și scria „a plecat pe email"; ce urma (livrat la Yahoo, refuzat, adresa blocată la Brevo, spam) nu
// știa nimeni. Ce păzește (cu un Brevo FALS, local — nu pleacă niciun email adevărat):
//   1. regulile (livrare.js): evenimentele Brevo → starea noastră, oricum ar fi scrise; ce e lămurit, ce se mai întreabă; textele
//      (adresa și motivul doar la noi; clientul află doar că n-a ajuns și că am fost anunțați);
//   2. mailer.js: întreabă evenimentele după id-ul emailului, deblochează o adresă, verifică Brevo fără să trimită nimic;
//   3. pe server pornit: verificarea de la pornire (Brevo refuză serverul → „Stare producție" roșie și anunțul nostru, fără niciun
//      email trimis); raportul programat pleacă → Brevo spune „blocat" → rândul programării spune de ce (la noi, cu „Deblochează la
//      Brevo"), clientul vede doar că n-a ajuns, noi și omul programării suntem anunțați o singură dată; „Deblochează" scoate
//      adresa; a doua zi „livrat"; un email din panoul Mail refuzat de serverul destinatarului ne anunță și el.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const MESAJ_IP = 'We have detected you are using an unrecognised IP address 34.56.78.90. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips';
// ─── Brevo fals: trimitere, cont, evenimente, adrese blocate ───
let contMod = 'ok', nrMesaj = 0;
const trimise = [], cereriEv = [], deblocate = [];
const evPe = {};   // messageId → evenimentele pe care le „știe" Brevo
let evMod = 'ok';  // 'ok' | '400' (cere o perioadă: răspunde 400 fără days)
const fals = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const trimiteJ = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(o == null ? '' : JSON.stringify(o)); };
    if (u.pathname === '/v3/account') {
      if (contMod === 'ip') return trimiteJ(401, { code: 'unauthorized', message: MESAJ_IP });
      return trimiteJ(200, { email: 'cont@ratrack.ro' });
    }
    if (u.pathname === '/v3/smtp/statistics/events' && req.method === 'GET') {
      const id = u.searchParams.get('messageId'), em = u.searchParams.get('email');
      cereriEv.push({ id, em, days: u.searchParams.get('days') });
      if (evMod === '400' && !u.searchParams.get('days')) return trimiteJ(400, { code: 'invalid_parameter', message: 'days or dates required' });
      const l = (evPe[id] || [{ event: 'requests', date: new Date().toISOString(), email: em, messageId: id }]).filter((e) => !em || !e.email || e.email === em);
      return trimiteJ(200, { events: l });
    }
    if (u.pathname.indexOf('/v3/smtp/blockedContacts/') === 0 && req.method === 'DELETE') {
      deblocate.push(decodeURIComponent(u.pathname.split('/').pop()));
      res.writeHead(204); return res.end();
    }
    if (u.pathname === '/v3/smtp/email' && req.method === 'POST') {
      let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
      nrMesaj++;
      const id = '<m' + nrMesaj + '@smtp-brevo.com>';
      trimise.push(Object.assign({ _id: id }, j));
      return trimiteJ(201, { messageId: id });
    }
    trimiteJ(404, { message: 'nu există' });
  });
});

(async () => {
  await new Promise((r) => fals.listen(0, '127.0.0.1', r));
  const URL_FALS = 'http://127.0.0.1:' + fals.address().port + '/v3/smtp/email';

  // ─── 1. Regulile ─────────────────────────────────────────────────────────────────────────────────────
  console.log('1. Regulile (livrare.js): evenimentele Brevo, ce e lămurit, textele');
  const lv = require('./livrare');
  const M = { delivered: 'livrat', hardBounces: 'respins', hard_bounce: 'respins', softBounces: 'amanat', deferred: 'amanat', blocked: 'blocat',
    spam: 'spam', invalid: 'invalid', error: 'eroare', requests: 'trimis', opened: 'deschis', loadedByProxy: 'deschis', unsubscribed: 'livrat' };
  T('fiecare eveniment Brevo → starea noastră, oricum ar fi scris', Object.keys(M).every((k) => lv.stareEveniment(k) === M[k]) && lv.stareEveniment('altceva') === null && lv.stareEveniment('') === null,
    JSON.stringify(Object.keys(M).map((k) => k + '=' + lv.stareEveniment(k))));
  const E = (ev, d, reason) => ({ event: ev, date: d, reason: reason });
  const s1 = lv.stareDinEvenimente([E('requests', '2026-10-28T05:02:01Z'), E('deferred', '2026-10-28T05:02:10Z', 'TSS04'), E('delivered', '2026-10-28T05:40:00Z')]);
  T('amânat, apoi livrat → „livrat", cu ora livrării', s1.stare === 'livrat' && s1.la === Date.parse('2026-10-28T05:40:00Z'), JSON.stringify(s1));
  const s2 = lv.stareDinEvenimente([E('requests', '2026-10-28T05:02:01Z'), E('blocked', '2026-10-28T05:02:02Z', 'hardBounce')]);
  T('blocat la Brevo → „blocat", cu motivul', s2.stare === 'blocat' && s2.motiv === 'hardBounce', JSON.stringify(s2));
  T('livrat, apoi marcat spam → „spam"', lv.stareDinEvenimente([E('delivered', '2026-10-28T05:03:00Z'), E('spam', '2026-10-28T09:00:00Z')]).stare === 'spam');
  const s4 = lv.stareDinEvenimente([E('hardBounces', '2026-10-28T05:02:10Z', '554 5.7.9 Message not accepted for policy reasons')]);
  T('refuzat definitiv → „respins", cu motivul serverului destinatarului', s4.stare === 'respins' && /policy/.test(s4.motiv), JSON.stringify(s4));
  T('doar primit de Brevo → „trimis"; nimic → „necunoscut"', lv.stareDinEvenimente([E('requests', '2026-10-28T05:02:01Z')]).stare === 'trimis' &&
    lv.stareDinEvenimente([]).stare === 'necunoscut' && lv.stareDinEvenimente(null).stare === 'necunoscut');
  const acum = Date.parse('2026-10-28T08:00:00Z');
  T('se mai întreabă: nelămurit și proaspăt; nu: lămurit, mai vechi de 3 zile, întrebat acum 3 minute',
    lv.deVerificat({ stare: 'trimis', trimis_la: acum - 3600e3 }, acum) && lv.deVerificat({ stare: 'amanat', trimis_la: acum - 3600e3, verificat_la: acum - 11 * 60e3 }, acum) &&
    !lv.deVerificat({ stare: 'livrat', trimis_la: acum - 3600e3 }, acum) && !lv.deVerificat({ stare: 'trimis', trimis_la: acum - 73 * 3600e3 }, acum) &&
    !lv.deVerificat({ stare: 'trimis', trimis_la: acum - 3600e3, verificat_la: acum - 3 * 60e3 }, acum));
  const bl = [{ catre: 'alin.tilvar@yahoo.com', stare: 'blocat', motiv: 'hardBounce', ref: 'sched:4' }];
  const rzN = lv.rezumat(bl, true), rzC = lv.rezumat(bl, false);
  T('la noi: adresa, de ce, și „Deblochează la Brevo"', rzN.fel === 'rau' && /alin\.tilvar@yahoo\.com/.test(rzN.text) && /lista lui de adrese blocate/.test(rzN.text) &&
    /Deblochează la Brevo/.test(rzN.text) && rzN.blocate[0] === 'alin.tilvar@yahoo.com', JSON.stringify(rzN));
  T('la client: doar că n-a ajuns și că echipa RA Track a fost anunțată — fără adresă, fără Brevo, fără motiv', rzC.fel === 'rau' &&
    rzC.text === 'nu a ajuns la destinatar; echipa RA Track a fost anunțată' && !rzC.blocate.length, JSON.stringify(rzC));
  const ok2 = lv.rezumat([{ catre: 'a@firma.ro', stare: 'livrat', la: Date.parse('2026-10-28T05:03:00Z') }, { catre: 'b@firma.ro', stare: 'deschis' }], true);
  T('toate livrate → „livrat la toate cele 2 adrese"; una → „livrat la yahoo.com (07:03)"', ok2.fel === 'ok' && ok2.text === 'livrat la toate cele 2 adrese' &&
    lv.rezumat([{ catre: 'x@yahoo.com', stare: 'livrat', la: Date.parse('2026-10-28T05:03:00Z') }], true).text === 'livrat la yahoo.com (07:03)', JSON.stringify(ok2));
  T('încă fără răspuns → „asteapta" (la client fără text în plus)', lv.rezumat([{ catre: 'a@b.ro', stare: 'trimis' }], true).fel === 'asteapta' &&
    lv.rezumat([{ catre: 'a@b.ro', stare: 'trimis' }], false).text === '');
  const an = lv.anunt([Object.assign({ unde: '„Foaia de dimineață"' }, bl[0])]);
  T('anunțul nostru: unde, ce s-a întâmplat, și unde e butonul (nu „de aici")', an && an.titlu === 'Un email n-a ajuns la destinatar' && /„Foaia de dimineață"/.test(an.body) &&
    /Rapoarte › Programări/.test(an.body) && !/de aici/.test(an.body), JSON.stringify(an));
  T('două emailuri → „2 emailuri n-au ajuns la destinatar"', lv.anunt([bl[0], { catre: 'z@y.ro', stare: 'invalid' }]).titlu === '2 emailuri n-au ajuns la destinatar');
  const toateTextele = ['livrat', 'deschis', 'amanat', 'trimis', 'respins', 'blocat', 'spam', 'invalid', 'eroare', 'deblocat'].map((st) => lv.textPentruNoi({ catre: 'a@b.ro', stare: st }) + ' ' + lv.ceFacem({ stare: st }));
  T('textele sunt în română: fără numele englezești ale evenimentelor', toateTextele.every((t) => !/\b(delivered|bounce|blocked|deferred|requests)\b/i.test(t)), toateTextele.join(' | '));

  // ─── 2. mailer.js ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\n2. mailer.js: evenimentele, deblocarea, verificarea fără email');
  for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_FROM', 'EMAIL_FROM', 'NOTIFY_EMAIL_TO']) delete process.env[k];
  process.env.BREVO_API_KEY = 'xkeysib-proba-fara-retea';
  process.env.BREVO_API_URL = URL_FALS;
  const mailer = require('./mailer');
  let vazut = null; mailer.setLaRezultat((r, m) => { vazut = { r, m }; });
  const r1 = await mailer.send({ to: 'alin@firma.ro', subject: 'Raport', text: 't', livrare: { ref: 'sched:1', fel: 'raport' } });
  T('trimiterea întoarce id-ul Brevo și calea; serverul primește și emailul (cu `livrare`)', r1.ok && r1.id === '<m1@smtp-brevo.com>' && r1.cale === 'brevo' &&
    vazut && vazut.m && vazut.m.livrare && vazut.m.livrare.ref === 'sched:1', JSON.stringify({ r1, m: vazut && vazut.m && vazut.m.livrare }));
  T('…iar Brevo nu primește câmpurile noastre (`livrare`)', !('livrare' in trimise[0]), Object.keys(trimise[0]).join(','));
  mailer.setLaRezultat(null);
  evPe['<m1@smtp-brevo.com>'] = [{ event: 'delivered', date: '2026-10-28T05:03:00Z', email: 'alin@firma.ro' }];
  const ev1 = await mailer.evenimente('<m1@smtp-brevo.com>', 'alin@firma.ro');
  T('evenimentele se cer după id-ul emailului și adresă', ev1.ok && ev1.evenimente.length === 1 && cereriEv[0].id === '<m1@smtp-brevo.com>' && cereriEv[0].em === 'alin@firma.ro', JSON.stringify({ ev1, c: cereriEv[0] }));
  evMod = '400';
  const ev2 = await mailer.evenimente('<m1@smtp-brevo.com>', 'alin@firma.ro');
  T('dacă Brevo cere o perioadă (400), se cere din nou cu 7 zile', ev2.ok && cereriEv[cereriEv.length - 1].days === '7', JSON.stringify(cereriEv.slice(-2)));
  evMod = 'ok';
  const db1 = await mailer.deblocheaza('Alin.Tilvar@Yahoo.com');
  T('„Deblochează": Brevo primește cererea pentru adresa respectivă', db1.ok && deblocate[0] === 'Alin.Tilvar@Yahoo.com', JSON.stringify({ db1, deblocate }));
  T('o adresă stricată nu pleacă spre Brevo', (await mailer.deblocheaza('nu-e-email')).ok === false && deblocate.length === 1);
  contMod = 'ip';
  const v1 = await mailer.verify();
  T('verificarea fără email: refuzul adresei serverului, cu mesajul lui Brevo (motivul: „ip")', v1.ok === false && /unrecognised IP/.test(v1.error) && mailer.motiv(v1.error).fel === 'ip', JSON.stringify(v1));
  contMod = 'ok';
  T('…și când Brevo primește serverul: ok', (await mailer.verify()).ok === true);
  T('verificarea nu a trimis niciun email', trimise.length === 1);

  // ─── 3. Pe server pornit ─────────────────────────────────────────────────────────────────────────────
  console.log('\n3. Pe server pornit: verificarea de la pornire, raportul care n-a ajuns, „Deblochează", emailul din panoul Mail');
  contMod = 'ip';   // Brevo refuză serverul încă de la pornire
  const PORT = 3356, TCP = 5356, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_livrare_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_livrare', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, BREVO_API_KEY: 'xkeysib-proba-fara-retea', BREVO_API_URL: URL_FALS, EMAIL_FROM: 'RA Track <contact@ratrack.ro>',
    BASE_URL: 'https://ratrack.ro', EMAIL_VERIFICARE_LA_MS: '1500', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300', RATE_LIMIT_ENABLED: 'false' });
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
    const nTrimise0 = trimise.length;
    let h = { t: '' };
    for (let i = 0; i < 20; i++) { h = await json('GET', '/api/admin/health', S); if (/la verificarea de/.test(h.t)) break; await sleep(500); }
    T('la pornire, fără niciun email: „Stare producție" roșie — Brevo refuză serverul, cu ce e de făcut',
      /DAR la verificarea de [^)]*\(fără niciun email trimis\) Brevo a refuzat serverul/.test(h.t) && /Authorised IPs/.test(h.t), (h.t.match(/"smtp"[^}]*}/) || [h.t.slice(0, 300)])[0]);
    const nPornire = ((await json('GET', '/api/notifications?limit=50', S)).j || []).filter((x) => x.type === 'email_esuat');
    T('…și anunțul nostru pe loc: „Emailurile nu vor putea pleca", verificat fără email', nPornire.length === 1 && /fără niciun email trimis/.test(nPornire[0].body) && /Authorised IPs/.test(nPornire[0].body),
      JSON.stringify(nPornire).slice(0, 300));
    T('verificarea n-a trimis niciun email', trimise.length === nTrimise0);
    contMod = 'ok';
    const vf = await json('POST', '/api/test/ceasuri', S, { verificareEmail: true });
    h = await json('GET', '/api/admin/health', S);
    T('Brevo primește din nou serverul → rândul spune „Brevo primește serverul (verificat …, fără email trimis)"', vf.j.verificareEmail && vf.j.verificareEmail.ok === true &&
      /Brevo primește serverul \(verificat [^)]*, fără email trimis\)/.test(h.t) && !/Brevo a refuzat serverul/.test(h.t), (h.t.match(/"smtp"[^}]*}/) || [h.t.slice(0, 300)])[0]);

    // Raportul programat al unei firme
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Livrare SRL' })).j;
    const IMEI = '862129084939977';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: IMEI, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }] });
    await json('PUT', '/api/devices/' + IMEI + '/company', S, { company_id: co.id });
    const { puneParola } = require('./test_parola');
    const nInv = trimise.length;
    const u = await json('POST', '/api/users', S, { username: 'sef@firma-livrare.ro', email: 'sef@firma-livrare.ro', full_name: 'Șef Livrare', role: 'company_admin', company_id: co.id });
    // Brevo merge, deci invitația pleacă pe email (fără link în răspuns): linkul îl luăm din emailul primit de Brevo-ul fals.
    const inv = trimise.slice(nInv).filter((x) => x.to && x.to[0] && x.to[0].email === 'sef@firma-livrare.ro')[0] || {};
    const mLink = String(inv.textContent || inv.htmlContent || '').match(/https?:\/\/[^\s"<]*token=[A-Za-z0-9_-]+/);
    await puneParola(Object.assign({}, u.j, { link: u.j.link || (mLink && mLink[0]) }), 'Str4da-Verde-2026', B);
    const C = await login('sef@firma-livrare.ro', 'Str4da-Verde-2026');
    const sc = await json('POST', '/api/report-schedules', C, { name: 'Foaia de dimineață', report_type: 'trips', imei: IMEI, period: 'yesterday', frequency: 'daily', hour: 7, format: 'xlsx', recipients: 'alin.tilvar@yahoo.com' });
    T('programarea clientului: Foaie de parcurs la 7, pe email', sc.status === 200 && sc.j && sc.j.id, sc.t.slice(0, 200));
    const id = sc.j.id;
    const randS = async () => ((await json('GET', '/api/report-schedules', S)).j || []).filter((x) => x.id === id)[0] || {};
    const randC = async () => ((await json('GET', '/api/report-schedules', C)).j || []).filter((x) => x.id === id)[0] || {};
    let p = await randS();
    const t0 = new Date(p.next_run).getTime() + 60000;
    const n0 = trimise.length;
    await json('POST', '/api/test/ceasuri', S, { acum: t0, rapoarte: true });
    const em = trimise[n0] || {};
    T('la 7: raportul pleacă spre Brevo', trimise.length === n0 + 1 && em.to && em.to[0].email === 'alin.tilvar@yahoo.com', JSON.stringify(em.to));
    p = await randS();
    T('imediat după: la noi „a plecat pe email · Brevo l-a primit; încă nu știm dacă a ajuns", gri', /a plecat pe email · Brevo l-a primit; încă nu știm dacă a ajuns la alin\.tilvar@yahoo\.com/.test(p.stare_text || '') &&
      p.livrare_fel === 'asteapta', JSON.stringify({ t: p.stare_text, f: p.livrare_fel }));
    let pc = await randC();
    T('…la client doar „a plecat pe email."', /a plecat pe email\.$/.test(pc.stare_text || '') && !/Brevo/.test(JSON.stringify(pc)), pc.stare_text);

    // Brevo spune: adresa e blocată
    evPe[em._id] = [{ event: 'requests', date: new Date(t0).toISOString(), email: 'alin.tilvar@yahoo.com' },
      { event: 'blocked', date: new Date(t0 + 2000).toISOString(), email: 'alin.tilvar@yahoo.com', reason: 'contact blocked (hard bounce)' }];
    const lv1 = await json('POST', '/api/test/ceasuri', S, { livrare: true });
    T('aplicația întreabă Brevo ce s-a întâmplat (doar citește)', lv1.j.livrare && lv1.j.livrare.verificate >= 1 && lv1.j.livrare.rele === 1 && cereriEv.some((x) => x.id === em._id), JSON.stringify(lv1.j.livrare));
    p = await randS();
    T('la noi: „a plecat pe email, dar Brevo nu mai trimite la alin.tilvar@yahoo.com: adresa e pe lista lui de adrese blocate", roșu, cu butonul',
      /a plecat pe email, dar Brevo nu mai trimite la alin\.tilvar@yahoo\.com: adresa e pe lista lui de adrese blocate/.test(p.stare_text || '') &&
      p.livrare_fel === 'rau' && Array.isArray(p.livrare_blocate) && p.livrare_blocate[0] === 'alin.tilvar@yahoo.com', JSON.stringify({ t: p.stare_text, f: p.livrare_fel, b: p.livrare_blocate }));
    pc = await randC();
    T('la client: „a plecat pe email, dar nu a ajuns la destinatar; echipa RA Track a fost anunțată" — fără adresă, fără Brevo, fără buton',
      pc.stare_text && /a plecat pe email, dar nu a ajuns la destinatar; echipa RA Track a fost anunțată\.$/.test(pc.stare_text) && pc.livrare_fel === 'rau' &&
      !pc.livrare_blocate && !/Brevo|blocat|hard bounce/i.test(JSON.stringify(pc)), JSON.stringify(pc).slice(0, 300));
    const notifS = ((await json('GET', '/api/notifications?limit=50', S)).j || []).filter((x) => x.type === 'email_nelivrat');
    T('noi primim anunțul „Un email n-a ajuns la destinatar", cu programarea și unde e butonul', notifS.length === 1 && /„Foaia de dimineață"/.test(notifS[0].body) &&
      /Rapoarte › Programări/.test(notifS[0].body), JSON.stringify(notifS).slice(0, 300));
    const notifC = ((await json('GET', '/api/notifications?limit=50', C)).j || []).filter((x) => x.type === 'report_email_nelivrat');
    T('omul programării află: „Emailul cu raportul n-a ajuns", raportul e în Istoric — fără adresă și fără motiv', notifC.length === 1 && /n-a ajuns/.test(notifC[0].title) &&
      /Istoric rapoarte/.test(notifC[0].body) && !/yahoo|Brevo|blocat/i.test(notifC[0].body), JSON.stringify(notifC).slice(0, 300));
    h = await json('GET', '/api/admin/health', S);
    T('„Stare producție": portocaliu — ultimul email lămurit n-a ajuns, de ce, ce e de făcut', /DAR ultimul email lămurit n-a ajuns/.test(h.t) && /lista lui de adrese blocate/.test(h.t),
      (h.t.match(/"smtp"[^}]*}/) || [h.t.slice(0, 300)])[0]);
    const lv2 = await json('POST', '/api/test/ceasuri', S, { livrare: true });
    const notifS2 = ((await json('GET', '/api/notifications?limit=50', S)).j || []).filter((x) => x.type === 'email_nelivrat');
    T('un email lămurit nu se mai întreabă și nu ne anunță a doua oară', lv2.j.livrare && lv2.j.livrare.verificate === 0 && notifS2.length === 1, JSON.stringify(lv2.j.livrare));

    // „Deblochează la Brevo"
    const dbC = await json('POST', '/api/admin/email/deblocheaza', C, { email: 'alin.tilvar@yahoo.com' });
    T('clientul nu poate debloca (doar noi)', dbC.status === 403, String(dbC.status));
    const nDeb = deblocate.length;
    const dbS = await json('POST', '/api/admin/email/deblocheaza', S, { email: 'alin.tilvar@yahoo.com' });
    T('„Deblochează la Brevo": Brevo scoate adresa, iar aplicația o spune', dbS.status === 200 && deblocate.length === nDeb + 1 && deblocate[deblocate.length - 1] === 'alin.tilvar@yahoo.com' &&
      /a fost scoasă de pe lista de adrese blocate la Brevo/.test(dbS.j.text || ''), JSON.stringify(dbS.j));
    p = await randS();
    T('…rândul programării nu mai e roșu și spune că următorul email pleacă normal', p.livrare_fel !== 'rau' && !p.livrare_blocate &&
      /scoasă de pe lista de adrese blocate la Brevo; următorul email pleacă normal/.test(p.stare_text || ''), JSON.stringify({ t: p.stare_text, f: p.livrare_fel }));

    // A doua zi: livrat
    const t1 = new Date(p.next_run).getTime() + 60000;
    const n1 = trimise.length;
    await json('POST', '/api/test/ceasuri', S, { acum: t1, rapoarte: true });
    const em2 = trimise[n1] || {};
    evPe[em2._id] = [{ event: 'requests', date: new Date(t1).toISOString(), email: 'alin.tilvar@yahoo.com' },
      { event: 'delivered', date: new Date(t1 + 60000).toISOString(), email: 'alin.tilvar@yahoo.com' }];
    await json('POST', '/api/test/ceasuri', S, { livrare: true });
    p = await randS(); pc = await randC();
    T('a doua zi: „a plecat pe email · livrat la yahoo.com (ora)" la noi; „a ajuns la destinatar" la client', /a plecat pe email · livrat la yahoo\.com \(\d{2}:\d{2}\)\./.test(p.stare_text || '') &&
      p.livrare_fel === 'ok' && /a plecat pe email · a ajuns la destinatar\./.test(pc.stare_text || ''), JSON.stringify({ s: p.stare_text, c: pc.stare_text }));
    h = await json('GET', '/api/admin/health', S);
    T('„Stare producție" redevine verde, cu ultimul email livrat', /ultimul email livrat:/.test(h.t) && !/DAR ultimul email/.test(h.t), (h.t.match(/"smtp"[^}]*}/) || [h.t.slice(0, 300)])[0]);

    // Un email din panoul Mail, refuzat de serverul destinatarului
    const nm = trimise.length;
    const ms = await json('POST', '/api/mail/trimite', S, { de_la: 'contact@ratrack.ro', catre: 'nu.exista@client.ro', subiect: 'Programare montaj', text: 'Vă confirmăm ziua.' });
    const em3 = trimise[nm] || {};
    T('emailul din panoul Mail pleacă', ms.status === 200 && em3._id, ms.t.slice(0, 200));
    evPe[em3._id] = [{ event: 'hardBounces', date: new Date().toISOString(), email: 'nu.exista@client.ro', reason: '550 5.1.1 The email account that you tried to reach does not exist' }];
    await json('POST', '/api/test/ceasuri', S, { livrare: true });
    const notifS3 = ((await json('GET', '/api/notifications?limit=50', S)).j || []).filter((x) => x.type === 'email_nelivrat');
    T('…refuzat de serverul destinatarului → anunțul nostru spune felul („Mesaj"), adresa și motivul', notifS3.length === 2 && /Mesaj: serverul de email al lui nu\.exista@client\.ro l-a refuzat \(550 5\.1\.1/.test(notifS3[0].body),
      JSON.stringify(notifS3.map((x) => x.body)).slice(0, 400));
  } catch (e) { rele++; console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); }

  // ─── 4. În cod ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\n4. În cod: pe unde trece, ce nu se urmărește');
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const RS = fs.readFileSync(path.join(__dirname, 'report_schedules.js'), 'utf8');
  const CH = fs.readFileSync(path.join(__dirname, 'channels.js'), 'utf8');
  const BK = require('./backup');
  T('raportul programat cere urmărirea (`livrare` cu `sched:<id>`), iar channels.js o dă mai departe', /livrare: \{ ref: 'sched:' \+ s\.id/.test(RS) && /if \(opts && opts\.livrare\) msg\.livrare = opts\.livrare/.test(CH));
  T('se urmăresc doar emailurile cu `livrare` sau `jurnal` (alertele unei firme nu)', /!\(m\.livrare \|\| m\.jurnal\)\) return;/.test(SRV));
  T('urma livrărilor nu intră în copii (exclusă, cu motiv)', Object.prototype.hasOwnProperty.call(BK.BACKUP_EXCLUDED, 'email_livrari') && !BK.BUSINESS_TABLES.includes('email_livrari'));
  T('verificarea pornește singură la pornire și din oră în oră; întrebarea de livrare la 5 minute', /setTimeout\(\(\) => _verificaEmailServer\(\)/.test(SRV) &&
    /setInterval\(\(\) => _verificaEmailServer\(\)\.catch\(\(\) => \{\}\), 60 \* 60 \* 1000\)/.test(SRV) && /setInterval\(\(\) => livrareEmailTick\(\)\.catch\(\(\) => \{\}\), 5 \* 60 \* 1000\)/.test(SRV));
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  T('pagina: culoarea după livrare și butonul „Deblochează la Brevo" (adresa din atribut, nu din cod)', /sch-st-' \+ E\(cls\)/.test(PAG) && /data-email="' \+ E\(em\) \+ '" onclick="schedDeblocheaza\(this\.dataset\.email, this\)"/.test(PAG));
  const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
  T('culorile noi au pereche pe tema închisă', /\.sch-next\.sch-st-nelivrat \{/.test(CSS) && /body\.dark \.sch-next\.sch-st-nelivrat \{/.test(CSS) && /body\.dark \.sch-debloc \{/.test(CSS));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a căzut: ' + (e && e.stack || e)); process.exit(1); });
