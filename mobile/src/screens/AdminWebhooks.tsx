import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Evenimentele pe care le emite backend-ul către webhooks (din evaluateUserEvents).
const EVENTS = [
  { v: 'overspeed', label: 'Depășire viteză' },
  { v: 'fuel_drop', label: 'Scădere combustibil' },
  { v: 'idling', label: 'Idling prelungit' },
  { v: 'engine_temp', label: 'Temperatură motor' },
  { v: 'overload', label: 'Supraîncărcare' },
  { v: 'low_voltage', label: 'Tensiune scăzută' },
  { v: 'no_ignition_move', label: 'Mișcare fără contact' },
  { v: 'dtc_error', label: 'Erori motor (DTC)' },
];

export function AdminWebhooks() {
  const loc = useLocation();
  const canWrite = !!me.value?.permissions?.manageUsers;
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [add, setAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [sel, setSel] = useState<string[]>([]); // gol = toate evenimentele
  const [newSecret, setNewSecret] = useState('');

  async function reload() {
    setErr('');
    try { setItems(await Api.webhooks()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Doar administratorii pot gestiona integrările.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => { reload(); }, []);

  function openAdd() { setUrl(''); setSel([]); setNewSecret(''); setAdd(true); }
  function toggleEv(v: string) { setSel((c) => c.includes(v) ? c.filter((x) => x !== v) : [...c, v]); }

  async function save() {
    if (!/^https?:\/\/.+/i.test(url.trim())) { showToast('URL invalid (http/https)', true); return; }
    setBusy(true);
    try {
      const w = await Api.createWebhook({ url: url.trim(), events: sel.length ? sel : null });
      // Secretul se afișează O SINGURĂ DATĂ (semnătura HMAC X-RaTracks-Signature).
      setNewSecret(w.secret || ''); setUrl(''); setSel([]);
      showToast('Webhook creat'); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setBusy(false); }
  }
  async function test(w: any) {
    setBusy(true);
    try { await Api.testWebhook(w.id); showToast('Eveniment de test trimis'); setTimeout(reload, 1500); }
    catch (e: any) { showToast(e?.message || 'Eroare la test', true); }
    finally { setBusy(false); }
  }
  async function doDelete(w: any) {
    setBusy(true);
    try { await Api.deleteWebhook(w.id); showToast('Șters'); setConfirmDel(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setBusy(false); }
  }

  const statusPill = (w: any) => {
    if (w.last_status == null) return <span class="adm-pill">netestat</span>;
    const ok = w.last_status >= 200 && w.last_status < 300;
    return <span class={'adm-pill ' + (ok ? 'ok' : 'bad')}>{ok ? 'OK ' + w.last_status : (w.last_status || 'eroare')}</span>;
  };

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Webhooks (integrări)</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="zap" size={40} class="ic" /><div>Niciun webhook. Trimite evenimentele flotei către ERP/TMS.</div></div>}
        {items != null && items.length > 0 && (
          <>
            <div class="muted" style="font-size:12.5px;margin-bottom:12px">Evenimentele (depășire viteză, combustibil, idling…) sunt trimise prin POST JSON, semnate HMAC SHA-256 în antetul <b>X-RaTracks-Signature</b>.</div>
            <div class="adm-list">
              {items.map((w) => (
                <div class="adm-item" style="align-items:flex-start">
                  <span class="ic-wrap"><Icon name="zap" size={19} /></span>
                  <span class="mid">
                    <div class="nm" style="font-family:inherit;word-break:break-all">{w.url}</div>
                    <div class="sub">{(w.events && w.events.length) ? w.events.join(', ') : 'toate evenimentele'}</div>
                  </span>
                  <span class="rt" style="flex-direction:column;align-items:flex-end;gap:6px">
                    {statusPill(w)}
                    {canWrite && <span style="display:flex;gap:6px">
                      <button class="icon-btn-sm" style="color:var(--accent)" disabled={busy} onClick={() => test(w)} title="Testează"><Icon name="navigate" size={16} /></button>
                      <button class="icon-btn-sm danger" onClick={() => setConfirmDel(w)}><Icon name="trash" size={16} /></button>
                    </span>}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {canWrite && <button class="fab" onClick={openAdd} aria-label="Adaugă webhook"><Icon name="plus" size={26} color="#06210f" /></button>}

      {add && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setAdd(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="zap" size={18} color="var(--accent)" /> Adaugă webhook</b><button class="h-btn" onClick={() => setAdd(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              {newSecret ? (
                <div class="frm">
                  <div class="muted" style="font-size:13px">Webhook creat. Salvează secretul (nu va mai fi afișat) — verifică semnătura HMAC cu el:</div>
                  <div class="fld"><label>Secret HMAC</label><input value={newSecret} readonly onClick={(e) => (e.target as HTMLInputElement).select()} style="font-family:inherit" /></div>
                  <div class="frm-actions"><button class="btn btn-primary" onClick={() => { setNewSecret(''); setAdd(false); }}>Gata</button></div>
                </div>
              ) : (
                <div class="frm">
                  <div class="fld"><label>URL destinație <span class="req">*</span></label><input value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://erp.exemplu.ro/webhook" autocapitalize="none" /></div>
                  <div class="fld"><label>Evenimente (gol = toate)</label>
                    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:2px">
                      {EVENTS.map((ev) => (
                        <button class={'chip' + (sel.includes(ev.v) ? ' on' : '')} onClick={() => toggleEv(ev.v)}
                          style={`border:1px solid ${sel.includes(ev.v) ? 'var(--accent)' : 'var(--border)'};color:${sel.includes(ev.v) ? 'var(--accent)' : 'var(--text-secondary)'};background:var(--bg-dark);border-radius:999px;padding:7px 12px;font-size:12.5px;font-family:inherit`}>{ev.label}</button>
                      ))}
                    </div>
                  </div>
                  <div class="frm-actions"><button class="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Se salvează…' : 'Creează webhook'}</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirmDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Confirmare ștergere</b><button class="h-btn" onClick={() => setConfirmDel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px;word-break:break-all">Sigur ștergi webhook-ul „<b>{confirmDel.url}</b>”?</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmDel(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={busy} onClick={() => doDelete(confirmDel)}>{busy ? '…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
