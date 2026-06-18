import { signal, computed } from '@preact/signals';
import { Api } from '../api/endpoints';
import type { Me, Position } from '../api/endpoints';
import { setAuthToken, onUnauthorized, API_BASE } from '../api/client';
import { saveToken, loadToken, clearToken, saveUser, loadUser, getTheme, setTheme } from '../lib/storage';

export const theme = signal<'dark' | 'light'>('dark');
export async function initTheme() {
  try { const t = await getTheme(); theme.value = (t === 'light' ? 'light' : 'dark'); } catch { /* dark */ }
  document.documentElement.setAttribute('data-theme', theme.value);
}
export async function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  theme.value = next;
  document.documentElement.setAttribute('data-theme', next);
  try { await setTheme(next); } catch { /* ignore */ }
}

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
  await initTheme();
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
  stopLive();
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

// ─── Live updates: WebSocket (latență mică + sarcină redusă la scară) cu fallback la polling ───
// Pe device: wss://ratrack.ro/?token=… (webview-ul nu trimite cookie → auth pe token). Pe web dev: ws://localhost:3000.
const WS_BASE = (API_BASE || 'http://localhost:3000').replace(/^http/i, 'ws');
let ws: WebSocket | null = null;
let wsWanted = false;
let wsReconnect: any = null;
let wsBackoff = 1500;
let livePollMs = 7000;

function upsertVehicle(pos: Position) {
  if (!pos || !pos.imei) return;
  const arr = vehicles.value;
  const i = arr.findIndex((v) => v.imei === pos.imei);
  if (i >= 0) { const next = arr.slice(); next[i] = { ...arr[i], ...pos }; vehicles.value = next; }
  else { vehicles.value = [...arr, pos]; }
}
function applyWs(msg: any) {
  if (!msg || !msg.type) return;
  if (msg.type === 'init' && Array.isArray(msg.data)) { vehicles.value = msg.data; vehiclesLoading.value = false; return; }
  if (msg.type === 'position') { upsertVehicle(msg.data); return; }
  if (msg.type === 'positions' && Array.isArray(msg.data)) {
    const map = new Map(vehicles.value.map((v) => [v.imei, v] as [string, Position]));
    for (const p of msg.data) if (p && p.imei) map.set(p.imei, { ...(map.get(p.imei) || {}), ...p } as Position);
    vehicles.value = Array.from(map.values());
    return;
  }
  if (msg.type === 'stale' && msg.data && msg.data.imei) { upsertVehicle({ imei: msg.data.imei, speed: 0, stale: true } as any); return; }
  if (msg.type === 'disconnect' && msg.data && msg.data.imei && msg.data.reason === 'purged') {
    vehicles.value = vehicles.value.filter((v) => v.imei !== msg.data.imei); return;
  }
}
function connectWs() {
  if (!wsWanted || !token.value) return;
  try {
    const sock = new WebSocket(WS_BASE + '/?token=' + encodeURIComponent(token.value));
    ws = sock;
    sock.onopen = () => { wsBackoff = 1500; stopPolling(); }; // WS sănătos → oprește polling-ul fallback
    sock.onmessage = (ev) => { try { applyWs(JSON.parse(ev.data)); } catch { /* ignore frame invalid */ } };
    sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (!wsWanted) return;
      startPolling(livePollMs); // fallback imediat la polling
      if (wsReconnect) clearTimeout(wsReconnect);
      wsReconnect = setTimeout(connectWs, wsBackoff);
      wsBackoff = Math.min(wsBackoff * 2, 30000); // backoff exponențial, plafon 30s
    };
  } catch { startPolling(livePollMs); } // WebSocket indisponibil → doar polling
}

// Pornește fluxul live: polling imediat (date instant + fallback) + încearcă WS (preia când e gata).
export function startLive(ms = 7000) {
  livePollMs = ms;
  startPolling(ms);
  if (!wsWanted) { wsWanted = true; connectWs(); }
}
export function stopLive() {
  wsWanted = false;
  if (wsReconnect) { clearTimeout(wsReconnect); wsReconnect = null; }
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  stopPolling();
}

onUnauthorized(() => { logout(); });
