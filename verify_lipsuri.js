// verify_lipsuri.js — în Contracte, fiecare lipsă are butonul ei, chiar pe rând (Alin, 24.09).
//
//   node verify_lipsuri.js
//
// Alin: „buton de trimitere fix acolo unde lipsește". Lista spunea CE lipsește dintr-un dosar, dar ca
// să rezolvi intrai în fișa firmei, pe fila Contract, și căutai câmpul. Acum:
//   • ce completăm noi (CUI, sediu, reprezentant) → „Completează", o fereastră mică, cu ANAF;
//   • pasul contractului → „Aprobă" → „Trimite la semnat" (email cu PDF-ul atașat) → „E semnat";
//   • ce vine de la client după semnare (actul scanat, acordul GDPR) → „Încarcă".
// Proba pornește serverul cu un server de email FALS (SMTP pe 127.0.0.1) și verifică ce pleacă de-adevăratelea.

const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const dbSrc = fs.readFileSync('./db.js', 'utf8');
const fara = (s) => s.replace(/^\s*\/\/.*$/gm, '');

sect('1. Pe ecran: butonul stă pe rândul lipsei');
T('rândul din Contracte desenează lipsurile CU butoane', /var lipsuriHtml = _ctreLipsuriHtml\(c\);/.test(html));
T('...și pasul următor sub stare', /_ctrePasHtml\(c\) \+ '<\/div><\/td>'/.test(html));
T('datele firmei lipsă → „Completează"', /raxCtreCompleteaza\(' \+ c\.company_id \+ '\)"><i class="fas fa-pen-to-square"><\/i> Completează/.test(html));
T('actul semnat lipsă → „Încarcă semnat"', /Încarcă semnat<\/button>/.test(html));
T('acordul GDPR lipsă → „Încarcă acordul"', /Încarcă acordul<\/button>/.test(html));
T('data semnării lipsă → „Pune data"', /Pune data<\/button>/.test(html));
T('ciornă → „Aprobă"; aprobat → „Trimite la semnat"; trimis → „E semnat"',
  /fa-check"><\/i> Aprobă<\/button>/.test(html) && /fa-paper-plane"><\/i> Trimite la semnat<\/button>/.test(html) && /fa-file-signature"><\/i> E semnat<\/button>/.test(html));
T('fără email pe server, butonul NU promite trimiterea („Am trimis-o")', /_raxCtre\.trimite\s*\n?\s*\? '<button class="rax-btn primary ctre-pas" onclick="raxCtreTrimite/.test(html) && /Am trimis-o<\/button>/.test(html));
T('„Completează" scrie pe ruta care atinge DOAR ce trimite', /\/api\/companies\/' \+ companyId \+ '\/dosar'/.test(html));

sect('2. Pe server: regulile');
T('ruta de trimitere există și e doar a noastră', /app\.post\('\/api\/contracts\/:id\/trimite', requireAuth, requireSuperadmin/.test(server));
const fnTrim = server.slice(server.indexOf("app.post('/api/contracts/:id/trimite'"), server.indexOf("// Ciorna contractului, în PDF"));
T('o ciornă nu pleacă la semnat', /c\.status === 'ciorna'\) return res\.status\(400\)/.test(fnTrim));
T('nici cu goluri pe hârtie (CUI, sediu, reprezentant)', /\['cui', 'sediu', 'reprezentant'\]\.indexOf\(k\) >= 0/.test(fnTrim));
T('fără SMTP spune pe față că nu poate (nu minte că a trimis)', /faraEmail: true/.test(fnTrim) && /status\(503\)/.test(fnTrim));
T('PDF-ul atașat e ACELAȘI cu cel de la „Descarcă" (contractPdf, nu o copie)', /_pdfInBuffer\(contractPdf\.contractPdf\(/.test(fnTrim));
T('starea „trimis" se scrie DUPĂ ce emailul a plecat', fnTrim.indexOf('if (!r.ok) return res.status(502)') > 0 && fnTrim.indexOf("status = 'trimis'") > fnTrim.indexOf('if (!r.ok) return res.status(502)'));
T('răspunsul clientului vine la adresa noastră (replyTo)', /replyTo: emitent\.email/.test(fnTrim) && /replyTo: m\.replyTo/.test(fs.readFileSync('./mailer.js', 'utf8')));
const fnDosar = dbSrc.slice(dbSrc.indexOf('async function completeazaDosarFirma('), dbSrc.indexOf('async function deleteCompany('));
T('„Completează" scrie doar câmpurile trimise', /if \(d\[k\] !== undefined\) pune\(k, d\[k\]\)/.test(fnDosar) && !/phone|iban|bank_name/.test(fara(fnDosar)));

// ─── 3. Pe server pornit, cu un server de email FALS ─────────────────────────────────────────
const mesaje = [];
function smtpFals(port) {
  return new Promise((resolve) => {
    const srv = net.createServer((s) => {
      let buf = '', inData = false, data = '', catre = [], pasLogin = 0;
      s.write('220 fals ESMTP\r\n');
      s.on('data', (b) => {
        buf += b.toString('binary');
        let i;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const linie = buf.slice(0, i); buf = buf.slice(i + 2);
          if (inData) {
            if (linie === '.') { inData = false; mesaje.push({ catre: catre.slice(), date: data }); data = ''; catre = []; s.write('250 primit\r\n'); }
            else data += linie + '\r\n';
            continue;
          }
          const L = linie.toUpperCase();
          if (pasLogin === 1) { pasLogin = 2; s.write('334 UGFzc3dvcmQ6\r\n'); continue; }
          if (pasLogin === 2) { pasLogin = 0; s.write('235 ok\r\n'); continue; }
          if (L.startsWith('EHLO') || L.startsWith('HELO')) s.write('250-fals\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
          else if (L.startsWith('AUTH LOGIN')) { pasLogin = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
          else if (L.startsWith('AUTH')) s.write('235 ok\r\n');
          else if (L.startsWith('MAIL FROM')) s.write('250 ok\r\n');
          else if (L.startsWith('RCPT TO')) { catre.push(linie.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '')); s.write('250 ok\r\n'); }
          else if (L === 'DATA') { inData = true; s.write('354 da-i drumul\r\n'); }
          else if (L === 'QUIT') { s.write('221 pa\r\n'); s.end(); }
          else if (L === 'RSET' || L === 'NOOP') s.write('250 ok\r\n');
          else s.write('250 ok\r\n');
        }
      });
      s.on('error', () => {});
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const PORT = 3225, SMTP = 2526, DIR = '.lipsuri-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_lips',
  PORT: String(PORT), TCP_PORT: '5225', PGLITE_DIR: DIR + '/pgdata',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP), SMTP_USER: 'proba', SMTP_PASS: 'proba', SMTP_FROM: 'RA Tracks <noreply@ratrack.ro>' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null, smtp = null;
function gata() {
  try { srv && srv.kill(); } catch (e) {}
  try { smtp && smtp.close(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
(async () => {
  smtp = await smtpFals(SMTP);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('3. Pe server pornit, cu email fals');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', phone: '0700 000 000', vat_rate: 19 } });

  // O firmă cu telefon și IBAN, dar fără CUI, sediu, reprezentant și email.
  const co = (await R('POST', '/api/companies', { name: 'Lipsuri SRL' })).j;
  await R('PUT', '/api/companies/' + co.id, { name: 'Lipsuri SRL', phone: '0722 111 222', iban: 'RO49AAAA1B31007593840000' });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { status: 'ciorna', months: 12, gdpr: { kind: 'anexa' } })).j;
  const rand = async () => (((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c.id)[0] || {};
  let r0 = await rand();
  T('lista spune ce lipsește din dosar', ['cui', 'sediu', 'reprezentant'].every((k) => (r0.dosar.lipsuri || []).indexOf(k) >= 0), JSON.stringify(r0.dosar));
  T('...și că serverul poate trimite pe email', ((await R('GET', '/api/contracts')).j || {}).trimite_pe_email === true);

  T('o ciornă NU pleacă la semnat', (await R('POST', '/api/contracts/' + c.id + '/trimite', { catre: 'client@firma.ro' })).s === 400);
  T('„Aprobă"', (await R('PUT', '/api/contracts/' + c.id, { status: 'aprobat' })).s === 200);
  const tGol = await R('POST', '/api/contracts/' + c.id + '/trimite', { catre: 'client@firma.ro' });
  T('cu goluri pe hârtie NU pleacă — și spune ce lipsește', tGol.s === 400 && (tGol.j.lipsuri || []).length === 3, JSON.stringify(tGol.j));
  T('...și nu s-a trimis niciun email', mesaje.filter((m) => m.catre.indexOf('client@firma.ro') >= 0).length === 0);

  T('„Completează": email stricat → refuzat', (await R('PUT', '/api/companies/' + co.id + '/dosar', { contact_email: 'nu-e-email' })).s === 400);
  T('„Completează": denumirea nu poate rămâne goală', (await R('PUT', '/api/companies/' + co.id + '/dosar', { name: '  ' })).s === 400);
  const dz = await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO12345678', address: 'Str. Unu 1, Timișoara', legal_rep: { name: 'Ion Lipsă', role: 'Administrator' } });
  T('„Completează" scrie CUI, sediul, reprezentantul', dz.s === 200 && dz.j.company.cui === 'RO12345678' && dz.j.company.legal_rep && dz.j.company.legal_rep.name === 'Ion Lipsă', JSON.stringify(dz.j));
  const ov = ((await R('GET', '/api/companies/' + co.id + '/overview')).j || {}).company || {};
  T('...fără să șteargă telefonul și IBAN-ul (ce NU a trimis)', ov.phone === '0722 111 222' && ov.iban === 'RO49AAAA1B31007593840000', ov.phone + ' / ' + ov.iban);
  r0 = await rand();
  T('lipsurile firmei au dispărut din listă', !(r0.dosar.lipsuri || []).length, JSON.stringify(r0.dosar));

  const faraAdresa = await R('POST', '/api/contracts/' + c.id + '/trimite', {});
  T('fără nicio adresă de email: cere una', faraAdresa.s === 400 && /email/.test(faraAdresa.j.error));
  T('adresă stricată: refuzată', (await R('POST', '/api/contracts/' + c.id + '/trimite', { catre: 'client@' })).s === 400);

  const t1 = await R('POST', '/api/contracts/' + c.id + '/trimite', { catre: 'client@firma.ro' });
  T('„Trimite la semnat" pleacă', t1.s === 200 && t1.j.status === 'trimis' && t1.j.trimis_la === 'client@firma.ro', JSON.stringify(t1.j));
  await sleep(300);
  const m1 = mesaje.filter((m) => m.catre.indexOf('client@firma.ro') >= 0)[0];
  T('emailul chiar a ajuns la client', !!m1);
  if (m1) {
    const d = m1.date;
    T('...cu subiectul contractului', /Subject: .*Contractul/i.test(d) || /Subject: =\?UTF-8\?/i.test(d));
    T('...cu PDF-ul atașat', /Content-Type: application\/pdf/i.test(d) && /JVBERi0/.test(d));
    T('...cu numele casei pe fișier (RA-Tracks - Contract …)', /RA-Tracks/.test(d) && /Contract/.test(d));
    T('...iar răspunsul lor vine la noi (Reply-To)', /Reply-To: office@ratrack\.ro/i.test(d));
  }
  r0 = await rand();
  T('starea e „trimis", cu ziua și adresa (scrise de server)', r0.status === 'trimis' && r0.sent_to === 'client@firma.ro' && r0.sent_at > 0, JSON.stringify({ s: r0.status, t: r0.sent_to }));
  T('firma a primit emailul la care am trimis (nu-l mai tastăm)', r0.contact_email === 'client@firma.ro');
  T('„Retrimite" merge cât e „trimis"', (await R('POST', '/api/contracts/' + c.id + '/trimite', {})).s === 200);
  // „E semnat": fișierul + starea
  const pdfMic = Buffer.from('%PDF-1.4\n%proba\n').toString('base64');
  T('„E semnat": fișierul semnat intră în dosar', (await R('POST', '/api/contracts/' + c.id + '/file', { care: 'contract', name: 'semnat.pdf', b64: pdfMic })).s === 200);
  T('...și contractul trece în vigoare, cu data', (await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() })).s === 200);
  T('un contract semnat nu mai pleacă la semnat', (await R('POST', '/api/contracts/' + c.id + '/trimite', {})).s === 400);
  r0 = await rand();
  T('dosarul semnat, cu actul încărcat, e „în regulă"', r0.dosar && r0.dosar.nivel === 'ok', JSON.stringify(r0.dosar));
  const au = ((await R('GET', '/api/audit?limit=50')).j || []);
  const lista = Array.isArray(au) ? au : (au.rows || au.entries || []);
  T('trimiterea lasă rând în jurnalul de audit', lista.some((x) => x.action === 'send' && x.entity === 'contract'), lista.slice(0, 3).map((x) => x.action + ' ' + x.entity).join(' | '));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
