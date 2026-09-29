import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { areFlota, FaraDreptFlota } from './modulGarda';
import './detail.css';
import './admin.css';
import './tacho.css'; // .th-badge / .th-due / .th-gh — aceleași benzi și rânduri ca la Tahograf
import './flota.css'; // --fl-ok: verdele care se citește și pe tema deschisă

// e-Transport = SCADENȚARUL codurilor UIT, ca pe web (raxEtRender): cine trebuie rezolvat acum, cine expiră
// curând, cine e în regulă și ce s-a încheiat. Starea fiecărui transport (ore rămase, motive, cât s-a consumat
// din termen) o calculează serverul, din etransport.js — telefonul doar desenează ce primește. Înainte, pe
// telefon era o listă plată, cu termenul socotit local și fără motive.

// „24 DE ore", dar „15 minute": în română, numeralul cere „de" de la 20 în sus (ultimele două cifre în afara 1–19).
const de = (n: number) => { const r = Math.abs(n) % 100; return r >= 1 && r <= 19 ? '' : 'de '; };
// „23 septembrie 2026" → ziua de azi pentru câmpul de calendar, în ora telefonului.
const aziISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// Termenul PROPUS: data de start + zilele tipului ales (aceeași regulă ca serverul, etransport.js → valabilPana).
// Socotit pe zile calendaristice, fără fus orar, ca să nu alunece cu o zi.
function propus(start: string, zile: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || '');
  if (!m || !zile) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + zile);
  return d.toISOString().slice(0, 10);
}

export function ETransport() {
  // Pe web e-Transport stă în „Management", pe care o vede doar cine poate modifica flota.
  if (!areFlota()) return <FaraDreptFlota titlu="e-Transport (ANAF)" />;
  return <ETransportEcran />;
}

