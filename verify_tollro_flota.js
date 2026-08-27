// verify_tollro_flota.js — „Taxa de drum" pe TOATĂ flota, prin ruta reală, pe server pornit.
//
//   node verify_tollro_flota.js
//
// Ecranul vechi calcula o mașină pe rând; „care camion mă costă cel mai mult" nu se putea afla.
// Aici se apără lista de flotă și, mai ales, ONESTITATEA ei:
//   • un vehicul sub 3,5 t și unul FĂRĂ masa în fișă sunt două probleme diferite și trebuie să
//     spună lucruri diferite — primul e o scutire, al doilea o fișă necompletată;
//   • norma Euro lipsă → tariful cel mai SCUMP, nu cel mai ieftin. Aici se calculează bani care
//     ajung în oferte: o estimare optimistă îl face pe om să piardă;
//   • totalul de sus se adună DOAR din vehiculele calculate, iar cât timp mai sunt în lucru o spune.

const { spawn } = require('child_process');
const fs = require('fs');
const toll = require('./tollro.js');

const PORT = 3192, DIR = '.toll-db';
const env = {
  ...process.env,
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_toll',
  PORT: String(PORT), TCP_PORT: '5192', PGLITE_DIR: DIR + '/pgdata',
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
  const PUT = (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: JSON.stringify(b) });

  // ─── flotă de probă ───
  const V = [
    { imei: '6611000000001', plate: 'CJ 12 ABC', brand: 'Volvo', model: 'FH 460', masa: 18000, euro: 'Euro 6' },
    { imei: '6611000000002', plate: 'B 84 TRK', brand: 'MAN', model: 'TGX', masa: 40000, euro: 'euro V' },
    { imei: '6611000000003', plate: 'SB 45 LOG', brand: 'Iveco', model: 'Eurocargo', masa: 9000, euro: null },
    { imei: '6611000000004', plate: 'AR 77 DUB', brand: 'Ford', model: 'Transit', masa: 3200, euro: 'Euro 6' },
    { imei: '6611000000005', plate: 'TM 00 GOL', brand: 'Scania', model: 'R450', masa: null, euro: 'Euro 6' },
  ];
  for (const v of V) {
    await POST('/api/devices', { imei: v.imei, plate: v.plate, brand: v.brand, model: v.model, vehicle_type: 'Camion' });
    const patch = {};
    if (v.masa) patch.max_weight_legal = v.masa;
    if (v.euro) patch.emission_class = v.euro;
    if (Object.keys(patch).length) await PUT('/api/devices/' + v.imei + '/details', patch);
  }

  sect('1. Lista flotei răspunde și încadrează fiecare mașină');
  const r0 = await GET('/api/tollro/flota');
  T('ruta răspunde', r0.status === 200, r0.status);
  const f = await r0.json();
  const gasesc = (p) => (f.vehicule || []).find(x => x.numar === p);
  T('sunt toate cele cinci în listă', V.every(v => !!gasesc(v.plate)), (f.vehicule || []).map(x => x.numar).join(', '));

  const cj = gasesc('CJ 12 ABC');
  T('18 t → treapta „peste 12 t"', cj && cj.categorie === 'c3', cj && cj.categorie);
  T('Euro 6 recunoscut', cj && cj.euroCunoscut === true);
  T('tariful vine din grilă, nu din interfață',
    cj && cj.leiPerKm.autostrada === toll.GRILA_IMPLICITA.tarife.c3.euro6.autostrada,
    cj && JSON.stringify(cj.leiPerKm));

  const bt = gasesc('B 84 TRK');
  T('„euro V" scris de mână e recunoscut ca Euro 5', bt && bt.euroCunoscut === true && /Euro 5/.test(bt.euroEticheta), bt && bt.euroEticheta);

  const sb = gasesc('SB 45 LOG');
  T('9 t → treapta „7,5 – 12 t"', sb && sb.categorie === 'c2', sb && sb.categorie);
  // Prudența costă bani în direcția bună: fără normă completată, calculăm SCUMP, nu ieftin.
  T('fără normă Euro → nu pretinde că o știe', sb && sb.euroCunoscut === false);
  T('și se taxează la tariful CEL MAI SCUMP',
    sb && sb.leiPerKm.autostrada === toll.GRILA_IMPLICITA.tarife.c2.euro3.autostrada,
    sb && (sb.leiPerKm.autostrada + ' vs euro3 ' + toll.GRILA_IMPLICITA.tarife.c2.euro3.autostrada));

  sect('2. „Nu se taxează" și „nu știm" sunt două lucruri diferite');
  const dub = gasesc('AR 77 DUB');
  T('3,2 t → nu intră la taxa pe km', dub && dub.aplicabil === false, dub && dub.aplicabil);
  T('și motivul spune „rovinietă", nu „fișă incompletă"', dub && /rovinietă/i.test(dub.motiv), dub && dub.motiv);
  const gol = gasesc('TM 00 GOL');
  T('fără masă în fișă → tot nu intră', gol && gol.aplicabil === false);
  T('dar motivul e ALTUL: fișa necompletată', gol && /masa maximă/i.test(gol.motiv) && !/rovinietă/i.test(gol.motiv), gol && gol.motiv);

  sect('3. Sumarul numără exact ce e în listă');
  const tax = (f.vehicule || []).filter(x => x.aplicabil).length;
  T('taxabile', f.sumar.taxabile === tax, f.sumar.taxabile + ' vs ' + tax);
  T('neaplicabile', f.sumar.neaplicabile === (f.vehicule.length - tax), JSON.stringify(f.sumar));
  T('spune de când se aplică taxa', !!f.aplicabilDin, f.aplicabilDin);
  T('și dacă e deja în vigoare', typeof f.inVigoare === 'boolean', f.inVigoare);

  sect('4. Flota demo nu apare în flota reală');
  const demoImeis = require('./demo-sim.js').DEMO_IMEIS;
  const cos = await (await GET('/api/companies')).json();
  const coDemo = (Array.isArray(cos) ? cos : []).find(c => c.slug === 'demo');
  T('compania demo chiar există (altfel proba nu verifică nimic)',
    coDemo && Number(coDemo.device_count) === demoImeis.length, coDemo && coDemo.device_count);
  T('niciun IMEI demo în listă', (f.vehicule || []).every(x => demoImeis.indexOf(x.imei) < 0),
    (f.vehicule || []).map(x => x.imei).filter(i => demoImeis.indexOf(i) >= 0).join(', '));

  const fara = await fetch(B + '/api/tollro/flota');
  T('fără autentificare → refuzat', fara.status === 401 || fara.status === 403, fara.status);

  // ─── de la răspunsul serverului până la ce scrie pe ecran ───
  sect('5. Ecranul nu prezintă un total pe jumătate ca fiind total');
  const js = fs.readFileSync('./public/js/demo-modules-ui.js', 'utf8');
  const i = js.indexOf('  function trFlotaHtml() {');
  const j = js.indexOf('  // Calculul flotei: SECVENȚIAL', i);
  T('găsesc codul listei în interfață', i > 0 && j > i);
  if (i > 0 && j > i) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const trNum = (v) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const trKm = (v) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });
    const trData = (x) => String(x || '');
    const mk = new Function('_tr', 'esc', 'trNum', 'trKm', 'trData',
      js.slice(i, j) + '\n; return trFlotaHtml;');

    // trei calculate, una încă în lucru → totalul NU are voie să se prezinte ca definitiv
    const stare = {
      flota: f, costuri: {
        [gasesc('CJ 12 ABC').imei]: { stare: 'gata', total: 238.37, kmTaxati: 580.7, linii: [{ taxabil: true, cost: 198, culoare: '#22c55e' }, { taxabil: true, cost: 40.37, culoare: '#ef4444' }] },
        [gasesc('B 84 TRK').imei]: { stare: 'gata', total: 260.40, kmTaxati: 598.6, linii: [{ taxabil: true, cost: 205, culoare: '#22c55e' }, { taxabil: true, cost: 55.4, culoare: '#ef4444' }] },
        // Cifra veche de 999 e pusă ANUME: `_tr.costuri` se refolosește între rulări, iar dacă
        // totalul s-ar aduna din toate rândurile (nu doar din cele terminate), ea ar intra în sumă
        // și omul ar citi un total umflat cu un rezultat de acum două ore.
        [gasesc('SB 45 LOG').imei]: { stare: 'lucreaza', total: 999, kmTaxati: 999 },
      },
    };
    const partial = mk(stare, esc, trNum, trKm, trData)();
    T('cât timp se lucrează, scrie „până acum"', /până acum/.test(partial), partial.slice(0, 300));
    T('și spune câte vehicule au intrat în sumă', /2 din 3 vehicule/.test(partial), (partial.match(/\d+ din \d+ vehicule/) || [])[0]);
    T('totalul e suma celor TERMINATE, nu a tuturor rândurilor',
      partial.indexOf(trNum(238.37 + 260.40)) >= 0 && partial.indexOf(trNum(238.37 + 260.40 + 999)) < 0,
      'aștept ' + trNum(238.37 + 260.40) + ', am găsit ' + ((partial.match(/tr-tot-s">([^<]+)/) || [])[1]));
    T('cea în lucru se vede ca atare', /se calculează/.test(partial));
    T('cea sub 3,5 t își spune motivul pe ecran', /rovinietă/i.test(partial));
    T('cea fără masă spune ALTCEVA', /masa maximă/i.test(partial));

    stare.costuri[gasesc('SB 45 LOG').imei] = { stare: 'gata', total: 108.48, kmTaxati: 336, linii: [{ taxabil: true, cost: 108.48, culoare: '#22c55e' }] };
    const complet = mk(stare, esc, trNum, trKm, trData)();
    T('când s-a terminat, nu mai scrie „până acum"', !/până acum/.test(complet));
    T('ordinea e după cost, cel mai scump primul',
      complet.indexOf('B 84 TRK') < complet.indexOf('CJ 12 ABC') && complet.indexOf('CJ 12 ABC') < complet.indexOf('SB 45 LOG'),
      'B=' + complet.indexOf('B 84 TRK') + ' CJ=' + complet.indexOf('CJ 12 ABC') + ' SB=' + complet.indexOf('SB 45 LOG'));
    // Cele fără taxă se duc la coadă, sub titlul lor — nu amestecate printre cele cu bani.
    T('cele fără taxă stau la sfârșit, separat',
      complet.indexOf('Fără taxă pe kilometru') > complet.indexOf('SB 45 LOG'),
      'titlu=' + complet.indexOf('Fără taxă pe kilometru'));
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
