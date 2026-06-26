// Statusul vehiculului — portat din public/js/vehicle-popup.js (liveBits) ca să se potrivească cu web-ul.
import type { Position } from '../api/endpoints';

export type Status = 'moving' | 'idle' | 'stopped' | 'offline';
export interface StatusInfo { status: Status; color: string; label: string; }

export function isOnline(p: Position, offlineMinutes: number): boolean {
  if (!p.timestamp) return false;
  return (Date.now() - new Date(p.timestamp).getTime()) < (offlineMinutes || 65) * 60000;
}

export function statusOf(p: Position, offlineMinutes: number): StatusInfo {
  const speed = p.speed || 0;
  const ign = !!(p.io && (p.io.ignition === 1 || (p.io.ignition as any) === true));
  if (!isOnline(p, offlineMinutes)) return { status: 'offline', color: 'var(--text-muted)', label: 'Fără transmisie' };
  // „În mișcare" (verde) DOAR dacă a transmis recent (<3 min). Viteză>3 dintr-un pachet vechi (semnal pierdut
  // în mers) → galben, ca pe web (marker + listă + fișă). Pragul >3 km/h filtrează jitterul GPS de 1-2 km/h
  // (identic cu web-ul). Evită falsul „merge live".
  const freshLive = p.timestamp ? (Date.now() - new Date(p.timestamp).getTime()) < 180000 : false;
  if (speed > 3 && freshLive) return { status: 'moving', color: 'var(--green)', label: 'În mișcare' };
  if (speed > 3) return { status: 'idle', color: 'var(--yellow)', label: 'Semnal pierdut' };
  if (ign) return { status: 'idle', color: 'var(--yellow)', label: 'Staționat' };
  return { status: 'stopped', color: 'var(--red)', label: 'Oprit' };
}

export interface Counts { total: number; moving: number; idle: number; stopped: number; offline: number; }
export function countByStatus(list: Position[], offlineMinutes: number): Counts {
  const c: Counts = { total: list.length, moving: 0, idle: 0, stopped: 0, offline: 0 };
  for (const p of list) c[statusOf(p, offlineMinutes).status]++;
  return c;
}

// Tahograful (Reg. UE 561/2006 + 165/2014) e obligatoriu DOAR pe vehicule grele de marfă
// (>3.5t) și autobuze/autocare — NU pe autoturisme, motociclete, dube ușoare, utilaje sau
// remorci. Categoria vine din fișa vehiculului (`vehicle_type`):
// Auto / Camion / Duba / Motocicleta / Autobuz / Utilaj / Remorca / Altul.
const TACHO_CATEGORIES = ['camion', 'tir', 'autobuz', 'autocar'];
export function usesTachograph(vehicleType?: string | null): boolean {
  const t = String(vehicleType || '').trim().toLowerCase();
  return TACHO_CATEGORIES.includes(t);
}
