// Export raport în PDF/Excel + hârtiile făcute de server. Pe web: descărcare blob. Pe device: scrie în Cache + Share.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, getAuthToken } from '../api/client';
import { reportOptsQuery, type ReportOpts } from '../api/endpoints';

// Calea raportului (fără adresa serverului): o cere salveazaDeLaServer, ca pe orice altă hârtie.
function caleRaport(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx', opts?: ReportOpts) {
  const e = encodeURIComponent;
  let q = `?from=${e(from)}&to=${e(to)}&format=${format}`;
  if (imeis && imeis.length) q += `&imei=${imeis.map(e).join(',')}`;
  return `/api/reports/${e(type)}` + q + reportOptsQuery(opts);
}

// Rapoartele trec pe ACELAȘI drum ca hârtiile de mai jos: numele fișierului vine din antetul serverului
// („RA-Tracks - Raport Traseu - 06.07.2026.xlsx", regula casei din report_export.js → sendReport). Până pe
// 29.09 telefonul le salva „raport_<tip>_<data>" — singurele descărcări rămase fără numele brandat.
// `raport_…` rămâne doar ca rezervă, dacă antetul lipsește.
export async function exportReport(type: string, from: string, to: string, imeis: string[] | undefined, format: 'pdf' | 'xlsx', opts?: ReportOpts) {
  await salveazaDeLaServer(caleRaport(type, from, to, imeis, format, opts), `raport_${type}_${from.slice(0, 10)}.${format}`);
}

// Export al unui raport DIN ISTORIC (după id) — endpoint-ul îl scoate din snapshot-ul salvat, izolat pe user.
export async function exportHistoryReport(id: number, type: string, format: 'pdf' | 'xlsx') {
  await salveazaDeLaServer(`/api/reports/history/${encodeURIComponent(String(id))}?format=${format}`, `raport_${type || 'istoric'}_${id}.${format}`);
}

// ─── Un fișier făcut de SERVER: contractul, actul adițional, oferta, factura, un scan urcat ─────
// UN SINGUR drum pentru toate hârtiile, ca pe web (`raxHartie`): telefonul nu desenează niciun PDF,
// ci cere fișierul generatorului de pe server și i-l predă telefonului sub numele din ANTETUL
// răspunsului („RA-Tracks - Contract RAT-C-2026-0001 - Firma.pdf"), nu sub unul compus aici.
//   • Cererea trece prin stratul nativ, cu tokenul: un <a href> nu cară tokenul, iar un fetch() din
//     pagină e blocat (serverul nu trimite antete CORS — verificat 13.09, vezi VehicleDocs.tsx).
//   • `deschide` = „Vezi": foaia telefonului se deschide ca s-o citești (vizualizatorul de PDF-uri);
//     fără el = „Descarcă": aceeași foaie, de unde o salvezi în Fișiere/Drive sau o trimiți. Fără
//     pluginuri noi — Filesystem + Share, exact ca exportul de rapoarte.
//   • Eroarea serverului ajunge pe ecran cu vorbele lui (ex. 503 „Generatorul de PDF nu e disponibil").
// Întoarce numele cu care s-a salvat.
export function numeDinAntet(antete: Record<string, any> | null | undefined, implicit: string): string {
  const h = antete || {};
  const cheie = Object.keys(h).find((k) => k.toLowerCase() === 'content-disposition');
  const cd = String((cheie && h[cheie]) || '');
  // Antetul poartă numele de DOUĂ ori: `filename="…"` fără diacritice și `filename*=UTF-8''…`, cel
  // adevărat. Se ia ÎNTÂI varianta UTF-8 (aceeași capcană ca `_numeDinAntet` de pe web, 22.09).
  const m = cd.match(/filename\*=\s*UTF-8''([^;]+)/i) || cd.match(/filename=\s*"?([^";]+)"?/i);
  if (!m) return implicit;
  try { return decodeURIComponent(m[1]).trim() || implicit; } catch { return String(m[1]).trim() || implicit; }
}
function _eroareServer(data: any, status: number): string {
  if (data && typeof data === 'object' && data.error) return String(data.error);
  if (typeof data === 'string' && data) {
    // Cu responseType 'blob', un răspuns de eroare poate veni ca text sau ca base64 al textului.
    const dinB64 = (() => { try { return new TextDecoder().decode(Uint8Array.from(atob(data.replace(/\s+/g, '')), (c) => c.charCodeAt(0))); } catch { return ''; } })();
    for (const t of [data, dinB64]) {
      try { const j = JSON.parse(t); if (j && j.error) return String(j.error); } catch { /* nu e JSON */ }
    }
  }
  if (status === 401) return 'Neautorizat';
  if (status === 404) return 'Fișierul nu există pe server';
  return 'Eroare ' + status;
}
export async function salveazaDeLaServer(path: string, numeImplicit: string, opt: { deschide?: boolean } = {}): Promise<string> {
  const url = API_BASE + path;
  const token = getAuthToken();
  const headers: Record<string, string> = token ? { Authorization: 'Bearer ' + token } : {};
  if (Capacitor.isNativePlatform()) {
    let res: any;
    try {
      res = await CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'blob' as any, connectTimeout: 20000, readTimeout: 120000 } as any);
    } catch { throw new Error('Eroare de rețea'); }
    if (res.status < 200 || res.status >= 300) throw new Error(_eroareServer(res.data, res.status));
    const nume = numeDinAntet(res.headers, numeImplicit);
    const b64 = typeof res.data === 'string' ? res.data.replace(/\s+/g, '') : '';
    if (!b64) throw new Error('Serverul n-a trimis fișierul');
    // Numărul unui act adițional are „/" în el (RAT-C-2026-0001/A1): pe disc ar fi un dosar. Doar calea
    // se curăță; numele arătat rămâne cel din antet.
    const cale = nume.replace(/[\\/:*?"<>|]+/g, '-');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    try {
      await Filesystem.writeFile({ path: cale, data: b64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: cale, directory: Directory.Cache });
      await Share.share({ title: nume, dialogTitle: opt.deschide ? 'Deschide cu…' : 'Salvează sau trimite', files: [uri] } as any);
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || ''))) return nume; // omul a închis foaia — nu e o eroare
      throw new Error(e?.message || 'Nu am putut salva fișierul pe acest telefon.');
    }
    return nume;
  }
  // În browser (dezvoltare): aceeași cerere, cu fetch.
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(_eroareServer(j, r.status));
  }
  const antete: Record<string, string> = {};
  r.headers.forEach((v, k) => { antete[k] = v; });
  const nume = numeDinAntet(antete, numeImplicit);
  const u = URL.createObjectURL(await r.blob());
  if (opt.deschide) window.open(u, '_blank');
  else {
    const a = document.createElement('a');
    a.href = u; a.download = nume;
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => { try { URL.revokeObjectURL(u); } catch { /* */ } }, 60000);
  return nume;
}
