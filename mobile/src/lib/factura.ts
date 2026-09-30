// Facturarea pe telefon: regulile ferestrei „Generează factură" și ale listei de documente, curate (fără Preact),
// ca proba să le poată rula alături de bucățile din pagină (public/index.html) pe aceleași cazuri.
//
// Legături cu pagina (păzite de probă, care rulează ambele variante și cere același rezultat):
//   lunaText        ↔ _giLunaText            ceEste      ↔ ceE (raxRenderInvoices)
//   stareClient     ↔ _myInvStare            puneLucrare ↔ _giStrangeLucrarea / _giNotaMontaj
//                                                          („factura montajului, strânsă", Alin 29.09)
//
// Ce face telefonul ALTFEL decât pagina, dinadins (revizia lucrului din 29.09):
//   • un rând de montaj corectat de mână nu mai primește cantitățile lucrării următoare: lucrarea nouă își
//     face rândul ei, iar corectura rămâne cum ai scris-o;
//   • o lucrare scoasă de pe factură (butonul „Scoate", rândul șters sau cantitatea scăzută) NU mai pleacă în
//     `montaje`, deci nu trece pe „facturat clientului" fără să fie pe factură; butonul ei se reaprinde;
//   • mențiunea se scrie singură DOAR cât n-ai scris tu în ea.
import { nrDe } from './numar';

export type Fel = 'abonament' | 'unica';
export type Tip = 'invoice' | 'proforma';

export const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

// „2026-10" → „octombrie 2026" (web: _giLunaText).
export function lunaText(cheie: any): string {
  const p = String(cheie || '').split('-');
  return p.length === 2 ? (LUNI[Number(p[1]) - 1] + ' ' + p[0]) : '';
}
export function cheieLuna(an: number, luna: number): string { return an + '-' + String(luna).padStart(2, '0'); }

// „15.01.2027" — ziua, cum o scrie pagina (toLocaleDateString('ro-RO')).
export function ziRo(ts: any): string {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

// Adresa care deschide „Generează factură" cu firma aleasă și felul ales — UNA singură, folosită de drumul clientului
// (components/ContractPasi.tsx) și de fila Facturi din fișa firmei:
//   /billing?factura=<id firmă>             → abonamentul unei luni (ca până acum)
//   /billing?factura=<id firmă>&fel=unica   → factură unică (aparate, montaj — din contract; fiscală sau proformă)
// Felul se citește înapoi cu felDinAdresa: orice altceva decât „unica" (inclusiv „&fel=abonament") = abonamentul.
export function rutaFactura(companyId: any, fel?: Fel | null): string {
  return '/billing?factura=' + encodeURIComponent(String(companyId)) + (fel === 'unica' ? '&fel=unica' : '');
}
export function felDinAdresa(v: any): Fel { return v === 'unica' ? 'unica' : 'abonament'; }

export interface Contributie { id: number; qty: number }
export interface Linie {
  desc: string; qty: number; unitPrice: number; net: number; vat: number; vatRate: number;
  _sursa?: 'aparate' | 'montaj';   // rândul vine din contract (Anexa nr. 2)
  _montaj?: boolean;               // rândul adună lucrări de montaj
  _atins?: boolean;                // corectat de mână: nu mai primește cantități de la alte lucrări
  _lucrari?: Contributie[];        // ce cantitate a adus fiecare lucrare pe rândul ăsta
}
export interface Lucrare { id: number; data: any; masini: any; linii: { desc: string; qty: any; unitPrice: any }[]; total?: any; partener?: any }
export interface Ciorna {
  companyId: number; fel: Fel; luna: string | null; lines: Linie[]; vatRate: number; issuer: any; client: any;
  deja: any; aparateIntregi: number; aparatePeZile: number; aparateNepornite: number;
  dinContract: any; adaugate: Lucrare[]; nota: string; notaAuto: string;
  notaMana?: boolean;              // omul a scris în caseta de mențiuni (chiar și ștergând-o): nu se mai rescrie singură
}

export function recalc(l: any, rata: number): Linie {
  const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * 100) / 100;
  return { ...l, net, vat: Math.round(net * rata) / 100, vatRate: rata };
}

