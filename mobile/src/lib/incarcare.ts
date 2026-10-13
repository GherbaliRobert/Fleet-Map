// Simulatorul de încărcare pe telefon: fila „Încărcare" din fișa vehiculului, semiremorcile și remorcile, filtrul pe fel.
// OGLINDA funcțiilor curate din pagină (public/index.html): blocul „fila Încărcare" (_incVizibile, _incObisnuite,
// _incDeTrimis), blocul „semiremorcile din flotă" (_remRandText, _remObisnuite) și blocul „felul vehiculului"
// (_VEH_FELURI, _vehFelul + markerCategory). verify_flota_incarcare.js le rulează pe amândouă pe aceleași cazuri —
// schimbi una pe web, o schimbi și aici.
// Cifrele obișnuite NU stau aici: vin de la server (GET /api/incarcare/meta, din incarcare.js).

export type FelVehicul = {
  id: string; et: string; caroserie?: boolean;
  lungime?: number; latime?: number; inaltime?: number; sarcina?: number;
  ampatament?: number; axaCaroserie?: number; sa?: number; taraFata?: number; taraSpate?: number;
};
export type TipRemorca = {
  id: string; et: string; lungime?: number; latime?: number; inaltime?: number; sarcina?: number; tara?: number;
  axe?: number; pivotAxe?: number; ampatament?: number; axaFata?: number; limitaAxe?: number;
};
export type IncMeta = {
  feluriVehicul: FelVehicul[];
  felRemorca: { id: string; et: string; cuplare: string }[];
  tipuriRemorca: Record<string, TipRemorca[]>;
  campuriCaroserie?: string[];
  tipuriCuMarfa?: string[];
};
export type Remorca = {
  id: number; company_id: number | null; company_name?: string; fel: string; tip: string | null; plate: string; model: string | null;
  lungime_m: number | null; latime_m: number | null; inaltime_m: number | null; sarcina_kg: number | null; tara_kg: number | null;
  nr_axe: number | null; pivot_axe_m: number | null; axa_fata_m: number | null; limita_axe_kg: number | null; imei: string | null; note: string | null;
};

// Adresele planurilor (pasul 4): șoferul își vede planul primit; dispecerul îl deschide în simulator. UNA fiecare —
// le folosesc lista, anunțurile și push-ul (lib/push.ts).
export const rutaPlanSofer = (id: number | string) => '/incarcare/plan/' + encodeURIComponent(String(id));
export const rutaPlanSimulator = (id: number | string) => '/incarcare?plan=' + encodeURIComponent(String(id));
export const RUTA_PLANURI = '/incarcare/planuri';

// Modulul „Simulator încărcare": al firmei (features.incarcare), iar noi îl avem mereu.
export function modulIncarcare(me: any): boolean {
  if (!me) return false;
  if (me.isSuper || me.role === 'superadmin') return true;
  return !!(me.features && me.features.incarcare === true);
}

// ─── Fila „Încărcare" ───
export const INC_CHEI: [string, keyof FelVehicul][] = [['inc_lungime', 'lungime'], ['inc_latime', 'latime'], ['inc_inaltime', 'inaltime'], ['inc_ampatament', 'ampatament'],
  ['inc_axa_caroserie', 'axaCaroserie'], ['inc_sa_axa', 'sa'], ['inc_tara_fata', 'taraFata'], ['inc_tara_spate', 'taraSpate']];
