// verify_masini_client.js — „Mașinile clientului" din Ofertare Live: ce aparat merge pe ce mașină (28.09).
//
//   node verify_masini_client.js
//
// Alin: „să introducem o listă cu model și an de fabricație ca să vedem ce se potrivește exact — Dacia,
// Logan 2, 2024, benzină + GPL — și calculatorul să-mi recomande ce echipament i se potrivește." Sursa sunt
// listele Excel ale Teltonika (LV-CAN200, FMX150, ALL-CAN300). Proba ține:
//   1. citirea listelor — pe foi făcute AICI, cu forma lor adevărată (antetul, anii, „+" colorat, legenda);
//   2. potrivirea — anul, modelul mai precis, generația, combustibilul, piețele străine, mărcile scrise altfel;
//   3. recomandarea — camion → FMC650, utilaj, „doar poziție", mașina pe amândouă listele, GPL;
//   4. lipitul din Excel-ul clientului;
//   5. listele adevărate (copia de pornire din depozit): Logan 2024 cu GPL, Golf, Volvo FH;
//   6. pagina — o singură regulă (serverul), lista NU ajunge pe hârtie, se salvează cu oferta;
//   7. pe server pornit — listele, căutarea, potrivirea, încărcarea unei liste noi (fișier CRUD, nu JSON).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const C = require('./compatibilitate');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');

// ─── Foi de probă, cu forma listelor adevărate ───────────────────────────────────────────────────
const cel = (t, o) => (t == null || t === '') ? null : Object.assign({ t: String(t) }, o || {});
const rand = (a) => a.map((x) => (x && typeof x === 'object') ? x : cel(x));
const ALBASTRU = { albastru: true };
// LV-CAN200 / ALL-CAN300: antet pe rândul 2, anii „2021>", legenda jos.
const ANTET_LV = ['NO', 'Brand', 'Model', 'year', 'program №', 'program date', 'Number of CAN BUSes to be connected', 'Flags', 'Ignition',
  'Engine is working on LPG', 'Total mileage of the vehicle (dashboard)', 'Vehicle mileage - (counted)', 'Total fuel consumption',
  'Total fuel consumption - (counted)', 'Fuel level (in percent)', 'Total LPG use – (counted)', 'LPG level (in percent)', 'HV battery level'];
//            gplStare km(bord) km(soc) consum consum(soc) rezervor gplConsum gplNivel baterie
const lv = (nr, marca, model, an, prog, date) => rand([nr, marca, model, an, prog, 'from 2025-01-01', '1', '+', '+'].concat(date));
const ICE = ['', '+', '', '', '+', '+', '', '', ''];
const LPG = ['+', '+', '', '', '+', '+', '+', '+', ''];
const foiLv = [
  { nume: 'Cars', randuri: [[], rand(ANTET_LV), [],
    lv(1, 'DACIA', 'LOGAN (III) (LPG)', '2021>', '13732', LPG),
    lv(2, 'DACIA', 'LOGAN II', '2013>', '11574', ICE),
    lv(3, 'DACIA', 'LOGAN VAN', '2008>', '11283', ICE),
    lv(4, 'DACIA', 'SANDERO', '2012>', '11574', ICE),
    lv(5, 'DACIA', 'SANDERO STEPWAY', '2017>', '13119', ICE),
    lv(6, 'DACIA', 'DUSTER (Keyless)', '2018>', '13584', ICE),
    rand([7, 'DACIA', 'DUSTER (Regular-key)', '2018>', '12217', 'x', '1', '+', '+', '', '+', '', '', '+', cel('+', ALBASTRU), '', '', '']),
    lv(8, 'FORD', 'TRANSIT', '2020>', '12847', ICE),
    lv(9, 'FORD', 'TRANSIT', '2016>', '11868', ICE),
    lv(10, 'FORD', 'TRANSIT CUSTOM', '2018>', '12647', ICE),
    lv(11, 'FORD', 'TRANSIT (RHD)', '2020>', '12848', ICE),
    lv(12, 'FORD', 'TRANSIT (RussianMarket)', '2021>', '13117', ICE),
    lv(13, 'MERCEDES', 'SPRINTER (907)', '2018>', '12454', ICE),
    lv(14, 'TOYOTA', 'COROLLA (Hybrid) (Keyless)', '2019>', '12933', ICE),
    lv(15, 'TOYOTA', 'COROLLA', '2013>', '11500', ICE),
    lv(16, 'VW', 'GOLF 7 (AU)', '2012>', '11600', ICE),
    lv(17, 'SKODA', 'OCTAVIA IV (NX)', '2020>', '13149', ICE),
    lv(18, 'BMW', '3 (G20 / G21)', '2019>', '14871', ICE),
    rand(['+', 'This parameter is available depending on vehicle\'s equipment', 'This parameter is available depending on vehicle\'s equipment']),
    rand(['', 'This parameter may be unavailable using P400 or U400 contactless reader', ''])] },
  { nume: 'Electric cars', randuri: [[], rand(ANTET_LV), [], lv(1, 'DACIA', 'SPRING (Electric)', '2022>', '13716', ['', '+', '', '', '', '', '', '', '+'])] },
  { nume: 'Trucks', randuri: [[], rand(ANTET_LV), [],
    lv(1, 'MERCEDES', 'ACTROS MP5 (EURO 6) (FMS)', '2019>', '14000', ICE),
    lv(2, 'VOLVO', 'FH (EURO 6)', '2018>', '13234', ICE)] },
];
// FMX150: grupul deasupra antetului (Standard / Extended), antet pe rândul 3, anii „2016-2020" / „2019+".
const GRUP = ['Supported CAN vehicles 12/02/2025', '', '', '', '', '', '', '', 'Standard parameters', 'Standard parameters', 'Standard parameters', 'Standard parameters', 'Standard parameters', 'Extended parameters'];
const ANTET_F = ['No', 'Category', 'Manufacturer', 'Model', 'Model year', 'Fuel type', 'Region', 'CAN Lines',
  'Fuel level (%)', 'Fuel Consumption', 'Total Mileage (km)', 'Fuel Consumed (Counted)', 'HVBattery charge level', 'Exhaust Fluid Tank level'];
