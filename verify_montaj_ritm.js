// verify_montaj_ritm.js — factura montajului, în ritmul instalatorului (săptămânal / lunar).
//
//   node verify_montaj_ritm.js
//
// Alin (30.09): „dacă instalatorul ne facturează săptămânal, automat și noi tot săptămânal trebuie să facturăm; dacă ne
// facturează la lună, facturăm și noi la lună — ca să nu fim pe pierdere. Depinde mult de instalator. Notează asta, dar
// doar la montaj." Proba ține: regula (montaj.js), fișa instalatorului și contractul cu el (ritmul înghețat, hârtia),
// secțiunea „Montaj de facturat" din Facturare, anunțul (o dată pe perioadă, ziua) și tot drumul pe server pornit.

const fs = require('fs');
const { spawn } = require('child_process');
const M = require('./montaj.js');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const J = JSON.stringify;
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');

sect('1. Regula (montaj.js)');
T('ritmul: doar „saptamanal" sau „lunar"; gol sau necunoscut = lunar', M.ritmFacturare('saptamanal') === 'saptamanal' && M.ritmFacturare(null) === 'lunar' && M.ritmFacturare('zilnic') === 'lunar');
const P = (z, r) => { const p = M.perioadaFacturare(z, r); return p.de + '|' + p.pana + '|' + p.gataDin + '|' + p.eticheta; };
T('săptămâna: de luni până duminică — miercuri 30.09.2026 → 28.09–04.10, gata de luni 05.10', P('2026-09-30', 'saptamanal') === '2026-09-28|2026-10-04|2026-10-05|28.09–04.10.2026', P('2026-09-30', 'saptamanal'));
T('…lunea și duminica sunt în aceeași săptămână', P('2026-09-28', 'saptamanal') === P('2026-10-04', 'saptamanal'));
T('…în aceeași lună, eticheta scurtă: „21–27.09.2026"', M.perioadaFacturare('2026-09-22', 'saptamanal').eticheta === '21–27.09.2026');
T('…peste an: „28.12.2026–03.01.2027"', P('2026-12-30', 'saptamanal') === '2026-12-28|2027-01-03|2027-01-04|28.12.2026–03.01.2027', P('2026-12-30', 'saptamanal'));
T('luna: „septembrie 2026", gata de pe 1 octombrie; decembrie → 1 ianuarie', P('2026-09-30', 'lunar') === '2026-09-01|2026-09-30|2026-10-01|septembrie 2026' && M.perioadaFacturare('2026-12-15').gataDin === '2027-01-01');
const L = [
  { id: 1, company_id: 5, company_name: 'Transport SRL', partener_nume: 'Ionescu', ritm: 'saptamanal', zi: '2026-09-22', total_client: 1500, masini: 10 },
  { id: 2, company_id: 5, company_name: 'Transport SRL', partener_nume: 'Ionescu', ritm: 'saptamanal', zi: '2026-09-24', total_client: 2250, masini: 15 },
  { id: 3, company_id: 5, company_name: 'Transport SRL', partener_nume: 'Ionescu', ritm: 'saptamanal', zi: '2026-09-29', total_client: 750, masini: 5 },
  { id: 4, company_id: 7, company_name: 'Alfa SRL', partener_nume: 'Popescu', ritm: 'lunar', zi: '2026-09-10', total_client: 300, masini: 2 },
  { id: 5, company_id: 8, company_name: 'Beta SRL', partener_nume: null, ritm: null, zi: '2026-09-29', total_client: 150, masini: 1 },
  { id: 6, company_id: 8, company_name: 'Beta SRL', partener_nume: null, ritm: null, zi: '2026-09-02', total_client: 0, masini: 1 },
  { id: 7, company_id: null, company_name: null, partener_nume: 'X', ritm: 'lunar', zi: '2026-09-02', total_client: 100, masini: 1 }
];
let d = M.deFacturatMontaj(L, '2026-09-30');
const tr = d.gata.filter((g) => g.company_id === 5)[0] || {};
T('miercuri 30.09: la Transport, săptămâna 21–27.09 e GATA (1 + 2), săptămâna curentă e ÎN CURS (3)', J(tr.lucrari) === '[1,2]' && tr.total === 3750 && tr.masini === 25 &&
  J((d.inCurs.filter((g) => g.company_id === 5)[0] || {}).lucrari) === '[3]', J(d));
