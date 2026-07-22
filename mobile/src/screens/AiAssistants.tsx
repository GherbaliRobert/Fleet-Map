import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon, type IconName } from '../components/Icon';
import './reports.css'; // .rp-periods / .rp-period / .center-msg

// Rosterul de asistenți AI (kind = eticheta din ai_usage pe server).
const ASSISTANTS: { kind: string; name: string; icon: IconName; color: string; desc: string }[] = [
  { kind: 'chat', name: 'Asistent AI', icon: 'robot', color: 'var(--accent)', desc: 'Chat despre flota live: unde sunt vehiculele, km azi, stare, combustibil.' },
  { kind: 'insight', name: 'RA Insight', icon: 'sparkles', color: 'var(--purple)', desc: 'Agent analitic peste rapoarte — răspunsuri și constatări din datele flotei.' },
  { kind: 'report', name: 'Rezumat rapoarte', icon: 'report', color: 'var(--orange)', desc: 'Rezumatul executiv (în cuvinte) al unui raport de flotă afișat.' },
  { kind: 'agents', name: 'Agenți AI', icon: 'alert', color: 'var(--red)', desc: 'Detectează anomalii (consum, viteză, trasee, mentenanță) și rezumă constatările.' },
];

type Days = 7 | 30 | 90 | 0;
function fmtN(n: any) { return (Number(n) || 0).toLocaleString('ro-RO'); }
function fmtTok(n: any) { const v = Number(n) || 0; if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return String(v); }
function fmtWhen(s: string | null | undefined) { if (!s) return null; const d = new Date(s); if (isNaN(d.getTime())) return null; return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }); }

export function AiAssistants() {
  const loc = useLocation();
  const [days, setDays] = useState<Days>(30);
  const [d, setD] = useState<Awaited<ReturnType<typeof Api.aiUsageStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    Api.aiUsageStats(days).then(setD).catch((e: any) => setErr(e?.message || 'Eroare')).finally(() => setLoading(false));
  }, [days]);

  const byKind: Record<string, any> = {};
  (d?.usage || []).forEach((u) => { byKind[u.kind] = u; });
  const totCalls = (d?.usage || []).reduce((s, u) => s + (Number(u.calls) || 0), 0);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Asistenți AI</div>
      </header>
      <div class="content has-tabbar">
        <div class="rp-periods" style="padding:12px 14px">
          {([7, 30, 90, 0] as Days[]).map((p) => (
            <button class={'rp-period' + (days === p ? ' on' : '')} onClick={() => setDays(p)}>{p === 0 ? 'Tot' : p + ' zile'}</button>
          ))}
        </div>
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : err ? <div class="center-msg" style="color:var(--red)">{err}</div>
            : (
              <div style="padding:0 14px 20px;display:flex;flex-direction:column;gap:10px">
                {ASSISTANTS.map((a) => {
                  const u = byKind[a.kind] || {};
                  const calls = Number(u.calls) || 0, used = calls > 0;
                  const last = fmtWhen(u.last_used);
                  const stats = [{ v: fmtN(calls), k: 'Apeluri' }, { v: fmtTok(u.input_tokens), k: 'Tokeni in' }, { v: fmtTok(u.output_tokens), k: 'Tokeni out' }];
                  return (
                    <div style={`background:var(--bg-panel);border:1px solid var(--border);border-top:3px solid ${a.color};border-radius:12px;padding:13px 14px`}>
                      <div style="display:flex;align-items:center;gap:11px;margin-bottom:8px">
                        <span style="width:40px;height:40px;border-radius:11px;background:var(--bg-dark);display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto">
                          <Icon name={a.icon} size={20} color={a.color} />
                        </span>
                        <div style="min-width:0">
                          <div style="font-weight:800;font-size:15px;color:var(--text-primary)">{a.name}</div>
                          <div style={`font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:${used ? 'var(--green)' : 'var(--text-muted)'}`}>
                            {used ? `${fmtN(calls)} ${calls === 1 ? 'utilizare' : 'utilizări'}` : 'disponibil · 0 utilizări'}
                          </div>
                        </div>
                      </div>
                      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45;margin-bottom:10px">{a.desc}</div>
                      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
                        {stats.map((s) => (
                          <div style="background:var(--bg-dark);border-radius:8px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;gap:2px">
                            <span style="font-size:15px;font-weight:800;color:var(--text-primary)">{s.v}</span>
                            <span style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">{s.k}</span>
                          </div>
                        ))}
                      </div>
                      <div style="font-size:11px;color:var(--text-muted);margin-top:9px">
                        <Icon name={last ? 'clock' : 'x'} size={12} style="vertical-align:-1px;margin-right:5px" />
                        {last ? `Ultima folosire: ${last}` : 'Neutilizat în perioada aleasă'}
                      </div>
                      {a.kind === 'agents' && (
                        <button class="btn btn-block" onClick={() => loc.route('/ai-agents')} style="margin-top:10px;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);font-weight:700;font-size:13px;border-radius:10px;padding:9px;display:flex;align-items:center;justify-content:center;gap:6px">
                          Deschide panoul de agenți <Icon name="chevronR" size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-top:4px">
                  Utilizarea AI din {days ? `ultimele ${days} zile` : 'tot istoricul'} — <b>{fmtN(totCalls)}</b> apeluri în total{d?.model ? ` · model: ${d.model}` : ''}{d?.enabled === false ? ' · AI neconfigurat' : ''}.
                </div>
              </div>
            )}
      </div>
    </div>
  );
}
