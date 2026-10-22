// azi_la_tine.js — „Azi la tine" (Capitolul 2, pasul 1; Alin, 15.10, macheta aprobată): prima privire în RA Insight. Ce
// au găsit agenții — mașinile care nu transmit și scăderile de combustibil de azi (RA Watch), actele și reviziile (RA Care),
// mașinile libere acum (RA Dispatch), ziua de ieri (RA Client), orele de condus (RA Compliance), stilul de condus (RA
// Optimize) — în rânduri scurte, fiecare cu butoanele lui. Pe reguli, din ce au socotit deja agenții; fără model și fără
// să se numere, pe niciun pachet (Alin: „3. Da").
//
// Curat: fără bază, fără rețea. Serverul adună datele (regulile agenților: agents.esteFaraSemnal / esteLiber, listele de
// termene: preaviz.js prin _ramMentenanta), aici se scriu rândurile. Păzit de verify_un_singur_insight.js.
'use strict';

const NUME = { watch: 'RA Watch', care: 'RA Care', dispatch: 'RA Dispatch', client: 'RA Client', optimize: 'RA Optimize', compliance: 'RA Compliance',
  insight: 'RA Insight' };   // „insight" = șoferii pe mașini (pasul 2, 22.10): nu e un agent, deci nu se oprește odată cu agenții
const MAX_RANDURI = 3;      // „Azi la tine" e o privire, nu o listă: restul stă în paginile lor (Alin, 15.10: macheta „mai simplu")
const MAX_NUME = 3;         // câte mașini se scriu pe nume într-un rând
const ORDINE = { r: 0, w: 1, b: 2, g: 3 };

// „15 minute", dar „24 de ore": „de" când ultimele două cifre nu sunt între 1 și 19 (ca _raxDe din pagină).
function de(n) { const r = Math.abs(Math.round(n)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function masini(n) { return n === 1 ? 'o mașină' : n + de(n) + 'mașini'; }
function nr(n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); }
// Minute → „45 min", „3 h", „1 h 20 min", „o zi", „3 zile".
function durata(min) {
  const m = Math.max(1, Math.round(Number(min) || 0));
  if (m < 60) return m + ' min';
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); }
  const z = Math.floor(m / 1440);
  return z === 1 ? 'o zi' : z + de(z) + 'zile';
}
// Pragul firmei, în vorbe: „de peste o oră", „de peste 2 ore", „de peste 30 de minute".
function pragText(offlineMin) {
  const m = Math.round(Number(offlineMin) || 60);
  if (m === 60) return 'de peste o oră';
  if (m % 60 === 0) return 'de peste ' + (m / 60) + de(m / 60) + 'ore';
  return 'de peste ' + m + de(m) + 'minute';
}
function lista(nume, n) { return nume.slice(0, MAX_NUME).join(', ') + (n > MAX_NUME ? ' și încă ' + (n - MAX_NUME) : ''); }

