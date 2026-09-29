// Un fișier ales de om, trimis serverului.
//
// De obicei un fișier pleacă în JSON, ca base64 (`api()` + `fisierB64`): merge pe orice telefon și trece prin
// același client ca restul cererilor. Doar un fișier prea mare pentru JSON pleacă CRUD (application/octet-stream):
// limita JSON a serverului e 6 MB, iar base64 umflă fișierul cu o treime. Azi, singurul: o listă Teltonika nouă
// (ALL-CAN300 are peste 5 MB), pe aceeași ușă pe care o folosește pagina web (`POST /api/admin/masini/liste`).
//
//   • Pe telefon, cererea trece prin stratul nativ (un fetch din pagină e blocat: serverul nu trimite CORS), cu
//     `dataType: 'file'`: stratul decodează base64-ul și scrie OCTEȚII, exact cum trimite Capacitor un fișier pus
//     într-un fetch (native-bridge.js → `convertBody`; CapacitorHttpUrlConnection.setRequestBody). Merge de la
//     Android 8 în sus — sub el, Capacitor ar trimite un corp gol, deci oprim cererea înainte, cu vorbe.
//   • În browser (dezvoltare): fetch cu fișierul ca atare.
// Eroarea serverului ajunge pe ecran cu vorbele lui.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, APP_VERSIUNE, ApiError, getAuthToken } from '../api/client';

// Conținutul unui fișier, ca base64 (fără prefixul „data:…;base64,").
export function fisierB64(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || '').split(',')[1] || '');
    fr.onerror = () => rej(new Error('Nu am putut citi fișierul.'));
    fr.readAsDataURL(f);
  });
}

// Poate telefonul ăsta trimite un fișier crud? (Android 8+; în browser, oricând.)
export function potTrimiteCrud(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  const m = String((typeof navigator !== 'undefined' && navigator.userAgent) || '').match(/Android (\d+)/);
  return !m || Number(m[1]) >= 8;
}

export async function trimiteFisierCrud<T = any>(path: string, f: File, antete: Record<string, string> = {}, timeoutMs = 180000): Promise<T> {
  const url = API_BASE + path;
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream', 'X-RA-App': APP_VERSIUNE, ...antete };
  if (token) headers.Authorization = 'Bearer ' + token;
  let status = 0, data: any = null;
  if (Capacitor.isNativePlatform()) {
    const b64 = await fisierB64(f);
    try {
      const res: any = await CapacitorHttp.request({ url, method: 'POST', headers, data: b64, dataType: 'file', connectTimeout: 20000, readTimeout: timeoutMs } as any);
      status = res.status; data = res.data;
    } catch { throw new ApiError(0, 'Eroare de rețea'); }
  } else {
    try {
      const r = await fetch(url, { method: 'POST', headers, body: f });
      status = r.status;
      data = await r.text();
    } catch { throw new ApiError(0, 'Eroare de rețea'); }
  }
  if (typeof data === 'string') { try { data = data ? JSON.parse(data) : null; } catch { /* nu e JSON */ } }
  if (status < 200 || status >= 300) throw new ApiError(status, (data && typeof data === 'object' && data.error) || ('Eroare ' + status));
  return data as T;
}
