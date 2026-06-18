import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';

export function MiniMap({ lat, lng, angle = 0, color = '#3FE07D', zoom = 15 }: {
  lat: number; lng: number; angle?: number; color?: string; zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mk = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false, doubleClickZoom: false }).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; mk.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    try {
      const html = `<div class="vmarker" style="transform:rotate(${angle}deg)"><svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="#0B0E11" stroke-width="1.5"><path d="M12 2l7 18-7-4-7 4z"/></svg></div>`;
      const icon = L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] });
      if (mk.current) { mk.current.setLatLng([lat, lng]); mk.current.setIcon(icon); }
      else mk.current = L.marker([lat, lng], { icon }).addTo(map);
      map.setView([lat, lng], map.getZoom(), { animate: false });
    } catch { /* hartă în curs de demontare */ }
  }, [lat, lng, angle, color]);

  return <div ref={ref} style="width:100%;height:100%" />;
}
