import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, theme, toggleTheme, logout, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon, type IconName } from '../components/Icon';
import './menu.css';
import './detail.css'; // pentru .sheet*

export function Menu() {
  const loc = useLocation();
  const u = me.value;
  const perms = u?.permissions || {};
  const [support, setSupport] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  function item(icon: IconName, label: string, onClick: () => void, right?: any, cls = '') {
    return (
      <button class={'mn-item ' + cls} onClick={onClick}>
        <Icon name={icon} size={20} class="ic" />
        <span class="lbl">{label}</span>
        {right != null ? <span class="rt">{right}</span> : <Icon name="chevronR" size={18} color="var(--text-muted)" />}
      </button>
    );
  }
  function soon(icon: IconName, label: string) {
    return <div class="mn-item mn-soon"><Icon name={icon} size={20} class="ic" /><span class="lbl">{label}</span><span class="tag">în curând</span></div>;
  }

  async function sendSupport() {
    if (!msg.trim()) return;
    setSending(true);
    try { await Api.support(msg.trim()); showToast('Mesaj trimis. Te contactăm în curând.'); setSupport(false); setMsg(''); }
    catch (e: any) { showToast(e?.message || 'Eroare la trimitere', true); }
    finally { setSending(false); }
  }

  const initials = (u?.username || '?').slice(0, 2).toUpperCase();

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Meniu</div></header>
      <div class="content has-tabbar">
        <div class="mn-user">
          <div class="mn-ava">{initials}</div>
          <div><div class="nm">{u?.username || '—'}</div><div class="sub">{u?.company?.name || roleLabel(u?.role)}</div></div>
        </div>

        <div class="mn-sec">Analize</div>
        {item('droplet', 'Statistici consum', () => loc.route('/fuelstats'))}
        {perms.viewAll && item('calendar', 'Raport săptămânal', () => loc.route('/weekly'))}

        <div class="mn-sec">Module</div>
        {soon('truck', 'e-Transport (ANAF)')}
        {soon('flame', 'E-Toll & Roviniete')}
        {soon('disc', 'Tahograf')}
        {soon('mapPin', 'Hotspot & Rutare')}

        {(perms.manageFleet || perms.manageUsers) && (
          <>
            <div class="mn-sec">Administrare</div>
            {soon('truck', 'Vehicule (editare, documente)')}
            {soon('user', 'Șoferi')}
            {soon('layers', 'Grupe')}
            {soon('alert', 'Alerte')}
            {soon('wrench', 'Mentenanță')}
            {perms.manageUsers && soon('user', 'Utilizatori')}
          </>
        )}

        <div class="mn-sec">Cont & setări</div>
        {item(theme.value === 'dark' ? 'moon' : 'sun', 'Temă', () => toggleTheme(), theme.value === 'dark' ? 'Întunecat' : 'Luminos')}
        {soon('bell', 'Preferințe notificări')}
        {item('headset', 'Suport clienți', () => setSupport(true))}
        {item('logout', 'Deconectare', () => logout(), null, 'danger')}

        <div class="mn-foot">RA Tracks · v0.1<br />Mai multe funcții de administrare și module sosesc în curând.</div>
      </div>

      {support && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSupport(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="headset" size={18} color="var(--accent)" /> Suport clienți</b><button class="h-btn" onClick={() => setSupport(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
                <a href="tel:+40312295000" class="mn-item" style="border-radius:9px;border:1px solid var(--border)"><Icon name="headset" size={18} class="ic" /><span class="lbl">0312 295 000</span></a>
                <a href="mailto:suport@ratrack.ro" class="mn-item" style="border-radius:9px;border:1px solid var(--border)"><Icon name="report" size={18} class="ic" /><span class="lbl">suport@ratrack.ro</span></a>
              </div>
              <div class="muted" style="font-size:12.5px;margin-bottom:8px">Sau trimite-ne un mesaj direct:</div>
              <textarea value={msg} onInput={(e) => setMsg((e.target as HTMLTextAreaElement).value)} rows={4} placeholder="Descrie problema sau întrebarea ta…"
                style="width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:11px;font-size:15px;font-family:inherit;resize:vertical" />
              <button class="btn btn-primary btn-block" style="margin-top:10px" disabled={sending} onClick={sendSupport}>{sending ? 'Se trimite…' : 'Trimite mesajul'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roleLabel(r?: string) {
  const m: Record<string, string> = { company_admin: 'Administrator', admin: 'Administrator', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Vizualizare' };
  return (r && m[r]) || r || '';
}
