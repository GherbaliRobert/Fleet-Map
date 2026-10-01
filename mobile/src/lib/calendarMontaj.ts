// Calendarul de montaj (Business → Montaj, PRIMA filă) pe telefon — ce face pagina în blocul „calendarul de montaj"
// (public/index.html: _mjcCalendarHtml, _mjcDeProgramatHtml, _mjcFormHtml, _mjcLucrareHtml, raxMjCalLuna …
// raxMjCalSterge), pe aceleași rute.
//
// Alin, 30.09: „în secțiunea Montaj, calendar de programare… să pot selecta eu ziua, și să-mi arate jos ce am de
// instalat și disponibilitatea". SINGURUL loc în care se programează montajul unui contract SEMNAT: fiecare zi
// programată e o lucrare („programat"). Ce mai e de programat (Anexa nr. 2 minus lucrări), termenul de 30 de zile,
// prețurile (din anexă) și costul (din tarifele instalatorului), „montată cu mai puține" (restul se întoarce singur
// la „De programat") — toate le face SERVERUL (montaj.js, contracts.js). Telefonul doar arată ce primește și trimite
// ce a ales omul; refuzurile serverului apar cu vorbele lui.
//
// Regulile de AFIȘARE de aici (cum se scrie o zi, „N mașini", culoarea termenului, grila lunii, ce se propune în
// formular) sunt copiate din pagină și LEGATE de ea printr-o probă care rulează bucata paginii și pe a telefonului pe
// aceleași cazuri. Schimbi una pe web → proba pică până o schimbi și aici.
//
// Refăcut pe 01.10, odată cu pagina (macheta aprobată de Alin): culoarea zilei după confirmări (verde = au confirmat
// instalatorul și clientul, galben = mai lipsește una, gri = montată), cele două confirmări vorbite la telefon, anularea
// cu motiv (o zi anulată rămâne în istoric) și „Reprogramează". Textele istoricului, încărcarea instalatorilor și nota de
// stoc le scrie SERVERUL (montaj.js); telefonul doar le arată.
import { api } from '../api/client';
import { MONTAJ_TIPURI, zi as ziMs } from './contracte';
import { nrDe } from './numar';

// ─── Ce trimite serverul (GET /api/montaj/calendar?luna=AAAA-LL) ───
export type CalLucrare = {
  id: number; company_id: number; company_name?: string | null; contract_id?: number | null;
  partener_id?: number | null; partener_nume?: string | null; zi: string; status: string; masini: number; items?: any[];
  // Confirmările (01.10): starea le-o dă serverul (montaj.stareConfirmare / textConfirmare).
  conf?: string | null; conf_text?: string | null; confirmat_instalator?: boolean; confirmat_client?: boolean;
};
// Un rând din istoric (zile montate sau anulate), cu textele scrise de server (montaj.textIstoric).
export type CalIstoric = CalLucrare & { text: string; detaliu: string; anulata: boolean; motiv?: string | null; reprogramat_ca?: number | null; poateReprograma: boolean };
export type CalTip = { tip: string; eticheta: string; inAnexa: number; programate: number; montate: number; ramase: number; pretClient?: number | null; peMasina: number; aparat?: string | null };
export type CalTermen = { pana: number; deMontat: number; montate: number; zile: number; stare: string; text: string };
export type CalContract = {
  contract_id: number; company_id: number; company_name?: string | null; number?: string | null;
  termen: CalTermen | null; text: string; masini: number; programate: number; montate: number; ramase: number; tipuri: CalTip[];
};
export type CalPartener = { id: number; name: string; active: boolean };
export type CalStoc = { tip: string; eticheta: string; depozit: number; instalator: number };
export type CalIncarcare = { masini: number; clienti: string[]; text: string };
export type CalDate = {
  luna: string; azi: string; lucrari: CalLucrare[]; deProgramat: CalContract[]; stari: Record<string, string>;
  parteneri: CalPartener[]; stoc: CalStoc[];
  // 01.10: zilele încă programate (oricare lună), istoricul, ce are fiecare instalator în fiecare zi, motivele anulării.
  programate?: CalLucrare[]; istoric?: CalIstoric[]; incarcare?: Record<string, Record<string, CalIncarcare>>; textLiber?: string;
  motive?: Record<string, string>;
};

