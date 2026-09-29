// Fișa tehnică a vehiculului — configurație unică pentru AFIȘARE și EDITARE.
// Câmpurile respectă exact `VEHICLE_DETAIL_COLS` din db.js: ce nu e acolo, serverul ignoră tăcut la salvare.
// Pe telefon aveam doar 7 câmpuri (nume, număr, tip, șofer, grupă + două de super-admin), deși fișa de pe
// web are ~35 editabile: cine administra flota de pe teren trebuia să revină la laptop pentru orice detaliu.
import { useState } from 'preact/hooks';
import { Icon, type IconName } from './Icon';
import { VehicleArt, vehCatOf } from './VehicleArt';
import { CATEGORII, PICTOGRAME, iconDinTip } from './vehCategorii';

export type SpecField = {
  k: string;                       // numele coloanei, exact ca pe server
  l: string;                       // eticheta
  t?: 'text' | 'number' | 'select' | 'area' | 'icon';
  u?: string;                      // unitatea, afișată lângă valoare (l, kg, km/h…)
  opts?: { v: string; l: string }[];
  hint?: string;
  super?: boolean;                 // doar super-admin (serverul le și elimină din body dacă nu ești)
  // Doar citire: date de ECHIPAMENT (model GPS, cartelă SIM), puse de noi la instalare. Se arată, dar nu se
  // trimit la salvare — serverul le aruncă oricum din ce trimite un cont de firmă.
  ro?: boolean;
};
export type SpecSection = { titlu: string; icon: IconName; campuri: SpecField[] };

export const SPEC_SECTIONS: SpecSection[] = [
  {
    titlu: 'Identificare', icon: 'idCard', campuri: [
      { k: 'name', l: 'Denumire' },
      { k: 'plate', l: 'Număr de înmatriculare' },
      // Valorile sunt cele DEJA stocate în bază (etichete în română, ca pe web). Toate cele 23 de categorii de
      // pe web — cu doar 8, la un „Autotractor" sau „TIR" trecut pe web lista arăta gol.
      { k: 'vehicle_type', l: 'Categorie', t: 'select', opts: [{ v: '', l: '— alege —' }, ...CATEGORII] },
      // Desenul de pe hartă și din listă. Se leagă singur de categorie (ca pe web), dar se poate schimba.
      { k: 'icon', l: 'Pictogramă', t: 'icon' },
      { k: 'brand', l: 'Marcă' },
      { k: 'model', l: 'Model' },
      { k: 'year', l: 'An fabricație', t: 'number' },
      { k: 'vin', l: 'Serie șasiu (VIN)' },
      { k: 'inventory_number', l: 'Număr de inventar' },
      { k: 'cost_center', l: 'Centru de cost' },
    ],
  },
  {
    titlu: 'Motor & combustibil', icon: 'droplet', campuri: [
      // Aceleași valori ca în fișa de pe web (public/index.html) — altfel prețul carburantului și
      // statisticile de consum, care se uită după „Motorina"/„Benzina", n-ar mai găsi nimic.
      { k: 'fuel_type', l: 'Combustibil', t: 'select', opts: [
        { v: '', l: '—' }, { v: 'Motorina', l: 'Motorină' }, { v: 'Benzina', l: 'Benzină' }, { v: 'GPL', l: 'GPL' },
        { v: 'Electric', l: 'Electric' }, { v: 'Hibrid', l: 'Hibrid' }, { v: 'Altul', l: 'Altul' }] },
      { k: 'tank_capacity', l: 'Capacitate rezervor', t: 'number', u: 'l' },
      { k: 'lpg_volume', l: 'Volum GPL', t: 'number', u: 'l' },
      { k: 'displacement', l: 'Capacitate cilindrică', t: 'number', u: 'cmc' },
      { k: 'power_kw', l: 'Putere', t: 'number', u: 'kW' },
      { k: 'emission_class', l: 'Normă de poluare' },
      { k: 'engine_serial', l: 'Serie motor' },
    ],
  },
  {
    titlu: 'Consum de referință', icon: 'gauge', campuri: [
      { k: 'consumption_city', l: 'Urban', t: 'number', u: 'l/100km' },
      { k: 'consumption_road', l: 'Extraurban', t: 'number', u: 'l/100km' },
      { k: 'consumption_idle', l: 'La ralanti', t: 'number', u: 'l/h', hint: 'Folosit la estimarea risipei când motorul stă pornit fără deplasare.' },
    ],
  },
  {
    titlu: 'Greutăți & capacitate', icon: 'truck', campuri: [
      { k: 'tare_weight', l: 'Masă proprie (tara)', t: 'number', u: 'kg' },
      { k: 'payload', l: 'Sarcină utilă', t: 'number', u: 'kg' },
      { k: 'max_weight_legal', l: 'Masă maximă legală', t: 'number', u: 'kg' },
      { k: 'max_weight_construct', l: 'Masă maximă constructivă', t: 'number', u: 'kg' },
      { k: 'passenger_seats', l: 'Locuri', t: 'number' },
    ],
  },
  {
    titlu: 'Exploatare', icon: 'settings', campuri: [
      { k: 'speed_limit', l: 'Limită de viteză', t: 'number', u: 'km/h', hint: 'Peste ea se declanșează alerta de depășire pentru acest vehicul.' },
      { k: 'odo_base_km', l: 'Km la bord', t: 'number', u: 'km', hint: 'Indexul real din bord. Se folosește la vehiculele fără CAN; schimbarea lui rebazează contorul.' },
      { k: 'road_tax_category', l: 'Categorie rovinietă' },
      { k: 'tire_size', l: 'Dimensiune anvelope' },
      { k: 'temp_min', l: 'Temperatură minimă admisă', t: 'number', u: '°C' },
      { k: 'temp_max', l: 'Temperatură maximă admisă', t: 'number', u: '°C' },
      { k: 'notes', l: 'Observații', t: 'area' },
    ],
  },
  {
    // Echipamentul GPS, nu vehiculul: ca pe web („Administrativ & afișare"), cine administrează flota le vede,
    // nu le scrie. Restul rolurilor nu le văd deloc (vezi `admin` în VehicleSpecsView).
    titlu: 'Echipament GPS', icon: 'cpu', campuri: [
      { k: 'gps_model', l: 'Model dispozitiv GPS', ro: true, hint: 'Se completează la instalare, de RA Tracks.' },
      { k: 'sim_number', l: 'Număr cartelă SIM', ro: true, hint: 'Se completează la instalare, de RA Tracks.' },
    ],
  },
];

