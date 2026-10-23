// verify_soferi_masini.js — Capitolul 2, pasul 2, partea 1 („RA Insight face, cu Da-ul tău"; Alin, 21–22.10: „da" la flux,
// „da" la „Da"-ul nenumărat și de la Basic): ȘOFERII PE MAȘINI, după macheta din 21.10 (M1, M2, M4, M5).
//
// Ce păzește:
//   1. regula (soferi_masini.js, curată): ce permis cere fiecare mașină (categoria din fișă, masa maximă, locurile), ce acoperă
//      un permis (CE cuprinde B, C1 e acoperit de C…), valabilitatea, ce e de rezolvat, propunerile (cine e liber, cel scos de pe
//      o mașină merge pe alta „după ce iese", cine a mai fost trecut pe mașină), textele cartonașului și ale paginii, cererile
//      în cuvinte („Pune-l pe Mihai pe B 77 TIR"; „Pune-mi raportul…" NU e a ei), „Azi la tine" cu „Propunere";
//   2. pagina: ramura „Șoferi pe mașini" (de la Basic), cartonașul cu Da / Schimbă / Nu, „Gata" cu „Anulează", textele de la server;
//   3. serverul: calea ecranului (db.assignDevice cu grupa de acum), drepturile ecranului (requireEdit('vehicule')), de la Basic,
//      nenumărat, „Da" o singură dată, „Anulează" 10 minute, cererea de șoferi înaintea rapoartelor cerute în cuvinte;
//   4. pe server pornit (modelul simulat: orice cerere către el se numără — trebuie să rămână ZERO): tot drumul din machetă.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const SM = require('./soferi_masini');
const I = require('./insight');
const azi = require('./azi_la_tine');

let ok = 0, rele = 0;
function T(nume, cond, detalii) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detalii !== undefined ? '  → ' + String(detalii).slice(0, 500) : '')); }
}
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
const MOD = fs.readFileSync(path.join(__dirname, 'soferi_masini.js'), 'utf8');

// ─── 1. Regula ──────────────────────────────────────────────────────────────────────────────────────
console.log('1. Regula (soferi_masini.js)');
const cc = function (o) { return SM.categoriaCeruta(o).cod; };
T('ce cere mașina: Auto/Dubă → B, Camion → C, Automixt → C, TIR/Autotractor → CE, Autobuz → D, Motocicletă → A1',
  cc({ tip: 'Auto' }) === 'B' && cc({ tip: 'Duba' }) === 'B' && cc({ tip: 'Camion' }) === 'C' && cc({ tip: 'Automixt' }) === 'C' && cc({ tip: 'TIR' }) === 'CE' &&
  cc({ tip: 'Autotractor' }) === 'CE' && cc({ tip: 'Autobuz' }) === 'D' && cc({ tip: 'Motocicleta' }) === 'A1' && cc({ tip: 'van' }) === 'B' && cc({ tip: 'truck' }) === 'C');
T('…masa maximă din „Config Camion": dubă de 5.000 kg → C1, camion de 7.000 kg → C1, de 12.000 kg → C; autobuz cu 14 locuri → D1',
  cc({ tip: 'Duba', masaMax: 5000 }) === 'C1' && cc({ tip: 'Camion', masaMax: 7000 }) === 'C1' && cc({ tip: 'Camion', masaMax: 12000 }) === 'C' && cc({ tip: 'Autobuz', locuri: 14 }) === 'D1' && cc({ tip: 'Autobuz', locuri: 40 }) === 'D');
T('remorcile și grupul electrogen n-au șofer; utilajul și tractorul n-au o categorie anume; fără categorie în fișă = de completat',
  SM.categoriaCeruta({ tip: 'Remorca' }).faraSofer && SM.categoriaCeruta({ tip: 'Remorcă tehnologică' }).faraSofer && SM.categoriaCeruta({ tip: 'Grup electrogen' }).faraSofer &&
  SM.categoriaCeruta({ tip: 'Utilaj' }).necunoscut && SM.categoriaCeruta({ tip: 'Tractor' }).necunoscut && SM.categoriaCeruta({ tip: '' }).tipLipsa && SM.categoriaCeruta({ tip: 'Altul' }).tipLipsa);
T('ce acoperă un permis: CE cuprinde B și C, C cuprinde C1, D cuprinde D1, A2 cuprinde A1; B nu cuprinde C, A nu cuprinde B',
  SM.acopera('CE', 'B') && SM.acopera('B,C,CE', 'C') && SM.acopera('C', 'C1') && SM.acopera('D', 'D1') && SM.acopera('A2', 'A1') && !SM.acopera('B', 'C') && !SM.acopera('A', 'B') && !SM.acopera('C', 'CE') && !SM.acopera('', 'B'));
const acum = Date.parse('2026-10-21T07:42:00Z');
const zi = function (s) { return new Date(s + 'T00:00:00Z'); };
const vB = SM.categoriaCeruta({ tip: 'Auto' }), vCE = SM.categoriaCeruta({ tip: 'Autotractor' });
T('permisul față de mașină: expirat (roșu), nepotrivit (portocaliu), bun cu data, expiră curând (portocaliu), categoriile lipsă',
  SM.verdict({ categorii: 'B', expira: zi('2026-10-02') }, vB, acum).text === 'permis expirat pe 02.10' && SM.verdict({ categorii: 'B', expira: zi('2026-10-02') }, vB, acum).nivel === 'r' &&
  SM.verdict({ categorii: 'B', expira: zi('2029-06-09') }, vCE, acum).text === 'are doar permis B' &&
  SM.verdict({ categorii: 'B,C,CE', expira: zi('2031-03-14') }, vCE, acum).text === 'permis CE valabil până pe 14.03.2031' &&
  SM.verdict({ categorii: 'B', expira: zi('2026-11-05') }, vB, acum).nivel === 'w' && /expiră pe 05\.11 \(peste 15 zile\)/.test(SM.verdict({ categorii: 'B', expira: zi('2026-11-05') }, vB, acum).text) &&
  SM.verdict({ categorii: '', expira: null }, vB, acum).stare === 'fara_categorii',
  [SM.verdict({ categorii: 'B', expira: zi('2026-11-05') }, vB, acum).text].join(' | '));

// Exemplul din machetă (Transport Ionescu SRL, contul Anei Pop).
const soferi = [
  { id: 1, nume: 'Elena Marin', categorii: 'B', expira: zi('2030-11-22'), masini: ['A1'] },
  { id: 2, nume: 'Andrei Pop', categorii: 'B', expira: zi('2026-10-02'), masini: ['A3'] },
  { id: 3, nume: 'Ion Popescu', categorii: 'B', expira: zi('2029-06-09'), masini: ['A4'] },
  { id: 4, nume: 'Mihai Ionescu', categorii: 'B,C,CE', expira: zi('2031-03-14'), masini: [] }];
const masini = [
  { imei: 'A1', nr: 'B 154 UIP', nume: 'Dacia Logan 3', tip: 'Auto', soferId: 1 },
  { imei: 'A2', nr: 'B 268 ROY', nume: 'VW Caddy', tip: 'Duba', soferId: null },
  { imei: 'A3', nr: 'B 112 RFG', nume: 'VW Passat', tip: 'Auto', soferId: 2 },
  { imei: 'A4', nr: 'B 77 TIR', nume: 'MAN TGX', tip: 'Autotractor', soferId: 3, grupa: 'Camioane' },
  { imei: 'A5', nr: 'TM 01 REM', nume: 'Semiremorcă', tip: 'Remorca', soferId: null },
  { imei: 'A6', nr: 'B 99 UTL', nume: 'Excavator', tip: 'Buldoexcavator', soferId: null }];
