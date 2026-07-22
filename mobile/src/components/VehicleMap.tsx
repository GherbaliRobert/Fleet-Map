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

// Straturi de bază (paritate cu web): 6 tipuri. {s} extins în URL-uri explicite (MapLibre cere listă), {r} eliminat.
const OSM_TILES = ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'];
const SAT_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
const HYBRID_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const MTILES: Record<string, { label: string; icon: string; tiles: string[]; labels?: string; maxzoom: number }> = {
  streets: { label: 'Străzi', icon: '🗺️', tiles: OSM_TILES, maxzoom: 19 },
  light: { label: 'Deschis', icon: '☀️', tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`), maxzoom: 20 },
  dark: { label: 'Închis', icon: '🌙', tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`), maxzoom: 20 },
  sat: { label: 'Satelit', icon: '🛰️', tiles: SAT_TILES, maxzoom: 19 },
  hybrid: { label: 'Satelit + etichete', icon: '🌍', tiles: SAT_TILES, labels: HYBRID_LABELS, maxzoom: 19 },
  terrain: { label: 'Relief', icon: '⛰️', tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), maxzoom: 17 },
};
const MLAYER_ORDER = ['streets', 'light', 'dark', 'sat', 'hybrid', 'terrain'];
// Aplică un strat de bază: schimbă tile-urile sursei 'osm' + gestionează overlay-ul de etichete (hibrid). Păstrează clădirile/vehiculele deasupra.
function applyMapLayer(map: maplibregl.Map, key: string) {
  const cfg = MTILES[key] || MTILES.streets;
  try { const src: any = map.getSource('osm'); if (src && src.setTiles) src.setTiles(cfg.tiles); } catch { /* */ }
  try {
    const hasLbl = !!cfg.labels;
    const hasLayer = !!map.getLayer('osm-labels');
    if (hasLbl && !hasLayer) {
      if (!map.getSource('osm-labels')) map.addSource('osm-labels', { type: 'raster', tiles: [cfg.labels!], tileSize: 256, maxzoom: cfg.maxzoom });
      const beforeId = (map.getStyle().layers || []).find((l: any) => l.id !== 'osm')?.id;
      map.addLayer({ id: 'osm-labels', type: 'raster', source: 'osm-labels' }, beforeId);
    } else if (hasLbl && hasLayer) {
      (map.getSource('osm-labels') as any).setTiles([cfg.labels!]);
    } else if (!hasLbl && hasLayer) {
      map.removeLayer('osm-labels');
    }
  } catch { /* */ }
}

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