// ─── Rutele (toate requireSuperadmin: clientul nu vede nimic de aici) ───
export const calendarMontaj = (luna?: string | null) =>
  api<CalDate>('/api/montaj/calendar' + (luna ? '?luna=' + encodeURIComponent(luna) : ''));
export const programeazaMontaj = (b: ReturnType<typeof corpProgramare>) =>
  api<{ ok: boolean; lucrare: any }>('/api/montaj/programeaza', { method: 'POST', body: b });
export const mutaLucrarea = (id: number, b: ReturnType<typeof corpMutare>) =>
  api<{ ok: boolean; lucrare: any }>(`/api/montaje/${id}/muta`, { method: 'POST', body: b });
export const lucrareMontata = (id: number, b: ReturnType<typeof corpMontata>) =>
  api<{ ok: boolean; lucrare: any; inapoi_la_programat: number }>(`/api/montaje/${id}/montata`, { method: 'POST', body: b });
// 01.10: o zi programată se ANULEAZĂ cu motiv (rămâne în istoric), nu se mai șterge; confirmările se bifează pe ea.
export const confirmaLucrarea = (id: number, b: { instalator?: boolean; client?: boolean }) =>
  api<{ ok: boolean; confirmat_instalator: boolean; confirmat_client: boolean }>(`/api/montaje/${id}/confirmari`, { method: 'POST', body: b });
export const anuleazaLucrarea = (id: number, b: ReturnType<typeof corpAnulare>) =>
  api<{ ok: boolean; reprogramata: { id: number; zi: string } | null }>(`/api/montaje/${id}/anuleaza`, { method: 'POST', body: b });
export const reprogrameazaLucrarea = (id: number, b: ReturnType<typeof corpReprogramare>) =>
  api<{ ok: boolean; reprogramata: { id: number; zi: string } | null }>(`/api/montaje/${id}/reprogrameaza`, { method: 'POST', body: b });
// Nota de stoc din programare: ce are instalatorul la el și ce trebuie să-i mai duci (o socotește serverul).
export const notaStocMontaj = (b: { contract_id: number; partener_id: number | null; cate: Record<string, number> }) =>
  api<{ text: string; lipsa: any[] }>('/api/montaj/nota-stoc', { method: 'POST', body: b });
// Numele firmei unui contract care nu e la „De programat" (nesemnat, sau fără montaj de aparat în anexă), din lista
// contractelor — pentru „… n-are nimic de programat acum". Pe web îl dă lista firmelor; null = nu s-a găsit.
export async function numeFirmaContract(contractId: any): Promise<string | null> {
  try {
    const j: any = await api<any>('/api/contracts');
    const c = ((j && j.contracte) || []).find((x: any) => Number(x.id) === Number(contractId));
    return (c && c.company_name) || null;
  } catch (e) { return null; }
}

// Adresa care deschide calendarul cu programarea pregătită pentru un contract (web: raxDrumMontaj → _raxMj.cal.pre).
// Din „Drumul clientului" („Programează montajul") și din fișă („Programează în calendar"). Ecranul Montaj o citește
// o dată și își curăță adresa, ca o întoarcere pe ecran să nu redeschidă formularul.
export const rutaCalendarMontaj = (contractId: any) => '/admin/montaj?fila=calendar&contract=' + encodeURIComponent(String(contractId));

// ─── Cuvintele paginii (aceleași litere) ───
export const MJC_LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const MJC_ZILE = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
// Numele întreg al zilei — doar pe telefon (titlul foii unei zile și lista zilelor cu montaj), unde grila n-are loc
// să scrie clientul: „miercuri, 10.03.2027".
const ZILE_NUME = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
export const CAL_TEXT = {
  sub: 'Apasă pe o zi: se deschide fereastra zilei, unde programezi, confirmi, muți sau anulezi. Alege un instalator ca să vezi doar zilele lui ocupate.',
  subDeProgramat: 'Contractele semnate, cu ce a mai rămas de montat. Termenul e cel din contract: 30 de zile de la încasarea avansului.',
  golDeProgramat: 'Niciun contract semnat nu mai are mașini de montat.',
  nimic: 'Nimic de programat: niciun contract semnat nu mai are mașini rămase.',
  maiPutine: 'Dacă s-au montat mai puține, celelalte se întorc singure la „Ce ai de montat".',
  faraZi: 'Alege ziua montajului.',
  faraZiMuta: 'Alege ziua.',
  // 01.10 — confirmările, anularea, reprogramarea (aceleași litere ca pe web)
  confirmariNota: 'Fără amândouă bifele, ziua apare galbenă în calendar („de confirmat”). Le poți bifa și mai târziu, din ziua programată.',
  faraMotiv: 'Alege motivul anulării.',
  faraZiNoua: 'Alege ziua nouă.',
};

