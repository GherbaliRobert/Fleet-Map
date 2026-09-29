import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { vehicles, ecranAscuns, me } from '../app/store';
import { Api, type AgentFinding, type ReportChartDef } from '../api/endpoints';
import { fmtAgo } from '../lib/format';
import { Icon } from '../components/Icon';
import { ReportChart } from '../components/ReportChart';
import './reports.css'; // .rc-card — graficul
import './detail.css'; // .sheet-ov / .sheet — lista „Fără semnal"
import './statsflota.css';
import { nrDe } from '../lib/numar';

// „Statistici flotă" — ACELAȘI ecran ca pe web (openDashboard, public/index.html), pe o coloană:
// cifrele zilei (GET /api/dashboard), starea flotei acum, ce veghează agenții AI, top-urile, graficul și
// flota vehicul cu vehicul. Serverul scoate singur mașinile demo din flota reală și calculează consumul
// cu aceleași reguli ca rapoartele; telefonul doar desenează.
//
// Filele vechi de pe telefon (Expirare documente / Fără transmisie / Grupuri) au ieșit: pe web ecranul nu
// le are. Mașinile fără semnal sunt pe cartonașul „Fără semnal" (se apasă → lista lor, pe nume), actele stau
// în Documente vehicule, grupele în Grupe.
//
// Cartonașul „Alerte" de pe web NU e copiat: serverul numără acolo ultimele 20 de alerte de pe toată
// platforma, nefiltrate pe firmă — ar arăta fiecărui client alertele altora. Revine când le filtrează serverul.

