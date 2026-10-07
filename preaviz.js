// preaviz.js — cu cât timp înainte se anunță un termen și în ce stare e. O SINGURĂ sursă pentru listele Mentenanță /
// Documente, anunțurile (push), agentul RA Care, raportul „Scadențe" și ramura Mentenanță & acte din RA Insight.
// 07.10: RA Care anunța actele cu 14 zile înainte (listele și telefonul cu 30), iar raportul „Scadențe" avea pragurile lui
// (7 / 30 de zile, 500 / 2.000 km) — fiecare cu cifra lui.
//
// Valorile de aici sunt punctul de plecare; fiecare firmă și le poate schimba (alert_thresholds: careDaysLead /
// careKmLead / docDaysLead), iar super-adminul le poate schimba pentru toate (pragurile globale). Fără bază, fără rețea.
'use strict';

const REVIZII_ZILE = 14;   // LUCRĂRI, pe dată — un schimb de ulei se face într-o oră
const REVIZII_KM = 500;    // LUCRĂRI, pe km
const ACTE_ZILE = 30;      // ACTE — un RCA sau un ITP vrea o lună de preaviz, nu o săptămână
const ZI = 86400000;

// Pragurile `t` peste o bază: o valoare lipsă sau proastă rămâne cea din bază.
function _peste(baza, t) {
  t = t || {};
  const n = function (v, d) { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.round(x) : d; };
  return { days: n(t.careDaysLead, baza.days), km: n(t.careKmLead, baza.km), docDays: n(t.docDaysLead, baza.docDays) };
}
// Preavizul din niște praguri (cele globale puse dedesubt de cine cheamă). Lipsă → pornirea.
function dinPraguri(t) { return _peste({ days: REVIZII_ZILE, km: REVIZII_KM, docDays: ACTE_ZILE }, t); }
// Preavizul fiecărei firme: firma → pragurile globale → pornirea. firme = [{ id, praguri }].
function peFirme(pragGlobale, firme) {
  const base = dinPraguri(pragGlobale);
  const m = new Map();
  (firme || []).forEach(function (f) { m.set(f.id, _peste(base, f.praguri)); });
  return { base: base, of: function (cid) { return (cid != null && m.get(cid)) || base; } };
}

// Zilele până la o dată, în sus, de la ora de acum (ca listele): mâine = 1, azi = 0, ieri = -1.
function zileRamase(data, acum) { const t = new Date(data).getTime(); return isNaN(t) ? null : Math.ceil((t - (acum || Date.now())) / ZI); }
// O lucrare închisă: status done/completed SAU data efectuării scrisă.
function lucrareInchisa(m) { if (!m) return true; const st = String(m.status || '').toLowerCase(); return st === 'done' || st === 'completed' || !!m.done_date; }
// Starea unei lucrări de service: 'overdue' (depășită) | 'due_soon' (în preaviz) | 'ok'. `lead` = { days, km }.
function stareRevizie(m, odo, lead, acum) {
  if (!m || lucrareInchisa(m)) return 'ok';
  const dLead = (lead && lead.days) || REVIZII_ZILE, kLead = (lead && lead.km) || REVIZII_KM;
  let curand = false;
  if (m.due_date) {
    const zile = zileRamase(m.due_date, acum);
    if (zile < 0) return 'overdue';
    if (zile <= dLead) curand = true;
  }
  if (m.due_km && odo) {
    const ramasi = m.due_km - odo;
    if (ramasi <= 0) return 'overdue';
    if (ramasi <= kLead) curand = true;
  }
  return curand ? 'due_soon' : 'ok';
}
// Starea unui act: 'expired' | 'soon' | 'ok' | 'none' (fără dată de expirare).
function stareAct(d, zilePreaviz, acum) {
  if (!d || !d.expiry_date) return 'none';
  const zile = zileRamase(d.expiry_date, acum);
  if (zile < 0) return 'expired';
  return zile <= (zilePreaviz || ACTE_ZILE) ? 'soon' : 'ok';
}

module.exports = { REVIZII_ZILE, REVIZII_KM, ACTE_ZILE, dinPraguri, peFirme, zileRamase, lucrareInchisa, stareRevizie, stareAct };