T('…textul: „25 de mașini montate în 21–27.09.2026 (Ionescu · facturare săptămânală)"', tr.text === '25 de mașini montate în 21–27.09.2026 (Ionescu · facturare săptămânală)', tr.text);
T('instalatorul lunar (Alfa) și lucrarea fără instalator (Beta) așteaptă sfârșitul lunii', d.inCurs.some((g) => g.company_id === 7) && d.inCurs.some((g) => g.company_id === 8) && !d.gata.some((g) => g.company_id !== 5));
T('…„se facturează de pe 01.10.2026"; fără instalator: doar „(facturare lunară)"', (d.inCurs.filter((g) => g.company_id === 8)[0] || {}).text === '1 mașină montată în septembrie 2026 (facturare lunară) — se facturează de pe 01.10.2026', J(d.inCurs));
T('lucrarea fără preț pentru client și cea fără firmă nu intră nicăieri', ![].concat(d.gata, d.inCurs).some((g) => g.lucrari.indexOf(6) >= 0 || g.lucrari.indexOf(7) >= 0));
d = M.deFacturatMontaj(L, '2026-10-01');
T('joi 01.10: se adaugă lunarele (Alfa, Beta); săptămâna curentă a lui Transport tot în curs', d.gata.map((g) => g.company_id).sort().join(',') === '5,7,8' && (d.inCurs[0] || {}).company_id === 5, J(d.gata.map((g) => g.company_id)));
d = M.deFacturatMontaj(L.concat([{ id: 9, company_id: 5, company_name: 'Transport SRL', partener_nume: 'Popescu', ritm: 'lunar', zi: '2026-09-15', total_client: 200, masini: 2 }]), '2026-10-05');
const t2 = (d.gata.filter((g) => g.company_id === 5)[0] || {});
T('două instalatoare la aceeași firmă, perioade încheiate → O factură, cu amândouă perioadele în text', J(t2.lucrari) === '[1,2,3,9]' &&
  t2.text === '32 de mașini montate în septembrie 2026 (Popescu · facturare lunară), 21–27.09.2026 (Ionescu · facturare săptămânală) și 28.09–04.10.2026 (Ionescu · facturare săptămânală)' && t2.ultimaPerioada === '2026-10-04', J(t2));
const an = M.anuntMontajDeFacturat(M.deFacturatMontaj(L, '2026-09-30').gata[0]);
T('anunțul: „Montaj de facturat: Transport SRL", cu textul rândului, suma în lei românești și ce ai de făcut', an.titlu === 'Montaj de facturat: Transport SRL' &&
  an.corp === '25 de mașini montate în 21–27.09.2026 (Ionescu · facturare săptămânală) — 3.750,00 lei fără TVA. Apasă aici: factura e pregătită, cu lucrările puse. O verifici („Previzualizează") și apeși „Emite factura".', an.corp);

sect('2. Pe ecran');
T('fișa instalatorului: „Ne facturează" lunar / săptămânal, trimis la salvare', /id="pt-ritm"/.test(html) && /<option value="saptamanal"' \+ \(e\.ritm_facturare === 'saptamanal' \? ' selected' : ''\) \+ '>săptămânal<\/option>/.test(html) &&
  /ritm_facturare: v\('pt-ritm'\) === 'saptamanal' \? 'saptamanal' : 'lunar'/.test(html));
T('…și spune de ce contează: montajul lui îl facturăm clientului în același ritm', /Montajul făcut de el îl facturăm clientului în același ritm/.test(html));
T('lista partenerilor și a contractelor lor spun ritmul', /'ne facturează săptămânal' : 'ne facturează lunar'/.test(html) && /'<span class="raco-until">ne facturează ' \+ \(c\.ritm_facturare === 'saptamanal' \? 'săptămânal' : 'lunar'\)/.test(html));
T('contractul nesemnat: „Reia din fișa partenerului tarifele de azi… și cât de des ne facturează"', /Reia din fișa partenerului tarifele de azi \(Anexa nr\. 1\) și cât de des ne facturează/.test(html));
T('Facturare: a treia secțiune, „Montaj de facturat · N"', /onclick="raxInvSectiune\(\\'montaj\\'\)">Montaj de facturat · ' \+ nrMont \+ '<\/button>/.test(html) &&
  /_raxInvSect = \(k === 'proforme' \|\| k === 'montaj'\) \? k : 'facturi'/.test(html));
