// verify_ramuri.js — ramurile RA Insight din pasul 4 (Mentenanță & acte, …).
//
//   node verify_ramuri.js
//
// Păzește:
//   1. textele (ramuri.js): „a expirat pe 03.10 (acum 4 zile)", „expiră mâine", „mai are 420 de km (la 150.000 km)", ordinea
//      (cele trecute de termen întâi, cele mai vechi primele; apoi cele mai apropiate), numărătoarea, preavizul firmei;
//   2. pe server pornit: Mentenanță & acte strânge ÎNTR-O listă actele, reviziile (pe dată și pe km) și permisele, cu
//      ACELEAȘI stări ca listele Documente / Mentenanță; altă firmă nu se vede; fără loc RA Insight → 403; numerele de lângă
//      ramuri; „Rezolvă" duce în ecranele Management; pagina nu socotește.
'use strict';
process.env.GEOCODE_URL = 'http://127.0.0.1:9/reverse';
process.env.GEOCODE_MIN_INTERVAL_MS = '0';
process.env.GEOCODE_TIMEOUT_MS = '300';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const RM = require('./ramuri');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const ZI = 86400000;
const iso = (x) => new Date(x).toISOString();
// O zi „AAAA-LL-ZZ" la N zile de azi (pe UTC, ca o coloană DATE citită de server, care merge pe UTC).
const ziPeste = (n) => new Date(Date.now() + n * ZI).toISOString().slice(0, 10);