// Ciorna, din răspunsul POST /api/invoices/draft. Luna e cea din RĂSPUNS: cu ea se emite (nu cu selectorul).
export function ciornaDinRaspuns(d: any, companyId: number, felCerut: Fel): Ciorna {
  d = d || {};
  const rata = d.vatRate != null ? Number(d.vatRate) : 19;
  return {
    companyId, fel: d.fel === 'unica' || d.fel === 'abonament' ? d.fel : felCerut, luna: d.luna || null,
    lines: (d.lines || []).map((l: any) => recalc(l, rata)), vatRate: rata, issuer: d.issuer || {}, client: d.client || {},
    deja: d.deja || null, aparateIntregi: Number(d.aparateIntregi) || 0, aparatePeZile: Number(d.aparatePeZile) || 0,
    aparateNepornite: Number(d.aparateNepornite) || 0, dinContract: d.dinContract || null, adaugate: [], nota: '', notaAuto: '',
  };
}

// ── Rândurile din contract (aparatele / montajul din Anexa nr. 2) ──
// Butonul e stins cât pe factură există rânduri din sursa lui: aceleași aparate de două ori ar fi o greșeală.
export function sursaPusa(S: Ciorna, ce: 'aparate' | 'montaj'): boolean { return S.lines.some((l) => l._sursa === ce); }
export function puneContract(S: Ciorna, ce: 'aparate' | 'montaj'): Ciorna {
  if (!S.dinContract || sursaPusa(S, ce)) return S;
  const noi = (S.dinContract[ce] || []).map((r: any) => recalc({ desc: r.desc, qty: Number(r.qty) || 0, unitPrice: Number(r.unitPrice) || 0, _sursa: ce }, S.vatRate));
  return { ...S, lines: S.lines.concat(noi) };
}

// ── Lucrările de montaj: rânduri strânse + ce lucrare e cu adevărat pe factură ──
export type StareLucrare = 'intreaga' | 'partiala' | 'scoasa';
const cant = (l: Linie) => (String(l.desc || '').trim() ? Math.max(0, Number(l.qty) || 0) : 0);   // rândul fără denumire nu pleacă

// Contribuțiile unui rând, în ordinea zilelor de montaj (la aceeași zi, în ordinea în care au fost puse).
function inOrdineaZilelor(S: Ciorna) {
  const zi: Record<number, number> = {}, pus: Record<number, number> = {};
  S.adaugate.forEach((j, i) => { zi[j.id] = Number(j.data) || 0; pus[j.id] = i; });
  return (cs: Contributie[]) => cs.slice().sort((a, b) => ((zi[a.id] || 0) - (zi[b.id] || 0)) || ((pus[a.id] || 0) - (pus[b.id] || 0)));
}
// Cât din fiecare lucrare a rămas pe factură. Pe un rând adunat din mai multe zile, cantitatea de pe el se
// împarte în ordinea zilelor: dacă scazi 25 → 10, rămâne ziua cea dintâi (10), iar cea de pe 30.01 iese.
function alocat(S: Ciorna): Record<number, number> {
  const dupaZi = inOrdineaZilelor(S);
  const out: Record<number, number> = {};
  S.lines.forEach((l) => {
    let rest = cant(l);
    dupaZi(l._lucrari || []).forEach((c) => {
      const a = Math.min(rest, Number(c.qty) || 0);
      rest -= a;
      out[c.id] = (out[c.id] || 0) + a;
    });
  });
  return out;
}
export function acoperire(S: Ciorna): Record<number, StareLucrare> {
  const a = alocat(S), out: Record<number, StareLucrare> = {};
  S.adaugate.forEach((j) => {
    const trebuie = (j.linii || []).reduce((x, r) => x + (Number(r.qty) || 0), 0);
    const are = a[j.id] || 0;
    out[j.id] = trebuie > 0 && are >= trebuie ? 'intreaga' : (are > 0 ? 'partiala' : 'scoasa');
  });
  return out;
}
// Lucrările care pleacă în `montaje` (și trec pe „facturat clientului"): DOAR cele întregi pe factură.
export function montajeDeTrimis(S: Ciorna): number[] {
  const st = acoperire(S);
  return S.adaugate.filter((j) => st[j.id] === 'intreaga').map((j) => j.id);
}

// „Montaj executat pe 15.01.2027 (10 mașini), 25.01.2027 (10 mașini) și 30.01.2027 (15 mașini)."
export function notaMontaj(zile: { data: any; masini: any }[], fmt: (t: any) => string = ziRo): string {
  const z = (zile || []).filter((x) => x && x.data).map((x) => fmt(x.data) + (x.masini ? ' (' + nrDe(Number(x.masini), 'mașină', 'mașini') + ')' : ''));
  if (!z.length) return '';
  return 'Montaj executat pe ' + (z.length === 1 ? z[0] : z.slice(0, -1).join(', ') + ' și ' + z[z.length - 1]) + '.';
}
// Mențiunea automată se reface din lucrările ÎNTREGI pe factură; ce ai scris tu în casetă rămâne.
function cuNota(S: Ciorna): Ciorna {
  const st = acoperire(S);
  const zile = S.adaugate.filter((j) => st[j.id] === 'intreaga').map((j) => ({ data: j.data || null, masini: Number(j.masini) || 0 }))
    .sort((a, b) => (Number(a.data) || 0) - (Number(b.data) || 0));
  const auto = notaMontaj(zile);
  return { ...S, nota: S.notaMana ? S.nota : auto, notaAuto: auto };
}

