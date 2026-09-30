import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from './Icon';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { stareClient, INTREB_PROFORMA, INTREB_FACTURA } from '../lib/factura';
import '../screens/billing.css';
// --fl-ok / --fl-warn (flota.css) și --fd-warn (fondator.css): culorile SCRISULUI, cu pereche pe tema luminoasă.
import '../screens/flota.css';
import '../screens/fondator.css';

// Documentul întreg (factură / proformă), pe hârtia lui — UNA singură pe telefon, deschisă din Facturare (lista
// fondatorului și „Facturile mele" ale clientului) și din fișa firmei, fila Facturi („Vezi"). Spune ce spune
// hârtia de pe web (_invFiscalHtml): furnizorul cu CUI și IBAN, clientul, rândurile, TVA-ul, totalul, ziua emiterii,
// scadența, perioada la abonament, „Mențiuni" la factura unică și la proformă, iar proforma scrie că nu e document
// fiscal. Până pe 30.09 fișa își desena singură o a doua hârtie, care tăcea nota proformei și perioada.
//
// Privirile:
//   • 'noi'    — Facturare, la noi: starea din bază, e-Factura și butoanele (plătită/încasată, ANAF, anulează).
//   • 'fisa'   — fișa firmei: aceeași stare ca rândul din care a fost deschisă (stareClient, ca _raxCodFacturi pe
//                web), e-Factura, FĂRĂ butoane (✓ stă pe rândul din listă).
//   • 'client' — „Facturile mele": starea pe limba clientului, fără e-Factura, fără butoane.
// Lista din /overview (fișa) n-are rândurile, furnizorul și clientul: atunci documentul se cere întreg
// (GET /api/invoices/:id, doar la noi — clientul primește deja documentele întregi din /api/billing/my-invoices).

export const fmtD = (ts: any) => (ts ? new Date(Number(ts)).toLocaleDateString('ro-RO') : '—');
export const money2 = (v: any) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TIP: Record<string, string> = { invoice: 'Factură', proforma: 'Proformă', credit_note: 'Storno' };
// Albastrul „trimisă" vine din --bill-trimisa (billing.css): #38BDF8 ca pe web pe tema închisă, închis pe cea luminoasă.
const INV_ST: Record<string, [string, string]> = {
  draft: ['Ciornă', 'var(--text-muted)'], issued: ['Emisă', 'var(--fl-ok)'], sent: ['Trimisă', 'var(--bill-trimisa)'],
  paid: ['Plătită', 'var(--fl-ok)'], overdue: ['Restantă', 'var(--red)'], canceled: ['Anulată', 'var(--text-muted)'],
};
// La noi: starea din bază. O proformă plătită se numește „Încasată" (din ea s-a născut factura fiscală).
export const stareNoi = (v: any): [string, string] => (v.type === 'proforma' && v.status === 'paid' ? ['Încasată', 'var(--fl-ok)'] : (INV_ST[v.status] || INV_ST.issued));
const EF_ST: Record<string, [string, string]> = {
  uploaded: ['e-Factura: trimisă', 'var(--bill-trimisa)'], validated: ['e-Factura: validată ANAF', 'var(--fl-ok)'],
  error: ['e-Factura: eroare', 'var(--red)'], pending: ['e-Factura: în lucru', 'var(--fl-warn)'],
};
// Proforma nu e document fiscal: nu merge la ANAF (web: „nu se trimite" în coloana e-Factura).
export const efOf = (v: any): [string, string] | null => (v.type === 'proforma' ? ['e-Factura: nu se trimite', 'var(--text-muted)'] : (EF_ST[v.efactura_status] || null));

// Rândurile, furnizorul și clientul pot veni ca text JSON (după baza de date): le citim în ambele forme.
const json = (v: any) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const eIntreg = (v: any) => !!v && Array.isArray(json(v.lines));

export type Privire = 'noi' | 'fisa' | 'client';

