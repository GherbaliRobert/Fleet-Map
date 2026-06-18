import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './chat.css';

interface Msg { role: 'user' | 'assistant'; content: string; }
const SUGGESTIONS = ['Unde sunt vehiculele?', 'Câți km s-au făcut azi?', 'Ce vehicule sunt oprite?', 'Care e cel mai rapid acum?'];

// Markdown minimal → HTML sigur (escape întâi, apoi **bold** + linii noi).
function fmt(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

export function AiChat() {
  const loc = useLocation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, sending]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: message }]);
    setInput('');
    setSending(true);
    try {
      const r = await Api.aiChat(message, history);
      setMsgs((p) => [...p, { role: 'assistant', content: r.reply || 'Nu am putut genera un răspuns.' }]);
    } catch (e: any) {
      const m = e?.status === 403 ? 'Asistentul AI nu este activ pe planul companiei tale.' : (e?.message || 'Eroare. Încearcă din nou.');
      setMsgs((p) => [...p, { role: 'assistant', content: m }]);
    } finally { setSending(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Asistent AI</div>
        <div style="width:36px" />
      </header>
      <div class="chat-wrap">
        <div class="chat-scroll" ref={scrollRef}>
          {msgs.length === 0 && (
            <div class="chat-intro">
              <Icon name="robot" size={40} class="ic" />
              <div>Întreabă-mă despre flota ta — locații, km, opriri, status. Răspund pe baza datelor live.</div>
              <div class="chat-chips">
                {SUGGESTIONS.map((s) => <button class="chat-chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            m.role === 'user'
              ? <div class="chat-msg user">{m.content}</div>
              : <div class="chat-msg bot" dangerouslySetInnerHTML={{ __html: fmt(m.content) }} />
          ))}
          {sending && <div class="chat-typing"><span /><span /><span /></div>}
        </div>
        <div class="chat-bar">
          <input
            value={input}
            placeholder="Scrie o întrebare…"
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          />
          <button class="chat-send" disabled={sending || !input.trim()} onClick={() => send()}><Icon name="navigate" size={20} color="#06210f" /></button>
        </div>
      </div>
    </div>
  );
}
