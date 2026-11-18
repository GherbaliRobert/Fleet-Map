import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import {
  OK_DAI_LOC, TEXT_BIFA, TEXT_CONFIRM, TEXT_RENUNT, TITLU_COMPARATIE, TITLU_CONFIRMARE, TITLU_CONTURI, TITLU_DAI_LOC, TITLU_IN_TOATE, TITLU_PACHETE,
  corpLimita, corpTrecere, dupaConfirmare, nuIncapeDin, planConturi, planPachete, textDaiLoc, textLimitaGata, textLocGata, textPuneMaxim, textSursaGata,
  type CelulaCmp, type NuIncape,
} from '../lib/insightPachet';
import { HartieBtns } from './ContractUi';
import { Confirma } from './FlotaUi';
import { Icon } from './Icon';
import { ButonProp } from './InsightPropunere';
import '../screens/admin.css';      // comutatorul (.sw)
import '../screens/contracte.css';  // butoanele de hârtie

// „Vezi pachetele”, trecerea la alt pachet și „Pachet și conturi”, ca pe web (insightPachete, arataConfirmarea,
// deseneazaPachetConturi). Cifrele și textele vin de la server; regulile de desenat stau în lib/insightPachet.ts. Doar text: fără HTML.

// ── Fereastra de confirmare: textul EXACT de la server, bifa, „Confirm”. La 409, serverul trimite textul nou și omul îl citește din nou. ──
function FoaieTrecere({ cod, j, onInchide, onGata }: { cod: string; j: any; onInchide: () => void; onGata: (mesaj: string) => void }) {
  const [text, setText] = useState(String(j.text || ''));
  const [buton, setButon] = useState(String(j.buton || TEXT_CONFIRM));
  const [bifat, setBifat] = useState(false);
  const [busy, setBusy] = useState(false);
  useInapoiInchide(true, () => { if (!busy) onInchide(); return true; });
  async function confirma() {
    if (!bifat || busy) return;
    setBusy(true);
    let status = 200, r: any = null;
    try { r = await Api.insightPachetTrecereConfirma(corpTrecere(cod, text, bifat)); }
    catch (e: any) { status = (e && e.status) || 0; r = (e && e.data) || { error: e && e.message }; }
    const d = dupaConfirmare(status, r);
    if (d.fel === 'din-nou') { setText(d.text); if (d.buton) setButon(d.buton); setBifat(false); showToast(d.mesaj, true); setBusy(false); return; }
    if (d.fel === 'eroare') { showToast(d.mesaj, true); setBusy(false); return; }
    onGata(d.mesaj);
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onInchide(); }}>
      <div class="sheet" role="dialog" aria-label={TITLU_CONFIRMARE}>
        <div class="sheet-h"><b>{TITLU_CONFIRMARE}</b><button class="h-btn" onClick={() => { if (!busy) onInchide(); }} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="pk-pt-text">{text}</div>
          <label class="pk-pt-bifa">
            <input type="checkbox" checked={bifat} onChange={(e) => setBifat((e.target as HTMLInputElement).checked)} />
            <span>{String(j.bifa || TEXT_BIFA)}</span>
          </label>
          <div class="pk-pt-act">
            <button type="button" class="chat-pas" disabled={busy} onClick={onInchide}>{TEXT_RENUNT}</button>
            <button type="button" class="chat-pas pk-pt-ok" disabled={!bifat || busy} onClick={confirma}>{busy ? 'Se trimite…' : buton}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Celula({ c }: { c: CelulaCmp & { nume: string; ai: boolean; al: boolean } }) {
  return (
    <div class={'pk-cel' + (c.ai ? ' ai' : '') + (c.al ? ' al' : '')}>
      <span class="pk-cel-p">{c.nume}</span>
      <span class="pk-cel-v">
        {c.da === true ? <Icon name="check" size={15} aria-label="inclus" /> : c.da === false ? <span class="nu">—</span> : c.text}
      </span>
      {c.mic ? <small>{c.mic}</small> : null}
    </div>
  );
}

