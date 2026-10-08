// cifre.js — cifrele în care omul trebuie să aibă încredere (Alin, 08.10: „să aibă grijă cumva să nu dea greșit").
//
//   1. numere(text)            — cifrele dintr-un text sau dintr-un JSON („4.230" = patru mii, „12,3", „06.10" = două cifre).
//                                O folosesc Scrisoarea de luni (ramuri.textulTrece) și verificarea răspunsurilor de mai jos.
//   2. negasite(text, date)    — cifrele „flotei" (cu unitate: km, litri, lei, %, l/100 km, km/h) din răspunsul lui RA Insight
//                                care NU se găsesc în datele pe care le-a citit — nici ca atare, nici socotite din ele
//                                (totaluri, diferențe și procente între două perioade, litri la 100 km, lei pe litru).
//                                Duratele nu se verifică (vezi mai jos).
//   3. perioadaDiferita(...)   — perioada citită nu e cea cerută (a cerut 1–7 octombrie, a citit toată luna).
//   4. consumDeVerificat(...)  — cifre greu de crezut la consum: sub 3 sau peste 40 l/100 km (la camioane: sub 10 sau peste
//                                70), prețul pe litru sub 3 sau peste 12 lei. Le marchează „de verificat", nu le schimbă.
//
// Curat: fără bază de date și fără server. Pragurile stau AICI și nicăieri altundeva.
'use strict';

// ─── 1. Cifrele dintr-un text ──────────────────────────────────────────────────────────────────────
function numere(t) {
  const out = [];
  String(t).replace(/\d+(?:[.,]\d+)*/g, function (m) {
    if (/^\d{1,3}(\.\d{3})+$/.test(m)) out.push(Number(m.replace(/\./g, '')));          // 4.230 = patru mii
    else if (/^\d+,\d+$/.test(m)) out.push(Number(m.replace(',', '.')));               // 12,3
    else if (/^\d+\.\d+$/.test(m) && !/^\d{1,2}\.\d{2}$/.test(m)) out.push(Number(m)); // 12.3 (din JSON)
    else m.split(/[.,]/).forEach(function (x) { if (x) out.push(Number(x)); });         // 06.10 = două cifre
    return m;
  });
  return out;
}

