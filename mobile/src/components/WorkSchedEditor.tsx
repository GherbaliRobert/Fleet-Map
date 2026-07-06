import { useState } from 'preact/hooks';
import { showToast } from '../app/store';
import { Icon } from './Icon';

// Editor „program de lucru" (supraveghere mișcare în afara programului). Reutilizat: companie (Setări), grup, vehicul.
// value: work_schedule existent (sau null). onSave primește obiectul nou (sau null = moștenește, doar în mod override).
// allowInherit=true → 3 moduri (moștenește compania / program propriu / fără supraveghere) pentru override pe grup/vehicul.

const DAYS: [string, string][] = [
  ['mon', 'Luni'], ['tue', 'Marți'], ['wed', 'Miercuri'], ['thu', 'Joi'],
  ['fri', 'Vineri'], ['sat', 'Sâmbătă'], ['sun', 'Duminică'],
];

type DayState = { on: boolean; from: string; to: string };

export function WorkSchedEditor({ value, onSave, allowInherit }: {
  value: any;
  onSave: (ws: any) => Promise<any>;
  allowInherit?: boolean;
}) {
  const init = value || null;
  // Mod override: 'inherit' (nul), 'own' (program propriu), 'off' (fără supraveghere = enabled:false).
  const initMode: 'inherit' | 'own' | 'off' = !allowInherit ? 'own'
    : (init == null ? 'inherit' : (init.enabled ? 'own' : 'off'));
  const [mode, setMode] = useState<'inherit' | 'own' | 'off'>(initMode);
  // Pentru companie: toggle enabled separat (nu are „inherit"). Pentru override „own", supravegherea e implicit activă.
  const [enabled, setEnabled] = useState<boolean>(!allowInherit ? !!(init && init.enabled) : true);
  const [tol, setTol] = useState<string>(String(init && init.tolerance_min != null ? init.tolerance_min : 15));
  const [days, setDays] = useState<Record<string, DayState>>(() => {
    const d: Record<string, DayState> = {};
    const src = (init && init.days) || {};
    for (const [k] of DAYS) {
      const iv = Array.isArray(src[k]) && src[k][0];
      d[k] = { on: !!iv, from: (iv && iv.from) || '07:00', to: (iv && iv.to) || '19:00' };
    }
    return d;
  });
  const [busy, setBusy] = useState(false);
  const setDay = (k: string, patch: Partial<DayState>) => setDays((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  async function save() {
    let ws: any;
    if (allowInherit && mode === 'inherit') ws = null;                       // moștenește compania
    else if (allowInherit && mode === 'off') ws = { enabled: false, tz: 'Europe/Bucharest', tolerance_min: Number(tol) || 0, days: {} };
    else {
      const out: Record<string, any[]> = {};
      for (const [k] of DAYS) { const d = days[k]; out[k] = (d.on && d.from && d.to) ? [{ from: d.from, to: d.to }] : []; }
      ws = { enabled: allowInherit ? true : enabled, tz: 'Europe/Bucharest', tolerance_min: Number(tol) || 0, days: out };
    }
    setBusy(true);
    try { await onSave(ws); showToast('Program salvat'); }
    catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setBusy(false); }
  }

  const showGrid = (!allowInherit) || mode === 'own';

  return (
    <div class="ws-editor" style="margin-top:6px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
        Primești alertă (+ notificare push) când {allowInherit ? 'acest element' : 'un vehicul'} <b>se deplasează în afara programului</b> (fus RO).
      </div>

      {allowInherit && (
        <div class="fld">
          <label>Program</label>
          <select value={mode} onChange={(e: any) => setMode(e.target.value)}>
            <option value="inherit">Moștenește programul companiei</option>
            <option value="own">Program propriu</option>
            <option value="off">Fără supraveghere (niciodată)</option>
          </select>
        </div>
      )}

      {!allowInherit && (
        <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin:2px 0 12px;cursor:pointer">
          <input type="checkbox" checked={enabled} onChange={(e: any) => setEnabled(e.target.checked)} />
          <b>Activează supravegherea programului de lucru</b>
        </label>
      )}

      {showGrid && (
        <div>
          {DAYS.map(([k, label]) => (
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;flex-wrap:wrap">
              <label style="display:flex;align-items:center;gap:6px;width:96px;font-size:13px;cursor:pointer">
                <input type="checkbox" checked={days[k].on} onChange={(e: any) => setDay(k, { on: e.target.checked })} /> {label}
              </label>
              <input type="time" value={days[k].from} disabled={!days[k].on} onInput={(e: any) => setDay(k, { from: e.target.value })} style="width:104px" />
              <span style="color:var(--text-muted)">–</span>
              <input type="time" value={days[k].to} disabled={!days[k].on} onInput={(e: any) => setDay(k, { to: e.target.value })} style="width:104px" />
            </div>
          ))}
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <span style="font-size:12px;color:var(--text-muted)">Toleranță la margini:</span>
            <input type="number" min={0} max={120} value={tol} onInput={(e: any) => setTol(e.target.value)} style="width:72px" />
            <span style="font-size:12px;color:var(--text-muted)">minute</span>
          </div>
        </div>
      )}

      <button class="btn btn-primary" style="margin-top:14px" disabled={busy} onClick={save}>
        <Icon name="check" size={15} /> {busy ? 'Se salvează…' : 'Salvează programul'}
      </button>
    </div>
  );
}