// Instructaj „prima dată pe harta 3D" — 3 pași, gesturi pentru touch. Afișat o singură dată.
const TOUR3D: { e: string; t: string; d: string }[] = [
  { e: '🏙️', t: 'Bine ai venit pe harta 3D', d: 'Vezi vehiculele ca <b>modele 3D reale</b>, printre <b>clădiri 3D</b>. Harta se înclină pentru o perspectivă realistă a flotei.' },
  { e: '✌️', t: 'Rotește și înclină', d: 'Cu <b>2 degete</b>: trage vertical ca să <b>înclini</b> harta, răsucește-le ca să <b>rotești</b>. Ciupește pentru zoom — exact ca pe Google Maps.' },
  { e: '🎯', t: 'Localizare și dâră', d: 'Apasă <b>📍</b> ca să-ți vezi <b>poziția</b>. Apasă o mașină pentru <b>detalii</b>. Dâra colorată arată pe unde a trecut recent.' },
];

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
  // Implicit 2D: modul 3D NU se restaurează la pornire (altfel s-ar încărca plăcile 3D grele fără să fie cerute). 3D doar la apăsare.
  const [use3d, setUse3d] = useState<boolean>(false);
  function toggle3d() {
    const nv = !use3d;
    try { localStorage.setItem('mapStyle', nv ? '3d' : 'arrow'); } catch {}
    setUse3d(nv);
    if (nv) { try { if (!localStorage.getItem('ra3dTourSeen')) setTour(0); } catch {} } // instructaj o singură dată, DOAR la activarea 3D
  }
  const use3dRef = useRef(use3d); use3dRef.current = use3d; // valoarea curentă, citibilă din closure-ul de „load"
  const viewerMarker = useRef<maplibregl.Marker | null>(null); // poziția dispozitivului de pe care urmărești
  const watchId = useRef<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [layer, setLayer] = useState<string>(() => { try { const v = localStorage.getItem('mapLayer'); if (v && MTILES[v]) return v; if (localStorage.getItem('mapSat') === '1') return 'sat'; } catch { /* */ } return 'streets'; });
  const layerRefC = useRef(layer); layerRefC.current = layer;
  const [layerSheet, setLayerSheet] = useState(false);
  function pickLayer(k: string) { try { localStorage.setItem('mapLayer', k); } catch { /* */ } setLayer(k); setLayerSheet(false); }
  // Aplică stratul de bază LIVE (funcționează în 2D și 3D). La montare harta e null → se aplică din on('load').
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const apply = () => { try { applyMapLayer(map, layer); } catch { /* */ } };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [layer]);
  const [tour, setTour] = useState(-1); // -1 = ascuns; 0..n = pasul curent din instructaj (declanșat DOAR la apăsarea butonului 3D)
  function endTour() { try { localStorage.setItem('ra3dTourSeen', '1'); } catch {} setTour(-1); }

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
      // Dâra (trail) ~30m cu fade — sursă GeoJSON + strat de linie SUB stratul de vehicule (modelele desenează peste)
      try {
        map.addSource('veh-trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'veh-trails-line', type: 'line', source: 'veh-trails',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-opacity': ['get', 'op'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 6, 19, 12] },
        });
        map.setLayoutProperty('veh-trails-line', 'visibility', use3dRef.current ? 'visible' : 'none');
      } catch (e) { /* trail indisponibil */ }
      try { const layer = createVehicleLayer(); map.addLayer(layer); layerRef.current = layer; } catch (e) { /* WebGL indisponibil */ }
      _syncRef.current(); // randează modelele 3D imediat ce stratul e gata
      try { applyMapLayer(map, layerRefC.current); } catch { /* strat restaurat din sesiunea anterioară */ }
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
      try { if (map.getLayer('veh-trails-line')) map.setLayoutProperty('veh-trails-line', 'visibility', use3d ? 'visible' : 'none'); } catch {}

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
      <button type="button" onClick={() => setLayerSheet(true)} aria-label="Straturi hartă" title="Straturi hartă"
        style={'position:absolute;top:102px;left:10px;z-index:1000;width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:' + (layer !== 'streets' ? 'var(--accent)' : 'var(--text-primary)') + ';font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer'}>
        {MTILES[layer]?.icon || '🗺️'}
      </button>
      {layerSheet && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setLayerSheet(false); }}
          style="position:absolute;inset:0;z-index:2500;background:rgba(6,10,14,.5);display:flex;align-items:flex-end">
          <div style="width:100%;background:var(--bg-panel);border-top-left-radius:18px;border-top-right-radius:18px;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.4)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-size:15px">Straturi hartă</b><button onClick={() => setLayerSheet(false)} style="background:transparent;border:none;color:var(--text-muted);font-size:20px">×</button></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              {MLAYER_ORDER.map((k) => (
                <button onClick={() => pickLayer(k)} style={'display:flex;align-items:center;gap:9px;padding:12px;border-radius:12px;border:1px solid ' + (layer === k ? 'var(--accent)' : 'var(--border)') + ';background:' + (layer === k ? 'rgba(63,224,125,.12)' : 'var(--bg-card)') + ';color:var(--text-primary);font-weight:700;font-size:12.5px;font-family:inherit;text-align:left'}>
                  <span style="font-size:18px">{MTILES[k].icon}</span> {MTILES[k].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {tour >= 0 && (
        <div class="tour3d">
          <div class="tour3d-card" role="dialog" aria-modal="true">
            <button class="tour3d-x" onClick={endTour} aria-label="Închide">×</button>
            <div class="tour3d-ic">{TOUR3D[tour].e}</div>
            <h3 class="tour3d-title">{TOUR3D[tour].t}</h3>
            <p class="tour3d-desc" dangerouslySetInnerHTML={{ __html: TOUR3D[tour].d }} />
            <div class="tour3d-dots">{TOUR3D.map((_, k) => <span class={'tour3d-dot' + (k === tour ? ' on' : '')} />)}</div>
            <div class="tour3d-foot">
              <button class="tour3d-skip" onClick={endTour}>Sări peste</button>
              <div class="tour3d-nav">
                {tour > 0 && <button class="tour3d-btn back" onClick={() => setTour(tour - 1)}>Înapoi</button>}
                <button class="tour3d-btn next" onClick={() => (tour < TOUR3D.length - 1 ? setTour(tour + 1) : endTour())}>
                  {tour < TOUR3D.length - 1 ? 'Mai departe' : 'Am înțeles ✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
