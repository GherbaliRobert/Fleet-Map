// Companii (fondatori) — cuvintele și regulile de AFIȘARE ale registrului de clienți și ale fișei firmei.
//
// Nimic de aici nu socotește bani, stări de acces sau dosare: toate vin gata de la server (`access`,
// `neplata`, `dosar`, `ultimaActivitate` din /api/companies, venitul lunar din /api/companies/mrr, prețul din
// /overview). Aici stau doar filtrele, căutarea, sortarea și vorbele — copiate de pe web
// (public/index.html: CO_FILTRE, _coCauta, _coValoare, _coActivitate, _coLunar, _raxAccessCell,
// dosarPastila, _raxCodDetalii), ca pe telefon să se citească la fel ca pe web.
import { raCauta } from './format';
import { DOSAR_FEL, de } from './contracte';
import { adresaFirmei } from '../components/FondatorUi';

// Adresa dosarului juridic al unei firme (ecranele Contracte). UN SINGUR loc, ca toate intrările
// (pastila din registru, fila Contract, „Deschide dosarul" după Client nou, oferta care a devenit client)
// să ducă în același loc.
export const rutaDosar = (companyId: any) => '/admin/contracts/' + encodeURIComponent(String(companyId));
// Fișa firmei, cu fila de deschis (detalii / utilizatori / vehicule / facturi / abonament / contract).
// Aceeași adresă pe care o folosesc și celelalte ecrane ale fondatorului (FondatorUi.adresaFirmei) — una singură.
export const rutaFisa = (companyId: number | string, fila?: string) => adresaFirmei(companyId, fila);

export const ZILE_LINISTE = 14; // după atâtea zile fără niciun semnal, firma se scrie cu portocaliu
const ZI = 86400000;

// Momentul, cum vine din bază: număr (ms) sau text ISO.
export function ms(v: any): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}
export function dataRo(v: any): string {
  const t = ms(v);
  return t ? new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '—';
}
export function dataOraRo(v: any): string {
  const t = ms(v);
  return t ? new Date(t).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '—';
}
// „1.234 lei" — sumă întreagă, cum o arată web-ul în registru.
export function leiScurt(v: any): string { return (Number(v) || 0).toLocaleString('ro-RO') + ' lei'; }
export function nrVeh(n: any): string { const x = Number(n) || 0; return x === 1 ? '1 vehicul' : x + de(x) + 'vehicule'; }
export function nrUseri(n: any): string { const x = Number(n) || 0; return x === 1 ? '1 utilizator' : x + de(x) + 'utilizatori'; }
export function nrPlati(n: any): string { const x = Number(n) || 0; return x === 1 ? '1 plată' : x + de(x) + 'plăți'; }

// ── Filtrele registrului (CO_FILTRE). Numărătoarea se face pe TOATĂ lista, nu pe rezultatul căutării. ──
// „Fără contract" = nicio hârtie în vigoare sau pe drum: niciun contract, SAU unul încheiat la o firmă care
// intră în continuare. Același înțeles ca banda roșie din Contracte.
export function faraContract(c: any): boolean {
  if (c.is_demo || !c.dosar) return false;
  if (c.dosar.nivel === 'lipsa') return true;
  return c.dosar.nivel === 'incheiat' && (c.access || {}).status !== 'expired';
}
export function inRestanta(c: any): boolean { return !!(c.neplata && c.neplata.faza === 'avertisment'); }
export function suspendata(c: any): boolean { return !c.is_demo && (c.access || {}).status === 'expired'; }
export function faraSemnal(c: any, acum = Date.now()): boolean {
  if (c.is_demo || !(Number(c.device_count) > 0)) return false;
  const ua = ms(c.ultimaActivitate);
  return !ua || (acum - ua) > ZILE_LINISTE * ZI;
}
export type Ton = '' | 'rau' | 'atentie';
export const CO_FILTRE: { id: string; et: string; f: (c: any) => boolean; ton?: Ton }[] = [
  { id: 'toate', et: 'Toate', f: () => true },
  { id: 'contract', et: 'Fără contract', f: faraContract, ton: 'rau' },
  { id: 'restanta', et: 'Restanță', f: inRestanta, ton: 'atentie' },
  { id: 'suspendate', et: 'Suspendate', f: suspendata, ton: 'rau' },
  { id: 'liniste', et: 'Fără semnal', f: (c) => faraSemnal(c), ton: 'atentie' },
  { id: 'demo', et: 'Demo', f: (c) => !!c.is_demo },
];

// Căutarea se uită în tot ce ai putea avea în mână când sună telefonul (fără diacritice, fără spații:
// „0722 123 456" găsește și „0722123456").
export function cautaFirma(c: any, q: string): boolean {
  if (!q) return true;
  const ad = c.admin || {};
  return [c.name, c.plan, c.cui, c.reg_com, c.contact_email, c.phone, ad.nume, ad.email, ad.telefon]
    .some((v) => v != null && v !== '' && raCauta(q, v));
}

// ── Sortarea (un tap sortează, al doilea întoarce) ──
export type ColSort = 'name' | 'devices' | 'users' | 'lunar' | 'paid' | 'activ';
export const CO_SORT: { col: ColSort; et: string }[] = [
  { col: 'name', et: 'Companie' }, { col: 'devices', et: 'Vehicule' }, { col: 'users', et: 'Utilizatori' },
  { col: 'lunar', et: 'Lunar' }, { col: 'paid', et: 'Încasat' }, { col: 'activ', et: 'Ultima activitate' },
];
export function valoareSort(c: any, col: ColSort, mrr: any): string | number {
  switch (col) {
    case 'name': return String(c.name || '').toLowerCase();
    case 'devices': return Number(c.device_count) || 0;
    case 'users': return Number(c.user_count) || 0;
    case 'lunar': return (mrr && mrr.firme && Number(mrr.firme[c.id])) || 0;
    case 'paid': return Number(c.paid_total) || 0;
    case 'activ': return ms(c.ultimaActivitate);
    default: return 0;
  }
}
export function sorteaza(rows: any[], s: { col: ColSort; dir: number }, mrr: any): any[] {
  return rows.slice().sort((a, b) => {
    const va = valoareSort(a, s.col, mrr), vb = valoareSort(b, s.col, mrr);
    if (va < vb) return -s.dir;
    if (va > vb) return s.dir;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ro');
  });
}

