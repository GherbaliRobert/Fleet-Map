const pachete = require('./pachete');   // pachetele RA Insight (14.10): prețul fix pe firmă intră în motorul de preț
// oferte.js — prețul unei firme la RA Track.
//
// RA Track NU funcționează pe planuri și n-a funcționat niciodată așa. Fiecare client primește o
// OFERTĂ, făcută pe ce are el (câte vehicule, câte cu CAN, ce module), iar contractul se face pe
// oferta acceptată. Atât.
//
// Fișierul ăsta se numea `plans.js` și avea un tabel cu patru planuri (Start / Pro / Premium AI /
// Enterprise), prețuri pe vehicul, reduceri de volum și perioadă de probă.
// Nimic din toate astea nu se vindea vreodată — dar tabelul HOTĂRA lucruri reale în spate: ce module
// are o firmă și ce agenți îi rulează. Așa s-a ajuns ca fiecare client deschis să rămână fără agenți,
// pentru că pica pe „standard" → „start", unde scria `agents: false`. A fost scos tot.
//
// Ce a rămas: socoteala prețului din ofertă și două valori implicite FIXE (nu dintr-un tabel):
//   • agenții AI sunt PORNIȚI — sunt gratuiți, merg pe reguli fixe și fac parte din produs;
//   • modulele cu plată (RA Insight, tahograf, e-Transport, e-Toll) sunt OPRITE până le aprinde oferta.
// Orice firmă poate suprascrie oricare din ele, din Administrare → Configurează.

// Oferta scrisă pe firmă (`companies.custom_plan`, JSONB). Formele acceptate:
//   direct:  { priceNoneRON, priceCanRON, priceFmsRON, canImeis }   — preț întreg pe fiecare fel de vehicul
//   tiered:  { basePerVehicleRON, canAddonRON, fmsAddonRON, aiAssistantRON, aiAgentsRON }
//   vechi:   { pricePerVehicleRON } sau { flatPriceRON }
// FĂRĂ ofertă → `null`: firma nu are preț, deci nu aduce venit. NU inventează un preț implicit —
// altfel o firmă nouă ar apărea în registrul de clienți cu bani care nu există.
function ofertaFirmei(company) {
  const c = company && company.custom_plan;
  if (!c) return null;
  const areP = (c.priceNoneRON != null || c.basePerVehicleRON != null || c.pricePerVehicleRON != null || c.flatPriceRON != null);
  if (!areP) return null;
  return {
    name: c.name || 'Ofert\u0103',
    priceNoneRON: c.priceNoneRON != null ? c.priceNoneRON : null,
    priceCanRON: c.priceCanRON != null ? c.priceCanRON : null,
    priceFmsRON: c.priceFmsRON != null ? c.priceFmsRON : null,
    canImeis: Array.isArray(c.canImeis) ? c.canImeis : null,
    basePerVehicleRON: c.basePerVehicleRON != null ? c.basePerVehicleRON : null,
    canAddonRON: c.canAddonRON != null ? c.canAddonRON : null,
    fmsAddonRON: c.fmsAddonRON != null ? c.fmsAddonRON : null,
    aiAssistantRON: c.aiAssistantRON != null ? c.aiAssistantRON : null,
    aiAgentsRON: c.aiAgentsRON != null ? c.aiAgentsRON : null,
    pricePerVehicleRON: c.pricePerVehicleRON != null ? c.pricePerVehicleRON : null,
    flatPriceRON: c.flatPriceRON != null ? c.flatPriceRON : null,
    vehicleLimit: c.vehicleLimit != null ? c.vehicleLimit : null,
    note: c.note || ''
  };
}

// Pachetele RA Insight (14.10): ce pachet are firma. Regula VECHE (întrebări pe cont / cotă fixă în `ai_quota`, limita cea mai
// veche `companies.ai_monthly_limit`, sau suma fixă „Asistent AI" din ofertă cu modulul pornit de noi) → null: o citește
// codul vechi. Altfel pachetul scris, iar fără nimic — Start. O SINGURĂ dată, aici; serverul (`_pachetCo`) o folosește.
function aiVechi(company) {
  const eff = ofertaFirmei(company) || {};
  return Number(company && company.ai_monthly_limit) > 0 ||
    (Number(eff.aiAssistantRON) > 0 && featuresSetate(company).ai_assistant === true);
}
// `acum` = clipa la care se citește (implicit: acum) — o trecere la un pachet mai mic, programată de la 1 a lunii următoare,
// devine pachetul firmei din clipa aceea (pachete.pachetFirma).
function pachetAi(company, acum) { return company ? pachete.pachetFirma(_setariFirma(company), aiVechi(company), acum == null ? Date.now() : acum) : null; }

