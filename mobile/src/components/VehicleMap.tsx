import { useEffect, useRef, useState } from 'preact/hooks';
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

// ─── Iconițe IZOMETRICE 3D (paritate cu web) ───
function _shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = amt / 100;
  r = Math.max(0, Math.min(255, Math.round(r + f * (amt < 0 ? r : 255 - r))));
  g = Math.max(0, Math.min(255, Math.round(g + f * (amt < 0 ? g : 255 - g))));
  b = Math.max(0, Math.min(255, Math.round(b + f * (amt < 0 ? b : 255 - b))));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function catOf(vt?: string): string {
  const t = String(vt || '').toLowerCase();
  if (/camion|truck|tir|autotractor|betonier|mixer/.test(t)) return 'truck';
  if (/dub|van|autobuz|bus|micro/.test(t)) return 'van';
  return 'car';
}
function vehicleIso(cat: string, color: string): string {
  const cT = _shade(color, 30), cS = _shade(color, -34), cEdge = _shade(color, -58);
  const glass = 'rgba(150,205,255,0.9)', wheel = '#14171d';
  const DX = 6.5, DY = -6.5;
  const pts = (a: number[][]) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const box = (x: number, y: number, w: number, h: number, dx: number, dy: number, fFace?: string) => {
    const top = `<polygon points="${pts([[x, y - h], [x + w, y - h], [x + w + dx, y - h + dy], [x + dx, y - h + dy]])}" fill="${cT}" stroke="${cEdge}" stroke-width="0.5" stroke-linejoin="round"/>`;
    const side = `<polygon points="${pts([[x + w, y], [x + w, y - h], [x + w + dx, y - h + dy], [x + w + dx, y + dy]])}" fill="${cS}" stroke="${cEdge}" stroke-width="0.5" stroke-linejoin="round"/>`;
    const front = `<polygon points="${pts([[x, y], [x + w, y], [x + w, y - h], [x, y - h]])}" fill="${fFace || color}" stroke="${cEdge}" stroke-width="0.5" stroke-linejoin="round"/>`;
    return side + top + front;
  };
  const wh = (wx: number, wy: number) => `<ellipse cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" rx="2.5" ry="1.7" fill="${wheel}"/>`;
  if (cat === 'truck') {
    return wh(13 + DX, 34 + DY) + wh(31 + DX, 34 + DY) + box(12, 34, 21, 10, DX, DY) + wh(13, 35) + wh(31, 35) + box(12, 35, 21, 6, DX * 0.5, DY * 0.5, glass);
  }
  if (cat === 'van') {
    return wh(13 + DX, 34 + DY) + wh(31 + DX, 34 + DY) + wh(13, 35) + wh(31, 35) + box(12, 35, 21, 11, DX, DY) +
      `<polygon points="${pts([[13, 34], [32, 34], [32, 30], [13, 30]])}" fill="${glass}"/>`;
  }
  return wh(13 + DX, 33.5 + DY) + wh(30 + DX, 33.5 + DY) + box(11, 33.5, 22, 4.5, DX, DY) + box(15.5, 29, 13, 4.5, DX * 0.68, DY * 0.68, glass) + wh(14, 34.5) + wh(30, 34.5);
}
function markerHtml3d(color: string, cat: string, moving: boolean, angle: number) {
  const iso = `<g transform="translate(0,-5)">${vehicleIso(cat, color)}</g>`;
  const arrow = moving ? `<g transform="rotate(${angle} 24 24)"><path d="M24 1.5 L28.4 9 L24 6.8 L19.6 9 Z" fill="${color}" stroke="#fff" stroke-width="0.9" stroke-linejoin="round"/></g>` : '';
  return `<div class="vmarker3d"><svg width="40" height="40" viewBox="0 0 48 48" style="overflow:visible;">` +
    `<ellipse cx="24" cy="33" rx="11.5" ry="3.4" fill="rgba(0,0,0,0.22)"/>${arrow}${iso}</svg></div>`;
}

// Balon: nume + status; pentru vehiculele fără transmisie → semn de exclamare + de când.
function popupHtml(v: Position, st: StatusInfo, stale: boolean) {
  const title = `${esc(v.name || v.imei)}${v.plate ? ' · ' + esc(v.plate) : ''}`;
  const line = stale
    ? `<div class="vmpop-warn"><span class="vmpop-bang">!</span>Fără transmisie · ${esc(fmtAgo(v.timestamp))}</div>`
    : `<div class="vmpop-st" style="color:${st.color}">${esc(st.label)}${v.speed ? ' · ' + Math.round(v.speed) + ' km/h' : ''}</div>`;
  return `<div class="vmpop"><div class="vmpop-name">${title}</div>${line}<button class="vmpop-btn" data-imei="${esc(v.imei)}">Detalii →</button></div>`;
}

