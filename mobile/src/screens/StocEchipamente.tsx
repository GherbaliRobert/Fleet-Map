import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { AntetFondator, Banda } from '../components/FondatorUi';
import { Confirma } from '../components/FlotaUi';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { raCauta } from '../lib/format';
import { nrDe, deNr } from '../lib/numar';
import './admin.css';   // .frm / .fld / .frm-actions
import './detail.css';  // .sheet*
import './flota.css';   // .fl-btn2 („Renunț" din foi, ca în Confirma)
import './fondator.css';
import './stoc.css';

// „Stoc echipamente" (Gestiune, doar la noi) — oglinda secțiunii de pe web (_raxStoc / raxLoadStoc, 25.09).
// Un rând = o BUCATĂ (un GPS, un modul), cu seria ei: UNDE e (depozit → instalator → montat la client → returnat /
// defect / casat) și AL CUI e (al nostru sau vândut). Aparatele închiriate rămân ale noastre și stau la clienți,
// deci trebuie să știm oricând unde e fiecare. Clientul nu vede nimic de aici.
//
// Regulile NU se scriu aici: pe unde poate merge o bucată (`treceri`), sumarul pe modele, alertele „De făcut”,
// textele stărilor și numele modelelor vin toate de la server (stoc.js). Telefonul arată ce primește și trimite
// ce a ales omul; serverul spune ultimul cuvânt (refuză o trecere, o ștergere, o serie deja în stoc).
// Legătura cu „Dispozitive” e tot pe server: un aparat din stoc, legat de o firmă acolo, trece singur pe „montat”.

type Istoric = { la: number; stare: string; company_id?: number | null; partener_id?: number | null; proprietar?: string; cine?: string | null; nota?: string | null };
type Bucata = {
  id: number; tip: string; serie: string | null; stare: string; proprietar: 'ra' | 'client';
  company_id: number | null; partener_id: number | null; cost_eur: number | null; furnizor: string | null;
  stare_din: number | null; note: string | null; istoric: Istoric[]; company_name?: string | null; partener_nume?: string | null;
};
type Tip = { k: string; et: string; cost?: string };
type Sumar = { depozit: number; instalator: number; inchiriate: number; vandute: number; retur: number; defect: number };
type Alerte = { subMinim: { tip: string; minim: number; depozit: number }[]; laInstalator: { id: number; zile: number }[]; deRecuperat: { id: number; company_id: number }[]; zileInstalator: number };
type StocDate = {
  aparate: Bucata[]; sumar: Record<string, Sumar>; alerte: Alerte;
  praguri: { minim: Record<string, number>; zileInstalator: number };
  tipuri: Tip[]; stari: Record<string, string>; treceri: Record<string, string[]> | null;
};
type FoaieDeschisa = null | 'intrare' | 'praguri' | 'muta';

// Filele, ca pe web (STOC_FILE). „Toate” nu arată casatele: au ieșit din evidență.
const FILE: [string, string][] = [['toate', 'Toate'], ['depozit', 'În depozit'], ['instalator', 'La instalatori'], ['montat', 'La clienți'], ['retur', 'De verificat'], ['defect', 'Defecte'], ['casat', 'Casate']];
// Culoarea pastilei „Unde e”, ca pe web: depozit verde, drum / de verificat portocaliu, defect / casat roșu, montat neutru.
const TON: Record<string, string> = { depozit: 'on', instalator: 'warn', montat: '', retur: 'warn', defect: 'bad', casat: 'bad' };
const PAS = 150;
const zi = (ms: any) => (ms ? new Date(Number(ms)).toLocaleDateString('ro-RO') : '—');
const euro = (n: any) => Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const SUMAR_GOL: Sumar = { depozit: 0, instalator: 0, inchiriate: 0, vandute: 0, retur: 0, defect: 0 };