const INC_CAROSERIE = ['inc_lungime', 'inc_latime', 'inc_inaltime', 'inc_axa_caroserie'];
function felDin(meta: IncMeta | null | undefined, id: string): FelVehicul | null {
  return ((meta && meta.feluriVehicul) || []).find((f) => f.id === id) || null;
}
export function incVizibile(fel: string, meta: IncMeta | null | undefined) {
  const f = felDin(meta, fel), tractor = fel === 'autotractor';
  return { caroserie: !f || f.caroserie !== false, sa: tractor, felRemorca: tractor ? 'semiremorca' : 'remorca' };
}
export function incObisnuite(val: Record<string, any>, fel: string, felVechi: string, peste: boolean, meta: IncMeta | null | undefined): Record<string, any> {
  const out: Record<string, any> = { ...val }, f = felDin(meta, fel), v = felDin(meta, felVechi);
  if (!f) return out;
  const neatins = (cur: any, vechi: any) => cur === '' || cur == null || (vechi != null && Number(cur) === Number(vechi));
  for (const [col, k] of INC_CHEI) {
    if (f[k] == null) continue;
    if (peste || neatins(out[col], v ? v[k] : null)) out[col] = String(f[k]);
  }
  if (f.sarcina != null && neatins(out.payload, v ? v.sarcina : null)) out.payload = String(f.sarcina);
  return out;
}
export function incDeTrimis(val: Record<string, any>, fel: string, meta: IncMeta | null | undefined): Record<string, string | null> {
  const vz = incVizibile(fel, meta), out: Record<string, string | null> = { inc_fel: fel || null };
  for (const [col] of INC_CHEI) {
    let x = val[col] == null ? '' : String(val[col]).trim();
    if ((col === 'inc_sa_axa' && !vz.sa) || (INC_CAROSERIE.indexOf(col) >= 0 && !vz.caroserie)) x = '';
    out[col] = x === '' ? null : x;
  }
  out.inc_remorca_id = val.inc_remorca_id ? String(val.inc_remorca_id) : null;
  return out;
}
// Din fișa completă (/full) în căsuțe: NUMERIC vine ca „3.70" → „3.7".
export function incDinFull(full: any): Record<string, string> {
  const out: Record<string, string> = { inc_fel: (full && full.inc_fel) || '', inc_remorca_id: full && full.inc_remorca_id ? String(full.inc_remorca_id) : '' };
  for (const [col] of INC_CHEI) out[col] = full && full[col] != null && full[col] !== '' ? String(Number(full[col])) : '';
  return out;
}

// ─── Semiremorcile și remorcile ───
function cifra(n: any): string { return n == null || n === '' ? '' : Number(n).toLocaleString('ro-RO', { maximumFractionDigits: 2 }); }
export function remorcaText(r: Partial<Remorca>, meta: IncMeta | null | undefined): string {
  const fel = ((meta && meta.felRemorca) || []).find((x) => x.id === r.fel);
  const tip = (((meta && meta.tipuriRemorca) || {})[r.fel || ''] || []).find((t) => t.id === r.tip);
  const dim = (r.lungime_m && r.latime_m && r.inaltime_m) ? cifra(r.lungime_m) + ' × ' + cifra(r.latime_m) + ' × ' + cifra(r.inaltime_m) + ' m' : '';
  return [fel ? fel.et : (r.fel === 'remorca' ? 'Remorcă cu proțap' : 'Semiremorcă'), tip ? tip.et : (r.model || ''), dim].filter(Boolean).join(' · ');
}
const REM_DIN_TIP: [string, string][] = [['lungime_m', 'lungime'], ['latime_m', 'latime'], ['inaltime_m', 'inaltime'], ['sarcina_kg', 'sarcina'], ['tara_kg', 'tara'],
  ['nr_axe', 'axe'], ['pivot_axe_m', 'pivotAxe'], ['axa_fata_m', 'axaFata'], ['limita_axe_kg', 'limitaAxe']];
export function remorcaObisnuite(val: Record<string, any>, fel: string, tip: string, peste: boolean, meta: IncMeta | null | undefined): Record<string, any> {
  const out: Record<string, any> = { ...val };
  const t: any = (((meta && meta.tipuriRemorca) || {})[fel] || []).find((x) => x.id === tip);
  if (!t) return out;
  for (const [col, k] of REM_DIN_TIP) {
    const x = k === 'pivotAxe' ? (t.pivotAxe != null ? t.pivotAxe : t.ampatament) : t[k];
    if (x != null && (peste || out[col] === '' || out[col] == null)) out[col] = String(x);
  }
  return out;
}
export const REM_CAMPURI = ['lungime_m', 'latime_m', 'inaltime_m', 'sarcina_kg', 'tara_kg', 'nr_axe', 'pivot_axe_m', 'axa_fata_m', 'limita_axe_kg'];
// Rândul salvat → căsuțele formularului (text).
export function remorcaDinRand(r: Partial<Remorca> | null, fel: string): Record<string, string> {
  const out: Record<string, string> = { fel: (r && r.fel) || fel, tip: (r && r.tip) || '', plate: (r && r.plate) || '', model: (r && r.model) || '', note: (r && r.note) || '' };
  for (const k of REM_CAMPURI) { const v = r ? (r as any)[k] : null; out[k] = v == null ? '' : String(v); }
  return out;
}

