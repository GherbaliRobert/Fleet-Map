import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { refreshUnread } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './route.css';

// Detaliu eveniment: harta segmentului de drum + poziția + adresa unde s-a întâmplat notificarea.
const SEV: Record<string, string> = { info: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };

export function NotifDetail() {
  const loc = useLocation();
  const { params } = useRoute();
  const id = (params as any).id;
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [rl, setRl] = useState<number | null | undefined>(undefined); // undefined=se verifică, null=necunoscută
  const [rlEst, setRlEst] = useState(false);
  const [acked, setAcked] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawRedRef = useRef<((thr: number) => void) | null>(null); // recolorează porțiunea roșie (unde s-a depășit) când sosește limita OSM

  useEffect(() => {
    Api.notifContext(id).then((x: any) => { if (x && x.error) setErr(x.error); else { setD(x); setAcked(!!x.acknowledged); } }).catch((e: any) => setErr(e?.message || 'Eroare la încărcare'));
  }, [id]);

  async function markRead() {
    setAckBusy(true);
    try { await Api.ackNotification(Number(id)); setAcked(true); refreshUnread(); } catch { /* */ } finally { setAckBusy(false); }
  }

  // Limita legală a drumului (OSM) — DOAR la alerte de viteză (nu la idle etc.). Async; punct dublat (endpoint cere ≥2).
  const isSpeeding = !!d && /overspeed|speeding|vitez/i.test((d.type || '') + ' ' + (d.title || ''));
  useEffect(() => {
    if (!d || !d.event || !isSpeeding) return;
    Api.roadLimits([[d.event.lat, d.event.lng], [d.event.lat, d.event.lng]]).then((x: any) => {
      setRl(x && x.limits && x.limits[0] != null ? x.limits[0] : null);
      setRlEst(!!(x && x.estimated && x.estimated[0]));
    }).catch(() => setRl(null));
  }, [d]);

  useEffect(() => {
    if (!d || !d.event || !mapEl.current) return;
    try {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const m = L.map(mapEl.current, { attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      const segPts: any[] = (d.segment || []).filter((p: any) => p.lat != null);
      const seg: [number, number][] = segPts.map((p: any) => [p.lat, p.lng]);
      if (seg.length > 1) L.polyline(seg, { color: '#64748b', weight: 4, opacity: 0.5 }).addTo(m); // traseul din jur (±12 min), discret
      const ev: [number, number] = [d.event.lat, d.event.lng];

      // Stratul ROȘU: exact segmentele unde viteza a depășit pragul (limita drumului). Focus pe ele.
      const redLayer = L.layerGroup().addTo(m);
      const drawRed = (thr: number) => {
        redLayer.clearLayers();
        const rb = L.latLngBounds([]);
        if (!(thr > 0) || segPts.length < 2) return rb;
        let cur: [number, number][] | null = null;
        for (let i = 0; i < segPts.length; i++) {
          if ((segPts[i].speed || 0) > thr) {
            if (!cur) { cur = []; if (i > 0) cur.push([segPts[i - 1].lat, segPts[i - 1].lng]); }
            cur.push([segPts[i].lat, segPts[i].lng]); rb.extend([segPts[i].lat, segPts[i].lng]);
          } else if (cur) { if (cur.length > 1) L.polyline(cur, { color: '#ef4444', weight: 7, opacity: 0.95 }).addTo(redLayer); cur = null; }
        }
        if (cur && cur.length > 1) L.polyline(cur, { color: '#ef4444', weight: 7, opacity: 0.95 }).addTo(redLayer);
        return rb;
      };
      drawRedRef.current = (thr: number) => { const rb = drawRed(thr); try { if (rb.isValid()) m.fitBounds(rb.pad(0.5), { maxZoom: 16 }); } catch { /* */ } };
      const thr0 = (d.data && d.data.limit > 55) ? d.data.limit : Math.max(50, Math.round(((d.maxSpeed || (d.event && d.event.speed) || 70) as number) * 0.7));
      const rb0 = drawRed(thr0);

      L.circleMarker(ev, { radius: 9, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(m);
      if (rb0.isValid()) { try { m.fitBounds(rb0.pad(0.5), { maxZoom: 16 }); } catch { /* */ } }
      else if (seg.length > 1) m.fitBounds(L.latLngBounds(seg).pad(0.25)); else m.setView(ev, 16);
      setTimeout(() => { try { m.invalidateSize(); } catch { /* */ } }, 160);
      mapRef.current = m;
    } catch { /* */ }
    return () => { try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } drawRedRef.current = null; } catch { /* */ } };
  }, [d]);

  // Rafinează porțiunea roșie cu limita REALĂ a drumului (OSM), când sosește.
  useEffect(() => {
    if (typeof rl === 'number' && rl > 0 && drawRedRef.current) drawRedRef.current(rl);
  }, [rl]);

  const sevC = d ? (SEV[d.severity] || '#3b82f6') : '#3b82f6';
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => { try { history.back(); } catch { loc.route('/notifications'); } }} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Detaliu eveniment</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
              <span style={'width:11px;height:11px;border-radius:50%;flex-shrink:0;background:' + sevC} />
              <div style="font-size:16px;font-weight:700">{d.title || d.type}</div>
            </div>
            {d.body && <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">{d.body}</div>}
            {d.event
              ? <div ref={mapEl} style="height:280px;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:var(--bg-dark);margin-bottom:12px" />
              : <div class="adm-empty" style="padding:24px">Fără poziție GPS pentru acest eveniment.</div>}
            <div class="pf-card">
              <div class="adm-kv"><span class="k">Vehicul</span><span>{d.vehicle || d.imei || '—'}</span></div>
              <div class="adm-kv"><span class="k">Când</span><span>{new Date(d.at).toLocaleString('ro-RO')}</span></div>
              {d.event && d.event.speed != null ? <div class="adm-kv"><span class="k">Viteză în acel moment</span><span style={d.event.speed >= (d.maxSpeed || 999) ? 'color:var(--red);font-weight:700' : ''}>{d.event.speed} km/h</span></div> : null}
              {d.maxSpeed ? <div class="adm-kv"><span class="k">Viteză maximă pe segment</span><span>{d.maxSpeed} km/h</span></div> : null}
              {d.event && d.event.address ? <div class="adm-kv"><span class="k">Locație</span><span style="text-align:right;max-width:60%">{d.event.address}</span></div> : null}
              {d.event && isSpeeding ? <div class="adm-kv"><span class="k">Limită drum (OSM)</span><span style={(rl != null && d.event.speed && d.event.speed > rl) ? 'color:var(--red);font-weight:700' : ''}>{rl === undefined ? 'se verifică…' : rl == null ? 'necunoscută' : (rl + ' km/h' + (rlEst ? ' (est.)' : '') + (d.event.speed && d.event.speed > rl ? ' · +' + (d.event.speed - rl) : ''))}</span></div> : null}
            </div>
            {acked
              ? <div style="margin-top:12px;text-align:center;color:var(--accent);font-weight:600"><Icon name="check" size={15} /> Marcat ca citit</div>
              : <button class="btn btn-primary" style="margin-top:12px" disabled={ackBusy} onClick={markRead}>{ackBusy ? 'Se marchează…' : 'Marchează citit'}</button>}
            {d.event ? <a class="btn" style="margin-top:10px;display:block;text-align:center;text-decoration:none;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" href={'https://www.google.com/maps?q=' + d.event.lat + ',' + d.event.lng} target="_blank" rel="noopener">Deschide în Google Maps</a> : null}
          </>
        )}
      </div>
    </div>
  );
}