function computeCompanyPrice(company, canCounts, opts) {
  opts = opts || {};
  const cc = canCounts || {};
  const none = Math.max(0, parseInt(cc.none) || 0);
  const can = Math.max(0, parseInt(cc.can) || 0);
  const fms = Math.max(0, parseInt(cc.fms) || 0);
  const total = none + can + fms;
  // Fără ofertă, prețul e ZERO și se vede în registru ca „firmă fără ofertă" — nu inventat.
  const eff = ofertaFirmei(company) || {};
  const num = function (v) { return (v != null && isFinite(v)) ? Number(v) : 0; };
  const feats = opts.features || null;
  // „Asistent AI" (suma fixă pe firmă, forma veche) se plătește doar unde modulul a fost PORNIT DE NOI (oferta sau de mână).
  // Din 14.10 RA Insight e pornit implicit la toate firmele (pachetul Start, inclus) — fără rândul ăsta, o sumă veche
  // scrisă într-o fișă ar fi apărut pe factură la o firmă care n-a cumpărat nimic.
  const aiAssistOn = (feats ? !!feats.ai_assistant : true) && featuresSetate(company).ai_assistant === true;
  const aiAgentsOn = feats ? !!feats.agents : true;
  // Pachetul RA Insight (pasul 5): un preț fix pe FIRMĂ, pe orice fel de ofertă (și fără ofertă) — „RA Insight Pro" pe factură
  // și în registru, din același loc. Start = 0. Cu modulul oprit de noi, nimic.
  const pk = (feats ? !!feats.ai_assistant : true) ? pachetAi(company) : null;
  const pachetLei = pk && pk.ai ? num(pk.pretRON) : 0;
  const mk = function (model, perVehicleTotal, aiTotal, bd) {
    return {
      model: model, perVehicleTotal: perVehicleTotal, aiTotal: aiTotal + pachetLei, monthlyTotal: perVehicleTotal + aiTotal + pachetLei,
      breakdown: Object.assign({ base: 0, canAddon: 0, fmsAddon: 0, aiAssistant: 0, aiAgents: 0, aiPachet: pachetLei,
        aiPachetEticheta: pachetLei > 0 ? pachete.eticheta(pk) : null, counts: { none: none, can: can, fms: fms, total: total } }, bd)
    };
  };
  // DIRECT pe tip: preț ÎNTREG/vehicul fără CAN + preț ÎNTREG/vehicul cu CAN (+ FMS opțional). Cel mai intuitiv
  // (ex. fără CAN 21 lei, cu CAN 45 lei). ÎNAINTE de flat — dacă e setat priceNoneRON, câștigă, chiar dacă a rămas
  // un flatPriceRON vechi dintr-un model anterior. „Cu CAN" vine din canCounts (override manual din UI sau auto).
  if (eff.priceNoneRON != null) {
    const pn = num(eff.priceNoneRON);
    const pc = eff.priceCanRON != null ? num(eff.priceCanRON) : pn;
    const pf = eff.priceFmsRON != null ? num(eff.priceFmsRON) : pc;
    const noneTotal = pn * none, canTotal = pc * can, fmsTotal = pf * fms;
    const aiAssist = aiAssistOn ? num(eff.aiAssistantRON) : 0;
    const aiAgents = aiAgentsOn ? num(eff.aiAgentsRON) : 0;
    return mk('oferta', noneTotal + canTotal + fmsTotal, aiAssist + aiAgents, { base: noneTotal, canAddon: canTotal, fmsAddon: fmsTotal, aiAssistant: aiAssist, aiAgents: aiAgents });
  }
  // FLAT (legacy): preț fix lunar (fără AI separat) — doar dacă NU e ofertă direct.
  if (eff.flatPriceRON != null) { const flat = num(eff.flatPriceRON); return mk('fix', flat, 0, { base: flat }); }
  // TIERED custom: bază/vehicul (toate) + spor CAN (vehiculele cu CAN) + spor FMS + add-on-uri AI lunare
  if (eff.basePerVehicleRON != null) {
    const baseTotal = num(eff.basePerVehicleRON) * total;
    const canTotal = num(eff.canAddonRON) * can;
    const fmsTotal = num(eff.fmsAddonRON) * fms;
    const aiAssist = aiAssistOn ? num(eff.aiAssistantRON) : 0;
    const aiAgents = aiAgentsOn ? num(eff.aiAgentsRON) : 0;
    return mk('trepte', baseTotal + canTotal + fmsTotal, aiAssist + aiAgents,
      { base: baseTotal, canAddon: canTotal, fmsAddon: fmsTotal, aiAssistant: aiAssist, aiAgents: aiAgents });
  }
  // Forma veche: un singur preț pe vehicul. Fără nimic scris → zero.
  const perVehicleTotal = num(eff.pricePerVehicleRON) * total;
  return mk(eff.pricePerVehicleRON != null ? 'pe-vehicul' : 'fara-oferta', perVehicleTotal, 0, { base: perVehicleTotal });
}

