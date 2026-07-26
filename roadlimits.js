// roadlimits.js — limite de viteză reale din OpenStreetMap, via Overpass API.
//
// REGULĂ IMPORTANTĂ (politica de uz Overpass): NU se interoghează per-poziție pentru toată flota — ar fi blocat.
// Aici: o SINGURĂ interogare bbox per traseu (la cerere, când userul deschide un traseu), throttled + cache agresiv.
// Datele OSM sunt ODbL → orice afișare necesită atribuirea „© OpenStreetMap contributors".

// Configurabil (una sau mai multe adrese, separate prin virgulă), ca să se poată trece pe o instanță
// proprie fără atins codul. Implicit rămân cele publice: aici volumul NU crește cu flota, ci cu numărul de
// click-uri pe „Limite reale", și e deja plafonat structural (1 cerere/s, cache 7 zile, max 25 vehicule/raport).
const ENDPOINTS = (process.env.OVERPASS_URL || '').split(',').map(s => s.trim()).filter(Boolean).length
  ? process.env.OVERPASS_URL.split(',').map(s => s.trim()).filter(Boolean)
  : [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
const ATTRIBUTION = '© OpenStreetMap contributors';
const CACHE_TTL = 7 * 24 * 3600 * 1000;  // 7 zile (limitele de viteză se schimbă rar)
const MIN_INTERVAL = 1000;               // ms minim între apeluri Overpass (politică de uz)
const MATCH_M = 30;                       // m — distanță max punct→drum ca să-i atribui limita
const AREA_GUARD = 0.25;                  // deg² — peste asta traseul e prea mare pt. o interogare unică
const MAX_POINTS = 5000;

const _cache = new Map();   // bboxKey -> { ts, ways: [{maxspeed, bbox:[s,w,n,e], pts:[[lat,lng]...]}] }
let _lastCall = 0;
let _chain = Promise.resolve();           // serializează apelurile Overpass (anti-burst)

// Parsează tag-ul OSM `maxspeed` → km/h. Null = necunoscut/nelimitat/implicit ndeterminabil.
function parseMaxspeed(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  let m = s.match(/^(\d+(?:\.\d+)?)\s*mph$/);   if (m) return Math.round(parseFloat(m[1]) * 1.60934);
  m = s.match(/^(\d+(?:\.\d+)?)\s*km\/?h$/);     if (m) return Math.round(parseFloat(m[1]));
  // Limite implicite codificate (RO + generice): "RO:urban", "RO:rural", "RO:motorway"…
  if (/living_street|walk/.test(s)) return 20;
  if (/zone:?\s*\d+/.test(s)) { const z = s.match(/(\d+)/); return z ? parseInt(z[1], 10) : null; }
  if (/urban|city/.test(s)) return 50;
  if (/rural/.test(s)) return 90;
  if (/motorway/.test(s)) return 130;
  if (/trunk|express/.test(s)) return 100;
  return null; // "none", "signals", "variable", necunoscut → fără limită utilă
}

// Limită ESTIMATĂ din clasa drumului OSM (când lipsește maxspeed). Valori orientative RO — marcate „estimat".
const CLASS_LIMIT = {
  motorway: 130, motorway_link: 80,
  trunk: 100, trunk_link: 60,
  primary: 90, primary_link: 60,
  secondary: 80, secondary_link: 50,
  tertiary: 70, tertiary_link: 50,
  unclassified: 50, residential: 50,
  living_street: 20, service: 20, road: 50,
};
function inferFromClass(hw) { return (hw && CLASS_LIMIT[hw] != null) ? CLASS_LIMIT[hw] : null; }

function _enqueue(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.then(() => {}, () => {});
  return run;
}

async function _overpassBbox(s, w, n, e) {
  // Toate drumurile CAROSABILE (cu tip + maxspeed) — ca să putem DEDUCE limita din clasă unde lipsește maxspeed.
  const HW = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)(_link)?$';
  const q = `[out:json][timeout:25];way["highway"~"${HW}"](${s},${w},${n},${e});out geom;`;
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const wait = Math.max(0, MIN_INTERVAL - (Date.now() - _lastCall));
      if (wait) await new Promise(r => setTimeout(r, wait));
      _lastCall = Date.now();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'RATracks/1.0 (+https://ratrack.ro)' },
        body: q, signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) { lastErr = new Error('Overpass HTTP ' + r.status); continue; }
      const j = await r.json();
      const ways = [];
      for (const el of (j.elements || [])) {
        if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
        const tags = el.tags || {};
        let ms = parseMaxspeed(tags.maxspeed), estimated = false;
        if (ms == null) { ms = inferFromClass(tags.highway); estimated = true; } // fără maxspeed real → deduc din clasă
        if (ms == null) continue; // clasă necunoscută → fără limită
        const pts = el.geometry.map(g => [g.lat, g.lon]);
        let mnLa = 90, mnLo = 180, mxLa = -90, mxLo = -180;
        for (const [a, b] of pts) { if (a < mnLa) mnLa = a; if (a > mxLa) mxLa = a; if (b < mnLo) mnLo = b; if (b > mxLo) mxLo = b; }
        ways.push({ maxspeed: ms, estimated: estimated, bbox: [mnLa, mnLo, mxLa, mxLo], pts });
      }
      return ways;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Overpass indisponibil');
}

