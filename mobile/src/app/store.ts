import { signal, computed } from '@preact/signals';
import { Api } from '../api/endpoints';
import type { Me, Position } from '../api/endpoints';
import { setAuthToken, onUnauthorized, API_BASE } from '../api/client';
import { saveToken, loadToken, clearToken, saveUser, loadUser, getTheme, setTheme } from '../lib/storage';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const theme = signal<'dark' | 'light'>('dark');

// Full-screen: bara de stare suprapusă peste webview (edge-to-edge), cu iconițele
// adaptate la temă — temă închisă → iconițe deschise (Style.Dark), temă deschisă →
// iconițe închise (Style.Light). No-op în browser (doar pe nativ).
async function applyStatusBar(t: 'dark' | 'light') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: t === 'dark' ? Style.Dark : Style.Light });
  } catch { /* web / nesuportat */ }
}

export async function initTheme() {
  try { const t = await getTheme(); theme.value = (t === 'light' ? 'light' : 'dark'); } catch { /* dark */ }
  document.documentElement.setAttribute('data-theme', theme.value);
  applyStatusBar(theme.value);
}
export async function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  theme.value = next;
  document.documentElement.setAttribute('data-theme', next);
  applyStatusBar(next);
  try { await setTheme(next); } catch { /* ignore */ }
}

export const token = signal<string | null>(null);
export const me = signal<Me | null>(null);
export const authReady = signal(false);
export const livePos = signal<Position[]>([]);  // feed live (din /api/live + WS) — doar vehiculele care transmit
export const roster = signal<Position[]>([]);   // TOATE vehiculele înregistrate (din /api/devices) → apar și cele fără transmisie
// Flota afișată = pozițiile live + vehiculele înregistrate care NU sunt în live (marcate „fără transmisie")
export const vehicles = computed<Position[]>(() => {
  const live = livePos.value, r = roster.value;
  if (!r.length) return live;
  const liveSet = new Set(live.map((v) => v.imei));
  const offline = r.filter((d) => !liveSet.has(d.imei));
  return offline.length ? live.concat(offline) : live;
});
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
  token.value = null; me.value = null; livePos.value = []; roster.value = []; unread.value = 0;
  setAuthToken(null);
  await clearToken();
}

export async function refreshVehicles() {
  try { livePos.value = await Api.live(); } catch { /* păstrează ultimele */ }
}
// Roster complet (toate vehiculele înregistrate) — ca să apară și cele care nu transmit (super: toate companiile)
export async function refreshRoster() {
  try {
    const devs = await Api.devices();
    roster.value = (Array.isArray(devs) ? devs : [])
      .filter((d: any) => d && d.imei && d.status !== 'archived')
      .map((d: any) => ({
        imei: d.imei, name: d.name, plate: d.plate, vehicle_type: d.vehicle_type, company_name: d.company_name,
        latitude: d.latitude, longitude: d.longitude, speed: d.speed, angle: d.angle,
        timestamp: d.last_position_time || null, io: d.io_data || {},
      } as Position));
  } catch { /* păstrează ce e */ }
}
export async function refreshUnread() {
  try { const r = await Api.unreadCount(); unread.value = (r && (r as any).count) || 0; } catch { /* ignore */ }
}

let curPollMs = 7000;
let pollTick = 0;
function _pollOnce() {
  refreshVehicles();
  // Împrospătează rosterul periodic: timestamp-uri corecte pentru „fără transmisie" + vehiculele care revin online.
  if ((pollTick++ % 4) === 0) refreshRoster();
}
function _arm(ms: number) { if (pollTimer) clearInterval(pollTimer); curPollMs = ms; pollTimer = setInterval(_pollOnce, ms); }

// startPolling poate fi reapelat ca să SCHIMBE intervalul (ex. WS sănătos → backstop lent, nu oprire).
export function startPolling(ms = 7000) {
  if (polling) { if (ms !== curPollMs) _arm(ms); return; }
  polling = true;
  vehiclesLoading.value = vehicles.value.length === 0;
  refreshVehicles().finally(() => { vehiclesLoading.value = false; });
  _arm(ms);
}
export function stopPolling() {
  polling = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
const WS_BACKSTOP_MS = 25000; // poll de siguranță cât timp WS-ul e „conectat" (anti-stall silențios pe mobil)

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
  const arr = livePos.value;
  const i = arr.findIndex((v) => v.imei === pos.imei);
  if (i >= 0) { const next = arr.slice(); next[i] = { ...arr[i], ...pos }; livePos.value = next; }
  else { livePos.value = [...arr, pos]; }
}
function applyWs(msg: any) {
  if (!msg || !msg.type) return;
  if (msg.type === 'init' && Array.isArray(msg.data)) { livePos.value = msg.data; vehiclesLoading.value = false; return; }
  if (msg.type === 'position') { upsertVehicle(msg.data); return; }
  if (msg.type === 'positions' && Array.isArray(msg.data)) {
    const map = new Map(livePos.value.map((v) => [v.imei, v] as [string, Position]));
    for (const p of msg.data) if (p && p.imei) map.set(p.imei, { ...(map.get(p.imei) || {}), ...p } as Position);
    livePos.value = Array.from(map.values());
    return;
  }
  if (msg.type === 'stale' && msg.data && msg.data.imei) { upsertVehicle({ imei: msg.data.imei, speed: 0, stale: true } as any); return; }
  if (msg.type === 'disconnect' && msg.data && msg.data.imei && msg.data.reason === 'purged') {
    livePos.value = livePos.value.filter((v) => v.imei !== msg.data.imei); return;
  }
}
function connectWs() {
  if (!wsWanted || !token.value) return;
  try {
    const sock = new WebSocket(WS_BASE + '/?token=' + encodeURIComponent(token.value));
    ws = sock;
    sock.onopen = () => { wsBackoff = 1500; startPolling(WS_BACKSTOP_MS); }; // WS sănătos → poll de siguranță lent (nu oprire) → imun la WS blocat silențios
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
  refreshRoster(); // încarcă rosterul (toate vehiculele înregistrate) la pornire/foreground
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
