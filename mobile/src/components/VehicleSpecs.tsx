// Fișa tehnică a vehiculului — configurație unică pentru AFIȘARE și EDITARE.
// Câmpurile respectă exact `VEHICLE_DETAIL_COLS` din db.js: ce nu e acolo, serverul ignoră tăcut la salvare.
// Pe telefon aveam doar 7 câmpuri (nume, număr, tip, șofer, grupă + două de super-admin), deși fișa de pe
// web are ~35 editabile: cine administra flota de pe teren trebuia să revină la laptop pentru orice detaliu.
import { Icon, type IconName } from './Icon';

export type SpecField = {
  k: string;                       // numele coloanei, exact ca pe server
  l: string;                       // eticheta
  t?: 'text' | 'number' | 'select' | 'area';
  u?: string;                      // unitatea, afișată lângă valoare (l, kg, km/h…)
  opts?: { v: string; l: string }[];
  hint?: string;
  super?: boolean;                 // doar super-admin (serverul le și elimină din body dacă nu ești)
};
export type SpecSection = { titlu: string; icon: IconName; campuri: SpecField[] };

export const SPEC_SECTIONS: SpecSection[] = [
  {
    titlu: 'Identificare', icon: 'idCard', campuri: [
      { k: 'name', l: 'Denumire' },
      { k: 'plate', l: 'Număr de înmatriculare' },
      // Valorile sunt cele DEJA stocate în bază (etichete în română, ca pe web și în lista mobilă existentă).
      // Traducerea lor în „car/van/truck" ar fi rescris tipul tuturor vehiculelor la prima salvare.
      { k: 'vehicle_type', l: 'Tip', t: 'select', opts: [
        { v: '', l: '— alege —' }, { v: 'Auto', l: 'Auto' }, { v: 'Camion', l: 'Camion' }, { v: 'Duba', l: 'Dubă' },
        { v: 'Motocicleta', l: 'Motocicletă' }, { v: 'Autobuz', l: 'Autobuz' }, { v: 'Utilaj', l: 'Utilaj' },
        { v: 'Remorca', l: 'Remorcă' }, { v: 'Altul', l: 'Altul' }] },
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
];

// Câmpurile rezervate super-adminului stau separat: serverul le elimină din body pentru ceilalți,
// deci afișarea lor tuturor ar fi o promisiune falsă.
export const SPEC_SUPER: SpecField[] = [
  { k: 'ignition_source', l: 'Sursă contact', t: 'select', super: true, opts: [
    { v: '', l: 'Automat (IO 239, implicit)' }, { v: 'din1', l: 'DIN1 (intrare digitală 1)' }],
    hint: 'Doar dacă contactul vine pe intrarea digitală, nu pe IO 239.' },
];

const gol = (v: any) => v === null || v === undefined || v === '';

// ─── Afișare (read-only) — arată DOAR ce e completat, ca fișa să nu fie un perete de liniuțe ───
export function VehicleSpecsView({ full }: { full: any }) {
  if (!full) return null;
  const sectiuni = SPEC_SECTIONS
    .map((s) => ({ s, c: s.campuri.filter((f) => !gol(full[f.k])) }))
    .filter((x) => x.c.length);
  if (!sectiuni.length) return null;

  const afiseaza = (f: SpecField, v: any) => {
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
    </>
  );
}

// ─── Editare — aceleași câmpuri, aceeași ordine ───
export function VehicleSpecsForm({ val, set, isSuper }: { val: Record<string, any>; set: (k: string, v: any) => void; isSuper?: boolean }) {
  const camp = (f: SpecField) => {
    const v = val[f.k] ?? '';
    if (f.t === 'select') {
      return (
        <div class="fld" key={f.k}>
          <label>{f.l}{f.super ? <span style="color:var(--accent);font-size:10px"> super-admin</span> : null}</label>
          <select value={String(v)} onChange={(e) => set(f.k, (e.target as HTMLSelectElement).value)}>
            {(f.opts || []).map((o) => <option value={o.v}>{o.l}</option>)}
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

  return (
    <>
      {SPEC_SECTIONS.map((s) => (
        <details key={s.titlu} open={s.titlu === 'Identificare'} style="border:1px solid var(--border);border-radius:11px;margin-bottom:9px;overflow:hidden">
          <summary style="padding:11px 13px;cursor:pointer;font-size:13px;font-weight:700;background:var(--bg-dark);display:flex;align-items:center;gap:8px">
            <Icon name={s.icon} size={15} color="var(--accent)" /> {s.titlu}
          </summary>
          <div style="padding:11px 13px 4px">{s.campuri.map(camp)}</div>
        </details>
      ))}
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

// Ia din fișa completă doar cheile editabile — restul (io_mappings, last_can, work_schedule…) au editoare proprii.
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
