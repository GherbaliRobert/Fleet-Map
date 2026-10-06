// safe_drive.js — „Safe Drive & costuri" (ramura din RA Insight), partea cu baza de date.
//
// Regulile (pragurile, scorul, litrii, leii, recomandările) stau în condus.js, curate. Aici:
//   • ce zile trebuie (re)socotite (`deSocotit`): nesocotite, socotite înainte să se încheie ziua, sau „azi" mai vechi de
//     15 minute;
//   • socoteala unei mașini pe un șir de zile (`socotesteMasina`): pozițiile citite pe pagini, cu ACELEAȘI funcții ca
//     rapoartele (reports.js → _ajutor), rândurile pe zi și șofer scrise peste cele vechi;
//   • luna pentru pagină (`alcatuieste`), din zilele socotite: flota, mașinile, șoferii, unde și când, recomandările.
// Serverul dă baza, mașinile la care omul are acces, șoferii și prețurile. Nimic de aici nu vorbește cu modelul.
'use strict';
const condus = require('./condus');
const { nr, cant } = require('./ai_raport');
const insight = require('./insight');
const R = require('./reports')._ajutor;

const PROASPAT_AZI_MS = 15 * 60000;   // ziua de azi se reface cel mult o dată la 15 minute
const INAINTE_MS = 10 * 60000;        // se citesc și ultimele 10 minute de dinainte: drumul de peste miezul nopții se leagă
const ZILE_DISCUTIE = 30;             // „înainte" și „după" o discuție: cel mult 30 de zile de fiecare parte

// ─── Zilele, pe ora României ('AAAA-LL-ZZ') ──────────────────────────────────────────────────────────────
function _p(z) { return String(z).split('-').map(Number); }
function inceput(z) { const p = _p(z); return insight.inceputZiRO(p[0], p[1] - 1, p[2]); }
function urmatoarea(z) { const p = _p(z); return condus.zi(insight.inceputZiRO(p[0], p[1] - 1, p[2] + 1) + 3600000); }
function zileIntre(de, pana) { const out = []; for (let z = de; z <= pana && out.length < 400; z = urmatoarea(z)) out.push(z); return out; }
// 'AAAA-LL' → { luna, de, pana } (prima și ultima zi a lunii), sau null.
function luna(l) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(l || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return { luna: l, de: l + '-01', pana: condus.zi(insight.inceputZiRO(+m[1], +m[2], 1) - 3600000) };
}
function lunaDinainte(l) { const p = _p(l); let y = p[0], m = p[1] - 1; if (m < 1) { m = 12; y--; } return y + '-' + String(m).padStart(2, '0'); }
function lunaDe(ms) { return condus.zi(ms).slice(0, 7); }
function etichetaLunii(l) { const p = _p(l); return insight.LUNI[p[1] - 1] + ' ' + p[0]; }

// ─── Ce e de socotit ─────────────────────────────────────────────────────────────────────────────────────
// { imei: ['AAAA-LL-ZZ', …] } — zilele din [de, pana] (fără cele din viitor) care trebuie (re)socotite.
async function deSocotit(db, imeis, de, pana, acum) {
  const azi = condus.zi(acum), sus = pana < azi ? pana : azi, out = {};
  if (!imeis.length || de > sus) return out;
  const stare = await db.zileCondusStare(imeis, de, sus);
  const zile = zileIntre(de, sus);
  imeis.forEach(function (im) {
    zile.forEach(function (z) {
      const la = stare.get(im + '|' + z);
      const bun = la != null && (z === azi ? la >= acum - PROASPAT_AZI_MS : la >= inceput(urmatoarea(z)));
      if (!bun) (out[im] || (out[im] = [])).push(z);
    });
  });
  return out;
}
// Zilele unei mașini, strânse în șiruri fără goluri: fiecare șir = o singură trecere prin poziții.
function siruri(zile) {
  const out = [];
  (zile || []).slice().sort().forEach(function (z) {
    const u = out[out.length - 1];
    if (u && urmatoarea(u.pana) === z) u.pana = z; else out.push({ de: z, pana: z });
  });
  return out;
}

