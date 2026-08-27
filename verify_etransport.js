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

const { spawn } = require('child_process');
const fs = require('fs');
const etr = require('./etransport.js');

const PORT = 3194, DIR = '.et-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_et',
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
  T('interfața are un mesaj pentru cazul ăsta', /Nu trimitem nimic la ANAF/.test(html));
  T('și nu-l ascunde într-o notă de subsol (e o bandă de avertizare)',
    /b-warn[^]{0,120}Nu trimitem nimic la ANAF/.test(html));

  sect('4. Transportul se leagă de un vehicul real din flotă');
  const veh = { imei: '7711000000001', plate: 'CJ 99 ETR', vehicle_type: 'Camion' };
  await POST('/api/devices', veh);
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
  T('și e cel din reguli, nu altul',
    String(tr.valabil_pana).slice(0, 10) === String(propus).slice(0, 10),
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

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
