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
const money2 = (v: any) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Accesul unei firme se oprește DOAR pentru o factură neplătită la 15 zile după scadență, sau de mână
// (decizie Alin, 28.09). Nu mai există „acces până la" și nici „nelimitat": ceasul vechi pe perioade
// plătite bloca clienți care plătiseră tot. (Tot de atunci: plățile NU mai primesc un număr de factură
// inventat — „RAT-AAAA-000{id plată}" se putea bate cap în cap cu numărul unei facturi adevărate.)
const ACCESS: Record<string, [string, string]> = {
  active: ['● La zi', 'var(--green)'],
  grace: ['⚠ Restanță', 'var(--yellow)'],
  expired: ['🚫 Suspendat', 'var(--red)'],
};
// Starea unei firme în lista super-adminului, ca pe web (_raxAccessCell): un client suspendat se vede ca
// SUSPENDAT, cu motivul — două cauze (neplată, oprit de noi), care se rezolvă altfel fiecare — iar o restanță
// în derulare arată câte zile mai are până la suspendare. Întoarce [text, culoare, ordine în listă].
// (Al treilea motiv, „abonament expirat", a plecat pe 29.09 odată cu ceasul „acces până la".)
function accessOf(c: any): [string, string, number] {
  const a = (c && c.access) || {};
  const np = (c && c.neplata) || a.neplata || null;
  const fact = np && np.factura && np.factura.numar ? ' · factura ' + np.factura.numar : '';
  if (a.status === 'expired') {
    const et = a.motiv === 'manual' ? 'Oprit de noi' : 'Suspendat — neplată';
    return ['🚫 ' + et + fact, 'var(--red)', 0];
  }
  if (np && np.faza === 'avertisment') {
    const z = Math.max(0, Number(np.zilePanaLaSuspendare) || 0);
    return ['⚠ Restanță · ' + z + (z === 1 ? ' zi' : ' zile') + ' până la suspendare' + fact, 'var(--orange)', 0.5];
  }
  const sm = ACCESS[a.status] || ACCESS.active;
  return [sm[0], sm[1], a.status === 'grace' ? 1 : 2];
}
const TIP: Record<string, string> = { invoice: 'Factură', proforma: 'Proformă', credit_note: 'Storno' };
const INV_ST: Record<string, [string, string]> = {
  draft: ['Ciornă', 'var(--text-muted)'], issued: ['Emisă', 'var(--accent)'], sent: ['Trimisă', '#38BDF8'],
  paid: ['Plătită', 'var(--green)'], overdue: ['Restantă', 'var(--red)'], canceled: ['Anulată', 'var(--text-muted)'],
};
const EF_ST: Record<string, [string, string]> = {
  uploaded: ['e-Factura: trimisă', '#38BDF8'], validated: ['e-Factura: validată ANAF', 'var(--green)'],
  error: ['e-Factura: eroare', 'var(--red)'], pending: ['e-Factura: în lucru', 'var(--yellow)'],
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

// Plata se face DOAR prin transfer bancar, pe factură (decizia din 15.09: Stripe și plata cu cardul
// au fost scoase de tot, cu tot cu linkul de plată). Ca pe web (raxPayCta): fără buton de plată.

// ─── Admin firmă: status abonament + facturile proprii + datele pentru transfer bancar ───
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
  const sm = ACCESS[a.status] || ACCESS.active;
  const inv: any[] = data.invoices || [];
  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div class="bill-banner" style={`border-left:4px solid ${sm[1]}`}>
        <div class="st" style={`color:${sm[1]}`}>{sm[0]}</div>
        {a.status === 'grace' && a.mesaj ? <div class="sub" style="line-height:1.5">{a.mesaj}</div> : null}
        {data.unpaidInvoice ? (
          <div class="sub" style="margin-top:8px;line-height:1.5">Plata se face prin <b>transfer bancar</b>{(data.issuer && (data.issuer.iban || data.issuer.bank)) ? ' în contul ' + [data.issuer.bank, data.issuer.iban].filter(Boolean).join(' · ') : ' — datele de plată sunt pe factură'}.</div>
        ) : null}
      </div>
      <div class="mn-sec">Facturile mele</div>
      {inv.length === 0
        ? <div class="adm-empty">Nicio factură emisă încă.</div>
        : <div class="adm-list">{inv.map((v) => <FiscalRow v={v} onClick={() => setView(v)} />)}</div>}
      {view && <FiscalInvoiceSheet inv={view} readOnly onClose={() => setView(null)} onChanged={() => setView(null)} />}
    </div>
  );
}

