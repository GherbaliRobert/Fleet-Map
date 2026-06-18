import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { fmtDateTime, fmtDuration } from '../lib/format';
import { Icon } from '../components/Icon';
import './detail.css';
import './route.css';

type Period = 'today' | 'yesterday' | 'week';
function range(p: Period): { from: string; to: string } {
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { from.setDate(from.getDate() - 1); const to = new Date(from); to.setHours(23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }
  if (p === 'week') from.setDate(from.getDate() - 7);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function ReportScreen() {
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  const [period, setPeriod] = useState<Period>('today');
  const [rep, setRep] = useState<any | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRep(null); setErr('');
    const { from, to } = range(period);
    Api.report(imei, from, to).then(setRep).catch((e) => setErr(e?.message || 'Eroare'));
  }, [period, imei]);

  const trips: any[] = (rep && (rep.trips || rep.rows)) || [];
  const summary: Record<string, any> = (rep && rep.summary) || {};
  const totalKm = rep && (rep.totalKm ?? rep.distanceKm ?? summary.totalKm);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Raport</div>
      </header>
      <div class="rt-periods">
        {(['today', 'yesterday', 'week'] as Period[]).map((p) => (
          <button class={'rt-period' + (period === p ? ' on' : '')} onClick={() => setPeriod(p)}>{p === 'today' ? 'Azi' : p === 'yesterday' ? 'Ieri' : '7 zile'}</button>
        ))}
      </div>
      <div class="content d-content">
        {err ? <div class="center-msg" style="color:var(--red)">{err}</div>
          : rep === null ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : (
            <>
              {(totalKm != null || Object.keys(summary).length > 0) && (
                <div class="card d-stats">
                  <h3>Sumar</h3>
                  {totalKm != null && <div class="kv"><span class="k">Distanță</span><span class="v">{Number(totalKm).toFixed(1)} km</span></div>}
                  {Object.entries(summary).map(([k, v]) => <div class="kv"><span class="k">{k}</span><span class="v">{String(v)}</span></div>)}
                </div>
              )}
              {trips.length > 0 ? (
                <div class="card d-stats">
                  <h3>Curse ({trips.length})</h3>
                  {trips.slice(0, 60).map((t: any) => (
                    <div class="kv" style="flex-direction:column;align-items:stretch;gap:3px">
                      <div style="display:flex;justify-content:space-between"><span class="k">{fmtDateTime(t.start || t.startTime || t.start_time)}</span>
                        <span class="v">{t.distanceKm != null ? t.distanceKm + ' km' : (t.km != null ? t.km + ' km' : '')}</span></div>
                      <div style="display:flex;justify-content:space-between"><span class="k" style="font-size:12px">{t.durationSec != null ? fmtDuration(t.durationSec) : ''}{t.maxSpeed != null ? ` · max ${t.maxSpeed} km/h` : ''}</span></div>
                    </div>
                  ))}
                </div>
              ) : (totalKm == null && Object.keys(summary).length === 0) && (
                <div class="center-msg">Fără activitate în perioada selectată.</div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
