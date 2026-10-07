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
    ' consumul trecut în fișă — fără el nu se poate spune dacă mănâncă prea mult. Se trece în fișa mașinii, la „Consum oraș” și „Consum afară”.' });
  if (!out.length && x.flota.masini) out.push({ fel: 'bun', text: 'Niciun consum ieșit din normă și nicio scădere suspectă în perioada asta.' });
  return out;
}
function explicatiiCombustibil(o) {
  return [
    { titlu: 'Litrii', text: 'Din contorul de combustibil al mașinii, unde îl are; altfel din nivelul rezervorului (senzorul); altfel estimați din consumul trecut în fișă × km, plus ralantiul. Aceeași socoteală ca rapoartele Consum și Costuri — coloana „Sursa" spune de unde vine fiecare cifră.' },
    { titlu: 'Prețul', text: 'Al mașinii, din fișa ei; altfel cel al firmei (Setări → Prețuri combustibil); altfel media națională a zilei.' },
    { titlu: 'Peste normă', text: 'Doar unde consumul e măsurat (nu estimat), cu cel puțin ' + cant(KM_MIN_NORMA, 'km', 'km') + ' de drum și cu peste ' + Math.round(PESTE_NORMA * 100) + '% față de cel mai mare consum trecut în fișă (de obicei „Consum oraș”) — ca drumurile prin oraș să nu pară risipă.' },
    { titlu: 'Scăderi suspecte', text: 'O scădere de cel puțin ' + cant((o && o.dropMin) || 10, 'litru', 'litri') + ' dintr-o dată: cu motorul oprit (oricât a stat mașina, până la 3 zile) sau cu motorul pornit (într-o oră). Ca raportul Alimentări & scăderi.' },
  ];
}

