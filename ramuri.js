// ramuri.js — ramurile RA Insight din pasul 4 (Mentenanță & acte, Combustibil, Ore de condus, Scrisoarea de luni):
// regulile și textele, curate (fără bază, fără rețea), ca să se probeze singure (verify_ramuri.js). Serverul adună datele
// cu funcțiile care există deja (stările listelor, rapoartele) și le dă aici; pagina și RA Insight doar arată ce iese.
'use strict';
const { nr, cant } = require('./ai_raport');

const ZI = 86400000;
// O zi din bază (DATE, citită la miezul nopții UTC) → „12.10" (cu anul doar dacă nu e anul de acum).
function zz(data, acum) {
  const d = new Date(data); if (isNaN(d)) return '';
  const an = new Date(acum || Date.now()).getUTCFullYear();
  return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + (d.getUTCFullYear() !== an ? '.' + d.getUTCFullYear() : '');
}
// Câte zile până la o zi din bază — aceeași socoteală ca stările listelor (maintenanceDueState / documentDueState).
function zilePana(data, acum) { const t = new Date(data).getTime(); return isNaN(t) ? null : Math.ceil((t - (acum || Date.now())) / ZI); }

// ═══ Mentenanță & acte ═══════════════════════════════════════════════════════════════════════════════
// Un rând: { fel: 'act'|'revizie'|'permis', stare: 'depasit'|'curand', cine, ce, zile, data, kmRamasi, laKm, … }.
// „Când", în cuvinte: un act sau un permis după dată; o revizie după dată și / sau după km (cea mai urgentă întâi).
function candData(zile, data, acum, expira) {
  const z = zz(data, acum), v = expira ? 'expiră' : 'e scadentă';
  if (zile == null) return '';
  if (zile < 0) return (expira ? 'a expirat' : 'a trecut de termen') + ' pe ' + z + ' (acum ' + cant(-zile, 'zi', 'zile') + ')';
  if (zile === 0) return v + ' azi';
  if (zile === 1) return v + ' mâine (' + z + ')';
  return v + ' pe ' + z + ' — peste ' + cant(zile, 'zi', 'zile');
}
function candKm(kmRamasi, laKm) {
  if (kmRamasi == null) return '';
  const la = laKm ? ' (la ' + nr(laKm) + ' km)' : '';
  if (kmRamasi <= 0) return 'a trecut de kilometrajul ei cu ' + cant(-kmRamasi, 'km', 'km') + la;
  return 'mai are ' + cant(kmRamasi, 'km', 'km') + la;
}
// ~50 km pe zi: pune kilometrii și zilele pe aceeași scară, ca să știm care parte e mai urgentă.
const KM_PE_ZI = 50;
function candRand(r, acum) {
  if (r.fel !== 'revizie') return candData(r.zile, r.data, acum, true);
  const parti = [];
  if (r.zile != null) parti.push({ u: r.zile, t: candData(r.zile, r.data, acum, false) });
  if (r.kmRamasi != null) parti.push({ u: r.kmRamasi / KM_PE_ZI, t: candKm(r.kmRamasi, r.laKm) });
  return parti.sort(function (a, b) { return a.u - b.u; }).map(function (x) { return x.t; }).join(' · ');
}
// Cele trecute de termen întâi (cele mai vechi primele), apoi cele care vin (cele mai apropiate primele).
function cheieUrgenta(r) {
  const z = r.zile != null ? r.zile : Infinity;
  const k = r.kmRamasi != null ? r.kmRamasi / KM_PE_ZI : Infinity;
  return Math.min(z, k);
}
function ordoneaza(randuri) {
  return (randuri || []).slice().sort(function (a, b) {
    if ((a.stare === 'depasit') !== (b.stare === 'depasit')) return a.stare === 'depasit' ? -1 : 1;
    return cheieUrgenta(a) - cheieUrgenta(b) || String(a.cine).localeCompare(String(b.cine), 'ro');
  });
}
function rezumatMentenanta(randuri, faraData) {
  const r = { depasite: 0, curand: 0, acte: 0, revizii: 0, permise: 0, faraData: faraData || 0 };
  (randuri || []).forEach(function (x) {
    if (x.stare === 'depasit') r.depasite++; else r.curand++;
    if (x.fel === 'act') r.acte++; else if (x.fel === 'revizie') r.revizii++; else r.permise++;
  });
  return r;
}
// „Cum se socotește" — preavizul firmei, cu cifrele ei.
function explicatiiMentenanta(prag) {
  const p = prag || {};
  return [
    { titlu: 'Când devine „urmează"', text: 'Actele mașinilor cu ' + cant(p.docDays || 30, 'zi', 'zile') + ' înainte de expirare; reviziile cu ' +
      cant(p.days || 14, 'zi', 'zile') + ' sau ' + cant(p.km || 500, 'km', 'km') + ' înainte de termen; permisele șoferilor cu ' +
      cant(p.permis || 30, 'zi', 'zile') + ' înainte. Aceleași praguri colorează listele din Mentenanță și Documente și trimit anunțurile pe telefon.' },
    { titlu: 'De unde vin', text: 'Actele din Documente, reviziile din Mentenanță (pe dată și pe kilometrajul mașinii, din calculatorul ei de bord), permisele din fișa șoferului. Ce se rezolvă acolo dispare de aici.' },
    { titlu: 'Preavizul', text: 'Îl schimbă administratorul firmei din Agenți AI, la pragurile lui RA Care.' },
  ];
}

