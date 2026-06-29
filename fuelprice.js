// Preluare preț carburant — media națională (lei/L) de la PretCarburant.ro.
// API public, fără autentificare, fără rate-limit pe /preturi/minime (cache 5 min la sursă).
// Licență CC BY 4.0 → comercial permis CU atribuire vizibilă „Sursa: PretCarburant.ro".
const ENDPOINT = 'https://pretcarburant.ro/api/v1/preturi/minime';
const SOURCE = 'PretCarburant.ro';

// Întoarce { motorina, benzina, gpl, motorina_premium, benzina_premium, data, source, fetched_at } (lei/L, media națională).
async function fetchFuelPrices() {
  const r = await fetch(ENDPOINT, { headers: { 'User-Agent': 'RATracks/1.0 (+https://ratrack.ro)', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j || j.status !== 'ok' || !j.preturi) throw new Error('răspuns invalid');
  const p = j.preturi;
  const avg = function (k) { return (p[k] && typeof p[k].mediu === 'number' && p[k].mediu > 0) ? p[k].mediu : null; };
  return {
    motorina: avg('motorina_standard'),
    benzina: avg('benzina_standard'),
    gpl: avg('gpl'),
    motorina_premium: avg('motorina_premium'),
    benzina_premium: avg('benzina_premium'),
    data: j.data || null,
    source: SOURCE,
    fetched_at: Date.now(),
  };
}

module.exports = { fetchFuelPrices, ENDPOINT, SOURCE };
