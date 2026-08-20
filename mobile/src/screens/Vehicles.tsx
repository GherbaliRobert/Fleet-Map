import { useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { vehicles, vehiclesLoading, offlineMinutes, logout } from '../app/store';
import { statusOf, countByStatus, type Status } from '../lib/status';
import { VehicleCard } from '../components/VehicleCard';
import { VehicleMap } from '../components/VehicleMap';
import { Icon } from '../components/Icon';
import { raCauta } from '../lib/format';
import './vehicles.css';

type Filter = 'all' | Status;
const VALID_STATUS = ['all', 'moving', 'idle', 'stopped', 'offline'];

export function Vehicles() {
  const loc = useLocation();
  // Filtru de stare venit din Statistici (ex: /vehicles?status=moving)
  const statusParam = new URLSearchParams((loc.url || '').split('?')[1] || '').get('status') || '';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(VALID_STATUS.includes(statusParam) ? (statusParam as Filter) : 'all');
  // Venind din Statistici (ex: ?status=moving) deschidem direct HARTA, filtrată pe acea stare
  const [showMap, setShowMap] = useState(VALID_STATUS.includes(statusParam));
  const [follow, setFollow] = useState(true); // urmărire: reîncadrează harta pe toate mașinile (toggle off = pan liber)
  useEffect(() => {
    if (statusParam && VALID_STATUS.includes(statusParam)) { setFilter(statusParam as Filter); setShowMap(true); }
  }, [statusParam]);

  const off = offlineMinutes.value;
  const list = vehicles.value;
  const counts = countByStatus(list, off);

  const filtered = list
    .filter((v) => filter === 'all' || statusOf(v, off).status === filter)
    .filter((v) => raCauta(q, v.name, v.plate, v.imei))
    .sort((a, b) => (a.name || a.imei).localeCompare(b.name || b.imei));

  // „Toate" nu e o stare, e ÎNTREAGA flotă — deci stă singur, lat, deasupra celorlalte patru.
  // Pe un rând de cinci pastile egale, numărul care se citește cel mai des arăta ca oricare altul.
  const TOTAL: { k: Filter; label: string; n: number; culoare: string } = { k: 'all', label: 'Total vehicule', n: counts.total, culoare: 'var(--accent)' };
  const FILTERS: { k: Filter; label: string; n: number; culoare: string }[] = [
    { k: 'moving', label: 'În mișcare', n: counts.moving, culoare: '#f59e0b' },
    { k: 'idle', label: 'Staționate', n: counts.idle, culoare: '#eab308' },
    { k: 'stopped', label: 'Oprite', n: counts.stopped, culoare: 'var(--red)' },
    { k: 'offline', label: 'Fără semnal', n: counts.offline, culoare: 'var(--text-muted)' },
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
        <div class="vsearch">
          <Icon name="search" size={18} />
          <input placeholder="Caută vehicul, nr., IMEI" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
      )}
      {/* Cadranele SUNT filtrul — vizibile și pe hartă, ca să poți comuta (În mișcare / Staționate / …) */}
      <div class="vstats">
        <button class={'vstat total' + (filter === TOTAL.k ? ' on' : '')} style={'--cip:' + TOTAL.culoare}
          onClick={() => setFilter(TOTAL.k)}>
          <span class="n">{TOTAL.n}</span><span class="l">{TOTAL.label}</span>
        </button>
        {FILTERS.map((f) => (
          <button class={'vstat' + (filter === f.k ? ' on' : '')} style={'--cip:' + f.culoare}
            onClick={() => setFilter(f.k)}>
            <span class="n">{f.n}</span><span class="l">{f.label}</span>
          </button>
        ))}
      </div>

      {showMap ? (
        <div class="vmap-wrap">
          <VehicleMap vehicles={filtered} offlineMin={off} follow={follow} onFocus={() => setFollow(false)} onSelect={(imei) => loc.route('/vehicles/' + encodeURIComponent(imei))} />
          <button class={'vmap-follow' + (follow ? ' on' : '')} onClick={() => setFollow((f) => !f)} aria-label="urmărește mașinile">
            {follow ? 'Urmărire ✓' : 'Urmărire'}
          </button>
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
