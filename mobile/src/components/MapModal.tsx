import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import { Icon } from './Icon';

// Hartă pe tot ecranul (extindere) — interactivă: zoom, pan, scroll. Marker orientat pe direcția de mers.
export function MapModal({ lat, lng, angle = 0, color = '#3FE07D', label, onClose }: {
  lat: number; lng: number; angle?: number; color?: string; label?: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, doubleClickZoom: true }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const html = `<div class="vmarker" style="transform:rotate(${angle}deg)"><svg width="36" height="36" viewBox="0 0 24 24" fill="${color}" stroke="#0B0E11" stroke-width="1.5"><path d="M12 2l7 18-7-4-7 4z"/></svg></div>`;
    L.marker([lat, lng], { icon: L.divIcon({ className: '', html, iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ESC / back → închide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="mapmodal" role="dialog" aria-modal="true">
      <div class="mapmodal-bar">
        <span class="mapmodal-title">{label || 'Locație'}</span>
        <button class="mapmodal-close" onClick={onClose} aria-label="Închide harta"><Icon name="x" size={22} /></button>
      </div>
      <div ref={ref} class="mapmodal-map" />
    </div>
  );
}