const istoric = [
  { imei: 'A2', driver_id: 3, de_la: 0, pana_la: Date.parse('2026-09-20T10:00:00Z') },
  { imei: 'A2', driver_id: 9, de_la: Date.parse('2026-09-20T10:00:00Z'), pana_la: acum - 5 * 86400000 - 3600000 },
  { imei: 'A4', driver_id: 3, de_la: Date.parse('2026-09-20T10:00:00Z'), pana_la: null }];
const an = SM.analiza({ masini: masini, soferi: soferi, istoric: istoric, acum: acum });
T('cartonașele de sus, ca pe machetă: 3 de rezolvat (un permis nepotrivit, unul expirat, o mașină fără șofer), 1 în regulă, 1 liber',
  an.rezumat.deRezolvat === 3 && an.rezumat.deRezolvatText === 'un permis nepotrivit, unul expirat, o mașină fără șofer' && an.rezumat.inRegula === 1 &&
  an.rezumat.inRegulaText === 'B 154 UIP · Elena Marin' && an.rezumat.liberi === 1 && an.rezumat.liberiText === 'Mihai Ionescu · B, C, CE', JSON.stringify(an.rezumat));
T('remorca și utilajul fără șofer nu sunt „de rezolvat"; mașinile: „MAN TGX · autotractor, cere CE", „fără șofer de 5 zile"',
  !an.masini.some(function (m) { return m.imei === 'A5' || m.imei === 'A6'; }) && an.masini.filter(function (m) { return m.imei === 'A4'; })[0].descriere === 'MAN TGX · autotractor, cere CE' &&
  an.masini.filter(function (m) { return m.imei === 'A2'; })[0].text === 'fără șofer de 5 zile');
const pr = an.propuneri.map(function (p) { return p.imei + ':' + (p.la == null ? 'scoate' : p.laNume) + (p.dupaNr ? '<' + p.dupaNr : ''); }).join(' | ');
T('propunerile, în ordinea machetei: Mihai pe B 77 TIR (CE e cel mai greu de găsit), Ion pe B 268 ROY „după ce iese de pe B 77 TIR", Andrei scos de pe B 112 RFG',
  pr === 'A4:Mihai Ionescu | A2:Ion Popescu<B 77 TIR | A3:scoate', pr);
T('…de ce: „permis CE valabil până pe 14.03.2031 · nu e pe altă mașină", „… · a mai fost trecut pe ea în septembrie", „nu e alt șofer liber cu permis B valabil"',
  an.propuneri[0].deCe === 'permis CE valabil până pe 14.03.2031 · nu e pe altă mașină' && an.propuneri[1].deCe === 'permis B valabil până pe 09.06.2029 · a mai fost trecut pe ea în septembrie' &&
  an.propuneri[2].deCe === 'nu e alt șofer liber cu permis B valabil', an.propuneri.map(function (p) { return p.deCe; }).join(' | '));
const o0 = { soferi: soferi, acum: acum, cine: 'Ana Pop', poate: true };
const c1 = SM.propunerePereche(an, Object.assign({ imei: 'A4', soferId: 4 }, o0));
const dv = c1.card ? c1.card.dovezi.map(function (d) { return d.nivel + ' ' + d.text; }) : [];
T('cartonașul „Trec șoferul pe B 77 TIR" (M1): Ion Popescu → Mihai Ionescu, trei dovezi, ce nu se schimbă, calea și jurnalul, „Da, trece-l"',
  c1.ok && c1.card.titlu === 'Trec șoferul pe B 77 TIR' && c1.card.masina.nr === 'B 77 TIR' && c1.card.masina.rest === 'MAN TGX · autotractor' && c1.card.sofer.de === 'Ion Popescu' && c1.card.sofer.la === 'Mihai Ionescu' &&
  dv[0] === 'ok Mihai Ionescu are permis CE, valabil până pe 14.03.2031. Autotractorul cere CE.' && dv[1] === 'ok Mihai Ionescu nu e trecut acum pe nicio altă mașină.' &&
  dv[2] === 'w Ion Popescu rămâne fără mașină. Are doar permis B, deci nu poate conduce autotractorul.' &&
  c1.card.nuSeSchimba === 'Nu se schimbă: grupa mașinii (Camioane), alertele și rapoartele programate.' &&
  c1.card.sub === 'Se face exact ca din Vehicule › fișa mașinii › Șofer, cu drepturile tale. În jurnal: „Ana Pop, prin RA Insight”. Se poate anula 10 minute.' &&
  c1.card.butonDa === 'Da, trece-l' && c1.card.deCand === 'din clipa în care apeși Da' && JSON.stringify(c1.card.schimbari) === '[{"imei":"A4","deLa":3,"la":4}]', JSON.stringify(c1.card).slice(0, 400));
const c2 = SM.propunerePereche(an, Object.assign({ imei: 'A4', soferId: 1 }, o0));
T('un permis care nu acoperă mașina nu primește cartonaș: spune de ce și propune șoferii liberi potriviți, ca butoane',
  !c2.ok && /n-are|doar permis B/.test(c2.text) && /cere CE/.test(c2.text) && /Mihai Ionescu/.test(c2.text) && c2.alege.length === 1 && c2.alege[0].trimite === 'Pune-l pe Mihai Ionescu pe B 77 TIR', c2.text);
T('…nici un permis expirat, nici șoferul care e deja pe mașină', !SM.propunerePereche(an, Object.assign({ imei: 'A1', soferId: 2 }, o0)).ok && /a expirat pe 02\.10/.test(SM.propunerePereche(an, Object.assign({ imei: 'A1', soferId: 2 }, o0)).text) &&
  /e deja trecut/.test(SM.propunerePereche(an, Object.assign({ imei: 'A4', soferId: 3 }, o0)).text));
const c3 = SM.propunerePentru(an, Object.assign({ imei: 'A2' }, o0));
T('„Propune un șofer pentru B 268 ROY" cât Ion e încă pe TIR: îl MUTĂ pe față (TIR-ul rămâne fără șofer), nu-l pune pe două mașini',
  c3.ok && c3.card.sofer.la === 'Ion Popescu' && JSON.stringify(c3.card.schimbari) === '[{"imei":"A4","deLa":3,"la":null},{"imei":"A2","deLa":null,"la":3}]' &&
  c3.card.dovezi.some(function (d) { return d.nivel === 'w' && /e trecut acum pe B 77 TIR: îl mut de acolo/.test(d.text); }), JSON.stringify(c3.card && c3.card.dovezi));
