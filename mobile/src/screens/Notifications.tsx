import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import type { NotificationItem } from '../api/endpoints';
import { refreshUnread } from '../app/store';
import { fmtAgo } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import './notifications.css';

const SEV: Record<string, { color: string; icon: IconName }> = {
  critical: { color: 'var(--red)', icon: 'alert' },
  warning: { color: 'var(--orange)', icon: 'alert' },
  info: { color: 'var(--accent)', icon: 'bell' },
};

export function Notifications() {
  const loc = useLocation();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  function load() { Api.notifications().then((r) => setItems(r || [])).catch(() => setItems([])); }
  useEffect(() => { load(); }, []);

  function tap(n: NotificationItem) {
    // Notificările de raport nu au eveniment GPS → deschid ecranul Rapoarte (+ raportul din Istoric), nu modalul de eveniment.
    if (n.type === 'report_ready' || n.type === 'report_error') {
      let nd: any = (n as any).data; if (typeof nd === 'string') { try { nd = JSON.parse(nd); } catch { nd = null; } }
      const hid = nd && nd.historyId != null ? nd.historyId : '';
      loc.route('/reports' + (hid !== '' ? ('?histId=' + hid) : ''));
      return;
    }
    loc.route('/notif/' + n.id); // deschide detaliul evenimentului — marcarea „citit" se face din modal
  }
  async function markAll() { try { await Api.ackAll(); } catch {} refreshUnread(); setItems((cur) => cur ? cur.map((x) => ({ ...x, acknowledged: true })) : cur); }

  const hasUnread = !!items && items.some((n) => !n.acknowledged);

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Notificări</div></header>
      <div class="content has-tabbar">
        {hasUnread && <div class="nf-actions"><button class="nf-mark" onClick={markAll}>Marchează toate citite</button></div>}
        {items === null ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : items.length === 0 ? <div class="center-msg">Nicio notificare.</div>
          : items.map((n) => {
            const sev = SEV[n.severity || 'info'] || SEV.info;
            return (
              <button class={'nf-item' + (!n.acknowledged ? ' unread' : '')} onClick={() => tap(n)}>
                <span class="nf-ic" style={{ background: 'color-mix(in srgb,' + sev.color + ' 18%, transparent)' }}>
                  <Icon name={sev.icon} size={18} color={sev.color} />
                </span>
                <div class="nf-main">
                  <div class="nf-title">{n.title || n.type}</div>
                  {n.body && <div class="nf-body">{n.body}</div>}
                  <div class="nf-time">{fmtAgo(n.created_at)}</div>
                </div>
                {!n.acknowledged && <span class="nf-unread-dot" />}
              </button>
            );
          })}
      </div>
    </div>
  );
}
