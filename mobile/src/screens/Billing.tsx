import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { me, showToast } from '../app/store';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { nrDe } from '../lib/numar';
import { rutaFisa } from '../lib/companii';
import {
  LUNI, cheieLuna, lunaText, ziRo, felDinAdresa, ciornaDinRaspuns, sursaPusa, puneContract, acoperire, montajeDeTrimis,
  puneLucrare, scoateLucrare, editeazaLinie, stergeLinie, adaugaLinie, puneNota, liniiValide, corpEmitere, ceEste,
  stareClient, lunaViitoare, aparateDejaPe, metodaText,
} from '../lib/factura';
import type { Ciorna, Fel, Tip } from '../lib/factura';
// Hârtia documentului — una singură pe telefon, aceeași și în fișa firmei (fila Facturi, butonul „Vezi”).
import { DocumentFactura, TIP, stareNoi, efOf, fmtD, money2 } from '../components/DocumentFactura';
import './detail.css';
import './admin.css';
import './billing.css';
// --fl-ok / --fl-warn: verdele și chihlimbarul SCRISULUI, închise pe tema luminoasă. Pe alb, verdele aplicației
// (#3FE07D) și galbenul ies la contrast 1,6–2,9 — „● Activ / plătit" sau totalul facturii nu se citeau.
import './flota.css';
// --fd-warn: portocaliul SCRISULUI din ecranele fondatorului — pe tema închisă același portocaliu de până acum, pe
// cea luminoasă unul închis (#b45309: 5,0 pe alb). „⚠ Restanță · N zile până la suspendare" era --orange: 3,6 pe alb.
import './fondator.css';

const fmtMoney = (v: any) => (v != null ? Number(v).toLocaleString('ro-RO') + ' lei' : '—');
// Accesul unei firme se oprește DOAR pentru o factură neplătită la 15 zile după scadență, sau de mână
// (decizie Alin, 28.09). Nu mai există „acces până la" și nici „nelimitat": ceasul vechi pe perioade
// plătite bloca clienți care plătiseră tot. (Tot de atunci: plățile NU mai primesc un număr de factură
// inventat — „RAT-AAAA-000{id plată}" se putea bate cap în cap cu numărul unei facturi adevărate.)
const ACCESS: Record<string, [string, string]> = {
  active: ['● La zi', 'var(--fl-ok)'],
  grace: ['⚠ Restanță', 'var(--fl-warn)'],
  expired: ['🚫 Suspendat', 'var(--red)'],
};
// Banda de sus din „Facturile mele" (clientul), cu vorbele web-ului (raxLoadMyInvoices).
const ACCESS_CLIENT: Record<string, [string, string]> = {
  active: ['● Plățile sunt la zi', 'var(--fl-ok)'],
  grace: ['⚠ Aveți o factură restantă', 'var(--fl-warn)'],
  expired: ['🚫 Accesul este suspendat', 'var(--red)'],
};
// Starea unei firme în lista super-adminului, ca pe web (_raxAccessCell): un client suspendat se vede ca
// SUSPENDAT, cu motivul — două cauze (neplată, oprit de noi), care se rezolvă altfel fiecare — iar o restanță
// în derulare arată câte zile mai are până la suspendare. Întoarce [text, culoare, ordine în listă].
// (Al treilea motiv, „abonament expirat", a plecat pe 29.09 odată cu ceasul „acces până la".)
// Numărul facturii NU mai stă aici: are rândul lui, „Factura restantă" (restantaOf), cu scadența, ca pe web.
function accessOf(c: any): [string, string, number] {
  const a = (c && c.access) || {};
  const np = (c && c.neplata) || a.neplata || null;
  if (a.status === 'expired') {
    const et = a.motiv === 'manual' ? 'Oprit de noi' : 'Suspendat — neplată';
    return ['🚫 ' + et, 'var(--red)', 0];
  }
  if (np && np.faza === 'avertisment') {
    const z = Math.max(0, Number(np.zilePanaLaSuspendare) || 0);
    return ['⚠ Restanță · ' + nrDe(z, 'zi', 'zile') + ' până la suspendare', 'var(--fd-warn)', 0.5];
  }
  const sm = ACCESS[a.status] || ACCESS.active;
  return [sm[0], sm[1], a.status === 'grace' ? 1 : 2];
}
// Coloana „Factura restantă" de pe web (raxLoadBillingStatus → restanta): „RAT-…, scadentă pe 15.10.2026", sau „—".
function restantaOf(c: any): string {
  const a = (c && c.access) || {};
  const np = a.neplata || (c && c.neplata) || null;
  if (!np || !np.factura) return '—';
  return (np.factura.numar || '') + ', scadentă pe ' + fmtD(np.factura.due_date);
}

