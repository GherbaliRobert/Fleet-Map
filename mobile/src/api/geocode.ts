// Geocodare inversă PRIN SERVERUL nostru, nu direct la Nominatim.
//
// Motivul: politica Nominatim cere cel mult ~1 cerere/s pe aplicație și un User-Agent care o identifică.
// Un APK instalat pe zeci de telefoane care apelează direct înseamnă zeci de cereri paralele, din tot
// atâtea adrese IP, fără nicio coadă și cu un cache separat pe fiecare telefon — exact utilizarea pentru
// care Nominatim blochează. În plus, `GEOCODE_URL` de pe server nu acoperea nimic din traficul ăsta, deci
// trecerea pe un furnizor propriu sau plătit n-ar fi schimbat nimic pentru aplicația mobilă.
//
// Cheia de cache e pe 3 zecimale (~110 m) — ACEEAȘI ca pe server și ca pe web. Pe 4 (~11 m), cum era
// înainte, rata de potrivire scade de aproximativ zece ori și volumul real de apeluri crește.
import { api } from './client';

// Două cache-uri: forma scurtă („Stradă nr, Oraș", bună într-o listă) și cea completă (cu cartier, comună
// și județ) pentru fișa vehiculului — serverul le derivă pe amândouă din același răspuns, deci a doua nu
// costă niciun apel în plus.
type Detail = 'full' | undefined;
const cache: Record<string, string> = {}, cacheFull: Record<string, string> = {};
const key = (lat: number, lng: number) => Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3);

export async function reverseGeocodeMany(points: [number, number][], detail?: Detail): Promise<(string | null)[]> {
  const C = detail === 'full' ? cacheFull : cache;
  const out: (string | null)[] = new Array(points.length).fill(null);
  const cerute: [number, number][] = [], idx: number[] = [];
  points.forEach((p, i) => {
    const k = key(p[0], p[1]);
    if (C[k] !== undefined) { out[i] = C[k]; return; }
    cerute.push([Number(p[0]), Number(p[1])]); idx.push(i);
  });
  if (!cerute.length) return out;
  try {
    const r: any = await api('/api/geocode/reverse', { method: 'POST', body: { points: cerute.slice(0, 200), detail: detail === 'full' ? 'full' : undefined } });
    const labels: (string | null)[] = (r && r.labels) || [];
    labels.forEach((lb, n) => {
      if (n >= idx.length) return;
      out[idx[n]] = lb || null;
      // Doar rezultatele reale se memorează: un eșec temporar memorat ar lăsa vehiculul fără adresă
      // până la repornirea aplicației.
      if (lb) C[key(cerute[n][0], cerute[n][1])] = lb;
    });
  } catch { /* rețea → rămân null, se reîncearcă */ }
  return out;
}

export async function reverseGeocode(lat: number, lng: number, detail?: Detail): Promise<string> {
  const C = detail === 'full' ? cacheFull : cache;
  const k = key(lat, lng);
  if (C[k] !== undefined) return C[k];
  const r = await reverseGeocodeMany([[lat, lng]], detail);
  return r[0] || k;   // fără adresă → coordonatele, ca înainte
}