const c4 = SM.propunerePentru(an, Object.assign({ imei: 'A3' }, o0));
T('…pentru B 112 RFG (permis expirat, niciun alt șofer liber): „Scot șoferul", „Da, scoate-l"', c4.ok && c4.card.titlu === 'Scot șoferul de pe B 112 RFG' && c4.card.butonDa === 'Da, scoate-l' && c4.card.sofer.la === null && c4.card.schimbari[0].la === null);
T('…o mașină în regulă nu primește cartonaș', !SM.propunerePentru(an, Object.assign({ imei: 'A1' }, o0)).ok && /e în regulă: Elena Marin, permis B valabil până pe 22\.11\.2030/.test(SM.propunerePentru(an, Object.assign({ imei: 'A1' }, o0)).text));
const sofNev = soferi.map(function (s) { return s.id === 4 ? Object.assign({}, s, { masini: ['Z9'] }) : s; });
const anNev = SM.analiza({ masini: masini, soferi: sofNev, istoric: [], acum: acum });
const pNev = SM.propunerePereche(anNev, Object.assign({ imei: 'A4', soferId: 4 }, o0, { soferi: sofNev }));
T('un șofer trecut pe o mașină pe care omul n-o vede nu se mută din discuție (o face cine vede mașina aceea)', !pNev.ok && /la care n-ai acces/.test(pNev.text), JSON.stringify(pNev).slice(0, 200));
const anUtl = SM.analiza({ masini: [{ imei: 'U1', nr: 'B 9 UTL', nume: 'Excavator', tip: 'Buldoexcavator', soferId: 2 }], soferi: soferi, istoric: [], acum: acum });
T('permisul expirat pe un utilaj (fără categorie anume): tot „Îl scot", nu rămâne pe dinafară', anUtl.deRezolvat.length === 1 && anUtl.propuneri.length === 1 && anUtl.propuneri[0].scoate === true && anUtl.propuneri[0].imei === 'U1', JSON.stringify(anUtl.propuneri));
T('o trecere mai scurtă de o oră (o greșeală îndreptată, un „Anulează") nu e „a mai fost trecut pe ea"',
  !/a mai fost trecut/.test(SM.analiza({ masini: masini, soferi: soferi, istoric: [{ imei: 'A4', driver_id: 4, de_la: acum - 3600000 * 3, pana_la: acum - 3600000 * 3 + 60000 }].concat(istoric), acum: acum }).propuneri[0].deCe) &&
  /a mai fost trecut pe ea/.test(SM.analiza({ masini: masini, soferi: soferi, istoric: [{ imei: 'A4', driver_id: 4, de_la: acum - 3600000 * 30, pana_la: acum - 3600000 * 3 }].concat(istoric), acum: acum }).propuneri[0].deCe));
T('fără dreptul de a schimba vehiculele: cartonașul spune cine aprobă, iar „Da" e oprit', SM.propunerePereche(an, Object.assign({ imei: 'A4', soferId: 4 }, o0, { poate: false, aproba: 'administratorul firmei, Ana Pop' })).card.sub === 'Doar cine poate schimba vehiculele apasă „Da": administratorul firmei, Ana Pop.' &&
  SM.propunerePereche(an, Object.assign({ imei: 'A4', soferId: 4 }, o0, { poate: false })).card.poate === false);
// După „Da" pe B 77 TIR: Ion e liber, iar B 268 ROY îl așteaptă (M2).
const dupa = SM.analiza({ masini: masini.map(function (m) { return m.imei === 'A4' ? Object.assign({}, m, { soferId: 4 }) : m; }),
  soferi: soferi.map(function (s) { return s.id === 3 ? Object.assign({}, s, { masini: [] }) : (s.id === 4 ? Object.assign({}, s, { masini: ['A4'] }) : s); }), istoric: istoric, acum: acum });
const u = SM.pasulUrmator(dupa, 3);
T('pasul următor (M2): „Ion Popescu a rămas fără mașină, iar B 268 ROY n-are șofer de 5 zile… Îți pregătesc și schimbarea asta?" + două continuări',
  u && u.text === 'Ion Popescu a rămas fără mașină, iar **B 268 ROY** n-are șofer de 5 zile. Ion Popescu are permis B valabil până pe 09.06.2029 și a mai fost trecut pe ea în septembrie. Îți pregătesc și schimbarea asta?' &&
  u.urmari.map(function (x) { return x.trimite; }).join(' | ') === 'Pune-l pe Ion Popescu pe B 268 ROY | Arată-mi potrivirea șoferilor pe toate mașinile', u && u.text);
const g = SM.gata(c1.card, 'Ana Pop', Date.parse('2026-10-21T07:42:00Z'));
T('„Gata. Mihai Ionescu e pe B 77 TIR de azi, 10:42." + rândul jurnalului și istoricul mașinii (ora României)',
  g.text === 'Gata. **Mihai Ionescu** e pe **B 77 TIR** de azi, 10:42.' && g.jurnal === 'În jurnal: „Ana Pop, prin RA Insight: șoferul Mihai Ionescu pe B 77 TIR” · 21.10.2026, 10:42. În istoricul mașinii: Ion Popescu până azi la 10:42, Mihai Ionescu de atunci.', g.jurnal);
// Cererile în cuvinte
const fisa = I.fisaFlotei([{ imei: 'A1', plate: 'B 154 UIP', name: 'Dacia Logan 3', driver_id: 1 }, { imei: 'A2', plate: 'B 268 ROY', name: 'VW Caddy' }, { imei: 'A3', plate: 'B 112 RFG', name: 'VW Passat', driver_id: 2 }, { imei: 'A4', plate: 'B 77 TIR', name: 'MAN TGX', driver_id: 3 }],
  { 1: 'Elena Marin', 2: 'Andrei Pop', 3: 'Ion Popescu', 4: 'Mihai Ionescu' });
const lista = soferi.concat([{ id: 5, nume: 'Ion Marin' }]);
const ce = function (t) { const r = SM.cerere(t, lista, fisa); return r ? r.fel + ':' + (r.imei || '') + ':' + (r.soferId || '') + (r.ambigui ? ':' + r.ambigui.map(function (s) { return s.nume; }).join('/') : '') + (r.lipsa ? ':lipsa' : '') : 'nu'; };
T('„Pune-l pe Mihai Ionescu pe camionul B 77 TIR." și „Pune-l pe Mihai pe B 77 TIR" → perechea (șoferul nu e luat drept mașina lui)', ce('Pune-l pe Mihai Ionescu pe camionul B 77 TIR.') === 'pereche:A4:4' && ce('Pune-l pe Mihai pe B 77 TIR') === 'pereche:A4:4');
T('doi „Ion" în firmă: îndoiala se lămurește cu butoane, nu pe ghicite', ce('Trece-l pe Ion pe B 268 ROY') === 'pereche:A2::Ion Popescu/Ion Marin');
T('„Propune un șofer pentru…", „pe cine pun pe Passat?", „Scoate-l pe Andrei Pop de pe B 112 RFG", „Arată-mi potrivirea șoferilor", „Schimbă șoferul de pe… cu…"',
  ce('Propune un șofer pentru B 268 ROY') === 'pentru:A2:' && ce('pe cine pun pe Passat?') === 'pentru:A3:' && ce('Scoate-l pe Andrei Pop de pe B 112 RFG') === 'scoate:A3:2' &&
  ce('Arată-mi potrivirea șoferilor pe toate mașinile') === 'pagina::' && ce('Schimbă șoferul de pe B 77 TIR cu Mihai Ionescu') === 'pereche:A4:4' && ce('Pune-l pe Mihai Ionescu') === 'pereche::4:lipsa');
T('întrebările și cererile de raport NU sunt ale ei: „Pune-mi raportul de consum…", „Cine l-a trecut pe Mihai…", „Câți km…"',
  ce('Pune-mi raportul de consum pentru B 154 UIP') === 'nu' && ce('Cine l-a trecut pe Mihai pe B 77 TIR?') === 'nu' && ce('Câți km a făcut B 77 TIR ieri?') === 'nu' && !SM.pareCerere('Câți km a făcut B 77 TIR ieri?'));