// ── „Vezi pachetele” ──
// `treci` (16.11): „Treci la Pro” din caseta de la capătul întrebărilor — confirmarea se deschide singură, o dată, peste pachete
// (web: insightTrecere, direct peste pagina de sub ea). Doar administratorul care poate schimba pachetul are butonul „Alege …”.
export function PaginaPachete({ onSchimbat, treci }: { onSchimbat: () => void; treci?: string }) {
  const [j, setJ] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [trecere, setTrecere] = useState<{ cod: string; j: any } | null>(null);
  const [cer, setCer] = useState('');
  const treciFacut = useRef(false);
  const aduce = () => Api.insightPachete().then((r: any) => { setJ(r); setErr(''); }).catch((e: any) => setErr((e && e.message) || 'Nu am putut încărca pachetele.'));
  useEffect(() => { aduce(); }, []);
  useEffect(() => {
    if (!j || treciFacut.current || !treci || !/^[a-z]+$/.test(treci)) return;
    treciFacut.current = true;
    const c = planPachete(j).carduri.find((x: any) => x.cod === treci);
    if (c && c.alege) alege(treci);
  }, [j]);
  async function alege(cod: string) {
    if (cer) return;
    setCer(cod);
    try { const r = await Api.insightPachetTrecere(cod); setTrecere({ cod, j: r }); }
    catch (e: any) { showToast((e && e.message) || 'Nu se poate schimba pachetul acum.', true); }
    setCer('');
  }
  if (err) return <div class="sdp"><div class="insp-card"><h3>{TITLU_PACHETE}</h3><div>{err}</div></div></div>;
  if (!j) return <div class="sdp"><div class="insp-gol">Se încarcă…</div></div>;
  const p = planPachete(j);
  return (
    <div class="sdp pk">
      <div class="pk-cap">
        <div class="pk-sub">{p.sub}</div>
        {p.urmText ? <div class="pk-sub pk-urmtext">{p.urmText}</div> : null}
      </div>
      {p.carduri.map((c: any) => (
        <div class={'pk-c' + (c.al ? ' al' : '') + (c.ai ? ' ai' : '')}>
          {c.eticheta ? <div class="pk-eti">{c.eticheta}</div> : null}
          {c.al ? <div class="pk-tau">Pachetul tău</div> : null}
          <div class="pk-n">{c.nume}</div>
          <div class="pk-pr"><b>{c.pret}</b> {c.subPret}</div>
          <div class="pk-ti">{c.titlu}</div>
          <div class="pk-pe">{c.pentru}</div>
          <dl class="pk-cifre">{c.cifre.map((x: any) => <div><dt>{x.et}</dt><dd class={x.nu ? 'nu' : undefined}>{x.val}</dd></div>)}</dl>
          {c.plus ? <div class="pk-plus">{c.plus}</div> : null}
          <ul class="pk-ul">{c.include.map((t: string) => <li><Icon name="check" size={13} /><span>{t}</span></li>)}</ul>
          {c.programat ? <div class="pk-urm">{c.programat}</div> : null}
          {c.alege ? <button type="button" class="chat-pas pk-alege" disabled={!!cer} onClick={() => alege(c.cod)}>{c.alege}</button> : null}
        </div>
      ))}
      {p.comparatie.length ? (
        <>
          <div class="pk-h">{TITLU_COMPARATIE}</div>
          {p.comparatie.map((g: any) => (
            <div class="pk-gr">
              <div class="pk-gr-t">{g.grup}</div>
              {g.randuri.map((r: any) => (
                <div class="pk-r">
                  <div class="pk-r-t">{r.t}{r.d ? <small>{r.d}</small> : null}</div>
                  <div class="pk-r-v">{r.celule.map((c: any) => <Celula c={c} />)}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : null}
      {p.inToate.length ? (
        <>
          <div class="pk-h">{TITLU_IN_TOATE}</div>
          <ul class="pk-ul pk-toate">{p.inToate.map((x: any) => <li><Icon name="check" size={13} /><span><b>{x.t}</b>{x.d}</span></li>)}</ul>
        </>
      ) : null}
      <div class="pk-schimb">{p.schimbText}</div>
      {trecere ? (
        <FoaieTrecere cod={trecere.cod} j={trecere.j} onInchide={() => setTrecere(null)}
          onGata={(m) => { setTrecere(null); showToast(m); aduce(); onSchimbat(); }} />
      ) : null}
    </div>
  );
}

// Un coleg, cu cifra lui pe lună (16.11, Alin: fără „Restul” / „Cel mult” — „nu e profesional”): o casetă; 0 = doar răspunsurile
// pe loc. Cifra care nu încape rămâne scrisă, cu chenar roșu (web: S.nuIncape). Primul administrator n-are casetă (`Cota`).
function Limita({ o, ni, onSalveaza }: { o: any; ni: NuIncape | null; onSalveaza: (id: any, val: string) => void }) {
  const vechi = o.cuLimita ? o.limita : '0';
  const [val, setVal] = useState(ni ? ni.valoare : vechi);
  useEffect(() => { setVal(ni ? ni.valoare : vechi); }, [vechi, ni]);
  return (
    <span class="pkc-lim-w">
      <input class={'pkc-lim' + (ni ? ' pkc-lim-nu' : '')} type="number" inputMode="numeric" min="0" step="1" value={val} aria-label={'Întrebări pe lună pentru ' + o.nume}
        onInput={(e) => setVal((e.target as HTMLInputElement).value)}
        onChange={(e) => { const v = String((e.target as HTMLInputElement).value).trim() || '0'; if (v !== vechi || ni) onSalveaza(o.id, v); }} />
      <span class="pkc-pel">pe lună</span>
    </span>
  );
}
function Cota({ c }: { c: { numar: string; text: string } }) {
  return <span class="pkc-cota"><b>{c.numar}</b><span>{c.text}</span></span>;
}

// ── „Pachet și conturi”: doar administratorul firmei, chiar și fără un cont RA Insight al lui ──
export function PaginaPachetConturi({ laPachete, onSchimbat }: { laPachete: () => void; onSchimbat: () => void }) {
  const [j, setJ] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [daLoc, setDaLoc] = useState<any | null>(null);
  // Cifra care nu încape (web: S.nuIncape) și confirmarea „Treci la Pro” (aceeași foaie ca în „Vezi pachetele”).
  const [ni, setNi] = useState<NuIncape | null>(null);
  const [trecere, setTrecere] = useState<{ cod: string; j: any } | null>(null);
  const [cer, setCer] = useState('');
  useInapoiInchide(!!daLoc, () => { setDaLoc(null); return true; });
  const aduce = () => Api.insightPachetConturi().then((r: any) => { setJ(r); setErr(''); })
    .catch((e: any) => setErr((e && e.data && e.data.error) || 'Pagina e doar a administratorului firmei.'));
  useEffect(() => { aduce(); }, []);
  async function pune(id: any, on: boolean, nume: string) {
    setNi(null);
    try { await Api.setUserAiSeat(id, on); showToast(textLocGata(on, nume)); }
    catch (e: any) { showToast((e && e.message) || 'Nu s-a putut schimba.', true); }
    onSchimbat(); aduce();
  }
  async function limita(id: any, val: string, nume: string) {
    try { await Api.setUserAiLimita(id, corpLimita(val).limita); setNi(null); showToast(textLimitaGata(val)); }
    catch (e: any) {
      const x = nuIncapeDin(e && e.data, id, nume, val);
      setNi(x);
      if (!x) showToast((e && e.message) || 'Nu s-a putut salva cifra.', true);
    }
    onSchimbat(); aduce();
  }
  async function trece(cod: string) {
    if (cer) return;
    setCer(cod);
    try { const r = await Api.insightPachetTrecere(cod); setTrecere({ cod, j: r }); }
    catch (e: any) { showToast((e && e.message) || 'Nu se poate schimba pachetul acum.', true); }
    setCer('');
  }
  async function sursa(on: boolean) {
    try { await Api.insightSursaFirma(on); showToast(textSursaGata(on)); }
    catch (e: any) { showToast((e && e.message) || 'Nu s-a putut schimba.', true); }
    onSchimbat(); aduce();
  }
  if (err) return <div class="sdp"><div class="insp-card">{err}</div></div>;
  if (!j) return <div class="sdp"><div class="insp-gol">Se încarcă…</div></div>;
  const p = planConturi(j);
  const sr = p.sursa;
  return (
    <div class="sdp pkc">
      <div class="pkc-cap">
        <h2>{TITLU_CONTURI}{p.pilula ? <span class="pkc-pill">{p.pilula}</span> : null}</h2>
        <ButonProp text="Vezi pachetele" ic="layers" onClick={laPachete} />
      </div>
      {p.urmator ? <div class="pkc-urm">{p.urmator}</div> : null}
      <div class="pkc-rez">
        {p.rezumat.map((t: string, i: number) => <div class={i ? 'pkc-rez-2' : undefined}>{t}</div>)}
        {p.bara != null ? <div class="pkc-bar"><b style={'width:' + p.bara + '%'} /></div> : null}
      </div>
      <div class="pkc-oameni">
        {p.oameni.map((o: any) => (
          <div class="pkc-om">
            <div class="pkc-om-sus">
              <span class="pkc-om-t"><b>{o.nume}</b><small>{o.rol}</small></span>
              <button type="button" class="pkc-sw" role="switch" aria-checked={o.loc} aria-label={'RA Insight pentru ' + o.nume} disabled={!o.loc && !!o.nuPoate}
                onClick={() => { if (o.loc) pune(o.id, false, o.nume); else setDaLoc(o); }}>
                <span class={'sw' + (o.loc ? ' on' : '')} />
              </button>
            </div>
            {o.nuPoate ? <div class="pkc-nu">{o.nuPoate}</div> : null}
            {o.nuPoate && p.recomandatConturi ? (
              <div class="pkc-treci"><ButonProp text={p.recomandatConturi.buton} ic="arrowUp" prim disabled={!!cer} onClick={() => trece(p.recomandatConturi!.cod)} /></div>
            ) : null}
            {p.imparte ? (
              <div class="pkc-kv"><span>Întrebări pe lună</span>{o.principal ? <Cota c={o.cota} /> : o.arataLimita ? <Limita o={o} ni={ni && ni.id === o.id ? ni : null} onSalveaza={(id, v) => limita(id, v, o.nume)} /> : <span class="pkc-gol">—</span>}</div>
            ) : null}
            <div class="pkc-kv"><span>{p.coloane[p.coloane.length - 1]}</span><b>{o.folosite}</b></div>
          </div>
        ))}
      </div>
      {ni ? (
        <div class="pkc-ni">
          <button type="button" class="chat-ib pkc-ni-x" aria-label="Închide" onClick={() => setNi(null)}><Icon name="x" size={16} /></button>
          <div class="pkc-ni-t">{ni.text}</div>
          {ni.rec && ni.rec.text ? <div class="pkc-ni-r">{ni.rec.text}</div> : null}
          {(ni.rec || ni.maxim > 0) ? (
            <div class="pkc-ni-b">
              {ni.rec ? <ButonProp text={ni.rec.buton} ic="arrowUp" prim disabled={!!cer} onClick={() => trece(ni.rec!.cod)} /> : null}
              {ni.maxim > 0 ? <ButonProp text={textPuneMaxim(ni)} ic="check" onClick={() => limita(ni.id, String(ni.maxim), ni.nume)} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div class="pkc-nota">{p.nota}</div>
      {sr ? (
        <div class="pkc-se">
          <div class="pkc-se-h">
            <Icon name="globe" size={16} /><b>{sr.nume}</b>
            <button type="button" class="pkc-sw" role="switch" aria-checked={sr.pornita} aria-label={sr.nume + ' pentru toată firma'} onClick={() => sursa(!sr.pornita)}>
              <span class={'sw' + (sr.pornita ? ' on' : '')} />
            </button>
          </div>
          <div class="pkc-se-t">{sr.text}</div>
          <div class="pkc-se-d">{sr.explicatie}</div>
        </div>
      ) : null}
      {p.treceri.length ? (
        <div class="pkc-tr">
          <h3>Schimbările de pachet</h3>
          {p.treceri.map((t: any) => (
            <div class="pkc-tr-r">
              <span class="pkc-tr-z">{t.cand}</span>
              <span class="pkc-tr-t">{t.rezumat}</span>
              <span class="pkc-tr-c">{t.cine}</span>
              <div class="ctr-btns"><HartieBtns path={t.pdf} ce="Confirmarea" nume="confirmare-pachet.pdf" /></div>
            </div>
          ))}
        </div>
      ) : null}
      {daLoc ? (
        <Confirma title={TITLU_DAI_LOC} text={textDaiLoc(daLoc.nume)} okLabel={OK_DAI_LOC}
          onCancel={() => setDaLoc(null)} onOk={() => { const o = daLoc; setDaLoc(null); pune(o.id, true, o.nume); }} />
      ) : null}
      {trecere ? (
        <FoaieTrecere cod={trecere.cod} j={trecere.j} onInchide={() => setTrecere(null)}
          onGata={(m) => { setTrecere(null); setNi(null); showToast(m); aduce(); onSchimbat(); }} />
      ) : null}
    </div>
  );
}
