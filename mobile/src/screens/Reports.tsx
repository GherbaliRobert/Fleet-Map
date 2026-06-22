import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import type { ReportTypeInfo, ReportResult } from '../api/endpoints';
import { vehicles, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { ReportChart } from '../components/ReportChart';
import { InsightPanel } from '../components/InsightPanel';
import { exportReport } from '../lib/export';
import './reports.css';
import '../screens/detail.css'; // pentru .sheet*

type Period = 'today' | 'yesterday' | 'week' | 'month';
function range(p: Period): { from: string; to: string } {
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { from.setDate(from.getDate() - 1); const to = new Date(from); to.setHours(23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }
  if (p === 'week') from.setDate(from.getDate() - 7);
  if (p === 'month') from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}
const PERIOD_LABEL: Record<Period, string> = { today: 'Azi', yesterday: 'Ieri', week: '7 zile', month: '30 zile' };

export function Reports() {
  const loc = useLocation();
  const [cats, setCats] = useState<{ key: string; label: string }[]>([]);
  const [types, setTypes] = useState<ReportTypeInfo[]>([]);
  const [type, setType] = useState('trips');
  const [period, setPeriod] = useState<Period>('week');
  const [sel, setSel] = useState<string[]>([]); // gol = toată flota
  const [sheet, setSheet] = useState<'' | 'type' | 'veh'>('');
  const [tq, setTq] = useState(''); const [vq, setVq] = useState('');
  const [res, setRes] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');
  const [tab, setTab] = useState<'rapoarte' | 'insight'>('rapoarte');

  useEffect(() => {
    Api.reportTypes().then((d) => { setCats(d.categories || []); setTypes(d.reports || []); }).catch(() => {});
    const pre = (loc.query && (loc.query as any).imei) || '';
    if (pre) setSel(String(pre).split(',').filter(Boolean));
  }, []);

  const typeLabel = useMemo(() => (types.find((t) => t.type === type)?.label || 'Raport'), [types, type]);
  const list = vehicles.value;
  const selLabel = sel.length === 0 ? 'Toată flota' : sel.length === 1
    ? (list.find((v) => v.imei === sel[0])?.name || sel[0])
    : `${sel.length} vehicule`;

  async function generate() {
    setErr(''); setLoading(true); setRes(null);
    const r = range(period);
    try { setRes(await Api.runReport(type, r.from, r.to, sel.length ? sel : undefined)); }
    catch (e: any) { setErr(e?.message || 'Eroare la generare'); }
    finally { setLoading(false); }
  }

  function toggleVeh(imei: string) {
    setSel((cur) => cur.includes(imei) ? cur.filter((x) => x !== imei) : [...cur, imei]);
  }

  async function doExport(format: 'pdf' | 'xlsx') {
    if (exporting) return;
    setExporting(format);
    const r = range(period);
    try { await exportReport(type, r.from, r.to, sel.length ? sel : undefined, format); }
    catch (e: any) { showToast(e?.message || 'Export indisponibil', true); }
    finally { setExporting(''); }
  }

  const filteredTypes = (catKey: string) => types.filter((t) => t.cat === catKey && (!tq || t.label.toLowerCase().includes(tq.toLowerCase())));
  const filteredVeh = list.filter((v) => !vq || (`${v.name || ''} ${v.plate || ''} ${v.imei}`).toLowerCase().includes(vq.toLowerCase()))
    .slice().sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei));

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Rapoarte</div></header>
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
          <div class="rp-periods">
            {(['today', 'yesterday', 'week', 'month'] as Period[]).map((p) => (
              <button class={'rp-period' + (period === p ? ' on' : '')} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
            ))}
          </div>
          <button class="btn btn-primary btn-block rp-gen" onClick={generate} disabled={loading}>
            {loading ? <span class="spin" style="border-top-color:#06210F" /> : <><Icon name="chart" size={18} /> Generează raport</>}
          </button>
        </div>

        {err && <div class="center-msg" style="color:var(--red)">{err}</div>}

        {res && (
          <>
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
                      <span class="nm">{t.label}</span>{type === t.type && <Icon name="check" size={18} />}
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
    </div>
  );
}
