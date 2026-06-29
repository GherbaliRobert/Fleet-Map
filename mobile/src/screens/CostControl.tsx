import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: Control costuri — panouri provider (Railway/Cloudflare/Anthropic, token-uri DOAR env pe server) + registru costuri.
function n(v: any, d = 0) { return (v == null || isNaN(Number(v))) ? d : Number(v); }
function fmtBytes(b: any) { const x = n(b); if (x > 1e9) return (x / 1e9).toFixed(1) + ' GB'; if (x > 1e6) return (x / 1e6).toFixed(0) + ' MB'; return (x / 1e3).toFixed(0) + ' KB'; }
function fmtDate(s: any) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }

export function CostControl() {
  const loc = useLocation();
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [rw, setRw] = useState<any>(null);
  const [cf, setCf] = useState<any>(null);
  const [an, setAn] = useState<any>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  function reload() {
    setErr('');
    Api.costs().then(setData).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setData({ costs: [] }); });
    Api.costRailway().then(setRw).catch(() => setRw({ _err: true }));
    Api.costCloudflare().then(setCf).catch(() => setCf({ _err: true }));
    Api.costAnthropic().then(setAn).catch(() => setAn({ _err: true }));
  }
  useEffect(reload, []);

  function openNew() { setForm({ provider: '', description: '', amount: '', currency: 'RON', cycle: 'monthly', nextDue: '', active: true }); setSel({}); }
  function openEdit(c: any) { setForm({ provider: c.provider || '', description: c.description || '', amount: c.amount || '', currency: c.currency || 'RON', cycle: c.cycle || 'monthly', nextDue: (c.next_due || c.nextDue) ? String(c.next_due || c.nextDue).slice(0, 10) : '', active: c.active !== false }); setSel(c); }
  const sf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const body = { provider: form.provider, description: form.description, amount: form.amount ? Number(form.amount) : 0, currency: form.currency, cycle: form.cycle, nextDue: form.nextDue || null, active: !!form.active };
    try { if (sel && sel.id != null) await Api.updateCost(sel.id, body); else await Api.createCost(body); showToast('Salvat'); setSel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function markPaid(c: any) { setSaving(true); try { await Api.markCostPaid(c.id); showToast('Marcat plătit'); setSel(null); reload(); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); } }
  async function del(c: any) { if (!confirm('Ștergi „' + (c.description || c.provider) + '"?')) return; setSaving(true); try { await Api.deleteCost(c.id); showToast('Șters'); setSel(null); reload(); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); } }

  const costs = (data && data.costs) || [];

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Control costuri</div>
        <button class="h-btn" onClick={reload} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
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
      </div>

      <button class="fab" onClick={openNew} aria-label="Adaugă cost"><Icon name="plus" size={26} color="#06210f" /></button>

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
