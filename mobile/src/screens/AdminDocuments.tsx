import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, vehicles, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

const DOC_TYPES = ['ITP', 'RCA', 'CASCO', 'Rovinietă', 'Licență transport', 'Tahograf', 'Altul'];

function expiryInfo(expiry: string | null, today: string) {
  if (!expiry) return null;
  const exp = String(expiry).slice(0, 10);
  const cls = exp < today ? 'bad' : (exp < shift(today, 30) ? 'warn' : 'ok');
  return { cls, label: exp < today ? 'expirat ' + fmt(exp) : 'exp. ' + fmt(exp) };
}
function shift(d: string, days: number) { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + days); return t.toISOString().slice(0, 10); }
function fmt(d: string) { const [y, m, da] = d.split('-'); return `${da}.${m}.${y.slice(2)}`; }

export function AdminDocuments() {
  const loc = useLocation();
  const canWrite = !!me.value?.permissions?.manageFleet;
  const today = new Date().toISOString().slice(0, 10);
  const vlist = vehicles.value;
  const vname = (imei: string) => { const v = vlist.find((x) => x.imei === imei); return v ? (v.name || v.plate || imei) : imei; };

  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [add, setAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ imei: '', doc_type: 'ITP', number: '', issuer: '', issue_date: '', expiry_date: '', notes: '' });

  async function reload() {
    setErr('');
    try { setItems(await Api.documents()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai permisiunea de administrare.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => { reload(); }, []);

  function openAdd() {
    setForm({ imei: vlist[0]?.imei || '', doc_type: 'ITP', number: '', issuer: '', issue_date: '', expiry_date: '', notes: '' });
    setAdd(true);
  }
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.imei) { showToast('Alege vehiculul', true); return; }
    if (!form.doc_type) { showToast('Alege tipul documentului', true); return; }
    setSaving(true);
    try {
      await Api.createDocument({
        imei: form.imei, doc_type: form.doc_type, number: form.number || null, issuer: form.issuer || null,
        issue_date: form.issue_date || null, expiry_date: form.expiry_date || null, notes: form.notes || null,
      });
      showToast('Document adăugat'); setAdd(false); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  async function doDelete(d: any) {
    setSaving(true);
    try { await Api.deleteDocument(d.id); showToast('Șters'); setConfirmDel(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Documente vehicule</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="report" size={40} class="ic" /><div>Niciun document înregistrat.</div></div>}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((d) => {
              const ex = expiryInfo(d.expiry_date, today);
              return (
                <div class="adm-item">
                  <span class="ic-wrap"><Icon name="report" size={19} /></span>
                  <span class="mid">
                    <div class="nm">{d.doc_type}{d.number ? ' · ' + d.number : ''}</div>
                    <div class="sub">{vname(d.imei)}{d.issuer ? ' · ' + d.issuer : ''}</div>
                  </span>
                  <span class="rt">
                    {ex && <span class={'adm-pill ' + ex.cls}>{ex.label}</span>}
                    {canWrite && <button class="icon-btn-sm danger" onClick={() => setConfirmDel(d)}><Icon name="trash" size={17} /></button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canWrite && <button class="fab" onClick={openAdd} aria-label="Adaugă document"><Icon name="plus" size={26} color="#06210f" /></button>}

      {add && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setAdd(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> Adaugă document</b><button class="h-btn" onClick={() => setAdd(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Vehicul <span class="req">*</span></label>
                  <select value={form.imei} onChange={(e) => setF('imei', (e.target as HTMLSelectElement).value)}>
                    <option value="">— alege vehiculul —</option>
                    {vlist.slice().sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei)).map((v) => <option value={v.imei}>{v.name || v.plate || v.imei}</option>)}
                  </select>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Tip <span class="req">*</span></label>
                    <select value={form.doc_type} onChange={(e) => setF('doc_type', (e.target as HTMLSelectElement).value)}>{DOC_TYPES.map((t) => <option value={t}>{t}</option>)}</select>
                  </div>
                  <div class="fld"><label>Număr</label><input value={form.number} onInput={(e) => setF('number', (e.target as HTMLInputElement).value)} placeholder="Serie / nr." /></div>
                </div>
                <div class="fld"><label>Emitent</label><input value={form.issuer} onInput={(e) => setF('issuer', (e.target as HTMLInputElement).value)} placeholder="Opțional" /></div>
                <div class="frm-row">
                  <div class="fld"><label>Data emiterii</label><input type="date" value={form.issue_date} onInput={(e) => setF('issue_date', (e.target as HTMLInputElement).value)} /></div>
                  <div class="fld"><label>Expirare</label><input type="date" value={form.expiry_date} onInput={(e) => setF('expiry_date', (e.target as HTMLInputElement).value)} /></div>
                </div>
                <div class="fld"><label>Note</label><textarea value={form.notes} onInput={(e) => setF('notes', (e.target as HTMLTextAreaElement).value)} rows={2} placeholder="Opțional" /></div>
                <div class="muted" style="font-size:11.5px">Atașarea de fotografii la documente sosește în curând.</div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Adaugă'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setConfirmDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Confirmare ștergere</b><button class="h-btn" onClick={() => setConfirmDel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px">Sigur ștergi „<b>{confirmDel.doc_type}{confirmDel.number ? ' · ' + confirmDel.number : ''}</b>”?</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmDel(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={saving} onClick={() => doDelete(confirmDel)}>{saving ? '…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
