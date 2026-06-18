import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';
import { token, authReady, bootstrap, toastMsg, startPolling, stopPolling, refreshUnread } from './app/store';
import { App as CapApp } from '@capacitor/app';
import { initPush } from './lib/push';
import { TabBar } from './components/TabBar';
import { Login } from './screens/Login';
import { Vehicles } from './screens/Vehicles';
import { VehicleDetail } from './screens/VehicleDetail';
import { Stats } from './screens/Stats';
import { Notifications } from './screens/Notifications';
import { RouteScreen } from './screens/RouteScreen';
import { Reports } from './screens/Reports';
import { Menu } from './screens/Menu';
import { FuelStats } from './screens/FuelStats';
import { WeeklyReport } from './screens/WeeklyReport';
import { AdminDrivers } from './screens/AdminDrivers';
import { AdminGroups } from './screens/AdminGroups';
import { AdminMaintenance } from './screens/AdminMaintenance';
import { AdminAlerts } from './screens/AdminAlerts';
import { AdminUsers } from './screens/AdminUsers';
import { NotifPrefs } from './screens/NotifPrefs';

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
    startPolling(7000);
    refreshUnread();
    initPush();
    const unreadTimer = setInterval(refreshUnread, 30000);
    const h = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) startPolling(7000); else stopPolling(); });
    return () => { stopPolling(); clearInterval(unreadTimer); h.then((x) => x.remove()); };
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
        <Route path="/vehicles/:imei/route" component={RouteScreen} />
        <Route path="/stats" component={Stats} />
        <Route path="/reports" component={Reports} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/meniu" component={Menu} />
        <Route path="/fuelstats" component={FuelStats} />
        <Route path="/weekly" component={WeeklyReport} />
        <Route path="/admin/drivers" component={AdminDrivers} />
        <Route path="/admin/groups" component={AdminGroups} />
        <Route path="/admin/maintenance" component={AdminMaintenance} />
        <Route path="/admin/alerts" component={AdminAlerts} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/notif-prefs" component={NotifPrefs} />
        <Route default component={Vehicles} />
      </Router>
      {showTabs && <TabBar />}
    </>
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
