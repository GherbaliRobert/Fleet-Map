// Flota administrată — ce folosesc împreună Mentenanța, Documentele, Șoferii, Grupele și fișa mașinii.
// Copia pe telefon a regulilor de AFIȘARE de pe web (public/index.html: mntState, mntLeftLabel, docState,
// docLeftLabel, markerCategory…). Regulile care contează — ce e „restant", ce e „expiră curând", cu ce
// preaviz — le calculează SERVERUL (_due, _days, _odo) și aici doar se traduc în cuvinte. Nicio listă de
// lucrări, de acte sau de clase scrisă aici: vin din maint_types.js, prin server.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE } from '../api/client';
import { Api } from '../api/endpoints';
import { token } from '../app/store';
import type { IconName } from './Icon';

export const LUNI = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function nf(n: any): string { return Number(n).toLocaleString('ro-RO'); }
// Comparare iertătoare, ca pe web (_mntNorm): fără diacritice, fără majuscule, fără spații de prisos.
export function norm(s: any): string {
  return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}
export function zi10(v: any): string | null { return v ? String(v).slice(0, 10) : null; }
// „12.03.2026" dintr-o dată de calendar (fără să alunece o zi din cauza fusului orar).
export function dataRo(v: any): string {
  const d = zi10(v); if (!d) return '';
  const t = new Date(d + 'T12:00:00');
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('ro-RO');
}
export function zile(n: number): string { return n + (n === 1 ? ' zi' : ' zile'); }

// ─── Flota, cu fișa completă (io_data, icon, driver_id, group_id) ───
// Serverul scoate deja vehiculele demo și, fără ?includeArchived, pe cele arhivate. Un singur cache pe
// minut pentru toate ecranele din zona asta, ca deschiderea lor una după alta să nu ceară flota de 5 ori.
// Cache-ul e AL CONTULUI (ca incarcaGrupe din locFlota): fondatorii ies și intră pe un cont de client pe același
// telefon, fără repornirea aplicației. Legat de token, lista contului de dinainte nu mai ajunge pe ecranul celui nou.
let _devs: any[] | null = null;
let _devsAt = 0;
let _devsTok: string | null = null;
let _devsP: Promise<any[]> | null = null;
let _devsPTok: string | null = null;
export function flota(force = false): Promise<any[]> {
  const tok = token.value;
  const alContului = _devsTok === tok;
  if (!force && alContului && _devs && Date.now() - _devsAt < 60000) return Promise.resolve(_devs);
  if (_devsP && _devsPTok === tok) return _devsP;
  const p: Promise<any[]> = Api.devices()
    .then((d) => {
      const l = (Array.isArray(d) ? d : []).filter((x: any) => x && x.imei && x.status !== 'archived');
      if (token.value === tok) { _devs = l; _devsAt = Date.now(); _devsTok = tok; }
      return l;
    })
    // La o eroare de rețea: lista veche doar dacă e a ACELUIAȘI cont; altfel nimic.
    .catch(() => (_devsTok === tok && _devs) || [])
    .finally(() => { if (_devsP === p) _devsP = null; });
  _devsP = p; _devsPTok = tok;
  return p;
}
export function uitaFlota() { _devsAt = 0; }

