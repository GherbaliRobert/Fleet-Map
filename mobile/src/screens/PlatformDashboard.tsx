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
  const [hl, setHl] = useState<any | null>(null);
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
    Api.adminHealth().then(setHl).catch(() => {});
  }
  useEffect(reload, []);

  async function clearErrs() {
    if (!confirm('Golești logul de erori?')) return;
    setBusy(true);
    try { await Api.clearAdminErrors(); showToast('Log golit'); setErrs([]); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function runBackup() {
    setBkBusy(true);
    try {
      const st = await Api.backupRun(); setBk(st);
      // ONESTITATE: `ok` spune doar că dump-ul s-a generat. Dacă `offsite` e fals, fișierul n-a plecat
      // nicăieri (filesystemul containerului e efemer) → raportăm asta ca PROBLEMĂ, nu ca succes.
      if (!st?.ok) showToast('Backup eșuat: ' + (st?.error || ''), true);
      else if (st.offsite) showToast('Backup salvat off-site ✓' + (st.encrypted ? ' (criptat)' : ' — NECRIPTAT'), !st.encrypted);
      else showToast('Dump generat, dar NU s-a salvat nicăieri (S3 neconfigurat)', true);
      Api.adminHealth().then(setHl).catch(() => {});
    }
    catch (e: any) { showToast(e?.message || 'Eroare backup', true); } finally { setBkBusy(false); }
  }
  const HCOL: Record<string, string> = { ok: 'var(--accent)', warn: '#f59e0b', crit: 'var(--red)', info: 'var(--text-muted)' };

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
                  <div class="adm-kv"><span class="k">Destinație</span><span style={'color:' + (bk.offsite ? 'var(--accent)' : 'var(--red)')}>{bk.offsite ? 'off-site (S3) ✓' : (bk.s3Configured ? 'S3 configurat, dar ultima rulare n-a urcat' : 'nicăieri — S3 neconfigurat')}</span></div>
                  <div class="adm-kv"><span class="k">Datele sunt protejate</span><span style={'color:' + (bk.protected ? 'var(--accent)' : 'var(--red)')}>{bk.protected ? 'da' : 'NU'}</span></div>
                  {bk.sizeBytes ? <div class="adm-kv"><span class="k">Dimensiune</span><span>{Math.round(bk.sizeBytes / 1024)} KB{bk.encrypted ? ' · 🔒 criptat' : ' · necriptat'}</span></div> : null}
                  {bk.warning ? <div style="color:var(--red);font-size:12px;line-height:1.45;padding:6px 0">⚠ {bk.warning}</div> : null}
                  {bk.error ? <div style="color:var(--red);font-size:12px;padding:4px 0">{bk.error}</div> : null}
                </>
              ) : <div class="spin" style="margin:8px auto" />}
              <button class="btn btn-primary" style="margin-top:10px" disabled={bkBusy} onClick={runBackup}>{bkBusy ? 'Se rulează…' : 'Rulează backup off-site acum'}</button>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Descărcarea fișierului de backup se face din aplicația web (Dashboard platformă).</div>
            </div>

            {hl && Array.isArray(hl.checks) && (
              <div class="pf-card">
                <h3>Stare producție</h3>
                {(() => {
                  const nCrit = hl.checks.filter((c: any) => c.level === 'crit').length;
                  const nWarn = hl.checks.filter((c: any) => c.level === 'warn').length;
                  const txt = nCrit ? (nCrit + (nCrit === 1 ? ' problemă critică' : ' probleme critice') + (nWarn ? ' · ' + nWarn + ' de verificat' : ''))
                    : (nWarn ? (nWarn + ' lucruri de verificat') : 'Totul e configurat pentru producție');
                  const col = nCrit ? 'var(--red)' : (nWarn ? '#f59e0b' : 'var(--accent)');
                  return <div style={'font-size:12.5px;font-weight:700;color:' + col + ';padding:2px 0 8px'}>{txt}</div>;
                })()}
                {hl.checks.map((c: any) => (
                  <div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)">
                    <span style={'width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto;background:' + (HCOL[c.level] || HCOL.info)} />
                    <div style="min-width:0;flex:1">
                      <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">{c.label}</div>
                      <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4;margin-top:1px">{c.detail}</div>
                    </div>
                  </div>
                ))}
                <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;margin:12px 0 4px">Workere de fundal</div>
                {(hl.workers || []).map((w: any) => (
                  <div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)">
                    <span style={'width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto;background:' + (w.lastError ? 'var(--red)' : (w.running ? '#f59e0b' : 'var(--accent)'))} />
                    <div style="min-width:0;flex:1">
                      <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">{w.label}{w.running ? ' (rulează acum)' : ''}</div>
                      <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4;margin-top:1px">
                        {w.lastAt ? fmtDT(w.lastAt) : 'încă n-a rulat'}
                        {w.lastMs != null ? ' · ' + (w.lastMs > 1000 ? Math.round(w.lastMs / 100) / 10 + 's' : w.lastMs + 'ms') : ''}
                        {w.skipped ? ' · ' + w.skipped + ' ture sărite' : ''}
                        {w.lastError ? ' · ' + w.lastError : ''}
                      </div>
                    </div>
                  </div>
                ))}
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Versiune {hl.server?.version} · {hl.server?.mode}{hl.db?.pool ? ' · conexiuni DB: ' + hl.db.pool.total : ''}</div>
              </div>
            )}

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
