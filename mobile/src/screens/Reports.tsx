import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import type { ReportTypeInfo, ReportResult, ReportOpts } from '../api/endpoints';
import { vehicles, showToast, lastNotif } from '../app/store';
import { Icon } from '../components/Icon';
import { ReportChart } from '../components/ReportChart';
import { InsightPanel } from '../components/InsightPanel';
import { exportReport, exportHistoryReport } from '../lib/export';
import { raCauta } from '../lib/format';
import './reports.css';
import '../screens/detail.css'; // pentru .sheet*

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
function range(p: Period): { from: string; to: string } {
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { from.setDate(from.getDate() - 1); const to = new Date(from); to.setHours(23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }
  if (p === 'week') from.setDate(from.getDate() - 7);
  if (p === 'month') from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}
const PERIOD_LABEL: Record<Period, string> = { today: 'Azi', yesterday: 'Ieri', week: '7 zile', month: '30 zile', custom: 'Interval…' };
// Zilele săptămânii pentru filtrul zile/ore (token server = mon..sun).
const WDAYS: { k: string; l: string }[] = [{ k: 'mon', l: 'Lu' }, { k: 'tue', l: 'Ma' }, { k: 'wed', l: 'Mi' }, { k: 'thu', l: 'Jo' }, { k: 'fri', l: 'Vi' }, { k: 'sat', l: 'Sâ' }, { k: 'sun', l: 'Du' }];
// YYYY-MM-DD → DD.MM (pentru axa graficului de consum zilnic)
function dayLbl(d: string) { const p = String(d).slice(5).split('-'); return p.length === 2 ? p[1] + '.' + p[0] : d; }
// data generării unui raport din istoric
function fmtHist(s: string) { try { return new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } }

export function Reports() {
  const loc = useLocation();
  const [cats, setCats] = useState<{ key: string; label: string }[]>([]);
  const [types, setTypes] = useState<ReportTypeInfo[]>([]);
  const [type, setType] = useState('trips');
  const [period, setPeriod] = useState<Period>('week');
  const [sel, setSel] = useState<string[]>([]); // gol = toată flota
  const [sheet, setSheet] = useState<'' | 'type' | 'veh' | 'hist'>('');
  const [tq, setTq] = useState(''); const [vq, setVq] = useState('');
  const [res, setRes] = useState<ReportResult | null>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  const [histId, setHistId] = useState<number | null>(null); // != null → afișăm un raport DIN istoric
  const [histBusy, setHistBusy] = useState(false);
  const [fuelSeries, setFuelSeries] = useState<any | null>(null); // grafic consum zilnic (time-series) pt. raportul de consum
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<{ id: string; label: string; status: 'running' | 'done' | 'error'; historyId?: number } | null>(null); // badge „se generează în fundal"
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');
  const [tab, setTab] = useState<'rapoarte' | 'insight'>('rapoarte');
  // ── Opțiuni de raport (per tip) + interval personalizat + filtru zile/ore ──
  const [showOpts, setShowOpts] = useState(false);
  const [customFrom, setCustomFrom] = useState(''); // YYYY-MM-DD
  const [customTo, setCustomTo] = useState('');
  const [sampleSec, setSampleSec] = useState(300);  // Analitic: 0=toate · 30 · 60 · 300 (5 min, implicit ca pe web)
  const [osm, setOsm] = useState(false);            // Depășiri: limită reală drum (OSM)
  const [osmOver, setOsmOver] = useState(20);       // Depășiri OSM: +X km/h peste limită (0=toate)
  const [geoAddr, setGeoAddr] = useState(true);     // EcoDrive: Adrese exacte (true) / Coordonate rapide (false)
  const [zoneMin, setZoneMin] = useState(2);        // Vizite: durată minimă vizită (min)
  const [dueAll, setDueAll] = useState(true);       // Scadențe: „Tot" (toate scadențele, fără orizont)
  const [fdays, setFdays] = useState<string[]>([]); // filtru zile săptămână (mon..sun); gol = toate
  const [hFrom, setHFrom] = useState('');           // interval orar HH:MM
  const [hTo, setHTo] = useState('');
  const [pvOpen, setPvOpen] = useState<number>(-1); // secțiunea „pe vehicul" deschisă (-1 = niciuna)

  // Perioada efectivă (gestionează intervalul personalizat).
  function curRange(): { from: string; to: string } {
    if (period === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom + 'T00:00:00').toISOString(), to: new Date(customTo + 'T23:59:59').toISOString() };
    }
    return range(period === 'custom' ? 'week' : period);
  }
  // Opțiunile trimise serverului, în funcție de tipul de raport ales.
  function buildOpts(): ReportOpts {
    const o: ReportOpts = {};
    if (type === 'analytic' && sampleSec) o.sampleSec = sampleSec;
    if (type === 'speeding' && osm) { o.osm = 1; o.osmOver = osmOver; }
    if ((type === 'ecodrive' || type === 'ecodrive_drivers') && !geoAddr) o.geo = 0;
    if (type === 'geofence') o.zoneMin = zoneMin;
    if (type === 'due' && dueAll) o.all = 1; // implicit: arată TOATE scadențele (nu ascunde cele viitoare)
    if (fdays.length && fdays.length < 7) o.days = fdays.join(',');
    if (hFrom && hTo) { o.hoursFrom = hFrom; o.hoursTo = hTo; }
    return o;
  }
  function toggleDay(k: string) { setFdays((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k]); }

  useEffect(() => {
    Api.reportTypes().then((d) => { setCats(d.categories || []); setTypes(d.reports || []); }).catch(() => {});
    const pre = (loc.query && (loc.query as any).imei) || '';
    if (pre) setSel(String(pre).split(',').filter(Boolean));
    // Deschis dintr-o notificare de raport (?histId=) → încarcă raportul din Istoric și îl randează inline.
    const hq = (loc.query && (loc.query as any).histId) || '';
    if (hq) { const hid = Number(hq); if (Number.isFinite(hid)) Api.reportHistoryItem(hid).then((h: any) => { const rep = h && (h.report || h.data); if (rep) { setRes(rep); setHistId(hid); } }).catch(() => {}); }
  }, []);

  const typeLabel = useMemo(() => (types.find((t) => t.type === type)?.label || 'Raport'), [types, type]);
  const list = vehicles.value;
  const selLabel = sel.length === 0 ? 'Toată flota' : sel.length === 1
    ? (list.find((v) => v.imei === sel[0])?.name || sel[0])
    : `${sel.length} vehicule`;

  // Graficul de consum zilnic (doar pt. raportul „consumption"), din /api/fuel-stats.
  async function loadFuelSeries() {
    if (type !== 'consumption') return;
    try {
      const r = curRange();
      const fs: any = await Api.fuelStats(r.from, r.to, sel.length ? sel : undefined);
      const s = fs && fs.series;
      if (s && s.labels && s.labels.length) setFuelSeries({ type: 'line', title: 'Consum zilnic (litri)', labels: s.labels.map(dayLbl), datasets: [{ label: 'litri', data: s.consumed || [] }] });
    } catch { /* fuel-stats opțional */ }
  }

  // Generarea rulează în FUNDAL pe server: badge cu spinner + „Lasă în fundal"; la finalizare vine o notificare
  // report_ready (WS/push) care rezolvă badge-ul → raportul se randează inline + apare în notificări.
  async function generate() {
    if (job && job.status === 'running') return;
    setErr(''); setRes(null); setFuelSeries(null); setHistId(null); setLoading(true);
    const r = curRange();
    const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    setJob({ id, label: typeLabel, status: 'running' });
    try {
      await Api.runReportBg(type, r.from, r.to, sel.length ? sel : undefined, id, buildOpts());
    } catch (e: any) { setJob(null); setErr(e?.message || 'Eroare la generare'); }
    finally { setLoading(false); }
  }

  // Rezolvă badge-ul când sosește notificarea report_ready cu același jobId (doar dacă badge-ul e încă activ).
  useEffect(() => {
    const n = lastNotif.value; if (!n || !job || job.status !== 'running') return;
    const d = n.data || {};
    if (n.type === 'report_ready' && d.jobId && d.jobId === job.id) {
      const hid = d.historyId != null ? Number(d.historyId) : undefined;
      setJob({ ...job, status: 'done', historyId: hid });
      if (hid != null) {
        Api.reportHistoryItem(hid).then((h: any) => { const rep = h && (h.report || h.data); if (rep) { setRes(rep); setHistId(hid); loadFuelSeries(); } }).catch(() => {});
      }
      setTimeout(() => setJob((j) => (j && j.status === 'done' ? null : j)), 7000); // badge-ul dispare singur (raportul rămâne randat)
    } else if (n.type === 'report_error' && d.jobId === job.id) {
      setJob({ ...job, status: 'error' }); setErr(n.body || 'Raport eșuat');
      setTimeout(() => setJob((j) => (j && j.status === 'error' ? null : j)), 10000);
    }
  }, [lastNotif.value]);

  function toggleVeh(imei: string) {
    setSel((cur) => cur.includes(imei) ? cur.filter((x) => x !== imei) : [...cur, imei]);
  }

  async function doExport(format: 'pdf' | 'xlsx') {
    if (exporting) return;
    setExporting(format);
    try {
      if (histId != null) await exportHistoryReport(histId, type, format); // raport din istoric → export din snapshot
      else { const r = curRange(); await exportReport(type, r.from, r.to, sel.length ? sel : undefined, format, buildOpts()); }
    }
    catch (e: any) { showToast(e?.message || 'Export indisponibil', true); }
    finally { setExporting(''); }
  }

  // ── Istoric rapoarte (izolat pe user pe server) ──
  async function openHist() {
    setSheet('hist'); setHistBusy(true);
    try { setHist(await Api.reportHistory()); } catch { setHist([]); } finally { setHistBusy(false); }
  }
  async function viewHist(item: any) {
    setSheet(''); setErr(''); setLoading(true); setRes(null); setFuelSeries(null);
    try {
      const d: any = await Api.reportHistoryItem(item.id);
      setRes(d.report); setHistId(item.id); if (item.report_type) setType(item.report_type);
    } catch (e: any) { setErr(e?.message || 'Raport indisponibil (posibil expirat)'); }
    finally { setLoading(false); }
  }
  // Descărcare directă (Excel/PDF) dintr-un rând de istoric, fără a-l deschide întâi.
  const [histExp, setHistExp] = useState<string>(''); // 'id-fmt' în curs
  async function histExport(h: any, fmt: 'xlsx' | 'pdf', ev: any) {
    ev.stopPropagation();
    if (histExp) return;
    setHistExp(h.id + '-' + fmt);
    try { await exportHistoryReport(h.id, h.report_type, fmt); }
    catch (e: any) { showToast(e?.message || 'Export indisponibil', true); }
    finally { setHistExp(''); }
  }
  async function delHist(id: number, ev: any) {
    ev.stopPropagation();
    try {
      await Api.deleteReportHistoryItem(id);
      setHist((h) => (h || []).filter((x) => x.id !== id));
      if (histId === id) { setRes(null); setHistId(null); }
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge', true); }
  }

  const filteredTypes = (catKey: string) => types.filter((t) => t.cat === catKey && (!tq || t.label.toLowerCase().includes(tq.toLowerCase())));
  const filteredVeh = list.filter((v) => raCauta(vq, v.name, v.plate, v.imei))
    .slice().sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei));

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Rapoarte</div><button class="h-btn" onClick={openHist} aria-label="Istoric rapoarte"><Icon name="clock" /></button></header>
      <div class="rp-tabs">
        <button class={'rp-tab' + (tab === 'rapoarte' ? ' on' : '')} onClick={() => setTab('rapoarte')}><Icon name="report" size={16} /> Rapoarte</button>
        <button class={'rp-tab' + (tab === 'insight' ? ' on' : '')} onClick={() => setTab('insight')}><Icon name="sparkles" size={16} /> RA Insight</button>
      </div>
      <div class="content has-tabbar">
        {tab === 'insight' ? <InsightPanel /> : (<>
        <div class="rp-controls">
          <button class="rp-pick" onClick={() => { setTq(''); setSheet('type'); }}>
            <Icon name="report" size={20} class="ic" />
            <div class="mn"><div class="lbl">Tip raport</div><div class="val">{typeLabel}</div></div>
            <Icon name="chevronR" size={18} color="var(--text-muted)" />
          </button>
          <button class="rp-pick" onClick={() => { setVq(''); setSheet('veh'); }}>
            <Icon name="car" size={20} class="ic" />
            <div class="mn"><div class="lbl">Vehicule</div><div class="val">{selLabel}</div></div>
            <Icon name="chevronR" size={18} color="var(--text-muted)" />
          </button>
          {type === 'due' ? (
            <div style="font-size:12.5px;color:var(--text-muted);background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:10px 12px">Raport de stare curentă — arată toate scadențele (documente + service).</div>
          ) : (
            <>
              <div class="rp-periods">
                {(['today', 'yesterday', 'week', 'month', 'custom'] as Period[]).map((p) => (
                  <button class={'rp-period' + (period === p ? ' on' : '')} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
                ))}
              </div>
              {period === 'custom' && (
                <div style="display:flex;gap:8px;margin-top:8px">
                  <label style="flex:1;font-size:11px;color:var(--text-muted)">De la<input type="date" value={customFrom} max={customTo || undefined} onInput={(e) => setCustomFrom((e.target as HTMLInputElement).value)} style="width:100%;margin-top:3px;background:var(--bg-dark);border:1px solid var(--border);border-radius:9px;padding:8px;color:var(--text-primary);font-family:inherit;font-size:13px" /></label>
                  <label style="flex:1;font-size:11px;color:var(--text-muted)">Până la<input type="date" value={customTo} min={customFrom || undefined} onInput={(e) => setCustomTo((e.target as HTMLInputElement).value)} style="width:100%;margin-top:3px;background:var(--bg-dark);border:1px solid var(--border);border-radius:9px;padding:8px;color:var(--text-primary);font-family:inherit;font-size:13px" /></label>
                </div>
              )}
            </>
          )}
          {/* Opțiuni de raport: eșantionare / OSM / locație / durată + filtru zile-ore (orice raport) */}
          <button onClick={() => setShowOpts((s) => !s)} style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:10px;background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 13px;color:var(--text-primary);font-weight:700;font-size:13px;font-family:inherit">
            <span>⚙ Opțiuni</span><span style="color:var(--text-muted)">{showOpts ? '▲' : '▼'}</span>
          </button>
          {showOpts && (
            <div style="background:var(--bg-panel);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;margin-top:-1px;padding:12px 13px;display:flex;flex-direction:column;gap:14px">
              {type === 'analytic' && (
                <div>
                  <div class="rp-opt-lbl">Detaliu (eșantionare)</div>
                  <div class="rp-seg">
                    {([[300, '5 min'], [60, '1 min'], [30, '30 sec'], [0, 'Toate']] as [number, string][]).map(([v, l]) => (
                      <button class={'rp-seg-b' + (sampleSec === v ? ' on' : '')} onClick={() => setSampleSec(v)}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {type === 'speeding' && (
                <div>
                  <label class="rp-opt-row"><span>Limită reală drum (OSM)</span><input type="checkbox" checked={osm} onChange={(e) => setOsm((e.target as HTMLInputElement).checked)} /></label>
                  {osm && (
                    <div style="margin-top:8px">
                      <div class="rp-opt-lbl">Arată doar peste</div>
                      <div class="rp-seg">
                        {([[0, 'Toate'], [10, '+10'], [20, '+20'], [30, '+30']] as [number, string][]).map(([v, l]) => (
                          <button class={'rp-seg-b' + (osmOver === v ? ' on' : '')} onClick={() => setOsmOver(v)}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(type === 'ecodrive' || type === 'ecodrive_drivers') && (
                <div>
                  <div class="rp-opt-lbl">Locație</div>
                  <div class="rp-seg">
                    <button class={'rp-seg-b' + (geoAddr ? ' on' : '')} onClick={() => setGeoAddr(true)}>Adrese exacte</button>
                    <button class={'rp-seg-b' + (!geoAddr ? ' on' : '')} onClick={() => setGeoAddr(false)}>Coordonate (rapid)</button>
                  </div>
                </div>
              )}
              {type === 'geofence' && (
                <label class="rp-opt-row"><span>Durată min. vizită (min)</span><input type="number" min={0} value={zoneMin} onInput={(e) => setZoneMin(Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0))} style="width:66px;background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:6px;color:var(--text-primary);font-family:inherit;text-align:center" /></label>
              )}
              <div>
                <div class="rp-opt-lbl">Doar în zilele</div>
                <div class="rp-days">
                  {WDAYS.map((d) => <button class={'rp-day' + (fdays.includes(d.k) ? ' on' : '')} onClick={() => toggleDay(d.k)}>{d.l}</button>)}
                </div>
              </div>
              <div>
                <div class="rp-opt-lbl">Interval orar</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="time" value={hFrom} onInput={(e) => setHFrom((e.target as HTMLInputElement).value)} style="flex:1;background:var(--bg-dark);border:1px solid var(--border);border-radius:9px;padding:8px;color:var(--text-primary);font-family:inherit" />
                  <span style="color:var(--text-muted)">–</span>
                  <input type="time" value={hTo} onInput={(e) => setHTo((e.target as HTMLInputElement).value)} style="flex:1;background:var(--bg-dark);border:1px solid var(--border);border-radius:9px;padding:8px;color:var(--text-primary);font-family:inherit" />
                  {(hFrom || hTo) ? <button onClick={() => { setHFrom(''); setHTo(''); }} style="background:transparent;border:none;color:var(--text-muted);font-size:14px">✕</button> : null}
                </div>
              </div>
            </div>
          )}
          <button class="btn btn-primary btn-block rp-gen" onClick={generate} disabled={loading || job?.status === 'running' || (period === 'custom' && (!customFrom || !customTo))}>
            {(loading || job?.status === 'running') ? <span class="spin" style="border-top-color:#06210F" /> : <><Icon name="chart" size={18} /> Generează raport</>}
          </button>
          {job && (
            <div style="display:flex;align-items:center;gap:10px;background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-top:10px">
              {job.status === 'running' ? <span class="spin" style="width:18px;height:18px" />
                : job.status === 'done' ? <Icon name="check" size={18} color="var(--accent)" />
                  : <Icon name="alert" size={18} color="var(--red)" />}
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">{job.status === 'running' ? 'Se generează raportul…' : job.status === 'done' ? 'Raport generat ✓' : 'Raport eșuat'}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">{job.label}{job.status === 'running' ? ' · poți continua, te anunțăm când e gata' : job.status === 'done' ? ' · gata în Istoric rapoarte' : ''}</div>
              </div>
              <button style="background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:6px 10px;font-size:12px;white-space:nowrap" onClick={() => setJob(null)}>{job.status === 'running' ? 'Lasă în fundal' : 'Închide'}</button>
            </div>
          )}
        </div>

        {err && <div class="center-msg" style="color:var(--red)">{err}</div>}

        {res && (
          <>
            {histId != null && <div class="hist-badge"><Icon name="clock" size={13} /> Raport din istoric — regenerează pentru date la zi</div>}
            <div class="rp-export">
              <button class="rp-exp-btn" disabled={!!exporting} onClick={() => doExport('pdf')}>
                {exporting === 'pdf' ? <span class="spin" /> : <Icon name="report" size={16} />} PDF
              </button>
              <button class="rp-exp-btn" disabled={!!exporting} onClick={() => doExport('xlsx')}>
                {exporting === 'xlsx' ? <span class="spin" /> : <Icon name="fileBar" size={16} />} Excel
              </button>
            </div>
            {res.summary && Object.keys(res.summary).length > 0 && (
              <div class="rp-summary">
                {Object.entries(res.summary).map(([k, v]) => <div class="rp-kpi"><div class="v">{String(v)}</div><div class="l">{k}</div></div>)}
              </div>
            )}
            {fuelSeries && <ReportChart def={fuelSeries} />}
            {(res.charts || []).map((c) => <ReportChart def={c} />)}
            {res.rows && res.rows.length > 0 ? (
              <>
                <div class="rp-table-title">Detalii ({res.rows.length})</div>
                <div class="rp-table-wrap">
                  <table class="rp-table">
                    <thead><tr>{(res.columns || []).map((c) => <th>{c}</th>)}</tr></thead>
                    <tbody>{res.rows.slice(0, 300).map((row) => <tr>{row.map((cell) => <td>{cell == null ? '' : String(cell)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </>
            ) : (!res.charts || res.charts.length === 0) && <div class="center-msg">Fără date în perioada selectată.</div>}
            {res.perVehicle && res.perVehicle.length > 0 && (
              <div style="margin-top:14px">
                <div class="rp-table-title">Pe vehicul ({res.perVehicle.length})</div>
                {res.perVehicle.map((pv, i) => {
                  const nm = pv.vehicul || pv.name || pv.imei || ('Vehicul ' + (i + 1));
                  const open = pvOpen === i;
                  const cols = (pv as any).columns || res.columns || [];
                  return (
                    <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden">
                      <button onClick={() => setPvOpen(open ? -1 : i)} style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 13px;background:transparent;border:none;color:var(--text-primary);font-weight:700;font-size:14px;font-family:inherit">
                        <span>{nm}</span><span style="color:var(--text-muted)">{open ? '▲' : '▼'}</span>
                      </button>
                      {open && (
                        <div style="padding:0 13px 13px">
                          {pv.summary && pv.summary.length > 0 && (
                            <div class="rp-summary" style="margin-top:0">
                              {pv.summary.map(([k, v]) => <div class="rp-kpi"><div class="v">{String(v)}</div><div class="l">{k}</div></div>)}
                            </div>
                          )}
                          {(pv.charts || []).map((c) => <ReportChart def={c} />)}
                          {pv.rows && pv.rows.length > 0 && (
                            <div class="rp-table-wrap">
                              <table class="rp-table">
                                <thead><tr>{cols.map((c: string) => <th>{c}</th>)}</tr></thead>
                                <tbody>{pv.rows.slice(0, 200).map((row) => <tr>{row.map((cell) => <td>{cell == null ? '' : String(cell)}</td>)}</tr>)}</tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {res.legend && res.legend.items && res.legend.items.length > 0 && (
              <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 13px;margin-top:12px">
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);margin-bottom:8px">{res.legend.title || 'Legendă'}</div>
                {res.legend.items.map(([term, desc]) => (
                  <div style="display:flex;gap:8px;padding:4px 0;font-size:12.5px;line-height:1.4"><b style="flex:0 0 auto;color:var(--text-primary)">{term}</b><span style="color:var(--text-muted)">{desc}</span></div>
                ))}
              </div>
            )}
          </>
        )}
        </>)}
      </div>

      {/* Sheet: tip raport */}
      {sheet === 'type' && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(''); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Alege tipul de raport</b><button class="h-btn" onClick={() => setSheet('')}><Icon name="x" /></button></div>
            <div class="sh-search"><Icon name="search" size={18} /><input placeholder="Caută tip raport" value={tq} onInput={(e) => setTq((e.target as HTMLInputElement).value)} /></div>
            <div class="sheet-body">
              {cats.map((cat) => {
                const items = filteredTypes(cat.key); if (!items.length) return null;
                return <div><div class="sh-cat">{cat.label}</div>
                  {items.map((t) => (
                    <button class={'sh-item' + (type === t.type ? ' on' : '')} onClick={() => { setType(t.type); setSheet(''); }}>
                      <span class="nm" style="display:flex;flex-direction:column;gap:2px;align-items:flex-start">
                        <span>{t.label}</span>
                        {t.desc ? <span style="font-size:11.5px;color:var(--text-muted);font-weight:500;line-height:1.35">{t.desc}</span> : null}
                      </span>
                      {type === t.type && <Icon name="check" size={18} />}
                    </button>
                  ))}</div>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sheet: vehicule (multi-select) */}
      {sheet === 'veh' && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(''); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Alege vehiculele</b><button class="h-btn" onClick={() => setSheet('')}><Icon name="x" /></button></div>
            <div class="sh-search"><Icon name="search" size={18} /><input placeholder="Caută vehicul" value={vq} onInput={(e) => setVq((e.target as HTMLInputElement).value)} /></div>
            <div class="sh-actions"><a onClick={() => setSel([])}>Toată flota</a><a onClick={() => setSel(list.map((v) => v.imei))}>Selectează tot</a><a onClick={() => setSel([])}>Golește</a></div>
            <div class="sheet-body">
              {filteredVeh.map((v) => {
                const on = sel.includes(v.imei);
                return (
                  <button class={'sh-item' + (on ? ' on' : '')} onClick={() => toggleVeh(v.imei)}>
                    <span class="sh-check">{on && <Icon name="check" size={14} color="#06210F" />}</span>
                    <span class="nm">{v.name || v.imei}{v.plate ? <span class="sh-plate"> · {v.plate}</span> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sheet: istoric rapoarte (per utilizator, retenție 7 zile) */}
      {sheet === 'hist' && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(''); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Istoric rapoarte</b><button class="h-btn" onClick={() => setSheet('')}><Icon name="x" /></button></div>
            <div class="sheet-body">
              {histBusy ? <div class="center-msg"><span class="spin" /></div>
                : !hist || hist.length === 0
                  ? <div class="center-msg">Niciun raport recent.<br /><span style="font-size:12px;color:var(--text-muted)">Rapoartele generate se păstrează 7 zile.</span></div>
                  : hist.map((h) => (
                    <button class="sh-item hist-item" onClick={() => viewHist(h)}>
                      <div class="hist-main">
                        <div class="hist-nm">{h.label || h.report_type}</div>
                        <div class="hist-sub">{fmtHist(h.generated_at)} · {h.vehicle_count || 0} veh.</div>
                      </div>
                      <span class="hist-act" onClick={(e) => histExport(h, 'xlsx', e)} aria-label="Excel">{histExp === h.id + '-xlsx' ? <span class="spin" style="width:14px;height:14px" /> : <Icon name="fileBar" size={15} />}</span>
                      <span class="hist-act" onClick={(e) => histExport(h, 'pdf', e)} aria-label="PDF">{histExp === h.id + '-pdf' ? <span class="spin" style="width:14px;height:14px" /> : <Icon name="report" size={15} />}</span>
                      <span class="hist-del" onClick={(e) => delHist(h.id, e)} aria-label="Șterge"><Icon name="trash" size={16} /></span>
                    </button>
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
