// condus.js — „Safe Drive & costuri" (ramura din RA Insight; Alin, 02.10: „SAFE DRIVE, CU COSTURI").
//
// Cum conduce fiecare mașină și fiecare șofer și cât costă asta în lei, pe luni, cu luna dinainte alături, unde și când se
// repetă manevrele bruște și ce s-a schimbat după ce șeful a vorbit cu șoferul. Totul pe REGULI, fără model: se probează
// (verify_safe_drive.js). Fără bază și fără rețea: serverul aduce pozițiile și ce e de știut despre mașină.
//
//   • PRAGURILE și SCORUL sunt ale raportului EcoDrive (reports.js le citește de aici) — o singură regulă, ca pagina Safe
//     Drive și raportul să nu se contrazică pe aceeași lună.
//   • `agregator` trece o dată prin pozițiile unei mașini (în ordinea timpului, pe pagini) și scoate câte un rând pe
//     ZI (ora României) și pe ȘOFER: km, timp de mers, manevre bruște, timp și km peste 90 km/h, ralanti, plus ORELE și
//     LOCURILE manevrelor (pe celule de ~500 m — destul ca să spui „în zona X", fără să păstrezi fiecare punct).
//     Rândul ține doar ce s-a MĂSURAT (litrii din contorul CAN, orele de ralanti fără contor, „cât de repede" peste 90);
//     litrii estimați și leii se socotesc la citire (`litri`, `costuri`), cu consumul și prețul de AZI ale mașinii — o
//     corectură în fișa mașinii se vede pe loc, fără să refacem zilele.
//   • `insumeaza` / `scor` / `costuri` fac din zile o lună (sau orice fereastră: „înainte" și „după" o discuție).
'use strict';
const { nr, cant } = require('./ai_raport');

// ─── Pragurile (ale raportului EcoDrive) ────────────────────────────────────────────────────────────────
const PRAGURI = { accel: 7, frana: 9, viraj: 25, limita: 90 };   // km/h pe secundă, km/h pe secundă, grade pe secundă, km/h
const MERS = 3;              // km/h — sub atât mașina stă (IDLE_SPEED din reports.js)
const PAS_MAX_KM = 10;       // salt GPS aberant (MAX_STEP_KM din reports.js)
const PAUZA_MAX_S = 300;     // două puncte la mai mult de 5 minute nu se leagă
const BRUSC_MAX_S = 30;      // o manevră bruscă se vede doar între puncte apropiate
const VITEZA_VIRAJ = 25;     // virajele bruște contează doar peste 25 km/h
const RALANTI_MIN_S = 180;   // ralanti = cel puțin 3 minute pe loc cu motorul pornit (ca raportul Ralanti)
const CELULA_GRADE = 0.005;  // ~500 m: „unde se repetă" spune zona, nu punctul
const CELULE_MAX_ZI = 40;    // pe o zi se țin cel mult atâtea zone (cele cu cele mai multe manevre)
// Combustibilul pus în plus de viteză: la 90 km/h cam o TREIME din consum se duce pe învingerea aerului, iar aerul crește
// cu pătratul vitezei. Rezultă cifrele cunoscute: la 120 km/h cam +26%, la 130 cam +36% față de 90. Estimare, spusă pe față.
const PARTE_AER = 1 / 3;

