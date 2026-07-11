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
  const maxHaloRef = useRef<any>(null); // halo-ul punctului MAX (re-colorat de OSM dacă s-a depășit limita reală)

  useEffect(() => {
    Api.notifContext(id).then((x: any) => {
      if (x && x.error) { setErr(x.error); return; }
      // Notificare de raport → nu are eveniment GPS; deschid direct ecranul Rapoarte (+ raportul din Istoric).
      if (x && (x.type === 'report_ready' || x.type === 'report_error')) {
        const hid = x.data && x.data.historyId != null ? x.data.historyId : '';
        loc.route('/reports' + (hid !== '' ? ('?histId=' + hid) : ''));
        return;
      }
      setD(x); setAcked(!!x.acknowledged);
    }).catch((e: any) => setErr(e?.message || 'Eroare la încărcare'));
  }, [id]);

  async function markRead() {
    setAckBusy(true);
    try { await Api.ackNotification(Number(id)); setAcked(true); refreshUnread(); } catch { /* */ } finally { setAckBusy(false); }
  }

  // Reset stare OSM la schimbarea notificării (preact-iso refolosește instanța pe /notif/:id → altfel rămâne limita veche).
  useEffect(() => { setRl(undefined); setRlEst(false); }, [id]);

  // Ralanti: hartă + câmpuri diferite (loc + interval staționare, nu panglică de viteză). Discriminator = alertType.
  const isIdle = !!d && (!!(d.data && d.data.alertType === 'idle_engine') || /ralanti|idle/i.test((d.title || '') + ' ' + (d.body || '')));
  // Limita legală a drumului (OSM) — DOAR la alerte de viteză (nu la idle etc.). Async; punct dublat (endpoint cere ≥2).
  const isSpeeding = !!d && !isIdle && /overspeed|speeding|vitez/i.test((d.type || '') + ' ' + (d.title || ''));
  useEffect(() => {
    if (!d || !d.event || !isSpeeding) return;
    Api.roadLimits([[d.event.lat, d.event.lng], [d.event.lat, d.event.lng]]).then((x: any) => {
      setRl(x && x.limits && x.limits[0] != null ? x.limits[0] : null);
      setRlEst(!!(x && x.estimated && x.estimated[0]));
    }).catch(() => setRl(null));
  }, [d]);

  useEffect(() => {
    if (!d || !d.event || !mapEl.current) return;
    const sevC = SEV[d.severity] || '#3b82f6';
    // Culoare ABSOLUTĂ pe viteză (verde=lent → roșu=rapid). Nu depinde de limită → colorat o singură dată, fără flicker.
    const speedColor = (v: number) => { const s = Number(v) || 0; if (s < 30) return '#22C55E'; if (s < 55) return '#A3E635'; if (s < 80) return '#FACC15'; if (s < 110) return '#F59E0B'; return '#EF4444'; };
    const cleanup = () => { try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } maxHaloRef.current = null; } catch { /* */ } };
    try {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const m = L.map(mapEl.current, { attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      const segPts: any[] = (d.segment || []).filter((p: any) => p.lat != null);
      const seg: [number, number][] = segPts.map((p: any) => [p.lat, p.lng]);
      const ev: [number, number] = [d.event.lat, d.event.lng];

      // Ralanti: DOAR locul staționării (marker + rază ~60m) — fără panglică de viteză / MAX / legendă (irelevante când stă pe loc).
      if (isIdle) {
        L.circle(ev, { radius: 60, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.12 }).addTo(m);
        L.circleMarker(ev, { radius: 8, color: '#fff', weight: 2, fillColor: sevC, fillOpacity: 1 }).addTo(m);
        m.setView(ev, 16);
        setTimeout(() => { try { m.invalidateSize(); m.setView(ev, 16); } catch { /* */ } }, 160);
        mapRef.current = m;
        return cleanup;
      }

      if (seg.length > 1) L.polyline(seg, { color: '#64748b', weight: 4, opacity: 0.45 }).addTo(m); // context ±12 min, discret

      // Panglica colorată pe viteză — segmente coalescente (una per culoare), sincron.
      const spdLayer = L.layerGroup().addTo(m);
      if (segPts.length >= 2) {
        let runPts: [number, number][] = [[segPts[0].lat, segPts[0].lng]]; let runCol = speedColor(segPts[0].speed);
        for (let i = 1; i < segPts.length; i++) {
          const col = speedColor(Math.max(segPts[i - 1].speed || 0, segPts[i].speed || 0));
          if (col !== runCol) { if (runPts.length > 1) L.polyline(runPts, { color: runCol, weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(spdLayer); runPts = [[segPts[i - 1].lat, segPts[i - 1].lng]]; runCol = col; }
          runPts.push([segPts[i].lat, segPts[i].lng]);
        }
        if (runPts.length > 1) L.polyline(runPts, { color: runCol, weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(spdLayer);
      }

      // Punctul cu viteza MAXIMĂ de pe segment
      let maxI = -1, maxV = -1;
      for (let j = 0; j < segPts.length; j++) { if ((segPts[j].speed || 0) > maxV) { maxV = segPts[j].speed || 0; maxI = j; } }
      let evIsMax = false;
      if (maxI >= 0) {
        const mp: [number, number] = [segPts[maxI].lat, segPts[maxI].lng];
        maxHaloRef.current = L.circleMarker(mp, { radius: 13, color: speedColor(maxV), weight: 2, fill: false, opacity: 0.6 }).addTo(m);
        L.circleMarker(mp, { radius: 8, color: '#fff', weight: 3, fillColor: speedColor(maxV), fillOpacity: 1 }).addTo(m);
        L.marker(mp, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<span class="spd-max-lbl" style="background:' + speedColor(maxV) + '">MAX ' + Math.round(maxV) + ' km/h</span>' }) }).addTo(m);
        evIsMax = Math.abs(segPts[maxI].lat - d.event.lat) < 1e-5 && Math.abs(segPts[maxI].lng - d.event.lng) < 1e-5;
      }

      // Markerul evenimentului (unde s-a declanșat alerta) — culoarea severității
      if (!evIsMax) L.circleMarker(ev, { radius: 8, color: '#fff', weight: 2, fillColor: sevC, fillOpacity: 1 }).addTo(m);

      // Etichete km/h la vârfurile locale (rare, fără suprapunere) — recalculate după dimensionarea hărții
      const labelLayer = L.layerGroup().addTo(m);
      const relabelPeaks = () => {
        labelLayer.clearLayers();
        if (segPts.length < 3) return;
        const floor = Math.max(30, 0.6 * ((d.maxSpeed || maxV || 0) as number));
        const cand: { i: number; s: number }[] = [];
        for (let k = 1; k < segPts.length - 1; k++) { if (k === maxI) continue; const s = segPts[k].speed || 0; if (s >= (segPts[k - 1].speed || 0) && s > (segPts[k + 1].speed || 0) && s >= floor) cand.push({ i: k, s }); }
        cand.sort((a, b) => b.s - a.s);
        const kept: any[] = [];
        try { if (maxI >= 0) kept.push(m.latLngToLayerPoint(L.latLng(segPts[maxI].lat, segPts[maxI].lng))); } catch { /* */ }
        try { kept.push(m.latLngToLayerPoint(L.latLng(d.event.lat, d.event.lng))); } catch { /* */ }
        let budget = 3;
        for (let c = 0; c < cand.length && budget > 0; c++) {
          const pp = segPts[cand[c].i]; let pt: any; try { pt = m.latLngToLayerPoint(L.latLng(pp.lat, pp.lng)); } catch { continue; }
          let ok = true; for (const kp of kept) { if (pt.distanceTo(kp) < 40) { ok = false; break; } }
          if (!ok) continue; kept.push(pt); budget--;
          L.circleMarker([pp.lat, pp.lng], { radius: 3, color: '#fff', weight: 1, fillColor: speedColor(pp.speed), fillOpacity: 1 }).addTo(labelLayer);
          L.marker([pp.lat, pp.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<span class="spd-lbl" style="border-color:' + speedColor(pp.speed) + '">' + Math.round(pp.speed) + '</span>' }) }).addTo(labelLayer);
        }
      };

      // Legendă compactă (verde→roșu) — div în containerul hărții (evită typing-ul L.Control)
      try {
        const oldLg = mapEl.current!.querySelector('.notif-spd-legend'); if (oldLg) oldLg.remove();
        const lgEl = document.createElement('div');
        lgEl.className = 'notif-spd-legend';
        lgEl.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:600';
        lgEl.innerHTML = '<span>0</span><i></i><span>110+</span>';
        mapEl.current!.appendChild(lgEl);
      } catch { /* */ }

      if (seg.length > 1) m.fitBounds(L.latLngBounds(seg).pad(0.18), { maxZoom: 16 }); else m.setView(ev, 16);
      m.on('zoomend', relabelPeaks); // re-culege etichetele la pinch-zoom (paritate cu web)
      setTimeout(() => { try { m.invalidateSize(); if (seg.length > 1) m.fitBounds(L.latLngBounds(seg).pad(0.18), { maxZoom: 16 }); relabelPeaks(); } catch { /* */ } }, 160);
      mapRef.current = m;
    } catch { /* */ }
    return cleanup;
  }, [d]);

  // OSM: doar re-colorează halo-ul MAX dacă viteza a depășit limita reală (fără recolorare/re-zoom pe panglică).
  useEffect(() => {
    if (typeof rl === 'number' && rl > 0 && d && d.event && Math.max(d.maxSpeed || 0, d.event.speed || 0) > rl && maxHaloRef.current) {
      try { maxHaloRef.current.setStyle({ color: '#ef4444', opacity: 0.9 }); } catch { /* */ }
    }
  }, [rl]);

  const sevC = d ? (SEV[d.severity] || '#3b82f6') : '#3b82f6';
  // Depășirea față de limita OSM se raportează la viteza MAXIMĂ pe segment (nu la viteza din momentul alertei).
  const osmRef = d && d.event ? Math.max(d.maxSpeed || 0, d.event.speed || 0) : 0;
  // HH:MM (cu data în față dacă nu e azi) — pt. intervalul de staționare
  const hhmm = (iso: string) => {
    const dt = new Date(iso);
    const t = dt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    return dt.toDateString() === new Date().toDateString() ? t : (dt.toLocaleDateString('ro-RO') + ' ' + t);
  };
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
              {isIdle && d.idle ? <div class="adm-kv"><span class="k">Staționare de la</span><span>{hhmm(d.idle.start)}</span></div> : null}
              {isIdle && d.idle ? (
                <div class="adm-kv"><span class="k">Până la</span><span style={d.idle.ongoing ? 'color:#f59e0b;font-weight:700' : ''}>
                  {d.idle.end ? hhmm(d.idle.end) + ' · ' + d.idle.minutes + ' min'
                    : d.idle.ongoing ? 'acum — încă în staționare (motor pornit)'
                    : 'necunoscut (cel puțin ' + (d.idle.minutes || '?') + ' min)'}
                </span></div>
              ) : null}
              {!isIdle && d.event && d.event.speed != null ? <div class="adm-kv"><span class="k">Viteză în acel moment</span><span style={d.event.speed >= (d.maxSpeed || 999) ? 'color:var(--red);font-weight:700' : ''}>{d.event.speed} km/h</span></div> : null}
              {!isIdle && d.maxSpeed ? <div class="adm-kv"><span class="k">Viteză maximă pe segment</span><span>{d.maxSpeed} km/h</span></div> : null}
              {d.event && d.event.address ? <div class="adm-kv"><span class="k">Locație</span><span style="text-align:right;max-width:60%">{d.event.address}</span></div> : null}
              {d.event && isSpeeding ? <div class="adm-kv"><span class="k">Limită drum (OSM)</span><span style={(rl != null && osmRef > rl) ? 'color:var(--red);font-weight:700' : ''}>{rl === undefined ? 'se verifică…' : rl == null ? 'necunoscută' : (rl + ' km/h' + (rlEst ? ' (est.)' : '') + (osmRef > rl ? ' · +' + (osmRef - rl) : ''))}</span></div> : null}
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
