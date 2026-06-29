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

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispozitive (toate)</div>
        <div style="width:36px" />
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
    </div>
  );
}
