import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';
import './billing.css';

const fmtD = (ts: any) => (ts ? new Date(Number(ts)).toLocaleDateString('ro-RO') : '—');
const fmtMoney = (v: any) => (v != null ? Number(v).toLocaleString('ro-RO') + ' lei' : '—');
const invNo = (p: any) => 'RAT-' + new Date(Number(p.paid_at || p.created_at || Date.now())).getFullYear() + '-' + String(p.id).padStart(5, '0');
const ACCESS: Record<string, [string, string]> = {
  unlimited: ['∞ Nelimitat', 'var(--text-muted)'],
  active: ['● Activ / plătit', 'var(--green)'],
  grace: ['⚠ De plătit (grație)', 'var(--yellow)'],
  expired: ['🚫 Restant / suspendat', 'var(--red)'],
};

export function Billing() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">{isSuper ? 'Facturare' : 'Facturile mele'}</div>
        <div style="width:36px" />
      </header>
      {isSuper ? <SuperBilling /> : <MyBilling />}
    </div>
  );
}

// Buton de plată PREGĂTIT (fără plată reală încă) — afișează info; integrarea online se activează ulterior.
function payPrepare() {
  showToast('Plata online va fi disponibilă în curând. Momentan plata se face prin transfer bancar — datele apar pe factură.');
}

// ─── Admin firmă: status abonament + facturile proprii + buton plată (pregătit) ───
function MyBilling() {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<any | null>(null);
  useEffect(() => {
    Api.myInvoices()
      .then((d) => setData(d || { invoices: [] }))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Nu ai dreptul de a vedea facturile.' : (e?.message || 'Eroare la încărcare')); setData({ invoices: [] }); });
  }, []);
  if (err) return <div class="content has-tabbar"><div class="adm-empty" style="color:var(--red)">{err}</div></div>;
  if (!data) return <div class="content has-tabbar"><div class="adm-empty"><div class="spin" style="margin:0 auto" /></div></div>;
  const a = data.access || {};
  const sm = ACCESS[a.status] || ACCESS.unlimited;
  const inv: any[] = data.invoices || [];
  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div class="bill-banner" style={`border-left:4px solid ${sm[1]}`}>
        <div class="st" style={`color:${sm[1]}`}>{sm[0]}</div>
        {a.access_until ? <div class="sub">Acces până la <b>{fmtD(a.access_until)}</b></div> : null}
        <button class="btn btn-primary" style="margin-top:12px;width:auto" onClick={payPrepare}><Icon name="report" size={16} color="#06210f" /> Plătește</button>
      </div>
      <div class="mn-sec">Facturile mele</div>
      {inv.length === 0
        ? <div class="adm-empty">Nicio factură emisă încă.</div>
        : <div class="adm-list">{inv.map((p) => <InvoiceRow p={p} onClick={() => setView(p)} />)}</div>}
      {view && <InvoiceSheet p={view} co={data.company} iss={data.issuer} onClose={() => setView(null)} />}
    </div>
  );
}