function curata(s: any): StocDate {
  const a = (s && s.alerte) || {};
  return {
    aparate: Array.isArray(s && s.aparate) ? s.aparate : [],
    sumar: (s && s.sumar) || {},
    alerte: { subMinim: a.subMinim || [], laInstalator: a.laInstalator || [], deRecuperat: a.deRecuperat || [], zileInstalator: a.zileInstalator },
    praguri: { minim: (s && s.praguri && s.praguri.minim) || {}, zileInstalator: s && s.praguri ? s.praguri.zileInstalator : null },
    tipuri: Array.isArray(s && s.tipuri) ? s.tipuri : [],
    stari: (s && s.stari) || {},
    treceri: (s && s.treceri) || null,
  };
}

export function StocEchipamente() {
  const loc = useLocation();
  const [d, setD] = useState<StocDate | null>(null);
  const [err, setErr] = useState('');
  const [parteneri, setParteneri] = useState<any[]>([]);
  const [firme, setFirme] = useState<any[]>([]);
  const [costuri, setCosturi] = useState<Record<string, any>>({});
  const [fila, setFila] = useState('toate');
  const [q, setQ] = useState('');
  const [cate, setCate] = useState(PAS);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [deschis, setDeschis] = useState<Record<string, boolean>>({});
  const [foaie, setFoaie] = useState<FoaieDeschisa>(null);
  const [del, setDel] = useState<Bucata | null>(null);
  const [busy, setBusy] = useState(false);
  const [fErr, setFErr] = useState(''); // eroarea serverului, arătată în foaia deschisă (ca #stoc-msg pe web)
  const [fi, setFi] = useState({ tip: '', cost: '', serii: '', buc: '', furnizor: '' });
  const [fp, setFp] = useState<{ minim: Record<string, string>; zile: string }>({ minim: {}, zile: '' });
  const [mf, setMf] = useState({ stare: '', part: '', co: '', prop: '', nota: '' });
  const dinRand = useRef(false); // „Mută” de pe un rând alege doar bucata aceea; la „Renunț” n-o lăsăm aleasă
  const areDate = useRef(false);
  const start = useRef(''); // foaia cum s-a deschis — închiderea întreabă doar dacă s-a schimbat ceva (ca la vecini)

  // Aceleași patru cereri ca pe web: stocul, instalatorii (pentru „La ce instalator” și istoric), costurile noastre
  // (costul propus la intrare) și firmele (pentru „La ce firmă” și istoric). Doar prima e obligatorie.
  function reload(tacut = false) {
    if (!tacut) setErr('');
    Promise.all([
      Api.stoc(),
      Api.montajParteneri().catch(() => null),
      Api.systemSettings().catch(() => null),
      Api.companies().catch(() => null),
    ]).then(([s, p, ss, co]) => {
      areDate.current = true;
      setD(curata(s));
      if (Array.isArray(p)) setParteneri(p);
      if (ss) setCosturi((ss && ss.costuri_noastre) || {});
      if (Array.isArray(co)) setFirme(co);
      setErr('');
    }).catch((e: any) => {
      if (tacut && areDate.current) { showToast(e?.message || 'Stocul nu s-a putut reîncărca.', true); return; }
      setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Stocul nu s-a putut încărca.'));
    });
  }
  useEffect(() => { reload(); }, []);

  const toate = d ? d.aparate : [];
  const tipuri = d ? d.tipuri : [];
  const stari = d ? d.stari : {};
  const tipEt = (k: string) => (tipuri.find((t) => t.k === k) || { et: k }).et;
  const firmaNume = (id: any, rezerva?: string | null) =>
    rezerva || (firme.find((c) => Number(c.id) === Number(id)) || {}).name || ('firma #' + id);
  const partNume = (id: any) => (parteneri.find((p) => Number(p.id) === Number(id)) || {}).name || '';

  // Contoarele filelor se numără din lista primită; filtrul (fila + căutarea) tot aici, pe aceeași listă.
  const nr: Record<string, number> = {};
  FILE.forEach(([k]) => { nr[k] = toate.filter((x) => (k === 'toate' ? x.stare !== 'casat' : x.stare === k)).length; });
  const lista = useMemo(() => toate.filter((x) => {
    if (fila === 'toate') { if (x.stare === 'casat') return false; } else if (x.stare !== fila) return false;
    return raCauta(q, x.serie, tipEt(x.tip), x.company_name, x.partener_nume, x.furnizor, x.note);
  }), [d, fila, q]);

  const idsAlese = Object.keys(sel).filter((k) => sel[k]).map(Number);
  const nSel = idsAlese.length;

  // ── Foile ──
  // Toate trei foile se compară cu instantaneul luat la deschidere (`start`), ca la vecini (Montaj, ContractMontaj,
  // ParteneriMontaj). Până pe 29.09 întreba doar „Intrare în stoc”: minimele schimbate și ce alegeai la „Mută” se
  // pierdeau pe tăcute la „înapoi”, la fundal, la X sau la „Renunț”.
  const formaFoii = () => JSON.stringify(foaie === 'intrare' ? fi : foaie === 'praguri' ? fp : mf);
  function ceSePierde(): string {
    if (foaie === 'intrare') return fi.serii.trim() ? 'Seriile scrise se pierd.' : 'Ce ai scris la intrarea în stoc se pierde.';
    if (foaie === 'praguri') return 'Ce ai scris la stocul minim se pierde.';
    return 'Ce ai ales la mutare se pierde.';
  }
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal, „Renunț” și „înapoi” de pe Android.
  function inchide(): boolean {
    if (busy) return false;
    if (del) { setDel(null); return true; }
    if (!foaie) return true;
    if (formaFoii() !== start.current && !confirm('Închizi fără să salvezi?\n\n' + ceSePierde())) return false;
    if (foaie === 'muta' && dinRand.current) setSel({});
    dinRand.current = false;
    setFoaie(null);
    return true;
  }
  useInapoiInchide(!!foaie || !!del, inchide);

  function costPropus(tipK: string): string {
    const t = tipuri.find((x) => x.k === tipK);
    const c = t && t.cost ? costuri[t.cost] : null;
    return c == null || c === '' ? '' : String(c);
  }
  function deschideIntrare() {
    const t0 = (tipuri[0] && tipuri[0].k) || '';
    const f = { tip: t0, cost: costPropus(t0), serii: '', buc: '', furnizor: '' };
    setFi(f); start.current = JSON.stringify(f);
    setFErr(''); setFoaie('intrare');
  }
  function deschidePraguri() {
    const mn = (d && d.praguri.minim) || {};
    const m: Record<string, string> = {};
    tipuri.forEach((t) => { m[t.k] = mn[t.k] ? String(mn[t.k]) : ''; });
    const z = d && d.praguri.zileInstalator;
    const f = { minim: m, zile: z ? String(z) : '' };
    setFp(f); start.current = JSON.stringify(f);
    setFErr(''); setFoaie('praguri');
  }
  // Unde poate ajunge ce e ales: stările în care poate trece MĂCAR o bucată, după `treceri` trimis de server. Pornim
  // pe prima în care pot trece TOATE. Fără `treceri` (server vechi), toate stările, ca pe web — serverul refuză oricum.
  function optiuniStare(alese: Bucata[]): string[] {
    const toateSt = Object.keys(stari);
    const tr = d && d.treceri;
    if (!tr || !alese.length) return toateSt;
    const u = toateSt.filter((s) => alese.some((x) => (tr[x.stare] || []).indexOf(s) >= 0));
    return u.length ? u : toateSt;
  }
  const poateAjunge = (x: Bucata, s: string) => !d || !d.treceri || (d.treceri[x.stare] || []).indexOf(s) >= 0;
  function deschideMuta(alese: Bucata[]) {
    const opt = optiuniStare(alese);
    const prima = opt.find((s) => alese.every((x) => poateAjunge(x, s))) || opt[0] || '';
    const f = { stare: prima, part: '', co: '', prop: '', nota: '' };
    setMf(f); start.current = JSON.stringify(f);
    setFErr(''); setFoaie('muta');
  }
  function mutaUna(x: Bucata) { setSel({ [x.id]: true }); dinRand.current = true; deschideMuta([x]); }
  function mutaAlese() { dinRand.current = false; deschideMuta(toate.filter((x) => sel[x.id])); }

  async function intrare() {
    if (busy) return;
    setBusy(true); setFErr('');
    try {
      // Seriile pleacă TEXTUL scris; serverul (stoc.serii) le desparte, le curăță și scoate dublurile.
      const r = await Api.stocIntrare({ tip: fi.tip, serii: fi.serii, buc: fi.buc, cost_eur: fi.cost, furnizor: fi.furnizor });
      showToast(nrDe(r.adaugate, 'bucată a intrat', 'bucăți au intrat') + ' în stoc ✓');
      setFoaie(null); reload(true);
    } catch (e: any) { setFErr(e?.message || 'Nu s-a putut adăuga.'); }
    finally { setBusy(false); }
  }
  async function salveazaPraguri() {
    if (busy) return;
    // Se trimit doar minimele completate: serverul rescrie tot obiectul, deci o casetă golită scoate minimul modelului.
    const minim: Record<string, string> = {};
    Object.keys(fp.minim).forEach((k) => { if (fp.minim[k] !== '') minim[k] = fp.minim[k]; });
    setBusy(true); setFErr('');
    try {
      await Api.stocPraguri({ minim, zileInstalator: fp.zile });
      showToast('Stocul minim, salvat ✓');
      setFoaie(null); reload(true);
    } catch (e: any) { setFErr(e?.message || 'Nu s-a putut salva.'); }
    finally { setBusy(false); }
  }
  async function muta() {
    if (busy) return;
    const b: any = { ids: idsAlese, stare: mf.stare, nota: mf.nota };
    if (mf.stare === 'instalator') b.partener_id = mf.part ? Number(mf.part) : null;
    // „După contractul firmei” = proprietar null: hotărăște serverul (o firmă care închiriază primește aparate ale noastre).
    if (mf.stare === 'montat') { b.company_id = mf.co ? Number(mf.co) : null; b.proprietar = mf.prop || null; }
    setBusy(true); setFErr('');
    try {
      const r = await Api.stocMuta(b);
      const ref = (r && r.refuzate) || [];
      let msg = nrDe(r.mutate, 'bucată mutată', 'bucăți mutate') + ' ✓';
      if (ref.length) msg += ' — ' + ref.length + ' nu s-au putut muta: ' + ref.map((x) => (x.serie || '#' + x.id) + ' ' + x.motiv).slice(0, 3).join('; ');
      showToast(msg, ref.length > 0);
      dinRand.current = false;
      setSel({}); setFoaie(null); reload(true);
    } catch (e: any) { setFErr(e?.message || 'Nu s-a putut muta.'); }
    finally { setBusy(false); }
  }
  async function sterge() {
    if (!del || busy) return;
    const x = del;
    setBusy(true);
    try { await Api.stocSterge(x.id); showToast('Bucata a fost ștearsă ✓'); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge.', true); }
    finally {
      setBusy(false); setDel(null);
      setSel((s) => { const n = { ...s }; delete n[x.id]; return n; });
      reload(true);
    }
  }

  // ── Sumarul pe modele: cifrele DOAR din `sumar` și `praguri`; „sub minim” = ce a trimis serverul în alerte. ──
  function sumarHtml() {
    if (!d) return null;
    const minim = d.praguri.minim || {};
    const subMin: Record<string, boolean> = {};
    d.alerte.subMinim.forEach((s) => { subMin[s.tip] = true; });
    const tip = tipuri.filter((t) => d.sumar[t.k] || minim[t.k]);
    if (!tip.length) return null;
    return (
      <div class="fd-kpis">
        {tip.map((t) => {
          const x = d.sumar[t.k] || SUMAR_GOL;
          const sub = !!subMin[t.k];
          const parti = [x.instalator ? x.instalator + ' la instalatori' : '', x.inchiriate ? x.inchiriate + ' închiriate' : '', x.vandute ? x.vandute + ' vândute' : '',
            x.retur ? x.retur + ' de verificat' : '', x.defect ? x.defect + ' defecte' : ''].filter(Boolean);
          return (
            <div class={'fd-kpi st-kpi' + (sub ? ' warn' : '') + (tip.length === 1 ? ' lat' : '')}>
              <div class="cap">{t.et}</div>
              <div class="v" style={'color:' + (sub ? 'var(--fd-warn)' : 'var(--fd-ok)')}>{x.depozit} <span class="mic">în depozit</span></div>
              <div class="l">{parti.length ? parti.join(' · ') : 'nimic plecat din depozit'}</div>
              {minim[t.k] ? <div class="l">minim: {minim[t.k]}{sub && <> — <span class="comanda">e timpul să comanzi</span></>}</div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  // ── „De făcut”: un rând pe fel de alertă, cum le-a socotit serverul (stoc.alerte). ──
  function alerteHtml() {
    if (!d) return null;
    const a = d.alerte;
    const peId: Record<string, Bucata> = {};
    toate.forEach((x) => { peId[x.id] = x; });
    const L: ComponentChildren[] = [];
    a.subMinim.forEach((s) => { L.push(<><b>{tipEt(s.tip)}</b>: {s.depozit} în depozit, sub minimul de {s.minim} — e timpul să comanzi.</>); });
    if (a.laInstalator.length) {
      const n = a.laInstalator.length;
      const bucati = a.laInstalator.slice(0, 6).map((x) => { const b = peId[x.id]; return (b && b.serie ? b.serie : '#' + x.id) + (b && b.partener_nume ? ' (' + b.partener_nume + ')' : ''); }).join(', ');
      L.push(<>{n === 1 ? 'O bucată stă' : n + deNr(n) + 'bucăți stau'} la instalator de peste {nrDe(a.zileInstalator, 'zi', 'zile')}: {bucati}{n > 6 ? '…' : ''} — montate și netrecute pe firmă (vezi Dispozitive → Neasignate), sau uitate.</>);
    }
    if (a.deRecuperat.length) {
      const peFirme: Record<string, { nume: string; serii: string[] }> = {};
      a.deRecuperat.forEach((x) => {
        const b = peId[x.id];
        const k = String(x.company_id);
        if (!peFirme[k]) peFirme[k] = { nume: firmaNume(x.company_id, b && b.company_name), serii: [] };
        peFirme[k].serii.push((b && b.serie) || '#' + x.id);
      });
      L.push(<>Aparate ale NOASTRE la firme cu contractul încheiat — <b>de recuperat</b>: {Object.keys(peFirme).map((k, i) => (
        <>{i > 0 ? ' · ' : ''}<b>{peFirme[k].nume}</b> ({peFirme[k].serii.slice(0, 5).join(', ')}{peFirme[k].serii.length > 5 ? '…' : ''})</>
      ))}.</>);
    }
    if (!L.length) return null;
    return (
      <Banda ton="warn" icon="alert">
        <span class="st-dof"><b class="t">De făcut</b>{L.map((r) => <span class="r" style="display:block">• {r}</span>)}</span>
      </Banda>
    );
  }

  function rand(x: Bucata) {
    const ales = !!sel[x.id];
    const desc = !!deschis[x.id];
    const casat = x.stare === 'casat';
    const poateSterge = x.stare === 'depozit' && (x.istoric || []).length <= 1; // bucata care n-a fost nicăieri
    const det = x.stare === 'instalator' ? (x.partener_nume || '')
      : ((x.stare === 'montat' || x.stare === 'retur' || x.stare === 'defect') && x.company_id ? firmaNume(x.company_id, x.company_name) : '');
    const alCui = casat ? '—'
      : x.proprietar === 'client' ? 'vândut clientului'
        : x.stare === 'montat' ? <span class="inch">al nostru — închiriat</span> : 'al nostru';
    return (
      <div class={'st-card' + (ales ? ' ales' : '') + (casat ? ' casat' : '')} key={x.id}>
        <label class="st-bifa">
          <input type="checkbox" checked={ales} disabled={casat} aria-label={'Alege ' + (x.serie || 'bucata fără serie')}
            onChange={(e: any) => { const v = !!e.currentTarget.checked; setSel((s) => ({ ...s, [x.id]: v })); }} />
        </label>
        <div class="st-mid">
          <div class="st-r1">
            <span class="st-model">{tipEt(x.tip)}</span>
            <span class="st-cost">{x.cost_eur == null ? <span style="color:var(--text-muted);font-weight:700">cost —</span> : euro(x.cost_eur)}</span>
          </div>
          <button type="button" class={'st-serie' + (x.serie ? '' : ' fara')} aria-expanded={desc} title="Istoricul bucății"
            onClick={() => setDeschis((m) => ({ ...m, [x.id]: !m[x.id] }))}>
            <span>{x.serie || 'fără serie'}</span><Icon name={desc ? 'arrowDown' : 'chevronR'} size={15} />
          </button>
          <div class="st-unde">
            <span class={'fd-pill ' + (TON[x.stare] || '')}>{stari[x.stare] || x.stare}</span>
            {det ? <span class="det">{det}</span> : null}
          </div>
          <div class="st-sub">Al cui: {alCui} · De când: {zi(x.stare_din)}</div>
          {desc && (
            <div class="st-ist">
              <div class="ttl">Istoricul bucății</div>
              {(x.istoric || []).length === 0 && <div class="e">Fără mutări încă.</div>}
              {(x.istoric || []).slice().reverse().map((e) => {
                const unde = e.stare === 'instalator' ? partNume(e.partener_id) : (e.company_id ? firmaNume(e.company_id) : '');
                return (
                  <div class="e">
                    {zi(e.la)} · <b>{stari[e.stare] || e.stare}</b>{unde ? ' · ' + unde : ''}{e.nota ? ' · ' + e.nota : ''}
                    {e.cine ? <span class="cine"> ({e.cine})</span> : null}
                  </div>
                );
              })}
            </div>
          )}
          {(!casat || poateSterge) && (
            <div class="st-acts">
              {!casat && <button type="button" class="fd-btn" onClick={() => mutaUna(x)}><Icon name="swap" size={14} /> Mută</button>}
              {poateSterge && (
                <button type="button" class="fd-btn danger" onClick={() => setDel(x)} aria-label="Șterge (doar o bucată trecută din greșeală)">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Foaia „Mută”: ce se vede depinde de unde ajunge bucata.
  const aleseAcum = toate.filter((x) => sel[x.id]);
  const optMuta = foaie === 'muta' ? optiuniStare(aleseAcum) : [];
  const nuPot = foaie === 'muta' && mf.stare ? aleseAcum.filter((x) => !poateAjunge(x, mf.stare)).length : 0;
  const partActivi = parteneri.filter((p) => p.active !== false);
  const firmeReale = firme.filter((c) => !c.is_demo).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ro'));

  // Ecranul are două intrări: meniul și „Deschide Stoc echipamente” din „Abonament & plăți” al unei firme. Săgeata din
  // antet face ce face „înapoi” de pe Android (history.back): te duce de unde ai venit, nu mereu în meniu — ca
  // ContractDetail și Montaj. Meniul rămâne doar plasa pentru un ecran deschis direct, fără nimic în urmă.
  const inapoi = () => { if (history.length > 1) history.back(); else loc.route('/meniu'); };

  return (
    <div class="screen">
      <AntetFondator titlu="Stoc echipamente" onBack={inapoi} onRefresh={() => reload()} />
      <div class="content" style="padding:12px 16px 24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            {sumarHtml()}
            {alerteHtml()}

            <div class="st-h"><Icon name="boxes" size={18} /> Stocul nostru de echipamente</div>
            <div class="fd-note">
              Fiecare bucată, cu seria ei: unde e și al cui e. Aparatele GPS intră în aplicație o singură dată, aici, cu IMEI-ul: când
              transmit prima dată apar singure la Dispozitive → Neasignate, iar trecute pe o firmă, trec singure pe „montat la client”
              — închiriat, dacă firma închiriază. Clientul nu vede nimic de aici.
            </div>
            <div class="fd-acts" style="margin:0 0 10px">
              <button type="button" class="fd-btn primary" onClick={deschideIntrare} disabled={!tipuri.length}><Icon name="plus" size={15} /> Intrare în stoc</button>
              <button type="button" class="fd-btn" onClick={deschidePraguri} disabled={!tipuri.length}><Icon name="settings" size={15} /> Stoc minim</button>
            </div>
            {/* Caseta de căutare stă pe loc la fiecare literă (nu se redesenează nimic deasupra ei) — capcana de la Inventar. */}
            <input class="fd-search" value={q} placeholder="caută serie, model, firmă, instalator"
              onInput={(e: any) => { setQ(e.currentTarget.value); setCate(PAS); }} />
            <div class="fd-chips">
              {FILE.map(([k, et]) => (
                <button type="button" class={'fd-chip' + (fila === k ? ' on' : '')} onClick={() => { setFila(k); setCate(PAS); }}>
                  {et} <span class="cnt">{nr[k]}</span>
                </button>
              ))}
            </div>

            {lista.length === 0 ? (
              <div class="st-gol">
                {toate.length ? 'Nicio bucată aici.' : 'Stocul e gol. Începe cu „Intrare în stoc”: modelul, seriile (una pe rând), cât ne-a costat una și de la cine.'}
              </div>
            ) : (
              <div class="st-list">
                {lista.slice(0, cate).map(rand)}
                {lista.length > cate && (
                  <button type="button" class="fd-inca" style="width:100%;text-align:left;background:transparent;border:none;font-family:inherit"
                    onClick={() => setCate(cate + PAS)}>
                    și încă {lista.length - cate} — caută, sau atinge aici ca să le arăt
                  </button>
                )}
              </div>
            )}
            {nSel > 0 && <div class="st-loc-bara" />}
          </>
        )}
      </div>

      {nSel > 0 && !foaie && !del && (
        <div class="st-selbar">
          <span class="n">{nrDe(nSel, 'bucată aleasă', 'bucăți alese')}</span>
          <button type="button" class="fd-btn primary" onClick={mutaAlese}><Icon name="swap" size={15} /> Mută…</button>
          <button type="button" class="fd-btn" onClick={() => setSel({})}>Renunț</button>
        </div>
      )}

      {foaie === 'intrare' && (
        <Foaie titlu="Intrare în stoc" icon="plus" onClose={inchide}>
          <div class="frm">
            <div class="fld"><label>Model</label>
              <select value={fi.tip} onChange={(e: any) => { const t = e.currentTarget.value; setFi({ ...fi, tip: t, cost: costPropus(t) }); }}>
                {tipuri.map((t) => <option value={t.k}>{t.et}</option>)}
              </select>
            </div>
            <div class="fld"><label>Cât ne-a costat una (€)</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="ex. 45" value={fi.cost} onInput={(e: any) => setFi({ ...fi, cost: e.currentTarget.value })} />
            </div>
            <div class="fld"><label>Seriile, una pe rând — la GPS, IMEI-ul (15 cifre)</label>
              <textarea class="st-serii" placeholder={'864275071234567\n864275071234568'} value={fi.serii} onInput={(e: any) => setFi({ ...fi, serii: e.currentTarget.value })} />
            </div>
            <div class="fld"><label>Bucăți FĂRĂ serie (opțional)</label>
              <input type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={fi.buc} onInput={(e: any) => setFi({ ...fi, buc: e.currentTarget.value })} />
            </div>
            <div class="fld"><label>Furnizor</label>
              <input placeholder="ex. Teltonika / distribuitor" value={fi.furnizor} onInput={(e: any) => setFi({ ...fi, furnizor: e.currentTarget.value })} />
            </div>
            {fErr && <div class="st-err">{fErr}</div>}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={() => inchide()}>Renunț</button>
              <button class="btn btn-primary" disabled={busy} onClick={intrare}><Icon name="check" size={16} /> {busy ? 'Se adaugă…' : 'Adaugă în stoc'}</button>
            </div>
          </div>
        </Foaie>
      )}

      {foaie === 'praguri' && (
        <Foaie titlu="Stoc minim, pe model" icon="settings" onClose={inchide}>
          <div class="frm">
            <div class="st-hint">Sub cifra asta, sus apare „e timpul să comanzi”. Gol = fără minim.</div>
            {tipuri.map((t) => (
              <div class="fld"><label>{t.et}</label>
                <input type="number" inputMode="numeric" min="0" step="1" placeholder="—" value={fp.minim[t.k] || ''}
                  onInput={(e: any) => { const v = e.currentTarget.value; setFp((p) => ({ ...p, minim: { ...p.minim, [t.k]: v } })); }} />
              </div>
            ))}
            <div class="fld"><label>Câte zile poate sta o bucată la instalator</label>
              <input type="number" inputMode="numeric" min="1" step="1" placeholder="14" value={fp.zile} onInput={(e: any) => { const v = e.currentTarget.value; setFp((p) => ({ ...p, zile: v })); }} />
            </div>
            {fErr && <div class="st-err">{fErr}</div>}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={() => inchide()}>Renunț</button>
              <button class="btn btn-primary" disabled={busy} onClick={salveazaPraguri}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează'}</button>
            </div>
          </div>
        </Foaie>
      )}

      {foaie === 'muta' && (
        <Foaie titlu={'Mută ' + nrDe(nSel, 'bucată', 'bucăți')} icon="swap" onClose={inchide}>
          <div class="frm">
            <div class="fld"><label>Unde ajunge</label>
              <select value={mf.stare} onChange={(e: any) => setMf({ ...mf, stare: e.currentTarget.value })}>
                {optMuta.map((k) => <option value={k}>{stari[k] || k}</option>)}
              </select>
              {nuPot > 0 && (
                <div class="st-hint warn">
                  {nuPot === 1 ? 'O bucată aleasă nu poate' : nuPot + deNr(nuPot) + 'bucăți alese nu pot'} ajunge aici și {nuPot === 1 ? 'rămâne' : 'rămân'} unde {nuPot === 1 ? 'e' : 'sunt'}.
                </div>
              )}
            </div>
            {mf.stare === 'instalator' && (
              <div class="fld"><label>La ce instalator</label>
                <select value={mf.part} onChange={(e: any) => setMf({ ...mf, part: e.currentTarget.value })}>
                  <option value="">— alege instalatorul —</option>
                  {partActivi.map((p) => <option value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
            )}
            {mf.stare === 'montat' && (
              <>
                <div class="fld"><label>La ce firmă</label>
                  <select value={mf.co} onChange={(e: any) => setMf({ ...mf, co: e.currentTarget.value })}>
                    <option value="">— alege firma —</option>
                    {firmeReale.map((c) => <option value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Al cui e</label>
                  <select value={mf.prop} onChange={(e: any) => setMf({ ...mf, prop: e.currentTarget.value })}>
                    <option value="">după contractul firmei</option>
                    <option value="ra">al nostru (închiriat)</option>
                    <option value="client">al clientului (vândut)</option>
                  </select>
                </div>
              </>
            )}
            <div class="fld"><label>Notă (opțional)</label>
              <input placeholder="ex. proces-verbal nr. 12" value={mf.nota} onInput={(e: any) => setMf({ ...mf, nota: e.currentTarget.value })} />
            </div>
            {fErr && <div class="st-err">{fErr}</div>}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={() => inchide()}>Renunț</button>
              <button class="btn btn-primary" disabled={busy || !mf.stare} onClick={muta}><Icon name="check" size={16} /> {busy ? 'Se mută…' : 'Mută'}</button>
            </div>
          </div>
        </Foaie>
      )}

      {del && (
        <Confirma title="Șterge bucata" danger busy={busy} okLabel="Șterge"
          text={'Ștergi bucata' + (del.serie ? ' ' + del.serie : '') + '? Se poate doar pentru una trecută din greșeală — una care a fost pe undeva se trece pe „casat”.'}
          onOk={sterge} onCancel={() => { if (!busy) setDel(null); }} />
      )}
    </div>
  );
}

// Foaia de jos, comună celor trei formulare. Închiderea (X, fundal) trece prin aceeași funcție ca „înapoi” de pe Android.
function Foaie({ titlu, icon, onClose, children }: { titlu: string; icon: 'plus' | 'settings' | 'swap'; onClose: () => boolean; children: ComponentChildren }) {
  return (
    <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b style="display:flex;align-items:center;gap:8px"><Icon name={icon} size={18} color="var(--fd-ok)" /> {titlu}</b>
          <button class="h-btn" onClick={() => onClose()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
