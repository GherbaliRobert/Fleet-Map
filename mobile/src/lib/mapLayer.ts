// Stratul de hartă ales pe telefon (meniul „Straturi hartă"). O SINGURĂ sursă pentru cheile valide,
// pentru valoarea implicită și pentru migrarea alegerilor vechi — harta (VehicleMap) doar le folosește.
//
// ⚠ Straturile „Deschis" (light) și „Închis" (dark) veneau de la CARTO (basemaps.cartocdn.com).
// CARTO a început să ceară CHEIE: tile-urile vin acum cu „API KEY REQUIRED" scris peste toată harta.
// Pe web au ieșit în 39584ad, iar „Automat" merge pe Străzi (OpenStreetMap), pe ambele teme.
// Aici la fel: le scoatem din listă și mutăm alegerea veche pe Străzi, ca un telefon afectat să-și
// revină singur la următoarea deschidere. NU le repune fără un furnizor cu cheie.

export const MAP_LAYER_ORDER = ['streets', 'sat', 'hybrid', 'terrain'] as const;
export type MapLayerKey = typeof MAP_LAYER_ORDER[number];

// Ce vede omul pe web la „Automat" — acum harta cu străzi, indiferent de temă.
export const MAP_LAYER_DEFAULT: MapLayerKey = 'streets';

const KEY = 'mapLayer';
// Straturi care au existat și au fost scoase → unde ajunge cine le alesese.
const REMOVED: Record<string, MapLayerKey> = { light: MAP_LAYER_DEFAULT, dark: MAP_LAYER_DEFAULT };

export function isMapLayer(k: unknown): k is MapLayerKey {
  return typeof k === 'string' && (MAP_LAYER_ORDER as readonly string[]).indexOf(k) >= 0;
}

// Citește alegerea salvată. O valoare care nu mai există (ex. „light"/„dark" de la CARTO) e rescrisă
// pe loc cu stratul implicit — nu doar ignorată — ca să nu mai rămână nimic stricat în memorie.
export function loadMapLayer(): MapLayerKey {
  try {
    const v = localStorage.getItem(KEY);
    if (isMapLayer(v)) return v;
    if (v) {
      const next = REMOVED[v] || MAP_LAYER_DEFAULT;
      try { localStorage.setItem(KEY, next); } catch { /* */ }
      return next;
    }
    // Comutatorul vechi „satelit" (înainte de meniul cu straturi) — doar dacă n-a ales altceva între timp.
    if (localStorage.getItem('mapSat') === '1') return 'sat';
  } catch { /* stocare indisponibilă */ }
  return MAP_LAYER_DEFAULT;
}

export function saveMapLayer(k: MapLayerKey) {
  try { localStorage.setItem(KEY, k); } catch { /* */ }
}
