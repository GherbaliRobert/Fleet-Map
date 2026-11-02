// „Cereri de la clienți" pe telefon (02.11) — lista NOASTRĂ, ca pe web (Business › „Cereri de la clienți", blocul cu același nume): ce a
// trimis clientul, cine e și cum îl găsim, ce s-a întâmplat (scris de aplicație), datele aparatului (doar pentru noi), „Pare rezolvată
// singură", programarea și ce i-am scris. Toate textele și butoanele le dă serverul (cereri_echipa.pentruNoi), după stare; aici doar se
// pun, ca TEXT. Fiecare trecere se face o dată: a doua apăsare (a celuilalt fondator) primește refuzul serverului („Cererea a fost deja
// preluată (…)") și lista se reîncarcă.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import {
  EROARE_LISTA, NU_S_A_PUTUT, TEXT_APARAT, TEXT_DUPA, TEXT_FORM, TEXT_I_AM_SCRIS, TEXT_MESAJ_TRIMIS, TEXT_PROGRAMATA, TITLU_CERERI,
  cateCereri, cerereDinAdresa, corpProgramare, corpRezolvat, fileCereri, formProgramare, golCereri, intrebareRedeschide, planCerere,
  telHref, type FormProgramare,
} from '../lib/cereriEchipa';
import { adresaFirmei } from '../components/FondatorUi';
import './admin.css';
import './flota.css';
import './contracte.css';
import './echipa.css';

type FormCerere = { fel: 'programez' | 'rezolvat'; p: FormProgramare; r: string };

export function CereriClienti() {
  const loc = useLocation();
  const dinAdresa = cerereDinAdresa(loc.query);
  const [fel, setFel] = useState(dinAdresa.fel);
  const [d, setD] = useState<any>(null);
  const [eroare, setEroare] = useState('');
  const [forms, setForms] = useState<Record<number, FormCerere | null>>({});
  const [busy, setBusy] = useState(false);
  const [intreb, setIntreb] = useState<number | null>(null);
  const [arat, setArat] = useState<number | null>(null);
  const spre = useRef<number | null>(dinAdresa.spre);
  const inapoi = () => { if (history.length > 1) history.back(); else loc.route('/meniu'); };

  useInapoiInchide(intreb != null, () => { if (!busy) setIntreb(null); return true; });

  async function incarca(f?: string) {
    try { setD(await Api.cereriClienti(f || fel)); setEroare(''); }
    catch (e: any) { setEroare(EROARE_LISTA); }
  }
  useEffect(() => { setForms({}); incarca(fel); }, [fel]);
  // Venit din calendar: cererea intervenției, la vedere.
  useEffect(() => {
    if (!d || spre.current == null) return;
    const id = spre.current;
    spre.current = null;
    const el = document.getElementById('cer-' + id);
    if (el) { setArat(id); el.scrollIntoView({ block: 'center' }); }
  }, [d]);

  const inchideForm = (id: number) => setForms((x) => ({ ...x, [id]: null }));
  function deschideForm(id: number, ce: 'programez' | 'rezolvat') {
    setForms((x) => ({ ...x, [id]: x[id] && x[id]!.fel === ce ? null : { fel: ce, p: formProgramare(d), r: '' } }));
  }
  const schimba = (id: number, z: Partial<FormCerere>) => setForms((x) => ({ ...x, [id]: x[id] ? { ...x[id]!, ...z } : null }));

  async function trimite(ce: string, id: number) {
    if (busy) return;
    setBusy(true);
    try {
      const form = forms[id];
      if (ce === 'preiau') await Api.cererePreiau(id);
      else if (ce === 'redeschide') await Api.cerereRedeschide(id);
      else if (ce === 'programeaza' && form) await Api.cereriProgrameaza(id, corpProgramare(form.p));
      else if (ce === 'rezolva' && form) await Api.cerereRezolvat(id, corpRezolvat(form.r));
      else return;
      showToast(TEXT_DUPA[ce]);
      inchideForm(id);
      setIntreb(null);
      await incarca();
    } catch (e: any) {
      showToast((e && e.message) || NU_S_A_PUTUT, true);
      setIntreb(null);
      if (e && e.status === 409) { inchideForm(id); await incarca(); }
    } finally { setBusy(false); }
  }
  function apasa(k: string, id: number) {
    if (k === 'programez' || k === 'rezolvat') deschideForm(id, k);
    else if (k === 'redeschide') setIntreb(id);
    else trimite(k, id);
  }

  const cereri: any[] = (d && d.cereri) || [];
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={inapoi} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{TITLU_CERERI}</div>
      </header>
      <div class="content">
        <div class="cer-pag">
          {eroare ? <div class="ce-err">{eroare}</div> : null}
          {!d && !eroare ? <div class="ce-gri">Se încarcă…</div> : null}
          {d ? (
            <>
              <div class="cer-head">
                {fileCereri(d).map((t) => <button type="button" class={'ctr-btn' + (fel === t.k ? ' pri' : '')} onClick={() => setFel(t.k)}>{t.t}</button>)}
              </div>
              <div class="cer-cate">{cateCereri(d)}</div>
              {!cereri.length ? <div class="ce-gri">{golCereri(fel)}</div> : null}
              {cereri.map((c) => (
                <Cerere key={c.id} c={c} d={d} form={forms[c.id] || null} arat={arat === c.id} busy={busy} onApasa={apasa}
                  onFirma={(id) => loc.route(adresaFirmei(id))} onSchimba={schimba} onInchide={inchideForm} onTrimite={trimite} />
              ))}
            </>
          ) : null}
        </div>
      </div>
      {intreb != null ? (
        <Confirma title="Redeschide" text={intrebareRedeschide(intreb)} okLabel="Redeschide" busy={busy}
          onOk={() => trimite('redeschide', intreb)} onCancel={() => setIntreb(null)} />
      ) : null}
    </div>
  );
}