// Scorul EcoDrive (0–100) și nota, din sume: aceeași formulă ca raportul (rEcoDrive / rEcoDriveDrivers).
function scor(t) {
  const km = t.km || 0, per100 = km > 1 ? 100 / km : 0;
  const condus = t.condusSec || 0, ralanti = t.ralantiSec || 0;
  const vitezaParte = condus > 0 ? (t.pesteSec || 0) / condus : 0;
  const ralantiParte = (condus + ralanti) > 0 ? ralanti / (condus + ralanti) : 0;
  let pen = 0;
  pen += Math.min(30, (t.accel || 0) * per100 * 2.5);
  pen += Math.min(35, (t.frana || 0) * per100 * 3.0);
  pen += Math.min(20, (t.viraj || 0) * per100 * 2.0);
  pen += Math.min(25, vitezaParte * 100);
  pen += Math.min(15, ralantiParte * 40);
  const s = Math.max(0, Math.round(100 - pen));
  return { scor: s, nota: notaDin(s) };
}
function notaDin(s) { return s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 40 ? 'D' : 'E'; }
// O mașină / un șofer care abia a mers nu primește scor (ca în raport: sub 0,5 km și sub un minut de mers).
function areScor(t) { return !((t.km || 0) < 0.5 && (t.condusSec || 0) < 60); }
// Scorul flotei: media scorurilor, cântărită cu km (cel puțin 1) — „Scor flotă" din raportul EcoDrive.
// lista = [{ scor, km }], doar cele care AU scor.
function scorFlota(lista) {
  let sw = 0, w = 0;
  (lista || []).forEach(function (x) { const k = Math.max(1, x.km || 0); sw += x.scor * k; w += k; });
  return w > 0 ? Math.round(sw / w) : 0;
}

