import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { vehicles, offlineMinutes, me, showToast, refreshVehicles } from '../app/store';
import { Api } from '../api/endpoints';
import type { DeviceFull, DailyStats } from '../api/endpoints';
import { reverseGeocode } from '../api/geocode';
import { statusOf } from '../lib/status';
import { fmtDateTime, fmtDuration, gpsQuality, gsmQuality, odometerKm, voltageStr } from '../lib/format';
import { Icon } from '../components/Icon';
import { MiniMap } from '../components/MiniMap';
import './detail.css';
import './admin.css';

const VEHICLE_TYPES = ['Auto', 'Camion', 'Duba', 'Motocicleta', 'Autobuz', 'Utilaj', 'Remorca', 'Altul'];

const HEX: Record<string, string> = { moving: '#3FE07D', idle: '#eab308', stopped: '#ef4444', offline: '#8A93A3' };
const CAN_LABELS: Record<string, [string, string]> = {
  can_engine_rpm: ['Turație motor', 'rpm'], can_engine_temp: ['Temperatură motor', '°C'],
  can_fuel_level_liters: ['Combustibil', 'L'], can_fuel_level_pct: ['Combustibil', '%'],
  can_vehicle_speed: ['Viteză CAN', 'km/h'], can_total_mileage: ['Odometru CAN', 'km'],
  can_adblue_level_liters: ['AdBlue', 'L'], can_engine_hours: ['Ore motor', 'h'],
  fuel_level_liters: ['Nivel rezervor', 'L'], external_voltage: ['Voltaj extern', 'V'], // împărțit la 1000 → V (nu mV)
  gsm_signal: ['Semnal GSM', ''], ignition: ['Contact', ''],
  // CAN suplimentare — etichete + unități corecte (din codec8e.js)
  can_accelerator_pedal: ['Pedală accelerație', '%'],
  can_door_status: ['Stare uși', ''],          // bitmask (0 = toate închise)
  can_engine_worktime_counted: ['Timp funcționare motor', 'min'],
  can_fuel_consumed_counted: ['Combustibil consumat', 'L'],
  can_axle_load: ['Sarcină axe', 'kg'], can_ambient_temp: ['Temp. exterioară', '°C'],
};
// Cheie necunoscută → etichetă prezentabilă (fără „can_…" brut): can_door_status → „Door status"
function prettyKey(k: string): string {
  return k.replace(/^can_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

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
  const canManage = !!me.value?.permissions?.manageFleet;
  const [editOpen, setEditOpen] = useState(false);
  const [ef, setEf] = useState<Record<string, any>>({});
  const [drivers, setDrivers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  function loadFull() { Api.deviceFull(imei).then(setFull).catch(() => {}); }
  useEffect(() => {
    loadFull();
    Api.dailyStats(imei).then(setDaily).catch(() => {});
    // Senzori: încarcă din start ca să ascundem butonul dacă vehiculul N-ARE senzori configurați
    Api.fuelSensors(imei).then((r) => setSensors(Array.isArray(r) ? r : (r?.sensors || []))).catch(() => setSensors([]));
  }, [imei]);

  function openEdit() {
    setEf({
      name: full?.name || v?.name || '',
      plate: full?.plate || v?.plate || '',
      vehicle_type: (full as any)?.vehicle_type || v?.vehicle_type || '',
      driver_id: (full as any)?.driver_id != null ? String((full as any).driver_id) : '',
      group_id: (full as any)?.group_id != null ? String((full as any).group_id) : '',
    });
    setEditOpen(true);
    if (!drivers.length) Api.driversLite().then((d) => setDrivers(Array.isArray(d) ? d : [])).catch(() => {});
    if (!groups.length) Api.groupsAll().then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => {});
  }
  function setEF(k: string, val: any) { setEf((p) => ({ ...p, [k]: val })); }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await Api.updateDevice(imei, { name: ef.name || null, plate: ef.plate || null, vehicle_type: ef.vehicle_type || null });
      await Api.assignDevice(imei, ef.driver_id ? Number(ef.driver_id) : null, ef.group_id ? Number(ef.group_id) : null);
      showToast('Vehicul actualizat');
      setEditOpen(false);
      loadFull();
      refreshVehicles();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSavingEdit(false); }
  }

  useEffect(() => {
    if (v && v.latitude != null && v.longitude != null) reverseGeocode(v.latitude, v.longitude).then(setAddr).catch(() => {});
  }, [v?.latitude, v?.longitude]);

  const s = v ? statusOf(v, off) : null;
  const io = v?.io || {};
  const odo = odometerKm(io) ?? (full && (full as any).odometer_km) ?? null;
  const volt = voltageStr(io);
  const gps = gpsQuality(v?.satellites);
  const gsm = gsmQuality(io.gsm_signal);
  // Mașină oprită + motor stins → tracker în sleep (transmite din oră în oră) → GPS „în așteptare", nu „fără fix"
  const ign = !!(io && (io.ignition === 1 || (io.ignition as any) === true));
  const gpsStandby = (v?.speed || 0) === 0 && !ign;
  const veh = [full?.brand, full?.model].filter(Boolean).join(' ') || full?.vehicle_type || v?.vehicle_type || '';
  const driver = full?.driver_name || '';
  // AdBlue (în „Date CAN") doar pentru diesel (motorină) + EURO 6
  const _ftd = String((full as any)?.fuel_type || '').toLowerCase();
  const _emd = String((full as any)?.emission_class || '').toLowerCase().replace(/[\s_-]/g, '');
  const adblueOk = (_ftd.includes('motorin') || _ftd.includes('diesel')) && _emd.includes('euro6');
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
        {canManage
          ? <button class="h-btn" onClick={openEdit} aria-label="Editează vehicul"><Icon name="edit" size={20} /></button>
          : <div style="width:36px" />}
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
            <span class="q"><Icon name="mapPin" size={15} color={gpsStandby ? 'var(--text-muted)' : 'var(--accent)'} /> GPS: {gpsStandby ? 'În așteptare' : gps.label}</span>
            <span class="q"><SignalBars value={Number(io.gsm_signal) || 0} /> GSM</span>
          </div>
        </div>

        {v && v.latitude != null && (
          <div class="d-map"><MiniMap lat={v.latitude!} lng={v.longitude!} angle={v.angle || 0} color={s ? HEX[s.status] : '#3FE07D'} /></div>
        )}

        <div class="d-actions">
          <button class="d-act" onClick={() => loc.route(`/vehicles/${encodeURIComponent(imei)}/route`)}><Icon name="route" size={18} class="ic" /> Vezi traseu</button>
          <button class="d-act" onClick={() => loc.route(`/reports?imei=${encodeURIComponent(imei)}`)}><Icon name="report" size={18} class="ic" /> Creează raport</button>
          <button class="d-act" onClick={() => setSheet('can')}><Icon name="cpu" size={18} class="ic" /> Date CAN</button>
          {sensors && sensors.length > 0 && <button class="d-act" onClick={openSensors}><Icon name="droplet" size={18} class="ic" /> Senzori</button>}
          {me.value?.features?.tahograf && <button class="d-act" onClick={() => setSheet('tacho')}><Icon name="disc" size={18} class="ic" /> Tahograf</button>}
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
              {sheet === 'can' && <CanList io={io} adblueOk={adblueOk} />}
              {sheet === 'sensors' && (sensors === null ? <div class="spin" style="margin:20px auto" /> : sensors.length ? sensors.map((sn: any, i) => (
                <div class="kv"><span class="k">{sn.type || sn.name || `Senzor ${i + 1}`}</span><span class="v">{sn.id || sn.io || '—'}</span></div>
              )) : <div class="center-msg">Niciun senzor configurat pe acest vehicul.</div>)}
              {sheet === 'tacho' && <div class="center-msg">Datele de tahograf detaliate sunt disponibile în aplicația web. (Integrarea completă în mobil — etapă următoare.)</div>}
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !savingEdit) setEditOpen(false); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="edit" size={18} color="var(--accent)" /> Editează vehicul</b>
              <button class="h-btn" onClick={() => setEditOpen(false)}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Denumire</label><input value={ef.name} onInput={(e) => setEF('name', (e.target as HTMLInputElement).value)} placeholder="Ex: Logan Alb" /></div>
                <div class="frm-row">
                  <div class="fld"><label>Nr. înmatriculare</label><input value={ef.plate} onInput={(e) => setEF('plate', (e.target as HTMLInputElement).value)} placeholder="B 123 ABC" /></div>
                  <div class="fld"><label>Categorie</label>
                    <select value={ef.vehicle_type} onChange={(e) => setEF('vehicle_type', (e.target as HTMLSelectElement).value)}>
                      <option value="">— alege —</option>
                      {VEHICLE_TYPES.map((t) => <option value={t}>{t === 'Duba' ? 'Dubă' : t === 'Motocicleta' ? 'Motocicletă' : t === 'Remorca' ? 'Remorcă' : t}</option>)}
                    </select>
                  </div>
                </div>
                <div class="fld"><label>Șofer alocat</label>
                  <select value={ef.driver_id} onChange={(e) => setEF('driver_id', (e.target as HTMLSelectElement).value)}>
                    <option value="">Nealocat</option>
                    {drivers.map((d) => <option value={String(d.id)}>{d.name}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Grupă</label>
                  <select value={ef.group_id} onChange={(e) => setEF('group_id', (e.target as HTMLSelectElement).value)}>
                    <option value="">Fără grupă</option>
                    {groups.map((g) => <option value={String(g.id)}>{g.name}</option>)}
                  </select>
                </div>
                <div class="frm-actions">
                  <button class="btn btn-primary" disabled={savingEdit} onClick={saveEdit}>{savingEdit ? 'Se salvează…' : 'Salvează'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Semnal GSM desenat cu liniuțe (0–5)
function GsmBars({ signal }: { signal?: number }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(signal) || 0)));
  return (
    <span class="gsm-bars" title={'Semnal GSM ' + n + '/5'}>
      {[0, 1, 2, 3, 4].map((i) => <i class={'gsm-bar' + (i < n ? ' on' : '')} style={{ height: (6 + i * 3) + 'px' }} />)}
    </span>
  );
}