(async () => {
  console.log('1. Textele (ramuri.js)');
  const ACUM = Date.parse('2026-10-07T10:00:00Z');
  T('„a expirat pe 03.10 (acum 4 zile)"', RM.candData(-4, '2026-10-03', ACUM, true) === 'a expirat pe 03.10 (acum 4 zile)', RM.candData(-4, '2026-10-03', ACUM, true));
  T('„expiră azi" / „expiră mâine (08.10)" / „expiră pe 12.10 — peste 5 zile" / „peste 20 de zile"',
    RM.candData(0, '2026-10-07', ACUM, true) === 'expiră azi' && RM.candData(1, '2026-10-08', ACUM, true) === 'expiră mâine (08.10)' &&
    RM.candData(5, '2026-10-12', ACUM, true) === 'expiră pe 12.10 — peste 5 zile' && /peste 20 de zile$/.test(RM.candData(20, '2026-10-27', ACUM, true)));
  T('o revizie „e scadentă" și „a trecut de termen" (nu „expiră")', RM.candData(3, '2026-10-10', ACUM, false) === 'e scadentă pe 10.10 — peste 3 zile' && /^a trecut de termen pe/.test(RM.candData(-2, '2026-10-05', ACUM, false)));
  T('anul se scrie doar când nu e anul de acum', RM.zz('2027-01-05', ACUM) === '05.01.2027' && RM.zz('2026-12-05', ACUM) === '05.12');
  T('km: „mai are 420 de km (la 150.000 km)" / „a trecut de kilometrajul ei cu 120 de km"', RM.candKm(420, 150000) === 'mai are 420 de km (la 150.000 km)' && /^a trecut de kilometrajul ei cu 120 de km/.test(RM.candKm(-120, 150000)), RM.candKm(-120, 150000));
  const rev = RM.candRand({ fel: 'revizie', zile: 40, data: '2026-11-16', kmRamasi: 300, laKm: 150000 }, ACUM);
  T('o revizie cu dată și km: întâi partea mai urgentă (300 km înaintea a 40 de zile)', /^mai are 300 de km/.test(rev) && / · e scadentă pe 16\.11/.test(rev), rev);
  const zile = (n) => RM.zilePana(new Date(ACUM + n * ZI - 3600000).toISOString().slice(0, 10), ACUM);
  T('zilele: aceeași socoteală ca listele (în sus, de la ora de acum)', zile(5) === 5 && RM.zilePana('2026-10-07', ACUM) === 0 && RM.zilePana('2026-10-06', ACUM) === -1, [zile(5), RM.zilePana('2026-10-07', ACUM), RM.zilePana('2026-10-06', ACUM)].join(','));
  const ord = RM.ordoneaza([
    { stare: 'curand', zile: 10, cine: 'A' }, { stare: 'depasit', zile: -2, cine: 'B' }, { stare: 'curand', kmRamasi: 100, cine: 'C' },
    { stare: 'depasit', zile: -9, cine: 'D' }, { stare: 'curand', zile: 1, cine: 'E' }]);
  T('ordinea: trecute de termen (cea mai veche întâi), apoi cele care vin (cea mai apropiată întâi; 100 km ≈ 2 zile)', ord.map((x) => x.cine).join('') === 'DBECA', ord.map((x) => x.cine).join(''));
  const rz = RM.rezumatMentenanta([{ stare: 'depasit', fel: 'act' }, { stare: 'curand', fel: 'revizie' }, { stare: 'curand', fel: 'permis' }], 2);
  T('numărătoarea: trecute, care vin, pe feluri, fără dată', rz.depasite === 1 && rz.curand === 2 && rz.acte === 1 && rz.revizii === 1 && rz.permise === 1 && rz.faraData === 2);
  const ex = RM.explicatiiMentenanta({ docDays: 21, days: 7, km: 800, permis: 30 });
  T('„Cum se socotește" spune preavizul FIRMEI (21 de zile la acte, 7 zile / 800 de km la revizii)', /cu 21 de zile înainte de expirare/.test(ex[0].text) && /cu 7 zile sau 800 de km/.test(ex[0].text) && /RA Care/.test(ex[2].text), ex[0].text);

  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const fn = (nume) => (SRV.split('async function ' + nume + '(')[1] || '').split(/\napp\.|\nasync function |\nfunction /)[0];
  T('stările sunt ALE LISTELOR (maintenanceDueState / documentDueState, cu preavizul firmei) — nu o a doua regulă', /maintenanceDueState\(m, odo, leads\.of\(m\.company_id\)\)/.test(fn('_ramMentenanta')) && /documentDueState\(doc, leads\.of\(doc\.company_id\)\.docDays\)/.test(fn('_ramMentenanta')));
  T('permisele: același prag ca anunțul lor (NOTIFY_EXPIRY_DAYS, 30)', /_permisZilePreaviz\(\)/.test(fn('_ramMentenanta')) && /process\.env\.NOTIFY_EXPIRY_DAYS\) \|\| 30/.test(SRV.split('function _permisZilePreaviz')[1] || ''));
  T('mașinile: aceeași regulă ca toate ramurile (_ramFlota: acces + fără arhivate)', /canAccessImei\(req, d\.imei\) && d\.status !== 'archived'/.test(fn('_ramFlota')) && /await _ramFlota\(req\)/.test(fn('_ramMentenanta')) && /await _ramFlota\(req\)/.test(fn('_sdFlota')));
  T('pagina și RA Insight cer lista prin ACEEAȘI funcție (_ramMentenanta: ruta, unealta, numerele)', (SRV.match(/await _ramMentenanta\(req\)/g) || []).length === 3);
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const bloc = (PAG.split('// ─── Ramura „Mentenanță & acte"')[1] || '').split('window.insightSdIntreaba')[0];
  T('pagina: ramura se arată și are pagina ei; „Rezolvă" = ecranele din Management (goManage)', /k: 'mentenanta', et: 'Mentenanță & acte', ic: 'fa-screwdriver-wrench', gata: true/.test(PAG) && /if \(S\.ramura === 'mentenanta'\) return deseneazaMentenanta\(main\);/.test(PAG) && /goManage\(ecran\)/.test(bloc));
  T('pagina nu socotește: o singură cerere, fără zile sau praguri scrise în ea', (bloc.match(/'\/api\/insight\/mentenanta'/g) || []).length === 1 && !/\b(14|30|500)\b/.test(bloc) && !/zilePana|Math\.ceil/.test(bloc));
  const ih = bloc.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textele serverului se pun cu textContent (innerHTML doar pentru iconițe)', ih.length >= 3 && ih.every((x) => !/\.(cand|cine|ce|text|titlu|message|error)\b/.test(x)), ih.join(' | '));
  T('numerele de lângă ramuri: o rută, citită la deschiderea secțiunii, care nu pornește socoteli grele (doarGata)', /app\.get\('\/api\/insight\/ramuri'/.test(SRV) && /_sdLuna\(req, \{ doarGata: true \}\)/.test(SRV) && /incarcaNumere\(\);/.test(PAG) && /'\/api\/insight\/ramuri'/.test(PAG));

  // ─── 2. Pe server pornit ──────────────────────────────────────────────────────────────────────────────
  const PORT = 3298, TCP = 5298;
  const DIR = path.join(os.tmpdir(), 'rax_ramuri_' + Date.now());
  const BU = 'http://127.0.0.1:' + PORT;
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_ramuri', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR });
  delete env.DATABASE_URL; delete env.ANTHROPIC_API_KEY; delete env.NOTIFY_EXPIRY_DAYS;
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const gata = (c) => { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} process.exit(c); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); process.exit(1); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { if ((await fetch(BU + '/api')).ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n2. Pe server pornit');
  async function login(u, p) {
    const r = await fetch(BU + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    return r.ok ? (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ') : null;
  }
  async function json(m, u, ck, body) {
    const r = await fetch(BU + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j: j || {}, text };
  }
  const S = await login('admin', 'test1234');
  const PAROLA = 'Str4da-Verde-2026';
  const coA = (await json('POST', '/api/companies', S, { name: 'Firma Acte SRL' })).j;
  const coB = (await json('POST', '/api/companies', S, { name: 'Alta Firma Acte SRL' })).j;
  for (const co of [coA, coB]) await json('PUT', '/api/companies/' + co.id + '/settings', S, { features: { ai_assistant: true }, ai_quota: { questionsPerSeat: 50 } });
  async function om(username, role, companyId, loc) {
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, BU);
    if (r.j && r.j.id && loc) await json('PUT', '/api/users/' + r.j.id + '/ai-seat', S, { on: true });
    return login(username, PAROLA);
  }
  const ckSef = await om('sef@acte.ro', 'admin', coA.id, true);
  const ckFara = await om('fara@acte.ro', 'manager', coA.id, false);
  const ckAlt = await om('sef@alta-acte.ro', 'admin', coB.id, true);
  const V = ['350000000081001', '350000000081002', '350000000081003'];
  await json('POST', '/api/devices/import', S, { rows: [{ imei: V[0], nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }, { imei: V[1], nume: 'VW Caddy', nr_inmatriculare: 'B 77 RAT' }, { imei: V[2], nume: 'Ford Focus', nr_inmatriculare: 'CJ 01 ALT' }] });
  await json('PUT', '/api/devices/' + V[0] + '/company', S, { company_id: coA.id });
  await json('PUT', '/api/devices/' + V[1] + '/company', S, { company_id: coA.id });
  await json('PUT', '/api/devices/' + V[2] + '/company', S, { company_id: coB.id });
  // Kilometrajul de acum al Loganului, din calculatorul de bord: 149.600 km.
  await json('POST', '/api/test/simulate', S, { imei: V[0], speed: 0, io: { ignition: 0, can_total_mileage: 149600 } });
  // Actele: ITP expirat de 3 zile, RCA în 5 zile, rovinieta peste 60 de zile (în regulă), CASCO fără dată; altă firmă: un ITP expirat.
  const doc = async (ck, imei, tip, exp) => (await json('POST', '/api/documents', ck, { imei, doc_type: tip, expiry_date: exp })).status;
  const sd = [await doc(ckSef, V[0], 'ITP', ziPeste(-3)), await doc(ckSef, V[0], 'RCA', ziPeste(5)), await doc(ckSef, V[1], 'Rovinietă', ziPeste(60)), await doc(ckSef, V[1], 'CASCO', null), await doc(ckAlt, V[2], 'ITP', ziPeste(-10))];
  // Reviziile: schimbul de ulei la 150.000 km (mai are 400 km < 500 de preaviz); a Caddy-ului a trecut de termen acum 2 zile.
  const sm = [(await json('POST', '/api/maintenance', ckSef, { imei: V[0], type: 'Schimb ulei + filtru', due_km: 150000, status: 'pending' })).status,
    (await json('POST', '/api/maintenance', ckSef, { imei: V[1], type: 'Revizie generală', due_date: ziPeste(-2), status: 'pending' })).status];
  // Permisul lui Ion expiră în 10 zile; al lui Mihai peste 90 (în regulă).
  const ion = (await json('POST', '/api/drivers', ckSef, { name: 'Ion Popescu', license_expiry: ziPeste(10) })).j;
  await json('POST', '/api/drivers', ckSef, { name: 'Mihai Pop', license_expiry: ziPeste(90) });
  await json('PUT', '/api/devices/' + V[0] + '/assign', ckSef, { driver_id: ion.id });
  T('pregătire: două firme, acte, revizii, permise', sd.every((x) => x === 200) && sm.every((x) => x === 200) && !!ion.id, JSON.stringify([sd, sm]));

  const p = await json('GET', '/api/insight/mentenanta', ckSef);
  const rd = p.j.randuri || [];
  const are = (ce, cine) => rd.filter((x) => x.ce === ce && (!cine || String(x.cine).indexOf(cine) >= 0))[0];
  T('lista are tot ce trebuie, într-o ordine: ITP expirat, revizia Caddy-ului, apoi RCA, uleiul (400 km), permisul lui Ion', p.status === 200 && rd.length === 5 &&
    rd[0].ce === 'ITP' && rd[0].stare === 'depasit' && rd[1].ce === 'Revizie generală' && rd[1].stare === 'depasit' && rd.slice(2).every((x) => x.stare === 'curand'), JSON.stringify(rd.map((x) => [x.ce, x.stare, x.cand])));
  T('„când", în cuvinte: „a expirat … (acum 3 zile)", „expiră … peste 5 zile", „mai are 400 de km (la 150.000 km)", „expiră … peste 10 zile"',
    /acum 3 zile\)$/.test((are('ITP') || {}).cand) && /peste 5 zile$/.test((are('RCA') || {}).cand) && (are('Schimb ulei + filtru') || {}).cand === 'mai are 400 de km (la 150.000 km)' && /peste 10 zile$/.test((are('Permis de conducere') || {}).cand),
    JSON.stringify(rd.map((x) => x.cand)));
  T('mașina scrisă cu numărul și numele; permisul cu numele șoferului; fiecare cu ecranul unde se rezolvă', /B 154 UIP/.test((are('ITP') || {}).cine) && (are('Permis de conducere') || {}).cine === 'Ion Popescu' &&
    (are('ITP') || {}).ecran === 'documente' && (are('Schimb ulei + filtru') || {}).ecran === 'maintenance' && (are('Permis de conducere') || {}).ecran === 'drivers');
  T('numărătoarea: 2 trecute, 3 care vin, 1 act fără dată (CASCO); rovinieta de peste 60 de zile nu e în listă', p.j.rezumat.depasite === 2 && p.j.rezumat.curand === 3 && p.j.rezumat.faraData === 1 && !are('Rovinietă'), JSON.stringify(p.j.rezumat));
  T('altă firmă: ITP-ul ei nu apare la noi', p.text.indexOf('CJ 01 ALT') < 0);
  // Aceleași stări ca listele Documente și Mentenanță
  const ld = (await json('GET', '/api/documents', ckSef)).j, lm = (await json('GET', '/api/maintenance', ckSef)).j;
  const stD = (tip) => ((Array.isArray(ld) ? ld : []).filter((x) => x.doc_type === tip)[0] || {})._due;
  const stM = (tip) => ((Array.isArray(lm) ? lm : []).filter((x) => x.type === tip)[0] || {})._due;
  T('aceleași stări ca listele: ITP „expired", RCA „soon", rovinieta „ok"; uleiul „due_soon", revizia „overdue"', stD('ITP') === 'expired' && stD('RCA') === 'soon' && stD('Rovinietă') === 'ok' && stM('Schimb ulei + filtru') === 'due_soon' && stM('Revizie generală') === 'overdue',
    [stD('ITP'), stD('RCA'), stD('Rovinietă'), stM('Schimb ulei + filtru'), stM('Revizie generală')].join(','));
  // Preavizul firmei: actele la 7 zile → RCA-ul de peste 5 zile rămâne, uleiul cu preaviz de 300 km iese din listă
  const pr = await json('PUT', '/api/companies/me/settings', ckSef, { alert_thresholds: { docDaysLead: 7, careKmLead: 300 } });
  const p2 = await json('GET', '/api/insight/mentenanta', ckSef);
  T('preavizul firmei schimbă lista (acte la 7 zile, revizii la 300 de km: uleiul cu 400 de km ieșit) și „Cum se socotește"', pr.status === 200 && !(p2.j.randuri || []).some((x) => x.ce === 'Schimb ulei + filtru') && (p2.j.randuri || []).some((x) => x.ce === 'RCA') && /cu 7 zile înainte de expirare/.test(((p2.j.explicatii || [])[0] || {}).text || '') && /300 de km/.test(((p2.j.explicatii || [])[0] || {}).text || ''),
    pr.status + ' ' + JSON.stringify((p2.j.randuri || []).map((x) => x.ce)) + ' ' + JSON.stringify((p2.j.explicatii || [])[0]));
  const pF = await json('GET', '/api/insight/mentenanta', ckFara);
  T('fără loc RA Insight: 403, fără lista', pF.status === 403 && !pF.j.randuri, pF.status);
  const pA = await json('GET', '/api/insight/mentenanta', ckAlt);
  T('cealaltă firmă își vede DOAR ITP-ul ei', pA.status === 200 && (pA.j.randuri || []).length === 1 && /CJ 01 ALT/.test(pA.j.randuri[0].cine) && pA.text.indexOf('B 154 UIP') < 0, JSON.stringify(pA.j.randuri));
  const nr = await json('GET', '/api/insight/ramuri', ckSef);
  T('numărul de lângă ramură = câte au trecut de termen + câte vin (' + (p2.j.rezumat || {}).depasite + ' + ' + (p2.j.rezumat || {}).curand + ')', nr.status === 200 && nr.j.mentenanta === p2.j.rezumat.depasite + p2.j.rezumat.curand, JSON.stringify(nr.j));
  T('…iar Safe Drive n-are număr cât luna nu e socotită (deschiderea secțiunii nu pornește socoteala)', nr.j.safedrive === undefined, JSON.stringify(nr.j));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); process.exit(1); });
