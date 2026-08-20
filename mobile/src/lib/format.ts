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
  // CAN-ul (odometru real din bord) prioritar; total_odometer (GPS device, de la instalare) doar fallback.
  // Valorile CAN pot veni ca STRINGURI („32685.7") → parseFloat, NU typeof==='number' (care le respingea → cădea pe GPS).
  const cm = parseFloat(io.can_total_mileage);
  if (isFinite(cm) && cm > 0) return Math.round(cm);
  const cmc = parseFloat(io.can_total_mileage_counted);
  if (isFinite(cmc) && cmc > 0) return Math.round(cmc);
  const td = parseFloat(io.total_odometer);
  if (isFinite(td)) return Math.round(td / 1000);
  return null;
}
export function voltageStr(io?: any): string | null {
  if (io && typeof io.external_voltage === 'number' && io.external_voltage > 0) return (io.external_voltage / 1000).toFixed(2) + ' V';
  return null;
}

// Căutarea vehiculelor, într-un singur loc (oglinda lui raCauta din aplicația web).
// Numărul de înmatriculare se scrie cu spații („B 154 UIP"), dar omul îl tastează cum îi vine:
// „b154uip", „B-154-UIP". Înainte, oricare dintre variante nu găsea nimic — și părea că mașina
// nu e în aplicație. Scoatem spații, cratime, puncte și diacritice din AMÂNDOUĂ părțile.
// „dacia logan" rămâne găsit: devine „dacialogan", iar numele devine „dacialogan3".
export function raNorm(x: any): string {
  return String(x == null ? '' : x).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-\._\/]/g, '');
}
export function raCauta(q: any, ...campuri: any[]): boolean {
  const nq = raNorm(q);
  if (!nq) return true;
  return raNorm(campuri.join(' ')).indexOf(nq) >= 0;
}