// ═══ Ore de condus ══════════════════════════════════════════════════════════════════════════════════
// Cifrele vin din raportul „Condus & repaus (Reg. 561)" (reports.js → rHos: starea din tahograf, unde mașina o trimite; altfel
// estimarea din GPS), zi cu zi, pe șofer — fiecare zi pe cine avea mașina atunci. Aici doar se adună pe săptămână și se spun.
// Încălcările sunt ALE RAPORTULUI (aceleași cuvinte), nu o a doua regulă.
const ZILE_SAPT = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
// 38 h 20 min / 45 min / 9 h
function durata(sec) {
  const m = Math.round((Number(sec) || 0) / 60), h = Math.floor(m / 60), r = m % 60;
  return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min';
}
// „luni, 05.10"
function ziText(zi, acum) { const d = new Date(zi + 'T12:00:00Z'); return isNaN(d) ? String(zi || '') : ZILE_SAPT[d.getUTCDay()] + ', ' + zz(zi, acum); }
// o = { valori (zilele săptămânii, din rHos), valoriInainte (aceleași zile din săptămâna dinainte), azi ('AAAA-LL-ZZ' sau null),
//       eticheta, etInainte, panaAzi, inaintePregatita, acum }
function alcatuiesteOreCondus(o) {
  const pe = {};
  (o.valori || []).forEach(function (v) {
    const s = pe[v.cheie] || (pe[v.cheie] = { cheie: v.cheie, nume: v.sofer, driverId: v.driverId || null, faraSofer: !v.driverId, masini: [], zile: 0, condusSec: 0,
      azi: o.azi ? 0 : null, ziMax: null, continuuMax: null, incalcari: 0, supus: false, surse: {} });
    s.condusSec += v.condusSec || 0;
    if ((v.condusSec || 0) > 0) s.zile++;
    if (o.azi && v.zi === o.azi) s.azi += v.condusSec || 0;
    if (!s.ziMax || v.condusSec > s.ziMax.sec) s.ziMax = { zi: v.zi, sec: v.condusSec || 0 };
    if (!s.continuuMax || v.continuuMaxSec > s.continuuMax.sec) s.continuuMax = { zi: v.zi, sec: v.continuuMaxSec || 0 };
    s.incalcari += (v.incalcari || []).length;
    if (v.supus) s.supus = true;
    s.surse[v.sursa] = true;
    (v.masini || []).forEach(function (m) { if (s.masini.indexOf(m) < 0) s.masini.push(m); });
  });
  const soferi = Object.keys(pe).map(function (k) {
    const s = pe[k];
    s.sursa = s.surse.tahograf && s.surse.GPS ? 'amestec' : (s.surse.tahograf ? 'tahograf' : 'GPS'); delete s.surse;
    s.text = { condus: durata(s.condusSec), azi: s.azi == null ? null : (s.azi > 0 ? durata(s.azi) : '—'),
      ziMax: s.ziMax ? durata(s.ziMax.sec) : '—', ziMaxZi: s.ziMax ? ziText(s.ziMax.zi, o.acum) : '',
      continuuMax: s.continuuMax ? durata(s.continuuMax.sec) : '—', continuuMaxZi: s.continuuMax ? ziText(s.continuuMax.zi, o.acum) : '',
      sursa: s.sursa === 'tahograf' ? 'tahograf' : (s.sursa === 'amestec' ? 'tahograf + GPS' : 'estimat din GPS') };
    return s;
  }).filter(function (s) { return s.condusSec > 0 || s.incalcari > 0; })
    .sort(function (a, b) { return b.incalcari - a.incalcari || (a.faraSofer - b.faraSofer) || b.condusSec - a.condusSec; });
  const incalcari = [];
  (o.valori || []).forEach(function (v) {
    (v.incalcari || []).forEach(function (ce) { incalcari.push({ cheie: v.cheie, nume: v.sofer, zi: v.zi, ziText: ziText(v.zi, o.acum), ce: ce, masini: v.masini || [], sursa: v.sursa }); });
  });
  incalcari.sort(function (a, b) { return a.zi < b.zi ? -1 : (a.zi > b.zi ? 1 : String(a.nume).localeCompare(String(b.nume), 'ro')); });
  const tot = soferi.reduce(function (a, s) { return a + s.condusSec; }, 0);
  const flota = { condusSec: tot, text: durata(tot), soferi: soferi.filter(function (s) { return !s.faraSofer; }).length, faraSofer: soferi.filter(function (s) { return s.faraSofer; }).length,
    zile: soferi.reduce(function (a, s) { return a + s.zile; }, 0), incalcari: incalcari.length, cuIncalcari: soferi.filter(function (s) { return s.incalcari > 0; }).length,
    supusi: soferi.filter(function (s) { return s.supus; }).length, tahograf: soferi.filter(function (s) { return s.sursa !== 'GPS'; }).length };
  const cel = function (f) { return soferi.reduce(function (m, s) { return s[f] && (!m || s[f].sec > m[f].sec) ? s : m; }, null); };
  const sZi = cel('ziMax'), sCont = cel('continuuMax');
  flota.ziMax = sZi && sZi.ziMax.sec > 0 ? { nume: sZi.nume, text: durata(sZi.ziMax.sec), cand: ziText(sZi.ziMax.zi, o.acum) } : null;
  flota.continuuMax = sCont && sCont.continuuMax.sec > 0 ? { nume: sCont.nume, text: durata(sCont.continuuMax.sec), cand: ziText(sCont.continuuMax.zi, o.acum) } : null;
  // Săptămâna dinainte (aceleași zile, pentru săptămâna de acum) — doar orele, fără judecată: mai mult condus nu e rău în sine.
  let inainte = null, fata = null;
  if (o.inaintePregatita) {
    const ti = (o.valoriInainte || []).reduce(function (a, v) { return a + (v.condusSec || 0); }, 0);
    inainte = { eticheta: o.etInainte, condusSec: ti, text: durata(ti) };
    const pe2 = (o.panaAzi ? 'pe ' : 'în ') + o.etInainte;
    if (!ti) fata = { fel: 'info', text: 'fără condus ' + pe2 + ' — nimic de comparat' };
    else { const d = tot - ti; fata = { fel: 'info', text: Math.abs(d) < 600 ? 'cam la fel ca ' + pe2 : (d > 0 ? '+' : '−') + durata(Math.abs(d)) + ' față de ' + o.etInainte }; }
  }
  return { soferi: soferi, incalcari: incalcari, flota: flota, inainte: inainte, fata: fata,
    recomandari: recomandariOreCondus({ soferi: soferi, incalcari: incalcari, flota: flota, eticheta: o.eticheta }) };
}
function recomandariOreCondus(x) {
  const out = [];
  x.soferi.filter(function (s) { return s.incalcari > 0; }).slice(0, 3).forEach(function (s) {
    const ale = x.incalcari.filter(function (i) { return i.cheie === s.cheie; });
    const lista = ale.slice(0, 3).map(function (i) { return i.ce + ' (' + i.ziText + ')'; }).join('; ') + (ale.length > 3 ? '; și încă ' + (ale.length - 3) : '');
    out.push({ fel: 'atentie', text: s.nume + ': ' + (s.incalcari === 1 ? 'o încălcare' : cant(s.incalcari, 'încălcare', 'încălcări')) + ' a Reg. 561 — ' + lista + '. ' +
      (s.sursa === 'GPS' ? 'E o estimare din GPS: verifică pe tahograf, apoi vorbește cu el.' : 'Vorbește cu el și verifică planificarea curselor.') });
  });
  if (x.soferi.length && !x.flota.supusi) out.push({ fel: 'info', text: 'Reg. 561 (orele de condus ale camioanelor și autobuzelor) nu se aplică la autoturisme și autoutilitare ușoare — orele de mai jos arată doar cât a condus fiecare.' });
  const gps = x.soferi.filter(function (s) { return s.supus && s.sursa === 'GPS'; }).length;
  if (gps) out.push({ fel: 'info', text: (gps === 1 ? 'La un șofer' : 'La ' + gps + ' șoferi') + ' orele sunt estimate din GPS (mașina nu trimite datele tahografului): în mers = condus. Pentru un control oficial contează tahograful.' });
  if (x.flota.faraSofer) out.push({ fel: 'info', text: (x.flota.faraSofer === 1 ? 'O mașină a mers' : cant(x.flota.faraSofer, 'mașină a mers', 'mașini au mers')) + ' fără șofer trecut în aplicație — orele nu se pot pune pe un om. Șoferul se trece din Management → Șoferi.' });
  if (x.flota.supusi && !x.flota.incalcari) out.push({ fel: 'bun', text: 'Nicio încălcare a Reg. 561 în ' + (x.eticheta || 'perioada asta') + '.' });
  return out;
}
// Cifrele din „Încălcări" sunt ale raportului (reports.js → rHos); proba le leagă de codul lui.
function explicatiiOreCondus() {
  return [
    { titlu: 'Orele', text: 'Din tahograf, unde mașina trimite starea șoferului (condus, muncă, disponibil, odihnă); altfel estimate din GPS: mașina în mers = condus, motor pornit pe loc = muncă. Aceeași socoteală ca raportul „Condus & repaus (Reg. 561)".' },
    { titlu: 'Pe cine', text: 'Fiecare zi merge pe șoferul care avea mașina atunci (Management → Șoferi). Mașinile care au mers fără șofer trecut apar cu numele lor.' },
    { titlu: 'Încălcările', text: 'Ale Regulamentului CE 561/2006, doar la camioane și autobuze (nu la autoturisme și autoutilitare ușoare): condus continuu peste 4h30 fără o pauză de 45 de minute; condus zilnic peste 10 ore, sau peste 9 ore de mai mult de două ori pe săptămână; condus săptămânal peste 56 de ore. Repausul zilnic sub 9 ore se verifică doar cu tahograful (din GPS nu se vede).' },
    { titlu: 'Săptămâna', text: 'De luni până duminică, pe ora României. Săptămâna de acum se compară cu aceleași zile din săptămâna trecută.' },
  ];
}

module.exports = {
  ZI, zz, zilePana,
  candData, candKm, candRand, ordoneaza, rezumatMentenanta, explicatiiMentenanta,
  PESTE_NORMA, KM_MIN_NORMA, cand, alcatuiesteCombustibil, recomandariCombustibil, explicatiiCombustibil,
  durata, ziText, alcatuiesteOreCondus, recomandariOreCondus, explicatiiOreCondus,
};