// Pune o lucrare pe factură: un rând pe fel de lucrare, adunat cu rândurile NEATINSE cu aceeași denumire și
// același preț (web: _giStrangeLucrarea). O lucrare deja pe factură (întreagă sau în parte) nu se pune a doua oară.
export function puneLucrare(S: Ciorna, j: Lucrare): Ciorna {
  if (!j) return S;
  const st = acoperire(S)[j.id];
  if (st === 'intreaga' || st === 'partiala') return S;
  // Urmele vechi ale lucrării (rânduri pe care nu mai avea nimic) se șterg, ca să nu se numere de două ori.
  const lines = S.lines.map((l) => (l._lucrari && l._lucrari.some((c) => c.id === j.id)) ? { ...l, _lucrari: l._lucrari.filter((c) => c.id !== j.id) } : l);
  (j.linii || []).forEach((r) => {
    const q = Number(r.qty) || 0, p = Number(r.unitPrice) || 0;
    const i = lines.findIndex((x) => x._montaj && !x._atins && x.desc === r.desc && Number(x.unitPrice) === p);
    if (i >= 0) {
      const x = lines[i];
      lines[i] = recalc({ ...x, qty: (Number(x.qty) || 0) + q, _lucrari: (x._lucrari || []).concat([{ id: j.id, qty: q }]) }, S.vatRate);
    } else {
      lines.push(recalc({ desc: r.desc, qty: q, unitPrice: p, _montaj: true, _lucrari: [{ id: j.id, qty: q }] }, S.vatRate));
    }
  });
  return cuNota({ ...S, lines, adaugate: S.adaugate.filter((x) => x.id !== j.id).concat([j]) });
}
// „Scoate": ia de pe rânduri exact cât adusese lucrarea (cât a mai rămas din ea) și o scoate din `montaje`.
export function scoateLucrare(S: Ciorna, id: number): Ciorna {
  const dupaZi = inOrdineaZilelor(S);
  const lines: Linie[] = [];
  S.lines.forEach((l) => {
    if (!(l._lucrari || []).some((c) => c.id === id)) { lines.push(l); return; }
    let rest = cant(l), aLui = 0;
    dupaZi(l._lucrari || []).forEach((c) => {
      const a = Math.min(rest, Number(c.qty) || 0); rest -= a; if (c.id === id) aLui += a;
    });
    const altele = (l._lucrari || []).filter((c) => c.id !== id);
    const q = Math.max(0, (Number(l.qty) || 0) - aLui);
    if (q <= 0 && !altele.length) return;   // rândul era doar al ei
    lines.push(recalc({ ...l, qty: q, _lucrari: altele }, S.vatRate));
  });
  return cuNota({ ...S, lines, adaugate: S.adaugate.filter((j) => j.id !== id) });
}

// ── Corecturile de mână ──
export function editeazaLinie(S: Ciorna, i: number, k: 'desc' | 'qty' | 'unitPrice', v: any): Ciorna {
  const l = S.lines[i]; if (!l) return S;
  const nou: any = { ...l, [k]: k === 'desc' ? String(v) : (Number(v) || 0) };
  if (l._montaj || l._sursa) nou._atins = true;
  const lines = S.lines.slice(); lines[i] = recalc(nou, S.vatRate);
  return cuNota({ ...S, lines });
}
export function stergeLinie(S: Ciorna, i: number): Ciorna { return cuNota({ ...S, lines: S.lines.filter((_, idx) => idx !== i) }); }
export function adaugaLinie(S: Ciorna): Ciorna { return { ...S, lines: S.lines.concat([recalc({ desc: '', qty: 1, unitPrice: 0 }, S.vatRate)]) }; }
export function puneNota(S: Ciorna, text: string): Ciorna { return { ...S, nota: String(text || '').slice(0, 500), notaMana: true }; }

