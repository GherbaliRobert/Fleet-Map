import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { vehicles, offlineMinutes, me } from '../app/store';
import { Api } from '../api/endpoints';
import type { DeviceFull, DailyStats } from '../api/endpoints';
import { reverseGeocode } from '../api/geocode';
import { statusOf } from '../lib/status';
import { fmtDateTime, fmtDuration, gpsQuality, gsmQuality, odometerKm, voltageStr } from '../lib/format';
import { Icon } from '../components/Icon';
import { MiniMap } from '../components/MiniMap';
import './detail.css';

const HEX: Record<string, string> = { moving: '#3FE07D', idle: '#eab308', stopped: '#ef4444', offline: '#8A93A3' };
const CAN_LABELS: Record<string, [string, string]> = {
  can_engine_rpm: ['Turație motor', 'rpm'], can_engine_temp: ['Temperatură motor', '°C'],
  can_fuel_level_liters: ['Combustibil', 'L'], can_fuel_level_pct: ['Combustibil', '%'],
  can_vehicle_speed: ['Viteză CAN', 'km/h'], can_total_mileage: ['Odometru CAN', 'km'],
  can_adblue_level_liters: ['AdBlue', 'L'], can_engine_hours: ['Ore motor', 'h'],
  fuel_level_liters: ['Nivel rezervor', 'L'], external_voltage: ['Voltaj extern', 'mV'],
  gsm_signal: ['Semnal GSM', ''], ignition: ['Contact', ''],
};

