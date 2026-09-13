import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api, type AgentFinding } from '../api/endpoints';
import { Icon, type IconName } from '../components/Icon';
import { me, showToast } from '../app/store';
import './reports.css';

// Pagina „Agenți AI" — oglinda paginii de pe web (public/index.html: renderAgentsPage / agpOpen / agpLiveRefresh).
// Agenții „live" calculează starea de ACUM la cerere, NU se salvează pe server și NU pornesc AI-ul plătit.
// Oglindește LIVE_AGENTS din server.js.
const LIVE = ['dispatch', 'care', 'optimize', 'compliance', 'client'];
const ORDER = ['watch', 'dispatch', 'care', 'optimize', 'compliance', 'client'];
// Doar prezentare (iconiță + titlul listei de stare). Numele, rolul și descrierea vin de la server (sursă unică).
const ICON: Record<string, IconName> ={ watch: 'shield', dispatch: 'compass', care: 'wrench', optimize: 'gauge', compliance: 'disc', client: 'report' };
const FEED_HEAD: Record<string, string> = { dispatch: 'Disponibile acum', care: 'Scadențe acum', optimize: 'Scor eco — azi', compliance: 'Ore de condus — azi', client: 'Sinteza zilei' };
// Explicația lungă de pe pagina agentului — aceleași texte ca pe web (AGP_TUT[k].face în public/index.html).
// Serverul trimite doar descrierea scurtă (folosită pe card); dacă lipsește o cheie, rămâne descrierea scurtă.
const TUT_FACE: Record<string, string> = {
  watch: 'Veghează non-stop și te anunță la: vehicul offline (fără semnal), posibil furt de combustibil, scădere bruscă de combustibil, ralanti prelungit și tahograf neconfigurat pe camioane.',
  dispatch: 'Îți arată ce vehicule sunt libere ACUM (online și oprite) și, după-amiaza, care au rulat foarte puțin (subutilizate).',
  care: 'Urmărește ITP, RCA/asigurare, reviziile și intervalul de service (pe dată sau pe km din bord) și te avertizează înainte de scadență.',
  optimize: 'Dă un scor eco /100 per vehicul (penalizează accelerările/frânările bruște, virajele dure, depășirile și ralanti-ul) și estimează risipa de combustibil la ralanti, în lei.',
  compliance: 'Se aplică DOAR vehiculelor cu tahograf (peste 3,5 t — camioane, autocare). Turismele nu intră sub Reg. CE 561/2006 și sunt ignorate. Estimează din GPS orele de condus (continuu și zilnic) și te avertizează ÎNAINTE de depășire, nu după.',
  client: 'Rezumă activitatea zilei într-un singur loc: km parcurși, vehicule active și nefolosite, cel mai activ vehicul și comparația cu ieri la aceeași oră. În plus, centralizează ce au semnalat ceilalți agenți (RA Watch, RA Care, RA Optimize, RA Compliance).',
};
// Ce a verificat agentul — pentru mesajul „Totul e în regulă" (AGP_META[k].checks pe web).
const CHECKS: Record<string, string> = {
  watch: 'fiecare vehicul pentru semnal (offline), ralanti prelungit, scădere și furt de combustibil și tahograf neconfigurat',
  dispatch: 'ce vehicule sunt disponibile acum și care sunt subutilizate',
  care: 'scadențele de ITP, RCA, revizii și intervalele de service',
  optimize: 'scorul eco, frânările/accelerările bruște, viteza și risipa la ralanti',
  compliance: 'orele de condus continuu și zilnic la vehiculele cu tahograf (Reg. 561)',
  client: 'activitatea zilei și concluziile celorlalți agenți',
};

type AgentMeta = { key: string; name: string; role?: string; desc: string };
type ClientSummary = {
  fleetSize: number; active: number; unused: number; totalKm: number; ydKm: number | null; pct: number | null;
  top: { name: string; km: number } | null; issues?: { key: string; agent: string; text: string }[];
};
type LiveState = { findings: AgentFinding[]; checkedAt?: string; evaluated?: number; monitored?: number; skipped?: number; summary?: ClientSummary; error?: string };

