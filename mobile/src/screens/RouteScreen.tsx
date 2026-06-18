import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './route.css';

type Period = 'today' | 'yesterday' | 'week';

function range(p: Period): { from: string; to: string } {
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { from.setDate(from.getDate() - 1); const to = new Date(from); to.setHours(23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }
  if (p === 'week') { from.setDate(from.getDate() - 7); }
  return { from: from.toISOString(), to: now.toISOString() };
}
function haversine(a: any, b: any) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toR, dLon = (b.longitude - a.longitude) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toR) * Math.cos(b.latitude * toR) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function RouteScreen() {
  const loc = useLocation();
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  const [period, setPeriod] = useState<Period>('today');
  const [pts, setPts] = useState<any[] | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    setPts(null);
    const { from, to } = range(period);
    Api.history(imei, from, to).then((r: any) => {
      const points = Array.isArray(r) ? r : (r.points || r.rows || []);
      setPts(points.filter((p: any) => p.latitude != null && p.longitude != null));
    }).catch(() => setPts([]));
  }, [period, imei]);

  useEffect(() => {
    const map = mapRef.current, lg = layer.current; if (!map || !lg || !pts) return;
    try {
      lg.clearLayers();
      if (pts.length < 2) return;
      const latlngs = pts.map((p) => [p.latitude, p.longitude] as [number, number]);
      L.polyline(latlngs, { color: '#3FE07D', weight: 4 }).addTo(lg);
      L.circleMarker(latlngs[0], { radius: 6, color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }).addTo(lg);
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }).addTo(lg);
      map.fitBounds(L.latLngBounds(latlngs).pad(0.15), { animate: false });
    } catch { /* hartă în curs de demontare */ }
  }, [pts]);

  let dist = 0, maxSpeed = 0;
  if (pts) for (let i = 0; i < pts.length; i++) { if (i > 0) { const d = haversine(pts[i - 1], pts[i]); if (d < 10) dist += d; } if ((pts[i].speed || 0) > maxSpeed) maxSpeed = pts[i].speed; }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Traseu</div>
      </header>
      <div class="rt-periods">
        {(['today', 'yesterday', 'week'] as Period[]).map((p) => (
          <button class={'rt-period' + (period === p ? ' on' : '')} onClick={() => setPeriod(p)}>{p === 'today' ? 'Azi' : p === 'yesterday' ? 'Ieri' : '7 zile'}</button>
        ))}
      </div>
      <div class="rt-map"><div ref={mapEl} />{pts === null && <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:500"><div class="spin" /></div>}</div>
      <div class="rt-summary">
        <div class="rt-sum"><div class="v">{pts ? dist.toFixed(1) : '—'}</div><div class="l">km parcurși</div></div>
        <div class="rt-sum"><div class="v">{pts ? Math.round(maxSpeed) : '—'}</div><div class="l">viteză max</div></div>
        <div class="rt-sum"><div class="v">{pts ? pts.length : '—'}</div><div class="l">puncte GPS</div></div>
      </div>
    </div>
  );
}
