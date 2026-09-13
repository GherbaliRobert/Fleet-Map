import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { token, authReady, bootstrap, toastMsg, startLive, stopLive, refreshUnread, refreshMe, me, ecranAscuns, type EcranCheie } from './app/store';
import { Icon } from './components/Icon';
import { App as CapApp } from '@capacitor/app';
import { initPush } from './lib/push';
import { TabBar } from './components/TabBar';
import { Login } from './screens/Login';
import { Vehicles } from './screens/Vehicles';
import { VehicleDetail } from './screens/VehicleDetail';
import { Stats } from './screens/Stats';
import { Notifications } from './screens/Notifications';
import { RouteScreen } from './screens/RouteScreen';
import { CanScreen } from './screens/CanScreen';
import { FollowScreen } from './screens/FollowScreen';
import { Reports } from './screens/Reports';
import { Menu } from './screens/Menu';
import { FuelStats } from './screens/FuelStats';
import { FuelPrice } from './screens/FuelPrice';
import { AdminDrivers } from './screens/AdminDrivers';
import { AdminGroups } from './screens/AdminGroups';
import { AdminMaintenance } from './screens/AdminMaintenance';
import { AdminAlerts } from './screens/AdminAlerts';
import { AdminUsers } from './screens/AdminUsers';
import { NotifPrefs } from './screens/NotifPrefs';
import { ReportSchedules } from './screens/ReportSchedules';
import { AiChat } from './screens/AiChat';
import { AiAssistants } from './screens/AiAssistants';
import { AiAgents } from './screens/AiAgents';
import { ETransport } from './screens/ETransport';
import { Tahograf } from './screens/Tahograf';
import { AdminDocuments } from './screens/AdminDocuments';
import { AdminWebhooks } from './screens/AdminWebhooks';
import { Billing } from './screens/Billing';
import { AdminCompanies } from './screens/AdminCompanies';
import { AdminDevices } from './screens/AdminDevices';
import { AdminArchived } from './screens/AdminArchived';
import { PlatformDashboard } from './screens/PlatformDashboard';
import { CostControl } from './screens/CostControl';
import { Offers } from './screens/Offers';
import { DemoRequests } from './screens/DemoRequests';
import { Dispatch } from './screens/Dispatch';
import { AdminGeofences } from './screens/AdminGeofences';
import { Hotspot } from './screens/Hotspot';
import { EToll } from './screens/EToll';
import { Settings } from './screens/Settings';
import { NotifDetail } from './screens/NotifDetail';

// ── Ecranele tăiate din rol ──
// Firma poate ascunde unui rol anumite ecrane (câmpul `ecraneAscunse` din /api/me). Din meniu și din bara
// de jos dispar; dacă omul ajunge totuși la adresa ecranului (buton din alt ecran, notificare), vede o pagină
// calmă în loc de „Acces interzis" de la server. Cheile sunt cele din ECRANE (server.js). Ecranele fără rute
// proprii pe server („localizare", „vehicule") nu se păzesc aici: harta/lista de vehicule rămâne ecranul de
// pornire, exact ca pe web, unde ascunderea lor scoate doar butonul din meniu.
// Învelișurile se fac O SINGURĂ DATĂ, aici sus: o funcție nouă la fiecare randare ar reîncărca ecranul mereu.
function pazit(cheie: EcranCheie, Ecran: ComponentType<any>, titlu: string, radacina = false): ComponentType<any> {
  return (props: any) => (ecranAscuns(cheie) ? <EcranIndisponibil titlu={titlu} radacina={radacina} /> : <Ecran {...props} />);
}
// „Asistenți AI" arată tokenii și modelul AI — informație doar pentru noi (pe web ecranul a ieșit din meniu).
function doarSuper(Ecran: ComponentType<any>, titlu: string): ComponentType<any> {
  return (props: any) => (me.value?.isSuper ? <Ecran {...props} /> : <EcranIndisponibil titlu={titlu} doarNoi />);
}
const P = {
  route: pazit('traseu', RouteScreen, 'Traseu'),
  stats: pazit('statistici', Stats, 'Statistici', true),
  reports: pazit('rapoarte', Reports, 'Rapoarte', true),
  fuelstats: pazit('statistici', FuelStats, 'Statistici consum'),
  schedules: pazit('programari', ReportSchedules, 'Rapoarte programate'),
  hotspot: pazit('hotspot', Hotspot, 'Hotspot & Rutare'),
  geofences: pazit('hotspot', AdminGeofences, 'Zone (geofence)'), // zonele stau pe server sub ecranul „hotspot"
  drivers: pazit('soferi', AdminDrivers, 'Șoferi'),
  groups: pazit('grupe', AdminGroups, 'Grupe'),
  alerts: pazit('alerte', AdminAlerts, 'Alerte'),
  maintenance: pazit('mentenanta', AdminMaintenance, 'Mentenanță'),
  documents: pazit('documente', AdminDocuments, 'Documente vehicule'),
  tahograf: pazit('tahograf', Tahograf, 'Tahograf'),
  etransport: pazit('etransport', ETransport, 'e-Transport (ANAF)'),
  etoll: pazit('tollro', EToll, 'Taxa de drum (TollRo)'),
  aiChat: pazit('insight', AiChat, 'Asistent AI'),   // /api/ai stă pe server sub ecranul „insight"
  aiAgents: pazit('insight', AiAgents, 'Agenți AI'),
  aiStats: doarSuper(AiAssistants, 'Asistenți AI'),
};