const isLive = (k?: string) => !!k && LIVE.indexOf(k) >= 0;
const isNew = (f: AgentFinding) => !f.status || f.status === 'new'; // „Am văzut"/„Ignoră" le scot definitiv din listă
const sevCol = (s?: string) => (s === 'critical' ? 'var(--red)' : s === 'warning' ? 'var(--orange)' : 'var(--accent)');
const sevRank = (s?: string) => (s === 'critical' ? 2 : s === 'warning' ? 1 : 0);
const tsOf = (t?: string | null) => (t ? new Date(t).getTime() || 0 : 0);
const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const hm = (t: number | string) => new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
function ago(ts?: string | null) {
  const t = tsOf(ts); if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'acum';
  if (s < 3600) return 'acum ' + Math.round(s / 60) + 'm';
  if (s < 86400) return 'acum ' + Math.round(s / 3600) + 'h';
  return new Date(t).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
}
function whenLabel(ms: number) {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'azi ' + hm(ms);
  if (d.toDateString() === new Date(now.getTime() - 864e5).toDateString()) return 'ieri ' + hm(ms);
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }) + ' ' + hm(ms);
}
// Constatare RA Care legată de o mentenanță (fkey care_due_<id>/care_km_<id>) → id-ul mentenanței
const maintIdOf = (f: AgentFinding) => { const m = /^care_(?:due|km)_(\d+)$/.exec(f.fkey || ''); return m ? Number(m[1]) : null; };

// Mesajele „cinstite" când agentul live n-a găsit nimic (aceleași texte ca pe web).
function okMsg(k: string, st: LiveState): { t: string; b: string } {
  if (k === 'dispatch') return { t: 'Niciun vehicul disponibil acum', b: 'Momentan niciun vehicul online și oprit, gata de o cursă. Apasă „Dispecerizare” ca să cauți cel mai apropiat vehicul de o destinație.' };
  if (k === 'care') return { t: 'Nicio scadență acum — totul e în regulă', b: 'N-am găsit revizii, ITP/RCA sau service aproape de scadență. Poți sta liniștit.' };
  if (k === 'optimize') {
    const ev = num(st.evaluated);
    if (ev === 0) return { t: 'Încă n-avem date de rulaj azi', b: 'Flota n-a rulat suficient azi ca să evaluăm consumul / scorul eco. Revino după ce vehiculele rulează.' };
    if (ev != null && ev > 0) return { t: ev === 1 ? 'Vehiculul evaluat a condus eco azi' : `Toate cele ${ev} vehicule au condus eco azi`, b: 'Niciun vehicul sub pragul de scor eco și fără risipă notabilă la ralanti. Bravo flotei.' };
    return { t: 'Conducere eco — totul e în regulă', b: 'Niciun vehicul sub pragul de scor eco azi.' };
  }
  if (k === 'compliance') {
    // RA Compliance se aplică DOAR vehiculelor cu tahograf (>3,5 t). Turismele nu intră sub Reg. 561.
    const mon = num(st.monitored), skp = num(st.skipped) || 0;
    if (mon === 0) return { t: 'Niciun vehicul cu tahograf în flotă', b: 'Agentul se aplică doar vehiculelor de peste 3,5 t (camioane, autocare) — turismele nu intră sub Reg. CE 561/2006' + (skp ? ` (${skp} ${skp === 1 ? 'vehicul ignorat' : 'vehicule ignorate'}).` : '.') };
    if (mon != null && mon > 0) return { t: mon === 1 ? 'Vehiculul cu tahograf e în limite' : `Toate cele ${mon} vehicule cu tahograf sunt în limite`, b: 'Nicio depășire de conducere continuă (4h30) sau zilnică (9h) azi' + (skp ? ` · ${skp} ${skp === 1 ? 'turism ignorat' : 'turisme ignorate'} (nu intră sub Reg. 561).` : '.') };
    return { t: 'Ore de condus — în limite', b: 'Nicio depășire azi la vehiculele cu tahograf.' };
  }
  return { t: 'Totul e în regulă', b: 'Agentul n-a găsit nimic de semnalat acum.' };
}

const BTN = 'flex:1;min-width:80px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:5px';
const PANEL = 'background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 12px';
// Spinner mic: clasa globală `.spin` are 22px, iar `spin sm` nu are regulă globală → dimensiunea se dă aici.
const SPIN_SM = 'display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:-2px';

