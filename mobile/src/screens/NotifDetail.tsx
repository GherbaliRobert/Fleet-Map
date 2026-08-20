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
  const isIdle = !!d && (!!(d.data && d.data.alertType === 'idle_engine') || /ralanti|idl/i.test((d.title || '') + ' ' + (d.body || ''))); // „idl" prinde și „idle" și „Idling" (titlurile RA Watch vechi)
  // Scădere/furt combustibil → loc + de la/la + cantitate (nu panglică de viteză). Discriminator = alertType sau textul.
  const isFuel = !!d && !isIdle && (!!(d.data && (d.data.alertType === 'fuel_theft' || d.data.alertType === 'fuel_drop')) || /scădere\s*(?:combustibil\s*)?[\d.,]+\s*l\b|furt combustibil/i.test((d.title || '') + ' ' + (d.body || '')));
  // Limita legală a drumului (OSM) — DOAR la alerte de viteză (nu la idle/combustibil etc.). Async; punct dublat (endpoint cere ≥2).
  const isSpeeding = !!d && !isIdle && !isFuel && /overspeed|speeding|vitez/i.test((d.type || '') + ' ' + (d.title || ''));
  // Zona: serverul trimite geometria → o desenăm și încadrăm harta pe EA plus punctul de trecere.
  const isZona = !!d && (!!d.geofence || /geofence/i.test((d.data && d.data.alertType) || '') || /zon[ăa]/i.test(d.title || ''));
  // Tensiune scăzută: contează LOCUL unde stă mașina și valoarea, nu segmentul parcurs.
  const isTens = !!d && !isIdle && !isFuel && (/low_voltage/i.test((d.data && d.data.alertType) || '') || /tensiune/i.test(d.title || ''));
  // Scadențe: n-au poziție. Caseta „Fără poziție GPS" arăta a defecțiune pe o notificare care,
  // de fapt, e completă — n-are ce căuta pe hartă.
  const isScadenta = !!d && (/document_expiry|maintenance_due/i.test(d.type || '') || (!d.event && /expir|scaden/i.test((d.title || '') + ' ' + (d.body || ''))));
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
        L.circle(ev, { radius: 45, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.12 }).addTo(m);
        L.circleMarker(ev, { radius: 8, color: '#fff', weight: 2, fillColor: sevC, fillOpacity: 1 }).addTo(m);
        m.setView(ev, 17); // zoom mare — să se vadă EXACT locul staționării
        setTimeout(() => { try { m.invalidateSize(); m.setView(ev, 17); } catch { /* */ } }, 160);
        mapRef.current = m;
        return cleanup;
      }

      // Scădere/furt combustibil: DOAR locul scăderii (marker + rază) — fără panglică de viteză (irelevantă pentru furt/scurgere).
      if (isFuel) {
        L.circle(ev, { radius: 45, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.12 }).addTo(m);
        L.circleMarker(ev, { radius: 8, color: '#fff', weight: 2, fillColor: sevC, fillOpacity: 1 }).addTo(m);
        m.setView(ev, 16);
        setTimeout(() => { try { m.invalidateSize(); m.setView(ev, 16); } catch { /* */ } }, 160);
        mapRef.current = m;
        return cleanup;
      }

      // ZONA: forma reală + încadrare pe ea și pe punctul de trecere — se vede dintr-o privire UNDE
      // e zona și PE UNDE a intrat sau a ieșit. Formatul e PERECHEA [lat, lng] în toată aplicația
      // (editorul web, editorul din APK și motorul de alerte); acceptăm și {lat,lng} din prudență.
      if (isZona && d.geofence && d.geofence.coordinates) {
        const g = d.geofence, cul = g.color || '#3b82f6';
        const pct = (pp: any): [number, number] => (Array.isArray(pp) ? [Number(pp[0]), Number(pp[1])] : [Number(pp.lat), Number(pp.lng)]);
        let forma: any = null;
        try {
          if (g.type === 'circle' && g.coordinates.center) {
            forma = L.circle(pct(g.coordinates.center), { radius: Number(g.coordinates.radius) || 200, color: cul, weight: 2, fillColor: cul, fillOpacity: 0.1 }).addTo(m);
          } else if (Array.isArray(g.coordinates.line)) {
            const lin = g.coordinates.line.map(pct);
            forma = L.polyline(lin, { color: cul, weight: Math.max(6, Math.min(30, (Number(g.coordinates.width) || 100) / 12)), opacity: 0.35 }).addTo(m);
            L.polyline(lin, { color: cul, weight: 2, opacity: 0.9 }).addTo(m);
          } else if (Array.isArray(g.coordinates)) {
            forma = L.polygon(g.coordinates.map(pct), { color: cul, weight: 2, fillColor: cul, fillOpacity: 0.1 }).addTo(m);
          }
        } catch { forma = null; }
        if (seg.length > 1) L.polyline(seg, { color: '#64748b', weight: 3, opacity: 0.5 }).addTo(m); // din ce direcție a venit
        const intra = /intrare|enter/i.test((d.title || '') + ' ' + ((d.data && d.data.event) || ''));
        L.circleMarker(ev, { radius: 9, color: '#fff', weight: 3, fillColor: intra ? '#22C55E' : '#EF4444', fillOpacity: 1 }).addTo(m);
        setTimeout(() => {
          try {
            m.invalidateSize();
            if (forma && forma.getBounds && forma.getBounds().isValid()) m.fitBounds(forma.getBounds().extend(L.latLng(ev[0], ev[1])), { padding: [26, 26], maxZoom: 17 });
            else m.setView(ev, 16);
          } catch { try { m.setView(ev, 16); } catch { /* */ } }
        }, 160);
        mapRef.current = m;
        return cleanup;
      }

      // TENSIUNE SCĂZUTĂ: locul unde stă mașina, la zoom mare. Panglica de viteză și punctul MAX
      // n-au nicio legătură cu o baterie care se descarcă.
      if (isTens) {
        L.circle(ev, { radius: 40, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.12 }).addTo(m);
        L.circleMarker(ev, { radius: 8, color: '#fff', weight: 2, fillColor: sevC, fillOpacity: 1 }).addTo(m);
        m.setView(ev, 17);
        setTimeout(() => { try { m.invalidateSize(); m.setView(ev, 17); } catch { /* */ } }, 160);
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
  // Scadente: zilele se recalculeaza pe server LA ZI (o notificare de acum doua saptamani spunea
  // „mai ai 30 de zile" cand mai erau 16).
  const dLoc = (x: string) => { try { return new Date(x).toLocaleDateString('ro-RO'); } catch { return String(x || '—'); } };
  const zileTxt = (z: number) => (z < 0 ? 'EXPIRAT de ' + (-z) + (z === -1 ? ' zi' : ' zile') : z === 0 ? 'EXPIRĂ ASTĂZI' : 'mai ' + (z === 1 ? 'este 1 zi' : 'sunt ' + z + ' zile'));
  const zileCol = (z: number | null | undefined) => (z == null ? 'var(--text-muted)' : z <= 3 ? 'var(--red)' : z <= 14 ? '#f59e0b' : 'var(--accent)');
  const scad: any = d ? (d.document || d.driverDoc || null) : null;
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
      <div class="content has-tabbar" style="padding:0 16px 96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            <div style="display:flex;align-items:center;gap:9px;margin:10px 0 8px">
              <span style={'width:11px;height:11px;border-radius:50%;flex-shrink:0;background:' + sevC} />
              <div style="font-size:16px;font-weight:700;line-height:1.3">{d.title || d.type}</div>
            </div>
            {d.body && !isIdle && !(isFuel && d.fuel) && <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">{d.body}</div>}
            {d.event
              ? <div ref={mapEl} style="height:280px;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:var(--bg-dark);margin-bottom:12px" />
              : isScadenta ? null
              : <div class="adm-empty" style="padding:24px">Fără poziție GPS pentru acest eveniment.</div>}
            {scad && scad.days != null && (
              <div style={'text-align:center;padding:14px 12px;border-radius:14px;margin-bottom:12px;border:1px solid ' + zileCol(scad.days) + '55;background:' + zileCol(scad.days) + '14'}>
                <div style={'font-size:19px;font-weight:800;color:' + zileCol(scad.days)}>{zileTxt(scad.days)}</div>
                {scad.expiryDate && <div style="font-size:12px;color:var(--text-muted);margin-top:3px">până la {dLoc(scad.expiryDate)}</div>}
              </div>
            )}
            {d.documentsFaraData && d.documentsFaraData.length > 0 && (
              <div style="border:1px solid #f59e0b55;background:#f59e0b14;border-radius:14px;padding:12px;margin-bottom:12px">
                <div style="font-weight:700;color:#f59e0b;margin-bottom:6px;font-size:12.5px">Acte fără dată de expirare — nu ești alertat pentru ele</div>
                {d.documentsFaraData.map((x: any) => (
                  <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:5px 0;border-top:1px solid var(--border);font-size:12.5px">
                    <span><b>{String(x.docType || 'act').toUpperCase()}</b>{x.number ? ' · ' + x.number : ''}{x.vehicle ? <span style="color:var(--text-muted)"> — {x.vehicle}</span> : null}</span>
                    {x.imei ? <button class="btn" style="padding:4px 9px;font-size:11px" onClick={() => loc.route('/vehicles/' + encodeURIComponent(x.imei) + '?edit=docs')}>Completează</button> : null}
                  </div>
                ))}
              </div>
            )}
            <div class="pf-card">
              <div class="adm-kv"><span class="k">Vehicul</span><span>{d.vehicle || d.imei || '—'}</span></div>
              <div class="adm-kv"><span class="k">Când</span><span>{new Date(d.at).toLocaleString('ro-RO')}</span></div>
              {isIdle && d.idle ? <div class="adm-kv"><span class="k">Staționare de la</span><span style="font-weight:700">{hhmm(d.idle.start)}</span></div> : null}
              {isIdle && d.idle ? (
                <div class="adm-kv"><span class="k">Până la</span><span style={d.idle.ongoing ? 'color:#f59e0b;font-weight:700' : 'font-weight:700'}>
                  {d.idle.end ? hhmm(d.idle.end)
                    : d.idle.ongoing ? 'acum — încă staționează'
                    : 'necunoscut'}
                </span></div>
              ) : null}
              {isIdle && d.idle && d.idle.minutes ? (
                <div class="adm-kv"><span class="k">Durată cu motor pornit</span><span style="color:#f59e0b;font-weight:800">{d.idle.minutes >= 60 ? Math.floor(d.idle.minutes / 60) + 'h ' + (d.idle.minutes % 60) + 'm' : d.idle.minutes + ' min'}{!d.idle.end && !d.idle.ongoing ? ' (cel puțin)' : d.idle.ongoing ? ' (în curs)' : ''}</span></div>
              ) : null}
              {isIdle && d.idle && d.idle.fuelL != null ? (
                <div class="adm-kv"><span class="k">Carburant irosit pe staționare</span><span style="font-weight:700">{(d.idle.fuelEstimated ? '~' : '') + String(d.idle.fuelL).replace('.', ',') + ' L' + (d.idle.fuelEstimated ? ' (estimat)' : ' (senzor)')}</span></div>
              ) : null}
              {isFuel && d.fuel && d.fuel.fromL != null && d.fuel.toL != null ? (
                <div class="adm-kv"><span class="k">Nivel combustibil</span><span style="font-weight:700">{String(d.fuel.fromL).replace('.', ',')} L → {String(d.fuel.toL).replace('.', ',')} L</span></div>
              ) : null}
              {isFuel && d.fuel && d.fuel.drop != null ? (
                <div class="adm-kv"><span class="k">Cantitate scăzută</span><span style="color:var(--red);font-weight:800">−{String(d.fuel.drop).replace('.', ',')} L{d.fuel.mode ? (d.fuel.mode === 'parked' ? ' (cât a stat oprit)' : ' (în mers)') : ''}</span></div>
              ) : null}
              {!isIdle && !isFuel && !isScadenta && d.event && d.event.speed != null ? <div class="adm-kv"><span class="k">Viteză în acel moment</span><span style={d.event.speed >= (d.maxSpeed || 999) ? 'color:var(--red);font-weight:700' : ''}>{d.event.speed} km/h</span></div> : null}
              {!isIdle && !isFuel && !isScadenta && d.maxSpeed ? <div class="adm-kv"><span class="k">Viteză maximă pe segment</span><span>{d.maxSpeed} km/h</span></div> : null}
              {isTens && d.voltage != null ? <div class="adm-kv"><span class="k">Tensiune măsurată</span><span style="color:#f59e0b;font-weight:800">{String(d.voltage).replace('.', ',')} V</span></div> : null}
              {isZona && d.geofence ? <div class="adm-kv"><span class="k">Zona</span><span style="font-weight:700">{d.geofence.name || ('#' + d.geofence.id)}</span></div> : null}
              {d.document ? <div class="adm-kv"><span class="k">Act</span><span style="font-weight:700">{String(d.document.docType || 'Document').toUpperCase()}{d.document.number ? ' · ' + d.document.number : ''}</span></div> : null}
              {d.document && d.document.issuer ? <div class="adm-kv"><span class="k">Emis de</span><span style="text-align:right;max-width:60%">{d.document.issuer}</span></div> : null}
              {d.document && d.document.issueDate ? <div class="adm-kv"><span class="k">Data emiterii</span><span>{dLoc(d.document.issueDate)}</span></div> : null}
              {d.document ? <div class="adm-kv"><span class="k">Expiră la</span><span style={'font-weight:700;color:' + (d.document.expiryDate ? zileCol(d.document.days) : 'var(--red)')}>{d.document.expiryDate ? dLoc(d.document.expiryDate) : 'fără dată — nu ești alertat'}</span></div> : null}
              {d.document && d.document.cost != null ? <div class="adm-kv"><span class="k">Cost</span><span>{Number(d.document.cost).toFixed(2).replace('.', ',')} lei</span></div> : null}
              {d.driverDoc ? <div class="adm-kv"><span class="k">Șofer</span><span style="font-weight:700">{d.driverDoc.name || '—'}</span></div> : null}
              {d.driverDoc && d.driverDoc.number ? <div class="adm-kv"><span class="k">Permis nr.</span><span>{d.driverDoc.number}</span></div> : null}
              {d.driverDoc && d.driverDoc.phone ? <div class="adm-kv"><span class="k">Telefon</span><a href={'tel:' + d.driverDoc.phone} style="color:var(--accent)">{d.driverDoc.phone}</a></div> : null}
              {d.driverDoc ? <div class="adm-kv"><span class="k">Expiră la</span><span style={'font-weight:700;color:' + zileCol(d.driverDoc.days)}>{d.driverDoc.expiryDate ? dLoc(d.driverDoc.expiryDate) : '—'}</span></div> : null}
              {d.event && !isScadenta && d.event.address ? <div class="adm-kv"><span class="k">Locație</span><span style="text-align:right;max-width:60%">{d.event.address}</span></div> : null}
              {d.event && isSpeeding ? <div class="adm-kv"><span class="k">Limită drum (OSM)</span><span style={(rl != null && osmRef > rl) ? 'color:var(--red);font-weight:700' : ''}>{rl === undefined ? 'se verifică…' : rl == null ? 'necunoscută' : (rl + ' km/h' + (rlEst ? ' (est.)' : '') + (osmRef > rl ? ' · +' + (osmRef - rl) : ''))}</span></div> : null}
            </div>
            {d.body && isIdle && <div style="font-size:12px;color:var(--text-muted);margin-top:10px;text-align:center">{d.body}</div>}
            {d.document && (d.document.hasFile || d.document.imei) && (
              <div style="display:flex;gap:8px;margin-top:12px">
                {d.document.hasFile ? <a style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary);border-radius:12px;padding:10px 6px;font-size:12.5px;font-weight:600" href={'/api/documents/' + d.document.id + '/file'} target="_blank" rel="noopener"><Icon name="eye" size={13} /> Vezi actul</a> : null}
                {d.document.imei ? <button class="btn" style="flex:1;padding:10px 6px;font-size:12.5px;border-radius:12px" onClick={() => loc.route('/vehicles/' + encodeURIComponent(d.document.imei) + '?edit=docs')}>Documentele vehiculului</button> : null}
              </div>
            )}
            <div style="display:flex;gap:8px;margin-top:14px;align-items:stretch">
              {acked
                ? <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--accent);font-weight:600;font-size:12.5px;border:1px solid var(--border);border-radius:12px;padding:10px 6px"><Icon name="check" size={14} /> Citit</div>
                : <button class="btn btn-primary" style="flex:1;padding:10px 6px;font-size:12.5px;border-radius:12px" disabled={ackBusy} onClick={markRead}>{ackBusy ? '…' : 'Marchează citit'}</button>}
              {d.event ? <a style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary);border-radius:12px;padding:10px 6px;font-size:12.5px;font-weight:600" href={'https://www.google.com/maps?q=' + d.event.lat + ',' + d.event.lng} target="_blank" rel="noopener"><Icon name="mapPin" size={13} /> Maps</a> : null}
              {d.event ? <a style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary);border-radius:12px;padding:10px 6px;font-size:12.5px;font-weight:600" href={'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + d.event.lat + ',' + d.event.lng} target="_blank" rel="noopener"><Icon name="eye" size={13} /> Street View</a> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