// ─── Ziua și ora pe ora României ────────────────────────────────────────────────────────────────────────
const _fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
function _parti(ms) { const o = {}; _fmt.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') o[x.type] = x.value; }); return o; }
function zi(ms) { const p = _parti(ms); return p.year + '-' + p.month + '-' + p.day; }
function ora(ms) { return Number(_parti(ms).hour) % 24; }
const ZILE_SAPT = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
// 0 = luni … 6 = duminică, pentru o zi „AAAA-LL-ZZ" (data calendaristică, fără oră).
function ziSapt(ziStr) { const d = new Date(ziStr + 'T12:00:00Z').getUTCDay(); return (d + 6) % 7; }
// Șoferul unei mașini la o clipă, din istoricul ei (de_la ≤ clipa < pana_la). 0 = nimeni.
function soferLa(intervale) {
  const v = (intervale || []).slice().sort(function (a, b) { return a.de_la - b.de_la; });
  return function (ms) {
    for (let i = v.length - 1; i >= 0; i--) if (v[i].de_la <= ms && (v[i].pana_la == null || ms < v[i].pana_la)) return v[i].driver_id;
    return 0;
  };
}
function celula(lat, lng) {
  const r = function (v) { return (Math.round(Number(v) / CELULA_GRADE) * CELULA_GRADE).toFixed(3); };
  return r(lat) + ',' + r(lng);
}

// ─── Rândul gol al unei zile ────────────────────────────────────────────────────────────────────────────
// pesteF = Σ km × ((v / 90)² − 1) pe bucățile de drum peste 90 km/h — din el ies litrii puși în plus de viteză (`litri`).
// ralantiOreEst = orele de ralanti fără contor CAN care să le măsoare (se înmulțesc cu L/h ale mașinii, la citire).
const NUMERE = ['km', 'condusSec', 'ralantiSec', 'pesteSec', 'pesteKm', 'pesteF', 'accel', 'frana', 'viraj', 'ralantiEp', 'ralantiEpSec', 'ralantiOreEst', 'ralantiLMasurat'];
function gol(ziStr, sofer) {
  const g = { zi: ziStr, sofer: sofer || 0, vmax: 0, ore: new Array(24).fill(0), celule: {} };
  NUMERE.forEach(function (k) { g[k] = 0; });
  return g;
}

// ─── Trecerea prin pozițiile unei mașini ────────────────────────────────────────────────────────────────
// o = { limita (km/h), soferLa(ms) → id șofer sau 0, ajutor: { ignOn, engineRunning, fuelCumul, haversineKm } (din
//       reports.js — aceleași citiri ale contactului, motorului și contorului ca rapoartele) }.
// Punctele vin în ordinea timpului (pe pagini); starea (punctul anterior, ralantiul în curs) trece peste capătul paginii.
function agregator(o) {
  const A = o.ajutor, limita = o.limita || PRAGURI.limita;
  const praguri = Object.assign({}, PRAGURI, o.praguri || {});
  const soferLa = typeof o.soferLa === 'function' ? o.soferLa : function () { return 0; };
  const zile = new Map();
  function galeata(ms, sofer) {
    const z = zi(ms), k = z + '|' + sofer;
    let g = zile.get(k); if (!g) { g = gol(z, sofer); zile.set(k, g); }
    return g;
  }
  function manevra(g, tip, ms, p) {
    g[tip]++; g.ore[ora(ms)]++;
    const c = celula(p.latitude, p.longitude); g.celule[c] = (g.celule[c] || 0) + 1;
  }
  let prev = null, ral = null;
  function inchideRalanti() {
    if (!ral) return;
    const dur = (ral.ultimMs - ral.startMs) / 1000;
    if (dur >= RALANTI_MIN_S) {
      // Litri REALI din contorul CAN (diferența de la început la capăt), dacă e plauzibil (≥ 0,3 L/h, sub 30 L) — altfel
      // orele se țin deoparte și se înmulțesc la citire cu L/h ale mașinii. Aceeași regulă ca raportul Ralanti.
      const fs = A.fuelCumul(ral.startP), fe = A.fuelCumul(ral.capatP), h = dur / 3600;
      const delta = (fs != null && fe != null && fe >= fs && (fe - fs) < 30) ? (fe - fs) : null;
      const real = (delta != null && h > 0 && (delta / h) >= 0.3) ? delta : null;
      const g = galeata(ral.startMs, ral.sofer);
      g.ralantiEp++; g.ralantiEpSec += dur;
      if (real != null) g.ralantiLMasurat += real; else g.ralantiOreEst += h;
    }
    ral = null;
  }
  return {
    adauga: function (p) {
      const ms = new Date(p.timestamp).getTime();
      const sofer = soferLa(ms) || 0;
      const sp = p.speed || 0;
      if (A.engineRunning(p) && sp <= MERS) { if (!ral) ral = { startMs: ms, startP: p, sofer: sofer }; ral.ultimMs = ms; ral.capatP = p; }
      else inchideRalanti();
      if (prev) {
        const dt = (ms - prev.ms) / 1000;
        if (dt > 0 && dt <= PAUZA_MAX_S) {
          const g = galeata(ms, sofer);
          const dist = A.haversineKm(prev.p.latitude, prev.p.longitude, p.latitude, p.longitude);
          const bun = dist < PAS_MAX_KM;
          if (bun) g.km += dist;
          if (sp > g.vmax) g.vmax = sp;
          if (sp > limita) {
            g.pesteSec += dt;
            // km × consum × o treime × ((v / 90)² − 1) — vezi PARTE_AER. Pragul e al raportului EcoDrive (90 km/h), nu
            // limita legală a drumului: pe autostradă 130 e legal, dar tot costă combustibil în plus față de 90.
            if (bun) { g.pesteKm += dist; g.pesteF += dist * (Math.pow(sp / limita, 2) - 1); }
          }
          if (sp > MERS) g.condusSec += dt; else if (A.ignOn(p)) g.ralantiSec += dt;
          if (dt <= BRUSC_MAX_S) {
            const spPr = prev.p.speed || 0, a = (sp - spPr) / dt;
            if (a > praguri.accel) manevra(g, 'accel', ms, p);
            if (a < -praguri.frana) manevra(g, 'frana', ms, p);
            if (sp > VITEZA_VIRAJ) {
              let da = Math.abs((p.angle || 0) - (prev.p.angle || 0)); if (da > 180) da = 360 - da;
              if (da / dt > praguri.viraj) manevra(g, 'viraj', ms, p);
            }
          }
        }
      }
      prev = { ms: ms, p: p };
    },
    // Rândurile zilelor (câte unul pe zi și șofer), cu zonele tăiate la cele mai încărcate. Numerele NU se rotunjesc:
    // rotunjite pe fiecare zi, pe o lună s-ar fi adunat cât să mute o cifră peste o zecime (40,15 → 40,2 în loc de 40,1)
    // și pagina s-ar fi contrazis cu raportul EcoDrive.
    gata: function () {
      inchideRalanti();
      return Array.from(zile.values()).map(function (g) {
        const c = Object.entries(g.celule).sort(function (a, b) { return b[1] - a[1]; }).slice(0, CELULE_MAX_ZI);
        g.celule = {}; c.forEach(function (x) { g.celule[x[0]] = x[1]; });
        return g;
      });
    },
  };
}

// ─── Din zile, o lună (sau orice fereastră) ─────────────────────────────────────────────────────────────
function insumeaza(randuri) {
  const t = gol('', 0); delete t.zi; delete t.sofer; t.zile = 0;
  const vazute = new Set();
  (randuri || []).forEach(function (r) {
    const d = r.date || r;
    NUMERE.forEach(function (k) { t[k] += Number(d[k]) || 0; });
    if ((d.vmax || 0) > t.vmax) t.vmax = d.vmax;
    (d.ore || []).forEach(function (n, h) { t.ore[h] += Number(n) || 0; });
    Object.entries(d.celule || {}).forEach(function (x) { t.celule[x[0]] = (t.celule[x[0]] || 0) + x[1]; });
    if ((Number(d.km) || 0) > 0.5) vazute.add(r.zi || d.zi);
  });
  t.zile = vazute.size;
  return t;
}
function manevre(t) { return (t.accel || 0) + (t.frana || 0) + (t.viraj || 0); }
function laSuta(n, km) { return km > 1 ? n / km * 100 : null; }

// ─── Costurile în lei ───────────────────────────────────────────────────────────────────────────────────
// Trei bucăți, fiecare cu socoteala pe față:
//   1. ralantiul: litrii (măsurați din contorul CAN, ori estimați) × prețul combustibilului;
//   2. viteza: combustibilul pus în plus de viteza peste limită (vezi sus, la `agregator`) × prețul;
//   3. manevrele bruște: un preț pe eveniment (frânele și anvelopele se tocesc mai repede, iar combustibilul ars la o
//      accelerare se aruncă la frânarea de după) — ESTIMARE, pe clasa mașinii; firma își pune cifrele ei.
const CLASE = [
  { k: 'autoturism', et: 'Autoturism' },
  { k: 'duba', et: 'Dubă / utilitar' },
  { k: 'camion', et: 'Camion / autobuz' },
];
const PRETURI_IMPLICITE = {
  autoturism: { frana: 0.20, accel: 0.15, viraj: 0.10 },
  duba: { frana: 0.40, accel: 0.30, viraj: 0.20 },
  camion: { frana: 1.50, accel: 1.00, viraj: 0.50 },
};
function clasa(tip) {
  const t = String(tip || '').toLowerCase();
  if (/truck|camion|tir|lorry|tractor|autobuz|autocar|\bbus\b/.test(t)) return 'camion';
  if (/van|dub|autoutil|furgon|utilitar/.test(t)) return 'duba';
  return 'autoturism';
}
// Prețurile firmei peste cele de pornire. Doar numere între 0 și 100 de lei, cu 2 zecimale; altceva → prețul de pornire.
function preturi(salvate) {
  const out = {};
  CLASE.forEach(function (c) {
    out[c.k] = {};
    ['frana', 'accel', 'viraj'].forEach(function (e) {
      const v = salvate && salvate[c.k] ? Number(salvate[c.k][e]) : NaN;
      out[c.k][e] = (isFinite(v) && v >= 0 && v <= 100) ? Math.round(v * 100) / 100 : PRETURI_IMPLICITE[c.k][e];
    });
  });
  return out;
}
// Litrii unei mașini, din sumele ei: m = { l100 (consumul, L/100 km), lph (L/h la ralanti, fără contor CAN) }.
function litri(t, m) {
  return {
    ralanti: (t.ralantiLMasurat || 0) + (t.ralantiOreEst || 0) * ((m && m.lph) || 0),
    viteza: (t.pesteF || 0) * ((m && m.l100) || 0) / 100 * PARTE_AER,
  };
}
// Leii: m = { l100, lph, pretL (lei pe litru) }, pretEv = prețurile pe eveniment ale clasei mașinii.
// Manevrele, pe cele două feluri de pe pagină: „Combustibil" (accelerările bruște) și „Frâne și anvelope" (frânările și
// virajele bruște); `manevre` = amândouă.
function costuri(t, m, pretEv) {
  const l = litri(t, m), pretL = (m && m.pretL) || 0;
  const ralanti = l.ralanti * pretL, viteza = l.viteza * pretL;
  const accel = (t.accel || 0) * pretEv.accel, frane = (t.frana || 0) * pretEv.frana + (t.viraj || 0) * pretEv.viraj;
  const r2 = function (x) { return Math.round(x * 100) / 100; };
  return { ralanti: r2(ralanti), viteza: r2(viteza), accel: r2(accel), frane: r2(frane), manevre: r2(accel + frane), total: r2(ralanti + viteza + accel + frane),
    litri: { ralanti: r2(l.ralanti), viteza: r2(l.viteza) } };
}
function adunaCosturi(lista) {
  const t = { ralanti: 0, viteza: 0, accel: 0, frane: 0, manevre: 0, total: 0 }, l = { ralanti: 0, viteza: 0 };
  lista.forEach(function (c) {
    Object.keys(t).forEach(function (k) { t[k] += c[k] || 0; });
    if (c.litri) { l.ralanti += c.litri.ralanti || 0; l.viteza += c.litri.viteza || 0; }
  });
  const r2 = function (x) { return Math.round(x * 100) / 100; };
  Object.keys(t).forEach(function (k) { t[k] = r2(t[k]); });
  t.litri = { ralanti: r2(l.ralanti), viteza: r2(l.viteza) };
  return t;
}
const lei = function (n) { return cant(Math.round(n), 'leu', 'lei'); };

// ─── Unde și când se repetă ─────────────────────────────────────────────────────────────────────────────
// Zonele cu cele mai multe manevre bruște (cel puțin `min`), cele mai încărcate întâi.
function locuri(celule, n, min) {
  return Object.entries(celule || {}).filter(function (x) { return x[1] >= (min || 3); })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, n || 3)
    .map(function (x) { const p = x[0].split(','); return { lat: Number(p[0]), lng: Number(p[1]), n: x[1] }; });
}
// Ferestrele de 3 ore, pe zi a săptămânii, cu cele mai multe manevre: „vineri, 16–19: 14 manevre".
function ferestre(randuri, n, min) {
  const m = []; for (let d = 0; d < 7; d++) m.push(new Array(24).fill(0));
  (randuri || []).forEach(function (r) { const d = ziSapt(r.zi); ((r.date || r).ore || []).forEach(function (v, h) { m[d][h] += Number(v) || 0; }); });
  const cand = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h <= 21; h++) cand.push({ zi: d, de: h, n: m[d][h] + m[d][h + 1] + m[d][h + 2] });
  cand.sort(function (a, b) { return b.n - a.n; });
  const ales = [];
  cand.forEach(function (c) {
    if (c.n < (min || 5) || ales.length >= (n || 2)) return;
    if (ales.some(function (a) { return a.zi === c.zi && Math.abs(a.de - c.de) < 3; })) return;   // fără ferestre suprapuse
    ales.push(c);
  });
  return ales.map(function (c) { return { zi: ZILE_SAPT[c.zi], de: c.de, pana: c.de + 3, n: c.n, text: ZILE_SAPT[c.zi] + ', ' + c.de + '–' + (c.de + 3) }; });
}