export function Billing() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  // „Generează factură" cu firma deja aleasă vine pe /billing?factura=<id firmă>[&fel=unica|abonament]: din Drumul
  // clientului („Emite prima factură" → factură unică) și din fișa firmei, fila Facturi („Factură unică / proformă",
  // „Abonamentul unei luni") — ca pe web (raxOpenGenInvoice(id, fel)). Fără `fel`, abonamentul unei luni.
  // Doar la noi: clientul își vede facturile, nu le emite.
  const q = (loc.query || {}) as any;
  const facturaPentru = isSuper ? parseInt(String(q.factura || '')) || null : null;
  const facturaFel = felDinAdresa(q.fel);
  return (
    <div class="screen">
      <header class="app-header">
        {/* Ca „înapoi" de pe Android: de unde ai venit (meniul, sau contractul — „Emite prima factură" din drumul clientului). */}
        <button class="h-btn" onClick={() => (history.length > 1 ? history.back() : loc.route('/meniu'))} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{isSuper ? 'Facturare' : 'Facturile mele'}</div>
        <div style="width:36px" />
      </header>
      {isSuper ? <SuperBilling facturaPentru={facturaPentru} facturaFel={facturaFel} /> : <MyBilling />}
    </div>
  );
}

// Plata se face DOAR prin transfer bancar, pe factură (decizia din 15.09: Stripe și plata cu cardul
// au fost scoase de tot, cu tot cu linkul de plată). Ca pe web (raxPayCta): fără buton de plată.

// ─── Admin firmă: starea plăților + documentele firmei + datele pentru transfer bancar ───
function MyBilling() {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<any | null>(null);
  useEffect(() => {
    Api.myInvoices()
      .then((d) => setData(d || { invoices: [] }))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Nu ai dreptul de a vedea facturile.' : (e?.message || 'Eroare la încărcare')); setData({ invoices: [] }); });
  }, []);
  if (err) return <div class="content has-tabbar"><div class="adm-empty" style="color:var(--red)">{err}</div></div>;
  if (!data) return <div class="content has-tabbar"><div class="adm-empty"><div class="spin" style="margin:0 auto" /></div></div>;
  const a = data.access || {};
  const sm = ACCESS_CLIENT[a.status] || ACCESS_CLIENT.active;
  const inv: any[] = data.invoices || [];
  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div class="bill-banner" style={`border-left:4px solid ${sm[1]}`}>
        <div class="st" style={`color:${sm[1]}`}>{sm[0]}</div>
        {a.status === 'grace' && a.mesaj ? <div class="sub" style="line-height:1.5">{a.mesaj}</div> : null}
        {data.unpaidInvoice ? (
          <div class="sub" style="margin-top:8px;line-height:1.5">Plata se face prin <b>transfer bancar</b>{(data.issuer && (data.issuer.iban || data.issuer.bank)) ? ' în contul ' + [data.issuer.bank, data.issuer.iban].filter(Boolean).join(' · ') : ' — datele de plată sunt pe factură'}.</div>
        ) : null}
      </div>
      <div class="mn-sec">Facturile mele</div>
      {inv.length === 0
        ? <div class="adm-empty">Nicio factură emisă încă.</div>
        : <div class="adm-list">{inv.map((v) => <FiscalRow v={v} client onClick={() => setView(v)} />)}</div>}
      {view && <DocumentFactura inv={view} privire="client" onClose={() => setView(null)} />}
    </div>
  );
}

