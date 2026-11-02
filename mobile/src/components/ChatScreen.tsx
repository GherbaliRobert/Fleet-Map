import { useCallback, useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { Icon } from './Icon';
import '../screens/chat.css';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Piese comune pentru întrebările AI din Rapoarte (InsightPanel). Discuția RA Insight are ecranul ei din 02.11 (screens/Insight.tsx).
// Oglindesc web-ul (public/index.html: raxLoadQuota, raxSendAI), ca fondul de întrebări să se vadă
// și să se socotească la fel, oriunde ar întreba omul.
// Din 14.09 nu mai există nimic „peste fond": când fondul lunii s-a terminat, RA Insight se oprește
// până la reînnoire, fără niciun cost în plus. Serverul răspunde atunci cu explicația (limited +
// fondEpuizat, textul în `reply`) — nu mai cere acord și nu mai trimite prețuri pe întrebare.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type AiAnswer = Awaited<ReturnType<typeof Api.reportsAgent>>;
export type AiQuota = Awaited<ReturnType<typeof Api.aiQuota>>;

// Același text ca serverul (MESAJ_FARA_LOC_AI din requireAiSeat). Folosit doar când serverul nu trimite
// textul lui: la un 403, clientul HTTP păstrează numai codul erorii, nu și mesajul.
export const AI_SEAT_MISSING_MSG = 'Firma ta are RA Insight, dar contul tău nu are încă acces. Administratorul firmei îl poate porni din Utilizatori, așa că cere-i acces.';

// „10 întrebări", dar „50 de întrebări" — de la 20 în sus româna cere „de".
function nDe(n: number, w: string) { if (n === 1 && w === 'întrebări') return '1 întrebare';const r = Math.abs(n) % 100; return n + ((r === 0 && n !== 0) || r >= 20 ? ' de ' : ' ') + w; }
// Data lungă („1 octombrie"), ca serverul. Cea scurtă („01 oct.") are deja punct și dădea „oct.." în propoziții.
function dataLunga(iso?: string) { if (!iso) return '1 ale lunii'; const d = new Date(iso); return isNaN(d.getTime()) ? '1 ale lunii' : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }); }

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
// La un 403, clientul HTTP păstrează doar câmpul `error`. Două coduri au text propriu aici
// („fără loc pe cont" și modulul oprit pe firmă — 'feature_disabled'); restul refuzurilor serverului
// sunt deja propoziții („Acces interzis", „Cont dezactivat…") și se arată ca atare.
export function aiErrorText(e: any, notActiveMsg: string): string {
  if (isSeatMissing(e)) return AI_SEAT_MISSING_MSG;
  if (e?.status === 403) return e?.message && e.message !== 'feature_disabled' ? e.message : notActiveMsg;
  return e?.message || 'Eroare. Încearcă din nou.';
}
// Niciodată „—": dacă serverul nu dă text, spunem clar că nu a ieșit un răspuns.
export function aiAnswerText(r: AiAnswer | null | undefined): string {
  const t = r ? (r.reply || r.error) : '';
  return (t && String(t).trim()) || 'Nu am putut genera un răspuns. Încearcă din nou.';
}

// ─── Contorul de întrebări (aceeași sursă ca web-ul: GET /api/ai/quota) ─────────────────────────
export function useAiQuota(enabled = true) {
  const [q, setQ] = useState<AiQuota | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try { setQ(await Api.aiQuota()); } catch { /* fără contor: bara nu apare, ca pe web */ }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  // Serverul vechi nu trimite `seat` → considerăm că omul are loc (serverul oricum decide la întrebare).
  return { q, reload, seatMissing: !!q && q.seat === false };
}

export function AiQuotaBar({ q, boxStyle }: { q: AiQuota | null; boxStyle?: Record<string, string | number> }) {
  if (!q || q.error || q.unlimited || !q.questions) return null; // fără cotă → nu arătăm nimic (ca pe web)
  const questions = q.questions;
  const used = Number(q.used) || 0;
  const remaining = q.remaining == null ? Math.max(0, questions - used) : q.remaining;
  const pct = Math.min(100, Math.round((used / Math.max(1, questions)) * 100));
  const reset = dataLunga(q.periodEnd);
  const aleMele = Number(q.usedByMe) || 0;
  const seats = Number(q.seats) || 0;
  const perSeat = Number(q.questionsPerSeat) || 0;
  const terminat = q.blocked === true || remaining <= 0;
  const col = terminat || remaining <= Math.max(3, questions * 0.15) ? 'var(--orange)' : 'var(--accent)';
  // „Un cont în plus aduce încă N" e adevărat DOAR pe regula pe cont. La o firmă pe cota fixă
  // veche, un cont în plus nu aduce nimic — fără regula pe cont, fraza lipsește (ca pe web).
  const inPlus = perSeat > 0 ? <>Un cont în plus aduce încă {nDe(perSeat, 'întrebări')} pe lună.</> : null;

  let head, sub;
  if (terminat) {
    head = <b>Fondul lunii s-a terminat</b>;
    // Data stă deja în eticheta portocalie („oprit până pe …"); rândul de dedesubt spune doar ce poate
    // face omul — dacă poate face ceva.
    sub = inPlus || <>Se reînnoiește pe {reset}.</>;
  } else {
    head = <><b>{remaining}</b> din {nDe(questions, 'întrebări')} rămase{seats > 1 ? <span style={{ opacity: 0.7 }}> · fond comun, {seats} conturi</span> : null}</>;
    sub = <>Se reînnoiește pe {reset}{aleMele > 0 ? ' · ai folosit tu ' + aleMele : ''}</>;
  }

  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-dark)', ...(boxStyle || {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 8px', fontSize: '13px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{head}</span>
        {/* „oprit", nu „extra": peste fond clientul nu plătește nimic — RA Insight doar se oprește. */}
        {terminat ? <span style={{ color: 'var(--orange)', fontWeight: 800, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', flex: '0 0 auto', whiteSpace: 'nowrap' }}><Icon name="clock" size={13} color="var(--orange)" /> oprit până pe {reset}</span> : null}
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
            : <>Fondul e al firmei: {nDe(questions, 'întrebări')} pe lună.</>}<br />
          • Se reînnoiește pe {reset}.<br />
          • Când se termină, RA Insight se oprește până la reînnoire — fără niciun cost în plus.
          {inPlus ? <><br />• {inPlus}</> : null}
        </div>
      </details>
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

// Markdown minimal → HTML sigur (escape întâi, apoi **bold**, *italic* și linii noi). Folosit de
// caseta AI din Rapoarte (InsightPanel). *Italicul* contează: explicația serverului când fondul lunii
// s-a terminat („Întrebările rapide rămân gratuite: *unde e o mașină, …*") îl folosește — fără el,
// clientul vedea steluțele ca atare. Un „*" urmat de spațiu (listă) sau lipit de cifre („2*3") rămâne text.
export function aiMd(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
}
