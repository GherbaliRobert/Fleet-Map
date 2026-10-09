import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from './Icon';
import { salveazaDeLaServer } from '../lib/export';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { deNr, nrDe } from '../lib/numar';
import { fisierB64, potTrimiteCrud, trimiteFisierCrud } from '../lib/trimiteFisier';
import '../screens/oferte.css';

// „Mașinile clientului" din Ofertare Live, pe telefon (pe web din 28.09) — doar pentru noi, nu apare în ofertă.
//
// Omul scrie mașinile clientului (marcă, model, an, combustibil, câte bucăți) sau încarcă șablonul completat de
// client; SERVERUL le caută în listele Teltonika și spune, pe fiecare, ce aparat merge și ce date se citesc.
// Telefonul NU hotărăște niciun aparat: ține doar rândurile, le trimite la fiecare socoteală a ofertei
// (`/api/admin/offers/calc`, câmpul `masini`) și arată ce a scris pagina web sub fiecare rând
// (`masini.randuri[i].rez`) și sumarul cu „Trece în ofertă" (același buton ca „Aplică recomandarea" de la pasul 4).
// Lista se salvează cu oferta (serverul o pune în `cfg.masini`) și NU ajunge pe hârtia clientului.
//
// Rândurile sunt ale telefonului: un răspuns de la server NU le rescrie (capcana de la Inventar — caseta în care
// scrii și-ar pierde ce ai scris). Se schimbă doar rezultatul de sub ele.
export type RandMs = { id: number; marca: string; model: string; an: string; combustibil: string; buc: string; aparat: string };
export type RezMs = { rez: string; rec: { aparat: string; et: string } | null; sig: string };
export type Optiune = { k: string; et: string };
export const MS_GOL = { marca: '', model: '', an: '', combustibil: '', buc: '1', aparat: '' };

// Ce decide potrivirea unei mașini: marca, modelul, anul, combustibilul — plus „date din motor" și comutatorul CAN
// (alege între listele Teltonika la mașinile care sunt pe amândouă). Bucățile și aparatul ales de mână nu o schimbă.
// Un rezultat primit pentru altă semnătură decât cea de acum e VECHI: rândul arată că se caută din nou.
export function semnMs(r: RandMs, motor: boolean, canMod: string): string {
  return JSON.stringify([String(r.marca).trim(), String(r.model).trim(), String(r.an).trim(), r.combustibil, !!motor, canMod]);
}
export const msValid = (r: RandMs) => !!(String(r.marca).trim() && String(r.model).trim());

// Completarea mărcii și a modelului: întâi ce ÎNCEPE cu ce ai scris, apoi ce îl CUPRINDE.
function potriviri(lista: string[], text: string, max: number): string[] {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return lista.slice(0, max);
  const inc: string[] = [], cuprinde: string[] = [];
  for (const x of lista) {
    const l = String(x).toLowerCase();
    if (l.startsWith(t)) inc.push(x); else if (l.indexOf(t) >= 0) cuprinde.push(x);
  }
  // Scris deja întocmai și nimic altceva pe aproape: n-are rost să mai propunem.
  if (inc.length === 1 && !cuprinde.length && inc[0].toLowerCase() === t) return [];
  return inc.concat(cuprinde).slice(0, max);
}
// Ziua unei liste („2025-07-23") sau a încărcării ei (ms), ca pe web (`_ofZiRo`).
function zi(x: any): string {
  if (!x) return '';
  const d = typeof x === 'number' ? new Date(x) : new Date(String(x) + 'T12:00:00');
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ro-RO');
}
const nrRo = (n: any) => (Number(n) || 0).toLocaleString('ro-RO');
const ACCEPT_XLSX = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream';
const LISTA_MAX_MB = 15;   // limita ușii de pe server (`express.raw`, 15 MB) — aceeași, spusă înainte să urce fișierul
const PAGINA_CAN = 'https://wiki.teltonika-gps.com/view/CAN_adapter_supported_vehicles';
const PAGINA_FMC150 = 'https://wiki.teltonika-gps.com/view/FMX150_supported_vehicles';
function deschideAfara(url: string) { try { (window as any).open(url, '_system'); } catch { window.open(url, '_blank'); } }