// Câmpurile din „Greutăți" care, la categoriile cu axe, stau în „Config Camion" (ca pe web) — un singur
// loc pe ecran pentru fiecare câmp. Valoarea e aceeași (același formular), deci cele două salvări nu se bat.
export const CHEI_GREUTATI_CAMION = ['tare_weight', 'max_weight_legal', 'max_weight_construct'];

// Câmpurile rezervate super-adminului stau separat: serverul le elimină din body pentru ceilalți,
// deci afișarea lor tuturor ar fi o promisiune falsă.
export const SPEC_SUPER: SpecField[] = [
  { k: 'ignition_source', l: 'Sursă contact', t: 'select', super: true, opts: [
    { v: '', l: 'Automat (IO 239, implicit)' }, { v: 'din1', l: 'DIN1 (intrare digitală 1)' }],
    hint: 'Doar dacă contactul vine pe intrarea digitală, nu pe IO 239.' },
];

const gol = (v: any) => v === null || v === undefined || v === '';
const numar = (v: any) => (v !== '' && v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null);

// ─── Afișare (read-only) — arată DOAR ce e completat, ca fișa să nu fie un perete de liniuțe ───
// `camion` = la vehiculul ăsta se vede „Config Camion" (categorie cu axe + fila lăsată pornită de firmă).
// `admin` = omul are „modifică flota" (manageFleet). Pe web, echipamentul (model GPS, cartela SIM — canalul de
// comenzi prin SMS al aparatului) și „Config Camion" (preț combustibil, cost pe tonă-km, limite pe axe) apar
// DOAR în formularul de editare și în „Aparate GPS", ambele păzite pe server cu requireFleet. Un vizualizator,
// un dispecer sau un client nu le vede acolo — deci nici în fișa de pe telefon.
export function VehicleSpecsView({ full, camion, admin }: { full: any; camion?: boolean; admin?: boolean }) {
  if (!full) return null;
  const sectiuni = SPEC_SECTIONS
    .map((s) => ({ s, c: s.campuri.filter((f) => (admin || !f.ro) && !gol(full[f.k])) }))
    .filter((x) => x.c.length);
  const cam = camion && admin ? camionDinFull(full) : null;
  const axe = cam ? [1, 2, 3, 4, 5].filter((n) => !gol(cam['axle' + n])) : [];
  const areCamion = !!cam && (!gol(cam.fuel_price) || !gol(cam.cost_per_ton_km) || axe.length > 0);
  if (!sectiuni.length && !areCamion) return null;

  const afiseaza = (f: SpecField, v: any) => {
    if (f.t === 'icon') { const o = PICTOGRAME.find((x) => x.v === v); return o ? o.l : String(v); }
    if (f.opts) { const o = f.opts.find((x) => String(x.v) === String(v)); return o ? o.l : String(v); }
    // Coloanele NUMERIC vin din PostgreSQL ca șir cu zecimale („412000.0", „34.50") → normalizăm,
    // altfel kilometrajul arată ca o măsurătoare de laborator.
    let s = String(v);
    if (f.t === 'number' && !isNaN(Number(v))) s = String(Number(v));
    return s + (f.u ? ' ' + f.u : '');
  };

  return (
    <>
      {sectiuni.map(({ s, c }) => (
        <div class="pf-card">
          {/* `.pf-card h3` e space-between → grupez iconul cu titlul, altfel se despart la capetele rândului. */}
          <h3><span style="display:flex;align-items:center;gap:6px"><Icon name={s.icon} size={15} color="var(--accent)" /> {s.titlu}</span></h3>
          {c.map((f) => (
            <div class="adm-kv"><span class="k">{f.l}</span><span style={f.t === 'area' ? 'text-align:right;white-space:pre-wrap' : ''}>{afiseaza(f, full[f.k])}</span></div>
          ))}
        </div>
      ))}
      {areCamion && cam && (
        <div class="pf-card">
          <h3><span style="display:flex;align-items:center;gap:6px"><Icon name="truck" size={15} color="var(--accent)" /> Config camion</span></h3>
          {!gol(cam.fuel_price) && <div class="adm-kv"><span class="k">Preț combustibil</span><span>{cam.fuel_price} RON/L</span></div>}
          {axe.map((n) => <div class="adm-kv"><span class="k">Limită axa {n}</span><span>{cam['axle' + n]} kg</span></div>)}
          {!gol(cam.cost_per_ton_km) && <div class="adm-kv"><span class="k">Cost per tonă-km</span><span>{cam.cost_per_ton_km} RON</span></div>}
        </div>
      )}
    </>
  );
}