// Modulele unei firme. Implicit FIX, nu dintr-un tabel de planuri:
//   agenții — PORNIȚI (gratuiți, parte din produs);
//   RA Insight — PORNIT (din 14.10: orice firmă începe cu pachetul Start, inclus în contract; ce primește stă în
//                pachete.js, nu aici — Start e fără AI, doar pe butoane, doar pentru administrator);
//   restul — OPRITE până le aprinde oferta semnată.
// `settings.features` (scris de ofertă sau de mână, din Configurează) bate întotdeauna implicitul.
const FEATURE_KEYS = ['agents', 'ai_assistant', 'etransport', 'tahograf', 'etoll', 'incarcare'];
const FEATURE_IMPLICIT = { agents: true, ai_assistant: true, etransport: false, tahograf: false, etoll: false, incarcare: false };
// Simulatorul de încărcare (Robert, 12.10: „inclus în abonament" + „1.a"): neales de noi, merge DUPĂ FLOTĂ — pornit la
// firmele care au vehicule care cară marfă (TIPURI_CU_MARFA), oprit la celelalte. Ales de noi (true / false în
// `settings.features`), rămâne cum l-am pus; `null` îl întoarce la automat. Flota o ține minte serverul (setFlotaGrea),
// fiindcă featuresFor e chemată pe loc, în multe locuri, și n-are bază de date.
const FEATURE_DUPA_FLOTA = ['incarcare'];
// Valorile din lista „Categorie" a fișei, plus scrierile cu diacritice și cele englezești care pot veni din importuri vechi
// (aceleași pe care le recunoaște iconița vehiculului de pe hartă).
const TIPURI_CU_MARFA = ['Autotractor', 'Camion', 'TIR', 'Duba', 'Dubă', 'Remorca', 'Remorcă', 'autotractor', 'truck', 'tir', 'van', 'trailer'];
let _flotaGrea = new Set();
function setFlotaGrea(ids) { _flotaGrea = new Set((ids || []).map(Number)); }
function setFlotaGreaFirma(id, are) { if (are) _flotaGrea.add(Number(id)); else _flotaGrea.delete(Number(id)); }
function areFlotaGrea(id) { return id != null && _flotaGrea.has(Number(id)); }
function _setariFirma(company) { return (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {}; }
function featuresFor(company) {
  const ov = (_setariFirma(company).features) || {};
  const out = {};
  FEATURE_KEYS.forEach(function (k) {
    if (typeof ov[k] === 'boolean') out[k] = ov[k];
    else if (FEATURE_DUPA_FLOTA.indexOf(k) >= 0) out[k] = areFlotaGrea(company && company.id);
    else out[k] = !!FEATURE_IMPLICIT[k];
  });
  return out;
}
// Ce am ales NOI, de mână (sau oferta): doar cheile scrise. Ce lipsește de aici merge după implicit / după flotă.
function featuresSetate(company) {
  const ov = (_setariFirma(company).features) || {};
  const out = {};
  FEATURE_KEYS.forEach(function (k) { if (typeof ov[k] === 'boolean') out[k] = ov[k]; });
  return out;
}

// Cei 6 agenți AI: toți, la toate firmele. Se pot restrânge per firmă prin `settings.enabled_agents`.
const ALL_AGENT_KEYS = ['watch', 'dispatch', 'care', 'optimize', 'compliance', 'client'];
function enabledAgentsFor(company) {
  if (!featuresFor(company).agents) return [];   // comutatorul „Agenți AI" oprit pe firma asta
  const settings = (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {};
  if (Array.isArray(settings.enabled_agents)) {
    return settings.enabled_agents.filter(function (k) { return ALL_AGENT_KEYS.indexOf(k) >= 0; });
  }
  return ALL_AGENT_KEYS.slice();
}

// `effectivePlan` rămâne ca nume vechi, ca să nu rupă apelurile existente — dar întoarce OFERTA.
module.exports = {
  ofertaFirmei, effectivePlan: ofertaFirmei, computeCompanyPrice, pachetAi, aiVechi,
  ALL_AGENT_KEYS, enabledAgentsFor, FEATURE_KEYS, featuresFor, featuresSetate,
  FEATURE_DUPA_FLOTA, TIPURI_CU_MARFA, setFlotaGrea, setFlotaGreaFirma, areFlotaGrea
};
