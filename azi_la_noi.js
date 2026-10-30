// azi_la_noi.js — „Azi la noi": primul mesaj al asistentului fondatorilor (macheta „tot un chat", Alin, 29–30.10: „1. da, 2. da,
// 3. da"). Ce cere o mână de om AZI la firmă, cel mult 5 rânduri, în ordinea hotărâtă: bani în pericol, clienți care așteaptă,
// contracte, montaj, de facturat, aparate, firma noastră. Pe REGULI, fără model: nu costă nimic.
//
// Curat: primește datele deja adunate de server (cu regulile care există: neplata, contractele, montajul, stocul, emailul) și
// întoarce rândurile cu textele gata scrise și unde duce fiecare clic (`tinta`). Pagina doar desenează (textContent).
// Un fel cu mai multe lucruri = UN rând strâns, spre lista lui (ca „Azi la tine" al clienților).
'use strict';
const { numar } = require('./contracts');

const MAX_RANDURI = 5;
const ZILE_LA_SEMNAT = 7;     // un contract trimis la semnat care stă de peste 7 zile (macheta, punctul 3)
const ZILE_SOLD = 14;         // soldul Anthropic care mai ajunge mai puțin de 14 zile
const ORDINEA = ['bani', 'clienti', 'contracte', 'montaj', 'facturat', 'aparate', 'firma'];

// Formatatoare ținute minte (verify_formatoare.js le numără): ziua din bara de sus și ora din antet, pe ora României.
const TZ = 'Europe/Bucharest';
const _fmtZi = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const _fmtOra = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function ziua(acum) { const s = _fmtZi.format(new Date(acum)); return s.charAt(0).toUpperCase() + s.slice(1); }
function ora(acum) { return _fmtOra.format(new Date(acum)); }
function oraRo(acum) { return Number(ora(acum).slice(0, 2)) || 0; }

