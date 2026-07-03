import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';

// E-Toll & Roviniete (demo/real): estimare cost taxe din km (CAN) + furnizor extern. Paritate cu web (openEtollDemo):
// badge Demo/Real din /api/demo-modules/config; furnizorul se schimbă doar de super-admin (PUT /api/etoll/provider).
export function EToll() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [data, setData] = useState<any | null>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [prov, setProv] = useState<any>({ providers: [], selected: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setErr('');
    Api.etollCosts(undefined, 30).then(setData).catch((e: any) => setErr(e?.status === 403 ? 'Modul indisponibil pentru contul tău.' : (e?.message || 'Eroare la încărcare')));
    Api.demoConfig().then(setCfg).catch(() => {});
    Api.etollProviders().then(setProv).catch(() => {});
  }
  useEffect(load, []);

  async function setProvider(p: string) {
    setSaving(true);
    try {
      await Api.etollSetProvider(p);
      showToast(p ? ('Furnizor: ' + p) : 'Furnizor deconectat');
      const [c, cf, pr] = await Promise.all([Api.etollCosts(undefined, 30), Api.demoConfig(), Api.etollProviders()]);
      setData(c); setCfg(cf); setProv(pr);
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  const mode = (cfg && cfg.etoll && cfg.etoll.mode) || 'demo';
  const isReal = mode === 'real';
  const badgeCol = isReal ? 'var(--accent)' : '#f59e0b';

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">E-Toll & Roviniete</div>
        <button class="h-btn" onClick={load} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style={`font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:3px 9px;border-radius:999px;background:${badgeCol}22;color:${badgeCol}`}>{isReal ? 'REAL' : 'DEMO'}</span>
          <span style="font-size:12px;color:var(--text-muted)">{isReal ? 'Furnizor extern conectat' : 'Estimare informativă'}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px">Estimare a costurilor de taxare pe baza km parcurși{isSuper ? '. Alege furnizorul extern mai jos.' : '. Configurarea furnizorului se face de super-admin.'}</div>

        <div class="pf-card">
          <h3>Furnizor extern</h3>
          {isSuper ? (
            <select value={prov.selected || ''} disabled={saving} onChange={(e: any) => setProvider(e.target.value)} style="width:100%;padding:9px 10px;border-radius:8px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);font-family:inherit">
              <option value="">— niciunul —</option>
              {(prov.providers || []).map((p: string) => <option value={p}>{p}</option>)}
            </select>
          ) : (
            <div class="adm-kv"><span class="k">Furnizor</span><span>{prov.selected || '— niciunul —'}</span></div>
          )}
        </div>

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
