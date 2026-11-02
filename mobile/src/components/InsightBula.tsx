import { useState } from 'preact/hooks';
import { showToast } from '../app/store';
import { exportHistoryReport } from '../lib/export';
import { Icon, type IconName } from './Icon';
import { CartonasPropunere, ButonProp } from './InsightPropunere';
import { Md } from './InsightText';
import { butonuriCuDrum, iconaButonProblema, iconaFa, linkSigur, planBula, rutaIstoric, rutaRaport, textSimplu, textSursaRaport } from '../lib/insight';

// Bulele discuției RA Insight (web: bulaOm, bulaAi și piesele lor comune). Ordinea și ce se arată le hotărăște `planBula`
// (lib/insight.ts), legată de pagină prin probă; aici doar se desenează. Tot textul de la server se pune ca TEXT.

export type Laturi = {
  trimite: (t: string, o?: { buton?: boolean }) => void;
  buton: (b: any, p?: any) => void;          // un buton dintr-o problemă, din `actiuni` sau din „Gata"
  ruta: (r: string) => void;                 // „Deschide raportul"
  plus: () => void;                          // „Alege ce vrei să afli" = lista din „+"
  nota: (m: any, v: number) => void;         // 👍 / 👎
  propunere: (m: any, id: any, nou: any, urmator: any) => void;
  editeaza: (t: string) => void;             // pune întrebarea înapoi în casetă
};

// Copierea: fără clipboard (unele WebView-uri îl refuză), se încearcă pe calea veche.
export async function copiaza(text: any) {
  const t = textSimplu(text);
  let gata = false;
  try { await navigator.clipboard.writeText(t); gata = true; } catch { /* urmează calea veche */ }
  if (!gata) {
    try {
      const a = document.createElement('textarea');
      a.value = t; a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      gata = document.execCommand('copy');
      a.remove();
    } catch { /* n-a mers nici așa */ }
  }
  showToast(gata ? 'Am copiat răspunsul.' : 'Nu am putut copia răspunsul.', !gata);
}

// Întrebarea omului, cu Editează și Copiază (pe telefon, mereu la vedere).
export function BulaOm({ text, l }: { text: string; l: Laturi }) {
  return (
    <div class="insp-u">
      <div class="insp-u-act">
        <button type="button" class="chat-ib" title="Editează întrebarea" aria-label="Editează întrebarea" onClick={() => l.editeaza(text)}><Icon name="edit" size={14} /></button>
        <button type="button" class="chat-ib" title="Copiază" aria-label="Copiază întrebarea" onClick={() => copiaza(text)}><Icon name="copy" size={14} /></button>
      </div>
      <div class="b">{text}</div>
    </div>
  );
}

