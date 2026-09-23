import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon, type IconName } from './Icon';
import '../screens/chat.css';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Piese comune pentru întrebările AI de pe telefon — RA Insight (Rapoarte) și Asistent AI (chat).
// Oglindesc web-ul (public/index.html: raxLoadQuota, _raxAcordCostExtra, raxSendAI), ca fondul de
// întrebări să se vadă și să se socotească la fel, oriunde ar întreba omul.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type AiAnswer = Awaited<ReturnType<typeof Api.aiChat>>;
export type AiExtraCost = NonNullable<AiAnswer['cost']>;
export type AiQuota = Awaited<ReturnType<typeof Api.aiQuota>>;

// Același text ca serverul (MESAJ_FARA_LOC_AI din requireAiSeat). Folosit doar când serverul nu trimite
// textul lui: la un 403, clientul HTTP păstrează numai codul erorii, nu și mesajul.
export const AI_SEAT_MISSING_MSG = 'Firma ta are RA Insight, dar contul tău nu are încă acces. Administratorul firmei îl poate porni din Utilizatori, așa că cere-i acces.';

// „10 întrebări", dar „50 de întrebări" — de la 20 în sus româna cere „de".
function nDe(n: number, w: string) { if (n === 1 && w === 'întrebări') return '1 întrebare';const r = Math.abs(n) % 100; return n + ((r === 0 && n !== 0) || r >= 20 ? ' de ' : ' ') + w; }
function fmtLei(v: number) { return (Number(v) || 0).toFixed(2).replace('.', ',') + ' lei'; }
function fmtEur(v: number) { return (Number(v) || 0).toFixed(2).replace('.', ',') + ' €'; }
// Data lungă („1 octombrie"), ca serverul. Cea scurtă („01 oct.") are deja punct și dădea „oct.." în propoziții.
function dataLunga(iso?: string) { if (!iso) return '1 ale lunii'; const d = new Date(iso); return isNaN(d.getTime()) ? '1 ale lunii' : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }); }
const numar = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Fără loc de RA Insight pe cont — două forme, după autentificare:
//  • cookie (stil web): HTTP 403 cu error 'ai_seat_missing' → ajunge aici ca excepție;
//  • telefon (cheie/token): HTTP 200 cu seatMissing:true și textul în reply/message → ar arăta ca un răspuns.
export function isSeatMissing(e: any) { return e?.status === 403 && e?.message === 'ai_seat_missing'; }
// Întoarce textul de afișat dacă răspunsul e de fapt refuzul „fără loc", altfel null.
export function seatMissingText(r: AiAnswer | null | undefined): string | null {
  if (!r || !(r.seatMissing === true || r.error === 'ai_seat_missing')) return null;
  const t = r.message || r.reply;
  return (t && String(t).trim()) || AI_SEAT_MISSING_MSG;
}
export function aiErrorText(e: any, notActiveMsg: string): string {
  if (e?.status === 403) return isSeatMissing(e) ? AI_SEAT_MISSING_MSG : notActiveMsg;
  return e?.message || 'Eroare. Încearcă din nou.';
}
// Niciodată „—": dacă serverul nu dă text, spunem clar că nu a ieșit un răspuns.
export function aiAnswerText(r: AiAnswer | null | undefined): string {
  const t = r ? (r.reply || r.error) : '';
  return (t && String(t).trim()) || 'Nu am putut genera un răspuns. Încearcă din nou.';
}
export function aiDeclinedText(c?: AiExtraCost): string {
  return 'Întrebarea nu a fost trimisă. Fondul se reînnoiește pe ' + dataLunga(c?.reinnoire) +
    '. Până atunci, întrebările rapide (unde e o mașină, care sunt oprite, câți km azi) rămân gratuite.';
}

