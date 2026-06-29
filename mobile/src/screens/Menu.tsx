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
        {perms.viewReports && item('clock', 'Rapoarte programate', () => loc.route('/report-schedules'))}
        {u?.features?.ai_assistant && item('robot', 'Asistent AI', () => loc.route('/ai'))}

        <div class="mn-sec">Module</div>
        {u?.features?.etransport
          ? item('truck', 'e-Transport (ANAF)', () => loc.route('/etransport'))
          : soon('truck', 'e-Transport (ANAF)')}
        {item('flame', 'E-Toll & Roviniete', () => loc.route('/etoll'))}
        {u?.features?.tahograf && item('disc', 'Tahograf', () => loc.route('/tahograf'))}
        {perms.viewReports && item('mapPin', 'Hotspot & Rutare', () => loc.route('/hotspot'))}

        {(perms.manageFleet || perms.manageUsers) && (
          <>
            <div class="mn-sec">Administrare</div>
            {perms.manageFleet && item('user', 'Șoferi', () => loc.route('/admin/drivers'))}
            {perms.manageFleet && item('layers', 'Grupe', () => loc.route('/admin/groups'))}
            {perms.manageFleet && item('wrench', 'Mentenanță', () => loc.route('/admin/maintenance'))}
            {perms.manageFleet && item('report', 'Documente vehicule', () => loc.route('/admin/documents'))}
            {perms.manageFleet && item('truck', 'Vehicule (editare fișă)', () => loc.route('/vehicles'))}
            {perms.manageFleet && item('alert', 'Alerte', () => loc.route('/admin/alerts'))}
            {perms.manageUsers && item('user', 'Utilizatori', () => loc.route('/admin/users'))}
            {perms.manageUsers && item('report', u?.isSuper ? 'Facturare' : 'Facturile mele', () => loc.route('/billing'))}
            {perms.manageUsers && item('zap', 'Webhooks (integrări)', () => loc.route('/admin/webhooks'))}
          </>
        )}

        {u?.isSuper && (
          <>
            <div class="mn-sec">Platformă (super-admin)</div>
            {item('chart', 'Dashboard platformă', () => loc.route('/admin/platform'))}
            {item('layers', 'Companii', () => loc.route('/admin/companies'))}
            {item('cpu', 'Dispozitive (toate)', () => loc.route('/admin/devices'))}
            {item('trash', 'Dispozitive arhivate', () => loc.route('/admin/archived'))}
            {item('zap', 'Control costuri', () => loc.route('/admin/costs'))}
            {item('fileBar', 'Ofertare Live', () => loc.route('/admin/offers'))}
          </>
        )}

        <div class="mn-sec">Cont & setări</div>
        {item(theme.value === 'dark' ? 'moon' : 'sun', 'Temă', () => toggleTheme(), theme.value === 'dark' ? 'Întunecat' : 'Luminos')}
        {item('bell', 'Preferințe notificări', () => loc.route('/notif-prefs'))}
        {(perms.manageFleet || perms.manageUsers) && item('settings', 'Setări companie', () => loc.route('/settings'))}
        {item('headset', 'Suport clienți', () => setSupport(true))}
        {item('logout', 'Deconectare', () => logout(), null, 'danger')}

        <div class="mn-foot">RA Tracks · v0.1</div>
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