// ─── Super-admin: status companii + facturi FISCALE + plăți + automatizare + date emitent ───
function SuperBilling({ facturaPentru, facturaFel }: { facturaPentru: number | null; facturaFel: Fel }) {
  const loc = useLocation();
  const [companies, setCompanies] = useState<any[] | null>(null);
  const [pays, setPays] = useState<any[]>([]);
  const [paysTotal, setPaysTotal] = useState<number>(0);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [issuer, setIssuer] = useState<any>({});
  const [cfg, setCfg] = useState<any>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [fview, setFview] = useState<any | null>(null);   // factură fiscală
  const [gen, setGen] = useState<{ cid: number | null; fel: Fel } | null>(null);   // „Generează factură", cu firma și felul alese sau nu
  const [editIss, setEditIss] = useState(false);
  const [running, setRunning] = useState(false);
  const cerutaFolosita = useRef(false);

  // Venit din Drumul clientului sau din fișa firmei: fereastra se deschide o singură dată, după ce avem lista de
  // firme. Adresa se curăță ÎNAINTE de a deschide fereastra (foaia își pune intrarea în istoric pe adresa de
  // atunci), ca o întoarcere pe ecran să nu redeschidă fereastra. O firmă care nu e în lista de facturare
  // (ștearsă între timp, sau firma demo) NU deschide fereastra pe altă firmă: ar fi prea ușor de emis factura greșitului.
  useEffect(() => {
    if (!facturaPentru || companies == null || cerutaFolosita.current) return;
    cerutaFolosita.current = true;
    loc.route('/billing', true);
    if (!companies.length) return;   // lista n-a venit: eroarea s-a spus deja
    if (!companies.some((c) => c.id === facturaPentru)) { showToast('Firma nu se găsește în lista de facturare.', true); return; }
    setGen({ cid: facturaPentru, fel: facturaFel });
  }, [facturaPentru, companies]);

  async function reload() {
    try {
      const [cos, pj, ss, iv, cf] = await Promise.all([
        Api.companies(), Api.payments(1000), Api.systemSettings().catch(() => ({})),
        Api.invoices().catch(() => ({ invoices: [] })), Api.billingConfig().catch(() => null),
      ]);
      setCompanies((Array.isArray(cos) ? cos : []).filter((c: any) => !c.is_demo));
      setPays((pj && (pj as any).payments) || []);
      setPaysTotal(Number(pj && (pj as any).total) || 0);
      setInvoices((iv && (iv as any).invoices) || []);
      setIssuer((ss && (ss as any).invoice_issuer) || {});
      setCfg(cf);
    } catch (e: any) { showToast(e?.message || 'Eroare la încărcare', true); setCompanies([]); }
  }
  useEffect(() => { reload(); }, []);

  async function runAuto() {
    // Factura automată se oprește DOAR la abonamentul lunii deja emis (29.09): o factură unică nu mai contează.
    if (!confirm('Rulezi facturarea automată acum?\nEmite abonamentul lunii pentru companiile cu auto-facturare activă (dacă e ziua lor de facturare și abonamentul lunii nu e deja facturat).')) return;
    setRunning(true);
    try { const r = await Api.billingRunAuto(); const n = ((r && r.issued) || []).length; showToast(n ? (nrDe(n, 'factură emisă', 'facturi emise') + ' automat') : 'Nicio factură de emis acum'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setRunning(false); }
  }
  async function toggleAuto(id: number, on: boolean) {
    try { await Api.companyBillingConfig(id, { auto_invoice: on }); setCompanies((cs) => (cs || []).map((c) => c.id === id ? { ...c, auto_invoice: on } : c)); showToast(on ? 'Auto-facturare activă' : 'Auto-facturare oprită'); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }

  if (companies == null) return <div class="content has-tabbar"><div class="adm-empty"><div class="spin" style="margin:0 auto" /></div></div>;

  const cos = companies.slice().sort((a, b) => accessOf(a)[2] - accessOf(b)[2]);
  const badge = (on: boolean, l: string) => <span style={`font-size:11px;font-weight:700;color:${on ? 'var(--fl-ok)' : 'var(--text-muted)'}`}>{l}</span>;

  return (
    <div class="content has-tabbar" style="padding-bottom:96px">
      <div style="display:flex;gap:8px;margin-bottom:6px">
        <button class="btn btn-primary" style="flex:1" onClick={() => setGen({ cid: null, fel: 'abonament' })}><Icon name="report" size={16} color="#06210f" /> Generează factură</button>
        <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setPay({})} aria-label="Încasare fără factură"><Icon name="plus" size={16} /></button>
        <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setEditIss(true)} aria-label="Date emitent"><Icon name="settings" size={16} /></button>
      </div>

      {cfg && (
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <span style="font-size:12px;font-weight:700"><Icon name="report" size={13} color="var(--accent)" /> Auto:</span>
          {badge(!!cfg.email, 'Email')}{badge(!!cfg.efactura, 'e-Factura' + (cfg.efactura && cfg.efacturaTest ? ' TEST' : ''))}
          <button class="btn" style="margin-left:auto;padding:5px 10px;font-size:12px;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" disabled={running} onClick={runAuto}>{running ? '…' : 'Rulează acum'}</button>
        </div>
      )}

      <div class="mn-sec">Status facturare companii</div>
      <div class="adm-list">
        {cos.map((c) => {
          const sm = accessOf(c);
          const platit = Number(c.paid_total) || 0;
          return (
            <div class="adm-item" style="cursor:default">
              <span class="ic-wrap"><Icon name="truck" size={19} /></span>
              <span class="mid">
                <div class="nm">{c.name}</div>
                <div class="sub" style={`color:${sm[1]}`}>{sm[0]}</div>
                {/* Ca pe web, coloanele „Factura restantă" și „Total plătit". */}
                <div class="sub">Factura restantă: {restantaOf(c)}</div>
                <div class="sub">Total plătit: {platit ? fmtMoney(platit) : '—'}</div>
              </span>
              <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-muted);margin-right:6px" onClick={(e: any) => e.stopPropagation()}><input type="checkbox" checked={c.auto_invoice === true} onChange={(e: any) => toggleAuto(c.id, e.target.checked)} />auto</label>
              {/* Ca pe web (805fe10): pe rând, „Facturile firmei" — fila Facturi din fișă, unde ✓ trece factura restantă pe
                  plătită. „Încasare" de aici înregistra o încasare FĂRĂ factură, iar factura rămânea „emisă" și firma se
                  suspenda deși plătise. Încasarea fără factură rămâne doar pe „+" de sus. */}
              <button class="btn" style="padding:6px 11px;font-size:12px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);white-space:nowrap" onClick={() => loc.route(rutaFisa(c.id, 'facturi'))}>Facturile firmei</button>
            </div>
          );
        })}
      </div>

      <div class="mn-sec">Facturi fiscale</div>
      {invoices.length === 0
        ? <div class="adm-empty">Nicio factură fiscală. Apasă „Generează factură".</div>
        : <div class="adm-list">{invoices.map((v) => <FiscalRow v={v} onClick={() => setFview(v)} />)}</div>}

      <div class="mn-sec">Plăți / încasări</div>
      <div class="bill-totinc">Total încasat: <b>{fmtMoney(paysTotal || 0)}</b></div>
      {pays.length === 0
        ? <div class="adm-empty">Nicio încasare înregistrată.</div>
        : <div class="adm-list">{pays.map((p) => <PaymentRow p={p} />)}</div>}

      {gen && <GenerateInvoiceSheet companies={companies} invoices={invoices} preset={gen.cid} felInitial={gen.fel}
        onClose={() => setGen(null)} onIssued={() => { setGen(null); reload(); }}
        onIssuer={() => { setGen(null); setEditIss(true); }} />}
      {fview && <DocumentFactura inv={fview} privire="noi" onClose={() => setFview(null)} onChanged={() => { setFview(null); reload(); }} />}
      {pay && <RecordPaymentSheet companies={companies} preset={pay.companyId} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
      {editIss && <IssuerSheet issuer={issuer} onClose={() => setEditIss(false)} onSaved={(iss: any) => { setIssuer(iss); setEditIss(false); }} />}
    </div>
  );
}

