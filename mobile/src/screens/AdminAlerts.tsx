import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, vehicles, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Tipuri de alertă (prag numeric / zonă geofence / limite pe axe / fără câmpuri). Paritate cu web.
// `empty` = ce face motorul de alerte când pragul e GOL, dacă NU folosește valoarea implicită (`def`).
// `offWhenEmpty` = fără prag, regula nu se declanșează deloc (server.js: `cond.dropLiters && …` etc.).
type AField = { k: string; label: string; def?: number; geofence?: boolean; empty?: string; offWhenEmpty?: boolean };
type AType = { v: string; label: string; fields: AField[]; axles?: boolean };
const OFF = { empty: 'gol = dezactivat', offWhenEmpty: true };
const ALERT_TYPES: AType[] = [
  // Viteză goală: serverul folosește pragul minim (50) plus marja (10) → alertă peste 60 km/h, nu peste 90.
  { v: 'overspeed', label: 'Depășire viteză', fields: [{ k: 'maxSpeed', label: 'Viteză max (km/h)', def: 90, empty: 'gol = alertă peste 60 km/h' }] },
  { v: 'fuel_drop', label: 'Scădere combustibil (furt)', fields: [{ k: 'dropLiters', label: 'Scădere minimă (L)', def: 10, ...OFF }] },
  { v: 'geofence_enter', label: 'Intrare în zonă', fields: [{ k: 'geofenceIds', label: 'Zone urmărite', geofence: true }] },
  { v: 'geofence_exit', label: 'Ieșire din zonă', fields: [{ k: 'geofenceIds', label: 'Zone urmărite', geofence: true }] },
  { v: 'ignition_on', label: 'Pornire motor', fields: [] },
  { v: 'ignition_off', label: 'Oprire motor', fields: [] },
  { v: 'engine_temp', label: 'Temperatură motor mare', fields: [{ k: 'maxTemp', label: 'Temp max (°C)', def: 105, ...OFF }] },
  { v: 'dtc_error', label: 'Erori motor (DTC)', fields: [] },
  { v: 'service_due', label: 'Service aproape', fields: [{ k: 'warnKm', label: 'Avertizare sub (km)', def: 1000 }] },
  { v: 'brake_pad_wear', label: 'Uzură plăcuțe frână', fields: [{ k: 'minPercent', label: 'Prag minim (%)', def: 20 }] },
  { v: 'pto_active', label: 'PTO activat', fields: [] },
  { v: 'overload_legal', label: 'Supraîncărcare (legal)', fields: [{ k: 'maxKg', label: 'Limită (kg)', def: 40000, ...OFF }] },
  { v: 'overload_construct', label: 'Supraîncărcare (constructiv)', fields: [{ k: 'maxKg', label: 'Limită (kg)', def: 44000, ...OFF }] },
  // Fără tipul ăsta, o regulă de pe axe deschisă pe telefon ar fi apărut ca „Depășire viteză".
  { v: 'axle_overload', label: 'Supraîncărcare pe axă', axles: true, fields: [] },
  { v: 'idle_engine', label: 'Staționare cu motor pornit (ralanti)', fields: [{ k: 'idleMinutes', label: 'Minute consecutive', def: 15 }] },
  { v: 'document_expiry', label: 'Expirare documente', fields: [{ k: 'warnDays', label: 'Avertizare cu (zile) înainte', def: 30 }] },
];
const AXLES = [1, 2, 3, 4, 5];
const typeLabel = (v: string) => ALERT_TYPES.find((t) => t.v === v)?.label || v;
// Tip necunoscut telefonului (adăugat pe web mai târziu) → îl păstrăm așa cum e, fără câmpuri de editat.
const typeDef = (v: string): AType => ALERT_TYPES.find((t) => t.v === v) || { v, label: v, fields: [] };
// Condiția regulii, ca obiect. Serverul o trimite deja ca obiect; textul e tratat doar din prudență.
function condOf(a: any): Record<string, any> {
  let c = a?.condition;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
}
// Valorile formularului pentru un tip. Fără regulă sursă → valorile implicite (regulă nouă).
// Cu regulă sursă → valorile ei. Un prag gol rămâne GOL, nu primește valoarea implicită: la combustibil,
// temperatură și greutate, gol înseamnă „fără prag", iar completarea lui ar schimba regula pe ascuns.
function formCond(t: AType, src: Record<string, any> | null): Record<string, any> {
  const cond: Record<string, any> = {};
  for (const f of t.fields) {
    if (f.geofence) {
      const ids = !src ? [] : (Array.isArray(src.geofenceIds) && src.geofenceIds.length ? src.geofenceIds : (src.geofenceId ? [src.geofenceId] : []));
      cond[f.k] = ids.map(Number);
    } else if (!src) cond[f.k] = f.def ?? '';
    else cond[f.k] = (src[f.k] === undefined || src[f.k] === null) ? '' : src[f.k];
  }
  if (t.axles) {
    const al = (src && src.axleLimits && typeof src.axleLimits === 'object') ? src.axleLimits : {};
    for (const n of AXLES) cond['axle' + n] = al['axle' + n] ?? '';
  }
  return cond;
}

