import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from './Icon';
import { Gros } from './InsightText';
import { campuriStart, iconaFa, nivelDovada, rutaButon, textCeas } from '../lib/insight';

// Cartonașul „RA Insight face, cu Da-ul tău" (web: cartonasPropunere). Tot ce scrie vine de la server (soferi_masini.js,
// propuneri.js, programari.js): ce se schimbă, de ce, ce nu se schimbă, textele de după. Aici se desenează și se trimit apăsările:
// Da / Schimbă / Nu, „Anulează". Nimic nu se schimbă fără un buton apăsat. Ceasul lui „Anulează" pornește de la ce spune serverul
// (`ramasMs`), nu de la ceasul telefonului.

export function ButonProp({ text, ic, prim, disabled, onClick }: { text: string; ic: IconName; prim?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" class={'chat-pas' + (prim ? ' chat-prop-da' : '')} disabled={disabled} onClick={onClick}><Icon name={ic} size={14} />{text}</button>;
}

// „Anulează · mai ai 9:58", numărat pe ecran; la capăt butonul pleacă (serverul refuză oricum după cele 10 minute).
export function CeasAnulare({ ramasMs, disabled, onClick }: { ramasMs: number; disabled: boolean; onClick: () => void }) {
  const capat = useRef(Date.now() + Math.max(0, Number(ramasMs) || 0));
  const [ramas, setRamas] = useState(capat.current - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const r = capat.current - Date.now();
      setRamas(r);
      if (r <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  if (ramas <= 0) return null;
  return <ButonProp text={textCeas(ramas)} ic="undo" disabled={disabled} onClick={onClick} />;
}

function Lista({ opt, val, eticheta, onSchimba }: { opt: any[]; val: string; eticheta: string; onSchimba: (v: string) => void }) {
  return (
    <select class="chat-prop-sel" aria-label={eticheta} value={val} onChange={(e) => onSchimba((e.target as HTMLSelectElement).value)}>
      {(opt || []).map((o: any) => {
        const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
        return <option value={String(v)}>{t}</option>;
      })}
    </select>
  );
}

export function CartonasPropunere({ p, onGata, laButon }: { p: any; onGata: (nou: any, urmator: any) => void; laButon: (b: any, p?: any) => void }) {
  const deschis = p.stare === 'propusa';
  const so = p.sofer || {};
  const k = p.campuri || {};
  const [busy, setBusy] = useState(false);
  // „Schimbă" (alerta, discuția, revizia, actul, raportul): casetele în locul rândurilor; `ed` = ce e scris în ele.
  const [ed, setEd] = useState<Record<string, string> | null>(null);
  const numeAtins = useRef(false);
  const [dovezi, setDovezi] = useState<any[] | null>(null);
  const [dovVechi, setDovVechi] = useState(false);
  const tDov = useRef<any>(null);
  // „Schimbă" pe șofer: alt șofer liber care poate conduce mașina (lista o dă serverul, pe cartonaș).
  const [alegeSofer, setAlegeSofer] = useState(false);
  const [ales, setAles] = useState<{ id: any; nume: any }>({ id: p.la, nume: so.la });
  useEffect(() => () => clearTimeout(tDov.current), []);

  const ic = iconaFa(p.ic, so.la ? 'idCard' : 'user') as IconName;
  const icStare = (p.stare === 'aplicata' ? 'check' : (p.stare === 'anulata' ? 'undo' : 'circleInfo')) as IconName;

  async function da() {
    setBusy(true);
    const corp = p.randuri ? (ed ? { campuri: ed } : {}) : (ales.id != null && String(ales.id) !== String(p.la) ? { la: ales.id } : {});
    try {
      const r = await Api.insightActiune(p.id, 'aplica', corp);
      onGata(r.propunere, r.urmator);
    } catch (e: any) {
      showToast((e && e.message) || 'Nu s-a putut face.', true);
      if (e && e.data && e.data.propunere) onGata(e.data.propunere, null); else setBusy(false);
    }
  }
  async function nu() {
    setBusy(true);
    try {
      const r = await Api.insightActiune(p.id, 'refuza');
      onGata(r.propunere, null);
    } catch (e: any) {
      showToast((e && e.message) || 'Nu s-a putut.', true);
      if (e && e.data && e.data.propunere) onGata(e.data.propunere, null); else setBusy(false);
    }
  }
  async function anuleaza() {
    setBusy(true);
    try {
      const r = await Api.insightActiune(p.id, 'anuleaza');
      showToast(r.text || 'Am anulat.');
      onGata(r.propunere, null);
    } catch (e: any) {
      showToast((e && e.message) || 'Nu s-a putut anula.', true);
      setBusy(false);
    }
  }
  function puneCamp(c: string, v: string) { setEd((f) => Object.assign({}, f, { [c]: v })); }
  // „Din ultimele 30 de zile" se socotește din nou (pe server, cu regula motorului) pentru pragul și mașina alese. Numele pus de
  // aplicație îl scrie serverul din nou, după pragul și mașina alese — cât omul nu l-a scris el.
  function refaceAlerta(prag: string, imei: string) {
    if (!numeAtins.current) puneCamp('nume', '');
    if (!(p.dovezi || []).length) return;
    setDovVechi(true);
    clearTimeout(tDov.current);
    tDov.current = setTimeout(async () => {
      try {
        const r = await Api.insightActiune(p.id, 'dovezi', { prag, imei });
        if (Array.isArray(r.dovezi)) { setDovezi(r.dovezi); setDovVechi(false); }
      } catch { /* rămân cifrele de dinainte, palide */ }
    }, 450);
  }
  function lasa() { setEd(null); setDovezi(null); setDovVechi(false); numeAtins.current = false; clearTimeout(tDov.current); }

  const caseta = (c: string, cls: string, tip: string, eticheta: string, extra?: Record<string, any>, laScris?: (v: string) => void) => (
    <input class={'chat-prop-in ' + cls} type={tip} value={ed ? ed[c] : ''} aria-label={eticheta} {...(extra || {})}
      onInput={(e) => { const v = (e.target as HTMLInputElement).value; puneCamp(c, v); if (laScris) laScris(v); }} />
  );
  const rand = (l: any, nod: any) => <><span class="l">{l}</span><span>{nod}</span></>;
  const randAcum = () => (p.randuri || []).filter((r: any) => r.l === 'Acum').map((r: any) => rand(r.l, r.v || ''));

  function randuriEditate() {
    if (!ed) return null;
    if (p.fel === 'alerta') {
      const r0 = (p.randuri || [])[0] || {};
      return <>
        {rand(r0.l, <b>{r0.v || ''}</b>)}
        {rand('Peste', <span class="chat-prop-cu">{caseta('prag', 'mic', 'number', 'Pragul, în km/h', { min: k.min, max: k.max, step: '1' }, (v) => refaceAlerta(v, ed.imei))} km/h</span>)}
        {rand('Pe', <Lista opt={k.optiuni} val={ed.imei} eticheta="Mașina" onSchimba={(v) => { puneCamp('imei', v); refaceAlerta(ed.prag, v); }} />)}
        {rand('Numele alertei', caseta('nume', 'lung', 'text', 'Numele alertei', { maxLength: 120, placeholder: numeAtins.current ? undefined : 'Îl scriu eu, după prag și mașină' }, () => { numeAtins.current = true; }))}
      </>;
    }
    if (p.fel === 'revizie') {
      return <>
        {rand('Lucrarea', <Lista opt={k.tipuri} val={ed.tip} eticheta="Lucrarea" onSchimba={(v) => puneCamp('tip', v)} />)}
        {rand('Termen', <span class="chat-prop-cu">la {caseta('km', 'mic', 'number', 'Kilometrii termenului', { min: k.kmMin, max: k.kmMax, step: '1', placeholder: 'km' })} km sau pe {caseta('data', 'data', 'date', 'Data termenului')}</span>)}
        {randAcum()}
      </>;
    }
    if (p.fel === 'act') {
      return <>
        {rand('Actul', <Lista opt={k.tipuri} val={ed.tip} eticheta="Actul" onSchimba={(v) => puneCamp('tip', v)} />)}
        {rand('Valabil până pe', caseta('data', 'data', 'date', 'Valabil până pe'))}
        {randAcum()}
      </>;
    }
    if (p.fel === 'raport') {
      return <>
        {rand('Raportul', <b>{k.label || ''}</b>)}
        {rand('Pe', <Lista opt={k.optiuni} val={ed.imei} eticheta="Mașina" onSchimba={(v) => puneCamp('imei', v)} />)}
        {rand('Perioada', <Lista opt={k.perioade} val={ed.perioada} eticheta="Perioada raportului" onSchimba={(v) => puneCamp('perioada', v)} />)}
        {rand('Cât de des', <Lista opt={k.frecvente} val={ed.frecventa} eticheta="Cât de des" onSchimba={(v) => puneCamp('frecventa', v)} />)}
        {rand('La ora', <span class="chat-prop-cu">{caseta('ora', 'mic', 'number', 'Ora trimiterii', { min: '0', max: '23', step: '1' })}:00</span>)}
        {rand('Cui', caseta('dest', 'lung', 'text', 'Adresele de email, despărțite prin virgulă', { placeholder: k.email ? 'gol = ' + k.email : 'adresa de email' }))}
        {rand('Format', <Lista opt={k.formate} val={ed.format} eticheta="Formatul" onSchimba={(v) => puneCamp('format', v)} />)}
      </>;
    }
    return <>{(p.randuri || []).map((r: any) => (r.l !== 'Despre'
      ? rand(r.l, r.b ? <b>{r.v || ''}</b> : (r.v || ''))
      : rand('Despre', caseta('nota', 'lung', 'text', 'Despre ce ați vorbit', { maxLength: k.max || 300, placeholder: 'nu e obligatoriu' }))))}</>;
  }
  function randuriCitite() {
    if (p.randuri) return <>{p.randuri.map((r: any) => rand(r.l, r.b ? <b>{r.v || ''}</b> : (r.v || '')))}</>;
    return <>
      {deschis && p.masina ? rand('Mașina', <><b>{p.masina.nr || ''}</b>{p.masina.rest ? ' · ' + p.masina.rest : ''}</>) : null}
      {rand('Șoferul', <>
        {so.de ? <><span class="de">{so.de}</span><span class="sag">→</span></> : null}
        <span class={'la' + (so.la ? '' : ' gol')}>{so.la || 'fără șofer'}</span>
      </>)}
      {deschis ? rand('De când', p.deCand || '') : null}
    </>;
  }

  const dov = dovezi || p.dovezi || [];
  const textDa = !p.randuri && ales.id != null && String(ales.id) !== String(p.la) ? 'Da, trece-l pe ' + ales.nume : (p.butonDa || 'Da');
  const bGata = p.gata ? (p.gata.buton || { fel: 'fisa', imei: p.imei }) : null;
  const icGata = (p.gata && p.gata.buton ? iconaFa(p.gata.buton.ic, p.gata.buton.fel === 'ramura' ? 'shield' : 'bell') : 'truck') as IconName;

  return (
    <div class="chat-prop-w">
      <div class={'chat-prop' + (deschis ? '' : ' inchis')}>
        <div class="chat-prop-h">
          <span class="ic"><Icon name={ic} size={14} /></span>
          <span class="chat-prop-tit">{p.titlu || ''}</span>
          {p.apasat ? <span class={'chat-prop-st ' + (p.stare || '')}><Icon name={icStare} size={13} />{p.apasat}</span> : null}
        </div>
        <div class="chat-prop-sch">{ed ? randuriEditate() : randuriCitite()}</div>
        {deschis && dov.length ? (
          <div class={'chat-prop-dov' + (dovVechi ? ' vechi' : '')}>
            <div class="t">{p.dovT || 'De ce'}</div>
            {dov.map((d: any) => {
              const n = nivelDovada(d.nivel);
              return <div class={n}><Icon name={(n === 'ok' ? 'circleCheck' : (n === 'i' ? 'circleInfo' : 'alertO')) as IconName} size={14} /><span>{d.text}</span></div>;
            })}
          </div>
        ) : null}
        {deschis && p.nuSeSchimba ? <div class="chat-prop-nu">{p.nuSeSchimba}</div> : null}
        {deschis ? (
          <div class="chat-prop-b">
            <ButonProp text={textDa} ic="check" prim disabled={busy || !p.poate} onClick={da} />
            {p.randuri && p.poate && p.campuri ? (ed
              ? <ButonProp text="Lasă cum era" ic="undo" disabled={busy} onClick={lasa} />
              : <ButonProp text="Schimbă" ic="edit" disabled={busy} onClick={() => setEd(campuriStart(p))} />) : null}
            {p.poate && (p.alternative || []).length ? (alegeSofer
              ? (
                <select class="chat-prop-sel" aria-label="Alt șofer" value={String(ales.id)} onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  const a = p.alternative.filter((z: any) => String(z.id) === v)[0];
                  setAles(a ? { id: a.id, nume: a.nume } : { id: p.la, nume: so.la });
                }}>
                  <option value={String(p.la)}>{so.la + ' — propunerea mea'}</option>
                  {p.alternative.map((a: any) => <option value={String(a.id)}>{a.text}</option>)}
                </select>
              )
              : <ButonProp text="Schimbă" ic="edit" disabled={busy} onClick={() => setAlegeSofer(true)} />) : null}
            <ButonProp text="Nu" ic="x" disabled={busy} onClick={nu} />
          </div>
        ) : null}
        {deschis && p.sub ? <div class="chat-prop-sub">{p.sub}</div> : null}
      </div>
      {/* După „Da": gata, cu „Anulează" (cât mai ține) și butonul serverului; rândul jurnalului dedesubt. */}
      {p.stare === 'aplicata' && p.gata ? (
        <div class="chat-gata">
          <div class="chat-gata-t"><Icon name="circleCheck" size={15} /><span><Gros text={p.gata.text} /></span></div>
          <div class="chat-prop-b">
            {p.ramasMs > 0 ? <CeasAnulare ramasMs={p.ramasMs} disabled={busy} onClick={anuleaza} /> : null}
            {rutaButon(bGata) != null ? <ButonProp text={p.gata.buton ? (p.gata.buton.text || '') : 'Vezi fișa mașinii'} ic={icGata} onClick={() => laButon(bGata)} /> : null}
          </div>
          {p.gata.jurnal ? <div class="chat-prop-sub">{p.gata.jurnal}</div> : null}
        </div>
      ) : null}
      {p.stare === 'anulata' && p.anulareText ? (
        <div class="chat-gata anul"><div class="chat-gata-t"><Icon name="undo" size={15} /><span>{p.anulareText}</span></div></div>
      ) : null}
    </div>
  );
}
