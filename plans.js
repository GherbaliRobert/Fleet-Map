// plans.js — Model de preț RA Tracks (propunere).
// Model: PER VEHICUL / lună, cu 3 niveluri de funcții. Abonamentul Stripe folosește
// "quantity" = numărul de vehicule ale companiei. Prețurile sunt orientative (RON, fără TVA)
// și pot fi schimbate din env (ID-urile de preț Stripe se pun după ce creezi produsele în Stripe).

const PLANS = [
  {
    key: 'start',
    name: 'Start',
    pricePerVehicleRON: 29,
    stripePriceId: process.env.STRIPE_PRICE_START || '',
    features: [
      'Localizare live + hartă',
      'Istoric trasee (6 luni)',
      'Rapoarte de bază + export CSV/Excel/PDF/KML',
      'Alerte + geofence',
      'Aplicație mobilă (PWA)'
    ]
  },
  {
    key: 'pro',
    name: 'Pro',
    pricePerVehicleRON: 45,
    stripePriceId: process.env.STRIPE_PRICE_PRO || '',
    features: [
      'Tot din Start',
      'Toate rapoartele (19+) + programare email',
      'Sonde combustibil + tahograf + e-Transport',
      'Notificări avansate (email / Web Push)',
      'Acces API (chei)'
    ]
  },
  {
    key: 'premium',
    name: 'Premium AI',
    pricePerVehicleRON: 65,
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM || '',
    features: [
      'Tot din Pro',
      'Cei 6 agenți AI (Watch / Care / Optimize / Compliance / Client / Dispatch)',
      'Asistent AI (chat flotă) + rezumate AI',
      'RA Dispatch (alocare curse) + dashboard avansat'
    ]
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    custom: true,            // preț negociat — „la cerere"
    pricePerVehicleRON: null,
    stripePriceId: '',
    features: [
      'Tot din Premium AI',
      'Preț negociat (per vehicul sau tarif fix)',
      'Onboarding asistat + suport prioritar / SLA',
      'Integrări la cerere, branding propriu, instanță dedicată (opțional)'
    ]
  }
];

// Reduceri de volum (orientativ) — aplicabile prin cupoane Stripe sau prețuri pe trepte.
const VOLUME_DISCOUNTS = [
  { minVehicles: 20, percent: 10 },
  { minVehicles: 50, percent: 20 }
];

const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS) || 14;

function getPlan(key) { return PLANS.find(p => p.key === key) || null; }
function publicPlans() {
  // pentru landing/app — fără ID-uri Stripe
  return PLANS.map(p => ({ key: p.key, name: p.name, pricePerVehicleRON: p.pricePerVehicleRON, custom: !!p.custom, features: p.features }));
}

// Planul efectiv al unei companii: dacă are un plan custom setat de super-admin, acela; altfel cel standard.
// company.custom_plan (JSONB):
//   legacy:  { name, pricePerVehicleRON, flatPriceRON, vehicleLimit, stripePriceId, note }
//   tiered:  + { basePerVehicleRON, canAddonRON, fmsAddonRON, aiAssistantRON, aiAgentsRON }
//   Oferta e „tiered" (nouă) dacă basePerVehicleRON != null: preț de bază/vehicul + spor CAN + spor FMS
//   (pe fiecare vehicul de tipul respectiv) + add-on-uri AI lunare fixe (asistent / agenți).
function effectivePlan(company) {
  if (company && company.custom_plan && (company.custom_plan.basePerVehicleRON != null || company.custom_plan.pricePerVehicleRON != null || company.custom_plan.flatPriceRON != null)) {
    const c = company.custom_plan;
    return {
      key: 'custom', custom: true, name: c.name || 'Custom',
      basePerVehicleRON: c.basePerVehicleRON != null ? c.basePerVehicleRON : null,
      canAddonRON: c.canAddonRON != null ? c.canAddonRON : null,
      fmsAddonRON: c.fmsAddonRON != null ? c.fmsAddonRON : null,
      aiAssistantRON: c.aiAssistantRON != null ? c.aiAssistantRON : null,
      aiAgentsRON: c.aiAgentsRON != null ? c.aiAgentsRON : null,
      pricePerVehicleRON: c.pricePerVehicleRON != null ? c.pricePerVehicleRON : null,
      flatPriceRON: c.flatPriceRON != null ? c.flatPriceRON : null,
      vehicleLimit: c.vehicleLimit != null ? c.vehicleLimit : null,
      stripePriceId: c.stripePriceId || '',
      note: c.note || ''
    };
  }
  return getPlan((company && company.plan) || 'start') || getPlan('start');
}

