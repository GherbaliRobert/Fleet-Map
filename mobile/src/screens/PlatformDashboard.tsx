import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';

// Super-admin: dashboard platformă (venituri + sănătate flotă + server + erori). Toate endpoint-urile requireSuperadmin.
function n(v: any, d = 0) { return (v == null || isNaN(Number(v))) ? d : Number(v); }
function fmtUptime(s: any) { const x = n(s); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60); return h >= 24 ? Math.floor(h / 24) + 'z ' + (h % 24) + 'h' : (h > 0 ? h + 'h ' + m + 'm' : m + 'm'); }
function fmtDT(s: any) { if (!s) return '—'; try { return new Date(s).toLocaleString('ro-RO'); } catch { return String(s); } }

export function PlatformDashboard() {
  const loc = useLocation();
  const [ov, setOv] = useState<any | null>(null);
  const [counts, setCounts] = useState<any | null>(null);
  const [live, setLive] = useState<any | null>(null);
  const [errs, setErrs] = useState<any[] | null>(null);
  const [bk, setBk] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [bkBusy, setBkBusy] = useState(false);

  function reload() {
    setErr('');
    Api.adminOverview(30).then(setOv).catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')));
    Api.adminCounts().then(setCounts).catch(() => {});
    Api.liveStats().then(setLive).catch(() => {});
    Api.adminErrors(20).then(setErrs).catch(() => setErrs([]));
    Api.backupStatus().then(setBk).catch(() => {});
  }
  useEffect(reload, []);

  async function clearErrs() {
    if (!confirm('Golești logul de erori?')) return;
    setBusy(true);
    try { await Api.clearAdminErrors(); showToast('Log golit'); setErrs([]); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function runBackup() {
    setBkBusy(true);
    try { const st = await Api.backupRun(); setBk(st); showToast(st?.ok ? ('Backup: ' + (st.target || 'rulat')) : ('Eșuat: ' + (st?.error || '')), !st?.ok); }
    catch (e: any) { showToast(e?.message || 'Eroare backup', true); } finally { setBkBusy(false); }
  }

  const rev = ov?.revenue || {};
  const health = ov?.totals?.health || ov?.platform?.health || {};

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dashboard platformă</div>
        <button class="h-btn" onClick={reload} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!err && (
          <>
            <div class="pf-kpis">
              <div class="pf-kpi"><div class="v">{counts ? n(counts.companies) : '—'}</div><div class="l">Companii</div></div>
              <div class="pf-kpi"><div class="v">{counts ? n(counts.users) : '—'}</div><div class="l">Utilizatori</div></div>
              <div class="pf-kpi"><div class="v">{counts ? n(counts.active_devices) : '—'}</div><div class="l">Vehicule active</div></div>
              <div class="pf-kpi"><div class="v">{counts ? n(counts.archived_devices) : '—'}</div><div class="l">Arhivate</div></div>
            </div>

            <div class="pf-card">
              <h3>Venituri (estimat)</h3>
              <div class="adm-kv"><span class="k">MRR (lunar)</span><span>{n(rev.mrr).toLocaleString('ro-RO')} lei</span></div>
              <div class="adm-kv"><span class="k">ARR (anual)</span><span>{n(rev.arr).toLocaleString('ro-RO')} lei</span></div>
              <div class="adm-kv"><span class="k">Abonamente active</span><span>{n(rev.active_subs)}</span></div>
            </div>

            <div class="pf-card">
              <h3>Sănătate flotă</h3>
              <div class="adm-kv"><span class="k">Online acum</span><span style="color:var(--accent)">{n(health.online)}</span></div>
              <div class="adm-kv"><span class="k">Offline 30+ zile</span><span style="color:var(--red)">{n(health.offline30)}</span></div>
              <div class="adm-kv"><span class="k">Semnal slab</span><span>{n(health.weak_signal)}</span></div>
              <div class="adm-kv"><span class="k">GSM mediu</span><span>{n(health.avg_gsm)}</span></div>
              <div class="adm-kv"><span class="k">Sateliți medii</span><span>{n(health.avg_sats)}</span></div>
              <div class="adm-kv"><span class="k">Fix sănătos</span><span>{n(health.healthy_fix_pct)}%</span></div>
            </div>

            {live && (
              <div class="pf-card">
                <h3>Server (live)</h3>
                <div class="adm-kv"><span class="k">Poziții live</span><span>{n(live.livePositions)}</span></div>
                <div class="adm-kv"><span class="k">Conexiuni active</span><span>{n(live.activeConnections)}</span></div>
                <div class="adm-kv"><span class="k">RAM (RSS)</span><span>{n(live.rss_mb)} MB</span></div>
                <div class="adm-kv"><span class="k">Heap</span><span>{n(live.heapUsed_mb)} MB</span></div>
                <div class="adm-kv"><span class="k">Uptime</span><span>{fmtUptime(live.uptime_s)}</span></div>
              </div>
            )}

            <div class="pf-card">
              <h3>Backup date</h3>
              {bk ? (
                <>
                  <div class="adm-kv"><span class="k">Ultimul automat</span><span>{bk.ok === false ? 'EȘUAT' : (bk.at ? fmtDT(bk.at) : 'nerulat încă')}</span></div>
                  <div class="adm-kv"><span class="k">Destinație</span><span style={'color:' + (bk.s3Configured ? 'var(--text-primary)' : '#f59e0b')}>{bk.s3Configured ? (String(bk.target || '').indexOf('S3') === 0 ? 'off-site (S3) ✓' : 'S3 configurat') : 'S3 neconfigurat'}</span></div>
                  {bk.sizeBytes ? <div class="adm-kv"><span class="k">Dimensiune</span><span>{Math.round(bk.sizeBytes / 1024)} KB{bk.encrypted ? ' · 🔒' : ''}</span></div> : null}
                  {bk.error ? <div style="color:var(--red);font-size:12px;padding:4px 0">{bk.error}</div> : null}
                </>
              ) : <div class="spin" style="margin:8px auto" />}
              <button class="btn btn-primary" style="margin-top:10px" disabled={bkBusy} onClick={runBackup}>{bkBusy ? 'Se rulează…' : 'Rulează backup off-site acum'}</button>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Descărcarea fișierului de backup se face din aplicația web (Dashboard platformă).</div>
            </div>

            <div class="pf-card">
              <h3>Erori recente{errs && errs.length > 0 ? <button class="adm-act danger" disabled={busy} onClick={clearErrs}><Icon name="trash" size={13} /> Golește</button> : null}</h3>
              {errs == null && <div class="spin" style="margin:8px auto" />}
              {errs && errs.length === 0 && <div style="color:var(--text-muted);font-size:13px">Nicio eroare recentă. 👍</div>}
              {errs && errs.map((e: any) => (
                <div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px">
                  <div style="color:var(--red);font-weight:600">{(e.method || '') + ' ' + (e.route || '') + (e.status ? ' · ' + e.status : '')}</div>
                  <div style="color:var(--text-muted)">{e.message}</div>
                  <div style="color:var(--text-muted);font-size:11px">{fmtDT(e.created_at)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
