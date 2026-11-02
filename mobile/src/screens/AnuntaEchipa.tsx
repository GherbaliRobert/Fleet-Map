// „Anunță echipa RA Track" pe telefon (02.11) — fereastra de pe web (blocul cu același nume, #ce-ov): „Cerere nouă" / „Cererile tale",
// confirmarea cu pașii. Pe telefon e un ecran întreg, cu adresa lui, ca „înapoi" să ducă de unde ai venit și ca un anunț să aibă unde
// să ducă. O singură cerere (POST /api/cereri-echipa); termenul, ce se trimite, pașii și „Cererile tale" vin de la server și se pun ca
// TEXT. Trei uși, ca pe web: butonul din casetele RA Insight, fișa mașinii și meniul. Fondatorii n-au ușă: dacă ajung totuși aici (un
// anunț vechi), serverul le spune `platforma` și fereastra îi duce la lista lor.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { vehicles } from '../app/store';
import { Icon } from '../components/Icon';
import {
  BUTON_PLATFORMA, EROARE_FEREASTRA, OPTIUNE_FARA_MASINA, RUTA_CERERI_CLIENTI, TEXT_PLATFORMA, TITLU_FEREASTRA,
  corpCerere, dinAdresa, dupaMasina, dupaTrimitere, fileFereastra, masinaDin, notaFormular, optiuniMasini, planLista, planTrimisa,
} from '../lib/cereriEchipa';
import './admin.css';
import './flota.css';
import './echipa.css';

type Form = { masina: string; mesaj: string; cand: string[]; unde: string; tel: string | null };
const FORM_GOL: Form = { masina: '', mesaj: '', cand: [], unde: '', tel: null };
const FARA_USA = { imei: '', problema: '', ce: '', sursa: 'telefon', fila: 'noua' };

export function AnuntaEchipa() {
  const loc = useLocation();
  const inapoi = () => { if (history.length > 1) history.back(); else loc.route('/meniu'); };
  // O adresă nouă (un anunț, cu fereastra deschisă) = fereastră nouă.
  return <Fereastra key={loc.url} q={loc.query} inapoi={inapoi} laLista={() => loc.route(RUTA_CERERI_CLIENTI)} />;
}

function Camp({ l, sub, children }: { l: string; sub?: string; children: any }) {
  return (
    <div class="ce-camp">
      <div class="ce-l">{l}{sub ? <span class="ce-l2"> · {sub}</span> : null}</div>
      {children}
    </div>
  );
}

