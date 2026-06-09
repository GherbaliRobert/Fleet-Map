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
async function warm(coords, opts) {
  const concurrency = (opts && opts.concurrency) || 4;
  const maxUnique = (opts && opts.maxUnique) || 25;
  const todo = []; const seen = new Set();
  for (const c of coords || []) {
    if (!ok(c.lat) || !ok(c.lng)) continue;
    const k = key(c.lat, c.lng);
    if (seen.has(k) || cache.has(k)) continue;
    seen.add(k); todo.push(c);
    if (todo.length >= maxUnique) break;
  }
  let i = 0;
  const worker = async () => { while (i < todo.length) { const c = todo[i++]; await reverseGeocode(c.lat, c.lng); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
}

module.exports = { reverseGeocode, peek, warm };
