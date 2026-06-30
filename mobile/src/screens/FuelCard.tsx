import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Card combustibil: alimentări (import CSV / manual) + reconciliere cu nivelul CAN al rezervorului (detecție furt).
// manageFleet pe server (requireFleet + withCompany) → scope pe companie.
const STAT: Record<string, [string, string]> = {
  reconciliat: ['#16a34a', 'reconciliat'], suspect: ['#ef4444', 'SUSPECT'],
  partial: ['#f59e0b', 'parțial'], fara_can: ['#64748b', 'fără CAN'], nou: ['#64748b', 'neverificat'],
};
function dt(ms: any) { if (!ms) return '—'; try { return new Date(Number(ms)).toLocaleDateString('ro-RO'); } catch { return '—'; } }

export function FuelCard() {
  const loc = useLocation();
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImp, setShowImp] = useState(false);
  const [f, setF] = useState<any>({ plate: '', date: '', liters: '', amount: '', station: '' });
  const [csv, setCsv] = useState('');

  function reload() { Api.fuelTransactions().then((r: any) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])); }
  useEffect(reload, []);

  async function reconcile() {
    setBusy(true);
    try { const r: any = await Api.reconcileFuel(); showToast('Verificate ' + (r.reconciled || 0) + (r.suspect ? ' · ' + r.suspect + ' suspecte' : ''), !!r.suspect); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function add() {
    if (!f.plate.trim() || !f.liters) { showToast('Pune înmatricularea și litrii', true); return; }
    setBusy(true);
    try {
      const r: any = await Api.addFuelTx({ plate: f.plate.trim(), date: f.date, liters: Number(f.liters), amount: f.amount ? Number(f.amount) : null, station: f.station });
      showToast('Adăugat — ' + (r.status || ''), r.status === 'suspect'); setShowAdd(false); setF({ plate: '', date: '', liters: '', amount: '', station: '' }); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function importCsv() {
    if (!csv.trim()) { showToast('Lipește CSV-ul', true); return; }
    setBusy(true);
    try { const r: any = await Api.importFuelCsv(csv.trim()); showToast('Importate ' + (r.imported || 0) + ' alimentări', false); setShowImp(false); setCsv(''); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la import', true); } finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!confirm('Ștergi alimentarea?')) return;
    try { await Api.deleteFuelTx(id); reload(); } catch { /* nimic */ }
  }

  const list = rows || [];
  const totL = list.reduce((a, r) => a + (Number(r.liters) || 0), 0);
  const sus = list.filter((r) => r.status === 'suspect').length;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Card combustibil</div>
        <button class="h-btn" onClick={() => setShowImp(true)} aria-label="Import CSV"><Icon name="plus" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-primary" style="flex:1" disabled={busy} onClick={reconcile}>{busy ? '…' : 'Reconciliază toate'}</button>
          <button class="btn" style="flex:1;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setShowAdd(true)}>+ Manual</button>
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">{list.length} alimentări · {totL.toFixed(0)} L {sus ? <strong style="color:var(--red)"> · {sus} suspecte</strong> : null}</div>

        {rows == null && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {rows && list.length === 0 && <div class="adm-empty"><Icon name="droplet" size={40} class="ic" /><div>Nicio alimentare. Importă un CSV sau adaugă manual.</div></div>}
        {list.map((r) => {
          const st = STAT[r.status] || STAT.nou;
          return (
            <div class="pf-card" style={'margin-bottom:8px;' + (r.status === 'suspect' ? 'border-color:var(--red)' : '')}>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <div>
                  <div style="font-weight:700;font-size:14px">{r.plate || r.vehicle_name || (r.imei ? r.imei : 'nealocat')}</div>
                  <div style="font-size:12px;color:var(--text-muted)">{dt(r.ts)} · {r.station || '—'}</div>
                </div>
                <span style={'font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:' + st[0] + '22;color:' + st[0]}>{st[1]}</span>
              </div>
              <div class="adm-kv" style="margin-top:6px"><span class="k">Litri card</span><span>{(Number(r.liters) || 0).toFixed(1)} L{r.amount != null ? ' · ' + Number(r.amount).toFixed(0) + ' ' + (r.currency || 'RON') : ''}</span></div>
              <div class="adm-kv"><span class="k">Δ rezervor (CAN)</span><span>{r.tank_delta != null ? Number(r.tank_delta).toFixed(1) + ' L' : '—'}</span></div>
              <button class="adm-act danger" style="margin-top:8px" onClick={() => del(r.id)}><Icon name="trash" size={13} /> Șterge</button>
            </div>
          );
        })}
        {rows && list.length > 0 && <div style="font-size:11px;color:var(--text-muted);margin-top:8px">„SUSPECT" = combustibil plătit dar rezervorul nu a crescut (posibil furt). „Fără CAN" = vehiculul nu raportează nivel.</div>}
      </div>

      {showAdd && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="droplet" size={18} color="var(--accent)" /> Alimentare nouă</b><button class="h-btn" onClick={() => setShowAdd(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Înmatriculare</label><input value={f.plate} onInput={(e: any) => setF({ ...f, plate: e.target.value })} placeholder="B 123 ABC" /></div>
                <div class="frm-row">
                  <div class="fld"><label>Data</label><input type="date" value={f.date} onInput={(e: any) => setF({ ...f, date: e.target.value })} /></div>
                  <div class="fld"><label>Litri</label><input type="number" inputMode="decimal" value={f.liters} onInput={(e: any) => setF({ ...f, liters: e.target.value })} /></div>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Sumă (RON)</label><input type="number" inputMode="decimal" value={f.amount} onInput={(e: any) => setF({ ...f, amount: e.target.value })} /></div>
                  <div class="fld"><label>Stație</label><input value={f.station} onInput={(e: any) => setF({ ...f, station: e.target.value })} /></div>
                </div>
                <button class="btn btn-primary" disabled={busy} onClick={add}>{busy ? 'Se adaugă…' : 'Adaugă + verifică'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showImp && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) setShowImp(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="fileBar" size={18} color="var(--accent)" /> Import CSV</b><button class="h-btn" onClick={() => setShowImp(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="fld"><label>Lipește CSV-ul (cu antet: data, litri, sumă, înmatriculare…)</label>
                <textarea value={csv} onInput={(e: any) => setCsv(e.target.value)} rows={7} placeholder="data;litri;suma;inmatriculare;statie&#10;12.06.2026;52,3;392;B 123 ABC;OMV Otopeni" /></div>
              <button class="btn btn-primary" style="margin-top:10px" disabled={busy} onClick={importCsv}>{busy ? 'Se importă…' : 'Importă'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