export function App() {
  useEffect(() => { bootstrap(); }, []);
  return (
    <LocationProvider>
      <Shell />
      <Toaster />
    </LocationProvider>
  );
}

function Shell() {
  const loc = useLocation();
  // Buton "back" Android → navighează înapoi în istoric (sau iese din app pe ecranele root).
  useEffect(() => {
    const h = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) history.back(); else CapApp.exitApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, []);

  // Polling live global cât suntem autentificați; pauză pe background, reluare pe foreground.
  useEffect(() => {
    if (!token.value) return;
    startLive(7000);
    refreshUnread();
    initPush();
    const unreadTimer = setInterval(refreshUnread, 30000);
    // La revenire reîmprospătăm și profilul: drepturile și ecranele tăiate de firmă se aplică fără re-logare.
    const h = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) { startLive(7000); refreshMe(); } else stopLive(); });
    return () => { stopLive(); clearInterval(unreadTimer); h.then((x) => x.remove()); };
  }, [token.value]);

  if (!authReady.value) return <Splash />;
  if (!token.value) return <Login />;

  const path = loc.path || '/';
  const showTabs = path === '/' || path === '/vehicles' || path === '/stats' || path === '/reports' || path === '/notifications' || path === '/meniu';

  return (
    <>
      <Router>
        <Route path="/" component={Vehicles} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/vehicles/:imei" component={VehicleDetail} />
        <Route path="/vehicles/:imei/route" component={P.route} />
        <Route path="/vehicles/:imei/can" component={CanScreen} />
        <Route path="/vehicles/:imei/follow" component={FollowScreen} />
        <Route path="/stats" component={P.stats} />
        <Route path="/reports" component={P.reports} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/meniu" component={Menu} />
        <Route path="/fuelstats" component={P.fuelstats} />
        <Route path="/fuelprice" component={FuelPrice} />
        <Route path="/admin/drivers" component={P.drivers} />
        <Route path="/admin/groups" component={P.groups} />
        <Route path="/admin/maintenance" component={P.maintenance} />
        <Route path="/admin/alerts" component={P.alerts} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/notif-prefs" component={NotifPrefs} />
        <Route path="/report-schedules" component={P.schedules} />
        <Route path="/ai" component={P.aiChat} />
        <Route path="/ai-stats" component={P.aiStats} />
        <Route path="/ai-agents" component={P.aiAgents} />
        <Route path="/etransport" component={P.etransport} />
        <Route path="/tahograf" component={P.tahograf} />
        <Route path="/admin/documents" component={P.documents} />
        <Route path="/admin/webhooks" component={AdminWebhooks} />
        <Route path="/billing" component={Billing} />
        <Route path="/admin/companies" component={AdminCompanies} />
        <Route path="/admin/devices" component={AdminDevices} />
        <Route path="/admin/archived" component={AdminArchived} />
        <Route path="/admin/platform" component={PlatformDashboard} />
        <Route path="/admin/costs" component={CostControl} />
        <Route path="/admin/offers" component={Offers} />
        <Route path="/admin/demo-requests" component={DemoRequests} />
        <Route path="/dispatch" component={Dispatch} />
        <Route path="/admin/geofences" component={P.geofences} />
        <Route path="/hotspot" component={P.hotspot} />
        <Route path="/etoll" component={P.etoll} />
        <Route path="/settings" component={Settings} />
        <Route path="/notif/:id" component={NotifDetail} />
        <Route default component={Vehicles} />
      </Router>
      {showTabs && <TabBar />}
    </>
  );
}

// Pagina calmă pentru un ecran la care omul n-are acces. Un „Acces interzis" sec arată a aplicație stricată;
// aici se spune pe scurt de ce și unde poate merge mai departe.
function EcranIndisponibil({ titlu, radacina, doarNoi }: { titlu: string; radacina?: boolean; doarNoi?: boolean }) {
  const loc = useLocation();
  return (
    <div class="screen">
      <header class="app-header">
        {!radacina && <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>}
        <div class="h-title">{titlu}</div>
      </header>
      <div class="content has-tabbar">
        <div class="center-msg" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:56px">
          <span style="width:56px;height:56px;border-radius:16px;background:var(--bg-panel);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center">
            <Icon name="lock" size={26} color="var(--text-muted)" />
          </span>
          <div style="font-weight:800;font-size:16px;color:var(--text-primary)">Ecranul nu e disponibil pentru rolul tău</div>
          <div style="font-size:13.5px;line-height:1.5;max-width:300px">
            {doarNoi
              ? 'Ecranul acesta e rezervat administratorilor platformei RA Tracks.'
              : 'Firma ta a ascuns acest ecran pentru rolul tău. Dacă ai nevoie de el, cere-i administratorului firmei să ți-l deschidă.'}
          </div>
          <button class="btn btn-primary" style="margin-top:8px" onClick={() => loc.route('/vehicles')}>Mergi la vehicule</button>
        </div>
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--bg-darkest)">
      <div style="font-weight:800;font-size:26px;letter-spacing:-.5px"><span style="color:var(--accent)">RA</span> Tracks</div>
      <div class="spin" />
    </div>
  );
}

function Toaster() {
  const t = toastMsg.value;
  if (!t) return null;
  return <div class={'toast' + (t.err ? ' err' : '')}>{t.text}</div>;
}
