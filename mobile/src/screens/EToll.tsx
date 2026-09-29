import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { raCauta } from '../lib/format';
import { dRo, nr, km1, RezultatCost, GrilaTarife, NotaInVigoare, HartaCursa } from './etollCommon';
import { areFlota, FaraDreptFlota } from './modulGarda';
import './admin.css';
import './detail.css'; // .sheet*
import './tollro.css';
import './tacho.css'; // .th-up* — blocul care se desface („Vreau să introduc eu kilometrii")
import './etoll.css';

// TollRo — taxa rutieră pe kilometru pentru marfă peste 3,5 t. Același ecran ca pe web (openEtollDemo,
// public/js/demo-modules-ui.js), pe o coloană:
//   • „O cursă nouă" (implicit) — cât te va costa un drum pe care încă nu l-ai făcut: alegi mașina și
//     două adrese, serverul face traseul și îl colorează pe tipuri de drum.
//   • „Ce a costat până acum" — toată flota, pe o perioadă, cea mai scumpă mașină prima.
//
// Vehiculul se ALEGE DIN FLOTĂ, iar profilul de taxare vine de la server, din fișa lui. Cine plătește și
// de ce (autoturism, remorcă, utilaj, sub 3,5 t, fără masă) stă O SINGURĂ DATĂ, în tollro.js; telefonul
// citește `aplicabil` + `motiv` din /api/tollro/flota și nu judecă nimic singur.
//
// Grila de tarife se vede aici, dar se EDITEAZĂ doar din web (super-admin): 24 de câmpuri de bani pe un
// ecran de telefon sunt o invitație la greșeli. Excepție de paritate asumată — vezi jurnalul.

type Cost = { stare: 'asteapta' | 'lucreaza' | 'gata' | 'eroare'; total?: number; linii?: any[]; kmTaxati?: number; nuSaMiscat?: boolean; err?: string; brut?: any };
type Adresa = { label: string; lat: number; lng: number };

export function EToll() {
  // Pe web modulul stă în „Management", pe care îl vede doar cine poate modifica flota.
  if (!areFlota()) return <FaraDreptFlota titlu="Taxa de drum (TollRo)" />;
  return <ETollEcran />;
}

function ETollEcran() {
  const [cfg, setCfg] = useState<any>(null);
  const [flota, setFlota] = useState<any>(undefined); // undefined = se încarcă; null = n-a mers
  const [rutare, setRutare] = useState<{ pornit: boolean; motiv?: string | null; deProba?: boolean } | null>(null);
  const [fila, setFila] = useState<'cursa' | 'flota'>('cursa');

  useEffect(() => {
    Api.tollroConfig().then(setCfg).catch(() => setCfg(null));
    Api.tollroFlota().then(setFlota).catch(() => setFlota(null));
    Api.tollroRutare().then(setRutare).catch(() => setRutare({ pornit: false }));
  }, []);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Taxa de drum</div>
        {cfg?.grila && <span class="tr-din">din {dRo(cfg.grila.aplicabilDin)}</span>}
      </header>

      <div class="content has-tabbar" style="padding:0 14px 96px">
        {/* Două întrebări diferite, două file: „cât mă va costa" (dispecerul care dă un preț, de zece ori pe
            zi — de aceea e implicită) și „cât m-a costat" (o dată pe lună). */}
        <div class="trf-file">
          <button class={'trf-fila' + (fila === 'cursa' ? ' on' : '')} onClick={() => setFila('cursa')}><Icon name="route" size={15} /> O cursă nouă</button>
          <button class={'trf-fila' + (fila === 'flota' ? ' on' : '')} onClick={() => setFila('flota')}><Icon name="clock" size={15} /> Ce a costat până acum</button>
        </div>
        {/* Amândouă filele rămân montate: calculul flotei merge mai departe (și nu se pierde) cât timp omul
            se uită la o cursă, exact ca pe web. */}
        <div style={fila === 'cursa' ? undefined : 'display:none'}><FilaCursa cfg={cfg} flota={flota} rutare={rutare} /></div>
        <div style={fila === 'flota' ? undefined : 'display:none'}><FilaFlota cfg={cfg} flota={flota} /></div>
      </div>
    </div>
  );
}

