// „Anunță echipa RA Track" și „Cereri de la clienți" pe telefon (02.11) — ce fac pe web blocurile cu aceleași nume
// (public/index.html), pe aceleași rute. Regulile și textele sunt ale serverului (cereri_echipa.js); aici stau adresele și ce se
// desenează, din ce a trimis el. Fără JSX și fără cereri: verify_telefon_echipa.js le rulează lângă codul paginii, pe aceleași răspunsuri.
// Aparatul e treaba NOASTRĂ: clientul are un singur lucru de făcut, să ne anunțe, iar datele aparatului le pune serverul.
import { nrDe } from './numar';

const enc = encodeURIComponent;

// ─── Adresele ───
export const RUTA_ECHIPA = '/echipa';
export const RUTA_CERERILE_TALE = RUTA_ECHIPA + '?fila=lista';
export const RUTA_CERERI_CLIENTI = '/admin/cereri';

export type DeschideEchipa = { imei?: any; problema?: any; ce?: any; sursa?: any; fila?: any };
// Fereastra clientului, cu ce știe ușa din care s-a intrat (web: echipaDeschide(o)).
export function rutaEchipa(o: DeschideEchipa = {}): string {
  const q: string[] = [];
  if (o.imei != null && o.imei !== '') q.push('imei=' + enc(String(o.imei)));
  if (o.problema) q.push('problema=' + enc(String(o.problema)));
  if (o.ce) q.push('ce=' + enc(String(o.ce)));
  if (o.sursa) q.push('sursa=' + enc(String(o.sursa)));
  if (o.fila) q.push('fila=' + enc(String(o.fila)));
  return RUTA_ECHIPA + (q.length ? '?' + q.join('&') : '');
}
export function dinAdresa(q: any): { imei: string; problema: string; ce: string; sursa: string; fila: string } {
  const x = q || {};
  const s = (v: any) => (v == null ? '' : String(v));
  return { imei: s(x.imei), problema: s(x.problema), ce: s(x.ce), sursa: s(x.sursa), fila: x.fila === 'lista' ? 'lista' : 'noua' };
}
// O cerere anume, în „Cereri de la clienți": din calendar, la vedere (rezolvată = în „Toate"; web: raxMjCalInterventie).
export function rutaCerere(id: any, gata: any): string {
  return RUTA_CERERI_CLIENTI + '?fel=' + (gata ? 'toate' : 'deschise') + '&spre=' + enc(String(id));
}
export function cerereDinAdresa(q: any): { fel: string; spre: number | null } {
  const x = q || {};
  const fel = x.fel === 'rezolvate' || x.fel === 'toate' ? x.fel : 'deschise';
  const n = Number(x.spre);
  return { fel, spre: Number.isInteger(n) && n > 0 ? n : null };
}

// ─── Fereastra clientului: ușile, cu ce pune fiecare în cerere ───
export const usaFisa = (imei: any) => rutaEchipa({ imei, problema: 'aparat', sursa: 'fisa' });
// Pe web, iconița cu căști scrie la noi „din iconița cu căști" (`suport`). Telefonul n-o are: din meniu, „de pe telefon" (`telefon`, tot din cereri_echipa.js).
export const usaMeniu = () => rutaEchipa({ sursa: 'telefon' });
export function usaCaseta(b: any, p?: any): string {
  return rutaEchipa({ imei: b && b.imei, problema: b && b.problema, ce: b && b.problema === 'consum' && p && p.dovada ? String(p.dovada) : '', sursa: 'insight' });
}

// ─── Fereastra clientului: ce se desenează ───
export const TITLU_FEREASTRA = 'Anunță echipa RA Track';
export const EROARE_FEREASTRA = 'Fereastra nu s-a putut deschide. Încearcă din nou peste un minut.';
export const TEXT_PLATFORMA = 'Cererile le trimit clienții. Pe ale lor le vezi în Business › „Cereri de la clienți”.';
export const BUTON_PLATFORMA = 'Deschide „Cereri de la clienți”';
export const EROARE_TRIMITERE = 'Cererea nu s-a putut trimite. Încearcă din nou.';
export const GOL_CERERILE_TALE = 'Nicio cerere încă.';

