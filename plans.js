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
  return PLANS.map(p => ({ key: p.key, name: p.name, pricePerVehicleRON: p.pricePerVehicleRON, features: p.features }));
}

module.exports = { PLANS, VOLUME_DISCOUNTS, TRIAL_DAYS, getPlan, publicPlans };