export function AdminAlerts() {
  const loc = useLocation();
  const canWrite = !!me.value?.permissions?.manageFleet;
  // Super-adminul nu are companie proprie. Fără o alegere explicită, regula s-ar salva „fără companie":
  // s-ar declanșa pentru flotele TUTUROR clienților și n-ar apărea în lista niciunuia dintre ei.
  const isSuper = !!me.value?.isSuper;
  const vlist = vehicles.value;
  const vname = (imei: string) => { const v = vlist.find((x) => x.imei === imei); return v ? (v.name || v.plate || imei) : imei; };

  const [items, setItems] = useState<any[] | null>(null);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [cos, setCos] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [add, setAdd] = useState(false);
  // Regula deschisă pentru modificare, așa cum a venit de la server (null = regulă nouă).
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  // Salvare „pentru toată platforma" care așteaptă confirmarea (ca pe web).
  const [confirmAll, setConfirmAll] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  // Regulile al căror comutator se salvează acum. Blocare PE REGULĂ: cât se salvează una, celelalte
  // rămân utilizabile (ca pe web). Ref-ul oprește sincron dublul tap pe aceeași regulă.
  const togglingRef = useRef<Set<number>>(new Set());
  const [toggling, setToggling] = useState<Set<number>>(() => new Set());
  const [form, setForm] = useState<any>({ name: '', type: 'overspeed', imei: '', co: '', enabled: 'true', cond: {} as Record<string, any> });

  const coName = (id: any) => { const c = cos.find((x) => Number(x.id) === Number(id)); return c ? c.name : ('compania #' + id); };
  const zName = (id: any) => { const g = geofences.find((x) => Number(x.id) === Number(id)); return g ? (g.name || ('Zona #' + id)) : ('Zona #' + id); };
  // Câte zone urmărește regula — „Intrare în zonă" singur nu spune despre CE zone e vorba.
  function zoneText(a: any) {
    const c = condOf(a);
    const ids: any[] = Array.isArray(c.geofenceIds) ? c.geofenceIds : (c.geofenceId ? [c.geofenceId] : []);
    if (!ids.length) return '';
    if (ids.length === 1) return ' · ' + zName(ids[0]);
    return ' · ' + ids.length + ' zone: ' + ids.slice(0, 2).map(zName).join(', ') + (ids.length > 2 ? ' +' + (ids.length - 2) : '');
  }
  // Vehiculele companiei alese; pentru „toată platforma" rămân toate, cu compania scrisă lângă nume.
  // Cele NEASIGNATE (fără company_id) rămân vizibile oricum — altfel ar dispărea din toate listele
  // deodată și n-ai afla niciodată că există. Sunt etichetate „fără companie".
  const formVehicles = (form.co && form.co !== '__all__')
    ? vlist.filter((v: any) => Number(v.company_id) === Number(form.co) || v.company_id == null)
    : vlist;

  async function reload() {
    setErr('');
    try { setItems(await Api.alerts()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai permisiunea de administrare.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => {
    reload();
    Api.geofences().then((g) => setGeofences(Array.isArray(g) ? g : [])).catch(() => {});
    if (isSuper) Api.companies().then((c) => setCos(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  function openAdd() {
    const t = ALERT_TYPES[0];
    setEditing(null);
    setForm({ name: '', type: t.v, imei: '', co: '', enabled: 'true', cond: formCond(t, null) });
    setAdd(true);
  }
  // Modificarea unei reguli: formularul se deschide completat cu ce are regula acum.
  function openEdit(a: any) {
    const t = typeDef(a.type || ALERT_TYPES[0].v);
    const co = isSuper ? (a.company_id == null ? '__all__' : String(a.company_id)) : '';
    setEditing(a);
    setForm({ name: a.name || '', type: t.v, imei: a.imei || '', co, enabled: a.enabled ? 'true' : 'false', cond: formCond(t, condOf(a)) });
    setAdd(true);
  }
  function closeForm() { setAdd(false); setEditing(null); }
  function changeType(v: string) {
    const t = typeDef(v);
    // Revenirea la tipul inițial al regulii readuce valorile ei, nu pe cele implicite.
    const src = (editing && editing.type === v) ? condOf(editing) : null;
    setForm((p: any) => ({ ...p, type: v, cond: formCond(t, src) }));
  }
  const curType = typeDef(form.type);
  const zoneKey = (curType.fields.find((f) => f.geofence) || { k: '' }).k;
  // Zonele companiei alese — motorul caută zona în zonele companiei regulii, deci una din altă
  // companie n-ar fi găsită niciodată. Cele fără companie rămân vizibile (aceeași logică ca la vehicule).
  const formZones = (isSuper && form.co && form.co !== '__all__')
    ? geofences.filter((g: any) => Number(g.company_id) === Number(form.co) || g.company_id == null)
    : geofences;
  // Bifele din formular sunt doar zonele din lista de mai sus: o zonă a altei companii nu poate fi găsită de motor, deci
  // nu se bifează. Zonele pe care telefonul nu le primește deloc (ale platformei) se păstrează la salvare — vezi save().
  // O zonă ștearsă iese din reguli chiar pe server, în clipa ștergerii.
  const checkedZones = (): number[] => {
    const cur: any[] = Array.isArray(form.cond[zoneKey]) ? form.cond[zoneKey] : [];
    return formZones.map((g) => Number(g.id)).filter((id) => cur.some((z) => Number(z) === id));
  };
  const setZones = (ids: number[]) => setForm((p: any) => ({ ...p, cond: { ...p.cond, [zoneKey]: ids } }));
  const toggleZone = (id: number) => setForm((p: any) => {
    const cur: number[] = Array.isArray(p.cond[zoneKey]) ? p.cond[zoneKey] : [];
    const next = cur.some((z) => Number(z) === id) ? cur.filter((z) => Number(z) !== id) : cur.concat(id);
    return { ...p, cond: { ...p.cond, [zoneKey]: next } };
  });

  async function save() {
    if (!form.name.trim()) { showToast('Dă un nume regulii', true); return; }
    if (isSuper && !form.co) { showToast('Alege compania pentru care creezi regula', true); return; }
    const condition: Record<string, any> = {};
    for (const f of curType.fields) {
      if (f.geofence) {
        const ids = checkedZones();
        // Zonele regulii pe care telefonul nu le poate lista (ex. zonele platformei, invizibile adminului firmei) nu se
        // pierd la o salvare: motorul le urmărește în continuare. Cele din listă se bifează ca de obicei.
        const sc = editing ? condOf(editing) : {};
        const salvate: any[] = Array.isArray(sc[f.k]) && sc[f.k].length ? sc[f.k] : (sc.geofenceId != null ? [sc.geofenceId] : []);
        const ascunse = salvate.map(Number).filter((id) => !geofences.some((g: any) => Number(g.id) === id));
        if (!ids.length && !ascunse.length) { showToast('Bifează cel puțin o zonă', true); return; }
        condition[f.k] = ids.concat(ascunse);
        continue;
      }
      const v = form.cond[f.k];
      condition[f.k] = (v === '' || v == null) ? null : Number(v);
    }
    if (curType.axles) {
      const al: Record<string, number> = {};
      for (const n of AXLES) { const v = form.cond['axle' + n]; if (v !== '' && v != null) al['axle' + n] = Number(v); }
      condition.axleLimits = al;
    }
    // La modificare, pornim de la condiția ACTUALĂ a regulii și punem peste ea doar ce arată formularul:
    // orice câmp pe care telefonul nu-l afișează rămâne neatins. Dacă s-a schimbat tipul, condiția veche
    // nu mai are sens (un prag de viteză pe o regulă de combustibil) → pornim de la zero, ca pe web.
    let finalCond = condition;
    if (editing && editing.type === form.type) {
      finalCond = { ...condOf(editing), ...condition };
      if (zoneKey) delete finalCond.geofenceId;   // înlocuit de lista de zone salvată acum
    }
    const body: any = { name: form.name.trim(), type: form.type, imei: form.imei || null, enabled: form.enabled === 'true', condition: finalCond };
    if (isSuper) body.company_id = form.co === '__all__' ? null : Number(form.co);
    // Pentru toată platforma cerem confirmare, ca pe web: administratorii companiilor n-o vor vedea.
    if (isSuper && form.co === '__all__') { setConfirmAll(body); return; }
    await submit(body);
  }
  async function submit(body: any) {
    setSaving(true);
    try {
      if (editing) { await Api.updateAlert(editing.id, body); showToast('Modificări salvate'); }
      else { await Api.createAlert(body); showToast('Alertă creată'); }
      setConfirmAll(null); closeForm(); await reload();
    } catch (e: any) { setConfirmAll(null); showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  // Comutatorul pornit/oprit: trimite DOAR starea (ca pe web) — restul regulii rămâne neatins.
  async function toggleEnabled(a: any) {
    if (togglingRef.current.has(a.id)) return;
    const on = !a.enabled;
    togglingRef.current.add(a.id);
    setToggling(new Set(togglingRef.current));
    setItems((prev) => prev ? prev.map((x) => x.id === a.id ? { ...x, enabled: on } : x) : prev);
    try {
      const row = await Api.updateAlert(a.id, { enabled: on });
      setItems((prev) => prev ? prev.map((x) => x.id === a.id ? { ...x, ...(row && typeof row === 'object' ? row : {}), enabled: on } : x) : prev);
      showToast(on ? 'Regula e pornită' : 'Regula e oprită');
    } catch (e: any) {
      setItems((prev) => prev ? prev.map((x) => x.id === a.id ? { ...x, enabled: a.enabled } : x) : prev);
      showToast(e?.message || 'Eroare la salvare', true);
    } finally { togglingRef.current.delete(a.id); setToggling(new Set(togglingRef.current)); }
  }
  async function doDelete(a: any) {
    setSaving(true);
    try { await Api.deleteAlert(a.id); showToast('Ștearsă'); setConfirmDel(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }

  const zonesChecked = zoneKey ? checkedZones().length : 0;
  // Vehiculul regulii poate lipsi din lista afișată (ex. alt filtru de companie). Îl păstrăm ca opțiune,
  // altfel selectorul ar arăta „Toate vehiculele" și salvarea ar lărgi regula la toată flota.
  const imeiMissing = !!form.imei && !formVehicles.some((v: any) => v.imei === form.imei);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Alerte</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && (
          <div class="adm-empty"><Icon name="alert" size={40} class="ic" /><div>Nicio regulă de alertă definită.</div></div>
        )}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((a) => (
              <div class="adm-item">
                <span class="ic-wrap" style={a.enabled ? undefined : 'opacity:.5'}><Icon name="alert" size={19} /></span>
                <span class="mid" style={a.enabled ? undefined : 'opacity:.6'}>
                  <div class="nm">{a.name}</div>
                  <div class="sub">
                    {typeLabel(a.type)}{zoneText(a)} · {a.imei
                      ? vname(a.imei)
                      : (a.company_id != null
                        ? 'Toate vehiculele' + (isSuper ? ' · ' + coName(a.company_id) : '')
                        : <span style="color:var(--orange,#f59e0b)">TOATE companiile</span>)}
                  </div>
                </span>
                <span class="rt">
                  {canWrite ? (
                    <button
                      class={'sw' + (a.enabled ? ' on' : '')}
                      role="switch"
                      aria-checked={!!a.enabled}
                      aria-label={a.enabled ? 'Activă — apasă ca s-o oprești' : 'Oprită — apasă ca s-o pornești'}
                      disabled={toggling.has(a.id)}
                      onClick={() => toggleEnabled(a)}
                    />
                  ) : (
                    <span class={'adm-pill ' + (a.enabled ? 'ok' : '')}>{a.enabled ? 'activă' : 'oprită'}</span>
                  )}
                  {canWrite && <button class="icon-btn-sm" aria-label="Modifică" onClick={() => openEdit(a)}><Icon name="edit" size={17} /></button>}
                  {canWrite && <button class="icon-btn-sm danger" aria-label="Șterge" onClick={() => setConfirmDel(a)}><Icon name="trash" size={17} /></button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canWrite && <button class="fab" onClick={openAdd} aria-label="Adaugă alertă"><Icon name="plus" size={26} color="#06210f" /></button>}

      {add && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) closeForm(); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><Icon name={editing ? 'edit' : 'alert'} size={18} color="var(--accent)" /> {editing ? 'Modifici: ' + (editing.name || 'regula') : 'Adaugă alertă'}</b>
              <button class="h-btn" onClick={() => { if (!saving) closeForm(); }}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume regulă <span class="req">*</span></label><input value={form.name} onInput={(e) => setForm((p: any) => ({ ...p, name: (e.target as HTMLInputElement).value }))} placeholder="Ex: Viteză peste 90" /></div>
                {isSuper && (
                  <div class="fld"><label>Compania regulii <span class="req">*</span></label>
                    <select value={form.co} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setForm((p: any) => ({ ...p, co: v, imei: '' })); }}>
                      <option value="">— alege compania —</option>
                      {cos.map((c) => <option value={String(c.id)}>{c.name}</option>)}
                      {form.co && form.co !== '__all__' && !cos.some((c) => String(c.id) === form.co) && <option value={form.co}>{coName(form.co)}</option>}
                      <option value="__all__">⚠ Toată platforma (toate companiile)</option>
                    </select>
                    <div class="muted" style="font-size:11.5px;margin-top:4px">
                      {form.co === '__all__'
                        ? 'Regula se aplică vehiculelor tuturor companiilor și nu va fi vizibilă administratorilor lor.'
                        : form.co
                          ? formVehicles.length + ' vehicule în această companie.'
                          : 'Alege compania pentru care creezi regula — administratorul ei o va vedea și o va putea edita.'}
                    </div>
                  </div>
                )}
                <div class="fld"><label>Tip alertă</label>
                  <select value={form.type} onChange={(e) => changeType((e.target as HTMLSelectElement).value)}>
                    {ALERT_TYPES.map((t) => <option value={t.v}>{t.label}</option>)}
                    {!ALERT_TYPES.some((t) => t.v === form.type) && <option value={form.type}>{form.type}</option>}
                  </select>
                </div>
                {curType.fields.map((f) => (
                  <div class="fld"><label>{f.label}{f.geofence ? <span class="muted" style="font-weight:400"> — {zonesChecked} bifate</span> : null}</label>
                    {f.geofence ? (
                      // Bifă, nu un singur selector: regula poate urmări mai multe zone, iar fiecare
                      // traversare e raportată separat. Zonele altei companii n-ar fi găsite de motor.
                      formZones.length ? (
                        <div>
                          <div style="display:flex;gap:8px;margin-bottom:7px">
                            <button type="button" class="btn" style="padding:5px 11px;font-size:12.5px" onClick={() => setZones(formZones.map((g) => Number(g.id)))}>Bifează tot</button>
                            <button type="button" class="btn" style="padding:5px 11px;font-size:12.5px" onClick={() => setZones([])}>Golește</button>
                          </div>
                          <div style="max-height:190px;overflow:auto;border:1px solid var(--border);border-radius:9px;padding:8px 10px">
                            {formZones.map((g) => {
                              const on = (form.cond[f.k] || []).some((z: any) => Number(z) === Number(g.id));
                              return (
                                <label style="display:flex;align-items:center;gap:9px;padding:5px 0;font-size:13.5px">
                                  <input type="checkbox" checked={on} onChange={() => toggleZone(Number(g.id))} />
                                  <span>{g.name || ('Zona #' + g.id)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : <div class="muted" style="font-size:12.5px">Nicio zonă definită{isSuper && form.co && form.co !== '__all__' ? ' pentru compania aleasă' : ''}. Creează zone în secțiunea Zone.</div>
                    ) : (
                      // Indiciul din căsuța goală spune ce face serverul CHIAR ACUM cu un prag gol — nu valoarea
                      // implicită a formularului, pe care motorul n-o folosește la viteză, combustibil, temperatură, greutate.
                      <div>
                        <input type="number" inputMode="numeric" value={form.cond[f.k] ?? ''} placeholder={f.empty || (f.def != null ? 'implicit ' + f.def : '')} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setForm((p: any) => ({ ...p, cond: { ...p.cond, [f.k]: v } })); }} />
                        {f.offWhenEmpty && (form.cond[f.k] === '' || form.cond[f.k] == null) && (
                          <div style="font-size:11.5px;margin-top:4px;color:var(--orange,#f59e0b)">Fără prag, regula nu trimite nicio alertă.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {curType.axles && (
                  <div class="frm-row" style="flex-wrap:wrap">
                    {AXLES.map((n) => (
                      <div class="fld" style="flex:1 1 40%"><label>Limită axa {n} (kg)</label>
                        <input type="number" inputMode="numeric" value={form.cond['axle' + n] ?? ''} placeholder="ex: 10000" onInput={(e) => { const v = (e.target as HTMLInputElement).value; setForm((p: any) => ({ ...p, cond: { ...p.cond, ['axle' + n]: v } })); }} />
                      </div>
                    ))}
                  </div>
                )}
                <div class="fld"><label>Vehicul</label>
                  <select value={form.imei} onChange={(e) => setForm((p: any) => ({ ...p, imei: (e.target as HTMLSelectElement).value }))}>
                    <option value="">{form.co && form.co !== '__all__' ? 'Toate vehiculele companiei' : 'Toate vehiculele'}</option>
                    {imeiMissing && <option value={form.imei}>{vname(form.imei)}</option>}
                    {formVehicles.slice().sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei)).map((v: any) => (
                      <option value={v.imei}>
                        {(v.name || v.plate || v.imei) + (v.company_id == null ? ' — fără companie'
                          : (isSuper && form.co === '__all__' && v.company_name ? ' — ' + v.company_name : ''))}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="fld"><label>Stare</label>
                  <select value={form.enabled} onChange={(e) => setForm((p: any) => ({ ...p, enabled: (e.target as HTMLSelectElement).value }))}>
                    <option value="true">Activă</option>
                    <option value="false">Inactivă</option>
                  </select>
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : (editing ? 'Salvează' : 'Creează alerta')}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmAll && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setConfirmAll(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Toată platforma</b><button class="h-btn" onClick={() => { if (!saving) setConfirmAll(null); }}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px">Regula se va aplica vehiculelor <b>TUTUROR</b> companiilor de pe platformă, iar administratorii lor nu o vor vedea și nu o vor putea opri. Ești sigur?</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmAll(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={saving} onClick={() => submit(confirmAll)}>{saving ? '…' : 'Da, pentru toată platforma'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setConfirmDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Confirmare ștergere</b><button class="h-btn" onClick={() => setConfirmDel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px">Sigur ștergi regula „<b>{confirmDel.name}</b>”?</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmDel(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={saving} onClick={() => doDelete(confirmDel)}>{saving ? '…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
