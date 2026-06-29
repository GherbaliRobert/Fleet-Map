import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: Companii (CRUD) + abonament/plăți + module per companie (include Agenți AI) → absoarbe „Conturi & Abonamente" + „config Agenți AI".
// Toate endpoint-urile sunt requireSuperadmin pe server → non-super primește 403 (ecranul e oricum ascuns din meniu).
const FEATURES = [
  { key: 'ai_assistant', label: 'Asistent AI', sub: 'chat + RA Insight' },
  { key: 'agents', label: 'Agenți AI', sub: 'RA Optimize / RA Care' },
  { key: 'etransport', label: 'e-Transport (ANAF)', sub: '' },
  { key: 'tahograf', label: 'Tahograf', sub: '' },
];
function fmtDate(s: any) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }

export function AdminCompanies() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [ov, setOv] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [feat, setFeat] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState<any>({ name: '', contact_email: '', phone: '', plan: 'standard' });

  function reload() {
    setErr('');
    Api.companies().then(setItems).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, []);

  function open(c: any) {
    setSel(c); setOv(null); setFeat({});
    setForm({ name: c.name || '', contact_email: c.contact_email || '', phone: c.phone || '', plan: c.plan || '', ai_limit: c.ai_token_limit || '', pay_months: '1', pay_amount: '' });
    Api.companyOverview(c.id).then((o: any) => {
      setOv(o);
      const f = (o && (o.features || (o.company && o.company.features))) || c.features || {};
      setFeat(Object.assign({}, f));
    }).catch(() => {});
  }
  const sf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function saveBasics() {
    if (!sel) return; setSaving(true);
    try {
      await Api.updateCompany(sel.id, { name: form.name, contact_email: form.contact_email, phone: form.phone });
      if (form.plan && form.plan !== sel.plan) await Api.setCompanyPlan(sel.id, form.plan);
      if (form.ai_limit !== '' && form.ai_limit != null) await Api.setCompanyAiLimit(sel.id, Number(form.ai_limit));
      showToast('Salvat'); setSel(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function toggleFeat(key: string) {
    if (!sel) return;
    const prev = feat, next = Object.assign({}, feat, { [key]: !feat[key] });
    setFeat(next);
    try { await Api.setCompanyFeatures(sel.id, next); } catch (e: any) { showToast(e?.message || 'Eroare', true); setFeat(prev); }
  }
  async function recordPay() {
    if (!sel) return; setSaving(true);
    try { await Api.recordPayment(sel.id, { months: Number(form.pay_months || 1), amount: form.pay_amount ? Number(form.pay_amount) : undefined }); showToast('Plată înregistrată'); open(sel); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function del() {
    if (!sel || !confirm('Ștergi compania „' + sel.name + '"? Trebuie să fie goală (fără vehicule/utilizatori).')) return;
    setSaving(true);
    try { await Api.deleteCompany(sel.id); showToast('Companie ștearsă'); setSel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare (compania nu e goală?)', true); } finally { setSaving(false); }
  }
  async function create() {
    if (!nf.name.trim()) { showToast('Pune un nume', true); return; }
    setSaving(true);
    try { await Api.createCompany(nf); showToast('Companie creată'); setCreating(false); setNf({ name: '', contact_email: '', phone: '', plan: 'standard' }); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Companii</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="layers" size={40} class="ic" /><div>Nicio companie.</div></div>}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((c: any) => (
              <button class="adm-item" onClick={() => open(c)}>
                <span class="ic-wrap"><Icon name="layers" size={19} /></span>
                <span class="mid">
                  <div class="nm">{c.name}{c.is_demo ? ' · DEMO' : ''}</div>
                  <div class="sub">{(c.plan || '—') + ' · ' + (c.device_count || 0) + ' veh · ' + (c.user_count || 0) + ' useri'}</div>
                </span>
                <span class="rt"><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button class="fab" onClick={() => setCreating(true)} aria-label="Adaugă companie"><Icon name="plus" size={26} color="#06210f" /></button>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="layers" size={18} color="var(--accent)" /> {sel.name}</b><button class="h-btn" onClick={() => setSel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume</label><input value={form.name} onInput={(e: any) => sf('name', e.target.value)} /></div>
                <div class="frm-row">
                  <div class="fld"><label>Email</label><input type="email" value={form.contact_email} onInput={(e: any) => sf('contact_email', e.target.value)} /></div>
                  <div class="fld"><label>Telefon</label><input type="tel" value={form.phone} onInput={(e: any) => sf('phone', e.target.value)} /></div>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Plan</label><input value={form.plan} onInput={(e: any) => sf('plan', e.target.value)} placeholder="standard" /></div>
                  <div class="fld"><label>Limită AI (tok/lună)</label><input type="number" value={form.ai_limit} onInput={(e: any) => sf('ai_limit', e.target.value)} placeholder="—" /></div>
                </div>
                <button class="btn btn-primary" disabled={saving} onClick={saveBasics}>{saving ? 'Se salvează…' : 'Salvează datele'}</button>
              </div>

              <div class="adm-sec2">Module active</div>
              {FEATURES.map((f) => (
                <div class="adm-tgl">
                  <span class="lbl">{f.label}{f.sub ? <small>{f.sub}</small> : null}</span>
                  <span class={'sw' + (feat[f.key] ? ' on' : '')} onClick={() => toggleFeat(f.key)} role="switch" aria-checked={!!feat[f.key]} />
                </div>
              ))}

              <div class="adm-sec2">Abonament</div>
              <div class="adm-kv"><span class="k">Acces până la</span><span>{fmtDate(ov && ov.access && (ov.access.until || ov.access.access_until))}</span></div>
              <div class="frm-row" style="margin-top:10px">
                <div class="fld"><label>Luni</label><input type="number" value={form.pay_months} onInput={(e: any) => sf('pay_months', e.target.value)} /></div>
                <div class="fld"><label>Sumă (RON)</label><input type="number" value={form.pay_amount} onInput={(e: any) => sf('pay_amount', e.target.value)} placeholder="opțional" /></div>
              </div>
              <button class="btn btn-primary" style="margin-top:8px" disabled={saving} onClick={recordPay}>Înregistrează plata</button>

              <div class="adm-sec2">Periculos</div>
              <button class="btn btn-danger-ghost" disabled={saving} onClick={del}><Icon name="trash" size={16} /> Șterge compania</button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setCreating(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Companie nouă</b><button class="h-btn" onClick={() => setCreating(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume <span class="req">*</span></label><input value={nf.name} onInput={(e: any) => setNf({ ...nf, name: e.target.value })} placeholder="Ex: Transport SRL" /></div>
                <div class="fld"><label>Email contact</label><input type="email" value={nf.contact_email} onInput={(e: any) => setNf({ ...nf, contact_email: e.target.value })} /></div>
                <div class="fld"><label>Telefon</label><input type="tel" value={nf.phone} onInput={(e: any) => setNf({ ...nf, phone: e.target.value })} /></div>
                <div class="fld"><label>Plan</label><input value={nf.plan} onInput={(e: any) => setNf({ ...nf, plan: e.target.value })} placeholder="standard" /></div>
                <button class="btn btn-primary" disabled={saving} onClick={create}>{saving ? 'Se creează…' : 'Creează compania'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
