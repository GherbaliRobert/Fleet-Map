import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { vehicles, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './route.css';
import './admin.css';

// Dispecerizare: alegi destinația pe hartă și primești vehiculele clasate după distanță, cu ETA estimativ.
// Paritate cu panoul de pe web (dispatchPickDestination / dispatchSetTarget), pe aceeași rută de server.
// Nu există geocodare directă (adresă → coordonate) în platformă, deci destinația se alege prin atingere,
// exact ca pe desktop.
type Suggestion = {
  imei: string; name: string; plate?: string | null;
  distanceKm: number; etaMin: number; online: boolean; available: boolean; ageMin: number;
  lat: number; lon: number;
};

const fmtEta = (m: number) => (m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min');

export function Dispatch() {
  const loc = useLocation();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const targetRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const fleetRef = useRef<any>(null);
  const [target, setTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Harta: o singură inițializare. Vehiculele curente apar ca puncte discrete, ca să vezi contextul
  // înainte de a alege destinația.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    const fleet = L.layerGroup().addTo(map);
    fleetRef.current = fleet;
    const pts: any[] = [];
    for (const v of (vehicles.value || [])) {
      if (v.latitude == null || v.longitude == null) continue;
      L.circleMarker([v.latitude, v.longitude], { radius: 4, color: '#64748b', weight: 1, fillOpacity: 0.7 })
        .bindTooltip(v.plate || v.name || v.imei, { direction: 'top' }).addTo(fleet);
      pts.push([v.latitude, v.longitude]);
    }
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.25)); } catch { /* o singură poziție */ } }

    map.on('click', (e: any) => pick(e.latlng.lat, e.latlng.lng));
    setTimeout(() => { try { map.invalidateSize(); } catch { } }, 200);
    return () => { try { map.remove(); } catch { } mapRef.current = null; };
  }, []);

  async function pick(lat: number, lon: number) {
    const map = mapRef.current; if (!map) return;
    setTarget({ lat, lon }); setErr(''); setBusy(true); setList(null);
    if (targetRef.current) { try { map.removeLayer(targetRef.current); } catch { } }
    if (lineRef.current) { try { map.removeLayer(lineRef.current); } catch { } lineRef.current = null; }
    targetRef.current = L.marker([lat, lon]).addTo(map).bindTooltip('Destinație', { permanent: true, direction: 'top' });
    try {
      const r: any = await Api.dispatchSuggest(lat, lon);
      const v: Suggestion[] = (r && r.vehicles) || [];
      setList(v);
      if (!v.length) showToast('Niciun vehicul cu poziție cunoscută', true);
    } catch (e: any) {
      setErr(e?.status === 403 ? 'Nu ai acces la dispecerizare.' : (e?.message || 'Eroare la căutare'));
      setList([]);
    } finally { setBusy(false); }
  }

  // Trasează legătura vehicul → destinație, ca să vezi imediat despre ce distanță e vorba.
  function focus(v: Suggestion) {
    const map = mapRef.current; if (!map || !target) return;
    if (lineRef.current) { try { map.removeLayer(lineRef.current); } catch { } }
    lineRef.current = L.polyline([[v.lat, v.lon], [target.lat, target.lon]], { color: 'var(--accent)', weight: 3, opacity: 0.85, dashArray: '6,6' }).addTo(map);
    try { map.fitBounds(L.latLngBounds([[v.lat, v.lon], [target.lat, target.lon]]).pad(0.3)); } catch { }
  }

  const disponibile = (list || []).filter((v) => v.available).length;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispecerizare</div>
        <button class="h-btn" onClick={() => { if (target) pick(target.lat, target.lon); }} aria-label="Recalculează"><Icon name="refresh" size={20} /></button>
      </header>

      <div class="content has-tabbar" style="padding:0 0 24px">
        <div ref={mapEl} style="height:44vh;min-height:260px;width:100%;background:var(--bg-dark)" />

        <div style="padding:12px 14px">
          {!target && (
            <div class="adm-empty" style="padding:14px">
              <Icon name="mapPin" size={34} class="ic" />
              <div>Atinge harta în locul unde ai nevoie de vehicul.</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px">Îți arăt cele mai apropiate mașini, cu timpul estimat până acolo.</div>
            </div>
          )}

          {target && (
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              <span style="font-size:12.5px;color:var(--text-muted)">
                Destinație: <b style="color:var(--text-primary)">{target.lat.toFixed(4)}, {target.lon.toFixed(4)}</b>
              </span>
              {list && !busy ? (
                <span style={'margin-left:auto;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--bg-dark);color:' + (disponibile ? 'var(--accent)' : 'var(--text-muted)')}>
                  {disponibile} disponibile / {list.length}
                </span>
              ) : null}
            </div>
          )}

          {busy && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
          {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
          {list && !busy && list.length === 0 && !err && (
            <div class="adm-empty"><Icon name="truck" size={34} class="ic" /><div>Niciun vehicul cu poziție cunoscută.</div></div>
          )}

          {list && !busy && list.length > 0 && (
            <div class="adm-list">
              {list.map((v, i) => (
                <button class="adm-item" onClick={() => focus(v)} style={v.available ? '' : 'opacity:.62'}>
                  <span class="ic-wrap" style={'background:' + (v.available ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--bg-dark)')}>
                    <b style={'font-size:13px;color:' + (v.available ? 'var(--accent)' : 'var(--text-muted)')}>{i + 1}</b>
                  </span>
                  <span class="mid">
                    <div class="nm">{v.plate || v.name}</div>
                    <div class="sub">
                      {v.distanceKm} km · ~{fmtEta(v.etaMin)}
                      {' · '}
                      {/* „Liber" se bazează pe ULTIMA poziție primită. Dacă e veche de zeci de minute,
                          spunem asta — altfel dispecerul trimite pe cineva după o mașină care între timp a plecat. */}
                      {v.available
                        ? (v.ageMin > 10 ? 'oprit la ultima poziție (acum ' + fmtEta(v.ageMin) + ')' : 'liber acum')
                        : (v.online ? 'în cursă' : 'fără semnal de ' + fmtEta(v.ageMin))}
                    </div>
                  </span>
                  <span class="rt">
                    <button
                      onClick={(e) => { e.stopPropagation(); loc.route('/vehicles/' + encodeURIComponent(v.imei)); }}
                      style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;font-family:inherit"
                    >Deschide</button>
                  </span>
                </button>
              ))}
            </div>
          )}

          {list && !busy && list.length > 0 && (
            <div style="font-size:11.5px;color:var(--text-muted);line-height:1.45;margin-top:10px">
              Timpul e o estimare din distanța în linie dreaptă (40 km/h mediu), nu un traseu calculat pe drum.
              „Liber" înseamnă că ultima poziție primită arăta vehiculul oprit — verifică și cât de recentă e.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
