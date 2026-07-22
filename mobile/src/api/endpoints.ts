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
  stops: number; fuelConsumed: number | null; fuelEstimated?: boolean; engineHours: number | null; recordCount?: number;
  engineOnTime?: number; date?: string; lastIgnitionOn?: string | null;
}
export interface DeviceFull {
  imei: string; name?: string; plate?: string; brand?: string; model?: string; vehicle_type?: string;
  driver_name?: string | null; vin?: string; year?: number; [k: string]: any;
}
export interface NotificationItem {
  id: number; type: string; severity?: string; imei?: string | null; title?: string; body?: string;
  created_at?: string; acknowledged?: boolean; data?: any;
}
export interface Group { id: number; name: string; color?: string; count?: number; }
export interface DocItem { id: number; imei?: string; doc_type?: string; expiry_date?: string; number?: string; [k: string]: any; }
export interface ReportTypeInfo { type: string; label: string; cat: string; desc?: string; }
export interface EventType { key: string; label: string; unit?: string; def?: number; threshold?: boolean; below?: boolean; }
export interface NotifPref { enabled: boolean; threshold?: number; email?: boolean; push?: boolean; }
export interface ReportChartDef { type: string; title: string; labels: string[]; datasets: { label: string; data: number[] }[]; }
export interface ReportPerVehicle { vehicul?: string; name?: string; imei?: string; summary?: [string, any][]; charts?: ReportChartDef[]; rows?: any[][]; }
export interface ReportLegend { title?: string; items: [string, string][]; }
export interface ReportResult { columns: string[]; rows: any[][]; summary: Record<string, any>; charts?: ReportChartDef[]; label?: string; type?: string; perVehicle?: ReportPerVehicle[]; legend?: ReportLegend; }
export interface AgentFinding { id?: number; agent?: string; severity?: string; title?: string; body?: string; imei?: string | null; fkey?: string; status?: string; created_at?: string; }

// Opțiuni de raport (eșantionare, OSM, locație, zile/ore etc.) → query string. Ignoră valorile goale.
export type ReportOpts = Record<string, string | number | boolean | undefined>;
export function reportOptsQuery(opts?: ReportOpts): string {
  if (!opts) return '';
  const e = encodeURIComponent;
  return Object.entries(opts).filter(([, v]) => v != null && v !== '').map(([k, v]) => `&${e(k)}=${e(String(v))}`).join('');
}