// Antetul răspunsului (web: _chatInsigna): numele, eticheta cu chenar (ANALIZĂ mov, INSTANT verde), detaliul — toate de la server.
function Insigna({ ins }: { ins: any }) {
  if (!ins.eticheta) return <div class="chat-ins-cap"><span class="chat-ins-det">{String(ins.text)}</span></div>;
  return (
    <div class="chat-ins-cap">
      {ins.nume ? <span class="nm">{String(ins.nume)}</span> : null}
      <span class={'chat-ins-et ' + (ins.fel === 'ai' ? 'ai' : 'instant')}>{String(ins.eticheta)}</span>
      {ins.detaliu ? <span class="chat-ins-det">{String(ins.detaliu)}</span> : null}
    </div>
  );
}
// „Am înțeles" = un titlu scurt al răspunsului; ce vine din discuție are creierașul mov.
function Inteles({ lista }: { lista: any[] }) {
  return (
    <div class="ins-tit">
      {lista.map((x, i) => <>
        {i ? ' · ' : null}
        {x.mem ? <span class="mem"><Icon name="brain" size={12} />{String(x.text || '')}</span> : <span>{String(x.text || '')}</span>}
      </>)}
    </div>
  );
}
// Mesajul pachetului (Start, luna oprită): „Alege ce vrei să afli" = „+". „Vezi pachetele" intră odată cu ecranul lor.
function CasetaLimita({ text, l }: { text: string; l: Laturi }) {
  return (
    <div class="chat-lim">
      <Md text={text} />
      <div class="chat-lim-b"><ButonProp text="Alege ce vrei să afli" ic="plus" onClick={l.plus} /></div>
    </div>
  );
}
// Cartonașul unui raport cerut în cuvinte: titlul, cifrele de sus, „Deschide raportul" (Istoric) și „Descarcă Excel".
function CartonasRaport({ rp, l }: { rp: any; l: Laturi }) {
  const [desc, setDesc] = useState(false);
  async function excel() {
    setDesc(true);
    try { await exportHistoryReport(rp.id, rp.tip || 'raport', 'xlsx'); }
    catch (e: any) { showToast((e && e.message) || 'Nu s-a putut descărca.', true); }
    finally { setDesc(false); }
  }
  return (
    <div class="chat-rap">
      <div class="chat-rap-h">
        <span class="ic"><Icon name="report" size={14} /></span>
        <span class="chat-rap-t">{rp.label + ' · ' + (rp.vehicul || '') + (rp.perioada ? ' · ' + rp.perioada : '')}</span>
        {rp.gol ? <span class="chat-rap-p">fără rânduri</span> : null}
      </div>
      {(rp.kpi || []).length ? <div class="chat-rap-k">{rp.kpi.map((x: any) => <span><span class="l">{x.et}</span><b>{x.val}</b></span>)}</div> : null}
      {rp.id ? (
        <div class="chat-rap-b">
          <button type="button" class="chat-pas chat-rap-dg" onClick={() => l.ruta(rutaIstoric(rp.id))}><Icon name="externalLink" size={14} />Deschide raportul</button>
          <button type="button" class="chat-pas" disabled={desc} onClick={excel}><Icon name="download" size={14} />{desc ? 'Se pregătește…' : 'Descarcă Excel'}</button>
        </div>
      ) : null}
      <div class="chat-rap-s">{'E și în Istoric rapoarte, până pe ' + (rp.pana || '') + '.'}</div>
      {(Array.isArray(rp.note) ? rp.note : []).map((t: any) => <div class="chat-rap-n">{String(t)}</div>)}
    </div>
  );
}
// „Sursă externă": sursele căutării (doar http / https, în afara aplicației), când și ce s-a căutat — scrise de server.
function BlocSursa({ se }: { se: any }) {
  const surse = (se.surse || []).filter((s: any) => linkSigur(s.url));
  return (
    <div class="chat-se">
      <div class="chat-se-h"><Icon name="globe" size={14} /><span class="chat-se-t">{se.titlu || ''}</span>{se.text ? <span class="chat-se-c">{se.text}</span> : null}</div>
      {surse.length ? (
        <ol class="chat-se-l">
          {surse.map((s: any) => <li><a href={String(s.url)} target="_blank" rel="noopener noreferrer nofollow">{s.titlu || s.site || s.url}</a>{s.site ? <span class="chat-se-s">{s.site}</span> : null}</li>)}
        </ol>
      ) : null}
      {se.ceAmCautat ? <div class="chat-se-q">{se.ceAmCautat}</div> : null}
    </div>
  );
}
// „Am găsit o problemă" (web: _chatProbleme): roșu = problemă reală, galben = de știut; butoanele duc exact la locul ei.
function Probleme({ lista, l }: { lista: any[]; l: Laturi }) {
  return (
    <div class="chat-probs">
      {lista.map((p) => {
        const rosu = p.grav === 'rosu';
        const bs = butonuriCuDrum(p.butoane, p);
        return (
          <div class={'chat-prob ' + (rosu ? 'rosu' : 'galben')}>
            <div class="chat-prob-t"><Icon name={rosu ? 'alertO' : 'circleInfo'} size={16} /><span>{String(p.titlu || '')}</span></div>
            {p.dovada ? <div class="chat-prob-d">{String(p.dovada)}</div> : null}
            {bs.length ? (
              <div class="chat-prob-b">
                {bs.map((b: any, i: number) => <button type="button" class={'chat-pas' + (i === 0 ? ' chat-rap-dg' : '')} onClick={() => l.buton(b, p)}><Icon name={iconaButonProblema(b.fel) as IconName} size={14} />{String(b.text)}</button>)}
              </div>
            ) : null}
            {p.nota ? <div class="chat-prob-n">{String(p.nota)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// Răspunsul. Sub un raport cerut: doar cartonașul lui. Copiază · 👍 · 👎 · „Din raportul…" stau mereu la vedere pe telefon.
export function BulaAi({ m, l }: { m: any; l: Laturi }) {
  const plan = planBula(m);
  const actiuni = butonuriCuDrum(plan.actiuni);
  return (
    <div class="insp-a">
      <div class="av"><Icon name="sparkles" size={14} /></div>
      <div class="bub">
        {plan.insigna ? <Insigna ins={plan.insigna} /> : null}
        {plan.inteles.length ? <div class="ins-extra"><Inteles lista={plan.inteles} /></div> : null}
        {plan.limita != null ? <CasetaLimita text={plan.limita} l={l} /> : null}
        {plan.carduri.length ? <div class="chat-raps">{plan.carduri.map((rp) => <CartonasRaport rp={rp} l={l} />)}</div> : null}
        {plan.text ? <div class="insp-txt"><Md text={plan.text} /></div> : null}
        {plan.sursa ? <BlocSursa se={plan.sursa} /> : null}
        {plan.propunere ? <CartonasPropunere key={plan.propunere.id + ':' + plan.propunere.stare} p={plan.propunere} laButon={l.buton} onGata={(nou, urm) => l.propunere(m, plan.propunere.id, nou, urm)} /> : null}
        {plan.propuneri.map((q) => <CartonasPropunere key={q.id + ':' + q.stare} p={q} laButon={l.buton} onGata={(nou, urm) => l.propunere(m, q.id, nou, urm)} />)}
        {actiuni.length ? <div class="chat-prop-b chat-actiuni">{actiuni.map((b: any) => <ButonProp text={b.text || ''} ic={iconaFa(b.ic, 'arrowRight') as IconName} onClick={() => l.buton(b)} />)}</div> : null}
        {plan.probleme.length ? <Probleme lista={plan.probleme} l={l} /> : null}
        {plan.verificat ? <div class="chat-ok"><Icon name="circleCheck" size={14} />{plan.verificat}</div> : null}
        {plan.nota ? <div class="chat-nota">{plan.nota}</div> : null}
        {plan.alege.length ? (
          <div class="ins-alege">
            {plan.alege.map((a: any) => <button type="button" onClick={() => l.trimite(String(a.trimite || a.text || ''), { buton: true })}><Icon name="car" size={14} />{String(a.text || a.trimite || '')}</button>)}
          </div>
        ) : null}
        {plan.surse.length ? (
          <div class="insp-surse">
            {plan.surse.map((s: any) => <button type="button" class="chat-pas" title="Deschide raportul în Rapoarte" onClick={() => l.ruta(rutaRaport(s.type, s.imei))}><Icon name="report" size={14} />{textSursaRaport(s)}</button>)}
          </div>
        ) : null}
        <div class="chat-act">
          <button type="button" class="chat-ib" title="Copiază răspunsul" aria-label="Copiază răspunsul" onClick={() => copiaza(m.text)}><Icon name="copy" size={14} /></button>
          {plan.voteaza ? <>
            <button type="button" class={'chat-ib' + (m.feedback === 1 ? ' on' : '')} title="Răspuns bun" aria-label="Răspuns bun" onClick={() => l.nota(m, 1)}><Icon name="thumbsUp" size={14} /></button>
            <button type="button" class={'chat-ib' + (m.feedback === -1 ? ' on jos' : '')} title="Răspuns slab" aria-label="Răspuns slab" onClick={() => l.nota(m, -1)}><Icon name="thumbsDown" size={14} /></button>
          </> : null}
          {plan.dinRaport ? <span class="chat-din"><Icon name="circleCheck" size={13} />{plan.dinRaport}</span> : null}
        </div>
      </div>
    </div>
  );
}

// Întrebările de continuare, doar sub ULTIMUL răspuns (le scrie serverul, pe reguli). Apăsată, una pleacă pe butoane.
export function Urmari({ urmari, l }: { urmari: any[]; l: Laturi }) {
  return (
    <div class="chat-urm">
      {urmari.slice(0, 3).map((u) => <button type="button" onClick={() => l.trimite(String(u.trimite || u.text || ''), { buton: true })}><Icon name="cornerDown" size={13} />{String(u.text || u.trimite || '')}</button>)}
    </div>
  );
}
