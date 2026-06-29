import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { vehicles } from '../app/store';
import { Icon } from '../components/Icon';
import './route.css';

// Hotspot — opririle frecvente ale flotei pe hartă (cerc mai mare = staționare mai lungă). /api/hotspot e scope-uit pe companie (withScope).
type Period = 'week' | 'month';
function range(p: Period) { const now = new Date(); const from = new Date(now); from.setDate(from.getDate() - (p === 'month' ? 30 : 7)); from.setHours(0, 0, 0, 0); return { from: from.toISOString(), to: now.toISOString() }; }

export function Hotspot() {
  const loc = useLocation();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [count, setCount] = useState(0);

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
    setLoading(true); setErr('');
    const { from, to } = range(period);
    const imeis = (vehicles.value || []).map((v: any) => v.imei).filter(Boolean);
    Api.hotspot(from, to, imeis, 'stops', 5).then((pts: any[]) => {
      setCount(pts?.length || 0);
      const lg = layer.current, map = mapRef.current;
      if (lg && map) {
        lg.clearLayers();
        const latlngs: any[] = [];
        (pts || []).forEach((p: any) => {
          const lat = p[0], lng = p[1], w = p[2] || 0.3;
          if (lat == null || lng == null) return;
          latlngs.push([lat, lng]);
          L.circleMarker([lat, lng], { radius: 5 + w * 14, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 + w * 0.45, weight: 1 }).addTo(lg);
        });
        if (latlngs.length) { try { map.fitBounds(L.latLngBounds(latlngs).pad(0.2), { animate: false }); } catch { /* */ } }
      }
      setLoading(false);
    }).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare')); setLoading(false); });
  }, [period]);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Hotspot — opriri frecvente</div>
        <div style="width:36px" />
      </header>
      <div class="rt-periods">
        <button class={'rt-period' + (period === 'week' ? ' on' : '')} onClick={() => setPeriod('week')}>7 zile</button>
        <button class={'rt-period' + (period === 'month' ? ' on' : '')} onClick={() => setPeriod('month')}>30 zile</button>
      </div>
      <div class="rt-map" style="height:auto;flex:1"><div ref={mapEl} />{loading && <div class="rt-mapload"><div class="spin" /></div>}</div>
      <div style="padding:9px 14px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--border)">{err ? err : (count + ' puncte de oprire · cerc mai mare = staționare mai lungă')}</div>
    </div>
  );
}