export const Api = {
  mobileLogin: (username: string, password: string, device?: string) =>
    api<{ token: string } & Me>('/api/mobile/login', { method: 'POST', auth: false, body: { username, password, device } }),
  me: () => api<Me>('/api/me'),
  live: () => api<Position[]>('/api/live'),
  devices: () => api<any[]>('/api/devices'), // roster: toate vehiculele înregistrate (apar și cele fără transmisie)
  deviceFull: (imei: string) => api<DeviceFull>(`/api/devices/${encodeURIComponent(imei)}/full`),
  dailyStats: (imei: string) => api<DailyStats>(`/api/stats/${encodeURIComponent(imei)}`),
  ioMappings: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/io-mappings`),
  fuelSensors: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/fuel-sensors`),
  history: (imei: string, from: string, to: string) => api<any[]>(`/api/history/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ext=1`),
  report: (imei: string, from: string, to: string) => api<any>(`/api/report/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  roadLimits: (points: [number, number][]) => api<{ limits: (number | null)[]; attribution: string; ways: number }>('/api/road-limits', { method: 'POST', body: { points } }),
  notifications: () => api<NotificationItem[]>('/api/notifications'),
  unreadCount: () => api<{ count: number }>('/api/notifications/unread-count'),
  ackNotification: (id: number) => api(`/api/notifications/${id}/ack`, { method: 'POST' }),
  notifContext: (id: number | string) => api<any>(`/api/notifications/${id}/context`),
  ackAll: () => api('/api/notifications/ack-all', { method: 'POST' }),
  groups: () => api<Group[]>('/api/groups'),
  documents: () => api<DocItem[]>('/api/documents'),
  createDocument: (b: any) => api('/api/documents', { method: 'POST', body: b }),
  deleteDocument: (id: number) => api(`/api/documents/${id}`, { method: 'DELETE' }),
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
  companies: () => api<any[]>('/api/companies'), // super-admin: pentru etichete + filtru pe companie
  // ── Super-admin: Companii (CRUD + abonament/features/plăți = și „Conturi & Abonamente" + „config Agenți AI") ──
  createCompany: (b: any) => api<any>('/api/companies', { method: 'POST', body: b }),
  updateCompany: (id: number, b: any) => api<any>(`/api/companies/${id}`, { method: 'PUT', body: b }),
  deleteCompany: (id: number) => api<any>(`/api/companies/${id}`, { method: 'DELETE' }),
  companyOverview: (id: number) => api<any>(`/api/companies/${id}/overview`),
  setCompanyFeatures: (id: number, features: Record<string, boolean>) => api<any>(`/api/companies/${id}/features`, { method: 'PUT', body: { features } }),
  setCompanyAiLimit: (id: number, limit: number) => api<any>(`/api/companies/${id}/ai-limit`, { method: 'PUT', body: { limit } }),
  setCompanyPlan: (id: number, plan: string) => api<any>(`/api/companies/${id}/plan`, { method: 'PUT', body: { plan } }),
  companyPayments: (id: number) => api<any[]>(`/api/companies/${id}/payments`),
  setCompanyAccess: (id: number, until: number) => api<any>(`/api/companies/${id}/access`, { method: 'PUT', body: { until } }),
  // ── Super-admin: Dashboard platformă ──
  adminOverview: (days = 30) => api<any>(`/api/admin/overview?days=${days}`),
  adminCounts: () => api<any>('/api/admin/counts'),
  adminErrors: (limit = 50) => api<any[]>(`/api/admin/errors?limit=${limit}`),
  clearAdminErrors: () => api('/api/admin/errors', { method: 'DELETE' }),
  liveStats: () => api<any>('/api/debug/live-stats'),
  backupStatus: () => api<any>('/api/admin/backup/status'),
  backupRun: () => api<any>('/api/admin/backup/run', { method: 'POST' }),
  // ── Card combustibil (alimentări + reconciliere) ──
  fuelTransactions: () => api<any[]>('/api/fuel-transactions'),
  addFuelTx: (b: any) => api<any>('/api/fuel-transactions', { method: 'POST', body: b }),
  importFuelCsv: (csv: string) => api<any>('/api/fuel-transactions/import', { method: 'POST', body: { csv } }),
  reconcileFuel: () => api<any>('/api/fuel-transactions/reconcile', { method: 'POST' }),
  deleteFuelTx: (id: number) => api(`/api/fuel-transactions/${id}`, { method: 'DELETE' }),
  // ── Super-admin: Control costuri ──
  costs: () => api<any>('/api/admin/costs'),
  createCost: (b: any) => api<any>('/api/admin/costs', { method: 'POST', body: b }),
  updateCost: (id: number, b: any) => api<any>(`/api/admin/costs/${id}`, { method: 'PUT', body: b }),
  deleteCost: (id: number) => api<any>(`/api/admin/costs/${id}`, { method: 'DELETE' }),
  markCostPaid: (id: number, b?: any) => api<any>(`/api/admin/costs/${id}/paid`, { method: 'POST', body: b || {} }),
  costRailway: () => api<any>('/api/admin/costs/railway'),
  costCloudflare: () => api<any>('/api/admin/costs/cloudflare'),
  costAnthropic: () => api<any>('/api/admin/costs/anthropic'),
  costGa: () => api<any>('/api/admin/costs/ga'),        // Google Analytics (GA4) — date live, $0
  costGsc: () => api<any>('/api/admin/costs/gsc'),      // Google Search Console — date live, $0
  adminFinance: (months = 12) => api<any>(`/api/admin/finance?months=${months}`),
  // ── Module + Setări (companie) ──
  hotspot: (from: string, to: string, imeis?: string[], mode = 'stops', stopMin = 5) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}&mode=${mode}&stopMin=${stopMin}`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<[number, number, number][]>(`/api/hotspot${q}`);
  },
  // Analiză zonă desenată (poligon/cerc) → vizite pe vehicul. imei opțional (gol = toată flota).
  zoneReport: (zone: any, from: string, to: string, imei?: string) =>
    api<any>('/api/zone-report', { method: 'POST', body: imei ? { zone, from, to, imei } : { zone, from, to } }),
  etollCosts: (imei?: string, days = 30) => api<any>(`/api/etoll/costs?days=${days}${imei ? '&imei=' + encodeURIComponent(imei) : ''}`),
  etollProviders: () => api<any>('/api/etoll/providers'),
  etollSetProvider: (provider: string) => api<any>('/api/etoll/provider', { method: 'PUT', body: { provider } }), // super-admin
  demoConfig: () => api<any>('/api/demo-modules/config'),
  fuelPrices: () => api<any>('/api/fuel-prices'),
  fuelPriceHistory: (days: number) => api<any>('/api/fuel-price-history?days=' + (days || 90)),
  setFuelPrices: (b: any) => api<any>('/api/company/fuel-prices', { method: 'PUT', body: b }),
  refreshFuelPrices: () => api<any>('/api/admin/fuel-prices/refresh', { method: 'POST', body: {} }), // super-admin
  companySettings: () => api<any>('/api/companies/me/settings'),
  saveCompanySettings: (b: any) => api<any>('/api/companies/me/settings', { method: 'PUT', body: b }),
  // ── Super-admin: Ofertare Live ──
  offers: () => api<any[]>('/api/admin/offers'),
  createOffer: (b: any) => api<any>('/api/admin/offers', { method: 'POST', body: b }),
  updateOffer: (id: number, b: any) => api<any>(`/api/admin/offers/${id}`, { method: 'PUT', body: b }),
  deleteOffer: (id: number) => api<any>(`/api/admin/offers/${id}`, { method: 'DELETE' }),
  // ── Super-admin: Dispozitive (global) ──
  adminDevices: () => api<any[]>('/api/admin/devices'),
  unassignedDevices: () => api<any[]>('/api/unassigned-devices'),
  createDevice: (fields: any) => api<any>('/api/devices', { method: 'POST', body: fields }), // super: pre-înregistrează IMEI în allow-list (mod strict)
  moveDevice: (imei: string, company_id: number | null) => api<any>(`/api/devices/${encodeURIComponent(imei)}/company`, { method: 'PUT', body: { company_id } }),
  // ── Dispozitive arhivate (super: toate; admin: ale companiei) ──
  archivedDevices: () => api<any[]>('/api/archived-devices'),
  restoreDevice: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/status`, { method: 'PUT', body: { status: 'active' } }),
  deleteDevice: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}`, { method: 'DELETE' }),
  // ── Facturare ──
  payments: (limit = 500) => api<{ payments: any[]; total: number }>(`/api/payments?limit=${limit}`), // super-admin: toate plățile + total
  recordPayment: (companyId: number, b: any) => api<any>(`/api/companies/${companyId}/payment`, { method: 'POST', body: b }),
  myInvoices: () => api<any>('/api/billing/my-invoices'), // admin firmă: facturile proprii + status abonament
  // ── Facturi FISCALE (super-admin) ──
  invoices: () => api<{ invoices: any[] }>('/api/invoices'),
  invoice: (id: number) => api<any>(`/api/invoices/${id}`),
  invoiceDraft: (companyId: number) => api<any>('/api/invoices/draft', { method: 'POST', body: { companyId } }),
  issueInvoice: (b: any) => api<any>('/api/invoices', { method: 'POST', body: b }),
  invoiceSetStatus: (id: number, status: string) => api<any>(`/api/invoices/${id}/status`, { method: 'PUT', body: { status } }),
  invoiceEfacturaSend: (id: number) => api<any>(`/api/invoices/${id}/efactura`, { method: 'POST', body: {} }),
  invoicePayLink: (id: number) => api<{ url: string }>(`/api/invoices/${id}/pay-link`, { method: 'POST', body: {} }),
  billingConfig: () => api<any>('/api/admin/billing/config'),
  billingRunAuto: () => api<any>('/api/admin/billing/run-auto', { method: 'POST', body: {} }),
  companyBillingConfig: (id: number, b: any) => api<any>(`/api/companies/${id}/billing-config`, { method: 'PUT', body: b }),
  systemSettings: () => api<any>('/api/admin/system-settings'), // super-admin: include invoice_issuer
  saveSystemSettings: (b: any) => api<any>('/api/admin/system-settings', { method: 'PUT', body: b }),
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
  setCanInterface: (imei: string, can_interface: string | null) => api(`/api/devices/${encodeURIComponent(imei)}/can-interface`, { method: 'PUT', body: { can_interface } }), // super-admin
  setDeviceWorkSchedule: (imei: string, work_schedule: any) => api(`/api/devices/${encodeURIComponent(imei)}/work-schedule`, { method: 'PUT', body: { work_schedule } }),
  setGroupWorkSchedule: (id: number, work_schedule: any) => api(`/api/device-groups/${id}/work-schedule`, { method: 'PUT', body: { work_schedule } }),
  setInstallIssue: (imei: string, flagged: boolean, note?: string | null) => api<any>(`/api/devices/${encodeURIComponent(imei)}/install-issue`, { method: 'PUT', body: { flagged, note: note || null } }),

  alerts: () => api<any[]>('/api/alerts'),
  createAlert: (b: any) => api('/api/alerts', { method: 'POST', body: b }),
  deleteAlert: (id: number) => api(`/api/alerts/${id}`, { method: 'DELETE' }),
  geofences: () => api<any[]>('/api/geofences'),
  etransport: () => api<any[]>('/api/etransport'),
  tachoFiles: () => api<any[]>('/api/tacho'),
  tachoFile: (id: number) => api<any>(`/api/tacho/${id}`),
  users: () => api<any[]>('/api/users'),
  createUser: (b: any) => api('/api/users', { method: 'POST', body: b }),
  updateUser: (id: number, b: any) => api(`/api/users/${id}`, { method: 'PUT', body: b }),
  deleteUser: (id: number) => api(`/api/users/${id}`, { method: 'DELETE' }),
  webhooks: () => api<any[]>('/api/webhooks'),
  createWebhook: (b: any) => api<any>('/api/webhooks', { method: 'POST', body: b }),
  deleteWebhook: (id: number) => api(`/api/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id: number) => api(`/api/webhooks/${id}/test`, { method: 'POST', body: {} }),
  eventTypes: () => api<EventType[]>('/api/event-types'),
  notifPrefs: () => api<{ types?: Record<string, NotifPref> }>('/api/notification-prefs'),
  saveNotifPrefs: (types: Record<string, NotifPref>) => api('/api/notification-prefs', { method: 'PUT', body: { types } }),
  reportSchedules: () => api<any[]>('/api/report-schedules'),
  createReportSchedule: (b: any) => api('/api/report-schedules', { method: 'POST', body: b }),
  deleteReportSchedule: (id: number) => api(`/api/report-schedules/${id}`, { method: 'DELETE' }),
  runReportSchedule: (id: number) => api(`/api/report-schedules/${id}/run`, { method: 'POST', body: {} }),
  aiStatus: () => api<{ enabled: boolean; model?: string }>('/api/ai/status'),
  aiUsageStats: (days: number) => api<{ days: number; enabled: boolean; model?: string; usage: { kind: string; input_tokens: number; output_tokens: number; calls: number; last_used: string | null }[] }>(`/api/ai/usage-stats?days=${days}`),
  aiChat: (message: string, history?: { role: string; content: string }[]) => api<{ reply: string; source?: string; disabled?: boolean; limited?: boolean }>('/api/ai/chat', { method: 'POST', body: { message, history } }),
  reportsAgent: (message: string) => api<{ reply?: string; disabled?: boolean; limited?: boolean }>('/api/ai/reports-agent', { method: 'POST', body: { message } }), // RA Insight — mod AI (text liber, opțional)
  insightPresets: () => api<{ key: string; title: string }[]>('/api/insight/presets'), // RA Insight — întrebări predefinite (fără AI)
  insightRun: (key: string) => api<{ title: string; label?: string; reportType?: string; period?: any; summary: Record<string, any>; columns?: string[]; rows?: any[][] }>('/api/insight/run', { method: 'POST', body: { key } }),
  // Agenți AI operaționali (RA Watch/Care/Optimize/Compliance/Client): listă + rulare + constatări.
  aiAgents: () => api<{ agents: { key: string; name: string; desc: string }[]; enabledKeys?: string[] }>('/api/agents'),
  runAgents: (agent: string, imeis?: string[]) => api<{ findings: AgentFinding[]; aiSummary: string | null; stored: number; message?: string }>('/api/agents/run', { method: 'POST', body: { agent, imei: imeis && imeis.length ? imeis.join(',') : undefined } }),
  agentFindings: () => api<AgentFinding[]>('/api/agents/findings'),
  agentFindingAction: (id: number, action: 'dismiss' | 'ack') => api(`/api/agents/findings/${id}/${action}`, { method: 'POST' }),
  reportTypes: () => api<{ categories: { key: string; label: string }[]; reports: ReportTypeInfo[] }>('/api/reports'),
  runReport: (type: string, from: string, to: string, imeis?: string[], opts?: ReportOpts) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}&log=1`; // log=1 → se salvează în istoricul de rapoarte (per utilizator, retenție 7 zile)
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<ReportResult>(`/api/reports/${e(type)}${q}${reportOptsQuery(opts)}`);
  },
  // Generare în FUNDAL: serverul răspunde imediat ({queued}), generează async și trimite o notificare (push) când e gata.
  // jobId → corelează badge-ul din client cu notificarea report_ready.
  runReportBg: (type: string, from: string, to: string, imeis?: string[], jobId?: string, opts?: ReportOpts) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}&log=1&background=1`;
    if (jobId) q += `&jobId=${e(jobId)}`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<{ queued?: boolean }>(`/api/reports/${e(type)}${q}${reportOptsQuery(opts)}`);
  },
  // Istoric rapoarte (izolat pe user pe server: getReportHistory(uid) / getReportHistoryById(id, uid) / delete(id, uid)).
  reportHistory: () => api<any[]>('/api/reports/history'),
  reportHistoryItem: (id: number) => api<any>(`/api/reports/history/${encodeURIComponent(String(id))}`),
  deleteReportHistoryItem: (id: number) => api(`/api/reports/history/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
};