// ─── Mașina: consumul, prețul, clasa, cine a condus-o ────────────────────────────────────────────────────
// Aceleași reguli ca rapoartele: consumul = cel „pe drum" din fișă, apoi cel „în oraș", apoi cel pe tipul mașinii
// (raportul de consum); L/h la ralanti = din fișă, apoi pe tip (raportul Ralanti); prețul = al mașinii, al firmei, media
// națională (rapoartele de costuri).
function masina(d, preturiFirma) {
  const n = function (x) { const v = parseFloat(x); return isFinite(v) && v > 0 ? v : null; };
  return {
    imei: d.imei,
    l100: n(d.consumption_road) || n(d.consumption_city) || R.defConsumption(d.vehicle_type),
    lph: n(d.consumption_idle) || R.idleRate(d.vehicle_type),
    clasa: condus.clasa(d.vehicle_type),
    pretL: R.resolvePrice({ price: parseFloat(d.fuel_price), fuelType: d.fuel_type || null }, { priceByType: preturiFirma || {} }),
  };
}

// ─── Socoteala unei mașini pe zilele [de, pana] ──────────────────────────────────────────────────────────
async function socotesteMasina(db, imei, de, pana, intervale) {
  const ag = condus.agregator({ soferLa: condus.soferLa(intervale), ajutor: R });
  const from = new Date(inceput(de) - INAINTE_MS).toISOString();
  const to = new Date(inceput(urmatoarea(pana)) - 1).toISOString();
  await R.fiecarePozitie(db, imei, from, to, ag.adauga);
  // Rândurile zilei de dinainte (cele 10 minute citite în plus) nu se scriu: sunt ale altei socoteli.
  const randuri = ag.gata().filter(function (r) { return r.zi >= de && r.zi <= pana; });
  await db.scrieZileCondus(imei, de, pana, randuri, zileIntre(de, pana));
  return randuri.length;
}

