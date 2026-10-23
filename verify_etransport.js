// verify_etransport.js — secțiunea e-Transport, capăt-la-capăt, pe un server pornit de probă.
//
//   node verify_etransport.js
//
// Ce apără, în ordinea în care costă bani:
//  1. Termenul codului UIT (5 zile; 15 la achiziții intracomunitare) — aplicația nu are voie să
//     inventeze un termen și nici să tacă atunci când nu-l știe.
//  2. Că „vehiculul transmite către NOI" și „noi trimitem la ANAF" rămân DOUĂ lucruri diferite.
//     Fără tokenul ANAF nu pleacă nimic; dacă ecranul ar arăta un singur semafor verde, omul ar
//     citi „sunt în regulă la ANAF" fiind, de fapt, neraportat. Amenda e 20.000–100.000 lei.
//  3. Că un transport se leagă de un vehicul REAL din flotă, nu de un IMEI tastat greșit.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const etr = require('./etransport.js');

// ── Faza „seed" (23.10): termene VECHI, scrise „până la 23:59:59" fără fus — cum le scriau pagina, telefonul și
// propunerea veche a serverului, citite pe ceasul serverului (UTC), deci cu trei ore după miezul nopții României.
// Puse direct în baza probei, de un proces separat, ÎNAINTE de pornirea serverului: pe ușa de azi nu se mai poate
// scrie unul. Mutarea se probează aici o dată (și a doua oară nu mai face nimic), apoi rămâne un termen vechi pe
// care îl mută serverul la pornire.
if (process.argv.indexOf('--faza=seed') >= 0) {
  process.env.TZ = 'UTC';   // ca serverul (server.js își pune singur fusul pe UTC)
  (async () => {
    const db = require('./db');
    await db.initDb();
    const pune = async (uit, pana) => (await db.pool.query(
      "INSERT INTO etransport (uit, status, tip_operatiune, valabil_pana) VALUES ($1, 'activ', 'national', $2) RETURNING id", [uit, pana])).rows[0].id;
    const a = await pune('3019000001', '2026-11-20 23:59:59');   // vechi: „până pe 20.11" pe ceasul serverului
    const b = await pune('3019000002', '2026-11-20 14:00:00');   // altă oră, scrisă de cineva anume: nu se atinge
    const n1 = await db.migreazaTermeneEtransport(etr.termenDinFormular);
    const n2 = await db.migreazaTermeneEtransport(etr.termenDinFormular);
    const c = await pune('3019000003', '2026-10-25 23:59:59');   // ziua în care se schimbă ora: îl mută serverul, la pornire
    await db.setSetting('etransport_termen_ro_migrat', '');
    const citeste = async (id) => { const r = (await db.pool.query('SELECT valabil_pana FROM etransport WHERE id = $1', [id])).rows[0]; return r && r.valabil_pana ? new Date(r.valabil_pana).toISOString() : null; };
    console.log('SEED ' + JSON.stringify({ n1, n2, a: await citeste(a), b: await citeste(b), c: await citeste(c) }));
    await db.closeDb();
    process.exit(0);
  })().catch((e) => { console.log('SEED-EROARE ' + ((e && e.stack) || e)); process.exit(1); });
  return;
}

const PORT = 3194, DIR = '.et-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_et',
  PORT: String(PORT), TCP_PORT: '5194', PGLITE_DIR: DIR + '/pgdata',
};
delete env.DATABASE_URL;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const seed = spawnSync(process.execPath, [__filename, '--faza=seed'], { cwd: __dirname, env, encoding: 'utf8', timeout: 240000 });
const SEED = (function () {
  const l = String(seed.stdout || '').split('\n').filter((x) => x.indexOf('SEED ') === 0)[0];
  try { return l ? JSON.parse(l.slice(5)) : null; } catch (e) { return null; }
})();
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