const f150 = (nr, cat, marca, model, an, comb, reg, date) => rand([nr, cat, marca, model, an, comb, reg, '1'].concat(date));
const foiF = [
  { nume: 'Supported Vehicles', randuri: [rand(GRUP), rand(GRUP), rand(ANTET_F),
    f150(1, 'Car', 'Dacia', 'Logan mk2', '2012-2016', 'ICE', 'Global', ['', '+', '+', '', '', '+']),
    f150(2, 'Car', 'Dacia', 'Logan mk2 facelift', '2016-2020', 'ICE', 'Global', ['', '+', '+', '', '', '+']),
    f150(3, 'Car', 'Dacia', 'Sandero mk3 (DJF)', '2020-2022', 'ICE', 'Global', ['+', '', '+', '+', '', '']),
    f150(4, 'Van', 'Ford', 'Transit mk4 facelift 1', '2020-2022', 'ICE', 'Global', ['+', '', '+', '+', '', '']),
    f150(5, 'Van', 'Mercedes-Benz', 'Sprinter mk3 (W907)', '2018-2024', 'ICE', 'Global', ['+', '', '+', '+', '', '']),
    f150(6, 'Van', 'Mercedes-Benz', 'Sprinter mk2 (C906) LATAM', '2013-2018', 'ICE', 'Latam', ['+', '', '+', '+', '', '']),
    f150(7, 'Car', 'Volkswagen', 'Golf mk8 (TypCD)', '2019-2024', 'ICE', 'Global', ['+', '', '+', '+', '', '']),
    f150(8, 'Car', 'Toyota', 'Corolla mk12 (ZRE212)', '2019-2023', 'ICE', 'Global', ['+', '', '+', '+', '', '']),
    f150(9, 'Car', 'Kia', 'Ceed mk3 facelift (CD)', '2021+', 'ICE', 'Global', [cel('+*'), '', cel('+', { galben: true }), '+', '', '']),
    f150(10, 'Agricultural', 'John Deere', '6155R', '2018+', 'ICE', 'Global', ['+', '+', '', '', '', '+']),
    f150(11, 'Truck', 'Volvo', 'FH mk3 facelift', '2020+', 'ICE', 'Global', ['+', '+', '+', '', '', '']),
    f150(12, 'Car', 'Dacia', 'Spring (BBG)', '2021-2023', 'Electric', 'Global', ['', '', '+', '', '+', '']),
    ...Array.from({ length: 9 }, (x, i) => f150(20 + i, 'Car', 'Proba', 'Model ' + (i + 1), '2015-2020', 'ICE', 'Global', ['+', '', '+', '', '', '']))] },
  { nume: 'Legend', randuri: [[], rand(['', '+', 'This parameter will not be available if using ECAN02'])] },
];

