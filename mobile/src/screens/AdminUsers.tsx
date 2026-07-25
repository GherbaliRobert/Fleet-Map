import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Roluri atribuibile: super-admin = TOATE (inclusiv „Administrator companie"); company_admin = doar non-admin.
const COMPANY_ROLES = [
  { v: 'manager', label: 'Manager' },
  { v: 'dispatcher', label: 'Dispecer' },
  { v: 'client', label: 'Client' },
  { v: 'viewer', label: 'Vizualizare' },
];
// „superadmin" = cont de PLATFORMĂ (toate companiile), nu de companie → doar un super-admin îl poate acorda.
const SUPER_ROLES = [{ v: 'company_admin', label: 'Administrator companie' }, { v: 'admin', label: 'Admin' }, ...COMPANY_ROLES, { v: 'superadmin', label: '⚠ Super-admin (platformă)' }];
const roleLabel = (v: string) => ({ company_admin: 'Administrator', admin: 'Administrator', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Vizualizare', superadmin: 'Super-admin' } as Record<string, string>)[v] || v;

export function AdminUsers() {
  const loc = useLocation();
  const myUsername = me.value?.username;
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // {} = nou
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);

  async function reload() {
    setErr('');
    try { setItems(await Api.users()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Doar administratorii pot gestiona utilizatori.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => { reload(); }, []);

  function openNew() { setForm({ username: '', password: '', full_name: '', email: '', phone: '', role: 'viewer' }); setEditing({}); }
  function openEdit(u: any) {
    setForm({ username: u.username, full_name: u.full_name || '', email: u.email || '', phone: u.phone || '', role: u.role, active: u.active !== false });
    setEditing(u);
  }
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const isEdit = editing && editing.id != null;
  const isSelf = isEdit && editing.username === myUsername;
  const isAdminRole = isEdit && ['company_admin', 'admin', 'superadmin'].includes(editing.role);
  const isSuper = !!me.value?.isSuper;
  const lockRole = isAdminRole && !isSuper; // super-adminul POATE schimba rolul oricui; adminul firmei nu poate atinge rolurile admin
  const baseRoles = isSuper ? SUPER_ROLES : COMPANY_ROLES;
  const roleOpts = (isEdit && editing.role && !baseRoles.some((r) => r.v === editing.role)) ? [{ v: editing.role, label: roleLabel(editing.role) }, ...baseRoles] : baseRoles;

  async function save() {
    if (!isEdit) {
      if (!form.username.trim() || form.username.trim().length < 3) { showToast('Username minim 3 caractere', true); return; }
      if (!form.password || form.password.length < 4) { showToast('Parola minim 4 caractere', true); return; }
    }
    // Acordarea rolului de platformă e ireversibilă din perspectiva datelor văzute → confirmare explicită.
    if (form.role === 'superadmin' && (!isEdit || editing.role !== 'superadmin')) {
      const who = isEdit ? editing.username : form.username.trim();
      if (!confirm('Acorzi rolul de SUPER-ADMIN?\n\n„' + who + '" va vedea și administra TOATE companiile, toate vehiculele și facturarea platformei — nu doar o companie.')) return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await Api.updateUser(editing.id, { role: form.role, full_name: form.full_name || null, email: form.email || null, phone: form.phone || null, active: form.active });
        showToast('Salvat');
      } else {
        await Api.createUser({ username: form.username.trim(), password: form.password, role: form.role, full_name: form.full_name || null, email: form.email || null, phone: form.phone || null });
        showToast('Utilizator creat');
      }
      setEditing(null); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  async function doDelete(u: any) {
    setSaving(true);
    try { await Api.deleteUser(u.id); showToast('Șters'); setConfirmDel(null); setEditing(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Utilizatori</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="user" size={40} class="ic" /><div>Niciun utilizator.</div></div>}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((u) => (
              <button class="adm-item" onClick={() => openEdit(u)}>
                <span class="ic-wrap"><Icon name="user" size={19} /></span>
                <span class="mid">
                  <div class="nm">{u.full_name || u.username}</div>
                  <div class="sub">@{u.username} · {roleLabel(u.role)}</div>
                </span>
                <span class="rt">
                  <span class={'adm-pill ' + (u.active !== false ? 'ok' : 'bad')}>{u.active !== false ? 'activ' : 'inactiv'}</span>
                  <Icon name="chevronR" size={18} color="var(--text-muted)" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button class="fab" onClick={openNew} aria-label="Adaugă utilizator"><Icon name="plus" size={26} color="#06210f" /></button>

      {editing && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="user" size={18} color="var(--accent)" /> {isEdit ? 'Editează utilizator' : 'Adaugă utilizator'}</b><button class="h-btn" onClick={() => setEditing(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                {isEdit ? (
                  <div class="fld"><label>Utilizator</label><input value={form.username} disabled style="opacity:.6" /></div>
                ) : (
                  <>
                    <div class="fld"><label>Utilizator <span class="req">*</span></label><input value={form.username} onInput={(e) => setF('username', (e.target as HTMLInputElement).value)} placeholder="min. 3 caractere" autocapitalize="none" /></div>
                    <div class="fld"><label>Parolă <span class="req">*</span></label><input type="password" value={form.password} onInput={(e) => setF('password', (e.target as HTMLInputElement).value)} placeholder="min. 4 caractere" /></div>
                  </>
                )}
                <div class="fld"><label>Nume complet</label><input value={form.full_name} onInput={(e) => setF('full_name', (e.target as HTMLInputElement).value)} placeholder="Opțional" /></div>
                <div class="frm-row">
                  <div class="fld"><label>Email</label><input type="email" value={form.email} onInput={(e) => setF('email', (e.target as HTMLInputElement).value)} /></div>
                  <div class="fld"><label>Telefon</label><input type="tel" value={form.phone} onInput={(e) => setF('phone', (e.target as HTMLInputElement).value)} /></div>
                </div>
                <div class="fld"><label>Rol</label>
                  {lockRole ? (
                    <input value={roleLabel(editing.role)} disabled style="opacity:.6" />
                  ) : (
                    <select value={form.role} onChange={(e) => setF('role', (e.target as HTMLSelectElement).value)} disabled={isSelf}>
                      {roleOpts.map((r) => <option value={r.v}>{r.label}</option>)}
                    </select>
                  )}
                  {form.role === 'superadmin' && (
                    <div style="background:rgba(239,68,68,.12);color:var(--red);border-radius:8px;padding:7px 10px;margin-top:6px;font-size:11.5px;line-height:1.45">
                      Cont de <b>platformă</b>: vede și administrează <b>toate companiile</b>, toate vehiculele, facturarea și jurnalul de audit. Nu se leagă de nicio companie.
                    </div>
                  )}
                </div>
                {isEdit && !isSelf && (
                  <div class="fld"><label>Stare</label>
                    <select value={form.active ? 'true' : 'false'} onChange={(e) => setF('active', (e.target as HTMLSelectElement).value === 'true')}>
                      <option value="true">Activ</option>
                      <option value="false">Inactiv (acces blocat)</option>
                    </select>
                  </div>
                )}
                {isSelf && <div class="muted" style="font-size:12px">Nu îți poți schimba propriul rol sau dezactiva propriul cont.</div>}
                <div class="frm-actions">
                  {isEdit && !isSelf && <button class="btn btn-danger-ghost" disabled={saving} onClick={() => setConfirmDel(editing)}><Icon name="trash" size={16} /></button>}
                  <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
                </div>
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
              <p style="margin:0 0 16px;font-size:14.5px">Sigur ștergi utilizatorul „<b>{confirmDel.username}</b>”? Acțiunea nu poate fi anulată.</p>
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