// ─── Înainte și după o discuție („Am vorbit cu el") ─────────────────────────────────────────────────────
// a = sumele dinainte, b = de după. Comparăm la 100 km (altfel o lună cu mai puțin drum ar părea „mai bună").
function comparatie(a, b) {
  const ka = laSuta(manevre(a), a.km), kb = laSuta(manevre(b), b.km);
  if (ka == null || kb == null || (b.km || 0) < 20) return { fel: 'info', text: 'Prea puțin drum de atunci (' + cant(Math.round(b.km || 0), 'km', 'km') + ') — revino peste câteva zile.' };
  const sa = scor(a).scor, sb = scor(b).scor;
  const pr = ka > 0 ? Math.round((kb - ka) / ka * 100) : 0;
  const fel = kb < ka * 0.85 ? 'bun' : (kb > ka * 1.15 ? 'atentie' : 'info');
  const cum = fel === 'bun' ? 'Mai bine' : (fel === 'atentie' ? 'Mai rău' : 'Cam la fel');
  return { fel: fel, inainte: { laSuta: ka, scor: sa }, dupa: { laSuta: kb, scor: sb }, procent: pr,
    text: cum + ': manevre bruște la 100 km ' + nr(ka, 1) + ' → ' + nr(kb, 1) + (pr ? ' (' + (pr > 0 ? '+' : '') + pr + '%)' : '') + ' · scor ' + sa + ' → ' + sb + '.' };
}