export function Cerere({ c, d, form, arat, busy, onApasa, onFirma, onSchimba, onInchide, onTrimite }: {
  c: any; d: any; form: FormCerere | null; arat: boolean; busy: boolean;
  onApasa: (k: string, id: number) => void; onFirma: (id: number) => void;
  onSchimba: (id: number, z: Partial<FormCerere>) => void; onInchide: (id: number) => void; onTrimite: (ce: string, id: number) => void;
}) {
  const p = planCerere(c);
  const meta: any[] = [];
  if (p.cine) meta.push(p.cine);
  if (p.telefon) meta.push(<a href={telHref(p.telefon)}>{p.telefon}</a>);
  if (p.email) meta.push(<a href={'mailto:' + p.email}>{p.email}</a>);
  if (p.cand) meta.push(p.cand);
  if (p.sursa) meta.push(p.sursa);
  return (
    <div id={'cer-' + p.id} class={'cer-item ' + p.tag.cls + (arat ? ' cer-arat' : '')}>
      <div class="cer-cap">
        <b>{p.cap}</b>{p.vehicul ? <> · <span class="cer-veh">{p.vehicul}</span></> : null}
        <span class={'cer-tag ' + p.tag.cls}>{p.tag.text}</span>
      </div>
      {meta.length ? <div class="cer-meta">{meta.map((x, i) => <>{i ? ' · ' : ''}{x}</>)}</div> : null}
      <div class="cer-tit">{p.titlu}</div>
      {p.msg.length ? <div class="cer-msg">{p.msg.map((x) => <div><b>{x.l}</b> {x.t}</div>)}</div> : null}
      {p.pareRezolvata ? <div class="cer-auto"><Icon name="circleCheck" size={14} /> {p.pareRezolvata}</div> : null}
      {p.aparat.length ? (
        <div class="cer-tech">
          <span class="t">{TEXT_APARAT}</span>
          {p.aparat.map((a) => <span>{a.l} <b>{a.v}</b></span>)}
        </div>
      ) : null}
      {p.programare ? (
        <div class="cer-prog-txt">
          <Icon name="calendar" size={14} /> <b>{TEXT_PROGRAMATA}</b> {p.programare}
          {p.programareMesaj ? <div class="cer-sub">{TEXT_MESAJ_TRIMIS}„{p.programareMesaj}”</div> : null}
        </div>
      ) : null}
      {p.raspuns ? <div class="cer-msg"><b>{TEXT_I_AM_SCRIS}</b> „{p.raspuns}”</div> : null}

      {form && form.fel === 'programez' ? (
        <div class="cer-form">
          <div class="ce-l">{TEXT_FORM.programez}</div>
          <input type="date" class="ce-in" aria-label="Ziua" min={d.azi || ''} value={form.p.zi} onInput={(e) => onSchimba(p.id, { p: { ...form.p, zi: (e.target as HTMLInputElement).value } })} />
          <select class="ce-in" aria-label="Intervalul orar" value={form.p.interval} onChange={(e) => onSchimba(p.id, { p: { ...form.p, interval: (e.target as HTMLSelectElement).value } })}>
            {(d.intervale || []).map((x: any) => <option value={x.k}>{x.t}</option>)}
          </select>
          <select class="ce-in" aria-label="Instalatorul" value={form.p.partener} onChange={(e) => onSchimba(p.id, { p: { ...form.p, partener: (e.target as HTMLSelectElement).value } })}>
            <option value="">{TEXT_FORM.faraInstalator}</option>
            {(d.parteneri || []).map((x: any) => <option value={String(x.id)}>{x.name + TEXT_FORM.instalator}</option>)}
          </select>
          <div class="ce-l">{TEXT_FORM.mesaj}</div>
          <textarea class="ce-in ce-ta2" rows={2} maxLength={300} placeholder={TEXT_FORM.mesajGol} value={form.p.mesaj} onInput={(e) => onSchimba(p.id, { p: { ...form.p, mesaj: (e.target as HTMLTextAreaElement).value } })} />
          <label class="cer-ck"><input type="checkbox" checked={form.p.inCalendar} onChange={(e) => onSchimba(p.id, { p: { ...form.p, inCalendar: (e.target as HTMLInputElement).checked } })} /> {TEXT_FORM.inCalendar}</label>
          <div class="cer-acts">
            <button type="button" class="ctr-btn" disabled={busy} onClick={() => onInchide(p.id)}>{TEXT_FORM.renunta}</button>
            <button type="button" class="ctr-btn pri" disabled={busy} onClick={() => onTrimite('programeaza', p.id)}><Icon name="navigate" size={15} /> {TEXT_FORM.programeaza}</button>
          </div>
        </div>
      ) : null}
      {form && form.fel === 'rezolvat' ? (
        <div class="cer-form">
          <div class="ce-l">{TEXT_FORM.ceAmFacut}</div>
          <textarea class="ce-in ce-ta" rows={3} maxLength={1000} placeholder={TEXT_FORM.raspunsGol} value={form.r} onInput={(e) => onSchimba(p.id, { r: (e.target as HTMLTextAreaElement).value })} />
          <div class="cer-acts">
            <button type="button" class="ctr-btn" disabled={busy} onClick={() => onInchide(p.id)}>{TEXT_FORM.renunta}</button>
            <button type="button" class="ctr-btn pri" disabled={busy} onClick={() => onTrimite('rezolva', p.id)}><Icon name="check" size={15} /> {TEXT_FORM.rezolva}</button>
          </div>
        </div>
      ) : null}

      <div class="cer-acts">
        {p.butoane.map((b) => <button type="button" class={'ctr-btn' + (b.prim ? ' pri' : '')} disabled={busy} onClick={() => onApasa(b.k, p.id)}><Icon name={b.ic as IconName} size={15} /> {b.t}</button>)}
        {p.suna ? <a class="ctr-btn" href={p.suna}><Icon name="phone" size={15} /> Sună</a> : null}
        {p.firma != null ? <button type="button" class="ctr-btn" onClick={() => onFirma(p.firma as number)}><Icon name="building" size={15} /> Deschide firma</button> : null}
      </div>
    </div>
  );
}