const n1 = (v: any) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });
// Ca pe web (formatDuration): secunde → „2h 15m" / „45m".
function durata(sec: number) {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

export function Stats() {
  const loc = useLocation();
  const u = me.value;
  const perms = u?.permissions || {};
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [faraSemnal, setFaraSemnal] = useState(false);

  function incarca() {
    setBusy(true); setErr('');
    Api.dashboard()
      .then((r) => setD(r || {}))
      .catch((e: any) => setErr(e?.message || 'Nu s-au putut încărca cifrele zilei.'))
      .finally(() => setBusy(false));
  }
  useEffect(incarca, []);

  const kmDef = useMemo<ReportChartDef | null>(() => {
    const act = ((d && d.devices) || []).filter((v: any) => v.km > 0).sort((a: any, b: any) => b.km - a.km).slice(0, 15);
    if (!act.length) return null;
    return {
      type: 'bar', title: 'Km per vehicul azi',
      labels: act.map((v: any) => String(v.plate || v.name || v.imei).substring(0, 12)),
      datasets: [{ label: 'Km', data: act.map((v: any) => v.km) }],
      unit: 'km',
    } as any;
  }, [d]);

  return (
    <div class="screen">
      <header class="app-header">
        <div class="h-title">Statistici flotă</div>
        <button class="h-btn" style="margin-left:auto" onClick={incarca} disabled={busy} aria-label="Reîmprospătează"><Icon name="refresh" /></button>
      </header>
      <div class="content has-tabbar sf">
        {!d && !err && (
          <div class="center-msg"><div class="spin" style="margin:0 auto 10px" />Se calculează cifrele zilei…</div>
        )}
        {err && !d && (
          <div class="center-msg">
            <div style="color:var(--red);margin-bottom:12px">{err}</div>
            <button class="btn btn-primary" onClick={incarca}>Încearcă din nou</button>
          </div>
        )}
        {d && (
          <>
            <Cartonase d={d} onFaraSemnal={() => setFaraSemnal(true)} />

            <div class="sf-h"><Icon name="zap" size={14} /> Status flotă acum</div>
            <BaraStare d={d} onRoute={(s) => loc.route('/vehicles?status=' + s)} onOffline={() => setFaraSemnal(true)} />

            <AgentiVeghe
              nrVehicule={d.totalDevices || 0}
              poateDeschide={u?.features?.agents !== false && !!perms.viewReports && !ecranAscuns('insight')}
              onDeschide={() => loc.route('/ai-agents')}
            />

            <div class="sf-h"><Icon name="route" size={14} /> Top km azi</div>
            <Top list={d.topKm} cheie="km" unit=" km" color="var(--accent)" gol="Nicio activitate azi" />
            <div class="sf-h"><Icon name="droplet" size={14} /> Top consum azi</div>
            <Top list={d.topFuel} cheie="fuel" unit=" L" color="var(--orange)" gol="Nicio dată consum" />

            <div class="sf-h"><Icon name="chart" size={14} /> Km per vehicul azi</div>
            {kmDef ? <div class="sf-chart"><ReportChart def={kmDef} /></div> : <div class="sf-gol">Nicio activitate azi</div>}

            <div class="sf-h"><Icon name="list" size={14} /> Flota <em>{d.totalDevices || 0}</em></div>
            {(d.devices || []).length
              ? (d.devices || []).map((v: any) => <RandVehicul v={v} onClick={() => loc.route('/vehicles/' + encodeURIComponent(v.imei))} />)
              : <div class="sf-gol">Niciun vehicul</div>}
          </>
        )}
      </div>
      {faraSemnal && d && (
        <ListaFaraSemnal d={d} onClose={() => setFaraSemnal(false)}
          onVeh={(imei) => { setFaraSemnal(false); loc.route('/vehicles/' + encodeURIComponent(imei)); }} />
      )}
    </div>
  );
}

// ── Cartonașele de sus ─────────────────────────────────────────────────────────────────────────────────
function Cartonase({ d, onFaraSemnal }: { d: any; onFaraSemnal: () => void }) {
  // Media de consum are sens abia după ce s-a rulat ceva: la 2 km și 5 litri arși la ralanti ieșea
  // „250 L/100km". Doar peste 10 km și doar dacă rezultatul e omenesc (1–100) — ca pe web.
  let per100: number | null = (d.totalKm >= 10 && d.totalFuel > 0) ? (d.totalFuel / d.totalKm * 100) : null;
  if (per100 != null && (per100 < 1 || per100 > 100)) per100 = null;
  const consSub = per100 ? '≈ ' + per100.toFixed(1).replace('.', ',') + ' L/100km'
    : (d.totalFuel > 0 ? (d.totalKm < 10 ? 'prea puțini km azi pentru o medie' : 'date de consum incomplete azi') : '—');
  // „Cine tace", pe nume. Cele care n-au transmis NICIODATĂ nu apar în lista live, deci se numără separat —
  // altfel ar părea că lipsesc vehicule între cifră și listă.
  const tac: string[] = ((d.devices || []) as any[]).filter((v) => !v.isOnline).map((v) => v.name || v.imei);
  const niciodata = Math.max(0, (d.offlineCount || 0) - tac.length);
  const offSub = (d.offlineCount > 0)
    ? (tac.slice(0, 3).join(', ') + (tac.length > 3 ? ' și încă ' + (tac.length - 3) : '')
      + (niciodata ? (tac.length ? ' · ' : '') + niciodata + ' n-au transmis niciodată' : ''))
    : 'toate transmit';
  const off = (d.offlineCount || 0) > 0;
  return (
    <div class="sf-kpis">
      <div class="sf-kpi">
        <div class="l"><Icon name="car" size={14} color="var(--accent)" /> Total vehicule</div>
        <div class="n">{d.totalDevices || 0}</div>
        <div class="s">{d.onlineCount || 0} online · {d.offlineCount || 0} offline</div>
      </div>
      <button class="sf-kpi" style={off ? 'border-left-color:var(--red)' : undefined} onClick={onFaraSemnal}>
        <div class="l"><Icon name="wifiOff" size={14} color={off ? 'var(--red)' : 'var(--accent)'} /> Fără semnal</div>
        <div class="n">{d.offlineCount || 0}</div>
        <div class="s">{offSub}</div>
      </button>
      <div class="sf-kpi">
        <div class="l"><Icon name="route" size={14} color="var(--accent)" /> Km azi</div>
        <div class="n">{n1(d.totalKm)}<small>km</small></div>
        <div class="s">total flotă azi</div>
      </div>
      <div class="sf-kpi">
        <div class="l"><Icon name="clock" size={14} color="var(--accent)" /> Timp de mers azi</div>
        <div class="n">{d.totalEngineTime > 0 ? durata(d.totalEngineTime) : '0h 0m'}</div>
        <div class="s">motoare pornite, însumat pe flotă</div>
      </div>
      <div class="sf-kpi lat" style="border-left-color:var(--orange)">
        <div class="l"><Icon name="droplet" size={14} color="var(--orange)" /> Consum azi</div>
        <div class="n">{n1(d.totalFuel)}<small>L</small></div>
        <div class="s">{consSub}</div>
      </div>
    </div>
  );
}

// ── Starea flotei acum: bara + rândurile care deschid lista ─────────────────────────────────────────
// Cifrele sunt EXACT cele de pe web: le numără serverul (GET /api/dashboard), în clipa încărcării —
// În mișcare = movingCount, Staționat = stationatCount, Oprit = online − cele două, Offline = offlineCount.
// Unde duce fiecare rând (ecranul Vehicule are doar filtrele Pornit / În mișcare / Staționat / Oprit):
//  • „În mișcare" și „Staționat" → lista din Vehicule pe aceeași stare. Acolo cifra e live și fără „ține minte
//    mișcarea" — poate diferi cu o mașină care tocmai a plecat sau a oprit, la fel ca pe web între Statistici și hartă.
//  • „Oprit" → lista „Oprit" din Vehicule, care (ca pe harta de pe web) cuprinde și mașinile fără semnal.
//    Rândul o spune, ca „Oprit 2" să nu pară greșit când lista are 5.
//  • „Offline" → lista pe nume a celor fără semnal, din aceleași date ca cifra (ca cartonașul „Fără semnal").
function BaraStare({ d, onRoute, onOffline }: { d: any; onRoute: (s: string) => void; onOffline: () => void }) {
  const moving = d.movingCount || 0, stat = d.stationatCount || 0;
  const oprit = Math.max(0, (d.onlineCount || 0) - moving - stat), offline = d.offlineCount || 0;
  const seg: { n: number; col: string; tc: string; lbl: string; sub?: string; go: () => void }[] = [
    { n: moving, col: 'var(--green)', tc: '#0f3d22', lbl: 'În mișcare', go: () => onRoute('moving') },
    { n: stat, col: 'var(--yellow)', tc: '#3a2e05', lbl: 'Staționat', go: () => onRoute('stationat') },
    { n: oprit, col: 'var(--red)', tc: '#fff', lbl: 'Oprit', sub: 'lista are și cele fără semnal', go: () => onRoute('oprit') },
    { n: offline, col: 'var(--text-muted)', tc: '#fff', lbl: 'Offline', go: onOffline },
  ];
  const tot = d.totalDevices || 0;
  return (
    <>
      <div class="sf-bar">
        {tot > 0
          ? seg.filter((s) => s.n > 0).map((s) => {
              const pct = Math.round((s.n / tot) * 100);
              return <span style={`flex:${s.n};background:${s.col};color:${s.tc}`}>{s.n / tot > 0.15 ? s.n + ' · ' + pct + '%' : ''}</span>;
            })
          : <span style="flex:1;color:var(--text-muted)">Fără vehicule</span>}
      </div>
      <div class="sf-stari">
        {seg.map((s) => (
          <button class="sf-stare" style={s.n > 0 ? undefined : 'opacity:.55'} onClick={s.go}>
            <i style={'background:' + s.col} /><span>{s.lbl}{s.sub ? <small>{s.sub}</small> : null}</span><b>{s.n}</b>
          </button>
        ))}
      </div>
    </>
  );
}

// ── „Fără semnal": cine tace, pe nume ────────────────────────────────────────────────────────────────
// Aceleași date ca cifra de pe cartonaș: vehiculele din flotă care nu mai transmit + cele care n-au transmis
// NICIODATĂ (nu au poziție, deci se numără separat). Suma lor = cifra, ca omul să nu caute vehicule lipsă.
// „Ultimul semnal" vine din lista live a telefonului — acolo stă ora ultimei poziții.
function ListaFaraSemnal({ d, onClose, onVeh }: { d: any; onClose: () => void; onVeh: (imei: string) => void }) {
  const tac: any[] = ((d.devices || []) as any[]).filter((v) => !v.isOnline);
  const niciodata = Math.max(0, (d.offlineCount || 0) - tac.length);
  const live = vehicles.value;
  const detalii = (v: any) => {
    const p = live.find((x) => x.imei === v.imei);
    return [v.plate && v.plate !== v.name ? v.plate : '', p && p.timestamp ? 'ultimul semnal ' + fmtAgo(p.timestamp) : ''].filter(Boolean).join(' · ');
  };
  return (
    <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="wifiOff" size={18} color="var(--red)" /> Fără semnal · {d.offlineCount || 0}</b>
          <button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          {!(d.offlineCount > 0) && <div class="sf-gol">Toate vehiculele transmit.</div>}
          {tac.map((v) => {
            const sub = detalii(v);
            return (
              <button class="sf-ag" onClick={() => onVeh(v.imei)}>
                <Icon name="wifiOff" size={18} color="var(--text-muted)" />
                <span class="t"><b>{v.name || v.imei}</b>{sub ? <small>{sub}</small> : null}</span>
                <Icon name="chevronR" size={16} color="var(--text-muted)" />
              </button>
            );
          })}
          {niciodata > 0 && (
            <div class="sf-liniste oprit">
              <Icon name="alert" size={16} color="var(--orange)" />
              <span>
                {(tac.length ? 'Încă ' : '') + (niciodata === 1 ? (tac.length ? 'un vehicul' : 'Un vehicul') + ' n-a transmis' : niciodata + ' vehicule n-au transmis')}
                {' niciodată: sunt înregistrate, dar n-au trimis nicio poziție până acum.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── „Agenții AI veghează flota" ──────────────────────────────────────────────────────────────────────
// Trei stări, ca pe web: agenți opriți / nimic de rezolvat / constatări strânse pe agent. În toate spune CE
// veghează și CÂND a verificat ultima dată — altfel „flota e curată" nu se deosebește de „funcția nu există".
// Numele și descrierile agenților vin de la server (GET /api/agents), nu dintr-o listă scrisă aici.
function AgentiVeghe({ nrVehicule, poateDeschide, onDeschide }: { nrVehicule: number; poateDeschide: boolean; onDeschide: () => void }) {
  const [st, setSt] = useState<{ list: AgentFinding[]; stare: any } | null | 'ascuns'>(null);
  useEffect(() => {
    Promise.all([Api.agentFindings(), Api.aiAgents().catch(() => null)])
      .then(([list, stare]) => setSt({ list: Array.isArray(list) ? list : [], stare }))
      .catch(() => setSt('ascuns')); // fără acces la agenți → secțiunea nu apare (ca pe web)
  }, []);
  if (st === 'ascuns') return null;
  if (!st) return null;
  const stare: any = st.stare;
  const activi: any[] = (stare && Array.isArray(stare.agents)) ? stare.agents : [];
  const nw = st.list.filter((f) => f.status === 'new');
  const cand = stare && stare.auto === false ? 'verificarea automată e oprită din Setări'
    : stare && stare.lastRun ? 'ultima verificare: ' + new Date(Number(stare.lastRun) || stare.lastRun).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'verifică din oră în oră';
  const numeAgent = (k: string) => (activi.find((a) => a.key === k) || {}).name || k;

  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const r = (s?: string) => (s && rank[s] != null ? rank[s] : 3);
  const pe: Record<string, { n: number; sev: string; veh: string[] }> = {};
  nw.forEach((f) => {
    const k = f.agent || 'altele';
    const g = pe[k] || (pe[k] = { n: 0, sev: 'info', veh: [] });
    g.n++;
    if (r(f.severity) < r(g.sev)) g.sev = f.severity || g.sev;
    if (f.imei && g.veh.indexOf(f.imei) < 0) g.veh.push(f.imei);
  });
  const chei = Object.keys(pe).sort((a, b) => r(pe[a].sev) - r(pe[b].sev) || pe[b].n - pe[a].n);

  return (
    <>
      <div class="sf-h">
        <Icon name="robot" size={14} /> Agenții AI veghează flota
        {poateDeschide && <button class="sf-link" onClick={onDeschide}>Vezi toate</button>}
      </div>
      <div class="muted" style="font-size:11.5px;margin:-4px 0 8px">{cand}</div>
      {chei.map((k) => {
        const g = pe[k];
        const ton = g.sev === 'critical' ? 'bad' : g.sev === 'warning' ? 'warn' : '';
        const txt = nrDe(g.n, 'constatare', 'constatări') + (g.veh.length ? ' · ' + nrDe(g.veh.length, 'vehicul', 'vehicule') : ' · pe toată flota');
        const inner = <><Icon name="robot" size={18} color="var(--text-muted)" /><span class="t"><b>{numeAgent(k)}</b><small>{txt}</small></span>{poateDeschide && <Icon name="chevronR" size={16} color="var(--text-muted)" />}</>;
        return poateDeschide
          ? <button class={'sf-ag ' + ton} onClick={onDeschide}>{inner}</button>
          : <div class={'sf-ag ' + ton}>{inner}</div>;
      })}
      {!nw.length && activi.length > 0 && (
        <div class="sf-liniste"><Icon name="check" size={16} color="var(--accent)" /> Nimic de rezolvat. Agenții au verificat și n-au găsit probleme.</div>
      )}
      {activi.length > 0
        ? (
          <div class="sf-veghe">
            <div class="cap">Ce urmăresc, non-stop pe {nrVehicule} {nrVehicule === 1 ? 'vehicul' : 'vehicule'}</div>
            {activi.map((a) => <div class="r"><b>{a.name}</b>{a.desc ? ' — ' + a.desc : ''}</div>)}
          </div>
        )
        : <div class="sf-liniste oprit"><Icon name="alert" size={16} color="var(--orange)" /> Agenții AI sunt opriți pentru firma asta.</div>}
    </>
  );
}

// ── Top km / Top consum: primele 5, cu bară ─────────────────────────────────────────────────────────
function Top({ list, cheie, unit, color, gol }: { list: any[]; cheie: 'km' | 'fuel'; unit: string; color: string; gol: string }) {
  const arr = (list || []).filter((v) => v[cheie] > 0).slice(0, 5);
  if (!arr.length) return <div class="sf-gol">{gol}</div>;
  const mx = Math.max(...arr.map((v) => v[cheie])) || 1;
  return (
    <div class="sf-prog">
      {arr.map((v) => (
        <div class="sf-prog-r">
          <div class="t"><span>{v.name || v.imei}</span><b style={'color:' + color}>{n1(v[cheie])}{unit}{cheie === 'fuel' && v.fuelEstimated ? <span class="sf-est">est.</span> : null}</b></div>
          <div class="tr"><i style={`width:${Math.round((v[cheie] / mx) * 100)}%;background:${color}`} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Un vehicul din flotă, cu cifrele zilei (coloanele tabelului de pe web) ────────────────────────────
function RandVehicul({ v, onClick }: { v: any; onClick: () => void }) {
  const [bg, col, lbl] = v.isMoving ? ['rgba(63,224,125,.14)', 'var(--green)', 'În mișcare']
    : v.isStationat ? ['rgba(234,179,8,.14)', 'var(--yellow)', 'Staționat']
      : v.isOnline ? ['rgba(239,68,68,.14)', 'var(--red)', 'Oprit']
        : ['rgba(138,147,163,.16)', 'var(--text-muted)', 'Offline'];
  const cel = (et: string, val: any, extra?: any, stil?: string) => (
    <span><em>{et}</em>{val == null ? <b class="gol">–</b> : <b style={stil}>{val}{extra}</b>}</span>
  );
  return (
    <button class="sf-veh" onClick={onClick}>
      <div class="sf-veh-h">
        <b>{v.name || v.imei}</b>
        {v.plate && v.plate !== v.name ? <span class="pl">{v.plate}</span> : null}
        <span class="sf-pill" style={`background:${bg};color:${col}`}><i style={'background:' + col} />{lbl}</span>
      </div>
      <div class="sf-veh-g">
        {cel('Km azi', v.km > 0 ? n1(v.km) : null)}
        {cel('Consum', v.fuel > 0 ? n1(v.fuel) + ' L' : null, v.fuel > 0 && v.fuelEstimated ? <span class="sf-est">est.</span> : null)}
        {/* Peste 120 km/h cifra se face roșie, ca pe web. */}
        {cel('Vit. max', v.maxSpeed > 0 ? Math.round(v.maxSpeed) + ' km/h' : null, null, v.maxSpeed > 120 ? 'color:var(--red)' : undefined)}
        {cel('Motor', v.engineTime > 0 ? durata(v.engineTime) : null)}
        {cel('Combustibil', v.fuelLevel ? n1(v.fuelLevel) + ' L' : null)}
      </div>
    </button>
  );
}