// ─── „Cum se socotește" — scris o dată, aici; pagina și telefonul doar îl arată ──────────────────────────
function explicatii() {
  return [
    { titlu: 'Manevrele bruște', text: 'Aceleași praguri ca raportul EcoDrive: accelerare cu peste ' + PRAGURI.accel + ' km/h într-o secundă, frânare cu peste ' +
      PRAGURI.frana + ' km/h într-o secundă, viraj cu peste ' + cant(PRAGURI.viraj, 'grad', 'grade') + ' pe secundă (peste ' + VITEZA_VIRAJ + ' km/h). ' +
      'Fiecare are un preț, pe felul mașinii: frânele și anvelopele se tocesc mai repede, iar combustibilul ars la o accelerare se aruncă la frânarea de după. ' +
      'Prețurile sunt o estimare — firma își poate pune cifrele ei, mai jos.' },
    { titlu: 'Ralantiul', text: 'Opririle de cel puțin ' + cant(RALANTI_MIN_S / 60, 'minut', 'minute') + ' cu motorul pornit (ca raportul Ralanti). ' +
      'Litrii vin din contorul mașinii, unde îl are; altfel se estimează din consumul la ralanti din fișa mașinii (sau după felul ei). Lei = litri × prețul combustibilului.' },
    { titlu: 'Viteza', text: 'Peste ' + PRAGURI.limita + ' km/h (pragul raportului EcoDrive, nu limita drumului) mașina arde mai mult: aerul crește cu pătratul vitezei, ' +
      'iar la ' + PRAGURI.limita + ' km/h cam o treime din combustibil se duce pe el. La 130 km/h înseamnă cam ' + Math.round(PARTE_AER * (Math.pow(130 / PRAGURI.limita, 2) - 1) * 100) +
      '% în plus. Lei = litrii în plus × prețul combustibilului. E o estimare: spune cât costă graba, nu o amendă.' },
    { titlu: 'Prețul combustibilului', text: 'Al mașinii, din fișa ei; altfel cel al firmei (Setări → Prețuri combustibil); altfel media națională a zilei — ca la rapoartele de costuri.' },
    { titlu: 'Șoferul', text: 'Fiecare zi merge pe cine conducea mașina atunci, după ce e trecut în aplicație. Când schimbi șoferul unei mașini, zilele de până atunci rămân ale celui de dinainte.' },
  ];
}

