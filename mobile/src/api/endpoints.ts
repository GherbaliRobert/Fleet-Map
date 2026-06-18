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
  reportTypes: () => api<{ categories: { key: string; label: string }[]; reports: ReportTypeInfo[] }>('/api/reports'),
  runReport: (type: string, from: string, to: string, imeis?: string[]) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<ReportResult>(`/api/reports/${e(type)}${q}`);
  },
};