// „1.240 lei" / „4,10 $": fără formatatoare de numere (nu ne trebuie unul la fiecare apel).
function _mii(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function lei(n) { return (Number(n) < 0 ? '−' : '') + _mii(Number(n) || 0) + ' lei'; }
function dolari(n) {
  const c = Math.round(Math.abs(Number(n) || 0) * 100);
  return _mii(Math.floor(c / 100)) + ',' + String(c % 100).padStart(2, '0') + ' $';
}
// „de 5 ore" / „de 2 zile" / „de 40 de minute": cât așteaptă ceva.
function deCand(la, acum) {
  const min = Math.max(0, Math.floor((acum - la) / 60000));
  if (min < 60) return numar(Math.max(1, min), 'minut', 'minute');
  const h = Math.floor(min / 60);
  if (h < 24) return numar(h, 'oră', 'ore');
  return numar(Math.floor(h / 24), 'zi', 'zile');
}
function zz(ms) { const s = _fmtZi.formatToParts(new Date(ms)); const d = s.find((p) => p.type === 'day'), m = s.find((p) => p.type === 'month'); return (d ? d.value : '') + ' ' + (m ? m.value : ''); }

function prenume(nume) { return String(nume || '').trim().split(/\s+/)[0] || ''; }
function salut(nume, acum) {
  const h = oraRo(acum), p = prenume(nume);
  const s = h >= 5 && h < 11 ? 'Bună dimineața' : (h >= 11 && h < 18 ? 'Bună ziua' : 'Bună seara');
  return '**' + s + (p ? ', ' + p : '') + '!** Iată cum stăm azi.';
}

// ── Rândurile, pe feluri. Fiecare întoarce null (nimic de spus) sau { fel, nivel, text, buton, tinta }. ──
function bani(facturi) {
  const l = (facturi || []).slice().sort((a, b) => (a.zilePanaLaOprire ?? 99) - (b.zilePanaLaOprire ?? 99) || b.zileIntarziere - a.zileIntarziere);
  if (!l.length) return null;
  const oprire = (z) => z == null ? '' : (z > 0 ? '; accesul se oprește în ' + numar(z, 'zi', 'zile') : (z === 0 ? '; accesul se oprește azi' : '; accesul e oprit'));
  const firme = [...new Set(l.map((f) => f.companyId))];
  // Suma: în lei (facturile noastre); o factură în altă monedă își poartă moneda și nu intră în total.
  const suma = (f) => (!f.moneda || f.moneda === 'RON') ? lei(f.totalRon) : _mii(f.totalRon) + ' ' + f.moneda;
  if (l.length === 1) {
    const f = l[0];
    return { fel: 'bani', nivel: 'r', text: '**' + f.firma + '**: factura ' + f.numar + ' (' + suma(f) + ') e întârziată de ' + numar(f.zileIntarziere, 'zi', 'zile') + oprire(f.zilePanaLaOprire) + '.',
      buton: 'Deschide firma', tinta: { fel: 'firma', id: f.companyId, fila: 'facturi' } };
  }
  const total = l.filter((f) => !f.moneda || f.moneda === 'RON').reduce((s, f) => s + (Number(f.totalRon) || 0), 0), f = l[0];
  return { fel: 'bani', nivel: 'r', text: numar(l.length, 'factură', 'facturi') + ' trecute de scadență' + (total ? ', ' + lei(total) : '') + (firme.length > 1 ? ', la ' + numar(firme.length, 'firmă', 'firme') : '') + '. Cea mai urgentă: **' + f.firma + '**' + oprire(f.zilePanaLaOprire) + '.',
    buton: 'Companii', tinta: { fel: 'sectiune', tab: 'companies' } };
}
function cereri(l, acum) {
  l = (l || []).slice().sort((a, b) => a.la - b.la);
  if (!l.length) return null;
  if (l.length === 1) {
    const c = l[0];
    return { fel: 'clienti', nivel: 'r', text: 'Cererea nr. ' + c.nr + ' de la **' + c.firma + '** („' + c.titlu + '”) așteaptă de ' + deCand(c.la, acum) + '.', buton: 'Cereri de la clienți', tinta: { fel: 'sectiune', tab: 'cereri' } };
  }
  return { fel: 'clienti', nivel: 'r', text: '**' + numar(l.length, 'cerere', 'cereri') + '** de la clienți n-au fost preluate; cea mai veche, de la **' + l[0].firma + '**, așteaptă de ' + deCand(l[0].la, acum) + '.',
    buton: 'Cereri de la clienți', tinta: { fel: 'sectiune', tab: 'cereri' } };
}
function demo(l, acum) {
  l = (l || []).slice().sort((a, b) => a.la - b.la);
  if (!l.length) return null;
  const text = l.length === 1 ? 'O cerere de cont demo nouă' + (l[0].nume ? ', de la **' + l[0].nume + '**' : '') + ', de ' + deCand(l[0].la, acum) + '.'
    : '**' + numar(l.length, 'cerere', 'cereri') + '** de cont demo noi; cea mai veche, de ' + deCand(l[0].la, acum) + '.';
  return { fel: 'clienti', nivel: 'w', text, buton: 'Cereri demo', tinta: { fel: 'sectiune', tab: 'demoreq' } };
}
// Contractele de la `contracte.deAnuntat` (aceeași regulă ca anunțul zilnic): expirat, preaviz încheiat sau încă de prins.
function contracteExpira(l) {
  const cand = (c) => c.ultimaZiPreaviz || c.sfarsit;
  l = (l || []).slice().sort((a, b) => cand(a) - cand(b));
  if (!l.length) return null;
  const despre = (c) => c.trecut ? 'a expirat pe ' + zz(c.sfarsit)
    : 'expiră pe ' + zz(c.sfarsit) + (c.ultimaZiPreaviz ? (c.preavizTrecut ? '; preavizul s-a încheiat pe ' : '; preavizul se termină pe ') + zz(c.ultimaZiPreaviz) : '');
  const nivel = l.some((c) => c.trecut) ? 'r' : 'w';
  if (l.length === 1) {
    const c = l[0];
    return { fel: 'contracte', nivel, text: 'Contractul cu **' + c.firma + '** ' + despre(c) + '.', buton: 'Deschide contractul', tinta: { fel: 'firma', id: c.companyId, fila: 'contract' } };
  }
  return { fel: 'contracte', nivel, text: '**' + numar(l.length, 'contract', 'contracte') + '** expiră curând; primul: **' + l[0].firma + '**, ' + despre(l[0]) + '.',
    buton: 'Contracte', tinta: { fel: 'sectiune', tab: 'contracte' } };
}
function contracteTrimise(l, acum) {
  l = (l || []).filter((c) => c.trimisLa && acum - c.trimisLa > ZILE_LA_SEMNAT * 86400000).sort((a, b) => a.trimisLa - b.trimisLa);
  if (!l.length) return null;
  const zile = (c) => numar(Math.floor((acum - c.trimisLa) / 86400000), 'zi', 'zile');
  if (l.length === 1) return { fel: 'contracte', nivel: 'w', text: 'Contractul cu **' + l[0].firma + '** așteaptă semnătura de ' + zile(l[0]) + '.', buton: 'Deschide contractul', tinta: { fel: 'firma', id: l[0].companyId, fila: 'contract' } };
  return { fel: 'contracte', nivel: 'w', text: '**' + numar(l.length, 'contract', 'contracte') + '** așteaptă semnătura de peste ' + numar(ZILE_LA_SEMNAT, 'zi', 'zile') + '; cel mai vechi: **' + l[0].firma + '**, de ' + zile(l[0]) + '.',
    buton: 'Contracte', tinta: { fel: 'sectiune', tab: 'contracte' } };
}
function montajMaine(l) {
  l = l || [];
  if (!l.length) return null;
  const cine = (x) => x.lipsa.length === 2 ? 'de client și de instalator' : (x.lipsa[0] === 'client' ? 'de client' : 'de instalator');
  if (l.length === 1) {
    const x = l[0];
    return { fel: 'montaj', nivel: 'w', text: 'Montajul de mâine la **' + x.firma + '**' + (x.instalator || x.masini ? ' (' + [x.instalator, x.masini ? numar(x.masini, 'mașină', 'mașini') : ''].filter(Boolean).join(', ') + ')' : '') + ' nu e confirmat ' + cine(x) + '.',
      buton: 'Calendarul de montaj', tinta: { fel: 'sectiune', tab: 'montaj' } };
  }
  return { fel: 'montaj', nivel: 'w', text: '**' + numar(l.length, 'montaj', 'montaje') + '** de mâine nu sunt confirmate; primul: **' + l[0].firma + '**.', buton: 'Calendarul de montaj', tinta: { fel: 'sectiune', tab: 'montaj' } };
}
function termenMontaj(l) {
  l = (l || []).slice().sort((a, b) => (b.depasit ? 1 : 0) - (a.depasit ? 1 : 0));
  if (!l.length) return null;
  const nivel = l.some((x) => x.depasit) ? 'r' : 'w';
  if (l.length === 1) return { fel: 'montaj', nivel, text: 'Montajul la **' + l[0].firma + '**: ' + l[0].text + '.', buton: 'Calendarul de montaj', tinta: { fel: 'sectiune', tab: 'montaj' } };
  return { fel: 'montaj', nivel, text: '**' + numar(l.length, 'contract', 'contracte') + '** au termenul de montaj aproape sau depășit; primul: **' + l[0].firma + '**, ' + l[0].text + '.', buton: 'Calendarul de montaj', tinta: { fel: 'sectiune', tab: 'montaj' } };
}
function montajDeFacturat(l) {
  l = l || [];
  if (!l.length) return null;
  if (l.length === 1) {
    const x = l[0];
    return { fel: 'facturat', nivel: 'b', text: 'Montaj gata de facturat: **' + x.firma + '**' + (x.masini ? ', ' + numar(x.masini, 'mașină', 'mașini') : '') + (x.perioada ? ' (' + x.perioada + ')' : '') + '.',
      buton: 'Montaj de facturat', tinta: { fel: 'facturare', sectiune: 'montaj' } };
  }
  return { fel: 'facturat', nivel: 'b', text: 'Montaj gata de facturat la **' + numar(l.length, 'firmă', 'firme') + '**; prima: **' + l[0].firma + '**.', buton: 'Montaj de facturat', tinta: { fel: 'facturare', sectiune: 'montaj' } };
}
function abonamentNeemis(l, luna) {
  l = l || [];
  if (!l.length) return null;
  const text = l.length === 1 ? 'Abonamentul pe ' + luna + ' nu e emis încă la **' + l[0].firma + '**.' : 'Abonamentul pe ' + luna + ' nu e emis încă la **' + numar(l.length, 'firmă', 'firme') + '**; prima: **' + l[0].firma + '**.';
  return { fel: 'facturat', nivel: 'b', text, buton: 'Facturare', tinta: { fel: 'facturare', sectiune: 'facturi' } };
}
function aparateNoi(a) {
  if (!a || !a.n) return null;
  const text = (a.n === 1 ? 'Un aparat transmite și n-are firmă' : '**' + numar(a.n, 'aparat', 'aparate') + '** transmit și n-au firmă') + (a.firma && a.firma.nume ? '; propunerea: **' + a.firma.nume + '**' : '') + '.';
  return { fel: 'aparate', nivel: 'b', text, buton: 'Dispozitive', tinta: { fel: 'neasignate', imeis: (a.imeis || []).slice(0, 200), firma: a.firma && a.firma.id != null ? a.firma.id : null } };
}
function stoc(l) {
  l = l || [];
  if (!l.length) return null;
  const x = l[0];
  const text = l.length === 1 ? 'Stocul de **' + x.model + '** a scăzut la ' + numar(x.buc, 'bucată', 'bucăți') + ' (pragul: ' + x.prag + ').'
    : 'Stocul e sub prag la **' + numar(l.length, 'model', 'modele') + '**; primul: **' + x.model + '**, ' + numar(x.buc, 'bucată', 'bucăți') + '.';
  return { fel: 'aparate', nivel: 'w', text, buton: 'Stoc echipamente', tinta: { fel: 'sectiune', tab: 'stoc' } };
}
function firmaNoastra(f) {
  f = f || {};
  const r = [];
  // Motivul vine din `mailer.motiv(...).scurt` (o propoziție întreagă) — aceeași ca în „Stare producție".
  if (f.emailEroare) r.push({ fel: 'firma', nivel: 'r', text: 'Emailurile nu pleacă. ' + String(f.emailEroare).trim().replace(/([^.!?])$/, '$1.'), buton: 'Stare producție', tinta: { fel: 'sectiune', tab: 'dashboard' } });
  if ((f.emitentLipsa || []).length) {
    const l = f.emitentLipsa, ult = l.length > 1 ? l.slice(0, -1).join(', ') + ' și ' + l[l.length - 1] : l[0];
    r.push({ fel: 'firma', nivel: 'w', text: '„Date emitent” incomplete: ' + (l.length === 1 ? 'lipsește ' : 'lipsesc ') + ult + '. Fără ele nu pleacă nicio factură.', buton: 'Date emitent', tinta: { fel: 'emitent' } });
  }
  if (f.soldZile != null && f.soldZile < ZILE_SOLD) {
    r.push({ fel: 'firma', nivel: f.soldZile < 5 ? 'r' : 'n', text: 'Soldul Anthropic: ' + dolari(f.soldUsd) + '; la cheltuiala de acum ajunge cam ' + numar(Math.max(0, Math.floor(f.soldZile)), 'zi', 'zile') + '.',
      buton: 'RA Insight · control', tinta: { fel: 'sectiune', tab: 'agents' } });
  }
  return r;
}

// Totul, în ordinea hotărâtă; cel mult MAX_RANDURI. `deVazut` = câte lucruri sunt de văzut în total (și cele tăiate).
function randuri(d) {
  d = d || {};
  const acum = d.acum || Date.now();
  const toate = [
    bani(d.facturi),
    cereri(d.cereri, acum), demo(d.demo, acum),
    contracteExpira(d.contracteExpira), contracteTrimise(d.contracteTrimise, acum),
    montajMaine(d.montajMaine), termenMontaj(d.termenMontaj),
    montajDeFacturat(d.montajDeFacturat), abonamentNeemis(d.abonamentNeemis, d.luna || ''),
    aparateNoi(d.aparateNoi), stoc(d.stocSubPrag),
    ...firmaNoastra(d.firma),
  ].filter(Boolean);
  toate.sort((a, b) => ORDINEA.indexOf(a.fel) - ORDINEA.indexOf(b.fel));   // stabil: în interiorul unui fel rămâne ordinea de sus
  const arata = toate.slice(0, MAX_RANDURI);
  return {
    zi: ziua(acum), ora: ora(acum), salut: salut(d.nume, acum),
    randuri: arata, deVazut: toate.length,
    deVazutText: !toate.length ? 'totul e în regulă' : (toate.length > MAX_RANDURI ? toate.length + ' de văzut · primele ' + MAX_RANDURI : (toate.length === 1 ? '1 de văzut' : toate.length + ' de văzut')),
    gol: 'Nimic nu cere atenție azi.',
  };
}

module.exports = { MAX_RANDURI, ZILE_LA_SEMNAT, ZILE_SOLD, ORDINEA, randuri, salut, ziua, ora, lei, dolari, deCand, prenume };