export function vehDe(devs: any[], imei: string): any | null { return devs.find((d) => d.imei === imei) || null; }
// Mașina se recunoaște după NUMĂR (web: mntPlate): numărul, altfel numele, altfel IMEI-ul.
export function numar(devs: any[], imei: string): string {
  const d = vehDe(devs, imei);
  return (d && d.plate) ? String(d.plate).trim() : ((d && d.name) ? String(d.name) : imei);
}
// Modelul se scrie DUPĂ număr, și doar dacă există amândouă (web: mntModel).
export function modelul(devs: any[], imei: string): string {
  const d = vehDe(devs, imei);
  return (d && d.plate && d.name) ? String(d.name) : '';
}
// Pentru selectoare: „B 12 ABC · Dacia Logan", ordonate după număr.
export function optiuniVehicule(devs: any[]): { value: string; label: string }[] {
  return devs
    .map((d) => {
      const nr = numar(devs, d.imei), md = modelul(devs, d.imei);
      return { value: d.imei, label: nr + (md ? ' · ' + md : '') };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ro'));
}

// Categoria vehiculului, ca pe hartă (web: markerCategory). Din ea se trage clasa de service.
const _CAT_ICON = new Set(['car', 'van', 'truck', 'tir', 'bus', 'motorcycle', 'utilaj', 'tractor', 'trailer', 'autotractor',
  'trailer_tech', 'excavator', 'forklift', 'combine', 'mixer', 'generator', 'boat', 'ambulance', 'electric', 'phev', 'hybrid', 'cng']);
const _CAT_TIP: Record<string, string> = {
  'Auto': 'car', 'Camion': 'truck', 'TIR': 'tir', 'Duba': 'van', 'Dubă': 'van',
  'Motocicleta': 'motorcycle', 'Motocicletă': 'motorcycle', 'Autobuz': 'bus',
  'Utilaj': 'utilaj', 'Remorca': 'trailer', 'Remorcă': 'trailer',
  'Autotractor': 'autotractor', 'Tractor': 'tractor', 'Remorcă tehnologică': 'trailer_tech', 'Remorca tehnologica': 'trailer_tech',
  'Buldoexcavator': 'excavator', 'Motostivuitor': 'forklift', 'Combină agricolă': 'combine', 'Combina agricola': 'combine',
  'Automixt': 'mixer', 'Grup electrogen': 'generator', 'Barcă': 'boat', 'Barca': 'boat', 'Ambulanță': 'ambulance', 'Ambulanta': 'ambulance',
  'Electric': 'electric', 'Plug-in hibrid': 'phev', 'Hibrid': 'hybrid', 'CNG/GPL': 'cng',
};
export function categorieHarta(dev: any): string {
  if (dev) {
    if (dev.icon && _CAT_ICON.has(dev.icon)) return dev.icon;
    if (dev.vehicle_type && _CAT_TIP[dev.vehicle_type]) return _CAT_TIP[dev.vehicle_type];
  }
  return 'car';
}

// Kilometrajul din datele CAN — regula din server.js (_odoFromIo): can_total_mileage e deja în km,
// total_odometer e în METRI.
export function odoDinIo(io: any): number | null {
  if (!io) return null;
  let km: number | null = null;
  if (io.can_total_mileage != null) km = parseFloat(io.can_total_mileage);
  else if (io.can_total_mileage_counted != null) km = parseFloat(io.can_total_mileage_counted);
  else if (io.total_odometer != null) km = parseFloat(io.total_odometer) / 1000;
  return (km != null && isFinite(km) && km > 0) ? Math.round(km) : null;
}

// ─── Catalogul de lucrări și acte (maint_types.js, servit de server) ───
export interface Clasa { key: string; label: string; art?: string; low?: string }
export interface Catalog {
  work: { type: string; icon: string; fam: string }[];
  docs: string[];
  classes: Clasa[];
  classMap: Record<string, string> | null; // categorie de hartă → clasă de service (car/van/truck)
}
let _cat: Catalog | null = null;
let _catP: Promise<Catalog> | null = null;

async function _text(path: string): Promise<string> {
  const url = API_BASE + path;
  if (Capacitor.isNativePlatform()) {
    const r: any = await CapacitorHttp.request({ url, method: 'GET', responseType: 'text' as any, connectTimeout: 15000, readTimeout: 30000 } as any);
    if (r.status < 200 || r.status >= 300) throw new Error('Eroare ' + r.status);
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('Eroare ' + r.status);
  return r.text();
}
// Sursa e aceeași pe care o încarcă web-ul (/js/maint-types.js = „window.RA_MAINT={…};"): tipurile, actele,
// clasele și harta categorie → clasă. Dacă nu se poate citi, cădem pe /api/maint-intervals (fără hartă:
// atunci aplicația nu propune scadențe și nu socotește acte lipsă, dar nu inventează nimic).
export function catalog(): Promise<Catalog> {
  if (_cat) return Promise.resolve(_cat);
  if (_catP) return _catP;
  const p = (async (): Promise<Catalog> => {
    try {
      const t = await _text('/js/maint-types.js');
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      const j = JSON.parse(t.slice(a, b + 1));
      if (j && Array.isArray(j.work)) {
        _cat = {
          work: j.work.map((w: any) => ({ type: String(w.type), icon: w.icon, fam: w.fam })),
          docs: Array.isArray(j.docs) ? j.docs.map(String) : [],
          classes: Array.isArray(j.classes) ? j.classes : [],
          classMap: j.classMap && typeof j.classMap === 'object' ? j.classMap : null,
        };
        return _cat;
      }
    } catch { /* cădem pe ruta JSON */ }
    try {
      const iv: any = await Api.maintIntervals();
      const c: Catalog = {
        work: (iv && Array.isArray(iv.rows) ? iv.rows : []).map((r: any) => ({ type: String(r.type), icon: r.icon, fam: r.fam })),
        docs: [],
        classes: (iv && Array.isArray(iv.classes)) ? iv.classes : [],
        classMap: (iv && iv.classMap && typeof iv.classMap === 'object') ? iv.classMap : null,
      };
      if (c.work.length) _cat = c; // doar un răspuns plin rămâne ținut minte
      return c;
    } catch { return { work: [], docs: [], classes: [], classMap: null }; }
  })().finally(() => { _catP = null; });
  _catP = p;
  return p;
}
// Clasa de service a mașinii (car / van / truck). null = nu se știe (catalog fără hartă).
export function clasaServis(dev: any, cat: Catalog | null): string | null {
  if (!cat || !cat.classMap) return null;
  return cat.classMap[categorieHarta(dev)] || 'truck';
}

// ─── Iconițe și culori (familiile f-* de pe web) ───
// Pe web iconițele sunt Font Awesome; pe telefon avem setul nostru. Harta de aici e doar de desen.
const _FA: Record<string, IconName> = {
  'fa-oil-can': 'oilCanDrop', 'fa-screwdriver-wrench': 'wrench', 'fa-car-burst': 'brakePad', 'fa-gears': 'gears',
  'fa-circle-half-stroke': 'clutchPedal', 'fa-compress': 'circleDot', 'fa-circle-notch': 'tire', 'fa-ruler-combined': 'steering',
  'fa-filter': 'filter', 'fa-car-battery': 'batteryPM', 'fa-droplet': 'droplet', 'fa-rotate': 'refresh',
  'fa-temperature-low': 'coolantTemp', 'fa-bolt': 'zap', 'fa-hammer': 'wrench', 'fa-spray-can-sparkles': 'sparkles',
  'fa-clipboard-check': 'check', 'fa-shield-halved': 'shield', 'fa-umbrella': 'shield', 'fa-road': 'route',
  'fa-certificate': 'idCard', 'fa-gauge': 'gauge', 'fa-box-open': 'truck', 'fa-file-contract': 'fileBar',
};
export function iconFa(fa: string | undefined, implicit: IconName): IconName { return (fa && _FA[fa]) || implicit; }
export function metaLucrare(cat: Catalog | null, type: string): { icon: IconName; fam: string } {
  const w = cat ? cat.work.find((x) => norm(x.type) === norm(type)) : null;
  return w ? { icon: iconFa(w.icon, 'wrench'), fam: w.fam || 'f-neutral' } : { icon: 'wrench', fam: 'f-neutral' };
}

// ─── Mentenanță (web: mntDone / mntState / mntLeftLabel / mntWhen / mntRepeat) ───
const KM_PE_ZI = 250; // doar pentru ordine: aduce „mai are 500 km" și „mai are 3 luni" la aceeași unitate
export function mntFacuta(m: any): boolean { return m.status === 'done' || m.status === 'completed' || !!m.done_date; }
// Zile de CALENDAR de azi până la data dată (omul numără zile, nu ore).
export function zilePana(d: string): number | null {
  const t = new Date(d + 'T00:00:00'); if (isNaN(t.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}
export function mntKmRamasi(m: any): number | null { return (m.due_km && m._odo) ? (m.due_km - m._odo) : null; }
export function mntZileRamase(m: any): number | null {
  const out: number[] = [];
  const d = zi10(m.due_date);
  if (d) { const z = zilePana(d); if (z != null) out.push(z); }
  if (m.due_km && m._odo) out.push(Math.round((m.due_km - m._odo) / KM_PE_ZI));
  return out.length ? Math.min.apply(null, out) : null;
}
// 'done' | 'over' | 'soon' | 'none' | 'ok'. Restanța și „curând" vin de la server (_due), cu preavizul firmei.
export function mntStare(m: any): string {
  if (mntFacuta(m)) return 'done';
  if (m._due === 'overdue') return 'over';
  if (m._due === 'due_soon') return 'soon';
  if (!zi10(m.due_date) && (!m.due_km || !m._odo)) return 'none';
  return 'ok';
}
function _peKm(m: any): boolean {
  const km = mntKmRamasi(m), d = zi10(m.due_date);
  if (km == null) return false;
  if (!d) return true;
  const z = zilePana(d);
  return z == null ? true : (km / KM_PE_ZI) < z;
}
export function mntCatMaiE(m: any): string {
  if (mntFacuta(m)) return 'făcută';
  const km = mntKmRamasi(m), d = zi10(m.due_date);
  if (_peKm(m) && km != null) return km < 0 ? 'depășit cu ' + nf(-km) + ' km' : 'mai sunt ' + nf(km) + ' km';
  if (!d) return m.due_km ? 'la ' + nf(m.due_km) + ' km' : 'fără termen';
  const z = zilePana(d);
  if (z == null) return '';
  if (z < 0) return 'depășit cu ' + zile(-z);
  if (z === 0) return 'azi';
  return 'peste ' + zile(z);
}
export function mntCand(m: any): string {
  if (mntFacuta(m)) {
    const dd = m.done_at || m.done_date;
    return [dd ? new Date(dd).toLocaleDateString('ro-RO') : '', m.done_km ? nf(m.done_km) + ' km' : ''].filter(Boolean).join(' · ');
  }
  const d = zi10(m.due_date);
  return [d ? dataRo(d) : '', m.due_km ? 'la ' + nf(m.due_km) + ' km' : ''].filter(Boolean).join(' · ');
}
export function mntRepeta(m: any): string {
  const p: string[] = [];
  if (m.interval_km) p.push(nf(m.interval_km) + ' km');
  if (m.interval_months) p.push(m.interval_months + (Number(m.interval_months) === 1 ? ' lună' : ' luni'));
  return p.join(' / ');
}
// „12 luni" spus omenește (web: _mntDurata).
export function durata(luni: any): string {
  const n = parseInt(luni) || 0;
  if (!n) return '';
  if (n === 1) return 'o lună';
  if (n < 12 || n % 12 !== 0) return n + ' luni';
  const a = n / 12;
  return a === 1 ? 'un an' : a + ' ani';
}
// E un ACT (ITP, RCA…) scris din greșeală ca lucrare? Lista de acte vine din catalog, plus sinonimele vechi.
export function esteAct(cat: Catalog | null, type: string): boolean {
  const lista = (cat ? cat.docs : []).concat(['Tahograf (verificare)', 'Rovinieta', 'Asigurare RCA']);
  const k = norm(type);
  return lista.some((d) => norm(d) === k);
}

// ─── Documente (web: docState / docDays / docLeftLabel) ───
// Starea vine de la server (_due), cu preavizul de acte al firmei („Avertisment acte"), nu cu 30 de zile
// bătute aici: dacă firma pune 14 sau 45 de zile, culoarea se mută odată cu alerta.
export function docStare(d: any): string { return d._due || (d.expiry_date ? 'ok' : 'none'); }
export function docZile(d: any): number | null {
  if (d._days != null) return d._days;
  const z = zi10(d.expiry_date);
  return z ? zilePana(z) : null;
}
export function docCatMaiE(d: any): string {
  const st = docStare(d), n = docZile(d);
  if (st === 'none') return 'fără dată';
  if (n == null) return '';
  if (n < 0) return 'expirat de ' + zile(-n);
  if (n === 0) return 'expiră azi';
  return (st === 'soon' ? 'expiră peste ' : 'mai are ') + zile(n);
}
// Clasa de culoare a rândului: aceleași patru stări ca la lucrări.
export const DOC_CLS: Record<string, string> = { expired: 'over', soon: 'soon', ok: 'done', none: 'none' };

// Costurile pe lună / an / total, din aceeași listă pentru toate trei cifrele (web: costCards).
export function costuri(list: any[], dataDe: (x: any) => string | null): { luna: number; an: number; total: number; year: number } {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  let luna = 0, an = 0, total = 0;
  for (const x of list) {
    const c = parseFloat(x.cost) || 0; if (!c) continue;
    total += c;
    const dd = dataDe(x); if (!dd) continue;
    const t = new Date(dd + 'T12:00:00');
    if (t.getFullYear() === y) { an += c; if (t.getMonth() === mo) luna += c; }
  }
  return { luna, an, total, year: y };
}

// Numărul de înmatriculare adus la o formă comparabilă: „B 268 ROY" = „B-268-ROY" = „b268roy".
export function cheieNumar(p: any): string { return String(p == null ? '' : p).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function vehDupaNumar(devs: any[], plate: any): any | null {
  const k = cheieNumar(plate); if (k.length < 4) return null;
  return devs.find((d) => cheieNumar(d.plate) === k) || null;
}