// Liniuțe semnal GSM (0..5), ca pe telefon
function SignalBars({ value, max = 5 }: { value: number; max?: number }) {
  const v = Math.max(0, Math.min(max, Math.round(value || 0)));
  return (
    <span class="sigbars" title={`Semnal ${v}/${max}`}>
      {Array.from({ length: max }, (_, i) => <span class={'sigbar' + (i < v ? ' on' : '')} />)}
    </span>
  );
}

function CanList({ io, adblueOk }: { io: any; adblueOk?: boolean }) {
  const d = io || {};
  const ignOn = (d.ignition === 1 || d.ignition === true);
  const voltage = (typeof d.external_voltage === 'number' && d.external_voltage > 0) ? (d.external_voltage / 1000).toFixed(2) + ' V' : null;
  const odo = (d.total_odometer != null) ? Math.round(d.total_odometer / 1000) + ' km'
    : (d.can_total_mileage != null ? Math.round(d.can_total_mileage) + ' km' : null);
  // Combustibil o SINGURĂ dată (CAN prioritar față de sonda fuel_level) — fără dublură
  const fuel = (d.can_fuel_level_liters != null && d.can_fuel_level_liters > 0) ? Math.round(d.can_fuel_level_liters) + ' L'
    : (d.fuel_level_liters != null && d.fuel_level_liters > 0) ? Math.round(d.fuel_level_liters) + ' L' : null;

  // Rândurile de bază — SINGURELE afișate cât contactul e OPRIT
  const base = (
    <>
      <div class="kv"><span class="k">Status contact</span><span class="v">{ignOn ? 'Pornit' : 'Oprit'}</span></div>
      <div class="kv"><span class="k">Semnal GSM</span><span class="v"><GsmBars signal={d.gsm_signal} /></span></div>
      {voltage && <div class="kv"><span class="k">Voltaj</span><span class="v">{voltage}</span></div>}
      {odo && <div class="kv"><span class="k">Odometru</span><span class="v">{odo}</span></div>}
      {fuel && <div class="kv"><span class="k">Nivel rezervor</span><span class="v">{fuel}</span></div>}
    </>
  );
  if (!ignOn) return base; // contact OPRIT → doar cele de bază, nimic altceva

  // Contact PORNIT → + restul parametrilor CAN (fără cele deja afișate / duplicate; AdBlue doar diesel+Euro6)
  const SHOWN = new Set(['ignition', 'gsm_signal', 'external_voltage', 'total_odometer', 'can_total_mileage', 'can_total_mileage_counted', 'can_fuel_level_liters', 'can_fuel_level_pct', 'fuel_level_liters', 'fuel_level_pct']);
  const extra = Object.keys(d).filter((k) => (CAN_LABELS[k] || k.startsWith('can_')) && !SHOWN.has(k) && !(!adblueOk && k.startsWith('can_adblue')));
  return (
    <>
      {base}
      {extra.map((k) => {
        const def = CAN_LABELS[k];
        const label = def ? def[0] : prettyKey(k);
        const unit = def ? def[1] : '';
        let val = d[k];
        if (k === 'external_voltage' && typeof val === 'number') val = (val / 1000).toFixed(2);
        return <div class="kv"><span class="k">{label}</span><span class="v">{val}{unit ? ' ' + unit : ''}</span></div>;
      })}
    </>
  );
}
