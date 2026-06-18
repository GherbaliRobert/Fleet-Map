import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { ApiError } from '../api/client';
import { ReportChart } from '../components/ReportChart';
import { Icon } from '../components/Icon';
import { showToast } from '../app/store';
import './reports.css';

function fmtDate(s?: string) { try { return new Date(s!).toLocaleDateString('ro-RO'); } catch { return String(s || '').slice(0, 10); } }

function aiHtml(text: string) {
  const out: string[] = []; let inList = false;
  String(text || '').split('\n').forEach((ln) => {
    ln = ln.trim();
    if (!ln) { if (inList) { out.push('</ul>'); inList = false; } return; }
    if (/^(Pe scurt|Observații|Observatii|Recomandări|Recomandari|Concluzie)\s*:/.test(ln)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<div class="wk-h">' + ln.replace(/:$/, '') + '</div>');
    } else if (/^[-•]\s+/.test(ln)) {
      if (!inList) { out.push('<ul class="wk-ul">'); inList = true; }
      out.push('<li>' + ln.replace(/^[-•]\s+/, '') + '</li>');
    } else { if (inList) { out.push('</ul>'); inList = false; } out.push('<p>' + ln + '</p>'); }
  });
  if (inList) out.push('</ul>');
  return out.join('');
}

export function WeeklyReport() {
  const [data, setData] = useState<any | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true); setErr('');
    Api.weeklyLatest().then((d) => { setData(d.report || null); setCanManage(!!d.canManage); })
      .catch((e: any) => setErr(e instanceof ApiError && e.status === 403 ? 'forbidden' : (e?.message || 'Eroare')))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function gen() {
    setBusy(true);
    try { const r = await Api.weeklyGenerate(); setData(r.report); showToast('Raport generat'); }
    catch (e: any) { showToast(e?.message || 'Eroare la generare', true); }
    finally { setBusy(false); }
  }

  const k = data?.data?.kpi;
  const series = data?.data?.series;
  const top = (data?.data?.rankings?.topKm || []).slice(0, 7);
  const kmTrend = series ? { type: 'bar', title: 'Distanță zilnică (km)', labels: series.labels || [], datasets: [{ label: 'km', data: series.km || [] }] } : null;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Raport săptămânal</div>
      </header>
      <div class="content has-tabbar">
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : err === 'forbidden' ? <div class="center-msg">Raportul de flotă e disponibil doar pentru administratori și manageri.</div>
          : err ? <div class="center-msg" style="color:var(--red)">{err}</div>
          : !data ? (
            <div class="center-msg">
              <Icon name="calendar" size={34} color="var(--text-muted)" style="margin-bottom:10px" />
              <div>Niciun raport încă.</div>
              <div class="muted" style="font-size:13px;margin-top:6px">Se generează automat lunea.{canManage ? ' Sau acum:' : ''}</div>
              {canManage && <button class="btn btn-primary" style="margin-top:14px" onClick={gen} disabled={busy}>{busy ? 'Se generează…' : 'Generează acum'}</button>}
            </div>
          ) : (
            <>
              <div class="muted" style="padding:12px 14px 0;font-size:13px;font-weight:700">{fmtDate(data.period_from)} — {fmtDate(data.period_to)}</div>
              {k && (
                <div class="rp-summary">
                  <div class="rp-kpi"><div class="v">{k.vehiclesActive}/{k.vehiclesTotal}</div><div class="l">Vehicule active</div></div>
                  <div class="rp-kpi"><div class="v">{k.totalKm} km</div><div class="l">Distanță totală</div></div>
                  <div class="rp-kpi"><div class="v">{k.totalMovingH} h</div><div class="l">Ore mers · {k.totalTrips} curse</div></div>
                  <div class="rp-kpi"><div class="v">{k.totalIdleH} h</div><div class="l">Ralanti</div></div>
                  {k.totalFuel ? <div class="rp-kpi"><div class="v">{k.totalFuel} L</div><div class="l">Consum · {k.fuelCost} RON</div></div> : null}
                </div>
              )}
              {data.ai_analysis && (
                <div style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:12px;margin:0 14px 14px;padding:14px">
                  <div style="font-weight:800;margin-bottom:8px"><Icon name="robot" size={16} color="var(--accent)" /> Analiză automată</div>
                  <div class="wk-body" style="font-size:13.5px;line-height:1.55;color:var(--text-secondary)" dangerouslySetInnerHTML={{ __html: aiHtml(data.ai_analysis) }} />
                </div>
              )}
              {kmTrend && (kmTrend.datasets[0].data || []).some((x: number) => x > 0) && <ReportChart def={kmTrend as any} />}
              {top.length > 0 && (
                <>
                  <div class="rp-table-title">Top vehicule după km</div>
                  <div style="padding:0 14px 24px">
                    {top.map((v: any) => (
                      <div class="st-listitem" style="border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
                        <Icon name="truck" size={18} class="ic" />
                        <div class="main"><div class="t">{v.name}{v.plate ? ` · ${v.plate}` : ''}</div></div>
                        <div class="r">{v.km} km</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
      </div>
    </div>
  );
}