// ─── Super-admin: status companii + facturi FISCALE + plăți + automatizare + date emitent ───
function SuperBilling() {
  const [companies, setCompanies] = useState<any[] | null>(null);
  const [pays, setPays] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [issuer, setIssuer] = useState<any>({});
  const [cfg, setCfg] = useState<any>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [fview, setFview] = useState<any | null>(null);   // factură fiscală
  const [gen, setGen] = useState(false);
  const [editIss, setEditIss] = useState(false);
  const [running, setRunning] = useState(false);

  async function reload() {
    try {
      const [cos, pj, ss, iv, cf] = await Promise.all([
        Api.companies(), Api.payments(), Api.systemSettings().catch(() => ({})),
        Api.invoices().catch(() => ({ invoices: [] })), Api.billingConfig().catch(() => null),
      ]);
      setCompanies((Array.isArray(cos) ? cos : []).filter((c: any) => !c.is_demo));
      setPays((pj && (pj as any).payments) || []);
      setInvoices((iv && (iv as any).invoices) || []);
      setIssuer((ss && (ss as any).invoice_issuer) || {});
      setCfg(cf);
    } catch (e: any) { showToast(e?.message || 'Eroare la încărcare', true); setCompanies([]); }
  }
  useEffect(() => { reload(); }, []);

  async function runAuto() {
    if (!confirm('Rulezi facturarea automată acum?\nEmite facturile lunii pentru companiile cu auto-facturare activă (dacă e ziua de facturare și nu au deja factură pe luna curentă).')) return;
    setRunning(true);
    try { const r = await Api.billingRunAuto(); const n = ((r && r.issued) || []).length; showToast(n ? (n + ' facturi emise automat') : 'Nicio factură de emis acum'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setRunning(false); }
  }
  async function toggleAuto(id: number, on: boolean) {
    try { await Api.companyBillingConfig(id, { auto_invoice: on }); setCompanies((cs) => (cs || []).map((c) => c.id === id ? { ...c, auto_invoice: on } : c)); showToast(on ? 'Auto-facturare activă' : 'Auto-facturare oprită'); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }

  if (companies == null) return <div class="content has-tabbar"><div class="adm-empty"><div class="spin" style="margin:0 auto" /></div></div>;

  const cos = companies.slice().sort((a, b) => accessOf(a)[2] - accessOf(b)[2]);
  const badge = (on: boolean, l: string) => <span style={`font-size:11px;font-weight:700;color:${on ? 'var(--green)' : 'var(--text-muted)'}`}>{l}</span>;

  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div style="display:flex;gap:8px;margin-bottom:6px">
        <button class="btn btn-primary" style="flex:1" onClick={() => setGen(true)}><Icon name="report" size={16} color="#06210f" /> Generează factură</button>
        <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setPay({})}><Icon name="plus" size={16} /></button>
        <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setEditIss(true)}><Icon name="settings" size={16} /></button>
      </div>

      {cfg && (
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <span style="font-size:12px;font-weight:700"><Icon name="report" size={13} color="var(--accent)" /> Auto:</span>
          {badge(!!cfg.email, 'Email')}{badge(!!cfg.efactura, 'e-Factura' + (cfg.efactura && cfg.efacturaTest ? ' TEST' : ''))}
          <button class="btn" style="margin-left:auto;padding:5px 10px;font-size:12px;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" disabled={running} onClick={runAuto}>{running ? '…' : 'Rulează acum'}</button>
        </div>
      )}

      <div class="mn-sec">Status facturare companii</div>
      <div class="adm-list">
        {cos.map((c) => {
          const sm = accessOf(c);
          return (
            <div class="adm-item" style="cursor:default">
              <span class="ic-wrap"><Icon name="truck" size={19} /></span>
              <span class="mid"><div class="nm">{c.name}</div><div class="sub" style={`color:${sm[1]}`}>{sm[0]}</div></span>
              <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-muted);margin-right:6px" onClick={(e: any) => e.stopPropagation()}><input type="checkbox" checked={c.auto_invoice === true} onChange={(e: any) => toggleAuto(c.id, e.target.checked)} />auto</label>
              <button class="btn btn-primary" style="padding:6px 11px;font-size:12px" onClick={() => setPay({ companyId: c.id })}>Încasare</button>
            </div>
          );
        })}
      </div>

      <div class="mn-sec">Facturi fiscale</div>
      {invoices.length === 0
        ? <div class="adm-empty">Nicio factură fiscală. Apasă „Generează factură".</div>
        : <div class="adm-list">{invoices.map((v) => <FiscalRow v={v} onClick={() => setFview(v)} />)}</div>}

      <div class="mn-sec">Plăți / încasări</div>
      {pays.length === 0
        ? <div class="adm-empty">Nicio încasare înregistrată.</div>
        : <div class="adm-list">{pays.map((p) => <PaymentRow p={p} />)}</div>}

      {gen && <GenerateInvoiceSheet companies={companies} onClose={() => setGen(false)} onIssued={() => { setGen(false); reload(); }} />}
      {fview && <FiscalInvoiceSheet inv={fview} onClose={() => setFview(null)} onChanged={() => { setFview(null); reload(); }} />}
      {pay && <RecordPaymentSheet companies={companies} preset={pay.companyId} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
      {editIss && <IssuerSheet issuer={issuer} onClose={() => setEditIss(false)} onSaved={(iss: any) => { setIssuer(iss); setEditIss(false); }} />}
    </div>
  );
}

