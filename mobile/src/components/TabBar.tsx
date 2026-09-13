import { useLocation } from 'preact-iso';
import { Icon, type IconName } from './Icon';
import { unread, ecranAscuns, type EcranCheie } from '../app/store';
import './tabbar.css';

// `ecran` = cheia din ECRANE (server.js). Dacă firma a tăiat ecranul din rolul omului, fila dispare.
// Vehicule, Notificări și Meniu rămân mereu: sunt pornirea aplicației și drumul spre restul.
const TABS: { path: string; label: string; icon: IconName; ecran?: EcranCheie }[] = [
  { path: '/vehicles', label: 'Vehicule', icon: 'car' },
  { path: '/stats', label: 'Statistici', icon: 'chart', ecran: 'statistici' },
  { path: '/reports', label: 'Rapoarte', icon: 'report', ecran: 'rapoarte' },
  { path: '/notifications', label: 'Notificări', icon: 'bell' },
  { path: '/meniu', label: 'Meniu', icon: 'menu' },
];

export function TabBar() {
  const loc = useLocation();
  const path = loc.path === '/' ? '/vehicles' : loc.path;
  const tabs = TABS.filter((t) => !t.ecran || !ecranAscuns(t.ecran));
  // Cu mai puține file, coloanele se lățesc. Pastila verde rămâne cam cât la cinci file, centrată în coloană —
  // altfel fila activă ar deveni o bandă lungă. Zona de apăsare rămâne toată coloana.
  const pastila = tabs.length < TABS.length ? 'max-width:72px;margin:0 auto' : undefined;
  return (
    <nav class="tabbar">
      <div class="tabbar-dock">
        {tabs.map((t) => {
          const active = path === t.path;
          return (
            <button class={'tab' + (active ? ' active' : '')} onClick={() => loc.route(t.path)}>
              <span class="tab-in" style={pastila}>
                <span class="tab-ic">
                  <Icon name={t.icon} size={22} />
                  {t.path === '/notifications' && unread.value > 0 && <span class="tab-badge">{unread.value > 99 ? '99+' : unread.value}</span>}
                </span>
                <span class="tab-lbl">{t.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
