// Iconuri inline (SVG, stil Feather) — fără dependență de Font Awesome, ușor + offline.
type P = { name: IconName; size?: number; color?: string; style?: any; class?: string };
export type IconName =
  | 'car' | 'list' | 'chart' | 'bell' | 'search' | 'chevronR' | 'chevronL' | 'navigate'
  | 'route' | 'report' | 'cpu' | 'droplet' | 'disc' | 'clock' | 'gauge' | 'refresh'
  | 'x' | 'check' | 'logout' | 'layers' | 'alert' | 'calendar' | 'zap' | 'mapPin' | 'map' | 'wifiOff';

const P: Record<IconName, string> = {
  car: '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14M5 11v6m14-6v6M6 17h2m8 0h2M7 14h.01M17 14h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chevronR: '<path d="M9 18l6-6-6-6"/>',
  chevronL: '<path d="M15 18l-6-6 6-6"/>',
  navigate: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h7"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  droplet: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gauge: '<path d="M12 13l4-4M3.5 18a9 9 0 1 1 17 0z"/>',
  refresh: '<path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L21 8M20.5 15a9 9 0 0 1-14.8 3.4L3 16"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15"/>',
  wifiOff: '<path d="M1 1l22 22M16.7 11.1A6 6 0 0 1 19 13M5 13a10 10 0 0 1 5.2-2.7M2 8.8a16 16 0 0 1 4.5-2.6M12 20h.01"/>',
};

export function Icon({ name, size = 22, color = 'currentColor', style, class: cls }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} stroke-width={2} stroke-linecap="round" stroke-linejoin="round"
      class={cls} style={style}
      dangerouslySetInnerHTML={{ __html: P[name] }}
    />
  );
}
