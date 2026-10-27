// alerte_stare.js — Alertele „de stare" (Alin, 27.10: „da"): sună când starea ÎNCEPE, nu la fiecare 5 minute cât ține.
// Până pe 27.10 o regulă ca „Uzură plăcuțe frână" suna la fiecare 5 minute cât plăcuțele erau sub prag — cam 96 de anunțuri
// într-o zi de 8 ore de mers, pe fiecare mașină. Acum: un anunț când apare; cât ține, o amintire pe zi; dacă trece și revine după
// cel puțin 30 de minute de normal, e o stare nouă și sună din nou. Curat: fără bază, fără server — serverul ține starea fiecărei
// reguli pe fiecare mașină și, după o repornire, citește o dată din istoricul alertelor când a sunat ultima oară.
'use strict';

// Tipurile „de stare": ceva care ține (o eroare, o temperatură, o greutate, priza de putere pornită, plăcuțele, revizia), nu o
// clipă (pornirea motorului, intrarea în zonă) și nu viteza (aceea sună cel mult o dată la 5 minute cât mașina merge peste — așa
// o spun ecranul Alerte și cartonașul din RA Insight).
const DE_STARE = ['dtc_error', 'engine_temp', 'overload_legal', 'overload_construct', 'axle_overload', 'pto_active', 'brake_pad_wear', 'service_due'];
const AMINTIRE_MS = 24 * 3600000;   // cât ține starea: o amintire pe zi
const REARMARE_MS = 30 * 60000;     // revenită după cel puțin 30 de minute de normal = o stare nouă (sub atât: aceeași, care „pâlpâie")

// Pe ecranul Alerte: fraza de sub câmpuri (fereastra regulii) și rândul scurt din listă.
const TEXT = 'Sună când apare. Cât ține, îți amintește o dată pe zi; dacă trece și revine după cel puțin 30 de minute, sună din nou.';
const RAND = 'sună la apariție, apoi o dată pe zi';

function eDeStare(tip) { return DE_STARE.indexOf(tip) >= 0; }

// Un număr din datele aparatului, sau null când lipsește (o poziție fără datele motorului nu spune nimic despre stare).
function _nr(v) {
  if (v === undefined || v === null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Ce spune poziția asta despre starea urmărită: { stare: true (în stare) / false (normal) / null (n-are datele), date }.
// `date` = ce se scrie în anunț (aceleași câmpuri ca înainte de 27.10, ca textele anunțurilor să rămână neschimbate).
function stareDin(tip, io, cond) {
  io = io || {}; cond = cond || {};
  switch (tip) {
    case 'dtc_error': {
      const n = _nr(io.can_dtc_errors);
      if (n === null) return { stare: null };
      return n > 0 ? { stare: true, date: { dtcCount: n } } : { stare: false };
    }
    case 'engine_temp': {
      const t = _nr(io.can_engine_temp), lim = _nr(cond.maxTemp);
      if (t === null || !lim) return { stare: null };   // „gol = dezactivat"
      return t > lim ? { stare: true, date: { temp: t, limit: lim } } : { stare: false };
    }
    case 'overload_legal':
    case 'overload_construct': {
      const a = [1, 2, 3, 4, 5].map(function (i) { return _nr(io['can_axle' + i + '_load']) || 0; });
      const suma = a.reduce(function (s, x) { return s + x; }, 0);
      const totalKg = suma || _nr(io.can_load_weight) || 0, lim = _nr(cond.maxKg);
      if (!totalKg || !lim) return { stare: null };
      return totalKg > lim ? { stare: true, date: { totalKg: totalKg, limit: lim, axles: a } } : { stare: false };
    }
    case 'axle_overload': {
      const lim = cond.axleLimits || {};
      let vazut = false;
      for (const i of [1, 2, 3, 4, 5]) {
        const load = _nr(io['can_axle' + i + '_load']), l = _nr(lim['axle' + i]);
        if (load === null || !l) continue;
        vazut = true;
        if (load > l) return { stare: true, date: { axle: i, load: load, limit: l } };
      }
      return { stare: vazut ? false : null };
    }
    case 'pto_active': {
      const v = io.can_pto_active;
      if (v === 1 || v === true || v === '1') return { stare: true, date: { event: 'PTO activat' } };
      if (v === 0 || v === false || v === '0') return { stare: false };
      return { stare: null };
    }
    case 'brake_pad_wear': {
      const prag = _nr(cond.minPercent) || 20;
      let vazut = false;
      for (const i of [1, 2, 3, 4]) {
        const w = _nr(io['can_brake_pad_axle' + i]);
        if (w === null) continue;
        vazut = true;
        if (w < prag) return { stare: true, date: { axle: i, wear: w, threshold: prag } };
      }
      return { stare: vazut ? false : null };
    }
    case 'service_due': {
      const km = _nr(io.can_distance_to_service), prag = _nr(cond.warnKm) || 1000;
      if (km === null) return { stare: null };
      return km < prag ? { stare: true, date: { distanceToService: km, threshold: prag } } : { stare: false };
    }
    default:
      return { stare: null };
  }
}

// Starea unei reguli pe o mașină. `sunatLa` poate veni din istoric (după o repornire); `activ` null = încă nu știm.
function stareNoua(sunatLa) { return { activ: null, sunatLa: sunatLa == null ? null : Number(sunatLa), liberDe: null, atins: 0 }; }

// Hotărăște dacă sună ACUM și ține starea la zi (o schimbă pe loc). `stare` = ce a dat stareDin.
function suna(s, stare, acum) {
  s.atins = acum;
  if (stare === null || stare === undefined) return false;              // poziția n-are datele: nu schimbă nimic
  if (stare === false) { if (s.activ !== false) { s.activ = false; s.liberDe = acum; } return false; }
  const reapare = s.activ === false && s.liberDe != null && acum - s.liberDe >= REARMARE_MS;
  const amintire = s.sunatLa == null || acum - s.sunatLa >= AMINTIRE_MS;
  s.activ = true; s.liberDe = null;
  if (reapare || amintire) { s.sunatLa = acum; return true; }
  return false;
}

module.exports = { DE_STARE, AMINTIRE_MS, REARMARE_MS, TEXT, RAND, eDeStare, stareDin, stareNoua, suna };
