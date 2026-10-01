// Secțiunea „Montaj" (fondatori, Business) — cuvintele comune filelor Parteneri și Contracte cu partenerii, plus
// cifra de pe file. (Calendarul, prima filă, își are cuvintele în lib/calendarMontaj.ts.)
//
// Nimic de aici nu HOTĂRĂȘTE ceva despre un contract cu un partener: ce lipsește (`lipsuri`), capătul lui
// (`sfarsit`), trecerile dintre stări, golurile pentru care „Trimite la semnat" e refuzat și marja lucrărilor le
// dă SERVERUL (server.js: _lipsuriPartener, _trecereContract, /trimite, /api/montaj/lucrari). Aici stau doar
// etichetele, ca pe web (_mjStare, MJ_LIPSA), și data scrisă la prânz.
import { CTR_STARI } from './contracte';
import { nrDe } from './numar';

// Cifra de pe o filă (_mjDeseneaza): fila Calendar arată câte contracte mai au mașini de programat și NIMIC când nu e
// niciunul („Calendar", nu „Calendar · 0"); celelalte file își arată cifra, și zero. null = fără cifră.
export function cifraFilei(fila: string, n: number): number | null {
  return n ? n : fila === 'calendar' ? null : 0;
}

// Cât de des ne facturează instalatorul (30.09): în același ritm facturăm și noi clientului montajul făcut de el —
// „ca să nu fim pe pierdere". Fără valoare = lunar, ca pe server (montaj.ritmFacturare).
export function ritmText(ritm: any): string { return ritm === 'saptamanal' ? 'săptămânal' : 'lunar'; }
// Nota de sub „Ne facturează" din fișa partenerului — aceleași cuvinte ca pe web.
export const NOTA_RITM = 'Montajul făcut de el îl facturăm clientului în același ritm: la sfârșitul săptămânii (luni–duminică) sau al lunii, cu toate zilele de montaj din ea, pe o singură factură. Intră în contractul cu el.';
// Rândul partenerului din fila Parteneri (_raxParteneriCorp): CUI, zonă, email, tarife, ritmul facturii lui.
// Singura abatere de la web, dinadins: „1 tarif scris" (pe web „1 tarife scrise").
export function subPartener(p: any): string {
  const n = Object.keys((p && p.tarife) || {}).length;
  return [p && p.cui, p && p.zona, p && p.email, n ? nrDe(n, 'tarif scris', 'tarife scrise') : 'fără tarife scrise',
    'ne facturează ' + ritmText(p && p.ritm_facturare)].filter(Boolean).join(' · ');
}
// Bifa din editarea contractului cu partenerul (_mjEditHtml): tarifele ȘI ritmul se reiau împreună, pe server
// (`tarife_din_partener` rescrie și `ritm_facturare`), deci bifa le spune pe amândouă, cu ritmul de acum al contractului.
export function bifaRetarif(c: any): string {
  return 'Reia din fișa partenerului tarifele de azi (Anexa nr. 1) și cât de des ne facturează (acum: ' + ritmText(c && c.ritm_facturare) + ')';
}

// Aceleași stări ca la clienți, cu un singur cuvânt schimbat: contractul unui partener nu pleacă „la client".
// NU se atinge CTR_STARI (proba îl compară cuvânt cu cuvânt cu contracts.js): schimbarea se face doar aici.
export function mjStare(status: string): [string, string] {
  if (status === 'trimis') return ['trimis la partener', CTR_STARI.trimis[1]];
  return CTR_STARI[status] || CTR_STARI.ciorna;
}

// Ce lipsește dintr-un contract cu un partener — aceleași cuvinte ca pe web (`var MJ_LIPSA`). Cheile vin de la
// server (`lipsuri`); aici e doar felul în care se citesc.
export const MJ_LIPSA: Record<string, string> = {
  cui: 'CUI-ul', sediu: 'sediul', reprezentant: 'reprezentantul', email: 'emailul', tarife: 'tarifele', actul: 'contractul semnat (PDF)',
};
// Lipsurile care se arată pe rândul cu „Completează" (fișa partenerului) — aceeași listă ca filtrul din
// `_mjLipsuriHtml` de pe web. Excepția e în ecran, la „tarife": ele lipsesc din CONTRACT (Anexa nr. 1, înghețată
// la creare), nu din fișă — fișa le repară doar când nici partenerul nu le are încă (vezi Montaj.tsx, `lipsuri`).
export const MJ_LIPSURI_FIRMA = ['cui', 'sediu', 'reprezentant', 'email', 'tarife'];

// Contractul „deschis" al unui partener: primul care nu e încheiat (ca _mjContractulPartenerului de pe web).
export function contractulPartenerului(contracte: any[] | null | undefined, partenerId: any): any | null {
  return (contracte || []).filter((c) => Number(c.partener_id) === Number(partenerId) && c.status !== 'incheiat')[0] || null;
}

// Din <input type="date"> în ms, la PRÂNZ local — exact ca web-ul (Date.parse(zi + 'T12:00:00')), la contractele
// partenerilor ȘI la data semnării contractului unui client (ContractPasi.tsx o ia tot de aici: o singură
// scriere). Web-ul citește unele din datele astea cu ziua UTC; miezul nopții local ar ieși acolo cu o zi mai
// devreme, prânzul cade în aceeași zi oriunde în Europa.
export function ziLaPranz(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const t = Date.parse(v + 'T12:00:00');
  return isNaN(t) ? null : t;
}