const bloc = html.slice(html.indexOf('// ── începe „montajul de facturat"'), html.indexOf('// ── sfârșit „montajul de facturat"'));
T('secțiunea doar arată ce spune serverul: nu socotește perioade, zile sau ce e gata', bloc.length > 1500 && !/perioadaFacturare|getDay|gataDin\s*[<>]|new Date/.test(bloc.replace(/\/\/[^\n]*/g, '')));
T('„Pregătește factura" deschide fereastra facturii (fiscală, unică) cu lucrările puse — și NU emite singură',
  /raxOpenGenInvoice\(companyId, 'unica'\);\s*raxGiTip\('invoice'\);\s*await raxGenDraft\(\);/.test(bloc) && /_giPuneLucrare\(Number\(id\)\)/.test(bloc) && !/raxGenIssue|\/api\/invoices'/.test(bloc));
T('anunțul „Montaj de facturat" duce acolo: Facturare, factura pregătită', /onclick="notifMontajDeFacturat\(\$\{Number\(n\.id\)\}\)"/.test(html) && /raxFacturaMontaj\(d\.company_id, d\.lucrari \|\| \[\], true\)/.test(html));

sect('3. Pe server');
T('ruta secțiunii e doar a noastră', /app\.get\('\/api\/montaj\/de-facturat', requireAuth, requireSuperadmin,/.test(server));
T('anunțul pleacă o dată pe firmă și pe perioada încheiată, între 8 și 20', /const cheie = 'montaj_de_facturat:' \+ g\.company_id \+ ':' \+ g\.ultimaPerioada;/.test(server) && /if \(!\(ora >= 8 && ora < 20\)\) return raport;/.test(server) &&
  (server.match(/_anuntaSuperadmini\(supers, 'montaj_de_facturat'/g) || []).length === 1);
T('ritmul: fișa îl scrie doar când vine (telefonul vechi nu-l golește); contractul îl îngheață la creare; „Reia" îl reia',
  /if \(b\.ritm_facturare !== undefined\) juridic\.ritm_facturare = montaj\.ritmFacturare\(b\.ritm_facturare\);/.test(server) &&
  /ritm_facturare: montaj\.ritmFacturare\(p\.ritm_facturare\)/.test(server) && /b\.ritm_facturare = montaj\.ritmFacturare\(p && p\.ritm_facturare\);/.test(server));

sect('4. Hârtia contractului cu instalatorul');
const CP = require('./contract_pdf.js');
function hartie(ritm) {
  const texte = [];
  const A4 = { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } };
  const carton = {
    page: A4, x: 50, y: 50,
    font() { return this; }, fontSize() { return this; }, fillColor() { return this; }, strokeColor() { return this; },
    lineWidth() { return this; }, moveTo() { return this; }, lineTo() { return this; }, stroke() { return this; }, image() { return this; },
    widthOfString(s) { return String(s == null ? '' : s).length * 4.6; },
    addPage() { this.y = 50; return this; }, moveDown(n) { this.y += 12 * (n == null ? 1 : n); return this; },
    text(t, x, y) { texte.push(String(t == null ? '' : t)); if (typeof y === 'number') this.y = y + 11; else this.y += 11; return this; }
  };
  CP.scrieContractMontaj(carton, { contract: { number: 'RAT-M-2026-0009', status: 'aprobat', plata_zile: 15, ritm_facturare: ritm, tarife: { gps: 60 } },
    partener: { name: 'Ionescu Montaj SRL' }, emitent: { name: 'RA TRACKS SRL' } });
  return texte.join(' ');
}
T('săptămânal: „facturează săptămânal lucrările … din săptămâna anterioară (de luni până duminică)"', /Prestatorul facturează săptămânal lucrările executate și recepționate în săptămâna anterioară \(de luni până duminică\), cu lista lor/.test(hartie('saptamanal')));
T('lunar (și fără ritm scris): ca până acum', /Prestatorul facturează lunar lucrările executate și recepționate în luna anterioară, cu lista lor/.test(hartie('lunar')) && /facturează lunar/.test(hartie(undefined)));

// ─── 5. Pe server pornit ────────────────────────────────────────────────────────────────────
const PORT = 3242, DIR = '.montaj-ritm-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_montaj_ritm',
  PORT: String(PORT), TCP_PORT: '5242', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
async function intra(u, p) {
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  return async (m, url, body) => {
    const r = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
}
const aziRo = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
const [ay, am, ad] = aziRo.split('-').map(Number);
// O zi (față de azi) la o oră dată pe ceasul României: 07:00 UTC = 9–10 dimineața, 00:30 UTC = 2–3 noaptea.
const ziLa = (zi, oraUtc, minUtc) => { const p = zi.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2], oraUtc, minUtc || 0); };
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('5. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  await R('PUT', '/api/admin/system-settings', { invoice_issuer: { name: 'RA TRACKS SRL', cui: 'RO999', email: 'office@ratrack.ro', vat_rate: 21 } });
  // Doi instalatori: Ionescu ne facturează săptămânal, Popescu lunar (nescris = lunar).
  const pI = (await R('POST', '/api/montaj/parteneri', { name: 'Ionescu Montaj SRL', tarife: { gps: 60 }, ritm_facturare: 'saptamanal' })).j || {};
  const pP = (await R('POST', '/api/montaj/parteneri', { name: 'Popescu Instal SRL', tarife: { gps: 55 } })).j || {};
  T('fișa: Ionescu „săptămânal"; Popescu, nescris, rămâne lunar', pI.ritm_facturare === 'saptamanal' && pP.ritm_facturare !== 'saptamanal', J([pI.ritm_facturare, pP.ritm_facturare]));
  const vechi = await R('POST', '/api/montaj/parteneri', { id: pI.id, name: 'Ionescu Montaj SRL', tarife: { gps: 60 } });
  T('o salvare fără ritm (telefonul vechi) nu-l schimbă', (vechi.j || {}).ritm_facturare === 'saptamanal', J(vechi.j && vechi.j.ritm_facturare));
  const mc = (await R('POST', '/api/montaj/contracte', { partener_id: pI.id, months: 12 })).j || {};
  T('contractul cu Ionescu îngheață ritmul: „saptamanal"', mc.ritm_facturare === 'saptamanal', J(mc));
  await R('POST', '/api/montaj/parteneri', { id: pI.id, name: 'Ionescu Montaj SRL', ritm_facturare: 'lunar' });
  let mcs = ((await R('GET', '/api/montaj/contracte')).j || {}).contracte || [];
  T('schimbi fișa pe „lunar" → contractul rămâne cum a fost făcut', (mcs.filter((x) => x.id === mc.id)[0] || {}).ritm_facturare === 'saptamanal');
  await R('PUT', '/api/montaj/contracte/' + mc.id, { tarife_din_partener: true });
  mcs = ((await R('GET', '/api/montaj/contracte')).j || {}).contracte || [];
  T('„Reia din fișă" (cât e nesemnat) → contractul trece pe „lunar"', (mcs.filter((x) => x.id === mc.id)[0] || {}).ritm_facturare === 'lunar');
  await R('POST', '/api/montaj/parteneri', { id: pI.id, name: 'Ionescu Montaj SRL', ritm_facturare: 'saptamanal' });

  // Firma, contractul semnat, montajul de azi: 2 mașini la Ionescu (săptămânal), 1 la Popescu (lunar). Montate.
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Ritm', client_name: 'Ritm Transport SRL', monthly_total: 87, currency: 'RON',
    config: { cfg: { nVeh: 3, contractMonths: 12, montaj: { qGps: 3 }, devices: {} }, prices: { pPlain: 29, mGps: 150 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Ritm Transport SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO7702', address: 'Str. Ritmului 2', legal_rep: { name: 'Ana Ritm', role: 'Administrator' } });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 3, pret: 29, total: 87 }], servicii: [] } })).j;
  for (const st of ['aprobat', 'trimis']) await R('PUT', '/api/contracts/' + c.id, { status: st });
  await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
  const lI = ((await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: ziLa(aziRo, 9), partener_id: pI.id, cate: { gps: 2 } })).j || {}).lucrare || {};
  const lP = ((await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: ziLa(aziRo, 9), partener_id: pP.id, cate: { gps: 1 } })).j || {}).lucrare || {};
  await R('POST', '/api/montaje/' + lI.id + '/montata', { masini: 2 });
  await R('POST', '/api/montaje/' + lP.id + '/montata', { masini: 1 });
  const perI = M.perioadaFacturare(aziRo, 'saptamanal'), perP = M.perioadaFacturare(aziRo, 'lunar');
  let df = (await R('GET', '/api/montaj/de-facturat')).j || {};
  const inc = (df.inCurs || []).filter((g) => g.company_id === co.id)[0] || {};
  T('azi: montajul e „în curs" — nicio perioadă nu s-a încheiat', !(df.gata || []).some((g) => g.company_id === co.id) && J(inc.lucrari) === J([lI.id, lP.id].sort((a, b) => a - b)) && inc.total === 450, J(df));
  T('…cu amândoi instalatorii în text și ziua de la care se facturează (cea mai apropiată)', /Ionescu Montaj SRL · facturare săptămânală/.test(inc.text || '') && /Popescu Instal SRL · facturare lunară/.test(inc.text || '') &&
    (inc.text || '').indexOf('se facturează de pe ' + (perI.gataDin < perP.gataDin ? perI : perP).gataDin.split('-').reverse().join('.')) > 0, inc.text);

  // Ceasul mutat: noaptea, nimic; dimineața zilei de după săptămână — anunțul; a doua oară, nimic.
  const nMont = async () => ((await R('GET', '/api/notifications?limit=80')).j || []).filter((n) => n.type === 'montaj_de_facturat' && (n.data || {}).company_id === co.id);
  const primaZi = perI.gataDin < perP.gataDin ? perI.gataDin : perP.gataDin;
  const gataAtunci = [[lI.id, perI], [lP.id, perP]].filter((x) => x[1].gataDin <= primaZi).map((x) => x[0]).sort((a, b) => a - b);
  let k = (await R('POST', '/api/test/ceasuri', { acum: ziLa(primaZi, 0, 30) })).j || {};
  T('noaptea (2–3 dimineața) nu pleacă nimic', (await nMont()).length === 0 && ((k.montajDeFacturat || {}).anuntate || []).length === 0, J(k));
  k = (await R('POST', '/api/test/ceasuri', { acum: ziLa(primaZi, 7) })).j || {};
  let nm = await nMont();
  T('dimineața zilei în care se încheie prima perioadă: „Montaj de facturat: Ritm Transport SRL", cu lucrările gata', nm.length === 1 && nm[0].title === 'Montaj de facturat: Ritm Transport SRL' &&
    J(((nm[0].data || {}).lucrari || []).slice().sort((a, b) => a - b)) === J(gataAtunci) && /Apasă aici: factura e pregătită/.test(nm[0].body || ''), J(nm.map((n) => [n.title, n.data])));
  T('…doar la noi (fără firmă pe notificare)', nm[0] && nm[0].company_id == null);
  await R('POST', '/api/test/ceasuri', { acum: ziLa(primaZi, 9) });
  T('a doua oară, aceeași perioadă: nu se repetă', (await nMont()).length === 1);
  const tarziu = M.perioadaFacturare(perP.gataDin, 'lunar').de;   // luna de după: amândouă perioadele încheiate
  await R('POST', '/api/test/ceasuri', { acum: ziLa(tarziu, 7) + 40 * 86400000 });
  nm = await nMont();
  T('nefacturat, la perioada următoare îți amintește din nou — cu tot ce s-a adunat', nm.length === 2 && J(((nm[0].data || {}).lucrari || []).slice().sort((a, b) => a - b)) === J([lI.id, lP.id].sort((a, b) => a - b)), J(nm.map((n) => n.data)));

  // Factura: aceeași fereastră ca până acum (ciorna „unică" propune lucrările), emisă → lucrările ies din listă.
  const dr = (await R('POST', '/api/invoices/draft', { companyId: co.id, fel: 'unica' })).j || {};
  const luc = ((dr.dinContract || {}).lucrari || []).map((j) => j.id).sort((a, b) => a - b);
  T('fereastra facturii propune exact lucrările montate', J(luc) === J([lI.id, lP.id].sort((a, b) => a - b)), J(dr.dinContract));
  const em = await R('POST', '/api/invoices', { companyId: co.id, fel: 'unica', tip: 'invoice', montaje: luc,
    lines: [{ desc: 'Instalare dispozitiv GPS', qty: 3, unitPrice: 150 }], note: 'Montaj executat pe ' + aziRo.split('-').reverse().join('.') + ' (3 mașini).' });
  T('factura se emite; lucrările trec pe „facturat clientului"', em.s === 200 && em.j.montajeFacturate === 2, J(em));
  df = (await R('GET', '/api/montaj/de-facturat')).j || {};
  T('…și nu mai apar la „Montaj de facturat"', ![].concat(df.gata || [], df.inCurs || []).some((g) => g.company_id === co.id), J(df));

  // Clientul nu vede nimic de aici.
  const u = (await R('POST', '/api/users', { username: 'sef@ritm.ro', full_name: 'Șef Ritm', role: 'company_admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  const Cl = await intra('sef@ritm.ro', 'Str4da-Verde-2026');
  T('clientul nu ajunge la montajul de facturat și nu primește anunțul', (await Cl('GET', '/api/montaj/de-facturat')).s === 403 &&
    ((await Cl('GET', '/api/notifications?limit=80')).j || []).filter((n) => n.type === 'montaj_de_facturat').length === 0);
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