function ETransportEcran() {
  const loc = useLocation();
  // Ecranul ăsta e al FIRMEI. Super-adminul primea aici transporturile tuturor firmelor, fără coloană
  // de firmă. Pe web, fondatorul are ecranul lui, pe firme (AI & Module → e-Transport).
  const isSuper = !!me.value?.isSuper;
  // Adaugă și șterge cine poate modifica flota (serverul cere același drept). Nu fondatorul: un transport
  // trebuie să fie al unei firme.
  const poateModifica = !!me.value?.permissions?.manageFleet && !isSuper;
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [nou, setNou] = useState(false);
  const [sterge, setSterge] = useState<any>(null);
  const [stergBusy, setStergBusy] = useState(false);

  function incarca() {
    Api.etransportScadentar()
      .then((r) => { setD(r || {}); setErr(''); })
      .catch((e: any) => {
        // Nu orice 403 e „modul oprit": un rol fără dreptul de rapoarte primește tot 403, dar cu alt motiv.
        setErr(e?.status !== 403 ? (e?.message || 'Eroare la încărcare')
          : e?.message === 'feature_disabled' ? 'Modulul e-Transport nu e pornit pentru firma ta.'
            : 'Rolul tău nu are acces la acest ecran.');
        setD({});
      });
  }
  useEffect(incarca, []);

  async function confirmaSterge() {
    if (!sterge) return;
    setStergBusy(true);
    try { await Api.deleteEtransport(sterge.id); showToast('Transport șters'); setSterge(null); incarca(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge', true); }
    finally { setStergBusy(false); }
  }

  const anaf = d && d.anaf ? d.anaf : null;
  const pornit = !!(anaf && anaf.pornit);
  // Banda de sus, cu textul de pe web. Fără raportare pornită, tot ce urmează e evidență internă, nu
  // conformitate — iar omul trebuie s-o afle, altfel crede că e în regulă la ANAF.
  const banda = anaf == null ? null : isSuper
    ? (pornit
      ? <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Trimitem la ANAF{anaf.test ? ' — pe mediul de TEST, nu pe cel real' : ''}, dar sub UN SINGUR CIF: al nostru. Până când fiecare client are tokenul și CIF-ul lui, nu porni modulul la clienți — ar declara sub CIF-ul nostru.</div>
      : <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Nu pleacă nimic la ANAF — nu e setat tokenul nostru. Pentru clienți, modulul e deocamdată o evidență a codurilor UIT, nu conformitate.</div>)
    : (pornit
      ? <div class="th-badge ok" style="margin-bottom:12px"><Icon name="check" size={15} /> Raportăm pozițiile la ANAF pentru tine{anaf.test ? ' — deocamdată pe mediul de test al ANAF, nu pe cel real' : ''}</div>
      : <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Raportarea către ANAF nu e pornită încă — ne ocupăm noi de ea. Până atunci, aici ții evidența codurilor UIT și a termenelor.</div>);

  const active: any[] = (d && d.active) || [];
  const incheiate: any[] = (d && d.incheiate) || [];
  const probleme = active.filter((x) => x.stare === 'problema');
  const curand = active.filter((x) => x.stare === 'curand');
  const restul = active.filter((x) => x.stare === 'ok' || x.stare === 'necunoscut');
  const curandOre = (d && d.praguri && d.praguri.curandOre) || 24;
  const lista = (v: string[]) => v.length <= 3 ? v.join(', ') : v.slice(0, 3).join(', ') + ' +' + (v.length - 3);

  // `incheiat` = transportul s-a terminat: fără roșu și fără motive. Un cod expirat după livrare e normal,
  // nu o problemă — altfel arhiva ar arăta ca un teanc de amenzi.
  function rand(x: any, incheiat = false) {
    const cls = incheiat ? 'neutral' : x.stare === 'problema' ? 'over' : (x.stare === 'curand' || x.stare === 'necunoscut') ? 'soon' : 'ok';
    // „Expiră curând" = var(--orange), ca pe web (_etStare): tokenul are nuanță mai închisă pe tema luminoasă.
    // Un chihlimbar scris direct aici (#f5b43c) ieșea pe alb aproape invizibil, iar stilul inline nu-l poate
    // corecta nicio regulă de temă din tacho.css.
    const col = incheiat ? 'var(--text-muted)' : x.stare === 'problema' ? 'var(--red)' : x.stare === 'curand' ? 'var(--orange)' : x.stare === 'necunoscut' ? 'var(--text-muted)' : 'var(--fl-ok)';
    const mare = incheiat ? '✓' : (x.oreRamase == null ? '—' : String(Math.abs(x.oreRamase)));
    const mic = incheiat ? 'încheiat' : (x.oreRamase == null ? 'fără termen' : (x.oreRamase < 0 ? 'ore expirat' : 'ore rămase'));
    const sub = [x.de && x.la ? (x.de + ' → ' + x.la) : (x.de || x.la || null), x.sofer, x.marfa].filter(Boolean).join(' · ') || 'fără detalii';
    return (
      <div class="th-fis">
        <div class={'th-due ' + cls}>
          <Icon name="truck" size={19} class="ic" />
          <span class="mid">
            <div class="nm">{x.vehicul}<span class="th-et-uit">UIT {x.uit}</span></div>
            <div class="sub" style="white-space:normal">{sub}</div>
            {!incheiat && x.motive && x.motive.length > 0 && <div class="sub th-et-mut">{x.motive.join(' · ')}</div>}
            <div class="th-bar"><i style={`width:${x.consumatPct || 0}%;background:${col}`} /></div>
          </span>
          <span class="rt" style={`color:${col}`}><b>{mare}</b><span>{mic}</span></span>
        </div>
        {poateModifica && <button class="th-del" aria-label="Șterge transportul" onClick={() => setSterge(x)}><Icon name="trash" size={18} /></button>}
      </div>
    );
  }
  function grup(titlu: string, sub: string, ic: 'alert' | 'clock' | 'check' | 'report', l: any[], incheiat = false, warn = false) {
    if (!l.length) return null;
    return (
      <>
        <div class={'th-gh' + (warn ? ' warn' : '')}><Icon name={ic} size={14} /> {titlu}{sub ? <em>{sub}</em> : null}</div>
        {l.map((x) => rand(x, incheiat))}
      </>
    );
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">e-Transport (ANAF)</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {isSuper ? (
          <>
            {banda}
            <div class="th-note">
              Aici e ecranul firmei. Situația pe firme (cine are transporturi de rezolvat, cine are modulul) o vezi în <b>AI & Module → e-Transport</b>.
              <br /><br />Transporturile le adaugă și le șterge firma.
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:12px" onClick={() => loc.route('/admin/etransport-firme')}>Deschide e-Transport pe firme</button>
          </>
        ) : d == null ? <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>
          : err ? <div class="adm-empty" style="color:var(--red)">{err}</div>
          : (
            <>
              {banda}
              <div class="th-sum">
                {probleme.length > 0 && <div class="th-badge bad"><Icon name="alert" size={15} /> De rezolvat: {lista(probleme.map((x) => x.vehicul))}</div>}
                {curand.length > 0 && <div class="th-badge warn"><Icon name="clock" size={15} /> {curand.length} expiră în mai puțin de {curandOre} {de(curandOre)}ore</div>}
                {!probleme.length && !curand.length && (active.length
                  ? <div class="th-badge ok"><Icon name="check" size={15} /> Toate transporturile active sunt în regulă</div>
                  : <div class="th-badge"><Icon name="truck" size={15} /> Niciun transport activ</div>)}
              </div>

              {grup('De rezolvat acum', 'amendă 20.000–100.000 lei', 'alert', probleme, false, true)}
              {grup('Expiră curând', 'reînnoiește codul UIT', 'clock', curand, false, true)}
              {grup('În regulă', '', 'check', restul)}
              {grup('Încheiate', incheiate.length > 10 ? 'ultimele 10 din ' + incheiate.length : '', 'report', incheiate.slice(0, 10), true)}

              {!active.length && !incheiate.length && (
                <div class="th-note" style="margin-top:12px">
                  Niciun transport înregistrat.{poateModifica ? ' Adaugă unul mai jos, cu codul UIT primit de la ANAF.' : ''}
                </div>
              )}

              {poateModifica
                ? <button class="btn btn-primary th-et-nou" onClick={() => setNou(true)}><Icon name="plus" size={17} /> Transport nou (cod UIT)</button>
                : <div class="th-excl quiet" style="margin-top:14px">Transporturile le adaugă și le șterge cine are drept de administrare a flotei.</div>}
            </>
          )}
      </div>

      {nou && <TransportNou onClose={() => setNou(false)} onGata={() => { setNou(false); incarca(); }} />}

      {sterge && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !stergBusy) setSterge(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="trash" size={18} color="var(--red)" /> Șterge transportul</b><button class="h-btn" onClick={() => setSterge(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              {/* Pe web se șterge pe loc; pe telefon o atingere din greșeală n-are voie să scoată un transport
                  care trebuie raportat la ANAF. */}
              <div class="th-conf">Ștergi transportul <b>{sterge.vehicul}</b>, cod UIT <b>{sterge.uit}</b>? Dispare din scadențar{pornit ? ' și nu se mai raportează la ANAF' : ''}.</div>
              <div class="th-btns">
                <button class="btn th-sec" disabled={stergBusy} onClick={() => setSterge(null)}>Renunță</button>
                <button class="btn th-danger" disabled={stergBusy} onClick={confirmaSterge}>{stergBusy ? 'Se șterge…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// „Transport nou (cod UIT)" — aceleași câmpuri ca pe web. Vehiculul și șoferul se ALEG din flotă; tipurile de
// operațiune și câte zile ține codul vin de la server (etransport.js). Termenul se PROPUNE, dar rămâne de
// corectat: felul exact în care ANAF numără zilele e încă de confirmat, iar un termen ghicit tăcut costă.
function TransportNou({ onClose, onGata }: { onClose: () => void; onGata: () => void }) {
  const [veh, setVeh] = useState<any[]>([]);
  const [sof, setSof] = useState<any[]>([]);
  const [tipuri, setTipuri] = useState<{ cod: string; label: string; zile: number }[]>([]);
  const [f, setF] = useState({ uit: '', imei: '', driver: '', de: '', la: '', marfa: '', tip: '', start: aziISO(), pana: '' });
  const [panaAtins, setPanaAtins] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    Api.devices().then((r) => setVeh(Array.isArray(r) ? r : [])).catch(() => setVeh([]));
    Api.driversLite().then((r) => setSof(Array.isArray(r) ? r : [])).catch(() => setSof([]));
    Api.etransportTipuri().then((r) => {
      const t = (r && r.tipuri) || [];
      setTipuri(t);
      if (t.length) setF((s) => (s.tip ? s : { ...s, tip: t[0].cod }));
    }).catch(() => setTipuri([]));
  }, []);

  const tip = tipuri.find((x) => x.cod === f.tip) || tipuri[0];
  // Se repropune la schimbarea tipului sau a datei de start — ca pe web (raxEtRecalc).
  useEffect(() => { if (tip && f.start) { set({ pana: propus(f.start, tip.zile) }); setPanaAtins(false); } }, [f.tip, f.start, tipuri.length]);

  async function trimite() {
    const uit = f.uit.trim();
    if (!uit) { setMsg('Cod UIT obligatoriu.'); return; }
    setBusy(true); setMsg('');
    try {
      await Api.createEtransport({
        uit, imei: f.imei || null, driver_id: f.driver || null,
        loc_start: f.de.trim() || null, loc_final: f.la.trim() || null,
        marfa: f.marfa.trim() || null, tip_operatiune: f.tip || null,
        start_at: f.start || null,
        valabil_pana: f.pana ? (f.pana + 'T23:59:59') : null,
      });
      showToast('Transport adăugat ✓');
      onGata();
    } catch (e: any) { setMsg(e?.message || 'Nu s-a putut adăuga'); } // cuvintele serverului, neschimbate
    finally { setBusy(false); }
  }

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="truck" size={18} color="var(--accent)" /> Transport nou (cod UIT)</b><button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="fld"><label>Cod UIT <span class="req">*</span></label><input value={f.uit} placeholder="Cod UIT primit de la ANAF" autocomplete="off" onInput={(e: any) => set({ uit: e.target.value })} /></div>
          <div class="fld">
            <label>Vehiculul</label>
            <select value={f.imei} onChange={(e: any) => set({ imei: e.target.value })}>
              <option value="">— vehiculul —</option>
              {veh.map((v) => <option value={v.imei}>{v.plate || v.name || v.imei}</option>)}
            </select>
          </div>
          <div class="fld">
            <label>Șofer (opțional)</label>
            <select value={f.driver} onChange={(e: any) => set({ driver: e.target.value })}>
              <option value="">— șofer (opțional) —</option>
              {sof.map((s) => <option value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div class="fld"><label>De la (localitate)</label><input value={f.de} placeholder="De la (localitate)" onInput={(e: any) => set({ de: e.target.value })} /></div>
          <div class="fld"><label>Până la (localitate)</label><input value={f.la} placeholder="Până la (localitate)" onInput={(e: any) => set({ la: e.target.value })} /></div>
          <div class="fld"><label>Marfa</label><input value={f.marfa} placeholder="ex: legume proaspete · 18,4 t" onInput={(e: any) => set({ marfa: e.target.value })} /></div>
          <div class="fld">
            <label>Tipul operațiunii</label>
            <select value={f.tip} onChange={(e: any) => set({ tip: e.target.value })}>
              {tipuri.map((t) => <option value={t.cod}>{t.label} ({t.zile} zile)</option>)}
            </select>
          </div>
          <div class="fld"><label>Începe pe</label><input type="date" value={f.start} onInput={(e: any) => set({ start: e.target.value })} /></div>
          <div class="fld">
            <label>Codul UIT e valabil până la</label>
            <input type="date" value={f.pana} onInput={(e: any) => { set({ pana: e.target.value }); setPanaAtins(true); }} />
          </div>
          {tip && <div class="th-et-hint">{panaAtins ? 'Data scrisă de tine — rămâne așa cum ai pus-o.' : `Propus: ${tip.zile} zile de la începerea transportului. Corectează data dacă ANAF ți-a dat alt termen.`}</div>}
          <button class="btn btn-primary btn-block" disabled={busy} onClick={trimite}>{busy ? 'Se adaugă…' : 'Adaugă transportul'}</button>
          {msg && <div style="color:var(--red);font-size:13px;font-weight:700;line-height:1.5">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
