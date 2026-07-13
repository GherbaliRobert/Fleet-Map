import { useEffect, useRef, useState } from 'preact/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Geolocation } from '@capacitor/geolocation';
import { Icon } from './Icon';
import type { Position } from '../api/endpoints';
import { statusOf, type Status, type StatusInfo } from '../lib/status';
import { fmtAgo } from '../lib/format';
import { createVehicleLayer, type VehicleLayer } from './vehicle3d';

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

// Conținutul unui marker. În modul 3D: DOAR eticheta cu numărul (mașina e model 3D real pe hartă,
// randat de stratul Three.js). În 2D: săgeata plată. Eticheta rămâne dreaptă la înclinare.
function markerInner(v: Position, st: StatusInfo, use3d: boolean) {
  const label = esc(v.plate || v.name || '');
  const lbl = label ? `<div class="vmk-label">${label}</div>` : '';
  if (use3d) return `<div class="vmk-inner vmk-3d">${lbl}</div>`;
  return `<div class="vmk-inner">${lbl}<div class="vmk-icon">${markerArrowSvg(HEX[st.status], v.angle || 0)}</div></div>`;
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
  const layerRef = useRef<VehicleLayer | null>(null);
  const _syncRef = useRef<() => void>(() => {});
  const prevStyle = useRef<boolean | null>(null);
  const lastFocus = useRef<string | undefined>(undefined);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [use3d, setUse3d] = useState<boolean>(() => { try { return localStorage.getItem('mapStyle') === '3d'; } catch { return false; } });
  function toggle3d() { setUse3d((v) => { const nv = !v; try { localStorage.setItem('mapStyle', nv ? '3d' : 'arrow'); } catch {} return nv; }); }
  const use3dRef = useRef(use3d); use3dRef.current = use3d; // valoarea curentă, citibilă din closure-ul de „load"
  const viewerMarker = useRef<maplibregl.Marker | null>(null); // poziția dispozitivului de pe care urmărești
  const watchId = useRef<string | null>(null);
  const [locating, setLocating] = useState(false);

  // „Unde sunt eu": cere permisiunea, ia poziția, pune un punct albastru + centrează, apoi urmărește live.
  async function locateMe() {
    const map = mapRef.current; if (!map || locating) return;
    setLocating(true);
    try {
      const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (perm.location === 'denied') { setLocating(false); return; }
      const showAt = (lng: number, lat: number, center: boolean) => {
        if (!viewerMarker.current) {
          const el = document.createElement('div'); el.className = 'vmk-me';
          el.innerHTML = '<div class="vmk-me-pulse"></div><div class="vmk-me-dot"></div>';
          viewerMarker.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        } else viewerMarker.current.setLngLat([lng, lat]);
        if (center) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
      };
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      showAt(pos.coords.longitude, pos.coords.latitude, true);
      if (!watchId.current) {
        watchId.current = await Geolocation.watchPosition({ enableHighAccuracy: true }, (p) => {
          if (p && p.coords) showAt(p.coords.longitude, p.coords.latitude, false);
        });
      }
    } catch { /* GPS indisponibil / refuzat */ }
    setLocating(false);
  }

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current, style: MAP_STYLE, center: [25, 45.9], zoom: 5.2,
      attributionControl: false, pitchWithRotate: true, dragRotate: true, maxPitch: 70,
      canvasContextAttributes: { antialias: true }, // muchii fine pe modelele 3D (context WebGL partajat cu Three.js)
    });
    // Gesturi: 2 degete pe verticală = ÎNCLINARE (pitch); 2 degete răsucite = rotire — exact ca Google Maps.
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    // jos-STÂNGA: colțul jos-dreapta e ocupat de FAB-ul „+" iar bara de tab-uri acoperă marginea de jos
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-left');
    map.on('load', () => {
      ready.current = true;
      // Clădiri 3D: sursă vectorială OpenFreeMap (gratuit, fără cheie; date OSM cu înălțimi) + strat
      // fill-extrusion. Se văd extrudate când înclini harta; ascunse în modul 2D (săgeți).
      try {
        map.addSource('ofm', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
        map.addLayer({
          id: '3d-buildings', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building',
          minzoom: 14, filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-color': '#c9cfd8',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 5]],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.9,
          },
        });
        map.setLayoutProperty('3d-buildings', 'visibility', use3dRef.current ? 'visible' : 'none');
      } catch (e) { /* sursa clădiri indisponibilă */ }
      try { const layer = createVehicleLayer(); map.addLayer(layer); layerRef.current = layer; } catch (e) { /* WebGL indisponibil */ }
      _syncRef.current(); // randează modelele 3D imediat ce stratul e gata
    });
    // buton „Detalii" din balon → ecranul vehiculului (delegare pe container, supraviețuiește re-randării)
    ref.current.addEventListener('click', (ev: any) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.vmpop-btn') : null;
      if (btn) { ev.stopPropagation(); const imei = btn.getAttribute('data-imei'); if (imei) onSelectRef.current(imei); }
    });
    mapRef.current = map;
    return () => {
      if (watchId.current) { try { Geolocation.clearWatch({ id: watchId.current }); } catch {} watchId.current = null; }
      viewerMarker.current = null;
      try { map.remove(); } catch {} mapRef.current = null; markers.current.clear(); fitted.current = false; ready.current = false;
    };
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

      // Modelele 3D reale (strat Three.js): ascunde-le în 2D, randează-le în 3D
      _syncRef.current = () => { if (layerRef.current) { layerRef.current.setVisible(use3d); layerRef.current.sync(vehicles, use3d, offlineMin); } };
      _syncRef.current();
      // Clădirile 3D urmează modul: vizibile în 3D, ascunse în 2D
      try { if (map.getLayer('3d-buildings')) map.setLayoutProperty('3d-buildings', 'visibility', use3d ? 'visible' : 'none'); } catch {}

      // Comutarea săgeți⇄3D NU mișcă niciodată camera (era: re-rula focus/follow → zoom nedorit pe hartă).
      const styleChanged = prevStyle.current !== null && prevStyle.current !== use3d; prevStyle.current = use3d;
      if (styleChanged) { prevFollow.current = !!follow; return; }

      if (focusImei && lastFocus.current !== focusImei) {
        lastFocus.current = focusImei; // focusează O DATĂ per selecție, nu la fiecare update live
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
      <button type="button" onClick={locateMe} aria-label="Unde sunt eu" title="Poziția mea"
        style={'position:absolute;top:56px;left:10px;z-index:1000;width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:' + (locating ? 'var(--accent)' : 'var(--text-primary)') + ';box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer'}>
        <Icon name="navigate" size={18} color="currentColor" />
      </button>
    </>
  );
}
