// Export raport în PDF/Excel. Pe web: descărcare blob. Pe device: scrie în Cache + Share.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, getAuthToken } from '../api/client';

function buildUrl(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx') {
  const e = encodeURIComponent;
  let q = `?from=${e(from)}&to=${e(to)}&format=${format}`;
  if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
  return API_BASE + `/api/reports/${e(type)}` + q;
}

export async function exportReport(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx') {
  const url = buildUrl(type, from, to, imeis, format);
  const token = getAuthToken();
  const headers: Record<string, string> = token ? { Authorization: 'Bearer ' + token } : {};
  const fname = `raport_${type}_${from.slice(0, 10)}.${format}`;

  if (Capacitor.isNativePlatform()) {
    // CapacitorHttp cu responseType 'blob' întoarce base64 în res.data.
    const res = await CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'blob' as any });
    if (res.status < 200 || res.status >= 300) throw new Error('Export eșuat (' + res.status + ')');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ path: fname, data: res.data as string, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fname, directory: Directory.Cache });
    await Share.share({ title: fname, files: [uri] });
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
