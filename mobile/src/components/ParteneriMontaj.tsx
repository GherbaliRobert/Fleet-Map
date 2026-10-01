// Partenerii de montaj — firmele care montează în locul nostru. Stau DOAR în secțiunea „Montaj" (Business), fila
// Parteneri (a doua, după Calendar), ca pe web (raxLoadMontaj → _raxParteneriCorp / raxPartEdit / raxPartAnaf /
// raxPartSalveaza / raxPartSterge), și NU apar nicăieri în ce vede clientul. Tarifele lor se propun singure la fiecare
// lucrare de montaj și intră în contractul cu partenerul (Anexa nr. 1). Modificarea e tot POST, cu id; serverul scrie
// DOAR cheile trimise. „Ne facturează" (lunar / săptămânal, 30.09) e ritmul în care facturăm și noi clientului
// montajul făcut de el; se vede pe rândul lui și intră în contractul cu el.
//
// Fișa are tot ce trebuie pe hârtia contractului: CUI (cu ANAF), Reg. Com., sediu, reprezentant, email (acolo pleacă
// contractul), telefon, IBAN, bancă, zonă — plus „Stare": un partener cu contract SEMNAT nu se șterge (serverul
// răspunde 409), se trece pe „inactiv". Inactivul nu se mai propune la lucrări noi.
//
// Ecranul Montaj îi dă lista, contractele (pentru pastila „contract: …" și „Fă contract") și îi cere să deschidă fișa
// unui partener („Completează" din fila Contracte); după salvarea fișei deschise ASTFEL îi dă înapoi partenerul, așa
// cum l-a scris serverul (`onSalvatDeschis`). Fără listă primită, componenta și-o încarcă singură.
// Butonul „înapoi" de pe Android închide foaia partenerului (întreabă dacă s-a scris ceva) sau întrebarea de
// ștergere, nu ecranul.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { MONTAJ_TIPURI } from '../lib/contracte';
import { NOTA_RITM, contractulPartenerului, mjStare, subPartener } from '../lib/montajSectiune';
import { nrDe } from '../lib/numar';
import { Confirma } from './FlotaUi';
import { Pill } from './ContractUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';
import '../screens/montaj.css';

type Edit = {
  id: number; name: string; cui: string; reg_com: string; address: string; rep: string; reprole: string;
  email: string; phone: string; iban: string; bank: string; zona: string; contact: string; activ: string;
  ritm: string;   // cât de des ne facturează (30.09): 'lunar' / 'saptamanal' — în același ritm facturăm montajul clientului
  tarife: Record<string, string>;
};
type Anaf = { cauta?: boolean; eroare?: string; ok?: boolean; radiata?: boolean; inactiva?: boolean } | null;

const s = (v: any) => (v == null ? '' : String(v));

