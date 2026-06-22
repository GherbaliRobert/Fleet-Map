import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from './Icon';
import '../screens/chat.css'; // pt. .chat-send / .chat-msg (modul AI opțional)

function fmtMd(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

// RA Insight — întrebări predefinite (rulează rapoarte, zero tokeni) + casetă AI opțională (doar dacă firma are modulul).
export function InsightPanel() {
  const [presets, setPresets] = useState<{ key: string; title: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const aiOn = !!me.value?.features?.ai_assistant;
  const [aiQ, setAiQ] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState('');

  useEffect(() => { Api.insightPresets().then(setPresets).catch(() => {}); }, []);

  async function runPreset(key: string) {
    setErr(''); setResult(null); setBusy(key);
    try { setResult(await Api.insightRun(key)); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la rapoarte.' : (e?.message || 'Eroare')); }
    finally { setBusy(''); }
  }
  async function askAi() {
    const q = aiQ.trim(); if (!q || aiBusy) return;
    setAiBusy(true); setAiReply('');
    try { const r = await Api.reportsAgent(q); setAiReply(r.reply || '—'); }
    catch (e: any) { setAiReply(e?.status === 403 ? 'Modulul AI nu e activ pe planul companiei.' : (e?.message || 'Eroare. Încearcă din nou.')); }
    finally { setAiBusy(false); }
  }

  return (
    <div class="insight">
      <div class="insight-intro">Apasă o întrebare — îți calculez răspunsul direct din rapoarte, fără AI.</div>
      <div class="insight-presets">
        {presets.map((p) => (
          <button class="insight-q" disabled={!!busy} onClick={() => runPreset(p.key)}>
            {busy === p.key ? <span class="spin" /> : <Icon name="chart" size={16} color="var(--accent)" />}
            <span>{p.title}</span>
          </button>
        ))}
      </div>

      {err && <div class="center-msg" style="color:var(--red)">{err}</div>}

      {result && (
        <div class="insight-res">
          <div class="insight-res-title">{result.title}</div>
          {result.summary && Object.keys(result.summary).length > 0 && (
            <div class="rp-summary">
              {Object.entries(result.summary).map(([k, v]) => <div class="rp-kpi"><div class="v">{String(v)}</div><div class="l">{k}</div></div>)}
            </div>
          )}
          {result.rows && result.rows.length > 0 && (
            <div class="rp-table-wrap">
              <table class="rp-table">
                <thead><tr>{(result.columns || []).map((c: string) => <th>{c}</th>)}</tr></thead>
                <tbody>{result.rows.map((row: any[]) => <tr>{row.map((cell) => <td>{cell == null ? '' : String(cell)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {aiOn && (
        <div class="insight-ai">
          <div class="insight-ai-h"><Icon name="sparkles" size={15} color="var(--accent)" /> Întrebare liberă (AI)</div>
          <div class="insight-ai-bar">
            <input value={aiQ} placeholder="Ex: consumul flotei luna trecută…" onInput={(e) => setAiQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') askAi(); }} />
            <button class="chat-send" disabled={aiBusy || !aiQ.trim()} onClick={askAi}>{aiBusy ? <span class="spin" /> : <Icon name="navigate" size={18} color="#06210f" />}</button>
          </div>
          {aiReply && <div class="chat-msg bot" style="margin-top:10px" dangerouslySetInnerHTML={{ __html: fmtMd(aiReply) }} />}
        </div>
      )}
    </div>
  );
}