// ─── Super-admin: status companii + facturi emise + înregistrare plată + date emitent ───
function SuperBilling() {
  const [companies, setCompanies] = useState<any[] | null>(null);
  const [pays, setPays] = useState<any[]>([]);
  const [issuer, setIssuer] = useState<any>({});
  const [pay, setPay] = useState<any | null>(null);   // {companyId?} → sheet înregistrare plată
  const [view, setView] = useState<any | null>(null); // detaliu factură
  const [editIss, setEditIss] = useState(false);

  async function reload() {
    try {
      const [cos, pj, ss] = await Promise.all([Api.companies(), Api.payments(), Api.systemSettings().catch(() => ({}))]);
      setCompanies((Array.isArray(cos) ? cos : []).filter((c: any) => !c.is_demo));
      setPays((pj && (pj as any).payments) || []);
      setIssuer((ss && (ss as any).invoice_issuer) || {});
    } catch (e: any) { showToast(e?.message || 'Eroare la încărcare', true); setCompanies([]); }
  }
  useEffect(() => { reload(); }, []);

  if (companies == null) return <div class="content has-tabbar"><div class="adm-empty"><div class="spin" style="margin:0 auto" /></div></div>;

  const rank: Record<string, number> = { expired: 0, grace: 1, active: 2, unlimited: 3 };
  const cos = companies.slice().sort((a, b) => (rank[(a.access || {}).status] ?? 4) - (rank[(b.access || {}).status] ?? 4));
  const coById = (id: number) => companies.find((c) => c.id === id) || {};

  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div style="display:flex;gap:8px;margin-bottom:6px">
        <button class="btn btn-primary" style="flex:1" onClick={() => setPay({})}><Icon name="plus" size={16} color="#06210f" /> Înregistrează plată</button>
        <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setEditIss(true)}><Icon name="settings" size={16} /> Emitent</button>
      </div>

      <div class="mn-sec">Status facturare companii</div>
      <div class="adm-list">
        {cos.map((c) => {
          const sm = ACCESS[(c.access || {}).status] || ACCESS.unlimited;
          const until = (c.access || {}).access_until;
          return (
            <div class="adm-item" style="cursor:default">
              <span class="ic-wrap"><Icon name="truck" size={19} /></span>
              <span class="mid"><div class="nm">{c.name}</div><div class="sub" style={`color:${sm[1]}`}>{sm[0]}{until ? ' · până ' + fmtD(until) : ''}</div></span>
              <button class="btn btn-primary" style="padding:6px 11px;font-size:12px" onClick={() => setPay({ companyId: c.id })}>Plată</button>
            </div>
          );
        })}
      </div>

      <div class="mn-sec">Facturi emise</div>
      {pays.length === 0
        ? <div class="adm-empty">Nicio factură emisă încă.</div>
        : <div class="adm-list">{pays.map((p) => <InvoiceRow p={p} sub={p.company_name} onClick={() => setView(p)} />)}</div>}

      {pay && <RecordPaymentSheet companies={companies} preset={pay.companyId} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
      {view && <InvoiceSheet p={view} co={coById(view.company_id)} iss={issuer} onClose={() => setView(null)} />}
      {editIss && <IssuerSheet issuer={issuer} onClose={() => setEditIss(false)} onSaved={(iss: any) => { setIssuer(iss); setEditIss(false); }} />}
    </div>
  );
}

function InvoiceRow({ p, sub, onClick }: { p: any; sub?: string; onClick: () => void }) {
  return (
    <button class="adm-item" onClick={onClick}>
      <span class="ic-wrap"><Icon name="report" size={19} /></span>
      <span class="mid">
        <div class="nm">{invNo(p)}{sub ? ' · ' + sub : ''}</div>
        <div class="sub">{fmtD(p.period_start)} → {fmtD(p.period_end)}</div>
      </span>
      <span class="rt"><b>{fmtMoney(p.amount_ron)}</b><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
    </button>
  );
}

