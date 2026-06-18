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
export function onUnauthorized(cb: () => void) { _onUnauthorized = cb; }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const method = opts.method || 'GET';
  const url = API_BASE + path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && _token) headers['Authorization'] = 'Bearer ' + _token;

  let status = 0;
  let data: any = null;
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({ url, method, headers, data: opts.body });
      status = res.status;
      data = res.data;
    } else {
      const res = await fetch(url, {
        method,
        headers,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      });
      status = res.status;
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    }
  } catch (e) {
    throw new ApiError(0, 'Eroare de rețea');
  }

  if (status === 401) { if (_onUnauthorized) _onUnauthorized(); throw new ApiError(401, (data && data.error) || 'Neautorizat'); }
  if (status < 200 || status >= 300) throw new ApiError(status, (data && data.error) || ('Eroare ' + status));
  return data as T;
}
