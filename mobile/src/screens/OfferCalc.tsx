import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { MasiniClient, MS_GOL, semnMs, type Optiune, type RandMs, type RezMs } from '../components/MasiniClient';
import { salveazaPostDeLaServer } from '../lib/descarcaPost';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { OurPrices } from './OurPrices';
import './admin.css';
import './detail.css';
import './oferte.css';

// Super-admin: Ofertare Live — calculatorul, pe telefon (/admin/offers/noua și /admin/offers/:id).
//
// Telefonul NU socotește nimic. Ține doar ce e scris în câmpuri și ce a atins omul, iar la fiecare schimbare
// (după o mică pauză) le trimite la `/api/admin/offers/calc`. Serverul rulează chiar pagina web „Ofertare Live"
// (aceleași funcții, aceleași `oninput`-uri) și întoarce: câmpurile după completarea automată, sumele,
// rezumatul scris de pagină, costul RA Insight și „Ce rămâne la noi" (doar pentru noi), plus corpul GATA al
// salvării, al PDF-ului și al „Salvează ca tarifele noastre". Așa că oferta de pe telefon e, la leu, cea de pe
// web — și se schimbă singură când se schimbă web-ul.
//
// Regula câmpurilor atinse (ca pe web, `_ofAtinse`): ce ai scris tu nu mai e completat din numărul de mașini.
// Pe o ofertă deschisă din listă, tot ce era salvat e „scris de mână" — prețurile negociate nu se calcă.
//
// Sugestiile doar pentru noi (lotul 3, 29.09 — pe web din 25–28.09) vin tot din pagină: „Ce recomanzi" (pasul 2),
// „Recomandarea pentru flota asta" cu comutatorul CAN și „Aplică recomandarea" (pasul 4), „Mașinile clientului".
// Butoanele lor nu fac nimic aici: telefonul le trimite înapoi (`canMod`, `aplicaRecomandarea`), iar serverul le
// apasă în pagină. Comutatorul CAN și lista mașinilor sunt starea ECRANULUI (ca pe web): pleacă la fiecare socoteală.
type Meta = { k: string; tip: string; pas?: string | null; placeholder?: string | null; atinge?: boolean; optiuni?: { v: string; et: string }[] };
type Rasp = any;
type CanMod = 'lvcan' | 'fmc150';

const DE_TARIFE = 'Prețurile de aici țin doar pentru oferta asta. Apasă butonul ca să rămână: de la ele pornesc toate ofertele viitoare. Ofertele deja salvate își păstrează prețurile lor.';
const curataNr = (v: string) => v.replace(/,/g, '.').replace(/[^0-9.]/g, '');