export function ParteneriMontaj({ lista: listaData, contracte, onSchimbat, onFaContract, deschide, onDeschis, onSalvatDeschis }: {
  lista?: any[] | null;                 // din ecranul Montaj (o singură încărcare); lipsă = se încarcă singură
  contracte?: any[] | null;             // contractele cu partenerii: pastila „contract: …" / „fără contract"
  onSchimbat?: () => void;              // după salvare / ștergere, ecranul reîncarcă tot
  onFaContract?: (partenerId: number) => void;
  deschide?: number | null;             // fișa de deschis singură („Completează" din fila Contracte)
  onDeschis?: () => void;
  onSalvatDeschis?: (p: any) => void;   // fișa deschisă prin `deschide` s-a salvat — partenerul întors de server
} = {}) {
  const propria = listaData === undefined;
  const [listaProprie, setListaProprie] = useState<any[] | null>(null);
  const lista = propria ? listaProprie : listaData;
  const [edit, setEdit] = useState<Edit | null>(null);
  const [anaf, setAnaf] = useState<Anaf>(null);
  const [msg, setMsg] = useState('');
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupaSalvare, setDupaSalvare] = useState<any | null>(null); // partenerul salvat din fișa deschisă la cerere
  const start = useRef(''); // formularul cum s-a deschis — „înapoi" întreabă doar dacă s-a schimbat ceva
  const laCerere = useRef(false); // fișa de acum a deschis-o „Completează" (prin `deschide`), nu un rând din listă
  // Numărul fișei deschise: crește la fiecare deschidere și închidere. Un răspuns ANAF sosit după ce fișa s-a
  // închis — sau după ce s-a deschis a ALTUI partener — nu mai are unde să se scrie: altfel CUI-ul, sediul și
  // numele firmei A ar ajunge pe fișa lui B (și, la salvare, pe contractul lui B). ANAF poate răspunde în 8 s.
  const anafNr = useRef(0);

  function incarca() {
    if (!propria) { if (onSchimbat) onSchimbat(); return; }
    Api.montajParteneri().then((l) => setListaProprie(Array.isArray(l) ? l : [])).catch(() => setListaProprie([]));
  }
  useEffect(() => { if (propria) incarca(); }, []);

  function deschideFisa(p: any | null, cerut = false) {
    const t: Record<string, string> = {};
    MONTAJ_TIPURI.forEach(([k]) => { const v = p && p.tarife ? p.tarife[k] : null; t[k] = s(v); });
    const rep = (p && p.legal_rep) || {};
    const e: Edit = {
      id: p ? Number(p.id) : 0, name: s(p && p.name), cui: s(p && p.cui), reg_com: s(p && p.reg_com), address: s(p && p.address),
      rep: s(rep.name), reprole: s(rep.role), email: s(p && p.email), phone: s(p && p.phone), iban: s(p && p.iban),
      bank: s(p && p.bank), zona: s(p && p.zona), contact: s(p && p.contact), activ: p && p.active === false ? '0' : '1',
      ritm: p && p.ritm_facturare === 'saptamanal' ? 'saptamanal' : 'lunar', tarife: t,
    };
    start.current = JSON.stringify(e);
    laCerere.current = cerut;
    anafNr.current++;
    setAnaf(null);
    setMsg('');
    setEdit(e);
  }
  // Orice închidere a fișei (X, fundal, „înapoi", Renunț, salvare) trece pe aici: întrebarea ANAF încă pe drum
  // rămâne fără fișă.
  function inchideFoaia() { anafNr.current++; laCerere.current = false; setEdit(null); }
  // „Completează" din fila Contracte: fișa partenerului se deschide singură, după ce sosește lista.
  useEffect(() => {
    if (deschide == null || !lista) return;
    const p = lista.find((x) => Number(x.id) === Number(deschide));
    if (p) deschideFisa(p, true);
    else showToast('Partenerul nu mai există — poate a fost șters între timp.', true);
    if (onDeschis) onDeschis();
  }, [deschide, lista]);

  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android.
  function inchide(): boolean {
    if (!edit) return true;
    if (busy) return false;
    if (JSON.stringify(edit) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai scris la partener se pierde.')) return false;
    inchideFoaia();
    return true;
  }
  useInapoiInchide(!!edit, inchide);
  // La fel întrebarea „Șterge partenerul": „înapoi" o închide pe ea, nu ecranul Montaj. Cât se șterge, rămâne.
  // (Nu se deschide niciodată peste fișa partenerului.)
  useInapoiInchide(!!del, () => { if (busy) return false; setDel(null); return true; });
  // Pasul următor (ex. „Reia tarifele" în contract) se anunță ecranului abia DUPĂ ce fișa s-a închis și și-a scos
  // intrarea din istoric — curățenia pazei de mai sus rulează înaintea acestui efect. Anunțat în aceeași clipă,
  // întrebarea ecranului își punea intrarea peste a fișei, iar „înapoi" rămânea cu una în plus (măsurat, 29.09).
  useEffect(() => {
    if (!dupaSalvare || edit) return;
    const p = dupaSalvare;
    setDupaSalvare(null);
    if (onSalvatDeschis) onSalvatDeschis(p);
  }, [dupaSalvare, edit]);

  // „ANAF": completează doar ce vine (numele, Reg. Com., sediul, CUI-ul curat), ca pe web (raxPartAnaf) — și doar
  // pe fișa care a pus întrebarea (`anafNr`).
  async function cautaAnaf() {
    if (!edit || (anaf && anaf.cauta)) return;
    const cui = edit.cui.trim();
    if (!cui) { setAnaf({ eroare: 'Scrie întâi CUI-ul.' }); return; }
    const nr = anafNr.current;
    setAnaf({ cauta: true });
    try {
      const a: any = await Api.anafFirma(cui);
      if (nr !== anafNr.current) return; // fișa s-a închis sau e a altui partener: răspunsul nu mai e al ei
      setEdit((e) => (e ? {
        ...e, name: a.name || e.name, reg_com: a.reg_com || e.reg_com, address: a.address || e.address, cui: a.cui || e.cui,
      } : e));
      setAnaf({ ok: true, radiata: !!a.radiata, inactiva: !!a.inactiva });
    } catch (e: any) {
      if (nr !== anafNr.current) return;
      // Fără răspuns (rețea / timp depășit) → nu am ajuns la ANAF; altfel, vorbele serverului.
      const retea = !e || e.status === 0 || e.status === 408;
      setAnaf({ eroare: retea ? 'Nu am putut ajunge la ANAF.' : (e.message || 'Nu am găsit firma la ANAF.') });
    }
  }

  async function salveaza() {
    if (!edit || busy) return;
    const tarife: Record<string, number> = {};
    Object.keys(edit.tarife).forEach((k) => { const v = edit.tarife[k].trim(); if (v !== '') tarife[k] = parseFloat(v.replace(',', '.')); });
    const t = (v: string) => v.trim();
    setBusy(true);
    setMsg('');
    try {
      const j: any = await Api.saveMontajPartener({
        id: edit.id || null, name: t(edit.name), cui: t(edit.cui), contact: t(edit.contact), tarife,
        reg_com: t(edit.reg_com), address: t(edit.address), email: t(edit.email), phone: t(edit.phone),
        iban: t(edit.iban), bank: t(edit.bank), zona: t(edit.zona), active: edit.activ !== '0',
        ritm_facturare: edit.ritm === 'saptamanal' ? 'saptamanal' : 'lunar',
        legal_rep: t(edit.rep) ? { name: t(edit.rep), role: t(edit.reprole) } : null,
      });
      const cerut = laCerere.current;
      inchideFoaia();
      showToast('Partener salvat ✓');
      incarca();
      // Fișa deschisă din „Ce lipsește" al unui contract: ecranul poate propune pasul următor (ex. tarifele în
      // contract) — după ce fișa s-a închis de tot (efectul de mai sus).
      if (cerut && onSalvatDeschis) setDupaSalvare(j || {});
    } catch (e: any) {
      // Numele prea scurt, emailul greșit, partenerul șters între timp: pe fișă, cu vorbele serverului.
      setMsg(e?.message || 'Eroare');
    } finally { setBusy(false); }
  }
  async function sterge() {
    if (!del || busy) return;
    setBusy(true);
    try {
      const j: any = await Api.deleteMontajPartener(Number(del.id));
      const n = Number(j && j.contracte_sterse) || 0;
      setDel(null);
      showToast(n ? 'Partener șters, cu ' + nrDe(n, 'contract nesemnat', 'contracte nesemnate') : 'Partener șters');
      incarca();
    } catch (e: any) {
      // 409: are un contract semnat — nu se șterge, se trece pe „inactiv". Mesajul serverului, ca atare.
      setDel(null);
      showToast(e?.message || 'Eroare', true);
    } finally { setBusy(false); }
  }
  const sf = (k: keyof Edit, v: any) => { setMsg(''); setEdit((p) => (p ? { ...p, [k]: v } : p)); };
  const camp = (et: string, k: keyof Edit, ph: string, tip?: string) => (
    <div class="fld"><label>{et}</label>
      <input type={tip || 'text'} inputMode={tip === 'email' ? 'email' : tip === 'tel' ? 'tel' : undefined} value={edit ? (edit[k] as string) : ''}
        placeholder={ph} onInput={(e: any) => sf(k, e.target.value)} />
    </div>
  );
  const cuContracte = Array.isArray(contracte);

  return (
    <>
      <div class="ctr-h"><Icon name="wrench" size={17} class="ic" /> Parteneri de montaj</div>
      <div class="ctr-sub">Firmele care montează în locul nostru. Clientul nu le vede niciodată — pentru el montăm noi. Tarifele scrise aici se propun singure la fiecare lucrare și intră în contractul cu partenerul.</div>
      {lista == null ? <div class="spin" style="margin:8px auto" /> : (
        <div class="ctr-list">
          {!lista.length && <div class="ctr-empty">Niciun partener de montaj încă.</div>}
          {lista.map((p: any) => {
            const c = cuContracte ? contractulPartenerului(contracte, p.id) : null;
            const st = c ? mjStare(c.status) : null;
            const sub = subPartener(p); // … · „ne facturează lunar / săptămânal", ca pe web
            return (
              <div class="ctr-row">
                <div class="ctr-row-top">
                  <div class="ctr-row-t">
                    <b>{p.name}</b>
                    <span class="mj-pastile">
                      {p.active === false && <Pill>inactiv</Pill>}
                      {cuContracte && (st ? <Pill fel={st[1]}>contract: {st[0]}</Pill> : <Pill fel="warn">fără contract</Pill>)}
                    </span>
                    <span class="ctr-row-s">{sub}</span>
                  </div>
                </div>
                <div class="ctr-btns">
                  {cuContracte && !c && onFaContract && (
                    <button class="ctr-btn pri" onClick={() => onFaContract(Number(p.id))}><Icon name="fileSignature" size={15} /> Fă contract</button>
                  )}
                  <button class="ctr-btn" onClick={() => deschideFisa(p)}><Icon name="edit" size={15} /> Modifică</button>
                  <button class="ctr-btn danger" onClick={() => setDel(p)}><Icon name="trash" size={15} /> Șterge</button>
                </div>
              </div>
            );
          })}
          <button class="ctr-btn" style="align-self:flex-start" onClick={() => deschideFisa(null)}><Icon name="plus" size={16} /> Partener nou</button>
        </div>
      )}

      {edit && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="wrench" size={18} color="var(--ctr-ok)" /> {edit.id ? 'Partener de montaj' : 'Partener nou'}</b>
              <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>CUI / CIF</label>
                  <div style="display:flex;gap:8px">
                    <input style="flex:1;min-width:0" value={edit.cui} placeholder="RO12345678" onInput={(e: any) => sf('cui', e.target.value)} />
                    <button class="ctr-btn" disabled={!!(anaf && anaf.cauta)} onClick={cautaAnaf}><Icon name="download" size={15} /> ANAF</button>
                  </div>
                  {anaf && (anaf.cauta ? <div class="ctr-hint">Caut la ANAF…</div>
                    : anaf.eroare ? <div class="ctr-msg">{anaf.eroare}</div>
                    : <>
                      <div class="ctr-msg ok"><Icon name="check" size={13} /> Preluat de la ANAF</div>
                      {(anaf.radiata || anaf.inactiva) && <div class="ctr-msg" style="font-weight:700">⚠ {anaf.radiata ? 'firma apare RADIATĂ la ANAF' : 'firma e declarată INACTIVĂ'}</div>}
                    </>)}
                </div>
                {camp('Firma care montează', 'name', 'ex. Instal GPS Vest SRL')}
                {camp('Nr. Reg. Com.', 'reg_com', 'J35/1234/2020')}
                {camp('Sediu', 'address', 'Str. …, oraș, județ')}
                {camp('Reprezentant legal', 'rep', 'nume și prenume')}
                {camp('Funcția', 'reprole', 'Administrator')}
                {camp('Email (aici pleacă contractul)', 'email', 'office@firma.ro', 'email')}
                {camp('Telefon', 'phone', '07xx xxx xxx', 'tel')}
                {camp('IBAN', 'iban', 'RO…')}
                {camp('Banca', 'bank', '')}
                {camp('Zona în care lucrează', 'zona', 'ex. Timiș, Arad, Hunedoara')}
                {camp('Persoana de contact', 'contact', 'nume · telefon')}
                {/* „Inactiv" e capătul unui partener cu istoric: cel cu contract semnat nu se șterge (hârtia rămâne în dosar). */}
                <div class="fld"><label>Stare</label>
                  <select value={edit.activ} onChange={(e: any) => sf('activ', e.target.value)}>
                    <option value="1">activ</option>
                    <option value="0">inactiv — nu mai lucrăm cu el</option>
                  </select>
                </div>
                {/* Ritmul lui (Alin, 30.09): montajul făcut de el îl facturăm clientului în același ritm, „ca să nu fim pe pierdere". */}
                <div class="fld"><label>Ne facturează</label>
                  <select value={edit.ritm} onChange={(e: any) => sf('ritm', e.target.value)}>
                    <option value="lunar">lunar</option>
                    <option value="saptamanal">săptămânal</option>
                  </select>
                  <div class="mj-nota">{NOTA_RITM}</div>
                </div>
                <div class="ctr-h2" style="margin-top:4px">Cât ne cere, pe lucrare (lei, fără TVA)</div>
                <div class="ctr-mont">
                  {MONTAJ_TIPURI.map(([k, et, um]) => (
                    <div class="ctr-mont-r ctr-mont-1">
                      <span class="t" style="margin:0">{et} <em>({um})</em></span>
                      <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="lei" value={edit.tarife[k]}
                        onInput={(e: any) => { const v = e.target.value; setMsg(''); setEdit((p) => (p ? { ...p, tarife: { ...p.tarife, [k]: v } } : p)); }} />
                    </div>
                  ))}
                </div>
                {msg && <div class="ctr-msg">{msg}</div>}
                <div class="frm-actions">
                  <button class="btn fl-btn2" disabled={busy} onClick={inchideFoaia}>Renunț</button>
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează partenerul'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && (
        <Confirma title="Șterge partenerul" danger busy={busy} okLabel="Șterge"
          text={'Ștergi partenerul? Lucrările deja salvate rămân, dar fără numele lui, iar contractele lui nesemnate se șterg și ele.\n\nUn partener cu contract semnat nu se șterge — hârtia rămâne în dosar. Pe el îl treci pe „inactiv", din fișa lui.'}
          onOk={sterge} onCancel={() => { if (!busy) setDel(null); }} />
      )}
    </>
  );
}