// d = {
//   agenti: ['watch', 'care', …] — agenții porniți la firmă (doar ei au rânduri);
//   offlineMin: pragul RA Watch al firmei;
//   faraSemnal: [{ imei, eticheta, nr, minute }] — mașinile care nu transmit (agents.esteFaraSemnal);
//   constatari: [{ agent, severity, fkey, title, imei, eticheta, nr }] — ce au scris agenții azi (fără „offline", socotit acum);
//   termene: [{ stare: 'depasit'|'curand', cine, ce, cand }] — actele, reviziile, permisele (aceeași listă ca Mentenanță & acte);
//   libere: număr — mașinile libere acum (agents.esteLiber);
//   ieri: { km, active, total, top: { eticheta, nr, km } } | null — ziua de ieri (cursele);
//   soferi: [{ imei, nr, stare: 'expirat'|'nepotrivit'|'fara', text, sofer, ceruta, zileFara }] — din soferi_masini.analiza (de la
//           Basic): permisul expirat, permisul care nu acoperă mașina, mașina rămasă de curând fără șofer.
// }
// Întoarce { randuri: [{ agent, nume, nivel: 'r'|'w'|'b'|'g', cheie, text (cu **bold**), butoane: [...] }], chei: [...], deVazut }.
// Pe ecran un rând se apasă O DATĂ (macheta din 15.10): pagina ia primul buton pe care omul îl poate folosi; „De ce?” (o întrebare
// pentru RA Insight, care se numără) stă după butoanele gratuite, ca un clic pe rând să nu consume o întrebare fără să știe.
// Butoanele: { fel: 'harta', imeis } · { fel: 'intreaba', trimite } (pe reguli) · { fel: 'raport', trimite } (o cerere de raport,
// pe reguli) · { fel: 'dece', trimite } (o întrebare pentru RA Insight — doar unde pachetul are AI) · { fel: 'acte', ramura,
// trimite } (ramura „Mentenanță & acte"; fără ramuri, întrebarea pe reguli). `chei` = rândurile care cer atenție (roșu,
// portocaliu), pentru punctul mov de pe bulă: ceva nou de la ultima deschidere.
function randuri(d) {
  const x = d || {};
  const porniti = new Set(Array.isArray(x.agenti) ? x.agenti : Object.keys(NUME));
  porniti.add('insight');
  const out = [];
  const pune = function (agent, nivel, cheie, text, butoane) { if (porniti.has(agent)) out.push({ agent: agent, nume: NUME[agent], nivel: nivel, cheie: cheie, text: text, butoane: butoane || [] }); };

  // RA Watch — mașinile care nu transmit (cele mai vechi primele).
  const fs = (x.faraSemnal || []).slice().sort(function (a, b) { return (b.minute || 0) - (a.minute || 0); });
  if (fs.length === 1) pune('watch', 'r', 'offline:' + fs[0].imei, '**' + fs[0].eticheta + '** nu transmite de ' + durata(fs[0].minute) + '.', [{ fel: 'harta', text: 'Pe hartă', imeis: [fs[0].imei] }]);
  else if (fs.length > 1) {
    pune('watch', 'r', 'offline:' + fs.map(function (v) { return v.imei; }).sort().join(','),
      masini(fs.length) + ' nu transmit ' + pragText(x.offlineMin) + ': ' + lista(fs.map(function (v) { return '**' + v.eticheta + '** (de ' + durata(v.minute) + ')'; }), fs.length) + '.',
      [{ fel: 'harta', text: 'Pe hartă', imeis: fs.map(function (v) { return v.imei; }) }]);
  }
  // Constatările de azi ale agenților (scrise de ei; titlul e propoziția agentului).
  const cs = x.constatari || [];
  cs.filter(function (f) { return f.agent === 'watch' && /^fuel/.test(String(f.fkey || '')); }).forEach(function (f) {
    pune('watch', 'r', String(f.fkey), String(f.title || ''), [{ fel: 'harta', text: 'Pe hartă', imeis: f.imei ? [f.imei] : [] },
      { fel: 'dece', text: 'De ce?', trimite: 'De ce a scăzut combustibilul la ' + (f.nr || f.eticheta) + ' azi? Ce s-a întâmplat înainte și după?' }]);
  });
  cs.filter(function (f) { return f.agent === 'watch' && /^tacho_missing/.test(String(f.fkey || '')); }).forEach(function (f) {
    pune('watch', 'w', String(f.fkey), String(f.title || ''), [{ fel: 'harta', text: 'Pe hartă', imeis: f.imei ? [f.imei] : [] }]);
  });
  const ral = cs.filter(function (f) { return f.agent === 'watch' && /^idle/.test(String(f.fkey || '')); });
  if (ral.length === 1) pune('watch', 'w', String(ral[0].fkey), String(ral[0].title || ''), [{ fel: 'raport', text: 'Ralantiul', trimite: 'Fă-mi raportul de ralanti pentru ' + (ral[0].nr || ral[0].eticheta) + ', azi' }]);
  else if (ral.length > 1) pune('watch', 'w', 'idle:' + ral.map(function (f) { return f.imei; }).sort().join(','),
    masini(ral.length) + ' au stat mult în ralanti azi: ' + lista(ral.map(function (f) { return '**' + (f.eticheta || f.nr) + '**'; }), ral.length) + '.',
    [{ fel: 'raport', text: 'Ralantiul', trimite: 'Fă-mi raportul de ralanti pentru toată flota, azi' }]);
  cs.filter(function (f) { return f.agent === 'compliance'; }).slice(0, 2).forEach(function (f) {
    pune('compliance', f.severity === 'critical' ? 'r' : 'w', String(f.fkey), String(f.title || ''),
      [{ fel: 'raport', text: 'Condus & repaus', trimite: 'Fă-mi raportul „Condus & repaus” pentru ' + (f.nr || f.eticheta) + ', azi' }]);
  });
  const opt = cs.filter(function (f) { return f.agent === 'optimize' && f.imei; });
  if (opt.length) {
    const vaz = new Set(), un = opt.filter(function (f) { return vaz.has(f.imei) ? false : vaz.add(f.imei); });
    pune('optimize', 'w', 'optimize:' + un.map(function (f) { return f.imei; }).sort().join(','),
      (un.length === 1 ? '**' + (un[0].eticheta || un[0].nr) + '** are' : masini(un.length) + ' au') + ' un stil de condus slab azi' + (un.length > 1 ? ': ' + lista(un.map(function (f) { return '**' + (f.eticheta || f.nr) + '**'; }), un.length) : '') + '.',
      [{ fel: 'raport', text: 'Stilul de condus', trimite: 'Fă-mi raportul EcoDrive pentru toată flota, azi' }]);
  }

  // RA Care — termenele (aceeași listă ca „Mentenanță & acte"): întâi ce a trecut, apoi ce urmează.
  const tr = x.termene || [];
  const dep = tr.filter(function (t) { return t.stare === 'depasit'; }), cur = tr.filter(function (t) { return t.stare === 'curand'; });
  const termen = function (t) { return t.ce + ' la **' + t.cine + '** — ' + t.cand; };
  const acte = { fel: 'acte', text: 'Actele', ramura: 'mentenanta', trimite: 'Ce expiră în următoarele 30 de zile?' };
  if (dep.length) pune('care', 'r', 'care:depasit:' + dep.length, (dep.length === 1 ? 'Trecut de termen: ' + termen(dep[0]) : dep.length + ' termene trecute: ' + lista(dep.map(termen), dep.length)) + '.', [acte]);
  if (cur.length) pune('care', 'w', 'care:curand:' + cur.length, (cur.length === 1 ? 'Urmează: ' + termen(cur[0]) : cur.length + ' termene urmează: ' + lista(cur.map(termen), cur.length)) + '.', [acte]);

  // RA Insight — șoferii pe mașini (pasul 2, 22.10; macheta M5): o mașină de un fel = un rând cu „Propunere" (cartonașul cu „Da",
  // pe reguli, nenumărat); mai multe de același fel = un rând strâns, spre pagina „Șoferi pe mașini".
  const sf = Array.isArray(x.soferi) ? x.soferi : [];
  const prop = function (s) { return [{ fel: 'propunere', text: 'Propunere', trimite: 'Propune un șofer pentru ' + s.nr }]; };
  const pag = [{ fel: 'pagina', text: 'Șoferi pe mașini', ramura: 'soferi', trimite: 'Arată-mi potrivirea șoferilor pe toate mașinile' }];
  const nrB = function (s) { return '**' + s.nr + '**'; };
  const sExp = sf.filter(function (s) { return s.stare === 'expirat'; }), sNep = sf.filter(function (s) { return s.stare === 'nepotrivit'; }), sFara = sf.filter(function (s) { return s.stare === 'fara'; });
  if (sExp.length === 1) pune('insight', 'r', 'sofer:expirat:' + sExp[0].imei, nrB(sExp[0]) + ': permisul lui ' + sExp[0].sofer + ' a expirat' + String(sExp[0].text || '').replace(/^permis expirat/, '') + '.', prop(sExp[0]));
  else if (sExp.length > 1) pune('insight', 'r', 'sofer:expirat:' + sExp.map(function (s) { return s.imei; }).sort().join(','), sExp.length + de(sExp.length) + 'permise expirate la șoferii trecuți pe ' + lista(sExp.map(nrB), sExp.length) + '.', pag);
  if (sNep.length === 1) pune('insight', 'w', 'sofer:nepotrivit:' + sNep[0].imei, nrB(sNep[0]) + ' e trecut pe ' + sNep[0].sofer + ', care n-are permis ' + sNep[0].ceruta + '.', prop(sNep[0]));
  else if (sNep.length > 1) pune('insight', 'w', 'sofer:nepotrivit:' + sNep.map(function (s) { return s.imei; }).sort().join(','), masini(sNep.length).replace(/^./, function (c) { return c.toUpperCase(); }) + ' au șoferi fără permisul cerut: ' + lista(sNep.map(nrB), sNep.length) + '.', pag);
  if (sFara.length === 1) pune('insight', 'w', 'sofer:fara:' + sFara[0].imei, nrB(sFara[0]) + ' n-are șofer' + (sFara[0].zileFara ? ' de ' + durata(sFara[0].zileFara * 1440) : ' de azi') + '.', prop(sFara[0]));
  else if (sFara.length > 1) pune('insight', 'w', 'sofer:fara:' + sFara.map(function (s) { return s.imei; }).sort().join(','), masini(sFara.length).replace(/^./, function (c) { return c.toUpperCase(); }) + ' au rămas fără șofer: ' + lista(sFara.map(nrB), sFara.length) + '.', pag);

  // RA Dispatch — mașinile libere acum.
  const lib = Math.max(0, Math.round(Number(x.libere) || 0));
  if (lib > 0) pune('dispatch', 'b', 'libere', (lib === 1 ? 'O mașină e liberă acum' : masini(lib).replace(/^./, function (c) { return c.toUpperCase(); }) + ' sunt libere acum') + ' (a transmis de curând și stă pe loc).',
    [{ fel: 'intreaba', text: lib === 1 ? 'Care?' : 'Care sunt?', trimite: 'Care mașini sunt oprite acum?' }]);

  // RA Client — ziua de ieri, pe scurt.
  if (x.ieri && x.ieri.total > 0) {
    const i = x.ieri, stat = Math.max(0, i.total - i.active);
    const text = i.active > 0
      ? 'Ieri: **' + nr(i.km) + ' km**, ' + (i.active === 1 ? 'o mașină a mers' : i.active + de(i.active) + 'mașini au mers') + (stat ? ', ' + (stat === 1 ? 'una a stat' : stat + de(stat) + 'au stat') : '') + '.' +
        (i.top && i.top.km > 0 && i.active > 1 ? ' Cea mai activă: **' + i.top.eticheta + '**, ' + nr(i.top.km) + ' km.' : '')
      : 'Ieri n-a mers nicio mașină.';
    pune('client', 'g', 'ieri', text, i.active > 0 ? [{ fel: 'raport', text: 'Foaia de parcurs', trimite: 'Fă-mi foaia de parcurs pentru toată flota, ieri' }] : []);
  }

  // Ce cere atenție întâi; ziua de ieri, la capăt — doar dacă mai e loc (cu trei rânduri, ce cere atenție are întâietate).
  const ordonate = out.map(function (r, i) { return { r: r, i: i }; })
    .sort(function (a, b) { return (ORDINE[a.r.nivel] - ORDINE[b.r.nivel]) || (a.i - b.i); }).map(function (o) { return o.r; });
  const ieri = ordonate.filter(function (r) { return r.cheie === 'ieri'; });
  const restul = ordonate.filter(function (r) { return r.cheie !== 'ieri'; });
  const finale = restul.slice(0, MAX_RANDURI).concat(restul.length < MAX_RANDURI ? ieri : []);
  const atentie = function (r) { return r.nivel === 'r' || r.nivel === 'w'; };
  // `deVazut` = câte cer atenție de tot (și cele care nu încap în cele trei rânduri): „5 de văzut".
  return { randuri: finale, chei: finale.filter(atentie).map(function (r) { return r.cheie; }), deVazut: ordonate.filter(atentie).length };
}

module.exports = { randuri, durata, pragText, NUME, MAX_RANDURI };