export function fileFereastra(m: any): { k: string; t: string }[] {
  return [{ k: 'noua', t: 'Cerere nouă' }, { k: 'lista', t: 'Cererile tale · ' + (((m && m.cereri) || []).length) }];
}
const altNume = (d: any) => !!(d && d.plate && d.name && String(d.name).toUpperCase() !== String(d.plate).toUpperCase());
// Mașina din fereastră (web: masina()).
export function masinaDin(imei: any, lista: any[] | null | undefined): { nr: string; nume: string } {
  const d = (lista || []).find((x: any) => x && String(x.imei) === String(imei));
  return { nr: (d && (d.plate || d.name)) || 'Mașina', nume: altNume(d) ? d.name : '' };
}
// Lista de mașini, când nu s-a intrat de pe una.
export function optiuniMasini(lista: any[] | null | undefined): { v: string; t: string }[] {
  return (lista || []).filter((d: any) => d && d.imei)
    .slice().sort((a: any, c: any) => String(a.plate || a.name || '').localeCompare(String(c.plate || c.name || ''), 'ro'))
    .map((d: any) => ({ v: String(d.imei), t: (d.plate || d.name || d.imei) + (altNume(d) ? ' · ' + d.name : '') }));
}
export const OPTIUNE_FARA_MASINA = 'Fără mașină — o întrebare pentru echipă';
// Câmpurile formularului care depind de mașina aleasă (web: dupaMasina).
export function dupaMasina(m: any, faraMasina: boolean): { mesaj: string; mesajSub: string; date: string; arataCand: boolean } {
  return {
    mesaj: faraMasina ? 'Ce s-a întâmplat sau ce vrei să ne întrebi' : 'Mesaj pentru echipă',
    mesajSub: faraMasina ? '' : 'dacă vrei',
    date: faraMasina ? ((m && m.dateTrimiseFaraMasina) || '') : ((m && m.dateTrimise) || ''),
    arataCand: !faraMasina,
  };
}
export function notaFormular(m: any): string { return [m && m.termen, m && m.laFiecarePas].filter(Boolean).join(' '); }
// Ce pleacă: aceleași câmpuri ca pe web. Datele aparatului le adună serverul.
export function corpCerere(o: any, f: { imei: string; mesaj: string; cand: string[]; unde: string; telefon: string }) {
  const x = o || {}, imei = f.imei || '', fara = !imei;
  return {
    problema: x.problema || (imei ? 'aparat' : 'alta'), imei: imei || null, ce: x.ce || '', mesaj: f.mesaj,
    cand: fara ? [] : f.cand, unde: fara ? '' : f.unde, telefon: f.telefon, sursa: x.sursa || 'telefon',
  };
}
// Răspunsul la trimitere: 200, sau 409 cu `deja` („Echipa RA Track se ocupă deja de asta"), duc la confirmare; altfel, eroarea serverului.
export function dupaTrimitere(status: any, j: any): { trimisa: boolean; eroare: string } {
  if (status === 200 || (status === 409 && j && j.deja)) return { trimisa: true, eroare: '' };
  return { trimisa: false, eroare: (j && j.error) || EROARE_TRIMITERE };
}
export function planTrimisa(m: any, j: any) {
  const x = j || {}, c = x.cerere || {}, k = x.confirmare || {};
  return {
    deja: !!x.deja,
    titlu: x.deja ? (x.error || '') : (k.titlu || ''),
    sub: x.deja ? (x.seOcupa || '') : (k.sub || ''),
    pasi: Array.isArray(c.pasi) ? c.pasi : [],
    nota: x.nota || (m && m.notaTrimisa) || '',
  };
}
export function planLista(m: any) {
  const l = (m && m.cereri) || [];
  return {
    gol: l.length ? '' : GOL_CERERILE_TALE,
    randuri: l.map((c: any) => ({ id: c.id, cap: c.cap, stare: c.stare || 'trimisa', eticheta: c.eticheta, titlu: c.titlu, detaliu: c.detaliu, deAltcineva: c.deAltcineva || '' })),
    nota: m && m.admin ? (m.notaLista || '') : '',
  };
}

// ─── Caseta din RA Insight, după trimitere (web: _echipaSeOcupa, _echipaInlocuieste) ───
export function imeisEchipa(butoane: any[] | null | undefined): string[] {
  const l: string[] = [];
  (butoane || []).forEach((b: any) => {
    if (b && b.fel === 'echipa' && b.imei && l.indexOf(String(b.imei)) < 0) l.push(String(b.imei));
  });
  return l;
}
export function seOcupaPeButon(deschise: any[] | null | undefined, b: any): any | null {
  if (!b || b.fel !== 'echipa' || !b.imei) return null;
  return (deschise || []).find((d: any) => String(b.imei) === String(d.imei) && b.problema === d.problema) || null;
}

// ─── „Cereri de la clienți" (fondatorii) ───
export const TITLU_CERERI = 'Cereri de la clienți';
export const EROARE_LISTA = 'Lista nu s-a putut încărca. Încearcă din nou peste un minut.';
export function fileCereri(d: any): { k: string; t: string }[] {
  const n = d && d.deschise;
  return [{ k: 'deschise', t: 'Deschise' + (n ? ' · ' + n : '') }, { k: 'rezolvate', t: 'Rezolvate' }, { k: 'toate', t: 'Toate' }];
}
export function cateCereri(d: any): string {
  const n = ((d && d.cereri) || []).length;
  return nrDe(n, 'cerere', 'cereri') + (d && d.primaDeschisa ? ' · prima deschisă: ' + d.primaDeschisa : '');
}
export function golCereri(fel: string): string { return fel === 'deschise' ? 'Nicio cerere deschisă.' : 'Nicio cerere.'; }
export const telHref = (t: any) => 'tel:' + String(t == null ? '' : t).replace(/[^\d+]/g, '');

