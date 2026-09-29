// abonament.js — de la ce zi plătește clientul abonamentul unei mașini (decizie Alin, 28.09).
//
// Alin a ales varianta A: „pe zile, din ziua în care aparatul transmite prima dată". Până atunci, factura
// automată lua luna ÎNTREAGĂ și număra toate aparatele trecute pe firmă în clipa emiterii, montate sau nu:
// 3 aparate înregistrate, niciunul montat → factură pe toată luna. Iar dacă „Auto" era bifat înainte de
// montaj, pleca factura la primele aparate trecute pe firmă, iar celelalte nu mai plăteau luna deloc.
//
// Regula, într-o frază: factura lunii M (emisă în ziua de facturare din M) cuprinde
//   1. luna M ÎNTREAGĂ pentru fiecare aparat pornit ÎNAINTE de 1 M (abonament în avans, ca până acum);
//   2. ZILELE din luna M-1 pentru aparatele pornite ÎN CURSUL lui M-1, din ziua pornirii până la capătul lunii.
// Exemplu: montat pe 10 octombrie → apare prima dată pe factura din noiembrie, cu 22 de zile din octombrie
// (10–31) plus noiembrie întreg. Nicio zi nu se plătește de două ori și niciuna nu scapă, oricare ar fi ziua
// de facturare a firmei: pornirea dintr-o lună se socotește întotdeauna pe factura lunii următoare.
//
// Ce nu ține de o mașină (RA Insight, păstrarea istoricului, chiria, tariful fix pe firmă) urmează ACEEAȘI
// regulă, pe firmă: luna întreagă dacă firma avea un aparat pornit înainte de 1 M, zilele din M-1 dacă
// primul ei aparat a pornit în M-1, nimic dacă n-a pornit încă niciunul.
//
// Fișierul e CURAT: primește aparate cu ziua lor de pornire și o lună, întoarce împărțirea. Nu atinge baza
// și nu știe prețuri — prețurile le pune factura (server.js → `facturaAbonamentLuna`), din aceeași ofertă.

const ZI = 24 * 60 * 60 * 1000;
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

// Luna calendaristică (1–12) și capetele ei, în ora serverului — aceeași socoteală ca restul facturării.
function intervalLuna(an, luna) {
  const de = new Date(an, luna - 1, 1).getTime();
  const urm = new Date(an, luna, 1).getTime();
  return { an: an, luna: luna, de: de, pana: urm - 1, zile: new Date(an, luna, 0).getDate() };
}
function lunaAnterioara(an, luna) { return luna === 1 ? { an: an - 1, luna: 12 } : { an: an, luna: luna - 1 }; }
function lunaDin(ms) { const d = new Date(Number(ms)); return { an: d.getFullYear(), luna: d.getMonth() + 1 }; }
function cheieLuna(an, luna) { return an + '-' + String(luna).padStart(2, '0'); }
function dinCheie(cheie) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(cheie || ''));
  if (!m) return null;
  const an = Number(m[1]), luna = Number(m[2]);
  return (luna >= 1 && luna <= 12) ? { an: an, luna: luna } : null;
}
function numeLuna(an, luna) { return LUNI[luna - 1] + ' ' + an; }
// „10–31.10.2026": perioada dintr-o lună, scrisă românește, pentru rândul de pe factură.
function perioadaText(zi, an, luna, zileLuna) {
  const ll = String(luna).padStart(2, '0');
  return zi + '–' + zileLuna + '.' + ll + '.' + an;
}

// Împarte aparatele unei firme pe factura lunii (an, luna).
//   aparate: [{ imei, tip: 'none'|'can'|'fms', de_la: ms }] — doar cele PORNITE (au ziua de pornire)
// Întoarce:
//   intregi:  aparatele care plătesc luna întreagă (pornite înainte de 1 M), cu numărătoarea pe tip;
//   partiale: grupuri { tip, zi, zile, fractie, imei: [...] } — pornite în M-1, pe zile;
//   firma:    { intreaga: bool, partiala: { zi, zile, fractie } | null } — pentru ce nu ține de o mașină.
function imparte(aparate, an, luna) {
  const M = intervalLuna(an, luna);
  const P0 = lunaAnterioara(an, luna);
  const P = intervalLuna(P0.an, P0.luna);
  const intregi = { none: 0, can: 0, fms: 0, imei: [] };
  const grupuri = {};
  let primul = null;
  (aparate || []).forEach(function (a) {
    const t = Number(a && a.de_la);
    if (!Number.isFinite(t) || t <= 0) return;           // nepornit (nemontat): nu intră pe factură
    const tip = (a.tip === 'can' || a.tip === 'fms') ? a.tip : 'none';
    if (primul == null || t < primul) primul = t;
    if (t < P.de) { intregi[tip]++; intregi.imei.push(a.imei); return; }       // pornit demult: doar M întreg
    if (t <= P.pana) {                                                          // pornit în M-1: zilele + M întreg
      intregi[tip]++; intregi.imei.push(a.imei);
      const zi = new Date(t).getDate();
      const k = tip + ':' + zi;
      if (!grupuri[k]) grupuri[k] = { tip: tip, zi: zi, zile: P.zile - zi + 1, fractie: (P.zile - zi + 1) / P.zile, imei: [] };
      grupuri[k].imei.push(a.imei);
    }
    // pornit în M sau mai târziu: intră pe factura lunii următoare
  });
  const partiale = Object.keys(grupuri).map(function (k) { return grupuri[k]; })
    .sort(function (x, y) { return x.zi - y.zi || x.tip.localeCompare(y.tip); });
  let firmaPartiala = null;
  if (primul != null && primul >= P.de && primul <= P.pana) {
    const zi = new Date(primul).getDate();
    firmaPartiala = { zi: zi, zile: P.zile - zi + 1, fractie: (P.zile - zi + 1) / P.zile };
  }
  return {
    luna: M, lunaAnterioara: P,
    intregi: intregi, partiale: partiale,
    firma: { intreaga: primul != null && primul <= P.pana, partiala: firmaPartiala }
  };
}

// Un rând de factură luat pe o parte din lună: aceeași cantitate, valoarea înmulțită cu fracția, rotunjit la ban.
function scaleaza(linie, fractie, sufix, cotaTva) {
  const vr = Number(cotaTva) || 0;
  const net = Math.round((Number(linie.net) || 0) * fractie * 100) / 100;
  const qty = Number(linie.qty) > 0 ? Number(linie.qty) : 1;
  const vat = Math.round(net * vr) / 100;
  return { desc: String(linie.desc || '') + (sufix || ''), qty: qty, unitPrice: Math.round((net / qty) * 100) / 100,
    vatRate: vr, net: net, vat: vat, gross: Math.round((net + vat) * 100) / 100 };
}

module.exports = { ZI, LUNI, intervalLuna, lunaAnterioara, lunaDin, cheieLuna, dinCheie, numeLuna, perioadaText, imparte, scaleaza };