// ─── Ce să faci: recomandări pe reguli ──────────────────────────────────────────────────────────────────
// m = mașinile lunii [{ eticheta, t, cost }], s = șoferii [{ nume, t, cost, discutie }], f = { ferestre, locuri (cu adresă) }.
function recomandari(m, s, f) {
  const out = [];
  const flotaKm = m.reduce(function (a, x) { return a + (x.t.km || 0); }, 0);
  const flotaMan = m.reduce(function (a, x) { return a + manevre(x.t); }, 0);
  const medie = laSuta(flotaMan, flotaKm);
  // 1. Cel mai scump ralanti
  const ral = m.filter(function (x) { return x.cost.ralanti >= 30; }).sort(function (a, b) { return b.cost.ralanti - a.cost.ralanti; })[0];
  if (ral) out.push({ fel: 'atentie', text: ral.eticheta + ' a stat cu motorul pornit, pe loc, ' + nr(ral.t.ralantiEpSec / 3600, 1) + ' ore — cam ' + lei(ral.cost.ralanti) + ' arși degeaba. O regulă simplă („motorul se oprește după 5 minute de stat") îi recuperează pe cei mai mulți.' });
  // 2. Viteza
  const vit = m.filter(function (x) { return x.cost.viteza >= 20 || (x.t.pesteSec || 0) >= 3600; }).sort(function (a, b) { return b.cost.viteza - a.cost.viteza; })[0];
  if (vit) out.push({ fel: 'atentie', text: vit.eticheta + ' a mers ' + cant(Math.round((vit.t.pesteSec || 0) / 60), 'minut', 'minute') + ' peste ' + PRAGURI.limita + ' km/h (cel mai repede ' + nr(vit.t.vmax) + ' km/h) — cam ' + lei(vit.cost.viteza) + ' de combustibil în plus, pe lângă risc.' });
  // 3. Șoferul cu cele mai multe manevre bruște (de cel puțin două ori media flotei)
  if (medie != null) {
    const sof = s.filter(function (x) { const k = laSuta(manevre(x.t), x.t.km); return x.id && k != null && (x.t.km || 0) >= 50 && k >= Math.max(5, medie * 2); })
      .sort(function (a, b) { return laSuta(manevre(b.t), b.t.km) - laSuta(manevre(a.t), a.t.km); })[0];
    if (sof) out.push({ fel: 'atentie', sofer: { id: sof.id, nume: sof.nume }, text: sof.nume + ' are ' + nr(laSuta(manevre(sof.t), sof.t.km), 1) + ' manevre bruște la 100 km, față de ' + nr(medie, 1) + ' media flotei. O discuție ajută des; după ea, apasă „Am vorbit cu el" și vezi aici, luna viitoare, dacă s-a schimbat ceva.' });
  }
  // 4. Când și unde se repetă
  if (f && f.ferestre && f.ferestre[0]) {
    // „Ora de vârf" doar când chiar e: zi de lucru, dimineața (7–10) sau după-amiaza (16–19).
    const x = f.ferestre[0], lucru = ZILE_SAPT.indexOf(x.zi) >= 0 && ZILE_SAPT.indexOf(x.zi) < 5, varf = lucru && ((x.de < 10 && x.pana > 7) || (x.de < 19 && x.pana > 16));
    out.push({ fel: 'info', text: 'Cele mai multe manevre bruște: ' + x.text + ' (' + x.n + '). ' + (varf ? 'E ora de vârf — un drum plecat cu 15 minute mai devreme scade graba.' : 'Merită aflat ce se întâmplă atunci: o cursă grăbită, un drum anume.') });
  }
  if (f && f.locuri && f.locuri[0] && f.locuri[0].n >= 5) out.push({ fel: 'info', text: 'Un loc unde se frânează și se accelerează des: ' + (f.locuri[0].adresa || ('zona ' + f.locuri[0].lat.toFixed(3) + ', ' + f.locuri[0].lng.toFixed(3))) + ' (' + f.locuri[0].n + ' manevre). Poate o intersecție grea sau o rampă — merită spus șoferilor.' });
  // 5. Discuțiile care au mers
  s.filter(function (x) { return x.discutie && x.discutie.comparatie && x.discutie.comparatie.fel === 'bun'; }).slice(0, 2)
    .forEach(function (x) { out.push({ fel: 'bun', text: 'După discuția cu ' + x.nume + ': ' + x.discutie.comparatie.text }); });
  if (!out.length && flotaKm > 50) out.push({ fel: 'bun', text: 'Flota a mers liniștit în perioada asta: nicio mașină și niciun șofer nu ies în evidență.' });
  return out;
}

module.exports = {
  PRAGURI, MERS, PAS_MAX_KM, RALANTI_MIN_S, CELULA_GRADE, PARTE_AER, CLASE, PRETURI_IMPLICITE, ZILE_SAPT,
  scor, notaDin, areScor, scorFlota, zi, ora, ziSapt, soferLa, celula, gol, agregator, insumeaza, manevre, laSuta,
  clasa, preturi, litri, costuri, adunaCosturi, locuri, ferestre, comparatie, recomandari, explicatii, lei,
};
