import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { vehicles, offlineMinutes, me, showToast, refreshVehicles } from '../app/store';
import { Api } from '../api/endpoints';
import type { DeviceFull, DailyStats, NotificationItem } from '../api/endpoints';
import { reverseGeocode } from '../api/geocode';
import { statusOf, usesTachograph } from '../lib/status';
import { fmtDateTime, fmtDuration, fmtAgo, gpsQuality, gsmQuality, odometerKm, voltageStr } from '../lib/format';
import { Icon } from '../components/Icon';
import { MiniMap } from '../components/MiniMap';
import { MapModal } from '../components/MapModal';
import { WorkSchedEditor } from '../components/WorkSchedEditor';
import { VehicleSpecsView, VehicleSpecsForm, specsFromFull } from '../components/VehicleSpecs';
import { VehicleDocs } from '../components/VehicleDocs';
import { loadCanCatalog, canStateText, canColor } from '../lib/canflags';
import type { CanCatalog, CanFlag } from '../lib/canflags';
import './detail.css';
import './admin.css';

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
  // `can_axle_load` (la singular) NU există în codec8e — era o etichetă pentru o cheie fantomă, deci
  // nu se afișa niciodată. Cheile reale sunt pe axă (AVL 118-122) plus greutatea totală (AVL 187).
  can_axle1_load: ['Sarcină axa 1', 'kg'], can_axle2_load: ['Sarcină axa 2', 'kg'],
  can_axle3_load: ['Sarcină axa 3', 'kg'], can_axle4_load: ['Sarcină axa 4', 'kg'],
  can_axle5_load: ['Sarcină axa 5', 'kg'], can_load_weight: ['Greutate totală', 'kg'],
  can_ambient_temp: ['Temp. exterioară', '°C'],
};
// Cheie necunoscută → etichetă prezentabilă (fără „can_…" brut): can_door_status → „Door status"
function prettyKey(k: string): string {
  return k.replace(/^can_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// Direcția busolă din unghi (0–360): „NE (45°)". Identic cu web getDirectionName.
function getDirectionName(angle?: number): string {
  if (angle == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'];
  return dirs[Math.round(angle / 45) % 8] + ' (' + Math.round(angle) + '°)';
}

// Ore motor: Index TOTAL al vehiculului (IO 104) dacă există; altfel „timp funcționare" (102/103) ETICHETAT onest,
// ca să nu pară kilometrajul-în-ore. Identic cu fișa web (evită „5h" afișat ca index total pe autoturisme).
function engineHoursOf(io: any): { value: string; label: string } {
  if (io?.can_engine_total_hours !== undefined) return { value: String(Math.round(io.can_engine_total_hours)), label: 'Index ore motor' };
  if (io?.can_engine_worktime) return { value: String(Math.floor(io.can_engine_worktime / 60)), label: 'Ore funcționare motor' };
  if (io?.can_engine_worktime_counted) return { value: String(Math.floor(io.can_engine_worktime_counted / 60)), label: 'Ore funcționare motor' };
  return { value: '—', label: 'Index ore motor' };
}

// Status „live" nuanțat, cu prag de prospețime 3 min — identic cu fișa web (updateDetailPanel).
// „În mișcare" (verde) DOAR dacă a transmis recent; viteză>0 dintr-un pachet vechi → „⚠️ fără semnal recent".
function liveStatus(v: any, off: number): { cls: string; text: string; detail: string } {
  if (!v || !v.timestamp) return { cls: 'gone', text: 'Fără date', detail: '' };
  const ageMs = Date.now() - new Date(v.timestamp).getTime();
  const online = ageMs < (off || 65) * 60000;
  const fresh = ageMs < 180000;
  const ign = !!(v.io && (v.io.ignition === 1 || v.io.ignition === true));
  const movedAt = (v as any).moved_at;
  const movedRecently = !!(movedAt && (Date.now() - movedAt) < 150000); // histerezis: crawl în trafic + contact pornit → tot „în mișcare"
  const moving = (v.speed || 0) > 3 || (movedRecently && ign);
  const ago = fmtAgo(v.timestamp);
  if (!online) return { cls: 'gone', text: '⚠️ Oprit (fără semnal)', detail: 'ultima · ' + ago };
  if (moving && fresh) return { cls: 'moving', text: 'În mișcare', detail: '● activ' };
  if (moving) return { cls: 'idle', text: '⚠️ Fără semnal recent', detail: 'ultima viteză ' + Math.round(v.speed || 0) + ' km/h · ' + ago };
  if (ign) return { cls: 'idle', text: 'Staționat (contact pornit)', detail: 'ultima · ' + ago };
  return { cls: 'off', text: 'Oprit', detail: 'ultima · ' + ago };
}

// Câmp în grila „Detalii live": etichetă + valoare (opțional full-width / colorat).
function G({ label, value, cls, full }: { label: string; value: any; cls?: string; full?: boolean }) {
  return <div class={'g' + (full ? ' full' : '')}><span class="gl">{label}</span><span class={'gv ' + (cls || '')}>{value}</span></div>;
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
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const canManage = !!me.value?.permissions?.manageFleet;
  const [editOpen, setEditOpen] = useState(false);
  const [ef, setEf] = useState<Record<string, any>>({});
  const [drivers, setDrivers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Venit din notificarea de scadență („ITP expiră în 3 zile") → deschidem direct editarea, unde
  // stau actele. Fără asta, notificarea te lăsa în fișă și porneai să cauți butonul de editare.
  const _cerutDocs = new URLSearchParams((loc.url || '').split('?')[1] || '').get('edit') === 'docs';

  function loadFull() { Api.deviceFull(imei).then(setFull).catch(() => {}); }
  useEffect(() => {
    loadFull();
    Api.dailyStats(imei).then(setDaily).catch(() => {});
    // Senzori: încarcă din start ca să ascundem butonul dacă vehiculul N-ARE senzori configurați
    Api.fuelSensors(imei).then((r) => setSensors(Array.isArray(r) ? r : (r?.sensors || []))).catch(() => setSensors([]));
    // Notificări (alerte active pe acest vehicul) → pastile de avertizare în fișă, ca pe web
    Api.notifications().then((l) => setNotifs(Array.isArray(l) ? l : [])).catch(() => {});
  }, [imei]);

  function openEdit() {
    // Fișa COMPLETĂ (~35 câmpuri) + cele două atribuiri, care merg pe rute separate.
    setEf(Object.assign(specsFromFull(full), {
      name: full?.name || v?.name || '',
      plate: full?.plate || v?.plate || '',
      vehicle_type: (full as any)?.vehicle_type || v?.vehicle_type || '',
      driver_id: (full as any)?.driver_id != null ? String((full as any).driver_id) : '',
      group_id: (full as any)?.group_id != null ? String((full as any).group_id) : '',
      can_interface: (full as any)?.can_interface || '',
    }));
    setEditOpen(true);
    if (!drivers.length) Api.driversLite().then((d) => setDrivers(Array.isArray(d) ? d : [])).catch(() => {});
    if (!groups.length) Api.groupsAll().then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => {});
  }
  // Deschiderea automată așteaptă fișa completă (openEdit citește din `full`); altfel formularul
  // s-ar deschide gol și ar salva peste datele vehiculului cu câmpuri necompletate.
  useEffect(() => {
    if (!_cerutDocs || !full || editOpen || !canManage) return;
    openEdit();
    setTimeout(() => { try { document.querySelector('.veh-docs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* */ } }, 260);
  }, [full, _cerutDocs]);

  function setEF(k: string, val: any) { setEf((p) => ({ ...p, [k]: val })); }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      // Fișa completă merge pe /details — ruta scurtă (/api/devices/:imei) salvează DOAR nume/număr/tip.
      // Câmpurile rezervate super-adminului sunt oricum eliminate din body pe server dacă nu ai dreptul.
      const spec: any = specsFromFull(ef);
      spec.name = ef.name || null; spec.plate = ef.plate || null; spec.vehicle_type = ef.vehicle_type || null;
      await Api.updateDeviceDetails(imei, spec);
      await Api.assignDevice(imei, ef.driver_id ? Number(ef.driver_id) : null, ef.group_id ? Number(ef.group_id) : null);
      if (me.value?.isSuper) await Api.setCanInterface(imei, ef.can_interface || null).catch(() => {}); // doar super-admin
      showToast('Vehicul actualizat');
      setEditOpen(false);
      loadFull();
      refreshVehicles();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSavingEdit(false); }
  }

  useEffect(() => {
    // Adresa COMPLETĂ (stradă nr, cartier, localitate, comună, județ): în fișa unui vehicul, doar numele
    // localității nu ajută pe cine trebuie să ajungă acolo.
    if (v && v.latitude != null && v.longitude != null) reverseGeocode(v.latitude, v.longitude, 'full').then(setAddr).catch(() => {});
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
  // Tahograf doar pe categorii care îl folosesc legal (camion/TIR/autobuz) — nu pe autoturisme etc.
  const tachoOk = usesTachograph(full?.vehicle_type || v?.vehicle_type);
  const ll = v && v.latitude != null ? `${v.latitude},${v.longitude}` : '';

  // ── Citiri „live" pentru grila „Detalii live" (paritate cu fișa web) ──
  const live = liveStatus(v, off);
  const eng = engineHoursOf(io);
  const rpm = io.can_engine_rpm !== undefined ? io.can_engine_rpm + ' RPM' : null;
  const coolant = io.can_engine_temp !== undefined ? Number(io.can_engine_temp).toFixed(1) + '°C' : null;
  const adblueVal = (adblueOk && io.can_adblue_level_pct !== undefined)
    ? (io.can_adblue_level_pct + '%' + (io.can_adblue_level_liters !== undefined ? ' · ' + Number(io.can_adblue_level_liters).toFixed(1) + ' L' : ''))
    : null;
  // Combustibil: sondă → câmp REZOLVAT (fuel_level_liters) → CAN, din io-ul live SAU din io-ul stocat (/full) ca rezervă.
  // „(ultima)" când CAN-ul e stale (motor oprit) — ca să nu dispară ultima cantitate cunoscută. Roșu sub 15 L.
  const fio: any = (full as any)?.io_data || {};
  const tank = (typeof io.tank_level_liters === 'number' ? io.tank_level_liters : fio.tank_level_liters);
  const fuelLnum = (typeof io.fuel_level_liters === 'number' && io.fuel_level_liters > 0) ? io.fuel_level_liters
    : (typeof io.can_fuel_level_liters === 'number' && io.can_fuel_level_liters > 0) ? io.can_fuel_level_liters
      : (typeof fio.fuel_level_liters === 'number' && fio.fuel_level_liters > 0) ? fio.fuel_level_liters
        : (typeof fio.can_fuel_level_liters === 'number' && fio.can_fuel_level_liters > 0) ? fio.can_fuel_level_liters : null;
  const fuelPct = io.can_fuel_level_pct ?? fio.can_fuel_level_pct;
  const tankCap = Number((full as any)?.tank_capacity) || 0;
  // % REAL = litri ÷ capacitate rezervor (configurată în fișă). NU afișăm can_fuel_level_pct BRUT la senzorii
  // factory (Logan/Caddy) — e nesigur (ex. 42 L raportat ca „100%"). Fără capacitate configurată → doar litri.
  const fuelPctReal = (fuelLnum != null && tankCap > 0) ? Math.max(0, Math.min(100, Math.round(fuelLnum / tankCap * 100))) : null;
  const staleNote = (v as any)?.can_stale ? ' (ultima)' : '';
  let fuelStr: string | null = null, fuelLow = false, fuelSrc = '';
  if (typeof tank === 'number' && tank > 0) { fuelStr = tank.toFixed(1) + ' L'; fuelLow = tank < 15; fuelSrc = ' (sondă)'; }
  else if (fuelLnum != null) { fuelStr = fuelLnum.toFixed(1) + ' L' + (fuelPctReal != null ? ' · ' + fuelPctReal + '%' : '') + staleNote; fuelLow = fuelLnum < 15; fuelSrc = ' (CAN)'; }
  else if (fuelPct != null) { fuelStr = fuelPct + '%' + staleNote; fuelSrc = ' (CAN)'; }
  // Limita de viteză recunoscută de camera mașinii (IO 1116 → speed_limit_sign). 0/absent/necredibil → nu afișăm.
  const _rawLimit = io.speed_limit_sign ?? (io as any).io_1116 ?? fio.speed_limit_sign ?? fio.io_1116;
  const spdLimit = (typeof _rawLimit === 'number' && _rawLimit >= 5 && _rawLimit <= 200) ? Math.round(_rawLimit) : 0;
  const overLimit = spdLimit > 0 && (v?.speed || 0) > spdLimit;
  const pills = notifs.filter((n) => n.imei === imei && !n.acknowledged).slice(0, 4);
  const isSuper = !!me.value?.isSuper;
  const canStale = !!(v as any)?.can_stale;
  // „Ultima interogare": cu motorul oprit CAN-ul e carry-forward → arăt ora snapshot-ului real; altfel ultima transmisie
  const lastQ = (canStale && (v as any)?.can_snapshot_ts) ? (v as any).can_snapshot_ts : v?.timestamp;

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
        <div class={'d-sb ' + live.cls}>
          <span class="sb-dot" />
          <span class="sb-text">{live.text}</span>
          {live.detail && <span class="sb-detail">{live.detail}</span>}
        </div>

        {pills.length > 0 && (
          <div class="d-pills">
            {pills.map((n) => (
              <div class={'d-pill ' + (n.severity === 'critical' ? 'crit' : 'warn')} onClick={() => loc.route('/notifications')}>
                <Icon name="alert" size={15} class="ic" />
                <div class="pill-tx"><b>{n.title || 'Alertă'}</b>{n.body ? <div class="pill-sub">{n.body}</div> : null}</div>
              </div>
            ))}
          </div>
        )}

        <div class="card d-top">
          <div class="d-plate-row">
            {s && <span class="dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />}
            <span class="d-plate">{v?.plate || full?.plate || '—'}</span>
            <span class={'d-speed' + (overLimit ? ' over' : '')}>{v?.speed || 0} KM/h</span>
            {spdLimit > 0 && <span class={'d-splimit' + (overLimit ? ' over' : '')} title="Limită de viteză (recunoscută de cameră)">{spdLimit}</span>}
          </div>
          <div class="d-rows">
            {veh && <div class="d-row"><span class="lbl">Vehicul</span><span class="val">{veh}</span></div>}
            <div class="d-row"><span class="lbl">Șofer</span><span class="val">{driver || 'Nealocat'}</span></div>
            <div class="d-row"><span class="lbl">Adresă</span><span class="val">{addr || 'se încarcă…'}</span></div>
            <div class="d-row"><span class="lbl">Ultima transmisie</span><span class="val">{fmtDateTime(v?.timestamp)}</span></div>
          </div>
          <div class="d-quality">
            <span class="q"><Icon name="mapPin" size={15} color={gpsStandby ? 'var(--text-muted)' : 'var(--accent)'} /> GPS: {gpsStandby ? 'În așteptare' : gps.label}</span>
            <span class="q"><SignalBars value={Number(io.gsm_signal) || 0} /> GSM</span>
          </div>
        </div>

        {v && v.latitude != null && (
          <div class="d-map">
            <MiniMap lat={v.latitude!} lng={v.longitude!} angle={v.angle || 0} color={s ? HEX[s.status] : '#3FE07D'} />
            <button class="d-map-expand" onClick={() => setShowMap(true)} aria-label="Extinde harta" title="Extinde harta"><Icon name="maximize" size={18} /></button>
          </div>
        )}

        <div class="d-actions">
          <button class="d-act" onClick={() => loc.route(`/vehicles/${encodeURIComponent(imei)}/route`)}><Icon name="route" size={18} class="ic" /> Vezi traseu</button>
          <button class="d-act" onClick={() => loc.route(`/reports?imei=${encodeURIComponent(imei)}`)}><Icon name="report" size={18} class="ic" /> Creează raport</button>
          <button class="d-act" onClick={() => loc.route(`/vehicles/${encodeURIComponent(imei)}/can`)}><Icon name="cpu" size={18} class="ic" /> Date CAN</button>
          {sensors && sensors.length > 0 && <button class="d-act" onClick={openSensors}><Icon name="droplet" size={18} class="ic" /> Senzori</button>}
          {me.value?.features?.tahograf && tachoOk && <button class="d-act" onClick={() => setSheet('tacho')}><Icon name="disc" size={18} class="ic" /> Tahograf</button>}
          {/* „Merg după el" — navigatia obisnuita te duce unde ERA masina; asta arata unde e ACUM. */}
          <button class="d-act" disabled={!ll} onClick={() => loc.route('/vehicles/' + imei + '/follow')}><Icon name="compass" size={18} class="ic" /> Merg după el</button>
          <button class="d-act" disabled={!ll} onClick={() => setNavOpen((o) => !o)}><Icon name="navigate" size={18} class="ic" /> Navighează</button>
          {navOpen && ll && (
            <div class="d-nav">
              <a onClick={() => openUrl(`https://www.google.com/maps/dir/?api=1&destination=${ll}`)}><Icon name="mapPin" size={16} /> Google Maps</a>
              <a onClick={() => openUrl(`https://waze.com/ul?ll=${ll}&navigate=yes`)}><Icon name="navigate" size={16} /> Waze</a>
            </div>
          )}
          {ll && <button class="d-act" onClick={() => openUrl(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`)}><Icon name="eye" size={18} class="ic" /> Street View</button>}
        </div>

        <div class="card d-detail">
          <h3 class="d-cardh">Detalii live</h3>
          <div class="d-lastq"><Icon name="clock" size={12} /> Ultima interogare · {lastQ ? fmtAgo(lastQ) : '—'}{canStale ? ' · ultimele valori (motor oprit)' : ''}</div>
          <div class="d-grid">
            {/* Set minimal — esențialul CAN, vizibil tuturor */}
            <G label="Status contact" value={ign ? 'Cuplat' : 'Decuplat'} cls={ign ? 'green' : 'red'} />
            {fuelStr && <G label={'Combustibil' + fuelSrc} value={fuelStr} cls={fuelLow ? 'red' : ''} />}
            {odo != null && <G label="Kilometraj total" value={odo + ' km'} />}
            {ign && coolant && <G label="Temp. motor" value={coolant} />}{/* ascuns cu contactul oprit — valoarea e stale (carry-forward) */}
            {/* Restul IO — doar super-admin */}
            {isSuper && (
              <>
                <G label="Viteză GPS" value={(v?.speed || 0) + ' km/h'} cls={(v?.speed || 0) > 3 ? 'green' : ''} />
                <G label="Direcție" value={getDirectionName(v?.angle)} />
                {volt && <G label="Tensiune baterie" value={volt} />}
                {ign && rpm && <G label="Motor RPM" value={rpm} />}{/* RPM doar cu motorul pornit */}
                {daily?.engineOnTime != null && <G label="Ore funcționare azi" value={fmtDuration(daily.engineOnTime)} />}{/* timpul cu motorul pornit AZI, nu contorul total */}
                {adblueVal && <G label="AdBlue" value={adblueVal} />}
                <G label="Semnal GPS" value={gpsStandby ? 'În așteptare' : (v?.satellites != null ? gps.label + ' (' + v.satellites + ' sat.)' : gps.label)} />
                <G label="Semnal GSM" value={gsm.label} />
                <G label="Poziție" value={v?.latitude != null ? Number(v.latitude).toFixed(5) + ', ' + Number(v.longitude).toFixed(5) : '—'} full />
                <G label="IMEI dispozitiv" value={imei} full />
              </>
            )}
          </div>
        </div>

        {/* Fișa tehnică — arată doar secțiunile care au ceva completat, ca să nu umple ecranul cu liniuțe. */}
        <VehicleSpecsView full={full} />

        <div class="card d-stats">
          <h3>Activitate astăzi</h3>
          <div class="d-stat"><Icon name="route" size={18} class="ic" /><span class="lbl">Distanță parcursă</span><span class="val">{daily ? daily.totalKm.toFixed(2) : '0.00'} km</span></div>
          <div class="d-stat"><Icon name="clock" size={18} class="ic" /><span class="lbl">Timp de conducere</span><span class="val">{fmtDuration(daily?.movingTime)}</span></div>
          <div class="d-stat"><Icon name="clock" size={18} class="ic" /><span class="lbl">Staționare (motor pornit)</span><span class="val">{fmtDuration(daily?.stoppedTime)}</span></div>
          <div class="d-stat"><Icon name="mapPin" size={18} class="ic" /><span class="lbl">Opriri</span><span class="val">{daily?.stops ?? 0}</span></div>
          {daily?.fuelConsumed != null && <div class="d-stat"><Icon name="droplet" size={18} class="ic" /><span class="lbl">{daily.fuelEstimated ? 'Consum estimat azi' : 'Consum azi (senzor)'}</span><span class="val">{daily.fuelConsumed} L</span></div>}
          {daily?.lastIgnitionOn && <div class="d-stat"><Icon name="zap" size={18} class="ic" /><span class="lbl">Ultim contact pornit</span><span class="val" style="font-size:13px">{fmtDateTime(daily.lastIgnitionOn)}</span></div>}
          <div class="d-gauge">
            <div class="d-stat" style="border:none;padding-bottom:6px"><Icon name="gauge" size={18} class="ic" /><span class="lbl">Viteză</span><span class="val">{daily?.maxSpeed || 0} km/h</span></div>
            <div class="d-gauge-bar"><span class="d-gauge-pin" style={{ left: `${Math.min(100, ((daily?.maxSpeed || 0) / 130) * 100)}%` }} /></div>
            <div class="d-gauge-lbls"><span>Medie: {daily?.avgSpeed || 0} km/h</span><span>Max: {daily?.maxSpeed || 0} km/h</span></div>
          </div>
        </div>
      </div>

      {showMap && v && v.latitude != null && (
        <MapModal lat={v.latitude!} lng={v.longitude!} angle={v.angle || 0} color={s ? HEX[s.status] : '#3FE07D'} label={v.plate || v.name || 'Locație'} onClose={() => setShowMap(false)} />
      )}

      {sheet && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(''); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>{sheet === 'can' ? 'Date CAN / IO' : sheet === 'sensors' ? 'Senzori' : 'Tahograf'}</b>
              <button class="h-btn" onClick={() => setSheet('')}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              {sheet === 'can' && <><CanFlags io={io} /><CanList io={io} adblueOk={adblueOk} showRaw={isSuper} /></>}
              {sheet === 'sensors' && (sensors === null ? <div class="spin" style="margin:20px auto" /> : sensors.length ? sensors.map((sn: any, i) => (
                <div class="kv"><span class="k">{sn.type || sn.name || `Senzor ${i + 1}`}</span><span class="v">{sn.id || sn.io || '—'}</span></div>
              )) : <div class="center-msg">Niciun senzor configurat pe acest vehicul.</div>)}
              {sheet === 'tacho' && <TachoLive io={io} />}
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
                {/* Fișa tehnică, pe secțiuni pliabile — „Identificare" (nume, număr, tip, marcă, VIN…) e deschisă
                    implicit, restul se deschid la nevoie, ca formularul să nu fie un perete de 35 de câmpuri. */}
                <VehicleSpecsForm val={ef} set={setEF} isSuper={!!me.value?.isSuper} />
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
                {me.value?.isSuper && (
                  <div class="fld"><label>Interfață CAN <span style="color:var(--accent);font-size:10px">super-admin</span></label>
                    <select value={ef.can_interface} onChange={(e) => setEF('can_interface', (e.target as HTMLSelectElement).value)}>
                      <option value="">Automat / LV-CAN (implicit)</option>
                      <option value="fms">FMS / J1939 (FMC650, camioane)</option>
                      <option value="tacho">Tahograf direct (DSRC)</option>
                    </select>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">„FMS" la camioane cu FMC650 — altfel RPM/combustibil/temperatură pot fi greșit decodate. Se aplică pachetelor noi.</div>
                  </div>
                )}
                {/* „Sursă contact" stă acum în secțiunea Tehnic (super-admin) din fișă — un singur loc pentru el. */}
                <div class="frm-actions">
                  <button class="btn btn-primary" disabled={savingEdit} onClick={saveEdit}>{savingEdit ? 'Se salvează…' : 'Salvează'}</button>
                </div>
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
                  <div style="font-size:12.5px;font-weight:700;color:var(--accent);margin-bottom:2px"><Icon name="clock" size={13} /> Program de lucru (vehicul)</div>
                  <WorkSchedEditor value={(full as any)?.work_schedule} allowInherit onSave={(ws: any) => Api.setDeviceWorkSchedule(imei, ws).then(() => loadFull())} />
                </div>
                {/* Actele vehiculului + scanarea lor. setFisa varsă propunerile confirmate direct în
                    formularul de deasupra (ef) — aceleași câmpuri, aceeași salvare, nicio cale nouă. */}
                <VehicleDocs imei={imei} fisa={ef} setFisa={(patch: any) => setEf((p: any) => ({ ...p, ...patch }))} />
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

// ─── Steagurile CAN, ca placute cu iconita ────────────────────────────────────────────────
// Uși, lumini, martori de bord — starea mașinii dintr-o privire, la fel ca panoul CAN din web.
// Numele și iconițele vin din can_flags.js (prin /api/can-flags), NU sunt scrise aici.
// Înainte, în telefon steagurile apăreau doar ca text brut („security_flags.door_front_left") și
// numai pentru super-admin, în lista „Toate semnalele (brut)".
function CanFlags({ io }: { io: any }) {
  const [cat, setCat] = useState<CanCatalog | null>(null);
  useEffect(() => { let viu = true; loadCanCatalog().then((c) => { if (viu) setCat(c); }); return () => { viu = false; }; }, []);
  if (!cat) return null;

  // Aplatizăm blocurile decodate exact ca web-ul: _security_flags → _sf_*, _control_flags → _cf_*
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries((io && io._security_flags) || {})) flat['_sf_' + k] = v;
  for (const [k, v] of Object.entries((io && io._control_flags) || {})) flat['_cf_' + k] = v;

  const nedecodate = new Set(cat.undecoded || []);
  const areSf = cat.flags.some((f) => f.key.startsWith('_sf_') && flat[f.key] !== undefined);
  const areCf = cat.flags.some((f) => f.key.startsWith('_cf_') && flat[f.key] !== undefined);
  if (!areSf && !areCf) return null;

  const aprinse: { warn: string[]; open: string[] } = { warn: [], open: [] };
  let necitite = 0;

  type Placa = { f: CanFlag; aprins: boolean; text: string; necitit: boolean };
  const sectiuni = cat.groups.map((g) => {
    const placi: Placa[] = [];
    cat.flags.filter((f) => f.group === g.key).forEach((f) => {
      const val = flat[f.key];
      const lipsa = val === undefined || val === null;
      const necitit = lipsa && nedecodate.has(f.key) &&
        ((f.key.startsWith('_sf_') && areSf) || (f.key.startsWith('_cf_') && areCf));
      if (lipsa && !necitit) return;
      if (necitit) { necitite++; placi.push({ f, aprins: false, text: 'necitit', necitit: true }); return; }
      if (f.kind === 'code') { placi.push({ f, aprins: Number(val) > 0, text: 'cod ' + val, necitit: false }); return; }
      const aprins = !!val;
      if (aprins && (f.kind === 'warn' || f.kind === 'open')) aprinse[f.kind].push(f.label);
      placi.push({ f, aprins, text: canStateText(cat, f, aprins), necitit: false });
    });
    return { g, placi };
  }).filter((x) => x.placi.length);
  if (!sectiuni.length) return null;

  const lista = (v: string[]) => (v.length <= 4 ? v.join(', ') : v.slice(0, 4).join(', ') + ' +' + (v.length - 4));

  return (
    <div class="cfm">
      <div class="cfm-sum">
        {aprinse.warn.length > 0 && (
          <span class="cfm-b b-warn">
            <Icon name="alert" size={13} />{' '}
            {(aprinse.warn.length === 1 ? 'Martor aprins: ' : 'Martori aprinși: ') + lista(aprinse.warn)}
          </span>
        )}
        {aprinse.open.length > 0 && (
          <span class="cfm-b b-open"><Icon name="doorOpen" size={13} /> {'Deschis: ' + lista(aprinse.open)}</span>
        )}
        {aprinse.warn.length === 0 && aprinse.open.length === 0 && (
          <span class="cfm-b b-ok"><Icon name="check" size={13} /> Niciun martor aprins, totul închis</span>
        )}
      </div>

      {sectiuni.map(({ g, placi }) => {
        const rang: Record<string, number> = { warn: 3, open: 2, on: 1, info: 0, code: 0 };
        const lit = placi.filter((x) => x.aprins);
        const cel = lit.reduce<string | null>((a, x) => (a === null || rang[x.f.kind] > rang[a] ? x.f.kind : a), null);
        return (
          <details class="cfm-g" open key={g.key}>
            <summary>
              <Icon name={g.mi} size={14} />
              <b>{g.label}</b>
              {lit.length > 0 && <span class="cfm-cnt" style={{ background: canColor(cel as any) }}>{lit.length}</span>}
            </summary>
            <div class="cfm-grid">
              {placi.map(({ f, aprins, text, necitit }) => (
                <div
                  class={'cfm-t' + (aprins ? ' lit' : '') + (necitit ? ' nd' : '')}
                  key={f.key}
                  style={aprins ? { '--c': canColor(f.kind) } as any : undefined}
                >
                  <Icon name={f.mi} size={17} />
                  <span class="cfm-l">{f.label}</span>
                  <span class="cfm-s">{text}</span>
                </div>
              ))}
            </div>
          </details>
        );
      })}

      {necitite > 0 && (
        <div class="cfm-note">
          {necitite} semnale sunt marcate „necitit": adaptorul le poate trimite, dar încă nu știm unde le pune
          în mesaj. Le aprindem după ce le confirmăm pe un vehicul — până atunci preferăm să lipsească decât
          să arate greșit.
        </div>
      )}
    </div>
  );
}

export function CanList({ io, adblueOk, showRaw }: { io: any; adblueOk?: boolean; showRaw?: boolean }) {
  const d = io || {};
  const ignOn = (d.ignition === 1 || d.ignition === true);
  const voltage = (typeof d.external_voltage === 'number' && d.external_voltage > 0) ? (d.external_voltage / 1000).toFixed(2) + ' V' : null;
  // Odometru: CAN-ul (real din bord) prioritar; total_odometer (GPS device) doar fallback.
  const odo = (typeof d.can_total_mileage === 'number' && d.can_total_mileage > 0) ? Math.round(d.can_total_mileage) + ' km'
    : (typeof d.can_total_mileage_counted === 'number' && d.can_total_mileage_counted > 0) ? Math.round(d.can_total_mileage_counted) + ' km'
    : (d.total_odometer != null ? Math.round(d.total_odometer / 1000) + ' km' : null);
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
  // Contact PORNIT → + restul parametrilor CAN (fără cele deja afișate / duplicate; AdBlue doar diesel+Euro6).
  // Contact OPRIT → doar cele de bază (restul ar fi valori vechi de carry-forward).
  const SHOWN = new Set(['ignition', 'gsm_signal', 'external_voltage', 'total_odometer', 'can_total_mileage', 'can_total_mileage_counted', 'can_fuel_level_liters', 'can_fuel_level_pct', 'fuel_level_liters', 'fuel_level_pct']);
  const extra = ignOn ? Object.keys(d).filter((k) => (CAN_LABELS[k] || k.startsWith('can_')) && !SHOWN.has(k) && !(!adblueOk && k.startsWith('can_adblue'))) : [];
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
      {showRaw && <RawIo io={d} />}
    </>
  );
}

// Super-admin: TOATE semnalele brute (pentru mapare IO), nu doar cele „utile" — echivalentul panoului IO din web.
// Aplatizează și flag-urile decodate (_security_flags / _control_flags etc.) un nivel, ca panoul web (_sf_/_cf_).
function RawIo({ io }: { io: any }) {
  const flat: Record<string, any> = {};
  for (const [k, val] of Object.entries(io || {})) {
    if (val === null || val === undefined) continue;
    // Steagurile decodate le desenează CanFlags, cu nume și iconiță. Aici rămâne ce chiar e brut și
    // are nevoie de mapare (io_NNN). Înainte apăreau de două ori, a doua oară ca „security_flags.
    // door_front_left" — un rând pe care nu-l poți mapa la nimic, doar lungea lista cu ~60 de intrări.
    if (k === '_security_flags' || k === '_control_flags') continue;
    if (typeof val === 'object') {
      for (const [k2, v2] of Object.entries(val as any)) {
        if (v2 !== null && typeof v2 !== 'object') flat[k.replace(/^_/, '') + '.' + k2] = v2;
      }
    } else { flat[k] = val; }
  }
  const keys = Object.keys(flat).sort();
  if (!keys.length) return null;
  return (
    <>
      <div class="kv raw-h"><span class="k">Toate semnalele (brut)</span><span class="v">{keys.length}</span></div>
      {keys.map((k) => <div class="kv"><span class="k">{prettyKey(k)}</span><span class="v">{String(flat[k])}</span></div>)}
    </>
  );
}

// Tahograf — semnalele transmise LIVE (carduri șofer, timpi de condus/odihnă) extrase din IO. Fișierele .DDD
// descărcate se analizează separat (secțiunea „Tahograf" din meniu).
function TachoLive({ io }: { io: any }) {
  const d = io || {};
  const keys = Object.keys(d).filter((k) => /tacho|driver1|driver2|driver_card|card_present|tachograph|driving|drive_time|rest_time|working_time/i.test(k));
  if (!keys.length) return <div class="center-msg">Niciun semnal de tahograf transmis live de acest vehicul. Fișierele descărcate (.DDD) se analizează în secțiunea „Tahograf" din meniu.</div>;
  return (
    <>
      {keys.map((k) => {
        const def = CAN_LABELS[k];
        return <div class="kv"><span class="k">{def ? def[0] : prettyKey(k)}</span><span class="v">{String(d[k])}{def && def[1] ? ' ' + def[1] : ''}</span></div>;
      })}
    </>
  );
}