// Detaliu factură (read-only) — echivalentul mobil al documentului printabil de pe web.
function InvoiceSheet({ p, co, iss, onClose }: { p: any; co: any; iss: any; onClose: () => void }) {
  co = co || {}; iss = iss || {};
  const kv = (k: string, v: any) => (v ? <div class="bill-kv"><span>{k}</span><b>{v}</b></div> : null);
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> Factură {invNo(p)}</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="bill-doc">
            <div class="bill-sec">Emitent</div>
            <div class="bill-party"><b>{iss.name || '(date emitent necompletate)'}</b>
              {iss.cui ? <div>CUI: {iss.cui}</div> : null}
              {iss.address ? <div>{iss.address}</div> : null}
              {iss.iban ? <div>IBAN: {iss.iban}{iss.bank ? ' · ' + iss.bank : ''}</div> : null}
            </div>
            <div class="bill-sec">Client</div>
            <div class="bill-party"><b>{co.name || p.company_name || '—'}</b>
              {co.cui ? <div>CUI: {co.cui}</div> : null}
              {co.address ? <div>{co.address}</div> : null}
            </div>
            <div class="bill-sec">Detalii</div>
            {kv('Data emiterii', fmtD(p.paid_at || p.created_at))}
            {kv('Perioadă', fmtD(p.period_start) + ' → ' + fmtD(p.period_end))}
            {kv('Metodă', p.method || 'manual')}
            {kv('Notă', p.note)}
            <div class="bill-total"><span>Total</span><b>{fmtMoney(p.amount_ron)}</b></div>
            <div class="muted" style="font-size:11px;margin-top:10px">Document intern pentru evidența abonamentului — nu factură fiscală oficială cu serie ANAF.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const METHODS = [{ v: 'transfer', l: 'Transfer bancar' }, { v: 'cash', l: 'Numerar' }, { v: 'card', l: 'Card' }, { v: 'manual', l: 'Alta' }];
function RecordPaymentSheet({ companies, preset, onClose, onSaved }: any) {
  const opts = (companies || []).filter((c: any) => !c.is_demo);
  const [form, setForm] = useState<any>({ company_id: preset || (opts[0] && opts[0].id) || '', months: 1, amount: '', method: 'transfer', note: '' });
  const [saving, setSaving] = useState(false);
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function save() {
    const cid = parseInt(form.company_id);
    if (!cid) { showToast('Alege o companie', true); return; }
    setSaving(true);
    try {
      await Api.recordPayment(cid, { months: parseInt(form.months) || 1, amount: (form.amount || '').trim() || null, method: form.method, note: (form.note || '').trim() || null });
      showToast('Plată înregistrată');
      onSaved();
    } catch (e: any) { showToast(e?.message || 'Eroare la înregistrare', true); }
    finally { setSaving(false); }
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Înregistrează plată</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Companie</label>
              <select value={form.company_id} onChange={(e) => setF('company_id', (e.target as HTMLSelectElement).value)}>
                {opts.map((c: any) => <option value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div class="frm-row">
              <div class="fld"><label>Prelungește (luni)</label><input type="number" min="1" max="36" value={form.months} onInput={(e) => setF('months', (e.target as HTMLInputElement).value)} /></div>
              <div class="fld"><label>Sumă (lei)</label><input value={form.amount} onInput={(e) => setF('amount', (e.target as HTMLInputElement).value)} placeholder="ex: 1500" /></div>
            </div>
            <div class="fld"><label>Metodă</label>
              <select value={form.method} onChange={(e) => setF('method', (e.target as HTMLSelectElement).value)}>
                {METHODS.map((m) => <option value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div class="fld"><label>Notă (ex: nr. factură)</label><input value={form.note} onInput={(e) => setF('note', (e.target as HTMLInputElement).value)} placeholder="ex: F 2026-0123" /></div>
            <div class="frm-actions">
              <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se înregistrează…' : 'Înregistrează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuerSheet({ issuer, onClose, onSaved }: any) {
  const [form, setForm] = useState<any>({ name: '', cui: '', reg_com: '', address: '', iban: '', bank: '', email: '', phone: '', ...(issuer || {}) });
  const [saving, setSaving] = useState(false);
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      const j = await Api.saveSystemSettings({ invoice_issuer: form });
      showToast('Date emitent salvate');
      onSaved((j && (j as any).settings && (j as any).settings.invoice_issuer) || form);
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  const F = (k: string, label: string, ph?: string) => (
    <div class="fld"><label>{label}</label><input value={form[k]} onInput={(e) => setF(k, (e.target as HTMLInputElement).value)} placeholder={ph} /></div>
  );
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="settings" size={18} color="var(--accent)" /> Date emitent factură</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="muted" style="font-size:12px;margin-bottom:10px">Aceste date apar ca emitent pe facturi. Document intern — nu factură fiscală ANAF.</div>
          <div class="frm">
            {F('name', 'Denumire firmă', 'ex. RA Tracks SRL')}
            <div class="frm-row">{F('cui', 'CUI / CIF')}{F('reg_com', 'Reg. Com.')}</div>
            {F('address', 'Adresă')}
            <div class="frm-row">{F('iban', 'IBAN')}{F('bank', 'Bancă')}</div>
            <div class="frm-row">{F('email', 'Email')}{F('phone', 'Telefon')}</div>
            <div class="frm-actions">
              <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
