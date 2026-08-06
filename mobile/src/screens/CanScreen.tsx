import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { vehicles, offlineMinutes, me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { statusOf } from '../lib/status';
import { fmtAgo, voltageStr } from '../lib/format';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { CanList } from './VehicleDetail';
import './detail.css';
import './can.css';

// Valorile CAN vin ca STRING din PostgreSQL (JSONB/NUMERIC serializat). `typeof x === 'number'` le
// respinge tăcut, iar dala apare goală tocmai pe vehiculele care chiar transmit. Peste tot: parseFloat.
function num(x: any): number | null {
  if (x == null) return null;
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : null;
}
// Magistrala CAN semnalează „valoare indisponibilă" cu sentinele (0xFFFF / 0xFF...). Fluxul live NU trece
// prin curățarea de la scriere (db._sanitizeIo, aplicată doar la insert în istoric), deci ecranul ar putea
// afișa „65535 RPM" ca valoare citită, în timp ce rapoartele pentru aceeași poziție au null.
function plauzibil(x: number | null, min: number, max: number): number | null {
  return x == null ? null : (x >= min && x <= max ? x : null);
}
const grp = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

type Src = 'read' | 'calc';
const SRC_TXT: Record<Src, string> = { read: 'Citită de la mașină', calc: 'Calculată de noi' };

function Tile(p: {
  icon: IconName; label: string; value: string | null;
  src?: Src; explic?: string; cls?: string; full?: boolean;
}) {
  // Fără valoare → dala nu se randează deloc. O grilă plină de „—" arată ca un ecran stricat
  // pe autoturismele care pur și simplu nu au CAN.
  if (p.value == null) return null;
  return (
    <div class={'can-t' + (p.full ? ' full' : '')}>
      <Icon name={p.icon} size={20} class="ic" />
      <div class="mid">
        <div class={'can-v ' + (p.cls || '')}>{p.value}</div>
        <div class="can-l">{p.label}</div>
        {p.src ? <span class={'can-src ' + p.src}>{SRC_TXT[p.src]}</span> : null}
        {/* Explicația e TEXT vizibil, nu tooltip: pe telefon `title` nu se declanșează niciodată,
            iar tocmai asta e informația care justifică ecranul. */}
        {p.explic ? <div class="can-why">{p.explic}</div> : null}
      </div>
    </div>
  );
}

export function CanScreen() {
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  const [full, setFull] = useState<any | null>(null);
  const [senzori, setSenzori] = useState<any[] | null>(null);
  const [cons, setCons] = useState<{ per100: number; estimated: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [gata, setGata] = useState(false);
  const [brute, setBrute] = useState(false);

  // preact-iso REFOLOSEȘTE instanța când se schimbă doar parametrul rutei. Fără resetare, ecranul ar
  // arăta kilometrajul și combustibilul vehiculului precedent. `viu` anulează răspunsurile întârziate:
  // pe rețea slabă, fișa cerută pentru mașina veche se putea întoarce PESTE starea deja resetată.
  useEffect(() => {
    let viu = true;
    setFull(null); setSenzori(null); setCons(null); setErr(''); setGata(false); setBrute(false);
    Promise.all([
      Api.deviceFull(imei).then((r) => { if (viu) setFull(r); }).catch((e: any) => { if (viu) setErr(e?.message || 'Nu am putut încărca fișa vehiculului'); }),
      Api.fuelSensors(imei).then((r: any) => { if (viu) setSenzori(Array.isArray(r) ? r : (r?.sensors || [])); }).catch(() => { if (viu) setSenzori([]); }),
    ]).then(() => { if (viu) setGata(true); });
    // Consumul mediu NU există ca semnal CAN — se calculează. Endpoint-ul cere viewReports.
    if (me.value?.permissions?.viewReports) {
      const to = new Date(), from = new Date(Date.now() - 7 * 86400000);
      Api.fuelStats(from.toISOString(), to.toISOString(), [imei])
        .then((r: any) => {
          const pv = r && r.perVehicle && r.perVehicle[0];
          if (viu && pv && pv.per100 != null) setCons({ per100: Number(pv.per100), estimated: !!pv.estimated });
        })
        .catch(() => { /* fără consum — dala pur și simplu lipsește */ });
    }
    return () => { viu = false; };
  }, [imei]);

  const v: any = vehicles.value.find((x) => x.imei === imei);
  const io: any = (v && v.io) || {};
  const isSuper = !!me.value?.isSuper;
  const ignOn = io.ignition === 1 || io.ignition === true;
  const st = v ? statusOf(v, offlineMinutes.value) : null;
  const fms = String(full?.can_interface || '').toLowerCase() === 'fms';

  // ── Combustibil ────────────────────────────────────────────────────────────────────────────────
  // Cheia `fuel_level_liters` NU dovedește nimic singură: e scrisă de computeFuelFromSensors prin
  // interpolare din tabelul de calibrare (deci CALCULATĂ) când vehiculul are senzori configurați, dar
  // e o copie 1:1 din can_/lls_/ble_ când nu are. De aceea eticheta se decide după existența senzorilor.
  const areSenzori = !!(senzori && senzori.length);
  let fuelL: number | null = null, fuelSrc: Src = 'read', fuelWhy = '';
  const _tank = plauzibil(num(io.tank_level_liters), 0, 5000);
  const _gen = plauzibil(num(io.fuel_level_liters), 0, 5000);
  const _can = plauzibil(num(io.can_fuel_level_liters), 0, 5000);
  if (_tank != null) { fuelL = _tank; fuelSrc = 'calc'; fuelWhy = 'Din voltajul sondei, prin calibrarea din fișa vehiculului.'; }
  else if (_gen != null) {
    fuelL = _gen;
    fuelSrc = areSenzori ? 'calc' : 'read';
    fuelWhy = areSenzori
      ? 'Din senzorul de nivel montat, trecut prin tabelul de calibrare din fișă.'
      : 'Litrii transmiși de mașină.';
  } else if (_can != null) { fuelL = _can; fuelSrc = 'read'; fuelWhy = 'Litrii transmiși de mașină prin CAN.'; }

  const cap = num(full?.tank_capacity);
  // Procentul brut de pe CAN NU se folosește: pe senzorii de serie e nesigur (42 L raportați ca „100%").
  const fuelPct = (fuelL != null && cap && cap > 0) ? Math.max(0, Math.min(100, (fuelL / cap) * 100)) : null;

  // ── Kilometraj ─────────────────────────────────────────────────────────────────────────────────
  // CAPCANĂ: pe interfața FMS, `total_odometer` (AVL 36) e odometrul REAL de bord al camionului, citit
  // prin CAN — nu contorul GPS al dispozitivului, cum e pe harta standard. Aceeași cheie, alt înțeles.
  // Ordinea urmează _odoFromIo din server (prima cheie prezentă, nu prima > 0), ca mentenanța și
  // scadențele pe km să nu lucreze cu alt kilometraj decât ecranul ăsta.
  let odo: number | null = null, odoSrc: Src = 'read', odoWhy = '';
  const _cm = num(io.can_total_mileage), _cmc = num(io.can_total_mileage_counted), _td = num(io.total_odometer);
  if (_cm != null) { odo = Math.round(_cm); odoSrc = 'read'; odoWhy = 'Contorul de bord al mașinii, prin CAN.'; }
  else if (_cmc != null) { odo = Math.round(_cmc); odoSrc = 'read'; odoWhy = 'Contor acumulat de dispozitiv din datele CAN — poate diferi de bord.'; }
  else if (_td != null) {
    odo = Math.round(_td / 1000);
    odoSrc = fms ? 'read' : 'calc';
    odoWhy = fms
      ? 'Odometrul de bord al camionului, prin magistrala FMS.'
      : 'Distanța însumată de dispozitiv din poziții GPS, de la montare.';
  }
  if (odo != null && odo <= 0) odo = null;   // 0 km = contor neconfigurat, nu „mașină nouă"

  // ── Greutate ───────────────────────────────────────────────────────────────────────────────────
  // Axele se mapează 1-10 în parser, nu 1-5. Iar suma parțială NU trebuie să bată greutatea citită:
  // un pachet care aduce o singură axă ar face un ansamblu de 38 t să pară 7 t.
  const axe = Array.from({ length: 10 }, (_, i) => num(io['can_axle' + (i + 1) + '_load']) || 0);
  const nrAxe = axe.filter((x) => x > 0).length;
  const sumaAxe = axe.reduce((a, b) => a + b, 0);
  const _lw = num(io.can_load_weight) ?? num(io.can_total_axle_load);
  const areLw = _lw != null && _lw > 0;
  const foloseșteSuma = sumaAxe > 0 && (!areLw || sumaAxe >= _lw!);
  const greutate = foloseșteSuma ? sumaAxe : (areLw ? _lw! : null);
  const greutateSrc: Src = foloseșteSuma ? 'calc' : 'read';

  const rpm = ignOn ? plauzibil(num(io.can_engine_rpm), 0, 16383) : null;
  const temp = ignOn ? plauzibil(num(io.can_engine_temp), -60, 250) : null;
  const vitCan = plauzibil(num(io.can_vehicle_speed), 0, 300);
  const adbluePct = plauzibil(num(io.can_adblue_level_pct), 0, 100);
  const adblueL = plauzibil(num(io.can_adblue_level_liters), 0, 500);
  const stale = !!(v as any)?.can_stale;
  const lastQ = (stale && (v as any).can_snapshot_ts) ? (v as any).can_snapshot_ts : v?.timestamp;

  async function copiazaVin() {
    const vin = full?.vin; if (!vin) return;
    try { await navigator.clipboard.writeText(String(vin)); showToast('VIN copiat'); }
    catch { showToast('Nu s-a putut copia VIN-ul', true); }
  }

  const areCeva = [v?.speed, rpm, temp, fuelL, odo, greutate, vitCan, adbluePct, cons].some((x) => x != null);
  const asteptam = !gata || !v;   // fișa nu s-a încărcat sau lista live nu are încă vehiculul

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Date CAN</div>
        <div style="width:36px" />
      </header>

      <div class="content d-content">
        {err ? <div class="center-msg" style="color:var(--red)">{err}</div> : null}

        <div class="card d-detail can-hero">
          <div class="plate">{full?.plate || v?.plate || v?.name || imei}</div>
          {st ? <div class="st"><span class="dot" style={{ background: st.color }} /><span style={{ color: st.color }}>{st.label}</span></div> : null}
          <div class="ago">Ultima transmisie · {fmtAgo(lastQ)}</div>
          {stale
            ? <div class="stale">O parte din valorile de mai jos sunt ultimele transmise de mașină, nu citite acum.</div>
            : null}
          {full?.vin
            ? <div class="can-vin">
                <div class="v">{full.vin}<div class="src">VIN · din fișa vehiculului, nu din CAN</div></div>
                <button type="button" onClick={copiazaVin} aria-label="Copiază VIN-ul"><Icon name="idCard" size={18} /></button>
              </div>
            : null}
        </div>

        <div class="can-grid">
          <Tile icon="gauge" label="Viteza actuală" value={v?.speed != null ? Math.round(v.speed) + ' km/h' : null}
                src="read" explic="Măsurată de GPS-ul dispozitivului." />
          <Tile icon="cpu" label="Turație motor" value={rpm != null ? grp(Math.round(rpm)) + ' RPM' : null}
                src="read"
                explic={'Citită de la motor prin CAN.' + (stale ? ' Poate fi ultima valoare primită (până la 15 min).' : '')} />
          <Tile icon="droplet" label="Combustibil (procent)" value={fuelPct != null ? fuelPct.toFixed(1) + '%' : null}
                src="calc" explic={'Litrii împărțiți la capacitatea rezervorului din fișă (' + (cap || 0) + ' L).'}
                cls={fuelPct != null && fuelPct < 15 ? 'red' : ''} />
          <Tile icon="droplet" label="Combustibil (litri)" value={fuelL != null ? fuelL.toFixed(1) + ' L' : null}
                src={fuelSrc} explic={fuelWhy} cls={fuelL != null && cap && fuelL / cap < 0.15 ? 'red' : ''} />
          <Tile icon="route" label="Kilometraj actual" value={odo != null ? grp(odo) + ' km' : null}
                src={odoSrc} explic={odoWhy} />
          <Tile icon="flame" label="Temperatură motor" value={temp != null ? temp.toFixed(1) + '°C' : null}
                src="read" explic="Citită de la motor prin CAN. Nu se păstrează între transmisii." />
          <Tile icon="truck" label={foloseșteSuma ? 'Greutate (' + nrAxe + ' axe)' : 'Greutate totală'}
                value={greutate != null ? (greutate / 1000).toFixed(2) + ' t' : null}
                src={greutateSrc}
                explic={foloseșteSuma ? 'Suma sarcinilor transmise pe fiecare axă.' : 'Greutatea transmisă de mașină.'} />
          <Tile icon="droplet" label="AdBlue" value={adbluePct != null ? adbluePct.toFixed(0) + '%' + (adblueL != null ? ' · ' + adblueL.toFixed(1) + ' L' : '') : null}
                src="read" explic="Nivelul din rezervorul de AdBlue, prin CAN." />
          <Tile icon="chart" label="Consum mediu (L/100km)" value={cons ? cons.per100.toFixed(1) + ' L' : null}
                src={cons && !cons.estimated ? 'read' : 'calc'}
                explic={cons && !cons.estimated
                  ? 'Din datele mașinii pe ultimele 7 zile — contorul de consum sau scăderile de nivel din rezervor.'
                  : 'Estimare pe ultimele 7 zile, din kilometri și consumul din fișă (sau media pe tipul de vehicul, dacă fișa e goală), plus ralantiul.'} />
        </div>

        {asteptam && !err
          ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : (!areCeva
            ? <div class="center-msg">Vehiculul nu transmite date CAN.<br />Apare doar ce trimite dispozitivul montat pe el.</div>
            : null)}

        {greutate != null && nrAxe > 0
          ? <div class="card d-stats">
              <h3>Sarcina pe axe</h3>
              {axe.map((kg, i) => kg > 0
                ? <div class="d-stat"><Icon name="disc" size={17} class="ic" /><span class="lbl">Axa {i + 1}</span><span class="val">{(kg / 1000).toFixed(2)} t</span></div>
                : null)}
              {num(full?.tare_weight)
                ? <div class="d-stat"><Icon name="truck" size={17} class="ic" /><span class="lbl">Încărcătură (fără tara)</span>
                    <span class="val">{Math.max(0, (greutate - (num(full?.tare_weight) || 0)) / 1000).toFixed(2)} t</span></div>
                : null}
            </div>
          : null}

        {isSuper
          ? <div class="card d-stats">
              <h3>Tehnic (doar administrator platformă)</h3>
              {voltageStr(io) ? <div class="d-stat"><Icon name="zap" size={17} class="ic" /><span class="lbl">Voltaj extern</span><span class="val">{voltageStr(io)}</span></div> : null}
              {vitCan != null ? <div class="d-stat"><Icon name="gauge" size={17} class="ic" /><span class="lbl">Viteză CAN</span><span class="val">{Math.round(vitCan)} km/h</span></div> : null}
              <div class="d-stat"><Icon name="settings" size={17} class="ic" /><span class="lbl">Interfață CAN</span>
                <span class="val">{full?.can_interface ? String(full.can_interface).toUpperCase() : 'auto'}</span></div>
              <div class="d-stat"><Icon name="idCard" size={17} class="ic" /><span class="lbl">IMEI</span><span class="val">{imei}</span></div>
              {/* Lista completă de semnale — unealta de diagnoză de teren („de ce nu apare combustibilul
                  pe mașina asta?"). Era în foaia veche; fără ea, mutarea pe ecran ar fi fost o pierdere. */}
              <button type="button" class="d-act can-raw" onClick={() => setBrute((b) => !b)}>
                <Icon name="list" size={17} class="ic" /> {brute ? 'Ascunde semnalele brute' : 'Vezi toate semnalele'}
              </button>
            </div>
          : null}

        {isSuper && brute ? <div class="card d-stats"><CanList io={io} adblueOk showRaw /></div> : null}

        <div class="can-note">
          Ecranul arată doar ce transmite efectiv mașina. Ce lipsește nu e o defecțiune a aplicației —
          înseamnă că dispozitivul nu primește acel semnal de la vehicul.
        </div>
      </div>
    </div>
  );
}