// Un document în listă. La noi: felul, numărul, firma; starea, „ce e" (abonamentul lunii / unică / proformă),
// ziua emiterii, e-Factura. La client (`client`): starea pe limba lui (De plată / Restantă / Plătită / Încasată),
// ziua emiterii și scadența — ca tabelul din „Facturile mele" de pe web.
function FiscalRow({ v, onClick, client }: { v: any; onClick: () => void; client?: boolean }) {
  const st = client ? stareClient(v) : stareNoi(v);
  const ef = client ? null : efOf(v);
  // „Ce e": la o proformă doar „→ factură" spune ceva în plus (titlul rândului zice deja „Proformă").
  const ce0 = client ? '' : ceEste(v);
  const ce = ce0 && ce0 !== '—' && ce0 !== 'Proformă' ? ce0 : '';
  return (
    <button class="adm-item" onClick={onClick}>
      <span class="ic-wrap"><Icon name="report" size={19} /></span>
      <span class="mid">
        <div class="nm">{TIP[v.type] || 'Factură'} {v.full_number}{!client && v.company_name ? ' · ' + v.company_name : ''}</div>
        <div class="sub">
          <span style={`color:${st[1]};font-weight:700`}>● {st[0]}</span>
          {client
            ? <span> · din {fmtD(v.issue_date)} · scadentă {fmtD(v.due_date)}</span>
            : <span> · {ce ? ce + ' · ' : ''}{fmtD(v.issue_date)}</span>}
          {ef ? <span style={`color:${ef[1]}`}> · {ef[0]}</span> : null}
        </div>
      </span>
      <span class="rt"><b>{money2(v.total)} lei</b><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
    </button>
  );
}

