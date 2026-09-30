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
  ecraneAscunse?: string[]; // ecranele tăiate de firmă din rolul omului (chei din ECRANE, server.js)
  editariTaiate?: string[]; // ce NU are voie să modifice rolul (chei din EDITARI, server.js; ex. 'vehicule')
  // „Contul meu": numele afișat (în locul emailului) și telefonul omului; roleLabel = numele rolului dat
  // de firmă („Operator depou", roluri proprii) — null când firma n-a redenumit nimic.
  full_name?: string | null; phone?: string | null; roleLabel?: string | null;
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
  // ── Contul meu (oricine): numele afișat, telefonul și propria parolă ──
  saveProfile: (b: { full_name?: string; phone?: string }) => api<{ ok: boolean; full_name: string; phone: string }>('/api/me/profile', { method: 'PUT', body: b }),
  // Se cere parola de acum: o sesiune lăsată deschisă nu devine preluarea contului. Răspunsurile de refuz
  // sunt 400/403/429 (niciodată 401), deci omul nu e delogat dacă greșește parola veche.
  changePassword: (veche: string, noua: string) => api<{ ok: boolean }>('/api/me/password', { method: 'POST', body: { veche, noua } }),
  // Preferințele de pe CONT (tema, harta, ecranul de pornire…): aceleași ca pe web. PUT-ul schimbă doar cheile trimise.
  uiPrefs: () => api<{ effective: Record<string, any>; userPrefs?: Record<string, any>; source?: Record<string, string> }>('/api/me/ui-prefs'),
  saveUiPrefs: (patch: Record<string, any>) => api<{ ok: boolean }>('/api/me/ui-prefs', { method: 'PUT', body: patch }),
  live: () => api<Position[]>('/api/live'),
  devices: () => api<any[]>('/api/devices'), // roster: toate vehiculele înregistrate (apar și cele fără transmisie)
  deviceFull: (imei: string) => api<DeviceFull>(`/api/devices/${encodeURIComponent(imei)}/full`),
  dailyStats: (imei: string) => api<DailyStats>(`/api/stats/${encodeURIComponent(imei)}`),
  ioMappings: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/io-mappings`),
  // Catalogul steagurilor CAN (nume + iconiță). Public, aceleași date pe care le folosește web-ul.
  canFlags: () => api<any>('/api/can-flags', { auth: false }),
  // Categoriile de pe permis + care dintre ele înseamnă „profesionist" și „card de tahograf".
  // Sursa e license_cats.js, aceeași pentru web, telefon, rapoarte și scadențarul de tahograf.
  licenseCats: () => api<any>('/api/license-cats', { auth: false }),
  // „Ce trimite mașina asta și ce înseamnă" — potrivirea cu catalogul și formatarea se fac pe server,
  // ca telefonul să nu-și țină o a doua copie a regulilor.
  ioExplained: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/io-explained`),
  fuelSensors: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/fuel-sensors`),
  history: (imei: string, from: string, to: string) => api<any[]>(`/api/history/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ext=1`),
  report: (imei: string, from: string, to: string) => api<any>(`/api/report/${encodeURIComponent(imei)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  roadLimits: (points: [number, number][]) => api<{ limits: (number | null)[]; attribution: string; ways: number }>('/api/road-limits', { method: 'POST', body: { points } }),
  // „Aliniază pe drumuri", LA CERERE (butonul din Traseu). Fără `auto:true`: acela e doar pentru OSRM, iar
  // metoda gratuită (OpenStreetMap) are voie să ruleze numai când o cere omul. reason: zona_prea_mare /
  // osm_indisponibil / fara_drumuri.
  matchRoads: (points: [number, number][]) => api<{ matched: [number, number][] | null; source?: string; attribution?: string; reason?: string }>('/api/match', { method: 'POST', body: { points } }),
  // Fișa mașinii — filele „Config Camion", „Sonda combustibil" și „Sonde (avansat)", pe aceleași rute ca web-ul.
  // ATENȚIE: /truck-config SUPRASCRIE toate cele șase coloane deodată (ce lipsește devine gol) — trimite
  // mereu obiectul întreg, citit din /full. /tank-calibration și /fuel-sensors înlocuiesc lista întreagă.
  saveTruckConfig: (imei: string, b: { tareWeight: number | null; maxWeightLegal: number | null; maxWeightConstruct: number | null; maxAxleLoads: Record<string, number | null>; fuelPrice: number | null; costPerTonKm: number | null }) =>
    api<{ ok: boolean }>(`/api/devices/${encodeURIComponent(imei)}/truck-config`, { method: 'PUT', body: b }),
  saveTankCalibration: (imei: string, calibration: { voltage: number; liters: number }[]) =>
    api<{ ok: boolean }>(`/api/devices/${encodeURIComponent(imei)}/tank-calibration`, { method: 'PUT', body: { calibration } }),
  saveFuelSensors: (imei: string, sensors: any[]) =>
    api<{ ok: boolean }>(`/api/devices/${encodeURIComponent(imei)}/fuel-sensors`, { method: 'PUT', body: { sensors } }),
  // Dispecerizare: vehiculele cele mai apropiate de o destinație, clasate (disponibile întâi).
  dispatchSuggest: (lat: number, lon: number) => api<any>(`/api/dispatch/suggest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
  notifications: () => api<NotificationItem[]>('/api/notifications'),
  unreadCount: () => api<{ count: number }>('/api/notifications/unread-count'),
  ackNotification: (id: number) => api(`/api/notifications/${id}/ack`, { method: 'POST' }),
  notifContext: (id: number | string) => api<any>(`/api/notifications/${id}/context`),
  ackAll: () => api('/api/notifications/ack-all', { method: 'POST' }),
  groups: () => api<Group[]>('/api/groups'),
  documents: () => api<DocItem[]>('/api/documents'),
  createDocument: (b: any) => api('/api/documents', { method: 'POST', body: b }),
  // Modificare parțială: fișierul atașat rămâne neatins dacă nu se trimite unul nou.
  updateDocument: (id: number, b: any) => api(`/api/documents/${id}`, { method: 'PUT', body: b }),
  deleteDocument: (id: number) => api(`/api/documents/${id}`, { method: 'DELETE' }),
  // Actele unei singure mașini (fișa ei). Rândurile au deja starea gata socotită (_due, _days), cu preavizul firmei.
  documentsOf: (imei: string) => api<any[]>('/api/documents?imei=' + encodeURIComponent(imei)),
  // Actele ÎNLOCUITE la reînnoire (istoricul), cu data înlocuirii și costul de atunci.
  documentsHistory: (imei?: string) => api<any[]>('/api/documents/history' + (imei ? '?imei=' + encodeURIComponent(imei) : '')),
  // „Acte cerute": ce trebuie să aibă fiecare fel de mașină (req/opt/null pe clasă) + tipurile de acte, gata îmbinate pe server.
  docRequirements: () => api<{ classes: any[]; rows: any[] }>('/api/doc-requirements'),
  // Citirea actului (poză/PDF) → PROPUNERI de câmpuri. Nu scrie nimic; salvarea merge pe rutele obișnuite.
  scanDocument: (b: { b64: string; mime: string; tip?: string }) => api<any>('/api/documents/scan', { method: 'POST', body: b }),
  registerDevice: (token: string, platform: string) => api('/api/push/device', { method: 'POST', body: { token, platform } }),
  unregisterDevice: (token: string) => api('/api/push/device/unregister', { method: 'POST', body: { token } }),
  fuelStats: (from: string, to: string, imeis?: string[]) => {
    const e = encodeURIComponent;
    let q = `?from=${e(from)}&to=${e(to)}&bucket=day`;
    if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
    return api<any>(`/api/fuel-stats${q}`);
  },
  support: (message: string) => api('/api/support', { method: 'POST', body: { message } }),
  // ── Administrare (CRUD) ──
  drivers: () => api<any[]>('/api/drivers'),
  driversLite: () => api<any[]>('/api/drivers/lite'),
  companies: () => api<any[]>('/api/companies'), // super-admin: pentru etichete + filtru pe companie
  // ── Super-admin: Companii (CRUD + abonament/features/plăți = și „Conturi & Abonamente" + „config Agenți AI") ──
  // Firma nouă se face DOAR din traseul „Client nou" (ClientNou.tsx: firmă + contract + administrator), ca pe
  // web. Chemată singură, ar lăsa o firmă doar cu numele, fără niciun administrator.
  createCompany: (b: any) => api<any>('/api/companies', { method: 'POST', body: b }),
  // Setările unei firme anume (agenții aprinși, cota RA Insight). PUT-ul schimbă doar cheile trimise.
  companySettingsOf: (id: number) => api<any>(`/api/companies/${id}/settings`),
  saveCompanySettingsOf: (id: number, b: any) => api<any>(`/api/companies/${id}/settings`, { method: 'PUT', body: b }),
  // Oferta firmei: serverul o ÎNLOCUIEȘTE întreagă — trimite și câmpurile pe care ecranul nu le arată.
  setCompanyOferta: (id: number, oferta: any) => api<any>(`/api/companies/${id}/oferta`, { method: 'PUT', body: { oferta } }),
  // Suspendare / reactivare manuală. Motivul e obligatoriu la suspendare (îl cere și serverul).
  suspendCompany: (id: number, suspend: boolean, reason: string | null) => api<any>(`/api/companies/${id}/suspend`, { method: 'PUT', body: { suspend, reason } }),
  // Administratorul unei firme rămase fără niciunul. Fără parolă: pleacă linkul (sau vine înapoi `link`).
  addCompanyAdmin: (id: number, b: { username: string; full_name?: string }) =>
    api<any>(`/api/companies/${id}/admin`, { method: 'POST', body: b }),
  // Datele firmei de la ANAF, după CUI (Client nou). 404 = firma nu s-a găsit.
  anafFirma: (cui: string) => api<any>('/api/anaf/firma?cui=' + encodeURIComponent(cui)),
  // „Mută între companii": listele slabe + mutarea unuia sau în lot (aceleași rute ca web-ul).
  devicesLite: (includeArchived = false) => api<any[]>('/api/devices/lite' + (includeArchived ? '?includeArchived=1' : '')),
  usersLite: () => api<any[]>('/api/users/lite'),
  moveUser: (id: number, company_id: number) => api<any>(`/api/users/${id}/company`, { method: 'PUT', body: { company_id } }),
  moveDriver: (id: number, company_id: number | null) => api<any>(`/api/drivers/${id}/company`, { method: 'PUT', body: { company_id } }),
  moveDevicesBulk: (imeis: string[], company_id: number | null) => api<{ ok: boolean; moved?: number }>('/api/devices/company/bulk', { method: 'PUT', body: { imeis, company_id } }),
  moveUsersBulk: (ids: number[], company_id: number) => api<{ ok: boolean; moved?: number }>('/api/users/company/bulk', { method: 'PUT', body: { ids, company_id } }),
  moveDriversBulk: (ids: number[], company_id: number | null) => api<{ ok: boolean; moved?: number }>('/api/drivers/company/bulk', { method: 'PUT', body: { ids, company_id } }),
  updateCompany: (id: number, b: any) => api<any>(`/api/companies/${id}`, { method: 'PUT', body: b }),
  deleteCompany: (id: number) => api<any>(`/api/companies/${id}`, { method: 'DELETE' }),
  companyOverview: (id: number) => api<any>(`/api/companies/${id}/overview`),
  // ── Super-admin: Contracte, acte adiționale, montaj (aceleași rute ca web-ul; toate requireSuperadmin) ──
  // Regulile (ce se poate schimba după semnare, textul prelungirii, anexa, marja) stau pe SERVER.
  // Telefonul trimite ce s-a scris și arată răspunsul — inclusiv refuzurile, cu vorbele serverului.
  contracts: () => api<{ contracte: any[]; fara_contract: any[]; incheiate_cu_acces: any[]; trimite_pe_email?: boolean }>('/api/contracts'),
  // „Trimite la semnat": emailul cu PDF-ul (același contractPdf ca „Descarcă") îl trimite SERVERUL; tot el scrie
  // „trimis", ziua și adresa. Refuză ciorna, golurile de pe hârtie, adresa stricată și lipsa SMTP (503).
  trimiteContract: (id: number, catre: string) =>
    api<{ ok: boolean; trimis_la: string; sent_at: number; status: string }>(`/api/contracts/${id}/trimite`, { method: 'POST', body: { catre } }),
  // „Completează": datele firmei din dosar. Scrie DOAR cheile trimise (NU PUT /api/companies/:id, care golește ce vine gol).
  completeazaDosar: (companyId: number, b: { name?: string; cui?: string; reg_com?: string; address?: string; contact_email?: string; legal_rep?: { name: string; role: string } | null }) =>
    api<{ ok: boolean; company: any }>(`/api/companies/${companyId}/dosar`, { method: 'PUT', body: b }),
  createContract: (companyId: number, b: any) => api<any>(`/api/companies/${companyId}/contract`, { method: 'POST', body: b }),
  updateContract: (id: number, b: any) => api<any>(`/api/contracts/${id}`, { method: 'PUT', body: b }),
  deleteContract: (id: number) => api<any>(`/api/contracts/${id}`, { method: 'DELETE' }),
  // „Reînnoiește": serverul scrie actul de prelungire (text + date); 409 dacă există deja unul în lucru.
  renewContract: (id: number, luni: number) => api<{ act: any; de_la: number; pana_la: number }>(`/api/contracts/${id}/reinnoire`, { method: 'POST', body: { luni } }),
  // Scanul semnat: `care` = 'contract' sau 'gdpr'. Limita de 4 MB e a serverului.
  uploadContractFile: (id: number, b: { care: string; name: string; b64: string }) => api<any>(`/api/contracts/${id}/file`, { method: 'POST', body: b }),
  deleteContractFile: (id: number, care: string) => api<any>(`/api/contracts/${id}/file?care=${encodeURIComponent(care)}`, { method: 'DELETE' }),
  contractActe: (contractId: number) => api<any[]>(`/api/contracts/${contractId}/acte`),
  createAct: (contractId: number, b: any) => api<any>(`/api/contracts/${contractId}/acte`, { method: 'POST', body: b }),
  updateAct: (id: number, b: any) => api<any>(`/api/acte/${id}`, { method: 'PUT', body: b }),
  deleteAct: (id: number) => api<any>(`/api/acte/${id}`, { method: 'DELETE' }),
  uploadActFile: (id: number, b: { name: string; b64: string }) => api<any>(`/api/acte/${id}/file`, { method: 'POST', body: b }),
  // Partenerii de montaj și lucrările: DOAR la noi. Clientul nu vede niciodată cine montează și cât ne costă.
  montajParteneri: () => api<any[]>('/api/montaj/parteneri'),
  saveMontajPartener: (b: any) => api<any>('/api/montaj/parteneri', { method: 'POST', body: b }), // modificarea e tot POST, cu id
  deleteMontajPartener: (id: number) => api<any>(`/api/montaj/parteneri/${id}`, { method: 'DELETE' }),
  companyMontaje: (companyId: number) => api<any[]>(`/api/companies/${companyId}/montaje`),
  saveMontaj: (companyId: number, b: any) => api<any>(`/api/companies/${companyId}/montaje`, { method: 'POST', body: b }),
  deleteMontaj: (id: number) => api<any>(`/api/montaje/${id}`, { method: 'DELETE' }),
  // Secțiunea „Montaj" (Business): contractele de colaborare cu partenerii + toate lucrările, de la toți clienții.
  // Trecerile, ce lipsește și marja stau pe server; PDF-ul și actul semnat merg prin salveazaDeLaServer (HartieBtns).
  montajContracte: () => api<{ contracte: any[]; fara_contract: { id: number; name: string }[]; trimite_pe_email: boolean }>('/api/montaj/contracte'),
  createMontajContract: (b: any) => api<any>('/api/montaj/contracte', { method: 'POST', body: b }),
  updateMontajContract: (id: number, b: any) => api<any>(`/api/montaj/contracte/${id}`, { method: 'PUT', body: b }),
  deleteMontajContract: (id: number) => api<any>(`/api/montaj/contracte/${id}`, { method: 'DELETE' }),
  uploadMontajContractFile: (id: number, b: { name: string; b64: string }) => api<any>(`/api/montaj/contracte/${id}/file`, { method: 'POST', body: b }),
  sendMontajContract: (id: number, b: { catre: string }) =>
    api<{ ok: boolean; trimis_la: string; sent_at: number; status: string }>(`/api/montaj/contracte/${id}/trimite`, { method: 'POST', body: b }),
  montajLucrari: () => api<{ stari: Record<string, string>; lucrari: any[] }>('/api/montaj/lucrari'),
  setCompanyFeatures: (id: number, features: Record<string, boolean>) => api<any>(`/api/companies/${id}/features`, { method: 'PUT', body: { features } }),
  // Limita VECHE de întrebări AI pe lună (null = nelimitat). Contează doar la firmele fără fond RA Insight pe cont.
  setCompanyAiLimit: (id: number, limit: number | null) => api<any>(`/api/companies/${id}/ai-limit`, { method: 'PUT', body: { limit } }),
  // Venitul lunar pe firmă + total, socotit pe server cu motorul facturii (același ca registrul de clienți).
  companiesMrr: () => api<{ firme: Record<string, number>; totalLei: number }>('/api/companies/mrr'),
  companyPayments: (id: number) => api<any[]>(`/api/companies/${id}/payments`),
  // (Apelul care punea de mână „acces până la" a plecat: ruta lui a fost ștearsă pe server odată cu ceasul vechi,
  // 29.09. Accesul se oprește doar pentru neplată sau de mână.)
  // ── Super-admin: Dashboard platformă ──
  adminOverview: (days = 30) => api<any>(`/api/admin/overview?days=${days}`),
  adminCounts: () => api<any>('/api/admin/counts'),
  adminErrors: (limit = 50) => api<any[]>(`/api/admin/errors?limit=${limit}`),
  clearAdminErrors: () => api('/api/admin/errors', { method: 'DELETE' }),
  liveStats: () => api<any>('/api/debug/live-stats'),
  adminHealth: () => api<any>('/api/admin/health'),
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
  // TollRo — taxa rutiera pe km. Vehiculul se alege DIN FLOTA; profilul (masa, axe, norma Euro)
  // vine de la server, din fisa lui, nu se trimite de aici.
  tollroConfig: () => api<any>('/api/tollro/config'),
  tollroSetConfig: (grila: any) => api<any>('/api/tollro/config', { method: 'PUT', body: { grila } }), // super-admin
  tollroProfil: (imei: string) => api<any>('/api/tollro/profil/' + encodeURIComponent(imei)),
  tollroSalveazaProfil: (imei: string, body: any) => api<any>('/api/tollro/profil/' + encodeURIComponent(imei), { method: 'PUT', body }),
  tollroEstimate: (imei: string, km: any, manual?: any) => api<any>('/api/tollro/estimate', { method: 'POST', body: { imei, km, manual } }),
  tollroDinIstoric: (imei: string, from: string, to: string, manual?: any) => api<any>('/api/tollro/din-istoric', { method: 'POST', body: { imei, from, to, manual } }),
  // Toată flota, încadrată (aplicabil + motiv): regula „cine plătește" stă O DATĂ, în tollro.js, pe server.
  tollroFlota: () => api<any>('/api/tollro/flota'),
  // „O cursă nouă": dacă rutarea e pornită, sugestii de adrese (cheia furnizorului stă la server) și costul cursei.
  tollroRutare: () => api<{ pornit: boolean; motiv?: string | null; deProba?: boolean }>('/api/tollro/rutare'),
  tollroAdrese: (q: string) => api<{ sugestii: { label: string; lat: number; lng: number }[] }>('/api/tollro/adrese?q=' + encodeURIComponent(q)),
  tollroCursa: (imei: string, start: { lat: number; lng: number }, end: { lat: number; lng: number }) =>
    api<any>('/api/tollro/cursa', { method: 'POST', body: { imei, start, end } }),
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
  // ── Super-admin: Cereri de cont demo (formularul public de pe landing) ──
  demoRequests: (status?: string) => api<any[]>('/api/admin/demo-requests' + (status ? '?status=' + encodeURIComponent(status) : '')),
  approveDemoRequest: (id: number, b: any) => api<any>(`/api/admin/demo-requests/${id}/approve`, { method: 'POST', body: b }),
  rejectDemoRequest: (id: number) => api<any>(`/api/admin/demo-requests/${id}/reject`, { method: 'POST' }),
  deleteDemoRequest: (id: number) => api<any>(`/api/admin/demo-requests/${id}`, { method: 'DELETE' }),
  // Simulatorul demo merge doar cât timp există un cont demo valabil; pornirea manuală e pentru prezentări.
  demoSim: () => api<any>('/api/admin/demo-sim'),
  setDemoSim: (b: any) => api<any>('/api/admin/demo-sim', { method: 'POST', body: b }),
  // ── Super-admin: Ofertare Live ──
  offers: () => api<any[]>('/api/admin/offers'),
  // Calculatorul de ofertă, socotit PE SERVER cu codul paginii web (telefonul nu are socoteala lui).
  // Moduri: { nou } · { offer_id, incarca } · { campuri, atinse, schimbate, offer_id? } · { offer_id, hartie }
  // · { offer_id, contract } · { preturi }. Vezi „Ofertare pe server" în server.js.
  offerCalc: (b: any) => api<any>('/api/admin/offers/calc', { method: 'POST', body: b, timeoutMs: 30000 }),
  offerMeta: () => api<{ stari: string[]; valabilZile: number; motivePierdut: { cod: string; et: string }[] }>('/api/admin/offers/meta'),
  offerSetStare: (id: number, b: { status: string; valid_until?: number; lost_reason?: string }) => api<any>(`/api/admin/offers/${id}/stare`, { method: 'PUT', body: b }),
  // Corpul vine GATA din `offerCalc` (`salvare.corp`) — nicio sumă nu se compune pe telefon. Serverul
  // primește salvarea doar de la aplicația 1.0.3+ (antetul X-RA-App); cele vechi primesc 409.
  createOffer: (b: any) => api<any>('/api/admin/offers', { method: 'POST', body: b }),
  updateOffer: (id: number, b: any) => api<any>(`/api/admin/offers/${id}`, { method: 'PUT', body: b }),
  deleteOffer: (id: number) => api<any>(`/api/admin/offers/${id}`, { method: 'DELETE' }),
  // „Mașinile clientului" (Ofertare Live, doar noi): mărcile / modelele pentru completare, listele Teltonika și
  // șablonul. Potrivirea NU se cere de aici: calculatorul o face pe server, cu lista trimisă la fiecare socoteală.
  masiniMarci: () => api<{ marci: string[] }>('/api/admin/masini/marci'),
  masiniModele: (marca: string) => api<{ modele: string[] }>('/api/admin/masini/modele?marca=' + encodeURIComponent(marca)),
  masiniListe: () => api<{ liste: any[]; combustibili: Record<string, string>; aparate: Record<string, { et: string }> }>('/api/admin/masini/liste'),
  // Șablonul completat de client, citit de server — în JSON, ca base64 (stratul nativ poartă text). Descărcarea lui
  // trece prin salveazaDeLaServer; o listă Teltonika nouă, prea mare pentru JSON, prin lib/trimiteFisier.ts.
  masiniSablonCiteste: (b: { fisier: string; b64: string }) =>
    api<{ masini: any[]; probleme: { rand: number; ce: string }[]; nProbleme: number }>('/api/admin/masini/sablon', { method: 'POST', body: b, timeoutMs: 60000 }),
  // ── Super-admin: Dispozitive (global) ──
  adminDevices: () => api<any[]>('/api/admin/devices'),
  unassignedDevices: () => api<any[]>('/api/unassigned-devices'),
  createDevice: (fields: any) => api<any>('/api/devices', { method: 'POST', body: fields }), // super: pre-înregistrează IMEI în allow-list (mod strict)
  moveDevice: (imei: string, company_id: number | null) => api<any>(`/api/devices/${encodeURIComponent(imei)}/company`, { method: 'PUT', body: { company_id } }),
  // ── Dispozitive arhivate — DOAR super-admin (hotărât 18.09: clientul nu-și vede aparatele arhivate) ──
  archivedDevices: () => api<any[]>('/api/archived-devices'),
  restoreDevice: (imei: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}/status`, { method: 'PUT', body: { status: 'active' } }),
  // `confirmare` = ce a tastat omul (numărul sau IMEI-ul), trimis în body ca serverul să-l poată verifica și el.
  deleteDevice: (imei: string, confirmare?: string) => api<any>(`/api/devices/${encodeURIComponent(imei)}`, { method: 'DELETE', body: confirmare ? { confirmare } : undefined }),
  // ── Operațiunile fondatorului (lotul 2b, F4). Toate rutele sunt requireSuperadmin pe server (Chei API: requireAdmin,
  // dar ecranul de pe telefon e doar al nostru). Telefonul nu socotește nimic din ce hotărăște serverul. ──
  // „Arhivează" / „Respinge": serverul copiază ÎNTÂI istoricul, abia apoi taie conexiunea și scoate IMEI-ul din lista celor acceptate.
  archiveDevice: (imei: string) => api<{ ok: boolean; status: string; archived_positions?: number }>(`/api/devices/${encodeURIComponent(imei)}/status`, { method: 'PUT', body: { status: 'archived' } }),
  // Mod strict: IMEI-urile NEÎNREGISTRATE care încearcă să se conecteze. „Aprobă" = createDevice({ imei }).
  deviceAttempts: () => api<{ strict: boolean; registered?: number; attempts: { imei: string; first: string; last: string; count: number; address?: string }[] }>('/api/admin/device-attempts'),
  dismissDeviceAttempt: (imei: string) => api<{ ok: boolean }>(`/api/admin/device-attempts/${encodeURIComponent(imei)}`, { method: 'DELETE' }),
  // Inventarul aparatelor, din TOATE firmele (la super-admin). Modelul și cartela se scriu pe /details (updateDeviceDetails),
  // care schimbă doar câmpurile trimise — NU pe PUT /devices/:imei, care rescrie numele și numărul.
  deviceInventory: () => api<any[]>('/api/device-inventory'),
  // Stocul NOSTRU de echipamente (Gestiune → Stoc echipamente), doar la noi. Regulile (pe unde poate merge o bucată,
  // sumarul, alertele) le socotește serverul (stoc.js); telefonul arată ce primește. Seriile pleacă TEXTUL scris.
  stoc: () => api<any>('/api/stoc'),
  stocIntrare: (b: { tip: string; serii: string; buc: string; cost_eur: string; furnizor: string }) =>
    api<{ ok: boolean; adaugate: number; ids: number[] }>('/api/stoc/intrare', { method: 'POST', body: b }),
  stocMuta: (b: { ids: number[]; stare: string; partener_id?: number | null; company_id?: number | null; proprietar?: 'ra' | 'client' | null; nota?: string }) =>
    api<{ ok: boolean; mutate: number; refuzate: { id: number; serie?: string | null; motiv: string }[] }>('/api/stoc/muta', { method: 'POST', body: b }),
  stocPraguri: (b: { minim: Record<string, string>; zileInstalator: string }) =>
    api<{ minim: Record<string, number>; zileInstalator: number }>('/api/stoc/praguri', { method: 'PUT', body: b }),
  stocSterge: (id: number) => api<{ ok: boolean }>(`/api/stoc/${id}`, { method: 'DELETE' }),
  // Tahograf și e-Transport, privirea noastră: o firmă pe rând. Doar citire — noi nu încărcăm și nu ștergem nimic.
  tachoOverview: () => api<{ praguriLegale: { card: number; vu: number }; firme: any[] }>('/api/admin/tacho-overview'),
  etransportOverview: () => api<{ anaf: { pornit: boolean; test?: boolean }; praguri: { tacereMinute: number; curandOre: number; zileNational: number; zileIntracomunitar: number }; firme: any[] }>('/api/admin/etransport-overview'),
  // Utilizare RA Insight pe firme: aceleași cifre după care se face factura (conturi, fond, venit, cost, istoric din facturi).
  aiUsage: () => api<{ rows: any[]; summary: Record<string, any>; istoric: any[]; fxEur: number }>('/api/admin/ai-usage'),
  // Chei API. Cheia în clar vine O SINGURĂ DATĂ, la creare. DELETE simplu = revocă (rămâne pentru audit); ?hard=1 = șterge.
  apiKeys: () => api<any[]>('/api/apikeys'),
  createApiKey: (userId: number, name: string) => api<{ id: number; name: string; prefix: string; key: string; user: string; role: string }>('/api/apikeys', { method: 'POST', body: { userId, name } }),
  revokeApiKey: (id: number) => api<{ ok: boolean }>(`/api/apikeys/${id}`, { method: 'DELETE' }),
  deleteApiKey: (id: number) => api<{ ok: boolean }>(`/api/apikeys/${id}?hard=1`, { method: 'DELETE' }),
  // Jurnalul de audit al platformei (limit ≤ 500 pe server).
  auditLog: (limit = 100, offset = 0) => api<any[]>(`/api/audit?limit=${limit}&offset=${offset}`),
  // (Pragurile agenților pentru O firmă anume: companySettingsOf / saveCompanySettingsOf, mai sus, la Companii.
  // Fără firmă, /companies/me/settings scrie baza platformei.)
  // ── Facturare ──
  payments: (limit = 500) => api<{ payments: any[]; total: number }>(`/api/payments?limit=${limit}`), // super-admin: toate plățile + total
  recordPayment: (companyId: number, b: any) => api<any>(`/api/companies/${companyId}/payment`, { method: 'POST', body: b }),
  myInvoices: () => api<any>('/api/billing/my-invoices'), // admin firmă: facturile proprii + status abonament
  // ── Facturi FISCALE (super-admin) ──
  // Ca pe web (raxLoadInvoices): până la 1000 de documente — fără limită, serverul dă doar 500.
  invoices: () => api<{ invoices: any[] }>('/api/invoices?limit=1000'),
  invoice: (id: number) => api<any>(`/api/invoices/${id}`),
  // Ciorna unei facturi (nu se salvează). `fel` = 'abonament' (implicit: `luna` 'AAAA-LL', pe zile de la montaj;
  // fără ea, luna de azi) sau 'unica' (fără rânduri, dar cu `dinContract`: aparatele din Anexa nr. 2 + lucrările executate).
  invoiceDraft: (companyId: number, luna?: string, fel: 'abonament' | 'unica' = 'abonament') =>
    api<any>('/api/invoices/draft', { method: 'POST', body: fel === 'unica' ? { companyId, fel } : { companyId, fel, luna } }),
  // { companyId, fel, luna, tip: 'invoice'|'proforma', lines, montaje, note } — ca pe web (raxGenIssue).
  // Abonamentul unei luni deja facturate → 409, cu numărul facturii existente în mesaj.
  issueInvoice: (b: any) => api<{ ok: boolean; invoice: any; montajeFacturate?: number }>('/api/invoices', { method: 'POST', body: b }),
  // 'paid' | 'canceled'. „Încasată" pe o proformă emite factura fiscală: `invoice` e factura născută.
  invoiceSetStatus: (id: number, status: string) => api<{ ok: boolean; invoice?: any; already?: boolean }>(`/api/invoices/${id}/status`, { method: 'PUT', body: { status } }),
  invoiceEfacturaSend: (id: number) => api<any>(`/api/invoices/${id}/efactura`, { method: 'POST', body: {} }),
  // Ce spune ANAF de o factură trimisă: `stare` = răspunsul lor, `status` = uploaded / validated / error.
  invoiceEfacturaStatus: (id: number) => api<{ ok: boolean; stare?: string; status?: string; note?: string }>(`/api/invoices/${id}/efactura/status`),
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
  // Lucrările unei singure mașini (fila Service din fișă), cu _due/_odo gata socotite de server.
  maintenanceOf: (imei: string) => api<any[]>('/api/maintenance?imei=' + encodeURIComponent(imei)),
  // Intervalele de service (la cât se repetă fiecare lucrare, pe autoturism / utilitară / camion), gata îmbinate pe server.
  maintIntervals: () => api<{ classes: any[]; rows: any[]; classMap?: Record<string, string> }>('/api/maint-intervals'),
  // Mută la Documente o intrare care e de fapt ACT (ITP, RCA…). 409 dacă mașina are deja actul acela.
  maintToDocument: (id: number) => api<any>(`/api/maintenance/${id}/to-document`, { method: 'POST' }),
  // Mută/scoate un vehicul dintr-o grupă. Rută dedicată: /assign ar rescrie și șoferul.
  setDeviceGroup: (imei: string, group_id: number | null) => api<any>(`/api/devices/${encodeURIComponent(imei)}/group`, { method: 'PUT', body: { group_id } }),
  updateDevice: (imei: string, b: any) => api(`/api/devices/${encodeURIComponent(imei)}`, { method: 'PUT', body: b }),
  // Fișa tehnică completă (~35 câmpuri). Ruta scurtă de mai sus salvează DOAR nume/număr/tip.
  updateDeviceDetails: (imei: string, b: any) => api(`/api/devices/${encodeURIComponent(imei)}/details`, { method: 'PUT', body: b }),
  assignDevice: (imei: string, driver_id: number | null, group_id: number | null) => api(`/api/devices/${encodeURIComponent(imei)}/assign`, { method: 'PUT', body: { driver_id, group_id } }),
  setCanInterface: (imei: string, can_interface: string | null) => api(`/api/devices/${encodeURIComponent(imei)}/can-interface`, { method: 'PUT', body: { can_interface } }), // super-admin
  setDeviceWorkSchedule: (imei: string, work_schedule: any) => api(`/api/devices/${encodeURIComponent(imei)}/work-schedule`, { method: 'PUT', body: { work_schedule } }),
  setGroupWorkSchedule: (id: number, work_schedule: any) => api(`/api/device-groups/${id}/work-schedule`, { method: 'PUT', body: { work_schedule } }),
  setInstallIssue: (imei: string, flagged: boolean, note?: string | null) => api<any>(`/api/devices/${encodeURIComponent(imei)}/install-issue`, { method: 'PUT', body: { flagged, note: note || null } }),

  alerts: () => api<any[]>('/api/alerts'),
  createAlert: (b: any) => api('/api/alerts', { method: 'POST', body: b }),
  // Modificare PARȚIALĂ (ca pe web): comutatorul trimite doar { enabled }; formularul trimite regula întreagă.
  updateAlert: (id: number, b: any) => api<any>(`/api/alerts/${id}`, { method: 'PUT', body: b }),
  deleteAlert: (id: number) => api(`/api/alerts/${id}`, { method: 'DELETE' }),
  geofences: () => api<any[]>('/api/geofences'),
  // CRUD zone — până acum mobilul avea doar citire, deci zonele se puteau crea exclusiv de pe web.
  createGeofence: (b: any) => api<any>('/api/geofences', { method: 'POST', body: b }),
  updateGeofence: (id: number, b: any) => api<any>(`/api/geofences/${id}`, { method: 'PUT', body: b }),
  deleteGeofence: (id: number) => api<any>(`/api/geofences/${id}`, { method: 'DELETE' }),
  etransport: () => api<any[]>('/api/etransport'),
  // Scadențarul e-Transport; telefonul îi citește deocamdată doar `anaf` ({ pornit, test }): dacă pleacă
  // ceva spre ANAF. Aceeași sursă ca banda de pe web — fără ea, clientul ar crede că e în regulă la ANAF.
  etransportScadentar: () => api<{ anaf?: { pornit: boolean; test?: boolean } } & Record<string, any>>('/api/etransport/scadentar'),
  // Tipurile de operațiune + câte zile ține codul UIT (din etransport.js — nicio listă scrisă pe telefon).
  etransportTipuri: () => api<{ tipuri: { cod: string; label: string; zile: number }[] }>('/api/etransport/tipuri'),
  // Adăugare / ștergere: serverul cere dreptul „modifică flota" (requireFleet); firma se ia de pe vehicul.
  createEtransport: (b: any) => api<any>('/api/etransport', { method: 'POST', body: b }),
  deleteEtransport: (id: number) => api<any>(`/api/etransport/${id}`, { method: 'DELETE' }),
  tachoFiles: () => api<any[]>('/api/tacho'),
  tachoFile: (id: number) => api<any>(`/api/tacho/${id}`),
  // Scoate un fișier legat greșit. Serverul cere „modifică flota" și verifică firma fișierului.
  deleteTacho: (id: number) => api<any>(`/api/tacho/${id}`, { method: 'DELETE' }),
  // „Cine trebuie descărcat următorul" — aceeași rută pe care o folosește web-ul, cu aceleași filtre
  // (fără flota demo, doar șoferii cu card de tahograf, doar vehiculele care au tahograf). Telefonul
  // NU rejudecă cine intră în listă: ar fi a doua regulă, care s-ar contrazice cu prima.
  tachoScadentar: () => api<any>('/api/tacho/scadentar'),
  tachoIstoric: (driverId?: number | null, imei?: string | null) =>
    api<any>('/api/tacho/istoric?' + (driverId ? 'driverId=' + driverId : 'imei=' + encodeURIComponent(String(imei)))),
  // Încărcarea unui .DDD. Regula „trebuie legat de un șofer SAU de un vehicul" e a SERVERULUI —
  // acolo se hotărăște dacă fișierul intră. Ecranul o mai spune o dată înainte de trimitere, doar ca
  // omul să nu urce degeaba câțiva MB pe date mobile; dacă regula se schimbă, cea de pe server
  // câștigă oricum, iar mesajul ei ajunge pe ecran neschimbat.
  uploadTacho: (b: { filename: string; b64: string; driverId?: number | null; imei?: string | null }) =>
    api<any>('/api/tacho/upload', { method: 'POST', body: b }),
  users: () => api<any[]>('/api/users'),
  createUser: (b: any) => api('/api/users', { method: 'POST', body: b }),
  updateUser: (id: number, b: any) => api(`/api/users/${id}`, { method: 'PUT', body: b }),
  deleteUser: (id: number) => api(`/api/users/${id}`, { method: 'DELETE' }),
  // Linkul prin care omul ÎȘI pune parola: invitația care n-a ajuns ȘI parola uitată, un singur buton (ca pe web).
  // Dacă emailul nu poate pleca, serverul întoarce chiar linkul, ca adminul să-l ducă mai departe. Parola n-o mai
  // scrie nimeni în locul omului — ruta veche (/password) a fost scoasă de pe server. 429 după 5 linkuri pe oră.
  linkParola: (id: number) => api<{ ok: boolean; trimis: boolean; email?: string; link?: string; motiv?: string }>(`/api/users/${id}/link-parola`, { method: 'POST', body: {} }),
  // Vehiculele și grupele atribuite unui cont (dispecer, viewer, rol fără „Vede toată flota").
  // ATENȚIE: /access = vehicule; termenul unui cont demo e pe /access-until (altă rută, doar super-admin).
  userAccess: (id: number) => api<{ devices: string[]; groups: number[] }>(`/api/users/${id}/access`),
  setUserAccess: (id: number, devices: string[], groups: number[]) => api(`/api/users/${id}/access`, { method: 'PUT', body: { devices, groups } }),
  // RA Insight pe cont (se facturează per cont aprins).
  setUserAiSeat: (id: number, on: boolean) => api<{ ok: boolean; ai_seat: boolean; seats: number }>(`/api/users/${id}/ai-seat`, { method: 'PUT', body: { on } }),
  // Rolurile firmei: cele standard (cu numele date de firmă) + rolurile proprii.
  companyRoles: () => api<any[]>('/api/company-roles'),
  // ── Administrarea firmei (lotul 2): Roluri, Adrese de email, Istoric activitate, Aparate GPS ──
  // Aceleași rute ca web-ul; regulile (poți doar TĂIA din rol, limita de 20, confirmarea din inbox,
  // filtrul pe firmă) stau pe server. Telefonul trimite ce s-a ales și arată refuzul cu vorbele lui.
  // PUT = cheile DEBIFATE (ce se taie), nu cele bifate: pe calea asta nu se poate adăuga nimic.
  saveCompanyRole: (rol: string, b: { nume: string; taiate: string[]; ecrane: string[]; editari: string[]; rapoarte: string[] }) =>
    api<any>(`/api/company-roles/${encodeURIComponent(rol)}`, { method: 'PUT', body: b }),
  createCompanyRole: (nume: string, baza: string) => api<{ ok: boolean; rol: string; baza: string; nume: string }>('/api/company-roles', { method: 'POST', body: { nume, baza } }),
  // Rol standard → revine la standard; rol propriu → se șterge (refuzat dacă îl mai are cineva).
  resetCompanyRole: (rol: string) => api<{ ok: boolean }>(`/api/company-roles/${encodeURIComponent(rol)}`, { method: 'DELETE' }),
  companyEmails: () => api<any[]>('/api/company-emails'),
  addCompanyEmail: (email: string, eticheta: string) => api<any>('/api/company-emails', { method: 'POST', body: { email, eticheta } }),
  setCompanyEmailUses: (id: number, b: { la_alerte?: boolean; la_rapoarte?: boolean }) => api<any>(`/api/company-emails/${id}`, { method: 'PUT', body: b }),
  resendCompanyEmail: (id: number) => api<{ ok: boolean; confirmareTrimisa?: boolean }>(`/api/company-emails/${id}/retrimite`, { method: 'POST', body: {} }),
  deleteCompanyEmail: (id: number) => api<{ ok: boolean }>(`/api/company-emails/${id}`, { method: 'DELETE' }),
  activity: (q: { zile: number; offset: number; familie?: string; user?: string }) =>
    api<{ total: number; randuri: any[] }>(`/api/activity?zile=${q.zile}&limit=50&offset=${q.offset}`
      + (q.familie ? '&familie=' + encodeURIComponent(q.familie) : '') + (q.user ? '&user=' + encodeURIComponent(q.user) : '')),
  // Timpul în aplicație: îl trimite DOAR web-ul (telefonul nu trimite semnalul „sunt în aplicație" — decizie).
  presence: (zile: number) => api<{ minuteTotal: number; pasMinute: number; oameni: any[] }>(`/api/presence?zile=${zile}`),
  // „Aparate GPS" își face rândurile din devices(); exportul trimite IMEI-urile pe nume. (Pe 24.09
  // GET /api/device-inventory nu filtra pe firmă; de pe 29.09 filtrează, dar ecranul a rămas pe devices().)
  webhooks: () => api<any[]>('/api/webhooks'),
  createWebhook: (b: any) => api<any>('/api/webhooks', { method: 'POST', body: b }),
  deleteWebhook: (id: number) => api(`/api/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id: number) => api(`/api/webhooks/${id}/test`, { method: 'POST', body: {} }),
  eventTypes: () => api<EventType[]>('/api/event-types'),
  notifPrefs: () => api<{ types?: Record<string, NotifPref> }>('/api/notification-prefs'),
  saveNotifPrefs: (types: Record<string, NotifPref>) => api('/api/notification-prefs', { method: 'PUT', body: { types } }),
  reportSchedules: () => api<any[]>('/api/report-schedules'),
  createReportSchedule: (b: any) => api('/api/report-schedules', { method: 'POST', body: b }),
  updateReportSchedule: (id: number, b: any) => api(`/api/report-schedules/${id}`, { method: 'PUT', body: b }),
  deleteReportSchedule: (id: number) => api(`/api/report-schedules/${id}`, { method: 'DELETE' }),
  runReportSchedule: (id: number) => api<{ ok?: boolean; rows?: number; recipients?: string[]; emailSent?: boolean; historyId?: number | null; reason?: string }>(`/api/report-schedules/${id}/run`, { method: 'POST', body: {} }),
  aiStatus: () => api<{ enabled: boolean; model?: string }>('/api/ai/status'),
  aiUsageStats: (days: number) => api<{ days: number; enabled: boolean; model?: string; usage: { kind: string; input_tokens: number; output_tokens: number; calls: number; last_used: string | null }[] }>(`/api/ai/usage-stats?days=${days}`),
  // Fond epuizat: serverul răspunde cu limited + fondEpuizat și explicația în `reply` (fără niciun cost în plus).
  aiChat: (message: string, history?: { role: string; content: string }[]) => api<{ reply?: string | null; error?: string; message?: string; seatMissing?: boolean; source?: string; disabled?: boolean; limited?: boolean; fondEpuizat?: { fond?: number; conturi?: number; peCont?: number; reinnoire?: string } }>('/api/ai/chat', { method: 'POST', body: { message, history } }),
  reportsAgent: (message: string) => api<{ reply?: string | null; error?: string; message?: string; seatMissing?: boolean; sources?: any[]; disabled?: boolean; limited?: boolean; fondEpuizat?: { fond?: number; conturi?: number; peCont?: number; reinnoire?: string } }>('/api/ai/reports-agent', { method: 'POST', body: { message } }), // RA Insight — mod AI (text liber, opțional)
  // Contorul RA Insight (aceeași sursă ca bara de pe web): fondul firmei, cât a pus omul, reînnoirea, locul pe cont.
  aiQuota: () => api<{ ok?: boolean; error?: string; seat?: boolean; questions: number; seats?: number; questionsPerSeat?: number; used: number; usedByMe?: number; remaining: number | null; unlimited: boolean; blocked?: boolean; periodEnd?: string }>('/api/ai/quota', { timeoutMs: 20000 }),
  fx: () => api<{ eur: number; date?: string | null; source?: string }>('/api/fx', { timeoutMs: 20000 }), // curs BNR EUR→RON
  insightPresets: () => api<{ key: string; title: string }[]>('/api/insight/presets'), // RA Insight — întrebări predefinite (fără AI)
  insightRun: (key: string) => api<{ title: string; label?: string; reportType?: string; period?: any; summary: Record<string, any>; columns?: string[]; rows?: any[][] }>('/api/insight/run', { method: 'POST', body: { key } }),
  // Agenți AI operaționali (RA Watch/Care/Optimize/Compliance/Client): listă + rulare + constatări.
  aiAgents: () => api<{ agents: { key: string; name: string; desc: string }[]; enabledKeys?: string[] }>('/api/agents'),
  // `companyId` (opțional) contează DOAR la super-admin (applyCompanyFilter pe server): firma aleasă în Agenți AI.
  runAgents: (agent: string, imeis?: string[], companyId?: number | null) => api<{ findings: AgentFinding[]; aiSummary: string | null; stored: number; message?: string }>('/api/agents/run', { method: 'POST', body: { agent, imei: imeis && imeis.length ? imeis.join(',') : undefined, companyId: companyId != null ? companyId : undefined } }),
  agentFindings: (companyId?: number | null) => api<AgentFinding[]>('/api/agents/findings' + (companyId != null ? '?companyId=' + encodeURIComponent(String(companyId)) : '')),
  // „Statistici flotă" — aceeași sursă ca ecranul de pe web: cifrele zilei pe vehicul (km, consum, viteză
  // maximă, motor, combustibil) + stările de acum. Serverul scoate singur vehiculele demo din flota reală.
  dashboard: () => api<any>('/api/dashboard'),
  // Agenți „live" (dispatch/care/optimize): starea de MOMENT, care NU se persistă în agent_findings.
  // Fără asta, pe telefon apărea „N constatări" peste o listă goală (findings-urile lor nu se salvează).
  agentLive: (key: string, companyId?: number | null) => api<{ agent: string; findings: AgentFinding[] }>(`/api/agents/${encodeURIComponent(key)}/live` + (companyId != null ? '?companyId=' + encodeURIComponent(String(companyId)) : '')),
  agentFindingAction: (id: number, action: 'dismiss' | 'ack') => api(`/api/agents/findings/${id}/${action}`, { method: 'POST' }),
  // Semnalele CAN care se pot bifa in raportul „CAN detaliat", pentru vehiculele si perioada alese.
  // Aceeasi ruta o foloseste si web-ul — o singura lista, doua ecrane.
  canSignals: (imeis: string, from: string, to: string) =>
    api<any>('/api/can-signals?' + (imeis ? 'imei=' + encodeURIComponent(imeis) + '&' : '') + 'from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)),
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
