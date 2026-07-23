import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { WorkSchedEditor } from '../components/WorkSchedEditor';
import './admin.css';

// Setări de COMPANIE: prețuri combustibil (manageFleet) + praguri agenți AI (manageUsers). Serverul scope-uiește pe req.companyId.
// Pragurile sunt DROPDOWN-uri cu valori predefinite, explicite (nu input liber) — aliniate cu panoul AGP de pe web.
type ThrOpt = [number | '', string];
const THRESHOLDS: { k: string; label: string; sub: string; min: number; max: number; options: ThrOpt[] }[] = [
  { k: 'offlineMin', label: 'Offline — alertă după', sub: 'RA Watch', min: 5, max: 1440, options: [[15, '15 minute'], [30, '30 minute'], [60, '1 oră (recomandat)'], [120, '2 ore'], [360, '6 ore'], [720, '12 ore']] },
  { k: 'fuelDropL', label: 'Scădere combustibil', sub: 'RA Watch', min: 1, max: 1000, options: [[10, '10 litri'], [15, '15 litri (recomandat)'], [20, '20 litri'], [30, '30 litri'], [50, '50 litri']] },
  { k: 'fuelTheftL', label: 'Furt combustibil — prag', sub: 'RA Watch', min: 1, max: 1000, options: [['', 'Dezactivat (recomandat)'], [15, '15 litri'], [20, '20 litri'], [30, '30 litri'], [50, '50 litri']] },
  { k: 'idleMaxMin', label: 'Ralanti prelungit', sub: 'RA Watch', min: 5, max: 1440, options: [[15, '15 minute'], [30, '30 minute'], [60, '1 oră'], [120, '2 ore (recomandat)'], [180, '3 ore']] },
  { k: 'ecoScoreMin', label: 'Scor eco minim', sub: 'RA Optimize', min: 0, max: 100, options: [[40, 'sub 40 — doar cazurile grave'], [50, 'sub 50 — relaxat'], [60, 'sub 60 (recomandat)'], [70, 'sub 70 — exigent'], [80, 'sub 80 — foarte exigent']] },
  { k: 'serviceSoonKm', label: 'Avertisment service (bord/CAN)', sub: 'RA Care', min: 100, max: 50000, options: [[500, '500 km înainte'], [1000, '1.000 km înainte'], [1500, '1.500 km înainte (recomandat)'], [2000, '2.000 km înainte'], [3000, '3.000 km înainte'], [5000, '5.000 km înainte']] },
  { k: 'careDaysLead', label: 'Avertisment scadențe (dată)', sub: 'RA Care + push', min: 1, max: 365, options: [[7, '7 zile înainte'], [14, '14 zile înainte (recomandat)'], [21, '3 săptămâni înainte'], [30, '30 zile înainte (o lună)'], [60, '60 zile înainte']] },
  { k: 'careKmLead', label: 'Avertisment scadențe (km)', sub: 'RA Care + push', min: 50, max: 50000, options: [[250, '250 km înainte'], [500, '500 km înainte (recomandat)'], [1000, '1.000 km înainte'], [1500, '1.500 km înainte'], [2000, '2.000 km înainte']] },
];

