import { useLocation } from 'preact-iso';
import { Icon, type IconName } from './Icon';
import { unread } from '../app/store';
import './tabbar.css';

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/vehicles', label: 'Vehicule', icon: 'car' },
  { path: '/stats', label: 'Statistici', icon: 'chart' },
  { path: '/reports', label: 'Rapoarte', icon: 'report' },
  { path: '/notifications', label: 'Notificări', icon: 'bell' },
  { path: '/meniu', label: 'Meniu', icon: 'menu' },
];

export function TabBar() {
  const loc = useLocation();
  const path = loc.path === '/' ? '/vehicles' : loc.path;
  return (
    <nav class="tabbar">
      <div class="tabbar-dock">
        {TABS.map((t) => {
          const active = path === t.path;
          return (
            <button class={'tab' + (active ? ' active' : '')} onClick={() => loc.route(t.path)}>
              <span class="tab-in">
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
