import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Icon, type IconName } from './Icon';
import '../screens/chat.css';

interface Msg { role: 'user' | 'assistant'; content: string; }

export interface ChatScreenProps {
  title: string;
  icon: IconName;
  intro: string;
  suggestions: string[];
  notActiveMsg: string;
  // Apelul către backend; primește și istoricul (asistentul îl folosește, RA Insight îl ignoră).
  call: (message: string, history: { role: string; content: string }[]) => Promise<{ reply?: string }>;
}

// Markdown minimal → HTML sigur (escape întâi, apoi **bold** + linii noi).
function fmt(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

export function ChatScreen({ title, icon, intro, suggestions, notActiveMsg, call }: ChatScreenProps) {
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
      const r = await call(message, history);
      setMsgs((p) => [...p, { role: 'assistant', content: r.reply || 'Nu am putut genera un răspuns.' }]);
    } catch (e: any) {
      const m = e?.status === 403 ? notActiveMsg : (e?.message || 'Eroare. Încearcă din nou.');
      setMsgs((p) => [...p, { role: 'assistant', content: m }]);
    } finally { setSending(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">{title}</div>
        <div style="width:36px" />
      </header>
      <div class="chat-wrap">
        <div class="chat-scroll" ref={scrollRef}>
          {msgs.length === 0 && (
            <div class="chat-intro">
              <Icon name={icon} size={40} class="ic" />
              <div>{intro}</div>
              <div class="chat-chips">
                {suggestions.map((s) => <button class="chat-chip" onClick={() => send(s)}>{s}</button>)}
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