// Preț lunar al unei companii din oferta efectivă + numărul de vehicule pe tip CAN.
// canCounts = { none, can, fms } (exact forma construită în /overview). opts.features (din featuresFor) →
// add-on-urile AI se taxează DOAR dacă modulul respectiv e ON; fără opts → „list price" (ambele numărate).
// Întoarce { model:'preset'|'tiered'|'flat', perVehicleTotal, aiTotal, monthlyTotal, breakdown }.
function computeCompanyPrice(company, canCounts, opts) {
  opts = opts || {};
  const cc = canCounts || {};
  const none = Math.max(0, parseInt(cc.none) || 0);
  const can = Math.max(0, parseInt(cc.can) || 0);
  const fms = Math.max(0, parseInt(cc.fms) || 0);
  const total = none + can + fms;
  const eff = effectivePlan(company) || {};
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
  // FLAT (legacy): prețul fix câștigă, fără AI separat
  if (eff.flatPriceRON != null) { const flat = num(eff.flatPriceRON); return mk('flat', flat, 0, { base: flat }); }
  // TIERED custom: bază/vehicul (toate) + spor CAN (vehiculele cu CAN) + spor FMS + add-on-uri AI lunare
  if (eff.basePerVehicleRON != null) {
    const baseTotal = num(eff.basePerVehicleRON) * total;
    const canTotal = num(eff.canAddonRON) * can;
    const fmsTotal = num(eff.fmsAddonRON) * fms;
    const aiAssist = aiAssistOn ? num(eff.aiAssistantRON) : 0;
    const aiAgents = aiAgentsOn ? num(eff.aiAgentsRON) : 0;
    return mk('tiered', baseTotal + canTotal + fmsTotal, aiAssist + aiAgents,
      { base: baseTotal, canAddon: canTotal, fmsAddon: fmsTotal, aiAssistant: aiAssist, aiAgents: aiAgents });
  }
  // PRESET / legacy per-vehicul
  const perVehicleTotal = num(eff.pricePerVehicleRON) * total;
  return mk('preset', perVehicleTotal, 0, { base: perVehicleTotal });
}

// ─── Funcții (module) controlabile per-companie de super-admin (checkbox-uri) ───
// Stocate în companies.settings.features = { agents, ai_assistant, etransport, tahograf } (booleeni expliciți).
// Cheie lipsă → cade pe default-ul planului companiei.
const FEATURE_KEYS = ['agents', 'ai_assistant', 'etransport', 'tahograf'];
const FEATURE_DEFAULTS_BY_PLAN = {
  start:      { agents: false, ai_assistant: false, etransport: false, tahograf: false },
  pro:        { agents: false, ai_assistant: false, etransport: true,  tahograf: true  },
  premium:    { agents: true,  ai_assistant: true,  etransport: true,  tahograf: true  },
  enterprise: { agents: true,  ai_assistant: true,  etransport: true,  tahograf: true  },
  custom:     { agents: true,  ai_assistant: true,  etransport: true,  tahograf: true  }
};
function featuresFor(company) {
  const settings = (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {};
  const planKey = (effectivePlan(company) || {}).key || 'start';
  const def = FEATURE_DEFAULTS_BY_PLAN[planKey] || FEATURE_DEFAULTS_BY_PLAN.start;
  const ov = (settings && settings.features) || {};
  const out = {};
  FEATURE_KEYS.forEach(function (k) { out[k] = (typeof ov[k] === 'boolean') ? ov[k] : !!def[k]; });
  return out;
}

// Agenți AI per plan (default; override per-companie via companies.settings.enabled_agents)
const ALL_AGENT_KEYS = ['watch', 'dispatch', 'care', 'optimize', 'compliance', 'client'];
const AGENTS_BY_PLAN = {
  start: [],
  pro: ['watch', 'dispatch'],
  premium: ALL_AGENT_KEYS.slice(),
  enterprise: ALL_AGENT_KEYS.slice(),
  custom: ALL_AGENT_KEYS.slice()
};
// Lista agenților activi pentru o companie: override > default pe plan
function enabledAgentsFor(company) {
  if (!featuresFor(company).agents) return [];   // master „Agenți AI" oprit de super-admin
  const settings = (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {};
  if (Array.isArray(settings.enabled_agents)) {
    return settings.enabled_agents.filter(function (k) { return ALL_AGENT_KEYS.indexOf(k) >= 0; });
  }
  const eff = effectivePlan(company);
  return AGENTS_BY_PLAN[eff && eff.key] || [];
}

module.exports = { PLANS, VOLUME_DISCOUNTS, TRIAL_DAYS, getPlan, publicPlans, effectivePlan, computeCompanyPrice, ALL_AGENT_KEYS, AGENTS_BY_PLAN, enabledAgentsFor, FEATURE_KEYS, FEATURE_DEFAULTS_BY_PLAN, featuresFor };
