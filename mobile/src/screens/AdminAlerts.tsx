import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, vehicles, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Tipuri de alertă (prag numeric / zonă geofence / fără câmpuri). Paritate cu web (mai puțin axe pe vehicul).
type AField = { k: string; label: string; def?: number; geofence?: boolean };
type AType = { v: string; label: string; fields: AField[] };
const ALERT_TYPES: AType[] = [
  { v: 'overspeed', label: 'Depășire viteză', fields: [{ k: 'maxSpeed', label: 'Viteză max (km/h)', def: 90 }] },
  { v: 'fuel_drop', label: 'Scădere combustibil (furt)', fields: [{ k: 'dropLiters', label: 'Scădere minimă (L)', def: 10 }] },
  { v: 'geofence_enter', label: 'Intrare în zonă', fields: [{ k: 'geofenceId', label: 'Zonă', geofence: true }] },
  { v: 'geofence_exit', label: 'Ieșire din zonă', fields: [{ k: 'geofenceId', label: 'Zonă', geofence: true }] },
  { v: 'ignition_on', label: 'Pornire motor', fields: [] },
  { v: 'ignition_off', label: 'Oprire motor', fields: [] },
  { v: 'engine_temp', label: 'Temperatură motor mare', fields: [{ k: 'maxTemp', label: 'Temp max (°C)', def: 105 }] },
  { v: 'dtc_error', label: 'Erori motor (DTC)', fields: [] },
  { v: 'service_due', label: 'Service aproape', fields: [{ k: 'warnKm', label: 'Avertizare sub (km)', def: 1000 }] },
  { v: 'brake_pad_wear', label: 'Uzură plăcuțe frână', fields: [{ k: 'minPercent', label: 'Prag minim (%)', def: 20 }] },
  { v: 'pto_active', label: 'PTO activat', fields: [] },
  { v: 'overload_legal', label: 'Supraîncărcare (legal)', fields: [{ k: 'maxKg', label: 'Limită (kg)', def: 40000 }] },
  { v: 'overload_construct', label: 'Supraîncărcare (constructiv)', fields: [{ k: 'maxKg', label: 'Limită (kg)', def: 44000 }] },
  { v: 'idle_engine', label: 'Staționare cu motor pornit (ralanti)', fields: [{ k: 'idleMinutes', label: 'Minute consecutive', def: 15 }] },
  { v: 'document_expiry', label: 'Expirare documente', fields: [{ k: 'warnDays', label: 'Avertizare cu (zile) înainte', def: 30 }] },
];
const typeLabel = (v: string) => ALERT_TYPES.find((t) => t.v === v)?.label || v;

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
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ name: '', type: 'overspeed', imei: '', co: '', enabled: 'true', cond: {} as Record<string, any> });

  const coName = (id: any) => { const c = cos.find((x) => Number(x.id) === Number(id)); return c ? c.name : ('compania #' + id); };
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
    const cond: Record<string, any> = {};
    for (const f of t.fields) cond[f.k] = f.def ?? '';
    setForm({ name: '', type: t.v, imei: '', co: '', enabled: 'true', cond });
    setAdd(true);
  }
  function changeType(v: string) {
    const t = ALERT_TYPES.find((x) => x.v === v) || ALERT_TYPES[0];
    const cond: Record<string, any> = {};
    for (const f of t.fields) cond[f.k] = f.def ?? '';
    setForm((p: any) => ({ ...p, type: v, cond }));
  }
  const curType = ALERT_TYPES.find((t) => t.v === form.type) || ALERT_TYPES[0];

  async function save() {
    if (!form.name.trim()) { showToast('Dă un nume regulii', true); return; }
    if (isSuper && !form.co) { showToast('Alege compania pentru care creezi regula', true); return; }
    const condition: Record<string, any> = {};
    for (const f of curType.fields) {
      const v = form.cond[f.k];
      if (f.geofence && (v === '' || v == null)) { showToast('Alege o zonă', true); return; }
      condition[f.k] = (v === '' || v == null) ? null : Number(v);
    }
    const body: any = { name: form.name.trim(), type: form.type, imei: form.imei || null, enabled: form.enabled === 'true', condition };
    if (isSuper) body.company_id = form.co === '__all__' ? null : Number(form.co);
    setSaving(true);
    try {
      await Api.createAlert(body);
      showToast('Alertă creată'); setAdd(false); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  async function doDelete(a: any) {
    setSaving(true);
    try { await Api.deleteAlert(a.id); showToast('Ștearsă'); setConfirmDel(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }

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
                <span class="ic-wrap"><Icon name="alert" size={19} /></span>
                <span class="mid">
                  <div class="nm">{a.name}</div>
                  <div class="sub">
                    {typeLabel(a.type)} · {a.imei
                      ? vname(a.imei)
                      : (a.company_id != null
                        ? 'Toate vehiculele' + (isSuper ? ' · ' + coName(a.company_id) : '')
                        : <span style="color:var(--orange,#f59e0b)">TOATE companiile</span>)}
                  </div>
                </span>
                <span class="rt">
                  <span class={'adm-pill ' + (a.enabled ? 'ok' : '')}>{a.enabled ? 'activă' : 'inactivă'}</span>
                  {canWrite && <button class="icon-btn-sm danger" onClick={() => setConfirmDel(a)}><Icon name="trash" size={17} /></button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canWrite && <button class="fab" onClick={openAdd} aria-label="Adaugă alertă"><Icon name="plus" size={26} color="#06210f" /></button>}

      {add && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setAdd(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="alert" size={18} color="var(--accent)" /> Adaugă alertă</b><button class="h-btn" onClick={() => setAdd(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume regulă <span class="req">*</span></label><input value={form.name} onInput={(e) => setForm((p: any) => ({ ...p, name: (e.target as HTMLInputElement).value }))} placeholder="Ex: Viteză peste 90" /></div>
                {isSuper && (
                  <div class="fld"><label>Compania regulii <span class="req">*</span></label>
                    <select value={form.co} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setForm((p: any) => ({ ...p, co: v, imei: '' })); }}>
                      <option value="">— alege compania —</option>
                      {cos.map((c) => <option value={String(c.id)}>{c.name}</option>)}
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
                  </select>
                </div>
                {curType.fields.map((f) => (
                  <div class="fld"><label>{f.label}</label>
                    {f.geofence ? (
                      geofences.length ? (
                        <select value={form.cond[f.k] ?? ''} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setForm((p: any) => ({ ...p, cond: { ...p.cond, [f.k]: v } })); }}>
                          <option value="">— alege zona —</option>
                          {geofences.map((g) => <option value={String(g.id)}>{g.name}</option>)}
                        </select>
                      ) : <div class="muted" style="font-size:12.5px">Nicio zonă definită. Creează zone în aplicația web.</div>
                    ) : (
                      <input type="number" inputMode="numeric" value={form.cond[f.k] ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setForm((p: any) => ({ ...p, cond: { ...p.cond, [f.k]: v } })); }} />
                    )}
                  </div>
                ))}
                <div class="fld"><label>Vehicul</label>
                  <select value={form.imei} onChange={(e) => setForm((p: any) => ({ ...p, imei: (e.target as HTMLSelectElement).value }))}>
                    <option value="">{form.co && form.co !== '__all__' ? 'Toate vehiculele companiei' : 'Toate vehiculele'}</option>
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
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Creează alerta'}</button></div>
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
