import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: Control costuri — 2 sub-view-uri: „Cash-flow" (venituri vs cheltuieli → profit, paritate cu web)
// + „Costuri" (panouri provider Railway/Cloudflare/Anthropic, token-uri DOAR env pe server, + registru costuri).
function n(v: any, d = 0) { return (v == null || isNaN(Number(v))) ? d : Number(v); }
function nf(v: any) { return Math.round(n(v)).toLocaleString('ro-RO'); }
function fmtBytes(b: any) { const x = n(b); if (x > 1e9) return (x / 1e9).toFixed(1) + ' GB'; if (x > 1e6) return (x / 1e6).toFixed(0) + ' MB'; return (x / 1e3).toFixed(0) + ' KB'; }
function fmtDate(s: any) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }

export function CostControl() {
  const loc = useLocation();
  const [tab, setTab] = useState<'finance' | 'ledger'>('finance');
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [rw, setRw] = useState<any>(null);
  const [cf, setCf] = useState<any>(null);
  const [an, setAn] = useState<any>(null);
  const [ga, setGa] = useState<any>(null);
  const [gsc, setGsc] = useState<any>(null);
  const [fin, setFin] = useState<any | null>(null);
  const [finMonths, setFinMonths] = useState(12);
  const [sel, setSel] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  function reload() {
    setErr('');
    Api.costs().then(setData).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setData({ costs: [] }); });
    Api.costRailway().then(setRw).catch(() => setRw({ _err: true }));
    Api.costCloudflare().then(setCf).catch(() => setCf({ _err: true }));
    Api.costAnthropic().then(setAn).catch(() => setAn({ _err: true }));
    Api.costGa().then(setGa).catch(() => setGa({ _err: true }));
    Api.costGsc().then(setGsc).catch(() => setGsc({ _err: true }));
  }
  function loadFin() { setFin(null); Api.adminFinance(finMonths).then(setFin).catch((e: any) => setFin({ _err: e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare') })); }
  useEffect(reload, []);
  useEffect(() => { loadFin(); }, [finMonths]);

  function openNew() { setForm({ provider: '', description: '', amount: '', currency: 'RON', cycle: 'monthly', nextDue: '', active: true }); setSel({}); }
  function openEdit(c: any) { setForm({ provider: c.provider || '', description: c.description || '', amount: c.amount || '', currency: c.currency || 'RON', cycle: c.cycle || 'monthly', nextDue: (c.next_due || c.nextDue) ? String(c.next_due || c.nextDue).slice(0, 10) : '', active: c.active !== false }); setSel(c); }
  const sf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const body = { provider: form.provider, description: form.description, amount: form.amount ? Number(form.amount) : 0, currency: form.currency, cycle: form.cycle, nextDue: form.nextDue || null, active: !!form.active };
    try { if (sel && sel.id != null) await Api.updateCost(sel.id, body); else await Api.createCost(body); showToast('Salvat'); setSel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function markPaid(c: any) { setSaving(true); try { await Api.markCostPaid(c.id); showToast('Marcat plătit'); setSel(null); reload(); loadFin(); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); } }
  async function del(c: any) { if (!confirm('Ștergi „' + (c.description || c.provider) + '"?')) return; setSaving(true); try { await Api.deleteCost(c.id); showToast('Șters'); setSel(null); reload(); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); } }

  const costs = (data && data.costs) || [];

  // ── Cash-flow render ──
  const seg = (a: boolean) => `flex:1;padding:9px;border-radius:10px;font-weight:700;font-size:13px;border:1px solid ${a ? 'var(--accent)' : 'var(--border)'};background:${a ? 'var(--accent)' : 'var(--bg-panel)'};color:${a ? '#06210f' : 'var(--text-primary)'}`;
  const pb = (a: boolean) => `padding:5px 12px;border-radius:8px;font-size:12px;border:1px solid ${a ? 'var(--accent)' : 'var(--border)'};background:${a ? 'var(--accent)' : 'transparent'};color:${a ? '#06210f' : 'var(--text-muted)'}`;
  function kpiCard(lbl: string, val: string, sub: string, color: string) {
    return (
      <div style={`background:var(--bg-panel);border:1px solid var(--border);border-left:3px solid ${color};border-radius:12px;padding:11px 13px`}>
        <div style={`font-size:19px;font-weight:800;color:${color}`}>{val}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">{lbl}{sub ? ' · ' + sub : ''}</div>
      </div>
    );
  }
  function breakdown(title: string, rows: any[], color: string) {
    const list = rows || [];
    let mx = 1; list.forEach((r: any) => { mx = Math.max(mx, n(r.amount)); });
    return (
      <div class="pf-card">
        <h3>{title}</h3>
        {list.length === 0 ? <div style="color:var(--text-muted);font-size:12.5px">—</div> : list.map((r: any) => (
          <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px"><span>{r.name}</span><b>{nf(r.amount)} lei</b></div>
            <div style="height:7px;border-radius:4px;background:var(--border);overflow:hidden"><div style={`height:100%;width:${Math.max(2, Math.round(n(r.amount) / mx * 100))}%;background:${color}`} /></div>
          </div>
        ))}
      </div>
    );
  }

  function renderFinance() {
    if (fin == null) return <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>;
    if (fin._err) return <div class="adm-empty" style="color:var(--red)">{typeof fin._err === 'string' ? fin._err : 'Eroare la încărcare.'}</div>;
    const t = fin.totals || { income: 0, expenses: 0, profit: 0, marginPct: 0 };
    const months = fin.months || [];
    const profitColor = n(t.profit) >= 0 ? 'var(--accent)' : 'var(--red)';
    let maxBar = 1; months.forEach((m: any) => { maxBar = Math.max(maxBar, n(m.income), n(m.expenses)); });
    const empty = fin.counts && fin.counts.payments === 0 && fin.counts.costPayments === 0;
    return (
      <>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          {kpiCard('Venituri', nf(t.income) + ' lei', 'încasat', 'var(--accent)')}
          {kpiCard('Cheltuieli', nf(t.expenses) + ' lei', 'plătit ≈RON', 'var(--red)')}
          {kpiCard('Profit', (n(t.profit) >= 0 ? '' : '−') + nf(Math.abs(n(t.profit))) + ' lei', 'venit − chelt.', profitColor)}
          {kpiCard('Marjă', (t.marginPct != null ? t.marginPct : 0) + '%', 'profit / venit', profitColor)}
          {kpiCard('Burn recurent', nf(fin.recurringMonthlyRON) + ' lei', '≈RON / lună', '#f59e0b')}
        </div>

        {empty && <div style="background:var(--bg-panel);border:1px dashed var(--border);border-radius:12px;padding:12px 13px;font-size:12px;color:var(--text-muted);margin-bottom:12px">Încă nu ai plăți înregistrate. Cash-flow-ul se populează pe măsură ce încasezi abonamente și marchezi costurile ca plătite.</div>}

        <div class="pf-card">
          <h3>Evoluție lunară</h3>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
            <span style="font-size:11.5px;color:var(--text-muted);margin-right:2px">Perioadă:</span>
            <button style={pb(finMonths === 6)} onClick={() => setFinMonths(6)}>6 luni</button>
            <button style={pb(finMonths === 12)} onClick={() => setFinMonths(12)}>12 luni</button>
            <button style={pb(finMonths === 24)} onClick={() => setFinMonths(24)}>24 luni</button>
          </div>
          <div style="display:flex;gap:14px;font-size:11px;color:var(--text-muted);margin-bottom:8px">
            <span style="color:var(--accent)">■ Venituri</span>
            <span style="color:var(--red)">■ Cheltuieli</span>
            <span style="margin-left:auto">Profit →</span>
          </div>
          {months.map((m: any) => {
            const iw = n(m.income) > 0 ? Math.max(2, Math.round(n(m.income) / maxBar * 100)) : 0;
            const ew = n(m.expenses) > 0 ? Math.max(2, Math.round(n(m.expenses) / maxBar * 100)) : 0;
            const pc = n(m.profit) >= 0 ? 'var(--accent)' : 'var(--red)';
            return (
              <div style="display:grid;grid-template-columns:46px 1fr 74px;gap:8px;align-items:center;padding:4px 0">
                <div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap">{m.label}</div>
                <div style="display:flex;flex-direction:column;gap:3px">
                  <div style={`height:8px;border-radius:5px;background:var(--accent);width:${iw}%`} />
                  <div style={`height:8px;border-radius:5px;background:var(--red);width:${ew}%`} />
                </div>
                <div style={`text-align:right;font-size:11.5px;font-weight:700;color:${pc};white-space:nowrap`}>{n(m.profit) >= 0 ? '+' : '−'}{nf(Math.abs(n(m.profit)))}</div>
              </div>
            );
          })}
        </div>

        {breakdown('Top venituri / companie', fin.incomeByCompany, 'var(--accent)')}
        {breakdown('Top cheltuieli / furnizor', fin.expenseByProvider, 'var(--red)')}
      </>
    );
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Control costuri</div>
        <button class="h-btn" onClick={() => { reload(); loadFin(); }} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button style={seg(tab === 'finance')} onClick={() => setTab('finance')}>Cash-flow</button>
          <button style={seg(tab === 'ledger')} onClick={() => setTab('ledger')}>Costuri</button>
        </div>

        {tab === 'finance' && renderFinance()}

        {tab === 'ledger' && (<>
          {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}

          <div class="pf-card">
            <h3>Railway (bază de date)</h3>
            {!rw ? <div class="spin" style="margin:6px auto" /> : rw._err ? <div style="color:var(--text-muted);font-size:12.5px">Indisponibil (RAILWAY_API_TOKEN pe server).</div> : (<>
              <div class="adm-kv"><span class="k">DB folosit</span><span>{fmtBytes(rw.db?.dbBytes)}{rw.capGb ? (' / ' + rw.capGb + ' GB') : ''}</span></div>
              {rw.usage?.estimatedUsd != null && <div class="adm-kv"><span class="k">Estimat lună</span><span>${n(rw.usage.estimatedUsd).toFixed(2)}</span></div>}
            </>)}
          </div>
          <div class="pf-card">
            <h3>Cloudflare (30 zile)</h3>
            {!cf ? <div class="spin" style="margin:6px auto" /> : cf._err ? <div style="color:var(--text-muted);font-size:12.5px">Indisponibil (CLOUDFLARE_ANALYTICS_TOKEN).</div> : (<>
              <div class="adm-kv"><span class="k">Cereri</span><span>{n(cf.totals?.requests).toLocaleString('ro-RO')}</span></div>
              <div class="adm-kv"><span class="k">Trafic</span><span>{fmtBytes(cf.totals?.bytes)}</span></div>
              <div class="adm-kv"><span class="k">Amenințări blocate</span><span>{n(cf.totals?.threats)}</span></div>
            </>)}
          </div>
          <div class="pf-card">
            <h3>Anthropic (AI)</h3>
            {!an ? <div class="spin" style="margin:6px auto" /> : an._err ? <div style="color:var(--text-muted);font-size:12.5px">Indisponibil (ANTHROPIC_ADMIN_KEY).</div> : (<>
              <div class="adm-kv"><span class="k">Cheltuit luna</span><span>${n(an.spentUsd).toFixed(2)}</span></div>
              {an.soldRemaining != null && <div class="adm-kv"><span class="k">Sold rămas</span><span style="color:var(--accent)">${n(an.soldRemaining).toFixed(2)}</span></div>}
              {an.budget != null && <div class="adm-kv"><span class="k">Buget</span><span>${n(an.budget).toFixed(2)}</span></div>}
            </>)}
          </div>

          <div class="pf-card">
            <h3>Google Analytics (30 zile)</h3>
            {!ga ? <div class="spin" style="margin:6px auto" /> : (ga._err || !ga.configured) ? <div style="color:var(--text-muted);font-size:12.5px">Indisponibil (GA4_PROPERTY_ID + service-account pe server).</div> : ga.error ? <div style="color:var(--red);font-size:12.5px">{String(ga.error).slice(0, 80)}</div> : (<>
              <div class="adm-kv"><span class="k">Utilizatori activi</span><span>{n(ga.activeUsers).toLocaleString('ro-RO')}</span></div>
              <div class="adm-kv"><span class="k">Sesiuni</span><span>{n(ga.sessions).toLocaleString('ro-RO')}</span></div>
              <div class="adm-kv"><span class="k">Afișări pagini</span><span>{n(ga.pageViews).toLocaleString('ro-RO')}</span></div>
            </>)}
          </div>
          <div class="pf-card">
            <h3>Search Console (30 zile)</h3>
            {!gsc ? <div class="spin" style="margin:6px auto" /> : (gsc._err || !gsc.configured) ? <div style="color:var(--text-muted);font-size:12.5px">Indisponibil (GSC_SITE_URL + service-account pe server).</div> : gsc.error ? <div style="color:var(--red);font-size:12.5px">{String(gsc.error).slice(0, 80)}</div> : (<>
              <div class="adm-kv"><span class="k">Clicuri</span><span>{n(gsc.clicks).toLocaleString('ro-RO')}</span></div>
              <div class="adm-kv"><span class="k">Afișări</span><span>{n(gsc.impressions).toLocaleString('ro-RO')}</span></div>
              <div class="adm-kv"><span class="k">Poziție medie</span><span>{n(gsc.position).toFixed(1)}</span></div>
            </>)}
          </div>

          <div class="adm-sec2">Costuri recurente</div>
          {data == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
          {data != null && costs.length === 0 && <div class="adm-empty" style="padding:24px"><div>Niciun cost adăugat.</div></div>}
          {costs.length > 0 && (
            <div class="adm-list">
              {costs.map((c: any) => (
                <button class="adm-item" onClick={() => openEdit(c)}>
                  <span class="ic-wrap"><Icon name="zap" size={19} /></span>
                  <span class="mid">
                    <div class="nm">{c.description || c.provider}</div>
                    <div class="sub">{(c.provider || '') + ' · ' + n(c.amount) + ' ' + (c.currency || '') + '/' + (c.cycle === 'yearly' ? 'an' : 'lună') + ((c.next_due || c.nextDue) ? ' · scad. ' + fmtDate(c.next_due || c.nextDue) : '')}</div>
                  </span>
                  <span class="rt"><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
                </button>
              ))}
            </div>
          )}
        </>)}
      </div>

      {tab === 'ledger' && <button class="fab" onClick={openNew} aria-label="Adaugă cost"><Icon name="plus" size={26} color="#06210f" /></button>}

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="zap" size={18} color="var(--accent)" /> {sel.id != null ? 'Editează cost' : 'Cost nou'}</b><button class="h-btn" onClick={() => setSel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Furnizor</label><input value={form.provider} onInput={(e: any) => sf('provider', e.target.value)} placeholder="Railway / Cloudflare…" /></div>
                <div class="fld"><label>Descriere</label><input value={form.description} onInput={(e: any) => sf('description', e.target.value)} /></div>
                <div class="frm-row">
                  <div class="fld"><label>Sumă</label><input type="number" value={form.amount} onInput={(e: any) => sf('amount', e.target.value)} /></div>
                  <div class="fld"><label>Monedă</label><select value={form.currency} onChange={(e: any) => sf('currency', e.target.value)}><option>RON</option><option>USD</option><option>EUR</option></select></div>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Ciclu</label><select value={form.cycle} onChange={(e: any) => sf('cycle', e.target.value)}><option value="monthly">Lunar</option><option value="yearly">Anual</option></select></div>
                  <div class="fld"><label>Scadență</label><input type="date" value={form.nextDue} onInput={(e: any) => sf('nextDue', e.target.value)} /></div>
                </div>
                <div class="frm-actions">
                  {sel.id != null && <button class="btn btn-danger-ghost" disabled={saving} onClick={() => del(sel)}><Icon name="trash" size={16} /></button>}
                  {sel.id != null && <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--accent)" disabled={saving} onClick={() => markPaid(sel)}><Icon name="check" size={16} /> Plătit</button>}
                  <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? '…' : 'Salvează'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
