import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import type { Position } from '../api/endpoints';
import { statusOf, type Status, type StatusInfo } from '../lib/status';
import { fmtAgo } from '../lib/format';

const HEX: Record<Status, string> = { moving: '#3FE07D', idle: '#eab308', stopped: '#ef4444', offline: '#8A93A3' };

function esc(s: any) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

function markerHtml(color: string, angle: number) {
  return `<div class="vmarker" style="transform:rotate(${angle}deg)">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="${color}" stroke="#0B0E11" stroke-width="1.5">
    <path d="M12 2l7 18-7-4-7 4z"/></svg></div>`;
}

// Balon: nume + status; pentru vehiculele fără transmisie → semn de exclamare + de când.
function popupHtml(v: Position, st: StatusInfo, stale: boolean) {
  const title = `${esc(v.name || v.imei)}${v.plate ? ' · ' + esc(v.plate) : ''}`;
  const line = stale
    ? `<div class="vmpop-warn"><span class="vmpop-bang">!</span>Fără transmisie · ${esc(fmtAgo(v.timestamp))}</div>`
    : `<div class="vmpop-st" style="color:${st.color}">${esc(st.label)}${v.speed ? ' · ' + Math.round(v.speed) + ' km/h' : ''}</div>`;
  return `<div class="vmpop"><div class="vmpop-name">${title}</div>${line}<button class="vmpop-btn" data-imei="${esc(v.imei)}">Detalii →</button></div>`;
}

export function VehicleMap({ vehicles, offlineMin, onSelect, focusImei }: {
  vehicles: Position[]; offlineMin: number; onSelect: (imei: string) => void; focusImei?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    // butonul „Detalii" din balon → ecranul vehiculului
    map.on('popupopen', (e: any) => {
      const el = e.popup.getElement && e.popup.getElement();
      const btn = el && el.querySelector('.vmpop-btn');
      if (btn) btn.addEventListener('click', () => { const imei = btn.getAttribute('data-imei'); if (imei) onSelectRef.current(imei); }, { once: true });
    });
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; markers.current.clear(); fitted.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    try {
    const seen = new Set<string>();
    const pts: [number, number][] = [];
    for (const v of vehicles) {
      if (v.latitude == null || v.longitude == null) continue; // fără ultimă locație → doar în listă
      seen.add(v.imei);
      const st = statusOf(v, offlineMin);
      const stale = st.status === 'offline';
      const icon = L.divIcon({ className: '', html: markerHtml(HEX[st.status], v.angle || 0), iconSize: [26, 26], iconAnchor: [13, 13] });
      const popup = popupHtml(v, st, stale);
      let m = markers.current.get(v.imei);
      if (m) { m.setLatLng([v.latitude, v.longitude]); m.setIcon(icon); m.setPopupContent(popup); }
      else {
        m = L.marker([v.latitude, v.longitude], { icon }).addTo(map);
        m.bindPopup(popup, { closeButton: false, offset: [0, -8] });
        markers.current.set(v.imei, m);
      }
      pts.push([v.latitude, v.longitude]);
    }
    for (const [imei, m] of markers.current) if (!seen.has(imei)) { map.removeLayer(m); markers.current.delete(imei); }

    if (focusImei) {
      const fv = vehicles.find((x) => x.imei === focusImei);
      if (fv && fv.latitude != null && fv.longitude != null) { map.setView([fv.latitude, fv.longitude], 15, { animate: false }); fitted.current = true; }
    } else if (!fitted.current && pts.length) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: false });
      fitted.current = true;
    }
    } catch { /* hartă în curs de demontare */ }
  }, [vehicles, focusImei]);

  return <div ref={ref} class="vmap" />;
}
