import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { UserVehicleAccess } from '../components/UserVehicleAccess';
import { LinkParolaSheet, pregatesteLinkul } from '../components/LinkParolaSheet';
import type { AccessTarget } from '../components/UserVehicleAccess';
import { faraDiacritice } from '../components/FirmaUi'; // aduce și firma.css (.fm-chip, .fm-in, .fm-sec)
import './detail.css';
import './admin.css';
import { nrDe } from '../lib/numar';

// PAROLA NU EXISTĂ (decizie 16.09): nimeni nu scrie parola altcuiva. Contul se deschide pe o adresă de email,
// omul primește un link și își pune singur parola. Dacă emailul nu poate pleca, serverul întoarce linkul și îl
// arătăm pe ecran, ca adminul să-l ducă mai departe. Un singur buton pe rând: „Trimite link de parolă".
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// Numele standard din listă, ca pe web (ROLE_LABELS). Numele date de firmă le bat (vin din /api/company-roles).
// UN SINGUR NUME pentru administratorul firmei. Rândurile vechi pot avea încă „admin" — scriu la fel.
const LIST_NAME: Record<string, string> = { company_admin: 'Admin companie', admin: 'Admin companie', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Viewer', superadmin: 'Super-admin' };
// Explicația din paranteză din formularul de adăugare (web: #new-role). La redenumire se schimbă doar numele.
const EXPL: Record<string, string> = { manager: 'toată flota, editează', dispatcher: 'atribuit + confirmă alerte', viewer: 'vede doar vehiculele atribuite' };
// Rolurile care au „Vede toată flota" din oficiu (ROLE_PERMISSIONS.viewAll pe server). Firma îl poate tăia din manager.
const VIEW_ALL_BASE = ['superadmin', 'company_admin', 'admin', 'manager'];
const ADMIN_ROLES = ['company_admin', 'admin', 'superadmin'];
// Zilele de liniște după care „văzut" se scrie portocaliu (USR_LINISTE pe web).
const LINISTE_ZILE = 40;
const LINK_SFAT_NOU = 'Îi trimitem un link pe email și își pune singur parola. Noi nu scriem parole.';

type RoleOpt = { v: string; label: string; baza: string; propriu?: boolean };
type Notice = { text: string; err?: boolean; retry?: { label: string; run: () => void } };
type InviteNote = { text: string; err: boolean } | null;
type LinkSheet = { email: string; link: string; motiv?: string; copiat: boolean; after?: () => void };
type Scoate = { u: any; ce: string; gata: boolean; err?: string };

function zileDe(v: any): number | null {
  if (!v) return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  if (!t || isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
// „azi · ieri · acum 9 zile", ca pe web (_usrCandVazut).
function candVazut(u: any) {
  const z = zileDe(u.last_login);
  if (z === null) return { text: 'n-a intrat niciodată', niciodata: true, vechi: false, zile: 0 };
  return { text: z <= 0 ? 'azi' : (z === 1 ? 'ieri' : 'acum ' + nrDe(z, 'zi', 'zile')), niciodata: false, vechi: z >= LINISTE_ZILE, zile: z };
}
// Accesul pe termen (conturile demo aprobate), în ZILE DE CALENDAR, ca pe web (_usrExpira).
function expira(u: any): { text: string; aproape: boolean } | null {
  if (u.access_until == null) return null;
  const t = Number(u.access_until);
  if (!t || isNaN(t)) return null;
  const miez = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const zile = Math.round((miez(t) - miez(Date.now())) / 86400000);
  if (zile < 0) return { text: 'acces expirat', aproape: true };
  if (zile === 0) return { text: 'expiră azi', aproape: true };
  if (zile <= 3) return { text: 'expiră în ' + zile + (zile === 1 ? ' zi' : ' zile'), aproape: true };
  return { text: 'acces până la ' + new Date(t).toLocaleDateString('ro-RO'), aproape: false };
}
// Lista din „Avea: …" se taie la opt, ca pe web (_usrListaScurta).
function listaScurta(l: string[]) {
  return l.length <= 8 ? l.join(', ') : (l.slice(0, 8).join(', ') + ' și încă ' + (l.length - 8));
}
const PILL_CALD = 'background:rgba(249,115,22,.14);color:var(--orange)';
const BTN_GHOST = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';

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
  // pierdea exact mesajele de citit.
  const [formErr, setFormErr] = useState('');
  const [scoate, setScoate] = useState<Scoate | null>(null);
  const [accessFor, setAccessFor] = useState<AccessTarget | null>(null);
  const [seatBusy, setSeatBusy] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);
  const [linkSheet, setLinkSheet] = useState<LinkSheet | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [coFilter, setCoFilter] = useState('');
  // Bara de deasupra listei, ca pe web: căutare, ordine și pastilele cu numere.
  const [cauta, setCauta] = useState('');
  const [ordine, setOrdine] = useState<'nume' | 'rol' | 'logare'>('nume');
  const [pastila, setPastila] = useState('');

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
  // Serverul socotește „vede toată flota" cu tăierile firmei omului (sees_all) — singura sursă corectă pentru
  // super-admin, care nu primește rolurile altor firme. Calculul local rămâne doar pentru un server vechi.
  const vedeTot = (u: any) => u.role === 'superadmin' || (typeof u.sees_all === 'boolean' ? u.sees_all : seesAll(userRoleKey(u), u.role));
  const faraAcces = (u: any) => !vedeTot(u) && (Number(u.device_count) || 0) + (Number(u.group_count) || 0) === 0;
  function accessText(u: any) {
    if (vedeTot(u)) return 'toată flota';
    const dc = Number(u.device_count) || 0, gc = Number(u.group_count) || 0;
    return dc + gc > 0 ? dc + ' veh. + ' + gc + ' grupe' : 'niciun vehicul';
  }
  // Rolurile pe care serverul le acceptă de la contul ăsta (COMPANY_ASSIGNABLE_ROLES / VALID_ROLES):
  //  • adminul firmei → Admin companie (delegare în firma lui, decizie 16.09) + manager/dispecer/viewer + rolurile
  //    proprii. Contul de PLATFORMĂ nu i se oferă — și serverul îl refuză.
  //  • super-adminul, la ADĂUGARE → doar cont de platformă: ecranul ăsta e, la noi, pentru un coleg nou la RA Tracks.
  //    Administratorul unei firme client se face din Companii → firma → Utilizatori; restul, de adminul ei.
  //  • super-adminul, la EDITARE → toate rolurile standard, ca pe web.
  // „Client" nu se mai oferă (aceleași drepturi ca Viewer).
  function roleOptions(forAdd: boolean): RoleOpt[] {
    if (isSuper && forAdd) return [{ v: 'superadmin', baza: 'superadmin', label: 'Super-admin (PLATFORMĂ — toate companiile)' }];
    const std = (k: string, short: string): RoleOpt => {
      const n = (byKey[k] && byKey[k].nume) || short;
      return { v: k, baza: k, label: forAdd && EXPL[k] ? n + ' (' + EXPL[k] + ')' : n };
    };
    const admin: RoleOpt = { v: 'company_admin', baza: 'company_admin', label: forAdd ? 'Admin companie (control total în firma ta)' : 'Admin companie' };
    const company = [std('manager', 'Manager'), std('dispatcher', 'Dispecer'), std('viewer', 'Viewer')];
    const proprii: RoleOpt[] = roles.filter((r) => r && r.propriu && r.baza)
      .map((r) => ({ v: r.rol, baza: r.baza, label: (r.nume || r.numeStandard || r.rol) + ' (rol propriu)', propriu: true }));
    const firma = [admin, ...company, ...proprii];
    if (!isSuper) return firma;
    return [...firma, { v: 'superadmin', baza: 'superadmin', label: '⚠ Super-admin (platformă)' }];
  }

  function openNew() {
    setForm({ username: '', full_name: '', phone: '', role: isSuper ? 'superadmin' : 'viewer' });
    setFormErr('');
    setEditing({});
    setNotice(null);
  }
  function openEdit(u: any) {
    setForm({ username: u.username, full_name: u.full_name || '', email: u.email || '', phone: u.phone || '', role: userRoleKey(u), active: u.active !== false });
    setFormErr('');
    setEditing(u);
  }
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const isEdit = editing && editing.id != null;
  const isSelf = isEdit && editing.username === myUsername;
  // Adminul firmei poate schimba și rolul altui admin din firma lui (delegare, 16.09); serverul oprește retrogradarea
  // propriului cont și golirea firmei de administratori. Doar un cont de platformă rămâne neatins pentru el.
  // Un cont de platformă nu se coboară pe un rol de firmă (ar rămâne fără firmă, adică fără niciun filtru) — nici de
  // super-admin; serverul refuză oricum. Se face cont nou în firma potrivită.
  const lockRole = isEdit && editing.role === 'superadmin';
  const initialRole = isEdit ? userRoleKey(editing) : null;
  const baseRoles = roleOptions(!isEdit);
  // Rolul curent al omului, când nu e printre cele oferite (ex. rolul propriu al altei firme, văzut de super-admin).
  const roleOpts: RoleOpt[] = (isEdit && initialRole && !baseRoles.some((r) => r.v === initialRole))
    ? [{ v: initialRole, baza: editing.role, label: listLabel(editing) + (editing.role_slug ? ' (rol propriu)' : ''), propriu: !!editing.role_slug }, ...baseRoles]
    : baseRoles;
  const optOf = (key: string) => roleOpts.find((r) => r.v === key);
  const formBase = (optOf(form.role) || { baza: baseOf(form.role) }).baza;
  const targetOf = (u: any): AccessTarget => ({ id: u.id, username: u.username, full_name: u.full_name, company_id: u.company_id });

  // ── Linkul de parolă ──────────────────────────────────────────────────────────────────────────
  // Când emailul n-a putut pleca, linkul apare pe ecran, copiat deja (ca pe web, _usrAratLinkul).
  // `after` = ce se deschide după ce omul a închis foaia (ex. alegerea vehiculelor pentru contul nou).
  async function aratLinkul(email: string, link: string, motiv?: string, after?: () => void) {
    const l = await pregatesteLinkul({ email, link, motiv });
    setLinkSheet({ email, link, motiv, copiat: !!l.copiat, after });
  }
  function inchideLinkul() {
    const a = linkSheet && linkSheet.after;
    setLinkSheet(null);
    if (a) a();
  }
  // Un singur buton pentru amândouă nevoile: invitația care n-a ajuns și parola uitată (ca pe web, _usrLinkParola).
  // Pornit din foaia „Editează", refuzul (429 după 5 pe oră, cont dezactivat) rămâne în foaie până îl închide omul;
  // un toast de 2-3 secunde pierdea exact propozițiile astea. De pe rândul din listă rămâne toastul.
  async function trimiteLink(u: any, dinFoaie?: boolean) {
    if (!u || u.id == null) return;
    const spune = (msg: string) => { if (dinFoaie) setFormErr(msg); else showToast(msg, true); };
    if (dinFoaie) setFormErr('');
    setLinkBusy(u.id);
    try {
      const j = await Api.linkParola(u.id);
      if (j && j.trimis) showToast('Link trimis pe ' + (j.email || 'email') + ' — își pune singur parola.');
      else if (j && j.link) await aratLinkul(j.email || u.email || u.username, j.link, j.motiv);
      else spune((j && j.motiv) || 'Linkul nu a putut fi trimis.');
    } catch (e: any) { spune(e?.message || 'Linkul nu a putut fi trimis.'); } // 429 / cont dezactivat: textul serverului
    finally { setLinkBusy(null); }
  }
  // Ce s-a întâmplat cu linkul contului nou — același text în anunțul de pe ecran și în cel cu reîncercarea rolului.
  function inviteNoteOf(created: any, username: string): InviteNote {
    if (created && created.invitat) return { text: 'I-am trimis linkul pe ' + username + ' — își pune singur parola.', err: false };
    if (created && created.link) return { text: 'Linkul de parolă nu a plecat pe email — ți l-am arătat pe ecran, ca să i-l dai tu.', err: true };
    return { text: 'Linkul de parolă NU a plecat. Trimite-i-l din listă, cu „Trimite link de parolă”.', err: true };
  }

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
      // Contul se creează pe adresa de email: ea e utilizatorul de autentificare ȘI adresa pe care pleacă linkul.
      if (!username) { setFormErr('Scrie adresa de email a persoanei.'); return; }
      if (!EMAIL_RE.test(username)) { setFormErr('Utilizatorul trebuie să fie o adresă de email validă (ex. ion.popescu@firma.ro).'); return; }
    }
    if (full_name.length < 2) { setFormErr('Completează numele afișat — așa apare persoana în aplicație.'); return; }
    if (isEdit) {
      // Un cont FOLOSIT, căruia i se schimbă adresa, e aproape întotdeauna o încercare de a-l „preda" altui om.
      // Istoricul rămâne pe cont, iar adresa de autentificare NU se schimbă de aici (ca pe web).
      const emailNou = String(form.email || '').trim();
      if (editing.last_login && emailNou && emailNou !== (editing.email || '')) {
        const nume = editing.full_name || editing.username;
        if (!confirm('Schimbi adresa unui cont folosit?\n\nAsta nu face un om nou. Tot ce a făcut „' + nume + '” va apărea de acum sub numele cel nou, '
          + 'iar adresa cu care se autentifică rămâne tot „' + editing.username + '”.\n\n'
          + 'Dacă a venit un coleg nou în locul lui, scoate-l din firmă, fă-i cont nou și pune-i drepturile de mână.')) return;
      }
    }
    // Acordarea rolului de platformă e ireversibilă din perspectiva datelor văzute → confirmare explicită.
    if (form.role === 'superadmin' && (!isEdit || editing.role !== 'superadmin')) {
      const who = isEdit ? editing.username : username;
      if (!confirm('Acorzi rolul de SUPER-ADMIN?\n\n„' + who + '" va vedea și administra TOATE companiile, toate vehiculele și facturarea platformei — nu doar o companie.')) return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        // Emailul pleacă TĂIAT (ca pe web): un spațiu scăpat ar ajunge în bază, iar linkul de parolă ar pleca pe o adresă greșită.
        const body: any = { full_name, email: String(form.email || '').trim() || null, phone: form.phone || null, active: form.active };
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
        showToast('Salvat');
        setEditing(null); await reload();
      } else {
        const opt = optOf(form.role);
        const propriu = !!(opt && opt.propriu);
        // Rolul propriu se pune în doi pași (serverul nu-l primește la creare): contul pornește ca Viewer — cele mai
        // puține drepturi, iar fără vehicule atribuite nu vede nicio mașină — și abia apoi primește rolul propriu.
        // Dacă al doilea pas cade (ex. fără semnal), omul NU rămâne pe rolul de bază cu toate drepturile lui.
        // Fără parolă și fără companie: super-adminul face de aici doar conturi de platformă, iar contul unui admin
        // de firmă intră automat în firma lui (o pune serverul).
        const body: any = { username, role: propriu ? 'viewer' : form.role, full_name, email: username, phone: form.phone || null };
        const created: any = await Api.createUser(body);
        // Omul trebuie să afle DACĂ a plecat linkul — altfel așteaptă degeaba un email care n-a plecat.
        const invite = inviteNoteOf(created, username);
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
          if (created && created.link) await aratLinkul(username, created.link, created.motiv);
          return;
        }
        const role = form.role;
        await reload();
        // Rolurile fără „Vede toată flota" au nevoie de vehicule atribuite: deschidem alegerea lor (ca pe web) —
        // DUPĂ foaia cu linkul, dacă apare, ca să nu se suprapună.
        const needsAccess = created && created.id != null && role !== 'superadmin' && !seesAll(role, opt ? opt.baza : role);
        const deschideAcces = needsAccess ? () => setAccessFor(target) : undefined;
        if (created && created.invitat) {
          setNotice({ text: 'Cont creat. ' + invite!.text, err: false });
          if (deschideAcces) deschideAcces();
        } else if (created && created.link) {
          setNotice(null);
          await aratLinkul(username, created.link, created.motiv, deschideAcces);
        } else {
          setNotice({ text: 'Cont creat, dar linkul de parolă NU a plecat. Trimite-i-l din listă, cu „Trimite link de parolă”.', err: true });
          if (deschideAcces) deschideAcces();
        }
      }
    } catch (e: any) { setFormErr(e?.message || 'Eroare la salvare'); }
    finally { setSaving(false); }
  }

  // ── „Scoate din firmă" ──────────────────────────────────────────────────────────────────────
  // Contul DISPARE (nu se dezactivează); dacă omul revine, i se face altul. Nu există traseu de „înlocuire"
  // (decizie 16.09): adminul pune drepturile pe omul nou de mână — de-aia fereastra spune întâi CE avea omul,
  // pe nume (numere de înmatriculare, grupe), fiindcă după ștergere legăturile se duc cu contul.
  async function ceAvea(u: any): Promise<string> {
    const p: string[] = [];
    if (u.ai_seat) p.push('RA Insight');
    if (vedeTot(u)) return p.join(' · '); // cine vede toată flota n-are mașini atribuite anume
    let devices: string[] = [], groups: number[] = [];
    try {
      const a = await Api.userAccess(u.id);
      devices = ((a && a.devices) || []).map(String);
      groups = ((a && a.groups) || []).map(Number);
    } catch { /* fără listă: fereastra spune doar ce știe */ }
    let numeDev: string[] = devices, numeGrp: string[] = groups.map((g) => '#' + g);
    if (devices.length || groups.length) {
      try {
        const [dl, gl] = await Promise.all([
          devices.length ? Api.devices().catch(() => [] as any[]) : Promise.resolve([] as any[]),
          groups.length ? Api.groupsAll().catch(() => [] as any[]) : Promise.resolve([] as any[]),
        ]);
        const dN: Record<string, string> = {};
        (Array.isArray(dl) ? dl : []).forEach((d: any) => { if (d && d.imei) dN[String(d.imei)] = d.plate || d.name || d.imei; });
        const gN: Record<string, string> = {};
        (Array.isArray(gl) ? gl : []).forEach((g: any) => { if (g && g.id != null) gN[String(g.id)] = g.name || ('#' + g.id); });
        numeDev = devices.map((i) => dN[i] || i);
        numeGrp = groups.map((i) => gN[String(i)] || ('#' + i));
      } catch { /* rămân IMEI-urile / numerele grupelor */ }
    }
    if (devices.length) p.push(nrDe(devices.length, 'vehicul', 'vehicule') + ': ' + listaScurta(numeDev));
    if (groups.length) p.push(groups.length + (groups.length === 1 ? ' grupă' : ' grupe') + ': ' + listaScurta(numeGrp));
    return p.join(' · ');
  }
  async function deschideScoate(u: any) {
    setScoate({ u, ce: '', gata: false });
    const ce = await ceAvea(u);
    setScoate((prev) => (prev && prev.u.id === u.id ? { u, ce, gata: true } : prev));
  }
  async function doScoate(u: any) {
    const nume = u.full_name || u.username;
    setSaving(true);
    setScoate((prev) => (prev ? { ...prev, err: '' } : prev));
    try {
      await Api.deleteUser(u.id);
      showToast('„' + nume + '” a fost scos din firmă.');
      setScoate(null); setEditing(null); await reload();
    } catch (e: any) {
      // Refuzul (ex. ultimul admin al firmei) e o propoziție de citit: rămâne în foaie, care rămâne deschisă.
      const msg = e?.message || 'Eroare la scoaterea din firmă';
      setScoate((prev) => (prev && prev.u.id === u.id ? { ...prev, err: msg } : prev));
    }
    finally { setSaving(false); }
  }

  // RA Insight se plătește PE CONT → confirmare la pornire (se facturează), fără confirmare la oprire. Ca pe web.
  // Se facturează VÂRFUL lunii: la o înlocuire, ordinea contează.
  async function toggleSeat(u: any) {
    const on = !u.ai_seat;
    if (on && !confirm('Dai RA Insight acestui cont?\n\nContul primește RA Insight — asistentul care răspunde la întrebări despre flotă.\n\n'
      + 'Se facturează ca un cont în plus, în fiecare lună, până când îl retragi.\n\n'
      + 'Dacă înlocuiești pe cineva: scoate-l întâi pe cel care pleacă. Altfel luna asta se socotesc două conturi, nu unul.')) return;
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
  const coKey = (u: any) => (u.company_id != null ? String(u.company_id) : '_none');
  // Conturile cu RA Insight, numărate pe lista ÎNTREAGĂ (nu pe cea filtrată), ca pe web (_usrSeatsHtml).
  const seatCount = (items || []).filter((u) => !!u.ai_seat).length;

  // ── Căutare, ordine, pastile, Admini/Utilizatori (ca pe web: _usrPotrivit, _usrTrece, _usrOrdoneaza) ──
  // Pastilele se socotesc pe lista ÎNTREAGĂ, nu pe ce a rămas după căutare — altfel „N-au intrat niciodată: 0"
  // ar minți doar fiindcă ai scris ceva în casetă. O pastilă cu 0 nu ocupă loc. „Fără acces" e gospodăria
  // adminului de firmă (el împarte mașinile) — la noi nu apare.
  const toti = items || [];
  const eAdmin = (u: any) => ADMIN_ROLES.includes(u.role);
  const trece = (u: any) => {
    switch (pastila) {
      case 'niciodata': return !u.last_login;
      case 'faraacces': return faraAcces(u);
      case 'dezactivate': return u.active === false;
      case 'insight': return !!u.ai_seat;
      case 'admini': return eAdmin(u);
      default: return true;
    }
  };
  // Fără diacritice: „stefan" îl găsește pe „Ștefan"; prinde și numele rolului dat de firmă (listLabel știe de rolul propriu).
  const q = faraDiacritice(cauta).trim();
  const potrivit = (u: any) => !q || faraDiacritice([u.username, u.full_name, u.email, u.phone, listLabel(u), u.company_name].join(' ')).indexOf(q) >= 0;
  const zileLogare = (u: any) => zileDe(u.last_login);
  const ordoneaza = (a: any, b: any) => {
    if (ordine === 'rol') {
      const ra = listLabel(a), rb = listLabel(b);
      if (ra !== rb) return String(ra).localeCompare(String(rb), 'ro');
    } else if (ordine === 'logare') {
      // Cine n-a intrat niciodată stă primul: el e omul de care trebuie să te ocupi.
      const za = zileLogare(a), zb = zileLogare(b);
      if (za === null && zb !== null) return -1;
      if (zb === null && za !== null) return 1;
      if (za !== zb) return (zb || 0) - (za || 0);
    }
    return String(a.full_name || a.username || '').localeCompare(String(b.full_name || b.username || ''), 'ro');
  };
  const pastile: { k: string; et: string; n: number; cald?: boolean }[] = [
    { k: '', et: 'Toți', n: toti.length },
    { k: 'niciodata', et: 'N-au intrat niciodată', n: toti.filter((u) => !u.last_login).length, cald: true },
    ...(!isSuper ? [{ k: 'faraacces', et: 'Fără acces', n: toti.filter(faraAcces).length, cald: true }] : []),
    { k: 'dezactivate', et: 'Dezactivate', n: toti.filter((u) => u.active === false).length },
    { k: 'insight', et: 'Cu RA Insight', n: toti.filter((u) => !!u.ai_seat).length },
    { k: 'admini', et: 'Admini', n: toti.filter(eAdmin).length },
  ].filter((p) => p.k === '' || p.n > 0);
  const shownItems = toti.filter((u) => (!isSuper || !coFilter || coKey(u) === coFilter) && trece(u) && potrivit(u));
  // La noi, cu mai multe firme și fără filtru, lista se împarte întâi pe firme; altfel o singură grupă.
  const peFirme = isSuper && !coFilter && coKeys.length > 1;
  const grupe = (peFirme ? coKeys : ['_toti']).map((k) => {
    const l = peFirme ? shownItems.filter((u) => coKey(u) === k) : shownItems;
    return { k, nume: peFirme ? coGroups[k].name : '', admini: l.filter(eAdmin).sort(ordoneaza), useri: l.filter((u) => !eAdmin(u)).sort(ordoneaza) };
  }).filter((g) => g.admini.length + g.useri.length > 0);

  const accessBlock = isEdit && form.role !== 'superadmin' && !ADMIN_ROLES.includes(formBase);
  const editDc = isEdit ? (Number(editing.device_count) || 0) : 0;
  const editGc = isEdit ? (Number(editing.group_count) || 0) : 0;
  const editNiciodata = isEdit && !editing.last_login;

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
        {items != null && toti.length > 0 && (
          <>
            <div class="fm-bar">
              <div class="fm-search">
                <Icon name="search" size={17} class="ic" />
                <input class="fm-in" type="search" value={cauta} placeholder="Caută după nume, email, telefon sau rol…"
                  onInput={(e) => setCauta((e.target as HTMLInputElement).value)} autocapitalize="none" autocomplete="off" spellcheck={false} />
              </div>
              <select class="fm-in" value={ordine} onChange={(e) => setOrdine((e.target as HTMLSelectElement).value as any)} aria-label="Ordinea în listă">
                <option value="nume">Ordine: nume</option>
                <option value="rol">Ordine: rol</option>
                <option value="logare">Ordine: ultima logare</option>
              </select>
            </div>
            <div class="fm-chips">
              {pastile.map((p) => (
                <button type="button" aria-pressed={pastila === p.k}
                  class={'fm-chip' + (pastila === p.k ? ' on' : (p.cald && p.n ? ' cald' : ''))}
                  onClick={() => setPastila(pastila === p.k ? '' : p.k)}>
                  {p.et} <b>{p.n}</b>
                </button>
              ))}
            </div>
          </>
        )}
        {isSuper && coKeys.length > 1 && (
          <div class="adm-filter">
            <select value={coFilter} onChange={(e) => setCoFilter((e.target as HTMLSelectElement).value)}>
              <option value="">Toate companiile ({(items || []).length} utilizatori)</option>
              {coKeys.map((k) => <option value={k}>{coGroups[k].name} ({coGroups[k].n})</option>)}
            </select>
          </div>
        )}
        {seatCount > 0 && (
          <div style="display:flex;gap:8px;align-items:flex-start;margin:0 2px 10px;font-size:12.5px;line-height:1.45;color:var(--text-muted)">
            <Icon name="sparkles" size={15} color="var(--accent)" style="flex:0 0 auto;margin-top:2px" />
            <span><b style="color:var(--text-primary)">{seatCount}</b> {seatCount === 1 ? 'cont cu RA Insight' : 'conturi cu RA Insight'} — la factură intră vârful lunii: cel mai mare număr de conturi aprinse deodată.</span>
          </div>
        )}
        {/* Spune de ce e gol: „n-ai pe nimeni" și „nu s-a potrivit nimeni" sunt două lucruri diferite. */}
        {items != null && shownItems.length === 0 && !err && (
          <div class="adm-empty"><Icon name="user" size={40} class="ic" />
            <div>{toti.length ? 'Niciun cont nu se potrivește. Șterge din căutare sau apasă „Toți”.' : 'Niciun utilizator.'}</div>
          </div>
        )}
        {items != null && shownItems.length > 0 && grupe.map((g) => (
          <>
            {g.nume && <div class="fm-sec co">{g.nume}</div>}
            {([['Admini', g.admini], ['Utilizatori', g.useri]] as [string, any[]][]).filter(([, l]) => l.length > 0).map(([titlu, l]) => (
          <>
          <div class="fm-sec">{titlu}</div>
          <div class="adm-list">
            {l.map((u) => {
              const vaz = candVazut(u);
              const exp = expira(u);
              // „Fără acces" e gospodăria adminului de firmă (el împarte mașinile) — la fondator semnul nu se aprinde.
              // Pe un cont DEZACTIVAT sfaturile n-au rost („atribuie-i vehicule", „dezactivează-l"): acolo tac.
              const activ = u.active !== false;
              const faraAccesClient = !isSuper && activ && faraAcces(u);
              const sfat = faraAccesClient
                ? 'Nu vede niciun vehicul — atribuie-i din Editează, altfel deschide aplicația și găsește un ecran gol.'
                : (vaz.vechi && !isSuper && activ ? 'Cont nefolosit de ' + vaz.zile + ' de zile — dezactivează-l dacă omul nu mai lucrează aici.' : '');
              const semne = u.active === false || vaz.niciodata || faraAccesClient || !!exp;
              return (
                <div class="adm-item" role="button" tabIndex={0} style={'cursor:pointer' + (u.active === false ? ';opacity:.72' : '')} onClick={() => openEdit(u)}>
                  <span class="ic-wrap"><Icon name="user" size={19} /></span>
                  <span class="mid">
                    <div class="nm" style="display:flex;align-items:center;gap:6px">
                      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis">{u.full_name || u.username}</span>
                      {u.username === myUsername && <span class="adm-pill ok" style="flex:0 0 auto;color:var(--fm-ok)">tu</span>}
                    </div>
                    <div class="sub">{u.username} · {listLabel(u)}</div>
                    {semne && (
                      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">
                        {u.active === false && <span class="adm-pill bad">dezactivat</span>}
                        {vaz.niciodata && <span class="adm-pill" style={PILL_CALD}>n-a intrat niciodată</span>}
                        {faraAccesClient && <span class="adm-pill" style={PILL_CALD}>fără acces</span>}
                        {exp && <span class="adm-pill" style={exp.aproape ? PILL_CALD : ''}>{exp.text}</span>}
                      </div>
                    )}
                    <div class="sub" style="white-space:normal">
                      {isSuper && u.company_name ? u.company_name + ' · ' : ''}
                      <span style={faraAccesClient ? 'color:var(--orange)' : ''}>acces: {accessText(u)}</span>
                      {!vaz.niciodata && <> · <span style={vaz.vechi ? 'color:var(--orange)' : ''}>văzut: {vaz.text}</span></>}
                    </div>
                    {sfat && <div style={'margin-top:4px;font-size:12px;line-height:1.4;color:' + (faraAccesClient ? 'var(--orange)' : 'var(--text-muted)')}>{sfat}</div>}
                  </span>
                  <span class="rt">
                    <button type="button"
                      aria-label={vaz.niciodata ? 'N-a intrat niciodată — retrimite-i linkul de parolă' : 'Trimite-i un link ca să-și pună altă parolă'}
                      title={vaz.niciodata ? 'N-a intrat niciodată — retrimite-i linkul de parolă' : 'Trimite-i un link ca să-și pună altă parolă'}
                      disabled={linkBusy === u.id}
                      onClick={(e) => { e.stopPropagation(); trimiteLink(u); }}
                      style={'width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9px;border:1px solid ' + (vaz.niciodata ? 'var(--orange);color:var(--orange)' : 'var(--border);color:var(--text-muted)')}>
                      {linkBusy === u.id ? <div class="spin" style="width:14px;height:14px;border-width:2px" /> : <Icon name="mail" size={17} />}
                    </button>
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
                    <Icon name="chevronR" size={18} color="var(--text-muted)" />
                  </span>
                </div>
              );
            })}
          </div>
          </>
            ))}
          </>
        ))}
      </div>

      <button class="fab" onClick={openNew} aria-label="Adaugă utilizator"><Icon name="plus" size={26} color="#06210f" /></button>

      {editing && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="user" size={18} color="var(--accent)" /> {isEdit ? 'Editează utilizator' : (isSuper ? 'Adaugă utilizator (specific pentru colegi noi RA Tracks)' : 'Adaugă utilizator')}</b><button class="h-btn" onClick={() => setEditing(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                {isEdit ? (
                  <div class="fld"><label>Utilizator</label><input value={form.username} disabled style="opacity:.6" /></div>
                ) : (
                  <div class="fld"><label>Email (așa se autentifică) <span class="req">*</span></label>
                    <input type="email" value={form.username} onInput={(e) => setF('username', (e.target as HTMLInputElement).value)} placeholder="ion.popescu@firma.ro" autocapitalize="none" autocomplete="off" spellcheck={false} />
                    <div class="muted" style="font-size:11.5px;line-height:1.4">{LINK_SFAT_NOU}</div>
                  </div>
                )}
                <div class="fld"><label>Nume afișat <span class="req">*</span></label><input value={form.full_name} onInput={(e) => setF('full_name', (e.target as HTMLInputElement).value)} placeholder="Ion Popescu" /></div>
                {isEdit && (
                  <div class="fld"><label>Email</label><input type="email" value={form.email} onInput={(e) => setF('email', (e.target as HTMLInputElement).value)} autocapitalize="none" autocomplete="off" spellcheck={false} /></div>
                )}
                <div class="frm-row">
                  <div class="fld"><label>Telefon</label><input type="tel" value={form.phone} onInput={(e) => setF('phone', (e.target as HTMLInputElement).value)} /></div>
                </div>
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
                  {!isEdit && isSuper && (
                    <div class="muted" style="font-size:11.5px;line-height:1.4;margin-top:4px">
                      Pentru administratorul unei firme client, mergi la <b>Companii → firma → Utilizatori</b> (de pe web).
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
                          {editDc + editGc > 0 ? nrDe(editDc, 'vehicul', 'vehicule') + ' + ' + nrDe(editGc, 'grupă', 'grupe') : 'Niciun vehicul atribuit'}
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
                  <div class="fld"><label>Parola</label>
                    <button type="button" disabled={linkBusy === editing.id} onClick={() => trimiteLink(editing, true)}
                      style={'display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px solid ' + (editNiciodata ? 'var(--orange)' : 'var(--border)') + ';border-radius:10px;padding:11px 12px;font-size:14.5px;font-weight:700;color:' + (editNiciodata ? 'var(--orange)' : 'var(--text-primary)') + ';text-align:left'}>
                      {linkBusy === editing.id ? <div class="spin" style="width:16px;height:16px;border-width:2px" /> : <Icon name="mail" size={18} color={editNiciodata ? 'var(--orange)' : 'var(--accent)'} />}
                      <span style="flex:1;min-width:0">Trimite link de parolă</span>
                    </button>
                    <div class="muted" style="font-size:11.5px;line-height:1.4">
                      {editNiciodata ? 'N-a intrat niciodată — retrimite-i linkul de parolă.' : 'Trimite-i un link ca să-și pună altă parolă.'} Își pune singur parola; noi nu scriem parole.
                    </div>
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
                  {isEdit && !isSelf && (
                    <button class="btn btn-danger-ghost" disabled={saving} onClick={() => deschideScoate(editing)} style="font-size:14px">
                      <Icon name="logout" size={16} /> Scoate din firmă
                    </button>
                  )}
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

      {scoate && (() => {
        const nume = scoate.u.full_name || scoate.u.username;
        return (
          <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setScoate(null); }}>
            <div class="sheet">
              <div class="sheet-h"><b>Scoți pe „{nume}” din firmă?</b><button class="h-btn" onClick={() => setScoate(null)} aria-label="Închide"><Icon name="x" /></button></div>
              <div class="sheet-body">
                <p style="margin:0 0 12px;font-size:14.5px;line-height:1.5">Contul lui „<b>{nume}</b>” dispare de tot. Dacă omul se întoarce, îi faci cont nou.</p>
                {!scoate.gata && (
                  <div class="muted" style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px">
                    <div class="spin" style="width:14px;height:14px;border-width:2px" /> Se caută ce avea…
                  </div>
                )}
                {scoate.gata && scoate.ce && (
                  <div style="margin:0 0 14px;padding:10px 12px;border-radius:10px;background:var(--bg-dark);border:1px solid var(--border);font-size:13.5px;line-height:1.5">
                    <div><b>Avea:</b> {scoate.ce}.</div>
                    <div class="muted" style="margin-top:6px;font-size:12.5px">Notează-le acum, dacă le dai altcuiva — se șterg odată cu contul.</div>
                  </div>
                )}
                {scoate.err && (
                  <div role="alert" style="display:flex;gap:8px;align-items:flex-start;padding:10px 11px;margin:0 0 12px;border-radius:10px;font-size:13px;line-height:1.45;border:1px solid var(--red);background:rgba(240,90,90,.10);color:var(--text-primary)">
                    <Icon name="alert" size={17} color="var(--red)" />
                    <span style="flex:1;min-width:0">{scoate.err}</span>
                  </div>
                )}
                <div class="frm-actions">
                  <button class="btn" style={BTN_GHOST} onClick={() => setScoate(null)}>Anulează</button>
                  <button class="btn btn-danger-ghost" disabled={saving || !scoate.gata} onClick={() => doScoate(scoate.u)}>{saving ? '…' : 'Scoate din firmă'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {linkSheet && <LinkParolaSheet data={linkSheet} onClose={inchideLinkul} />}
    </div>
  );
}
