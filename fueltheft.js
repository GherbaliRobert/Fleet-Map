// fueltheft.js — decizia „chiar a dispărut combustibil?", scoasă din server ca să poată fi verificată.
//
// De ce există: pe 20.08 Robert s-a trezit cu „scădere de la 43 L la 32 L", fără să se fi întâmplat
// nimic. Cauza nu era senzorul, ci regula: modul „cât a stat oprit" compara O SINGURĂ citire de la
// oprirea motorului cu O SINGURĂ citire de la pornire și alerta pe loc. Exact citirea de la pornire
// e cea mai nesigură din tot ciclul:
//
//   • plutitorul/sonda nu s-a așezat încă — are nevoie de zeci de secunde;
//   • multe magistrale CAN raportează un nivel vechi sau 0 în primele cadre după contact;
//   • dacă mașina a parcat pe pantă și pornește pe drept (sau invers), diferența e de câțiva litri;
//   • la un rezervor de 400 L, 11 L înseamnă 2,75% — sub eroarea uzuală a unei sonde necalibrate.
//
// Modul „în mers" avea deja apărarea corectă (ține o suspiciune o oră și o anulează dacă nivelul
// revine). Modul „oprit" n-avea niciuna. Aici primește aceeași disciplină: se reține o suspiciune,
// se lasă senzorul să se așeze, iar alerta pleacă doar dacă nivelul RĂMÂNE jos.
//
// A doua capcană, mai insidioasă: `citire()` alege prima sursă disponibilă dintre trei —
// rezervor calibrat, nivel sintetizat, CAN brut. Alea sunt SCĂRI DIFERITE. Dacă la oprire mașina
// raporta rezervorul calibrat, iar la pornire doar CAN-ul brut, comparam mere cu pere și „scăderea"
// era pur și simplu diferența dintre două moduri de a măsura. Acum comparăm doar sursă cu sursă.
//
// Întârzierea nu costă nimic: dacă motorina chiar a fost furată cât a stat mașina parcată noaptea,
// paguba s-a produs demult — o confirmare de câteva minute nu schimbă nimic, dar taie alarmele false
// care fac oamenii să ignore alertele.

// Rezervorul se așază după pornire: citirile din primele minute nu se iau în seamă deloc.
const ASEZARE_MS = 2 * 60 * 1000;
// După fereastra de așezare, nivelul trebuie să rămână jos atâta timp ȘI pe atâtea citiri.
const CONFIRM_MS = 5 * 60 * 1000;
const CONFIRM_N = 3;
// Suspiciune care nu se confirmă (mașina a încetat să transmită) → se uită, NU se emite pe orb.
const PEND_MAX_MS = 2 * 60 * 60 * 1000;
// Modul „în mers": nemodificat — o oră până la confirmare.
const MERS_CONFIRM_MS = 60 * 60 * 1000;

// Litri REALI (nu procente), cu sursa lor. Ordinea = de la cea mai de încredere la cea mai brută.
const SURSE = ['tank_level_liters', 'fuel_level_liters', 'can_fuel_level_liters'];
function citire(io) {
  if (!io) return null;
  for (const k of SURSE) {
    const v = Number(io[k]);
    if (Number.isFinite(v) && v > 0) return { v, src: k };
  }
  return null;
}

function stareNoua() {
  return { ign: 0, last: null, park: null, pend: null, susp: null, seen: 0 };
}

// Cât de mult trebuie să urce nivelul înapoi ca să considerăm că a fost zgomot, nu furt.
function revenire(prag) { return Math.max(2, prag * 0.25); }

