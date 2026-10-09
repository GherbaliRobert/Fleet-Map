// Un fișier făcut de SERVER, cerut cu POST (ex. „Aparate GPS" → Excel/PDF cu rândurile de pe ecran).
// E geamănul lui `salveazaDeLaServer` din export.ts, care știe doar GET: exportul inventarului are nevoie de
// POST, ca să trimită exact aparatele de pe ecran (GET-ul scoate tot inventarul). Dacă export.ts primește
// odată un `body` opțional, fișierul ăsta se poate șterge și apelul se mută acolo.
//   • Numele vine din antetul răspunsului, pus de `sendReport` pe server („RA-Track - Raport … - data"):
//     telefonul nu-și mai compune singur „raport_…" (regula de brand din CLAUDE.md).
//   • Cererea trece prin stratul nativ, cu tokenul (un fetch din pagină e blocat — serverul nu trimite CORS).
//   • Eroarea serverului ajunge pe ecran cu vorbele lui.
//   • `deschide` = „Vezi" (ca `salveazaDeLaServer`): foaia telefonului se deschide ca s-o citești (vizualizatorul de
//     PDF-uri) — ex. „Previzualizează" factura înainte de emitere (lotul 5); fără el = „Descarcă" / trimite.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, getAuthToken } from '../api/client';
import { numeDinAntet } from './export';

function eroareServer(data: any, status: number): string {
  if (data && typeof data === 'object' && data.error) return String(data.error);
  if (typeof data === 'string' && data) {
    // Cu responseType 'blob', un răspuns de eroare poate veni ca text sau ca base64 al textului.
    let dinB64 = '';
    try { dinB64 = new TextDecoder().decode(Uint8Array.from(atob(data.replace(/\s+/g, '')), (c) => c.charCodeAt(0))); } catch { /* nu e base64 */ }
    for (const t of [data, dinB64]) {
      try { const j = JSON.parse(t); if (j && j.error) return String(j.error); } catch { /* nu e JSON */ }
    }
  }
  if (status === 401) return 'Neautorizat';
  if (status === 403) return 'Acces interzis';
  return 'Eroare ' + status;
}

export async function salveazaPostDeLaServer(path: string, body: any, numeImplicit: string, opt: { deschide?: boolean } = {}): Promise<string> {
  const url = API_BASE + path;
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (Capacitor.isNativePlatform()) {
    let res: any;
    try {
      res = await CapacitorHttp.request({ url, method: 'POST', headers, data: body, responseType: 'blob' as any, connectTimeout: 20000, readTimeout: 120000 } as any);
    } catch { throw new Error('Eroare de rețea'); }
    if (res.status < 200 || res.status >= 300) throw new Error(eroareServer(res.data, res.status));
    const nume = numeDinAntet(res.headers, numeImplicit);
    const b64 = typeof res.data === 'string' ? res.data.replace(/\s+/g, '') : '';
    if (!b64) throw new Error('Serverul n-a trimis fișierul');
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
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(eroareServer(j, r.status));
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

// „RA-Track - Raport {nume} - zz.ll.aaaa.{ext}" — rezerva, dacă antetul lipsește (același tipar ca pe server).
export function numeBrand(numeRaport: string, ext: 'xlsx' | 'pdf'): string {
  const d = new Date();
  const zz = String(d.getDate()).padStart(2, '0'), ll = String(d.getMonth() + 1).padStart(2, '0');
  return 'RA-Track - Raport ' + numeRaport + ' - ' + zz + '.' + ll + '.' + d.getFullYear() + '.' + ext;
}