// „Generează factură" (ca pe web, raxOpenGenInvoice): ABONAMENTUL unei luni SAU o factură UNICĂ.
//   • Abonamentul îl socotește serverul (/api/invoices/draft), pe zile de la montaj: mașinile nepornite nu intră, o
//     lună se facturează o singură dată (serverul refuză dublura cu 409, cu numărul facturii existente).
//   • Factura unică se completează din contract (aparatele din Anexa nr. 2, la cursul înghețat acolo) și din
//     lucrările de montaj executate (strânse pe rânduri, zilele în mențiuni). Poate ieși ca PROFORMĂ.
// Felul și luna pleacă la emitere DIN CIORNĂ (nu din selectoare): schimbi firma, felul, luna sau anul → ciorna se
// golește și se pregătește din nou. Regulile ferestrei stau în lib/factura.ts, legate de pagină printr-o probă.
// `preset` = firma deja aleasă, `felInitial` = felul cerut (fișa firmei, drumul clientului).
function GenerateInvoiceSheet({ companies, invoices, preset, felInitial, onClose, onIssued, onIssuer }: {
  companies: any[]; invoices: any[]; preset: number | null; felInitial: Fel; onClose: () => void; onIssued: () => void; onIssuer: () => void;
}) {
  const opts = (companies || []).filter((c: any) => !c.is_demo);
  const now = new Date();
  const ales = preset != null && opts.some((c: any) => c.id === preset) ? preset : (opts[0] && opts[0].id);
  const [cid, setCid] = useState<string>(String(ales || ''));
  const [fel, setFel] = useState<Fel>(felInitial === 'unica' ? 'unica' : 'abonament');
  const [tip, setTip] = useState<Tip>('invoice');
  const [mon, setMon] = useState(now.getMonth() + 1);
  const [yr, setYr] = useState(now.getFullYear());
  const [S, setS] = useState<Ciorna | null>(null);
  const [eroare, setEroare] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const cerere = useRef(0);          // un răspuns întârziat al unei ciorne vechi (altă firmă / lună) nu se mai pune
  const startAmp = useRef('');       // ciorna cum a venit — „înapoi" întreabă doar dacă omul a schimbat ceva
  const amp = (x: Ciorna | null) => (x ? JSON.stringify([x.lines, x.nota]) : '');

  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android: o linie
  // scrisă de mână nu se pierde dintr-o atingere. Cât se emite, rămâne.
  function inchide(): boolean {
    if (saving) return false;
    if (S && amp(S) !== startAmp.current && !confirm('Închizi fără să emiți factura?\n\nCe ai schimbat sau adăugat la liniile facturii se pierde.')) return false;
    onClose();
    return true;
  }
  useInapoiInchide(true, inchide);

  // Orice schimbare de firmă, fel, lună sau an golește ciorna (web: raxGiReset). Altfel rândurile lui octombrie
  // plecau pe abonamentul lui noiembrie.
  function goleste(): boolean {
    if (saving) return false;
    if (S && amp(S) !== startAmp.current && !confirm('Rândurile pregătite (cu ce ai schimbat la ele) se șterg. Continui?')) return false;
    cerere.current++; setS(null); setEroare(''); setLoading(false); startAmp.current = '';
    return true;
  }

  async function pregateste() {
    const id = parseInt(cid);
    if (!id) { showToast('Alege o companie', true); return; }
    // „Pregătește din nou" peste rânduri schimbate de mână întreabă întâi (ca la schimbarea firmei sau a lunii).
    if (S && amp(S) !== startAmp.current && !confirm('Rândurile pregătite (cu ce ai schimbat la ele) se șterg. Continui?')) return;
    const nr = ++cerere.current;
    setLoading(true); setS(null); setEroare('');
    try {
      const d = await Api.invoiceDraft(id, fel === 'abonament' ? cheieLuna(yr, mon) : undefined, fel);
      if (nr !== cerere.current) return;
      const c = ciornaDinRaspuns(d, id, fel);
      startAmp.current = amp(c);
      setS(c);
    } catch (e: any) { if (nr === cerere.current) setEroare(e?.message || 'Eroare la pregătire'); }
    finally { if (nr === cerere.current) setLoading(false); }
  }

  async function emite() {
    if (!S) return;
    if (!liniiValide(S).length) { showToast('Adaugă cel puțin o linie validă', true); return; }
    if (!(S.issuer && S.issuer.name && S.issuer.cui)) { showToast('Completează „Date emitent" (nume + CUI)', true); return; }
    const corp = corpEmitere(S, tip);
    setSaving(true);
    try {
      const r = await Api.issueInvoice(corp);
      const nr = (r && r.invoice && r.invoice.full_number) || '';
      showToast((corp.tip === 'proforma' ? 'Proformă emisă: ' : 'Factură emisă: ') + nr + (r && r.montajeFacturate ? ' · lucrările trec pe „facturat clientului"' : '') + ' ✓');
      onIssued();
    } catch (e: any) { showToast(e?.message || 'Eroare la emitere', true); }   // 409: mesajul serverului, cu numărul facturii existente
    finally { setSaving(false); }
  }

  const unica = fel === 'unica';
  const subtotal = S ? S.lines.reduce((s, l) => s + (Number(l.net) || 0), 0) : 0;
  const vatTotal = S ? S.lines.reduce((s, l) => s + (Number(l.vat) || 0), 0) : 0;
  const issuerOk = !!(S && S.issuer && S.issuer.name && S.issuer.cui);
  const acop = S ? acoperire(S) : {};
  const dc = (S && S.dinContract) || {};
  const sumaLinii = (ls: any[]) => (ls || []).reduce((x: number, l: any) => x + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const dejaAparate = S && unica ? aparateDejaPe(invoices, S.companyId, dc) : [];
  const peProforma = S && unica && tip === 'proforma' ? montajeDeTrimis(S).length : 0;
  const eticheta = unica && tip === 'proforma' ? 'Emite proforma' : 'Emite factura';

  const sec = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="report" size={18} color="var(--accent)" /> Generează factură</b><button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Companie (client)</label>
              <select value={cid} onChange={(e: any) => { const v = e.target.value; if (goleste()) setCid(v); else e.target.value = cid; }}>{opts.map((c: any) => <option value={c.id}>{c.name}</option>)}</select>
            </div>
            <div class="fld"><label>Ce facturezi</label>
              <div class="bill-fel">
                <button type="button" class={fel === 'abonament' ? 'on' : ''} onClick={() => { if (fel !== 'abonament' && goleste()) { setFel('abonament'); setTip('invoice'); } }}>
                  <b>Abonamentul unei luni</b><span>mașinile care transmit, pe zile de la montaj</span></button>
                <button type="button" class={unica ? 'on' : ''} onClick={() => { if (!unica && goleste()) setFel('unica'); }}>
                  <b>Factură unică</b><span>aparate, montaj — din contract</span></button>
              </div>
            </div>
            {!unica && <div class="frm-row">
              <div class="fld"><label>Luna</label><select value={String(mon)} onChange={(e: any) => { const v = parseInt(e.target.value); if (goleste()) setMon(v); else e.target.value = String(mon); }}>{LUNI.map((m, i) => <option value={i + 1}>{m}</option>)}</select></div>
              <div class="fld"><label>An</label><select value={String(yr)} onChange={(e: any) => { const v = parseInt(e.target.value); if (goleste()) setYr(v); else e.target.value = String(yr); }}>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option value={y}>{y}</option>)}</select></div>
            </div>}
            {unica && <div class="fld"><label>Document</label>
              {/* Se poate schimba și după ce rândurile sunt pregătite: rândurile rămân, se schimbă doar butonul. */}
              <div class="bill-fel">
                <button type="button" class={tip === 'invoice' ? 'on' : ''} onClick={() => setTip('invoice')}><b>Factură fiscală</b><span>merge la ANAF</span></button>
                <button type="button" class={tip === 'proforma' ? 'on' : ''} onClick={() => setTip('proforma')}><b>Proformă</b><span>cerere de plată; la încasare devine factură</span></button>
              </div>
            </div>}
            <button class="btn" style={sec + ';color:var(--fl-ok)'} disabled={loading} onClick={pregateste}>{loading ? 'Se pregătește…' : (S ? 'Pregătește din nou' : 'Pregătește rândurile')}</button>
            {eroare ? <div class="bill-avert rau">{eroare}</div> : null}

            {S && !issuerOk && (
              <div class="bill-avert">⚠ Completează întâi <b>Date emitent</b> (nume + CUI) — sunt obligatorii pe factură.
                <div style="margin-top:8px"><button class="btn" style={sec + ';padding:6px 12px;font-size:12px'} onClick={() => { if (!saving) onIssuer(); }}>Date emitent</button></div>
              </div>
            )}

            {S && issuerOk && (
              <div style="margin-top:12px">
                {!unica ? (
                  <div>
                    <div class="bill-cap">Abonamentul pe <b>{lunaText(S.luna)}</b> · {S.client?.name || ''}
                      {S.aparateIntregi ? ' · ' + nrDe(S.aparateIntregi, 'mașină', 'mașini') + ' pe luna întreagă' : ''}
                      {S.aparatePeZile ? (S.aparateIntregi ? ', ' : ' · ') + S.aparatePeZile + ' cu zilele de la montaj (' + (Number(S.aparatePeZile) === 1 ? 'pornită' : 'pornite') + ' luna trecută)' : ''}</div>
                    {S.aparateNepornite ? <div class="bill-mic">{Number(S.aparateNepornite) === 1
                      ? '1 aparat e pe firmă, dar nu transmite încă: nu intră pe factură. Pornește singur la montaj, la prima transmisie.'
                      : nrDe(S.aparateNepornite, 'aparat e', 'aparate sunt') + ' pe firmă, dar nu transmit încă: nu intră pe factură. Pornesc singure la montaj, la prima transmisie.'}</div> : null}
                    {/* Revizia din 29.09: o mașină montată între emitere și 1 ale lunii nu mai intră pe factura lunii, iar factura
                        automată sare luna deja facturată — zilele ei pe luna aceea nu se mai facturează niciodată. */}
                    {lunaViitoare(S.luna) ? <div class="bill-avert">⚠ Luna {lunaText(S.luna)} n-a început. O mașină montată până atunci nu mai intră pe această factură, iar factura automată sare luna deja facturată — deci zilele acelei mașini pe {lunaText(S.luna)} nu se mai facturează. Mai sigur: emite abonamentul de pe 1 {lunaText(S.luna)}.</div> : null}
                    {S.deja ? <div class="bill-avert rau">⚠ Luna asta e deja facturată: <b>{S.deja.full_number || ''}</b>. O a doua factură pe aceeași lună se refuză — dacă vrei s-o refaci, anuleaz-o întâi pe cea veche.</div> : null}
                  </div>
                ) : (
                  <div>
                    <div class="bill-cap">{tip === 'proforma' ? 'Proformă' : 'Factură unică'} · {S.client?.name || ''} · TVA {S.vatRate}%</div>
                    {(() => {
                      const areAparate = (dc.aparate || []).length > 0, areLucrari = (dc.lucrari || []).length > 0, areMontaj = !areLucrari && (dc.montaj || []).length > 0;
                      if (!areAparate && !areLucrari && !areMontaj) {
                        return <div class="bill-mic">{dc.contract ? 'Contractul firmei n-are aparate sau montaj în Anexa nr. 2' : 'Firma n-are încă un contract'} — scrie rândurile de mână.</div>;
                      }
                      return (
                        <div>
                          <div class="bill-mic">Din contractul {(dc.contract && dc.contract.number) || ''} și din lucrările executate{areLucrari ? ' (montajul se ia din lucrări: cantitățile reale)' : ''}:</div>
                          <div class="bill-surse">
                            {areAparate && (sursaPusa(S, 'aparate')
                              ? <div class="bill-sursa pusa"><Icon name="check" size={14} /> Aparatele din contract <span>· puse pe factură</span></div>
                              : <button class="bill-sursa" onClick={() => setS(puneContract(S, 'aparate'))}><Icon name="plus" size={14} /> Aparatele din contract <span>· {money2(sumaLinii(dc.aparate))} lei{dc.curs ? ', la ' + String(dc.curs).replace('.', ',') + ' lei/€' : ''}</span></button>)}
                            {areMontaj && (sursaPusa(S, 'montaj')
                              ? <div class="bill-sursa pusa"><Icon name="check" size={14} /> Montajul din contract <span>· pus pe factură</span></div>
                              : <button class="bill-sursa" onClick={() => setS(puneContract(S, 'montaj'))}><Icon name="plus" size={14} /> Montajul din contract <span>· {money2(sumaLinii(dc.montaj))} lei</span></button>)}
                            {areLucrari && (dc.lucrari || []).map((j: any) => {
                              const st = acop[j.id];
                              const nume = 'Montajul executat' + (j.data ? ' pe ' + ziRo(j.data) : '');
                              if (st === 'intreaga' || st === 'partiala') {
                                return (
                                  <div class={'bill-sursa pusa' + (st === 'partiala' ? ' partiala' : '')}>
                                    <Icon name={st === 'intreaga' ? 'check' : 'alert'} size={14} /> {nume}
                                    <span>{st === 'intreaga' ? ' · pus pe factură' : ' · doar o parte e pe factură: nu trece pe „facturat clientului" și va fi propus din nou'}</span>
                                    <button class="bill-scoate" onClick={() => setS(scoateLucrare(S, j.id))}>Scoate</button>
                                  </div>
                                );
                              }
                              return <button class="bill-sursa" onClick={() => setS(puneLucrare(S, j))}><Icon name="plus" size={14} /> {nume} <span>· {money2(j.total)} lei{j.partener ? ', ' + j.partener : ''}</span></button>;
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {dejaAparate.length ? <div class="bill-avert">⚠ Aparatele din contract apar deja pe {dejaAparate.join(', ')}. Verifică să nu le facturezi de două ori.</div> : null}
                  </div>
                )}

                {S.lines.length === 0
                  ? <div class="bill-mic" style="padding:8px 0">{unica ? 'Niciun rând încă.' : 'Nimic de facturat pe luna asta: nicio mașină pornită. Aparatele pornesc la prima transmisie, adică după montaj.'}</div>
                  : S.lines.map((l, i) => (
                    <div class="bill-linie">
                      <input style="flex:2;min-width:0" value={l.desc} onInput={(e: any) => setS(editeazaLinie(S, i, 'desc', e.target.value))} placeholder="Descriere" aria-label="Descriere" />
                      <input style="width:48px;text-align:center" type="number" min="0" value={l.qty} onInput={(e: any) => setS(editeazaLinie(S, i, 'qty', e.target.value))} aria-label="Cantitate" />
                      <input style="width:70px;text-align:right" type="number" min="0" step="0.01" value={l.unitPrice} onInput={(e: any) => setS(editeazaLinie(S, i, 'unitPrice', e.target.value))} aria-label="Preț unitar" />
                      <button class="btn" style="padding:6px 8px;background:transparent;border:1px solid var(--red);color:var(--red)" onClick={() => setS(stergeLinie(S, i))} aria-label="Șterge linia">×</button>
                    </div>
                  ))}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
                  <button class="btn" style={sec + ';padding:6px 9px;font-size:12px'} onClick={() => setS(adaugaLinie(S))}>+ Linie liberă</button>
                </div>
                {unica && (
                  <div class="fld"><label>Mențiuni pe factură (apar sub rânduri)</label>
                    <textarea rows={2} maxLength={500} value={S.nota} onInput={(e: any) => setS(puneNota(S, e.target.value))} />
                  </div>
                )}
                {peProforma ? <div class="bill-avert">⚠ De pe o proformă, lucrările de montaj nu trec pe „facturat clientului" — nici când proforma se încasează — și vor fi propuse din nou. Pune montajul pe o factură fiscală.</div> : null}
                <div class="bill-total"><span>Total (cu TVA)</span><b>{money2(subtotal + vatTotal)} lei</b></div>
                <div class="bill-mic" style="text-align:right;margin-top:4px">Net {money2(subtotal)} · TVA {money2(vatTotal)}</div>
                {unica && tip === 'proforma' ? <div class="bill-mic" style="margin-top:8px;line-height:1.5">Proforma nu e factură fiscală: are serie proprie și nu merge la ANAF. Când intră banii, apeși „Încasată" pe ea și se emite factura fiscală, cu aceleași rânduri.</div> : null}
                <div class="frm-actions" style="margin-top:12px"><button class="btn btn-primary" disabled={saving || !S.lines.length || (!unica && !!S.deja)} onClick={emite}>{saving ? 'Se emite…' : eticheta}</button></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Un rând din registrul încasărilor: data, firma, suma, pentru ce și metoda (ca pe web). FĂRĂ număr de factură inventat.
function PaymentRow({ p }: { p: any }) {
  return (
    <div class="adm-item" style="cursor:default">
      <span class="ic-wrap"><Icon name="report" size={19} /></span>
      <span class="mid">
        <div class="nm">{p.company_name || ('#' + p.company_id)}</div>
        <div class="sub">{fmtD(p.paid_at || p.created_at)} · {p.note || 'încasare fără factură'}</div>
        <div class="sub">Metodă: {metodaText(p.method)}</div>
      </span>
      <span class="rt"><b>{fmtMoney(p.amount_ron)}</b></span>
    </div>
  );
}

// Amprenta unui formular, ca foaia să știe dacă omul a schimbat ceva: valorile ca text (o casetă întoarce „19", nu
// 19), ca o cifră scrisă la loc la fel să nu treacă drept schimbare.
const amprenta = (f: any) => JSON.stringify(Object.keys(f || {}).sort().map((k) => [k, f[k] == null ? '' : String(f[k])]));

const METHODS = [{ v: 'transfer', l: 'Transfer bancar' }, { v: 'cash', l: 'Numerar' }, { v: 'card', l: 'Card' }, { v: 'manual', l: 'Alta' }];
function RecordPaymentSheet({ companies, preset, onClose, onSaved }: any) {
  const opts = (companies || []).filter((c: any) => !c.is_demo);
  const [form, setForm] = useState<any>(() => ({ company_id: preset || (opts[0] && opts[0].id) || '', amount: '', method: 'transfer', note: '' }));
  const start = useRef(amprenta(form));   // formularul cum s-a deschis
  const [saving, setSaving] = useState(false);
  // Aceeași întrebare pentru X, fundal și „înapoi" de pe Android: suma și nota scrise nu se pierd dintr-o atingere.
  function inchide(): boolean {
    if (saving) return false;
    if (amprenta(form) !== start.current && !confirm('Închizi fără să înregistrezi plata?\n\nCe ai scris la plată se pierde.')) return false;
    onClose();
    return true;
  }
  useInapoiInchide(true, inchide);
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function save() {
    const cid = parseInt(form.company_id);
    if (!cid) { showToast('Alege o companie', true); return; }
    setSaving(true);
    try {
      await Api.recordPayment(cid, { amount: (form.amount || '').trim() || null, method: form.method, note: (form.note || '').trim() || null });
      showToast('Încasare înregistrată');
      onSaved();
    } catch (e: any) { showToast(e?.message || 'Eroare la înregistrare', true); }
    finally { setSaving(false); }
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Încasare fără factură</b><button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Companie</label>
              <select value={form.company_id} onChange={(e) => setF('company_id', (e.target as HTMLSelectElement).value)}>
                {opts.map((c: any) => <option value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div class="fld"><label>Sumă încasată (lei)</label><input value={form.amount} onInput={(e) => setF('amount', (e.target as HTMLInputElement).value)} placeholder="ex: 1500 sau 1.234,56" /></div>
            <div class="sub" style="font-size:12px;color:var(--text-muted);line-height:1.5;margin:-4px 0 8px">Doar o sumă primită fără factură. Plata unei facturi se trece de pe factură („Plătită").</div>
            <div class="fld"><label>Metodă</label>
              <select value={form.method} onChange={(e) => setF('method', (e.target as HTMLSelectElement).value)}>
                {METHODS.map((m) => <option value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div class="fld"><label>Notă (ex: nr. factură)</label><input value={form.note} onInput={(e) => setF('note', (e.target as HTMLInputElement).value)} placeholder="ex: F 2026-0123" /></div>
            <div class="frm-actions">
              <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se înregistrează…' : 'Înregistrează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuerSheet({ issuer, onClose, onSaved }: any) {
  const [form, setForm] = useState<any>(() => ({ name: '', cui: '', reg_com: '', address: '', city: '', county: '', iban: '', bank: '', email: '', phone: '', vat_rate: 19, vat_payer: true, ...(issuer || {}) }));
  const start = useRef(amprenta(form));   // datele cum s-au deschis
  const [saving, setSaving] = useState(false);
  // Aceeași întrebare pentru X, fundal și „înapoi" de pe Android: datele emitentului schimbate nu se pierd pe tăcute.
  function inchide(): boolean {
    if (saving) return false;
    if (amprenta(form) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai schimbat la datele emitentului se pierde.')) return false;
    onClose();
    return true;
  }
  useInapoiInchide(true, inchide);
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      const j = await Api.saveSystemSettings({ invoice_issuer: form });
      showToast('Date emitent salvate');
      onSaved((j && (j as any).settings && (j as any).settings.invoice_issuer) || form);
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  const F = (k: string, label: string, ph?: string) => (
    <div class="fld"><label>{label}</label><input value={form[k]} onInput={(e) => setF(k, (e.target as HTMLInputElement).value)} placeholder={ph} /></div>
  );
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="settings" size={18} color="var(--accent)" /> Date emitent factură</b><button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="muted" style="font-size:12px;margin-bottom:10px">Aceste date apar ca EMITENT (Furnizor) pe facturile fiscale emise.</div>
          <div class="frm">
            {F('name', 'Denumire firmă', 'ex. RA Tracks SRL')}
            <div class="frm-row">{F('cui', 'CUI / CIF')}{F('reg_com', 'Reg. Com.')}</div>
            {F('address', 'Adresă')}
            <div class="frm-row">{F('city', 'Oraș / localitate', 'ex. SECTOR1')}{F('county', 'Cod județ', 'ex. RO-B')}</div>
            <div class="frm-row">{F('iban', 'IBAN')}{F('bank', 'Bancă')}</div>
            <div class="frm-row">{F('email', 'Email')}{F('phone', 'Telefon')}</div>
            <div class="frm-row">
              <div class="fld"><label>Cotă TVA (%)</label><input type="number" value={form.vat_rate} onInput={(e) => setF('vat_rate', (e.target as HTMLInputElement).value)} /></div>
              <div class="fld"><label>Plătitor TVA</label><label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px"><input type="checkbox" checked={form.vat_payer !== false} onChange={(e: any) => setF('vat_payer', e.target.checked)} /> da</label></div>
            </div>
            <div class="frm-actions">
              <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