// „Cerere nouă": mașina, ce a scris aplicația, mesajul, când poate veni cineva, cum îl găsim, ce se trimite.
export function FormularCerere({ m, o, f, lista, err, pune }: { m: any; o: any; f: Form; lista: any[]; err: string; pune: (x: Partial<Form>) => void }) {
  const imeiAles = o.imei;
  const dm = dupaMasina(m, !imeiAles && !f.masina);
  const ms = imeiAles ? masinaDin(imeiAles, lista) : null;
  const k = m.contact || {};
  const nota = notaFormular(m);
  return (
    <div class="ce-b">
      {ms ? <Camp l="Mașina"><div class="ce-ro"><b>{ms.nr}</b>{ms.nume ? ' · ' + ms.nume : ''}</div></Camp> : (
        <Camp l="Mașina" sub="dacă e despre o mașină">
          <select class="ce-in" aria-label="Mașina" value={f.masina} onChange={(e) => pune({ masina: (e.target as HTMLSelectElement).value })}>
            <option value="">{OPTIUNE_FARA_MASINA}</option>
            {optiuniMasini(lista).map((x) => <option value={x.v}>{x.t}</option>)}
          </select>
        </Camp>
      )}
      {o.ce ? <Camp l="Ce s-a întâmplat" sub="scris de aplicație"><div class="ce-ro">{o.ce}</div></Camp> : null}
      <Camp l={dm.mesaj} sub={dm.mesajSub}>
        <textarea class="ce-in ce-ta" rows={3} maxLength={2000} value={f.mesaj} onInput={(e) => pune({ mesaj: (e.target as HTMLTextAreaElement).value })} />
      </Camp>
      {dm.arataCand ? (
        <Camp l="Când poate veni cineva la mașină" sub="dacă e nevoie">
          <div class="ce-chips">
            {(m.cand || []).map((c: any) => {
              const on = f.cand.indexOf(c.k) >= 0;
              return <button type="button" class={'ce-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => pune({ cand: on ? f.cand.filter((x) => x !== c.k) : f.cand.concat(c.k) })}>{c.t}</button>;
            })}
          </div>
          <div class="ce-r2">
            <span class="ce-l3">Unde stă de obicei</span>
            <input class="ce-in" maxLength={200} value={f.unde} onInput={(e) => pune({ unde: (e.target as HTMLInputElement).value })} />
          </div>
        </Camp>
      ) : null}
      <Camp l="Te sunăm sau îți scriem la">
        <div class="ce-r2 ce-r0">
          <b>{k.nume || ''}</b>
          <input class="ce-in ce-tel" type="tel" maxLength={40} placeholder="telefon" value={f.tel == null ? String(k.telefon || '') : f.tel} onInput={(e) => pune({ tel: (e.target as HTMLInputElement).value })} />
          {k.email ? <span class="ce-gri ce-email">{k.email}</span> : null}
        </div>
      </Camp>
      <div class="ce-det"><Icon name="circleInfo" size={15} /><span>{dm.date}</span></div>
      {err ? <div class="ce-err">{err}</div> : null}
      {nota ? <div class="ce-nota">{nota}</div> : null}
    </div>
  );
}

// După trimitere (200, sau 409 „se ocupă deja"): ce s-a întâmplat, pașii, unde o găsește.
export function ConfirmareCerere({ m, j }: { m: any; j: any }) {
  const p = planTrimisa(m, j);
  return (
    <div class="ce-b">
      <div class="ce-trimis">
        <Icon name={p.deja ? 'headset' : 'circleCheck'} size={22} />
        <div><b>{p.titlu}</b><div class="ce-gri">{p.sub}</div></div>
      </div>
      <div class="ce-tl">
        {p.pasi.map((x: any) => (
          <div class={'ce-tl-r' + (x.gata ? ' gata' : '') + (x.sarit ? ' sarit' : '')}>
            <span class="ce-tl-d">{x.gata ? <Icon name="check" size={12} /> : null}</span>
            <div><div class="ce-tl-t">{x.eticheta}</div><div class="ce-tl-s">{x.detaliu || ''}</div></div>
          </div>
        ))}
      </div>
      {p.nota ? <div class="ce-det">{p.nota}</div> : null}
    </div>
  );
}

// „Cererile tale".
export function ListaCererilor({ m }: { m: any }) {
  const p = planLista(m);
  return (
    <div class="ce-b">
      {p.gol ? <div class="ce-gri">{p.gol}</div> : null}
      {p.randuri.map((c: any) => (
        <div class="ce-cr" key={c.id}>
          <div class="ce-cr-h"><b>{c.cap}</b><span class={'ce-st ' + c.stare}>{c.eticheta}</span></div>
          <div>{c.titlu}</div>
          <div class="ce-gri">{c.detaliu}</div>
          {c.deAltcineva ? <div class="ce-gri">{c.deAltcineva}</div> : null}
        </div>
      ))}
      {p.nota ? <div class="ce-nota">{p.nota}</div> : null}
    </div>
  );
}

function Fereastra({ q, inapoi, laLista }: { q: any; inapoi: () => void; laLista: () => void }) {
  const [o, setO] = useState<any>(() => dinAdresa(q));
  const [fila, setFila] = useState(o.fila);
  const [m, setM] = useState<any>(null);
  const [trimisa, setTrimisa] = useState<any>(null);
  const [f, setF] = useState<Form>(FORM_GOL);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const rad = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viu = true;
    Api.cereriEchipa()
      .then((j) => { if (viu) setM(j); })
      .catch((e: any) => { if (viu) setM({ eroare: (e && e.data && e.data.error) || EROARE_FEREASTRA }); });
    return () => { viu = false; };
  }, []);
  // Tastatura: butoanele de jos rămân deasupra ei (ca la caseta din RA Insight).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const pune = () => { if (rad.current) rad.current.style.setProperty('--ce-kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px'); };
    vv.addEventListener('resize', pune);
    return () => vv.removeEventListener('resize', pune);
  }, []);

  async function trimite() {
    if (busy) return;
    setBusy(true);
    let status: any = 200, j: any = {};
    try {
      j = await Api.trimiteCerere(corpCerere(o, { imei: o.imei || f.masina, mesaj: f.mesaj, cand: f.cand, unde: f.unde, telefon: f.tel == null ? String(((m && m.contact) || {}).telefon || '') : f.tel }));
    } catch (e: any) { status = e && e.status; j = (e && e.data) || {}; }
    setBusy(false);
    const r = dupaTrimitere(status, j);
    if (!r.trimisa) { setErr(r.eroare); return; }
    setErr('');
    setTrimisa(j);
    setF(FORM_GOL);
    if (status === 200 && j.cerere) setM((x: any) => ({ ...x, cereri: [j.cerere].concat((x && x.cereri) || []) }));
  }

  let corp: any, jos: any = null;
  if (!m) corp = <div class="ce-b"><div class="ce-gri">Se încarcă…</div></div>;
  else if (m.eroare) {
    corp = <div class="ce-b"><div class="ce-err">{m.eroare}</div></div>;
    jos = <button type="button" class="btn fl-btn2" onClick={inapoi}>Închide</button>;
  } else if (m.platforma) {
    corp = <div class="ce-b"><div class="ce-det">{TEXT_PLATFORMA}</div></div>;
    jos = <button type="button" class="btn btn-primary" onClick={laLista}><Icon name="headset" size={16} /> {BUTON_PLATFORMA}</button>;
  } else if (fila === 'lista') {
    corp = <ListaCererilor m={m} />;
    jos = <button type="button" class="btn btn-primary" onClick={() => { setFila('noua'); setTrimisa(null); setErr(''); setF(FORM_GOL); setO(FARA_USA); }}><Icon name="plus" size={16} /> Cerere nouă</button>;
  } else if (trimisa) {
    corp = <ConfirmareCerere m={m} j={trimisa} />;
    jos = <button type="button" class="btn btn-primary" onClick={inapoi}><Icon name="check" size={16} /> Închide</button>;
  } else {
    corp = <FormularCerere m={m} o={o} f={f} lista={vehicles.value} err={err} pune={(x) => setF((p) => ({ ...p, ...x }))} />;
    jos = (
      <>
        <button type="button" class="btn fl-btn2" onClick={inapoi}>Renunță</button>
        <button type="button" class="btn btn-primary" disabled={busy} onClick={trimite}><Icon name="navigate" size={16} /> Trimite echipei</button>
      </>
    );
  }

  return (
    <div class="screen ce-ecran" ref={rad}>
      <header class="app-header">
        <button class="h-btn" onClick={inapoi} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{TITLU_FEREASTRA}</div>
      </header>
      {m && !m.eroare && !m.platforma ? (
        <div class="ce-tabs">
          {fileFereastra(m).map((t) => (
            <button type="button" class={'ce-tab' + (fila === t.k ? ' on' : '')} onClick={() => { setFila(t.k); if (t.k === 'noua') setTrimisa(null); }}>{t.t}</button>
          ))}
        </div>
      ) : null}
      {corp}
      {jos ? <div class="ce-f">{jos}</div> : null}
    </div>
  );
}
