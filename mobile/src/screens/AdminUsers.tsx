import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { UserVehicleAccess } from '../components/UserVehicleAccess';
import type { AccessTarget } from '../components/UserVehicleAccess';
import './detail.css';
import './admin.css';

// Parola scrisă de admin: aceeași limită ca pe server (PAROLA_MIN din server.js). Fără parolă = invitație pe email.
const PAROLA_MIN = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// Numele standard din listă, ca pe web (ROLE_LABELS). Numele date de firmă le bat (vin din /api/company-roles).
const LIST_NAME: Record<string, string> = { company_admin: 'Admin companie', admin: 'Admin', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Viewer', superadmin: 'Super-admin' };
// Explicația din paranteză din formularul de adăugare (web: #new-role). La redenumire se schimbă doar numele.
const EXPL: Record<string, string> = { manager: 'toată flota, editează', dispatcher: 'atribuit + confirmă alerte', viewer: 'doar se uită, la mașinile atribuite' };
// Rolurile care au „Vede toată flota" din oficiu (ROLE_PERMISSIONS.viewAll pe server). Firma îl poate tăia din manager.
const VIEW_ALL_BASE = ['superadmin', 'company_admin', 'admin', 'manager'];
const ADMIN_ROLES = ['company_admin', 'admin', 'superadmin'];

type RoleOpt = { v: string; label: string; baza: string; propriu?: boolean };
type Notice = { text: string; err?: boolean; retry?: { label: string; run: () => void } };
type InviteNote = { text: string; err: boolean } | null;

export function AdminUsers() {
  const loc = useLocation();
  const myUsername = me.value?.username;
  const isSuper = !!me.value?.isSuper;
  const [items, setItems] = useState<any[] | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // {} = nou
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  // Erorile din formular stau în foaie până le închide omul (pe web: alert). Un toast de 2-3 secunde
  // pierdea exact mesajele de citit, ex. „Serverul nu are email configurat… Scrie o parolă pentru cont."
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [accessFor, setAccessFor] = useState<AccessTarget | null>(null);
  const [seatBusy, setSeatBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cos, setCos] = useState<any[] | null>(null); // super-admin: companiile pentru contul nou (o singură încărcare)
  const [coFilter, setCoFilter] = useState('');

  async function reload() {
    setErr('');
    // Rolurile firmei (nume date de firmă + roluri proprii) nu sunt vitale: fără ele rămân numele standard.
    const rolesP = Api.companyRoles().then((r) => (Array.isArray(r) ? r : [])).catch(() => [] as any[]);
    try {
      const list = await Api.users();
      const arr = Array.isArray(list) ? list : [];
      setItems(arr);
      // Sheet-ul deschis arată date proaspete (ex. numărul de vehicule după atribuire).
      setEditing((prev: any) => (prev && prev.id != null ? (arr.find((x) => x.id === prev.id) || prev) : prev));
    } catch (e: any) {
      setErr(e?.status === 403 ? 'Doar administratorii pot gestiona utilizatori.' : (e?.message || 'Eroare la încărcare'));
      setItems([]);
    }
    setRoles(await rolesP);
  }
  useEffect(() => { reload(); }, []);

  const byKey = useMemo(() => {
    const m: Record<string, any> = {};
    roles.forEach((r) => { if (r && r.rol) m[r.rol] = r; });
    return m;
  }, [roles]);
  // Rolurile firmei vin din /api/company-roles, care răspunde pentru firma CONTULUI. Super-adminul (fără firmă)
  // primește doar rolurile standard, fără rolurile proprii și tăierile altor firme → acolo baza e rolul standard
  // salvat la om (users.role), ca în lista de pe web.
  const baseOf = (key: string, fallback?: string) => (byKey[key] && byKey[key].baza) || fallback || key;
  const userRoleKey = (u: any) => u.role_slug || u.role;
  const roleName = (key: string) => { const r = byKey[key]; return (r && (r.nume || r.numeStandard)) || LIST_NAME[key] || key; };
  function listLabel(u: any) {
    if (u.role_slug) { const r = byKey[u.role_slug]; return (r && (r.nume || r.numeStandard)) || u.role_slug_name || 'Rol propriu'; }
    return (byKey[u.role] && byKey[u.role].nume) || LIST_NAME[u.role] || u.role;
  }
  // „Vede toată flota": din rolul de bază, minus tăierea făcută de firmă (drepturi → viewAll).
  function seesAll(key: string, baseFallback?: string) {
    if (!VIEW_ALL_BASE.includes(baseOf(key, baseFallback))) return false;
    const r = byKey[key];
    const d = r && Array.isArray(r.drepturi) ? r.drepturi.find((x: any) => x.cheie === 'viewAll') : null;
    return !(d && d.are === false);
  }
  function accessText(u: any) {
    // Serverul socotește „vede toată flota" cu tăierile firmei omului (sees_all) — singura sursă corectă pentru
    // super-admin, care nu primește rolurile altor firme. Calculul local rămâne doar pentru un server vechi.
    if (u.role === 'superadmin' || (typeof u.sees_all === 'boolean' ? u.sees_all : seesAll(userRoleKey(u), u.role))) return 'toată flota';
    const dc = Number(u.device_count) || 0, gc = Number(u.group_count) || 0;
    return dc + gc > 0 ? dc + ' veh. + ' + gc + ' grupe' : '⚠ fără acces';
  }
  // Rolurile pe care serverul le acceptă de la contul ăsta: adminul firmei → manager/dispecer/viewer + rolurile
  // proprii; super-adminul → toate cele standard. „Client" nu se mai oferă (aceleași drepturi ca Viewer).
  function roleOptions(forAdd: boolean): RoleOpt[] {
    const std = (k: string, short: string): RoleOpt => {
      const n = (byKey[k] && byKey[k].nume) || short;
      return { v: k, baza: k, label: forAdd && EXPL[k] ? n + ' (' + EXPL[k] + ')' : n };
    };
    const company = [std('manager', 'Manager'), std('dispatcher', 'Dispecer'), std('viewer', 'Viewer')];
    const proprii: RoleOpt[] = roles.filter((r) => r && r.propriu && r.baza)
      .map((r) => ({ v: r.rol, baza: r.baza, label: (r.nume || r.numeStandard || r.rol) + ' (rol propriu)', propriu: true }));
    if (!isSuper) return company.concat(proprii);
    return [
      { v: 'company_admin', baza: 'company_admin', label: forAdd ? 'Administrator companie (control total)' : 'Administrator companie' },
      { v: 'admin', baza: 'admin', label: forAdd ? 'Admin (control total)' : 'Admin' },
      ...company, ...proprii,
      { v: 'superadmin', baza: 'superadmin', label: forAdd ? '⚠ Super-admin (PLATFORMĂ — toate companiile)' : '⚠ Super-admin (platformă)' },
    ];
  }

  async function ensureCompanies() {
    if (cos) return;
    try {
      const l = await Api.companies();
      setCos((Array.isArray(l) ? l : []).filter((c: any) => !c.is_demo).sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'ro')));
    } catch { setCos([]); }
  }
  function openNew() {
    setForm({ username: '', password: '', full_name: '', phone: '', role: 'viewer', company_id: isSuper && coFilter && coFilter !== '_none' ? coFilter : '' });
    setFormErr('');
    setEditing({});
    setNotice(null);
    if (isSuper) ensureCompanies();
  }
  function openEdit(u: any) {
    setForm({ username: u.username, full_name: u.full_name || '', email: u.email || '', phone: u.phone || '', role: userRoleKey(u), active: u.active !== false, password: '' });
    setFormErr('');
    setEditing(u);
  }
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const isEdit = editing && editing.id != null;
  const isSelf = isEdit && editing.username === myUsername;
  const isAdminRole = isEdit && ADMIN_ROLES.includes(editing.role);
  const lockRole = isAdminRole && !isSuper; // super-adminul POATE schimba rolul oricui; adminul firmei nu poate atinge rolurile admin
  const initialRole = isEdit ? userRoleKey(editing) : null;
  const baseRoles = roleOptions(!isEdit);
  // Rolul curent al omului, când nu e printre cele oferite (ex. rolul propriu al altei firme, văzut de super-admin).
  const roleOpts: RoleOpt[] = (isEdit && initialRole && !baseRoles.some((r) => r.v === initialRole))
    ? [{ v: initialRole, baza: editing.role, label: listLabel(editing) + (editing.role_slug ? ' (rol propriu)' : ''), propriu: !!editing.role_slug }, ...baseRoles]
    : baseRoles;
  const optOf = (key: string) => roleOpts.find((r) => r.v === key);
  const formBase = (optOf(form.role) || { baza: baseOf(form.role) }).baza;
  const targetOf = (u: any): AccessTarget => ({ id: u.id, username: u.username, full_name: u.full_name, company_id: u.company_id });

  // Rolul propriu n-a putut fi pus pe contul nou: mesajul rămâne pe ecran, cu buton de reîncercare.
  function roleRetryNotice(t: AccessTarget, opt: RoleOpt, why: string, invite: InviteNote) {
    setNotice({
      err: true,
      text: 'Contul ' + t.username + ' a fost creat, dar rolul „' + roleName(opt.v) + '" nu s-a putut pune (' + why + '). '
        + 'Până atunci contul rămâne ' + roleName('viewer') + ' și nu vede nicio mașină.' + (invite ? ' ' + invite.text : ''),
      retry: { label: 'Pune din nou rolul', run: () => { retryRole(t, opt, invite); } },
    });
  }
  async function retryRole(t: AccessTarget, opt: RoleOpt, invite: InviteNote) {
    setRetrying(true);
    try {
      await Api.updateUser(t.id, { role: opt.v });
      setNotice({ text: 'Rolul „' + roleName(opt.v) + '" a fost pus pe contul ' + t.username + '.' + (invite ? ' ' + invite.text : ''), err: !!(invite && invite.err) });
      await reload();
      if (!seesAll(opt.v, opt.baza)) setAccessFor(t);
    } catch (e: any) {
      roleRetryNotice(t, opt, e?.message || 'eroare', invite);
    } finally { setRetrying(false); }
  }

  async function save() {
    setFormErr('');
    const full_name = String(form.full_name || '').trim();
    const username = String(form.username || '').trim().toLowerCase();
    if (!isEdit) {
      // Contul se creează pe adresa de email: ea e utilizatorul de autentificare ȘI adresa pe care pleacă invitația.
      if (!username) { setFormErr('Scrie adresa de email a persoanei.'); return; }
      if (!EMAIL_RE.test(username)) { setFormErr('Utilizatorul trebuie să fie o adresă de email validă (ex. ion.popescu@firma.ro).'); return; }
    }
    if (full_name.length < 2) { setFormErr('Completează numele afișat — așa apare persoana în aplicație.'); return; }
    if (form.password && String(form.password).length < PAROLA_MIN) { setFormErr('Parola trebuie să aibă minim ' + PAROLA_MIN + ' caractere.'); return; }
    if (!isEdit && isSuper && form.role !== 'superadmin' && !form.company_id) { setFormErr('Selectează compania pentru noul cont.'); return; }
    // Acordarea rolului de platformă e ireversibilă din perspectiva datelor văzute → confirmare explicită.
    if (form.role === 'superadmin' && (!isEdit || editing.role !== 'superadmin')) {
      const who = isEdit ? editing.username : username;
      if (!confirm('Acorzi rolul de SUPER-ADMIN?\n\n„' + who + '" va vedea și administra TOATE companiile, toate vehiculele și facturarea platformei — nu doar o companie.')) return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const body: any = { full_name, email: form.email || null, phone: form.phone || null, active: form.active };
        // Rolul pleacă DOAR dacă adminul l-a schimbat: altfel o simplă corectură de telefon ar muta un om de pe
        // rolul propriu pe cel standard (sau ar fi refuzată ca „Rol invalid" la rolurile pe care nu le poate atinge).
        if (!lockRole && !isSelf && form.role !== initialRole) {
          body.role = form.role;
          // Rol STANDARD ales → spunem explicit că omul iese de pe rolul propriu (ca pe web). Serverul păstrează
          // rolul propriu când primește doar rolul standard din care derivă: fără asta, „Dispecer" ales pentru un
          // om cu rol propriu făcut din Dispecer se salva „cu succes", dar omul rămânea pe rolul propriu.
          const ales = optOf(form.role);
          if (!(ales && ales.propriu)) body.role_slug = null;
        }
        await Api.updateUser(editing.id, body);
        if (form.password) {
          try { await Api.setUserPassword(editing.id, form.password); }
          catch (e: any) { setFormErr('Datele s-au salvat, dar parola nu: ' + (e?.message || 'eroare')); setSaving(false); await reload(); return; }
        }
        showToast('Salvat');
        setEditing(null); await reload();
      } else {
        const opt = optOf(form.role);
        const propriu = !!(opt && opt.propriu);
        // Rolul propriu se pune în doi pași (serverul nu-l primește la creare): contul pornește ca Viewer — cele mai
        // puține drepturi, iar fără vehicule atribuite nu vede nicio mașină — și abia apoi primește rolul propriu.
        // Dacă al doilea pas cade (ex. fără semnal), omul NU rămâne pe rolul de bază cu toate drepturile lui.
        const body: any = { username, role: propriu ? 'viewer' : form.role, full_name, email: username, phone: form.phone || null };
        if (form.password) body.password = form.password;
        if (isSuper && form.role !== 'superadmin') body.company_id = parseInt(form.company_id, 10);
        const created: any = await Api.createUser(body);
        // Omul trebuie să afle DACĂ a plecat invitația — altfel așteaptă degeaba un email care n-a plecat.
        const invite: InviteNote = form.password ? null : (created && created.invitat
          ? { text: 'I-am trimis invitația pe ' + username + ' — își pune singur parola.', err: false }
          : { text: 'Invitația NU a plecat. Trimite-i tu o parolă din „Editează", altfel nu poate intra.', err: true });
        const target: AccessTarget = { id: created && created.id, username, full_name, company_id: created && created.company_id };
        let roleErr = '';
        if (propriu && created && created.id != null) {
          try { await Api.updateUser(created.id, { role: form.role }); }
          catch (e: any) { roleErr = e?.message || 'eroare'; }
        }
        setEditing(null);
        if (roleErr) {
          roleRetryNotice(target, opt!, roleErr, invite);
          await reload();
          return;
        }
        if (invite) {
          setNotice({ text: invite.err ? 'Cont creat, dar invitația NU a plecat. Trimite-i tu o parolă din „Editează", altfel nu poate intra.' : 'Cont creat. ' + invite.text, err: invite.err });
        } else if (form.role === 'superadmin') {
          showToast('Cont de super-admin creat ✓ — se poate autentifica imediat');
        } else {
          showToast('Utilizator creat');
        }
        const role = form.role;
        await reload();
        // Rolurile fără „Vede toată flota" au nevoie de vehicule atribuite: deschidem direct alegerea lor (ca pe web).
        if (created && created.id != null && role !== 'superadmin' && !seesAll(role, opt ? opt.baza : role)) setAccessFor(target);
      }
    } catch (e: any) { setFormErr(e?.message || 'Eroare la salvare'); }
    finally { setSaving(false); }
  }
  async function doDelete(u: any) {
    setSaving(true);
    try { await Api.deleteUser(u.id); showToast('Șters'); setConfirmDel(null); setEditing(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }
  // RA Insight se plătește PE CONT → confirmare la pornire (se facturează), fără confirmare la oprire. Ca pe web.
  async function toggleSeat(u: any) {
    const on = !u.ai_seat;
    if (on && !confirm('Dai RA Insight acestui cont?\n\nContul primește RA Insight — asistentul care răspunde la întrebări despre flotă.\n\nSe facturează ca un cont în plus, în fiecare lună, până când îl retragi.')) return;
    setSeatBusy(u.id);
    try {
      const j = await Api.setUserAiSeat(u.id, on);
      const n = Number(j && j.seats) || 0;
      showToast(on ? 'RA Insight pornit ✓ (' + n + ' ' + (n === 1 ? 'cont' : 'conturi') + ' în total)' : 'RA Insight oprit pe acest cont');
      await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setSeatBusy(null); }
  }

  // Super-admin: filtru pe companie (ca selectorul de pe web), când lista are mai multe firme.
  const coGroups = useMemo(() => {
    const g: Record<string, { name: string; n: number }> = {};
    (items || []).forEach((u) => {
      const k = u.company_id != null ? String(u.company_id) : '_none';
      if (!g[k]) g[k] = { name: u.company_name || (u.company_id != null ? '#' + u.company_id : 'Platformă / fără companie'), n: 0 };
      g[k].n++;
    });
    return g;
  }, [items]);
  const coKeys = Object.keys(coGroups).sort((a, b) => coGroups[a].name.localeCompare(coGroups[b].name, 'ro'));
  const shownItems = (items || []).filter((u) => !isSuper || !coFilter || (u.company_id != null ? String(u.company_id) : '_none') === coFilter);

  const accessBlock = isEdit && form.role !== 'superadmin' && !ADMIN_ROLES.includes(formBase);
  const editDc = isEdit ? (Number(editing.device_count) || 0) : 0;
  const editGc = isEdit ? (Number(editing.group_count) || 0) : 0;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Utilizatori</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {notice && (
          <div role={notice.err ? 'alert' : 'status'} style={'display:flex;gap:10px;align-items:flex-start;padding:11px 12px;margin-bottom:10px;border-radius:10px;font-size:13px;line-height:1.45;border:1px solid ' + (notice.err ? 'var(--red)' : 'var(--accent)') + ';background:' + (notice.err ? 'rgba(240,90,90,.10)' : 'rgba(63,224,125,.10)')}>
            <Icon name={notice.err ? 'alert' : 'mail'} size={18} color={notice.err ? 'var(--red)' : 'var(--accent)'} />
            <span style="flex:1;min-width:0">
              {notice.text}
              {notice.retry && (
                <button type="button" disabled={retrying} onClick={notice.retry.run}
                  style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:7px 11px;border-radius:8px;border:1px solid var(--red);color:var(--red);background:transparent;font-size:13px;font-weight:700">
                  {retrying ? <div class="spin" style="width:14px;height:14px;border-width:2px" /> : <Icon name="refresh" size={15} />}
                  {retrying ? 'Se pune rolul…' : notice.retry.label}
                </button>
              )}
            </span>
            <button onClick={() => setNotice(null)} aria-label="Închide" style="color:var(--text-muted);display:flex"><Icon name="x" size={16} /></button>
          </div>
        )}
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {isSuper && coKeys.length > 1 && (
          <div class="adm-filter">
            <select value={coFilter} onChange={(e) => setCoFilter((e.target as HTMLSelectElement).value)}>
              <option value="">Toate companiile ({(items || []).length} utilizatori)</option>
              {coKeys.map((k) => <option value={k}>{coGroups[k].name} ({coGroups[k].n})</option>)}
            </select>
          </div>
        )}
        {items != null && shownItems.length === 0 && !err && <div class="adm-empty"><Icon name="user" size={40} class="ic" /><div>Niciun utilizator.</div></div>}
        {items != null && shownItems.length > 0 && (
          <div class="adm-list">
            {shownItems.map((u) => {
              const noAccess = accessText(u).startsWith('⚠');
              return (
                <div class="adm-item" role="button" tabIndex={0} style="cursor:pointer" onClick={() => openEdit(u)}>
                  <span class="ic-wrap"><Icon name="user" size={19} /></span>
                  <span class="mid">
                    <div class="nm">{u.full_name || u.username}</div>
                    <div class="sub">{u.username} · {listLabel(u)}</div>
                    <div class="sub" style={noAccess ? 'color:var(--orange)' : ''}>{isSuper && u.company_name ? u.company_name + ' · ' : ''}acces: {accessText(u)}</div>
                  </span>
                  <span class="rt">
                    {u.role !== 'superadmin' && (
                      <button type="button"
                        aria-label={u.ai_seat ? 'Are RA Insight — apasă ca să i-l retragi' : 'Nu are RA Insight — apasă ca să i-l dai'}
                        title={u.ai_seat ? 'Are RA Insight — apasă ca să i-l retragi' : 'Nu are RA Insight — apasă ca să i-l dai (se facturează un cont în plus)'}
                        disabled={seatBusy === u.id}
                        onClick={(e) => { e.stopPropagation(); toggleSeat(u); }}
                        style={'width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9px;border:1px solid ' + (u.ai_seat ? 'var(--accent);color:var(--accent);background:rgba(63,224,125,.12)' : 'var(--border);color:var(--text-muted);opacity:.55')}>
                        {seatBusy === u.id ? <div class="spin" style="width:14px;height:14px;border-width:2px" /> : <Icon name="sparkles" size={17} />}
                      </button>
                    )}
                    <span class={'adm-pill ' + (u.active !== false ? 'ok' : 'bad')}>{u.active !== false ? 'activ' : 'inactiv'}</span>
                    <Icon name="chevronR" size={18} color="var(--text-muted)" />
                  </span>
                </div>
              );
            })}
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
                    <div class="fld"><label>Email (așa se autentifică) <span class="req">*</span></label><input type="email" value={form.username} onInput={(e) => setF('username', (e.target as HTMLInputElement).value)} placeholder="ion.popescu@firma.ro" autocapitalize="none" autocomplete="off" spellcheck={false} /></div>
                    <div class="fld"><label>Parolă (opțional)</label>
                      <input type="password" value={form.password} onInput={(e) => setF('password', (e.target as HTMLInputElement).value)} placeholder="gol = îi trimitem invitație pe email" autocomplete="new-password" />
                      <div class="muted" style="font-size:11.5px;line-height:1.4">Fără parolă, persoana primește pe email o invitație și își pune singură parola. Dacă scrii o parolă, trebuie să aibă minim {PAROLA_MIN} caractere.</div>
                    </div>
                  </>
                )}
                <div class="fld"><label>Nume afișat <span class="req">*</span></label><input value={form.full_name} onInput={(e) => setF('full_name', (e.target as HTMLInputElement).value)} placeholder="Ion Popescu" /></div>
                {isEdit && (
                  <div class="fld"><label>Email</label><input type="email" value={form.email} onInput={(e) => setF('email', (e.target as HTMLInputElement).value)} autocapitalize="none" autocomplete="off" spellcheck={false} /></div>
                )}
                <div class="frm-row">
                  <div class="fld"><label>Telefon</label><input type="tel" value={form.phone} onInput={(e) => setF('phone', (e.target as HTMLInputElement).value)} /></div>
                </div>
                {!isEdit && isSuper && form.role !== 'superadmin' && (
                  <div class="fld"><label>Compania <span class="req">*</span></label>
                    <select value={form.company_id} onChange={(e) => setF('company_id', (e.target as HTMLSelectElement).value)}>
                      <option value="">{cos == null ? 'Se încarcă…' : '— alege compania —'}</option>
                      {(cos || []).map((c: any) => <option value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div class="fld"><label>Rol</label>
                  {lockRole ? (
                    <input value={listLabel(editing)} disabled style="opacity:.6" />
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
                {accessBlock && (
                  // Rolul neschimbat: ce spune serverul (sees_all, cu tăierile firmei omului); rol ales acum: calculul local.
                  (isEdit && typeof editing.sees_all === 'boolean' && form.role === userRoleKey(editing) ? editing.sees_all : seesAll(form.role, formBase)) ? (
                    <div class="muted" style="font-size:12px">Acest rol vede toată flota firmei — nu are nevoie de vehicule atribuite.</div>
                  ) : (
                    <div class="fld"><label>Acces pe vehicule</label>
                      <button type="button" onClick={() => setAccessFor(targetOf(editing))}
                        style="display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;padding:11px 12px;font-size:14.5px;font-weight:700;color:var(--text-primary);text-align:left">
                        <Icon name="car" size={18} color="var(--accent)" />
                        <span style="flex:1;min-width:0">
                          {editDc + editGc > 0 ? editDc + (editDc === 1 ? ' vehicul' : ' vehicule') + ' + ' + editGc + (editGc === 1 ? ' grupă' : ' grupe') : 'Niciun vehicul atribuit'}
                        </span>
                        <Icon name="chevronR" size={18} color="var(--text-muted)" />
                      </button>
                      <div class="muted" style="font-size:11.5px;line-height:1.4">
                        {editDc + editGc > 0 ? 'Vede doar vehiculele atribuite și pe cele din grupele bifate.' : 'Fără vehicule atribuite nu vede nimic pe hartă și în rapoarte.'}
                      </div>
                    </div>
                  )
                )}
                {isEdit && (
                  <div class="fld"><label>Parolă nouă (opțional)</label>
                    <input type="password" value={form.password} onInput={(e) => setF('password', (e.target as HTMLInputElement).value)} placeholder="gol = neschimbat" autocomplete="new-password" />
                  </div>
                )}
                {isEdit && !isSelf && (
                  <div class="fld"><label>Stare</label>
                    <select value={form.active ? 'true' : 'false'} onChange={(e) => setF('active', (e.target as HTMLSelectElement).value === 'true')}>
                      <option value="true">Activ</option>
                      <option value="false">Inactiv (acces blocat)</option>
                    </select>
                  </div>
                )}
                {isSelf && <div class="muted" style="font-size:12px">Nu îți poți schimba propriul rol sau dezactiva propriul cont.</div>}
                {formErr && (
                  <div role="alert" style="display:flex;gap:8px;align-items:flex-start;padding:10px 11px;border-radius:10px;font-size:13px;line-height:1.45;border:1px solid var(--red);background:rgba(240,90,90,.10);color:var(--text-primary)">
                    <Icon name="alert" size={17} color="var(--red)" />
                    <span style="flex:1;min-width:0">{formErr}</span>
                    <button type="button" onClick={() => setFormErr('')} aria-label="Închide" style="color:var(--text-muted);display:flex"><Icon name="x" size={15} /></button>
                  </div>
                )}
                <div class="frm-actions">
                  {isEdit && !isSelf && <button class="btn btn-danger-ghost" disabled={saving} onClick={() => setConfirmDel(editing)}><Icon name="trash" size={16} /></button>}
                  <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {accessFor && (
        <UserVehicleAccess user={accessFor} isSuper={isSuper} onClose={() => setAccessFor(null)} onSaved={() => { reload(); }} />
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
