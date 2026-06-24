// Format uman: „X ore și Y minute" (ex. „1 oră și 59 minute", „0 minute", „2 ore").
export function fmtDuration(sec?: number): string {
  if (!sec || sec < 0) return '0 minute';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const hp = h === 1 ? '1 oră' : h + ' ore';
  const mp = m === 1 ? '1 minut' : m + ' minute';
  if (h > 0 && m > 0) return hp + ' și ' + mp;
  if (h > 0) return hp;
  return mp;
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
export function fmtAgo(iso?: string): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'acum';
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} h`;
  return `acum ${Math.floor(h / 24)} zile`;
}
export function gpsQuality(sats?: number): { label: string; level: number } {
  const s = sats || 0;
  if (s >= 10) return { label: 'Excelent', level: 3 };
  if (s >= 7) return { label: 'Bun', level: 2 };
  if (s >= 4) return { label: 'Slab', level: 1 };
  return { label: 'Fără semnal', level: 0 };
}
export function gsmQuality(sig?: number): { label: string; level: number } {
  const s = sig || 0;
  if (s >= 4) return { label: 'Excelent', level: 3 };
  if (s >= 3) return { label: 'Bun', level: 2 };
  if (s >= 1) return { label: 'Slab', level: 1 };
  return { label: 'Fără semnal', level: 0 };
}
export function odometerKm(io?: any): number | null {
  if (!io) return null;
  if (typeof io.can_total_mileage === 'number') return Math.round(io.can_total_mileage);
  if (typeof io.total_odometer === 'number') return Math.round(io.total_odometer / 1000);
  return null;
}
export function voltageStr(io?: any): string | null {
  if (io && typeof io.external_voltage === 'number' && io.external_voltage > 0) return (io.external_voltage / 1000).toFixed(2) + ' V';
  return null;
}
