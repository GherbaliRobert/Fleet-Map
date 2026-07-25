import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api, type AgentFinding } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { showToast } from '../app/store';
import './reports.css';

// Panou operațional al agenților AI: rulare (per agent / toți) + constatările flotei (confirmă/ignoră).
const SEV: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

export function AiAgents() {
  const loc = useLocation();
  const [agents, setAgents] = useState<{ key: string; name: string; desc: string }[]>([]);
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(''); // cheia agentului în rulare ('all' sau key)
  const [summary, setSummary] = useState<string | null>(null);
  const [live, setLive] = useState<{ agent: string; findings: AgentFinding[] } | null>(null); // rezultatul agenților live
  const [err, setErr] = useState('');

  async function loadFindings() { try { setFindings(await Api.agentFindings()); } catch { /* */ } }
  useEffect(() => {
    setLoading(true);
    Promise.all([
      Api.aiAgents().then((d) => setAgents(d.agents || [])).catch((e: any) => setErr(e?.message || 'Eroare')),
      loadFindings(),
    ]).finally(() => setLoading(false));
  }, []);

  // Agenții „live" nu se salvează în agent_findings (stare de moment) → constatările lor se afișează
  // direct din răspuns, nu prin re-încărcarea listei (altfel: „N constatări" peste o listă goală).
  const LIVE = ['care', 'dispatch', 'optimize'];
  async function run(agent: string) {
    if (running) return;
    setRunning(agent); setSummary(null); setErr(''); setLive(null);
    try {
      const r = await Api.runAgents(agent);
      setSummary(r.aiSummary || null);
      const isLive = agent !== 'all' && LIVE.indexOf(agent) >= 0;
      if (isLive) {
        const f = r.findings || [];
        setLive({ agent, findings: f });
        showToast(f.length ? `${f.length} ${f.length === 1 ? 'semnalare' : 'semnalări'}` : 'Nicio problemă găsită', false);
      } else {
        showToast(r.message || `${r.findings?.length || 0} constatări · ${r.stored} noi`, false);
        await loadFindings();
      }
    } catch (e: any) { setErr(e?.message || 'Rulare eșuată'); showToast(e?.message || 'Rulare eșuată', true); }
    finally { setRunning(''); }
  }

  async function act(f: AgentFinding, action: 'dismiss' | 'ack') {
    if (f.id == null) return;
    setFindings((cur) => cur.filter((x) => x.id !== f.id));
    try { await Api.agentFindingAction(f.id, action); } catch { loadFindings(); }
  }

  // Constatare RA Care legată de o mentenanță (fkey care_due_<id>/care_km_<id>) → id-ul mentenanței
  const maintIdOf = (f: AgentFinding) => { const m = /^care_(?:due|km)_(\d+)$/.exec((f as any).fkey || ''); return m ? Number(m[1]) : null; };
  async function markMaintDone(f: AgentFinding, mid: number) {
    try {
      // PUT-ul suprascrie TOATE coloanele → trimitem rândul întreg (ca pe web); serverul ștampilează done_at/done_km + recurența
      const all: any[] = await Api.maintenance();
      const m = (all || []).find((x: any) => Number(x.id) === mid);
      if (!m) { showToast('Mentenanța nu a fost găsită', true); return; }
      m.status = 'done';
      await Api.updateMaintenance(mid, m);
      showToast('Mentenanță marcată ca efectuată ✓');
      act(f, 'ack');
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Agenți AI</div>
      </header>
      <div class="content has-tabbar" style="padding:14px">
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div> : (
          <>
            <button class="btn btn-primary btn-block" disabled={!!running} onClick={() => run('all')} style="margin-bottom:12px">
              {running === 'all' ? <span class="spin" style="border-top-color:#06210F" /> : <><Icon name="robot" size={18} /> Rulează toți agenții</>}
            </button>
            {err && <div class="center-msg" style="color:var(--red)">{err}</div>}
            {summary && (
              <div style="background:var(--bg-panel);border:1px solid var(--accent);border-radius:12px;padding:12px 13px;margin-bottom:12px;font-size:13px;line-height:1.5;color:var(--text-primary)">
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--accent);margin-bottom:5px"><Icon name="sparkles" size={13} /> Rezumat AI</div>
                {summary}
              </div>
            )}
            <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:16px">
              {agents.length === 0 && !err ? <div class="center-msg">Agenții AI nu sunt activați pentru compania ta. Contactează echipa RA Tracks pentru activare.</div> : null}
              {agents.map((a) => (
                <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 13px;display:flex;align-items:center;gap:11px">
                  <span style="width:38px;height:38px;border-radius:10px;background:var(--bg-dark);display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto"><Icon name="robot" size={19} color="var(--accent)" /></span>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:14px">{a.name}</div>
                    <div style="font-size:12px;color:var(--text-muted);line-height:1.4">{a.desc}</div>
                  </div>
                  <button class="btn" disabled={!!running} onClick={() => run(a.key)} style="flex:0 0 auto;padding:8px 12px;font-size:12.5px;border-radius:9px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);font-weight:700">
                    {running === a.key ? <span class="spin sm" /> : 'Rulează'}
                  </button>
                </div>
              ))}
            </div>
            {live ? (
              <div style="margin-bottom:16px">
                <div class="rp-table-title">Stare acum — {(agents.find((a) => a.key === live.agent) || { name: live.agent }).name} ({live.findings.length})</div>
                {live.findings.length === 0 ? (
                  <div class="center-msg" style="color:var(--accent)"><Icon name="check" size={15} /> Nicio problemă găsită acum.</div>
                ) : (
                  <div style="display:flex;flex-direction:column;gap:8px">
                    {live.findings.map((f) => (
                      <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 12px">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                          <span style={'width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:' + (SEV[f.severity || 'info'] || '#3b82f6')} />
                          <span style="font-weight:800;font-size:13.5px;flex:1;min-width:0">{f.title}</span>
                        </div>
                        {f.body ? <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">{f.body}</div> : null}
                        {maintIdOf(f) != null ? (
                          <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">
                            <button onClick={() => markMaintDone(f, maintIdOf(f)!)} style="flex:1;min-width:90px;background:var(--bg-dark);border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="wrench" size={13} /> Efectuat</button>
                            <button onClick={() => loc.route('/admin/maintenance')} style="flex:1;min-width:70px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="chevronR" size={13} /> Vezi</button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div class="rp-table-title">Constatări recente ({findings.length})</div>
            {findings.length === 0 ? <div class="center-msg">Nicio constatare. Rulează agenții pentru a verifica flota.</div> : (
              <div style="display:flex;flex-direction:column;gap:8px">
                {findings.map((f) => (
                  <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                      <span style={'width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:' + (SEV[f.severity || 'info'] || '#3b82f6')} />
                      <span style="font-weight:800;font-size:13.5px;flex:1;min-width:0">{f.title}</span>
                      <span style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">{f.agent}</span>
                    </div>
                    {f.body ? <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">{f.body}</div> : null}
                    <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">
                      <button onClick={() => act(f, 'ack')} style="flex:1;min-width:90px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="check" size={13} /> Am văzut</button>
                      <button onClick={() => act(f, 'dismiss')} style="flex:1;min-width:80px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="x" size={13} /> Ignoră</button>
                      {maintIdOf(f) != null ? (
                        <>
                          <button onClick={() => markMaintDone(f, maintIdOf(f)!)} style="flex:1;min-width:90px;background:var(--bg-dark);border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="wrench" size={13} /> Efectuat</button>
                          <button onClick={() => loc.route('/admin/maintenance')} style="flex:1;min-width:70px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="chevronR" size={13} /> Vezi</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