// Pictograma: rândul arată desenul ales (sau cel legat de categorie, cât timp n-ai ales nimic); atingerea
// deschide grila cu toate desenele. Plăcuțe mari, fără meniu derulant îngust.
function AlegePictograma({ val, tip, set }: { val: string; tip: string; set: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = val || iconDinTip(tip) || 'car';
  const et = (PICTOGRAME.find((x) => x.v === cur) || { l: 'Auto' }).l;
  return (
    <div class="fld">
      <label>Pictogramă</label>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style="min-height:52px;display:flex;align-items:center;gap:12px;width:100%;padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-primary);font-size:15px;font-family:inherit;text-align:left">
        <VehicleArt cat={vehCatOf({ icon: cur })} color="var(--accent)" width={42} />
        <span style="flex:1">{et}{!val ? <span style="color:var(--text-muted);font-size:12px"> · după categorie</span> : null}</span>
        <Icon name="chevronR" size={16} style={'transform:rotate(' + (open ? '270' : '90') + 'deg)'} />
      </button>
      {open && (
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
          {PICTOGRAME.map((o) => {
            const on = o.v === cur;
            return (
              <button type="button" onClick={() => { set(o.v); setOpen(false); }} aria-pressed={on}
                style={'min-height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 4px;border-radius:10px;border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'rgba(63,224,125,.12)' : 'var(--bg-card)') + ';color:var(--text-primary);font-size:11.5px;font-weight:700;font-family:inherit'}>
                <VehicleArt cat={vehCatOf({ icon: o.v })} color={on ? 'var(--accent)' : 'var(--text-muted)'} width={44} />
                {o.l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Editare — aceleași câmpuri, aceeași ordine ───
// `ascunde`: chei afișate în altă parte a formularului (ex. tara și masele maxime, în „Config Camion").
export function VehicleSpecsForm({ val, set, isSuper, ascunde }: { val: Record<string, any>; set: (k: string, v: any) => void; isSuper?: boolean; ascunde?: string[] }) {
  // Categoria nouă își aduce pictograma (ca pe web, onVehicleTypeChange); o poți schimba apoi de mână.
  const pune = (k: string, v: any) => {
    set(k, v);
    if (k === 'vehicle_type') { const ic = iconDinTip(v); if (ic) set('icon', ic); }
  };
  const camp = (f: SpecField) => {
    const v = val[f.k] ?? '';
    if (f.t === 'icon') return <AlegePictograma key={f.k} val={String(v)} tip={String(val.vehicle_type || '')} set={(x) => pune(f.k, x)} />;
    if (f.ro) {
      return (
        <div class="fld" key={f.k}>
          <label>{f.l}</label>
          <input type="text" value={String(v)} readOnly disabled placeholder="—" style="opacity:.75" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
            {isSuper ? 'Le modifici din Administrare → Dispozitive.' : f.hint}
          </div>
        </div>
      );
    }
    if (f.t === 'select') {
      // O valoare veche care nu mai e în listă rămâne aleasă (altfel lista ar arăta gol și ar părea ștearsă).
      const opts = (f.opts || []).some((o) => String(o.v) === String(v)) || v === '' ? (f.opts || []) : [...(f.opts || []), { v: String(v), l: String(v) }];
      return (
        <div class="fld" key={f.k}>
          <label>{f.l}{f.super ? <span style="color:var(--accent);font-size:10px"> super-admin</span> : null}</label>
          <select value={String(v)} onChange={(e) => pune(f.k, (e.target as HTMLSelectElement).value)}>
            {opts.map((o) => <option value={o.v}>{o.l}</option>)}
          </select>
          {f.hint ? <div style="font-size:11px;color:var(--text-muted);margin-top:3px">{f.hint}</div> : null}
        </div>
      );
    }
    if (f.t === 'area') {
      return (
        <div class="fld" key={f.k}>
          <label>{f.l}</label>
          <textarea rows={3} value={String(v)} onInput={(e) => set(f.k, (e.target as HTMLTextAreaElement).value)}
            style="width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:11px;font-size:15px;font-family:inherit;resize:vertical" />
        </div>
      );
    }
    return (
      <div class="fld" key={f.k}>
        <label>{f.l}{f.u ? <span style="color:var(--text-muted);font-weight:500"> ({f.u})</span> : null}</label>
        <input type={f.t === 'number' ? 'number' : 'text'} inputMode={f.t === 'number' ? 'decimal' : undefined}
          value={String(v)} onInput={(e) => set(f.k, (e.target as HTMLInputElement).value)} />
        {f.hint ? <div style="font-size:11px;color:var(--text-muted);margin-top:3px">{f.hint}</div> : null}
      </div>
    );
  };

  const fara = new Set(ascunde || []);
  return (
    <>
      {SPEC_SECTIONS.map((s) => {
        const campuri = s.campuri.filter((f) => !fara.has(f.k));
        if (!campuri.length) return null;
        return (
          <details key={s.titlu} open={s.titlu === 'Identificare'} style="border:1px solid var(--border);border-radius:11px;margin-bottom:9px;overflow:hidden">
            <summary style="padding:11px 13px;cursor:pointer;font-size:13px;font-weight:700;background:var(--bg-dark);display:flex;align-items:center;gap:8px">
              <Icon name={s.icon} size={15} color="var(--accent)" /> {s.titlu}
            </summary>
            <div style="padding:11px 13px 4px">{campuri.map(camp)}</div>
          </details>
        );
      })}
      {isSuper && (
        <details style="border:1px solid var(--border);border-radius:11px;margin-bottom:9px;overflow:hidden">
          <summary style="padding:11px 13px;cursor:pointer;font-size:13px;font-weight:700;background:var(--bg-dark);display:flex;align-items:center;gap:8px">
            <Icon name="cpu" size={15} color="var(--accent)" /> Tehnic (super-admin)
          </summary>
          <div style="padding:11px 13px 4px">{SPEC_SUPER.map(camp)}</div>
        </details>
      )}
    </>
  );
}

// Ia din fișa completă cheile de formular — restul (io_mappings, last_can, work_schedule…) au editoare proprii.
// Include și câmpurile doar-citire (model GPS, SIM), ca să se vadă în formular; la salvare folosește specsDeTrimis.
export function specsFromFull(full: any): Record<string, any> {
  const out: Record<string, any> = {};
  const ia = (f: SpecField) => {
    const v = full?.[f.k] ?? '';
    // „412000.0" din NUMERIC → „412000" în câmpul de editare (valoarea salvată e oricum numerică).
    if (f.t === 'number' && v !== '' && v !== null && !isNaN(Number(v))) return String(Number(v));
    return v === null ? '' : v;
  };
  for (const s of SPEC_SECTIONS) for (const f of s.campuri) out[f.k] = ia(f);
  for (const f of SPEC_SUPER) out[f.k] = ia(f);
  return out;
}
// Ce pleacă spre PUT /details: câmpurile fișei, FĂRĂ cele doar-citire (model GPS, SIM).
export function specsDeTrimis(ef: any): Record<string, any> {
  const out = specsFromFull(ef);
  for (const s of SPEC_SECTIONS) for (const f of s.campuri) if (f.ro) delete out[f.k];
  return out;
}

// ─── „Config Camion" (web: #edit-tab-truck) ───
// PUT /truck-config SUPRASCRIE toate cele șase coloane deodată (db.updateTruckConfig): ce lipsește devine gol.
// De aceea valorile se citesc din /full, iar la salvare pleacă MEREU obiectul întreg. Tara și masele maxime
// vin din ACELAȘI formular care se trimite și pe /details — cele două salvări spun același lucru.
export const CHEI_CAMION = ['fuel_price', 'cost_per_ton_km', 'axle1', 'axle2', 'axle3', 'axle4', 'axle5'];
export function camionDinFull(full: any): Record<string, string> {
  let axe: any = full && full.max_axle_loads;
  if (typeof axe === 'string') { try { axe = JSON.parse(axe); } catch { axe = null; } }
  if (!axe || typeof axe !== 'object') axe = {};
  const s = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '' : String(Number(v)));
  const out: Record<string, string> = { fuel_price: s(full && full.fuel_price), cost_per_ton_km: s(full && full.cost_per_ton_km) };
  for (let n = 1; n <= 5; n++) out['axle' + n] = s(axe['axle' + n]);
  return out;
}
export function camionDeTrimis(ef: any) {
  // Ca pe web: 0 sau gol = nimic (serverul pune oricum `|| null`).
  const intreg = (v: any) => { const n = numar(v); return n == null ? null : (Math.round(n) || null); };
  const zecimal = (v: any) => { const n = numar(v); return n == null ? null : (n || null); };
  return {
    tareWeight: intreg(ef.tare_weight),
    maxWeightLegal: intreg(ef.max_weight_legal),
    maxWeightConstruct: intreg(ef.max_weight_construct),
    maxAxleLoads: { axle1: intreg(ef.axle1), axle2: intreg(ef.axle2), axle3: intreg(ef.axle3), axle4: intreg(ef.axle4), axle5: intreg(ef.axle5) },
    fuelPrice: zecimal(ef.fuel_price),
    costPerTonKm: zecimal(ef.cost_per_ton_km),
  };
}
export function ConfigCamionForm({ val, set }: { val: Record<string, any>; set: (k: string, v: any) => void }) {
  const f = (k: string, l: string, step?: string, ph?: string) => (
    <div class="fld" key={k}>
      <label>{l}</label>
      <input type="number" inputMode="decimal" step={step} placeholder={ph} value={String(val[k] ?? '')}
        onInput={(e) => set(k, (e.target as HTMLInputElement).value)} />
    </div>
  );
  return (
    <div class="frm" style="gap:10px">
      <div style="background:var(--bg-dark);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text-muted);line-height:1.5">
        Configurează limitele și tara pentru camioane. Folosit pentru alerte supraîncărcare și calcul încărcătură.
      </div>
      {f('tare_weight', 'Tară (kg)', '1', 'ex: 18000')}
      {f('max_weight_legal', 'Limită legală (kg)', '1', 'ex: 32000')}
      {f('max_weight_construct', 'Limită constructivă (kg)', '1', 'ex: 41000')}
      {f('fuel_price', 'Preț combustibil (RON/L)', '0.01', 'ex: 7.85')}
      <div style="font-size:12.5px;font-weight:700;color:var(--text-secondary);margin-top:2px">Limite per axă (kg)</div>
      {f('axle1', 'Axa 1', '1', '9000')}
      {f('axle2', 'Axa 2', '1', '9000')}
      {f('axle3', 'Axa 3', '1', '13000')}
      {f('axle4', 'Axa 4', '1', '13000')}
      {f('axle5', 'Axa 5', '1')}
      {f('cost_per_ton_km', 'Cost per tonă-km (RON)', '0.01', 'ex: 0.85')}
    </div>
  );
}
