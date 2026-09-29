// Localizare pe telefon: stările din cadrane, alegerea vehiculelor de pe hartă și grupele pentru alegere.
// Oglinda ecranului Localizare de pe web (public/index.html → vehMoving/vehPornit…, public/js/map-tools.js).
//
// DE CE un fișier separat de lib/status.ts: `statusOf` de acolo colorează markerele și cardurile (verde /
// galben / roșu / gri, cu „ține minte mișcarea" 2,5 min). Cadranele de pe web numără ALTFEL (Pornit /
// În mișcare / Staționat / Oprit, fără histerezis, iar „fără semnal" intră la „Oprit"). Fondatorii au cerut
// ca telefonul și web-ul să arate aceleași cifre — deci numărătoarea e nouă, iar culorile markerelor rămân.
import { signal, effect } from '@preact/signals';
import type { Position } from '../api/endpoints';
import { Api } from '../api/endpoints';
import { token } from '../app/store';

// ─── Stările, exact ca pe web ───
// online = a transmis în fereastra „fără semnal" a firmei (offline_minutes, implicit 65)
// proaspăt = a transmis în ultimele 3 minute (viteza unui pachet vechi nu mai înseamnă „în mișcare")
function varsta(p: Position): number {
  if (!p || !p.timestamp) return Infinity;
  const t = new Date(p.timestamp).getTime();
  return isNaN(t) ? Infinity : Date.now() - t;
}
export function eOnline(p: Position, offlineMin: number): boolean { return varsta(p) < (offlineMin || 65) * 60000; }
function eProaspat(p: Position): boolean { return varsta(p) < 180000; }
function areContact(p: Position, offlineMin: number): boolean {
  const ig = p && p.io && (p.io.ignition === 1 || (p.io.ignition as any) === true);
  return !!ig && eOnline(p, offlineMin);
}
export function vehMiscare(p: Position, off: number): boolean { return eOnline(p, off) && (Number(p.speed) || 0) > 3 && eProaspat(p); }
export function vehStationat(p: Position, off: number): boolean { return eOnline(p, off) && !vehMiscare(p, off) && areContact(p, off); }
export function vehPornit(p: Position, off: number): boolean { return eOnline(p, off) && (vehMiscare(p, off) || areContact(p, off)); }
export function vehOprit(p: Position, off: number): boolean { return !vehPornit(p, off); }

export type StareFiltru = 'all' | 'pornit' | 'moving' | 'stationat' | 'oprit';
export function potrivesteStarea(p: Position, f: StareFiltru, off: number): boolean {
  if (f === 'pornit') return vehPornit(p, off);
  if (f === 'moving') return vehMiscare(p, off);
  if (f === 'stationat') return vehStationat(p, off);
  if (f === 'oprit') return vehOprit(p, off);
  return true;
}
export interface NumarStari { total: number; pornit: number; moving: number; stationat: number; oprit: number; }
export function numaraStari(list: Position[], off: number): NumarStari {
  const c: NumarStari = { total: list.length, pornit: 0, moving: 0, stationat: 0, oprit: 0 };
  for (const p of list) {
    if (vehMiscare(p, off)) c.moving++;
    if (vehStationat(p, off)) c.stationat++;
    if (vehPornit(p, off)) c.pornit++; else c.oprit++;
  }
  return c;
}
// Cadranele, cu etichetele și culorile de pe web (public/css/app.css → .stat-chip.*).
export const CADRANE: { k: Exclude<StareFiltru, 'all'>; label: string; culoare: string }[] = [
  { k: 'pornit', label: 'Pornit', culoare: 'var(--green)' },
  { k: 'moving', label: 'În mișcare', culoare: 'var(--orange)' },
  { k: 'stationat', label: 'Staționat', culoare: 'var(--yellow)' },
  { k: 'oprit', label: 'Oprit', culoare: 'var(--red)' },
];
// Legăturile venite din alte ecrane (/vehicles?status=…) — Statistici trimite numele de aici (moving /
// stationat / oprit), iar „Fără semnal" / „Offline" își deschid acolo lista lor, pe nume.
// NU traducem „offline" sau „stopped" în „oprit": „Oprit" de aici cuprinde și mașinile fără semnal (ca pe web),
// deci cine apăsa „Fără semnal: 3" ar fi ajuns pe „Oprit: 12" — alt set, cu altă cifră, fără să i se spună.
// Un nume necunoscut deschide lista întreagă, cu „Total vehicule" aprins: se vede că nu e filtrată.
export function stareDinAdresa(s: string): StareFiltru | null {
  switch (s) {
    case 'all': return 'all';
    case 'pornit': return 'pornit';
    case 'moving': return 'moving';
    case 'idle': case 'stationat': return 'stationat';
    case 'oprit': return 'oprit';
    default: return null;
  }
}

// ─── Alegerea vehiculelor de pe hartă ───
// null = toată flota. Ține doar cât e deschisă aplicația (ca pe web, unde ține cât e deschisă pagina) —
// nu se salvează nicăieri. La schimbarea contului se golește: IMEI-urile altui cont ar ascunde tot.
export const mapSel = signal<Set<string> | null>(null);
let _tokAnterior: string | null | undefined;
effect(() => {
  const t = token.value;
  if (_tokAnterior !== undefined && t !== _tokAnterior) mapSel.value = null;
  _tokAnterior = t;
});
export function eAles(imei: string): boolean { const s = mapSel.value; return !s || s.has(imei); }
// Bifează/debifează câteva vehicule. `toate` = flota curentă (prima bifă pornește de la „toate alese").
export function schimbaAlegerea(imeis: string[], alese: boolean, toate: string[]) {
  const s = new Set(mapSel.value || toate);
  for (const i of imeis) { if (alese) s.add(i); else s.delete(i); }
  // Toată flota bifată la loc = nicio alegere (pastila și banda dispar singure).
  mapSel.value = toate.every((i) => s.has(i)) ? null : s;
}

// ─── Grupele, pentru lista cu bife ───
// /api/groups (nume + culoare) + /api/devices (grupa fiecărui vehicul). Pozițiile live NU au grupa,
// deci legătura se face după IMEI. Ținute 30 s, ca pe web.
export interface GrupeFlota { grupe: { id: number; name: string; color?: string }[]; grupaDupaImei: Record<string, number>; }
export const grupeFlota = signal<GrupeFlota | null>(null);
let _grupeTs = 0;
let _grupeTok: string | null = null;
export async function incarcaGrupe(force = false) {
  if (!force && grupeFlota.value && _grupeTok === token.value && Date.now() - _grupeTs < 30000) return;
  const tok = token.value;
  const [g, d] = await Promise.all([
    Api.groups().catch(() => [] as any[]),
    Api.devices().catch(() => [] as any[]),
  ]);
  if (token.value !== tok) return;
  const grupaDupaImei: Record<string, number> = {};
  for (const x of (Array.isArray(d) ? d : [])) if (x && x.imei && x.group_id != null) grupaDupaImei[x.imei] = Number(x.group_id);
  grupeFlota.value = { grupe: (Array.isArray(g) ? g : []) as any, grupaDupaImei };
  _grupeTs = Date.now(); _grupeTok = tok;
}
