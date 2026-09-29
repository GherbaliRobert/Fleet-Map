// Secțiunea „Montaj" (fondatori, Business) — cuvintele comune filei Parteneri și filei Contracte cu partenerii.
//
// Nimic de aici nu HOTĂRĂȘTE ceva despre un contract cu un partener: ce lipsește (`lipsuri`), capătul lui
// (`sfarsit`), trecerile dintre stări, golurile pentru care „Trimite la semnat" e refuzat și marja lucrărilor le
// dă SERVERUL (server.js: _lipsuriPartener, _trecereContract, /trimite, /api/montaj/lucrari). Aici stau doar
// etichetele, ca pe web (_mjStare, MJ_LIPSA), și data scrisă la prânz.
import { CTR_STARI } from './contracte';

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
