import type { Position } from '../api/endpoints';
import { statusOf } from '../lib/status';
import { fmtAgo } from '../lib/format';
import { Icon } from './Icon';

export function VehicleCard({ v, offlineMin, onClick }: { v: Position; offlineMin: number; onClick: () => void }) {
  const s = statusOf(v, offlineMin);
  const sub =
    s.status === 'moving' ? `${s.label} · ${v.speed || 0} km/h`
    : s.status === 'offline' ? `Fără transmisie · ${fmtAgo(v.timestamp)}`
    : s.label;
  return (
    <button class="vcard" onClick={onClick}>
      <span class="dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
      <div class="vcard-main">
        <div class="vcard-name">
          {v.name || v.imei}
          {v.plate ? <span class="vcard-plate">{v.plate}</span> : null}
        </div>
        <div class="vcard-sub">{sub}</div>
      </div>
      <Icon name="chevronR" size={20} color="var(--text-muted)" />
    </button>
  );
}
