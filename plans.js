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
// company.custom_plan (JSONB) poate fi: { name, pricePerVehicleRON, flatPriceRON, vehicleLimit, stripePriceId, note }
function effectivePlan(company) {
  if (company && company.custom_plan && (company.custom_plan.pricePerVehicleRON != null || company.custom_plan.flatPriceRON != null)) {
    const c = company.custom_plan;
    return {
      key: 'custom', custom: true, name: c.name || 'Custom',
      pricePerVehicleRON: c.pricePerVehicleRON != null ? c.pricePerVehicleRON : null,
      flatPriceRON: c.flatPriceRON != null ? c.flatPriceRON : null,
      vehicleLimit: c.vehicleLimit != null ? c.vehicleLimit : null,
      stripePriceId: c.stripePriceId || '',
      note: c.note || ''
    };
  }
  return getPlan((company && company.plan) || 'start') || getPlan('start');
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
  const settings = (company && (typeof company.settings === 'string' ? JSON.parse(company.settings) : company.settings)) || {};
  if (Array.isArray(settings.enabled_agents)) {
    return settings.enabled_agents.filter(function (k) { return ALL_AGENT_KEYS.indexOf(k) >= 0; });
  }
  const eff = effectivePlan(company);
  return AGENTS_BY_PLAN[eff && eff.key] || [];
}

module.exports = { PLANS, VOLUME_DISCOUNTS, TRIAL_DAYS, getPlan, publicPlans, effectivePlan, ALL_AGENT_KEYS, AGENTS_BY_PLAN, enabledAgentsFor };
