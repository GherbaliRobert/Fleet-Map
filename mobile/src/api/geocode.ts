// Reverse-geocode via Nominatim (ca window.reverseGeocode din web), cu cache pe 4 zecimale.
const cache: Record<string, string> = {};

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (cache[key]) return cache[key];
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { 'Accept-Language': 'ro' } }
    );
    const data = await resp.json();
    const a = data.address || {};
    const parts: string[] = [];
    if (a.road) parts.push(a.house_number ? `${a.road} ${a.house_number}` : a.road);
    if (a.village || a.town || a.city) parts.push(a.village || a.town || a.city);
    if (a.county) parts.push(a.county);
    const result = parts.length ? parts.join(', ') : ((data.display_name || key).split(',').slice(0, 3).join(','));
    cache[key] = result;
    return result;
  } catch {
    return key;
  }
}
