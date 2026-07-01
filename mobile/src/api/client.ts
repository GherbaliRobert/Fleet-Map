// Client HTTP: pe device folosește CapacitorHttp (URL absolut, ocolește CORS/cookie); în browser dev
// folosește fetch cu URL relativ (proxy Vite → backend). Injectează Bearer + tratează 401 global.
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const NATIVE_BASE = 'https://ratrack.ro';
export const API_BASE = Capacitor.isNativePlatform()
  ? ((import.meta as any).env.VITE_API_BASE || NATIVE_BASE)
  : ((import.meta as any).env.VITE_API_BASE || ''); // browser dev: gol → proxy Vite pe /api

let _token: string | null = null;
let _onUnauthorized: (() => void) | null = null;
export function setAuthToken(t: string | null) { _token = t; }
export function getAuthToken() { return _token; }
export function onUnauthorized(cb: () => void) { _onUnauthorized = cb; }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Timeout GLOBAL: CapacitorHttp NU are timeout implicit → un răspuns lent (ex. raport mare) atârna LA INFINIT
// (spinner care nu se mai oprea). Acum orice request se termină în cel mult atât + mesaj clar în loc de blocaj.
const DEFAULT_TIMEOUT_MS = 120000;
function _timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(
    () => reject(new ApiError(408, 'A durat prea mult. Încearcă o perioadă mai scurtă sau mai puține vehicule.')), ms));
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const method = opts.method || 'GET';
  const url = API_BASE + path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && _token) headers['Authorization'] = 'Bearer ' + _token;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  let status = 0;
  let data: any = null;
  try {
    if (Capacitor.isNativePlatform()) {
      // readTimeout ceva mai mare decât cursa noastră → mesajul nostru clar câștigă, iar readTimeout curăță requestul nativ.
      const reqP = CapacitorHttp.request({ url, method, headers, data: opts.body, connectTimeout: 20000, readTimeout: timeoutMs + 30000 } as any);
      const res: any = await Promise.race([reqP, _timeout(timeoutMs)]);
      status = res.status;
      data = res.data;
    } else {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: opts.body != null ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal,
        });
        status = res.status;
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } finally { clearTimeout(t); }
    }
  } catch (e: any) {
    if (e instanceof ApiError) throw e;                              // timeout-ul nostru (mesaj clar)
    if (e && e.name === 'AbortError') throw new ApiError(408, 'A durat prea mult. Încearcă o perioadă mai scurtă sau mai puține vehicule.');
    throw new ApiError(0, 'Eroare de rețea');
  }

  if (status === 401) { if (_onUnauthorized) _onUnauthorized(); throw new ApiError(401, (data && data.error) || 'Neautorizat'); }
  if (status < 200 || status >= 300) throw new ApiError(status, (data && data.error) || ('Eroare ' + status));
  return data as T;
}
