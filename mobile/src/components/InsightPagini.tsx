import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Confirma } from './FlotaUi';
import { Icon, type IconName } from './Icon';
import { CeasAnulare, ButonProp } from './InsightPropunere';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import {
  EVENIMENTE_PRET, TEXT_INCUIAT, TEXT_PRETURI, inceputGhid, legaBife, linkHarta, planCombustibil, planMentenanta, planOreCondus, planSafeDrive, planScrisoare, planSoferi,
  ramuraDupa, scrisoareAleasa, sdNr, textAplica,
  type Act, type Bloc, type BifaStare, type Buton, type Cel, type Plan, type Select, type Tile,
} from '../lib/insightPagini';

// Paginile din RA Insight (web: deseneazaSoferi, deseneazaSafeDrive, deseneazaCombustibil, deseneazaMentenanta, deseneazaOreCondus,
// deseneazaScrisoare, deseneazaGhid, deseneazaIncuiata). Ce arată o pagină hotărăște planul ei (lib/insightPagini.ts); aici se cer
// datele, se desenează și se trimit apăsările. Tot textul de la server se pune ca TEXT.

export type LaPagina = {
  act: (a: Act) => void;       // Întreabă RA Insight, un ecran, altă pagină
  numere: () => void;          // numărul de lângă pagină s-a schimbat
};

// Luna, grupa, „Cum se socotește" rămân ținute minte cât trăiește aplicația (web: S.sdLuna, S.sdGrupa, S.sdCumDeschis…).
const mem: { alegeri: Record<string, { per?: string; grupa?: string | null }>; cum: Record<string, boolean> } = { alegeri: {}, cum: {} };

function Eroare({ h3, text }: { h3: string; text: string }) { return <div class="insp-card"><h3>{h3}</h3><div>{text}</div></div>; }
function faraAcces(j: any): string | null { return j && (j.seatMissing || j.error === 'ai_seat_missing') ? String(j.message || j.reply || '') : null; }
function textEroare(e: any): string { return (e && e.data && e.data.message) || (e && e.message) || 'Încearcă din nou peste un minut.'; }

