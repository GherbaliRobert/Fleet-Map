// verify_sugestii_oferta.js — sugestiile din Ofertare Live: ce aparat și ce montaj pentru ce mașină (25.09).
//
//   node verify_sugestii_oferta.js
//
// Alin (25.09): „sugestii să-mi arate ce să selectez mai bine pentru ce vrea clientul... să părem
// profesioniști. Clientul nu o vede în ofertă, dar o văd eu și mă dirijează." Regulile (căutate pe 25.09):
// fără CAN → FMC130; cu CAN → FMC130 + LV-CAN200 (cele mai multe modele) sau FMC150 (CAN integrat); cu FMS
// (camioane) → FMC650 + Modulul Tahograf (+ e-Transport). Proba ține: regula pe flote tipice, locul
// sfaturilor (pasul 2, pasul 4, întrebările), butonul care le aplică, și că NIMIC nu ajunge pe hârtie.

const fs = require('fs');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const rex = fs.readFileSync('./report_export.js', 'utf8');

sect('1. Regula: ce aparat și ce montaj, pe felul mașinii');
const src = html.slice(html.indexOf('function _ofRecomandare('), html.indexOf('function _ofRecAcum('));
const rec = new Function(src + '\n; return _ofRecomandare;')();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let r = rec(10, 0, 0, 'lvcan');
T('10 mașini fără CAN → 10 × FMC130, 10 × instalare GPS', eq(r.aparate, { d130: 10, d150: 0, d650: 0, lvcan: 0 }) && eq(r.montaj, { qGps: 10, qLvCan: 0, qCanInc: 0, qFms: 0 }), JSON.stringify(r));
r = rec(100, 80, 20, 'lvcan');
T('100 (80 cu CAN, 20 camioane), CAN prin modul → 80 × FMC130 + 80 × LV-CAN200 + 20 × FMC650',
  eq(r.aparate, { d130: 80, d150: 0, d650: 20, lvcan: 80 }), JSON.stringify(r.aparate));
T('...montaj: 100 × GPS, 80 × LV-CAN, 20 × FMS', eq(r.montaj, { qGps: 100, qLvCan: 80, qCanInc: 0, qFms: 20 }), JSON.stringify(r.montaj));
T('...și la camioane: Modulul Tahograf + e-Transport de propus', r.tahograf === true && r.etransport === true);
r = rec(100, 80, 20, 'fmc150');
T('aceeași flotă, CAN integrat → 80 × FMC150, fără module LV-CAN, 80 × instalare CAN încorporat',
  eq(r.aparate, { d130: 0, d150: 80, d650: 20, lvcan: 0 }) && eq(r.montaj, { qGps: 100, qLvCan: 0, qCanInc: 80, qFms: 20 }), JSON.stringify(r));
r = rec(12, 5, 3, 'lvcan');
T('flotă amestecată (12: 5 cu CAN, 3 camioane, 4 simple) → 9 × FMC130, 5 × LV-CAN, 3 × FMC650', eq(r.aparate, { d130: 9, d150: 0, d650: 3, lvcan: 5 }) && r.nPlain === 4);
r = rec(5, 9, 9, 'lvcan');
T('cifre peste flotă se strâng la flotă (nu apar mașini inventate)', r.nCan === 5 && r.nFms === 0 && r.nPlain === 0 && r.montaj.qGps === 5);
T('fără camioane, nu propune tahograf', rec(10, 3, 0, 'lvcan').tahograf === false);

