// verify_montaj_calendar.js — calendarul de montaj din Business → Montaj (Alin, 30.09).
//
//   node verify_montaj_calendar.js
//
// Alin: „în secțiunea Montaj, calendar de programare… să pot selecta eu ziua, și să-mi arate jos ce am de instalat
// și disponibilitatea". Calendarul e SINGURUL loc în care se programează montajul unui contract SEMNAT: fiecare zi
// programată e o lucrare („programat"), iar ce mai e de programat se socotește din Anexa nr. 2 minus lucrări.
// Proba: regula (montaj.js), ecranul (index.html) și tot drumul pe server pornit.

const fs = require('fs');
const { spawn } = require('child_process');
const M = require('./montaj.js');
const C = require('./contracts.js');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

sect('1. Regula (montaj.js)');
T('„montată" înseamnă aceleași stări ca în drumul clientului și termen (contracts.MONTAJ_EXECUTAT)', JSON.stringify(M.STARI_MONTATE) === JSON.stringify(C.MONTAJ_EXECUTAT));
const anexa = { items: [{ tip: 'gps', buc: 50, pretClient: 100 }, { tip: 'lvcan', buc: 30, pretClient: 60 }, { tip: 'deplasare', buc: 1, pretClient: 200 }] };
const luc = [
  { status: 'programat', items: [{ tip: 'gps', buc: 10 }, { tip: 'lvcan', buc: 6 }] },
  { status: 'executat', items: [{ tip: 'gps', buc: 15 }, { tip: 'lvcan', buc: 9 }] },
  { status: 'facturat_clientului', items: [{ tip: 'gps', buc: 5 }, { tip: 'lvcan', buc: 3 }] },
  { status: 'executat', items: JSON.stringify([{ tip: 'deplasare', buc: 1 }]) }
];
const s = M.deProgramat(anexa, luc);
T('din 50 de mașini: 20 montate, 10 programate, 20 de programat', s.masini === 50 && s.montate === 20 && s.programate === 10 && s.ramase === 20, JSON.stringify(s));
const lv = s.tipuri.filter((t) => t.tip === 'lvcan')[0] || {};
T('adaptoarele: 30 în anexă, 12 montate, 6 programate, 12 rămase, 0,6 pe mașină (nu toate mașinile au)', lv.inAnexa === 30 && lv.montate === 12 && lv.programate === 6 && lv.ramase === 12 && lv.peMasina === 0.6, JSON.stringify(lv));
T('deplasarea nu se împarte pe zile (nu e „pe mașină")', !s.tipuri.some((t) => t.tip === 'deplasare'));
T('anexa venită ca text din bază se citește la fel', M.deProgramat(JSON.stringify(anexa), luc).ramase === 20);
T('fără montaj de aparat în anexă → 0 mașini', M.deProgramat({ items: [{ tip: 'deplasare', buc: 1 }] }, []).masini === 0 && M.deProgramat(null, []).masini === 0);
const z = M.lucrareaZilei(s, { gps: 10, lvcan: 6 }, { gps: 60, lvcan: 40 });
T('ziua: prețul clientului din anexă, costul din tarifele instalatorului', JSON.stringify(z.items) === JSON.stringify([{ tip: 'gps', buc: 10, pretClient: 100, costPartener: 60 }, { tip: 'lvcan', buc: 6, pretClient: 60, costPartener: 40 }]), JSON.stringify(z));
T('instalator fără tarife → costul rămâne necunoscut (nu 0)', M.lucrareaZilei(s, { gps: 1 }, {}).items[0].costPartener === null);
T('peste ce a rămas → refuz, românește: „doar 20 de mașini"', M.lucrareaZilei(s, { gps: 21 }).eroare === 'Au mai rămas de programat doar 20 de mașini.', M.lucrareaZilei(s, { gps: 21 }).eroare);
T('adaptoare peste ce a rămas → refuz pe nume', M.lucrareaZilei(s, { gps: 1, lvcan: 13 }).eroare === 'Instalare modul LV-CAN: au mai rămas doar 12 bucăți.', M.lucrareaZilei(s, { gps: 1, lvcan: 13 }).eroare);
T('fără mașini → cere câte', /Scrie câte mașini/.test(M.lucrareaZilei(s, { gps: 0 }).eroare || '') && /Scrie câte mașini/.test(M.lucrareaZilei(s, {}).eroare || ''));
const tot = M.deProgramat({ items: [{ tip: 'gps', buc: 2 }] }, [{ status: 'programat', items: [{ tip: 'gps', buc: 2 }] }]);
T('totul programat → „Toate mașinile contractului sunt deja programate."', M.lucrareaZilei(tot, { gps: 1 }).eroare === 'Toate mașinile contractului sunt deja programate.');
const sc = M.scaleazaLaMontate([{ tip: 'gps', buc: 10, pretClient: 100 }, { tip: 'lvcan', buc: 6, pretClient: 60 }, { tip: 'deplasare', buc: 1, pretClient: 200 }], 8);
T('„montată" 8 din 10: GPS 8, adaptoare 5 (6 × 8/10), deplasarea neatinsă', JSON.stringify(sc.map((r) => r.tip + ':' + r.buc)) === JSON.stringify(['gps:8', 'lvcan:5', 'deplasare:1']), JSON.stringify(sc));
T('„montată" cu toate → lucrarea neschimbată', JSON.stringify(M.scaleazaLaMontate([{ tip: 'gps', buc: 3 }], 3)) === JSON.stringify([{ tip: 'gps', buc: 3 }]));

