import { trimitePrefs } from './uiPrefsCoada';

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

// Alegerea din butonul de pe hartă urcă și pe CONT (preferința „harta", aceeași ca pe web), fără să
// așteptăm răspunsul: dacă serverul nu răspunde, harta rămâne oricum pe ce ai ales, pe telefonul ăsta.
// Prin coada comună (uiPrefsCoada), ca tema: o citire a preferințelor pornită între timp nu mai calcă
// alegerea asta cu harta veche de pe cont.
export function saveMapLayer(k: MapLayerKey) {
  try { localStorage.setItem(KEY, k); } catch { /* */ }
  try { trimitePrefs({ harta: k }).catch(() => { /* rămâne local */ }); } catch { /* */ }
}

// Harta de pe cont → memoria telefonului, de unde o citește harta la deschidere (VehicleMap, loadMapLayer).
// „auto" (Automat) = stratul implicit, adică Străzi — ca pe web. O valoare necunoscută se ignoră: mai bine
// rămâne ce era pe telefon decât o hartă goală.
export function setMapLayerFromAccount(v: unknown) {
  const k: MapLayerKey | null = v === 'auto' ? MAP_LAYER_DEFAULT : (isMapLayer(v) ? v : null);
  if (!k) return;
  try { localStorage.setItem(KEY, k); } catch { /* */ }
}

// Alegerea făcută DOAR pe telefon, de dinainte ca harta să stea pe cont — ca s-o urcăm o singură dată,
// în loc s-o calce „Automat" de pe cont. null = n-a ales nimic sau a ales tot Străzi (același lucru cu „Automat").
export function localMapLayerChoice(): MapLayerKey | null {
  try {
    const v = localStorage.getItem(KEY);
    const k: MapLayerKey | null = v ? loadMapLayer() : (localStorage.getItem('mapSat') === '1' ? 'sat' : null);
    return k && k !== MAP_LAYER_DEFAULT ? k : null;
  } catch { return null; }
}
