import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { vehicles, vehiclesLoading, offlineMinutes, logout } from '../app/store';
import { statusOf, countByStatus, type Status } from '../lib/status';
import { VehicleCard } from '../components/VehicleCard';
import { VehicleMap } from '../components/VehicleMap';
import { Icon } from '../components/Icon';
import './vehicles.css';

type Filter = 'all' | Status;

export function Vehicles() {
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showMap, setShowMap] = useState(false);

  const off = offlineMinutes.value;
  const list = vehicles.value;
  const counts = countByStatus(list, off);
  const qq = q.trim().toLowerCase();
  const filtered = list
    .filter((v) => filter === 'all' || statusOf(v, off).status === filter)
    .filter((v) => !qq || (`${v.name || ''} ${v.plate || ''} ${v.imei}`).toLowerCase().includes(qq))
    .sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei));

  const FILTERS: { k: Filter; label: string; n: number }[] = [
    { k: 'all', label: 'Toate', n: counts.total },
    { k: 'moving', label: 'În mișcare', n: counts.moving },
    { k: 'idle', label: 'Staționate', n: counts.idle },
    { k: 'stopped', label: 'Oprite', n: counts.stopped },
    { k: 'offline', label: 'Fără transmisie', n: counts.offline },
  ];

  return (
    <div class="screen">
      <header class="app-header">
        <div class="h-title">Autovehicule</div>
        <button class="h-btn" onClick={() => setShowMap((m) => !m)} aria-label="hartă/listă">
          <Icon name={showMap ? 'list' : 'map'} />
        </button>
        <button class="h-btn" onClick={() => logout()} aria-label="ieșire"><Icon name="logout" /></button>
      </header>

      {!showMap && (
        <>
          <div class="vsearch">
            <Icon name="search" size={18} />
            <input placeholder="Caută vehicul, nr., IMEI" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </div>
          <div class="vfilters">
            {FILTERS.map((f) => (
              <button class={'vfilter' + (filter === f.k ? ' on' : '')} onClick={() => setFilter(f.k)}>
                {f.label} <span class="cnt">{f.n}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {showMap ? (
        <div class="vmap-wrap">
          <VehicleMap vehicles={filtered} offlineMin={off} onSelect={(imei) => loc.route('/vehicles/' + encodeURIComponent(imei))} />
        </div>
      ) : (
        <div class="content has-tabbar">
          {vehiclesLoading.value && list.length === 0 ? (
            <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          ) : filtered.length === 0 ? (
            <div class="center-msg">{list.length === 0 ? 'Niciun vehicul disponibil.' : 'Niciun rezultat.'}</div>
          ) : (
            <div class="vlist">
              {filtered.map((v) => (
                <VehicleCard v={v} offlineMin={off} onClick={() => loc.route('/vehicles/' + encodeURIComponent(v.imei))} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