export function VehicleMap({ vehicles, offlineMin, onSelect, focusImei, follow }: {
  vehicles: Position[]; offlineMin: number; onSelect: (imei: string) => void; focusImei?: string; follow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const fitted = useRef(false);
  const prevFollow = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [use3d, setUse3d] = useState<boolean>(() => { try { return localStorage.getItem('mapStyle') === '3d'; } catch { return false; } });
  function toggle3d() { setUse3d((v) => { const nv = !v; try { localStorage.setItem('mapStyle', nv ? '3d' : 'arrow'); } catch {} return nv; }); }
  const [tilt, setTilt] = useState<boolean>(() => { try { return localStorage.getItem('mapTilt') === '1'; } catch { return false; } });
  function toggleTilt() { setTilt((v) => { const nv = !v; try { localStorage.setItem('mapTilt', nv ? '1' : '0'); } catch {} return nv; }); }
  // Înclinarea hărții (perspectivă CSS pe container) — Leaflet calculează în dimensiunea de layout, deci markerele
  // rămân aliniate cu tile-urile; le contra-rotim din CSS (.vmap-tilt) ca să stea verticale.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.classList.toggle('vmap-tilt', tilt);
    setTimeout(() => { try { mapRef.current && mapRef.current.invalidateSize(); } catch {} }, 60);
  }, [tilt]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, keepBuffer: 6 }).addTo(map);
    mapRef.current = map;
    // butonul „Detalii" din balon → ecranul vehiculului. DELEGARE (un singur listener pe container) —
    // supraviețuiește lui setPopupContent de la update-urile live (înainte, listener-ul per-buton se pierdea → butonul nu funcționa).
    ref.current.addEventListener('click', (ev: any) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.vmpop-btn') : null;
      if (btn) { ev.stopPropagation(); const imei = btn.getAttribute('data-imei'); if (imei) onSelectRef.current(imei); }
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
      const icon = use3d
        ? L.divIcon({ className: '', html: markerHtml3d(HEX[st.status], catOf(v.vehicle_type), st.status === 'moving', v.angle || 0), iconSize: [40, 40], iconAnchor: [20, 24] })
        : L.divIcon({ className: '', html: markerHtml(HEX[st.status], v.angle || 0), iconSize: [26, 26], iconAnchor: [13, 13] });
      const popup = popupHtml(v, st, stale);
      const label = esc(v.plate || v.name || ''); // eticheta permanentă lângă marker (numărul mașinii, ca xMonitor)
      let m = markers.current.get(v.imei);
      if (m) {
        m.setLatLng([v.latitude, v.longitude]); m.setIcon(icon); m.setPopupContent(popup);
        if (label) { if (m.getTooltip()) m.setTooltipContent(label); else m.bindTooltip(label, { permanent: true, direction: 'top', className: 'vlabel', offset: [0, -12] }); }
      }
      else {
        m = L.marker([v.latitude, v.longitude], { icon }).addTo(map);
        m.bindPopup(popup, { closeButton: false, offset: [0, -8] });
        if (label) m.bindTooltip(label, { permanent: true, direction: 'top', className: 'vlabel', offset: [0, -12] });
        markers.current.set(v.imei, m);
      }
      pts.push([v.latitude, v.longitude]);
    }
    for (const [imei, m] of markers.current) if (!seen.has(imei)) { map.removeLayer(m); markers.current.delete(imei); }

    if (focusImei) {
      const fv = vehicles.find((x) => x.imei === focusImei);
      if (fv && fv.latitude != null && fv.longitude != null) { map.setView([fv.latitude, fv.longitude], 15, { animate: false }); fitted.current = true; }
    } else if (follow && pts.length) {
      const b = L.latLngBounds(pts);
      // La ACTIVAREA urmăririi → încadrează. În continuare → doar re-centrează (panTo), PĂSTREAZĂ zoom-ul userului
      // (poate da zoom out fără să-i sară harta înapoi la fiecare update).
      if (!prevFollow.current) map.fitBounds(b.pad(0.25), { animate: true });
      else map.panTo(b.getCenter(), { animate: true });
      fitted.current = true;
    } else if (!fitted.current && pts.length) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: false });
      fitted.current = true;
    }
    prevFollow.current = !!follow;
    } catch { /* hartă în curs de demontare */ }
  }, [vehicles, focusImei, follow, use3d]);

  return (
    <>
      <div ref={ref} class="vmap" />
      <button type="button" onClick={toggle3d} aria-label="Comută iconițe 3D" title="Iconițe 3D"
        style={'position:absolute;top:10px;left:10px;z-index:1000;width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:' + (use3d ? 'var(--accent)' : 'var(--text-primary)') + ';font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer'}>
        {use3d ? '🚚' : '▲'}
      </button>
      <button type="button" onClick={toggleTilt} aria-label="Înclină harta" title="Înclinare hartă (3D)"
        style={'position:absolute;top:56px;left:10px;z-index:1000;width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:' + (tilt ? 'var(--accent)' : 'var(--text-primary)') + ';font-size:15px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer'}>
        3D
      </button>
    </>
  );
}