function FiscalRow({ v, onClick }: { v: any; onClick: () => void }) {
  const st = INV_ST[v.status] || INV_ST.issued;
  const ef = EF_ST[v.efactura_status];
  return (
    <button class="adm-item" onClick={onClick}>
      <span class="ic-wrap"><Icon name="report" size={19} /></span>
      <span class="mid">
        <div class="nm">{TIP[v.type] || 'Factură'} {v.full_number}{v.company_name ? ' · ' + v.company_name : ''}</div>
        <div class="sub"><span style={`color:${st[1]};font-weight:700`}>● {st[0]}</span>{ef ? <span style={`color:${ef[1]}`}> · {ef[0]}</span> : null}</div>
      </span>
      <span class="rt"><b>{money2(v.total)} lei</b><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
    </button>
  );
}

// Detaliu factură FISCALĂ + acțiuni (marchează plătită / trimite ANAF / anulează). Cele cu efect pe bani
// cer confirmare, cu aceleași cuvinte ca pe web — nu se pot desface dintr-o atingere. `readOnly` = privirea clientului.
function FiscalInvoiceSheet({ inv, onClose, onChanged, readOnly }: { inv: any; onClose: () => void; onChanged: () => void; readOnly?: boolean }) {
  const iss = inv.issuer || {}, cl = inv.client || {};
  const st = INV_ST[inv.status] || INV_ST.issued;
  const ef = EF_ST[inv.efactura_status];
  const [busy, setBusy] = useState('');
  const lines: any[] = Array.isArray(inv.lines) ? inv.lines : [];
  async function act(kind: string) {
    // „Plătită" nu mai prelungește niciun acces (29.09); pe o proformă înseamnă „Încasată" și emite factura fiscală.
    if (kind === 'paid' && !confirm(inv.type === 'proforma'
      ? 'Proforma e ÎNCASATĂ? Se emite acum factura fiscală, cu aceleași rânduri, marcată plătită.'
      : 'Marchezi factura ca PLĂTITĂ? Se înregistrează încasarea. Dacă firma era oprită pentru neplată, accesul revine pe loc.')) return;
    if (kind === 'cancel' && !confirm('Anulezi această factură? (pentru facturi plătite se folosește storno)')) return;
    setBusy(kind);
    try {
      if (kind === 'paid') { await Api.invoiceSetStatus(inv.id, 'paid'); showToast('Factură plătită'); onChanged(); }
      else if (kind === 'cancel') { await Api.invoiceSetStatus(inv.id, 'canceled'); showToast('Factură anulată'); onChanged(); }
      else if (kind === 'anaf') { const r = await Api.invoiceEfacturaSend(inv.id); showToast('Trimisă la ANAF (index ' + (r.index || '') + ')'); onChanged(); }
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> {TIP[inv.type] || 'Factură'} {inv.full_number}</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="bill-doc">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style={`font-weight:700;color:${st[1]}`}>● {st[0]}</span>
              {ef ? <span style={`font-size:12px;font-weight:700;color:${ef[1]}`}>{ef[0]}</span> : null}
            </div>
            <div class="bill-sec">Furnizor</div>
            <div class="bill-party"><b>{iss.name || '—'}</b>{iss.cui ? <div>CUI: {iss.cui}</div> : null}{iss.iban ? <div>IBAN: {iss.iban}</div> : null}</div>
            <div class="bill-sec">Client</div>
            <div class="bill-party"><b>{cl.name || inv.company_name || '—'}</b>{cl.cui ? <div>CUI: {cl.cui}</div> : null}</div>
            <div class="bill-sec">Linii</div>
            {lines.map((l) => (
              <div class="bill-kv"><span>{l.desc} ({l.qty} × {money2(l.unitPrice)})</span><b>{money2(l.net)}</b></div>
            ))}
            <div class="bill-kv"><span>TVA</span><b>{money2(inv.vat_amount)} lei</b></div>
            <div class="bill-total"><span>Total de plată</span><b>{money2(inv.total)} lei</b></div>
            <div class="bill-kv" style="margin-top:6px"><span>Scadență</span><b>{fmtD(inv.due_date)}</b></div>
          </div>
          {!readOnly && <div class="frm-actions" style="flex-wrap:wrap;gap:8px;margin-top:12px">
            {inv.status !== 'paid' && inv.status !== 'canceled' && <button class="btn btn-primary" disabled={!!busy} onClick={() => act('paid')}><Icon name="check" size={15} color="#06210f" /> {inv.type === 'proforma' ? 'Încasată' : 'Plătită'}</button>}
            {inv.type !== 'proforma' && inv.status !== 'canceled' && inv.efactura_status !== 'validated' && <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" disabled={!!busy} onClick={() => act('anaf')}>{busy === 'anaf' ? '…' : 'Trimite ANAF'}</button>}
            {inv.status !== 'paid' && inv.status !== 'canceled' && <button class="btn btn-danger-ghost" disabled={!!busy} onClick={() => act('cancel')}>Anulează</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

// Generează + emite o factură fiscală: companie + lună → draft (linii EDITABILE + montaj/dispozitiv) → emite.
function GenerateInvoiceSheet({ companies, onClose, onIssued }: any) {
  const opts = (companies || []).filter((c: any) => !c.is_demo);
  const now = new Date();
  const MON = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'noi.', 'dec.'];
  const [cid, setCid] = useState<string>(String((opts[0] && opts[0].id) || ''));
  const [mon, setMon] = useState(now.getMonth() + 1);
  const [yr, setYr] = useState(now.getFullYear());
  const [draft, setDraft] = useState<any | null>(null);   // { issuer, client, vatRate }
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const vr = draft?.vatRate != null ? draft.vatRate : 19;
  const recalc = (l: any) => { const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * 100) / 100; return { ...l, net, vat: Math.round(net * vr) / 100, vatRate: vr }; };
  const subtotal = lines.reduce((s, l) => s + (Number(l.net) || 0), 0);
  const vatTotal = lines.reduce((s, l) => s + (Number(l.vat) || 0), 0);
  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, idx) => idx === i ? recalc({ ...l, [k]: k === 'desc' ? v : (Number(v) || 0) }) : l));
  const addLine = (desc = '', price = 0) => setLines((ls) => [...ls, recalc({ desc, qty: 1, unitPrice: price, vatRate: vr })]);
  const delLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  async function calc() {
    if (!cid) { showToast('Alege o companie', true); return; }
    setLoading(true); setDraft(null); setLines([]);
    try { const d = await Api.invoiceDraft(parseInt(cid), yr + '-' + String(mon).padStart(2, '0')); setDraft(d); setLines((d.lines || []).map(recalc)); }
    catch (e: any) { showToast(e?.message || 'Eroare la calcul', true); } finally { setLoading(false); }
  }
  async function issue() {
    const valid = lines.filter((l) => (l.desc || '').trim() && (Number(l.qty) || 0) > 0);
    if (!valid.length) { showToast('Adaugă cel puțin o linie validă', true); return; }
    if (!(draft?.issuer && draft.issuer.name && draft.issuer.cui)) { showToast('Completează „Date emitent" (nume + CUI)', true); return; }
    setSaving(true);
    const ps = new Date(yr, mon - 1, 1).getTime(), pe = new Date(yr, mon, 0, 23, 59, 0).getTime();
    // Felul facturii îl deduce serverul din rânduri („Abonament…" = abonamentul lunii; altfel factură unică),
    // iar luna o trimitem noi — o lună de abonament se facturează o singură dată (serverul refuză dublura).
    try { const r = await Api.issueInvoice({ companyId: parseInt(cid), periodStart: ps, periodEnd: pe, luna: yr + '-' + String(mon).padStart(2, '0'), lines: valid }); showToast('Factură emisă: ' + ((r.invoice && r.invoice.full_number) || '')); onIssued(); }
    catch (e: any) { showToast(e?.message || 'Eroare la emitere', true); } finally { setSaving(false); }
  }
  const qbtn = 'padding:6px 9px;font-size:12px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> Generează factură</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Companie (client)</label>
              <select value={cid} onChange={(e: any) => { setCid(e.target.value); setDraft(null); setLines([]); }}>{opts.map((c: any) => <option value={c.id}>{c.name}</option>)}</select>
            </div>
            <div class="frm-row">
              <div class="fld"><label>Luna</label><select value={String(mon)} onChange={(e: any) => setMon(parseInt(e.target.value))}>{MON.map((m, i) => <option value={i + 1}>{m}</option>)}</select></div>
              <div class="fld"><label>An</label><select value={String(yr)} onChange={(e: any) => setYr(parseInt(e.target.value))}>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option value={y}>{y}</option>)}</select></div>
            </div>
            <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--accent)" disabled={loading} onClick={calc}>{loading ? 'Se calculează…' : 'Calculează liniile'}</button>
            {draft && (
              <div style="margin-top:12px">
                <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">Client: <b>{draft.client?.name}</b> · TVA {vr}% · editează liniile / adaugă montaj & dispozitiv</div>
                {lines.map((l, i) => (
                  <div style="display:flex;gap:5px;align-items:center;margin-bottom:6px">
                    <input style="flex:2;min-width:0" value={l.desc} onInput={(e: any) => setLine(i, 'desc', e.target.value)} placeholder="Descriere" />
                    <input style="width:42px;text-align:center" type="number" value={l.qty} onInput={(e: any) => setLine(i, 'qty', e.target.value)} />
                    <input style="width:62px;text-align:right" type="number" value={l.unitPrice} onInput={(e: any) => setLine(i, 'unitPrice', e.target.value)} />
                    <button class="btn" style="padding:6px 8px;background:transparent;border:1px solid var(--red);color:var(--red)" onClick={() => delLine(i)}>×</button>
                  </div>
                ))}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
                  <button class="btn" style={qbtn} onClick={() => addLine('Dispozitiv GPS (echipament)')}>+ Dispozitiv</button>
                  <button class="btn" style={qbtn} onClick={() => addLine('Montaj / instalare GPS')}>+ Montaj</button>
                  <button class="btn" style={qbtn} onClick={() => addLine()}>+ Linie</button>
                </div>
                <div class="bill-total"><span>Total (cu TVA)</span><b>{money2(subtotal + vatTotal)} lei</b></div>
                <div class="frm-actions" style="margin-top:12px"><button class="btn btn-primary" disabled={saving} onClick={issue}>{saving ? 'Se emite…' : 'Emite factura'}</button></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Un rând din registrul încasărilor: data, firma, suma, pentru ce. FĂRĂ număr de factură inventat.
function PaymentRow({ p }: { p: any }) {
  return (
    <div class="adm-item" style="cursor:default">
      <span class="ic-wrap"><Icon name="report" size={19} /></span>
      <span class="mid">
        <div class="nm">{p.company_name || ('#' + p.company_id)}</div>
        <div class="sub">{fmtD(p.paid_at || p.created_at)} · {p.note || 'încasare fără factură'}</div>
      </span>
      <span class="rt"><b>{fmtMoney(p.amount_ron)}</b></span>
    </div>
  );
}

const METHODS = [{ v: 'transfer', l: 'Transfer bancar' }, { v: 'cash', l: 'Numerar' }, { v: 'card', l: 'Card' }, { v: 'manual', l: 'Alta' }];
function RecordPaymentSheet({ companies, preset, onClose, onSaved }: any) {
  const opts = (companies || []).filter((c: any) => !c.is_demo);
  const [form, setForm] = useState<any>({ company_id: preset || (opts[0] && opts[0].id) || '', amount: '', method: 'transfer', note: '' });
  const [saving, setSaving] = useState(false);
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function save() {
    const cid = parseInt(form.company_id);
    if (!cid) { showToast('Alege o companie', true); return; }
    setSaving(true);
    try {
      await Api.recordPayment(cid, { amount: (form.amount || '').trim() || null, method: form.method, note: (form.note || '').trim() || null });
      showToast('Încasare înregistrată');
      onSaved();
    } catch (e: any) { showToast(e?.message || 'Eroare la înregistrare', true); }
    finally { setSaving(false); }
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Încasare fără factură</b><button class="h-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Companie</label>
              <select value={form.company_id} onChange={(e) => setF('company_id', (e.target as HTMLSelectElement).value)}>
                {opts.map((c: any) => <option value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div class="fld"><label>Sumă încasată (lei)</label><input value={form.amount} onInput={(e) => setF('amount', (e.target as HTMLInputElement).value)} placeholder="ex: 1500 sau 1.234,56" /></div>
            <div class="sub" style="font-size:12px;color:var(--text-muted);line-height:1.5;margin:-4px 0 8px">Doar o sumă primită fără factură. Plata unei facturi se trece de pe factură („Plătită").</div>
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
  const [form, setForm] = useState<any>({ name: '', cui: '', reg_com: '', address: '', city: '', county: '', iban: '', bank: '', email: '', phone: '', vat_rate: 19, vat_payer: true, ...(issuer || {}) });
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
          <div class="muted" style="font-size:12px;margin-bottom:10px">Aceste date apar ca EMITENT (Furnizor) pe facturile fiscale emise.</div>
          <div class="frm">
            {F('name', 'Denumire firmă', 'ex. RA Tracks SRL')}
            <div class="frm-row">{F('cui', 'CUI / CIF')}{F('reg_com', 'Reg. Com.')}</div>
            {F('address', 'Adresă')}
            <div class="frm-row">{F('city', 'Oraș / localitate', 'ex. SECTOR1')}{F('county', 'Cod județ', 'ex. RO-B')}</div>
            <div class="frm-row">{F('iban', 'IBAN')}{F('bank', 'Bancă')}</div>
            <div class="frm-row">{F('email', 'Email')}{F('phone', 'Telefon')}</div>
            <div class="frm-row">
              <div class="fld"><label>Cotă TVA (%)</label><input type="number" value={form.vat_rate} onInput={(e) => setF('vat_rate', (e.target as HTMLInputElement).value)} /></div>
              <div class="fld"><label>Plătitor TVA</label><label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px"><input type="checkbox" checked={form.vat_payer !== false} onChange={(e: any) => setF('vat_payer', e.target.checked)} /> da</label></div>
            </div>
            <div class="frm-actions">
              <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
