// Simulatorul de încărcare pe telefon (pasul 4, 12.10) — același ca pe web (Meniu → Simulator încărcare), pe aceleași rute:
// telefonul trimite alegerile la /api/incarcare/simuleaza și arată ce primește (cifrele, osiile, textele — din incarcare.js);
// desenul e copia celui de pe web (lib/simDesen.ts). Aici stau doar alegerile omului: vehiculul, semiremorca, marfa,
// opririle; planul se salvează și se trimite unui om al firmei („Trimite șoferului"), ca pe web.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { salveazaPostDeLaServer } from '../lib/descarcaPost';
import { simSvg } from '../lib/simDesen';
import { modulIncarcare, RUTA_PLANURI, type IncMeta } from '../lib/incarcare';
import './detail.css';
import './simulator.css';

const CHEIE = 'ra_sim_plan_tel';   // planul în lucru, în telefonul omului (o comoditate, nu o salvare)
type Marfa = { nume: string; lungime: number; latime: number; inaltime: number; kg: number; buc: number; oprire: number; suprapus: boolean };
const TON = (t?: string) => 'ton-' + (t || 'gri');

export function Simulator() {
  const loc = useLocation();
  const planDinAdresa = String(((loc.query || {}) as any).plan || '');
  // Din fișa remorcii („Deschide în simulator", 13.10): vehiculul la care e atașată și remorca, gata alese.
  const vehDinAdresa = String(((loc.query || {}) as any).vehicul || ''), remDinAdresa = String(((loc.query || {}) as any).remorca || '');
  const [meta, setMeta] = useState<(IncMeta & any) | null>(null);
  const [flota, setFlota] = useState<{ vehicule: any[]; remorci: any[] } | null>(null);
  const [err, setErr] = useState('');
  const [imei, setImei] = useState('');
  const [remorcaId, setRemorcaId] = useState('');
  const [mod, setMod] = useState('opriri');
  const [opriri, setOpriri] = useState<string[]>(['Oprirea 1']);
  const [marfa, setMarfa] = useState<Marfa[]>([]);
  const [rez, setRez] = useState<any>(null);
  const [eroare, setEroare] = useState('');
  const [view, setView] = useState('lat');
  const [yaw, setYaw] = useState(32);
  const [planId, setPlanId] = useState<number | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [foaie, setFoaie] = useState<'' | 'planuri' | 'trimite' | 'marfa'>('');
  const [editIdx, setEditIdx] = useState(-1);
  const [planuri, setPlanuri] = useState<any[] | null>(null);
  const [oameni, setOameni] = useState<any[] | null>(null);
  const [ales, setAles] = useState<number | null>(null);
  const [lucru, setLucru] = useState(false);
  const seq = useRef(0);
  const trag = useRef<{ x: number; yaw: number } | null>(null);

  const vehs = (flota && flota.vehicule) || [];
  const v = vehs.find((x) => x.imei === imei) || null;
  // Ce se cuplează la un vehicul o spune serverul (`remorci_ids` + motivul `remorci_mesaj`, din incarcare.remorciPentru) —
  // ca pe web; telefonul nu mai filtrează singur (13.10: o remorcă de alt fel dispărea pe tăcute).
  const potrivite = (vv: any, f: any): any[] => (!vv || !f ? [] : f.remorci.filter((r: any) => (vv.remorci_ids || []).map(String).indexOf(String(r.id)) >= 0));
  const remorci = potrivite(v, flota);
  const culoare = (n: number) => { const c = (meta && meta.culoriOpriri) || ['#3B82F6']; return c[(Math.max(1, n) - 1) % c.length]; };

  function alegeVehicul(x: string, pastreaza?: boolean, rid?: string) {
    setImei(x);
    const vv = vehs.find((y) => y.imei === x) || (flota && flota.vehicule.find((y) => y.imei === x));
    if (!vv || !flota) return;
    const lista = potrivite(vv, flota);
    const pref = rid != null ? rid : (pastreaza ? remorcaId : '');
    if (lista.some((r) => String(r.id) === String(pref))) { setRemorcaId(String(pref)); return; }
    const obis = lista.find((r) => String(r.id) === String(vv.remorca_id));
    setRemorcaId(obis ? String(obis.id) : (vv.tip === 'trac' && lista[0] ? String(lista[0].id) : ''));
  }
  // „Ai schimbat planul" = ce e pe ecran nu mai e ce s-a salvat (socotit, nu ținut minte: un plan redeschis nu rămâne
  // „schimbat" din greșeală). Rândurile de marfă se compară pe valori, nu pe ordinea cheilor.
  const semn = (o: { imei: any; remorca: any; mod: any; opriri: any; marfa: any }) => JSON.stringify([String(o.imei || ''), String(o.remorca || ''), String(o.mod || ''),
    (o.opriri || []).map(String), (o.marfa || []).map((x: any) => [String(x.nume || ''), +x.lungime, +x.latime, +x.inaltime, +x.kg, +x.buc, +x.oprire, !!x.suprapus])]);
  const modificat = !!(planId && plan && semn({ imei, remorca: remorcaId, mod, opriri, marfa }) !== semn({ imei: plan.imei, remorca: plan.remorca_id, mod: plan.mod, opriri: plan.opriri, marfa: plan.marfa }));
  function puneDinPlan(p: any) {
    setPlanId(p.id); setPlan(p);
    setMod(p.mod || 'opriri'); setOpriri(p.opriri && p.opriri.length ? p.opriri.slice() : ['Oprirea 1']);
    setMarfa((p.marfa || []).map((x: any) => ({ ...x })));
    setImei(p.imei); setRemorcaId(p.remorca_id ? String(p.remorca_id) : '');
  }

  useEffect(() => {
    (async () => {
      if (!modulIncarcare(me.value)) { setErr('Simulatorul de încărcare nu e pornit pentru firma ta.'); return; }
      try {
        const [m, f] = await Promise.all([Api.incarcareMeta(), Api.incarcareFlota()]);
        setMeta(m); setFlota(f);
        if (planDinAdresa) {
          const j = await Api.planIncarcare(Number(planDinAdresa));
          puneDinPlan(j.plan);
          return;
        }
        let t: any = null; try { t = JSON.parse(localStorage.getItem(CHEIE) || 'null'); } catch { t = null; }
        if (t && Array.isArray(t.marfa)) { setMarfa(t.marfa); setOpriri(Array.isArray(t.opriri) && t.opriri.length ? t.opriri : ['Oprirea 1']); setMod(t.mod || 'opriri'); }
        const cerut = vehDinAdresa ? f.vehicule.find((x: any) => x.imei === vehDinAdresa) : null;
        const pref = t && f.vehicule.find((x: any) => x.imei === t.imei);
        const prim = cerut || pref || f.vehicule[0];
        if (cerut) {
          setImei(cerut.imei);
          const l = potrivite(cerut, f);
          setRemorcaId(l.some((r: any) => String(r.id) === remDinAdresa) ? remDinAdresa : String((l.find((r: any) => String(r.id) === String(cerut.remorca_id)) || { id: '' }).id));
        } else if (prim) {
          setImei(prim.imei);
          const lista = potrivite(prim, f);
          const rid = pref && lista.some((r: any) => String(r.id) === String(t.remorcaId)) ? String(t.remorcaId) : (lista.find((r: any) => String(r.id) === String(prim.remorca_id)) || (prim.tip === 'trac' ? lista[0] : null) || { id: '' }).id;
          setRemorcaId(rid ? String(rid) : '');
        }
      } catch (e: any) { setErr(e?.status === 403 ? 'Simulatorul de încărcare nu e pornit pentru firma ta.' : (e?.message || 'Eroare la încărcare')); }
    })();
  }, [planDinAdresa, vehDinAdresa]);

  // Fiecare schimbare: serverul socotește (cu o mică pauză, ca să nu plece o cerere la fiecare literă).
  useEffect(() => {
    if (!imei) return;
    try { localStorage.setItem(CHEIE, JSON.stringify({ imei, remorcaId, mod, opriri, marfa })); } catch { /* fără stocare */ }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await Api.simuleaza({ imei, remorca_id: remorcaId || null, mod, opriri, marfa });
        if (n !== seq.current) return;
        setRez(r); setEroare('');
      } catch (e: any) { if (n !== seq.current) return; setRez(null); setEroare(e?.message || 'Nu s-a putut face simularea.'); }
    }, 250);
    return () => clearTimeout(t);
  }, [imei, remorcaId, mod, JSON.stringify(opriri), JSON.stringify(marfa)]);

  const corp = () => ({ imei, remorca_id: remorcaId || null, mod, opriri, marfa });
  const schimba = (i: number, patch: Partial<Marfa>) => setMarfa((m) => m.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  function adauga(id: string) {
    const max = (meta && meta.maxRanduri) || 40;
    if (marfa.length >= max) { showToast('Cel mult ' + max + ' de rânduri de marfă.', true); return; }
    const p = ((meta && meta.presetari) || []).find((x: any) => x.id === id);
    const it: Marfa = p ? { nume: p.nume, lungime: p.lungime, latime: p.latime, inaltime: p.inaltime, kg: p.kg, buc: p.buc, suprapus: !!p.suprapus, oprire: 1 }
      : { nume: 'Marfă', lungime: 100, latime: 80, inaltime: 100, kg: 100, buc: 1, suprapus: false, oprire: 1 };
    setMarfa((m) => [...m, it]);
    if (!p) { setEditIdx(marfa.length); setFoaie('marfa'); }
  }
  async function pdf() {
    try { await salveazaPostDeLaServer('/api/incarcare/pdf', corp(), 'RA-Track - Plan de încărcare.pdf'); }
    catch (e: any) { showToast(e?.message || 'Hârtia nu s-a putut face.', true); }
  }
  async function deschidePlanuri() {
    setFoaie('planuri'); setPlanuri(null);
    try { setPlanuri(await Api.planuriIncarcare()); } catch { setPlanuri([]); }
  }
  async function deschidePlan(id: number) {
    try { const j = await Api.planIncarcare(id); puneDinPlan(j.plan); setFoaie(''); }
    catch (e: any) { showToast(e?.message || 'Planul nu s-a putut deschide.', true); }
  }
  async function stergePlan(id: number) {
    if (!window.confirm('Ștergi planul? Dacă l-ai trimis, șoferul nu-l mai vede.')) return;
    try { await Api.stergePlan(id); if (planId === id) { setPlanId(null); setPlan(null); } deschidePlanuri(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge.', true); }
  }
  // „Trimite șoferului": se salvează (planul nou, sau peste cel deschis), apoi se alege omul — ca pe web.
  async function trimite() {
    setLucru(true);
    try {
      let p = plan, id = planId;
      if (!id || modificat) {
        p = await Api.salveazaPlan(id, corp()); id = p.id;
        puneDinPlan(p);   // ecranul ia ce a păstrat serverul (cifrele curățate), ca planul să nu pară „schimbat"
      }
      setOameni(null); setAles(p && p.trimis_catre ? p.trimis_catre : null); setFoaie('trimite');
      setOameni(await Api.destinatariPlan(me.value?.isSuper && v ? v.company_id : null));
    } catch (e: any) { showToast(e?.message || 'Planul nu s-a putut salva.', true); }
    finally { setLucru(false); }
  }
  async function trimiteLa() {
    if (!planId || !ales) { showToast('Alege cui trimiți planul.', true); return; }
    setLucru(true);
    try { const p = await Api.trimitePlan(planId, ales); setPlan(p); setFoaie(''); showToast('Trimis lui ' + (p.trimis_catre_nume || '') + '.'); }
    catch (e: any) { showToast(e?.message || 'Planul nu s-a putut trimite.', true); }
    finally { setLucru(false); }
  }

  const R = rez;
  const it = editIdx >= 0 ? marfa[editIdx] : null;
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Simulator încărcare</div>
        <button class="h-btn" onClick={deschidePlanuri} aria-label="Planurile" title="Planurile"><Icon name="list" /></button>
      </header>
      <div class="content has-tabbar">
        {err ? <div class="ts-pad"><div class="ts-msg ton-rosu">{err}</div></div> : !flota ? <div class="ts-pad"><div class="spin" style="margin:20px auto" /></div> : !vehs.length ? (
          <div class="ts-pad"><div class="ts-card ts-mut">Nu ai încă vehicule care cară marfă. În fișa vehiculului alege felul (autotractor, camion, dubă) și simulatorul îl propune aici.</div></div>
        ) : (
          <div class="ts-pad">
            {planId && plan && (
              <div class="ts-card" style="flex-direction:row;align-items:center">
                <span class={'ts-dot ' + TON(plan.stare && plan.stare.fel)} />
                <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
                  <b style="font-size:14px">{plan.nume || 'Planul #' + plan.id} · {plan.vehicul}</b>
                  <span class="ts-mut">{modificat ? 'Ai schimbat planul — la „Trimite șoferului” pleacă din nou.' : (plan.stare && plan.stare.text)}</span>
                </span>
                <button class="ts-tg" onClick={() => { setPlanId(null); setPlan(null); }} aria-label="Începe un plan de încărcare nou (marfa rămâne pe ecran)">Începe altul</button>
              </div>
            )}
            {R && <div class={'ts-msg ' + TON(R.stare.fel)} style="font-weight:800">{R.stare.text}</div>}
            <div class="ts-card">
              <span class="ts-lbl">Vehiculul (din flotă)</span>
              <div class="ts-scroll">
                {vehs.map((x) => <button class={'ts-chip' + (x.imei === imei ? ' on' : '')} onClick={() => alegeVehicul(x.imei)}>{x.plate}<small>{[x.sub, x.felEt].filter(Boolean).join(' · ')}</small></button>)}
              </div>
              {v && v.tip === 'trac' && <>
                <span class="ts-lbl">Semiremorca (din flotă)</span>
                {remorci.length ? <div class="ts-scroll">{remorci.map((r) => <button class={'ts-chip' + (String(r.id) === remorcaId ? ' on' : '')} onClick={() => setRemorcaId(String(r.id))}>{r.plate}<small>{r.sub}</small></button>)}</div>
                  : <span class="ts-mut">{v.remorci_mesaj || 'Firma n-are semiremorci trecute — le adaugi din Vehicule → Semiremorci și remorci.'}</span>}
              </>}
              {v && v.tip !== 'trac' && !remorci.length && v.remorci_mesaj && <>
                <span class="ts-lbl">Remorca (din flotă)</span>
                <span class="ts-mut">{v.remorci_mesaj}</span>
              </>}
              {v && v.tip !== 'trac' && v.carlig && remorci.length > 0 && <>
                <span class="ts-lbl">Remorca cu proțap (din flotă)</span>
                <div class="ts-scroll">
                  <button class={'ts-chip' + (!remorcaId ? ' on' : '')} onClick={() => setRemorcaId('')}>Fără remorcă<small>doar camionul</small></button>
                  {remorci.map((r) => <button class={'ts-chip' + (String(r.id) === remorcaId ? ' on' : '')} onClick={() => setRemorcaId(String(r.id))}>{r.plate}<small>{r.sub}</small></button>)}
                </div>
              </>}
              <span class="ts-lbl">Cum se așază</span>
              <div class="ts-scroll">{((meta && meta.moduri) || []).map((m: any) => <button class={'ts-chip' + (m.id === mod ? ' on' : '')} onClick={() => setMod(m.id)}>{m.et}<small>{m.sub}</small></button>)}</div>
              <span class="ts-lbl">Opririle cursei</span>
              {opriri.map((o, i) => (
                <label class="ts-oprire"><span class="ts-dot" style={'color:' + culoare(i + 1)} />
                  <input value={o} maxLength={40} aria-label={'Oprirea ' + (i + 1)} onChange={(e) => { const val = (e.target as HTMLInputElement).value.trim().slice(0, 40) || ('Oprirea ' + (i + 1)); setOpriri((l) => l.map((x, k) => (k === i ? val : x))); }} />
                </label>
              ))}
              <div class="ts-row">
                {opriri.length < ((meta && meta.maxOpriri) || 5) && <button class="ts-tg" onClick={() => setOpriri((l) => [...l, 'Oprirea ' + (l.length + 1)])}>+ Oprire</button>}
                {opriri.length > 1 && <button class="ts-tg" onClick={() => { const n = opriri.length; setOpriri((l) => l.slice(0, -1)); setMarfa((m) => m.map((x) => (x.oprire >= n ? { ...x, oprire: n - 1 } : x))); }}>− Oprire</button>}
              </div>
            </div>

            {R && <div class="ts-grid2">{R.indicatori.map((x: any) => (
              <div class="ts-ind"><span class="ts-lbl">{x.et}</span><b class={TON(x.ton)}>{x.val}</b><span class="ts-mut">{x.tot}</span>
                <div class={'ts-bar ' + TON(x.ton)}><div style={'width:' + Math.max(0, Math.min(100, x.pct || 0)) + '%'} /></div></div>
            ))}</div>}

            <div class="ts-card">
              <div class="ts-row" style="justify-content:space-between">
                <div class="ts-seg" role="group" aria-label="Vederea">{[['lat', 'Lateral'], ['sus', 'De sus'], ['3d', '3D']].map((w) => <button class={view === w[0] ? 'on' : ''} onClick={() => setView(w[0])}>{w[1]}</button>)}</div>
                {view === '3d' && <div class="ts-row"><button class="ts-ib" onClick={() => setYaw((y) => (y + 315) % 360)} aria-label="Rotește spre stânga">⟲</button><button class="ts-ib" onClick={() => setYaw((y) => (y + 45) % 360)} aria-label="Rotește spre dreapta">⟳</button></div>}
              </div>
              {R ? <>
                <span class="ts-mut"><b>{R.titlu}</b> · {R.dimensiuni}</span>
                <svg class="ts-svg" viewBox="0 0 960 330" role="img" aria-label="Desenul încărcăturii"
                  onPointerDown={(e) => { if (view === '3d') trag.current = { x: e.clientX, yaw }; }}
                  onPointerMove={(e) => { if (trag.current) setYaw((((trag.current.yaw + (e.clientX - trag.current.x) * 0.45) % 360) + 360) % 360); }}
                  onPointerUp={() => { trag.current = null; }} onPointerCancel={() => { trag.current = null; }}
                  dangerouslySetInnerHTML={{ __html: simSvg(R, view, yaw, culoare) }} />
                <div class="ts-row">{R.legenda.map((l: any) => <span class="ts-mut" style="display:inline-flex;align-items:center;gap:6px"><span class="ts-dot" style={'color:' + l.culoare} />Oprirea {l.nr} · {l.nume}</span>)}</div>
                <span class="ts-mut">{R.xcwText}. {R.ordineText}</span>
              </> : eroare ? <div class="ts-msg ton-rosu">{eroare}</div> : <span class="ts-mut">Se socotește…</span>}
            </div>

            <div class="ts-card">
              <div class="ts-row" style="justify-content:space-between"><b style="font-size:15px">Marfa</b><span class="ts-mut">{R ? R.incarcate + ' din ' + R.total + ' colete' : ''}</span></div>
              {marfa.map((x, i) => (
                <div class="ts-it">
                  <div class="ts-row"><span class="ts-dot" style={'color:' + culoare(x.oprire)} /><span class="ts-itn">{x.nume}</span>
                    <button class="ts-ib" onClick={() => { setEditIdx(i); setFoaie('marfa'); }} aria-label="Schimbă dimensiunile"><Icon name="edit" size={16} /></button>
                    <button class="ts-ib" onClick={() => setMarfa((m) => m.filter((_, k) => k !== i))} aria-label="Scoate marfa"><Icon name="trash" size={16} /></button></div>
                  <span class="ts-mut">{x.lungime} × {x.latime} × {x.inaltime} cm · {Number(x.kg).toLocaleString('ro-RO')} kg bucata</span>
                  <div class="ts-row">
                    <button class="ts-ib" onClick={() => schimba(i, { buc: Math.max(1, x.buc - 1) })} aria-label="Mai puține">−</button>
                    <b style="min-width:30px;text-align:center">{x.buc}</b>
                    <button class="ts-ib" onClick={() => schimba(i, { buc: Math.min(500, x.buc + 1) })} aria-label="Mai multe">+</button>
                    <button class="ts-tg" onClick={() => schimba(i, { oprire: (x.oprire % opriri.length) + 1 })}>Oprirea {x.oprire} · {opriri[x.oprire - 1] || ''}</button>
                  </div>
                  <button class={'ts-tg' + (x.suprapus ? ' on' : '')} onClick={() => schimba(i, { suprapus: !x.suprapus })}>{x.suprapus ? 'Se pot pune câte 2 unul peste altul' : 'Nu se pun unul peste altul'}</button>
                </div>
              ))}
              {!marfa.length && <span class="ts-mut">Adaugă marfa cu butoanele de mai jos: alegi felul, apoi schimbi bucățile și dimensiunile.</span>}
              <div class="ts-row">
                {((meta && meta.presetari) || []).map((p: any) => <button class="ts-tg" onClick={() => adauga(p.id)}>+ {p.nume}</button>)}
                <button class="ts-tg" onClick={() => adauga('')}>+ Altceva</button>
              </div>
            </div>

            {R && (
              <div class="ts-card">
                <b style="font-size:15px">Greutatea pe osii</b>
                {R.osii.map((a: any) => (
                  <div class="ts-ax"><div class="ts-axr"><span>{a.nume} <span class="ts-mut">{a.sub}</span></span><b class={TON(a.ton)}>{a.text}</b></div>
                    <div class={'ts-bar ' + TON(a.ton)}><div style={'width:' + Math.max(0, Math.min(100, a.pct || 0)) + '%'} /></div></div>
                ))}
                <div class="ts-axr" style="border-top:1px solid var(--border);padding-top:8px"><span>Masa totală</span><b class={TON(R.masa.ton)}>{R.masa.text}</b></div>
                {R.mesaje.map((m: any) => <div class={'ts-msg ' + TON(m.fel)}>{m.text}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {flota && vehs.length > 0 && !err && (
        <div class="ts-jos">
          <button class="ts-btn" disabled={!R} onClick={pdf}><Icon name="download" size={17} /> PDF</button>
          <button class="ts-btn pri" disabled={!R || !marfa.length || lucru} onClick={trimite}><Icon name="arrowRight" size={17} /> Trimite șoferului</button>
        </div>
      )}

      {foaie && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !lucru) setFoaie(''); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>{foaie === 'planuri' ? 'Planurile de încărcare' : foaie === 'trimite' ? 'Cui trimiți planul?' : 'Marfa'}</b>
              <button class="h-btn" onClick={() => setFoaie('')} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              {foaie === 'planuri' && (planuri == null ? <div class="spin" style="margin:16px auto" /> : planuri.length ? (
                <div style="display:flex;flex-direction:column;gap:8px">
                  {planuri.map((p) => (
                    <div class="ts-it">
                      <div class="ts-row"><span class={'ts-dot ' + TON(p.stare.fel)} /><span class="ts-itn">{p.vehicul} · {p.nume || 'Planul #' + p.id}</span></div>
                      <span class="ts-mut">{p.stare.text}{p.creat_de_nume ? ' · făcut de ' + p.creat_de_nume : ''}</span>
                      <div class="ts-row">
                        <button class="ts-tg" onClick={() => deschidePlan(p.id)}>Deschide</button>
                        {p.alMeu && p.stare.cheie !== 'ciorna' && <button class="ts-tg" onClick={() => { setFoaie(''); loc.route('/incarcare/plan/' + p.id); }}>Pentru mine</button>}
                        <button class="ts-ib" onClick={() => stergePlan(p.id)} aria-label="Șterge planul"><Icon name="trash" size={16} /></button>
                      </div>
                    </div>
                  ))}
                  <button class="ts-tg" onClick={() => { setFoaie(''); loc.route(RUTA_PLANURI); }}>Toate planurile, pe ecranul lor</button>
                </div>
              ) : <div class="ts-mut">Niciun plan încă. Așezi marfa și apeși „Trimite șoferului”: planul se salvează și pleacă.</div>)}
              {foaie === 'trimite' && (oameni == null ? <div class="spin" style="margin:16px auto" /> : (
                <div style="display:flex;flex-direction:column;gap:8px">
                  <span class="ts-mut">Omul ales îl vede în aplicație (Meniu → Planurile de încărcare) și primește un anunț. Trebuie să aibă cont în aplicație.</span>
                  {oameni.length ? oameni.map((o) => (
                    <button class={'ts-chip' + (ales === o.id ? ' on' : '')} style="width:100%" onClick={() => setAles(o.id)}>{o.nume}<small>{o.rol}</small></button>
                  )) : <span class="ts-mut">Firma n-are încă oameni cu cont în aplicație. Îi adaugi din Meniu → Utilizatori.</span>}
                  {oameni.length > 0 && <button class="ts-btn pri" disabled={!ales || lucru} onClick={trimiteLa}><Icon name="arrowRight" size={17} /> Trimite</button>}
                </div>
              ))}
              {foaie === 'marfa' && it && (
                <div style="display:flex;flex-direction:column;gap:10px">
                  <label class="ts-fld">Denumire<input value={it.nume} maxLength={60} onChange={(e) => schimba(editIdx, { nume: (e.target as HTMLInputElement).value.slice(0, 60) })} /></label>
                  <div class="ts-grid2">
                    {([['lungime', 'Lungime (cm)'], ['latime', 'Lățime (cm)'], ['inaltime', 'Înălțime (cm)'], ['kg', 'Kg bucata']] as [keyof Marfa, string][]).map(([k, et]) => (
                      <label class="ts-fld">{et}<input type="number" inputMode="decimal" value={String(it[k])} onChange={(e) => schimba(editIdx, { [k]: Number((e.target as HTMLInputElement).value) } as any)} /></label>
                    ))}
                  </div>
                  <button class="ts-btn pri" onClick={() => setFoaie('')}>Gata</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