function ButonPagina({ b, l }: { b: Buton; l: LaPagina }) {
  return <button type="button" class={'insp-btn' + (b.prim ? ' prim' : '')} onClick={() => l.act(b.act)}>{b.ic ? <Icon name={b.ic as IconName} size={15} /> : null}<span>{b.text}</span></button>;
}
function Celula({ c, col, l, bife }: { c: Cel; col: string; l: LaPagina; bife?: { stare: BifaStare[]; schimba: (i: number, v: boolean) => void } }) {
  return (
    <td class={c.cls} data-col={col || undefined}>
      <span class="sdp-cel">
        {c.linii.map((x) => {
          if (x.ck != null && bife) {
            const b = bife.stare[x.ck] || { checked: false, disabled: true };
            return <input type="checkbox" aria-label="Schimbarea de pe mașina asta" checked={b.checked} disabled={b.disabled} onChange={(e) => bife.schimba(x.ck as number, (e.target as HTMLInputElement).checked)} />;
          }
          if (x.buton) return <ButonPagina b={x.buton} l={l} />;
          if (x.link) return <button type="button" class="sdp-link" onClick={() => l.act((x.link as Buton).act)}>{x.link.text}</button>;
          if (x.loc) return <a class="sdp-loc" href={linkHarta(x.loc.lat, x.loc.lng)} target="_blank" rel="noopener"><Icon name="mapPin" size={14} /><span>{x.t}</span></a>;
          if (x.chip) return <span class={'sdp-chip ' + x.chip}>{x.t}</span>;
          if (x.niv) return <span class={'sdp-rd ' + (x.cls || '')}><Icon name={x.niv === 'r' ? 'x' : 'alertO'} size={13} />{x.t}</span>;
          return <span class={'sdp-rd ' + (x.cls || '')}>{x.t}</span>;
        })}
      </span>
    </td>
  );
}
function TileUna({ t, l }: { t: Tile; l: LaPagina }) {
  return (
    <div class={'sdp-tile' + (t.mare ? ' mare' : '') + (t.st ? ' st-' + t.st : '')}>
      <div class="et">{t.ic ? <Icon name={t.ic as IconName} size={13} /> : null}{t.et}</div>
      <div class="val">{t.val}</div>
      {t.sub ? <div class="sub">{t.sub}</div> : null}
      {t.chip ? <span class={'sdp-chip ' + t.chip.fel}>{t.chip.text}</span> : null}
      {t.link ? <button type="button" class="sdp-link" onClick={() => l.act((t.link as Buton).act)}>{t.link.text}</button> : null}
    </div>
  );
}
// Prețul unei manevre bruște: cine conduce flota îl schimbă aici; cifrele și clasele vin de la server.
function Preturi({ P, l, laSalvat }: { P: any; l: LaPagina; laSalvat: () => void }) {
  const [v, setV] = useState<Record<string, Record<string, any>>>(() => JSON.parse(JSON.stringify(P.valori || {})));
  const [busy, setBusy] = useState(false);
  async function salveaza(laPornire: boolean) {
    setBusy(true);
    try {
      await Api.insightSafeDrivePreturi(laPornire ? {} : v);
      showToast(laPornire ? 'Prețurile de pornire s-au pus la loc ✓' : 'Prețurile s-au salvat ✓');
      laSalvat();
    } catch (e: any) { showToast((e && e.message) || 'Nu s-au putut salva.', true); }
    setBusy(false);
  }
  return (
    <>
      <div class="sdp-et">{TEXT_PRETURI.titlu}</div>
      <table class="sdp-tab sdp-tab-pret">
        <thead><tr><th>{TEXT_PRETURI.felul}</th>{EVENIMENTE_PRET.map((e) => <th class="n">{e[1]}</th>)}</tr></thead>
        <tbody>
          {(P.clase || []).map((cl: any) => (
            <tr>
              <td class="b">{cl.et}</td>
              {EVENIMENTE_PRET.map((e) => {
                const val = ((v[cl.k] || {}) as any)[e[0]];
                return (
                  <td class="n" data-col={e[1]}>
                    {P.poateSchimba
                      ? <input class="sdp-pret" type="number" min="0" max="100" step="0.01" value={val == null ? '' : val} aria-label={cl.et + ' — ' + e[1]}
                        onInput={(ev) => { const x = (ev.target as HTMLInputElement).value; setV((o) => Object.assign({}, o, { [cl.k]: Object.assign({}, o[cl.k], { [e[0]]: x }) })); }} />
                      : sdNr(val, 2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {P.poateSchimba ? (
        <div class="sdp-btns">
          <button type="button" class="insp-btn prim" disabled={busy} onClick={() => salveaza(false)}><Icon name="check" size={15} /><span>{TEXT_PRETURI.salveaza}</span></button>
          <button type="button" class="insp-btn" disabled={busy} onClick={() => salveaza(true)}><span>{TEXT_PRETURI.pornire}</span></button>
        </div>
      ) : <div class="sdp-mic">{TEXT_PRETURI.citit}</div>}
    </>
  );
}
function BlocUna({ b, l, bife, reia }: { b: Bloc; l: LaPagina; bife?: { stare: BifaStare[]; schimba: (i: number, v: boolean) => void }; reia?: () => void }) {
  switch (b.b) {
    case 'card': return <div class="insp-card">{b.h3 ? <h3>{b.h3}</h3> : null}<div>{b.text}</div></div>;
    case 'pregatire': return (
      <div class="insp-card">
        <h3>{b.h3}</h3><div>{b.text}</div>
        {b.procent != null ? <><div class="sdp-prog"><b style={{ width: b.procent + '%' }} /></div><div class="sdp-mic">{b.procent + '%'}</div></> : null}
      </div>
    );
    case 'tiles': return <div class={'sdp-tiles' + (b.trei ? ' trei' : '')}>{b.tiles.map((t) => <TileUna t={t} l={l} />)}</div>;
    case 'linie': return <div class="sdp-linie">{b.spans.map((s) => <span>{s}</span>)}</div>;
    case 'mic': return <div class="sdp-mic">{b.text}</div>;
    case 'et': return <div class="sdp-et">{b.text}</div>;
    case 'rec': return <div class="sdp-sect"><div class={'sdp-rec ' + b.fel}><Icon name="alert" size={15} /><span>{b.text}</span></div></div>;
    case 'recbox': return (
      <div class="sdp-recbox">
        <div class="et">Ce recomandă RA Insight</div>
        {b.reco.map((x) => <div class={'sdp-rec ' + x.fel}><Icon name={(x.fel === 'atentie' ? 'alert' : (x.fel === 'bun' ? 'circleCheck' : 'bulb')) as IconName} size={15} /><span>{x.text}</span></div>)}
        <div class="sdp-btns">{b.butoane.map((x) => <ButonPagina b={x} l={l} />)}</div>
      </div>
    );
    case 'sect': return (
      <section class="sdp-sect">
        <h3><Icon name={b.ic as IconName} size={15} /><span>{b.titlu}</span></h3>
        {b.copii.map((c) => <BlocUna b={c} l={l} bife={bife} reia={reia} />)}
      </section>
    );
    case 'tabel': return (
      <table class="sdp-tab">
        <thead><tr>{b.capete.map((c) => <th class={c.cls}>{c.t}</th>)}</tr></thead>
        <tbody>
          {b.randuri.map((r) => <>
            <tr>{r.celule.map((c, i) => <Celula c={c} col={(b.capete[i] || { t: '' }).t} l={l} bife={bife} />)}</tr>
            {r.verif ? <tr class="sdp-verif"><td colSpan={b.capete.length}><Icon name="alert" size={13} />{r.verif}</td></tr> : null}
          </>)}
        </tbody>
      </table>
    );
    case 'loc': return <a class="sdp-loc" href={linkHarta(b.lat, b.lng)} target="_blank" rel="noopener"><Icon name="mapPin" size={14} /><span>{b.text}</span></a>;
    case 'ore': return (
      <div class="sdp-ore">
        {b.coloane.map((c) => <div class="sdp-ora"><b class={c.sus ? 'sus' : undefined} style={{ height: c.proc + '%' }} aria-label={c.h + ':00–' + (c.h + 1) + ':00 · ' + c.n + ' manevre'} /><span>{c.h}</span></div>)}
      </div>
    );
    case 'cum': return (
      <details class="sdp-sect sdp-cum" open={!!mem.cum[b.cheie]} onToggle={(e) => { mem.cum[b.cheie] = (e.target as HTMLDetailsElement).open; }}>
        <summary><Icon name="report" size={15} /><span>Cum se socotește</span></summary>
        {b.explicatii.map((x) => <p><b>{x.titlu + '. '}</b>{x.text}</p>)}
        {b.preturi ? <Preturi P={b.preturi} l={l} laSalvat={() => reia && reia()} /> : null}
      </details>
    );
    case 'nota': return <div class="sdp-nota"><Icon name="circleInfo" size={14} /><span>{b.text}</span></div>;
    case 'scris': return (
      <div class="sdp-sect sdp-scris">
        <div class="sdp-et">{b.et}</div>
        {b.bucati.map((x: any) => (x.ul ? <ul>{x.ul.map((t: string) => <li>{t}</li>)}</ul> : <p class={x.b ? 'b' : undefined}>{x.t}</p>))}
        {b.nota ? <div class="sdp-mic">{b.nota}</div> : null}
      </div>
    );
    case 'butoane': return <div class="sdp-btns">{b.butoane.map((x) => <ButonPagina b={x} l={l} />)}</div>;
    case 'rand': return <div class={'ssm-rand' + (b.w ? ' w' : '')}><b>{b.nr}</b>{b.text}</div>;
    case 'intro': return <div class="ssm-intro">{b.text}</div>;
  }
  return null;
}
// Capul paginii: titlul, luna / săptămâna, grupa, „Întreabă RA Insight".
function Cap({ p, l, laSelect }: { p: Plan; l: LaPagina; laSelect?: (s: Select, v: string) => void }) {
  return (
    <div class="sdp-cap">
      <h2><Icon name={p.ic as IconName} size={18} /><span>{p.titlu}</span>{p.sub ? <span class="sdp-sub">{p.sub}</span> : null}</h2>
      {p.selecte.length || p.intreaba ? (
        <div class="sdp-dr">
          {p.selecte.map((s) => (
            <select class="sdp-sel" aria-label={s.aria} value={s.val} onChange={(e) => laSelect && laSelect(s, (e.target as HTMLSelectElement).value)}>
              {s.optiuni.map((o) => <option value={o.v}>{o.t}</option>)}
            </select>
          ))}
          {p.intreaba ? <button type="button" class="insp-btn" onClick={() => l.act(p.intreaba as Act)}><Icon name="sparkles" size={15} /><span>Întreabă RA Insight</span></button> : null}
        </div>
      ) : null}
    </div>
  );
}
export function PlanDesenat({ p, l, laSelect, reia, bife }: { p: Plan; l: LaPagina; laSelect?: (s: Select, v: string) => void; reia?: () => void; bife?: { stare: BifaStare[]; schimba: (i: number, v: boolean) => void } }) {
  return <>
    <Cap p={p} l={l} laSelect={laSelect} />
    {p.blocuri.map((b) => <BlocUna b={b} l={l} reia={reia} bife={bife} />)}
  </>;
}
function SeIncarca() { return <div class="insp-gol">Se încarcă…</div>; }

// ── Paginile pe lună / săptămână: RA Drive, Combustibil, Ore de condus. „Pregătesc…" se reia singură. ──
const LUNARE: Record<string, { cere: (q: any) => Promise<any>; plan: typeof planSafeDrive; param: string; ales: string; eroare: string }> = {
  safedrive: { cere: (q) => Api.insightSafeDrive(q), plan: planSafeDrive, param: 'luna', ales: 'lunaAleasa', eroare: 'RA Drive nu s-a putut deschide' },
  combustibil: { cere: (q) => Api.insightCombustibil(q), plan: planCombustibil, param: 'luna', ales: 'lunaAleasa', eroare: 'Combustibil nu s-a putut deschide' },
  orecondus: { cere: (q) => Api.insightOreCondus(q), plan: planOreCondus, param: 'saptamana', ales: 'saptamanaAleasa', eroare: 'Ore de condus nu s-a putut deschide' },
};
function PaginaPerioada({ k, l }: { k: string; l: LaPagina }) {
  const d = LUNARE[k];
  const m = mem.alegeri[k] || (mem.alegeri[k] = {});
  const [per, setPer] = useState<string | undefined>(m.per);
  const [grupa, setGrupa] = useState<string | null | undefined>(m.grupa);
  const [j, setJ] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fel, setFel] = useState(0);       // „Reia" după o discuție sau după prețuri: aceeași lună, fără „Se încarcă…"
  const [sheet, setSheet] = useState<Act | null>(null);
  const tok = useRef(0);
  useInapoiInchide(!!sheet, () => { setSheet(null); return true; });

  async function aduce() {
    const t = ++tok.current;
    const q: Record<string, string> = {};
    if (per) q[d.param] = per;
    if (grupa != null) q.grupa = grupa;
    try {
      const r = await d.cere(q);
      if (t !== tok.current) return;
      const refuz = faraAcces(r);
      if (refuz != null) { setErr(refuz); setJ(null); return; }
      m.per = r[d.ales]; m.grupa = r.grupaAleasa;
      setErr(null); setJ(r);
    } catch (e: any) { if (t === tok.current) { setErr(textEroare(e)); setJ(null); } }
  }
  // Alegerea de sus: „Se încarcă…" (web: fără `singur`); reluările rămân pe pagina de acum.
  useEffect(() => { setJ(null); setErr(null); aduce(); return () => { tok.current++; }; }, [k, per, grupa]);
  useEffect(() => { if (fel) aduce(); }, [fel]);
  const p = j ? d.plan(j) : null;
  useEffect(() => {
    if (!p || !p.reia) return;
    const t = setTimeout(aduce, p.reia);
    return () => clearTimeout(t);
  }, [j]);

  function act(a: Act) {
    if (a.fel === 'discutie' || a.fel === 'scoate') { setSheet(a); return; }
    l.act(a);
  }
  async function discutie(a: Extract<Act, { fel: 'discutie' }>, nota: string) {
    try {
      await Api.insightDiscutie(a.id, String(nota || '').trim());
      showToast('Discuția s-a trecut ✓');
      setSheet(null); setFel((x) => x + 1);
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut salva.', true); }
  }
  async function scoate(a: Extract<Act, { fel: 'scoate' }>) {
    try {
      await Api.insightScoateDiscutie(a.id);
      setSheet(null); setFel((x) => x + 1);
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut scoate.', true); }
  }
  const lPag: LaPagina = { act, numere: l.numere };
  return (
    <div class="sdp">
      {err != null ? <Eroare h3={d.eroare} text={err} /> : !p ? <SeIncarca /> : (
        <PlanDesenat p={p} l={lPag} reia={() => setFel((x) => x + 1)}
          laSelect={(s, v) => { if (s.fel === 'grupa') { const g = v === '' ? null : v; m.grupa = g; setGrupa(g); } else { m.per = v; setPer(v); } }} />
      )}
      {sheet && sheet.fel === 'discutie' ? (
        <Confirma title={'Ai vorbit cu ' + sheet.nume + '?'} text="De azi, RA Drive compară manevrele bruște la 100 km de dinainte și de după discuție — vezi rezultatul aici, peste câteva zile." okLabel="Da, am vorbit"
          field={{ label: 'O notă scurtă (nu e obligatorie)', value: '' }} onCancel={() => setSheet(null)} onOk={(v) => discutie(sheet as any, String(v || ''))} />
      ) : null}
      {sheet && sheet.fel === 'scoate' ? (
        <Confirma title="Scoți discuția?" text="Discuția dispare din RA Drive (de exemplu, dacă ai trecut-o din greșeală)." okLabel="Scoate" danger onCancel={() => setSheet(null)} onOk={() => scoate(sheet as any)} />
      ) : null}
    </div>
  );
}

// ── Mentenanță & acte ──
function PaginaMentenanta({ l }: { l: LaPagina }) {
  const [j, setJ] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let viu = true;
    Api.insightMentenanta().then((r: any) => {
      if (!viu) return;
      const refuz = faraAcces(r);
      if (refuz != null) setErr(refuz); else setJ(r);
    }).catch((e: any) => { if (viu) setErr(textEroare(e)); });
    return () => { viu = false; };
  }, []);
  return <div class="sdp">{err != null ? <Eroare h3="Mentenanță & acte nu s-a putut deschide" text={err} /> : !j ? <SeIncarca /> : <PlanDesenat p={planMentenanta(j)} l={l} />}</div>;
}

// ── Scrisoarea de luni: lista, apoi scrisoarea aleasă; citită, numărul de lângă pagină scade. ──
let scrisoareMem: number | null = null;
function PaginaScrisoare({ l, id }: { l: LaPagina; id: number | null }) {
  const [lst, setLst] = useState<any | null>(null);
  const [x, setX] = useState<any | null>(null);
  const [errX, setErrX] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [ales, setAles] = useState<number | null>(id != null ? id : scrisoareMem);
  useEffect(() => {
    let viu = true;
    setX(null); setErrX(undefined);
    (async () => {
      try {
        const r: any = await Api.insightScrisori();
        if (!viu) return;
        const refuz = faraAcces(r);
        if (refuz != null) { setErr(refuz); return; }
        setLst(r);
        const a = scrisoareAleasa(r.scrisori || [], ales);
        if (!a) return;
        scrisoareMem = a.id;
        if (a.id !== ales) setAles(a.id);
        try {
          const s = await Api.insightScrisoare(a.id);
          if (!viu) return;
          setX(s); l.numere();
        } catch (e: any) { if (viu) setErrX((e && e.message) || 'Scrisoarea nu s-a putut deschide.'); }
      } catch (e: any) { if (viu) setErr(textEroare(e)); }
    })();
    return () => { viu = false; };
  }, [ales]);
  const a = lst ? scrisoareAleasa(lst.scrisori || [], ales) : null;
  return (
    <div class="sdp">
      {err != null ? <Eroare h3="Scrisoarea de luni nu s-a putut deschide" text={err} /> : !lst ? <SeIncarca /> : (
        <PlanDesenat p={planScrisoare(lst, a, x, errX)} l={l} laSelect={(_s, v) => setAles(Number(v))} />
      )}
    </div>
  );
}

// ── Șoferi pe mașini: toată flota deodată; bifezi și apeși „Aplică". Nimic nu se schimbă fără apăsare. ──
function PaginaSoferi({ l }: { l: LaPagina }) {
  const [j, setJ] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dupa, setDupa] = useState<any | null>(null);
  const [bife, setBife] = useState<BifaStare[]>([]);
  const [busy, setBusy] = useState(false);
  const tok = useRef(0);
  async function aduce(d?: any) {
    const t = ++tok.current;
    setDupa(d || null);
    try {
      const r: any = await Api.insightSoferiMasini();
      if (t !== tok.current) return;
      const refuz = faraAcces(r);
      if (refuz != null) { setErr(refuz); setJ(null); return; }
      setErr(null); setJ(r);
      const pl = planSoferi(r);
      setBife(legaBife(pl.propuneri, pl.propuneri.map(() => ({ checked: true, disabled: false }))).stare);
    } catch (e: any) { if (t === tok.current) { setErr(textEroare(e)); setJ(null); } }
  }
  useEffect(() => { aduce(); return () => { tok.current++; }; }, []);
  if (err != null) return <div class="sdp ssm"><div class="sdp-cap"><h2><Icon name="swap" size={18} /><span>Șoferi pe mașini</span></h2></div><Eroare h3="Pagina nu s-a putut deschide" text={err} /></div>;
  if (!j) return <div class="sdp ssm"><SeIncarca /></div>;
  const p = planSoferi(j);
  const stare = legaBife(p.propuneri, bife.length === p.propuneri.length ? bife : p.propuneri.map(() => ({ checked: true, disabled: false })));
  function schimba(i: number, v: boolean) { const n = stare.stare.map((b, k) => (k === i ? Object.assign({}, b, { checked: v }) : b)); setBife(legaBife(p.propuneri, n).stare); }
  async function aplica() {
    const sch = p.propuneri.filter((_x, i) => stare.stare[i].checked && !stare.stare[i].disabled).map((x) => ({ imei: x.imei, la: x.la }));
    if (!sch.length) return;
    setBusy(true);
    try {
      const r = await Api.insightAplicaSoferi(sch);
      l.numere();
      await aduce(r);
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut aplica.', true); await aduce(); }
    setBusy(false);
  }
  async function anuleaza() {
    setBusy(true);
    try {
      const r = await Api.insightActiune(dupa.actiuneId, 'anuleaza');
      showToast(r.text || 'Am anulat.');
      await aduce();
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut anula.', true); }
    setBusy(false);
  }
  const cuBife = p.propuneri.length > 0;
  return (
    <div class="sdp ssm">
      <Cap p={p} l={l} />
      {p.intro ? <div class="ssm-intro">{p.intro}</div> : null}
      {dupa && (dupa.gata || []).length ? (
        <div class="chat-gata ssm-gata">
          <div class="chat-gata-t"><Icon name="circleCheck" size={15} /><span>{dupa.text || 'Gata.'}</span></div>
          <ul class="ssm-gata-l">{dupa.gata.map((x: any) => <li>{x.text}</li>)}</ul>
          {(dupa.sarite || []).map((s: any) => <div class="chat-prop-sub">{'N-am schimbat: ' + s.motiv + '.'}</div>)}
          {dupa.ramasMs > 0 && dupa.actiuneId ? <div class="chat-prop-b"><CeasAnulare key={dupa.actiuneId} ramasMs={dupa.ramasMs} disabled={busy} onClick={anuleaza} /></div> : null}
        </div>
      ) : null}
      {p.blocuri.map((b) => <BlocUna b={b} l={l} bife={{ stare: stare.stare, schimba }} />)}
      {p.nuStie ? <div class="ssm-nustie">{p.nuStie}</div> : null}
      {cuBife ? (
        <div class="ssm-jos">
          <ButonProp text={textAplica(stare.n)} ic="check" prim disabled={busy || !stare.n || !j.poate} onClick={aplica} />
          <ButonProp text="Renunță" ic="x" disabled={busy} onClick={() => setBife(legaBife(p.propuneri, stare.stare.map((b) => Object.assign({}, b, { checked: false }))).stare)} />
          <span class="ssm-jos-n">{p.jos}</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Ghidul aplicației: un capitol deschis pe rând, chiar sub titlul lui. ──
function PaginaGhid({ l }: { l: LaPagina }) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [ales, setAles] = useState<any>(null);
  useEffect(() => {
    let viu = true;
    Api.insightGhid().then((r: any) => { if (viu) { const s = (r && r.sectiuni) || []; setLista(s); if (s.length) setAles(s[0].cheie); } }).catch(() => { if (viu) setLista([]); });
    return () => { viu = false; };
  }, []);
  if (!lista) return <div class="sdp"><SeIncarca /></div>;
  if (!lista.length) return <div class="sdp"><div class="insp-gol">Ghidul nu s-a putut încărca.</div></div>;
  return (
    <div class="sdp insp-ghid">
      {lista.map((g) => (
        <div class={'insp-ghid-c' + (ales === g.cheie ? ' act' : '')}>
          <button type="button" class="insp-ghid-t" aria-expanded={ales === g.cheie ? 'true' : 'false'} onClick={() => setAles(ales === g.cheie ? null : g.cheie)}><span>{g.titlu}</span><Icon name="chevronR" size={16} /></button>
          {ales === g.cheie ? (
            <div class="insp-ghid-text">
              {g.unde ? <div class="det"><Icon name="navigate" size={13} /> {g.unde}</div> : null}
              {Array.isArray(g.pasi) && g.pasi.length ? <ol>{g.pasi.map((x: any) => <li>{x}</li>)}</ol> : null}
              {g.detalii ? <div class="det">{g.detalii}</div> : null}
              <button type="button" class="insp-btn insp-ghid-q" onClick={() => l.act({ fel: 'intreaba', inceput: inceputGhid(g.titlu) })}><Icon name="sparkles" size={15} /><span>Întreabă RA Insight despre asta</span></button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// O pagină de la Basic, deschisă pe Start: ce e în ea și de la ce pachet merge, fără să ceară nimic serverului.
export function PaginaIncuiata({ k }: { k: string }) {
  const r = ramuraDupa(k);
  return <div class="sdp"><div class="insp-card insp-incuiat"><h3>{(r && r.et) || 'Ramura'}</h3><div>{TEXT_INCUIAT}</div></div></div>;
}
export function PaginaRamura({ k, l, scrisoareId }: { k: string; l: LaPagina; scrisoareId: number | null }) {
  if (LUNARE[k]) return <PaginaPerioada key={k} k={k} l={l} />;
  if (k === 'mentenanta') return <PaginaMentenanta l={l} />;
  if (k === 'scrisoare') return <PaginaScrisoare l={l} id={scrisoareId} />;
  if (k === 'soferi') return <PaginaSoferi l={l} />;
  if (k === 'ghid') return <PaginaGhid l={l} />;
  return null;
}
