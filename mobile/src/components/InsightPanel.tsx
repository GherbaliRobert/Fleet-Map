import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from './Icon';
import { AI_SEAT_MISSING_MSG, AiQuotaBar, AiSeatNotice, aiAnswerText, aiErrorText, aiMd, isSeatMissing, seatMissingText, useAiQuota } from './ChatScreen';
import '../screens/chat.css'; // pt. .chat-send / .chat-msg (modul AI opțional)

// Același markdown ca în chat (**bold**, *italic*, linii noi) — o singură sursă, în ChatScreen.
const fmtMd = aiMd;

// RA Insight — întrebări predefinite (rulează rapoarte, zero tokeni) + casetă AI opțională (doar dacă firma are modulul).
export function InsightPanel() {
  const [presets, setPresets] = useState<{ key: string; title: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const aiOn = !!me.value?.features?.ai_assistant;
  const [aiQ, setAiQ] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // Răspunsul AI (bulă) — niciodată „—": dacă serverul nu dă text, spunem clar că nu a ieșit un răspuns.
  const [aiOut, setAiOut] = useState<string | null>(null);
  const [seatMsg, setSeatMsg] = useState<string | null>(null); // refuzul „fără loc pe cont", primit la întrebare
  const quota = useAiQuota(aiOn);      // bara „X din Y întrebări rămase", ca pe web
  const noSeat = !!seatMsg || quota.seatMissing;

  useEffect(() => { Api.insightPresets().then(setPresets).catch(() => {}); }, []);

  async function runPreset(key: string) {
    setErr(''); setResult(null); setBusy(key);
    try { setResult(await Api.insightRun(key)); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la rapoarte.' : (e?.message || 'Eroare')); }
    finally { setBusy(''); }
  }
  async function askAi() {
    const q = aiQ.trim(); if (!q || aiBusy || noSeat) return;
    setAiBusy(true); setAiOut(null);
    try {
      // Fondul lunii s-a terminat → serverul răspunde cu explicația (fără niciun cost în plus), ca text.
      const r = await Api.reportsAgent(q);
      // Pe telefon, refuzul „fără loc pe cont" vine ca răspuns 200 — nu e o bulă de AI: arătăm explicația.
      const faraLoc = seatMissingText(r);
      if (faraLoc) setSeatMsg(faraLoc);
      else setAiOut(aiAnswerText(r));
    } catch (e: any) {
      if (isSeatMissing(e)) setSeatMsg(AI_SEAT_MISSING_MSG);
      else setAiOut(aiErrorText(e, 'RA Insight nu e pornit pentru firma ta. Contactați administratorul platformei.'));
    } finally {
      setAiBusy(false);
      quota.reload(); // contorul scade imediat după întrebare
    }
  }

  return (
    <div class="insight">
      {aiOn && !noSeat && <AiQuotaBar q={quota.q} boxStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '11px', marginBottom: '12px' }} />}
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
          {noSeat ? <AiSeatNotice text={seatMsg} /> : (<>
            <div class="insight-ai-bar">
              <input value={aiQ} placeholder="Ex: consumul flotei luna trecută…" onInput={(e) => setAiQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') askAi(); }} />
              <button class="chat-send" disabled={aiBusy || !aiQ.trim()} onClick={askAi}>{aiBusy ? <span class="spin" /> : <Icon name="navigate" size={18} color="#06210f" />}</button>
            </div>
            {aiOut && <div class="chat-msg bot" style="margin-top:10px" dangerouslySetInnerHTML={{ __html: fmtMd(aiOut) }} />}
          </>)}
        </div>
      )}
    </div>
  );
}