T('un „da" scris se recunoaște (aduce din nou cartonașul, nu schimbă nimic)', SM.eDaScris('da') && SM.eDaScris('Da, trece-l!') && SM.eDaScris('ok') && !SM.eDaScris('da, dar pe alt camion'));
// „Azi la tine" (M5)
const az = azi.randuri({ agenti: ['watch'], soferi: [
  { imei: 'A3', nr: 'B 112 RFG', stare: 'expirat', text: 'permis expirat pe 02.10', sofer: 'Andrei Pop', ceruta: 'B' },
  { imei: 'A4', nr: 'B 77 TIR', stare: 'nepotrivit', text: 'are doar permis B', sofer: 'Ion Popescu', ceruta: 'CE' },
  { imei: 'A2', nr: 'B 268 ROY', stare: 'fara', zileFara: 5 }] });
T('„Azi la tine" (M5): permisul expirat (roșu), cel nepotrivit, mașina fără șofer — fiecare cu „Propunere", chiar cu agenții opriți',
  az.randuri.map(function (r) { return r.nivel + ' ' + r.text; }).join(' | ') === 'r **B 112 RFG**: permisul lui Andrei Pop a expirat pe 02.10. | w **B 77 TIR** e trecut pe Ion Popescu, care n-are permis CE. | w **B 268 ROY** n-are șofer de 5 zile.' &&
  az.randuri.every(function (r) { return r.agent === 'insight' && r.butoane[0].fel === 'propunere' && /^Propune un șofer pentru /.test(r.butoane[0].trimite); }) && az.deVazut === 3,
  az.randuri.map(function (r) { return r.nivel + ' ' + r.text; }).join(' | '));