export function DocumentFactura({ inv: inv0, privire, onClose, onChanged, nota }: {
  inv: any; privire: Privire; onClose: () => void; onChanged?: () => void; nota?: string;
}) {
  const [plin, setPlin] = useState<any | null>(eIntreg(inv0) ? inv0 : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  useInapoiInchide(true, () => { if (busy) return false; onClose(); return true; });
  useEffect(() => {
    if (eIntreg(inv0)) { setPlin(inv0); return; }
    // Clientul n-are ruta asta (e a noastră); lui îi vin documentele întregi.
    if (privire === 'client') { setPlin(inv0); return; }
    let viu = true;
    setPlin(null); setErr('');
    Api.invoice(Number(inv0.id)).then((x: any) => { if (viu) setPlin(x || inv0); })
      .catch((e: any) => { if (viu) setErr(e?.message || 'Documentul nu s-a încărcat.'); });
    return () => { viu = false; };
  }, [inv0 && inv0.id]);

  const inv = plin || inv0;
  const iss = json(inv.issuer) || {}, cl = json(inv.client) || {};
  const lines: any[] = plin && Array.isArray(json(plin.lines)) ? json(plin.lines) : [];
  const pf = inv.type === 'proforma';
  const st = privire === 'noi' ? stareNoi(inv) : stareClient(inv);
  const ef = privire === 'client' ? null : efOf(inv);
  const actiuni = privire === 'noi' && !!plin;
  const unica = inv.fel === 'unica' || pf;
  // Factura născută din proformă are deja în mențiuni „Emisă la încasarea proformei PF-…": nu o spunem de două ori
  // (pe web apare și în mențiuni, și în subsol — revizia din 29.09).
  const dinProformaSpus = /proform/i.test(String(inv.note || ''));
  const gata = () => { if (onChanged) onChanged(); else onClose(); };

  async function act(kind: string) {
    // „Plătită" nu mai prelungește niciun acces (29.09); pe o proformă înseamnă „Încasată" și emite factura fiscală.
    if (kind === 'paid' && !confirm(pf ? INTREB_PROFORMA : INTREB_FACTURA)) return;
    if (kind === 'cancel' && !confirm('Anulezi acest document? (pentru facturi plătite se folosește storno)')) return;
    setBusy(kind);
    try {
      if (kind === 'paid') {
        const r = await Api.invoiceSetStatus(inv.id, 'paid');
        const nr = (r && r.invoice && r.invoice.full_number) || '';
        showToast(pf ? ((r && r.already ? 'Proforma era deja încasată' : 'Proformă încasată') + (nr ? ' → factura ' + nr : '') + ' ✓') : 'Factură plătită ✓');
        gata();
      }
      else if (kind === 'cancel') { await Api.invoiceSetStatus(inv.id, 'canceled'); showToast('Document anulat'); gata(); }
      else if (kind === 'anaf') { const r = await Api.invoiceEfacturaSend(inv.id); showToast('Trimisă la ANAF (index ' + (r.index || '') + ')'); gata(); }
      else if (kind === 'anafStare') { const r = await Api.invoiceEfacturaStatus(inv.id); showToast('Status ANAF: ' + ((r && (r.stare || r.status || r.note)) || '—')); gata(); }
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }
  const btnSec = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> {TIP[inv.type] || 'Factură'} {inv.full_number}</b><button class="h-btn" onClick={() => { if (!busy) onClose(); }} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="bill-doc">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
              <span style={`font-weight:700;color:${st[1]}`}>● {st[0]}</span>
              {ef ? <span style={`font-size:12px;font-weight:700;color:${ef[1]}`}>{ef[0]}</span> : null}
            </div>
            {pf ? <div class="bill-nota">Factură proformă: document fără valoare fiscală. Factura fiscală se emite la încasare, cu aceleași rânduri.</div> : null}
            {nota ? <div class="bill-mic" style="margin-bottom:6px">{nota}</div> : null}
            {err ? <div class="bill-avert rau">{err}</div> : null}
            {!plin && !err ? <div style="padding:18px 0"><div class="spin" style="margin:0 auto" /></div> : null}
            {plin ? (
              <>
                <div class="bill-sec">Furnizor</div>
                <div class="bill-party"><b>{iss.name || '—'}</b>{iss.cui ? <div>CUI: {iss.cui}</div> : null}{iss.iban ? <div>IBAN: {iss.iban}</div> : null}</div>
                <div class="bill-sec">Client</div>
                <div class="bill-party"><b>{cl.name || inv.company_name || '—'}</b>{cl.cui ? <div>CUI: {cl.cui}</div> : null}</div>
                <div class="bill-sec">Linii</div>
                {lines.map((l) => (
                  <div class="bill-kv"><span>{l.desc} ({l.qty} × {money2(l.unitPrice)})</span><b>{money2(l.net)}</b></div>
                ))}
                <div class="bill-kv"><span>TVA</span><b>{money2(inv.vat_amount)} lei</b></div>
                <div class="bill-total"><span>Total de plată</span><b>{money2(inv.total)} lei</b></div>
              </>
            ) : null}
            <div class="bill-kv" style="margin-top:6px"><span>Emisă pe</span><b>{fmtD(inv.issue_date)}</b></div>
            <div class="bill-kv"><span>Scadență</span><b>{fmtD(inv.due_date)}</b></div>
            {unica || !plin ? null : <div class="bill-kv"><span>Perioada</span><b>{fmtD(inv.period_start)} → {fmtD(inv.period_end)}</b></div>}
            {plin && inv.note ? <div class="bill-kv"><span>Mențiuni</span><b class="bill-ment">{inv.note}</b></div> : null}
            {plin && inv.din_proforma && !dinProformaSpus ? <div class="bill-nota">Emisă la încasarea unei proforme.</div> : null}
          </div>
          {actiuni && <div class="frm-actions" style="flex-wrap:wrap;gap:8px;margin-top:12px">
            {inv.status !== 'paid' && inv.status !== 'canceled' && <button class="btn btn-primary" disabled={!!busy} onClick={() => act('paid')}><Icon name="check" size={15} color="#06210f" /> {pf ? 'Încasată' : 'Plătită'}</button>}
            {/* Factura pleacă singură la ANAF la emitere (30.09): butonul doar pe cea netrimisă sau respinsă — pe una aflată deja
                la ANAF ar dubla-o în SPV-ul clientului (serverul refuză, 409). Ca pe web. */}
            {!pf && inv.status !== 'canceled' && inv.efactura_status !== 'validated' && inv.efactura_status !== 'uploaded' && <button class="btn" style={btnSec} disabled={!!busy} onClick={() => act('anaf')}>{busy === 'anaf' ? '…' : (inv.efactura_status === 'error' ? 'Retrimite ANAF' : 'Trimite ANAF')}</button>}
            {!pf && inv.efactura_status === 'uploaded' && <button class="btn" style={btnSec} disabled={!!busy} onClick={() => act('anafStare')}><Icon name="refresh" size={14} /> {busy === 'anafStare' ? '…' : 'Verifică status ANAF'}</button>}
            {inv.status !== 'paid' && inv.status !== 'canceled' && <button class="btn btn-danger-ghost" disabled={!!busy} onClick={() => act('cancel')}>Anulează</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}