export function AiAgents() {
  const loc = useLocation();
  const openKey = String(((loc.query || {}) as any).agent || '');
  // Super-adminul primește constatările TUTUROR firmelor (serverul nu filtrează fără companyId), iar pe telefon
  // nu există selectorul de companie de pe web → fără „Toate văzute", ca să nu închidă alertele clienților dintr-o apăsare.
  const isSuper = !!me.value?.isSuper;
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [runInfo, setRunInfo] = useState<{ lastRun: string | null; auto: boolean }>({ lastRun: null, auto: true });
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [liveBusy, setLiveBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(''); // 'all' sau cheia agentului
  const [summary, setSummary] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [ackBusy, setAckBusy] = useState(false);
  const [err, setErr] = useState('');
  const seq = useRef<Record<string, number>>({});
  const ready = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  async function loadFindings() { try { const l = await Api.agentFindings(); setFindings(Array.isArray(l) ? l : []); } catch { /* */ } }

  // Starea de ACUM a agenților live, din același endpoint ca web-ul (fără salvare, fără AI).
  function refreshLive(keys: string[]) {
    return Promise.all(keys.filter(isLive).map(async (k) => {
      const my = (seq.current[k] = (seq.current[k] || 0) + 1);
      setLiveBusy((b) => ({ ...b, [k]: true }));
      let next: LiveState;
      try {
        const d: any = await Api.agentLive(k);
        next = { ...(d || {}), findings: Array.isArray(d && d.findings) ? d.findings : [] };
      } catch (e: any) { next = { findings: [], error: e?.message || 'Nu am putut verifica acum' }; }
      if (seq.current[k] !== my) return; // între timp a pornit o verificare mai nouă
      setLive((cur) => ({ ...cur, [k]: next }));
      setLiveBusy((b) => ({ ...b, [k]: false }));
    }));
  }

  useEffect(() => {
    (async () => {
      let keys: string[] = [];
      try {
        const d: any = await Api.aiAgents();
        const list: AgentMeta[] = ((d && d.agents) || []).slice().sort((a: AgentMeta, b: AgentMeta) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
        setAgents(list);
        setRunInfo({ lastRun: (d && d.lastRun) || null, auto: !(d && d.auto === false) });
        keys = list.map((a) => a.key);
      } catch (e: any) { setErr(e?.message || 'Eroare'); }
      await loadFindings();
      setLoading(false);
      ready.current = true;
      refreshLive(keys); // la deschiderea paginii, ca pe web — nu doar după „Rulează"
    })();
  }, []);

  // Deschiderea unui agent live recitește starea lui (ca pe web: „se actualizează când deschizi pagina").
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (ready.current && isLive(openKey) && agents.some((a) => a.key === openKey)) refreshLive([openKey]);
  }, [openKey]);

  const openAgent = (k: string) => loc.route('/ai-agents?agent=' + encodeURIComponent(k));
  const nameOf = (k?: string) => (agents.find((a) => a.key === k) || { name: k || 'Agent' }).name;

  async function run(k: string) {
    if (running) return;
    setErr('');
    if (isLive(k)) { setRunning(k); await refreshLive([k]); setRunning(''); return; }
    setRunning(k);
    if (k === 'all') setSummary(null);
    try {
      const r = await Api.runAgents(k);
      const now = Date.now();
      setLastRun((cur) => { const n = { ...cur }; (k === 'all' ? agents.map((a) => a.key) : [k]).forEach((x) => { n[x] = now; }); return n; });
      if (k === 'all') setSummary(r.aiSummary || null);
      // „stored" = constatări NOI salvate; agenții live nu se salvează → numărul corespunde listei de mai jos.
      const n = r.stored || 0;
      showToast(r.message || (n ? `${n} ${n === 1 ? 'semnalare nouă' : 'semnalări noi'}` : 'Verificare terminată · nicio semnalare nouă'));
      if (k === 'all') refreshLive(agents.map((a) => a.key));
      await loadFindings();
    } catch (e: any) { setErr(e?.message || 'Rulare eșuată'); showToast(e?.message || 'Rulare eșuată', true); }
    finally { setRunning(''); }
  }

  // „Am văzut" / „Ignoră": se salvează pe server (același endpoint ca web-ul) → nu mai revin la redeschidere.
  async function act(f: AgentFinding, action: 'dismiss' | 'ack', silent = false) {
    const id = f.id;
    if (id == null || pending[id]) return;
    setPending((p) => ({ ...p, [id]: true }));
    try {
      await Api.agentFindingAction(id, action);
      const st = action === 'dismiss' ? 'dismissed' : 'acknowledged';
      setFindings((cur) => cur.map((x) => (x.id === id ? { ...x, status: st } : x)));
      if (!silent) showToast(action === 'dismiss' ? 'Semnalare ignorată' : '✓ Marcat ca văzut');
    } catch (e: any) {
      showToast(e?.message || 'Nu s-a putut', true);
      if (e && e.status === 404) loadFindings(); // nu mai există pe server → reîmprospătăm lista
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function ackAll(list: AgentFinding[]) {
    const news = list.filter((f) => f.id != null && isNew(f));
    if (!news.length || ackBusy || isSuper) return;
    if (!confirm(`Marchezi toate cele ${news.length} semnalări ca văzute?`)) return;
    setAckBusy(true);
    const results = await Promise.all(news.map((f) => Api.agentFindingAction(f.id as number, 'ack').then(() => true).catch(() => false)));
    const okIds = new Set(news.filter((_, i) => results[i]).map((f) => f.id));
    setFindings((cur) => cur.map((x) => (okIds.has(x.id) ? { ...x, status: 'acknowledged' } : x)));
    setAckBusy(false);
    showToast(okIds.size === news.length ? '✓ Toate marcate ca văzute' : `${okIds.size}/${news.length} marcate`, okIds.size === 0);
  }

  async function markMaintDone(f: AgentFinding, mid: number) {
    try {
      // PUT-ul suprascrie TOATE coloanele → trimitem rândul întreg (ca pe web); serverul ștampilează done_at/done_km + recurența
      const all: any[] = await Api.maintenance();
      const m = (all || []).find((x: any) => Number(x.id) === mid);
      if (!m) { showToast('Mentenanța nu a fost găsită', true); return; }
      m.status = 'done';
      await Api.updateMaintenance(mid, m);
      showToast('Mentenanță marcată ca efectuată ✓');
      if (f.id != null) act(f, 'ack', true); else refreshLive(['care']); // agent live → recitim starea de acum
    } catch (e: any) { showToast(e?.message || 'Eroare la marcarea mentenanței', true); }
  }

  // ── Date derivate ──
  // Constatările salvate (azi doar RA Watch): numai cele încă deschise. Agenții live nu au istoric salvat.
  const recent = findings.filter((f) => !isLive(f.agent) && isNew(f)).sort((a, b) => tsOf(b.created_at) - tsOf(a.created_at));
  function findingsOf(k: string): AgentFinding[] {
    const st = live[k];
    const base = isLive(k)
      ? ((st && st.findings) || []).map((f) => ({ ...f, created_at: f.created_at || st.checkedAt }))
      : recent.filter((f) => f.agent === k);
    return base.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || tsOf(b.created_at) - tsOf(a.created_at));
  }
  const cCrit = recent.filter((f) => f.severity === 'critical').length;
  const cWarn = recent.filter((f) => f.severity === 'warning').length;
  const cInfo = recent.length - cCrit - cWarn;
  const openMeta = openKey ? agents.find((a) => a.key === openKey) || null : null;

  // ── Bucăți de interfață ──
  const ic = (name: IconName, color?: string) => <Icon name={name} size={13} color={color} style="vertical-align:-2px" />;
  const dot = (c: string) => <span style={`width:8px;height:8px;border-radius:50%;flex:0 0 auto;margin-top:5px;background:${c}`} />;
  const line = (c: string, body: any, muted = false) => (
    <div style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.4">
      {dot(c)}<span style={muted ? 'color:var(--text-muted)' : 'color:var(--text-primary)'}>{body}</span>
    </div>
  );
  const pill = (c: string, body: any) => (
    <span style={`flex:0 0 auto;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;border:1px solid ${c};color:${c};white-space:nowrap;display:inline-flex;align-items:center;gap:4px`}>{body}</span>
  );

  function statusLine(k: string, fs: AgentFinding[]) {
    const st = live[k];
    if (isLive(k) && !st) return line('var(--text-muted)', <><span class="spin" style={SPIN_SM} /> Se verifică flota…</>, true);
    if (st && st.error) return line('var(--text-muted)', <>{ic('alertO')} {st.error}</>, true);
    const last = fs[0];
    if (last) {
      const c = sevCol(last.severity);
      // RA Care: pe card doar TOTALUL scadențelor — detaliile la „Deschide agentul".
      if (k === 'care') { const n = fs.length || 1; return line(c, <>Ai <b>{n}</b> {n === 1 ? 'scadență' : 'scadențe'} de urmărit</>); }
      // RA Optimize: câte vehicule au scor slab (fără notificarea de ralanti pe flotă).
      const eco = fs.filter((f) => String(f.fkey || '').indexOf('opt_eco') === 0).length;
      if (k === 'optimize' && eco > 0) return line(c, <><b>{eco}</b> cu scor slab</>);
      // RA Compliance: „peste limită" doar dacă chiar s-a depășit; altfel sunt avertismente dinainte de limită.
      if (k === 'compliance') {
        const over = last.severity === 'critical' || /depășit|peste/i.test(last.title || '');
        return line(c, <><b>{fs.length}</b> {over ? 'peste limită' : 'aproape de limită'}</>);
      }
      return line(c, <>{last.title} <span style="color:var(--text-muted)">· {ago(last.created_at)}</span></>);
    }
    if (k === 'optimize' && st) {
      const ev = num(st.evaluated);
      if (ev === 0) return line('var(--text-muted)', <>{ic('clock')} Încă n-avem date de rulaj azi</>, true);
      if (ev != null && ev > 0) return line('var(--accent)', <>{ic('check', 'var(--accent)')} {ev === 1 ? 'Vehiculul evaluat a condus eco azi' : <>Toate cele <b>{ev}</b> au condus eco azi</>}</>, true);
    }
    if (k === 'compliance' && st) {
      const mon = num(st.monitored);
      if (mon === 0) return line('var(--text-muted)', <>{ic('alertO')} Niciun vehicul cu tahograf în flotă</>, true);
      if (mon != null && mon > 0) return line('var(--accent)', <>{ic('check', 'var(--accent)')} {mon === 1 ? 'Vehiculul cu tahograf e în limite' : <>Toate cele <b>{mon}</b> cu tahograf, în limite</>}</>, true);
    }
    const t = lastRun[k];
    return line('var(--accent)', <>{ic('check', 'var(--accent)')} Totul e în regulă{t ? ' · verificat ' + hm(t) : ''}</>, true);
  }

  function badge(k: string, fs: AgentFinding[]) {
    const st = live[k];
    if (isLive(k) && !st) return <span class="spin" style={SPIN_SM + ';flex:0 0 auto'} />;
    if (st && st.error) return null;
    const n = fs.length, sev = (fs[0] && fs[0].severity) || 'info', c = sevCol(sev);
    // RA Client e o SINTEZĂ (are mereu o constatare) — „1 semnalare" ar fi înșelător.
    if (k === 'client') return n && sev !== 'info' ? pill(c, 'de verificat') : pill('var(--accent)', <><Icon name="report" size={11} /> sinteză</>);
    return n ? pill(c, `${n} ${n === 1 ? 'semnalare' : 'semnalări'}`) : pill('var(--accent)', <><Icon name="check" size={11} /> ok</>);
  }

  const tile = (k: string, size = 38) => (
    <span style={`width:${size}px;height:${size}px;border-radius:10px;background:var(--bg-dark);display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto`}>
      <Icon name={ICON[k] || 'robot'} size={Math.round(size / 2)} color="var(--accent)" />
    </span>
  );

  // Constatare salvată (RA Watch): se închide cu „Am văzut" / „Ignoră" — salvat pe server.
  function savedCard(f: AgentFinding, showAgent: boolean) {
    const mid = maintIdOf(f);
    const busy = f.id != null && !!pending[f.id];
    return (
      <div key={f.id} style={PANEL + (busy ? ';opacity:.5;pointer-events:none' : '')}>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style={`width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:${sevCol(f.severity)}`} />
          <span style="font-weight:800;font-size:13.5px;flex:1;min-width:0">{f.title}</span>
        </div>
        {f.body ? <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">{f.body}</div> : null}
        <div style="font-size:11px;color:var(--text-muted);margin-top:5px">{showAgent ? nameOf(f.agent) + ' · ' : ''}{ago(f.created_at)}</div>
        <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">
          <button onClick={() => act(f, 'ack')} style={BTN + ';min-width:90px'}><Icon name="check" size={13} /> Am văzut</button>
          <button onClick={() => act(f, 'dismiss')} style={BTN + ';color:var(--text-muted)'}><Icon name="x" size={13} /> Ignoră</button>
          {mid != null ? (
            <>
              <button onClick={() => markMaintDone(f, mid)} style={BTN + ';min-width:90px;border-color:var(--accent);color:var(--accent)'}><Icon name="wrench" size={13} /> Efectuat</button>
              <button onClick={() => loc.route('/admin/maintenance')} style={BTN + ';min-width:70px'}><Icon name="chevronR" size={13} /> Vezi</button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // Semnalare live (stare de acum): nu se „bifează", dar scadența RA Care se poate rezolva pe loc.
  function liveCard(f: AgentFinding, k: string, i: number) {
    const mid = k === 'care' ? maintIdOf(f) : null;
    return (
      <div key={(f.fkey || '') + i} style={PANEL}>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style={`width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:${sevCol(f.severity)}`} />
          <span style="font-weight:800;font-size:13.5px;flex:1;min-width:0">{f.title}</span>
        </div>
        {f.body ? <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">{f.body}</div> : null}
        {mid != null ? (
          <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">
            <button onClick={() => markMaintDone(f, mid)} style={BTN + ';min-width:90px;border-color:var(--accent);color:var(--accent)'}><Icon name="wrench" size={13} /> Efectuat</button>
            <button onClick={() => loc.route('/admin/maintenance')} style={BTN + ';min-width:70px'}><Icon name="chevronR" size={13} /> Vezi mentenanța</button>
          </div>
        ) : null}
      </div>
    );
  }

  // RA Client — sinteza zilei, afișată aerisit: cifre mari + lista „De verificat".
  function clientCard(s: ClientSummary) {
    const big = (val: any, lbl: string, col?: string) => (
      <div style="flex:1 1 calc(50% - 5px);min-width:120px;background:var(--bg-dark);border:1px solid var(--border);border-radius:11px;padding:11px 13px">
        <div style={'font-size:21px;font-weight:800;line-height:1.15' + (col ? ';color:' + col : '')}>{val}</div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-top:2px">{lbl}</div>
      </div>
    );
    const pct = num(s.pct);
    const issues = Array.isArray(s.issues) ? s.issues : [];
    return (
      <div style={PANEL}>
        <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px">
          {big(<>{s.totalKm} <span style="font-size:12px;font-weight:600;color:var(--text-muted)">km</span></>, 'Parcurși azi')}
          {big(<>{s.active}<span style="font-size:13px;font-weight:600;color:var(--text-muted)">/{s.fleetSize}</span></>, 'Vehicule active')}
          {big(s.unused, 'Nefolosite azi', s.unused > 0 ? 'var(--orange)' : undefined)}
          {big(pct == null ? '—' : (pct >= 0 ? '+' : '') + pct + '%', 'Față de ieri', pct == null ? undefined : pct >= 0 ? 'var(--accent)' : 'var(--orange)')}
        </div>
        {(s.top || s.ydKm != null) ? (
          <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">
            {s.top ? <div>{ic('truck', 'var(--accent)')} Cel mai activ: <b>{s.top.name}</b> — {s.top.km} km</div> : null}
            {s.ydKm != null ? <div>{ic('clock', 'var(--text-muted)')} Ieri, până la aceeași oră: <b>{s.ydKm} km</b></div> : null}
          </div>
        ) : null}
        {issues.length ? (
          <div style="border-top:1px solid var(--border);padding-top:11px">
            <div style="font-size:11px;font-weight:800;letter-spacing:.4px;color:var(--text-muted);margin-bottom:7px">DE VERIFICAT</div>
            {issues.map((b) => {
              const can = agents.some((a) => a.key === b.key);
              return (
                <button key={b.key} onClick={() => { if (can) openAgent(b.key); }} style="display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:var(--bg-dark);border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:6px;color:var(--text-primary);font-family:inherit;font-size:12.5px">
                  <span style="width:7px;height:7px;border-radius:50%;background:var(--orange);flex:none" />
                  <span style="flex:1;min-width:0"><b>{b.text}</b> <span style="color:var(--text-muted)">· {b.agent}</span></span>
                  {can ? <Icon name="chevronR" size={13} color="var(--text-muted)" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div style="border-top:1px solid var(--border);padding-top:11px;font-size:12.5px;color:var(--text-muted)">
            {ic('check', 'var(--accent)')} Ceilalți agenți n-au semnalat nimic — zi curată.
          </div>
        )}
      </div>
    );
  }

  // Doar pentru super-admin: explică de ce lipsește „Toate văzute" pe telefon.
  const superNote = isSuper ? (
    <div style="font-size:11.5px;color:var(--text-muted);line-height:1.45;margin-bottom:8px">
      {ic('alertO')} Ca super-admin vezi aici semnalările tuturor firmelor, iar pe telefon nu poți alege compania. De aceea le închizi una câte una, ca să nu marchezi din greșeală alertele unui client.
    </div>
  ) : null;

  const okBox = (t: string, b: string) => (
    <div style={PANEL}>
      <div style="font-weight:800;font-size:13.5px;margin-bottom:4px">{ic('check', 'var(--accent)')} {t}</div>
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">{b}</div>
    </div>
  );

  function liveFeed(k: string) {
    const st = live[k];
    if (!st || liveBusy[k]) return <div class="center-msg"><span class="spin" style={SPIN_SM} /> Se verifică flota…</div>;
    if (st.error) return <div class="center-msg" style="color:var(--red)">{st.error}</div>;
    if (k === 'client' && st.summary) return clientCard(st.summary);
    if (st.findings.length) return <div style="display:flex;flex-direction:column;gap:8px">{st.findings.map((f, i) => liveCard(f, k, i))}</div>;
    const m = okMsg(k, st);
    return okBox(m.t, m.b);
  }

  function detail(a: AgentMeta) {
    const k = a.key;
    const lv = isLive(k);
    const st = live[k];
    const fs = lv ? [] : recent.filter((f) => f.agent === k);
    const lastMs = Math.max(lastRun[k] || 0, tsOf(runInfo.lastRun));
    return (
      <>
        <div style={PANEL + ';display:flex;align-items:center;gap:11px;margin-bottom:10px'}>
          {tile(k, 46)}
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:16px">{a.name}</div>
            {a.role ? <div style="font-size:12px;color:var(--text-muted)">{a.role}</div> : null}
          </div>
          {pill('var(--accent)', 'activ')}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">{TUT_FACE[k] || a.desc}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-primary" disabled={!!running || !!liveBusy[k]} onClick={() => run(k)} style="flex:1 1 auto;padding:9px 14px;font-size:13px">
            {running === k ? <span class="spin" style={SPIN_SM + ';border-top-color:#06210F'} /> : <><Icon name="zap" size={15} /> Rulează</>}
          </button>
          {k === 'dispatch' ? (
            <button onClick={() => loc.route('/dispatch')} style={BTN + ';flex:1 1 auto;padding:9px 12px;font-size:12.5px'}>
              <Icon name="compass" size={14} color="var(--accent)" /> Dispecerizare — alege o destinație
            </button>
          ) : null}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div class="rp-table-title" style="flex:1;margin:0">{lv ? FEED_HEAD[k] || 'Stare acum' : 'Verificări & alerte'}</div>
          {!lv && fs.length > 1 && !isSuper ? (
            <button disabled={ackBusy} onClick={() => ackAll(fs)} style={BTN + ';flex:0 0 auto;padding:5px 10px'}>
              {ackBusy ? <span class="spin" style={SPIN_SM} /> : <><Icon name="check" size={13} color="var(--accent)" /> Toate văzute ({fs.length})</>}
            </button>
          ) : null}
        </div>
        {!lv && fs.length > 1 ? superNote : null}
        {lv ? liveFeed(k) : fs.length ? (
          <div style="display:flex;flex-direction:column;gap:8px">{fs.map((f) => savedCard(f, false))}</div>
        ) : okBox('Totul e în regulă — nicio alertă', 'Am verificat ' + (CHECKS[k] || 'flota') + '. N-am găsit nicio problemă — poți sta liniștit.')}
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:12px;line-height:1.45">
          {ic('clock')}{' '}
          {lv
            ? (st && st.checkedAt && !liveBusy[k]
              ? <>Verificat: <b>{new Date(st.checkedAt).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b> · se actualizează când deschizi pagina sau apeși „Rulează”.</>
              : 'Se verifică…')
            : <>{lastMs ? <>Ultima rulare: <b>{whenLabel(lastMs)}</b></> : 'Nicio rulare încă'} · {runInfo.auto ? 'verifică automat din oră în oră' : 'verificarea automată e oprită (rulează manual)'}</>}
        </div>
      </>
    );
  }

  const chip = (body: any, c?: string) => (
    <span style="font-size:12px;padding:4px 10px;border-radius:999px;background:var(--bg-panel);border:1px solid var(--border);display:inline-flex;align-items:center;gap:5px">
      {c ? <span style={`width:7px;height:7px;border-radius:50%;background:${c}`} /> : null}{body}
    </span>
  );

  function grid() {
    return (
      <>
        {agents.length ? (
          <>
            <div style="font-size:12.5px;color:var(--text-muted);line-height:1.45;margin-bottom:10px">Echipa ta de agenți care monitorizează flota automat. Apasă un agent pentru pagina lui.</div>
            <button class="btn btn-primary btn-block" disabled={!!running} onClick={() => run('all')} style="margin-bottom:12px">
              {running === 'all' ? <span class="spin" style="border-top-color:#06210F" /> : <><Icon name="robot" size={18} /> Rulează toți agenții</>}
            </button>
          </>
        ) : null}
        {summary && (
          <div style="background:var(--bg-panel);border:1px solid var(--accent);border-radius:12px;padding:12px 13px;margin-bottom:12px;font-size:13px;line-height:1.5;color:var(--text-primary)">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--accent);margin-bottom:5px"><Icon name="sparkles" size={13} /> Rezumat AI</div>
            {summary}
          </div>
        )}
        {agents.length ? (
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            {chip(<><b>{recent.length}</b> constatări noi</>)}
            {cCrit ? chip(<><b>{cCrit}</b> critice</>, 'var(--red)') : null}
            {cWarn ? chip(<><b>{cWarn}</b> avertismente</>, 'var(--orange)') : null}
            {cInfo ? chip(<><b>{cInfo}</b> informative</>, 'var(--accent)') : null}
          </div>
        ) : null}
        <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:16px">
          {agents.length === 0 && !err ? <div class="center-msg">Agenții AI nu sunt activați pentru compania ta. Scrie-ne și configurăm agenții pentru flota ta — activarea se face de către echipa RA Tracks, pe oferta ta personalizată.</div> : null}
          {agents.map((a) => {
            const fs = findingsOf(a.key);
            return (
              <button key={a.key} type="button" onClick={() => openAgent(a.key)} style="width:100%;text-align:left;font-family:inherit;color:var(--text-primary);background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 13px;display:block">
                <div style="display:flex;align-items:center;gap:11px">
                  {tile(a.key)}
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:14px">{a.name}</div>
                    {a.role ? <div style="font-size:11.5px;color:var(--text-muted)">{a.role}</div> : null}
                  </div>
                  {badge(a.key, fs)}
                </div>
                <div style="font-size:12px;color:var(--text-muted);line-height:1.4;margin-top:8px">{a.desc}</div>
                <div style="border-top:1px solid var(--border);margin:9px 0" />
                {statusLine(a.key, fs)}
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;font-size:12px;font-weight:700;color:var(--accent);margin-top:8px">
                  Deschide agentul <Icon name="chevronR" size={13} />
                </div>
              </button>
            );
          })}
        </div>
        {agents.length ? (
          <>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div class="rp-table-title" style="flex:1;margin:0">Constatări recente ({recent.length})</div>
              {recent.length > 1 && !isSuper ? (
                <button disabled={ackBusy} onClick={() => ackAll(recent)} style={BTN + ';flex:0 0 auto;padding:5px 10px'}>
                  {ackBusy ? <span class="spin" style={SPIN_SM} /> : <><Icon name="check" size={13} color="var(--accent)" /> Toate văzute ({recent.length})</>}
                </button>
              ) : null}
            </div>
            {recent.length > 1 ? superNote : null}
            {recent.length === 0
              ? <div class="center-msg">Nicio constatare nouă. Rulează agenții pentru a verifica flota.</div>
              : <div style="display:flex;flex-direction:column;gap:8px">{recent.map((f) => savedCard(f, true))}</div>}
          </>
        ) : null}
      </>
    );
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{openMeta ? openMeta.name : 'Agenți AI'}</div>
      </header>
      <div class="content has-tabbar" style="padding:14px" ref={contentRef}>
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div> : (
          <>
            {err && <div class="center-msg" style="color:var(--red)">{err}</div>}
            {openMeta ? detail(openMeta) : grid()}
          </>
        )}
      </div>
    </div>
  );
}