// ─── Luna, pentru pagină ─────────────────────────────────────────────────────────────────────────────────
// Rândurile lunii alese (doar mașinile omului) și zonele cu cele mai multe manevre — serverul le caută adresa înainte să
// alcătuiască luna, ca recomandarea „un loc unde se frânează des" să spună strada, nu coordonatele.
function _randuriLunii(o) {
  const L = luna(o.luna), pe = {}; o.masini.forEach(function (m) { pe[m.imei] = true; });
  return (o.zile || []).filter(function (r) { return pe[r.imei] && r.zi >= L.de && r.zi <= L.pana; });
}
function locuriLunii(o) { return condus.locuri(condus.insumeaza(_randuriLunii(o)).celule, 3, 3); }
// o = {
//   luna: 'AAAA-LL', acum,
//   masini: [{ imei, eticheta, l100, lph, clasa, pretL }],   — doar cele la care omul are acces
//   soferi: { id: nume },                                      — șoferii firmei
//   preturi: condus.preturi(...),                              — lei pe eveniment, pe clasă
//   zile: [{ imei, zi, sofer, date }],                          — luna și luna dinainte (citesteZileCondus)
//   inaintePregatita: bool,                                     — luna dinainte e socotită toată
//   discutii: [{ id, driver_id, imei, la, nota }],              — cele mai noi întâi
//   adrese: { 'lat,lng': 'adresă' }                              — pentru locurile cu manevre (opțional)
// }
function alcatuieste(o) {
  const L = luna(o.luna), Li = luna(lunaDinainte(o.luna));
  const peImei = {}; o.masini.forEach(function (m) { peImei[m.imei] = m; });
  // Luna de acum (până azi) se compară cu ACELEAȘI zile din luna dinainte (1–6 cu 1–6), nu cu o lună întreagă — altfel
  // orice lună începută ar părea „mai ieftină".
  const azi = condus.zi(o.acum), panaAzi = L.pana >= azi, ziN = Number(azi.slice(8, 10));
  const pIn = _p(Li.de);
  const etInainte = panaAzi ? (ziN === 1 ? '1 ' : '1–' + Math.min(ziN, Number(Li.pana.slice(8, 10))) + ' ') + insight.LUNI[pIn[1] - 1] : insight.LUNI[pIn[1] - 1];
  const randuriL = [], randuriI = [], randuriIL = [];
  (o.zile || []).forEach(function (r) {
    if (!peImei[r.imei]) return;
    if (r.zi >= L.de && r.zi <= L.pana) randuriL.push(r);
    else if (r.zi >= Li.de && r.zi <= Li.pana) { randuriIL.push(r); if (!panaAzi || Number(r.zi.slice(8, 10)) <= ziN) randuriI.push(r); }
  });
  const numeSofer = function (id) { return id ? (o.soferi[id] || 'Șofer care nu mai e în firmă') : 'Fără șofer atribuit'; };

  // Sumele pe mașină (și, la șoferi, pe mașină + șofer — fiecare mașină cu consumul și prețul ei).
  function peMasini(randuri) {
    const g = {}; randuri.forEach(function (r) { (g[r.imei] || (g[r.imei] = [])).push(r); });
    return o.masini.map(function (m) {
      const t = condus.insumeaza(g[m.imei] || []);
      return { m: m, t: t, cost: condus.costuri(t, m, o.preturi[m.clasa]) };
    });
  }
  function rezumat(lista) {
    const cuScor = lista.filter(function (x) { return condus.areScor(x.t); });
    const t = condus.insumeaza(lista.map(function (x) { return { date: x.t }; }));
    t.zile = Math.max.apply(null, [0].concat(lista.map(function (x) { return x.t.zile; })));
    const cost = condus.adunaCosturi(lista.map(function (x) { return x.cost; }));
    const scor = cuScor.length ? condus.scorFlota(cuScor.map(function (x) { return { scor: condus.scor(x.t).scor, km: x.t.km }; })) : null;
    const cuDrum = lista.filter(function (x) { return x.t.km > 0.05 || x.t.ralantiEp; }).length;
    return {
      km: Math.round(t.km), manevre: condus.manevre(t), laSuta: rot(condus.laSuta(condus.manevre(t), t.km), 1),
      scor: scor, nota: scor == null ? null : condus.notaDin(scor), cost: cost,
      costLaSuta: t.km > 1 ? rot(cost.total / t.km * 100, 2) : null, costPeMasina: cuDrum ? Math.round(cost.total / cuDrum) : null,
      ralantiOre: rot(t.ralantiEpSec / 3600, 1), pesteMin: Math.round(t.pesteSec / 60), vmax: Math.round(t.vmax), masini: cuScor.length, cuDrum: cuDrum,
      ore: t.ore,   // manevrele bruște pe ore (0–23), pentru graficul „pe ore"
    };
  }
  const acum = peMasini(randuriL), inainte = peMasini(randuriI);
  const inaintePe = {}; inainte.forEach(function (x) { inaintePe[x.m.imei] = x; });

  const masini = acum.filter(function (x) { return x.t.km > 0.05 || x.t.ralantiEp || condus.manevre(x.t); }).map(function (x) {
    const s = condus.areScor(x.t) ? condus.scor(x.t) : null, i = inaintePe[x.m.imei];
    const areI = o.inaintePregatita && i && (i.t.km > 0.05 || i.t.ralantiEp), dif = areI ? Math.round(x.cost.total - i.cost.total) : null;
    return {
      imei: x.m.imei, eticheta: x.m.eticheta, clasa: x.m.clasa, km: Math.round(x.t.km),
      scor: s ? s.scor : null, nota: s ? s.nota : null, manevre: condus.manevre(x.t), accel: x.t.accel, frana: x.t.frana, viraj: x.t.viraj,
      laSuta: rot(condus.laSuta(condus.manevre(x.t), x.t.km), 1), ralantiOre: rot(x.t.ralantiEpSec / 3600, 1),
      pesteMin: Math.round(x.t.pesteSec / 60), vmax: Math.round(x.t.vmax), cost: x.cost,
      costLaSuta: x.t.km > 1 ? rot(x.cost.total / x.t.km * 100, 2) : null,
      inainte: areI ? { cost: i.cost.total, scor: condus.areScor(i.t) ? condus.scor(i.t).scor : null } : null,
      fata: areI ? { fel: dif > 0 ? 'atentie' : (dif < 0 ? 'bun' : 'info'), text: dif ? (dif > 0 ? '+' : '−') + condus.lei(Math.abs(dif)) : 'la fel' } : null,
    };
  }).sort(function (a, b) { return b.cost.total - a.cost.total || b.km - a.km; });

  // Șoferii: rândurile lor, pe mașini (consumul și prețul mașinii pe care au condus).
  function peSoferi(randuri) {
    const g = {};
    randuri.forEach(function (r) {
      const k = r.sofer || 0, s = g[k] || (g[k] = { id: k, pe: {} });
      (s.pe[r.imei] || (s.pe[r.imei] = [])).push(r);
    });
    return Object.keys(g).map(function (k) {
      const s = g[k], parti = Object.keys(s.pe).map(function (im) {
        const t = condus.insumeaza(s.pe[im]);
        return { t: t, cost: condus.costuri(t, peImei[im], o.preturi[peImei[im].clasa]), imei: im };
      });
      const t = condus.insumeaza(parti.map(function (x) { return { date: x.t }; }));
      return { id: s.id, t: t, cost: condus.adunaCosturi(parti.map(function (x) { return x.cost; })),
        masini: parti.filter(function (x) { return x.t.km >= 0.5 || x.t.condusSec >= 60; }).map(function (x) { return x.imei; }) };
    });
  }
  // „Am vorbit cu el": ultima discuție a fiecărui șofer, cu înainte / după din zilele pe care le avem (luna și cea dinainte).
  const discutiePe = {};
  (o.discutii || []).forEach(function (d) { const k = d.driver_id ? 'd' + d.driver_id : 'm' + d.imei; if (!discutiePe[k]) discutiePe[k] = d; });
  const toate = randuriIL.concat(randuriL);
  function inFereastra(sofer, imei, de, pana) {
    return toate.filter(function (r) {
      const la = inceput(r.zi);
      return (sofer ? r.sofer === sofer : (r.imei === imei && !r.sofer)) && la >= de && la < pana;
    });
  }
  function discutia(d) {
    if (!d) return null;
    const ziD = inceput(condus.zi(d.la));   // ziua discuției intră la „după"
    const ina = condus.insumeaza(inFereastra(d.driver_id, d.imei, ziD - ZILE_DISCUTIE * 86400000, ziD));
    const dup = condus.insumeaza(inFereastra(d.driver_id, d.imei, ziD, Math.min(o.acum, ziD + ZILE_DISCUTIE * 86400000) + 1));
    return { id: d.id, la: d.la, zi: condus.zi(d.la), nota: d.nota || '', comparatie: ziD >= inceput(Li.de) ? condus.comparatie(ina, dup) : null };
  }
  const soferiInainte = {}; peSoferi(randuriI).forEach(function (s) { soferiInainte[s.id] = s; });
  const soferi = peSoferi(randuriL).filter(function (s) { return s.t.km > 0.05 || condus.manevre(s.t) || s.t.ralantiEp; }).map(function (s) {
    const sc = condus.areScor(s.t) ? condus.scor(s.t) : null, i = soferiInainte[s.id];
    const areI = o.inaintePregatita && i && (i.t.km > 0.05 || i.t.ralantiEp), pr = areI && i.cost.total >= 1 ? Math.round((s.cost.total - i.cost.total) / i.cost.total * 100) : null;
    return {
      id: s.id || null, nume: numeSofer(s.id), km: Math.round(s.t.km), masini: s.masini.map(function (im) { return peImei[im].scurt || peImei[im].eticheta; }),
      scor: sc ? sc.scor : null, nota: sc ? sc.nota : null, manevre: condus.manevre(s.t),
      laSuta: rot(condus.laSuta(condus.manevre(s.t), s.t.km), 1), cost: s.cost, t: s.t,
      fata: areI ? { fel: pr > 0 ? 'atentie' : (pr < 0 ? 'bun' : 'info'), text: pr ? (pr > 0 ? '+' : '−') + Math.abs(pr) + '%' : 'la fel' } : null,
      discutie: discutia(s.id ? discutiePe['d' + s.id] : null),
    };
  }).sort(function (a, b) { return (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.cost.total - a.cost.total || b.km - a.km; });

  // Unde și când se repetă manevrele bruște (toată flota la care ai acces, luna aleasă).
  const locuri = locuriLunii(o).map(function (x) {
    const a = o.adrese && o.adrese[x.lat.toFixed(3) + ',' + x.lng.toFixed(3)];
    return Object.assign(x, { adresa: a || null });
  });
  const ferestre = condus.ferestre(randuriL, 2, 5);
  const recomandari = condus.recomandari(
    acum.filter(function (x) { return x.t.km > 0.05 || x.t.ralantiEp; }).map(function (x) { return { eticheta: x.m.eticheta, t: x.t, cost: x.cost }; }),
    soferi.map(function (s) { return { id: s.id, nume: s.nume, t: s.t, cost: s.cost, discutie: s.discutie }; }),
    { ferestre: ferestre, locuri: locuri });
  soferi.forEach(function (s) { delete s.t; });

  const flota = rezumat(acum);
  const inainteR = o.inaintePregatita ? Object.assign({ luna: lunaDinainte(o.luna), eticheta: etInainte }, rezumat(inainte)) : null;
  return {
    luna: o.luna, eticheta: etichetaLunii(o.luna) + (panaAzi ? ' (până azi)' : ''),
    flota: flota, inainte: inainteR, fata: _fata(flota, inainteR, panaAzi),
    masini: masini, soferi: soferi, locuri: locuri, ferestre: ferestre, recomandari: recomandari,
    explicatii: condus.explicatii(),
  };
}
// „Față de luna dinainte", scris o dată (pagina și telefonul doar îl arată). Costul mai mare e „atenție", mai mic e „bine".
function _fata(a, b, panaAzi) {
  if (!b) return null;
  const d = Math.round(a.cost.total - b.cost.total), pr = b.cost.total >= 1 ? Math.round(d / b.cost.total * 100) : null;
  const pe = (panaAzi ? 'pe ' : 'în ') + b.eticheta;
  if (!b.km && !b.cost.total) return { fel: 'info', cost: 'fără drum ' + pe + ' — nimic de comparat', scor: null, laSuta: null, ralanti: null };
  return {
    fel: Math.abs(d) < 1 ? 'info' : (d > 0 ? 'atentie' : 'bun'),
    cost: Math.abs(d) < 1 ? 'cam la fel ca ' + pe : (d > 0 ? '+' : '−') + condus.lei(Math.abs(d)) + ' față de ' + b.eticheta + (pr ? ' (' + (pr > 0 ? '+' : '') + pr + '%)' : ''),
    scor: b.scor != null ? pe + ': ' + b.scor : null,
    laSuta: b.laSuta != null ? pe + ': ' + nr(b.laSuta, 1) : null,
    ralanti: pe + ': ' + cant(b.ralantiOre || 0, 'oră', 'ore', 1),
  };
}
function rot(x, z) { if (x == null || !isFinite(x)) return null; const f = Math.pow(10, z || 0); return Math.round(x * f) / f; }

module.exports = {
  PROASPAT_AZI_MS, INAINTE_MS, ZILE_DISCUTIE,
  inceput, urmatoarea, zileIntre, luna, lunaDinainte, lunaDe, etichetaLunii,
  deSocotit, siruri, masina, socotesteMasina, locuriLunii, alcatuieste,
};
