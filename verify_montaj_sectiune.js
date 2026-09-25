// verify_montaj_sectiune.js — secțiunea Business → Montaj: parteneri, contracte cu ei, toate lucrările.
//
//   node verify_montaj_sectiune.js
//
// Alin (24.09): „în Business, secțiune de partener montaj, unde adăugăm parteneri, semnăm contracte fix
// la fel ca la clienți. Logica din spate o va face Robert în interfața lor." Partenerii stăteau la coada
// ecranului Contracte, fără contract și fără date juridice. Proba ține: meniul și secțiunea, datele
// partenerului (care nu se golesc la o salvare veche), contractul pe tot drumul (ciornă → aprobat →
// trimis pe email → semnat → încuiat → încheiat), hârtia (clauzele care contează) și lista lucrărilor.

const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');

sect('1. Secțiunea și locul ei');
T('rând „Montaj" în meniul Business, prin navGo', /navGo\(this, function\(\)\{ goSistem\('montaj'\); \}\)"><i class="fas fa-screwdriver-wrench"><\/i><span>Montaj<\/span>/.test(html));
T('numele secțiunii = numele rândului (_RAX_NUME)', /montaj: 'Montaj'/.test(html));
T('are containerul ei și se încarcă la deschidere', /<div id="admin-tab-montaj" style="display:none;"><\/div>/.test(html) && /name === 'montaj'\) \{\s*\n\s*if \(window\.raxLoadMontaj\)/.test(html));
T('e strict a fondatorilor', /name === 'contracte' \|\| name === 'montaj'\) && !can\('manageCompanies'\)/.test(html));
const randCtr = html.slice(html.indexOf('window.raxRenderContracte = function'), html.indexOf('window.raxRenderContracte = function') + 2500);
T('partenerii NU mai stau în ecranul Contracte', !/_raxParteneriHtml\(\)|raxParteneriIncarca\(\)/.test(randCtr));
T('trei file: Parteneri · Contracte cu partenerii · Lucrări', /var MJ_FILE = \[\['parteneri', 'Parteneri'\], \['contracte', 'Contracte cu partenerii'\], \['lucrari', 'Lucrări'\]\];/.test(html));
T('fișa partenerului are datele juridice și ANAF', ['pt-reg', 'pt-addr', 'pt-rep', 'pt-email', 'pt-iban', 'pt-zona'].every((id) => html.indexOf("'" + id + "'") > 0) && /raxPartAnaf\(\)/.test(html));
T('lucrările se editează tot din fișa clientului (aici doar „La client")', /raxOpenCompanyDetail\(' \+ m\.company_id \+ ', \\'contract\\'\)/.test(html));
const blocMj = html.slice(html.indexOf('// ─── Secțiunea „Montaj"'), html.indexOf('// ─── Fila „Contract": dosarul juridic'));
T('contractul unui partener e „trimis la partener", nu „la client"', /'trimis la partener'/.test(blocMj) && !/CTR_STARI\[c\.status\]/.test(blocMj));
T('fișa partenerului are „Stare": activ / inactiv, și se trimite la salvare', /id="pt-activ"/.test(blocMj) && /active: v\('pt-activ'\) !== '0'/.test(blocMj));
T('ștergerea arată refuzul serverului (nu tace)', /raxPartSterge[\s\S]{0,700}if \(!r\.ok\)/.test(blocMj));
T('un partener inactiv nu se mai propune la o lucrare nouă', /_raxMont\.parteneri\.filter\(function \(p\) \{ return p\.active !== false \|\| p\.id === e\.partener_id; \}\)/.test(html));
['/api/montaj/contracte', '/api/montaj/contracte/:id', '/api/montaj/contracte/:id/pdf', '/api/montaj/contracte/:id/trimite', '/api/montaj/lucrari'].forEach((r) => {
  const re = new RegExp("app\\.(get|post|put|delete)\\('" + r.replace(/\//g, '\\/') + "', requireAuth, requireSuperadmin");
  T('ruta ' + r + ' e doar a noastră', re.test(server));
});

sect('2. Hârtia contractului de colaborare');
const CP = require('./contract_pdf.js');
const texte = [];
const A4 = { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } };
const carton = {
  page: A4, x: 50, y: 50, _pagini: 1,
  font() { return this; }, fontSize() { return this; }, fillColor() { return this; }, strokeColor() { return this; },
  lineWidth() { return this; }, moveTo() { return this; }, lineTo() { return this; }, stroke() { return this; }, image() { return this; },
  widthOfString(s) { return String(s == null ? '' : s).length * 4.6; },
  addPage() { this._pagini++; this.y = 50; return this; }, moveDown(n) { this.y += 12 * (n == null ? 1 : n); return this; },
  text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') this.y = y + 11; else this.y += 11; return this; }
};
const zi = Date.parse('2026-09-24T12:00:00Z');
CP.scrieContractMontaj(carton, {
  contract: { number: 'RAT-M-2026-0001', status: 'aprobat', signed_at: zi, start_at: zi, months: 12, notice_days: 30, plata_zile: 15,
    tarife: { gps: 60, lvcan: 40, deplasare: 1.5 }, zona: 'Timiș, Arad' },
  partener: { name: 'Instal GPS Vest SRL', cui: 'RO111', address: 'Timișoara', email: 'office@instal.ro', legal_rep: { name: 'Vasile Pop', role: 'Administrator' } },
  emitent: { name: 'RA TRACKS SRL', cui: 'RO999' }
});
const tot = texte.join(' ');
T('e contract de COLABORARE, nu de prestări către client', texte.indexOf('CONTRACT DE COLABORARE') >= 0);
T('partenerul e PRESTATORUL, noi BENEFICIARUL', texte.indexOf('PRESTATOR') >= 0 && texte.indexOf('BENEFICIAR') >= 0 && texte.indexOf('Instal GPS Vest SRL') >= 0);
T('zona în care lucrează', /în zona: Timiș, Arad\./.test(tot));
T('el ne facturează lunar, cu termenul scris („15 zile")', /facturează lunar lucrările executate/.test(tot) && /în termen de 15 zile/.test(tot));
T('e SUBÎMPUTERNICIT GDPR (vede date ale clienților)', /SUBÎMPUTERNICIT al Beneficiarului/.test(tot) && /art\. 28 alin\. \(4\)/.test(tot));
T('nu ia clienții noștri 12 luni (clauza de nesolicitare)', /nu oferă direct clienților Beneficiarului/.test(tot));
T('Anexa nr. 1 — tarifele, în lei, românește', texte.indexOf('ANEXA nr. 1 — Tarifele lucrărilor') >= 0 && texte.some((t) => t === '60,00 lei') && texte.some((t) => t === '1,50 lei'));
T('Anexa nr. 2 — acordul de prelucrare', texte.indexOf('ANEXA nr. 2 — Acord de prelucrare a datelor cu caracter personal') >= 0);
T('fără cuvântul „plan"', !/\bplan(ul)?\b/i.test(tot));

// ─── 3. Pe server pornit ─────────────────────────────────────────────────────────────────────
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
          if (inData) { if (linie === '.') { inData = false; mesaje.push({ catre: catre.slice(), date: data }); data = ''; catre = []; s.write('250 primit\r\n'); } else data += linie + '\r\n'; continue; }
          const L = linie.toUpperCase();
          if (pasLogin === 1) { pasLogin = 2; s.write('334 UGFzc3dvcmQ6\r\n'); continue; }
          if (pasLogin === 2) { pasLogin = 0; s.write('235 ok\r\n'); continue; }
          if (L.startsWith('EHLO') || L.startsWith('HELO')) s.write('250-fals\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
          else if (L.startsWith('AUTH LOGIN')) { pasLogin = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
          else if (L.startsWith('AUTH')) s.write('235 ok\r\n');
          else if (L.startsWith('RCPT TO')) { catre.push(linie.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '')); s.write('250 ok\r\n'); }
          else if (L === 'DATA') { inData = true; s.write('354 da-i drumul\r\n'); }
          else if (L === 'QUIT') { s.write('221 pa\r\n'); s.end(); }
          else s.write('250 ok\r\n');
        }
      });
      s.on('error', () => {});
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
const PORT = 3227, SMTP = 2527, DIR = '.montaj-sect-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_mj',
  PORT: String(PORT), TCP_PORT: '5227', PGLITE_DIR: DIR + '/pgdata',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP), SMTP_USER: 'proba', SMTP_PASS: 'proba' };
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
  sect('3. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const R = async (m, u, body) => {
    const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j, h: r.headers };
  };
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 19 } });

  const p0 = (await R('POST', '/api/montaj/parteneri', { name: 'Instal GPS Vest SRL', tarife: { gps: 60 } })).j;
  T('partenerul se face doar cu numele', !!p0 && p0.id > 0);
  T('email stricat → refuzat', (await R('POST', '/api/montaj/parteneri', { id: p0.id, name: 'Instal GPS Vest SRL', email: 'nu-e' })).s === 400);
  const p1 = (await R('POST', '/api/montaj/parteneri', { id: p0.id, name: 'Instal GPS Vest SRL', cui: 'RO111', reg_com: 'J35/1/2020', address: 'Str. Montajului 1, Timișoara',
    email: 'office@instal.ro', phone: '0700', iban: 'RO49AAAA1B31007593840000', zona: 'Timiș, Arad', legal_rep: { name: 'Vasile Pop', role: 'Administrator' },
    tarife: { gps: 60, lvcan: 40, deplasare: 1.5 } })).j;
  T('datele juridice se scriu pe partener', p1.address && p1.email === 'office@instal.ro' && p1.legal_rep && p1.legal_rep.name === 'Vasile Pop' && p1.zona === 'Timiș, Arad', JSON.stringify(p1));
  const p2 = (await R('POST', '/api/montaj/parteneri', { id: p0.id, name: 'Instal GPS Vest SRL', cui: 'RO111', tarife: { gps: 60, lvcan: 40, deplasare: 1.5 } })).j;
  T('o salvare veche (fără datele juridice) NU le golește', p2.address === 'Str. Montajului 1, Timișoara' && p2.email === 'office@instal.ro' && p2.legal_rep && p2.legal_rep.name === 'Vasile Pop');

  let L = (await R('GET', '/api/montaj/contracte')).j || {};
  T('partenerul fără contract apare ca atare', (L.fara_contract || []).some((x) => x.id === p0.id));
  const c = (await R('POST', '/api/montaj/contracte', { partener_id: p0.id, months: 12 })).j || {};
  T('contractul se naște în lucru, cu numărul lui (RAT-M-…)', c.status === 'ciorna' && /^RAT-M-\d{4}-0001$/.test(c.number || ''), JSON.stringify(c));
  T('Anexa nr. 1 = tarifele de azi ale partenerului, înghețate', JSON.stringify(c.tarife) === JSON.stringify({ gps: 60, lvcan: 40, deplasare: 1.5 }));
  T('zona și reprezentantul vin din fișa lui', c.zona === 'Timiș, Arad' && c.partner_rep && c.partner_rep.name === 'Vasile Pop');
  T('un al doilea contract deodată → refuzat (409)', (await R('POST', '/api/montaj/contracte', { partener_id: p0.id })).s === 409);
  await R('POST', '/api/montaj/parteneri', { id: p0.id, name: 'Instal GPS Vest SRL', tarife: { gps: 70, lvcan: 40, deplasare: 1.5 } });
  T('tarifele schimbate pe partener NU mută anexa singure', JSON.stringify(((await R('GET', '/api/montaj/contracte')).j.contracte || [])[0].tarife) === JSON.stringify({ gps: 60, lvcan: 40, deplasare: 1.5 }));
  const e = await R('PUT', '/api/montaj/contracte/' + c.id, { months: 24, our_rep: { name: 'Alin Tîlvar', role: 'Administrator' }, tarife_din_partener: true });
  T('„Editează": durata, cine semnează, „reia tarifele partenerului"', e.s === 200 && e.j.months === 24 && e.j.our_rep.name === 'Alin Tîlvar' && e.j.tarife.gps === 70, JSON.stringify(e.j));

  T('o ciornă nu pleacă la semnat', (await R('POST', '/api/montaj/contracte/' + c.id + '/trimite', {})).s === 400);
  T('„Aprobă"', (await R('PUT', '/api/montaj/contracte/' + c.id, { status: 'aprobat' })).s === 200);
  const t = await R('POST', '/api/montaj/contracte/' + c.id + '/trimite', {});
  T('„Trimite la semnat": pleacă la emailul partenerului', t.s === 200 && t.j.trimis_la === 'office@instal.ro' && t.j.status === 'trimis', JSON.stringify(t.j));
  await sleep(300);
  const m = mesaje.filter((x) => x.catre.indexOf('office@instal.ro') >= 0)[0];
  T('...cu contractul atașat în PDF și răspunsul către noi', !!m && /Content-Type: application\/pdf/i.test(m.date) && /JVBERi0/.test(m.date) && /Reply-To: office@ratrack\.ro/i.test(m.date));
  const pdf = await fetch(B + '/api/montaj/contracte/' + c.id + '/pdf', { headers: { Cookie: ck } });
  const cd = pdf.headers.get('content-disposition') || '';
  T('„Vezi/Descarcă": PDF cu numele casei', pdf.status === 200 && /application\/pdf/.test(pdf.headers.get('content-type') || '') && /RA-Tracks%20-%20Contract%20montaj%20RAT-M-/.test(cd), cd);
  T('„E semnat": fișierul semnat', (await R('POST', '/api/montaj/contracte/' + c.id + '/file', { name: 'semnat.pdf', b64: Buffer.from('%PDF-1.4\n').toString('base64') })).s === 200);
  const semn = await R('PUT', '/api/montaj/contracte/' + c.id, { status: 'activ', signed_at: Date.now(), start_at: Date.now() });
  T('...și contractul intră în vigoare', semn.s === 200 && semn.j.status === 'activ', semn.s + ' ' + JSON.stringify(semn.j && semn.j.error));
  L = (await R('GET', '/api/montaj/contracte')).j || {};
  const c2 = (L.contracte || []).filter((x) => x.id === c.id)[0] || {};
  T('semnat, cu actul încărcat: nimic nu mai lipsește', c2.status === 'activ' && !(c2.lipsuri || []).length, JSON.stringify(c2.lipsuri));
  T('semnat → durata NU se mai schimbă', (await R('PUT', '/api/montaj/contracte/' + c.id, { months: 36 })).s === 400);
  T('...dar notițele da', (await R('PUT', '/api/montaj/contracte/' + c.id, { notes: 'vine cu dubă proprie' })).s === 200);
  T('semnat → nu se șterge', (await R('DELETE', '/api/montaj/contracte/' + c.id)).s === 400);
  T('semnat → nu se întoarce la „în lucru"', (await R('PUT', '/api/montaj/contracte/' + c.id, { status: 'ciorna' })).s === 400);

  // Lucrările: una la un client, executată de partener.
  const co = (await R('POST', '/api/companies', { name: 'Client Montaj SRL' })).j;
  await R('POST', '/api/companies/' + co.id + '/montaje', { partener_id: p0.id, status: 'executat', data_lucrare: Date.now(),
    items: [{ tip: 'gps', buc: 2, pretClient: 100, costPartener: 60 }] });
  const lu = (await R('GET', '/api/montaj/lucrari')).j || {};
  const l1 = (lu.lucrari || [])[0] || {};
  T('„Lucrări": toate, cu clientul și partenerul pe nume', l1.company_name === 'Client Montaj SRL' && l1.partener_nume === 'Instal GPS Vest SRL', JSON.stringify(l1));
  T('...și cât rămâne la noi (200 − 120 = 80 lei)', Number(l1.total_client) === 200 && Number(l1.total_partener) === 120 && l1.marja === 80, JSON.stringify({ c: l1.total_client, p: l1.total_partener, m: l1.marja }));
  T('...cu stările lucrării pe românește', lu.stari && lu.stari.executat === 'executat' && lu.stari.facturat_de_partener);

  T('„Încheie", cu motivul', (await R('PUT', '/api/montaj/contracte/' + c.id, { status: 'incheiat', ended_reason: 'denunțare' })).s === 200);
  T('după încheiere se poate face un contract nou', (await R('POST', '/api/montaj/contracte', { partener_id: p0.id })).s === 200);

  // Un partener cu contract SEMNAT nu se șterge: lista contractelor se leagă de partener, deci fără el
  // contractul semnat ar dispărea din ecran. Se trece pe „inactiv".
  const del0 = await R('DELETE', '/api/montaj/parteneri/' + p0.id);
  T('partenerul cu contract semnat NU se șterge (409)', del0.s === 409 && /inactiv/.test((del0.j && del0.j.error) || ''), del0.s + ' ' + JSON.stringify(del0.j));
  T('...iar contractul lui semnat rămâne în listă', ((await R('GET', '/api/montaj/contracte')).j.contracte || []).some((x) => x.id === c.id));
  const ina = (await R('POST', '/api/montaj/parteneri', { id: p0.id, name: 'Instal GPS Vest SRL', active: false })).j || {};
  T('„inactiv" se ține minte, fără să-i golească fișa', ina.active === false && ina.cui === 'RO111' && ina.email === 'office@instal.ro', JSON.stringify(ina));
  const p3 = (await R('POST', '/api/montaj/parteneri', { name: 'Montaj Rapid SRL' })).j;
  const c3 = (await R('POST', '/api/montaj/contracte', { partener_id: p3.id })).j || {};
  const del3 = await R('DELETE', '/api/montaj/parteneri/' + p3.id);
  T('partenerul doar cu o ciornă se șterge, și ciorna odată cu el', del3.s === 200 && del3.j.contracte_sterse === 1 &&
    !((await R('GET', '/api/montaj/contracte')).j.contracte || []).some((x) => x.id === c3.id), del3.s + ' ' + JSON.stringify(del3.j));
  T('fișa unui partener șters între timp → 404, nu eroare de program', (await R('POST', '/api/montaj/parteneri', { id: p3.id, name: 'Montaj Rapid SRL' })).s === 404);
  const p4 = (await R('POST', '/api/montaj/parteneri', { name: 'Fost Partener SRL', active: false })).j;
  T('un partener inactiv nu mai apare la „fără contract"', !(((await R('GET', '/api/montaj/contracte')).j.fara_contract) || []).some((x) => x.id === p4.id));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
