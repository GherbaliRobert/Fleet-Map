import { useEffect, useRef, useState } from 'preact/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Position } from '../api/endpoints';
import { statusOf, type Status, type StatusInfo } from '../lib/status';
import { fmtAgo } from '../lib/format';

const HEX: Record<Status, string> = { moving: '#3FE07D', idle: '#eab308', stopped: '#ef4444', offline: '#8A93A3' };

// Stil raster OSM pentru MapLibre (motor cu pitch nativ → înclinare cu 2 degete, ca Google Maps).
const MAP_STYLE: any = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function esc(s: any) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

// ─── Iconițe (săgeată 2D + izometric 3D) ───
function markerArrowSvg(color: string, angle: number) {
  return `<div style="transform:rotate(${angle}deg)"><svg width="26" height="26" viewBox="0 0 24 24" fill="${color}" stroke="#0B0E11" stroke-width="1.5"><path d="M12 2l7 18-7-4-7 4z"/></svg></div>`;
}
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
  if (cat === 'truck') return wh(13 + DX, 34 + DY) + wh(31 + DX, 34 + DY) + box(12, 34, 21, 10, DX, DY) + wh(13, 35) + wh(31, 35) + box(12, 35, 21, 6, DX * 0.5, DY * 0.5, glass);
  if (cat === 'van') return wh(13 + DX, 34 + DY) + wh(31 + DX, 34 + DY) + wh(13, 35) + wh(31, 35) + box(12, 35, 21, 11, DX, DY) + `<polygon points="${pts([[13, 34], [32, 34], [32, 30], [13, 30]])}" fill="${glass}"/>`;
  return wh(13 + DX, 33.5 + DY) + wh(30 + DX, 33.5 + DY) + box(11, 33.5, 22, 4.5, DX, DY) + box(15.5, 29, 13, 4.5, DX * 0.68, DY * 0.68, glass) + wh(14, 34.5) + wh(30, 34.5);
}
function markerIsoSvg(color: string, cat: string, moving: boolean, angle: number) {
  const iso = `<g transform="translate(0,-5)">${vehicleIso(cat, color)}</g>`;
  const arrow = moving ? `<g transform="rotate(${angle} 24 24)"><path d="M24 1.5 L28.4 9 L24 6.8 L19.6 9 Z" fill="${color}" stroke="#fff" stroke-width="0.9" stroke-linejoin="round"/></g>` : '';
  return `<svg width="42" height="42" viewBox="0 0 48 48" style="overflow:visible;display:block;"><ellipse cx="24" cy="33" rx="11.5" ry="3.4" fill="rgba(0,0,0,0.28)"/>${arrow}${iso}</svg>`;
}

// Conținutul unui marker (etichetă cu numărul + iconiță). Rămâne DREPT la înclinare (markerele MapLibre sunt „billboard").
function markerInner(v: Position, st: StatusInfo, use3d: boolean) {
  const color = HEX[st.status];
  const icon = use3d ? markerIsoSvg(color, catOf(v.vehicle_type), st.status === 'moving', v.angle || 0) : markerArrowSvg(color, v.angle || 0);
  const label = esc(v.plate || v.name || '');
  const lbl = label ? `<div class="vmk-label">${label}</div>` : '';
  return `<div class="vmk-inner">${lbl}<div class="vmk-icon">${icon}</div></div>`;
}
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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, { mk: maplibregl.Marker; el: HTMLDivElement; pop: maplibregl.Popup }>>(new Map());
  const fitted = useRef(false);
  const prevFollow = useRef(false);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [use3d, setUse3d] = useState<boolean>(() => { try { return localStorage.getItem('mapStyle') === '3d'; } catch { return false; } });
  function toggle3d() { setUse3d((v) => { const nv = !v; try { localStorage.setItem('mapStyle', nv ? '3d' : 'arrow'); } catch {} return nv; }); }

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current, style: MAP_STYLE, center: [25, 45.9], zoom: 5.2,
      attributionControl: false, pitchWithRotate: true, dragRotate: true, maxPitch: 70,
    });
    // Gesturi: 2 degete pe verticală = ÎNCLINARE (pitch); 2 degete răsucite = rotire — exact ca Google Maps.
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-right');
    map.on('load', () => { ready.current = true; });
    // buton „Detalii" din balon → ecranul vehiculului (delegare pe container, supraviețuiește re-randării)
    ref.current.addEventListener('click', (ev: any) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.vmpop-btn') : null;
      if (btn) { ev.stopPropagation(); const imei = btn.getAttribute('data-imei'); if (imei) onSelectRef.current(imei); }
    });
    mapRef.current = map;
    return () => { try { map.remove(); } catch {} mapRef.current = null; markers.current.clear(); fitted.current = false; ready.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    try {
      const seen = new Set<string>();
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90, n = 0;
      for (const v of vehicles) {
        if (v.latitude == null || v.longitude == null) continue;
        seen.add(v.imei);
        const st = statusOf(v, offlineMin);
        const stale = st.status === 'offline';
        const inner = markerInner(v, st, use3d);
        const pophtml = popupHtml(v, st, stale);
        let rec = markers.current.get(v.imei);
        if (rec) {
          rec.mk.setLngLat([v.longitude, v.latitude]);
          rec.el.innerHTML = inner;
          rec.pop.setHTML(pophtml);
        } else {
          const el = document.createElement('div');
          el.className = 'vmk';
          el.innerHTML = inner;
          const pop = new maplibregl.Popup({ closeButton: false, offset: 16, className: 'vmk-popup' }).setHTML(pophtml);
          const mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([v.longitude, v.latitude]).setPopup(pop).addTo(map);
          markers.current.set(v.imei, { mk, el, pop });
        }
        minLng = Math.min(minLng, v.longitude); maxLng = Math.max(maxLng, v.longitude);
        minLat = Math.min(minLat, v.latitude); maxLat = Math.max(maxLat, v.latitude); n++;
      }
      for (const [imei, rec] of markers.current) if (!seen.has(imei)) { rec.mk.remove(); markers.current.delete(imei); }

      if (focusImei) {
        const fv = vehicles.find((x) => x.imei === focusImei);
        if (fv && fv.latitude != null && fv.longitude != null) { map.easeTo({ center: [fv.longitude, fv.latitude], zoom: 15, duration: 500 }); fitted.current = true; }
      } else if (follow && n) {
        const bounds: [[number, number], [number, number]] = [[minLng, minLat], [maxLng, maxLat]];
        if (!prevFollow.current) map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
        else map.easeTo({ center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], duration: 500 });
        fitted.current = true;
      } else if (!fitted.current && n) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 15, duration: 0, animate: false });
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
    </>
  );
}