// ─── 2. Cifrele din răspuns, față de datele citite ────────────────────────────────────────────────
// Mereu pe voie: „la 100 km", pragul EcoDrive de 90 km/h, „Reg. 561/2006" — unități și nume, nu cifre ale flotei.
const MEREU = [100, 90, 561, 2006];
// Cifrele mici (până la 12, întregi) nu se verifică: „3 mașini", „2 opriri", „Logan 3" — riscul e mic, zgomotul mare.
const MICI = 12;
// După unitatea scrisă lângă cifră știm ce fel de cifră e; la fel, după numele câmpului din date.
const FELURI = [
  ['l100', /^(?:l|litri)\s?(?:\/|la)\s?100\s?(?:de\s)?km/],
  ['kmh', /^km\s?\/\s?h/],
  ['km', /^(?:km|kilometri)(?![a-z])/],
  ['litri', /^(?:litri|litru|l)(?![a-z])/],
  ['lei', /^(?:lei|ron)(?![a-z])/],
  ['pct', /^(?:%|procente)/],
  ['timp', /^(?:ore|ora|oră|h|minute|min)(?![a-z])/],
];
function _felUnitate(dupa) {
  const t = String(dupa).toLowerCase().replace(/^\s+/, '').replace(/^de\s+/, '');
  for (const f of FELURI) if (f[1].test(t)) return f[0];
  return null;
}
function _felCheie(k) {
  const t = String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]/g, ' ');
  if (/l100|per100|la 100|100 ?km|consum.*100/.test(t)) return 'l100';
  if (/viteza|speed|km\/h|kmh/.test(t)) return 'kmh';
  if (/procent|pct|%/.test(t)) return 'pct';
  // banii întâi: „pret_litru_lei" e un preț, nu litri (altfel totalul de litri al listei ieșea umflat cu prețurile)
  if (/cost|lei|pret|ron|valoare|suma/.test(t)) return 'lei';
  if (/(^|[^a-z])km([^a-z]|$)|dist|kilometr/.test(t)) return 'km';
  if (/litr|consumed|alimentat|scazut/.test(t)) return 'litri';
  if (/(^|[^a-z])(ore|ora|h)([^a-z]|$)|durata|condus|timp|minut/.test(t)) return 'timp';
  return null;
}
function _numar(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*[+−-]?\d/.test(v)) { const n = numere(v.replace(/^\s*[+−-]/, '')); return n.length ? n[0] : null; }
  return null;
}
// Ce se poate socoti din date: totalurile unei liste, diferențele și procentele între cifre de același fel venite din
// locuri DIFERITE (perioada asta față de cea dinainte), partea unei mașini din total, litri la 100 km, lei pe litru.
function _socotite(date) {
  const base = new Set(MEREU);
  numere(JSON.stringify(date || null)).forEach(function (n) { base.add(n); });
  const fel = {};   // fel → listă de cifre socotite
  const adauga = function (f, v) { if (f && isFinite(v)) (fel[f] = fel[f] || []).push(v); };
  const grupe = {}; // fel → [{ v, loc }] — loc = de unde vine (aceeași listă = același loc)
  const pune = function (f, v, loc) { if (f && v != null && isFinite(v)) (grupe[f] = grupe[f] || []).push({ v: v, loc: loc }); };
  let id = 0;
  const rapoarte = function (cols, rows, loc) {
    cols.forEach(function (c, j) {
      const f = _felCheie(c); if (!f) return;
      const vs = rows.map(function (r) { return Array.isArray(r) ? _numar(r[j]) : null; }).filter(function (x) { return x != null; });
      vs.forEach(function (v) { pune(f, v, loc); });
      if (vs.length >= 2) { const s = vs.reduce(function (a, b) { return a + b; }, 0); adauga(f, s); vs.forEach(function (v) { if (s) adauga('pct', v / s * 100); }); }
    });
  };
  // inLista = obiectul e un rând dintr-o listă deja numărată (mai sus, ca listă): cifrele lui nu intră a doua oară în grupe.
  const umbla = function (x, inLista) {
    if (Array.isArray(x)) {
      const ob = x.filter(function (e) { return e && typeof e === 'object' && !Array.isArray(e); });
      const lista = ob.length >= 2;
      if (lista) {
        const loc2 = 'lista' + (++id), chei = {};
        ob.forEach(function (o) { Object.keys(o).forEach(function (k) { chei[k] = 1; }); });
        Object.keys(chei).forEach(function (k) {
          const f = _felCheie(k); if (!f) return;
          const vs = ob.map(function (o) { return _numar(o[k]); }).filter(function (v) { return v != null; });
          vs.forEach(function (v) { pune(f, v, loc2); });
          if (vs.length >= 2) { const s = vs.reduce(function (a, b) { return a + b; }, 0); adauga(f, s); vs.forEach(function (v) { if (s) adauga('pct', v / s * 100); }); }
        });
        // totalurile listei, una față de alta: litri la 100 km, lei pe litru
        const suma = function (fl) { let s = 0, are = false; ob.forEach(function (o) { Object.keys(o).forEach(function (k) { if (_felCheie(k) === fl) { const v = _numar(o[k]); if (v != null) { s += v; are = true; } } }); }); return are ? s : null; };
        const sKm = suma('km'), sL = suma('litri'), sLei = suma('lei');
        if (sKm && sL != null) adauga('l100', sL / sKm * 100);
        if (sL && sLei != null) adauga('lei', sLei / sL);
      }
      x.forEach(function (e) { umbla(e, lista && e && typeof e === 'object' && !Array.isArray(e)); });
      return;
    }
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x.columns) && Array.isArray(x.rows)) rapoarte(x.columns, x.rows, 'raport' + (++id));
    const locObiect = 'obiect' + (++id);
    const val = {};
    Object.keys(x).forEach(function (k) {
      const v = x[k];
      if (v && typeof v === 'object') { umbla(v, false); return; }
      const n = _numar(v), f = _felCheie(k);
      if (n != null && f) { if (!inLista) pune(f, n, locObiect); (val[f] = val[f] || []).push(n); }
    });
    // pe același obiect (o mașină, flota): litri la 100 km, lei pe litru, lei pe km
    (val.km || []).forEach(function (km) { if (!km) return; (val.litri || []).forEach(function (l) { adauga('l100', l / km * 100); }); (val.lei || []).forEach(function (lei) { adauga('lei', lei / km); }); });
    (val.litri || []).forEach(function (l) { if (!l) return; (val.lei || []).forEach(function (lei) { adauga('lei', lei / l); }); });
  };
  umbla(date, false);
  // Diferențe și procente între cifre de același fel, din locuri diferite (o listă cu ea însăși nu se compară:
  // „B 154 UIP față de B 268 ROY" e rar, iar perechile din aceeași listă ar face aproape orice cifră „găsită").
  Object.keys(grupe).forEach(function (f) {
    const g = grupe[f].slice(0, 60);
    for (let i = 0; i < g.length; i++) for (let j = 0; j < g.length; j++) {
      if (i === j || g[i].loc === g[j].loc) continue;
      const a = g[i].v, b = g[j].v;
      adauga(f, Math.abs(a - b));
      if (b) adauga('pct', Math.abs((a - b) / b * 100));
    }
  });
  Object.keys(fel).forEach(function (f) { fel[f].sort(function (a, b) { return a - b; }); });
  return { base: Array.from(base).sort(function (a, b) { return a - b; }), fel: fel };
}
function _aproape(lista, v, tol) {
  let lo = 0, hi = lista.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lista[m] < v - tol) lo = m + 1; else if (lista[m] > v + tol) hi = m - 1; else return true; }
  return false;
}
// Cifrele cu unitate din răspuns: { text: „702 km", v: 702, zec: 0, fel: 'km' }
function cifreleRaspunsului(text) {
  // fără semnele de formatare ale răspunsului („**734** km", „**734 km**"): altfel unitatea s-ar citi „km**" sau deloc
  const t = String(text || '').replace(/[*_`]/g, ''), out = [];
  const re = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/g; let m;
  while ((m = re.exec(t))) {
    const tok = m[1], inainte = t.slice(Math.max(0, m.index - 1), m.index), dupa = t.slice(m.index + tok.length, m.index + tok.length + 24);
    if (/[A-Za-z0-9ăâîșțĂÂÎȘȚ:./]/.test(inainte) || /^[A-Za-z0-9:]/.test(dupa) || /^[.,]\d/.test(dupa)) continue;   // „B112RFG", „13:42", „08.10.2026"
    const fel = _felUnitate(dupa); if (!fel) continue;
    let v, zec = 0;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(tok)) { const p = tok.replace(/\./g, '').split(','); v = Number(p[0] + (p[1] ? '.' + p[1] : '')); zec = p[1] ? p[1].length : 0; }
    else if (/,/.test(tok)) { const p = tok.split(','); v = Number(p[0] + '.' + p[1]); zec = p[1].length; }
    else if (/\./.test(tok)) { const p = tok.split('.'); v = Number(tok); zec = p[1].length; }
    else v = Number(tok);
    if (!isFinite(v)) continue;
    const unit = (dupa.replace(/^\s+/, '').match(/^(?:de\s+)?(?:l\s?\/\s?100\s?km|l\s?la\s?100\s?km|litri la 100 km|[^\s,.;:)]+)/i) || [''])[0];
    out.push({ text: tok + (/^%/.test(unit) ? '' : ' ') + unit, v: v, zec: zec, fel: fel });
  }
  return out;
}
// Cifrele „flotei" din răspuns care nu se găsesc în date, nici socotite din ele. [] = toate se regăsesc.
// Duratele NU se verifică: aceeași durată se scrie în prea multe feluri („1h 23m", „83 de minute", „1,4 ore", „01:23"),
// iar o bandă „de verificat" pusă pe o cifră bună ar strica încrederea mai mult decât ajută.
function negasite(text, date) {
  const s = _socotite(date), lipsa = [], vazut = new Set();
  cifreleRaspunsului(text).forEach(function (c) {
    if (c.fel === 'timp') return;
    if (c.zec === 0 && c.v <= MICI) return;
    const tol = 0.5 * Math.pow(10, -c.zec) + 1e-9;
    if (_aproape(s.base, c.v, tol) || (s.fel[c.fel] && _aproape(s.fel[c.fel], c.v, tol))) return;
    if (!vazut.has(c.text)) { vazut.add(c.text); lipsa.push(c.text); }
  });
  return lipsa;
}

// ─── 3. Perioada citită față de cea cerută ────────────────────────────────────────────────────────
// ceruta = { from, to, eticheta } (ce a scris omul); citite = [{ from, to, eticheta }] (ce s-a citit). Capetele se pot
// abate cu cel mult o oră (ora României / ora serverului); „până acum" se potrivește cu „până acum".
const ABATERE_MS = 3600000;
function _ms(x) { return typeof x === 'number' ? x : Date.parse(x); }
function perioadaDiferita(ceruta, citite, acum) {
  if (!ceruta || !Array.isArray(citite) || !citite.length) return null;
  const now = acum != null ? Number(acum) : Date.now();
  const cf = _ms(ceruta.from), ct = _ms(ceruta.to);
  if (!isFinite(cf) || !isFinite(ct)) return null;
  const potrivit = citite.some(function (c) {
    const f = _ms(c.from), t = _ms(c.to);
    if (!isFinite(f) || !isFinite(t)) return false;
    const capat = Math.abs(t - ct) <= ABATERE_MS || (Math.abs(t - now) <= 10 * 60000 && Math.abs(ct - now) <= 10 * 60000);
    return Math.abs(f - cf) <= ABATERE_MS && capat;
  });
  if (potrivit) return null;
  const et = Array.from(new Set(citite.map(function (c) { return c.eticheta; }).filter(Boolean)));
  if (!et.length || !ceruta.eticheta) return null;
  return 'Ai cerut ' + ceruta.eticheta + '; cifrele sunt pentru ' + et.join(' și ') + '.';
}

// ─── 4. Cifre greu de crezut, la consum ───────────────────────────────────────────────────────────
const CONSUM = { min: 3, max: 40 }, CONSUM_CAMION = { min: 10, max: 70 }, PRET = { min: 3, max: 12 };
const KM_SIGUR = 50;   // sub atât, un consum ciudat e mai degrabă puțin drum decât o greșeală
function _nr(v, z) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: z || 0, maximumFractionDigits: z || 0 }); }
// { l100, km, pret, camion, electric } → [] sau textele „de verificat" (fără numele mașinii — îl pune cine le arată).
function consumDeVerificat(o) {
  o = o || {};
  const out = [];
  if (o.electric) return out;
  const p = o.camion ? CONSUM_CAMION : CONSUM;
  if (o.l100 != null && isFinite(o.l100) && (o.l100 < p.min || o.l100 > p.max)) {
    if (o.km != null && o.km < KM_SIGUR) out.push(_nr(o.l100, 1) + ' l/100 km pe doar ' + _nr(o.km) + ' km — prea puțin drum ca cifra să fie sigură');
    else out.push(_nr(o.l100, 1) + ' l/100 km — neobișnuit de ' + (o.l100 < p.min ? 'mic' : 'mare') + '; verifică senzorul, contorul sau consumul din fișă');
  }
  if (o.pret != null && isFinite(o.pret) && o.pret > 0 && (o.pret < PRET.min || o.pret > PRET.max)) {
    out.push('prețul pe litru, ' + _nr(o.pret, 2) + ' lei, pare greșit — verifică prețul carburantului din setări');
  }
  return out;
}

module.exports = { numere, MEREU, MICI, cifreleRaspunsului, negasite, perioadaDiferita, ABATERE_MS,
  CONSUM, CONSUM_CAMION, PRET, KM_SIGUR, consumDeVerificat, _socotite };