// ─── Filtrul pe fel (lista de vehicule) ───
export const FELURI_FILTRU: [string, string, string[] | null][] = [
  ['auto', 'Autoturisme', ['car', 'electric', 'phev', 'hybrid', 'cng', 'ambulance', 'motorcycle']],
  ['duba', 'Dube', ['van']],
  ['camion', 'Camioane', ['truck', 'tir', 'mixer']],
  ['autotractor', 'Autotractoare', ['autotractor']],
  ['semiremorca', 'Semiremorci', []],
  ['remorca', 'Remorci', ['trailer', 'trailer_tech']],
  ['utilaj', 'Utilaje și tractoare', ['utilaj', 'tractor', 'excavator', 'forklift', 'combine', 'generator']],
  ['altele', 'Altele', null],
];
// Aceeași hartă ca markerCategory din pagină (iconița aleasă întâi, apoi felul din fișă). NU e desenul de pe telefon
// (vehCatOf are mai puține desene: autotractorul ia desenul de TIR) — filtrul trebuie să deosebească.
const PE_ICON: Record<string, string> = { car: 'car', van: 'van', truck: 'truck', tir: 'tir', bus: 'bus', motorcycle: 'motorcycle', utilaj: 'utilaj', tractor: 'tractor', trailer: 'trailer', autotractor: 'autotractor', trailer_tech: 'trailer_tech', excavator: 'excavator', forklift: 'forklift', combine: 'combine', mixer: 'mixer', generator: 'generator', boat: 'boat', ambulance: 'ambulance', electric: 'electric', phev: 'phev', hybrid: 'hybrid', cng: 'cng' };
const PE_TIP: Record<string, string> = {
  'Auto': 'car', 'Camion': 'truck', 'TIR': 'tir', 'Duba': 'van', 'Dubă': 'van',
  'Motocicleta': 'motorcycle', 'Motocicletă': 'motorcycle', 'Autobuz': 'bus',
  'Utilaj': 'utilaj', 'Remorca': 'trailer', 'Remorcă': 'trailer',
  'Autotractor': 'autotractor', 'Tractor': 'tractor', 'Remorcă tehnologică': 'trailer_tech', 'Remorca tehnologica': 'trailer_tech',
  'Buldoexcavator': 'excavator', 'Motostivuitor': 'forklift', 'Combină agricolă': 'combine', 'Combina agricola': 'combine',
  'Automixt': 'mixer', 'Grup electrogen': 'generator', 'Barcă': 'boat', 'Barca': 'boat', 'Ambulanță': 'ambulance', 'Ambulanta': 'ambulance',
  'Electric': 'electric', 'Plug-in hibrid': 'phev', 'Hibrid': 'hybrid', 'CNG/GPL': 'cng',
};
export function categorieMarker(d: { icon?: string | null; vehicle_type?: string | null } | null): string {
  if (d) {
    if (d.icon && PE_ICON[d.icon]) return PE_ICON[d.icon];
    if (d.vehicle_type && PE_TIP[d.vehicle_type]) return PE_TIP[d.vehicle_type];
  }
  return 'car';
}
export function felulVehiculului(d: any): string {
  if (d && d._remorca) return d.fel === 'remorca' ? 'remorca' : 'semiremorca';
  const c = categorieMarker(d);
  const g = FELURI_FILTRU.find((x) => x[2] && x[2].indexOf(c) >= 0);
  return g ? g[0] : 'altele';
}
