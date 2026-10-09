import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { App as CapApp } from '@capacitor/app';
import { me, theme, toggleTheme, logout, showToast, ecranAscuns, type EcranCheie } from '../app/store';
import { temaCont } from '../app/store';
import { Api } from '../api/endpoints';
import { API_BASE } from '../api/client'; // documentele legale sunt servite de server, nu împachetate în APK
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
  // Versiunea REALĂ a APK-ului (din build.gradle → variables.gradle), nu una scrisă de mână: după ea
  // verificăm ce aplicație are un client instalată. În browser nu există → subsolul rămâne fără versiune.
  const [versiune, setVersiune] = useState('');
  // Fondatorul: câte cereri de demo NOI așteaptă (bulina de lângă „Cereri demo"). Tăcut dacă nu se poate citi.
  const [cereriNoi, setCereriNoi] = useState(0);
  useEffect(() => {
    if (!me.value?.isSuper) return;
    Api.demoRequests('new').then((l) => setCereriNoi(Array.isArray(l) ? l.filter((r: any) => r.status === 'new').length : 0)).catch(() => {});
  }, []);
  useEffect(() => {
    CapApp.getInfo().then((i) => setVersiune(String(i.version || '').replace(/-debug$/, ''))).catch(() => {});
  }, []);

  function item(icon: IconName, label: string, onClick: () => void, right?: any, cls = '') {
    return (
      <button class={'mn-item ' + cls} onClick={onClick}>
        <Icon name={icon} size={20} class="ic" />
        <span class="lbl">{label}</span>
        {right != null ? <span class="rt">{right}</span> : <Icon name="chevronR" size={18} color="var(--text-muted)" />}
      </button>
    );
  }

  async function sendSupport() {
    if (!msg.trim()) return;
    setSending(true);
    try { await Api.support(msg.trim()); showToast('Mesaj trimis. Te contactăm în curând.'); setSupport(false); setMsg(''); }
    catch (e: any) { showToast(e?.message || 'Eroare la trimitere', true); }
    finally { setSending(false); }
  }

  // Capul meniului arată numele afișat (Contul meu), ca bara de sus de pe web; emailul doar dacă nu are nume.
  const numeAfisat = (u?.full_name || '').trim() || u?.username || '';
  const initials = initiale(numeAfisat);
  // Rolul: numele dat de server (respectă redenumirile firmei și rolurile proprii); lista locală e doar rezervă.
  const subtitlu = [u?.company?.name, u?.roleLabel || roleLabel(u?.role)].filter(Boolean).join(' · ');

  // Ecranele pe care firma le-a tăiat din rolul omului dispar din meniu, ca pe web (data-ecran).
  const vede = (k: EcranCheie) => !ecranAscuns(k);
  // Titlul „Administrare" apare doar dacă a rămas măcar un rând sub el.
  const FLOTA: EcranCheie[] = ['soferi', 'grupe', 'mentenanta', 'documente', 'vehicule', 'alerte'];
  const areAdmin = !!perms.manageUsers || vede('hotspot') || (!!perms.manageFleet && FLOTA.some(vede))
    || (!!perms.manageFleet && !u?.isSuper); // „Aparate GPS" nu ține de niciun ecran tăiabil: rămâne sub titlu
  // Modulele se pornesc pe firmă, din ofertă. Oprit → rândul dispare (ca pe web), nu mai scrie „în curând":
  // modulul există și se vinde, deci „în curând" era o promisiune falsă. Aceeași regulă ca pe web: ascuns doar
  // când e oprit explicit (super-adminul n-are firmă, deci nicio listă de module — le vede pe toate).
  const modul = (k: string) => u?.features?.[k] !== false;

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Meniu</div></header>
      <div class="content has-tabbar">
        <div class="mn-user">
          <div class="mn-ava">{initials}</div>
          <div style="min-width:0;overflow-wrap:anywhere"><div class="nm">{numeAfisat || '—'}</div><div class="sub">{subtitlu}</div></div>
        </div>

        <div class="mn-sec">Analize</div>
        {vede('statistici') && item('droplet', 'Statistici consum', () => loc.route('/fuelstats'))}
        {item('coins', 'Preț combustibil', () => loc.route('/fuelprice'))}
        {perms.viewReports && vede('programari') && item('clock', 'Rapoarte programate', () => loc.route('/report-schedules'))}
        {u?.features?.ai_assistant && vede('insight') && item('robot', 'Asistent AI', () => loc.route('/ai'))}
        {/* Agenți AI: rând propriu, ca pe web — vizibil când modulul agenților e activ și omul are voie la rapoarte.
            Înainte se ajungea aici doar din „Asistenți AI", ecran rămas acum doar pentru super-admin. */}
        {u?.features?.agents !== false && perms.viewReports && vede('insight') && item('shield', 'Agenți AI', () => loc.route('/ai-agents'))}

        <div class="mn-sec">Module</div>
        {/* Tahograf și e-Transport cer pe server dreptul de rapoarte: fără el, rândul ducea într-un „Acces interzis". */}
        {/* Tahograf, e-Transport și Taxa de drum stau pe web în „Management", pe care o vede doar cine poate modifica
            flota (administratorul și managerul firmei). Același om vede același meniu pe web și pe telefon. */}
        {/* La fondator, Tahograf și e-Transport sunt ecranele PE FIRME, din „AI & Module" (mai jos), nu cele ale unei firme. */}
        {!u?.isSuper && perms.manageFleet && perms.viewReports && modul('etransport') && vede('etransport') && item('truck', 'e-Transport (ANAF)', () => loc.route('/etransport'))}
        {perms.manageFleet && modul('etoll') && vede('tollro') && item('route', 'Taxa de drum (TollRo)', () => loc.route('/etoll'))}
        {!u?.isSuper && perms.manageFleet && perms.viewReports && modul('tahograf') && vede('tahograf') && item('disc', 'Tahograf', () => loc.route('/tahograf'))}
        {item('compass', 'Dispecerizare', () => loc.route('/dispatch'))}
        {perms.viewReports && vede('hotspot') && item('mapPin', 'Hotspot & Rutare', () => loc.route('/hotspot'))}

        {(perms.manageFleet || perms.manageUsers) && areAdmin && (
          <>
            <div class="mn-sec">Administrare</div>
            {perms.manageFleet && vede('soferi') && item('user', 'Șoferi', () => loc.route('/admin/drivers'))}
            {perms.manageFleet && vede('grupe') && item('layers', 'Grupe', () => loc.route('/admin/groups'))}
            {vede('hotspot') && item('mapPin', 'Zone', () => loc.route('/admin/geofences'))}
            {perms.manageFleet && vede('mentenanta') && item('wrench', 'Mentenanță', () => loc.route('/admin/maintenance'))}
            {perms.manageFleet && vede('documente') && item('report', 'Documente vehicule', () => loc.route('/admin/documents'))}
            {perms.manageFleet && vede('vehicule') && item('car', 'Vehicule', () => loc.route('/vehicles'))}
            {perms.manageFleet && vede('alerte') && item('alert', 'Alerte', () => loc.route('/admin/alerts'))}
            {/* La fondator, Utilizatori stă în „Gestiune" și Facturare în „Business" (mai jos), ca pe web. */}
            {perms.manageUsers && !u?.isSuper && item('user', 'Utilizatori', () => loc.route('/admin/users'))}
            {/* Administrarea firmei (ca pe web, Setări → Conturi și roluri / Notificări / Evidență). Reglaje ALE UNEI
                FIRME: la contul de platformă nu apar (web-ul îi arată doar explicația, serverul refuză salvarea). */}
            {perms.manageUsers && !u?.isSuper && item('shield', 'Roluri', () => loc.route('/admin/roles'))}
            {perms.manageUsers && !u?.isSuper && item('mail', 'Adrese de email', () => loc.route('/admin/emails'))}
            {perms.manageUsers && !u?.isSuper && item('clock', 'Istoric activitate', () => loc.route('/admin/activity'))}
            {/* La noi, aparatele (cu semnal) stau în Gestiune → Dispozitive. */}
            {perms.manageFleet && !u?.isSuper && item('cpu', 'Aparate GPS', () => loc.route('/admin/aparate'))}
            {perms.manageUsers && !u?.isSuper && item('report', 'Facturile mele', () => loc.route('/billing'))}
            {perms.manageUsers && item('zap', 'Webhooks (integrări)', () => loc.route('/admin/webhooks'))}
          </>
        )}

        {u?.isSuper && (
          <>
            {/* Verticala fondatorului, ca bara din stânga de pe web: Gestiune · AI & Module · Business · Sistem, în aceeași
                ordine, cu aceleași nume și aceleași iconițe de grupă (depozit, piesă de puzzle, servietă, roți dințate).
                „Platformă (super-admin)" a plecat: „super-admin" e jargon, scos de pe web pe 17.09. „Asistenți AI" (tokeni
                pe tip) a ieșit și el, ca pe web — aceleași date, puse mai bine, sunt în „Utilizare RA Insight". */}
            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="warehouse" size={13} /> Gestiune</div>
            {item('gauge', 'Acasă', () => loc.route('/admin/home'))}
            {item('cpu', 'Dispozitive', () => loc.route('/admin/devices'))}
            {item('user', 'Utilizatori', () => loc.route('/admin/users'))}
            {item('clipboard', 'Inventar dispozitive', () => loc.route('/admin/inventory'))}
            {/* Stocul NOSTRU de echipamente (depozit → instalator → client), ca pe web, între Inventar și Arhivate. */}
            {item('boxes', 'Stoc echipamente', () => loc.route('/admin/stoc'))}
            {/* Cutie, nu coș de gunoi: arhivarea nu șterge nimic. */}
            {item('archive', 'Dispozitive arhivate', () => loc.route('/admin/archived'))}

            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="puzzle" size={13} /> AI &amp; Module</div>
            {item('sparkles', 'Utilizare RA Insight', () => loc.route('/admin/ai-usage'))}
            {item('disc', 'Tahograf', () => loc.route('/admin/tahograf-firme'))}
            {item('truck', 'e-Transport', () => loc.route('/admin/etransport-firme'))}

            {/* Business, în ordinea fluxului: ofertă → contract → client → factură → cifre → costuri → cereri. */}
            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="briefcase" size={13} /> Business</div>
            {item('fileBar', 'Ofertare Live', () => loc.route('/admin/offers'))}
            {/* Ca pe web (Business: Ofertare Live → Contracte → Companii): pasul dintre ofertă și client. */}
            {item('fileSignature', 'Contracte', () => loc.route('/admin/contracts'))}
            {item('building', 'Companii', () => loc.route('/admin/companies'))}
            {/* Ca pe web: „Montaj" imediat sub Companii — partenerii, contractele cu ei, toate lucrările. */}
            {item('wrench', 'Montaj', () => loc.route('/admin/montaj'))}
            {item('report', 'Facturare', () => loc.route('/billing'))}
            {item('chart', 'Dashboard platformă', () => loc.route('/admin/platform'))}
            {item('coins', 'Control costuri', () => loc.route('/admin/costs'))}
            {/* Bulina roșie: cererile noi, ca pe web (nav-demoreq-badge). */}
            {item('mail', 'Cereri demo', () => loc.route('/admin/demo-requests'),
              cereriNoi > 0 ? <span style="display:inline-flex;align-items:center;gap:6px"><span style="background:var(--red);color:#fff;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:800">{cereriNoi}</span><Icon name="chevronR" size={18} color="var(--text-muted)" /></span> : undefined)}

            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="gears" size={13} /> Sistem</div>
            {item('key', 'Chei API', () => loc.route('/admin/apikeys'))}
            {item('clipboard', 'Jurnal audit', () => loc.route('/admin/audit'))}
          </>
        )}

        <div class="mn-sec">Cont & setări</div>
        {/* Ca pe web (Setări → Contul meu, drept „oricine"): fiecare om își schimbă numele, telefonul și parola. */}
        {item('idCard', 'Contul meu', () => loc.route('/cont'))}
        {/* Aceleași cuvinte ca variantele din Contul meu → Afișaj și de pe web: Închisă / Deschisă / Ca pe dispozitiv. */}
        {item(theme.value === 'dark' ? 'moon' : 'sun', 'Temă', () => toggleTheme(), temaCont.value === 'sistem' ? 'Ca pe dispozitiv' : theme.value === 'dark' ? 'Închisă' : 'Deschisă')}
        {item('bell', 'Preferințe notificări', () => loc.route('/notif-prefs'))}
        {(perms.manageFleet || perms.manageUsers) && item('settings', 'Setări companie', () => loc.route('/settings'))}
        {perms.manageUsers && !u?.isSuper && item('eye', 'Afișaj pentru toți', () => loc.route('/admin/afisaj'))}
        {item('headset', 'Suport clienți', () => setSupport(true))}
        {item('logout', 'Deconectare', () => logout(), null, 'danger')}

        {/* Documentele legale trebuie să fie accesibile din aplicație, nu doar de pe site: utilizatorul care
            primește cont direct nu trece niciodată prin pagina publică. E și cerință Google Play. */}
        <div class="mn-foot">
          <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <a href={API_BASE + '/termeni'} target="_blank" rel="noopener" style="color:var(--text-muted)">Termeni</a>
            <span aria-hidden="true">·</span>
            <a href={API_BASE + '/confidentialitate'} target="_blank" rel="noopener" style="color:var(--text-muted)">Confidențialitate</a>
          </div>
          RA Track{versiune ? ' · v' + versiune : ''}
        </div>
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

// Rezervă, când serverul nu trimite roleLabel (firma n-a redenumit rolul). Aceleași nume ca pe web (ROLE_LABELS):
// „Admin companie" e singurul nume al rolului (jurnal, 23.09).
function roleLabel(r?: string) {
  const m: Record<string, string> = { superadmin: 'Super-admin', company_admin: 'Admin companie', admin: 'Admin companie', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Viewer' };
  return (r && m[r]) || r || '';
}

// Inițialele din numele afișat („Ion Popescu" → IP); la o adresă de email, primele două litere, ca înainte.
function initiale(n: string) {
  const s = String(n || '').trim();
  if (!s) return '?';
  if (s.indexOf('@') < 0) {
    const w = s.split(/\s+/).filter(Boolean);
    if (w.length >= 2) return (w[0].charAt(0) + w[1].charAt(0)).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}
