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
// Profil ¾ „fin" — curbe, roți cu jantă, geamuri cu reflexie (identic cu web `vehicleIso`).
function vehicleIso(cat: string, color: string): string {
  const edge = _shade(color, -55);
  const glass = '#aecfeb';
  const bs = `stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"`;
  const HL = 'rgba(255,255,255,0.38)', SH = 'rgba(0,0,0,0.18)';
  const hlF = 'rgba(255,255,255,0.75)';
  const wheel = (x: number, y: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#1b1e24"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.52).toFixed(1)}" fill="#cfd5dc"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.2).toFixed(1)}" fill="#8a919b"/>`;
  const skirt = (x1: number, x2: number, y: number) => `<path d="M${x1} ${y} L${x2} ${y} L${x2} ${y - 2.4} L${x1} ${y - 2.4} Z" fill="${SH}"/>`;
  if (cat === 'truck') {
    return `<rect x="5.5" y="16.5" width="23.5" height="16.5" rx="2.2" fill="${color}" ${bs}/>` +
      `<rect x="5.5" y="16.5" width="23.5" height="4.2" rx="2.2" fill="${HL}"/>` +
      `<rect x="7" y="20.5" width="20.5" height="0.9" rx="0.45" fill="rgba(0,0,0,0.10)"/>` +
      `<rect x="7" y="27.5" width="20.5" height="0.9" rx="0.45" fill="rgba(0,0,0,0.10)"/>` +
      skirt(6.5, 28.5, 33) +
      `<path d="M30 33 L30 20.8 C30 19.3 31 18.3 32.5 18.2 L36.6 18.2 C38.2 18.3 39.3 19 40.2 20.6 L42.2 24.6 C42.7 25.7 43 26.7 43 27.8 L43 30.8 C43 32.1 42.1 33 40.8 33 Z" fill="${color}" ${bs}/>` +
      `<path d="M33 19.6 L36.4 19.6 C37.6 19.7 38.4 20.3 39.1 21.6 L40.6 24.6 L33 24.6 C32.2 24.6 31.8 24.1 31.8 23.4 L31.8 20.9 C31.8 20.1 32.3 19.6 33 19.6 Z" fill="${glass}"/>` +
      `<path d="M33 19.6 L34.8 19.6 L32.4 24.6 L31.8 24.6 L31.8 20.9 C31.8 20.1 32.3 19.6 33 19.6 Z" fill="rgba(255,255,255,0.55)"/>` +
      skirt(30.5, 42.5, 33) +
      `<rect x="42" y="27.6" width="1.6" height="2.6" rx="0.8" fill="${hlF}"/>` +
      wheel(11.5, 33.4, 3.5) + wheel(21, 33.4, 3.5) + wheel(36.5, 33.4, 3.5);
  }
  if (cat === 'van') {
    return `<path d="M6.8 33 C5.6 33 4.8 32.1 4.8 30.9 L4.8 19.6 C4.8 18 5.9 16.9 7.5 16.9 L31 16.9 C33.4 16.9 35.4 17.7 36.9 19.5 L41.3 24.8 C42.4 26.1 43 27.4 43 29 L43 30.9 C43 32.1 42.2 33 41 33 Z" fill="${color}" ${bs}/>` +
      `<path d="M7.5 16.9 L31 16.9 C33.4 16.9 35.4 17.7 36.9 19.5 L37.9 20.7 L6 20.7 L6 19.3 C6.1 17.8 6.6 16.9 7.5 16.9 Z" fill="${HL}"/>` +
      `<path d="M32.4 19 C33.6 19.1 34.6 19.6 35.5 20.7 L38.8 24.7 L32.6 24.7 C31.8 24.7 31.4 24.2 31.4 23.5 L31.4 20.2 C31.4 19.4 31.7 19 32.4 19 Z" fill="${glass}"/>` +
      `<path d="M32.4 19 L33.8 19 L31.9 24.7 L31.4 24.7 L31.4 20.2 C31.4 19.4 31.7 19 32.4 19 Z" fill="rgba(255,255,255,0.5)"/>` +
      `<rect x="8.4" y="20.3" width="0.9" height="10" rx="0.45" fill="rgba(0,0,0,0.12)"/>` +
      `<rect x="26.8" y="20.3" width="0.9" height="10.4" rx="0.45" fill="rgba(0,0,0,0.12)"/>` +
      skirt(5.6, 42.4, 33) +
      `<rect x="42.1" y="27.4" width="1.5" height="2.6" rx="0.75" fill="${hlF}"/>` +
      wheel(12, 33.4, 3.4) + wheel(35, 33.4, 3.4);
  }
  return `<path d="M8.6 33 C6.9 33 5.8 31.9 5.8 30.2 L5.8 28.9 C5.8 27.4 6.8 26.2 8.3 25.9 L12.2 25.2 C14.4 21.4 17.6 19.4 21.6 19.3 L25.4 19.3 C29.3 19.4 32.4 21.3 34.7 25.1 L39.5 25.9 C41.2 26.2 42.4 27.5 42.4 29.2 L42.4 30.3 C42.4 31.9 41.3 33 39.7 33 Z" fill="${color}" ${bs}/>` +
    `<path d="M13.9 25.4 C15.9 22 18.6 20.5 21.7 20.4 L25.2 20.4 C28.4 20.5 31 22 33 25.2 L28.9 25.6 L17.8 25.6 Z" fill="${glass}"/>` +
    `<path d="M15.5 25.5 C17.3 22.3 19.7 20.8 22.4 20.5 L24 20.4 L21 25.6 L17.8 25.6 Z" fill="rgba(255,255,255,0.5)"/>` +
    `<rect x="23.2" y="20.8" width="0.85" height="4.6" fill="rgba(0,0,0,0.14)"/>` +
    `<path d="M8.3 26.2 C11 25.4 15 25 21.5 25 L26 25 C32 25 36.8 25.4 39.5 26.2 L39.5 27.2 C36.6 26.5 32 26.1 26 26.1 L21.5 26.1 C15.4 26.1 10.9 26.5 8.3 27.2 Z" fill="${HL}"/>` +
    skirt(6.8, 41.4, 33) +
    `<rect x="41" y="27.6" width="1.4" height="2" rx="0.7" fill="${hlF}"/>` +
    `<rect x="5.9" y="27.6" width="1.2" height="2" rx="0.6" fill="rgba(255,80,80,0.9)"/>` +
    wheel(13, 33.2, 3.4) + wheel(34.6, 33.2, 3.4);
}
function markerIsoSvg(color: string, cat: string, moving: boolean, angle: number) {
  const iso = `<g transform="translate(0,-4)">${vehicleIso(cat, color)}</g>`;
  const arrow = moving ? `<g transform="rotate(${angle} 24 24)"><path d="M24 1 L28.2 8.2 L24 6.2 L19.8 8.2 Z" fill="${color}" stroke="#fff" stroke-width="0.9" stroke-linejoin="round"/></g>` : '';
  return `<svg width="42" height="42" viewBox="0 0 48 48" style="overflow:visible;display:block;">` +
    `<ellipse cx="24" cy="33.6" rx="17" ry="3.2" fill="rgba(0,0,0,0.14)"/>` +
    `<ellipse cx="24" cy="33.6" rx="13" ry="2.4" fill="rgba(0,0,0,0.12)"/>${arrow}${iso}</svg>`;
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
