import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Cereri de cont demo (super-admin). Demo-ul nu se mai ia singur de pe site: vizitatorul completează
// formularul public, iar aici se acordă accesul, cu termen ales. Paritate cu tabul „Cereri demo" de pe web.
const STATUS_LABEL: Record<string, string> = { new: 'nouă', approved: 'aprobată', rejected: 'respinsă' };
const STATUS_COLOR: Record<string, string> = { new: 'var(--accent)', approved: 'var(--text-muted)', rejected: 'var(--red)' };
// Durata se exprimă în ORE (serverul lucrează tot în ore): de la câteva ore la 30 de zile.
const DURATIONS: { h: number; label: string }[] = [
  { h: 2, label: '2 ore' }, { h: 6, label: '6 ore' }, { h: 12, label: '12 ore' }, { h: 24, label: '24 ore' },
  { h: 72, label: '3 zile' }, { h: 168, label: '7 zile' }, { h: 336, label: '14 zile' }, { h: 720, label: '30 zile' },
];
const fmtDT = (v: any) => { if (!v) return '—'; try { return new Date(Number(v)).toLocaleString('ro-RO'); } catch { return String(v); } };
// Cu durate de ordinul orelor, doar data nu spune nimic → afișăm și ora.
const fmtD = (v: any) => { if (!v) return ''; try { return new Date(Number(v)).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export function DemoRequests() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<any | null>(null);
  const [hours, setHours] = useState(168); // implicit 7 zile

  function reload() {
    setErr('');
    Api.demoRequests(filter || undefined)
      .then(setItems)
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, [filter]);

  async function doApprove() {
    if (!approving) return;
    setBusy(true);
    try {
      const r: any = await Api.approveDemoRequest(approving.id, { hours });
      // „Acordat" nu înseamnă și „a plecat emailul": dacă SMTP nu e configurat, o spunem explicit.
      const lbl = r?.duration || (DURATIONS.find((d) => d.h === hours)?.label || hours + ' ore');
      showToast(r?.warning ? ('Acces acordat, DAR: ' + r.warning) : ('Acces acordat: ' + lbl + ' ✓'), !!r?.warning);
      setApproving(null); reload();
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut aproba', true); }
    finally { setBusy(false); }
  }
  async function doReject(r: any) {
    if (!confirm('Respingi cererea de la ' + (r.email || '') + '?')) return;
    setBusy(true);
    try { await Api.rejectDemoRequest(r.id); showToast('Cerere respinsă'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function doDelete(r: any) {
    if (!confirm('Ștergi cererea din listă? Datele solicitantului dispar definitiv.')) return;
    setBusy(true);
    try { await Api.deleteDemoRequest(r.id); showToast('Ștearsă'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Cereri demo</div>
        <button class="h-btn" onClick={reload} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {!isSuper && <div class="adm-empty" style="color:var(--red)">Doar super-adminul poate acorda conturi demo.</div>}
        {isSuper && (
          <>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
              {[['', 'Toate'], ['new', 'Noi'], ['approved', 'Aprobate'], ['rejected', 'Respinse']].map(([v, l]) => (
                <button
                  onClick={() => setFilter(v)}
                  style={'padding:7px 12px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;border:1px solid var(--border);cursor:pointer;'
                    + (filter === v ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)')}
                >{l}</button>
              ))}
            </div>
            {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
            {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
            {items && items.length === 0 && !err && <div class="adm-empty"><Icon name="mail" size={40} class="ic" /><div>Nicio cerere.</div></div>}
            {items && items.length > 0 && (
              <div class="adm-list">
                {items.map((r) => (
                  <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 13px;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <b style="font-size:13.5px">{r.name || '(fără nume)'}</b>
                      {r.company ? <span style="font-size:12.5px;color:var(--text-muted)">· {r.company}</span> : null}
                      {r.wants_demo ? <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--bg-dark);color:var(--accent)">cere demo</span> : null}
                      <span style={'font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--bg-dark);color:' + (STATUS_COLOR[r.status] || 'var(--text-muted)')}>{STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
                      <a href={'mailto:' + r.email} style="color:var(--text-secondary)">{r.email}</a>
                      {r.phone ? <> · <a href={'tel:' + r.phone} style="color:var(--text-secondary)">{r.phone}</a></> : null}
                      {' · ' + fmtDT(r.created_at)}
                      {r.access_until ? ' · acces până la ' + fmtD(r.access_until) : ''}
                    </div>
                    {r.message ? <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45;margin-top:6px;white-space:pre-wrap">{r.message}</div> : null}
                    <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">
                      {r.status === 'new' ? (
                        <>
                          <button disabled={busy} onClick={() => { setHours(168); setApproving(r); }} style="flex:1;min-width:110px;background:var(--accent);border:none;color:#06210F;border-radius:8px;padding:8px;font-size:12.5px;font-weight:800;font-family:inherit">Acordă acces</button>
                          <button disabled={busy} onClick={() => doReject(r)} style="flex:1;min-width:90px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:8px;font-size:12.5px;font-weight:700;font-family:inherit">Respinge</button>
                        </>
                      ) : (
                        <button disabled={busy} onClick={() => doDelete(r)} style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:700;font-family:inherit"><Icon name="trash" size={13} /> Șterge</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {approving && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setApproving(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="check" size={18} color="var(--accent)" /> Acordă acces demo</b><button class="h-btn" onClick={() => setApproving(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">
                Se creează un cont pe <b>{approving.email}</b>, cu vehiculele demonstrative, și îi trimitem link de setare a parolei.
              </div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Durata accesului</div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:14px">
                {DURATIONS.map((d) => (
                  <button
                    onClick={() => setHours(d.h)}
                    style={'padding:10px 4px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;border:1px solid ' + (hours === d.h ? 'var(--accent)' : 'var(--border)') + ';cursor:pointer;'
                      + (hours === d.h ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)')}
                  >{d.label}</button>
                ))}
              </div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">
                Expiră la <b>{new Date(Date.now() + hours * 3600 * 1000).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b>
              </div>
              <button class="btn btn-primary" disabled={busy} onClick={doApprove} style="width:100%">{busy ? 'Se acordă…' : 'Acordă ' + (DURATIONS.find((d) => d.h === hours)?.label || hours + ' ore')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