// ─── Trimiterea cu acord ─────────────────────────────────────────────────────────────────────────
// Când fondul lunii s-a terminat și firma are voie pe cost suplimentar, serverul NU răspunde: întoarce
// needsExtraConsent. Flagul se verifică ÎNAINTEA textului (pentru APK-urile vechi serverul pune acolo o
// explicație — nu e un răspuns). Arătăm caseta; doar „Am înțeles, continuă" retrimite întrebarea cu
// acceptExtra. „Nu" nu trimite nimic, deci nu se facturează nimic.
export type AiOutcome = { kind: 'answer'; r: AiAnswer } | { kind: 'declined'; cost: AiExtraCost };
export async function askWithConsent(
  send: (acceptExtra: boolean) => Promise<AiAnswer>,
  confirm: (c: AiExtraCost) => Promise<boolean>,
  onWait?: (waitingForPerson: boolean) => void,
): Promise<AiOutcome> {
  let r = await send(false);
  if (r && r.needsExtraConsent) {
    const cost = r.cost || {};
    onWait?.(true);
    const ok = await confirm(cost);
    if (!ok) return { kind: 'declined', cost };
    onWait?.(false);
    r = await send(true);
    if (r && r.needsExtraConsent) {
      return { kind: 'answer', r: { reply: 'Acordul nu a putut fi înregistrat, așa că întrebarea nu a primit răspuns. Încearcă din nou.', limited: true } };
    }
  }
  return { kind: 'answer', r };
}

// Caseta de acord, ca promisiune: `const ok = await consent.ask(cost)`; `consent.node` se pune în ecran.
export function useExtraConsent() {
  const [pending, setPending] = useState<AiExtraCost | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  // Dacă omul părăsește ecranul cu caseta deschisă, contează ca „Nu": nu rămâne nimic agățat.
  useEffect(() => () => { const r = resolver.current; resolver.current = null; if (r) r(false); }, []);
  const ask = useCallback((c: AiExtraCost) => new Promise<boolean>((res) => {
    if (resolver.current) resolver.current(false);
    resolver.current = res; setPending(c);
  }), []);
  const answer = (v: boolean) => { const r = resolver.current; resolver.current = null; setPending(null); if (r) r(v); };
  return { ask, open: !!pending, node: pending ? <ExtraCostConsent cost={pending} onAnswer={answer} /> : null };
}

