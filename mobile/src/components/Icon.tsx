// Iconuri inline (SVG, stil Feather) — fără dependență de Font Awesome, ușor + offline.
type P = { name: IconName; size?: number; color?: string; style?: any; class?: string };
export type IconName =
  | 'car' | 'list' | 'chart' | 'bell' | 'search' | 'chevronR' | 'chevronL' | 'navigate'
  | 'route' | 'report' | 'cpu' | 'droplet' | 'disc' | 'clock' | 'gauge' | 'refresh'
  | 'x' | 'check' | 'logout' | 'layers' | 'alert' | 'calendar' | 'zap' | 'mapPin' | 'map' | 'wifiOff'
  | 'menu' | 'moon' | 'sun' | 'headset' | 'settings' | 'wrench' | 'user' | 'truck' | 'robot' | 'flame' | 'fileBar'
  | 'plus' | 'trash' | 'edit' | 'phone' | 'mail' | 'idCard' | 'sparkles' | 'coins';

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
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM20 14h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1zM17 19a3 3 0 0 1-3 2h-2"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20.5 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 4h6M8.5 14h.01M15.5 14h.01M9 17h6"/>',
  flame: '<path d="M12 2c2 4 6 5 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2.5-4.5 0 2 1 3 2 3 0-3 .5-6 1.5-8.5z"/>',
  fileBar: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 18v-3M12 18v-6M15 18v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  idCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M7 15h4M7 7h.01"/>',
  sparkles: '<path d="M12 3 L13.8 7.9 L18.7 9.7 L13.8 11.5 L12 16.4 L10.2 11.5 L5.3 9.7 L10.2 7.9 Z"/><path d="M19 13 L19.7 14.8 L21.5 15.5 L19.7 16.2 L19 18 L18.3 16.2 L16.5 15.5 L18.3 14.8 Z"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
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