const BUTOANE: { k: string; ic: string; t: string }[] = [
  { k: 'preiau', ic: 'hand', t: 'Preiau' }, { k: 'programez', ic: 'calendar', t: 'Programez' },
  { k: 'rezolvat', ic: 'check', t: 'Rezolvat' }, { k: 'redeschide', ic: 'undo', t: 'Redeschide' },
];
// Butoanele le dă serverul, după stare; aici doar cum se scriu și care e cel principal (web: _cereriButoane).
export function butoaneCerere(c: any): { k: string; ic: string; t: string; prim: boolean }[] {
  const b: string[] = (c && c.butoane) || [];
  const prim = c && c.pareRezolvata ? 'rezolvat' : b[0];
  return BUTOANE.filter((x) => b.indexOf(x.k) >= 0).map((x) => ({ k: x.k, ic: x.ic, t: x.t, prim: x.k === prim }));
}
export function planCerere(c: any) {
  const x = c || {}, t = x.tag || {};
  const msg: { l: string; t: string }[] = [];
  if (x.ce || x.titlu) msg.push({ l: 'Ce s-a întâmplat:', t: String(x.ce || x.titlu) });
  if (x.mesaj) msg.push({ l: 'Mesajul clientului:', t: '„' + x.mesaj + '”' });
  if (x.candText) msg.push({ l: 'Când se poate:', t: String(x.candText) });
  return {
    id: x.id, cap: String(x.cap || ''), vehicul: String(x.vehicul || ''), tag: { text: String(t.text || ''), cls: String(t.cls || 'noua') },
    cine: String(x.cine || ''), telefon: String(x.telefon || ''), email: String(x.email || ''), cand: String(x.cand || ''), sursa: String(x.sursa || ''),
    titlu: String(x.titlu || ''), msg, pareRezolvata: String(x.pareRezolvata || ''),
    aparat: (x.aparat || []) as { l: string; v: string }[],
    programare: String(x.programare || ''), programareMesaj: String(x.programareMesaj || ''),
    raspuns: String(x.raspuns || ''),
    butoane: butoaneCerere(x), suna: x.telefon ? telHref(x.telefon) : '', firma: x.company_id != null ? Number(x.company_id) : null,
  };
}
export const TEXT_APARAT = 'Datele aparatului — doar pentru noi';
export const TEXT_PROGRAMATA = 'Programată:';
export const TEXT_MESAJ_TRIMIS = 'Mesajul trimis clientului: ';
export const TEXT_I_AM_SCRIS = 'Ce i-am scris:';

export type FormProgramare = { zi: string; interval: string; partener: string; mesaj: string; inCalendar: boolean };
export const TEXT_FORM = {
  programez: 'Programez', faraInstalator: 'fără instalator ales', instalator: ' · instalator', mesaj: 'Mesaj clientului',
  mesajGol: 'Gol = îl scriem noi: ziua, ora și adresa (dacă a dat-o clientul)', inCalendar: 'Pune și în Calendarul de montaj, ca intervenție',
  renunta: 'Renunță', programeaza: 'Programează și anunță clientul', ceAmFacut: 'Ce i-am făcut',
  raspunsGol: 'Îi trimitem textul clientului. De exemplu: Am schimbat cartela SIM a aparatului. Transmite din nou de la 11:05.',
  rezolva: 'Rezolvată — trimite clientului',
};
export function formProgramare(d: any): FormProgramare {
  const iv = (d && d.intervale) || [];
  return { zi: (d && d.maine) || '', interval: iv.length ? String(iv[0].k) : '', partener: '', mesaj: '', inCalendar: true };
}
export function corpProgramare(f: FormProgramare) {
  return { zi: f.zi || '', interval: f.interval || '', partener_id: f.partener || null, mesaj: f.mesaj || '', in_calendar: !!f.inCalendar };
}
export const corpRezolvat = (raspuns: string) => ({ raspuns: raspuns || '' });
export const TEXT_DUPA: Record<string, string> = {
  preiau: 'Preluată — clientul primește un mesaj că ne ocupăm.', programeaza: 'Programată — clientul primește ziua și ora.',
  rezolva: 'Rezolvată — clientul primește ce i-am scris.', redeschide: 'Cererea e iar deschisă.',
};
export const NU_S_A_PUTUT = 'Nu s-a putut.';
export function intrebareRedeschide(id: any): string {
  return 'Redeschizi cererea nr. ' + id + '? Clientul nu primește niciun mesaj; o vede iar deschisă la „Cererile tale”.';
}
