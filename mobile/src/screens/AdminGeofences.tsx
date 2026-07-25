import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { me, vehicles, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './route.css';
import './admin.css';
import './detail.css';

// Zone (geofence) — CRUD complet pe telefon. Până acum aplicația mobilă avea DOAR citire, deci zonele
// se puteau crea exclusiv de pe web, iar alertele de intrare/ieșire rămâneau cu lista goală.
//
// Forma coordonatelor e cea a serverului (vezi enrichGeofence + isPointInCircle):
//   cerc   → { center: [lat, lon], radius: <metri> }
//   poligon→ [[lat, lon], [lat, lon], …]
// Desenarea pe ecran mic: cercul se face dintr-o atingere (centru) + un cursor pentru rază — mult mai
// practic cu degetul decât tras de un mâner; poligonul se face atingând vârfurile pe rând.
type Zone = { id: number; name: string; type: string; coordinates: any; color?: string };

const RAZE = [100, 250, 500, 1000, 2000, 5000];
const CULORI = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];
const fmtRaza = (m: number) => (m >= 1000 ? (m / 1000) + ' km' : m + ' m');

export function AdminGeofences() {
  const loc = useLocation();
  const perms = me.value?.permissions || {};
  const poateEdita = !!perms.manageFleet;

  const [items, setItems] = useState<Zone[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<null | { zone: Zone | null }>(null);

  // starea editorului
  const [nume, setNume] = useState('');
  const [tip, setTip] = useState<'circle' | 'polygon'>('circle');
  const [culoare, setCuloare] = useState(CULORI[0]);
  const [centru, setCentru] = useState<[number, number] | null>(null);
  const [raza, setRaza] = useState(500);
  const [puncte, setPuncte] = useState<[number, number][]>([]);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);

  function reload() {
    setErr('');
    Api.geofences().then((z: any) => setItems(z || []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, []);

  function deschide(z: Zone | null) {
    setNume(z ? z.name : '');
    setCuloare((z && z.color) || CULORI[0]);
    if (z && z.type === 'circle' && z.coordinates?.center) {
      setTip('circle'); setCentru([Number(z.coordinates.center[0]), Number(z.coordinates.center[1])]);
      setRaza(Number(z.coordinates.radius) || 500); setPuncte([]);
    } else if (z && Array.isArray(z.coordinates)) {
      setTip('polygon'); setPuncte(z.coordinates.map((p: any) => [Number(p[0]), Number(p[1])] as [number, number]));
      setCentru(null);
    } else {
      setTip('circle'); setCentru(null); setPuncte([]); setRaza(500);
    }
    setEditor({ zone: z });
  }

  // Harta editorului: se creează la deschidere, se distruge la închidere (altfel rămâne un container orfan).
  useEffect(() => {
    if (!editor || !mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    drawRef.current = L.layerGroup().addTo(map);

    // Context: unde sunt vehiculele, ca să nu desenezi zona „în gol"
    for (const v of (vehicles.value || [])) {
      if (v.latitude == null || v.longitude == null) continue;
      L.circleMarker([v.latitude, v.longitude], { radius: 3, color: '#64748b', weight: 1, fillOpacity: 0.6 }).addTo(map);
    }
    const start = centru || puncte[0] || (vehicles.value || []).filter((v: any) => v.latitude != null).map((v: any) => [v.latitude, v.longitude])[0];
    if (start) map.setView(start as any, 13);

    map.on('click', (e: any) => {
      const p: [number, number] = [e.latlng.lat, e.latlng.lng];
      setTip((t) => { if (t === 'circle') setCentru(p); else setPuncte((cur) => [...cur, p]); return t; });
    });
    setTimeout(() => { try { map.invalidateSize(); } catch { } }, 200);
    return () => { try { map.remove(); } catch { } mapRef.current = null; drawRef.current = null; };
  }, [editor]);

  // Redesenează forma la fiecare schimbare (centru/rază/puncte/culoare/tip)
  useEffect(() => {
    const g = drawRef.current, map = mapRef.current; if (!g || !map) return;
    g.clearLayers();
    if (tip === 'circle' && centru) {
      L.circle(centru, { radius: raza, color: culoare, weight: 2, fillOpacity: 0.15 }).addTo(g);
      L.circleMarker(centru, { radius: 5, color: culoare, fillOpacity: 1 }).addTo(g);
    } else if (tip === 'polygon' && puncte.length) {
      puncte.forEach((p, i) => L.circleMarker(p, { radius: 5, color: culoare, fillOpacity: 1 }).bindTooltip(String(i + 1), { permanent: true, direction: 'top' }).addTo(g));
      if (puncte.length >= 3) L.polygon(puncte, { color: culoare, weight: 2, fillOpacity: 0.15 }).addTo(g);
      else if (puncte.length === 2) L.polyline(puncte, { color: culoare, weight: 2, dashArray: '5,5' }).addTo(g);
    }
  }, [tip, centru, raza, puncte, culoare, editor]);

  const valid = nume.trim().length >= 2 && (tip === 'circle' ? !!centru : puncte.length >= 3);

  async function salveaza() {
    if (!valid) { showToast(tip === 'circle' ? 'Atinge harta ca să pui centrul zonei' : 'O zonă are nevoie de minim 3 puncte', true); return; }
    setBusy(true);
    const body: any = {
      name: nume.trim(), type: tip, color: culoare,
      coordinates: tip === 'circle' ? { center: centru, radius: raza } : puncte,
    };
    try {
      if (editor?.zone) { await Api.updateGeofence(editor.zone.id, body); showToast('Zonă actualizată'); }
      else { await Api.createGeofence(body); showToast('Zonă creată'); }
      setEditor(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setBusy(false); }
  }
  async function sterge(z: Zone) {
    if (!confirm('Ștergi zona „' + z.name + '"?\n\nAlertele legate de ea rămân, dar nu se mai declanșează.')) return;
    setBusy(true);
    try { await Api.deleteGeofence(z.id); showToast('Zonă ștearsă'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }

  const descriere = (z: Zone) => {
    if (z.type === 'circle' && z.coordinates?.center) return 'cerc · rază ' + fmtRaza(Number(z.coordinates.radius) || 0);
    if (Array.isArray(z.coordinates)) return 'poligon · ' + z.coordinates.length + ' puncte';
    if (z.coordinates?.line) return 'coridor · ' + z.coordinates.line.length + ' puncte';
    return z.type;
  };

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Zone</div>
        {poateEdita
          ? <button class="h-btn" onClick={() => deschide(null)} aria-label="Zonă nouă"><Icon name="plus" size={20} /></button>
          : <div style="width:36px" />}
      </header>

      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items && items.length === 0 && !err && (
          <div class="adm-empty">
            <Icon name="mapPin" size={40} class="ic" />
            <div>Nicio zonă definită.</div>
            <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px">Zonele îți dau alerte când un vehicul intră sau iese (depozit, punct de lucru, parcare).</div>
          </div>
        )}
        {items && items.length > 0 && (
          <div class="adm-list">
            {items.map((z) => (
              <div class="adm-item" style="cursor:default">
                <span class="ic-wrap" style={'background:' + (z.color || '#2563eb') + '22'}>
                  <span style={'width:14px;height:14px;border-radius:4px;background:' + (z.color || '#2563eb')} />
                </span>
                <span class="mid">
                  <div class="nm">{z.name}</div>
                  <div class="sub">{descriere(z)}</div>
                </span>
                {poateEdita && (
                  <span class="rt" style="display:flex;gap:6px">
                    <button onClick={() => deschide(z)} style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px 9px;font-family:inherit"><Icon name="edit" size={14} /></button>
                    <button onClick={() => sterge(z)} disabled={busy} style="background:var(--bg-dark);border:1px solid var(--border);color:var(--red);border-radius:8px;padding:7px 9px;font-family:inherit"><Icon name="trash" size={14} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {items && items.length > 0 && !poateEdita && (
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:10px">Contul tău poate vedea zonele, dar nu le poate modifica.</div>
        )}
      </div>

      {editor && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setEditor(null); }}>
          <div class="sheet" style="max-height:92vh">
            <div class="sheet-h">
              <b><Icon name="mapPin" size={18} color="var(--accent)" /> {editor.zone ? 'Editează zona' : 'Zonă nouă'}</b>
              <button class="h-btn" onClick={() => setEditor(null)}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="fld"><label>Denumire <span class="req">*</span></label>
                <input value={nume} onInput={(e) => setNume((e.target as HTMLInputElement).value)} placeholder="Depozit Timișoara" />
              </div>

              <div style="display:flex;gap:7px;margin:10px 0">
                {([['circle', 'Cerc'], ['polygon', 'Poligon']] as const).map(([v, l]) => (
                  <button
                    onClick={() => setTip(v)}
                    style={'flex:1;padding:9px;border-radius:9px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;border:1px solid ' + (tip === v ? 'var(--accent)' : 'var(--border)') + ';'
                      + (tip === v ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)')}
                  >{l}</button>
                ))}
              </div>

              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">
                {tip === 'circle' ? 'Atinge harta ca să pui centrul, apoi alege raza.' : 'Atinge harta pentru fiecare colț al zonei (minim 3).'}
              </div>
              <div ref={mapEl} style="height:34vh;min-height:220px;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:var(--bg-dark)" />

              {tip === 'circle' && (
                <div style="margin-top:10px">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Rază</div>
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">
                    {RAZE.map((r) => (
                      <button onClick={() => setRaza(r)}
                        style={'padding:9px 4px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;border:1px solid ' + (raza === r ? 'var(--accent)' : 'var(--border)') + ';'
                          + (raza === r ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)')}
                      >{fmtRaza(r)}</button>
                    ))}
                  </div>
                </div>
              )}

              {tip === 'polygon' && (
                <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">
                  <span style="font-size:12.5px;color:var(--text-muted)">{puncte.length} {puncte.length === 1 ? 'punct' : 'puncte'}{puncte.length > 0 && puncte.length < 3 ? ' (minim 3)' : ''}</span>
                  <button disabled={!puncte.length} onClick={() => setPuncte((p) => p.slice(0, -1))}
                    style="margin-left:auto;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px 11px;font-size:12.5px;font-weight:700;font-family:inherit">Șterge ultimul</button>
                  <button disabled={!puncte.length} onClick={() => setPuncte([])}
                    style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:7px 11px;font-size:12.5px;font-weight:700;font-family:inherit">Golește</button>
                </div>
              )}

              <div style="margin-top:12px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Culoare</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  {CULORI.map((c) => (
                    <button onClick={() => setCuloare(c)} aria-label={'Culoare ' + c}
                      style={'width:34px;height:34px;border-radius:9px;cursor:pointer;background:' + c + ';border:2px solid ' + (culoare === c ? 'var(--text-primary)' : 'transparent')} />
                  ))}
                </div>
              </div>

              <button class="btn btn-primary btn-block" style="margin-top:14px" disabled={busy || !valid} onClick={salveaza}>
                {busy ? 'Se salvează…' : (editor.zone ? 'Salvează modificările' : 'Creează zona')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
