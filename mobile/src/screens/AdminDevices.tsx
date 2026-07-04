import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: lista TUTUROR dispozitivelor (toate companiile + neasignate) → mutare companie + interfață CAN.
// Toate apelurile sunt requireSuperadmin pe server → un non-super primește 403 (ecranul oricum e ascuns din meniu).
const CAN_OPTS = [
  { value: '', label: 'Auto (implicit)' },
  { value: 'fms', label: 'FMS (camioane / tahograf)' },
  { value: 'lvcan', label: 'LV-CAN200 (Dacia / autoturisme)' },
  { value: 'tacho', label: 'Tahograf' },
];
const TYPE_OPTS = [
  { value: '', label: '— auto —' },
  { value: 'car', label: 'Autoturism' },
  { value: 'van', label: 'Autoutilitară' },
  { value: 'truck', label: 'Camion' },
  { value: 'bus', label: 'Autobuz' },
];

export function AdminDevices() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [canIface, setCanIface] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ imei: '', name: '', plate: '', company_id: '', vehicle_type: '', can_interface: '' });

  function reload() {
    setErr('');
    Promise.all([Api.adminDevices().catch(() => [] as any[]), Api.unassignedDevices().catch(() => [] as any[])])
      .then(([all, un]) => {
        const seen = new Set((all || []).map((d: any) => d.imei));
        setItems((all || []).concat((un || []).filter((d: any) => !seen.has(d.imei))));
      })
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
    Api.companies().then((cs) => setCompanies((cs || []).map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) })))).catch(() => {});
  }
  useEffect(reload, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = items || [];
    if (!t) return list.slice(0, 300);
    return list.filter((d: any) => [d.imei, d.name, d.plate, d.company_name].some((x: any) => String(x || '').toLowerCase().includes(t))).slice(0, 300);
  }, [items, q]);

  function open(d: any) { setSel(d); setCompanyId(d.company_id != null ? String(d.company_id) : ''); setCanIface(d.can_interface || ''); }

  async function save() {
    if (!sel) return;
    setSaving(true);
    try {
      const newCo = companyId === '' ? null : Number(companyId);
      if ((sel.company_id ?? null) !== newCo) await Api.moveDevice(sel.imei, newCo);
      if ((sel.can_interface || '') !== canIface) await Api.setCanInterface(sel.imei, canIface || null);
      showToast('Salvat'); setSel(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); } finally { setSaving(false); }
  }

  // ── Adăugare manuală (super): pre-înregistrează IMEI → allow-list (mod strict). Util până la FOTA WEB (Teltonika). ──
  function openAdd() { setF({ imei: '', name: '', plate: '', company_id: '', vehicle_type: '', can_interface: '' }); setAdding(true); }
  const setFF = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function submitAdd() {
    const imei = String(f.imei || '').trim();
    if (!/^\d{10,20}$/.test(imei)) { showToast('IMEI invalid — 10–20 de cifre', true); return; }
    setSaving(true);
    try {
      const body: any = { imei };
      if (f.name.trim()) body.name = f.name.trim();
      if (f.plate.trim()) body.plate = f.plate.trim();
      if (f.vehicle_type) body.vehicle_type = f.vehicle_type;
      if (f.company_id) body.company_id = Number(f.company_id);
      await Api.createDevice(body);
      if (f.can_interface) await Api.setCanInterface(imei, f.can_interface);
      showToast('Dispozitiv adăugat'); setAdding(false); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la adăugare', true); } finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispozitive (toate)</div>
        <button class="h-btn" onClick={openAdd} aria-label="Adaugă dispozitiv"><Icon name="plus" /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div class="adm-filter"><input value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută IMEI / nume / număr / companie…" /></div>
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && shown.length === 0 && !err && <div class="adm-empty"><Icon name="cpu" size={40} class="ic" /><div>Niciun dispozitiv.</div></div>}
        {items != null && shown.length > 0 && (
          <div class="adm-list">
            {shown.map((d: any) => (
              <button class="adm-item" onClick={() => open(d)}>
                <span class="ic-wrap"><Icon name="cpu" size={19} /></span>
                <span class="mid">
                  <div class="nm">{d.name || d.imei}{d.plate ? ' · ' + d.plate : ''}</div>
                  <div class="sub">{(d.company_name || 'Neasignat') + ' · ' + (d.can_interface ? String(d.can_interface).toUpperCase() : 'auto') + ' · ' + d.imei}</div>
                </span>
                <span class="rt">{!d.company_id && <span class="adm-pill warn">neasignat</span>}<Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="cpu" size={18} color="var(--accent)" /> {sel.name || sel.imei}</b><button class="h-btn" onClick={() => setSel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Companie</label>
                  <select value={companyId} onChange={(e: any) => setCompanyId(e.target.value)}>
                    <option value="">— Neasignat —</option>
                    {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Interfață CAN</label>
                  <select value={canIface} onChange={(e: any) => setCanIface(e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setAdding(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Adaugă dispozitiv</b><button class="h-btn" onClick={() => setAdding(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Pre-înregistrează un tracker nou după IMEI — intră în allow-list (mod strict) și e acceptat la următoarea conectare.</div>
                <div class="fld"><label>IMEI *</label><input value={f.imei} inputMode="numeric" maxLength={20} placeholder="ex. 862129084852924" onInput={(e: any) => setFF('imei', e.target.value)} /></div>
                <div class="fld"><label>Vehicul (nume)</label><input value={f.name} placeholder="ex. Dacia Logan 3" onInput={(e: any) => setFF('name', e.target.value)} /></div>
                <div class="fld"><label>Nr. înmatriculare</label><input value={f.plate} placeholder="ex. B 154 UIP" onInput={(e: any) => setFF('plate', e.target.value)} /></div>
                <div class="fld"><label>Companie</label>
                  <select value={f.company_id} onChange={(e: any) => setFF('company_id', e.target.value)}>
                    <option value="">— Neasignat —</option>
                    {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Tip vehicul</label>
                  <select value={f.vehicle_type} onChange={(e: any) => setFF('vehicle_type', e.target.value)}>
                    {TYPE_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Interfață CAN</label>
                  <select value={f.can_interface} onChange={(e: any) => setFF('can_interface', e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={submitAdd}>{saving ? 'Se adaugă…' : 'Adaugă dispozitiv'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