export const liniiValide = (S: Ciorna) => S.lines.filter((l) => String(l.desc || '').trim() && (Number(l.qty) || 0) > 0);
// Ce pleacă la POST /api/invoices — aceeași formă ca pe web (raxGenIssue): felul și luna din ciornă, nu din selector.
export function corpEmitere(S: Ciorna, tip: Tip) {
  const unica = S.fel === 'unica';
  return {
    companyId: S.companyId, fel: S.fel, luna: S.luna, tip: unica ? tip : 'invoice',
    lines: liniiValide(S).map((l) => ({ desc: l.desc, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, vatRate: l.vatRate, net: l.net, vat: l.vat })),
    montaje: unica ? montajeDeTrimis(S) : [],
    note: unica && String(S.nota || '').trim() ? String(S.nota).trim().slice(0, 500) : null,
  };
}

// ── Lista de documente ──
// „Ce e" documentul (web: ceE din raxRenderInvoices). Facturile de dinainte de 28.09 n-au felul scris: liniuță.
export function ceEste(v: any): string {
  if (v.type === 'proforma') return 'Proformă' + (v.status === 'paid' && v.factura_id ? ' → factură' : '');
  if (v.fel === 'abonament') return 'Abonament ' + lunaText(v.luna);
  if (v.fel === 'unica') return v.din_proforma ? 'Unică (din proformă)' : 'Unică';
  return '—';
}
// Starea unui document pe limba CLIENTULUI (web: _myInvStare). „Restantă" se socotește din scadență.
export function stareClient(f: any, acum: number = Date.now()): [string, string] {
  if (f.status === 'paid') return f.type === 'proforma' ? ['Încasată', 'var(--fl-ok)'] : ['Plătită', 'var(--fl-ok)'];
  if (f.status === 'canceled') return ['Anulată', 'var(--text-muted)'];
  if (f.due_date && Number(f.due_date) < acum) return ['Restantă', 'var(--red)'];
  return ['De plată', 'var(--fd-warn)'];
}

// O lună de abonament care n-a început încă (revizia din 29.09): mașinile montate până pe 1 ale ei nu mai intră pe
// factura ei, iar factura automată o sare. Telefonul doar spune asta; nu oprește emiterea.
export function lunaViitoare(cheie: any, acum: number = Date.now()): boolean {
  const d = new Date(acum);
  return !!cheie && String(cheie) > cheieLuna(d.getFullYear(), d.getMonth() + 1);
}

// Documentele firmei (neanulate) pe care stau deja aparatele din contract — aceeași denumire de rând. Serverul
// propune aparatele din Anexa nr. 2 la FIECARE factură unică, fără să știe dacă au fost deja pe proforma de avans
// (revizia din 29.09). Telefonul avertizează; nu hotărăște în locul omului. O proformă încasată nu se numără:
// factura ei fiscală, cu aceleași rânduri, e deja în listă.
function liniiDoc(v: any): any[] {
  if (Array.isArray(v && v.lines)) return v.lines;
  try { const x = JSON.parse(v && v.lines); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}
export function aparateDejaPe(documente: any[], companyId: any, dinContract: any): string[] {
  const denumiri = new Set(((dinContract && dinContract.aparate) || []).map((r: any) => String(r.desc || '')));
  if (!denumiri.size) return [];
  return (documente || [])
    .filter((v) => Number(v.company_id) === Number(companyId) && v.status !== 'canceled' && !(v.type === 'proforma' && v.factura_id))
    .filter((v) => liniiDoc(v).some((l: any) => denumiri.has(String((l && l.desc) || ''))))
    .map((v) => String(v.full_number || '')).filter(Boolean);
}

// Metoda unei încasări, pe înțelesul omului (pe web apare codul: transfer / cash / card / manual).
export function metodaText(m: any): string {
  return ({ transfer: 'transfer bancar', cash: 'numerar', card: 'card', manual: 'altă metodă' } as Record<string, string>)[String(m || 'manual')] || String(m);
}

// Întrebarea de dinainte de ✓ și butonul ei — aceleași cuvinte ca pe web (raxInvoiceMarkPaid), scrise O SINGURĂ dată
// pe telefon: le folosesc și Facturare (fereastra documentului), și fișa firmei (fila Facturi).
export const INTREB_PROFORMA = 'Proforma e ÎNCASATĂ? Se emite acum factura fiscală, cu aceleași rânduri, marcată plătită. Proforma rămâne legată de ea.';
export const INTREB_FACTURA = 'Marchezi factura ca PLĂTITĂ? Se înregistrează încasarea. Dacă firma era oprită pentru neplată, accesul revine pe loc.';
export const OK_PROFORMA = 'Încasată — emite factura';
export const OK_FACTURA = 'Marchează plătită';
