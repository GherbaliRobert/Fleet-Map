// verify_ramuri.js — ramurile RA Insight din pasul 4 (Mentenanță & acte, Combustibil, …).
//
//   node verify_ramuri.js
//
// Păzește:
//   1. textele (ramuri.js): „a expirat pe 03.10 (acum 4 zile)", „expiră mâine", „mai are 420 de km (la 150.000 km)", ordinea
//      (cele trecute de termen întâi, cele mai vechi primele; apoi cele mai apropiate), numărătoarea, preavizul firmei;
//      Combustibil pe cifre făcute de mână: costul, sortarea, „peste normă" doar pe consum măsurat, cu destul drum, față de
//      cel mai mare consum din fișă; luna dinainte; scăderile (cea mai nouă întâi, ora României); recomandările;
//   2. pe server pornit: Mentenanță & acte strânge ÎNTR-O listă actele, reviziile (pe dată și pe km) și permisele, cu
//      ACELEAȘI stări ca listele Documente / Mentenanță; altă firmă nu se vede; fără loc RA Insight → 403; numerele de lângă
//      ramuri; „Rezolvă" duce în ecranele Management; pagina nu socotește;
//   3. pe server pornit: Combustibil spune ACELEAȘI cifre ca rapoartele Consum, Costuri și „Alimentări & scăderi" pentru
//      aceeași perioadă (km, litri, L/100 km, sursa, prețul, costul, alimentările, scăderile), și pentru luna dinainte; grupa;
//      altă firmă; fără loc RA Insight → 403. Drumurile stau pe 15 ale lunilor trecute — proba nu depinde de ziua de azi;
//   4. Ore de condus: regula pe cifre făcute de mână (pe șofer, încălcările raportului, „nu se aplică" la autoturisme, săptămâna
//      dinainte, recomandările, pragurile din „Cum se socotește" legate de codul raportului); pe server pornit, ACELEAȘI ore și
//      încălcări ca raportul „Condus & repaus (Reg. 561)", fiecare zi pe șoferul care avea mașina atunci (nu pe cel de azi).
//   5. Scrisoarea de luni: faptele (din ramuri, pe mașinile omului), textul pe reguli, paza care oprește cifrele inventate; pe
//      server pornit (fără model): scrisoarea săptămânii trecute ajunge la oamenii cu loc RA Insight, cu anunț, o singură dată,
//      cu aceleași cifre ca ramurile; a altuia = 404; fără loc = 403; numărul de lângă ramură = scrisorile necitite.
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
  T('pagina, RA Insight și scrisoarea cer lista prin ACEEAȘI funcție (_ramMentenanta: ruta, unealta, numerele, scrisoarea de luni)', (SRV.match(/await _ramMentenanta\(req\)/g) || []).length === 4);
  const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const bloc = (PAG.split('// ─── Ramura „Mentenanță & acte"')[1] || '').split('window.insightSdIntreaba')[0];
  T('pagina: ramura se arată și are pagina ei; „Rezolvă" = ecranele din Management (goManage)', /k: 'mentenanta', et: 'Mentenanță & acte', ic: 'fa-screwdriver-wrench', gata: true/.test(PAG) && /if \(S\.ramura === 'mentenanta'\) return deseneazaMentenanta\(main\);/.test(PAG) && /goManage\(ecran\)/.test(bloc));
  T('pagina nu socotește: o singură cerere, fără zile sau praguri scrise în ea', (bloc.match(/'\/api\/insight\/mentenanta'/g) || []).length === 1 && !/\b(14|30|500)\b/.test(bloc) && !/zilePana|Math\.ceil/.test(bloc));
  const ih = bloc.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textele serverului se pun cu textContent (innerHTML doar pentru iconițe)', ih.length >= 3 && ih.every((x) => !/\.(cand|cine|ce|text|titlu|message|error)\b/.test(x)), ih.join(' | '));
  T('numerele de lângă ramuri: o rută, citită la deschiderea secțiunii, care nu pornește socoteli grele (doarGata)', /app\.get\('\/api\/insight\/ramuri'/.test(SRV) && /_sdLuna\(req, \{ doarGata: true \}\)/.test(SRV) && /incarcaNumere\(\);/.test(PAG) && /'\/api\/insight\/ramuri'/.test(PAG));

  console.log('\n1b. Combustibil — regula (ramuri.js), pe cifre făcute de mână');
  const CM = {
    A: { dist: 1000, consumed: 80, price: 7.5, per100: 8, estimated: false, source: 'CAN', norma: 6.5 },
    B: { dist: 500, consumed: 40, price: 7, per100: 8, estimated: true, source: 'Estimat', norma: 8 },
    C: { dist: 50, consumed: 6, price: 7.2, per100: 12, estimated: false, source: 'Senzor', norma: 7 },
    D: { dist: 0.2, consumed: 0.1, price: 7, per100: null, estimated: true, source: 'Estimat', norma: null },
    E: { dist: 300, consumed: 18, price: 8, per100: 6, estimated: false, source: 'CAN', norma: null },
  };
  const CMI = { A: { dist: 900, consumed: 70, price: 7.4 }, B: { dist: 0, consumed: 0, price: 7 }, C: { dist: 40, consumed: 5, price: 7.2 } };
  const EV = [
    { imei: 'C', ts: '2026-10-03T08:00:00.000Z', fel: 'scadere', litri: 12, de: 40, la: 28, motorPornit: true, loc: '46.10000, 21.30000', lat: 46.1, lng: 21.3 },
    { imei: 'A', ts: '2026-10-05T23:14:00.000Z', fel: 'scadere', litri: 25, de: 60, la: 35, motorPornit: false, loc: 'Str. Gării 4, Arad', lat: 46.2, lng: 21.4 },
    { imei: 'A', ts: '2026-10-04T08:00:00.000Z', fel: 'alimentare', litri: 50, de: 10, la: 60, motorPornit: false, loc: '' },
    { imei: 'Z', ts: '2026-10-04T08:00:00.000Z', fel: 'scadere', litri: 99, de: 99, la: 0, motorPornit: false, loc: '' },
  ];
  const MAS = ['A', 'B', 'C', 'D', 'E'].map((k) => ({ imei: k, eticheta: 'Mașina ' + k }));
  const cb = RM.alcatuiesteCombustibil({ masini: MAS, cm: CM, cmI: CMI, ev: EV, panaAzi: true, etInainte: '1–7 septembrie', inaintePregatita: true });
  const pe = (k) => cb.masini.filter((m) => m.imei === k)[0] || {};
  T('mașinile: costul = litri × preț (600 / 280 / 144 / 43 de lei), cele mai scumpe întâi; mașina fără drum (D) nu apare', cb.masini.map((m) => m.imei + m.cost).join(' ') === 'A600 B280 E144 C43', cb.masini.map((m) => m.imei + m.cost).join(' '));
  T('flota: 1.850 km, 144 de litri, 1.067 lei, 7,8 L la 100 km, 1 din 4 estimată (28% din litri)', cb.flota.km === 1850 && cb.flota.litri === 144 && cb.flota.cost === 1067 && cb.flota.l100 === 7.8 && cb.flota.masini === 4 && cb.flota.estimate === 1 && cb.flota.procentEstimat === 28, JSON.stringify(cb.flota));
  T('„peste normă" doar pe consum MĂSURAT, cu destul drum și cu normă în fișă: A (+23%) da; B (estimat), C (50 km), E (fără normă) nu', pe('A').peste === 23 && pe('B').peste === null && pe('C').peste === null && pe('E').peste === null && cb.pesteNorma.map((m) => m.imei).join() === 'A', JSON.stringify(cb.pesteNorma.map((m) => [m.imei, m.peste])));
  T('luna dinainte, aceleași zile: 75 de litri, 554 de lei; „+513 lei față de 1–7 septembrie (+93%)"; pe mașină „+82 de lei" / „+7 lei"', cb.inainte.litri === 75 && cb.inainte.cost === 554 && cb.fata.fel === 'atentie' && cb.fata.cost === '+513 lei față de 1–7 septembrie (+93%)' && cb.fata.l100 === 'pe 1–7 septembrie: 8 L la 100 km' && pe('A').fata.text === '+82 de lei' && pe('C').fata.text === '+7 lei' && pe('B').fata === null && pe('E').fata === null, JSON.stringify([cb.fata, pe('A').fata, pe('C').fata]));
  T('scăderile: cea mai nouă întâi, pe ora României („06.10, 02:14"), cu locul pe hartă; a unei mașini din altă parte (Z) nu', cb.scaderi.map((x) => x.imei + ' ' + x.cand).join(' | ') === 'A 06.10, 02:14 | C 03.10, 11:00' && cb.scaderi[0].lat === 46.2 && cb.scaderi[0].lng === 21.4 && cb.scaderi[0].eticheta === 'Mașina A', JSON.stringify(cb.scaderi.map((x) => [x.imei, x.cand])));
  T('evenimentele: 1 alimentare (50 de litri), 2 scăderi (37 de litri)', JSON.stringify(cb.evenimente) === JSON.stringify({ alimentari: 1, litriAlimentati: 50, scaderi: 2, litriScazuti: 37 }), JSON.stringify(cb.evenimente));
  const rec = cb.recomandari.map((x) => x.fel + ': ' + x.text);
  T('recomandările: consumul peste normă, scăderea cea mai nouă (cu motorul oprit), cifrele estimate, mașina fără normă', rec.length === 4 &&
    /^atentie: Mașina A a consumat 8 L la 100 km, cu 23% peste cât are trecut în fișă \(6,5\)/.test(rec[0]) &&
    /^atentie: 2 scăderi suspecte de combustibil; cea mai nouă: Mașina A, 06\.10, 02:14, 25 de litri \(de la 60 la 35\), cu motorul oprit\./.test(rec[1]) &&
    /^info: La 1 din 4 mașini consumul e ESTIMAT/.test(rec[2]) && /^info: Mașina E n-are consumul trecut în fișă — .* la „Consum oraș” și „Consum afară”\.$/.test(rec[3]), rec.join('\n      '));
  const cb0 = RM.alcatuiesteCombustibil({ masini: [{ imei: 'A', eticheta: 'A' }], cm: { A: { dist: 200, consumed: 14, price: 7, per100: 7, estimated: false, source: 'CAN', norma: 7 } }, cmI: { A: { dist: 0, consumed: 0, price: 7 } }, ev: [], panaAzi: false, etInainte: 'august 2026', inaintePregatita: true });
  T('luna dinainte fără drum: „fără drum în august 2026 — nimic de comparat"; totul în normă → o singură recomandare, „bun"', cb0.fata.cost === 'fără drum în august 2026 — nimic de comparat' && cb0.recomandari.length === 1 && cb0.recomandari[0].fel === 'bun', JSON.stringify([cb0.fata, cb0.recomandari]));
  const cb1 = RM.alcatuiesteCombustibil({ masini: [{ imei: 'A', eticheta: 'A' }], cm: { A: { dist: 200, consumed: 14, price: 7, per100: 7, estimated: false, source: 'CAN', norma: 7 } }, cmI: {}, ev: [], panaAzi: false, etInainte: 'august 2026', inaintePregatita: false });
  T('cât luna dinainte nu e citită: nicio comparație (nu una inventată)', cb1.inainte === null && cb1.fata === null && cb1.masini[0].fata === null);
  const exC = RM.explicatiiCombustibil({ dropMin: 15 }).map((x) => x.titlu + ': ' + x.text).join('\n');
  T('„Cum se socotește": sursa litrilor, prețul, pragul de normă (100 de km, 15%, cel mai mare consum din fișă), scăderea de cel puțin 15 litri', /Aceeași socoteală ca rapoartele Consum și Costuri/.test(exC) && /cu cel puțin 100 de km de drum și cu peste 15% față de cel mai mare consum trecut în fișă/.test(exC) && /cel puțin 15 litri/.test(exC), exC);
  const RP = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
  T('norma din fișă = cel mai mare consum trecut (oraș sau afară), luat de motorul rapoartelor', /cMax: Math\.max\(parseFloat\(d\.consumption_road\) \|\| 0, parseFloat\(d\.consumption_city\) \|\| 0\) \|\| null/.test(RP) && /norma: c\.cMax \|\| null/.test(RP));
  const fC = fn('_ramCombustibil');
  T('cifrele vin din MOTORUL RAPOARTELOR, cu opțiunile ecranului Rapoarte (Consum / Costuri + „Alimentări & scăderi")', /reports\._ajutor\.consumptionMap\(db, imeis, iso\(p\.de\), iso\(p\.pana\), opts\)/.test(fC) && /reports\._ajutor\.consumptionMap\(db, imeis, iso\(p\.deI\), iso\(p\.panaI\), opts\)/.test(fC) && /reports\.runReport\(db, 'fuel', imeis, iso\(p\.de\), iso\(p\.pana\), opts/.test(fC) && /_optiuniRaport\(\{\}, f\.cs\)/.test(fC) && /await _ramFlota\(req\)/.test(fC));
  T('pagina, RA Insight și scrisoarea cer cifrele prin ACEEAȘI funcție (_ramCombustibil: ruta, unealta, numerele, scrisoarea de luni)', (SRV.match(/await _ramCombustibil\(req, /g) || []).length === 4);
  const blocC = (PAG.split('// ─── Ramura „Combustibil"')[1] || '').split('// Ecranul unde se rezolvă un rând')[0];
  T('pagina: ramura se arată și are pagina ei', /k: 'combustibil', et: 'Combustibil', ic: 'fa-gas-pump', gata: true/.test(PAG) && /if \(S\.ramura === 'combustibil'\) return deseneazaCombustibil\(main, S\.cbLuna\);/.test(PAG) && blocC.length > 1000);
  T('pagina nu socotește: o singură cerere; „peste normă" = lista serverului (pesteNorma), fără praguri scrise în ea', (blocC.match(/'\/api\/insight\/combustibil'/g) || []).length === 1 && /j\.pesteNorma/.test(blocC) && !/0\.15|\b15\b|KM_MIN|>= ?100\b|\* ?j\.|\.price\b/.test(blocC), (blocC.match(/0\.15|\b15\b|KM_MIN|>= ?100\b/g) || []).join(','));
  const ihC = blocC.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textele serverului se pun cu textContent (innerHTML doar pentru iconițe)', ihC.length >= 4 && ihC.every((x) => !/\.(cand|loc|eticheta|text|titlu|message|error|cost|fata|sursa)\b/.test(x)), ihC.join(' | '));

  console.log('\n1c. Ore de condus — regula (ramuri.js), pe cifre făcute de mână');
  T('durata: „38 h 20 min", „45 min", „9 h"; ziua: „luni, 05.10"', RM.durata(38 * 3600 + 20 * 60) === '38 h 20 min' && RM.durata(45 * 60) === '45 min' && RM.durata(9 * 3600) === '9 h' && RM.ziText('2026-10-05', ACUM) === 'luni, 05.10');
  const H = 3600;
  const VH = [
    { cheie: 'd1', sofer: 'Ion Popescu', driverId: 1, zi: '2026-10-05', condusSec: 5 * H + 1200, continuuMaxSec: 5 * H + 1200, incalcari: ['condus continuu 5h 20m'], supus: true, sursa: 'GPS', masini: ['TM 77 RAT · Volvo FH'] },
    { cheie: 'd1', sofer: 'Ion Popescu', driverId: 1, zi: '2026-10-07', condusSec: 1 * H, continuuMaxSec: 1 * H, incalcari: [], supus: true, sursa: 'GPS', masini: ['TM 77 RAT · Volvo FH'] },
    { cheie: 'd2', sofer: 'Gheorghe Marin', driverId: 2, zi: '2026-10-06', condusSec: 8 * H + 600, continuuMaxSec: 4 * H + 540, incalcari: [], supus: true, sursa: 'tahograf', masini: ['TM 78 RAT · Scania'] },
    { cheie: 'd3', sofer: 'Maria Ionescu', driverId: 3, zi: '2026-10-05', condusSec: 2 * H, continuuMaxSec: 2 * H, incalcari: [], supus: false, sursa: 'GPS', masini: ['B 154 UIP · Logan'] },
    { cheie: 'v_9', sofer: 'CJ 12 RAT · Transit', driverId: null, zi: '2026-10-05', condusSec: 1 * H, continuuMaxSec: 1 * H, incalcari: [], supus: false, sursa: 'GPS', masini: ['CJ 12 RAT · Transit'] },
    { cheie: 'd4', sofer: 'Vasile Pop', driverId: 4, zi: '2026-10-06', condusSec: 0, continuuMaxSec: 0, incalcari: [], supus: true, sursa: 'GPS', masini: [] },
  ];
  const oc = RM.alcatuiesteOreCondus({ valori: VH, valoriInainte: [{ condusSec: 2 * H }], azi: '2026-10-07', eticheta: '5 octombrie – azi', etInainte: '28–30 septembrie', panaAzi: true, inaintePregatita: true, acum: ACUM });
  const so = (n) => oc.soferi.filter((x) => x.nume === n)[0] || {};
  T('pe șofer: orele adunate pe săptămână, zilele cu condus, „azi"; cine n-a condus deloc nu apare', so('Ion Popescu').condusSec === 6 * H + 1200 && so('Ion Popescu').zile === 2 && so('Ion Popescu').text.azi === '1 h' && so('Gheorghe Marin').text.azi === '—' && !oc.soferi.some((x) => x.nume === 'Vasile Pop'), JSON.stringify(oc.soferi.map((x) => [x.nume, x.condusSec, x.zile, x.text.azi])));
  T('ordinea: cine are încălcări întâi, apoi șoferii după ore, mașinile fără șofer la urmă', oc.soferi.map((x) => x.cheie).join() === 'd1,d2,d3,v_9', oc.soferi.map((x) => x.cheie).join());
  T('cea mai lungă zi și condusul fără pauză, cu ziua lor; sursa „tahograf" / „estimat din GPS"', so('Gheorghe Marin').text.ziMax === '8 h 10 min' && so('Gheorghe Marin').text.ziMaxZi === 'marți, 06.10' && so('Gheorghe Marin').text.continuuMax === '4 h 9 min' && so('Gheorghe Marin').text.sursa === 'tahograf' && so('Ion Popescu').text.sursa === 'estimat din GPS');
  T('încălcările sunt ALE RAPORTULUI (aceleași cuvinte), cu ziua; autoturismul și mașina fără șofer: Reg. 561 nu se aplică', oc.incalcari.length === 1 && oc.incalcari[0].ce === 'condus continuu 5h 20m' && oc.incalcari[0].ziText === 'luni, 05.10' && so('Maria Ionescu').supus === false && so('CJ 12 RAT · Transit').faraSofer === true);
  T('flota: 17 h 30 min (6 h 20 + 8 h 10 + 2 h + 1 h), 3 șoferi + 1 mașină fără șofer, 1 încălcare la un șofer, 1 din 4 cu tahograf', oc.flota.text === '17 h 30 min' && oc.flota.soferi === 3 && oc.flota.faraSofer === 1 && oc.flota.incalcari === 1 && oc.flota.cuIncalcari === 1 && oc.flota.tahograf === 1 && oc.flota.ziMax.nume === 'Gheorghe Marin' && oc.flota.continuuMax.nume === 'Ion Popescu', JSON.stringify(oc.flota));
  T('săptămâna dinainte: doar orele, fără judecată („+15 h 30 min față de 28–30 septembrie", info)', oc.fata.fel === 'info' && oc.fata.text === '+15 h 30 min față de 28–30 septembrie' && oc.inainte.text === '2 h', JSON.stringify(oc.fata));
  const rh = oc.recomandari.map((x) => x.fel + ': ' + x.text);
  T('recomandările: încălcarea lui Ion (estimare din GPS → verifică pe tahograf), orele estimate, mașina fără șofer', rh.length === 3 && /^atentie: Ion Popescu: o încălcare a Reg\. 561 — condus continuu 5h 20m \(luni, 05\.10\)\. E o estimare din GPS: verifică pe tahograf/.test(rh[0]) && /^info: La un șofer orele sunt estimate din GPS/.test(rh[1]) && /^info: O mașină a mers fără șofer trecut/.test(rh[2]), rh.join('\n      '));
  const oc2 = RM.alcatuiesteOreCondus({ valori: [VH[2]], valoriInainte: [], azi: null, eticheta: '28 septembrie – 4 octombrie', etInainte: '21–27 septembrie', panaAzi: false, inaintePregatita: true, acum: ACUM });
  T('fără încălcări la camioane: „Nicio încălcare a Reg. 561 în …" (bun); săptămâna trecută n-are coloana „azi"', oc2.recomandari.length === 1 && oc2.recomandari[0].fel === 'bun' && /Nicio încălcare a Reg\. 561 în 28 septembrie – 4 octombrie/.test(oc2.recomandari[0].text) && oc2.soferi[0].azi === null && oc2.fata.text === 'fără condus în 21–27 septembrie — nimic de comparat', JSON.stringify([oc2.recomandari, oc2.fata]));
  const oc3 = RM.alcatuiesteOreCondus({ valori: [VH[3]], valoriInainte: [], azi: null, eticheta: 'x', etInainte: 'y', panaAzi: false, inaintePregatita: true, acum: ACUM });
  T('doar autoturisme: spune că Reg. 561 nu se aplică (nu „nicio încălcare")', oc3.recomandari.length === 1 && /nu se aplică la autoturisme/.test(oc3.recomandari[0].text) && oc3.recomandari[0].fel === 'info');
  const exH = RM.explicatiiOreCondus().map((x) => x.text).join(' ');
  const fH = (RP.split('async function rHos(')[1] || '').split('\nasync function ')[0];
  T('„Cum se socotește" spune pragurile RAPORTULUI (4h30 / 45 de minute / 10 și 9 ore / 56 de ore / repaus 9 ore doar cu tahograful) — legate de codul lui', /peste 4h30 fără o pauză de 45 de minute/.test(exH) && /peste 10 ore, sau peste 9 ore/.test(exH) && /peste 56 de ore/.test(exH) && /sub 9 ore se verifică doar cu tahograful/.test(exH) &&
    /d\.contMax > 4\.5/.test(fH) && /restRun >= 45 \* 60/.test(fH) && /dh > 10/.test(fH) && /dh > 9/.test(fH) && /weekExt\[wk\] > 2/.test(fH) && /\/ 3600 > 56/.test(fH) && /if \(rh < 9\)/.test(fH) && /useTacho && d\.drive > 0/.test(fH));
  T('raportul pune fiecare zi pe șoferul de atunci (istoricul șoferilor), ca EcoDrive pe șofer', /db\.istoricSoferi\(imeis\)/.test(fH) && /condus\.soferLa\(iv\)/.test(fH) && /valori\.push\(\{ cheie: key/.test(fH));
  const fO = fn('_ramOreCondus');
  T('cifrele vin din raportul „Condus & repaus" (runReport hos), cu opțiunile ecranului Rapoarte, pentru săptămână și pentru cea dinainte', /reports\.runReport\(db, 'hos', imeis, iso\(p\.de\), iso\(p\.pana\), opts, scope\)/.test(fO) && /reports\.runReport\(db, 'hos', imeis, iso\(p\.deI\), iso\(p\.panaI\), opts, scope\)/.test(fO) && /_optiuniRaport\(\{\}, f\.cs\)/.test(fO) && /await _ramFlota\(req\)/.test(fO));
  T('pagina, RA Insight și scrisoarea cer orele prin ACEEAȘI funcție (_ramOreCondus: ruta, unealta, numerele, scrisoarea de luni)', (SRV.match(/await _ramOreCondus\(req, /g) || []).length === 4);
  const blocH = (PAG.split('// ─── Ramura „Ore de condus"')[1] || '').split('// Ecranul unde se rezolvă un rând')[0];
  T('pagina: ramura se arată și are pagina ei', /k: 'orecondus', et: 'Ore de condus', ic: 'fa-stopwatch', gata: true/.test(PAG) && /if \(S\.ramura === 'orecondus'\) return deseneazaOreCondus\(main, S\.hcSapt\);/.test(PAG) && blocH.length > 1000);
  T('pagina nu socotește: o singură cerere, fără praguri (4,5 / 9 / 10 / 56 de ore) și fără socoteli de ore', (blocH.match(/'\/api\/insight\/ore-condus'/g) || []).length === 1 && !/\b(4\.5|270|540|56)\b|\/ ?3600|\* ?3600/.test(blocH), (blocH.match(/\b(4\.5|270|540|56)\b|\/ ?3600|\* ?3600/g) || []).join(','));
  const ihH = blocH.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textele serverului se pun cu textContent (innerHTML doar pentru iconițe)', ihH.length >= 4 && ihH.every((x) => !/\.(text|nume|ce|ziText|eticheta|atentie|message|error|optiune)\b/.test(x)), ihH.join(' | '));

  console.log('\n1d. Scrisoarea de luni — faptele, textul pe reguli, paza cifrelor (ramuri.js)');
  const FS = RM.fapteScrisoare({ luni: '2026-09-28', eticheta: '28 septembrie – 4 octombrie', etInainte: '21–27 septembrie', masini: 12,
    cb: { flota: { km: 4230, masini: 9, litri: 520, cost: 3950, l100: 12.3, procentEstimat: 20 }, inainte: { cost: 3700 }, fata: { cost: '+250 de lei față de 21–27 septembrie (+7%)' },
      pesteNorma: [{ eticheta: 'B 154 UIP · Dacia Logan', l100: 9.8, norma: 8, peste: 23 }], scaderi: [{ eticheta: 'B 155 UIP · VW Caddy', cand: '01.10, 23:14', litri: 25, motorPornit: false }] },
    hc: { flota: { condusSec: 400000, text: '111 h 6 min', supusi: 2 }, incalcari: [{ nume: 'Ion Popescu', ziText: 'luni, 28.09', ce: 'condus continuu 5h 20m' }] },
    sd: { km: 4000, cost: 240, scor: 78, nota: 'Bun', inainte: { cost: 310 }, soferi: [{ nume: 'Gheorghe Marin', cost: 120 }, { nume: 'Ion Popescu', cost: 80 }] },
    mt: { randuri: [{ stare: 'depasit', ce: 'ITP', cine: 'B 154 UIP · Dacia Logan', cand: 'a expirat pe 03.10 (acum 4 zile)', zile: -4 },
      { stare: 'curand', ce: 'RCA', cine: 'B 155 UIP · VW Caddy', cand: 'expiră pe 09.10 — peste 2 zile', zile: 2 },
      { stare: 'curand', ce: 'Revizie', cine: 'TM 77 RAT', cand: 'expiră pe 27.10 — peste 20 de zile', zile: 20 },
      { stare: 'curand', ce: 'Schimb ulei', cine: 'TM 77 RAT', cand: 'mai are 300 de km', zile: null, kmRamasi: 300 }] } });
  T('faptele: drumul, combustibilul, Safe Drive, orele de condus, actele (ce vine în 7 zile și reviziile pe km; nu cele de peste 20 de zile)', FS.drum.km === 4230 && FS.combustibil.lei === 3950 && FS.combustibil.scaderiTotal === 1 && FS.safeDrive.lei === 240 && FS.safeDrive.soferi[0].sofer === 'Gheorghe Marin' &&
    FS.oreCondus.incalcariTotal === 1 && FS.acte.trecuteTotal === 1 && FS.acte.urmeazaTotal === 2 && FS.acte.urmeaza.map((x) => x.ce).join() === 'RCA,Schimb ulei' && FS.nimic === false, JSON.stringify(FS.acte));
  T('o săptămână fără drum și fără nimic de rezolvat = „nimic" (nu pleacă nicio scrisoare)', RM.fapteScrisoare({ luni: 'x', eticheta: 'x', cb: { flota: { km: 0, masini: 0 } }, mt: { randuri: [] } }).nimic === true);
  const TS = RM.textScrisoare(FS);
  T('textul pe reguli: drumul și banii, Safe Drive (cu săptămâna dinainte), încălcarea, combustibilul, actele, apoi „De făcut săptămâna asta:" cu puncte',
    /^Săptămâna trecută \(28 septembrie – 4 octombrie\), 9 mașini au mers 4\.230 de km\. Au consumat 520 de litri, adică 3\.950 de lei — \+250 de lei/.test(TS) &&
    /Condusul a costat în plus ~240 de lei \(săptămâna dinainte: ~310 lei\); scorul flotei: 78 — Bun\. Cel mai mult: Gheorghe Marin, ~120 de lei\./.test(TS) &&
    /O încălcare a orelor de condus \(Reg\. 561\): Ion Popescu, luni, 28\.09 — condus continuu 5h 20m\./.test(TS) && /Au trecut de termen: ITP — B 154 UIP · Dacia Logan\./.test(TS) &&
    /\n\nDe făcut săptămâna asta:\n• /.test(TS) && (TS.match(/\n• /g) || []).length === 4, TS);
  T('paza: textul pe reguli trece (fiecare cifră e în fapte; „Reg. 561" și „la 100 km" sunt pe voie)', RM.textulTrece(TS, FS).ok === true, JSON.stringify(RM.textulTrece(TS, FS)));
  T('paza: o cifră inventată („ai economisit 999 de lei") oprește textul modelului, cu motivul', RM.textulTrece(TS + ' Ai economisit 999 de lei.', FS).ok === false && /999/.test(RM.textulTrece(TS + ' Ai economisit 999 de lei.', FS).motiv));
  T('paza: o cifră schimbată (4.231 de km în loc de 4.230) nu trece; prea scurt nu trece', RM.textulTrece(TS.replace('4.230', '4.231'), FS).ok === false && RM.textulTrece('Totul bine.', FS).ok === false);
  T('instrucțiunile: DOAR cifrele din fapte, scrise cu cifre; la final „De făcut săptămâna asta:" cu „• "', /Folosește DOAR cifrele și numele din ele/.test(RM.instructiuniScrisoare()) && /cu cifre \(nu în litere\)/.test(RM.instructiuniScrisoare()) && /„De făcut săptămâna asta:" urmat de 2–4 rânduri care încep cu „• "/.test(RM.instructiuniScrisoare()));
  const fF = fn('_fapteScrisoare'), fS = fn('_scrieScrisoarea'), fT = fn('scrisoareaDeLuniTick');
  T('faptele vin din ACELEAȘI funcții ca ramurile (Combustibil pe săptămână, Ore de condus, Safe Drive pe zile, Mentenanță), pe mașinile omului', /await _ramFlota\(req\)/.test(fF) && /await _ramCombustibil\(req, \{ perioada: /.test(fF) && /await _ramOreCondus\(req, \{ saptamana: luni/.test(fF) && /safeDrive\.saptamana\(/.test(fF) && /await _ramMentenanta\(req\)/.test(fF) && /getAllowedImeiSet\(u\.id, u\.role, u\.company_id\)/.test(SRV));
  T('textul: RA Insight cu paza cifrelor, altfel cel pe reguli; consumul se scrie „scrisoare" — în afara fondului clientului', /ramuri\.textulTrece\(text, fapte\)/.test(fS) && /scrisDe: 'model'/.test(fS) && /ramuri\.textScrisoare\(fapte\)/.test(fS) && /recordAiUsage\(companyId, 'scrisoare'/.test(fS) &&
    /AI_BILLABLE_KINDS = \['insight', 'chat', 'report'\]/.test(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8')));
  T('trimiterea: DOAR lunea, de la 8 (ora României), oamenii cu loc RA Insight și cont activ, fără firma demo și fără firmele oprite; o scrisoare pe aceleași mașini', /SCRISOARE_ORA = 8/.test(SRV) && /if \(azi !== luniAcum\) return \{ nuELuni: true/.test(fT) && /SCRISOARE_ORA \* 3600000/.test(fT) && /ai_seat = true AND active IS NOT false/.test(fT) && /co\.id !== demoCompanyId/.test(fT) && /st\.status === 'expired'/.test(fT) && /_ramCheieImei\(Array\.from\(req\.allowedImeis\)\)/.test(fT));
  const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  T('scrisoarea e a omului: fiecare citire are user_id în WHERE; ștergerea la 12 luni, odată cu discuțiile; în afara copiilor', /FROM scrisori_luni WHERE user_id = \$1 ORDER BY/.test(DB) && /FROM scrisori_luni WHERE id = \$1 AND user_id = \$2/.test(DB) && /UPDATE scrisori_luni SET citita_la = NOW\(\) WHERE id = \$1 AND user_id = \$2/.test(DB) &&
    /await db\.stergeScrisoriMaiVechiDe\(luni\)/.test(SRV) && /scrisori_luni:/.test(fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8')));
  const blocS = (PAG.split('// ─── Ramura „Scrisoarea de luni"')[1] || '').split('// Ecranul unde se rezolvă un rând')[0];
  T('pagina: ramura se arată; cere lista și scrisoarea (o cerere fiecare); anunțul duce la scrisoare', /k: 'scrisoare', et: 'Scrisoarea de luni', ic: 'fa-envelope-open-text', gata: true/.test(PAG) && /if \(S\.ramura === 'scrisoare'\) return deseneazaScrisoare\(main, S\.scId\);/.test(PAG) &&
    (blocS.match(/'\/api\/insight\/scrisori'/g) || []).length === 1 && (blocS.match(/'\/api\/insight\/scrisori\/'/g) || []).length === 1 && /d\.type === 'scrisoare_luni'\) \{ closeNotifDetail\(\); if \(window\.insightDeschideScrisoarea\)/.test(PAG));
  const ihS = blocS.match(/innerHTML = [^;]*;/g) || [];
  T('pagina: textul scrisorii și cifrele se pun cu textContent (innerHTML doar pentru iconițe)', ihS.length >= 3 && ihS.every((x) => !/\.(text|eticheta|fata|nota|total|message|error)\b/.test(x)), ihS.join(' | '));

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

  // ─── 3. Combustibil, pe server pornit: ACELEAȘI cifre ca rapoartele, pentru aceeași perioadă ────────────
  console.log('\n3. Combustibil — aceleași cifre ca rapoartele Consum, Costuri și „Alimentări & scăderi"');
  const SD = require('./safe_drive');
  // Lunile trecute (ora României), întregi: drumurile stau pe 15 ale lor — departe de capete, deci proba nu depinde de azi.
  const lunaAzi = SD.lunaDe(Date.now()), L1 = SD.lunaDinainte(lunaAzi), L2 = SD.lunaDinainte(L1);
  const laOra = (luna, ora, min) => SD.inceput(luna + '-15') + (ora * 60 + min) * 60000;
  const sim = (imei, ms, o) => json('POST', '/api/test/simulate', S, Object.assign({ imei, ts: new Date(ms).toISOString() }, o));
  // Fișele: Loganul are în fișă 8 L (oraș) / 6 L (afară); Caddy-ul 7 L (afară) — n-are contor, deci consumul lui e ESTIMAT.
  const f1 = await json('PUT', '/api/devices/' + V[0] + '/details', ckSef, { consumption_city: 8, consumption_road: 6 });
  const f2 = await json('PUT', '/api/devices/' + V[1] + '/details', ckSef, { consumption_road: 7 });
  // Luna trecută. Loganul: 50 de minute de drum (~109 km), contorul CAN urcă 0,25 L pe minut (≈ 11,2 L la 100 km — peste cei
  // 8 din fișă), alimentare de ~30 L la minutul 20; apoi parcat, iar după 2 ore rezervorul are cu 20 L mai puțin (motor oprit).
  const t1 = laOra(L1, 10, 0);
  for (let k = 0; k < 50; k++) await sim(V[0], t1 + k * 60000, { speed: 100, lat: 45.70 + k * 0.02, lng: 21.20, io: { ignition: 1, can_fuel_consumed: 3000 + k * 0.25, fuel_level_liters: (k < 20 ? 60 : 90) - k * 0.25 } });
  const parcat = { speed: 0, lat: 45.70 + 49 * 0.02, lng: 21.20 };
  await sim(V[0], t1 + 59 * 60000, Object.assign({ io: { ignition: 0, can_fuel_consumed: 3012.25, fuel_level_liters: 77.75 } }, parcat));
  await sim(V[0], t1 + 179 * 60000, Object.assign({ io: { ignition: 0, can_fuel_consumed: 3012.25, fuel_level_liters: 57.75 } }, parcat));
  // Caddy-ul: 30 de minute de drum (~32 km), fără date de combustibil.
  const t1b = laOra(L1, 14, 0);
  for (let k = 0; k < 30; k++) await sim(V[1], t1b + k * 60000, { speed: 60, lat: 45.60 + k * 0.01, lng: 21.10, io: { ignition: 1 } });
  // Luna dinainte (de comparat): Loganul, 20 de minute (~42 km), 0,2 L pe minut.
  const t2 = laOra(L2, 10, 0);
  for (let k = 0; k < 20; k++) await sim(V[0], t2 + k * 60000, { speed: 100, lat: 45.70 + k * 0.02, lng: 21.20, io: { ignition: 1, can_fuel_consumed: 2000 + k * 0.2, fuel_level_liters: 70 - k * 0.2 } });
  // Altă firmă: Focus-ul are și el drum luna trecută (nu trebuie să apară la noi).
  for (let k = 0; k < 10; k++) await sim(V[2], t1 + k * 60000, { speed: 80, lat: 46.70 + k * 0.01, lng: 23.50, io: { ignition: 1 } });
  T('pregătire: fișele mașinilor și drumurile din lunile trecute', f1.status === 200 && f2.status === 200, f1.status + ' ' + f2.status);

  async function cbPagina(ck, q) {   // pagina mai întreabă cât luna se pregătește — ca proba
    let r = null;
    for (let i = 0; i < 60; i++) { r = await json('GET', '/api/insight/combustibil' + q, ck); if (r.status !== 200 || !r.j.pregatire) break; await sleep(1000); }
    return r;
  }
  const c1 = await cbPagina(ckSef, '?luna=' + L1);
  const de1 = new Date(SD.inceput(L1 + '-01')).toISOString(), pana1 = new Date(SD.inceput(lunaAzi + '-01')).toISOString();
  const de2 = new Date(SD.inceput(L2 + '-01')).toISOString();
  const rap = async (tip, de, pana) => (await json('GET', '/api/reports/' + tip + '?from=' + encodeURIComponent(de) + '&to=' + encodeURIComponent(pana), ckSef)).j;
  const rCons = await rap('consumption', de1, pana1), rCost = await rap('costs', de1, pana1), rFuel = await rap('fuel', de1, pana1);
  const rCons2 = await rap('consumption', de2, de1), rCost2 = await rap('costs', de2, de1);
  const vi = (r, imei) => ((r && r.valori) || []).filter((x) => x.imei === imei)[0] || {};
  const m0 = ((c1.j.masini || []).filter((m) => m.imei === V[0])[0]) || {}, m1 = ((c1.j.masini || []).filter((m) => m.imei === V[1])[0]) || {};
  T('luna trecută: cele două mașini ale firmei, cu drum; luna aleasă e cea cerută', c1.status === 200 && c1.j.lunaAleasa === L1 && (c1.j.masini || []).length === 2 && m0.km > 100 && m1.km > 30, c1.status + ' ' + JSON.stringify((c1.j.masini || []).map((m) => [m.eticheta, m.km, m.litri, m.sursa])));
  T('km, litri, L la 100 km și sursa = raportul Consum (Loganul: CAN; Caddy-ul: Estimat)', [[m0, V[0]], [m1, V[1]]].every((x) => { const c = vi(rCons, x[1]); return x[0].km === c.km && x[0].litri === c.litri && x[0].l100 === c.l100 && x[0].sursa === c.sursa; }) && m0.sursa === 'CAN' && m1.sursa === 'Estimat' && m1.estimat === true,
    JSON.stringify([[m0.km, m0.litri, m0.l100, m0.sursa], vi(rCons, V[0]), [m1.km, m1.litri, m1.l100, m1.sursa], vi(rCons, V[1])]));
  T('prețul și costul = raportul Costuri, pe fiecare mașină', [[m0, V[0]], [m1, V[1]]].every((x) => { const c = vi(rCost, x[1]); return x[0].pret === c.pret && x[0].cost === c.cost; }) && m0.cost > 0,
    JSON.stringify([[m0.pret, m0.cost], vi(rCost, V[0]), [m1.pret, m1.cost], vi(rCost, V[1])]));
  const fl = c1.j.flota || {};
  const sumaV = (r, k) => ((r && r.valori) || []).filter((x) => x.imei === V[0] || x.imei === V[1]).reduce((a, x) => a + (x[k] || 0), 0);
  T('flota = suma mașinilor din rapoarte (km, cost)', fl.km === sumaV(rCons, 'km') && fl.cost === sumaV(rCost, 'cost') && fl.masini === 2 && fl.estimate === 1, JSON.stringify(fl));
  const evR = ((rFuel && rFuel.valori) || []).filter((e) => e.imei === V[0] || e.imei === V[1]);
  const scR = evR.filter((e) => e.fel === 'scadere'), alR = evR.filter((e) => e.fel === 'alimentare');
  const sc = (c1.j.scaderi || [])[0] || {};
  T('alimentările și scăderile = raportul „Alimentări & scăderi" (1 alimentare de ~30 L, 1 scădere de 20 L)', alR.length === 1 && scR.length === 1 && c1.j.evenimente.alimentari === 1 && c1.j.evenimente.scaderi === 1 &&
    c1.j.evenimente.litriAlimentati === Math.round(alR[0].litri) && sc.litri === scR[0].litri && sc.litri === 20 && sc.de === scR[0].de && sc.la === scR[0].la && sc.ts === scR[0].ts, JSON.stringify([c1.j.evenimente, sc, scR, alR.map((e) => e.litri)]));
  const oraRO = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(t1 + 179 * 60000));
  T('scăderea: cu motorul oprit, la ora României (' + oraRO + ' pe 15), cu locul pe hartă', sc.motorPornit === false && sc.cand === '15.' + L1.slice(5) + ', ' + oraRO && typeof sc.lat === 'number' && typeof sc.lng === 'number' && /B 154 UIP/.test(sc.eticheta || ''), JSON.stringify(sc));
  T('„peste normă": Loganul (CAN, 109 km, peste cei 8 L din fișă — cel mai mare consum trecut); Caddy-ul (estimat) nu', (c1.j.pesteNorma || []).map((m) => m.imei).join() === V[0] && m0.norma === 8 && m0.peste === Math.round((m0.l100 / 8 - 1) * 100) && m0.peste > 30 && m1.peste === null, JSON.stringify([m0.norma, m0.l100, m0.peste, m1.peste]));
  const rc = (c1.j.recomandari || []).map((x) => x.text);
  T('recomandările: Loganul peste normă, scăderea cu motorul oprit, Caddy-ul estimat', /^B 154 UIP · Dacia Logan 3 a consumat .* L la 100 km, cu \d+% peste/.test(rc[0] || '') && /O scădere suspectă de combustibil; cea mai nouă: B 154 UIP · Dacia Logan 3, 15\./.test(rc[1] || '') && /cu motorul oprit/.test(rc[1] || '') && /La 1 din 2 mașini consumul e ESTIMAT/.test(rc[2] || ''), rc.join(' || '));
  const lit2 = vi(rCons2, V[0]).litri, cost2 = vi(rCost2, V[0]).cost;
  T('luna dinainte (' + L2 + ', întreagă) = rapoartele pe luna aceea: litri și cost', c1.j.inainte && c1.j.inainte.litri === Math.round(lit2) && c1.j.inainte.cost === cost2 && c1.j.inainte.km === vi(rCons2, V[0]).km && c1.j.fata && c1.j.fata.fel === 'atentie' && c1.j.fata.cost.indexOf(c1.j.inainte.eticheta) > 0,
    JSON.stringify([c1.j.inainte, lit2, cost2, c1.j.fata]));
  T('pe mașină, față de luna dinainte: Loganul are comparație, Caddy-ul (fără drum atunci) nu', m0.fata && m0.fata.fel === 'atentie' && /^\+/.test(m0.fata.text) && m1.fata === null, JSON.stringify([m0.fata, m1.fata]));
  T('„Cum se socotește": patru explicații, cu pragul de scădere al rapoartelor (10 litri)', (c1.j.explicatii || []).length === 4 && /cel puțin 10 litri/.test(JSON.stringify(c1.j.explicatii)));
  T('altă firmă nu apare (Focus-ul ei a mers luna trecută)', c1.text.indexOf('CJ 01 ALT') < 0);
  // Grupa: Caddy-ul singur într-o grupă
  const gr = (await json('POST', '/api/groups', ckSef, { name: 'Utilitare' })).j;
  await json('PUT', '/api/devices/' + V[1] + '/assign', ckSef, { group_id: gr.id });
  const cG = await cbPagina(ckSef, '?luna=' + L1 + '&grupa=' + gr.id);
  T('grupa „Utilitare": doar Caddy-ul; grupa aleasă și lista grupelor vin de la server', cG.status === 200 && cG.j.grupaAleasa === gr.id && (cG.j.masini || []).length === 1 && cG.j.masini[0].imei === V[1] && (cG.j.grupe || []).some((g) => g.id === gr.id) && (cG.j.scaderi || []).length === 0, JSON.stringify([cG.j.grupaAleasa, (cG.j.masini || []).map((m) => m.eticheta), (cG.j.grupe || []).map((g) => g.eticheta)]));
  const cA = await cbPagina(ckAlt, '?luna=' + L1);
  T('cealaltă firmă își vede DOAR Focus-ul ei', cA.status === 200 && (cA.j.masini || []).length === 1 && /CJ 01 ALT/.test(cA.j.masini[0].eticheta) && cA.text.indexOf('B 154 UIP') < 0, JSON.stringify((cA.j.masini || []).map((m) => m.eticheta)));
  const cF = await json('GET', '/api/insight/combustibil?luna=' + L1, ckFara);
  T('fără loc RA Insight: 403, fără cifre', cF.status === 403 && !cF.j.masini, cF.status);
  // Numărul de lângă ramură: din luna de acum, doar dacă e deja socotită
  const cAcum = await cbPagina(ckSef, '');
  const nrC = await json('GET', '/api/insight/ramuri', ckSef);
  T('numărul de lângă Combustibil = scăderi + mașini peste normă, în luna de acum (deja socotită)', cAcum.status === 200 && cAcum.j.lunaAleasa === lunaAzi && !cAcum.j.pregatire && nrC.j.combustibil === (cAcum.j.scaderi || []).length + (cAcum.j.pesteNorma || []).length, JSON.stringify([nrC.j, cAcum.j.lunaAleasa, (cAcum.j.masini || []).length]));

  // ─── 4. Ore de condus, pe server pornit: ACELEAȘI ore și încălcări ca raportul „Condus & repaus (Reg. 561)" ──────
  console.log('\n4. Ore de condus — aceleași ore și încălcări ca raportul „Condus & repaus (Reg. 561)"');
  const C4 = require('./condus');
  const ziPlus = (z, n) => { const d = new Date(z + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const aziRO = C4.zi(Date.now()), luniAcum = ziPlus(aziRO, -C4.ziSapt(aziRO)), luniT = ziPlus(luniAcum, -7), luniTT = ziPlus(luniAcum, -14);
  // Camionul firmei (Volvo FH): Gheorghe îl are de la început; după drumuri îl preia Vasile (azi). Loganul e al lui Ion (secțiunea 2).
  const VT = '350000000081004';
  await json('POST', '/api/devices/import', S, { rows: [{ imei: VT, nume: 'Volvo FH', nr_inmatriculare: 'TM 77 RAT' }] });
  await json('PUT', '/api/devices/' + VT + '/company', S, { company_id: coA.id });
  const dT = await json('PUT', '/api/devices/' + VT + '/details', ckSef, { vehicle_type: 'Camion' });
  const dL = await json('PUT', '/api/devices/' + V[0] + '/details', ckSef, { vehicle_type: 'Autoturism' });
  const gh = (await json('POST', '/api/drivers', ckSef, { name: 'Gheorghe Marin' })).j, vs = (await json('POST', '/api/drivers', ckSef, { name: 'Vasile Pop' })).j;
  const grC = (await json('POST', '/api/groups', ckSef, { name: 'Camioane' })).j;
  await json('PUT', '/api/devices/' + VT + '/assign', ckSef, { driver_id: gh.id, group_id: grC.id });
  let simRele = 0;
  const simH = async (imei, ms, o) => { const r = await json('POST', '/api/test/simulate', S, Object.assign({ imei, ts: new Date(ms).toISOString() }, o)); if (r.status !== 200) simRele++; };
  const drumH = async (imei, t0, minute, lat0) => { let lat = lat0; for (let k = 0; k <= minute; k += 2) { lat += 0.024; await simH(imei, t0 + k * 60000, { speed: 72, lat, lng: 21.2, io: { ignition: 1 } }); } await simH(imei, t0 + (minute + 10) * 60000, { speed: 0, lat, lng: 21.2, io: { ignition: 0 } }); };
  // Săptămâna trecută: luni, camionul 5 h fără pauză (încălcare); miercuri, de două ori 4 h, cu 50 de minute de pauză (în regulă);
  // marți, Loganul 2 h (autoturism: Reg. 561 nu se aplică). Cu două săptămâni în urmă: camionul 1 h (de comparat).
  await drumH(VT, SD.inceput(luniT) + 6 * 3600000, 300, 45.0);
  const mi = SD.inceput(ziPlus(luniT, 2)) + 5 * 3600000;
  await drumH(VT, mi, 240, 45.5); await drumH(VT, mi + 300 * 60000, 240, 46.0);
  await drumH(V[0], SD.inceput(ziPlus(luniT, 1)) + 8 * 3600000, 120, 47.0);
  await drumH(VT, SD.inceput(luniTT) + 6 * 3600000, 60, 44.0);
  await json('PUT', '/api/devices/' + VT + '/assign', ckSef, { driver_id: vs.id, group_id: grC.id });
  T('pregătire: camionul (cu șoferul schimbat azi), autoturismul, drumurile din ultimele două săptămâni', dT.status === 200 && dL.status === 200 && !!gh.id && !!vs.id && simRele === 0, [dT.status, dL.status, simRele].join(','));

  async function hcPagina(ck, q) {
    let r = null;
    for (let i = 0; i < 60; i++) { r = await json('GET', '/api/insight/ore-condus' + q, ck); if (r.status !== 200 || !r.j.pregatire) break; await sleep(1000); }
    return r;
  }
  const h1 = await hcPagina(ckSef, '?saptamana=' + luniT);
  const deH = new Date(SD.inceput(luniT)).toISOString(), panaH = new Date(SD.inceput(luniAcum)).toISOString();
  const rH = (await json('GET', '/api/reports/hos?from=' + encodeURIComponent(deH) + '&to=' + encodeURIComponent(panaH), ckSef)).j;
  const vH = (rH && rH.valori) || [];
  const sh = (n) => (h1.j.soferi || []).filter((x) => x.nume === n)[0] || {};
  const oreRap = (n) => vH.filter((x) => x.sofer === n).reduce((a, x) => a + x.condusSec, 0);
  T('săptămâna trecută: Gheorghe (camionul) și Ion (Loganul); săptămâna aleasă e cea cerută', h1.status === 200 && h1.j.saptamanaAleasa === luniT && (h1.j.soferi || []).length === 2 && sh('Gheorghe Marin').condusSec > 0 && sh('Ion Popescu').condusSec > 0, h1.status + ' ' + JSON.stringify((h1.j.soferi || []).map((x) => [x.nume, x.text && x.text.condus])));
  T('orele = raportul „Condus & repaus", pe fiecare șofer', sh('Gheorghe Marin').condusSec === oreRap('Gheorghe Marin') && sh('Ion Popescu').condusSec === oreRap('Ion Popescu') && h1.j.flota.condusSec === vH.reduce((a, x) => a + x.condusSec, 0), JSON.stringify([sh('Gheorghe Marin').condusSec, oreRap('Gheorghe Marin'), sh('Ion Popescu').condusSec, oreRap('Ion Popescu')]));
  T('fiecare zi pe șoferul care avea camionul ATUNCI: Gheorghe, nu Vasile (care l-a preluat azi) — și în raport, și în ramură', !(h1.j.soferi || []).some((x) => x.nume === 'Vasile Pop') && vH.some((x) => x.sofer === 'Gheorghe Marin') && !vH.some((x) => x.sofer === 'Vasile Pop') && (rH.rows || []).some((r) => r[0] === 'Gheorghe Marin'), JSON.stringify((rH.rows || []).map((r) => [r[0], r[2], r[3]])));
  const incR = [].concat(...vH.map((x) => (x.incalcari || []).map((c) => x.sofer + '|' + x.zi + '|' + c)));
  T('încălcările = ale raportului (o singură: luni, condus continuu peste 4h30)', (h1.j.incalcari || []).length === 1 && JSON.stringify((h1.j.incalcari || []).map((x) => x.nume + '|' + x.zi + '|' + x.ce)) === JSON.stringify(incR) && /^condus continuu 5h/.test(h1.j.incalcari[0].ce) && h1.j.incalcari[0].zi === luniT, JSON.stringify([h1.j.incalcari, incR]));
  T('Gheorghe: 2 zile, cea mai lungă miercuri (peste 8 h, în regulă), fără pauză cel mai mult luni; Ion: „nu se aplică" (autoturism)', sh('Gheorghe Marin').zile === 2 && sh('Gheorghe Marin').ziMax.zi === ziPlus(luniT, 2) && sh('Gheorghe Marin').ziMax.sec > 8 * 3600 && sh('Gheorghe Marin').continuuMax.zi === luniT && sh('Gheorghe Marin').supus === true && sh('Ion Popescu').supus === false && sh('Ion Popescu').incalcari === 0, JSON.stringify([sh('Gheorghe Marin').ziMax, sh('Gheorghe Marin').continuuMax, sh('Ion Popescu').supus]));
  T('săptămâna dinainte (cu două în urmă): camionul 1 h și ceva → „+… față de …"', h1.j.inainte && h1.j.inainte.condusSec > 3600 && h1.j.inainte.condusSec < 2 * 3600 && /^\+/.test(h1.j.fata.text) && h1.j.fata.text.indexOf(h1.j.inainte.eticheta) > 0, JSON.stringify([h1.j.inainte, h1.j.fata]));
  T('recomandarea: încălcarea lui Gheorghe, cu ziua, și că e o estimare din GPS', /^Gheorghe Marin: o încălcare a Reg\. 561 — condus continuu 5h/.test(((h1.j.recomandari || [])[0] || {}).text || '') && /estimare din GPS/.test(((h1.j.recomandari || [])[0] || {}).text || ''), JSON.stringify(h1.j.recomandari));
  T('lista săptămânilor: 4, cea de acum întâi („Săptămâna asta · …")', (h1.j.saptamani || []).length === 4 && h1.j.saptamani[0].saptamana === luniAcum && /^Săptămâna asta · /.test(h1.j.saptamani[0].optiune) && h1.j.saptamani[1].saptamana === luniT && /^Săptămâna trecută · /.test(h1.j.saptamani[1].optiune), JSON.stringify(h1.j.saptamani));
  const hG = await hcPagina(ckSef, '?saptamana=' + luniT + '&grupa=' + grC.id);
  T('grupa „Camioane": doar Gheorghe', hG.status === 200 && hG.j.grupaAleasa === grC.id && (hG.j.soferi || []).map((x) => x.nume).join() === 'Gheorghe Marin', JSON.stringify((hG.j.soferi || []).map((x) => x.nume)));
  const hA = await hcPagina(ckAlt, '?saptamana=' + luniT);
  T('cealaltă firmă nu vede camionul și șoferii noștri', hA.status === 200 && hA.text.indexOf('TM 77 RAT') < 0 && hA.text.indexOf('Gheorghe') < 0, hA.text.slice(0, 160));
  const hF = await json('GET', '/api/insight/ore-condus?saptamana=' + luniT, ckFara);
  T('fără loc RA Insight: 403, fără ore', hF.status === 403 && !hF.j.soferi, hF.status);
  const hAcum = await hcPagina(ckSef, '');
  const nrH = await json('GET', '/api/insight/ramuri', ckSef);
  T('numărul de lângă Ore de condus = încălcările din săptămâna de acum (deja socotită)', hAcum.status === 200 && hAcum.j.saptamanaAleasa === luniAcum && !hAcum.j.pregatire && nrH.j.orecondus === (hAcum.j.incalcari || []).length, JSON.stringify([nrH.j, hAcum.j.saptamanaAleasa]));

  // ─── 5. Scrisoarea de luni, pe server pornit (fără model: textul pe reguli) ─────────────────────────────────
  console.log('\n5. Scrisoarea de luni — ajunge la oamenii cu loc RA Insight, o dată, cu cifrele ramurilor');
  const acumS = SD.inceput(luniAcum) + 8 * 3600000 + 60000;   // lunea asta la 8 și un minut (ceasul probei; scrisoarea pleacă doar lunea)
  const t1s = await json('POST', '/api/test/ceasuri', S, { acum: acumS, scrisori: true });
  const ls = await json('GET', '/api/insight/scrisori', ckSef);
  const sc1 = (ls.j.scrisori || [])[0] || {};
  T('lunea de la 8: scrisoarea săptămânii trecute (' + luniT + ') pentru omul cu loc RA Insight, și pentru cealaltă firmă', t1s.status === 200 && t1s.j.scrisori && t1s.j.scrisori.saptamana === luniT && t1s.j.scrisori.scrisori >= 2 && ls.status === 200 && (ls.j.scrisori || []).length === 1 && sc1.saptamana === luniT && sc1.citita === false, JSON.stringify([t1s.j.scrisori, ls.j]));
  const nrS = await json('GET', '/api/insight/ramuri', ckSef);
  T('numărul de lângă ramură = scrisorile necitite (1)', nrS.j.scrisoare === 1, JSON.stringify(nrS.j));
  const notS = await json('GET', '/api/notifications', ckSef);
  const lnS = Array.isArray(notS.j) ? notS.j : (notS.j.notifications || notS.j.items || []);
  const anunt = lnS.filter((x) => x.type === 'scrisoare_luni')[0];
  T('anunțul „Scrisoarea de luni", cu scrisoarea în el', !!anunt && /Ce contează din săptămâna/.test(anunt.body || '') && (typeof anunt.data === 'string' ? JSON.parse(anunt.data) : anunt.data || {}).scrisoareId === sc1.id, JSON.stringify(anunt || lnS.slice(0, 2)));
  const s1 = await json('GET', '/api/insight/scrisori/' + sc1.id, ckSef);
  const fp = s1.j.fapte || {};
  T('scrisoarea (fără model → pe reguli): încălcarea lui Gheorghe, actele trecute de termen, „De făcut săptămâna asta"', s1.status === 200 && s1.j.scrisDe === 'reguli' && /Gheorghe Marin/.test(s1.j.text) && /Au trecut de termen: /.test(s1.j.text) && /De făcut săptămâna asta:\n• /.test(s1.j.text), (s1.j.text || '').slice(0, 400));
  const kmR = vH.length >= 0 ? (await json('GET', '/api/reports/consumption?from=' + encodeURIComponent(deH) + '&to=' + encodeURIComponent(panaH), ckSef)).j : {};
  const sumKm = ((kmR && kmR.valori) || []).reduce((a, x) => a + (x.km || 0), 0);
  T('aceleași cifre ca ramurile: orele și încălcările (Ore de condus), drumul (raportul Consum), actele (Mentenanță & acte)', fp.oreCondus && fp.oreCondus.incalcariTotal === (h1.j.incalcari || []).length && fp.oreCondus.total === h1.j.flota.text && fp.drum && fp.drum.km === sumKm && fp.acte.trecuteTotal === (p2.j.randuri || []).filter((x) => x.stare === 'depasit').length,
    JSON.stringify([fp.oreCondus, fp.drum, sumKm, fp.acte && fp.acte.trecuteTotal]));
  T('citită: numărul de lângă ramură dispare', (await json('GET', '/api/insight/ramuri', ckSef)).j.scrisoare === undefined);
  const t2s = await json('POST', '/api/test/ceasuri', S, { acum: acumS + 60000, scrisori: true });
  T('a doua trecere: nicio scrisoare în plus (o dată pe om și pe săptămână)', t2s.j.scrisori && t2s.j.scrisori.scrisori === 0 && (await json('GET', '/api/insight/scrisori', ckSef)).j.scrisori.length === 1, JSON.stringify(t2s.j.scrisori));
  const sA = await json('GET', '/api/insight/scrisori/' + sc1.id, ckAlt);
  T('scrisoarea altcuiva: 404, ca una care nu există; omul fără loc RA Insight: 403', sA.status === 404 && (await json('GET', '/api/insight/scrisori', ckFara)).status === 403, sA.status);
  const lsA = await json('GET', '/api/insight/scrisori', ckAlt);
  const sAlt = lsA.j.scrisori && lsA.j.scrisori[0] ? await json('GET', '/api/insight/scrisori/' + lsA.j.scrisori[0].id, ckAlt) : { j: {} };
  T('cealaltă firmă: scrisoarea ei, cu ITP-ul ei expirat, fără nimic din firma noastră', lsA.status === 200 && (lsA.j.scrisori || []).length === 1 && /ITP — CJ 01 ALT/.test(sAlt.j.text || '') && (sAlt.j.text || '').indexOf('Gheorghe') < 0 && (sAlt.j.text || '').indexOf('B 154 UIP') < 0, (sAlt.j.text || '').slice(0, 300));
  const devreme = await json('POST', '/api/test/ceasuri', S, { acum: SD.inceput(luniAcum) + 7 * 3600000, scrisori: true });
  T('lunea înainte de 8: încă nimic', devreme.j.scrisori && devreme.j.scrisori.devreme === true, JSON.stringify(devreme.j.scrisori));
  const marti = await json('POST', '/api/test/ceasuri', S, { acum: SD.inceput(ziPlus(luniAcum, 1)) + 9 * 3600000, scrisori: true });
  T('în altă zi decât lunea: nimic (o livrare în mijlocul săptămânii nu trimite scrisori)', marti.j.scrisori && marti.j.scrisori.nuELuni === true, JSON.stringify(marti.j.scrisori));

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); process.exit(1); });