(async () => {
  // ─── regulile, fără server ───
  sect('1. Termenul codului UIT');
  const ACUM = '2026-08-26T12:00:00.000Z';
  T('5 zile pe teritoriul național', etr.zileValabile('national') === 5, etr.zileValabile('national'));
  T('15 zile la achiziții intracomunitare', etr.zileValabile('intracomunitar') === 15, etr.zileValabile('intracomunitar'));
  T('un tip necunoscut cade pe termenul SCURT, nu pe cel lung',
    etr.zileValabile('ceva-nou') === 5, etr.zileValabile('ceva-nou'));
  T('expirat de 13 ore', etr.scadenta('2026-08-25T23:00:00Z', ACUM).stare === 'expirat');
  T('sub 24 de ore → „curând"', etr.scadenta('2026-08-27T01:00:00Z', ACUM).stare === 'curand');
  T('peste 24 de ore → în regulă', etr.scadenta('2026-08-30T23:59:59Z', ACUM).stare === 'ok');
  // Fără termen nu inventăm o zi. Un termen fals liniștitor e mai rău decât unul lipsă.
  const fara = etr.scadenta(null, ACUM);
  T('fără termen → „necunoscut", nu o dată inventată', fara.stare === 'necunoscut' && fara.oreRamase === null, JSON.stringify(fara));
  T('o dată de start stricată nu produce un termen', etr.valabilPana('nu-e-o-data', 'national') === null);

  // 23.10 (Alin: „rezolvă-le"): ziua se încheia la miezul nopții de la Londra — „valabil până pe 23.10" ținea, pe ecran,
  // până pe 24.10 la 02:59. Termenul e acum CLIPA ultimei secunde a zilei României (vara UTC+3, iarna UTC+2).
  sect('1b. Ziua codului se încheie la miezul nopții României, nu al serverului');
  const egal = (n, a, b) => T(n, a === b, a + ' în loc de ' + b);
  egal('„până pe 23.10" (vara) = 23.10, 23:59:59 la noi', etr.termenDinFormular('2026-10-23T23:59:59'), '2026-10-23T20:59:59.000Z');
  egal('doar ziua, fără oră = toată ziua aceea', etr.termenDinFormular('2026-10-23'), '2026-10-23T20:59:59.000Z');
  egal('iarna, la fel (UTC+2)', etr.termenDinFormular('2026-11-20T23:59:59'), '2026-11-20T21:59:59.000Z');
  egal('25.10, ziua în care ora se dă înapoi (25 de ore): capătul e pe ora de iarnă', etr.termenDinFormular('2026-10-25T23:59:59'), '2026-10-25T21:59:59.000Z');
  egal('29.03, ziua în care ora se dă înainte (23 de ore): capătul e pe ora de vară', etr.termenDinFormular('2026-03-29T23:59:59'), '2026-03-29T20:59:59.000Z');
  egal('o oră din ziua schimbării, după salt (05:00 la noi)', etr.termenDinFormular('2026-10-25T05:00:00'), '2026-10-25T03:00:00.000Z');
  egal('o clipă cu fus rămâne clipa ei', etr.termenDinFormular('2026-10-23T18:00:00Z'), '2026-10-23T18:00:00.000Z');
  T('ce nu e o dată → null (ruta îl refuză), nu un termen ghicit',
    etr.termenDinFormular('mâine') === null && etr.termenDinFormular('2026-02-30') === null && etr.termenDinFormular('2026-10-23T25:00') === null);
  egal('propunerea: start 18.10 + 5 zile = toată ziua de 23.10, la noi', etr.valabilPana('2026-10-18', 'national'), '2026-10-23T20:59:59.000Z');
  egal('propunerea trece peste schimbarea orei: 20.10 + 5 = 25.10, pe ora de iarnă', etr.valabilPana('2026-10-20', 'national'), '2026-10-25T21:59:59.000Z');
  egal('o pornire la 01:30 (ora noastră) e din ziua ei, nu din ziua de dinainte a serverului', etr.valabilPana('2026-10-22T22:30:00Z', 'national'), '2026-10-28T21:59:59.000Z');
  egal('15 zile la achiziții intracomunitare, tot la miezul nopții de la noi', etr.valabilPana('2026-10-01', 'intracomunitar'), '2026-10-16T20:59:59.000Z');
  T('la 01:00 pe 24.10 (ora noastră), codul „până pe 23.10" e EXPIRAT — înainte ecranul îl arăta valabil încă două ore',
    etr.scadenta(etr.termenDinFormular('2026-10-23T23:59:59'), '2026-10-23T22:00:00Z').stare === 'expirat');
  T('la 23:30 pe 23.10, „expiră curând", cu 0 ore rămase',
    (function (s) { return s.stare === 'curand' && s.oreRamase === 0; })(etr.scadenta(etr.termenDinFormular('2026-10-23T23:59:59'), '2026-10-23T20:30:00Z')));
  T('regula nu depinde de fusul calculatorului care o rulează',
    spawnSync(process.execPath, ['-e', "const e=require('./etransport');process.stdout.write(e.termenDinFormular('2026-10-25T23:59:59')+' '+e.valabilPana('2026-10-22T22:30:00Z','national'))"],
      { cwd: __dirname, env: Object.assign({}, process.env, { TZ: 'America/New_York' }), encoding: 'utf8' }).stdout === '2026-10-25T21:59:59.000Z 2026-10-28T21:59:59.000Z');

  sect('2. „Transmite" nu înseamnă „raportat la ANAF"');
  const mut = { valabil_pana: '2026-08-30T23:59:59Z', ultima_pozitie: '2026-08-26T11:10:00Z', last_sent_at: null };
  const sFaraAnaf = etr.stareTransport(mut, ACUM, false);
  const sCuAnaf = etr.stareTransport(mut, ACUM, true);
  T('vehiculul tăcut e problemă și fără ANAF', sFaraAnaf.stare === 'problema', JSON.stringify(sFaraAnaf.motive));
  T('motivul e scris pe litere, nu doar o culoare', /nu mai transmite de 50 min/.test(sFaraAnaf.motive.join('|')), sFaraAnaf.motive.join('|'));
  T('fără ANAF pornit NU se pretinde nimic despre ANAF',
    !sFaraAnaf.motive.some(m => /ANAF/i.test(m)) && sFaraAnaf.minuteFaraAnaf === null, JSON.stringify(sFaraAnaf.motive));
  T('cu ANAF pornit, netrimiterea e un motiv în plus',
    sCuAnaf.motive.some(m => /ANAF/i.test(m)), JSON.stringify(sCuAnaf.motive));
  const bun = { valabil_pana: '2026-08-30T23:59:59Z', ultima_pozitie: '2026-08-26T11:58:00Z', last_sent_at: '2026-08-26T11:59:00Z' };
  T('totul proaspăt → în regulă', etr.stareTransport(bun, ACUM, true).stare === 'ok');
  // O poziție veche de o oră trimisă ca „acum" ar fi o declarație falsă către ANAF.
  T('o poziție veche NU trece drept transmisie curentă',
    etr.stareTransport({ valabil_pana: bun.valabil_pana, ultima_pozitie: '2026-08-26T11:00:00Z', last_sent_at: '2026-08-26T11:59:00Z' }, ACUM, true).stare === 'problema');

  // ─── server ───
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await sleep(500);
  }
  const lr = await fetch(B + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }),
  });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); return gata(1); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')])
    .filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const GET = (u) => fetch(B + u, { headers: { Cookie: ck } });
  const POST = (u, b) => fetch(B + u, { method: 'POST', headers: H, body: JSON.stringify(b) });

  const s0 = await GET('/api/etransport/scadentar');
  if (s0.status === 403) { console.log('\n⚠ Modulul e-Transport nu e activ pentru contul de probă.'); return gata(1); }
  T('scadențarul răspunde', s0.status === 200, s0.status);
  const d0 = await s0.json();

  sect('3. Ecranul spune limpede că nu se trimite nimic la ANAF');
  // Serverul de probă n-are token ANAF. Asta NU e un detaliu tehnic: fără el, tot ce urmează e
  // evidență internă, nu conformitate. Dacă ecranul ar tăcea, omul ar crede că e raportat.
  T('răspunsul spune că ANAF e oprit', d0.anaf && d0.anaf.pornit === false, JSON.stringify(d0.anaf));
  const html = fs.readFileSync('./public/index.html', 'utf8');
  // Textul e scris în cuvintele CLIENTULUI din 18.09: zicea „lipsește tokenul", care e jargon și
  // suna a vina lui — tokenul ANAF e al platformei. Regula păzită aici e aceeași: ecranul TREBUIE
  // s-o spună, într-o bandă de avertizare, nu într-o notă de subsol.
  T('interfața are un mesaj pentru cazul ăsta', /Raportarea către ANAF nu e pornită încă/.test(html));
  T('și nu-l ascunde într-o notă de subsol (e o bandă de avertizare)',
    /b-warn[^]{0,160}Raportarea către ANAF nu e pornită încă/.test(html));

  sect('4. Transportul se leagă de un vehicul real din flotă');
  // Vehiculul e al unei FIRME. Un transport fără firmă n-ar fi al nimănui: n-ar apărea nici în
  // lista clientului (căutată pe firmă), nici în privirea noastră pe firme, iar la ANAF n-ar avea
  // CIF sub care să fie declarat.
  const coId = (await (await POST('/api/companies', { name: 'CI Etr Transport' })).json()).id;
  const veh = { imei: '7711000000001', plate: 'CJ 99 ETR', vehicle_type: 'Camion', company_id: coId };
  await POST('/api/devices', veh);
  const faraFirma = { imei: '7711000000009', plate: 'CJ 11 ORF', vehicle_type: 'Camion' };
  await POST('/api/devices', faraFirma);
  const orfan = await POST('/api/etransport', { uit: '3010000003', imei: faraFirma.imei });
  T('vehicul neatribuit unei firme → transport refuzat, nu salvat orfan', orfan.status === 400,
    orfan.status + ' ' + JSON.stringify(await orfan.json().catch(() => ({}))));
  const rauImei = await POST('/api/etransport', { uit: '3010000001', imei: '000000000000999' });
  T('IMEI inexistent → refuzat', rauImei.status === 400, rauImei.status);
  const rauDrv = await POST('/api/etransport', { uit: '3010000002', imei: veh.imei, driver_id: 999999 });
  T('șofer inexistent → refuzat', rauDrv.status === 400, rauDrv.status);
  const faraUit = await POST('/api/etransport', { imei: veh.imei });
  T('fără cod UIT → refuzat', faraUit.status === 400, faraUit.status);

  const azi = new Date().toISOString().slice(0, 10);
  const cr = await POST('/api/etransport', {
    uit: '3010000010', imei: veh.imei, loc_start: 'Cluj-Napoca', loc_final: 'Constanța',
    marfa: 'Legume · 18,4 t', tip_operatiune: 'national', start_at: azi,
  });
  const tr = await cr.json();
  T('transportul se creează', cr.status === 200 && tr.id, JSON.stringify(tr).slice(0, 120));
  T('numărul de înmatriculare se ia din fișa vehiculului, nu se retastează', tr.plate === veh.plate, tr.plate);
  T('termenul se propune singur când nu e dat', !!tr.valabil_pana, tr.valabil_pana);
  const propus = etr.valabilPana(azi, 'national');
  T('și e cel din reguli, nu altul — până la secundă (miezul nopții României)',
    tr.valabil_pana && new Date(tr.valabil_pana).toISOString() === propus,
    tr.valabil_pana + ' vs ' + propus);

  sect('5. Un vehicul care nu transmite urcă în „de rezolvat acum"');
  const s1 = await (await GET('/api/etransport/scadentar')).json();
  const g1 = (s1.active || []).find(x => x.id === tr.id);
  T('apare în lista activă', !!g1, (s1.active || []).map(x => x.uit).join(', '));
  // Vehiculul tocmai a fost adăugat și n-a transmis niciodată — cazul cel mai periculos, fiindcă
  // n-ai NIMIC de raportat la ANAF, iar termenul UIT curge oricum.
  T('starea e „problema", deși codul UIT e valabil', g1 && g1.stare === 'problema', g1 && g1.stare + ' / ' + JSON.stringify(g1.motive));
  T('motivul spune că nu există nicio poziție', g1 && /nicio poziție/.test(g1.motive.join('|')), g1 && g1.motive.join('|'));
  T('sumarul îl numără la probleme', s1.sumar.probleme >= 1, JSON.stringify(s1.sumar));

  // Injectăm o poziție proaspătă (rută de probă, NODE_ENV=test) — aceeași sursă pe care o citește
  // mecanismul care trimite la ANAF.
  const inj = await POST('/api/debug/live-io', { imei: veh.imei, io: { ignition: 1 } });
  T('pot injecta o poziție de probă', inj.status === 200, inj.status);
  const s2 = await (await GET('/api/etransport/scadentar')).json();
  const g2 = (s2.active || []).find(x => x.id === tr.id);
  T('cu poziție proaspătă, transportul trece în regulă', g2 && g2.stare === 'ok', g2 && g2.stare + ' / ' + JSON.stringify(g2.motive));
  T('și nu mai are niciun motiv de alarmă', g2 && g2.motive.length === 0, g2 && JSON.stringify(g2.motive));

  sect('6. Un cod fără termen nu se raportează ca fiind în regulă');
  const fp = await (await POST('/api/etransport', { uit: '3010000020', imei: veh.imei, valabil_pana: null, start_at: null })).json();
  const s3 = await (await GET('/api/etransport/scadentar')).json();
  const g3 = (s3.active || []).find(x => x.id === fp.id);
  T('are totuși un termen propus din ziua de azi', g3 && g3.oreRamase !== null, g3 && g3.oreRamase);

  sect('7. Flota demo nu intră în e-Transportul unei flote reale');
  const demoImeis = require('./demo-sim.js').DEMO_IMEIS;
  const cos = await (await GET('/api/companies')).json();
  const coDemo = (Array.isArray(cos) ? cos : []).find(c => c.slug === 'demo');
  T('compania demo chiar există (altfel proba nu verifică nimic)',
    coDemo && Number(coDemo.device_count) === demoImeis.length, coDemo && coDemo.device_count);
  // Prima verificare de mai jos e cea care apără cu adevărat: un vehicul demo nu poate fi legat de
  // un transport real, fiindcă `canAccessImei` îl refuză din start.
  //
  // ⚠ Onest: din cauza refuzului ăstuia, un rând demo NU poate fi creat prin API, deci filtrul din
  // scadențar nu poate fi probat de aici — e a doua linie de apărare, pentru o cale viitoare care
  // ar ocoli ruta (import, migrare, seed). Prima versiune a probei verifica DOAR lista și trecea
  // degeaba: transportul nu se crea, lista ieșea goală, proba se declara mulțumită.
  const demoTr = await POST('/api/etransport', { uit: '3010000099', imei: demoImeis[0] });
  T('un vehicul demo e REFUZAT la crearea transportului', demoTr.status === 403 || demoTr.status === 400,
    demoTr.status + ' — dacă a mers, un transport real s-a legat de o mașină sintetică');
  const s4 = await (await GET('/api/etransport/scadentar')).json();
  const toate = (s4.active || []).concat(s4.incheiate || []);
  T('și niciun IMEI demo nu ajunge în listă',
    !toate.some(x => demoImeis.indexOf(x.imei) >= 0), toate.map(x => x.imei).join(', '));

  sect('8. Ruta cu nume fix nu e înghițită de /api/etransport/:id');
  const sc = await GET('/api/etransport/scadentar');
  const j = await sc.json();
  T('„scadentar" ajunge la scadențar', sc.status === 200 && Array.isArray(j.active), sc.status + ' · ' + Object.keys(j).join(','));
  const tip = await (await GET('/api/etransport/tipuri')).json();
  T('tipurile de operațiune vin de la server, nu din interfață',
    Array.isArray(tip.tipuri) && tip.tipuri.length === etr.TIPURI.length, JSON.stringify(tip).slice(0, 80));
  T('interfața nu-și scrie de mână „5 zile"', !/5 zile[^]{0,40}intracomunitar/i.test(html));

  const fara2 = await fetch(B + '/api/etransport/scadentar');
  T('fără autentificare → refuzat', fara2.status === 401 || fara2.status === 403, fara2.status);

  sect('9. Termenul de pe ecran („ziua aleasă T23:59:59", fără fus) e miezul nopții României — și pe server');
  const PUT = (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: JSON.stringify(b) });
  const ziRO = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  const capatAzi = etr.termenDinFormular(ziRO + 'T23:59:59');
  const ca = await POST('/api/etransport', { uit: '3010000030', imei: veh.imei, valabil_pana: ziRO + 'T23:59:59' });
  const ta = await ca.json();
  T('ca de pe pagină și de pe telefon: „azi, 23:59:59" se salvează ca ultima secundă a zilei de la noi',
    ca.status === 200 && ta.valabil_pana && new Date(ta.valabil_pana).toISOString() === capatAzi, ca.status + ' ' + ta.valabil_pana + ' vs ' + capatAzi);
  const s9 = await (await GET('/api/etransport/scadentar')).json();
  const g9 = (s9.active || []).find(x => x.id === ta.id);
  const oreAzi = Math.floor((Date.parse(capatAzi) - Date.now()) / 3600000);
  T('orele rămase se socotesc până la miezul nopții de la noi (înainte: cu 2–3 ore în plus)',
    g9 && (g9.oreRamase === oreAzi || g9.oreRamase === oreAzi - 1) && g9.oreRamase < 24, g9 && g9.oreRamase + ' vs ' + oreAzi);
  const rau9 = await POST('/api/etransport', { uit: '3010000031', imei: veh.imei, valabil_pana: 'mâine' });
  const jr9 = await rau9.json().catch(() => ({}));
  T('un termen care nu e o dată se refuză pe față, nu se salvează ghicit', rau9.status === 400 && /nu e o dată/.test(jr9.error || ''), rau9.status + ' ' + JSON.stringify(jr9));
  const up = await PUT('/api/etransport/' + ta.id, { valabil_pana: '2026-11-20T23:59:59' });
  const s9b = await (await GET('/api/etransport/scadentar')).json();
  const g9b = (s9b.active || []).concat(s9b.incheiate || []).find(x => x.id === ta.id);
  T('și la corectură (PUT), ziua aleasă = miezul nopții României (iarna: 21:59:59 UTC)',
    up.status === 200 && g9b && new Date(g9b.valabilPana).toISOString() === '2026-11-20T21:59:59.000Z', up.status + ' ' + (g9b && g9b.valabilPana));
  const upRau = await PUT('/api/etransport/' + ta.id, { valabil_pana: '2026-02-30' });
  T('la corectură, o zi care nu există se refuză', upRau.status === 400, upRau.status);

  sect('10. Termenele vechi (scrise pe ceasul serverului) trec pe miezul nopții României, o singură dată');
  T('pregătirea bazei probei: termene vechi puse înainte de pornirea serverului', !!SEED, String(seed.stdout || '').slice(-300) + String(seed.stderr || '').slice(-300));
  if (SEED) {
    T('mutarea ia termenul vechi „20.11, 23:59:59 (UTC)" și îl face 20.11, 23:59:59 la noi', SEED.n1 === 1 && SEED.a === '2026-11-20T21:59:59.000Z', JSON.stringify(SEED));
    T('o oră anume (14:00), scrisă de cineva, nu se atinge', SEED.b === '2026-11-20T14:00:00.000Z', SEED.b);
    T('a doua oară nu mai mută nimic (ține minte că s-a făcut)', SEED.n2 === 0, SEED.n2);
    const toate10 = (s9b.active || []).concat(s9b.incheiate || []);
    const c10 = toate10.find(x => x.uit === '3019000003'), a10 = toate10.find(x => x.uit === '3019000001');
    T('serverul o face singur, la pornire — și pe ziua schimbării orei (25.10 → 21:59:59 UTC)',
      c10 && new Date(c10.valabilPana).toISOString() === '2026-10-25T21:59:59.000Z', c10 && c10.valabilPana);
    T('…iar ce mutase deja nu mai mută a doua oară', a10 && new Date(a10.valabilPana).toISOString() === '2026-11-20T21:59:59.000Z', a10 && a10.valabilPana);
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