sect('1. Citirea listelor (pe foi cu forma celor adevărate)');
const L1 = C.citesteFoi(foiLv, 'LV-CAN200_list_2025_07_23_en.xlsx');
T('recunoaște lista LV-CAN200 după nume', L1.tip === 'lvcan');
T('citește toate mașinile, fără legenda de la coada foii', L1.randuri.length === 21 && !L1.randuri.some((e) => /this parameter/i.test(e.marca)), L1.randuri.length);
const logan3 = L1.randuri.find((e) => e.model === 'LOGAN (III) (LPG)');
T('„2021>" = de la 2021, fără capăt', logan3.de === 2021 && logan3.pana === null);
T('programul și liniile CAN, pentru instalator', logan3.program === '13732' && logan3.can === 1);
T('varianta cu GPL e recunoscută, cu nivelul și consumul de GPL', logan3.comb === 'gpl' && logan3.date.gplNivel === 'b' && logan3.date.gplConsum === 'b');
T('„+" albastru = „depinde de dotare"', L1.randuri.find((e) => e.model === 'DUSTER (Regular-key)').date.rezervor === 'bq');
T('felul vine din foaie: Trucks → camion, Electric cars → electric', L1.randuri.find((e) => /ACTROS/.test(e.model)).fel === 'camion' && L1.randuri.find((e) => /SPRING/.test(e.model)).comb === 'electric');
T('hibridul se recunoaște din etichetă', L1.randuri.find((e) => /COROLLA \(Hybrid/.test(e.model)).comb === 'hibrid');
const F1 = C.citesteFoi(foiF, 'FMX150_Supported_Vehicles_12_02_2025.xlsx');
T('recunoaște lista FMC150 (antet pe rândul 3)', F1.tip === 'fmc150' && F1.randuri.length === 21, F1.tip + ' ' + F1.randuri.length);
const ceed = F1.randuri.find((e) => /Ceed/.test(e.model));
T('„+*" = experimental; „+" pe galben = lipsește cu ECAN02', ceed.date.rezervor === 'bx' && ceed.date.km === 'bc', JSON.stringify(ceed.date));
T('parametrii „Extended" (se cer separat de la Teltonika) nu se numără', !F1.randuri.some((e) => e.date && e.date.adblue));
T('„2016-2020" = între ani; categoria Agricultural → utilaj', F1.randuri.find((e) => e.model === 'Logan mk2 facelift').pana === 2020 && F1.randuri.find((e) => e.model === '6155R').fel === 'utilaj');
T('ALL-CAN300 recunoscut după nume', C.citesteFoi(foiLv, 'ALLCAN300_list_2025_03_10_en.xlsx').tip === 'allcan');
const foiAll = foiLv.map((f) => ({ nume: f.nume, randuri: f.randuri.map((r, i) => i === 1 ? r.concat([cel('Key inserted')]) : r) }));
T('...și fără nume grăitor, după ce citește în plus (cheia din contact)', C.citesteFoi(foiAll, 'lista.xlsx').tip === 'allcan');
let err = '';
try { C.citesteFoi([{ nume: 'Foaie', randuri: [rand(['Nume', 'Prenume'])] }], 'x.xlsx'); } catch (e) { err = e.message; }
T('alt Excel → refuzat, pe înțeles', /nu e o listă de mașini Teltonika/.test(err), err);
err = ''; try { C.citesteFoi([{ nume: 'Cars', randuri: [[], rand(ANTET_LV), lv(1, 'DACIA', 'LOGAN', '2013>', '1', ICE)] }], 'LV-CAN200.xlsx'); } catch (e) { err = e.message; }
T('o listă cu câteva rânduri → refuzată (nu e lista întreagă)', /nu pare lista întreagă/.test(err), err);
T('ziua listei din nume: „2025_07_23" și „12_02_2025" (lună, zi, an)', C.dataDinNume('LV-CAN200_list_2025_07_23_en.xlsx') === '2025-07-23' && C.dataDinNume('FMX150_Supported_Vehicles_12_02_2025.xlsx') === '2025-12-02');
T('fără dată limpede în nume → nu inventăm una', C.dataDinNume('lista.xlsx') === null);
T('anii: „2017+", „<=2010", gol', JSON.stringify(C.ani('2017+')) === '{"de":2017,"pana":null}' && JSON.stringify(C.ani('<=2010')) === '{"de":null,"pana":2010}' && JSON.stringify(C.ani('')) === '{"de":null,"pana":null}');

sect('2. Potrivirea');
const LV = C.pregateste(L1.randuri), FM = C.pregateste(F1.randuri);
const pot = (L, marca, model, an, comb) => C.potriveste(L, { marca, model, an, combustibil: comb || '' });
let p = pot(LV, 'Dacia', 'Logan 2', 2024, 'gpl');
T('Logan 2024 cu GPL → „LOGAN (III) (LPG)", din 2021 (nu LOGAN II, care e „din 2013")', p.ales && p.ales.model === 'LOGAN (III) (LPG)', p.ales && p.ales.model);
T('...și spune că „2" nu e generația unei mașini din 2024', p.stare === 'nesigur' && p.note.some((x) => /generația 2/.test(x)), JSON.stringify(p.note));
T('...iar „Logan Van" apare doar ca sugestie, nu ca potrivire', p.alteModele.includes('Logan VAN'));
p = pot(LV, 'Dacia', 'Logan', 2019, 'benzina');
T('Logan 2019 pe benzină → LOGAN II, sigur', p.ales.model === 'LOGAN II' && p.stare === 'da');
T('FMC150: Logan 2024 nu e pe listă (doar până în 2020) — spune anii pe care îi are', pot(FM, 'Dacia', 'Logan', 2024).stare === 'nu' && pot(FM, 'Dacia', 'Logan', 2024).aniPeLista.join() === '2012–2016,2016–2020');
T('„Sandero Stepway" → rândul STEPWAY, nu cel simplu (modelul mai precis întâi)', pot(LV, 'Dacia', 'Sandero Stepway', 2022).ales.model === 'SANDERO STEPWAY');
T('Transit 2021 → rândul „din 2020", nu cel „din 2016"', pot(LV, 'Ford', 'Transit', 2021).ales.program === '12847');
T('volan pe dreapta și altă piață nu se aleg niciodată', !/RHD|Russian/.test(pot(LV, 'Ford', 'Transit', 2022).ales.model));
T('„Transit" nu se face singur „Transit Custom" (alt model, fără cifre)', pot(LV, 'Ford', 'Transit', 2017).ales.model === 'TRANSIT');
p = pot(LV, 'Mercedes', 'Actros', 2020);
T('„Actros" găsește „ACTROS MP5" (cuvântul în plus e generația), dar „de verificat"', p.ales && /ACTROS MP5/.test(p.ales.model) && p.stare === 'nesigur');
T('mărcile scrise altfel: Mercedes ↔ Mercedes-Benz, VW ↔ Volkswagen', pot(FM, 'Mercedes', 'Sprinter', 2020).ales.model === 'Sprinter mk3 (W907)' && pot(LV, 'Volkswagen', 'Golf 7', 2015).ales.model === 'GOLF 7 (AU)');
T('FMC150: rândul din America Latină nu se alege', pot(FM, 'Mercedes-Benz', 'Sprinter', 2015).stare === 'nu');
T('electric: doar un program de electrică', pot(LV, 'Dacia', 'Spring', 2023, 'electric').ales.model === 'SPRING (Electric)' && pot(LV, 'Dacia', 'Spring', 2023, 'benzina').stare === 'nu');
T('pe benzină nu se alege programul de hibrid', pot(LV, 'Toyota', 'Corolla', 2021, 'benzina').ales.model === 'COROLLA');
T('hibrid → programul de hibrid', pot(LV, 'Toyota', 'Corolla', 2021, 'hibrid').ales.model === 'COROLLA (Hybrid) (Keyless)');
p = pot(LV, 'Dacia', 'Duster', 2019, 'benzina');
T('Duster: două programe din același an (keyless / cheie normală) → „variante"', p.stare === 'variante' && p.variante.length === 1, p.stare + ' ' + p.variante.length);
T('fără an → „de verificat"', pot(LV, 'Ford', 'Transit').stare === 'nesigur');
T('„Seria 3" găsește modelul „3" la BMW', pot(LV, 'BMW', 'Seria 3', 2020).ales.model === '3 (G20 / G21)');
T('marcă necunoscută → „nu", spus pe nume', pot(LV, 'Aro', '10', 1990).stare === 'nu' && /marca/.test(pot(LV, 'Aro', '10', 1990).note[0]));

sect('3. Recomandarea');
const toate = (marca, model, an, comb) => ({ lvcan: pot(LV, marca, model, an, comb), fmc150: pot(FM, marca, model, an, comb), allcan: { stare: 'nu', ales: null, variante: [], alteModele: [], note: [], info: [] } });
const rec = (marca, model, an, comb, opt) => C.recomanda(toate(marca, model, an, comb), Object.assign({ pref: 'lvcan', vreaMotor: true, combustibil: comb || '', an }, opt || {}));
let r = rec('Dacia', 'Logan 2', 2024, 'gpl');
T('Logan 2024 GPL → FMC130 + LV-CAN200, „de verificat" (generația)', r.aparat === 'fmc130_lvcan' && r.sigur === 'nesigur', JSON.stringify(r));
T('camion → FMC650, cu verificarea prizei FMS și a tahografului', rec('Volvo', 'FH', 2020, 'motorina').aparat === 'fmc650' && /FMS/.test(rec('Volvo', 'FH', 2020).note.join()));
T('utilaj pe lista FMC150 → FMC150', rec('John Deere', '6155R', 2019).aparat === 'fmc150');
T('clientul vrea doar poziția → FMC130', rec('Ford', 'Transit', 2021, 'motorina', { vreaMotor: false }).aparat === 'fmc130');
T('pe amândouă listele, citesc la fel → decide comutatorul de la pasul 4', rec('Ford', 'Transit', 2021).aparat === 'fmc130_lvcan' && rec('Ford', 'Transit', 2021, '', { pref: 'fmc150' }).aparat === 'fmc150');
T('...și „merge și cu celălalt" e informație (gri), nu avertisment', rec('Ford', 'Transit', 2021).info.some((x) => /merge și cu FMC150/.test(x)) && !rec('Ford', 'Transit', 2021).note.some((x) => /merge și cu/.test(x)));
T('potrivirea SIGURĂ bate alegerea ta: Golf 2019 → FMC150 (LV-CAN200 are doar „GOLF 7", de verificat)', rec('VW', 'Golf', 2019, 'benzina').aparat === 'fmc150' && rec('VW', 'Golf', 2019, 'benzina').info.some((x) => /poate merge și cu FMC130 \+ LV-CAN200 \(de verificat\)/.test(x)), JSON.stringify(rec('VW', 'Golf', 2019, 'benzina').info));
T('lista care citește mai mult câștigă: Logan 2016 → LV-CAN200 (FMC150 nu dă rezervorul)', rec('Dacia', 'Logan', 2016, 'benzina', { pref: 'fmc150' }).aparat === 'fmc130_lvcan');
r = rec('Dacia', 'Sandero', 2021, 'gpl', { pref: 'fmc150' });
T('GPL pe FMC150 (ales din comutator) → spune că vezi doar benzina', r.aparat === 'fmc150' && r.note.some((x) => /nu citește GPL/.test(x)), JSON.stringify(r));
T('nu e pe liste → FMC130 (doar poziție), „nu"', rec('Aro', '10', 1990).aparat === 'fmc130' && rec('Aro', '10', 1990).sigur === 'nu');
const dLogan = C.dateCitite(logan3, 'gpl');
T('ce se citește, pe românește: rezervor, consum, kilometri, GPL', dLogan.map((x) => x.et).join() === 'rezervor,consum,kilometri,GPL (nivel),GPL (consum)' && dLogan.every((x) => x.da));
T('la electrică: kilometri și baterie, fără rezervor', C.dateCitite(L1.randuri.find((e) => /SPRING/.test(e.model)), 'electric').map((x) => x.k).join() === 'km,baterie');

sect('4. Lipit din Excel-ul clientului');
const lip = C.lipesteDinExcel('Marcă\tModel\tAn\tCombustibil\tBucăți\nDacia\tLogan\t2024\tbenzină + GPL\t5\nFord;Transit;2021;diesel;3\nVolvo\tFH\t2020\n\tfără marcă\t2020\n');
T('antetul se sare; Tab și „;" merg amândouă', lip.masini.length === 3 && lip.masini[1].marca === 'Ford');
T('anul, combustibilul, bucățile', lip.masini[0].an === 2024 && lip.masini[0].combustibil === 'gpl' && lip.masini[0].buc === 5 && lip.masini[1].combustibil === 'motorina');
T('fără bucăți → 1; fără marcă → sărit și numărat', lip.masini[2].buc === 1 && lip.sarite.length === 1);

sect('5. Listele adevărate (copia de pornire din depozit)');
const pornire = JSON.parse(zlib.gunzipSync(fs.readFileSync('./liste/teltonika.json.gz')).toString('utf8'));
T('are toate trei listele, cu mii de vehicule', ['lvcan', 'fmc150', 'allcan'].every((k) => pornire[k] && pornire[k].randuri.length > 2000), Object.keys(pornire).map((k) => k + ':' + pornire[k].randuri.length).join(' '));
T('fiecare își știe fișierul și ziua', pornire.lvcan.fisier === 'LV-CAN200_list_2025_07_23_en.xlsx' && pornire.lvcan.data === '2025-07-23' && pornire.fmc150.data === '2025-12-02');
const R = {}; for (const k of Object.keys(pornire)) R[k] = C.pregateste(pornire[k].randuri);
const adev = (marca, model, an, comb, opt) => {
  const pt = {}; for (const k of Object.keys(R)) pt[k] = C.potriveste(R[k], { marca, model, an, combustibil: comb || '' });
  return { pt, r: C.recomanda(pt, Object.assign({ pref: 'lvcan', vreaMotor: true, combustibil: comb || '', an }, opt || {})) };
};
let a = adev('Dacia', 'Logan 2', 2024, 'gpl');
T('exemplul lui Alin: Dacia Logan 2024, benzină + GPL → FMC130 + LV-CAN200, program 13732', a.r.aparat === 'fmc130_lvcan' && a.pt.lvcan.ales.program === '13732');
T('...citește și nivelul, și consumul de GPL', C.dateCitite(a.pt.lvcan.ales, 'gpl').filter((x) => /^gpl/.test(x.k) && x.da).length === 2);
T('...iar FMC150 nu-l are pentru 2024', a.pt.fmc150.stare === 'nu');
T('Volvo FH 2020 → FMC650', adev('Volvo', 'FH', 2020, 'motorina').r.aparat === 'fmc650');
T('VW Golf 2019 → FMC150 (Golf mk8)', adev('VW', 'Golf', 2019, 'benzina').r.aparat === 'fmc150');
T('Ford Transit 2021 → FMC130 + LV-CAN200 (merge și cu FMC150)', adev('Ford', 'Transit', 2021, 'motorina').r.aparat === 'fmc130_lvcan');

sect('6. Pagina');
const bloc = html.slice(html.indexOf('// ── începe „mașinile clientului"'), html.indexOf('// ── sfârșit „mașinile clientului" ──'));
T('blocul există', bloc.length > 3000);
T('regula NU e scrisă în pagină: potrivirea și lipitul le face serverul, o dată', (html.match(/'\/api\/admin\/masini\/potrivire'/g) || []).length === 1 && (html.match(/'\/api\/admin\/masini\/lipeste'/g) || []).length === 1 && !/function (potriveste|lipesteDinExcel|descompuneModel)\b/.test(html));
T('secțiunea stă între „1. Clientul" și „2. Flota clientului"', /clientCard \+ masiniCard \+ vehCard/.test(html));
T('scrie pe ea că e doar pentru noi', /Mașinile clientului <span class="raof-ms-tag">doar pentru tine<\/span>/.test(html));
const payload = html.slice(html.indexOf('function _ofPayload(r) {'), html.indexOf('async function _ofHartie('));
T('lista NU pleacă spre hârtia clientului', payload.length > 200 && !/masini|_ofMasini/i.test(payload));
T('hârtia ofertei nu cunoaște lista', !/masini|Mașinile clientului/i.test(fs.readFileSync('./report_export.js', 'utf8')));
T('se salvează cu oferta și revine la redeschidere; „Ofertă nouă" o golește', /masini: _ofMsPentruCfg\(\), masiniMotor: _ofMsMotor/.test(html) && /_ofMsDinCfg\(cfg\.masini\)/.test(html) && /raxOfReset = function \(\) \{[^}]*_ofMsDinCfg\(\[\]\)/.test(html));
T('pașii 2 și 4 citesc din listă când există', /function _ofRecAcum\(\) \{\s*var M = _ofRecDinMasini\(\); if \(M\) return M;/.test(html));
T('„Trece în ofertă" e butonul „Aplică recomandarea" (o singură cale), care pune și pasul 2', /onclick="raxOfAplicaRecomandarea\(\)"[^>]*><i class="fas fa-arrow-down"><\/i> Trece în ofertă/.test(html) && /if \(R\.dinMasini\) \{[\s\S]{0,200}n\('of-nveh'/.test(html));
T('un răspuns de la server nu redesenează casetele (cursorul nu se pierde)', !/_ofMsDeseneaza\(\)/.test(bloc.slice(bloc.indexOf('function _ofMsRedeseneazaRezultate'), bloc.indexOf('function _ofMsPotriveste'))));
T('o cerere veche nu calcă una nouă', /if \(nr !== _ofMsCerere\) return;/.test(bloc));
T('lista nouă pleacă CRUDĂ (fișier), nu base64 în JSON', /'Content-Type': 'application\/octet-stream', 'X-Fisier': encodeURIComponent\(f\.name\)/.test(bloc));
// Adunarea pe mașini, rulată: aceeași formă ca recomandarea din numere.
const fn = new Function('window', 'document', 'esc', '_raxNumar', '_raxDe', 'raxOfRecalc', '_ofFereastra', '_ofN', '_ofCanMod',
  bloc + '\n; return { pune: function (a, r) { _ofMasini = a; _ofMsRez = r || {}; }, rec: _ofRecDinMasini, cfg: _ofMsPentruCfg };');
const P = fn({}, {}, (s) => s, String, () => ' ', () => {}, () => {}, (v) => { v = parseFloat(v); return Number.isFinite(v) ? v : 0; }, 'lvcan');
P.pune([
  { id: 1, marca: 'Dacia', model: 'Logan', buc: 5 }, { id: 2, marca: 'Volvo', model: 'FH', buc: 2 },
  { id: 3, marca: 'VW', model: 'Golf', buc: '1' }, { id: 4, marca: 'Aro', model: '10', buc: 1 }, { id: 5, marca: '', model: 'gol', buc: 9 },
  { id: 6, marca: 'Ford', model: 'Transit', buc: 3, aparat: 'fmc130' }],
  { 1: { rec: { aparat: 'fmc130_lvcan' } }, 2: { rec: { aparat: 'fmc650' } }, 3: { rec: { aparat: 'fmc150' } }, 4: { rec: { aparat: 'fmc130' } }, 6: { rec: { aparat: 'fmc130_lvcan' } } });
const M = P.rec();
T('adunarea pe mașini: aparatele', JSON.stringify(M.aparate) === JSON.stringify({ d130: 9, d150: 1, d650: 2, lvcan: 5 }), JSON.stringify(M.aparate));
T('...montajul: GPS pe fiecare, LV-CAN, CAN încorporat, FMS', JSON.stringify(M.montaj) === JSON.stringify({ qGps: 12, qLvCan: 5, qCanInc: 1, qFms: 2 }), JSON.stringify(M.montaj));
T('...pasul 2: 12 mașini, 6 cu CAN, 2 cu FMS', M.nPlain + M.nCan + M.nFms === 12 && M.nCan === 6 && M.nFms === 2 && M.dinMasini === true);
T('aparatul ales de mână bate recomandarea (Transit → FMC130)', M.nPlain === 4);
T('rândul fără marcă nu se numără și nu se salvează', P.cfg().length === 5 && !P.cfg().some((x) => !x.marca));
P.pune([]);
T('fără mașini, pașii citesc din numere (nu din listă)', P.rec() === null);

sect('7. Pe server pornit');
T('toate ușile sunt doar ale noastre (super-admin)', ['get', 'post', 'get', 'get', 'post', 'post'].length === (server.match(/app\.(get|post)\('\/api\/admin\/masini\/[a-z]+', requireAuth, requireSuperadmin/g) || []).length, (server.match(/app\.(get|post)\('\/api\/admin\/masini\/[a-z]+', requireAuth, requireSuperadmin/g) || []).length);
T('listele nu intră în copia de siguranță (se reîncarcă), dar sunt trecute la excepții', !!require('./backup.js').BACKUP_EXCLUDED.liste_compat);
const PORT = 3238, DIR = '.masini-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_masini',
  PORT: String(PORT), TCP_PORT: '5238', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let srv = null;
function gata() {
  try { srv && srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
(async () => {
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  T('fără cont → 401', (await fetch(B + '/api/admin/masini/marci')).status === 401);
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test1234' }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const Q = async (m, u, body, hdr) => {
    const rr = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', Cookie: ck }, hdr || {}),
      body: body == null ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)) });
    let j = null; try { j = await rr.json(); } catch (e) {}
    return { s: rr.status, j };
  };
  let l = (await Q('GET', '/api/admin/masini/liste')).j || {};
  T('listele pornesc din copia din depozit', (l.liste || []).length === 3 && l.liste.every((x) => x.sursa === 'pornire' && x.n > 2000), JSON.stringify(l.liste));
  T('aparatele și combustibilii vin de la server (pagina nu le scrie a doua oară)', l.aparate && l.aparate.fmc130_lvcan && l.combustibili && l.combustibili.gpl === 'benzină + GPL');
  const marci = (await Q('GET', '/api/admin/masini/marci')).j || {};
  T('mărcile, pentru completare (Dacia, Volkswagen o singură dată)', (marci.marci || []).includes('Dacia') && (marci.marci || []).filter((x) => /^(vw|volkswagen)$/i.test(x)).length === 1);
  const mod = (await Q('GET', '/api/admin/masini/modele?marca=Dacia')).j || {};
  T('modelele Daciei: Logan, Duster, Sandero Stepway', ['Logan', 'Duster', 'Sandero Stepway'].every((x) => (mod.modele || []).includes(x)), (mod.modele || []).join(', '));
  const pr = await Q('POST', '/api/admin/masini/potrivire', { pref: 'lvcan', vreaMotor: true, vehicule: [
    { marca: 'Dacia', model: 'Logan 2', an: 2024, combustibil: 'gpl' }, { marca: 'Volvo', model: 'FH', an: 2020, combustibil: 'motorina' }, { marca: '', model: '' }] });
  const r0 = pr.j && pr.j.rezultate && pr.j.rezultate[0];
  T('potrivirea: Logan 2024 GPL → FMC130 + LV-CAN200, cu GPL citit', pr.s === 200 && r0.rec.aparat === 'fmc130_lvcan' && r0.liste.lvcan.citeste.some((x) => x.k === 'gplNivel' && x.da), JSON.stringify(r0 && r0.rec));
  T('...Volvo FH → FMC650; rândul gol → nimic', pr.j.rezultate[1].rec.aparat === 'fmc650' && pr.j.rezultate[2] === null);
  T('...ecranul primește doar ce arată, nu rândurile întregi din listă', r0.liste.lvcan.model === 'LOGAN (III) (LPG)' && r0.liste.lvcan.date === undefined && !('peMarca' in r0));
  const li = await Q('POST', '/api/admin/masini/lipeste', { text: 'Dacia\tLogan\t2024\tGPL\t5' });
  T('lipitul: pe server', li.s === 200 && li.j.masini.length === 1 && li.j.masini[0].buc === 5);
  // O listă nouă, făcută aici ca Excel adevărat, încărcată pe ușa din pagină.
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Cars');
  ws.addRow([]); ws.addRow(ANTET_LV); ws.addRow([]);
  for (let i = 1; i <= 24; i++) ws.addRow([i, 'PROBAMARCA', 'MODEL' + i, '2020>', String(90000 + i), 'from 2026-01-01', '1', '+', '+', '', '+', '', '', '+', '+', '', '', '']);
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
  T('fișier în JSON (nu crud) → refuzat', (await Q('POST', '/api/admin/masini/liste', { b64: 'x' })).s === 400);
  const bad = await Q('POST', '/api/admin/masini/liste', Buffer.from('nu e excel'), { 'Content-Type': 'application/octet-stream', 'X-Fisier': 'x.xlsx' });
  T('un fișier care nu e Excel → 400, pe înțeles', bad.s === 400 && /Excel/.test(bad.j.error || ''), JSON.stringify(bad.j));
  const up = await Q('POST', '/api/admin/masini/liste', xlsx, { 'Content-Type': 'application/octet-stream', 'X-Fisier': encodeURIComponent('LV-CAN200_list_2026_09_01_en.xlsx') });
  T('lista nouă se încarcă: recunoscută, numărată, cu ziua din nume', up.s === 200 && up.j.tip === 'lvcan' && up.j.n === 24 && up.j.data === '2026-09-01', JSON.stringify(up.j && { s: up.s, tip: up.j.tip, n: up.j.n, err: up.j.error }));
  l = (await Q('GET', '/api/admin/masini/liste')).j || {};
  const lvNou = (l.liste || []).find((x) => x.tip === 'lvcan');
  T('...o înlocuiește pe cea veche; celelalte rămân din copia de pornire', lvNou && lvNou.sursa === 'incarcata' && lvNou.n === 24 && l.liste.find((x) => x.tip === 'fmc150').sursa === 'pornire');
  const pr2 = await Q('POST', '/api/admin/masini/potrivire', { vehicule: [{ marca: 'Probamarca', model: 'Model7', an: 2022 }] });
  T('...și căutarea folosește lista nouă imediat', pr2.j.rezultate[0].liste.lvcan.program === '90007', JSON.stringify(pr2.j.rezultate[0].liste.lvcan));
  // Oferta își ține lista de mașini.
  const of = await Q('POST', '/api/admin/offers', { name: 'Ofertă proba mașini', client_name: 'Proba', config: { cfg: { masini: [{ marca: 'Dacia', model: 'Logan', an: 2024, combustibil: 'gpl', buc: 5, aparat: '' }] }, prices: {} }, monthly_total: 0 });
  const lista = ((await Q('GET', '/api/admin/offers')).j || []).find((o) => o.id === of.j.id);
  T('oferta salvată își păstrează lista de mașini', lista && lista.config.cfg.masini.length === 1 && lista.config.cfg.masini[0].model === 'Logan');
  gata();
})().catch((e) => { console.log('EROARE: ' + e.stack); rele++; gata(); });
