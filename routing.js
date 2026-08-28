// routing.js — traseul dintre două puncte, pentru estimarea taxei de drum ÎNAINTE de cursă.
//
// De ce e nevoie de el: restul aplicației știe pe unde A FOST mașina. Ca să spui cât costă un drum
// pe care nu l-ai făcut încă, îți trebuie cineva care desenează traseul. Noi nu avem hărți proprii.
//
// ── Ce face și ce NU face ────────────────────────────────────────────────────────────────────────
// Modulul întoarce DOAR geometria (șirul de puncte) și distanța. Clasificarea drumurilor și calculul
// taxei rămân la noi (roadlimits.js + tollro.js). Furnizorul de rutare e schimbabil fără să atingem
// niciun tarif — dacă mâine trecem pe alt serviciu, cifrele rămân ale noastre.
//
// ── Rutare de CAMION, nu de autoturism ───────────────────────────────────────────────────────────
// Un TIR de 40 t nu merge pe unde merge un Logan: sunt poduri cu limită de tonaj, treceri joase,
// străzi interzise. De-aia trimitem masa și axele vehiculului, iar profilul cerut e „heavy goods".
// Fără asta am estima un traseu pe care camionul n-are voie — și un cost care nu i se aplică.
//
// ── Cele trei stări posibile, scrise ca să nu existe a patra ─────────────────────────────────────
//   1. ORS_API_KEY setată            → OpenRouteService (calea de producție; 2.500 cereri/zi gratuit)
//   2. ROUTER_PUBLIC=true            → instanța publică Valhalla (FOSSGIS) — DOAR pentru probe
//   3. niciuna                       → dezactivat, iar ecranul o spune pe șleau
//
// Starea 2 există ca să putem încerca ecranul înainte să avem cheia. NU e pentru producție: e un
// server public, ținut de o asociație, cu politică de „uz rezonabil". A ne muta clienții pe el ar
// însemna să sprijinim un produs comercial pe infrastructura gratuită a altcuiva.

const ORS_KEY = process.env.ORS_API_KEY || null;
const ORS_URL = process.env.ORS_URL || 'https://api.openrouteservice.org/v2/directions/driving-hgv/geojson';
const VALHALLA_URL = process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de/route';
const PUBLIC_OK = String(process.env.ROUTER_PUBLIC || '') === 'true';
const TIMEOUT_MS = parseInt(process.env.ROUTER_TIMEOUT_MS) || 12000;

function furnizor() {
  if (ORS_KEY) return 'ors';
  if (PUBLIC_OK) return 'valhalla-public';
  return null;
}
function enabled() { return furnizor() != null; }
function stare() {
  const f = furnizor();
  return {
    pornit: !!f, furnizor: f,
    // Textul ăsta ajunge pe ecran. Nu „eroare de configurare" — omul trebuie să știe CE lipsește.
    motiv: f ? null : 'Calculul unui traseu nou nu e pornit — lipsește cheia de la serviciul de hărți.',
    deProba: f === 'valhalla-public',
  };
}

// Distanța dintre două puncte (km), pentru verificarea răspunsului furnizorului.
function _haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

async function _cerere(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { ok: res.ok, status: res.status, json, text };
  } finally { clearTimeout(timer); }
}

// ── OpenRouteService ──
async function _ors(start, end, v) {
  const body = {
    coordinates: [[start.lng, start.lat], [end.lng, end.lat]],   // ORS cere lng,lat — în ordinea asta
    instructions: false,
  };
  // Restricțiile de camion se trimit doar dacă le ȘTIM din fișă. O masă inventată ar produce un
  // traseu ocolit degeaba, iar omul ar plăti pe hârtie kilometri pe care nu-i face.
  const p = {};
  if (v && v.masaKg > 0) p.weight = Math.round(v.masaKg) / 1000;   // tone
  if (v && v.axe > 0) p.axleload = Math.round((v.masaKg || 0) / 1000 / v.axe * 100) / 100;
  if (Object.keys(p).length) body.options = { profile_params: { restrictions: p }, vehicle_type: 'hgv' };

  const r = await _cerere(ORS_URL, {
    method: 'POST',
    headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const det = (r.json && r.json.error && (r.json.error.message || r.json.error)) || (r.text || '').slice(0, 160);
    const e = new Error('Serviciul de hărți a refuzat cererea (' + r.status + '): ' + det);
    e.status = r.status === 403 || r.status === 401 ? 502 : 502;
    throw e;
  }
  const f = r.json && r.json.features && r.json.features[0];
  const coords = f && f.geometry && f.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('Serviciul de hărți n-a întors niciun traseu.');
  return {
    puncte: coords.map(c => [c[1], c[0]]),                        // înapoi la lat,lng
    km: Math.round(((f.properties && f.properties.summary && f.properties.summary.distance) || 0) / 100) / 10,
  };
}

// ── Valhalla (instanța publică FOSSGIS) — doar pentru probe ──
// Geometria vine codată („polyline6"); o desfacem aici, ca să nu tragem o bibliotecă pentru 20 de rânduri.
function _decodePolyline6(str) {
  const out = []; let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}
async function _valhalla(start, end, v) {
  const req = {
    locations: [{ lat: start.lat, lon: start.lng }, { lat: end.lat, lon: end.lng }],
    costing: 'truck',
    costing_options: { truck: {} },
    directions_options: { units: 'kilometers' },
  };
  if (v && v.masaKg > 0) req.costing_options.truck.weight = Math.round(v.masaKg) / 1000;
  if (v && v.axe > 0) req.costing_options.truck.axle_count = v.axe;
  const r = await _cerere(VALHALLA_URL + '?json=' + encodeURIComponent(JSON.stringify(req)), { method: 'GET' });
  if (!r.ok) throw new Error('Serviciul de hărți a refuzat cererea (' + r.status + ').');
  const legs = r.json && r.json.trip && r.json.trip.legs;
  if (!Array.isArray(legs) || !legs.length) throw new Error('Serviciul de hărți n-a întors niciun traseu.');
  let puncte = [];
  for (const l of legs) if (l.shape) puncte = puncte.concat(_decodePolyline6(l.shape));
  if (puncte.length < 2) throw new Error('Serviciul de hărți n-a întors niciun traseu.');
  const km = (r.json.trip.summary && r.json.trip.summary.length) || 0;
  return { puncte, km: Math.round(km * 10) / 10 };
}

// Traseul dintre două puncte. `v` = { masaKg, axe } din fișa vehiculului.
async function ruta(start, end, v) {
  const f = furnizor();
  if (!f) { const e = new Error(stare().motiv); e.status = 503; throw e; }
  const rez = f === 'ors' ? await _ors(start, end, v) : await _valhalla(start, end, v);

  // Verificare de bun-simț: un traseu rutier nu poate fi mai SCURT decât linia dreaptă dintre capete.
  // Dacă e, furnizorul ne-a dat altceva decât am cerut — mai bine o eroare decât un cost pe un drum
  // care nu există.
  const linie = _haversine([start.lat, start.lng], [end.lat, end.lng]);
  if (rez.km > 0 && rez.km + 0.5 < linie) {
    throw new Error('Traseul primit e mai scurt decât distanța în linie dreaptă — răspuns neverosimil, nu-l folosim.');
  }
  return Object.assign({ furnizor: f, deProba: f === 'valhalla-public' }, rez);
}

module.exports = { enabled, stare, ruta, _decodePolyline6 };