// ═══ Combustibil ═════════════════════════════════════════════════════════════════════════════════════
// Cifrele vin din motorul rapoartelor Consum / Costuri (reports.js → _consumptionMap: contorul CAN, altfel nivelul din
// rezervor, altfel estimarea din fișă) și din raportul „Alimentări & scăderi" (evenimentele). Aici doar se adună și se
// spun. „Peste normă" se spune DOAR pe consum măsurat (nu estimat), cu destul drum, față de consumul trecut în fișă.
const PESTE_NORMA = 0.15;          // cu peste 15% peste consumul din fișă
const KM_MIN_NORMA = 100;          // pe mai puțin drum, o cifră de consum spune prea puțin
const lei = function (n) { return cant(Math.round(n), 'leu', 'lei'); };
const litri = function (n) { return cant(Math.round(n), 'litru', 'litri'); };
function _l100(l, km) { return km > 1 ? Math.round(l / km * 1000) / 10 : null; }
// Ora României, pentru „12.10, 02:14".
const _fmtOra = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function cand(iso) { const d = new Date(iso); return isNaN(d) ? '' : _fmtOra.format(d).replace(/\s+/g, ' '); }
// o = { masini: [{ imei, eticheta }], cm, cmI (luna dinainte, aceleași zile), ev (evenimente), panaAzi, etInainte, inaintePregatita }
function alcatuiesteCombustibil(o) {
  const cm = o.cm || {}, cmI = o.cmI || {};
  const masini = (o.masini || []).map(function (m) {
    const c = cm[m.imei]; if (!c || (c.dist < 0.5 && c.consumed < 0.5)) return null;
    const cost = c.consumed * c.price, i = cmI[m.imei];
    const masurat = !c.estimated, l100 = c.per100;
    const peste = masurat && c.norma && c.dist >= KM_MIN_NORMA && l100 != null ? Math.round((l100 / c.norma - 1) * 100) : null;
    const ci = i ? i.consumed * i.price : null;
    const dif = o.inaintePregatita && i && (i.dist >= 0.5 || i.consumed >= 0.5) ? Math.round(cost - ci) : null;
    return { imei: m.imei, eticheta: m.eticheta, km: Math.round(c.dist), litri: Math.round(c.consumed * 10) / 10, l100: l100, sursa: c.source, estimat: !masurat,
      pret: Math.round(c.price * 100) / 100, cost: Math.round(cost), norma: c.norma || null, peste: peste,
      fata: dif == null ? null : { fel: dif > 0 ? 'atentie' : (dif < 0 ? 'bun' : 'info'), text: dif ? (dif > 0 ? '+' : '−') + lei(Math.abs(dif)) : 'la fel' } };
  }).filter(Boolean).sort(function (a, b) { return b.cost - a.cost || b.km - a.km; });
  const sum = function (lista, f) { return lista.reduce(function (a, x) { return a + f(x); }, 0); };
  const tKm = sum(masini, function (x) { return x.km; }), tL = sum(masini, function (x) { return x.litri; }), tCost = sum(masini, function (x) { return x.cost; });
  const estL = sum(masini.filter(function (x) { return x.estimat; }), function (x) { return x.litri; });
  const flota = { km: tKm, litri: Math.round(tL), cost: Math.round(tCost), l100: _l100(tL, tKm), masini: masini.length,
    estimate: masini.filter(function (x) { return x.estimat; }).length, procentEstimat: tL > 0 ? Math.round(estL / tL * 100) : 0 };
  // Luna dinainte (aceleași zile, pentru luna de acum)
  let inainte = null, fata = null;
  if (o.inaintePregatita) {
    const ii = Object.keys(cmI).map(function (k) { return cmI[k]; }).filter(function (c) { return c.dist >= 0.5 || c.consumed >= 0.5; });
    const iL = sum(ii, function (c) { return c.consumed; }), iCost = sum(ii, function (c) { return c.consumed * c.price; }), iKm = sum(ii, function (c) { return c.dist; });
    inainte = { eticheta: o.etInainte, litri: Math.round(iL), cost: Math.round(iCost), km: Math.round(iKm), l100: _l100(iL, iKm) };
    const pe = (o.panaAzi ? 'pe ' : 'în ') + o.etInainte;
    if (!iKm && !iL) fata = { fel: 'info', cost: 'fără drum ' + pe + ' — nimic de comparat', l100: null };
    else {
      const d = Math.round(tCost - iCost), pr = iCost >= 1 ? Math.round(d / iCost * 100) : null;
      fata = { fel: Math.abs(d) < 1 ? 'info' : (d > 0 ? 'atentie' : 'bun'),
        cost: Math.abs(d) < 1 ? 'cam la fel ca ' + pe : (d > 0 ? '+' : '−') + lei(Math.abs(d)) + ' față de ' + o.etInainte + (pr ? ' (' + (pr > 0 ? '+' : '') + pr + '%)' : ''),
        l100: inainte.l100 != null ? pe + ': ' + nr(inainte.l100, 1) + ' L la 100 km' : null };
    }
  }
  const ev = (o.ev || []).filter(function (e) { return masini.some(function (m) { return m.imei === e.imei; }) || (o.masini || []).some(function (m) { return m.imei === e.imei; }); });
  const scaderi = ev.filter(function (e) { return e.fel === 'scadere'; }).sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); })
    .map(function (e) { const m = (o.masini || []).filter(function (x) { return x.imei === e.imei; })[0]; return { imei: e.imei, eticheta: m ? m.eticheta : e.vehicul, cand: cand(e.ts), ts: e.ts, litri: e.litri, de: e.de, la: e.la, motorPornit: e.motorPornit, loc: e.loc || '',
      lat: e.lat != null ? e.lat : null, lng: e.lng != null ? e.lng : null }; });
  const alim = ev.filter(function (e) { return e.fel === 'alimentare'; });
  const evenimente = { alimentari: alim.length, litriAlimentati: Math.round(sum(alim, function (e) { return e.litri; })), scaderi: scaderi.length, litriScazuti: Math.round(sum(scaderi, function (e) { return e.litri; })) };
  const pesteNorma = masini.filter(function (x) { return x.peste != null && x.peste > PESTE_NORMA * 100; }).sort(function (a, b) { return b.peste - a.peste; });
  const faraNorma = masini.filter(function (x) { return !x.estimat && !x.norma && x.km >= KM_MIN_NORMA; });
  return { masini: masini, flota: flota, inainte: inainte, fata: fata, scaderi: scaderi, evenimente: evenimente, pesteNorma: pesteNorma,
    recomandari: recomandariCombustibil({ masini: masini, flota: flota, scaderi: scaderi, pesteNorma: pesteNorma, faraNorma: faraNorma }) };
}
function recomandariCombustibil(x) {
  const out = [];
  x.pesteNorma.slice(0, 2).forEach(function (m) {
    out.push({ fel: 'atentie', text: m.eticheta + ' a consumat ' + nr(m.l100, 1) + ' L la 100 km, cu ' + m.peste + '% peste cât are trecut în fișă (' + nr(m.norma, 1) +
      '). Merită verificat: încărcătura, presiunea în anvelope, felul în care se conduce (vezi Safe Drive) — sau dacă cifra din fișă e cea potrivită.' });
  });
  if (x.scaderi.length) {
    const s = x.scaderi[0];
    out.push({ fel: 'atentie', text: (x.scaderi.length === 1 ? 'O scădere suspectă' : cant(x.scaderi.length, 'scădere suspectă', 'scăderi suspecte')) + ' de combustibil; cea mai nouă: ' +
      s.eticheta + ', ' + s.cand + ', ' + litri(s.litri) + ' (de la ' + nr(s.de) + ' la ' + nr(s.la) + ')' + (s.motorPornit ? ', cu motorul pornit' : ', cu motorul oprit') +
      '. Verifică bonurile și locul (adresa e în listă).' });
  }
  if (x.flota.estimate && x.flota.masini) out.push({ fel: 'info', text: 'La ' + x.flota.estimate + ' din ' + cant(x.flota.masini, 'mașină', 'mașini') +
    ' consumul e ESTIMAT din fișă (km × consumul trecut), fiindcă nu trimit contorul sau nivelul de combustibil. Cifrele lor sunt aproximative.' });
  if (x.faraNorma.length) out.push({ fel: 'info', text: (x.faraNorma.length === 1 ? x.faraNorma[0].eticheta + ' n-are' : cant(x.faraNorma.length, 'mașină n-are', 'mașini n-au')) +
    ' consumul trecut în fișă — fără el nu se poate spune dacă mănâncă prea mult. Se trece în fișa mașinii, la „Consum drum".' });
  if (!out.length && x.flota.masini) out.push({ fel: 'bun', text: 'Niciun consum ieșit din normă și nicio scădere suspectă în perioada asta.' });
  return out;
}
function explicatiiCombustibil(o) {
  return [
    { titlu: 'Litrii', text: 'Din contorul de combustibil al mașinii, unde îl are; altfel din nivelul rezervorului (senzorul); altfel estimați din consumul trecut în fișă × km, plus ralantiul. Aceeași socoteală ca rapoartele Consum și Costuri — coloana „Sursa" spune de unde vine fiecare cifră.' },
    { titlu: 'Prețul', text: 'Al mașinii, din fișa ei; altfel cel al firmei (Setări → Prețuri combustibil); altfel media națională a zilei.' },
    { titlu: 'Peste normă', text: 'Doar unde consumul e măsurat (nu estimat), cu cel puțin ' + cant(KM_MIN_NORMA, 'km', 'km') + ' de drum și cu peste ' + Math.round(PESTE_NORMA * 100) + '% față de consumul trecut în fișă.' },
    { titlu: 'Scăderi suspecte', text: 'O scădere de cel puțin ' + cant((o && o.dropMin) || 10, 'litru', 'litri') + ' dintr-o dată: cu motorul oprit (oricât a stat mașina, până la 3 zile) sau cu motorul pornit (într-o oră). Ca raportul Alimentări & scăderi.' },
  ];
}

module.exports = {
  ZI, zz, zilePana,
  candData, candKm, candRand, ordoneaza, rezumatMentenanta, explicatiiMentenanta,
  PESTE_NORMA, KM_MIN_NORMA, cand, alcatuiesteCombustibil, recomandariCombustibil, explicatiiCombustibil,
};
