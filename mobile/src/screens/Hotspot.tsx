import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { vehicles, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './route.css';
import './admin.css'; // .pf-kpis, .adm-list/item/empty
import './detail.css'; // .sheet*

// Hotspot & Rutare — paritate cu web (#hotspot-panel): heatmap opriri/poziții cu selector vehicul + mod + interval,
// PLUS analiză zonă desenată (poligon/cerc) → /api/zone-report. Totul per-companie (viewReports + withScope).
type Preset = 'today' | 'week' | 'month' | 'custom';
type DrawMode = 'off' | 'polygon' | 'circle';

function computeRange(preset: Preset, cf: string, ct: string) {
  const now = new Date();
  if (preset === 'custom' && cf && ct) {
    const f = new Date(cf); f.setHours(0, 0, 0, 0);
    const t = new Date(ct); t.setHours(23, 59, 59, 999);
    return { from: f.toISOString(), to: t.toISOString() };
  }
  const from = new Date(now);
  if (preset === 'today') from.setHours(0, 0, 0, 0);
  else { from.setDate(from.getDate() - (preset === 'month' ? 30 : 7)); from.setHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to: now.toISOString() };
}

export function Hotspot() {
  const loc = useLocation();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const drawLayer = useRef<L.LayerGroup | null>(null);

  const [mode, setMode] = useState<'stops' | 'positions'>('stops');
  const [preset, setPreset] = useState<Preset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selImei, setSelImei] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [count, setCount] = useState(0);

  // ── stare desen zonă (în ref pt. handler-ul de click, + oglindă în state pt. UI) ──
  const drawModeRef = useRef<DrawMode>('off');
  const polyRef = useRef<[number, number][]>([]);
  const circleRef = useRef<{ center: [number, number] | null; radius: number }>({ center: null, radius: 500 });
  const [drawMode, setDrawMode] = useState<DrawMode>('off');
  const [polyCount, setPolyCount] = useState(0);
  const [circleSet, setCircleSet] = useState(false);
  const [radius, setRadius] = useState(500);
  const [analyzing, setAnalyzing] = useState(false);
  const [zoneResult, setZoneResult] = useState<any | null>(null);

  function redrawZone() {
    const dl = drawLayer.current; if (!dl) return;
    dl.clearLayers();
    const dm = drawModeRef.current;
    if (dm === 'polygon') {
      const pts = polyRef.current;
      pts.forEach((p) => L.circleMarker(p, { radius: 4, color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 1, weight: 1 }).addTo(dl));
      if (pts.length >= 2) L.polyline([...pts, ...(pts.length >= 3 ? [pts[0]] : [])], { color: '#3FE07D', weight: 2, dashArray: '5,5' }).addTo(dl);
      if (pts.length >= 3) L.polygon(pts, { color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 0.12, weight: 1 }).addTo(dl);
    } else if (dm === 'circle' && circleRef.current.center) {
      L.circle(circleRef.current.center, { radius: circleRef.current.radius, color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 0.12, weight: 2 }).addTo(dl);
      L.circleMarker(circleRef.current.center, { radius: 4, color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 1, weight: 1 }).addTo(dl);
    }
  }

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layer.current = L.layerGroup().addTo(map);
    drawLayer.current = L.layerGroup().addTo(map);
    map.on('click', (e: any) => {
      const dm = drawModeRef.current; if (dm === 'off') return;
      if (dm === 'polygon') { polyRef.current.push([e.latlng.lat, e.latlng.lng]); setPolyCount(polyRef.current.length); }
      else if (dm === 'circle') { circleRef.current.center = [e.latlng.lat, e.latlng.lng]; setCircleSet(true); }
      redrawZone();
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    setLoading(true); setErr('');
    const { from, to } = computeRange(preset, customFrom, customTo);
    Api.hotspot(from, to, selImei ? [selImei] : undefined, mode, 5).then((pts: any[]) => {
      const arr = (pts || []).slice(0, 3000); // cap de siguranță pt. modul „poziții" (densitate mare)
      setCount(pts?.length || 0);
      const lg = layer.current, map = mapRef.current;
      if (lg && map) {
        lg.clearLayers();
        const latlngs: any[] = [];
        arr.forEach((p: any) => {
          const lat = p[0], lng = p[1], w = p[2] || 0.3;
          if (lat == null || lng == null) return;
          latlngs.push([lat, lng]);
          const r = mode === 'positions' ? (2 + w * 6) : (5 + w * 14);
          L.circleMarker([lat, lng], { radius: r, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 + w * 0.45, weight: 1 }).addTo(lg);
        });
        if (latlngs.length) { try { map.fitBounds(L.latLngBounds(latlngs).pad(0.2), { animate: false }); } catch { /* */ } }
      }
      setLoading(false);
    }).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare')); setLoading(false); });
  }, [preset, customFrom, customTo, mode, selImei]);

  function setDraw(m: DrawMode) {
    drawModeRef.current = m; setDrawMode(m);
    if (m === 'off') { clearZone(); }
  }
  function clearZone() {
    polyRef.current = []; circleRef.current = { center: null, radius }; setPolyCount(0); setCircleSet(false);
    redrawZone();
  }
  function onRadius(v: number) { setRadius(v); circleRef.current.radius = v; redrawZone(); }

  async function analyzeZone() {
    let zone: any = null;
    if (drawMode === 'polygon' && polyRef.current.length >= 3) zone = { type: 'polygon', coordinates: polyRef.current };
    else if (drawMode === 'circle' && circleRef.current.center) zone = { type: 'circle', center: circleRef.current.center, radius: circleRef.current.radius };
    if (!zone) { showToast('Desenează o zonă (poligon ≥3 puncte sau cerc)', true); return; }
    setAnalyzing(true);
    const { from, to } = computeRange(preset, customFrom, customTo);
    try {
      const res = await Api.zoneReport(zone, from, to, selImei || undefined);
      setZoneResult(res);
    } catch (e: any) { showToast(e?.message || 'Eroare la analiză', true); } finally { setAnalyzing(false); }
  }

  const vlist = (vehicles.value || []);
  const sel = (a: boolean) => `padding:6px 11px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid ${a ? 'var(--accent)' : 'var(--border)'};background:${a ? 'var(--accent)' : 'transparent'};color:${a ? '#06210f' : 'var(--text-muted)'}`;
  const selStyle = 'width:100%;padding:8px 10px;border-radius:8px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);font-family:inherit;font-size:12.5px';

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Hotspot &amp; Rutare</div>
        <div style="width:36px" />
      </header>

      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:6px">
          <button style={sel(mode === 'stops')} onClick={() => setMode('stops')}>Opriri</button>
          <button style={sel(mode === 'positions')} onClick={() => setMode('positions')}>Poziții</button>
          <select value={selImei} onChange={(e: any) => setSelImei(e.target.value)} style={selStyle}>
            <option value="">Toată flota</option>
            {vlist.map((v: any) => <option value={v.imei}>{v.name || v.plate || v.imei}</option>)}
          </select>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button style={sel(preset === 'today')} onClick={() => setPreset('today')}>Azi</button>
          <button style={sel(preset === 'week')} onClick={() => setPreset('week')}>7 zile</button>
          <button style={sel(preset === 'month')} onClick={() => setPreset('month')}>30 zile</button>
          <button style={sel(preset === 'custom')} onClick={() => setPreset('custom')}>Custom</button>
        </div>
        {preset === 'custom' && (
          <div style="display:flex;gap:6px;align-items:center">
            <input type="date" value={customFrom} onInput={(e: any) => setCustomFrom(e.target.value)} style={selStyle} />
            <span style="color:var(--text-muted);font-size:12px">→</span>
            <input type="date" value={customTo} onInput={(e: any) => setCustomTo(e.target.value)} style={selStyle} />
          </div>
        )}
      </div>

      <div class="rt-map" style="height:auto;flex:1;position:relative">
        <div ref={mapEl} />
        {loading && <div class="rt-mapload"><div class="spin" /></div>}
        {/* Panou desenare zonă */}
        <div style="position:absolute;right:10px;top:10px;z-index:500;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          {drawMode === 'off' ? (
            <button style="background:var(--accent);color:#06210f;border:0;border-radius:9px;padding:8px 12px;font-size:12.5px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3)" onClick={() => setDraw('polygon')}><Icon name="map" size={14} /> Desenează zonă</button>
          ) : (
            <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;padding:9px 10px;box-shadow:0 2px 10px rgba(0,0,0,.35);min-width:186px">
              <div style="display:flex;gap:5px;margin-bottom:7px">
                <button style={sel(drawMode === 'polygon')} onClick={() => { setDraw('polygon'); }}>Poligon</button>
                <button style={sel(drawMode === 'circle')} onClick={() => { setDraw('circle'); }}>Cerc</button>
                <button style="margin-left:auto;background:transparent;border:0;color:var(--text-muted);font-size:16px;line-height:1;padding:0 4px" onClick={() => setDraw('off')} aria-label="Închide">×</button>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:7px">
                {drawMode === 'polygon' ? ('Atinge harta: ' + polyCount + ' puncte' + (polyCount < 3 ? ' (min. 3)' : '')) : (circleSet ? ('Rază: ' + (radius >= 1000 ? (radius / 1000).toFixed(1) + ' km' : radius + ' m')) : 'Atinge harta pt. centru')}
              </div>
              {drawMode === 'circle' && circleSet && (
                <input type="range" min="100" max="5000" step="100" value={radius} onInput={(e: any) => onRadius(Number(e.target.value))} style="width:100%;margin-bottom:7px" />
              )}
              <div style="display:flex;gap:6px">
                <button style="flex:1;background:var(--accent);color:#06210f;border:0;border-radius:8px;padding:7px;font-size:12px;font-weight:700" disabled={analyzing} onClick={analyzeZone}>{analyzing ? '…' : 'Analizează'}</button>
                <button style="background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:7px 9px;font-size:12px" onClick={clearZone}>Șterge</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style="padding:9px 14px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--border)">
        {err ? err : (count.toLocaleString('ro-RO') + (mode === 'positions' ? ' poziții' : ' puncte de oprire') + (count > 3000 ? ' (afișez primele 3000)' : '') + ' · cerc mai mare = mai frecvent')}
      </div>

      {/* Rezultat analiză zonă */}
      {zoneResult && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) setZoneResult(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="map" size={18} color="var(--accent)" /> {zoneResult.label || 'Analiză zonă'}</b><button class="h-btn" onClick={() => setZoneResult(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="pf-kpis" style="margin-bottom:10px">
                {Object.keys(zoneResult.summary || {}).map((k: string) => (
                  <div class="pf-kpi"><div class="v" style="font-size:19px">{zoneResult.summary[k]}</div><div class="l">{k}</div></div>
                ))}
              </div>
              {(!zoneResult.rows || zoneResult.rows.length === 0) ? (
                <div class="adm-empty" style="padding:20px">Niciun vehicul nu a intrat în zonă în perioada aleasă.</div>
              ) : (
                <div class="adm-list">
                  {zoneResult.rows.map((r: any[]) => (
                    <div class="adm-item" style="cursor:default">
                      <span class="mid">
                        <div class="nm">{r[0]}</div>
                        <div class="sub">{r[1]} vizite · {r[2]} · {r[3]} → {r[4]}</div>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