type Foaie =
  | { fel: 'inlocuieste'; masini: any[]; acum: number }
  | { fel: 'probleme'; titlu: string; probleme: { rand: number; ce: string }[]; nProbleme: number }
  | { fel: 'liste' }
  | null;

export function MasiniClient(p: {
  randuri: RandMs[];
  rez: Record<number, RezMs>;
  motor: boolean;
  canMod: string;
  sumar: string;                // HTML-ul paginii web, curățat pe server (`_ofCurat`)
  aparate: Optiune[];
  combustibili: Optiune[];
  onCamp: (id: number, camp: 'marca' | 'model' | 'an' | 'combustibil' | 'buc' | 'aparat', val: string) => void;
  onAdauga: () => void;
  onScoate: (id: number) => void;
  onMotor: (v: boolean) => void;
  onInlocuieste: (lista: Omit<RandMs, 'id'>[]) => void;
  onAplica: () => void;         // „Trece în ofertă" = „Aplică recomandarea", apăsat de server în pagină
  onListeNoi: () => void;       // o listă Teltonika nouă: rezultatele se cer din nou
}) {
  const [marci, setMarci] = useState<string[]>([]);
  const genMarci = useRef(0);
  const modele = useRef<Record<string, string[]>>({});
  const [, setModeleVer] = useState(0);
  const [sug, setSug] = useState<{ id: number; camp: 'marca' | 'model' } | null>(null);
  const ceasSug = useRef<any>(null);
  const [foaie, setFoaie] = useState<Foaie>(null);
  const [busy, setBusy] = useState('');
  const [liste, setListe] = useState<any[] | null>(null);
  const [fisierLista, setFisierLista] = useState<File | null>(null);
  const [stareLista, setStareLista] = useState<{ s: string; rau: boolean } | null>(null);
  const citit = useRef<any>(null);   // șablonul citit, cât așteaptă întrebarea „Înlocuiești lista?"

  // Mărcile, pentru completarea casetei „Marcă" (pe web, lista de sub casetă): la deschidere și după o listă
  // Teltonika nouă. Scrie doar răspunsul cererii celei mai noi — unul întârziat, de dinaintea listei, nu-l calcă.
  function incarcaMarci() {
    const g = ++genMarci.current;
    Api.masiniMarci().then((j) => { if (g === genMarci.current) setMarci(Array.isArray(j && j.marci) ? j.marci : []); }).catch(() => {});
  }
  useEffect(() => { incarcaMarci(); }, []);
  useEffect(() => () => clearTimeout(ceasSug.current), []);
  useInapoiInchide(!!foaie, () => { if (busy) return false; setFoaie(null); return true; });

  // Modelele unei mărci, cerute o dată și ținute minte. `c` = cutia de ACUM: un răspuns sosit după o listă
  // Teltonika nouă cade în cutia veche, aruncată, nu în cea nouă.
  function incarcaModele(marca: string) {
    const m = String(marca || '').trim(), c = modele.current;
    if (!m || c[m]) return;
    c[m] = [];
    Api.masiniModele(m)
      .then((j) => { c[m] = Array.isArray(j && j.modele) ? j.modele : []; setModeleVer((x) => x + 1); })
      .catch(() => { delete c[m]; });
  }
  function deschideSug(r: RandMs, camp: 'marca' | 'model') {
    clearTimeout(ceasSug.current);
    setSug({ id: r.id, camp });
    if (camp === 'model') incarcaModele(r.marca);
  }
  // O atingere pe o propunere ia întâi focusul casetei: lista se închide abia după, ca atingerea să ajungă.
  function inchideSug() { clearTimeout(ceasSug.current); ceasSug.current = setTimeout(() => setSug(null), 200); }
  function alege(r: RandMs, camp: 'marca' | 'model', v: string) {
    clearTimeout(ceasSug.current);
    p.onCamp(r.id, camp, v);
    setSug(null);
    if (camp === 'marca') incarcaModele(v);
  }
  function sugestii(r: RandMs, camp: 'marca' | 'model') {
    if (!sug || sug.id !== r.id || sug.camp !== camp) return null;
    const lista = camp === 'marca'
      ? (String(r.marca).trim() ? potriviri(marci, r.marca, 8) : [])
      : potriviri(modele.current[String(r.marca).trim()] || [], r.model, 12);
    if (!lista.length) return null;
    return (
      <div class="of-ms-sug" role="listbox" aria-label={camp === 'marca' ? 'Mărci' : 'Modele'}>
        {lista.map((x) => (
          <button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => alege(r, camp, x)}>{x}</button>
        ))}
      </div>
    );
  }

  // „Poate e: …" de sub o mașină: modelul propus de server, pus în caseta ei.
  const laClicRand = (id: number) => (e: any) => {
    const a = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    e.preventDefault();
    if (a.getAttribute('data-act') === 'model') p.onCamp(id, 'model', String(a.getAttribute('data-val') || ''));
  };
  const laClicSumar = (e: any) => {
    const a = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    e.preventDefault();
    if (a.getAttribute('data-act') === 'aplicaRec' && !a.disabled) p.onAplica();
  };

  // ── Șablonul: îl face serverul (cu logo, cu listele de ales) și tot el îl citește ──────────────────
  async function descarcaSablon() {
    setBusy('descarc');
    try { await salveazaDeLaServer('/api/admin/masini/sablon', 'RA-Track - Șablon mașini client.xlsx'); }
    catch (e: any) { showToast('Șablonul nu s-a descărcat: ' + (e?.message || 'eroare'), true); }
    finally { setBusy(''); }
  }
  async function alegeSablon(e: any) {
    const inp = e.currentTarget as HTMLInputElement;
    const f = inp.files && inp.files[0];
    inp.value = '';
    if (!f) return;
    setBusy('sablon');
    try {
      const j = await Api.masiniSablonCiteste({ fisier: f.name, b64: await fisierB64(f) });
      const masini = Array.isArray(j && j.masini) ? j.masini : [];
      if (!masini.length) { setFoaie({ fel: 'probleme', titlu: 'N-am găsit nicio mașină în șablon', probleme: j.probleme || [], nProbleme: j.nProbleme || 0 }); return; }
      // Ca pe web: o listă începută nu se calcă fără întrebare.
      const acum = p.randuri.filter(msValid).length;
      if (acum) { citit.current = j; setFoaie({ fel: 'inlocuieste', masini, acum }); return; }
      puneDinSablon(j);
    } catch (err: any) { showToast('Șablonul nu s-a citit: ' + (err?.message || 'eroare'), true); }
    finally { setBusy(''); }
  }
  function puneDinSablon(j: any) {
    const masini: any[] = Array.isArray(j && j.masini) ? j.masini : [];
    p.onInlocuieste(masini.map((m) => ({
      marca: String(m.marca || ''), model: String(m.model || ''), an: m.an ? String(m.an) : '',
      combustibil: String(m.combustibil || ''), buc: String(m.buc || 1), aparat: '',
    })));
    const buc = masini.reduce((s, x) => s + (Number(x.buc) || 1), 0);
    showToast('Am citit ' + nrDe(masini.length, 'rând', 'rânduri') + ' din șablon (' + nrDe(buc, 'mașină', 'mașini') + ') ✓');
    if (j.nProbleme) setFoaie({ fel: 'probleme', titlu: 'Ce n-am putut citi din șablon', probleme: j.probleme || [], nProbleme: j.nProbleme });
    else setFoaie(null);
  }

  // ── Listele Teltonika: ce e încărcat și, când apare una nouă, încărcarea ei ───────────────────────
  function deschideListe() {
    setListe(null); setFisierLista(null); setStareLista(null);
    setFoaie({ fel: 'liste' });
    Api.masiniListe().then((j) => setListe(Array.isArray(j && j.liste) ? j.liste : []))
      .catch((e: any) => { setListe([]); setStareLista({ s: e?.message || 'Listele nu s-au putut citi.', rau: true }); });
  }
  async function incarcaLista() {
    const f = fisierLista;
    if (!f) { setStareLista({ s: 'Alege întâi fișierul Excel al listei.', rau: true }); return; }
    if (f.size > LISTA_MAX_MB * 1024 * 1024) { setStareLista({ s: 'Fișierul are ' + (f.size / 1048576).toFixed(1) + ' MB, limita e ' + LISTA_MAX_MB + '.', rau: true }); return; }
    setBusy('lista');
    setStareLista({ s: 'Citesc lista… (o listă mare durează câteva secunde)', rau: false });
    try {
      const j: any = await trimiteFisierCrud('/api/admin/masini/liste', f, { 'X-Fisier': encodeURIComponent(f.name) });
      showToast('Lista ' + j.nume + ' e încărcată: ' + nrRo(j.n) + deNr(j.n) + 'vehicule ✓');
      setListe(Array.isArray(j.liste) ? j.liste : liste);
      setFisierLista(null); setStareLista(null);
      // Ca pe web (`raxOfListaIncarca`): mărcile și modelele propuse se cer din nou, ca să le cuprindă și pe
      // cele care există doar în lista nouă. Rezultatele de sub mașini le cere din nou calculatorul.
      modele.current = {}; setModeleVer((x) => x + 1);
      incarcaMarci();
      p.onListeNoi();
    } catch (e: any) { setStareLista({ s: e?.message || 'Nu s-a putut încărca lista.', rau: true }); }
    finally { setBusy(''); }
  }

  const inchideFoaia = () => { if (!busy) setFoaie(null); };
  return (
    <div class="of-card">
      <div class="of-t"><Icon name="car" size={15} /> Mașinile clientului <span class="of-ms-tag">doar pentru tine</span></div>
      <div class="of-d">Scrii mașinile clientului (sau încarci șablonul completat de el) și îți spun ce aparat merge pe fiecare și ce date se citesc, după listele oficiale Teltonika. „Trece în ofertă" completează pașii 2, 4 și 5. Nu apare pe oferta clientului.</div>
      <div class="of-tgl">
        <span class="lbl" style="font-size:13.5px;font-weight:600">Clientul vrea date din motor (consum, rezervor, kilometri), nu doar poziția</span>
        <button onClick={() => p.onMotor(!p.motor)} role="switch" aria-checked={p.motor} aria-label="Clientul vrea date din motor"><span class={'sw' + (p.motor ? ' on' : '')} /></button>
      </div>

      {p.randuri.length === 0 && <div class="of-hint" style="margin:2px 0 10px">Nicio mașină încă. Adaugă una, sau descarcă șablonul, trimite-l clientului și încarcă-l completat.</div>}
      {p.randuri.map((r) => {
        const R = p.rez[r.id];
        const valid = msValid(r);
        const proaspat = !!R && R.sig === semnMs(r, p.motor, p.canMod);
        return (
          <div class="of-ms-rand" key={r.id}>
            <div class="of-ms-l1">
              <div class="of-ms-c">
                <input class="of-in lat" value={r.marca} placeholder="Marcă" aria-label="Marcă" autoComplete="off" autoCapitalize="words"
                  onFocus={() => deschideSug(r, 'marca')} onBlur={inchideSug}
                  onInput={(e: any) => { p.onCamp(r.id, 'marca', e.currentTarget.value); clearTimeout(ceasSug.current); setSug({ id: r.id, camp: 'marca' }); }} />
                {sugestii(r, 'marca')}
              </div>
              <button class="of-b of-ic" onClick={() => p.onScoate(r.id)} aria-label="Scoate mașina"><Icon name="x" size={17} /></button>
            </div>
            <div class="of-ms-c">
              <input class="of-in lat" value={r.model} placeholder="Model" aria-label="Model" autoComplete="off" autoCapitalize="words"
                onFocus={() => deschideSug(r, 'model')} onBlur={inchideSug}
                onInput={(e: any) => { p.onCamp(r.id, 'model', e.currentTarget.value); clearTimeout(ceasSug.current); setSug({ id: r.id, camp: 'model' }); }} />
              {sugestii(r, 'model')}
            </div>
            <div class="of-ms-l3">
              <input class="of-in of-ms-an" inputMode="numeric" value={r.an} placeholder="An" aria-label="Anul fabricației"
                onInput={(e: any) => p.onCamp(r.id, 'an', String(e.currentTarget.value).replace(/[^0-9]/g, '').slice(0, 4))} />
              <select class="of-in of-ms-comb" value={r.combustibil} aria-label="Combustibil" onChange={(e: any) => p.onCamp(r.id, 'combustibil', e.currentTarget.value)}>
                <option value="">combustibil</option>
                {p.combustibili.map((c) => <option value={c.k}>{c.et}</option>)}
              </select>
              <span class="of-ms-buc">
                <input class="of-in" inputMode="numeric" value={r.buc} aria-label="Bucăți"
                  onInput={(e: any) => p.onCamp(r.id, 'buc', String(e.currentTarget.value).replace(/[^0-9]/g, '').slice(0, 5))} />
                <span class="of-um">buc</span>
              </span>
            </div>
            <div class="of-ms-rez">
              {!valid
                ? <span class="raof-ms-mic">Scrie marca și modelul (și anul, ca să fie sigur).</span>
                : proaspat
                  ? <div onClick={laClicRand(r.id)} dangerouslySetInnerHTML={{ __html: R.rez }} />
                  : <span class="raof-ms-mic of-ms-caut"><span class="spin" style="width:13px;height:13px;border-width:2px" /> caut în listele Teltonika…</span>}
            </div>
            {valid && R && (
              <label class="of-ms-alege">
                <span>Aparatul pus în ofertă:</span>
                <select class="of-in lat" value={r.aparat} onChange={(e: any) => p.onCamp(r.id, 'aparat', e.currentTarget.value)}>
                  <option value="">{'cel recomandat' + (R.rec && R.rec.et ? ' (' + R.rec.et + ')' : '')}</option>
                  {p.aparate.map((a) => <option value={a.k}>{a.et}</option>)}
                </select>
              </label>
            )}
          </div>
        );
      })}

      <div class="of-ms-act">
        <button class="of-b" onClick={p.onAdauga}><Icon name="plus" size={16} /> Adaugă mașină</button>
        <button class="of-b" onClick={descarcaSablon} disabled={!!busy}><Icon name="download" size={16} /> {busy === 'descarc' ? 'Se pregătește…' : 'Descarcă șablonul'}</button>
        <label class={'of-b' + (busy ? ' dis' : '')} aria-disabled={!!busy}>
          <input type="file" accept={ACCEPT_XLSX} style="display:none" disabled={!!busy} onChange={alegeSablon} />
          <Icon name="upload" size={16} /> {busy === 'sablon' ? 'Se citește…' : 'Încarcă șablonul'}
        </label>
        <button class="of-b" onClick={deschideListe}><Icon name="list" size={16} /> Listele Teltonika</button>
      </div>
      {p.sumar ? <div class="of-ms-sumar" onClick={laClicSumar} dangerouslySetInnerHTML={{ __html: p.sumar }} /> : null}

      {foaie && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchideFoaia(); }}>
          <div class="sheet">
            {foaie.fel === 'inlocuieste' && (<>
              <div class="sheet-h"><b>Înlocuiești lista?</b><button class="h-btn" onClick={inchideFoaia} aria-label="Închide"><Icon name="x" /></button></div>
              <div class="sheet-body">
                <div style="font-size:14.5px;line-height:1.5;margin:0 0 16px">
                  {'Lista are deja ' + nrDe(foaie.acum, 'mașină', 'mașini') + '. Le înlocuiesc cu cele ' + foaie.masini.length + ' din șablon?'}
                </div>
                <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px">
                  <button class="of-b" onClick={() => { citit.current = null; setFoaie(null); }}>Renunță</button>
                  <button class="of-b pri" onClick={() => { const j = citit.current; citit.current = null; if (j) puneDinSablon(j); else setFoaie(null); }}><Icon name="check" size={17} /> Înlocuiește</button>
                </div>
              </div>
            </>)}
            {foaie.fel === 'probleme' && (<>
              <div class="sheet-h"><b>{foaie.titlu}</b><button class="h-btn" onClick={inchideFoaia} aria-label="Închide"><Icon name="x" /></button></div>
              <div class="sheet-body">
                {foaie.probleme.length ? (
                  <div class="of-ms-prob">
                    {foaie.probleme.map((x) => <div><b>{'Rândul ' + x.rand + ':'}</b> {x.ce}</div>)}
                    {foaie.nProbleme > foaie.probleme.length ? <div>{'… și încă ' + (foaie.nProbleme - foaie.probleme.length) + '.'}</div> : null}
                  </div>
                ) : <div class="of-ms-prob">Șablonul e gol: scrie mașinile sub capul de tabel (Marcă, Model…).</div>}
                <div class="of-hint" style="margin-top:10px">Repară rândurile în Excel și încarcă șablonul din nou.</div>
                <button class="of-b" style="width:100%;margin-top:14px" onClick={inchideFoaia}>Închide</button>
              </div>
            </>)}
            {foaie.fel === 'liste' && (<>
              <div class="sheet-h"><b>Listele Teltonika</b><button class="h-btn" onClick={inchideFoaia} aria-label="Închide"><Icon name="x" /></button></div>
              <div class="sheet-body">
                {liste == null && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
                {(liste || []).map((l: any) => (
                  <div class="of-lt-r">
                    <b>{l.nume}</b>
                    <small>{l.pentru}</small>
                    {l.lipsa
                      ? <span class="raof-ms-lipsa">nu e încărcată</span>
                      : <div class="of-lt-n">
                          <b>{nrRo(l.n) + deNr(l.n) + 'vehicule'}</b>
                          <small>{[l.fisier || '', l.data ? 'lista din ' + zi(l.data) : '', l.sursa === 'pornire' ? 'copia de pornire' : (l.incarcat_la ? 'încărcată pe ' + zi(l.incarcat_la) : '')].filter(Boolean).join(' · ')}</small>
                        </div>}
                  </div>
                ))}
                <div class="of-hint" style="margin:12px 0 10px;line-height:1.55">
                  Când Teltonika scoate o listă nouă, o descarci de pe <a class="of-link" onClick={() => deschideAfara(PAGINA_CAN)}>pagina lor de adaptoare CAN</a> (LV-CAN200,
                  ALL-CAN300) sau de pe <a class="of-link" onClick={() => deschideAfara(PAGINA_FMC150)}>pagina FMC150</a> și o încarci aici. Recunosc singur ce listă
                  e; cea nouă o înlocuiește pe cea veche.
                </div>
                {potTrimiteCrud() ? (<>
                  <label class={'of-b' + (busy ? ' dis' : '')} style="width:100%" aria-disabled={!!busy}>
                    <input type="file" accept={ACCEPT_XLSX} style="display:none" disabled={!!busy}
                      onChange={(e: any) => { const i = e.currentTarget as HTMLInputElement; setFisierLista((i.files && i.files[0]) || null); setStareLista(null); i.value = ''; }} />
                    <Icon name="fileBar" size={16} style="flex:0 0 auto" /> <span style="min-width:0;overflow-wrap:anywhere">{fisierLista ? fisierLista.name : 'Alege fișierul Excel al listei'}</span>
                  </label>
                  <button class="of-b pri" style="width:100%;margin-top:8px" disabled={!!busy || !fisierLista} onClick={incarcaLista}>
                    <Icon name="upload" size={16} /> {busy === 'lista' ? 'Se încarcă…' : 'Încarcă lista'}
                  </button>
                </>) : (
                  <div class="of-hint">Pe telefonul ăsta (Android mai vechi de 8) o listă nouă se încarcă din aplicația web.</div>
                )}
                {stareLista && <div class={stareLista.rau ? 'raof-ms-lipsa' : 'raof-ms-mic'} style="margin-top:8px;font-size:13px">{stareLista.s}</div>}
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