export function VehicleDetail() {
  const loc = useLocation();
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);

  const v = vehicles.value.find((x) => x.imei === imei);
  const off = offlineMinutes.value;
  const [full, setFull] = useState<DeviceFull | null>(null);
  const [addr, setAddr] = useState<string>('');
  const [daily, setDaily] = useState<DailyStats | null>(null);
  const [sheet, setSheet] = useState<'' | 'can' | 'sensors' | 'tacho'>('');
  const [sensors, setSensors] = useState<any[] | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    Api.deviceFull(imei).then(setFull).catch(() => {});
    Api.dailyStats(imei).then(setDaily).catch(() => {});
  }, [imei]);

  useEffect(() => {
    if (v && v.latitude != null && v.longitude != null) reverseGeocode(v.latitude, v.longitude).then(setAddr).catch(() => {});
  }, [v?.latitude, v?.longitude]);

  const s = v ? statusOf(v, off) : null;
  const io = v?.io || {};
  const odo = odometerKm(io) ?? (full && (full as any).odometer_km) ?? null;
  const volt = voltageStr(io);
  const gps = gpsQuality(v?.satellites);
  const gsm = gsmQuality(io.gsm_signal);
  const veh = [full?.brand, full?.model].filter(Boolean).join(' ') || full?.vehicle_type || v?.vehicle_type || '';
  const driver = full?.driver_name || '';
  const ll = v && v.latitude != null ? `${v.latitude},${v.longitude}` : '';

  function openUrl(url: string) { try { (window as any).open(url, '_system'); } catch { window.open(url, '_blank'); } }

  function openSensors() {
    setSheet('sensors');
    if (sensors === null) Api.fuelSensors(imei).then((r) => setSensors(Array.isArray(r) ? r : (r?.sensors || []))).catch(() => setSensors([]));
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/vehicles')}><Icon name="chevronL" /></button>
        <div class="h-title">{v?.name || full?.name || imei}</div>
      </header>

      <div class="content d-content">
        <div class="card d-top">
          <div class="d-plate-row">
            {s && <span class="dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />}
            <span class="d-plate">{v?.plate || full?.plate || '—'}</span>
            <span class="d-speed">{v?.speed || 0} KM/h</span>
          </div>
          <div class="d-rows">
            {veh && <div class="d-row"><span class="lbl">Vehicul</span><span class="val">{veh}</span></div>}
            <div class="d-row"><span class="lbl">Șofer</span><span class="val">{driver || 'Nealocat'}</span></div>
            <div class="d-row"><span class="lbl">Adresă</span><span class="val">{addr || 'se încarcă…'}</span></div>
            {odo != null && <div class="d-row"><span class="lbl">Odometru</span><span class="val">{odo} km</span></div>}
            {volt && <div class="d-row"><span class="lbl">Voltaj</span><span class="val">{volt}</span></div>}
            <div class="d-row"><span class="lbl">Ultima transmisie</span><span class="val">{fmtDateTime(v?.timestamp)}</span></div>
          </div>
          <div class="d-quality">
            <span class="q"><Icon name="mapPin" size={15} color="var(--accent)" /> GPS: {gps.label}</span>
            <span class="q"><Icon name="wifiOff" size={15} color={gsm.level ? 'var(--accent)' : 'var(--text-muted)'} /> GSM: {gsm.label}</span>
          </div>
        </div>

        {v && v.latitude != null && (
          <div class="d-map"><MiniMap lat={v.latitude!} lng={v.longitude!} angle={v.angle || 0} color={s ? HEX[s.status] : '#3FE07D'} /></div>
        )}

        <div class="d-actions">
          <button class="d-act" onClick={() => loc.route(`/vehicles/${encodeURIComponent(imei)}/route`)}><Icon name="route" size={18} class="ic" /> Vezi traseu</button>
          <button class="d-act" onClick={() => loc.route(`/vehicles/${encodeURIComponent(imei)}/report`)}><Icon name="report" size={18} class="ic" /> Creează raport</button>
          <button class="d-act" onClick={() => setSheet('can')}><Icon name="cpu" size={18} class="ic" /> Date CAN</button>
          <button class="d-act" onClick={openSensors}><Icon name="droplet" size={18} class="ic" /> Senzori</button>
          <button class="d-act" disabled={!me.value?.features?.tahograf} onClick={() => setSheet('tacho')}><Icon name="disc" size={18} class="ic" /> Tahograf</button>
          <button class="d-act" disabled={!ll} onClick={() => setNavOpen((o) => !o)}><Icon name="navigate" size={18} class="ic" /> Navighează</button>
          {navOpen && ll && (
            <div class="d-nav">
              <a onClick={() => openUrl(`https://www.google.com/maps/dir/?api=1&destination=${ll}`)}><Icon name="mapPin" size={16} /> Google Maps</a>
              <a onClick={() => openUrl(`https://waze.com/ul?ll=${ll}&navigate=yes`)}><Icon name="navigate" size={16} /> Waze</a>
            </div>
          )}
        </div>

        <div class="card d-stats">
          <h3>Activitate astăzi</h3>
          <div class="d-stat"><Icon name="route" size={18} class="ic" /><span class="lbl">Distanță parcursă</span><span class="val">{daily ? daily.totalKm.toFixed(2) : '0.00'} km</span></div>
          <div class="d-stat"><Icon name="clock" size={18} class="ic" /><span class="lbl">Timp de conducere</span><span class="val">{fmtDuration(daily?.movingTime)}</span></div>
          <div class="d-stat"><Icon name="clock" size={18} class="ic" /><span class="lbl">Staționare (motor pornit)</span><span class="val">{fmtDuration(daily?.stoppedTime)}</span></div>
          <div class="d-gauge">
            <div class="d-stat" style="border:none;padding-bottom:6px"><Icon name="gauge" size={18} class="ic" /><span class="lbl">Viteză</span><span class="val">{daily?.maxSpeed || 0} km/h</span></div>
            <div class="d-gauge-bar"><span class="d-gauge-pin" style={{ left: `${Math.min(100, ((daily?.maxSpeed || 0) / 130) * 100)}%` }} /></div>
            <div class="d-gauge-lbls"><span>Medie: {daily?.avgSpeed || 0} km/h</span><span>Max: {daily?.maxSpeed || 0} km/h</span></div>
          </div>
        </div>
      </div>

      {sheet && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(''); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>{sheet === 'can' ? 'Date CAN / IO' : sheet === 'sensors' ? 'Senzori' : 'Tahograf'}</b>
              <button class="h-btn" onClick={() => setSheet('')}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              {sheet === 'can' && <CanList io={io} />}
              {sheet === 'sensors' && (sensors === null ? <div class="spin" style="margin:20px auto" /> : sensors.length ? sensors.map((sn: any, i) => (
                <div class="kv"><span class="k">{sn.type || sn.name || `Senzor ${i + 1}`}</span><span class="v">{sn.id || sn.io || '—'}</span></div>
              )) : <div class="center-msg">Niciun senzor configurat pe acest vehicul.</div>)}
              {sheet === 'tacho' && <div class="center-msg">Datele de tahograf detaliate sunt disponibile în aplicația web. (Integrarea completă în mobil — etapă următoare.)</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CanList({ io }: { io: any }) {
  const keys = Object.keys(io || {}).filter((k) => CAN_LABELS[k] || k.startsWith('can_'));
  if (!keys.length) return <div class="center-msg">Niciun parametru CAN disponibil acum.</div>;
  return (
    <>
      {keys.map((k) => {
        const def = CAN_LABELS[k];
        const label = def ? def[0] : k;
        const unit = def ? def[1] : '';
        let val = io[k];
        if (k === 'ignition') val = val ? 'Pornit' : 'Oprit';
        if (k === 'external_voltage' && typeof val === 'number') { val = (val / 1000).toFixed(2); }
        return <div class="kv"><span class="k">{label}</span><span class="v">{val}{unit ? ' ' + unit : ''}</span></div>;
      })}
    </>
  );
}