export function ExtraCostConsent({ cost: c, onAnswer }: { cost: AiExtraCost; onAnswer: (ok: boolean) => void }) {
  const fond = numar(c.fond);
  const conturi = numar(c.conturi) || 0;
  const peCont = numar(c.peCont) || 0;
  const pretLei = numar(c.pretLei);
  const pretEur = numar(c.pretEur);
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(7,12,20,.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--sat)) 16px calc(16px + var(--sab))' }}
      onClick={(e) => { if (e.target === e.currentTarget) onAnswer(false); }}
    >
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '520px', width: '100%', maxHeight: '100%', overflowY: 'auto', padding: '18px 18px 16px', boxShadow: '0 20px 60px rgba(0,0,0,.4)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Icon name="alert" size={22} color="var(--orange)" />
          <b style={{ fontSize: '16px', lineHeight: 1.3 }}>Fondul de întrebări al lunii s-a terminat</b>
        </div>
        <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Firma a folosit {fond != null ? <>toate cele <b>{fond}</b>{nDe(fond, 'întrebări').slice(String(fond).length)} incluse</> : 'toate întrebările incluse'} luna asta
          {conturi && peCont ? ` (${conturi} ${conturi === 1 ? 'cont' : 'conturi'} × ${peCont})` : ''}.
          {' '}De aici înainte, {pretLei != null
            ? <><b>fiecare întrebare costă {fmtLei(pretLei)}</b>{pretEur != null ? <span style={{ color: 'var(--text-muted)' }}> ({fmtEur(pretEur)})</span> : null}</>
            : pretEur != null ? <b>fiecare întrebare costă {fmtEur(pretEur)}</b> : <b>fiecare întrebare se plătește în plus</b>}
          {' '}și intră pe factura lunii.
        </p>
        <div style={{ background: 'var(--bg-dark)', borderRadius: '10px', padding: '11px 13px', fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>
          <b style={{ fontSize: '12.5px' }}>Cum se socotește</b>
          <ul style={{ margin: '5px 0 0 16px', padding: 0, color: 'var(--text-secondary)' }}>
            <li>O întrebare pusă aici = 1, oricât de complicat ar fi răspunsul.</li>
            <li><b>Gratuit oricând</b>, fără să intre la socoteală: „unde sunt mașinile”, „care sunt oprite”, „câți km azi”, „status flotă”.</li>
            <li>Fondul se reînnoiește pe <b>{dataLunga(c.reinnoire)}</b>.</li>
            <li>Poți adăuga conturi (fiecare aduce încă {nDe(peCont || 50, 'întrebări')}) din <b>Utilizatori</b>.</li>
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button class="btn" style={{ flex: '1 1 140px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} onClick={() => onAnswer(false)}>Nu, mă opresc aici</button>
          <button class="btn btn-primary" style={{ flex: '1 1 140px' }} onClick={() => onAnswer(true)}>Am înțeles, continuă</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contorul de întrebări (aceeași sursă ca web-ul: GET /api/ai/quota) ─────────────────────────
let _fxEur: number | null = null; // curs BNR, cerut o singură dată pe sesiune (doar dacă firma e pe cost suplimentar)
export function useAiQuota(enabled = true) {
  const [q, setQ] = useState<AiQuota | null>(null);
  const [fx, setFx] = useState<number>(_fxEur || 5);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await Api.aiQuota();
      setQ(r);
      if (r && r.overage && !r.unlimited && _fxEur == null) {
        try { const f = await Api.fx(); if (f && f.eur > 1) { _fxEur = f.eur; setFx(f.eur); } } catch { /* rămâne 5,0, ca pe web */ }
      }
    } catch { /* fără contor: bara nu apare, ca pe web */ }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  // Serverul vechi nu trimite `seat` → considerăm că omul are loc (serverul oricum decide la întrebare).
  return { q, fx, reload, seatMissing: !!q && q.seat === false };
}

export function AiQuotaBar({ q, fx, boxStyle }: { q: AiQuota | null; fx: number; boxStyle?: Record<string, string | number> }) {
  if (!q || q.error || q.unlimited || !q.questions) return null; // fără cotă → nu arătăm nimic (ca pe web)
  const questions = q.questions;
  const used = Number(q.used) || 0;
  const remaining = q.remaining == null ? Math.max(0, questions - used) : q.remaining;
  const pct = Math.min(100, Math.round((used / Math.max(1, questions)) * 100));
  const reset = dataLunga(q.periodEnd);
  const aleMele = Number(q.usedByMe) || 0;
  const peste = Number(q.overageCount) || 0;
  const seats = Number(q.seats) || 0;
  const perSeat = Number(q.questionsPerSeat) || 0;
  const pretEur = Number(q.overagePriceEur) || 0;
  const costEur = Number(q.overageCostEur) || 0;
  const terminat = peste > 0 || remaining <= 0;
  const col = terminat || remaining <= Math.max(3, questions * 0.15) ? 'var(--orange)' : 'var(--accent)';
  const lei = (eur: number) => fmtLei(eur * fx);

  let head, sub;
  if (terminat) {
    head = <><b>Fondul lunii s-a terminat</b>{q.overage && peste > 0 ? ' · ' + (peste === 1 ? '1 întrebare în plus' : nDe(peste, 'întrebări') + ' în plus') : ''}</>;
    sub = q.overage
      ? <>Întrebările în plus intră pe factura lunii: {lei(pretEur)}/întrebare
          {peste > 0 ? <> · până acum <b>{lei(costEur)}</b> <span style={{ opacity: 0.65 }}>({fmtEur(costEur)})</span></> : ' · ți se cere acordul o dată'}
          {aleMele > 0 ? ' · ai folosit tu ' + aleMele : ''}</>
      // „Un cont în plus aduce încă N" e adevărat DOAR pe regula pe cont. La o firmă pe cota fixă
      // veche, un cont în plus nu aduce nimic — iar „|| 50" îi promitea tocmai asta (găsit 23.09,
      // aceeași scăpare ca pe web). Fără regula pe cont, fraza lipsește.
      : <>Se reînnoiește pe {reset}. RA Insight se oprește până atunci, fără niciun cost în plus.{perSeat > 0 ? <> Un cont în plus aduce încă {nDe(perSeat, 'întrebări')} pe lună.</> : null}</>;
  } else {
    head = <><b>{remaining}</b> din {nDe(questions, 'întrebări')} rămase{seats > 1 ? <span style={{ opacity: 0.7 }}> · fond comun, {seats} conturi</span> : null}</>;
    sub = <>Se reînnoiește pe {reset}{aleMele > 0 ? ' · ai folosit tu ' + aleMele : ''}{q.overage ? ' · peste fond: ' + lei(pretEur) + '/întrebare' : ''}</>;
  }

  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-dark)', ...(boxStyle || {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '13px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{head}</span>
        {q.overage && peste > 0 ? <span style={{ color: 'var(--orange)', fontWeight: 800, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', flex: '0 0 auto' }}><Icon name="alert" size={13} color="var(--orange)" /> extra</span> : null}
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: col, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.45 }}>{sub}</div>
      {/* „Cum se socotește" — scris o dată, la îndemână, ca nimeni să nu ghicească ce se numără. */}
      <details style={{ marginTop: '6px' }}>
        <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', listStyle: 'none', padding: '2px 0' }}>Cum se socotește ▾</summary>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '4px' }}>
          • O întrebare pusă aici = 1, oricât de complicat e răspunsul.<br />
          • <b>Gratuite, nu intră la socoteală:</b> „unde sunt mașinile”, „care sunt oprite”, „câți km azi”, „status flotă”.<br />
          • {perSeat > 0
            ? <>Fondul e al firmei: {seats || 1} {(seats || 1) === 1 ? 'cont' : 'conturi'} × {nDe(perSeat, 'întrebări')}.</>
            : <>Fondul e al firmei: {nDe(questions, 'întrebări')} pe lună, pentru toate conturile.</>}<br />
          • Se reînnoiește pe {reset}.<br />
          • {q.overage
            ? <>Peste fond: {lei(pretEur)} de fiecare întrebare, pe factura lunii (ți se cere acordul o dată).</>
            : <>Când se termină, RA Insight se oprește până la reînnoire — fără niciun cost în plus.{perSeat > 0 ? <> Un cont în plus aduce încă {nDe(perSeat, 'întrebări')} pe lună.</> : null}</>}
        </div>
      </details>
    </div>
  );
}

// Notă de sistem (nu e răspunsul AI-ului): întrebare netrimisă etc.
export function AiNote({ text, style }: { text: string; style?: Record<string, string | number> }) {
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: 'var(--bg-dark)', border: '1px dashed var(--border-light)', color: 'var(--text-secondary)', borderRadius: '12px', padding: '10px 12px', fontSize: '13.5px', lineHeight: 1.5, ...(style || {}) }}>
      {text}
    </div>
  );
}

