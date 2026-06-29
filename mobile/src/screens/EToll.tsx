import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './admin.css';

// E-Toll & Roviniete (demo): estimare cost taxe de drum din km (CAN). Scope companie (withCompany pe server).
export function EToll() {
  const loc = useLocation();
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { Api.etollCosts(undefined, 30).then(setData).catch((e: any) => setErr(e?.status === 403 ? 'Modul indisponibil pentru contul tău.' : (e?.message || 'Eroare la încărcare'))); }, []);
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">E-Toll & Roviniete</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!data && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {data && (
          <>
            <div class="pf-kpis">
              <div class="pf-kpi"><div class="v">{Math.round(data.totalKm || 0).toLocaleString('ro-RO')}</div><div class="l">km ({data.periodDays} zile)</div></div>
              <div class="pf-kpi"><div class="v">€{Math.round(data.totalEur || 0)}</div><div class="l">cost taxe estimat</div></div>
            </div>
            <div class="pf-card">
              <h3>Pe țară</h3>
              {(data.perCountry || []).map((c: any) => (
                <div class="adm-kv"><span class="k">{c.country} ({c.code})</span><span>{Math.round(c.km).toLocaleString('ro-RO')} km · €{Number(c.costEur).toFixed(2)}</span></div>
              ))}
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);padding:4px 6px">{data.source}</div>
          </>
        )}
      </div>
    </div>
  );
}