// Un pas al automatului. Nu atinge rețeaua și nu citește ceasul singur — `acum` vine din afară,
// ca testul să poată derula timpul.
//   st    — starea vehiculului (stareNoua() la început)
//   io    — câmpurile decodate ale poziției curente
//   prag  — fuelTheftL al companiei (litri). ≤ 0 sau lipsă = detecția e oprită.
//   acum  — timpul în ms
// Întoarce { st, alerta } — alerta e null sau { drop, from, to, mode: 'parked' | 'motion' }.
function pas(st, io, prag, acum) {
  const X = Number(prag);
  if (!Number.isFinite(X) || X <= 0) return { st: stareNoua(), alerta: null }; // oprit pentru companie
  st = st || stareNoua();
  const r = citire(io);
  const ignBrut = io ? io.ignition : undefined;
  // Contact lipsă dintr-un pachet (heartbeat doar cu GPS) NU înseamnă „oprit": păstrăm starea de
  // dinainte, altfel apăreau tranziții false pornit→oprit→pornit la fiecare pachet incomplet.
  const ign = (ignBrut === 1 || ignBrut === true) ? 1 : (ignBrut === 0 || ignBrut === false) ? 0 : st.ign;
  let alerta = null;

  // ── Pornit → oprit: reținem nivelul „de parcare", cu tot cu sursa lui ──────────────────────
  if (st.ign === 1 && ign === 0) {
    const baza = r || st.last;
    st.park = baza ? { v: baza.v, src: baza.src, at: acum } : null;
    st.susp = null;
  }

  // ── Oprit → pornit: NU comparăm încă. Armăm o suspiciune și lăsăm senzorul să se așeze. ────
  if (st.ign === 0 && ign === 1) {
    st.pend = st.park ? { baseline: st.park.v, src: st.park.src, at: acum, low: null, n: 0 } : null;
    st.park = null;
    st.susp = null;
  }

  // ── Suspiciunea de la parcare: se confirmă sau se stinge ───────────────────────────────────
  if (st.pend) {
    if ((acum - st.pend.at) > PEND_MAX_MS) {
      st.pend = null;                                  // n-a mai transmis → uităm, nu inventăm
    } else if (r && r.src === st.pend.src && (acum - st.pend.at) >= ASEZARE_MS) {
      if (r.v >= st.pend.baseline - revenire(X)) {
        st.pend = null;                                // nivelul a revenit → sonda se așezase, atât
      } else {
        st.pend.n++;
        if (st.pend.low == null || r.v < st.pend.low) st.pend.low = r.v;
        const scadere = st.pend.baseline - st.pend.low;
        if (st.pend.n >= CONFIRM_N && (acum - st.pend.at) >= CONFIRM_MS && scadere > X) {
          alerta = { drop: scadere, from: st.pend.baseline, to: st.pend.low, mode: 'parked' };
          st.pend = null;
        }
      }
    }
  }

  // ── În mers (pornit → pornit): scădere bruscă, confirmată doar dacă nu revine într-o oră ───
  if (st.ign === 1 && ign === 1 && r && st.last && st.last.src === r.src) {
    if (!st.susp) {
      if ((st.last.v - r.v) > X) st.susp = { baseline: st.last.v, src: r.src, low: r.v, at: acum };
    } else if (r.src !== st.susp.src) {
      /* altă sursă → nu compara mere cu pere; așteptăm o citire din aceeași sursă */
    } else if (r.v >= st.susp.baseline - revenire(X)) {
      st.susp = null;                                  // clătinare/pantă → a revenit
    } else {
      if (r.v < st.susp.low) st.susp.low = r.v;
      if ((acum - st.susp.at) >= MERS_CONFIRM_MS && !alerta) {
        alerta = { drop: st.susp.baseline - st.susp.low, from: st.susp.baseline, to: st.susp.low, mode: 'motion' };
        st.susp = null;
      }
    }
  }

  st.ign = ign;
  if (r) st.last = r;
  st.seen = acum;
  return { st, alerta };
}

// Mătura periodică: confirmă suspiciunile „în mers" mai vechi de o oră chiar dacă vehiculul a
// încetat să raporteze, și uită suspiciunile de parcare care n-au apucat să se confirme.
function expira(st, prag, acum) {
  const X = Number(prag);
  if (!st) return { st, alerta: null };
  if (st.pend && (acum - st.pend.at) > PEND_MAX_MS) st.pend = null;
  if (st.susp && (acum - st.susp.at) >= MERS_CONFIRM_MS) {
    const a = { drop: st.susp.baseline - st.susp.low, from: st.susp.baseline, to: st.susp.low, mode: 'motion' };
    st.susp = null;
    if (Number.isFinite(X) && X > 0 && a.drop > X) return { st, alerta: a };
  }
  return { st, alerta: null };
}

module.exports = { citire, stareNoua, pas, expira, ASEZARE_MS, CONFIRM_MS, CONFIRM_N, PEND_MAX_MS, MERS_CONFIRM_MS };
