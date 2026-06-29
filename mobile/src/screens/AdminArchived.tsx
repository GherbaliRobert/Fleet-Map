import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';

// Dispozitive arhivate: list (super = toate companiile, admin = ale companiei) + restaurare. Ștergere definitivă DOAR super-admin.
const actBtn = 'background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:5px;color:var(--accent)';

export function AdminArchived() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  function reload() {
    setErr('');
    Api.archivedDevices().then(setItems).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, []);

  async function restore(imei: string) {
    setBusy(imei);
    try { await Api.restoreDevice(imei); showToast('Dispozitiv restaurat'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }
  async function del(imei: string) {
    if (!confirm('Ștergi DEFINITIV ' + imei + ' + tot istoricul lui? Ireversibil.')) return;
    setBusy(imei);
    try { await Api.deleteDevice(imei); showToast('Dispozitiv șters'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispozitive arhivate</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && (
          <div class="adm-empty"><Icon name="trash" size={40} class="ic" /><div>Niciun dispozitiv arhivat.</div></div>
        )}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((d) => (
              <div class="adm-item" style="cursor:default">
                <span class="ic-wrap"><Icon name="cpu" size={19} /></span>
                <span class="mid">
                  <div class="nm">{d.name || d.imei}{d.plate ? ' · ' + d.plate : ''}</div>
                  <div class="sub">{(isSuper && d.company_name ? d.company_name + ' · ' : '') + 'IMEI ' + d.imei}</div>
                </span>
                <span class="rt" style="display:flex;gap:6px;flex-shrink:0">
                  <button style={actBtn} disabled={busy === d.imei} onClick={() => restore(d.imei)}><Icon name="refresh" size={14} /> Restaurează</button>
                  {isSuper && <button style={actBtn + ';color:var(--red)'} disabled={busy === d.imei} onClick={() => del(d.imei)}><Icon name="trash" size={14} /></button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