export function Settings() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const canFleet = !!me.value?.permissions?.manageFleet;
  const canUsers = !!me.value?.permissions?.manageUsers;
  const [fp, setFp] = useState<any>(null);
  const [fpForm, setFpForm] = useState<any>({ motorina: '', benzina: '', gpl: '' });
  const [thr, setThr] = useState<Record<string, any>>({});
  const [ws, setWs] = useState<any>(null);
  const [wsLoaded, setWsLoaded] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (canFleet) Api.fuelPrices().then((d: any) => { setFp(d); const c = d.company || {}; setFpForm({ motorina: c.motorina ?? '', benzina: c.benzina ?? '', gpl: c.gpl ?? '' }); }).catch(() => {});
    if (canUsers) Api.companySettings().then((s: any) => { setThr(Object.assign({}, s?.alert_thresholds)); setWs(s?.work_schedule || null); setWsLoaded(true); }).catch(() => setWsLoaded(true));
  }, []);

  async function saveFuel() {
    setBusy('fuel');
    const clean: any = {};
    ['motorina', 'benzina', 'gpl'].forEach((k) => { const v = fpForm[k]; if (v !== '' && v != null) { const n = Number(v); if (n > 0 && n < 100) clean[k] = n; } });
    try { await Api.setFuelPrices(clean); showToast('Prețuri salvate'); const d = await Api.fuelPrices(); setFp(d); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }
  async function refreshNat() { setBusy('refresh'); try { await Api.refreshFuelPrices(); const d = await Api.fuelPrices(); setFp(d); showToast('Media națională actualizată'); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); } }
  async function saveThr() {
    setBusy('thr');
    const clean: any = {};
    THRESHOLDS.forEach((t) => { const v = thr[t.k]; if (v === '' || v == null) { clean[t.k] = null; } else { const n = Number(v); if (Number.isFinite(n) && n >= t.min && n <= t.max) clean[t.k] = Math.round(n); } });
    try { await Api.saveCompanySettings({ alert_thresholds: clean }); showToast('Praguri salvate'); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }

  const auto = (fp && fp.auto) || {};

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Setări companie</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {canFleet && (
          <div class="pf-card">
            <h3>Prețuri combustibil (lei/L)</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Folosite la calculul costului în rapoarte. Lasă gol → se folosește media națională (auto, zilnic). Lanț: preț pe vehicul → aceste valori → media națională.{auto.motorina ? ' Național azi: motorină ' + auto.motorina + ' · benzină ' + (auto.benzina || '—') + ' · GPL ' + (auto.gpl || '—') + '.' : ''} Sursa: PretCarburant.ro</div>
            <div class="frm-row">
              <div class="fld"><label>Motorină</label><input type="number" value={fpForm.motorina} onInput={(e: any) => setFpForm({ ...fpForm, motorina: e.target.value })} placeholder={auto.motorina ? String(auto.motorina) : 'auto'} /></div>
              <div class="fld"><label>Benzină</label><input type="number" value={fpForm.benzina} onInput={(e: any) => setFpForm({ ...fpForm, benzina: e.target.value })} placeholder={auto.benzina ? String(auto.benzina) : 'auto'} /></div>
              <div class="fld"><label>GPL</label><input type="number" value={fpForm.gpl} onInput={(e: any) => setFpForm({ ...fpForm, gpl: e.target.value })} placeholder={auto.gpl ? String(auto.gpl) : 'auto'} /></div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
              <button class="btn btn-primary" style="flex:1" disabled={busy === 'fuel'} onClick={saveFuel}>{busy === 'fuel' ? '…' : 'Salvează prețurile'}</button>
              {isSuper && <button class="adm-act" disabled={busy === 'refresh'} onClick={refreshNat}><Icon name="refresh" size={14} /> Național</button>}
            </div>
          </div>
        )}

        {canUsers && (
          <div class="pf-card">
            <h3>Praguri agenți AI</h3>
            {THRESHOLDS.map((t) => {
              const cur = thr[t.k];
              const curStr = cur == null ? '' : String(cur);
              const inOpts = t.options.some(([v]) => String(v) === curStr);
              return (
                <div class="np-thr" style="padding:8px 0;border-bottom:1px solid var(--border)">
                  <label>{t.label}<br /><span style="font-size:11px;color:var(--text-muted)">{t.sub}</span></label>
                  <select value={curStr} onChange={(e: any) => setThr({ ...thr, [t.k]: e.target.value })} style="max-width:56%">
                    {curStr === '' && !t.options.some(([v]) => v === '') ? <option value="">Implicit (nesetat)</option> : null}
                    {curStr !== '' && !inOpts ? <option value={curStr}>{curStr} (curent)</option> : null}
                    {t.options.map(([v, l]) => <option value={String(v)}>{l}</option>)}
                  </select>
                </div>
              );
            })}
            <button class="btn btn-primary" style="margin-top:12px" disabled={busy === 'thr'} onClick={saveThr}>{busy === 'thr' ? '…' : 'Salvează pragurile'}</button>
          </div>
        )}

        {canUsers && wsLoaded && (
          <div class="pf-card">
            <h3><Icon name="clock" size={16} /> Program de lucru — supraveghere</h3>
            <WorkSchedEditor value={ws} onSave={(w: any) => Api.saveCompanySettings({ work_schedule: w }).then((r: any) => setWs(w))} />
          </div>
        )}

        {!canFleet && !canUsers && <div class="adm-empty">Nu ai acces la setări de companie.</div>}
      </div>
    </div>
  );
}
