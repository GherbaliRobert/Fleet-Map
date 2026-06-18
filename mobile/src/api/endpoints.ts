import { api } from './client';

export interface IO { ignition?: number; external_voltage?: number; gsm_signal?: number; can_total_mileage?: number; total_odometer?: number; can_fuel_level_liters?: number; fuel_level_liters?: number; [k: string]: any; }
export interface Position {
  imei: string; name?: string; plate?: string; speed?: number; latitude?: number; longitude?: number;
  angle?: number; timestamp?: string; satellites?: number; vehicle_type?: string; io?: IO; [k: string]: any;
}
export interface Me {
  username: string; role: string; permissions: Record<string, boolean>; companyId: number | null;
  isSuper?: boolean; company?: { id: number; name: string; is_demo?: boolean } | null;
  features?: Record<string, boolean>; sys?: { announcement?: string; offline_minutes?: number }; offline_minutes?: number;
}
export interface DailyStats {
  imei: string; totalKm: number; avgSpeed: number; maxSpeed: number; movingTime: number; stoppedTime: number;
  stops: number; fuelConsumed: number | null; engineHours: number | null; recordCount?: number;
}
export interface DeviceFull {
  imei: string; name?: string; plate?: string; brand?: string; model?: string; vehicle_type?: string;
  driver_name?: string | null; vin?: string; year?: number; [k: string]: any;
}
export interface NotificationItem {
  id: number; type: string; severity?: string; imei?: string | null; title?: string; body?: string;
  created_at?: string; acked_at?: string | null; data?: any;
}
export interface Group { id: number; name: string; color?: string; count?: number; }
export interface DocItem { id: number; imei?: string; doc_type?: string; expiry_date?: string; number?: string; [k: string]: any; }
export interface ReportTypeInfo { type: string; label: string; cat: string; }
export interface EventType { key: string; label: string; unit?: string; def?: number; threshold?: boolean; below?: boolean; }
export interface NotifPref { enabled: boolean; threshold?: number; email?: boolean; push?: boolean; }
export interface ReportChartDef { type: string; title: string; labels: string[]; datasets: { label: string; data: number[] }[]; }
export interface ReportResult { columns: string[]; rows: any[][]; summary: Record<string, any>; charts?: ReportChartDef[]; label?: string; type?: string; }

export const Api = {
  mobileLogin: (username: string, password: string, device?: string) =>
    api<{ token: string } & Me>('/api/mobile/login', { method: 'POST', auth: false, body: { username, password, device } }),
  me: () => api<Me>('/api/me'),
  live: () => api<Position[]>('/api/live'),
  deviceFull: (imei: string) => api<DeviceFull>(`/api/devices/${encodeURIComponent(imei)}/full`),
  dailyStats: (imei: string) => api<DailyStats>(`/api/stats/${encodeURIComponent(imei)}`),
  ioMappings: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/io-mappings`),
  fuelSensors: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/fuel-sensors`),
  history: (imei: string, from: string, to: string) => api<any[]>(`/api/history/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ext=1`),
  report: (imei: string, from: string, to: string) => api<any>(`/api/report/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  notifications: () => api<NotificationItem[]>('/api/notifications'),
  unreadCount: () => api<{ count: number }>('/api/notifications/unread-count'),
  ackNotification: (id: number) => api(`/api/notifications/${id}/ack`, { method: 'POST' }),
  ackAll: () => api('/api/notifications/ack-all', { method: 'POST' }),
  groups: () => api<Group[]>('/api/groups'),
  documents: () => api<DocItem[]>('/api/documents'),
  registerDevice: (token: string, platform: string) => api('/api/push/device', { method: 'POST', body: { token, platform } }),
  unregisterDevice: (token: string) => api('/api/push/device/unregister', { method: 'POST', body: { token } }),
  fuelStats: (from: string, to: string, imeis?: string[]) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}&bucket=day`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<any>(`/api/fuel-stats${q}`);
  },
  weeklyLatest: () => api<{ report: any | null; enabled?: boolean; canManage?: boolean; note?: string }>('/api/weekly-report/latest'),
  weeklyGenerate: () => api<{ ok: boolean; report: any }>('/api/weekly-report/generate', { method: 'POST', body: {} }),
  support: (message: string) => api('/api/support', { method: 'POST', body: { message } }),
  // ── Administrare (CRUD) ──
  drivers: () => api<any[]>('/api/drivers'),
  driversLite: () => api<any[]>('/api/drivers/lite'),
  createDriver: (b: any) => api('/api/drivers', { method: 'POST', body: b }),
  updateDriver: (id: number, b: any) => api(`/api/drivers/${id}`, { method: 'PUT', body: b }),
  deleteDriver: (id: number) => api(`/api/drivers/${id}`, { method: 'DELETE' }),
  groupsAll: () => api<any[]>('/api/groups'),
  createGroup: (b: any) => api('/api/groups', { method: 'POST', body: b }),
  updateGroup: (id: number, b: any) => api(`/api/groups/${id}`, { method: 'PUT', body: b }),
  deleteGroup: (id: number) => api(`/api/groups/${id}`, { method: 'DELETE' }),
  maintenance: () => api<any[]>('/api/maintenance'),
  createMaintenance: (b: any) => api('/api/maintenance', { method: 'POST', body: b }),
  updateMaintenance: (id: number, b: any) => api(`/api/maintenance/${id}`, { method: 'PUT', body: b }),
  deleteMaintenance: (id: number) => api(`/api/maintenance/${id}`, { method: 'DELETE' }),
  updateDevice: (imei: string, b: any) => api(`/api/devices/${encodeURIComponent(imei)}`, { method: 'PUT', body: b }),
  assignDevice: (imei: string, driver_id: number | null, group_id: number | null) => api(`/api/devices/${encodeURIComponent(imei)}/assign`, { method: 'PUT', body: { driver_id, group_id } }),
  alerts: () => api<any[]>('/api/alerts'),
  createAlert: (b: any) => api('/api/alerts', { method: 'POST', body: b }),
  deleteAlert: (id: number) => api(`/api/alerts/${id}`, { method: 'DELETE' }),
  users: () => api<any[]>('/api/users'),
  createUser: (b: any) => api('/api/users', { method: 'POST', body: b }),
  updateUser: (id: number, b: any) => api(`/api/users/${id}`, { method: 'PUT', body: b }),
  deleteUser: (id: number) => api(`/api/users/${id}`, { method: 'DELETE' }),
  eventTypes: () => api<EventType[]>('/api/event-types'),
  notifPrefs: () => api<{ types?: Record<string, NotifPref> }>('/api/notification-prefs'),
  saveNotifPrefs: (types: Record<string, NotifPref>) => api('/api/notification-prefs', { method: 'PUT', body: { types } }),
  reportTypes: () => api<{ categories: { key: string; label: string }[]; reports: ReportTypeInfo[] }>('/api/reports'),
  runReport: (type: string, from: string, to: string, imeis?: string[]) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<ReportResult>(`/api/reports/${e(type)}${q}`);
  },
};
