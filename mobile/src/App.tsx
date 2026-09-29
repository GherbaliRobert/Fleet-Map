import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { token, authReady, bootstrap, toastMsg, startLive, stopLive, refreshUnread, refreshMe, me, ecranAscuns, type EcranCheie } from './app/store';
import { ecranPornireCerut } from './app/store';
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
import { CompanySheet } from './screens/CompanySheet';
import { ClientNou } from './screens/ClientNou';
import { MutaCompanii } from './screens/MutaCompanii';
import { AdminDevices } from './screens/AdminDevices';
import { AdminArchived } from './screens/AdminArchived';
import { PlatformDashboard } from './screens/PlatformDashboard';
import { CostControl } from './screens/CostControl';
import { Offers } from './screens/Offers';
import { OfferCalc } from './screens/OfferCalc';   // calculatorul — socotit pe server, cu codul paginii web
import { OurPrices } from './screens/OurPrices';   // „Prețurile noastre": cât cerem, cât ne costă, cursul
import { DemoRequests } from './screens/DemoRequests';
// Operațiunile fondatorului (lotul 2b, F4): Acasă, Inventar, Tahograf și e-Transport pe firme, RA Insight, Chei API, Jurnal audit.
import { FounderHome } from './screens/FounderHome';
import { DeviceInventory } from './screens/DeviceInventory';
import { TachoOverview } from './screens/TachoOverview';
import { EtransportOverview } from './screens/EtransportOverview';
import { AiUsage } from './screens/AiUsage';
import { ApiKeys } from './screens/ApiKeys';
import { AuditLog } from './screens/AuditLog';
import { Contracts } from './screens/Contracts';
import { ContractDetail } from './screens/ContractDetail';
import { Dispatch } from './screens/Dispatch';
import { AdminGeofences } from './screens/AdminGeofences';
import { Hotspot } from './screens/Hotspot';
import { EToll } from './screens/EToll';
import { Settings } from './screens/Settings';
import { NotifDetail } from './screens/NotifDetail';
// Administrarea firmei (lotul 2). Fiecare ecran își are poarta înăuntru (poartaFirma): dreptul cerut ca rândul
// din meniu, iar contul de platformă (fără firmă) primește explicația, nu un formular care nu se poate salva.
import { AdminRoles } from './screens/AdminRoles';
import { AdminEmails } from './screens/AdminEmails';
import { ActivityLog } from './screens/ActivityLog';
import { AparateGps } from './screens/AparateGps';
import { TeamDisplay } from './screens/TeamDisplay';
import { ContulMeu } from './screens/ContulMeu';

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
  stats: pazit('statistici', Stats, 'Statistici flotă', true),
  reports: pazit('rapoarte', Reports, 'Rapoarte', true),
  fuelstats: pazit('statistici', FuelStats, 'Statistici consum'),
  schedules: pazit('programari', ReportSchedules, 'Rapoarte programate'),
  hotspot: pazit('hotspot', Hotspot, 'Hotspot & Rutare'),
  geofences: pazit('hotspot', AdminGeofences, 'Zone'), // zonele stau pe server sub ecranul „hotspot"
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
  // Ecranele platformei: în meniu apar doar la super-admin, dar la adresă se putea ajunge și altfel (buton,
  // notificare) și dădeai în „Acces interzis". Aparatele — inclusiv cele ARHIVATE — sunt ale noastre:
  // hotărât pe 18.09 că clientul nu-și vede aparatele arhivate.
  devices: doarSuper(AdminDevices, 'Dispozitive'),
  archived: doarSuper(AdminArchived, 'Dispozitive arhivate'),
  companies: doarSuper(AdminCompanies, 'Companii'),
  companySheet: doarSuper(CompanySheet, 'Companii'),   // fișa firmei, pe file
  clientNou: doarSuper(ClientNou, 'Client nou'),       // firmă + contract + administrator
  mutaCompanii: doarSuper(MutaCompanii, 'Mută între companii'),
  platform: doarSuper(PlatformDashboard, 'Dashboard platformă'),
  costs: doarSuper(CostControl, 'Control costuri'),
  offers: doarSuper(Offers, 'Ofertare Live'),
  offerCalc: doarSuper(OfferCalc, 'Ofertare Live'),
  ourPrices: doarSuper(OurPrices, 'Prețurile noastre'),
  demoRequests: doarSuper(DemoRequests, 'Cereri demo'),
  founderHome: doarSuper(FounderHome, 'Acasă'),
  inventory: doarSuper(DeviceInventory, 'Inventar dispozitive'),
  tachoFirme: doarSuper(TachoOverview, 'Tahograf'),
  etransportFirme: doarSuper(EtransportOverview, 'e-Transport'),
  aiUsage: doarSuper(AiUsage, 'Utilizare RA Insight'),
  // Serverul lasă cheile API și adminului de firmă (requireAdmin), dar pe telefon ecranul e al nostru: cheile le dăm noi.
  apiKeys: doarSuper(ApiKeys, 'Chei API'),
  audit: doarSuper(AuditLog, 'Jurnal audit'),
  contracts: doarSuper(Contracts, 'Contracte'),
  contractDetail: doarSuper(ContractDetail, 'Contracte'),
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

  // „Ecranul cu care se deschide aplicația" (Contul meu → Afișaj): store-ul îl cere O SINGURĂ DATĂ, după
  // pornirea la rece sau după autentificare, când sosesc preferințele contului. Îl deschidem doar dacă omul e
  // încă pe ecranul de pornire („/", sau „/vehicles" unde îl duce Login). Un tap pe notificare repornește
  // aplicația direct pe fișa mașinii sau pe Notificări — aceea câștigă. La revenirea din fundal nu se cere nimic.
  const ecranCerut = ecranPornireCerut.value;
  useEffect(() => {
    if (!ecranCerut) return;
    ecranPornireCerut.value = null;
    const p = loc.path || '/';
    if (p === '/' || p === '/vehicles') loc.route(ecranCerut, true);
  }, [ecranCerut]);

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
        <Route path="/admin/roles" component={AdminRoles} />
        <Route path="/admin/emails" component={AdminEmails} />
        <Route path="/admin/activity" component={ActivityLog} />
        <Route path="/admin/aparate" component={AparateGps} />
        <Route path="/admin/afisaj" component={TeamDisplay} />
        <Route path="/notif-prefs" component={NotifPrefs} />
        <Route path="/cont" component={ContulMeu} />
        <Route path="/report-schedules" component={P.schedules} />
        <Route path="/ai" component={P.aiChat} />
        <Route path="/ai-stats" component={P.aiStats} />
        <Route path="/ai-agents" component={P.aiAgents} />
        <Route path="/etransport" component={P.etransport} />
        <Route path="/tahograf" component={P.tahograf} />
        <Route path="/admin/documents" component={P.documents} />
        <Route path="/admin/webhooks" component={AdminWebhooks} />
        <Route path="/billing" component={Billing} />
        <Route path="/admin/companies" component={P.companies} />
        <Route path="/admin/companies/:id" component={P.companySheet} />
        <Route path="/admin/client-nou" component={P.clientNou} />
        <Route path="/admin/muta" component={P.mutaCompanii} />
        <Route path="/admin/devices" component={P.devices} />
        <Route path="/admin/archived" component={P.archived} />
        <Route path="/admin/platform" component={P.platform} />
        <Route path="/admin/costs" component={P.costs} />
        <Route path="/admin/offers" component={P.offers} />
        {/* Ordinea contează: rutele cu nume fix înaintea celei cu :id (routerul ia prima potrivire). */}
        <Route path="/admin/offers/noua" component={P.offerCalc} />
        <Route path="/admin/offers/preturi" component={P.ourPrices} />
        <Route path="/admin/offers/:id" component={P.offerCalc} />
        <Route path="/admin/demo-requests" component={P.demoRequests} />
        <Route path="/admin/home" component={P.founderHome} />
        <Route path="/admin/inventory" component={P.inventory} />
        <Route path="/admin/tahograf-firme" component={P.tachoFirme} />
        <Route path="/admin/etransport-firme" component={P.etransportFirme} />
        <Route path="/admin/ai-usage" component={P.aiUsage} />
        <Route path="/admin/apikeys" component={P.apiKeys} />
        <Route path="/admin/audit" component={P.audit} />
        <Route path="/admin/contracts" component={P.contracts} />
        <Route path="/admin/contracts/:companyId" component={P.contractDetail} />
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
