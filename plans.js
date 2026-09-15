// oferte.js — prețul unei firme la RA Tracks.
//
// RA Tracks NU funcționează pe planuri și n-a funcționat niciodată așa. Fiecare client primește o
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
  const aiAssistOn = feats ? !!feats.ai_assistant : true;
  const aiAgentsOn = feats ? !!feats.agents : true;
  const mk = function (model, perVehicleTotal, aiTotal, bd) {
    return {
      model: model, perVehicleTotal: perVehicleTotal, aiTotal: aiTotal, monthlyTotal: perVehicleTotal + aiTotal,
      breakdown: Object.assign({ base: 0, canAddon: 0, fmsAddon: 0, aiAssistant: 0, aiAgents: 0, counts: { none: none, can: can, fms: fms, total: total } }, bd)
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
//   restul — OPRITE până le aprinde oferta semnată.
// `settings.features` (scris de ofertă sau de mână, din Configurează) bate întotdeauna implicitul.
const FEATURE_KEYS = ['agents', 'ai_assistant', 'etransport', 'tahograf', 'etoll'];
const FEATURE_IMPLICIT = { agents: true, ai_assistant: false, etransport: false, tahograf: false, etoll: false };
function featuresFor(company) {
  const settings = (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {};
  const ov = (settings && settings.features) || {};
  const out = {};
  FEATURE_KEYS.forEach(function (k) { out[k] = (typeof ov[k] === 'boolean') ? ov[k] : !!FEATURE_IMPLICIT[k]; });
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
  ofertaFirmei, effectivePlan: ofertaFirmei, computeCompanyPrice,
  ALL_AGENT_KEYS, enabledAgentsFor, FEATURE_KEYS, featuresFor
};