export function OfferCalc() {
  const loc = useLocation();
  const { params } = useRoute();
  const idOf = params && params.id && /^\d+$/.test(params.id) ? Number(params.id) : null;

  const [camp, setCamp] = useState<Record<string, any> | null>(null);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [res, setRes] = useState<Rasp | null>(null);
  const [err, setErr] = useState('');
  const [lucreaza, setLucreaza] = useState(false);   // o socoteală e pe drum
  const [busy, setBusy] = useState('');             // o acțiune (salvare, PDF, tarife)
  const [preturi, setPreturi] = useState(false);

  // Starea care pleacă la server: câmpurile, cele atinse, câmpurile schimbate de la ultima trimitere (în
  // ordinea în care le-a atins omul) și cele scrise CÂT timp o socoteală era pe drum (răspunsul ei nu le calcă).
  const campRef = useRef<Record<string, any>>({});
  const atinseRef = useRef<string[]>([]);
  const schimbateRef = useRef<string[]>([]);
  const scriseAcumRef = useRef<Set<string>>(new Set());
  const murdarRef = useRef(false);
  const coadaRef = useRef<Promise<any>>(Promise.resolve());
  const ceasRef = useRef<any>(null);
  const resRef = useRef<Rasp | null>(null);
  const viuRef = useRef(true);
  const genRef = useRef(0);   // „Ofertă nouă" / altă ofertă: răspunsurile rămase pe drum nu mai au voie să scrie

  // „Mașinile clientului" și comutatorul CAN — starea ecranului, trimisă la fiecare socoteală.
  const [ms, setMs] = useState<RandMs[]>([]);
  const msRef = useRef<RandMs[]>([]);
  const [msMotor, setMsMotor] = useState(true);
  const msMotorRef = useRef(true);
  const [canMod, setCanMod] = useState<CanMod>('lvcan');
  const canModRef = useRef<CanMod>('lvcan');
  const [msRez, setMsRez] = useState<Record<number, RezMs>>({});
  const [msSumar, setMsSumar] = useState('');
  const [msOpt, setMsOpt] = useState<{ aparate: Optiune[]; combustibili: Optiune[] }>({ aparate: [], combustibili: [] });
  const idMsRef = useRef(0);
  // Serverul știe de listă (răspunsul are `masini`). Fără asta telefonul NU trimite lista: una goală ar șterge-o
  // pe cea salvată în ofertă (lotul 3, L5-01 — o salvare ducea lista rămasă de la ALTĂ cerere, sau nimic).
  const areListaRef = useRef(false);
  const [areLista, setAreLista] = useState(false);
  const aplicaRef = useRef(false);          // „Aplică recomandarea" / „Trece în ofertă" pleacă la socoteala următoare
  const aplicaInCursRef = useRef(false);    // …și nu de două ori, la două atingeri repezi
  useEffect(() => () => { viuRef.current = false; clearTimeout(ceasRef.current); }, []);

  function aplica(j: Rasp, tot: boolean) {
    const nou: Record<string, any> = { ...campRef.current };
    Object.keys(j.campuri || {}).forEach((k) => { if (tot || !scriseAcumRef.current.has(k)) nou[k] = j.campuri[k]; });
    campRef.current = nou;
    atinseRef.current = Array.isArray(j.atinse) ? j.atinse : [];
    if (Array.isArray(j.formular)) { const m: Record<string, Meta> = {}; j.formular.forEach((x: Meta) => { m[x.k] = x; }); setMeta(m); }
    resRef.current = j;
    if (!viuRef.current) return;
    setCamp(nou); setRes(j);
  }
  // Ce a scris pagina sub fiecare mașină trimisă, pus pe rândul ei (după id, nu după poziție: între timp omul
  // poate fi adăugat sau scos un rând), cu semnătura de la trimitere — un rând schimbat de atunci arată „caut…".
  function aplicaMs(j: Rasp, trimise: { id: number; sig: string }[]) {
    const m = j && j.masini;
    if (!m || !viuRef.current) return;
    const rez: Record<number, RezMs> = {};
    (Array.isArray(m.randuri) ? m.randuri : []).forEach((x: any, i: number) => {
      const t = trimise[i]; if (!t || !x) return;
      rez[t.id] = { rez: String(x.rez || ''), rec: x.rec ? { aparat: String(x.rec.aparat || ''), et: String(x.rec.et || '') } : null, sig: t.sig };
    });
    setMsRez(rez);
    setMsSumar(String(m.sumar || ''));
    setMsOpt({ aparate: Array.isArray(m.aparate) ? m.aparate : [], combustibili: Array.isArray(m.combustibili) ? m.combustibili : [] });
  }
  const trimiseAcum = () => msRef.current.map((r) => ({ id: r.id, sig: semnMs(r, msMotorRef.current, canModRef.current) }));
  function puneMs(rows: RandMs[]) { msRef.current = rows; setMs(rows); }

  // `pastreaza`: după „Prețurile noastre", o ofertă nouă pornește din lista nouă de prețuri, dar lista mașinilor și
  // comutatorul CAN rămân — ca pe web, unde sunt starea paginii și redesenarea formularului nu le atinge.
  async function porneste(corp: any, pastreaza?: { masini: RandMs[]; motor: boolean; canMod: CanMod }) {
    const gen = ++genRef.current;
    resRef.current = null;
    setErr(''); setCamp(null); setRes(null);
    clearTimeout(ceasRef.current);
    schimbateRef.current = []; scriseAcumRef.current = new Set(); murdarRef.current = false;
    aplicaRef.current = false; areListaRef.current = false; setAreLista(false);
    canModRef.current = 'lvcan'; setCanMod('lvcan');
    setMsRez({}); setMsSumar('');
    try {
      const j = await Api.offerCalc(corp);
      if (gen !== genRef.current) return;
      campRef.current = {};
      aplica(j, true);
      const m = j && j.masini;
      areListaRef.current = !!m; setAreLista(!!m);
      if (!m) { puneMs([]); return; }
      if (pastreaza) {
        puneMs(pastreaza.masini);
        msMotorRef.current = pastreaza.motor; setMsMotor(pastreaza.motor);
        canModRef.current = pastreaza.canMod; setCanMod(pastreaza.canMod);
        aplicaMs(j, []);
        // Cantitățile neatinse se propun pe comutatorul păstrat, ca pe web (`_ofCompleteazaDinVehicule` cu `_ofCanMod`).
        if (pastreaza.canMod === 'fmc150') schimbateRef.current.push('canMod');
        murdarRef.current = true; laCoada();
        return;
      }
      puneMs((Array.isArray(m.lista) ? m.lista : []).map((x: any) => ({
        id: ++idMsRef.current, marca: String(x.marca || ''), model: String(x.model || ''), an: String(x.an || ''),
        combustibil: String(x.combustibil || ''), buc: String(x.buc || '1'), aparat: String(x.aparat || ''),
      })));
      msMotorRef.current = m.motor !== false; setMsMotor(msMotorRef.current);
      const cm: CanMod = j.canMod === 'fmc150' ? 'fmc150' : 'lvcan';
      canModRef.current = cm; setCanMod(cm);
      aplicaMs(j, trimiseAcum());
    } catch (e: any) {
      if (gen !== genRef.current) return;
      setErr(e?.status === 403 ? 'Acces interzis.' : (e?.status === 404 ? 'Oferta nu mai există.' : (e?.message || 'Eroare la încărcare')));
    }
  }
  useEffect(() => { porneste(idOf ? { offer_id: idOf, incarca: true } : { nou: true }); }, [idOf]);

  // O singură socoteală pe drum; următoarea pleacă după ea, cu tot ce s-a mai scris între timp.
  function trimiteAcum(): Promise<any> {
    if (!murdarRef.current || !resRef.current) return Promise.resolve(resRef.current);
    murdarRef.current = false;
    const gen = genRef.current;
    const schimbate = schimbateRef.current.splice(0);
    scriseAcumRef.current = new Set();
    const corp: any = { campuri: { ...campRef.current }, atinse: atinseRef.current.slice(), schimbate, canMod: canModRef.current };
    if (idOf) corp.offer_id = idOf;
    // Lista mașinilor pleacă ÎNTREAGĂ, la fiecare socoteală: pagina de pe server e una singură, a tuturor
    // cererilor, deci nu ține minte nimic de la o cerere la alta.
    let trimise: { id: number; sig: string }[] | null = null;
    if (areListaRef.current) {
      corp.masini = msRef.current.map((r) => ({ marca: r.marca, model: r.model, an: r.an, combustibil: r.combustibil, buc: r.buc, aparat: r.aparat }));
      corp.masiniMotor = msMotorRef.current;
      trimise = trimiseAcum();
    }
    const aplicRec = aplicaRef.current;
    aplicaRef.current = false;
    if (aplicRec) { corp.aplicaRecomandarea = true; aplicaInCursRef.current = true; }
    setLucreaza(true);
    return Api.offerCalc(corp)
      .then((j: Rasp) => {
        if (gen === genRef.current) {
          aplica(j, false);
          if (trimise) aplicaMs(j, trimise);
          if (aplicRec && j && j.mesaj) showToast(j.mesaj);
        }
        return j;
      })
      .catch((e: any) => {
        // Nu s-a socotit: ce s-a scris rămâne de trimis, iar Salvează / PDF nu pleacă cu sume vechi.
        if (gen === genRef.current) { murdarRef.current = true; schimbateRef.current = schimbate.concat(schimbateRef.current.filter((x) => schimbate.indexOf(x) < 0)); }
        showToast('Socoteala nu a mers: ' + (e?.message || 'eroare'), true);
        return null;
      })
      .finally(() => { if (aplicRec) aplicaInCursRef.current = false; if (viuRef.current) setLucreaza(false); });
  }
  function laCoada(): Promise<any> {
    coadaRef.current = coadaRef.current.then(trimiteAcum, trimiteAcum);
    return coadaRef.current;
  }
  function programeaza() {
    clearTimeout(ceasRef.current);
    ceasRef.current = setTimeout(laCoada, 380);
  }
  // Înainte de Salvează / PDF / tarife: tot ce e pe ecran trebuie să fi trecut prin socoteală.
  function proaspat(): Promise<Rasp> {
    clearTimeout(ceasRef.current);
    return laCoada();
  }
  // Omul a scris într-un câmp (sau a bifat): ca un `oninput` pe web.
  function schimba(k: string, v: any, apasat = true) {
    campRef.current = { ...campRef.current, [k]: v };
    setCamp(campRef.current);
    scriseAcumRef.current.add(k);
    if (apasat) { schimbateRef.current = schimbateRef.current.filter((x) => x !== k); schimbateRef.current.push(k); }
    murdarRef.current = true;
    programeaza();
  }
  // Comutatorul CAN de la pasul 4: butonul paginii (`raxOfCanMod`), apăsat de server. Reface cantitățile neatinse
  // și, la lista mașinilor, alege între listele Teltonika la mașinile care sunt pe amândouă.
  function comutaCan(v: any) {
    const m: CanMod = v === 'fmc150' ? 'fmc150' : 'lvcan';
    canModRef.current = m; setCanMod(m);
    schimbateRef.current = schimbateRef.current.filter((x) => x !== 'canMod'); schimbateRef.current.push('canMod');
    murdarRef.current = true;
    proaspat();
  }
  // „Aplică recomandarea în ofertă" (pasul 4) și „Trece în ofertă" (lista mașinilor): același buton al paginii.
  // Pleacă odată cu tot ce e pe ecran, deci recomandarea e cea de ACUM, nu cea de la ultimul răspuns.
  function aplicaRecomandarea() {
    if (aplicaRef.current || aplicaInCursRef.current) return;
    aplicaRef.current = true;
    murdarRef.current = true;
    proaspat();
  }
  // Linkurile și butoanele din textul paginii: „Prețurile noastre", „pune prețul propus" (cu sau fără „scris de
  // mână"), comutatorul CAN și „Aplică recomandarea". Semnele (`data-act`) le pune serverul (`_ofCurat`).
  function laClic(e: any) {
    const t: any = e.target;
    const a = t && t.closest ? t.closest('[data-act]') : null;
    if (!a) return;
    e.preventDefault();
    const act = a.getAttribute('data-act');
    if (act === 'preturi') setPreturi(true);
    else if (act === 'pret') schimba('pAiA', String(a.getAttribute('data-val') || ''), a.getAttribute('data-atins') === '1');
    else if (act === 'canMod') comutaCan(a.getAttribute('data-val'));
    else if (act === 'aplicaRec' && !a.disabled) aplicaRecomandarea();
  }

  // ── „Mașinile clientului": rândurile sunt ale telefonului; potrivirea o face serverul ─────────────────
  function marcheazaMs() { murdarRef.current = true; programeaza(); }
  function campMs(id: number, c: 'marca' | 'model' | 'an' | 'combustibil' | 'buc' | 'aparat', val: string) {
    puneMs(msRef.current.map((r) => (r.id === id ? { ...r, [c]: val } : r)));
    marcheazaMs();
  }
  function adaugaMs() { puneMs(msRef.current.concat([{ id: ++idMsRef.current, ...MS_GOL }])); marcheazaMs(); }
  function scoateMs(id: number) { puneMs(msRef.current.filter((r) => r.id !== id)); marcheazaMs(); }
  function motorMs(v: boolean) { msMotorRef.current = v; setMsMotor(v); marcheazaMs(); }
  function inlocuiesteMs(lista: Omit<RandMs, 'id'>[]) {
    puneMs(lista.map((x) => ({ id: ++idMsRef.current, ...x })));
    murdarRef.current = true; proaspat();
  }
  // O listă Teltonika nouă: serverul a uitat rezultatele vechi, deci le cerem din nou pe toate.
  function listeNoiMs() { setMsRez({}); murdarRef.current = true; proaspat(); }

  async function salveaza() {
    setBusy('salvez');
    try {
      const j = await proaspat();
      if (!j) return;   // socoteala n-a mers: mesajul a apărut deja
      if (!j.salvare) { showToast((j && j.salvareEroare) || 'Oferta nu se poate salva.', true); return; }
      const m = String(j.salvare.url || '').match(/\/(\d+)$/);
      if (j.salvare.metoda === 'PUT' && m) await Api.updateOffer(Number(m[1]), j.salvare.corp);
      else await Api.createOffer(j.salvare.corp);
      showToast(idOf ? 'Ofertă actualizată ✓' : 'Ofertă salvată ✓');
      // Ca pe web: după salvare ajungi la „Oferte salvate", ca să vezi unde a intrat ciorna. Lista ÎNLOCUIEȘTE
      // calculatorul în istoric: „Înapoi" de pe telefon nu te mai duce într-un formular gol de „Ofertă nouă"
      // (ai crede că s-a pierdut oferta, sau ai face-o a doua oară).
      loc.route('/admin/offers', true);
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { if (viuRef.current) setBusy(''); }
  }
  async function descarcaPdf() {
    setBusy('pdf');
    try {
      const j = await proaspat();
      if (!j) return;
      // Când pagina refuză hârtia (ex. aparate închiriate fără chirie), ce ar fi scris ea pe ecran.
      if (!j.hartie) { showToast(j.hartieEroare || 'Oferta nu s-a putut pregăti.', true); return; }
      await salveazaPostDeLaServer('/api/admin/offers/pdf', j.hartie, 'Ofertă.pdf');
      showToast('Oferta s-a descărcat ✓');
    } catch (e: any) { showToast('Descărcarea nu a mers: ' + (e?.message || 'eroare'), true); }
    finally { if (viuRef.current) setBusy(''); }
  }
  async function salveazaTarife() {
    setBusy('tarife');
    try {
      const j = await proaspat();
      if (!j) return;
      if (!j.salvareTarife) { showToast('Tarifele nu s-au putut citi.', true); return; }
      await Api.saveSystemSettings(j.salvareTarife);
      showToast('Tarifele noastre, salvate ✓ — de aici pornesc ofertele viitoare');
      murdarRef.current = true; programeaza();   // propunerile (grila RA Insight) se iau de acum din lista nouă
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { if (viuRef.current) setBusy(''); }
  }
  async function sterge() {
    if (!idOf || !confirm('Ștergi această ofertă?')) return;
    try { await Api.deleteOffer(idOf); showToast('Ofertă ștearsă ✓'); loc.route('/admin/offers', true); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  function ofertaNoua() {
    if (idOf) loc.route('/admin/offers/noua');
    else porneste({ nou: true });
  }
  // „Prețurile noastre" salvate: o ofertă NOUĂ pornește din lista nouă (ca pe web — formularul se redesenează);
  // una deschisă din listă își păstrează prețurile negociate, doar se socotește din nou (cursul, costurile).
  function dupaPreturi() {
    setPreturi(false);
    if (idOf) { murdarRef.current = true; laCoada(); }
    else porneste({ nou: true }, areListaRef.current ? { masini: msRef.current, motor: msMotorRef.current, canMod: canModRef.current } : undefined);
  }
  useInapoiInchide(preturi, () => { setPreturi(false); return true; });

  // ── Câmpurile ─────────────────────────────────────────────────────────────────────────────────────
  const v = (k: string) => (camp && camp[k] != null ? camp[k] : '');
  const ePret = (k: string) => !!(res && res.r && res.r.p && k in res.r.p);
  const nr = (k: string, cls = 'nr', eticheta?: string) => (
    <input class={'of-in ' + cls} inputMode={ePret(k) ? 'decimal' : 'numeric'} value={String(v(k))}
      placeholder={(meta[k] && meta[k].placeholder) || ''} aria-label={eticheta || k}
      onInput={(e: any) => schimba(k, curataNr(e.currentTarget.value))} />
  );
  const txt = (k: string, eticheta: string) => (
    <input class="of-in lat" value={String(v(k))} placeholder={(meta[k] && meta[k].placeholder) || ''} aria-label={eticheta}
      onInput={(e: any) => schimba(k, e.currentTarget.value)} />
  );
  const sel = (k: string, eticheta: string, cls = 'nr') => (
    <select class={'of-in ' + cls} value={String(v(k))} aria-label={eticheta} onChange={(e: any) => schimba(k, e.currentTarget.value)}>
      {((meta[k] && meta[k].optiuni) || []).map((o) => <option value={o.v}>{o.et}</option>)}
    </select>
  );
  const bif = (k: string) => !!(camp && camp[k] === true);
  const comuta = (k: string) => schimba(k, !bif(k));
  const echiv = (k: string) => (res && res.echiv && res.echiv[k]) ? <span class="of-eq">{res.echiv[k]}</span> : null;
  const rand = (et: string, inner: any, hint?: string) => (
    <div class="of-camp"><label>{et}</label><div class="of-lin">{inner}</div>{hint && <div class="of-hint">{hint}</div>}</div>
  );
  const pret = (et: string, k: string, um: string) => rand(et, <>{nr(k, 'nr', et)}<span class="of-um">{um}</span>{echiv(k)}</>);
  // Cantitatea și prețul pe același rând, ca pe web. `hint` = când se folosește lucrarea (pasul 4, ca `cand()` pe web).
  const qp = (et: string, kq: string, kp: string, umq: string, ump: string, hint?: string) => rand(et, <>
    {nr(kq, 'mic', et + ' — cantitate')}<span class="of-um">{umq}</span><span class="of-x">×</span>
    {nr(kp, 'nr', et + ' — preț')}<span class="of-um">{ump}</span>{echiv(kp)}
  </>, hint);
  const inch = v('echipMod') === 'inchiriaza';
  // Lângă chirie: cât ne costă aparatul, sau linkul „trece cât ne costă" (deschide „Prețurile noastre", singurul
  // loc din care se poate propune chiria).
  const ap = (et: string, kq: string, kp: string, kch: string, hint?: string) => rand(et, <>
    {nr(kq, 'mic', et + ' — cantitate')}<span class="of-um">buc</span><span class="of-x">×</span>
    {inch
      ? <>{nr(kch, 'nr', et + ' — chirie')}<span class="of-um">lei/lună</span>
          {res && res.chcost && res.chcost[kch] ? <span class="of-eq" onClick={laClic} dangerouslySetInnerHTML={{ __html: res.chcost[kch] }} /> : null}</>
      : <>{nr(kp, 'nr', et + ' — preț')}<span class="of-um">€/buc</span>{echiv(kp)}</>}
  </>, hint);
  const web = (h: string | undefined, cls = 'of-hintweb') => <div class={cls} onClick={laClic} dangerouslySetInnerHTML={{ __html: h || '' }} />;
  // O funcție, nu un element: același element pus în patru cărți ar fi un singur nod mutat dintr-una în alta.
  const butonTarife = () => (
    <div class="of-tarife">
      <button class="of-b" onClick={salveazaTarife} disabled={!!busy}><Icon name="download" size={16} /> Salvează ca tarifele noastre</button>
      <div class="of-hint">{DE_TARIFE}</div>
    </div>
  );
  const card = (titlu: string, ic: any, desc: string | null, inner: any) => (
    <div class="of-card">
      <div class="of-t"><Icon name={ic} size={15} /> {titlu}</div>
      {desc && <div class="of-d">{desc}</div>}
      {inner}
    </div>
  );
  const tgl = (k: string, et: string, mic?: string) => (
    <div class="of-tgl">
      <span class="lbl">{et}{mic && <small>{mic}</small>}</span>
      <button onClick={() => comuta(k)} role="switch" aria-checked={bif(k)} aria-label={et}><span class={'sw' + (bif(k) ? ' on' : '')} /></button>
    </div>
  );

  const titlu = idOf ? (String((camp && camp.name) || '').trim() || 'Oferta') : 'Ofertă nouă';
  return (
    <div class="screen of-scr">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/admin/offers')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{titlu}</div>
        <button class="h-btn" onClick={() => setPreturi(true)} aria-label="Prețurile noastre"><Icon name="tag" size={20} /></button>
        {idOf && <button class="h-btn" onClick={sterge} aria-label="Șterge oferta" style="color:var(--red)"><Icon name="trash" size={19} /></button>}
      </header>
      <div class="content has-tabbar" style="padding-top:14px;padding-left:16px;padding-right:16px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!camp && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {camp && (<>
          {card('1. Clientul', 'user',
            'Cui trimiți oferta. Numele și CUI-ul ajung pe hârtie; „Nume ofertă" e doar pentru tine, ca s-o găsești în listă — se completează singur, dar poți scrie peste.',
            <>
              {rand('Nume client', txt('cl-name', 'Nume client'))}
              {rand('CUI', txt('cl-cui', 'CUI'))}
              {rand('Contact', txt('cl-contact', 'Contact'))}
              {rand('Nume ofertă', txt('name', 'Nume ofertă'))}
            </>)}

          {/* Între pașii 1 și 2, ca pe web: lista mașinilor completează pasul 2 (și 4, 5) la „Trece în ofertă". */}
          {areLista && (
            <MasiniClient randuri={ms} rez={msRez} motor={msMotor} canMod={canMod} sumar={msSumar}
              aparate={msOpt.aparate} combustibili={msOpt.combustibili}
              onCamp={campMs} onAdauga={adaugaMs} onScoate={scoateMs} onMotor={motorMs}
              onInlocuieste={inlocuiesteMs} onAplica={aplicaRecomandarea} onListeNoi={listeNoiMs} />
          )}

          {card('2. Flota clientului', 'car',
            'De aici pornește tot: abonamentul lunar, cantitățile de montaj, aparatele de cumpărat și prețul unui cont de RA Insight.',
            <>
              {rand('Total vehicule', nr('nveh', 'nr', 'Total vehicule'))}
              {rand('din care cu CAN', nr('ncan', 'nr', 'din care cu CAN'), 'mașini mici — cer modul LV-CAN200')}
              {rand('din care cu FMS', nr('nfms', 'nr', 'din care cu FMS'), 'camioane — citim direct, fără modul')}
              {/* „Ce recomanzi" — doar pentru noi, nu ajunge pe hârtie. Scris de pagină (`_ofSfatFlota`). */}
              {web(res && res.html && res.html.sfatFlota, 'of-sfat')}
              <details class="of-intrebari">
                <summary>Întrebări de pus clientului înainte de ofertă</summary>
                <ol>
                  <li>Ce mașini are — marca, modelul, anul? (citirea CAN se verifică pe model)</li>
                  <li>Vrea să vadă consumul real și ce e în rezervor, sau doar unde sunt mașinile?</li>
                  <li>Are camioane cu tahograf digital? Cine descarcă acum cardurile și tahografele?</li>
                  <li>Face transport internațional sau mărfuri cu risc fiscal? (e-Transport)</li>
                  <li>Mașinile sunt în garanție? (atunci citim CAN-ul fără tăiat fire)</li>
                  <li>Unde se face montajul și câte mașini pot sta în aceeași zi? (deplasarea, programarea în loturi)</li>
                  <li>Vrea să știe cine conduce fiecare mașină sau să blocheze pornirea de la distanță? (accesorii — încă nu au rând de preț; se trec la pasul 6)</li>
                </ol>
              </details>
              <div class="of-hint" style="line-height:1.55">
                <b>CAN și FMS înseamnă același lucru — date din mașină (combustibil, kilometri, motor). Diferă de unde le luăm:</b><br />
                • <b>FMS</b> = priza standard de camion. O au din fabrică, aparatul citește direct, <b>fără modul în plus</b>.<br />
                • <b>CAN</b> = mașini mici și utilitare, care n-au FMS. Cer un <b>modul LV-CAN200</b>, cumpărat și montat separat.<br />
                De-aia fiecare mașină are „Instalare GPS", iar cea cu CAN sau FMS mai are o linie de montaj deasupra — munca în plus.
              </div>
              <div class="of-hint" style="margin-top:6px">Montajul și echipamentele de mai jos se completează singure din numerele astea. Dacă scrii tu altceva acolo, rămâne ce ai scris.</div>
              <div class="of-sub">Cât costă o mașină pe lună</div>
              {pret('Fără CAN', 'pPlain', 'lei/lună')}
              {pret('Cu CAN', 'pCan', 'lei/lună')}
              {pret('Cu FMS (camion)', 'pFms', 'lei/lună')}
              <div class="of-hint">Tahograful și e-Transportul, dacă le bifezi la pasul 3, se adaugă peste prețurile astea — nu ca linie separată pe factură.</div>
              {butonTarife()}
            </>)}

          {card('3. Ce mai primește clientul', 'puzzle',
            'Tahograful și e-Transportul intră în abonamentul fiecărei mașini, nu ca linie separată. RA Insight se vinde pe cont, iar întrebările conturilor intră într-un fond comun al firmei.',
            <>
              {tgl('aiA', 'RA Insight')}
              <div class="of-lin" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">{nr('pAiA', 'nr', 'RA Insight — preț pe cont')}<span class="of-um">lei/cont</span>{echiv('pAiA')}</div>
              {web(res && res.html && res.html.aiA)}
              {res && res.arata && res.arata.aiq && (
                <div class="of-q">
                  <div class="of-q2">
                    <div><label>Conturi</label>{nr('aiqSeats', 'nr', 'Conturi')}</div>
                    <div><label>Întrebări / cont</label>{sel('aiqN', 'Întrebări pe cont', 'lat')}</div>
                  </div>
                  {web(res.html && res.html.aiqCost, 'of-web')}
                </div>
              )}
              {tgl('tahograf', 'Modul Tahograf', '(analiză .DDD)')}
              <div class="of-lin" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">{nr('pTahograf', 'nr', 'Tahograf — preț pe vehicul')}<span class="of-um">lei/vehicul</span>{echiv('pTahograf')}</div>
              {web(res && res.html && res.html.tahograf)}
              {tgl('etransport', 'Modul e-Transport', '(coduri UIT, ANAF)')}
              <div class="of-lin" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">{nr('pEtransport', 'nr', 'e-Transport — preț pe vehicul')}<span class="of-um">lei/vehicul</span>{echiv('pEtransport')}</div>
              {web(res && res.html && res.html.etransport)}
              <div class="of-agenti">
                <button onClick={() => comuta('agenti')} role="switch" aria-checked={bif('agenti')} aria-label="Cei 6 agenți automați" style="background:none;border:none;padding:2px 0">
                  <span class={'sw' + (bif('agenti') ? ' on' : '')} />
                </button>
                <span><b>Cei 6 agenți automați — incluși, 0 lei</b>
                  <small>RA Watch (offline, furt combustibil, ralanti) · RA Dispatch (vehicule disponibile) · RA Care (ITP, RCA, revizii) · RA Optimize (eco-driving) · RA Compliance (ore de condus) · RA Client (raport zilnic). Merg pe reguli fixe, nu ne costă nimic — dar clientul trebuie să știe că le primește.</small>
                </span>
              </div>
              {rand('Păstrare date', <>{sel('ret', 'Păstrare date', 'lat')}</>)}
              {res && res.arata && res.arata.retCustom && rand('Câte luni', <>{nr('retcustom-m', 'nr', 'Luni de păstrare')}<span class="of-um">luni</span></>)}
              {rand('Durată contract', <>{nr('contract', 'nr', 'Durată contract')}<span class="of-um">luni</span></>)}
              <div class="of-sub">Cât costă păstrarea datelor, pe lună</div>
              {/* 12 luni sunt incluse pentru toți (24.09), deci n-au preț de scris — ca pe web. */}
              {pret('24 de luni', 'ret24', 'lei/lună')}
              {pret('36 de luni', 'ret36', 'lei/lună')}
              {pret('Alt număr de luni', 'retCustom', 'lei/lună')}
              <div class="of-hint">Primele 12 luni sunt incluse pentru toți. Se adaugă doar tariful treptei alese mai sus — un preț pe firmă, nu pe mașină. După semnare, aplicația păstrează exact cât scrie aici.</div>
              {butonTarife()}
            </>)}

          {card('4. Montajul', 'wrench',
            'Manopera, plătită o singură dată. Cantitățile se completează singure din flotă. Noi o facturăm clientului; cu instalatorul ne socotim separat, în fișa de montaj a firmei.',
            <>
              {/* „Recomandarea pentru flota asta" (Recomandat / În ofertă), cu comutatorul CAN și „Aplică recomandarea". */}
              {web(res && res.html && res.html.sfatMontaj, 'of-sfat')}
              {qp('Instalare dispozitiv GPS', 'qGps', 'mGps', 'buc', 'lei/buc', 'La fiecare vehicul: aparatul, alimentarea, antenele, montaj ascuns și proba de transmisie.')}
              {qp('Instalare LV-CAN', 'qLvCan', 'mLvCan', 'buc', 'lei/buc', 'La mașinile cu CAN citit prin modulul LV-CAN200 (cu FMC130).')}
              {qp('Instalare CAN încorporat', 'qCanInc', 'mCanInc', 'buc', 'lei/buc', 'La mașinile cu FMC150 (CAN integrat): legarea aparatului la magistrala mașinii.')}
              {qp('Instalare FMS (tahograf)', 'qFms', 'mFms', 'buc', 'lei/buc', 'La camioanele cu FMC650: legarea la priza FMS a camionului.')}
              {qp('Dezinstalare echipament', 'qUninstall', 'mUninstall', 'buc', 'lei/buc', 'Doar când scoatem aparate vechi — de la alt furnizor sau mutate de pe altă mașină.')}
              {qp('Înlocuire echipament', 'qReplace', 'mReplace', 'buc', 'lei/buc', 'Aparat defect sau schimbare de model: o intervenție pe o mașină deja montată.')}
              {qp('Deplasare', 'kmTravel', 'mTravel', 'km', 'lei/km', 'Km dus-întors până la client, când montajul nu e în orașul instalatorului. La flote mari, programează montajul în loturi, la sediul clientului: cam 30–40 de minute pe mașină.')}
              <div class="of-hint" style="line-height:1.55">
                <b>Fiecare mașină are „Instalare dispozitiv GPS" — treaba de bază.</b> Cea cu CAN sau cu FMS mai are un rând
                deasupra: munca în plus (modulul LV-CAN legat la magistrală, respectiv priza de tahograf). Nu e aceeași
                manoperă plătită de două ori, sunt două operațiuni.
              </div>
              {butonTarife()}
            </>)}

          {card('5. Aparatele', 'cpu',
            'Clientul le cumpără (plătește o dată) sau le închiriază (plătește lunar, iar aparatele rămân ale noastre).',
            <>
              <div class="of-seg">
                <button class={'of-b' + (!inch ? ' pri' : '')} onClick={() => schimba('echipMod', 'cumpara')} aria-pressed={!inch}><Icon name="tag" size={16} /> Clientul cumpără</button>
                <button class={'of-b' + (inch ? ' pri' : '')} onClick={() => schimba('echipMod', 'inchiriaza')} aria-pressed={inch}><Icon name="key" size={16} /> Clientul închiriază</button>
              </div>
              {ap('Teltonika FMC130', 'dq130', 'dFmc130', 'chFmc130')}
              {ap('Teltonika FMC150', 'dq150', 'dFmc150', 'chFmc150')}
              {ap('Teltonika FMC650', 'dq650', 'dFmc650', 'chFmc650')}
              {ap('Modul LV-CAN200', 'dqLvCan', 'dLvCan', 'chLvCan', 'extra, la FMC130/650')}
              {inch && web(res && res.html && res.html.chirieHint)}
              {butonTarife()}
            </>)}

          {card('6. Observații', 'edit', null,
            <>
              <textarea class="of-in" value={String(v('notes'))} placeholder={(meta.notes && meta.notes.placeholder) || ''} aria-label="Observații"
                onInput={(e: any) => schimba('notes', e.currentTarget.value)} />
              <div class="of-hint">Prima frază se scrie singură, din termenul ofertei. Scrie peste ea dacă vrei altceva.</div>
            </>)}

          <div class="of-rez">
            <div class="of-t"><Icon name="report" size={15} /> Rezumatul ofertei
              {lucreaza && <span class="of-rec" style="margin-left:auto"><span class="spin" style="width:14px;height:14px;border-width:2px" /> se socotește</span>}
            </div>
            {web(res && res.html && res.html.rezumat, 'of-web')}
            <div class="of-act">
              <button class="of-b pri" onClick={salveaza} disabled={!!busy}><Icon name="check" size={17} /> {busy === 'salvez' ? 'Se salvează…' : (idOf ? 'Actualizează oferta' : 'Salvează oferta')}</button>
              <button class="of-b" onClick={descarcaPdf} disabled={!!busy}><Icon name="download" size={17} /> {busy === 'pdf' ? 'Se pregătește…' : 'Descarcă oferta (PDF)'}</button>
              <button class="of-b" onClick={ofertaNoua} disabled={!!busy}><Icon name="refresh" size={17} /> Ofertă nouă</button>
            </div>
            <div class="of-hint" style="margin-top:9px">
              Oferta salvată intră în „Oferte salvate", ca <b>Ciornă</b> — te ducem acolo după ce salvezi. PDF-ul îl trimiți tu,
              de pe mailul tău: clientul nu e încă la noi. Telefonul îl deschide în foaia de partajare, de unde îl salvezi sau îl trimiți.
            </div>
          </div>
        </>)}
      </div>
      {preturi && <OurPrices peste onInchide={() => setPreturi(false)} onSalvat={dupaPreturi} />}
    </div>
  );
}