// ── Celulele unui cartonaș ──
// Fel de pastilă: '' (gri) · 'ok' (verde) · 'warn' (portocaliu) · 'bad' (roșu).
export type Fel = '' | 'ok' | 'warn' | 'bad';

// Accesul, ca pe web (_raxAccessCell): un client suspendat se vede SUSPENDAT, cu motivul — trei cauze,
// care se rezolvă altfel fiecare — iar o restanță în derulare arată câte zile mai are.
export function accesPastila(c: any): { et: string; fel: Fel; sub: string } {
  const a = (c && c.access) || {};
  const np = (c && c.neplata) || null;
  if (a.status === 'expired') {
    const et = a.motiv === 'manual' ? 'oprit de noi' : (a.motiv === 'neplata' ? 'suspendat — neplată' : 'suspendat — abonament');
    return { et, fel: 'bad', sub: np && np.factura ? 'factura ' + (np.factura.numar || '') : '' };
  }
  if (np && np.faza === 'avertisment') {
    return { et: 'restanță · ' + np.zilePanaLaSuspendare + ' zile', fel: 'warn', sub: 'factura ' + ((np.factura && np.factura.numar) || '') };
  }
  const map: Record<string, [string, Fel]> = { unlimited: ['nelimitat', ''], active: ['activ', 'ok'], grace: ['în grație', 'warn'] };
  const m = map[a.status] || map.unlimited;
  return { et: m[0], fel: m[1], sub: a.access_until ? 'până ' + dataRo(a.access_until) : '' };
}

// „Ultima activitate": liniștea prea lungă e un client care se stinge.
export function activitate(c: any, acum = Date.now()): { t: string; cald: boolean; muted: boolean } {
  if (c.is_demo) return { t: '—', cald: false, muted: true };
  if (!(Number(c.device_count) > 0)) return { t: 'fără vehicule', cald: false, muted: true };
  const ua = ms(c.ultimaActivitate);
  if (!ua) return { t: 'niciodată', cald: true, muted: false };
  const z = Math.floor((acum - ua) / ZI);
  const t = z <= 0 ? 'azi' : (z === 1 ? 'ieri' : 'acum ' + z + de(z) + 'zile');
  return { t, cald: z >= ZILE_LINISTE, muted: false };
}

// „Lunar": suma vine de la server (motorul facturii). Fără preț pus → „0 lei", cu portocaliu.
export function lunar(c: any, mrr: any): { t: string; cald: boolean; muted: boolean; bold: boolean } {
  if (c.is_demo) return { t: '—', cald: false, muted: true, bold: false };
  if (!mrr) return { t: '…', cald: false, muted: true, bold: false };
  const v = Number((mrr.firme || {})[c.id]) || 0;
  if (!v) return { t: '0 lei', cald: true, muted: false, bold: false };
  return { t: leiScurt(v), cald: false, muted: false, bold: true };
}

// Pastila dosarului juridic (dosarPastila). Null = nu se arată (demo / fără dosar).
export function dosarPastila(dosar: any): { et: string; fel: Fel; titlu: string } | null {
  if (!dosar || dosar.nivel === 'demo') return null;
  return {
    et: dosar.eticheta || 'Dosarul juridic',
    fel: (DOSAR_FEL[dosar.nivel] || '') as Fel,
    titlu: dosar.text ? 'Lipsește din dosar: ' + dosar.text : (dosar.eticheta || 'Dosarul juridic') + ' — apasă pentru dosarul juridic al firmei',
  };
}

// Accesul în fila Detalii (_raxCodDetalii): eticheta lungă + culoarea.
export function accesDetalii(a: any): { et: string; culoare: string } {
  a = a || {};
  const et = ({ unlimited: 'Nelimitat', active: 'Activ', grace: 'În grație (expirat — 15 zile)', expired: 'Expirat' } as Record<string, string>)[a.status] || (a.status || '—');
  const culoare = a.status === 'expired' ? 'var(--red)' : (a.status === 'grace' ? 'var(--co-warn)' : 'var(--co-ok)');
  return { et: et + (a.access_until ? ' · până ' + dataRo(a.access_until) : ''), culoare };
}

// Rolurile, cu numele de pe web (_raxCodUsers).
export const ROL_ET: Record<string, string> = {
  superadmin: 'Super-admin', company_admin: 'Administrator', admin: 'Administrator', manager: 'Manager',
  dispatcher: 'Dispecer', client: 'Client', viewer: 'Vizualizare',
};

// Persoanele de contact: pe server stau ca JSON (text sau listă).
export type Contact = { name: string; role: string; phone: string; email: string };
export function contacte(v: any): Contact[] {
  let l: any = v;
  if (!Array.isArray(l)) { try { l = JSON.parse(v || '[]'); } catch { l = []; } }
  if (!Array.isArray(l)) return [];
  return l.map((p: any) => ({ name: String((p && p.name) || ''), role: String((p && p.role) || ''), phone: String((p && p.phone) || ''), email: String((p && p.email) || '') }));
}

// Emailul, verificat ca pe web (raxCoAddAdmin) — serverul îl verifică oricum din nou.
export const EMAIL_OK = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