// ═══ „Ce a costat până acum" — toată flota, ordonată după cost ═══════════════════════════════════════
// Costurile NU vin într-un singur răspuns: tipul drumului se află de la OpenStreetMap, care acceptă o cerere
// pe secundă. Cerem mașină cu mașină și umplem lista pe măsură ce vin; se poate opri la jumătate.
function FilaFlota({ cfg, flota }: { cfg: any; flota: any }) {
  const azi = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [pana, setPana] = useState(azi);
  const [costuri, setCosturi] = useState<Record<string, Cost>>({});
  const [lucreaza, setLucreaza] = useState(false);
  const [deschis, setDeschis] = useState<any>(null); // rândul apăsat → foaia cu detaliul
  const opreste = useRef(false);
  const viu = useRef(true);
  useEffect(() => () => { viu.current = false; opreste.current = true; }, []);

  const vehicule: any[] = (flota && flota.vehicule) || [];
  const taxabile = vehicule.filter((x) => x.aplicabil);
  const restul = vehicule.filter((x) => !x.aplicabil);
  // Nicio mașină care să intre la taxă → butonul n-are ce calcula. Stins, cu motivul scris: altfel omul îl
  // apasă, primește o eroare și crede că aplicația e stricată.
  const nimicDeCalculat = !!(flota && flota.sumar && flota.sumar.taxabile === 0);

  async function calculeaza() {
    if (lucreaza) { opreste.current = true; return; }
    if (!flota) return;
    if (!de || !pana) { showToast('Alege intervalul', true); return; }
    if (de > pana) { showToast('„De la" e după „Până la" — alege intervalul din nou', true); return; }
    if (!taxabile.length) { showToast('Niciun vehicul cu taxă pe kilometru în flotă', true); return; }
    opreste.current = false;
    setLucreaza(true);
    let c: Record<string, Cost> = {};
    taxabile.forEach((x) => { c[x.imei] = { stare: 'asteapta' }; });
    setCosturi(c);
    for (const v of taxabile) {
      if (opreste.current) break;
      c = { ...c, [v.imei]: { stare: 'lucreaza' } };
      setCosturi(c);
      let r: any;
      try { r = await Api.tollroDinIstoric(v.imei, de + 'T00:00:00', pana + 'T23:59:59'); }
      catch (e: any) { r = { error: (e && e.message) || 'eroare de rețea' }; }
      if (!viu.current) return;
      let cost: Cost;
      if (r && r.rezultat && r.rezultat.aplicabil) {
        const z = r.rezultat;
        cost = { stare: 'gata', total: z.total, linii: z.linii, kmTaxati: z.linii.reduce((a: number, l: any) => a + (l.taxabil ? l.km : 0), 0), brut: r };
      } else {
        // „Nu s-a mișcat" nu e o eroare: e un cost de zero și trebuie să se vadă ca atare.
        const msg = (r && r.error) || (r && r.rezultat && r.rezultat.motiv) || 'nu s-a putut calcula';
        cost = /nu există traseu|aproape nu s-a deplasat/i.test(msg)
          ? { stare: 'gata', total: 0, linii: [], kmTaxati: 0, nuSaMiscat: true }
          : { stare: 'eroare', err: msg };
      }
      c = { ...c, [v.imei]: cost };
      setCosturi(c);
    }
    if (viu.current) setLucreaza(false);
  }

  const gata = taxabile.filter((x) => costuri[x.imei] && costuri[x.imei].stare === 'gata');
  const total = gata.reduce((a, x) => a + (costuri[x.imei].total || 0), 0);
  const kmTaxati = gata.reduce((a, x) => a + (costuri[x.imei].kmTaxati || 0), 0);
  const inLucru = taxabile.length - gata.length;
  // Cele calculate, de la cea mai scumpă; apoi cele care încă așteaptă, în ordinea flotei.
  const calc = gata.slice().sort((a, b) => (costuri[b.imei].total || 0) - (costuri[a.imei].total || 0));
  const restante = taxabile.filter((x) => !costuri[x.imei] || costuri[x.imei].stare !== 'gata');

  function rand(v: any) {
    const c = costuri[v.imei];
    const sub = [v.model, v.categorieEticheta, v.euroCunoscut ? v.euroEticheta : null].filter(Boolean).join(' · ');
    let dr: any;
    if (!v.aplicabil) dr = <b class="pal">—</b>;
    else if (!c || c.stare === 'asteapta') dr = <><b class="pal">—</b><span>necalculat</span></>;
    else if (c.stare === 'lucreaza') dr = <><b class="pal"><span class="spin" style="display:inline-block;width:15px;height:15px;border-width:2px;vertical-align:-2px" /></b><span>se calculează</span></>;
    else if (c.stare === 'eroare') dr = <><b class="pal">—</b><span class="rosu">{c.err || 'eroare'}</span></>;
    else dr = <><b>{nr(c.total)}</b><span>lei</span></>;
    // Bara arată din CE se compune costul (autostradă / drum național), nu cât e față de altă mașină.
    const bara = c && c.stare === 'gata' && (c.total || 0) > 0
      ? <div class="tr-bara">{(c.linii || []).filter((l: any) => l.taxabil && l.cost > 0).map((l: any) => <i style={`width:${Math.round((l.cost / (c.total || 1)) * 100)}%;background:${l.culoare}`} />)}</div>
      : null;
    const stanga = (
      <div class="tr-r-l">
        <b>{v.numar || v.nume || v.imei}</b>
        {sub && <span>{sub}</span>}
        {/* Motivul e o FRAZĂ, sub numele mașinii — la o flotă fără camioane e singura informație de pe ecran. */}
        {!v.aplicabil && v.motiv && <span class="tr-motiv">{v.motiv}</span>}
        {bara}
      </div>
    );
    // Doar rândurile care intră la taxă se deschid: unui Logan nu i se cere masa, unei remorci nu i se face calcul.
    return v.aplicabil
      ? <button class="tr-rand" onClick={() => setDeschis(v)}>{stanga}<div class="tr-r-r">{dr}</div><Icon name="chevronR" size={16} color="var(--text-muted)" /></button>
      : <div class="tr-rand gri">{stanga}<div class="tr-r-r">{dr}</div></div>;
  }

  return (
    <>
      <div class="pf-card">
        <div class="tr-linii2" style="margin-top:0">
          <label class="tr-lb">De la<input type="date" value={de} max={azi} disabled={nimicDeCalculat || lucreaza} onInput={(e) => setDe((e.target as HTMLInputElement).value)} /></label>
          <label class="tr-lb">Până la<input type="date" value={pana} max={azi} disabled={nimicDeCalculat || lucreaza} onInput={(e) => setPana((e.target as HTMLInputElement).value)} /></label>
        </div>
        <button class={'trf-go' + (lucreaza ? ' stop' : '')} disabled={nimicDeCalculat || !flota} onClick={calculeaza}>
          {lucreaza ? <><Icon name="x" size={16} /> Oprește</> : <><Icon name="coins" size={16} /> Calculează toată flota</>}
        </button>
        <div class="tr-mic">
          {nimicDeCalculat
            ? 'Nu e nimic de calculat: niciun vehicul din flotă nu intră la taxa pe kilometru.'
            : 'Luăm traseul real al fiecărei mașini și, pentru fiecare bucată de drum, aflăm din OpenStreetMap ce fel de drum e. Maxim 8 zile odată.'}
        </div>
      </div>

      <div class="pf-card">
        {flota === undefined ? <div class="spin" style="margin:14px auto" />
          : !flota ? <><div class="tr-h">Flota</div><div class="tr-nota rosu">Nu s-a putut citi lista vehiculelor.</div></>
          : !vehicule.length ? <><div class="tr-h">Flota</div><div class="tr-mic">Niciun vehicul în flotă.</div></>
          : (
            <>
              <div class="tr-h">Ce a costat până acum <span class="tr-mic" style="display:inline;margin-left:4px;font-weight:600">· {flota.sumar.taxabile} cu taxă pe km, {flota.sumar.neaplicabile} fără</span></div>
              <div class="trf-explic">Cât te-a costat taxa de drum pentru <b>drumurile deja făcute</b>, în perioada aleasă sus. Kilometrii sunt cei reali, din traseul fiecărei mașini — nu o estimare.</div>
              {!taxabile.length ? (
                <div class="tr-empty">
                  <Icon name="route" size={30} color="var(--text-muted)" />
                  <b>Nicio mașină din flotă nu intră la taxa pe kilometru</b>
                  <span>Taxa se plătește doar pentru transportul de marfă peste 3,5 t — camioane, autotractoare, autobuze. Autoturismele și vehiculele ușoare plătesc rovinietă, ca până acum.</span>
                </div>
              ) : (
                <>
                  {/* „Până acum" cât timp mai sunt mașini în lucru: un total care încă se mișcă, citit ca
                      definitiv, ajunge într-o ofertă greșită. */}
                  {gata.length > 0 && (
                    <div class="tr-tot">
                      <div class="tr-tot-s">{nr(total)}<span>lei</span></div>
                      <div class="tr-tot-b">{inLucru ? `până acum · ${gata.length} din ${taxabile.length} vehicule` : `${gata.length} vehicule`} · {km1(kmTaxati)} km pe drum cu taxă</div>
                    </div>
                  )}
                  {!flota.inVigoare && <NotaInVigoare din={flota.aplicabilDin} />}
                  <div style="margin-top:10px">{calc.map(rand)}{restante.map(rand)}</div>
                </>
              )}
              {restul.length > 0 && (
                <>
                  <div class="tr-gh">{taxabile.length ? 'Fără taxă pe kilometru' : 'Vehiculele tale'}</div>
                  {restul.map(rand)}
                </>
              )}
            </>
          )}
      </div>

      {cfg?.grila && <GrilaTarife cfg={cfg} />}

      {deschis && <DetaliuVehicul v={deschis} cost={costuri[deschis.imei]} onClose={() => setDeschis(null)} />}
    </>
  );
}