sect('2. Unde apar sfaturile');
T('pasul 2: locul sfaturilor, sub rândurile flotei', /row\('din care cu FMS', fVeh\('of-nfms', 0\)[^\n]*\n\s*\/\/[^\n]*\n\s*'<div id="of-sfat-flota" class="raof-sfat"/.test(html));
T('pasul 2: întrebările de pus clientului (7)', ((html.match(/<details class="raof-intrebari">[\s\S]*?<\/details>/) || [''])[0].match(/<li>/g) || []).length === 7);
T('pasul 4: recomandarea sus, înaintea rândurilor', /'<div id="of-sfat-montaj" class="raof-sfat"[^']*<\/div>' \+\s*\n\s*row\('Instalare dispozitiv GPS'/.test(html));
const carte4 = html.slice(html.indexOf('var montajCard = card('), html.indexOf('var deviceCard = card('));
T('pasul 4: sub fiecare rând de montaj, când se folosește (7 rânduri)', (carte4.match(/\n\s*cand\('/g) || []).length === 7);
T('sfaturile se redesenează la fiecare schimbare', /window\.raxOfRecalc = function \(\) \{[\s\S]{0,300}_ofSfatFlota\(\); _ofSfatMontaj\(\);/.test(html));
T('fiecare sfat spune că e doar pentru noi', (html.match(/doar pentru tine/g) || []).length >= 2);
T('la CAN se poate alege: FMC130 + LV-CAN200 sau FMC150', /seg\('lvcan', 'FMC130 \+ LV-CAN200'\) \+ seg\('fmc150', 'FMC150 \(CAN integrat\)'\)/.test(html));
T('la camioane se propun Tahograful (28 / 90 de zile) și e-Transport', /cardului șoferului la 28 de zile și a tahografului la 90/.test(html) && /<b>e-Transport<\/b>/.test(html));

sect('3. Butonul pune recomandarea — și doar el');
const aplica = html.slice(html.indexOf('window.raxOfAplicaRecomandarea = function'), html.indexOf('// ── sfârșit „recomandarea pentru flotă" ──'));
T('„Aplică" pune cantitățile la pașii 4 și 5', ['of-dq130', 'of-dq150', 'of-dq650', 'of-dqLvCan', 'of-qGps', 'of-qLvCan', 'of-qCanInc', 'of-qFms'].every((id) => aplica.indexOf("pune('" + id + "'") >= 0));
T('...și le ține minte ca „scrise de mână" (un număr de mașini schimbat după nu le calcă)', /_ofAtinse\[id\] = true;/.test(aplica));
T('...fără să atingă prețurile', !/of-dFmc|of-mGps|of-pPlain/.test(aplica));
// Alin, 28.09: „DA — oferta iese corectă din prima". Completarea automată folosește ACEEAȘI regulă (rulată aici).
const srcOf = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const completeaza = new Function('document', '_ofN', '_ofCanMod', '_ofAtinse', '_ofPropuneTarife',
  srcOf('function _ofRecomandare(', 'function _ofRecAcum(') + srcOf('function _ofPropune(id, val) {', '// Ce se propune, din câte vehicule')
  + srcOf('function _ofCompleteazaDinVehicule() {', 'window.raxOfVehiculeSchimbate = function') + '; return _ofCompleteazaDinVehicule;');
const umple = (nVeh, nCan, nFms, canMod) => {
  const f = { 'of-nveh': { value: String(nVeh) }, 'of-ncan': { value: String(nCan) }, 'of-nfms': { value: String(nFms) } };
  completeaza({ getElementById: (id) => f[id] || (f[id] = { value: '' }) }, (v) => { v = parseFloat(v); return Number.isFinite(v) ? v : 0; }, canMod, {}, () => {})();
  const v = (id) => Number(f[id].value || 0);
  return { d130: v('of-dq130'), d150: v('of-dq150'), d650: v('of-dq650'), lvcan: v('of-dqLvCan'), qGps: v('of-qGps'), qLvCan: v('of-qLvCan'), qCanInc: v('of-qCanInc'), qFms: v('of-qFms') };
};
T('completarea automată pune recomandarea: 100 (80 cu CAN, 20 camioane) → 80 × FMC130 + 80 × LV-CAN200 + 20 × FMC650',
  eq(umple(100, 80, 20, 'lvcan'), { d130: 80, d150: 0, d650: 20, lvcan: 80, qGps: 100, qLvCan: 80, qCanInc: 0, qFms: 20 }), JSON.stringify(umple(100, 80, 20, 'lvcan')));
T('...și cu comutatorul pe FMC150: 80 × FMC150, instalare CAN încorporat', eq(umple(100, 80, 20, 'fmc150'), { d130: 0, d150: 80, d650: 20, lvcan: 0, qGps: 100, qLvCan: 0, qCanInc: 80, qFms: 20 }));
T('comutatorul reface cantitățile neatinse', /window\.raxOfCanMod = function \(m\) \{[^\n]*_ofCompleteazaDinVehicule\(\);/.test(html));

sect('4. Nimic din sfaturi nu ajunge pe hârtia clientului');
const payload = html.slice(html.indexOf('function _ofPayload(r) {'), html.indexOf('async function _ofHartie('));
T('ce pleacă spre hârtie nu cuprinde sfaturile', payload.length > 200 && !/sfat|_ofRecomandare|intrebari|recomand/i.test(payload));
T('hârtia ofertei nu are cuvintele sfaturilor', !/Recomandarea pentru flota|doar pentru tine|Întrebări de pus clientului|Ce recomanzi/.test(rex));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