const az2 = azi.randuri({ agenti: [], soferi: [{ imei: 'X', nr: 'B 1 A', stare: 'nepotrivit', sofer: 'A', ceruta: 'C' }, { imei: 'Y', nr: 'B 2 A', stare: 'nepotrivit', sofer: 'B', ceruta: 'C' }] });
T('…mai multe de același fel = un rând strâns, spre pagina „Șoferi pe mașini"', az2.randuri.length === 1 && az2.randuri[0].butoane[0].fel === 'pagina' && az2.randuri[0].butoane[0].ramura === 'soferi' && /2 mașini au șoferi fără permisul cerut/.test(az2.randuri[0].text), JSON.stringify(az2.randuri));
T('soferi_masini.js e curat: fără bază, fără rețea, fără model, fără caractere de control; categoriile vin din license_cats.js',
  !/require\(['"]\.\/(db|ai|server|channels|mailer)['"]\)|require\(['"](pg|http|https|node-fetch)['"]\)|fetch\(/.test(MOD) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(MOD) && /require\('\.\/license_cats'\)/.test(MOD));
T('„Anulează" ține 10 minute; o propunere neapăsată, o zi', SM.ANULARE_MIN === 10 && SM.PROPUNERE_ORE === 24);

// ─── 2. Pagina ──────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. Pagina: ramura, cartonașul, „Gata" cu „Anulează"');
T('„Șoferi pe mașini" e o pagină din „Pagini", de la Basic (pe Start apare încuiată), cu iconița din machetă',
  /\{ k: 'soferi', et: 'Șoferi pe mașini', ic: 'fa-people-arrows', gata: true, pachet: true \}/.test(PAG) && /if \(S\.ramura === 'soferi'\) return deseneazaSoferi\(main\);/.test(PAG));
T('cartonașul se desenează din ce dă serverul, ca text (și îngroșatul din „Gata", prin textGros, fără HTML), cu Da / Schimbă / Nu; „Da" oprit fără drept',
  /function cartonasPropunere\(p, gata\)/.test(PAG) && /if \(!p\.poate\) \{ bDa\.disabled = true;/.test(PAG) && /butonProp\('Schimbă', 'fa-pen'\)/.test(PAG) && /butonProp\('Nu', 'fa-xmark'\)/.test(PAG) &&
  /if \(x\.propunere && x\.propunere\.id\) bub\.appendChild\(cartonasPropunere\(x\.propunere,/.test(PAG) &&
  /tt\.appendChild\(textGros\(el\('span'\), p\.gata\.text\)\);/.test(PAG) && /function textGros\(nod, t\) \{\n\s+String\(t \|\| ''\)\.split\('\*\*'\)\.forEach\(function \(bucata, i\) \{ if \(bucata\) nod\.appendChild\(i % 2 \? el\('b', null, bucata\) : document\.createTextNode\(bucata\)\); \}\);/.test(PAG) &&
  PAG.indexOf('mdScurt(p.gata') < 0);
T('fiecare apăsare are O cerere: Da, Nu, Anulează, Aplică', (PAG.match(/'\/api\/insight\/actiuni\/' \+ encodeURIComponent\(p\.id\) \+ '\/aplica'/g) || []).length === 1 &&
  (PAG.match(/\/refuza'/g) || []).length === 1 && (PAG.match(/\/anuleaza'\)/g) || []).length === 1 && (PAG.match(/'\/api\/insight\/soferi-masini\/aplica'/g) || []).length === 1);
T('ceasul lui „Anulează" pornește de la serverul (`ramasMs`), nu de la ceasul calculatorului', /function ceasAnulare\(btn, ramasMs\)/.test(PAG) && /ceasAnulare\(bAn, p\.ramasMs\)/.test(PAG) && /ceasAnulare\(bAn, dupa\.ramasMs\)/.test(PAG));
T('bifele din pagină: schimbarea care folosește un șofer scos de pe altă mașină merge doar împreună cu aceea', /if \(!b\.p\.dupa\) return;/.test(PAG) && /var poate = !!bifate\[b\.p\.dupa\];/.test(PAG));
T('„Propunere ›" pe rândurile din „Azi la tine"; rândul strâns deschide pagina', /b\.fel === 'propunere'\) \{ var pp = el\('span', 'azi-prop', b\.text\)/.test(PAG) && /if \(b\.fel === 'acte' \|\| b\.fel === 'pagina'\)/.test(PAG));
T('culorile noi au pereche pe tema închisă', ['.chat-prop {', '.chat-prop-h .ic', '.chat-prop-dov .ok i', '.chat-gata {', '.chat-gata-t > i', '.azi-prop {', '.ssm-s.w'].every(function (s) { return CSS.indexOf(s) >= 0; }) &&
  /body\.dark \.chat-prop \{/.test(CSS) && /body\.dark \.chat-prop-h \.ic/.test(CSS) && /body\.dark \.chat-prop-dov \.ok i/.test(CSS) && /body\.dark \.chat-gata \{/.test(CSS) && /body\.dark \.azi-prop/.test(CSS) && /body\.dark \.ssm-s\.w/.test(CSS));

// ─── 3. Serverul ────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Serverul: calea ecranului, drepturile, de la Basic, nenumărat');
T('schimbarea merge pe calea ecranului: db.assignDevice cu grupa de ACUM a mașinii (altfel i-ar șterge grupa)', /await db\.assignDevice\(s\.imei, la, d\.group_id\);/.test(SRV) && (SRV.match(/db\.assignDevice\(/g) || []).length === 2);
T('…verificată pe starea de acum: șoferul de acum = cel din propunere, șoferul nou din firma mașinii, nepus pe altă mașină', /if \(acum !== deLa\)/.test(SRV) && /await db\.soferAlFirmei\(la, d\.company_id\)/.test(SRV) && /await db\.masiniSofer\(la, d\.company_id\)/.test(SRV));
T('…în jurnal „prin RA Insight"', /prin: 'RA Insight', actiune: x\.actiuneId \|\| null/.test(SRV));
T('drepturile ecranului: „Da", „Aplică" și „Anulează" cer requireEdit(\'vehicule\'); toate, de la Basic (requireRamuri); „Nu" nu schimbă nimic',
  /app\.post\('\/api\/insight\/actiuni\/:id\/aplica', requireAuth, requireEdit\('vehicule'\), withScope, requireFeature\('ai_assistant'\), requireAiSeat, requireRamuri,/.test(SRV) &&
  /app\.post\('\/api\/insight\/actiuni\/:id\/anuleaza', requireAuth, requireEdit\('vehicule'\), withScope, requireFeature\('ai_assistant'\), requireAiSeat, requireRamuri,/.test(SRV) &&
  /app\.post\('\/api\/insight\/soferi-masini\/aplica', requireAuth, requireEdit\('vehicule'\), withScope, requireFeature\('ai_assistant'\), requireAiSeat, requireRamuri,/.test(SRV) &&
  /app\.get\('\/api\/insight\/soferi-masini', requireAuth, withScope, requireFeature\('ai_assistant'\), requireAiSeat, requireRamuri,/.test(SRV));
T('„Da" o singură dată: propunerea trece mai departe doar dacă e încă „propusă" (două apăsări deodată = una)', /const prins = await db\.treceActiuneInsight\(a\.id, userId, 'propusa', \{ stare: 'aplicata', aplicatLa: Date\.now\(\) \}\);/.test(SRV) && /WHERE id = \$1 AND user_id = \$2 AND stare = \$3 RETURNING \*/.test(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8')));
T('cererea de șoferi: în RA Insight, înaintea rapoartelor cerute în cuvinte, o singură dată; fără model și fără numărătoare',
  (SRV.match(/await _insightSoferi\(req, res, /g) || []).length === 1 && SRV.indexOf('await _insightSoferi(req, res, ') < SRV.indexOf('await _insightComanda(req, res, ') &&
  !/async function _insightSoferi[\s\S]*?(_numaraRaspunsReguli|callClaude|runAgent)[\s\S]*?\napp\.get\('\/api\/insight\/soferi-masini'/.test(SRV));
T('propunerile sunt ale omului (user_id în WHERE) și nu intră în copii; se șterg la 12 luni, ca discuțiile', /insight_actiuni:/.test(fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8')) && /db\.stergeActiuniInsightMaiVechiDe\(luni\)/.test(SRV));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3361, TCP = 5361;
const DIR = path.join(os.tmpdir(), 'rax_soferi_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, String((opts && opts.body) || '').slice(0, 200) + '\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_soferi', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, pw) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cine) h.Cookie = cine;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text };
}
const nModel = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;
const ziIso = (zile) => new Date(Date.now() + zile * 86400000).toISOString().slice(0, 10);

(async () => {
  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n4. Pe server pornit (modelul simulat: orice cerere către el se numără; trebuie să rămână ZERO)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const PAROLA = 'Str4da-Verde-2026';
  async function om(username, fullName, role, companyId) {
    const r = await json('POST', '/api/users', S, { username, full_name: fullName, role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
  }
  // Transport Ionescu SRL, pe Basic — exact flota din machetă.
  const co = (await json('POST', '/api/companies', S, { name: 'Transport Ionescu SRL' })).j;
  await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
  const MAS = [['350000000081001', 'Dacia Logan 3', 'B 154 UIP', 'Auto'], ['350000000081002', 'VW Caddy', 'B 268 ROY', 'Duba'],
    ['350000000081003', 'VW Passat', 'B 112 RFG', 'Auto'], ['350000000081004', 'MAN TGX', 'B 77 TIR', 'Autotractor'], ['350000000081005', 'Semiremorcă', 'TM 01 REM', 'Remorca']];
  await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
  for (const m of MAS) { await json('PUT', '/api/devices/' + m[0] + '/company', S, { company_id: co.id }); await json('PUT', '/api/devices/' + m[0] + '/details', S, { name: m[1], plate: m[2], vehicle_type: m[3] }); }
  const grupa = (await json('POST', '/api/groups', S, { name: 'Camioane', company_id: co.id })).j;
  const sofer = async (name, cats, exp) => (await json('POST', '/api/drivers', S, { name, license_categories: cats, license_expiry: exp, company_id: co.id })).j;
  const elena = await sofer('Elena Marin', 'B', '2030-11-22'), andrei = await sofer('Andrei Pop', 'B', ziIso(-19)), ion = await sofer('Ion Popescu', 'B', '2029-06-09'), mihai = await sofer('Mihai Ionescu', 'B,C,CE', '2031-03-14');
  const pune = (i, d, g) => json('PUT', '/api/devices/' + MAS[i][0] + '/assign', S, { driver_id: d, group_id: g || null });
  await pune(0, elena.id); await pune(2, andrei.id);
  await pune(1, ion.id); await pune(1, null);          // Ion a mai fost trecut pe B 268 ROY (istoricul), apoi a rămas fără șofer
  await pune(3, ion.id, grupa.id);                      // …iar acum e pe TIR, care cere CE
  const ana = await om('ana.pop@ionescu.ro', 'Ana Pop', 'company_admin', co.id);
  const dan = await om('dan@ionescu.ro', 'Dan Dispecer', 'dispatcher', co.id);
  await json('PUT', '/api/users/' + ana.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/ai-seat', S, { on: true });
  await json('PUT', '/api/users/' + dan.id + '/access', S, { devices: MAS.map((m) => m[0]), groups: [] });   // dispecerul vede mașinile firmei
  T('pregătire: firma pe Basic, cinci mașini (una e semiremorcă), patru șoferi, administratorul și dispecerul cu RA Insight', !!(co.id && grupa.id && mihai.id && ana.ck && dan.ck));
  const masina = async (i) => { const l = (await json('GET', '/api/devices', ana.ck)).j; const d = (Array.isArray(l) ? l : []).filter((x) => x.imei === MAS[i][0])[0] || {}; return { sofer: d.driver_id == null ? null : Number(d.driver_id), grupa: d.group_id == null ? null : Number(d.group_id) }; };
  const q0 = (await json('GET', '/api/ai/quota', ana.ck)).j;

  // a) pagina „Șoferi pe mașini" (M4)
  const p0 = await json('GET', '/api/insight/soferi-masini', ana.ck);
  T('pagina: 3 de rezolvat (un permis nepotrivit, unul expirat, o mașină fără șofer), 1 în regulă, Mihai liber; semiremorca lipsește',
    p0.status === 200 && p0.j.rezumat.deRezolvat === 3 && p0.j.rezumat.deRezolvatText === 'un permis nepotrivit, unul expirat, o mașină fără șofer' && p0.j.rezumat.inRegula === 1 &&
    p0.j.rezumat.liberiText === 'Mihai Ionescu · B, C, CE' && !JSON.stringify(p0.j).includes('TM 01 REM') && p0.j.poate === true, p0.status + ' ' + JSON.stringify(p0.j.rezumat));
  T('…ce propun, în ordinea machetei, cu „după ce iese de pe B 77 TIR"', (p0.j.propuneri || []).map((p) => p.nr + ':' + p.propun.nume + (p.propun.sub ? ' (' + p.propun.sub + ')' : '')).join(' | ') ===
    'B 77 TIR:Mihai Ionescu | B 268 ROY:Ion Popescu (după ce iese de pe B 77 TIR) | B 112 RFG:Îl scot de pe mașină (până trece permisul nou în fișă)', (p0.j.propuneri || []).map((p) => p.nr + ':' + p.propun.nume).join(' | '));
  const nr0 = await json('GET', '/api/insight/ramuri', ana.ck);
  T('numărul de lângă pagină: 3', nr0.j.soferi === 3, JSON.stringify(nr0.j));

  // b) discuția (M1): cererea scrisă → cartonașul
  const r1 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune-l pe Mihai Ionescu pe camionul B 77 TIR.', nou: true });
  const pc = r1.j.propunere || {};
  T('„Pune-l pe Mihai Ionescu pe camionul B 77 TIR." → cartonașul, pe reguli, insigna „INSTANT · propunere"', r1.status === 200 && r1.j.source === 'reguli' && pc.id > 0 && pc.stare === 'propusa' && pc.titlu === 'Trec șoferul pe B 77 TIR' &&
    pc.sofer.de === 'Ion Popescu' && pc.sofer.la === 'Mihai Ionescu' && r1.j.reply === 'Pot face asta. Uite ce se schimbă — apeși **Da** și o fac.' && r1.j.insigna && r1.j.insigna.detaliu === 'propunere' && r1.j.insigna.eticheta === 'Instant', r1.text.slice(0, 400));
  T('…„În jurnal: «Ana Pop, prin RA Insight»", „Nu se schimbă: grupa mașinii (Camioane)…", fără `schimbari` trimise paginii', /„Ana Pop, prin RA Insight”/.test(pc.sub || '') && pc.nuSeSchimba === 'Nu se schimbă: grupa mașinii (Camioane), alertele și rapoartele programate.' && pc.schimbari === undefined, pc.sub);
  T('…și nimic nu s-a schimbat încă: Ion e tot pe TIR', (await masina(3)).sofer === ion.id);
  const cid = r1.j.conversatieId;
  const rDa = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'da', conversatieId: cid });
  T('un „da" scris aduce din nou ACELAȘI cartonaș, cu butonul — nu schimbă nimic', rDa.status === 200 && (rDa.j.propunere || {}).id === pc.id && /Apasă \*\*Da, trece-l\*\*/.test(rDa.j.reply || '') && (await masina(3)).sofer === ion.id, rDa.text.slice(0, 200));
  // dispecerul (fără dreptul de a schimba vehiculele)
  const rD = await json('POST', '/api/insight/intreaba', dan.ck, { message: 'Pune-l pe Mihai Ionescu pe B 77 TIR', nou: true });
  T('dispecerul vede propunerea, dar „Da" e oprit și află cine aprobă (Ana Pop)', rD.status === 200 && (rD.j.propunere || {}).poate === false && /Doar cine poate schimba vehiculele apasă „Da": administratorul firmei, Ana Pop\./.test((rD.j.propunere || {}).sub || ''), JSON.stringify(rD.j.propunere || {}).slice(0, 300));
  T('…iar dacă apasă totuși, serverul refuză (403), ca pe ecran', (await json('POST', '/api/insight/actiuni/' + rD.j.propunere.id + '/aplica', dan.ck, {})).status === 403);
  T('…propunerea altcuiva nu există pentru el (404)', (await json('POST', '/api/insight/actiuni/' + pc.id + '/refuza', dan.ck)).status === 404);
  // „Da"
  const a1 = await json('POST', '/api/insight/actiuni/' + pc.id + '/aplica', ana.ck, {});
  const m3 = await masina(3);
  T('„Da": Mihai e pe B 77 TIR, iar grupa „Camioane" a rămas (calea fișei mașinii)', a1.status === 200 && m3.sofer === mihai.id && m3.grupa === grupa.id, a1.status + ' ' + a1.text.slice(0, 300));
  T('…„Gata. Mihai Ionescu e pe B 77 TIR de azi, …" + „Anulează" cu aproape 10 minute', /^Gata\. \*\*Mihai Ionescu\*\* e pe \*\*B 77 TIR\*\* de azi, \d{2}:\d{2}\.$/.test(((a1.j.propunere || {}).gata || {}).text || '') && a1.j.propunere.stare === 'aplicata' &&
    a1.j.propunere.ramasMs > 9 * 60000 && a1.j.propunere.ramasMs <= 10 * 60000 && /^Ai apăsat Da · \d{2}:\d{2}$/.test(a1.j.propunere.apasat || ''), JSON.stringify(a1.j.propunere || {}).slice(0, 300));
  T('…pasul următor (M2): Ion a rămas fără mașină, B 268 ROY îl așteaptă, cu cele două continuări', a1.j.urmator && /^Ion Popescu a rămas fără mașină, iar \*\*B 268 ROY\*\* n-are șofer( de azi)?\. Ion Popescu are permis B valabil până pe 09\.06\.2029 și a mai fost trecut pe ea în \S+\. Îți pregătesc și schimbarea asta\?$/.test(a1.j.urmator.text) &&
    a1.j.urmator.urmari.length === 2, a1.j.urmator && a1.j.urmator.text);
  const au = (await json('GET', '/api/audit?limit=50', S)).j;
  const rand = (Array.isArray(au) ? au : []).filter((x) => x.action === 'assign' && x.entity_id === MAS[3][0] && x.details && x.details.prin === 'RA Insight')[0];
  T('…în jurnal: „assign" pe B 77 TIR, de pe Ion pe Mihai, „prin RA Insight", cu textul schimbării', !!rand && Number(rand.details.driver_id) === mihai.id && Number(rand.details.de_la) === ion.id && rand.details.text === 'șoferul Mihai Ionescu pe B 77 TIR' && rand.username === 'ana.pop@ionescu.ro', JSON.stringify(rand));
  T('al doilea „Da" pe aceeași propunere: refuzat (409)', (await json('POST', '/api/insight/actiuni/' + pc.id + '/aplica', ana.ck, {})).status === 409);
  const conv = await json('GET', '/api/insight/conversatii/' + cid, ana.ck);
  const ms = conv.j.mesaje || [];
  T('conversația redeschisă: cartonașul arată „Ai apăsat Da", „Gata" și cât mai ține „Anulează"; pasul următor e mesaj', ms.some((m) => m.extra && m.extra.propunere && m.extra.propunere.id === pc.id && m.extra.propunere.stare === 'aplicata' && m.extra.propunere.gata && m.extra.propunere.ramasMs > 0) &&
    ms.some((m) => m.rol === 'assistant' && /^Ion Popescu a rămas fără mașină/.test(m.text) && m.extra && (m.extra.urmari || []).length === 2), JSON.stringify(ms.map((m) => m.text)).slice(0, 400));
  const rUrm = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'da', conversatieId: cid });
  T('„da" scris la „Îți pregătesc și schimbarea asta?" → cartonașul pentru Ion pe B 268 ROY, tot cu „Da" (nimic schimbat, nimic la model)',
    rUrm.status === 200 && rUrm.j.propunere && rUrm.j.propunere.sofer.la === 'Ion Popescu' && rUrm.j.propunere.titlu === 'Trec șoferul pe B 268 ROY' && (await masina(1)).sofer === null && nModel() === 0, rUrm.text.slice(0, 300));
  // „Anulează"
  const an1 = await json('POST', '/api/insight/actiuni/' + pc.id + '/anuleaza', ana.ck);
  T('„Anulează": Ion e din nou pe TIR, grupa rămâne; textul spune ce s-a întors', an1.status === 200 && (await masina(3)).sofer === ion.id && (await masina(3)).grupa === grupa.id && an1.j.text === 'Am anulat: B 77 TIR are din nou șoferul Ion Popescu.' && an1.j.propunere.stare === 'anulata', an1.text.slice(0, 300));
  T('…a doua oară: 409', (await json('POST', '/api/insight/actiuni/' + pc.id + '/anuleaza', ana.ck)).status === 409);
  // după 10 minute, „Anulează" nu mai merge
  const r2 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune-l pe Mihai Ionescu pe B 77 TIR', conversatieId: cid });
  await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/aplica', ana.ck, {});
  await json('POST', '/api/test/actiune-veche', S, { id: r2.j.propunere.id, minute: 11 });
  const an2 = await json('POST', '/api/insight/actiuni/' + r2.j.propunere.id + '/anuleaza', ana.ck);
  T('după cele 10 minute, „Anulează" e refuzat: se schimbă din fișa mașinii', an2.status === 409 && /Au trecut cele 10 minute/.test(an2.j.error || '') && (await masina(3)).sofer === mihai.id, an2.text.slice(0, 200));
  await json('PUT', '/api/devices/' + MAS[3][0] + '/assign', S, { driver_id: ion.id, group_id: grupa.id });   // înapoi ca la început
  // „Nu" și propunerea veche
  const r3 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune-l pe Mihai Ionescu pe B 77 TIR', conversatieId: cid });
  const nu = await json('POST', '/api/insight/actiuni/' + r3.j.propunere.id + '/refuza', ana.ck);
  T('„Nu": propunerea rămâne în discuție („Ai apăsat Nu"), nu schimbă nimic, iar „Da" după ea e refuzat', nu.status === 200 && nu.j.propunere.stare === 'refuzata' && /^Ai apăsat Nu/.test(nu.j.propunere.apasat || '') &&
    (await json('POST', '/api/insight/actiuni/' + r3.j.propunere.id + '/aplica', ana.ck, {})).status === 409 && (await masina(3)).sofer === ion.id);
  const r4 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune-l pe Mihai Ionescu pe B 77 TIR', conversatieId: cid });
  await json('POST', '/api/test/actiune-veche', S, { id: r4.j.propunere.id, minute: 25 * 60 });
  const ve = await json('POST', '/api/insight/actiuni/' + r4.j.propunere.id + '/aplica', ana.ck, {});
  T('o propunere de ieri nu se mai aplică (se cere din nou, de la fișele de azi)', ve.status === 409 && /veche/.test(ve.j.error || '') && (await masina(3)).sofer === ion.id, ve.text.slice(0, 200));
  // „Schimbă": doar un șofer de pe cartonaș
  const r5 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Pune-l pe Mihai Ionescu pe B 77 TIR', conversatieId: cid });
  T('„Schimbă" cu un șofer care nu e pe cartonaș: refuzat (400)', (await json('POST', '/api/insight/actiuni/' + r5.j.propunere.id + '/aplica', ana.ck, { la: elena.id })).status === 400 && (await masina(3)).sofer === ion.id);
  // „Propune un șofer pentru B 268 ROY" (din „Azi la tine"), cât Ion e încă pe TIR
  const r6 = await json('POST', '/api/insight/intreaba', ana.ck, { message: 'Propune un șofer pentru B 268 ROY', nou: true, buton: true });
  T('„Propune un șofer pentru B 268 ROY": Ion, mutat pe față de pe TIR (nu pus pe două mașini)', r6.status === 200 && (r6.j.propunere || {}).sofer && r6.j.propunere.sofer.la === 'Ion Popescu' &&
    (r6.j.propunere.dovezi || []).some((d) => /e trecut acum pe B 77 TIR: îl mut de acolo/.test(d.text)), r6.text.slice(0, 300));
  // pe pagină: „Aplică cele bifate" și „Anulează"
  const doar = await json('POST', '/api/insight/soferi-masini/aplica', ana.ck, { schimbari: [{ imei: MAS[1][0], la: ion.id }] });
  T('pagina: Ion pe B 268 ROY FĂRĂ schimbarea de pe TIR = refuzat (ar fi pe două mașini), nimic schimbat', doar.status === 409 && /încă trecut pe altă mașină/.test(doar.j.error || '') && (await masina(1)).sofer === null, doar.text.slice(0, 200));
  const toate = await json('POST', '/api/insight/soferi-masini/aplica', ana.ck, { schimbari: (p0.j.propuneri || []).map((p) => ({ imei: p.imei, la: p.la })) });
  const dupaAp = [await masina(3), await masina(1), await masina(2)].map((x) => x.sofer);
  T('„Aplică cele bifate (3)": Mihai pe TIR, Ion pe dubă, Andrei scos — în ordine, o acțiune cu „Anulează"', toate.status === 200 && toate.j.gata.length === 3 && JSON.stringify(dupaAp) === JSON.stringify([mihai.id, ion.id, null]) && toate.j.actiuneId > 0 && toate.j.ramasMs > 0 &&
    toate.j.text === 'Gata: 3 schimbări. Se pot anula 10 minute.', toate.text.slice(0, 300) + ' ' + JSON.stringify(dupaAp));
  const p1 = await json('GET', '/api/insight/soferi-masini', ana.ck);
  T('…după: trei în regulă; rămâne doar B 112 RFG fără șofer (scos până trece permisul nou), fără altă propunere; numărul de lângă pagină = 1',
    p1.j.rezumat.inRegula === 3 && p1.j.rezumat.deRezolvat === 1 && p1.j.rezumat.deRezolvatText === 'o mașină fără șofer' && !(p1.j.propuneri || []).length &&
    (p1.j.faraPropunere || []).map((f) => f.nr + ': ' + f.motiv).join() === 'B 112 RFG: nu e alt șofer liber cu permis B valabil' && (await json('GET', '/api/insight/ramuri', ana.ck)).j.soferi === 1, JSON.stringify(p1.j.rezumat) + ' ' + JSON.stringify(p1.j.faraPropunere));
  const an3 = await json('POST', '/api/insight/actiuni/' + toate.j.actiuneId + '/anuleaza', ana.ck);
  T('„Anulează" pe toate trei: fiecare mașină are din nou șoferul de dinainte', an3.status === 200 && JSON.stringify([(await masina(3)).sofer, (await masina(1)).sofer, (await masina(2)).sofer]) === JSON.stringify([ion.id, null, andrei.id]), an3.text.slice(0, 300));
  // „Azi la tine" (M5)
  const az1 = await json('GET', '/api/insight/azi', ana.ck);
  const tx = (az1.j.randuri || []).map((r) => r.nivel + ' ' + r.text).join(' | ');
  T('„Azi la tine": permisul expirat, permisul nepotrivit și duba rămasă fără șofer — fiecare cu „Propunere"', /r \*\*B 112 RFG\*\*: permisul lui Andrei Pop a expirat pe \d{2}\.\d{2}\./.test(tx) && /w \*\*B 77 TIR\*\* e trecut pe Ion Popescu, care n-are permis CE\./.test(tx) &&
    /w \*\*B 268 ROY\*\* n-are șofer de azi\./.test(tx) && (az1.j.randuri || []).every((r) => r.butoane[0] && r.butoane[0].fel === 'propunere'), tx);
  T('…iar permisul expirat al lui Andrei stă O DATĂ (nu și ca „Trecut de termen" la RA Care)', !/Permis de conducere la \*\*Andrei Pop\*\*/.test(tx) && az1.j.deVazut === 3, tx + ' · ' + az1.j.deVazut);
  // Pe Start: nimic din pasul 2, iar cererile de raport merg mai departe
  const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start SRL' })).j;
  await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000081101', nume: 'Dacia Logan', nr_inmatriculare: 'B 101 STA' }] });
  await json('PUT', '/api/devices/350000000081101/company', S, { company_id: coS.id });
  const admS = await om('sef@start-soferi.ro', 'Sef Start', 'company_admin', coS.id);
  const s1 = await json('POST', '/api/insight/intreaba', admS.ck, { message: 'Propune un șofer pentru B 101 STA', nou: true });
  T('pe Start: propunerea spune că e de la Basic (cu pachetele), fără cartonaș', s1.status === 200 && !s1.j.propunere && /de la pachetul Basic/.test(s1.j.pachetMesaj || ''), s1.text.slice(0, 200));
  const s2 = await json('POST', '/api/insight/intreaba', admS.ck, { message: 'Pune-mi raportul „Staționări" pentru B 101 STA, ieri', nou: true });
  T('…iar „Pune-mi raportul…" nu e luat drept cerere de șoferi: merge la rapoarte', s2.status === 200 && !/Basic/.test(s2.j.reply || '') && !s2.j.propunere, s2.text.slice(0, 200));
  T('…pagina „Șoferi pe mașini", pe Start: 403 (de la Basic)', (await json('GET', '/api/insight/soferi-masini', admS.ck)).status === 403);
  T('pe Basic, nimic din pasul 2 nu s-a numărat', (await json('GET', '/api/ai/quota', ana.ck)).j.used === q0.used);
  T('noi (super-admin) n-avem o flotă pentru pagină', (await json('GET', '/api/insight/soferi-masini', S)).j.platforma === true);

  // ─── 5. B (23.10; Alin: „da, le rezolvăm"): atribuirea din ecran nu mai pune pe o mașină șoferul sau grupa ALTEI firme ───
  // Până atunci, o cerere făcută de mână putea trece pe mașina firmei Start șoferul firmei Ionescu, iar fișa mașinii și
  // rapoartele firmei Start arătau apoi numele omului de la Ionescu. Acum: 404 (ca un lucru care nu există), la oricine.
  console.log('\n5. Atribuirea veche: șoferul și grupa doar din firma mașinii');
  const IS = '350000000081101';
  const vasile = (await json('POST', '/api/drivers', S, { name: 'Vasile Start', license_categories: 'B', license_expiry: '2030-01-01', company_id: coS.id })).j;
  // Grupele firmelor le fac administratorii lor (o grupă făcută din contul de fondator n-are firmă: e a noastră).
  const grS = (await json('POST', '/api/groups', admS.ck, { name: 'Flota Start' })).j;
  const grI = (await json('POST', '/api/groups', ana.ck, { name: 'Duba de oraș' })).j;
  const pusa = async () => { const l = (await json('GET', '/api/devices', admS.ck)).j; const d = (Array.isArray(l) ? l : []).filter((x) => x.imei === IS)[0] || {}; return { sofer: d.driver_id == null ? null : Number(d.driver_id), grupa: d.group_id == null ? null : Number(d.group_id) }; };
  const x1 = await json('PUT', '/api/devices/' + IS + '/assign', admS.ck, { driver_id: elena.id, group_id: null });
  T('administratorul firmei Start NU poate pune pe mașina lui șoferul firmei Ionescu (404), iar mașina rămâne fără șofer', x1.status === 404 && /nu e în firma acestei mașini/.test(x1.j.error || '') && (await pusa()).sofer === null, x1.status + ' ' + x1.text.slice(0, 120));
  const x2 = await json('PUT', '/api/devices/' + IS + '/assign', admS.ck, { driver_id: null, group_id: grI.id });
  const x2b = await json('PUT', '/api/devices/' + IS + '/assign', admS.ck, { driver_id: null, group_id: grupa.id });
  T('…nici grupa firmei Ionescu, nici o grupă a noastră, fără firmă (404)', x2.status === 404 && x2b.status === 404 && /nu e a firmei acestei mașini/.test(x2.j.error || '') && (await pusa()).grupa === null, x2.status + ' / ' + x2b.status + ' ' + x2.text.slice(0, 120));
  const x3 = await json('PUT', '/api/devices/' + IS + '/assign', admS.ck, { driver_id: String(vasile.id), group_id: String(grS.id) });
  T('…șoferul și grupa LUI merg (și scrise ca text, cum le trimite ecranul)', x3.status === 200 && JSON.stringify(await pusa()) === JSON.stringify({ sofer: vasile.id, grupa: grS.id }), x3.status + ' ' + JSON.stringify(await pusa()));
  const x4 = await json('PUT', '/api/devices/' + IS + '/assign', S, { driver_id: mihai.id, group_id: grS.id });
  T('…regula ține și pentru noi (super-admin): șoferul altei firme pe mașina Start = 404, nimic schimbat', x4.status === 404 && (await pusa()).sofer === vasile.id, x4.status);
  const x5 = await json('PUT', '/api/devices/' + MAS[0][0] + '/assign', ana.ck, { driver_id: vasile.id, group_id: null });
  T('…și invers: Ana (Ionescu) nu poate pune șoferul firmei Start pe B 154 UIP (404); Elena rămâne', x5.status === 404 && (await masina(0)).sofer === elena.id, x5.status);
  const x6 = await json('PUT', '/api/devices/' + IS + '/group', S, { group_id: grI.id });
  const x7 = await json('PUT', '/api/devices/' + IS + '/group', admS.ck, { group_id: grI.id });
  T('mutarea în grupă (ecranul „Grupe"): grupa altei firme = 404, și pentru noi (până acum, la noi trecea orice grupă)', x6.status === 404 && x7.status === 404 && (await pusa()).grupa === grS.id, x6.status + ' / ' + x7.status);
  const x6b = await json('PUT', '/api/devices/' + IS + '/group', S, { group_id: grupa.id });
  T('…o grupă a noastră (fără firmă) o folosim tot doar noi', x6b.status === 200 && (await pusa()).grupa === grupa.id, x6b.status);
  const x8 = await json('PUT', '/api/devices/' + IS + '/assign', admS.ck, { driver_id: '', group_id: '' });
  T('…golirea (fără șofer, fără grupă) merge', x8.status === 200 && JSON.stringify(await pusa()) === JSON.stringify({ sofer: null, grupa: null }), x8.status);
  const REP = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8'), DBS = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  T('rapoartele și fișa mașinii iau numele șoferului doar din firma mașinii (plasa de la citire)', /LEFT JOIN drivers dr ON dr\.id = d\.driver_id AND dr\.company_id IS NOT DISTINCT FROM d\.company_id'\);/.test(REP) &&
    /FROM devices d LEFT JOIN drivers dr ON dr\.id = d\.driver_id AND dr\.company_id IS NOT DISTINCT FROM d\.company_id WHERE d\.imei = \$1/.test(DBS));
  T('o singură regulă pentru ambele rute (/assign și /group): _soferGrupaAleFirmei', (SRV.match(/await _soferGrupaAleFirmei\(req\.params\.imei, /g) || []).length === 2);
  T('ZERO cereri către model în toată proba', nModel() === 0, nModel());

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
