import { signal, computed } from '@preact/signals';
import { Api } from '../api/endpoints';
import type { Me, Position } from '../api/endpoints';
import { setAuthToken, onUnauthorized } from '../api/client';
import { saveToken, loadToken, clearToken, saveUser, loadUser } from '../lib/storage';

export const token = signal<string | null>(null);
export const me = signal<Me | null>(null);
export const authReady = signal(false);
export const vehicles = signal<Position[]>([]);
export const vehiclesLoading = signal(false);
export const unread = signal(0);
export const toastMsg = signal<{ text: string; err?: boolean } | null>(null);

export const offlineMinutes = computed(() =>
  (me.value && ((me.value as any).sys?.offline_minutes ?? (me.value as any).offline_minutes)) || 65
);

export function showToast(text: string, err = false) {
  toastMsg.value = { text, err };
  setTimeout(() => { if (toastMsg.value && toastMsg.value.text === text) toastMsg.value = null; }, 2600);
}

export function vehicleByImei(imei: string): Position | undefined {
  return vehicles.value.find((v) => v.imei === imei);
}

let pollTimer: any = null;
let polling = false;

export async function bootstrap() {
  const t = await loadToken();
  if (t) {
    token.value = t; setAuthToken(t);
    me.value = await loadUser<Me>();
    try { me.value = await Api.me(); } catch { /* token invalid → onUnauthorized curăță */ }
  }
  authReady.value = true;
}

export async function login(username: string, password: string) {
  const res = await Api.mobileLogin(username, password, 'android');
  token.value = res.token; setAuthToken(res.token);
  await saveToken(res.token);
  const m = { username: res.username, role: res.role, permissions: res.permissions, companyId: res.companyId, isSuper: res.isSuper, company: res.company, features: res.features } as Me;
  me.value = m; await saveUser(m);
  try { me.value = await Api.me(); await saveUser(me.value); } catch { /* ignore */ }
}

export async function logout() {
  stopPolling();
  token.value = null; me.value = null; vehicles.value = []; unread.value = 0;
  setAuthToken(null);
  await clearToken();
}

export async function refreshVehicles() {
  try { vehicles.value = await Api.live(); } catch { /* păstrează ultimele */ }
}
export async function refreshUnread() {
  try { const r = await Api.unreadCount(); unread.value = (r && (r as any).count) || 0; } catch { /* ignore */ }
}

export function startPolling(ms = 7000) {
  if (polling) return;
  polling = true;
  vehiclesLoading.value = vehicles.value.length === 0;
  refreshVehicles().finally(() => { vehiclesLoading.value = false; });
  pollTimer = setInterval(refreshVehicles, ms);
}
export function stopPolling() {
  polling = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

onUnauthorized(() => { logout(); });