// Omul nu are loc de RA Insight pe contul lui: explicăm, fără câmp de întrebare care ar da doar erori.
// `text` = mesajul serverului, când l-a trimis (e mereu mai la zi decât copia de aici).
export function AiSeatNotice({ text, style }: { text?: string | null; style?: Record<string, string | number> }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '11px', padding: '11px 13px', fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text-secondary)', textAlign: 'left', ...(style || {}) }}>
      <Icon name="lock" size={17} color="var(--orange)" style={{ flex: '0 0 auto', marginTop: '2px' }} />
      <span>{text || AI_SEAT_MISSING_MSG}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Ecranul de chat (Asistent AI)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
interface Msg { id: number; role: 'user' | 'assistant' | 'note'; content: string; noHist?: boolean; }

export interface ChatScreenProps {
  title: string;
  icon: IconName;
  intro: string;
  suggestions: string[];
  notActiveMsg: string;
  // Apelul către backend: istoricul + acceptExtra (true doar după „Am înțeles, continuă" în caseta de acord).
  call: (message: string, history: { role: string; content: string }[], acceptExtra?: boolean) => Promise<AiAnswer>;
  showQuota?: boolean; // bara „X din Y întrebări rămase" (întrebările de aici se scad din fondul firmei)
}

// Markdown minimal → HTML sigur (escape întâi, apoi **bold** + linii noi).
function fmt(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

// Istoricul trimis serverului: doar perechi întrebare–răspuns reale (fără note, erori sau întrebări netrimise).
function histFrom(msgs: Msg[]) {
  return msgs.filter((m) => m.role !== 'note' && !m.noHist).slice(-6).map((m) => ({ role: m.role, content: m.content }));
}

export function ChatScreen({ title, icon, intro, suggestions, notActiveMsg, call, showQuota = true }: ChatScreenProps) {
  const loc = useLocation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [seatMsg, setSeatMsg] = useState<string | null>(null); // refuzul „fără loc pe cont", primit la întrebare
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const quota = useAiQuota(showQuota);
  const consent = useExtraConsent();
  const busy = sending || consent.open;
  const noSeat = !!seatMsg || quota.seatMissing;

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, sending]);

  function push(role: Msg['role'], content: string, noHist?: boolean) {
    const id = ++idRef.current;
    setMsgs((p) => [...p, { id, role, content, noHist }]);
    return id;
  }
  const scoateDinIstoric = (id: number) => setMsgs((p) => p.map((m) => (m.id === id ? { ...m, noHist: true } : m)));

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy || noSeat) return;
    const history = histFrom(msgs);
    const uid = push('user', message);
    setInput('');
    setSending(true);
    try {
      const out = await askWithConsent((x) => call(message, history, x), consent.ask, (w) => setSending(!w));
      if (out.kind === 'declined') {
        scoateDinIstoric(uid);
        push('note', aiDeclinedText(out.cost), true);
      } else {
        const r = out.r;
        // Pe telefon, refuzul „fără loc pe cont" vine ca răspuns 200: nu e răspuns de AI, nu intră în istoric,
        // iar câmpul de întrebare se închide (altfel omul ar primi același refuz la fiecare mesaj).
        const faraLoc = seatMissingText(r);
        if (faraLoc) {
          scoateDinIstoric(uid);
          setSeatMsg(faraLoc);
          push('note', faraLoc, true);
        } else {
          const explicatie = !!(r && (r.limited || r.disabled)); // text al platformei, nu răspuns la întrebare
          if (explicatie) scoateDinIstoric(uid);
          push('assistant', aiAnswerText(r), explicatie);
        }
      }
    } catch (e: any) {
      scoateDinIstoric(uid);
      if (isSeatMissing(e)) { setSeatMsg(AI_SEAT_MISSING_MSG); push('note', AI_SEAT_MISSING_MSG, true); }
      else push('assistant', aiErrorText(e, notActiveMsg), true);
    } finally {
      setSending(false);
      quota.reload(); // contorul scade imediat după întrebare
    }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">{title}</div>
        <div style="width:36px" />
      </header>
      <div class="chat-wrap">
        {showQuota && !noSeat && <AiQuotaBar q={quota.q} fx={quota.fx} boxStyle={{ flex: '0 0 auto', borderBottom: '1px solid var(--border)' }} />}
        <div class="chat-scroll" ref={scrollRef}>
          {msgs.length === 0 && (
            <div class="chat-intro">
              <Icon name={icon} size={40} class="ic" />
              <div>{intro}</div>
              {noSeat
                ? <AiSeatNotice text={seatMsg} style={{ marginTop: '14px' }} />
                : (
                  <div class="chat-chips">
                    {suggestions.map((s) => <button class="chat-chip" disabled={busy} onClick={() => send(s)}>{s}</button>)}
                  </div>
                )}
            </div>
          )}
          {msgs.map((m) => (
            m.role === 'user'
              ? <div class="chat-msg user">{m.content}</div>
              : m.role === 'note'
                ? <AiNote text={m.content} />
                : <div class="chat-msg bot" dangerouslySetInnerHTML={{ __html: fmt(m.content) }} />
          ))}
          {sending && <div class="chat-typing"><span /><span /><span /></div>}
        </div>
        <div class="chat-bar">
          <input
            value={input}
            disabled={noSeat}
            placeholder={noSeat ? 'RA Insight nu e pornit pe contul tău' : 'Scrie o întrebare…'}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          />
          <button class="chat-send" disabled={busy || noSeat || !input.trim()} onClick={() => send()}><Icon name="navigate" size={20} color="#06210f" /></button>
        </div>
      </div>
      {consent.node}
    </div>
  );
}
