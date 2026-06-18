// geocode.js — geocodare inversă (lat/lng → adresă lizibilă) via OSM Nominatim, cu cache în memorie.
// La SCARĂ: Nominatim public permite ~1 req/s. Pentru producție mare, self-host Nominatim sau un
// provider plătit și setează GEOCODE_URL. Cache-ul + rotunjirea (~110 m) reduc drastic apelurile.
const cache = new Map();              // "lat,lng" rotunjit -> label (string | null)
const MAX_CACHE = 10000;
const PROVIDER = process.env.GEOCODE_URL || 'https://nominatim.openstreetmap.org/reverse';
const UA = process.env.GEOCODE_UA || 'RA-Track-Fleet/1.0 (gps fleet)';
const TIMEOUT_MS = parseInt(process.env.GEOCODE_TIMEOUT_MS) || 3000;

function ok(n) { return typeof n === 'number' && isFinite(n); }
function key(lat, lng) { return lat.toFixed(3) + ',' + lng.toFixed(3); } // ~110 m

// ─── Throttle: Nominatim public permite ~1 req/s. Serializăm + spațiem apelurile de rețea
// global pe proces. Pentru provider self-host/plătit (GEOCODE_URL setat) → fără throttle. ───
const IS_PUBLIC = /nominatim\.openstreetmap\.org/i.test(PROVIDER);
const MIN_INTERVAL_MS = parseInt(process.env.GEOCODE_MIN_INTERVAL_MS) || (IS_PUBLIC ? 1100 : 0);
let _lastCall = 0;
let _gate = Promise.resolve();
function throttleSlot() {
  const p = _gate.then(async () => {
    if (MIN_INTERVAL_MS > 0) {
      const wait = MIN_INTERVAL_MS - (Date.now() - _lastCall);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
    _lastCall = Date.now();
  });
  _gate = p.catch(() => {});
  return p;
}

// Adresă scurtă, prietenoasă: „Stradă nr, Oraș" din câmpurile Nominatim.
function shorten(j) {
  const a = (j && j.address) || {};
  const road = a.road || a.pedestrian || a.footway || a.cycleway || a.neighbourhood || a.suburb || '';
  const nr = a.house_number ? ' ' + a.house_number : '';
  const city = a.city || a.town || a.village || a.municipality || a.county || '';
  const parts = [];
  if (road) parts.push(road + nr);
  if (city && city !== road) parts.push(city);
  if (parts.length) return parts.join(', ');
  if (j && j.display_name) return j.display_name.split(',').slice(0, 2).map(s => s.trim()).join(', ');
  return null;
}

async function reverseGeocode(lat, lng) {
  if (!ok(lat) || !ok(lng)) return null;
  const k = key(lat, lng);
  if (cache.has(k)) return cache.get(k);
  let label = null;
  try {
    await throttleSlot(); // respectă limita ~1 req/s pentru Nominatim public
    if (cache.has(k)) return cache.get(k); // alt apel a populat cache-ul cât așteptam
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = PROVIDER + '?format=jsonv2&zoom=18&addressdetails=1&accept-language=ro&lat=' + lat + '&lon=' + lng;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) label = shorten(await res.json());
  } catch (e) { /* timeout / rețea / abort → null */ }
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(k, label);
  return label;
}

// Citire DOAR din cache (fără apel de rețea). Returnează label | null | undefined(necunoscut).
function peek(lat, lng) { return (ok(lat) && ok(lng)) ? cache.get(key(lat, lng)) : undefined; }

// Pre-încarcă adresele pentru o listă de {lat,lng}: dedupe pe cheie + plafon + concurență limitată.
// budgetMs: cât timp blocăm apelantul (ex. chat AI) — restul se încarcă pe fundal, peek() le ia ulterior.
async function warm(coords, opts) {
  const concurrency = (opts && opts.concurrency) || 4;
  const maxUnique = (opts && opts.maxUnique) || 25;
  const budgetMs = (opts && opts.budgetMs) || (IS_PUBLIC ? 2500 : 8000); // throttle public → buget scurt
  const todo = []; const seen = new Set();
  for (const c of coords || []) {
    if (!ok(c.lat) || !ok(c.lng)) continue;
    const k = key(c.lat, c.lng);
    if (seen.has(k) || cache.has(k)) continue;
    seen.add(k); todo.push(c);
    if (todo.length >= maxUnique) break;
  }
  const deadline = Date.now() + budgetMs;
  let i = 0;
  const worker = async () => { while (i < todo.length && Date.now() < deadline) { const c = todo[i++]; await reverseGeocode(c.lat, c.lng); } };
  // Public (throttle 1/s): un singur worker — concurența nu ajută și ar serializa oricum prin gate.
  const workers = MIN_INTERVAL_MS > 0 ? 1 : Math.min(concurrency, todo.length);
  await Promise.all(Array.from({ length: workers }, worker));
}

module.exports = { reverseGeocode, peek, warm };
