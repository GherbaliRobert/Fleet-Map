// Export raport în PDF/Excel. Pe web: descărcare blob. Pe device: scrie în Cache + Share.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, getAuthToken } from '../api/client';

function buildUrl(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx') {
  const e = encodeURIComponent;
  let q = `?from=${e(from)}&to=${e(to)}&format=${format}`;
  if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
  return API_BASE + `/api/reports/${e(type)}` + q;
}

// Descarcă (web) sau salvează-în-cache + Share (device) un fișier de la un URL autentificat.
async function fetchAndSave(url: string, fname: string) {
  const token = getAuthToken();
  const headers: Record<string, string> = token ? { Authorization: 'Bearer ' + token } : {};
  if (Capacitor.isNativePlatform()) {
    try {
      // CapacitorHttp cu responseType 'blob' întoarce base64 în res.data.
      const res = await CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'blob' as any, readTimeout: 120000 } as any);
      if (res.status < 200 || res.status >= 300) throw new Error('Export eșuat (' + res.status + ')');
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      await Filesystem.writeFile({ path: fname, data: res.data as string, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: fname, directory: Directory.Cache });
      await Share.share({ title: fname, files: [uri] });
    } catch (e: any) {
      // Storage plin / permisiune / share anulat → mesaj clar, nu eșec silențios.
      throw new Error(e?.message ? ('Export: ' + e.message) : 'Export indisponibil pe acest dispozitiv.');
    }
  } else {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error('Export eșuat (' + resp.status + ')');
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  }
}

export async function exportReport(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx') {
  await fetchAndSave(buildUrl(type, from, to, imeis, format), `raport_${type}_${from.slice(0, 10)}.${format}`);
}

// Export al unui raport DIN ISTORIC (după id) — endpoint-ul îl scoate din snapshot-ul salvat, izolat pe user.
export async function exportHistoryReport(id: number, type: string, format: 'pdf' | 'xlsx') {
  const url = API_BASE + `/api/reports/history/${encodeURIComponent(String(id))}?format=${format}`;
  await fetchAndSave(url, `raport_${type || 'istoric'}_${id}.${format}`);
}
