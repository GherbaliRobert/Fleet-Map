import { useEffect, useState } from 'preact/hooks';
import { Api, type AgentFinding } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { showToast } from '../app/store';
import './reports.css';

// Panou operațional al agenților AI: rulare (per agent / toți) + constatările flotei (confirmă/ignoră).
const SEV: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

export function AiAgents() {
  const [agents, setAgents] = useState<{ key: string; name: string; desc: string }[]>([]);
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(''); // cheia agentului în rulare ('all' sau key)
  const [summary, setSummary] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function loadFindings() { try { setFindings(await Api.agentFindings()); } catch { /* */ } }
  useEffect(() => {
    setLoading(true);
    Promise.all([
      Api.aiAgents().then((d) => setAgents(d.agents || [])).catch((e: any) => setErr(e?.message || 'Eroare')),
      loadFindings(),
    ]).finally(() => setLoading(false));
  }, []);

  async function run(agent: string) {
    if (running) return;
    setRunning(agent); setSummary(null); setErr('');
    try {
      const r = await Api.runAgents(agent);
      setSummary(r.aiSummary || null);
      showToast(r.message || `${r.findings?.length || 0} constatări · ${r.stored} noi`, false);
      await loadFindings();
    } catch (e: any) { setErr(e?.message || 'Rulare eșuată'); showToast(e?.message || 'Rulare eșuată', true); }
    finally { setRunning(''); }
  }

  async function act(f: AgentFinding, action: 'dismiss' | 'ack') {
    if (f.id == null) return;
    setFindings((cur) => cur.filter((x) => x.id !== f.id));
    try { await Api.agentFindingAction(f.id, action); } catch { loadFindings(); }
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
              {agents.length === 0 && !err ? <div class="center-msg">Niciun agent activ pe acest plan.</div> : null}
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
                    <div style="display:flex;gap:8px;margin-top:9px">
                      <button onClick={() => act(f, 'ack')} style="flex:1;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="check" size={13} /> Am văzut</button>
                      <button onClick={() => act(f, 'dismiss')} style="flex:1;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:7px;font-size:12px;font-weight:700;font-family:inherit"><Icon name="x" size={13} /> Ignoră</button>
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