sect('2. Pe ecran');
T('Calendarul e prima filă din Montaj și se deschide primul', /var MJ_FILE = \[\['calendar', 'Calendar'\], \['parteneri', 'Parteneri'\], \['contracte', 'Contracte cu partenerii'\], \['lucrari', 'Lucrări'\]\];/.test(html) && /var _raxMj = \{ fila: 'calendar',/.test(html));
const bloc = html.slice(html.indexOf('// ── începe „calendarul de montaj"'), html.indexOf('// ── sfârșit „calendarul de montaj"'));
T('blocul calendarului există, între sentinele', bloc.length > 2000);
T('pagina nu socotește ce e de programat și nici prețurile: le cere serverului', /\/api\/montaj\/calendar/.test(bloc) && /\/api\/montaj\/programeaza/.test(bloc) && !/pretClient|costPartener|termenMontaj|deProgramat\(/.test(bloc.replace(/\/\/[^\n]*/g, '')));
T('o zi se programează cu clic (și cu Enter, de la tastatură)', /onclick="raxMjCalZi\(\\'' \+ zi \+ '\\'\)"/.test(bloc) && /onkeydown="if\(event\.key===\\'Enter\\'\)raxMjCalZi/.test(bloc));
T('„jos, ce am de instalat": panoul „De programat", cu termenul și butonul pe fiecare client', /De programat<\/div>/.test(bloc) && /raxMjCalProgrameaza\(' \+ c\.contract_id \+ '\)/.test(bloc) && /esc\(t\.text\)/.test(bloc));
T('disponibilitatea: filtrul pe instalator și stocul de aparate', /raxMjCalPart\(this\.value\)/.test(bloc) && /Aparate în stoc:/.test(bloc));
T('o zi programată se mută, se trece „montată" (cu câte) sau se șterge', /\/api\/montaje\/' \+ id \+ '\/muta'/.test(bloc) && /\/api\/montaje\/' \+ id \+ '\/montata'/.test(bloc) && /method: 'DELETE'/.test(bloc));
const drum = html.slice(html.indexOf('window.raxDrumMontaj'), html.indexOf('window.raxDrumAparate'));
T('„Programează montajul" din drumul clientului duce în calendar, cu clientul ales', /_raxMj\.fila = 'calendar';/.test(drum) && /_raxMj\.cal\.pre = companyId;/.test(drum) && /raxAdminTab\('montaj'\)/.test(drum) && !/raxMontajEdit\(0\)/.test(drum));
T('fișa: la contract semnat, „Programează în calendar"; la nesemnat, formularul lucrării (scrie Anexa nr. 2)', /_raxCtr\.contract\.status === 'activ'\)\s*\? '<button class="rax-btn primary" style="margin-top:10px;" onclick="raxDrumMontaj\(/.test(html) && /: '<button class="rax-btn" style="margin-top:10px;" onclick="raxMontajEdit\(0\)"><i class="fas fa-plus"><\/i> Lucrare de montaj<\/button>'/.test(html));
T('etichetele au culori și pe tema deschisă (programat / montat)', /body:not\(\.dark\) \.raco \.mjc-l\.mjc-prog \{ color: #9a3412;/.test(css) && /body:not\(\.dark\) \.raco \.mjc-l\.mjc-mont \{ color: #166534;/.test(css));
T('pe telefon: grila rămâne în pagină (7 coloane care se strâng), numele clientului se ascunde, cifra rămâne', /\.raco \.mjc-grila \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/.test(css) && /\.raco \.mjc-l \.mjc-cl \{ display: none; \}/.test(css));

sect('3. Pe server');
T('rutele calendarului sunt doar pentru noi (super-admin)', /app\.get\('\/api\/montaj\/calendar', requireAuth, requireSuperadmin,/.test(server) &&
  /app\.post\('\/api\/montaj\/programeaza', requireAuth, requireSuperadmin,/.test(server) && /app\.post\('\/api\/montaje\/:id\/muta', requireAuth, requireSuperadmin,/.test(server) &&
  /app\.post\('\/api\/montaje\/:id\/montata', requireAuth, requireSuperadmin,/.test(server));
T('se programează doar un contract semnat (la nesemnat, lucrările scriu încă Anexa nr. 2)', /if \(c\.status !== 'activ'\) return res\.status\(400\)\.json\(\{ error: 'Montajul se programează după semnare/.test(server));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────
const PORT = 3238, DIR = '.calendar-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_calendar',
  PORT: String(PORT), TCP_PORT: '5238', PGLITE_DIR: DIR + '/pgdata' };
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
// Ziua ca în pagină (`_zi`: miezul nopții LOCAL, deci al României) — aici fix, în martie 2027.
const zi = (d) => Date.UTC(2027, 2, d) - 2 * 3600000;
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('4. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  const part = (await R('POST', '/api/montaj/parteneri', { name: 'Instal Vest SRL', tarife: { gps: 60, lvcan: 40 } })).j || {};
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Calendar', client_name: 'Calendar SRL', monthly_total: 145, currency: 'RON',
    config: { cfg: { nVeh: 5, contractMonths: 12, montaj: { qGps: 5, qLvCan: 3 }, devices: {} }, prices: { pPlain: 29, mGps: 100, mLvCan: 60 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Calendar SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO779', address: 'Str. Calendarului 3', legal_rep: { name: 'Ana Calendar', role: 'Administrator' } });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 5, pret: 29, total: 145 }], servicii: [] } })).j;
  const cal = async () => (await R('GET', '/api/montaj/calendar?luna=2027-03')).j || {};
  const alLui = (x) => ((x.deProgramat || []).filter((d) => d.contract_id === c.id)[0]) || null;
  let k = await cal();
  T('contractul nesemnat nu apare la „De programat"', k.luna === '2027-03' && !alLui(k), JSON.stringify(k.deProgramat));
  const nesemnat = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(10), partener_id: part.id, cate: { gps: 2 } });
  T('nesemnat → refuz: „Montajul se programează după semnare"', nesemnat.s === 400 && /după semnare/.test((nesemnat.j || {}).error || ''), JSON.stringify(nesemnat));
  await R('PUT', '/api/contracts/' + c.id, { status: 'aprobat' });
  await R('PUT', '/api/contracts/' + c.id, { status: 'trimis' });
  await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
  k = await cal();
  let d = alLui(k) || {};
  T('semnat → la „De programat": 5 mașini, toate de programat, adaptoarele 3 (0,6 pe mașină)', d.masini === 5 && d.ramase === 5 && d.programate === 0 &&
    JSON.stringify((d.tipuri || []).map((t) => t.tip + ':' + t.ramase + ':' + t.peMasina)) === JSON.stringify(['gps:5:1', 'lvcan:3:0.6']), JSON.stringify(d));
  T('textul e cel de pe drum: „0 din 5 mașini montate"', d.text === '0 din 5 mașini montate', d.text);
  T('instalatorii și stările vin de la server', (k.parteneri || []).some((p) => p.id === part.id && p.active) && k.stari && k.stari.programat === 'programat');
  const p1 = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(10), partener_id: part.id, cate: { gps: 3, lvcan: 2 } });
  const l1 = (p1.j || {}).lucrare || {};
  T('ziua programată: 3 GPS + 2 adaptoare, prețul din contract, costul din tarifele instalatorului', p1.s === 200 && l1.status === 'programat' &&
    Number(l1.total_client) === 420 && Number(l1.total_partener) === 260, JSON.stringify(p1));
  k = await cal(); d = alLui(k) || {};
  const inCal = (k.lucrari || []).filter((l) => l.id === l1.id)[0] || {};
  T('apare în calendar pe 10.03, cu 3 mașini și instalatorul', inCal.zi === '2027-03-10' && inCal.masini === 3 && inCal.partener_nume === 'Instal Vest SRL' && inCal.company_name === 'Calendar SRL', JSON.stringify(inCal));
  T('„De programat": 3 programate, 2 rămase (adaptoare: 1)', d.programate === 3 && d.ramase === 2 && ((d.tipuri || [])[1] || {}).ramase === 1, JSON.stringify(d));
  const prea = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(12), cate: { gps: 3 } });
  T('peste ce a rămas → refuz: „doar 2 mașini"', prea.s === 400 && (prea.j || {}).error === 'Au mai rămas de programat doar 2 mașini.', JSON.stringify(prea));
  const p2 = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(12), cate: { gps: 2, lvcan: 1 } });
  const l2 = (p2.j || {}).lucrare || {};
  T('fără instalator ales se poate programa (îl alegi mai târziu)', p2.s === 200 && l2.partener_id == null, JSON.stringify(p2));
  const mut = await R('POST', '/api/montaje/' + l2.id + '/muta', { data_lucrare: zi(15), partener_id: part.id });
  k = await cal();
  const m2 = (k.lucrari || []).filter((l) => l.id === l2.id)[0] || {};
  T('mutată pe 15.03, cu instalatorul ales acum (costul din tarifele lui)', mut.s === 200 && m2.zi === '2027-03-15' && m2.partener_id === part.id && Number((mut.j.lucrare || {}).total_partener) === 160, JSON.stringify(mut));
  const mont = await R('POST', '/api/montaje/' + l1.id + '/montata', { masini: 2 });
  k = await cal(); d = alLui(k) || {};
  T('„montată" 2 din 3: una se întoarce la „De programat"', mont.s === 200 && (mont.j || {}).inapoi_la_programat === 1 && d.montate === 2 && d.programate === 2 && d.ramase === 1, JSON.stringify({ r: mont.j && mont.j.inapoi_la_programat, d }));
  const dr = ((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c.id)[0] || {}).drum || {};
  const pasM = (dr.pasi || []).filter((p) => p.cheie === 'montaj')[0] || {};
  T('drumul clientului numără aceleași mașini: „2 din 5 mașini montate"', /^2 din 5 mașini montate/.test(pasM.detaliu || ''), JSON.stringify(pasM));
  T('a doua oară „montată" → refuz', (await R('POST', '/api/montaje/' + l1.id + '/montata', { masini: 1 })).s === 400);
  T('una montată nu se mai mută', (await R('POST', '/api/montaje/' + l1.id + '/muta', { data_lucrare: zi(20) })).s === 400);
  T('„montată" cu mai multe decât erau programate → refuz', (await R('POST', '/api/montaje/' + l2.id + '/montata', { masini: 3 })).s === 400);
  const sters = await R('DELETE', '/api/montaje/' + l2.id);
  k = await cal(); d = alLui(k) || {};
  T('ștearsă ziua programată → mașinile ei se întorc la „De programat"', sters.s === 200 && d.programate === 0 && d.ramase === 3, JSON.stringify(d));
  // Clientul nu vede nimic de aici: calendarul, prețurile și instalatorii sunt ai noștri.
  const u = (await R('POST', '/api/users', { username: 'sef@calendar.ro', full_name: 'Șef Calendar', role: 'company_admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  const Cl = await intra('sef@calendar.ro', 'Str4da-Verde-2026');
  const rc = await Cl('GET', '/api/montaj/calendar?luna=2027-03');
  const rp = await Cl('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(20), cate: { gps: 1 } });
  const rm = await Cl('POST', '/api/montaje/' + l1.id + '/muta', { data_lucrare: zi(20) });
  T('administratorul firmei client nu ajunge la calendar (403 pe toate)', rc.s === 403 && rp.s === 403 && rm.s === 403, [rc.s, rp.s, rm.s].join(','));
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