// Detaliul unei mașini din listă: fișa ei, defalcarea costului și „Vreau să introduc eu kilometrii".
// Se deschide doar pentru mașinile care intră la taxă (`aplicabil` din /api/tollro/flota).
function DetaliuVehicul({ v, cost, onClose }: { v: any; cost?: Cost; onClose: () => void }) {
  const [prof, setProf] = useState<any>(undefined);
  const [mMasa, setMMasa] = useState(''), [mAxe, setMAxe] = useState('');
  const [salvez, setSalvez] = useState(false);
  const [manualDeschis, setManualDeschis] = useState(false);
  const [kmA, setKmA] = useState(''), [kmN, setKmN] = useState(''), [kmX, setKmX] = useState('');
  const [rezManual, setRezManual] = useState<any>(null);
  const [calc, setCalc] = useState(false);
  const poateEdita = !!(me.value?.isSuper || me.value?.permissions?.manageFleet);

  function incarca() {
    // Profilul vine de la SERVER, din fișă: pe ecran scrie exact ce stă la baza calculului.
    Api.tollroProfil(v.imei).then((r) => setProf(r && r.vehicul ? r : { error: (r && r.error) || 'Nu s-a putut citi fișa vehiculului' }))
      .catch((e: any) => setProf({ error: e?.message || 'Nu s-a putut citi fișa vehiculului' }));
  }
  useEffect(incarca, [v.imei]);

  // Ce se scrie de mână pentru câmpurile care LIPSESC din fișă. Nu se salvează singur — pentru asta e
  // butonul; iar dacă fișa are deja valoarea, serverul ignoră completarea (fișa e adevărul).
  const manual = () => ({ masaKg: parseFloat(mMasa) || undefined, axe: parseFloat(mAxe) || undefined });

  async function salveazaInFisa() {
    const b: any = {};
    if (parseFloat(mMasa) > 0) b.masaKg = parseFloat(mMasa);
    if (parseFloat(mAxe) > 0) b.axe = parseFloat(mAxe);
    if (!b.masaKg && !b.axe) { showToast('Completează întâi valorile', true); return; }
    setSalvez(true);
    try {
      await Api.tollroSalveazaProfil(v.imei, b);
      showToast('Salvat în fișa vehiculului');
      setMMasa(''); setMAxe('');
      incarca();
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut salva', true); }
    finally { setSalvez(false); }
  }

  async function calcManual() {
    setCalc(true);
    try { setRezManual(await Api.tollroEstimate(v.imei, { autostrada: parseFloat(kmA) || 0, national: parseFloat(kmN) || 0, alte: parseFloat(kmX) || 0 }, manual())); }
    catch (e: any) { setRezManual({ error: e?.message || 'Eroare la calcul' }); }
    finally { setCalc(false); }
  }

  const d = prof && prof.vehicul, inc = prof && prof.incadrare;
  const masa = d?.masaKg || null;

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="truck" size={18} color="var(--accent)" /> {v.numar || v.nume || v.imei}</b><button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="tr-h">Detalii vehicul</div>
          {prof === undefined && <div class="spin" style="margin:10px auto" />}
          {prof && prof.error && <div class="tr-nota rosu">{prof.error}</div>}
          {d && (
            <>
              <div class="tr-profil">
                <div class="tr-f"><span>Număr</span><b class={d.numar ? '' : 'gol'}>{d.numar || '—'}</b></div>
                <div class="tr-f"><span>VIN</span><b class={d.vin ? '' : 'gol'}>{d.vin || '—'}</b></div>
                {masa
                  ? <div class="tr-f"><span>MTMA</span><b>{(masa / 1000).toLocaleString('ro-RO')} t</b></div>
                  : <div class="tr-f edit"><span>MTMA (kg) ✎</span><input type="number" inputMode="numeric" min="500" max="100000" placeholder="ex. 30000" value={mMasa} onInput={(e) => setMMasa((e.target as HTMLInputElement).value)} /></div>}
                {d.axe
                  ? <div class="tr-f"><span>Axe</span><b>{d.axe}</b></div>
                  : <div class="tr-f edit"><span>Axe ✎</span><input type="number" inputMode="numeric" min="2" max="12" placeholder="ex. 4" value={mAxe} onInput={(e) => setMAxe((e.target as HTMLInputElement).value)} /></div>}
                <div class="tr-f"><span>Normă</span><b class={d.euro ? '' : 'gol'}>{d.euro || '—'}</b></div>
              </div>
              {inc && <div class="tr-nota verde">Se taxează cu <b>{nr(inc.leiPerKm.autostrada)} lei/km</b> pe autostradă și <b>{nr(inc.leiPerKm.national)} lei/km</b> pe drum național.{inc.euroCunoscut ? '' : ' (normă necunoscută → tarif maxim)'}</div>}
              {(!masa || !d.axe) && (
                <div class="tr-nota galben">
                  {!masa && !d.axe ? 'Masa și numărul de axe lipsesc' : (!masa ? 'Masa maximă autorizată lipsește' : 'Numărul de axe lipsește')} din fișa vehiculului — completează-le mai sus ca să poți calcula.
                  {poateEdita && <button class="btn tr-salv" disabled={salvez} onClick={salveazaInFisa}>{salvez ? 'Se salvează…' : 'Salvează în fișă'}</button>}
                </div>
              )}
              {!d.euro && <div class="tr-nota galben">Norma de poluare lipsește din fișă — calculăm la tariful maxim. Se completează din fișa vehiculului.</div>}
              {(d.axe || mAxe) && <div class="tr-mic">Numărul de axe nu schimbă suma: grila publicată diferențiază doar după masă și normă Euro. Îl păstrăm pentru cazul în care ordonanța finală îl va folosi.</div>}
            </>
          )}

          <div style="margin-top:14px">
            {rezManual
              ? <RezultatCost rez={rezManual} />
              : cost && cost.stare === 'gata' && cost.brut
                ? <RezultatCost rez={cost.brut} atribuire={cost.brut.atribuire} />
                : cost && cost.nuSaMiscat
                  ? <div class="tr-mic">Vehiculul nu s-a deplasat în intervalul ales — zero kilometri taxabili.</div>
                  : cost && cost.stare === 'eroare'
                    ? <div class="tr-nota rosu">{cost.err}</div>
                    : cost && cost.stare === 'lucreaza'
                      ? <div class="tr-mic">Se calculează costul pentru mașina asta…</div>
                      : cost && cost.stare === 'asteapta'
                        ? <div class="tr-mic">Mașina își așteaptă rândul la calcul.</div>
                        : <div class="tr-mic">Apasă „Calculează toată flota" ca să vezi cât a costat în perioada aleasă — sau scrie tu kilometrii, mai jos.</div>}
          </div>

          <div class="th-up" style="margin-top:14px">
            <button class="th-up-h" onClick={() => setManualDeschis(!manualDeschis)}>
              <Icon name="edit" size={16} color="var(--accent)" />
              <span>Vreau să introduc eu kilometrii</span>
              <span class={'th-up-ch' + (manualDeschis ? ' on' : '')}><Icon name="chevronR" size={16} color="var(--text-muted)" /></span>
            </button>
            {manualDeschis && (
              <div class="th-up-b">
                <div class="tr-linii2" style="margin-top:0">
                  <label class="tr-lb">Autostradă / expres (km)<input type="number" inputMode="decimal" min="0" step="0.1" placeholder="0" value={kmA} onInput={(e) => setKmA((e.target as HTMLInputElement).value)} /></label>
                  <label class="tr-lb">Drum național (km)<input type="number" inputMode="decimal" min="0" step="0.1" placeholder="0" value={kmN} onInput={(e) => setKmN((e.target as HTMLInputElement).value)} /></label>
                  <label class="tr-lb">Alte drumuri (km)<input type="number" inputMode="decimal" min="0" step="0.1" placeholder="0" value={kmX} onInput={(e) => setKmX((e.target as HTMLInputElement).value)} /></label>
                </div>
                <button class="btn btn-primary tr-act" disabled={calc} onClick={calcManual}>{calc ? 'Se calculează…' : 'Calculează'}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ „O cursă nouă" ═══════════════════════════════════════════════════════════════════════════════
// Omul alege TREI lucruri: mașina, de unde, până unde. Restul (serie de șasiu, masă, axe, normă, treaptă)
// vine din fișa vehiculului și NU se poate atinge de aici — pe ecranul concurenței, un camion de 41 t putea
// fi încadrat „3,5–7,5 t" în același formular, iar costul ieșea de trei ori mai mic.
function FilaCursa({ cfg, flota, rutare }: { cfg: any; flota: any; rutare: { pornit: boolean; motiv?: string | null; deProba?: boolean } | null }) {
  const [q, setQ] = useState('');
  const [imei, setImei] = useState('');
  const [prof, setProf] = useState<any>(null);
  const [profLoad, setProfLoad] = useState(false);
  const [start, setStart] = useState<Adresa | null>(null);
  const [end, setEnd] = useState<Adresa | null>(null);
  const [rez, setRez] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; rosu?: boolean } | null>(null);
  const pornit = !!(rutare && rutare.pornit);

  const toate: any[] = (flota && flota.vehicule) || [];
  const lista = toate.filter((v) => raCauta(q, v.numar, v.nume, v.model));
  const rand = toate.find((v) => v.imei === imei) || null;

  const cerut = useRef('');
  async function alege(i: string) {
    cerut.current = i;
    setImei(i); setProf(null); setRez(null); setMsg(null); setProfLoad(true);
    // Profilul vine de la SERVER, din fișă — dacă l-am lua din lista încărcată, cele două s-ar putea
    // despărți tăcut. Aici se afișează bani.
    let r: any = null;
    try { r = await Api.tollroProfil(i); } catch { r = null; }
    if (cerut.current !== i) return; // între timp s-a ales altă mașină
    setProf(r && r.vehicul ? r : null);
    setProfLoad(false);
  }

  async function calculeaza() {
    if (!imei) { setMsg({ t: 'Alege întâi vehiculul.', rosu: true }); return; }
    if (!start || !end) { setMsg({ t: 'Alege plecarea și destinația din sugestii — nu e destul să le scrii.', rosu: true }); return; }
    setBusy(true); setRez(null);
    setMsg({ t: 'Cerem traseul și aflăm din hartă ce fel de drum e fiecare bucată…' });
    try {
      const r = await Api.tollroCursa(imei, { lat: start.lat, lng: start.lng }, { lat: end.lat, lng: end.lng });
      if (!r || r.error) { setMsg({ t: (r && r.error) || 'Nu s-a putut calcula.', rosu: true }); return; }
      setMsg(null); setRez(r);
    } catch (e: any) { setMsg({ t: e?.message || 'Eroare de rețea', rosu: true }); }
    finally { setBusy(false); }
  }

  const d = prof && prof.vehicul, inc = prof && prof.incadrare;
  // `aplicabil` / `motiv` vin din lista flotei (tollro.js): profilul singur socotește treapta doar din masă și
  // ar da „Se taxează" și unei remorci sau unui utilaj cu masa trecută în fișă.
  const aplic = rand ? !!rand.aplicabil : !!inc;
  const t = (kg: number | null) => (kg ? (kg / 1000).toLocaleString('ro-RO') + ' t' : null);
  const treapta = aplic && inc ? ((cfg?.categorii || []).find((c: any) => c.key === inc.categorie) || {}).eticheta || null : null;
  const camp = (et: string, val: any, lipsa: string) => <div class={'tz-f' + (val ? '' : ' gol')}><span>{et}</span><b>{val || lipsa}</b></div>;

  return (
    <>
      {rutare && !rutare.pornit && (
        <div class="tr-nota galben" style="margin-top:0;margin-bottom:12px">
          <Icon name="alert" size={14} style="vertical-align:-2px;margin-right:4px" />
          {rutare.motiv || 'Calculul unui traseu nou nu e pornit.'} Poți alege vehiculul și adresele, dar costul nu se poate calcula până nu e configurat.
        </div>
      )}
      {rutare && rutare.pornit && rutare.deProba && (
        <div class="tr-nota galben" style="margin-top:0;margin-bottom:12px">Traseele vin de pe un server public de probă. Bun pentru încercări, nu pentru o ofertă.</div>
      )}

      <div class="pf-card">
        <div class="tr-h">Profil vehicul</div>
        {/* Caseta stă DEASUPRA listei: la trei mașini e de prisos, la patruzeci fără ea nu găsești nimic. */}
        <div class="tz-cauta">
          <Icon name="search" size={16} class="ic" />
          <input class="tz-cauta-i" placeholder="Caută după număr sau nume…" value={q} autocomplete="off" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {q && <button class="tz-x" onClick={() => setQ('')} aria-label="Șterge căutarea"><Icon name="x" size={16} /></button>}
        </div>
        {flota === undefined ? <div class="spin" style="margin:12px auto" />
          : !flota ? <div class="tr-nota rosu">Nu s-a putut citi lista vehiculelor.</div>
          : !toate.length ? <div class="tz-mai">Niciun vehicul în flotă.</div>
          : !lista.length ? <div class="tz-mai">Niciun vehicul care să se potrivească.</div>
          : (
            <div class="tz-lista">
              {lista.slice(0, 40).map((v) => {
                const sub = [v.model, v.categorieEticheta || v.motiv || ''].filter(Boolean).join(' · ');
                return (
                  <button class={'tz-veh' + (imei === v.imei ? ' on' : '') + (v.aplicabil ? '' : ' gri')} onClick={() => alege(v.imei)}>
                    <Icon name="truck" size={18} color="var(--text-muted)" />
                    <span><b>{v.numar || v.nume || v.imei}</b>{sub && <em>{sub}</em>}</span>
                    {imei === v.imei && <Icon name="check" size={17} color="var(--accent)" />}
                  </button>
                );
              })}
              {lista.length > 40 && <div class="tz-mai">încă {lista.length - 40} — scrie ca să filtrezi</div>}
            </div>
          )}

        {!imei && flota && toate.length > 0 && <div class="tr-mic" style="margin-top:10px">Alege un vehicul din listă.</div>}
        {imei && profLoad && <div class="tr-mic" style="margin-top:12px"><span class="spin" style="display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:-2px;margin-right:6px" />Se citește fișa vehiculului…</div>}
        {imei && !profLoad && !d && <div class="tr-nota rosu">Nu s-a putut citi fișa vehiculului.</div>}
        {d && (
          <>
            <div class="tz-fise">
              {camp('Serie șasiu (VIN)', d.vin, 'necompletat în fișă')}
              {camp('Masă maximă', t(d.masaKg), 'necompletată în fișă')}
              {camp('Număr de axe', d.axe ? String(d.axe) : null, 'necompletat')}
              {camp('Clasă de emisii', d.euro, 'necompletată în fișă')}
              {camp('Categorie vehicul', d.tip, 'necompletată')}
              {camp('Treaptă de taxare', treapta, inc && !aplic ? 'nu se taxează pe km' : 'nu se poate încadra')}
            </div>
            <div class="tz-fise-nota">
              <Icon name="lock" size={13} />
              <span>Datele vin din fișa vehiculului și nu se pot schimba de aici — treapta de taxare se calculează din masă, ca să nu se poată contrazice cu ea. Se corectează din <b>Vehicule → Editare</b>.</span>
            </div>
            {aplic && inc
              ? <div class="tr-nota verde">Se taxează cu <b>{nr(inc.leiPerKm.autostrada)} lei/km</b> pe autostradă și <b>{nr(inc.leiPerKm.national)} lei/km</b> pe drum național.{inc.euroCunoscut ? '' : ' Norma de poluare lipsește din fișă — am luat tariful maxim.'}</div>
              : <div class="tr-nota rosu">{(rand && rand.motiv) ? 'Nu intră la taxa pe kilometru: ' + rand.motiv + '.' : 'Vehiculul nu se poate încadra la taxare — vezi ce lipsește mai sus.'}</div>}
          </>
        )}
      </div>

      <div class="pf-card">
        <div class="tr-h">Traseu</div>
        <CampAdresa eticheta="Plecare" icon="mapPin" ales={start} onAles={(a) => { setStart(a); setRez(null); }} />
        <CampAdresa eticheta="Destinație" icon="navigate" ales={end} onAles={(a) => { setEnd(a); setRez(null); }} />
        <button class="trf-go" disabled={!pornit || busy} onClick={calculeaza}>
          <Icon name="zap" size={16} /> {busy ? 'Se calculează…' : 'Calculează ruta și costurile'}
        </button>
        {msg && <div class={'tr-c-msg' + (msg.rosu ? ' rosu' : '')}>{msg.t}</div>}
      </div>

      {rez && rez.rezultat && <RezultatCursa r={rez} cfg={cfg} />}
    </>
  );
}

// O adresă cu sugestii. Se caută abia după ce omul se oprește din scris (350 ms) și de la 3 litere: altfel
// fiecare literă ar fi o cerere, iar furnizorul de adrese permite una pe secundă.
function CampAdresa({ eticheta, icon, ales, onAles }: { eticheta: string; icon: 'mapPin' | 'navigate'; ales: Adresa | null; onAles: (a: Adresa | null) => void }) {
  const [text, setText] = useState(ales ? ales.label : '');
  const [sug, setSug] = useState<{ stare: 'gol' | 'cauta' | 'eroare' | 'nimic' | 'lista'; lista?: Adresa[]; err?: string }>({ stare: 'gol' });
  const timer = useRef<any>(null);
  const cerere = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  function scrie(v: string) {
    setText(v);
    if (ales) onAles(null); // ce s-a scris după alegere nu mai e adresa aleasă
    clearTimeout(timer.current);
    const qq = v.trim();
    if (qq.length < 3) { setSug({ stare: 'gol' }); return; }
    setSug({ stare: 'cauta' });
    const nrCerere = ++cerere.current;
    timer.current = setTimeout(async () => {
      try {
        const r = await Api.tollroAdrese(qq);
        if (nrCerere !== cerere.current) return; // a venit între timp alt text
        const s = (r && r.sugestii) || [];
        setSug(s.length ? { stare: 'lista', lista: s } : { stare: 'nimic' });
      } catch (e: any) {
        if (nrCerere !== cerere.current) return;
        setSug({ stare: 'eroare', err: e?.message || 'Căutarea nu a răspuns.' });
      }
    }, 350);
  }
  function alege(a: Adresa) { cerere.current++; setText(a.label); setSug({ stare: 'gol' }); onAles(a); }
  function sterge() { cerere.current++; clearTimeout(timer.current); setText(''); setSug({ stare: 'gol' }); onAles(null); }

  return (
    <div class="tz-adr">
      <label>{eticheta}</label>
      <div class="tz-cauta">
        <Icon name={icon} size={16} class="ic" />
        <input class="tz-cauta-i" placeholder="Scrie o localitate sau o adresă…" autocomplete="off" value={text} onInput={(e) => scrie((e.target as HTMLInputElement).value)} />
        {text && <button class="tz-x" onClick={sterge} aria-label="Șterge"><Icon name="x" size={16} /></button>}
      </div>
      {sug.stare !== 'gol' && (
        <div class="tz-sug">
          {sug.stare === 'cauta' && <div class="tz-sug-i muted"><span class="spin" style="width:13px;height:13px;border-width:2px" /> se caută…</div>}
          {sug.stare === 'eroare' && <div class="tz-sug-i rosu">{sug.err}</div>}
          {sug.stare === 'nimic' && <div class="tz-sug-i muted">Nicio adresă găsită.</div>}
          {sug.stare === 'lista' && (sug.lista || []).map((a) => (
            <button class="tz-sug-i" onClick={() => alege(a)}><Icon name="mapPin" size={14} />{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function RezultatCursa({ r, cfg }: { r: any; cfg: any }) {
  const z = r.rezultat;
  if (!z.aplicabil) return <div class="pf-card"><div class="tr-nota rosu" style="margin-top:0">{z.motiv}</div></div>;
  const kmTaxati = z.linii.reduce((a: number, l: any) => a + (l.taxabil ? l.km : 0), 0);
  const netaxat = z.linii.find((l: any) => !l.taxabil && l.km);
  return (
    <div class="pf-card">
      <HartaCursa traseu={r.traseu} clase={r.clase} claseDrum={cfg?.claseDrum} />
      <div class="tz-leg">{z.linii.map((l: any) => <span><i style={'background:' + l.culoare} />{l.eticheta} · {km1(l.km)} km</span>)}</div>
      <div class="tr-tot" style="margin-top:8px">
        <div class="tr-tot-s">{nr(z.total)}<span>lei</span></div>
        <div class="tr-tot-b">{km1(r.kmTotal)} km în total · {km1(kmTaxati)} km pe drum cu taxă</div>
      </div>
      {z.linii.filter((l: any) => l.taxabil).map((l: any) => (
        <div class="tz-lin">
          <i style={'background:' + l.culoare} />
          <span class="tz-l1">{l.eticheta}</span>
          <span class="tz-l3">{nr(l.cost)} lei</span>
          <span class="tz-l2">{km1(l.km)} km × {nr(l.leiPerKm)} lei</span>
        </div>
      ))}
      {netaxat && (
        <div class="tz-lin gri">
          <i style={'background:' + netaxat.culoare} />
          <span class="tz-l1">{netaxat.eticheta}</span>
          <span class="tz-l3">—</span>
          <span class="tz-l2">{km1(netaxat.km)} km · nu se plătește</span>
        </div>
      )}
      {(z.avertismente || []).map((a: string) => <div class="tr-nota galben">{a}</div>)}
      <div class="tr-mic" style="margin-top:8px">Costuri estimative — tarifele se stabilesc de autoritățile române și se pot modifica.{r.atribuire ? ' ' + r.atribuire + '.' : ''}</div>
    </div>
  );
}
