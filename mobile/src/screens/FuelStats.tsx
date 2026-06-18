import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { ReportChart } from '../components/ReportChart';
import { Icon } from '../components/Icon';
import './reports.css';
import './stats.css';

type Period = 'today' | 'week' | 'month';
function range(p: Period) {
  const now = new Date(), from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'week') from.setDate(from.getDate() - 7);
  if (p === 'month') from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}
function dayLbl(k: string) { const p = String(k).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : k; }

export function FuelStats() {
  const [period, setPeriod] = useState<Period>('week');
  const [d, setD] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    const r = range(period);
    Api.fuelStats(r.from, r.to).then(setD).catch((e: any) => setErr(e?.message || 'Eroare')).finally(() => setLoading(false));
  }, [period]);

  const k = d?.kpi;
  const top = (d?.topConsumers || []).slice(0, 8);
  const trend = d ? { type: 'bar', title: 'Consum zilnic (litri)', labels: (d.series?.labels || []).map(dayLbl), datasets: [{ label: 'litri', data: d.series?.consumed || [] }] } : null;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Statistici consum</div>
      </header>
      <div class="content has-tabbar">
        <div class="rp-periods" style="padding:12px 14px">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button class={'rp-period' + (period === p ? ' on' : '')} onClick={() => setPeriod(p)}>{p === 'today' ? 'Azi' : p === 'week' ? '7 zile' : '30 zile'}</button>
          ))}
        </div>
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : err ? <div class="center-msg" style="color:var(--red)">{err}</div>
          : k ? (
            <>
              <div class="rp-summary">
                <div class="rp-kpi"><div class="v">{k.totalLiters} L</div><div class="l">Consum total{k.vehiclesEstimated ? ' · parțial estimat' : ''}</div></div>
                <div class="rp-kpi"><div class="v">{k.avgPer100} L/100km</div><div class="l">Consum mediu</div></div>
                <div class="rp-kpi"><div class="v">{k.fuelCost} RON</div><div class="l">Cost combustibil</div></div>
                <div class="rp-kpi"><div class="v">{k.idleLiters} L</div><div class="l">Ralanti · {k.idlePct}%</div></div>
              </div>
              {trend && (trend.datasets[0].data || []).some((x: number) => x > 0) && <ReportChart def={trend as any} />}
              {top.length > 0 && (
                <>
                  <div class="rp-table-title">Top consumatori</div>
                  <div style="padding:0 14px 20px">
                    {top.map((v: any) => (
                      <div class="st-listitem" style="border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
                        <Icon name="droplet" size={18} class="ic" color="var(--orange)" />
                        <div class="main"><div class="t">{v.name}{v.plate ? ` · ${v.plate}` : ''}</div>
                          <div class="s">{v.km} km{v.per100 != null ? ` · ${v.per100} L/100km` : ''}{v.estimated ? ' · est.' : ''}</div></div>
                        <div class="r">{v.liters} L</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : <div class="center-msg">Fără date.</div>}
      </div>
    </div>
  );
}
