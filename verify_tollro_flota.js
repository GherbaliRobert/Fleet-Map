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

  sect('2b. Un autoturism nu e întrebat cât cântărește');
  // Cazul lui Alin (26.08): toate cele trei mașini ale fondatorilor cereau „masa maximă în fișă",
  // deși două erau un Dacia Logan și un VW Caddy. La un autoturism întrebarea n-are răspuns util.
  const LOGAN = '6611000000010', COMBINA = '6611000000011', DUBA = '6611000000012';
  await POST('/api/devices', { imei: LOGAN, plate: 'B 154 UIP', brand: 'Dacia', model: 'Logan', vehicle_type: 'Auto' });
  await POST('/api/devices', { imei: COMBINA, plate: 'AG 10 CMB', brand: 'Claas', model: 'Lexion', vehicle_type: 'Combină agricolă' });
  await POST('/api/devices', { imei: DUBA, plate: 'B 268 ROY', brand: 'VW', model: 'Caddy', vehicle_type: 'Duba' });
  const f2 = await (await GET('/api/tollro/flota')).json();
  const g2 = (p) => (f2.vehicule || []).find(x => x.numar === p);

  const lg = g2('B 154 UIP');
  T('autoturismul nu intră la taxă', lg && lg.aplicabil === false, lg && lg.aplicabil);
  T('și NU i se cere masa — i se spune că e autoturism',
    lg && /autoturism/i.test(lg.motiv) && !/masa maximă/i.test(lg.motiv), lg && lg.motiv);
  const cb = g2('AG 10 CMB');
  T('combina agricolă (cu diacritice în fișă) e recunoscută',
    cb && cb.aplicabil === false && /utilaj/i.test(cb.motiv), cb && cb.motiv);
  // Duba rămâne întrebată dinadins: un Sprinter e chiar la limita de 3,5 t.
  const db2 = g2('B 268 ROY');
  T('duba TOT e întrebată cât cântărește (poate fi peste 3,5 t)',
    db2 && /masa maximă/i.test(db2.motiv), db2 && db2.motiv);

  sect('3. Sumarul numără exact ce e în listă');
  const tax = (f2.vehicule || []).filter(x => x.aplicabil).length;
  T('taxabile', f2.sumar.taxabile === tax, f2.sumar.taxabile + ' vs ' + tax);
  T('neaplicabile', f2.sumar.neaplicabile === (f2.vehicule.length - tax), JSON.stringify(f2.sumar));
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
  const j = js.indexOf('  // ── sfârșit lista flotei ──', i);
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
    // Verificarea se uită DOAR în eticheta totalului. Titlul filei conține și el „până acum"
    // („Ce a costat până acum"), iar o căutare pe tot HTML-ul ar trece chiar dacă totalul ar minți.
    const etTotal = (h) => (h.match(/tr-tot-b">([^<]*)/) || [])[1] || '';
    T('cât timp se lucrează, totalul scrie „până acum"', /până acum/.test(etTotal(partial)), etTotal(partial));
    T('și spune câte vehicule au intrat în sumă', /2 din 3 vehicule/.test(etTotal(partial)), etTotal(partial));
    T('totalul e suma celor TERMINATE, nu a tuturor rândurilor',
      partial.indexOf(trNum(238.37 + 260.40)) >= 0 && partial.indexOf(trNum(238.37 + 260.40 + 999)) < 0,
      'aștept ' + trNum(238.37 + 260.40) + ', am găsit ' + ((partial.match(/tr-tot-s">([^<]+)/) || [])[1]));
    T('cea în lucru se vede ca atare', /se calculează/.test(partial));
    T('cea sub 3,5 t își spune motivul pe ecran', /rovinietă/i.test(partial));
    T('cea fără masă spune ALTCEVA', /masa maximă/i.test(partial));

    stare.costuri[gasesc('SB 45 LOG').imei] = { stare: 'gata', total: 108.48, kmTaxati: 336, linii: [{ taxabil: true, cost: 108.48, culoare: '#22c55e' }] };
    const complet = mk(stare, esc, trNum, trKm, trData)();
    T('când s-a terminat, totalul NU mai scrie „până acum"', !/până acum/.test(etTotal(complet)), etTotal(complet));
    T('ordinea e după cost, cel mai scump primul',
      complet.indexOf('B 84 TRK') < complet.indexOf('CJ 12 ABC') && complet.indexOf('CJ 12 ABC') < complet.indexOf('SB 45 LOG'),
      'B=' + complet.indexOf('B 84 TRK') + ' CJ=' + complet.indexOf('CJ 12 ABC') + ' SB=' + complet.indexOf('SB 45 LOG'));
    // Cele fără taxă se duc la coadă, sub titlul lor — nu amestecate printre cele cu bani.
    T('cele fără taxă stau la sfârșit, separat',
      complet.indexOf('Fără taxă pe kilometru') > complet.indexOf('SB 45 LOG'),
      'titlu=' + complet.indexOf('Fără taxă pe kilometru'));
  }

  sect('6. O flotă fără camioane își spune de ce e goală');
  // Cazul fondatorilor: trei autoturisme. Ecranul nu va avea NICIODATĂ ce calcula, iar fără un mesaj
  // rămâne o listă gri fără cap și fără coadă — omul crede că a stricat ceva.
  if (i > 0 && j > i) {
    const escH = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nr = (v) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kmF = (v) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });
    const dt = (x) => String(x || '');
    const mkF = new Function('_tr', 'esc', 'trNum', 'trKm', 'trData', js.slice(i, j) + '\n; return trFlotaHtml;');
    const doarMasini = {
      vehicule: (f2.vehicule || []).filter(v => !v.aplicabil),
      aplicabilDin: f2.aplicabilDin, inVigoare: false,
      sumar: { total: 3, taxabile: 0, neaplicabile: 3 },
    };
    const gol2 = mkF({ flota: doarMasini, costuri: {} }, escH, nr, kmF, dt)();
    T('spune limpede că nicio mașină nu intră la taxă', /Nicio mașină din flotă nu intră/.test(gol2));
    T('și explică pentru cine e taxa', /peste 3,5 t/.test(gol2) && /rovinietă/i.test(gol2));
    // Un avertisment despre data intrării în vigoare, pe un ecran fără nicio sumă, avertizează
    // despre nimic — și împinge mesajul care contează mai jos.
    T('NU mai avertizează despre data taxei când n-are ce calcula', !/Taxa se aplică din/.test(gol2), gol2.slice(0, 200));
    T('motivul stă lângă mașină, ca frază, nu ca etichetă în colț', /tr-motiv/.test(gol2));
    T('titlul grupei nu mai zice „fără taxă" când toate sunt așa', /Vehiculele tale/.test(gol2), (gol2.match(/tr-gh">([^<]+)/) || [])[1]);
  }

  sect('7. Cursă nouă: profilul NU se poate contrazice');
  // Pe ecranul concurenței, treapta de taxare era un selector liber. Alin a lăsat „3,5–7,5 t" pe un
  // camion de 41 t declarat în ACELAȘI formular, iar costul a ieșit de trei ori mai mic. Aici treapta
  // se calculează din masa din fișă; formularul nu are ce contrazice.
  const st = await (await GET('/api/tollro/rutare')).json();
  T('serverul spune dacă rutarea e pornită', typeof st.pornit === 'boolean', JSON.stringify(st));
  T('fără cheie, o spune pe litere, nu tace', st.pornit || /chei/i.test(st.motiv || ''), st.motiv);

  const faraPuncte = await POST('/api/tollro/cursa', { imei: V[0].imei });
  T('fără plecare și destinație → refuzat', faraPuncte.status === 400, faraPuncte.status);
  const altVehicul = await POST('/api/tollro/cursa', {
    imei: '000000000000999', start: { lat: 44.43, lng: 26.10 }, end: { lat: 45.7, lng: 27.2 },
  });
  T('vehicul inexistent sau inaccesibil → refuzat', altVehicul.status === 403 || altVehicul.status === 404, altVehicul.status);

  // Chiar dacă cineva ar trimite o masă mică prin cerere, fișa câștigă: `_tollroCuManual` acceptă
  // completări DOAR pentru câmpurile pe care fișa nu le are.
  const minte = await POST('/api/tollro/cursa', {
    imei: V[1].imei, manual: { masaKg: 5000 },
    start: { lat: 44.43, lng: 26.10 }, end: { lat: 45.7, lng: 27.2 },
  });
  const jm = await minte.json();
  if (minte.status === 200) {
    T('masa trimisă din browser NU înlocuiește fișa (40 t rămâne 40 t)',
      jm.vehicul && jm.vehicul.masaKg === 40000, jm.vehicul && jm.vehicul.masaKg);
  } else {
    // Fără cheie de rutare, cererea se oprește înainte — dar atunci trebuie să spună DE CE, nu 500.
    T('fără rutare configurată → 503 cu explicație, nu o eroare oarecare',
      minte.status === 503 && /cheie|hărți/i.test(jm.error || ''), minte.status + ' · ' + (jm.error || ''));
  }

  sect('8. Căutarea de adrese');
  const scurt = await (await GET('/api/tollro/adrese?q=ab')).json();
  T('sub 3 litere → listă goală, fără apel la furnizor', Array.isArray(scurt.sugestii) && scurt.sugestii.length === 0,
    JSON.stringify(scurt).slice(0, 80));
  const faraAuth = await fetch(B + '/api/tollro/adrese?q=bucuresti');
  T('fără autentificare → refuzat', faraAuth.status === 401 || faraAuth.status === 403, faraAuth.status);

  // Modulul de rutare, verificat direct: cele trei stări trebuie să rămână trei, nu patru.
  const rt = require('./routing.js');
  T('starea rutării are întotdeauna un motiv când e oprită',
    rt.stare().pornit || !!rt.stare().motiv, JSON.stringify(rt.stare()));
  // Geometria Valhalla vine codată; dacă decodarea s-ar strica, traseul ar ieși în mijlocul oceanului.
  const pd = rt._decodePolyline6('ye}vwAdvxdKoBrA');
  T('geometria codată se desface în coordonate plauzibile',
    Array.isArray(pd) && pd.length >= 2 && Math.abs(pd[0][0]) <= 90 && Math.abs(pd[0][1]) <= 180,
    JSON.stringify(pd && pd[0]));

  sect('9. Grila de tarife: fiecare cifră spune în ce e');
  // Tabelul ăsta a mințit o dată (0,22 stătea pe Euro 6) și a fost prins abia comparând cu ecranul
  // concurenței. Apoi Alin s-a uitat la el și a întrebat „0,17 e în lei?". Amândouă se apără aici:
  // valorile de pe ecran trebuie să fie EXACT cele din catalog, iar fiecare celulă își poartă
  // unitatea — nu doar textul de deasupra tabelului, pe care nimeni nu-l citește.
  const iG = js.indexOf('  // ── începe grila de tarife');
  const jG = js.indexOf('  // ── sfârșit grila de tarife ──', iG);
  T('găsesc codul grilei în interfață', iG > 0 && jG > iG);
  if (iG > 0 && jG > iG) {
    const escG = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mkG = new Function('_tr', 'esc', js.slice(iG, jG) + '\n; return trGrilaHtml;');
    const cfg = { cfg: { categorii: toll.CATEGORII, euro: toll.EURO } };
    const G = toll.GRILA_IMPLICITA;
    const celule = toll.CATEGORII.length * toll.EURO.length * 2;

    for (const [mod, editabil] of [['citire', false], ['editare', true]]) {
      const h = mkG(cfg, escG)(G, editabil);
      const uni = (h.match(/tz-g-um">lei\/km</g) || []).length;
      T('(' + mod + ') fiecare celulă își poartă unitatea', uni === celule, uni + ' din ' + celule);

      // Fiecare valoare din catalog trebuie să se regăsească pe ecran, la locul ei.
      let gresite = [];
      toll.CATEGORII.forEach((c) => {
        toll.EURO.forEach((e) => {
          ['autostrada', 'national'].forEach((k) => {
            const v = G.tarife[c.key][e.key][k];
            const gasit = editabil
              ? new RegExp('value="' + v.toFixed(2) + '" data-c="' + c.key + '" data-e="' + e.key + '" data-k="' + k + '"').test(h)
              : h.indexOf('tz-g-val">' + v.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) >= 0;
            if (!gasit) gresite.push(c.key + '/' + e.key + '/' + k + '=' + v);
          });
        });
      });
      T('(' + mod + ') cifrele de pe ecran sunt cele din catalog', !gresite.length, gresite.join(', '));
    }

    const hc = mkG(cfg, escG)(G, false);
    T('fiecare coloană Euro e despărțită în autostradă și drum național',
      (hc.match(/Autostradă/g) || []).length === toll.EURO.length &&
      (hc.match(/Drum național/g) || []).length === toll.EURO.length,
      (hc.match(/Autostradă/g) || []).length + ' / ' + (hc.match(/Drum național/g) || []).length);
    // Un tarif estimat afișat ca oficial e mai rău decât lipsa lui.
    const presupuse = toll.CATEGORII.reduce((a, c) => a + toll.EURO.filter(e => G.tarife[c.key][e.key].presupus).length, 0);
    T('celulele nepublicate rămân marcate', (hc.match(/class="presupus"/g) || []).length === presupuse * 2,
      (hc.match(/class="presupus"/g) || []).length + ' din ' + presupuse * 2);
    // Câmpul de calendar arată data în formatul browserului („10/01/2026" se citește ca 10 ianuarie).
    T('data de la care se plătește e scrisă și în cuvinte', /1 octombrie 2026/.test(hc), hc.slice(-220));
    T('fără jargon de programator pe ecranul clientului', !/în cod|ordonanță și s-au tot amânat/i.test(hc));

    console.log('  → o celulă arată așa: ' +
      (hc.match(/<span class="tz-g-cel">[\s\S]*?<\/span><\/span>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.error(e); gata(1); });
