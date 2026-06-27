import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
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
function fmtTime(s: string) { try { return new Date(s).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } }
function fmtDur(sec: number) {
  if (!sec || sec < 0) return '0m';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? (h + 'h ' + m + 'm') : (m + 'm');
}
function ptMs(p: any) { return new Date(p.timestamp || p.server_time || p.time || 0).getTime(); }

type LatLng = [number, number];
const GREEN = '#3FE07D', START = '#22c55e', STOP = '#ef4444', DIM = '#9aa3ad';
function dot(latlng: LatLng, fill: string) {
  return L.circleMarker(latlng, { radius: 6, color: '#fff', fillColor: fill, fillOpacity: 1, weight: 2 });
}

export function RouteScreen() {
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  const [period, setPeriod] = useState<Period>('today');
  const [pts, setPts] = useState<any[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  // ── Harta (o singură dată) ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Date: punctele brute (pentru desen) + rutele grupate (din raport) ─────
  useEffect(() => {
    setPts(null); setRoutes(null); setSummary(null); setSel(null);
    const { from, to } = range(period);
    Promise.all([
      Api.history(imei, from, to).then((r: any) => Array.isArray(r) ? r : (r.points || r.rows || [])).catch(() => []),
      Api.report(imei, from, to).catch(() => null),
    ]).then(([points, rep]: any) => {
      setPts((points || []).filter((p: any) => p.latitude != null && p.longitude != null));
      if (rep && Array.isArray(rep.routes)) { setRoutes(rep.routes); setSummary(rep.summary || null); }
      else { setRoutes([]); setSummary(null); }
    });
  }, [period, imei]);

  // Fiecare rută → punctele ei (feliate din istoric după intervalul de timp)
  const slices = useMemo<LatLng[][]>(() => {
    if (!pts || !routes) return [];
    return routes.map((r) => {
      const a = new Date(r.startTime).getTime(), b = new Date(r.endTime).getTime();
      return pts.filter((p) => { const t = ptMs(p); return t >= a && t <= b; }).map((p) => [p.latitude, p.longitude] as LatLng);
    });
  }, [pts, routes]);

  // ── Desen: ruta selectată evidențiată, restul estompate; fără selecție → toate ──
  useEffect(() => {
    const map = mapRef.current, lg = layer.current; if (!map || !lg || pts === null) return;
    try {
      lg.clearLayers();
      const haveRoutes = !!routes && slices.some((s) => s.length > 1);
      if (haveRoutes) {
        let focus: LatLng[] | null = null;
        slices.forEach((s, i) => {
          if (s.length < 2) return;
          const isSel = sel === i, isDim = sel != null && !isSel;
          L.polyline(s, { color: isDim ? DIM : GREEN, weight: isSel ? 5 : (isDim ? 2 : 4), opacity: isDim ? 0.5 : 1 }).addTo(lg);
          if (isSel) focus = s;
        });
        if (sel != null && focus) {
          dot((focus as LatLng[])[0], START).addTo(lg); dot((focus as LatLng[])[(focus as LatLng[]).length - 1], STOP).addTo(lg);
          map.fitBounds(L.latLngBounds(focus).pad(0.15), { animate: false });
        } else {
          const all = slices.flat();
          const firstS = slices.find((s) => s.length); const lastS = [...slices].reverse().find((s) => s.length);
          if (firstS) dot(firstS[0], START).addTo(lg);
          if (lastS) dot(lastS[lastS.length - 1], STOP).addTo(lg);
          if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15), { animate: false });
        }
      } else if (pts.length >= 2) {
        // Fallback: nicio rută detectată → o singură linie din toate punctele
        const ll = pts.map((p) => [p.latitude, p.longitude] as LatLng);
        L.polyline(ll, { color: GREEN, weight: 4 }).addTo(lg);
        dot(ll[0], START).addTo(lg); dot(ll[ll.length - 1], STOP).addTo(lg);
        map.fitBounds(L.latLngBounds(ll).pad(0.15), { animate: false });
      }
    } catch { /* hartă în curs de demontare */ }
  }, [pts, routes, slices, sel]);

  const loading = pts === null || routes === null;
  const nRoutes = routes ? routes.length : 0;
  const km = summary && summary.totalKm != null ? Number(summary.totalKm) : (routes || []).reduce((a, r) => a + (r.distance || 0), 0);
  const maxSp = summary && summary.maxSpeed != null ? Number(summary.maxSpeed) : (routes || []).reduce((a, r) => Math.max(a, r.maxSpeed || 0), 0);

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
      <div class="rt-map"><div ref={mapEl} />{loading && <div class="rt-mapload"><div class="spin" /></div>}</div>

      <div class="rt-summary">
        <div class="rt-sum"><div class="v">{loading ? '—' : km.toFixed(1)}</div><div class="l">km parcurși</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : nRoutes}</div><div class="l">rute</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : Math.round(maxSp)}</div><div class="l">km/h max</div></div>
      </div>

      <div class="rt-list">
        {loading ? (
          <div class="rt-empty"><div class="spin" /></div>
        ) : nRoutes === 0 ? (
          <div class="rt-empty">Nicio rută în perioada selectată.</div>
        ) : (
          <>
            <div class="rt-listhead">
              <span>{nRoutes} {nRoutes === 1 ? 'rută' : 'rute'} · apasă o rută pentru a o vedea pe hartă</span>
              {sel != null && <button class="rt-allbtn" onClick={() => setSel(null)}><Icon name="layers" size={14} /> Toate</button>}
            </div>
            {routes!.map((r, i) => (
              <button class={'rt-card' + (sel === i ? ' on' : '')} onClick={() => setSel(sel === i ? null : i)}>
                <div class="rt-card-top">
                  <span class="rt-card-time"><span class="rt-rdot" /> {fmtTime(r.startTime)} <span class="arr">→</span> {fmtTime(r.endTime)}</span>
                  <span class="rt-card-km">{(r.distance || 0).toFixed(1)} km</span>
                </div>
                <div class="rt-card-meta">
                  <span><Icon name="clock" size={12} /> {fmtDur(r.duration)}</span>
                  <span><Icon name="gauge" size={12} /> {r.avgSpeed || 0} km/h</span>
                  <span class={(r.maxSpeed || 0) > 120 ? 'hot' : ''}><Icon name="alert" size={12} /> {r.maxSpeed || 0} km/h</span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