// Proiecția punctului pe segment: distanța în metri ȘI punctul proiectat.
// (proiecție echirectangulară locală — destul de precisă la scară de stradă)
// Proiecția se calcula deja aici, pentru distanță, dar se arunca; e exact ce trebuie ca să „lipim" un punct
// GPS pe carosabil, deci o întoarcem. Vezi `snapPoints`.
function _projToSeg(plat, plng, alat, alng, blat, blng) {
  const R = 6371000, rad = Math.PI / 180, clat = Math.cos(plat * rad);
  const X = (lo) => lo * rad * clat * R, Y = (la) => la * rad * R;
  const px = X(plng), py = Y(plat), ax = X(alng), ay = Y(alat), bx = X(blng), by = Y(blat);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return {
    d: Math.hypot(px - qx, py - qy),
    lat: qy / (rad * R),
    lng: clat ? qx / (rad * clat * R) : plng,   // clat=0 doar la poli — irelevant aici, dar nu împărțim la 0
  };
}
function _distToSeg(plat, plng, alat, alng, blat, blng) {
  return _projToSeg(plat, plng, alat, alng, blat, blng).d;
}

// Drumurile din zona traseului: calculul bbox + garda de suprafață + cache-ul de 7 zile, într-un singur loc
// (le folosesc și limitele de viteză, și alinierea pe drumuri — pe același traseu se face O SINGURĂ interogare).
async function _waysFor(points) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) {
    const la = +p[0], lo = +p[1];
    if (!isFinite(la) || !isFinite(lo)) continue;
    if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo;
  }
  if (s > n) return null;
  s -= 0.003; w -= 0.003; n += 0.003; e += 0.003;
  if ((n - s) * (e - w) > AREA_GUARD) { const err = new Error('Traseu prea mare pentru datele OSM — apropie pe un segment'); err.code = 'AREA'; throw err; }
  const key = [s, w, n, e].map(x => x.toFixed(2)).join(',');
  const c = _cache.get(key);
  if (c && (Date.now() - c.ts) < CACHE_TTL) return c.ways;
  const ways = await _enqueue(() => _overpassBbox(s, w, n, e));
  _cache.set(key, { ts: Date.now(), ways });
  if (_cache.size > 200) _cache.delete(_cache.keys().next().value);
  return ways;
}

// „Lipirea" punctelor pe carosabil, fără OSRM: fiecare punct se mută pe cel mai apropiat drum, dacă e destul
// de aproape. NU e map-matching adevărat — nu reconstruiește drumul DINTRE puncte și nu ține cont de topologie
// (la pasaje suprapuse sau străzi paralele poate alege greșit). Pentru desenarea coridoarelor, unde punctele
// sunt puse manual și dese, rezultatul e practic identic; pentru trasee cu poziții rare, linia tot taie
// colțurile — doar că fiecare colț ajunge pe stradă.
// Un punct fără drum în raza SNAP_M rămâne NEATINS: mai bine nemișcat decât mutat aiurea.
const SNAP_M = 40;   // mai larg decât MATCH_M (30): aici acceptăm și deriva GPS din oraș, nu doar apartenența
async function snapPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  if (points.length > MAX_POINTS) points = points.slice(0, MAX_POINTS);
  const ways = await _waysFor(points);
  if (!ways || !ways.length) return null;
  const out = []; let mutate = 0;
  for (const p of points) {
    const plat = +p[0], plng = +p[1];
    if (!isFinite(plat) || !isFinite(plng)) { out.push([plat, plng]); continue; }
    let best = null, bestD = SNAP_M;
    for (const wy of ways) {
      const bb = wy.bbox;
      if (plat < bb[0] - 0.001 || plat > bb[2] + 0.001 || plng < bb[1] - 0.001 || plng > bb[3] + 0.001) continue;
      for (let i = 1; i < wy.pts.length; i++) {
        const pr = _projToSeg(plat, plng, wy.pts[i - 1][0], wy.pts[i - 1][1], wy.pts[i][0], wy.pts[i][1]);
        if (pr.d < bestD) { bestD = pr.d; best = pr; }
      }
    }
    if (best) { out.push([best.lat, best.lng]); mutate++; } else out.push([plat, plng]);
  }
  // Dacă aproape nimic n-a nimerit un drum (zonă fără acoperire OSM, off-road), nu pretindem că am aliniat.
  return mutate >= Math.max(2, Math.round(points.length * 0.3)) ? { points: out, snapped: mutate, attribution: ATTRIBUTION } : null;
}

// Pentru fiecare punct [lat,lng], limita drumului celui mai apropiat (≤ MATCH_M m), altfel null.
// `points`: array de [lat, lng]. Întoarce { limits:[km/h|null], attribution, ways }.
async function limitsForPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return { limits: (points || []).map(() => null), attribution: ATTRIBUTION, ways: 0 };
  if (points.length > MAX_POINTS) points = points.slice(0, MAX_POINTS);
  const ways = await _waysFor(points);
  if (!ways) return { limits: points.map(() => null), attribution: ATTRIBUTION, ways: 0 };

  const limits = [], estimated = [];
  for (const p of points) {
    const plat = +p[0], plng = +p[1];
    if (!isFinite(plat) || !isFinite(plng)) { limits.push(null); estimated.push(false); continue; }
    let best = null, bestEst = false, bestD = MATCH_M;
    for (const wy of ways) {
      const bb = wy.bbox;
      if (plat < bb[0] - 0.001 || plat > bb[2] + 0.001 || plng < bb[1] - 0.001 || plng > bb[3] + 0.001) continue;
      for (let i = 1; i < wy.pts.length; i++) {
        const d = _distToSeg(plat, plng, wy.pts[i - 1][0], wy.pts[i - 1][1], wy.pts[i][0], wy.pts[i][1]);
        if (d < bestD) { bestD = d; best = wy.maxspeed; bestEst = wy.estimated; }
      }
    }
    limits.push(best); estimated.push(best != null ? bestEst : false);
  }
  return { limits, estimated, attribution: ATTRIBUTION, ways: ways.length };
}

module.exports = { limitsForPoints, snapPoints, parseMaxspeed, ATTRIBUTION };
