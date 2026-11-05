import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { App as CapApp } from '@capacitor/app';
import { me, theme, toggleTheme, logout, ecranAscuns, lastNotif, type EcranCheie } from '../app/store';
import { temaCont } from '../app/store';
import { Api } from '../api/endpoints';
import { API_BASE } from '../api/client'; // documentele legale sunt servite de server, nu împachetate în APK
import { Icon, type IconName } from '../components/Icon';
import { modulIncarcare, RUTA_PLANURI } from '../lib/incarcare';
import { RUTA_CERERI_CLIENTI, TITLU_CERERI, TITLU_FEREASTRA, usaMeniu } from '../lib/cereriEchipa';
import './menu.css';

export function Menu() {
  const loc = useLocation();
  const u = me.value;
  const perms = u?.permissions || {};
  // Versiunea REALĂ a APK-ului (din build.gradle → variables.gradle), nu una scrisă de mână: după ea
  // verificăm ce aplicație are un client instalată. În browser nu există → subsolul rămâne fără versiune.
  const [versiune, setVersiune] = useState('');
  // Fondatorul: câte cereri de demo NOI așteaptă (bulina de lângă „Cereri demo"). Tăcut dacă nu se poate citi.
  const [cereriNoi, setCereriNoi] = useState(0);
  useEffect(() => {
    if (!me.value?.isSuper) return;
    Api.demoRequests('new').then((l) => setCereriNoi(Array.isArray(l) ? l.filter((r: any) => r.status === 'new').length : 0)).catch(() => {});
  }, []);
  // …și câte cereri de la clienți sunt încă nepreluate (bulina de lângă „Cereri de la clienți"); la un anunț nou, din nou, ca pe web.
  const [cereriEchipaNoi, setCereriEchipaNoi] = useState(0);
  const anuntNou = lastNotif.value && lastNotif.value.type === 'cerere_echipa' ? lastNotif.value.id : 0;
  useEffect(() => {
    if (!me.value?.isSuper) return;
    Api.cereriNumar().then((j) => setCereriEchipaNoi(Number(j && j.noi) || 0)).catch(() => {});
  }, [anuntNou]);
  useEffect(() => {
    CapApp.getInfo().then((i) => setVersiune(String(i.version || '').replace(/-debug$/, ''))).catch(() => {});
  }, []);

  // Bulina roșie de lângă un rând, cu săgeata (ca nav-demoreq-badge de pe web); fără nimic de arătat, rândul rămâne cu săgeata lui.
  const bulina = (n: number) => (n > 0 ? <span style="display:inline-flex;align-items:center;gap:6px"><span style="background:var(--red);color:#fff;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:800">{n}</span><Icon name="chevronR" size={18} color="var(--text-muted)" /></span> : undefined);

  // „NOU" (05.11): rândurile noi le spune serverul (/api/me → meniuNou; 15 zile de la publicare), ca pe web (#nav-<cheie>).
  // Un rând nou din meniu primește aici, ca ultim argument, aceeași cheie ca în meniu_nou.js. NU scrie „NOU" de mână.
  const noi: string[] = Array.isArray(u?.meniuNou) ? u!.meniuNou!.map(String) : [];
  function item(icon: IconName, label: string, onClick: () => void, right?: any, cls = '', nou?: string) {
    return (
      <button class={'mn-item ' + cls} onClick={onClick}>
        <Icon name={icon} size={20} class="ic" />
        <span class="lbl">{label}</span>
        {nou && noi.indexOf(nou) >= 0 ? <span class="mn-nou">NOU</span> : null}
        {right != null ? <span class="rt">{right}</span> : <Icon name="chevronR" size={18} color="var(--text-muted)" />}
      </button>
    );
  }

  // Capul meniului arată numele afișat (Contul meu), ca bara de sus de pe web; emailul doar dacă nu are nume.
  const numeAfisat = (u?.full_name || '').trim() || u?.username || '';
  const initials = initiale(numeAfisat);
  // Rolul: numele dat de server (respectă redenumirile firmei și rolurile proprii); lista locală e doar rezervă.
  const subtitlu = [u?.company?.name, u?.roleLabel || roleLabel(u?.role)].filter(Boolean).join(' · ');

  // Ecranele pe care firma le-a tăiat din rolul omului dispar din meniu, ca pe web (data-ecran).
  const vede = (k: EcranCheie) => !ecranAscuns(k);
  // Titlul grupei apare doar dacă a rămas măcar un rând sub el.
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
        {/* RA Insight: rândul lui, când firma are modulul (ca pe web, #nav-insight). */}
        {u?.features?.ai_assistant !== false && vede('insight') && item('sparkles', 'RA Insight', () => loc.route('/insight'), undefined, '', 'insight')}
        {/* Agenți AI: rând propriu, ca pe web — vizibil când modulul agenților e activ și omul are voie la rapoarte.
            Înainte se ajungea aici doar din „Asistenți AI", ecran rămas acum doar pentru super-admin. Cine are cont RA Insight
            (`aiCont`) vede agenții în „Azi la tine", iar pagina lor o deschide din „⋯" → „Setările agenților". */}
        {u?.features?.agents !== false && perms.viewReports && !u?.aiCont && vede('insight') && item('shield', 'Agenți AI', () => loc.route('/ai-agents'))}

        <div class="mn-sec">Module</div>
        {/* Tahograf și e-Transport cer pe server dreptul de rapoarte: fără el, rândul ducea într-un „Acces interzis". */}
        {/* Tahograf, e-Transport și Taxa de drum stau pe web în „Management", pe care o vede doar cine poate modifica
            flota (administratorul și managerul firmei). Același om vede același meniu pe web și pe telefon. */}
        {/* La fondator, Tahograf și e-Transport sunt ecranele PE FIRME, din „AI & Module" (mai jos), nu cele ale unei firme. */}
        {!u?.isSuper && perms.manageFleet && perms.viewReports && modul('etransport') && vede('etransport') && item('truck', 'e-Transport (ANAF)', () => loc.route('/etransport'))}
        {perms.manageFleet && modul('etoll') && vede('tollro') && item('route', 'Taxa de drum (TollRo)', () => loc.route('/etoll'))}
        {!u?.isSuper && perms.manageFleet && perms.viewReports && modul('tahograf') && vede('tahograf') && item('disc', 'Tahograf', () => loc.route('/tahograf'))}
        {item('compass', 'Dispecerizare', () => loc.route('/dispatch'))}
        {/* Simulatorul de încărcare (12.10), ca pe web: îl deschide cine poate modifica flota și dispecerul firmei. Planurile
            primite le găsește oricine din firmă — șoferul își vede aici planul trimis de dispecer. */}
        {modulIncarcare(u) && (u?.isSuper || perms.manageFleet || u?.role === 'dispatcher') && item('boxes', 'Simulator încărcare', () => loc.route('/incarcare'), undefined, '', 'incarcare')}
        {modulIncarcare(u) && item('clipboard', 'Planurile de încărcare', () => loc.route(RUTA_PLANURI))}
        {perms.viewReports && vede('hotspot') && item('mapPin', 'Hotspot & Rutare', () => loc.route('/hotspot'))}

        {(perms.manageFleet || perms.manageUsers) && areAdmin && (
          <>
            {/* La client se cheamă „Management”, ca pe web: textele serverului spun „Management › Șoferi”, „Management › Alerte › Adaugă regulă”. */}
            <div class="mn-sec">{u?.isSuper ? 'Administrare' : 'Management'}</div>
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
            {/* Verticala fondatorului, ca bara din stânga de pe web: Gestiune · Module · Business · Sistem, în aceeași
                ordine, cu aceleași nume și aceleași iconițe de grupă (depozit, piesă de puzzle, servietă, roți dințate).
                „Platformă (super-admin)" a plecat: „super-admin" e jargon, scos de pe web pe 17.09. „Asistenți AI" (tokeni
                pe tip) a ieșit și el, ca pe web — aceleași date, puse mai bine, sunt în „RA Insight · control" (sus, ca pe web, nu într-o grupă). */}
            {item('sparkles', 'RA Insight · control', () => loc.route('/admin/ai-usage'))}
            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="warehouse" size={13} /> Gestiune</div>
            {item('gauge', 'Acasă', () => loc.route('/admin/home'))}
            {item('cpu', 'Dispozitive', () => loc.route('/admin/devices'))}
            {item('user', 'Utilizatori', () => loc.route('/admin/users'))}
            {item('clipboard', 'Inventar dispozitive', () => loc.route('/admin/inventory'))}
            {/* Stocul NOSTRU de echipamente (depozit → instalator → client), ca pe web, între Inventar și Arhivate. */}
            {item('boxes', 'Stoc echipamente', () => loc.route('/admin/stoc'))}
            {/* Cutie, nu coș de gunoi: arhivarea nu șterge nimic. */}
            {item('archive', 'Dispozitive arhivate', () => loc.route('/admin/archived'))}

            <div class="mn-sec" style="display:flex;align-items:center;gap:6px"><Icon name="puzzle" size={13} /> Module</div>
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
              bulina(cereriNoi))}
            {/* Cererile de la clienți (23.10), ca pe web: după „Cereri demo", cu bulina celor încă nepreluate. */}
            {item('headset', TITLU_CERERI, () => loc.route(RUTA_CERERI_CLIENTI),
              bulina(cereriEchipaNoi))}
            {/* Panoul Mail al fondatorilor (12.10), ca pe web: imediat după „Cereri demo", în Business. */}
            {item('mail', 'Mail', () => loc.route('/admin/mail'))}

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
        {/* „Anunță echipa RA Track" în locul vechii foi „Suport clienți". Noi nu trimitem cereri: fondatorul are lista lor, în Business. */}
        {!u?.isSuper && item('headset', TITLU_FEREASTRA, () => loc.route(usaMeniu()))}
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