// „10.03.2027" din „2027-03-10" (_mjcZiRo). Altceva → gol.
export function ziRo(zi: any): string {
  const p = String(zi || '').split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : '';
}
// „1 mașină", „5 mașini", „20 de mașini" (_mjcMasini).
export function masini(n: any): string { return nrDe(n, 'mașină', 'mașini'); }
// Montată = executată (și, după ea, facturată) — aceleași stări ca montaj.STARI_MONTATE (_mjcMontata).
export function esteMontata(st: any): boolean { return st === 'executat' || st === 'facturat_de_partener' || st === 'facturat_clientului'; }
// „10× Instalare dispozitiv GPS, 6× Instalare modul LV-CAN" (_mjcCeSeMonteaza).
export function ceSeMonteaza(items: any): string {
  return (Array.isArray(items) ? items : []).map((r: any) => {
    const t = MONTAJ_TIPURI.find((x) => x[0] === r.tip);
    return (r.buc || 0) + '× ' + (t ? t[1] : r.tip);
  }).join(', ');
}
export function ziCuNume(zi: string): string {
  const p = String(zi || '').split('-').map(Number);
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return ziRo(zi);
  return ZILE_NUME[(new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7] + ', ' + ziRo(zi);
}

// ─── Luna ───
// „octombrie 2026" (capul calendarului). Lună stricată → gol.
export function lunaText(luna: string): string {
  const y = parseInt(String(luna || '').slice(0, 4), 10), m = parseInt(String(luna || '').slice(5, 7), 10);
  return y && m ? MJC_LUNI[m - 1] + ' ' + y : '';
}
// ‹ / › / „Azi" (raxMjCalLuna): pas -1 / +1 lângă luna arătată; 0 = luna zilei de azi, cum o dă serverul.
export function lunaAlaturata(luna: string, pas: number, azi: string): string {
  if (!pas) return String(azi || '').slice(0, 7);
  let y = parseInt(String(luna || '').slice(0, 4), 10), m = parseInt(String(luna || '').slice(5, 7), 10) + pas;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  return y + '-' + ('0' + m).slice(-2);
}
// Grila lunii (_mjcCalendarHtml): câte căsuțe goale înaintea zilei de 1 (săptămâna începe luni) și zilele, cu
// sâmbăta/duminica și ziua de azi. null = luna nu e încă știută („Se încarcă…").
export type ZiGrila = { zi: string; nr: number; wk: boolean; azi: boolean };
export function grilaLunii(luna: string, azi: string): { gol: number; zile: ZiGrila[] } | null {
  const y = parseInt(String(luna || '').slice(0, 4), 10), m = parseInt(String(luna || '').slice(5, 7), 10);
  if (!y || !m) return null;
  const gol = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, cate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const zile: ZiGrila[] = [];
  for (let zz = 1; zz <= cate; zz++) {
    const zi = luna + '-' + ('0' + zz).slice(-2);
    zile.push({ zi, nr: zz, wk: ((gol + zz - 1) % 7) >= 5, azi: zi === azi });
  }
  return { gol, zile };
}
// Lucrările pe zile; cu un instalator ales, doar ale lui (zilele LUI ocupate).
export function lucrariPeZi(lucrari: CalLucrare[] | null | undefined, part: string): Record<string, CalLucrare[]> {
  const peZi: Record<string, CalLucrare[]> = {};
  (lucrari || []).forEach((l) => {
    if (part && String(l.partener_id || '') !== part) return;
    (peZi[l.zi] = peZi[l.zi] || []).push(l);
  });
  return peZi;
}
// Culoarea unei zile (_mjcClasa): gri = montată, verde = au confirmat amândoi, galben = mai lipsește o confirmare.
export function clasaLucrare(l: CalLucrare): string { return esteMontata(l.status) ? 'mjc-mont' : (l.conf === 'confirmat' ? 'mjc-ok' : 'mjc-conf'); }
// Tot ce spune o lucrare din calendar, pe un rând: „Calendar SRL · 3 mașini · Instal Vest SRL · programat".
export function titluLucrare(l: CalLucrare, stari: Record<string, string> | null | undefined): string {
  return (l.company_name || '') + ' · ' + masini(l.masini) + ' · ' + (l.partener_nume || 'instalator neales') + ' · ' + stareText(l, stari);
}
export function stareText(l: CalLucrare, stari: Record<string, string> | null | undefined): string {
  return (stari || {})[l.status] || l.status;
}
// Instalatorii din filtrul de sus: cei activi, plus cel ales acum (chiar dacă între timp a devenit inactiv).
export function instalatoriFiltru(parteneri: CalPartener[] | null | undefined, part: string): CalPartener[] {
  return (parteneri || []).filter((p) => p.active || String(p.id) === part);
}

// ─── „De programat" (_mjcDeProgramatHtml) ───
// Culoarea termenului: depășit roșu, curând portocaliu, altfel neutru.
export function termenFel(t: CalTermen | null | undefined): string {
  return t ? (t.stare === 'depasit' ? 'bad' : t.stare === 'curand' ? 'warn' : '') : '';
}
// Ziua termenului, în calendarul României (serverul dă clipa, `pana`).
export function termenZi(t: CalTermen): string {
  return ziRo(new Date(Number(t.pana)).toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' }));
}
export function termenPastila(t: CalTermen): string { return 'termen ' + termenZi(t) + ', ' + t.text; }
// Sub formularul de programare: „Termenul din contract: 30.10.2026 (mai sunt 21 de zile)."
export function termenLinie(t: CalTermen): string { return 'Termenul din contract: ' + termenZi(t) + ' (' + t.text + ').'; }
// „0 din 5 mașini montate · 3 mașini programate · 2 mașini de programat".
export function detaliiContract(c: CalContract): string {
  return [c.text, c.programate ? masini(c.programate) + ' programate' : null,
    c.ramase ? masini(c.ramase) + ' de programat' : 'toate sunt programate'].filter(Boolean).join(' · ');
}
// „Teltonika FMC130 — 12 în depozit, 3 la instalatori · Modul LV-CAN200 — 4 în depozit".
export function stocText(stoc: CalStoc[] | null | undefined): string {
  return (stoc || []).map((s) => s.eticheta + ' — ' + s.depozit + ' în depozit' + (s.instalator ? ', ' + s.instalator + ' la instalatori' : '')).join(' · ');
}
// Contractele care mai au mașini de programat — și cifra de pe fila „Calendar".
export function deProgramatActive(d: CalDate | null | undefined): CalContract[] {
  return ((d && d.deProgramat) || []).filter((x) => x.ramase > 0);
}

// ─── Formularul „Programează montajul" (_mjcFormHtml, raxMjCalClient, raxMjCalCate, raxMjCalSalveaza) ───
// Contractul arătat: cel cerut, dacă mai are mașini de programat, altfel primul (cel mai strâns termen).
export function contractulFormularului(d: CalDate | null | undefined, contractId: any): CalContract | null {
  const ctrs = deProgramatActive(d);
  return ctrs.find((x) => x.contract_id === contractId) || ctrs[0] || null;
}
export function tipGps(c: CalContract): { ramase: number } {
  return (c.tipuri || []).find((t) => t.tip === 'gps') || { ramase: 0 };
}
// Ce se mai montează pe mașini (adaptorul LV-CAN, CAN-ul încorporat, priza FMS), cât a mai rămas din el.
export function alteTipuri(c: CalContract): CalTip[] {
  return (c.tipuri || []).filter((t) => t.tip !== 'gps' && t.ramase > 0);
}
// La N mașini, câte bucăți din tipul ăsta: cât merge pe o mașină (serverul dă `peMasina`), niciodată peste rest.
export function propuneAlt(n: number, t: CalTip): number { return Math.min(t.ramase, Math.round(n * t.peMasina)); }
// Rândul unui client în lista „Clientul": „Calendar SRL — 5 mașini de programat".
export function optiuneClient(x: CalContract): string { return (x.company_name || '—') + ' — ' + masini(x.ramase) + ' de programat'; }
// Cine poate monta o zi nouă: doar instalatorii activi.
export function instalatoriActivi(parteneri: CalPartener[] | null | undefined): CalPartener[] { return (parteneri || []).filter((p) => p.active); }
export function faraClientText(nume: string): string {
  return nume + ' n-are nimic de programat acum: contractul nu e semnat sau toate mașinile sunt deja programate.';
}

// Formularul, ca valori de casete (text, exact ce vede omul). `ci` / `cc` = bifele „am vorbit cu instalatorul / clientul".
export type FormProg = { zi: string; contract_id: number; n: string; part: string; alte: Record<string, string>; atinse: Record<string, boolean>; ci?: boolean; cc?: boolean };
// `partener` = instalatorul propus (cel ales în filtru), doar dacă e activ — altfel „— îl aleg mai târziu —".
export function formNou(d: CalDate | null | undefined, zi: string | null, contractId: any, partener: any): FormProg | null {
  const c = contractulFormularului(d, contractId);
  if (!c || !d) return null;
  const n = tipGps(c).ramase;
  const activ = partener != null && partener !== '' && instalatoriActivi(d.parteneri).some((p) => String(p.id) === String(partener));
  const alte: Record<string, string> = {};
  alteTipuri(c).forEach((t) => { alte[t.tip] = String(propuneAlt(n, t)); });
  return { zi: zi || d.azi || '', contract_id: c.contract_id, n: String(n), part: activ ? String(partener) : '', alte, atinse: {}, ci: false, cc: false };
}
// Alt client: ziua și instalatorul rămân; cantitățile pornesc din nou de la ce i-a rămas LUI.
export function cuClient(d: CalDate | null | undefined, f: FormProg, contractId: any): FormProg {
  const nou = formNou(d, f.zi, contractId, null);
  return nou ? Object.assign(nou, { zi: f.zi, part: f.part, ci: !!f.ci, cc: !!f.cc }) : f;
}
// Câte mașini → ce se mai montează pe ele, cât timp n-ai scris tu de mână.
export function cuMasini(c: CalContract, f: FormProg, n: string): FormProg {
  const x = parseInt(n, 10) || 0;
  const alte = Object.assign({}, f.alte);
  alteTipuri(c).forEach((t) => { if (!f.atinse[t.tip]) alte[t.tip] = String(propuneAlt(x, t)); });
  return Object.assign({}, f, { n, alte });
}
// Ce pleacă la server: contractul, ziua (miezul nopții LOCAL, ca `_zi` de pe web), instalatorul, câte bucăți pe tip.
// Prețurile NU pleacă de aici: pentru client le ia serverul din Anexa nr. 2, costul din tarifele instalatorului.
export function corpProgramare(c: CalContract, f: FormProg) {
  const cate: Record<string, number> = { gps: parseInt(f.n, 10) || 0 };
  alteTipuri(c).forEach((t) => { cate[t.tip] = parseInt(f.alte[t.tip], 10) || 0; });
  return { contract_id: c.contract_id, data_lucrare: ziMs(f.zi), partener_id: f.part ? parseInt(f.part, 10) : null, cate,
    confirmat_instalator: !!f.ci, confirmat_client: !!f.cc };
}
// Ce are deja un instalator în ziua aleasă — textul îl scrie serverul (montaj.textIncarcare); „liber" e `textLiber`.
export function incarcareText(d: CalDate | null | undefined, zi: string, partenerId: any): string {
  const x = (((d && d.incarcare) || {})[zi] || {})[String(partenerId)];
  return x ? x.text : ((d && d.textLiber) || '');
}
export function toastProgramat(c: CalContract | null | undefined, n: number, zi: string): string {
  return 'Programat: ' + ((c && c.company_name) || 'clientul') + ', ' + masini(n) + ', pe ' + ziRo(zi) + ' ✓';
}
// Venit cu `?contract=` (din drumul clientului): formularul pe contractul lui, sau — dacă n-are nimic de programat —
// numele firmei, pentru „… n-are nimic de programat acum". `null` = nu știm numele (îl caută ecranul).
export function dinContract(d: CalDate | null | undefined, contractId: number): { contract_id: number } | { faraClient: string | null } {
  const c = deProgramatActive(d).find((x) => Number(x.contract_id) === Number(contractId));
  if (c) return { contract_id: c.contract_id };
  const oricare = ((d && d.deProgramat) || []).find((x) => Number(x.contract_id) === Number(contractId));
  return { faraClient: (oricare && oricare.company_name) || null };
}

// ─── O zi programată (_mjcLucrareHtml, raxMjCalMuta, raxMjCalMontata, raxMjCalSterge) ───
export type FormLuc = { mont: string; mzi: string; mpart: string };
// Cine poate monta o zi deja programată: activii, plus cel de pe ea.
export function instalatoriLucrare(parteneri: CalPartener[] | null | undefined, l: CalLucrare): CalPartener[] {
  return (parteneri || []).filter((p) => p.active || p.id === l.partener_id);
}
export function formLucrare(parteneri: CalPartener[] | null | undefined, l: CalLucrare): FormLuc {
  const are = l.partener_id != null && instalatoriLucrare(parteneri, l).some((p) => p.id === l.partener_id);
  return { mont: String(l.masini), mzi: l.zi, mpart: are ? String(l.partener_id) : '' };
}
export function corpMutare(f: FormLuc) {
  return { data_lucrare: ziMs(f.mzi), partener_id: f.mpart ? parseInt(f.mpart, 10) : null };
}
export function corpMontata(f: FormLuc) { return { masini: parseInt(f.mont, 10) || 0 }; }
export function intrebareMontata(l: CalLucrare, n: number): string {
  return 'Treci lucrarea ca montată: ' + masini(n) + ' la ' + (l.company_name || 'client') + '?' +
    (l.masini && n < l.masini ? (l.masini - n === 1 ? ' Cealaltă mașină se întoarce la „Ce ai de montat".' : ' Celelalte ' + masini(l.masini - n) + ' se întorc la „Ce ai de montat".') : '') +
    ' Aparatele le treci apoi pe firmă din Dispozitive → Neasignate.';
}
export function toastMutat(zi: string): string { return 'Mutat pe ' + ziRo(zi) + ' ✓'; }
export function toastMontata(j: { inapoi_la_programat?: number } | null | undefined): string {
  return 'Montată ✓' + (j && j.inapoi_la_programat ? ' · ' + masini(j.inapoi_la_programat) + ' înapoi la „Ce ai de montat"' : '');
}

// ─── Anularea și reprogramarea (raxMjCalAnuleaza…, raxMjCalReprogrameaza…, 01.10) ───
// Motivul e unul din cele DOUĂ ale serverului (`d.motive`); amănuntele, dacă vrei; ziua nouă, la „Reprogramează".
export type FormAnulare = { motiv: string; detalii: string; reprog: boolean; zi: string; part: string };
export function formAnulare(parteneri: CalPartener[] | null | undefined, l: CalLucrare): FormAnulare {
  const are = l.partener_id != null && instalatoriLucrare(parteneri, l).some((p) => p.id === l.partener_id);
  return { motiv: '', detalii: '', reprog: false, zi: '', part: are ? String(l.partener_id) : '' };
}
export function corpAnulare(f: FormAnulare) {
  const b: { motiv: string; detalii: string | null; reprogramare?: { data_lucrare: number | null; partener_id: number | null } } =
    { motiv: f.motiv, detalii: String(f.detalii || '').trim() || null };
  if (f.reprog) b.reprogramare = { data_lucrare: ziMs(f.zi), partener_id: f.part ? parseInt(f.part, 10) : null };
  return b;
}
export function toastAnulat(j: { reprogramata?: { zi: string } | null } | null | undefined): string {
  return j && j.reprogramata ? 'Anulată și reprogramată pe ' + ziRo(j.reprogramata.zi) + ' ✓' : 'Anulată ✓ · mașinile ei s-au întors la „Ce ai de montat"';
}
export function corpReprogramare(f: { zi: string; part: string }) {
  return { data_lucrare: ziMs(f.zi), partener_id: f.part ? parseInt(f.part, 10) : null };
}
export function toastReprogramat(zi: string | null | undefined): string { return 'Reprogramată pe ' + ziRo(zi) + ' ✓'; }
// Istoricul, cu filtrul de deasupra lui: toate / montate / anulate.
export function istoricFiltrat(d: CalDate | null | undefined, filtru: string): CalIstoric[] {
  return ((d && d.istoric) || []).filter((l) => filtru === 'toate' || (filtru === 'anulate' ? l.anulata : !l.anulata));
}

// Mesajul unei cereri refuzate: vorbele serverului; unde n-a spus nimic („Eroare 500"), fraza paginii.
export function eroarea(e: any, implicit: string): string {
  const m = e && e.message ? String(e.message) : '';
  return !m || /^Eroare \d+$/.test(m) ? implicit : m;
}
