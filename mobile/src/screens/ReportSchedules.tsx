import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, vehicles, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import type { ReportTypeInfo } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

const PERIODS = [
  { v: 'yesterday', label: 'Ziua precedentă' },
  { v: 'last7', label: 'Ultimele 7 zile' },
  { v: 'last30', label: 'Ultimele 30 zile' },
  { v: 'thismonth', label: 'Luna curentă' },
  { v: 'lastmonth', label: 'Luna precedentă' },
];
const FREQ = [
  { v: 'daily', label: 'Zilnic' },
  { v: 'weekly', label: 'Săptămânal (luni)' },
  { v: 'monthly', label: 'Lunar (ziua 1)' },
];
const FREQ_LBL: Record<string, string> = { daily: 'zilnic', weekly: 'săptămânal', monthly: 'lunar' };

export function ReportSchedules() {
  const loc = useLocation();
  const canWrite = !!me.value?.permissions?.viewReports;
  const vlist = vehicles.value;
  const vname = (imei: string) => { const v = vlist.find((x) => x.imei === imei); return v ? (v.name || v.plate || imei) : imei; };

  const [items, setItems] = useState<any[] | null>(null);
  const [rtypes, setRtypes] = useState<ReportTypeInfo[]>([]);
  const [err, setErr] = useState('');
  const [add, setAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null); // != null → sheet-ul editează programarea (PUT)
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ name: '', report_type: '', imei: '', period: 'yesterday', frequency: 'daily', hour: '6', format: 'pdf', recipients: '' });

  async function reload() {
    setErr('');
    try { setItems(await Api.reportSchedules()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai permisiunea pentru rapoarte.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => {
    reload();
    Api.reportTypes().then((r) => setRtypes(r.reports || [])).catch(() => {});
  }, []);

  function openAdd() { setEditId(null); setForm({ name: '', report_type: rtypes[0]?.type || '', imei: '', period: 'yesterday', frequency: 'daily', hour: '6', format: 'pdf', recipients: '' }); setAdd(true); }
  function openEdit(s: any) {
    setEditId(s.id);
    setForm({ name: s.name || '', report_type: s.report_type || '', imei: s.imei || '', period: s.period || 'yesterday', frequency: s.frequency || 'daily', hour: String(s.hour != null ? s.hour : 6), format: s.format || 'pdf', recipients: s.recipients || '' });
    setAdd(true);
  }
  function closeSheet() { setAdd(false); setEditId(null); }
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.report_type) { showToast('Alege un tip de raport', true); return; }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim() || null, report_type: form.report_type, imei: form.imei || null,
        period: form.period, frequency: form.frequency, hour: parseInt(form.hour) || 6,
        format: form.format, recipients: form.recipients.trim() || null,
      };
      if (editId != null) { await Api.updateReportSchedule(editId, body); showToast('Programare modificată'); }
      else { await Api.createReportSchedule(body); showToast('Programare adăugată'); }
      closeSheet(); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setBusy(false); }
  }
  async function runNow(s: any) {
    setBusy(true);
    try {
      const r = await Api.runReportSchedule(s.id);
      const saved = r && r.historyId != null;
      const parts = ['Generat (' + ((r && r.rows) || 0) + ' rânduri)', saved ? 'salvat în Istoric' : ('nesalvat' + (r && r.reason ? ' (' + r.reason + ')' : ''))];
      if (r && r.emailSent) parts.push('trimis pe email');
      showToast(parts.join(' · '), !saved);
      await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la trimitere', true); }
    finally { setBusy(false); }
  }
  async function doDelete(s: any) {
    setBusy(true);
    try { await Api.deleteReportSchedule(s.id); showToast('Ștearsă'); setConfirmDel(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setBusy(false); }
  }

  const typeLabel = (t: string) => rtypes.find((r) => r.type === t)?.label || t;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Rapoarte programate</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="calendar" size={40} class="ic" /><div>Nicio programare încă.</div></div>}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((s) => (
              <div class="adm-item">
                <span class="ic-wrap"><Icon name="calendar" size={19} /></span>
                <span class="mid">
                  <div class="nm">{s.name || typeLabel(s.report_type)}</div>
                  <div class="sub">{FREQ_LBL[s.frequency] || s.frequency} @ {String(s.hour).padStart(2, '0')}:00 · {(s.format || 'pdf').toUpperCase()} · {s.imei ? vname(s.imei) : 'toată flota'}</div>
                </span>
                <span class="rt">
                  {canWrite && <button class="icon-btn-sm" onClick={() => openEdit(s)} title="Editează"><Icon name="edit" size={16} /></button>}
                  {canWrite && <button class="icon-btn-sm" disabled={busy} onClick={() => runNow(s)} title="Trimite acum" style="color:var(--accent)"><Icon name="navigate" size={17} /></button>}
                  {canWrite && <button class="icon-btn-sm danger" onClick={() => setConfirmDel(s)}><Icon name="trash" size={17} /></button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canWrite && <button class="fab" onClick={openAdd} aria-label="Adaugă programare"><Icon name="plus" size={26} color="#06210f" /></button>}

      {add && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) closeSheet(); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="calendar" size={18} color="var(--accent)" /> {editId != null ? 'Editează programarea' : 'Programare raport'}</b><button class="h-btn" onClick={closeSheet}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume (opțional)</label><input value={form.name} onInput={(e) => setF('name', (e.target as HTMLInputElement).value)} placeholder="Ex: Raport zilnic flotă" /></div>
                <div class="fld"><label>Tip raport <span class="req">*</span></label>
                  <select value={form.report_type} onChange={(e) => setF('report_type', (e.target as HTMLSelectElement).value)}>
                    <option value="">— alege raportul —</option>
                    {rtypes.map((r) => <option value={r.type}>{r.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Vehicul</label>
                  <select value={form.imei} onChange={(e) => setF('imei', (e.target as HTMLSelectElement).value)}>
                    <option value="">Toată flota</option>
                    {vlist.slice().sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei)).map((v) => <option value={v.imei}>{v.name || v.plate || v.imei}</option>)}
                  </select>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Perioadă</label>
                    <select value={form.period} onChange={(e) => setF('period', (e.target as HTMLSelectElement).value)}>{PERIODS.map((p) => <option value={p.v}>{p.label}</option>)}</select>
                  </div>
                  <div class="fld"><label>Format</label>
                    <select value={form.format} onChange={(e) => setF('format', (e.target as HTMLSelectElement).value)}><option value="pdf">PDF</option><option value="xlsx">Excel</option></select>
                  </div>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Frecvență</label>
                    <select value={form.frequency} onChange={(e) => setF('frequency', (e.target as HTMLSelectElement).value)}>{FREQ.map((f) => <option value={f.v}>{f.label}</option>)}</select>
                  </div>
                  <div class="fld"><label>Ora (0–23)</label><input type="number" inputMode="numeric" value={form.hour} onInput={(e) => setF('hour', (e.target as HTMLInputElement).value)} /></div>
                </div>
                <div class="fld"><label>Destinatari (email)</label><input type="text" value={form.recipients} onInput={(e) => setF('recipients', (e.target as HTMLInputElement).value)} placeholder="gol = emailul tău; separă cu virgulă" autocapitalize="none" /></div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Se salvează…' : (editId != null ? 'Salvează modificările' : 'Programează')}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirmDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Confirmare ștergere</b><button class="h-btn" onClick={() => setConfirmDel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px">Sigur ștergi programarea „<b>{confirmDel.name || typeLabel(confirmDel.report_type)}</b>”?</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmDel(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={busy} onClick={() => doDelete(confirmDel)}>{busy ? '…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
